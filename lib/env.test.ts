import { describe, expect, it } from "vitest";
import { validateEnv } from "./env";

describe("lib/env — validateEnv (AC-RUNTIME-003, AC-RUNTIME-010, AC-RUNTIME-019, AC-RUNTIME-020)", () => {
  describe("AC-RUNTIME-003 — file: 스킴 capability gate (양방향)", () => {
    it("TURSO_DATABASE_URL이 file: 스킴이면 TURSO_AUTH_TOKEN 없이도 통과한다", () => {
      const result = validateEnv("db", {
        TURSO_DATABASE_URL: "file:./.tmp/e2e.db",
      });

      expect(result.TURSO_DATABASE_URL).toBe("file:./.tmp/e2e.db");
      expect(result.TURSO_AUTH_TOKEN).toBeUndefined();
    });

    it("TURSO_DATABASE_URL이 libsql:// 스킴이고 TURSO_AUTH_TOKEN이 없으면 실패한다", () => {
      expect(() =>
        validateEnv("db", {
          TURSO_DATABASE_URL: "libsql://test-db.turso.io",
        })
      ).toThrow();
    });

    it("TURSO_DATABASE_URL이 libsql:// 스킴이고 TURSO_AUTH_TOKEN이 있으면 통과한다", () => {
      const result = validateEnv("db", {
        TURSO_DATABASE_URL: "libsql://test-db.turso.io",
        TURSO_AUTH_TOKEN: "test-token",
      });

      expect(result.TURSO_AUTH_TOKEN).toBe("test-token");
    });
  });

  describe("AC-RUNTIME-010 — 오류 메시지의 시크릿 미노출", () => {
    it("잘못된 형식의 값이 설정되어 있어도 오류 메시지에 실제 값이 부분 문자열로도 포함되지 않는다", () => {
      const secretValue = "sk-super-secret-value-12345";
      try {
        validateEnv("app", {
          TURSO_DATABASE_URL: "file:./.tmp/x.db",
          BETTER_AUTH_SECRET: secretValue,
          // BETTER_AUTH_URL 누락 → 실패 유도
        });
        expect.unreachable("검증이 실패해야 한다");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain(secretValue);
      }
    });

    it("오류 메시지에 스코프 이름이 포함된다", () => {
      try {
        validateEnv("provision", {});
        expect.unreachable("검증이 실패해야 한다");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain("provision");
      }
    });
  });

  describe("AC-RUNTIME-019 — 누락 변수 전량 열거 (첫 번째에서 중단하지 않는다)", () => {
    it("provision 스코프에서 2개 이상 누락되면 전부 열거한다", () => {
      try {
        validateEnv("provision", {});
        expect.unreachable("검증이 실패해야 한다");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain("TURSO_DATABASE_URL");
        expect(message).toContain("BETTER_AUTH_SECRET");
      }
    });
  });

  describe("AC-RUNTIME-020 — 목적별 스코프 좁힘 (양방향, 최소 3+3건)", () => {
    it("(양성 1) db 스코프에서 TURSO_DATABASE_URL 누락 시 실패한다", () => {
      expect(() => validateEnv("db", {})).toThrow();
    });

    it("(양성 2) provision 스코프에서 BETTER_AUTH_SECRET 누락 시 실패한다", () => {
      expect(() =>
        validateEnv("provision", {
          TURSO_DATABASE_URL: "file:./.tmp/x.db",
        })
      ).toThrow();
    });

    it("(양성 3) app 스코프에서 BETTER_AUTH_URL 누락 시 실패한다", () => {
      expect(() =>
        validateEnv("app", {
          TURSO_DATABASE_URL: "file:./.tmp/x.db",
          BETTER_AUTH_SECRET: "secret",
        })
      ).toThrow();
    });

    it("(음성 1) db 스코프는 BETTER_AUTH_SECRET·BETTER_AUTH_URL이 모두 없어도 통과한다", () => {
      const result = validateEnv("db", {
        TURSO_DATABASE_URL: "file:./.tmp/x.db",
      });

      expect(result.TURSO_DATABASE_URL).toBe("file:./.tmp/x.db");
    });

    it("(음성 2) app 스코프는 LLM_PROVIDER_MODE=deterministic이면 GEMINI_API_KEY가 없어도 통과한다 (AC-RESEARCH-011b, REQ-RESEARCH-012 면제 경로)", () => {
      const result = validateEnv("app", {
        TURSO_DATABASE_URL: "file:./.tmp/x.db",
        BETTER_AUTH_SECRET: "secret",
        BETTER_AUTH_URL: "http://localhost:3000",
        LLM_PROVIDER_MODE: "deterministic",
      });

      expect(result.scope).toBe("app");
    });

    // AC-RESEARCH-011a (REQ-RESEARCH-012, 필수 경로): LLM_PROVIDER_MODE가 없고
    // GEMINI_API_KEY도 없으면 app 스코프는 반드시 실패해야 한다.
    it("(음성 2-보완) app 스코프는 LLM_PROVIDER_MODE=deterministic이 없으면 GEMINI_API_KEY가 필수다", () => {
      expect(() =>
        validateEnv("app", {
          TURSO_DATABASE_URL: "file:./.tmp/x.db",
          BETTER_AUTH_SECRET: "secret",
          BETTER_AUTH_URL: "http://localhost:3000",
        })
      ).toThrow();
    });

    it("(음성 3) provision 스코프는 BETTER_AUTH_URL이 없어도 통과한다", () => {
      const result = validateEnv("provision", {
        TURSO_DATABASE_URL: "file:./.tmp/x.db",
        BETTER_AUTH_SECRET: "secret",
      });

      expect(result.scope).toBe("provision");
    });
  });

  describe("e2e 스코프", () => {
    it("TESTER_PASSWORD 누락 시 실패한다", () => {
      expect(() =>
        validateEnv("e2e", {
          TURSO_DATABASE_URL: "file:./.tmp/e2e.db",
          BETTER_AUTH_SECRET: "secret",
          BETTER_AUTH_URL: "http://localhost:3000",
        })
      ).toThrow();
    });

    it("모든 필수 변수가 있으면 통과한다", () => {
      const result = validateEnv("e2e", {
        TURSO_DATABASE_URL: "file:./.tmp/e2e.db",
        BETTER_AUTH_SECRET: "secret",
        BETTER_AUTH_URL: "http://localhost:3000",
        TESTER_PASSWORD: "password123",
      });

      expect(result.scope).toBe("e2e");
    });
  });
});
