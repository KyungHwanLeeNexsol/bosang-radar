"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2, Lock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
// 남는다.
//
// Round5(외부 재검토) — Pencil design/exports/08-전문가-피드백.png 재대조로
// select 기반 컨트롤을 카드/버튼 그룹으로 마이그레이션했다. 사용자 승인
// 사항(AskUserQuestion, 3문항 전부 "권장" 선택):
//   1) 전용 Topbar(뒤로가기/브레드크럼) 미도입 — 기존 앵커 구조(REQ-006) 유지.
//   2) "실제 결과" 5개 선택 카드 미도입 — lib/feedback/schema.ts(PRESERVE)에
//      새 enum 필드가 필요해 이번 라운드 범위 밖. 자유 텍스트 그대로 유지.
//   3) "이미 제출됨" 상태 미도입 — 페이지 로드 시 기존 피드백 사전조회(신규
//      DB 쿼리) 없이는 알 수 없는 상태라 추가하지 않음.
// 그 외 select→카드/버튼 그룹 마이그레이션은 기존 상태/스키마/testid를
// 유지한 채 렌더링 방식만 바꾼다 — 값 집합과 제출 payload는 전혀 변경되지
// 않는다. testid는 옵션별로 `${그룹testid}-${value}` 형태로 세분화된다
// (기존 select 자체를 가리키던 e2e/유닛 테스트는 클릭 인터랙션으로 갱신).

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
  { value: "ACCURATE", label: "정확함", description: "주장과 근거가 모두 타당함" },
  {
    value: "PARTIALLY_ACCURATE",
    label: "부분적으로 정확함",
    description: "일부 주장 또는 근거에 보완이 필요함",
  },
  { value: "INACCURATE", label: "부정확함", description: "주장 또는 근거가 타당하지 않음" },
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

const TEXTAREA_CLASSNAME = "rounded-[4px] border-app-line bg-app-surface text-body text-bora-ink";

// design.md §3 "번호 매김 섹션" 헤더 패턴 — 번호 배지 + 타이틀 + 선택적
// "필수"/"선택 입력" Chip. §4 화면 03의 5개 번호 섹션이 공통으로 사용한다.
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
      {required ? (
        <Chip className="bg-bora-danger-soft text-bora-danger">필수</Chip>
      ) : (
        <Chip>선택 입력</Chip>
      )}
    </div>
  );
}

