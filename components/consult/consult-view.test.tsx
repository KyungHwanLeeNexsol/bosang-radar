// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsultView } from "./consult-view";
import { writeDiagnosisHandoff } from "@/lib/diagnosis/handoff";
import { buildFractureResult, FRACTURE_FIXTURE_INPUT } from "@/lib/diagnosis/fixtures/fracture-case";
import { readConsultationDraft } from "@/lib/consult/draft";

// React 19 act() 환경 플래그 — 이 플래그가 없으면 act() 자체는 여전히
// 동작하지만 "The current testing environment is not configured to support
// act(...)" 경고가 매 act() 호출마다 출력된다(react-dom/test-utils 문서 권고).
// @types/react가 이 필드를 globalThis에 타입 선언하지 않으므로 좁힌 타입으로
// 캐스팅한다(any 금지 — 이 프로젝트 코딩 표준).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React 19는 controlled input의 값 변경을 추적하기 위해 인스턴스 위에 자체
// value setter를 얹어 두므로, `el.value = x` 같은 평범한 대입은 React의
// 추적값도 함께 갱신해 버려 뒤이은 "input" 이벤트가 실제 변경으로 인식되지
// 않는다(onChange가 호출되지 않음, https://github.com/facebook/react/
// issues/11488). HTMLInputElement.prototype의 네이티브 setter를 직접 호출해
// React의 래핑을 우회한 뒤 이벤트를 디스패치해야 onChange가 정상 호출된다.
function setNativeInputValue(el: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  nativeSetter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

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
      setNativeInputValue(nameInput!, "홍길동");
      // React는 "focusout"(bubbles) 네이티브 이벤트를 root에서 구독해 합성
      // onBlur로 변환한다 — "blur"는 버블링하지 않아 React가 인식하지
      // 못한다.
      nameInput!.dispatchEvent(new Event("focusout", { bubbles: true }));
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
      root.render(<ConsultView isPolicyReady />);
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
  // 이번 세션 재작업 — 모바일 뷰포트에서는 제출 버튼에 닿기 위해 실제로
  // 스크롤이 필요하고, client-side 상태 전환이라 브라우저가 스크롤을
  // 자동으로 되돌리지 않는다(실측: visual-verify 재현 스크립트에서
  // scrollY≈75). consult-view.tsx가 전환마다 window.scrollTo(0, 0) +
  // 결과 제목 포커스를 호출하는지 스파이로 검증한다 — jsdom은 실제 레이아웃
  // 스크롤을 구현하지 않으므로, 호출 여부/인자만 검증할 수 있다(픽셀 단위
  // 재현은 Playwright 몫 — e2e/consult-flow-03.spec.ts에 별도로 추가함).
  let scrollToMock: ReturnType<typeof vi.fn>;

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
    scrollToMock = vi.fn();
    vi.stubGlobal("scrollTo", scrollToMock);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  function expectOutcomeFocusAndScroll() {
    expect(scrollToMock).toHaveBeenCalledWith(0, 0);
    const title = container.querySelector('[data-testid="consult-outcome-title"]');
    expect(title).not.toBeNull();
    expect(document.activeElement).toBe(title);
  }

  function fillRequiredFieldsAndConsent() {
    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    const contactInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-contact-input"]'
    );
    act(() => {
      setNativeInputValue(nameInput!, "김보상");
      setNativeInputValue(contactInput!, "010-0000-0000");
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
      root.render(<ConsultView isPolicyReady />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(container.querySelector('[data-testid="consult-success"]')).not.toBeNull();
    expect(window.sessionStorage.getItem("bosang-radar:consultation-draft-v1")).toBeNull();
    expect(window.sessionStorage.getItem(DIAGNOSIS_STORAGE_KEY)).not.toBeNull();
    expectOutcomeFocusAndScroll();
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
      root.render(<ConsultView isPolicyReady />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(container.querySelector('[data-testid="consult-duplicate"]')).not.toBeNull();
    expect(window.sessionStorage.getItem("bosang-radar:consultation-draft-v1")).not.toBeNull();
    expectOutcomeFocusAndScroll();
  });

  it("error 응답(어떤 code든) → 03-D가 렌더링된다(AC-B2CCONSULT-022)", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ status: "error", code: "server_error", message: "..." }),
    });

    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(container.querySelector('[data-testid="consult-failure"]')).not.toBeNull();
    expectOutcomeFocusAndScroll();
  });

  it("네트워크 예외(fetch reject) → 03-D가 렌더링된다(AC-B2CCONSULT-022 타임아웃 시나리오)", async () => {
    fetchMock.mockRejectedValue(new Error("network"));

    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(container.querySelector('[data-testid="consult-failure"]')).not.toBeNull();
    expectOutcomeFocusAndScroll();
  });

  it("handoff_mismatch: 마운트 후 핸드오프의 resultId가 바뀌면 fetch 없이 즉시 03-D를 렌더링한다", async () => {
    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });
    fillRequiredFieldsAndConsent();

    const original = buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" });
    writeDiagnosisHandoff({ ...original, resultId: "different-result-id" });

    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="consult-failure"]')).not.toBeNull();
    expectOutcomeFocusAndScroll();
  });

  it("다시 시도하기는 최초 제출과 동일한 idempotencyKey로 재전송하고, 스크롤·포커스 복원도 재시도마다 다시 실행된다", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ status: "error", code: "server_error", message: "..." }),
    });

    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(scrollToMock).toHaveBeenCalledTimes(1);

    // [HARD 재현] 재시도는 kind가 "failure"→"failure"로 값이 그대로다 —
    // 의존성을 kind 문자열로 두면 React가 변화 없음으로 판단해 effect가
    // 다시 실행되지 않는다(e2e/consult-flow-03.spec.ts 390×737 재시도
    // 테스트로 처음 발견한 회귀). scrollTo가 재시도마다 다시 호출돼야 한다.
    await clickAndFlush(container.querySelector('[data-testid="consult-failure-retry"]')!);

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);
    expect(scrollToMock).toHaveBeenCalledTimes(2);
  });

  // AC-B2CCONSULT-022의 "입력 보존"은 03-D 화면이 값을 다시 보여주라는 요구가
  // 아니라(design.md §10 요약은 상담 방식/연락처/연락 희망 시간/"입력 내용:
  // 유지됨" 4행이며 이름·마케팅 동의는 표시하지 않는다), 입력값이 draft와 폼
  // 상태에 보존되어 재시도 때 동일한 값으로 전송된다는 뜻이다. 아래 두
  // 테스트가 그 두 경로(같은 세션 재시도 / 화면을 나갔다 재진입한 뒤 재시도)를
  // 실제 fetch payload로 확인한다.
  const ENTERED = {
    channel: "phone",
    name: "김보상",
    contact: "010-1234-5678",
    preferredCallTime: "평일 오후 (13시 ~ 18시)",
  } as const;

  // 실제 사용자처럼 각 필드를 채우고 포커스를 벗어난다(draft는 blur에서 저장된다).
  function enterPhoneConsultation() {
    act(() => {
      container.querySelector<HTMLInputElement>('input[value="phone"]')!.click();
    });
    const fields: Array<[string, string]> = [
      ["consult-name-input", ENTERED.name],
      ["consult-contact-input", ENTERED.contact],
      ["consult-preferred-call-time-input", ENTERED.preferredCallTime],
    ];
    for (const [testId, value] of fields) {
      const input = container.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
      act(() => {
        setNativeInputValue(input, value);
        input.dispatchEvent(new Event("focusout", { bubbles: true }));
      });
    }
    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    act(() => {
      checkboxes[0].click();
      checkboxes[1].click();
      checkboxes[2].click(); // 선택 동의(마케팅)
    });
  }

  it("실패 후 재시도는 채널·이름·연락처·연락 희망 시간·마케팅 동의를 최초 제출과 동일한 payload로 재전송한다(AC-B2CCONSULT-022)", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ status: "error", code: "server_error", message: "..." }),
    });

    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });
    enterPhoneConsultation();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(container.querySelector('[data-testid="consult-failure"]')).not.toBeNull();
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // 입력값이 실제로 첫 요청에 실렸는지 먼저 확인한다 — 비교 대상이 빈 값이면
    // 재시도 비교가 공허하게 통과한다.
    expect(firstBody).toMatchObject({
      ...ENTERED,
      consent: { piiCollection: true, healthInfoUse: true, marketing: true },
    });

    // design.md §10 — 03-D 요약에는 이름이 표시되지 않지만(4행), 그 값은 재전송된다.
    expect(
      container.querySelector('[data-testid="consult-failure-summary"]')?.textContent
    ).not.toContain(ENTERED.name);

    await clickAndFlush(container.querySelector('[data-testid="consult-failure-retry"]')!);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody).toMatchObject({
      ...ENTERED,
      consent: { piiCollection: true, healthInfoUse: true, marketing: true },
    });
    expect(secondBody).toEqual(firstBody);
  });

  it("실패 후 /consult에 다시 들어오면 draft에서 입력값이 폼에 복원되고, 필수 동의만 다시 체크하면 같은 payload로 재전송된다(AC-B2CCONSULT-022)", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ status: "error", code: "server_error", message: "..." }),
    });

    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });
    enterPhoneConsultation();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    // "이전 화면으로 돌아가기"(/result)로 나갔다가 /consult로 다시 들어오는
    // 경로 — 컴포넌트를 새로 마운트하고 sessionStorage draft만 남긴다.
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });

    expect(container.querySelector<HTMLInputElement>('input[value="phone"]')!.checked).toBe(true);
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]')!.value
    ).toBe(ENTERED.name);
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="consult-contact-input"]')!.value
    ).toBe(ENTERED.contact);
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="consult-preferred-call-time-input"]'
      )!.value
    ).toBe(ENTERED.preferredCallTime);
    const restored = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(restored[0].checked).toBe(false); // 필수 동의는 복원하지 않는다(재확인 원칙)
    expect(restored[1].checked).toBe(false);
    expect(restored[2].checked).toBe(true); // 마케팅 동의는 draft에서 복원된다

    act(() => {
      restored[0].click();
      restored[1].click();
    });
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const reentryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(reentryBody).toEqual(firstBody);
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
      root.render(<ConsultView isPolicyReady />);
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
      root.render(<ConsultView isPolicyReady />);
    });

    const phoneRadio = container.querySelector<HTMLInputElement>('input[value="phone"]');
    act(() => {
      phoneRadio!.click();
    });

    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    const contactInput = container.querySelector<HTMLInputElement>('[data-testid="consult-contact-input"]');
    act(() => {
      setNativeInputValue(nameInput!, "김보상");
      setNativeInputValue(contactInput!, "010-0000-0000");
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
      root.render(<ConsultView isPolicyReady />);
    });

    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    const contactInput = container.querySelector<HTMLInputElement>('[data-testid="consult-contact-input"]');
    act(() => {
      setNativeInputValue(nameInput!, "김보상");
      setNativeInputValue(contactInput!, "연락주세요");
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
      root.render(<ConsultView isPolicyReady />);
    });

    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]');
    const contactInput = container.querySelector<HTMLInputElement>('[data-testid="consult-contact-input"]');
    act(() => {
      setNativeInputValue(nameInput!, "김보상");
      setNativeInputValue(contactInput!, "010-0000-0000");
    });
    checkRequiredConsents();

    await clickSubmitAndFlush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="consult-error-summary"]')).toBeNull();
  });
});

