// 공유 실행 잠금의 실제 파일 시스템 어댑터(RunLockPort). 로직은 run-lock.ts에 있고 여기는 파일 시스템과 운영체제만 만진다.
//
// 잠금 범위와 경로 정규화(이 규칙이 "같은 트리"의 정의다):
//  1. 트리 경로를 절대 경로로 만든다(상대 경로는 현재 작업 폴더 기준). **`..`·`.`는 정리하지 않는다.** 심볼릭 링크를 따라간
//     뒤의 `..`는 링크 대상의 부모를 가리키므로(POSIX), 링크를 풀기 전에 `..`로 앞 칸을 지우면 실제 접근과 다른 트리가 된다.
//  2. **원문 경로의 존재하는 가장 긴 접두**를 운영체제 realpath로 푼다(심볼릭 링크·junction·Windows 8.3 짧은 이름·대소문자
//     표기, 그리고 `..` — 해석 규칙은 운영체제가 정한다. Windows는 `..`를 먼저 지우고 POSIX는 링크를 푼 뒤 적용한다). 접두
//     뒤의 아직 없는 나머지 칸에는 링크가 있을 수 없으므로 그 안의 `.`·`..`만 사전식으로 접어 붙인다. 트리가 아직 없어도 부모가
//     같으면 같은 키가 된다. 안전하게 풀 수 없는 경로는 풀지 않고 거절한다: 끊어진 링크(대상이 없는 심볼릭 링크·junction)와, 파일
//     뒤에서 `..`로 올라가야 하는 경로다 — 잠금 키는 한 자리를 가리키는데 쓰기는 다른 자리에 닿는 상태를 만들지 않기 위해서다.
//  3. 구분자를 `/`로 통일하고 끝의 `/`를 떼고 유니코드 NFC로 맞춘다.
//  4. 대소문자를 구분하지 않는 플랫폼(win32·darwin)은 소문자로 접는다. 접어서 같아지는 서로 다른 폴더는 같은 잠금을 쓰게 된다
//     (과도하게 막는 쪽이며 안전하다). 리눅스는 접지 않는다.
//  5. 키 = sha256("semgrep-lsp-tree-lock/1\n" + 정규화한 경로). 잠금 파일 = **트리의 부모 폴더**의
//     `semgrep-lsp-tree-<키 앞 32자>.lock`. runId·evidenceRoot·mode와 무관하게 경로만으로 정해지므로 어느 증거 폴더에서
//     온 실행이든 같은 파일을 두고 부딪힌다. 트리 안에는 아무것도 만들지 않는다(스캔 트리는 E에 해당하는 파일만 담는다).
//
// 한계(문서화된 범위): 서로 겹치는 트리(한쪽이 다른 쪽의 하위 폴더)는 막지 않는다. 경로를 푼 뒤에 일어나는 변경(잠금을 얻은
// 다음에 누가 경로의 폴더를 링크로 바꾸는 것)은 막지 않는다. 획득은 로컬 파일 시스템의 배타 생성(O_EXCL)에 기대므로, 배타 생성을
// 보장하지 않는 파일 시스템(일부 네트워크 공유)에서는 상호 배제를 보증하지 않는다. 검증한 플랫폼은 README에 있다.
//
// 이 파일은 node: 모듈만 가져오고 타입만 프로젝트 모듈에서 가져온다(자식 프로세스 경쟁 시험이 Node로 직접 실행한다).

import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, readlink, realpath, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, parse, sep } from "node:path";
import type { RunLockPort, TreeResolution } from "./run-lock";

const KEY_DOMAIN = "semgrep-lsp-tree-lock/1\n";
const FILE_PREFIX = "semgrep-lsp-tree-";

/**
 * 경로 해석에 쓰는 운영체제 기능. 기본은 node:fs/promises의 realpath·readlink다. 시험이 POSIX 의미(링크를 푼 뒤의 `..`는 대상의
 * 부모)를 메모리 표로 모의하려고 바꿀 수 있다 — Windows에서는 운영체제가 `..`를 먼저 지워서 실제 디스크로 시험할 수 없기 때문이다.
 */
