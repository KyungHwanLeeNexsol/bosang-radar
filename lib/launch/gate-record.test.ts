import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ITEM_STATUSES,
  OUTPUT_ONLY_MARKER,
  RECORD_COLUMNS,
  parseGateRecord,
  type GateRecordResult,
} from "./gate-record";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNBOOK_PATH = join(REPO_ROOT, ".moai", "docs", "launch-gate-runbook.md");

const HEADER = `| ${RECORD_COLUMNS.join(" | ")} |`;
const SEPARATOR = `|${RECORD_COLUMNS.map(() => "---").join("|")}|`;

// 모든 값은 눈에 띄게 합성한 것이다(실제 역할·날짜·위치·값이 아니다).
function readyRow(id: string): string {
  return `| ${id} | 증명 ${id} | 위치-예시 | 역할-예시 | 날짜-예시 | 대상-${id} | EV-L1, EV-L2 | READY |`;
}

function statusRow(id: string, status: string): string {
  return `| ${id} | 증명 ${id} | 위치-예시 | 역할-예시 | 날짜-예시 | 대상-${id} | EV-L1 | ${status} |`;
}

function record(...rows: string[]): string {
  return ["앞 문단", "", HEADER, SEPARATOR, ...rows, "", "뒤 문단"].join("\n");
}

function itemsOf(markdown: string) {
  const result: GateRecordResult = parseGateRecord(markdown);
  if (!result.ok) throw new Error(`기록이 통과해야 한다: ${result.errors.join(" | ")}`);
  return result.items;
}

function errorsOf(markdown: string): string[] {
  const result = parseGateRecord(markdown);
  if (result.ok) throw new Error("오류가 있어야 하는 기록이 통과했다");
  return result.errors;
}

describe("AC-B2CLAUNCH-003 fixture (가)~(바)", () => {
  it("(가) 모든 항목의 상태가 세 값 중 하나이면 통과하고 필드를 모델로 돌려준다", () => {
    const items = itemsOf(
      record(readyRow("L-01"), statusRow("L-02", "BLOCKED"), statusRow("L-03", "UNVERIFIED"))
    );

    expect(items.map((item) => [item.id, item.status])).toEqual([
      ["L-01", "READY"],
      ["L-02", "BLOCKED"],
      ["L-03", "UNVERIFIED"],
    ]);
    expect(items[0]).toEqual({
      id: "L-01",
      proves: "증명 L-01",
      location: "위치-예시",
      role: "역할-예시",
      date: "날짜-예시",
      target: "대상-L-01",
      events: ["EV-L1", "EV-L2"],
      status: "READY",
    });
  });

  it("(나) 상태 칸이 빈 항목은 항목 식별자를 적은 오류로 거부한다", () => {
    const errors = errorsOf(record(readyRow("L-01"), statusRow("L-02", "")));

    expect(errors).toEqual(['"L-02" 항목의 "상태" 칸이 비어 있다']);
  });

  it("(다) 열거 밖 값(GO, 미정)은 항목 식별자와 값을 적은 오류로 거부한다", () => {
    const errors = errorsOf(record(statusRow("L-01", "GO"), statusRow("L-02", "미정")));

    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('"L-01"');
    expect(errors[0]).toContain("GO");
    expect(errors[1]).toContain('"L-02"');
    expect(errors[1]).toContain("미정");
  });

  it("(라) 식별자만 있고 나머지 필드가 빈 항목은 항목 식별자를 적은 오류로 거부한다", () => {
    const idOnly = "| L-03 |  |  |  |  |  |  |  |";

    const errors = errorsOf(record(readyRow("L-01"), idOnly));

    expect(errors).toEqual(['"L-03" 항목은 식별자만 있고 나머지 칸이 모두 비어 있다']);
  });

  it("(마) 필수 항목이 BLOCKED여서 전체가 no-go인 기록도 파서는 통과시킨다(go/no-go는 파서의 일이 아니다)", () => {
    const items = itemsOf(record(readyRow("L-01"), statusRow("L-02", "BLOCKED")));

    expect(items.map((item) => item.status)).toEqual(["READY", "BLOCKED"]);
  });

  it("(바) 상태 칸의 출력 전용 표지는 기록 상태가 아니라는 이유로 거부한다", () => {
    const errors = errorsOf(record(statusRow("L-01", OUTPUT_ONLY_MARKER)));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-01"');
    expect(errors[0]).toContain(OUTPUT_ONLY_MARKER);
    expect(errors[0]).toContain("출력 전용 표지");
  });
});

describe("상태 열거와 표지", () => {
  it("상태는 READY·BLOCKED·UNVERIFIED 셋뿐이다", () => {
    expect([...ITEM_STATUSES]).toEqual(["READY", "BLOCKED", "UNVERIFIED"]);
  });

  it("출력 전용 표지 값은 spec.md §2.4가 적은 값이다", () => {
    expect(OUTPUT_ONLY_MARKER).toBe("해당 없음(local)");
  });

  it("소문자·앞뒤 공백이 낀 값은 열거 밖이다(공백은 칸 정리로 걷힌다)", () => {
    expect(errorsOf(record(statusRow("L-01", "ready")))[0]).toContain("ready");
    expect(itemsOf(record(statusRow("L-01", "  READY  ")))[0]?.status).toBe("READY");
  });
});

