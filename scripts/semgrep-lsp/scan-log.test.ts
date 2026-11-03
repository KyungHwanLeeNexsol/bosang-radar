import { describe, expect, it } from "vitest";
import { analyzeRulesLog } from "./rules-log";
import { analyzeScanLog, type ScanLogAnalysis, type ScanLogKey } from "./scan-log";
import {
  bytesOf,
  crlf,
  enc,
  externalCommandLine,
  logWorkspacePath,
  scanLay,
  scanStderrParts,
  type ScanStderrParts,
} from "./testing/scan-fixtures";
import { happyStderrLines } from "./testing/rules-fixtures";

const WS = scanLay.workspace;

function analyze(
  parts: ScanStderrParts = scanStderrParts(),
  over: { workspace?: string | null; didOpenOffset?: number | null; lf?: boolean } = {}
): { a: ScanLogAnalysis; bytes: Uint8Array; offset: number } {
  const offset = bytesOf(parts.pre).byteLength;
  const all = [...parts.pre, ...parts.post, ...parts.tail];
  const bytes = over.lf ? enc(all.map((l) => `${l}\n`).join("")) : bytesOf(all);
  const didOpenOffset =
    over.didOpenOffset === undefined
      ? over.lf
        ? enc(parts.pre.map((l) => `${l}\n`).join("")).byteLength
        : offset
      : over.didOpenOffset;
  const a = analyzeScanLog(bytes, {
    workspace: over.workspace === undefined ? WS : over.workspace,
    didOpenOffset,
  });
  return { a, bytes, offset: didOpenOffset ?? offset };
}

const edit = (
  fn: (post: string[]) => string[],
  over: Parameters<typeof analyze>[1] = {}
): ReturnType<typeof analyze> => {
  const parts = scanStderrParts();
  parts.post = fn(parts.post);
  return analyze(parts, over);
};
const preEdit = (
  fn: (pre: string[]) => string[],
  over: Parameters<typeof analyze>[1] = {}
): ReturnType<typeof analyze> => {
  const parts = scanStderrParts();
  parts.pre = fn(parts.pre);
  return analyze(parts, over);
};

const BUNDLE_KEYS: ScanLogKey[] = [
  "scanningSingleFile",
  "scannedSingleFile",
  "scanningTargets",
  "runningRules",
  "foundMatchesBefore",
  "engineErrors",
  "skippedRules",
  "scannedFiles",
  "foundMatches",
];
const LINE_OF: Record<string, string> = {
  scanningSingleFile: "Scanning single file",
  scannedSingleFile: "Scanned single file",
  scanningTargets: "[01.02][INFO]: Scanning 1 targets",
  runningRules: "[01.02][DEBUG](default): Running Semgrep with 1 rules",
  foundMatchesBefore: "[01.20][INFO]: Found 1 matches before processing",
  engineErrors: "Semgrep errors: ",
  skippedRules: "Semgrep skipped 0 rules",
  scannedFiles: "Scanned 1 files",
  foundMatches: "Found 1 matches",
};
const lineIs = (key: string) => (l: string) => l === LINE_OF[key];
const dropKey = (key: string) => (post: string[]) => post.filter((l) => !lineIs(key)(l));
const dupKey = (key: string) => (post: string[]) =>
  post.flatMap((l) => (lineIs(key)(l) ? [l, l] : [l]));
const posts =
  (...extra: string[]) =>
  (post: string[]) => {
    const at = post.indexOf("Found 1 matches");
    return [...post.slice(0, at + 1), ...extra, ...post.slice(at + 1)];
  };

describe("정상 로그: 사전 열기와 사후 열기를 첫 바이트로 나눈다", () => {
  it("묶음이 완성되고 추가 항목이 없으며 외부 명령 시도 2건(사전 1·사후 1)이 D3 모양이다", () => {
    const { a, bytes, offset } = analyze();
    expect(a.didOpenOffset).toBe(offset);
    expect(a.pre.scanEvidence).toEqual([]);
    expect(a.post.bundle.complete).toBe(true);
    expect(a.post.bundle.seenAll).toBe(true);
    expect(a.post.bundle.missing).toEqual([]);
    expect(a.post.bundle.orderViolations).toEqual([]);
    expect(a.post.extras).toEqual([]);
    expect(a.pre.extras).toEqual([]);
    expect(a.externalCommand.preCount).toBe(1);
    expect(a.externalCommand.postCount).toBe(1);
    expect(a.externalCommand.attempts.map((x) => [x.segment, x.window, x.shape])).toEqual([
      ["PRE_OPEN", "BARRIER", "OK"],
      ["POST_OPEN", "SCAN", "OK"],
    ]);
    expect(a.externalCommand.problems).toEqual([]);
    expect(a.post.bundle.numbers).toEqual({
      targets: 1,
      rules: 1,
      matchesBefore: 1,
      skipped: 0,
      scanned: 1,
      matches: 1,
      errorsText: "",
    });
    expect(a.counters.totalBytes).toBe(bytes.byteLength);
    expect(a.counters.malformedHeaders).toBe(0);
    expect(a.openBlockAtEnd).toBe(false);
  });

  it("묶음이 끝난 바이트 위치는 마지막 필수 줄의 줄 끝(LF 다음)이다", () => {
    const parts = scanStderrParts();
    const { a } = analyze(parts);
    const upToFound = [
      ...parts.pre,
      ...parts.post.slice(0, parts.post.indexOf("Found 1 matches") + 1),
    ];
    expect(a.post.bundle.completeEndByte).toBe(bytesOf(upToFound).byteLength);
  });

  it("줄 끝이 LF 뿐이어도 같은 결과다 (바이트 위치만 다르다)", () => {
    const crlfRun = analyze();
    const lfRun = analyze(scanStderrParts(), { lf: true });
    expect(lfRun.a.post.bundle.complete).toBe(true);
    expect(lfRun.a.post.bundle.numbers).toEqual(crlfRun.a.post.bundle.numbers);
    expect(lfRun.a.lines.map((l) => [l.key, l.segment, l.level])).toEqual(
      crlfRun.a.lines.map((l) => [l.key, l.segment, l.level])
    );
    expect(lfRun.a.externalCommand.problems).toEqual([]);
  });

  it("결과는 JSON 로 왕복해도 같다 (골든 대조용 평범한 값)", () => {
    const { a } = analyze();
    expect(JSON.parse(JSON.stringify(a))).toStrictEqual(a);
  });
});

