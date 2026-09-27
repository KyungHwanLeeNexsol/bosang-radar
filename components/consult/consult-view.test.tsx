// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsultView } from "./consult-view";
import { writeDiagnosisHandoff } from "@/lib/diagnosis/handoff";
import { buildFractureResult, FRACTURE_FIXTURE_INPUT } from "@/lib/diagnosis/fixtures/fracture-case";
import { readConsultationDraft } from "@/lib/consult/draft";

// SPEC-B2C-CONSULT-001 M4 (design.md §2.2, §2.3; acceptance
// AC-B2CCONSULT-006~009) — ConsultView의 3갈래 분기(empty/invalid/valid) +
// draft 초기화/왕복 + idempotencyKey 1회 생성을 검증한다. handoff 모킹은
// SPEC-B2C-RESULT-001 ResultView 테스트군과 동일한 패턴을 따른다. 채널
// 쿼리 파라미터는 next/navigation 훅이 아니라 window.location.search를
// 직접 읽으므로(consult-view.tsx 주석 참고), history.pushState로
// 시뮬레이션한다 — app router 컨텍스트 모킹이 필요 없다.

const DIAGNOSIS_STORAGE_KEY = "bosang-radar:diagnosis-handoff-v1";

describe("components/consult/ConsultView — 3갈래 분기(AC-B2CCONSULT-007/008/009)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.pushState(null, "", "/consult");
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

  it('AC-007: handoff "empty" → no-data 안내가 렌더링되고 실제 폼은 렌더링되지 않는다', () => {
    act(() => {
      root.render(<ConsultView />);
    });

    expect(container.querySelector('[data-testid="consult-no-data"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-summary-card"]')).toBeNull();
  });

  it('AC-008: handoff "invalid"(손상된 JSON) → 오류 상태가 렌더링되고 애플리케이션이 중단되지 않는다', () => {
    window.sessionStorage.setItem(DIAGNOSIS_STORAGE_KEY, "{not valid json");

    expect(() => {
      act(() => {
        root.render(<ConsultView />);
      });
    }).not.toThrow();

    expect(container.querySelector('[data-testid="consult-error"]')).not.toBeNull();
  });

  it('AC-009: handoff "valid" → 요약 카드를 포함한 실제 폼이 렌더링된다', () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" });
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ConsultView />);
    });

    expect(container.querySelector('[data-testid="consult-summary-card"]')).not.toBeNull();
    expect(container.textContent).toContain(result.inputSummary.title);
  });
});

describe("components/consult/ConsultView — draft 초기화/왕복(AC-B2CCONSULT-006)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.pushState(null, "", "/consult");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" });
    writeDiagnosisHandoff(result);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("마운트 시 idempotencyKey가 1회 생성되어 draft에 저장된다", () => {
    act(() => {
      root.render(<ConsultView />);
    });

    const draft = readConsultationDraft();
    expect(draft.idempotencyKey).toBeTruthy();
    expect(typeof draft.idempotencyKey).toBe("string");
  });

  it("이름 필드에서 blur하면 draft에 이름이 저장되고, 필수 동의 체크 상태는 저장되지 않는다", () => {
    act(() => {
      root.render(<ConsultView />);
    });

    const nameInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-name-input"]'
    );
    act(() => {
      nameInput!.value = "홍길동";
      nameInput!.dispatchEvent(new Event("input", { bubbles: true }));
      nameInput!.dispatchEvent(new Event("blur", { bubbles: true }));
    });

    const draft = readConsultationDraft();
    expect(draft.name).toBe("홍길동");
    expect(draft).not.toHaveProperty("piiCollection");
    expect(draft).not.toHaveProperty("healthInfoUse");
  });

  it("URL의 ?channel=phone 쿼리가 초기 채널 선택에 반영된다(REQ-B2CCONSULT-004)", () => {
    window.history.pushState(null, "", "/consult?channel=phone");

    act(() => {
      root.render(<ConsultView />);
    });

    const phoneRadio = container.querySelector<HTMLInputElement>('input[value="phone"]');
    expect(phoneRadio?.checked).toBe(true);
  });

  it("channel 쿼리가 없거나 알 수 없는 값이면 kakao로 폴백한다(REQ-B2CCONSULT-004)", () => {
    window.history.pushState(null, "", "/consult?channel=invalid-value");

    act(() => {
      root.render(<ConsultView />);
    });

    const kakaoRadio = container.querySelector<HTMLInputElement>('input[value="kakao"]');
    expect(kakaoRadio?.checked).toBe(true);
  });

  it("필수 동의 체크박스는 draft 유무와 무관하게 항상 체크되지 않은 상태로 시작한다(동의 재확인 원칙)", () => {
    act(() => {
      root.render(<ConsultView />);
    });

    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    // 첫 두 개가 필수 동의(개인정보/건강정보) — 항상 미체크로 시작한다.
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(false);
  });

  it("두 필수 동의를 모두 체크해야 제출 버튼이 활성화된다(AC-B2CCONSULT-012)", () => {
    act(() => {
      root.render(<ConsultView />);
    });

    const submitButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="consult-submit-button"]'
    );
    expect(submitButton?.getAttribute("aria-disabled")).toBe("true");

    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    act(() => {
      checkboxes[0].click();
      checkboxes[1].click();
    });

    expect(
      container.querySelector('[data-testid="consult-submit-button"]')?.getAttribute("aria-disabled")
    ).not.toBe("true");
  });
});

