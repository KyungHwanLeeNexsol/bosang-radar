// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchReport } from "@/lib/pipeline/types";

// SPEC-PILOT-UX-001 M1/M4 — 사건 상세 페이지(app/cases/[caseId]/page.tsx)는
// async Server Component이므로, Next.js 렌더링 파이프라인을 거치지 않고
// 함수를 직접 호출해 반환된 React element 트리를 react-dom/client로
// 렌더링한다(@testing-library/react 미설치, plan.md M4 스코프 노트).

const { getCurrentSessionMock, getCaseForOwnerMock, getDbMock } = vi.hoisted(() => {
  return {
    getCurrentSessionMock: vi.fn(),
    getCaseForOwnerMock: vi.fn(),
    getDbMock: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/lib/cases/get-case-for-owner", () => ({
  getCaseForOwner: getCaseForOwnerMock,
}));

vi.mock("@/lib/db/client", () => ({
  getDb: getDbMock,
}));

interface EvidenceRow {
  id: string;
  title: string;
  sourceUrl: string | null;
  evidenceType: string;
  issueTypes: string[];
}

function mockDbWithEvidence(rows: EvidenceRow[]) {
  getDbMock.mockReturnValue({
    select: () => ({
      from: () => Promise.resolve(rows),
    }),
  });
}

