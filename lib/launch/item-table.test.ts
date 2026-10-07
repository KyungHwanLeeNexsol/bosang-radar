import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  appliesToVector,
  coveringFilesOf,
  parseItemTable,
  type ItemRow,
  type ItemTableResult,
} from "./item-table";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC_PATH = join(REPO_ROOT, ".moai", "specs", "SPEC-B2C-LAUNCH-001", "spec.md");
const RUNBOOK_PATH = join(REPO_ROOT, ".moai", "docs", "launch-gate-runbook.md");

const HEADER = "| ID | 항목 | 표면 | I | G | 근거 | 대상 / 무효화 사건 |";
const SEPARATOR = "|---|---|---|---|---|---|---|";

const ROW_A = "| L-90 | 항목 가 | 전체 | 필수 | 필수 | 근거 가 | 대상 가 / EV-L1 |";
const ROW_B =
  "| R-90 | 항목 나 | S2·S3 | 결정 대기 | 해당 없음 | 근거 나 | 대상 나 / EV-L3, EV-L5 |";

function table(...rows: string[]): string {
  return ["앞 문단", "", HEADER, SEPARATOR, ...rows, "", "뒤 문단"].join("\n");
}

function readText(path: string): string {
  return readFileSync(path, "utf-8").replace(/\r\n/g, "\n");
}

function rowsOf(markdown: string): ItemRow[] {
  const result: ItemTableResult = parseItemTable(markdown);
  if (!result.ok) throw new Error(`표가 통과해야 한다: ${result.errors.join(" | ")}`);
  return result.rows;
}

function errorsOf(markdown: string): string[] {
  const result = parseItemTable(markdown);
  if (result.ok) throw new Error("오류가 있어야 하는 표가 통과했다");
  return result.errors;
}

describe("parseItemTable — 정상 표", () => {
  it("행마다 일곱 칸을 읽어 식별자·표면·I·G·대상·무효화 사건으로 나눈다", () => {
    const rows = rowsOf(table(ROW_A, ROW_B));

    expect(rows).toEqual([
      {
        id: "L-90",
        item: "항목 가",
        surfaces: "전체",
        i: "필수",
        g: "필수",
        basis: "근거 가",
        target: "대상 가",
        events: ["EV-L1"],
      },
      {
        id: "R-90",
        item: "항목 나",
        surfaces: ["S2", "S3"],
        i: "결정 대기",
        g: "해당 없음",
        basis: "근거 나",
        target: "대상 나",
        events: ["EV-L3", "EV-L5"],
      },
    ]);
  });

  it("CRLF 줄바꿈으로 읽어도 같은 결과를 낸다", () => {
    expect(parseItemTable(table(ROW_A, ROW_B).replace(/\n/g, "\r\n"))).toEqual(
      parseItemTable(table(ROW_A, ROW_B))
    );
  });
});

describe("parseItemTable — 음성 fixture(오류가 항목 식별자와 칸을 이름으로 가리킨다)", () => {
  it("칸이 일곱 개가 아닌 행은 식별자와 칸 수를 적은 오류가 된다", () => {
    const short = "| L-91 | 항목 | 전체 | 필수 | 필수 | 근거 |";

    const errors = errorsOf(table(ROW_A, short));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-91"');
    expect(errors[0]).toContain("6개");
    expect(errors[0]).toContain("7개");
  });

  it("비어 있는 칸은 식별자와 칸 이름을 적은 오류가 된다", () => {
    const empty = ROW_A.replace("| 근거 가 |", "|  |");

    expect(errorsOf(table(empty))).toEqual(['"L-90" 행의 "근거" 칸이 비어 있다']);
  });

  it("I 칸 값이 필수·결정 대기·해당 없음 밖이면 거부한다", () => {
    const bad = ROW_A.replace("| 필수 | 필수 |", "| 선택 | 필수 |");

    const errors = errorsOf(table(bad));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-90" 행의 "I" 칸');
    expect(errors[0]).toContain("선택");
  });

  it("G 칸 값이 열거 밖이면 거부한다", () => {
    const bad = ROW_A.replace("| 필수 | 필수 |", "| 필수 | 보류 |");

    const errors = errorsOf(table(bad));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-90" 행의 "G" 칸');
    expect(errors[0]).toContain("보류");
  });

  it("마지막 칸에 ' / ' 구분자가 없으면 거부한다", () => {
    const noSeparator = ROW_A.replace("대상 가 / EV-L1", "대상 가 EV-L1");

    const errors = errorsOf(table(noSeparator));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-90"');
    expect(errors[0]).toContain("0개");
  });

  it("마지막 칸에 ' / ' 구분자가 둘이면 거부한다", () => {
    const two = ROW_A.replace("대상 가 / EV-L1", "대상 / 가 / EV-L1");

    const errors = errorsOf(table(two));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-90"');
    expect(errors[0]).toContain("2개");
  });

  it("표면 칸이 전체도 S1·S2·S3의 · 연결도 아니면 거부한다", () => {
    const unknownSurface = ROW_A.replace("| 전체 |", "| S4 |");
    const mixed = ROW_B.replace("S2·S3", "전체·S2");

    expect(errorsOf(table(unknownSurface))[0]).toContain('"L-90" 행의 "표면" 칸');
    expect(errorsOf(table(mixed))[0]).toContain('"R-90" 행의 "표면" 칸');
  });

  it("같은 식별자가 두 번 나오면 중복으로 거부한다", () => {
    expect(errorsOf(table(ROW_A, ROW_B, ROW_A))).toEqual(['"L-90" 항목 행이 2번 나온다']);
  });

  it("항목 표 헤더가 없는 문서는 표가 없다는 오류가 된다", () => {
    expect(errorsOf("# 제목\n\n표가 없는 문서")).toEqual([
      "항목 정의표(헤더: ID·항목·표면·I·G·근거·대상 / 무효화 사건)를 찾지 못했다",
    ]);
  });

  it("한 표에서 여러 문제가 겹치면 오류를 모두 모아 돌려준다", () => {
    const emptyId = "|  | 항목 | 전체 | 필수 | 필수 | 근거 | 대상 / EV-L1 |";
    const badG = ROW_A.replace("| 필수 | 필수 |", "| 필수 | 보류 |");
    const noSep = ROW_B.replace("대상 나 / EV-L3, EV-L5", "대상 나");

    const errors = errorsOf(table(badG, noSep, emptyId));

    expect(errors).toHaveLength(3);
    expect(errors.some((error) => error.includes('"L-90"') && error.includes('"G"'))).toBe(true);
    expect(errors.some((error) => error.includes('"R-90"') && error.includes("구분자"))).toBe(true);
    expect(errors.some((error) => error.includes("식별자"))).toBe(true);
  });
});

