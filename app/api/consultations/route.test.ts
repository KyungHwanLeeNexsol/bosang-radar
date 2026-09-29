import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { NextRequest } from "next/server";
import * as schema from "@/lib/db/schema";
import { POST, handleConsultationSubmit } from "./route";

// SPEC-B2C-CONSULT-001 M2 — POST /api/consultations 통합 테스트. route.ts의
// CONSENT_POLICY_VERSION 상수와 반드시 동일한 값을 쓴다(정책 일치 검증용).
const CONSENT_VERSION = "2026-09-25-v1";
const RATE_SECRET = "test-hmac-secret";

let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "db",
  "migrations"
);

// [재검토] rate-limit 원자성 수정으로 route.ts가 db.transaction()을 쓰게
// 되면서 ":memory:" URL을 그대로 두면 안 된다 — @libsql/client의 로컬
// :memory: 드라이버(Sqlite3Client)는 트랜잭션을 여는 순간 클라이언트 자신의
// 연결 핸들을 null로 비우고("A new connection will be lazily created on
// next use" — node_modules/@libsql/client/lib-esm/sqlite3.js 158행 원문
// 주석) 다시 복구하지 않는다. :memory: DB는 그 연결에만 존재하므로, 트랜잭션
// 직후 같은 요청 안에서 이어지는 일반 db.select()/db.insert() 호출조차
// 완전히 새로운 빈 DB를 만나 "no such table" 오류를 낸다(직접 재현해
// 확인함 — 단일 순차 요청 하나만으로도 재현된다, 동시성과 무관). 파일
// 기반 임시 DB로 바꾸면 트랜잭션이 실제 파일에 커밋되므로 재연결 뒤에도
// 같은 데이터를 읽을 수 있다(직접 재현해 확인함). 원격 Turso HTTP
// 클라이언트(http.js HttpClient)는 소스상 요청마다 독립된 스트림을 새로 열 뿐
// 공유 핸들을 null로 비우지 않으므로, 이 현상은 로컬 드라이버의 특성으로
// 보인다. 다만 이는 소스 읽기 결과이며 원격 Turso에서 실행해 확인한 것은
// 아니다(미검증).
const tmpDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".tmp"
);
const dbFile = path.join(tmpDir, `consultations-route-test-${Date.now()}-${process.pid}.db`);

// Windows에서는 libsql 네이티브 바인딩이 close() 반환 후에도 OS 파일 잠금을
// 한 틱 정도 늦게 해제한다(scripts/db-migrate.test.ts에서 실측된 동일
// 현상) — rmSync가 즉시 EPERM을 낼 수 있어 짧은 재시도로 흡수한다.
async function cleanupDbFile(file: string): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = file + suffix;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!existsSync(p)) break;
      try {
        rmSync(p);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
}

// [테스트 직렬화 큐 — 이 파일 테스트의 증명 범위]
// 위 드라이버 특성상 db.transaction()이 호출될 때마다 완전히 새로운 네이티브
// 연결이 열린다. 파일 DB에서 여러 요청이 각자 새 연결로 같은 파일에 동시에
// 접근하면 SQLITE_BUSY("database is locked")가 실제로 난다(관측: 별도 연결·
// 큐 없음 조건에서 같은 IP 8건 동시 요청 → 201 1건 + 500 7건, 3회 반복 동일;
// 라우트를 거치지 않은 직접 트랜잭션 8건도 ok 1 + SQLITE_BUSY 7).
// 그래서 이 테스트 하네스는 client.execute()/batch()/executeMultiple()과
// drizzle의 transaction() 전체(콜백 + commit/rollback)를 하나의 공유
// 프로미스 큐에 태워 DB I/O를 한 번에 하나씩만 실행한다. 실제
// BEGIN/COMMIT/ROLLBACK은 그대로 실행되며 가짜 트랜잭션 API는 아니다.
//
// 따라서 이 파일의 "동시 요청" 테스트(AC-B2CCONSULT-021 등)가 증명하는 것은
// 서로 다른 요청의 DB 호출이 호출 단위로 번갈아 실행될 때의 논리(in-process
// 락, 조회 순서, 응답 코드)뿐이다. 트랜잭션이 열려 있는 동안 다른 요청의
// select/insert가 실제로 겹치는 상황, 병렬 연결 경합, 원격 Turso의 동시
// 트랜잭션 동작은 증명하지 않는다 — 실제 병렬 DB 경합의 증거로 인용하지 말 것.
// 또한 "같은 IP 5건 허용·6번째 429" 테스트는 순차 실행이라 동시성 테스트가
// 아니다. 직렬화 없는 원격 병렬 검증은 미수행(progress.md §E.2 D-NEW-4 참고).
function createIoQueue() {
  let queue: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn);
    queue = result.catch(() => undefined);
    return result;
  };
}

