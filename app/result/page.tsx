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
//
// SPEC-B2C-RESULT-001 M6 (design.md §9, REQ-B2CRESULT-009/012) — review
// 전용 `?devFixture=fracture` 결정론적 진입점을 위해 `reviewEnabled`를
// <ResultView />에 `enableDevFixture`로 내려준다. 이 값은 §4의 mockJudge
// boolean 게이트와 동일한 `reviewEnabled`이며, 이 라우트가 별도의 게이트
// 로직을 다시 계산하지 않는다(REQ-B2CRESULT-012). app/page.tsx가
// enableDevStates를 <DiagnosisFlow />에 내려주는 것과 동일한 패턴이다.
//
// SPEC-B2C-RESULT-001 D2 — 정적 `metadata`는 게이트 상태와 무관하게 항상
// "서비스 준비 중"을 반환했다(shouldRenderDiagnosis=true여도 탭 제목이
// 그대로였음). generateMetadata()로 전환해 동일한 computeDiagnosisFlags()
// 결과로 분기한다 — 게이트가 닫힌 화면 본문의 "서비스 준비 중" 문구는
// 사용자 요청에 따라 그대로 유지한다.
export async function generateMetadata(): Promise<Metadata> {
  const { shouldRenderDiagnosis } = computeDiagnosisFlags(process.env);
  return {
    title: shouldRenderDiagnosis ? "보상 진단 결과" : "서비스 준비 중",
  };
}

export default function ResultPage() {
  const { reviewEnabled, shouldRenderDiagnosis } = computeDiagnosisFlags(process.env);

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
      <ResultView enableDevFixture={reviewEnabled} />
    </Suspense>
  );
}
