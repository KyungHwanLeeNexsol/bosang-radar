// 시험용 자식 프로세스(별도 Node 프로세스): 공유 실행 잠금을 얻으려고 경쟁한다. 실제 Semgrep이 아니며, 하는 일은 파일을 읽고
// 쓰는 것뿐이다(네트워크·다른 프로세스 실행 없음). 운영 코드(run-lock.ts·run-lock-node.ts)를 그대로 import해서 쓴다 — Node가
// 타입을 걷어내고 직접 실행한다(두 파일은 node: 모듈과 타입만 가져온다).
//
// 사용: node --no-warnings lock-child.mjs <base64(JSON 설정)>
// 설정 필드:
//   tree        잠글 트리 경로(표기는 부모 시험이 정한다)       runId / mode   소유자 문서에 들어갈 값
//   readyFile   시작 준비가 되면 만드는 파일                     goFile         이 파일이 생길 때까지 기다린다(출발 신호)
//   resultFile  획득 시도 결과를 쓰는 파일(원자적 게시)           releaseFile    획득했다면 이 파일이 생길 때까지 쥐고 있는다
//   releasedFile  해제 결과를 쓰는 파일                          crashAfterAcquire  true면 획득 직후 해제 없이 종료한다
//   watchdogMs  이 시간이 지나면 스스로 끝낸다(기본 20초)
//
// 안전장치: 무슨 일이 있어도 watchdogMs 안에 스스로 끝난다.

import { access, rename, writeFile } from "node:fs/promises";
import { acquireRunLock, releaseRunLock } from "../run-lock.ts";
import { createNodeRunLockPort } from "../run-lock-node.ts";

const config = JSON.parse(Buffer.from(process.argv[2], "base64").toString("utf8"));
const watchdog = setTimeout(() => process.exit(99), config.watchdogMs ?? 20_000);

const exists = (path) =>
  access(path).then(
    () => true,
    () => false
  );
const waitFor = async (path) => {
  while (!(await exists(path))) await new Promise((resolve) => setTimeout(resolve, 5));
};
/** 읽는 쪽이 만들다 만 파일을 보지 않도록 임시 파일에 쓴 뒤 이름을 바꿔 게시한다. */
const publish = async (path, value) => {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, path);
};

await writeFile(config.readyFile, "ready");
await waitFor(config.goFile); // 모든 자식이 같은 순간에 출발하도록 하는 장벽

const port = createNodeRunLockPort();
const outcome = await acquireRunLock(port, {
  treePath: config.tree,
  runId: config.runId,
  mode: config.mode,
});
await publish(config.resultFile, {
  pid: process.pid,
  runId: config.runId,
  state: outcome.state,
  reason: outcome.state === "ACQUIRED" ? null : outcome.reason,
  holder: outcome.state === "REFUSED" ? outcome.holder : null,
  keySha256: outcome.keySha256,
  lockPath: outcome.state === "ACQUIRED" ? outcome.handle.lockPath : (outcome.lockPath ?? null),
  token: outcome.state === "ACQUIRED" ? outcome.handle.token : null,
});

if (outcome.state === "ACQUIRED") {
  if (config.crashAfterAcquire) process.exit(0); // 해제 없이 끝난다 — 잠금이 남는다
  await waitFor(config.releaseFile);
  await publish(config.releasedFile, await releaseRunLock(port, outcome.handle));
}
clearTimeout(watchdog);
