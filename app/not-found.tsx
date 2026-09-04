import type { Metadata } from "next";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { ExceptionPanel } from "@/components/exception-panel";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
};

// SPEC-UI-MIGRATION-001 M7 (REQ-015) — 전역 404. App Shell이 적용되지 않는다
// (루트 레이아웃만 적용 — Next.js App Router 세그먼트 트리에서
// app/cases/layout.tsx의 자손이 아니므로 구조적으로 보장됨).
export default function GlobalNotFound() {
  return (
    <ExceptionPanel
      testId="global-not-found"
      icon={<FileQuestion aria-hidden="true" className="size-6" />}
      title="페이지를 찾을 수 없습니다"
      description="요청하신 페이지가 존재하지 않거나 이동되었습니다."
      context="404"
      errorCode="ERR_NOT_FOUND"
      action={
        <Link href="/" className="text-body-s font-medium text-bora-accent hover:underline">
          홈으로 돌아가기
        </Link>
      }
    />
  );
}
