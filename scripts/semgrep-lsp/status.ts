// Semgrep LSP 외부 하네스(ADR-001, Proposed) — 실패 상태 우선순위와 사유 대응표.
//
// 이 파일은 "겹치는 실패 조건을 하나의 대표 상태로 확정"하는 계약이다. 한 실행에서 여러 사유가
// 동시에 성립할 수 있다. 각 사유(ReasonCode)는 자기 혼자였다면 가졌을 상태를 하나 가리키고,
// 대표 상태는 성립한 사유가 가리키는 상태 중 STATUS_PRIORITY에서 가장 앞선 것이다. 사유는 전부
// 기록한다(대표 상태 하나 + 모든 사유).
//
// 우선순위의 원칙:
//  1. 증거가 완성되는 단계가 이른 것이 앞선다(PH0 → PH1 → 규칙 로딩 → 스캔 → 결과 집합).
//  2. 같은 단계에서는 구체적인 원인이 일반적인 부재보다 앞선다
//     (RULE_LOAD_ERROR·RULE_INVALID가 RULES_NOT_LOADED보다 앞선다).
//  3. 단계를 가리지 않는 일반 실패(프로세스 종료·프레임 오류·한도 초과)는 "실패가 난 단계"의
//     대표 상태로 보고한다. PH1은 INIT_FAILED, PH2는 RULES_NOT_LOADED, PH3·PH4는
//     ENGINE_FAILED(종료·프레임)와 TIMEOUT(장벽·echo·종료 한도)이다.
//
// COMPLETE는 사유가 하나도 없을 때만이다. NOT_RUN은 실행하지 않았다는 뜻이며 우선순위에 없다.

export const STATUS_PRIORITY = [
  "MANIFEST_MISMATCH",
  "ENV_MISMATCH",
  "INIT_FAILED",
  "SETTINGS_MISMATCH",
  "RULE_LOAD_ERROR",
  "RULE_INVALID",
  "RULES_NOT_LOADED",
  "PREFIX_MISSING",
  "RULE_COUNT_MISMATCH",
  "CONTAMINATED",
  "ENGINE_FAILED",
  "TIMEOUT",
  "LATE_DIAGNOSTIC",
  "DUPLICATE_PUBLISH",
  "TARGET_MISMATCH",
  "UNKNOWN_RULE_ID",
  "PARTIAL",
  "CONTROL_MISSING",
  "ISOLATION_VIOLATION",
] as const;

export type FailureStatus = (typeof STATUS_PRIORITY)[number];
export type MeasurementStatus = FailureStatus | "COMPLETE" | "NOT_RUN";

