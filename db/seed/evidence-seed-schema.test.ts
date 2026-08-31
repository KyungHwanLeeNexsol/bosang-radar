import { describe, expect, it } from "vitest";
import evidenceSeed from "./evidence.json";
import { evidenceSeedFileSchema } from "./evidence-seed-schema";

// SPEC-EVIDENCE-001 M1 — issueTypes 필드의 runtime validation (REQ-EVIDENCE-007,
// AC-EVIDENCE-006 outward). TypeScript 컴파일 타임 타입 체크만으로는 JSON 파일의
// 실제 데이터 오류를 잡을 수 없다는 것이 이 스키마의 존재 이유이므로, 여기서는
// 실제 evidence.json 레코드를 복제해 issueTypes 필드를 조작한 뒤 zod 파싱
// 결과만으로 검증한다(design.md §1.5).

function withIssueTypes(issueTypesById: Record<string, string[]>) {
  return evidenceSeed.map((record) => ({
    ...record,
    issueTypes: issueTypesById[record.id] ?? [],
  }));
}

describe("db/seed/evidence-seed-schema (REQ-EVIDENCE-007, AC-EVIDENCE-006)", () => {
  it("issueTypes가 빈 배열이면 모든 production seed 레코드가 통과한다", () => {
    const records = withIssueTypes({});

    expect(() => evidenceSeedFileSchema.parse(records)).not.toThrow();
  });

  it("issueTypes가 QueryIssueType 8개 값의 부분집합이면 통과한다", () => {
    const records = withIssueTypes({
      "seed-evidence-005": ["CAUSATION", "PRE_EXISTING_CONDITION"],
    });

    expect(() => evidenceSeedFileSchema.parse(records)).not.toThrow();
  });

  it("issueTypes에 QueryIssueType 8개 값에 속하지 않는 문자열이 있으면 ZodError를 던진다 — 이 검사는 TypeScript 컴파일 타임 타입 체크가 아니라 실제 JSON 데이터에 대한 runtime 검증이다", () => {
    const records = withIssueTypes({
      "seed-evidence-001": ["INVALID_TYPE"],
    });

    expect(() => evidenceSeedFileSchema.parse(records)).toThrow();
  });

  it("issueTypes 배열에 중복 값이 있으면 ZodError를 던진다", () => {
    const records = withIssueTypes({
      "seed-evidence-001": ["CAUSATION", "CAUSATION"],
    });

    expect(() => evidenceSeedFileSchema.parse(records)).toThrow();
  });

  it("scope=UNIVERSAL인데 category가 '공통'이 아니면 ZodError를 던진다", () => {
    const records = withIssueTypes({}).map((record) =>
      record.id === "seed-evidence-010" ? { ...record, category: "상해후유장해" } : record
    );

    expect(() => evidenceSeedFileSchema.parse(records)).toThrow();
  });

  it("전체 로딩은 fail-fast한다 — 레코드 하나가 유효하지 않으면 배열 전체 파싱이 실패하고 부분 삽입 대상이 되는 유효한 레코드 목록을 반환하지 않는다", () => {
    const records = withIssueTypes({
      "seed-evidence-001": ["INVALID_TYPE"],
    });

    let thrown: unknown;
    try {
      evidenceSeedFileSchema.parse(records);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
  });
});
