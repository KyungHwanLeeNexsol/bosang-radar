import type { ConsultationDraft } from "./types";
import { CONSULTATION_DRAFT_VERSION } from "./types";
import { ConsultationDraftSchema } from "./schema";

// SPEC-B2C-CONSULT-001 M3 — 03 상담 폼 draft 채널(design.md §2.3).
// lib/diagnosis/handoff.ts와 동일한 패턴(SSR 가드, sessionStorage 왕복)을
// 따르되, draft는 사용자 입력 편의를 위한 비결정적 보조 데이터이므로
// handoff처럼 "empty/invalid/valid" 3갈래를 구분해 사용자에게 오류를
// 표면화하지 않는다 — 어떤 이유로든(파싱 실패, 스키마 불일치) 읽기에
// 실패하면 조용히 빈 draft로 폴백한다(design.md §2.3).
const CONSULTATION_DRAFT_STORAGE_KEY = "bosang-radar:consultation-draft-v1";

const EMPTY_DRAFT: ConsultationDraft = { draftVersion: CONSULTATION_DRAFT_VERSION };

/**
 * draft를 sessionStorage에 기록한다. SSR 환경(`typeof window ===
 * "undefined"`)에서는 no-op이다(design.md §2.3).
 */
export function writeConsultationDraft(draft: ConsultationDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(CONSULTATION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

/**
 * sessionStorage에서 draft를 읽는다. SSR 환경, 값 부재, JSON 파싱 실패,
 * 스키마 불일치 네 경우 모두 예외를 던지지 않고 `draftVersion`만 있는 빈
 * draft로 조용히 폴백한다(design.md §2.3) — draft는 편의용 보조 데이터일
 * 뿐이므로 handoff.ts와 달리 실패 사유를 사용자에게 구분해 보여줄 필요가
 * 없다.
 */
export function readConsultationDraft(): ConsultationDraft {
  if (typeof window === "undefined") {
    return EMPTY_DRAFT;
  }

  const raw = window.sessionStorage.getItem(CONSULTATION_DRAFT_STORAGE_KEY);
  if (raw === null) {
    return EMPTY_DRAFT;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_DRAFT;
  }

  const parsedDraft = ConsultationDraftSchema.safeParse(parsed);
  if (!parsedDraft.success) {
    return EMPTY_DRAFT;
  }

  return parsedDraft.data;
}

/**
 * 명시적 트리거(새 진단 시작/상담 신청 완료/사용자 초기화)에서만
 * 호출된다. SSR 환경에서는 no-op이다.
 */
export function clearConsultationDraft(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(CONSULTATION_DRAFT_STORAGE_KEY);
}
