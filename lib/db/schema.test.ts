import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import * as schema from "./schema";

describe("lib/db/schema", () => {
  it("REQ-SCAFFOLD-003이 요구하는 5개 애플리케이션 테이블의 SQL 이름이 일치한다", () => {
    expect(getTableName(schema.cases)).toBe("cases");
    expect(getTableName(schema.evidence)).toBe("evidence");
    expect(getTableName(schema.reports)).toBe("reports");
    expect(getTableName(schema.feedback)).toBe("feedback");
    expect(getTableName(schema.allowedTesters)).toBe("allowed_testers");
  });

  it("cases 테이블은 owner_user_id 컬럼을 포함한다 (AC-SCAFFOLD-002)", () => {
    expect(schema.cases.ownerUserId).toBeDefined();
  });

  it("Better Auth Drizzle 어댑터가 요구하는 4개 핵심 테이블을 정의한다 (plan.md §E)", () => {
    expect(getTableName(schema.user)).toBe("user");
    expect(getTableName(schema.session)).toBe("session");
    expect(getTableName(schema.account)).toBe("account");
    expect(getTableName(schema.verification)).toBe("verification");
  });

  it("session/account 테이블은 user 테이블을 참조하는 userId 컬럼을 가진다", () => {
    expect(schema.session.userId).toBeDefined();
    expect(schema.account.userId).toBeDefined();
  });

  it("account 테이블은 Better Auth 1.7.1 Drizzle 어댑터가 요구하는 issuer 컬럼을 가진다 (plan.md §E, M2 발견)", () => {
    // Better Auth 1.7.1의 accountSchema는 issuer: z.string()을 필수(nullish 아님) 필드로
    // 요구한다 — M1의 스키마 초안에는 없었던 항목으로, M2에서 Better Auth Drizzle 어댑터
    // 요구사항을 검증하는 과정에서 발견됐다(plan.md §E "Better Auth Drizzle 어댑터
    // 스키마 요구사항" 위험이 실제로 발생한 사례).
    expect(schema.account.issuer).toBeDefined();
  });
});
