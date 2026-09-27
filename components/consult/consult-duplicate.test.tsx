// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultDuplicate } from "./consult-duplicate";

// SPEC-B2C-CONSULT-001 M5 (design.md §10; acceptance AC-B2CCONSULT-023) —
// 03-C/M03-C 중복 상태. 마스킹된 연락처·접수일(날짜 단위)·처리 상태
// 라벨만 노출하고, 내부 consultationId나 전체 페이로드는 DOM 어디에도
// 노출하지 않는다.

describe("components/consult/ConsultDuplicate", () => {
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

  const baseProps = {
    channel: "kakao" as const,
    maskedContact: "010-****-1234",
    receivedAt: "2026-09-20",
    applicationStatus: "received",
  };

  it("AC-023: 마스킹된 연락처·접수일·처리 상태 라벨만 렌더링한다", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} />);
    });

    expect(container.querySelector('[data-testid="consult-duplicate"]')).not.toBeNull();
    expect(container.textContent).toContain("이미 접수된 상담 신청이 있습니다");
    expect(container.textContent).toContain("010-****-1234");
    expect(container.textContent).toContain("2026-09-20");
  });

  it("접수일은 시:분:초 없이 날짜 단위로만 표시된다(추가 시나리오)", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} receivedAt="2026-09-20" />);
    });

    // 시:분:초 구분자(콜론)가 접수일 표시 영역에 포함되지 않아야 한다.
    const summary = container.querySelector('[data-testid="consult-duplicate-summary"]');
    expect(summary?.textContent).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("내부 consultationId나 전체 페이로드를 노출하지 않는다(REQ-B2CCONSULT-020)", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} />);
    });

    expect(container.innerHTML).not.toMatch(/consultationId/i);
  });

  it("기존 신청 상태 확인 준비중 stub과 진단 결과로 돌아가기 링크를 렌더링한다", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} />);
    });

    expect(container.textContent).toContain("기존 신청 상태 확인");
    const backCta = container.querySelector('[data-testid="consult-duplicate-back-cta"]');
    expect(backCta?.getAttribute("href")).toBe("/result");
  });
});