// SPEC-B2C-CONSULT-001 M5 (design.md §9.1, §2.2; acceptance
// AC-B2CCONSULT-018/020/022/023, handoff_mismatch 시나리오) — 실제
// POST /api/consultations fetch 연결 + 응답 3갈래 라우팅(success/
// duplicate/error) + handoff_mismatch 사전 판정 + 다시 시도하기의
// idempotencyKey 재사용을 검증한다. 서버 자체는 route.test.ts가 이미
// 검증하므로, 여기서는 fetch를 모킹해 클라이언트 라우팅 로직만 검증한다.
describe("components/consult/ConsultView — 제출 응답 라우팅(AC-B2CCONSULT-018/020/022/023)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.pushState(null, "", "/consult");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" });
    writeDiagnosisHandoff(result);

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  function fillRequiredFieldsAndConsent() {
    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    const contactInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-contact-input"]'
    );
    act(() => {
      nameInput!.value = "김보상";
      nameInput!.dispatchEvent(new Event("input", { bubbles: true }));
      contactInput!.value = "010-0000-0000";
      contactInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    act(() => {
      checkboxes[0].click();
      checkboxes[1].click();
    });
  }

  async function clickAndFlush(el: Element) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("success 응답 → 03-B가 렌더링되고 draft는 삭제되며 진단 핸드오프는 유지된다(REQ-B2CCONSULT-025)", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ status: "success", channel: "kakao", maskedContact: "010-****-0000" }),
    });

    act(() => {
      root.render(<ConsultView />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(container.querySelector('[data-testid="consult-success"]')).not.toBeNull();
    expect(window.sessionStorage.getItem("bosang-radar:consultation-draft-v1")).toBeNull();
    expect(window.sessionStorage.getItem(DIAGNOSIS_STORAGE_KEY)).not.toBeNull();
  });

  it("duplicate 응답 → 03-C가 렌더링되고 draft는 삭제되지 않는다", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        status: "duplicate",
        receivedAt: "2026-09-20",
        maskedContact: "010-****-0000",
        applicationStatus: "received",
      }),
    });

    act(() => {
      root.render(<ConsultView />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(container.querySelector('[data-testid="consult-duplicate"]')).not.toBeNull();
    expect(window.sessionStorage.getItem("bosang-radar:consultation-draft-v1")).not.toBeNull();
  });

  it("error 응답(어떤 code든) → 03-D가 렌더링된다(AC-B2CCONSULT-022)", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ status: "error", code: "server_error", message: "..." }),
    });

    act(() => {
      root.render(<ConsultView />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(container.querySelector('[data-testid="consult-failure"]')).not.toBeNull();
  });

  it("네트워크 예외(fetch reject) → 03-D가 렌더링된다(AC-B2CCONSULT-022 타임아웃 시나리오)", async () => {
    fetchMock.mockRejectedValue(new Error("network"));

    act(() => {
      root.render(<ConsultView />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(container.querySelector('[data-testid="consult-failure"]')).not.toBeNull();
  });

  it("handoff_mismatch: 마운트 후 핸드오프의 resultId가 바뀌면 fetch 없이 즉시 03-D를 렌더링한다", async () => {
    act(() => {
      root.render(<ConsultView />);
    });
    fillRequiredFieldsAndConsent();

    const original = buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" });
    writeDiagnosisHandoff({ ...original, resultId: "different-result-id" });

    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="consult-failure"]')).not.toBeNull();
  });

  it("다시 시도하기는 최초 제출과 동일한 idempotencyKey로 재전송한다", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ status: "error", code: "server_error", message: "..." }),
    });

    act(() => {
      root.render(<ConsultView />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    await clickAndFlush(container.querySelector('[data-testid="consult-failure-retry"]')!);

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);
  });
});

