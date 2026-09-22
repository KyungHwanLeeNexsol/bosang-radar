"use client";

import * as React from "react";

// SPEC-B2C-DIAGNOSIS-001 M7 (design.md §13) — 0~767px Mobile / 768px 이상
// Desktop 2-way 반응형 분기를 위한 matchMedia 훅. 별도 라이브러리 없이
// React 내장 useSyncExternalStore로 뷰포트 변경을 구독한다(Enforce
// Simplicity — 네이티브 플랫폼 기능 우선 사용).
//
// window.matchMedia가 없는 환경(SSR, 또는 이를 지원하지 않는 테스트
// 환경)에서는 false(Mobile 우선 기본값)로 안전하게 저하된다 — 이 덕분에
// diagnosis-flow.tsx를 렌더링하는 다른 테스트 파일들(app/page.test.tsx 등)이
// matchMedia를 별도로 모킹하지 않아도 크래시 없이 동작한다.

export const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

// SPEC-B2C-RESULT-001 M5 (design.md §10, REQ-B2CRESULT-021) — 02 화면의
// anchor-scroll/탭 전환이 `prefers-reduced-motion`을 존중하도록, 이미 존재하는
// 이 제네릭 useMediaQuery(query) 훅을 새 쿼리 문자열로 재사용한다(diagnosis-
// flow.tsx가 DESKTOP_MEDIA_QUERY로 이미 쓰고 있는 것과 동일한 패턴 — 새 훅을
// 만들지 않는다, Enforce Simplicity). CSS 애니메이션(스피너 등)의 기존 패턴은
// Tailwind `motion-reduce:` 변형(step-loading.tsx, popover.tsx)이며, 이
// 쿼리는 JS로 트리거되는 scrollIntoView({behavior:"smooth"})처럼 CSS
// variant만으로는 제어할 수 없는 동작을 위한 것이다.
export const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

function isMatchMediaSupported(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (!isMatchMediaSupported()) {
        return () => {};
      }
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => mediaQueryList.removeEventListener("change", onStoreChange);
    },
    [query]
  );

  const getSnapshot = React.useCallback(() => {
    if (!isMatchMediaSupported()) {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