// Round5 — Pencil 정합: select를 대체하는 공유 버튼 그룹. 값 집합/제출
// payload는 무변경, 렌더링만 카드형 버튼으로 바꾼다. 옵션별 testid는
// `${groupTestId}-${value}`(클릭 대상), "평가 안 함"/미선택 옵션은
// `${groupTestId}-CLEAR`로 고정한다.
function OptionButtonGroup<T extends string>({
  groupTestId,
  ariaLabel,
  options,
  value,
  onChange,
  clearLabel,
}: {
  groupTestId: string;
  ariaLabel: string;
  options: readonly { value: T; label: string }[];
  value: T | "";
  onChange: (value: T | "") => void;
  clearLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {clearLabel ? (
        <button
          type="button"
          data-testid={`${groupTestId}-CLEAR`}
          aria-pressed={value === ""}
          onClick={() => onChange("")}
          className={cn(
            "rounded-[4px] border px-3 py-1.5 text-body-s font-medium whitespace-nowrap transition-colors",
            value === ""
              ? "border-bora-ink-3 bg-app-surface-inset text-bora-ink"
              : "border-app-line bg-app-surface text-bora-ink-3 hover:bg-app-surface-inset"
          )}
        >
          {clearLabel}
        </button>
      ) : null}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-testid={`${groupTestId}-${option.value}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[4px] border px-3 py-1.5 text-body-s font-medium whitespace-nowrap transition-colors",
            value === option.value
              ? "border-bora-accent bg-bora-accent-soft text-bora-accent-deep"
              : "border-app-line bg-app-surface text-bora-ink-3 hover:bg-app-surface-inset"
          )}
        >
          {option.label}
        </button>
      ))}
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
  // Round5 — Pencil "작성 N분 경과". 가짜 데이터가 아니라 이 컴포넌트가
  // 마운트된 시각(폼을 열어본 실제 시각) 기준 실제 경과 시간이다. 서버
  // 상태도, 영속화도 필요 없다 — 매 60초 리렌더로 충분하다.
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  // `Date.now()`는 렌더 중 호출하면 impure(react-hooks/purity)이므로,
  // 마운트 시각은 useRef 초기값이 아니라 effect 안에서 기록한다.
  const mountedAtRef = useRef<number | null>(null);
  useEffect(() => {
    mountedAtRef.current = Date.now();
    const id = setInterval(() => {
      setElapsedMinutes(Math.floor((Date.now() - (mountedAtRef.current ?? Date.now())) / 60_000));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  // SPEC-PILOT-UX-001 REQ-PILOT-UX-007(§A decision 1) — 클라이언트 단일
  // 흐름(single-flight) 가드. handleSubmit 시작 시 동기적으로 설정되며,
  // 검증 실패(REQ-PILOT-UX-010) 또는 action 예외/reject(REQ-PILOT-UX-011)
  // 시에만 리셋된다 — 성공 시에는 유지되어 같은 마운트 인스턴스의 재제출을
  // 계속 막는다(REQ-PILOT-UX-008/009).
  const submitGuardRef = useRef(false);

  function addMissedIssue(issueType?: QueryIssueType) {
    setMissedIssues((rows) => [
      ...rows,
      { issueType: issueType ?? QUERY_ISSUE_TYPES[0], description: "" },
    ]);
  }

  function removeMissedIssue(index: number) {
    setMissedIssues((rows) => rows.filter((_, i) => i !== index));
  }

  // Round5 — Pencil "목록에 없는 쟁점" 앞의 체크박스 빠른 추가. 실제
  // QUERY_ISSUE_TYPES(8개, 기존 SSOT) 값으로만 구성되며, 체크 시 해당
  // issueType의 행을 추가하고 해제 시 그 행(들)을 제거한다 — 별도 상태
  // 없이 missedIssues 배열 자체를 유일한 SSOT로 유지한다.
  function toggleQuickIssue(issueType: QueryIssueType, checked: boolean) {
    if (checked) {
      addMissedIssue(issueType);
      return;
    }
    setMissedIssues((rows) => {
      const idx = rows.findIndex((row) => row.issueType === issueType && row.description === "");
      if (idx === -1) return rows;
      return rows.filter((_, i) => i !== idx);
    });
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

  // SPEC-UI-MIGRATION-001 M6(design.md §4 화면 03 "작성 진행률") — 신규
  // 데이터 없이 현재 폼 상태(각 섹션의 입력 여부)에서만 파생한다. claim/
  // evidence 섹션은 그 섹션이 실제로 렌더링될 때만 진행률 분모에 포함한다.
  const sectionFlags: { label: string; done: boolean | null }[] = [
    { label: "전체 평가", done: overallRating !== "" },
    { label: "누락된 쟁점", done: missedIssues.length > 0 },
    {
      label: "개별 주장 평가",
      done:
        verifiedClaims.length > 0
          ? Object.values(claimVerdicts).some((verdict) => verdict !== "")
          : null,
    },
    {
      label: "개별 근거자료 평가",
      done:
        citedEvidenceIds.length > 0
          ? Object.values(evidenceVerdicts).some((verdict) => verdict !== "")
          : null,
    },
    {
      label: "실제 결과",
      done: outcomeDescription.trim() !== "" || outcomeConfirmedAt.trim() !== "",
    },
  ];
  const applicableSections = sectionFlags.filter(
    (section): section is { label: string; done: boolean } => section.done !== null
  );
  const completedSectionCount = applicableSections.filter((section) => section.done).length;
  const totalSectionCount = applicableSections.length;
  const progressPercent =
    totalSectionCount > 0 ? Math.round((completedSectionCount / totalSectionCount) * 100) : 0;

  // Round5 — Pencil 사건 메타 스트립("검토 대상 N건 · 근거 확인 M건 · 판단
  // 불충분 K건")을 실제 claim.status로 계산한다 — 가짜 수치 아님.
  const verifiedCount = verifiedClaims.filter((c) => c.status === "VERIFIED").length;
  const insufficientCount = verifiedClaims.filter((c) => c.status === "INSUFFICIENT").length;

  const formLevelFieldErrors = fieldErrors._form;
  const hasFormLevelError = (formLevelFieldErrors?.length ?? 0) > 0 || formError !== null;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 xl:flex-row"
      data-testid="feedback-form"
    >
      {/* 폼 컬럼 — design.md §4 화면 03 "폼 컬럼(w804)": Context Bar + 5개
          번호 매김 섹션 + Form Footer */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 xl:max-w-[804px]">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[4px] bg-app-surface-sub px-4 py-2.5 text-body-s text-bora-ink-3">
          <span>리포트 ID: {reportId}</span>
          <span>
            검토 대상 {verifiedClaims.length}건 · 근거 확인 {verifiedCount}건 · 판단 불충분{" "}
            {insufficientCount}건
          </span>
          <span data-testid="feedback-elapsed-minutes">작성 {elapsedMinutes}분 경과</span>
        </div>

        <div
          className="overflow-hidden rounded-[4px] bg-app-surface"
          data-testid="feedback-section"
        >
          <SectionHeader number={1} title="전체 평가" required />
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-col gap-1.5">
              <Label className="text-body-s font-semibold text-bora-ink-2">전체 평가</Label>
              <div
                data-testid="feedback-overall-rating"
                role="radiogroup"
                aria-label="전체 평가"
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {OVERALL_RATINGS.map((option) => {
                  const selected = overallRating === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-testid={`feedback-overall-rating-${option.value}`}
                      onClick={() => setOverallRating(option.value)}
                      className={cn(
                        "flex flex-col gap-1 rounded-[4px] border p-3 text-left transition-colors",
                        selected
                          ? "border-bora-accent bg-bora-accent-soft"
                          : "border-app-line bg-app-surface hover:bg-app-surface-inset"
                      )}
                    >
                      <span
                        className={cn(
                          "text-body-s font-semibold",
                          selected ? "text-bora-accent-deep" : "text-bora-ink"
                        )}
                      >
                        {option.label}
                      </span>
                      <span className="text-label-s text-bora-ink-4">{option.description}</span>
                    </button>
                  );
                })}
              </div>
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
            <p className="text-body-s text-bora-ink-3">
              리서치에서 다루지 않았으나 실무상 검토가 필요한 쟁점을 표시해 주세요.
            </p>
            {/* Round5 — Pencil 정합: 자주 쓰는 쟁점 유형(기존 QUERY_ISSUE_TYPES
                8개, 신규 값 아님) 체크박스 빠른 추가. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {QUERY_ISSUE_TYPES.map((issueType) => {
                const checked = missedIssues.some(
                  (row) => row.issueType === issueType && row.description === ""
                );
                return (
                  <label
                    key={issueType}
                    className="flex items-center gap-2 text-body-s text-bora-ink-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleQuickIssue(issueType, event.target.checked)}
                      data-testid={`feedback-missed-issue-quick-${issueType}`}
                      className="size-4 shrink-0 rounded border-app-line"
                    />
                    {queryIssueTypeLabel(issueType)}
                  </label>
                );
              })}
            </div>

            <p className="text-label-s font-semibold text-bora-ink-3">목록에 없는 쟁점 추가</p>
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
                  className="h-9 w-full rounded-[4px] border border-app-line bg-app-surface px-3 text-body text-bora-ink"
                >
                  {QUERY_ISSUE_TYPES.map((issueType) => (
                    <option key={issueType} value={issueType}>
                      {queryIssueTypeLabel(issueType)}
                    </option>
                  ))}
                </select>
                <Textarea
                  aria-label="누락 쟁점 설명"
                  placeholder="쟁점 설명 (선택)"
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
              onClick={() => addMissedIssue()}
              data-testid="feedback-missed-issue-add"
            >
              + 행 추가
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
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-body-s text-bora-ink-3">
                      <span
                        aria-hidden="true"
                        className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-app-surface-inset text-label-s font-semibold text-bora-ink-3"
                      >
                        {index + 1}
                      </span>
                      {claim.summary}
                    </p>
                    {/* Round5 — Pencil 정합: 실제 claim.status(기존 데이터)로
                        "근거 충분"/"근거 부족" 배지 표시. */}
                    <Chip
                      className={
                        claim.status === "VERIFIED"
                          ? "bg-bora-ok-soft text-bora-ok"
                          : "bg-bora-danger-soft text-bora-danger"
                      }
                    >
                      {claim.status === "VERIFIED" ? "근거 충분" : "근거 부족"}
                    </Chip>
                  </div>
                  <OptionButtonGroup
                    groupTestId={`feedback-claim-${index}-verdict`}
                    ariaLabel={`주장 ${index + 1} 평가`}
                    options={CLAIM_VERDICTS}
                    value={(claimVerdicts[index] as (typeof CLAIM_VERDICTS)[number]["value"]) ?? ""}
                    onChange={(value) =>
                      setClaimVerdicts((verdicts) => ({ ...verdicts, [index]: value }))
                    }
                    clearLabel="평가 안 함"
                  />
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
            <div className="flex flex-col gap-3 px-6 py-5">
              {citedEvidenceIds.map((evidenceId) => {
                const item = evidenceById.get(evidenceId);
                return (
                  <div
                    key={evidenceId}
                    data-testid="feedback-evidence-verdict"
                    className="flex flex-col gap-2.5 rounded-[4px] border border-app-line p-3"
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      {item ? <Chip>{evidenceTypeLabel(item.evidenceType)}</Chip> : null}
                      <p className="min-w-0 flex-1 text-body-s text-bora-ink-3">
                        {item?.title ?? evidenceId}
                        {item && item.issueTypes.length > 0 ? (
                          <span className="text-bora-ink-4">
                            {" "}
                            [{item.issueTypes.map(queryIssueTypeLabel).join(", ")}]
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <OptionButtonGroup
                      groupTestId={`feedback-evidence-${evidenceId}-verdict`}
                      ariaLabel={`근거자료 ${evidenceId} 평가`}
                      options={EVIDENCE_VERDICTS}
                      value={
                        (evidenceVerdicts[
                          evidenceId
                        ] as (typeof EVIDENCE_VERDICTS)[number]["value"]) ?? ""
                      }
                      onChange={(value) =>
                        setEvidenceVerdicts((verdicts) => ({ ...verdicts, [evidenceId]: value }))
                      }
                      clearLabel="평가 안 함"
                    />
                  </div>
                );
              })}
              {fieldErrorMessages(fieldErrors, "evidenceAssessments")}
            </div>
          </div>
        ) : null}

        <div
          className="overflow-hidden rounded-[4px] bg-app-surface"
          data-testid="feedback-section"
        >
          <SectionHeader number={5} title="실제 결과" />
          <div className="flex flex-col gap-3 px-6 py-5">
            <p className="text-body-s text-bora-ink-3">
              보험금 처리 결과를 알려주시면 리서치 정확도 개선에 활용됩니다. 선택 입력입니다.
            </p>
            <Textarea
              aria-label="실제 결과 설명"
              data-testid="feedback-outcome-description"
              placeholder="실제 결과 설명"
              value={outcomeDescription}
              onChange={(event) => setOutcomeDescription(event.target.value)}
              className={TEXTAREA_CLASSNAME}
            />
            <DatePicker
              aria-label="실제 결과 확인일"
              data-testid="feedback-outcome-confirmed-at"
              value={outcomeConfirmedAt}
              onChange={setOutcomeConfirmedAt}
              className="w-fit"
            />
            {fieldErrorMessages(fieldErrors, "outcome")}
          </div>
        </div>

        {/* Round5 — Pencil 정합: 잠금 아이콘 + 비식별 안내 문구 + "임시 저장"
            비활성 버튼(case-input-form.tsx와 동일한 기존 관례 — 준비 중 Chip,
            초안 저장 인프라 없음) 추가. "제출" 버튼 로직/testid는 무변경. */}
        <div className="flex flex-col gap-3 bg-app-surface-sub px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex min-w-0 items-start gap-1.5 text-body-s text-bora-ink-3">
            <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">
              피드백에도 개인 식별정보를 포함하지 마세요. 제출 전 자동 검사를 수행합니다.
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled
              data-testid="feedback-draft-save"
              className="rounded-[4px]"
            >
              임시 저장
              <Chip className="ml-1.5">준비 중</Chip>
            </Button>
            <Button
              type="submit"
              className="rounded-[4px] bg-bora-accent px-5 text-white hover:bg-bora-accent-deep"
              data-testid="feedback-submit"
              disabled={isSubmitting || overallRating === "" || submissionSucceeded}
            >
              피드백 제출
            </Button>
          </div>
        </div>
      </div>

      {/* 우 레일 — design.md §4 화면 03 "우 레일(w320)": Notice 개인정보(M3
          재사용, 문구 무변경) + 작성 진행률(신규 데이터 없이 현재 폼 상태에서만
          파생) + 제출 상태(기존 isSubmitting/필드 오류/feedback-success 조건부
          UI의 재스타일 — 신규 상태 아님, 한 번에 해당하는 하나만 렌더링) */}
      <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[320px]">
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
            {/* Round5 — Pencil 정합: 섹션별 완료 여부 목록(기존
                sectionFlags에서만 파생, 신규 데이터 없음). */}
            <ul className="mt-1 flex flex-col gap-1.5">
              {applicableSections.map((section) => (
                <li
                  key={section.label}
                  className="flex items-center gap-1.5 text-label-s text-bora-ink-3"
                >
                  {section.done ? (
                    <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-bora-ok" />
                  ) : (
                    <Circle aria-hidden="true" className="size-3.5 shrink-0 text-bora-ink-4" />
                  )}
                  {section.label}
                </li>
              ))}
            </ul>
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
                className="flex items-center gap-1.5 text-body-s font-medium text-bora-ok"
              >
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
                피드백이 제출되었습니다. 감사합니다.
              </p>
            ) : hasFormLevelError ? (
              <div className="flex flex-col gap-1">
                <p className="flex items-center gap-1.5 text-body-s font-medium text-bora-danger">
                  <XCircle aria-hidden="true" className="size-4 shrink-0" />
                  제출할 수 없습니다
                </p>
                {fieldErrorMessages(fieldErrors, "_form")}
                {formError ? <p className="text-sm text-bora-danger">{formError}</p> : null}
              </div>
            ) : isSubmitting ? (
              <span
                role="status"
                aria-live="polite"
                className="flex items-center gap-1.5 text-body-s text-bora-ink-3"
              >
                <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
                처리 중입니다. 잠시만 기다려 주세요...
              </span>
            ) : overallRating === "" ? (
              <p className="flex items-center gap-1.5 text-body-s text-bora-ink-3">
                <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-bora-ink-4" />
                01 전체 평가 — 필수 항목을 선택해 주세요.
              </p>
            ) : (
              <p className="text-body-s text-bora-ink-3">모든 필드를 입력한 뒤 제출해 주세요.</p>
            )}
          </div>
        </div>
      </aside>
    </form>
  );
}
