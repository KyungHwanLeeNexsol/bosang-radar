// 읽기 전용 git 어댑터(GitPort). 이 파일과 process-node.ts만 child_process를 쓴다(structure.test.ts가 지킨다).
//
// 공개 API:
//   createNodeGit({ repoDir, env, runner? }): GitPort
//   assertAllowedGitArgs(args, repoDir)     허용 목록에 없는 git 인자면 던진다(시험이 직접 부른다)
//
// 불변식:
//  · 일반 실행 함수를 밖으로 내놓지 않는다. 가능한 호출은 아래 세 가지뿐이며, 실행 직전에 인자 모양을 다시 검사한다.
//      resolveCommit => git -C <repo> rev-parse --verify --quiet <40hex>^{commit}
//      lsTree        => git -C <repo> ls-tree -r -l -z <40hex>
//      readBlob      => git -C <repo> cat-file blob <40hex>
//    SHA 입력이 소문자 40자 16진수가 아니면 git을 부르지 않는다(resolveCommit은 null, 나머지는 던진다).
//  · shell:false(execFile), 환경은 호출자가 넘긴 값에서 GIT_* 를 모두 버리고 GIT_OPTIONAL_LOCKS=0·
//    GIT_TERMINAL_PROMPT=0만 더한다. process.env를 직접 읽지 않는다 — 환경은 진입점이 명시적으로 넘긴다.
//  · 출력 크기·시간 상한이 있다(초과하면 던진다). 쓰기 명령은 없다.

import { execFile } from "node:child_process";
import type { GitPort, GitTreeEntry } from "./types";

const SHA40 = /^[0-9a-f]{40}$/;

/** 한 번의 git 실행 결과. 비정상 종료 코드는 결과로 돌려주고, 못 띄움·시간 초과·출력 초과는 던진다. */
export interface GitRunResult {
  exitCode: number;
  stdout: Uint8Array;
}

/** git 뒤에 붙는 인자 전체(`-C <repo>` 포함)를 받아 실행한다. 시험이 주입해 "git이 불리지 않음"을 단언한다. */
export type GitRunner = (args: readonly string[], maxBytes: number) => Promise<GitRunResult>;

export interface NodeGitOptions {
  repoDir: string;
  /** 호출자가 넘기는 환경. GIT_* 는 버린다. 값이 undefined인 항목은 무시한다. */
  env: Readonly<Record<string, string | undefined>>;
  runner?: GitRunner;
}

const RESOLVE_MAX_BYTES = 1024;
const LS_TREE_MAX_BYTES = 256 * 1024 * 1024;
const BLOB_MAX_BYTES = 256 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

const decoder = new TextDecoder("utf-8", { fatal: true });

// ── 허용 목록 ───────────────────────────────────────────────────

/** 허용된 세 가지 모양 중 하나가 아니면 던진다. `-C`의 값은 정확히 repoDir여야 한다. */
export function assertAllowedGitArgs(args: readonly string[], repoDir: string): void {
  const [dashC, dir, ...rest] = args;
  if (dashC !== "-C" || dir !== repoDir)
    throw new Error("허용되지 않은 git 인자: -C <repo> 형태가 아니다");
  const [sub, ...tail] = rest;
  const ok =
    (sub === "rev-parse" &&
      tail.length === 3 &&
      tail[0] === "--verify" &&
      tail[1] === "--quiet" &&
      /^[0-9a-f]{40}\^\{commit\}$/.test(tail[2])) ||
    (sub === "ls-tree" &&
      tail.length === 4 &&
      tail[0] === "-r" &&
      tail[1] === "-l" &&
      tail[2] === "-z" &&
      SHA40.test(tail[3])) ||
    (sub === "cat-file" && tail.length === 2 && tail[0] === "blob" && SHA40.test(tail[1]));
  if (!ok) throw new Error(`허용되지 않은 git 명령: ${String(sub)}`);
}

// ── 실행 ────────────────────────────────────────────────────────

function scrubEnv(env: NodeGitOptions["env"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string" || /^GIT_/i.test(name)) continue;
    out[name] = value;
  }
  out.GIT_OPTIONAL_LOCKS = "0";
  out.GIT_TERMINAL_PROMPT = "0";
  return out;
}

