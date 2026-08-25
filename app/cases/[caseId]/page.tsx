import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentSession } from "@/lib/auth/session";
import { getCaseForOwner } from "@/lib/cases/get-case-for-owner";
import seedEvidence from "@/db/seed/evidence.json";
import type { EvidenceCandidate } from "@/lib/pipeline/types";
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

const evidenceById = new Map<string, EvidenceCandidate>(
  (seedEvidence as EvidenceCandidate[]).map((evidence) => [evidence.id, evidence])
);

// bare UI — 사건 상세 + 리서치 리포트 뷰(M5, design.md §3). owner_user_id
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
              <CardTitle>추가로 검토할 담보 · 근거자료 · 반대 논리</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {report.claims.map((claim, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-1 rounded-lg border border-input p-3 text-sm"
                >
                  <p className="font-medium">{claim.summary}</p>
                  <div>
                    <p className="text-muted-foreground">관련 근거자료</p>
                    <ul className="list-inside list-disc">
                      {claim.supportingEvidenceIds.map((evidenceId) => (
                        <li key={evidenceId}>
                          {evidenceById.get(evidenceId)?.title ?? evidenceId}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {claim.counterArguments.length > 0 ? (
                    <div>
                      <p className="text-muted-foreground">예상 반대 논리</p>
                      <ul className="list-inside list-disc">
                        {claim.counterArguments.map((counterArgument) => (
                          <li key={counterArgument}>{counterArgument}</li>
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
            <CardContent>
              <p className="text-sm text-muted-foreground">
                추가 확보 자료 식별은 파이프라인 고도화 이후 후속 SPEC에서 지원할 예정입니다.
              </p>
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
