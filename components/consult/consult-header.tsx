import Link from "next/link";

// SPEC-B2C-CONSULT-001 D-RUN-1 (design/exports/03-*.png, M03-*.png) — 03 계열
// 전 화면(폼·성공·중복·실패)에 공통으로 등장하는 BORA 사이트 헤더.
//
// [.pen 최우선 지시 반영] 값은 .pen Topbar에서 직접 읽었다(데스크톱 / 모바일):
//   높이 64 / 52(테두리 포함 고정 높이), 좌우 패딩 40 / 18, 아래 테두리 1px,
//   로고 아이콘 30x30 라디우스 8 + "B" 15.8px 800, 워드마크 "BORA" 20px 800.
// 이전에는 diagnosis-header.tsx의 작은 로고·세로 패딩(모바일 높이 57)을 그대로 복사해
// 03 화면이 디자인보다 5px 아래로 밀렸다. 01/02 화면의 헤더(diagnosis-header.tsx)는
// 이 SPEC 범위 밖이라 건드리지 않는다.
//
// 오른쪽 콘텐츠는 variant별로 다르다:
//   - "form"(03/03-A2 폼 화면): "← 진단 결과로 돌아가기" 13px 500 #6b7684 링크.
//     모바일은 "← 결과로" 12.5px 600으로 축약(M03).
//   - "outcome"(03-B/C/D 성공·중복·실패): 데스크톱에만 "사고 · 질병 보상 진단"
//     12.5px #6b7684 텍스트. 이미 각 화면 본문에 더 큰 "진단 결과로 돌아가기" CTA가
//     있어 헤더에는 버튼을 두지 않고, 모바일은 로고만 둔다(M03-B/C/D).

interface ConsultHeaderProps {
  variant: "form" | "outcome";
}

export function ConsultHeader({ variant }: ConsultHeaderProps) {
  return (
    <header
      data-testid="consult-header"
      className="flex h-[52px] w-full items-center justify-between border-b border-app-line bg-app-surface px-[18px] md:h-16 md:px-10"
    >
      <div className="flex items-center gap-2">
        <span
          data-testid="consult-header-mark"
          className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-bora-accent text-[15.8px] leading-none font-extrabold tracking-[-0.33px] text-white"
        >
          B
        </span>
        <span
          data-testid="consult-header-wordmark"
          className="text-[20px] leading-[1.1] font-extrabold tracking-[-0.44px] text-bora-ink"
        >
          BORA
        </span>
      </div>

      {variant === "form" ? (
        <Link
          href="/result"
          data-testid="consult-header-back"
          className="flex items-center gap-1 text-[12.5px] font-semibold text-bora-ink-3 transition-colors hover:text-bora-ink md:text-[13px] md:font-medium"
        >
          <span aria-hidden="true">←</span>
          <span className="md:hidden">결과로</span>
          <span className="hidden md:inline">진단 결과로 돌아가기</span>
        </Link>
      ) : (
        <span className="hidden text-[12.5px] text-bora-ink-3 md:inline">
          사고 · 질병 보상 진단
        </span>
      )}
    </header>
  );
}
