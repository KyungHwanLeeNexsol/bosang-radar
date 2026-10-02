// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ArrowLeft, Search } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OutcomeActions, OutcomeButton } from "./consult-outcome-button";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SPEC-B2C-CONSULT-001 — .pen 03-B/C/D · M03-B/C/D 하단 버튼. 링크·동작 버튼·"준비 중" 비활성
// 세 종류를 한 조각으로 그린다. 목적지가 없는 버튼은 .pen 모양 그대로 그리되 이동하지 않고
// aria-disabled + "준비 중" 표기를 붙인다(사용자 결정: 죽은 링크를 만들지 않는다).

describe("components/consult/OutcomeButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("link: 지정한 href로 가는 앵커이며 준비 중 표기가 없다", () => {
    act(() => {
      root.render(
        <OutcomeButton
          variant="primary"
          icon={ArrowLeft}
          testId="btn"
          action={{ type: "link", href: "/result" }}
        >
          진단 결과로 돌아가기
        </OutcomeButton>
      );
    });

    const el = container.querySelector('[data-testid="btn"]');
    expect(el?.tagName).toBe("A");
    expect(el?.getAttribute("href")).toBe("/result");
    expect(el?.textContent).toContain("진단 결과로 돌아가기");
    expect(el?.textContent).not.toContain("준비 중");
    expect(el?.getAttribute("aria-disabled")).toBeNull();
  });

  it("stub: 누를 수 없는 버튼이며 준비 중 표기와 aria-disabled를 갖고 이동하지 않는다", () => {
    act(() => {
      root.render(
        <OutcomeButton variant="primary" icon={Search} testId="btn" action={{ type: "stub" }}>
          기존 신청 상태 확인
        </OutcomeButton>
      );
    });

    const el = container.querySelector('[data-testid="btn"]');
    expect(el?.tagName).toBe("BUTTON");
    expect(el?.getAttribute("type")).toBe("button");
    expect(el?.getAttribute("aria-disabled")).toBe("true");
    expect(el?.getAttribute("href")).toBeNull();
    expect(el?.textContent).toContain("기존 신청 상태 확인");
    expect(el?.textContent).toContain("준비 중");
  });

  it("stub: 눌러도 아무 일도 일어나지 않는다(오류 없이 무시)", () => {
    act(() => {
      root.render(
        <OutcomeButton variant="secondary" testId="btn" action={{ type: "stub" }}>
          신청 취소 · 정보 삭제 문의
        </OutcomeButton>
      );
    });

    const el = container.querySelector<HTMLButtonElement>('[data-testid="btn"]');
    expect(() => {
      act(() => {
        el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }).not.toThrow();
  });

  it("button: 누르면 onClick을 호출한다", () => {
    const onClick = vi.fn();
    act(() => {
      root.render(
        <OutcomeButton variant="primary" testId="btn" action={{ type: "button", onClick }}>
          다시 시도하기
        </OutcomeButton>
      );
    });

    act(() => {
      container
        .querySelector('[data-testid="btn"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("button: busy면 aria-busy·aria-disabled가 붙고 누르기가 무시된다", () => {
    const onClick = vi.fn();
    act(() => {
      root.render(
        <OutcomeButton
          variant="primary"
          testId="btn"
          action={{ type: "button", onClick, busy: true }}
        >
          다시 시도하기
        </OutcomeButton>
      );
    });

    const el = container.querySelector('[data-testid="btn"]');
    expect(el?.getAttribute("aria-busy")).toBe("true");
    expect(el?.getAttribute("aria-disabled")).toBe("true");
    act(() => {
      el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("보조 버튼의 아이콘은 데스크톱에서만 보인다(모바일 디자인은 글자만)", () => {
    act(() => {
      root.render(
        <OutcomeButton
          variant="secondary"
          icon={ArrowLeft}
          testId="btn"
          action={{ type: "link", href: "/result" }}
        >
          이전 화면으로 돌아가기
        </OutcomeButton>
      );
    });

    const svg = container.querySelector('[data-testid="btn"] svg');
    expect(svg?.getAttribute("class")).toContain("hidden");
    expect(svg?.getAttribute("class")).toContain("md:block");
  });

  it("OutcomeActions는 두 버튼을 감싸는 묶음이다", () => {
    act(() => {
      root.render(
        <OutcomeActions>
          <OutcomeButton variant="primary" testId="a" action={{ type: "stub" }}>
            가
          </OutcomeButton>
          <OutcomeButton variant="secondary" testId="b" action={{ type: "stub" }}>
            나
          </OutcomeButton>
        </OutcomeActions>
      );
    });

    expect(container.querySelectorAll("button")).toHaveLength(2);
  });
});
