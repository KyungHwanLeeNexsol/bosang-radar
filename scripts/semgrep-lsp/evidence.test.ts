import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOT_EXECUTED,
  EVIDENCE_FILE_NAMES,
  EvidenceWriteError,
  buildRunRecord,
  canonicalJson,
  canonicalJsonLine,
  toJsonl,
  writeEvidence,
  type BuildRunRecordArgs,
  type EvidenceBundle,
} from "./evidence";
import { sha256Hex } from "./sha";
import {
  REASON_STATUS,
  STATUS_PRIORITY,
  type MeasurementStatus,
  type Reason,
  type ReasonCode,
} from "./status";
import { MemoryFs } from "./testing/memory-fs";
import type {
  CandidateGate,
  ControlAssertions,
  FsPort,
  Mode,
  ObservedFacts,
  Phase,
  Provenance,
  Totals,
  Verdict,
} from "./types";

// ── 손으로 만든 Verdict ─────────────────────────────────────────────────────

function totals(error: number, warning: number, information: number): Totals {
  return { error, warning, information, total: error + warning + information };
}

function observed(t: Totals | null): ObservedFacts {
  return {
    rules: {
      loadingPairsOk: [],
      fileErrorsReported: null,
      runningRulesN: null,
      skippedRulesS: null,
      skippingRuleLogs: [],
    },
    scan: {
      scannedFilesK: null,
      foundMatchesM: null,
      matchesDeduplicated: null,
      engineErrorsText: null,
      barrierSeen: false,
      preScanEchoSeen: false,
      postBarrierEchoSeen: false,
    },
    published: { diagnosticCount: null, uris: [], duplicates: [], missing: [], unexpected: [] },
    totals: t,
    perFile: {},
    perRule: {},
  };
}

function controlAssertions(
  applicable: boolean,
  status: ControlAssertions["status"]
): ControlAssertions {
  return { applicable, status, checks: [], negative_controls: [], design_errors: [] };
}

/** Verdict 안의 candidate_gate는 일부러 낙관적으로 채운다: 기록기가 그 값을 믿으면 시험이 깨진다. */
const OPTIMISTIC_GATE: CandidateGate = {
  applicable: true,
  policy_accepted: false,
  counts_as_lsp_security_warnings: false,
  threshold: "== 0",
  value: 0,
  subtotals: { error: 0, warning: 0, information: 0 },
  evaluation: "WOULD_PASS",
};

/** 그 상태를 가리키는 사유 하나(대표 상태가 그 상태가 되도록). */
function reasonFor(status: MeasurementStatus): Reason {
  const code = (Object.keys(REASON_STATUS) as ReasonCode[]).find(
    (c) => REASON_STATUS[c] === status
  );
  if (!code) throw new Error(`사유가 없는 상태: ${status}`);
  return { code };
}

function verdict(
  status: MeasurementStatus,
  t: Totals | null,
  opts: { reasons?: Reason[]; control?: ControlAssertions } = {}
): Verdict {
  const reasons: Reason[] =
    opts.reasons ?? (status === "COMPLETE" || status === "NOT_RUN" ? [] : [reasonFor(status)]);
  return {
    status,
    reasons,
    complete: status === "COMPLETE",
    observed: observed(t),
    control_assertions: opts.control ?? controlAssertions(false, "NOT_APPLICABLE"),
    candidate_gate: OPTIMISTIC_GATE,
  };
}

const INPUTS = {
  target_sha: "a".repeat(40),
  pin_sha256: "1".repeat(64),
  scope_sha256: "2".repeat(64),
  rules_list_sha256: "3".repeat(64),
  rules_expected_sha256: "4".repeat(64),
  control_tree_sha256: null,
  // 지문은 이 파일의 시험이 보는 대상이 아니다(reference.test·regression 시험이 본다): 확인하지 못한 값으로 둔다.
  harness_sha256: null,
  control_sha256: null,
  tool_version_observed: null,
  wheel_sha256_observed: null,
  binding_sha256: null,
};

const CONTROL_REFERENCE = {
  run_id: "ctl-1",
  provenance: "real" as Provenance,
  status: "COMPLETE" as MeasurementStatus,
  control_assertions_status: "PASS" as const,
  pin_sha256: "1".repeat(64),
  n0_confirmed: true,
  eligible: false,
  fingerprints: {
    harness_sha256: null,
    control_sha256: null,
    rules_list_sha256: "3".repeat(64),
    rules_expected_sha256: "4".repeat(64),
    tool_version: null,
    wheel_sha256: null,
    binding_sha256: null,
  },
  negative_controls: [],
};