describe("RULES 판독기와의 일치 (장벽 구간)", () => {
  it("RULES 정상 로그에서 같은 키·같은 바이트 위치·같은 모양을 낸다", () => {
    const lines = happyStderrLines(scanLay.rulesDir);
    const bytes = enc(crlf(lines));
    const rules = analyzeRulesLog(bytes);
    const scan = analyzeScanLog(bytes, { workspace: WS, didOpenOffset: null });
    const known = new Set(rules.signals.map((s) => s.key));
    const mine = scan.lines
      .filter((l) => l.key !== null && known.has(l.key as never))
      .map((l) => ({ key: l.key, at: l.startByte, shape: l.shape }));
    const theirs = rules.signals.map((s) => ({ key: s.key, at: s.byteOffset, shape: s.shape }));
    expect(mine).toEqual(theirs);
    for (const k of [
      "lines",
      "records",
      "headedRecords",
      "bareRecords",
      "malformedHeaders",
      "orphanBareLines",
      "embeddedSignalText",
      "unclassifiedInfo",
      "unclassifiedDebug",
      "partialTail",
      "totalBytes",
    ] as const) {
      expect(scan.counters[k], k).toBe(rules.counters[k]);
    }
  });
});

describe("분할: didOpen 의 stderr 바이트 위치, 줄의 첫 바이트가 소속을 정한다", () => {
  it("위치가 줄 시작과 같으면 그 줄은 사후, 위치 바로 앞에서 시작한 줄은 사전이다", () => {
    const parts = scanStderrParts();
    const off = bytesOf(parts.pre).byteLength;
    const first = analyzeScanLog(bytesOf([...parts.pre, ...parts.post]), {
      workspace: WS,
      didOpenOffset: off,
    });
    const scanning = first.lines.find((l) => l.key === "scanningSingleFile");
    expect(scanning?.segment).toBe("POST_OPEN");
    // 위치를 한 줄 뒤로 밀면 'Handling notification' 줄이 사전에 속한다
    const handling = bytesOf(parts.post.slice(0, 1)).byteLength;
    const later = analyzeScanLog(bytesOf([...parts.pre, ...parts.post]), {
      workspace: WS,
      didOpenOffset: off + handling,
    });
    expect(later.lines.find((l) => l.key === "scanningSingleFile")?.segment).toBe("POST_OPEN");
    // 위치가 'Scanning single file' 줄의 한가운데면 그 줄은 첫 바이트가 앞이므로 사전이다 → 사전 증거
    const mid = off + handling + 3;
    const inside = analyzeScanLog(bytesOf([...parts.pre, ...parts.post]), {
      workspace: WS,
      didOpenOffset: mid,
    });
    expect(inside.lines.find((l) => l.key === "scanningSingleFile")?.segment).toBe("PRE_OPEN");
    expect(inside.pre.scanEvidence).toContain("scanningSingleFile");
    // 경계 바이트: 줄 시작보다 1바이트 안쪽이면 사전, 줄 시작과 같거나 1바이트 앞이면 사후
    const start = off + handling;
    const segmentAt = (offset: number): string | undefined =>
      analyzeScanLog(bytesOf([...parts.pre, ...parts.post]), {
        workspace: WS,
        didOpenOffset: offset,
      }).lines.find((l) => l.key === "scanningSingleFile")?.segment;
    expect(segmentAt(start + 1)).toBe("PRE_OPEN");
    expect(segmentAt(start)).toBe("POST_OPEN");
    expect(segmentAt(start - 1)).toBe("POST_OPEN");
  });

  it("didOpen 을 보내지 않았으면(위치 null) 전부 사전이다", () => {
    const { a } = analyze(scanStderrParts(), { didOpenOffset: null });
    expect(a.didOpenOffset).toBeNull();
    expect(a.lines.every((l) => l.segment === "PRE_OPEN")).toBe(true);
    expect(a.post.bundle.seenAll).toBe(false);
    expect(a.pre.scanEvidence.length).toBeGreaterThan(0); // 묶음 줄이 사전에 있으면 증거로 센다
  });

  it("위치가 0이거나 스트림보다 크면 그대로 쓴다 (0 → 전부 사후)", () => {
    const { a } = analyze(scanStderrParts(), { didOpenOffset: 0 });
    expect(a.lines.every((l) => l.segment === "POST_OPEN")).toBe(true);
    const big = analyze(scanStderrParts(), { didOpenOffset: 10_000_000 });
    expect(big.a.lines.every((l) => l.segment === "PRE_OPEN")).toBe(true);
  });
});

