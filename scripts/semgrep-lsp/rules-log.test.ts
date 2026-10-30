import { describe, expect, it } from "vitest";
import {
  analyzeRulesLog,
  bracketDelta,
  classifyRulesMessage,
  comparableLoadingPath,
  parseHeader,
  RulesLogScanner,
  type RulesSignal,
} from "./rules-log";
import {
  crlf,
  enc,
  happyStderrLines,
  preambleLines,
  refreshLines,
  SHUTDOWN_LINES,
} from "./testing/rules-fixtures";

const RULES_DIR = "C:\\ProgramData\\x\\work\\lsp\\lsp-state\\rules-probe";
const keys = (signals: readonly RulesSignal[]): string[] => signals.map((s) => s.key);

describe("parseHeader", () => {
  it("머리말 모양이 아니면 null이다", () => {
    expect(parseHeader("Refreshing rules")).toBeNull();
    expect(parseHeader("{")).toBeNull();
    expect(parseHeader("  [00.11] x")).toBeNull();
    expect(parseHeader("")).toBeNull();
  });

  it("DEBUG는 첫 괄호가 태그, 둘째가 출처다", () => {
    expect(parseHeader("[00.11][DEBUG](default): Executed as: osemgrep lsp --debug")).toEqual({
      seconds: "00.11",
      level: "DEBUG",
      tag: "default",
      source: null,
      message: "Executed as: osemgrep lsp --debug",
    });
    expect(parseHeader("[00.11][DEBUG](default)(semgrep.parsing): x")).toMatchObject({
      tag: "default",
      source: "semgrep.parsing",
    });
  });

  it("INFO·WARNING·ERROR는 태그 없이 선택적 출처만 가진다", () => {
    expect(parseHeader("[01.20][INFO]: loading local config from C:\\a")).toMatchObject({
      level: "INFO",
      tag: null,
      source: null,
      message: "loading local config from C:\\a",
    });
    expect(parseHeader("[01.20][WARNING](semgrep.parsing): skipping rule x")).toMatchObject({
      level: "WARNING",
      tag: null,
      source: "semgrep.parsing",
    });
    expect(parseHeader("[1.2][ERROR]: boom")).toMatchObject({ level: "ERROR", message: "boom" });
  });

  it("빈 본문과 정수 초도 읽는다", () => {
    expect(parseHeader("[00.11][DEBUG](default): ")).toMatchObject({ message: "" });
    expect(parseHeader("[7][INFO]: a")).toMatchObject({ seconds: "7", message: "a" });
  });

  it("머리말처럼 보이지만 읽지 못하는 것은 malformed다 (알 수 없는 수준, 괄호 과다, 콜론 없음)", () => {
    expect(parseHeader("[00.11][TRACE]: x")).toEqual({ malformed: "HEADER_LEVEL" });
    expect(parseHeader("[00.11][info]: x")).toEqual({ malformed: "HEADER_LEVEL" });
    expect(parseHeader("[00.11][DEBUG](a)(b)(c): x")).toEqual({ malformed: "HEADER_PARENS" });
    expect(parseHeader("[00.11][INFO](a)(b): x")).toEqual({ malformed: "HEADER_PARENS" });
    expect(parseHeader("[00.11][INFO] x")).toEqual({ malformed: "HEADER_SHAPE" });
    expect(parseHeader("[00.11] x")).toEqual({ malformed: "HEADER_SHAPE" });
  });
});

