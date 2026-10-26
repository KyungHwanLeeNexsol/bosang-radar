// Semgrep LSP 외부 하네스(ADR-001, Proposed) — 공용 타입 계약.
//
// 구조의 요지: 판정은 "트랜스크립트(실행 기록) + 고정 입력"의 순수 함수다. 프로세스·시계·파일·git은
// 모두 포트(인터페이스)로 주입하므로 실제 Semgrep 없이 합성 트랜스크립트와 스텁으로 시험한다.
// 스텁으로 얻은 결과는 provenance "stub"이며 실제 탐지 성공이나 Windows 호환성의 증거가 아니다.

import type { MeasurementStatus, Reason } from "./status";

export const SCHEMAS = {
  transcript: "semgrep-lsp-transcript/1",
  run: "semgrep-lsp-run/1",
  pin: "semgrep-lsp-pin/1",
  scope: "semgrep-lsp-scope/1",
  controlExpectations: "semgrep-lsp-control-expectations/1",
} as const;

export type Mode = "control" | "target";
export type Phase = "PH0" | "PH1" | "PH2" | "PH3" | "PH4";
/** real: 실제 도구를 띄운 실행. stub: 시험용 스텁(실제 Semgrep이 아니다). */
export type Provenance = "real" | "stub";

// ── JSON-RPC ────────────────────────────────────────────────────

export type JsonRpcId = string | number;

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: JsonRpcId | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

export type FrameErrorKind = "MALFORMED" | "TRUNCATED";

// ── 트랜스크립트 ────────────────────────────────────────────────

/** 각 스트림에서 그 시점까지 받은 메시지·줄의 개수. 스트림 사이의 도착 순서에 기대지 않는 위치 표지다. */
export interface Cursor {
  stdout: number;
  stderr: number;
}

export type SendLabel =
  | "initialize"
  | "initialized"
  | "echo-pre-scan"
  | "scan-workspace"
  | "echo-post-barrier"
  | "shutdown"
  | "exit";

interface EventBase {
  /** 기록 순번(0부터, 연속). */
  seq: number;
  /** 시계가 준 시각(ms). 판정에는 쓰지 않고 보고용이다. */
  t: number;
}

export type TranscriptEvent =
  | (EventBase & { kind: "phase"; phase: Phase; cursor: Cursor })
  | (EventBase & { kind: "spawn"; pid: number | null })
  | (EventBase & { kind: "spawn-failed"; message: string })
  | (EventBase & {
      kind: "send";
      label: SendLabel;
      message: JsonRpcMessage;
      cursor: Cursor;
    })
  | (EventBase & { kind: "stdout-message"; index: number; message: JsonRpcMessage })
  | (EventBase & {
      kind: "stdout-frame-error";
      error: FrameErrorKind;
      detail: string;
      atByte: number;
    })
  | (EventBase & { kind: "stdout-eof" })
  | (EventBase & { kind: "stderr-line"; index: number; text: string; partial: boolean })
  | (EventBase & { kind: "stderr-eof" })
  | (EventBase & { kind: "stdin-error"; message: string })
  | (EventBase & { kind: "timeout"; phase: Phase; waitingFor: string; afterMs: number })
  | (EventBase & { kind: "cancelled"; phase: Phase })
  | (EventBase & { kind: "kill"; signal: string; reason: string })
  | (EventBase & {
      kind: "exit";
      code: number | null;
      signal: string | null;
      byHarness: boolean;
    })
  | (EventBase & { kind: "cleanup"; ok: boolean; detail?: string });

export interface TranscriptMeta {
  schema: typeof SCHEMAS.transcript;
  runId: string;
  mode: Mode;
  provenance: Provenance;
  targetSha: string | null;
}

export interface Transcript {
  meta: TranscriptMeta;
  events: TranscriptEvent[];
}

// ── 포트 ────────────────────────────────────────────────────────

export interface TimerHandle {
  cancel(): void;
}

export interface Clock {
  /** 단조 증가하는 현재 시각(ms). */
  now(): number;
  setTimer(fn: () => void, ms: number): TimerHandle;
  sleep(ms: number): Promise<void>;
}

export interface SpawnSpec {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
}

export interface ExitInfo {
  code: number | null;
  signal: string | null;
}

