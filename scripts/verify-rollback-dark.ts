// SPEC-B2C-LAUNCH-001 M5 (REQ-B2CLAUNCH-014, AC-B2CLAUNCH-014) — 롤백 로컬 시험.
//
// 로컬 서버를 열린 벡터(진단 production 경로 열림, 상담 화면·접수 열림, 시험용 시크릿)로 시작해 합성 접수 1건을
// 저장한 뒤, 5종 플래그를 true가 아닌 값으로 되돌려 다시 시작한 서버(롤백)에서 아래를 관측한다.
//   1) /·/result·/consult가 모두 placeholder다.
//   2) 스키마를 통과하는 POST /api/consultations가 503 policy_unavailable이다(요청은 접수 행을 만들지 않는다).
//   3) 저장된 합성 행은 행 수와 전체 열 해시가 롤백 전과 같다.
//   4) 롤백 재시작에 넘긴 환경에서 5종 플래그가 true가 아니고 시크릿은 설정 상태다(설정 여부만 읽는다).
// 이 관측은 게이트 함수·경로의 로컬 검증이다. 운영 PM2가 바뀐 환경을 다시 읽는지, 이후 배포의 평범한 재시작이
// dark 상태를 유지하는지는 보지 못한다(R-04, CONSULTOPS-001 E-03). 운영 호스트에서의 증거로 쓰지 않는다.
//
// 안전 규칙(환경 조립은 verify-flag-runtime.ts의 assembleEnv를, 사전 점검은 verify-gate-reachability.ts의
// checkPreconditions를 재사용한다):
//   - DB 주소가 "file:"로 시작하는 로컬 파일이 아니면 실행을 거부한다.
//   - 환경 파일을 읽지 않는다. 프로덕션 빌드·시작이 읽는 환경 파일이 프로젝트 루트에 있으면 실행을 거부한다
//     (파일 이름만 확인하고 내용은 열지 않는다).
//   - 시크릿은 실행 시점에 만든 시험용 값이고 플래그는 이 스크립트가 만든 자식 프로세스 환경 객체에만 둔다.
//     부모 프로세스 환경은 바꾸지 않는다.
//   - 원격 호스트에 접속하지 않는다. 요청은 서버가 알려 준 로컬 주소로만 보낸다.
//
// 실행: pnpm exec tsx scripts/verify-rollback-dark.ts (빌드 + 서버 두 번 기동이라 몇 분 걸린다)
//   종료 코드: 0 = 관측이 모두 기대와 같음, 1 = 불일치, 2 = 실행 거부(사전 점검 위반)
// 다른 verify 스크립트와 동시에 실행하지 않는다(`.next` 빌드 폴더를 같이 쓴다).

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { CONSENT_POLICY_VERSION } from "../lib/consult/consent-policy";
import {
  CLOSED_PAGES,
  formatRollbackReport,
  compareRollbackObservation,
  hashConsultationRows,
  inspectRollbackEnv,
  type ClosedPage,
  type PageObservation,
  type RollbackObservation,
} from "../lib/launch/rollback-observation";
import { GATE_CLOSED_MARKER } from "../lib/launch/smoke-check";
import { assembleEnv, extractTitle, runPnpm, type FlagScenario } from "./verify-flag-runtime.ts";
import {
  buildMismatchProbe,
  checkPreconditions,
  extractApiCode,
} from "./verify-gate-reachability.ts";
import { findRemoteDatabaseViolation } from "./visual-verify-db-guard.ts";
import { startManagedServer } from "./visual-verify-server.ts";

// 열린 벡터: 진단 production 경로(`flow`·`engine`)와 상담 화면·접수. review 경로(`dev`)는 열지 않는다.
const OPEN_VECTOR: FlagScenario = {
  label: "rollback-open",
  consult: true,
  policy: true,
  diag: { flow: true, engine: true, dev: false },
};

// 롤백 벡터(dark): 5종 플래그가 모두 거짓 문자열이다(`true`가 아닌 값).
const DARK_VECTOR: FlagScenario = {
  label: "rollback-dark",
  consult: false,
  policy: false,
  diag: { flow: false, engine: false, dev: false },
};

/**
 * 열린 벡터 환경과 롤백(dark) 환경을 만든다. 환경 조립(부모의 원격 DB·플래그·시크릿 제거, 플래그 대입)은 assembleEnv가
 * 하고, 이 함수는 DB를 절대 경로 로컬 file 주소로, 시크릿을 실행 시점에 만든 시험용 값으로 바꾼다. 두 환경이 같은
 * 시크릿을 받는다 — 롤백은 시크릿을 지우지 않는다. 부모 환경은 바꾸지 않는다.
 */
export function assembleRollbackEnvs(options: { dbUrl: string; secret: string }): {
  open: NodeJS.ProcessEnv;
  dark: NodeJS.ProcessEnv;
} {
  if (!options.dbUrl.startsWith("file:")) {
    throw new Error('시험 DB 주소가 "file:"로 시작하는 로컬 파일이 아니다 — 실행을 거부한다');
  }
  if (options.secret === "") {
    throw new Error(
      "시험용 시크릿이 비어 있다 — 비어 있으면 앱이 시크릿이 설정되지 않은 것으로 읽는다"
    );
  }

  const finish = (scenario: FlagScenario): NodeJS.ProcessEnv => {
    const env = assembleEnv(scenario);
    env.TURSO_DATABASE_URL = options.dbUrl;
    env.RATE_LIMIT_HMAC_SECRET = options.secret;
    const violation = findRemoteDatabaseViolation(env);
    if (violation) throw new Error(violation);
    return env;
  };
  return { open: finish(OPEN_VECTOR), dark: finish(DARK_VECTOR) };
}