function args(
  mode: Mode,
  provenance: Provenance,
  v: Verdict,
  patch: Partial<BuildRunRecordArgs> = {}
): BuildRunRecordArgs {
  return {
    runId: "run-1",
    mode,
    provenance,
    verdict: v,
    inputs: mode === "target" ? INPUTS : { ...INPUTS, target_sha: null, scope_sha256: null },
    phasesReached: ["PH0", "PH1"] as Phase[],
    controlReference: mode === "target" ? CONTROL_REFERENCE : null,
    n0Confirmed: true,
    ...patch,
  };
}

function targetVerdict(status: MeasurementStatus, t: Totals | null): Verdict {
  return verdict(status, t, { control: controlAssertions(false, "NOT_APPLICABLE") });
}

// ── canonicalJson ──────────────────────────────────────────────────────────

describe("canonicalJson", () => {
  it("키를 정렬하고 2칸 들여쓰기·LF·끝 줄바꿈으로 쓴다", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: "x" } })).toBe(
      '{\n  "a": {\n    "c": "x",\n    "d": [\n      1,\n      2\n    ]\n  },\n  "b": 1\n}\n'
    );
  });

  it("키 삽입 순서와 무관하게 같은 바이트를 낸다(정수꼴 키 포함)", () => {
    const a = { "10": 1, "2": 2, b: 3, a: 4 };
    const b = { a: 4, b: 3, "2": 2, "10": 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    // 문자열 바이트순: "10" < "2" < "a" < "b"
    expect(Object.keys(JSON.parse(canonicalJson(a)))).not.toEqual([]);
    expect(canonicalJson(a).indexOf('"10"')).toBeLessThan(canonicalJson(a).indexOf('"2"'));
  });

  it("빈 배열·빈 객체·null·불리언·유니코드를 그대로 쓴다", () => {
    expect(canonicalJson({ a: [], b: {}, c: null, d: true, e: "한글\n" })).toBe(
      '{\n  "a": [],\n  "b": {},\n  "c": null,\n  "d": true,\n  "e": "한글\\n"\n}\n'
    );
  });

  it("CR 문자가 출력에 없다", () => {
    expect(canonicalJson({ a: ["x\r\ny"] })).not.toContain("\r");
  });

  it("정의되지 않은 값·NaN·Infinity·함수·심볼·bigint는 던진다(fail-closed)", () => {
    expect(() => canonicalJson(undefined)).toThrow();
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson([1, undefined])).toThrow();
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: Infinity })).toThrow();
    expect(() => canonicalJson({ a: -Infinity })).toThrow();
    expect(() => canonicalJson({ a: () => 1 })).toThrow();
    expect(() => canonicalJson({ a: Symbol("x") })).toThrow();
    expect(() => canonicalJson({ a: BigInt(1) })).toThrow();
  });

  it("평범한 객체가 아닌 값(Date·Map·클래스)과 순환은 던진다", () => {
    expect(() => canonicalJson({ a: new Date(0) })).toThrow();
    expect(() => canonicalJson({ a: new Map() })).toThrow();
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(() => canonicalJson(cyc)).toThrow();
  });

  it("canonicalJsonLine은 한 줄(들여쓰기 없음)이고 키가 정렬된다", () => {
    expect(canonicalJsonLine({ b: [1, { z: 1, y: 2 }], a: 1 })).toBe(
      '{"a":1,"b":[1,{"y":2,"z":1}]}'
    );
    expect(toJsonl([{ b: 1, a: 2 }, { c: 3 }])).toBe('{"a":2,"b":1}\n{"c":3}\n');
    expect(toJsonl([])).toBe("");
  });
});

// ── buildRunRecord ─────────────────────────────────────────────────────────

