import { z } from "zod";
// 상대 경로에 .ts 확장자를 명시한다 — 이 파일은 scripts/db-seed.ts를 거쳐
// Node의 네이티브 타입 스트리핑 실행(`node scripts/db-seed.ts`)으로도
// 로드되며, 확장자 없는 상대 import는 그 경로에서 해석되지 않는다
// (cli-bootstrap.ts와 동일한 실측 근거).
import { QUERY_ISSUE_TYPES } from "../../lib/pipeline/types.ts";

// SPEC-EVIDENCE-001 M1(design.md §1.5) — production seed(db/seed/evidence.json)
// 로딩 시 runtime validation. `scripts/db-seed.ts`의 loadSeedRecords()가
// JSON.parse(...) as EvidenceSeedRecord[]로 타입 단언만 하던 것을 대체한다 —
// TypeScript 컴파일 타임 타입 체크만으로는 JSON 파일의 실제 데이터 오류를
// 잡을 수 없다(외부 독립 리뷰 v0.3.0 이슈 2). 이 스키마는
// db/seed/evidence.json(production)에만 적용한다 — benchmark/diagnostic
// fixture는 검증 대상이 아니다(REQ-EVIDENCE-003이 물리적 분리를 보장).

const EVIDENCE_TYPES = ["POLICY", "PRECEDENT", "DISPUTE_CASE", "STATUTE", "OTHER"] as const;
const SCOPES = ["DOMAIN_SPECIFIC", "UNIVERSAL"] as const;
const CATEGORIES = ["상해후유장해", "질병후유장해", "공통"] as const;

export const evidenceSeedRecordSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum(CATEGORIES),
    evidenceType: z.enum(EVIDENCE_TYPES),
    scope: z.enum(SCOPES),
    title: z.string().min(1),
    content: z.string().min(1),
    sourceUrl: z.union([z.null(), z.string().url()]),
    // QUERY_ISSUE_TYPES(lib/pipeline/types.ts)를 단일 SSOT로 import해서
    // 쓴다 — 8개 값을 이 파일에서 별도 리터럴 배열로 다시 선언하지 않는다
    // (drift 방지, 외부 독립 리뷰 잔여 정합성 이슈 4, design.md §1.4a).
    issueTypes: z.array(z.enum(QUERY_ISSUE_TYPES)),
  })
  .refine((r) => new Set(r.issueTypes).size === r.issueTypes.length, {
    message: "issueTypes에 중복 값이 있습니다",
    path: ["issueTypes"],
  })
  .refine((r) => !(r.scope === "UNIVERSAL" && r.category !== "공통"), {
    message: "scope=UNIVERSAL이면 category는 '공통'이어야 합니다(명백한 불일치)",
    path: ["category"],
  })
  .refine((r) => !(r.scope === "DOMAIN_SPECIFIC" && r.category === "공통"), {
    message: "scope=DOMAIN_SPECIFIC이면 category는 특정 담보여야 합니다(명백한 불일치)",
    path: ["category"],
  });

export const evidenceSeedFileSchema = z.array(evidenceSeedRecordSchema);

export type EvidenceSeedRecord = z.infer<typeof evidenceSeedRecordSchema>;
