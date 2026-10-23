import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  controlCaseProblems,
  controlCheckListProblems,
  evaluateControlAssertions,
  requiredControlChecks,
  type ControlObserved,
} from "./control";
import type { ControlCase, ControlExpectations } from "./types";

// 필요한 검사 목록: 기대 사례(data/control-expectations.json)에서 도출하고, 생성(evaluateControlAssertions)과
// 검증(기록을 읽는 쪽)이 같은 규칙을 쓴다. 기록이 스스로 주장하는 목록이나 개수는 기준이 아니다.

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

function withCases(f: (cs: ControlCase[]) => ControlCase[]): ControlExpectations {
  return { ...expectations, cases: f(expectations.cases.map((c) => ({ ...c }))) };
}

describe("requiredControlChecks: 기대 사례에서 필요한 검사 식별 목록을 도출한다", () => {
  const idsOf = (list: readonly { id: string }[]) => list.map((c) => c.id);

  it("실제 기대 입력(사례 9개)에서 사례별 A1/A3·A2·A4와 PAIR를 사례 순서대로 도출한다", () => {
    expect(idsOf(requiredControlChecks(expectations))).toEqual([
      `A1:${CP_POS}`,
      `A2:${CP_POS}`,
      `A4:${CP_POS}`, // 금지 ID가 있는 사례만 A4
      `A3:${CP_OK}`,
      `A1:${EVAL_POS}`,
      `A2:${EVAL_POS}`,
      `A3:${EVAL_OK}`,
      `A1:${EVAL_NOSRC}`,
      `A2:${EVAL_NOSRC}`,
      `A4:${EVAL_NOSRC}`,
      `A1:${IH_POS}`,
      `A2:${IH_POS}`,
      `A3:${IH_OK}`,
      `A1:${DG_POS}`,
      `A2:${DG_POS}`,
      `A3:${DG_OK}`,
      "PAIR:child-process", // 짝이 있는 양성마다 하나, 사례 검사 뒤에
      "PAIR:eval",
      "PAIR:innerhtml",
      "PAIR:dangerously",
    ]);
  });

  it("id·kind·file의 관계: 사례 검사는 `<kind>:<file>`이고, PAIR는 `PAIR:<계열>`에 양성 사례를 file로 갖는다", () => {
    for (const c of requiredControlChecks(expectations)) {
      if (c.kind === "PAIR") {
        expect(c.id).toBe(`PAIR:${caseOf(c.file).family}`);
        expect(caseOf(c.file).kind).toBe("positive");
      } else {
        expect(c.id).toBe(`${c.kind}:${c.file}`);
      }
    }
  });

  it("개수는 상수가 아니라 기대 사례에서 나온다: 사례 구성에서 따로 센 값과 같다", () => {
    const counted = (e: Pick<ControlExpectations, "cases">): number =>
      e.cases.reduce(
        (sum, c) =>
          sum +
          (c.kind === "normal" || c.expect_zero ? 1 : 2 + (c.forbidden.length > 0 ? 1 : 0)) +
          (c.kind === "positive" && c.pair !== null ? 1 : 0),
        0
      );
    expect(requiredControlChecks(expectations)).toHaveLength(counted(expectations));
    const fewer = { cases: expectations.cases.slice(0, 4) };
    expect(requiredControlChecks(fewer)).toHaveLength(counted(fewer));
    expect(requiredControlChecks(fewer).length).toBeLessThan(
      requiredControlChecks(expectations).length
    );
    expect(requiredControlChecks({ cases: [] })).toEqual([]);
  });

  it("식별만 돌려주고 결과(status·detail)는 싣지 않는다 — 임의의 PASS로 채울 수 없다", () => {
    for (const c of requiredControlChecks(expectations)) {
      expect(Object.keys(c).sort()).toEqual(["file", "id", "kind"]);
    }
  });

  it("입력을 바꾸지 않는다", () => {
    const before = structuredClone(expectations);
    requiredControlChecks(expectations);
    expect(expectations).toEqual(before);
  });

  // 생성(evaluateControlAssertions)이 만드는 검사의 (id, kind, file)가 도출 목록과 같다 — 같은 규칙을 쓴다는 증거.
  const variants: [string, ControlExpectations][] = [
    ["실제 기대 입력", expectations],
    [
      "금지 ID가 없어짐",
      withCases((cs) => cs.map((c) => (c.path === CP_POS ? { ...c, forbidden: [] } : c))),
    ],
    [
      "금지 ID가 생김",
      withCases((cs) => cs.map((c) => (c.path === EVAL_POS ? { ...c, forbidden: ["x"] } : c))),
    ],
    [
      "짝이 없어짐",
      withCases((cs) => cs.map((c) => (c.path === CP_POS ? { ...c, pair: null } : c))),
    ],
    [
      "양성이 expect_zero(정상 취급)이면서 짝이 있음",
      withCases((cs) => cs.map((c) => (c.path === IH_POS ? { ...c, expect_zero: true } : c))),
    ],
    [
      "짝이 기대 목록에 없음(설계 오류)",
      withCases((cs) => cs.map((c) => (c.path === DG_POS ? { ...c, pair: "cases/none.tsx" } : c))),
    ],
    ["사례 일부만", withCases((cs) => cs.slice(0, 5))],
    ["사례 없음", withCases(() => [])],
    [
      "같은 계열 양성 둘",
      withCases((cs) => [...cs, { ...caseOf(EVAL_POS), path: "cases/eval.pos2.js" }]),
    ],
  ];
  type Mode = "detected" | "none" | "partial";
  function observedFor(e: ControlExpectations, mode: Mode): ControlObserved {
    const cases: Record<string, string[]> = {};
    e.cases.forEach((c, i) => {
      if (mode === "none" || (mode === "partial" && i % 2 === 1)) return;
      cases[c.path] = c.kind === "normal" || c.expect_zero ? [] : [...c.required];
    });
    return { cases, wholeBundleTotal: null };
  }
  const worldsOfVariants = variants.flatMap(([name, e]) =>
    (["detected", "none", "partial"] as const).map((mode): [string, ControlExpectations, Mode] => [
      `${name} / 관측 ${mode}`,
      e,
      mode,
    ])
  );
  it.each(worldsOfVariants)("생성이 만드는 검사 목록과 도출 목록이 같다: %s", (_name, e, mode) => {
    const result = evaluateControlAssertions(e, observedFor(e, mode), { applicable: true });
    const made = result.checks.map(({ id, kind, file }) => ({ id, kind, file }));
    expect(made).toEqual(requiredControlChecks(e));
  });

  it("target 모드(applicable=false)는 검사를 만들지 않는다(기존 동작 유지)", () => {
    const result = evaluateControlAssertions(
      expectations,
      { cases: {}, wholeBundleTotal: null },
      { applicable: false }
    );
    expect(result.checks).toEqual([]);
  });
});

