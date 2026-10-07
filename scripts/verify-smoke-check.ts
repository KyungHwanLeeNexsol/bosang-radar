// SPEC-B2C-LAUNCH-001 M4 (REQ-B2CLAUNCH-013, AC-B2CLAUNCH-013) — smoke 검사의 로컬 일곱 상태 관측.
//
// AC가 적은 일곱 서버에 실제 smoke CLI(scripts/smoke-check.ts)를 돌리고 기대와 관측을 한 줄씩 보여 준다.
//   (가)~(라): 로컬 file DB로 시작한 실제 Next 프로덕션 서버(진단 게이트 닫힘 / production 경로 / review 경로 / 둘 다)
//   (마)(바)(사): 임시 HTTP 서버(정상 응답·HTTP 500·CSS 청크 없음/404)
// 종료 코드와 함께, 정보로만 출력하는 게이트 상태가 기대와 같은지도 기록한다(판정에 쓰는 값은 종료 코드뿐이다).
//
// 안전 규칙(scripts/verify-gate-reachability.ts와 같다):
//   - DB 주소가 "file:"로 시작하는 로컬 파일이 아니면 실행을 거부한다.
//   - 프로덕션 빌드·시작이 읽는 환경 파일(.env 등)이 프로젝트 루트에 있으면 실행을 거부한다(이름만 확인한다).
//   - 시크릿은 실행 시점에 만든 시험용 값이고 플래그는 자식 프로세스 환경 객체에만 둔다. 부모 환경은 바꾸지 않는다.
//   - 원격 호스트에 접속하지 않는다. 요청은 서버가 알려 준 로컬 주소로만 보낸다.
//
// 실행: pnpm exec tsx scripts/verify-smoke-check.ts (빌드 + 서버 네 번 기동이라 몇 분 걸린다)
//   종료 코드: 0 = 모든 상태가 기대와 같음, 1 = 불일치, 2 = 실행 거부(사전 점검 위반)

import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GATE_CLOSED_MARKER, GATE_STATE_LABEL, type GateState } from "../lib/launch/smoke-check";
import { checkPreconditions } from "./verify-gate-reachability.ts";
import { findRemoteDatabaseViolation } from "./visual-verify-db-guard.ts";
import { isUnsafePort, startManagedServer } from "./visual-verify-server.ts";

export interface DiagnosisFlagSet {
  readonly flow: boolean;
  readonly engine: boolean;
  readonly dev: boolean;
}

export type TempServerKind =
  "ok-open" | "ok-closed" | "http-500" | "no-css-reference" | "css-404" | "redirect-302";

export interface SmokeStateCase {
  readonly id: string;
  readonly label: string;
  readonly source:
    | { readonly kind: "next"; readonly diag: DiagnosisFlagSet }
    | { readonly kind: "temp"; readonly server: TempServerKind };
  readonly expectedExit: 0 | 1;
  /** 정보용으로 관측되는 게이트 상태의 기대. 판정이 아니라 기록이다. */
  readonly expectedGate: GateState;
}

export interface StateObservation {
  readonly exitCode: number;
  readonly gateState: GateState | null;
}

export interface TempServer {
  readonly baseUrl: string;
  stop(): Promise<void>;
}

const NONE: DiagnosisFlagSet = { flow: false, engine: false, dev: false };
const PRODUCTION_PATH: DiagnosisFlagSet = { flow: true, engine: true, dev: false };
const REVIEW_PATH: DiagnosisFlagSet = { flow: false, engine: false, dev: true };
const BOTH: DiagnosisFlagSet = { flow: true, engine: true, dev: true };

/**
 * AC-B2CLAUNCH-013의 일곱 상태. D-LAUNCH-06 설계 (a)는 기대 상태 입력이 없어(두 상태 수용) (마)의
 * "설계가 기대하는 구성과 반대 상태"가 하나로 정해지지 않는다 — 열림 표지와 닫힘 표지 두 방향을 모두 관측한다
 * (마-1, 마-2). (사)도 참조 없음과 청크 404 두 가지다.
 */
