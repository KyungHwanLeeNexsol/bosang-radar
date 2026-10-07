import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { EnvValidationError, validateEnv } from "./env";
import {
  BOOT_IMPOSSIBLE,
  BOOT_POSSIBLE,
  compareGateStateTables,
  parseGateStateTables,
  type BootRow,
  type GateStateTables,
} from "./launch/gate-state-table";
import { GATE_STATE_FIXTURE } from "./launch/gate-state-table.fixture";

// SPEC-B2C-LAUNCH-001 M3a (REQ-B2CLAUNCH-010, AC-B2CLAUNCH-010 시나리오 2) — 런북 게이트 상태 표의 "부팅 불가
// 조합" 표시가 앱 스코프 부팅 검증(validateEnv("app"))의 실제 동작과 같은지 확인한다. 시험용 시크릿은 실행
// 시점에 만들고 어떤 추적 파일에도 고정 값으로 적지 않는다(AC-B2CLAUNCH-007).

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNBOOK = readFileSync(join(REPO_ROOT, ".moai", "docs", "launch-gate-runbook.md"), "utf-8");

const SECRET_NAME = "RATE_LIMIT_HMAC_SECRET";
const TEST_SECRET = `boot-test-${randomUUID()}`;

// LLM_PROVIDER_MODE=deterministic은 GEMINI_API_KEY 게이트를 면제하려는 것이라 시크릿 게이트만 남긴다.
const BASE_ENV = {
  TURSO_DATABASE_URL: "file:./.tmp/boot-combination.db",
  LLM_PROVIDER_MODE: "deterministic",
};

function envFor(p: boolean, s: boolean): Record<string, string | undefined> {
  return {
    ...BASE_ENV,
    ...(p ? { CONSULT_POLICY_READY: "true" } : {}),
    ...(s ? { [SECRET_NAME]: TEST_SECRET } : {}),
  };
}

function bootOutcome(env: Record<string, string | undefined>): {
  boot: string;
  missing: readonly string[];
} {
  try {
    validateEnv("app", env);
    return { boot: BOOT_POSSIBLE, missing: [] };
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return { boot: BOOT_IMPOSSIBLE, missing: error.missing };
    }
    throw error;
  }
}

function observeBootRows(): BootRow[] {
  return GATE_STATE_FIXTURE.boot.map(({ p, s }) => ({
    p,
    s,
    boot: bootOutcome(envFor(p, s)).boot,
  }));
}

function runbookTables(markdown: string = RUNBOOK): GateStateTables {
  const result = parseGateStateTables(markdown);
  expect(result.ok, "런북의 게이트 상태 표가 파서를 통과해야 한다").toBe(true);
  return result.ok ? result.tables : { diagnosis: [], consult: [], boot: [] };
}

describe("AC-B2CLAUNCH-010 시나리오 2 — 부팅 불가 조합", () => {
  it("CONSULT_POLICY_READY=true이고 시크릿이 없으면 누락 목록에 시크릿 하나만 있다", () => {
    const outcome = bootOutcome(envFor(true, false));

    expect(outcome).toEqual({ boot: BOOT_IMPOSSIBLE, missing: [SECRET_NAME] });
  });

  it("같은 환경에 시크릿이 있으면 부팅 검증을 통과하고 시크릿 값을 담아 돌려준다", () => {
    const result = validateEnv("app", envFor(true, true));

    expect(result.RATE_LIMIT_HMAC_SECRET).toBe(TEST_SECRET);
  });

  it("누락 오류 메시지가 시크릿 변수 이름을 적는다", () => {
    expect(() => validateEnv("app", envFor(true, false))).toThrow(SECRET_NAME);
  });

  it("CONSULT_POLICY_READY가 참이 아니면 시크릿이 있든 없든 부팅한다(S는 P=0에서 영향이 없다)", () => {
    expect(bootOutcome(envFor(false, false)).boot).toBe(BOOT_POSSIBLE);
    expect(bootOutcome(envFor(false, true)).boot).toBe(BOOT_POSSIBLE);
  });

  it('"true"가 아닌 값은 어떤 변종이든 참이 아니라 시크릿 없이 부팅한다(엄격 일치)', () => {
    for (const variant of ["TRUE", "1", "yes", " true", "true ", ""]) {
      const outcome = bootOutcome({ ...BASE_ENV, CONSULT_POLICY_READY: variant });

      expect(outcome).toEqual({ boot: BOOT_POSSIBLE, missing: [] });
    }
  });

  it("빈 문자열 시크릿은 설정되지 않은 것으로 읽는다(현재 코드의 동작)", () => {
    const outcome = bootOutcome({
      ...BASE_ENV,
      CONSULT_POLICY_READY: "true",
      [SECRET_NAME]: "",
    });

    expect(outcome).toEqual({ boot: BOOT_IMPOSSIBLE, missing: [SECRET_NAME] });
  });
});

describe("AC-B2CLAUNCH-010 시나리오 2 — 표의 불가능 조합 표시와 부팅 동작의 일치", () => {
  it("부팅 검증을 실제로 호출해 얻은 4행이 기대값과 같다", () => {
    expect(
      compareGateStateTables({ ...GATE_STATE_FIXTURE, boot: observeBootRows() }, GATE_STATE_FIXTURE)
    ).toEqual([]);
  });

  it("부팅 검증을 실제로 호출해 얻은 4행이 런북 표의 부팅 칸과 같다", () => {
    const tables = runbookTables();

    expect(compareGateStateTables({ ...tables, boot: observeBootRows() }, tables)).toEqual([]);
  });

  it("런북 표에서 불가능 조합을 가능으로 바꾸면 부팅 동작과의 대조가 그 행을 적어 실패한다", () => {
    const edited = RUNBOOK.replace(/(\| 1 \| 0 \| )부팅 불가/, "$1가능");
    expect(edited).not.toBe(RUNBOOK);
    const tables = runbookTables(edited);

    const mismatches = compareGateStateTables({ ...tables, boot: observeBootRows() }, tables);

    expect(mismatches).toEqual([expect.stringContaining("P1S0")]);
    expect(mismatches[0]).toContain("부팅");
  });

  it("런북 표에서 가능한 조합을 불가능으로 바꾸면 부팅 동작과의 대조가 실패한다", () => {
    const edited = RUNBOOK.replace(/(\| 1 \| 1 \| )가능/, "$1부팅 불가");
    expect(edited).not.toBe(RUNBOOK);
    const tables = runbookTables(edited);

    const mismatches = compareGateStateTables({ ...tables, boot: observeBootRows() }, tables);

    expect(mismatches).toEqual([expect.stringContaining("P1S1")]);
  });
});
