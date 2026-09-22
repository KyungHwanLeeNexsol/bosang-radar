// SPEC-B2C-RESULT-001 M3 — 이 컴포넌트는 임시 placeholder다. Milestone 4가
// 마운트 시 readDiagnosisHandoff()를 조회해 "empty"/"invalid"/"valid" 3갈래로
// 분기하고 Desktop/Mobile 실제 결과 화면을 렌더링하는 것으로 이 내부를
// 완전히 교체한다(design.md, REQ-B2CRESULT-013/014/016). 이 milestone은
// app/result/page.tsx의 라우트 셸과 <Suspense> 경계만 구성하는 것이 범위이며,
// 실제 결과 렌더링 로직은 범위 밖이다 — 과대 구현하지 않는다.
export function ResultView() {
  return (
    <div
      data-testid="result-view-placeholder"
      className="flex w-full justify-center px-5 py-16 md:px-4"
    >
      <p className="text-body text-bora-ink-3">결과 화면 준비 중</p>
    </div>
  );
}
