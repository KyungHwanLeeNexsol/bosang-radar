"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/components/diagnosis/use-media-query";
import { cn } from "@/lib/utils";

// SPEC-B2C-CONSULT-001 M4 (design.md §7, D5; acceptance AC-B2CCONSULT-012~014)
// — 상담 동의 구조: 필수 ①개인정보 수집·이용 동의, 필수 ②건강정보 상담
// 이용 동의, 선택 ③마케팅 수신 동의. "자세히 보기"는 01-A2/M01-A2가 이미
// 확립한 Desktop Modal/Mobile Bottom Sheet 패턴(components/ui/dialog.tsx,
// drawer.tsx)을 재사용한다 — 포커스 트랩/ESC/배경클릭 닫기는 Base UI 기본
// 동작에 의존하며 커스텀 로직을 작성하지 않는다(Enforce Simplicity).
//
// D5 — 실제 법무 확정 문구는 이 milestone의 범위 밖이다. 상세 뷰 자체를
// isPolicyReady로 게이트한다: 정책이 준비되지 않았으면 "자세히 보기"
// 트리거를 아예 렌더링하지 않고, 정직한 "준비 중" 문구만 보여준다(법무
// 문구를 지어내지 않는다 — consult-view.tsx M3 placeholder와 동일한 원칙).

type ConsentItemKey = "piiCollection" | "healthInfoUse" | "marketing";

interface ConsentItemDef {
  key: ConsentItemKey;
  label: string;
  badge: "필수" | "선택";
}

const REQUIRED_ITEMS: ConsentItemDef[] = [
  { key: "piiCollection", label: "상담 신청을 위한 개인정보 수집 · 이용 동의", badge: "필수" },
  { key: "healthInfoUse", label: "진단 결과 등 건강정보의 상담 이용 동의", badge: "필수" },
];

const OPTIONAL_ITEM: ConsentItemDef = {
  key: "marketing",
  label: "보상 관련 정보 및 마케팅 안내 수신 동의",
  badge: "선택",
};

interface ConsultConsentGroupProps {
  piiCollection: boolean;
  healthInfoUse: boolean;
  marketing: boolean;
  onPiiCollectionChange: (checked: boolean) => void;
  onHealthInfoUseChange: (checked: boolean) => void;
  onMarketingChange: (checked: boolean) => void;
  isPolicyReady: boolean;
}

function DetailOverlayBody({ label }: { label: string }) {
  return (
    <p className="text-body-s text-bora-ink-2">
      &ldquo;{label}&rdquo; 항목의 상세 안내 문구는 아직 확정되지 않았습니다. 법무 검토가 끝나는
      대로 이 화면에 반영됩니다.
    </p>
  );
}

export function ConsultConsentGroup({
  piiCollection,
  healthInfoUse,
  marketing,
  onPiiCollectionChange,
  onHealthInfoUseChange,
  onMarketingChange,
  isPolicyReady,
}: ConsultConsentGroupProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const [openDetailKey, setOpenDetailKey] = React.useState<ConsentItemKey | null>(null);

  const checkedByKey: Record<ConsentItemKey, boolean> = {
    piiCollection,
    healthInfoUse,
    marketing,
  };
  const onChangeByKey: Record<ConsentItemKey, (checked: boolean) => void> = {
    piiCollection: onPiiCollectionChange,
    healthInfoUse: onHealthInfoUseChange,
    marketing: onMarketingChange,
  };

  function renderRow(item: ConsentItemDef) {
    const checkboxId = `consult-consent-${item.key}`;
    return (
      <div
        key={item.key}
        data-testid={`consult-consent-row-${item.key}`}
        className="flex items-center justify-between gap-3 border-b border-app-line py-3 last:border-b-0"
      >
        <label htmlFor={checkboxId} className="flex items-center gap-2.5">
          <input
            id={checkboxId}
            data-testid={`consult-consent-checkbox-${item.key}`}
            type="checkbox"
            checked={checkedByKey[item.key]}
            onChange={(event) => onChangeByKey[item.key](event.target.checked)}
            className="size-4 shrink-0 accent-bora-accent"
          />
          <span
            className={cn(
              "rounded-[4px] px-1.5 py-0.5 text-label-s font-semibold",
              item.badge === "필수"
                ? "bg-bora-accent/10 text-bora-accent"
                : "bg-app-surface-inset text-bora-ink-3"
            )}
          >
            {item.badge}
          </span>
          <span className="text-sm font-medium text-bora-ink">{item.label}</span>
        </label>

        {isPolicyReady ? (
          isDesktop ? (
            <Dialog
              open={openDetailKey === item.key}
              onOpenChange={(open) => setOpenDetailKey(open ? item.key : null)}
            >
              <DialogTrigger
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0 px-0")}
              >
                자세히 보기
                <ChevronRight aria-hidden="true" />
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>{item.label}</DialogTitle>
                <DetailOverlayBody label={item.label} />
                <DialogClose className={cn(buttonVariants({ variant: "diagnosis" }))}>
                  확인
                </DialogClose>
              </DialogContent>
            </Dialog>
          ) : (
            <Drawer
              open={openDetailKey === item.key}
              onOpenChange={(open) => setOpenDetailKey(open ? item.key : null)}
            >
              <DrawerTrigger
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0 px-0")}
              >
                자세히 보기
                <ChevronRight aria-hidden="true" />
              </DrawerTrigger>
              <DrawerContent>
                <DrawerTitle>{item.label}</DrawerTitle>
                <DetailOverlayBody label={item.label} />
                <DrawerClose className={cn(buttonVariants({ variant: "diagnosis" }))}>
                  확인
                </DrawerClose>
              </DrawerContent>
            </Drawer>
          )
        ) : (
          <span className="shrink-0 text-label-s text-bora-ink-4">상세 안내 준비 중</span>
        )}
      </div>
    );
  }

  return (
    <div data-testid="consult-consent-group">
      <div className="rounded-[12px] border border-app-line px-4">
        {REQUIRED_ITEMS.map(renderRow)}
      </div>

      <p className="mt-4 text-label-s text-bora-ink-3">
        선택 동의 — 동의하지 않아도 상담 신청은 가능합니다
      </p>
      <div className="mt-1.5 rounded-[12px] border border-app-line px-4">
        {renderRow(OPTIONAL_ITEM)}
      </div>
    </div>
  );
}
