import { describe, expect, it } from "vitest";
import {
  NEGATIVE_CONTROL_TABLE,
  defaultNegativeControls,
  markPreflightNegativeControls,
} from "./control";
import { evaluateTranscript, type EvaluateInputs } from "./evaluate";
import { buildRunRecord, canonicalJson } from "./evidence";
import { toControlReference } from "./harness";
import { sha256Hex } from "./sha";
import { representativeStatus } from "./status";
import {
  CONTROL_EXPECTATIONS,
  EXPECTED_RULES,
  PIN,
  PIN_SHA256,
  TARGET_PATHS,
  TARGET_SCAN_ROOT,
  assertConsistent,
  codesOf,
  controlInputs,
  happyControl,
  happyTarget,
  targetInputs,
} from "./testing/evaluate-fixtures";
import {
  IDS,
  before,
  dropBarrier,
  dropEchoResponse,
  dropStderrLine,
  insertPublish,
  pipe,
  responseIs,
  setMeta,
  truncateStdout,
} from "./testing/transcript-builder";
import type { LspDiagnostic } from "./aggregate";
import type {
  NegativeControlResult,
  Pin,
  ReferenceFingerprints,
  RunRecord,
  Verdict,
} from "./types";
import { expectedUri } from "./uri";

// PR #28 외부 검토 회귀 시험(발견 1~4). 모든 시험은 설계 명세가 정한 올바른 동작을 단언한다.
//  · [RED]  현재 코드에서 실패해야 하는 시험(검토 지적이 실제로 존재한다).
//  · [GUARD] 현재 코드에서 통과하고 수정 후에도 계속 통과해야 하는 시험(과교정 방지).
// 아직 없는 필드·사유는 평범한 객체와 좁은 캐스트로 만들고 사유 코드는 문자열로 비교한다.
// provenance "real"은 평가기의 provenance 분기 논리를 시험하기 위한 가정이며 실제 Semgrep 실행의 증거가 아니다.

const FILE0 = TARGET_PATHS[0];
const FILE1 = TARGET_PATHS[1];
const RULE0 = EXPECTED_RULES[0].finalId;
const RULE1 = EXPECTED_RULES[1].finalId;

function diag(line: number, over: Partial<LspDiagnostic> = {}): LspDiagnostic {
  return {
    severity: 2,
    code: RULE0,
    message: `m${line}`,
    range: { start: { line, character: 0 }, end: { line, character: 5 } },
    ...over,
  };
}

const reasonCodes = (v: Verdict): string[] => v.reasons.map((r) => r.code as string);
const has = (v: Verdict, code: string): boolean => reasonCodes(v).includes(code);

/** 아직 타입에 없는 관측 필드를 읽는 좁은 보기. */
function newFacts(v: Verdict): {
  diagnosticCount: number | null | undefined;
  matchesDeduplicated: number | null | undefined;
} {
  const o = v.observed as unknown as {
    published: { diagnosticCount?: number | null };
    scan: { matchesDeduplicated?: number | null };
  };
  return {
    diagnosticCount: o.published.diagnosticCount,
    matchesDeduplicated: o.scan.matchesDeduplicated,
  };
}

function expectNotComplete(v: Verdict): void {
  expect(v.status).not.toBe("COMPLETE");
  expect(v.complete).toBe(false);
  expect(v.candidate_gate.value).toBeNull();
}

// ═══ 발견 1: Found M matches와 게시된 진단 수의 대조 ═══════════════

