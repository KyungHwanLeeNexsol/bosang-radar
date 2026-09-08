import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getRecentCasesForOwner,
  type RecentCaseSummary,
} from "@/lib/cases/get-recent-cases-for-owner";
import { CaseInputForm } from "./case-input-form";
import { AnalysisStatusPanel } from "./analysis-status-panel";
import { RecentResearchPanel } from "./recent-research-panel";

export const metadata: Metadata = {
  title: "사건 입력",
};

// SPEC-UI-MIGRATION-001 M6 (REQ-012/013, plan.md §B 결정 2) — "최근 리서치"
// 패널이 필요로 하는 ownerUserId는 이 서버 페이지 컴포넌트 자신이
// app/cases/[caseId]/page.tsx와 동일한 getCurrentSession() 패턴으로 확인해
// 조달한다(신규 API 라우트 없음). 이 서버측 세션 확인 도입의 결과로
// /cases/new는 정적 생성에서 동적(요청 시점) 렌더링으로 전환되며, 이는
// 의도된 결과다("반드시 정적 생성 유지"는 더 이상 요구사항이 아니다) —
// 사용자별 데이터가 빌드 시점에 평가되거나 정적 HTML에 구워지지 않고,
// 빌드 자체는 실제 DB 연결을 요구하지 않으며, 세션/DB 조회는 요청 시점에만
// 발생하고, owner-scope는 이 조회 함수 내부에서 서버측으로 강제된다
// (research.md §5c). app/cases/layout.tsx(서버 컴포넌트)는 여전히 어떤
// 세션 동적 API도 직접 호출하지 않는다(REQ-005 무변경, App Shell의 관심사
// 분리 원칙).
//
// "최근 리서치" 조회 자체가 실패하는 경우 그 패널만 안전한 빈 상태로
// 대체되어야 하며, 좌측 폼 컬럼을 포함한 페이지의 나머지 부분은 정상
// 렌더링되어야 한다(REQ-013 폴백 동작, AC-013e) — 그래서 조회를 별도
// try/catch로 격리한다.
export default async function NewCasePage() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }

  let recentCases: RecentCaseSummary[] = [];
  try {
    recentCases = await getRecentCasesForOwner(session.user.id);
  } catch {
    recentCases = [];
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-7 sm:px-6 xl:flex-row xl:px-8 xl:pt-7 xl:pb-9">
      <div className="min-w-0 xl:max-w-[780px] xl:flex-1">
        <CaseInputForm />
      </div>
      {/* Round4: Pencil 05-사건-입력.png 재대조 — 우측 레일 순서를
          개인정보 비식별 안내 → 분석 상태 → 최근 리서치로 정렬 */}
      <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
        <Notice title="개인정보 비식별 안내">
          비식별 요약만 입력하세요. 실명, 상세 주소, 주민등록번호, 전화번호, 의료·보험 원본 문서
          내용은 입력하지 마세요.
        </Notice>
        <AnalysisStatusPanel />
        <RecentResearchPanel cases={recentCases} />
      </aside>
    </div>
  );
}