describe("appliesToVector — 표면 열 규칙", () => {
  const [all, s2s3] = rowsOf(table(ROW_A, ROW_B));

  it("전체는 목적 벡터와 상관없이 항상 적용된다", () => {
    expect(appliesToVector(all, [])).toBe(true);
    expect(appliesToVector(all, ["S1"])).toBe(true);
  });

  it("표면을 적은 항목은 목적 벡터가 그 표면 하나라도 열 때만 적용된다", () => {
    expect(appliesToVector(s2s3, ["S1"])).toBe(false);
    expect(appliesToVector(s2s3, [])).toBe(false);
    expect(appliesToVector(s2s3, ["S2"])).toBe(true);
    expect(appliesToVector(s2s3, ["S1", "S3"])).toBe(true);
  });
});

describe("실제 문서의 항목 정의표(AC-B2CLAUNCH-002 검증 칸)", () => {
  const specRows = rowsOf(readText(SPEC_PATH));

  it("spec.md §2.4 항목 정의표가 같은 규칙으로 통과하고 행은 열네 개다", () => {
    expect(specRows.map((row) => row.id)).toEqual([
      "L-01",
      "L-02",
      "L-03",
      "L-04",
      "L-05",
      "L-06",
      "L-07",
      "L-08",
      "L-09",
      "R-01",
      "R-02",
      "R-03",
      "R-04",
      "R-05",
    ]);
  });

  it("런북의 항목 정의표도 통과하고 spec.md와 같은 행을 돌려준다", () => {
    expect(rowsOf(readText(RUNBOOK_PATH))).toEqual(specRows);
  });

  it("I/G 조합 분포가 acceptance.md가 적은 수와 같다", () => {
    const tally = new Map<string, number>();
    for (const row of specRows) {
      const key = `${row.i}/${row.g}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }

    expect(Object.fromEntries(tally)).toEqual({
      "필수/필수": 8,
      "결정 대기/필수": 2,
      "필수/해당 없음": 1,
      "필수/결정 대기": 1,
      "해당 없음/결정 대기": 1,
      "결정 대기/결정 대기": 1,
    });
  });

  it("표면 열과 무효화 사건이 표대로 읽힌다", () => {
    const byId = new Map(specRows.map((row) => [row.id, row]));

    expect(byId.get("L-01")?.surfaces).toBe("전체");
    expect(byId.get("L-05")?.surfaces).toEqual(["S1"]);
    expect(byId.get("L-08")?.surfaces).toEqual(["S1", "S2"]);
    expect(byId.get("R-01")?.surfaces).toEqual(["S2", "S3"]);
    expect(byId.get("L-01")?.events).toEqual(["EV-L2", "EV-L5"]);
    expect(byId.get("L-08")?.events).toEqual(["EV-L1", "EV-L3", "EV-L4"]);
  });
});

describe("coveringFilesOf — 대상 칸에 적힌 덮는 파일", () => {
  const byId = new Map(rowsOf(readText(SPEC_PATH)).map((row) => [row.id, row]));

  it("L-04는 표 칸에 적힌 여섯 파일을 돌려준다", () => {
    expect(coveringFilesOf(byId.get("L-04")!)).toEqual([
      "lib/diagnosis/flags.ts",
      "app/page.tsx",
      "app/result/page.tsx",
      "app/consult/page.tsx",
      "app/api/consultations/route.ts",
      "lib/env.ts",
    ]);
  });

  it("L-05는 워크플로 파일 하나를 돌려준다", () => {
    expect(coveringFilesOf(byId.get("L-05")!)).toEqual([".github/workflows/deploy.yml"]);
  });

  it("파일 목록을 적지 않은 항목은 빈 목록이다(런북 골격은 목록을 새로 정하지 않는다)", () => {
    expect(coveringFilesOf(byId.get("L-01")!)).toEqual([]);
    expect(coveringFilesOf(byId.get("R-01")!)).toEqual([]);
  });
});