describe("buildRunRecord: 필드 분리 (ADR D5)", () => {
  it("스키마·trust·분리된 필드를 모두 가진다", () => {
    const record = buildRunRecord(
      args("target", "real", targetVerdict("COMPLETE", totals(0, 0, 0)))
    );
    expect(record.schema).toBe("semgrep-lsp-run/1");
    expect(record.run_id).toBe("run-1");
    expect(record.trust).toBe("REAL_UNREVIEWED");
    expect(Object.keys(record).sort()).toEqual(
      [
        "candidate_gate",
        "control_assertions",
        "control_reference",
        "existing_gates",
        "inputs",
        "measurement",
        "mode",
        "not_executed",
        "observed",
        "provenance",
        "reference_qualification",
        "run_id",
        "schema",
        "trust",
      ].sort()
    );
    expect(record.measurement).toEqual({
      status: "COMPLETE",
      complete: true,
      reasons: [],
      phases_reached: ["PH0", "PH1"],
    });
  });

  it("자원 요약(resources)은 준 경우에만 레코드에 있고, 깊은 복사본이다", () => {
    const base = args("target", "real", targetVerdict("COMPLETE", totals(0, 0, 0)));
    expect("resources" in buildRunRecord(base)).toBe(false); // 주지 않으면 필드 자체가 없다
    const resources = {
      run_lock: {
        scope: "server-tree" as const,
        tree_key_sha256: "a".repeat(64),
        state: "ACQUIRED" as const,
        reason: null,
        evidence_marker: "CREATED" as const,
      },
      metrics_receiver: {
        bind: "127.0.0.1" as const,
        state: "LISTENING" as const,
        failure: null,
        hits: 0,
        connections: 0,
        requests: 0,
        client_errors: 0,
      },
    };
    const record = buildRunRecord({ ...base, resources });
    expect(record.resources).toEqual(resources);
    resources.metrics_receiver.hits = 5; // 나중에 입력을 바꿔도 레코드는 그대로다
    expect(record.resources?.metrics_receiver?.hits).toBe(0);
    expect(Object.keys(record)).toContain("resources");
  });

  it("existing_gates는 항상 고정이다", () => {
    for (const provenance of ["real", "stub"] as const) {
      const record = buildRunRecord(
        args("target", provenance, targetVerdict("COMPLETE", totals(1, 0, 0)))
      );
      expect(record.existing_gates).toEqual({
        builtin_collector: { status: "UNVERIFIED", changed: false },
        official_gate: { effect: "NONE", changed: false },
      });
    }
  });

  it("사유는 정렬해서 담는다(입력 순서와 무관한 바이트)", () => {
    const r1: Reason[] = [{ code: "NO_BARRIER" }, { code: "RULES_FILE_ADDED", detail: "x" }];
    const r2: Reason[] = [{ code: "RULES_FILE_ADDED", detail: "x" }, { code: "NO_BARRIER" }];
    const a = buildRunRecord(
      args("target", "real", verdict("MANIFEST_MISMATCH", null, { reasons: r1 }))
    );
    const b = buildRunRecord(
      args("target", "real", verdict("MANIFEST_MISMATCH", null, { reasons: r2 }))
    );
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(a.measurement.reasons.map((r) => r.code)).toEqual(["RULES_FILE_ADDED", "NO_BARRIER"]);
  });
});

