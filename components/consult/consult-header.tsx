import Link from "next/link";

// SPEC-B2C-CONSULT-001 D-RUN-1 (design/exports/03-*.png, M03-*.png) — 03 계열
// 전 화면(폼·성공·중복·실패)에 공통으로 등장하는 BORA 사이트 헤더.
// components/diagnosis/diagnosis-header.tsx와 동일한 시각 기준(높이·배경·
// 로고 마크업)을 그대로 재사용해 01/02/03이 동일한 헤더 높이를 유지한다
// (Enforce Simplicity — 헤더 markup을 두 번 만들지 않고, diagnosis-header가
// 이미 확립한 클래스를 복사해 03 전용 오른쪽 콘텐츠만 다르게 둔다. props가
// 하나뿐인 얇은 컴포넌트라 diagnosis-header 자체를 import해 재사용하기보다
// 새로 만드는 편이 그 컴포넌트의 진단 전용 문구/버튼과 03의 독립적 변형을
// 섞지 않는다).
//
// 디자인 대조(03/03-A2 vs 03-B/03-C/03-D, 데스크톱 vs 모바일) 결과 오른쪽
// 콘텐츠가 variant별로 달라진다:
//   - "form"(03/03-A2 폼 화면): "← 진단 결과로 돌아가기" 링크. 모바일은
//     "← 결과로"로 축약(M03 캡처 기준).
//   - "outcome"(03-B/C/D 성공·중복·실패): "사고·질병 보상 진단" 라벨
//     텍스트만(diagnosis-header의 데스크톱 라벨과 동일 문구) — 이미 각
//     화면 본문에 더 큰 "진단 결과로 돌아가기" CTA가 있어 헤더에는 버튼을
//     두지 않는다. 모바일은 아예 비움(M03-B/C/D 캡처 — 로고만).

interface ConsultHeaderProps {
  variant: "form" | "outcome";
}

export function ConsultHeader({ variant }: ConsultHeaderProps) {
  return (
    <header
      data-testid="consult-header"
      className="flex w-full items-center justify-between border-b border-app-line bg-app-surface px-4 py-3.5 md:px-8"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-bora-accent text-sm font-bold text-white">
          B
        </span>
        <span className="text-base font-extrabold tracking-tight text-bora-ink">BORA</span>
      </div>

      {variant === "form" ? (
        <Link
          href="/result"
          data-testid="consult-header-back"
          className="flex items-center gap-1 text-body-s font-medium text-bora-ink-2 transition-colors hover:text-bora-ink"
        >
          <span aria-hidden="true">←</span>
          <span className="md:hidden">결과로</span>
          <span className="hidden md:inline">진단 결과로 돌아가기</span>
        </Link>
      ) : (
        <span className="hidden text-body-s text-bora-ink-3 md:inline">사고·질병 보상 진단</span>
      )}
    </header>
  );
}