export interface PathOps {
  realpath(path: string): Promise<string>;
  readlink(path: string): Promise<string>;
}

const nodePathOps: PathOps = {
  realpath: (path) => realpath(path),
  readlink: (path) => readlink(path),
};

export interface NodeRunLockOptions {
  /** 대소문자를 구분하지 않는 플랫폼인가. 기본은 win32·darwin. 시험이 두 경우를 모두 확인하려고 바꿀 수 있다. */
  caseInsensitive?: boolean;
  /** 경로 해석 기능. 기본은 운영체제(node:fs/promises). 시험 전용 주입점이다. */
  pathOps?: PathOps;
}

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/** 안전하게 풀 수 없는 경로. 코드는 증거 출력의 error_code로 나가므로 짧은 대문자 토큰이다. */
function unresolvable(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const SEPARATORS = sep === "\\" ? /[\\/]+/ : /\/+/;

/** 절대 경로로 만들되 `..`·`.`는 정리하지 않는다(path.resolve는 링크를 풀기 전에 `..`로 앞 칸을 지운다). */
function absoluteKeepingDots(treePath: string): string {
  if (sep === "\\" && /^[A-Za-z]:(?![\\/])/.test(treePath)) {
    throw unresolvable("DRIVE_RELATIVE", "드라이브 상대 경로는 해석하지 않는다");
  }
  return isAbsolute(treePath) ? treePath : `${process.cwd()}${sep}${treePath}`;
}

/**
 * 존재하는 접두 뒤의 아직 없는 칸들을 정리해 돌려준다. 이 칸들 자체에는 링크가 있을 수 없다. 그러나 `..`를 접으면 접힌 경로에
 * **이미 존재하는 칸**(링크일 수 있다)이 다시 나타날 수 있다 — `a/n1/../dl/x`에서 n1이 없고 dl이 링크이면, 쓰기(mkdir -p)는 n1을
 * 만든 뒤 `..`로 a로 돌아와 dl 링크를 따라간다. 그래서 `..`를 접었으면 folded를 알리고, 호출자가 접힌 경로(이제 `..`가 없다)를
 * 운영체제에 한 번 더 푼다. 첫 칸이 끊어진 링크이면(realpath는 실패하지만 링크 자체는 있다) 쓰기가 링크 대상에 닿으므로 풀지 않는다.
 */
async function missingTail(
  real: string,
  rest: readonly string[],
  ops: PathOps
): Promise<{ tail: string[]; folded: boolean }> {
  if (rest.length === 0) return { tail: [], folded: false };
  const first = rest[0];
  if (first !== "." && first !== "..") {
    let isLink = true;
    try {
      await ops.readlink(join(real, first));
    } catch (error) {
      const code = codeOf(error);
      if (code !== "ENOENT" && code !== "ENOTDIR" && code !== "EINVAL") throw error;
      isLink = false;
    }
    if (isLink)
      throw unresolvable(
        "DANGLING_LINK",
        "끊어진 링크(대상이 없는 심볼릭 링크·junction)는 잠그지 않는다"
      );
  }
  const stack: string[] = [];
  let folded = false;
  for (const name of rest) {
    if (name === ".") continue;
    if (name === "..") {
      if (stack.length === 0) {
        throw unresolvable(
          "UNRESOLVABLE_DOTDOT",
          "존재하는 폴더가 아닌 곳에서 `..`로 올라가는 경로는 풀 수 없다"
        );
      }
      stack.pop();
      folded = true;
    } else stack.push(name);
  }
  return { tail: stack, folded };
}

/**
 * 잠금 대상의 정규 경로. **원문 경로의 존재하는 가장 긴 접두**를 운영체제 realpath로 풀고(`..`도 운영체제의 규칙대로 풀린다),
 * 없는 나머지는 missingTail로 붙인다. 대소문자는 접지 않는다. 풀 수 없으면 던진다(잠금을 얻지 않는다).
 */
export async function canonicalTreePath(
  treePath: string,
  ops: PathOps = nodePathOps
): Promise<string> {
  const absolute = absoluteKeepingDots(treePath);
  const { root } = parse(absolute);
  const names = absolute
    .slice(root.length)
    .split(SEPARATORS)
    .filter((name) => name !== "");
  for (let count = names.length; ; count -= 1) {
    let real: string;
    try {
      real = await ops.realpath(root + names.slice(0, count).join(sep));
    } catch (error) {
      const code = codeOf(error);
      if ((code !== "ENOENT" && code !== "ENOTDIR") || count === 0) throw error;
      continue;
    }
    const { tail, folded } = await missingTail(real, names.slice(count), ops);
    const joined = join(real, ...tail);
    // 접힌 경로에는 `..`가 없으므로 이 재귀는 한 번에 끝난다.
    return folded ? canonicalTreePath(joined, ops) : joined;
  }
}

/** 이 플랫폼의 파일 시스템이 대소문자를 구분하지 않는다고 보는가(win32·darwin). 잠금 키와 경로 겹침 판정이 같은 기준을 쓴다. */
export function platformCaseInsensitive(): boolean {
  return process.platform === "win32" || process.platform === "darwin";
}

/** 정규화한 경로 → 비교 키(구분자 통일, 끝의 `/` 제거, NFC, 필요하면 소문자). */
export function treeKeyOf(canonical: string, caseInsensitive: boolean): string {
  let key = sep === "\\" ? canonical.replace(/\\/g, "/") : canonical;
  if (key.length > 1) key = key.replace(/\/+$/, "");
  key = key.normalize("NFC");
  return caseInsensitive ? key.toLowerCase() : key;
}

export function createNodeRunLockPort(options: NodeRunLockOptions = {}): RunLockPort {
  const caseInsensitive = options.caseInsensitive ?? platformCaseInsensitive();
  const pathOps = options.pathOps ?? nodePathOps;
  return {
    async resolveTree(treePath): Promise<TreeResolution> {
      const canonical = await canonicalTreePath(treePath, pathOps);
      const parent = dirname(canonical);
      if (parent === canonical) throw new Error("루트 폴더는 트리로 잠글 수 없다");
      const keySha256 = createHash("sha256")
        .update(KEY_DOMAIN + treeKeyOf(canonical, caseInsensitive), "utf8")
        .digest("hex");
      return { keySha256, lockPath: join(parent, `${FILE_PREFIX}${keySha256.slice(0, 32)}.lock`) };
    },

    newToken: () => randomBytes(16).toString("hex"),

    identity: () => ({ pid: process.pid, hostname: hostname(), nowIso: new Date().toISOString() }),

    async createExclusive(path, text) {
      await mkdir(dirname(path), { recursive: true });
      let handle: Awaited<ReturnType<typeof open>>;
      try {
        handle = await open(path, "wx", 0o600); // O_CREAT | O_EXCL: 있으면 실패한다(프로세스 사이에서 원자적)
      } catch (error) {
        if (codeOf(error) === "EEXIST") return "EXISTS";
        throw error;
      }
      try {
        await handle.writeFile(text, "utf8");
        await handle.sync();
      } catch (error) {
        // 방금 우리가 만든 파일이다(배타 생성에 성공했다). 내용을 쓰다 실패했으면 만들다 만 잠금을 남기지 않는다.
        await handle.close().catch(() => undefined);
        await unlink(path).catch(() => undefined);
        throw error;
      }
      await handle.close();
      return "CREATED";
    },

    async read(path) {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        if (codeOf(error) === "ENOENT") return null;
        throw error;
      }
    },

    async remove(path) {
      try {
        await unlink(path);
        return true;
      } catch (error) {
        if (codeOf(error) === "ENOENT") return false;
        throw error;
      }
    },
  };
}