describe("사전 열기에 있는 스캔 증거는 쓰지 않는다 (PRE_OPEN_EVIDENCE)", () => {
  const evidenceLines: [string, string][] = [
    ["scanningSingleFile", "Scanning single file"],
    ["scannedSingleFile", "Scanned single file"],
    ["scanningTargets", "[00.90][INFO]: Scanning 1 targets"],
    ["runningRules", "[00.90][DEBUG](default): Running Semgrep with 1 rules"],
    ["foundMatchesBefore", "[00.90][INFO]: Found 1 matches before processing"],
    ["engineErrors", "Semgrep errors: "],
    ["skippedRules", "Semgrep skipped 0 rules"],
    ["scannedFiles", "Scanned 1 files"],
    ["foundMatches", "Found 1 matches"],
    [
      "fileNotInTargets",
      "[00.90][DEBUG](default): File c:\\x\\ws\\a.txt is not in the session targets recalculating targets just in case",
    ],
  ];
  for (const [key, line] of evidenceLines) {
    it(`${key} 가 사전 구간에 있으면 증거로 센다`, () => {
      const { a } = preEdit((pre) => {
        const at = pre.indexOf("Scanned open documents");
        return [...pre.slice(0, at + 1), line, ...pre.slice(at + 1)];
      });
      expect(a.pre.scanEvidence).toEqual([key]);
      // 사후 묶음은 따로 완성돼 있어도 사전 증거는 사후 증거로 합쳐지지 않는다
      expect(a.post.bundle.complete).toBe(true);
    });
  }

  it("사전 구간의 허용되는 줄(장벽 줄, 외부 명령 1건, No targets 경고 1건)은 증거가 아니다", () => {
    const { a } = analyze();
    expect(a.pre.scanEvidence).toEqual([]);
    expect(a.pre.counts.noTargets).toEqual({ ok: 1, mismatch: 0 });
    expect(a.pre.counts.scannedOpenDocuments).toEqual({ ok: 1, mismatch: 0 });
  });
});

