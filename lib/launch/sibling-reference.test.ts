import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  SIBLING_REF_COLUMNS,
  evaluateSiblingReferences,
  parseSiblingReferences,
  siblingItemIds,
  siblingRecordKey,
  type SiblingDefinitionSource,
  type SiblingRefLine,
} from "./sibling-reference";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNBOOK_PATH = join(REPO_ROOT, ".moai", "docs", "launch-gate-runbook.md");
const CONSULTOPS_SPEC_PATH = join(
  REPO_ROOT,
  ".moai",
  "specs",
  "SPEC-B2C-CONSULTOPS-001",
  "spec.md"
);

function readText(file: string): string {
  return readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
}

// 형제 정의표(CONSULTOPS-001 §2.4)의 헤더 칸. 조회 함수는 표를 하나로 고정하지 않고 헤더 칸을 입력으로 받는다.
const CONSULTOPS_LABELS = ["ID", "증거 항목", "I", "G", "근거", "대상 / 무효화 사건"] as const;
const CONSULTOPS_SPEC = "SPEC-B2C-CONSULTOPS-001";
const CONSULTOPS_DEFINITIONS: SiblingDefinitionSource = {
  markdown: readText(CONSULTOPS_SPEC_PATH),
  labels: CONSULTOPS_LABELS,
};

const HEADER = `| ${SIBLING_REF_COLUMNS.join(" | ")} |`;
const SEPARATOR = `|${SIBLING_REF_COLUMNS.map(() => "---").join("|")}|`;

// 모든 값은 눈에 띄게 합성한 것이다(실제 상태·대상 값·위치가 아니다).
function refRow(
  launchItem: string,
  siblingItem: string,
  status = "READY",
  target = "대상값-예시-1",
  location = "형제기록위치-예시"
): string {
  return `| ${launchItem} | ${CONSULTOPS_SPEC} | ${siblingItem} | ${status} | ${target} | ${location} |`;
}

function refTable(...rows: string[]): string {
  return ["앞 문단", "", HEADER, SEPARATOR, ...rows, "", "뒤 문단"].join("\n");
}

function linesOf(markdown: string): SiblingRefLine[] {
  const result = parseSiblingReferences(markdown);
  if (!result.ok) throw new Error(`참조 줄이 통과해야 한다: ${result.errors.join(" | ")}`);
  return result.lines;
}

function errorsOf(markdown: string): string[] {
  const result = parseSiblingReferences(markdown);
  if (result.ok) throw new Error("오류가 있어야 하는 참조 줄이 통과했다");
  return result.errors;
}

/** 형제 기록 stub — 실제 형제 증거 기록은 아직 없으므로(형식·위치 미정) 시험이 입력으로 만든 합성 값이다. */
function stubRecord(status = "READY", target = "대상값-예시-1") {
  return { [siblingRecordKey(CONSULTOPS_SPEC, "E-03")]: { status, target } };
}

