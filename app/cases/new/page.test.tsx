// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SPEC-UI-MIGRATION-001 M6 (REQ-012/013) — NewCasePage는 이제 async Server
// Component다(REQ-013의 서버측 세션 확인 도입). app/cases/[caseId]/page.test.tsx와
// 동일한 패턴으로 함수를 직접 호출해 렌더링한다.

const { getCurrentSessionMock, getRecentCasesForOwnerMock, redirectMock, pushMock } = vi.hoisted(
  () => ({
    getCurrentSessionMock: vi.fn(),
    getRecentCasesForOwnerMock: vi.fn(),
    redirectMock: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    pushMock: vi.fn(),
  })
);

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/lib/cases/get-recent-cases-for-owner", () => ({
  getRecentCasesForOwner: getRecentCasesForOwnerMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ push: pushMock }),
}));

async function renderPage(container: HTMLDivElement, root: Root) {
  const { default: NewCasePage } = await import("./page");
  const element = await NewCasePage();
  await act(async () => {
    root.render(element);
  });
  return container;
}

describe("app/cases/new/page — 분석 상태 + 최근 리서치 우 레일", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetModules();
    getCurrentSessionMock.mockReset();
    getRecentCasesForOwnerMock.mockReset();
    redirectMock.mockClear();
    getCurrentSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getRecentCasesForOwnerMock.mockResolvedValue([]);
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

  it("AC-013d: 인증된 세션이 없으면 /login으로 리다이렉트한다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const { default: NewCasePage } = await import("./page");

    await expect(NewCasePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("AC-012: '분석 상태' 패널에 4단계 정적 텍스트가 존재하고 단계별 완료 표시가 없다", async () => {
    await renderPage(container, root);

    for (const stage of [
      "쟁점 자동 추출",
      "판례·결정례 검색",
      "약관·법령 대조",
      "근거 검증 및 반대 논리 생성",
    ]) {
      expect(container.textContent).toContain(stage);
    }
    // 가짜 진행률 금지 — 체크마크/진행률 바 등 단계별 동적 UI 요소가 없어야
    // 한다(progressbar role, 체크 아이콘 클래스 부재로 검증).
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("AC-013: '최근 리서치' 패널이 owner의 최근 사건을 최대 3건 표시한다", async () => {
    getRecentCasesForOwnerMock.mockResolvedValue([
      { id: "case-1", title: "발목 인대 파열", subtitle: "발목", status: "completed" },
      { id: "case-2", title: "손목 골절", subtitle: "손목", status: "completed" },
    ]);

    await renderPage(container, root);

    expect(getRecentCasesForOwnerMock).toHaveBeenCalledWith("user-1");
    const panel = container.querySelector('[data-testid="case-recent-research"]')!;
    const items = panel.querySelectorAll('[data-testid="case-recent-research-item"]');
    expect(items).toHaveLength(2);
    expect(panel.textContent).toContain("발목 인대 파열");
    expect(panel.textContent).toContain("손목 골절");
  });

  it("AC-013e: 최근 리서치 조회가 실패해도 패널만 안전한 상태로 대체되고 폼은 정상 렌더링된다", async () => {
    getRecentCasesForOwnerMock.mockRejectedValue(new Error("db down"));

    await renderPage(container, root);

    const panel = container.querySelector('[data-testid="case-recent-research"]');
    expect(panel).not.toBeNull();
    expect(panel?.querySelectorAll('[data-testid="case-recent-research-item"]')).toHaveLength(0);
    // 좌측 폼 컬럼은 정상 렌더링(크래시 없음).
    expect(container.querySelector('[data-testid="case-input-form"]')).not.toBeNull();
  });

  it("빈 결과(0건 소유)이면 예외 없이 빈 상태를 렌더링한다", async () => {
    getRecentCasesForOwnerMock.mockResolvedValue([]);

    await renderPage(container, root);

    const panel = container.querySelector('[data-testid="case-recent-research"]');
    expect(panel).not.toBeNull();
    expect(panel?.querySelectorAll('[data-testid="case-recent-research-item"]')).toHaveLength(0);
  });

  describe("개인정보 비식별 안내 정직성 개선 (SPEC-PILOT-READY-001 M3, REQ-PILOT-READY-011/012/014)", () => {
    it("구조적 사실(형식 검사 + 원본 필드 부재)과 잔여 위험(자유 텍스트 탐지 불가)을 구분해 명시한다", async () => {
      await renderPage(container, root);

      const noticeText = container.textContent ?? "";
      // 구조적 사실: 형식 검사 대상 + 애초에 없는 원본 필드.
      expect(noticeText).toContain("주민등록번호");
      expect(noticeText).toContain("휴대전화번호");
      expect(noticeText).toContain("주소");
      expect(noticeText).toContain("의료기록 원본");
      // 잔여 위험: 자유 텍스트 필드에 타이핑해 넣는 것은 탐지·차단되지 않음.
      expect(noticeText).toContain("탐지");
    });

    it("테스터 책임 문장('합성이거나 이미 비식별화된 사례만 입력')을 포함한다", async () => {
      await renderPage(container, root);

      expect(container.textContent).toContain("합성");
      expect(container.textContent).toContain("비식별화된 사례만");
    });

    it("과대 주장 표현('보장', '확실히 차단')을 사용하지 않는다", async () => {
      await renderPage(container, root);

      const noticeText = container.textContent ?? "";
      expect(noticeText).not.toContain("보장");
      expect(noticeText).not.toContain("확실히 차단");
    });

    it("올바르게 비식별화된 synthetic 사건 입력 예시를 포함한다 (REQ-PILOT-READY-014)", async () => {
      await renderPage(container, root);

      expect(container.textContent).toContain("좌측 발목 관절 인대 파열");
    });
  });
});
