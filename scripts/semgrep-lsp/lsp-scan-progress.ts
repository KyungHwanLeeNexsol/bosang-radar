// LSP-SCAN-1 초기 진행 메시지 장벽(순수 모듈): `didOpen` 을 보내기 **전에** stdout 에서 초기 진행 수명주기 두 개가 완전한 프레임으로 끝까지 읽혔는지 판단한다.
// 파일·프로세스·시계를 만지지 않는다. 실시간 추적기(ScanLiveWatch)와 사후 재해석(deriveScanEvidence)이 **같은 함수**(analyzeScanProgress)를 쓴다.
//
// 왜 필요한가(2026-11-03 실제 1회 관측 ABORTED:SERVER_REQUEST_NOT_ALLOWED): 기존 장벽은 stdout `rulesRefreshed` 와 stderr `Scanned open documents` 만 기다렸다.
// 서버는 열린 문서 스캔을 시작하며 `window/workDoneProgress/create`(요청) → `$/progress` begin → end 를 stdout 으로 보내는데, 서버가 stderr 에 이미 쓴 줄과
// stdout 프레임은 서로 다른 파이프라 도착 시각이 서로 말해 주지 않는다. 그래서 stderr 쪽 신호가 다 왔어도 두 번째 진행 묶음은 아직 stdout 에서 읽히지 않을 수 있고,
// 이 상태에서 `didOpen` 을 보내면 늦게 읽힌 초기 진행 요청이 "didOpen 뒤의 서버 요청"(A6)으로 분류된다. A6 를 느슨하게 하지 않고, 대신 **그 요청이 오기를 기다린다**.
//
// 계약(출처를 나눠 적는다. 바이너리와 소스의 대응은 계속 미확인이다):
//  · 소스 도출(고정 커밋 a35fe8306115b3e55274969098cc46f8451d6b4d): `Legacy_scan_helpers.ml` 의 규칙 새로고침(320~335행 근방)은
//      create_progress("Semgrep","Refreshing Rules") → 규칙 읽기 → end_progress → `semgrep/rulesRefreshed` 알림 → 열린 문서 스캔(262~279행 근방) 호출
//    이고, 열린 문서 스캔은 create_progress("Semgrep Scan in Progress","Scanning Open Documents") → 스캔 → end_progress → 진단 알림이다.
//    `Legacy_lsp_.ml` 의 create_progress 는 무작위 UUID 문자열 토큰으로 `window/workDoneProgress/create`(요청, 별도의 UUID 문자열 id) 와 `$/progress`
//    begin(title·message) 알림을 만들고, end_progress 는 같은 토큰의 `{kind:"end"}` 알림이다. 단일 파일 스캔(scan_file)에는 진행 메시지가 없다.
//  · 실제 관측 1회(2026-11-03, 저장된 stdout 원문): 프레임 순서 = 응답, create, begin, end, rulesRefreshed, create, begin, end, 진단.
//    요청 id 와 토큰은 서로 다른 UUID 문자열이었다. 이것은 한 번의 관측이며 소스와 같은 순서임을 확인해 줄 뿐 다른 바이너리의 동작을 보증하지 않는다.
//  · 이 모듈은 위 순서를 계약으로 고정한다: 수명주기 1(REFRESH_RULES) 전체 → rulesRefreshed → 수명주기 2(SCAN_OPEN_DOCUMENTS) 전체. 단계는 begin 의 제목·문구로 알아보고
//    순서는 create 도착 순서로 정한다. 토큰 값(UUID)은 상수로 쓰지 않는다 — 요청마다 새로 만들어지는 값이다.
//
// 완료의 정의(모르거나 불완전한 상태는 완료가 아니다): 올바른 모양의 create 가 **정확히 두 건**, 각각 서로 다른 토큰·서로 다른 요청 id 를 갖고,
// 각 토큰마다 begin 한 건·end 한 건이 완전한 프레임으로 이 순서로 읽혔고, 수명주기가 서로 섞이지 않았고, `rulesRefreshed` 가 정확히 한 번이며 계약 위치에 있다.
//
// 토큰과 요청 id 는 **다른 것**이다: 알림의 토큰은 어떤 create 의 `params.token` 과 값·자료형이 모두 같아야만 등록된 토큰이다. 숫자 1 과 문자열 "1" 은 다른 토큰이고,
// 요청 id 와 같은 값이라는 이유로 토큰으로 인정하지 않는다.

