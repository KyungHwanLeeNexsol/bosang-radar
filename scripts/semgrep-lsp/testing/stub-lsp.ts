// 시험용 LSP 스텁(시험 지원). 메모리 상의 FakeChild를 `StubScript`대로 구동한다: 세션이 stdin에 쓴
// Content-Length 프레임을 해석하고, 스크립트에 따라 stderr 줄·stdout 알림·응답을 주입된 시계 위에서 내보낸다.
// 실제 Semgrep이 아니다 — 여기서 얻은 트랜스크립트는 provenance "stub"이며, 로그 줄은 README 표의 *소스 문자열*을
// 그대로 쓴 것이라 실제 stderr가 이 모양이라는 증거가 아니다(ADR U3).
//
// 공개 API:
//   happyScript(spec, patch?): StubScript     세션 트랜스크립트가 evaluate에서 COMPLETE가 되는 기준 스크립트
//   mergeScript(base, patch): StubScript       한 단계 깊이의 부분 덮어쓰기
//   StubLsp                                    FakeChild에 붙는 스텁(받은 메시지·프레임 오류 기록)
//   stubPort(script, clock, options?)          스텁이 붙은 FakeChild를 만드는 FakePort
//
// 설계 요점:
//  · 모든 시각은 "받은 메시지 시점으로부터의 상대 ms"다. 0이면 같은 호출 안에서 곧바로 내보낸다(시계가 필요 없다).
//  · stdout·stderr는 각각 순서가 보존되는 출구(OrderedOutlet)를 거친다. `lag`는 한 스트림의 모든 출력을 늦추므로
//    "장벽 줄이 마지막 진단보다 먼저 처리되는" reader 순서 뒤집기(S12)를 만든다. 늦춰도 echo 응답은 앞선 진단 뒤에 온다
//    (서버가 echo 응답을 쓰는 시점에는 이미 끝난 스캔의 쓰기가 앞서 있다는 ADR D1의 전제).
//  · 자식이 끝나면(스스로·kill·dispose) 스텁의 대기 중 출력과 타이머를 모두 취소한다 — 시험이 "대기 타이머 0개"를 단언한다.

import type { LspDiagnostic } from "../aggregate";
import type { VirtualClock } from "../clock";
import { FrameDecoder } from "../framing";
import { expectedUri } from "../uri";
import type { Clock, JsonRpcMessage, SpawnSpec, TimerHandle } from "../types";
import { FakeChild, FakePort, type FakeChildOptions } from "./fake-process";
import {
  errorResponse,
  notification,
  publishMessage,
  response,
  type HappySpec,
} from "./transcript-builder";

// ── 스크립트 ────────────────────────────────────────────────────

export interface StubPublish {
  /** 스캔 트리 기준 상대 경로. URI는 scanRoot로 만든다. */
  path: string;
  diagnostics?: readonly LspDiagnostic[];
}

export type StubTrigger = "initialize" | "initialized" | "echo-pre" | "scan" | "echo-post";

export interface StubReply {
  /** ok = 응답, error = 오류 응답, none = 응답하지 않는다. */
  reply: "ok" | "error" | "none";
  /** 요청을 받은 뒤 응답까지(ms). */
  delayMs: number;
}