describe("buildRunRecord: candidate_gate", () => {
  it("스텁은 SYNTHETIC이고 평가는 항상 UNVERIFIED다(target·COMPLETE·0건이어도)", () => {
    const record = buildRunRecord(
      args("target", "stub", targetVerdict("COMPLETE", totals(0, 0, 0)))
    );
    expect(record.trust).toBe("SYNTHETIC");
    expect(record.candidate_gate.evaluation).toBe("UNVERIFIED");
    expect(record.candidate_gate.value).toBe(0); // 값 자체는 계산하지만 평가는 UNVERIFIED
    expect(record.candidate_gate.applicable).toBe(true);
  });

  it("스텁은 control 모드에서도 UNVERIFIED다", () => {
    const record = buildRunRecord(
      args(
        "control",
        "stub",
        verdict("COMPLETE", totals(3, 0, 0), { control: controlAssertions(true, "PASS") })
      )
    );
    expect(record.candidate_gate.evaluation).toBe("UNVERIFIED");
    expect(record.candidate_gate.value).toBeNull();
    expect(record.candidate_gate.applicable).toBe(false);
  });

  it("실제 target·COMPLETE·0건이면 WOULD_PASS지만 정책 수락과 인정 플래그는 리터럴 false", () => {
    const record = buildRunRecord(
      args("target", "real", targetVerdict("COMPLETE", totals(0, 0, 0)))
    );
    expect(record.candidate_gate).toEqual({
      applicable: true,
      policy_accepted: false,
      counts_as_lsp_security_warnings: false,
      threshold: "== 0",
      value: 0,
      subtotals: { error: 0, warning: 0, information: 0 },
      evaluation: "WOULD_PASS",
    });
  });

  it("실제 target·COMPLETE·양수면 WOULD_FAIL이고 소계를 담는다", () => {
    const record = buildRunRecord(
      args("target", "real", targetVerdict("COMPLETE", totals(1, 2, 3)))
    );
    expect(record.candidate_gate.evaluation).toBe("WOULD_FAIL");
    expect(record.candidate_gate.value).toBe(6);
    expect(record.candidate_gate.subtotals).toEqual({ error: 1, warning: 2, information: 3 });
  });

  it("실제 target인데 COMPLETE가 아니면 value·소계는 null이고 평가는 UNVERIFIED(0이 아니다)", () => {
    const record = buildRunRecord(
      args("target", "real", targetVerdict("TIMEOUT", totals(0, 0, 0)))
    );
    expect(record.candidate_gate.value).toBeNull();
    expect(record.candidate_gate.subtotals).toBeNull();
    expect(record.candidate_gate.evaluation).toBe("UNVERIFIED");
    expect(record.candidate_gate.applicable).toBe(true);
  });

  it("실제 control·COMPLETE는 진단 합계가 양수여도 value null, 적용 안 됨, control_assertions는 그대로 PASS", () => {
    const record = buildRunRecord(
      args(
        "control",
        "real",
        verdict("COMPLETE", totals(4, 7, 1), { control: controlAssertions(true, "PASS") })
      )
    );
    expect(record.candidate_gate.applicable).toBe(false);
    expect(record.candidate_gate.value).toBeNull();
    expect(record.candidate_gate.subtotals).toBeNull();
    expect(record.candidate_gate.evaluation).toBe("NOT_APPLICABLE");
    expect(record.control_assertions.status).toBe("PASS");
    expect(record.observed.totals).toEqual({ error: 4, warning: 7, information: 1, total: 12 });
    expect(record.control_reference).toBeNull();
  });

  it("어떤 조합에서도 WOULD_PASS는 real·target·COMPLETE·0건에서만 나온다", () => {
    const statuses: MeasurementStatus[] = [...STATUS_PRIORITY, "COMPLETE", "NOT_RUN"];
    const outcomes: string[] = [];
    for (const provenance of ["real", "stub"] as const) {
      for (const mode of ["target", "control"] as const) {
        for (const status of statuses) {
          for (const t of [null, totals(0, 0, 0), totals(0, 0, 2)]) {
            const control =
              mode === "control"
                ? controlAssertions(true, "PASS")
                : controlAssertions(false, "NOT_APPLICABLE");
            // COMPLETE인데 합계가 없는 조합만 던진다(별도 시험). 나머지는 모두 기록된다.
            if (status === "COMPLETE" && t === null) continue;
            const record = buildRunRecord(args(mode, provenance, verdict(status, t, { control })));
            if (record.candidate_gate.evaluation === "WOULD_PASS") {
              outcomes.push(`${provenance}/${mode}/${status}/${t?.total}`);
            }
            expect(record.candidate_gate.policy_accepted).toBe(false);
            expect(record.candidate_gate.counts_as_lsp_security_warnings).toBe(false);
          }
        }
      }
    }
    expect(outcomes).toEqual(["real/target/COMPLETE/0"]);
  });

  it("Verdict에 들어 있는 candidate_gate는 믿지 않고 다시 계산한다", () => {
    const record = buildRunRecord(
      args("target", "real", targetVerdict("TARGET_MISMATCH", totals(0, 0, 0)))
    );
    expect(record.candidate_gate.evaluation).not.toBe("WOULD_PASS");
    expect(record.candidate_gate.value).toBeNull();
  });

  it("COMPLETE인데 합계가 없으면(totals null) 값을 만들지 않고 던진다", () => {
    expect(() => buildRunRecord(args("target", "real", targetVerdict("COMPLETE", null)))).toThrow();
  });
});

