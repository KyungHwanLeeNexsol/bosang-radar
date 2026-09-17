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
  // 자료 유형 축 — POLICY/PRECEDENT/DISPUTE_CASE/STATUTE/OTHER (SPEC-RESEARCH-001 design.md §6).
  evidenceType: text("evidence_type").notNull().default("OTHER"),
  // 담보-특정/담보-공통 축 — DOMAIN_SPECIFIC/UNIVERSAL (SPEC-RESEARCH-001 design.md §6).
  scope: text("scope").notNull().default("DOMAIN_SPECIFIC"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceUrl: text("source_url"),
  // SPEC-EVIDENCE-001 M1(design.md §1.1) — evidence 자신의 담보-쟁점 정적
  // 분류(QueryIssueType 8개 값의 부분집합). 기존 행은 .default("[]")로
  // 마이그레이션 직후 빈 배열을 가지며, candidate eligibility/score
  // 계산에서 issueType 가중치 0으로 안전하게 폴백한다(REQ-EVIDENCE-004
  // idempotency/하위 호환 유지, REQ-EVIDENCE-006).
  issueTypes: text("issue_types", { mode: "json" }).notNull().default("[]"),
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
  // SPEC-FEEDBACK-001 M1 — 리포트 단위 구조화 피드백으로 확장. reportId는
  // write-path(lib/feedback/submit-feedback.ts)가 caseId를 도출하는
  // 유일한 출처이며, 클라이언트가 제시하는 caseId는 절대 신뢰하지 않는다
  // (REQ-FEEDBACK-010).
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // 구조화 피드백 payload(ReportFeedbackPayload, lib/feedback/schema.ts).
  // 기존 자유 텍스트 content 컬럼은 REQ-FEEDBACK-015에 따라 완전히
  // 대체되어 제거되었다.
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const allowedTesters = sqliteTable("allowed_testers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// SPEC-PILOT-READY-001 M1(REQ-PILOT-READY-007, plan.md §A 결정 1) — 사용자별
// 동시 실행 가드(TTL 기반 리스). ownerUserId를 PK로 삼아 "UNIQUE 키"
// 요구사항을 만족시키며(plan.md는 ownerUserId/leaseId/expiresAt 3개 컬럼만
// 요구 — 별도 id 컬럼 없음), 이 PK 제약이 조건부 UPSERT(ON CONFLICT)의
// 원자성 근거다. leaseId는 획득마다 새로 생성되는 고유 토큰(crypto.randomUUID())
// 이며, 해제/완료 기록은 항상 ownerUserId AND leaseId 둘 다 일치할 때만
// 수행되는 펜싱된 연산이다(lib/cases/create-case.ts).
export const reservations = sqliteTable("reservations", {
  ownerUserId: text("owner_user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  leaseId: text("lease_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// Netlify Background Function 작업 큐. 동기 함수의 60초 제한을 피하기 위해
// 요청 접수와 Gemini 파이프라인 실행을 분리한다. input은 검증을 통과한 사건
// 데이터만 저장하며, status/caseId로 클라이언트 polling 결과를 owner 범위 안에서
// 조회한다.
export const caseJobs = sqliteTable("case_jobs", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  leaseId: text("lease_id").notNull(),
  input: text("input", { mode: "json" }).notNull(),
  status: text("status").notNull().default("queued"),
  caseId: text("case_id").references(() => cases.id, { onDelete: "set null" }),
  // SPEC-CASE-PROGRESS-002 REQ-CASE-PROGRESS-002-006 — 파이프라인 6단계 중
  // 사용자 대면 4단계(ANALYSIS_STAGES)에 대응하는 3개 체크포인트(1~3) 완료
  // 여부. 0=시작 전, 1~3=해당 체크포인트까지 완료. processCaseJob()의
  // onStageProgress 콜백이 펜싱된 UPDATE로만 갱신한다(design.md §4).
  progressStage: integer("progress_stage").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// 배포 환경의 실 Gemini 호출을 job 단위로 교차 검증하기 위한 비민감 관측값.
// 요청 URL, API key, prompt/response 본문은 저장하지 않는다.
export const geminiRequestObservations = sqliteTable("gemini_request_observations", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => caseJobs.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  model: text("model").notNull(),
  status: integer("status"),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  observedAt: integer("observed_at", { mode: "timestamp" }).notNull(),
});
