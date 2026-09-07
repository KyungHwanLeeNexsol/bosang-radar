"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

// SPEC-UI-MIGRATION-001 Round 5(외부 재검토) R5-7 — 모바일에서 리포트+피드백이
// 하나의 매우 긴 페이지(390px 기준 세로 18000px 이상)로 이어지는 데 대한
// 스코프 내 개선. 정보 구조(별도 라우트/접기-펼치기) 변경은 사용자 결정
// 게이트로 넘기고, 이 "맨 위로" 버튼만 이번 라운드에서 반영한다 — lg 이상
// (데스크톱/태블릿)에서는 페이지가 이 정도로 길지 않아 숨긴다.
export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      data-testid="back-to-top"
      aria-label="맨 위로 이동"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed right-4 bottom-4 z-40 flex size-11 items-center justify-center rounded-full bg-bora-accent text-white shadow-lg lg:hidden"
    >
      <ArrowUp aria-hidden="true" className="size-5" />
    </button>
  );
}
