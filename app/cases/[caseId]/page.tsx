import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentSession } from "@/lib/auth/session";
import { getCaseForOwner } from "@/lib/cases/get-case-for-owner";
import { getDb } from "@/lib/db/client";
import { evidence as evidenceTable } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EvidenceItem } from "@/components/evidence-item";
import type { EvidenceType, QueryIssueType } from "@/lib/pipeline/types";
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

  // SPEC-PILOT-UX-001 REQ-PILOT-UX-004(§A decision 2) — 요약 배너 집계는
  // 이미 조회된 report.verifiedClaims를 inline reduce/filter로 계산한다.
  // ResearchReport 타입 계약(SPEC-RESEARCH-001)은 건드리지 않는다.
  const verifiedCount = report
    ? report.verifiedClaims.filter((claim) => claim.status === "VERIFIED").length
    : 0;
  const totalClaimCount = report?.verifiedClaims.length ?? 0;
  const insufficientCount = totalClaimCount - verifiedCount;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-xl font-semibold">사건 상세</h1>

      {report ? (
        <div data-testid="case-report">
          <Card data-testid="summary-banner">
            <CardHeader>
              <CardTitle>요약</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p>진단명: {report.caseSummary.diagnosisName}</p>
              <p>장해 부위: {report.caseSummary.disabilityBodyPart}</p>
              <p>
                전체 검증 상태: {totalClaimCount}건 중 {verifiedCount}건 근거 확인,{" "}
                {insufficientCount}건 판단 불충분
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>사건 요약</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p>진단명: {report.caseSummary.diagnosisName}</p>
              <p>장해 부위: {report.caseSummary.disabilityBodyPart}</p>
              <p>경위: {report.caseSummary.incidentDescription}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>검토할 담보 목록</CardTitle>
            </CardHeader>
            <CardContent data-testid="review-targets">
              {report.reviewTargets.length > 0 ? (
                <ul className="list-inside list-disc text-sm">
                  {report.reviewTargets.map((reviewTarget, index) => (
                    <li key={index}>{reviewTarget.description}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">검토할 담보가 식별되지 않았습니다.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>추가로 검토할 담보 · 근거자료 · 반대 논리</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4" data-testid="verified-claims">
              {report.verifiedClaims.length === 0 ? (
                <p className="text-sm text-muted-foreground">확인된 주장이 없습니다.</p>
              ) : null}
              {report.verifiedClaims.map((claim, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-1 rounded-lg border border-input p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{claim.summary}</p>
                    {/* Fix-C(P0): claim.status를 시각적으로 구분되게 노출한다 —
                        INSUFFICIENT가 VERIFIED와 동일하게 보이던 결함(코드 리뷰
                        지적)의 수정. SPEC-PILOT-VISUAL-001 M3(REQ-007)로 공유
                        StatusBadge 컴포넌트로 교체 — data-testid/data-status는
                        그대로 보존한다. */}
                    <StatusBadge status={claim.status} data-testid="claim-status" data-status={claim.status}>
                      {claim.status === "VERIFIED" ? "근거 확인" : "판단 불충분"}
                    </StatusBadge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">관련 근거자료</p>
                    <ul className="list-inside list-disc">
                      {claim.supportingEvidenceIds.map((evidenceId) =>
                        renderEvidenceReference(evidenceId, evidenceById)
                      )}
                    </ul>
                  </div>
                  {claim.counterArguments.length > 0 ? (
                    <div>
                      <p className="text-muted-foreground">예상 반대 논리</p>
                      <ul className="flex flex-col gap-2">
                        {claim.counterArguments.map((counterArgument, counterIndex) => (
                          <li key={counterIndex} className="list-inside list-disc">
                            {counterArgument.summary}
                            {/* Fix-C(P1): counterArgument의 supportingEvidenceIds/
                                counterEvidenceIds도 claim 자신의 근거자료 목록과
                                동일한 evidenceById 조회 + sourceUrl 조건부 렌더링
                                idiom을 재사용해 노출한다(코드 리뷰 지적 — 그동안
                                summary만 보이고 근거 출처가 UI에서 사라졌었다). */}
                            {counterArgument.supportingEvidenceIds.length > 0 ? (
                              <div className="pl-4">
                                <p className="text-muted-foreground">뒷받침 근거</p>
                                <ul className="list-inside list-disc">
                                  {counterArgument.supportingEvidenceIds.map((evidenceId) =>
                                    renderEvidenceReference(evidenceId, evidenceById)
                                  )}
                                </ul>
                              </div>
                            ) : null}
                            {counterArgument.counterEvidenceIds.length > 0 ? (
                              <div className="pl-4">
                                <p className="text-muted-foreground">반박 근거</p>
                                <ul className="list-inside list-disc">
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
              ))}
              {citedEvidenceIds.length === 0 ? (
                <p data-testid="cited-evidence-empty" className="text-sm text-muted-foreground">
                  인용된 근거자료가 없습니다.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>추가 필요 자료</CardTitle>
            </CardHeader>
            <CardContent data-testid="missing-materials">
              {report.missingMaterials.length > 0 ? (
                <ul className="list-inside list-disc text-sm">
                  {report.missingMaterials.map((missingMaterial, index) => (
                    <li key={index}>{missingMaterial.description}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  추가로 확보가 필요한 자료가 식별되지 않았습니다.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Fix-C(P0): report.uncertainty(판단 불충분 사유)가 그동안 어디에도
              렌더링되지 않던 결함(코드 리뷰 지적)의 수정 — 기존 카드 패턴을
              그대로 따른다. */}
          <Card>
            <CardHeader>
              <CardTitle>판단 불충분 사유</CardTitle>
            </CardHeader>
            <CardContent data-testid="uncertainty">
              {report.uncertainty.length > 0 ? (
                <ul className="list-inside list-disc text-sm">
                  {report.uncertainty.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  판단 불충분으로 처리된 사유가 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">아직 생성된 리서치 리포트가 없습니다.</p>
      )}

      {report && reportId ? (
        // SPEC-PILOT-VISUAL-001 M2 (REQ-006) — 사이드바 "전문가 피드백" nav
        // 링크의 페이지 내 앵커 대상. 순수 프레젠테이션 목적이며 서버
        // write-path·API·스키마에는 어떤 영향도 주지 않는다.
        <Card id="expert-feedback">
          <CardHeader>
            <CardTitle>전문가 피드백</CardTitle>
          </CardHeader>
          <CardContent>
            <FeedbackForm
              reportId={reportId}
              verifiedClaims={report.verifiedClaims}
              citedEvidenceIds={citedEvidenceIds}
              evidenceById={evidenceById}
              action={submitReportFeedback}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
