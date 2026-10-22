// 명령줄 진입점(ADR D10). 모든 명령은 명시적으로 호출하며, 저장소·SHA·경로에는 기본값이 없다.
// 이 파일의 `main`은 환경(process.env·argv·exit)을 직접 만지지 않는다 — 모든 의존성(파일·git·프로세스 포트·시계·
// 출력·환경변수 조회)은 `CliDeps`로 주입된다. 실제 어댑터를 잇는 일은 맨 아래 진입점 한 곳에서만 하고, 그 진입점은
// 이 파일을 직접 실행할 때만 돈다(import만으로는 아무것도 하지 않는다).
//
// 공개 API:
//   main(argv, deps): Promise<number>      argv는 `node cli.ts` 뒤의 인자들
//   CliDeps / EXIT
//
// 명령:
//   precheck --rules-cache <dir> [--scan-tree <dir> --repo <dir> --target-sha <40hex>]
//   scope    --repo <dir> --target-sha <40hex> [--format json|tsv]
//   run      --mode control|target --run-id <id> --rules-cache <dir> --evidence-root <dir> ... (아래 usage)
//            실제 실행 방지 장치를 통과해야만 프로세스 포트를 만든다.
//
// 종료 코드: 0 통과(run은 측정 COMPLETE일 때만), 1 불일치·거부·하드 실패, 2 사용법 오류, 3 NOT_RUN(방지 장치).
//
// 이 파일은 quality.yaml·lsp.yaml·임계값·훅을 읽지도 쓰지도 않는다. 출력은 기존 어떤 게이트도 소비하지 않는다.

