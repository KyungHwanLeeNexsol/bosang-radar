"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QUERY_ISSUE_TYPES,
  type EvidenceType,
  type QueryIssueType,
  type VerifiedClaim,
} from "@/lib/pipeline/types";
import type { SubmitFeedbackResult } from "@/lib/feedback/submit-feedback";

// 리포트 단위 구조화 피드백 입력 폼(REQ-FEEDBACK-014). 옛 자유 텍스트
// feedback-content/feedback-submit 필드를 완전히 대체한다(REQ-FEEDBACK-015).
// "add a missed issue"에 클라이언트 배열 상태가 필요해 Client Component로
// 작성한다 — Server Component만으로는 전체 페이지 재요청 없이 지원 불가.

interface EvidenceDisplay {
  title: string;
  sourceUrl: string | null;
  evidenceType: EvidenceType;
  issueTypes: QueryIssueType[];
}

// submit-feedback.ts의 toFieldErrors가 실제로 생성하는 최상위 키(issue.path[0]
// 기준, 중첩 경로 아님) — SPEC-PILOT-UX-001 REQ-PILOT-UX-010.
function fieldErrorMessages(fieldErrors: Record<string, string[]>, key: string) {
  return fieldErrors[key]?.map((message) => (
    <p key={message} className="text-sm text-destructive">
      {message}
    </p>
  ));
}

interface MissedIssueRow {
  issueType: QueryIssueType;
  description: string;
}

interface FeedbackFormProps {
  reportId: string;
  verifiedClaims: VerifiedClaim[];
  citedEvidenceIds: string[];
  evidenceById: Map<string, EvidenceDisplay>;
  action: (reportId: string, rawPayload: unknown) => Promise<SubmitFeedbackResult>;
}

const OVERALL_RATINGS = [
  { value: "ACCURATE", label: "정확함" },
  { value: "PARTIALLY_ACCURATE", label: "부분적으로 정확함" },
  { value: "INACCURATE", label: "부정확함" },
] as const;

const CLAIM_VERDICTS = [
  { value: "CORRECT", label: "타당함" },
  { value: "INCORRECT", label: "타당하지 않음" },
  { value: "NEEDS_MORE_EVIDENCE", label: "추가 근거 필요" },
] as const;

const EVIDENCE_VERDICTS = [
  { value: "USEFUL", label: "유용함" },
  { value: "WEAK", label: "근거로서 약함" },
  { value: "IRRELEVANT", label: "무관함" },
] as const;

