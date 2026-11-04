import { describe, expect, it } from "vitest";
import { FrameDecoder } from "./framing";
import {
  analyzeScanProgress,
  SCAN_PROGRESS_STAGES,
  ScanProgressTracker,
} from "./lsp-scan-progress";
import type { ScanProgressFrame } from "./lsp-scan-progress";
import { analyzeScanStdout } from "./lsp-scan";
import { ScanLiveWatch } from "./lsp-scan-watch";
import {
  PROGRESS_REFRESH,
  PROGRESS_SCAN,
  RULES_REFRESHED,
  bytesOf,
  frames,
  openDocumentsProgress,
  progressBegin,
  progressCreate,
  progressEnd,
  refreshProgress,
  scanInitResponse,
  scanLay,
  scanPreOpenLines,
} from "./testing/scan-fixtures";
import { preambleLines } from "./testing/rules-fixtures";
import { watchConfig } from "./testing/scan-watch-cases";
import type { JsonRpcMessage } from "./types";

// 이 파일은 초기 진행 메시지 장벽의 **계약**을 시험으로 고정한다(lsp-scan-progress.ts 머리말 참조). 토큰·id 는 합성 값이다.

const toFrames = (messages: readonly JsonRpcMessage[]): ScanProgressFrame[] =>
  messages.map((message, index) => ({ index, startByte: null, endByte: null, message }));
const analyze = (messages: readonly JsonRpcMessage[]) => analyzeScanProgress(toFrames(messages));

const good = (): JsonRpcMessage[] => [
  ...refreshProgress(),
  RULES_REFRESHED,
  ...openDocumentsProgress(),
];

describe("계약 상수 — 단계 식별과 순서는 고정 소스에서 읽은 값이다", () => {
  it("첫 수명주기는 규칙 새로고침, 둘째는 초기 열린 문서 스캔이고 제목·문구는 소스와 같다", () => {
    expect(SCAN_PROGRESS_STAGES.map((s) => [s.stage, s.title, s.message])).toEqual([
      ["REFRESH_RULES", "Semgrep", "Refreshing Rules"],
      ["SCAN_OPEN_DOCUMENTS", "Semgrep Scan in Progress", "Scanning Open Documents"],
    ]);
  });

  it("정상 조립기의 메시지 순서: create → begin → end → rulesRefreshed → create → begin → end (소스·실제 관측과 같다)", () => {
    const seq = good().map((m) => {
      const x = m as unknown as { method?: string; params?: { value?: { kind?: string } } };
      return x.method === "$/progress" ? `progress:${x.params?.value?.kind}` : x.method;
    });
    expect(seq).toEqual([
      "window/workDoneProgress/create",
      "progress:begin",
      "progress:end",
      "semgrep/rulesRefreshed",
      "window/workDoneProgress/create",
      "progress:begin",
      "progress:end",
    ]);
  });
});

