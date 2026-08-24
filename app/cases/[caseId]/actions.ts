"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { feedback } from "@/lib/db/schema";

// 사건 상세 뷰의 전문가 피드백 저장 — 데이터 모델(feedback 테이블)까지만
// 이번 SPEC 범위이며, 피드백 UI 자체의 고도화는 후속 SPEC이다(design.md §3).
export async function submitFeedback(caseId: string, content: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user) {
    throw new Error("로그인이 필요합니다.");
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return;
  }

  const db = getDb();
  await db.insert(feedback).values({
    id: randomUUID(),
    caseId,
    userId: session.user.id,
    content: trimmed,
    createdAt: new Date(),
  });

  revalidatePath(`/cases/${caseId}`);
}