export const SMOKE_STATES: readonly SmokeStateCase[] = [
  {
    id: "가",
    label: "진단 게이트 닫힘(플래그 미설정, 변경을 싣는 배포의 상태) — 실제 서버",
    source: { kind: "next", diag: NONE },
    expectedExit: 0,
    expectedGate: "closed",
  },
  {
    id: "나",
    label: "production 경로로 열림(ENABLE_DIAGNOSIS_FLOW·DIAGNOSIS_ENGINE_READY) — 실제 서버",
    source: { kind: "next", diag: PRODUCTION_PATH },
    expectedExit: 0,
    expectedGate: "open",
  },
  {
    id: "다",
    label: "review 경로로만 열림(ENABLE_DIAGNOSIS_DEV_STATES) — 실제 서버",
    source: { kind: "next", diag: REVIEW_PATH },
    expectedExit: 0,
    expectedGate: "open",
  },
  {
    id: "라",
    label: "두 경로 모두 열림 — 실제 서버",
    source: { kind: "next", diag: BOTH },
    expectedExit: 0,
    expectedGate: "open",
  },
  {
    id: "마-1",
    label: "정상 응답, 열림 표지(placeholder 없음) — 임시 서버",
    source: { kind: "temp", server: "ok-open" },
    expectedExit: 0,
    expectedGate: "open",
  },
  {
    id: "마-2",
    label: "정상 응답, 닫힘 표지(placeholder 있음) — 임시 서버",
    source: { kind: "temp", server: "ok-closed" },
    expectedExit: 0,
    expectedGate: "closed",
  },
  {
    id: "바",
    label: "HTTP 500 — 임시 서버",
    source: { kind: "temp", server: "http-500" },
    expectedExit: 1,
    expectedGate: "unknown",
  },
  {
    id: "사-1",
    label: "200이지만 CSS 청크 참조가 없음 — 임시 서버",
    source: { kind: "temp", server: "no-css-reference" },
    expectedExit: 1,
    expectedGate: "open",
  },
  {
    id: "사-2",
    label: "200이고 CSS 청크를 참조하지만 청크가 404 — 임시 서버",
    source: { kind: "temp", server: "css-404" },
    expectedExit: 1,
    expectedGate: "closed",
  },
];

// verify-flag-runtime.ts·verify-gate-reachability.ts의 FLAG_KEY_RE와 같은 목록이다(두 파일 모두 export하지 않는다).
const FLAG_KEY_RE =
  /^(TURSO_|ENABLE_|CONSULT_|DIAGNOSIS_|RATE_LIMIT_|LLM_PROVIDER_|GEMINI_|PORT$|HOSTNAME$)/;

// 진단 플래그 이름 표. 변수 이름을 표로 두고 반복으로 대입한다 — 엔진 준비 변수를 참으로 두는 대입 줄을 이
// 파일에 직접 적으면 M3b 저장소 코드 오라클(lib/launch/engine-ready-oracle)의 허용 목록 밖 줄로 잡힌다. 허용
// 목록(M3b 시험)을 이 단위에서 고치지 않아 표 형태로 적었고, 이 하네스가 로컬 시험 서버에만 쓴다는 사실은
// assembleSmokeStateEnv의 거부 규칙(원격 DB·file: 아님)이 지킨다. progress.md M4 발견에 적었다.
const DIAGNOSIS_FLAG_ENV: Readonly<Record<keyof DiagnosisFlagSet, string>> = {
  flow: "ENABLE_DIAGNOSIS_FLOW",
  engine: "DIAGNOSIS_ENGINE_READY",
  dev: "ENABLE_DIAGNOSIS_DEV_STATES",
};

/**
 * 자식(빌드·서버) 프로세스의 환경을 새 객체로 만든다. 부모의 DB·플래그·시크릿·키 계열 변수는 물려주지 않고
 * 진단 플래그는 참인 것만 둔다(닫힘 상태 = 플래그 미설정). 상담 플래그는 두지 않는다. 부모 환경은 바꾸지 않는다.
 */
export function assembleSmokeStateEnv(
  parentEnv: Readonly<Record<string, string | undefined>>,
  options: { dbUrl: string; secret: string; diag: DiagnosisFlagSet }
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
  env.RATE_LIMIT_HMAC_SECRET = options.secret;
  for (const key of Object.keys(DIAGNOSIS_FLAG_ENV) as (keyof DiagnosisFlagSet)[]) {
    if (options.diag[key]) env[DIAGNOSIS_FLAG_ENV[key]] = "true";
  }

  const violation = findRemoteDatabaseViolation(env);
  if (violation) throw new Error(violation);
  return env;
}