describe("사후 묶음: 필수 줄은 정확한 문구로 각각 한 번, 스트림 안의 순서대로", () => {
  for (const key of BUNDLE_KEYS) {
    it(`${key} 가 없으면 묶음이 완성되지 않는다`, () => {
      const { a } = edit(dropKey(key));
      expect(a.post.bundle.complete).toBe(false);
      expect(a.post.bundle.seenAll).toBe(false);
      expect(a.post.bundle.missing).toEqual([key]);
      expect(a.post.bundle.completeEndByte).toBeNull();
    });
    it(`${key} 가 두 번이면 묶음이 완성되지 않고 추가 항목으로 센다`, () => {
      const { a } = edit(dupKey(key));
      expect(a.post.bundle.complete).toBe(false);
      expect(a.post.bundle.seenAll).toBe(true);
      expect(a.post.bundle.completeEndByte).not.toBeNull();
      expect(a.post.extras.map((e) => [e.kind, e.key])).toEqual([["DUPLICATE_LINE", key]]);
    });
  }

  it("순서가 어긋나면(인접한 둘을 바꾸면) 어긋남을 이름으로 알려 준다", () => {
    const order: ScanLogKey[] = [
      "scanningSingleFile",
      "scanningTargets",
      "runningRules",
      "foundMatchesBefore",
      "engineErrors",
      "skippedRules",
      "scannedFiles",
      "foundMatches",
    ];
    for (let i = 0; i + 1 < order.length; i += 1) {
      const a = LINE_OF[order[i]];
      const b = LINE_OF[order[i + 1]];
      const { a: out } = edit((post) => post.map((l) => (l === a ? b : l === b ? a : l)));
      expect(out.post.bundle.complete, `${order[i]}<->${order[i + 1]}`).toBe(false);
      expect(
        out.post.bundle.orderViolations.length,
        `${order[i]}<->${order[i + 1]}`
      ).toBeGreaterThan(0);
      expect(out.post.bundle.orderViolations.join("|")).toContain(order[i]);
      expect(out.post.bundle.seenAll).toBe(true);
    }
  });

  it("Scanned single file 은 Scanning single file 뒤 어디에 있어도 된다 (앞·중간·묶음 끝 뒤)", () => {
    for (const where of ["afterStart", "beforeTargets", "afterFound", "afterMatches"]) {
      const { a } = edit((post) => {
        const rest = post.filter((l) => l !== "Scanned single file");
        const idx = {
          afterStart: rest.indexOf("Scanning single file") + 1,
          beforeTargets: rest.indexOf("[01.02][INFO]: Scanning 1 targets"),
          afterFound: rest.indexOf("Found 1 matches") + 1,
          afterMatches: rest.length,
        }[where] as number;
        return [...rest.slice(0, idx), "Scanned single file", ...rest.slice(idx)];
      });
      expect(a.post.bundle.complete, where).toBe(true);
      expect(a.post.bundle.orderViolations, where).toEqual([]);
      // 완료 위치는 마지막 필수 줄(여기서는 가장 늦은 줄)의 끝이다
      expect(a.post.bundle.completeEndByte).not.toBeNull();
    }
  });

  it("Scanned single file 이 Scanning single file 보다 앞서면 순서 위반이다", () => {
    const { a } = edit((post) => {
      const rest = post.filter((l) => l !== "Scanned single file");
      const at = rest.indexOf("Scanning single file");
      return [...rest.slice(0, at), "Scanned single file", ...rest.slice(at)];
    });
    expect(a.post.bundle.complete).toBe(false);
    expect(a.post.bundle.orderViolations.join("|")).toContain("scannedSingleFile");
  });

  it("완료 위치는 Scanned single file 이 가장 늦으면 그 줄의 끝이다", () => {
    const parts = scanStderrParts();
    parts.post = parts.post.filter((l) => l !== "Scanned single file");
    parts.post.splice(parts.post.indexOf("Found 1 matches") + 1, 0, "Scanned single file");
    const { a } = analyze(parts);
    const upto = [
      ...parts.pre,
      ...parts.post.slice(0, parts.post.indexOf("Scanned single file") + 1),
    ];
    expect(a.post.bundle.completeEndByte).toBe(bytesOf(upto).byteLength);
  });

  it("줄 모양이 틀리면(맨줄이어야 할 줄에 머리말 등) 인식은 하되 모양 불일치로 센다", () => {
    const cases: [string, string, string][] = [
      ["scanningSingleFile", "Scanning single file", "[01.01][INFO]: Scanning single file"],
      ["scanningTargets", "[01.02][INFO]: Scanning 1 targets", "Scanning 1 targets"],
      [
        "runningRules",
        "[01.02][DEBUG](default): Running Semgrep with 1 rules",
        "[01.02][INFO]: Running Semgrep with 1 rules",
      ],
      [
        "foundMatchesBefore",
        "[01.20][INFO]: Found 1 matches before processing",
        "Found 1 matches before processing",
      ],
      ["engineErrors", "Semgrep errors: ", "[01.20][INFO]: Semgrep errors: "],
      ["skippedRules", "Semgrep skipped 0 rules", "[01.20][INFO]: Semgrep skipped 0 rules"],
      ["scannedFiles", "Scanned 1 files", "[01.20][INFO]: Scanned 1 files"],
      ["foundMatches", "Found 1 matches", "[01.20][INFO]: Found 1 matches"],
      ["scannedSingleFile", "Scanned single file", "[01.01][INFO]: Scanned single file"],
    ];
    for (const [key, good, bad] of cases) {
      const { a } = edit((post) => post.map((l) => (l === good ? bad : l)));
      expect(a.post.bundle.complete, key).toBe(false);
      expect(a.post.bundle.missing, key).toEqual([key]);
      expect(a.post.counts[key], key).toEqual({ ok: 0, mismatch: 1 });
      expect(a.post.shapeMismatch, key).toEqual([key]);
    }
  });

  it("문구가 한 글자라도 다르면 인식하지 않는다 (정확한 문구)", () => {
    const variants: [string, string][] = [
      ["scanningTargets", "[01.02][INFO]: Scanning 1 target"],
      ["scanningTargets", "[01.02][INFO]: Scanning 1 targets."],
      ["scanningTargets", "[01.02][INFO]: scanning 1 targets"],
      ["scanningTargets", "[01.02][INFO]: Scanning 01 targets"],
      ["runningRules", "[01.02][DEBUG](default): Running Semgrep with 1 rule"],
      ["foundMatchesBefore", "[01.20][INFO]: Found 1 matches before processing."],
      ["foundMatchesBefore", "[01.20][INFO]: Found 1 match before processing"],
      ["skippedRules", "Semgrep skipped 0 rule"],
      ["scannedFiles", "Scanned 1 file"],
      ["foundMatches", "Found 1 match"],
      ["scannedSingleFile", "Scanned single files"],
      ["scanningSingleFile", "Scanning single files"],
    ];
    for (const [key, text] of variants) {
      const { a } = edit((post) => post.map((l) => (l === LINE_OF[key] ? text : l)));
      expect(a.post.bundle.complete, text).toBe(false);
      expect(a.post.bundle.missing, text).toContain(key);
    }
  });

  it("숫자를 읽는다: 대상·규칙·매치·건너뜀·스캔 파일 수", () => {
    const { a } = edit((post) =>
      post.map((l) =>
        l === LINE_OF.scanningTargets
          ? "[01.02][INFO]: Scanning 3 targets"
          : l === LINE_OF.runningRules
            ? "[01.02][DEBUG](default): Running Semgrep with 2 rules"
            : l === LINE_OF.foundMatchesBefore
              ? "[01.20][INFO]: Found 0 matches before processing"
              : l === LINE_OF.skippedRules
                ? "Semgrep skipped 1 rules"
                : l === LINE_OF.scannedFiles
                  ? "Scanned 4 files"
                  : l === LINE_OF.foundMatches
                    ? "Found 0 matches"
                    : l
      )
    );
    expect(a.post.bundle.complete).toBe(true); // 줄은 갖춰졌다 — 숫자 판단은 판정 모듈의 몫
    expect(a.post.bundle.numbers).toEqual({
      targets: 3,
      rules: 2,
      matchesBefore: 0,
      skipped: 1,
      scanned: 4,
      matches: 0,
      errorsText: "",
    });
  });

  it("개행으로 끝나지 않은 마지막 줄은 묶음에 세지 않는다 (줄이 다 오지 않았다)", () => {
    const parts = scanStderrParts();
    const text =
      crlf([...parts.pre, ...parts.post.slice(0, parts.post.indexOf("Found 1 matches"))]) +
      "Found 1 matches";
    const a = analyzeScanLog(enc(text), {
      workspace: WS,
      didOpenOffset: bytesOf(parts.pre).byteLength,
    });
    expect(a.post.bundle.complete).toBe(false);
    expect(a.post.bundle.missing).toEqual(["foundMatches"]);
    expect(a.counters.partialTail).toBe(true);
    const done = analyzeScanLog(enc(`${text}\n`), {
      workspace: WS,
      didOpenOffset: bytesOf(parts.pre).byteLength,
    });
    expect(done.post.bundle.complete).toBe(true);
    expect(done.counters.partialTail).toBe(false);
  });
});

