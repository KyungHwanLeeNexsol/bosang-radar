// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SPEC-B2C-DIAGNOSIS-001 M2 (design.md §2, §5, §10) — DiagnosisFlow는
// "use client" 상태 머신 오너다. useSearchParams()에 의존하므로
// next/navigation을 모킹한다. enableDevStates prop은 부모(app/page.tsx)가
// 서버에서 계산해 내려주는 값이며, 이 컴포넌트는 절대 process.env를 직접
// 읽지 않는다(design.md §10).

const { searchParamsMock, routerMock } = vi.hoisted(() => ({
  searchParamsMock: { current: new URLSearchParams() },
  routerMock: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.current,
  useRouter: () => routerMock,
  usePathname: () => "/",
}));

// M-fix-1 — diagnosis-header.tsx가 "카톡 상담" 버튼을 StepInput의 CTA보다
// DOM상 먼저 렌더링하므로, 첫 번째 <button>을 가정하던 기존 헬퍼는 더 이상
// CTA를 가리키지 않는다. 모든 "01 화면 CTA 클릭" 의도는 텍스트로 조회한다.
function findCtaButton(container: HTMLElement): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((btn) =>
    btn.textContent?.includes("보상 진단")
  );
  if (!button) {
    throw new Error('CTA button "보상 진단" not found');
  }
  return button;
}

// D2(5차 재작업) — 검색창이 <input>에서 <textarea>로 바뀌었다(design/exports/
// M01의 2줄 wrap 재현). querySelector("input")은 더 이상 검색창을 찾지
// 못하므로 의미 기반 selector(data-testid="diagnosis-search-textbox")로
// 리팩터링한다 — D1 상태/히스토리 로직과 무관한 selector 리팩터링일 뿐이며,
// 아래 각 테스트의 시나리오·기대값은 그대로 유지한다. 체크박스/라디오
// selector(`input[type="checkbox"]`/`input[type="radio"]`)는 검색창과
// 무관하므로 변경하지 않는다.
function getSearchTextbox(container: HTMLElement): HTMLTextAreaElement {
  const el = container.querySelector('[data-testid="diagnosis-search-textbox"]');
  if (!el) {
    throw new Error("검색창(diagnosis-search-textbox)을 찾을 수 없습니다.");
  }
  return el as HTMLTextAreaElement;
}

function fillSearchTextbox(container: HTMLElement, value: string): void {
  const input = getSearchTextbox(container);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  routerMock.push.mockClear();
  routerMock.replace.mockClear();
});

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
    expect(getSearchTextbox(container)).not.toBeNull();
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

    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });

    const button = findCtaButton(container);
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
    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