describe("AC-B2CLAUNCH-004 — 참조 줄 파서", () => {
  it("(가) 다섯 필드와 이 SPEC 항목을 모두 적은 참조 줄은 모델로 읽힌다", () => {
    expect(linesOf(refTable(refRow("R-04", "E-03")))).toEqual([
      {
        launchItem: "R-04",
        siblingSpec: CONSULTOPS_SPEC,
        siblingItem: "E-03",
        status: "READY",
        target: "대상값-예시-1",
        location: "형제기록위치-예시",
      },
    ]);
  });

  it("(다) 참조 줄에 자체 판정 칸이 덧붙으면 '참조 줄은 형제 상태만 옮길 수 있다'로 거부한다", () => {
    const header = `${HEADER} 판정 |`;
    const markdown = [
      header,
      `${SEPARATOR}---|`,
      `${refRow("R-04", "E-03", "READY")} BLOCKED |`,
    ].join("\n");

    const errors = errorsOf(markdown);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("참조 줄은 형제 상태만 옮길 수 있다");
    expect(errors[0]).toContain('"판정"');
  });

  it("(다) 자체 판정 칸의 값이 형제 상태와 같아도 REQ-B2CLAUNCH-004가 허용한 칸 밖이라 거부한다", () => {
    const header = `${HEADER} 상태 |`;
    const markdown = [
      header,
      `${SEPARATOR}---|`,
      `${refRow("R-04", "E-03", "READY")} READY |`,
    ].join("\n");

    expect(errorsOf(markdown)[0]).toContain("참조 줄은 형제 상태만 옮길 수 있다");
  });

  it("덧붙은 칸이 여럿이면 칸마다 오류를 낸다", () => {
    const markdown = [
      `${HEADER} 판정 | 의견 |`,
      `${SEPARATOR}---|---|`,
      `${refRow("R-04", "E-03")} A | B |`,
    ].join("\n");

    const errors = errorsOf(markdown);

    expect(errors.map((e) => e.includes('"판정"') || e.includes('"의견"'))).toEqual([true, true]);
  });

  it("헤더 줄이 없으면 표를 찾지 못했다는 오류를 낸다", () => {
    expect(errorsOf("문단만 있다")[0]).toContain("참조 줄 표");
  });

  it("줄과 이 SPEC 항목을 잇는 연결 칸이 헤더에 없는 표(REQ-B2CLAUNCH-004의 다섯 필드만 적은 표)는 표를 찾지 못한 것으로 거부한다", () => {
    const withoutLink = SIBLING_REF_COLUMNS.slice(1);
    const markdown = [
      `| ${withoutLink.join(" | ")} |`,
      `|${withoutLink.map(() => "---").join("|")}|`,
      `| ${CONSULTOPS_SPEC} | E-03 | READY | 대상값-예시-1 | 형제기록위치-예시 |`,
    ].join("\n");

    expect(errorsOf(markdown)).toHaveLength(1);
    expect(errorsOf(markdown)[0]).toContain("참조 줄 표");
    expect(errorsOf(markdown)[0]).toContain("이 SPEC 항목");
  });

  it("옮겨 적은 상태가 READY·BLOCKED·UNVERIFIED 밖이면 항목 식별자를 적어 거부한다", () => {
    for (const status of ["GO", "미정", ""]) {
      const errors = errorsOf(refTable(refRow("R-04", "E-03", status)));

      expect(errors.join("|")).toContain("R-04");
      expect(errors.join("|")).toContain("E-03");
    }
  });

  it("칸이 빈 참조 줄은 칸 이름을 적어 거부한다", () => {
    const cases: Array<[string, string]> = [
      ["형제 SPEC", `| R-04 |  | E-03 | READY | 대상값-예시-1 | 위치-예시 |`],
      ["형제 항목", `| R-04 | ${CONSULTOPS_SPEC} |  | READY | 대상값-예시-1 | 위치-예시 |`],
      ["옮겨 적은 대상 값", `| R-04 | ${CONSULTOPS_SPEC} | E-03 | READY |  | 위치-예시 |`],
      ["형제 기록 위치", `| R-04 | ${CONSULTOPS_SPEC} | E-03 | READY | 대상값-예시-1 |  |`],
      ["이 SPEC 항목", `|  | ${CONSULTOPS_SPEC} | E-03 | READY | 대상값-예시-1 | 위치-예시 |`],
    ];

    for (const [label, row] of cases) {
      expect(errorsOf(refTable(row)).join("|")).toContain(`"${label}"`);
    }
  });

  it("행의 칸 수가 헤더와 다르면 거부한다", () => {
    const errors = errorsOf(refTable(`| R-04 | ${CONSULTOPS_SPEC} | E-03 |`));

    expect(errors[0]).toContain("R-04");
    expect(errors[0]).toContain("칸이 3개");
  });

  it("표가 비어 있으면(헤더만) 참조 줄 없음으로 통과한다", () => {
    expect(linesOf(refTable())).toEqual([]);
  });
});

