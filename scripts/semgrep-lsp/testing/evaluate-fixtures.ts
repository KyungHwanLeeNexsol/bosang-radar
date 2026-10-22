// evaluate.ts 시험의 공용 재료(시험 지원). 고정 입력 데이터(핀·기대 규칙·규칙 파일 목록·대조 기대값)는
// 실제 data/ 파일을 읽고, 대상 범위 E와 스캔 트리는 시험용 합성 값이다. 스텁 결과이므로 실제 Semgrep의
// 동작이나 탐지의 증거가 아니다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { buildRunRecord } from "../evidence";
import type { EvaluateInputs } from "../evaluate";
import { normalizeLoadingPath } from "../log-matcher";
import { parseExpectedRules, parseRulesFiles } from "../rules-manifest";
import { sha256Hex } from "../sha";
import { representativeStatus, REASON_STATUS, type ReasonCode } from "../status";
import type {
  ControlExpectations,
  ExpectedRule,
  Mode,
  Pin,
  RuleFileEntry,
  RunRecord,
  ScopeEntry,
  ScopeResult,
  Transcript,
  Verdict,
} from "../types";
import { happyTranscript, type HappySpec } from "./transcript-builder";

function dataText(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../data/${name}`, import.meta.url)), "utf8");
}

export const RAW_PIN = JSON.parse(dataText("pin.json")) as Pin;
export const EXPECTED_RULES: readonly ExpectedRule[] = parseExpectedRules(
  dataText("rules-expected.tsv")
);
export const RULES_FILES: readonly RuleFileEntry[] = parseRulesFiles(dataText("rules-files.tsv"));
export const CONTROL_EXPECTATIONS = JSON.parse(
  dataText("control-expectations.json")
) as ControlExpectations;

/** 이 시험들의 핀: 실제 data/pin.json에서 N0 확정만 true로 바꾼 사본(target 모드의 C8 시험용 가정). */
export const PIN: Pin = {
  ...structuredClone(RAW_PIN),
  n0: { expected: 214, observed: 214, confirmed: true, value: 214 },
};
export const PIN_SHA256 = sha256Hex("pin-fixture");

export const TARGET_SCAN_ROOT = "/tmp/semgrep-scan-target";
export const CONTROL_SCAN_ROOT = "/tmp/semgrep-scan-control";
/** 시험용 E(실제 저장소의 파일이 아니다). */
export const TARGET_PATHS: readonly string[] = [
  "app/page.tsx",
  "components/button.tsx",
  "lib/db.ts",
  "lib/util.ts",
  "next.config.ts",
  "scripts/tool.js",
];

export function scopeOf(paths: readonly string[]): ScopeResult {
  const entries: ScopeEntry[] = paths.map((path, i) => ({
    path,
    blobSha: sha256Hex(`blob-${i}`).slice(0, 40),
    size: 100 + i,
    decision: "include",
    reason: null,
  }));
  return {
    targetSha: "0123456789abcdef0123456789abcdef01234567",
    entries,
    included: entries,
    excludedCounts: {},
    scopeSha256: sha256Hex(paths.join("\n")),
  };
}

export const SCOPE = scopeOf(TARGET_PATHS);

/** 서버가 로딩 줄에 찍는 경로: 캐시 디렉터리 이름 + 규칙 파일의 상대 경로. */
export const LOADING_PATHS: readonly string[] = RULES_FILES.map((f) =>
  normalizeLoadingPath(`${PIN.rules.cache_dir_name}/${f.path}`)
);

export const CONTROL_REFERENCE_PASS: NonNullable<RunRecord["control_reference"]> = {
  run_id: "control-run-1",
  provenance: "real",
  status: "COMPLETE",
  control_assertions_status: "PASS",
  pin_sha256: PIN_SHA256,
  n0_confirmed: true,
};

export function targetInputs(over: Partial<EvaluateInputs> = {}): EvaluateInputs {
  return {
    mode: "target",
    pin: PIN,
    expectedRules: EXPECTED_RULES,
    rulesFiles: RULES_FILES,
    scope: SCOPE,
    controlExpectations: null,
    scanRoot: TARGET_SCAN_ROOT,
    precheckReasons: [],
    pinSha256: PIN_SHA256,
    controlReference: CONTROL_REFERENCE_PASS,
    metricsReceiverHits: 0,
    ...over,
  };
}

export function controlInputs(over: Partial<EvaluateInputs> = {}): EvaluateInputs {
  return {
    mode: "control",
    pin: PIN,
    expectedRules: EXPECTED_RULES,
    rulesFiles: RULES_FILES,
    scope: null,
    controlExpectations: CONTROL_EXPECTATIONS,
    scanRoot: CONTROL_SCAN_ROOT,
    precheckReasons: [],
    pinSha256: PIN_SHA256,
    controlReference: null,
    metricsReceiverHits: 0,
    ...over,
  };
}

export function targetSpec(over: Partial<HappySpec> = {}): HappySpec {
  return {
    mode: "target",
    scanRoot: TARGET_SCAN_ROOT,
    expectedPaths: TARGET_PATHS,
    loadingPaths: LOADING_PATHS,
    serverVersion: PIN.semgrep.version,
    n: EXPECTED_RULES.length,
    s: 0,
    k: TARGET_PATHS.length,
    m: 0,
    ...over,
  };
}

/** 기준 target 트랜스크립트: 모든 URI를 빈 진단으로 게시하고, 대조 참조는 PASS인 입력과 짝이다. */
export function happyTarget(over: Partial<HappySpec> = {}): Transcript {
  return happyTranscript(targetSpec(over));
}

/** 기준 control 트랜스크립트: 양성은 필수 ID를 게시하고 정상은 빈 진단이다(의도한 대로 탐지된 세계). */
export function happyControl(over: Partial<HappySpec> = {}): Transcript {
  const paths = CONTROL_EXPECTATIONS.cases.map((c) => c.path);
  const diagnostics: Record<string, { severity: number; code: string; message: string }[]> = {};
  let total = 0;
  for (const c of CONTROL_EXPECTATIONS.cases) {
    diagnostics[c.path] = c.required.map((code) => ({ severity: 2, code, message: "m" }));
    total += c.required.length;
  }
  return happyTranscript({
    mode: "control",
    scanRoot: CONTROL_SCAN_ROOT,
    expectedPaths: paths,
    loadingPaths: LOADING_PATHS,
    serverVersion: PIN.semgrep.version,
    n: EXPECTED_RULES.length,
    s: 0,
    k: paths.length,
    m: total,
    diagnostics,
    ...over,
  });
}

// ── 단언 도우미 ─────────────────────────────────────────────────

export function codesOf(v: Verdict): ReasonCode[] {
  return [...new Set(v.reasons.map((r) => r.code))].sort();
}

/** 공유 일관성 단언: complete·status·reasons가 서로 맞고, 사유 없이 COMPLETE가 되지 않으며, 대표 상태가 맞다. */
export function assertConsistent(v: Verdict): void {
  expect(v.complete).toBe(v.status === "COMPLETE");
  if (v.status === "COMPLETE") expect(v.reasons).toEqual([]);
  else expect(v.reasons.length).toBeGreaterThan(0);
  expect(representativeStatus(v.reasons)).toBe(v.status);
  for (const r of v.reasons) {
    expect(Object.keys(REASON_STATUS)).toContain(r.code);
    // 평가기가 내부 예외로 닫은 경우는 시험에서 허용하지 않는다.
    expect(r.detail ?? "").not.toMatch(/^internal:/);
  }
  expect(v.candidate_gate.policy_accepted).toBe(false);
  expect(v.candidate_gate.counts_as_lsp_security_warnings).toBe(false);
  if (v.status !== "COMPLETE") expect(v.candidate_gate.value).toBeNull();
}

const PHASES: ("PH1" | "PH2" | "PH3" | "PH4")[] = ["PH1", "PH2", "PH3", "PH4"];

/** buildRunRecord가 이 Verdict를 받아들이는지(= evidence.ts의 엄격한 일관성 검사를 통과하는지) 확인한다. */
export function buildRecord(
  v: Verdict,
  t: Transcript,
  inputs: EvaluateInputs
): ReturnType<typeof buildRunRecord> {
  const mode: Mode = t.meta.mode;
  return buildRunRecord({
    runId: t.meta.runId,
    mode,
    provenance: t.meta.provenance,
    verdict: v,
    inputs: {
      target_sha: t.meta.targetSha,
      pin_sha256: inputs.pinSha256,
      scope_sha256: inputs.scope ? inputs.scope.scopeSha256 : null,
      rules_list_sha256: PIN.rules.yaml_list_sha256,
      rules_expected_sha256: PIN.rules.expected_rules_sha256,
      control_tree_sha256: mode === "control" ? sha256Hex("control-tree") : null,
    },
    phasesReached: PHASES,
    controlReference: mode === "target" ? inputs.controlReference : null,
  });
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
