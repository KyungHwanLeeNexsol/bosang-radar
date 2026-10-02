import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  decideOutcome,
  MEASUREMENTS_CANONICAL,
  MEASUREMENTS_FAILED,
  MEASUREMENTS_PARTIAL,
  measurementsFileName,
  writeMeasurements,
} from "./visual-verify-report";

// 화면 24개가 전부 PASS인데 서버 정리에 실패한 실행은 명령 전체로는 실패(exit 1)다.
// 그 실행이 이전의 정상 정규 증거(measurements.json)를 덮어쓰면 안 된다.

const SCREEN_IDS = Array.from({ length: 24 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`);
const CONSULT_IDS = SCREEN_IDS.slice(15); // main()의 진단/상담 분리와 같은 모양(15 + 9)
const DIAGNOSIS_IDS = SCREEN_IDS.slice(0, 15);

const CLEANUP_FAILURE =
  "서버 프로세스 트리 정리 실패: 서버 프로세스 트리 정리 실패(pid 4242) — 서버가 남았을 수 있어 수동 확인이 필요합니다: injected";

// 이전 정상 정규 증거를 흉내 낸다 — 바이트 단위로 비교하려고 한글·개행·공백을 섞는다.
const PRIOR_CANONICAL = '{\n  "이전 정상 정규 증거": true,\n  "canonical": true\n}\n\t끝';

let diagDir: string;
let consultDir: string;

const results = SCREEN_IDS.map((id) => ({ id, pass: true, maxDelta: 1 }));
const findings: { screen: string }[] = [];

function ctx(overrides: { isCanonicalRun?: boolean; cleanupFailures?: string[] } = {}) {
  return {
    isCanonicalRun: true,
    cleanupFailures: [] as string[],
    run: { totalScreens: 24, visualOnly: null, skipBuild: false, externalBaseURL: null },
    tolerance: { desktop: 8, mobile: 4 },
    results,
    findings,
    now: () => new Date("2026-09-29T00:00:00.000Z"),
    ...overrides,
  };
}

/** main()과 같은 순서로 두 report 디렉터리에 쓴다. */
function runWriter(overrides: Parameters<typeof ctx>[0] = {}) {
  const c = ctx(overrides);
  return [
    writeMeasurements(diagDir, DIAGNOSIS_IDS, c),
    writeMeasurements(consultDir, CONSULT_IDS, c),
  ];
}

const read = (dir: string, name: string) => fs.readFileSync(path.join(dir, name));
const exists = (dir: string, name: string) => fs.existsSync(path.join(dir, name));

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vv-report-"));
  diagDir = path.join(root, "diagnosis");
  consultDir = path.join(root, "consult");
  for (const dir of [diagDir, consultDir]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, MEASUREMENTS_CANONICAL), PRIOR_CANONICAL);
  }
});

afterEach(() => {
  fs.rmSync(path.dirname(diagDir), { recursive: true, force: true });
});

describe("24화면 전부 PASS + 정리 실패 (제약 없는 전체 실행)", () => {
  it("기존 canonical 파일은 바이트 단위로 그대로다", () => {
    const before = [
      read(diagDir, MEASUREMENTS_CANONICAL),
      read(consultDir, MEASUREMENTS_CANONICAL),
    ];

    runWriter({ cleanupFailures: [CLEANUP_FAILURE] });

    expect(read(diagDir, MEASUREMENTS_CANONICAL).equals(before[0])).toBe(true);
    expect(read(consultDir, MEASUREMENTS_CANONICAL).equals(before[1])).toBe(true);
    expect(read(diagDir, MEASUREMENTS_CANONICAL).toString("utf8")).toBe(PRIOR_CANONICAL);
    // 부분 증거 파일도 만들지 않는다.
    expect(exists(diagDir, MEASUREMENTS_PARTIAL)).toBe(false);
    expect(exists(consultDir, MEASUREMENTS_PARTIAL)).toBe(false);
  });

  it("측정치는 별도 실패 증거에 남고, 종료 사유와 정리 실패 원인이 기록된다", () => {
    const written = runWriter({ cleanupFailures: [CLEANUP_FAILURE] });

    expect(written.map((p) => path.basename(p as string))).toEqual([
      MEASUREMENTS_FAILED,
      MEASUREMENTS_FAILED,
    ]);
    const failed = JSON.parse(read(diagDir, MEASUREMENTS_FAILED).toString("utf8"));
    expect(failed.canonical).toBe(false);
    expect(failed.exitReason).toBe("cleanup-failed");
    expect(failed.cleanupFailures).toEqual([CLEANUP_FAILURE]);
    expect(failed.untouchedFile).toBe(MEASUREMENTS_CANONICAL);
    expect(failed.results).toHaveLength(15);
    expect(failed.results.every((r: { pass: boolean }) => r.pass)).toBe(true);
    expect(failed.run.screenIds).toEqual(DIAGNOSIS_IDS);

    const failedConsult = JSON.parse(read(consultDir, MEASUREMENTS_FAILED).toString("utf8"));
    expect(failedConsult.results).toHaveLength(9);
    expect(failedConsult.cleanupFailures).toEqual([CLEANUP_FAILURE]);
  });

  it("종료 코드는 0이 아니고 성공으로 보고하지 않는다", () => {
    expect(decideOutcome({ findingCount: 0, cleanupFailureCount: 1 })).toEqual({
      exitCode: 1,
      reportSuccess: false,
    });
    expect(measurementsFileName(true, [CLEANUP_FAILURE])).toBe(MEASUREMENTS_FAILED);
  });
});

describe("정상 정리에서는 기존 규칙 그대로", () => {
  it("제약 없는 전체 실행은 canonical 파일을 갱신한다(실패 증거는 만들지 않는다)", () => {
    const written = runWriter();

    expect(written.map((p) => path.basename(p as string))).toEqual([
      MEASUREMENTS_CANONICAL,
      MEASUREMENTS_CANONICAL,
    ]);
    const canonical = JSON.parse(read(diagDir, MEASUREMENTS_CANONICAL).toString("utf8"));
    expect(canonical.canonical).toBe(true);
    expect(canonical.results).toHaveLength(15);
    expect(read(diagDir, MEASUREMENTS_CANONICAL).toString("utf8")).not.toBe(PRIOR_CANONICAL);
    expect(exists(diagDir, MEASUREMENTS_FAILED)).toBe(false);
    expect(exists(consultDir, MEASUREMENTS_FAILED)).toBe(false);
  });

  it("정상 실행의 파일 형식은 예전과 같다(키 순서 유지, 실패 필드 없음)", () => {
    runWriter();
    const canonical = JSON.parse(read(diagDir, MEASUREMENTS_CANONICAL).toString("utf8"));
    expect(Object.keys(canonical)).toEqual([
      "generatedAt",
      "canonical",
      "run",
      "tolerance",
      "results",
      "findings",
    ]);
    expect(Object.keys(canonical.run)).toEqual([
      "screenIds",
      "totalScreens",
      "visualOnly",
      "skipBuild",
      "externalBaseURL",
    ]);
    expect(canonical.generatedAt).toBe("2026-09-29T00:00:00.000Z");
  });

  it("decideOutcome: 위반이 없고 정리가 성공하면 exit 0", () => {
    expect(decideOutcome({ findingCount: 0, cleanupFailureCount: 0 })).toEqual({
      exitCode: 0,
      reportSuccess: true,
    });
    expect(decideOutcome({ findingCount: 2, cleanupFailureCount: 0 }).exitCode).toBe(1);
  });
});

describe("부분 증거 규칙(VISUAL_ONLY · VISUAL_SKIP_BUILD · VISUAL_BASE_URL)은 유지된다", () => {
  it("비정규 실행은 .partial.json에 쓰고 canonical은 건드리지 않는다", () => {
    runWriter({ isCanonicalRun: false });

    const partial = JSON.parse(read(diagDir, MEASUREMENTS_PARTIAL).toString("utf8"));
    expect(partial.canonical).toBe(false);
    expect(partial.exitReason).toBeUndefined();
    expect(read(diagDir, MEASUREMENTS_CANONICAL).toString("utf8")).toBe(PRIOR_CANONICAL);
    expect(exists(diagDir, MEASUREMENTS_FAILED)).toBe(false);
  });

  it("비정규 실행이 정리에 실패하면 partial·canonical 둘 다 그대로 두고 실패 증거만 쓴다", () => {
    fs.writeFileSync(path.join(diagDir, MEASUREMENTS_PARTIAL), "PRIOR-PARTIAL");

    runWriter({ isCanonicalRun: false, cleanupFailures: [CLEANUP_FAILURE] });

    expect(read(diagDir, MEASUREMENTS_PARTIAL).toString("utf8")).toBe("PRIOR-PARTIAL");
    expect(read(diagDir, MEASUREMENTS_CANONICAL).toString("utf8")).toBe(PRIOR_CANONICAL);
    const failed = JSON.parse(read(diagDir, MEASUREMENTS_FAILED).toString("utf8"));
    expect(failed.untouchedFile).toBe(MEASUREMENTS_PARTIAL);
    expect(failed.canonical).toBe(false);
  });

  it("기록할 화면이 없는 디렉터리에는 아무것도 쓰지 않는다", () => {
    expect(writeMeasurements(diagDir, [], ctx({ cleanupFailures: [CLEANUP_FAILURE] }))).toBeNull();
    expect(exists(diagDir, MEASUREMENTS_FAILED)).toBe(false);
  });
});
