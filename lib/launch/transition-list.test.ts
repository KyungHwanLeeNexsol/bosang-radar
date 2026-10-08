import { describe, expect, it } from "vitest";

import {
  PENDING_MARK,
  STEP_COLUMNS,
  parseProcedureSteps,
  type ProcedureStep,
} from "./procedure-steps";
import {
  ORDER_COLUMNS,
  checkTransitions,
  checkTransitionsFromMarkdown,
  parseExposureOrder,
  type OrderEntry,
} from "./transition-list";

// SPEC-B2C-LAUNCH-001 M3b (REQ-B2CLAUNCH-011, AC-B2CLAUNCH-011) — 전환 목록 점검기 시험.
// 순서(D-LAUNCH-03 기록)는 점검기의 입력이다. 아래 순서는 이 시험의 합성 fixture이며 결정 기록의 내용이 아니다.
// 값(역할·날짜·주소)은 어디에도 없고, 출력은 전환 번호와 칸 이름만 적고 칸의 값은 되풀이하지 않는다.

const V1 = "진단 게이트: 닫힘, 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음";
const V2 =
  "진단 게이트: 열림(production 경로), 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음";
const V3 =
  "진단 게이트: 열림(production 경로), 상담 화면: 열림, 상담 접수: 닫힘, 시크릿: 설정되지 않음";
const V4 = "진단 게이트: 열림(production 경로), 상담 화면: 열림, 상담 접수: 열림, 시크릿: 설정됨";
// 순서에 없는 벡터(review 경로는 운영 호스트에서 쓰지 않는 경로다).
const V_OUT =
  "진단 게이트: 열림(review 경로), 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음";

const ORDER_HEADER = `| ${ORDER_COLUMNS.join(" | ")} |`;
const ORDER_SEPARATOR = `|${ORDER_COLUMNS.map(() => "---").join("|")}|`;

function orderRow(n: number, vector: string, basis = "근거-예시"): string {
  return `| ${n} | ${vector} | ${basis} |`;
}

function orderTable(...rows: string[]): string {
  return ["앞 문단", "", ORDER_HEADER, ORDER_SEPARATOR, ...rows, "", "뒤 문단"].join("\n");
}

const ORDER = orderTable(orderRow(1, V1), orderRow(2, V2), orderRow(3, V3), orderRow(4, V4));

const STEP_HEADER = `| ${STEP_COLUMNS.join(" | ")} |`;
const STEP_SEPARATOR = `|${STEP_COLUMNS.map(() => "---").join("|")}|`;

type Cells = Partial<Record<(typeof STEP_COLUMNS)[number], string>>;

function stepRow(step: number, before: string, after: string, cells: Cells = {}): string {
  const merged: Record<string, string> = {
    단계: String(step),
    "대상 환경": "운영 호스트",
    "설정 변수": "ENABLE_DIAGNOSIS_FLOW=true",
    "재시작 횟수": "1",
    "전 벡터": before,
    "후 벡터": after,
    ...cells,
  };
  return `| ${STEP_COLUMNS.map((column) => merged[column]).join(" | ")} |`;
}

function stepTable(...rows: string[]): string {
  return ["절차", "", STEP_HEADER, STEP_SEPARATOR, ...rows].join("\n");
}

const OPEN_DIAGNOSIS = "ENABLE_DIAGNOSIS_FLOW=true, DIAGNOSIS_ENGINE_READY=true";
const OPEN_SCREEN = "ENABLE_CONSULT_FLOW=true";
const OPEN_INTAKE = "CONSULT_POLICY_READY=true, RATE_LIMIT_HMAC_SECRET=설정됨";

// AC-B2CLAUNCH-011의 fixture 네 가지.
// (가) 각 전환이 순서의 인접한 두 벡터 사이이고 재시작 한 번
const FIXTURE_A = stepTable(
  stepRow(1, V1, V2, { "설정 변수": OPEN_DIAGNOSIS }),
  stepRow(2, V2, V3, { "설정 변수": OPEN_SCREEN }),
  stepRow(3, V3, V4, { "설정 변수": OPEN_INTAKE })
);
// (나) 순서에 없는 벡터를 거침
const FIXTURE_B = stepTable(
  stepRow(1, V1, V2, { "설정 변수": OPEN_DIAGNOSIS }),
  stepRow(2, V2, V_OUT, { "설정 변수": OPEN_SCREEN }),
  stepRow(3, V3, V4, { "설정 변수": OPEN_INTAKE })
);
// (다) 한 전환이 재시작 둘을 요구함
const FIXTURE_C = stepTable(
  stepRow(1, V1, V2, { "설정 변수": OPEN_DIAGNOSIS }),
  stepRow(2, V2, V3, { "설정 변수": OPEN_SCREEN, "재시작 횟수": "2" }),
  stepRow(3, V3, V4, { "설정 변수": OPEN_INTAKE })
);
// (라) 전환 단계가 전 벡터와 후 벡터를 적지 않음
const FIXTURE_D = stepTable(
  stepRow(1, V1, V2, { "설정 변수": OPEN_DIAGNOSIS }),
  stepRow(2, "", "", { "설정 변수": OPEN_SCREEN }),
  stepRow(3, V3, V4, { "설정 변수": OPEN_INTAKE })
);

