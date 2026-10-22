// 시험 전용: 합성 control 실행 기록(run.json 모양)을 만든다. 운영 코드가 아니고, 운영 관측도 아니다.
//
// 여기서 만든 기록은 실제 Semgrep을 한 번도 실행하지 않은 채 시험이 손으로 구성한 것이다. 출처(provenance)를 "real"로
// 선언한 기록도 마찬가지로 합성이다 — 어댑터의 수락 조건을 시험하려면 "real이라고 주장하는 기록"이 필요하기 때문이다.
// 기록을 만드는 길은 운영과 같다(합성 트랜스크립트 → evaluateTranscript → buildRunRecord). 달라지는 것은 입력뿐이다:
// 음성 대조 16쌍을 시험이 PASS로 채우고(운영에는 엔진 항목을 PASS로 표시하는 코드가 없다), 도구 버전·휠 값도 시험이 정한다.
//
// 공개 API:
//   syntheticControlRunRecord(options): RunRecord      control 모드 기록(기본: 자격을 갖춘 real 선언 기록)
//   syntheticTargetRunRecord(): RunRecord              target 모드 기록(대조 참조로 쓸 수 없어야 한다)

import { evaluateTranscript } from "../evaluate";
import { buildRunRecord } from "../evidence";
import { sha256Hex } from "../sha";
import type { NegativeControlResult, Provenance, ReferenceFingerprints, RunRecord } from "../types";
import {
  CONTROL_EXPECTATIONS,
  buildRecord,
  controlInputs,
  happyControl,
  happyTarget,
  qualifiedNegativeControls,
  targetInputs,
} from "./evaluate-fixtures";
import {
  dropEchoResponse,
  endByTimeout,
  pipe,
  setMeta,
  stripEnding,
  type HappySpec,
} from "./transcript-builder";

export type ControlRecordVariant =
  /** 측정 COMPLETE, 대조 단언 PASS. */
  | "complete"
  /** echo 응답이 없어 TIMEOUT으로 끝난 불완전한 측정. */
  | "timeout"
  /** 측정은 끝났지만 양성 사례 하나의 필수 탐지가 빠져 대조 단언이 FAIL. */
  | "assertion-fail";

export interface SyntheticControlRecordOptions {
  /** inputs에 싣는 지문 일곱 값(도구 버전·휠 포함). 시험이 정한 값이며 관측한 값이 아니다. */
  fingerprints: ReferenceFingerprints;
  pinSha256: string;
  /** 기본 "real"(= real이라고 *주장하는* 합성 기록). */
  provenance?: Provenance;
  /** 기본 true. */
  n0Confirmed?: boolean;
  /** 기본 "qualified": 16쌍 PASS + 이 기록의 결합. "not-run": 운영이 만드는 그대로 전부 NOT_RUN. */
  negatives?: "qualified" | "not-run" | readonly NegativeControlResult[];
  variant?: ControlRecordVariant;
  runId?: string;
}

function missingDetectionSpec(): Partial<HappySpec> {
  const diagnostics: Record<string, { severity: number; code: string; message: string }[]> = {};
  let total = 0;
  let dropped = false;
  for (const c of CONTROL_EXPECTATIONS.cases) {
    let codes = c.required;
    if (!dropped && c.required.length > 0) {
      dropped = true;
      codes = [];
    }
    diagnostics[c.path] = codes.map((code) => ({ severity: 2, code, message: "m" }));
    total += codes.length;
  }
  return { diagnostics, m: total };
}

export function syntheticControlRunRecord(options: SyntheticControlRecordOptions): RunRecord {
  const f = options.fingerprints;
  const negatives = options.negatives ?? "qualified";
  const negativeControls =
    negatives === "not-run"
      ? undefined
      : negatives === "qualified"
        ? qualifiedNegativeControls(String(f.binding_sha256))
        : [...negatives];
  const variant = options.variant ?? "complete";

  let transcript = happyControl(variant === "assertion-fail" ? missingDetectionSpec() : {});
  if (variant === "timeout") {
    transcript = pipe(
      transcript,
      dropEchoResponse("post"),
      stripEnding,
      endByTimeout("PH4", "echo-post-barrier 응답")
    );
  }
  transcript = pipe(
    transcript,
    setMeta({
      provenance: options.provenance ?? "real",
      ...(options.runId === undefined ? {} : { runId: options.runId }),
    })
  );

  const verdict = evaluateTranscript(
    transcript,
    controlInputs(negativeControls === undefined ? {} : { negativeControls })
  );
  return buildRunRecord({
    runId: transcript.meta.runId,
    mode: "control",
    provenance: transcript.meta.provenance,
    verdict,
    inputs: {
      target_sha: null,
      pin_sha256: options.pinSha256,
      scope_sha256: null,
      rules_list_sha256: f.rules_list_sha256,
      rules_expected_sha256: f.rules_expected_sha256,
      control_tree_sha256: sha256Hex("synthetic-control-tree"),
      harness_sha256: f.harness_sha256,
      control_sha256: f.control_sha256,
      tool_version_observed: f.tool_version,
      wheel_sha256_observed: f.wheel_sha256,
      binding_sha256: f.binding_sha256,
    },
    phasesReached: ["PH1", "PH2", "PH3", "PH4"],
    controlReference: null,
    n0Confirmed: options.n0Confirmed ?? true,
  });
}

/** target 모드의 합성 기록(출처는 real이라고 주장). 대조 참조가 될 수 없는 기록의 대표다. */
export function syntheticTargetRunRecord(): RunRecord {
  const transcript = pipe(happyTarget(), setMeta({ provenance: "real" }));
  const inputs = targetInputs();
  return buildRecord(evaluateTranscript(transcript, inputs), transcript, inputs);
}