export interface StubScript {
  /** 게시 URI를 만들 스캔 트리 루트(절대 경로). */
  scanRoot: string;
  /** initialize 결과의 serverInfo.version. null이면 serverInfo를 보내지 않는다. */
  serverVersion: string | null;
  init: StubReply;
  rules: {
    /** `loading local config from`/`Done loading …` 쌍을 낼 경로(그대로). */
    loadingPaths: readonly string[];
    gotErrors: number;
    /** initialized 수신 뒤 stderr 줄(Refreshing rules … Scanned open documents)까지(ms). */
    logAtMs: number;
    /** initialized 수신 뒤 stdout `semgrep/rulesRefreshed` 알림까지(ms). */
    notifyAtMs: number;
    omitRulesRefreshed: boolean;
    omitScannedOpen: boolean;
  };
  echoPre: StubReply;
  echoPost: StubReply;
  scan: {
    n: number;
    s: number;
    k: number;
    m: number;
    engineErrorsText: string;
    /** scanWorkspace 수신 뒤 로그 줄들까지(ms). */
    logAtMs: number;
    publishes: readonly StubPublish[];
    /** scanWorkspace 수신 뒤 진단 게시까지(ms). */
    publishAtMs: number;
    /** scanWorkspace 수신 뒤 장벽 줄까지(ms). null이면 영원히 보내지 않는다. */
    barrierAtMs: number | null;
    /** echo-post 응답 뒤에 오는 늦은 진단. */
    latePublishes: readonly StubPublish[];
    /** echo-post 응답 뒤 늦은 진단까지(ms). */
    lateAfterEchoMs: number;
  };
  /** exit 알림을 받은 뒤의 행동. never면 스스로 끝나지 않는다. */
  exit: { code: number | null; afterMs: number; never: boolean };
  /** 한 스트림의 모든 출력을 늦춘다(reader 순서 뒤집기). */
  lag: { stdoutMs: number; stderrMs: number };
  /** 트리거 메시지를 받고 afterMs 뒤에 프로세스가 끝난다(EOF). 정상 반응보다 먼저 처리된다. */
  crash: { on: StubTrigger; afterMs: number; code: number | null; signal: string | null } | null;
  /** 트리거 메시지를 정상 처리한 뒤 atMs 뒤에 깨진/잘린 프레임을 stdout에 내보낸다. */
  fault: { on: StubTrigger; kind: "MALFORMED" | "TRUNCATED"; atMs: number } | null;
  /** 트리거 메시지를 받으면 그 다음 stdin 쓰기 한 번이 EPIPE로 거부된다. */
  stdinFault: { after: StubTrigger } | null;
}

/** 객체 섹션은 필드별 부분 덮어쓰기, null을 허용하는 섹션(crash·fault·stdinFault)과 원시값은 통째로 바꾼다. */
export type StubPatch = {
  [K in keyof StubScript]?: StubScript[K] extends object ? Partial<StubScript[K]> : StubScript[K];
};

/** 한 단계 깊이로 덮어쓴다: 객체 섹션은 필드별로 합치고, null·원시값은 통째로 바꾼다. 입력은 바꾸지 않는다. */
export function mergeScript(base: StubScript, patch: StubPatch): StubScript {
  const out = structuredClone(base) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = out[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof current === "object" &&
      current !== null
    ) {
      out[key] = { ...(current as object), ...structuredClone(value as object) };
    } else if (value !== null && typeof value === "object" && current === null) {
      out[key] = structuredClone(value);
    } else {
      out[key] = value;
    }
  }
  return out as unknown as StubScript;
}

/**
 * 세션이 이 스크립트와 짝지어 돌면 트랜스크립트가 evaluate에서 COMPLETE가 되는 기준 스크립트.
 * HappySpec(= happyTranscript의 입력)에서 만들기 때문에 스텁과 평가기가 같은 재료를 본다. mode는 쓰지 않는다.
 */
export function happyScript(spec: HappySpec, patch: StubPatch = {}): StubScript {
  const base: StubScript = {
    scanRoot: spec.scanRoot,
    serverVersion: spec.serverVersion,
    init: { reply: "ok", delayMs: 0 },
    rules: {
      loadingPaths: [...spec.loadingPaths],
      gotErrors: 0,
      logAtMs: 0,
      notifyAtMs: 0,
      omitRulesRefreshed: false,
      omitScannedOpen: false,
    },
    echoPre: { reply: "ok", delayMs: 0 },
    echoPost: { reply: "ok", delayMs: 0 },
    scan: {
      n: spec.n,
      s: spec.s,
      k: spec.k,
      m: spec.m,
      engineErrorsText: spec.engineErrorsText ?? "",
      logAtMs: 0,
      publishes: spec.expectedPaths.map((path) => ({
        path,
        diagnostics: spec.diagnostics?.[path] ?? [],
      })),
      publishAtMs: 0,
      barrierAtMs: 0,
      latePublishes: [],
      lateAfterEchoMs: 0,
    },
    exit: { code: 0, afterMs: 0, never: false },
    lag: { stdoutMs: 0, stderrMs: 0 },
    crash: null,
    fault: null,
    stdinFault: null,
  };
  return mergeScript(base, patch);
}