export interface ChildHandle {
  readonly pid: number | null;
  /** 두 스트림은 서로 독립된 비동기 반복자이며 호출자가 각각 따로 끝까지 읽는다. */
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: AsyncIterable<Uint8Array>;
  /** 닫힌 stdin·EPIPE는 거부(reject)로 알린다. */
  writeStdin(data: Uint8Array): Promise<void>;
  endStdin(): Promise<void>;
  kill(signal?: "SIGTERM" | "SIGKILL"): void;
  readonly exited: Promise<ExitInfo>;
  /** 멱등. 스트림·리스너·타이머를 모두 풀고, 살아 있으면 종료시킨다. */
  dispose(): Promise<void>;
}

export interface ProcessPort {
  readonly provenance: Provenance;
  /** 실행 파일을 띄우지 못하면 거부(reject)한다. */
  spawn(spec: SpawnSpec): Promise<ChildHandle>;
}

export interface FsPort {
  readFile(path: string): Promise<Uint8Array>;
  /** 이미 있으면 거부한다(증거를 덮어쓰지 않는다). */
  writeFileExclusive(path: string, data: Uint8Array): Promise<void>;
  mkdirp(path: string): Promise<void>;
  /** root 기준 상대 경로('/' 구분), 점 파일 포함, 경로 오름차순. 디렉터리는 포함하지 않는다. */
  listFilesRecursive(root: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  /**
   * 이 포트가 path로 **실제로 접근할 자리**를 비교 키로 바꾼다 — 심볼릭 링크·junction·`.`·`..`·상대 경로를 이 포트의 파일 접근과
   * 같은 의미로 푼 정규 경로이고, 구분자는 '/'이며, 대소문자를 구분하지 않는 플랫폼은 소문자다. 아직 없는 끝부분은 존재하는 접두를
   * 기준으로 붙인다. 두 키의 포함 관계(path-containment.ts)가 두 경로의 실제 포함 관계다. **읽기만 한다**(아무것도 만들지 않는다).
   * 안전하게 풀 수 없으면 던진다 — 호출자는 쓰기 전에 거절한다.
   */
  physicalKey(path: string): Promise<string>;
}

export interface GitTreeEntry {
  path: string;
  /** git 모드 문자열(예: "100644", "120000" 심볼릭 링크, "160000" 서브모듈). */
  mode: string;
  type: "blob" | "commit";
  blobSha: string;
  /** 바이트 크기. 서브모듈(commit)은 null. */
  size: number | null;
}

export interface GitPort {
  /** 전체 40자 커밋 SHA로 해석되면 그 SHA, 아니면 null. */
  resolveCommit(rev: string): Promise<string | null>;
  /** 커밋의 추적 파일 전체(재귀, 트리 항목 제외). */
  lsTree(commitSha: string): Promise<GitTreeEntry[]>;
  readBlob(blobSha: string): Promise<Uint8Array>;
}

// ── 고정 입력 ───────────────────────────────────────────────────

export interface Pin {
  schema: typeof SCHEMAS.pin;
  note: string;
  policy_accepted: false;
  semgrep: {
    version: string;
    commit: string;
    wheel: {
      filename: string | null;
      size_bytes_rev1_reported: number;
      sha256: string | null;
      sha256_rev1_reported: string;
      verified: boolean;
    };
  };
  rules: {
    repo: string;
    commit: string;
    commit_date: string;
    trees: { javascript: string; typescript: string };
    cache_dir_name: string;
    config_dirs: string[];
    yaml_files: number;
    yaml_list_sha256: string;
    expected_rules: number;
    expected_rules_sha256: string;
    expected_final_ids_sorted_sha256: string;
    distinct_original_ids: number;
    duplicate_original_id_groups: number;
    expected_rules_basis: string;
  };
  n0: { expected: number; observed: number | null; confirmed: boolean; value: number | null };
  s0: { observed: number | null; explained: boolean };
  log_format: { status: "UNVERIFIED" | "FROZEN"; prefix_regex: string | null };
  unverified: string[];
}

export type ScopeMatch =
  { kind: "basename-regex"; value: string } | { kind: "dir-prefix"; value: string };

export interface ScopeConfig {
  schema: typeof SCHEMAS.scope;
  note: string;
  extensions: string[];
  language_excluded_suffixes: string[];
  semgrep_default_ignore: { source: string; dir_names: string[]; file_globs: string[] };
  explicit_excludes: { id: string; reason: string; match: ScopeMatch }[];
  max_target_bytes: number;
}

export interface ScopeEntry {
  path: string;
  blobSha: string;
  size: number | null;
  decision: "include" | "exclude";
  /** 제외 사유 식별자(규칙 id 또는 내장 사유). 포함이면 null. */
  reason: string | null;
}

export interface ScopeResult {
  targetSha: string;
  /** 추적 파일 전부에 대한 결정. 모든 경로가 정확히 한 번 나온다. */
  entries: ScopeEntry[];
  /** decision이 include인 항목 = E. */
  included: ScopeEntry[];
  /** 제외 사유별 개수. */
  excludedCounts: Record<string, number>;
  /** E의 "경로\tblobSha" 줄(경로 바이트순 정렬, LF 종료)의 sha256. */
  scopeSha256: string;
}

export interface ControlCase {
  /** 스캔 트리 기준 경로(예: cases/eval.pos.js). */
  path: string;
  /** 저장소의 정적 입력 파일 경로(.in). 실행하거나 import하지 않는다. */
  fixture: string;
  sha256: string;
  kind: "positive" | "normal" | "nosource";
  family: string;
  pair: string | null;
  required: string[];
  allowed: string[];
  forbidden: string[];
  expect_zero: boolean;
  official_backing: string;
}

export interface ControlExpectations {
  schema: typeof SCHEMAS.controlExpectations;
  note: string;
  detection_status: "UNVERIFIED";
  cases: ControlCase[];
}

export interface ExpectedRule {
  file: string;
  originalId: string;
  finalId: string;
  languages: string[];
  mode: string;
  severity: string;
}

export interface RuleFileEntry {
  path: string;
  blobSha: string;
}

// ── PH0 사전 검사 ───────────────────────────────────────────────

export interface PrecheckResult {
  reasons: Reason[];
  /** 증거에 그대로 직렬화되는 요약. 환경변수 값·기밀을 넣지 않는다. */
  details: Record<string, unknown>;
}

// ── 집계·판정 ───────────────────────────────────────────────────

export interface Totals {
  error: number;
  warning: number;
  information: number;
  total: number;
}

export interface ControlCheck {
  id: string;
  kind: "A1" | "A2" | "A3" | "A4" | "PAIR" | "NEGATIVE";
  file: string | null;
  status: "PASS" | "FAIL" | "REVIEW" | "NOT_RUN";
  detail: string;
}

export interface NegativeControlResult {
  /** "R1".."R9". */
  id: string;
  /** preflight: 서버 없는 사전 검사의 거부 / engine: 실제 엔진을 띄운 진단 실행. 두 층은 서로 대신하지 못한다. */
  layer: "preflight" | "engine";
  expected: MeasurementStatus;
  observed: MeasurementStatus | null;
  status: "PASS" | "FAIL" | "NOT_RUN";
  /** 이 결과를 얻은 도구·규칙·하네스·대조 조합의 지문(inputs.binding_sha256). NOT_RUN이면 null이다. */
  binding_sha256: string | null;
}

/**
 * 대조 참조를 이번 실행에 묶는 지문 묶음. 값이 null이면 "확인하지 못함"이며 null끼리는 일치로 치지 않는다.
 * rules_*는 핀·규칙 목록에서 항상 계산되므로 null이 아니다.
 */
export interface ReferenceFingerprints {
  harness_sha256: string | null;
  control_sha256: string | null;
  rules_list_sha256: string;
  rules_expected_sha256: string;
  tool_version: string | null;
  wheel_sha256: string | null;
  binding_sha256: string | null;
}

export type ReferenceRequirementId =
  | "PROVENANCE_REAL"
  | "MEASUREMENT_COMPLETE"
  | "CONTROL_ASSERTIONS_PASS"
  | "N0_CONFIRMED"
  | "FINGERPRINTS_COMPLETE"
  | "NEGATIVE_PREFLIGHT_PASS"
  | "NEGATIVE_ENGINE_PASS"
  | "NEGATIVE_BINDING_MATCH";

/** control 실행이 target의 대조 참조가 될 자격. target 모드에서는 applicable:false다. */
export interface ReferenceQualification {
  applicable: boolean;
  /** applicable이고 모든 요구가 충족될 때만 true. 스텁 출처는 절대 true가 아니다. */
  eligible: boolean;
  requirements: { id: ReferenceRequirementId; satisfied: boolean; detail: string }[];
}

/** 의도적 취약 예제의 필수·금지 탐지, 정상 쌍, 음성 대조의 성공 여부. 보안 판정이 아니다. */
export interface ControlAssertions {
  applicable: boolean;
  status: "PASS" | "FAIL" | "REVIEW_REQUIRED" | "NOT_RUN" | "NOT_APPLICABLE";
  checks: ControlCheck[];
  negative_controls: NegativeControlResult[];
  /** 정상 파일이 0건이 아니었던 경우 등 "대조 설계의 오류" 기록. 정상 기준으로 채택하지 않는다. */
  design_errors: string[];
}

/**
 * 제안된 기준으로 계산한 평가. 이 값은 기존 보안 게이트에 연결되지 않는다.
 * policy_accepted와 counts_as_lsp_security_warnings는 리터럴 false로 봉인한다 — ADR이 Accepted가
 * 되고 별도 변경으로 연결되기 전에는 true가 될 수 없다.
 */
export interface CandidateGate {
  applicable: boolean;
  policy_accepted: false;
  counts_as_lsp_security_warnings: false;
  threshold: "== 0";
  /** target이고 측정이 COMPLETE일 때만 숫자. 그 외는 null(0이 아니다). */
  value: number | null;
  subtotals: { error: number; warning: number; information: number } | null;
  /** WOULD_*는 제안 기준으로 계산한 가상 평가다. PASS/FAIL이라는 단어를 쓰지 않는다. */
  evaluation: "WOULD_PASS" | "WOULD_FAIL" | "UNVERIFIED" | "NOT_APPLICABLE";
}

export interface ObservedFacts {
  rules: {
    loadingPairsOk: string[];
    fileErrorsReported: number | null;
    runningRulesN: number | null;
    skippedRulesS: number | null;
    skippingRuleLogs: string[];
  };
  scan: {
    scannedFilesK: number | null;
    foundMatchesM: number | null;
    /** M − D (서버가 JSON이 같은 진단을 합친 개수). D ≤ M이고 M>0이면 D ≥ 1일 때만 숫자, 아니면 null. */
    matchesDeduplicated: number | null;
    engineErrorsText: string | null;
    barrierSeen: boolean;
    preScanEchoSeen: boolean;
    postBarrierEchoSeen: boolean;
  };
  published: {
    /** 스캔 송신 이후 게시된 진단의 원시 개수 D(하네스 집계·중복 제거 전). 평가할 수 없으면 null. */
    diagnosticCount: number | null;
    uris: string[];
    duplicates: string[];
    missing: string[];
    unexpected: string[];
  };
  totals: Totals | null;
  perFile: Record<string, { error: number; warning: number; information: number; codes: string[] }>;
  perRule: Record<string, number>;
}

export interface Verdict {
  status: MeasurementStatus;
  reasons: Reason[];
  complete: boolean;
  observed: ObservedFacts;
  control_assertions: ControlAssertions;
  candidate_gate: CandidateGate;
}

// ── 증거 레코드(run.json) ───────────────────────────────────────

export type NotExecutedValue = null | "NOT_RUN" | "UNVERIFIED";

// ── 실행 자원(공유 잠금·루프백 메트릭 수신기)의 관측 요약 ─────────────
// 증거에는 건수와 상태만 남긴다: 경로·본문·헤더·토큰·다른 실행의 소유자 정보는 싣지 않는다.

/** 서버가 스캔하는 트리 하나를 범위로 하는 공유 실행 잠금의 요약. */
export interface RunLockSummary {
  scope: "server-tree";
  /** 정규화한 트리 경로 키의 sha256(경로 자체는 싣지 않는다). 해석하지 못했으면 null. */
  tree_key_sha256: string | null;
  /** ACQUIRED: 이 실행이 잠금을 얻었다. REFUSED: 다른 실행이 잡고 있거나 소유자를 읽을 수 없다. ERROR: 잠금을 시도하다 실패했다. */
  state: "ACQUIRED" | "REFUSED" | "ERROR";
  /** state가 ACQUIRED가 아닐 때의 원인 토큰(HELD_BY_OTHER·OWNER_UNREADABLE·TREE_UNRESOLVABLE·ACQUIRE_FAILED). */
  reason: string | null;
  /** 실행별 증거 표지(run.marker) 생성 여부. 공유 잠금이 아니다 — 같은 증거 폴더를 두 번 쓰지 않게 하는 표지다. */
  evidence_marker: "CREATED" | "NOT_CREATED";
}

/**
 * 하네스가 연 루프백 수신기의 관측 요약. hits가 null이면 관측하지 못했다는 뜻이며 0건으로 간주하지 않는다.
 * hits = max(수락한 연결 수, 요청 수 + 잘못된 요청 수). 이 수치는 "이 수신기에서 관찰한 요청"일 뿐이며 다른 목적지로의
 * 통신이 없었다는 뜻이 아니다.
 */
export interface MetricsReceiverSummary {
  bind: "127.0.0.1";
  /** LISTENING: 관측 중. CLOSED: 정상적으로 닫혔다(닫기 전까지의 관측은 유효). FAILED: 열지 못했거나 관측이 깨졌다. */
  state: "LISTENING" | "CLOSED" | "FAILED";
  /** state가 FAILED일 때의 원인 토큰(BIND_FAILED·NOT_LOOPBACK·SERVER_ERROR·CLOSED_EARLY·OBSERVE_FAILED). */
  failure: string | null;
  hits: number | null;
  connections: number;
  requests: number;
  client_errors: number;
}

/** 판정 시점까지의 관측을 돌려주는 수신기 쪽 읽기 포트(하네스는 이것만 안다). */
export interface MetricsObserver {
  observe(): MetricsReceiverSummary;
}

// ── 도구 버전·휠 sha256 관측의 요약 ──────────────────────────────────
// 증거에는 값과 상태 토큰만 남긴다: 실행 파일·아티팩트 경로, 자식 프로세스의 출력 원문은 싣지 않는다(바이트 수만).

/** 버전 확인(`--version`) 자식 프로세스의 정리 결과. LSP 서버 프로세스와는 별개의 프로세스다. */
export type VersionCheckChildState = "NOT_SPAWNED" | "EXITED" | "KILLED" | "KILL_NOT_OBSERVED";

/** 관측 시도의 결과. NOT_ATTEMPTED는 시작하지 않았다는 뜻이며 성공도 실패도 아니다. */
export type ObservationStatus = "OBSERVED" | "FAILED" | "NOT_ATTEMPTED";

/** 하네스가 아닌 호출자(CLI)가 만든 관측 요약. 핀과의 비교는 하네스가 덧붙인다(RunToolObservation). */
export interface ToolObservationSummary {
  version_check: {
    /** 이 프로세스의 역할. LSP 서버(`lsp --debug`)가 아니다. */
    process_role: "version-check";
    /** 이 확인에 쓴 프로세스 포트의 출처. 시작하지 않았으면 null. stub이면 실제 Semgrep의 증거가 아니다. */
    provenance: Provenance | null;
    status: ObservationStatus;
    /** 실패·미시도의 원인 토큰. OBSERVED이면 null. */
    failure: string | null;
    /** stdout에서 해석한 버전 문자열(그대로). 관측하지 못했으면 null. */
    version: string | null;
    /** 넘긴 인자 배열(셸 문자열이 아니다). 시작하지 않았으면 null. */
    args: string[] | null;
    exit: { code: number | null; signal: string | null } | null;
    stdout_bytes: number | null;
    stderr_bytes: number | null;
    duration_ms: number | null;
    child_process: VersionCheckChildState;
    /** 이 확인이 도는 동안 루프백 수신기에 늘어난 요청 건수. 수신기를 관측하지 못했으면 null. */
    metrics_hits_during: number | null;
  };
  wheel_hash: {
    status: ObservationStatus;
    failure: string | null;
    /** 명시한 아티팩트 파일의 실제 바이트로 계산한 SHA-256. 관측하지 못했으면 null. */
    sha256: string | null;
    size_bytes: number | null;
  };
  /**
   * 이 관측이 **세워 주지 않는** 것. 휠 파일의 해시는 그 파일의 바이트에 대한 사실일 뿐 실행한 `semgrep` 실행 파일이 그 휠에서
   * 설치되었다는 사실이 아니다(설치 출처 검증은 하지 않았다). 버전 출력 형식도 실제 Semgrep으로는 확인하지 않았다.
   */
  not_established: {
    executable_provenance: "NOT_VERIFIED";
    version_output_format: "UNVERIFIED";
  };
}

/** run.json에 싣는 관측: 호출자의 요약 + 하네스가 계산한 핀과의 비교(핀을 바꾸지 않는다). */
export interface RunToolObservation extends ToolObservationSummary {
  pin: {
    version: {
      expected: string;
      observed: string | null;
      comparison: "MATCH" | "MISMATCH" | "NOT_OBSERVED";
    };
    wheel: {
      expected_sha256: string | null;
      /** 핀이 이 해시를 확인된 값으로 표시했는가. false이면 관측값이 있어도 비교할 기준이 없다. */
      verified: boolean;
      observed: string | null;
      comparison: "MATCH" | "MISMATCH" | "PIN_UNVERIFIED" | "NOT_OBSERVED";
    };
  };
}

// ── 다른 서버 프로세스 관측 ──────────────────────────────────────────
// 조회 **시점**의 관측이다. 증거에는 상태·건수·이유 토큰만 남긴다: 명령줄·환경변수·경로·PID는 싣지 않는다.

/**
 * 운영체제가 알려 준 프로세스 한 줄. null은 "얻지 못함"(권한·미제공·읽는 도중 사라짐)이며 빈 값으로 보정하지 않는다.
 * args는 인자 배열이다(Windows는 명령줄 문자열을 CommandLineToArgvW 규칙으로 나눈 것).
 */
export interface ProcessRow {
  pid: number;
  ppid: number | null;
  /** 프로세스 시작 시각(epoch ms). 부모 PID 재사용을 가려내는 데만 쓴다. 얻지 못하면 null. */
  startTime: number | null;
  /** 운영체제가 알려 준 이미지 이름(경로 없이). */
  name: string | null;
  executable: string | null;
  args: readonly string[] | null;
  cwd: string | null;
  /** 읽는 도중 프로세스가 끝났다. 읽은 필드는 있을 수 있으나 나머지는 null이다. */
  vanished: boolean;
}

export type ProcessListSource = "windows-cim" | "linux-proc";

export interface ProcessSnapshot {
  source: ProcessListSource;
  /**
   * 부모 PID 연결이 그대로는 믿을 수 없는 운영체제인가(Windows: 부모가 끝나도 자식에 부모 PID가 남고 번호가 재사용된다).
   * true이면 부모의 시작 시각이 자식보다 늦지 않을 때만 부모-자식으로 본다.
   */
  parentLinkNeedsStartTime: boolean;
  rows: readonly ProcessRow[];
}

export type ProcessListFailure =
  | "UNSUPPORTED_PLATFORM"
  | "SPAWN_FAILED"
  | "PERMISSION_DENIED"
  | "TIMEOUT"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "OUTPUT_MALFORMED"
  | "NONZERO_EXIT"
  | "READ_FAILED"
  | "CANCELLED"
  | "UNEXPECTED_ERROR";

export type ProcessListResult =
  { ok: true; snapshot: ProcessSnapshot } | { ok: false; failure: ProcessListFailure };

/** 운영체제 프로세스 목록을 **읽기만** 하는 포트. 신호를 보내거나 프로세스를 끝내지 않는다(자기가 띄운 조회 자식은 제외). */
export interface ProcessLister {
  /** 조회에 쓴 자료의 출처. stub이면 합성 자료이며 실제 운영체제의 관측이 아니다. */
  readonly provenance: Provenance;
  /** 지원하지 않는 환경이면 null(조회는 UNSUPPORTED_PLATFORM으로 끝난다). */
  readonly source: ProcessListSource | null;
  list(options: { signal?: AbortSignal }): Promise<ProcessListResult>;
}

export type ForeignObservationStatus = "OBSERVED" | "INCONCLUSIVE" | "FAILED" | "NOT_ATTEMPTED";

export type ForeignObservationFailure =
  | ProcessListFailure
  | "LOCK_NOT_HELD"
  | "SELF_NOT_IN_LISTING"
  | "SNAPSHOT_INCONSISTENT"
  | "TREE_UNRESOLVABLE";

/** 판별 불가 사유 토큰. 후보 프로세스가 이 사유로 분류되면 건수를 0으로 보정하지 않는다. */
export type ForeignUndeterminedReason =
  | "ARGS_UNAVAILABLE"
  | "ARGS_SCAN_LIMIT"
  | "ROLE_UNCLEAR"
  | "CWD_UNAVAILABLE"
  | "ANCHOR_UNRESOLVABLE"
  | "ANCHOR_ENCLOSES_TREE"
  | "TREE_BINDING_UNOBSERVABLE"
  | "ROW_UNREADABLE"
  | "CANDIDATE_VANISHED";

export interface ForeignServerObservationSummary {
  /** 고정값: 이 관측은 조회한 순간의 사실이다. 조회 이후 하네스 밖에서 시작되는 프로세스는 막지 않는다. */
  scope: "POINT_IN_TIME";
  /**
   * OBSERVED: 건수가 확정됐다(foreign_server_processes가 숫자). INCONCLUSIVE: 목록은 읽었으나 판별하지 못한 후보가 있다(null).
   * FAILED: 목록을 읽지 못했다(null). NOT_ATTEMPTED: 시작하지 않았다(null).
   */
  status: ForeignObservationStatus;
  failure: ForeignObservationFailure | null;
  /** 하네스의 foreignServerProcesses. 같은 트리에서 확인된 다른 서버 건수, 확정하지 못했으면 null. */
  foreign_server_processes: number | null;
  /** 확인된 건수 말고도 판별하지 못한 후보가 있어 실제로는 더 많을 수 있다. */
  count_is_lower_bound: boolean;
  listing: {
    source: ProcessListSource | null;
    provenance: Provenance | null;
    rows: number | null;
  };
  counts: {
    own_process: number;
    own_ancestors: number;
    own_descendants: number;
    version_check: number;
    other_semgrep: number;
    servers_same_tree: number;
    servers_undetermined: number;
    role_undetermined: number;
    unreadable_unrelated: number;
    vanished_not_candidate: number;
  };
  /** 판별하지 못한 후보의 사유별 건수. */
  undetermined_reasons: Partial<Record<ForeignUndeterminedReason, number>>;
  /** 이 관측이 **세워 주지 않는** 것. */
  not_established: {
    /** 식별 규칙(프로그램 이름·인자 토큰)은 실제 Semgrep으로 확인하지 않았다. 합성·스텁 자료는 실제 식별 성공의 증거가 아니다. */
    semgrep_server_identification: "UNVERIFIED";
    /** LSP 서버의 작업 폴더는 stdio로 전달되어 목록에서 보이지 않는다. 같은 트리로 확인되지 않은 보이는 서버는 "다른 트리"가 아니라 판별 불가다. */
    foreign_server_tree_binding: "UNVERIFIED";
    /** 다른 사용자·다른 PID 이름공간(컨테이너)·다른 호스트의 프로세스는 관측하지 않는다. */
    hidden_processes: "NOT_OBSERVED";
  };
}

// ── 음성 대조 실행 기록(스위트) ──────────────────────────────────────
// 음성 대조는 정상 실행과 별개의 진단 실행들이다. 그 결과는 스위트 기록으로 남고, control 실행이 명시한 경로로만 읽어 잇는다.
// 증거(run.json)에는 개수와 토큰만 싣는다: 경로·본문·명령줄은 싣지 않는다.

/** 스위트 항목 하나(id, 층)가 이 결과가 된 까닭. EXECUTED가 아니면 항목은 NOT_RUN이다(PASS로 보정하지 않는다). */
export type NegativeControlOutcome =
  /** 해당 층을 실제로 실행했고 관측으로 PASS/FAIL을 가렸다. */
  | "EXECUTED"
  /** 이 층의 기대 상태가 같은 입력이 반드시 내는 더 앞선 사유에 가려져 실행으로 증명할 수 없다(결정 필요). */
  | "BLOCKED_CONTRACT_CONFLICT"
  /** 변형하지 않은 기준 실행이 깨끗하지 않아(COMPLETE가 아니거나 실행하지 못함) 변형의 효과를 가려낼 수 없다. */
  | "BASELINE_NOT_CLEAN"
  /** 엔진 진단인데 엔진이 뜨지 않았다(사전 검사 사유가 시작을 막았거나 띄우지 못함). */
  | "ENGINE_NOT_STARTED"
  /** 하네스가 하드 실패했거나 던졌다(증거가 모두 쓰이지 않았다). */
  | "RUN_FAILED"
  | "CANCELLED"
  /** 결합(도구·규칙·하네스·대조)을 알 수 없다. */
  | "BINDING_UNAVAILABLE"
  /** 이 실행의 결합이 기준 실행의 결합과 다르다. */
  | "BINDING_DRIFT"
  /** 사례별 작업 공간을 만들지 못했다. */
  | "WORKSPACE_FAILED"
  /** 이 층에는 해당 실행이 없다(표에 사전 검사 항목이 없는 id). */
  | "NO_SUCH_LAYER";

/** run.json resources.negative_control_suite — control 실행이 명시한 스위트 기록을 어떻게 받아들였는지의 요약. */
export interface NegativeControlSuiteSummary {
  accepted: boolean;
  /** 수락하지 않은 이유 토큰(값·경로 없음). 수락했으면 null. */
  rejection: string | null;
  suite_id: string | null;
  /** 스위트를 만든 실행의 출처. stub이면 실제 엔진의 증거가 아니다. */
  provenance: Provenance | null;
  binding_sha256: string | null;
  counts: { pass: number; fail: number; not_run: number };
  /** PASS가 아닌 (id, 층)의 까닭. */
  outcomes: { id: string; layer: "preflight" | "engine"; outcome: NegativeControlOutcome }[];
  /** 증거를 다시 읽다가 걸린 문제 토큰(`R3:engine:EVIDENCE_HASH_MISMATCH` 꼴, 값·경로 없음). 문제가 없으면 빈 배열. */
  problems: string[];
}

/** control 실행이 받는 스위트 입력. 항목은 읽는 쪽이 증거에서 다시 도출한 값이다(저장된 선언이 아니다). */
export interface NegativeControlInput {
  entries: readonly NegativeControlResult[];
  bindingSha256: string | null;
  provenance: Provenance;
  summary: NegativeControlSuiteSummary;
}

/** run.json resources.engine_diagnostic — 이 실행은 엔진 진단이며 정상 control 실행이 아니다(대조 참조가 될 수 없다). */
export interface EngineDiagnosticSummary {
  policy: "ENGINE_DIAGNOSTIC";
  /** 사전 검사 사유가 있었는데도 엔진 진단이라 시작했는가. */
  started_despite_refusals: boolean;
  /** 시작을 막지 않은 사전 검사·설정 검사 사유 코드(토큰만). */
  refusal_codes: string[];
}

export interface RunResources {
  run_lock: RunLockSummary | null;
  metrics_receiver: MetricsReceiverSummary | null;
  /** 도구 버전·휠 해시 관측. 관측 단계를 연결한 호출자(CLI)가 있을 때만 있다. */
  tool_observation?: RunToolObservation | null;
  /** 같은 트리의 다른 서버 프로세스 관측(조회 시점). 관측 단계를 연결한 호출자(CLI)가 있을 때만 있다. */
  foreign_server_observation?: ForeignServerObservationSummary | null;
  /** 음성 대조 스위트 기록을 명시한 control 실행에만 있다. */
  negative_control_suite?: NegativeControlSuiteSummary | null;
  /** 엔진 진단 실행에만 있다. 있으면 이 기록은 대조 참조가 될 수 없다. */
  engine_diagnostic?: EngineDiagnosticSummary | null;
}

export interface RunRecord {
  schema: typeof SCHEMAS.run;
  run_id: string;
  mode: Mode;
  provenance: Provenance;
  /** stub이면 SYNTHETIC. 어떤 경우에도 실제 Semgrep 호환성의 증거로 쓰지 않는다. */
  trust: "SYNTHETIC" | "REAL_UNREVIEWED";
  inputs: {
    target_sha: string | null;
    pin_sha256: string;
    scope_sha256: string | null;
    rules_list_sha256: string;
    rules_expected_sha256: string;
    control_tree_sha256: string | null;
    /** 하네스 구현 파일(.ts/.mjs, 시험·testing·data 제외) 지문. 계산하지 못했으면 null. */
    harness_sha256: string | null;
    /** control-expectations.json + 실제 고정 입력(.in) 바이트 지문. 계산하지 못했으면 null. */
    control_sha256: string | null;
    /** 호출자가 관측한 도구 버전. 관측하지 못했으면 null. */
    tool_version_observed: string | null;
    wheel_sha256_observed: string | null;
    /** 도구·규칙·핀·하네스·대조 지문의 결합. 구성 요소가 하나라도 null이면 null. */
    binding_sha256: string | null;
  };
  /** 측정 완료 여부. 보안 기준 통과 여부가 아니다. */
  measurement: {
    status: MeasurementStatus;
    complete: boolean;
    reasons: Reason[];
    phases_reached: Phase[];
  };
  observed: ObservedFacts;
  control_assertions: ControlAssertions;
  /** target 모드에서 쓴 대조 실행의 요약. control 모드에서는 null. */
  control_reference: {
    run_id: string;
    provenance: Provenance;
    status: MeasurementStatus;
    control_assertions_status: ControlAssertions["status"];
    pin_sha256: string;
    n0_confirmed: boolean;
    /** 참조 쪽의 자기 선언. evaluate는 이 값을 믿지 않고 아래 사실로 자격을 다시 계산한다. */
    eligible: boolean;
    fingerprints: ReferenceFingerprints;
    negative_controls: {
      id: string;
      layer: "preflight" | "engine";
      status: "PASS" | "FAIL" | "NOT_RUN";
      binding_sha256: string | null;
    }[];
  } | null;
  /** control 모드에서 이 실행이 대조 참조가 될 자격이 있는지. target 모드는 applicable:false. */
  reference_qualification: ReferenceQualification;
  candidate_gate: CandidateGate;
  /** 기존 내장 수집기와 공식 게이트는 이 작업으로 바뀌지 않는다. */
  existing_gates: {
    builtin_collector: { status: "UNVERIFIED"; changed: false };
    official_gate: { effect: "NONE"; changed: false };
  };
  /** 아직 실행해 확인하지 못한 값. 스텁 결과로 채우지 않는다. */
  not_executed: Record<string, NotExecutedValue>;
  /**
   * 이 실행이 쥔 자원의 관측 요약(공유 잠금·루프백 수신기). 자원을 연결한 호출자(CLI)가 있을 때만 있다.
   * 판정 시점의 값이며 정리(해제·닫기)의 결과는 담지 않는다.
   */
  resources?: RunResources;
}
