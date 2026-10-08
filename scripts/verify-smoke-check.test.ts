import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeDiagnosisFlags } from "../lib/diagnosis/flags";
import {
  GATE_STATE_LABEL,
  createSmokeFetch,
  runSmokeCheck,
  type SmokeReport,
} from "../lib/launch/smoke-check";
import {
  SMOKE_STATES,
  assembleSmokeStateEnv,
  compareStateObservation,
  extractObservedGate,
  formatStateTable,
  startTempServer,
  type SmokeStateCase,
  type TempServerKind,
} from "./verify-smoke-check";

// SPEC-B2C-LAUNCH-001 M4 (AC-B2CLAUNCH-013) — 로컬 일곱 상태 관측 하네스의 시험.
// 빌드·Next 서버 기동은 하지 않는다(실제 실행으로만 덮인다). 여기서는 상태 표, 환경 조립의 안전 규칙,
// 임시 HTTP 서버 상태, 비교·출력을 확인한다. 임시 서버는 실제 네트워크 소켓(루프백)이다.

/** 검사 이름·결과 쌍과 상세 문구를 TypeError 없이 읽는 도우미. */
const outcome = (report: SmokeReport) => report.checks.map((c) => [c.name, c.ok]);
const details = (report: SmokeReport) => report.checks.map((c) => c.detail).join(" | ");

function stateById(id: string): SmokeStateCase {
  const found = SMOKE_STATES.find((state) => state.id === id);
  // 단언으로 먼저 실패시킨다 — 표가 비어 있어도 도우미가 던지는 오류가 아니라 단언 실패로 보인다.
  expect(found, `상태 ${id}가 표에 있어야 한다`).toBeDefined();
  return found as SmokeStateCase;
}

describe("SMOKE_STATES — AC-B2CLAUNCH-013의 일곱 상태", () => {
  it("(가)~(사) 일곱 상태가 모두 있고 마·사는 변형을 가진다", () => {
    const letters = new Set(SMOKE_STATES.map((state) => state.id.split("-")[0]));
    expect([...letters].sort()).toEqual(["가", "나", "다", "라", "마", "바", "사"].sort());
    expect(SMOKE_STATES.length).toBeGreaterThanOrEqual(7);
  });

  it("(가)~(라)는 AC가 적은 플래그 조합의 실제 서버다", () => {
    const diagOf = (id: string) => {
      const source = stateById(id).source;
      expect(source.kind, `${id}는 Next 서버 상태여야 한다`).toBe("next");
      return source.kind === "next" ? source.diag : undefined;
    };
    expect(diagOf("가")).toEqual({ flow: false, engine: false, dev: false });
    expect(diagOf("나")).toEqual({ flow: true, engine: true, dev: false });
    expect(diagOf("다")).toEqual({ flow: false, engine: false, dev: true });
    expect(diagOf("라")).toEqual({ flow: true, engine: true, dev: true });
  });

  it("(가)~(마)는 통과(0), (바)(사)는 실패(1)를 기대한다", () => {
    for (const state of SMOKE_STATES) {
      const letter = state.id.split("-")[0];
      expect(state.expectedExit).toBe(letter === "바" || letter === "사" ? 1 : 0);
    }
  });

  it("Next 서버 상태의 게이트 기대는 실제 게이트 함수의 결과와 같다", () => {
    for (const state of SMOKE_STATES) {
      if (state.source.kind !== "next") continue;
      const { diag } = state.source;
      const { shouldRenderDiagnosis } = computeDiagnosisFlags({
        ENABLE_DIAGNOSIS_FLOW: String(diag.flow),
        DIAGNOSIS_ENGINE_READY: String(diag.engine),
        ENABLE_DIAGNOSIS_DEV_STATES: String(diag.dev),
      });
      expect(state.expectedGate).toBe(shouldRenderDiagnosis ? "open" : "closed");
    }
  });
});

