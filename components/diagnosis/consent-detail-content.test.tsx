// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// SPEC-B2C-DIAGNOSIS-001 M4 (design.md §2, §14, §17; plan.md §B) —
// 01-A3/M01-A3 동의 상세 6개 항목 공용 콘텐츠. 6개 항목은 법무 확정 전까지
// 반드시 리터럴 `{}` placeholder 형태를 유지해야 한다(REQ-B2CDIAG-025,
// AC-B2CDIAG-025) — 이 테스트는 6개 문구가 그대로 노출되는지 검증한다.

describe("components/diagnosis/ConsentDetailContent — AC-B2CDIAG-025", () => {
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

  it("6개 항목이 모두 리터럴 {} placeholder 문구로 렌더링된다", async () => {
    const { ConsentDetailContent } = await import("./consent-detail-content");
    act(() => {
      root.render(<ConsentDetailContent />);
    });

    const expectedPlaceholders = [
      "{처리 목적 확정 문구}",
      "{처리 항목 확정 문구}",
      "{저장 여부 확정 문구}",
      "{보유·이용 기간 확정 문구}",
      "{외부 AI 전송 여부 확정 문구}",
      "{동의 거부 및 제한 확정 문구}",
    ];

    for (const placeholder of expectedPlaceholders) {
      expect(container.textContent).toContain(placeholder);
    }
  });

  it("6개 항목 각각 레이블(dt)과 값(dd)이 한 쌍씩 존재한다", async () => {
    const { ConsentDetailContent } = await import("./consent-detail-content");
    act(() => {
      root.render(<ConsentDetailContent />);
    });

    expect(container.querySelectorAll("dt").length).toBe(6);
    expect(container.querySelectorAll("dd").length).toBe(6);
  });
});
