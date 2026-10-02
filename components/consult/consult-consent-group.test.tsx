// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsultConsentGroup } from "./consult-consent-group";

// SPEC-B2C-CONSULT-001 M4 (design.md §7, D5; acceptance AC-B2CCONSULT-012~014)
// — 동의 구조(필수 2 + 선택 1) + "자세히 보기" 상세 뷰. 실제 법무 확정
// 문구는 구현하지 않고(D5), CONSULT_POLICY_READY로 상세 뷰 자체를 게이트한다.

function Harness({
  isPolicyReady = true,
  onPiiCollectionChange,
  onHealthInfoUseChange,
  onMarketingChange,
}: {
  isPolicyReady?: boolean;
  onPiiCollectionChange: (v: boolean) => void;
  onHealthInfoUseChange: (v: boolean) => void;
  onMarketingChange: (v: boolean) => void;
}) {
  const [pii, setPii] = React.useState(false);
  const [health, setHealth] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);
  return (
    <ConsultConsentGroup
      piiCollection={pii}
      healthInfoUse={health}
      marketing={marketing}
      onPiiCollectionChange={(v) => {
        setPii(v);
        onPiiCollectionChange(v);
      }}
      onHealthInfoUseChange={(v) => {
        setHealth(v);
        onHealthInfoUseChange(v);
      }}
      onMarketingChange={(v) => {
        setMarketing(v);
        onMarketingChange(v);
      }}
      isPolicyReady={isPolicyReady}
    />
  );
}

describe("components/consult/ConsultConsentGroup", () => {
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

  it("필수 2개 + 선택 1개, 총 3개의 체크박스가 렌더링된다", () => {
    act(() => {
      root.render(
        <Harness
          onPiiCollectionChange={vi.fn()}
          onHealthInfoUseChange={vi.fn()}
          onMarketingChange={vi.fn()}
        />
      );
    });

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    expect(container.textContent).toContain("상담 신청을 위한 개인정보 수집");
    expect(container.textContent).toContain("건강정보의 상담 이용 동의");
    expect(container.textContent).toContain("마케팅");
  });

  it("개인정보 수집 체크박스를 클릭하면 onPiiCollectionChange(true)가 호출된다", () => {
    const onPiiCollectionChange = vi.fn();
    act(() => {
      root.render(
        <Harness
          onPiiCollectionChange={onPiiCollectionChange}
          onHealthInfoUseChange={vi.fn()}
          onMarketingChange={vi.fn()}
        />
      );
    });

    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    act(() => {
      checkboxes[0].click();
    });

    expect(onPiiCollectionChange).toHaveBeenCalledWith(true);
  });

  it("마케팅(선택) 체크박스는 다른 두 필수 동의 콜백에 영향을 주지 않는다", () => {
    const onPiiCollectionChange = vi.fn();
    const onHealthInfoUseChange = vi.fn();
    const onMarketingChange = vi.fn();
    act(() => {
      root.render(
        <Harness
          onPiiCollectionChange={onPiiCollectionChange}
          onHealthInfoUseChange={onHealthInfoUseChange}
          onMarketingChange={onMarketingChange}
        />
      );
    });

    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    act(() => {
      checkboxes[2].click();
    });

    expect(onMarketingChange).toHaveBeenCalledWith(true);
    expect(onPiiCollectionChange).not.toHaveBeenCalled();
    expect(onHealthInfoUseChange).not.toHaveBeenCalled();
  });

  it("AC-B2CCONSULT-013: '자세히 보기'를 열었다 닫아도 체크박스는 여전히 체크되지 않는다", () => {
    act(() => {
      root.render(
        <Harness
          onPiiCollectionChange={vi.fn()}
          onHealthInfoUseChange={vi.fn()}
          onMarketingChange={vi.fn()}
        />
      );
    });

    const trigger = Array.from(document.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("자세히 보기")
    );
    expect(trigger).toBeDefined();

    act(() => {
      trigger!.click();
    });

    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes[0].checked).toBe(false);
  });

  it("AC-B2CCONSULT-014: 제3자 제공 동의 관련 텍스트가 존재하지 않는다", () => {
    act(() => {
      root.render(
        <Harness
          onPiiCollectionChange={vi.fn()}
          onHealthInfoUseChange={vi.fn()}
          onMarketingChange={vi.fn()}
        />
      );
    });

    expect(container.textContent).not.toContain("제3자");
  });

  it("isPolicyReady=false면 '자세히 보기' 트리거가 렌더링되지 않는다(D5 게이트)", () => {
    act(() => {
      root.render(
        <Harness
          isPolicyReady={false}
          onPiiCollectionChange={vi.fn()}
          onHealthInfoUseChange={vi.fn()}
          onMarketingChange={vi.fn()}
        />
      );
    });

    const trigger = Array.from(document.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("자세히 보기")
    );
    expect(trigger).toBeUndefined();
  });
});
