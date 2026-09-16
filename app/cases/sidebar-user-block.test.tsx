// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarUserBlock } from "./sidebar-user-block";

// SPEC-UI-MIGRATION-001 M2 (REQ-005) — 사이드바 하단 사용자 블록. 클라이언트
// 컴포넌트로 분리해 Better Auth 클라이언트 세션 훅(authClient.useSession())만
// 사용한다(app/cases/layout.tsx는 이 파일을 렌더링만 하며 세션을 직접
// 조회하지 않는다 — AC-005a는 별도의 소스 grep으로 검증한다).

const { useSessionMock, signOutMock, pushMock, refreshMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: useSessionMock, signOut: signOutMock },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<SidebarUserBlock />);
  });
  return { container, root };
}

describe("app/cases/sidebar-user-block — 실사용자명 + 로딩/미로그인 폴백", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("AC-005: 세션이 있으면 하드코딩 문자열이 아닌 user.name을 표시한다", () => {
    useSessionMock.mockReturnValue({
      data: { user: { name: "홍길동", id: "user-1" } },
      isPending: false,
    });
    ({ container, root } = render());

    expect(container.textContent).toContain("홍길동");
    expect(container.textContent).not.toContain("담당 손해사정사");
    expect(container.textContent).not.toContain("BORA 리서치");
  });

  it("AC-005b: 세션이 로딩 중이면 중립 폴백을 표시하고 크래시하지 않는다", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true });
    ({ container, root } = render());

    expect(container.textContent).toContain("사용자");
    expect(container.textContent).not.toContain("담당 손해사정사");
  });

  it("AC-005b: 세션이 없으면(로그아웃) 중립 폴백을 표시하고 크래시하지 않는다", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    ({ container, root } = render());

    expect(container.textContent).toContain("사용자");
  });

  it("로그아웃 버튼 클릭 시 authClient.signOut을 호출하고 성공하면 /login으로 이동한다", async () => {
    useSessionMock.mockReturnValue({
      data: { user: { name: "홍길동", id: "user-1" } },
      isPending: false,
    });
    signOutMock.mockImplementation(async ({ fetchOptions }) => {
      fetchOptions.onSuccess();
    });
    ({ container, root } = render());

    const button = container.querySelector('[data-testid="sidebar-logout"]') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/login");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
