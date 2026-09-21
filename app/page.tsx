import type { Metadata } from "next";
import { Suspense } from "react";

import { DiagnosisFlow } from "@/components/diagnosis/diagnosis-flow";
import { DiagnosisFlowSkeleton } from "@/components/diagnosis/diagnosis-flow-skeleton";

// SPEC-B2C-FOUNDATION-001 M2 (REQ-B2CFOUND-002/003/013) — B2C 01 화면(질문
// 입력 진입점)이 아직 구현되지 않은 상태에서 `app/` 루트가 항상 정적으로
// 접근 가능하도록 마련한 최소 placeholder. M3에서 app/cases/*, app/login/*,
// lib/auth/*를 제거하기 전에 선행되어야 하며(REQ-B2CFOUND-003), 세션 확인이나
// 다른 런타임 의존성 없이 빌드 시점에 완전히 정적으로 렌더링된다. 이름·
// 연락처 등 PII 필드는 수집하지 않는다(REQ-B2CFOUND-013).
//
// SPEC-B2C-DIAGNOSIS-001 M2(design.md §19, REQ-B2CDIAG-025) — 위 placeholder
// 위에 프로덕션 활성화 게이트를 추가한다. `productionReady`(ENABLE_DIAGNOSIS_
// FLOW && DIAGNOSIS_ENGINE_READY, 둘 다 이 SPEC의 코드에서는 true로 전환되지
// 않으므로 구조적으로 항상 거짓)와 `reviewEnabled`(ENABLE_DIAGNOSIS_DEV_STATES,
// UI 검증·Playwright 전용)를 이 함수 본문 한 곳에서만 계산하고,
// `shouldRenderDiagnosis = productionReady || reviewEnabled`가 거짓이면 위
// placeholder를(내용 변경 없이 그대로), 참이면 <DiagnosisFlow />를
// <Suspense>로 감싸 렌더링한다. DiagnosisFlow가 useSearchParams()를 호출하는
// Client Component이므로 Suspense 경계는 필수다(design.md §2).
export const metadata: Metadata = {
  title: "서비스 준비 중",
};

// "true" 문자열만 참으로 취급한다 — unset을 포함한 그 외 모든 값은 거짓
// (design.md §19.1a 5행 동작 행렬).
//
// @MX:ANCHOR: [AUTO] 아래 게이트의 세 플래그를 모두 이 함수 하나로 판정한다
// (호출 3곳: ENABLE_DIAGNOSIS_FLOW / DIAGNOSIS_ENGINE_READY /
// ENABLE_DIAGNOSIS_DEV_STATES).
// @MX:REASON: 판정을 느슨하게(예: truthy 검사, "1"·"yes" 허용) 바꾸면 세
// 플래그가 동시에 느슨해져 Home()의 프로덕션 안전 불변식이 한 번에 무너진다.
function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

// @MX:ANCHOR: [AUTO] SPEC-B2C-DIAGNOSIS-001 REQ-B2CDIAG-025 (design.md §19) —
// 진단 플로우가 일반 사용자에게 노출되는지를 결정하는 유일한 게이트.
// shouldRenderDiagnosis = productionReady(ENABLE_DIAGNOSIS_FLOW &&
// DIAGNOSIS_ENGINE_READY) || reviewEnabled(ENABLE_DIAGNOSIS_DEV_STATES) 이
// 한 줄이 프로덕션 안전 불변식 전체이며, 이 계산은 다른 어디에도 복제되어
// 있지 않다.
// @MX:REASON: 담보 매칭 엔진이 아직 없어 진단 판정은 키워드 기반 mock이다
// (step-loading.tsx @MX:DEBT). 이 게이트가 느슨해지는 순간 그 mock 결과가
// 실제 사용자에게 보상 진단으로 제시된다 — 세 플래그의 조합·기본값·OR/AND
// 배치 중 무엇을 바꾸든 반드시 app/page.test.tsx의 5행 동작 행렬
// (design.md §19.1a)을 함께 갱신해야 한다. 그 행렬이 이 불변식의 회귀
// 테스트다.
export default function Home() {
  // 이 SPEC이 전달하는 코드에는 DIAGNOSIS_ENGINE_READY를 true로 설정하는
  // 지점이 없으므로 productionReady는 이 SPEC 범위 내내 구조적으로 항상
  // 거짓이다(design.md §19.1 원칙 3) — 실제 매칭 엔진 연결은 후속 SPEC의 몫.
  const productionReady =
    isFlagEnabled(process.env.ENABLE_DIAGNOSIS_FLOW) &&
    isFlagEnabled(process.env.DIAGNOSIS_ENGINE_READY);
  const reviewEnabled = isFlagEnabled(process.env.ENABLE_DIAGNOSIS_DEV_STATES);
  const shouldRenderDiagnosis = productionReady || reviewEnabled;

  if (shouldRenderDiagnosis) {
    return (
      <Suspense fallback={<DiagnosisFlowSkeleton />}>
        <DiagnosisFlow enableDevStates={reviewEnabled} />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-h2 font-semibold text-bora-ink">서비스 준비 중입니다</h1>
      <p className="max-w-sm text-body text-bora-ink-3">
        보상레이더는 현재 새로운 서비스를 준비하고 있습니다. 곧 다시 찾아주세요.
      </p>
    </div>
  );
}
