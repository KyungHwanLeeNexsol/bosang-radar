import { describe, expect, it } from "vitest";

import {
  EXPOSURE_COLUMNS,
  EXPOSURE_PATHS,
  parseExposureRecord,
  type ExposureRow,
} from "./exposure-record";

// SPEC-B2C-LAUNCH-001 M3a (REQ-B2CLAUNCH-009, AC-B2CLAUNCH-009 시나리오 1) — 노출 기록 검사기 시험.
// 모든 값은 눈에 띄게 합성한 것이다(실제 대상·수단·역할·날짜·기록 식별자가 아니다). 출력은 빠진 경로와 칸을
// 식별자(고정 어휘)로만 적고 칸의 값은 되풀이하지 않는다.

const HEADER = `| ${EXPOSURE_COLUMNS.join(" | ")} |`;
const SEPARATOR = `|${EXPOSURE_COLUMNS.map(() => "---").join("|")}|`;

type Cells = Partial<Record<(typeof EXPOSURE_COLUMNS)[number], string>>;

function row(path: string, cells: Cells = {}): string {
  const merged: Record<string, string> = {
    "도달 경로": path,
    "도달 대상": "대상-예시",
    "제한 수단": "수단-예시",
    "수단 위치": "저장소 안",
    "외부 관측 기록": "",
    "수용 역할": "",
    "수용 날짜": "",
    ...cells,
  };
  return `| ${EXPOSURE_COLUMNS.map((column) => merged[column]).join(" | ")} |`;
}

function table(...rows: string[]): string {
  return ["앞 문단", "", HEADER, SEPARATOR, ...rows, "", "뒤 문단"].join("\n");
}

// (가): 다섯 경로 모두에 도달 대상·제한 수단·수단 위치가 있다. 일부 수단은 저장소 밖이라 외부 관측 기록 식별자가 있다.
function fixtureA(overrides: Record<string, Cells> = {}): string[] {
  return EXPOSURE_PATHS.map((path, index) =>
    row(
      path,
      index >= 3
        ? {
            "수단 위치": "저장소 밖",
            "외부 관측 기록": "관측기록-예시",
            ...overrides[path],
          }
        : { ...overrides[path] }
    )
  );
}

function rowsOf(markdown: string): ExposureRow[] {
  const result = parseExposureRecord(markdown);
  expect(result.ok, "노출 기록이 통과해야 한다").toBe(true);
  return result.ok ? result.rows : [];
}

function errorsOf(markdown: string): string[] {
  const result = parseExposureRecord(markdown);
  expect(result.ok, "오류가 있어야 하는 노출 기록이 통과했다").toBe(false);
  return result.ok ? [] : result.errors;
}

describe("AC-B2CLAUNCH-009 시나리오 1 fixture (가)~(라)", () => {
  it("(가) 다섯 경로 모두에 도달 대상·제한 수단·수단 위치가 있으면 통과한다", () => {
    const rows = rowsOf(table(...fixtureA()));

    expect(rows.map((r) => r.path)).toEqual([...EXPOSURE_PATHS]);
    expect(rows.map((r) => r.location)).toEqual([
      "저장소 안",
      "저장소 안",
      "저장소 안",
      "저장소 밖",
      "저장소 밖",
    ]);
  });

  it("(나) 경로 하나가 빠지면 그 경로를 적어 거부한다", () => {
    const rows = fixtureA().filter((_, index) => index !== 2);

    const errors = errorsOf(table(...rows));

    expect(errors).toEqual(['도달 경로 "/consult" 행이 없다']);
  });

  it("(다) 제한이 없다고 적었는데 수용 역할·날짜가 없으면 누락 칸을 적어 거부한다", () => {
    const rows = fixtureA({
      "/result": { "수단 위치": "제한 없음", "제한 수단": "" },
    });

    const errors = errorsOf(table(...rows));

    expect(errors).toEqual([
      '도달 경로 "/result"의 "수용 역할" 칸이 비어 있다 — 제한이 없으면 수용한 역할과 날짜가 필요하다',
      '도달 경로 "/result"의 "수용 날짜" 칸이 비어 있다 — 제한이 없으면 수용한 역할과 날짜가 필요하다',
    ]);
  });

  it("(라) 제한 수단이 저장소 밖이라고 적었는데 외부 관측 기록 식별자가 없으면 거부한다", () => {
    const rows = fixtureA({ "POST /api/consultations": { "외부 관측 기록": "" } });

    const errors = errorsOf(table(...rows));

    expect(errors).toEqual([
      '도달 경로 "POST /api/consultations"의 "외부 관측 기록" 칸이 비어 있다 — 저장소 밖 제한 수단은 외부 관측 기록 식별자가 필요하다',
    ]);
  });

  it("네 fixture 중 통과하는 것은 (가) 하나뿐이다", () => {
    const outcomes = [
      ["가", table(...fixtureA())],
      ["나", table(...fixtureA().slice(1))],
      ["다", table(...fixtureA({ "/": { "수단 위치": "제한 없음", "제한 수단": "" } }))],
      ["라", table(...fixtureA({ "?devStep=·?devFixture=": { "외부 관측 기록": "" } }))],
    ] as const;

    const passed = outcomes
      .filter(([, markdown]) => parseExposureRecord(markdown).ok)
      .map(([name]) => name);

    expect(passed).toEqual(["가"]);
  });
});

