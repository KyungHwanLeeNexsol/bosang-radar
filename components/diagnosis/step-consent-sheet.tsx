"use client";

import * as React from "react";
import { ChevronRight, Lock, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { ConsentDetailContent } from "./consent-detail-content";

// SPEC-B2C-DIAGNOSIS-001 M4 (design.md §14, §17; acceptance.md
// AC-B2CDIAG-001~006) — M01-A2 Mobile 필수 민감정보 동의 Bottom Sheet.
// StepConsentModal(Desktop, step-consent-modal.tsx)과 동일한 controlled
// 계약(consentGiven/onConsentChange/onConfirm/onCancel)을 공유한다
// (design.md §5, §18.2 "Desktop·Mobile 반응형 전환 — 상태 머신과 데이터
// 모델은 두 폭에서 완전히 동일하다"). 포커스 트랩·ESC/배경클릭 닫기·상세
// 오버레이 닫힘 시 트리거로의 포커스 복귀는 Base UI Drawer의 기본 동작에
// 의존한다(REQ-B2CDIAG-008, Enforce Simplicity).
//
// M7 — diagnosis-flow.tsx가 useMediaQuery(768px)로 이 컴포넌트와
// StepConsentModal 중 하나를 렌더링하도록 배선한다(design.md §13).
//
// M-fix-2 — detailOpen을 부모로 끌어올린 이유와 닫기(X) 버튼 추가 이유는
// step-consent-modal.tsx 상단 주석과 동일하다(design/exports/M01-A2).

const CONSENT_DESCRIPTION_ID = "diagnosis-consent-sheet-description";
const CONSENT_CHECKBOX_ID = "diagnosis-consent-sheet-checkbox";

interface StepConsentSheetProps {
  consentGiven: boolean;
  onConsentChange: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  detailOpen: boolean;
  onDetailOpenChange: (open: boolean) => void;
}

export function StepConsentSheet({
  consentGiven,
  onConsentChange,
  onConfirm,
  onCancel,
  detailOpen,
  onDetailOpenChange,
}: StepConsentSheetProps) {
  const detailTriggerRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        // AC-B2CDIAG-004 — 닫기(X)/ESC/배경 클릭이 모두 이 콜백 하나로
        // 들어온다(design.md §18.1 consent 상태 "뒤로 가기 동작").
        if (!open) {
          onCancel();
        }
      }}
    >
      {/* D2(3차 원격 결함 재작업) — design/exports/M01-A2는 화면 위쪽까지
          거의 꽉 채우는 h-[88vh] 고정 높이가 아니라 콘텐츠 크기에 맞춰
          시작 위치가 아래로 내려온 min-height 구조다. h-[88vh]를
          max-h-[85vh]로 바꿔 실제 콘텐츠 높이만큼만 차오르게 하고, 콘텐츠가
          길어지는 예외 상황을 대비해 최대 높이만 유지한다(DrawerContent는
          className을 twMerge로 병합하므로 기본 h-[88vh]를 대체한다). */}
      {/* D2(6차 재작업) — 동일 ink-pixel 좌표계로 재측정한 결과 시트
          높이가 디자인(347px, 기준: 시트-top~화면-bottom)보다 30px
          컸다(377px) — 5차에서 늘린 p-7/gap-5가 과했다. p-6로 되돌리고
          gap을 요소쌍별 실측 간격으로 대체한다. 제목 2줄 wrap은 유지.
          (잔여 위험: 제목 자체의 시트 내 상대 위치가 디자인보다 이르게
          측정되나, 상단 패딩을 늘리면 전체 높이 예산을 다시 초과하게
          돼 외곽 높이 일치를 우선했다.) */}
      {/* D2(7차) — design/exports/M01-A2의 시트 내부 여백은 16px다(제목·동의
          행·CTA가 모두 x=16에서 시작, CTA 폭 358 = 390−16×2). p-6(24px)은
          8px 과했다. */}
      {/* D2(8차) — 시트는 bottom 고정 + 높이 auto라, 제목 위쪽 여백을 늘려도
          시트가 위로 자랄 뿐 제목의 절대 위치는 그대로다. 제목을 아래로
          내리려면 제목 "아래" 간격을 줄여야 한다(설명의 mt-[5px]→0). 그렇게
          줄어든 5px와 핸들이 flow에서 빠지며 사라진 4px를 pt로 되돌려
          시트 상단(762)과 높이(348)를 그대로 유지한다. */}
      <DrawerContent className="h-auto max-h-[85vh] gap-0 px-4 pt-[60px] pb-[20px]">
        <DrawerClose
          aria-label="닫기"
          className="absolute top-4 right-4 inline-flex size-7 items-center justify-center rounded-full text-bora-ink-3 outline-none transition-colors hover:bg-app-surface-inset hover:text-bora-ink focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" aria-hidden="true" />
        </DrawerClose>

        {/* D2(5차 재작업) — design/exports/M01-A2는 제목이 2줄로
            줄바꿈된다(전체 시트 폭 그대로 두면 1줄에 다 들어가 버림) —
            제목 요소에만 폭 제한을 둬 줄바꿈 지점을 재현한다. */}
        {/* D2(7차) — design/exports/M01-A2는 "건강정보 처리에" / "동의해
            주세요"로 끊긴다(기존 폭 제한은 "…동의해" / "주세요"로 끊었다). */}
        {/* D2(8차) — 7차는 줄 "수"만 검사해서 실제로는 "건강정보 처리에 동의" /
            "해 주세요"로 단어 한가운데가 끊기고 있던 것을 통과시켰다. CSS
            기본값은 한글을 글자 단위로 끊으므로 폭 제한만으로는 어절 경계를
            보장할 수 없다 — break-keep(word-break: keep-all)으로 어절 단위
            줄바꿈을 강제한다. */}
        <DrawerTitle
          data-testid="diagnosis-consent-title"
          // D2(8차) — 줄바꿈을 바로잡자 글자 크기 오차가 드러났다. 7차는
          // "건강정보 처리에 동의"라는 잘못 끊긴 첫 줄이 디자인 폭(122)과
          // 우연히 맞아떨어져 15px를 통과시켰다. 올바른 첫 줄("건강정보
          // 처리에")로 재면 15px에서 94px이므로 디자인 122px에 맞는 크기는
          // 19.5px다. max-w는 어절 하나가 더 붙지 않을 만큼만 넓힌다.
          className="max-w-[150px] text-[19.5px] leading-[30px] font-bold break-keep"
        >
          건강정보 처리에 동의해 주세요
        </DrawerTitle>
        <DrawerDescription
          id={CONSENT_DESCRIPTION_ID}
          data-testid="diagnosis-consent-description"
          // D2(9차) — 8차는 이 문단의 줄 "수"조차 검사하지 않았다. 지점까지
          // 검사하자 text-sm(14px)에서는 "…처리됩" / "니다."로 디자인보다 한
          // 글자 일찍 끊기는 것이 드러났다. 동일 문자열의 잉크 폭으로 역산한
          // 디자인 글자 크기는 13.3px다(디자인 잉크 341.5px, 14px 구현
          // 359.25px → 13.31px). 다만 그 값은 문장 전체가 한 줄에 들어가
          // 버리는 쪽 경계(13.33px)보다 0.02px 낮다 — 디자인 도구와 브라우저의
          // 글자 배치 차이(1px 미만)가 그대로 드러나는 구간이다. 줄바꿈이
          // 디자인과 같아지는 구간(13.34~13.91px)과 폭 오차가 허용치 안에
          // 들어오는 구간(13.13~13.44px)이 겹치는 곳의 가운데인 13.4px를
          // 쓴다(폭 오차 2.8px, 줄바꿈 여유 1.9px). 행간은 디자인 실측 줄
          // 간격 21px로 고정한다 — 임의 크기를 쓰면 Tailwind text-sm의 기본
          // 행간 20px이 사라지기 때문이다.
          // 행간을 21px로 잡으면서 이 문단의 박스가 2px 자라 설명이 디자인보다
          // 5px 위에 놓였다. 시트는 아래쪽 고정 + 높이 auto라 위쪽 여백만
          // 늘리면 시트가 그만큼 위로 자라 제목이 따라 올라간다 — 설명 위에
          // 5px을 더하고 아래(동의 행)에서 같은 5px을 빼 전체 높이를 유지한다.
          className="mt-[5px] text-[13.4px] leading-[21px]"
        >
          {/* D2(9차) — Desktop 모달과 동일한 정정(가운뎃점 앞뒤 공백).
              design/exports/M01-A2 기준. */}
          입력한 사고 · 질병 · 치료 정보는 보상 가능성 분석을 위해 처리됩니다.
        </DrawerDescription>

        <div
          data-testid="diagnosis-consent-row"
          className="mt-[12px] flex items-center justify-between gap-3 rounded-[10px] border border-app-line px-4 py-[10px]"
        >
          <label htmlFor={CONSENT_CHECKBOX_ID} className="flex items-center gap-2.5">
            <input
              id={CONSENT_CHECKBOX_ID}
              data-testid="diagnosis-consent-checkbox"
              type="checkbox"
              checked={consentGiven}
              onChange={(event) => onConsentChange(event.target.checked)}
              aria-describedby={CONSENT_DESCRIPTION_ID}
              className="size-4 shrink-0 accent-primary"
            />
            <span className="rounded-[4px] bg-primary/10 px-1.5 py-0.5 text-label-s font-semibold text-primary">
              필수
            </span>
            <span className="text-sm font-medium text-bora-ink">
              건강정보 등 민감정보 처리 동의
            </span>
          </label>

          <Drawer open={detailOpen} onOpenChange={onDetailOpenChange}>
            <DrawerTrigger
              ref={detailTriggerRef}
              // D2(9차) — design/exports/M01-A2에서 꺾쇠는 동의 행 안쪽
              // 오른쪽 끝(x=358)에 딱 붙는다. ghost sm 변형의 좌우 여백
              // 10px을 그대로 두면 꺾쇠가 12px 안쪽으로 들어가고, 트리거가
              // 그만큼 넓어져 왼쪽 라벨이 두 줄로 접히면서 행 높이가
              // 디자인(51px)보다 11px 커진다. 행은 justify-between이라
              // 트리거가 오른쪽에 붙으므로 좌측 여백은 눈에 보이는 위치를
              // 바꾸지 않고 폭만 잡아먹는다 — 양쪽 모두 없앤다. 글자와
              // 꺾쇠 사이 간격은 변형이 주는 gap-1(+아이콘 자체 여백)이
              // 디자인 실측 8.5px와 이미 일치해 건드리지 않는다.
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "px-0")}
            >
              {/* D2(9차) — Desktop 모달과 동일(design/exports/M01-A2). */}
              내용 보기
              <ChevronRight aria-hidden="true" />
            </DrawerTrigger>
            {/* AC-B2CDIAG-004 — 상세 오버레이 닫힘 시 포커스가 이 트리거로
                복귀해야 하므로 finalFocus를 명시적으로 지정한다(중첩 Drawer
                구조에서 기본 휴리스틱이 트리거를 못 찾는 경우를 방어). */}
            <DrawerContent finalFocus={detailTriggerRef}>
              <DrawerTitle>건강정보 등 민감정보 처리 동의</DrawerTitle>
              <ConsentDetailContent />
              <DrawerClose className={cn(buttonVariants({ variant: "diagnosis" }))}>
                확인
              </DrawerClose>
              <p className="text-center text-meta text-bora-ink-3">
                확인해도 동의 체크박스는 자동 선택되지 않습니다
              </p>
            </DrawerContent>
          </Drawer>
        </div>

        <Button
          type="button"
          data-testid="diagnosis-consent-cta"
          variant="diagnosis"
          disabled={!consentGiven}
          className={cn(
            "mt-[16px] h-[52px] w-full",
            !consentGiven &&
              "bg-app-surface-inset text-bora-ink-4 shadow-none disabled:opacity-100 hover:bg-app-surface-inset"
          )}
          onClick={onConfirm}
        >
          {!consentGiven ? <Lock aria-hidden="true" className="size-4" /> : null}
          동의하고 진단하기
        </Button>

        <p
          data-testid="diagnosis-consent-note"
          className="mt-[12px] text-center text-[13.9px] text-bora-ink-3"
        >
          필수 동의 후 진단을 시작할 수 있습니다.
        </p>
      </DrawerContent>
    </Drawer>
  );
}