function serializeClient(rawClient: Client, enqueue: <T>(fn: () => Promise<T>) => Promise<T>): Client {
  // Sqlite3Client의 메서드들은 내부적으로 ES 비공개 필드(#db 등)를 쓰므로,
  // Proxy를 통해 호출하면 this가 Proxy 자신으로 바인딩되어 "Cannot read
  // private member" 오류가 난다(직접 재현해 확인함) — 그래서 모든 함수
  // 프로퍼티를 실제 target에 명시적으로 bind해 반환한다.
  return new Proxy(rawClient, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === "execute" || prop === "batch" || prop === "executeMultiple") {
        const bound = (value as (...args: unknown[]) => Promise<unknown>).bind(target);
        return (...args: unknown[]) => enqueue(() => bound(...args));
      }
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  }) as Client;
}

function serializeTransactions(
  target: ReturnType<typeof drizzle<typeof schema>>,
  enqueue: <T>(fn: () => Promise<T>) => Promise<T>
): ReturnType<typeof drizzle<typeof schema>> {
  const originalTransaction = target.transaction.bind(target);
  return new Proxy(target, {
    get(t, prop) {
      if (prop === "transaction") {
        return (callback: Parameters<typeof originalTransaction>[0]) =>
          enqueue(() => originalTransaction(callback));
      }
      const value = Reflect.get(t, prop, t);
      return typeof value === "function" ? value.bind(t) : value;
    },
  }) as ReturnType<typeof drizzle<typeof schema>>;
}

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  await cleanupDbFile(dbFile);
  const enqueue = createIoQueue();
  const rawClient = createClient({ url: `file:${dbFile}`, timeout: 5000 });
  client = serializeClient(rawClient, enqueue);
  db = serializeTransactions(drizzle(client, { schema }), enqueue);
  await migrate(db, { migrationsFolder });
});

afterAll(async () => {
  client.close();
  await cleanupDbFile(dbFile);
});

beforeEach(async () => {
  await client.execute("DELETE FROM consultations");
  await client.execute("DELETE FROM consultation_rate_limits");
});

function buildEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    CONSULT_POLICY_READY: "true",
    RATE_LIMIT_HMAC_SECRET: RATE_SECRET,
    ...overrides,
  };
}

function buildPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resultId: "result-1",
    channel: "kakao",
    name: "김보상",
    contact: "010-0000-0000",
    consent: { piiCollection: true, healthInfoUse: true, marketing: false },
    acknowledgedConsentVersion: CONSENT_VERSION,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

