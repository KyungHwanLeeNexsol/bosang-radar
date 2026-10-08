// SPEC-B2C-LAUNCH-001 M3b: 엔진 준비 변수 설정 단계 점검 (REQ-B2CLAUNCH-012, AC-B2CLAUNCH-012).
//
// R-02(ENGINE-001 엔진 준비 증거 참조)가 `READY`가 아닌 동안 운영 호스트에서 엔진 준비 변수를 `true`로
// 설정하는 단계를 거부한다. 복합 단계(다른 변수와 함께 한 재시작에 설정)도 같다. 운영 호스트가 아닌 환경
// (별도 환경·로컬)의 단계는 이 요구사항이 막지 않는다 — 그쪽의 제약은 DIAGNOSIS-001 REQ-B2CDIAG-025의
// 문구가 다룬다. R-02의 상태는 입력이다: READY가 아닌 모든 값과 입력 없음은 READY로 읽지 않는다(fail-closed).
//
// R-02의 실제 판정은 ENGINE-001 증거 기록의 형식과 상태 소스가 정해지기 전이라 BLOCKED다. 이 모듈은 그 소스를
// 지어내지 않으며 상태 입력이 없을 때 출력이 그렇게 적는다.

import type { ProcedureStep } from "./procedure-steps";

const ENGINE_READY_VARIABLE = "DIAGNOSIS_ENGINE_READY";
const PRODUCTION_HOST = "운영 호스트";

export interface EngineReadyViolation {
  step: number;
  message: string;
}

export interface EngineReadyResult {
  ok: boolean;
  violations: EngineReadyViolation[];
  output: string;
}

export function evaluateEngineReadySteps(
  steps: readonly ProcedureStep[],
  r02Status: string | undefined
): EngineReadyResult {
  const r02Ready = r02Status === "READY";
  const violations: EngineReadyViolation[] = [];
  const lines: string[] = [];

  for (const step of steps) {
    const setsReadyTrue =
      step.environment === PRODUCTION_HOST &&
      step.variables.some(
        (variable) => variable.name === ENGINE_READY_VARIABLE && variable.value === "true"
      );
    if (setsReadyTrue && !r02Ready) {
      const message = `이 단계가 운영 호스트에서 ${ENGINE_READY_VARIABLE}를 참으로 설정한다 — R-02가 READY가 아니다`;
      violations.push({ step: step.step, message });
      lines.push(`단계 ${step.step}: 거부 — ${message}`);
    } else {
      lines.push(`단계 ${step.step}: 통과`);
    }
  }

  if (violations.length > 0) {
    lines.push(`위반한 단계 번호: ${violations.map((violation) => violation.step).join(", ")}`);
  }
  if (r02Status === undefined) {
    lines.push(
      "R-02 실제 판정: BLOCKED — ENGINE-001 증거 기록의 형식이 정해지기 전이라 R-02의 상태 소스가 없다" +
        "(상태 소스를 지어내지 않는다)"
    );
  }
  lines.push(`판정: ${violations.length === 0 ? "통과" : "거부"}`);

  return { ok: violations.length === 0, violations, output: lines.join("\n") };
}
