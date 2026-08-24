import type { Metadata } from "next";
import { CaseInputForm } from "./case-input-form";

export const metadata: Metadata = {
  title: "사건 입력",
};

// bare UI — 사건 입력 페이지 셸(M5, design.md §2). 실제 검증/제출 상태는
// 클라이언트 컴포넌트인 CaseInputForm이 담당한다. 인증 여부는 proxy.ts가
// cases/* 경로를 이미 가드하므로 이 서버 컴포넌트에서 별도로 재확인하지
// 않는다.
export default function NewCasePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <h1 className="text-xl font-semibold">사건 입력</h1>
      <CaseInputForm />
    </div>
  );
}
