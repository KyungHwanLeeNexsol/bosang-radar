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

  it("AC-002d: 정책 링크 2종은 href 없는 aria-disabled 텍스트이고, 랜딩 링크만 실제 활성 링크다", () => {
    const disabledLinks = container.querySelectorAll('[aria-disabled="true"]');
    // 사이드바 nav 항목과 구분하기 위해 텍스트 콘텐츠로 좁힌다.
    const disabledLabels = Array.from(disabledLinks).map((el) => el.textContent);
    expect(disabledLabels).toEqual(expect.arrayContaining(["이용약관", "개인정보처리방침"]));
    // SPEC-PILOT-READY-001 v0.6.0(외부 구현 검토 5차 반영) — supportEmail
    // prop 없는 기본 상태에서 "고객지원"은 정직한 비활성 표시이므로 이제는
    // 이 목록에 포함된다(3종 모두 href 없음). 이전 문구("더 이상 aria-disabled
    // 텍스트가 아니므로 이 목록에 포함되지 않는다")는 example.com 자리표시자를
    // 실재하는 채널처럼 클릭 가능하게 노출시키는 부작용이 있어 정정됐다.
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

  it("AC-PILOT-READY-013: supportEmail prop 없이도(기본값) '고객지원'은 클릭 가능한 것처럼 보이는 가짜 링크를 노출하지 않고 aria-disabled로 미설정 상태를 정직하게 드러낸다(v0.6.0 정정)", () => {
    const supportLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent === "고객지원"
    );

    // aria-disabled 텍스트로 렌더링되며(정책 링크 2종과 동일한 패턴), 실재하지
    // 않는 example.com 자리표시자를 mailto: href로 노출하지 않는다.
    expect(supportLink).toBeUndefined();
    const disabledSupport = Array.from(
      container.querySelectorAll('[aria-disabled="true"]')
    ).find((el) => el.textContent === "고객지원");
    expect(disabledSupport).toBeDefined();
    expect(disabledSupport?.getAttribute("href")).toBeNull();
  });

  it("SPEC-PILOT-READY-001 M3(REQ-PILOT-READY-013): supportEmail prop이 주어지면 그 값으로 mailto: 링크가 렌더링된다", () => {
    const supportContainer = document.createElement("div");
    document.body.appendChild(supportContainer);
    const supportRoot = createRoot(supportContainer);
    act(() => {
      supportRoot.render(<LoginForm supportEmail="real-ops@bosang-radar.example" />);
    });

    const supportLink = Array.from(supportContainer.querySelectorAll("a")).find(
      (a) => a.textContent === "고객지원"
    );
    expect(supportLink).toBeDefined();
    expect(supportLink?.getAttribute("href")).toBe("mailto:real-ops@bosang-radar.example");
    expect(supportLink?.getAttribute("aria-disabled")).toBeNull();

    act(() => supportRoot.unmount());
    supportContainer.remove();
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
