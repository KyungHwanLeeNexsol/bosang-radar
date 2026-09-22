import * as React from "react";

import { cn } from "@/lib/utils";
import type { CoverageItem, CoverageStatus } from "@/lib/diagnosis/types";
import { STATUS_LABEL } from "./labels";

// SPEC-B2C-RESULT-001 M4 (design.md §1/§7, MIGRATION-PLAN.md §4,
// REQ-B2CRESULT-001/005/006/007/008/020) — 담보 카드. 3톤 상태 pill(텍스트
// 라벨 항상 동반, REQ-B2CRESULT-020), badges: CoverageBadge[] 렌더링,
// benefit.label/displayText를 그대로 출력(산술 연산 없음, REQ-B2CRESULT-006),
// factChips: FactChip[] 목록(REQ-B2CRESULT-007/008), "가능성 낮음" 상태의
// reasonNote(타입이 이미 필수를 보장). description/whyCheck/evidenceRefs/
// additionalInfoNote/requiredDocuments는 모두 데이터에서만 온다 — 이 파일에
// 케이스 특정 문구를 리터럴로 적지 않는다(plan.md §D).

const STATUS_PILL_STYLE: Record<CoverageStatus, string> = {
  review: "bg-bora-ok-soft text-bora-ok",
  "needs-info": "bg-bora-warn-soft text-bora-warn",
  "low-likelihood": "bg-app-surface-inset text-bora-ink-4",
};

const STATUS_CARD_STYLE: Record<CoverageStatus, string> = {
  review: "border-app-line bg-app-surface",
  "needs-info": "border-bora-warn-line bg-bora-warn-soft/30",
  "low-likelihood": "border-app-line bg-app-surface",
};

interface CoverageItemCardProps {
  item: CoverageItem;
}

export function CoverageItemCard({ item }: CoverageItemCardProps) {
  const hasDisclosure =
    item.whyCheck.length > 0 ||
    (item.evidenceRefs?.length ?? 0) > 0 ||
    (item.requiredDocuments?.length ?? 0) > 0;

  return (
    <div
      data-testid={`coverage-item-${item.id}`}
      data-status={item.status}
      className={cn("flex flex-col gap-2.5 rounded-[10px] border p-4", STATUS_CARD_STYLE[item.status])}
    >
      <h3 className="text-body-s font-bold text-bora-ink">{item.name}</h3>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          data-testid="coverage-status-pill"
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-label-s font-semibold",
            STATUS_PILL_STYLE[item.status]
          )}
        >
          {STATUS_LABEL[item.status]}
        </span>
        {item.badges.map((badge) => (
          <span
            key={badge.id}
            data-testid="coverage-badge"
            className="inline-flex items-center rounded-[3px] bg-app-surface-inset px-2 py-1 text-label-s font-medium text-bora-ink-3"
          >
            {badge.label}
          </span>
        ))}
      </div>

      <p className="text-label-s text-bora-ink-3 md:text-body-s">{item.description}</p>

      <div className="flex items-center justify-between gap-2 border-t border-app-line pt-2.5">
        <span className="text-label-s text-bora-ink-3">{item.benefit.label}</span>
        <span data-testid="coverage-benefit-text" className="text-body-s font-bold text-bora-ink">
          {item.benefit.displayText}
        </span>
      </div>

      {item.factChips.length > 0 ? (
        <div data-testid="coverage-fact-chips" className="flex flex-wrap gap-1.5">
          {item.factChips.map((chip) => (
            <span
              key={chip.questionId}
              className="inline-flex items-center gap-1 rounded-[3px] bg-bora-accent-soft px-2 py-1 text-label-s"
            >
              <span className="text-bora-ink-3">{chip.label}</span>
              <span className="font-semibold text-bora-accent">{chip.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      {item.status === "low-likelihood" ? (
        <p data-testid="coverage-reason-note" className="text-label-s text-bora-ink-4">
          {item.reasonNote}
        </p>
      ) : null}

      {item.additionalInfoNote ? (
        <p data-testid="coverage-additional-info" className="text-label-s text-bora-warn">
          {item.additionalInfoNote}
        </p>
      ) : null}

      {hasDisclosure ? (
        <details className="text-label-s text-bora-ink-3">
          <summary className="cursor-pointer font-medium text-bora-accent">
            왜 확인해야 하나요?
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {item.whyCheck ? <p>{item.whyCheck}</p> : null}
            {item.evidenceRefs && item.evidenceRefs.length > 0 ? (
              <ul className="list-disc pl-4">
                {item.evidenceRefs.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
            ) : null}
            {item.requiredDocuments && item.requiredDocuments.length > 0 ? (
              <div>
                <p className="font-medium text-bora-ink-2">필요 서류</p>
                <ul className="list-disc pl-4">
                  {item.requiredDocuments.map((doc) => (
                    <li key={doc}>{doc}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
