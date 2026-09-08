// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackForm } from "./feedback-form";
import type { VerifiedClaim } from "@/lib/pipeline/types";
import type { SubmitFeedbackResult } from "@/lib/feedback/submit-feedback";

// SPEC-PILOT-UX-001 M2/M4 — feedback-form.tsx는 client component이므로
// react-dom/client로 직접 렌더링한다(@testing-library/react 미설치).

interface EvidenceDisplay {
  title: string;
  sourceUrl: string | null;
  evidenceType: string;
  issueTypes: string[];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Round5(외부 재검토) — feedback-form.tsx의 "전체 평가"가 native <select>에서
// 카드형 버튼 그룹(OptionButtonGroup)으로 마이그레이션됨에 따라, 값을
// select.value로 지정하는 대신 해당 값의 버튼을 실제로 클릭한다. testid는
// `feedback-overall-rating-${value}` 패턴이다(feedback-form.tsx 참조).
function clickOption(container: HTMLElement, testId: string, value: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}-${value}"]`);
  if (!button) {
    throw new Error(`버튼을 찾지 못했습니다: [data-testid="${testId}-${value}"]`);
  }
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function submitForm(container: HTMLElement) {
  const submitButton = container.querySelector<HTMLButtonElement>(
    '[data-testid="feedback-submit"]'
  );
  submitButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("app/cases/[caseId]/feedback-form — single-flight guard + 필드별 오류 + 섹션 그룹핑", () => {
  let container: HTMLDivElement;
  let root: Root;
  let unhandledRejections: unknown[];

  function onUnhandledRejection(event: PromiseRejectionEvent) {
    unhandledRejections.push(event.reason);
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    unhandledRejections = [];
    window.addEventListener("unhandledrejection", onUnhandledRejection);
  });

  afterEach(() => {
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderForm(
    action: (reportId: string, rawPayload: unknown) => Promise<SubmitFeedbackResult>,
    opts?: {
      verifiedClaims?: VerifiedClaim[];
      citedEvidenceIds?: string[];
      evidenceById?: Map<string, EvidenceDisplay>;
    }
  ) {
    act(() => {
      root.render(
        <FeedbackForm
          reportId="report-1"
          verifiedClaims={opts?.verifiedClaims ?? []}
          citedEvidenceIds={opts?.citedEvidenceIds ?? []}
          evidenceById={opts?.evidenceById ?? new Map()}
          action={action}
        />
      );
    });
  }

  it("AC-009: action이 응답하기 전 연속 제출해도 action은 한 번만 호출된다", async () => {
    const { promise } = deferred<SubmitFeedbackResult>();
    const action = vi.fn().mockReturnValue(promise);
    renderForm(action);

    act(() => clickOption(container, "feedback-overall-rating", "ACCURATE"));

    // 두 클릭을 같은 act() 블록에 넣어 React가 첫 클릭 이후 DOM을 아직
    // 재렌더링하지 않은(disabled 속성이 아직 반영되지 않은) 상태에서도
    // 컴포넌트 자체의 동기 가드가 두 번째 호출을 막는지 검증한다.
    act(() => {
      submitForm(container);
      submitForm(container);
    });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("AC-010: 성공 시 확인 요소를 표시하고 버튼을 비활성 유지하며, 재마운트 인스턴스는 다시 제출 가능하다", async () => {
    const action = vi.fn().mockResolvedValue({
      success: true,
      feedbackId: "fb-1",
      caseId: "case-1",
    } satisfies SubmitFeedbackResult);
    renderForm(action);

    act(() => clickOption(container, "feedback-overall-rating", "ACCURATE"));

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(action).toHaveBeenCalledTimes(1);
    const successEl = container.querySelector('[data-testid="feedback-success"]');
    expect(successEl).not.toBeNull();
    const submitButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="feedback-submit"]'
    );
    expect(submitButton?.disabled).toBe(true);

    // 재제출 시도 — 성공 후에도 가드가 계속 활성 상태라 action이 다시 호출되지 않는다.
    act(() => submitForm(container));
    expect(action).toHaveBeenCalledTimes(1);

    // 새로 마운트된 인스턴스는 새 논리적 제출을 허용한다.
    const container2 = document.createElement("div");
    document.body.appendChild(container2);
    const root2 = createRoot(container2);
    act(() => {
      root2.render(
        <FeedbackForm
          reportId="report-1"
          verifiedClaims={[]}
          citedEvidenceIds={[]}
          evidenceById={new Map()}
          action={action}
        />
      );
    });
    act(() => clickOption(container2, "feedback-overall-rating", "ACCURATE"));
    await act(async () => {
      submitForm(container2);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(action).toHaveBeenCalledTimes(2);
    act(() => root2.unmount());
    container2.remove();
  });

  it("AC-011 (필드별 오류): 여러 필드 오류가 각각 별도 요소로 렌더링된다 (하나로 뭉치지 않음)", async () => {
    const action = vi.fn().mockResolvedValue({
      success: false,
      fieldErrors: {
        overallRating: ["필수 항목입니다."],
        missedIssues: ["개인정보 형식이 감지되었습니다."],
      },
    } satisfies SubmitFeedbackResult);
    renderForm(action);

    act(() => clickOption(container, "feedback-overall-rating", "ACCURATE"));

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
    });

    const overallRatingError = container.textContent?.includes("필수 항목입니다.");
    const missedIssuesError = container.textContent?.includes("개인정보 형식이 감지되었습니다.");
    expect(overallRatingError).toBe(true);
    expect(missedIssuesError).toBe(true);

    // 하나로 합쳐진 문자열 요소가 없어야 한다.
    const joined = Array.from(container.querySelectorAll("p")).some(
      (p) => p.textContent === "필수 항목입니다. 개인정보 형식이 감지되었습니다."
    );
    expect(joined).toBe(false);
  });

  it("AC-011 (guard-reset regression, 검증 실패): 실패 후 재제출하면 action이 다시 호출된다", async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        fieldErrors: { overallRating: ["필수 항목입니다."] },
      } satisfies SubmitFeedbackResult)
      .mockResolvedValueOnce({
        success: true,
        feedbackId: "fb-1",
        caseId: "case-1",
      } satisfies SubmitFeedbackResult);
    renderForm(action);

    act(() => clickOption(container, "feedback-overall-rating", "ACCURATE"));

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("AC-011 (guard-reset + 폼-레벨 오류, action 예외/reject): 사람이 읽을 수 있는 오류를 표시하고, unhandled rejection 없이 재제출이 가능하다", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockResolvedValueOnce({
        success: true,
        feedbackId: "fb-1",
        caseId: "case-1",
      } satisfies SubmitFeedbackResult);
    renderForm(action);

    act(() => clickOption(container, "feedback-overall-rating", "ACCURATE"));

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/오류|실패/);
    expect(unhandledRejections).toHaveLength(0);

    await act(async () => {
      submitForm(container);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("AC-007 (parity): 사건 상세 화면과 동일한 evidenceType/issueTypes가 피드백 폼에도 표시된다", () => {
    const action = vi.fn();
    const evidenceById = new Map<string, EvidenceDisplay>([
      [
        "evidence-1",
        {
          title: "판례 A",
          sourceUrl: null,
          evidenceType: "PRECEDENT",
          issueTypes: ["DISABILITY_GRADE_CRITERIA"],
        },
      ],
    ]);
    renderForm(action, { citedEvidenceIds: ["evidence-1"], evidenceById });

    // SPEC-UI-MIGRATION-001 M3 (REQ-007/008) — 영문 raw 값 대신 한글 라벨로
    // 표시된다("판례"/"장해 평가 기준"). 내부 데이터 값은 무변경.
    expect(container.textContent).toContain("판례");
    expect(container.textContent).toContain("장해 평가 기준");
    expect(container.textContent).not.toContain("PRECEDENT");
    expect(container.textContent).not.toContain("DISABILITY_GRADE_CRITERIA");
  });

  it("AC-012: 5개 콘텐츠 영역이 각각 시각적으로 구분된 컨테이너로 그룹핑된다", () => {
    const action = vi.fn();
    const verifiedClaims: VerifiedClaim[] = [
      { summary: "claim-1", supportingEvidenceIds: [], counterArguments: [], status: "VERIFIED" },
    ];
    const evidenceById = new Map<string, EvidenceDisplay>([
      [
        "evidence-1",
        { title: "판례 A", sourceUrl: null, evidenceType: "PRECEDENT", issueTypes: [] },
      ],
    ]);
    renderForm(action, {
      verifiedClaims,
      citedEvidenceIds: ["evidence-1"],
      evidenceById,
    });

    const sections = container.querySelectorAll('[data-testid="feedback-section"]');
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });
});
