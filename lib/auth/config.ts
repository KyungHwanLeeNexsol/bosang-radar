import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import * as schema from "../db/schema";

// @MX:ANCHOR: [AUTO] allowed_testers 테이블 대조 — invite-only 접근 제어의 단일 진입점
// @MX:REASON: user.validateUserInfo(가입 시점)와 databaseHooks.session.create.before
// (로그인 시점) 양쪽 모두 이 함수로 동일한 allowlist를 검증한다. 검증 로직이
// 두 곳으로 분기되면 한쪽만 갱신됐을 때 우회 경로가 생긴다(REQ-SCAFFOLD-009,
// AC-SCAFFOLD-008).
export async function isAllowedTesterEmail(email: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.allowedTesters.id })
    .from(schema.allowedTesters)
    .where(eq(schema.allowedTesters.email, email.toLowerCase()))
    .limit(1);

  return rows.length > 0;
}

// betterAuth()는 제네릭 함수라서 `ReturnType<typeof betterAuth>`는 구체 타입이 아닌
// `Auth<BetterAuthOptions>`(제네릭 기본값)로 좁혀진다. 실제 호출 결과(Auth<{...구체
// 옵션...}>>)를 그 타입에 대입하면 타입 오류가 난다 — 비제네릭 팩토리 함수로 감싸
// `ReturnType<typeof createAuthInstance>`가 실제 호출 결과의 구체 타입을 그대로
// 포착하도록 한다.
function createAuthInstance() {
  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // REQ-SCAFFOLD-009: 셀프 가입(self sign-up) 경로를 제공하지 않는다.
      // sign-up/email 라우트 자체를 비활성화해 문자 그대로 "가입 경로 없음"을
      // 만족시킨다. 테스터 계정은 allowed_testers 등록 후 관리자가 별도로
      // 프로비저닝한다(M2 범위 밖).
      disableSignUp: true,
    },
    user: {
      // 방어적 이중 검증 — disableSignUp이 향후 완화되거나(예: 초대 링크
      // 기반 셀프 가입 플로우 추가) 다른 인증 방식(OAuth 등)이 추가되더라도
      // allowed_testers 대조 없이는 계정이 생성되지 않도록 한다.
      validateUserInfo: async ({ user, source }) => {
        if (source.action !== "create-user") {
          return;
        }
        const email = user.email;
        if (typeof email !== "string" || !(await isAllowedTesterEmail(email))) {
          return {
            error: "not_allowed",
            errorDescription: "초대된 테스터만 가입할 수 있습니다.",
          };
        }
      },
    },
    databaseHooks: {
      session: {
        create: {
          // AC-SCAFFOLD-008: allowed_testers에 없는 이메일은 로그인 시점에도
          // 거부한다 — 계정이 이미 존재하더라도(예: allowlist에서 제거된
          // 테스터) 세션을 생성하지 않는다. validateUserInfo는 가입 시점만
          // 검증하므로 이 hook이 로그인 시점 검증을 담당한다.
          before: async (session) => {
            const db = getDb();
            const rows = await db
              .select({ email: schema.user.email })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
              .limit(1);
            const email = rows[0]?.email;
            if (typeof email !== "string" || !(await isAllowedTesterEmail(email))) {
              return false;
            }
          },
        },
      },
    },
  });
}

// @MX:ANCHOR: [AUTO] Better Auth 인스턴스 지연 생성 — app/api/auth/[...all]/route.ts,
// lib/auth/session.ts가 의존
// @MX:REASON: getDb()는 TURSO_DATABASE_URL/TURSO_AUTH_TOKEN이 없으면 예외를
// 던진다(lib/db/client.ts). betterAuth()를 모듈 최상위에서 즉시 생성하면
// TURSO_* 환경변수가 없는 pnpm build(라우트 페이지 데이터 수집 단계)와
// 단위 테스트 환경에서 모듈 로드 자체가 실패한다 — 반드시 첫 요청 시점까지
// 생성을 미뤄야 한다(getDb()의 싱글턴 지연 생성 패턴과 동일).
let authInstance: ReturnType<typeof createAuthInstance> | undefined;

export function getAuth() {
  if (!authInstance) {
    authInstance = createAuthInstance();
  }
  return authInstance;
}
