// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearConsultationDraft, readConsultationDraft, writeConsultationDraft } from "./draft";
import { CONSULTATION_DRAFT_VERSION, type ConsultationDraft } from "./types";

// SPEC-B2C-CONSULT-001 M3 (design.md §2.3) — 상담 폼 draft sessionStorage
// 채널 단위 테스트. lib/diagnosis/handoff.test.ts와 동일한 패턴(SSR 가드,
// write→read 왕복, 손상된 데이터 처리)을 따르되, draft는 편의용 보조
// 데이터이므로 잘못된 값을 만나면(파싱 실패/스키마 불일치 모두) 3갈래
// 판별 유니언이 아니라 조용히 빈 draft로 폴백한다(design.md §2.3 — 사용자
// 에러를 표면화하지 않는다).

const STORAGE_KEY = "bosang-radar:consultation-draft-v1";

function buildValidDraft(): ConsultationDraft {
  return {
    draftVersion: CONSULTATION_DRAFT_VERSION,
    channel: "kakao",
    name: "홍길동",
    contactRaw: "010-1234-5678",
  };
}

describe("draft — sessionStorage 왕복", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("write → read 왕복은 저장한 draft를 그대로 반환한다", () => {
    const draft = buildValidDraft();
    writeConsultationDraft(draft);

    expect(readConsultationDraft()).toEqual(draft);
  });

  it("빈 sessionStorage는 draftVersion만 있는 빈 draft를 반환한다", () => {
    expect(readConsultationDraft()).toEqual({ draftVersion: CONSULTATION_DRAFT_VERSION });
  });

  it("구문이 깨진 JSON은 예외 없이 빈 draft로 폴백한다", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not valid json");

    expect(() => readConsultationDraft()).not.toThrow();
    expect(readConsultationDraft()).toEqual({ draftVersion: CONSULTATION_DRAFT_VERSION });
  });

  it("구문은 유효하나 스키마와 불일치하는 JSON은 빈 draft로 폴백한다", () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ draftVersion: 999 }));

    expect(readConsultationDraft()).toEqual({ draftVersion: CONSULTATION_DRAFT_VERSION });
  });

  it("알 수 없는 키가 섞인 JSON은 빈 draft로 폴백한다(strictObject)", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ draftVersion: CONSULTATION_DRAFT_VERSION, unknownField: "x" })
    );

    expect(readConsultationDraft()).toEqual({ draftVersion: CONSULTATION_DRAFT_VERSION });
  });

  it("clearConsultationDraft 호출 후에는 빈 draft로 되돌아간다", () => {
    writeConsultationDraft(buildValidDraft());
    expect(readConsultationDraft()).not.toEqual({ draftVersion: CONSULTATION_DRAFT_VERSION });

    clearConsultationDraft();

    expect(readConsultationDraft()).toEqual({ draftVersion: CONSULTATION_DRAFT_VERSION });
  });
});

describe('draft — SSR 가드(typeof window === "undefined")', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("window가 없는 환경에서 write/read/clear 모두 예외 없이 안전하게 동작한다", () => {
    vi.stubGlobal("window", undefined);

    expect(() => writeConsultationDraft(buildValidDraft())).not.toThrow();
    expect(readConsultationDraft()).toEqual({ draftVersion: CONSULTATION_DRAFT_VERSION });
    expect(() => clearConsultationDraft()).not.toThrow();
  });
});
