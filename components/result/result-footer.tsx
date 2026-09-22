import * as React from "react";

// SPEC-B2C-RESULT-001 D2 (design/exports 02·M02 하단 영역, MIGRATION-PLAN.md
// §3 "DEV-ONLY-운영-전-실제-정보-입력-필요" 체크리스트 — 실제 법인 정보는
// 운영 전 확정 전) — /result 전용 하단 푸터. 개인정보처리방침/이용약관
// 링크·고객문의·BORA 브랜드 마크·"참고용" 안내를 포함한다.
// components/diagnosis/diagnosis-footer.tsx(01 전용)와 동일한 placeholder
// 원칙(href="#", 목적지 미정 상태 명시)을 따르되, 01 컴포넌트를 직접
// 수정하지 않고 이 SPEC 전용 신규 컴포넌트로 만든다.

const FOOTER_LINKS = ["개인정보처리방침", "이용약관"] as const;

export function ResultFooter() {
  return (
    <footer
      data-testid="result-footer"
      className="flex w-full flex-col items-center gap-2 border-t border-app-line bg-app-surface px-5 py-5 text-center md:px-8"
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-bora-accent text-[11px] font-bold text-white"
        >
          B
        </span>
        <span className="text-body-s font-extrabold tracking-tight text-bora-ink">BORA</span>
      </div>

      <nav
        data-testid="result-footer-links"
        aria-label="법적 고지"
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-label-s font-medium text-bora-ink-2"
      >
        {FOOTER_LINKS.map((label) => (
          <a key={label} href="#" className="hover:text-bora-ink">
            {label}
          </a>
        ))}
        <span data-testid="result-footer-contact">고객 문의: 준비 중</span>
      </nav>

      <p data-testid="result-footer-reference-notice" className="text-label-s text-bora-ink-4">
        본 진단 결과는 참고용 안내이며 법적 효력이 없습니다.
      </p>
    </footer>
  );
}
