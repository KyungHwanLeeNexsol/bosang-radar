// 합성 트랜스크립트 작성기 (시험 지원). 실제 Semgrep을 띄우지 않고, 판정 로직(evaluate.ts)이 의도대로
// 동작하는지 보기 위한 입력만 만든다. 여기서 만든 어떤 트랜스크립트도 실제 서버의 출력이 아니다.
//
// provenance: 기본은 "stub"이다. 시험이 "real"로 바꾸는 것은 평가기의 provenance 분기 논리를 시험하기 위한
// 것일 뿐이며, 그렇다고 해서 그 트랜스크립트가 실제 실행이 되는 것은 아니다.
//
// 공개 API:
//   happyTranscript(spec): Transcript         evaluateTranscript가 COMPLETE로 판정해야 하는 기준 트랜스크립트
//   renumber(t): Transcript                   seq·t·stdout/stderr 인덱스·cursor를 배열 순서로 다시 매긴다
//   validateTranscript(t): string[]           내부 일관성 위반 목록(비어 있으면 일관됨)
//   assertValidTranscript(t): Transcript      위반이 있으면 던진다
//   변형기(Mutator = (t) => Transcript): 새 트랜스크립트를 돌려주고 입력은 바꾸지 않는다. 결과는 항상 다시
//     번호가 매겨지고 검증된다 — 조용히 모순된 트랜스크립트를 만들 수 없다.
//   pipe(t, ...mutators)
//
// 일관성의 정의(validateTranscript):
//   · seq는 0부터 배열 위치와 같다(연속). t는 줄어들지 않는다.
//   · stdout-message의 index는 stdout 메시지를 배열 순서로 센 값, stderr-line의 index도 같다.
//   · send·phase의 cursor는 그 사건 앞에서 받은 stdout 메시지·stderr 줄의 개수와 같다.
//   · stdout-eof 뒤에 stdout-message가 없다. exit는 많아야 한 번이다. cleanup 개수는 검증하지 않는다 —
//     "정확히 한 건"은 평가기(CLEANUP_FAILED)가 판정할 몫이라, 누락·중복 시험이 변형기로 그 입력을 만들 수 있어야 한다.
// 스트림 사이의 도착 순서(seq)는 증거가 아니라는 점은 변형기 `moveAcrossStreams`로 시험한다 — 같은 스트림 안의
// 순서를 바꾸지 않고 서로 다른 스트림의 사건 위치만 옮긴다.

import type { LspDiagnostic } from "../aggregate";
import { expectedUri } from "../uri";
import type {
  JsonRpcMessage,
  Mode,
  Phase,
  Provenance,
  SendLabel,
  Transcript,
  TranscriptEvent,
} from "../types";
import { SCHEMAS } from "../types";

// ── 기준 트랜스크립트 ──────────────────────────────────────────

export interface HappySpec {
  runId?: string;
  mode: Mode;
  /** 기본 "stub". */
  provenance?: Provenance;
  targetSha?: string | null;
  /** 스캔 트리의 절대 경로(게시 URI를 만들 때 쓴다). */
  scanRoot: string;
  /** 스캔 트리 기준 상대 경로. 이 순서로 게시한다. */
  expectedPaths: readonly string[];
  /** 서버가 로딩 줄에 찍는 경로(그대로). 경로마다 loading/Done loading 쌍을 만든다. */
  loadingPaths: readonly string[];
  /** initialize 결과의 serverInfo.version. null이면 serverInfo를 아예 보내지 않는다. */
  serverVersion: string | null;
  /** `Running Semgrep with N rules`. */
  n: number;
  /** `Semgrep skipped S rules`. */
  s: number;
  /** `Scanned K files`. */
  k: number;
  /** `Found M matches`. */
  m: number;
  /** 상대 경로 → 그 파일에 게시할 진단. 없으면 빈 목록. */
  diagnostics?: Readonly<Record<string, readonly LspDiagnostic[]>>;
  /** `Semgrep errors:` 뒤의 본문(기본 빈 문자열). */
  engineErrorsText?: string;
}

export const IDS = {
  initialize: "init-1",
  echoPre: "echo-pre-1",
  echoPost: "echo-post-1",
  shutdown: "shutdown-1",
} as const;

type Draft = TranscriptEvent;

