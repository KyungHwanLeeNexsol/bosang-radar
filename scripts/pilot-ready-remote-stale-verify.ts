import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema.ts";
import { bootstrapCli } from "./cli-bootstrap.ts";

// SPEC-PILOT-READY-001 readiness 항목 (7) 2회차 정정 검증 전용 일회성
// 스크립트. 실제 원격 프로덕션 Turso에 synthetic-ID-tagged 행만 직접
// 쓰고 각 단계 후 정리한다 — 스키마 변경/실 사용자 데이터 변경 없음.
// 사용법:
//   tsx scripts/pilot-ready-remote-stale-verify.ts owner-id <email>
//   tsx scripts/pilot-ready-remote-stale-verify.ts check-reservation <ownerUserId>
//   tsx scripts/pilot-ready-remote-stale-verify.ts seed-stale --owner=<id> --job=<jobId> --lease=<leaseId> --variant=expired|missing
//   tsx scripts/pilot-ready-remote-stale-verify.ts verify-after --job=<jobId> --owner=<id>
//   tsx scripts/pilot-ready-remote-stale-verify.ts cleanup --job=<jobId> --owner=<id>
//   tsx scripts/pilot-ready-remote-stale-verify.ts rollback-test --owner=<id>

function buildDb(env: { TURSO_DATABASE_URL: string; TURSO_AUTH_TOKEN?: string }) {
  const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  return { client, db: drizzle(client, { schema }) };
}