// ── 순서가 보존되는 출구 ────────────────────────────────────────

/**
 * 한 스트림의 출력 줄서기. 항목은 만든 순서대로, 마감 시각이 지난 것부터 나간다(앞 항목보다 먼저 나가지 못한다).
 * 마감이 지금 이전이고 줄이 비어 있으면 호출 안에서 곧바로 쓴다 — 시계를 돌리지 않는 시험도 동작한다.
 */
class OrderedOutlet {
  private queue: { due: number; write: () => void }[] = [];
  private timer: TimerHandle | null = null;
  private floor = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly clock: Clock,
    private readonly lagMs: () => number
  ) {}

  emit(delayMs: number, write: () => void): void {
    const due = Math.max(this.clock.now() + Math.max(0, delayMs) + this.lagMs(), this.floor);
    this.floor = due;
    this.queue.push({ due, write });
    this.pump();
  }

  cancel(): void {
    this.timer?.cancel();
    this.timer = null;
    this.queue = [];
  }

  private pump(): void {
    if (this.timer !== null) return;
    while (this.queue.length > 0) {
      const head = this.queue[0];
      const now = this.clock.now();
      if (head.due <= now) {
        this.queue.shift();
        head.write();
        continue;
      }
      this.timer = this.clock.setTimer(() => {
        this.timer = null;
        this.pump();
      }, head.due - now);
      return;
    }
  }
}

// ── 스텁 ────────────────────────────────────────────────────────

const TRIGGER_OF: Record<string, StubTrigger | undefined> = {
  initialize: "initialize",
  initialized: "initialized",
  "semgrep/scanWorkspace": "scan",
};

export class StubLsp {
  /** 세션이 보낸 메시지(받은 순서). */
  readonly received: JsonRpcMessage[] = [];
  /** 세션이 보낸 바이트를 해석하다 프레임 오류가 났다면 그 종류. */
  frameProblem: string | null = null;

  private readonly decoder = new FrameDecoder();
  private readonly out: OrderedOutlet;
  private readonly err: OrderedOutlet;
  private readonly timers = new Set<TimerHandle>();
  private echoCount = 0;
  private ended = false;

  constructor(
    readonly child: FakeChild,
    private readonly clock: Clock,
    readonly script: StubScript
  ) {
    this.out = new OrderedOutlet(clock, () => this.script.lag.stdoutMs);
    this.err = new OrderedOutlet(clock, () => this.script.lag.stderrMs);
    child.onStdinWrite((bytes) => this.onBytes(bytes));
    // 자식이 끝나면 스텁의 대기 중 출력·타이머를 모두 거둔다(세션 쪽 관측자보다 먼저 등록된다).
    void child.exited.then(() => this.stop());
  }

  /** 받은 메시지 중 method가 일치하는 것의 수. */
  count(method: string): number {
    return this.received.filter((m) => m.method === method).length;
  }

  private stop(): void {
    this.ended = true;
    this.out.cancel();
    this.err.cancel();
    for (const handle of this.timers) handle.cancel();
    this.timers.clear();
  }

  /** ms 뒤에 fn을 실행한다. 0 이하면 곧바로. 자식이 끝난 뒤에는 실행하지 않는다. */
  private at(ms: number, fn: () => void): void {
    if (this.ended) return;
    if (ms <= 0) {
      fn();
      return;
    }
    const handle = this.clock.setTimer(() => {
      this.timers.delete(handle);
      if (!this.ended) fn();
    }, ms);
    this.timers.add(handle);
  }

