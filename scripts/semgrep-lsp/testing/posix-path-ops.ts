// 시험 전용: POSIX 의미의 경로 해석(realpath·readlink)을 메모리 표로 흉내 낸다.
//
// 모의하는 규칙은 하나다: **심볼릭 링크를 따라간 뒤의 `..`는 링크 대상의 부모를 가리킨다**(링크가 있던 폴더가 아니다). Linux·macOS의
// 커널이 이렇게 경로를 푼다. Windows는 운영체제가 `..`를 먼저 지우므로(경로 정규화) 이 컴퓨터의 실제 디스크로는 이 규칙을 시험할
// 수 없어서 쓴다.
//
// 이것은 **실제 Linux·macOS 디스크의 증거가 아니다.** 경로 해석 코드가 운영체제에 해석을 맡기는 방식이 맞는지, 즉 `..`를 링크보다
// 먼저 지우지 않는지만 확인한다. 실제 디스크 확인은 해당 운영체제에서 run-lock-node.test.ts를 돌려야 한다.
//
// 경로는 '/' 구분 절대 경로로 적는다. 들어오는 경로의 '\\'와 드라이브 접두(`C:`)는 무시한다 — Windows에서 돌아도 같은 표를 쓰게 하려는
// 것이다. 표에 적은 폴더의 상위 폴더는 자동으로 폴더가 된다.

import type { PathOps } from "../run-lock-node";

export interface PosixTable {
  /** 폴더들(상위 폴더는 자동으로 포함된다). */
  dirs: readonly string[];
  /** 일반 파일들. */
  files?: readonly string[];
  /** 링크 경로 → 대상. 대상은 절대 경로이거나 링크가 있는 폴더 기준 상대 경로다. */
  links?: Readonly<Record<string, string>>;
}

const MAX_HOPS = 40;

function unify(path: string): string {
  return path.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
}

function fail(code: string): never {
  throw Object.assign(new Error(`${code}: 모의 POSIX 경로 해석`), { code });
}

function ancestors(path: string): string[] {
  const parts = unify(path).split("/").filter(Boolean);
  return parts.map((_name, i) => `/${parts.slice(0, i + 1).join("/")}`);
}

export function createPosixPathOps(table: PosixTable): PathOps {
  const dirs = new Set<string>();
  const files = new Set<string>();
  const links = new Map<string, string>();
  for (const dir of table.dirs) for (const a of ancestors(dir)) dirs.add(a);
  for (const file of table.files ?? []) {
    const all = ancestors(file);
    all.slice(0, -1).forEach((a) => dirs.add(a));
    files.add(all[all.length - 1]);
  }
  for (const [link, target] of Object.entries(table.links ?? {})) {
    const all = ancestors(link);
    all.slice(0, -1).forEach((a) => dirs.add(a));
    links.set(all[all.length - 1], unify(target));
  }

  const kindOf = (path: string): "link" | "dir" | "file" | "none" =>
    links.has(path) ? "link" : dirs.has(path) ? "dir" : files.has(path) ? "file" : "none";

  return {
    async realpath(input) {
      const queue = unify(input).split("/").filter(Boolean);
      let stack: string[] = [];
      let hops = 0;
      while (queue.length > 0) {
        const name = queue.shift() as string;
        if (name === ".") continue;
        // 아래로 내려가거나 `..`로 올라가려면 지금까지 푼 물리 경로가 폴더여야 한다.
        const here = stack.length === 0 ? "" : `/${stack.join("/")}`;
        if (here !== "") {
          const kind = kindOf(here);
          if (kind !== "dir") fail(kind === "none" ? "ENOENT" : "ENOTDIR");
        }
        if (name === "..") {
          stack.pop();
          continue;
        }
        const candidate = `${here}/${name}`;
        const kind = kindOf(candidate);
        if (kind === "link") {
          hops += 1;
          if (hops > MAX_HOPS) fail("ELOOP");
          const target = links.get(candidate) as string;
          if (target.startsWith("/")) stack = [];
          queue.unshift(...target.split("/").filter(Boolean));
        } else if (kind === "none") {
          fail("ENOENT");
        } else {
          stack.push(name);
        }
      }
      return `/${stack.join("/")}`;
    },

    async readlink(input) {
      const path = `/${unify(input).split("/").filter(Boolean).join("/")}`;
      const target = links.get(path);
      if (target !== undefined) return target;
      return fail(kindOf(path) === "none" ? "ENOENT" : "EINVAL");
    },
  };
}
