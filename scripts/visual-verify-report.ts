// visual:verify의 측정 증거 기록 규칙 — 어떤 실행이 어떤 파일을 쓸 수 있는가.
//
// visual-verify.ts는 import되는 순간 main()이 실행되어 테스트할 수 없으므로 분리했다.
//
//   measurements.json          제약 없는 전체 실행이 정리까지 성공했을 때만 갱신된다
//                              (audit-ready 근거가 되는 정규 증거).
//   measurements.partial.json  VISUAL_ONLY · VISUAL_SKIP_BUILD · VISUAL_BASE_URL 실행.
//   measurements.failed.json   정리(브라우저 종료 · 서버 프로세스 트리)에 실패한 실행.
//                              위 두 파일은 절대 건드리지 않고, 종료 사유와 cleanupFailures를
//                              남긴다. 화면별 pass가 전부 true여도 명령 전체는 실패한 실행이라
//                              이전의 정상 정규 증거를 덮어쓰면 안 된다.

import fs from "node:fs";
import path from "node:path";

export const MEASUREMENTS_CANONICAL = "measurements.json";
export const MEASUREMENTS_PARTIAL = "measurements.partial.json";
export const MEASUREMENTS_FAILED = "measurements.failed.json";

/** 이 실행의 측정치가 기록될 파일 이름. */
export function measurementsFileName(
  isCanonicalRun: boolean,
  cleanupFailures: readonly string[]
): string {
  if (cleanupFailures.length > 0) return MEASUREMENTS_FAILED;
  return isCanonicalRun ? MEASUREMENTS_CANONICAL : MEASUREMENTS_PARTIAL;
}

export interface MeasurementsContext<R extends { id: string }, F extends { screen: string }> {
  isCanonicalRun: boolean;
  /** 비어 있지 않으면 정리에 실패한 실행이다. */
  cleanupFailures: readonly string[];
  run: {
    totalScreens: number;
    visualOnly: string | null;
    skipBuild: boolean;
    externalBaseURL: string | null;
  };
  tolerance: unknown;
  results: readonly R[];
  findings: readonly F[];
  now?: () => Date;
}

/**
 * 화면 소유 SPEC별 report 디렉터리에 측정치를 쓴다. 쓴 파일 경로를 돌려주고,
 * 기록할 화면이 없으면 아무것도 쓰지 않고 null을 돌려준다.
 */
export function writeMeasurements<R extends { id: string }, F extends { screen: string }>(
  reportDir: string,
  screenIds: string[],
  ctx: MeasurementsContext<R, F>
): string | null {
  if (screenIds.length === 0) return null;
  const idSet = new Set(screenIds);
  const failed = ctx.cleanupFailures.length > 0;
  const file = path.join(reportDir, measurementsFileName(ctx.isCanonicalRun, ctx.cleanupFailures));

  const body = {
    // 산출물이 스스로 "이 실행이 audit-ready 근거로 쓸 수 있는 전체 실행이었는지"를 밝힌다.
    // 정리에 실패한 실행은 전체 실행이었더라도 근거가 될 수 없다.
    canonical: failed ? false : ctx.isCanonicalRun,
    ...(failed
      ? {
          exitReason: "cleanup-failed",
          cleanupFailures: [...ctx.cleanupFailures],
          // 정리에 성공했다면 이 실행이 갱신했을 파일 — 그 파일은 건드리지 않았다.
          untouchedFile: ctx.isCanonicalRun ? MEASUREMENTS_CANONICAL : MEASUREMENTS_PARTIAL,
        }
      : {}),
    run: { screenIds, ...ctx.run },
    tolerance: ctx.tolerance,
    results: ctx.results.filter((r) => idSet.has(r.id)),
    findings: ctx.findings.filter((f) => idSet.has(f.screen)),
  };

  fs.writeFileSync(
    file,
    JSON.stringify({ generatedAt: (ctx.now?.() ?? new Date()).toISOString(), ...body }, null, 2)
  );
  return file;
}

/** 화면 위반이나 정리 실패가 하나라도 있으면 성공으로 보고하지 않고 exit 1이다. */
export function decideOutcome(input: { findingCount: number; cleanupFailureCount: number }): {
  exitCode: 0 | 1;
  reportSuccess: boolean;
} {
  const ok = input.findingCount === 0 && input.cleanupFailureCount === 0;
  return { exitCode: ok ? 0 : 1, reportSuccess: ok };
}