describe("READY 항목의 필수 칸(spec.md §2.4 READY 정의)", () => {
  it("READY 항목은 보관 위치·역할·날짜·대상이 비어 있으면 칸 이름을 적은 오류가 된다", () => {
    const noLocation = readyRow("L-01").replace("| 위치-예시 |", "|  |");
    const noRole = readyRow("L-02").replace("| 역할-예시 |", "|  |");
    const noDate = readyRow("L-03").replace("| 날짜-예시 |", "|  |");
    const noTarget = readyRow("L-04").replace("| 대상-L-04 |", "|  |");

    const errors = errorsOf(record(noLocation, noRole, noDate, noTarget));

    expect(errors).toEqual([
      '"L-01" 항목은 READY인데 "산출물 보관 위치" 칸이 비어 있다',
      '"L-02" 항목은 READY인데 "서명 또는 관측 역할" 칸이 비어 있다',
      '"L-03" 항목은 READY인데 "날짜" 칸이 비어 있다',
      '"L-04" 항목은 READY인데 "대상" 칸이 비어 있다',
    ]);
  });

  it("READY 항목은 무효화 사건이 비어 있으면 거부한다", () => {
    const noEvents = readyRow("L-01").replace("| EV-L1, EV-L2 |", "|  |");

    expect(errorsOf(record(noEvents))).toEqual([
      '"L-01" 항목은 READY인데 "무효화 사건" 칸이 비어 있다',
    ]);
  });

  it("READY가 아닌 항목은 상태 밖의 칸이 비어 있어도 된다(아직 관측하지 않은 항목)", () => {
    const blocked = "| L-02 | 증명 | | | | | | BLOCKED |";

    expect(itemsOf(record(readyRow("L-01"), blocked)).map((item) => item.status)).toEqual([
      "READY",
      "BLOCKED",
    ]);
  });

  it("무효화 사건 칸의 값은 EV-L1~EV-L5 형태여야 한다", () => {
    const bad = statusRow("L-01", "UNVERIFIED").replace("EV-L1", "EV-L9");

    const errors = errorsOf(record(bad));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-01"');
    expect(errors[0]).toContain("EV-L9");
  });
});

describe("표 구조 오류", () => {
  it("칸이 여덟이 아닌 행은 식별자와 칸 수를 적은 오류가 된다", () => {
    const short = "| L-05 | 증명 | 위치-예시 | 역할-예시 | 날짜-예시 | 대상 | READY |";

    const errors = errorsOf(record(readyRow("L-01"), short));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-05"');
    expect(errors[0]).toContain("7개");
    expect(errors[0]).toContain("8개");
  });

  it("같은 식별자가 두 번 나오면 중복으로 거부한다", () => {
    expect(errorsOf(record(readyRow("L-01"), readyRow("L-01")))).toEqual([
      '"L-01" 항목이 기록에 2번 나온다',
    ]);
  });

  it("식별자 칸이 빈 행은 거부한다", () => {
    const noId = readyRow("L-01").replace("| L-01 |", "|  |");

    expect(errorsOf(record(noId))[0]).toContain("식별자");
  });

  it("기록 표 헤더가 없는 문서는 표가 없다는 오류가 된다", () => {
    expect(errorsOf("# 제목\n\n표가 없는 문서")).toEqual([
      `기록 표(헤더: ${RECORD_COLUMNS.join("·")})를 찾지 못했다`,
    ]);
  });

  it("CRLF 줄바꿈으로 읽어도 같은 결과를 낸다", () => {
    const markdown = record(readyRow("L-01"), statusRow("L-02", "BLOCKED"));

    expect(parseGateRecord(markdown.replace(/\n/g, "\r\n"))).toEqual(parseGateRecord(markdown));
  });

  it("한 기록에서 여러 문제가 겹치면 오류를 모두 모아 돌려준다", () => {
    const errors = errorsOf(
      record(statusRow("L-01", "GO"), statusRow("L-02", ""), "| L-03 |  |  |  |  |  |  |  |")
    );

    expect(errors).toHaveLength(3);
    expect(errors.map((error) => /"(L-0\d)"/.exec(error)?.[1])).toEqual(["L-01", "L-02", "L-03"]);
  });
});

describe("런북의 기록 양식 절(AC-B2CLAUNCH-003 — 양식만 있고 값은 없다)", () => {
  const runbook = readFileSync(RUNBOOK_PATH, "utf-8").replace(/\r\n/g, "\n");
  const start = runbook.indexOf("## 기록 양식");
  const section = start === -1 ? "" : runbook.slice(start).split(/\n## /)[0];

  it("기록 양식 절이 있고 표 헤더가 모델의 칸 순서와 같다", () => {
    expect(start, "런북에 '## 기록 양식' 절이 없다").toBeGreaterThanOrEqual(0);
    expect(section).toContain(HEADER);
  });

  it("세 상태와 출력 전용 표지의 구분, READY 항목의 필수 칸을 적는다", () => {
    for (const status of ITEM_STATUSES) expect(section).toContain(status);
    expect(section).toContain(OUTPUT_ONLY_MARKER);
    expect(section).toContain("출력 전용 표지");
    for (const column of [
      "산출물 보관 위치",
      "서명 또는 관측 역할",
      "날짜",
      "대상",
      "무효화 사건",
    ]) {
      expect(section).toContain(column);
    }
  });

  it("양식 절은 값이 든 기록 행을 담지 않는다", () => {
    const rows = section
      .split("\n")
      .filter((line) => line.trim().startsWith("|") && !/^\|[\s|:-]+\|$/.test(line.trim()));

    expect(rows).toEqual([HEADER]);
  });

  it("양식 절은 주소·이메일 형태 문자열을 담지 않는다", () => {
    expect(section).not.toMatch(/https?:\/\//);
    expect(section).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});
