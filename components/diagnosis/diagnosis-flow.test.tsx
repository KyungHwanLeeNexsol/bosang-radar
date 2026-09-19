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

  it("AC-B2CDIAG-016: enableDevStates=false면 ?devStep=error가 있어도 무시하고 input 단계를 유지한다", async () => {
    searchParamsMock.current = new URLSearchParams("devStep=error");
    const { DiagnosisFlow } = await import("./diagnosis-flow");

    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
  });

  it("AC-B2CDIAG-016: enableDevStates=false면 ?devStep=result-none이 있어도 무시하고 input 단계를 유지한다", async () => {
    searchParamsMock.current = new URLSearchParams("devStep=result-none");
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
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
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
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
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
    const consentCheckbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
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
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "계단에서 넘어져 발목을 다쳤어요");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      (container.querySelector("button") as HTMLButtonElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    const consentCheckbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
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

// SPEC-B2C-DIAGNOSIS-001 M6 (design.md §11/§12/§18.1; acceptance.md
// AC-B2CDIAG-011/012) — loading의 mock 판정 완료 → error/result-none 전이,
// "다시 시도"의 동일 입력값 재진입, "돌아가기" 계열의 검색어 보존을
// end-to-end로 검증한다. STAGE_DELAY_MS(200ms)가 짧으므로 실제 타이머로
// 대기하되, step-loading.test.tsx에서 실측 확인된 대로 여러 번의 짧은
// act() 호출로 나눠 기다린다(하나의 긴 대기는 중간 패시브 이펙트 flush가
// 지연되어 마지막 단계 타이머가 등록되지 않을 수 있다).
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitInTicks(totalMs: number, tickMs = 200) {
  const ticks = Math.ceil(totalMs / tickMs);
  for (let i = 0; i < ticks; i++) {
    await act(async () => {
      await wait(tickMs);
    });
  }
}

describe("components/diagnosis/DiagnosisFlow — AC-B2CDIAG-011/012 (loading → error/result-none 전이)", () => {
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

  function setInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function findButton(text: string): HTMLButtonElement {
    const button = Array.from(document.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes(text)
    );
    if (!button) {
      throw new Error(`button with text "${text}" not found`);
    }
    return button;
  }

  it("오류 키워드 입력 → loading 완료 후 error로 전이, '다시 시도'가 동일 입력값으로 loading을 재진입시키고, '입력 내용으로 돌아가기'가 검색어를 보존한다", async () => {
    const SEARCH_TEXT = "분석 중 오류가 발생하는 입력";
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    // input -> consent -> questions(건너뛰기) -> loading
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      setInputValue(input, SEARCH_TEXT);
    });
    act(() => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });
    act(() => {
      findButton("동의하고 진단하기").click();
    });
    act(() => {
      findButton("건너뛰고 결과 보기").click();
    });

    let flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("loading");

    await waitInTicks(1200);

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("error");

    // AC-B2CDIAG-012 — "다시 시도" → 동일 입력값으로 loading 재진입
    act(() => {
      findButton("다시 시도").click();
    });
    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("loading");

    await waitInTicks(1200);

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    // 동일 입력값 → mockJudge가 결정론적으로 항상 error를 반환한다.
    expect(flow?.getAttribute("data-step")).toBe("error");

    // "입력 내용으로 돌아가기" → input으로, 검색어는 보존된다.
    act(() => {
      findButton("입력 내용으로 돌아가기").click();
    });
    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
    const inputAfterBack = container.querySelector("input") as HTMLInputElement;
    expect(inputAfterBack.value).toBe(SEARCH_TEXT);
  });

  it("오류 키워드가 없는 입력 → loading 완료 후 result-none으로 전이하고, '내용을 수정할게요'가 검색어를 보존한 채 input으로 되돌아간다", async () => {
    const SEARCH_TEXT = "계단에서 넘어져 발목을 다쳤어요";
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      setInputValue(input, SEARCH_TEXT);
    });
    act(() => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });
    act(() => {
      findButton("동의하고 진단하기").click();
    });
    act(() => {
      findButton("건너뛰고 결과 보기").click();
    });

    await waitInTicks(1200);

    let flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("result-none");

    act(() => {
      findButton("내용을 수정할게요").click();
    });

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
    const inputAfterEdit = container.querySelector("input") as HTMLInputElement;
    expect(inputAfterEdit.value).toBe(SEARCH_TEXT);
  });
});

// SPEC-B2C-DIAGNOSIS-001 M7 (design.md §13, §18.2; acceptance.md
// AC-B2CDIAG-020) — consent 오버레이가 뷰포트 폭에 따라 Desktop
// Modal(data-slot="dialog-content") 또는 Mobile Bottom
// Sheet(data-slot="drawer-content")로 분기 렌더링된다. jsdom에는 실제
// 뷰포트가 없으므로 window.matchMedia를 표준 패턴으로 모킹한다.
function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe("components/diagnosis/DiagnosisFlow — AC-B2CDIAG-020 (반응형 consent 오버레이)", () => {
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
    // @ts-expect-error — 다음 테스트 파일에 영향을 주지 않도록 원복
    delete window.matchMedia;
  });

  async function reachConsentStep() {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "계단에서 넘어져 발목을 다쳤어요");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });
  }

  it("768px 이상(Desktop)에서는 Modal(dialog-content)을 렌더링한다", async () => {
    mockMatchMedia(true);
    await reachConsentStep();

    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull();
  });

  it("768px 미만(Mobile)에서는 Bottom Sheet(drawer-content)을 렌더링한다", async () => {
    mockMatchMedia(false);
    await reachConsentStep();

    expect(document.querySelector('[data-slot="drawer-content"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });
});
