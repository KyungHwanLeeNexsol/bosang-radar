// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepInput } from "./step-input";

// SPEC-B2C-DIAGNOSIS-001 M3 — 01/M01 검색창 + "많이 찾는 사례" 칩 + 200자
// 제한/카운터 + PII 검증 오류 UI(AC-B2CDIAG-019/022/023). react-dom/client로
// 직접 렌더링하고(@testing-library/react 미설치), jsdom 네이티브 값 세터로
// controlled input 값을 설정한 뒤 input 이벤트를 dispatch한다
// (app/page.test.tsx와 동일한 프로젝트 관례).

function setNativeInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

// StepInput은 controlled 컴포넌트다(value/onChange를 부모 reducer가 소유,
// design.md §5) — 테스트는 부모 상태를 흉내 내는 stateful harness로 감싼다.
function Harness({ onValidSubmit }: { onValidSubmit: () => void }) {
  const [value, setValue] = React.useState("");
  return <StepInput value={value} onChange={setValue} onValidSubmit={onValidSubmit} />;
}

describe("components/diagnosis/StepInput — AC-B2CDIAG-019/022/023", () => {
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

  it("AC-022: 200자 초과 입력을 차단하고 카운터가 정확히 200 / 200자로 표시된다", () => {
    act(() => {
      root.render(<Harness onValidSubmit={vi.fn()} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      setNativeInputValue(input, "가".repeat(250));
    });

    expect(input.value.length).toBe(200);
    expect(container.textContent).toContain("200 / 200자");
  });

  it("AC-023: '많이 찾는 사례' 칩 클릭 시 검색창에 텍스트가 채워지고 CTA가 활성화된다", () => {
    act(() => {
      root.render(<Harness onValidSubmit={vi.fn()} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("");

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    const chip = container.querySelector('[role="button"]') as HTMLElement;
    expect(chip).not.toBeNull();

    act(() => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(input.value.length).toBeGreaterThan(0);
    expect(button.disabled).toBe(false);
  });

  it("AC-019: 전화번호 형식 입력 시 검증 실패로 다음 단계 진행을 차단하고 인라인 오류를 표시한다", () => {
    const onValidSubmit = vi.fn();
    act(() => {
      root.render(<Harness onValidSubmit={onValidSubmit} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      setNativeInputValue(input, "010-1234-5678");
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onValidSubmit).not.toHaveBeenCalled();
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(alert?.id);
  });

  it("정상 입력 시 검증을 통과하고 onValidSubmit이 호출된다", () => {
    const onValidSubmit = vi.fn();
    act(() => {
      root.render(<Harness onValidSubmit={onValidSubmit} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      setNativeInputValue(input, "계단에서 넘어져 발목을 다쳤어요");
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onValidSubmit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("M8: 마운트 시 검색창에 초기 포커스가 위치한다(키보드 전용 플로우의 시작점)", () => {
    act(() => {
      root.render(<Harness onValidSubmit={vi.fn()} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });
});
