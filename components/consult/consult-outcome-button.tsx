import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

// SPEC-B2C-CONSULT-001 — .pen 03-B/C/D · M03-B/C/D 하단 버튼. 세 종류를 한 조각으로 그린다:
//   link   : 실제 이동(next/link)
//   button : 동작 버튼(다시 시도하기 — busy면 눌러도 무시)
//   stub   : 목적지가 아직 없는 버튼. .pen 모양(비활성 색)으로 그리되 이동하지 않고
//            aria-disabled + "준비 중" 표기를 붙인다. 죽은 링크를 만들지 않기 위한 결정이다.
//
// 값은 .pen에서 직접 읽었다(데스크톱 / 모바일):
//   주 버튼  : accent 채움, 라디우스 9 / 10, 패딩 14x22, 글자 14.5 / 15px 700, 흰색, 아이콘 16, 간격 8 / 7
//   보조 버튼: 흰 바탕 + #cbd3db 테두리, 패딩 14x20, 글자 14.5px 500 / 600, 아이콘 15(모바일은 글자만)
//   모바일   : 세로로 쌓고 폭 100%, 높이 50
//   비활성   : #eff2f5 바탕 + #cbd3db 테두리 + #95a0ad 글자(디자인 시스템 Disabled)

export type OutcomeAction =
  | { type: "link"; href: string }
  | { type: "button"; onClick: () => void; busy?: boolean }
  | { type: "stub" };

interface OutcomeButtonProps {
  variant: "primary" | "secondary";
  icon?: LucideIcon;
  testId: string;
  action: OutcomeAction;
  children: ReactNode;
}

const BASE =
  "relative inline-flex h-[50px] w-full items-center justify-center rounded-[10px] text-center transition-colors md:h-auto md:w-auto md:rounded-[9px]";

// 모양(레이아웃)과 색을 나눠 두면 stub이 같은 자리·같은 크기를 그대로 유지한 채 색만 바뀐다.
const LAYOUT = {
  primary: "gap-[7px] px-[22px] text-[15px] font-bold md:gap-2 md:py-[14px] md:text-[14.5px]",
  secondary: "px-5 text-[14.5px] font-semibold md:gap-2 md:py-[14px] md:font-medium",
} as const;

const COLOR = {
  primary: "bg-bora-accent text-white hover:bg-bora-accent-deep",
  secondary:
    "border border-app-line-strong bg-app-surface text-bora-ink-2 hover:bg-app-surface-sub",
  disabled:
    "cursor-not-allowed border border-app-line-strong bg-app-surface-inset text-bora-ink-4 hover:bg-app-surface-inset",
} as const;

export function OutcomeButton({
  variant,
  icon: Icon,
  testId,
  action,
  children,
}: OutcomeButtonProps) {
  const isStub = action.type === "stub";
  const busy = action.type === "button" && action.busy === true;
  const color = isStub ? COLOR.disabled : COLOR[variant];
  const className = `${BASE} ${LAYOUT[variant]} ${color}`;

  const content = (
    <>
      {Icon ? (
        <Icon
          aria-hidden="true"
          // 보조 버튼은 모바일에서 글자만 그린다(.pen M03-B/C/D). 주 버튼은 모바일에도 아이콘이 있다.
          className={
            variant === "secondary" ? "hidden size-[15px] shrink-0 md:block" : "size-4 shrink-0"
          }
        />
      ) : null}
      {children}
      {isStub ? (
        <span className="absolute -top-2 right-3 rounded-full border border-app-line bg-app-surface px-1.5 text-[10px] leading-4 font-semibold text-bora-ink-3">
          준비 중
        </span>
      ) : null}
    </>
  );

  if (action.type === "link") {
    return (
      <Link href={action.href} data-testid={testId} className={className}>
        {content}
      </Link>
    );
  }

  if (action.type === "stub") {
    return (
      <button type="button" data-testid={testId} aria-disabled="true" className={className}>
        {content}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid={testId}
      className={className}
      aria-disabled={busy}
      aria-busy={busy}
      onClick={() => {
        if (!busy) {
          action.onClick();
        }
      }}
    >
      {content}
    </button>
  );
}

/** 두 버튼을 묶는 줄 — 모바일은 세로(간격 9), 데스크톱은 가로 가운데(간격 10). */
export function OutcomeActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-[9px] md:w-auto md:flex-row md:justify-center md:gap-[10px]">
      {children}
    </div>
  );
}
