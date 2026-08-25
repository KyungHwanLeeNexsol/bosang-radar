import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema.ts";
import { bootstrapCli } from "./cli-bootstrap.ts";

export interface ProvisionTesterOptions {
  email: string;
  password: string;
  name?: string;
}

// db-migrate.ts/db-seed.ts와 마찬가지로 getDb()(lib/db/client.ts)를 재사용하지
// 않는다 — getDb()는 내부적으로 validateEnv("app")을 호출해 BETTER_AUTH_URL까지
// 요구하는데, 이 스크립트는 provision 스코프(BETTER_AUTH_URL 불필요)로 검증해야
// 한다(design.md §3.1). 대신 provision 스코프로 확정된 값으로 별도 클라이언트를
// 구성한다 — 가리키는 물리적 DB(TURSO_DATABASE_URL)와 drizzleAdapter 사용 방식은
// lib/auth/config.ts와 동일하다.
function buildDb(env: { TURSO_DATABASE_URL: string; TURSO_AUTH_TOKEN?: string }) {
  const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  return { client, db: drizzle(client) };
}

// @MX:WARN: [AUTO] 셀프 가입이 허용된 프로비저닝 전용 Better Auth 인스턴스 생성 지점
// @MX:REASON: 이 인스턴스를 HTTP 라우트에 마운트하거나 scripts/ 밖으로 export하면
// 공개 가입 표면이 열린다(REQ-RUNTIME-007, AC-RUNTIME-017). 프로덕션 lib/auth/config.ts의
// disableSignUp: true는 이 함수와 무관하게 유지된다 — 완전히 분리된 옵션을 갖는 별도
// 인스턴스이며 export하지 않는다(design.md §3.2.1).
function createProvisioningAuth(db: ReturnType<typeof drizzle>) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
    },
  });
}

/** REQ-RUNTIME-008: TESTER_PASSWORD 환경변수 경로 — 비대화형(CI/E2E) 진입점용. */
export function resolvePasswordFromEnv(
  source: Record<string, string | undefined> = process.env
): string | undefined {
  return source.TESTER_PASSWORD;
}

const ENTER_CHARS = new Set(["\n", "\r", String.fromCharCode(4)]);
const CANCEL_CHAR = String.fromCharCode(3);
const BACKSPACE_CHAR = String.fromCharCode(127);

// 대화형 TTY 프롬프트(입력 에코 없음) — 기본 경로. 실제 TTY 상호작용은 단위
// 테스트로 직접 검증하기 어렵다(runCli()가 resolvePasswordFromEnv()를 먼저
// 확인하고, 이 함수는 그 값이 없을 때만 폴백으로 호출된다).
function promptPasswordInteractive(promptText = "Password: "): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(
        new Error("비대화형 환경에서는 TESTER_PASSWORD 환경변수를 설정하세요 (예: CI/E2E 진입점).")
      );
      return;
    }
    const rl = createInterface({ input: stdin, output: process.stdout });
    process.stdout.write(promptText);
    let password = "";
    const onData = (chunk: Buffer) => {
      const char = chunk.toString("utf-8");
      if (ENTER_CHARS.has(char)) {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        rl.close();
        process.stdout.write("\n");
        resolve(password);
        return;
      }
      if (char === CANCEL_CHAR) {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        rl.close();
        reject(new Error("사용자가 취소했습니다."));
        return;
      }
      if (char === BACKSPACE_CHAR) {
        password = password.slice(0, -1);
        return;
      }
      password += char;
    };
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf-8");
    stdin.on("data", onData);
  });
}

export function parseEmailArg(argv: readonly string[]): string {
  const index = argv.indexOf("--email");
  const value = index === -1 ? undefined : argv[index + 1];
  if (!value) {
    throw new Error("사용법: pnpm tester:add -- --email <email>");
  }
  return value;
}

// @MX:ANCHOR: [AUTO] 테스터 프로비저닝 진입점 — CLI(provision-tester.ts) 및 향후
// scripts/run-e2e.ts(M5)의 in-process 재사용 대상
// @MX:REASON: design.md §3.3에서 run-e2e.ts가 db-migrate/db-seed와 동일한 방식으로
// 이 함수를 in-process 재사용할 것을 전제하므로(테스터 A·B 프로비저닝), 시그니처
// 변경은 M5까지 파급된다.
export async function provisionTester(options: ProvisionTesterOptions): Promise<void> {
  const env = bootstrapCli("provision");
  const { client, db } = buildDb(env);

  try {
    const email = options.email.toLowerCase();
    const name = options.name ?? email.split("@")[0] ?? email;

    // 순서 불변: allowed_testers 등록 → 계정 생성(REQ-RUNTIME-006). email의
    // unique 제약 위에 onConflictDoNothing을 얹어 재실행을 안전하게 만든다.
    await db
      .insert(schema.allowedTesters)
      .values({ id: randomUUID(), email, createdAt: new Date() })
      .onConflictDoNothing({ target: schema.allowedTesters.email });

    // 재실행 안전성 1계층 — 사전 조회(REQ-RUNTIME-009). 조회를 통과해도
    // 라이브러리의 중복 감지(2계층)와 user.email의 unique 제약(3계층)이
    // 방어선으로 남는다(research.md §0.1, §3).
    const existing = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);

    if (existing.length > 0) {
      return;
    }

    const auth = createProvisioningAuth(db);
    // 반환된 id는 신뢰하지 않는다 — autoSignIn: false 조합에서 중복 재실행 시
    // 라이브러리가 열거 공격 방어용 합성 id를 담은 generic 응답을 반환할 수
    // 있다(design.md §3.2.1). 실제 user.id가 필요하면 이메일로 재조회한다.
    await auth.api.signUpEmail({ body: { email, password: options.password, name } });
  } finally {
    client.close();
  }
}

async function resolvePassword(): Promise<string> {
  const fromEnv = resolvePasswordFromEnv();
  if (fromEnv) {
    return fromEnv;
  }
  return promptPasswordInteractive();
}

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const email = parseEmailArg(argv);
  const password = await resolvePassword();
  await provisionTester({ email, password });
}

// CLI 결과 처리를 별도 함수로 분리 — provisionTester() 자체는 in-process 재사용
// 대상(design.md §3.3)이라 성공/실패 로그·exit code 부여를 섞지 않는다.
export function reportCliResult(result: Promise<void>): Promise<void> {
  return result
    .then(() => {
      console.log("✅ 테스터 프로비저닝 완료");
    })
    .catch((error: unknown) => {
      console.error("❌ 테스터 프로비저닝 실패:", error);
      process.exitCode = 1;
    });
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void reportCliResult(runCli());
}
