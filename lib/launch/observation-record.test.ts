import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  MEANS_KINDS,
  OBSERVATION_COLUMNS,
  parseObservationRecord,
  type ObservationRow,
} from "./observation-record";

// SPEC-B2C-LAUNCH-001 M5 (REQ-B2CLAUNCH-016, AC-B2CLAUNCH-016) — 사후 관측 기록 검사기 시험.
// 모든 값은 눈에 띄게 합성한 것이다(실제 대상·역할·위치·수단·시점이 아니다). 검사 출력은 행 번호와 칸 이름(고정
// 어휘)으로만 적고 칸의 값은 되풀이하지 않는다 — 기록이 시크릿·연락처·개인 정보를 담지 않아야 한다는
// REQ-B2CLAUNCH-007을 검사 출력에서도 지키기 위해서다.

const HEADER = `| ${OBSERVATION_COLUMNS.join(" | ")} |`;
const SEPARATOR = `|${OBSERVATION_COLUMNS.map(() => "---").join("|")}|`;

type Cells = Partial<Record<(typeof OBSERVATION_COLUMNS)[number], string>>;

function row(cells: Cells = {}): string {
  const merged: Record<string, string> = {
    "관측 대상": "대상-예시",
    "담당 역할": "역할-예시",
    "기록 위치": "위치-예시",
    "관측 수단": "수단-예시",
    구분: "기존",
    "도입 SPEC 또는 BLOCKED 사유": "",
    "관측 시점": "시점-예시",
    ...cells,
  };
  return `| ${OBSERVATION_COLUMNS.map((column) => merged[column]).join(" | ")} |`;
}

function table(...rows: string[]): string {
  return ["앞 문단", "", HEADER, SEPARATOR, ...rows, "", "뒤 문단"].join("\n");
}

function rowsOf(markdown: string): ObservationRow[] {
  const result = parseObservationRecord(markdown);
  expect(result.ok, "관측 기록이 통과해야 한다").toBe(true);
  return result.ok ? result.rows : [];
}

function errorsOf(markdown: string): string[] {
  const result = parseObservationRecord(markdown);
  expect(result.ok, "오류가 있어야 하는 관측 기록이 통과했다").toBe(false);
  return result.ok ? [] : result.errors;
}

// (가): 관측 대상·담당 역할·기록 위치·관측 수단(기존/신규 구분)·관측 시점이 모두 있다. 둘째 행의 신규 수단은 도입하는
// SPEC 식별자(합성)가 있다.
function fixtureA(): string[] {
  return [
    row(),
    row({
      "관측 대상": "대상-예시-2",
      구분: "신규",
      "도입 SPEC 또는 BLOCKED 사유": "SPEC-SYNTHETIC-001",
    }),
  ];
}

describe("AC-B2CLAUNCH-016 fixture (가)~(라)", () => {
  it("(가) 모든 필드가 있으면 통과하고 행을 칸 이름으로 돌려준다", () => {
    const rows = rowsOf(table(...fixtureA()));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      target: "대상-예시",
      role: "역할-예시",
      location: "위치-예시",
      means: "수단-예시",
      kind: "기존",
      introducedBy: "",
      timing: "시점-예시",
    });
    expect(rows[1].kind).toBe("신규");
    expect(rows[1].introducedBy).toBe("SPEC-SYNTHETIC-001");
  });

  it("(나) 관측 수단 하나에 기존/신규 구분이 없으면 그 행의 구분 칸을 이름으로 적어 거부한다", () => {
    const errors = errorsOf(table(row(), row({ 구분: "" })));

    expect(errors).toEqual([expect.stringContaining('2번째 행의 "구분" 칸이 비어 있다')]);
  });

  it("(나') 구분 칸이 기존·신규 밖의 값이면 거부한다", () => {
    const errors = errorsOf(table(row({ 구분: "미정" })));

    expect(errors).toEqual([expect.stringContaining('"구분" 칸이 기존·신규 중 하나가 아니다')]);
  });

  it("(다) 신규 수단인데 도입하는 SPEC 식별자나 BLOCKED 사유가 없으면 거부한다", () => {
    const errors = errorsOf(table(row({ 구분: "신규", "도입 SPEC 또는 BLOCKED 사유": "" })));

    expect(errors).toEqual([
      expect.stringContaining('1번째 행의 "도입 SPEC 또는 BLOCKED 사유" 칸이 비어 있다'),
    ]);
    expect(errors[0]).toContain("신규");
  });

  it("(다') 신규 수단에 BLOCKED 사유가 있으면 통과한다(식별자 모양은 보지 않고 칸이 찼는지만 본다)", () => {
    const rows = rowsOf(
      table(row({ 구분: "신규", "도입 SPEC 또는 BLOCKED 사유": "BLOCKED-사유-예시" }))
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].introducedBy).toBe("BLOCKED-사유-예시");
  });

  it("(라) 관측 시점 칸이 비어 있으면 거부한다", () => {
    const errors = errorsOf(table(row({ "관측 시점": "" })));

    expect(errors).toEqual([expect.stringContaining('1번째 행의 "관측 시점" 칸이 비어 있다')]);
  });

  it("(가)만 통과하고 (나)(다)(라)는 모두 거부한다", () => {
    const cases = {
      가: table(...fixtureA()),
      나: table(row({ 구분: "" })),
      다: table(row({ 구분: "신규" })),
      라: table(row({ "관측 시점": "" })),
    };

    const passed = Object.entries(cases)
      .filter(([, markdown]) => parseObservationRecord(markdown).ok)
      .map(([name]) => name);

    expect(passed).toEqual(["가"]);
  });
});