describe("AC-B2CLAUNCH-004 — 형제 정의표 조회(식별자로만, 복제하지 않는다)", () => {
  it("실제 CONSULTOPS-001 §2.4 정의표에서 E-03을 찾고 없는 식별자는 찾지 못한다", () => {
    const ids = siblingItemIds(CONSULTOPS_DEFINITIONS);

    expect(ids).not.toBeNull();
    expect(ids?.has("E-03")).toBe(true);
    expect(ids?.has("E-99")).toBe(false);
    expect([...(ids ?? [])].every((id) => /^E-\d{2}$/.test(id))).toBe(true);
  });

  it("헤더 칸으로 표를 고르므로 같은 문서의 다른 표(ID | 사실 …)의 식별자는 섞이지 않는다", () => {
    const ids = siblingItemIds(CONSULTOPS_DEFINITIONS);

    expect(ids?.has("F-03")).toBe(false);
  });

  it("헤더 칸이 맞는 표가 없으면 null이다", () => {
    expect(siblingItemIds({ markdown: "문단만 있다", labels: CONSULTOPS_LABELS })).toBeNull();
    expect(
      siblingItemIds({ markdown: CONSULTOPS_DEFINITIONS.markdown, labels: ["다른", "헤더"] })
    ).toBeNull();
  });
});

