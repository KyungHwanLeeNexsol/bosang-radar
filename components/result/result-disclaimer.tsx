import * as React from "react";
import { TriangleAlert } from "lucide-react";

// SPEC-B2C-RESULT-001 D2 (MIGRATION-PLAN.md §5 "면책 문구 필수 노출 —
// 숨기거나 툴팁 처리 금지", REQ-B2CRESULT-022 단정형 표현 금지) — 결과
// 콘텐츠 최하단에 항상 노출되는 고정 면책 문구 블록. 아이콘 + 텍스트를
// 함께 표기해(색상 단독 전달 금지, coverage-item-card.tsx 3톤 pill과 동일
// 원칙) 접기/숨김 없이 렌더링한다. 조건부 표현("달라질 수 있습니다")만
// 사용하며 단정형 표현("보상받으실 수 있습니다")은 쓰지 않는다.

export function ResultDisclaimer() {
  return (
    <div
      data-testid="result-disclaimer"
      role="note"
      className="flex w-full items-start gap-2 rounded-[10px] border border-bora-warn-line bg-bora-warn-soft/40 px-4 py-3.5 text-label-s text-bora-ink-3"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-bora-warn" />
      <p>
        본 진단 결과는 참고용 안내이며, 실제 보상 가능 여부와 지급액은 보험약관, 가입하신 특약,
        보험사 심사 결과에 따라 달라질 수 있습니다.
      </p>
    </div>
  );
}
