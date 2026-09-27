"use client";

import { readDiagnosisHandoff } from "@/lib/diagnosis/handoff";

// SPEC-B2C-CONSULT-001 M3 — 03 상담 신청 화면의 M3 전용 최소 placeholder.
// M4(폼 구현)가 이 컴포넌트 내부를 완전히 교체한다 — handoff 읽기/3갈래
// 분기(empty/invalid/valid)·draft 읽기/쓰기·실제 폼 렌더링은 모두 M4
// 범위다. 이 milestone에서는 readDiagnosisHandoff() 배선이 이 컴포넌트까지
// 정상적으로 닿는지만 증명하고(호출만 하고 렌더링에는 쓰지 않는다), 정직한
// "준비 중" 문구로 `next build`를 그린 상태로 유지한다(Enforce Simplicity —
// M4의 폼 UI를 여기서 미리 구현하지 않는다).
export function ConsultView() {
  // SPEC-B2C-CONSULT-001 M4가 이 결과를 실제 3갈래 분기(empty/invalid/valid)
  // 렌더링에 사용한다 — 지금은 배선 확인용으로만 호출한다.
  readDiagnosisHandoff();

  return (
    <div
      data-testid="consult-view"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center"
    >
      <h1 className="text-h2 font-semibold text-bora-ink">상담 신청 폼을 준비하고 있어요</h1>
      <p className="max-w-sm text-body text-bora-ink-3">
        진단 결과를 바탕으로 한 상담 신청 화면을 곧 만나보실 수 있어요.
      </p>
    </div>
  );
}
