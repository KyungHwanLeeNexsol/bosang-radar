// SPEC-B2C-CONSULT-001 D-NEW-18 — 빌드 시점과 런타임의 플래그 불일치 회귀 검사.
//
// 배경: app/consult/page.tsx, app/result/page.tsx는 서버 컴포넌트에서
// process.env(ENABLE_CONSULT_FLOW 등)를 읽는다. 이 페이지가 `next build`에서
// 정적으로 프리렌더되면 플래그 값이 빌드 시점에 굳고, 요청 시점에 env를 읽는
// POST /api/consultations(CONSULT_POLICY_READY)와 서로 다른 값을 보게 된다.
//
// 이 스크립트는 실제 `next build` → 반대(또는 다른) env로 `next start`를 수행해
// 페이지가 보여 주는 상태와 API 응답이 시작 시점 env와 일치하는지 확인한다.
// 시작 env와 어긋나는 관측이 하나라도 있으면 종료 코드 1로 끝난다.
//
// 안전: 모든 빌드/기동은 로컬 file: DB만 쓴다. 부모 셸의 TURSO_*/플래그 계열 env는
// 물려받지 않고, 최종 env가 file: 이 아니면 실행을 거부한다. 서버는 반드시 종료한다.
//
// 실행: pnpm verify:flag-runtime [--observe] [--build=closed|open]
//   --observe   불일치가 있어도 종료 코드 0(표만 출력)
//   --build=…   빌드 하나만 검증(기본은 closed/open 둘 다, 각 빌드마다 시작 조합 4개)

import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONSENT_POLICY_VERSION } from "../lib/consult/consent-policy.ts";
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

export function compareObservation(start: ConsultFlagInput, observed: Observation): string[] {
  const expected = expectedObservation(start);
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
  if (observed.resultConsultProp !== expected.resultConsultProp) {
    mismatches.push(
      `/result shouldRenderConsult: 기대 ${expected.resultConsultProp} / 관측 ${String(observed.resultConsultProp)}`
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
const LOG_DIR = path.join(PROJECT_ROOT, ".moai", "state", "verify", "group2");
const FLAG_KEY_RE = /^(TURSO_|ENABLE_|CONSULT_|DIAGNOSIS_|RATE_LIMIT_|LLM_PROVIDER_|GEMINI_|PORT$)/;

// 부모 셸에서 물려받을 수 있는 원격 DB·플래그 계열 env를 모두 제거하고 필요한 값만 채운다.
function assembleEnv(flags: ConsultFlagInput): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (FLAG_KEY_RE.test(key)) delete env[key];
  }
  env.TURSO_DATABASE_URL = DB_URL;
  env.TURSO_AUTH_TOKEN = "";
  env.LLM_PROVIDER_MODE = "deterministic";
  // 진단 게이트는 빌드/시작 모두 열어 둔다 — /result가 ResultView를 렌더해야
  // shouldRenderConsult prop을 관측할 수 있다(이 검사는 consult 플래그만 다룬다).
  env.ENABLE_DIAGNOSIS_DEV_STATES = "true";
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

interface BuildResult {
  readonly prerendered: string[];
  readonly routeTable: string;
}

function build(name: string, flags: ConsultFlagInput): BuildResult {
  const logFile = path.join(LOG_DIR, `flag-runtime-build-${name}.log`);
  const code = runPnpm(["build"], assembleEnv(flags), logFile);
  if (code !== 0) throw new Error(`pnpm build 실패(exit ${code}) — 로그: ${logFile}`);
  const manifestPath = path.join(PROJECT_ROOT, ".next", "prerender-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    routes?: Record<string, unknown>;
  };
  const log = readFileSync(logFile, "utf-8");
  const routeTable = log
    .split(/\r?\n/)
    .filter((line) => /^[├└┌│]/.test(line) || /^\s*[○ƒ●]/.test(line))
    .join("\n");
  return { prerendered: findPrerenderedRoutes(manifest, ["/", "/consult", "/result"]), routeTable };
}

async function observe(baseURL: string): Promise<Observation> {
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
    consultTitle: extractTitle(consultHtml),
    consultPolicyProp: extractConsultPolicyProp(consultHtml),
    resultConsultProp: extractResultConsultProp(resultHtml),
    apiStatus: api.status,
  };
}

async function startAndObserve(start: ConsultFlagInput): Promise<Observation> {
  const env = assembleEnv(start);
  const server = await startManagedServer({
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
    return await observe(server.baseURL);
  } finally {
    server.stop();
  }
}

const ALL_COMBOS: readonly ConsultFlagInput[] = [
  { consult: false, policy: false },
  { consult: true, policy: false },
  { consult: false, policy: true },
  { consult: true, policy: true },
];

const BUILDS: Record<string, ConsultFlagInput> = {
  closed: { consult: false, policy: false },
  open: { consult: true, policy: true },
};

const fmt = (f: ConsultFlagInput) => `consult=${f.consult} policy=${f.policy}`;

export async function main(argv: string[]): Promise<number> {
  const observeOnly = argv.includes("--observe");
  const buildFilter = argv.find((a) => a.startsWith("--build="))?.slice("--build=".length);
  const buildNames = buildFilter ? [buildFilter] : Object.keys(BUILDS);
  for (const name of buildNames) {
    if (!(name in BUILDS)) throw new Error(`알 수 없는 --build 값: ${name}`);
  }

  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(path.join(PROJECT_ROOT, ".tmp"), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(path.join(PROJECT_ROOT, ".tmp", `flag-runtime.db${suffix}`), { force: true });
  }
  const migrateCode = runPnpm(
    ["db:migrate"],
    assembleEnv({ consult: false, policy: false }),
    path.join(LOG_DIR, "flag-runtime-migrate.log")
  );
  if (migrateCode !== 0) throw new Error(`db:migrate 실패(exit ${migrateCode})`);

  let mismatchCount = 0;
  const lines: string[] = [];
  for (const name of buildNames) {
    const buildFlags = BUILDS[name];
    const built = build(name, buildFlags);
    lines.push(`## 빌드 ${name} (${fmt(buildFlags)})`);
    lines.push(
      `프리렌더된 라우트(.next/prerender-manifest.json): [${built.prerendered.join(", ")}]`
    );
    lines.push(built.routeTable);
    for (const start of ALL_COMBOS) {
      const observed = await startAndObserve(start);
      const mismatches = compareObservation(start, observed);
      mismatchCount += mismatches.length;
      lines.push(
        `- start ${fmt(start)} → /consult="${observed.consultTitle}" ` +
          `/consult.isPolicyReady=${String(observed.consultPolicyProp)} ` +
          `/result.prop=${String(observed.resultConsultProp)} api=${observed.apiStatus} ` +
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
