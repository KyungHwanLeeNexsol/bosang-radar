"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";

import { cn } from "@/lib/utils";

// Base UI 기반 Drawer(Bottom Sheet) 프리미티브 래퍼(shadcn base-nova 스타일
// 컨벤션, components/ui/popover.tsx·dialog.tsx와 동일한 패턴). SPEC-B2C-
// DIAGNOSIS-001 M4에서 Mobile 동의(M01-A2)/동의 상세(M01-A3) Bottom Sheet에
// 재사용하는 범용 프리미티브다. 높이는 DEV-ONLY 캡처 기준 화면 약 88%까지
// 올라오는 형태로 구현한다(design.md §14). 포커스 트랩·배경 스크롤 잠금은
// Base UI Drawer가 기본 제공하는 동작에 의존한다(Enforce Simplicity).

function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger(props: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal(props: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Backdrop>) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 motion-reduce:transition-none",
        "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Popup>) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Popup
        data-slot="drawer-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex h-[88vh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] border-t border-app-line bg-app-surface p-6 text-bora-ink outline-none",
          "shadow-[0_-2px_4px_-2px_rgba(17,24,32,0.06),0_-12px_24px_-6px_rgba(17,24,32,0.14)]",
          "transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
          "data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
          className
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className="mx-auto h-1 w-9 shrink-0 rounded-full bg-app-line"
        />
        {children}
      </DrawerPrimitive.Popup>
    </DrawerPortal>
  );
}

function DrawerClose(props: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-h3 font-semibold text-bora-ink", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-meta text-bora-ink-2", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerOverlay,
  DrawerContent,
  DrawerClose,
  DrawerTitle,
  DrawerDescription,
};
