import type { Metadata } from "next";
import { Suspense } from "react";

import { DiagnosisFlow } from "@/components/diagnosis/diagnosis-flow";
import { DiagnosisFlowSkeleton } from "@/components/diagnosis/diagnosis-flow-skeleton";
import { computeDiagnosisFlags } from "@/lib/diagnosis/flags";

// SPEC-B2C-FOUNDATION-001 M2 (REQ-B2CFOUND-002/003/013) — B2C 01 화면(질문
// 입력 진입점)이 아직 구현되지 않은 상태에서 `app/` 루트가 항상 접근
// 가능하도록 마련한 최소 placeholder. M3에서 app/cases/*, app/login/*,
// lib/auth/*를 제거하기 전에 선행되어야 하며(REQ-B2CFOUND-003), 세션 확인이나
// 다른 런타임 의존성 없이 렌더링된다(최초 작성 시에는 빌드 시점 정적 렌더링이었고,
// 지금은 아래 D-NEW-21에 따라 요청 시점 렌더링이다). 이름·연락처 등 PII 필드는
// 수집하지 않는다(REQ-B2CFOUND-013).
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
//
// SPEC-B2C-CONSULT-001 D-NEW-21 — 이 페이지는 process.env만 읽어 `next build`에서
// 정적으로 프리렌더되었고, 그래서 세 진단 플래그가 빌드 시점 값으로 굳었다. 같은
// 게이트를 요청 시점에 읽는 app/result/page.tsx와 판정 시점이 달라 서버 시작 env를
// 바꾸면 두 화면이 서로 다른 상태를 보였다(`pnpm verify:flag-runtime`으로 재현:
// 불일치 31건). 그래서 app/consult/page.tsx, app/result/page.tsx와 같은
// `dynamic = "force-dynamic"`으로 요청마다 렌더링해 세 화면이 같은 시점(요청 시점)에
// 게이트를 판정하게 맞춘다.
//
// [SPEC 문구와의 차이 — 사용자가 알고 받아들인 편차] 위 FOUNDATION-001 문구
// ("빌드 시점에 완전히 정적으로 렌더링", REQ-B2CFOUND-002/003의 "항상 정적으로
// 접근 가능")는 이제 사실이 아니다. 지켜지는 것은 세션 확인 없음·다른 런타임 의존성
// 없음(process.env 읽기뿐)·PII 미수집·항상 접근 가능(게이트가 닫혀도 placeholder를
// 200으로 응답)이다. SPEC 본문은 수정하지 않았고 편차는 progress.md D-NEW-21에 기록한다.
export const dynamic = "force-dynamic";

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
