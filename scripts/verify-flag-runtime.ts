// SPEC-B2C-CONSULT-001 D-NEW-18 — 빌드 시점과 런타임의 플래그 불일치 회귀 검사.
//
// 배경: app/consult/page.tsx, app/result/page.tsx는 서버 컴포넌트에서
// process.env(ENABLE_CONSULT_FLOW 등)를 읽는다. 이 페이지가 `next build`에서
// 정적으로 프리렌더되면 플래그 값이 빌드 시점에 굳고, 요청 시점에 env를 읽는
// POST /api/consultations(CONSULT_POLICY_READY)와 서로 다른 값을 보게 된다.
//
// 이 스크립트는 실제 `next build` → 반대(또는 다른) env로 서버를 시작해
// 페이지가 보여 주는 상태와 API 응답이 시작 시점 env와 일치하는지 확인한다.
// 시작 env와 어긋나는 관측이 하나라도 있으면 종료 코드 1로 끝난다.
//
// SPEC-B2C-CONSULT-001 D-NEW-21 — 진단 게이트(ENABLE_DIAGNOSIS_FLOW ·
// DIAGNOSIS_ENGINE_READY · ENABLE_DIAGNOSIS_DEV_STATES)도 같은 방식으로 검사한다.
// `/`와 `/result`가 같은 시작 env에서 같은 게이트 상태(진단 플로우 / "서비스 준비 중"
// placeholder)를 보여야 하고, 그 상태가 시작 시점 env로 계산한
// computeDiagnosisFlags 결과와 같아야 한다.
//
// 안전: 모든 빌드/기동은 로컬 file: DB만 쓴다. 부모 셸의 TURSO_*/플래그 계열 env는
// 물려받지 않고, 최종 env가 file: 이 아니면 실행을 거부한다. 서버는 반드시 종료한다.
//
// 실행: pnpm verify:flag-runtime [--observe] [--build=closed|open] [--server=next-start|standalone]
//   --observe   불일치가 있어도 종료 코드 0(표만 출력)
//   --build=…   빌드 하나만 검증(기본은 closed/open 둘 다, 각 빌드마다 시작 조합 8개)
//   --server=…  next-start(기본) 또는 output: "standalone" 서버(.next/standalone/server.js).
//               standalone은 deploy.yml과 같은 정적 자산 복사 후 기동한다.

import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONSENT_POLICY_VERSION } from "../lib/consult/consent-policy.ts";
import { computeDiagnosisFlags } from "../lib/diagnosis/flags.ts";
import { findRemoteDatabaseViolation } from "./visual-verify-db-guard.ts";
import { startManagedServer } from "./visual-verify-server.ts";

export interface ConsultFlagInput {
  readonly consult: boolean;
  readonly policy: boolean;
}

export interface Observation {
  /** /consult 응답의 <title> */
  readonly consultTitle: string | null;
  /** /consult 응답에 실려 온 isPolicyReady prop 값 (placeholder 화면이면 null) */
  readonly consultPolicyProp: boolean | null;
  /** /result 응답에 실려 온 shouldRenderConsult prop 값 (못 찾으면 null) */
  readonly resultConsultProp: boolean | null;
  /** POST /api/consultations 응답 상태 코드 */
  readonly apiStatus: number;
}

const OPEN_TITLE = "상담 신청";
const CLOSED_TITLE = "서비스 준비 중";

// 시작 env가 (consult, policy)일 때 기대하는 관측 — 페이지와 API 모두 요청 시점
// env를 따라야 한다.
export function expectedObservation(start: ConsultFlagInput): {
  consultTitle: string;
  consultPolicyProp: boolean | null;
  resultConsultProp: boolean;
  apiIsPolicyUnavailable: boolean;
} {
  return {
    consultTitle: start.consult ? OPEN_TITLE : CLOSED_TITLE,
    // consult 화면이 닫혀 있으면 ConsultView 자체가 렌더되지 않아 prop이 없다.
    consultPolicyProp: start.consult ? start.policy : null,
    resultConsultProp: start.consult,
    apiIsPolicyUnavailable: !start.policy,
  };
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/.exec(html);
  return match ? match[1].trim() : null;
}

// RSC 페이로드는 클라이언트 컴포넌트 prop을 `\"shouldRenderConsult\":true`처럼
// 이스케이프된 JSON 조각으로 HTML 안에 싣는다.
function extractBooleanProp(html: string, prop: string): boolean | null {
  const match = new RegExp(`${prop}\\\\?"\\s*:\\s*(true|false)`).exec(html);
  return match ? match[1] === "true" : null;
}

