import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentSession } from "@/lib/auth/session";
import { getCaseForOwner } from "@/lib/cases/get-case-for-owner";
import { getDb } from "@/lib/db/client";
import { evidence as evidenceTable } from "@/lib/db/schema";
import { StatusBadge } from "@/components/ui/status-badge";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { EvidenceItem } from "@/components/evidence-item";
import { evidenceTypeLabel, queryIssueTypeLabel } from "@/lib/pipeline/labels";
import type { EvidenceType, QueryIssueType, VerifiedClaim } from "@/lib/pipeline/types";
import { submitReportFeedback } from "./actions";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  title: "사건 상세",
};

interface CaseDetailPageProps {
  params: Promise<{ caseId: string }>;
}

interface EvidenceDisplay {
  title: string;
  sourceUrl: string | null;
  evidenceType: EvidenceType;
  issueTypes: QueryIssueType[];
}

// SPEC-PILOT-UX-001 REQ-PILOT-UX-005/006 — evidenceType/issueTypes 근거자료
// 참조 렌더링을 세 곳(claim 자신, counterArgument 뒷받침/반박)에서 공통으로
// 사용하기 위한 헬퍼(plan.md §D Risk 1의 중복 방지). sourceUrl은 클릭 가능한
// 링크로 렌더링한다(REQ-PILOT-UX-006).
// SPEC-PILOT-VISUAL-001 M3 (REQ-013) — 출력 마크업을 EvidenceItem
// 프레젠테이션 컴포넌트로 교체했다. sourceUrl 링크의
// target="_blank" rel="noopener noreferrer" 속성(AC-008)은 EvidenceItem
// 내부에 그대로 보존된다. evidenceById에 없는 evidenceId는 기존과 동일하게
// 원시 ID 텍스트로 폴백한다.
function renderEvidenceReference(evidenceId: string, evidenceById: Map<string, EvidenceDisplay>) {
  const item = evidenceById.get(evidenceId);
  if (!item) {
    return (
      <li key={evidenceId} className="py-[13px] pl-4 text-body text-bora-ink-3">
        {evidenceId}
      </li>
    );
  }
  return (
    <EvidenceItem
      key={evidenceId}
      title={item.title}
      sourceUrl={item.sourceUrl}
      evidenceType={item.evidenceType}
      issueTypes={item.issueTypes}
    />
  );
}

// SPEC-PILOT-VISUAL-001 M5 (REQ-013 — claim-card 헤더 issue 칩) — claim의
// supportingEvidenceIds가 가리키는 evidence들의 issueTypes를 evidenceById에서
// 조회해 중복 제거한 목록으로 파생한다. 신규 DB/API 호출 없이 이미 이 파일
// 상단에서 구성한 evidenceById Map만 사용한다(REQ-014와 동일 원칙).
function getClaimIssueTypes(
  claim: VerifiedClaim,
  evidenceById: Map<string, EvidenceDisplay>
): QueryIssueType[] {
  const seen = new Set<QueryIssueType>();
  for (const evidenceId of claim.supportingEvidenceIds) {
    evidenceById.get(evidenceId)?.issueTypes.forEach((issueType) => seen.add(issueType));
  }
  return Array.from(seen);
}

