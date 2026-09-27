// SPEC-B2C-CONSULT-001 M1 — 상담 신청 데이터 계약의 단일 SSOT.
// 03(상담 신청) 화면과 POST /api/consultations 사이의 유일한 계약이다
// (design.md §6). lib/diagnosis/types.ts와 동일한 "타입+zod 스키마 분리"
// 관례를 따른다 — 런타임 검증은 schema.ts가 맡는다.

/** 상담 채널 — 카카오톡 또는 전화 두 값으로 고정(design.md §1 D1). */
export type ConsultationChannel = "kakao" | "phone";

/**
 * 클라이언트 → 서버 제출 페이로드의 동의 블록. 필수 동의 두 항목
 * (piiCollection/healthInfoUse)은 리터럴 true로 고정되어 체크되지 않은
 * 상태로는 애초에 유효한 페이로드를 만들 수 없다(design.md §7,
 * REQ-B2CCONSULT-012). marketing은 제출 활성화 조건에 전혀 관여하지
 * 않는다.
 */
export interface ConsultationConsent {
  piiCollection: true;
  healthInfoUse: true;
  marketing: boolean;
}

/**
 * POST /api/consultations 요청 페이로드. resultId는 서버가 대조 검증할
 * 원본이 없는 opaque 참조다(design.md §9.2 잔여 위험) — 형식(min 1)만
 * 검증된다. preferredCallTime은 channel === "phone"일 때만 필수이며
 * 이 강제는 schema.ts의 .refine에서 이루어진다(design.md §6).
 */
export interface ConsultationRequest {
  resultId: string;
  channel: ConsultationChannel;
  name: string;
  contact: string;
  preferredCallTime?: string;
  consent: ConsultationConsent;
  acknowledgedConsentVersion: string;
  idempotencyKey: string;
}

/**
 * 서버 응답 — discriminated union(design.md §6). 서버는
 * consultationId/createdAt/updatedAt/applicationStatus 같은
 * 클라이언트-비신뢰 값을 success 응답에도 포함하지 않는다(design.md
 * §9.4).
 */
export type ConsultationSubmitResult =
  | {
      status: "success";
      channel: ConsultationChannel;
      maskedContact: string;
      preferredCallTime?: string;
    }
  | {
      status: "duplicate";
      receivedAt: string;
      maskedContact: string;
      applicationStatus: string;
    }
  | {
      status: "error";
      code:
        | "validation"
        | "rate_limited"
        | "server_error"
        | "handoff_mismatch"
        | "policy_unavailable"
        | "consent_version_mismatch"
        | "idempotency_conflict";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

/**
 * 이 계약의 draft 스키마 버전 상수 — schema.ts의 ConsultationDraftSchema가
 * 이 리터럴로 draftVersion을 고정한다(design.md §2.3).
 */
export const CONSULTATION_DRAFT_VERSION = 1 as const;

/**
 * 상담 폼 임시 draft(lib/consult/draft.ts, sessionStorage) — 사용자 입력
 * 편의를 위한 비결정적 보조 데이터다. 필수 동의 두 항목의 체크 상태는
 * 의도적으로 이 타입에 없다 — 새로고침 후에도 매번 다시 명시적으로
 * 체크해야 한다(동의 재확인 원칙, design.md §2.3).
 */
export interface ConsultationDraft {
  draftVersion: typeof CONSULTATION_DRAFT_VERSION;
  channel?: ConsultationChannel;
  name?: string;
  contactRaw?: string;
  preferredCallTime?: string;
  marketingConsent?: boolean;
  idempotencyKey?: string;
}
