// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ConsultPage, { generateMetadata } from "./page";

// SPEC-B2C-CONSULT-001 M3 (design.md §4, REQ-B2CCONSULT-005) —
// app/consult/page.tsx는 app/result/page.tsx와 동일한 관례(react-dom/client
// 직접 렌더링, ENV 스냅샷/복원)를 따르는 순수 Server Component 게이트다.
// computeConsultFlags(process.env).shouldRenderConsult 하나로만 게이트하며,
// CONSULT_POLICY_READY나 02의 shouldRenderDiagnosis는 이 게이트에 관여하지
// 않는다(REQ-B2CCONSULT-005).

const ENV_KEYS = ["ENABLE_CONSULT_FLOW", "CONSULT_POLICY_READY"] as const;

describe("app/consult/page — shouldRenderConsult 게이트(REQ-B2CCONSULT-005)", () => {
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

  it("ENABLE_CONSULT_FLOW가 꺼져 있으면 01/02와 동일한 placeholder 문구를 표시한다", () => {
    act(() => {
      root.render(<ConsultPage />);
    });

    expect(container.textContent).toContain("서비스 준비 중입니다");
    expect(container.querySelector('[data-testid="consult-view"]')).toBeNull();
  });

  it("ENABLE_CONSULT_FLOW가 true이면 <ConsultView/>를 렌더링한다(CONSULT_POLICY_READY와 무관)", () => {
    process.env.ENABLE_CONSULT_FLOW = "true";

    act(() => {
      root.render(<ConsultPage />);
    });

    expect(container.textContent).not.toContain("서비스 준비 중입니다");
  });

  it("CONSULT_POLICY_READY만 true이면(ENABLE_CONSULT_FLOW 미설정) 여전히 placeholder를 표시한다", () => {
    process.env.CONSULT_POLICY_READY = "true";

    act(() => {
      root.render(<ConsultPage />);
    });

    expect(container.textContent).toContain("서비스 준비 중입니다");
  });

  it("게이트가 거짓이면 generateMetadata()의 title은 '서비스 준비 중'이다", async () => {
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("서비스 준비 중");
  });

  it("게이트가 참이면 generateMetadata()의 title이 상담 신청 화면 제목으로 바뀐다", async () => {
    process.env.ENABLE_CONSULT_FLOW = "true";

    const metadata = await generateMetadata();
    expect(metadata.title).not.toBe("서비스 준비 중");
  });
});
