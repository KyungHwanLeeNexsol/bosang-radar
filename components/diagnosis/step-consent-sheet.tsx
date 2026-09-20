"use client";

import * as React from "react";
import { Lock, X } from "lucide-react";

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
      {/* D2(4차 재작업) — DOM 실측 결과 시트 높이가 디자인(347px)보다
          28px 낮고(319px) 상단 위치도 그만큼 아래로 처짐(허용 오차
          Mobile 4px 초과) — 패딩을 p-6(24px)에서 p-7(28px)로, 요소 간격을
          gap-4(기본)에서 gap-5로 살짝 늘려 높이를 보정한다. */}
      <DrawerContent className="h-auto max-h-[85vh] gap-5 p-7">
        <DrawerClose
          aria-label="닫기"
          className="absolute top-4 right-4 inline-flex size-7 items-center justify-center rounded-full text-bora-ink-3 outline-none transition-colors hover:bg-app-surface-inset hover:text-bora-ink focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" aria-hidden="true" />
        </DrawerClose>

        {/* D2(5차 재작업) — design/exports/M01-A2는 제목이 2줄로
            줄바꿈된다(전체 시트 폭 그대로 두면 1줄에 다 들어가 버림) —
            제목 요소에만 폭 제한을 둬 줄바꿈 지점을 재현한다. */}
        <DrawerTitle className="max-w-[230px] text-[20px] font-bold">
          건강정보 처리에 동의해 주세요
        </DrawerTitle>
        <DrawerDescription id={CONSENT_DESCRIPTION_ID} className="text-sm">
          입력한 사고·질병·치료 정보는 보상 가능성 분석을 위해 처리됩니다.
        </DrawerDescription>

        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-app-line px-4 py-3">
          <label htmlFor={CONSENT_CHECKBOX_ID} className="flex items-center gap-2.5">
            <input
              id={CONSENT_CHECKBOX_ID}
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
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              내용 보기
            </DrawerTrigger>
            {/* AC-B2CDIAG-004 — 상세 오버레이 닫힘 시 포커스가 이 트리거로
                복귀해야 하므로 finalFocus를 명시적으로 지정한다(중첩 Drawer
                구조에서 기본 휴리스틱이 트리거를 못 찾는 경우를 방어). */}
            <DrawerContent finalFocus={detailTriggerRef}>
              <DrawerTitle>건강정보 등 민감정보 처리 동의</DrawerTitle>
              <ConsentDetailContent />
              <DrawerClose className={cn(buttonVariants({ variant: "diagnosis" }))}>확인</DrawerClose>
              <p className="text-center text-meta text-bora-ink-3">
                확인해도 동의 체크박스는 자동 선택되지 않습니다
              </p>
            </DrawerContent>
          </Drawer>
        </div>

        <Button
          type="button"
          variant="diagnosis"
          disabled={!consentGiven}
          className={cn(
            !consentGiven &&
              "bg-app-surface-inset text-bora-ink-4 shadow-none disabled:opacity-100 hover:bg-app-surface-inset"
          )}
          onClick={onConfirm}
        >
          {!consentGiven ? <Lock aria-hidden="true" className="size-4" /> : null}
          동의하고 진단하기
        </Button>

        <p className="text-center text-meta text-bora-ink-3">
          필수 동의 후 진단을 시작할 수 있습니다.
        </p>
      </DrawerContent>
    </Drawer>
  );
}