const FIXTURE_CSS_PATH = "/_next/static/chunks/fixture-asset.css";

function pageHtml(marker: "open" | "closed", withCss: boolean): string {
  const head = withCss ? `<link rel="stylesheet" href="${FIXTURE_CSS_PATH}"/>` : "";
  const body = marker === "closed" ? `<h1>${GATE_CLOSED_MARKER}</h1>` : "<main>fixture-open</main>";
  return `<!DOCTYPE html><html><head><title>fixture</title>${head}</head><body>${body}</body></html>`;
}

function handlerFor(kind: TempServerKind): http.RequestListener {
  return (request, response) => {
    const pathname = request.url?.split("?")[0] ?? "/";
    const send = (
      status: number,
      type: string,
      body: string,
      headers: http.OutgoingHttpHeaders = {}
    ) => {
      response.writeHead(status, { "content-type": type, ...headers });
      response.end(body);
    };
    const html = (marker: "open" | "closed", withCss: boolean) =>
      send(200, "text/html; charset=utf-8", pageHtml(marker, withCss));

    if (kind === "http-500") return send(500, "text/plain", "fixture-error");
    if (kind === "redirect-302") {
      return pathname === "/"
        ? send(302, "text/plain", "", { location: "/elsewhere" })
        : send(404, "text/plain", "");
    }
    if (pathname === "/") {
      if (kind === "ok-open") return html("open", true);
      if (kind === "ok-closed") return html("closed", true);
      if (kind === "no-css-reference") return html("open", false);
      return html("closed", true); // css-404: 청크를 참조하지만 서빙하지 않는다
    }
    if (pathname === FIXTURE_CSS_PATH && (kind === "ok-open" || kind === "ok-closed")) {
      return send(200, "text/css", "/* fixture */");
    }
    return send(404, "text/plain", "");
  };
}

/** 루프백에서만 듣는 임시 HTTP 서버. Node fetch가 거부하는 금지 포트가 걸리면 다시 고른다. */
export async function startTempServer(kind: TempServerKind): Promise<TempServer> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = http.createServer(handlerFor(kind));
    const port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
    });
    if (isUnsafePort(port)) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      continue;
    }
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      stop: () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    };
  }
  throw new Error("임시 서버가 금지 포트가 아닌 포트를 얻지 못했다");
}

/** 기대와 다른 관측을 한국어 한 줄씩 돌려준다. 빈 배열이면 기대와 같다. */
export function compareStateObservation(
  state: SmokeStateCase,
  observed: StateObservation
): string[] {
  const mismatches: string[] = [];
  if (observed.exitCode !== state.expectedExit) {
    mismatches.push(`종료 코드: 기대 ${state.expectedExit} / 관측 ${observed.exitCode}`);
  }
  if (observed.gateState !== state.expectedGate) {
    mismatches.push(
      `게이트 상태(정보용): 기대 ${GATE_STATE_LABEL[state.expectedGate]} / 관측 ${
        observed.gateState === null ? "(출력에 없음)" : GATE_STATE_LABEL[observed.gateState]
      }`
    );
  }
  return mismatches;
}

/** CLI 출력의 정보용 게이트 상태 줄에서 상태를 읽는다. 줄이 없으면 null. */
export function extractObservedGate(output: string): GateState | null {
  const match = /진단 게이트 상태\(정보용[^)]*\): (닫힘|열림|알 수 없음)/.exec(output);
  if (!match) return null;
  const found = (Object.keys(GATE_STATE_LABEL) as GateState[]).find(
    (state) => GATE_STATE_LABEL[state] === match[1]
  );
  return found ?? null;
}

