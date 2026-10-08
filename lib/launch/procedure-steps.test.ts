import { describe, expect, it } from "vitest";

import {
  FLAG_VARIABLES,
  PENDING_MARK,
  SECRET_MARK,
  SECRET_VARIABLE,
  STEP_COLUMNS,
  STEP_ENVIRONMENTS,
  parseGateVector,
  parseProcedureSteps,
  vectorKey,
} from "./procedure-steps";

// SPEC-B2C-LAUNCH-001 M3b (REQ-B2CLAUNCH-011·012) — 플래그 변경 절차 단계 모델 시험.
// 모든 값은 눈에 띄게 합성한 것이다. 오류 출력은 단계 번호와 칸 이름만 적고 칸의 값은 되풀이하지 않는다
// (값이 비밀 값·연락처가 아니어야 한다는 REQ-B2CLAUNCH-007을 점검 출력에서도 지키기 위해서다).

const HEADER = `| ${STEP_COLUMNS.join(" | ")} |`;
const SEPARATOR = `|${STEP_COLUMNS.map(() => "---").join("|")}|`;

const V_DARK = "진단 게이트: 닫힘, 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음";
const V_DIAG_OPEN =
  "진단 게이트: 열림(production 경로), 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음";

type Cells = Partial<Record<(typeof STEP_COLUMNS)[number], string>>;

function row(step: number, cells: Cells = {}): string {
  const merged: Record<string, string> = {
    단계: String(step),
    "대상 환경": "운영 호스트",
    "설정 변수": "ENABLE_DIAGNOSIS_FLOW=true",
    "재시작 횟수": "1",
    "전 벡터": V_DARK,
    "후 벡터": V_DIAG_OPEN,
    ...cells,
  };
  return `| ${STEP_COLUMNS.map((column) => merged[column]).join(" | ")} |`;
}

function table(...rows: string[]): string {
  return ["앞 문단", "", HEADER, SEPARATOR, ...rows, "", "뒤 문단"].join("\n");
}

function errorsOf(markdown: string): string[] {
  const result = parseProcedureSteps(markdown);
  expect(result.ok, "표 오류가 있어야 한다").toBe(false);
  return result.ok ? [] : result.errors;
}

describe("parseGateVector — spec.md §2.3의 벡터 어휘", () => {
  it("네 칸(진단 게이트·상담 화면·상담 접수·시크릿)을 모두 적은 벡터를 읽고 같은 글로 되돌린다", () => {
    for (const text of [
      V_DARK,
      V_DIAG_OPEN,
      "진단 게이트: 열림(review 경로), 상담 화면: 열림, 상담 접수: 열림, 시크릿: 설정됨",
      "진단 게이트: 열림(둘 다), 상담 화면: 닫힘, 상담 접수: 열림, 시크릿: 설정됨",
    ]) {
      const vector = parseGateVector(text);
      expect(vector, "벡터로 읽혀야 한다").not.toBeNull();
      expect(vector === null ? "" : vectorKey(vector)).toBe(text);
    }
  });

  it("어휘 밖이거나 칸이 빠졌거나 순서가 다르면 벡터가 아니다", () => {
    for (const text of [
      "",
      "진단 게이트: 닫힘, 상담 화면: 닫힘, 상담 접수: 닫힘",
      "진단 게이트: 열림, 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음",
      "상담 화면: 닫힘, 진단 게이트: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음",
      "진단 게이트: 닫힘, 상담 화면: 열림(production 경로), 상담 접수: 닫힘, 시크릿: 설정되지 않음",
      "진단 게이트: 닫힘, 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음, 덧붙임",
      PENDING_MARK,
    ]) {
      expect(parseGateVector(text), `"${text}"`).toBeNull();
    }
  });
});

