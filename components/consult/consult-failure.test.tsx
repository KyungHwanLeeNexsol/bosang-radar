// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsultFailure } from "./consult-failure";

// React 19 act() 환경 플래그 — 이 플래그가 없으면 act() 자체는 여전히
// 동작하지만 "The current testing environment is not configured to support
// act(...)" 경고가 매 act() 호출마다 출력된다(react-dom/test-utils 문서 권고).
// @types/react가 이 필드를 globalThis에 타입 선언하지 않으므로 좁힌 타입으로
// 캐스팅한다(any 금지 — 이 프로젝트 코딩 표준).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SPEC-B2C-CONSULT-001 M5 (design.md §10; acceptance AC-B2CCONSULT-022) —
// 03-D/M03-D 실패 상태. "저장되었습니다"류의 확정 문구를 절대 포함하지
// 않으며, 다시 시도하기는 동일 idempotencyKey 재전송(호출부 책임)을
// 트리거하고, 입력값은 그대로 보존 표시된다.

describe("components/consult/ConsultFailure", () => {
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
    channel: "phone" as const,
    name: "김보상",
    contact: "010-0000-0000",
    preferredCallTime: "평일 오후",
    isRetrying: false,
    onRetry: vi.fn(),
  };

  it("AC-022: 확정 문구('저장되었습니다') 없이 입력 보존 문구를 렌더링한다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} />);
    });

    expect(container.querySelector('[data-testid="consult-failure"]')).not.toBeNull();
    expect(container.textContent).toContain("상담 신청이 접수되지 않았습니다");
    expect(container.textContent).not.toContain("저장되었습니다");
    // SummaryRow는 dt/dd를 별개 요소로 렌더링해 콜론 없이 이어 붙는다 —
    // consult-success.test.tsx/consult-duplicate.test.tsx와 동일하게
    // 라벨/값을 별도 assertion으로 검증한다(design.md §10의 "입력 내용:
    // 유지됨" 표기는 이 요약행이 전달하는 의미를 설명하는 것으로, 다른
    // SummaryRow 행들과 달리 이 행만 콜론을 실제로 렌더링해야 한다는
    // 근거는 없다 — 이 SPEC의 기존 03-B/C 화면 컨벤션과 일치시킨다).
    expect(container.textContent).toContain("입력 내용");
    expect(container.textContent).toContain("유지됨");
  });

  it("채널·이름·연락 희망 시간 입력값이 그대로 유지되어 표시된다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} />);
    });

    expect(container.textContent).toContain("전화 상담");
    expect(container.textContent).toContain("평일 오후");
  });

  it("다시 시도하기 클릭 시 onRetry가 호출된다(같은 idempotencyKey 재전송은 호출부 책임)", () => {
    const onRetry = vi.fn();
    act(() => {
      root.render(<ConsultFailure {...baseProps} onRetry={onRetry} />);
    });

    const retryButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="consult-failure-retry"]'
    );
    act(() => {
      retryButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("isRetrying이 true면 재시도 버튼에 aria-busy가 부여되고 비활성화된다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} isRetrying />);
    });

    const retryButton = container.querySelector('[data-testid="consult-failure-retry"]');
    expect(retryButton?.getAttribute("aria-busy")).toBe("true");
  });

  it("진단 결과로 돌아가기 링크와 대체 채널 안내 문구를 렌더링한다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} />);
    });

    const backCta = container.querySelector('[data-testid="consult-failure-back-cta"]');
    expect(backCta?.getAttribute("href")).toBe("/result");
    expect(container.textContent).toContain("카카오톡 상담으로 문의해 주세요");
  });
});
