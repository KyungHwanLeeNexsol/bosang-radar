import type { Metadata } from "next";
import { Suspense } from "react";

import { DiagnosisFlow } from "@/components/diagnosis/diagnosis-flow";
import { DiagnosisFlowSkeleton } from "@/components/diagnosis/diagnosis-flow-skeleton";
import { computeDiagnosisFlags } from "@/lib/diagnosis/flags";

// SPEC-B2C-FOUNDATION-001 M2 (REQ-B2CFOUND-002/003/013) — B2C 01 화면(질문
// 입력 진입점)이 아직 구현되지 않은 상태에서 `app/` 루트가 항상 정적으로
// 접근 가능하도록 마련한 최소 placeholder. M3에서 app/cases/*, app/login/*,
// lib/auth/*를 제거하기 전에 선행되어야 하며(REQ-B2CFOUND-003), 세션 확인이나
// 다른 런타임 의존성 없이 빌드 시점에 완전히 정적으로 렌더링된다. 이름·
// 연락처 등 PII 필드는 수집하지 않는다(REQ-B2CFOUND-013).
//
// SPEC-B2C-DIAGNOSIS-001 M2(design.md §19, REQ-B2CDIAG-025) — 위 placeholder
// 위에 프로덕션 활성화 게이트를 추가한다. `shouldRenderDiagnosis`가 거짓이면
// 위 placeholder를(내용 변경 없이 그대로), 참이면 <DiagnosisFlow />를
// <Suspense>로 감싸 렌더링한다. DiagnosisFlow가 useSearchParams()를 호출하는
// Client Component이므로 Suspense 경계는 필수다(design.md §2).
//
// SPEC-B2C-RESULT-001 M3 (design.md, REQ-B2CRESULT-012) — 게이트 계산
// (`isFlagEnabled`/`productionReady`/`reviewEnabled`/`shouldRenderDiagnosis`)
// 을 `lib/diagnosis/flags.ts`의 `computeDiagnosisFlags`로 추출한다 —
// app/result/page.tsx(02 화면)가 동일한 판정을 필요로 하며, 두 라우트 중
// 어디에도 게이트 계산 로직을 중복 작성하지 않는다. 이 파일은 이제
// computeDiagnosisFlags를 호출할 뿐이며, 동작은 변경되지 않는다 —
// app/page.test.tsx의 5행 동작 행렬이 그대로 회귀 테스트다.
export const metadata: Metadata = {
  title: "서비스 준비 중",
};

export default function Home() {
  const { reviewEnabled, shouldRenderDiagnosis } = computeDiagnosisFlags(process.env);

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
