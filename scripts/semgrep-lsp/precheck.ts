// PH0 사전 검사(ADR C0). 서버를 띄우기 전에 서버 없이 끝나는 검사만 모은다.
// 순수 모듈이다: 파일은 FsPort, git은 GitPort로만 만지고, 프로세스·네트워크·시계를 쓰지 않는다.
// 도구 버전·휠 해시·잠금·다른 서버 프로세스는 이 모듈이 알아내지 않는다 — 호출자가 관측해서 넘기고,
// 관측하지 못했으면(null) 그 자체가 사유다(필수 증거의 부재는 사유다).
//
// 모든 검사는 실패해도 멈추지 않고 사유를 전부 모은다(조기 반환 없음). 사유와 details에는
// 환경변수의 이름만 쓰고 값은 쓰지 않는다(URL은 "host is not loopback"만 말한다).
//
// 공개 API:
//   runPrecheck({ fs, git }, input): Promise<PrecheckResult>
//   buildControlTree(fs, args): Promise<Reason[]>          정적 입력(.in)을 실제 확장자로 복사한 대조 트리
//   ALLOWED_SEMGREP_ENV / SEMGREP_URL_ENV / SEMGREP_PATH_ENV
//
// 허용 환경변수 목록은 이 하네스가 스스로 정하는 이름이며, 이름이 실제 Semgrep이 읽는 이름과 같다는 것은
// 확인하지 않았다(rev2는 METRICS_URL·VERSION_CHECK_URL만 이름으로 명시한다). 목록에 없는 SEMGREP_* 는 모두 거부한다.

import { compareRulesTree, checkRulesPin } from "./rules-manifest";
import type { RulesTreeConfig } from "./rules-manifest";
import { resolveTarget, computeScope, verifyScanTree } from "./scope";
import { sha256Hex } from "./sha";
import { sortReasons, type Reason } from "./status";
import type {
  ControlExpectations,
  ExpectedRule,
  FsPort,
  GitPort,
  Mode,
  Pin,
  PrecheckResult,
  RuleFileEntry,
  ScopeConfig,
} from "./types";

/** 루프백으로 돌려야 하는 URL 변수(ADR D9). */
export const SEMGREP_URL_ENV = [
  "SEMGREP_APP_URL",
  "SEMGREP_METRICS_URL",
  "SEMGREP_VERSION_CHECK_URL",
] as const;
/** 증거 폴더 안이어야 하는 로그·설정 파일 경로 변수. */
export const SEMGREP_PATH_ENV = [
  "SEMGREP_LOG_FILE",
  "SEMGREP_SETTINGS_FILE",
  "SEMGREP_VERSION_CACHE_PATH",
] as const;
/** 허용 목록 = 위 둘의 합집합. 이 밖의 SEMGREP_* 는 ENV_VAR_NOT_ALLOWED다. */
export const ALLOWED_SEMGREP_ENV: readonly string[] = [...SEMGREP_URL_ENV, ...SEMGREP_PATH_ENV];