export function FeedbackForm({
  reportId,
  verifiedClaims,
  citedEvidenceIds,
  evidenceById,
  action,
}: FeedbackFormProps) {
  const [overallRating, setOverallRating] = useState<string>("");
  const [overallComment, setOverallComment] = useState("");
  const [missedIssues, setMissedIssues] = useState<MissedIssueRow[]>([]);
  const [claimVerdicts, setClaimVerdicts] = useState<Record<number, string>>({});
  const [claimReasonings, setClaimReasonings] = useState<Record<number, string>>({});
  const [evidenceVerdicts, setEvidenceVerdicts] = useState<Record<string, string>>({});
  const [outcomeDescription, setOutcomeDescription] = useState("");
  const [outcomeConfirmedAt, setOutcomeConfirmedAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submissionSucceeded, setSubmissionSucceeded] = useState(false);
  // SPEC-PILOT-UX-001 REQ-PILOT-UX-007(§A decision 1) — 클라이언트 단일
  // 흐름(single-flight) 가드. handleSubmit 시작 시 동기적으로 설정되며,
  // 검증 실패(REQ-PILOT-UX-010) 또는 action 예외/reject(REQ-PILOT-UX-011)
  // 시에만 리셋된다 — 성공 시에는 유지되어 같은 마운트 인스턴스의 재제출을
  // 계속 막는다(REQ-PILOT-UX-008/009).
  const submitGuardRef = useRef(false);

  function addMissedIssue() {
    setMissedIssues((rows) => [...rows, { issueType: QUERY_ISSUE_TYPES[0], description: "" }]);
  }

  function removeMissedIssue(index: number) {
    setMissedIssues((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // REQ-PILOT-UX-007 — 가드가 이미 활성 상태(진행 중 또는 성공 후 유지)면
    // 새 action 호출 없이 즉시 반환한다.
    if (submitGuardRef.current) {
      return;
    }
    submitGuardRef.current = true;
    setFormError(null);
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const payload = {
        overallRating,
        overallComment: overallComment.trim() === "" ? undefined : overallComment,
        missedIssues: missedIssues.map((row) => ({
          issueType: row.issueType,
          description: row.description.trim() === "" ? undefined : row.description,
        })),
        claimAssessments: Object.entries(claimVerdicts)
          .filter(([, verdict]) => verdict !== "")
          .map(([claimIndex, verdict]) => ({
            claimIndex: Number(claimIndex),
            verdict,
            correctedReasoning:
              claimReasonings[Number(claimIndex)]?.trim() === ""
                ? undefined
                : claimReasonings[Number(claimIndex)],
          })),
        evidenceAssessments: Object.entries(evidenceVerdicts)
          .filter(([, verdict]) => verdict !== "")
          .map(([evidenceId, verdict]) => ({ evidenceId, verdict })),
        outcome:
          outcomeDescription.trim() === "" && outcomeConfirmedAt.trim() === ""
            ? undefined
            : { description: outcomeDescription, confirmedAt: outcomeConfirmedAt },
      };

      const result = await action(reportId, payload);
      if (result.success) {
        // 성공 — 가드를 유지해 같은 마운트 인스턴스의 재제출을 계속 막는다
        // (REQ-PILOT-UX-002 결의 패턴과 동일, REQ-PILOT-UX-008/009).
        setSubmissionSucceeded(true);
      } else {
        // 검증 실패 — 가드를 리셋해 수정 후 재제출을 허용한다(REQ-PILOT-UX-010).
        submitGuardRef.current = false;
        setFieldErrors(result.fieldErrors);
      }
    } catch {
      // action 예외/reject — 가드를 리셋하고 폼-레벨 오류를 표시한다.
      // unhandled promise rejection으로 전파되지 않는다(REQ-PILOT-UX-011).
      submitGuardRef.current = false;
      setFormError("네트워크 오류로 요청을 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="feedback-form">
      <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        비식별 요약만 입력하세요. 실명, 상세 주소, 주민등록번호, 전화번호, 의료·보험 원본 문서
        내용은 입력하지 마세요.
      </p>

      <div className="flex flex-col gap-4 border-t pt-4" data-testid="feedback-section">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feedback-overall-rating">전체 평가</Label>
          <select
            id="feedback-overall-rating"
            data-testid="feedback-overall-rating"
            required
            value={overallRating}
            onChange={(event) => setOverallRating(event.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="" disabled>
              선택하세요
            </option>
            {OVERALL_RATINGS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrorMessages(fieldErrors, "overallRating")}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feedback-overall-comment">전체 코멘트 (선택)</Label>
          <Textarea
            id="feedback-overall-comment"
            data-testid="feedback-overall-comment"
            value={overallComment}
            onChange={(event) => setOverallComment(event.target.value)}
          />
          {fieldErrorMessages(fieldErrors, "overallComment")}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4" data-testid="feedback-section">
        <p className="text-sm font-medium">누락된 쟁점</p>
        {missedIssues.map((row, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-input p-2"
            data-testid="feedback-missed-issue-row"
          >
            <select
              aria-label="누락 쟁점 유형"
              value={row.issueType}
              onChange={(event) =>
                setMissedIssues((rows) =>
                  rows.map((r, i) =>
                    i === index ? { ...r, issueType: event.target.value as QueryIssueType } : r
                  )
                )
              }
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {QUERY_ISSUE_TYPES.map((issueType) => (
                <option key={issueType} value={issueType}>
                  {issueType}
                </option>
              ))}
            </select>
            <Textarea
              aria-label="누락 쟁점 설명"
              value={row.description}
              onChange={(event) =>
                setMissedIssues((rows) =>
                  rows.map((r, i) => (i === index ? { ...r, description: event.target.value } : r))
                )
              }
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => removeMissedIssue(index)}
              data-testid="feedback-missed-issue-remove"
            >
              제거
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={addMissedIssue}
          data-testid="feedback-missed-issue-add"
        >
          누락 쟁점 추가
        </Button>
        {fieldErrorMessages(fieldErrors, "missedIssues")}
      </div>

      {verifiedClaims.length > 0 ? (
        <div className="flex flex-col gap-2 border-t pt-4" data-testid="feedback-section">
          <p className="text-sm font-medium">개별 주장 평가</p>
          {verifiedClaims.map((claim, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-lg border border-input p-2"
              data-testid="feedback-claim-verdict"
            >
              <p className="text-sm text-muted-foreground">{claim.summary}</p>
              <select
                aria-label={`주장 ${index + 1} 평가`}
                value={claimVerdicts[index] ?? ""}
                onChange={(event) =>
                  setClaimVerdicts((verdicts) => ({ ...verdicts, [index]: event.target.value }))
                }
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="">평가 안 함</option>
                {CLAIM_VERDICTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Textarea
                aria-label={`주장 ${index + 1} 코멘트`}
                placeholder="정정 의견 (선택)"
                value={claimReasonings[index] ?? ""}
                onChange={(event) =>
                  setClaimReasonings((reasonings) => ({
                    ...reasonings,
                    [index]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
          {fieldErrorMessages(fieldErrors, "claimAssessments")}
        </div>
      ) : null}

      {citedEvidenceIds.length > 0 ? (
        <div className="flex flex-col gap-2 border-t pt-4" data-testid="feedback-section">
          <p className="text-sm font-medium">개별 근거자료 평가</p>
          {citedEvidenceIds.map((evidenceId) => (
            <div
              key={evidenceId}
              className="flex flex-col gap-2 rounded-lg border border-input p-2"
              data-testid="feedback-evidence-verdict"
            >
              <p className="text-sm text-muted-foreground">
                {evidenceById.get(evidenceId)?.title ?? evidenceId}
                {(() => {
                  const item = evidenceById.get(evidenceId);
                  return item ? (
                    <span className="text-muted-foreground">
                      {" "}
                      [{item.evidenceType}
                      {item.issueTypes.length > 0 ? `, ${item.issueTypes.join(", ")}` : ""}]
                    </span>
                  ) : null;
                })()}
              </p>
              <select
                aria-label={`근거자료 ${evidenceId} 평가`}
                value={evidenceVerdicts[evidenceId] ?? ""}
                onChange={(event) =>
                  setEvidenceVerdicts((verdicts) => ({
                    ...verdicts,
                    [evidenceId]: event.target.value,
                  }))
                }
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="">평가 안 함</option>
                {EVIDENCE_VERDICTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {fieldErrorMessages(fieldErrors, "evidenceAssessments")}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5 border-t pt-4" data-testid="feedback-section">
        <p className="text-sm font-medium">실제 결과 (선택)</p>
        <Textarea
          aria-label="실제 결과 설명"
          data-testid="feedback-outcome-description"
          placeholder="실제 결과 설명"
          value={outcomeDescription}
          onChange={(event) => setOutcomeDescription(event.target.value)}
        />
        <Input
          type="date"
          aria-label="실제 결과 확인일"
          data-testid="feedback-outcome-confirmed-at"
          value={outcomeConfirmedAt}
          onChange={(event) => setOutcomeConfirmedAt(event.target.value)}
        />
        {fieldErrorMessages(fieldErrors, "outcome")}
      </div>

      {fieldErrorMessages(fieldErrors, "_form")}
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      {submissionSucceeded ? (
        <p data-testid="feedback-success" className="text-sm text-secondary-foreground">
          피드백이 제출되었습니다. 감사합니다.
        </p>
      ) : null}

      <Button
        type="submit"
        className="self-start"
        data-testid="feedback-submit"
        disabled={isSubmitting || overallRating === "" || submissionSucceeded}
      >
        제출
      </Button>
    </form>
  );
}