describe("AC-B2CLAUNCH-004 — 참조 줄 평가 fixture (가)(나)(라)", () => {
  const definitions = { [CONSULTOPS_SPEC]: CONSULTOPS_DEFINITIONS };

  function evaluate(line: SiblingRefLine, records = stubRecord()) {
    return evaluateSiblingReferences({ lines: [line], definitions, records });
  }

  const line = (siblingItem = "E-03", target = "대상값-예시-1", status = "READY"): SiblingRefLine =>
    linesOf(refTable(refRow("R-04", siblingItem, status, target)))[0];

  it("(가) 존재하는 형제 항목을 가리키고 형제 기록의 상태·대상 값을 그대로 옮겼으면 통과한다", () => {
    expect(evaluate(line())).toEqual({ rejections: [], unverified: {} });
  });

  it("(나) 존재하지 않는 항목 식별자는 식별자를 적어 거부한다", () => {
    const result = evaluate(line("E-99"));

    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]).toContain("존재하지 않는 형제 항목 식별자");
    expect(result.rejections[0]).toContain("E-99");
    expect(result.rejections[0]).toContain(CONSULTOPS_SPEC);
    expect(result.unverified).toEqual({});
  });

  it("(라) 옮겨 적은 대상 값이 형제 기록의 현재 값과 다르면 그 줄의 항목을 UNVERIFIED로 낸다(값은 출력하지 않는다)", () => {
    const result = evaluate(line("E-03", "대상값-예시-1"), stubRecord("READY", "대상값-예시-2"));

    expect(result.rejections).toEqual([]);
    expect(Object.keys(result.unverified)).toEqual(["R-04"]);
    expect(result.unverified["R-04"].join("|")).toContain("대상 값");
    expect(result.unverified["R-04"].join("|")).toContain("EV-L3");
    expect(JSON.stringify(result)).not.toContain("대상값-예시");
  });

  it("옮겨 적은 상태가 형제 기록의 현재 상태와 다르면 같은 방식으로 UNVERIFIED다", () => {
    const result = evaluate(line("E-03", "대상값-예시-1", "READY"), stubRecord("UNVERIFIED"));

    expect(result.unverified["R-04"].join("|")).toContain("상태");
  });

  it("형제 기록 내용이 입력되지 않으면 비교할 수 없으므로 UNVERIFIED다(fail-closed, 실제 형제 기록과의 비교는 BLOCKED)", () => {
    const missingRecord = evaluateSiblingReferences({ lines: [line()], definitions, records: {} });
    const noRecords = evaluateSiblingReferences({ lines: [line()], definitions });

    for (const result of [missingRecord, noRecords]) {
      expect(result.rejections).toEqual([]);
      expect(result.unverified["R-04"].join("|")).toContain("비교할 수");
    }
  });

  it("같은 항목의 두 줄이 모두 어긋나면 이유를 모은다", () => {
    const first = line("E-03", "대상값-예시-9");
    const second = { ...line("E-05", "대상값-예시-1"), launchItem: "R-04" };
    const records = {
      ...stubRecord(),
      [siblingRecordKey(CONSULTOPS_SPEC, "E-05")]: { status: "READY", target: "대상값-예시-7" },
    };

    const result = evaluateSiblingReferences({ lines: [first, second], definitions, records });

    expect(result.unverified["R-04"]).toHaveLength(2);
    expect(result.unverified["R-04"][0]).toContain("E-03");
    expect(result.unverified["R-04"][1]).toContain("E-05");
  });

  it("정의표가 입력되지 않은 형제 SPEC(예: 항목 식별자 표가 없는 ENGINE-001)의 참조는 조회할 수 없어 거부한다", () => {
    const engineLine: SiblingRefLine = {
      ...line(),
      launchItem: "R-02",
      siblingSpec: "SPEC-B2C-ENGINE-001",
      siblingItem: "(i)",
    };

    const result = evaluateSiblingReferences({ lines: [engineLine], definitions });

    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]).toContain("SPEC-B2C-ENGINE-001");
    expect(result.rejections[0]).toContain("(i)");
    expect(result.rejections[0]).toContain("정의표가 입력되지 않았다");
  });

  it("입력한 정의표에서 헤더 칸이 맞는 표를 찾지 못하면 항목을 조회할 수 없어 거부한다", () => {
    const result = evaluateSiblingReferences({
      lines: [line()],
      definitions: { [CONSULTOPS_SPEC]: { markdown: "문단만 있다", labels: CONSULTOPS_LABELS } },
      records: stubRecord(),
    });

    expect(result.rejections[0]).toContain("정의표");
    expect(result.rejections[0]).toContain("E-03");
  });

  it("항목 목록을 복제하지 않고 조회한다 — 같은 참조 줄도 입력한 정의표에서 그 항목이 빠지면 거부된다", () => {
    const withoutE03 = {
      [CONSULTOPS_SPEC]: {
        labels: CONSULTOPS_LABELS,
        markdown: CONSULTOPS_DEFINITIONS.markdown
          .split("\n")
          .filter((row) => !row.startsWith("| E-03 "))
          .join("\n"),
      },
    };

    const before = evaluateSiblingReferences({
      lines: [line()],
      definitions,
      records: stubRecord(),
    });
    const after = evaluateSiblingReferences({
      lines: [line()],
      definitions: withoutE03,
      records: stubRecord(),
    });

    expect(before.rejections).toEqual([]);
    expect(after.rejections[0]).toContain("E-03");
  });

  it("입력을 바꾸지 않는다", () => {
    const frozenLine = Object.freeze(line());
    const frozenInput = Object.freeze({
      lines: Object.freeze([frozenLine]),
      definitions: Object.freeze(definitions),
      records: Object.freeze(stubRecord()),
    });

    expect(() => evaluateSiblingReferences(frozenInput)).not.toThrow();
  });
});

describe("런북 `## 형제 증거 참조 양식` 절 — 양식만 적는다", () => {
  const runbook = readText(RUNBOOK_PATH);
  const start = runbook.indexOf("## 형제 증거 참조 양식");
  const section = start === -1 ? "" : runbook.slice(start).split(/\n## /)[0];

  it("절이 있고 헤더 줄이 참조 줄 열과 같으며 값이 든 행은 없다", () => {
    expect(section, "런북에 '## 형제 증거 참조 양식' 절이 없다").not.toBe("");
    expect(section).toContain(HEADER);
    expect(linesOf(section)).toEqual([]);
  });

  it("거부·판정 결과를 서술하고 값·주소·연락처를 적지 않는다", () => {
    expect(section).toContain("존재하지 않는 항목 식별자");
    expect(section).toContain("참조 줄은 형제 상태만 옮길 수 있다");
    expect(section).toContain("UNVERIFIED");
    expect(section).toContain("EV-L3");
    expect(section).not.toMatch(/https?:\/\//);
    expect(section).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});