/** 토큰·기밀로 보이는 이름. 값이 비어 있어도 있다는 사실 자체가 사유다. */
const SECRET_NAME = /^SEMGREP_.*(TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/;

export interface PrecheckInput {
  pin: Pin;
  rulesFiles: readonly RuleFileEntry[];
  expectedRules: readonly ExpectedRule[];
  rulesTreeConfig: RulesTreeConfig;
  /** 규칙 캐시 디렉터리(`semgrep-rules`) 자신. */
  rulesCacheRoot: string;
  scopeConfig: ScopeConfig;
  mode: Mode;
  /** target 모드에서만 쓴다. control 모드에서는 무시한다. */
  targetSha: string | null;
  /** target 모드: 하네스가 만든 스캔 트리의 위치. */
  scanTreeRoot: string;
  controlExpectations: ControlExpectations;
  /** control 모드: 정적 입력을 실제 확장자로 복사해 둔 트리의 위치. */
  controlTreeRoot: string;
  /**
   * `controlExpectations.cases[].fixture`(저장소 기준 상대 경로)가 놓인 저장소 루트.
   * 정적 입력은 FsPort로 바이트만 읽는다(실행·import하지 않는다).
   */
  controlFixturesRoot: string;
  /** 이름만 본다. 값은 판정에만 쓰고 어디에도 기록하지 않는다. */
  env: Readonly<Record<string, string | undefined>>;
  toolVersionObserved: string | null;
  wheelSha256Observed: string | null;
  lockHeld: boolean | null;
  foreignServerProcesses: number | null;
  /** 로그·설정 파일이 있어야 하는 증거 폴더. */
  evidenceRoot: string;
}

// ── 경로 보조 ────────────────────────────────────────────────────

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function joinRoot(root: string, path: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${path}`;
}

const DRIVE = /^[A-Za-z]:\//;

/**
 * 절대 경로를 '/' 구분으로 정규화한다. 상대 경로이거나 루트 위로 벗어나면 null(해석 불가 = fail-closed).
 * 드라이브 문자 경로는 대소문자를 구분하지 않는다(Windows).
 */
function normalizeAbsolute(input: string): string | null {
  const unified = input.replace(/\\/g, "/");
  const drive = DRIVE.test(unified);
  if (!unified.startsWith("/") && !drive) return null;
  const prefix = drive ? unified.slice(0, 3) : "/";
  const stack: string[] = [];
  for (const part of unified.slice(prefix.length).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
    } else stack.push(part);
  }
  const joined = `${prefix}${stack.join("/")}`;
  return drive ? joined.toLowerCase() : joined;
}

/** 증거 폴더 "안"(폴더 자신은 제외)인가. */
function isInside(path: string, root: string): boolean {
  const p = normalizeAbsolute(path);
  const r = normalizeAbsolute(root);
  if (p === null || r === null) return false;
  const base = r.endsWith("/") ? r : `${r}/`;
  return p.length > base.length && p.startsWith(base);
}

function isLoopbackUrl(value: string): boolean {
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "[::1]") return true;
  const m = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return m !== null && [m[1], m[2], m[3]].every((n) => Number(n) <= 255);
}

// ── 대조 트리 ────────────────────────────────────────────────────

function assertSafeTreePath(path: string): void {
  const parts = path.split("/");
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    parts.some((p) => p === "" || p === "." || p === ".." || p.includes(":"))
  ) {
    throw new Error(`대조 트리에 쓸 수 없는 경로다: ${JSON.stringify(path)}`);
  }
}

function controlMismatch(detail: string): Reason {
  return { code: "CONTROL_TREE_MISMATCH", detail };
}

/** 정적 입력(.in) 바이트가 기대 해시와 같은지 본다. 읽기만 한다. */
async function checkControlSources(
  fs: FsPort,
  expectations: ControlExpectations,
  fixturesRoot: string
): Promise<Reason[]> {
  const reasons: Reason[] = [];
  for (const c of expectations.cases) {
    try {
      const bytes = await fs.readFile(joinRoot(fixturesRoot, c.fixture));
      if (sha256Hex(bytes) !== c.sha256) {
        reasons.push(controlMismatch(`${c.fixture}: 정적 입력의 바이트가 기대 해시와 다르다`));
      }
    } catch (error) {
      reasons.push(
        controlMismatch(`${c.fixture}: 정적 입력을 읽을 수 없다(${(error as Error).message})`)
      );
    }
  }
  return reasons;
}

/**
 * 정적 입력을 실제 확장자로 복사한 새 대조 트리를 만든다. 쓰기 전에 모든 정적 입력의 해시를 확인하고,
 * 하나라도 다르면 아무것도 쓰지 않고 CONTROL_TREE_MISMATCH를 돌려준다. 이미 있는 파일은 덮어쓰지 않는다(예외).
 * 정적 입력은 바이트로만 다룬다: 해석·실행·변환하지 않는다.
 */
export async function buildControlTree(
  fs: FsPort,
  args: { expectations: ControlExpectations; fixturesRoot: string; treeRoot: string }
): Promise<Reason[]> {
  const sources = await checkControlSources(fs, args.expectations, args.fixturesRoot);
  if (sources.length > 0) return sources;
  await fs.mkdirp(args.treeRoot);
  for (const c of args.expectations.cases) {
    assertSafeTreePath(c.path);
    const target = joinRoot(args.treeRoot, c.path);
    await fs.mkdirp(target.slice(0, target.lastIndexOf("/")));
    await fs.writeFileExclusive(target, await fs.readFile(joinRoot(args.fixturesRoot, c.fixture)));
  }
  return [];
}

interface ControlCheck {
  reasons: Reason[];
  treeSha256: string | null;
}

async function checkControlTree(fs: FsPort, input: PrecheckInput): Promise<ControlCheck> {
  const cases = input.controlExpectations.cases;
  const reasons = await checkControlSources(
    fs,
    input.controlExpectations,
    input.controlFixturesRoot
  );

  let listed: string[];
  try {
    listed = await fs.listFilesRecursive(input.controlTreeRoot);
  } catch (error) {
    reasons.push(controlMismatch(`대조 트리를 나열하지 못했다(${(error as Error).message})`));
    return { reasons, treeSha256: null };
  }
  const expected = new Map(cases.map((c) => [c.path, c.sha256]));
  const listedSet = new Set(listed);
  const ignoredDirs = new Set(input.scopeConfig.semgrep_default_ignore.dir_names);
  const added: Reason[] = [];
  const changed: Reason[] = [];
  const ignored: Reason[] = [];
  const actualLines: string[] = [];
  for (const path of listed) {
    let actual = "unreadable";
    try {
      actual = sha256Hex(await fs.readFile(joinRoot(input.controlTreeRoot, path)));
    } catch (error) {
      changed.push(controlMismatch(`${path}: 읽을 수 없다(${(error as Error).message})`));
    }
    actualLines.push(`${path}\t${actual}\n`);
    const want = expected.get(path);
    if (want === undefined) added.push(controlMismatch(`${path}: 기대하지 않은 파일이다`));
    else if (actual !== "unreadable" && actual !== want) {
      changed.push(controlMismatch(`${path}: 내용이 기대 해시와 다르다`));
    }
    if (
      path
        .split("/")
        .slice(0, -1)
        .some((d) => ignoredDirs.has(d))
    ) {
      ignored.push(controlMismatch(`${path}: Semgrep 기본 ignore 디렉터리 이름이 있다`));
    }
  }
  const missing = cases
    .filter((c) => !listedSet.has(c.path))
    .map((c) => controlMismatch(`${c.path}: 대조 트리에 없다`));
  reasons.push(...added, ...missing, ...changed, ...ignored);
  return { reasons, treeSha256: sha256Hex(actualLines.join("")) };
}

// ── 환경변수 ─────────────────────────────────────────────────────

function checkEnv(input: PrecheckInput): { reasons: Reason[]; semgrepVars: number } {
  const reasons: Reason[] = [];
  const names = Object.keys(input.env)
    .filter((k) => input.env[k] !== undefined)
    .map((k) => ({ raw: k, upper: k.toUpperCase() }))
    .filter((n) => n.upper.startsWith("SEMGREP_"))
    .sort((a, b) => compareBytes(a.upper, b.upper));
  for (const { raw, upper } of names) {
    const value = input.env[raw] as string;
    if (SECRET_NAME.test(upper)) {
      reasons.push({ code: "APP_TOKEN_PRESENT", detail: upper });
    } else if (!ALLOWED_SEMGREP_ENV.includes(upper)) {
      reasons.push({ code: "ENV_VAR_NOT_ALLOWED", detail: upper });
    } else if ((SEMGREP_URL_ENV as readonly string[]).includes(upper)) {
      if (!isLoopbackUrl(value)) {
        reasons.push({ code: "ENV_URL_NOT_LOOPBACK", detail: `${upper}: host is not loopback` });
      }
    } else if (!isInside(value, input.evidenceRoot)) {
      reasons.push({
        code: "ENV_PATH_OUTSIDE_EVIDENCE",
        detail: `${upper}: outside the evidence folder`,
      });
    }
  }
  return { reasons, semgrepVars: names.length };
}

// ── 도구 ─────────────────────────────────────────────────────────

type Fact = "match" | "mismatch" | "unverified";

function checkTool(input: PrecheckInput): { reasons: Reason[]; version: Fact; wheel: Fact } {
  const reasons: Reason[] = [];
  let version: Fact;
  if (input.toolVersionObserved === null) {
    version = "unverified";
    reasons.push({ code: "TOOL_VERSION_UNVERIFIED", detail: "도구 버전을 관측하지 못했다" });
  } else if (input.toolVersionObserved !== input.pin.semgrep.version) {
    version = "mismatch";
    reasons.push({
      code: "TOOL_VERSION_MISMATCH",
      detail: `관측 ${input.toolVersionObserved} ≠ 핀 ${input.pin.semgrep.version}`,
    });
  } else version = "match";

  const wheel = input.pin.semgrep.wheel;
  let wheelFact: Fact;
  if (wheel.sha256 === null || !wheel.verified) {
    // 핀의 값이 확인된 것이 아니면 관측값이 있어도 비교할 기준이 없다(fail-closed).
    wheelFact = "unverified";
    reasons.push({ code: "WHEEL_HASH_UNVERIFIED", detail: "핀의 휠 sha256이 확인되지 않았다" });
  } else if (input.wheelSha256Observed === null) {
    wheelFact = "unverified";
    reasons.push({ code: "WHEEL_HASH_UNVERIFIED", detail: "휠 sha256을 관측하지 못했다" });
  } else if (input.wheelSha256Observed !== wheel.sha256) {
    wheelFact = "mismatch";
    reasons.push({ code: "WHEEL_HASH_MISMATCH", detail: "관측한 휠 sha256이 핀과 다르다" });
  } else wheelFact = "match";
  return { reasons, version, wheel: wheelFact };
}

// ── 실행 ─────────────────────────────────────────────────────────

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runPrecheck(
  ports: { fs: FsPort; git: GitPort },
  input: PrecheckInput
): Promise<PrecheckResult> {
  const { fs, git } = ports;
  const reasons: Reason[] = [];
  const details: Record<string, unknown> = {
    mode: input.mode,
    expected_rules: input.expectedRules.length,
    rules_files_expected: input.rulesFiles.length,
    target_sha: null,
    scope_sha256: null,
    scope_included: null,
    scope_excluded_counts: null,
    control_tree_sha256: null,
    control_cases: null,
  };

  // C0 (b): 규칙 트리. 목록 자체의 모순(핀)과 캐시 내용의 어긋남을 모두 본다.
  try {
    reasons.push(...checkRulesPin(input.rulesFiles, input.expectedRules, input.pin.rules));
  } catch (error) {
    reasons.push({
      code: "RULES_PIN_INCONSISTENT",
      detail: `목록을 검사하지 못했다: ${errorText(error)}`,
    });
  }
  try {
    reasons.push(
      ...(await compareRulesTree(fs, input.rulesCacheRoot, input.rulesFiles, input.rulesTreeConfig))
    );
  } catch (error) {
    reasons.push({
      code: "RULES_LIST_HASH_MISMATCH",
      detail: `규칙 캐시를 검사하지 못했다: ${errorText(error)}`,
    });
  }

  if (input.mode === "target") {
    // C0 (c): 대상 SHA → E → 스캔 트리.
    if (input.targetSha === null) {
      reasons.push({ code: "TARGET_SHA_UNRESOLVED", detail: "target 모드인데 대상 SHA가 없다" });
    } else {
      const target = await resolveTarget(git, input.targetSha);
      if (!target.ok) reasons.push(...target.reasons);
      else {
        details.target_sha = target.sha;
        try {
          const scope = await computeScope(git, target.sha, input.scopeConfig);
          details.scope_sha256 = scope.scopeSha256;
          details.scope_included = scope.included.length;
          details.scope_excluded_counts = scope.excludedCounts;
          try {
            reasons.push(
              ...(await verifyScanTree(fs, scope, input.scanTreeRoot, input.scopeConfig))
            );
          } catch (error) {
            reasons.push({
              code: "SCAN_TREE_FILE_MISSING",
              detail: `스캔 트리를 검사하지 못했다: ${errorText(error)}`,
            });
          }
        } catch (error) {
          reasons.push({
            code: "TARGET_SHA_UNRESOLVED",
            detail: `대상 SHA에서 범위를 계산하지 못했다: ${errorText(error)}`,
          });
        }
      }
    }
  } else {
    // control 모드는 스캔 트리 대신 정적 입력으로 만든 대조 트리를 본다.
    details.control_cases = input.controlExpectations.cases.length;
    try {
      const control = await checkControlTree(fs, input);
      reasons.push(...control.reasons);
      details.control_tree_sha256 = control.treeSha256;
    } catch (error) {
      reasons.push(controlMismatch(`대조 트리를 검사하지 못했다: ${errorText(error)}`));
    }
  }

  // C0 (a): 도구·휠.
  const tool = checkTool(input);
  reasons.push(...tool.reasons);
  details.tool_version = tool.version;
  details.wheel_sha256 = tool.wheel;

  // C0 (d): 환경.
  const env = checkEnv(input);
  reasons.push(...env.reasons);
  details.env_semgrep_vars = env.semgrepVars;

  // C0 (e): 잠금·다른 서버 프로세스.
  if (input.lockHeld !== true) {
    reasons.push({
      code: "LOCK_NOT_ACQUIRED",
      detail: input.lockHeld === null ? "잠금 상태를 확인하지 못했다" : "실행 잠금을 얻지 못했다",
    });
  }
  details.lock_held = input.lockHeld;
  if (input.foreignServerProcesses === null) {
    reasons.push({
      code: "FOREIGN_SERVER_PROCESS",
      detail: "다른 서버 프로세스 여부를 확인하지 못했다",
    });
  } else if (input.foreignServerProcesses > 0) {
    reasons.push({
      code: "FOREIGN_SERVER_PROCESS",
      detail: `같은 트리에 다른 서버 프로세스가 ${input.foreignServerProcesses}개 있다`,
    });
  }
  details.foreign_server_processes = input.foreignServerProcesses;

  const sorted = sortReasons(reasons);
  const counts: Record<string, number> = {};
  for (const r of sorted) counts[r.code] = (counts[r.code] ?? 0) + 1;
  details.reason_counts = Object.fromEntries(
    Object.keys(counts)
      .sort(compareBytes)
      .map((code) => [code, counts[code]])
  );
  return { reasons: sorted, details };
}
