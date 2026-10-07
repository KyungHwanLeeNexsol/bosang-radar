import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  LEGAL_CONFIRMATION_COLUMNS,
  LEGAL_RESULTS,
  judgeLegalConfirmation,
  parseLegalConfirmation,
  type LegalConfirmation,
} from "./legal-confirmation";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNBOOK_PATH = join(REPO_ROOT, ".moai", "docs", "launch-gate-runbook.md");

const HEADER = `| ${LEGAL_CONFIRMATION_COLUMNS.join(" | ")} |`;
const SEPARATOR = `|${LEGAL_CONFIRMATION_COLUMNS.map(() => "---").join("|")}|`;

// 모든 값은 눈에 띄게 합성한 것이다(실제 문구 식별자·버전·역할·날짜가 아니다).
const CURRENT_VERSION = "버전-예시-2";

function row(
  targetId = "대상식별자-예시",
  version = CURRENT_VERSION,
  role = "역할-예시",
  date = "날짜-예시",
  result = "일치 확인"
): string {
  return `| ${targetId} | ${version} | ${role} | ${date} | ${result} |`;
}

function table(...rows: string[]): string {
  return ["앞 문단", "", HEADER, SEPARATOR, ...rows, "", "뒤 문단"].join("\n");
}

function recordsOf(markdown: string): LegalConfirmation[] {
  const result = parseLegalConfirmation(markdown);
  if (!result.ok) throw new Error(`확인 기록이 통과해야 한다: ${result.errors.join(" | ")}`);
  return result.records;
}

function errorsOf(markdown: string): string[] {
  const result = parseLegalConfirmation(markdown);
  if (result.ok) throw new Error("오류가 있어야 하는 확인 기록이 통과했다");
  return result.errors;
}

function judge(markdown: string, currentVersion: string | undefined = CURRENT_VERSION) {
  return judgeLegalConfirmation(recordsOf(markdown)[0], currentVersion);
}