import {
  PROGRESS_CREATE_METHOD,
  PROGRESS_METHOD,
  RULES_REFRESHED_METHOD,
  isValidProgressCreate,
} from "./lsp-rules";
import type { JsonRpcMessage } from "./types";

// ── 계약 상수 ─────────────────────────────────────────────────────

export type ScanProgressStageName = "REFRESH_RULES" | "SCAN_OPEN_DOCUMENTS";

/** 순서가 곧 계약이다: 첫 수명주기가 규칙 새로고침, 둘째가 초기 열린 문서 스캔. */
export const SCAN_PROGRESS_STAGES: readonly {
  stage: ScanProgressStageName;
  title: string;
  message: string;
}[] = Object.freeze([
  Object.freeze({
    stage: "REFRESH_RULES" as const,
    title: "Semgrep",
    message: "Refreshing Rules",
  }),
  Object.freeze({
    stage: "SCAN_OPEN_DOCUMENTS" as const,
    title: "Semgrep Scan in Progress",
    message: "Scanning Open Documents",
  }),
]);

export const SCAN_PROGRESS_LIFECYCLES = SCAN_PROGRESS_STAGES.length;

// ── 입력·출력 ─────────────────────────────────────────────────────

/** stdout 의 한 프레임. index 는 stdout 전체에서의 순번(0부터). 바이트 구간은 사후 해석에서만 안다(실시간에는 null). */
export interface ScanProgressFrame {
  index: number;
  startByte: number | null;
  endByte: number | null;
  message: JsonRpcMessage;
}

export type ScanProgressValueType = "string" | "number";

export interface ScanProgressRequest {
  /** create 프레임들 중 몇 번째인가(0부터). */
  ordinal: number;
  frameIndex: number;
  startByte: number | null;
  endByte: number | null;
  /** isValidProgressCreate 를 통과했는가. */
  valid: boolean;
  idType: ScanProgressValueType | null;
  tokenType: ScanProgressValueType | null;
  /** 값(문자로 줄인 사본). 서버가 만든 일회용 값이다. */
  id: string | null;
  token: string | null;
  /** 이 요청이 수명주기로 등록됐는가(중복 토큰·잘못된 모양이면 등록되지 않는다). */
  lifecycle: number | null;
  duplicate: "REQUEST_ID" | "TOKEN" | "BOTH" | null;
}

export type ScanProgressLifecycleStatus = "CREATED" | "BEGUN" | "COMPLETE";

export interface ScanProgressLifecycle {
  /** create 도착 순서(0부터). 계약상 0 이 새로고침, 1 이 열린 문서 스캔이다. */
  ordinal: number;
  /** begin 의 제목·문구가 가리키는 단계. begin 이 없으면 null, 계약 밖 문구면 "UNKNOWN". */
  stage: ScanProgressStageName | "UNKNOWN" | null;
  token: string;
  tokenType: ScanProgressValueType;
  requestId: string;
  requestIdType: ScanProgressValueType;
  createFrame: number;
  beginFrame: number | null;
  endFrame: number | null;
  createEndByte: number | null;
  beginEndByte: number | null;
  endEndByte: number | null;
  status: ScanProgressLifecycleStatus;
}

export type ScanProgressNotificationOutcome =
  | "ACCEPTED"
  | "MALFORMED"
  | "UNREGISTERED_TOKEN"
  | "KIND_UNEXPECTED"
  | "BEGIN_DUPLICATE"
  | "END_DUPLICATE"
  | "END_WITHOUT_BEGIN"
  | "STAGE_UNEXPECTED";

export interface ScanProgressNotification {
  frameIndex: number;
  startByte: number | null;
  endByte: number | null;
  kind: string | null;
  tokenType: ScanProgressValueType | null;
  /** 어느 수명주기에 붙었는가(등록된 토큰일 때만). */
  lifecycle: number | null;
  /** 이 토큰 값이 어떤 요청 id 와는 같지만 등록된 토큰은 아니다(id 와 토큰을 섞은 경우). */
  tokenIsRequestIdOnly: boolean;
  outcome: ScanProgressNotificationOutcome;
}

export type ScanProgressState = "COMPLETE" | "INCOMPLETE" | "INVALID";

