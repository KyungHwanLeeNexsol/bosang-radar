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
export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[43.5px] items-center justify-between border-b border-app-line px-4 py-2 last:border-b-0 md:min-h-[49.5px]">
      <dt className="text-body-s text-bora-ink-3">{label}</dt>
      <dd className="text-body-s font-semibold text-bora-ink">{value}</dd>
    </div>
  );
}
