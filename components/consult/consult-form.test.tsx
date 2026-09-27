// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsultForm } from "./consult-form";

// SPEC-B2C-CONSULT-001 M4 (design.md §5, §6; acceptance AC-B2CCONSULT-010) —
// 이름/연락처/연락 희망 시간 입력 폼. 연락처 라벨과 연락 희망 시간의
// 필수/선택 여부는 channel prop에 따라 달라지며, ConsultationRequestSchema의
// .refine(channel==="phone"일 때만 필수)과 정확히 일치해야 한다.

function baseProps(overrides: Partial<React.ComponentProps<typeof ConsultForm>> = {}) {
  return {
    channel: "kakao" as const,
    name: "",
    onNameChange: vi.fn(),
    onNameBlur: vi.fn(),
    contact: "",
    onContactChange: vi.fn(),
    onContactBlur: vi.fn(),
    preferredCallTime: "",
    onPreferredCallTimeChange: vi.fn(),
    onPreferredCallTimeBlur: vi.fn(),
    ...overrides,
  };
}

describe("components/consult/ConsultForm", () => {
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

  it("이름 필드가 렌더링되고 입력 시 onNameChange가 호출된다", () => {
    const onNameChange = vi.fn();
    act(() => {
      root.render(<ConsultForm {...baseProps({ onNameChange })} />);
    });

    expect(container.textContent).toContain("이름");

    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    expect(nameInput).not.toBeNull();

    act(() => {
      nameInput!.value = "홍길동";
      nameInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onNameChange).toHaveBeenCalledWith("홍길동");
  });

  it("channel=kakao일 때 연락처 라벨은 '카카오톡 연락에 사용할'을 포함하고 연락 희망 시간은 선택 입력이다", () => {
    act(() => {
      root.render(<ConsultForm {...baseProps({ channel: "kakao" })} />);
    });

    expect(container.textContent).toContain("카카오톡 연락에 사용할");

    const timeInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-preferred-call-time-input"]'
    );
    expect(timeInput?.getAttribute("aria-required")).not.toBe("true");
    expect(container.textContent).toContain("선택");
  });

  it("channel=phone일 때 연락처 라벨은 '통화 가능한 전화번호'이고 연락 희망 시간은 aria-required=true다", () => {
    act(() => {
      root.render(<ConsultForm {...baseProps({ channel: "phone" })} />);
    });

    expect(container.textContent).toContain("통화 가능한 전화번호");

    const timeInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-preferred-call-time-input"]'
    );
    expect(timeInput?.getAttribute("aria-required")).toBe("true");
  });

  it("연락처 입력 blur 시 onContactBlur가 호출된다(draft 저장 트리거, design.md §2.3)", () => {
    const onContactBlur = vi.fn();
    act(() => {
      root.render(<ConsultForm {...baseProps({ onContactBlur })} />);
    });

    const contactInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-contact-input"]'
    );
    act(() => {
      contactInput!.dispatchEvent(new Event("blur", { bubbles: true }));
    });

    expect(onContactBlur).toHaveBeenCalledTimes(1);
  });

  it("errors.contact가 있으면 role=alert 오류 메시지가 표시되고 입력에 aria-invalid/aria-describedby가 연결된다", () => {
    act(() => {
      root.render(
        <ConsultForm
          {...baseProps({ errors: { contact: "연락처 형식이 올바르지 않습니다" } })}
        />
      );
    });

    const contactInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-contact-input"]'
    );
    expect(contactInput?.getAttribute("aria-invalid")).toBe("true");

    const describedById = contactInput?.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    const errorEl = document.getElementById(describedById as string);
    expect(errorEl?.getAttribute("role")).toBe("alert");
    expect(errorEl?.textContent).toBe("연락처 형식이 올바르지 않습니다");
  });
});