describe("Semgrep errors: 줄", () => {
  it("뒤 공백 유무와 상관없이 비어 있으면 빈 오류로 읽는다", () => {
    for (const text of ["Semgrep errors: ", "Semgrep errors:"]) {
      const { a } = edit((post) => post.map((l) => (l === "Semgrep errors: " ? text : l)));
      expect(a.post.bundle.complete).toBe(true);
      expect(a.post.bundle.numbers.errorsText).toBe("");
      expect(a.post.extras).toEqual([]);
    }
  });

  it("내용이 있으면 추가 항목(ENGINE_ERRORS_NONEMPTY)이다 — 같은 줄의 내용, 다음 줄로 이어진 내용 모두", () => {
    const sameLine = edit((post) =>
      post.map((l) => (l === "Semgrep errors: " ? "Semgrep errors: boom" : l))
    );
    expect(sameLine.a.post.bundle.numbers.errorsText).toBe("boom");
    expect(sameLine.a.post.extras.map((e) => e.kind)).toContain("ENGINE_ERRORS_NONEMPTY");
    const next = edit((post) =>
      post.flatMap((l) => (l === "Semgrep errors: " ? [l, "first line of the error"] : [l]))
    );
    expect(next.a.post.extras.map((e) => e.kind)).toContain("ENGINE_ERRORS_NONEMPTY");
    expect(next.a.post.bundle.complete).toBe(true);
  });
});

describe("건너뛴 규칙과 오류", () => {
  it("Semgrep skipped N rules (N ≥ 1) 은 추가 항목이다", () => {
    const { a } = edit((post) =>
      post.map((l) => (l === "Semgrep skipped 0 rules" ? "Semgrep skipped 2 rules" : l))
    );
    expect(a.post.extras.map((e) => e.kind)).toEqual(["SKIPPED_RULES_NONZERO"]);
    expect(a.post.bundle.numbers.skipped).toBe(2);
  });
});

