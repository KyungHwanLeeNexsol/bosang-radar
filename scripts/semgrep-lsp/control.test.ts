import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NEGATIVE_CONTROL_TABLE,
  defaultNegativeControls,
  evaluateControlAssertions,
  hasCaseChecks,
  markPreflightNegativeControls,
  summarizeControlAssertions,
  type ControlObserved,
} from "./control";
import { compareRulesTree } from "./rules-manifest";
import { buildInitializationOptions, validateInitializationOptions } from "./settings";
import { gitBlobSha1 } from "./sha";
import type { Reason } from "./status";
import { MemoryFs } from "./testing/memory-fs";
import type { ControlCase, ControlExpectations, RuleFileEntry } from "./types";

function dataText(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./data/${name}`, import.meta.url)), "utf8");
}
const expectations = JSON.parse(dataText("control-expectations.json")) as ControlExpectations;

function caseOf(path: string): ControlCase {
  const found = expectations.cases.find((c) => c.path === path);
  if (!found) throw new Error(`no case ${path}`);
  return found;
}

const EVAL_POS = "cases/eval.pos.js";
const EVAL_OK = "cases/eval.ok.js";
const EVAL_NOSRC = "cases/eval.nosource.js";
const CP_POS = "cases/child-process.pos.ts";
const CP_OK = "cases/child-process.ok.ts";
const IH_POS = "cases/innerhtml.pos.js";
const IH_OK = "cases/innerhtml.ok.js";
const DG_POS = "cases/dangerously.pos.tsx";
const DG_OK = "cases/dangerously.ok.tsx";

/** 의도한 대로 탐지된 세계: 양성은 필수 ID만, 정상은 0건. */
function detected(total: number | null = 9): ControlObserved {
  const cases: Record<string, string[]> = {};
  for (const c of expectations.cases) cases[c.path] = c.kind === "normal" ? [] : [...c.required];
  return { cases, wholeBundleTotal: total };
}

function withCase(base: ControlObserved, path: string, codes: string[]): ControlObserved {
  return { ...base, cases: { ...base.cases, [path]: codes } };
}

function without(base: ControlObserved, path: string): ControlObserved {
  const cases = { ...base.cases };
  delete cases[path];
  return { ...base, cases };
}

function run(observed: ControlObserved) {
  return evaluateControlAssertions(expectations, observed, { applicable: true });
}

function check(result: ReturnType<typeof run>, kind: string, file: string | null) {
  return result.checks.find((c) => c.kind === kind && c.file === file);
}

describe("evaluateControlAssertions: 기본 경로", () => {
  it("의도적 취약 예제를 필수대로 탐지하고 정상은 0건이면 PASS", () => {
    const result = run(detected());
    expect(result.applicable).toBe(true);
    expect(result.status).toBe("PASS");
    expect(result.design_errors).toEqual([]);
    expect(result.checks.every((c) => c.status === "PASS")).toBe(true);
  });

  it("핵심 구분: 취약 예제를 탐지한 control 실행은 진단 합계가 양수여도 PASS다", () => {
    const result = run(detected(5000));
    expect(result.status).toBe("PASS");
    // 같은 탐지 결과는 합계 값과 무관하게 같은 판정이다(합계 == 0 같은 기준을 읽지 않는다).
    expect(run(detected(null)).status).toBe("PASS");
    expect(run(detected(5000))).toEqual(run(detected(null)));
  });

  it("합계가 0이라고 PASS가 되지 않는다: 필수 탐지가 없으면 FAIL", () => {
    const cases: Record<string, string[]> = {};
    for (const c of expectations.cases) cases[c.path] = [];
    const result = run({ cases, wholeBundleTotal: 0 });
    expect(result.status).toBe("FAIL");
    expect(check(result, "A1", EVAL_POS)?.status).toBe("FAIL");
  });

  it("검사 종류를 모두 만든다(A1·A2·A3·A4·PAIR)", () => {
    const kinds = new Set(run(detected()).checks.map((c) => c.kind));
    expect([...kinds].sort()).toEqual(["A1", "A2", "A3", "A4", "PAIR"]);
  });

  it("검사 순서는 결정적이다", () => {
    expect(JSON.stringify(run(detected()))).toBe(JSON.stringify(run(detected())));
  });
});

describe("A1: 양성의 필수 탐지", () => {
  it("필수 ID가 빠지면 FAIL(전체 FAIL)이고 쌍도 FAIL", () => {
    const result = run(withCase(detected(), EVAL_POS, []));
    expect(check(result, "A1", EVAL_POS)?.status).toBe("FAIL");
    expect(check(result, "PAIR", EVAL_POS)?.status).toBe("FAIL");
    expect(result.status).toBe("FAIL");
  });

  it("detail은 빠진 ID를 이름으로 보여준다", () => {
    const result = run(withCase(detected(), CP_POS, []));
    expect(check(result, "A1", CP_POS)?.detail).toContain(
      "semgrep-rules.javascript.lang.security.detect-child-process"
    );
  });
});

describe("A2: 허용 밖의 ID는 검토 대상이다", () => {
  it("허용 목록의 ID는 통과한다(eval.pos의 eval-detected 겹침)", () => {
    const result = run(
      withCase(detected(), EVAL_POS, [
        ...caseOf(EVAL_POS).required,
        "semgrep-rules.javascript.browser.security.eval-detected",
      ])
    );
    expect(result.status).toBe("PASS");
    expect(check(result, "A2", EVAL_POS)?.status).toBe("PASS");
  });

  it("필수·허용 밖의 ID는 REVIEW이고 자동 FAIL이 아니다 → REVIEW_REQUIRED", () => {
    const result = run(
      withCase(detected(), IH_POS, [
        ...caseOf(IH_POS).required,
        "semgrep-rules.javascript.x.other-rule",
      ])
    );
    expect(check(result, "A2", IH_POS)?.status).toBe("REVIEW");
    expect(check(result, "A1", IH_POS)?.status).toBe("PASS");
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("FAIL이 REVIEW보다 우선한다", () => {
    const observed = withCase(
      withCase(detected(), IH_POS, [
        ...caseOf(IH_POS).required,
        "semgrep-rules.javascript.x.other",
      ]),
      CP_POS,
      []
    );
    expect(run(observed).status).toBe("FAIL");
  });
});

describe("A3: 정상 파일은 게시된 code가 0건이어야 한다", () => {
  it("정상 파일에 code가 있으면 FAIL, design_errors에 기록하고 정상 기준으로 채택하지 않는다", () => {
    const result = run(withCase(detected(), CP_OK, ["semgrep-rules.javascript.x.noise"]));
    expect(check(result, "A3", CP_OK)?.status).toBe("FAIL");
    expect(result.design_errors).toHaveLength(1);
    expect(result.design_errors[0]).toContain(CP_OK);
    expect(result.status).toBe("FAIL");
  });

  it("쌍: 정상이 실패하면 양성이 통과해도 PAIR FAIL", () => {
    const result = run(withCase(detected(), IH_OK, ["semgrep-rules.javascript.x.noise"]));
    expect(check(result, "A1", IH_POS)?.status).toBe("PASS");
    expect(check(result, "PAIR", IH_POS)?.status).toBe("FAIL");
  });

  it("쌍: 양성이 실패하면 정상이 0건이어도 PAIR FAIL(0건은 탐지 여부를 말하지 않는다)", () => {
    const result = run(withCase(detected(), DG_POS, []));
    expect(check(result, "A3", DG_OK)?.status).toBe("PASS");
    expect(check(result, "PAIR", DG_POS)?.status).toBe("FAIL");
  });
});

describe("A4: 금지 ID", () => {
  it("금지 ID가 있으면 FAIL", () => {
    const result = run(
      withCase(detected(), CP_POS, [
        ...caseOf(CP_POS).required,
        "semgrep-rules.javascript.aws-lambda.security.detect-child-process",
      ])
    );
    expect(check(result, "A4", CP_POS)?.status).toBe("FAIL");
    expect(result.status).toBe("FAIL");
  });

  it("금지 ID는 A2의 허용 밖 목록에 이중으로 세지 않는다", () => {
    const result = run(
      withCase(detected(), CP_POS, [
        ...caseOf(CP_POS).required,
        "semgrep-rules.javascript.aws-lambda.security.detect-child-process",
      ])
    );
    expect(check(result, "A2", CP_POS)?.status).toBe("PASS");
  });
});

describe("eval.nosource: 대상 규칙의 미탐과 전체 묶음 0건은 다른 단언이다", () => {
  it("eval-detected가 잡고 detect-eval-with-expression이 없으면 PASS", () => {
    const result = run(detected());
    expect(check(result, "A1", EVAL_NOSRC)?.status).toBe("PASS");
    expect(check(result, "A4", EVAL_NOSRC)?.status).toBe("PASS");
  });

  it("이 파일에서 진단이 0건이면 오히려 FAIL이다(A1)", () => {
    const result = run(withCase(detected(), EVAL_NOSRC, []));
    expect(check(result, "A1", EVAL_NOSRC)?.status).toBe("FAIL");
    expect(result.status).toBe("FAIL");
  });

  it("금지된 detect-eval-with-expression이 잡히면 FAIL(A4)", () => {
    const result = run(
      withCase(detected(), EVAL_NOSRC, [
        ...caseOf(EVAL_NOSRC).required,
        "semgrep-rules.javascript.lang.security.detect-eval-with-expression",
      ])
    );
    expect(check(result, "A4", EVAL_NOSRC)?.status).toBe("FAIL");
    expect(result.status).toBe("FAIL");
  });

  it("nosource에는 짝이 없어 PAIR 검사가 없다", () => {
    expect(check(run(detected()), "PAIR", EVAL_NOSRC)).toBeUndefined();
  });
});

describe("결과가 없는 사례는 PASS가 될 수 없다", () => {
  it("전혀 결과가 없으면 NOT_RUN", () => {
    const result = run({ cases: {}, wholeBundleTotal: null });
    expect(result.status).toBe("NOT_RUN");
    expect(result.checks.every((c) => c.status === "NOT_RUN")).toBe(true);
  });

  it("일부만 없으면 FAIL(불완전한 대조는 참조가 될 수 없다)", () => {
    const result = run(without(detected(), EVAL_OK));
    expect(check(result, "A3", EVAL_OK)?.status).toBe("NOT_RUN");
    expect(check(result, "PAIR", EVAL_POS)?.status).toBe("NOT_RUN");
    expect(result.status).toBe("FAIL");
    expect(result.status).not.toBe("PASS");
  });

  it("양성의 결과가 없으면 A1이 NOT_RUN이고 PASS가 아니다", () => {
    const result = run(without(detected(), DG_POS));
    expect(check(result, "A1", DG_POS)?.status).toBe("NOT_RUN");
    expect(result.status).not.toBe("PASS");
  });

  it("기대에 없는 경로의 결과가 있으면 대조 설계의 오류다", () => {
    const result = run(withCase(detected(), "cases/unknown.js", []));
    expect(result.design_errors.join("\n")).toContain("cases/unknown.js");
    expect(result.status).toBe("FAIL");
  });
});

describe("입력 검증", () => {
  it("전체 묶음 합계가 음수·비정수면 거부한다", () => {
    expect(() => run({ ...detected(), wholeBundleTotal: -1 })).toThrow();
    expect(() => run({ ...detected(), wholeBundleTotal: 1.5 })).toThrow();
    expect(() => run({ ...detected(), wholeBundleTotal: Number.NaN })).toThrow();
  });

  it("게시된 code 수가 전체 합계보다 많으면 입력이 모순이라 FAIL(design_errors)", () => {
    const result = run({ ...detected(), wholeBundleTotal: 1 });
    expect(result.status).toBe("FAIL");
    expect(result.design_errors.join("\n")).toContain("wholeBundleTotal");
  });

  it("사례 결과가 배열이 아니면 거부한다", () => {
    const bad = { cases: { [EVAL_POS]: "x" as unknown as string[] }, wholeBundleTotal: null };
    expect(() => run(bad)).toThrow();
  });
});

describe("applicable=false (target 모드)", () => {
  it("NOT_APPLICABLE이고 검사·음성 대조·설계 오류가 비어 있다", () => {
    const result = evaluateControlAssertions(expectations, detected(), { applicable: false });
    expect(result).toEqual({
      applicable: false,
      status: "NOT_APPLICABLE",
      checks: [],
      negative_controls: [],
      design_errors: [],
    });
  });

  it("관측이 어떻든(깨진 입력이어도) 같은 결과다", () => {
    const result = evaluateControlAssertions(
      expectations,
      { cases: {}, wholeBundleTotal: null },
      { applicable: false }
    );
    expect(result.status).toBe("NOT_APPLICABLE");
  });
});

const BINDING = "d".repeat(64);

describe("음성 대조 R1~R9", () => {
  it("표는 R1~R9를 순서대로 가지며 기대 상태는 rev2 4.1과 같다", () => {
    expect(NEGATIVE_CONTROL_TABLE.map((e) => e.id)).toEqual([
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "R8",
      "R9",
    ]);
    const expected = Object.fromEntries(NEGATIVE_CONTROL_TABLE.map((e) => [e.id, e.expected]));
    expect(expected).toEqual({
      R1: "MANIFEST_MISMATCH",
      R2: "MANIFEST_MISMATCH",
      R3: "MANIFEST_MISMATCH",
      R4: "MANIFEST_MISMATCH",
      R5: "MANIFEST_MISMATCH",
      R6: "RULES_NOT_LOADED",
      R7: "SETTINGS_MISMATCH",
      R8: "PREFIX_MISSING",
      R9: "ISOLATION_VIOLATION",
    });
  });

  it("엔진이 필요한 R6·R8은 사전 검사 사유가 없다(preflight null)", () => {
    const byId = Object.fromEntries(NEGATIVE_CONTROL_TABLE.map((e) => [e.id, e.preflight]));
    expect(byId.R6).toBeNull();
    expect(byId.R8).toBeNull();
    for (const id of ["R1", "R2", "R3", "R4", "R5", "R7", "R9"]) expect(byId[id]).not.toBeNull();
  });

  it("기본 기록은 엔진 9개 + 사전 검사 7개이고 전부 observed=null, status NOT_RUN, 결합 null이다", () => {
    const base = defaultNegativeControls();
    expect(base).toHaveLength(16);
    expect(base.filter((n) => n.layer === "engine")).toHaveLength(9);
    expect(base.filter((n) => n.layer === "preflight")).toHaveLength(7);
    for (const n of base) {
      expect(n.observed).toBeNull();
      expect(n.status).toBe("NOT_RUN");
      expect(n.binding_sha256).toBeNull();
    }
    const result = run(detected());
    expect(result.negative_controls).toEqual(base);
  });

  it("기본 실행은 음성 대조가 NOT_RUN이어도 PASS를 막지 않는다(엔진 필요분은 이 변경에서 미실행)", () => {
    expect(run(detected()).status).toBe("PASS");
  });

  it("사전 검사가 맞는 사유를 실제로 낸 경우에만 PASS로 표시한다(R1~R5, R7, R9)", async () => {
    // R1~R5: 합성 규칙 트리로 compareRulesTree가 낸 사유를 그대로 쓴다.
    const enc = new TextEncoder();
    const files: RuleFileEntry[] = ["javascript/a/one.yaml", "javascript/b/two.yaml"].map(
      (path) => ({
        path,
        blobSha: gitBlobSha1(enc.encode(`# placeholder ${path}\n`)),
      })
    );
    const config2 = { cacheDirName: "semgrep-rules", configDirs: ["semgrep-rules/javascript"] };
    const tree = (
      drop: string[],
      extra: Record<string, string>,
      override: Record<string, string>
    ) => {
      const m: Record<string, string> = {};
      for (const f of files) {
        if (!drop.includes(f.path))
          m[`/c/semgrep-rules/${f.path}`] = override[f.path] ?? `# placeholder ${f.path}\n`;
      }
      for (const [p, c] of Object.entries(extra)) m[`/c/semgrep-rules/${p}`] = c;
      return new MemoryFs(m);
    };
    const produce = async (fs: MemoryFs): Promise<Reason[]> =>
      compareRulesTree(fs, "/c/semgrep-rules", files, config2);

    {
      const produced = {
        R1: await produce(tree(["javascript/a/one.yaml"], {}, {})),
        R2: await produce(tree([], {}, { "javascript/a/one.yaml": "{ broken\n" })),
        R3: await produce(tree([], { "javascript/zz-broken.yaml": "{ broken\n" }, {})),
        R4: await produce(tree([], { "javascript/new.yaml": "# placeholder new\n" }, {})),
        R5: await produce(tree([], {}, { "javascript/b/two.yaml": "# placeholder 2\n" })),
        R7: (() => {
          const o = buildInitializationOptions({
            configuration: ["semgrep-rules/javascript"],
            maxTargetBytes: 1,
            timeout: 1,
            timeoutThreshold: 1,
          }) as unknown as Record<string, Record<string, unknown>>;
          o.scan.unknownKey = 1;
          return validateInitializationOptions(o);
        })(),
        R9: (() => {
          const o = buildInitializationOptions({
            configuration: ["semgrep-rules/javascript"],
            maxTargetBytes: 1,
            timeout: 1,
            timeoutThreshold: 1,
          }) as unknown as Record<string, Record<string, unknown>>;
          o.metrics.unknownKey = 1;
          return validateInitializationOptions(o);
        })(),
      };
      const marked = markPreflightNegativeControls(defaultNegativeControls(), produced, BINDING);
      const byId = Object.fromEntries(
        marked.filter((n) => n.layer === "preflight").map((n) => [n.id, n])
      );
      for (const id of ["R1", "R2", "R3", "R4", "R5", "R7", "R9"]) {
        expect(byId[id].status).toBe("PASS");
        expect(byId[id].observed).not.toBeNull();
        expect(byId[id].binding_sha256).toBe(BINDING);
      }
      // 사전 검사 PASS는 엔진 항목을 바꾸지 않는다.
      expect(marked.filter((n) => n.layer === "engine").every((n) => n.status === "NOT_RUN")).toBe(
        true
      );
      // 엔진이 필요한 것은 그대로다.
      expect(marked.find((n) => n.id === "R6")?.status).toBe("NOT_RUN");
      expect(marked.find((n) => n.id === "R8")?.status).toBe("NOT_RUN");
      // 표시한 결과를 평가에 넣어도 전체 상태는 PASS(NOT_RUN 음성 대조는 막지 않는다).
      const result = evaluateControlAssertions(expectations, detected(), {
        applicable: true,
        negativeControls: marked,
      });
      expect(result.status).toBe("PASS");
      expect(result.negative_controls).toEqual(marked);
    }
  });

  it("맞는 사유가 나오지 않았으면 PASS가 아니라 FAIL이고 전체 control_assertions도 FAIL이다", () => {
    const marked = markPreflightNegativeControls(defaultNegativeControls(), { R1: [] }, BINDING);
    const r1 = marked.find((n) => n.id === "R1" && n.layer === "preflight");
    expect(r1?.status).toBe("FAIL");
    expect(r1?.observed).toBe("COMPLETE");
    const result = evaluateControlAssertions(expectations, detected(), {
      applicable: true,
      negativeControls: marked,
    });
    expect(result.status).toBe("FAIL");
  });

  it("다른 사유가 났다고 PASS가 되지 않는다", () => {
    const marked = markPreflightNegativeControls(
      defaultNegativeControls(),
      { R7: [{ code: "LOCK_NOT_ACQUIRED" }] },
      BINDING
    );
    expect(marked.find((n) => n.id === "R7" && n.layer === "preflight")?.status).toBe("FAIL");
  });

  it("제공하지 않은 id는 NOT_RUN을 유지하고, 알 수 없는 id는 거부한다", () => {
    const marked = markPreflightNegativeControls(
      defaultNegativeControls(),
      { R3: [{ code: "RULES_FILE_ADDED", detail: "x" }] },
      BINDING
    );
    expect(marked.filter((n) => n.status === "PASS").map((n) => `${n.id}:${n.layer}`)).toEqual([
      "R3:preflight",
    ]);
    expect(marked.filter((n) => n.status === "NOT_RUN")).toHaveLength(15);
    expect(() =>
      markPreflightNegativeControls(defaultNegativeControls(), { R10: [] }, BINDING)
    ).toThrow();
  });

  it("엔진이 필요한 R6·R8은 사유를 줘도 표시하지 않고 거부한다", () => {
    expect(() =>
      markPreflightNegativeControls(
        defaultNegativeControls(),
        { R6: [{ code: "TIMEOUT_RULES" }] },
        BINDING
      )
    ).toThrow();
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const base = defaultNegativeControls();
    markPreflightNegativeControls(base, { R3: [{ code: "RULES_FILE_ADDED" }] }, BINDING);
    expect(base.every((n) => n.status === "NOT_RUN" && n.binding_sha256 === null)).toBe(true);
  });
});

