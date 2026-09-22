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
