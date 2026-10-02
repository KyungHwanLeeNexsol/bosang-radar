import Link from "next/link";

// SPEC-B2C-CONSULT-001 M5 (design.md §2.2, REQ-B2CCONSULT-007) — consult-view.tsx의
// M3/M4 인라인 "먼저 진단 결과가 필요합니다" placeholder를 대체하는 전용
// 컴포넌트. 02의 result-no-data.tsx와 동일한 톤(정직한 데이터-부재 안내 +
// 01 입력 화면으로 돌아가는 CTA만 제공)을 따르되, 03 전용 문구를 쓴다.

export function ConsultNoData() {
  return (
    <div
      data-testid="consult-no-data"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center"
    >
      <h1 className="text-h2 font-semibold text-bora-ink">먼저 진단 결과가 필요합니다</h1>
      <p className="max-w-sm text-body text-bora-ink-3">
        상담 신청을 위해서는 먼저 보상 가능성 진단을 완료해 주세요.
      </p>
      <Link
        href="/"
        data-testid="consult-no-data-cta"
        className="mt-2 rounded-full bg-bora-accent px-5 py-2.5 text-body-s font-semibold text-white hover:bg-bora-accent-deep"
      >
        진단 시작하기
      </Link>
    </div>
  );
}
