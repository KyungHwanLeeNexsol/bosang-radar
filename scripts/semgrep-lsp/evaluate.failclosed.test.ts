import { describe, expect, it } from "vitest";
import { evaluateTranscript } from "./evaluate";
import {
  PIN,
  assertConsistent,
  buildRecord,
  controlInputs,
  deepFreeze,
  happyControl,
  happyTarget,
  targetInputs,
} from "./testing/evaluate-fixtures";
import { ALL_SCENARIOS } from "./testing/evaluate-scenarios";
import {
  appendCleanup,
  dropCleanup,
  dropEventAt,
  insertEvents,
  pipe,
  validateTranscript,
  type Mutator,
} from "./testing/transcript-builder";
import type { Transcript, TranscriptEvent } from "./types";

// fail-closed 성질: 필수 증거를 하나라도 빼거나 기록이 중간에 끊기거나 프레임이 깨지면 COMPLETE가 될 수 없다.
// 모든 입력은 합성이며(provenance stub) 실제 Semgrep의 동작을 증명하지 않는다.

const happy = happyTarget();

/**
 * 판정에 *쓰이지 않는* 사건(빼도 COMPLETE가 유지되는 것). 이 목록이 정확히 맞아야 한다 — 목록 밖의 사건을
 * 빼도 COMPLETE가 되면 그 사건이 조용히 선택 사항이 된 것이고, 목록 안의 사건을 빼서 COMPLETE가 깨지면
 * 목록이 틀린 것이다.
 *  · spawn, phase, stdout-eof, stderr-eof: 판정에 쓰지 않는 기록(프로세스 지문·구간 표지·EOF).
 *  · shutdown·exit 송신: C1~C9에 없다(종료 코드와 exit 사건만 본다).
 *  · stderr `Refreshing rules`, `Rules refreshed`, `Scanning open documents`: C2~C4가 요구하지 않는 보조 줄.
 * cleanup은 이 목록에 없다: 프로세스를 띄웠다면 정리 성공 기록(ok:true 정확히 한 건)이 최종 증거로 판정된다.
 */
const OPTIONAL_STDERR = new Set(["Refreshing rules", "Rules refreshed", "Scanning open documents"]);
const OPTIONAL_SENDS = new Set(["shutdown", "exit"]);
function isOptional(e: TranscriptEvent): boolean {
  switch (e.kind) {
    case "spawn":
    case "phase":
    case "stdout-eof":
    case "stderr-eof":
      return true;
    case "send":
      return OPTIONAL_SENDS.has(e.label);
    case "stderr-line":
      return OPTIONAL_STDERR.has(e.text);
    default:
      return false;
  }
}

function describeEvent(e: TranscriptEvent, i: number): string {
  switch (e.kind) {
    case "stderr-line":
      return `#${i} stderr ${e.text.slice(0, 60)}`;
    case "send":
      return `#${i} send ${e.label}`;
    case "stdout-message":
      return `#${i} stdout ${String(e.message.method ?? `응답 ${String(e.message.id)}`)}`;
    default:
      return `#${i} ${e.kind}`;
  }
}