describe("buildRunRecord: 모순된 입력은 던진다", () => {
  it("대표 상태가 사유와 다르거나 NOT_RUN에 사유가 있다", () => {
    expect(() =>
      buildRunRecord(
        args("target", "real", {
          ...targetVerdict("TIMEOUT", null),
          reasons: [{ code: "RULES_FILE_ADDED" }],
        })
      )
    ).toThrow();
    expect(() =>
      buildRunRecord(
        args("target", "real", {
          ...targetVerdict("NOT_RUN", null),
          reasons: [{ code: "NO_BARRIER" }],
        })
      )
    ).toThrow();
  });

  it("COMPLETE인데 사유가 있다 / 사유 없이 실패 상태 / complete 플래그 불일치", () => {
    expect(() =>
      buildRunRecord(
        args("target", "real", {
          ...targetVerdict("COMPLETE", totals(0, 0, 0)),
          reasons: [{ code: "NO_BARRIER" }],
        })
      )
    ).toThrow();
    expect(() =>
      buildRunRecord(args("target", "real", { ...targetVerdict("TIMEOUT", null), reasons: [] }))
    ).toThrow();
    expect(() =>
      buildRunRecord(
        args("target", "real", { ...targetVerdict("COMPLETE", totals(0, 0, 0)), complete: false })
      )
    ).toThrow();
    expect(() =>
      buildRunRecord(args("target", "real", { ...targetVerdict("TIMEOUT", null), complete: true }))
    ).toThrow();
  });

  it("합계가 소계의 합과 다르다", () => {
    const bad: Totals = { error: 1, warning: 0, information: 0, total: 0 };
    expect(() => buildRunRecord(args("target", "real", targetVerdict("COMPLETE", bad)))).toThrow();
  });

  it("control 모드에 대조 참조가 있다 / target 모드의 control_assertions가 적용 대상이다", () => {
    expect(() =>
      buildRunRecord(
        args(
          "control",
          "real",
          verdict("COMPLETE", totals(1, 0, 0), { control: controlAssertions(true, "PASS") }),
          {
            controlReference: CONTROL_REFERENCE,
          }
        )
      )
    ).toThrow();
    expect(() =>
      buildRunRecord(
        args(
          "target",
          "real",
          verdict("COMPLETE", totals(0, 0, 0), { control: controlAssertions(true, "PASS") })
        )
      )
    ).toThrow();
    expect(() =>
      buildRunRecord(
        args(
          "control",
          "real",
          verdict("COMPLETE", totals(0, 0, 0), {
            control: controlAssertions(false, "NOT_APPLICABLE"),
          })
        )
      )
    ).toThrow();
  });
});

describe("buildRunRecord: not_executed", () => {
  it("기본 집합은 필수 키를 모두 담고 값이 null·NOT_RUN·UNVERIFIED뿐이다", () => {
    const required = [
      "semgrep_version",
      "wheel_sha256",
      "rule_count_n",
      "rules_skipped_s",
      "positive_detection",
      "log_format",
      "windows_uri_form",
      "debug_echo_behavior",
      "exit_code_after_exit",
      "metrics_receiver_observation",
      "negative_controls_engine",
      "reproducibility",
    ];
    const record = buildRunRecord(
      args("target", "stub", targetVerdict("COMPLETE", totals(0, 0, 0)))
    );
    for (const key of required) expect(Object.keys(record.not_executed)).toContain(key);
    for (const value of Object.values(record.not_executed)) {
      expect([null, "NOT_RUN", "UNVERIFIED"]).toContain(value);
    }
    expect(record.not_executed).toEqual(DEFAULT_NOT_EXECUTED);
  });

  it("스텁 결과로 채우려 하면(허용 밖 값) 던진다", () => {
    const make = (extra: Record<string, unknown>) =>
      buildRunRecord(
        args("target", "stub", targetVerdict("COMPLETE", totals(0, 0, 0)), {
          notExecuted: extra as BuildRunRecordArgs["notExecuted"],
        })
      );
    expect(() => make({ rule_count_n: 214 })).toThrow();
    expect(() => make({ log_format: "PASS" })).toThrow();
    expect(() => make({ semgrep_version: "1.180.0" })).toThrow();
    expect(() => make({ reproducibility: undefined })).toThrow();
  });

  it("허용 값으로 덮어쓰거나 키를 더할 수 있지만 기본 키는 없앨 수 없다", () => {
    const record = buildRunRecord(
      args("target", "real", targetVerdict("COMPLETE", totals(0, 0, 0)), {
        notExecuted: { extra_check: "NOT_RUN", log_format: "UNVERIFIED" },
      })
    );
    expect(record.not_executed.extra_check).toBe("NOT_RUN");
    expect(Object.keys(record.not_executed)).toContain("reproducibility");
  });

  it("기본 집합 객체를 호출자가 바꿔도 다음 기록에 영향이 없다", () => {
    const record = buildRunRecord(
      args("target", "stub", targetVerdict("COMPLETE", totals(0, 0, 0)))
    );
    (record.not_executed as Record<string, unknown>).log_format = "PASS";
    const again = buildRunRecord(
      args("target", "stub", targetVerdict("COMPLETE", totals(0, 0, 0)))
    );
    expect(again.not_executed.log_format).toBe("UNVERIFIED");
  });
});