  private onBytes(bytes: Uint8Array): void {
    const result = this.decoder.push(bytes);
    for (const message of result.messages) this.handle(message);
    if (result.error && this.frameProblem === null) this.frameProblem = result.error.kind;
  }

  private emitStdout(message: JsonRpcMessage): void {
    this.child.emitStdoutFrame(message);
  }

  private emitStderr(...lines: string[]): void {
    for (const line of lines) this.child.emitStderrLine(line);
  }

  private triggerOf(message: JsonRpcMessage): StubTrigger | null {
    if (message.method === "debug/echo") return this.echoCount === 1 ? "echo-pre" : "echo-post";
    return (message.method !== undefined ? TRIGGER_OF[message.method] : undefined) ?? null;
  }

  private handle(message: JsonRpcMessage): void {
    this.received.push(message);
    if (message.method === "debug/echo") this.echoCount++;
    const trigger = this.triggerOf(message);
    const { crash, fault, stdinFault } = this.script;

    // 정상 반응보다 먼저: 끝나 버리면 이어지는 출력은 닫힌 스트림이 버린다.
    if (crash && crash.on === trigger) {
      this.at(crash.afterMs, () => this.child.exit(crash.code, crash.signal));
    }
    if (stdinFault && stdinFault.after === trigger) this.child.failNextStdinWrite();

    switch (message.method) {
      case "initialize":
        this.onInitialize(message);
        break;
      case "initialized":
        this.onInitialized();
        break;
      case "debug/echo":
        this.onEcho(message);
        break;
      case "semgrep/scanWorkspace":
        this.onScan();
        break;
      case "exit":
        if (!this.script.exit.never) {
          const { code, afterMs } = this.script.exit;
          this.at(afterMs, () => this.child.exit(code, null));
        }
        break;
      default:
        break; // shutdown: 응답하지 않는다. 그 밖의 메시지는 무시한다.
    }

    if (fault && fault.on === trigger) this.at(fault.atMs, () => this.injectFault(fault.kind));
  }

  private injectFault(kind: "MALFORMED" | "TRUNCATED"): void {
    this.out.emit(0, () => {
      if (kind === "MALFORMED") {
        this.child.emitStdout("Content-Length: nope\r\n\r\n{}");
      } else {
        // 헤더는 40바이트라 했지만 본문이 중간에 끊긴 채 EOF.
        this.child.emitStdout('Content-Length: 40\r\n\r\n{"jsonrpc":"2.0",');
        this.child.closeStdout();
      }
    });
  }

  private onInitialize(message: JsonRpcMessage): void {
    const { init, serverVersion } = this.script;
    const id = message.id as string | number;
    if (init.reply === "none") return;
    const body =
      init.reply === "error"
        ? errorResponse(id, -32603, "initialize failed")
        : response(id, {
            capabilities: {},
            ...(serverVersion === null
              ? {}
              : { serverInfo: { name: "Semgrep", version: serverVersion } }),
          });
    this.out.emit(init.delayMs, () => this.emitStdout(body));
  }

  private onInitialized(): void {
    const { rules } = this.script;
    const lines = ["Refreshing rules"];
    for (const path of rules.loadingPaths) {
      lines.push(`loading local config from ${path}`, `Done loading local config from ${path}`);
    }
    lines.push(
      `Got ${rules.gotErrors} errors while refreshing rules in language server`,
      "CI disabled, not checking API token",
      "Rules refreshed"
    );
    if (!rules.omitScannedOpen) lines.push("Scanning open documents", "Scanned open documents");
    this.err.emit(rules.logAtMs, () => this.emitStderr(...lines));
    if (!rules.omitRulesRefreshed) {
      this.out.emit(rules.notifyAtMs, () =>
        this.emitStdout(notification("semgrep/rulesRefreshed"))
      );
    }
  }

