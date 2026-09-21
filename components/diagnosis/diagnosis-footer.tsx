// SPEC-B2C-DIAGNOSIS-001 M-fix-1 (design/exports/01-*.png, M01-*.png) — 하단
// 링크 + 면책 문구 + BORA 브랜드 영역. diagnosis-header.tsx와 동일한 이유로
// diagnosis-flow.tsx가 스텝 스위치 바깥에서 한 번만 렌더링한다. 세 링크
// (개인정보처리방침/이용약관/고객문의)는 이 SPEC이 대상 화면을 구현하지
// 않으므로(매칭 엔진·법무 확정 전) 실제 목적지가 없는 시각적 placeholder다
// — href를 비워 두면 Playwright/스크린리더가 빈 링크로 인식하므로, 목적지
// 미정 상태를 명시하는 "#" 앵커로 둔다.

const FOOTER_LINKS = ["개인정보처리방침", "이용약관", "고객 문의"] as const;

export function DiagnosisFooter() {
  // D2(6차 재작업) — Mobile 푸터 실측: 디자인 푸터는 상단 테두리부터
  // 하단 면책 문구까지 총 65px(y≈989→1054)인데 구현은 py-6+gap-4로
  // 그보다 훨씬 커 전체 화면이 1110 프레임을 66px 초과했다. Mobile만
  // 패딩/간격을 좁힌다(Desktop은 기존 값 유지, 별도 편차 보고 없음).
  // D2(7차) — design/exports/01의 푸터는 화면 전체 폭이 아니라 본문과 같은
  // 760px 중앙 컬럼 안에 있다(상단 구분선도 x=340~1100 구간에만 그어진다).
  // 6차까지의 full-bleed 푸터는 구분선·링크·면책 문구가 모두 x=32에서
  // 시작해 디자인과 300px 이상 어긋나 있었다.
  return (
    <footer className="mt-[36px] flex w-full justify-center px-5 md:mt-[57px] md:px-8">
      <div className="flex w-full max-w-[752px] flex-col gap-2 border-t border-app-line py-4 md:gap-0 md:py-[26px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
        <nav
          data-testid="diagnosis-footer-links"
          className="flex flex-wrap gap-x-5 gap-y-1.5 text-body-s font-medium text-bora-ink-2"
        >
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

      {/* D2(7차) — design/exports/01의 푸터 면책 문구 상단은 y≈850, 링크
          행(y≈800)과의 간격이 50px다. 부모 gap-4(16px)만으로는 11px 짧아
          면책 문구가 위로 붙었다(6차 미해결 항목) — Desktop만 명시적인
          mt로 디자인 간격을 재현한다. */}
      <p
        data-testid="diagnosis-footer-disclaimer"
        className="hidden text-meta text-bora-ink-4 md:mt-[18px] md:block"
      >
        본 서비스의 진단 결과는 입력하신 내용을 바탕으로 한 참고용 안내이며, 보상 여부와 금액을
        보장하지 않습니다. 실제 지급은 가입하신 보험의 약관과 보험사 심사 결과에 따릅니다.
      </p>
      <p
        data-testid="diagnosis-footer-disclaimer"
        className="text-label-s text-bora-ink-4 md:hidden"
      >
        진단 결과는 참고용 안내이며 보상 여부와 금액을 보장하지 않습니다.
      </p>
      </div>
    </footer>
  );
}
