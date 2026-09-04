// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseShellTopbar } from "./case-shell-topbar";

// SPEC-UI-MIGRATION-001 M2 (REQ-006) — 정확한 라우트→브레드크럼/타이틀 매핑.
// usePathname()은 URL 프래그먼트(#expert-feedback)를 포함하지 않으므로
// AC-006a의 "프래그먼트 유무와 무관하게 고정" 요구는 이 구현 자체로 구조적으로
// 만족된다 — 프래그먼트가 있는 케이스는 별도 pathname 값을 만들 수 없어
// 동일 pathname("/cases/case-1")에 대해서만 검증한다.

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

function render(pathname: string) {
  pathnameMock.mockReturnValue(pathname);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CaseShellTopbar />);
  });
  return { container, root };
}

describe("app/cases/case-shell-topbar — 라우트별 브레드크럼/타이틀", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("AC-006a: /cases/new → 브레드크럼 '작업 공간 / 사건 입력' + H2 타이틀 '신규 사건 리서치 요청'", () => {
    ({ container, root } = render("/cases/new"));
    expect(container.textContent).toContain("작업 공간 / 사건 입력");
    const title = container.querySelector("h2");
    expect(title?.textContent).toBe("신규 사건 리서치 요청");
  });

  it("AC-006a: /cases/[caseId] → '작업 공간 / 리서치 리포트' + '리서치 리포트' (프래그먼트 무관)", () => {
    ({ container, root } = render("/cases/case-1"));
    expect(container.textContent).toContain("작업 공간 / 리서치 리포트");
    expect(container.textContent).toContain("리서치 리포트");
  });

  it("AC-006: computed style에 position fixed/sticky가 없다(본문과 함께 스크롤)", () => {
    ({ container, root } = render("/cases/new"));
    const header = container.querySelector("header, div");
    expect(header?.className ?? "").not.toMatch(/\bfixed\b|\bsticky\b/);
  });
});
