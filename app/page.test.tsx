// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

// SPEC-B2C-FOUNDATION-001 M2 — app/page.tsx는 더 이상 로그인 세션에 따른
// 리다이렉트를 수행하지 않는다. B2C 01 화면이 구현되기 전까지 사용할
// 최소 정적 placeholder를 렌더링하며, 세션·인증 의존성이 전혀 없다.
// react-dom/client로 직접 렌더링한다(@testing-library/react 미설치 —
// app/cases/new/case-input-form.test.tsx와 동일한 패턴).
//
// SPEC-B2C-DIAGNOSIS-001 M2(design.md §19, acceptance.md AC-B2CDIAG-015/016)
// — app/page.tsx는 세 플래그(ENABLE_DIAGNOSIS_FLOW/DIAGNOSIS_ENGINE_READY/
// ENABLE_DIAGNOSIS_DEV_STATES)를 process.env에서 함수 본문 실행 시점에
// 직접 읽는다(모듈 최상단이 아님) — 즉 React가 컴포넌트를 매 렌더마다
// 재실행하므로, 정적으로 import한 동일 Home 컴포넌트에 대해 테스트마다
// process.env 값만 바꿔도 매 렌더 시점에 새 값이 반영된다. 별도의
// vi.resetModules() + 동적 re-import가 필요 없다(Enforce Simplicity —
// 모듈 캐시를 우회할 필요가 없는 설계).
// DiagnosisFlow는 useSearchParams()(next/navigation)에 의존하므로 이
// 테스트 파일 전체에서 모킹한다 — shouldRenderDiagnosis=false인 기존 두
// 테스트는 DiagnosisFlow 자체가 렌더링되지 않으므로 이 모킹의 영향을
// 받지 않는다.

const { searchParamsMock } = vi.hoisted(() => ({
  searchParamsMock: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const ENV_KEYS = [
  "ENABLE_DIAGNOSIS_FLOW",
  "DIAGNOSIS_ENGINE_READY",
  "ENABLE_DIAGNOSIS_DEV_STATES",
] as const;

function setDiagnosisEnv(flow?: "true", engine?: "true", devStates?: "true") {
  if (flow) {
    process.env.ENABLE_DIAGNOSIS_FLOW = flow;
  }
  if (engine) {
    process.env.DIAGNOSIS_ENGINE_READY = engine;
  }
  if (devStates) {
    process.env.ENABLE_DIAGNOSIS_DEV_STATES = devStates;
  }
}

describe("app/page — 최소 B2C 공개 진입점 placeholder", () => {
  let container: HTMLDivElement;
  let root: Root;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
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
    process.env = { ...ORIGINAL_ENV };
  });

  it("크래시 없이 렌더링되고 준비 중 안내 문구를 표시한다", () => {
    act(() => {
      root.render(<Home />);
    });

    expect(container.textContent).toContain("서비스 준비 중입니다");
  });

  it("이름·연락처 등 PII 입력 필드를 포함하지 않는다", () => {
    act(() => {
      root.render(<Home />);
    });

    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("app/page — 플래그 기반 shouldRenderDiagnosis 5행 동작 행렬 (AC-B2CDIAG-016)", () => {
  let container: HTMLDivElement;
  let root: Root;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
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
    process.env = { ...ORIGINAL_ENV };
  });

  it.each([
    { flow: undefined, engine: undefined, devStates: undefined, expected: false, label: "false/false/false → placeholder" },
    { flow: "true" as const, engine: undefined, devStates: undefined, expected: false, label: "true/false/false → placeholder" },
    { flow: undefined, engine: "true" as const, devStates: undefined, expected: false, label: "false/true/false → placeholder" },
    { flow: "true" as const, engine: "true" as const, devStates: undefined, expected: true, label: "true/true/false → productionReady DiagnosisFlow" },
    { flow: undefined, engine: undefined, devStates: "true" as const, expected: true, label: "false/false/true → reviewEnabled DiagnosisFlow" },
  ])("$label", ({ flow, engine, devStates, expected }) => {
    setDiagnosisEnv(flow, engine, devStates);

    act(() => {
      root.render(<Home />);
    });

    const flowNode = container.querySelector('[data-testid="diagnosis-flow"]');
    if (expected) {
      expect(flowNode).not.toBeNull();
      expect(container.textContent).not.toContain("서비스 준비 중입니다");
    } else {
      expect(flowNode).toBeNull();
      expect(container.textContent).toContain("서비스 준비 중입니다");
    }
  });
});

describe("app/page — devStep 강제 진입 (AC-B2CDIAG-015/016)", () => {
  let container: HTMLDivElement;
  let root: Root;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    process.env = { ...ORIGINAL_ENV };
  });

  it("AC-B2CDIAG-016: ENABLE_DIAGNOSIS_DEV_STATES가 unset(reviewEnabled=false)이면 ?devStep=이 있어도 placeholder를 유지하고 DiagnosisFlow는 렌더링되지 않는다", () => {
    searchParamsMock.current = new URLSearchParams("devStep=error");

    act(() => {
      root.render(<Home />);
    });

    expect(container.querySelector('[data-testid="diagnosis-flow"]')).toBeNull();
    expect(container.textContent).toContain("서비스 준비 중입니다");
  });

  it("AC-B2CDIAG-015: ENABLE_DIAGNOSIS_DEV_STATES=true(reviewEnabled=true)이면 ?devStep=error가 DiagnosisFlow의 enableDevStates prop을 통해 그대로 적용되어 error 단계로 강제 진입한다", () => {
    setDiagnosisEnv(undefined, undefined, "true");
    searchParamsMock.current = new URLSearchParams("devStep=error");

    act(() => {
      root.render(<Home />);
    });

    const flowNode = container.querySelector('[data-testid="diagnosis-flow"]');
    expect(flowNode).not.toBeNull();
    expect(flowNode?.getAttribute("data-step")).toBe("error");
  });
});