describe("classifyRulesMessage", () => {
  it("기존 분류기의 키를 그대로 쓴다", () => {
    expect(classifyRulesMessage("Refreshing rules")).toEqual({
      key: "refreshingRules",
      params: {},
    });
    expect(classifyRulesMessage("Got 0 errors while refreshing rules in language server")).toEqual({
      key: "gotErrors",
      params: { count: 0 },
    });
    expect(classifyRulesMessage("loading local config from C:\\a\\b.yaml")).toEqual({
      key: "loading",
      params: { path: "C:\\a\\b.yaml" },
    });
    expect(classifyRulesMessage("Scanning workspace complete")?.key).toBe(
      "scanningWorkspaceComplete"
    );
  });

  it("이 단계의 새 키: 대상 없음·규칙 없음·토큰 줄·수명 줄", () => {
    expect(classifyRulesMessage("No targets to scan! Not scanning anything.")?.key).toBe(
      "noTargets"
    );
    expect(classifyRulesMessage("No rules to run! Not scanning anything.")?.key).toBe("noRules");
    expect(classifyRulesMessage("Rules not loaded yet, nothing to do")?.key).toBe("rulesNotLoaded");
    for (const benign of [
      "Checking for API token in environment variables",
      "No API token found in environment variables",
      "No settings file found, using default settings",
    ]) {
      expect(classifyRulesMessage(benign)?.key, benign).toBe("tokenBenign");
    }
    expect(classifyRulesMessage("Server stopped")?.key).toBe("lifecycle");
  });

  it("'No settings file found'는 무해한 줄이고 'Settings file found'는 금지 줄이다 (부분 문자열이 아니라 전체 접두어 비교)", () => {
    expect(classifyRulesMessage("No settings file found, using default settings")?.key).toBe(
      "tokenBenign"
    );
    expect(classifyRulesMessage("Settings file found at C:\\x")?.key).toBe("settingsFileFound");
    expect(classifyRulesMessage("Found API token in environment variables")?.key).toBe(
      "tokenFound"
    );
  });

  it("레지스트리로 넘어갔다는 줄은 문구가 달라도 using auto가 보이면 금지 키다 (fail-closed)", () => {
    expect(classifyRulesMessage("No rules source specified, using auto")?.key).toBe("usingAuto");
    expect(classifyRulesMessage("falling back, using auto now")?.key).toBe("usingAuto");
    expect(classifyRulesMessage("trying to download from https://semgrep.dev/x")?.key).toBe(
      "download"
    );
  });

  it("전체 일치만 인식한다: 접두어·접미어·대소문자가 다르면 null이다", () => {
    expect(classifyRulesMessage("Refreshing rules now")).toBeNull();
    expect(classifyRulesMessage("refreshing rules")).toBeNull();
    expect(classifyRulesMessage("Scanned open documents.")).toBeNull();
    expect(classifyRulesMessage("No targets to scan!")).toBeNull();
    expect(classifyRulesMessage("")).toBeNull();
  });

  it("엔진 줄은 모두 엔진 키다", () => {
    expect(classifyRulesMessage("Running Semgrep with 1 rules")?.key).toBe("runningRules");
    expect(classifyRulesMessage("Semgrep errors: ")?.key).toBe("engineErrors");
    expect(classifyRulesMessage("Scanned 3 files")?.key).toBe("scannedFiles");
    expect(classifyRulesMessage("Found 0 matches")?.key).toBe("foundMatches");
    expect(classifyRulesMessage("Semgrep skipped 1 rules")?.key).toBe("skippedRules");
    expect(classifyRulesMessage("Scanning single file")?.key).toBe("scanningSingleFile");
  });
});

describe("bracketDelta", () => {
  it("문자열 안의 괄호와 이스케이프된 따옴표는 세지 않는다", () => {
    expect(bracketDelta("{")).toBe(1);
    expect(bracketDelta("}")).toBe(-1);
    expect(bracketDelta('"a": "{",')).toBe(0);
    expect(bracketDelta('"a": "\\"{",')).toBe(0);
    expect(bracketDelta('"a": [ "x" ], "b": {')).toBe(1);
    expect(bracketDelta("  [c:\\ProgramData\\x\\ws];")).toBe(0);
  });
});

