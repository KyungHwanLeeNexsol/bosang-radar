import type { DiagnosisAggregate } from "@/lib/diagnosis/aggregate";

// SPEC-B2C-RESULT-001 M4 (design.md §2, MIGRATION-PLAN.md §4, REQ-B2CRESULT-002)
// — 상단 집계 배너. computeAggregate()의 반환값만 그대로 렌더링하며, 어떤
// 예시 숫자(디자인 목업의 15/8/6/1 등)도 코드에 상수로 고정하지 않는다 —
// 이 컴포넌트에는 숫자 리터럴이 등장하지 않는다.

interface ResultAggregateBannerProps {
  aggregate: DiagnosisAggregate;
}

export function ResultAggregateBanner({ aggregate }: ResultAggregateBannerProps) {
  return (
    <section
      data-testid="result-aggregate-banner"
      aria-label="분석 결과 요약"
      className="rounded-[12px] border border-app-line bg-app-surface p-4 md:p-5"
    >
      <h2 className="text-h3 font-bold text-bora-ink md:text-[19px]">
        사고 내용으로 {aggregate.total}개 담보를 분석했습니다
      </h2>
      <p className="mt-1 text-label-s text-bora-ink-3 md:text-body-s">
        세 가지 상태의 합계는 분석한 담보 수와 같습니다. 보험증권 확인 전 단계의 참고 결과입니다.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 md:gap-3">
        <div data-testid="result-aggregate-review" className="rounded-[10px] bg-bora-ok-soft p-3">
          <p className="text-label-s text-bora-ok">검토 대상</p>
          <p className="text-h3 font-bold text-bora-ok md:text-[22px]">{aggregate.review}개</p>
        </div>
        <div
          data-testid="result-aggregate-needs-info"
          className="rounded-[10px] bg-bora-warn-soft p-3"
        >
          <p className="text-label-s text-bora-warn">추가 정보 필요</p>
          <p className="text-h3 font-bold text-bora-warn md:text-[22px]">{aggregate.needsInfo}개</p>
        </div>
        <div
          data-testid="result-aggregate-low-likelihood"
          className="rounded-[10px] bg-app-surface-inset p-3"
        >
          <p className="text-label-s text-bora-ink-4">가능성 낮음</p>
          <p className="text-h3 font-bold text-bora-ink-4 md:text-[22px]">
            {aggregate.lowLikelihood}개
          </p>
        </div>
      </div>
    </section>
  );
}
