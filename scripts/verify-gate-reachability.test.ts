import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CONSENT_POLICY_VERSION } from "../lib/consult/consent-policy";
import { ConsultationRequestSchema } from "../lib/consult/schema";
import {
  CLOSED_TITLE,
  assembleGateReachabilityEnv,
  buildMismatchProbe,
  checkPreconditions,
  compareGateReachability,
  extractApiCode,
  findEnvFileViolation,
  formatGateReachabilityReport,
  type GateReachabilityObservation,
} from "./verify-gate-reachability";

// SPEC-B2C-LAUNCH-001 M3a (AC-B2CLAUNCH-009 시나리오 2) — verify-gate-reachability.ts의 순수 판정·안전 함수
// 단위 시험. 실제 build/start 관측은 느려서 스크립트를 직접 실행한다(`tsx scripts/verify-gate-reachability.ts`).

const SCRIPT_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "verify-gate-reachability.ts"),
  "utf-8"
);

const MATCHING: GateReachabilityObservation = {
  consultTitle: CLOSED_TITLE,
  consultHasPlaceholder: true,
  apiStatus: 409,
  apiCode: "consent_version_mismatch",
  rowsBefore: 0,
  rowsAfter: 0,
};

const DB_URL = "file:C:/synthetic/gate-reachability.db";
const SECRET = "synthetic-secret-for-unit-test";

describe("compareGateReachability — AC-B2CLAUNCH-009 시나리오 2의 세 관측", () => {
  it("/consult가 placeholder이고 API가 409 consent_version_mismatch이며 행 수가 같으면 불일치가 없다", () => {
    expect(compareGateReachability(MATCHING)).toEqual([]);
  });

  it("/consult 제목이 placeholder 제목이 아니면 불일치다", () => {
    const mismatches = compareGateReachability({ ...MATCHING, consultTitle: "상담 신청" });

    expect(mismatches).toEqual([expect.stringContaining("/consult 제목")]);
  });

  it("/consult 본문에 placeholder 문구가 없으면 불일치다", () => {
    const mismatches = compareGateReachability({ ...MATCHING, consultHasPlaceholder: false });

    expect(mismatches).toEqual([expect.stringContaining("/consult placeholder 문구")]);
  });

  it("API가 503이면(정책 미준비 응답) 불일치다 — 접수가 열려 있다는 사실이 관측되지 않은 것이다", () => {
    const mismatches = compareGateReachability({
      ...MATCHING,
      apiStatus: 503,
      apiCode: "policy_unavailable",
    });

    expect(mismatches).toHaveLength(2);
    expect(mismatches[0]).toContain("API 상태");
    expect(mismatches[1]).toContain("API 오류 코드");
  });

  it("API가 201이면(접수됨) 불일치다", () => {
    const mismatches = compareGateReachability({ ...MATCHING, apiStatus: 201, apiCode: null });

    expect(mismatches.some((m) => m.includes("API 상태"))).toBe(true);
  });

  it("상태는 409이나 오류 코드가 다르면 불일치다", () => {
    const mismatches = compareGateReachability({ ...MATCHING, apiCode: "idempotency_conflict" });

    expect(mismatches).toEqual([expect.stringContaining("API 오류 코드")]);
  });

  it("요청 뒤 행 수가 늘면 불일치다", () => {
    const mismatches = compareGateReachability({ ...MATCHING, rowsBefore: 0, rowsAfter: 1 });

    expect(mismatches).toEqual([expect.stringContaining("consultations 행 수")]);
  });
});

