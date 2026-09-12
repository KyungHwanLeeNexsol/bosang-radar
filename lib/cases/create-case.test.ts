import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";
import { reservations } from "../db/schema";

const validInput = {
  incidentDescription: "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.",
  diagnosisName: "우측 발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
};

const sampleReport = {
  caseSummary: { summary: "요약" },
  reviewTargets: [],
  verifiedClaims: [],
  missingMaterials: [],
  uncertainty: [],
  generatedAt: "2024-03-15T00:00:00.000Z",
};

// createCase()는 runPipeline()(파이프라인 6단계)과 getDb()(DB 클라이언트)에
// 의존한다. REQ-PILOT-READY-007의 리스 원자성·트랜잭션 롤백·UNIQUE 제약
// 검증은 DB 엔진 수준의 실제 동작을 요구하므로(plan.md §B M6 "이 테스트는
// 실제 DB... UNIQUE 제약을 실제로 강제하는 대상에 대해..."), getDb()는
// in-memory libSQL(실제 SQLite 엔진, `:memory:`)로 대체하고, runPipeline()만
// 제어 가능한 mock으로 교체한다.
const { runPipelineMock } = vi.hoisted(() => ({
  runPipelineMock: vi.fn(),
}));

vi.mock("../pipeline/index", () => ({
  runPipeline: runPipelineMock,
}));

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb: getDbMock,
}));

// @libsql/client의 로컬 sqlite3 드라이버는 db.transaction() 호출 직후 내부
// 연결을 null로 만들고 다음 사용 시 지연 재연결한다(node_modules/@libsql/
// client/lib-esm/sqlite3.js Sqlite3Client#transaction — "A new connection
// will be lazily created on next use"). `:memory:` 대상이면 그 재연결이
// 완전히 새로운 빈 DB를 만들어버리므로(공유되지 않는 인메모리 인스턴스),
// 이 프로젝트가 실제 배포에서 쓰는 file: 스킴(lib/db/client.test.ts에서도
// 검증된 패턴)으로 대체해 매 테스트마다 고유한 임시 디렉터리에 실제 파일
// DB를 생성한다 — 재연결해도 디스크의 같은 파일을 다시 열 뿐이므로 테이블
// 상태가 보존된다.
async function createTestDb(): Promise<{
  client: Client;
  db: LibSQLDatabase<typeof schema>;
  dir: string;
}> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bosang-radar-lease-test-"));
  const client = createClient({ url: `file:${path.join(dir, "test.db")}` });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
  return { client, db, dir };
}