describe("발견 1: 일치 수 M과 게시 진단 수 D의 대조", () => {
  it("[RED] 검토의 재현: M=1인데 게시 진단이 없으면 COMPLETE가 아니다(MATCH_COUNT_DIAGNOSTICS_MISSING, 대표 PARTIAL)", () => {
    const v = evaluateTranscript(happyTarget({ m: 1 }), targetInputs());
    expect(v.status).not.toBe("COMPLETE");
    expect(reasonCodes(v)).toContain("MATCH_COUNT_DIAGNOSTICS_MISSING");
    expect(representativeStatus(v.reasons)).toBe("PARTIAL");
    expect(v.status).toBe("PARTIAL");
    expect(v.candidate_gate.value).toBeNull();
    expect(v.complete).toBe(false);
    assertConsistent(v);
  });

  it("[RED] M=0인데 한 파일에 진단이 하나 게시되면 EXCESS이고 value는 null이다", () => {
    const v = evaluateTranscript(
      happyTarget({ m: 0, diagnostics: { [FILE0]: [diag(1)] } }),
      targetInputs()
    );
    expect(reasonCodes(v)).toContain("MATCH_COUNT_DIAGNOSTICS_EXCESS");
    expectNotComplete(v);
    assertConsistent(v);
  });

  it("[RED] M=1인데 진단이 두 건 게시되면 EXCESS이고 value는 null이다", () => {
    const v = evaluateTranscript(
      happyTarget({ m: 1, diagnostics: { [FILE0]: [diag(1), diag(2)] } }),
      targetInputs()
    );
    expect(reasonCodes(v)).toContain("MATCH_COUNT_DIAGNOSTICS_EXCESS");
    expect(reasonCodes(v)).not.toContain("MATCH_COUNT_DIAGNOSTICS_MISSING");
    expectNotComplete(v);
  });

  it("[RED] control 모드: M>0인데 모든 게시가 빈 진단이면 MISSING이다", () => {
    const v = evaluateTranscript(happyControl({ m: 1, diagnostics: {} }), controlInputs());
    expect(reasonCodes(v)).toContain("MATCH_COUNT_DIAGNOSTICS_MISSING");
    expect(v.status).not.toBe("COMPLETE");
    expect(v.complete).toBe(false);
  });

  it("[RED] control 모드: D가 M보다 크면 EXCESS이다", () => {
    const total = CONTROL_EXPECTATIONS.cases.reduce((sum, c) => sum + c.required.length, 0);
    expect(total).toBeGreaterThan(1); // 시험의 전제
    const v = evaluateTranscript(happyControl({ m: total - 1 }), controlInputs());
    expect(reasonCodes(v)).toContain("MATCH_COUNT_DIAGNOSTICS_EXCESS");
    expect(v.status).not.toBe("COMPLETE");
  });

  it("[GUARD] control 모드: M이 게시 진단 수와 같은 기준 트랜스크립트는 COMPLETE다", () => {
    const v = evaluateTranscript(happyControl(), controlInputs());
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
  });

  it("[RED] 늦은 진단도 D에 센다: M=0이고 유일한 진단이 echo 뒤에 오면 DIAGNOSTIC_AFTER_ECHO와 EXCESS가 함께 나온다", () => {
    const t = pipe(
      happyTarget({ m: 0 }),
      insertPublish(expectedUri(TARGET_SCAN_ROOT, FILE0), [diag(1)], "late")
    );
    const v = evaluateTranscript(t, targetInputs());
    expect(reasonCodes(v)).toContain("DIAGNOSTIC_AFTER_ECHO");
    expect(reasonCodes(v)).toContain("MATCH_COUNT_DIAGNOSTICS_EXCESS");
    expectNotComplete(v);
  });

  it("[GUARD] 늦은 진단이 M=1의 몫이면(D=1 ≤ M) 사유는 정확히 DIAGNOSTIC_AFTER_ECHO 하나다", () => {
    const t = pipe(
      happyTarget({ m: 1 }),
      insertPublish(expectedUri(TARGET_SCAN_ROOT, FILE0), [diag(1)], "late")
    );
    const v = evaluateTranscript(t, targetInputs());
    expect(codesOf(v)).toEqual(["DIAGNOSTIC_AFTER_ECHO"]);
    expect(reasonCodes(v)).not.toContain("MATCH_COUNT_DIAGNOSTICS_MISSING");
    expect(reasonCodes(v)).not.toContain("MATCH_COUNT_DIAGNOSTICS_EXCESS");
  });

  it("[GUARD] M=0이고 D=0이면 COMPLETE이고 value는 0이다(target, 유효 참조)", () => {
    const v = evaluateTranscript(happyTarget({ m: 0 }), targetInputs());
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
    expect(v.candidate_gate.value).toBe(0);
  });

  it("[GUARD] M=3이고 한 파일에 진단이 두 건(D=2, 서버가 JSON이 같은 진단을 합친 경우)이면 COMPLETE다 — M=D를 요구하지 않는다", () => {
    const v = evaluateTranscript(
      happyTarget({ m: 3, diagnostics: { [FILE0]: [diag(1), diag(2)] } }),
      targetInputs()
    );
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
    expect(v.observed.totals?.total).toBe(2);
    expect(v.candidate_gate.value).toBe(2);
  });

  it("[RED] 같은 경우의 정보 필드: published.diagnosticCount는 2, scan.matchesDeduplicated는 1(= M − D)이다", () => {
    const v = evaluateTranscript(
      happyTarget({ m: 3, diagnostics: { [FILE0]: [diag(1), diag(2)] } }),
      targetInputs()
    );
    expect(newFacts(v).diagnosticCount).toBe(2);
    expect(newFacts(v).matchesDeduplicated).toBe(1);
  });

  it("[RED] M=D=0이면 diagnosticCount 0, matchesDeduplicated 0이다", () => {
    const v = evaluateTranscript(happyTarget({ m: 0 }), targetInputs());
    expect(newFacts(v).diagnosticCount).toBe(0);
    expect(newFacts(v).matchesDeduplicated).toBe(0);
  });

  it("[GUARD] M이 D와 같으면(두 파일에 진단 1건씩, M=2) COMPLETE다", () => {
    const v = evaluateTranscript(
      happyTarget({
        m: 2,
        diagnostics: { [FILE0]: [diag(1)], [FILE1]: [diag(2, { code: RULE1 })] },
      }),
      targetInputs()
    );
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
    expect(v.candidate_gate.value).toBe(2);
  });

  it("[RED] 모순(MISSING·EXCESS)인 경우에도 diagnosticCount는 원시 D로 채우고 matchesDeduplicated는 null이다", () => {
    const missing = evaluateTranscript(happyTarget({ m: 1 }), targetInputs());
    expect(newFacts(missing).diagnosticCount).toBe(0);
    expect(newFacts(missing).matchesDeduplicated).toBeNull();
    const excess = evaluateTranscript(
      happyTarget({ m: 0, diagnostics: { [FILE0]: [diag(1)] } }),
      targetInputs()
    );
    expect(newFacts(excess).diagnosticCount).toBe(1);
    expect(newFacts(excess).matchesDeduplicated).toBeNull();
  });

  it("[RED] 원시 대 집계: code·범위가 같고 message만 다른 진단 두 건(M=2)은 COMPLETE이고 totals.total은 1(하네스 키), diagnosticCount는 2(원시)다", () => {
    const sameKey = [diag(1, { message: "first" }), diag(1, { message: "second" })];
    const v = evaluateTranscript(
      happyTarget({ m: 2, diagnostics: { [FILE0]: sameKey } }),
      targetInputs()
    );
    expect(v.status).toBe("COMPLETE");
    expect(v.observed.totals?.total).toBe(1);
    expect(newFacts(v).diagnosticCount).toBe(2);
    expect(newFacts(v).matchesDeduplicated).toBe(0);
  });

  it("[RED] 비교는 원시 D로 한다: 같은 입력에서 M=1이면(D=2 > M) 집계 합계가 1이어도 EXCESS다", () => {
    const sameKey = [diag(1, { message: "first" }), diag(1, { message: "second" })];
    const v = evaluateTranscript(
      happyTarget({ m: 1, diagnostics: { [FILE0]: sameKey } }),
      targetInputs()
    );
    expect(v.observed.totals?.total).toBe(1); // 집계 키로는 M과 같아 보이지만
    expect(reasonCodes(v)).toContain("MATCH_COUNT_DIAGNOSTICS_EXCESS");
    expectNotComplete(v);
  });

  describe("연쇄 억제: 스캔 증거를 평가할 수 없으면 MATCH_COUNT_* 사유를 더하지 않는다", () => {
    const matchCount = (v: Verdict) =>
      reasonCodes(v).filter((c) => c.startsWith("MATCH_COUNT_DIAGNOSTICS_"));

    it("[GUARD] 장벽이 없으면(M=1, 진단 없음) 사유 집합은 M=0일 때와 같고 MATCH_COUNT_*는 없다", () => {
      const withM1 = evaluateTranscript(pipe(happyTarget({ m: 1 }), dropBarrier), targetInputs());
      const withM0 = evaluateTranscript(pipe(happyTarget({ m: 0 }), dropBarrier), targetInputs());
      expect(matchCount(withM1)).toEqual([]);
      expect(codesOf(withM1)).toEqual(codesOf(withM0));
      expect(withM1.status).toBe(withM0.status);
    });

    it("[GUARD] 잘린 프레임(echo 응답 앞에서 끊김)이면 M=1이어도 MATCH_COUNT_*는 없고 사유 집합은 M=0일 때와 같다", () => {
      const cut = truncateStdout(before(responseIs(IDS.echoPost)), "TRUNCATED");
      const withM1 = evaluateTranscript(pipe(happyTarget({ m: 1 }), cut), targetInputs());
      const withM0 = evaluateTranscript(pipe(happyTarget({ m: 0 }), cut), targetInputs());
      expect(matchCount(withM1)).toEqual([]);
      expect(codesOf(withM1)).toEqual(codesOf(withM0));
    });

    it("[GUARD] 깨진 프레임(MALFORMED)이어도 MATCH_COUNT_*는 없다", () => {
      const cut = truncateStdout(before(responseIs(IDS.echoPost)), "MALFORMED");
      const v = evaluateTranscript(pipe(happyTarget({ m: 1 }), cut), targetInputs());
      expect(matchCount(v)).toEqual([]);
    });

    it("[GUARD] echo 응답이 없으면 MATCH_COUNT_*는 없다", () => {
      const v = evaluateTranscript(
        pipe(happyTarget({ m: 1 }), dropEchoResponse("post")),
        targetInputs()
      );
      expect(matchCount(v)).toEqual([]);
      expect(has(v, "ECHO_MISSING")).toBe(true);
    });

    it("[GUARD] Found M matches 줄이 없으면(M을 알 수 없음) MATCH_COUNT_*는 없다", () => {
      const v = evaluateTranscript(
        pipe(happyTarget({ m: 1 }), dropStderrLine(/^Found \d+ matches/)),
        targetInputs()
      );
      expect(matchCount(v)).toEqual([]);
      expect(has(v, "ENGINE_REPORT_LOG_MISSING")).toBe(true);
    });

    it("[RED] 평가할 수 없는 경우의 정보 필드는 둘 다 null이다(장벽 없음)", () => {
      const v = evaluateTranscript(pipe(happyTarget({ m: 1 }), dropBarrier), targetInputs());
      expect(newFacts(v).diagnosticCount).toBeNull();
      expect(newFacts(v).matchesDeduplicated).toBeNull();
    });
  });
});

