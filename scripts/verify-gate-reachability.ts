// SPEC-B2C-LAUNCH-001 M3a (REQ-B2CLAUNCH-009, AC-B2CLAUNCH-009 시나리오 2) — 로컬 도달 관측.
//
// 상담 화면 플래그(ENABLE_CONSULT_FLOW)는 미설정이고 상담 접수 정책 플래그(CONSULT_POLICY_READY)만 참인 로컬 서버를
// 띄워, 화면이 닫혀 있어도 접수 API는 열려 있다는 사실(spec.md LF-07)을 관측한다. 관측은 셋이다.
//   1) /consult는 placeholder다.
//   2) 스키마를 통과하지만 동의 버전이 활성 정책 버전과 다른 POST /api/consultations는 409 consent_version_mismatch다
//      (503이 아니다).
//   3) 요청 전후 consultations 행 수가 같다.
// 이 관측은 게이트 함수·경로의 일반 검증이다. 운영 호스트에서의 노출 증거로 쓰지 않는다(acceptance.md AC-B2CLAUNCH-009).
//
// 안전 규칙:
//   - DB 주소가 "file:"로 시작하는 로컬 파일이 아니면 실행을 거부한다.
//   - 환경 파일을 읽지 않는다. 프로덕션 빌드·시작이 읽는 환경 파일이 프로젝트 루트에 있으면 자식 프로세스가 읽을 수
//     있으므로 그것도 실행을 거부한다(파일 이름만 확인하고 내용은 열지 않는다).
//   - 시크릿은 실행 시점에 만든 시험용 값이고, 플래그는 이 스크립트가 만든 자식 프로세스 환경 객체에만 둔다.
//     부모 프로세스 환경은 바꾸지 않는다.
//   - 원격 호스트에 접속하지 않는다. 요청은 서버가 알려 준 로컬 주소로만 보낸다.
//
// 실행: pnpm exec tsx scripts/verify-gate-reachability.ts (빌드 + 서버 시작이라 몇 분 걸린다)
//   종료 코드: 0 = 세 관측이 모두 기대와 같음, 1 = 불일치, 2 = 실행 거부(사전 점검 위반)

