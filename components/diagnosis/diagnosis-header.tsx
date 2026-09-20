import { MessageCircle } from "lucide-react";

// SPEC-B2C-DIAGNOSIS-001 M-fix-1 (design/exports/01-*.png, M01-*.png) — BORA
// 브랜드 헤더. 01/01-A2/01-B/01-C/01-D/01-E 캡처 전부에 동일하게 등장하므로
// (스텝별로 중복 렌더링하지 않도록) diagnosis-flow.tsx가 스텝 스위치 바깥에서
// 한 번만 렌더링한다(Enforce Simplicity). Desktop은 우측에 "사고·질병 보상
// 진단" 라벨 + "카톡 상담" 버튼을 모두 표시하고, Mobile은 채팅 아이콘
// 버튼만 남긴다(M01 캡처 — 라벨 텍스트는 좁은 폭에서 생략).
//
// "카톡 상담" 버튼은 실제 카카오톡 상담 채널 연결(외부 URL)이 이 SPEC
// 범위에 없으므로(매칭 엔진·상담 신청 흐름은 후속 SPEC), 클릭 핸들러를
// 연결하지 않은 시각적 placeholder로 남긴다 — 진단 플로우 상태 머신에는
// 영향을 주지 않는다.

export function DiagnosisHeader() {
  return (
    <header className="flex w-full items-center justify-between border-b border-app-line px-4 py-3.5 md:px-8">
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-bora-accent text-sm font-bold text-white">
          B
        </span>
        <span className="text-base font-extrabold tracking-tight text-bora-ink">BORA</span>
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden text-body-s text-bora-ink-3 md:inline">사고·질병 보상 진단</span>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-app-line px-3.5 py-1.5 text-body-s font-medium text-bora-ink-2 transition-colors hover:bg-app-surface-sub md:px-4"
        >
          <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="hidden md:inline">카톡 상담</span>
        </button>
      </div>
    </header>
  );
}