describe("formatGateReachabilityReport", () => {
  it("기대와 같으면 관측 줄이 모두 OK이고 시크릿·DB 경로를 적지 않는다", () => {
    const report = formatGateReachabilityReport(MATCHING).join("\n");

    expect(report).not.toContain("MISMATCH");
    expect(report.match(/ OK$/gm)).toHaveLength(5);
    expect(report).not.toMatch(/file:|secret|시크릿=[^설]/);
  });

  it("어긋난 관측 줄에만 MISMATCH를 붙인다", () => {
    const report = formatGateReachabilityReport({
      ...MATCHING,
      apiStatus: 503,
      apiCode: "policy_unavailable",
    });

    expect(report.filter((line) => line.endsWith("MISMATCH"))).toEqual([
      expect.stringContaining("상태: 기대 409 / 관측 503"),
      expect.stringContaining("오류 코드: 기대 consent_version_mismatch / 관측 policy_unavailable"),
    ]);
  });
});

describe("extractApiCode / buildMismatchProbe", () => {
  it("오류 응답 본문의 code를 꺼내고 JSON이 아니거나 code가 없으면 null이다", () => {
    expect(extractApiCode('{"status":"error","code":"consent_version_mismatch"}')).toBe(
      "consent_version_mismatch"
    );
    expect(extractApiCode("not json")).toBeNull();
    expect(extractApiCode('{"status":"success"}')).toBeNull();
    expect(extractApiCode("[1,2]")).toBeNull();
  });

  it("관측용 요청은 스키마를 통과하지만 동의 버전이 활성 정책 버전과 다르다", () => {
    const body = buildMismatchProbe();

    expect(ConsultationRequestSchema.safeParse(body).success).toBe(true);
    expect(body.acknowledgedConsentVersion).not.toBe(CONSENT_POLICY_VERSION);
  });

  it("관측용 요청의 값은 호출마다 새로 만든다(고정 리터럴이 아니다)", () => {
    const first = buildMismatchProbe();
    const second = buildMismatchProbe();

    for (const key of [
      "resultId",
      "name",
      "contact",
      "acknowledgedConsentVersion",
      "idempotencyKey",
    ]) {
      expect(first[key]).not.toBe(second[key]);
    }
  });
});

describe("assembleGateReachabilityEnv — 자식 프로세스 환경", () => {
  const parent: Record<string, string | undefined> = {
    PATH: "/synthetic/path",
    TURSO_DATABASE_URL: "file:./.tmp/parent.db",
    TURSO_AUTH_TOKEN: "parent-token",
    ENABLE_CONSULT_FLOW: "true",
    ENABLE_DIAGNOSIS_FLOW: "true",
    DIAGNOSIS_ENGINE_READY: "true",
    ENABLE_DIAGNOSIS_DEV_STATES: "true",
    CONSULT_POLICY_READY: "false",
    RATE_LIMIT_HMAC_SECRET: "parent-secret",
    GEMINI_API_KEY: "parent-key",
  };

  it("상담 접수 플래그만 참이고 화면·진단 플래그는 모두 미설정이다", () => {
    const env = assembleGateReachabilityEnv(parent, { dbUrl: DB_URL, secret: SECRET });

    expect(env.ENABLE_CONSULT_FLOW).toBeUndefined();
    expect(env.CONSULT_POLICY_READY).toBe("true");
    expect(env.ENABLE_DIAGNOSIS_FLOW).toBeUndefined();
    expect(env.DIAGNOSIS_ENGINE_READY).toBeUndefined();
    expect(env.ENABLE_DIAGNOSIS_DEV_STATES).toBeUndefined();
  });

  it("DB는 인자로 받은 로컬 file: 주소이고 시크릿은 인자로 받은 시험용 값이다", () => {
    const env = assembleGateReachabilityEnv(parent, { dbUrl: DB_URL, secret: SECRET });

    expect(env.TURSO_DATABASE_URL).toBe(DB_URL);
    expect(env.TURSO_AUTH_TOKEN).toBe("");
    expect(env.RATE_LIMIT_HMAC_SECRET).toBe(SECRET);
    expect(env.LLM_PROVIDER_MODE).toBe("deterministic");
  });

  it("부모 환경의 플래그·DB·시크릿·키 계열 값은 물려주지 않고 그 밖의 변수는 남긴다", () => {
    const env = assembleGateReachabilityEnv(parent, { dbUrl: DB_URL, secret: SECRET });

    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(Object.values(env)).not.toContain("parent-secret");
    expect(Object.values(env)).not.toContain("parent-token");
    expect(env.PATH).toBe("/synthetic/path");
  });

  it("부모 환경 객체를 바꾸지 않는다", () => {
    const before = structuredClone(parent);

    assembleGateReachabilityEnv(parent, { dbUrl: DB_URL, secret: SECRET });

    expect(parent).toEqual(before);
  });

  it("부모 환경의 DB 주소가 file:이 아니면 주소를 되풀이하지 않고 거부한다", () => {
    const remote = { ...parent, TURSO_DATABASE_URL: "libsql://synthetic-host-example" };

    expect(() => assembleGateReachabilityEnv(remote, { dbUrl: DB_URL, secret: SECRET })).toThrow(
      /file:/
    );
    try {
      assembleGateReachabilityEnv(remote, { dbUrl: DB_URL, secret: SECRET });
    } catch (error) {
      expect((error as Error).message).not.toContain("synthetic-host-example");
    }
  });

  it("인자로 받은 DB 주소가 file:이 아니면 거부한다", () => {
    expect(() =>
      assembleGateReachabilityEnv(parent, {
        dbUrl: "libsql://synthetic-host-example",
        secret: SECRET,
      })
    ).toThrow(/file:/);
  });

  it("시크릿이 비어 있으면 거부한다(비어 있으면 부팅 검증이 설정되지 않은 것으로 읽는다)", () => {
    expect(() => assembleGateReachabilityEnv(parent, { dbUrl: DB_URL, secret: "" })).toThrow(
      /시크릿/
    );
  });
});