describe("사후 추가 항목 (다른 스캔·금지 신호·오류)", () => {
  const kindsOf = (a: ScanLogAnalysis): string[] => a.post.extras.map((e) => e.kind);
  const cases: [string, string[], string][] = [
    ["두 번째 단일 파일 스캔 시작", ["Scanning single file"], "DUPLICATE_LINE"],
    ["작업 영역 스캔", ["Scanning workspace"], "WORKSPACE_SCAN"],
    ["작업 영역 스캔 끝", ["Scanned workspace"], "WORKSPACE_SCAN"],
    ["전체 스캔", ["Scanning workspace, full: true"], "WORKSPACE_SCAN"],
    ["작업 영역 스캔 완료", ["Scanning workspace complete"], "WORKSPACE_SCAN"],
    ["두 번째 열린 문서 스캔", ["Scanning open documents"], "OPEN_DOCUMENTS_SCAN"],
    ["열린 문서 스캔 끝", ["Scanned open documents"], "OPEN_DOCUMENTS_SCAN"],
    ["규칙 새로고침", ["Refreshing rules"], "RULES_REFRESH"],
    ["규칙 새로고침 끝", ["Rules refreshed"], "RULES_REFRESH"],
    [
      "대상 0개 경고",
      ["[01.30][WARNING]: No targets to scan! Not scanning anything."],
      "NO_TARGETS",
    ],
    ["규칙 0개 경고", ["[01.30][WARNING]: No rules to run! Not scanning anything."], "NO_RULES"],
    [
      "규칙이 아직 로딩되지 않음",
      ["Rules not loaded yet, not scanning anything."],
      "RULES_NOT_LOADED",
    ],
    ["ERROR 머리말", ["[01.30][ERROR]: boom"], "ERROR_RECORD"],
    ["예기치 않은 경고", ["[01.30][WARNING]: something odd"], "UNEXPECTED_WARNING"],
    ["건너뛴 규칙 줄", ["[01.30][INFO]: skipping rule a.b, error = bad"], "SKIPPING_RULE"],
    ["내려받기 신호", ["[01.30][INFO]: trying to download from https://x"], "FORBIDDEN_NETWORK"],
    [
      "레지스트리 신호",
      ["[01.30][INFO]: No rules source specified, using auto"],
      "FORBIDDEN_NETWORK",
    ],
    ["토큰 사용", ["[01.30][INFO]: Found API token in env"], "FORBIDDEN_NETWORK"],
    ["설정 파일 사용", ["[01.30][INFO]: Settings file found at x"], "FORBIDDEN_NETWORK"],
    [
      "외부 명령 오류 출력",
      ["[01.30][INFO]: error output: fatal: not a git repository"],
      "ERROR_OUTPUT",
    ],
    [
      "대상이 아니라는 로그",
      [
        "[01.30][DEBUG](default): File c:\\x\\ws\\a.txt is not in the session targets recalculating targets just in case",
      ],
      "FILE_NOT_IN_TARGETS",
    ],
  ];
  for (const [name, extra, kind] of cases) {
    it(`${name} → ${kind}`, () => {
      const { a } = edit(posts(...extra));
      expect(kindsOf(a), name).toContain(kind);
      expect(a.post.extras.every((e) => e.segment === "POST_OPEN")).toBe(true);
    });
  }

  it("로그 블록 안(덤프)에 있는 신호 문구는 신호가 아니다", () => {
    const { a } = edit((post) => [
      ...post,
      "[01.40][DEBUG](default): Sending notification {",
      "Scanning single file",
      "Scanning workspace",
      "Found 1 matches",
      "}",
    ]);
    expect(a.post.extras).toEqual([]);
    expect(a.counters.embeddedSignalText).toBe(3);
    expect(a.post.counts.scanningSingleFile).toEqual({ ok: 1, mismatch: 0 });
  });

  it("끝까지 닫히지 않은 블록이 삼킨 줄은 묶음을 가린다: 열린 블록으로 알린다", () => {
    const parts = scanStderrParts();
    parts.tail = [];
    parts.post = [
      ...parts.post.slice(0, parts.post.indexOf("Scanned 1 files")),
      "[01.20][DEBUG](default): Dump {",
      "Scanned 1 files",
      "Found 1 matches",
    ];
    const { a } = analyze(parts);
    expect(a.openBlockAtEnd).toBe(true);
    expect(a.post.bundle.complete).toBe(false);
    expect(a.post.bundle.missing).toEqual(["scannedFiles", "foundMatches"]);
    expect(a.openBlockEmbeddedKeys).toEqual(["scannedFiles", "foundMatches"]);
  });

  it("사전 구간의 금지·오류 항목도 구간 표시와 함께 알린다", () => {
    const { a } = preEdit((pre) => {
      const at = pre.indexOf("Rules refreshed");
      return [
        ...pre.slice(0, at),
        "[00.90][INFO]: trying to download from https://x",
        "[00.90][ERROR]: boom",
        ...pre.slice(at),
      ];
    });
    expect(a.pre.extras.map((e) => [e.segment, e.kind])).toEqual([
      ["PRE_OPEN", "FORBIDDEN_NETWORK"],
      ["PRE_OPEN", "ERROR_RECORD"],
    ]);
  });
});