describe("analyzeScanProgress — 정상", () => {
  it("두 수명주기가 완전하고 순서가 맞으면 COMPLETE 이고 문제가 없다", () => {
    const a = analyze(good());
    expect(a.state).toBe("COMPLETE");
    expect(a.complete).toBe(true);
    expect(a.problems).toEqual([]);
    expect(a.lifecycles.map((l) => [l.ordinal, l.stage, l.status])).toEqual([
      [0, "REFRESH_RULES", "COMPLETE"],
      [1, "SCAN_OPEN_DOCUMENTS", "COMPLETE"],
    ]);
    expect(a.requests).toHaveLength(2);
    expect(a.notifications.every((n) => n.outcome === "ACCEPTED")).toBe(true);
  });

  it("요청 id 와 토큰은 다른 값이고 기록에도 따로 남는다", () => {
    const a = analyze(good());
    expect(a.lifecycles[0]).toMatchObject({
      requestId: PROGRESS_REFRESH.id,
      token: PROGRESS_REFRESH.token,
    });
    expect(a.lifecycles[1]).toMatchObject({
      requestId: PROGRESS_SCAN.id,
      token: PROGRESS_SCAN.token,
    });
  });

  it("다른 토큰·id 값(이번 관측의 UUID 가 아닌 임의의 값)이어도 같은 결과다 — 값이 아니라 구조를 본다", () => {
    const a = analyze([
      ...refreshProgress({ id: "9f1c", token: "aa-bb" }),
      RULES_REFRESHED,
      ...openDocumentsProgress({ id: "77e0", token: "cc-dd" }),
    ]);
    expect(a.complete).toBe(true);
  });

  it("숫자 id·숫자 토큰도 계약 모양이면 정상이다(자료형까지 같아야 한다)", () => {
    const a = analyze([
      { jsonrpc: "2.0", id: 10, method: "window/workDoneProgress/create", params: { token: 7 } },
      progressBegin(7, "Semgrep", "Refreshing Rules"),
      progressEnd(7),
      RULES_REFRESHED,
      { jsonrpc: "2.0", id: 11, method: "window/workDoneProgress/create", params: { token: 8 } },
      progressBegin(8, "Semgrep Scan in Progress", "Scanning Open Documents"),
      progressEnd(8),
    ] as JsonRpcMessage[]);
    expect(a.complete).toBe(true);
    expect(a.lifecycles.map((l) => l.tokenType)).toEqual(["number", "number"]);
  });
});

describe("analyzeScanProgress — 누락은 INCOMPLETE(더 기다릴 수 있다)", () => {
  const cases: [string, JsonRpcMessage[], string[]][] = [
    ["아무것도 없음", [], ["PROGRESS_CREATE_COUNT_0", "PROGRESS_RULES_REFRESHED_COUNT_0"]],
    ["첫 수명주기만", [...refreshProgress(), RULES_REFRESHED], ["PROGRESS_CREATE_COUNT_1"]],
    [
      "두 번째 create 만",
      [...refreshProgress(), RULES_REFRESHED, openDocumentsProgress()[0]],
      ["PROGRESS_BEGIN_MISSING:2"],
    ],
    [
      "두 번째 create+begin 만(end 없음)",
      [...refreshProgress(), RULES_REFRESHED, ...openDocumentsProgress().slice(0, 2)],
      ["PROGRESS_END_MISSING:2"],
    ],
    [
      "rulesRefreshed 없음",
      [...refreshProgress(), ...openDocumentsProgress()],
      ["PROGRESS_RULES_REFRESHED_COUNT_0"],
    ],
  ];
  for (const [name, messages, tokens] of cases) {
    it(`${name} → INCOMPLETE`, () => {
      const a = analyze(messages);
      expect(a.state, name).toBe("INCOMPLETE");
      expect(a.complete).toBe(false);
      for (const t of tokens) expect(a.problems, name).toContain(t);
      expect(a.violations, name).toEqual([]);
    });
  }
});