export interface ScanProgressAnalysis {
  /** COMPLETE: 문제 없음. INCOMPLETE: 아직 안 온 프레임만 있고 위반은 없다(더 기다리면 완료될 수 있다). INVALID: 이미 계약을 어겼다(더 기다려도 완료되지 않는다). */
  state: ScanProgressState;
  complete: boolean;
  /** 모든 문제 토큰(정렬·중복 제거). */
  problems: string[];
  /** 기다리면 해소될 수 있는 것(프레임 누락). */
  pending: string[];
  /** 기다려도 해소되지 않는 것(계약 위반). */
  violations: string[];
  requests: ScanProgressRequest[];
  lifecycles: ScanProgressLifecycle[];
  notifications: ScanProgressNotification[];
  rulesRefreshed: { frameIndex: number; startByte: number | null; endByte: number | null }[];
  /** 분석에 들어간 프레임 수(진행과 관련된 것만). */
  framesConsidered: number;
}

// ── 작은 도구 ─────────────────────────────────────────────────────

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueKey(value: string | number): string {
  return typeof value === "string" ? `s:${value}` : `n:${String(value)}`;
}

function tokenText(value: unknown): string {
  return String(value)
    .replace(/[^A-Za-z0-9_.:/$ -]/g, "?")
    .slice(0, 80);
}

const sameKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const have = Object.keys(value).sort();
  const want = [...keys].sort();
  return have.length === want.length && have.every((k, i) => k === want[i]);
};

function stageOf(title: unknown, message: unknown): number | null {
  const at = SCAN_PROGRESS_STAGES.findIndex(
    (s) => title === s.title && message === s.message // 서수 비교: 대소문자·공백·유니코드 정규화를 하지 않는다
  );
  return at < 0 ? null : at;
}

/** 이 메시지가 초기 진행 장벽이 보는 종류인가(진행 요청 시도, 진행 알림, rulesRefreshed). */
export function isScanProgressRelevant(message: JsonRpcMessage): boolean {
  const method = (message as unknown as Record<string, unknown>).method;
  return (
    method === PROGRESS_CREATE_METHOD ||
    method === PROGRESS_METHOD ||
    method === RULES_REFRESHED_METHOD
  );
}

// ── 분석 ──────────────────────────────────────────────────────────

/**
 * stdout 프레임들(도착 순서)에서 초기 진행 장벽의 상태를 만든다. 순수 함수: 같은 프레임이면 같은 결과이고, 프레임을 어떻게 쪼개 받았는지·
 * stderr 가 언제 왔는지는 입력에 없다(스트림 사이의 도착 순서를 쓰지 않는다).
 */
