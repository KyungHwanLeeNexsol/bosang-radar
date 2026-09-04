"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { evidenceTypeLabel, queryIssueTypeLabel } from "@/lib/pipeline/labels";
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
//
// SPEC-PILOT-VISUAL-001 M6(REQ-016~018) — design.md §4 화면 03 구조로
// 재스타일. 폼 컬럼(번호 매김 5개 섹션) + 우 레일(Notice/작성 진행률/제출
// 상태)의 수평 2컬럼 레이아웃을 이 컴포넌트 내부에서 직접 구성한다 — 상위
// page.tsx의 `id="expert-feedback"` 래퍼는 이 폼을 감싸는 얇은 컨테이너로만
// 남는다. native `<select>`, 동적 missedIssues 배열 UI, single-flight 가드,
// 필드별 오류 렌더링 등 모든 기능/상태 로직은 전혀 변경하지 않는다.

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
    <p key={message} className="text-sm text-bora-danger">
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

const SELECT_CLASSNAME =
  "h-9 w-full rounded-[4px] border border-app-line bg-app-surface px-3 text-body text-bora-ink";
const TEXTAREA_CLASSNAME = "rounded-[4px] border-app-line bg-app-surface text-body text-bora-ink";

// design.md §3 "번호 매김 섹션" 헤더 패턴 — 번호 배지 + 타이틀 + 선택적
// "필수" Chip. §4 화면 03의 5개 번호 섹션이 공통으로 사용한다.
function SectionHeader({
  number,
  title,
  required,
}: {
  number: number;
  title: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-app-line px-6 py-4">
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-app-surface-inset text-label-s font-semibold text-bora-ink-3"
      >
        {number}
      </span>
      <h2 className="text-h2 font-semibold text-bora-ink">{title}</h2>
      {required ? <Chip className="bg-bora-danger-soft text-bora-danger">필수</Chip> : null}
    </div>
  );
}

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

  // SPEC-PILOT-VISUAL-001 M6(design.md §4 화면 03 "작성 진행률") — 신규
  // 데이터 없이 현재 폼 상태(각 섹션의 입력 여부)에서만 파생한다. claim/
  // evidence 섹션은 그 섹션이 실제로 렌더링될 때만 진행률 분모에 포함한다.
  const sectionCompletionFlags = [
    overallRating !== "",
    missedIssues.length > 0,
    verifiedClaims.length > 0
      ? Object.values(claimVerdicts).some((verdict) => verdict !== "")
      : null,
    citedEvidenceIds.length > 0
      ? Object.values(evidenceVerdicts).some((verdict) => verdict !== "")
      : null,
    outcomeDescription.trim() !== "" || outcomeConfirmedAt.trim() !== "",
  ].filter((flag): flag is boolean => flag !== null);
  const completedSectionCount = sectionCompletionFlags.filter(Boolean).length;
  const totalSectionCount = sectionCompletionFlags.length;
  const progressPercent =
    totalSectionCount > 0 ? Math.round((completedSectionCount / totalSectionCount) * 100) : 0;

  const formLevelFieldErrors = fieldErrors._form;
  const hasFormLevelError = (formLevelFieldErrors?.length ?? 0) > 0 || formError !== null;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 lg:flex-row"
      data-testid="feedback-form"
    >
      {/* 폼 컬럼 — design.md §4 화면 03 "폼 컬럼(w804)": Context Bar + 5개
          번호 매김 섹션 + Form Footer(제출 버튼만, 임시 저장 생략 — REQ-018) */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-[804px]">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[4px] bg-app-surface-sub px-4 py-2.5 text-body-s text-bora-ink-3">
          <span>리포트 ID: {reportId}</span>
          <span>
            확인된 주장 {verifiedClaims.length}건 · 인용 근거 {citedEvidenceIds.length}건
          </span>
        </div>

        <div
          className="overflow-hidden rounded-[4px] bg-app-surface"
          data-testid="feedback-section"
        >
          <SectionHeader number={1} title="전체 평가" required />
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="feedback-overall-rating"
                className="text-body-s font-semibold text-bora-ink-2"
              >
                전체 평가
              </Label>
              <select
                id="feedback-overall-rating"
                data-testid="feedback-overall-rating"
                required
                value={overallRating}
                onChange={(event) => setOverallRating(event.target.value)}
                className={SELECT_CLASSNAME}
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
              <Label
                htmlFor="feedback-overall-comment"
                className="text-body-s font-semibold text-bora-ink-2"
              >
                전체 코멘트 (선택)
              </Label>
              <Textarea
                id="feedback-overall-comment"
                data-testid="feedback-overall-comment"
                value={overallComment}
                onChange={(event) => setOverallComment(event.target.value)}
                className={TEXTAREA_CLASSNAME}
              />
              {fieldErrorMessages(fieldErrors, "overallComment")}
            </div>
          </div>
        </div>

        <div
          className="overflow-hidden rounded-[4px] bg-app-surface"
          data-testid="feedback-section"
        >
          <SectionHeader number={2} title="누락된 쟁점" />
          <div className="flex flex-col gap-3 px-6 py-5">
            {missedIssues.map((row, index) => (
              <div
                key={index}
                className="flex flex-col gap-2.5 rounded-[4px] border border-app-line bg-app-surface-sub p-3"
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
                  className={SELECT_CLASSNAME}
                >
                  {QUERY_ISSUE_TYPES.map((issueType) => (
                    <option key={issueType} value={issueType}>
                      {queryIssueTypeLabel(issueType)}
                    </option>
                  ))}
                </select>
                <Textarea
                  aria-label="누락 쟁점 설명"
                  value={row.description}
                  onChange={(event) =>
                    setMissedIssues((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, description: event.target.value } : r
                      )
                    )
                  }
                  className={TEXTAREA_CLASSNAME}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start rounded-[4px]"
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
              className="self-start rounded-[4px]"
              onClick={addMissedIssue}
              data-testid="feedback-missed-issue-add"
            >
              누락 쟁점 추가
            </Button>
            {fieldErrorMessages(fieldErrors, "missedIssues")}
          </div>
        </div>

        {verifiedClaims.length > 0 ? (
          <div
            className="overflow-hidden rounded-[4px] bg-app-surface"
            data-testid="feedback-section"
          >
            <SectionHeader number={3} title="개별 주장 평가" />
            <div className="flex flex-col gap-3 px-6 py-5">
              {verifiedClaims.map((claim, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2.5 rounded-[4px] border border-app-line p-3"
                  data-testid="feedback-claim-verdict"
                >
                  <p className="text-body-s text-bora-ink-3">{claim.summary}</p>
                  <select
                    aria-label={`주장 ${index + 1} 평가`}
                    value={claimVerdicts[index] ?? ""}
                    onChange={(event) =>
                      setClaimVerdicts((verdicts) => ({ ...verdicts, [index]: event.target.value }))
                    }
                    className={SELECT_CLASSNAME}
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
                    className={TEXTAREA_CLASSNAME}
                  />
                </div>
              ))}
              {fieldErrorMessages(fieldErrors, "claimAssessments")}
            </div>
          </div>
        ) : null}

        {citedEvidenceIds.length > 0 ? (
          <div
            className="overflow-hidden rounded-[4px] bg-app-surface"
            data-testid="feedback-section"
          >
            <SectionHeader number={4} title="개별 근거자료 평가" />
            <div className="overflow-x-auto px-6 py-5">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-app-line text-label-s font-medium text-bora-ink-4">
                    <th className="py-2 pr-4 font-medium">근거자료</th>
                    <th className="py-2 font-medium">평가</th>
                  </tr>
                </thead>
                <tbody>
                  {citedEvidenceIds.map((evidenceId) => {
                    const item = evidenceById.get(evidenceId);
                    return (
                      <tr
                        key={evidenceId}
                        data-testid="feedback-evidence-verdict"
                        className="border-b border-app-line last:border-b-0"
                      >
                        <td className="py-3 pr-4 align-top text-body-s text-bora-ink-3">
                          {item?.title ?? evidenceId}
                          {item ? (
                            <span className="text-bora-ink-4">
                              {" "}
                              [{evidenceTypeLabel(item.evidenceType)}
                              {item.issueTypes.length > 0
                                ? `, ${item.issueTypes.map(queryIssueTypeLabel).join(", ")}`
                                : ""}
                              ]
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 align-top">
                          <select
                            aria-label={`근거자료 ${evidenceId} 평가`}
                            value={evidenceVerdicts[evidenceId] ?? ""}
                            onChange={(event) =>
                              setEvidenceVerdicts((verdicts) => ({
                                ...verdicts,
                                [evidenceId]: event.target.value,
                              }))
                            }
                            className={`${SELECT_CLASSNAME} max-w-52`}
                          >
                            <option value="">평가 안 함</option>
                            {EVIDENCE_VERDICTS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {fieldErrorMessages(fieldErrors, "evidenceAssessments")}
            </div>
          </div>
        ) : null}

        <div
          className="overflow-hidden rounded-[4px] bg-app-surface"
          data-testid="feedback-section"
        >
          <SectionHeader number={5} title="실제 결과 (선택)" />
          <div className="flex flex-col gap-3 px-6 py-5">
            <Textarea
              aria-label="실제 결과 설명"
              data-testid="feedback-outcome-description"
              placeholder="실제 결과 설명"
              value={outcomeDescription}
              onChange={(event) => setOutcomeDescription(event.target.value)}
              className={TEXTAREA_CLASSNAME}
            />
            <Input
              type="date"
              aria-label="실제 결과 확인일"
              data-testid="feedback-outcome-confirmed-at"
              value={outcomeConfirmedAt}
              onChange={(event) => setOutcomeConfirmedAt(event.target.value)}
              className="w-fit rounded-[4px] border-app-line bg-app-surface text-body text-bora-ink"
            />
            {fieldErrorMessages(fieldErrors, "outcome")}
          </div>
        </div>

        {/* Form Footer — design.md §4 화면 03: 우측 Actions. "임시 저장"은
            REQ-018에 따라 생략(초안 저장 인프라 없음), "제출" 버튼만 유지(AC-017).
            개인정보 Notice는 우 레일에 배치한다(§E 잔여 위험 참고). */}
        <div className="flex items-center justify-end rounded-[4px] bg-app-surface-sub px-6 py-4">
          <Button
            type="submit"
            className="rounded-[4px] bg-bora-accent px-5 text-white hover:bg-bora-accent-deep"
            data-testid="feedback-submit"
            disabled={isSubmitting || overallRating === "" || submissionSucceeded}
          >
            제출
          </Button>
        </div>
      </div>

      {/* 우 레일 — design.md §4 화면 03 "우 레일(w320)": Notice 개인정보(M3
          재사용, 문구 무변경) + 작성 진행률(신규 데이터 없이 현재 폼 상태에서만
          파생) + 제출 상태(기존 isSubmitting/필드 오류/feedback-success 조건부
          UI의 재스타일 — 신규 상태 아님, 한 번에 해당하는 하나만 렌더링) */}
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px]">
        <Notice title="개인정보 비식별 안내">
          비식별 요약만 입력하세요. 실명, 상세 주소, 주민등록번호, 전화번호, 의료·보험 원본 문서
          내용은 입력하지 마세요.
        </Notice>

        <div className="overflow-hidden rounded-[4px] bg-app-surface">
          <div className="border-b border-app-line px-4 py-3">
            <h3 className="text-h3 font-semibold text-bora-ink">작성 진행률</h3>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-line">
              <div className="h-full bg-bora-accent" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="text-body-s text-bora-ink-3">
              {completedSectionCount}/{totalSectionCount} 섹션 작성됨
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[4px] bg-app-surface">
          <div className="border-b border-app-line px-4 py-3">
            <h3 className="text-h3 font-semibold text-bora-ink">제출 상태</h3>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3">
            {submissionSucceeded ? (
              <p
                data-testid="feedback-success"
                role="status"
                className="text-body-s font-medium text-bora-ok"
              >
                피드백이 제출되었습니다. 감사합니다.
              </p>
            ) : hasFormLevelError ? (
              <div className="flex flex-col gap-1">
                {fieldErrorMessages(fieldErrors, "_form")}
                {formError ? <p className="text-sm text-bora-danger">{formError}</p> : null}
              </div>
            ) : isSubmitting ? (
              <span role="status" aria-live="polite" className="text-body-s text-bora-ink-3">
                처리 중입니다. 잠시만 기다려 주세요...
              </span>
            ) : (
              <p className="text-body-s text-bora-ink-3">모든 필드를 입력한 뒤 제출해 주세요.</p>
            )}
          </div>
        </div>
      </aside>
    </form>
  );
}