describe("assembleSmokeStateEnv — verify-flag-runtime의 assembleEnv 재사용 + 안전 규칙", () => {
  // assembleEnv는 process.env를 부모로 읽는다 — 시험은 vi.stubEnv로 부모 환경을 만든다.
  const PARENT: Record<string, string> = {
    TURSO_DATABASE_URL: "libsql://remote.invalid",
    TURSO_AUTH_TOKEN: "parent-token",
    ENABLE_DIAGNOSIS_FLOW: "true",
    DIAGNOSIS_ENGINE_READY: "true",
    ENABLE_DIAGNOSIS_DEV_STATES: "true",
    ENABLE_CONSULT_FLOW: "true",
    CONSULT_POLICY_READY: "true",
    RATE_LIMIT_HMAC_SECRET: "parent-secret",
    GEMINI_API_KEY: "parent-key",
    PORT: "9999",
  };
  const none = { flow: false, engine: false, dev: false };

  beforeEach(() => {
    for (const [key, value] of Object.entries(PARENT)) vi.stubEnv(key, value);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("부모의 원격 DB·플래그·시크릿·키는 물려주지 않고 로컬 file DB·시험용 시크릿으로 바꾼다", () => {
    const env = assembleSmokeStateEnv(none);
    expect(env.TURSO_DATABASE_URL?.startsWith("file:")).toBe(true);
    expect(env.TURSO_AUTH_TOKEN).toBe("");
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.PORT).toBeUndefined();
    expect(env.LLM_PROVIDER_MODE).toBe("deterministic");
    expect(env.RATE_LIMIT_HMAC_SECRET).toMatch(/^smoke-test-/);
    expect(env.RATE_LIMIT_HMAC_SECRET).not.toBe("parent-secret");
    expect(env.PATH).toBe(process.env.PATH);
  });

  it("진단 플래그는 참인 것만 자식 환경에 두고 나머지는 미설정이다(닫힘 상태 = 플래그 미설정)", () => {
    const keys = ["ENABLE_DIAGNOSIS_FLOW", "DIAGNOSIS_ENGINE_READY", "ENABLE_DIAGNOSIS_DEV_STATES"];
    const dark = assembleSmokeStateEnv(none);
    for (const key of keys) expect(dark[key]).toBeUndefined();
    const prod = assembleSmokeStateEnv({ flow: true, engine: true, dev: false });
    expect(prod.ENABLE_DIAGNOSIS_FLOW).toBe("true");
    expect(prod.DIAGNOSIS_ENGINE_READY).toBe("true");
    expect(prod.ENABLE_DIAGNOSIS_DEV_STATES).toBeUndefined();
    const review = assembleSmokeStateEnv({ flow: false, engine: false, dev: true });
    expect(review.ENABLE_DIAGNOSIS_DEV_STATES).toBe("true");
    expect(review.ENABLE_DIAGNOSIS_FLOW).toBeUndefined();
    expect(review.DIAGNOSIS_ENGINE_READY).toBeUndefined();
  });

  it("상담 플래그는 어느 상태에서도 두지 않는다", () => {
    const env = assembleSmokeStateEnv({ flow: true, engine: true, dev: true });
    expect(env.ENABLE_CONSULT_FLOW).toBeUndefined();
    expect(env.CONSULT_POLICY_READY).toBeUndefined();
  });

  it("부모 환경(process.env)을 바꾸지 않고 시크릿은 호출마다 새로 만든다", () => {
    const a = assembleSmokeStateEnv(none);
    const b = assembleSmokeStateEnv(none);
    expect(process.env.ENABLE_DIAGNOSIS_FLOW).toBe("true");
    expect(process.env.RATE_LIMIT_HMAC_SECRET).toBe("parent-secret");
    expect(a.RATE_LIMIT_HMAC_SECRET).not.toBe(b.RATE_LIMIT_HMAC_SECRET);
  });
});

describe("임시 HTTP 서버 상태 × 실제 smoke 로직(실제 fetch)", () => {
  async function observe(kind: TempServerKind) {
    const server = await startTempServer(kind);
    try {
      return await runSmokeCheck({
        baseUrl: server.baseUrl,
        attempts: 2,
        retryDelayMs: 0,
        fetchImpl: createSmokeFetch(2000),
      });
    } finally {
      await server.stop();
    }
  }

  it("(마) 열림 표지·닫힘 표지 정상 응답은 모두 통과하고 게이트 상태를 정보로 적는다", async () => {
    const open = await observe("ok-open");
    expect(open.ok).toBe(true);
    expect(open.gateState).toBe("open");
    const closed = await observe("ok-closed");
    expect(closed.ok).toBe(true);
    expect(closed.gateState).toBe("closed");
  });

  it("(바) HTTP 500은 실패한다", async () => {
    const report = await observe("http-500");
    expect(report.ok).toBe(false);
    expect(details(report)).toContain("500");
  });

  it("(사) CSS 청크 참조가 없거나 청크가 404면 실패한다", async () => {
    const none = await observe("no-css-reference");
    expect(none.ok).toBe(false);
    expect(outcome(none)).toEqual([
      ["home", true],
      ["css-referenced", false],
    ]);
    const missing = await observe("css-404");
    expect(missing.ok).toBe(false);
    expect(outcome(missing)).toEqual([
      ["home", true],
      ["css-referenced", true],
      ["css-served", false],
    ]);
    expect(details(missing)).toContain("404");
  });

  it("3xx 응답은 따라가지 않고 2xx가 아닌 응답으로 실패한다(curl 기본 동작과 같다)", async () => {
    const report = await observe("redirect-302");
    expect(report.ok).toBe(false);
    expect(details(report)).toContain("302");
  });

  it("서버를 멈추면 연결이 거부돼 상태 0으로 실패한다", async () => {
    const server = await startTempServer("ok-open");
    await server.stop();
    const report = await runSmokeCheck({
      baseUrl: server.baseUrl,
      attempts: 2,
      retryDelayMs: 0,
      fetchImpl: createSmokeFetch(2000),
    });
    expect(report.ok).toBe(false);
    expect(outcome(report)).toEqual([["home", false]]);
  });
});

describe("compareStateObservation · extractObservedGate · formatStateTable", () => {
  // 상태 조회는 시험 안에서 한다 — 표가 비어 있어도 수집 단계가 아니라 단언에서 실패한다.
  const stateGa = () => stateById("가");
  const stateBa = () => stateById("바");

  it("종료 코드와 정보용 게이트 상태가 기대와 같으면 불일치가 없다", () => {
    expect(compareStateObservation(stateGa(), { exitCode: 0, gateState: "closed" })).toEqual([]);
  });

  it("종료 코드가 기대와 다르면 불일치로 적는다(통과해야 할 상태가 실패)", () => {
    const mismatches = compareStateObservation(stateGa(), { exitCode: 1, gateState: "closed" });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain("종료 코드");
  });

  it("실패해야 할 상태가 통과하면 불일치다", () => {
    expect(compareStateObservation(stateBa(), { exitCode: 0, gateState: "unknown" })).toHaveLength(
      1
    );
  });

  it("정보용 게이트 상태가 기대와 다르면 불일치로 적는다", () => {
    const mismatches = compareStateObservation(stateGa(), { exitCode: 0, gateState: "open" });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain("게이트");
  });

  it("출력 줄에서 게이트 상태를 읽는다", () => {
    for (const state of ["closed", "open", "unknown"] as const) {
      const output = `- 진단 게이트 상태(정보용, 판정에 쓰지 않음): ${GATE_STATE_LABEL[state]}\n판정: 통과`;
      expect(extractObservedGate(output)).toBe(state);
    }
    expect(extractObservedGate("판정: 실패")).toBeNull();
  });

  it("표는 상태별 기대·관측·판정과 CLI 출력을 담고 시크릿을 되풀이하지 않는다", () => {
    const lines = formatStateTable([
      {
        state: stateGa(),
        observed: { exitCode: 0, gateState: "closed" },
        output: "판정: 통과",
      },
      {
        state: stateBa(),
        observed: { exitCode: 0, gateState: null },
        output: "판정: 통과",
      },
    ]);
    const text = lines.join("\n");
    expect(text).toContain("(가)");
    expect(text).toContain("(바)");
    expect(text).toContain("OK");
    expect(text).toContain("MISMATCH");
    expect(text).toContain("판정: 통과");
  });
});
