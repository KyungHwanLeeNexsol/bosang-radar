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

// @MX:WARN: [AUTO] 자체 try/catch가 없는 async 함수 — runSmokeCheck 등 안쪽 호출의 예기치 못한 reject가 그대로 전파된다
// @MX:REASON: 예상되는 실패는 이 함수가 값으로 처리한다. 인자 오류는 parseSmokeArgs가 ok:false로 돌려줘 종료 코드 2가 되고, 네트워크 실패는 runSmokeCheck 안의 attemptFetch가 받아 종료 코드 1이 된다. 그 밖의 reject는 호출자인 이 파일 하단의 main().then(…, 오류 처리)가 메시지를 출력하고 process.exitCode = 1로 끝낸다. 이 함수가 연 자원은 없다.
// @MX:SPEC: SPEC-B2C-LAUNCH-001
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
