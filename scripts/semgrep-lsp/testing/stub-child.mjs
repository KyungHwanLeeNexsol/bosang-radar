// 시험용 LSP 스텁 자식 프로세스(별도 Node 프로세스). 실제 Semgrep이 아니다 — 아무것도 분석하지 않고 스크립트가 시킨
// 대로 Content-Length 프레임 JSON-RPC를 stdio로 주고받을 뿐이다. 이 파일은 저장소의 다른 모듈을 import하지 않는다.
// stderr 로그 줄은 README 표의 *소스 문자열*이며 실제 stderr가 이 모양이라는 증거가 아니다(ADR U3).
//
// 사용: node stub-child.mjs <base64(JSON 스크립트)>
// 스크립트 필드(모두 선택):
//   serverVersion      initialize 결과의 serverInfo.version (null/생략이면 serverInfo 없음)
//   loadingPaths       loading local config 쌍을 낼 경로 목록
//   gotErrors, n, s, k, m, engineErrorsText   로그 줄의 숫자·본문
//   publishes          [{ uri, diagnostics }] — 스캔 때 게시할 진단
//   noBarrier          true면 장벽 줄(`Scanning workspace complete`)을 영원히 보내지 않는다
//   crashAfterInit     true면 initialize 응답을 쓴 직후 비정상 종료(코드 7)
//   ignoreExit         true면 exit 알림과 stdin 닫힘을 무시한다(kill이 필요한 자식)
//   largeStderrBytes   initialize를 받으면 응답 전에 이만큼의 stderr 채움 줄을 쓴다(독립 소비 시험)
//   exitCode           exit 알림 뒤의 종료 코드(기본 0)
//
// 안전장치: 무슨 일이 있어도 WATCHDOG_MS 안에 스스로 끝난다. stdout에는 프로토콜 프레임 외에 아무것도 쓰지 않는다.

const WATCHDOG_MS = 20_000;

const watchdog = setTimeout(() => process.exit(99), WATCHDOG_MS);

function loadScript() {
  try {
    const raw = process.argv[2];
    if (typeof raw !== "string") return {};
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    process.stderr.write("stub-child: 스크립트를 읽지 못했다\n");
    process.exit(2);
  }
}

const script = loadScript();
const publishes = Array.isArray(script.publishes) ? script.publishes : [];
const loadingPaths = Array.isArray(script.loadingPaths) ? script.loadingPaths : [];

function frame(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

function sendStdout(message, callback) {
  process.stdout.write(frame(message), callback);
}

function sendStderr(...lines) {
  process.stderr.write(lines.map((line) => `${line}\n`).join(""));
}

function finish() {
  // 정상 종료: 감시 타이머와 stdin을 풀어 이벤트 루프가 스스로 비도록 한다(남은 출력은 비워진 뒤 끝난다).
  clearTimeout(watchdog);
  process.exitCode = typeof script.exitCode === "number" ? script.exitCode : 0;
  process.stdin.destroy();
}

function onInitialize(message) {
  if (script.largeStderrBytes > 0) {
    const line = `padding-line ${"x".repeat(80)}`;
    const count = Math.ceil(script.largeStderrBytes / (line.length + 1));
    const chunk = Array.from({ length: 256 }, () => line).join("\n") + "\n";
    for (let i = 0; i < count; i += 256) process.stderr.write(chunk);
  }
  const result = { capabilities: {} };
  if (typeof script.serverVersion === "string") {
    result.serverInfo = { name: "Semgrep", version: script.serverVersion };
  }
  sendStdout({ jsonrpc: "2.0", id: message.id, result }, () => {
    if (script.crashAfterInit) process.exit(7);
  });
}

function onInitialized() {
  const lines = ["Refreshing rules"];
  for (const path of loadingPaths) {
    lines.push(`loading local config from ${path}`, `Done loading local config from ${path}`);
  }
  lines.push(
    `Got ${script.gotErrors ?? 0} errors while refreshing rules in language server`,
    "CI disabled, not checking API token",
    "Rules refreshed",
    "Scanning open documents",
    "Scanned open documents"
  );
  sendStderr(...lines);
  sendStdout({ jsonrpc: "2.0", method: "semgrep/rulesRefreshed" });
}

function onScan() {
  sendStderr(
    "Scanning workspace, full: true",
    "Scanning workspace",
    `Running Semgrep with ${script.n ?? 0} rules`,
    `Semgrep errors: ${script.engineErrorsText ?? ""}`.trimEnd(),
    `Semgrep skipped ${script.s ?? 0} rules`,
    `Scanned ${script.k ?? 0} files`,
    `Found ${script.m ?? 0} matches`,
    "Scanned workspace"
  );
  for (const p of publishes) {
    sendStdout({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: p.uri, diagnostics: p.diagnostics ?? [] },
    });
  }
  if (!script.noBarrier) sendStderr("Scanning workspace complete");
}

function handle(message) {
  switch (message.method) {
    case "initialize":
      onInitialize(message);
      break;
    case "initialized":
      onInitialized();
      break;
    case "debug/echo":
      sendStdout({ jsonrpc: "2.0", id: message.id, result: message.params ?? null });
      break;
    case "semgrep/scanWorkspace":
      onScan();
      break;
    case "exit":
      if (!script.ignoreExit) finish();
      break;
    default:
      break; // shutdown: 응답하지 않는다. 그 밖의 메시지는 무시한다.
  }
}

// ── 입력 프레임 해석(최소 구현) ───────────────────────────────────

let pending = Buffer.alloc(0);

function onData(chunk) {
  pending = Buffer.concat([pending, chunk]);
  for (;;) {
    const headerEnd = pending.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const match = /Content-Length:\s*(\d+)/i.exec(pending.subarray(0, headerEnd).toString("ascii"));
    if (!match) {
      process.stderr.write("stub-child: Content-Length 헤더가 없다\n");
      process.exit(3);
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (pending.length < bodyStart + length) return;
    const body = pending.subarray(bodyStart, bodyStart + length).toString("utf8");
    pending = pending.subarray(bodyStart + length);
    let message;
    try {
      message = JSON.parse(body);
    } catch {
      process.stderr.write("stub-child: JSON이 아니다\n");
      process.exit(4);
    }
    handle(message);
  }
}

process.stdin.on("data", onData);
process.stdin.on("end", () => {
  if (!script.ignoreExit) finish();
});
process.stdin.on("error", () => {
  if (!script.ignoreExit) finish();
});