function parseFlag(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function ownerId(email: string): Promise<void> {
  const env = bootstrapCli("db");
  const { client, db } = buildDb(env);
  try {
    const [row] = await db
      .select({ id: schema.user.id, email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.email, email.toLowerCase()));
    console.log(JSON.stringify({ found: Boolean(row), id: row?.id ?? null }));
  } finally {
    client.close();
  }
}

async function checkReservation(ownerUserId: string): Promise<void> {
  const env = bootstrapCli("db");
  const { client, db } = buildDb(env);
  try {
    const rows = await db
      .select()
      .from(schema.reservations)
      .where(eq(schema.reservations.ownerUserId, ownerUserId));
    console.log(JSON.stringify({ count: rows.length, rows }));
  } finally {
    client.close();
  }
}

async function seedStale(argv: readonly string[]): Promise<void> {
  const owner = parseFlag(argv, "owner");
  const jobId = parseFlag(argv, "job");
  const leaseId = parseFlag(argv, "lease");
  const variant = parseFlag(argv, "variant");
  if (!owner || !jobId || !leaseId || (variant !== "expired" && variant !== "missing")) {
    throw new Error(
      "사용법: seed-stale --owner=<id> --job=<jobId> --lease=<leaseId> --variant=expired|missing"
    );
  }

  const env = bootstrapCli("db");
  const { client, db } = buildDb(env);
  const now = new Date();
  try {
    await db.insert(schema.caseJobs).values({
      id: jobId,
      ownerUserId: owner,
      leaseId,
      input: {
        incidentDescription: "synthetic-verify-only",
        diagnosisName: "synthetic",
        disabilityBodyPart: "synthetic",
        incidentDate: "2024-01-01",
      },
      status: "processing",
      caseId: null,
      createdAt: now,
      updatedAt: now,
    });

    if (variant === "expired") {
      await db.insert(schema.reservations).values({
        ownerUserId: owner,
        leaseId,
        expiresAt: new Date(now.getTime() - 60_000),
      });
    }
    // variant === "missing": 의도적으로 reservations 행을 만들지 않는다 —
    // 리스 자체가 사라진(만료 후 청소됨) 시나리오를 재현한다.

    console.log(JSON.stringify({ seeded: true, variant, jobId, owner, leaseId }));
  } finally {
    client.close();
  }
}

async function verifyAfter(argv: readonly string[]): Promise<void> {
  const owner = parseFlag(argv, "owner");
  const jobId = parseFlag(argv, "job");
  if (!owner || !jobId) {
    throw new Error("사용법: verify-after --job=<jobId> --owner=<id>");
  }

  const env = bootstrapCli("db");
  const { client, db } = buildDb(env);
  try {
    const [job] = await db.select().from(schema.caseJobs).where(eq(schema.caseJobs.id, jobId));
    const reservationRows = await db
      .select()
      .from(schema.reservations)
      .where(eq(schema.reservations.ownerUserId, owner));
    console.log(
      JSON.stringify({
        jobStatus: job?.status ?? null,
        jobCaseId: job?.caseId ?? null,
        reservationCount: reservationRows.length,
      })
    );
  } finally {
    client.close();
  }
}

async function cleanup(argv: readonly string[]): Promise<void> {
  const owner = parseFlag(argv, "owner");
  const jobId = parseFlag(argv, "job");
  if (!owner || !jobId) {
    throw new Error("사용법: cleanup --job=<jobId> --owner=<id>");
  }

  const env = bootstrapCli("db");
  const { client, db } = buildDb(env);
  try {
    await db.delete(schema.caseJobs).where(eq(schema.caseJobs.id, jobId));
    await db.delete(schema.reservations).where(eq(schema.reservations.ownerUserId, owner));

    const remainingJobs = await db
      .select()
      .from(schema.caseJobs)
      .where(eq(schema.caseJobs.id, jobId));
    const remainingReservations = await db
      .select()
      .from(schema.reservations)
      .where(eq(schema.reservations.ownerUserId, owner));
    console.log(
      JSON.stringify({
        cleaned: true,
        remainingJobs: remainingJobs.length,
        remainingReservations: remainingReservations.length,
      })
    );
  } finally {
    client.close();
  }
}

// M4 — 완료 트랜잭션과 동일한 롤백 안전성을 실제 원격 Turso에서 직접
// 검증한다: synthetic case + report를 트랜잭션 안에서 INSERT한 뒤 의도적
// 오류로 롤백시키고, 두 테이블 모두 0행인지 재확인한다.
async function rollbackTest(argv: readonly string[]): Promise<void> {
  const owner = parseFlag(argv, "owner");
  if (!owner) {
    throw new Error("사용법: rollback-test --owner=<id>");
  }

  const env = bootstrapCli("db");
  const { client, db } = buildDb(env);
  const syntheticCaseId = `synth-rollback-${randomUUID()}`;
  const syntheticReportId = `synth-rollback-report-${randomUUID()}`;
  const now = new Date();

  try {
    let threwAsExpected = false;
    try {
      await db.transaction(async (tx) => {
        await tx.insert(schema.cases).values({
          id: syntheticCaseId,
          ownerUserId: owner,
          input: { synthetic: true },
          status: "completed",
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(schema.reports).values({
          id: syntheticReportId,
          caseId: syntheticCaseId,
          content: { synthetic: true },
          createdAt: now,
        });
        throw new Error("INTENTIONAL_ROLLBACK_TRIGGER");
      });
    } catch (error) {
      threwAsExpected = error instanceof Error && error.message === "INTENTIONAL_ROLLBACK_TRIGGER";
    }

    const remainingCases = await db
      .select()
      .from(schema.cases)
      .where(eq(schema.cases.id, syntheticCaseId));
    const remainingReports = await db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.id, syntheticReportId));

    console.log(
      JSON.stringify({
        threwAsExpected,
        remainingCases: remainingCases.length,
        remainingReports: remainingReports.length,
        syntheticCaseId,
        syntheticReportId,
      })
    );
  } finally {
    // 방어적 정리 — 정상 경로에서는 트랜잭션 롤백으로 이미 0행이어야 하지만,
    // 어떤 이유로든 남아있다면(예: 어서션 실패) 절대 프로덕션에 synthetic
    // 행을 남기지 않는다.
    await db.delete(schema.reports).where(eq(schema.reports.id, syntheticReportId));
    await db.delete(schema.cases).where(eq(schema.cases.id, syntheticCaseId));
    client.close();
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "owner-id":
      await ownerId(rest[0] ?? "");
      return;
    case "check-reservation":
      await checkReservation(rest[0] ?? "");
      return;
    case "seed-stale":
      await seedStale(rest);
      return;
    case "verify-after":
      await verifyAfter(rest);
      return;
    case "cleanup":
      await cleanup(rest);
      return;
    case "rollback-test":
      await rollbackTest(rest);
      return;
    default:
      throw new Error(`알 수 없는 명령: ${command}`);
  }
}

main().catch((error: unknown) => {
  console.error("❌", error);
  process.exitCode = 1;
});
