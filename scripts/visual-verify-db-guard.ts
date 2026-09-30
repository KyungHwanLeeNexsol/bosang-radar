// SPEC-B2C-CONSULT-001 D-NEW-17 — visual:verify는 03-B/C(성공·중복) 화면을 만들려고 실제
// POST /api/consultations 제출을 하므로 DB에 상담 신청 행을 쓴다. 예전에는
// `process.env.TURSO_DATABASE_URL ??= "file:./.tmp/visual-verify.db"`라서 셸에 원격
// URL이 이미 export돼 있으면 조용히 그 원격 DB에 테스트 행을 썼다. 로컬 file DB가
// 아니면 실행 자체를 거부한다.
//
// 이 파일은 visual-verify.ts가 import되는 순간 main()이 도는 탓에 테스트할 수 없어 분리했다.

/**
 * 원격(또는 file:이 아닌) DB 주소가 설정돼 있으면 거부 사유(한국어)를, 아니면 null을
 * 돌려준다. 값이 없으면 스크립트가 로컬 file DB 기본값을 채우므로 통과다.
 * 사유에는 원격 주소(호스트)를 넣지 않고 스킴만 알린다.
 */
export function findRemoteDatabaseViolation(
  env: Readonly<Record<string, string | undefined>>
): string | null {
  const url = env.TURSO_DATABASE_URL?.trim();
  if (!url || url.startsWith("file:")) return null;

  const scheme = url.includes(":") ? url.slice(0, url.indexOf(":") + 1) : "(스킴 없음)";
  return (
    `[visual-verify] 실행을 거부합니다 — TURSO_DATABASE_URL이 로컬 파일 DB가 아닙니다(스킴 ${scheme}). ` +
    `이 스크립트는 상담 신청 행을 실제로 기록하므로 "file:"로 시작하는 로컬 DB에만 실행할 수 있습니다. ` +
    `값을 지우거나(기본값 file:./.tmp/visual-verify.db 사용) "file:./.tmp/<이름>.db"로 지정한 뒤 다시 실행하세요.`
  );
}
