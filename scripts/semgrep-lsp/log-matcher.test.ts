import { describe, expect, it } from "vitest";
import {
  classifyStderrLine,
  defaultLogFormat,
  normalizeLoadingPath,
  type LogFormat,
  type LogKey,
} from "./log-matcher";

describe("classifyStderrLine: 매개변수가 없는 키", () => {
  const simple: [LogKey, string][] = [
    ["refreshingRules", "Refreshing rules"],
    ["rulesRefreshed", "Rules refreshed"],
    ["scanningOpenDocuments", "Scanning open documents"],
    ["scannedOpenDocuments", "Scanned open documents"],
    ["scanningWorkspace", "Scanning workspace"],
    ["scannedWorkspace", "Scanned workspace"],
    ["barrier", "Scanning workspace complete"],
    ["fullScan", "Scanning workspace, full: true"],
    ["ciDisabled", "CI disabled, not checking API token"],
    ["usingAuto", "No rules source specified, using auto"],
    ["scanningSingleFile", "Scanning single file"],
  ];

  it.each(simple)("%s ← %j", (key, line) => {
    expect(classifyStderrLine(line)).toEqual({ key, params: {} });
  });

  it("모든 단순 키는 서로 다른 메시지에 대응한다(키 하나당 줄 하나)", () => {
    const keys = simple.map(([, line]) => classifyStderrLine(line)?.key);
    expect(new Set(keys).size).toBe(simple.length);
  });
});

describe("classifyStderrLine: 매개변수가 있는 키", () => {
  it("gotErrors: 개수 N", () => {
    expect(classifyStderrLine("Got 0 errors while refreshing rules in language server")).toEqual({
      key: "gotErrors",
      params: { count: 0 },
    });
    expect(classifyStderrLine("Got 12 errors while refreshing rules in language server")).toEqual({
      key: "gotErrors",
      params: { count: 12 },
    });
  });

  it("loading / doneLoading: 경로를 원문 그대로 돌려준다", () => {
    expect(
      classifyStderrLine("loading local config from semgrep-rules/javascript/a/b.yaml")
    ).toEqual({
      key: "loading",
      params: { path: "semgrep-rules/javascript/a/b.yaml" },
    });
    expect(
      classifyStderrLine("Done loading local config from semgrep-rules\\javascript\\a\\b.yaml")
    ).toEqual({ key: "doneLoading", params: { path: "semgrep-rules\\javascript\\a\\b.yaml" } });
  });

  it("loading: 공백이 있는 경로도 한 덩어리로 받는다", () => {
    expect(classifyStderrLine("loading local config from my rules/a b.yaml")).toEqual({
      key: "loading",
      params: { path: "my rules/a b.yaml" },
    });
  });

  it("skippingRule: 규칙 ID와 오류 본문", () => {
    expect(
      classifyStderrLine("skipping rule semgrep-rules.javascript.x.y-id, error = bad pattern: a, b")
    ).toEqual({
      key: "skippingRule",
      params: { ruleId: "semgrep-rules.javascript.x.y-id", error: "bad pattern: a, b" },
    });
  });

  it("download: URL", () => {
    expect(classifyStderrLine("trying to download from https://semgrep.dev/c/auto")).toEqual({
      key: "download",
      params: { url: "https://semgrep.dev/c/auto" },
    });
  });

  it("runningRules / skippedRules / scannedFiles / foundMatches: 숫자", () => {
    expect(classifyStderrLine("Running Semgrep with 214 rules")).toEqual({
      key: "runningRules",
      params: { n: 214 },
    });
    expect(classifyStderrLine("Semgrep skipped 0 rules")).toEqual({
      key: "skippedRules",
      params: { s: 0 },
    });
    expect(classifyStderrLine("Scanned 128 files")).toEqual({
      key: "scannedFiles",
      params: { k: 128 },
    });
    expect(classifyStderrLine("Found 7 matches")).toEqual({
      key: "foundMatches",
      params: { m: 7 },
    });
  });

  it("engineErrors: 본문이 비어 있어도(C4) 키로 인식하고 text는 빈 문자열", () => {
    expect(classifyStderrLine("Semgrep errors:")).toEqual({
      key: "engineErrors",
      params: { text: "" },
    });
    expect(classifyStderrLine("Semgrep errors: ")).toEqual({
      key: "engineErrors",
      params: { text: "" },
    });
    expect(classifyStderrLine("Semgrep errors: file.ts: parse error")).toEqual({
      key: "engineErrors",
      params: { text: "file.ts: parse error" },
    });
  });
});

