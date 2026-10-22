import { describe, expect, it } from "vitest";
import { expectedUri } from "../uri";
import type { Transcript, TranscriptEvent } from "../types";
import {
  IDS,
  after,
  appendCleanup,
  appendExit,
  appendKill,
  appendTimeout,
  assertValidTranscript,
  atEnd,
  before,
  cutAfter,
  cutAfterEvent,
  dropBarrier,
  dropCleanup,
  dropEchoResponse,
  dropEventAt,
  dropEvents,
  dropExit,
  dropSend,
  dropStderrLine,
  duplicateStderrLine,
  endByTimeout,
  happyTranscript,
  insertPublish,
  insertStderrLine,
  insertStdoutMessage,
  kindIs,
  moveAcrossStreams,
  notification,
  pipe,
  publishMessage,
  renumber,
  replaceStderrLine,
  replaceStdoutMessage,
  responseIs,
  segmentWhere,
  sendIs,
  setMeta,
  setStderrPartial,
  stderrIs,
  stdoutMethodIs,
  stripEnding,
  truncateStdout,
  validateTranscript,
  type HappySpec,
} from "./transcript-builder";

const ROOT = "/tmp/scan";
const SPEC: HappySpec = {
  mode: "target",
  scanRoot: ROOT,
  expectedPaths: ["a/one.ts", "b/two.ts", "c/three.ts"],
  loadingPaths: ["semgrep-rules/javascript/x/r1.yaml", "semgrep-rules/typescript/y/r2.yaml"],
  serverVersion: "1.180.0",
  n: 4,
  s: 0,
  k: 3,
  m: 0,
};

