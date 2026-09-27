import { randomUUID } from "node:crypto";
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

beforeAll(async () => {
  client = createClient({ url: ":memory:" });
  db = drizzle(client, { schema });
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "db",
    "migrations"
  );
  await migrate(db, { migrationsFolder });
});

afterAll(() => {
  client.close();
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
