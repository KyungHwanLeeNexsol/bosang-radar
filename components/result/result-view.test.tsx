// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResultView } from "./result-view";
import { writeDiagnosisHandoff } from "@/lib/diagnosis/handoff";
import { buildFractureResult, FRACTURE_FIXTURE_INPUT } from "@/lib/diagnosis/fixtures/fracture-case";

// SPEC-B2C-RESULT-001 M4 (design.md §5, REQ-B2CRESULT-013/014/016) —
// ResultView의 3갈래 분기(empty/invalid/valid → 올바른 자식 렌더링)를
// 검증한다. 골절 fixture(M2)를 valid 케이스에 사용한다. ResultNoData/
// ResultError가 useRouter()를 호출하므로(next/navigation), diagnosis-flow
// 테스트군과 동일하게 next/navigation을 모킹한다 — app router 컨텍스트가
// 없는 순수 렌더 테스트에서 "invariant expected app router to be mounted"를
// 피하기 위함이다.
//
// SPEC-B2C-RESULT-001 M6 (design.md §9) — ResultView가 이제
// useSearchParams()도 호출하므로(review 전용 ?devFixture=fracture 게이트)
// 함께 모킹한다. 기본값은 빈 URLSearchParams — enableDevFixture prop을
// 생략하는 아래 기존 테스트들은 devFixture 분기와 무관하게 그대로 통과한다.

const { searchParamsMock } = vi.hoisted(() => ({
  searchParamsMock: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParamsMock.current,
}));

const STORAGE_KEY = "bosang-radar:diagnosis-handoff-v1";

describe("components/result/ResultView — 3갈래 분기(REQ-B2CRESULT-013/014/016)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
    searchParamsMock.current = new URLSearchParams();
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

  it('"empty"(sessionStorage 비어있음) → ResultNoData가 렌더링된다', () => {
    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-no-data"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-view"]')).toBeNull();
  });

  it('"invalid"(구문이 깨진 JSON) → ResultError가 렌더링된다', () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not valid json");

    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-error"]')).not.toBeNull();
  });

  it('"invalid"(스키마 불일치 JSON) → ResultError가 렌더링된다(AC-B2CRESULT-014)', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ resultId: "" }));

    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-error"]')).not.toBeNull();
  });

  it('"valid"(골절 fixture) → ResultView 본문이 렌더링되고 집계 배너·입력 요약을 포함한다', () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, { surgery: "수술 받음" });
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-no-data"]')).toBeNull();
    expect(container.querySelector('[data-testid="result-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="result-aggregate-banner"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-input-summary"]')).not.toBeNull();
    expect(container.textContent).toContain("무릎·아래다리의 골절");
  });

  it('"valid" 상태에서 (matchMedia 미지원 jsdom 기본값) Mobile 탭이 렌더링된다', () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-category-tabs"]')).not.toBeNull();
  });
});

// SPEC-B2C-RESULT-001 M6 (design.md §9, REQ-B2CRESULT-009/012) — review
// 전용 `?devFixture=fracture` 직접 진입 경로. enableDevFixture(=reviewEnabled)
// 와 URL 쿼리 둘 다 갖춰야만 sessionStorage를 건너뛰고 buildFractureResult()
// 고정 데이터로 렌더링한다 — 어느 한쪽이라도 없으면 기존 handoff 분기
// (이 경우 "empty")를 그대로 탄다(defense-in-depth, REQ-B2CRESULT-009와
// 동일한 boolean 게이트 원칙).
describe("components/result/ResultView — devFixture 직접 진입(design.md §9)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
    searchParamsMock.current = new URLSearchParams();
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

  it("enableDevFixture=true + ?devFixture=fracture → sessionStorage 없이도 ResultView 본문이 렌더링된다", () => {
    searchParamsMock.current = new URLSearchParams("devFixture=fracture");

    act(() => {
      root.render(<ResultView enableDevFixture={true} />);
    });

    expect(container.querySelector('[data-testid="result-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-no-data"]')).toBeNull();
    expect(container.textContent).toContain("무릎·아래다리의 골절");
  });

  it("enableDevFixture=false(프로덕션 기본값) + ?devFixture=fracture → 무시하고 empty 분기를 유지한다(defense-in-depth)", () => {
    searchParamsMock.current = new URLSearchParams("devFixture=fracture");

    act(() => {
      root.render(<ResultView enableDevFixture={false} />);
    });

    expect(container.querySelector('[data-testid="result-no-data"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-view"]')).toBeNull();
  });

  it("enableDevFixture=true이지만 ?devFixture= 쿼리가 없으면 기존 handoff 분기(empty)를 유지한다", () => {
    act(() => {
      root.render(<ResultView enableDevFixture={true} />);
    });

    expect(container.querySelector('[data-testid="result-no-data"]')).not.toBeNull();
  });
});

