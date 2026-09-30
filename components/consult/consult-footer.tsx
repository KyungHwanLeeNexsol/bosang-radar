// SPEC-B2C-CONSULT-001 — .pen 03 / 03-A2 / 03-B / 03-C / 03-D 데스크톱 하단 푸터(Footer 컴포넌트).
// 모바일 프레임(M03*)에는 푸터가 없으므로 md 미만에서는 숨긴다.
//
// 값은 .pen에서 직접 읽었다: 위 테두리 #e2e7ec, 위 패딩 26, 줄 사이 간격 14,
// 링크 줄(간격 20, 높이 30) = 개인정보처리방침 · 이용약관 · 고객 문의(12.5px 600 #39424e) + 오른쪽 BORA
// (보라 정사각 30 라디우스 8 + "B" 15.8px 800 흰색, "BORA" 20px 800 #111820), 면책 11.5px 줄 높이 1.8 #6b7684.
//
// [결정] 링크 세 개는 목적지가 아직 없다 → 이동하지 않는 role="link" + aria-disabled + "준비 중" 표기.
// [결정] .pen ① 지침: 운영정보(법인명·사업자번호·주소 등)는 확정 전이라 화면에 두지 않는다.

const FOOTER_LINKS = ["개인정보처리방침", "이용약관", "고객 문의"] as const;

const DISCLAIMER =
  "본 서비스의 진단 결과는 입력하신 내용을 바탕으로 한 참고용 안내이며, 보상 여부와 금액을 보장하지 않습니다. 실제 지급은 가입하신 보험의 약관과 보험사 심사 결과에 따릅니다.";

export function ConsultFooter() {
  return (
    <footer
      data-testid="consult-footer"
      className="mt-[30px] hidden w-full flex-col gap-[14px] border-t border-app-line pt-[26px] text-left md:flex"
    >
      <div className="flex h-[30px] items-center gap-5">
        {FOOTER_LINKS.map((label) => (
          <span
            key={label}
            role="link"
            aria-disabled="true"
            className="relative cursor-not-allowed text-[12.5px] font-semibold text-bora-ink-2"
          >
            {label}
            <sup className="ml-0.5 text-[9px] font-medium text-bora-ink-4">준비 중</sup>
          </span>
        ))}
        <span className="flex-1" />
        <span className="flex items-center gap-2" aria-hidden="true">
          <span className="flex size-[30px] items-center justify-center rounded-[8px] bg-bora-accent text-[15.8px] font-extrabold text-white">
            B
          </span>
          <span className="text-[20px] font-extrabold tracking-[-0.44px] text-bora-ink">BORA</span>
        </span>
      </div>
      <p className="text-[11.5px] leading-[1.8] text-bora-ink-3">{DISCLAIMER}</p>
    </footer>
  );
}