describe("buildRunRecord: 바이트 안정성", () => {
  it("같은 입력이면 직렬화 결과가 바이트 단위로 같다", () => {
    const make = () =>
      canonicalJson(
        buildRunRecord(args("target", "real", targetVerdict("COMPLETE", totals(1, 2, 3))))
      );
    expect(make()).toBe(make());
    expect(sha256Hex(make())).toBe(sha256Hex(make()));
  });

  it("직렬화한 최상위 키는 정렬되어 있다", () => {
    const text = canonicalJson(
      buildRunRecord(args("target", "real", targetVerdict("COMPLETE", totals(0, 0, 0))))
    );
    const keys = Object.keys(JSON.parse(text) as object);
    expect(keys).toEqual([...keys].sort());
    expect(text.endsWith("}\n")).toBe(true);
  });
});

// ── writeEvidence ──────────────────────────────────────────────────────────

function bundle(): EvidenceBundle {
  const run = buildRunRecord(args("target", "stub", targetVerdict("COMPLETE", totals(0, 0, 0))));
  return {
    run,
    diagnosticsJsonl: toJsonl([{ uri: "file:///x", diagnostics: [] }]),
    transcriptJsonl: toJsonl([{ seq: 0, kind: "spawn" }]),
    stderrLog: "Refreshing rules\n",
    filesExpected: ["src/b.ts", "src/a.ts"],
    filesPublished: ["src/a.ts", "src/b.ts"],
    filesMissing: [],
    scopeTsv: "src/a.ts\tabc\tinclude\t\n",
    fingerprintsTxt: "harness_sha256\t(확인하지 못함)\n",
  };
}

const DIR = "/ev/.moai/state/verify/semgrep-lsp/run-1";

