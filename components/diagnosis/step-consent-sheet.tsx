"use client";

import * as React from "react";
import { X } from "lucide-react";

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
      <DrawerContent>
        <DrawerClose
          aria-label="닫기"
          className="absolute top-4 right-4 inline-flex size-7 items-center justify-center rounded-full text-bora-ink-3 outline-none transition-colors hover:bg-app-surface-inset hover:text-bora-ink focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" aria-hidden="true" />
        </DrawerClose>

        <DrawerTitle>건강정보 처리에 동의해 주세요</DrawerTitle>
        <DrawerDescription id={CONSENT_DESCRIPTION_ID}>
          입력한 사고·질병·치료 정보는 보상 가능성 분석을 위해 처리됩니다.
        </DrawerDescription>

        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-app-line px-4 py-3.5">
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

        <Button type="button" variant="diagnosis" disabled={!consentGiven} onClick={onConfirm}>
          동의하고 진단하기
        </Button>

        <p className="text-center text-meta text-bora-ink-3">
          필수 동의 후 진단을 시작할 수 있습니다.
        </p>
      </DrawerContent>
    </Drawer>
  );
}
