import { describe, expect, it } from "vitest";

import {
  CLOSED_PAGES,
  CLOSED_TITLE,
  compareRollbackObservation,
  formatRollbackReport,
  hashConsultationRows,
  inspectRollbackEnv,
  rollbackChecks,
  type PageObservation,
  type RollbackObservation,
} from "./rollback-observation";

// SPEC-B2C-LAUNCH-001 M5 (REQ-B2CLAUNCH-014, AC-B2CLAUNCH-014) — 롤백 로컬 시험의 판정 로직 시험.
// 모든 값은 눈에 띄게 합성한 것이다. 실제 서버를 띄우는 관측은 scripts/verify-rollback-dark.ts가 한다.

const CLOSED_PAGE: PageObservation = { title: CLOSED_TITLE, hasPlaceholder: true };
const OPEN_PAGE: PageObservation = { title: "열림-예시", hasPlaceholder: false };
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function observed(overrides: Partial<RollbackObservation> = {}): RollbackObservation {
  return {
    open: {
      seedStatus: 201,
      pages: { "/": OPEN_PAGE, "/result": OPEN_PAGE, "/consult": OPEN_PAGE },
    },
    rowsBefore: 1,
    hashBefore: HASH_A,
    pages: { "/": CLOSED_PAGE, "/result": CLOSED_PAGE, "/consult": CLOSED_PAGE },
    apiStatus: 503,
    apiCode: "policy_unavailable",
    rowsAfter: 1,
    hashAfter: HASH_A,
    flagsStillTrue: [],
    secretConfigured: true,
    ...overrides,
  };
}

describe("compareRollbackObservation — AC-B2CLAUNCH-014의 관측", () => {
  it("세 경로가 placeholder이고 접수 API가 503 policy_unavailable이며 행 수·해시·시크릿이 그대로면 불일치가 없다", () => {
    expect(compareRollbackObservation(observed())).toEqual([]);
  });

  it.each(CLOSED_PAGES)(
    "롤백 뒤 %s가 placeholder가 아니면 그 경로를 이름으로 적은 불일치다",
    (page) => {
      const pages = {
        "/": CLOSED_PAGE,
        "/result": CLOSED_PAGE,
        "/consult": CLOSED_PAGE,
        [page]: OPEN_PAGE,
      };

      const mismatches = compareRollbackObservation(observed({ pages }));

      expect(mismatches).toHaveLength(1);
      expect(mismatches[0]).toContain(`롤백 뒤 ${page}`);
    }
  );

  it("제목만 placeholder이고 본문 문구가 없으면 불일치다(둘 다 있어야 닫힘이다)", () => {
    const pages = {
      "/": { title: CLOSED_TITLE, hasPlaceholder: false },
      "/result": CLOSED_PAGE,
      "/consult": CLOSED_PAGE,
    };

    expect(compareRollbackObservation(observed({ pages }))).toEqual([
      expect.stringContaining("롤백 뒤 /"),
    ]);
  });

  it("접수 API가 503이 아니면 불일치다(201은 접수됐다는 뜻이다)", () => {
    const mismatches = compareRollbackObservation(observed({ apiStatus: 201, apiCode: null }));

    expect(mismatches.some((m) => m.includes("API 상태"))).toBe(true);
    expect(mismatches.some((m) => m.includes("API 오류 코드"))).toBe(true);
  });

  it("상태는 503이나 오류 코드가 policy_unavailable이 아니면 불일치다", () => {
    expect(compareRollbackObservation(observed({ apiCode: "server_error" }))).toEqual([
      expect.stringContaining("API 오류 코드"),
    ]);
  });

  it("롤백 뒤 행 수가 달라지면 불일치다", () => {
    expect(compareRollbackObservation(observed({ rowsAfter: 2 }))).toEqual([
      expect.stringContaining("행 수"),
    ]);
    expect(compareRollbackObservation(observed({ rowsAfter: 0 }))).toEqual([
      expect.stringContaining("행 수"),
    ]);
  });

  it("행 수가 같아도 전체 열 해시가 달라지면 불일치다", () => {
    expect(compareRollbackObservation(observed({ hashAfter: HASH_B }))).toEqual([
      expect.stringContaining("해시"),
    ]);
  });

  it("롤백 환경에 여전히 true인 플래그가 있으면 그 이름을 적은 불일치다", () => {
    const mismatches = compareRollbackObservation(
      observed({ flagsStillTrue: ["ENABLE_CONSULT_FLOW"] })
    );

    expect(mismatches).toEqual([expect.stringContaining("ENABLE_CONSULT_FLOW")]);
  });

  it("롤백 환경의 시크릿이 설정 상태가 아니면 불일치다", () => {
    expect(compareRollbackObservation(observed({ secretConfigured: false }))).toEqual([
      expect.stringContaining("시크릿"),
    ]);
  });

  it("롤백 전 전제가 어긋나면(접수 201 아님·경로가 열려 있지 않음·행이 하나가 아님) 불일치다", () => {
    const precondition = observed({
      open: {
        seedStatus: 503,
        pages: { "/": CLOSED_PAGE, "/result": OPEN_PAGE, "/consult": OPEN_PAGE },
      },
      rowsBefore: 0,
    });

    const mismatches = compareRollbackObservation(precondition);

    expect(mismatches.some((m) => m.includes("롤백 전 합성 접수 상태"))).toBe(true);
    expect(mismatches.some((m) => m.includes("롤백 전 /:"))).toBe(true);
    expect(mismatches.some((m) => m.includes("롤백 전 행 수"))).toBe(true);
    expect(mismatches.some((m) => m.includes("롤백 전 /result"))).toBe(false);
  });
});

