// SPEC-B2C-CONSULT-001 M1 — 연락처 정규화/표시/마스킹 순수 함수
// (design.md §6.1). normalizePhone은 저장·중복 판정·마스킹의 단일
// 기준값을 만들고, formatPhoneDisplay/maskPhone은 그 값으로부터
// 표시 전용 포맷을 파생한다 — 원시 연락처를 화면에 직접 노출하지
// 않는다.

// 010/011/016/017/018/019로 시작하는 국내 휴대폰 번호(하이픈 제거 후
// 10~11자리) — 이 형식을 벗어나면 정규화 실패로 판정한다.
const KOREAN_MOBILE_PATTERN = /^01[016789]\d{7,8}$/;

/**
 * 하이픈·공백·국가코드(+82/0082)를 제거한 뒤 국내 형식(0으로 시작)으로
 * 통일한다. 결과가 국내 휴대폰 번호 형식을 벗어나면 null을 반환한다
 * (REQ-B2CCONSULT-011) — 호출부(schema.ts의 .refine)가 이 null을
 * 거부 신호로 사용한다.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[\s-]/g, "");

  if (digits.startsWith("+82")) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.startsWith("0082")) {
    digits = `0${digits.slice(4)}`;
  }

  if (!/^\d+$/.test(digits)) {
    return null;
  }

  if (!KOREAN_MOBILE_PATTERN.test(digits)) {
    return null;
  }

  return digits;
}

/**
 * 정규화된 값을 하이픈 표기(010-0000-0000)로 되돌리는 표시 전용
 * 함수다 — 저장 형식이 아니라 렌더링에만 쓰인다.
 */
export function formatPhoneDisplay(normalized: string): string {
  if (normalized.length === 11) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`;
  }
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

/**
 * 가운데 구간을 마스킹한다 — 010-****-1234. 성공/중복 화면이 이 값만
 * 렌더링하고 원시 연락처를 그대로 노출하지 않는다(design.md §6.1).
 */
export function maskPhone(normalized: string): string {
  const display = formatPhoneDisplay(normalized);
  const [prefix, , suffix] = display.split("-");
  return `${prefix}-****-${suffix}`;
}
