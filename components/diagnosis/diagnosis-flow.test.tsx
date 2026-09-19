// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SPEC-B2C-DIAGNOSIS-001 M2 (design.md §2, §5, §10) — DiagnosisFlow는
// "use client" 상태 머신 오너다. useSearchParams()에 의존하므로
// next/navigation을 모킹한다. enableDevStates prop은 부모(app/page.tsx)가
// 서버에서 계산해 내려주는 값이며, 이 컴포넌트는 절대 process.env를 직접
// 읽지 않는다(design.md §10).

const { searchParamsMock } = vi.hoisted(() => ({
  searchParamsMock: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.current,
}));

describe("components/diagnosis/DiagnosisFlow — AC-B2CDIAG-015/016", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    searchParamsMock.current = new URLSearchParams();
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

  it("기본 상태는 input 단계이며 StepInput(검색창)을 렌더링한다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("AC-B2CDIAG-016: enableDevStates=false면 ?devStep=이 있어도 무시하고 input 단계를 유지한다", async () => {
    searchParamsMock.current = new URLSearchParams("devStep=error");
    const { DiagnosisFlow } = await import("./diagnosis-flow");

    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
  });

  it("AC-B2CDIAG-015: enableDevStates=true이고 ?devStep=result-none이면 result-none 단계로 강제 진입한다", async () => {
    searchParamsMock.current = new URLSearchParams("devStep=result-none");
    const { DiagnosisFlow } = await import("./diagnosis-flow");

    act(() => {
      root.render(<DiagnosisFlow enableDevStates={true} />);
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("result-none");
  });

  it("AC-B2CDIAG-015: enableDevStates=true이고 ?devStep=error이면 error 단계로 강제 진입한다", async () => {
    searchParamsMock.current = new URLSearchParams("devStep=error");
    const { DiagnosisFlow } = await import("./diagnosis-flow");

    act(() => {
      root.render(<DiagnosisFlow enableDevStates={true} />);
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("error");
  });

  it("입력창에서 유효한 값으로 '보상 진단'을 클릭하면 consent 단계로 전이한다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(input, "계단에서 넘어져 발목을 다쳤어요");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("consent");
  });

  it("AC-B2CDIAG-017/018: consent↔questions를 왕복해도 동의 체크와 응답이 유지된다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    // input -> consent
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(input, "계단에서 넘어져 발목을 다쳤어요");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      (container.querySelector("button") as HTMLButtonElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    // consent: 체크박스 선택 후 확인 -> questions
    const consentCheckbox = document.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    act(() => {
      consentCheckbox.click();
    });
    const confirmCta = Array.from(document.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("동의하고 진단하기")
    ) as HTMLButtonElement;
    act(() => {
      confirmCta.click();
    });

    let flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("questions");

    // questions 1문항 응답 선택
    const firstRadio = container.querySelector('input[type="radio"]') as HTMLInputElement;
    act(() => {
      firstRadio.click();
    });
    expect(firstRadio.checked).toBe(true);

    // 뒤로 가기 -> consent, 동의 체크박스는 여전히 선택됨(REQ-B2CDIAG-019)
    const prevButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("이전")
    ) as HTMLButtonElement;
    act(() => {
      prevButton.click();
    });

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("consent");
    const consentCheckboxAgain = document.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(consentCheckboxAgain.checked).toBe(true);

    // 다시 동의하고 진단하기 -> questions로 복귀, 이전 응답이 유지된다
    const confirmCtaAgain = Array.from(document.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("동의하고 진단하기")
    ) as HTMLButtonElement;
    act(() => {
      confirmCtaAgain.click();
    });

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("questions");
    const firstRadioAgain = container.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(firstRadioAgain.checked).toBe(true);
  });

  it("AC-B2CDIAG-008/009: 마지막 질문을 완료하거나 건너뛰면 loading 단계로 전이한다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(input, "계단에서 넘어져 발목을 다쳤어요");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      (container.querySelector("button") as HTMLButtonElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    const consentCheckbox = document.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    act(() => {
      consentCheckbox.click();
    });
    act(() => {
      (
        Array.from(document.querySelectorAll("button")).find((btn) =>
          btn.textContent?.includes("동의하고 진단하기")
        ) as HTMLButtonElement
      ).click();
    });

    // 질문 1에서 건너뛰기 -> 즉시 loading
    const skipLink = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("건너뛰고 결과 보기")
    ) as HTMLButtonElement;
    act(() => {
      skipLink.click();
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("loading");
  });
});