describe("writeEvidence", () => {
  it("D10 파일 집합을 쓰고 각 파일의 sha256과 run.json의 sha256을 돌려준다", async () => {
    const fs = new MemoryFs();
    const b = bundle();
    const result = await writeEvidence(fs, DIR, b);
    expect(result.files.map((f) => f.name)).toEqual([...EVIDENCE_FILE_NAMES]);
    expect([...EVIDENCE_FILE_NAMES].sort()).toEqual(
      [
        "diagnostics.jsonl",
        "files.expected.txt",
        "files.missing.txt",
        "files.published.txt",
        "fingerprints.txt",
        "lsp-transcript.jsonl",
        "run.json",
        "scope.tsv",
        "stderr.log",
      ].sort()
    );
    for (const f of result.files) {
      const bytes = await fs.readFile(`${DIR}/${f.name}`);
      expect(sha256Hex(bytes)).toBe(f.sha256);
    }
    expect(new TextDecoder().decode(await fs.readFile(`${DIR}/run.json`))).toBe(
      canonicalJson(b.run)
    );
    expect(result.runJsonSha256).toBe(sha256Hex(canonicalJson(b.run)));
    expect(result.files.find((f) => f.name === "run.json")?.sha256).toBe(result.runJsonSha256);
  });

  it("files.* 목록은 바이트순으로 정렬해 줄 단위로 쓴다(빈 목록은 빈 파일)", async () => {
    const fs = new MemoryFs();
    await writeEvidence(fs, DIR, bundle());
    const text = async (name: string) =>
      new TextDecoder().decode(await fs.readFile(`${DIR}/${name}`));
    expect(await text("files.expected.txt")).toBe("src/a.ts\nsrc/b.ts\n");
    expect(await text("files.missing.txt")).toBe("");
  });

  it("같은 입력을 두 곳에 쓰면 바이트가 같다", async () => {
    const fs1 = new MemoryFs();
    const fs2 = new MemoryFs();
    const r1 = await writeEvidence(fs1, DIR, bundle());
    const r2 = await writeEvidence(fs2, DIR, bundle());
    expect(r1).toEqual(r2);
  });

  it("이미 있는 증거는 덮어쓰지 않는다: 두 번째 호출은 거부하고 기존 바이트가 그대로다", async () => {
    const fs = new MemoryFs();
    const first = await writeEvidence(fs, DIR, bundle());
    const changed = { ...bundle(), stderrLog: "different\n" };
    await expect(writeEvidence(fs, DIR, changed)).rejects.toThrow(EvidenceWriteError);
    const stderr = await fs.readFile(`${DIR}/stderr.log`);
    expect(sha256Hex(stderr)).toBe(first.files.find((f) => f.name === "stderr.log")?.sha256);
  });

  it("폴더에 이미 한 파일만 있어도 아무것도 쓰기 전에 거부한다", async () => {
    const fs = new MemoryFs({ [`${DIR}/scope.tsv`]: "old\n" });
    let error: unknown;
    try {
      await writeEvidence(fs, DIR, bundle());
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EvidenceWriteError);
    expect((error as EvidenceWriteError).written).toEqual([]);
    expect(await fs.listFilesRecursive(DIR)).toEqual(["scope.tsv"]);
  });

  it("중간에 쓰기가 실패하면 어떤 파일을 썼는지 알리고 run.json은 쓰지 않는다", async () => {
    const inner = new MemoryFs();
    let writes = 0;
    const flaky: FsPort = {
      readFile: (p) => inner.readFile(p),
      mkdirp: (p) => inner.mkdirp(p),
      listFilesRecursive: (p) => inner.listFilesRecursive(p),
      exists: (p) => inner.exists(p),
      writeFileExclusive: async (p, d) => {
        writes++;
        if (writes === 4) throw new Error("EIO: disk");
        await inner.writeFileExclusive(p, d);
      },
    };
    let error: unknown;
    try {
      await writeEvidence(flaky, DIR, bundle());
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EvidenceWriteError);
    const err = error as EvidenceWriteError;
    expect(err.written).toHaveLength(3);
    expect(err.failed).toBe(EVIDENCE_FILE_NAMES[3]);
    expect(await inner.exists(`${DIR}/run.json`)).toBe(false);
    expect(err.message).toContain(EVIDENCE_FILE_NAMES[3]);
  });

  it("run.json은 마지막에 쓴다(있으면 나머지도 있다)", async () => {
    expect(EVIDENCE_FILE_NAMES[EVIDENCE_FILE_NAMES.length - 1]).toBe("run.json");
  });

  it("호출자가 준 기밀 값이 어느 파일에든 있으면 아무것도 쓰기 전에 거부하고 메시지에도 값을 넣지 않는다", async () => {
    const fs = new MemoryFs();
    const leaky = { ...bundle(), stderrLog: "token=sgp_SECRET-123 leaked\n" };
    let error: unknown;
    try {
      await writeEvidence(fs, DIR, leaky, { secrets: ["sgp_SECRET-123", ""] });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EvidenceWriteError);
    expect((error as Error).message).not.toContain("sgp_SECRET-123");
    expect(await fs.listFilesRecursive(DIR)).toEqual([]);
  });

  it("기밀 값이 run.json 안에 들어 있어도 잡는다", async () => {
    const fs = new MemoryFs();
    const b = bundle();
    const run = { ...b.run, run_id: "run-with-TOPSECRET" };
    await expect(writeEvidence(fs, DIR, { ...b, run }, { secrets: ["TOPSECRET"] })).rejects.toThrow(
      EvidenceWriteError
    );
  });

  it("빈 문자열만 있는 secrets는 아무것도 막지 않는다", async () => {
    const fs = new MemoryFs();
    await writeEvidence(fs, DIR, bundle(), { secrets: [""] });
    expect(await fs.exists(`${DIR}/run.json`)).toBe(true);
  });

  it("끝에 구분자가 있는 폴더 경로도 같은 위치에 쓴다", async () => {
    const fs = new MemoryFs();
    await writeEvidence(fs, `${DIR}/`, bundle());
    expect(await fs.exists(`${DIR}/run.json`)).toBe(true);
  });
});
