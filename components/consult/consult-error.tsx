import Link from "next/link";

// SPEC-B2C-CONSULT-001 M5 (design.md §2.2, REQ-B2CCONSULT-008) — consult-view.tsx의
// M3/M4 인라인 "진단 결과를 불러올 수 없어요" placeholder를 대체하는 전용
// 컴포넌트. 02의 result-error.tsx와 동일한 톤을 따른다.

export function ConsultError() {
  return (
    <div
      data-testid="consult-error"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center"
    >
      <h1 className="text-h2 font-semibold text-bora-ink">진단 결과를 불러올 수 없어요</h1>
      <p className="max-w-sm text-body text-bora-ink-3">
        일시적인 오류로 진단 결과를 확인하지 못했습니다. 처음부터 다시 진단해 주세요.
      </p>
      <Link
        href="/"
        data-testid="consult-error-cta"
        className="mt-2 rounded-full bg-bora-accent px-5 py-2.5 text-body-s font-semibold text-white hover:bg-bora-accent-deep"
      >
        진단 시작하기
      </Link>
    </div>
  );
}
