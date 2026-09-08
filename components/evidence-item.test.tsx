// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { EvidenceItem } from "./evidence-item";

// SPEC-UI-MIGRATION-001 M3 (REQ-007/008) — EvidenceItem이 렌더링하는
// evidenceType/issueTypes Chip이 영문 raw 값이 아닌 한글 라벨을 표시한다.

describe("components/evidence-item — 한글 라벨 표시", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("AC-007/AC-008: evidenceType/issueTypes가 한글 라벨로 렌더링된다", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <ul>
          <EvidenceItem
            title="판례 A"
            sourceUrl={null}
            evidenceType="PRECEDENT"
            issueTypes={["DISABILITY_GRADE_CRITERIA"]}
          />
        </ul>
      );
    });

    expect(container.textContent).toContain("판례");
    expect(container.textContent).toContain("장해 평가 기준");
    expect(container.textContent).not.toContain("PRECEDENT");
    expect(container.textContent).not.toContain("DISABILITY_GRADE_CRITERIA");
  });
});