// SPEC-B2C-RESULT-001 M5 (design.md §10, REQ-B2CRESULT-021) —
// prefers-reduced-motion 대응: 탭 전환/우선순위 선택으로 인한 anchor
// scroll이 reduced-motion 환경에서는 behavior: "auto"로, 그 외에는
// behavior: "smooth"로 호출되는지 검증한다. jsdom은 scrollIntoView를
// 구현하지 않으므로 Element.prototype.scrollIntoView를 스텁한다.
describe("components/result/ResultView — prefers-reduced-motion 대응(REQ-B2CRESULT-021, M5)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  function mockMatchMedia({
    desktop,
    reducedMotion,
  }: {
    desktop: boolean;
    reducedMotion: boolean;
  }) {
    window.matchMedia = ((query: string) => {
      const matches = query.includes("prefers-reduced-motion") ? reducedMotion : desktop;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    }) as unknown as typeof window.matchMedia;
  }

  beforeEach(() => {
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock as unknown as Element["scrollIntoView"];
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.sessionStorage.clear();
    // @ts-expect-error — 다음 테스트 파일에 영향을 주지 않도록 원복
    delete window.matchMedia;
  });

  it("reduced-motion이 아니면 Desktop 우선순위 선택 시 scrollIntoView가 behavior: smooth로 호출된다", () => {
    mockMatchMedia({ desktop: true, reducedMotion: false });
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultView />);
    });

    const priorityButton = container.querySelector<HTMLButtonElement>(
      '[data-testid^="result-priority-check-"]'
    );
    act(() => {
      priorityButton?.click();
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" })
    );
  });

  it("reduced-motion이면 Desktop 우선순위 선택 시 scrollIntoView가 behavior: auto로 호출된다", () => {
    mockMatchMedia({ desktop: true, reducedMotion: true });
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultView />);
    });

    const priorityButton = container.querySelector<HTMLButtonElement>(
      '[data-testid^="result-priority-check-"]'
    );
    act(() => {
      priorityButton?.click();
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("reduced-motion이면 Mobile 탭 전환 시에도 scrollIntoView가 behavior: auto로 호출된다", () => {
    mockMatchMedia({ desktop: false, reducedMotion: true });
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultView />);
    });

    const fixedTab = container.querySelector<HTMLButtonElement>('[data-testid="category-tab-fixed"]');
    act(() => {
      fixedTab?.click();
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });
});

// SPEC-B2C-RESULT-001 M5 (design.md §10, REQ-B2CRESULT-021, 진단 M4
// Residual-risk 항목 #3 해소) — Mobile 탭 전환 시 포커스 이동 로직은
// result-view.tsx에 중앙화되어 있어(activeCategory 변경 감지 useEffect),
// result-category-tabs.test.tsx 자체의 단위 테스트만으로는 "탭을
// 키보드로 전환하면 새 패널 제목으로 포커스가 이동한다"는 계약을 완전히
// 검증하지 못한다. 이 통합 테스트는 실제 부모(ResultView)를 "valid,
// mobile" 상태로 렌더링해 그 갭을 닫는다.
describe("components/result/ResultView — 키보드 탭 전환 시 포커스 이동 통합(REQ-B2CRESULT-021, M5)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
    // Mobile 레이아웃(탭 렌더링)을 강제하기 위해 matchMedia가 false를
    // 반환하도록 둔다(jsdom 기본값 — mockMatchMedia 불필요).
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.sessionStorage.clear();
  });

  it("ArrowRight로 탭을 전환하면 새로 활성화된 카테고리 패널의 제목(h2)으로 포커스가 이동한다", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultView />);
    });

    // 기본 활성 탭은 reimbursement(design.md §0, DEFAULT_MOBILE_CATEGORY).
    const activeTab = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-tab-reimbursement"]'
    );
    expect(activeTab).not.toBeNull();

    act(() => {
      activeTab!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })
      );
    });

    // ArrowRight: reimbursement → fixed(CATEGORY_ORDER 순서). 새 탭패널의
    // 제목(coverage-heading-fixed)으로 포커스가 이동해야 한다.
    const newHeading = container.querySelector("#coverage-heading-fixed");
    expect(newHeading).not.toBeNull();
    expect(document.activeElement).toBe(newHeading);
  });

  it("우선순위 카드 선택으로 인한 탭 전환도 동일한 포커스 이동 메커니즘을 탄다(design.md §6)", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultView />);
    });

    // priorityChecks[1]의 targetCategory는 fixture 정의상 "fixed"
    // (fracture-case.ts PRIORITY_CHECKS priority-2).
    const priorityButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="result-priority-check-priority-2"]'
    );
    expect(priorityButton).not.toBeNull();

    act(() => {
      priorityButton?.click();
    });

    const newHeading = container.querySelector("#coverage-heading-fixed");
    expect(document.activeElement).toBe(newHeading);
  });
});