// ═══ 발견 4: 핀의 S0와 로그의 S 비교 ═════════════════════════════

describe("발견 4: S0 비교(S=0 포함)", () => {
  const run = (s0: Pin["s0"], s: number): Verdict =>
    evaluateTranscript(happyTarget({ s }), targetInputs({ pin: { ...PIN, s0 } as Pin }));

  it("[RED] 검토의 재현: S0={관측 2, 설명됨}인데 로그 S=0이면 SKIPPED_RULES_S0_MISMATCH(PARTIAL, value null)", () => {
    const v = run({ observed: 2, explained: true }, 0);
    expect(reasonCodes(v)).toContain("SKIPPED_RULES_S0_MISMATCH");
    expect(v.status).toBe("PARTIAL");
    expect(v.candidate_gate.value).toBeNull();
    expect(v.reasons.find((r) => (r.code as string) === "SKIPPED_RULES_S0_MISMATCH")?.detail).toBe(
      "S=0, S0=2"
    );
  });

  it("[RED] S0={관측 0, 설명됨}인데 S=2이면 불일치다", () => {
    const v = run({ observed: 0, explained: true }, 2);
    expect(reasonCodes(v)).toContain("SKIPPED_RULES_S0_MISMATCH");
    expect(v.status).toBe("PARTIAL");
    expect(v.candidate_gate.value).toBeNull();
    expect(v.reasons.find((r) => (r.code as string) === "SKIPPED_RULES_S0_MISMATCH")?.detail).toBe(
      "S=2, S0=0"
    );
  });

  it("[RED] S0={관측 2, 설명됨}인데 S=3이면(양수끼리 다름) 불일치다", () => {
    const v = run({ observed: 2, explained: true }, 3);
    expect(reasonCodes(v)).toContain("SKIPPED_RULES_S0_MISMATCH");
    expect(v.status).toBe("PARTIAL");
    expect(v.candidate_gate.value).toBeNull();
  });

  it("[GUARD] S0={2, 설명됨}이고 S=2이면 COMPLETE다", () => {
    const v = run({ observed: 2, explained: true }, 2);
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
  });

  it("[GUARD] S0={0, 설명됨}이고 S=0이면 COMPLETE다", () => {
    const v = run({ observed: 0, explained: true }, 0);
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
  });

  it("[GUARD] 확인되지 않은 S0({관측 null, 설명 안 됨})이고 S=0이면 COMPLETE다", () => {
    const v = run({ observed: null, explained: false }, 0);
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
  });

  it("[GUARD] 확인되지 않은 S0이고 S=2이면 정확히 ENGINE_SKIPPED_RULES_UNEXPLAINED다", () => {
    const v = run({ observed: null, explained: false }, 2);
    expect(codesOf(v)).toEqual(["ENGINE_SKIPPED_RULES_UNEXPLAINED"]);
    expect(v.status).toBe("PARTIAL");
  });

  it("[GUARD] 값만 있고 설명 안 된 S0({관측 2, 설명 안 됨})이고 S=2이면 ENGINE_SKIPPED_RULES_UNEXPLAINED다", () => {
    const v = run({ observed: 2, explained: false }, 2);
    expect(codesOf(v)).toEqual(["ENGINE_SKIPPED_RULES_UNEXPLAINED"]);
  });

  it("[GUARD] 값만 있고 설명 안 된 S0({관측 2, 설명 안 됨})이고 S=0이면 COMPLETE다", () => {
    const v = run({ observed: 2, explained: false }, 0);
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
  });

  it("[GUARD] 설명됨이지만 관측 값이 null인 S0도 확인되지 않은 것으로 본다: S=0은 COMPLETE, S=2는 UNEXPLAINED", () => {
    expect(run({ observed: null, explained: true }, 0).status).toBe("COMPLETE");
    expect(codesOf(run({ observed: null, explained: true }, 2))).toEqual([
      "ENGINE_SKIPPED_RULES_UNEXPLAINED",
    ]);
  });
});

