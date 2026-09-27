// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConsultView } from "./consult-view";

// SPEC-B2C-CONSULT-001 M3 — ConsultView는 이 milestone에서는 최소
// placeholder다(M4가 내부를 완전히 교체한다). 이 테스트는 (1) 정직한
// "준비 중" 문구를 렌더링하는지, (2) readDiagnosisHandoff() 배선이 예외
// 없이 이 컴포넌트까지 닿는지(handoff 부재/존재 두 경우 모두)만 검증한다.

const STORAGE_KEY = "bosang-radar:diagnosis-handoff-v1";

describe("ConsultView — M3 placeholder", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
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

  it("정직한 준비 중 문구를 렌더링한다(handoff 부재)", () => {
    act(() => {
      root.render(<ConsultView />);
    });

    expect(container.querySelector('[data-testid="consult-view"]')).not.toBeNull();
    expect(container.textContent).toContain("상담 신청 폼을 준비하고 있어요");
  });

  it("handoff가 손상된 JSON이어도 예외 없이 렌더링한다(readDiagnosisHandoff 배선 확인)", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not valid json");

    expect(() => {
      act(() => {
        root.render(<ConsultView />);
      });
    }).not.toThrow();

    expect(container.querySelector('[data-testid="consult-view"]')).not.toBeNull();
  });
});