// 로컬 libSQL(sqlite3 임베디드) 드라이버는 FOREIGN KEY 제약을 기본 강제하므로
// (Turso 원격 대상과 동일하게, plan.md §E "기존 테이블 제약은 변경하지
// 않는다"), cases/reservations가 참조하는 owner_user_id는 실제 user 행이
// 먼저 있어야 한다. 테스트가 사용하는 모든 ownerUserId에 대해 최소 user
// 행을 시딩한다.
async function seedUsers(dbInstance: LibSQLDatabase<typeof schema>, ownerUserIds: string[]) {
  const now = new Date();
  for (const id of ownerUserIds) {
    await dbInstance
      .insert(schema.user)
      .values({
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("lib/cases/create-case createCase (REQ-SCAFFOLD-016, AC-SCAFFOLD-015)", () => {
  let client: Client;
  let db: LibSQLDatabase<typeof schema>;
  let dir: string;

  beforeEach(async () => {
    ({ client, db, dir } = await createTestDb());
    getDbMock.mockReturnValue(db);
    runPipelineMock.mockReset();
    runPipelineMock.mockResolvedValue(sampleReport);
    process.env.LLM_PROVIDER_MODE = "deterministic";
    await seedUsers(db, [
      "owner-1",
      "owner-42",
      "owner-guard",
      "owner-retry",
      "owner-tx-fail",
      "owner-tx-recover",
      "owner-worstcase",
      "owner-crash",
      "owner-fencing",
      "owner-race",
      "owner-log",
      "owner-pii-pipeline",
      "owner-pii-tx",
      "owner-pii-release",
      "owner-pipeline-double-fail",
      "owner-job",
      "owner-job-cancel",
      "owner-job-race",
    ]);
  });

  afterEach(() => {
    client.close();
    // Windows에서는 네이티브 sqlite3 바인딩이 파일 핸들을 즉시 놓지 않을 수
    // 있어 rmSync가 EPERM으로 실패할 수 있다 — 임시 디렉터리 정리는
    // best-effort이며(각 테스트가 mkdtemp로 고유 디렉터리를 쓰므로 정리
    // 실패가 테스트 격리에 영향을 주지 않는다), 실패해도 테스트 결과에
    // 영향이 없도록 무시한다.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // best-effort cleanup — 무시
    }
    vi.useRealTimers();
  });

  it("유효한 입력이면 파이프라인을 실행하고 case+report를 저장한 뒤 caseId를 반환한다", async () => {
    const { createCase } = await import("./create-case");

    const result = await createCase("owner-1", validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.caseId).toBe("string");
      expect(result.caseId.length).toBeGreaterThan(0);
    }
    expect(runPipelineMock).toHaveBeenCalledTimes(1);
  });

  it("저장된 case row는 ownerUserId를 그대로 보존한다", async () => {
    const { createCase } = await import("./create-case");

    await createCase("owner-42", validInput);

    const rows = await db
      .select()
      .from(schema.cases)
      .where(eq(schema.cases.ownerUserId, "owner-42"));
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerUserId).toBe("owner-42");
  });

  it("PII 형식(주민등록번호)이 포함된 입력은 파이프라인 호출 전에 거부되고 DB에 도달하지 않는다 (AC-SCAFFOLD-011)", async () => {
    const { createCase } = await import("./create-case");

    const result = await createCase("owner-1", {
      ...validInput,
      incidentDescription: "환자 주민등록번호는 901231-1234567 입니다.",
    });

    expect(result.success).toBe(false);
    expect(runPipelineMock).not.toHaveBeenCalled();
  });

  it("스키마에 정의되지 않은 필드가 섞인 입력은 구조적으로 거부한다", async () => {
    const { createCase } = await import("./create-case");

    const result = await createCase("owner-1", {
      ...validInput,
      address: "서울특별시 강남구 테헤란로 123",
    });

    expect(result.success).toBe(false);
    expect(runPipelineMock).not.toHaveBeenCalled();
  });

  describe("사용자별 동시 실행 가드 (REQ-PILOT-READY-007)", () => {
    it("첫 번째 요청이 아직 리스를 보유 중인 동안 두 번째 요청이 도착하면 runPipeline이 재호출되지 않고 alreadyProcessing 응답을 반환한다", async () => {
      const { createCase } = await import("./create-case");
      const first = deferred<typeof sampleReport>();
      runPipelineMock.mockReturnValueOnce(first.promise);

      const firstCall = createCase("owner-guard", validInput);
      // 첫 호출이 리스를 획득할 때까지(acquireLease의 await) 한 틱 양보한다.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const secondResult = await createCase("owner-guard", validInput);

      expect(secondResult).toEqual({ success: false, alreadyProcessing: true });
      expect(runPipelineMock).toHaveBeenCalledTimes(1);

      first.resolve(sampleReport);
      await firstCall;
    });

    it("파이프라인 실패 후 재시도 시 runPipeline이 다시 호출된다(가드가 실패 시 해제됨)", async () => {
      const { createCase } = await import("./create-case");
      runPipelineMock.mockRejectedValueOnce(new Error("pipeline boom"));

      await expect(createCase("owner-retry", validInput)).rejects.toThrow("pipeline boom");
      expect(runPipelineMock).toHaveBeenCalledTimes(1);

      runPipelineMock.mockResolvedValueOnce(sampleReport);
      const retryResult = await createCase("owner-retry", validInput);

      expect(retryResult.success).toBe(true);
      expect(runPipelineMock).toHaveBeenCalledTimes(2);
    });

    it("reports INSERT가 실패하면(circular content) cases 행이 completed로 커밋되지 않는다(트랜잭션 원자성)", async () => {
      const { createCase } = await import("./create-case");
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      runPipelineMock.mockResolvedValueOnce(circular);

      await expect(createCase("owner-tx-fail", validInput)).rejects.toThrow();

      const rows = await db
        .select()
        .from(schema.cases)
        .where(eq(schema.cases.ownerUserId, "owner-tx-fail"));
      expect(rows).toHaveLength(0);
    });

    it("트랜잭션 실패 시 cases/reports/reservations 3개 테이블 모두 0행(사후 펜싱 해제 증거)이고, 새 leaseId로 즉시 재획득에 성공한다(이전 leaseId와 다름을 직접 확인, v0.6.0 보강)", async () => {
      const { createCase } = await import("./create-case");
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      // 1차 시도 — pending 상태에서 실패 전 leaseId를 직접 관측한다. circular
      // content로 트랜잭션을 실패시킬 것이므로 sampleReport와 형태가 다른
      // 값을 resolve하기 위해 unknown으로 느슨하게 타입한다.
      const firstPending = deferred<unknown>();
      runPipelineMock.mockReturnValueOnce(firstPending.promise);
      const firstCall = createCase("owner-tx-recover", validInput);
      await vi.waitFor(() => expect(runPipelineMock).toHaveBeenCalledTimes(1));

      const [firstLeaseRow] = await db
        .select({ leaseId: reservations.leaseId })
        .from(reservations)
        .where(eq(reservations.ownerUserId, "owner-tx-recover"));
      expect(firstLeaseRow).toBeDefined();
      const firstLeaseId = firstLeaseRow!.leaseId;

      firstPending.resolve(circular);
      await expect(firstCall).rejects.toThrow();

      // 증거 1 — 사후 펜싱 해제: cases/reports/reservations 3개 테이블 모두
      // owner-tx-recover에 대해 0행이다(트랜잭션 롤백 + 후속 명시적 해제).
      const [caseRows, reportRows, reservationRowsAfterFailure] = await Promise.all([
        db.select().from(schema.cases).where(eq(schema.cases.ownerUserId, "owner-tx-recover")),
        db.select().from(schema.reports),
        db.select().from(reservations).where(eq(reservations.ownerUserId, "owner-tx-recover")),
      ]);
      expect(caseRows).toHaveLength(0);
      expect(reportRows).toHaveLength(0);
      expect(reservationRowsAfterFailure).toHaveLength(0);

      // 증거 2 — 즉시 재획득: 새 leaseId가 실패한 1차 시도의 leaseId와
      // 다르다(펜싱된 해제가 실제로 일어났음을 leaseId 값 자체로 확인).
      const retryPending = deferred<typeof sampleReport>();
      runPipelineMock.mockReturnValueOnce(retryPending.promise);
      const retryCall = createCase("owner-tx-recover", validInput);
      await vi.waitFor(() => expect(runPipelineMock).toHaveBeenCalledTimes(2));

      const [newLeaseRow] = await db
        .select({ leaseId: reservations.leaseId })
        .from(reservations)
        .where(eq(reservations.ownerUserId, "owner-tx-recover"));
      expect(newLeaseRow).toBeDefined();
      expect(newLeaseRow!.leaseId).not.toBe(firstLeaseId);

      retryPending.resolve(sampleReport);
      const retryResult = await retryCall;
      expect(retryResult.success).toBe(true);
    });

    it("현실적 worst-case 지속 시간(200초 이상) 동안 TTL(최소 330초) 안에서 가드가 계속 유지된다", async () => {
      vi.useFakeTimers();
      const start = new Date("2024-03-15T00:00:00.000Z");
      vi.setSystemTime(start);

      const { createCase } = await import("./create-case");
      const pending = deferred<typeof sampleReport>();
      runPipelineMock.mockReturnValueOnce(pending.promise);

      const firstCall = createCase("owner-worstcase", validInput);
      await vi.waitFor(() => expect(runPipelineMock).toHaveBeenCalledTimes(1));

      // 200초, 250초, 300초 경과해도(모두 TTL 330초 미만) 여전히 막힌다.
      for (const elapsedSeconds of [200, 250, 300]) {
        vi.setSystemTime(new Date(start.getTime() + elapsedSeconds * 1000));
        const blocked = await createCase("owner-worstcase", validInput);
        expect(blocked).toEqual({ success: false, alreadyProcessing: true });
      }
      expect(runPipelineMock).toHaveBeenCalledTimes(1);

      pending.resolve(sampleReport);
      await firstCall;
    });

    it("리스가 TTL(330초)을 지나면 새 요청이 재획득에 성공하고, TTL 경과 전에는 거부된다(크래시 후 TTL 재획득)", async () => {
      vi.useFakeTimers();
      const start = new Date("2024-03-15T00:00:00.000Z");
      vi.setSystemTime(start);

      const { createCase } = await import("./create-case");
      const stuck = deferred<typeof sampleReport>();
      runPipelineMock.mockReturnValueOnce(stuck.promise);

      const crashedCall = createCase("owner-crash", validInput);
      await vi.waitFor(() => expect(runPipelineMock).toHaveBeenCalledTimes(1));

      // TTL 경과 전(329초) — 여전히 거부된다.
      vi.setSystemTime(new Date(start.getTime() + 329_000));
      const stillBlocked = await createCase("owner-crash", validInput);
      expect(stillBlocked).toEqual({ success: false, alreadyProcessing: true });
      expect(runPipelineMock).toHaveBeenCalledTimes(1);

      // TTL 경과 후(330초 이상) — 재획득에 성공한다.
      vi.setSystemTime(new Date(start.getTime() + 331_000));
      runPipelineMock.mockResolvedValueOnce(sampleReport);
      const recoveredResult = await createCase("owner-crash", validInput);

      expect(recoveredResult.success).toBe(true);
      expect(runPipelineMock).toHaveBeenCalledTimes(2);

      // 정리: 크래시된(멈춘) 첫 호출의 pending promise를 해소해 테스트 종료 후
      // 처리되지 않은 rejection/hang이 남지 않도록 한다.
      stuck.resolve(sampleReport);
      await crashedCall.catch(() => undefined);
    });

    it("만료되어 재획득된 뒤, 원래(만료된) 호출이 뒤늦게 완료를 시도해도 현재 리스 행은 변경되지 않는다(지연 도착 결과 펜싱)", async () => {
      vi.useFakeTimers();
      const start = new Date("2024-03-15T00:00:00.000Z");
      vi.setSystemTime(start);

      const { createCase } = await import("./create-case");
      const staleCall = deferred<typeof sampleReport>();
      runPipelineMock.mockReturnValueOnce(staleCall.promise);

      const firstCall = createCase("owner-fencing", validInput);
      await vi.waitFor(() => expect(runPipelineMock).toHaveBeenCalledTimes(1));

      // TTL 경과 후 재획득 — 두 번째 호출의 파이프라인도 아직 pending 상태로
      // 유지해, 재획득된 현재 리스 행이 살아있는 동안 첫 번째(낡은) 호출의
      // 지연 완료 시도가 그 행을 건드리지 않는지 검증한다.
      vi.setSystemTime(new Date(start.getTime() + 331_000));
      const freshCall = deferred<typeof sampleReport>();
      runPipelineMock.mockReturnValueOnce(freshCall.promise);
      const secondCall = createCase("owner-fencing", validInput);
      await vi.waitFor(() => expect(runPipelineMock).toHaveBeenCalledTimes(2));

      const [currentLeaseAfterReacquire] = await db
        .select({ leaseId: reservations.leaseId })
        .from(reservations)
        .where(eq(reservations.ownerUserId, "owner-fencing"));
      expect(currentLeaseAfterReacquire).toBeDefined();

      // 원래(만료된) 첫 번째 호출이 뒤늦게 완료된다 — no-op으로 처리되어야 한다.
      staleCall.resolve(sampleReport);
      const staleResult = await firstCall;
      expect(staleResult).toEqual({ success: false, alreadyProcessing: true });

      const [currentLeaseAfterStaleAttempt] = await db
        .select({ leaseId: reservations.leaseId })
        .from(reservations)
        .where(eq(reservations.ownerUserId, "owner-fencing"));
      expect(currentLeaseAfterStaleAttempt?.leaseId).toBe(currentLeaseAfterReacquire.leaseId);

      const staleOwnerCases = await db
        .select()
        .from(schema.cases)
        .where(eq(schema.cases.ownerUserId, "owner-fencing"));
      expect(staleOwnerCases).toHaveLength(0);

      freshCall.resolve(sampleReport);
      const freshResult = await secondCall;
      expect(freshResult.success).toBe(true);
    });

    it("동시에 시작된 두 요청 중 정확히 하나만 리스를 획득한다(진성 경쟁 조건, 실제 UNIQUE 제약 대상) — 파이프라인이 pending인 동안 승자의 예약 1건만 존재하고 패자는 파이프라인을 기다리지 않고 즉시 거부된다(v0.6.0 보강)", async () => {
      const { createCase } = await import("./create-case");
      const pending = deferred<typeof sampleReport>();
      runPipelineMock.mockReturnValueOnce(pending.promise);

      const callA = createCase("owner-race", validInput);
      const callB = createCase("owner-race", validInput);

      // 승자가 acquireLease를 마치고 runPipeline을 호출할 때까지 기다린다 —
      // 이 시점에 파이프라인은 아직 pending이며, 패자는 이미 정착됐어야 한다.
      await vi.waitFor(() => expect(runPipelineMock).toHaveBeenCalledTimes(1));

      const reservationRows = await db
        .select()
        .from(reservations)
        .where(eq(reservations.ownerUserId, "owner-race"));
      expect(reservationRows).toHaveLength(1);

      // 두 Promise 중 이미 정착된 쪽(패자)을 Promise.race로 직접 관측한다 —
      // 파이프라인이 여전히 pending이므로 승자 쪽은 이 race에서 절대 먼저
      // 정착될 수 없다(파이프라인을 기다리지 않고 즉시 거부됐다는 직접 증거).
      const loserResult = await Promise.race([callA, callB]);
      expect(loserResult).toEqual({ success: false, alreadyProcessing: true });

      pending.resolve(sampleReport);
      const [resultA, resultB] = await Promise.all([callA, callB]);

      const successes = [resultA, resultB].filter((r) => r.success);
      const blocked = [resultA, resultB].filter((r) => !r.success);

      expect(successes).toHaveLength(1);
      expect(blocked).toHaveLength(1);
      expect(runPipelineMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("PII 비노출 로깅 — errorName/errorCode만 기록, .message 원문 반사 금지 (v0.6.0, 외부 구현 검토 5차 반영)", () => {
    it("pipeline_failed 로그는 파이프라인 오류의 .message에 담긴 사건 입력 원문을 포함하지 않는다", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { createCase } = await import("./create-case");
      runPipelineMock.mockRejectedValueOnce(
        new Error(`DB write failed for input: ${validInput.incidentDescription}`)
      );

      await expect(createCase("owner-pii-pipeline", validInput)).rejects.toThrow();

      const loggedLines = errorSpy.mock.calls.map((args) => String(args[0]));
      for (const line of loggedLines) {
        expect(line).not.toContain(validInput.incidentDescription);
      }
      const pipelineFailedLine = loggedLines.find((line) =>
        line.includes('"event":"pipeline_failed"')
      );
      expect(pipelineFailedLine).toBeDefined();

      errorSpy.mockRestore();
    });

    it("completion_transaction_failed 로그는 트랜잭션 오류의 .message에 담긴 사건 입력 원문을 포함하지 않는다", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { createCase } = await import("./create-case");
      runPipelineMock.mockResolvedValueOnce(sampleReport);
      const txSpy = vi
        .spyOn(db, "transaction")
        .mockRejectedValueOnce(
          new Error(`reports insert failed near diagnosis: ${validInput.diagnosisName}`)
        );

      await expect(createCase("owner-pii-tx", validInput)).rejects.toThrow();

      const loggedLines = errorSpy.mock.calls.map((args) => String(args[0]));
      for (const line of loggedLines) {
        expect(line).not.toContain(validInput.diagnosisName);
      }
      const txFailedLine = loggedLines.find((line) =>
        line.includes('"event":"completion_transaction_failed"')
      );
      expect(txFailedLine).toBeDefined();

      txSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("post_failure_lease_release_failed 로그는 리스 해제 오류의 .message에 담긴 사건 입력 원문을 포함하지 않는다(이중 실패)", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { createCase } = await import("./create-case");
      runPipelineMock.mockResolvedValueOnce(sampleReport);
      const txSpy = vi
        .spyOn(db, "transaction")
        .mockRejectedValueOnce(new Error("completion tx boom"));
      const deleteSpy = vi.spyOn(db, "delete").mockImplementationOnce(() => {
        throw new Error(`release failed, body part: ${validInput.disabilityBodyPart}`);
      });

      await expect(createCase("owner-pii-release", validInput)).rejects.toThrow();

      const loggedLines = errorSpy.mock.calls.map((args) => String(args[0]));
      for (const line of loggedLines) {
        expect(line).not.toContain(validInput.disabilityBodyPart);
      }
      const releaseFailedLine = loggedLines.find((line) =>
        line.includes('"event":"post_failure_lease_release_failed"')
      );
      expect(releaseFailedLine).toBeDefined();

      deleteSpy.mockRestore();
      txSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("파이프라인 실패 시 리스 해제 대칭화 (REQ-PILOT-READY-007, v0.6.0 — 외부 구현 검토 5차 반영)", () => {
    it("파이프라인 실패 시 리스 해제까지 실패해도(이중 실패) 원래 파이프라인 오류가 그대로 전파되고, TTL 경과 후 재획득이 가능하다", async () => {
      vi.useFakeTimers();
      const start = new Date("2024-03-15T00:00:00.000Z");
      vi.setSystemTime(start);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const { createCase } = await import("./create-case");
      runPipelineMock.mockRejectedValueOnce(new Error("pipeline boom (original)"));
      const deleteSpy = vi.spyOn(db, "delete").mockImplementationOnce(() => {
        throw new Error("release also failed");
      });

      // (a) 리스 해제 자체도 실패했지만, 원래 파이프라인 오류가 삼켜지지
      // 않고 그대로 전파된다.
      await expect(createCase("owner-pipeline-double-fail", validInput)).rejects.toThrow(
        "pipeline boom (original)"
      );
      deleteSpy.mockRestore();

      // (b) 이중 실패로 리스가 여전히 남아있으므로 TTL 경과 전에는 막힌다.
      vi.setSystemTime(new Date(start.getTime() + 329_000));
      const stillBlocked = await createCase("owner-pipeline-double-fail", validInput);
      expect(stillBlocked).toEqual({ success: false, alreadyProcessing: true });

      // TTL(330초) 경과 후에는 정상적으로 재획득해 성공한다 — 이중 실패가
      // 영구적으로 재제출을 막지 않는다.
      vi.setSystemTime(new Date(start.getTime() + 331_000));
      runPipelineMock.mockResolvedValueOnce(sampleReport);
      const recovered = await createCase("owner-pipeline-double-fail", validInput);
      expect(recovered.success).toBe(true);

      errorSpy.mockRestore();
    });
  });

  describe("최소 구조적 로깅 (REQ-PILOT-READY-008, M2)", () => {
    it("파이프라인 실패 시 console.error로 최소 1회 구조적 로그를 남긴다", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { createCase } = await import("./create-case");
      runPipelineMock.mockRejectedValueOnce(new Error("pipeline boom"));

      await expect(createCase("owner-log", validInput)).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe("Netlify Background Function job 경로", () => {
    it("startCaseJob은 검증된 입력과 리스를 queued job으로 저장한다", async () => {
      const { startCaseJob } = await import("./create-case");

      const result = await startCaseJob("owner-job", validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const [job] = await db
        .select()
        .from(schema.caseJobs)
        .where(eq(schema.caseJobs.id, result.jobId));
      expect(job).toMatchObject({ ownerUserId: "owner-job", status: "queued", caseId: null });

      const leases = await db
        .select()
        .from(schema.reservations)
        .where(eq(schema.reservations.ownerUserId, "owner-job"));
      expect(leases).toHaveLength(1);
      expect(leases[0].leaseId).toBe(job.leaseId);
    });

    it("cancelCaseJob은 enqueue 실패로 남은 job을 failed로 바꾸고 리스를 해제한다", async () => {
      const { cancelCaseJob, startCaseJob } = await import("./create-case");
      const started = await startCaseJob("owner-job-cancel", validInput);
      expect(started.success).toBe(true);
      if (!started.success) return;

      await cancelCaseJob("owner-job-cancel", started.jobId);

      const [job] = await db
        .select()
        .from(schema.caseJobs)
        .where(eq(schema.caseJobs.id, started.jobId));
      expect(job.status).toBe("failed");
      const leases = await db
        .select()
        .from(schema.reservations)
        .where(eq(schema.reservations.ownerUserId, "owner-job-cancel"));
      expect(leases).toHaveLength(0);
    });

    it("동일 job이 동시에 두 번 호출되어도 파이프라인은 한 번만 실행되고 완료 상태를 유지한다", async () => {
      const { processCaseJob, startCaseJob } = await import("./create-case");
      const started = await startCaseJob("owner-job-race", validInput);
      expect(started.success).toBe(true);
      if (!started.success) return;

      const pending = deferred<typeof sampleReport>();
      runPipelineMock.mockReturnValue(pending.promise);

      const runA = processCaseJob(started.jobId);
      const runB = processCaseJob(started.jobId);

      await vi.waitFor(() => expect(runPipelineMock).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(runPipelineMock).toHaveBeenCalledTimes(1);

      pending.resolve(sampleReport);
      await Promise.all([runA, runB]);

      const [job] = await db
        .select()
        .from(schema.caseJobs)
        .where(eq(schema.caseJobs.id, started.jobId));
      expect(job.status).toBe("completed");
      expect(job.caseId).not.toBeNull();

      const savedCases = await db
        .select()
        .from(schema.cases)
        .where(eq(schema.cases.ownerUserId, "owner-job-race"));
      expect(savedCases).toHaveLength(1);
    });
  });
});