// ═══ 발견 2·3 공용 재료 ═════════════════════════════════════════

const HARNESS_SHA = sha256Hex("harness-fixture");
const CONTROL_SHA = sha256Hex("control-fixture");
const WHEEL_SHA = sha256Hex("wheel-fixture");
const TOOL_VERSION = PIN.semgrep.version;

interface BindingParts {
  tool_version: string;
  wheel_sha256: string;
  pin_sha256: string;
  rules_list_sha256: string;
  rules_expected_sha256: string;
  harness_sha256: string;
  control_sha256: string;
}

/** 명세 공식(§4)을 시험 안에서 따로 구현한 것. 운영 buildBinding과 독립이다. */
function specBinding(c: BindingParts): string {
  return sha256Hex(
    canonicalJson({
      schema: "semgrep-lsp-binding/1",
      tool: { version: c.tool_version, wheel_sha256: c.wheel_sha256 },
      pin_sha256: c.pin_sha256,
      rules: { list_sha256: c.rules_list_sha256, expected_sha256: c.rules_expected_sha256 },
      harness_sha256: c.harness_sha256,
      control_sha256: c.control_sha256,
    })
  );
}

/** 값이 모두 채워지고 결합이 구성 요소와 맞는 지문. over에 binding_sha256을 주면 그 값을 그대로 쓴다. */
function fp(over: Partial<ReferenceFingerprints> = {}): ReferenceFingerprints {
  const merged = {
    harness_sha256: HARNESS_SHA,
    control_sha256: CONTROL_SHA,
    rules_list_sha256: PIN.rules.yaml_list_sha256,
    rules_expected_sha256: PIN.rules.expected_rules_sha256,
    tool_version: TOOL_VERSION,
    wheel_sha256: WHEEL_SHA,
    ...over,
  };
  const binding =
    over.binding_sha256 !== undefined
      ? over.binding_sha256
      : specBinding({
          tool_version: merged.tool_version as string,
          wheel_sha256: merged.wheel_sha256 as string,
          pin_sha256: PIN_SHA256,
          rules_list_sha256: merged.rules_list_sha256,
          rules_expected_sha256: merged.rules_expected_sha256,
          harness_sha256: merged.harness_sha256 as string,
          control_sha256: merged.control_sha256 as string,
        });
  return { ...merged, binding_sha256: binding } as ReferenceFingerprints;
}

const FP = fp();

type Entry = Record<string, unknown> & { id: string; layer: string };

/** 필요한 (id, 층) 16쌍이 전부 PASS이고 같은 결합을 가진 기록(NegativeControlResult 모양 전체). */
function qualifiedResults(binding: string | null): Entry[] {
  const out: Entry[] = [];
  for (const spec of NEGATIVE_CONTROL_TABLE) {
    out.push({
      id: spec.id,
      layer: "engine",
      expected: spec.expected,
      observed: spec.expected,
      status: "PASS",
      binding_sha256: binding,
    });
    if (spec.preflight !== null) {
      out.push({
        id: spec.id,
        layer: "preflight",
        expected: spec.preflight.status,
        observed: spec.preflight.status,
        status: "PASS",
        binding_sha256: binding,
      });
    }
  }
  return out;
}

function findEntry(list: Entry[], id: string, layer: string): Entry {
  const found = list.find((e) => e.id === id && e.layer === layer);
  if (!found) throw new Error(`시험 오류: ${id}:${layer} 항목이 없다`);
  return found;
}