describe("fail-closed: 기준 트랜스크립트", () => {
  it("기준 트랜스크립트 자체는 일관되고 COMPLETE다(시험의 전제)", () => {
    expect(validateTranscript(happy)).toEqual([]);
    const v = evaluateTranscript(happy, targetInputs());
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
  });

  it("(a) 필수 증거를 하나씩 빼면 COMPLETE가 아니고 사유가 있다 — 선택 사항 목록과 정확히 일치한다", () => {
    const inputs = targetInputs();
    const notRejected: string[] = []; // 필수인데 COMPLETE로 남은 것
    const wronglyRejected: string[] = []; // 선택 사항인데 COMPLETE가 깨진 것
    let required = 0;
    happy.events.forEach((event, i) => {
      const mutated = dropEventAt(i)(happy);
      const v = evaluateTranscript(mutated, inputs);
      assertConsistent(v);
      const optional = isOptional(event);
      if (!optional) {
        required++;
        if (v.status === "COMPLETE" || v.reasons.length === 0)
          notRejected.push(describeEvent(event, i));
      } else if (v.status !== "COMPLETE") {
        wronglyRejected.push(`${describeEvent(event, i)} → ${v.status}`);
      }
    });
    expect(notRejected).toEqual([]);
    expect(wronglyRejected).toEqual([]);
    // 로딩 쌍 205×2줄 + 나머지 필수 증거가 실제로 시험됐는지(빈 순회로 통과하지 않도록).
    expect(required).toBeGreaterThan(PIN.rules.yaml_files * 2);
  });

  it("(a) 같은 전수 시험이 control 모드에서도 성립한다", () => {
    const control = happyControl();
    const inputs = controlInputs();
    expect(evaluateTranscript(control, inputs).status).toBe("COMPLETE");
    const notRejected: string[] = [];
    control.events.forEach((event, i) => {
      if (isOptional(event)) return;
      const v = evaluateTranscript(dropEventAt(i)(control), inputs);
      assertConsistent(v);
      if (v.status === "COMPLETE") notRejected.push(describeEvent(event, i));
    });
    expect(notRejected).toEqual([]);
  });

  it("(a) cleanup은 선택 사항이 아니다: 빼거나 실패로 바꾸거나 한 건 더 넣으면 target·control 모두 COMPLETE가 아니다", () => {
    for (const [transcript, inputs] of [
      [happy, targetInputs()],
      [happyControl(), controlInputs()],
    ] as const) {
      const cleanups = transcript.events.filter((e) => e.kind === "cleanup");
      expect(cleanups).toHaveLength(1); // 기준 트랜스크립트는 끝에 정리 성공 한 건을 갖는다(시험의 전제)
      expect(isOptional(cleanups[0])).toBe(false);
      const variants: Transcript[] = [
        dropCleanup(transcript),
        pipe(transcript, dropCleanup, appendCleanup(false)),
        appendCleanup()(transcript),
      ];
      for (const variant of variants) {
        const v = evaluateTranscript(variant, inputs);
        assertConsistent(v);
        expect(v.status).toBe("ENGINE_FAILED");
        expect(v.reasons.map((r) => r.code)).toEqual(["CLEANUP_FAILED"]);
      }
    }
  });

  it("(b) 기준 트랜스크립트의 엄격한 접두사는 모두 COMPLETE가 아니다", () => {
    const inputs = targetInputs();
    const complete: number[] = [];
    for (let k = 0; k < happy.events.length; k++) {
      const prefix: Transcript = { meta: happy.meta, events: happy.events.slice(0, k) };
      const v = evaluateTranscript(prefix, inputs);
      assertConsistent(v);
      if (v.status === "COMPLETE" || v.reasons.length === 0) complete.push(k);
    }
    expect(complete).toEqual([]);
    // 전체(접두사가 아님)는 COMPLETE다.
    expect(evaluateTranscript(happy, inputs).status).toBe("COMPLETE");
  });

  it("(b) control 트랜스크립트의 엄격한 접두사도 모두 COMPLETE가 아니다", () => {
    const control = happyControl();
    const inputs = controlInputs();
    const complete: number[] = [];
    // 3개마다 + 마지막 사건(cleanup)만 뺀 접두사.
    const cuts = [
      ...Array.from({ length: Math.ceil(control.events.length / 3) }, (_, i) => i * 3),
      control.events.length - 1,
    ];
    for (const k of cuts) {
      const prefix: Transcript = { meta: control.meta, events: control.events.slice(0, k) };
      const v = evaluateTranscript(prefix, inputs);
      if (v.status === "COMPLETE") complete.push(k);
    }
    expect(complete).toEqual([]);
  });

  it("(c) 어느 위치에 프레임 오류가 끼어도 COMPLETE가 아니다(MALFORMED·TRUNCATED)", () => {
    const inputs = targetInputs();
    const bad: string[] = [];
    for (const error of ["MALFORMED", "TRUNCATED"] as const) {
      for (let k = 0; k <= happy.events.length; k++) {
        const frameError: TranscriptEvent = {
          seq: 0,
          t: 0,
          kind: "stdout-frame-error",
          error,
          detail: "합성",
          atByte: 0,
        };
        const mutator: Mutator = insertEvents(() => k, frameError);
        const v = evaluateTranscript(mutator(happy), inputs);
        assertConsistent(v);
        if (v.status === "COMPLETE") bad.push(`${error}@${k}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("(c) 프레임 오류 뒤의 stdout 메시지는 신뢰하지 않는다(뒤에 정상 메시지가 이어져도 COMPLETE가 아니다)", () => {
    // 프레임 오류를 echo 응답 바로 앞에 끼워도 그 뒤의 응답은 증거가 되지 못해 ECHO_MISSING이 된다.
    const echoIndex = happy.events.findIndex(
      (e) => e.kind === "stdout-message" && e.message.id === "echo-post-1"
    );
    const frameError: TranscriptEvent = {
      seq: 0,
      t: 0,
      kind: "stdout-frame-error",
      error: "MALFORMED",
      detail: "합성",
      atByte: 0,
    };
    const v = evaluateTranscript(insertEvents(() => echoIndex, frameError)(happy), targetInputs());
    expect(v.status).toBe("ENGINE_FAILED");
    expect(v.reasons.map((r) => r.code).sort()).toEqual(["ECHO_MISSING", "MALFORMED_FRAME"]);
  });

  it("(d) 모든 시나리오에서 complete·status·reasons·candidate_gate가 서로 맞는다", () => {
    for (const scenario of ALL_SCENARIOS) {
      const built = scenario.build();
      const v = evaluateTranscript(built.transcript, built.inputs);
      assertConsistent(v);
      // 사유가 있으면 value는 null이다(0이 아니다).
      if (v.reasons.length > 0) expect(v.candidate_gate.value).toBeNull();
    }
  });

  it("(d) buildRunRecord가 모든 시나리오의 Verdict를 받아들인다", () => {
    for (const scenario of ALL_SCENARIOS) {
      const built = scenario.build();
      const v = evaluateTranscript(built.transcript, built.inputs);
      expect(() => buildRecord(v, built.transcript, built.inputs), scenario.id).not.toThrow();
    }
  });

  it("(e) 같은 입력을 두 번 평가하면 깊은 동등이고, 입력(깊게 얼린 것)은 바뀌지 않는다", () => {
    for (const scenario of ALL_SCENARIOS) {
      const built = scenario.build();
      const frozen = { transcript: deepFreeze(built.transcript), inputs: deepFreeze(built.inputs) };
      const snapshot = structuredClone(built);
      const first = evaluateTranscript(frozen.transcript, frozen.inputs);
      const second = evaluateTranscript(frozen.transcript, frozen.inputs);
      expect(second, scenario.id).toEqual(first);
      expect(built, scenario.id).toEqual(snapshot);
      // 얼린 입력을 바꾸려다 던지면 평가기가 내부 예외로 닫는다 — 그 경로는 시험에서 허용하지 않는다.
      assertConsistent(first);
    }
  });

  it("(e) 결과는 입력과 객체를 공유하지 않는다(결과를 바꿔도 입력이 변하지 않는다)", () => {
    const t = happyTarget();
    const inputs = targetInputs({
      precheckReasons: [{ code: "RULES_FILE_ADDED", detail: "x" }],
    });
    const before = structuredClone({ t, inputs });
    const v = evaluateTranscript(t, inputs);
    v.reasons.push({ code: "NO_BARRIER" });
    v.reasons[0].detail = "바꿈";
    v.observed.rules.loadingPairsOk.length = 0;
    expect({ t, inputs }).toEqual(before);
  });
});
