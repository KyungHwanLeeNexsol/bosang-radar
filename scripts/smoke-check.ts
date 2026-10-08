// SPEC-B2C-LAUNCH-001 M4 (REQ-B2CLAUNCH-013, AC-B2CLAUNCH-013, D-LAUNCH-06 설계 (a)·위치 (ii)) — 배포 후 smoke 검사 CLI.
//
// 사용: pnpm exec tsx scripts/smoke-check.ts --base-url=<기준 주소> [--attempts=<횟수>] [--retry-delay-ms=<밀리초>]
//       (기준 주소는 환경 입력 SMOKE_BASE_URL로도 줄 수 있고, 인자가 우선한다. 기본 주소는 없다.)
// 종료 코드: 0 = 통과, 1 = 실패(홈이 2xx가 아니거나 CSS 청크가 없거나 서빙되지 않음), 2 = 사용법 오류.
//
// 진단 게이트가 닫혀 있든 열려 있든 같은 규칙으로 판정한다(게이트 상태는 정보로만 출력한다). 응답 본문은 출력하지
// 않는다. 이 스크립트는 읽기 전용 요청(GET)만 보낸다.

import { pathToFileURL } from "node:url";

import { formatSmokeReport, parseSmokeArgs, runSmokeCheck } from "../lib/launch/smoke-check";

export type SmokeExitCode = 0 | 1 | 2;

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  write: (line: string) => void = (line) => console.log(line)
): Promise<SmokeExitCode> {
  const parsed = parseSmokeArgs(argv, env);
  if (!parsed.ok) {
    write(`사용법 오류: ${parsed.error}`);
    return 2;
  }
  const report = await runSmokeCheck({
    baseUrl: parsed.baseUrl,
    attempts: parsed.attempts,
    retryDelayMs: parsed.retryDelayMs,
    log: write,
  });
  for (const line of formatSmokeReport(report)) write(line);
  return report.ok ? 0 : 1;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(
        "smoke-check 실행 실패:",
        error instanceof Error ? error.message : "알 수 없는 오류"
      );
      process.exitCode = 1;
    }
  );
}
