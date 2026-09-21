// SPEC-B2C-DIAGNOSIS-001 M4 (design.md §2, §14, §17; plan.md §B) — 01-A3/
// M01-A3 동의 상세 오버레이 공용 콘텐츠(Modal/Bottom Sheet 셸 내부에서
// 재사용). 6개 항목은 법무 확정 전까지 반드시 리터럴 `{}` placeholder
// 형태를 유지해야 한다(REQ-B2CDIAG-025, AC-B2CDIAG-025) — 이 컴포넌트는
// 실제 문구를 임의로 생성하지 않는다.

interface ConsentDetailItem {
  label: string;
  value: string;
}

const CONSENT_DETAIL_ITEMS: ConsentDetailItem[] = [
  { label: "처리 목적", value: "{처리 목적 확정 문구}" },
  { label: "처리하는 건강정보 항목", value: "{처리 항목 확정 문구}" },
  { label: "서버 저장 여부", value: "{저장 여부 확정 문구}" },
  { label: "보유·이용 기간", value: "{보유·이용 기간 확정 문구}" },
  { label: "외부 AI 서비스 전송 여부", value: "{외부 AI 전송 여부 확정 문구}" },
  { label: "동의 거부 권리 및 진단 이용 제한", value: "{동의 거부 및 제한 확정 문구}" },
];

export function ConsentDetailContent() {
  return (
    <dl className="flex flex-col gap-4">
      {CONSENT_DETAIL_ITEMS.map((item) => (
        <div key={item.label} className="flex flex-col gap-1.5">
          <dt className="text-h3 font-semibold text-bora-ink">{item.label}</dt>
          <dd className="rounded-[8px] bg-bora-warn-soft px-3.5 py-3 text-meta text-bora-ink-2">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
