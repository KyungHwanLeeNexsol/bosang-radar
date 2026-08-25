import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema.ts";
import { TESTER_A_EMAIL, TESTER_B_EMAIL } from "../scripts/e2e-tester-emails.ts";
import { connectE2EDb, loginAsTester } from "./helpers.ts";

// AC-RUNTIME-014 — tenant isolation: 타 사용자 사건 접근 차단. case-flow.spec.ts의
// 사건 생성 흐름에 의존하지 않고 DB에 직접 사건을 만들어 이 spec을 독립적으로
// 실행 가능하게 한다(design.md §3.3의 프로세스 계보와 무관하게 spec 파일 간
// 실행 순서에 결합되지 않도록).

test.describe("Tenant Isolation — AC-RUNTIME-014", () => {
  // connectE2EDb()가 연 libsql 연결을 테스트 성공·실패와 무관하게 닫는다 —
  // afterEach는 본문이 예외로 중단돼도 실행되므로 try/finally로 본문 전체를
  // 감싸지 않고도 해제를 보장한다.
  let closeDb: (() => void) | undefined;

  test.afterEach(() => {
    closeDb?.();
    closeDb = undefined;
  });

  test("테스터 B는 테스터 A가 소유한 사건 상세에 접근할 수 없다", async ({ page }) => {
    const { db, close } = connectE2EDb();
    closeDb = close;
    const [testerA] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, TESTER_A_EMAIL))
      .limit(1);
    if (!testerA) {
      throw new Error(
        "테스터 A가 프로비저닝되어 있지 않습니다 — scripts/run-e2e.ts 실행 여부를 확인하세요."
      );
    }

    const caseId = randomUUID();
    const now = new Date();
    await db.insert(schema.cases).values({
      id: caseId,
      ownerUserId: testerA.id,
      input: {
        incidentDescription: "격리 검증용 사건",
        diagnosisName: "테스트 진단",
        disabilityBodyPart: "테스트 부위",
        incidentDate: "2026-01-01",
      },
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    await loginAsTester(page, TESTER_B_EMAIL);

    const response = await page.goto(`/cases/${caseId}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("case-report")).toHaveCount(0);
  });
});