// SPEC-B2C-CONSULT-001 run-phase 보완(design.md §4 "ENABLE_CONSULT_FLOW=true +
// CONSULT_POLICY_READY=false일 때의 클라이언트 동작", acceptance
// AC-B2CCONSULT-005 추가 시나리오) — 정책 미준비 상태에서는 제출 CTA 대신
// 안내 영역이 렌더링되고 어떤 시도로도 POST /api/consultations가 발생하지
// 않는다. 이 클라이언트 대체는 UX 계층일 뿐이며 서버의 503/policy_unavailable
// 거부(route.test.ts)는 독립적으로 유효하다.
describe("components/consult/ConsultView — 정책 미준비 상태의 제출 CTA 대체(AC-B2CCONSULT-005 추가 시나리오)", () => {
  // 법무·운영이 확정한 문구가 아닌 잠정 문구 — lib/consult/consent-policy.ts의
  // CONSULT_POLICY_NOT_READY_NOTICE와 동일한 값을 의도적으로 리터럴로 고정한다
  // (상수를 import하면 상수가 바뀔 때 테스트가 함께 바뀌어 회귀를 못 잡는다).
  const NOT_READY_NOTICE = "상담 신청은 아직 준비 중입니다. 준비가 끝나면 이용하실 수 있어요.";

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

  function fillValidFieldsAndCheckRequiredConsents() {
    const nameInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-name-input"]'
    );
    const contactInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-contact-input"]'
    );
    act(() => {
      setNativeInputValue(nameInput!, "김보상");
      setNativeInputValue(contactInput!, "010-0000-0000");
    });
    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    act(() => {
      checkboxes[0].click();
      checkboxes[1].click();
    });
  }

  function findNotice() {
    return container.querySelector<HTMLElement>('[data-testid="consult-submit-policy-notice"]');
  }

  it("isPolicyReady=false면 제출 버튼이 렌더링되지 않고 role=status aria-live=polite 안내 영역이 표시된다", () => {
    act(() => {
      root.render(<ConsultView isPolicyReady={false} />);
    });
    fillValidFieldsAndCheckRequiredConsents();

    expect(container.querySelector('[data-testid="consult-submit-button"]')).toBeNull();
    const notice = findNotice();
    expect(notice).not.toBeNull();
    expect(notice?.getAttribute("role")).toBe("status");
    expect(notice?.getAttribute("aria-live")).toBe("polite");
    expect(notice?.textContent).toBe(NOT_READY_NOTICE);
  });

  it("prop을 생략해도(fail-closed 기본값) 제출 버튼 대신 안내 영역이 표시된다", () => {
    act(() => {
      root.render(<ConsultView />);
    });

    expect(container.querySelector('[data-testid="consult-submit-button"]')).toBeNull();
    expect(findNotice()?.textContent).toBe(NOT_READY_NOTICE);
  });

  it("isPolicyReady=false에서 필수 동의·유효 입력 후 안내 영역 클릭과 입력 필드 Enter는 POST를 발생시키지 않는다", async () => {
    act(() => {
      root.render(<ConsultView isPolicyReady={false} />);
    });
    fillValidFieldsAndCheckRequiredConsents();

    const notice = findNotice();
    const nameInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-name-input"]'
    );
    const contactInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-contact-input"]'
    );
    await act(async () => {
      notice!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      container
        .querySelector('[data-testid="consult-submit-bar"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      for (const input of [nameInput!, contactInput!]) {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      }
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
    // 제출 시도 후에도 03-B/C/D 결과 화면으로 전환되지 않고 폼이 그대로 남는다.
    expect(container.querySelector('[data-testid="consult-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-success"]')).toBeNull();
    expect(container.querySelector('[data-testid="consult-failure"]')).toBeNull();
  });

  it("isPolicyReady=false여도 채널 선택기·입력 필드·동의 그룹은 그대로 표시되고 조작할 수 있다", () => {
    act(() => {
      root.render(<ConsultView isPolicyReady={false} />);
    });

    expect(container.querySelector('[data-testid="consult-channel-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-form"]')).not.toBeNull();
    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes.length).toBe(3);

    // 채널 전환이 실제로 동작한다.
    const phoneRadio = container.querySelector<HTMLInputElement>('input[value="phone"]');
    act(() => {
      phoneRadio!.click();
    });
    expect(container.querySelector<HTMLInputElement>('input[value="phone"]')!.checked).toBe(true);

    // 입력 필드가 실제로 값을 받는다.
    const nameInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-name-input"]'
    );
    act(() => {
      setNativeInputValue(nameInput!, "김보상");
    });
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]')!.value
    ).toBe("김보상");

    // 동의 체크박스가 실제로 토글된다.
    act(() => {
      checkboxes[0].click();
    });
    expect(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].checked).toBe(
      true
    );
  });

  it("회귀 짝: isPolicyReady=true면 안내 영역은 없고 제출 버튼이 렌더링된다", () => {
    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });

    expect(findNotice()).toBeNull();
    expect(container.querySelector('[data-testid="consult-submit-button"]')).not.toBeNull();
    expect(container.textContent).not.toContain(NOT_READY_NOTICE);
  });
});