function defaultRunner(env: Record<string, string>): GitRunner {
  return (args, maxBytes) =>
    new Promise<GitRunResult>((resolve, reject) => {
      execFile(
        "git",
        [...args],
        {
          encoding: "buffer",
          maxBuffer: maxBytes,
          timeout: TIMEOUT_MS,
          killSignal: "SIGKILL",
          env: env as NodeJS.ProcessEnv,
          windowsHide: true,
          shell: false,
        },
        (error, stdout) => {
          const out = new Uint8Array(stdout);
          if (error === null) {
            resolve({ exitCode: 0, stdout: out });
            return;
          }
          const code = (error as { code?: unknown }).code;
          // 숫자 코드는 git이 스스로 비정상 종료한 것이다. 나머지(ENOENT·출력 초과·시간 초과)는 던진다.
          if (typeof code === "number" && !(error as { killed?: boolean }).killed) {
            resolve({ exitCode: code, stdout: out });
          } else {
            reject(new Error(`git 실행 실패: ${typeof code === "string" ? code : error.message}`));
          }
        }
      );
    });
}

// ── ls-tree 파싱 ────────────────────────────────────────────────

function parseLsTree(bytes: Uint8Array): GitTreeEntry[] {
  const entries: GitTreeEntry[] = [];
  let start = 0;
  while (start < bytes.length) {
    const end = bytes.indexOf(0, start);
    if (end === -1) throw new Error("ls-tree 출력이 NUL로 끝나지 않는다(잘렸다)");
    const record = bytes.subarray(start, end);
    start = end + 1;
    const tab = record.indexOf(0x09);
    if (tab === -1) throw new Error("ls-tree 레코드에 탭이 없다");
    const meta = decoder.decode(record.subarray(0, tab)).split(/ +/);
    const path = decoder.decode(record.subarray(tab + 1));
    const [mode, type, blobSha, size] = meta;
    if (meta.length !== 4 || !/^[0-7]{6}$/.test(mode) || !SHA40.test(blobSha)) {
      throw new Error("ls-tree 레코드의 모양을 해석하지 못했다");
    }
    if (type === "commit") {
      entries.push({ path, mode, type, blobSha, size: null });
    } else if (type === "blob") {
      if (!/^\d+$/.test(size)) throw new Error("ls-tree 레코드의 크기를 해석하지 못했다");
      entries.push({ path, mode, type, blobSha, size: Number(size) });
    } else {
      throw new Error(`ls-tree 레코드의 종류를 알 수 없다: ${type}`);
    }
  }
  return entries;
}

// ── 진입점 ──────────────────────────────────────────────────────

export function createNodeGit(options: NodeGitOptions): GitPort {
  const { repoDir } = options;
  if (typeof repoDir !== "string" || repoDir.length === 0 || repoDir.includes("\0")) {
    throw new TypeError("repoDir가 비어 있거나 올바르지 않다");
  }
  if (repoDir.startsWith("-")) throw new TypeError("repoDir는 '-'로 시작할 수 없다");
  const runner = options.runner ?? defaultRunner(scrubEnv(options.env));

  async function run(rest: readonly string[], maxBytes: number): Promise<GitRunResult> {
    const args = ["-C", repoDir, ...rest];
    assertAllowedGitArgs(args, repoDir);
    return runner(args, maxBytes);
  }

  function requireSha(value: string, what: string): void {
    if (!SHA40.test(value)) throw new TypeError(`${what}는 소문자 40자 16진수여야 한다`);
  }

  return {
    async resolveCommit(rev) {
      if (!SHA40.test(rev)) return null; // git을 부르지 않는다
      const result = await run(
        ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`],
        RESOLVE_MAX_BYTES
      );
      if (result.exitCode === 1) return null; // --quiet: 커밋으로 해석되지 않음
      if (result.exitCode !== 0)
        throw new Error(`git rev-parse가 비정상 종료했다(코드 ${result.exitCode})`);
      const out = decoder.decode(result.stdout).trim();
      if (!SHA40.test(out)) throw new Error("git rev-parse 출력이 40자 SHA가 아니다");
      return out;
    },

    async lsTree(commitSha) {
      requireSha(commitSha, "커밋 SHA");
      const result = await run(["ls-tree", "-r", "-l", "-z", commitSha], LS_TREE_MAX_BYTES);
      if (result.exitCode !== 0)
        throw new Error(`git ls-tree가 비정상 종료했다(코드 ${result.exitCode})`);
      return parseLsTree(result.stdout);
    },

    async readBlob(blobSha) {
      requireSha(blobSha, "blob SHA");
      const result = await run(["cat-file", "blob", blobSha], BLOB_MAX_BYTES);
      if (result.exitCode !== 0)
        throw new Error(`git cat-file이 비정상 종료했다(코드 ${result.exitCode})`);
      return result.stdout;
    },
  };
}
