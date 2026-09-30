// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultSuccess } from "./consult-success";

// SPEC-B2C-CONSULT-001 M5 (design.md §10, §9.4; acceptance
// AC-B2CCONSULT-018 최초 제출 성공 응답 형태) — 03-B/M03-B 성공 상태.
// 서버 응답(maskedContact/preferredCallTime)만 그대로 렌더링하고,
// consultationId·구체적 연락 시각 약속을 노출하지 않는다.

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

  it("카카오 채널 성공 시 마스킹된 연락처와 중립 안내 문구를 렌더링한다", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    expect(container.querySelector('[data-testid="consult-success"]')).not.toBeNull();
    expect(container.textContent).toContain("상담 신청이 접수되었습니다");
    expect(container.textContent).toContain("010-****-1234");
    expect(container.textContent).toContain(
      "접수 내용을 확인한 뒤 선택하신 방법으로 연락드리겠습니다"
    );
    // §1 D6 — 구체적 시간 약속 문구는 절대 포함하지 않는다.
    expect(container.textContent).not.toContain("영업일 기준");
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

  it("카카오 채널이면 연락 희망 시간 행을 렌더링하지 않는다", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    expect(container.textContent).not.toContain("연락 희망 시간");
  });

  it("진단 결과로 돌아가기 링크와 신청 취소 문의 준비중 stub을 렌더링한다", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    const backCta = container.querySelector('[data-testid="consult-success-back-cta"]');
    expect(backCta).not.toBeNull();
    expect(backCta?.getAttribute("href")).toBe("/result");
    expect(container.textContent).toContain("준비 중");
  });

  it("내부 DB 식별자(consultationId)를 DOM 어디에도 노출하지 않는다(§9.4)", () => {
    act(() => {
      root.render(<ConsultSuccess channel="kakao" maskedContact="010-****-1234" />);
    });

    expect(container.innerHTML).not.toMatch(/consultationId/i);
  });
});
