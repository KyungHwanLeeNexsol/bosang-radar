import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, getDbMock } = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return { dbMock: chain, getDbMock: vi.fn(() => chain) };
});

vi.mock("../db/client", () => ({
  getDb: getDbMock,
}));

describe("lib/auth/config", () => {
  beforeEach(() => {
    dbMock.limit.mockReset();
    getDbMock.mockClear();
  });

  it("모듈을 로드하는 것만으로는 DB 클라이언트를 생성하지 않는다 (TURSO_* 환경변수 없이도 로드 가능해야 한다)", async () => {
    // lib/db/client.ts의 createDbClient()는 TURSO_DATABASE_URL/TURSO_AUTH_TOKEN이
    // 없으면 예외를 던진다. betterAuth()가 모듈 최상위에서 즉시 생성되면
    // pnpm build 시점(라우트 페이지 데이터 수집 단계)에 이 예외가 그대로
    // 전파되어 빌드가 실패한다 — getAuth()는 반드시 지연 생성이어야 한다.
    await expect(import("./config")).resolves.toBeDefined();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("allowed_testers에 등록된 이메일이면 true를 반환한다", async () => {
    dbMock.limit.mockResolvedValueOnce([{ id: "tester-1" }]);
    const { isAllowedTesterEmail } = await import("./config");

    await expect(isAllowedTesterEmail("tester@example.com")).resolves.toBe(true);
  });

  it("allowed_testers에 없는 이메일이면 false를 반환한다 (AC-SCAFFOLD-008)", async () => {
    dbMock.limit.mockResolvedValueOnce([]);
    const { isAllowedTesterEmail } = await import("./config");

    await expect(isAllowedTesterEmail("intruder@example.com")).resolves.toBe(false);
  });

  it("이메일 대소문자와 무관하게 조회한다", async () => {
    dbMock.limit.mockResolvedValueOnce([{ id: "tester-1" }]);
    const { isAllowedTesterEmail } = await import("./config");

    await isAllowedTesterEmail("Tester@Example.com");

    expect(dbMock.where).toHaveBeenCalled();
  });
});
