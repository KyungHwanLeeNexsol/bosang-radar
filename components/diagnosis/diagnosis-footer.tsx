// SPEC-B2C-DIAGNOSIS-001 M-fix-1 (design/exports/01-*.png, M01-*.png) — 하단
// 링크 + 면책 문구 + BORA 브랜드 영역. diagnosis-header.tsx와 동일한 이유로
// diagnosis-flow.tsx가 스텝 스위치 바깥에서 한 번만 렌더링한다. 세 링크
// (개인정보처리방침/이용약관/고객문의)는 이 SPEC이 대상 화면을 구현하지
// 않으므로(매칭 엔진·법무 확정 전) 실제 목적지가 없는 시각적 placeholder다
// — href를 비워 두면 Playwright/스크린리더가 빈 링크로 인식하므로, 목적지
// 미정 상태를 명시하는 "#" 앵커로 둔다.

const FOOTER_LINKS = ["개인정보처리방침", "이용약관", "고객 문의"] as const;

export function DiagnosisFooter() {
  return (
    <footer className="flex w-full flex-col gap-4 border-t border-app-line px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <nav className="flex flex-wrap gap-x-5 gap-y-1.5 text-body-s font-medium text-bora-ink-2">
          {FOOTER_LINKS.map((label) => (
            <a key={label} href="#" className="hover:text-bora-ink">
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 md:flex">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-bora-accent text-xs font-bold text-white">
            B
          </span>
          <span className="text-sm font-extrabold tracking-tight text-bora-ink">BORA</span>
        </div>
      </div>

      <p className="hidden text-meta text-bora-ink-4 md:block">
        본 서비스의 진단 결과는 입력하신 내용을 바탕으로 한 참고용 안내이며, 보상 여부와 금액을
        보장하지 않습니다. 실제 지급은 가입하신 보험의 약관과 보험사 심사 결과에 따릅니다.
      </p>
      <p className="text-meta text-bora-ink-4 md:hidden">
        진단 결과는 참고용 안내이며 보상 여부와 금액을 보장하지 않습니다.
      </p>
    </footer>
  );
}
