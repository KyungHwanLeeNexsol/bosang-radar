"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

// SPEC-B2C-RESULT-001 M4 (design.md §3, REQ-B2CRESULT-014) — 02 전용 오류
// 상태. sessionStorage에 기록된 인계 데이터가 파싱 불가능하거나 스키마와
// 불일치할 때 렌더링된다(JSON 구문 오류 · 스키마 불일치 두 경우 모두 이
// 상태 하나로 처리 — design.md §3, readDiagnosisHandoff()가 두 경우를 이미
// 동일한 "invalid" 판정으로 합쳐 반환한다). 애플리케이션을 중단시키지 않고
// 01 입력 화면으로 돌아가는 경로만 제공한다.

export function ResultError() {
  const router = useRouter();

  return (
    <div
      data-testid="result-error"
      className="flex w-full flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive md:size-16"
      >
        <TriangleAlert className="size-6 md:size-7" />
      </span>
      <h1 className="text-[21px] font-bold text-bora-ink md:text-[26px]">
        결과를 불러오는 중 문제가 발생했습니다
      </h1>
      <p role="alert" className="max-w-sm text-body text-bora-ink-3">
        저장된 진단 결과를 해석할 수 없습니다. 처음부터 다시 진단해 주세요.
      </p>
      <Button
        type="button"
        data-testid="result-error-cta"
        variant="diagnosis"
        onClick={() => router.push("/")}
      >
        진단 다시 시작하기
      </Button>
    </div>
  );
}