export function extractResultConsultProp(html: string): boolean | null {
  return extractBooleanProp(html, "shouldRenderConsult");
}

export function extractConsultPolicyProp(html: string): boolean | null {
  return extractBooleanProp(html, "isPolicyReady");
}

// diagnosisGateOpen=false이면 /result가 ResultView를 렌더하지 않아(placeholder)
// shouldRenderConsult prop 자체가 없다 — 그때의 기대값은 null이다.
export function compareObservation(
  start: ConsultFlagInput,
  observed: Observation,
  diagnosisGateOpen = true
): string[] {
  const expected = expectedObservation(start);
  const expectedResultProp = diagnosisGateOpen ? expected.resultConsultProp : null;
  const mismatches: string[] = [];
  if (observed.consultTitle !== expected.consultTitle) {
    mismatches.push(
      `/consult 제목: 기대 "${expected.consultTitle}" / 관측 "${observed.consultTitle ?? "(없음)"}"`
    );
  }
  if (observed.consultPolicyProp !== expected.consultPolicyProp) {
    mismatches.push(
      `/consult isPolicyReady: 기대 ${String(expected.consultPolicyProp)} / 관측 ${String(observed.consultPolicyProp)}`
    );
  }
  if (observed.resultConsultProp !== expectedResultProp) {
    mismatches.push(
      `/result shouldRenderConsult: 기대 ${String(expectedResultProp)} / 관측 ${String(observed.resultConsultProp)}`
    );
  }
  const apiIsPolicyUnavailable = observed.apiStatus === 503;
  if (apiIsPolicyUnavailable !== expected.apiIsPolicyUnavailable) {
    mismatches.push(
      `API 상태: 기대 ${expected.apiIsPolicyUnavailable ? "503" : "503 아님"} / 관측 ${observed.apiStatus}`
    );
  }
  return mismatches;
}

export interface DiagnosisFlagInput {
  readonly flow: boolean;
  readonly engine: boolean;
  readonly dev: boolean;
}

export type GateState = "open" | "closed" | "unknown";

export interface DiagnosisObservation {
  /** `/`가 진단 플로우를 그렸는가(open) / placeholder인가(closed) */
  readonly homeGate: GateState;
  /** `/`의 <DiagnosisFlow enableDevStates> prop (닫혀 있으면 null) */
  readonly homeDevStatesProp: boolean | null;
  /** `/result`가 진단 결과를 그렸는가(open) / placeholder인가(closed) */
  readonly resultGate: GateState;
  /** `/result`의 <ResultView enableDevFixture> prop (닫혀 있으면 null) */
  readonly resultDevFixtureProp: boolean | null;
}

const PLACEHOLDER_TEXT = "서비스 준비 중입니다";

// 시작 시점 env로 computeDiagnosisFlags를 그대로 계산한 기대 상태.
export function expectedDiagnosisObservation(start: DiagnosisFlagInput): {
  gate: GateState;
  devProp: boolean | null;
} {
  const { shouldRenderDiagnosis, reviewEnabled } = computeDiagnosisFlags({
    ENABLE_DIAGNOSIS_FLOW: String(start.flow),
    DIAGNOSIS_ENGINE_READY: String(start.engine),
    ENABLE_DIAGNOSIS_DEV_STATES: String(start.dev),
  });
  return {
    gate: shouldRenderDiagnosis ? "open" : "closed",
    devProp: shouldRenderDiagnosis ? reviewEnabled : null,
  };
}

// 게이트 상태는 (placeholder 문구, 열림 전용 prop) 두 신호가 서로 반대일 때만 확정한다.
// 둘이 같이 있거나 둘 다 없으면 어느 쪽도 믿을 수 없어 unknown이다.
export function extractGateState(html: string, openProp: boolean | null): GateState {
  const hasPlaceholder = html.includes(PLACEHOLDER_TEXT);
  if (hasPlaceholder && openProp === null) return "closed";
  if (!hasPlaceholder && openProp !== null) return "open";
  return "unknown";
}

export function extractHomeDevStatesProp(html: string): boolean | null {
  return extractBooleanProp(html, "enableDevStates");
}

export function extractResultDevFixtureProp(html: string): boolean | null {
  return extractBooleanProp(html, "enableDevFixture");
}

export function buildDiagnosisObservation(
  homeHtml: string,
  resultHtml: string
): DiagnosisObservation {
  const homeDevStatesProp = extractHomeDevStatesProp(homeHtml);
  const resultDevFixtureProp = extractResultDevFixtureProp(resultHtml);
  return {
    homeGate: extractGateState(homeHtml, homeDevStatesProp),
    homeDevStatesProp,
    resultGate: extractGateState(resultHtml, resultDevFixtureProp),
    resultDevFixtureProp,
  };
}