describe("외부 명령 시도 (D3: 정확한 모양, 사전 1건 + 사후 1건)", () => {
  const SHAPES: [string, string, string][] = [
    [
      "명령이 다르다",
      `[00.83][INFO]: Running external command: "curl" "-C" "${logWorkspacePath()}" "rev-parse" "--show-toplevel"`,
      "BAD_COMMAND",
    ],
    [
      "명령 대소문자가 다르다",
      `[00.83][INFO]: Running external command: "Git" "-C" "${logWorkspacePath()}" "rev-parse" "--show-toplevel"`,
      "BAD_COMMAND",
    ],
    [
      "git.exe 이름",
      `[00.83][INFO]: Running external command: "git.exe" "-C" "${logWorkspacePath()}" "rev-parse" "--show-toplevel"`,
      "BAD_COMMAND",
    ],
    [
      "첫 인자가 다르다",
      `[00.83][INFO]: Running external command: "git" "--git-dir" "${logWorkspacePath()}" "rev-parse" "--show-toplevel"`,
      "BAD_ARGS",
    ],
    [
      "셋째 인자가 다르다",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath()}" "status" "--show-toplevel"`,
      "BAD_ARGS",
    ],
    [
      "넷째 인자가 다르다",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath()}" "rev-parse" "--git-dir"`,
      "BAD_ARGS",
    ],
    [
      "작업 영역이 아닌 경로",
      `[00.83][INFO]: Running external command: "git" "-C" "c:\\other\\ws" "rev-parse" "--show-toplevel"`,
      "BAD_WORKSPACE",
    ],
    [
      "경로 접두만 같다 (하위 폴더)",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath()}\\sub" "rev-parse" "--show-toplevel"`,
      "BAD_WORKSPACE",
    ],
    [
      "경로가 더 짧다 (접두)",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath().slice(0, -3)}" "rev-parse" "--show-toplevel"`,
      "BAD_WORKSPACE",
    ],
    [
      "끝 구분자가 붙었다",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath()}\\" "rev-parse" "--show-toplevel"`,
      "BAD_WORKSPACE",
    ],
    [
      "슬래시 구분자 경로",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath().replace(/\\/g, "/")}" "rev-parse" "--show-toplevel"`,
      "BAD_WORKSPACE",
    ],
    [
      "드라이브가 아닌 조각의 대소문자가 다르다",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath().replace("work", "WORK")}" "rev-parse" "--show-toplevel"`,
      "BAD_WORKSPACE",
    ],
    [
      "빈 경로",
      `[00.83][INFO]: Running external command: "git" "-C" "" "rev-parse" "--show-toplevel"`,
      "BAD_WORKSPACE",
    ],
    [
      "인자가 하나 모자란다",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath()}" "rev-parse"`,
      "BAD_TOKENS",
    ],
    [
      "인자가 하나 많다",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath()}" "rev-parse" "--show-toplevel" "--extra"`,
      "BAD_TOKENS",
    ],
    [
      "따옴표 없는 인자",
      `[00.83][INFO]: Running external command: git -C ${logWorkspacePath()} rev-parse --show-toplevel`,
      "BAD_TOKENS",
    ],
    [
      "뒤에 글자가 붙었다",
      `[00.83][INFO]: Running external command: "git" "-C" "${logWorkspacePath()}" "rev-parse" "--show-toplevel" x`,
      "BAD_TOKENS",
    ],
    ["내용 없음", "[00.83][INFO]: Running external command:", "BAD_TOKENS"],
    [
      "DEBUG 머리말",
      `[00.83][DEBUG](default): Running external command: "git" "-C" "${logWorkspacePath()}" "rev-parse" "--show-toplevel"`,
      "BAD_LEVEL",
    ],
    [
      "머리말 없는 맨줄",
      `Running external command: "git" "-C" "${logWorkspacePath()}" "rev-parse" "--show-toplevel"`,
      "BAD_LEVEL",
    ],
  ];
  const toLine = (line: string) => (pre: string[]) =>
    pre.map((l) => (l.includes("Running external command") ? line : l));

  for (const [name, line, shape] of SHAPES) {
    it(`사전 구간: ${name} → ${shape} / EXTERNAL_COMMAND_SHAPE`, () => {
      const { a } = preEdit(toLine(line));
      expect(a.externalCommand.attempts[0].shape, name).toBe(shape);
      expect(a.externalCommand.shapeOk).toBe(false);
      expect(a.externalCommand.problems).toContain("EXTERNAL_COMMAND_SHAPE");
    });
    it(`사후 구간: ${name} → ${shape} / EXTERNAL_COMMAND_SHAPE`, () => {
      const { a } = edit((post) =>
        post.map((l) => (l.includes("Running external command") ? line : l))
      );
      const post = a.externalCommand.attempts.find((x) => x.segment === "POST_OPEN");
      expect(post?.shape, name).toBe(shape);
      expect(a.externalCommand.problems).toContain("EXTERNAL_COMMAND_SHAPE");
    });
  }

  it("드라이브 문자의 대소문자는 무시하고 나머지는 서수 비교다 (설정 경로가 역슬래시여도 같다)", () => {
    const winWs = "C:\\work\\scan-1\\ws";
    for (const configured of [
      "C:/work/scan-1/ws",
      "c:/work/scan-1/ws",
      winWs,
      "c:\\work\\scan-1\\ws",
    ]) {
      const { a } = analyze(scanStderrParts(), { workspace: configured });
      expect(a.externalCommand.shapeOk, configured).toBe(true);
    }
    // 로그 쪽 드라이브 대문자도 같은 파일이다
    const upper = (pre: string[]) =>
      pre.map((l) => (l.includes("Running external command") ? l.replace('"c:\\', '"C:\\') : l));
    expect(preEdit(upper).a.externalCommand.shapeOk).toBe(true);
  });

  it("작업 영역이 주어지지 않으면(null) 경로를 확인할 수 없으므로 모양 불일치다", () => {
    const { a } = analyze(scanStderrParts(), { workspace: null });
    expect(a.externalCommand.shapeOk).toBe(false);
    expect(a.externalCommand.attempts.every((x) => x.shape === "BAD_WORKSPACE")).toBe(true);
  });

  it("건수·구간: 사전 구간의 둘째 시도, 사후 구간의 둘째 시도(세 번째 시도)는 EXTERNAL_COMMAND_COUNT 다", () => {
    const secondPre = preEdit((pre) =>
      pre.flatMap((l) => (l.includes("Running external command") ? [l, l] : [l]))
    );
    expect(secondPre.a.externalCommand.preCount).toBe(2);
    expect(secondPre.a.externalCommand.problems).toContain("EXTERNAL_COMMAND_COUNT");
    const secondPost = edit((post) =>
      post.flatMap((l) => (l.includes("Running external command") ? [l, l] : [l]))
    );
    expect(secondPost.a.externalCommand.postCount).toBe(2);
    expect(secondPost.a.externalCommand.problems).toContain("EXTERNAL_COMMAND_COUNT");
    // 모양은 둘 다 맞다: 건수만 어긋난 것이다
    expect(secondPost.a.externalCommand.shapeOk).toBe(true);
  });

  it("잘못된 구간의 시도: 사전에는 열린 문서 스캔 구간 밖, 사후에는 Scanning single file 앞이나 Scanning N targets 뒤", () => {
    const cmd = externalCommandLine(WS, "00.50");
    const beforeScanning = preEdit((pre) => {
      const rest = pre.filter((l) => !l.includes("Running external command"));
      const at = rest.indexOf("Scanning open documents");
      return [...rest.slice(0, at), cmd, ...rest.slice(at)];
    });
    expect(beforeScanning.a.externalCommand.attempts[0].window).toBe("OTHER");
    expect(beforeScanning.a.externalCommand.problems).toContain("EXTERNAL_COMMAND_COUNT");
    const afterScanned = preEdit((pre) => {
      const rest = pre.filter((l) => !l.includes("Running external command"));
      const at = rest.indexOf("Scanned open documents");
      return [...rest.slice(0, at + 1), cmd, ...rest.slice(at + 1)];
    });
    expect(afterScanned.a.externalCommand.attempts[0].window).toBe("OTHER");
    expect(afterScanned.a.externalCommand.problems).toContain("EXTERNAL_COMMAND_COUNT");
    const lateInScan = edit((post) => {
      const rest = post.filter((l) => !l.includes("Running external command"));
      const at = rest.indexOf("[01.02][INFO]: Scanning 1 targets");
      return [...rest.slice(0, at + 1), externalCommandLine(WS, "01.03"), ...rest.slice(at + 1)];
    });
    expect(
      lateInScan.a.externalCommand.attempts.find((x) => x.segment === "POST_OPEN")?.window
    ).toBe("OTHER");
    expect(lateInScan.a.externalCommand.problems).toContain("EXTERNAL_COMMAND_COUNT");
    const beforeStart = edit((post) => {
      const rest = post.filter((l) => !l.includes("Running external command"));
      const at = rest.indexOf("Scanning single file");
      return [...rest.slice(0, at), externalCommandLine(WS, "01.00"), ...rest.slice(at)];
    });
    expect(
      beforeStart.a.externalCommand.attempts.find((x) => x.segment === "POST_OPEN")?.window
    ).toBe("OTHER");
    expect(beforeStart.a.externalCommand.problems).toContain("EXTERNAL_COMMAND_COUNT");
  });

  it("부분 문자열 흉내: 문장 중간의 'Running external command' 는 시도 줄이 아니다 (느슨한 포함 검사 없음)", () => {
    const look = `[00.83][INFO]: note: Running external command: "git" "-C" "${logWorkspacePath()}" "rev-parse" "--show-toplevel"`;
    const { a } = edit((post) => [...post.slice(0, 2), look, ...post.slice(2)]);
    expect(a.externalCommand.postCount).toBe(1);
    expect(a.externalCommand.problems).toEqual([]);
    const dump = edit((post) => [
      "[01.00][DEBUG](default): Dump {",
      `  "x": "Running external command: \\"git\\" \\"-C\\" \\"x\\" \\"rev-parse\\" \\"--show-toplevel\\""`,
      `Running external command: "git" "-C" "x" "rev-parse" "--show-toplevel"`,
      "}",
      ...post.slice(1),
    ]);
    expect(dump.a.externalCommand.postCount).toBe(1);
    expect(dump.a.externalCommand.problems).toEqual([]);
  });

  it("시도 줄이 하나도 없어도 이 모듈은 건수 부족을 문제로 올리지 않는다 (부족 판단은 판정 모듈의 몫이다)", () => {
    const none = edit((post) => post.filter((l) => !l.includes("Running external command")));
    expect(none.a.externalCommand.postCount).toBe(0);
    expect(none.a.externalCommand.problems).toEqual([]);
  });
});