function check(steps: string, order: string | null = ORDER) {
  return checkTransitionsFromMarkdown({ stepsMarkdown: steps, orderMarkdown: order ?? undefined });
}

function violationNumbers(output: string): string | undefined {
  return output.match(/^위반한 전환 번호: (.+)$/m)?.[1];
}

describe("AC-B2CLAUNCH-011 — 전환 목록 fixture 네 가지", () => {
  it("(가) 인접한 두 벡터 사이이고 재시작 한 번이면 통과한다", () => {
    const result = check(FIXTURE_A);
    expect(result.status).toBe("PASS");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("판정: 통과");
    expect(violationNumbers(result.output)).toBeUndefined();
  });

  it("(나) 순서에 없는 벡터를 거치면 거부하고 위반한 전환 번호를 출력한다", () => {
    const result = check(FIXTURE_B);
    expect(result.status).toBe("REJECT");
    expect(result.exitCode).toBe(1);
    expect(violationNumbers(result.output)).toBe("2");
    expect(result.output).toContain("단계 2: 거부 — 후 벡터가 순서에 기록된 벡터가 아니다");
  });

  it("(다) 한 전환이 재시작 둘을 요구하면 거부하고 위반한 전환 번호를 출력한다", () => {
    const result = check(FIXTURE_C);
    expect(result.status).toBe("REJECT");
    expect(result.exitCode).toBe(1);
    expect(violationNumbers(result.output)).toBe("2");
    expect(result.output).toContain("단계 2: 거부 — 재시작 횟수가 1이 아니다");
  });

  it("(라) 전 벡터와 후 벡터를 적지 않으면 거부하고 위반한 전환 번호를 출력한다", () => {
    const result = check(FIXTURE_D);
    expect(result.status).toBe("REJECT");
    expect(result.exitCode).toBe(1);
    expect(violationNumbers(result.output)).toBe("2");
    expect(result.output).toContain("단계 2: 거부 — 전 벡터를 적지 않았다");
    expect(result.output).toContain("후 벡터를 적지 않았다");
  });

  it("네 fixture 가운데 통과는 (가) 하나뿐이다", () => {
    const exitCodes = [FIXTURE_A, FIXTURE_B, FIXTURE_C, FIXTURE_D].map((f) => check(f).exitCode);
    expect(exitCodes).toEqual([0, 1, 1, 1]);
  });

  it("(나)(다)(라)가 한 절차에 함께 있으면 위반한 전환 번호를 모두 낸다", () => {
    const result = check(
      stepTable(
        stepRow(1, V1, V_OUT),
        stepRow(2, V2, V3, { "재시작 횟수": "2" }),
        stepRow(3, "", "")
      )
    );
    expect(violationNumbers(result.output)).toBe("1, 2, 3");
  });
});

describe("순서가 기록되지 않았으면 BLOCKED이고 통과가 아니다", () => {
  it("순서 입력이 없으면 (가) fixture도 BLOCKED이다", () => {
    const result = check(FIXTURE_A, null);
    expect(result.status).toBe("BLOCKED");
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("판정: BLOCKED");
    expect(result.output).toContain("노출 순서가 기록되지 않았다");
  });

  it("순서 표가 없는 문서, 행이 없는 표, 결정 대기 행뿐인 표도 순서 없음이다", () => {
    for (const order of [
      "순서 표가 없는 문서",
      orderTable(),
      orderTable(orderRow(1, PENDING_MARK, "결정 기록 없음")),
    ]) {
      const result = check(FIXTURE_A, order);
      expect(result.status, order).toBe("BLOCKED");
      expect(result.exitCode).toBe(3);
    }
  });
});