describe("controlCheckListProblems: 기록의 검사 목록을 도출한 목록과 대조한다", () => {
  const required = requiredControlChecks(expectations);
  const copy = () => required.map((c) => ({ ...c }));
  const problems = (recorded: { id: string; kind: string; file: string | null }[]) =>
    controlCheckListProblems(recorded as never, expectations);

  it("같은 목록이면 문제가 없다 — 순서는 상관없다", () => {
    expect(problems(copy())).toEqual([]);
    expect(problems(copy().reverse())).toEqual([]);
    const rotated = [...copy().slice(7), ...copy().slice(0, 7)];
    expect(problems(rotated)).toEqual([]);
  });

  it("누락·중복·조합 불일치·예상 밖을 각각 다른 토큰으로 가린다", () => {
    const list = copy();
    list.splice(0, 1); // A1:CP_POS 누락
    list.push({ ...list[0] }); // 중복
    list.push({ id: "A1:cases/ghost.js", kind: "A1", file: "cases/ghost.js" }); // 예상 밖
    list[2] = { ...list[2], kind: "A1" }; // id(A3:...)는 맞는데 kind가 다름
    const tokens = problems(list);
    expect(tokens.map((t) => t.split("(")[0])).toEqual([
      "CHECKS_MISSING",
      "CHECKS_DUPLICATE",
      "CHECK_IDENTITY_MISMATCH",
      "CHECKS_UNEXPECTED",
    ]);
    expect(tokens.join(";")).not.toContain("ghost"); // 기록이 주장한 문자열은 옮기지 않는다
  });

  it("개수가 같아도 구성이 다르면 문제가 있다", () => {
    const list = copy();
    list[5] = { ...list[6] };
    expect(list).toHaveLength(required.length);
    expect(problems(list).length).toBeGreaterThan(0);
  });

  it("한 토큰에 보이는 항목은 6개까지이고 나머지는 +N으로 센다", () => {
    expect(problems([])).toEqual([
      `CHECKS_MISSING(${required
        .slice(0, 6)
        .map((c) => c.id)
        .join(", ")}, +${required.length - 6})`,
    ]);
    const many = Array.from({ length: 9 }, (_v, i) => ({
      id: `X${i}`,
      kind: "A1",
      file: `cases/x${i}.js`,
    }));
    expect(problems([...copy(), ...many])).toEqual([
      "CHECKS_UNEXPECTED(checks[20], checks[21], checks[22], checks[23], checks[24], checks[25], +3)",
    ]);
  });

  it("file이 null이거나 kind가 NEGATIVE인 기록 항목도 조합 불일치로 가린다", () => {
    const list = copy();
    list[0] = { ...list[0], file: null as unknown as string };
    list[1] = { ...list[1], kind: "NEGATIVE" };
    expect(problems(list)).toEqual([
      `CHECKS_MISSING(${required[0].id}, ${required[1].id})`,
      `CHECK_IDENTITY_MISMATCH(${required[0].id}, ${required[1].id})`,
    ]);
  });

  it("기대가 달라지면 같은 기록도 다르게 판정된다", () => {
    const smaller = {
      cases: expectations.cases.filter((c) => !c.path.startsWith("cases/dangerously.")),
    };
    expect(controlCheckListProblems(copy() as never, smaller)).toEqual([
      "CHECKS_UNEXPECTED(checks[13], checks[14], checks[15], checks[19])",
    ]);
    const matching = required.filter((c) => !c.file.startsWith("cases/dangerously."));
    expect(controlCheckListProblems(matching as never, smaller)).toEqual([]);
  });
});