function happy(): Transcript {
  return happyTranscript(SPEC);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function stderrTexts(t: Transcript): string[] {
  return t.events.flatMap((e) => (e.kind === "stderr-line" ? [e.text] : []));
}
function kinds(t: Transcript): string[] {
  return t.events.map((e) => e.kind);
}

describe("happyTranscript", () => {
  it("일관된 트랜스크립트이고 기본 provenance는 stub이다", () => {
    const t = happy();
    expect(validateTranscript(t)).toEqual([]);
    expect(t.meta.provenance).toBe("stub");
    expect(t.meta.mode).toBe("target");
    expect(t.meta.schema).toBe("semgrep-lsp-transcript/1");
  });

  it("같은 명세는 같은 트랜스크립트를 만든다(결정적)", () => {
    expect(happy()).toEqual(happy());
  });

  it("사건 순서: 초기화 → 규칙 로딩 → 에코 → 스캔 → 게시 → 장벽 → 에코 → 종료", () => {
    const t = happy();
    expect(kinds(t)[0]).toBe("spawn");
    expect(kinds(t).slice(-2)).toEqual(["exit", "cleanup"]);
    const labels = t.events.flatMap((e) => (e.kind === "send" ? [e.label] : []));
    expect(labels).toEqual([
      "initialize",
      "initialized",
      "echo-pre-scan",
      "scan-workspace",
      "echo-post-barrier",
      "shutdown",
      "exit",
    ]);
    const texts = stderrTexts(t);
    expect(texts.indexOf("Rules refreshed")).toBeGreaterThan(
      texts.indexOf("Got 0 errors while refreshing rules in language server")
    );
    expect(texts[texts.length - 1]).toBe("Scanning workspace complete");
  });

  it("로딩 쌍·엔진 보고 줄에 명세의 값이 들어간다", () => {
    const texts = stderrTexts(happy());
    expect(texts).toContain("loading local config from semgrep-rules/javascript/x/r1.yaml");
    expect(texts).toContain("Done loading local config from semgrep-rules/typescript/y/r2.yaml");
    expect(texts).toContain("Running Semgrep with 4 rules");
    expect(texts).toContain("Semgrep errors:");
    expect(texts).toContain("Semgrep skipped 0 rules");
    expect(texts).toContain("Scanned 3 files");
    expect(texts).toContain("Found 0 matches");
  });

  it("게시 URI는 uri.ts의 표준 형태이고 명세의 순서다", () => {
    const t = happy();
    const uris = t.events.flatMap((e) =>
      e.kind === "stdout-message" && e.message.method === "textDocument/publishDiagnostics"
        ? [(e.message.params as { uri: string }).uri]
        : []
    );
    expect(uris).toEqual(SPEC.expectedPaths.map((p) => expectedUri(ROOT, p)));
  });

  it("serverVersion이 null이면 serverInfo가 없다", () => {
    const t = happyTranscript({ ...SPEC, serverVersion: null });
    const initResponse = t.events.find(
      (e) => e.kind === "stdout-message" && e.message.id === IDS.initialize
    ) as Extract<TranscriptEvent, { kind: "stdout-message" }>;
    expect(initResponse.message.result).toEqual({ capabilities: {} });
  });

  it("진단·엔진 오류 본문을 명세대로 싣는다", () => {
    const t = happyTranscript({
      ...SPEC,
      diagnostics: { "a/one.ts": [{ severity: 2, code: "r", message: "m" }] },
      engineErrorsText: "timeout on file",
    });
    expect(stderrTexts(t)).toContain("Semgrep errors: timeout on file");
    const first = t.events.find(
      (e) => e.kind === "stdout-message" && e.message.method === "textDocument/publishDiagnostics"
    ) as Extract<TranscriptEvent, { kind: "stdout-message" }>;
    expect((first.message.params as { diagnostics: unknown[] }).diagnostics).toHaveLength(1);
  });

  it("provenance를 real로 바꿀 수 있다(평가기 논리 시험용일 뿐 실제 실행이 아니다)", () => {
    expect(happyTranscript({ ...SPEC, provenance: "real" }).meta.provenance).toBe("real");
  });
});

describe("renumber · validateTranscript", () => {
  it("renumber는 멱등이고 입력을 바꾸지 않는다", () => {
    const t = deepFreeze(happy());
    const again = renumber(t);
    expect(again).toEqual(t);
    expect(renumber(again)).toEqual(again);
  });

  it("번호·인덱스·cursor를 모두 망가뜨려도 renumber하면 다시 일관된다", () => {
    const t = structuredClone(happy());
    for (const e of t.events) {
      e.seq = 999;
      e.t = -1;
      if (e.kind === "stdout-message" || e.kind === "stderr-line") e.index = 999;
      if (e.kind === "send" || e.kind === "phase") e.cursor = { stdout: 999, stderr: 999 };
    }
    expect(validateTranscript(t).length).toBeGreaterThan(0);
    expect(validateTranscript(renumber(t))).toEqual([]);
    expect(renumber(t)).toEqual(happy());
  });

  it("seq가 어긋나면 잡는다", () => {
    const t = structuredClone(happy());
    t.events[3].seq = 99;
    expect(validateTranscript(t).join("\n")).toContain("seq");
  });

  it("t가 줄어들면 잡는다", () => {
    const t = structuredClone(happy());
    t.events[5].t = -5;
    expect(validateTranscript(t).join("\n")).toContain("t가 줄어들었다");
  });

  it("stdout·stderr 인덱스가 어긋나면 잡는다", () => {
    const stdoutIdx = structuredClone(happy());
    const out = stdoutIdx.events.find((e) => e.kind === "stdout-message") as Extract<
      TranscriptEvent,
      { kind: "stdout-message" }
    >;
    out.index = 7;
    expect(validateTranscript(stdoutIdx).join("\n")).toContain("stdout 인덱스");

    const stderrIdx = structuredClone(happy());
    const line = stderrIdx.events.find((e) => e.kind === "stderr-line") as Extract<
      TranscriptEvent,
      { kind: "stderr-line" }
    >;
    line.index = 5;
    expect(validateTranscript(stderrIdx).join("\n")).toContain("stderr 인덱스");
  });

  it("cursor가 어긋나면 잡는다", () => {
    const t = structuredClone(happy());
    const scan = t.events.find((e) => e.kind === "send" && e.label === "scan-workspace") as Extract<
      TranscriptEvent,
      { kind: "send" }
    >;
    scan.cursor.stdout += 1;
    expect(validateTranscript(t).join("\n")).toContain("cursor");
  });

  it("stdout-eof 뒤의 stdout-message와 exit 중복을 잡는다", () => {
    const t = structuredClone(happy());
    const eof = t.events.findIndex((e) => e.kind === "stdout-eof");
    t.events.splice(eof + 1, 0, {
      seq: 0,
      t: 0,
      kind: "stdout-message",
      index: 0,
      message: notification("x"),
    });
    const fixed = renumber(t);
    expect(validateTranscript(fixed).join("\n")).toContain("stdout-eof 뒤");

    // appendExit은 두 번째 exit를 만드는 순간 던진다.
    expect(() => appendExit({ code: 1 })(happy())).toThrow(/exit 사건이 2번/);
    const twoExits = renumber({
      meta: happy().meta,
      events: [...happy().events, ...happy().events.filter((e) => e.kind === "exit")],
    });
    expect(validateTranscript(twoExits).join("\n")).toContain("exit 사건이 2번");
  });

  it("assertValidTranscript는 위반이 있으면 던지고 없으면 그대로 돌려준다", () => {
    const t = happy();
    expect(assertValidTranscript(t)).toBe(t);
    const broken = structuredClone(t);
    broken.events[1].seq = 40;
    expect(() => assertValidTranscript(broken)).toThrow(/일관되지 않다/);
  });
});

describe("변형기", () => {
  it("모든 변형기는 입력을 바꾸지 않고 항상 일관된 결과를 돌려준다", () => {
    const t = deepFreeze(happy());
    const results = [
      dropStderrLine("Rules refreshed"),
      dropSend("echo-pre-scan"),
      dropExit,
      dropBarrier,
      dropEchoResponse("post"),
      duplicateStderrLine("Scanning workspace"),
      insertStderrLine("extra", atEnd),
      insertPublish(expectedUri(ROOT, "a/one.ts"), [], "late"),
      replaceStderrLine("Scanned workspace", "x"),
      setStderrPartial("Scanning workspace complete"),
      truncateStdout(before(responseIs(IDS.echoPost)), "TRUNCATED"),
      cutAfter(10),
      setMeta({ provenance: "real" }),
      stripEnding,
      appendTimeout("PH3", "barrier"),
      appendKill(),
      (x: Transcript) => appendExit({ code: 1 })(dropExit(x)),
    ].map((m) => m(t));
    for (const r of results) expect(validateTranscript(r)).toEqual([]);
    expect(t).toEqual(happy());
  });

  it("dropStderrLine / dropBarrier / dropSend / dropExit / dropEchoResponse", () => {
    const t = happy();
    expect(stderrTexts(dropStderrLine("Rules refreshed")(t))).not.toContain("Rules refreshed");
    expect(stderrTexts(dropBarrier(t))).not.toContain("Scanning workspace complete");
    expect(kinds(dropExit(t))).not.toContain("exit");
    expect(dropSend("echo-pre-scan")(t).events.some(sendIs("echo-pre-scan"))).toBe(false);
    const noEcho = dropEchoResponse("post")(t);
    expect(noEcho.events.some(responseIs(IDS.echoPost))).toBe(false);
    expect(noEcho.events.some(responseIs(IDS.echoPre))).toBe(true);
  });

  it("dropEventAt는 위치로 하나를 지우고 범위 밖이면 던진다", () => {
    const base = happy();
    const dropped = dropEventAt(2)(base);
    expect(dropped.events).toHaveLength(base.events.length - 1);
    expect(validateTranscript(dropped)).toEqual([]);
    expect(() => dropEventAt(base.events.length)(base)).toThrow(/범위를 벗어난/);
    expect(() => dropEventAt(-1)(base)).toThrow(/범위를 벗어난/);
  });

  it("정규식·nth·'all'로 고른다", () => {
    const t = happy();
    const noLoading = dropStderrLine(/^loading local config/, "all")(t);
    expect(stderrTexts(noLoading).filter((x) => x.startsWith("loading local"))).toEqual([]);
    const second = dropStderrLine(/^loading local config/, 1)(t);
    expect(stderrTexts(second).filter((x) => x.startsWith("loading local"))).toHaveLength(1);
  });

  it("없는 사건을 고르면 던진다(조용히 무시하지 않는다)", () => {
    expect(() => dropStderrLine("no such line")(happy())).toThrow(/일치하는 사건이 없다/);
    expect(() => dropStderrLine("Rules refreshed", 3)(happy())).toThrow(/일치하는 사건이 없다/);
  });

  it("duplicateStderrLine은 바로 뒤에 복사본을 넣고 인덱스를 다시 매긴다", () => {
    const t = duplicateStderrLine("Scanning workspace")(happy());
    const texts = stderrTexts(t);
    const i = texts.indexOf("Scanning workspace");
    expect(texts[i + 1]).toBe("Scanning workspace");
    expect(validateTranscript(t)).toEqual([]);
  });

  it("insertStderrLine / insertStdoutMessage는 지정한 위치에 들어가고 cursor가 갱신된다", () => {
    const base = happy();
    const withLine = insertStderrLine("surprise", before(sendIs("scan-workspace")))(base);
    const scanBefore = base.events.find(sendIs("scan-workspace")) as Extract<
      TranscriptEvent,
      { kind: "send" }
    >;
    const scanAfter = withLine.events.find(sendIs("scan-workspace")) as Extract<
      TranscriptEvent,
      { kind: "send" }
    >;
    expect(scanAfter.cursor.stderr).toBe(scanBefore.cursor.stderr + 1);
    expect(scanAfter.cursor.stdout).toBe(scanBefore.cursor.stdout);

    const withMsg = insertStdoutMessage(
      notification("custom/x"),
      after(sendIs("initialized"))
    )(base);
    expect(withMsg.events.some(stdoutMethodIs("custom/x"))).toBe(true);
    const scan2 = withMsg.events.find(sendIs("scan-workspace")) as Extract<
      TranscriptEvent,
      { kind: "send" }
    >;
    expect(scan2.cursor.stdout).toBe(scanBefore.cursor.stdout + 1);
  });

  it("insertPublish의 구간: init < rules < pre-scan < scan < late (배열 위치 기준)", () => {
    const base = happy();
    const posOf = (segment: Parameters<typeof insertPublish>[2]) => {
      const t = insertPublish("file:///marker", [], segment)(base);
      return t.events.findIndex(
        (e) =>
          e.kind === "stdout-message" &&
          (e.message.params as { uri?: string } | undefined)?.uri === "file:///marker"
      );
    };
    const p = (["init", "rules", "pre-scan", "scan", "late"] as const).map(posOf);
    expect(p).toEqual([...p].sort((a, b) => a - b));
    expect(new Set(p).size).toBe(5);

    const initResp = base.events.findIndex(responseIs(IDS.initialize));
    expect(posOf("init")).toBe(initResp);
    expect(segmentWhere("late")(base.events)).toBe(
      base.events.findIndex(responseIs(IDS.echoPost)) + 1
    );
  });

  it("dropEvents('all')는 일치하는 사건을 모두 지운다", () => {
    const t = dropEvents(stdoutMethodIs("textDocument/publishDiagnostics"), "all")(happy());
    expect(t.events.some(stdoutMethodIs("textDocument/publishDiagnostics"))).toBe(false);
  });

  it("replaceStderrLine / replaceStdoutMessage / setStderrPartial", () => {
    const t = pipe(
      happy(),
      replaceStderrLine("Scanned 3 files", "Scanned 2 files"),
      replaceStdoutMessage(responseIs(IDS.echoPre), {
        jsonrpc: "2.0",
        id: IDS.echoPre,
        error: { code: 1, message: "x" },
      }),
      setStderrPartial("Scanning workspace complete")
    );
    expect(stderrTexts(t)).toContain("Scanned 2 files");
    const resp = t.events.find(responseIs(IDS.echoPre)) as Extract<
      TranscriptEvent,
      { kind: "stdout-message" }
    >;
    expect(resp.message.error?.code).toBe(1);
    const barrier = t.events.find(stderrIs("Scanning workspace complete")) as Extract<
      TranscriptEvent,
      { kind: "stderr-line" }
    >;
    expect(barrier.partial).toBe(true);
  });

  it("moveAcrossStreams: 서로 다른 스트림 사이의 위치만 바꾸고 스트림 안의 순서는 그대로다", () => {
    const base = happy();
    const barrierMatch = stderrIs("Scanning workspace complete");
    const firstPublish = before(stdoutMethodIs("textDocument/publishDiagnostics"), 0);
    const moved = moveAcrossStreams(barrierMatch, firstPublish)(base);
    // 스트림별로 뽑은 내용은 같다.
    expect(stderrTexts(moved)).toEqual(stderrTexts(base));
    const stdoutOf = (t: Transcript) =>
      t.events.flatMap((e) => (e.kind === "stdout-message" ? [e.message] : []));
    expect(stdoutOf(moved)).toEqual(stdoutOf(base));
    // 배열에서는 장벽이 첫 게시보다 앞선다.
    const iBarrier = moved.events.findIndex(barrierMatch);
    const iPublish = moved.events.findIndex(stdoutMethodIs("textDocument/publishDiagnostics"));
    expect(iBarrier).toBeLessThan(iPublish);
    expect(validateTranscript(moved)).toEqual([]);
  });

  it("moveAcrossStreams: 같은 스트림의 사건을 건너뛰면 거부한다", () => {
    const base = happy();
    // 장벽(stderr)을 'Rules refreshed'(stderr) 앞으로 옮기면 stderr 순서가 바뀐다.
    expect(() =>
      moveAcrossStreams(
        stderrIs("Scanning workspace complete"),
        before(stderrIs("Rules refreshed"))
      )(base)
    ).toThrow(/같은 스트림/);
    // 스트림 사건이 아닌 것은 옮길 수 없다.
    expect(() => moveAcrossStreams(sendIs("initialized"), atEnd)(base)).toThrow(
      /스트림 사건이 아니다/
    );
  });

  it("truncateStdout: 그 뒤의 stdout 메시지를 지우고 프레임 오류(TRUNCATED면 EOF도)를 넣는다", () => {
    const t = truncateStdout(before(responseIs(IDS.echoPost)), "TRUNCATED")(happy());
    expect(t.events.some(responseIs(IDS.echoPost))).toBe(false);
    const errIdx = t.events.findIndex((e) => e.kind === "stdout-frame-error");
    expect(errIdx).toBeGreaterThan(0);
    expect(t.events[errIdx + 1].kind).toBe("stdout-eof");
    expect(t.events.filter((e) => e.kind === "stdout-eof")).toHaveLength(1);

    const m = truncateStdout(before(responseIs(IDS.echoPre)), "MALFORMED")(happy());
    const e = m.events.find((x) => x.kind === "stdout-frame-error") as Extract<
      TranscriptEvent,
      { kind: "stdout-frame-error" }
    >;
    expect(e.error).toBe("MALFORMED");
    // 그 위치 뒤의 stdout 메시지(게시·에코 응답)는 모두 사라졌다.
    expect(m.events.filter((x) => x.kind === "stdout-message").length).toBeLessThan(
      happy().events.filter((x) => x.kind === "stdout-message").length
    );
  });

  it("cutAfter / cutAfterEvent는 접두사를 만든다", () => {
    const base = happy();
    expect(cutAfter(0)(base).events).toEqual([]);
    expect(cutAfter(7)(base).events).toHaveLength(7);
    const cut = cutAfterEvent(sendIs("initialize"))(base);
    expect(cut.events[cut.events.length - 1].kind).toBe("send");
    expect(cut.events.map((e) => e.kind)).toEqual(["spawn", "phase", "send"]);
  });

  it("끝에 덧붙이는 사건과 endByTimeout / stripEnding", () => {
    const stripped = stripEnding(happy());
    expect(kinds(stripped)).not.toContain("exit");
    expect(stripped.events.some(sendIs("shutdown"))).toBe(false);
    expect(stripped.events.some(sendIs("exit"))).toBe(false);

    const t = endByTimeout("PH3", "barrier")(stripped);
    const tail = t.events.slice(-4);
    expect(tail.map((e) => e.kind)).toEqual(["timeout", "kill", "exit", "cleanup"]);
    const exit = tail[2] as Extract<TranscriptEvent, { kind: "exit" }>;
    expect(exit.byHarness).toBe(true);
    expect(exit.signal).toBe("SIGKILL");
    expect(tail[3]).toMatchObject({ kind: "cleanup", ok: true });
    expect(kinds(t).filter((k) => k === "cleanup")).toHaveLength(1);
  });

  it("appendCleanup / dropCleanup: 정리 기록을 끝에 덧붙이거나 모두 지운다(개수는 검증하지 않는다)", () => {
    const base = happy();
    expect(base.events.filter(kindIs("cleanup"))).toHaveLength(1);
    expect(base.events[base.events.length - 1]).toMatchObject({ kind: "cleanup", ok: true });

    const none = dropCleanup(base);
    expect(none.events.some(kindIs("cleanup"))).toBe(false);
    expect(validateTranscript(none)).toEqual([]);

    const failed = pipe(base, dropCleanup, appendCleanup(false, "정리 실패"));
    expect(failed.events[failed.events.length - 1]).toMatchObject({
      kind: "cleanup",
      ok: false,
      detail: "정리 실패",
    });

    const twice = appendCleanup()(base);
    expect(twice.events.filter(kindIs("cleanup"))).toHaveLength(2);
    expect(validateTranscript(twice)).toEqual([]);
    // detail을 주지 않으면 필드 자체가 없다.
    expect("detail" in (appendCleanup(true)(none).events.at(-1) as object)).toBe(false);
    // stripEnding은 cleanup도 걷어낸다(새 끝을 붙이는 쪽이 정리 기록도 책임진다).
    expect(stripEnding(base).events.some(kindIs("cleanup"))).toBe(false);
  });

  it("setMeta는 메타만 바꾼다", () => {
    const base = happy();
    const real = setMeta({ provenance: "real", runId: "r2" })(base);
    expect(real.meta.provenance).toBe("real");
    expect(real.meta.runId).toBe("r2");
    expect(real.events).toEqual(base.events);
    expect(base.meta.provenance).toBe("stub");
  });

  it("publishMessage는 진단을 복사해 담는다", () => {
    const diag = [{ severity: 1, code: "c" }];
    const msg = publishMessage("file:///x", diag);
    diag.push({ severity: 2, code: "d" });
    expect((msg.params as { diagnostics: unknown[] }).diagnostics).toHaveLength(1);
  });

  it("pipe는 왼쪽부터 차례로 적용한다", () => {
    const t = pipe(
      happy(),
      dropBarrier,
      dropExit,
      appendTimeout("PH3", "barrier"),
      appendExit({ code: 2 })
    );
    expect(kinds(t).slice(-3)).toEqual(["cleanup", "timeout", "exit"]);
    expect(kindIs("exit")(t.events[t.events.length - 1])).toBe(true);
  });
});