describe("필수 칸과 표 형태", () => {
  it.each(["관측 대상", "담당 역할", "기록 위치", "관측 수단"] as const)(
    '"%s" 칸이 비어 있으면 그 칸 이름을 적어 거부한다',
    (column) => {
      const errors = errorsOf(table(row({ [column]: "" })));

      expect(errors).toEqual([expect.stringContaining(`"${column}" 칸이 비어 있다`)]);
    }
  );

  it("기존 수단은 도입 칸이 비어 있어도 통과한다", () => {
    expect(rowsOf(table(row({ 구분: "기존", "도입 SPEC 또는 BLOCKED 사유": "" })))).toHaveLength(1);
  });

  it("한 행의 여러 칸이 비면 칸마다 오류를 적고 행 번호로 위치를 가리킨다", () => {
    const errors = errorsOf(table(row(), row({ "관측 시점": "", "담당 역할": "" })));

    expect(errors).toHaveLength(2);
    expect(errors.every((error) => error.startsWith("2번째 행"))).toBe(true);
  });

  it("표가 없으면 거부하고 헤더 이름들을 적는다", () => {
    const errors = errorsOf("표 없는 문서");

    expect(errors).toEqual([expect.stringContaining(OBSERVATION_COLUMNS.join("·"))]);
  });

  it("헤더만 있고 행이 없으면 거부한다(빈 양식은 관측 기록이 아니다)", () => {
    const errors = errorsOf(table());

    expect(errors).toEqual([expect.stringContaining("행이 없다")]);
  });

  it("허용된 칸 밖의 칸(담당자 연락처 같은 칸)은 값 없이도 거부하고 칸 이름을 되풀이하지 않는다", () => {
    const extraName = `연락처-${randomUUID()}`;
    const markdown = [`${HEADER} ${extraName} |`, `${SEPARATOR}---|`, `${row()} x |`].join("\n");

    const errors = errorsOf(markdown);

    expect(errors).toEqual([expect.stringContaining("허용된 칸 밖의 칸")]);
    expect(errors.join("\n")).not.toContain(extraName);
  });

  it("행의 칸 개수가 헤더와 다르면 그 행 번호를 적어 거부한다", () => {
    const errors = errorsOf(table(row(), "| 대상-예시 | 역할-예시 |"));

    expect(errors).toEqual([expect.stringContaining("2번째 행의 칸이 2개다")]);
  });

  it("구분 어휘는 기존·신규 둘뿐이다", () => {
    expect([...MEANS_KINDS]).toEqual(["기존", "신규"]);
  });
});

describe("값 비노출 — 출력은 행 번호와 칸 이름뿐이다", () => {
  it("거부 출력이 어떤 칸의 값도 되풀이하지 않는다", () => {
    const secret = `시크릿-${randomUUID()}`;
    const contact = `010-${randomUUID().slice(0, 4)}-${randomUUID().slice(0, 4)}`;
    const person = `이름-${randomUUID()}`;
    const markdown = table(
      row({
        "관측 대상": secret,
        "담당 역할": person,
        "기록 위치": contact,
        "관측 수단": secret,
        구분: "신규",
        "도입 SPEC 또는 BLOCKED 사유": "",
        "관측 시점": "",
      }),
      row({ "관측 대상": person, 구분: `잘못된-${secret}` })
    );

    const errors = errorsOf(markdown).join("\n");

    for (const value of [secret, contact, person]) expect(errors).not.toContain(value);
    expect(errors).toContain("1번째 행");
    expect(errors).toContain("2번째 행");
  });

  it("통과한 결과의 오류 목록은 없다", () => {
    const result = parseObservationRecord(table(...fixtureA()));

    expect(result.ok).toBe(true);
    expect("errors" in result).toBe(false);
  });
});
