// 시험 전용: 도구 관측 요약(ToolObservationSummary)을 실제 요약 생성기(buildToolObservationSummary)로 만든다. 손으로 쓴 JSON이 아니라
// 같은 생성기를 거치므로 요약의 모양이 운영 코드와 어긋나지 않는다. 어디에도 "real"을 박지 않는다 — 출처는 호출자가 정한다.

import {
  buildToolObservationSummary,
  notAttemptedVersion,
  notAttemptedWheel,
  type ToolVersionObservation,
  type WheelObservation,
} from "../tool-observation";
import type { Provenance, ToolObservationSummary } from "../types";

export function versionObserved(
  version: string,
  provenance: Provenance = "stub"
): ToolVersionObservation {
  return {
    status: "OBSERVED",
    version,
    failure: null,
    provenance,
    args: ["--version"],
    exit: { code: 0, signal: null },
    stdoutBytes: version.length + 1,
    stderrBytes: 0,
    durationMs: 3,
    childProcess: "EXITED",
  };
}

export function wheelObserved(sha256: string, sizeBytes = 10): WheelObservation {
  return { status: "OBSERVED", failure: null, sha256, sizeBytes };
}

/**
 * version/wheel이 null이면 그쪽은 시도하지 않은 것(잠금 없음)으로 만든다. hitsDuring은 버전 확인이 도는 동안 루프백 수신기에 늘어난 요청
 * 건수(metrics_hits_during)이며, 생략하면 null(관측하지 못함)이다 — 0으로 보정하지 않는다.
 */
export function summaryOf(
  options: {
    version?: string | null;
    wheel?: string | null;
    provenance?: Provenance;
    hitsDuring?: number | null;
  } = {}
): ToolObservationSummary {
  const version =
    options.version == null
      ? notAttemptedVersion("LOCK_NOT_HELD")
      : versionObserved(options.version, options.provenance ?? "stub");
  const wheel =
    options.wheel == null ? notAttemptedWheel("ARTIFACT_NOT_GIVEN") : wheelObserved(options.wheel);
  return buildToolObservationSummary(version, wheel, options.hitsDuring ?? null);
}
