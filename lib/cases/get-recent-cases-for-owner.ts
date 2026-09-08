import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { cases } from "../db/schema";

// SPEC-UI-MIGRATION-001 M6 (REQ-013, plan.md §B 결정 6) — "최근 리서치" 우
// 레일 패널이 사용하는 신규 read-only 조회 함수. 신규 스키마·마이그레이션
// 없이 기존 cases 테이블만 조회하며, get-case-for-owner.ts와 동일한
// owner-scope 신뢰 경계(eq(cases.ownerUserId, ownerUserId))를 재사용한다.
// 이 함수 자신은 세션을 조회하지 않는다(순수 owner-scoped read, 인증은
// 호출자 책임 — /cases/new의 NewCasePage가 getCurrentSession()으로 확보한
// ownerUserId를 전달한다).
//
// @MX:ANCHOR: [AUTO] "최근 리서치" 조회의 유일한 접근 통제 지점
// @MX:REASON: 이 함수를 우회해 cases를 직접 조회하는 코드가 생기면
// owner-scope 격리가 깨진다(get-case-for-owner.ts와 동일한 이유).

export interface RecentCaseSummary {
  id: string;
  title: string;
  subtitle: string;
  status: string;
}

const TITLE_FALLBACK = "제목 없음";
const SUBTITLE_FALLBACK = "정보 없음";

// input JSON이 예상 필드를 갖추지 못한 경우(필드 누락, 타입 불일치, null,
// 손상된 값 등) 예외를 던지지 않고 null을 반환해 호출부가 폴백 문자열로
// 대체하도록 한다(REQ-013 필드 단위 폴백 규칙).
function readInputField(
  input: unknown,
  field: "diagnosisName" | "disabilityBodyPart"
): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const value = (input as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function getRecentCasesForOwner(
  ownerUserId: string,
  limit = 3
): Promise<RecentCaseSummary[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(cases)
    .where(eq(cases.ownerUserId, ownerUserId))
    .orderBy(desc(cases.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: readInputField(row.input, "diagnosisName") ?? TITLE_FALLBACK,
    subtitle: readInputField(row.input, "disabilityBodyPart") ?? SUBTITLE_FALLBACK,
    status: row.status,
  }));
}