// SPEC-B2C-CONSULT-001 M6 (design.md §11, plan.md §F item 6; acceptance
// AC-B2CCONSULT-024) — 제출 전 클라이언트 사이드 검증. consult-view.tsx가
// ConsultationRequestSchema로 사전 검증해, 실패 시 fetch를 호출하지 않고
// 오류 요약을 표시하며 첫 오류 필드로 포커스를 이동시킨다.
describe("components/consult/ConsultView — 클라이언트 사이드 검증(AC-B2CCONSULT-024)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.pushState(null, "", "/consult");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" });
    writeDiagnosisHandoff(result);

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  function checkRequiredConsents() {
    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    act(() => {
      checkboxes[0].click();
      checkboxes[1].click();
    });
  }

  async function clickSubmitAndFlush() {
    await act(async () => {
      container
        .querySelector('[data-testid="consult-submit-button"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("이름·연락처를 비운 채 제출하면 fetch가 호출되지 않고 오류 요약이 표시되며 첫 오류 필드(이름)로 포커스가 이동한다", async () => {
    act(() => {
      root.render(<ConsultView />);
    });
    checkRequiredConsents();

    await clickSubmitAndFlush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="consult-error-summary"]')).not.toBeNull();

    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    expect(document.activeElement).toBe(nameInput);
    expect(nameInput?.getAttribute("aria-invalid")).toBe("true");
  });

  it("이름·연락처는 유효하지만 전화 채널에서 연락 희망 시간이 비어있으면 그 필드로 포커스가 이동한다", async () => {
    act(() => {
      root.render(<ConsultView />);
    });

    const phoneRadio = container.querySelector<HTMLInputElement>('input[value="phone"]');
    act(() => {
      phoneRadio!.click();
    });

    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    const contactInput = container.querySelector<HTMLInputElement>('[data-testid="consult-contact-input"]');
    act(() => {
      nameInput!.value = "김보상";
      nameInput!.dispatchEvent(new Event("input", { bubbles: true }));
      contactInput!.value = "010-0000-0000";
      contactInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    checkRequiredConsents();

    await clickSubmitAndFlush();

    expect(fetchMock).not.toHaveBeenCalled();
    const timeInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-preferred-call-time-input"]'
    );
    expect(document.activeElement).toBe(timeInput);
    expect(timeInput?.getAttribute("aria-invalid")).toBe("true");
  });

  it("형식이 잘못된 연락처(문자 포함)로 제출하면 fetch가 호출되지 않고 연락처 필드가 오류로 표시된다", async () => {
    act(() => {
      root.render(<ConsultView />);
    });

    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    const contactInput = container.querySelector<HTMLInputElement>('[data-testid="consult-contact-input"]');
    act(() => {
      nameInput!.value = "김보상";
      nameInput!.dispatchEvent(new Event("input", { bubbles: true }));
      contactInput!.value = "연락주세요";
      contactInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    checkRequiredConsents();

    await clickSubmitAndFlush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(contactInput?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(contactInput);
  });

  it("모든 필드가 유효하면 클라이언트 검증을 통과해 fetch가 정확히 1회 호출된다", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ status: "success", channel: "kakao", maskedContact: "010-****-0000" }),
    });

    act(() => {
      root.render(<ConsultView />);
    });

    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    const contactInput = container.querySelector<HTMLInputElement>('[data-testid="consult-contact-input"]');
    act(() => {
      nameInput!.value = "김보상";
      nameInput!.dispatchEvent(new Event("input", { bubbles: true }));
      contactInput!.value = "010-0000-0000";
      contactInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    checkRequiredConsents();

    await clickSubmitAndFlush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="consult-error-summary"]')).toBeNull();
  });
});