import { isAbsolute, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { SystemClock } from "./clock";
import { createNodeFs } from "./fs-node";
import { createNodeGit } from "./git-node";
import { runHarness, type HarnessOptions } from "./harness";
import { createNodeProcessPort } from "./process-node";
import {
  RulesManifestParseError,
  checkRulesPin,
  compareRulesTree,
  parseExpectedRules,
  parseRulesFiles,
  rulesTreeConfigFromPin,
} from "./rules-manifest";
import { computeScope, resolveTarget, verifyScanTree } from "./scope";
import type { SessionLimits } from "./session";
import { representativeStatus, sortReasons, type Reason } from "./status";
import {
  SCHEMAS,
  type Clock,
  type FsPort,
  type GitPort,
  type Pin,
  type ProcessPort,
  type Provenance,
  type ScopeConfig,
  type SpawnSpec,
} from "./types";

// ── 공개 타입 ───────────────────────────────────────────────────

export const EXIT = { ok: 0, failed: 1, usage: 2, notRun: 3 } as const;

export interface CliDeps {
  fs: FsPort;
  /** 저장소 폴더마다 읽기 전용 git 포트를 만든다. SHA 형식 검사를 통과하기 전에는 부르지 않는다. */
  makeGit(repoDir: string): GitPort;
  /** 실제 실행 방지 장치를 통과한 뒤에만 `run`이 "real"로 부른다. 그 밖의 경로는 부르지 않는다. */
  makeProcessPort(provenance: Provenance): ProcessPort;
  clock: Clock;
  stdout(text: string): void;
  stderr(text: string): void;
  /** 환경변수 한 개를 조회한다(없으면 undefined). main은 이 함수로만 환경을 본다. */
  getEnv(name: string): string | undefined;
  /** pin.json·scope.json·rules-*.tsv·control-expectations.json이 있는 폴더(고정 입력). */
  dataDir: string;
  /** "win32" 등. 자식 환경 허용 목록을 고르는 데만 쓴다. */
  platform: string;
  /** 중단 신호(선택). run이 하네스에 넘긴다. */
  signal?: AbortSignal;
}

// ── 상수 ────────────────────────────────────────────────────────

const ENV_ALLOW_REAL = "MOAI_SEMGREP_LSP_ALLOW_REAL";
const FULL_SHA = /^[0-9a-f]{40}$/;

/** 아무것도 듣지 않는 루프백 주소(포트 9). 메트릭·버전 확인·앱 URL이 밖으로 나가지 못하게 하려는 값이다. */
const LOOPBACK_URL = "http://127.0.0.1:9";

// UNVERIFIED(ADR U3/U12): 실제 서버가 이 인자로 LSP를 여는지는 실행해 보지 않았다.
const SERVER_ARGS = ["lsp", "--debug"] as const;

// UNVERIFIED: 실제 실행의 한도와 시간 제한 요청값은 실측하지 못한 추정이다(ms, 초). 근거 없이 줄이지 않는다.
const REAL_LIMITS: SessionLimits = {
  init: 60_000,
  rules: 600_000,
  scan: 1_800_000,
  echo: 60_000,
  exit: 30_000,
  killGrace: 10_000,
};
const REAL_SETTINGS = { timeout: 30, timeoutThreshold: 3 } as const;

/** 실제 실행이 COMPLETE에 이르기 전에 구현·확인되어야 하는 것(항상 출력에 싣는다). */
const NOT_VERIFIED = [
  "도구 버전 관측(initialize 이전 `--version` 확인): 구현하지 않았다 — toolVersionObserved=null",
  "휠 sha256 관측: 구현하지 않았다 — wheelSha256Observed=null",
  "같은 트리의 다른 서버 프로세스 검사: 구현하지 않았다 — foreignServerProcesses=null",
  "메트릭 수신기(루프백 수신 0건 확인): 이 변경에 없다 — metricsReceiverHits=null",
  "target 모드의 대조 참조(control_reference): 연결하지 않았다 — controlReference=null",
  "실행 잠금: 이 CLI가 만든 실행별 파일 하나뿐이다(실행 사이의 상호 배제·해제 없음)",
  "서버 인자 `lsp --debug`: 미확인(ADR U3/U12)",
  "자식 환경변수 이름(SEMGREP_*): 하네스가 정한 이름이며 실제 서버가 읽는 이름과 같다는 것은 미확인",
  "SEMGREP_METRICS 계열 값: 필요하다고 확인된 것이 없어 보내지 않는다(메트릭은 initializationOptions로 끈다)",
  "세션 한도와 시간 제한 요청값: 실측하지 않은 추정값",
] as const;

// ── 사용법 ──────────────────────────────────────────────────────

const USAGE = `semgrep-lsp 하네스 CLI (ADR-001, Proposed) — Semgrep을 설치하거나 찾지 않는다.

사용법:
  cli.ts precheck --rules-cache <dir> [--scan-tree <dir> --repo <dir> --target-sha <40자 SHA>]
  cli.ts scope --repo <dir> --target-sha <40자 SHA> [--format json|tsv]
  cli.ts run --mode control|target --run-id <id> --rules-cache <dir> --evidence-root <dir>
             [--repo <dir> --target-sha <40자 SHA> --scan-root <dir>]          (target)
             [--control-fixtures-root <dir> --control-tree-root <dir>]         (control)
             --allow-real-semgrep --semgrep-bin <절대 경로>
  cli.ts --help

run은 아래 셋이 모두 있을 때만 프로세스를 띄운다. 하나라도 없으면 NOT_RUN(종료 코드 3)이다.
  1. --allow-real-semgrep
  2. 환경변수 ${ENV_ALLOW_REAL}=1
  3. --semgrep-bin <존재하는 절대 경로>   (PATH 탐색·자동 설치·기본값 없음)

종료 코드: 0 통과 / 1 불일치·거부·실패 / 2 사용법 오류 / 3 NOT_RUN(실행 방지 장치)
`;

// ── 인자 해석 ───────────────────────────────────────────────────

const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  precheck: ["rules-cache", "scan-tree", "repo", "target-sha"],
  scope: ["repo", "target-sha", "format"],
  run: [
    "mode",
    "run-id",
    "rules-cache",
    "evidence-root",
    "semgrep-bin",
    "repo",
    "target-sha",
    "scan-root",
    "control-fixtures-root",
    "control-tree-root",
  ],
};
const FLAGS: Record<string, readonly string[]> = {
  precheck: [],
  scope: [],
  run: ["allow-real-semgrep"],
};