function buildReport(overrides: Partial<ResearchReport> = {}): ResearchReport {
  return {
    caseSummary: {
      incidentDescription: "계단에서 넘어짐",
      diagnosisName: "발목 인대 파열",
      disabilityBodyPart: "발목",
      incidentDate: "2026-01-15",
      normalizedAt: "2026-01-15T00:00:00.000Z",
    },
    reviewTargets: [],
    verifiedClaims: [],
    missingMaterials: [],
    uncertainty: [],
    generatedAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

async function renderPage(container: HTMLDivElement, root: Root, caseId = "case-1") {
  const { default: CaseDetailPage } = await import("./page");
  const element = await CaseDetailPage({ params: Promise.resolve({ caseId }) });
  await act(async () => {
    root.render(element);
  });
  return container;
}

describe("app/cases/[caseId]/page — 리포트 정보 위계 + 근거자료 표시 + 빈 상태", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetModules();
    getCurrentSessionMock.mockReset();
    getCaseForOwnerMock.mockReset();
    getDbMock.mockReset();
    getCurrentSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("AC-005: 요약 배너가 '사건 요약' 카드보다 먼저 렌더링되고 진단명/장해 부위를 포함한다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport(),
      reportId: "report-1",
    });
    mockDbWithEvidence([]);

    await renderPage(container, root);

    const banner = container.querySelector('[data-testid="summary-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("발목 인대 파열");
    expect(banner?.textContent).toContain("발목");

    const caseSummaryHeading = Array.from(container.querySelectorAll("*")).find(
      (el) => el.textContent === "사건 요약" && el.children.length === 0
    );
    expect(caseSummaryHeading).toBeDefined();
    expect(
      banner!.compareDocumentPosition(caseSummaryHeading!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("AC-006: 집계 검증 상태를 표시하고 기존 claim-status pill 3개를 유지한다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport({
        verifiedClaims: [
          {
            summary: "claim-1",
            supportingEvidenceIds: [],
            counterArguments: [],
            status: "VERIFIED",
          },
          {
            summary: "claim-2",
            supportingEvidenceIds: [],
            counterArguments: [],
            status: "VERIFIED",
          },
          {
            summary: "claim-3",
            supportingEvidenceIds: [],
            counterArguments: [],
            status: "INSUFFICIENT",
          },
        ],
      }),
      reportId: "report-1",
    });
    mockDbWithEvidence([]);

    await renderPage(container, root);

    const banner = container.querySelector('[data-testid="summary-banner"]');
    expect(banner?.textContent).toContain("2");
    expect(banner?.textContent).toContain("3");
    expect(banner?.textContent).toContain("1");

    const pills = container.querySelectorAll('[data-testid="claim-status"]');
    expect(pills).toHaveLength(3);
  });

  it("AC-007 (case-detail half): evidenceType/issueTypes가 근거자료 목록에 표시된다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport({
        verifiedClaims: [
          {
            summary: "claim-1",
            supportingEvidenceIds: ["evidence-1"],
            counterArguments: [],
            status: "VERIFIED",
          },
        ],
      }),
      reportId: "report-1",
    });
    mockDbWithEvidence([
      {
        id: "evidence-1",
        title: "판례 A",
        sourceUrl: null,
        evidenceType: "PRECEDENT",
        issueTypes: ["DISABILITY_GRADE_CRITERIA"],
      },
    ]);

    await renderPage(container, root);

    // SPEC-UI-MIGRATION-001 M3 (REQ-007/008) — 화면 텍스트는 영문 raw 값이
    // 아닌 한글 라벨로 렌더링된다("판례"/"장해 평가 기준"). 내부 데이터 값
    // 자체(EvidenceType/QueryIssueType)는 무변경이며, data-* 속성이 아닌
    // 화면 텍스트만 이 SPEC의 범위에서 바뀐다.
    const claimsSection = container.querySelector('[data-testid="verified-claims"]');
    expect(claimsSection?.textContent).toContain("판례");
    expect(claimsSection?.textContent).toContain("장해 평가 기준");
    expect(claimsSection?.textContent).not.toContain("PRECEDENT");
    expect(claimsSection?.textContent).not.toContain("DISABILITY_GRADE_CRITERIA");
  });

  it("AC-008: sourceUrl이 target=_blank, rel=noopener noreferrer인 <a>로 렌더링된다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport({
        verifiedClaims: [
          {
            summary: "claim-1",
            supportingEvidenceIds: ["evidence-1"],
            counterArguments: [],
            status: "VERIFIED",
          },
        ],
      }),
      reportId: "report-1",
    });
    mockDbWithEvidence([
      {
        id: "evidence-1",
        title: "판례 A",
        sourceUrl: "https://example.com/case",
        evidenceType: "PRECEDENT",
        issueTypes: [],
      },
    ]);

    await renderPage(container, root);

    const link = container.querySelector('a[href="https://example.com/case"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("AC-009: Aggregate Status 패널에 보험금 지급 비확정성 안내 문구가 정확히 존재한다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport(),
      reportId: "report-1",
    });
    mockDbWithEvidence([]);

    await renderPage(container, root);

    const banner = container.querySelector('[data-testid="summary-banner"]');
    expect(banner?.textContent).toContain(
      "본 리포트는 공개된 판례·약관·법령을 기반으로 한 참고용 AI 리서치 결과입니다. 보험금 지급 여부나 지급액을 확정하지 않으며, 최종 판단은 담당 손해사정사의 검토가 필요합니다."
    );
  });

  it("AC-010: '검토할 담보' 패널에 담보 검토 비확정성 부제 문구가 정확히 존재한다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport(),
      reportId: "report-1",
    });
    mockDbWithEvidence([]);

    await renderPage(container, root);

    const reviewTargets = container.querySelector('[data-testid="review-targets"]');
    expect(reviewTargets?.textContent).toContain(
      "추가 검토가 필요한 담보 항목입니다. 지급 가능 담보를 확정한 목록이 아닙니다."
    );
  });

  it("AC-011: INSUFFICIENT claim 카드는 항상 missing-materials/uncertainty 앵커 링크를 포함한다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport({
        verifiedClaims: [
          {
            summary: "claim-1",
            supportingEvidenceIds: [],
            counterArguments: [],
            status: "INSUFFICIENT",
          },
        ],
        missingMaterials: [],
      }),
      reportId: "report-1",
    });
    mockDbWithEvidence([]);

    await renderPage(container, root);

    const claimsSection = container.querySelector('[data-testid="verified-claims"]')!;
    expect(claimsSection.textContent).toContain("추가 확인 필요");
    const missingLink = claimsSection.querySelector('a[href="#missing-materials"]');
    const uncertaintyLink = claimsSection.querySelector('a[href="#uncertainty"]');
    expect(missingLink ?? uncertaintyLink).not.toBeNull();
  });

  it("B1(외부 리뷰): missing-materials 앵커 링크의 href가 실제 id로 정확히 스크롤된다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport({
        verifiedClaims: [
          {
            summary: "claim-1",
            supportingEvidenceIds: [],
            counterArguments: [],
            status: "INSUFFICIENT",
          },
        ],
        missingMaterials: [],
      }),
      reportId: "report-1",
    });
    mockDbWithEvidence([]);

    await renderPage(container, root);

    const missingLink = container.querySelector<HTMLAnchorElement>('a[href="#missing-materials"]');
    expect(missingLink).not.toBeNull();

    const targetId = missingLink!.getAttribute("href")!.slice(1);
    const target = container.querySelector(`#${targetId}`);
    expect(target).not.toBeNull();

    // data-testid는 URL 프래그먼트 스크롤 타깃이 아니므로 id 부여가
    // 별도로 필요하다 — 기존 data-testid는 그대로 유지되어야 한다.
    expect(container.querySelector('[data-testid="missing-materials"]')).not.toBeNull();
  });

  it("B1(외부 리뷰): 문서 내 missing-materials/uncertainty id가 중복되지 않는다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport(),
      reportId: "report-1",
    });
    mockDbWithEvidence([]);

    await renderPage(container, root);

    expect(container.querySelectorAll("#missing-materials").length).toBe(1);
    expect(container.querySelectorAll("#uncertainty").length).toBe(1);
    expect(container.querySelector('[data-testid="missing-materials"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="uncertainty"]')).not.toBeNull();
  });

  it("AC-011a: relatedIssueType이 claim의 issueType과 일치하면 카드 내부에 직접 나열된다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport({
        verifiedClaims: [
          {
            summary: "claim-1",
            supportingEvidenceIds: ["evidence-1"],
            counterArguments: [],
            status: "INSUFFICIENT",
          },
        ],
        missingMaterials: [
          {
            description: "장해진단서 추가 제출 필요",
            relatedIssueType: "DISABILITY_GRADE_CRITERIA",
          },
        ],
      }),
      reportId: "report-1",
    });
    mockDbWithEvidence([
      {
        id: "evidence-1",
        title: "판례 A",
        sourceUrl: null,
        evidenceType: "PRECEDENT",
        issueTypes: ["DISABILITY_GRADE_CRITERIA"],
      },
    ]);

    await renderPage(container, root);

    const claimsSection = container.querySelector('[data-testid="verified-claims"]')!;
    expect(claimsSection.textContent).toContain("장해진단서 추가 제출 필요");
  });

  it("AC-011b: 일치하는 issueType이 없으면 무관한 missingMaterial을 카드에 나열하지 않는다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport({
        verifiedClaims: [
          {
            summary: "claim-1",
            supportingEvidenceIds: ["evidence-1"],
            counterArguments: [],
            status: "INSUFFICIENT",
          },
        ],
        missingMaterials: [{ description: "무관한 자료 필요", relatedIssueType: "CAUSATION" }],
      }),
      reportId: "report-1",
    });
    mockDbWithEvidence([
      {
        id: "evidence-1",
        title: "판례 A",
        sourceUrl: null,
        evidenceType: "PRECEDENT",
        issueTypes: ["DISABILITY_GRADE_CRITERIA"],
      },
    ]);

    await renderPage(container, root);

    const claimsSection = container.querySelector('[data-testid="verified-claims"]')!;
    expect(claimsSection.textContent).not.toContain("무관한 자료 필요");
  });

  it("AC-013: verifiedClaims/인용 근거자료가 0건이면 명시적 빈 상태 문구를 표시한다", async () => {
    getCaseForOwnerMock.mockResolvedValue({
      report: buildReport({ verifiedClaims: [] }),
      reportId: "report-1",
    });
    mockDbWithEvidence([]);

    await renderPage(container, root);

    const claimsSection = container.querySelector('[data-testid="verified-claims"]');
    expect(claimsSection?.textContent).toMatch(/확인된 주장이 없습니다|없습니다/);

    const evidenceEmptyState = container.querySelector('[data-testid="cited-evidence-empty"]');
    expect(evidenceEmptyState).not.toBeNull();
  });
});