describe("노출 기록 — 그 밖의 규칙", () => {
  it("제한이 없다고 적고 수용 역할·날짜를 적으면 통과한다", () => {
    const rows = fixtureA({
      "/": {
        "수단 위치": "제한 없음",
        "제한 수단": "",
        "수용 역할": "역할-예시",
        "수용 날짜": "날짜-예시",
      },
    });

    const parsed = rowsOf(table(...rows));

    expect(parsed[0]).toEqual(
      expect.objectContaining({
        location: "제한 없음",
        acceptedBy: "역할-예시",
        acceptedOn: "날짜-예시",
      })
    );
  });

  it("제한이 없다면서 제한 수단 칸이 채워져 있으면 모순이라 거부한다", () => {
    const rows = fixtureA({
      "/": { "수단 위치": "제한 없음", "수용 역할": "역할-예시", "수용 날짜": "날짜-예시" },
    });

    expect(errorsOf(table(...rows))).toEqual([
      '도달 경로 "/"의 "제한 수단" 칸이 채워져 있다 — 제한이 없다고 적은 경로는 제한 수단을 담지 않는다',
    ]);
  });

  it("도달 대상·제한 수단·수단 위치 칸이 비어 있으면 경로와 칸을 적어 거부한다", () => {
    const rows = fixtureA({
      "/": { "도달 대상": "" },
      "/result": { "제한 수단": "" },
      "/consult": { "수단 위치": "" },
    });

    expect(errorsOf(table(...rows))).toEqual([
      '도달 경로 "/"의 "도달 대상" 칸이 비어 있다',
      '도달 경로 "/result"의 "제한 수단" 칸이 비어 있다',
      '도달 경로 "/consult"의 "수단 위치" 칸이 비어 있다',
    ]);
  });

  it("수단 위치가 열거 밖 값이면 값을 되풀이하지 않고 거부한다", () => {
    const rows = fixtureA({ "/": { "수단 위치": "어딘가-예시" } });

    const errors = errorsOf(table(...rows));

    expect(errors).toEqual([
      '도달 경로 "/"의 "수단 위치" 칸이 저장소 안·저장소 밖·제한 없음 중 하나가 아니다',
    ]);
    expect(errors.join("|")).not.toContain("어딘가-예시");
  });

  it("경로가 다섯 경로 밖이면 값을 되풀이하지 않고 거부한다", () => {
    const rows = [...fixtureA(), row("/없는경로-예시")];

    const errors = errorsOf(table(...rows));

    expect(errors).toEqual(['6번째 행의 "도달 경로"가 다섯 경로 중 하나가 아니다']);
  });

  it("같은 경로가 두 번 나오면 거부한다", () => {
    const rows = [...fixtureA(), row("/")];

    expect(errorsOf(table(...rows))).toEqual(['도달 경로 "/"가 2번 나온다']);
  });

  it("경로 칸의 백틱 표기는 같은 경로로 읽는다", () => {
    const rows = fixtureA();
    rows[4] = row("`?devStep=`·`?devFixture=`", {
      "수단 위치": "저장소 밖",
      "외부 관측 기록": "관측기록-예시",
    });

    expect(rowsOf(table(...rows))[4]?.path).toBe("?devStep=·?devFixture=");
  });

  it("칸 수가 맞지 않는 행은 행 번호를 적어 거부하고 그 행의 경로는 없는 것으로 센다", () => {
    const rows = fixtureA();
    rows[1] = "| /result | 대상-예시 |";

    expect(errorsOf(table(...rows))).toEqual([
      expect.stringContaining("2번째 행의 칸이 2개다"),
      '도달 경로 "/result" 행이 없다',
    ]);
  });

  it("허용된 칸 밖의 칸(예: 담당자 연락처)이 있으면 칸 이름을 적어 거부한다", () => {
    const markdown = [
      `${HEADER} 담당자 연락처 |`,
      `${SEPARATOR}---|`,
      ...fixtureA().map((line) => `${line} 값-예시 |`),
    ].join("\n");

    const errors = errorsOf(markdown);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"담당자 연락처"');
    expect(errors[0]).toContain("허용되지 않는다");
  });

  it("표가 없으면 헤더를 적어 거부한다", () => {
    const errors = errorsOf("표 없는 문서");

    expect(errors).toEqual([expect.stringContaining("노출 기록 표")]);
    expect(errors[0]).toContain("도달 경로");
  });

  it("출력의 어느 오류도 칸 값을 되풀이하지 않는다", () => {
    const rows = fixtureA({
      "/": { "도달 대상": "", "제한 수단": "수단-예시-고유" },
      "/result": { "수단 위치": "저장소 밖", "외부 관측 기록": "" },
    });

    const joined = errorsOf(table(...rows)).join("|");

    expect(joined).not.toContain("수단-예시-고유");
    expect(joined).not.toContain("대상-예시");
  });
});