// PR #29 외부 검토 발견 2: 저장된 기록의 요약이 세부 결과와 모순인지 보는 규칙(reference-record.ts)은 이 모듈의 판정 규칙과
// 같은 함수를 쓴다. 두 구현이 갈라지지 않도록, 실제 evaluateControlAssertions의 결과마다 같은 요약이 나오는지 고정한다.
describe("summarizeControlAssertions: evaluateControlAssertions와 같은 규칙", () => {
  const summarize = (r: ReturnType<typeof run>) =>
    summarizeControlAssertions({
      checks: r.checks,
      negatives: r.negative_controls,
      designErrorCount: r.design_errors.length,
    });

  const worlds: [string, ControlObserved][] = [
    ["의도대로 전부 탐지(PASS)", detected()],
    ["양성의 필수 탐지 누락(FAIL)", withCase(detected(), EVAL_POS, [])],
    [
      "허용 밖 ID(REVIEW_REQUIRED)",
      withCase(detected(), EVAL_POS, [...caseOf(EVAL_POS).required, "other.unexpected-rule"]),
    ],
    ["결과가 전혀 없음(NOT_RUN)", { cases: {}, wholeBundleTotal: null }],
    ["정상 파일의 결과만 없음(FAIL)", without(detected(), EVAL_OK)],
    ["양성의 결과만 없음(FAIL)", without(detected(), DG_POS)],
    ["기대에 없는 경로(설계 오류, FAIL)", withCase(detected(), "cases/unknown.js", [])],
    ["정상 파일에 code(FAIL)", withCase(detected(), EVAL_OK, ["some.rule"])],
    ["금지 ID 게시(FAIL)", withCase(detected(), EVAL_NOSRC, ["detect-eval-with-expression"])],
  ];
  it.each(worlds)("%s", (_name, observed) => {
    const result = run(observed);
    expect(summarize(result)).toBe(result.status);
  });

  it("세부 결과가 PASS·REVIEW·NOT_RUN·FAIL로 갈리는 세계를 모두 덮는다(시험 전제)", () => {
    const statuses = new Set(worlds.map(([, observed]) => run(observed).status));
    expect([...statuses].sort()).toEqual(["FAIL", "NOT_RUN", "PASS", "REVIEW_REQUIRED"]);
  });

  it("FAIL인 음성 대조가 있으면 검사가 모두 PASS여도 FAIL이다", () => {
    const negatives = defaultNegativeControls().map((n) => ({ ...n }));
    negatives[0].status = "FAIL";
    const result = evaluateControlAssertions(expectations, detected(), {
      applicable: true,
      negativeControls: negatives,
    });
    expect(result.status).toBe("FAIL");
    expect(summarize(result)).toBe("FAIL");
  });

  it("PAIR·A2·A4 같은 사례 외 검사의 NOT_RUN도 PASS를 막는다(사례 검사가 전부 PASS여도 FAIL)", () => {
    const result = run(detected());
    for (const kind of ["A2", "A4", "PAIR"] as const) {
      const checks = result.checks.map((c) => ({ ...c }));
      const target = checks.find((c) => c.kind === kind);
      if (!target) throw new Error(`시험 오류: ${kind} 검사가 없다`);
      target.status = "NOT_RUN";
      expect(
        summarizeControlAssertions({
          checks,
          negatives: result.negative_controls,
          designErrorCount: 0,
        }),
        kind
      ).toBe("FAIL");
    }
  });

  it("검사가 비어 있으면 PASS가 계산된다(그래서 호출자가 hasCaseChecks로 따로 막는다)", () => {
    expect(summarizeControlAssertions({ checks: [], negatives: [], designErrorCount: 0 })).toBe(
      "PASS"
    );
    expect(hasCaseChecks([])).toBe(false);
  });

  it("hasCaseChecks: A1·A3가 하나라도 있으면 true이고 PAIR·A2·A4뿐이면 false다", () => {
    const result = run(detected());
    expect(hasCaseChecks(result.checks)).toBe(true);
    expect(hasCaseChecks(result.checks.filter((c) => c.kind === "PAIR"))).toBe(false);
    expect(hasCaseChecks(result.checks.filter((c) => c.kind === "A2" || c.kind === "A4"))).toBe(
      false
    );
    expect(hasCaseChecks(result.checks.filter((c) => c.kind === "A1"))).toBe(true);
    expect(hasCaseChecks(result.checks.filter((c) => c.kind === "A3"))).toBe(true);
  });
});
