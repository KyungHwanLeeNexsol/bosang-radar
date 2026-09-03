import type { Metadata } from "next";
import { Notice } from "@/components/ui/notice";
import { CaseInputForm } from "./case-input-form";

export const metadata: Metadata = {
  title: "사건 입력",
};

// bare UI — 사건 입력 페이지 셸(SPEC-PILOT-VISUAL-001 M4, design.md §4 화면
// 01). 2컬럼 레이아웃(좌: 사건 개요 패널, 우: 비식별 안내 Notice)만 이
// 서버 컴포넌트가 구성하고, 실제 폼 로직/검증/제출 상태는 클라이언트
// 컴포넌트인 CaseInputForm이 그대로 담당한다. 우 레일에는 Notice만
// 렌더링하며, "분석 상태"/"최근 리서치" 패널은 REQ-011에 따라 생략한다
// (신규 인프라 없음 — 빈 상태/placeholder도 렌더링하지 않는다). 인증
// 여부는 proxy.ts가 cases/* 경로를 이미 가드하므로 이 서버 컴포넌트에서
// 별도로 재확인하지 않는다.
export default function NewCasePage() {
  return (
    <div className="flex flex-1 gap-6 px-8 pt-7 pb-9">
      <div className="min-w-0 max-w-[780px] flex-1">
        <CaseInputForm />
      </div>
      <aside className="flex w-[340px] shrink-0 flex-col gap-4">
        <Notice title="개인정보 비식별 안내">
          비식별 요약만 입력하세요. 실명, 상세 주소, 주민등록번호, 전화번호, 의료·보험 원본 문서
          내용은 입력하지 마세요.
        </Notice>
      </aside>
    </div>
  );
}
