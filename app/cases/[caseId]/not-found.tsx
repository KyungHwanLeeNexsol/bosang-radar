import type { Metadata } from "next";
import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { ExceptionPanel } from "@/components/exception-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "사건을 찾을 수 없습니다",
};

// SPEC-UI-MIGRATION-001 M7 (REQ-015) — 사건-없음/미소유 통합 404. App Shell
// 안에서 렌더링된다(app/cases/layout.tsx가 자동으로 중첩됨). 존재하지
// 않는 caseId와 다른 사용자가 소유한 caseId를 구분하는 어떤 텍스트/단서도
// 포함하지 않는다 — getCaseForOwner()의 정보 은닉 설계(존재-없음=
// 소유권-없음)를 존중해 별도 403 화면을 만들지 않는다. 이 컴포넌트는
// 파라미터를 받지 않으므로 항상 완전히 동일한 콘텐츠를 렌더링한다.
//
// Post-M8 Pencil 시각 정합성 보정: 아이콘을 물음표 원형(CircleHelp)으로
// 교체하고, "목록에서 확인" 안내를 추가했다. description은 "권한"/"소유"
// 등 정보 은닉 위반 단어를 절대 포함하지 않는다(위 정보 은닉 설계 참조).
// "리포트 보관함"은 이 코드베이스에 아직 구현되지 않은 기능이라(사이드바의
// "준비 중" 칩과 동일하게) 실제 링크가 아닌 비활성 표시로만 노출한다.
export default function CaseNotFound() {
  return (
    <ExceptionPanel
      testId="case-not-found"
      icon={<CircleHelp aria-hidden="true" className="size-6" />}
      title="사건을 찾을 수 없습니다"
      description="사건 정보를 찾을 수 없습니다. 사건 번호를 다시 확인하거나 목록에서 확인해 주세요."
      context="사건 관리"
      errorCode="ERR_CASE_NOT_FOUND"
      action={
        <div className="mt-2 flex items-center gap-2">
          <Button
            render={<Link href="/cases/new" />}
            data-testid="case-not-found-cta-primary"
            className="rounded-[4px] bg-bora-accent text-white hover:bg-bora-accent-deep"
          >
            새 사건 입력
          </Button>
          <Button
            variant="outline"
            disabled
            data-testid="case-not-found-cta-secondary"
            className="cursor-not-allowed opacity-40"
          >
            리포트 보관함으로
          </Button>
        </div>
      }
    />
  );
}
