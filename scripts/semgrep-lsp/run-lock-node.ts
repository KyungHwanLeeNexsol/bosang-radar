// 공유 실행 잠금의 실제 파일 시스템 어댑터(RunLockPort). 로직은 run-lock.ts에 있고 여기는 파일 시스템과 운영체제만 만진다.
//
// 잠금 범위와 경로 정규화(이 규칙이 "같은 트리"의 정의다):
//  1. 트리 경로를 절대 경로로 만든다(`..`·중복 구분자·상대 경로 정리, 기준은 현재 작업 폴더).
//  2. **존재하는 가장 긴 접두**를 realpath로 푼다(심볼릭 링크·junction·Windows 8.3 짧은 이름·대소문자 표기). 아직 없는
//     나머지 세그먼트는 정리한 그대로 붙인다. 트리가 아직 없어도 부모가 같으면 같은 키가 된다.
//  3. 구분자를 `/`로 통일하고 끝의 `/`를 떼고 유니코드 NFC로 맞춘다.
//  4. 대소문자를 구분하지 않는 플랫폼(win32·darwin)은 소문자로 접는다. 접어서 같아지는 서로 다른 폴더는 같은 잠금을 쓰게 된다
//     (과도하게 막는 쪽이며 안전하다). 리눅스는 접지 않는다.
//  5. 키 = sha256("semgrep-lsp-tree-lock/1\n" + 정규화한 경로). 잠금 파일 = **트리의 부모 폴더**의
//     `semgrep-lsp-tree-<키 앞 32자>.lock`. runId·evidenceRoot·mode와 무관하게 경로만으로 정해지므로 어느 증거 폴더에서
//     온 실행이든 같은 파일을 두고 부딪힌다. 트리 안에는 아무것도 만들지 않는다(스캔 트리는 E에 해당하는 파일만 담는다).
//
// 한계(문서화된 범위): 서로 겹치는 트리(한쪽이 다른 쪽의 하위 폴더)는 막지 않는다. 아직 없는 폴더를 통한 심볼릭 링크 별칭은
// 풀 수 없다. 획득은 로컬 파일 시스템의 배타 생성(O_EXCL)에 기대므로, 배타 생성을 보장하지 않는 파일 시스템(일부 네트워크
// 공유)에서는 상호 배제를 보증하지 않는다. 검증한 플랫폼은 README에 있다.
//
// 이 파일은 node: 모듈만 가져오고 타입만 프로젝트 모듈에서 가져온다(자식 프로세스 경쟁 시험이 Node로 직접 실행한다).

import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { RunLockPort, TreeResolution } from "./run-lock";

const KEY_DOMAIN = "semgrep-lsp-tree-lock/1\n";
const FILE_PREFIX = "semgrep-lsp-tree-";

export interface NodeRunLockOptions {
  /** 대소문자를 구분하지 않는 플랫폼인가. 기본은 win32·darwin. 시험이 두 경우를 모두 확인하려고 바꿀 수 있다. */
  caseInsensitive?: boolean;
}

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/** 존재하는 가장 긴 접두를 realpath로 풀고, 없는 나머지는 그대로 붙인다. 대소문자는 접지 않는다. */
export async function canonicalTreePath(treePath: string): Promise<string> {
  const rest: string[] = [];
  let current = resolve(treePath);
  for (;;) {
    try {
      const real = await realpath(current);
      return rest.length === 0 ? real : join(real, ...rest.reverse());
    } catch (error) {
      const code = codeOf(error);
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      rest.push(basename(current));
      current = parent;
    }
  }
}

/** 정규화한 경로 → 비교 키(구분자 통일, 끝의 `/` 제거, NFC, 필요하면 소문자). */
export function treeKeyOf(canonical: string, caseInsensitive: boolean): string {
  let key = sep === "\\" ? canonical.replace(/\\/g, "/") : canonical;
  if (key.length > 1) key = key.replace(/\/+$/, "");
  key = key.normalize("NFC");
  return caseInsensitive ? key.toLowerCase() : key;
}

export function createNodeRunLockPort(options: NodeRunLockOptions = {}): RunLockPort {
  const caseInsensitive =
    options.caseInsensitive ?? (process.platform === "win32" || process.platform === "darwin");
  return {
    async resolveTree(treePath): Promise<TreeResolution> {
      const canonical = await canonicalTreePath(treePath);
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