  private onEcho(message: JsonRpcMessage): void {
    const script = this.echoCount === 1 ? this.script.echoPre : this.script.echoPost;
    const isPost = this.echoCount !== 1;
    const id = message.id as string | number;
    if (script.reply === "none") return;
    const body =
      script.reply === "error"
        ? errorResponse(id, -32603, "echo failed")
        : response(id, message.params ?? null);
    this.out.emit(script.delayMs, () => this.emitStdout(body));
    if (isPost) {
      const { latePublishes, lateAfterEchoMs } = this.script.scan;
      if (latePublishes.length > 0) {
        this.at(script.delayMs + lateAfterEchoMs, () =>
          this.out.emit(0, () => {
            for (const p of latePublishes) this.emitStdout(this.publish(p));
          })
        );
      }
    }
  }

  private publish(p: StubPublish): JsonRpcMessage {
    return publishMessage(expectedUri(this.script.scanRoot, p.path), p.diagnostics ?? []);
  }

  private onScan(): void {
    const { scan } = this.script;
    const lines = [
      "Scanning workspace, full: true",
      "Scanning workspace",
      `Running Semgrep with ${scan.n} rules`,
      `Semgrep errors: ${scan.engineErrorsText}`.trimEnd(),
      `Semgrep skipped ${scan.s} rules`,
      `Scanned ${scan.k} files`,
      `Found ${scan.m} matches`,
      "Scanned workspace",
    ];
    this.err.emit(scan.logAtMs, () => this.emitStderr(...lines));
    this.out.emit(scan.publishAtMs, () => {
      for (const p of scan.publishes) this.emitStdout(this.publish(p));
    });
    if (scan.barrierAtMs !== null) {
      this.err.emit(scan.barrierAtMs, () => this.emitStderr("Scanning workspace complete"));
    }
  }
}

// ── 포트 ────────────────────────────────────────────────────────

export interface StubPortOptions {
  /** FakeChild 옵션(pid·kill 반응). */
  child?: FakeChildOptions;
  /** FakeChild를 직접 만들고 싶을 때(호출 횟수 세기 등). */
  makeChild?: (options: FakeChildOptions, spec: SpawnSpec) => FakeChild;
}

/** spawn마다 스텁이 붙은 FakeChild를 만드는 포트. stubs[i]가 i번째 자식의 스텁이다. */
export function stubPort(
  script: StubScript,
  clock: Clock,
  options: StubPortOptions = {}
): { port: FakePort; stubs: StubLsp[] } {
  const stubs: StubLsp[] = [];
  const port = new FakePort({
    childFactory: (spec) => {
      const childOptions = options.child ?? {};
      const child = options.makeChild
        ? options.makeChild(childOptions, spec)
        : new FakeChild(childOptions);
      stubs.push(new StubLsp(child, clock, script));
      return child;
    },
  });
  return { port, stubs };
}

// ── 가상 시간 구동 ──────────────────────────────────────────────

/** 이벤트 루프를 몇 바퀴 돌려 대기 중인 약속 연쇄를 가라앉힌다(시간은 움직이지 않는다). */
export async function settle(clock: VirtualClock, turns = 8): Promise<void> {
  for (let i = 0; i < turns; i++) await clock.flush();
}

/**
 * 약속이 끝날 때까지 가상 시간을 보낸다. 모든 타이머를 기한 순으로 돌려도 끝나지 않으면(멈춘 세션) 던진다 —
 * 시험이 멈춘 세션 때문에 매달리는 대신 실패하게 한다.
 */
export async function drive<T>(
  clock: VirtualClock,
  promise: Promise<T>,
  maxMs = 3_600_000
): Promise<T> {
  let done = false;
  void promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    }
  );
  await settle(clock);
  if (!done) {
    await clock.advance(maxMs);
    await settle(clock);
  }
  if (!done) throw new Error("세션이 끝나지 않았다(시계를 끝까지 보내도 약속이 이행되지 않는다)");
  return promise;
}