describe("RulesLogScanner — 실제 관측 모양", () => {
  it("서두(안내문 배너·JSON 덤프·세션 덤프)는 수명 줄 말고는 신호를 만들지 않는다", () => {
    const a = analyzeRulesLog(enc(crlf(preambleLines(RULES_DIR))));
    expect(keys(a.signals)).toEqual([
      "lifecycle", // Starting legacy language server
      "lifecycle", // Initializing server
      "lifecycle", // Caching workspace targets
      "lifecycle", // Finished caching workspace targets
      "lifecycle", // Server initialized
    ]);
    expect(a.signals.every((s) => s.level === null && s.shape === "OK")).toBe(true);
    expect(a.counters.malformedHeaders).toBe(0);
    expect(a.counters.orphanBareLines).toBe(0);
    expect(a.counters.embeddedSignalText).toBe(0);
  });

  it("정상 새로고침 줄은 기대한 키와 모양으로 읽힌다", () => {
    const a = analyzeRulesLog(enc(crlf(happyStderrLines(RULES_DIR))));
    const interesting = a.signals.filter((s) => s.key !== "lifecycle");
    expect(interesting.map((s) => `${s.key}/${s.level ?? "bare"}/${s.shape}`)).toEqual([
      "refreshingRules/bare/OK",
      "tokenBenign/INFO/OK",
      "tokenBenign/INFO/OK",
      "tokenBenign/INFO/OK",
      "ciDisabled/DEBUG/OK",
      "loading/INFO/OK",
      "doneLoading/INFO/OK",
      "gotErrors/INFO/OK",
      "rulesRefreshed/bare/OK",
      "scanningOpenDocuments/bare/OK",
      "noTargets/WARNING/OK",
      "scannedOpenDocuments/bare/OK",
    ]);
    const loading = a.signals.find((s) => s.key === "loading");
    expect(comparableLoadingPath(String(loading?.params.path))).toBe(
      comparableLoadingPath(`${RULES_DIR}/lsp-rules-1-probe.yaml`)
    );
    expect(a.counters.malformedHeaders).toBe(0);
    expect(a.counters.orphanBareLines).toBe(0);
  });

  it("CRLF와 LF는 같은 결과를 준다", () => {
    const lines = happyStderrLines(RULES_DIR);
    const a = analyzeRulesLog(enc(crlf(lines)));
    const b = analyzeRulesLog(enc(lines.join("\n") + "\n"));
    expect(keys(b.signals)).toEqual(keys(a.signals));
    expect(b.counters.lines).toBe(a.counters.lines);
  });

  it("어떤 위치에서 청크를 잘라도(바이트 단위 포함) 신호와 바이트 위치가 같다", () => {
    const bytes = enc(crlf(happyStderrLines(RULES_DIR)));
    const whole = analyzeRulesLog(bytes);
    const project = (signals: readonly RulesSignal[]): string[] =>
      signals.map((s) => `${s.key}@${s.byteOffset}#${s.recordIndex}`);
    for (const size of [1, 2, 3, 7, 64, 1000]) {
      const scanner = new RulesLogScanner();
      for (let at = 0; at < bytes.length; at += size) scanner.push(bytes.subarray(at, at + size));
      scanner.end();
      expect(project(scanner.signals), `chunk ${size}`).toEqual(project(whole.signals));
    }
  });

  it("바이트 위치는 멀티바이트 문자가 있어도 스트림 기준이다", () => {
    const text = "[00.01][INFO]: 한글 경로 ✓\r\nRefreshing rules\r\n";
    const a = analyzeRulesLog(enc(text));
    const refreshing = a.signals.find((s) => s.key === "refreshingRules");
    expect(refreshing?.byteOffset).toBe(enc("[00.01][INFO]: 한글 경로 ✓\r\n").byteLength);
  });

  it("개행 없는 마지막 줄도 end에서 처리하고 partialTail로 남긴다", () => {
    const scanner = new RulesLogScanner();
    scanner.push(enc("Refreshing rules\nRules refreshed"));
    expect(keys(scanner.signals)).toEqual(["refreshingRules"]);
    scanner.end();
    expect(keys(scanner.signals)).toEqual(["refreshingRules", "rulesRefreshed"]);
    expect(scanner.counters.partialTail).toBe(true);
  });
});

describe("RulesLogScanner — 덤프 안의 문자열을 신호로 오인하지 않는다", () => {
  it("Handling request: 뒤 JSON 안의 문자열은 신호가 아니다", () => {
    const a = analyzeRulesLog(
      enc(
        crlf([
          "[00.01][DEBUG](default): Handling request:",
          "{",
          '  "message": "Scanned open documents",',
          '  "list": [ "Rules refreshed" ]',
          "}",
          "Rules refreshed",
        ])
      )
    );
    expect(keys(a.signals)).toEqual(["rulesRefreshed"]); // 블록이 닫힌 뒤의 진짜 줄 하나뿐
    expect(a.signals[0].level).toBeNull();
  });

  it("블록 안에 맨줄로 놓인 신호 문구는 임베디드로만 센다", () => {
    const a = analyzeRulesLog(
      enc(
        crlf([
          "[00.01][DEBUG](default): Initialized server with session:",
          "{ Legacy_session.capabilities =",
          "Rules refreshed",
          "Scanned open documents",
          "  is_intellij = false }",
          "Server initialized",
        ])
      )
    );
    expect(keys(a.signals)).toEqual(["lifecycle"]);
    expect(a.counters.embeddedSignalText).toBe(2);
  });

  it("머리말 줄 자신이 여는 괄호(Sending response {)도 블록이다", () => {
    const a = analyzeRulesLog(
      enc(
        crlf([
          "[00.01][DEBUG](default): Sending response {",
          '  "x": 1,',
          "Scanning workspace",
          "}",
          "Refreshing rules",
        ])
      )
    );
    expect(keys(a.signals)).toEqual(["refreshingRules"]);
    expect(a.counters.embeddedSignalText).toBe(1);
  });

  it("머리말 항목의 이어지는 줄(괄호 없음)은 신호가 아니다: 알 수 없는 맨줄은 직전 항목에 붙는다", () => {
    const a = analyzeRulesLog(
      enc(crlf(["[00.01][DEBUG](default): ", "some banner text", "", "more", "Refreshing rules"]))
    );
    expect(keys(a.signals)).toEqual(["refreshingRules"]);
    expect(a.counters.orphanBareLines).toBe(0);
  });

  it("머리말 안의 같은 문구는 머리말 항목의 본문이므로 모양 불일치로 남는다 (INFO로 찍힌 Refreshing rules)", () => {
    const a = analyzeRulesLog(enc(crlf(["[00.01][INFO]: Refreshing rules"])));
    expect(a.signals).toHaveLength(1);
    expect(a.signals[0]).toMatchObject({
      key: "refreshingRules",
      shape: "SHAPE_MISMATCH",
      level: "INFO",
    });
  });

  it("괄호가 닫히지 않는 머리말 본문은 뒤의 맨줄을 삼킨다 — 필요한 신호가 사라지는 쪽(fail-closed)으로만 틀린다", () => {
    const a = analyzeRulesLog(
      enc(
        crlf([
          "[00.01][DEBUG](default): oops { never closed",
          "Rules refreshed",
          "Scanned open documents",
        ])
      )
    );
    expect(keys(a.signals)).toEqual([]);
    expect(a.counters.embeddedSignalText).toBe(2);
    // 다음 머리말 항목이 오면 블록은 끝난다.
    const b = analyzeRulesLog(
      enc(crlf(["[00.01][DEBUG](default): oops {", "[00.02][INFO]: x", "Rules refreshed"]))
    );
    expect(keys(b.signals)).toEqual(["rulesRefreshed"]);
  });
});