// 사유 → 그 사유가 혼자 가리키는 상태. 새 사유를 추가하면 반드시 여기에 넣는다(타입이 강제한다).
export const REASON_STATUS = {
  // ── PH0: 서버를 띄우기 전 무결성 ─────────────────────────────
  RULES_FILE_ADDED: "MANIFEST_MISMATCH",
  RULES_FILE_REMOVED: "MANIFEST_MISMATCH",
  RULES_FILE_CHANGED: "MANIFEST_MISMATCH",
  RULES_LIST_HASH_MISMATCH: "MANIFEST_MISMATCH",
  RULES_PIN_INCONSISTENT: "MANIFEST_MISMATCH",
  SCAN_TREE_FILE_ADDED: "MANIFEST_MISMATCH",
  SCAN_TREE_FILE_MISSING: "MANIFEST_MISMATCH",
  SCAN_TREE_FILE_CHANGED: "MANIFEST_MISMATCH",
  SCAN_TREE_IGNORED_DIR_NAME: "MANIFEST_MISMATCH",
  TARGET_SHA_UNRESOLVED: "MANIFEST_MISMATCH",
  CONTROL_TREE_MISMATCH: "MANIFEST_MISMATCH",

  TOOL_VERSION_MISMATCH: "ENV_MISMATCH",
  TOOL_VERSION_UNVERIFIED: "ENV_MISMATCH",
  WHEEL_HASH_MISMATCH: "ENV_MISMATCH",
  WHEEL_HASH_UNVERIFIED: "ENV_MISMATCH",
  ENV_VAR_NOT_ALLOWED: "ENV_MISMATCH",
  ENV_URL_NOT_LOOPBACK: "ENV_MISMATCH",
  ENV_PATH_OUTSIDE_EVIDENCE: "ENV_MISMATCH",
  APP_TOKEN_PRESENT: "ENV_MISMATCH",
  LOCK_NOT_ACQUIRED: "ENV_MISMATCH",
  FOREIGN_SERVER_PROCESS: "ENV_MISMATCH",

  // ── PH1: 프로세스·초기화 ─────────────────────────────────────
  SPAWN_FAILED: "INIT_FAILED",
  INIT_RESPONSE_MISSING: "INIT_FAILED",
  INITIALIZED_NOT_SENT: "INIT_FAILED",
  INITIALIZED_REPEATED: "INIT_FAILED",
  INIT_ERROR_RESPONSE: "INIT_FAILED",
  SERVER_VERSION_MISMATCH: "INIT_FAILED",
  SERVER_VERSION_UNREPORTED: "INIT_FAILED",
  EXIT_DURING_INIT: "INIT_FAILED",
  FRAME_ERROR_DURING_INIT: "INIT_FAILED",
  TIMEOUT_INIT: "INIT_FAILED",
  CANCELLED_DURING_INIT: "INIT_FAILED",

  // ── 설정 효과의 간접 증거 ────────────────────────────────────
  SETTINGS_KEY_NOT_ALLOWED: "SETTINGS_MISMATCH",
  AUTO_RULES_FALLBACK: "SETTINGS_MISMATCH",
  REGISTRY_DOWNLOAD_ATTEMPT: "SETTINGS_MISMATCH",
  CI_DISABLED_LOG_MISSING: "SETTINGS_MISMATCH",
  FULL_SCAN_LOG_MISSING: "SETTINGS_MISMATCH",
  LOADING_PATH_OUTSIDE_CONFIG: "SETTINGS_MISMATCH",

  // ── PH2: 규칙 로딩(구체적 원인) ──────────────────────────────
  RULE_FILE_ERRORS_REPORTED: "RULE_LOAD_ERROR",
  LOADING_WITHOUT_DONE: "RULE_LOAD_ERROR",
  LOADING_PAIR_MISSING: "RULE_LOAD_ERROR",
  LOADING_PAIR_UNEXPECTED: "RULE_LOAD_ERROR",
  LOADING_PAIR_DUPLICATE: "RULE_LOAD_ERROR",
  SKIPPING_RULE_LOGGED: "RULE_INVALID",

  // ── PH2: 규칙 로딩(일반적 부재) ──────────────────────────────
  RULES_REFRESHED_MISSING: "RULES_NOT_LOADED",
  CONFIG_PATH_ERROR: "RULES_NOT_LOADED",
  STILL_LOADING_NOTICE: "RULES_NOT_LOADED",
  OPEN_DOCS_MARKER_MISSING: "RULES_NOT_LOADED",
  ERRORS_COUNT_LOG_MISSING: "RULES_NOT_LOADED",
  ECHO_PRE_SCAN_MISSING: "RULES_NOT_LOADED",
  EXIT_DURING_RULES: "RULES_NOT_LOADED",
  FRAME_ERROR_DURING_RULES: "RULES_NOT_LOADED",
  TIMEOUT_RULES: "RULES_NOT_LOADED",
  CANCELLED_DURING_RULES: "RULES_NOT_LOADED",

  // ── 규칙 수·ID 접두어 ────────────────────────────────────────
  RULE_COUNT_IS_DISTINCT_ID_COUNT: "PREFIX_MISSING",
  PUBLISHED_CODE_UNPREFIXED: "PREFIX_MISSING",
  RULE_COUNT_N_MISMATCH: "RULE_COUNT_MISMATCH",
  RULE_COUNT_LOG_MISSING: "RULE_COUNT_MISMATCH",

  // ── 오염: 이번 대상 스캔에 다른 것이 섞임 ────────────────────
  PRE_SCAN_DIAGNOSTIC: "CONTAMINATED",
  MULTI_SCAN_LOG: "CONTAMINATED",
  EXTRA_SCAN_TRIGGER_LOG: "CONTAMINATED",
  MULTIPLE_RULES_REFRESHED: "CONTAMINATED",
  SCAN_REQUEST_REPEATED: "CONTAMINATED",
  DIAGNOSTIC_BEFORE_INIT: "CONTAMINATED",

  // ── PH3·PH4: 서버·전송 실패 ──────────────────────────────────
  EXIT_BEFORE_BARRIER: "ENGINE_FAILED",
  EXIT_NONZERO: "ENGINE_FAILED",
  MALFORMED_FRAME: "ENGINE_FAILED",
  TRUNCATED_FRAME: "ENGINE_FAILED",
  ENGINE_EXCEPTION_LOG: "ENGINE_FAILED",
  CANCELLED_DURING_SCAN: "ENGINE_FAILED",
  STDIN_WRITE_FAILED: "ENGINE_FAILED",
  RESPONSE_ID_UNMATCHED: "ENGINE_FAILED",
  RESPONSE_ID_DUPLICATE: "ENGINE_FAILED",
  CLEANUP_FAILED: "ENGINE_FAILED",

  // ── 한도 초과(장벽·echo·종료) ────────────────────────────────
  NO_BARRIER: "TIMEOUT",
  ECHO_MISSING: "TIMEOUT",
  TIMEOUT_SCAN: "TIMEOUT",
  TIMEOUT_EXIT: "TIMEOUT",

  // ── 결과 집합 ────────────────────────────────────────────────
  DIAGNOSTIC_AFTER_ECHO: "LATE_DIAGNOSTIC",
  DUPLICATE_URI: "DUPLICATE_PUBLISH",
  URI_EXPECTED_NOT_PUBLISHED: "TARGET_MISMATCH",
  URI_PUBLISHED_NOT_EXPECTED: "TARGET_MISMATCH",
  K_NE_PUBLISHED: "TARGET_MISMATCH",
  K_NE_EXPECTED: "TARGET_MISMATCH",
  URI_UNNORMALIZABLE: "TARGET_MISMATCH",
  UNKNOWN_RULE_CODE: "UNKNOWN_RULE_ID",

  // ── 엔진 보고의 완전성 ───────────────────────────────────────
  ENGINE_ERRORS_NONEMPTY: "PARTIAL",
  ENGINE_REPORT_LOG_MISSING: "PARTIAL",
  ENGINE_SKIPPED_RULES_UNEXPLAINED: "PARTIAL",

  // ── 대조 참조(target 전용) ───────────────────────────────────
  CONTROL_REFERENCE_MISSING: "CONTROL_MISSING",
  CONTROL_REFERENCE_NOT_PASS: "CONTROL_MISSING",
  CONTROL_REFERENCE_PIN_MISMATCH: "CONTROL_MISSING",
  CONTROL_REFERENCE_SYNTHETIC: "CONTROL_MISSING",
  N0_UNCONFIRMED: "CONTROL_MISSING",

  // ── 격리 ─────────────────────────────────────────────────────
  METRICS_RECEIVER_HIT: "ISOLATION_VIOLATION",
  METRICS_RECEIVER_NOT_OBSERVING: "ISOLATION_VIOLATION",
} as const satisfies Record<string, FailureStatus>;

