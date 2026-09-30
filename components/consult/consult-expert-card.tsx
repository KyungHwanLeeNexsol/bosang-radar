import { User } from "lucide-react";

// SPEC-B2C-CONSULT-001 — .pen 03 / 03-A2 / M03 "상담 예정 전문가" 카드(Adjuster).
//
// design.md §1 D3: 전문가 자동 배정은 이 SPEC 범위 밖이라 실제 전문가 정보를 만들어 내지 않는다.
// 사용자 결정에 따라 카드 모양은 .pen 그대로 두고 내용은 중립("배정 예정")으로 채운다.
// .pen의 정하은 손해사정사 이름, "금융감독원 등록 손해사정사" 배지, "등록정보 확인" 링크는
// 실제 등록 확인 페이지가 생기기 전에는 사실을 단정하게 되므로 넣지 않는다(.pen ⑦ 지침 참고).
//
// 값은 .pen에서 직접 읽었다(데스크톱 / 모바일): 바탕 #f8fafb + 테두리 #e2e7ec, 라디우스 12 / 11,
// 패딩 18x20 / 14x15, 간격 16 / 12, 아바타 46 / 40(어두운 #141a21, 라디우스 12 / 10),
// 이름 15 / 13.5px 700, 라벨 "상담 예정 전문가"는 데스크톱에서 카드 오른쪽 끝(11.5px 600),
// 모바일에서는 이름 아래 작은 글씨(11px)다.

export function ConsultExpertCard() {
  return (
    <div
      data-testid="consult-expert-card"
      className="flex w-full items-center gap-3 rounded-[11px] border border-app-line bg-app-surface-sub px-[15px] py-[14px] md:gap-4 md:rounded-[12px] md:px-5 md:py-[18px]"
    >
      <span
        data-testid="consult-expert-avatar"
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-app-sidebar text-[#c3cbd5] md:size-[46px] md:rounded-[12px]"
      >
        <User className="size-[18px] md:size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[13.5px] font-bold text-bora-ink md:text-[15px] md:tracking-[-0.3px]">
          배정 예정
        </span>
        <span className="text-[11px] text-bora-ink-3 md:hidden">상담 예정 전문가</span>
      </div>
      <span className="hidden shrink-0 text-[11.5px] font-semibold text-bora-ink-3 md:block">
        상담 예정 전문가
      </span>
    </div>
  );
}