interface Parsed {
  command: string;
  options: Map<string, string>;
  flags: Set<string>;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): Parsed | "help" {
  if (argv.length === 0) throw new UsageError("명령이 없다");
  if (argv[0] === "help" || argv.some((a) => a === "--help" || a === "-h")) return "help";
  const [command, ...rest] = argv;
  const valueOptions = COMMAND_OPTIONS[command];
  if (valueOptions === undefined) throw new UsageError(`알 수 없는 명령: ${command}`);
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--")) throw new UsageError(`예상하지 못한 인자: ${token}`);
    const eq = token.indexOf("=");
    const name = token.slice(2, eq === -1 ? undefined : eq);
    if (FLAGS[command].includes(name)) {
      if (eq !== -1) throw new UsageError(`--${name}은 값을 받지 않는다`);
      if (flags.has(name)) throw new UsageError(`--${name}이 중복됐다`);
      flags.add(name);
      continue;
    }
    if (!valueOptions.includes(name))
      throw new UsageError(`${command}에서 쓸 수 없는 옵션: --${name}`);
    if (options.has(name)) throw new UsageError(`--${name}이 중복됐다`);
    let value: string | undefined;
    if (eq !== -1) value = token.slice(eq + 1);
    else {
      value = rest[i + 1];
      i++;
    }
    if (value === undefined || value === "" || (eq === -1 && value.startsWith("--"))) {
      throw new UsageError(`--${name}에 값이 없다`);
    }
    options.set(name, value);
  }
  return { command, options, flags };
}

function need(parsed: Parsed, name: string): string {
  const value = parsed.options.get(name);
  if (value === undefined) throw new UsageError(`--${name}이 필요하다`);
  return value;
}

function needSha(parsed: Parsed, name = "target-sha"): string {
  const value = need(parsed, name);
  if (!FULL_SHA.test(value)) {
    throw new UsageError(`--${name}은 소문자 40자 16진수 커밋 SHA여야 한다(브랜치·약식 SHA 불가)`);
  }
  return value;
}

// ── 공통 도구 ───────────────────────────────────────────────────

