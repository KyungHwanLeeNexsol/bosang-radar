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
//
// D2(5차 재작업) — 검색창이 <input>에서 <textarea>로 바뀌었다(design/exports/
// M01의 2줄 wrap 재현). querySelector("input")은 더 이상 검색창을 찾지
// 못하므로 의미 기반 selector(data-testid="diagnosis-search-textbox")로
// 리팩터링한다 — 이 변경은 D1 상태/히스토리 로직과 무관한 selector
// 리팩터링일 뿐이며, 아래 각 테스트의 시나리오·기대값은 그대로 유지한다.

function getSearchTextbox(container: HTMLElement): HTMLTextAreaElement {
  const el = container.querySelector('[data-testid="diagnosis-search-textbox"]');
  if (!el) {
    throw new Error("검색창(diagnosis-search-textbox)을 찾을 수 없습니다.");
  }
  return el as HTMLTextAreaElement;
}

function setNativeTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

// StepInput은 controlled 컴포넌트다(value/onChange를 부모 reducer가 소유,
// design.md §5) — 테스트는 부모 상태를 흉내 내는 stateful harness로 감싼다.
// M-fix-2 — autoFocus는 diagnosis-flow.tsx가 "input" 스텝일 때만 넘겨주는
// controlled prop이 되었다(consent 오버레이 배경으로 마운트 중일 때는
// 포커스 트랩과 경쟁하지 않도록 false). 이 파일의 테스트는 모두 독립적인
// "input" 스텝 상황을 가정하므로 harness 기본값을 true로 둔다.
function Harness({
  onValidSubmit,
  autoFocus = true,
}: {
  onValidSubmit: () => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = React.useState("");
  return (
    <StepInput
      value={value}
      onChange={setValue}
      onValidSubmit={onValidSubmit}
      autoFocus={autoFocus}
    />
  );
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((btn) =>
    btn.textContent?.includes(text)
  );
  if (!button) {
    throw new Error(`button with text "${text}" not found`);
  }
  return button;
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

    const input = getSearchTextbox(container);
    act(() => {
      setNativeTextareaValue(input, "가".repeat(250));
    });

    expect(input.value.length).toBe(200);
    expect(container.textContent).toContain("200 / 200자");
  });

  it("AC-023: '많이 찾는 사례' 칩 클릭 시 검색창에 텍스트가 채워지고 CTA가 활성화된다", () => {
    act(() => {
      root.render(<Harness onValidSubmit={vi.fn()} />);
    });

    const input = getSearchTextbox(container);
    expect(input.value).toBe("");

    const button = findButtonByText(container, "보상 진단");
    expect(button.disabled).toBe(true);

    // M-fix-6 — Chip은 이제 네이티브 <button type="button">이다(키보드
    // 접근성 수정). role="button" span이 아니므로 텍스트로 조회한다.
    const chip = findButtonByText(container, "교통사고");
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

    const input = getSearchTextbox(container);
    act(() => {
      setNativeTextareaValue(input, "010-1234-5678");
    });

    const button = findButtonByText(container, "보상 진단");
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

    const input = getSearchTextbox(container);
    act(() => {
      setNativeTextareaValue(input, "계단에서 넘어져 발목을 다쳤어요");
    });

    const button = findButtonByText(container, "보상 진단");
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

    const input = getSearchTextbox(container);
    expect(document.activeElement).toBe(input);
  });

  // SPEC-B2C-DIAGNOSIS-001 M-fix-2 — consent 오버레이 배경으로 계속
  // 마운트된 상태에서는(autoFocus=false) 검색창에 자동 포커스를 뺏지
  // 않는다(오버레이 자체 포커스 트랩과 경쟁 방지).
  it("M-fix-2: autoFocus=false면 마운트 시 검색창에 포커스를 이동하지 않는다", () => {
    act(() => {
      root.render(<Harness onValidSubmit={vi.fn()} autoFocus={false} />);
    });

    const input = getSearchTextbox(container);
    expect(document.activeElement).not.toBe(input);
  });

  // SPEC-B2C-DIAGNOSIS-001 M-fix-6 — Chip이 네이티브 <button>이 되면서
  // Tab 포커스 + Enter/Space가 클릭과 동일하게 동작해야 한다(브라우저 기본
  // 동작에 의존 — 커스텀 keydown 핸들러 없음).
  it("M-fix-6: 칩에 Tab 포커스 후 Enter를 누르면 검색창이 채워진다", () => {
    act(() => {
      root.render(<Harness onValidSubmit={vi.fn()} />);
    });

    const input = getSearchTextbox(container);
    const chip = findButtonByText(container, "계단에서 낙상");
    act(() => {
      chip.focus();
    });
    expect(document.activeElement).toBe(chip);

    // jsdom은 네이티브 <button>의 Enter → click 자동 활성화를 구현하지
    // 않으므로(브라우저 전용 동작), 실제 브라우저 동작을 가장 근접하게
    // 재현하기 위해 keydown 이후 click을 함께 dispatch한다 — 핵심 회귀
    // 대상은 "onKeyDown 핸들러가 없어도(=별도 커스텀 로직 없이도) 이
    // 요소가 진짜 <button>이라 브라우저가 활성화를 보장한다"는 사실이며,
    // 이는 Playwright e2e(실제 브라우저)에서 keyboard.press만으로 검증된다.
    act(() => {
      chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(input.value).toBe("계단에서 낙상");
  });

  it("M-fix-6: 칩에 Tab 포커스 후 Space를 누르면 검색창이 채워진다", () => {
    act(() => {
      root.render(<Harness onValidSubmit={vi.fn()} />);
    });

    const input = getSearchTextbox(container);
    const chip = findButtonByText(container, "운동 중 부상");
    act(() => {
      chip.focus();
    });

    act(() => {
      chip.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(input.value).toBe("운동 중 부상");
  });

  it("많이 찾는 사례 칩 전체 6개(교통사고/계단에서 낙상/운동 중 부상/허리 디스크/어깨 회전근개/암 진단)가 렌더링된다", () => {
    act(() => {
      root.render(<Harness onValidSubmit={vi.fn()} />);
    });

    for (const text of [
      "교통사고",
      "계단에서 낙상",
      "운동 중 부상",
      "허리 디스크",
      "어깨 회전근개",
      "암 진단",
    ]) {
      expect(findButtonByText(container, text)).not.toBeNull();
    }
  });

  it("4개 보상 카테고리 미리보기 카드(실손 의료비/정액 담보/후유장해/특별 보상)가 렌더링된다", () => {
    act(() => {
      root.render(<Harness onValidSubmit={vi.fn()} />);
    });

    for (const title of ["실손 의료비", "정액 담보", "후유장해", "특별 보상"]) {
      expect(container.textContent).toContain(title);
    }
  });
});