export function analyzeScanProgress(input: readonly ScanProgressFrame[]): ScanProgressAnalysis {
  const frames = [...input].sort((a, b) => a.index - b.index);
  const pending = new Set<string>();
  const violations = new Set<string>();
  const requests: ScanProgressRequest[] = [];
  const lifecycles: ScanProgressLifecycle[] = [];
  const byToken = new Map<string, ScanProgressLifecycle>();
  const requestIds = new Set<string>();
  const notifications: ScanProgressNotification[] = [];
  const refreshed: ScanProgressAnalysis["rulesRefreshed"] = [];
  let considered = 0;

  for (const frame of frames) {
    const m = frame.message as unknown as Record<string, unknown>;
    const method = m.method;
    if (method === PROGRESS_CREATE_METHOD) {
      considered += 1;
      const valid = isValidProgressCreate(frame.message);
      const params = valid ? (m.params as Record<string, unknown>) : null;
      const id = valid ? (m.id as string | number) : null;
      const token = params === null ? null : (params.token as string | number);
      const request: ScanProgressRequest = {
        ordinal: requests.length,
        frameIndex: frame.index,
        startByte: frame.startByte,
        endByte: frame.endByte,
        valid,
        idType: id === null ? null : (typeof id as ScanProgressValueType),
        tokenType: token === null ? null : (typeof token as ScanProgressValueType),
        id: id === null ? null : tokenText(id),
        token: token === null ? null : tokenText(token),
        lifecycle: null,
        duplicate: null,
      };
      requests.push(request);
      if (!valid || id === null || token === null) {
        violations.add("PROGRESS_CREATE_INVALID");
        continue;
      }
      const idDup = requestIds.has(valueKey(id));
      const tokenDup = byToken.has(valueKey(token));
      requestIds.add(valueKey(id));
      if (idDup) violations.add("PROGRESS_REQUEST_ID_DUPLICATE");
      if (tokenDup) violations.add("PROGRESS_TOKEN_DUPLICATE");
      if (idDup || tokenDup) {
        request.duplicate = idDup && tokenDup ? "BOTH" : idDup ? "REQUEST_ID" : "TOKEN";
      }
      if (tokenDup) continue;
      const lifecycle: ScanProgressLifecycle = {
        ordinal: lifecycles.length,
        stage: null,
        token: tokenText(token),
        tokenType: typeof token as ScanProgressValueType,
        requestId: tokenText(id),
        requestIdType: typeof id as ScanProgressValueType,
        createFrame: frame.index,
        beginFrame: null,
        endFrame: null,
        createEndByte: frame.endByte,
        beginEndByte: null,
        endEndByte: null,
        status: "CREATED",
      };
      lifecycles.push(lifecycle);
      byToken.set(valueKey(token), lifecycle);
      request.lifecycle = lifecycle.ordinal;
    } else if (method === PROGRESS_METHOD) {
      considered += 1;
      notifications.push(absorbProgress(frame, m, byToken, requestIds, violations));
    } else if (method === RULES_REFRESHED_METHOD) {
      considered += 1;
      refreshed.push({
        frameIndex: frame.index,
        startByte: frame.startByte,
        endByte: frame.endByte,
      });
    }
  }

  // 수명주기 완성도
  const created = lifecycles.length;
  if (created !== SCAN_PROGRESS_LIFECYCLES) {
    (created < SCAN_PROGRESS_LIFECYCLES ? pending : violations).add(
      `PROGRESS_CREATE_COUNT_${created}`
    );
  }
  lifecycles.forEach((lc, i) => {
    if (i >= SCAN_PROGRESS_LIFECYCLES) return;
    if (lc.beginFrame === null) pending.add(`PROGRESS_BEGIN_MISSING:${i + 1}`);
    else if (lc.endFrame === null) pending.add(`PROGRESS_END_MISSING:${i + 1}`);
    lc.status = lc.endFrame !== null ? "COMPLETE" : lc.beginFrame !== null ? "BEGUN" : "CREATED";
  });

  // 순서: 수명주기 1 전체 → rulesRefreshed(정확히 1회) → 수명주기 2 전체
  if (refreshed.length === 0) pending.add("PROGRESS_RULES_REFRESHED_COUNT_0");
  else if (refreshed.length > 1)
    violations.add(`PROGRESS_RULES_REFRESHED_COUNT_${refreshed.length}`);
  // 스트림 안의 순서는 되돌릴 수 없다: 위치가 어긋난 프레임은 더 기다려도 제자리로 오지 않으므로 위반이다(기다리면 해소되는 누락과 구분한다).
  const [first, second] = lifecycles;
  if (second !== undefined && (first === undefined || first.endFrame === null)) {
    violations.add("PROGRESS_ORDER"); // 수명주기 2 가 1 의 end 보다 먼저 시작됐다
  } else if (first !== undefined && second !== undefined && second.createFrame < first.endFrame!) {
    violations.add("PROGRESS_ORDER");
  }
  if (refreshed.length >= 1) {
    const at = refreshed[0].frameIndex;
    // rulesRefreshed 가 왔는데 수명주기 1 의 end 가 그 앞에 없다 → 이후에 end 가 와도 순서 위반이다
    if (first === undefined || first.endFrame === null || first.endFrame > at) {
      violations.add("PROGRESS_ORDER");
    }
    if (second !== undefined && second.createFrame < at) violations.add("PROGRESS_ORDER");
  }

  const problems = [...new Set([...pending, ...violations])].sort();
  const state: ScanProgressState =
    violations.size > 0 ? "INVALID" : pending.size > 0 ? "INCOMPLETE" : "COMPLETE";
  return {
    state,
    complete: state === "COMPLETE",
    problems,
    pending: [...pending].sort(),
    violations: [...violations].sort(),
    requests,
    lifecycles: lifecycles.map((lc) => ({ ...lc })),
    notifications,
    rulesRefreshed: refreshed,
    framesConsidered: considered,
  };
}

