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
        // D2(8차) — dialog.tsx의 backdrop과 동일한 근거로 bora-ink 62%.
        "fixed inset-0 z-50 bg-[rgb(17_24_32_/_62%)] transition-opacity duration-150 motion-reduce:transition-none",
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
        {/* D2(8차) — 그랩 핸들이 flow 첫 자식이라 시트의 상단 패딩(pt) 아래,
            즉 제목 바로 위에 놓여 있었다. design/exports/M01-A2에서 핸들은
            시트 최상단(y≈788~792, 닫기 X와 같은 높이)에 있다. 위치가 틀렸을
            뿐 아니라, 제목의 잉크 측정 영역까지 침범해 제목 폭이 172px로
            잘못 측정되게 만들고 있었다 — 닫기 버튼과 같은 방식으로 flow에서
            빼내 시트 상단에 고정한다. */}
        <span
          aria-hidden="true"
          className="absolute top-[26px] left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-app-line"
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