/** 번호와 cursor는 renumber가 채우므로 초안에는 자리만 둔다. */
function draftBase() {
  return { seq: 0, t: 0 };
}

const ZERO = { stdout: 0, stderr: 0 };

export function notification(method: string, params?: unknown): JsonRpcMessage {
  const m: JsonRpcMessage = { jsonrpc: "2.0", method };
  if (params !== undefined) m.params = params;
  return m;
}

export function request(id: string | number, method: string, params?: unknown): JsonRpcMessage {
  const m: JsonRpcMessage = { jsonrpc: "2.0", id, method };
  if (params !== undefined) m.params = params;
  return m;
}

export function response(id: string | number, result: unknown): JsonRpcMessage {
  return { jsonrpc: "2.0", id, result };
}

export function errorResponse(id: string | number, code: number, message: string): JsonRpcMessage {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function publishMessage(uri: string, diagnostics: readonly LspDiagnostic[]): JsonRpcMessage {
  return notification("textDocument/publishDiagnostics", {
    uri,
    diagnostics: structuredClone(diagnostics),
  });
}

function sendEvent(label: SendLabel, message: JsonRpcMessage): Draft {
  return { ...draftBase(), kind: "send", label, message, cursor: { ...ZERO } };
}
function phaseEvent(phase: Phase): Draft {
  return { ...draftBase(), kind: "phase", phase, cursor: { ...ZERO } };
}
function stdoutEvent(message: JsonRpcMessage): Draft {
  return { ...draftBase(), kind: "stdout-message", index: 0, message };
}
function stderrEvent(text: string): Draft {
  return { ...draftBase(), kind: "stderr-line", index: 0, text, partial: false };
}

export function happyTranscript(spec: HappySpec): Transcript {
  const events: Draft[] = [];
  const push = (e: Draft) => {
    events.push(e);
  };
  const err = (text: string) => push(stderrEvent(text));

  push({ ...draftBase(), kind: "spawn", pid: 4242 });
  push(phaseEvent("PH1"));
  push(
    sendEvent(
      "initialize",
      request(IDS.initialize, "initialize", { processId: null, rootUri: null, capabilities: {} })
    )
  );
  const info =
    spec.serverVersion === null
      ? {}
      : { serverInfo: { name: "Semgrep", version: spec.serverVersion } };
  push(stdoutEvent(response(IDS.initialize, { capabilities: {}, ...info })));
  push(sendEvent("initialized", notification("initialized", {})));

  push(phaseEvent("PH2"));
  err("Refreshing rules");
  for (const path of spec.loadingPaths) {
    err(`loading local config from ${path}`);
    err(`Done loading local config from ${path}`);
  }
  err("Got 0 errors while refreshing rules in language server");
  err("CI disabled, not checking API token");
  push(stdoutEvent(notification("semgrep/rulesRefreshed")));
  err("Rules refreshed");
  err("Scanning open documents");
  err("Scanned open documents");
  push(sendEvent("echo-pre-scan", request(IDS.echoPre, "debug/echo", { phase: "pre-scan" })));
  push(stdoutEvent(response(IDS.echoPre, { phase: "pre-scan" })));

  push(phaseEvent("PH3"));
  push(sendEvent("scan-workspace", notification("semgrep/scanWorkspace", { full: true })));
  err("Scanning workspace, full: true");
  err("Scanning workspace");
  err(`Running Semgrep with ${spec.n} rules`);
  err(`Semgrep errors: ${spec.engineErrorsText ?? ""}`.trimEnd());
  err(`Semgrep skipped ${spec.s} rules`);
  err(`Scanned ${spec.k} files`);
  err(`Found ${spec.m} matches`);
  err("Scanned workspace");
  for (const path of spec.expectedPaths) {
    push(
      stdoutEvent(publishMessage(expectedUri(spec.scanRoot, path), spec.diagnostics?.[path] ?? []))
    );
  }
  err("Scanning workspace complete");

  push(phaseEvent("PH4"));
  push(
    sendEvent("echo-post-barrier", request(IDS.echoPost, "debug/echo", { phase: "post-barrier" }))
  );
  push(stdoutEvent(response(IDS.echoPost, { phase: "post-barrier" })));
  push(sendEvent("shutdown", request(IDS.shutdown, "shutdown")));
  push(sendEvent("exit", notification("exit")));
  push({ ...draftBase(), kind: "stdout-eof" });
  push({ ...draftBase(), kind: "stderr-eof" });
  push({ ...draftBase(), kind: "exit", code: 0, signal: null, byHarness: false });
  // cleanup(ok)이 마지막 사건이다. 프로세스를 띄웠다면 정리 성공 기록이 정확히 한 건 있어야 판정이 끝난다
  // (CLEANUP_FAILED) — 그래서 cleanup을 뺀 접두사도 COMPLETE가 아니다.
  push({ ...draftBase(), kind: "cleanup", ok: true });

  return renumber({
    meta: {
      schema: SCHEMAS.transcript,
      runId: spec.runId ?? "run-synthetic-1",
      mode: spec.mode,
      provenance: spec.provenance ?? "stub",
      targetSha: spec.targetSha ?? null,
    },
    events,
  });
}

// ── 번호 매기기와 검증 ─────────────────────────────────────────

/** 배열 순서를 사건 순서로 보고 seq·t·인덱스·cursor를 다시 매긴다(입력은 바꾸지 않는다). */
export function renumber(t: Transcript): Transcript {
  let out = 0;
  let errCount = 0;
  const events = t.events.map((e, i): TranscriptEvent => {
    const base = { seq: i, t: i * 10 };
    switch (e.kind) {
      case "stdout-message":
        return { ...structuredClone(e), ...base, index: out++ };
      case "stderr-line":
        return { ...structuredClone(e), ...base, index: errCount++ };
      case "send":
      case "phase":
        return { ...structuredClone(e), ...base, cursor: { stdout: out, stderr: errCount } };
      default:
        return { ...structuredClone(e), ...base };
    }
  });
  return { meta: { ...t.meta }, events };
}

export function validateTranscript(t: Transcript): string[] {
  const problems: string[] = [];
  let out = 0;
  let err = 0;
  let lastT = -Infinity;
  let eofSeen = false;
  let exits = 0;
  t.events.forEach((e, i) => {
    if (e.seq !== i) problems.push(`seq가 연속이 아니다: 위치 ${i}, seq ${e.seq}`);
    if (!(e.t >= lastT)) problems.push(`t가 줄어들었다: 위치 ${i}`);
    lastT = e.t;
    switch (e.kind) {
      case "stdout-message":
        if (e.index !== out)
          problems.push(`stdout 인덱스가 다르다: 위치 ${i}, ${e.index} != ${out}`);
        if (eofSeen) problems.push(`stdout-eof 뒤에 stdout-message가 있다: 위치 ${i}`);
        out++;
        break;
      case "stderr-line":
        if (e.index !== err)
          problems.push(`stderr 인덱스가 다르다: 위치 ${i}, ${e.index} != ${err}`);
        err++;
        break;
      case "send":
      case "phase":
        if (e.cursor.stdout !== out || e.cursor.stderr !== err) {
          problems.push(
            `cursor가 다르다: 위치 ${i}, ${e.cursor.stdout}/${e.cursor.stderr} != ${out}/${err}`
          );
        }
        break;
      case "stdout-eof":
        eofSeen = true;
        break;
      case "exit":
        exits++;
        break;
      default:
        break;
    }
  });
  if (exits > 1) problems.push(`exit 사건이 ${exits}번이다`);
  return problems;
}

export function assertValidTranscript(t: Transcript): Transcript {
  const problems = validateTranscript(t);
  if (problems.length > 0) {
    throw new Error(`트랜스크립트가 일관되지 않다:\n${problems.join("\n")}`);
  }
  return t;
}

// ── 변형기 ─────────────────────────────────────────────────────

export type Mutator = (t: Transcript) => Transcript;

export function pipe(t: Transcript, ...mutators: Mutator[]): Transcript {
  return mutators.reduce((acc, m) => m(acc), t);
}

function finish(meta: Transcript["meta"], events: TranscriptEvent[]): Transcript {
  return assertValidTranscript(renumber({ meta, events }));
}

export type EventMatcher = (e: TranscriptEvent) => boolean;

/** 위치를 돌려주는 규칙: 삽입할 배열 위치(0 ≤ 위치 ≤ 길이). */
export type Where = (events: readonly TranscriptEvent[]) => number;

function indexOfNth(events: readonly TranscriptEvent[], match: EventMatcher, nth: number): number {
  let seen = 0;
  for (let i = 0; i < events.length; i++) {
    if (match(events[i])) {
      if (seen === nth) return i;
      seen++;
    }
  }
  throw new Error(`일치하는 사건이 없다(nth=${nth})`);
}

function textMatcher(m: string | RegExp): EventMatcher {
  return (e) => e.kind === "stderr-line" && (typeof m === "string" ? e.text === m : m.test(e.text));
}

export const stderrIs = textMatcher;
export const sendIs =
  (label: SendLabel): EventMatcher =>
  (e) =>
    e.kind === "send" && e.label === label;
export const kindIs =
  (kind: TranscriptEvent["kind"]): EventMatcher =>
  (e) =>
    e.kind === kind;
/** 주어진 id의 stdout 응답. */
export const responseIs =
  (id: string | number): EventMatcher =>
  (e) =>
    e.kind === "stdout-message" && e.message.id === id && e.message.method === undefined;
export const stdoutMethodIs =
  (method: string): EventMatcher =>
  (e) =>
    e.kind === "stdout-message" && e.message.method === method;

export const before =
  (match: EventMatcher, nth = 0): Where =>
  (events) =>
    indexOfNth(events, match, nth);
export const after =
  (match: EventMatcher, nth = 0): Where =>
  (events) =>
    indexOfNth(events, match, nth) + 1;
export const atEnd: Where = (events) => events.length;

export type Segment = "init" | "rules" | "pre-scan" | "scan" | "late";

/**
 * 진단 삽입 구간: init = initialize 응답 앞, rules = initialized 송신 뒤, pre-scan = echo-pre 응답 뒤(스캔
 * 송신 앞), scan = echo-post 응답 바로 앞(= 스캔 송신 뒤), late = echo-post 응답 바로 뒤.
 */
export function segmentWhere(segment: Segment): Where {
  switch (segment) {
    case "init":
      return before(responseIs(IDS.initialize));
    case "rules":
      return after(sendIs("initialized"));
    case "pre-scan":
      return after(responseIs(IDS.echoPre));
    case "scan":
      return before(responseIs(IDS.echoPost));
    case "late":
      return after(responseIs(IDS.echoPost));
  }
}

function insertAt(t: Transcript, where: Where, ...added: Draft[]): Transcript {
  const events = [...t.events];
  events.splice(where(events), 0, ...added);
  return finish(t.meta, events);
}

export function insertEvents(where: Where, ...added: TranscriptEvent[]): Mutator {
  return (t) => insertAt(t, where, ...structuredClone(added));
}

export function insertStderrLine(text: string, where: Where): Mutator {
  return (t) => insertAt(t, where, stderrEvent(text));
}

export function insertStdoutMessage(message: JsonRpcMessage, where: Where): Mutator {
  return (t) => insertAt(t, where, stdoutEvent(structuredClone(message)));
}

/** 구간(또는 위치)에 publishDiagnostics를 끼워 넣는다. */
export function insertPublish(
  uri: string,
  diagnostics: readonly LspDiagnostic[],
  where: Segment | Where
): Mutator {
  return insertStdoutMessage(
    publishMessage(uri, diagnostics),
    typeof where === "string" ? segmentWhere(where) : where
  );
}

export function dropEvents(match: EventMatcher, which: number | "all" = 0): Mutator {
  return (t) => {
    if (which === "all") {
      return finish(
        t.meta,
        t.events.filter((e) => !match(e))
      );
    }
    const i = indexOfNth(t.events, match, which);
    return finish(
      t.meta,
      t.events.filter((_, idx) => idx !== i)
    );
  };
}

/** 배열 위치로 사건 하나를 지운다(전수 시험용). 범위를 벗어나면 던진다. */
export function dropEventAt(position: number): Mutator {
  return (t) => {
    if (!Number.isInteger(position) || position < 0 || position >= t.events.length) {
      throw new Error(`범위를 벗어난 위치: ${position}`);
    }
    return finish(
      t.meta,
      t.events.filter((_, idx) => idx !== position)
    );
  };
}

export const dropStderrLine = (m: string | RegExp, which: number | "all" = 0): Mutator =>
  dropEvents(textMatcher(m), which);
export const dropSend = (label: SendLabel, which: number | "all" = 0): Mutator =>
  dropEvents(sendIs(label), which);
export const dropExit: Mutator = dropEvents(kindIs("exit"), "all");
export const dropBarrier: Mutator = dropStderrLine("Scanning workspace complete", "all");

export function dropEchoResponse(which: "pre" | "post"): Mutator {
  return dropEvents(responseIs(which === "pre" ? IDS.echoPre : IDS.echoPost));
}

/** 앞의 nth번째 일치 사건 바로 뒤에 같은 사건을 한 번 더 넣는다. */
export function duplicateEvent(match: EventMatcher, nth = 0): Mutator {
  return (t) => {
    const i = indexOfNth(t.events, match, nth);
    return insertAt(t, () => i + 1, structuredClone(t.events[i]));
  };
}
export const duplicateStderrLine = (m: string | RegExp, nth = 0): Mutator =>
  duplicateEvent(textMatcher(m), nth);

export function mapEvents(
  match: EventMatcher,
  fn: (e: TranscriptEvent) => TranscriptEvent
): Mutator {
  return (t) =>
    finish(
      t.meta,
      t.events.map((e) => (match(e) ? fn(structuredClone(e)) : e))
    );
}

export function replaceStderrLine(m: string | RegExp, text: string, nth = 0): Mutator {
  return (t) => {
    const i = indexOfNth(t.events, textMatcher(m), nth);
    return finish(
      t.meta,
      t.events.map((e, idx) => (idx === i && e.kind === "stderr-line" ? { ...e, text } : e))
    );
  };
}

export function replaceStdoutMessage(
  match: EventMatcher,
  message: JsonRpcMessage,
  nth = 0
): Mutator {
  return (t) => {
    const i = indexOfNth(t.events, match, nth);
    return finish(
      t.meta,
      t.events.map((e, idx) =>
        idx === i && e.kind === "stdout-message" ? { ...e, message: structuredClone(message) } : e
      )
    );
  };
}

export function setStderrPartial(m: string | RegExp, partial = true, nth = 0): Mutator {
  return (t) => {
    const i = indexOfNth(t.events, textMatcher(m), nth);
    return finish(
      t.meta,
      t.events.map((e, idx) => (idx === i && e.kind === "stderr-line" ? { ...e, partial } : e))
    );
  };
}

/**
 * 두 스트림의 도착 순서만 바꾼다: from 사건을 to 위치로 옮긴다. 같은 스트림의 사건을 건너뛰어 옮기면
 * 스트림 안의 순서가 바뀌므로 거부한다(그것은 "뒤집힌 도착 순서"가 아니라 다른 입력이다).
 */
export function moveAcrossStreams(from: EventMatcher, to: Where, nth = 0): Mutator {
  const streamOf = (e: TranscriptEvent): "stdout" | "stderr" | null =>
    e.kind === "stdout-message" || e.kind === "stdout-frame-error" || e.kind === "stdout-eof"
      ? "stdout"
      : e.kind === "stderr-line" || e.kind === "stderr-eof"
        ? "stderr"
        : null;
  return (t) => {
    const i = indexOfNth(t.events, from, nth);
    const moved = t.events[i];
    const stream = streamOf(moved);
    if (stream === null) throw new Error("스트림 사건이 아니다");
    const rest = t.events.filter((_, idx) => idx !== i);
    const dest = to(rest);
    const lo = Math.min(i, dest);
    const hi = Math.max(i, dest);
    for (let idx = lo; idx < hi; idx++) {
      // 건너뛰는 사건은 제거 후 배열 rest의 [lo, hi) 구간이다(앞으로 옮기든 뒤로 옮기든 같다).
      const crossed = rest[idx];
      if (crossed && streamOf(crossed) === stream) {
        throw new Error("같은 스트림의 사건을 건너뛰어 옮길 수 없다(스트림 안의 순서가 바뀐다)");
      }
    }
    rest.splice(dest, 0, moved);
    return finish(t.meta, rest);
  };
}

/** stdout의 위치에서 잘라낸다: 그 뒤의 stdout 메시지를 모두 지우고 프레임 오류(와 TRUNCATED면 EOF)를 넣는다. */
export function truncateStdout(
  where: Where,
  error: "MALFORMED" | "TRUNCATED",
  atByte = 0
): Mutator {
  return (t) => {
    const pos = where(t.events);
    const kept = t.events.filter(
      (e, idx) => !(idx >= pos && (e.kind === "stdout-message" || e.kind === "stdout-eof"))
    );
    const insertPos = Math.min(pos, kept.length);
    const added: Draft[] = [
      {
        ...draftBase(),
        kind: "stdout-frame-error",
        error,
        detail: error === "TRUNCATED" ? "EOF에서 프레임이 잘렸다" : "프레임이 깨졌다",
        atByte,
      },
    ];
    if (error === "TRUNCATED") added.push({ ...draftBase(), kind: "stdout-eof" });
    kept.splice(insertPos, 0, ...added);
    return finish(t.meta, kept);
  };
}

/** 일치하는 nth번째 사건까지(그 사건 포함) 남기고 나머지를 버린다. */
export function cutAfterEvent(match: EventMatcher, nth = 0): Mutator {
  return (t) => finish(t.meta, t.events.slice(0, indexOfNth(t.events, match, nth) + 1));
}

/** 앞에서 n개 사건만 남긴다(엄격한 접두사 시험용). */
export function cutAfter(count: number): Mutator {
  return (t) => finish(t.meta, t.events.slice(0, count));
}

export function setMeta(patch: Partial<Transcript["meta"]>): Mutator {
  return (t) =>
    assertValidTranscript({ meta: { ...t.meta, ...patch }, events: structuredClone(t.events) });
}

// 끝에 덧붙이는 사건들 -----------------------------------------------

function append(...added: Draft[]): Mutator {
  return (t) => insertAt(t, atEnd, ...added);
}

export const appendTimeout = (phase: Phase, waitingFor: string, afterMs = 30000): Mutator =>
  append({ ...draftBase(), kind: "timeout", phase, waitingFor, afterMs });
export const appendCancelled = (phase: Phase): Mutator =>
  append({ ...draftBase(), kind: "cancelled", phase });
export const appendKill = (signal = "SIGKILL", reason = "timeout"): Mutator =>
  append({ ...draftBase(), kind: "kill", signal, reason });
export const appendExit = (
  info: { code: number | null; signal?: string | null; byHarness?: boolean } = { code: 0 }
): Mutator =>
  append({
    ...draftBase(),
    kind: "exit",
    code: info.code,
    signal: info.signal ?? null,
    byHarness: info.byHarness ?? false,
  });
/** 자식 프로세스 정리 기록(cleanup)을 끝에 덧붙인다. 기준 트랜스크립트는 이미 ok:true 한 건을 끝에 갖고 있다. */
export const appendCleanup = (ok = true, detail?: string): Mutator =>
  append({
    ...draftBase(),
    kind: "cleanup",
    ok,
    ...(detail === undefined ? {} : { detail }),
  });
export const dropCleanup: Mutator = dropEvents(kindIs("cleanup"), "all");
export const appendStdinError = (message = "EPIPE"): Mutator =>
  append({ ...draftBase(), kind: "stdin-error", message });
export const appendSpawnFailed = (message = "ENOENT"): Mutator =>
  append({ ...draftBase(), kind: "spawn-failed", message });

/** 한도 초과로 끝나는 마무리: timeout → kill → 하네스가 끝낸 exit → 정리 성공(cleanup ok). */
export const endByTimeout =
  (phase: Phase, waitingFor: string): Mutator =>
  (t) =>
    pipe(
      t,
      appendTimeout(phase, waitingFor),
      appendKill("SIGKILL", `timeout:${waitingFor}`),
      appendExit({ code: null, signal: "SIGKILL", byHarness: true }),
      appendCleanup()
    );

/**
 * 정상 마무리(shutdown·exit 송신, EOF, 정상 종료)를 걷어내고 지정한 끝을 붙인다. 중간에 끊긴 실행을 만들 때 쓴다.
 */
export const stripEnding: Mutator = (t) =>
  finish(
    t.meta,
    t.events.filter(
      (e) =>
        !(
          e.kind === "exit" ||
          e.kind === "cleanup" ||
          e.kind === "stdout-eof" ||
          e.kind === "stderr-eof" ||
          (e.kind === "send" && (e.label === "shutdown" || e.label === "exit"))
        )
    )
  );