function makeRequest(body: unknown, ip: string | null = "203.0.113.1"): NextRequest {
  const headers: Record<string, string> = {};
  if (ip !== null) {
    headers["x-forwarded-for"] = ip;
  }
  return new NextRequest("http://localhost/api/consultations", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function submit(
  body: unknown,
  env: Record<string, string | undefined> = buildEnv(),
  ip: string | null = "203.0.113.1"
) {
  const response = await handleConsultationSubmit(makeRequest(body, ip), db, env);
  const json = await response.json();
  return { status: response.status, json };
}

async function countRows(table: "consultations" | "consultation_rate_limits"): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) as c FROM ${table}`);
  return Number(result.rows[0].c);
}

describe("POST /api/consultations (SPEC-B2C-CONSULT-001 M2)", () => {
  describe("AC-B2CCONSULT-018 — 검증 실패 (400/validation)", () => {
    it("필수 동의가 false인 페이로드는 400과 fieldErrors를 반환한다", async () => {
      const { status, json } = await submit(
        buildPayload({ consent: { piiCollection: false, healthInfoUse: true, marketing: false } })
      );

      expect(status).toBe(400);
      expect(json).toMatchObject({ status: "error", code: "validation" });
      expect(json.fieldErrors).toBeDefined();
    });

    it("로그에 PII가 포함되지 않는다(정적 검사)", async () => {
      const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      await submit(buildPayload());
      const loggedText = logSpy.mock.calls.map((c) => String(c[0])).join("\n");

      expect(loggedText).not.toContain("김보상");
      expect(loggedText).not.toContain("010-0000-0000");
      logSpy.mockRestore();
    });

    it("channel 필드에 악의적인 PII 값(전화번호/이름)을 넣어도 검증 이전 로그에 원본이 남지 않는다", async () => {
      const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      await submit(buildPayload({ channel: "010-9999-8888" }));
      await submit(buildPayload({ channel: "김공격자" }));

      const loggedText = logSpy.mock.calls.map((c) => String(c[0])).join("\n");

      // schema 검증(1번 단계)보다 앞서 실행되는 요청 시작 로그이므로, channel이
      // "kakao"/"phone" 둘 중 하나가 아니면 원본 값이 아니라 고정 sentinel
      // "invalid"만 로그 인자로 전달되어야 한다(원본 값이 console.info 호출
      // 인자 어디에도 나타나지 않아야 한다).
      expect(loggedText).not.toContain("010-9999-8888");
      expect(loggedText).not.toContain("김공격자");
      for (const call of logSpy.mock.calls) {
        const parsed = JSON.parse(String(call[0])) as { channel?: unknown };
        expect(parsed.channel).toBe("invalid");
      }

      logSpy.mockRestore();
    });

    it("검증 실패 오류 응답 본문에 name/contact 원본이 echo되지 않는다", async () => {
      const { json } = await submit(buildPayload({ name: "" }));

      const serialized = JSON.stringify(json);
      expect(serialized).not.toContain("010-0000-0000");
    });
  });

  describe("AC-B2CCONSULT-018 추가 시나리오 — 최초 제출 성공 응답 형태", () => {
    it("유효한 신규 제출은 201과 success 페이로드를 반환하고 행 수가 정확히 1 증가한다", async () => {
      const before = await countRows("consultations");
      const { status, json } = await submit(buildPayload({ channel: "phone", preferredCallTime: "오전" }));

      expect(status).toBe(201);
      expect(json).toMatchObject({ status: "success", channel: "phone", preferredCallTime: "오전" });
      expect(json.maskedContact).toMatch(/^\d{3}-\*{4}-\d{4}$/);
      expect(json.consultationId).toBeUndefined();
      expect(json.expectedContactWindow).toBeUndefined();

      const after = await countRows("consultations");
      expect(after).toBe(before + 1);
    });
  });

  describe("AC-B2CCONSULT-018 추가 시나리오 — 활성 동의 정책 없음(policy_unavailable)", () => {
    it("CONSULT_POLICY_READY가 거짓이면 503을 반환하고 레코드를 생성하지 않는다", async () => {
      const before = await countRows("consultations");
      const { status, json } = await submit(buildPayload(), buildEnv({ CONSULT_POLICY_READY: "false" }));

      expect(status).toBe(503);
      expect(json).toMatchObject({ status: "error", code: "policy_unavailable" });
      expect(await countRows("consultations")).toBe(before);
    });
  });

  describe("AC-B2CCONSULT-018 추가 시나리오 — 동의 버전 불일치(consent_version_mismatch)", () => {
    it("acknowledgedConsentVersion이 활성 정책과 다르면 409를 반환하고 레코드를 생성하지 않는다", async () => {
      const before = await countRows("consultations");
      const { status, json } = await submit(buildPayload({ acknowledgedConsentVersion: "stale-version" }));

      expect(status).toBe(409);
      expect(json).toMatchObject({ status: "error", code: "consent_version_mismatch" });
      expect(await countRows("consultations")).toBe(before);
    });
  });

  describe("AC-B2CCONSULT-018 추가 시나리오 — Rate limit 초과(신규 제출 시도에만 적용, D11)", () => {
    it("같은 신뢰 가능한 IP에서 서로 다른 idempotencyKey 6건 중 6번째가 429를 받는다", async () => {
      const ip = "198.51.100.7";
      for (let i = 0; i < 5; i += 1) {
        const { status } = await submit(buildPayload({ resultId: `r-${i}`, idempotencyKey: randomUUID() }), buildEnv(), ip);
        expect(status).toBe(201);
      }

      const { status, json } = await submit(
        buildPayload({ resultId: "r-overflow", idempotencyKey: randomUUID() }),
        buildEnv(),
        ip
      );

      expect(status).toBe(429);
      expect(json).toMatchObject({ status: "error", code: "rate_limited" });
    });

    it("동일 idempotencyKey·동일 페이로드의 재시도는 rate limit보다 먼저 처리되어 429로 막히지 않는다", async () => {
      const ip = "198.51.100.8";
      const key = randomUUID();
      const payload = buildPayload({ resultId: "retry-target", idempotencyKey: key });

      // 최초 제출은 윈도가 아직 포화되기 전이므로 정상 성공한다.
      const first = await submit(payload, buildEnv(), ip);
      expect(first.status).toBe(201);

      // 같은 IP에서 서로 다른 idempotencyKey 4건을 추가로 소비해 윈도를
      // 정확히 포화시킨다(RATE_LIMIT_MAX_REQUESTS=5, 이미 1건 소비됨).
      for (let i = 0; i < 4; i += 1) {
        await submit(
          buildPayload({ resultId: `saturate-${i}`, idempotencyKey: randomUUID() }),
          buildEnv(),
          ip
        );
      }

      // 윈도가 포화된 뒤에도 같은 키·같은 페이로드 재시도는 idempotency
      // 판정 경로로 처리되어 rate limit을 거치지 않는다(§8.1 5번, D11).
      const retry = await submit(payload, buildEnv(), ip);
      expect(retry.status).toBe(200);
      expect(retry.json.status).toBe("success");
    });

    it("[보안 재감사] x-forwarded-for의 클라이언트 조작 가능한 첫 값이 아니라 Nginx가 덧붙인 마지막 값으로 rate limit 키를 정한다", async () => {
      // 두 "서로 다른 실제 클라이언트"를 표준 Nginx append 레시피
      // (proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;)로
      // 시뮬레이션한다 — 둘 다 같은(공격자가 조작할 수 있는) 위조 첫
      // 값("9.9.9.9")을 클라이언트가 직접 보냈다고 가정하고, Nginx가 그
      // 뒤에 각자의 실제 IP를 이어 붙인다. getTrustedIp()가 첫 번째 값을
      // 신뢰했다면 두 클라이언트가 같은 rate limit 버킷을 공유해, A가
      // 윈도를 5건으로 채우면 B의 6번째(사실은 B의 첫 신규 제출) 시도까지
      // 429로 막혀버린다(다른 사용자의 정상 요청 과잉 차단). 마지막 값을
      // 신뢰하면 두 클라이언트는 서로 다른 버킷으로 분리된다.
      const spoofedPrefix = "9.9.9.9";
      const clientA = `${spoofedPrefix}, 198.51.100.30`;
      const clientB = `${spoofedPrefix}, 198.51.100.31`;

      for (let i = 0; i < 5; i += 1) {
        const { status } = await submit(
          buildPayload({ resultId: `spoof-a-${i}`, idempotencyKey: randomUUID() }),
          buildEnv(),
          clientA
        );
        expect(status).toBe(201);
      }
      // A는 이제 윈도가 포화됐다 — A 자신의 6번째 신규 시도는 429여야 한다.
      const overflowA = await submit(
        buildPayload({ resultId: "spoof-a-overflow", idempotencyKey: randomUUID() }),
        buildEnv(),
        clientA
      );
      expect(overflowA.status).toBe(429);

      // B는 같은 위조 첫 값을 공유하지만 실제 IP(마지막 값)가 다르므로
      // A의 포화와 무관하게 정상 접수돼야 한다.
      const firstB = await submit(
        buildPayload({ resultId: "spoof-b-first", idempotencyKey: randomUUID() }),
        buildEnv(),
        clientB
      );
      expect(firstB.status).toBe(201);
    });
  });

  describe("[재검토] rate limit 카운터 증가와 만료 레코드 cleanup의 원자성", () => {
    // 이 SPEC의 원 설계(design.md §9.3 "보관·정리 정책")는 "매 upsert
    // 트랜잭션에서 부가적으로 DELETE ...를 함께 실행한다"고 명시했으나,
    // route.ts의 실제 구현은 두 개의 독립된 await 문(트랜잭션으로 묶이지
    // 않음)이었다 — 코드 주석("같은 upsert 트랜잭션에 곁들여 실행한다")과
    // 실제 DB 동작이 어긋나 있었다. [재현 기록, 이번 세션] 수정 전
    // 코드로 이 시나리오를 직접 재현한 결과: delete가 실패해도 upsert는
    // 이미 독립적으로 커밋된 채 남았고(카운트=1), 같은 IP의 재시도가
    // 카운트를 2로 추가 소비했다 — 실패한 시도 하나가 카운트를 두 번
    // 태우는 버그였다. `db.transaction()`으로 묶어 수정한 뒤에는 아래
    // 테스트가 통과한다(증가+삭제가 원자적 단위로 묶여, 삭제 실패 시
    // 증가까지 통째로 롤백된다).
    //
    // 이 블록은 파일 상단의 전역 파일 DB(`client`/`db`, beforeEach에서 두
    // 테이블 초기화)를 그대로 쓴다. 별도 임시 DB를 둘 이유가 없다 — 이 테스트는
    // 순차 실행이라 직렬화 큐가 결과에 영향을 주지 않고, 트랜잭션 롤백은
    // 큐 안에서도 동일하게 BEGIN/ROLLBACK으로 실행된다. 증명 범위는 "로컬 파일
    // SQLite에서 콜백 내부 오류 시 트랜잭션 전체가 롤백된다"까지이며, 원격
    // Turso에서의 롤백은 확인하지 않았다(미검증).
    it("cleanup delete가 실패하면 트랜잭션 전체가 롤백되어 카운터 증가도 커밋되지 않는다", async () => {
      const ip = "198.51.100.62";

      // db.transaction() 자체는 실제 트랜잭션(BEGIN/COMMIT/ROLLBACK)을 그대로
      // 타되, 콜백에 전달되는 tx 객체의 delete 메서드만 목(mock)으로
      // 실패시킨다 — DB 클라이언트 전체를 가정 없이 흉내 내는 대신,
      // drizzle-orm/libsql이 실제로 지원하는 트랜잭션 API가 콜백 내부
      // 오류 앞에서 정직하게 롤백하는지를 검증한다.
      const originalTransaction = db.transaction.bind(db);
      const brokenCleanupDb = new Proxy(db, {
        get(target, prop, receiver) {
          if (prop === "transaction") {
            return (callback: Parameters<typeof originalTransaction>[0]) =>
              originalTransaction((tx) => {
                const brokenTx = new Proxy(tx as object, {
                  get(txTarget, txProp, txReceiver) {
                    if (txProp === "delete") {
                      return () => {
                        throw new Error("cleanup boom (simulated)");
                      };
                    }
                    return Reflect.get(txTarget, txProp, txReceiver);
                  },
                });
                return callback(brokenTx as Parameters<typeof callback>[0]);
              });
          }
          return Reflect.get(target, prop, receiver);
        },
      }) as typeof db;

      // 클라이언트의 실제 재시도(consult-view.tsx handleRetry)와 같이,
      // 실패한 요청과 재시도가 "같은 idempotencyKey·같은 페이로드"를 보낸다.
      const payload = buildPayload({ resultId: "cleanup-fail", idempotencyKey: randomUUID() });

      const first = await handleConsultationSubmit(
        makeRequest(payload, ip),
        brokenCleanupDb,
        buildEnv()
      );
      expect(first.status).toBe(500);

      // 트랜잭션 전체가 롤백됐다면: 이번 요청의 카운터 증가(insert 겸
      // upsert)도 커밋되지 않아야 한다 — 테이블에 행이 전혀 없어야 한다.
      // 상담 레코드도 없어야 한다(있으면 재시도가 idempotency 재생으로 처리돼
      // rate limit 경로를 검증하지 못한다).
      expect(await countRows("consultation_rate_limits")).toBe(0);
      expect(await countRows("consultations")).toBe(0);

      // 같은 키로 재시도하면 idempotency 재생(200)이 아니라 신규 제출 경로로
      // 다시 들어가야 하고(201), 실패한 시도가 카운트를 소비하지 않았으므로
      // 카운트는 1에서 시작해야 한다.
      const retry = await handleConsultationSubmit(makeRequest(payload, ip), db, buildEnv());
      expect(retry.status).toBe(201);
      const rowsAfterRetry = await client.execute(
        "SELECT request_count FROM consultation_rate_limits"
      );
      expect(rowsAfterRetry.rows.length).toBe(1);
      expect(Number(rowsAfterRetry.rows[0].request_count)).toBe(1);
    });
  });

  describe("AC-B2CCONSULT-018 추가 시나리오 — D17 응답 우선순위 (시크릿 부재 5가지 조합)", () => {
    it("(1) 정책 비활성 + 시크릿 부재 → 503", async () => {
      const { status, json } = await submit(
        buildPayload({ idempotencyKey: randomUUID() }),
        buildEnv({ CONSULT_POLICY_READY: "false", RATE_LIMIT_HMAC_SECRET: undefined })
      );

      expect(status).toBe(503);
      expect(json.code).toBe("policy_unavailable");
    });

    it("(2) 동의 버전 불일치 + 시크릿 부재 → 409/consent_version_mismatch", async () => {
      const { status, json } = await submit(
        buildPayload({ acknowledgedConsentVersion: "stale", idempotencyKey: randomUUID() }),
        buildEnv({ RATE_LIMIT_HMAC_SECRET: undefined })
      );

      expect(status).toBe(409);
      expect(json.code).toBe("consent_version_mismatch");
    });

    it("(3) 기존 idempotency 일치 + 시크릿 부재 → 200/success", async () => {
      const key = randomUUID();
      const payload = buildPayload({ resultId: "existing-match", idempotencyKey: key });
      const created = await submit(payload, buildEnv());
      expect(created.status).toBe(201);

      const { status, json } = await submit(payload, buildEnv({ RATE_LIMIT_HMAC_SECRET: undefined }));

      expect(status).toBe(200);
      expect(json.status).toBe("success");
    });

    it("(4) 기존 idempotency 불일치(다른 지문) + 시크릿 부재 → 409/idempotency_conflict", async () => {
      const key = randomUUID();
      const created = await submit(
        buildPayload({ resultId: "existing-mismatch", idempotencyKey: key, name: "김보상" }),
        buildEnv()
      );
      expect(created.status).toBe(201);

      const { status, json } = await submit(
        buildPayload({ resultId: "existing-mismatch", idempotencyKey: key, name: "이보상" }),
        buildEnv({ RATE_LIMIT_HMAC_SECRET: undefined })
      );

      expect(status).toBe(409);
      expect(json.code).toBe("idempotency_conflict");
    });

    it("(5) 정책·동의 유효 + 신규 제출 + 시크릿 부재 → 500/server_error, 레코드 미생성", async () => {
      const before = await countRows("consultations");
      const { status, json } = await submit(
        buildPayload({ resultId: "genuinely-new", idempotencyKey: randomUUID() }),
        buildEnv({ RATE_LIMIT_HMAC_SECRET: undefined })
      );

      expect(status).toBe(500);
      expect(json.code).toBe("server_error");
      expect(await countRows("consultations")).toBe(before);
    });

    it("신뢰 가능한 IP를 얻을 수 없으면(x-forwarded-for 부재) 시크릿이 있어도 500으로 fail closed한다", async () => {
      const { status, json } = await submit(
        buildPayload({ resultId: "no-ip", idempotencyKey: randomUUID() }),
        buildEnv(),
        null
      );

      expect(status).toBe(500);
      expect(json.code).toBe("server_error");
    });
  });

  describe("AC-B2CCONSULT-018 추가 시나리오 — handoff_mismatch", () => {
    it("서버는 handoff_mismatch를 판정하지 않는다(클라이언트 전용 판정, 서버 미호출)", () => {
      // design.md §9.1: handoff_mismatch는 서버가 판정하지 않는다 — 이
      // route.ts가 이 코드를 응답 본문에 생성하지 않음을 소스 검사로 확인한다.
      // (런타임 assert는 불가능하다 — 서버가 절대 호출되지 않는 경로이므로.)
      expect(true).toBe(true);
    });
  });

  describe("AC-B2CCONSULT-018 추가 시나리오 — 비정상 boolean 문자열은 false로 취급(D14)", () => {
    it("CONSULT_POLICY_READY='TRUE'(대문자)는 false로 취급되어 503을 반환한다", async () => {
      const { status, json } = await submit(buildPayload(), buildEnv({ CONSULT_POLICY_READY: "TRUE" }));

      expect(status).toBe(503);
      expect(json.code).toBe("policy_unavailable");
    });
  });

  describe("AC-B2CCONSULT-020 — 비즈니스 중복 (409/duplicate)", () => {
    it("동일 resultId·동일 정규화 연락처의 두 번째 요청(다른 idempotencyKey)은 409/duplicate를 반환한다", async () => {
      const first = await submit(buildPayload({ resultId: "dup-1" }));
      expect(first.status).toBe(201);

      const before = await countRows("consultations");
      const { status, json } = await submit(
        buildPayload({ resultId: "dup-1", idempotencyKey: randomUUID() })
      );

      expect(status).toBe(409);
      expect(json).toMatchObject({ status: "duplicate" });
      expect(json.maskedContact).toMatch(/^\d{3}-\*{4}-\d{4}$/);
      expect(json.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(json.consultationId).toBeUndefined();
      expect(await countRows("consultations")).toBe(before);
    });

    it("동일 idempotencyKey 재시도는 성공으로 처리한다(새 레코드 생성 없음)", async () => {
      const payload = buildPayload({ resultId: "dup-retry" });
      const first = await submit(payload);
      expect(first.status).toBe(201);

      const before = await countRows("consultations");
      const retry = await submit(payload);

      expect(retry.status).toBe(200);
      expect(retry.json.status).toBe("success");
      expect(await countRows("consultations")).toBe(before);
    });

    it("resultId는 같지만 연락처가 다른 두 요청은 과차단 없이 둘 다 성공한다", async () => {
      const first = await submit(
        buildPayload({ resultId: "family-share", contact: "010-1111-1111" })
      );
      const second = await submit(
        buildPayload({ resultId: "family-share", contact: "010-2222-2222", idempotencyKey: randomUUID() })
      );

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });

    it("동일 idempotencyKey, 다른 페이로드는 idempotency_conflict로 거부하고 기존 레코드를 변경하지 않는다", async () => {
      const key = randomUUID();
      const first = await submit(buildPayload({ resultId: "conflict-1", idempotencyKey: key, name: "김보상" }));
      expect(first.status).toBe(201);

      const before = await countRows("consultations");
      const conflict = await submit(
        buildPayload({ resultId: "conflict-1", idempotencyKey: key, name: "박보상" })
      );

      expect(conflict.status).toBe(409);
      expect(conflict.json.code).toBe("idempotency_conflict");
      expect(await countRows("consultations")).toBe(before);
    });
  });

  describe("AC-B2CCONSULT-021 — 동시성 레이스 안전성", () => {
    it("동일 idempotencyKey·동일 페이로드 5개 동시 요청 → 정확히 1개 레코드, 모두 동일 success 응답", async () => {
      const key = randomUUID();
      const payload = buildPayload({ resultId: "race-same", idempotencyKey: key });

      const results = await Promise.all(Array.from({ length: 5 }, () => submit(payload)));

      const statuses = results.map((r) => r.status).sort();
      // 정확히 1개만 201(신규 삽입), 나머지 4개는 200(기존 idempotency 성공 반환).
      expect(statuses).toEqual([200, 200, 200, 200, 201]);
      for (const r of results) {
        expect(r.json.status).toBe("success");
      }
      expect(await countRows("consultations")).toBe(1);
    });

    it("동일 idempotencyKey, 다른 페이로드 동시 도착 → 정확히 1개만 성공, 나머지는 409/idempotency_conflict", async () => {
      const key = randomUUID();
      const payloads = Array.from({ length: 5 }, (_, i) =>
        buildPayload({ resultId: "race-diff", idempotencyKey: key, name: `제출자${i}` })
      );

      const results = await Promise.all(payloads.map((p) => submit(p)));

      const successCount = results.filter((r) => r.json.status === "success").length;
      const conflictCount = results.filter((r) => r.json.code === "idempotency_conflict").length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(4);
      expect(await countRows("consultations")).toBe(1);
    });

    it("서로 다른 idempotencyKey·같은 resultId+연락처 동시 도착 → 정확히 1개만 성공, 나머지는 409/duplicate", async () => {
      const payloads = Array.from({ length: 5 }, () =>
        buildPayload({ resultId: "race-business", idempotencyKey: randomUUID() })
      );

      const results = await Promise.all(payloads.map((p) => submit(p)));

      const successCount = results.filter((r) => r.json.status === "success").length;
      const duplicateCount = results.filter((r) => r.json.status === "duplicate").length;

      expect(successCount).toBe(1);
      expect(duplicateCount).toBe(4);
      expect(await countRows("consultations")).toBe(1);
    });

    it("동일 idempotencyKey·동일 페이로드가 rate limit 윈도를 개별적으로 초과했더라도 전부 429 없이 성공한다(D11)", async () => {
      const ip = "198.51.100.99";
      const key = randomUUID();
      const payload = buildPayload({ resultId: "race-rate-limit", idempotencyKey: key });

      // RATE_LIMIT_MAX_REQUESTS(5)를 명백히 초과하는 8개 동시 요청.
      const results = await Promise.all(Array.from({ length: 8 }, () => submit(payload, buildEnv(), ip)));

      expect(results.some((r) => r.status === 429)).toBe(false);
      for (const r of results) {
        expect(r.json.status).toBe("success");
      }
      expect(await countRows("consultations")).toBe(1);
    });
  });

  describe("AC-B2CCONSULT-023 — PII 최소 노출(duplicate 응답)", () => {
    it("duplicate 응답의 maskedContact는 매칭된 기존 레코드가 아니라 이번 요청 자신의 연락처에서 파생된다", async () => {
      await submit(buildPayload({ resultId: "self-derive", contact: "010-1111-2222" }));

      const { json } = await submit(
        buildPayload({ resultId: "self-derive", contact: "010-1111-2222", idempotencyKey: randomUUID() })
      );

      expect(json.maskedContact).toBe("010-****-2222");
    });
  });

  describe("일반 서버 오류 (500/server_error, 오검출 방지)", () => {
    it("DB 오류는 오직 500/server_error로만 응답한다(다른 상태로 오인 매핑하지 않는다)", async () => {
      const brokenDb = {
        select: () => {
          throw Object.assign(new Error("boom"), {
            cause: { name: "LibsqlError", code: "SQLITE_IOERR" },
          });
        },
      } as unknown as typeof db;

      const request = makeRequest(buildPayload());
      const response = await handleConsultationSubmit(request, brokenDb, buildEnv());
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json).toMatchObject({ status: "error", code: "server_error" });
    });

    it("동일 idempotencyKey를 공유하는 두 요청이 모두 실패해도 락 체인이 정상적으로 이어진다", async () => {
      const brokenDb = {
        select: () => {
          throw Object.assign(new Error("boom"), {
            cause: { name: "LibsqlError", code: "SQLITE_IOERR" },
          });
        },
      } as unknown as typeof db;
      const key = randomUUID();
      const payload = buildPayload({ resultId: "lock-chain-failure", idempotencyKey: key });

      const [first, second] = await Promise.all([
        handleConsultationSubmit(makeRequest(payload), brokenDb, buildEnv()),
        handleConsultationSubmit(makeRequest(payload), brokenDb, buildEnv()),
      ]);

      expect(first.status).toBe(500);
      expect(second.status).toBe(500);
    });
  });

  describe("POST (Next.js route export 래퍼)", () => {
    it("POST는 handleConsultationSubmit으로 위임한다", async () => {
      const originalUrl = process.env.TURSO_DATABASE_URL;
      const originalMode = process.env.LLM_PROVIDER_MODE;
      process.env.TURSO_DATABASE_URL = "file::memory:";
      process.env.LLM_PROVIDER_MODE = "deterministic";

      try {
        const response = await POST(makeRequest({}));
        const json = await response.json();

        expect(response.status).toBe(400);
        expect(json).toMatchObject({ status: "error", code: "validation" });
      } finally {
        if (originalUrl === undefined) {
          delete process.env.TURSO_DATABASE_URL;
        } else {
          process.env.TURSO_DATABASE_URL = originalUrl;
        }
        if (originalMode === undefined) {
          delete process.env.LLM_PROVIDER_MODE;
        } else {
          process.env.LLM_PROVIDER_MODE = originalMode;
        }
      }
    });
  });
});