export function compareDiagnosisObservation(
  start: DiagnosisFlagInput,
  observed: DiagnosisObservation
): string[] {
  const expected = expectedDiagnosisObservation(start);
  const mismatches: string[] = [];
  if (observed.homeGate !== observed.resultGate) {
    mismatches.push(`SKEW: / = ${observed.homeGate} / /result = ${observed.resultGate}`);
  }
  if (observed.homeGate !== expected.gate) {
    mismatches.push(`/ 게이트: 기대 ${expected.gate} / 관측 ${observed.homeGate}`);
  }
  if (observed.resultGate !== expected.gate) {
    mismatches.push(`/result 게이트: 기대 ${expected.gate} / 관측 ${observed.resultGate}`);
  }
  if (observed.homeDevStatesProp !== expected.devProp) {
    mismatches.push(
      `/ enableDevStates: 기대 ${String(expected.devProp)} / 관측 ${String(observed.homeDevStatesProp)}`
    );
  }
  if (observed.resultDevFixtureProp !== expected.devProp) {
    mismatches.push(
      `/result enableDevFixture: 기대 ${String(expected.devProp)} / 관측 ${String(observed.resultDevFixtureProp)}`
    );
  }
  return mismatches;
}

// `.next/prerender-manifest.json`의 routes 키 중 프리렌더된(=빌드 시점에 굳은)
// 라우트만 골라낸다.
export function findPrerenderedRoutes(
  manifest: { routes?: Record<string, unknown> },
  candidates: readonly string[]
): string[] {
  const prerendered = new Set(Object.keys(manifest.routes ?? {}));
  return candidates.filter((route) => prerendered.has(route));
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_URL = "file:./.tmp/flag-runtime.db";
const LOG_DIR = path.join(PROJECT_ROOT, ".moai", "state", "verify", "group4");
const FLAG_KEY_RE =
  /^(TURSO_|ENABLE_|CONSULT_|DIAGNOSIS_|RATE_LIMIT_|LLM_PROVIDER_|GEMINI_|PORT$|HOSTNAME$)/;

/** 빌드 또는 서버 시작 한 번에 쓰는 전체 플래그 조합. */
export interface FlagScenario {
  readonly label: string;
  readonly consult: boolean;
  readonly policy: boolean;
  readonly diag: DiagnosisFlagInput;
}

// 부모 셸에서 물려받을 수 있는 원격 DB·플래그 계열 env를 모두 제거하고 필요한 값만 채운다.
function assembleEnv(flags: FlagScenario): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (FLAG_KEY_RE.test(key)) delete env[key];
  }
  env.TURSO_DATABASE_URL = DB_URL;
  env.TURSO_AUTH_TOKEN = "";
  env.LLM_PROVIDER_MODE = "deterministic";
  env.ENABLE_DIAGNOSIS_FLOW = String(flags.diag.flow);
  env.DIAGNOSIS_ENGINE_READY = String(flags.diag.engine);
  env.ENABLE_DIAGNOSIS_DEV_STATES = String(flags.diag.dev);
  env.ENABLE_CONSULT_FLOW = String(flags.consult);
  env.CONSULT_POLICY_READY = String(flags.policy);
  env.RATE_LIMIT_HMAC_SECRET = "flag-runtime-throwaway-secret";
  const violation = findRemoteDatabaseViolation(env);
  if (violation) throw new Error(violation);
  return env;
}

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

export type ServerMode = "next-start" | "standalone";

interface BuildResult {
  readonly prerendered: string[];
  readonly allPrerenderedRoutes: string[];
  readonly routeTable: string;
}

// deploy.yml의 "copy static assets into standalone output" 단계와 같은 복사.
// `.next/` 아래(gitignored)만 건드린다.
function copyStandaloneAssets(): void {
  const standaloneNext = path.join(PROJECT_ROOT, ".next", "standalone", ".next");
  rmSync(path.join(standaloneNext, "static"), { recursive: true, force: true });
  rmSync(path.join(PROJECT_ROOT, ".next", "standalone", "public"), {
    recursive: true,
    force: true,
  });
  cpSync(path.join(PROJECT_ROOT, ".next", "static"), path.join(standaloneNext, "static"), {
    recursive: true,
  });
  const publicDir = path.join(PROJECT_ROOT, "public");
  if (existsSync(publicDir)) {
    cpSync(publicDir, path.join(PROJECT_ROOT, ".next", "standalone", "public"), {
      recursive: true,
    });
  }
}

