import { describe, expect, it } from "vitest";

import { evaluateEngineReadySteps } from "./engine-ready-step";
import { STEP_COLUMNS, parseProcedureSteps, type ProcedureStep } from "./procedure-steps";

// SPEC-B2C-LAUNCH-001 M3b (REQ-B2CLAUNCH-012, AC-B2CLAUNCH-012) — DIAGNOSIS_ENGINE_READY 설정 단계 점검 시험.
// R-02(ENGINE-001 엔진 준비 증거 참조)의 상태는 입력이다. 실제 R-02 판정은 ENGINE-001 증거 기록의 형식이
// 정해지기 전이라 BLOCKED이고 이 시험은 그 상태 소스를 지어내지 않는다 — 아래 상태는 fixture가 정한 값이다.

const HEADER = `| ${STEP_COLUMNS.join(" | ")} |`;
const SEPARATOR = `|${STEP_COLUMNS.map(() => "---").join("|")}|`;

const V_DARK = "진단 게이트: 닫힘, 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음";
const V_OPEN =
  "진단 게이트: 열림(production 경로), 상담 화면: 닫힘, 상담 접수: 닫힘, 시크릿: 설정되지 않음";

function row(step: number, environment: string, variables: string, restarts = "1"): string {
  return `| ${step} | ${environment} | ${variables} | ${restarts} | ${V_DARK} | ${V_OPEN} |`;
}

function stepsOf(...rows: string[]): ProcedureStep[] {
  const parsed = parseProcedureSteps(["절차", "", HEADER, SEPARATOR, ...rows].join("\n"));
  expect(parsed.ok, parsed.ok ? "" : parsed.errors.join("\n")).toBe(true);
  return parsed.ok ? parsed.steps : [];
}

const REJECT_LINE = "이 단계가 운영 호스트에서 DIAGNOSIS_ENGINE_READY를 참으로 설정한다";

// AC-B2CLAUNCH-012의 fixture 다섯 가지(시험 안에서 만든다 — 표 읽기 실패가 수집 단계 오류가 되지 않게 한다).
// (가) R-02 UNVERIFIED + 운영 호스트 단계가 엔진 준비 변수를 true로 설정
const stepA = () => stepsOf(row(1, "운영 호스트", "DIAGNOSIS_ENGINE_READY=true"));
// (나) R-02 READY + 같은 단계 — stepA를 R-02만 바꿔 쓴다
// (다) R-02 UNVERIFIED + 운영 호스트 절차가 ENABLE_DIAGNOSIS_FLOW만 설정
const stepC = () => stepsOf(row(1, "운영 호스트", "ENABLE_DIAGNOSIS_FLOW=true"));
// (라) R-02 UNVERIFIED + 한 재시작에 엔진 준비 변수가 다른 변수와 함께 true로 설정되는 복합 단계
const stepD = () =>
  stepsOf(row(1, "운영 호스트", "ENABLE_DIAGNOSIS_FLOW=true, DIAGNOSIS_ENGINE_READY=true"));
// (마) R-02 UNVERIFIED + 운영 호스트가 아닌 별도 환경(D-LAUNCH-01 (a))의 단계가 true로 설정
const stepE = () => stepsOf(row(1, "별도 환경", "DIAGNOSIS_ENGINE_READY=true"));

describe("AC-B2CLAUNCH-012 — 항목·절차 fixture 다섯 가지", () => {
  it("(가) R-02가 UNVERIFIED이고 운영 호스트 단계가 true로 설정하면 거부한다", () => {
    const result = evaluateEngineReadySteps(stepA(), "UNVERIFIED");
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.step)).toEqual([1]);
    expect(result.output).toContain(`단계 1: 거부 — ${REJECT_LINE}`);
    expect(result.output).toContain("판정: 거부");
  });

  it("(나) R-02가 READY이면 같은 단계도 통과한다", () => {
    const result = evaluateEngineReadySteps(stepA(), "READY");
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.output).toContain("단계 1: 통과");
    expect(result.output).toContain("판정: 통과");
  });

  it("(다) R-02가 UNVERIFIED여도 ENABLE_DIAGNOSIS_FLOW만 설정하면 통과한다", () => {
    const result = evaluateEngineReadySteps(stepC(), "UNVERIFIED");
    expect(result.ok).toBe(true);
    expect(result.output).toContain("단계 1: 통과");
  });

  it("(라) 한 재시작에 다른 변수와 함께 true로 설정하는 복합 단계는 거부한다", () => {
    const result = evaluateEngineReadySteps(stepD(), "UNVERIFIED");
    expect(result.ok).toBe(false);
    expect(result.output).toContain(`단계 1: 거부 — ${REJECT_LINE}`);
  });

  it("(마) 운영 호스트가 아닌 별도 환경 단계는 R-02가 UNVERIFIED여도 통과한다", () => {
    const result = evaluateEngineReadySteps(stepE(), "UNVERIFIED");
    expect(result.ok).toBe(true);
    // 별도 환경 쪽의 제약은 이 요구사항이 다루지 않는다(DIAGNOSIS-001 REQ-B2CDIAG-025의 문구가 다룬다).
    expect(result.output).toContain("단계 1: 통과");
  });

  it("다섯 fixture의 기대 결과: (가)(라) 거부, (나)(다)(마) 통과", () => {
    const outcomes = [
      evaluateEngineReadySteps(stepA(), "UNVERIFIED").ok,
      evaluateEngineReadySteps(stepA(), "READY").ok,
      evaluateEngineReadySteps(stepC(), "UNVERIFIED").ok,
      evaluateEngineReadySteps(stepD(), "UNVERIFIED").ok,
      evaluateEngineReadySteps(stepE(), "UNVERIFIED").ok,
    ];
    expect(outcomes).toEqual([false, true, true, false, true]);
  });
});