describe("rollbackChecks / formatRollbackReport", () => {
  it("검사 항목은 기대와 같으면 모두 ok이고 항목마다 라벨·기대·관측을 담는다", () => {
    const checks = rollbackChecks(observed());

    expect(checks.length).toBeGreaterThanOrEqual(12);
    for (const check of checks) {
      expect(check.ok, check.label).toBe(true);
      expect(check.label).not.toBe("");
      expect(check.expected).not.toBe("");
      expect(check.observed).not.toBe("");
    }
  });

  it("기대와 같으면 모든 관측 줄이 OK이고 합계가 0이다", () => {
    const report = formatRollbackReport(observed()).join("\n");

    expect(report).not.toContain("MISMATCH");
    expect(report).toContain("불일치 관측 합계: 0");
    expect(report.match(/ OK$/gm)?.length).toBe(rollbackChecks(observed()).length);
  });

  it("어긋난 관측 줄에만 MISMATCH를 붙이고 합계에 센다", () => {
    const lines = formatRollbackReport(observed({ apiStatus: 200, apiCode: null }));

    expect(lines.filter((line) => line.endsWith("MISMATCH"))).toHaveLength(2);
    expect(lines.join("\n")).toContain("불일치 관측 합계: 2");
  });

  it("해시는 앞 12자만 적고 DB 경로·시크릿 값을 적지 않는다", () => {
    const report = formatRollbackReport(observed({ hashAfter: HASH_B })).join("\n");

    expect(report).toContain("a".repeat(12));
    expect(report).toContain("b".repeat(12));
    expect(report).not.toContain("a".repeat(13));
    expect(report).not.toMatch(/file:|secret/i);
  });
});

