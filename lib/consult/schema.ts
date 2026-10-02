import { z } from "zod";
import { normalizePhone } from "./phone";
import { CONSULTATION_DRAFT_VERSION } from "./types";

// SPEC-B2C-CONSULT-001 M1 — lib/consult/types.ts의 상담 데이터 계약을
// 런타임에도 강제하는 zod 스키마(design.md §6, §2.3). 제출용/draft용
// 모두 z.strictObject로 알 수 없는 키를 거부한다(REQ-B2CCONSULT-016).

export const ConsultationChannelSchema = z.enum(["kakao", "phone"]);

export const ConsultationConsentSchema = z.strictObject({
  piiCollection: z.literal(true),
  healthInfoUse: z.literal(true),
  marketing: z.boolean(),
});

// channel === "phone"일 때만 preferredCallTime을 요구하고(design.md §6),
// contact는 normalizePhone이 실패하면 거부한다(REQ-B2CCONSULT-011). 두
// 조건 모두 개별 필드 타입만으로는 강제되지 않으므로 .refine으로
// 스키마 레벨에서 강제한다.
export const ConsultationRequestSchema = z
  .strictObject({
    resultId: z.string().min(1),
    channel: ConsultationChannelSchema,
    name: z.string().trim().min(1).max(20),
    contact: z.string().min(1),
    preferredCallTime: z.string().min(1).optional(),
    consent: ConsultationConsentSchema,
    acknowledgedConsentVersion: z.string().min(1),
    idempotencyKey: z.string().min(1),
  })
  .refine((data) => data.channel !== "phone" || Boolean(data.preferredCallTime), {
    message: "전화 상담은 연락 희망 시간이 필요합니다",
    path: ["preferredCallTime"],
  })
  .refine((data) => normalizePhone(data.contact) !== null, {
    message: "연락처 형식이 올바르지 않습니다",
    path: ["contact"],
  });

export type ConsultationRequestParsed = z.infer<typeof ConsultationRequestSchema>;

// draft용 스키마 — 제출용과 동일하게 z.strictObject(알 수 없는 키 거부)
// 원칙을 따르되, draftVersion만 필수이고 나머지 저장 필드는 모두
// optional이다(design.md §2.3). 필수 동의 체크 상태 필드는 의도적으로
// 여기 없다 — 새로고침 후 매번 다시 명시적으로 체크해야 한다(동의
// 재확인 원칙).
export const ConsultationDraftSchema = z.strictObject({
  draftVersion: z.literal(CONSULTATION_DRAFT_VERSION),
  channel: ConsultationChannelSchema.optional(),
  name: z.string().optional(),
  contactRaw: z.string().optional(),
  preferredCallTime: z.string().optional(),
  marketingConsent: z.boolean().optional(),
  idempotencyKey: z.string().optional(),
});

export type ConsultationDraftParsed = z.infer<typeof ConsultationDraftSchema>;