describe("AC-B2CLAUNCH-006 fixture (가)~(바)", () => {
  it("(가) 확인 대상 식별자·버전, 확인한 역할, 날짜, 결과(일치 확인)가 모두 있으면 READY로 인정한다", () => {
    const records = recordsOf(table(row()));

    expect(records).toEqual([
      {
        targetId: "대상식별자-예시",
        targetVersion: CURRENT_VERSION,
        role: "역할-예시",
        date: "날짜-예시",
        result: "일치 확인",
      },
    ]);
    expect(judge(table(row()))).toEqual({ status: "READY" });
  });

  it("(나) 결과 칸이 열거 밖 값이면 식별자와 칸을 적어 거부한다", () => {
    const errors = errorsOf(
      table(row("대상식별자-예시", CURRENT_VERSION, "역할-예시", "날짜-예시", "적법"))
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("대상식별자-예시");
    expect(errors[0]).toContain('"결과"');
    expect(errors[0]).toContain(LEGAL_RESULTS.join("·"));
  });

  it("(다) 자유 서술 칸(의견·결론)이 있으면 허용된 칸 밖이라 칸마다 거부한다", () => {
    const markdown = [
      `${HEADER} 의견 | 결론 |`,
      `${SEPARATOR}---|---|`,
      `${row()} 서술-예시 | 서술-예시 |`,
    ].join("\n");

    const errors = errorsOf(markdown);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('"의견"');
    expect(errors[1]).toContain('"결론"');
    expect(errors.join("|")).toContain("법적 결론이나 판단 문구");
  });

  it("(라) 역할 칸이 비어 있으면 식별자와 칸을 적어 거부한다", () => {
    const errors = errorsOf(table(row("대상식별자-예시", CURRENT_VERSION, "")));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("대상식별자-예시");
    expect(errors[0]).toContain('"확인한 역할"');
  });

  it("(마) 확인 대상 버전이 대상의 현재 버전과 다르면 UNVERIFIED다", () => {
    const result = judge(table(row("대상식별자-예시", "버전-예시-1")));

    expect(result.status).toBe("UNVERIFIED");
    expect(result.reason).toContain("버전");
  });

  it("(바) 결과가 불일치이면 BLOCKED다", () => {
    const result = judge(
      table(row("대상식별자-예시", CURRENT_VERSION, "역할-예시", "날짜-예시", "불일치"))
    );

    expect(result.status).toBe("BLOCKED");
  });

  it("여섯 fixture 중 READY로 인정되는 것은 (가) 하나뿐이다", () => {
    const outcomes = [
      ["가", table(row())],
      ["나", table(row("대상식별자-예시", CURRENT_VERSION, "역할-예시", "날짜-예시", "적법"))],
      ["라", table(row("대상식별자-예시", CURRENT_VERSION, ""))],
      ["마", table(row("대상식별자-예시", "버전-예시-1"))],
      ["바", table(row("대상식별자-예시", CURRENT_VERSION, "역할-예시", "날짜-예시", "불일치"))],
    ].map(([tag, markdown]) => {
      const parsed = parseLegalConfirmation(markdown);
      return [
        tag,
        parsed.ok ? judgeLegalConfirmation(parsed.records[0], CURRENT_VERSION).status : "거부",
      ];
    });

    expect(outcomes).toEqual([
      ["가", "READY"],
      ["나", "거부"],
      ["라", "거부"],
      ["마", "UNVERIFIED"],
      ["바", "BLOCKED"],
    ]);
  });
});

describe("확인 기록 파서 — 허용된 다섯 칸만", () => {
  it("결과 열거는 일치 확인·불일치·미확인 셋이다", () => {
    expect([...LEGAL_RESULTS]).toEqual(["일치 확인", "불일치", "미확인"]);
  });

  it("다섯 칸이 각각 비어 있으면 식별자(또는 행 위치)와 칸 이름을 적어 거부한다", () => {
    const rows: Array<[string, string]> = [
      ["확인 대상 식별자", row("")],
      ["확인 대상 버전", row("대상식별자-예시", "")],
      ["확인한 역할", row("대상식별자-예시", CURRENT_VERSION, "")],
      ["날짜", row("대상식별자-예시", CURRENT_VERSION, "역할-예시", "")],
      ["결과", row("대상식별자-예시", CURRENT_VERSION, "역할-예시", "날짜-예시", "")],
    ];

    for (const [label, line] of rows) {
      expect(errorsOf(table(line)).join("|")).toContain(`"${label}"`);
    }
  });

  it("헤더 줄이 없으면 표를 찾지 못했다는 오류를 낸다", () => {
    expect(errorsOf("문단만 있다")[0]).toContain("확인 기록 표");
  });

  it("행의 칸 수가 헤더와 다르면 거부한다", () => {
    expect(errorsOf(table("| 대상식별자-예시 | 버전-예시-2 |"))[0]).toContain("칸이 2개");
  });

  it("행이 여럿이면 행마다 모델이 나오고 오류는 모아서 낸다", () => {
    const records = recordsOf(
      table(row("대상-A"), row("대상-B", "버전-예시-9", "역할-예시", "날짜-예시", "미확인"))
    );

    expect(records.map((r) => [r.targetId, r.result])).toEqual([
      ["대상-A", "일치 확인"],
      ["대상-B", "미확인"],
    ]);
    expect(
      errorsOf(table(row("대상-A", CURRENT_VERSION, ""), row("대상-B", CURRENT_VERSION, "", "")))
    ).toHaveLength(3);
  });

  it("표가 비어 있으면(헤더만) 기록 없음으로 통과한다", () => {
    expect(recordsOf(table())).toEqual([]);
  });

  it("허용된 칸에 숨긴 결론 문구는 감지하지 못한다 — AC-B2CLAUNCH-006이 적은 한계다", () => {
    const hidden = table(row("대상식별자-예시", CURRENT_VERSION, "역할-결론문구-예시"));

    expect(judge(hidden).status).toBe("READY");
  });
});

describe("확인 기록 판정 — 입력과 어긋날 때", () => {
  it("현재 버전이 넘어오지 않으면 같다고 확인할 수 없으므로 UNVERIFIED다(fail-closed)", () => {
    const result = judgeLegalConfirmation(recordsOf(table(row()))[0], undefined);

    expect(result.status).toBe("UNVERIFIED");
    expect(result.reason).toContain("현재 버전");
  });

  it("결과가 미확인이면 확인이 이뤄지지 않았으므로 UNVERIFIED다", () => {
    const result = judge(
      table(row("대상식별자-예시", CURRENT_VERSION, "역할-예시", "날짜-예시", "미확인"))
    );

    expect(result.status).toBe("UNVERIFIED");
    expect(result.reason).toContain("미확인");
  });

  it("불일치는 버전이 낡았어도 BLOCKED를 유지한다(READY로 올라가지 않는다)", () => {
    const result = judge(
      table(row("대상식별자-예시", "버전-예시-1", "역할-예시", "날짜-예시", "불일치"))
    );

    expect(result.status).toBe("BLOCKED");
  });

  it("입력을 바꾸지 않는다", () => {
    const record = Object.freeze(recordsOf(table(row()))[0]);

    expect(() => judgeLegalConfirmation(record, CURRENT_VERSION)).not.toThrow();
  });
});

describe("런북 `## 법무 확인 기록 양식` 절 — 양식만 적는다", () => {
  const runbook = readFileSync(RUNBOOK_PATH, "utf-8").replace(/\r\n/g, "\n");
  const start = runbook.indexOf("## 법무 확인 기록 양식");
  const section = start === -1 ? "" : runbook.slice(start).split(/\n## /)[0];

  it("절이 있고 헤더 줄이 확인 기록 열과 같으며 값이 든 행은 없다", () => {
    expect(section, "런북에 '## 법무 확인 기록 양식' 절이 없다").not.toBe("");
    expect(section).toContain(HEADER);
    expect(recordsOf(section)).toEqual([]);
  });

  it("(가)~(바) 결과와 열거를 서술하고 법적 결론·값·주소·연락처를 적지 않는다", () => {
    for (const word of ["일치 확인", "불일치", "미확인", "READY", "UNVERIFIED", "BLOCKED"]) {
      expect(section).toContain(word);
    }
    expect(section).toContain("법적 결론");
    expect(section).not.toMatch(/https?:\/\//);
    expect(section).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});
