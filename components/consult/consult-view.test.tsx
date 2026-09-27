// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
