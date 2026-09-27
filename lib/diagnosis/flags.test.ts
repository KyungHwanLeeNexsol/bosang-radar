import { describe, expect, it } from "vitest";
import { computeConsultFlags, computeDiagnosisFlags } from "./flags";

// SPEC-B2C-RESULT-001 M3 (REQ-B2CRESULT-012) — computeDiagnosisFlags 단위
// 테스트. app/page.test.tsx의 "플래그 기반 shouldRenderDiagnosis 5행 동작
// 행렬" describe 블록과 동일한 판정 로직을 순수 함수 수준에서 검증한다 —
// env는 process.env가 아니라 일반 객체로 전달해 Next.js 의존성 없이
// 테스트한다(design.md §19.1a).

describe("computeDiagnosisFlags — shouldRenderDiagnosis 5행 동작 행렬(REQ-B2CRESULT-012)", () => {
  it.each([
    {
      flow: undefined,
      engine: undefined,
      devStates: undefined,
      expected: false,
      label: "false/false/false → placeholder",
    },
    {
      flow: "true" as const,
      engine: undefined,
      devStates: undefined,
      expected: false,
      label: "true/false/false → placeholder",
    },
    {
      flow: undefined,
      engine: "true" as const,
      devStates: undefined,
      expected: false,
      label: "false/true/false → placeholder",
    },
    {
      flow: "true" as const,
      engine: "true" as const,
      devStates: undefined,
      expected: true,
      label: "true/true/false → productionReady",
    },
    {
      flow: undefined,
      engine: undefined,
      devStates: "true" as const,
      expected: true,
      label: "false/false/true → reviewEnabled",
    },
  ])("$label", ({ flow, engine, devStates, expected }) => {
    const flags = computeDiagnosisFlags({
      ENABLE_DIAGNOSIS_FLOW: flow,
      DIAGNOSIS_ENGINE_READY: engine,
      ENABLE_DIAGNOSIS_DEV_STATES: devStates,
    });

    expect(flags.shouldRenderDiagnosis).toBe(expected);
  });
});

describe("computeDiagnosisFlags — productionReady", () => {
  it('ENABLE_DIAGNOSIS_FLOW와 DIAGNOSIS_ENGINE_READY가 모두 "true"일 때만 참이다', () => {
    expect(
      computeDiagnosisFlags({ ENABLE_DIAGNOSIS_FLOW: "true", DIAGNOSIS_ENGINE_READY: "true" })
        .productionReady
    ).toBe(true);
  });

  it('하나만 "true"이면 거짓이다(AND 결합)', () => {
    expect(
      computeDiagnosisFlags({ ENABLE_DIAGNOSIS_FLOW: "true", DIAGNOSIS_ENGINE_READY: undefined })
        .productionReady
    ).toBe(false);
    expect(
      computeDiagnosisFlags({ ENABLE_DIAGNOSIS_FLOW: undefined, DIAGNOSIS_ENGINE_READY: "true" })
        .productionReady
    ).toBe(false);
  });

  it("둘 다 unset이면 거짓이다", () => {
    expect(computeDiagnosisFlags({}).productionReady).toBe(false);
  });
});

describe("computeDiagnosisFlags — reviewEnabled", () => {
  it('ENABLE_DIAGNOSIS_DEV_STATES가 "true"일 때만 참이다', () => {
    expect(computeDiagnosisFlags({ ENABLE_DIAGNOSIS_DEV_STATES: "true" }).reviewEnabled).toBe(true);
  });

  it("unset이면 거짓이다", () => {
    expect(computeDiagnosisFlags({}).reviewEnabled).toBe(false);
  });
});

describe('computeDiagnosisFlags — "true" 문자열만 참으로 취급(design.md §19.1a)', () => {
  it('"1"·"yes" 등 다른 truthy 문자열은 거짓으로 취급한다', () => {
    expect(
      computeDiagnosisFlags({ ENABLE_DIAGNOSIS_FLOW: "1", DIAGNOSIS_ENGINE_READY: "yes" })
        .productionReady
    ).toBe(false);
    expect(computeDiagnosisFlags({ ENABLE_DIAGNOSIS_DEV_STATES: "1" }).reviewEnabled).toBe(false);
  });
});

describe("computeDiagnosisFlags — shouldRenderDiagnosis OR 결합", () => {
  it("productionReady와 reviewEnabled가 모두 참이어도 shouldRenderDiagnosis는 참이다", () => {
    const flags = computeDiagnosisFlags({
      ENABLE_DIAGNOSIS_FLOW: "true",
      DIAGNOSIS_ENGINE_READY: "true",
      ENABLE_DIAGNOSIS_DEV_STATES: "true",
    });
    expect(flags.productionReady).toBe(true);
    expect(flags.reviewEnabled).toBe(true);
    expect(flags.shouldRenderDiagnosis).toBe(true);
  });
});

// SPEC-B2C-CONSULT-001 M3 (design.md §4, REQ-B2CCONSULT-005/018) —
// computeConsultFlags 단위 테스트. shouldRenderConsult/isPolicyReady는
// 서로 독립적인 두 플래그이므로(REQ-B2CCONSULT-005), 한쪽이 다른 쪽에
// 의존하지 않는다는 것을 4가지 조합 모두로 검증한다.
describe("computeConsultFlags — 두 플래그의 독립성(REQ-B2CCONSULT-005)", () => {
  it.each([
    {
      flow: undefined,
      policy: undefined,
      expectedRender: false,
      expectedPolicy: false,
      label: "false/false",
    },
    {
      flow: "true" as const,
      policy: undefined,
      expectedRender: true,
      expectedPolicy: false,
      label: "true/false — 03 화면은 노출되지만 실제 제출은 불가",
    },
    {
      flow: undefined,
      policy: "true" as const,
      expectedRender: false,
      expectedPolicy: true,
      label: "false/true — 정책은 준비됐지만 03 화면 자체가 비노출",
    },
    {
      flow: "true" as const,
      policy: "true" as const,
      expectedRender: true,
      expectedPolicy: true,
      label: "true/true — 03 화면 노출 + 실제 제출 가능",
    },
  ])("$label", ({ flow, policy, expectedRender, expectedPolicy }) => {
    const flags = computeConsultFlags({
      ENABLE_CONSULT_FLOW: flow,
      CONSULT_POLICY_READY: policy,
    });

    expect(flags.shouldRenderConsult).toBe(expectedRender);
    expect(flags.isPolicyReady).toBe(expectedPolicy);
  });
});

describe('computeConsultFlags — "true" 문자열만 참으로 취급', () => {
  it('"1"·"yes" 등 다른 truthy 문자열은 거짓으로 취급한다', () => {
    const flags = computeConsultFlags({ ENABLE_CONSULT_FLOW: "1", CONSULT_POLICY_READY: "yes" });
    expect(flags.shouldRenderConsult).toBe(false);
    expect(flags.isPolicyReady).toBe(false);
  });
});

describe("computeConsultFlags — 02의 shouldRenderDiagnosis와 무관하게 독립적이다", () => {
  it("ENABLE_CONSULT_FLOW만으로 shouldRenderConsult가 결정된다(02 게이트를 참조하지 않는다)", () => {
    const flags = computeConsultFlags({
      ENABLE_DIAGNOSIS_FLOW: undefined,
      DIAGNOSIS_ENGINE_READY: undefined,
      ENABLE_DIAGNOSIS_DEV_STATES: undefined,
      ENABLE_CONSULT_FLOW: "true",
    });
    expect(flags.shouldRenderConsult).toBe(true);
  });
});
