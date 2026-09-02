// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

    const claimsSection = container.querySelector('[data-testid="verified-claims"]');
    expect(claimsSection?.textContent).toContain("PRECEDENT");
    expect(claimsSection?.textContent).toContain("DISABILITY_GRADE_CRITERIA");
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
