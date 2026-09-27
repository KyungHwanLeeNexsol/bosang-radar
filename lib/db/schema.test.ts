import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "./schema";
import { consultationRateLimits, consultations } from "./schema";

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

  it("reservations 테이블은 ownerUserId/leaseId/expiresAt 3개 컬럼을 가지며 ownerUserId가 PK(UNIQUE)다 (REQ-PILOT-READY-007, plan.md §A 결정 1)", () => {
    expect(getTableName(schema.reservations)).toBe("reservations");
    expect(schema.reservations.ownerUserId).toBeDefined();
    expect(schema.reservations.ownerUserId.primary).toBe(true);
    expect(schema.reservations.leaseId).toBeDefined();
    expect(schema.reservations.expiresAt).toBeDefined();
  });

  it("Gemini 요청 관측 테이블은 job 연결과 비민감 메타데이터 컬럼을 정의한다", () => {
    expect(getTableName(schema.geminiRequestObservations)).toBe("gemini_request_observations");
    expect(schema.geminiRequestObservations.jobId).toBeDefined();
    expect(schema.geminiRequestObservations.method).toBeDefined();
    expect(schema.geminiRequestObservations.model).toBeDefined();
    expect(schema.geminiRequestObservations.status).toBeDefined();
    expect(schema.geminiRequestObservations.ok).toBeDefined();
    expect(schema.geminiRequestObservations.durationMs).toBeDefined();
    expect(schema.geminiRequestObservations.observedAt).toBeDefined();
  });
});

// SPEC-B2C-CONSULT-001 M2 — AC-B2CCONSULT-019: consultations/consultationRateLimits
// 컬럼 목록을 정적으로 검사한다. DiagnosisResult.items(담보 항목 배열) 또는 그
// 축약형을 저장하는 컬럼이 존재하지 않음을 함께 확인한다.
describe("lib/db/schema — consultations (AC-B2CCONSULT-019)", () => {
  it("요구된 컬럼이 모두 존재한다", () => {
    const columns = Object.keys(getTableColumns(consultations));

    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "resultId",
        "channel",
        "name",
        "contactNormalized",
        "preferredCallTime",
        "consentPiiCollection",
        "consentHealthInfoUse",
        "consentMarketing",
        "consentVersion",
        "requestFingerprint",
        "applicationStatus",
        "idempotencyKey",
        "createdAt",
        "updatedAt",
      ])
    );
  });

  it("DiagnosisResult.items(담보 항목 배열) 또는 그 축약형을 저장하는 컬럼이 존재하지 않는다", () => {
    const columns = Object.keys(getTableColumns(consultations)).map((c) => c.toLowerCase());

    expect(columns).not.toEqual(expect.arrayContaining(["items"]));
    expect(columns.some((c) => c.includes("item") || c.includes("coverage"))).toBe(false);
  });

  it("테이블명이 consultations다", () => {
    expect(getTableName(consultations)).toBe("consultations");
  });
});

describe("lib/db/schema — consultationRateLimits (AC-B2CCONSULT-019 추가 시나리오)", () => {
  it("windowStart/ipHmac/requestCount만 존재한다", () => {
    const columns = Object.keys(getTableColumns(consultationRateLimits)).sort();

    expect(columns).toEqual(["ipHmac", "requestCount", "windowStart"].sort());
  });

  it("원본 IP 문자열을 평문으로 저장하는 컬럼이 존재하지 않는다", () => {
    const columns = Object.keys(getTableColumns(consultationRateLimits)).map((c) => c.toLowerCase());

    expect(columns.some((c) => c === "ip" || c.includes("rawip") || c.includes("ipaddress"))).toBe(
      false
    );
  });

  it("테이블명이 consultation_rate_limits다", () => {
    expect(getTableName(consultationRateLimits)).toBe("consultation_rate_limits");
  });
});
