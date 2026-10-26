// 시험 전용: 무해한 대기 스텁. 실제 Semgrep이 아니다 — 이 스크립트가 어떤 이름·인자로 떠 있든 실제 Semgrep 프로세스 식별의 증거가 아니다.
//
// 아무것도 읽거나 쓰지 않고 네트워크도 쓰지 않는다. 기다리다가 (1) 표준 입력이 닫히거나 (2) 수명(STUB_LIFETIME_MS, 기본 30초)이 다하면
// 스스로 끝난다 — 시험이 실패해도 고아 프로세스를 오래 남기지 않는다.
// import·export가 없는 평범한 문장뿐이라 확장자 없는 파일(`semgrep`)로 복사해도 같은 방식으로 실행된다.

const lifetime = Number(process.env.STUB_LIFETIME_MS ?? 30000);
const timer = setTimeout(() => process.exit(0), lifetime);
process.stdin.on("end", () => {
  clearTimeout(timer);
  process.exit(0);
});
process.stdin.on("error", () => {});
process.stdin.resume();