describe("R-02 상태 입력", () => {
  it("READY가 아닌 모든 값(BLOCKED, 소문자, 알 수 없는 값)은 READY로 읽지 않는다", () => {
    for (const status of ["BLOCKED", "UNVERIFIED", "ready", "ZZ-예시", ""]) {
      const result = evaluateEngineReadySteps(stepA(), status);
      expect(result.ok, status).toBe(false);
      // 알 수 없는 입력 값은 출력에 되풀이하지 않는다.
      expect(result.output).not.toContain("ZZ-예시");
    }
  });

  it("상태 소스가 없으면(R-02 입력 없음) 운영 호스트 true 설정 단계는 거부하고 실제 판정이 BLOCKED임을 출력한다", () => {
    const result = evaluateEngineReadySteps(stepA(), undefined);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("R-02 실제 판정: BLOCKED");
    expect(result.output).toContain("ENGINE-001 증거 기록의 형식");
  });

  it("상태 소스가 없을 때는 해당 단계가 없어도 R-02 실제 판정 BLOCKED 안내를 낸다", () => {
    const result = evaluateEngineReadySteps(stepC(), undefined);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("R-02 실제 판정: BLOCKED");
  });

  it("R-02 입력이 있으면 실제 판정 BLOCKED 안내를 내지 않는다", () => {
    expect(evaluateEngineReadySteps(stepC(), "READY").output).not.toContain("R-02 실제 판정");
  });
});

describe("대상 환경과 변수 값 세부", () => {
  it("로컬 환경 단계는 운영 호스트가 아니라서 통과한다", () => {
    expect(
      evaluateEngineReadySteps(stepsOf(row(1, "로컬", "DIAGNOSIS_ENGINE_READY=true")), "UNVERIFIED")
        .ok
    ).toBe(true);
  });

  it("운영 호스트 단계가 엔진 준비 변수를 false로 두는 것은 true 설정이 아니다", () => {
    expect(
      evaluateEngineReadySteps(
        stepsOf(row(1, "운영 호스트", "DIAGNOSIS_ENGINE_READY=false")),
        "UNVERIFIED"
      ).ok
    ).toBe(true);
  });

  it("여러 단계 중 위반한 단계 번호를 모두 적고 나머지는 통과로 적는다", () => {
    const result = evaluateEngineReadySteps(
      stepsOf(
        row(1, "운영 호스트", "ENABLE_DIAGNOSIS_FLOW=true"),
        row(2, "운영 호스트", "DIAGNOSIS_ENGINE_READY=true"),
        row(3, "별도 환경", "DIAGNOSIS_ENGINE_READY=true"),
        row(4, "운영 호스트", "ENABLE_DIAGNOSIS_FLOW=true, DIAGNOSIS_ENGINE_READY=true")
      ),
      "UNVERIFIED"
    );
    expect(result.violations.map((v) => v.step)).toEqual([2, 4]);
    expect(result.output).toContain("단계 1: 통과");
    expect(result.output).toContain("단계 3: 통과");
    expect(result.output).toMatch(/^위반한 단계 번호: 2, 4$/m);
  });

  it("입력 단계 목록을 바꾸지 않는다", () => {
    const steps = stepD();
    const before = JSON.stringify(steps);
    evaluateEngineReadySteps(steps, "UNVERIFIED");
    expect(JSON.stringify(steps)).toBe(before);
  });
});
