// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ResultPage from "./page";

// SPEC-B2C-RESULT-001 M3 (REQ-B2CRESULT-012/015) — app/result/page.tsx는
// app/page.tsx와 동일한 computeDiagnosisFlags 헬퍼로 게이트를 계산하고,
// Next.js 전용 클라이언트 훅(useSearchParams 등) 없이 process.env만 읽는
// 순수한 Server Component다. 이 프로젝트에는 아직 Server Component 전용
// 테스트 컨벤션이 없다(Gap) — app/page.test.tsx가 이미 쓰고 있는
// react-dom/client 직접 렌더링 패턴을, async 데이터 페칭이 없는 이
// Server Component에도 그대로 재사용한다.

const ENV_KEYS = [
  "ENABLE_DIAGNOSIS_FLOW",
  "DIAGNOSIS_ENGINE_READY",
  "ENABLE_DIAGNOSIS_DEV_STATES",
] as const;

describe("app/result/page — 게이트 기반 라우트 셸(REQ-B2CRESULT-012/015)", () => {
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

  it("게이트가 거짓이면 app/page.tsx와 동일한 placeholder 문구를 표시한다", () => {
    act(() => {
      root.render(<ResultPage />);
    });

    expect(container.textContent).toContain("서비스 준비 중입니다");
    expect(container.querySelector('[data-testid="result-view-placeholder"]')).toBeNull();
  });

  it("ENABLE_DIAGNOSIS_FLOW/DIAGNOSIS_ENGINE_READY가 모두 true이면 ResultView를 렌더링한다(productionReady)", () => {
    process.env.ENABLE_DIAGNOSIS_FLOW = "true";
    process.env.DIAGNOSIS_ENGINE_READY = "true";

    act(() => {
      root.render(<ResultPage />);
    });

    expect(container.querySelector('[data-testid="result-view-placeholder"]')).not.toBeNull();
    expect(container.textContent).not.toContain("서비스 준비 중입니다");
  });

  it("하나만 true이면(productionReady 미충족) 여전히 placeholder를 표시한다", () => {
    process.env.ENABLE_DIAGNOSIS_FLOW = "true";

    act(() => {
      root.render(<ResultPage />);
    });

    expect(container.textContent).toContain("서비스 준비 중입니다");
  });

  it("ENABLE_DIAGNOSIS_DEV_STATES가 true이면 ResultView를 렌더링한다(reviewEnabled)", () => {
    process.env.ENABLE_DIAGNOSIS_DEV_STATES = "true";

    act(() => {
      root.render(<ResultPage />);
    });

    expect(container.querySelector('[data-testid="result-view-placeholder"]')).not.toBeNull();
  });
});
