// lsp-scan-reinterpret.ts 의 파일 입출력 래퍼. 인자로 받은 경로의 파일 둘(또는 .bin 둘 더)을 읽고 하나를 쓸 뿐이다(Semgrep 과 무관, 네트워크·프로세스 실행 없음).
// 관리자 진입점(Test-LspScanObservation.ps1)이 tsx 로 부른다. cli.ts 의 기본 경로·어떤 게이트에도 이어지지 않는 독립 래퍼다.
import { readFileSync, writeFileSync } from "node:fs";
import { runScanReinterpretCli } from "./lsp-scan-reinterpret";

const { exitCode, message } = runScanReinterpretCli(process.argv.slice(2), {
  read: (path) => readFileSync(path, "utf8"),
  readBytes: (path) => new Uint8Array(readFileSync(path)),
  write: (path, text) => writeFileSync(path, text, "utf8"),
});
process.stdout.write(`${message}\n`);
process.exitCode = exitCode;