export type ReasonCode = keyof typeof REASON_STATUS;

export interface Reason {
  code: ReasonCode;
  /** 사람이 읽는 보충 설명. 기밀·환경변수 값·진단 본문을 넣지 않는다. */
  detail?: string;
}

/** 우선순위 번호(1이 가장 앞선다). */
export function statusRank(status: FailureStatus): number {
  return STATUS_PRIORITY.indexOf(status) + 1;
}

/**
 * 사유 목록에서 대표 상태를 고른다. 사유가 없으면 COMPLETE다.
 * 호출자는 "필수 증거가 있는데 사유가 비어 있는" 경로를 만들지 않을 책임이 있다
 * (필수 증거의 부재는 그 자체가 사유다).
 */
// @MX:ANCHOR: [AUTO] 대표 상태의 단일 결정점 — evaluate·evidence·시험이 모두 의존한다.
// @MX:REASON: 우선순위를 여기서만 결정해야 "COMPLETE·0건" 오인 경로가 한 곳에서 막힌다.
export function representativeStatus(reasons: readonly Reason[]): MeasurementStatus {
  if (reasons.length === 0) return "COMPLETE";
  let best: FailureStatus = REASON_STATUS[reasons[0].code];
  for (const reason of reasons) {
    const status: FailureStatus = REASON_STATUS[reason.code];
    if (statusRank(status) < statusRank(best)) best = status;
  }
  return best;
}

/** 사유를 (상태 순위, 코드, 보충 설명) 순으로 정렬해 직렬화 결과가 항상 같게 한다. */
export function sortReasons(reasons: readonly Reason[]): Reason[] {
  return [...reasons].sort((a, b) => {
    const byRank = statusRank(REASON_STATUS[a.code]) - statusRank(REASON_STATUS[b.code]);
    if (byRank !== 0) return byRank;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return (a.detail ?? "").localeCompare(b.detail ?? "");
  });
}