// SPEC-PILOT-VISUAL-001 M5 (REQ-014 — 우 레일 "수집 근거 유형") — 인용된
// evidence의 evidenceType별 카운트를 파생한다. citedEvidenceIds/evidenceById
// 모두 이미 이 파일이 확보한 데이터이며, 신규 API 호출이나 신규 DB 조회,
// evidence SELECT 프로젝션 확장이 전혀 없다(REQ-015).
function computeEvidenceTypeCounts(
  citedEvidenceIds: string[],
  evidenceById: Map<string, EvidenceDisplay>
): { type: EvidenceType; count: number }[] {
  const counts = new Map<EvidenceType, number>();
  for (const evidenceId of citedEvidenceIds) {
    const item = evidenceById.get(evidenceId);
    if (!item) continue;
    counts.set(item.evidenceType, (counts.get(item.evidenceType) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label-s font-medium text-bora-ink-4">{label}</p>
      <p className="text-h3 font-semibold text-bora-ink">{value}</p>
    </div>
  );
}

// bare UI — 사건 상세 + 리서치 리포트 뷰(M5/M6, design.md §3·§8). owner_user_id
// 스코핑은 getCaseForOwner()가 담당하며, 소유하지 않은 사건이면 null을
// 반환해 notFound()로 이어진다(REQ-SCAFFOLD-011, AC-SCAFFOLD-010).
export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { caseId } = await params;

  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }

  const caseWithReport = await getCaseForOwner(caseId, session.user.id);
  if (!caseWithReport) {
    notFound();
  }

  const { report, reportId } = caseWithReport;

  // evidenceById — 정적 seed JSON(db/seed/evidence.json) 대신 실제 Drizzle
  // 조회 결과로 구성한다(design.md §8 — §6 EvidenceRetriever가 도입한 DB
  // 조회 경로를 UI 레이어에서도 재사용).
  const evidenceById = new Map<string, EvidenceDisplay>();
  if (report) {
    const db = getDb();
    const rows = await db
      .select({
        id: evidenceTable.id,
        title: evidenceTable.title,
        sourceUrl: evidenceTable.sourceUrl,
        evidenceType: evidenceTable.evidenceType,
        issueTypes: evidenceTable.issueTypes,
      })
      .from(evidenceTable);
    for (const row of rows) {
      evidenceById.set(row.id, {
        title: row.title,
        sourceUrl: row.sourceUrl,
        evidenceType: row.evidenceType as EvidenceType,
        issueTypes: row.issueTypes as QueryIssueType[],
      });
    }
  }

  // SPEC-FEEDBACK-001 REQ-FEEDBACK-014 — 근거자료 verdict 컨트롤은 evidence
  // 테이블 전체가 아니라, 리포트의 주장들이 실제로 인용한 distinct evidence
  // ID에 대해서만 렌더링한다(plan.md §D Risk 3).
  const citedEvidenceIds = report
    ? [
        ...new Set(
          report.verifiedClaims.flatMap((claim) => [
            ...claim.supportingEvidenceIds,
            ...claim.counterArguments.flatMap((counterArgument) => [
              ...counterArgument.supportingEvidenceIds,
              ...counterArgument.counterEvidenceIds,
            ]),
          ])
        ),
      ]
    : [];

  // SPEC-PILOT-VISUAL-001 M5 (REQ-014) — 우 레일 "수집 근거 유형"이 소비하는
  // 파생 데이터. citedEvidenceIds가 빈 배열이면 evidenceTypeCounts도 자연히
  // 빈 배열이 되므로 report 존재 여부를 별도로 분기할 필요가 없다.
  const evidenceTypeCounts = computeEvidenceTypeCounts(citedEvidenceIds, evidenceById);
  const maxEvidenceTypeCount = evidenceTypeCounts[0]?.count ?? 0;

  // SPEC-PILOT-UX-001 REQ-PILOT-UX-004(§A decision 2) — 요약 배너 집계는
  // 이미 조회된 report.verifiedClaims를 inline reduce/filter로 계산한다.
  // ResearchReport 타입 계약(SPEC-RESEARCH-001)은 건드리지 않는다.
  const verifiedCount = report
    ? report.verifiedClaims.filter((claim) => claim.status === "VERIFIED").length
    : 0;
  const totalClaimCount = report?.verifiedClaims.length ?? 0;
  const insufficientCount = totalClaimCount - verifiedCount;

  // SPEC-PILOT-VISUAL-001 M5 — 요약 패널 하단 "비확정성 문구"(design.md
  // REQ-012) 및 우 레일 Notice "활용 유의"가 공통으로 재사용하는 문자열.
  // 새 문구를 만들지 않고 기존 집계 문장을 그대로 재사용한다(§E 잔여
  // 위험 참고 — research.md §9가 언급한 "보험금 지급 비확정" 문구는
  // 코드베이스 전체를 검색해도 UI 텍스트로 존재하지 않아 대신 이 기존
  // 집계 문장을 재사용했다).
  const aggregateStatusCaption = `전체 검증 상태: ${totalClaimCount}건 중 ${verifiedCount}건 근거 확인, ${insufficientCount}건 판단 불충분`;

  return (
    <div className="flex flex-1 flex-col gap-5 px-8 pt-6 pb-10">
      {report ? (
        <div data-testid="case-report" className="flex flex-col gap-5">
          {/* SPEC-PILOT-VISUAL-001 M5 (REQ-012) — "사건 요약" 패널.
              summary-banner testid는 패널 전체 래퍼에 부여한다: 내부의
              leaf 텍스트 노드 "사건 요약"(h1)은 이 래퍼의 자손(descendant)
              이므로 DOM 순서상 항상 "following"으로 판정되어 AC-005의
              compareDocumentPosition 검증을 그대로 만족한다. */}
          <div
            data-testid="summary-banner"
            className="max-w-[1144px] overflow-hidden rounded-[4px] bg-app-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-line px-6 py-4">
              <div>
                <p className="text-label-s font-medium text-bora-ink-4">사건 요약 · {caseId}</p>
                <h1 className="text-h2 font-semibold text-bora-ink">사건 요약</h1>
              </div>
              <div className="flex items-center gap-3">
                {totalClaimCount > 0 ? (
                  <StatusBadge status={insufficientCount > 0 ? "INSUFFICIENT" : "VERIFIED"}>
                    {insufficientCount > 0 ? "판단 불충분 포함" : "근거 확인"}
                  </StatusBadge>
                ) : null}
                <span className="text-meta font-normal text-bora-ink-4">
                  {formatGeneratedAt(report.generatedAt)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-4 divide-app-line px-6 py-5 sm:grid-cols-4 sm:divide-x">
              <MetaItem label="진단명" value={report.caseSummary.diagnosisName} />
              <div className="sm:pl-6">
                <MetaItem label="장해 부위" value={report.caseSummary.disabilityBodyPart} />
              </div>
              <div className="sm:pl-6">
                <MetaItem label="사고일" value={report.caseSummary.incidentDate} />
              </div>
              <div className="sm:pl-6">
                <MetaItem label="담당" value="담당 손해사정사" />
              </div>
            </div>

            <div className="border-t border-app-line px-6 py-4">
              <p className="text-label-s font-medium text-bora-ink-4">사고 경위</p>
              <p className="mt-1 text-body font-normal text-bora-ink-2">
                {report.caseSummary.incidentDescription}
              </p>
            </div>

            <div className="mx-6 mb-6 flex flex-col gap-4 rounded-[4px] bg-app-surface-sub px-6 py-[18px]">
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-app-line">
                {totalClaimCount > 0 ? (
                  <>
                    <div
                      className="h-full bg-bora-ok"
                      style={{ width: `${(verifiedCount / totalClaimCount) * 100}%` }}
                    />
                    <div
                      className="h-full bg-bora-warn"
                      style={{ width: `${(insufficientCount / totalClaimCount) * 100}%` }}
                    />
                  </>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-label-s font-medium text-bora-ink-4">근거 확인</p>
                  <p className="text-h3 font-semibold text-bora-ok">{verifiedCount}건</p>
                </div>
                <div>
                  <p className="text-label-s font-medium text-bora-ink-4">판단 불충분</p>
                  <p className="text-h3 font-semibold text-bora-warn">{insufficientCount}건</p>
                </div>
                <div>
                  <p className="text-label-s font-medium text-bora-ink-4">수집 근거</p>
                  <p className="text-h3 font-semibold text-bora-ink">{citedEvidenceIds.length}건</p>
                </div>
              </div>
              <p className="text-[11.5px] font-normal text-bora-ink-3">{aggregateStatusCaption}</p>
            </div>

            {/* SPEC-UI-MIGRATION-001 M4 (REQ-009) — 보험금 지급 비확정성 안내
                문구. 정확한 문구를 그대로 노출해야 하므로 신규 문자열을
                만들지 않고 spec.md REQ-009가 명시하는 텍스트를 그대로
                렌더링한다. */}
            <div className="mx-6 mb-6 rounded-[4px] bg-app-surface-inset px-4 py-3">
              <p className="text-meta font-normal text-bora-ink-3">
                본 리포트는 공개된 판례·약관·법령을 기반으로 한 참고용 AI 리서치 결과입니다. 보험금
                지급 여부나 지급액을 확정하지 않으며, 최종 판단은 담당 손해사정사의 검토가
                필요합니다.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-5 lg:flex-row">
            {/* 좌 컬럼 — 개별 주장 및 근거 검토 + 그 외 검토 항목 패널들 */}
            <div className="flex min-w-0 flex-1 flex-col gap-5 lg:max-w-[824px]">
              <div className="overflow-hidden rounded-[4px] bg-app-surface">
                <div className="border-b border-app-line px-6 py-4">
                  <h2 className="text-h2 font-semibold text-bora-ink">개별 주장 및 근거 검토</h2>
                </div>
                <div className="flex flex-col gap-4 px-6 py-5" data-testid="verified-claims">
                  {report.verifiedClaims.length === 0 ? (
                    <p className="text-body text-bora-ink-3">확인된 주장이 없습니다.</p>
                  ) : null}
                  {report.verifiedClaims.map((claim, index) => {
                    const issueTypes = getClaimIssueTypes(claim, evidenceById);
                    return (
                      <div
                        key={index}
                        id={`claim-${index}`}
                        className={
                          claim.status === "INSUFFICIENT"
                            ? "flex flex-col gap-3 overflow-hidden rounded-[4px] border border-app-line bg-bora-warn-soft"
                            : "flex flex-col gap-3 overflow-hidden rounded-[4px] border border-app-line"
                        }
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
                          <div className="flex items-start gap-2.5">
                            <span
                              aria-hidden="true"
                              className="flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-app-surface-inset text-label-s font-semibold text-bora-ink-3"
                            >
                              {index + 1}
                            </span>
                            <div className="flex flex-col gap-1.5">
                              <p className="text-body font-semibold text-bora-ink">
                                {claim.summary}
                              </p>
                              {issueTypes.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {issueTypes.map((issueType) => (
                                    <Chip key={issueType}>{queryIssueTypeLabel(issueType)}</Chip>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {/* Fix-C(P0): claim.status를 시각적으로 구분되게 노출한다 —
                                INSUFFICIENT가 VERIFIED와 동일하게 보이던 결함(코드 리뷰
                                지적)의 수정. SPEC-PILOT-VISUAL-001 M3(REQ-007)로 공유
                                StatusBadge 컴포넌트로 교체 — data-testid/data-status는
                                그대로 보존한다. */}
                            <StatusBadge
                              status={claim.status}
                              data-testid="claim-status"
                              data-status={claim.status}
                            >
                              {claim.status === "VERIFIED" ? "근거 확인" : "판단 불충분"}
                            </StatusBadge>
                            <span className="text-label-s font-medium whitespace-nowrap text-bora-ink-4">
                              근거 {claim.supportingEvidenceIds.length}건
                            </span>
                          </div>
                        </div>

                        <div className="px-4">
                          <p className="text-label-s font-medium text-bora-ink-4">관련 근거자료</p>
                          <ul className="flex flex-col">
                            {claim.supportingEvidenceIds.map((evidenceId) =>
                              renderEvidenceReference(evidenceId, evidenceById)
                            )}
                          </ul>
                        </div>

                        {claim.counterArguments.length > 0 ? (
                          <div className="border-t border-app-line px-4 py-3">
                            <p className="text-label-s font-medium text-bora-ink-4">
                              예상 반대 논리
                            </p>
                            <ul className="flex flex-col gap-2">
                              {claim.counterArguments.map((counterArgument, counterIndex) => (
                                <li key={counterIndex} className="text-body text-bora-ink-2">
                                  {counterArgument.summary}
                                  {/* Fix-C(P1): counterArgument의 supportingEvidenceIds/
                                      counterEvidenceIds도 claim 자신의 근거자료 목록과
                                      동일한 evidenceById 조회 + sourceUrl 조건부 렌더링
                                      idiom을 재사용해 노출한다(코드 리뷰 지적 — 그동안
                                      summary만 보이고 근거 출처가 UI에서 사라졌었다). */}
                                  {counterArgument.supportingEvidenceIds.length > 0 ? (
                                    <div className="pl-4">
                                      <p className="text-label-s font-medium text-bora-ink-4">
                                        뒷받침 근거
                                      </p>
                                      <ul className="flex flex-col">
                                        {counterArgument.supportingEvidenceIds.map((evidenceId) =>
                                          renderEvidenceReference(evidenceId, evidenceById)
                                        )}
                                      </ul>
                                    </div>
                                  ) : null}
                                  {counterArgument.counterEvidenceIds.length > 0 ? (
                                    <div className="pl-4">
                                      <p className="text-label-s font-medium text-bora-ink-4">
                                        반박 근거
                                      </p>
                                      <ul className="flex flex-col">
                                        {counterArgument.counterEvidenceIds.map((evidenceId) =>
                                          renderEvidenceReference(evidenceId, evidenceById)
                                        )}
                                      </ul>
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {citedEvidenceIds.length === 0 ? (
                    <p data-testid="cited-evidence-empty" className="text-body text-bora-ink-3">
                      인용된 근거자료가 없습니다.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="overflow-hidden rounded-[4px] bg-app-surface">
                <div className="border-b border-app-line px-6 py-4">
                  <h2 className="text-h2 font-semibold text-bora-ink">검토할 담보 목록</h2>
                </div>
                <div className="px-6 py-5" data-testid="review-targets">
                  {/* SPEC-UI-MIGRATION-001 M4 (REQ-010) — 담보 검토 비확정성
                      부제. 정확한 문구를 그대로 노출한다. */}
                  <p className="mb-3 text-body-s text-bora-ink-3">
                    추가 검토가 필요한 담보 항목입니다. 지급 가능 담보를 확정한 목록이 아닙니다.
                  </p>
                  {report.reviewTargets.length > 0 ? (
                    <ul className="flex flex-col gap-2 text-body text-bora-ink-2">
                      {report.reviewTargets.map((reviewTarget, index) => (
                        <li key={index} className="list-inside list-disc">
                          {reviewTarget.description}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-body-s text-bora-ink-3">
                      검토할 담보가 식별되지 않았습니다.
                    </p>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-[4px] bg-app-surface">
                <div className="border-b border-app-line px-6 py-4">
                  <h2 className="text-h2 font-semibold text-bora-ink">추가 필요 자료</h2>
                </div>
                <div className="px-6 py-5" data-testid="missing-materials">
                  {report.missingMaterials.length > 0 ? (
                    <ul className="flex flex-col gap-2 text-body text-bora-ink-2">
                      {report.missingMaterials.map((missingMaterial, index) => (
                        <li key={index} className="list-inside list-disc">
                          {missingMaterial.description}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-body-s text-bora-ink-3">
                      추가로 확보가 필요한 자료가 식별되지 않았습니다.
                    </p>
                  )}
                </div>
              </div>

              {/* Fix-C(P0): report.uncertainty(판단 불충분 사유)가 그동안 어디에도
                  렌더링되지 않던 결함(코드 리뷰 지적)의 수정 — 기존 카드 패턴을
                  그대로 따른다. */}
              <div className="overflow-hidden rounded-[4px] bg-app-surface">
                <div className="border-b border-app-line px-6 py-4">
                  <h2 className="text-h2 font-semibold text-bora-ink">판단 불충분 사유</h2>
                </div>
                <div className="px-6 py-5" data-testid="uncertainty">
                  {report.uncertainty.length > 0 ? (
                    <ul className="flex flex-col gap-2 text-body text-bora-ink-2">
                      {report.uncertainty.map((reason, index) => (
                        <li key={index} className="list-inside list-disc">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-body-s text-bora-ink-3">
                      판단 불충분으로 처리된 사유가 없습니다.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 우 레일 — 검토 항목 / 수집 근거 유형 / Notice 활용 유의
                (design.md §4 화면 02, REQ-014 — 신규 I/O 없이 기존 데이터에서만
                파생, plan-auditor 블로커 4 대응으로 구현 위치는 재량) */}
            <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[300px]">
              <div className="overflow-hidden rounded-[4px] bg-app-surface">
                <div className="border-b border-app-line px-4 py-3">
                  <h3 className="text-h3 font-semibold text-bora-ink">검토 항목</h3>
                </div>
                <div className="px-4 py-3">
                  {report.verifiedClaims.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {report.verifiedClaims.map((claim, index) => (
                        <li key={index}>
                          <a
                            href={`#claim-${index}`}
                            className="block truncate text-body-s font-medium text-bora-ink-2 hover:text-bora-accent"
                          >
                            {index + 1}. {claim.summary}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-body-s text-bora-ink-3">검토할 주장이 없습니다.</p>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-[4px] bg-app-surface">
                <div className="border-b border-app-line px-4 py-3">
                  <h3 className="text-h3 font-semibold text-bora-ink">수집 근거 유형</h3>
                </div>
                <div className="flex flex-col gap-2.5 px-4 py-3">
                  {evidenceTypeCounts.length > 0 ? (
                    evidenceTypeCounts.map(({ type, count }) => (
                      <div key={type} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-body-s text-bora-ink-3">
                          <span>{evidenceTypeLabel(type)}</span>
                          <span>{count}건</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-line">
                          <div
                            className="h-full bg-bora-accent"
                            style={{
                              width:
                                maxEvidenceTypeCount > 0
                                  ? `${(count / maxEvidenceTypeCount) * 100}%`
                                  : "0%",
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-body-s text-bora-ink-3">수집된 근거자료가 없습니다.</p>
                  )}
                </div>
              </div>

              <Notice title="활용 유의">{aggregateStatusCaption}</Notice>
            </aside>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 font-semibold text-bora-ink">사건 요약</h1>
          <p className="text-body text-bora-ink-3">아직 생성된 리서치 리포트가 없습니다.</p>
        </div>
      )}

      {report && reportId ? (
        // SPEC-PILOT-VISUAL-001 M2 (REQ-006) — 사이드바 "전문가 피드백" nav
        // 링크의 페이지 내 앵커 대상. 순수 프레젠테이션 목적이며 서버
        // write-path·API·스키마에는 어떤 영향도 주지 않는다.
        // SPEC-PILOT-VISUAL-001 M6 — design.md §4 화면 03 "최상위 컨테이너"에
        // id="expert-feedback"를 부여한다(REQ-006). FeedbackForm이 자체
        // 폼 컬럼/우 레일 2컬럼 표면 스타일을 제공하므로, 여기서는 shadcn
        // Card로 이중 박싱하지 않고 얇은 섹션 타이틀 + 래퍼만 둔다.
        <div id="expert-feedback" className="flex flex-col gap-4">
          <h1 className="text-h2 font-semibold text-bora-ink">전문가 피드백</h1>
          <FeedbackForm
            reportId={reportId}
            verifiedClaims={report.verifiedClaims}
            citedEvidenceIds={citedEvidenceIds}
            evidenceById={evidenceById}
            action={submitReportFeedback}
          />
        </div>
      ) : null}
    </div>
  );
}
