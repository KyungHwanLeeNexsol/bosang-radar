"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";

// Base UI 기반 Dialog 프리미티브 래퍼(shadcn base-nova 스타일 컨벤션,
// components/ui/popover.tsx와 동일한 패턴 — "use client", data-slot, cn(),
// motion-reduce:transition-none). SPEC-B2C-DIAGNOSIS-001 M4에서 Desktop
// 동의(01-A2)/동의 상세(01-A3) Modal에 재사용하는 범용 프리미티브다.
// 포커스 트랩·배경 스크롤 잠금·ESC/배경 클릭 닫기는 Base UI Dialog가 기본
// 제공하는 동작에 의존하며, 커스텀 포커스 관리 로직은 작성하지 않는다
// (design.md §14, Enforce Simplicity).

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        // D2(8차) — design/exports/01-A2·M01-A2의 backdrop은 순수 검정 50%가
        // 아니다. 서로 다른 바탕색 두 곳에서 합성 결과를 실측해 역산했다:
        // 흰 바탕(01-A2) 위 #6c7075, 회색(#f4f6f8) 바탕(M01-A2) 위 #676d72 —
        // 두 값 모두 bora-ink(#111820) 62%로 정확히 설명된다(bg-black/50은
        // 흰 바탕에서 #7f7f7f라 디자인보다 밝고 색조가 없다).
        "fixed inset-0 z-50 bg-[rgb(17_24_32_/_62%)] transition-opacity duration-150 motion-reduce:transition-none",
        "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-[16px] border border-app-line bg-app-surface p-6 text-bora-ink outline-none",
          "shadow-[0_2px_4px_-2px_rgba(17,24,32,0.06),0_12px_24px_-6px_rgba(17,24,32,0.14)]",
          "origin-center transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
          "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-h3 font-semibold text-bora-ink", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-meta text-bora-ink-2", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
};
