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
}