describe("hashConsultationRows — 전체 열 해시", () => {
  const rowOne = { id: "행-1", name: "합성-이름", n: 1, empty: null };
  const rowTwo = { id: "행-2", name: "합성-이름-2", n: 2, empty: null };

  it("64자 소문자 16진수 SHA-256이다", () => {
    expect(hashConsultationRows([rowOne])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("행 순서와 열 순서가 달라도 같은 내용이면 같은 해시다", () => {
    const reordered = { empty: null, n: 1, name: "합성-이름", id: "행-1" };

    expect(hashConsultationRows([rowOne, rowTwo])).toBe(hashConsultationRows([rowTwo, reordered]));
  });

  it("한 칸의 값이 달라지면 해시가 달라진다", () => {
    expect(hashConsultationRows([{ ...rowOne, name: "다른-이름" }])).not.toBe(
      hashConsultationRows([rowOne])
    );
  });

  it("행이 늘거나 줄면 해시가 달라진다", () => {
    expect(hashConsultationRows([rowOne, rowTwo])).not.toBe(hashConsultationRows([rowOne]));
    expect(hashConsultationRows([])).not.toBe(hashConsultationRows([rowOne]));
    expect(hashConsultationRows([])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("null과 빈 문자열, 숫자 1과 문자열 '1'은 다른 값으로 센다", () => {
    expect(hashConsultationRows([{ v: null }])).not.toBe(hashConsultationRows([{ v: "" }]));
    expect(hashConsultationRows([{ v: 1 }])).not.toBe(hashConsultationRows([{ v: "1" }]));
  });

  it("bigint와 바이트 배열 칸도 직렬화한다(던지지 않고 값이 다르면 해시가 다르다)", () => {
    const withBytes = (bytes: number[]) => ({ b: new Uint8Array(bytes).buffer, big: BigInt(5) });

    expect(hashConsultationRows([withBytes([1, 2])])).toMatch(/^[0-9a-f]{64}$/);
    expect(hashConsultationRows([withBytes([1, 2])])).not.toBe(
      hashConsultationRows([withBytes([1, 3])])
    );
  });

  it("바이트 배열 뷰(Uint8Array)도 같은 바이트면 같은 해시이고 다르면 다른 해시다", () => {
    const view = (bytes: number[]) => ({ b: new Uint8Array(bytes) });

    expect(hashConsultationRows([view([1, 2])])).toBe(hashConsultationRows([view([1, 2])]));
    expect(hashConsultationRows([view([1, 2])])).not.toBe(hashConsultationRows([view([1, 3])]));
    // 같은 바이트의 ArrayBuffer와 뷰는 같은 값으로 센다.
    expect(hashConsultationRows([{ b: new Uint8Array([1, 2]).buffer }])).toBe(
      hashConsultationRows([view([1, 2])])
    );
  });
});

describe("inspectRollbackEnv — 롤백 재시작에 넘긴 환경에서 설정 여부만 읽는다", () => {
  it("5종 플래그 중 정확히 true인 것만 남아 있다고 센다(TRUE·1·미설정은 켜짐이 아니다)", () => {
    const env = {
      ENABLE_DIAGNOSIS_FLOW: "true",
      DIAGNOSIS_ENGINE_READY: "TRUE",
      ENABLE_DIAGNOSIS_DEV_STATES: "1",
      ENABLE_CONSULT_FLOW: "false",
      RATE_LIMIT_HMAC_SECRET: "합성-시크릿",
    };

    expect(inspectRollbackEnv(env).flagsStillTrue).toEqual(["ENABLE_DIAGNOSIS_FLOW"]);
  });

  it("플래그가 모두 true가 아니면 남은 것이 없다", () => {
    expect(inspectRollbackEnv({ RATE_LIMIT_HMAC_SECRET: "합성" }).flagsStillTrue).toEqual([]);
  });

  it("시크릿은 비어 있지 않은 문자열일 때만 설정 상태다", () => {
    expect(inspectRollbackEnv({ RATE_LIMIT_HMAC_SECRET: "합성" }).secretConfigured).toBe(true);
    expect(inspectRollbackEnv({ RATE_LIMIT_HMAC_SECRET: "" }).secretConfigured).toBe(false);
    expect(inspectRollbackEnv({ RATE_LIMIT_HMAC_SECRET: "   " }).secretConfigured).toBe(false);
    expect(inspectRollbackEnv({}).secretConfigured).toBe(false);
  });

  it("결과에 시크릿 값을 담지 않는다", () => {
    const secret = `합성-시크릿-${crypto.randomUUID()}`;

    const result = inspectRollbackEnv({ RATE_LIMIT_HMAC_SECRET: secret });

    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
