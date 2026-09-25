"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

// SPEC-B2C-RESULT-001 M4 (design.md §3, REQ-B2CRESULT-013) — 02 전용
// "결과 없음" 상태. sessionStorage에 유효한 진단 결과가 없는 상태로
// `/result`에 직접 접근했을 때(또는 이 탭 세션에서 한 번도 01→02 흐름을
// 거치지 않은 경우) 렌더링된다 — 01의 `result-none`(01-D) mock 판정 상태와는
// 별개의, 02 자체의 데이터 부재 상태다(01-D는 mock 판정 결과이고 이 상태는
// 데이터 부재 자체를 나타낸다). "내용을 수정할게요" 같은 01 전용 문구를
// 재사용하지 않고, 01 입력 화면으로 돌아가는 경로만 제공한다.

export function ResultNoData() {
  const router = useRouter();

  return (
    <div
      data-testid="result-no-data"
      className="flex w-full flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-app-surface-inset text-bora-ink-3 md:size-16"
      >
        <SearchX className="size-6 md:size-7" />
      </span>
      <h1 className="text-[21px] font-bold text-bora-ink md:text-[26px]">
        진단 결과를 찾을 수 없습니다
      </h1>
      <p className="max-w-sm text-body text-bora-ink-3">
        아직 진단을 진행하지 않았거나, 결과가 이 브라우저 세션에 저장되어 있지 않습니다. 처음부터
        다시 진단해 주세요.
      </p>
      <Button
        type="button"
        data-testid="result-no-data-cta"
        variant="diagnosis"
        onClick={() => router.push("/")}
      >
        진단 다시 시작하기
      </Button>
    </div>
  );
}