describe("analyzeScanProgress — 위반은 INVALID(더 기다려도 완료되지 않는다)", () => {
  const [c1, b1, e1] = refreshProgress();
  const [c2, b2, e2] = openDocumentsProgress();
  const cases: [string, JsonRpcMessage[], string][] = [
    [
      "create 중복(같은 토큰)",
      [c1, c1, b1, e1, RULES_REFRESHED, c2, b2, e2],
      "PROGRESS_TOKEN_DUPLICATE",
    ],
    [
      "요청 id 중복(다른 토큰)",
      [
        c1,
        b1,
        e1,
        RULES_REFRESHED,
        progressCreate(PROGRESS_REFRESH.id, PROGRESS_SCAN.token),
        b2,
        e2,
      ],
      "PROGRESS_REQUEST_ID_DUPLICATE",
    ],
    ["세 번째 create", [...good(), progressCreate("third", "t3")], "PROGRESS_CREATE_COUNT_3"],
    [
      "모양이 틀린 create(params 없음)",
      [
        { jsonrpc: "2.0", id: 1, method: "window/workDoneProgress/create" } as JsonRpcMessage,
        ...good(),
      ],
      "PROGRESS_CREATE_INVALID",
    ],
    [
      "등록되지 않은 토큰의 begin",
      [
        c1,
        progressBegin("nobody", "Semgrep", "Refreshing Rules"),
        b1,
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
      "PROGRESS_TOKEN_UNREGISTERED",
    ],
    [
      "create 보다 먼저 온 begin",
      [b1, c1, e1, RULES_REFRESHED, c2, b2, e2],
      "PROGRESS_TOKEN_UNREGISTERED",
    ],
    ["begin 중복", [c1, b1, b1, e1, RULES_REFRESHED, c2, b2, e2], "PROGRESS_BEGIN_DUPLICATE"],
    ["end 중복", [c1, b1, e1, e1, RULES_REFRESHED, c2, b2, e2], "PROGRESS_END_DUPLICATE"],
    ["begin 없는 end", [c1, e1, b1, RULES_REFRESHED, c2, b2, e2], "PROGRESS_END_WITHOUT_BEGIN"],
    [
      "report 같은 계약 밖 kind",
      [
        c1,
        b1,
        {
          jsonrpc: "2.0",
          method: "$/progress",
          params: { token: PROGRESS_REFRESH.token, value: { kind: "report", message: "x" } },
        } as JsonRpcMessage,
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
      "PROGRESS_KIND_UNEXPECTED",
    ],
    [
      "begin 의 제목·문구가 계약과 다르다",
      [
        c1,
        progressBegin(PROGRESS_REFRESH.token, "Semgrep", "Something Else"),
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
      "PROGRESS_STAGE_UNKNOWN",
    ],
    [
      "단계가 뒤바뀜(첫 수명주기에 열린 문서 스캔 문구)",
      [
        c1,
        progressBegin(
          PROGRESS_REFRESH.token,
          "Semgrep Scan in Progress",
          "Scanning Open Documents"
        ),
        e1,
        RULES_REFRESHED,
        c2,
        progressBegin(PROGRESS_SCAN.token, "Semgrep", "Refreshing Rules"),
        e2,
      ],
      "PROGRESS_STAGE_ORDER",
    ],
    [
      "알림 모양이 틀림(value 없음)",
      [
        c1,
        {
          jsonrpc: "2.0",
          method: "$/progress",
          params: { token: PROGRESS_REFRESH.token },
        } as JsonRpcMessage,
        b1,
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
      "PROGRESS_NOTIFICATION_MALFORMED",
    ],
    [
      "end 에 계약 밖 키",
      [
        c1,
        b1,
        {
          jsonrpc: "2.0",
          method: "$/progress",
          params: { token: PROGRESS_REFRESH.token, value: { kind: "end", message: "done" } },
        } as JsonRpcMessage,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
      "PROGRESS_NOTIFICATION_MALFORMED",
    ],
    ["rulesRefreshed 가 두 번", [...good(), RULES_REFRESHED], "PROGRESS_RULES_REFRESHED_COUNT_2"],
  ];
  for (const [name, messages, token] of cases) {
    it(`${name} → INVALID, ${token}`, () => {
      const a = analyze(messages);
      expect(a.state, name).toBe("INVALID");
      expect(a.complete).toBe(false);
      expect(a.violations, name).toContain(token);
    });
  }

  it('토큰의 값은 같아도 자료형이 다르면 다른 토큰이다: 숫자 1 과 문자열 "1" 을 합치지 않는다', () => {
    const create = (id: number | string, token: number | string): JsonRpcMessage =>
      ({
        jsonrpc: "2.0",
        id,
        method: "window/workDoneProgress/create",
        params: { token },
      }) as JsonRpcMessage;
    // create 는 숫자 1 인데 begin·end 는 문자열 "1" → 등록되지 않은 토큰
    const wrongType = analyze([
      create("a", 1),
      progressBegin("1", "Semgrep", "Refreshing Rules"),
      progressEnd("1"),
      RULES_REFRESHED,
      ...openDocumentsProgress(),
    ]);
    expect(wrongType.violations).toContain("PROGRESS_TOKEN_UNREGISTERED");
    expect(wrongType.complete).toBe(false);
    // 숫자 1 과 문자열 "1" 은 서로 다른 두 수명주기로 등록된다(중복이 아니다)
    const both = analyze([
      create("a", 1),
      progressBegin(1, "Semgrep", "Refreshing Rules"),
      progressEnd(1),
      RULES_REFRESHED,
      create("b", "1"),
      progressBegin("1", "Semgrep Scan in Progress", "Scanning Open Documents"),
      progressEnd("1"),
    ]);
    expect(both.complete).toBe(true);
    expect(both.lifecycles.map((l) => l.tokenType)).toEqual(["number", "string"]);
  });

  it("요청 id 를 토큰으로 쓴 알림은 등록된 토큰이 아니다(요청 id 와 토큰을 섞지 않는다)", () => {
    const a = analyze([
      c1,
      progressBegin(PROGRESS_REFRESH.id, "Semgrep", "Refreshing Rules"), // id 값을 토큰 자리에 썼다
      b1,
      e1,
      RULES_REFRESHED,
      c2,
      b2,
      e2,
    ]);
    expect(a.violations).toContain("PROGRESS_TOKEN_UNREGISTERED");
    const bad = a.notifications.find((n) => n.outcome === "UNREGISTERED_TOKEN");
    expect(bad?.tokenIsRequestIdOnly).toBe(true);
  });

  it("두 수명주기가 섞이면(첫 end 전에 둘째 create) 순서 위반이다", () => {
    const a = analyze([c1, b1, c2, e1, RULES_REFRESHED, b2, e2]);
    expect(a.violations).toContain("PROGRESS_ORDER");
  });

  it("rulesRefreshed 가 첫 end 보다 앞서면(이전 조립기의 순서) 순서 위반이다", () => {
    const a = analyze([c1, b1, RULES_REFRESHED, e1, c2, b2, e2]);
    expect(a.violations).toContain("PROGRESS_ORDER");
    expect(a.state).toBe("INVALID");
  });

  it("둘째 create 가 rulesRefreshed 보다 앞서면 순서 위반이다", () => {
    const a = analyze([c1, b1, e1, c2, b2, RULES_REFRESHED, e2]);
    expect(a.violations).toContain("PROGRESS_ORDER");
  });

  it("두 수명주기를 같은 토큰으로 만들면 둘째가 등록되지 않아 완료가 아니다", () => {
    const a = analyze([
      ...refreshProgress(),
      RULES_REFRESHED,
      ...openDocumentsProgress({ id: "other-id", token: PROGRESS_REFRESH.token }),
    ]);
    expect(a.violations).toContain("PROGRESS_TOKEN_DUPLICATE");
    expect(a.complete).toBe(false);
  });
});

describe("스트림·청크·프레임 분할에 상관없이 같은 증거면 같은 결과다", () => {
  const preamble = (): Uint8Array => bytesOf(preambleLines(scanLay.rulesDir));
  const barrierStderr = (): Uint8Array =>
    bytesOf(scanPreOpenLines()).subarray(preamble().byteLength);

  /** 같은 바이트들을 주어진 크기로 쪼개 ScanLiveWatch 에 먹이고, stderr/stdout 도착 순서도 바꾼다. */
  function run(opts: { stdoutChunk: number; stderrChunk: number; stderrFirst: boolean }): string {
    const w = new ScanLiveWatch(watchConfig());
    const stdoutAll = frames(good());
    const initFrame = frames([scanInitResponse()]);
    w.feedStderr(preamble(), 100);
    w.feedStdout(initFrame, 200);
    w.markInitializedSent();
    const feedOut = (): void => {
      for (let at = 0; at < stdoutAll.byteLength; at += opts.stdoutChunk) {
        w.feedStdout(stdoutAll.subarray(at, at + opts.stdoutChunk), 300 + at);
      }
    };
    const feedErr = (): void => {
      const e = barrierStderr();
      for (let at = 0; at < e.byteLength; at += opts.stderrChunk) {
        w.feedStderr(e.subarray(at, at + opts.stderrChunk), 400 + at);
      }
    };
    if (opts.stderrFirst) {
      feedErr();
      feedOut();
    } else {
      feedOut();
      feedErr();
    }
    const b = w.barrierStatus();
    return JSON.stringify({
      ready: b.ready,
      clean: b.clean,
      problems: b.problems,
      s: b.progressState,
    });
  }

  it("청크 크기와 stdout/stderr 도착 순서를 바꿔도 결과가 같다", () => {
    const base = run({ stdoutChunk: 1 << 20, stderrChunk: 1 << 20, stderrFirst: false });
    expect(JSON.parse(base)).toMatchObject({
      ready: true,
      clean: true,
      problems: [],
      s: "COMPLETE",
    });
    for (const stdoutChunk of [1, 3, 17, 64]) {
      for (const stderrChunk of [1, 29, 1 << 20]) {
        for (const stderrFirst of [true, false]) {
          expect(
            run({ stdoutChunk, stderrChunk, stderrFirst }),
            `${stdoutChunk}/${stderrChunk}/${stderrFirst}`
          ).toBe(base);
        }
      }
    }
  });

  it("프레임이 완성되기 전에는 보이지 않는다: 바이트를 하나씩 먹일 때 마지막 바이트에서만 COMPLETE 가 된다", () => {
    const w = new ScanLiveWatch(watchConfig());
    w.feedStderr(preamble(), 100);
    w.feedStdout(frames([scanInitResponse()]), 200);
    w.markInitializedSent();
    w.feedStderr(barrierStderr(), 250);
    const all = frames(good());
    for (let i = 0; i < all.byteLength; i += 1) {
      w.feedStdout(all.subarray(i, i + 1), 300 + i);
      const done = i === all.byteLength - 1;
      expect(w.barrierReady(), `byte ${i}`).toBe(done);
      expect(w.progressComplete(), `byte ${i}`).toBe(done);
    }
  });
});

describe("ScanProgressTracker — didOpen 직전에 얼린다", () => {
  it("freeze 뒤에 도착한 프레임은 사전 장벽을 바꾸지 못한다", () => {
    const t = new ScanProgressTracker();
    for (const m of [...refreshProgress(), RULES_REFRESHED, openDocumentsProgress()[0]])
      t.absorb(m);
    expect(t.analysis().state).toBe("INCOMPLETE");
    t.freeze();
    for (const m of openDocumentsProgress().slice(1)) t.absorb(m);
    expect(t.analysis().state).toBe("INCOMPLETE"); // 얼린 뒤의 begin·end 는 반영되지 않는다
    expect(t.isFrozen).toBe(true);
  });
});

describe("사후 재해석 — 원문 바이트에서 같은 결과를 다시 만든다", () => {
  it("analyzeScanStdout 의 progressFrames 로 만든 분석은 실시간 분석과 같다(바이트 구간 포함)", () => {
    const bytes = frames([scanInitResponse(), ...good()]);
    const out = analyzeScanStdout(bytes, true);
    const a = analyzeScanProgress(out.progressFrames);
    expect(a.complete).toBe(true);
    // 바이트 구간은 프레임 경계다
    expect(a.requests.map((r) => r.startByte)).toEqual(
      out.frameList
        .filter((f) => f.method === "window/workDoneProgress/create")
        .map((f) => f.startByte)
    );
    const live = analyze(good());
    expect(a.problems).toEqual(live.problems);
    expect(a.lifecycles.map((l) => [l.stage, l.status])).toEqual(
      live.lifecycles.map((l) => [l.stage, l.status])
    );
  });

  it("디코더가 만든 메시지로도 같다(분할 입력)", () => {
    const decoder = new FrameDecoder();
    const all = frames(good());
    const messages: JsonRpcMessage[] = [];
    for (let at = 0; at < all.byteLength; at += 5) {
      messages.push(...decoder.push(all.subarray(at, at + 5)).messages);
    }
    expect(analyze(messages).complete).toBe(true);
  });
});