function build(name: string, flags: FlagScenario, server: ServerMode): BuildResult {
  const logFile = path.join(LOG_DIR, `flag-runtime-build-${name}.log`);
  const code = runPnpm(["build"], assembleEnv(flags), logFile);
  if (code !== 0) throw new Error(`pnpm build 실패(exit ${code}) — 로그: ${logFile}`);
  if (server === "standalone") copyStandaloneAssets();
  const manifestPath = path.join(PROJECT_ROOT, ".next", "prerender-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    routes?: Record<string, unknown>;
  };
  const log = readFileSync(logFile, "utf-8");
  const routeTable = log
    .split(/\r?\n/)
    .filter((line) => /^[├└┌│]/.test(line) || /^\s*[○ƒ●]/.test(line))
    .join("\n");
  return {
    prerendered: findPrerenderedRoutes(manifest, ["/", "/consult", "/result"]),
    allPrerenderedRoutes: Object.keys(manifest.routes ?? {}),
    routeTable,
  };
}

interface FullObservation {
  readonly consult: Observation;
  readonly diagnosis: DiagnosisObservation;
}

async function observe(baseURL: string): Promise<FullObservation> {
  const homeHtml = await (await fetch(`${baseURL}/`)).text();
  const consultHtml = await (await fetch(`${baseURL}/consult`)).text();
  const resultHtml = await (await fetch(`${baseURL}/result`)).text();
  const api = await fetch(`${baseURL}/api/consultations`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({
      resultId: "flag-runtime-probe",
      channel: "kakao",
      name: "검증",
      contact: "010-1234-5678",
      consent: { piiCollection: true, healthInfoUse: true, marketing: false },
      acknowledgedConsentVersion: CONSENT_POLICY_VERSION,
      idempotencyKey: randomUUID(),
    }),
  });
  return {
    consult: {
      consultTitle: extractTitle(consultHtml),
      consultPolicyProp: extractConsultPolicyProp(consultHtml),
      resultConsultProp: extractResultConsultProp(resultHtml),
      apiStatus: api.status,
    },
    diagnosis: buildDiagnosisObservation(homeHtml, resultHtml),
  };
}

async function startAndObserve(start: FlagScenario, server: ServerMode): Promise<FullObservation> {
  const env = assembleEnv(start);
  const managed = await startManagedServer({
    readyTimeoutMs: 60_000,
    spawnOnPort: (port) =>
      server === "standalone"
        ? // 프로덕션(PM2)과 같은 진입점: node .next/standalone/server.js
          spawn(process.execPath, [path.join(".next", "standalone", "server.js")], {
            cwd: PROJECT_ROOT,
            env: { ...env, PORT: String(port), HOSTNAME: "127.0.0.1" },
            stdio: "ignore",
          })
        : spawn("pnpm", ["start"], {
            cwd: PROJECT_ROOT,
            env: { ...env, PORT: String(port) },
            shell: true,
            stdio: "ignore",
          }),
  });
  try {
    return await observe(managed.baseURL);
  } finally {
    managed.stop();
  }
}

const NONE: DiagnosisFlagInput = { flow: false, engine: false, dev: false };
const DEV_ONLY: DiagnosisFlagInput = { flow: false, engine: false, dev: true };
const PROD_READY: DiagnosisFlagInput = { flow: true, engine: true, dev: false };
const FLOW_ONLY: DiagnosisFlagInput = { flow: true, engine: false, dev: false };
const ALL_ON: DiagnosisFlagInput = { flow: true, engine: true, dev: true };

// 시작 조합. 앞 4개는 D-NEW-18의 consult 플래그 4조합(진단은 DEV_STATES만 열어 /result가
// ResultView를 렌더하게 한다), 뒤 4개는 D-NEW-21의 진단 게이트 조합이다.
const START_SCENARIOS: readonly FlagScenario[] = [
  { label: "consult=F policy=F", consult: false, policy: false, diag: DEV_ONLY },
  { label: "consult=T policy=F", consult: true, policy: false, diag: DEV_ONLY },
  { label: "consult=F policy=T", consult: false, policy: true, diag: DEV_ONLY },
  { label: "consult=T policy=T", consult: true, policy: true, diag: DEV_ONLY },
  { label: "diag 모두 닫힘", consult: false, policy: false, diag: NONE },
  { label: "diag FLOW+ENGINE(운영 활성)", consult: false, policy: false, diag: PROD_READY },
  { label: "diag FLOW만(ENGINE 없음)", consult: false, policy: false, diag: FLOW_ONLY },
  { label: "diag 전부 열림", consult: false, policy: false, diag: ALL_ON },
];