const decoder = new TextDecoder();

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function joinPath(root: string, name: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${name}`;
}

/** 경로의 부모 폴더. 드라이브 루트("C:")는 "C:/"로, 최상위는 "/" 또는 "."로 돌려준다. */
function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (cut < 0) return ".";
  if (cut === 0) return "/";
  const parent = trimmed.slice(0, cut);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}

function reasonList(reasons: readonly Reason[]): { code: string; detail: string | null }[] {
  return reasons.map((r) => ({ code: r.code, detail: r.detail ?? null }));
}

async function readText(deps: CliDeps, name: string): Promise<string> {
  try {
    return decoder.decode(await deps.fs.readFile(joinPath(deps.dataDir, name)));
  } catch (error) {
    throw new Error(`고정 입력 ${name}을(를) 읽지 못했다: ${errorText(error)}`);
  }
}

async function readJson<T>(deps: CliDeps, name: string, schema: string): Promise<T> {
  let value: unknown;
  try {
    value = JSON.parse(await readText(deps, name));
  } catch (error) {
    throw new Error(`${name}: ${errorText(error)}`);
  }
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { schema?: unknown }).schema !== schema
  ) {
    throw new Error(`${name}: 스키마가 ${schema}이 아니다`);
  }
  return value as T;
}

// ── precheck ────────────────────────────────────────────────────

async function cmdPrecheck(parsed: Parsed, deps: CliDeps): Promise<number> {
  const rulesCache = need(parsed, "rules-cache");
  const group = ["scan-tree", "repo", "target-sha"].filter((n) => parsed.options.has(n));
  if (group.length !== 0 && group.length !== 3) {
    throw new UsageError("--scan-tree, --repo, --target-sha는 함께 주거나 모두 생략해야 한다");
  }
  const withScanTree = group.length === 3;
  const targetSha = withScanTree ? needSha(parsed) : null;

  let pin: Pin;
  let reasons: Reason[] = [];
  const details: Record<string, unknown> = {};
  try {
    pin = await readJson<Pin>(deps, "pin.json", SCHEMAS.pin);
    const rulesFiles = parseRulesFiles(await readText(deps, "rules-files.tsv"));
    const expectedRules = parseExpectedRules(await readText(deps, "rules-expected.tsv"));
    details.rules_files_expected = rulesFiles.length;
    details.expected_rules = expectedRules.length;

    // 이 CLI가 서버 없이 확인할 수 있는 PH0 검사: 고정 목록의 자기 일관성과 규칙 캐시 내용.
    // 도구 버전·휠·환경·잠금·다른 서버 프로세스는 실행 중에만 관측되므로 여기서 보지 않는다.
    reasons.push(...checkRulesPin(rulesFiles, expectedRules, pin.rules));
    reasons.push(
      ...(await compareRulesTree(
        deps.fs,
        rulesCache,
        rulesFiles,
        rulesTreeConfigFromPin(pin.rules)
      ))
    );

    if (withScanTree) {
      const git = deps.makeGit(need(parsed, "repo"));
      const scopeConfig = await readJson<ScopeConfig>(deps, "scope.json", SCHEMAS.scope);
      const target = await resolveTarget(git, targetSha as string);
      if (!target.ok) reasons.push(...target.reasons);
      else {
        const scope = await computeScope(git, target.sha, scopeConfig);
        details.target_sha = target.sha;
        details.scope_sha256 = scope.scopeSha256;
        details.scope_included = scope.included.length;
        details.scope_excluded_counts = scope.excludedCounts;
        reasons.push(
          ...(await verifyScanTree(deps.fs, scope, need(parsed, "scan-tree"), scopeConfig))
        );
      }
    }
  } catch (error) {
    const message = error instanceof RulesManifestParseError ? error.message : errorText(error);
    deps.stderr(`precheck를 끝까지 수행하지 못했다: ${message}\n`);
    return EXIT.failed;
  }

  reasons = sortReasons(reasons);
  deps.stdout(
    json({
      command: "precheck",
      ok: reasons.length === 0,
      representative_status: reasons.length === 0 ? null : representativeStatus(reasons),
      reasons: reasonList(reasons),
      checked: { rules_pin: true, rules_tree: true, scan_tree: withScanTree },
      not_checked: ["도구 버전·휠 sha256", "자식 환경변수", "실행 잠금", "다른 서버 프로세스"],
      details,
    })
  );
  return reasons.length === 0 ? EXIT.ok : EXIT.failed;
}

// ── scope ───────────────────────────────────────────────────────

async function cmdScope(parsed: Parsed, deps: CliDeps): Promise<number> {
  const repo = need(parsed, "repo");
  const sha = needSha(parsed);
  const format = parsed.options.get("format") ?? "json";
  if (format !== "json" && format !== "tsv") throw new UsageError("--format은 json 또는 tsv다");

  try {
    const git = deps.makeGit(repo);
    const scopeConfig = await readJson<ScopeConfig>(deps, "scope.json", SCHEMAS.scope);
    const target = await resolveTarget(git, sha);
    if (!target.ok) {
      deps.stderr(
        `대상 SHA를 해석하지 못했다: ${target.reasons.map((r) => r.detail).join("; ")}\n`
      );
      return EXIT.failed;
    }
    const scope = await computeScope(git, target.sha, scopeConfig);
    if (format === "json") {
      deps.stdout(
        json({
          command: "scope",
          target_sha: scope.targetSha,
          scope_sha256: scope.scopeSha256,
          included: scope.included.length,
          total: scope.entries.length,
          excluded_counts: scope.excludedCounts,
          files: scope.entries.map((e) => ({
            path: e.path,
            blob: e.blobSha,
            decision: e.decision,
            reason: e.reason,
          })),
        })
      );
    } else {
      const lines = [
        `# target_sha\t${scope.targetSha}`,
        `# scope_sha256\t${scope.scopeSha256}`,
        `# included\t${scope.included.length}`,
        ...Object.entries(scope.excludedCounts).map(([reason, n]) => `# excluded\t${reason}\t${n}`),
        ...scope.entries.map((e) => `${e.path}\t${e.blobSha}\t${e.decision}\t${e.reason ?? ""}`),
      ];
      deps.stdout(`${lines.join("\n")}\n`);
    }
    return EXIT.ok;
  } catch (error) {
    deps.stderr(`scope를 계산하지 못했다: ${errorText(error)}\n`);
    return EXIT.failed;
  }
}

// ── run ─────────────────────────────────────────────────────────

/** 실제 실행 방지 장치: 셋 중 빠진 조건의 이름을 돌려준다(비어 있으면 통과). 프로세스 포트는 만들지 않는다. */
async function missingGuardConditions(parsed: Parsed, deps: CliDeps): Promise<string[]> {
  const missing: string[] = [];
  if (!parsed.flags.has("allow-real-semgrep")) missing.push("flag:--allow-real-semgrep");
  if (deps.getEnv(ENV_ALLOW_REAL) !== "1") missing.push(`env:${ENV_ALLOW_REAL}=1`);
  const bin = parsed.options.get("semgrep-bin");
  if (bin === undefined) missing.push("arg:--semgrep-bin(not-given)");
  else if (!isAbsolute(bin)) missing.push("arg:--semgrep-bin(not-absolute)");
  else {
    let exists = false;
    try {
      exists = await deps.fs.exists(bin);
    } catch {
      exists = false;
    }
    if (!exists) missing.push("arg:--semgrep-bin(missing)");
  }
  return missing;
}

