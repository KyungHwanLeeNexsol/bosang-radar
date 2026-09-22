// SPEC-B2C-RESULT-001 M3 (design.md, REQ-B2CRESULT-012) — app/page.tsx와
// app/result/page.tsx가 공유하는 단일 프로덕션 활성화 게이트 계산 헬퍼.
// 두 라우트 어디에도 게이트 계산 로직을 중복 작성하지 않는다
// (REQ-B2CRESULT-012). SPEC-B2C-DIAGNOSIS-001에서 app/page.tsx 로컬 함수로
// 정의됐던 `isFlagEnabled`와 게이트 판정 로직을 이 공유 모듈로 옮긴다
// (동작 변경 없음 — app/page.test.tsx의 5행 동작 행렬이 계속 PASS해야 한다).

export interface DiagnosisFlags {
  productionReady: boolean;
  reviewEnabled: boolean;
  shouldRenderDiagnosis: boolean;
}

// "true" 문자열만 참으로 취급한다 — unset을 포함한 그 외 모든 값은 거짓
// (design.md §19.1a 5행 동작 행렬).
//
// @MX:ANCHOR: [AUTO] 아래 게이트의 세 플래그(productionReady/reviewEnabled/
// shouldRenderDiagnosis)를 모두 이 함수 하나로 판정한다 — 호출부는
// app/page.tsx, app/result/page.tsx 2곳이다(REQ-B2CRESULT-012).
// @MX:REASON: 판정을 느슨하게(예: truthy 검사, "1"·"yes" 허용) 바꾸면 두
// 라우트의 프로덕션 안전 불변식이 동시에 무너진다.
function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

/**
 * SPEC-B2C-DIAGNOSIS-001 REQ-B2CDIAG-025(design.md §19)가 정의한 진단 플로우
 * 노출 게이트 — `productionReady`(ENABLE_DIAGNOSIS_FLOW &&
 * DIAGNOSIS_ENGINE_READY) || `reviewEnabled`(ENABLE_DIAGNOSIS_DEV_STATES) =
 * `shouldRenderDiagnosis`. app/page.tsx(01 화면)와 app/result/page.tsx
 * (02 화면)가 이 헬퍼 하나를 공유하며, 두 라우트 어디에도 이 계산을 각자
 * 다시 작성하지 않는다(REQ-B2CRESULT-012).
 *
 * env는 `process.env` 또는 그와 동형인 일반 객체를 받는 순수 함수다 —
 * Next.js 전용 의존성이 없어 단위 테스트에서 일반 env 객체로 직접
 * 호출할 수 있다.
 */
export function computeDiagnosisFlags(
  env: Record<string, string | undefined> | NodeJS.ProcessEnv
): DiagnosisFlags {
  const productionReady =
    isFlagEnabled(env.ENABLE_DIAGNOSIS_FLOW) && isFlagEnabled(env.DIAGNOSIS_ENGINE_READY);
  const reviewEnabled = isFlagEnabled(env.ENABLE_DIAGNOSIS_DEV_STATES);
  const shouldRenderDiagnosis = productionReady || reviewEnabled;

  return { productionReady, reviewEnabled, shouldRenderDiagnosis };
}
