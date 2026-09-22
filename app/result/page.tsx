import type { Metadata } from "next";
import { Suspense } from "react";

import { computeDiagnosisFlags } from "@/lib/diagnosis/flags";
import { ResultSkeleton } from "@/components/result/result-skeleton";
import { ResultView } from "@/components/result/result-view";

// SPEC-B2C-RESULT-001 M3 (design.md, REQ-B2CRESULT-012/013/014/015) — 02
// 보상 진단 결과 화면의 라우트 셸(Server Component). app/page.tsx와 동일한
// `computeDiagnosisFlags` 헬퍼로 `shouldRenderDiagnosis`를 계산하며, 이
// 게이트 계산 로직을 이 파일에 별도로 작성하지 않는다(REQ-B2CRESULT-012).
// `shouldRenderDiagnosis`가 거짓이면 app/page.tsx와 동일한 placeholder
// 문구를 그대로 표시하고, 참이면 <ResultView />를 <Suspense>로 감싼다 —
// ResultView가 마운트 시 sessionStorage(클라이언트 전용)를 조회하므로
// (Milestone 4) 그동안 <ResultSkeleton />을 보여 레이아웃 시프트를
// 최소화한다(REQ-B2CRESULT-015). ResultView/ResultSkeleton은 이 milestone
// 에서는 최소 placeholder이며, Milestone 4가 내부를 교체한다.
export const metadata: Metadata = {
  title: "서비스 준비 중",
};

export default function ResultPage() {
  const { shouldRenderDiagnosis } = computeDiagnosisFlags(process.env);

  if (!shouldRenderDiagnosis) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <h1 className="text-h2 font-semibold text-bora-ink">서비스 준비 중입니다</h1>
        <p className="max-w-sm text-body text-bora-ink-3">
          보상레이더는 현재 새로운 서비스를 준비하고 있습니다. 곧 다시 찾아주세요.
        </p>
      </div>
    );
  }

  return (
    <Suspense fallback={<ResultSkeleton />}>
      <ResultView />
    </Suspense>
  );
}
