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

  it("reason을 생략하면 기본(결과 불명) 변형과 동일하게 렌더링한다", () => {
    act(() => {
      root.render(<ConsultFailure {...baseProps} reason="unknown_outcome" />);
    });

    expect(container.textContent).toContain("상담 신청 접수 여부를 확인하지 못했습니다");
    expect(container.textContent).toContain("접수되었는지 이 화면에서는 알 수 없습니다");
    expect(container.textContent).toContain("중복 접수되지 않습니다");
    expect(container.querySelector('[data-testid="consult-failure-retry"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consult-failure-notice"]')).not.toBeNull();
  });
});

// handoff_mismatch 변형 — consult-view.tsx handleSubmit이 제출 직전에 진단 핸드오프
// 불일치를 감지하면 서버로 아무 요청도 보내지 않고 이 화면으로 온다. 그래서 공용
// 문구("접수되었는지 알 수 없습니다", "다시 시도해도 중복 접수되지 않습니다")가 사실과
// 다르고, 재시도는 같은 비교를 반복해 계속 실패하므로 재시도 버튼도 없다.
describe("components/consult/ConsultFailure — handoff_mismatch 변형", () => {
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

  const mismatchProps = {
    channel: "phone" as const,
    contact: "010-1234-5678",
    preferredCallTime: "평일 오후",
    isRetrying: false,
    onRetry: vi.fn(),
    reason: "handoff_mismatch" as const,
  };

  it("제목과 부제가 '보내지 않았음'을 알린다(부제는 role=alert)", () => {
    act(() => {
      root.render(<ConsultFailure {...mismatchProps} />);
    });

    const title = container.querySelector('[data-testid="consult-outcome-title"]');
    expect(title?.textContent).toBe("상담 신청을 보내지 않았습니다");
    const subtitle = container.querySelector('p[role="alert"]');
    expect(subtitle?.textContent).toContain(
      "진단 결과가 달라져 신청을 보내지 않았습니다. 진단 결과를 다시 확인한 뒤 신청해 주세요."
    );
  });

  it("재시도 버튼과 안내 박스(중복 접수 안 됨)를 렌더링하지 않는다", () => {
    act(() => {
      root.render(<ConsultFailure {...mismatchProps} />);
    });

    expect(container.querySelector('[data-testid="consult-failure-retry"]')).toBeNull();
    expect(container.querySelector('[data-testid="consult-failure-notice"]')).toBeNull();
    expect(container.textContent).not.toContain("다시 시도하기");
  });

  it("공용 문구(접수 여부 불명·중복 접수 안내)가 나타나지 않는다", () => {
    act(() => {
      root.render(<ConsultFailure {...mismatchProps} />);
    });

    const text = container.textContent ?? "";
    expect(text).not.toContain("접수되었는지 이 화면에서는 알 수 없습니다");
    expect(text).not.toContain("중복 접수되지 않습니다");
    expect(text).not.toContain("접수 여부를 확인하지 못했습니다");
  });

  it("요약 카드와 이전 화면으로 돌아가기(/result) 링크는 그대로 유지한다", () => {
    act(() => {
      root.render(<ConsultFailure {...mismatchProps} />);
    });

    const summary = container.querySelector('[data-testid="consult-failure-summary"]');
    expect(summary?.textContent).toContain("전화 상담");
    expect(summary?.textContent).toContain("평일 오후");
    expect(summary?.textContent).toContain("유지됨");

    const backCta = container.querySelector('[data-testid="consult-failure-back-cta"]');
    expect(backCta?.tagName).toBe("A");
    expect(backCta?.getAttribute("href")).toBe("/result");
    expect(backCta?.textContent).toContain("이전 화면으로 돌아가기");
  });

  // D-NEW-32 — 서버에 아무것도 보내지 않은 경로라 연락처를 화면에 되풀이해 보일 이유가
  // 없다. 마스킹된 값만 보이고 원본 숫자(가운데 구간)는 DOM 어디에도 남지 않는다.
  it("연락처를 마스킹해서 보여주고 원본 번호는 DOM에 남기지 않는다", () => {
    act(() => {
      root.render(<ConsultFailure {...mismatchProps} />);
    });

    const text = container.textContent ?? "";
    expect(text).toContain("010-****-5678");
    expect(text).not.toContain("010-1234-5678");
    expect(text).not.toContain("01012345678");
    expect(text).not.toContain("1234");
  });

  it("하이픈 없는 입력도 같은 마스킹 형식으로 보여준다", () => {
    act(() => {
      root.render(<ConsultFailure {...mismatchProps} contact="01012345678" />);
    });

    const text = container.textContent ?? "";
    expect(text).toContain("010-****-5678");
    expect(text).not.toContain("01012345678");
  });

  it("정규화할 수 없는 연락처는 끝 4자리만 남기고 던지지 않는다", () => {
    act(() => {
      root.render(<ConsultFailure {...mismatchProps} contact="abc-9876" />);
    });

    const text = container.textContent ?? "";
    expect(text).toContain("****-9876");
    expect(text).not.toContain("abc");
  });

  it("입력 내용 행이 필수 동의를 다시 확인해야 함을 함께 알린다", () => {
    act(() => {
      root.render(<ConsultFailure {...mismatchProps} />);
    });

    const summary = container.querySelector('[data-testid="consult-failure-summary"]');
    expect(summary?.textContent).toContain("유지됨 · 필수 동의는 다시 확인해 주세요");
  });
});

// 결과 불명(unknown_outcome) 변형은 .pen 03-D 프레임과 픽셀 비교되므로 이번 변경으로
// 렌더 결과가 달라지면 안 된다 — 연락처 원문과 "유지됨" 단독 표기를 고정하는 회귀 가드.
describe("components/consult/ConsultFailure — unknown_outcome 변형 회귀 가드", () => {
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

  it("연락처는 입력 원문 그대로, 입력 내용은 '유지됨'만 표시한다", () => {
    act(() => {
      root.render(
        <ConsultFailure
          reason="unknown_outcome"
          channel="phone"
          contact="010-1234-5678"
          preferredCallTime="평일 오후"
          isRetrying={false}
          onRetry={vi.fn()}
        />
      );
    });

    const rows = Array.from(
      container.querySelectorAll('[data-testid="consult-failure-summary"] > div')
    ).map((row) => [row.querySelector("dt")?.textContent, row.querySelector("dd")?.textContent]);
    expect(rows).toContainEqual(["연락처", "010-1234-5678"]);
    expect(rows).toContainEqual(["입력 내용", "유지됨"]);
    expect(container.textContent).not.toContain("필수 동의");
    expect(container.textContent).not.toContain("****");
  });
});
