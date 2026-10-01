// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { NextRequest } from "next/server";

import { ConsultView } from "./consult-view";
import { handleConsultationSubmit } from "@/app/api/consultations/route";
import * as schema from "@/lib/db/schema";
import { writeDiagnosisHandoff } from "@/lib/diagnosis/handoff";
import {
  buildFractureResult,
  FRACTURE_FIXTURE_INPUT,
} from "@/lib/diagnosis/fixtures/fracture-case";
import { readConsultationDraft, writeConsultationDraft } from "@/lib/consult/draft";
import { CONSULTATION_DRAFT_VERSION } from "@/lib/consult/types";

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

// 2026-09 .pen 최우선 지시 — 03 / 03-A2 폼 화면 조립: 입력칸 아래·동의 목록 위에 "상담 예정 전문가"
// 카드가 오고, 맨 아래에 데스크톱 푸터가 붙는다. 데이터가 없거나 손상된 화면에는 붙지 않는다.
describe("components/consult/ConsultView — .pen 03 폼 화면 조립(전문가 카드·푸터)", () => {
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

  it("전문가 카드는 입력 폼 뒤, 동의 목록 앞에 온다", () => {
    writeDiagnosisHandoff(
      buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" })
    );
    act(() => {
      root.render(<ConsultView />);
    });

    const form = container.querySelector('[data-testid="consult-form"]')!;
    const card = container.querySelector('[data-testid="consult-expert-card"]')!;
    const consent = container.querySelector('[data-testid="consult-consent-group"]')!;
    expect(card).not.toBeNull();
    expect(form.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(consent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("푸터는 폼 화면 맨 아래에 붙는다", () => {
    writeDiagnosisHandoff(
      buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" })
    );
    act(() => {
      root.render(<ConsultView />);
    });

    const footer = container.querySelector('[data-testid="consult-footer"]');
    const consent = container.querySelector('[data-testid="consult-consent-group"]')!;
    expect(footer).not.toBeNull();
    expect(
      consent.compareDocumentPosition(footer!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("진단 데이터가 없는 화면에는 전문가 카드도 푸터도 붙지 않는다", () => {
    act(() => {
      root.render(<ConsultView />);
    });

    expect(container.querySelector('[data-testid="consult-no-data"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-expert-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="consult-footer"]')).toBeNull();
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
      root.render(<ConsultView isPolicyReady />);
    });

    const draft = readConsultationDraft();
    expect(draft.idempotencyKey).toBeTruthy();
    expect(typeof draft.idempotencyKey).toBe("string");
  });

  it("이름 필드에서 blur하면 draft에 이름이 저장되고, 필수 동의 체크 상태는 저장되지 않는다", () => {
    act(() => {
      root.render(<ConsultView isPolicyReady />);
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
      container
        .querySelector('[data-testid="consult-submit-button"]')
        ?.getAttribute("aria-disabled")
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

    // 아무것도 보내지 않았으므로 "접수 여부 불명"·"중복 접수되지 않음" 문구와
    // 재시도 버튼이 없어야 한다(재시도는 같은 비교를 반복해 계속 실패한다).
    expect(container.querySelector('[data-testid="consult-outcome-title"]')?.textContent).toBe(
      "상담 신청을 보내지 않았습니다"
    );
    expect(container.querySelector('p[role="alert"]')?.textContent).toContain(
      "진단 결과가 달라져 신청을 보내지 않았습니다. 진단 결과를 다시 확인한 뒤 신청해 주세요."
    );
    expect(container.querySelector('[data-testid="consult-failure-retry"]')).toBeNull();
    expect(container.querySelector('[data-testid="consult-failure-notice"]')).toBeNull();
    expect(container.textContent).not.toContain("접수되었는지 이 화면에서는 알 수 없습니다");
    expect(container.textContent).not.toContain("중복 접수되지 않습니다");
    expect(container.querySelector('[data-testid="consult-failure-back-cta"]')).not.toBeNull();
  });

  it("handoff_mismatch가 아닌 실패(fetch 예외)는 공용 문구와 재시도 버튼을 그대로 보인다", async () => {
    fetchMock.mockRejectedValue(new Error("network"));

    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });
    fillRequiredFieldsAndConsent();
    await clickAndFlush(container.querySelector('[data-testid="consult-submit-button"]')!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="consult-outcome-title"]')?.textContent).toBe(
      "상담 신청 접수 여부를 확인하지 못했습니다"
    );
    expect(container.textContent).toContain("접수되었는지 이 화면에서는 알 수 없습니다");
    expect(
      container.querySelector('[data-testid="consult-failure-notice"]')?.textContent
    ).toContain("같은 내용으로 다시 시도해도 중복 접수되지 않습니다.");
    expect(container.querySelector('[data-testid="consult-failure-retry"]')).not.toBeNull();
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

    const nameInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-name-input"]'
    );
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

    const nameInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-name-input"]'
    );
    const contactInput = container.querySelector<HTMLInputElement>(
      '[data-testid="consult-contact-input"]'
    );
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

  it("isPolicyReady=false에서 필수 동의·유효 입력 후 제출 영역(안내 영역 포함) 클릭과 키보드 포커스 이동은 POST를 발생시키지 않는다", async () => {
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
    // 03 폼에는 <form>·Enter 제출 핸들러가 없어 어떤 정책 상태에서도 제출은 제출
    // 버튼 클릭(키보드로는 포커스된 버튼의 활성화)뿐이다. 그래서 이 시나리오의
    // 조작은 제출 영역 클릭·탭과 키보드 포커스 이동이다.
    await act(async () => {
      notice!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      container
        .querySelector('[data-testid="consult-submit-bar"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // 키보드 포커스를 입력 필드 사이로 옮기고, 안내 영역(비대화형) 주변까지 이동한다.
      nameInput!.focus();
      contactInput!.focus();
      notice!.focus();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
    // 제출 시도 후에도 03-B/C/D 결과 화면으로 전환되지 않고 폼이 그대로 남는다.
    expect(container.querySelector('[data-testid="consult-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-success"]')).toBeNull();
    expect(container.querySelector('[data-testid="consult-failure"]')).toBeNull();

    // 키보드 부분의 판별 단언: 제출 영역과 03 뷰 전체에 제출 컨트롤이 존재하지 않는다
    // (제출 버튼·type=submit 버튼·form 요소 없음) — 그래서 어떤 키 조작으로도 제출이 시작될 수 없다.
    expect(container.querySelector('[data-testid="consult-submit-button"]')).toBeNull();
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="consult-submit-bar"] button, [data-testid="consult-submit-bar"] [role="button"]'
      )
    ).toBeNull();
    // 안내 영역은 계속 role=status로 존재한다.
    expect(findNotice()?.getAttribute("role")).toBe("status");
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

// REQ-B2CCONSULT-006 정책 미준비 예외 / AC-B2CCONSULT-006 추가 시나리오 —
// isPolicyReady=false에서는 제출이 불가능해 draft의 존재 이유가 없고 원문
// 이름·연락처를 지속 저장소에 남길 근거도 없으므로, 어떤 경로로도 draft를 쓰지
// 않는다(마운트 초기 기록·blur·채널 변경·마케팅 동의 변경). 폼 화면 상태와
// draft 읽기(복원)는 종전과 같다. 이미 있는 draft는 갱신도 삭제도 하지 않는다.
describe("components/consult/ConsultView — 정책 미준비 상태에서는 draft를 쓰지 않는다(AC-B2CCONSULT-006 추가 시나리오)", () => {
  const DRAFT_KEY = "bosang-radar:consultation-draft-v1";
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

  function nameInput() {
    return container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]')!;
  }
  function contactInput() {
    return container.querySelector<HTMLInputElement>('[data-testid="consult-contact-input"]')!;
  }
  function blur(el: HTMLElement) {
    // React는 "focusout"(bubbles) 네이티브 이벤트를 root에서 구독해 합성 onBlur로 변환한다.
    el.dispatchEvent(new Event("focusout", { bubbles: true }));
  }

  it("(a) 마운트 직후 sessionStorage에 draft 키가 없다", () => {
    act(() => {
      root.render(<ConsultView isPolicyReady={false} />);
    });

    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("(b) 이름·연락처를 입력하고 blur해도 draft 키가 없고, 입력한 값은 폼에 그대로 표시된다", () => {
    act(() => {
      root.render(<ConsultView isPolicyReady={false} />);
    });

    act(() => {
      setNativeInputValue(nameInput(), "홍길동");
      blur(nameInput());
      setNativeInputValue(contactInput(), "010-1234-5678");
      blur(contactInput());
    });

    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(nameInput().value).toBe("홍길동");
    expect(contactInput().value).toBe("010-1234-5678");
  });

  it("(c) 채널 변경과 마케팅 동의 토글도 draft를 쓰지 않고, 폼 상태(채널·체크)는 정상 반영된다", () => {
    act(() => {
      root.render(<ConsultView isPolicyReady={false} />);
    });

    act(() => {
      container.querySelector<HTMLInputElement>('input[value="phone"]')!.click();
    });
    act(() => {
      document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[2].click();
    });

    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[value="phone"]')!.checked).toBe(true);
    expect(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[2].checked).toBe(
      true
    );
  });

  it("(d) 이미 있는 유효 draft는 마운트·수정·blur·채널 변경 후에도 바이트 동일하고, 값은 폼에 복원된다(읽기 불변)", () => {
    writeConsultationDraft({
      draftVersion: CONSULTATION_DRAFT_VERSION,
      channel: "phone",
      name: "기존이름",
      contactRaw: "010-9999-8888",
      preferredCallTime: "오후 2시",
      marketingConsent: true,
      idempotencyKey: "seeded-key-1",
    });
    const before = window.sessionStorage.getItem(DRAFT_KEY);
    expect(before).not.toBeNull();

    act(() => {
      root.render(<ConsultView isPolicyReady={false} />);
    });

    // 읽기는 종전과 같다 — draft 값이 폼에 복원된다.
    expect(nameInput().value).toBe("기존이름");
    expect(contactInput().value).toBe("010-9999-8888");
    expect(container.querySelector<HTMLInputElement>('input[value="phone"]')!.checked).toBe(true);

    act(() => {
      setNativeInputValue(nameInput(), "수정된이름");
      blur(nameInput());
    });
    act(() => {
      container.querySelector<HTMLInputElement>('input[value="kakao"]')!.click();
    });

    // 화면 상태는 바뀌지만 저장소의 draft는 갱신도 삭제도 되지 않는다.
    expect(nameInput().value).toBe("수정된이름");
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(before);
  });
});

// SPEC-B2C-CONSULT-001 후속(React hydration 오류 #418 회귀) — /consult를
// 전체 로드(page.goto/reload)하면 서버 HTML은 window가 없어 handoff가 항상
// "empty"이므로 no-data 안내를 렌더링하는데, 클라이언트 첫 렌더는 실제
// sessionStorage를 읽어 폼을 렌더링해 텍스트 콘텐츠가 어긋났다("Minified
// React error #418"). jsdom은 window를 정의하므로 평범한 renderToString은
// 서버를 흉내 내지 못한다 — 서버 렌더 구간에서만 window를 undefined로
// 스텁해 실제 SSR과 동일한 조건(typeof window === "undefined")을 만든 뒤,
// 그 HTML을 컨테이너에 넣고 실제 sessionStorage를 채운 채 hydrateRoot로
// 수화한다.
describe("components/consult/ConsultView — SSR 마크업 수화 일치(hydration #418 회귀)", () => {
  const DRAFT_KEY = "bosang-radar:consultation-draft-v1";
  const NO_DATA_COPY = "먼저 진단 결과가 필요합니다";
  let container: HTMLDivElement;
  let root: Root | null;
  let recoverableErrors: unknown[];
  let consoleErrors: string[];

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.pushState(null, "", "/consult");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    recoverableErrors = [];
    consoleErrors = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map((arg) => String(arg)).join(" "));
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function seedValidHandoff() {
    writeDiagnosisHandoff(
      buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" })
    );
  }

  // 서버 렌더 구간에서만 window를 제거한다 — lib/diagnosis/handoff.ts와
  // lib/consult/draft.ts의 SSR 가드(`typeof window === "undefined"`)가 실제
  // 서버와 똑같이 동작한다.
  function renderServerHtml(isPolicyReady: boolean): string {
    vi.stubGlobal("window", undefined);
    try {
      return renderToString(<ConsultView isPolicyReady={isPolicyReady} />);
    } finally {
      vi.unstubAllGlobals();
    }
  }

  async function hydrate(isPolicyReady: boolean): Promise<string> {
    const serverHtml = renderServerHtml(isPolicyReady);
    container.innerHTML = serverHtml;
    await act(async () => {
      root = hydrateRoot(container, <ConsultView isPolicyReady={isPolicyReady} />, {
        onRecoverableError: (error) => {
          recoverableErrors.push(error);
        },
      });
    });
    return serverHtml;
  }

  function expectNoHydrationErrors() {
    expect(recoverableErrors, `onRecoverableError 호출: ${String(recoverableErrors)}`).toEqual([]);
    const hydrationLogs = consoleErrors.filter((line) => /hydrat|418|did not match/i.test(line));
    expect(hydrationLogs, `hydration 관련 console.error: ${hydrationLogs.join("\n")}`).toEqual([]);
  }

  function expectLoadingMarkup(serverHtml: string) {
    expect(serverHtml).toContain('data-testid="consult-loading"');
    expect(serverHtml).toContain('aria-busy="true"');
    expect(serverHtml).not.toContain(NO_DATA_COPY);
    expect(serverHtml).not.toContain("진단 결과를 불러올 수 없어요");
    expect(serverHtml).not.toContain('data-testid="consult-view"');
    expect(serverHtml).not.toContain('data-testid="consult-no-data"');
    expect(serverHtml).not.toContain('data-testid="consult-error"');
  }

  function nameInput() {
    return container.querySelector<HTMLInputElement>('[data-testid="consult-name-input"]')!;
  }
  function contactInput() {
    return container.querySelector<HTMLInputElement>('[data-testid="consult-contact-input"]')!;
  }
  function radio(channel: "kakao" | "phone") {
    return container.querySelector<HTMLInputElement>(`input[value="${channel}"]`)!;
  }

  it("valid handoff(정책 준비): 서버 마크업은 loading뿐이고, 수화 오류 없이 폼이 표시되며 draft 값이 복원된다", async () => {
    seedValidHandoff();
    writeConsultationDraft({
      draftVersion: CONSULTATION_DRAFT_VERSION,
      channel: "phone",
      name: "복원이름",
      contactRaw: "010-1111-2222",
      preferredCallTime: "평일 오후",
      marketingConsent: true,
      idempotencyKey: "draft-key-ready-1",
    });

    const serverHtml = await hydrate(true);

    expectNoHydrationErrors();
    expectLoadingMarkup(serverHtml);
    expect(container.querySelector('[data-testid="consult-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-loading"]')).toBeNull();
    expect(container.textContent).not.toContain(NO_DATA_COPY);
    expect(nameInput().value).toBe("복원이름");
    expect(contactInput().value).toBe("010-1111-2222");
    expect(radio("phone").checked).toBe(true);
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="consult-consent-checkbox-marketing"]'
      )!.checked
    ).toBe(true);
    // 필수 동의 두 항목은 draft에서 절대 복원하지 않는다.
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="consult-consent-checkbox-piiCollection"]'
      )!.checked
    ).toBe(false);
    expect(container.querySelector('[data-testid="consult-submit-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-submit-policy-notice"]')).toBeNull();
    // draft의 idempotencyKey는 수화 후에도 그대로 보존된다(재시도 재사용 전제).
    expect(readConsultationDraft().idempotencyKey).toBe("draft-key-ready-1");
  });

  it("valid handoff(정책 미준비): 서버 마크업은 loading뿐이고, 수화 오류 없이 폼+정책 안내가 표시되며 draft는 갱신되지 않는다", async () => {
    seedValidHandoff();
    writeConsultationDraft({
      draftVersion: CONSULTATION_DRAFT_VERSION,
      channel: "phone",
      name: "복원이름",
      idempotencyKey: "draft-key-notready-1",
    });
    const draftBefore = window.sessionStorage.getItem(DRAFT_KEY);

    const serverHtml = await hydrate(false);

    expectNoHydrationErrors();
    expectLoadingMarkup(serverHtml);
    expect(container.querySelector('[data-testid="consult-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-submit-policy-notice"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-submit-button"]')).toBeNull();
    // 읽기(복원)는 유지하고 쓰기(persistDraft)만 막는다.
    expect(nameInput().value).toBe("복원이름");
    expect(radio("phone").checked).toBe(true);
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(draftBefore);
  });

  it("draft가 없고 URL이 ?channel=phone이면 전체 로드 수화 후에도 전화 채널이 선택된다", async () => {
    seedValidHandoff();
    window.history.pushState(null, "", "/consult?channel=phone");

    const serverHtml = await hydrate(true);

    expectNoHydrationErrors();
    expectLoadingMarkup(serverHtml);
    expect(radio("phone").checked).toBe(true);
    expect(radio("kakao").checked).toBe(false);
  });

  it("draft의 channel이 URL ?channel=보다 우선한다(draft 카카오 vs URL 전화)", async () => {
    seedValidHandoff();
    writeConsultationDraft({
      draftVersion: CONSULTATION_DRAFT_VERSION,
      channel: "kakao",
      idempotencyKey: "draft-key-priority-1",
    });
    window.history.pushState(null, "", "/consult?channel=phone");

    const serverHtml = await hydrate(true);

    expectNoHydrationErrors();
    expectLoadingMarkup(serverHtml);
    expect(radio("kakao").checked).toBe(true);
    expect(radio("phone").checked).toBe(false);
    expect(readConsultationDraft().idempotencyKey).toBe("draft-key-priority-1");
  });

  it("draft가 없으면 수화 후 idempotencyKey가 새로 1회 생성되어 draft에 기록된다(정책 준비)", async () => {
    seedValidHandoff();

    const serverHtml = await hydrate(true);

    expectNoHydrationErrors();
    expectLoadingMarkup(serverHtml);
    const key = readConsultationDraft().idempotencyKey;
    expect(key).toBeTruthy();
    expect(key).not.toBe("");
  });

  it("handoff 없음(empty): 서버 마크업은 loading뿐이고, 수화 오류 없이 no-data 안내로 전환된다", async () => {
    const serverHtml = await hydrate(true);

    expectNoHydrationErrors();
    expectLoadingMarkup(serverHtml);
    expect(container.querySelector('[data-testid="consult-no-data"]')).not.toBeNull();
    expect(container.textContent).toContain(NO_DATA_COPY);
    expect(container.querySelector('[data-testid="consult-view"]')).toBeNull();
    expect(container.querySelector('[data-testid="consult-loading"]')).toBeNull();
  });

  it("handoff 손상(파싱 불가 JSON): 서버 마크업은 loading뿐이고, 수화 오류 없이 오류 안내로 전환된다", async () => {
    window.sessionStorage.setItem(DIAGNOSIS_STORAGE_KEY, "{not valid json");

    const serverHtml = await hydrate(true);

    expectNoHydrationErrors();
    expectLoadingMarkup(serverHtml);
    expect(container.querySelector('[data-testid="consult-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-view"]')).toBeNull();
  });

  it("handoff 손상(유효 JSON이나 스키마 불일치): 서버 마크업은 loading뿐이고, 수화 오류 없이 오류 안내로 전환된다", async () => {
    window.sessionStorage.setItem(DIAGNOSIS_STORAGE_KEY, JSON.stringify({ unexpected: "shape" }));

    const serverHtml = await hydrate(true);

    expectNoHydrationErrors();
    expectLoadingMarkup(serverHtml);
    expect(container.querySelector('[data-testid="consult-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-view"]')).toBeNull();
  });
});

// SPEC-B2C-CONSULT-001 D-NEW-29 — 응답 유실 후 재시도. 서버가 상담을 이미
// 커밋했는데 클라이언트가 응답을 받지 못하면(네트워크 예외) 03-D가 뜨고, 사용자가
// "다시 시도하기"를 누르면 같은 idempotencyKey로 재전송되어 서버가 기존 결과를
// 재생(200 success)해야 한다. 이 테스트는 fetch를 실제 서버 핸들러
// (handleConsultationSubmit)와 파일 DB에 연결해 클라이언트·서버 경계를 함께
// 확인한다. 기존 route.test.ts와 같은 이유로 :memory:가 아니라 파일 DB를 쓴다
// (libsql 로컬 드라이버는 트랜잭션 뒤 :memory: 연결을 잃는다). 요청이 순차라서
// route.test.ts의 I/O 직렬화 큐는 필요하지 않다.
describe("components/consult/ConsultView — 응답 유실 후 같은 키 재시도(D-NEW-29)", () => {
  const tmpDir = path.resolve(process.cwd(), ".tmp");
  const dbFile = path.join(tmpDir, `consult-view-lost-response-${Date.now()}-${process.pid}.db`);
  const env = { CONSULT_POLICY_READY: "true", RATE_LIMIT_HMAC_SECRET: "test-hmac-secret" };

  let client: Client;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    mkdirSync(tmpDir, { recursive: true });
    client = createClient({ url: `file:${dbFile}`, timeout: 5000 });
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "db", "migrations") });
  });

  afterAll(async () => {
    client.close();
    // Windows는 close() 뒤에도 파일 잠금이 잠시 남을 수 있어 짧게 재시도한다.
    for (const suffix of ["", "-wal", "-shm"]) {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (!existsSync(dbFile + suffix)) break;
        try {
          rmSync(dbFile + suffix);
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    }
  });

  async function countRows(table: "consultations" | "consultation_rate_limits"): Promise<number> {
    const result = await client.execute(`SELECT COUNT(*) as c FROM ${table}`);
    return Number(result.rows[0].c);
  }

  beforeEach(async () => {
    await client.execute("DELETE FROM consultations");
    await client.execute("DELETE FROM consultation_rate_limits");
    window.sessionStorage.clear();
    window.history.pushState(null, "", "/consult");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    writeDiagnosisHandoff(
      buildFractureResult(FRACTURE_FIXTURE_INPUT, { "surgery-status": "수술 받음" })
    );
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  // 실제 DB I/O가 끝나 화면이 바뀔 때까지 조건으로 기다린다(고정 대기는 느린 머신에서
  // 불안정하다). act 안에서는 갱신이 끝나야 DOM에 반영되므로 폴링은 act 밖에서 하고
  // 반복마다 짧은 act로 감싼다.
  async function clickAndWaitFor(el: Element, testId: string) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const deadline = Date.now() + 5000;
    while (!container.querySelector(`[data-testid="${testId}"]`)) {
      if (Date.now() > deadline) {
        throw new Error(`${testId} 화면이 5초 안에 나타나지 않았다`);
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
  }

  it("서버는 커밋했지만 응답이 유실되면 03-D가 접수 여부를 단정하지 않고, 다시 시도하기는 같은 키로 재전송해 03-B에 도달하며 행은 1개·rate limit은 1회만 소비된다", async () => {
    const sentBodies: Array<{ idempotencyKey: string }> = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      sentBodies.push(JSON.parse(init.body as string));
      const request = new NextRequest("http://localhost/api/consultations", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.9" },
        body: init.body as string,
      });
      const response = await handleConsultationSubmit(request, db, env);
      if (sentBodies.length === 1) {
        // 서버는 이미 커밋했다 — 응답만 클라이언트에 닿지 못한다.
        throw new TypeError("Failed to fetch");
      }
      return { json: async () => response.json() };
    });
    vi.stubGlobal("fetch", fetchMock);

    act(() => {
      root.render(<ConsultView isPolicyReady />);
    });
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
    await clickAndWaitFor(
      container.querySelector('[data-testid="consult-submit-button"]')!,
      "consult-failure"
    );

    // 1) 서버는 커밋했지만 클라이언트는 03-D를 본다 — 문구는 접수 여부를 단정하지 않는다.
    expect(await countRows("consultations")).toBe(1);
    const failure = container.querySelector('[data-testid="consult-failure"]');
    expect(failure).not.toBeNull();
    expect(failure!.textContent).toContain("상담 신청 접수 여부를 확인하지 못했습니다");
    expect(failure!.textContent).not.toContain("접수되지 않았습니다");

    // 2) 다시 시도하기 → 같은 idempotencyKey로 재전송 → 서버가 재생 → 03-B.
    await clickAndWaitFor(
      container.querySelector('[data-testid="consult-failure-retry"]')!,
      "consult-success"
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBodies[1].idempotencyKey).toBe(sentBodies[0].idempotencyKey);
    expect(container.querySelector('[data-testid="consult-success"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-failure"]')).toBeNull();
    expect(await countRows("consultations")).toBe(1);
    const counter = await client.execute("SELECT request_count FROM consultation_rate_limits");
    expect(counter.rows.length).toBe(1);
    expect(Number(counter.rows[0].request_count)).toBe(1);
  });
});
