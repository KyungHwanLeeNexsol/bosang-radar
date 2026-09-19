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
function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

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
