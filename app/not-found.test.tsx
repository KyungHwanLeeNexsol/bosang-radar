// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import GlobalNotFound from "./not-found";

// SPEC-UI-MIGRATION-001 M7 (REQ-015) — 전역 404. App Shell 밖(루트 레이아웃만
// 적용)이며 `global-not-found` testid를 가진다. App Shell 미적용은
// app/not-found.tsx가 app/cases/layout.tsx의 자손이 아니라는 라우팅
// 구조 자체로 보장되므로(Next.js App Router 세그먼트 트리), 여기서는
// testid/타이틀/에러코드 콘텐츠만 검증한다.

describe("app/not-found — 전역 404", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("AC-015: global-not-found testid + 타이틀 + ERR_NOT_FOUND 메타를 표시한다", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<GlobalNotFound />);
    });

    const panel = container.querySelector('[data-testid="global-not-found"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("페이지를 찾을 수 없습니다");
    expect(panel?.textContent).toContain("ERR_NOT_FOUND");
  });
});
