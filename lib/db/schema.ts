import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// --- Better Auth 핵심 스키마 (Drizzle 어댑터, sqlite provider) --------------
// 테이블/컬럼 이름은 Better Auth의 기본 스키마 규약을 그대로 따른다. 이렇게 하면
// lib/auth/config.ts(M2)에서 drizzleAdapter(db, { schema })를 연결할 때 별도의
// 필드 매핑이 필요 없다 (plan.md §E 위험 완화).
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  // M2에서 발견 — Better Auth 1.7.1의 accountSchema는 issuer를 필수(non-nullish)
  // 필드로 요구한다(M1 초안 작성 시점에는 없었던 요구사항, plan.md §E 위험 실현 사례).
  issuer: text("issuer").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// --- 애플리케이션 스키마 (REQ-SCAFFOLD-003) ----------------------------------
export const cases = sqliteTable("cases", {
  id: text("id").primaryKey(),
  // AC-SCAFFOLD-002 / AC-SCAFFOLD-010: owner_user_id로 항상 필터링해
  // 사용자 간 데이터가 섞이지 않도록 한다 (lib/auth/session.ts, M2 예정).
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // 사건 입력 필드 형태는 M3(lib/validation/case-input.ts)에서 확정되므로,
  // 이번 마일스톤에서는 검증된 JSON 페이로드를 그대로 저장한다.
  input: text("input", { mode: "json" }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(),
  // 담보(coverage) 카테고리 — 예: 상해후유장해, 질병후유장해 (AC-SCAFFOLD-014).
  category: text("category").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceUrl: text("source_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  content: text("content", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const allowedTesters = sqliteTable("allowed_testers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