describe("findEnvFileViolation / checkPreconditions — 환경 파일과 원격 DB 거부", () => {
  const ROOT = "/synthetic/root";
  const only =
    (...names: string[]) =>
    (path: string) =>
      names.some((n) => path === join(ROOT, n));

  it("프로덕션 빌드·시작이 읽는 환경 파일이 하나라도 있으면 파일 이름만 적어 거부한다", () => {
    for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
      const violation = findEnvFileViolation(ROOT, only(name));

      expect(violation).toContain(name);
    }
  });

  it("환경 파일이 없거나 예시 파일(.env.local.example)만 있으면 통과한다", () => {
    expect(findEnvFileViolation(ROOT, only())).toBeNull();
    expect(findEnvFileViolation(ROOT, only(".env.local.example"))).toBeNull();
  });

  it("사전 점검은 환경 파일과 원격 DB 주소를 모두 모아 알린다", () => {
    const violations = checkPreconditions(
      { TURSO_DATABASE_URL: "libsql://synthetic-host-example" },
      ROOT,
      only(".env.local")
    );

    expect(violations).toHaveLength(2);
    expect(violations.join("|")).not.toContain("synthetic-host-example");
  });

  it("사전 점검은 깨끗한 상태와 file: DB 주소에서는 위반이 없다", () => {
    expect(checkPreconditions({}, ROOT, only())).toEqual([]);
    expect(checkPreconditions({ TURSO_DATABASE_URL: "file:./.tmp/x.db" }, ROOT, only())).toEqual(
      []
    );
  });
});

describe("스크립트 소스의 안전 규칙(정적 확인)", () => {
  it("환경 파일을 읽는 호출이 없다", () => {
    expect(SCRIPT_SOURCE).not.toMatch(/readFile|createReadStream|loadEnvConfig|dotenv|@next\/env/);
  });

  it("process.env에 값을 대입하지 않는다(플래그는 자식 환경 객체에만 둔다)", () => {
    expect(SCRIPT_SOURCE).not.toMatch(/process\.env(\.\w+|\[[^\]]+\])\s*=[^=]/);
  });

  it("원격 주소 문자열이 없다", () => {
    expect(SCRIPT_SOURCE).not.toMatch(/https?:\/\//);
  });
});
