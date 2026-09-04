// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import CaseNotFound from "./not-found";

// SPEC-UI-MIGRATION-001 M7 (REQ-015) — 사건-없음/미소유 통합 404.
// getCaseForOwner()의 정보 은닉 설계(존재-없음=소유권-없음)를 존중해 두
// 시나리오를 구분하는 어떤 단서도 노출하지 않는다 — 이 컴포넌트는 항상
// 동일한 콘텐츠를 렌더링하므로(파라미터 없음), 그 자체로 AC-015a의
// "두 경우의 화면 텍스트/구조가 완전히 동일함"을 구조적으로 만족한다.

describe("app/cases/[caseId]/not-found — 사건-없음/미소유 통합 404", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("AC-015a: case-not-found testid + 타이틀 + ERR_CASE_NOT_FOUND 메타를 표시하고, 존재/소유권을 구분하는 텍스트가 없다", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<CaseNotFound />);
    });

    const panel = container.querySelector('[data-testid="case-not-found"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("사건을 찾을 수 없습니다");
    expect(panel?.textContent).toContain("ERR_CASE_NOT_FOUND");
    expect(panel?.textContent).not.toMatch(/권한|소유|permission|forbidden/i);
  });
});
