// 실제 파일 시스템 어댑터(FsPort). node:fs/promises 위의 얇은 층이며, MemoryFs와 같은 의미를 갖도록 맞춘다.
//
// 공개 API:
//   createNodeFs(): FsPort
//
// 의미(MemoryFs와의 일치점 — fs-node.test.ts의 대응표가 확인한다):
//  · writeFileExclusive: 이미 있으면(파일·디렉터리·깨진 심볼릭 링크 포함) 거부한다. 덮어쓰지 않는다.
//    플래그 'wx'(O_EXCL)를 쓰고, 부모 폴더가 없으면 만든다(MemoryFs가 부모를 암묵적으로 만드는 것과 같다).
//  · listFilesRecursive: root 기준 상대 경로('/' 구분), 점 파일 포함, 파일만, UTF-8 바이트순 오름차순.
//    root가 없거나 파일이면 빈 목록이다(MemoryFs와 같다).
//  · exists: 파일이든 디렉터리든 있으면 true. 심볼릭 링크는 따라가지 않고 링크 자체를 본다(깨진 링크도 "있다").
//
// 심볼릭 링크 정책(fail-closed): listFilesRecursive는 심볼릭 링크(Windows의 junction 포함)나 일반 파일·
// 디렉터리가 아닌 항목(소켓·FIFO 등)을 만나면 조용히 건너뛰지도, 따라가지도 않고 오류로 거부한다.
// 링크를 따라가면 트리 밖의 내용이 스캔 대상에 섞이고, 건너뛰면 해시된 목록이 실제 트리와 어긋난다.

import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FsPort } from "./types";

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

async function walk(dir: string, prefix: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`심볼릭 링크는 따라가지도 건너뛰지도 않는다(거부): ${rel}`);
    }
    if (entry.isDirectory()) {
      await walk(`${dir}/${entry.name}`, rel, out);
    } else if (entry.isFile()) {
      out.push(rel);
    } else {
      throw new Error(`일반 파일도 디렉터리도 아닌 항목이라 거부한다: ${rel}`);
    }
  }
}

export function createNodeFs(): FsPort {
  return {
    async readFile(path) {
      // Buffer 대신 순수 Uint8Array 사본을 돌려준다(MemoryFs와 같은 타입, 풀 메모리를 공유하지 않는다).
      return new Uint8Array(await readFile(path));
    },

    async writeFileExclusive(path, data) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data, { flag: "wx" });
    },

    async mkdirp(path) {
      await mkdir(path, { recursive: true });
    },

    async listFilesRecursive(root) {
      let top;
      try {
        top = await lstat(root);
      } catch (error) {
        const code = codeOf(error);
        if (code === "ENOENT" || code === "ENOTDIR") return [];
        throw error;
      }
      if (top.isSymbolicLink()) {
        throw new Error(`루트가 심볼릭 링크라 거부한다: ${root}`);
      }
      if (!top.isDirectory()) return [];
      const out: string[] = [];
      await walk(root.replace(/[\\/]+$/, "") || root, "", out);
      return out.sort(compareBytes);
    },

    async exists(path) {
      try {
        await lstat(path);
        return true;
      } catch (error) {
        const code = codeOf(error);
        if (code === "ENOENT" || code === "ENOTDIR") return false;
        throw error;
      }
    },
  };
}
