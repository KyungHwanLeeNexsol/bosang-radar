// LSP `initializationOptions` 생성과 허용 키 검사(ADR C3, D9). 순수 모듈이다.
//
// 왜 키를 막는가: 실제 서버는 `scan`·`metrics` 객체에 알 수 없는 키가 하나라도 있으면 역직렬화가 실패하고
// 객체 전체를 기본값(ci=true, onlyGitDirty=true, configuration=[] → 레지스트리 auto / metrics.enabled=true)으로
// 조용히 되돌린다(ADR 확인한 사실 "설정"). 서버는 그 사실을 알려주지 않으므로, 막는 일은 보내기 전에
// 하네스가 해야 한다. 허용 목록은 "서버가 받는 키"가 아니라 "하네스가 의도적으로 정하는 키"다.
//
// 한계(미확인, ADR U8): 아래 키 이름이 실제 서버에서 그대로 받아들여지는지는 실제 실행으로 확인하지
// 않았다. 키 이름은 소스 읽기(`Legacy_user_settings.ml`·`Legacy_ls_metrics.ml`)에서 옮긴 것이고, 여기서 만든
// 값은 "요청한 값"이다 — 서버가 그 값을 적용했다는 관측이 아니다(`requestedSettingsRecord`도 그렇게 표시한다).
//
// 공개 API:
//   buildInitializationOptions(params): InitializationOptions
//   validateInitializationOptions(opts: unknown): Reason[]    SETTINGS_KEY_NOT_ALLOWED
//   requestedSettingsRecord(opts: unknown): RequestedSettingsRecord
//   ALLOWED_TOP_LEVEL_KEYS / ALLOWED_SCAN_KEYS / ALLOWED_METRICS_KEYS

import type { Reason } from "./status";

export const ALLOWED_TOP_LEVEL_KEYS = ["metrics", "scan"] as const;
export const ALLOWED_SCAN_KEYS = [
  "ci",
  "configuration",
  "maxTargetBytes",
  "onlyGitDirty",
  "pro_intrafile",
  "timeout",
  "timeoutThreshold",
] as const;
export const ALLOWED_METRICS_KEYS = ["enabled"] as const;

export interface InitializationOptions {
  scan: {
    ci: false;
    configuration: string[];
    maxTargetBytes: number;
    onlyGitDirty: false;
    pro_intrafile: boolean;
    timeout: number;
    timeoutThreshold: number;
  };
  metrics: { enabled: false };
}

export interface InitializationOptionsParams {
  /** 구성 디렉터리(서버 cwd 기준 상대 경로, 예: `semgrep-rules/javascript`). */
  configuration: readonly string[];
  maxTargetBytes: number;
  /** 파일당 시간 제한(초). */
  timeout: number;
  timeoutThreshold: number;
  /** 기본 false. 효과는 로그로 관측되지 않는다(ADR C3). */
  proIntrafile?: boolean;
}

/**
 * 레지스트리·앱·내려받기로 풀리는 규칙 출처(`Rules_config.ml`). 서버는 이 문자열들을 로컬 경로보다 먼저 특수 값으로 읽는다.
 *  · 정확히 일치하는 특수 문자열: auto, r2c, policy, supply-chain, hooks
 *  · 접두어: r/…, p/…, s/…, http://…, https://…
 * 대소문자는 구별하지 않고 거절한다(서버가 구별하더라도 이쪽이 더 엄격한 방향이다). 로컬 상대 경로(`semgrep-rules/javascript`)와
 * 절대 경로는 여기에 걸리지 않는다.
 */
const NETWORK_SOURCE_EXACT = /^(auto|r2c|policy|supply-chain|hooks)$/i;
const NETWORK_SOURCE_PREFIX = /^([rps]\/|https?:\/\/)/i;

/** 규칙 출처 문자열 하나가 레지스트리·앱·내려받기로 풀리는 특수 값인가. */
export function isNetworkRuleSource(entry: string): boolean {
  return NETWORK_SOURCE_EXACT.test(entry) || NETWORK_SOURCE_PREFIX.test(entry);
}

function requireNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name}는 0 이상의 정수여야 한다`);
  }
}

export function buildInitializationOptions(
  params: InitializationOptionsParams
): InitializationOptions {
  if (!Array.isArray(params.configuration) || params.configuration.length === 0) {
    throw new Error("configuration이 비어 있다(비면 서버가 레지스트리 auto로 돌아간다)");
  }
  for (const entry of params.configuration) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error("configuration 항목은 비어 있지 않은 문자열이어야 한다");
    }
    if (isNetworkRuleSource(entry)) {
      throw new Error(`configuration에 네트워크로 풀리는 규칙 출처가 있다: ${entry}`);
    }
  }
  requireNonNegativeInteger("maxTargetBytes", params.maxTargetBytes);
  requireNonNegativeInteger("timeout", params.timeout);
  requireNonNegativeInteger("timeoutThreshold", params.timeoutThreshold);
  return {
    scan: {
      ci: false,
      configuration: [...params.configuration],
      maxTargetBytes: params.maxTargetBytes,
      onlyGitDirty: false,
      pro_intrafile: params.proIntrafile ?? false,
      timeout: params.timeout,
      timeoutThreshold: params.timeoutThreshold,
    },
    metrics: { enabled: false },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareKeys(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function notAllowed(detail: string): Reason {
  return { code: "SETTINGS_KEY_NOT_ALLOWED", detail };
}

function checkLevel(
  name: "scan" | "metrics",
  value: unknown,
  allowed: readonly string[],
  out: Reason[]
): void {
  if (!isPlainObject(value)) {
    out.push(notAllowed(`${name}: 객체가 아니다(객체가 아니면 서버가 기본값으로 되돌린다)`));
    return;
  }
  for (const key of Object.keys(value).sort(compareKeys)) {
    if (!allowed.includes(key)) {
      out.push(notAllowed(`${name}.${key}: 허용 키가 아니다`));
    } else if (isPlainObject(value[key])) {
      // 허용 키 아래에 객체를 두는 형태는 하네스가 만들지 않는다: 어느 수준이든 거부한다.
      out.push(notAllowed(`${name}.${key}: 중첩 객체는 허용하지 않는다`));
    }
  }
}

/**
 * 보내기 전 검사. 알 수 없는 키·중첩 객체·객체가 아닌 scan/metrics를 모두 모아 돌려준다.
 * 사유에는 키 이름만 넣고 값은 넣지 않는다. 키 외의 값(예: ci가 정말 false인지)은 이 검사의 대상이 아니다:
 * 값은 buildInitializationOptions가 만들 때 고정하고, 서버 쪽 효과는 로그의 간접 증거(C3)로 본다.
 */
export function validateInitializationOptions(opts: unknown): Reason[] {
  if (!isPlainObject(opts)) return [notAllowed("initializationOptions: 객체가 아니다")];
  const reasons: Reason[] = [];
  for (const key of Object.keys(opts).sort(compareKeys)) {
    if (!(ALLOWED_TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      reasons.push(notAllowed(`${key}: 허용 키가 아니다`));
    }
  }
  if ("scan" in opts) checkLevel("scan", opts.scan, ALLOWED_SCAN_KEYS, reasons);
  else reasons.push(notAllowed("scan: 없다(없으면 서버가 기본값을 쓴다)"));
  if ("metrics" in opts) checkLevel("metrics", opts.metrics, ALLOWED_METRICS_KEYS, reasons);
  else reasons.push(notAllowed("metrics: 없다(없으면 enabled 기본값 true가 된다)"));
  return reasons;
}

export interface RequestedSettingsRecord {
  /** 항상 "requested": 하네스가 보낸 값이다. */
  basis: "requested";
  /** 항상 false: 서버가 이 값을 적용했다는 관측은 없다. */
  observed: false;
  scan: Record<string, unknown>;
  metrics: Record<string, unknown>;
}

function sortedCopy(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(compareKeys)) {
    const item = value[key];
    out[key] = Array.isArray(item) ? [...item] : item;
  }
  return out;
}

/** 증거용: 요청한 값만, 키 정렬로. 허용되지 않는 키가 있는 옵션은 증거로도 만들지 않는다. */
export function requestedSettingsRecord(opts: unknown): RequestedSettingsRecord {
  const reasons = validateInitializationOptions(opts);
  if (reasons.length > 0) {
    throw new Error(
      `허용되지 않는 initializationOptions: ${reasons.map((r) => r.detail).join("; ")}`
    );
  }
  const typed = opts as { scan: Record<string, unknown>; metrics: Record<string, unknown> };
  return {
    basis: "requested",
    observed: false,
    scan: sortedCopy(typed.scan),
    metrics: sortedCopy(typed.metrics),
  };
}
