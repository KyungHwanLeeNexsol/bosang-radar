// 시험 전용: LSP-MIN-1 실행기를 실제 프로세스·실제 파이프·실제 폴더로 확인하기 위한 무해한 Node 스텁 서버. 실제 Semgrep이 아니다.
//
// 이 스크립트는 `semgrep.exe`로 이름만 바꿔 복사한 node 실행 파일이 `lsp --debug` 인자로 불렀을 때 실행되도록, 작업 폴더(cwd)에 확장자 없는
// 파일 `lsp`로 복사돼 쓰인다(node가 첫 인자 `lsp`를 스크립트 파일 이름으로 읽는다). 시나리오는 cwd의 scenario.json이 정한다.
// 하는 일은 cwd와 홈 폴더 안의 파일 쓰기(받은 메서드 기록, pid, 환경 이름)와 stdio 입출력뿐이다. 네트워크·다른 프로세스 실행은 없다.
// 어떤 경우에도 lifetimeMs(기본 20초) 뒤에는 스스로 끝난다 — 시험이 실패해도 고아 프로세스를 오래 남기지 않는다.

import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cfg = JSON.parse(readFileSync("scenario.json", "utf8"));
const profile = process.env.USERPROFILE ?? null;
let homeIsDir = false;
try {
  homeIsDir = profile !== null && statSync(profile).isDirectory();
} catch {
  homeIsDir = false;
}
writeFileSync("pid.txt", String(process.pid));
writeFileSync(
  "env.json",
  JSON.stringify({
    names: Object.keys(process.env).sort(),
    // 요청이 정한 다섯 값이 그대로 도착했는지 보려고 값을 남긴다(홈 폴더 자체 말고는 부모의 값이 아니다).
    values: Object.fromEntries(
      ["PATH", "SYSTEMROOT", "TEMP", "TMP", "SEMGREP_APP_URL", "SEMGREP_LOG_FILE"].map((n) => [
        n,
        process.env[n] ?? null,
      ])
    ),
    userprofile: profile,
    homeIsDir,
    cwd: process.cwd(),
    args: process.argv.slice(2),
  })
);

function send(object) {
  const body = Buffer.from(JSON.stringify(object), "utf8");
  process.stdout.write(
    Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "latin1"), body])
  );
}

const GOOD = {
  capabilities: { textDocumentSync: 1 },
  serverInfo: { name: "Semgrep", version: "9.9.9" },
};

function onInitialize(message) {
  if (cfg.init === "silent") return;
  if (cfg.init === "error") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32602, message: "stub invalid params" },
    });
  } else if (cfg.init === "initialize-error") {
    send({
      jsonrpc: "2.0",
      method: "window/logMessage",
      params: { type: 1, message: "Error initializing server" },
    });
    send({ jsonrpc: "2.0", id: message.id, result: { retry: false } });
  } else {
    send({ jsonrpc: "2.0", id: message.id, result: GOOD });
  }
}

function handle(message) {
  appendFileSync("received.log", `${message.method}\n`);
  if (message.method === "initialize") return onInitialize(message);
  if (message.method === "shutdown") {
    // 실제 서버는 shutdown에 응답하지 않고 홈 아래에 지문 파일을 쓴다(계획 O9).
    if (cfg.writeFingerprint && profile !== null) {
      const dir = join(profile, ".semgrep", "cache", "fingerprinted_ignored_findings");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "ws.txt"), "");
    }
    return;
  }
  if (message.method === "exit" && !cfg.ignoreExit) process.exit(0);
}

let buffer = Buffer.alloc(0);
function drain() {
  for (;;) {
    const end = buffer.indexOf("\r\n\r\n");
    if (end < 0) return;
    const header = /Content-Length: (\d+)/i.exec(buffer.subarray(0, end).toString("latin1"));
    const length = Number(header?.[1] ?? 0);
    if (buffer.length < end + 4 + length) return;
    const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString("utf8"));
    buffer = buffer.subarray(end + 4 + length);
    handle(message);
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});
process.stdin.on("end", () => {
  appendFileSync("received.log", "<stdin-end>\n");
  if (!cfg.ignoreEof) process.exit(0);
});
process.stdin.on("error", () => {});

for (const item of cfg.stderrAt ?? []) {
  setTimeout(() => process.stderr.write(item.text), item.atMs);
}
if (typeof cfg.writeWsAtMs === "number") {
  setTimeout(() => writeFileSync(join("..", "ws", "x.txt"), "x"), cfg.writeWsAtMs);
}
if (cfg.ignoreEof) setInterval(() => {}, 1000); // EOF를 받아도 살아 있는(죽지 않는) 서버
setTimeout(() => process.exit(0), cfg.lifetimeMs ?? 20000);