/** 자식 환경: 최소 허용 목록 + 루프백 URL + 증거 폴더 안의 상태 파일 경로. 토큰·기밀은 복사하지 않는다. */
function buildChildEnv(deps: CliDeps, evidenceDir: string): Record<string, string> {
  const names =
    deps.platform === "win32" ? ["PATH", "SYSTEMROOT", "TEMP", "TMP"] : ["PATH", "HOME"];
  const env: Record<string, string> = {};
  for (const name of names) {
    const value = deps.getEnv(name);
    if (value !== undefined && value !== "") env[name] = value;
  }
  const state = joinPath(evidenceDir, "semgrep-state");
  return {
    ...env,
    SEMGREP_APP_URL: LOOPBACK_URL,
    SEMGREP_METRICS_URL: LOOPBACK_URL,
    SEMGREP_VERSION_CHECK_URL: LOOPBACK_URL,
    SEMGREP_LOG_FILE: joinPath(state, "semgrep.log"),
    SEMGREP_SETTINGS_FILE: joinPath(state, "settings.yml"),
    SEMGREP_VERSION_CACHE_PATH: joinPath(state, "version-cache"),
  };
}

/** control 모드는 git을 쓰지 않는다. 쓰려 하면 던지는 포트로 막는다. */
const refusingGit: GitPort = {
  async resolveCommit() {
    throw new Error("control 모드에서는 git을 쓰지 않는다");
  },
  async lsTree() {
    throw new Error("control 모드에서는 git을 쓰지 않는다");
  },
  async readBlob() {
    throw new Error("control 모드에서는 git을 쓰지 않는다");
  },
};

async function cmdRun(parsed: Parsed, deps: CliDeps): Promise<number> {
  // 1. 방지 장치. 인자 검증보다 먼저 보고, 하나라도 빠지면 어떤 포트도 만들지 않고 끝난다.
  const missing = await missingGuardConditions(parsed, deps);
  if (missing.length > 0) {
    deps.stdout(
      json({
        command: "run",
        status: "NOT_RUN",
        reason: "실제 실행 방지 장치를 통과하지 못했다 — 아무것도 시작하지 않았다",
        missing_conditions: missing,
      })
    );
    return EXIT.notRun;
  }

  // 2. 인자
  const mode = need(parsed, "mode");
  if (mode !== "control" && mode !== "target")
    throw new UsageError("--mode는 control 또는 target이다");
  const runId = need(parsed, "run-id");
  const rulesCache = need(parsed, "rules-cache");
  const evidenceRoot = need(parsed, "evidence-root");
  const bin = need(parsed, "semgrep-bin");
  let targetSha: string | null = null;
  let git: GitPort = refusingGit;
  let scanRoot: string;
  let controlFixturesRoot: string;
  let controlTreeRoot: string;
  // 사용하지 않는 모드의 경로는 하네스가 만지지 않는다. 혹시 만지더라도 증거 폴더 밖을 건드리지 않도록 그 안을 가리킨다.
  const unused = joinPath(joinPath(evidenceRoot, runId), "UNUSED-IN-THIS-MODE");
  if (mode === "target") {
    targetSha = needSha(parsed);
    scanRoot = need(parsed, "scan-root");
    controlFixturesRoot = unused;
    controlTreeRoot = unused;
    git = deps.makeGit(need(parsed, "repo"));
  } else {
    scanRoot = unused;
    controlFixturesRoot = need(parsed, "control-fixtures-root");
    controlTreeRoot = need(parsed, "control-tree-root");
  }

  const evidenceDir = joinPath(evidenceRoot, runId);

  // 3. 실행 잠금: 증거 폴더 안에 실행별 파일 하나를 배타적으로 만든다. 이미 있으면 잠금을 얻지 못한 것이다.
  let lockHeld = false;
  try {
    await deps.fs.mkdirp(joinPath(evidenceDir, "semgrep-state"));
    await deps.fs.writeFileExclusive(
      joinPath(evidenceDir, "run.lock"),
      new TextEncoder().encode(`${JSON.stringify({ run_id: runId, mode })}\n`)
    );
    lockHeld = true;
  } catch {
    lockHeld = false;
  }

  const spawn: SpawnSpec = {
    command: bin,
    args: [...SERVER_ARGS],
    cwd: parentOf(rulesCache),
    env: buildChildEnv(deps, evidenceDir),
  };

  const options: HarnessOptions = {
    mode,
    targetSha,
    runId,
    dataDir: deps.dataDir,
    // 하네스 구현 파일이 있는 폴더 = 고정 입력 폴더(data/)의 부모. 하네스 지문을 계산할 때 읽는다.
    harnessRoot: parentOf(deps.dataDir),
    evidenceRoot,
    rulesCacheRoot: rulesCache,
    scanRoot,
    controlFixturesRoot,
    controlTreeRoot,
    spawn,
    limits: REAL_LIMITS,
    settings: REAL_SETTINGS,
    controlReference: null,
    // 관측하지 않은 사실은 관측한 척하지 않는다. 사전 검사가 이 null들을 사유로 읽는다.
    toolVersionObserved: null,
    wheelSha256Observed: null,
    lockHeld,
    foreignServerProcesses: null,
    metricsReceiverHits: null,
    ...(deps.signal ? { signal: deps.signal } : {}),
  };

  // 4. 방지 장치를 통과한 이 경로에서만 "real" 포트를 만든다.
  const result = await runHarness(
    { fs: deps.fs, git, process: deps.makeProcessPort("real"), clock: deps.clock },
    options
  );
  const record = result.record;
  const complete = result.ok && record !== null && record.measurement.complete;
  deps.stdout(
    json({
      command: "run",
      status: record?.measurement.status ?? "HARD_FAILURE",
      ok: result.ok,
      started: result.started,
      complete,
      failure: result.failure ?? null,
      record:
        record === null
          ? null
          : {
              run_id: record.run_id,
              mode: record.mode,
              provenance: record.provenance,
              trust: record.trust,
              measurement: record.measurement,
              candidate_gate: record.candidate_gate,
            },
      evidence_dir: evidenceDir,
      not_implemented_or_not_verified: NOT_VERIFIED,
    })
  );
  return complete ? EXIT.ok : EXIT.failed;
}

