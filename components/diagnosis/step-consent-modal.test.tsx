// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StepConsentModal } from "./step-consent-modal";

// SPEC-B2C-DIAGNOSIS-001 M4 (design.md §14, §17; acceptance.md
// AC-B2CDIAG-001~006) — 01-A2 Desktop 필수 민감정보 동의 Modal.
// consentGiven은 부모(diagnosis-flow.tsx) reducer가 소유하는 controlled
// prop이므로, 테스트는 부모 상태를 흉내 내는 stateful harness로 감싼다
// (step-input.test.tsx와 동일한 프로젝트 관례). Base UI Dialog는 Portal로
// document.body에 렌더링하므로 document 전역에서 조회한다.

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
    <StepConsentModal
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

// Base UI Dialog의 초기/최종 포커스 이동은 requestAnimationFrame 이후에
// 적용된다(라이브러리 내부 동작) — jsdom 환경에서 act()만으로는 동기적으로
// 반영되지 않으므로, 포커스 단정 전에는 이 tick을 기다린다.
async function tick() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

describe("components/diagnosis/StepConsentModal — AC-B2CDIAG-001~006", () => {
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

  it("AC-001: 체크박스 1개만 존재하고 이름·전화번호 등 다른 입력 필드는 없다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} />);
    });

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(1);
    expect(document.querySelector('input[type="text"]')).toBeNull();
    expect(document.querySelector('input[type="tel"]')).toBeNull();
  });

  it("AC-002/006: 체크박스가 선택되지 않으면 CTA가 비활성화되고, 선택하면 활성화된다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} />);
    });

    const submitCta = findButtonByText("동의하고 진단하기");
    expect(submitCta.disabled).toBe(true);

    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    act(() => {
      checkbox.click();
    });

    expect(findButtonByText("동의하고 진단하기").disabled).toBe(false);
  });

  it("AC-006: 체크박스 선택 후 CTA 클릭 시 onConfirm이 호출된다", () => {
    const onConfirm = vi.fn();
    act(() => {
      root.render(<Harness onConfirm={onConfirm} onCancel={vi.fn()} />);
    });

    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    act(() => {
      checkbox.click();
    });

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

  it("닫기(ESC)로 모달을 닫으면 onCancel이 호출된다", () => {
    const onCancel = vi.fn();
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={onCancel} />);
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalled();
  });

  // SPEC-B2C-DIAGNOSIS-001 M-fix-2 (design/exports/01-A2) — 캡처에 있는
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

  // SPEC-B2C-DIAGNOSIS-001 M-fix-5 — detailOpen이 부모(diagnosis-flow.tsx)로
  // controlled prop으로 끌어올려졌으므로, 초기값 true로 렌더링하면 상세
  // 오버레이가 마운트 즉시 열려 있어야 한다(?devStep=consent-detail 강제
  // 진입의 전제 조건).
  it("M-fix-5: detailOpen=true로 렌더링하면 상세 오버레이가 즉시 열려 있다", () => {
    act(() => {
      root.render(<Harness onConfirm={vi.fn()} onCancel={vi.fn()} initialDetailOpen />);
    });

    expect(document.body.textContent).toContain("{처리 목적 확정 문구}");
  });
});
