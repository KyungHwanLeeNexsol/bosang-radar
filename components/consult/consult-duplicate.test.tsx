// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultDuplicate } from "./consult-duplicate";

// SPEC-B2C-CONSULT-001 M5 (design.md §10; acceptance AC-B2CCONSULT-023) —
// 03-C/M03-C 중복 상태. 마스킹된 연락처·접수일(날짜 단위)·처리 상태
// 라벨만 노출하고, 내부 consultationId나 전체 페이로드는 DOM 어디에도
// 노출하지 않는다. .pen 최우선 지시로 2줄 부제·안내 박스·"상담 대기 중" 상태·
// 아이콘 버튼(주 버튼 "기존 신청 상태 확인"은 목적지 없는 준비 중 비활성)을 맞춘다.

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

  it(".pen 03-C: 처리 상태 received는 '상담 대기 중'으로 보인다", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} />);
    });

    const summary = container.querySelector('[data-testid="consult-duplicate-summary"]');
    expect(summary?.textContent).toContain("처리 상태");
    expect(summary?.textContent).toContain("상담 대기 중");
  });

  it(".pen 03-C: 처리 상태 값만 경고색(#8a5a12)으로 그린다(다른 값은 기본 잉크색)", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} />);
    });

    const values = Array.from(
      container.querySelectorAll('[data-testid="consult-duplicate-summary"] dd')
    );
    const status = values.find((dd) => dd.textContent === "상담 대기 중");
    expect(status?.className).toContain("text-bora-warn");
    const others = values.filter((dd) => dd !== status);
    expect(others.length).toBe(3);
    for (const dd of others) {
      expect(dd.className).not.toContain("text-bora-warn");
    }
  });

  it("알려지지 않은 처리 상태는 원본 문자열을 그대로 보여 준다(향후 확장 대비)", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} applicationStatus="in_review" />);
    });

    const summary = container.querySelector('[data-testid="consult-duplicate-summary"]');
    expect(summary?.textContent).toContain("in_review");
  });

  it(".pen 03-C: 부제 두 문장과 안내 박스(정보 아이콘 박스)를 렌더링한다", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} />);
    });

    const subtitle = container.querySelector('[data-testid="consult-duplicate-subtitle"]');
    expect(subtitle?.textContent).toContain("같은 진단 결과로 접수된 신청이 처리 중입니다.");
    expect(subtitle?.textContent).toContain("중복으로 다시 신청하지 않으셔도 됩니다.");

    const note = container.querySelector('[data-testid="consult-duplicate-notice"]');
    expect(note?.textContent).toContain(
      "신청 내용을 바꾸고 싶으시면 기존 신청을 취소한 뒤 다시 신청해 주세요. 진행 상황은 카카오톡 또는 전화로 안내드립니다."
    );
    // 모바일 문구도 .pen M03-C 그대로 담는다(화면 폭에 따라 하나만 보인다).
    expect(note?.textContent).toContain(
      "내용을 바꾸시려면 기존 신청을 취소한 뒤 다시 신청해 주세요."
    );
  });

  it("기존 신청 상태 확인은 준비 중 비활성 주 버튼, 진단 결과로 돌아가기는 /result 링크다", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} />);
    });

    const status = container.querySelector('[data-testid="consult-duplicate-status-inquiry"]');
    expect(status?.tagName).toBe("BUTTON");
    expect(status?.getAttribute("aria-disabled")).toBe("true");
    expect(status?.textContent).toContain("기존 신청 상태 확인");
    expect(status?.textContent).toContain("준비 중");

    const backCta = container.querySelector('[data-testid="consult-duplicate-back-cta"]');
    expect(backCta?.tagName).toBe("A");
    expect(backCta?.getAttribute("href")).toBe("/result");
    expect(backCta?.textContent).toContain("진단 결과로 돌아가기");
  });

  it("데스크톱 푸터를 함께 그린다(.pen 03-C)", () => {
    act(() => {
      root.render(<ConsultDuplicate {...baseProps} />);
    });

    expect(container.querySelector('[data-testid="consult-footer"]')).not.toBeNull();
  });
});