import { randomInt, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { extractTitle } from "./verify-flag-runtime.ts";
import { findRemoteDatabaseViolation } from "./visual-verify-db-guard.ts";
import { startManagedServer } from "./visual-verify-server.ts";

/** 부모 환경. process.env 또는 그와 모양이 같은 일반 객체(시험에서 합성한 환경). */
type EnvLike = Readonly<Record<string, string | undefined>>;

export const PLACEHOLDER_TEXT = "서비스 준비 중입니다";
export const CLOSED_TITLE = "서비스 준비 중";

const EXPECTED_API_STATUS = 409;
const EXPECTED_API_CODE = "consent_version_mismatch";

export interface GateReachabilityObservation {
  /** /consult 응답의 <title> */
  readonly consultTitle: string | null;
  /** /consult 응답 본문에 placeholder 문구가 있는가 */
  readonly consultHasPlaceholder: boolean;
  /** POST /api/consultations 응답 상태 코드 */
  readonly apiStatus: number;
  /** 응답 본문의 오류 코드(없으면 null) */
  readonly apiCode: string | null;
  readonly rowsBefore: number;
  readonly rowsAfter: number;
}

/** 기대와 다른 관측을 한국어 한 줄씩 돌려준다. 빈 배열이면 세 관측이 모두 기대와 같다. */
export function compareGateReachability(observed: GateReachabilityObservation): string[] {
  const mismatches: string[] = [];
  if (observed.consultTitle !== CLOSED_TITLE) {
    mismatches.push(
      `/consult 제목: 기대 "${CLOSED_TITLE}" / 관측 "${observed.consultTitle ?? "(없음)"}"`
    );
  }
  if (!observed.consultHasPlaceholder) {
    mismatches.push("/consult placeholder 문구: 기대 있음 / 관측 없음");
  }
  if (observed.apiStatus !== EXPECTED_API_STATUS) {
    mismatches.push(`API 상태: 기대 ${EXPECTED_API_STATUS} / 관측 ${observed.apiStatus}`);
  }
  if (observed.apiCode !== EXPECTED_API_CODE) {
    mismatches.push(
      `API 오류 코드: 기대 ${EXPECTED_API_CODE} / 관측 ${observed.apiCode ?? "(없음)"}`
    );
  }
  if (observed.rowsAfter !== observed.rowsBefore) {
    mismatches.push(
      `consultations 행 수: 기대 요청 전과 같음(${observed.rowsBefore}) / 관측 ${observed.rowsAfter}`
    );
  }
  return mismatches;
}

/** 관측과 기대를 한 줄씩 보여 주는 출력. 시크릿·DB 경로는 적지 않는다. */
export function formatGateReachabilityReport(observed: GateReachabilityObservation): string[] {
  const verdict = (ok: boolean) => (ok ? "OK" : "MISMATCH");
  return [
    "## 게이트 도달 로컬 관측 (AC-B2CLAUNCH-009 시나리오 2)",
    "시작 조합: ENABLE_CONSULT_FLOW=미설정, CONSULT_POLICY_READY=true, 시크릿=설정(값 미출력), DB=로컬 file",
    `- /consult 제목: 기대 "${CLOSED_TITLE}" / 관측 "${observed.consultTitle ?? "(없음)"}" ${verdict(observed.consultTitle === CLOSED_TITLE)}`,
    `- /consult placeholder 문구: 기대 있음 / 관측 ${observed.consultHasPlaceholder ? "있음" : "없음"} ${verdict(observed.consultHasPlaceholder)}`,
    `- POST /api/consultations 상태: 기대 ${EXPECTED_API_STATUS} / 관측 ${observed.apiStatus} ${verdict(observed.apiStatus === EXPECTED_API_STATUS)}`,
    `- POST /api/consultations 오류 코드: 기대 ${EXPECTED_API_CODE} / 관측 ${observed.apiCode ?? "(없음)"} ${verdict(observed.apiCode === EXPECTED_API_CODE)}`,
    `- consultations 행 수: 기대 요청 전과 같음 / 관측 전 ${observed.rowsBefore} 후 ${observed.rowsAfter} ${verdict(observed.rowsAfter === observed.rowsBefore)}`,
  ];
}

// verify-flag-runtime.ts의 FLAG_KEY_RE와 같은 목록이다(그쪽은 export하지 않아 따로 적었다).
const FLAG_KEY_RE =
  /^(TURSO_|ENABLE_|CONSULT_|DIAGNOSIS_|RATE_LIMIT_|LLM_PROVIDER_|GEMINI_|PORT$|HOSTNAME$)/;

/**
 * 자식(빌드·서버) 프로세스의 환경을 새 객체로 만든다. 부모의 DB·플래그·시크릿·키 계열 변수는 물려주지 않고
 * 상담 접수 정책 플래그만 참으로 둔다. 부모 환경 객체는 바꾸지 않는다.
 */
export function assembleGateReachabilityEnv(
  parentEnv: EnvLike,
  options: { dbUrl: string; secret: string }
): NodeJS.ProcessEnv {
  const parentViolation = findRemoteDatabaseViolation(parentEnv);
  if (parentViolation) throw new Error(parentViolation);
  if (!options.dbUrl.startsWith("file:")) {
    throw new Error('시험 DB 주소가 "file:"로 시작하는 로컬 파일이 아니다 — 실행을 거부한다');
  }
  if (options.secret === "") {
    throw new Error(
      "시험용 시크릿이 비어 있다 — 비어 있으면 앱이 시크릿이 설정되지 않은 것으로 읽는다"
    );
  }

  const env = { ...parentEnv } as NodeJS.ProcessEnv;
  for (const key of Object.keys(env)) {
    if (FLAG_KEY_RE.test(key)) delete env[key];
  }
  env.TURSO_DATABASE_URL = options.dbUrl;
  env.TURSO_AUTH_TOKEN = "";
  env.LLM_PROVIDER_MODE = "deterministic";
  env.CONSULT_POLICY_READY = "true";
  env.RATE_LIMIT_HMAC_SECRET = options.secret;

  const violation = findRemoteDatabaseViolation(env);
  if (violation) throw new Error(violation);
  return env;
}

// Next.js 프로덕션 빌드·시작이 프로젝트 루트에서 읽는 환경 파일 이름(우선순위 높은 순). 예시 파일
// (.env.local.example)은 읽지 않는다.
const NEXT_PRODUCTION_ENV_FILES = [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
];

/** 자식 프로세스가 읽을 수 있는 환경 파일이 있으면 위반 사유(파일 이름만)를, 없으면 null을 돌려준다. */
export function findEnvFileViolation(
  projectRoot: string,
  exists: (filePath: string) => boolean = existsSync
): string | null {
  const found = NEXT_PRODUCTION_ENV_FILES.filter((name) => exists(path.join(projectRoot, name)));
  if (found.length === 0) return null;
  return (
    `[verify-gate-reachability] 실행을 거부합니다 — 프로덕션 빌드·시작이 읽는 환경 파일이 프로젝트 루트에 있습니다(${found.join(", ")}). ` +
    "이 스크립트는 환경 파일을 읽지 않으며 자식 프로세스도 읽지 못하도록 해당 파일이 없는 작업 트리에서만 실행합니다."
  );
}

/** 실행 전에 확인하는 위반 사유 목록(환경 파일, 원격 DB 주소). 빈 배열이면 실행해도 된다. */
export function checkPreconditions(
  parentEnv: EnvLike,
  projectRoot: string,
  exists: (filePath: string) => boolean = existsSync
): string[] {
  return [findEnvFileViolation(projectRoot, exists), findRemoteDatabaseViolation(parentEnv)].filter(
    (violation): violation is string => violation !== null
  );
}

/** 오류 응답 본문의 `code`. JSON이 아니거나 문자열 code가 없으면 null. */
export function extractApiCode(bodyText: string): string | null {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const code = (parsed as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
  } catch {
    // JSON이 아니면 코드 없음이다.
  }
  return null;
}

/**
 * 스키마를 통과하지만 acknowledgedConsentVersion이 활성 정책 버전과 다른 요청 본문. 모든 값은 호출마다 실행
 * 시점에 새로 만든다(고정 리터럴이 아니다 — AC-B2CLAUNCH-007). 동의 버전은 무작위 접두사를 붙여 어떤 정책 버전과도
 * 같을 수 없다.
 */
export function buildMismatchProbe(): Record<string, unknown> {
  const tag = randomUUID();
  const digits = () => String(randomInt(0, 10_000)).padStart(4, "0");
  return {
    resultId: `gate-reachability-${tag}`,
    channel: "kakao",
    name: `검증-${tag.slice(0, 8)}`,
    contact: `010-${digits()}-${digits()}`,
    consent: { piiCollection: true, healthInfoUse: true, marketing: false },
    acknowledgedConsentVersion: `mismatch-${tag}`,
    idempotencyKey: randomUUID(),
  };
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(PROJECT_ROOT, ".moai", "state", "verify", "gate-reachability");
const DB_FILE = path.join(PROJECT_ROOT, ".tmp", "gate-reachability.db");
// 서버·마이그레이션·행 수 조회가 같은 파일을 가리키도록 절대 경로를 쓴다.
const DB_URL = `file:${DB_FILE.replaceAll("\\", "/")}`;

function runPnpm(args: string[], env: NodeJS.ProcessEnv, logFile: string): number {
  const result = spawnSync("pnpm", args, {
    cwd: PROJECT_ROOT,
    env,
    shell: true,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(logFile, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result.status ?? 1;
}

async function countConsultations(): Promise<number> {
  const client = createClient({ url: DB_URL });
  try {
    const result = await client.execute("SELECT count(*) AS n FROM consultations");
    return Number(result.rows[0].n);
  } finally {
    client.close();
  }
}

async function observe(baseURL: string): Promise<GateReachabilityObservation> {
  const consultHtml = await (await fetch(`${baseURL}/consult`)).text();
  const rowsBefore = await countConsultations();
  const api = await fetch(`${baseURL}/api/consultations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildMismatchProbe()),
  });
  const apiText = await api.text();
  const rowsAfter = await countConsultations();
  return {
    consultTitle: extractTitle(consultHtml),
    consultHasPlaceholder: consultHtml.includes(PLACEHOLDER_TEXT),
    apiStatus: api.status,
    apiCode: extractApiCode(apiText),
    rowsBefore,
    rowsAfter,
  };
}

export async function main(): Promise<number> {
  const violations = checkPreconditions(process.env, PROJECT_ROOT);
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    return 2;
  }

  const env = assembleGateReachabilityEnv(process.env, {
    dbUrl: DB_URL,
    secret: `gate-test-${randomUUID()}`,
  });

  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(path.dirname(DB_FILE), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${suffix}`, { force: true });

  const migrateCode = runPnpm(["db:migrate"], env, path.join(LOG_DIR, "migrate.log"));
  if (migrateCode !== 0) throw new Error(`db:migrate 실패(exit ${migrateCode})`);
  const buildCode = runPnpm(["build"], env, path.join(LOG_DIR, "build.log"));
  if (buildCode !== 0) throw new Error(`pnpm build 실패(exit ${buildCode}) — 로그: ${LOG_DIR}`);

  const managed = await startManagedServer({
    readyTimeoutMs: 60_000,
    spawnOnPort: (port) =>
      spawn("pnpm", ["start"], {
        cwd: PROJECT_ROOT,
        env: { ...env, PORT: String(port) },
        shell: true,
        stdio: "ignore",
      }),
  });
  let observed: GateReachabilityObservation;
  try {
    observed = await observe(managed.baseURL);
  } finally {
    managed.stop();
  }

  const mismatches = compareGateReachability(observed);
  console.log(
    [...formatGateReachabilityReport(observed), `불일치 관측 합계: ${mismatches.length}`].join("\n")
  );
  return mismatches.length === 0 ? 0 : 1;
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error("verify-gate-reachability 실행 실패:", error);
      process.exitCode = 1;
    }
  );
}