describe("전환 규칙 세부", () => {
  it("순서에서 인접하지 않은 두 벡터 사이(기록된 벡터를 건너뜀)는 거부한다", () => {
    const result = check(stepTable(stepRow(1, V1, V3)));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("단계 1: 거부 — 순서의 인접한 두 벡터 사이가 아니다");
  });

  it("전 벡터와 후 벡터가 같으면 전환이 아니라서 거부한다", () => {
    const result = check(stepTable(stepRow(1, V2, V2)));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("단계 1: 거부 — 전 벡터와 후 벡터가 같다");
  });

  it("전 벡터가 순서에 없어도 거부한다", () => {
    const result = check(stepTable(stepRow(1, V_OUT, V2)));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("단계 1: 거부 — 전 벡터가 순서에 기록된 벡터가 아니다");
  });

  it("재시작이 0번이어도 한 번이 아니므로 거부한다", () => {
    const result = check(stepTable(stepRow(1, V1, V2, { "재시작 횟수": "0" })));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("단계 1: 거부 — 재시작 횟수가 1이 아니다");
  });

  it("두 벡터 사이가 순서의 인접한 쪽이면 방향과 무관하게 통과한다(적힌 대로 '사이'만 본다)", () => {
    expect(check(stepTable(stepRow(1, V2, V1))).exitCode).toBe(0);
  });

  it("한 단계의 위반은 그 단계만 위반으로 적는다", () => {
    const result = check(stepTable(stepRow(1, V1, V2), stepRow(2, V2, V_OUT)));
    expect(result.output).toContain("단계 1: 통과");
    expect(violationNumbers(result.output)).toBe("2");
  });
});

