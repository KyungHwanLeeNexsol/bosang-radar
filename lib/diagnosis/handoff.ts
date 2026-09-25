import type { DiagnosisResult } from "./types";
import { DiagnosisResultSchema } from "./schema";

// SPEC-B2C-RESULT-001 M2 — 01→02 인계 채널(design.md §3, REQ-B2CRESULT-010/
// 013/014/016/017). `sessionStorage`에 완전히 구성된 DiagnosisResult 전체를
// 1회 기록하고, 탭 세션 동안 유지한다(새로고침·뒤로가기 후에도 동일한
// 결과가 다시 표시된다) — clearDiagnosisHandoff()가 명시적으로 호출되는
// 세 경우(새 진단 시작/상담 신청 완료/사용자 초기화)에만 제거된다.
//
// 선택한 sessionStorage 키(REQ-B2CRESULT-017, 프로젝트 네임스페이스 포함):
const DIAGNOSIS_HANDOFF_STORAGE_KEY = "bosang-radar:diagnosis-handoff-v1";

/**
 * readDiagnosisHandoff()의 3갈래 판별 유니언 반환 타입(design.md §3) —
 * sessionStorage에 값이 아예 없는 경우("empty")와, 값은 있으나
 * DiagnosisResultSchema의 safeParse가 거부하는 경우("invalid")를 서로 다른
 * 상태로 구분해야 result-view.tsx(후속 milestone)가 02 전용 "결과 없음"
 * (REQ-B2CRESULT-013)과 "오류"(REQ-B2CRESULT-014) 상태를 혼동 없이 갈라
 * 렌더링할 수 있다.
 */
export type DiagnosisHandoffReadResult =
  | { status: "empty" }
  | { status: "valid"; result: DiagnosisResult }
  | { status: "invalid"; reason: string };

/**
 * 완전히 구성된 DiagnosisResult 전체를 sessionStorage에 기록한다
 * (REQ-B2CRESULT-010) — rawInput/answers만 저장하고 결과 구성을 `/result`
 * 쪽으로 미루지 않는다. SSR 환경(`typeof window === "undefined"`)에서는
 * no-op이다(design.md §3).
 */
export function writeDiagnosisHandoff(result: DiagnosisResult): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(DIAGNOSIS_HANDOFF_STORAGE_KEY, JSON.stringify(result));
}

/**
 * sessionStorage에서 인계 데이터를 읽기만 하며, 어떤 분기에서도
 * sessionStorage를 변경하지 않는다(REQ-B2CRESULT-016, AC-B2CRESULT-016) —
 * "읽으면서 동시에 지운다"는 부수효과를 갖지 않는다. SSR 환경에서는 항상
 * `{ status: "empty" }`를 안전하게 반환한다.
 */
export function readDiagnosisHandoff(): DiagnosisHandoffReadResult {
  if (typeof window === "undefined") {
    return { status: "empty" };
  }

  const raw = window.sessionStorage.getItem(DIAGNOSIS_HANDOFF_STORAGE_KEY);
  if (raw === null) {
    return { status: "empty" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: "invalid",
      reason:
        error instanceof Error ? error.message : "저장된 데이터를 JSON으로 해석할 수 없습니다.",
    };
  }

  const parsedResult = DiagnosisResultSchema.safeParse(parsed);
  if (!parsedResult.success) {
    // 구문은 유효하나 스키마와 불일치하는 JSON도 이 분기로 포함된다
    // (design.md §3, AC-B2CRESULT-014 추가 시나리오).
    return { status: "invalid", reason: parsedResult.error.message };
  }

  return { status: "valid", result: parsedResult.data as DiagnosisResult };
}

/**
 * 명시적 트리거(새 진단 시작/상담 신청 완료/사용자 초기화, REQ-B2CRESULT-016)
 * 에서만 호출된다 — 마운트 시 자동으로 호출되지 않는다. SSR 환경에서는
 * no-op이다.
 */
export function clearDiagnosisHandoff(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(DIAGNOSIS_HANDOFF_STORAGE_KEY);
}