const BUILDS: Record<string, FlagScenario> = {
  closed: { label: "closed", consult: false, policy: false, diag: NONE },
  open: { label: "open", consult: true, policy: true, diag: PROD_READY },
};

const fmtConsult = (f: { consult: boolean; policy: boolean }) =>
  `consult=${f.consult} policy=${f.policy}`;
const fmtDiag = (d: DiagnosisFlagInput) => `flow=${d.flow} engine=${d.engine} dev=${d.dev}`;

export async function main(argv: string[]): Promise<number> {
  const observeOnly = argv.includes("--observe");
  const buildFilter = argv.find((a) => a.startsWith("--build="))?.slice("--build=".length);
  const buildNames = buildFilter ? [buildFilter] : Object.keys(BUILDS);
  for (const name of buildNames) {
    if (!(name in BUILDS)) throw new Error(`알 수 없는 --build 값: ${name}`);
  }
  const serverArg = argv.find((a) => a.startsWith("--server="))?.slice("--server=".length);
  const server: ServerMode = (serverArg ?? "next-start") as ServerMode;
  if (server !== "next-start" && server !== "standalone") {
    throw new Error(`알 수 없는 --server 값: ${String(serverArg)}`);
  }

  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(path.join(PROJECT_ROOT, ".tmp"), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(path.join(PROJECT_ROOT, ".tmp", `flag-runtime.db${suffix}`), { force: true });
  }
  const migrateCode = runPnpm(
    ["db:migrate"],
    assembleEnv(BUILDS.closed),
    path.join(LOG_DIR, "flag-runtime-migrate.log")
  );
  if (migrateCode !== 0) throw new Error(`db:migrate 실패(exit ${migrateCode})`);

  let mismatchCount = 0;
  const lines: string[] = [`서버 모드: ${server}`];
  for (const name of buildNames) {
    const buildFlags = BUILDS[name];
    const built = build(name, buildFlags, server);
    lines.push(`## 빌드 ${name} (${fmtConsult(buildFlags)} diag ${fmtDiag(buildFlags.diag)})`);
    lines.push(
      `프리렌더된 라우트(.next/prerender-manifest.json): [${built.prerendered.join(", ")}]`
    );
    lines.push(`prerender-manifest routes 전체 키: [${built.allPrerenderedRoutes.join(", ")}]`);
    lines.push(built.routeTable);
    // 세 페이지 라우트(/, /consult, /result)는 모두 요청 시점에 플래그를 읽어야 하므로
    // 프리렌더되면 안 된다.
    if (built.prerendered.length > 0) {
      mismatchCount += built.prerendered.length;
      lines.push(`MISMATCH: 빌드 시점에 프리렌더된 라우트 [${built.prerendered.join(", ")}]`);
    }
    for (const start of START_SCENARIOS) {
      const observed = await startAndObserve(start, server);
      const expected = expectedDiagnosisObservation(start.diag);
      const mismatches = [
        ...compareObservation(start, observed.consult, expected.gate === "open"),
        ...compareDiagnosisObservation(start.diag, observed.diagnosis),
      ];
      mismatchCount += mismatches.length;
      lines.push(
        `- start [${start.label}] ${fmtConsult(start)} diag ${fmtDiag(start.diag)} ` +
          `→ 시작 env 기대 게이트=${expected.gate} / 관측 /=${observed.diagnosis.homeGate} ` +
          `/result=${observed.diagnosis.resultGate} ` +
          `(/.enableDevStates=${String(observed.diagnosis.homeDevStatesProp)} ` +
          `/result.enableDevFixture=${String(observed.diagnosis.resultDevFixtureProp)}) ` +
          `/consult="${observed.consult.consultTitle}" ` +
          `/consult.isPolicyReady=${String(observed.consult.consultPolicyProp)} ` +
          `/result.consultProp=${String(observed.consult.resultConsultProp)} ` +
          `api=${observed.consult.apiStatus} ` +
          (mismatches.length === 0 ? "OK" : `MISMATCH: ${mismatches.join("; ")}`)
      );
    }
  }
  lines.push(`불일치 관측 합계: ${mismatchCount}`);
  console.log(lines.join("\n"));
  return observeOnly || mismatchCount === 0 ? 0 : 1;
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error("verify-flag-runtime 실행 실패:", error);
      process.exitCode = 1;
    }
  );
}