// ── main ────────────────────────────────────────────────────────

// @MX:ANCHOR: [AUTO] CLI의 유일한 진입 함수 — 시험과 실제 진입점이 모두 이 함수를 부른다.
// @MX:REASON: "방지 장치를 통과하기 전에는 프로세스 포트를 만들지 않는다"가 cmdRun 한 곳에서만 지켜진다.
export async function main(argv: readonly string[], deps: CliDeps): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (parsed === "help") {
      deps.stdout(USAGE);
      return EXIT.ok;
    }
    switch (parsed.command) {
      case "precheck":
        return await cmdPrecheck(parsed, deps);
      case "scope":
        return await cmdScope(parsed, deps);
      default:
        return await cmdRun(parsed, deps);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      deps.stderr(`${error.message}\n\n${USAGE}`);
      return EXIT.usage;
    }
    deps.stderr(`예상하지 못한 오류: ${errorText(error)}\n`);
    return EXIT.failed;
  }
}

// ── 진입점(직접 실행할 때만) ─────────────────────────────────────
// 아래는 이 파일을 직접 실행했을 때만 돈다. process.env·argv·exitCode를 만지는 곳은 여기뿐이다.

async function runEntry(): Promise<void> {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  // 출력 파이프를 읽는 쪽이 먼저 닫혀도(`| head`) 충돌하지 않는다. 그 밖의 쓰기 오류는 그대로 올린다.
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") throw error;
    });
  }
  const code = await main(process.argv.slice(2), {
    fs: createNodeFs(),
    makeGit: (repoDir) => createNodeGit({ repoDir, env: process.env }),
    makeProcessPort: (provenance) => createNodeProcessPort({ provenance }),
    clock: new SystemClock(),
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    getEnv: (name) => process.env[name],
    dataDir: fileURLToPath(new URL("./data", import.meta.url)),
    platform: process.platform,
    signal: controller.signal,
  });
  process.exitCode = code;
}

const invokedPath = typeof process.argv[1] === "string" ? resolvePath(process.argv[1]) : "";
if (invokedPath.toLowerCase() === resolvePath(fileURLToPath(import.meta.url)).toLowerCase()) {
  void runEntry();
}