describe("parseProcedureSteps — 올바른 표", () => {
  it("단계·대상 환경·설정 변수·재시작 횟수·전후 벡터를 읽는다", () => {
    const result = parseProcedureSteps(
      table(
        row(1, { "설정 변수": "ENABLE_DIAGNOSIS_FLOW=true, DIAGNOSIS_ENGINE_READY=true" }),
        row(2, {
          "대상 환경": "별도 환경",
          "설정 변수": `CONSULT_POLICY_READY=true, ${SECRET_VARIABLE}=${SECRET_MARK}`,
          "재시작 횟수": "2",
        }),
        row(3, { "대상 환경": "로컬", "전 벡터": PENDING_MARK, "후 벡터": "" })
      )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.steps.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(result.steps.map((s) => s.environment)).toEqual(["운영 호스트", "별도 환경", "로컬"]);
    expect(result.steps[0].variables).toEqual([
      { name: "ENABLE_DIAGNOSIS_FLOW", value: "true" },
      { name: "DIAGNOSIS_ENGINE_READY", value: "true" },
    ]);
    expect(result.steps[1].variables).toEqual([
      { name: "CONSULT_POLICY_READY", value: "true" },
      { name: SECRET_VARIABLE, value: SECRET_MARK },
    ]);
    expect(result.steps.map((s) => s.restarts)).toEqual([1, 2, 1]);
    expect(result.steps[0].before.kind).toBe("vector");
    expect(result.steps[2].before.kind).toBe("pending");
    // 비어 있는 칸은 "적지 않음"이다 — 점검기가 거부해야 하므로 표 읽기에서는 오류가 아니다.
    expect(result.steps[2].after.kind).toBe("unstated");
  });

  it("벡터 어휘로 읽히지 않는 비어 있지 않은 칸도 적지 않은 것으로 본다", () => {
    const result = parseProcedureSteps(table(row(1, { "전 벡터": "열림", "후 벡터": "닫힘" })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].before.kind).toBe("unstated");
    expect(result.steps[0].after.kind).toBe("unstated");
  });

  it("재시작 횟수 0도 정수로 읽고 CRLF 문서도 읽는다", () => {
    const result = parseProcedureSteps(
      table(row(1, { "재시작 횟수": "0" })).replace(/\n/g, "\r\n")
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.steps[0].restarts).toBe(0);
  });

  it("허용 어휘를 내보낸다: 대상 환경 셋, 플래그 변수 다섯, 시크릿 변수 하나", () => {
    expect([...STEP_ENVIRONMENTS]).toEqual(["운영 호스트", "별도 환경", "로컬"]);
    expect([...FLAG_VARIABLES].sort()).toEqual([
      "CONSULT_POLICY_READY",
      "DIAGNOSIS_ENGINE_READY",
      "ENABLE_CONSULT_FLOW",
      "ENABLE_DIAGNOSIS_DEV_STATES",
      "ENABLE_DIAGNOSIS_FLOW",
    ]);
    expect(SECRET_VARIABLE).toBe("RATE_LIMIT_HMAC_SECRET");
  });
});

describe("parseProcedureSteps — 표 오류는 단계 번호와 칸 이름으로만 적는다", () => {
  it("표를 찾지 못하면 헤더를 적어 거부한다", () => {
    const errors = errorsOf("표가 없는 문서");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(STEP_COLUMNS.join("·"));
  });

  it("단계가 하나도 없는 표는 거부한다(점검할 것이 없는 절차를 통과로 읽지 않는다)", () => {
    const errors = errorsOf(table());
    expect(errors.join("\n")).toContain("단계가 하나도 없다");
  });

  it("허용 칸 밖의 칸은 칸 이름만 적고 거부한다", () => {
    const text = [
      HEADER.replace(/ \|$/, " | 담당자 연락처 |"),
      `${SEPARATOR}---|`,
      `${row(1)} 칸값-예시 |`,
    ].join("\n");
    const errors = errorsOf(text);
    expect(errors.join("\n")).toContain("담당자 연락처");
    expect(errors.join("\n")).not.toContain("칸값-예시");
  });

  it("칸 수가 다른 행은 단계 번호를 적고 거부한다", () => {
    const errors = errorsOf(table(`| 7 | 운영 호스트 | ENABLE_DIAGNOSIS_FLOW=true |`));
    expect(errors.join("\n")).toContain("행의 칸이 3개다(6개여야 한다)");
  });

  it("단계 번호가 양의 정수가 아니거나 겹치면 거부한다", () => {
    const bad = errorsOf(table(row(1), row(1, { 단계: "0" }), row(1, { 단계: "가" })));
    expect(bad.join("\n")).toContain('"단계" 칸이 양의 정수가 아니다');

    const duplicate = errorsOf(table(row(1), row(1)));
    expect(duplicate.join("\n")).toContain("단계 1이 2번 나온다");
  });

  it("대상 환경이 열거 밖이면 단계 번호와 칸 이름만 적고 값은 적지 않는다", () => {
    const errors = errorsOf(table(row(1, { "대상 환경": "ZZ-환경-예시" })));
    const text = errors.join("\n");
    expect(text).toContain('단계 1의 "대상 환경" 칸이 운영 호스트·별도 환경·로컬 중 하나가 아니다');
    expect(text).not.toContain("ZZ-환경-예시");
  });

  it("설정 변수 칸 오류: 빈 칸, 이름 없는 토큰, 알 수 없는 변수, 중복, 열거 밖 플래그 값", () => {
    const empty = errorsOf(table(row(1, { "설정 변수": "" }))).join("\n");
    expect(empty).toContain('단계 1의 "설정 변수" 칸이 비어 있다');

    const noEquals = errorsOf(table(row(1, { "설정 변수": "ENABLE_DIAGNOSIS_FLOW" }))).join("\n");
    expect(noEquals).toContain('단계 1의 "설정 변수" 칸의 항목이 이름=값 형태가 아니다');

    const unknown = errorsOf(table(row(1, { "설정 변수": "ZZ_OTHER_NAME=true" }))).join("\n");
    expect(unknown).toContain('단계 1의 "설정 변수" 칸에 허용되지 않는 변수 이름이 있다');
    expect(unknown).not.toContain("ZZ_OTHER_NAME");

    const duplicate = errorsOf(
      table(row(1, { "설정 변수": "ENABLE_CONSULT_FLOW=true, ENABLE_CONSULT_FLOW=false" }))
    ).join("\n");
    expect(duplicate).toContain('단계 1의 "설정 변수" 칸에 같은 변수가 두 번 나온다');

    // 게이트는 정확히 "true"만 켜짐으로 읽으므로 TRUE·1 같은 값은 절차에 쓰지 않는다(입력 거부).
    for (const value of ["TRUE", "1", "yes", ""]) {
      const errors = errorsOf(table(row(1, { "설정 변수": `ENABLE_CONSULT_FLOW=${value}` }))).join(
        "\n"
      );
      expect(errors).toContain('단계 1의 "설정 변수" 칸의 플래그 값이 true·false 중 하나가 아니다');
    }
  });

  it("시크릿 변수의 값이 설정됨 표지가 아니면 거부하고 그 값을 되풀이하지 않는다", () => {
    const errors = errorsOf(
      table(row(1, { "설정 변수": `${SECRET_VARIABLE}=ZZ-합성-시크릿-값` }))
    ).join("\n");
    expect(errors).toContain('단계 1의 "설정 변수" 칸에서 시크릿 값은 적지 않는다');
    expect(errors).not.toContain("ZZ-합성-시크릿-값");
  });

  it("재시작 횟수가 음이 아닌 정수가 아니면 거부한다", () => {
    for (const value of ["", "한 번", "-1", "1.5", "01x"]) {
      const errors = errorsOf(table(row(1, { "재시작 횟수": value }))).join("\n");
      expect(errors).toContain('단계 1의 "재시작 횟수" 칸이 음이 아닌 정수가 아니다');
    }
  });

  it("유효한 단계와 오류 단계가 섞이면 오류만 모아 거부한다", () => {
    const errors = errorsOf(
      table(row(1), row(2, { "대상 환경": "ZZ" }), row(3, { "재시작 횟수": "x" }))
    );
    expect(errors).toHaveLength(2);
  });
});