function absorbProgress(
  frame: ScanProgressFrame,
  m: Record<string, unknown>,
  byToken: Map<string, ScanProgressLifecycle>,
  requestIds: Set<string>,
  violations: Set<string>
): ScanProgressNotification {
  const base = {
    frameIndex: frame.index,
    startByte: frame.startByte,
    endByte: frame.endByte,
  };
  const reject = (
    outcome: ScanProgressNotificationOutcome,
    token: string,
    extra: Partial<ScanProgressNotification> = {}
  ): ScanProgressNotification => {
    violations.add(token);
    return {
      ...base,
      kind: null,
      tokenType: null,
      lifecycle: null,
      tokenIsRequestIdOnly: false,
      outcome,
      ...extra,
    };
  };
  const params = m.params;
  const malformed =
    m.id !== undefined ||
    !isPlain(params) ||
    !sameKeys(params, ["token", "value"]) ||
    (typeof params.token !== "string" && typeof params.token !== "number") ||
    !isPlain(params.value) ||
    typeof params.value.kind !== "string";
  if (malformed || !isPlain(params)) return reject("MALFORMED", "PROGRESS_NOTIFICATION_MALFORMED");
  const token = params.token as string | number;
  const value = params.value as Record<string, unknown>;
  const kind = value.kind as string;
  const key = valueKey(token);
  const lc = byToken.get(key);
  const tokenType = typeof token as ScanProgressValueType;
  if (lc === undefined) {
    return reject("UNREGISTERED_TOKEN", "PROGRESS_TOKEN_UNREGISTERED", {
      kind,
      tokenType,
      tokenIsRequestIdOnly: requestIds.has(key),
    });
  }
  const known = { kind, tokenType, lifecycle: lc.ordinal };
  if (kind === "begin") {
    if (lc.beginFrame !== null) return reject("BEGIN_DUPLICATE", "PROGRESS_BEGIN_DUPLICATE", known);
    if (
      !sameKeys(value, ["kind", "title", "message"]) ||
      typeof value.title !== "string" ||
      typeof value.message !== "string"
    ) {
      return reject("MALFORMED", "PROGRESS_NOTIFICATION_MALFORMED", known);
    }
    lc.beginFrame = frame.index;
    lc.beginEndByte = frame.endByte;
    const at = stageOf(value.title, value.message);
    lc.stage = at === null ? "UNKNOWN" : SCAN_PROGRESS_STAGES[at].stage;
    if (at !== lc.ordinal) {
      return reject(
        "STAGE_UNEXPECTED",
        at === null ? "PROGRESS_STAGE_UNKNOWN" : "PROGRESS_STAGE_ORDER",
        known
      );
    }
    return { ...base, ...known, tokenIsRequestIdOnly: false, outcome: "ACCEPTED" };
  }
  if (kind === "end") {
    if (lc.beginFrame === null)
      return reject("END_WITHOUT_BEGIN", "PROGRESS_END_WITHOUT_BEGIN", known);
    if (lc.endFrame !== null) return reject("END_DUPLICATE", "PROGRESS_END_DUPLICATE", known);
    if (!sameKeys(value, ["kind"]))
      return reject("MALFORMED", "PROGRESS_NOTIFICATION_MALFORMED", known);
    lc.endFrame = frame.index;
    lc.endEndByte = frame.endByte;
    return { ...base, ...known, tokenIsRequestIdOnly: false, outcome: "ACCEPTED" };
  }
  return reject("KIND_UNEXPECTED", "PROGRESS_KIND_UNEXPECTED", known);
}

// ── 실시간 추적기 ─────────────────────────────────────────────────

/**
 * stdout 메시지를 도착 순서대로 받아 두는 증분 추적기. 상태는 analyzeScanProgress 가 만든다(사후 재해석과 같은 함수).
 * `didOpen` 을 쓰기 직전에 freeze() 하면 그 시점의 분석이 따로 남는다 — 이후 도착하는 프레임은 사전 장벽에 영향을 주지 못한다.
 */
export class ScanProgressTracker {
  private frames: ScanProgressFrame[] = [];
  private cache: ScanProgressAnalysis | null = null;
  private frozen: ScanProgressAnalysis | null = null;
  private seen = 0;

  /** 디코딩된 stdout 메시지 하나(관련 없는 메시지도 순번만 센다). */
  absorb(message: JsonRpcMessage): void {
    const index = this.seen;
    this.seen += 1;
    if (this.frozen !== null) return;
    if (!isScanProgressRelevant(message)) return;
    this.frames.push({ index, startByte: null, endByte: null, message });
    this.cache = null;
  }

  /** 지금까지의 분석(freeze 뒤에는 freeze 시점의 분석). */
  analysis(): ScanProgressAnalysis {
    if (this.frozen !== null) return this.frozen;
    this.cache ??= analyzeScanProgress(this.frames);
    return this.cache;
  }

  freeze(): void {
    this.frozen ??= this.analysis();
  }

  get isFrozen(): boolean {
    return this.frozen !== null;
  }
}
