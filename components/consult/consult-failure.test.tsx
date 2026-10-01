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
// 트리거하고, 입력값은 그대로 보존 표시된다. 2줄 부제, 카드 아래 안내 박스
// (중복 접수되지 않음 + 입력 유지 문구), 아이콘 버튼을 갖는다. 접수 여부를
// 단정하지 않는 문구(응답 유실 가능성)를 검증한다.

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
    expect(container.textContent).toContain("상담 신청 접수 여부를 확인하지 못했습니다");
    expect(container.textContent).not.toContain("저장되었습니다");
    // SummaryRow는 dt/dd를 별개 요소로 렌더링해 콜론 없이 이어 붙는다 —
    // consult-success.test.tsx/consult-duplicate.test.tsx와 동일하게
    // 라벨/값을 별도 assertion으로 검증한다.
    expect(container.textContent).toContain("입력 내용");
    expect(container.textContent).toContain("유지됨");
  });

  // design.md §10 실패 요약은 정확히 4행(상담 방식/연락처/연락 희망 시간/입력 내용)만
  // 명시한다. 구현이 이전에 "이름" 행을 추가로 렌더링했던 것은 이 결정과 어긋난
  // 편차였다 — 회귀 방지 가드.
  it("design.md §10 — 요약에 '이름' 행을 추가로 렌더링하지 않는다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} />);
    });

    const summary = container.querySelector('[data-testid="consult-failure-summary"]');
    expect(summary?.textContent).not.toContain("이름");
  });

  it("채널·연락 희망 시간 입력값이 그대로 유지되어 표시된다(design.md §10 — 이름은 요약에 표시하지 않는다)", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} />);
    });

    expect(container.textContent).toContain("전화 상담");
    expect(container.textContent).toContain("평일 오후");
  });

  it(".pen 03-D 4행: 카카오 채널이어도 입력한 연락 희망 시간이 있으면 행을 보인다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} channel="kakao" />);
    });

    const summary = container.querySelector('[data-testid="consult-failure-summary"]');
    expect(summary?.textContent).toContain("연락 희망 시간");
    expect(summary?.textContent).toContain("평일 오후");
  });

  it("입력한 연락 희망 시간이 비어 있으면 행을 렌더링하지 않는다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} channel="kakao" preferredCallTime="" />);
    });

    const summary = container.querySelector('[data-testid="consult-failure-summary"]');
    expect(summary?.textContent).not.toContain("연락 희망 시간");
  });

  it(".pen 03-D: 부제 두 문장이 알림(role=alert)으로 제공된다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} />);
    });

    const subtitle = container.querySelector('p[role="alert"]');
    expect(subtitle?.textContent).toContain("신청이 접수되었는지 이 화면에서는 알 수 없습니다.");
    expect(subtitle?.textContent).toContain("입력하신 내용은 다시 입력하지 않아도 됩니다.");
  });

  // 이 화면은 서버 error뿐 아니라 응답 유실·네트워크 예외도 받으므로, 서버가
  // 이미 접수했을 수 있다. "접수되지 않았다"고 단정하거나 존재하지 않는 문의
  // 창구를 안내하는 문구가 다시 들어오지 않도록 막는다.
  it("접수 안 됨을 단정하거나 카카오톡 문의를 안내하는 문구를 포함하지 않는다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} />);
    });

    const text = container.textContent ?? "";
    expect(text).not.toContain("접수되지 않았습니다");
    expect(text).not.toContain("접수가 완료되지 않았습니다");
    expect(text).not.toContain("카카오톡 상담으로 문의");
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

  it("isRetrying이 true면 재시도 버튼에 aria-busy가 부여되고 누르기가 무시된다", () => {
    const onRetry = vi.fn();
    act(() => {
      root.render(<ConsultFailure {...baseProps} onRetry={onRetry} isRetrying />);
    });

    const retryButton = container.querySelector('[data-testid="consult-failure-retry"]');
    expect(retryButton?.getAttribute("aria-busy")).toBe("true");
    expect(retryButton?.getAttribute("aria-disabled")).toBe("true");
    act(() => {
      retryButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("이전 화면으로 돌아가기는 /result 링크이고 안내 박스가 중복 접수되지 않음과 입력 유지를 알린다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} />);
    });

    const backCta = container.querySelector('[data-testid="consult-failure-back-cta"]');
    expect(backCta?.tagName).toBe("A");
    expect(backCta?.getAttribute("href")).toBe("/result");
    expect(backCta?.textContent).toContain("이전 화면으로 돌아가기");

    const note = container.querySelector('[data-testid="consult-failure-notice"]');
    expect(note?.textContent).toContain("같은 내용으로 다시 시도해도 중복 접수되지 않습니다.");
    expect(note?.textContent).toContain("현재 화면에서 입력 내용이 유지됩니다.");
  });

  it("데스크톱 푸터를 함께 그린다(.pen 03-D)", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} />);
    });

    expect(container.querySelector('[data-testid="consult-footer"]')).not.toBeNull();
  });
});
