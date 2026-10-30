// lsp-rules-reinterpret.ts 의 파일 입출력 래퍼. 인자로 받은 경로의 파일 둘을 읽고 하나를 쓸 뿐이다(Semgrep 과 무관, 네트워크·프로세스 실행 없음).
// 관리자 진입점(Test-LspRulesObservation.ps1)이 tsx 로 부른다.
import { readFileSync, writeFileSync } from "node:fs";
import { runRulesReinterpretCli } from "./lsp-rules-reinterpret";

const { exitCode, message } = runRulesReinterpretCli(process.argv.slice(2), {
  read: (path) => readFileSync(path, "utf8"),
  write: (path, text) => writeFileSync(path, text, "utf8"),
});
process.stdout.write(`${message}\n`);
process.exitCode = exitCode;
