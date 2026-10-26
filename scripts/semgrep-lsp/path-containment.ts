// 증거 실행 폴더가 서버 트리와 같거나 그 안에 있는지 — **실제 파일 접근과 같은 경로 의미**로 판단한다.
//
// 서버 트리(target은 스캔 트리, control은 대조 트리)는 잠금을 쥔 실행만 바꿀 수 있고 E에 해당하는 파일만 담아야 한다. 증거를 그 안에
// 쓰면 잠금이 없는 실행도 남의 트리를 바꾸게 된다. 문자열 비교는 `<base>/outside/../tree/evidence`와 `<base>/alias/evidence`
// (alias → tree)를 놓치므로, 두 경로를 FsPort.physicalKey로 풀어(링크·junction·`..`는 포트의 접근 의미대로) 키끼리 비교한다.
//
// 이 파일은 순수하다(타입만 가져온다). 경로를 푸는 일은 포트가 한다 — 실제 파일 시스템은 공유 실행 잠금과 같은 해석(canonicalTreePath),
// 메모리 파일 시스템은 자기 의미(사전식)다. 호출자가 "겹치지 않는다"고 주장하는 입력은 없다: 항상 쓰기에 쓸 그 포트로 확인한다.
//
// 범위: 확인한 **뒤** 다른 프로세스가 경로를 링크로 바꾸는 것(검사와 쓰기 사이의 틈)은 막지 않는다. 실행 전부터 고정된 경로의 실제
// 포함 관계를 놓치지 않는 것이 이 모듈의 몫이다.
//
// 공개 API:
//   keyIsSameOrInside(key, rootKey): boolean
//   evidenceInsideServerTree(fs, evidenceDir, serverTree): Promise<boolean>   풀 수 없으면 던진다

import type { FsPort } from "./types";

/** physicalKey가 돌려준 key가 rootKey와 같거나 그 안인가. `a/tree`는 `a/tree-evidence`를 포함하지 않는다. */
export function keyIsSameOrInside(key: string, rootKey: string): boolean {
  if (key === rootKey) return true;
  const prefix = rootKey.endsWith("/") ? rootKey : `${rootKey}/`;
  return key.startsWith(prefix);
}

/**
 * 증거 실행 폴더(evidenceDir)가 서버 트리(serverTree)와 같거나 그 안인가. 둘 다 fs가 실제로 접근할 자리로 풀어 비교한다. 읽기만
 * 하며(아무것도 만들지 않는다) 안전하게 풀 수 없는 경로(끊어진 링크 등)이면 던진다 — 호출자는 쓰기 전에 거절해야 한다.
 */
export async function evidenceInsideServerTree(
  fs: Pick<FsPort, "physicalKey">,
  evidenceDir: string,
  serverTree: string
): Promise<boolean> {
  const [evidenceKey, treeKey] = await Promise.all([
    fs.physicalKey(evidenceDir),
    fs.physicalKey(serverTree),
  ]);
  return keyIsSameOrInside(evidenceKey, treeKey);
}