/** control_reference 요약 모양의 완전한 참조(평범한 객체). */
function qualifiedRef(f: ReferenceFingerprints = FP): Record<string, unknown> {
  return {
    run_id: "control-run-1",
    provenance: "real",
    status: "COMPLETE",
    control_assertions_status: "PASS",
    pin_sha256: PIN_SHA256,
    n0_confirmed: true,
    eligible: true,
    fingerprints: { ...f },
    negative_controls: qualifiedResults(f.binding_sha256).map((n) => ({
      id: n.id,
      layer: n.layer,
      status: n.status,
      binding_sha256: n.binding_sha256,
    })),
  };
}

/** target 판정: 평범한 참조 객체와 이 실행의 현재 지문을 넣어 평가한다. */
function evalTarget(
  ref: unknown,
  current: ReferenceFingerprints = FP,
  inputOver: Partial<EvaluateInputs> = {}
): Verdict {
  const inputs = {
    ...targetInputs({ controlReference: ref as EvaluateInputs["controlReference"], ...inputOver }),
    currentFingerprints: current,
  } as EvaluateInputs;
  return evaluateTranscript(happyTarget(), inputs);
}

function expectControlMissing(v: Verdict, ...codes: string[]): void {
  expect(v.status).not.toBe("COMPLETE");
  expect(v.status).toBe("CONTROL_MISSING");
  expect(v.candidate_gate.value).toBeNull();
  expect(v.complete).toBe(false);
  for (const code of codes) expect(reasonCodes(v)).toContain(code);
}

interface ControlRecordOptions {
  negatives?: Entry[];
  fingerprints?: ReferenceFingerprints;
  provenance?: "real" | "stub";
  n0?: boolean;
}

/** control 트랜스크립트를 평가해 buildRunRecord까지 만든다(음성 대조 기본값은 전부 NOT_RUN). */
function controlRecord(opts: ControlRecordOptions = {}): RunRecord {
  const f = opts.fingerprints ?? FP;
  const t = pipe(happyControl(), setMeta({ provenance: opts.provenance ?? "real" }));
  const verdict = evaluateTranscript(
    t,
    controlInputs(
      opts.negatives === undefined
        ? {}
        : { negativeControls: opts.negatives as unknown as NegativeControlResult[] }
    )
  );
  return buildRunRecord({
    runId: t.meta.runId,
    mode: "control",
    provenance: t.meta.provenance,
    verdict,
    inputs: {
      target_sha: null,
      pin_sha256: PIN_SHA256,
      scope_sha256: null,
      rules_list_sha256: f.rules_list_sha256,
      rules_expected_sha256: f.rules_expected_sha256,
      control_tree_sha256: sha256Hex("control-tree"),
      harness_sha256: f.harness_sha256,
      control_sha256: f.control_sha256,
      tool_version_observed: f.tool_version,
      wheel_sha256_observed: f.wheel_sha256,
      binding_sha256: f.binding_sha256,
    },
    phasesReached: ["PH1", "PH2", "PH3", "PH4"],
    controlReference: null,
    n0Confirmed: opts.n0 ?? true,
  } as never);
}

// ═══ 발견 2: 음성 대조가 대조 참조 자격을 결정한다 ═══════════════

