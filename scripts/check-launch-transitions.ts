// SPEC-B2C-LAUNCH-001 M3b: 전환 목록 점검기 (REQ-B2CLAUNCH-011, AC-B2CLAUNCH-011).
//
// 사용: pnpm exec tsx scripts/check-launch-transitions.ts --steps <플래그 변경 절차 단계 표 문서>
//         [--order <노출 순서 표 문서(D-LAUNCH-03 기록)>]
// 종료 코드: 0 = 통과, 1 = 거부(위반한 전환 번호를 출력), 2 = 입력 거부(표 칸 오류·사용법 오류),
//         3 = BLOCKED(순서가 기록되지 않았거나 결정 대기로 둔 벡터가 있어 판정하지 못함).
//
// `--order`를 주지 않거나 순서 표가 없는 문서를 주면 순서가 기록되지 않은 것이라 BLOCKED다 — 순서 없이 통과로
// 읽는 경로는 없다. 두 인자에 같은 문서(런북)를 줄 수 있다. 점검기는 문서를 읽기만 하고 바꾸지 않으며
// 파일 경로는 모두 인자로만 받는다(기본 위치가 없다).

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { checkTransitionsFromMarkdown } from "../lib/launch/transition-list";

export type ExitCode = 0 | 1 | 2 | 3;

export interface CheckResult {
  exitCode: ExitCode;
  output: string;
  /** 점검까지 간 경우의 판정(사용법 오류에는 없다). */
  status?: "PASS" | "REJECT" | "BLOCKED" | "INPUT_ERROR";
}

const FLAGS = ["steps", "order"] as const;
type Flag = (typeof FLAGS)[number];

/** 사용법 오류(인자·입력 파일 문제). runCli가 종료 코드 2의 결과로 바꾼다. */
class UsageError extends Error {}

function parseFlags(argv: readonly string[]): Partial<Record<Flag, string>> {
  const flags: Partial<Record<Flag, string>> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, "");
    if (!argv[i].startsWith("--") || !(FLAGS as readonly string[]).includes(name)) {
      throw new UsageError(`알 수 없는 인자 "${argv[i]}"`);
    }
    const value = argv[i + 1];
    if (value === undefined) throw new UsageError(`--${name}에 값이 없다`);
    flags[name as Flag] = value;
  }
  return flags;
}

/** 명령줄 인자를 읽어 점검한다. */
export function runCli(
  argv: readonly string[],
  readText: (file: string) => string = (file) => readFileSync(file, "utf-8")
): CheckResult {
  try {
    const flags = parseFlags(argv);
    if (flags.steps === undefined) throw new UsageError("--steps 인자가 필요하다");

    const read = (flag: Flag): string => {
      const file = flags[flag] as string;
      try {
        return readText(file);
      } catch {
        throw new UsageError(`--${flag} 파일을 읽지 못했다(${file})`);
      }
    };

    const result = checkTransitionsFromMarkdown({
      stepsMarkdown: read("steps"),
      orderMarkdown: flags.order === undefined ? undefined : read("order"),
    });
    return { exitCode: result.exitCode, output: result.output, status: result.status };
  } catch (error) {
    if (error instanceof UsageError) {
      return { exitCode: 2, output: `사용법 오류: ${error.message}` };
    }
    throw error;
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const result = runCli(process.argv.slice(2));
  if (result.exitCode === 2) console.error(result.output);
  else console.log(result.output);
  process.exitCode = result.exitCode;
}
