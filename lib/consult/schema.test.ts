import { describe, expect, it } from "vitest";
import { ConsultationDraftSchema, ConsultationRequestSchema } from "./schema";
import { CONSULTATION_DRAFT_VERSION } from "./types";

// SPEC-B2C-CONSULT-001 M1 — 상담 데이터 계약 zod 스키마 단위 테스트
// (design.md §6, §2.3, REQ-B2CCONSULT-016).

function baseRequest() {
  return {
    resultId: "result-1",
    channel: "kakao" as const,
    name: "홍길동",
    contact: "010-0000-0000",
    consent: { piiCollection: true as const, healthInfoUse: true as const, marketing: false },
    acknowledgedConsentVersion: "2026-09-25-v1",
    idempotencyKey: "idem-1",
  };
}

describe("ConsultationRequestSchema — REQ-B2CCONSULT-016", () => {
  it("유효한 카카오톡 채널 페이로드를 통과시킨다", () => {
    const result = ConsultationRequestSchema.safeParse(baseRequest());
    expect(result.success).toBe(true);
  });

  it("channel이 phone이면 preferredCallTime 없이는 거부한다", () => {
    const result = ConsultationRequestSchema.safeParse({ ...baseRequest(), channel: "phone" });
    expect(result.success).toBe(false);
  });

  it("channel이 phone이고 preferredCallTime이 있으면 통과한다", () => {
    const result = ConsultationRequestSchema.safeParse({
      ...baseRequest(),
      channel: "phone",
      preferredCallTime: "오전 10시",
    });
    expect(result.success).toBe(true);
  });

  it("알 수 없는 키가 있으면 거부한다(strictObject)", () => {
    const result = ConsultationRequestSchema.safeParse({ ...baseRequest(), unknownField: "x" });
    expect(result.success).toBe(false);
  });

  it("필수 동의가 false이면 거부한다", () => {
    const result = ConsultationRequestSchema.safeParse({
      ...baseRequest(),
      consent: { piiCollection: false, healthInfoUse: true, marketing: false },
    });
    expect(result.success).toBe(false);
  });

  it("연락처가 정규화 실패 형식이면 거부한다(AC-B2CCONSULT-011)", () => {
    const result = ConsultationRequestSchema.safeParse({ ...baseRequest(), contact: "12345" });
    expect(result.success).toBe(false);
  });

  it("resultId가 빈 문자열이면 거부한다", () => {
    const result = ConsultationRequestSchema.safeParse({ ...baseRequest(), resultId: "" });
    expect(result.success).toBe(false);
  });
});

describe("ConsultationDraftSchema — design.md §2.3", () => {
  it("draftVersion만 있는 최소 draft를 통과시킨다", () => {
    const result = ConsultationDraftSchema.safeParse({ draftVersion: CONSULTATION_DRAFT_VERSION });
    expect(result.success).toBe(true);
  });

  it("모든 optional 필드가 채워진 draft를 통과시킨다", () => {
    const result = ConsultationDraftSchema.safeParse({
      draftVersion: CONSULTATION_DRAFT_VERSION,
      channel: "phone",
      name: "홍길동",
      contactRaw: "010-0000-0000",
      preferredCallTime: "오전 10시",
      marketingConsent: true,
      idempotencyKey: "idem-1",
    });
    expect(result.success).toBe(true);
  });

  it("draftVersion이 없으면 거부한다", () => {
    const result = ConsultationDraftSchema.safeParse({ name: "홍길동" });
    expect(result.success).toBe(false);
  });

  it("draftVersion이 현재 버전과 다르면 거부한다", () => {
    const result = ConsultationDraftSchema.safeParse({ draftVersion: 999 });
    expect(result.success).toBe(false);
  });

  it("알 수 없는 키가 있으면 거부한다(strictObject)", () => {
    const result = ConsultationDraftSchema.safeParse({
      draftVersion: CONSULTATION_DRAFT_VERSION,
      unknownField: "x",
    });
    expect(result.success).toBe(false);
  });

  it("필수 동의 체크 상태 필드는 스키마에 존재하지 않는다(동의 재확인 원칙)", () => {
    const result = ConsultationDraftSchema.safeParse({
      draftVersion: CONSULTATION_DRAFT_VERSION,
      piiCollection: true,
    });
    expect(result.success).toBe(false);
  });
});
