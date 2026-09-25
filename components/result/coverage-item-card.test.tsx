// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CoverageItemCard } from "./coverage-item-card";
import type { CoverageItem } from "@/lib/diagnosis/types";

// SPEC-B2C-RESULT-001 M4 (design.md §1/§7, REQ-B2CRESULT-005/006/020) —
// 3톤 상태 pill이 모두 텍스트 라벨을 함께 표기하는지(색상 단독 전달 금지),
// benefit.label/displayText가 그대로 렌더링되는지 검증한다.

function buildItem(overrides: Partial<CoverageItem> & Pick<CoverageItem, "status">): CoverageItem {
  const base = {
    id: "item-1",
    category: "fixed" as const,
    name: "테스트 담보",
    description: "테스트 설명",
    whyCheck: "테스트 이유",
    badges: [],
    benefit: {
      kind: "range" as const,
      label: "일반적인 가입금액 예시",
      min: 100000,
      max: 200000,
      displayText: "10만~20만원",
    },
    factChips: [],
  };
  if (overrides.status === "low-likelihood") {
    return {
      ...base,
      ...overrides,
      status: "low-likelihood",
      reasonNote: overrides.reasonNote ?? "가능성이 낮은 사유",
    } as CoverageItem;
  }
  return { ...base, ...overrides } as CoverageItem;
}

describe("components/result/CoverageItemCard — 3톤 상태(REQ-B2CRESULT-005/020)", () => {
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

  it.each([
    { status: "review" as const, label: "검토 대상" },
    { status: "needs-info" as const, label: "추가 정보 필요" },
    { status: "low-likelihood" as const, label: "가능성 낮음" },
  ])("$status 상태는 텍스트 라벨 '$label'을 포함한다(색상 단독 전달 금지)", ({ status, label }) => {
    act(() => {
      root.render(<CoverageItemCard item={buildItem({ status })} />);
    });

    const pill = container.querySelector('[data-testid="coverage-status-pill"]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe(label);
  });

  it("low-likelihood 상태는 reasonNote를 노출한다(REQ-B2CRESULT-005)", () => {
    act(() => {
      root.render(
        <CoverageItemCard
          item={buildItem({ status: "low-likelihood", reasonNote: "특정 사유입니다" })}
        />
      );
    });

    expect(container.querySelector('[data-testid="coverage-reason-note"]')?.textContent).toBe(
      "특정 사유입니다"
    );
  });

  it("review/needs-info 상태는 reasonNote를 렌더링하지 않는다", () => {
    act(() => {
      root.render(<CoverageItemCard item={buildItem({ status: "review" })} />);
    });

    expect(container.querySelector('[data-testid="coverage-reason-note"]')).toBeNull();
  });

  it("benefit.label/displayText를 그대로 렌더링한다(REQ-B2CRESULT-006, 산술 연산 없음)", () => {
    act(() => {
      root.render(<CoverageItemCard item={buildItem({ status: "review" })} />);
    });

    expect(container.querySelector('[data-testid="coverage-benefit-text"]')?.textContent).toBe(
      "10만~20만원"
    );
    expect(container.textContent).toContain("일반적인 가입금액 예시");
  });

  it("badges: CoverageBadge[]를 렌더링한다(REQ-B2CRESULT-001/005)", () => {
    act(() => {
      root.render(
        <CoverageItemCard
          item={buildItem({
            status: "review",
            badges: [{ id: "badge-1", label: "보험증권 확인 필요", kind: "policy-type-check" }],
          })}
        />
      );
    });

    expect(container.querySelector('[data-testid="coverage-badge"]')?.textContent).toBe(
      "보험증권 확인 필요"
    );
  });

  it("factChips: FactChip[]를 렌더링한다(REQ-B2CRESULT-007/008)", () => {
    act(() => {
      root.render(
        <CoverageItemCard
          item={buildItem({
            status: "review",
            factChips: [{ questionId: "surgery-status", label: "수술 여부", value: "수술 받음" }],
          })}
        />
      );
    });

    expect(container.querySelector('[data-testid="coverage-fact-chips"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="coverage-fact-chips"]')?.textContent).toContain(
      "수술 받음"
    );
  });

  it("factChips가 비어 있으면 fact chips 영역을 렌더링하지 않는다", () => {
    act(() => {
      root.render(<CoverageItemCard item={buildItem({ status: "review" })} />);
    });

    expect(container.querySelector('[data-testid="coverage-fact-chips"]')).toBeNull();
  });

  it("additionalInfoNote가 있으면 안내 문구를 렌더링한다(needs-info)", () => {
    act(() => {
      root.render(
        <CoverageItemCard
          item={buildItem({
            status: "needs-info",
            additionalInfoNote: "증권 확인 필요 안내",
          })}
        />
      );
    });

    expect(container.querySelector('[data-testid="coverage-additional-info"]')?.textContent).toBe(
      "증권 확인 필요 안내"
    );
  });

  it("additionalInfoNote가 없으면 안내 문구를 렌더링하지 않는다", () => {
    act(() => {
      root.render(<CoverageItemCard item={buildItem({ status: "review" })} />);
    });

    expect(container.querySelector('[data-testid="coverage-additional-info"]')).toBeNull();
  });

  it("whyCheck/evidenceRefs/requiredDocuments가 전부 없으면 disclosure 자체를 렌더링하지 않는다", () => {
    act(() => {
      root.render(<CoverageItemCard item={buildItem({ status: "review", whyCheck: "" })} />);
    });

    expect(container.querySelector("details")).toBeNull();
  });

  it("evidenceRefs가 있으면 disclosure 안에 근거 목록을 렌더링한다", () => {
    act(() => {
      root.render(
        <CoverageItemCard
          item={buildItem({
            status: "review",
            whyCheck: "",
            evidenceRefs: ["사고 경위서", "진단서"],
          })}
        />
      );
    });

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain("사고 경위서");
    expect(details?.textContent).toContain("진단서");
  });

  it("requiredDocuments가 있으면 disclosure 안에 필요 서류 목록을 렌더링한다", () => {
    act(() => {
      root.render(
        <CoverageItemCard
          item={buildItem({
            status: "review",
            whyCheck: "",
            requiredDocuments: ["신분증 사본", "보험금 청구서"],
          })}
        />
      );
    });

    const details = container.querySelector("details");
    expect(details?.textContent).toContain("필요 서류");
    expect(details?.textContent).toContain("신분증 사본");
    expect(details?.textContent).toContain("보험금 청구서");
  });
});
