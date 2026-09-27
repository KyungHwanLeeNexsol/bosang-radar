import type { Metadata } from "next";
import { Suspense } from "react";

import { computeConsultFlags } from "@/lib/diagnosis/flags";
import { ConsultView } from "@/components/consult/consult-view";

// SPEC-B2C-CONSULT-001 M3 (design.md §4, REQ-B2CCONSULT-005) — 03(상담
// 신청) 화면의 라우트 셸(Server Component). app/page.tsx·app/result/page.tsx
// 와 동일하게 process.env를 이 파일에서만 읽고, `shouldRenderConsult`가
// 거짓이면 01/02와 동일한 "서비스 준비 중" placeholder를 그대로 표시한다.
// `CONSULT_POLICY_READY`(REQ-B2CCONSULT-018)와 02의 `shouldRenderDiagnosis`는
// 이 게이트에 전혀 관여하지 않는다(REQ-B2CCONSULT-005 — 03 노출 여부는
// `ENABLE_CONSULT_FLOW` 단독으로 결정된다). <ConsultView/>는 이 milestone에서
// 최소 placeholder이며(components/consult/consult-view.tsx), Milestone 4가
// 내부를 실제 폼으로 교체한다.
export async function generateMetadata(): Promise<Metadata> {
  const { shouldRenderConsult } = computeConsultFlags(process.env);
  return {
    title: shouldRenderConsult ? "상담 신청" : "서비스 준비 중",
  };
}

export default function ConsultPage() {
  const { shouldRenderConsult } = computeConsultFlags(process.env);

  if (!shouldRenderConsult) {
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
    <Suspense fallback={null}>
      <ConsultView />
    </Suspense>
  );
}