// SPEC-B2C-DIAGNOSIS-001 M9 — reducer 분기 커버리지 보강. 위 테스트들은 모두
// questionIndex 0(첫 질문)에서의 QUESTIONS_PREV(→consent 전이)와
// QUESTIONS_SKIP(→loading 전이)만 검증했다. 실제 "다음" 버튼을 통한
// questionIndex 증가(QUESTIONS_NEXT의 non-terminal 분기)와, 증가된 인덱스에서
// "이전"을 눌렀을 때의 questionIndex 감소(QUESTIONS_PREV의 non-zero 분기)는
// 별도로 검증되지 않았다 — reducer.tsx의 두 분기 모두 실제 UI 조작으로
// 도달 가능한 정상 경로이므로 이 갭을 닫는다. 또한 CONSENT_CANCEL(ESC로
// 동의 오버레이 닫기)이 diagnosis-flow 통합 레벨에서 실제로 step을
// "input"으로 되돌리고, 이후 재진입 시 consentGiven이 유지되는지도
// (design.md §18.1 consent 상태 "뒤로 가기 동작") 통합 테스트가 없었다.
describe("components/diagnosis/DiagnosisFlow — reducer 분기 커버리지 보강 (M9)", () => {
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

  function findButton(text: string): HTMLButtonElement {
    const button = Array.from(document.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes(text)
    );
    if (!button) {
      throw new Error(`button with text "${text}" not found`);
    }
    return button;
  }

  async function reachQuestionsStep() {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
    });
    act(() => {
      (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });
    act(() => {
      findButton("동의하고 진단하기").click();
    });
  }

  it("QUESTIONS_NEXT(비-마지막 질문)가 questionIndex를 1 증가시키고, 그 뒤 QUESTIONS_PREV(비-0 인덱스)가 다시 1 감소시킨다 — consent로 되돌아가지 않는다", async () => {
    await reachQuestionsStep();

    let progress = container.querySelector('[data-testid="diagnosis-question-progress"]');
    expect(progress?.textContent).toContain("1 / 3");

    // 질문 1 응답 후 "다음"(마지막 질문이 아니므로 QUESTIONS_NEXT는
    // step을 바꾸지 않고 questionIndex만 증가시킨다).
    act(() => {
      (container.querySelector('input[type="radio"]') as HTMLInputElement).click();
    });
    act(() => {
      findButton("다음").click();
    });

    let flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("questions");
    progress = container.querySelector('[data-testid="diagnosis-question-progress"]');
    expect(progress?.textContent).toContain("2 / 3");

    // questionIndex가 0이 아니므로 "이전"은 consent로 전이하지 않고
    // questionIndex만 1 감소시킨다(QUESTIONS_PREV non-zero 분기).
    act(() => {
      findButton("이전").click();
    });

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("questions");
    progress = container.querySelector('[data-testid="diagnosis-question-progress"]');
    expect(progress?.textContent).toContain("1 / 3");
  });

  it("CONSENT_CANCEL(ESC): 동의 오버레이를 닫으면 input 단계로 돌아가고, 재진입 시 동의 체크는 유지된다(design.md §18.1)", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
    });

    let flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("consent");

    act(() => {
      (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });

    // ESC → CONSENT_CANCEL → step이 input으로 되돌아간다(검색어는 보존).
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
    const inputAfterCancel = getSearchTextbox(container);
    expect(inputAfterCancel.value).toBe("계단에서 넘어져 발목을 다쳤어요");

    // 다시 제출해 consent로 재진입하면, 이전에 선택했던 동의 체크박스가
    // 여전히 선택된 상태로 표시된다(consentGiven은 CONSENT_CANCEL로
    // 초기화되지 않음 — REQ-B2CDIAG-019).
    act(() => {
      findCtaButton(container).click();
    });

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("consent");
    const consentCheckboxAgain = document.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(consentCheckboxAgain.checked).toBe(true);
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
    act(() => {
      fillSearchTextbox(container, SEARCH_TEXT);
    });
    act(() => {
      findCtaButton(container).click();
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
    const inputAfterBack = getSearchTextbox(container);
    expect(inputAfterBack.value).toBe(SEARCH_TEXT);
  });

  it("오류 키워드가 없는 입력 → loading 완료 후 result-none으로 전이하고, '내용을 수정할게요'가 검색어를 보존한 채 input으로 되돌아간다", async () => {
    const SEARCH_TEXT = "계단에서 넘어져 발목을 다쳤어요";
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    act(() => {
      fillSearchTextbox(container, SEARCH_TEXT);
    });
    act(() => {
      findCtaButton(container).click();
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
    const inputAfterEdit = getSearchTextbox(container);
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
    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
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

// SPEC-B2C-DIAGNOSIS-001 M-fix-2 (design/exports/01-A2, M01-A2) — 01-A2는
// 01 "위에" 뜨는 오버레이이지 별도의 빈 화면이 아니다. consent 스텝에서도
// StepInput(배경)이 계속 마운트되어 있어야 하고, 배경의 검색창은 오버레이의
// 포커스 트랩과 경쟁하지 않도록 자동 포커스를 받지 않아야 한다.
describe("components/diagnosis/DiagnosisFlow — M-fix-2 (consent 오버레이 배경)", () => {
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

  it("consent 스텝에서도 배경의 검색창(StepInput)이 입력값을 유지한 채 계속 렌더링된다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("consent");

    // 배경 검색창이 언마운트되지 않고 값이 그대로 남아 있다.
    const backgroundInput = getSearchTextbox(container);
    expect(backgroundInput).not.toBeNull();
    expect(backgroundInput.value).toBe("계단에서 넘어져 발목을 다쳤어요");

    // 오버레이(Modal/Sheet)도 동시에 DOM에 존재한다.
    const overlay =
      document.querySelector('[data-slot="dialog-content"]') ??
      document.querySelector('[data-slot="drawer-content"]');
    expect(overlay).not.toBeNull();
  });

  it("consent 스텝 진입 시 배경 검색창은 자동 포커스를 받지 않는다(오버레이 포커스 트랩과 경쟁 방지)", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
    });

    // Base UI Dialog/Drawer의 초기 포커스 이동은 requestAnimationFrame
    // 이후 적용된다(step-consent-modal.test.tsx의 tick()과 동일한 이유) —
    // 이 tick을 기다리지 않으면 배경 검색창이 (오버레이가 아직 포커스를
    // 가져가기 전이라) 여전히 이전 포커스를 들고 있는 것처럼 보일 수 있다.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

    const backgroundInput = getSearchTextbox(container);
    expect(document.activeElement).not.toBe(backgroundInput);
  });
});

// SPEC-B2C-DIAGNOSIS-001 M-fix-4 (design.md §0 "?step= shallow-route";
// AC-B2CDIAG-017) — router.push/replace 모킹을 스파이로 사용해 URL 동기화
// 로직을 검증한다. 실제 브라우저 히스토리 왕복(page.goBack())은
// e2e/diagnosis-flow-01.spec.ts(Playwright)에서 별도로 검증한다.
describe("components/diagnosis/DiagnosisFlow — M-fix-4 (?step= 동기화)", () => {
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

  it("input → consent 전이 시 router.push가 ?step=consent로 호출된다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
    });

    expect(routerMock.push).toHaveBeenCalledWith(
      expect.stringContaining("step=consent"),
      expect.objectContaining({ scroll: false })
    );
  });

  it("직접 진입: ?step=questions로 마운트하면 input으로 남고(state는 이미 input 기본값) router.replace로 잘못된 ?step=을 정리한다", async () => {
    searchParamsMock.current = new URLSearchParams("step=questions");
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
    expect(routerMock.replace).toHaveBeenCalledWith(
      expect.not.stringContaining("step="),
      expect.objectContaining({ scroll: false })
    );
  });

  it("직접 진입: ?step=error로 마운트해도 input으로 남고 router.replace로 정리한다", async () => {
    searchParamsMock.current = new URLSearchParams("step=error");
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
    expect(routerMock.replace).toHaveBeenCalled();
  });

  it("popstate 시뮬레이션: consent에서 questions로 진행한 뒤 URL이 ?step=consent로 바뀌면(뒤로가기) consent로 되돌아가고 답변은 보존된다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    // input -> consent
    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
    });

    // consent -> questions
    act(() => {
      (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });
    act(() => {
      (
        Array.from(document.querySelectorAll("button")).find((btn) =>
          btn.textContent?.includes("동의하고 진단하기")
        ) as HTMLButtonElement
      ).click();
    });

    let flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("questions");

    // 브라우저 뒤로가기 시뮬레이션 — searchParams가 이전 히스토리 항목
    // (step=consent)로 바뀌었다고 가정하고 재렌더링한다.
    act(() => {
      searchParamsMock.current = new URLSearchParams("step=consent");
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("consent");

    // AC-B2CDIAG-017 — 동의 체크박스는 여전히 선택되어 있다(세션 내 유지).
    const consentCheckbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(consentCheckbox.checked).toBe(true);
  });

  // D1(second remediation round) — ?step=이 완전히 사라지는 popstate(뒤로
  // 가기를 계속해 히스토리 맨 앞으로 돌아온 경우)를 첫 실행 이후에 겪으면,
  // 기존 코드는 "urlStep이 없다"는 이유로 조기 return해 React state가 URL과
  // 어긋난 채로 남았다(state는 consent인데 URL은 /). 이 테스트는 첫 URL
  // 동기화가 이미 한 번 일어난 뒤(consent 진입) ?step=이 사라지는 상황을
  // 재현해 state가 input으로 동기화되는지 검증한다.
  it("D1: 첫 URL 동기화 이후 ?step=이 사라지면(팝스테이트) state를 input으로 동기화한다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    // input -> consent (첫 URL 동기화 effect가 이미 1회 실행됨)
    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
    });

    let flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("consent");

    // 팝스테이트로 히스토리 맨 앞(?step= 없는 "/")까지 되돌아갔다고 가정.
    act(() => {
      searchParamsMock.current = new URLSearchParams();
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
  });

  // D1 — searchParams가 VALID_STEPS에 없는 값을 들고 있을 때, 그 값이
  // FORCE_STEP dispatch의 payload로 그대로 흘러가면 data-step 자체가
  // "garbage"가 되어 6단계 상태 머신 밖의 값을 렌더링하게 된다. 런타임
  // 가드가 이 값을 "step 없음"과 동일하게 처리하는지 검증한다.
  it("D1: 유효하지 않은 ?step= 값(garbage)은 FORCE_STEP에 전달되지 않고 input으로 정리된다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    // input -> consent (첫 URL 동기화 이후 상태로 만든다)
    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
    });

    let flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("consent");

    // ?step=garbage로 바뀌었다고 가정(직접 URL 조작 등).
    act(() => {
      searchParamsMock.current = new URLSearchParams("step=garbage");
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    flow = container.querySelector('[data-testid="diagnosis-flow"]');
    // "garbage"는 6단계 중 어느 것도 아니므로 절대 data-step에 나타나면 안 된다.
    expect(flow?.getAttribute("data-step")).not.toBe("garbage");
    expect(flow?.getAttribute("data-step")).toBe("input");
    expect(routerMock.replace).toHaveBeenCalledWith(
      expect.not.stringContaining("step="),
      expect.objectContaining({ scroll: false })
    );
  });
});

