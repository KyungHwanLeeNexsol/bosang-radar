// 시험 전용: 무해한 "버전 출력" 스텁. 실제 Semgrep이 아니다 — 이 스크립트의 출력은 실제 Semgrep 동작의 증거가 아니다.
//
// 사용: node stub-version.mjs --version <시나리오>
// 파일·네트워크·다른 프로세스를 만지지 않는다. 표준 출력·표준 오류와 종료 코드만 쓴다.
//
// 멈춤·폭주 시나리오는 관측 쪽이 끝내 주지 않아도 SELF_DESTRUCT_MS 뒤에 스스로 종료한다 — 시험이 실패해도 고아 프로세스를 남기지 않는다.

const scenario = process.argv[3] ?? "ok";
const SELF_DESTRUCT_MS = 20_000;

const out = (text) => process.stdout.write(text);
const err = (text) => process.stderr.write(text);

function selfDestruct() {
  setTimeout(() => process.exit(9), SELF_DESTRUCT_MS).unref();
}

switch (scenario) {
  case "ok":
    out("1.180.0\n");
    break;
  case "ok-crlf":
    out("1.180.0\r\n");
    break;
  case "ok-no-newline":
    out("1.180.0");
    break;
  case "other-version":
    out("1.179.0\n");
    break;
  case "noisy": // 버전은 stdout, 경고는 stderr — stderr는 해석하지 않는다
    err("warning: this is a stub\n");
    out("1.180.0\n");
    break;
  case "unexpected": // 접두가 붙은 형식
    out("semgrep 1.180.0\n");
    break;
  case "v-prefix":
    out("v1.180.0\n");
    break;
  case "multi-line":
    out("1.180.0\n1.180.0\n");
    break;
  case "empty":
    break;
  case "stderr-only": // 버전이 stderr에만 있다 — 해석하지 않으므로 관측 실패다
    err("1.180.0\n");
    break;
  case "fail": // 정상처럼 보이는 stdout이어도 종료 코드가 0이 아니면 관측 실패다
    err("boom\n");
    out("1.180.0\n");
    process.exitCode = 3;
    break;
  case "late": // 조금 늦게 출력하고 끝난다(실행 중 취소 시험용)
    setTimeout(() => out("1.180.0\n"), 400);
    selfDestruct();
    break;
  case "hang": // 출력도 종료도 없다(시간 초과·취소 시험용)
    setInterval(() => {}, 1000);
    selfDestruct();
    break;
  case "flood": {
    // stdout을 끝없이 쓴다(출력 크기 제한 시험용)
    const chunk = "x".repeat(65_536);
    setInterval(() => out(chunk), 0);
    selfDestruct();
    break;
  }
  case "flood-stderr": {
    const chunk = "x".repeat(65_536);
    setInterval(() => err(chunk), 0);
    selfDestruct();
    break;
  }
  default:
    err(`알 수 없는 시나리오: ${scenario}\n`);
    process.exitCode = 64;
}
