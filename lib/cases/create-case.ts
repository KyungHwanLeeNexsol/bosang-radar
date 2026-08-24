import { randomUUID } from "node:crypto";
import { getDb } from "../db/client";
import { cases, reports } from "../db/schema";
import { runPipeline } from "../pipeline/index";
import { validateCaseInput } from "../validation/case-input";

// 사건 입력을 받아 검증 → 파이프라인 실행 → cases/reports 저장까지 수행하는
// 단일 엔트리 포인트 (REQ-SCAFFOLD-016, AC-SCAFFOLD-015). app/api/cases/
// route handler(M5)가 이 함수를 호출한다.
//
// 검증은 반드시 파이프라인 실행 이전에 수행되어야 한다 — PII 형식 입력이
// CaseNormalizer(파이프라인 1단계)나 DB에 도달해서는 안 된다
// (REQ-SCAFFOLD-012, AC-SCAFFOLD-011, M3에서 이미 정의된 계약).

export interface CreateCaseSuccess {
  success: true;
  caseId: string;
}

export interface CreateCaseValidationFailure {
  success: false;
  fieldErrors: Record<string, string[]>;
}

export type CreateCaseResult = CreateCaseSuccess | CreateCaseValidationFailure;

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[]
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export async function createCase(
  ownerUserId: string,
  rawInput: unknown
): Promise<CreateCaseResult> {
  const parsed = validateCaseInput(rawInput);
  if (!parsed.success) {
    return { success: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  // AC-SCAFFOLD-013: 파이프라인 6단계(CaseNormalizer→...→Verifier)를 순차
  // 실행해 seed evidence와 연결된 Research Report를 생성한다.
  const report = await runPipeline(parsed.data);

  const db = getDb();
  const now = new Date();
  const caseId = randomUUID();

  await db.insert(cases).values({
    id: caseId,
    ownerUserId,
    input: parsed.data,
    status: "completed",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(reports).values({
    id: randomUUID(),
    caseId,
    content: report,
    createdAt: now,
  });

  return { success: true, caseId };
}