describe("발견 2: 음성 대조 미실행 대조 실행은 target의 대조 참조가 될 수 없다", () => {
  it("[RED] 검토의 재현(real 출처 끝에서 끝까지): 음성 대조가 모두 NOT_RUN인 대조 실행의 요약으로는 target이 COMPLETE가 되지 못한다", () => {
    const record = controlRecord(); // 기본 음성 대조 = 전부 NOT_RUN
    const ref = toControlReference(record, true);
    const v = evalTarget(ref);
    expectControlMissing(
      v,
      "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE",
      "CONTROL_REFERENCE_NOT_ELIGIBLE"
    );
  });

  it("[GUARD] 같은 대조 기록의 control_assertions는 여전히 PASS이고 측정은 COMPLETE다(성공 기록을 거짓 실패로 덮지 않는다)", () => {
    const record = controlRecord();
    expect(record.control_assertions.status).toBe("PASS");
    expect(record.measurement.status).toBe("COMPLETE");
    expect(record.measurement.complete).toBe(true);
  });

  it("[RED] 같은 기록의 reference_qualification은 eligible:false이고 NEGATIVE_ENGINE_PASS가 불충족이다", () => {
    const q = (
      controlRecord() as unknown as {
        reference_qualification?: {
          applicable: boolean;
          eligible: boolean;
          requirements: { id: string; satisfied: boolean }[];
        };
      }
    ).reference_qualification;
    expect(q?.applicable).toBe(true);
    expect(q?.eligible).toBe(false);
    const engine = q?.requirements.find((r) => r.id === "NEGATIVE_ENGINE_PASS");
    expect(engine?.satisfied).toBe(false);
    // 나머지 사실(출처·측정·단언·N0·지문)은 충족돼 있으므로 불충족은 음성 대조에서만 온다.
    for (const id of [
      "PROVENANCE_REAL",
      "MEASUREMENT_COMPLETE",
      "CONTROL_ASSERTIONS_PASS",
      "N0_CONFIRMED",
      "FINGERPRINTS_COMPLETE",
    ]) {
      expect(q?.requirements.find((r) => r.id === id)?.satisfied, id).toBe(true);
    }
  });

  it("[GUARD] FAIL인 음성 대조는 대조 단언을 FAIL로 만들고, 전부 NOT_RUN이면 PASS를 막지 않는다", () => {
    const failing = defaultNegativeControls().map((n, i) =>
      i === 0 ? { ...n, status: "FAIL" as const } : n
    );
    const withFail = evaluateTranscript(
      happyControl(),
      controlInputs({ negativeControls: failing })
    );
    expect(withFail.control_assertions.status).toBe("FAIL");
    const allNotRun = evaluateTranscript(happyControl(), controlInputs());
    expect(allNotRun.control_assertions.status).toBe("PASS");
  });

  it("[RED] defaultNegativeControls: 엔진 9개 + 사전 검사 7개 = 16개이며 전부 NOT_RUN, 관측 없음, 결합 null이다", () => {
    const list = defaultNegativeControls() as unknown as Entry[];
    expect(list).toHaveLength(16);
    expect(
      list
        .filter((e) => e.layer === "engine")
        .map((e) => e.id)
        .sort()
    ).toEqual(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"]);
    expect(
      list
        .filter((e) => e.layer === "preflight")
        .map((e) => e.id)
        .sort()
    ).toEqual(["R1", "R2", "R3", "R4", "R5", "R7", "R9"]);
    for (const e of list) {
      expect(e.status).toBe("NOT_RUN");
      expect(e.observed).toBeNull();
      expect(e.binding_sha256).toBeNull();
    }
  });

  it("[RED] markPreflightNegativeControls(기록, 사유, 결합): 사전 검사 항목만 PASS로 바뀌고 결합이 찍히며 엔진 항목은 NOT_RUN으로 남는다", () => {
    const binding = sha256Hex("binding-under-test");
    const produced: Record<string, { code: string }[]> = {};
    for (const spec of NEGATIVE_CONTROL_TABLE) {
      if (spec.preflight !== null) produced[spec.id] = [{ code: spec.preflight.reason }];
    }
    const mark = markPreflightNegativeControls as unknown as (
      base: unknown,
      produced: unknown,
      binding: string
    ) => Entry[];
    const result = mark(defaultNegativeControls(), produced, binding);
    const preflight = result.filter((e) => e.layer === "preflight");
    const engine = result.filter((e) => e.layer === "engine");
    expect(preflight).toHaveLength(7);
    expect(engine).toHaveLength(9);
    for (const e of preflight) {
      expect(e.status, `${e.id}:preflight`).toBe("PASS");
      expect(e.binding_sha256, `${e.id}:preflight`).toBe(binding);
    }
    for (const e of engine) {
      expect(e.status, `${e.id}:engine`).toBe("NOT_RUN");
      expect(e.observed, `${e.id}:engine`).toBeNull();
      expect(e.binding_sha256, `${e.id}:engine`).toBeNull();
    }
  });

  it("[RED] 일부 id만 넘기면 나머지 사전 검사는 NOT_RUN이고, 사전 검사 사유가 없으면 FAIL이며 엔진 항목은 어느 경우에도 그대로다", () => {
    const binding = sha256Hex("binding-under-test");
    const mark = markPreflightNegativeControls as unknown as (
      base: unknown,
      produced: unknown,
      binding: string
    ) => Entry[];
    const r1Reason = NEGATIVE_CONTROL_TABLE[0].preflight?.reason as string;
    const ok = mark(defaultNegativeControls(), { R1: [{ code: r1Reason }] }, binding);
    expect(ok).toHaveLength(16); // 엔진 9 + 사전 검사 7
    expect(findEntry(ok, "R1", "preflight").status).toBe("PASS");
    expect(findEntry(ok, "R2", "preflight").status).toBe("NOT_RUN");
    expect(findEntry(ok, "R1", "engine").status).toBe("NOT_RUN");
    const failed = mark(defaultNegativeControls(), { R1: [] }, binding);
    expect(findEntry(failed, "R1", "preflight").status).toBe("FAIL");
    expect(findEntry(failed, "R1", "engine").status).toBe("NOT_RUN");
    expect(findEntry(failed, "R1", "engine").binding_sha256).toBeNull();
  });

  it("[GUARD] 사전 검사가 없는 id(R6, R8)와 알 수 없는 id는 여전히 던진다", () => {
    const mark = markPreflightNegativeControls as unknown as (
      base: unknown,
      produced: unknown,
      binding: string
    ) => unknown;
    const binding = sha256Hex("binding-under-test");
    expect(() => mark(defaultNegativeControls(), { R6: [] }, binding)).toThrow();
    expect(() => mark(defaultNegativeControls(), { R8: [] }, binding)).toThrow();
    expect(() => mark(defaultNegativeControls(), { R99: [] }, binding)).toThrow();
  });

  describe("target 판정은 참조의 사실을 다시 확인한다(자기 선언을 믿지 않는다)", () => {
    it("[GUARD] 완전히 자격을 갖춘 참조(16개 PASS, 결합 일치, 현재 지문 일치, N0 확정, 핀 일치, real)면 target은 COMPLETE이고 value는 0이다", () => {
      const v = evalTarget(qualifiedRef());
      expect(v.status).toBe("COMPLETE");
      expect(v.reasons).toEqual([]);
      expect(v.candidate_gate.value).toBe(0);
    });

    const mutations: [string, (r: Record<string, unknown>) => void][] = [
      [
        "사전 검사 7개는 PASS이고 엔진이 모두 NOT_RUN",
        (r) => {
          r.negative_controls = (r.negative_controls as Entry[]).map((e) =>
            e.layer === "engine" ? { ...e, status: "NOT_RUN", binding_sha256: null } : e
          );
        },
      ],
      [
        "엔진 9개는 PASS이고 사전 검사가 모두 NOT_RUN",
        (r) => {
          r.negative_controls = (r.negative_controls as Entry[]).map((e) =>
            e.layer === "preflight" ? { ...e, status: "NOT_RUN", binding_sha256: null } : e
          );
        },
      ],
      [
        "엔진 항목 하나가 FAIL",
        (r) => {
          findEntry(r.negative_controls as Entry[], "R3", "engine").status = "FAIL";
        },
      ],
      [
        "엔진 항목 하나가 없음",
        (r) => {
          r.negative_controls = (r.negative_controls as Entry[]).filter(
            (e) => !(e.id === "R6" && e.layer === "engine")
          );
        },
      ],
      [
        "항목 하나가 두 번 들어 있음",
        (r) => {
          const list = r.negative_controls as Entry[];
          r.negative_controls = [...list, { ...findEntry(list, "R1", "engine") }];
        },
      ],
      [
        "PASS 항목 하나의 결합(binding_sha256)이 참조의 결합과 다름",
        (r) => {
          findEntry(r.negative_controls as Entry[], "R2", "preflight").binding_sha256 =
            sha256Hex("other-run-binding");
        },
      ],
      [
        "negative_controls가 빈 배열",
        (r) => {
          r.negative_controls = [];
        },
      ],
    ];
    for (const [name, mutate] of mutations) {
      it(`[RED] ${name} → CONTROL_REFERENCE_NEGATIVE_INCOMPLETE (CONTROL_MISSING, value null)`, () => {
        const ref = qualifiedRef();
        mutate(ref);
        expectControlMissing(evalTarget(ref), "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
      });
    }

    it("[RED] 참조가 eligible:false를 선언하면 CONTROL_REFERENCE_NOT_ELIGIBLE이다(사실은 모두 맞아도)", () => {
      const v = evalTarget({ ...qualifiedRef(), eligible: false });
      expectControlMissing(v, "CONTROL_REFERENCE_NOT_ELIGIBLE");
      expect(reasonCodes(v)).not.toContain("CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
    });

    it("[RED] 위조: eligible:true를 선언했지만 음성 대조 하나가 NOT_RUN이면 NEGATIVE_INCOMPLETE와 NOT_ELIGIBLE이 함께 나온다", () => {
      const ref = qualifiedRef();
      const e = findEntry(ref.negative_controls as Entry[], "R4", "engine");
      e.status = "NOT_RUN";
      e.binding_sha256 = null;
      expect(ref.eligible).toBe(true);
      expectControlMissing(
        evalTarget(ref),
        "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE",
        "CONTROL_REFERENCE_NOT_ELIGIBLE"
      );
    });

    it("[RED] 사실 확인 사유의 상세에는 'R3:engine(NOT_RUN)' 같은 토큰만 있고 해시 값은 없다", () => {
      const ref = qualifiedRef();
      const e = findEntry(ref.negative_controls as Entry[], "R3", "engine");
      e.status = "NOT_RUN";
      e.binding_sha256 = null;
      const hit = evalTarget(ref).reasons.find(
        (r) => (r.code as string) === "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE"
      );
      expect(hit?.detail ?? "").toContain("R3:engine(NOT_RUN)");
      expect(hit?.detail ?? "").not.toMatch(/[0-9a-f]{64}/);
    });
  });

  describe("끝에서 끝까지: 자격을 갖춘 대조 기록의 요약", () => {
    it("[GUARD] 16개 음성 대조가 모두 PASS이고 결합이 일치하는 real 대조 기록 → 요약 → target은 COMPLETE이다", () => {
      const record = controlRecord({ negatives: qualifiedResults(FP.binding_sha256) });
      const ref = toControlReference(record, true);
      const v = evalTarget(ref);
      expect(v.status).toBe("COMPLETE");
      expect(v.reasons).toEqual([]);
      expect(v.candidate_gate.value).toBe(0);
    });

    it("[RED] 그 요약은 eligible:true이고 지문 7개와 음성 대조 16개(층·결합 포함)를 사실로 싣는다", () => {
      const record = controlRecord({ negatives: qualifiedResults(FP.binding_sha256) });
      const ref = toControlReference(record, true) as unknown as {
        eligible?: boolean;
        fingerprints?: unknown;
        negative_controls?: {
          id: string;
          layer: string;
          status: string;
          binding_sha256: string | null;
        }[];
      };
      expect(ref.eligible).toBe(true);
      expect(ref.fingerprints).toEqual(FP);
      expect(ref.negative_controls).toHaveLength(16);
      for (const n of ref.negative_controls ?? []) {
        expect(["preflight", "engine"]).toContain(n.layer);
        expect(n.status).toBe("PASS");
        expect(n.binding_sha256).toBe(FP.binding_sha256);
      }
    });

    it("[RED] n0Confirmed가 false면 요약은 eligible:false이고 target은 NOT_ELIGIBLE과 N0_UNCONFIRMED로 거부한다", () => {
      const record = controlRecord({ negatives: qualifiedResults(FP.binding_sha256), n0: false });
      const ref = toControlReference(record, false) as unknown as { eligible?: boolean };
      expect(ref.eligible).toBe(false);
      expectControlMissing(evalTarget(ref), "N0_UNCONFIRMED", "CONTROL_REFERENCE_NOT_ELIGIBLE");
    });

    it("[RED] 스텁 출처의 대조 기록은 모든 사실이 맞아도 eligible:false다", () => {
      const record = controlRecord({
        negatives: qualifiedResults(FP.binding_sha256),
        provenance: "stub",
      });
      const ref = toControlReference(record, true) as unknown as { eligible?: boolean };
      expect(ref.eligible).toBe(false);
    });
  });
});

// ═══ 발견 3: 지문과 결합이 대조 참조를 이번 실행에 묶는다 ═════════

describe("발견 3: 하네스·대조·도구 지문과 결합", () => {
  const FIELDS = [
    "harness_sha256",
    "control_sha256",
    "binding_sha256",
    "tool_version",
    "wheel_sha256",
  ] as const;
  const other = (label: string) => sha256Hex(`other-${label}`);

  it("[GUARD] buildRunRecord는 inputs의 새 지문 필드를 그대로 보존한다", () => {
    const inputs = controlRecord().inputs as unknown as Record<string, unknown>;
    expect(inputs.harness_sha256).toBe(FP.harness_sha256);
    expect(inputs.control_sha256).toBe(FP.control_sha256);
    expect(inputs.tool_version_observed).toBe(FP.tool_version);
    expect(inputs.wheel_sha256_observed).toBe(FP.wheel_sha256);
    expect(inputs.binding_sha256).toBe(FP.binding_sha256);
  });

  it("[RED] toControlReference는 기록의 지문을 fingerprints로 내보낸다(이름 대응: *_observed → tool_version·wheel_sha256)", () => {
    const record = controlRecord();
    const ref = toControlReference(record, true) as unknown as { fingerprints?: unknown };
    expect(ref.fingerprints).toEqual({
      harness_sha256: FP.harness_sha256,
      control_sha256: FP.control_sha256,
      rules_list_sha256: PIN.rules.yaml_list_sha256,
      rules_expected_sha256: PIN.rules.expected_rules_sha256,
      tool_version: FP.tool_version,
      wheel_sha256: FP.wheel_sha256,
      binding_sha256: FP.binding_sha256,
    });
  });

  it("[RED] 참조에 fingerprints가 아예 없으면 CONTROL_REFERENCE_FINGERPRINT_MISSING이다", () => {
    const ref = qualifiedRef();
    delete ref.fingerprints;
    expectControlMissing(evalTarget(ref), "CONTROL_REFERENCE_FINGERPRINT_MISSING");
  });

  for (const field of FIELDS) {
    it(`[RED] 참조의 ${field}가 null이면 CONTROL_REFERENCE_FINGERPRINT_MISSING이다`, () => {
      const ref = qualifiedRef();
      (ref.fingerprints as Record<string, unknown>)[field] = null;
      expectControlMissing(evalTarget(ref), "CONTROL_REFERENCE_FINGERPRINT_MISSING");
    });

    it(`[RED] 이번 실행(currentFingerprints)의 ${field}가 null이면 CONTROL_REFERENCE_FINGERPRINT_MISSING이다`, () => {
      const current = { ...FP, [field]: null } as unknown as ReferenceFingerprints;
      expectControlMissing(
        evalTarget(qualifiedRef(), current),
        "CONTROL_REFERENCE_FINGERPRINT_MISSING"
      );
    });

    it(`[RED] 참조와 이번 실행의 ${field}가 둘 다 null이어도 '일치'로 보지 않는다`, () => {
      const ref = qualifiedRef();
      (ref.fingerprints as Record<string, unknown>)[field] = null;
      const current = { ...FP, [field]: null } as unknown as ReferenceFingerprints;
      expectControlMissing(evalTarget(ref, current), "CONTROL_REFERENCE_FINGERPRINT_MISSING");
    });
  }

  it("[RED] 핀 해시가 같아도 하네스 지문이 다르면 CONTROL_REFERENCE_HARNESS_MISMATCH이다", () => {
    const v = evalTarget(qualifiedRef(), fp({ harness_sha256: other("harness") }));
    expectControlMissing(v, "CONTROL_REFERENCE_HARNESS_MISMATCH");
  });

  it("[RED] 핀 해시가 같아도 대조 지문이 다르면 CONTROL_REFERENCE_CONTROL_MISMATCH이다", () => {
    const v = evalTarget(qualifiedRef(), fp({ control_sha256: other("control") }));
    expectControlMissing(v, "CONTROL_REFERENCE_CONTROL_MISMATCH");
  });

  for (const [field, value] of [
    ["tool_version", "9.9.9"],
    ["wheel_sha256", other("wheel")],
    ["rules_list_sha256", other("rules-list")],
    ["rules_expected_sha256", other("rules-expected")],
  ] as const) {
    it(`[RED] 핀 해시가 같아도 ${field}가 다르면 CONTROL_REFERENCE_TOOL_MISMATCH이다`, () => {
      const v = evalTarget(qualifiedRef(), fp({ [field]: value }));
      expectControlMissing(v, "CONTROL_REFERENCE_TOOL_MISMATCH");
    });
  }

  it("[RED] 구성 요소는 같고 binding_sha256만 다르면 CONTROL_REFERENCE_BINDING_MISMATCH이다(다른 불일치 사유는 없다)", () => {
    const v = evalTarget(qualifiedRef(), fp({ binding_sha256: other("binding") }));
    expectControlMissing(v, "CONTROL_REFERENCE_BINDING_MISMATCH");
    expect(reasonCodes(v)).not.toContain("CONTROL_REFERENCE_HARNESS_MISMATCH");
    expect(reasonCodes(v)).not.toContain("CONTROL_REFERENCE_CONTROL_MISMATCH");
    expect(reasonCodes(v)).not.toContain("CONTROL_REFERENCE_TOOL_MISMATCH");
  });

  it("[RED] 참조 자신의 결합이 자기 구성 요소로 만든 값이 아니면(현재 실행이 같은 위조 문자열이어도) CONTROL_REFERENCE_BINDING_MISMATCH이다", () => {
    const forged = other("forged-binding");
    const v = evalTarget(
      qualifiedRef(fp({ binding_sha256: forged })),
      fp({ binding_sha256: forged })
    );
    expectControlMissing(v, "CONTROL_REFERENCE_BINDING_MISMATCH");
  });

  it("[GUARD] 모든 지문이 채워지고 서로 같으면 이 검사들은 사유를 내지 않는다", () => {
    const v = evalTarget(qualifiedRef(), fp());
    expect(v.reasons).toEqual([]);
    expect(v.status).toBe("COMPLETE");
  });
});