/**
 * 열린 서버에 저장할 합성 접수 요청 본문. 스키마를 통과하고 동의 버전이 활성 정책 버전과 같아 접수된다. 값은 호출마다
 * 실행 시점에 새로 만든다(고정 리터럴이 아니다 — AC-B2CLAUNCH-007).
 */
export function buildSeedProbe(): Record<string, unknown> {
  return {
    ...buildMismatchProbe(),
    resultId: `rollback-dark-${randomUUID()}`,
    acknowledgedConsentVersion: CONSENT_POLICY_VERSION,
  };
}

/** DB 결과(열 이름 + 값 배열)를 열 이름이 붙은 행 객체로 바꾼다. */
export function toRecords(
  columns: readonly string[],
  rows: readonly (readonly unknown[])[]
): Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index]]))
  );
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(PROJECT_ROOT, ".moai", "state", "verify", "rollback-dark");
const DB_FILE = path.join(PROJECT_ROOT, ".tmp", "rollback-dark.db");
// 서버·마이그레이션·행 조회가 같은 파일을 가리키도록 절대 경로를 쓴다.
const DB_URL = `file:${DB_FILE.replaceAll("\\", "/")}`;

function startServer(env: NodeJS.ProcessEnv) {
  return startManagedServer({
    readyTimeoutMs: 60_000,
    spawnOnPort: (port) =>
      spawn("pnpm", ["start"], {
        cwd: PROJECT_ROOT,
        env: { ...env, PORT: String(port) },
        shell: true,
        stdio: "ignore",
      }),
  });
}

async function observePages(baseURL: string): Promise<Record<ClosedPage, PageObservation>> {
  const pages = {} as Record<ClosedPage, PageObservation>;
  for (const route of CLOSED_PAGES) {
    const html = await (await fetch(`${baseURL}${route}`)).text();
    pages[route] = { title: extractTitle(html), hasPlaceholder: html.includes(GATE_CLOSED_MARKER) };
  }
  return pages;
}

async function postConsultation(
  baseURL: string,
  body: Record<string, unknown>
): Promise<{ status: number; code: string | null }> {
  const response = await fetch(`${baseURL}/api/consultations`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify(body),
  });
  return { status: response.status, code: extractApiCode(await response.text()) };
}

async function snapshotRows(): Promise<{ count: number; hash: string }> {
  const client = createClient({ url: DB_URL });
  try {
    const result = await client.execute("SELECT * FROM consultations");
    const records = toRecords(
      result.columns,
      result.rows.map((row) => result.columns.map((_, index) => row[index]))
    );
    return { count: records.length, hash: hashConsultationRows(records) };
  } finally {
    client.close();
  }
}

export async function main(): Promise<number> {
  const violations = checkPreconditions(process.env, PROJECT_ROOT);
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    return 2;
  }

  const { open, dark } = assembleRollbackEnvs({
    dbUrl: DB_URL,
    secret: `rollback-test-${randomUUID()}`,
  });

  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(path.dirname(DB_FILE), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${suffix}`, { force: true });

  // 빌드·마이그레이션은 롤백(dark) 환경이다. 게이트는 요청 시점에 읽으므로(force-dynamic) 서버 시작 환경이 상태를 정한다.
  const migrateCode = runPnpm(["db:migrate"], dark, path.join(LOG_DIR, "migrate.log"));
  if (migrateCode !== 0) throw new Error(`db:migrate 실패(exit ${migrateCode})`);
  const buildCode = runPnpm(["build"], dark, path.join(LOG_DIR, "build.log"));
  if (buildCode !== 0) throw new Error(`pnpm build 실패(exit ${buildCode}) — 로그: ${LOG_DIR}`);

  // 1) 열린 벡터로 시작하고 합성 접수 1건을 저장한다.
  const openServer = await startServer(open);
  let openObservation: RollbackObservation["open"];
  try {
    const pages = await observePages(openServer.baseURL);
    const seed = await postConsultation(openServer.baseURL, buildSeedProbe());
    openObservation = { seedStatus: seed.status, pages };
  } finally {
    openServer.stop();
  }
  const before = await snapshotRows();

  // 2) 롤백: 5종 플래그를 true가 아닌 값으로 되돌린 환경으로 다시 시작한다.
  const darkServer = await startServer(dark);
  let pages: Record<ClosedPage, PageObservation>;
  let api: { status: number; code: string | null };
  try {
    pages = await observePages(darkServer.baseURL);
    // 스키마를 통과하지만 동의 버전이 다른 요청 — 접수 행을 만들지 않는 요청이다(AC-B2CLAUNCH-009 시나리오 2).
    api = await postConsultation(darkServer.baseURL, buildMismatchProbe());
  } finally {
    darkServer.stop();
  }
  const after = await snapshotRows();

  const rollbackEnv = inspectRollbackEnv(dark);
  const observed: RollbackObservation = {
    open: openObservation,
    rowsBefore: before.count,
    hashBefore: before.hash,
    pages,
    apiStatus: api.status,
    apiCode: api.code,
    rowsAfter: after.count,
    hashAfter: after.hash,
    flagsStillTrue: rollbackEnv.flagsStillTrue,
    secretConfigured: rollbackEnv.secretConfigured,
  };

  console.log(formatRollbackReport(observed).join("\n"));
  return compareRollbackObservation(observed).length === 0 ? 0 : 1;
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error("verify-rollback-dark 실행 실패:", error);
      process.exitCode = 1;
    }
  );
}