/** 상태별 기대와 관측을 표로, 그 뒤에 CLI 출력 원문을 상태별로 적는다. 시크릿·DB 경로는 적지 않는다. */
export function formatStateTable(
  rows: readonly { state: SmokeStateCase; observed: StateObservation; output: string }[]
): string[] {
  const gate = (state: GateState | null) => (state === null ? "(없음)" : GATE_STATE_LABEL[state]);
  let mismatchCount = 0;
  const tableRows = rows.map(({ state, observed }) => {
    const mismatches = compareStateObservation(state, observed);
    mismatchCount += mismatches.length;
    const verdict = mismatches.length === 0 ? "OK" : `MISMATCH (${mismatches.join("; ")})`;
    return `| (${state.id}) | ${state.label} | ${state.expectedExit} / ${gate(state.expectedGate)} | ${observed.exitCode} / ${gate(observed.gateState)} | ${verdict} |`;
  });
  const outputs = rows.flatMap(({ state, output }) => [
    "",
    `### (${state.id}) smoke CLI 출력`,
    ...output
      .split(/\r?\n/)
      .filter((line) => line !== "")
      .map((line) => `    ${line}`),
  ]);
  return [
    "## smoke 검사 로컬 상태 관측 (AC-B2CLAUNCH-013)",
    "| 상태 | 설명 | 기대(종료 코드 / 게이트·정보) | 관측(종료 코드 / 게이트·정보) | 판정 |",
    "|---|---|---|---|---|",
    ...tableRows,
    `불일치 관측 합계: ${mismatchCount}`,
    ...outputs,
  ];
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(PROJECT_ROOT, ".moai", "state", "verify", "smoke-check");
const DB_FILE = path.join(PROJECT_ROOT, ".tmp", "smoke-check.db");
// 서버·마이그레이션이 같은 파일을 가리키도록 절대 경로를 쓴다.
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

/** 실제 smoke CLI를 자식 프로세스로 돌린다. 서버가 같은 프로세스에 있을 수 있어 비동기로 기다린다. */
function runSmokeCli(baseUrl: string): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.SMOKE_BASE_URL;
    const child = spawn(
      "pnpm",
      [
        "exec",
        "tsx",
        "scripts/smoke-check.ts",
        `--base-url=${baseUrl}`,
        "--attempts=2",
        "--retry-delay-ms=200",
      ],
      { cwd: PROJECT_ROOT, env, shell: true }
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf-8")));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf-8")));
    child.once("error", reject);
    child.once("close", (code) => resolve({ exitCode: code ?? 1, output }));
  });
}

async function observeState(
  state: SmokeStateCase,
  dbUrl: string,
  secret: string
): Promise<{ observed: StateObservation; output: string }> {
  const run = async (baseUrl: string) => {
    const { exitCode, output } = await runSmokeCli(baseUrl);
    return { observed: { exitCode, gateState: extractObservedGate(output) }, output };
  };

  if (state.source.kind === "temp") {
    const server = await startTempServer(state.source.server);
    try {
      return await run(server.baseUrl);
    } finally {
      await server.stop();
    }
  }

  const env = assembleSmokeStateEnv(process.env, { dbUrl, secret, diag: state.source.diag });
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
  try {
    return await run(managed.baseURL);
  } finally {
    managed.stop();
  }
}

export async function main(): Promise<number> {
  const violations = checkPreconditions(process.env, PROJECT_ROOT);
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    return 2;
  }

  const secret = `smoke-test-${randomUUID()}`;
  // 빌드·마이그레이션은 플래그가 모두 미설정인 환경이다. 게이트는 요청 시점에 읽으므로(force-dynamic) 서버 시작 환경이 상태를 정한다.
  const buildEnv = assembleSmokeStateEnv(process.env, { dbUrl: DB_URL, secret, diag: NONE });

  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(path.dirname(DB_FILE), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${suffix}`, { force: true });

  const migrateCode = runPnpm(["db:migrate"], buildEnv, path.join(LOG_DIR, "migrate.log"));
  if (migrateCode !== 0) throw new Error(`db:migrate 실패(exit ${migrateCode})`);
  const buildCode = runPnpm(["build"], buildEnv, path.join(LOG_DIR, "build.log"));
  if (buildCode !== 0) throw new Error(`pnpm build 실패(exit ${buildCode}) — 로그: ${LOG_DIR}`);

  const rows: { state: SmokeStateCase; observed: StateObservation; output: string }[] = [];
  for (const state of SMOKE_STATES) {
    const { observed, output } = await observeState(state, DB_URL, secret);
    rows.push({ state, observed, output });
  }

  const lines = formatStateTable(rows);
  console.log(lines.join("\n"));
  const mismatchTotal = rows.reduce(
    (sum, { state, observed }) => sum + compareStateObservation(state, observed).length,
    0
  );
  return mismatchTotal === 0 ? 0 : 1;
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error("verify-smoke-check 실행 실패:", error);
      process.exitCode = 1;
    }
  );
}