describe("결정 대기 벡터와 순서 안의 결정 대기 항목", () => {
  it("단계의 전·후 벡터가 결정 대기이면 BLOCKED이고 통과가 아니다", () => {
    const result = check(
      stepTable(
        stepRow(1, V1, V2),
        stepRow(2, PENDING_MARK, PENDING_MARK, { "설정 변수": OPEN_INTAKE })
      )
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("단계 1: 통과");
    expect(result.output).toContain("단계 2: BLOCKED — 전 벡터가 결정 대기다");
    expect(result.output).toContain("BLOCKED 전환 번호: 2");
    expect(result.output).toContain("판정: BLOCKED");
  });

  it("확정된 위반이 있으면 BLOCKED보다 거부가 앞선다", () => {
    const result = check(
      stepTable(
        stepRow(1, V1, V_OUT),
        stepRow(2, PENDING_MARK, PENDING_MARK, { "설정 변수": OPEN_INTAKE })
      )
    );
    expect(result.status).toBe("REJECT");
    expect(result.exitCode).toBe(1);
  });

  it("순서의 두 벡터 사이에 결정 대기 항목이 있으면 인접 여부를 판정하지 못해 BLOCKED이다", () => {
    const order = orderTable(
      orderRow(1, V1),
      orderRow(2, PENDING_MARK, "결정 기록 없음"),
      orderRow(3, V3)
    );
    const result = check(stepTable(stepRow(1, V1, V3)), order);
    expect(result.status).toBe("BLOCKED");
    expect(result.output).toContain("순서의 사이 항목이 결정 대기라 인접 여부를 판정할 수 없다");
  });

  it("순서 끝의 결정 대기 항목은 기록된 두 벡터 사이의 전환을 막지 않는다", () => {
    const order = orderTable(orderRow(1, V1), orderRow(2, V2), orderRow(3, PENDING_MARK, "없음"));
    expect(check(stepTable(stepRow(1, V1, V2)), order).exitCode).toBe(0);
  });
});

describe("시크릿 설정은 CONSULT_POLICY_READY=true와 같은 재시작 단계 안에 있다", () => {
  it("P를 true로 켜면서 시크릿을 설정하지 않으면 거부한다", () => {
    const result = check(
      stepTable(stepRow(1, V3, V4, { "설정 변수": "CONSULT_POLICY_READY=true" }))
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(
      "단계 1: 거부 — 시크릿 설정과 CONSULT_POLICY_READY=true 설정이 같은 단계에 있지 않다"
    );
  });

  it("시크릿만 따로 설정하는 단계도 거부한다", () => {
    const result = check(
      stepTable(stepRow(1, V3, V4, { "설정 변수": "RATE_LIMIT_HMAC_SECRET=설정됨" }))
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("같은 단계에 있지 않다");
  });

  it("같은 단계에 함께 있으면 통과하고, 둘 다 없는 단계는 이 규칙과 무관하다", () => {
    expect(check(stepTable(stepRow(1, V3, V4, { "설정 변수": OPEN_INTAKE }))).exitCode).toBe(0);
    expect(check(stepTable(stepRow(1, V1, V2))).exitCode).toBe(0);
  });

  it("CONSULT_POLICY_READY를 false로 두는 단계에 시크릿이 없어도 위반이 아니다", () => {
    expect(
      check(stepTable(stepRow(1, V2, V1, { "설정 변수": "CONSULT_POLICY_READY=false" }))).exitCode
    ).toBe(0);
  });
});

describe("입력 거부(종료 코드 2)와 값 비출력", () => {
  it("단계 표 오류는 입력 거부이고 단계 표 오류 줄을 낸다", () => {
    const result = check("단계 표 없는 문서");
    expect(result.status).toBe("INPUT_ERROR");
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("단계 표 오류:");
  });

  it("순서 표 오류(어휘 밖 벡터·순번·중복·빈 근거·허용 칸 밖의 칸)는 입력 거부이다", () => {
    const cases: [string, string][] = [
      [orderTable(orderRow(1, "어휘 밖 벡터-예시")), '순번 1의 "게이트 상태 벡터" 칸'],
      [orderTable(orderRow(2, V1)), "순번이 1부터 차례로 이어지지 않는다"],
      [orderTable(orderRow(1, V1), orderRow(2, V1)), "같은 벡터가 두 번 나온다"],
      [orderTable(orderRow(1, V1, "")), '순번 1의 "근거" 칸이 비어 있다'],
      [ORDER.replace(ORDER_HEADER, ORDER_HEADER.replace(/ \|$/, " | 담당자 |")), "담당자"],
    ];
    for (const [order, expected] of cases) {
      const result = check(FIXTURE_A, order);
      expect(result.exitCode, expected).toBe(2);
      expect(result.status).toBe("INPUT_ERROR");
      expect(result.output, expected).toContain(expected);
      expect(result.output).toContain("노출 순서 표 오류:");
    }
  });

  it("출력은 칸의 값을 되풀이하지 않는다", () => {
    const result = check(FIXTURE_B, orderTable(orderRow(1, V1, "ZZ-근거-예시"), orderRow(2, V2)));
    expect(result.output).not.toContain("ZZ-근거-예시");
    expect(result.output).not.toContain("production 경로");
  });
});

describe("parseExposureOrder", () => {
  it("벡터와 결정 대기 항목을 순서대로 읽고 근거를 보관한다", () => {
    const result = parseExposureOrder(
      orderTable(orderRow(1, V1, "근거-가"), orderRow(2, PENDING_MARK, "근거-나"))
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.kind)).toEqual(["vector", "pending"]);
    expect(result.entries.map((e) => e.basis)).toEqual(["근거-가", "근거-나"]);
  });

  it("표가 없으면 오류가 아니라 순서 없음(빈 목록)이다", () => {
    expect(parseExposureOrder("표 없음")).toEqual({ ok: true, entries: [] });
  });

  it("칸 수가 다른 행과 순번이 숫자가 아닌 행은 거부한다", () => {
    const short = parseExposureOrder(orderTable("| 1 | 칸 둘 |"));
    expect(short.ok).toBe(false);
    const bad = parseExposureOrder(orderTable(orderRow(1, V1).replace("| 1 |", "| 가 |")));
    expect(bad.ok).toBe(false);
  });
});

describe("checkTransitions — 파싱을 마친 입력", () => {
  function stepsOf(markdown: string): ProcedureStep[] {
    const parsed = parseProcedureSteps(markdown);
    expect(parsed.ok, parsed.ok ? "" : parsed.errors.join("\n")).toBe(true);
    return parsed.ok ? parsed.steps : [];
  }

  function orderOf(markdown: string): OrderEntry[] {
    const parsed = parseExposureOrder(markdown);
    expect(parsed.ok, parsed.ok ? "" : parsed.errors.join("\n")).toBe(true);
    return parsed.ok ? parsed.entries : [];
  }

  it("입력을 바꾸지 않고 판정한다", () => {
    const steps = stepsOf(FIXTURE_B);
    const order = orderOf(ORDER);
    const before = JSON.stringify({ steps, order });
    const result = checkTransitions({ steps, order });
    expect(result.status).toBe("REJECT");
    expect(result.violations.map((v) => v.step)).toEqual([2]);
    expect(JSON.stringify({ steps, order })).toBe(before);
  });

  it("순서가 비어 있으면 단계를 보지 않고 BLOCKED이다", () => {
    const result = checkTransitions({ steps: stepsOf(FIXTURE_D), order: [] });
    expect(result.status).toBe("BLOCKED");
    expect(result.violations).toEqual([]);
  });
});
