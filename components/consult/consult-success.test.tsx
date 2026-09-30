// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultSuccess } from "./consult-success";

// SPEC-B2C-CONSULT-001 M5 (design.md §10, §9.4; acceptance
// AC-B2CCONSULT-018 최초 제출 성공 응답 형태) — 03-B/M03-B 성공 상태.
// 서버 응답(maskedContact/preferredCallTime)만 그대로 렌더링하고,
// consultationId를 노출하지 않는다. 2026-09 .pen 최우선 지시로 문구·배치를
// .pen 03-B 그대로 맞춘다: 부제("영업일 기준 1일 이내에 …")가 카드 위에 오고,
// 카카오 채널도 연락 희망 시간 행을 보이며, 목적지 없는 "신청 취소 · 정보 삭제 문의"는
// 디자인 모양의 비활성 버튼("준비 중")이다.

describe("components/consult/ConsultSuccess", () => {
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

  it("카카오 채널 성공 시 마스킹된 연락처와 .pen 부제를 렌더링한다", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    expect(container.querySelector('[data-testid="consult-success"]')).not.toBeNull();
    expect(container.textContent).toContain("상담 신청이 접수되었습니다");
    expect(container.textContent).toContain("010-****-1234");
    expect(container.querySelector('[data-testid="consult-success-notice"]')?.textContent).toBe(
      "영업일 기준 1일 이내에 선택하신 방법으로 연락드립니다."
    );
  });

  it("부제는 요약 카드보다 위에 있다(.pen 순서: 제목 → 부제 → 카드 → 버튼)", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    const subtitle = container.querySelector('[data-testid="consult-success-notice"]')!;
    const summary = container.querySelector('[data-testid="consult-success-summary"]')!;
    const actions = container.querySelector('[data-testid="consult-success-back-cta"]')!;
    expect(
      subtitle.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      summary.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("전화 채널 + preferredCallTime이 있으면 연락 희망 시간을 표시한다", () => {
    act(() => {
      root.render(
        <ConsultSuccess
          channel="phone"
          maskedContact="010-****-5678"
          preferredCallTime="평일 오후"
        />
      );
    });

    expect(container.textContent).toContain("연락 희망 시간");
    expect(container.textContent).toContain("평일 오후");
  });

  it(".pen 03-B 4행: 카카오 채널도 preferredCallTime이 있으면 연락 희망 시간 행을 보인다", () => {
    act(() => {
      root.render(
        <ConsultSuccess
          channel="kakao"
          maskedContact="010-****-1234"
          preferredCallTime="평일 오전"
        />
      );
    });

    const summary = container.querySelector('[data-testid="consult-success-summary"]');
    expect(summary?.textContent).toContain("연락 희망 시간");
    expect(summary?.textContent).toContain("평일 오전");
  });

  it("값이 없으면(카카오 선택 입력 생략) 연락 희망 시간 행을 렌더링하지 않는다", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    expect(container.textContent).not.toContain("연락 희망 시간");
  });

  it("상담 예정 전문가 행은 중립 값 '배정 예정'이다(D3 — 자동 배정은 범위 밖)", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    const summary = container.querySelector('[data-testid="consult-success-summary"]');
    expect(summary?.textContent).toContain("상담 예정 전문가");
    expect(summary?.textContent).toContain("배정 예정");
  });

  it("진단 결과로 돌아가기는 /result 링크이고 신청 취소·정보 삭제 문의는 준비 중 비활성 버튼이다", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    const backCta = container.querySelector('[data-testid="consult-success-back-cta"]');
    expect(backCta?.tagName).toBe("A");
    expect(backCta?.getAttribute("href")).toBe("/result");

    const cancel = container.querySelector('[data-testid="consult-success-cancel-inquiry"]');
    expect(cancel?.tagName).toBe("BUTTON");
    expect(cancel?.getAttribute("aria-disabled")).toBe("true");
    expect(cancel?.textContent).toContain("신청 취소 · 정보 삭제 문의");
    expect(cancel?.textContent).toContain("준비 중");
  });

  it("데스크톱 푸터를 함께 그린다(.pen 03-B)", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    expect(container.querySelector('[data-testid="consult-footer"]')).not.toBeNull();
  });

  it("내부 DB 식별자(consultationId)를 DOM 어디에도 노출하지 않는다(§9.4)", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    expect(container.innerHTML).not.toMatch(/consultationId/i);
  });
});
