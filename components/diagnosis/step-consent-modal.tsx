"use client";

import * as React from "react";
import { Lock, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ConsentDetailContent } from "./consent-detail-content";

// SPEC-B2C-DIAGNOSIS-001 M4 (design.md §14, §17; acceptance.md
// AC-B2CDIAG-001~006) — 01-A2 Desktop 필수 민감정보 동의 Modal.
// consentGiven은 부모(diagnosis-flow.tsx) reducer가 소유한다(design.md §5,
// §17 "이전 단계 이동·재진입 시 동의 상태" 행) — 이 컴포넌트는 controlled로만
// 동작하며 자체 동의 상태를 갖지 않는다. 포커스 트랩·ESC/배경클릭 닫기·
// 상세 오버레이 닫힘 시 트리거로의 포커스 복귀는 모두 Base UI Dialog의
// 기본 동작에 의존한다(REQ-B2CDIAG-008, Enforce Simplicity).
//
// M-fix-2 — detailOpen은 더 이상 이 컴포넌트가 내부 useState로 소유하지
// 않는다. ?devStep=consent-detail(dev 전용)이 상세 오버레이를 강제로 열어야
// 하는데, 그 트리거는 diagnosis-flow.tsx에만 존재하므로 상태를 부모로
// 끌어올려(lift) controlled로 전달받는다(design.md §5 단일 상태 소유 원칙과
// 동일한 이유).
//
// M-fix-2 — design/exports/01-A2 캡처에는 우측 상단에 닫기(X) 버튼이
// 있으나 기존 구현에는 없었다. DialogClose는 클릭 시 동일한 onOpenChange
// 콜백을 통해 onCancel로 라우팅되므로 별도 핸들러를 추가하지 않는다.

const CONSENT_DESCRIPTION_ID = "diagnosis-consent-description";
const CONSENT_CHECKBOX_ID = "diagnosis-consent-checkbox";

interface StepConsentModalProps {
  consentGiven: boolean;
  onConsentChange: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  detailOpen: boolean;
  onDetailOpenChange: (open: boolean) => void;
}

export function StepConsentModal({
  consentGiven,
  onConsentChange,
  onConfirm,
  onCancel,
  detailOpen,
  onDetailOpenChange,
}: StepConsentModalProps) {
  const detailTriggerRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // AC-B2CDIAG-004 — 닫기(X)/ESC/배경 클릭이 모두 이 콜백 하나로
        // 들어온다(design.md §18.1 consent 상태 "뒤로 가기 동작").
        if (!open) {
          onCancel();
        }
      }}
    >
      {/* D2(4차 재작업) — 흰 박스 vs 어두운 backdrop 밝기 임계값으로
          재실측한 결과 모달 실제 폭은 559px, 높이 270px다(3차의 620px는
          과대 추정이었다 — 그때는 backdrop 뒤로 비치는 원 페이지 요소가
          측정에 섞여 들어갔다). 560px로 좁히고 패딩도 줄인다.
          D2(5차 재작업) — 4차 실측이 방향을 착각했다: 구현이 260px로
          디자인(270px)보다 10px 작았다(더 줄일 게 아니라 늘려야 했다).
          top 위치·폭은 그대로 두고 하단 패딩만 10px 늘려 총 높이를
          맞춘다. */}
      <DialogContent className="max-w-[560px] gap-3 p-6 pb-[34px]">
        <DialogClose
          aria-label="닫기"
          className="absolute top-4 right-4 inline-flex size-7 items-center justify-center rounded-full text-bora-ink-3 outline-none transition-colors hover:bg-app-surface-inset hover:text-bora-ink focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" aria-hidden="true" />
        </DialogClose>

        {/* design/exports/01-A2 제목은 DialogTitle 기본(text-h3=15px)보다
            뚜렷이 크다 — 이 모달에 한정해 20px로 키운다. */}
        <DialogTitle className="text-[20px] font-bold">건강정보 처리에 동의해 주세요</DialogTitle>
        <DialogDescription id={CONSENT_DESCRIPTION_ID} className="text-sm">
          입력한 사고·질병·치료 정보는 보상 가능성 분석을 위해 처리됩니다.
        </DialogDescription>

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

          <Dialog open={detailOpen} onOpenChange={onDetailOpenChange}>
            <DialogTrigger
              ref={detailTriggerRef}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              내용 보기
            </DialogTrigger>
            {/* AC-B2CDIAG-004 — 상세 오버레이 닫힘 시 포커스가 이 트리거로
                복귀해야 하므로 finalFocus를 명시적으로 지정한다(Base UI
                기본 휴리스틱이 중첩 Dialog 구조에서 트리거를 못 찾는 경우를
                방어). */}
            <DialogContent finalFocus={detailTriggerRef}>
              <DialogTitle>건강정보 등 민감정보 처리 동의</DialogTitle>
              <ConsentDetailContent />
              <DialogClose className={cn(buttonVariants({ variant: "diagnosis" }))}>확인</DialogClose>
              <p className="text-center text-meta text-bora-ink-3">
                확인해도 동의 체크박스는 자동 선택되지 않습니다
              </p>
            </DialogContent>
          </Dialog>
        </div>

        {/* D2(4차 재작업) — design/exports/01-A2는 미동의 상태 CTA를
            단순히 흐리게(opacity) 하지 않고, 밝은 회색 배경·회색 텍스트·
            자물쇠 아이콘으로 명확히 "잠김" 상태를 표시한다. Button의 기본
            disabled:opacity-50은 보라색을 옅게만 만들어 이 차이를
            재현하지 못하므로, 미동의일 때 색상 클래스를 직접 덮어쓴다. */}
        <Button
          type="button"
          variant="diagnosis"
          disabled={!consentGiven}
          className={cn(
            "h-10 rounded-[12px] text-base",
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
      </DialogContent>
    </Dialog>
  );
}
