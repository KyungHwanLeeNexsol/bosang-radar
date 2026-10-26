// 시험 전용 FsPort: realRoot 아래의 경로는 real로, 그 밖은 base로 보낸다. 일부 트리(서버가 스캔하는 트리)만 실제 디스크에 두고
// 나머지(고정 입력·증거·규칙 캐시)는 메모리에 두려고 쓴다. 구분자는 '/'로 통일해 비교한다(대소문자는 구분한다).

import type { FsPort } from "../types";

export function routedFs(base: FsPort, real: FsPort, realRoot: string): FsPort {
  const root = realRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const pick = (path: string): FsPort => {
    const unified = path.replace(/\\/g, "/");
    return unified === root || unified.startsWith(`${root}/`) ? real : base;
  };
  return {
    readFile: (path) => pick(path).readFile(path),
    writeFileExclusive: (path, data) => pick(path).writeFileExclusive(path, data),
    mkdirp: (path) => pick(path).mkdirp(path),
    listFilesRecursive: (path) => pick(path).listFilesRecursive(path),
    exists: (path) => pick(path).exists(path),
  };
}