// SPEC-B2C-DIAGNOSIS-001 M-fix-5 — ?devStep=consent-detail은 동의
// 오버레이뿐 아니라 그 위의 상세 오버레이까지 마운트 즉시 열려 있어야
// 한다(dev 전용, Playwright e2e에서 Desktop/Mobile 각각 재검증).
describe("components/diagnosis/DiagnosisFlow — M-fix-5 (devStep=consent-detail)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    searchParamsMock.current = new URLSearchParams("devStep=consent-detail");
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

  it("enableDevStates=true이면 동의 상세 오버레이({처리 목적 확정 문구} 등)가 마운트 즉시 열려 있다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={true} />);
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("consent");
    expect(document.body.textContent).toContain("{처리 목적 확정 문구}");
  });

  it("AC-B2CDIAG-016: enableDevStates=false이면 ?devStep=consent-detail은 무시되고 input 단계를 유지한다", async () => {
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    const flow = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flow?.getAttribute("data-step")).toBe("input");
    expect(document.body.textContent).not.toContain("{처리 목적 확정 문구}");
  });
});

// D2(8차) — ?devStage=의 쿼리 파라미터 계약. ?devStep=과 동일하게
// enableDevStates가 참일 때만 동작하고, 범위를 벗어난 값은 조용히 무시돼
// 정상 자동 진행으로 되돌아가야 한다(design.md §10, AC-B2CDIAG-016과 동일
// 계약). 7차에 이 파생 로직이 들어왔지만 테스트가 없었다.
describe("components/diagnosis/DiagnosisFlow — ?devStage= 단계 고정 계약(design.md §10)", () => {
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

  function stageStatuses(): string[] {
    return [0, 1, 2].map((index) =>
      (
        container.querySelector(`[data-testid="diagnosis-loading-stage-${index}-status"]`)
          ?.textContent ?? ""
      ).trim()
    );
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

  it("enableDevStates=true + ?devStage=1이면 진단 중 화면이 1단계 완료 상태로 고정되고 자동 전이하지 않는다", async () => {
    searchParamsMock.current = new URLSearchParams("devStep=loading&devStage=1");
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={true} />);
    });

    expect(
      container.querySelector('[data-testid="diagnosis-flow"]')?.getAttribute("data-step")
    ).toBe("loading");
    expect(stageStatuses()).toEqual(["완료", "진행 중", "대기"]);

    await waitInTicks(1200);

    // 고정이 없었다면 이미 result-none으로 전이했을 시간이다.
    expect(
      container.querySelector('[data-testid="diagnosis-flow"]')?.getAttribute("data-step")
    ).toBe("loading");
    expect(stageStatuses()).toEqual(["완료", "진행 중", "대기"]);
  });

  it("enableDevStates=true여도 범위를 벗어난 ?devStage=9면 무시하고 정상 자동 진행한다", async () => {
    searchParamsMock.current = new URLSearchParams("devStep=loading&devStage=9");
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={true} />);
    });

    expect(
      container.querySelector('[data-testid="diagnosis-flow"]')?.getAttribute("data-step")
    ).toBe("loading");

    await waitInTicks(1200);

    expect(
      container.querySelector('[data-testid="diagnosis-flow"]')?.getAttribute("data-step")
    ).toBe("result-none");
  });

  it("enableDevStates=true여도 숫자가 아닌 ?devStage=abc면 무시하고 정상 자동 진행한다", async () => {
    searchParamsMock.current = new URLSearchParams("devStep=loading&devStage=abc");
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={true} />);
    });

    expect(
      container.querySelector('[data-testid="diagnosis-flow"]')?.getAttribute("data-step")
    ).toBe("loading");

    await waitInTicks(1200);

    expect(
      container.querySelector('[data-testid="diagnosis-flow"]')?.getAttribute("data-step")
    ).toBe("result-none");
  });

  it("enableDevStates=false면 ?devStage=1은 완전히 무시된다 — 실제 사용자 흐름으로 도달한 진단 중 화면이 그대로 자동 진행한다", async () => {
    // ?devStep=도 함께 무시되므로 input에서 시작해 사용자 조작으로
    // loading까지 도달시킨다 — 그래야 "devStage만 무시되는지"를 볼 수 있다.
    searchParamsMock.current = new URLSearchParams("devStep=loading&devStage=1");
    const { DiagnosisFlow } = await import("./diagnosis-flow");
    act(() => {
      root.render(<DiagnosisFlow enableDevStates={false} />);
    });

    expect(
      container.querySelector('[data-testid="diagnosis-flow"]')?.getAttribute("data-step")
    ).toBe("input");

    act(() => {
      fillSearchTextbox(container, "계단에서 넘어져 발목을 다쳤어요");
    });
    act(() => {
      findCtaButton(container).click();
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

    expect(
      container.querySelector('[data-testid="diagnosis-flow"]')?.getAttribute("data-step")
    ).toBe("loading");

    await waitInTicks(1200);

    // devStage=1이 적용됐다면 loading에 멈춰 있었을 것이다.
    expect(
      container.querySelector('[data-testid="diagnosis-flow"]')?.getAttribute("data-step")
    ).toBe("result-none");
  });
});
