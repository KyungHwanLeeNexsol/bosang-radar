import type { Metadata } from "next";
import { FolderX } from "lucide-react";
import { ExceptionPanel } from "@/components/exception-panel";

export const metadata: Metadata = {
  title: "사건을 찾을 수 없습니다",
};

// SPEC-UI-MIGRATION-001 M7 (REQ-015) — 사건-없음/미소유 통합 404. App Shell
// 안에서 렌더링된다(app/cases/layout.tsx가 자동으로 중첩됨). 존재하지
// 않는 caseId와 다른 사용자가 소유한 caseId를 구분하는 어떤 텍스트/단서도
// 포함하지 않는다 — getCaseForOwner()의 정보 은닉 설계(존재-없음=
// 소유권-없음)를 존중해 별도 403 화면을 만들지 않는다. 이 컴포넌트는
// 파라미터를 받지 않으므로 항상 완전히 동일한 콘텐츠를 렌더링한다.
export default function CaseNotFound() {
  return (
    <ExceptionPanel
      testId="case-not-found"
      icon={<FolderX aria-hidden="true" className="size-6" />}
      title="사건을 찾을 수 없습니다"
      description="요청하신 사건 정보를 찾을 수 없습니다. 사건 번호를 다시 확인해 주세요."
      context="사건 관리"
      errorCode="ERR_CASE_NOT_FOUND"
    />
  );
}
