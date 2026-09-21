// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StepConsentSheet } from "./step-consent-sheet";

// SPEC-B2C-DIAGNOSIS-001 M4 (design.md §14, §17; acceptance.md
// AC-B2CDIAG-001~006) — M01-A2 Mobile 필수 민감정보 동의 Bottom Sheet.
// StepConsentModal(Desktop)과 동일한 controlled 계약을 공유한다(design.md
// §5) — 이 마일스톤에서는 diagnosis-flow.tsx에 배선하지 않고(TODO(M7):
// 768px 분기 전환) 독립적으로만 검증한다.

function Harness({
  onConfirm,
  onCancel,
  initialDetailOpen = false,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  initialDetailOpen?: boolean;
}) {
  const [consentGiven, setConsentGiven] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(initialDetailOpen);
  return (
    <StepConsentSheet
      consentGiven={consentGiven}
      onConsentChange={setConsentGiven}
      onConfirm={onConfirm}
      onCancel={onCancel}
      detailOpen={detailOpen}
      onDetailOpenChange={setDetailOpen}
    />
  );
}

function findButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find((btn) =>
    btn.textContent?.includes(text)
  );
  if (!button) {
    throw new Error(`button with text "${text}" not found`);
  }
  return button;
}

async function tick() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

describe("components/diagnosis/StepConsentSheet — AC-B2CDIAG-001~006", () => {
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

  it("AC-001: 체크박스 1개만 존재하고 다른 입력 필드는 없다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} />);
    });

    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(1);
    expect(document.querySelector('input[type="text"]')).toBeNull();
  });

  it("AC-002/006: 체크박스 선택 여부에 따라 CTA 활성화 상태가 바뀌고, 클릭 시 onConfirm이 호출된다", () => {
    const onConfirm = vi.fn();
    act(() => {
      root.render(<Harness onConfirm={onConfirm} onCancel={vi.fn()} />);
    });

    expect(findButtonByText("동의하고 진단하기").disabled).toBe(true);

    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    act(() => {
      checkbox.click();
    });

    expect(findButtonByText("동의하고 진단하기").disabled).toBe(false);

    act(() => {
      findButtonByText("동의하고 진단하기").click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("AC-003: '내용 보기'를 열어도 동의 체크박스는 자동 선택되지 않는다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} />);
    });

    act(() => {
      findButtonByText("내용 보기").click();
    });

    expect(document.body.textContent).toContain("{처리 목적 확정 문구}");
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("AC-004: 상세보기를 확인 버튼으로 닫으면 포커스가 '내용 보기' 트리거로 복귀한다", async () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} />);
    });

    const detailTrigger = findButtonByText("내용 보기");
    act(() => {
      detailTrigger.click();
    });
    await tick();

    act(() => {
      findButtonByText("확인").click();
    });
    await tick();

    expect(document.activeElement).toBe(detailTrigger);
  });

  it("AC-005: 체크박스가 aria-describedby로 설명 텍스트와 연결된다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} />);
    });

    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const describedById = checkbox.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    expect(document.getElementById(describedById as string)).not.toBeNull();
  });

  it("닫기(ESC)로 시트를 닫으면 onCancel이 호출된다", () => {
    const onCancel = vi.fn();
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={onCancel} />);
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalled();
  });

  it("M8 포커스 트랩 회귀 테스트: Base UI Drawer가 포커스 가드 경계(data-base-ui-focus-guard)를 렌더링해 Tab 순환이 시트 밖으로 벗어나지 않게 한다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} />);
    });

    // Base UI(floating-ui-react FloatingFocusManager)는 모달 오버레이가
    // 열려 있는 동안 popup 앞뒤에 숨김 포커스 가드 sentinel을 렌더링해
    // Tab/Shift+Tab이 popup 내부에서만 순환하도록 만든다. 이 sentinel의
    // 존재 자체가 포커스 트랩이 활성화되어 있다는 증거다.
    const focusGuards = document.querySelectorAll("[data-base-ui-focus-guard]");
    expect(focusGuards.length).toBeGreaterThanOrEqual(2);
  });

  // SPEC-B2C-DIAGNOSIS-001 M-fix-2 (design/exports/M01-A2) — 캡처에 있는
  // 우측 상단 닫기(X) 버튼이 실제로 렌더링되고, onCancel로 라우팅된다.
  it("M-fix-2: 우측 상단 닫기(X) 버튼을 클릭하면 onCancel이 호출된다", () => {
    const onCancel = vi.fn();
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={onCancel} />);
    });

    const closeButton = document.querySelector('button[aria-label="닫기"]') as HTMLButtonElement;
    expect(closeButton).not.toBeNull();

    act(() => {
      closeButton.click();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // SPEC-B2C-DIAGNOSIS-001 M-fix-5 — detailOpen을 부모로 끌어올린
  // controlled prop이므로, 초기값 true로 렌더링하면 상세 오버레이가 마운트
  // 즉시 열려 있어야 한다(?devStep=consent-detail Mobile 강제 진입의 전제
  // 조건).
  it("M-fix-5: detailOpen=true로 렌더링하면 상세 오버레이가 즉시 열려 있다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} initialDetailOpen />);
    });

    expect(document.body.textContent).toContain("{처리 목적 확정 문구}");
  });

  // D2(9차) — Desktop 모달과 같은 문구를 쓴다(step-consent-modal.test.tsx의
  // 같은 이름 테스트와 쌍). 두 곳이 따로 드리프트하는 것을 막는다.
  it("D2(9차): 설명 문구가 디자인과 글자 단위로 일치한다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} />);
    });

    const description = document.querySelector('[data-testid="diagnosis-consent-description"]');
    expect(description?.textContent?.trim()).toBe(
      "입력한 사고 · 질병 · 치료 정보는 보상 가능성 분석을 위해 처리됩니다."
    );
  });

  // D2(9차) — design/exports/M01-A2도 "내용 보기" 뒤에 꺾쇠가 붙는다.
  it("D2(9차): '내용 보기' 트리거 텍스트 뒤에 꺾쇠 아이콘이 있다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} />);
    });

    const trigger = findButtonByText("내용 보기");
    const chevron = trigger.querySelector("svg");
    expect(chevron).not.toBeNull();
    expect(chevron?.getAttribute("class")).toContain("chevron-right");
    expect(
      trigger.firstChild?.compareDocumentPosition(chevron as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
