import type { ReactNode, Ref } from "react";
import type { LucideIcon } from "lucide-react";

import { ConsultFooter } from "./consult-footer";

// SPEC-B2C-CONSULT-001 — 03-B/C/D · M03-B/C/D 세 결과 화면이 같은 틀을 쓴다:
//   아이콘 원 → 제목 → 부제 → 요약 카드 → (안내 박스) → 버튼 줄 → (데스크톱) 푸터.
//
// 세로 간격은 .pen에서 직접 읽은 값이다(데스크톱 / 모바일):
//   위 여백 52 / 34, 아래 50 / 26, 원 64 / 58, 원→제목 22 / 18, 제목→부제 12 / 10,
//   부제→카드 28 / 22, 카드→안내 22 / 18, 안내→버튼 22 / 16, 카드→버튼(안내 없음) 22 / 18,
//   버튼→푸터 30. 데스크톱 본문 폭은 640, 모바일은 350(좌우 20).
// 이 값들은 scripts/visual-verify.ts가 같은 방식으로 재현해 게이트로 잰다(단위 4).

const TONE = {
  ok: "bg-bora-ok-soft text-bora-ok",
  warn: "bg-bora-warn-soft text-bora-warn",
  danger: "bg-bora-danger-soft text-bora-danger",
} as const;

interface OutcomeFrameProps {
  testId: string;
  tone: keyof typeof TONE;
  icon: LucideIcon;
  title: ReactNode;
  /** 화면 전환 직후 스크롤 위치 복원과 함께 이 제목으로 포커스를 옮기는 데 쓰인다(consult-view.tsx). */
  titleRef?: Ref<HTMLHeadingElement>;
  subtitle: ReactNode;
  subtitleTestId?: string;
  /** 실패 화면은 부제가 곧 알림이라 role="alert"를 준다. */
  subtitleRole?: "alert";
  card: ReactNode;
  note?: ReactNode;
  actions: ReactNode;
}

export function OutcomeFrame({
  testId,
  tone,
  icon: Icon,
  title,
  titleRef,
  subtitle,
  subtitleTestId,
  subtitleRole,
  card,
  note,
  actions,
}: OutcomeFrameProps) {
  return (
    <div
      data-testid={testId}
      className="mx-auto flex w-full max-w-[640px] flex-col items-center px-5 pt-[34px] pb-[26px] text-center md:px-0 md:pt-[52px] md:pb-[50px]"
    >
      <span
        aria-hidden="true"
        className={`flex size-[58px] items-center justify-center rounded-full md:size-16 ${TONE[tone]}`}
      >
        <Icon className="size-[27px] md:size-[30px]" />
      </span>
      <h1
        ref={titleRef}
        tabIndex={-1}
        data-testid="consult-outcome-title"
        className="mt-[18px] text-[22px] leading-[1.45] font-bold tracking-[-0.8px] text-bora-ink outline-none md:mt-[22px] md:text-[27px] md:leading-[1.45] md:tracking-[-1px]"
      >
        {title}
      </h1>
      <p
        role={subtitleRole}
        data-testid={subtitleTestId}
        className="mt-[10px] text-[13px] leading-[1.72] text-bora-ink-3 md:mt-3 md:text-[14px] md:leading-[1.75]"
      >
        {subtitle}
      </p>

      <div className="mt-[22px] w-full md:mt-7">{card}</div>
      {note ? <div className="mt-[18px] w-full md:mt-[22px]">{note}</div> : null}

      <div className={`w-full md:w-auto md:mt-[22px] ${note ? "mt-4" : "mt-[18px]"}`}>
        {actions}
      </div>

      <ConsultFooter />
    </div>
  );
}

interface OutcomeNoteProps {
  testId: string;
  icon: LucideIcon;
  children: ReactNode;
}

/** 카드 아래 안내 박스 — 바탕 #f8fafb, 테두리 #e2e7ec, 라디우스 10 / 9, 글자 12.5 / 11.5px. */
export function OutcomeNote({ testId, icon: Icon, children }: OutcomeNoteProps) {
  return (
    <div
      data-testid={testId}
      className="flex w-full items-start gap-2 rounded-[9px] border border-app-line bg-app-surface-sub px-[14px] py-3 text-left md:gap-[9px] md:rounded-[10px] md:px-4 md:py-[13px]"
    >
      <Icon
        aria-hidden="true"
        className="mt-[2px] size-[14px] shrink-0 text-bora-ink-3 md:size-[15px]"
      />
      <p className="text-[11.5px] leading-[1.65] text-bora-ink-2 md:text-[12.5px] md:leading-[1.7]">
        {children}
      </p>
    </div>
  );
}
