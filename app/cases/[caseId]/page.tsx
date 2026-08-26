import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentSession } from "@/lib/auth/session";
import { getCaseForOwner } from "@/lib/cases/get-case-for-owner";
import { getDb } from "@/lib/db/client";
import { evidence as evidenceTable } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitFeedback } from "./actions";

export const metadata: Metadata = {
  title: "사건 상세",
};

interface CaseDetailPageProps {
  params: Promise<{ caseId: string }>;
}

interface EvidenceDisplay {
  title: string;
  sourceUrl: string | null;
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

  const { report, id: ownerCaseId } = caseWithReport;

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
      })
      .from(evidenceTable);
    for (const row of rows) {
      evidenceById.set(row.id, { title: row.title, sourceUrl: row.sourceUrl });
    }
  }

  async function handleFeedbackSubmit(formData: FormData) {
    "use server";
    const content = String(formData.get("content") ?? "");
    await submitFeedback(ownerCaseId, content);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-xl font-semibold">사건 상세</h1>

      {report ? (
        <div data-testid="case-report">
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
              {report.verifiedClaims.map((claim, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-1 rounded-lg border border-input p-3 text-sm"
                >
                  <p className="font-medium">{claim.summary}</p>
                  <div>
                    <p className="text-muted-foreground">관련 근거자료</p>
                    <ul className="list-inside list-disc">
                      {claim.supportingEvidenceIds.map((evidenceId) => {
                        const item = evidenceById.get(evidenceId);
                        return (
                          <li key={evidenceId}>
                            {item?.title ?? evidenceId}
                            {item?.sourceUrl ? (
                              <span className="text-muted-foreground"> ({item.sourceUrl})</span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  {claim.counterArguments.length > 0 ? (
                    <div>
                      <p className="text-muted-foreground">예상 반대 논리</p>
                      <ul className="list-inside list-disc">
                        {claim.counterArguments.map((counterArgument, counterIndex) => (
                          <li key={counterIndex}>{counterArgument.summary}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
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
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">아직 생성된 리서치 리포트가 없습니다.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>전문가 피드백</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={handleFeedbackSubmit}
            className="flex flex-col gap-3"
            data-testid="feedback-form"
          >
            <Label htmlFor="feedback-content">의견</Label>
            <Textarea
              id="feedback-content"
              name="content"
              required
              data-testid="feedback-content"
            />
            <Button type="submit" className="self-start" data-testid="feedback-submit">
              제출
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
