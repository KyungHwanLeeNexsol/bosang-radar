// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

// SPEC-UI-MIGRATION-001 M1 (REQ-002) — 비밀번호 표시/숨김 토글 + 비활성
// 푸터 링크 3종 + 활성 "랜딩으로 돌아가기" 링크. 기존 authClient.signIn.email
// 호출 로직과 5개 testid(login-form/login-email/login-password/login-error/
// login-submit)는 회귀 없이 보존되는지 함께 검증한다.

const { pushMock, refreshMock, signInEmailMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  signInEmailMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { email: signInEmailMock } },
}));

// React 19 wraps the DOM node's `value` setter to track the "last known
// value" for its native-event change detection. A naive `el.value = x`
// assignment goes through that same wrapped setter, so React sees no
// mismatch on the next "input" event and never calls onChange. The native
// property descriptor setter (the same trick @testing-library/react's
// fireEvent.change uses internally) bypasses the wrapper.
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value"
)!.set!;

function fillField(input: HTMLInputElement, value: string) {
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("app/login/login-form — 비밀번호 토글 + 푸터 링크 + 기존 로직 보존", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    signInEmailMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<LoginForm />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("AC-002: 기존 5개 testid가 모두 존재한다", () => {
    for (const testId of ["login-form", "login-email", "login-password", "login-submit"]) {
      expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBeNull();
    }
  });

  it("AC-002a: 비밀번호 토글 버튼을 클릭하면 입력의 type이 password↔text로 전환된다", () => {
    const passwordInput = container.querySelector<HTMLInputElement>(
      '[data-testid="login-password"]'
    )!;
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="login-password-toggle"]'
    )!;
    expect(passwordInput.type).toBe("password");

    act(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(passwordInput.type).toBe("text");

    act(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(passwordInput.type).toBe("password");
  });

  it("AC-002b: 토글 버튼은 button 요소이며 접근 가능한 이름(aria-label)을 가진다", () => {
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="login-password-toggle"]'
    )!;
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-label")).toBeTruthy();
  });

  it("AC-002c: 토글을 여러 번 클릭해도 제출되는 비밀번호 값은 원본과 동일하다", async () => {
    signInEmailMock.mockResolvedValue({ error: null });
    const emailInput = container.querySelector<HTMLInputElement>('[data-testid="login-email"]')!;
    const passwordInput = container.querySelector<HTMLInputElement>(
      '[data-testid="login-password"]'
    )!;
    fillField(emailInput, "tester@example.com");
    fillField(passwordInput, "s3cr3t-pw");

    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="login-password-toggle"]'
    )!;
    act(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    act(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signInEmailMock).toHaveBeenCalledWith({
      email: "tester@example.com",
      password: "s3cr3t-pw",
    });
  });

  it("AC-002d: 정책 링크 3종은 href 없는 aria-disabled 텍스트이고, 랜딩 링크만 실제 활성 링크다", () => {
    const disabledLinks = container.querySelectorAll('[aria-disabled="true"]');
    // 사이드바 nav 항목과 구분하기 위해 텍스트 콘텐츠로 좁힌다.
    const disabledLabels = Array.from(disabledLinks).map((el) => el.textContent);
    expect(disabledLabels).toEqual(
      expect.arrayContaining(["이용약관", "개인정보처리방침", "고객지원"])
    );
    for (const el of disabledLinks) {
      expect(el.getAttribute("href")).toBeNull();
    }

    const landingLink = container.querySelector('a[href="/"]');
    expect(landingLink).not.toBeNull();
    expect(landingLink?.textContent).toContain("랜딩으로 돌아가기");
  });

  it("잘못된 자격증명이면 login-error에 오류 메시지를 표시한다(기존 동작 회귀 없음)", async () => {
    signInEmailMock.mockResolvedValue({
      error: { message: "이메일 또는 비밀번호가 올바르지 않습니다." },
    });
    fillField(
      container.querySelector<HTMLInputElement>('[data-testid="login-email"]')!,
      "tester@example.com"
    );
    fillField(
      container.querySelector<HTMLInputElement>('[data-testid="login-password"]')!,
      "wrong"
    );

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const errorEl = container.querySelector('[data-testid="login-error"]');
    expect(errorEl?.textContent).toContain("이메일 또는 비밀번호가 올바르지 않습니다.");
  });
});
