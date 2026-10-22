import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REASON_EMITTERS, evaluateTranscript } from "./evaluate";
import { normalizeLoadingPath } from "./log-matcher";
import { REASON_STATUS, sortReasons, type ReasonCode } from "./status";
import {
  CONTROL_EXPECTATIONS,
  CONTROL_REFERENCE_PASS,
  EXPECTED_RULES,
  PIN,
  PIN_SHA256,
  RULES_FILES,
  TARGET_PATHS,
  assertConsistent,
  buildRecord,
  codesOf,
  controlInputs,
  happyControl,
  happyTarget,
  scopeOf,
  targetInputs,
} from "./testing/evaluate-fixtures";
import { ALL_SCENARIOS } from "./testing/evaluate-scenarios";
import {
  IDS,
  after,
  appendKill,
  dropEvents,
  duplicateStderrLine,
  mapEvents,
  moveAcrossStreams,
  pipe,
  publishMessage,
  sendIs,
  setMeta,
  setStderrPartial,
  stderrIs,
} from "./testing/transcript-builder";
import type { Transcript, TranscriptEvent } from "./types";

function source(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
}

describe("REASON_EMITTERS", () => {
  it("키 집합이 REASON_STATUS와 정확히 같다(분류 없이는 사유를 추가할 수 없다)", () => {
    expect(Object.keys(REASON_EMITTERS).sort()).toEqual(Object.keys(REASON_STATUS).sort());
  });

  it("값은 precheck · settings · evaluate · session 중 하나다", () => {
    for (const [code, emitter] of Object.entries(REASON_EMITTERS)) {
      expect(["precheck", "settings", "evaluate", "session"], code).toContain(emitter);
    }
  });

  it("분류가 소스와 맞다: precheck·settings 코드는 해당 모듈에, evaluate 코드는 evaluate.ts·aggregate.ts에 있다", () => {
    const precheckSources = [
      source("precheck.ts"),
      source("scope.ts"),
      source("rules-manifest.ts"),
    ].join("\n");
    const settingsSource = source("settings.ts");
    const evaluateUsage = `${source("evaluate.ts").split("export const REASON_EMITTERS")[0]}${
      source("evaluate.ts").split("} as const satisfies Record<ReasonCode, ReasonEmitter>;")[1]
    }${source("aggregate.ts")}${source("reference.ts")}`; // reference.ts: C8 사실 확인(checkControlReferenceFacts)의 사유
    const wrong: string[] = [];
    for (const [code, emitter] of Object.entries(REASON_EMITTERS)) {
      const quoted = `"${code}"`;
      if (emitter === "precheck" && !precheckSources.includes(quoted))
        wrong.push(`${code}: precheck에 없음`);
      if (emitter === "settings" && !settingsSource.includes(quoted))
        wrong.push(`${code}: settings에 없음`);
      if (emitter === "evaluate" && !evaluateUsage.includes(quoted))
        wrong.push(`${code}: evaluate에 없음`);
      if (emitter === "evaluate" && (precheckSources + settingsSource).includes(quoted)) {
        wrong.push(`${code}: evaluate로 분류했지만 사전 검사 모듈이 만든다`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("evaluate로 분류한 모든 코드가 시나리오 표의 어느 시나리오에서든 실제로 만들어진다", () => {
    const seen = new Set<ReasonCode>();
    for (const scenario of ALL_SCENARIOS) {
      const built = scenario.build();
      for (const code of codesOf(evaluateTranscript(built.transcript, built.inputs)))
        seen.add(code);
    }
    const expected = (Object.keys(REASON_EMITTERS) as ReasonCode[]).filter(
      (c) => REASON_EMITTERS[c] === "evaluate"
    );
    const missing = expected.filter((c) => !seen.has(c));
    expect(missing).toEqual([]);
    // 반대로, evaluate가 precheck·settings 분류의 코드를 스스로 만들지 않는다(precheck 사유는 입력으로 들어온 것뿐).
    const own = [...seen].filter((c) => REASON_EMITTERS[c] !== "evaluate");
    expect(own.sort()).toEqual(["RULES_FILE_ADDED", "SETTINGS_KEY_NOT_ALLOWED"]);
  });

  it("session으로 분류한 코드는 지금 없다(모든 사건이 트랜스크립트로 기록된다)", () => {
    expect((Object.values(REASON_EMITTERS) as string[]).filter((e) => e === "session")).toEqual([]);
  });
});

describe("대표 상태와 정렬", () => {
  it("reasons는 sortReasons의 결과와 같고, 대표 상태는 가장 앞선 사유의 상태다", () => {
    for (const scenario of ALL_SCENARIOS) {
      const built = scenario.build();
      const v = evaluateTranscript(built.transcript, built.inputs);
      expect(v.reasons, scenario.id).toEqual(sortReasons(v.reasons));
    }
  });

  it("COMPLETE는 사유가 없을 때뿐이다", () => {
    for (const scenario of ALL_SCENARIOS) {
      const built = scenario.build();
      const v = evaluateTranscript(built.transcript, built.inputs);
      expect(v.status === "COMPLETE", scenario.id).toBe(v.reasons.length === 0);
    }
  });
});

describe("target 모드: 후보 평가와 스텁의 한계", () => {
  const inputs = targetInputs();

  it("스텁 트랜스크립트는 어떤 시나리오에서도 WOULD_PASS가 되지 않는다", () => {
    for (const scenario of ALL_SCENARIOS) {
      const built = scenario.build();
      expect(built.transcript.meta.provenance, scenario.id).toBe("stub");
      const v = evaluateTranscript(built.transcript, built.inputs);
      expect(v.candidate_gate.evaluation, scenario.id).not.toBe("WOULD_PASS");
      expect(v.candidate_gate.evaluation, scenario.id).not.toBe("WOULD_FAIL");
      const record = buildRecord(v, built.transcript, built.inputs);
      expect(record.trust, scenario.id).toBe("SYNTHETIC");
      expect(record.candidate_gate.policy_accepted).toBe(false);
      expect(record.candidate_gate.counts_as_lsp_security_warnings).toBe(false);
    }
  });

  it("스텁·진단 0건·유효 참조: COMPLETE, value 0, 평가는 UNVERIFIED (buildRunRecord도 같다)", () => {
    const t = happyTarget();
    const v = evaluateTranscript(t, inputs);
    expect(v.status).toBe("COMPLETE");
    expect(v.candidate_gate).toMatchObject({
      applicable: true,
      value: 0,
      evaluation: "UNVERIFIED",
      policy_accepted: false,
      counts_as_lsp_security_warnings: false,
    });
    const record = buildRecord(v, t, inputs);
    expect(record.candidate_gate.value).toBe(0);
    expect(record.candidate_gate.evaluation).toBe("UNVERIFIED");
    expect(record.control_assertions.status).toBe("NOT_APPLICABLE");
  });

  // 아래 두 시험은 provenance "real"을 *평가기의 분기 논리*를 보려고 붙인 것이다. 트랜스크립트는 여전히 합성이며
  // 이 시험이 실제 Semgrep 실행이나 탐지의 증거가 되지는 않는다.
  it("(논리 시험) provenance real·진단 0건·COMPLETE → WOULD_PASS", () => {
    const t = setMeta({ provenance: "real" })(happyTarget());
    const v = evaluateTranscript(t, inputs);
    expect(v.candidate_gate.evaluation).toBe("WOULD_PASS");
    expect(v.candidate_gate.value).toBe(0);
    expect(buildRecord(v, t, inputs).candidate_gate.evaluation).toBe("WOULD_PASS");
    expect(buildRecord(v, t, inputs).trust).toBe("REAL_UNREVIEWED");
  });

  it("(논리 시험) provenance real·진단 있음·COMPLETE → WOULD_FAIL, 합계와 소계", () => {
    const t = setMeta({ provenance: "real" })(
      happyTarget({
        diagnostics: {
          [TARGET_PATHS[0]]: [
            { severity: 1, code: EXPECTED_RULES[0].finalId, message: "m" },
            { severity: 3, code: EXPECTED_RULES[1].finalId, message: "m" },
          ],
        },
        m: 2,
      })
    );
    const v = evaluateTranscript(t, inputs);
    expect(v.status).toBe("COMPLETE");
    expect(v.candidate_gate).toMatchObject({
      value: 2,
      subtotals: { error: 1, warning: 0, information: 1 },
      evaluation: "WOULD_FAIL",
    });
    expect(buildRecord(v, t, inputs).candidate_gate.evaluation).toBe("WOULD_FAIL");
  });

  it("(논리 시험) real이라도 COMPLETE가 아니면 value는 null이고 평가는 UNVERIFIED", () => {
    const t = pipe(
      setMeta({ provenance: "real" })(happyTarget()),
      dropEvents(stderrIs("Scanning workspace complete"))
    );
    const v = evaluateTranscript(t, inputs);
    expect(v.status).not.toBe("COMPLETE");
    expect(v.candidate_gate).toMatchObject({
      value: null,
      subtotals: null,
      evaluation: "UNVERIFIED",
    });
  });

  it("알 수 없는 provenance는 stub으로 읽는다(real이 아니면 WOULD_*가 나오지 않는다)", () => {
    const t = happyTarget();
    const odd = { ...t, meta: { ...t.meta, provenance: "unknown" as unknown as "real" } };
    expect(evaluateTranscript(odd, inputs).candidate_gate.evaluation).toBe("UNVERIFIED");
  });
});

describe("control 모드: 단언과 후보 평가의 분리", () => {
  it("취약 예제를 탐지한 control 실행: 단언 PASS, 합계 양수, candidate_gate 해당 없음", () => {
    const t = happyControl();
    const inputs = controlInputs();
    const v = evaluateTranscript(t, inputs);
    expect(v.status).toBe("COMPLETE");
    expect(v.control_assertions.applicable).toBe(true);
    expect(v.control_assertions.status).toBe("PASS");
    expect(v.observed.totals?.total).toBeGreaterThan(0);
    expect(v.candidate_gate).toMatchObject({ applicable: false, value: null, subtotals: null });
    expect(v.candidate_gate.policy_accepted).toBe(false);

    // buildRunRecord까지 끝에서 끝으로: 합계가 양수여도 value는 null이다(스텁은 UNVERIFIED).
    const record = buildRecord(v, t, inputs);
    expect(record.observed.totals?.total).toBeGreaterThan(0);
    expect(record.candidate_gate.applicable).toBe(false);
    expect(record.candidate_gate.value).toBeNull();
    expect(record.candidate_gate.evaluation).toBe("UNVERIFIED");
    expect(record.control_reference).toBeNull();
  });

  it("control + real: 평가는 NOT_APPLICABLE이고 value는 여전히 null", () => {
    const t = setMeta({ provenance: "real" })(happyControl());
    const inputs = controlInputs();
    const v = evaluateTranscript(t, inputs);
    expect(v.candidate_gate).toMatchObject({
      applicable: false,
      value: null,
      evaluation: "NOT_APPLICABLE",
    });
    expect(buildRecord(v, t, inputs).candidate_gate.evaluation).toBe("NOT_APPLICABLE");
  });

  it("control에서 C8·대조 참조는 요구하지 않고 입력의 참조는 무시한다", () => {
    const inputs = controlInputs({ controlReference: CONTROL_REFERENCE_PASS });
    expect(evaluateTranscript(happyControl(), inputs).status).toBe("COMPLETE");
  });

  it("사례별 결과: 필수 ID가 빠지면 측정은 COMPLETE여도 control_assertions는 FAIL이다", () => {
    const scenario = ALL_SCENARIOS.find((s) => s.id === "R-control-missing-detect");
    if (!scenario) throw new Error("scenario missing");
    const built = scenario.build();
    const v = evaluateTranscript(built.transcript, built.inputs);
    expect(v.status).toBe("COMPLETE");
    expect(v.control_assertions.status).toBe("FAIL");
    expect(v.control_assertions.checks.some((c) => c.kind === "A1" && c.status === "FAIL")).toBe(
      true
    );
  });

  it("정상 파일에 진단이 나오면 A3 실패와 설계 오류로 기록된다", () => {
    const normal = CONTROL_EXPECTATIONS.cases.find((c) => c.kind === "normal");
    if (!normal) throw new Error("no normal case");
    const t = happyControl({
      diagnostics: {
        ...Object.fromEntries(
          CONTROL_EXPECTATIONS.cases.map((c) => [
            c.path,
            c.required.map((code) => ({ severity: 2, code, message: "m" })),
          ])
        ),
        [normal.path]: [{ severity: 2, code: EXPECTED_RULES[0].finalId, message: "m" }],
      },
      m: 99,
    });
    const v = evaluateTranscript(t, controlInputs());
    expect(v.control_assertions.status).toBe("FAIL");
    expect(v.control_assertions.design_errors.join("\n")).toContain(normal.path);
  });

  it("code 없는 진단이 정상 파일에 있어도 A3을 통과하지 못한다", () => {
    const normal = CONTROL_EXPECTATIONS.cases.find((c) => c.kind === "normal");
    if (!normal) throw new Error("no normal case");
    const base = Object.fromEntries(
      CONTROL_EXPECTATIONS.cases.map((c) => [
        c.path,
        c.required.map((code) => ({ severity: 2, code, message: "m" })),
      ])
    );
    const t = happyControl({
      diagnostics: { ...base, [normal.path]: [{ severity: 2, message: "m" }] },
      m: 99,
    });
    const v = evaluateTranscript(t, controlInputs());
    expect(v.reasons.map((r) => r.code)).toContain("UNKNOWN_RULE_CODE");
    expect(v.control_assertions.status).toBe("FAIL");
  });

  it("스텁 control 실행의 요약은 target의 참조가 될 수 없다(CONTROL_REFERENCE_SYNTHETIC)", () => {
    const controlTranscript = happyControl();
    const cv = evaluateTranscript(controlTranscript, controlInputs());
    const record = buildRecord(cv, controlTranscript, controlInputs());
    // 지문·음성 대조·eligible은 완전히 자격을 갖춘 고정 참조에서 가져온다 — 이 시험이 보는 것은 출처(stub)뿐이다.
    const reference = {
      ...CONTROL_REFERENCE_PASS,
      run_id: record.run_id,
      provenance: record.provenance,
      status: record.measurement.status,
      control_assertions_status: record.control_assertions.status,
      pin_sha256: PIN_SHA256,
      n0_confirmed: true,
    };
    expect(reference.provenance).toBe("stub");
    expect(reference.control_assertions_status).toBe("PASS");
    const tv = evaluateTranscript(happyTarget(), targetInputs({ controlReference: reference }));
    expect(tv.status).toBe("CONTROL_MISSING");
    expect(tv.reasons.map((r) => r.code)).toEqual(["CONTROL_REFERENCE_SYNTHETIC"]);
    expect(tv.candidate_gate.value).toBeNull();
  });

  it("negativeControls 입력은 그대로 control_assertions에 실린다(기본은 전부 NOT_RUN)", () => {
    const v = evaluateTranscript(happyControl(), controlInputs());
    expect(v.control_assertions.negative_controls).toHaveLength(16);
    expect(v.control_assertions.negative_controls.every((n) => n.status === "NOT_RUN")).toBe(true);
  });
});

describe("모양이 깨진 트랜스크립트는 던지지 않고 사유가 된다", () => {
  const inputs = targetInputs();
  const SECRET = "SECRET-PAYLOAD-TEXT";

  function withPublishParams(params: unknown): Transcript {
    let first = true;
    return mapEvents(
      (e) => e.kind === "stdout-message" && e.message.method === "textDocument/publishDiagnostics",
      (e) => {
        if (!first || e.kind !== "stdout-message") return e;
        first = false;
        return { ...e, message: { ...e.message, params } };
      }
    )(happyTarget());
  }

  const malformedParams: [string, unknown][] = [
    ["diagnostics가 배열이 아님", { uri: "file:///tmp/x", diagnostics: SECRET }],
    ["diagnostics가 객체", { uri: "file:///tmp/x", diagnostics: { message: SECRET } }],
    ["항목이 문자열", { uri: "file:///tmp/x", diagnostics: [SECRET] }],
    ["항목이 null", { uri: "file:///tmp/x", diagnostics: [null] }],
    ["range의 모양이 틀림", { uri: "file:///tmp/x", diagnostics: [{ range: SECRET, code: "c" }] }],
    [
      "range.start가 없음",
      { uri: "file:///tmp/x", diagnostics: [{ range: { end: { line: 0, character: 0 } } }] },
    ],
    ["uri가 없음", { diagnostics: [], note: SECRET }],
    ["uri가 문자열이 아님", { uri: 42, diagnostics: [] }],
    ["uri가 빈 문자열", { uri: "", diagnostics: [] }],
    ["params가 문자열", SECRET],
    ["params가 null", null],
    ["params가 배열", [SECRET]],
  ];

  for (const [name, params] of malformedParams) {
    it(`publishDiagnostics 페이로드 — ${name}`, () => {
      const t = withPublishParams(params);
      let v: ReturnType<typeof evaluateTranscript> | undefined;
      expect(() => {
        v = evaluateTranscript(t, inputs);
      }).not.toThrow();
      if (!v) throw new Error("no verdict");
      assertConsistent(v);
      expect(v.status).not.toBe("COMPLETE");
      expect(v.reasons.map((r) => r.code)).toContain("MALFORMED_FRAME");
      // 페이로드 본문은 어떤 사유에도, 관측 사실에도 들어가지 않는다.
      expect(JSON.stringify(v)).not.toContain(SECRET);
    });
  }

  it("모양이 깨진 사건·잘못된 events는 던지지 않고 MALFORMED_FRAME이 된다", () => {
    const base = happyTarget();
    const junk: unknown[] = [
      null,
      7,
      "x",
      {},
      { kind: 5, seq: 1 },
      { kind: "stdout-message", seq: 1 },
    ];
    const t = { meta: base.meta, events: [...junk, ...base.events] } as unknown as Transcript;
    const v = evaluateTranscript(t, inputs);
    assertConsistent(v);
    expect(v.reasons.map((r) => r.code)).toContain("MALFORMED_FRAME");
    expect(v.status).not.toBe("COMPLETE");
  });

  it("events가 배열이 아니어도 던지지 않는다", () => {
    const t = { meta: happyTarget().meta, events: "x" } as unknown as Transcript;
    const v = evaluateTranscript(t, inputs);
    assertConsistent(v);
    expect(v.status).toBe("INIT_FAILED");
  });

  it("stdout-message의 message가 객체가 아니면 건너뛰고 사유를 남긴다", () => {
    const t = mapEvents(
      (e) => e.kind === "stdout-message" && e.message.method === "semgrep/rulesRefreshed",
      (e) => ({ ...e, message: SECRET }) as unknown as TranscriptEvent
    )(happyTarget());
    const v = evaluateTranscript(t, inputs);
    assertConsistent(v);
    expect(v.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(["MALFORMED_FRAME", "RULES_REFRESHED_MISSING"])
    );
    expect(JSON.stringify(v)).not.toContain(SECRET);
  });

  it("send의 cursor가 깨졌으면 스캔 전 구간을 넓게 잡아 오염으로 닫는다", () => {
    // 빌더는 cursor를 다시 매기므로, 깨진 값은 빌더를 거치지 않고 직접 넣는다.
    const t = structuredClone(happyTarget());
    const scan = t.events.find((e) => e.kind === "send" && e.label === "scan-workspace");
    (scan as unknown as { cursor: unknown }).cursor = { stdout: "x", stderr: -1 };
    const v = evaluateTranscript(t, inputs);
    assertConsistent(v);
    expect(v.status).toBe("CONTAMINATED");
    expect(v.reasons.map((r) => r.code)).toContain("PRE_SCAN_DIAGNOSTIC");
  });

  it("stdout 메시지의 id가 이상해도(객체·null) 던지지 않는다", () => {
    const odd: TranscriptEvent = {
      seq: 0,
      t: 0,
      kind: "stdout-message",
      index: 0,
      message: { jsonrpc: "2.0", id: { nested: 1 } as unknown as string, result: {} },
    };
    const nullId: TranscriptEvent = {
      seq: 0,
      t: 0,
      kind: "stdout-message",
      index: 0,
      message: { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse" } },
    };
    for (const event of [odd, nullId]) {
      const t = (() => {
        const base = happyTarget();
        const events = [...base.events];
        events.splice(8, 0, event);
        return { meta: base.meta, events } as Transcript;
      })();
      const v = evaluateTranscript(t, inputs);
      assertConsistent(v);
      expect(v.reasons.map((r) => r.code)).toContain("RESPONSE_ID_UNMATCHED");
    }
  });

  it("스캔 루트가 절대 경로가 아니어도 던지지 않고 모든 URI를 정규화 불가로 닫는다", () => {
    const v = evaluateTranscript(happyTarget(), targetInputs({ scanRoot: "relative/root" }));
    assertConsistent(v);
    expect(v.status).toBe("TARGET_MISMATCH");
    expect(v.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(["URI_UNNORMALIZABLE", "URI_EXPECTED_NOT_PUBLISHED"])
    );
  });

  it("주입한 logFormat이 던져도 그 줄은 인식되지 않을 뿐 던지지 않는다", () => {
    const v = evaluateTranscript(
      happyTarget(),
      targetInputs({
        logFormat: {
          extractMessage: () => {
            throw new Error("boom");
          },
        },
      })
    );
    assertConsistent(v);
    expect(v.status).not.toBe("COMPLETE");
  });
});

describe("호출자 계약 위반은 던진다(트랜스크립트 내용이 아니라 입력의 문제다)", () => {
  it("mode 불일치", () => {
    expect(() => evaluateTranscript(happyTarget(), controlInputs())).toThrow(/mode/);
  });
  it("알 수 없는 mode", () => {
    expect(() =>
      evaluateTranscript(happyTarget(), targetInputs({ mode: "x" as "target" }))
    ).toThrow(/mode/);
  });
  it("target 모드에 scope가 없음", () => {
    expect(() => evaluateTranscript(happyTarget(), targetInputs({ scope: null }))).toThrow(/scope/);
  });
  it("control 모드에 controlExpectations가 없음", () => {
    expect(() =>
      evaluateTranscript(happyControl(), controlInputs({ controlExpectations: null }))
    ).toThrow(/controlExpectations/);
  });
});

describe("판정은 입력에서 값을 얻는다(상수 없음)", () => {
  it("규칙 수·로딩 쌍·E가 작은 입력이면 작은 트랜스크립트가 COMPLETE다", () => {
    const rules = EXPECTED_RULES.slice(0, 10);
    const files = RULES_FILES.filter((f) => rules.some((r) => r.file === f.path));
    const paths = ["only/one.ts", "only/two.ts"];
    const t = happyTarget({
      n: rules.length,
      expectedPaths: paths,
      k: paths.length,
      loadingPaths: files.map((f) => normalizeLoadingPath(`${PIN.rules.cache_dir_name}/${f.path}`)),
    });
    const inputs = targetInputs({ expectedRules: rules, rulesFiles: files, scope: scopeOf(paths) });
    const v = evaluateTranscript(t, inputs);
    expect(v.reasons).toEqual([]);
    expect(v.status).toBe("COMPLETE");
    // 같은 트랜스크립트를 전체 기대 목록으로 보면 어긋난다.
    expect(evaluateTranscript(t, targetInputs()).status).not.toBe("COMPLETE");
  });

  it("고유 원문 ID 수는 기대 목록에서 센다(겹치는 ID가 없으면 그 구분은 일어나지 않는다)", () => {
    const rules = EXPECTED_RULES.filter(
      (r, i, all) => all.findIndex((x) => x.originalId === r.originalId) === i
    ).slice(0, 5);
    const files = RULES_FILES.filter((f) => rules.some((r) => r.file === f.path));
    const loadingPaths = files.map((f) =>
      normalizeLoadingPath(`${PIN.rules.cache_dir_name}/${f.path}`)
    );
    // 고유 원문 ID 수 == 규칙 수 → N이 달라도 RULE_COUNT_IS_DISTINCT_ID_COUNT가 아니라 N_MISMATCH다.
    const t = happyTarget({ n: 99, loadingPaths });
    const v = evaluateTranscript(t, targetInputs({ expectedRules: rules, rulesFiles: files }));
    expect(codesOf(v)).toEqual(["RULE_COUNT_N_MISMATCH"]);
  });

  it("서버 버전은 핀에서 읽는다", () => {
    const pin = { ...PIN, semgrep: { ...PIN.semgrep, version: "9.9.9" } };
    const v = evaluateTranscript(happyTarget(), targetInputs({ pin }));
    expect(codesOf(v)).toEqual(["SERVER_VERSION_MISMATCH"]);
    expect(
      evaluateTranscript(happyTarget({ serverVersion: "9.9.9" }), targetInputs({ pin })).status
    ).toBe("COMPLETE");
  });

  it("스캔 루트가 Windows 드라이브 경로여도 URI가 같은 파일로 매칭된다", () => {
    const root = "C:\\work\\scan";
    const t = happyTarget({ scanRoot: root });
    expect(evaluateTranscript(t, targetInputs({ scanRoot: root })).status).toBe("COMPLETE");
  });
});

describe("로그 형식 주입과 줄 인식", () => {
  const prefixed = (t: Transcript): Transcript =>
    mapEvents(
      (e) => e.kind === "stderr-line",
      (e) => (e.kind === "stderr-line" ? { ...e, text: `2026-10-22 [INFO] ${e.text}` } : e)
    )(t);

  it("접두어가 붙은 줄은 기본 형식에서는 인식되지 않아 COMPLETE가 아니다", () => {
    const v = evaluateTranscript(prefixed(happyTarget()), targetInputs());
    expect(v.status).not.toBe("COMPLETE");
  });

  it("주입한 extractMessage가 접두어를 벗기면 COMPLETE다", () => {
    const v = evaluateTranscript(
      prefixed(happyTarget()),
      targetInputs({ logFormat: { extractMessage: (line) => line.replace(/^\S+ \[INFO\] /, "") } })
    );
    expect(v.reasons).toEqual([]);
    expect(v.status).toBe("COMPLETE");
  });

  it("줄이 끝나지 않은 채 끊긴 마지막 줄(partial)은 인식하지 않는다", () => {
    const v = evaluateTranscript(
      setStderrPartial("Scanning workspace complete")(happyTarget()),
      targetInputs()
    );
    expect(codesOf(v)).toEqual(expect.arrayContaining(["NO_BARRIER"]));
    expect(v.observed.scan.barrierSeen).toBe(false);
  });

  it("장벽 줄이 두 번이면 MULTI_SCAN_LOG다", () => {
    const v = evaluateTranscript(
      duplicateStderrLine("Scanning workspace complete")(happyTarget()),
      targetInputs()
    );
    expect(codesOf(v)).toEqual(["MULTI_SCAN_LOG"]);
  });

  it("echo가 장벽보다 먼저 송신됐으면 ECHO_MISSING이다", () => {
    // 장벽 줄을 echo 송신 뒤로 옮긴다(스트림 사이의 도착 순서만 바뀐다).
    const t = moveAcrossStreams(
      stderrIs("Scanning workspace complete"),
      after(sendIs("echo-post-barrier"))
    )(happyTarget());
    const v = evaluateTranscript(t, targetInputs());
    expect(codesOf(v)).toEqual(["ECHO_MISSING"]);
  });
});

describe("harness kill의 원인 사건", () => {
  it("원인 사건(한도·취소·프레임 오류·stdin 오류) 없이 하네스가 종료시키면 TIMEOUT_EXIT이다", () => {
    const t = pipe(
      happyTarget(),
      dropEvents((e) => e.kind === "exit"),
      appendKill(),
      (x) => ({
        meta: x.meta,
        events: [
          ...x.events,
          {
            seq: x.events.length,
            t: x.events.length * 10,
            kind: "exit",
            code: null,
            signal: "SIGKILL",
            byHarness: true,
          },
        ] as TranscriptEvent[],
      })
    );
    const v = evaluateTranscript(t, targetInputs());
    expect(codesOf(v)).toEqual(["TIMEOUT_EXIT"]);
  });
});

describe("기준 트랜스크립트 보조 확인", () => {
  it("evaluate 입력의 publishMessage 도우미가 만든 게시도 정상 처리된다", () => {
    const t = happyTarget();
    const uri = (
      t.events.find(
        (e) => e.kind === "stdout-message" && e.message.method === "textDocument/publishDiagnostics"
      ) as Extract<TranscriptEvent, { kind: "stdout-message" }>
    ).message.params as { uri: string };
    expect(publishMessage(uri.uri, []).method).toBe("textDocument/publishDiagnostics");
    expect(IDS.echoPost).toBe("echo-post-1");
  });
});
