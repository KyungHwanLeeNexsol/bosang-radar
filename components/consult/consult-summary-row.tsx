// SPEC-B2C-CONSULT-001 (design.md §10) — 03-B/C/D · M03-B/C/D 요약 카드가 함께 쓰는
// 표 조각. 세 화면이 같은 카드를 쓰므로 크기 근거를 한 곳에 둔다.
//
// 크기는 디자인 export PNG에서 카드 테두리색(#e2e7ec)의 긴 가로줄을 찾아 잰 바깥
// 상자에 맞춘다(scripts/visual-verify.ts의 borderBox 게이트가 같은 방식으로 재현):
//   - 모바일 350x176, 데스크톱 640x200 (4행 카드 기준, 위·아래 테두리 각 1px 포함)
//   - 카드 자체의 세로 여백은 없고 행이 테두리에 바로 붙으며 구분선은 카드 폭 끝까지 이어진다.
//   - 행 높이는 (176-2)/4 = 43.5px(모바일), (200-2)/4 = 49.5px(데스크톱)로 균등하다.
// 위 수치는 export PNG 실측이며, .pen 원본에서도 같은 값을 직접 읽어 확인했다
// (카드 350x176 / 640x200, 라벨 모바일 "희망 시간" · 데스크톱 "연락 희망 시간").

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
//
// mobileLabel: .pen은 연락 희망 시간 행 라벨을 모바일에서 "희망 시간"으로 줄여 쓴다.
// 두 라벨을 모두 그리고 CSS로 하나만 보이게 하며(display:none은 보조기기에서도 빠진다),
// 화면 폭에 따라 다른 글자를 쓰는 데 JS 폭 감지를 쓰지 않는다.
//
// 글씨는 .pen 카드 행에서 직접 읽은 값이다(모바일 / 데스크톱): 라벨 12 / 12.5px 500 #6b7684,
// 값 12.5 / 13.5px 700 #111820, 행 좌우 패딩 15 / 20. 행 높이는 위 min-h가 정한다.
// tone="warn": .pen 03-C의 처리 상태 값만 경고색(#8a5a12)이다.
export function SummaryRow({
  label,
  mobileLabel,
  value,
  tone,
}: {
  label: string;
  mobileLabel?: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="flex min-h-[43.5px] items-center justify-between gap-4 border-b border-app-line px-[15px] py-2 last:border-b-0 md:min-h-[49.5px] md:px-5">
      <dt className="shrink-0 text-[12px] font-medium text-bora-ink-3 md:text-[12.5px]">
        {mobileLabel ? (
          <>
            <span className="md:hidden">{mobileLabel}</span>
            <span className="hidden md:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </dt>
      <dd
        className={`min-w-0 break-words text-[12.5px] font-bold md:text-[13.5px] ${
          tone === "warn" ? "text-bora-warn" : "text-bora-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