describe("classifyStderrLine: 메시지 본문 전체 일치 (S10 근접 오류)", () => {
  it("'Scanned workspace'는 장벽이 아니다(전송 전 로그)", () => {
    expect(classifyStderrLine("Scanned workspace")?.key).toBe("scannedWorkspace");
    expect(classifyStderrLine("Scanned workspace")?.key).not.toBe("barrier");
  });

  it("'Scanning workspace complete'는 'Scanning workspace'가 아니다", () => {
    expect(classifyStderrLine("Scanning workspace complete")?.key).toBe("barrier");
  });

  it("'Scanning workspace, full: true'는 'Scanning workspace'가 아니다", () => {
    expect(classifyStderrLine("Scanning workspace, full: true")?.key).toBe("fullScan");
  });

  it.each([
    "Scanning workspace completed",
    "Scanning workspace complete!",
    "Scanning workspace complete.",
    "Scanning workspaces",
    "Scanning workspace, full: false",
    "Scanning workspace, full: true extra",
    "Scanned workspaces",
    "xScanning workspace",
    "[DEBUG] Scanning workspace complete",
    "scanning workspace",
    "SCANNING WORKSPACE",
    "Scanning  workspace",
    "Scanned open documents.",
    "Rules refreshed twice",
    "Refreshing rules...",
    "Scanning single file: a.ts",
    "Got errors while refreshing rules in language server",
    "Got 1.5 errors while refreshing rules in language server",
    "Got -1 errors while refreshing rules in language server",
    "Got 3 errors while refreshing rules in language server again",
    "Got 007 errors while refreshing rules in language server",
    "Running Semgrep with rules",
    "Running Semgrep with 12 rules.",
    "Running Semgrep with 12 rule",
    "Semgrep skipped rules",
    "Semgrep skipped 3 rules (see log)",
    "Scanned files",
    "Scanned 1e3 files",
    "Found matches",
    "Found 4 matches!",
    "Semgrep errors:oops",
    "skipping rule , error = x",
    "skipping rule some-id",
    "skipping rule some-id error = x",
    "loading local config from",
    "Done loading local config from",
    "trying to download from",
    "No rules source specified, using auto.",
    "CI disabled, not checking API token!",
  ])("거부(null): %j", (line) => {
    expect(classifyStderrLine(line)).toBeNull();
  });

  it("앞뒤 공백은 기본 형식에서 제거하지만 중간 공백은 허용하지 않는다", () => {
    expect(classifyStderrLine("  Scanning workspace complete \r")?.key).toBe("barrier");
    expect(classifyStderrLine("Scanning\tworkspace")).toBeNull();
  });

  it("빈 줄·알 수 없는 줄은 null(예외 없음)", () => {
    expect(classifyStderrLine("")).toBeNull();
    expect(classifyStderrLine("   ")).toBeNull();
    expect(classifyStderrLine("Traceback (most recent call last):")).toBeNull();
    expect(classifyStderrLine("\u0000￿한글 😀")).toBeNull();
  });

  it("숫자가 안전 정수 범위를 넘으면 null", () => {
    expect(classifyStderrLine(`Found ${"9".repeat(40)} matches`)).toBeNull();
  });
});

describe("classifyStderrLine: 주입된 LogFormat", () => {
  const stripped: LogFormat = {
    extractMessage: (line) => line.replace(/^\[[^\]]*\] \[(INFO|DEBUG|WARN)\] /, ""),
  };

  it("접두어를 떼는 extractMessage로 같은 키를 인식한다", () => {
    expect(
      classifyStderrLine("[12:00:01] [DEBUG] Scanning workspace complete", stripped)?.key
    ).toBe("barrier");
    expect(
      classifyStderrLine(
        "[12:00:01] [INFO] Got 0 errors while refreshing rules in language server",
        stripped
      )
    ).toEqual({ key: "gotErrors", params: { count: 0 } });
  });

  it("접두어를 떼지 않는 기본 형식은 접두어 붙은 줄을 인식하지 않는다(접두 일치 금지)", () => {
    expect(classifyStderrLine("[12:00:01] [DEBUG] Scanning workspace complete")).toBeNull();
  });

  it("주입된 형식이 돌려준 본문도 전체 일치로만 판정한다", () => {
    const sloppy: LogFormat = { extractMessage: (line) => `${line}!` };
    expect(classifyStderrLine("Scanning workspace", sloppy)).toBeNull();
  });

  it("주입된 extractMessage가 예외를 던져도 null을 돌려준다", () => {
    const boom: LogFormat = {
      extractMessage: () => {
        throw new Error("x");
      },
    };
    expect(classifyStderrLine("Scanning workspace", boom)).toBeNull();
  });

  it("defaultLogFormat은 줄 전체를 다듬은 값이다", () => {
    expect(defaultLogFormat.extractMessage("  abc \r")).toBe("abc");
  });
});

describe("normalizeLoadingPath", () => {
  it("역슬래시를 /로 바꾸고 연속 구분자를 하나로 줄인다", () => {
    expect(normalizeLoadingPath("semgrep-rules\\javascript\\a\\b.yaml")).toBe(
      "semgrep-rules/javascript/a/b.yaml"
    );
    expect(normalizeLoadingPath("semgrep-rules//javascript\\\\a.yaml")).toBe(
      "semgrep-rules/javascript/a.yaml"
    );
  });

  it("이미 정규화된 경로는 그대로다", () => {
    expect(normalizeLoadingPath("semgrep-rules/javascript/a.yaml")).toBe(
      "semgrep-rules/javascript/a.yaml"
    );
  });

  it("앞에 './'를 몰래 떼지 않는다(형식 미확인이라 추측하지 않는다)", () => {
    expect(normalizeLoadingPath("./semgrep-rules/a.yaml")).toBe("./semgrep-rules/a.yaml");
  });

  it("로딩 쌍의 경로가 윈도우 구분자여도 기대 경로와 같아진다", () => {
    const line = classifyStderrLine(
      "loading local config from semgrep-rules\\typescript\\react\\security\\x.yaml"
    );
    expect(line?.key).toBe("loading");
    if (line?.key === "loading") {
      expect(normalizeLoadingPath(line.params.path)).toBe(
        "semgrep-rules/typescript/react/security/x.yaml"
      );
    }
  });
});
