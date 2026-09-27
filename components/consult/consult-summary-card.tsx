import type { DiagnosisAggregate } from "@/lib/diagnosis/aggregate";

// SPEC-B2C-CONSULT-001 M4 (design.md §2.2, design/exports/03-상담-신청-손해사정사-연결.png)
// — 진단 결과 요약 카드. computeAggregate()의 반환값(부모 ConsultView가 계산)
// 만 그대로 렌더링하며, 02의 ResultAggregateBanner와 동일한 원칙(REQ-B2CRESULT-002)
// 으로 어떤 예시 숫자도 코드에 상수로 고정하지 않는다.

interface ConsultSummaryCardProps {
  title: string;
  aggregate: DiagnosisAggregate;
}

export function ConsultSummaryCard({ title, aggregate }: ConsultSummaryCardProps) {
  return (
    <section
      data-testid="consult-summary-card"
      aria-label="진단 결과 요약"
      className="rounded-[12px] border border-app-line bg-app-surface p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-label-s text-bora-ink-3">진단 결과 요약</p>
          <h2 className="mt-1 text-h3 font-bold text-bora-ink">{title}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <span className="rounded-full bg-bora-ok-soft px-2.5 py-1 text-label-s font-semibold text-bora-ok">
            검토 대상 {aggregate.review}개
          </span>
          <span className="rounded-full bg-bora-warn-soft px-2.5 py-1 text-label-s font-semibold text-bora-warn">
            추가 정보 필요 {aggregate.needsInfo}개
          </span>
        </div>
      </div>
      <p className="mt-3 border-t border-app-line pt-3 text-meta text-bora-ink-3">
        가능성 낮음 {aggregate.lowLikelihood}개를 포함해 총 {aggregate.total}개 담보를
        분석했습니다 · 보험증권 확인 전 참고 결과
      </p>
    </section>
  );
}
