import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CONSENT_POLICY_VERSION } from "../lib/consult/consent-policy";
import { ConsultationRequestSchema } from "../lib/consult/schema";
import { inspectRollbackEnv } from "../lib/launch/rollback-observation";
import { assembleRollbackEnvs, buildSeedProbe, toRecords } from "./verify-rollback-dark";

// SPEC-B2C-LAUNCH-001 M5 (AC-B2CLAUNCH-014) — verify-rollback-dark.ts의 순수 부분(환경 조립·접수 요청 본문·행
// 변환) 단위 시험. 실제 build/start 관측은 느려서 스크립트를 직접 실행한다(`tsx scripts/verify-rollback-dark.ts`).

const SCRIPT_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "verify-rollback-dark.ts"),
  "utf-8"
);

const DB_URL = "file:C:/synthetic/rollback-dark.db";
const SECRET = "synthetic-secret-for-unit-test";

describe("assembleRollbackEnvs — 열린 벡터 환경과 롤백(dark) 환경", () => {
  it("열린 벡터는 진단 production 경로 두 플래그와 상담 두 플래그가 true이고 review 경로는 false다", () => {
    const { open } = assembleRollbackEnvs({ dbUrl: DB_URL, secret: SECRET });

    expect(open.ENABLE_DIAGNOSIS_FLOW).toBe("true");
    expect(open.DIAGNOSIS_ENGINE_READY).toBe("true");
    expect(open.ENABLE_CONSULT_FLOW).toBe("true");
    expect(open.CONSULT_POLICY_READY).toBe("true");
    expect(open.ENABLE_DIAGNOSIS_DEV_STATES).not.toBe("true");
  });

  it("롤백 환경은 5종 플래그가 모두 true가 아니다", () => {
    const { dark } = assembleRollbackEnvs({ dbUrl: DB_URL, secret: SECRET });

    expect(inspectRollbackEnv(dark).flagsStillTrue).toEqual([]);
  });

  it("열린 환경과 롤백 환경은 같은 시험용 시크릿을 받는다 — 롤백은 시크릿을 지우지 않는다", () => {
    const { open, dark } = assembleRollbackEnvs({ dbUrl: DB_URL, secret: SECRET });

    expect(open.RATE_LIMIT_HMAC_SECRET).toBe(SECRET);
    expect(dark.RATE_LIMIT_HMAC_SECRET).toBe(SECRET);
    expect(inspectRollbackEnv(dark).secretConfigured).toBe(true);
  });

  it("두 환경 모두 DB는 인자로 받은 로컬 file: 주소이고 토큰은 비어 있다", () => {
    const { open, dark } = assembleRollbackEnvs({ dbUrl: DB_URL, secret: SECRET });

    for (const env of [open, dark]) {
      expect(env.TURSO_DATABASE_URL).toBe(DB_URL);
      expect(env.TURSO_AUTH_TOKEN).toBe("");
      expect(env.LLM_PROVIDER_MODE).toBe("deterministic");
    }
  });

  it("DB 주소가 file:이 아니면 주소를 되풀이하지 않고 거부한다", () => {
    const remote = "libsql://synthetic-host-example";

    expect(() => assembleRollbackEnvs({ dbUrl: remote, secret: SECRET })).toThrow(/file:/);
    try {
      assembleRollbackEnvs({ dbUrl: remote, secret: SECRET });
    } catch (error) {
      expect((error as Error).message).not.toContain("synthetic-host-example");
    }
  });

  it("시크릿이 비어 있으면 거부한다(비어 있으면 앱이 설정되지 않은 것으로 읽는다)", () => {
    expect(() => assembleRollbackEnvs({ dbUrl: DB_URL, secret: "" })).toThrow(/시크릿/);
  });
});

describe("buildSeedProbe — 열린 서버에 보내는 합성 접수 요청", () => {
  it("스키마를 통과하고 동의 버전이 활성 정책 버전과 같다(접수되는 요청이다)", () => {
    const body = buildSeedProbe();

    expect(ConsultationRequestSchema.safeParse(body).success).toBe(true);
    expect(body.acknowledgedConsentVersion).toBe(CONSENT_POLICY_VERSION);
  });

  it("값은 호출마다 새로 만든다(고정 리터럴이 아니다)", () => {
    const first = buildSeedProbe();
    const second = buildSeedProbe();

    for (const key of ["resultId", "name", "contact", "idempotencyKey"]) {
      expect(first[key]).not.toBe(second[key]);
    }
  });
});

describe("toRecords — DB 결과를 열 이름이 붙은 행으로", () => {
  it("열 이름과 값 배열을 짝지어 행 객체로 만든다", () => {
    expect(
      toRecords(
        ["id", "n"],
        [
          ["a", 1],
          ["b", null],
        ]
      )
    ).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: null },
    ]);
  });

  it("행이 없으면 빈 배열이다", () => {
    expect(toRecords(["id"], [])).toEqual([]);
  });
});

describe("재사용 규칙 — 환경 조립을 따로 적지 않는다", () => {
  it("assembleEnv를 verify-flag-runtime에서 가져오고 플래그 키 정규식을 다시 적지 않는다", () => {
    expect(SCRIPT_SOURCE).toMatch(
      /import \{[^}]*\bassembleEnv\b[^}]*\} from "\.\/verify-flag-runtime\.ts"/
    );
    expect(SCRIPT_SOURCE).not.toContain("FLAG_KEY_RE");
  });
});
