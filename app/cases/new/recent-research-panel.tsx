import Link from "next/link";
import type { RecentCaseSummary } from "@/lib/cases/get-recent-cases-for-owner";

// SPEC-UI-MIGRATION-001 M6 (REQ-013) — "최근 리서치" 우 레일 패널. 저장값
// (cases.status, 영문)은 그대로 유지하고 표시 레이어에서만 한글 라벨로
// 번역한다. 조회 자체가 실패한 경우(AC-013e) NewCasePage가 빈 배열로
// 폴백해 이 컴포넌트에 전달하므로, 이 컴포넌트는 빈 배열을 우아한 빈
// 상태로만 처리하면 된다(신규 오류 상태 분기 불필요).
const STATUS_LABELS: Record<string, string> = {
  pending: "처리 중",
  completed: "완료",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function RecentResearchPanel({ cases }: { cases: RecentCaseSummary[] }) {
  return (
    <div
      className="overflow-hidden rounded-[4px] bg-app-surface"
      data-testid="case-recent-research"
    >
      <div className="flex items-center justify-between gap-2 border-b border-app-line px-4 py-3">
        <h3 className="text-h3 font-semibold text-bora-ink">최근 리서치</h3>
        {/* SPEC-UI-MIGRATION-001 Post-M8 Round2 (D3.7) — 목적지(리포트
            보관함)가 아직 "준비 중"인 미구현 기능이므로 비활성/불활성
            요소로만 렌더링한다(존재하지 않는 라우트로 링크하지 않음). */}
        <span
          aria-disabled="true"
          className="shrink-0 cursor-not-allowed text-label-s font-medium text-bora-ink-4 opacity-40"
        >
          전체 보기
        </span>
      </div>
      {cases.length > 0 ? (
        <ul className="flex flex-col">
          {cases.map((item) => (
            <li key={item.id} data-testid="case-recent-research-item">
              <Link
                href={`/cases/${item.id}`}
                className="flex flex-col gap-0.5 border-b border-app-line px-4 py-3 last:border-b-0 hover:bg-app-surface-sub"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-body-s font-semibold text-bora-ink">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-label-s text-bora-ink-4">
                    {statusLabel(item.status)}
                  </span>
                </div>
                <span className="truncate text-label-s text-bora-ink-4">
                  {/* SPEC-UI-MIGRATION-001 Post-M8 Round2 (D3.8) — 표시용
                      truncation만 적용한다. 실제 라우트/DB 조회의 caseId는
                      무변경이다(위 href는 item.id 원본을 그대로 사용). */}
                  {item.id.slice(0, 8)} · {item.subtitle}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-body-s text-bora-ink-3">최근 사건이 없습니다.</p>
      )}
    </div>
  );
}
