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
// `ENABLE_CONSULT_FLOW` 단독으로 결정된다). Milestone 4 — `isPolicyReady`도
// computeConsultFlags(process.env)로 함께 계산해 <ConsultView/>에 prop으로
// 전달한다(app/result/page.tsx가 shouldRenderConsult를 result-view.tsx에
// 전달하는 기존 패턴과 동일 — "use client" 컴포넌트는 process.env를 직접
// 읽지 않는다). consult-consent-group.tsx의 "자세히 보기" 상세 뷰 노출
// 여부를 이 값이 게이트한다(design.md D5).
//
// SPEC-B2C-CONSULT-001 D-NEW-18 — 이 페이지는 process.env만 읽고 요청 API
// (cookies/headers 등)를 쓰지 않아 `next build`가 정적으로 프리렌더했고, 그 결과
// 두 플래그가 빌드 시점 값으로 굳었다(POST /api/consultations는 요청 시점에
// CONSULT_POLICY_READY를 읽으므로 페이지와 API가 서로 다른 값을 봤다 —
// `pnpm verify:flag-runtime`으로 재현). 라우트 세그먼트 설정 `dynamic =
// "force-dynamic"`으로 요청마다 렌더링해 env를 요청 시점에 읽는다(Next.js 문서
// caching-without-cache-components.md § Route segment config; Cache Components
// 미사용 프로젝트에서 유효). generateMetadata()도 같은 렌더링을 따른다.
// 페이지를 async로 바꾸는 `await connection()` 대안은 단위 테스트가 컴포넌트를
// 요청 범위 밖에서 직접 호출해 채택하지 않았다.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { shouldRenderConsult } = computeConsultFlags(process.env);
  return {
    title: shouldRenderConsult ? "상담 신청" : "서비스 준비 중",
  };
}

export default function ConsultPage() {
  const { shouldRenderConsult, isPolicyReady } = computeConsultFlags(process.env);

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
      <ConsultView isPolicyReady={isPolicyReady} />
    </Suspense>
  );
}