describe("RulesLogScanner — 머리말 변형과 모르는 형태", () => {
  it("읽지 못하는 머리말은 신호 없이 malformedHeaders로 센다", () => {
    const a = analyzeRulesLog(
      enc(
        crlf([
          "[00.01][TRACE]: Refreshing rules",
          "[00.02][INFO](a)(b): Rules refreshed",
          "[00.03] x",
        ])
      )
    );
    expect(a.signals).toEqual([]);
    expect(a.counters.malformedHeaders).toBe(3);
  });

  it("ERROR 항목은 본문이 무엇이든 errorRecord를 남기고, 알려진 본문이면 그 키도 남긴다", () => {
    const a = analyzeRulesLog(
      enc(crlf(["[00.01][ERROR]: Unhandled message", "[00.02][ERROR]: Rules refreshed"]))
    );
    expect(keys(a.signals)).toEqual(["errorRecord", "rulesRefreshed", "errorRecord"]);
  });

  it("알 수 없는 WARNING은 신호이고, 알 수 없는 INFO·DEBUG는 세기만 한다", () => {
    const a = analyzeRulesLog(
      enc(
        crlf([
          "[00.01][WARNING]: something odd",
          "[00.02][INFO]: hello",
          "[00.03][DEBUG](default): hi",
        ])
      )
    );
    expect(keys(a.signals)).toEqual(["unexpectedWarning"]);
    expect(a.counters.unclassifiedInfo).toBe(1);
    expect(a.counters.unclassifiedDebug).toBe(1);
  });

  it("항목 없이 나온 알 수 없는 맨줄은 고아 줄이다", () => {
    const a = analyzeRulesLog(enc(crlf(["stray text", "Refreshing rules"])));
    expect(a.counters.orphanBareLines).toBe(1);
    expect(keys(a.signals)).toEqual(["refreshingRules"]);
  });

  it("수준이 다르면 모양 불일치다 (No targets가 INFO, 로딩 줄이 WARNING)", () => {
    const a = analyzeRulesLog(
      enc(
        crlf([
          "[00.01][INFO]: No targets to scan! Not scanning anything.",
          "[00.02][WARNING]: loading local config from C:\\a.yaml",
        ])
      )
    );
    expect(a.signals.map((s) => s.shape)).toEqual(["SHAPE_MISMATCH", "SHAPE_MISMATCH"]);
  });

  it("나오면 안 되는 신호는 모양과 상관없이 같은 키다", () => {
    const a = analyzeRulesLog(
      enc(
        crlf([
          "Running Semgrep with 1 rules",
          "[00.01][DEBUG](default): Running Semgrep with 2 rules",
        ])
      )
    );
    expect(keys(a.signals)).toEqual(["runningRules", "runningRules"]);
    expect(a.signals.every((s) => s.shape === "OK")).toBe(true);
  });

  it("종료 줄 묶음도 수명 줄만 만든다", () => {
    const a = analyzeRulesLog(enc(crlf(SHUTDOWN_LINES)));
    expect(keys(a.signals)).toEqual(["lifecycle", "lifecycle"]);
  });

  it("refreshLines 보조: 구분자를 슬래시로 바꿔도 같은 경로로 비교된다", () => {
    const a = analyzeRulesLog(enc(crlf(refreshLines({ rulesDir: RULES_DIR, separator: "/" }))));
    const loading = a.signals.find((s) => s.key === "loading");
    expect(comparableLoadingPath(String(loading?.params.path))).toBe(
      comparableLoadingPath(`${RULES_DIR}\\lsp-rules-1-probe.yaml`)
    );
  });
});
