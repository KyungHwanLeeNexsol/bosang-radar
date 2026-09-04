import { describe, expect, it } from "vitest";
import { QUERY_ISSUE_TYPES, type EvidenceType } from "./types";
import {
  EVIDENCE_TYPE_LABELS,
  QUERY_ISSUE_TYPE_LABELS,
  evidenceTypeLabel,
  queryIssueTypeLabel,
} from "./labels";

// SPEC-UI-MIGRATION-001 M3 (REQ-007/008) — EvidenceType 5종 + QueryIssueType
// 8종 전체에 한글 라벨이 정의되어 있고, 값이 영문 raw 문자열과 달라야 한다
// (라벨이 실제로 번역임을 보장 — 매핑 누락/항등 매핑 방지).

const EVIDENCE_TYPES: EvidenceType[] = ["POLICY", "PRECEDENT", "DISPUTE_CASE", "STATUTE", "OTHER"];

describe("lib/pipeline/labels — EvidenceType/QueryIssueType 한글 라벨 SSOT", () => {
  it("AC-007: EvidenceType 5종 모두 한글 라벨을 가지며 raw 값과 다르다", () => {
    for (const type of EVIDENCE_TYPES) {
      const label = evidenceTypeLabel(type);
      expect(label).toBeTruthy();
      expect(label).not.toBe(type);
    }
    expect(Object.keys(EVIDENCE_TYPE_LABELS)).toHaveLength(5);
  });

  it("AC-008: QueryIssueType 8종 모두 한글 라벨을 가지며 raw 값과 다르다", () => {
    for (const type of QUERY_ISSUE_TYPES) {
      const label = queryIssueTypeLabel(type);
      expect(label).toBeTruthy();
      expect(label).not.toBe(type);
    }
    expect(Object.keys(QUERY_ISSUE_TYPE_LABELS)).toHaveLength(8);
  });
});
