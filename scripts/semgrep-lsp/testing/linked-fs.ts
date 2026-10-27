// 시험 지원: 링크(심볼릭 링크·junction)를 가진 파일 시스템을 메모리 위에서 모사한다. 링크 이름 아래의 모든 접근(읽기·쓰기·폴더 만들기·
// 존재 확인·나열·physicalKey)이 대상 자리로 옮겨진다 — 실제 파일 시스템이 링크를 따라가는 것과 같은 방향이다. 실제 디스크의 동작이 아니라
// 그 의미를 가정한 모형이므로, 실제 링크로 확인한 시험과 구분해 보고한다.
//
// 공개 API:
//   linkedFs(memory, links): LinkedFs   links: 링크 경로 → 대상 경로. reached는 쓰기·폴더 만들기가 실제로 닿은(링크를 푼) 자리 목록

import type { FsPort } from "../types";
import { normalizePath, type MemoryFs } from "./memory-fs";

export interface LinkedFs extends FsPort {
  /** 쓰기·폴더 만들기가 닿은 자리(링크를 푼 뒤). 거절 전에는 비어 있어야 한다. */
  reached: string[];
}

export function linkedFs(memory: MemoryFs, links: Readonly<Record<string, string>>): LinkedFs {
  const entries = Object.entries(links).map(
    ([from, to]) => [normalizePath(from), normalizePath(to)] as const
  );
  const resolve = (path: string): string => {
    let current = normalizePath(path);
    for (let hop = 0; hop < 8; hop++) {
      const hit = entries.find(([from]) => current === from || current.startsWith(`${from}/`));
      if (hit === undefined) break;
      current = normalizePath(`${hit[1]}${current.slice(hit[0].length)}`);
    }
    return current;
  };
  const reached: string[] = [];
  return {
    reached,
    readFile: (path) => memory.readFile(resolve(path)),
    writeFileExclusive: async (path, data) => {
      const target = resolve(path);
      reached.push(target);
      return memory.writeFileExclusive(target, data);
    },
    mkdirp: async (path) => {
      const target = resolve(path);
      reached.push(target);
      return memory.mkdirp(target);
    },
    listFilesRecursive: (root) => memory.listFilesRecursive(resolve(root)),
    exists: (path) => memory.exists(resolve(path)),
    physicalKey: (path) => memory.physicalKey(resolve(path)),
  };
}