describe("controlCaseProblems: 검사 목록 도출에 쓰는 기대 필드를 검증한다", () => {
  it("실제 기대 입력은 문제가 없다", () => {
    expect(controlCaseProblems(expectations)).toEqual([]);
  });

  const bad: [string, unknown, string][] = [
    ["객체가 아님", null, "cases(type)"],
    ["cases가 없음", {}, "cases(type)"],
    ["cases가 배열이 아님", { cases: {} }, "cases(type)"],
    ["cases가 비어 있음", { cases: [] }, "cases(empty)"],
    ["사례가 객체가 아님", { cases: [1] }, "cases[0](type)"],
    ["사례가 배열", { cases: [[]] }, "cases[0](type)"],
  ];
  it.each(bad)("%s → 문제를 토큰으로 돌려준다", (_name, value, token) => {
    expect(controlCaseProblems(value)).toEqual([token]);
  });

  it("필드별 문제는 경로(missing·type·value·duplicate)로 가린다", () => {
    const cases = expectations.cases.map((c) => ({ ...c })) as unknown as Record<string, unknown>[];
    delete cases[0].path;
    cases[1].kind = "weird";
    cases[2].family = 3;
    cases[3].pair = 4;
    cases[4].forbidden = [1];
    cases[5].expect_zero = "x";
    cases[7].path = cases[6].path;
    expect(controlCaseProblems({ cases })).toEqual([
      "cases[0].path(missing)",
      "cases[1].kind(value)",
      "cases[2].family(type)",
      "cases[3].pair(type)",
      "cases[4].forbidden[0](type)",
      "cases[5].expect_zero(type)",
      "cases[7].path(duplicate)",
    ]);
  });

  it("입력을 바꾸지 않는다", () => {
    const before = structuredClone(expectations);
    controlCaseProblems(expectations);
    expect(expectations).toEqual(before);
  });
});
