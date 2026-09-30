// SPEC-B2C-CONSULT-001 (design.md §10) — 03-B/C/D · M03-B/C/D 요약 카드가 함께 쓰는
// 표 조각. 세 화면이 같은 카드를 쓰므로 크기 근거를 한 곳에 둔다.
//
// 크기는 디자인 export PNG에서 카드 테두리색(#e2e7ec)의 긴 가로줄을 찾아 잰 바깥
// 상자에 맞춘다(scripts/visual-verify.ts의 borderBox 게이트가 같은 방식으로 재현):
//   - 모바일 350x176, 데스크톱 640x200 (4행 카드 기준, 위·아래 테두리 각 1px 포함)
//   - 카드 자체의 세로 여백은 없고 행이 테두리에 바로 붙으며 구분선은 카드 폭 끝까지 이어진다.
//   - 행 높이는 (176-2)/4 = 43.5px(모바일), (200-2)/4 = 49.5px(데스크톱)로 균등하다.
// [주의] .pen 원본은 열지 못했다 — 위 수치는 export PNG 실측이다.

export const SUMMARY_CARD_CLASS =
  "w-full rounded-[12px] border border-app-line bg-app-surface text-left md:max-w-[640px]";

// min-h는 border-box 기준이라 행 하단 구분선(1px)을 포함한다. 값이 길어 줄이 바뀌는
// 경우에는 py-2가 여백을 지켜 주고 행이 그만큼 늘어난다.
//
// 값(dd)은 서버가 돌려준 사용자 입력이라 길이 상한이 없다(연락 희망 시간은 스키마상
// min(1) 자유 문자열). 공백 없는 긴 문자열이 오면 flex 항목의 기본 min-width:auto 때문에
// dd가 줄어들지 못해 카드 밖으로 넘쳤다(e2e/consult-flow-03.spec.ts 긴 값 케이스로 재현).
// min-w-0 + break-words로 dd가 줄바꿈되게 하고, 라벨(dt)은 shrink-0으로 줄어들지 않게
// 하며, gap-4로 값이 라벨에 붙지 않게 한다. 값이 짧을 때는 justify-between이 남는 폭을
// 쓰므로 기존 크기·위치는 바뀌지 않는다.
export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[43.5px] items-center justify-between gap-4 border-b border-app-line px-4 py-2 last:border-b-0 md:min-h-[49.5px]">
      <dt className="shrink-0 text-body-s text-bora-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-body-s font-semibold text-bora-ink">{value}</dd>
    </div>
  );
}
