// LSP-SCAN-1 진단 URI 비교(순수 모듈). 파일·프로세스·시계·네트워크를 만지지 않는다.
//
// 결정 D9(고정, 실제 출력을 본 뒤 넓히지 않는다): 서버가 `publishDiagnostics`에 싣는 `uri` 원문은 언제나 그대로 기록하고, 비교는 아래 **유한한 목록**의
// 동치만 같다고 본다. 기존 uri.ts(normalizePublishedUri)는 `localhost`·연속 슬래시·역슬래시·쿼리 무시 같은 더 넓은 변형을 받으므로 이 경계에 쓰지 않는다.
//
//   같다고 보는 것: 스킴이 정확히 소문자 `file`, 권한(authority)이 비어 있음(`file:///…`), 퍼센트 인코딩은 **조각마다 정확히 한 번** 디코딩(유효한 `%XX`만,
//   hex 대소문자 무시), 첫 조각이 드라이브(`c:`·`C:`·`c%3A`·`C%3a`)이면 **드라이브 문자만** 대소문자를 무시, 나머지 조각은 서수 비교(대소문자 구별).
//   거절하는 것(같다고도 다르다고도 하지 않는다): 호스트·UNC·비어 있지 않은 권한, 쿼리, 프래그먼트(벗겨서 비교하지 않는다), 깨지거나 잘린 `%`, 두 번째 디코딩에서야
//   맞는 이중 인코딩, 역슬래시, 빈 조각(`//`), `.`·`..` 조각, 디코딩된 조각 안의 `/`·`\`·NUL·제어 문자, 끝 슬래시, 비ASCII 원문, 공백·제어 문자.
//   결과: MATCH(같은 파일) | DIFFERENT(정상 모양이지만 다른 파일 — 접두만 같은 경우 포함) | REJECTED(사유).
//
// 가정(미확정): 접두만 같은 경우는 REJECTED가 아니라 DIFFERENT로 둔다(정상 모양의 다른 경로). 어느 쪽이든 MATCH가 아니다.

export type ScanUriRejection =
  | "NOT_STRING"
  | "NON_ASCII"
  | "CONTROL_CHAR"
  | "BACKSLASH"
  | "SCHEME"
  | "AUTHORITY"
  | "QUERY"
  | "FRAGMENT"
  | "MALFORMED_PERCENT"
  | "DOUBLE_ENCODED"
  | "EMPTY_SEGMENT"
  | "DOT_SEGMENT"
  | "SEGMENT_ESCAPE"
  | "TRAILING_SLASH"
  | "EMPTY_PATH"
  | "EXPECTED_INVALID";

export interface ScanUriComparison {
  result: "MATCH" | "DIFFERENT" | "REJECTED";
  /** 거절 사유. MATCH·DIFFERENT 이면 null. */
  reason: ScanUriRejection | null;
  /** 받은 URI 원문. 문자열이 아니었으면 null. 정규화하지 않는다. */
  raw: string | null;
}

type Parsed = { ok: true; segments: string[] } | { ok: false; reason: ScanUriRejection };

const HEX2 = /^[0-9A-Fa-f]{2}$/;
const DRIVE = /^[A-Za-z]:$/;
const ENCODED_LOOKING = /%[0-9A-Fa-f]{2}/;

/** 조각 하나를 정확히 한 번 디코딩한다. 깨진 `%`·유효하지 않은 UTF-8 이면 null. */
function decodeOnce(raw: string): string | null {
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "%") {
      const hex = raw.slice(i + 1, i + 3);
      if (!HEX2.test(hex)) return null;
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0)); // 원문은 ASCII 뿐임이 이미 확인됐다
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      Uint8Array.from(bytes)
    );
  } catch {
    return null;
  }
}

function parse(uri: string): Parsed {
  for (let i = 0; i < uri.length; i += 1) {
    if (uri.charCodeAt(i) > 0x7f) return { ok: false, reason: "NON_ASCII" };
  }
  for (let i = 0; i < uri.length; i += 1) {
    const c = uri.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return { ok: false, reason: "CONTROL_CHAR" };
  }
  if (uri.includes("\\")) return { ok: false, reason: "BACKSLASH" };
  if (!uri.startsWith("file:")) return { ok: false, reason: "SCHEME" };
  const afterScheme = uri.slice("file:".length);
  // 권한이 비어 있는 `file:///…` 한 형태만 받는다(`file:/…`·`file://host/…`·`file://c:/…` 거절).
  if (!afterScheme.startsWith("//")) return { ok: false, reason: "AUTHORITY" };
  const rest = afterScheme.slice(2);
  if (!rest.startsWith("/")) return { ok: false, reason: "AUTHORITY" };
  if (rest.includes("?")) return { ok: false, reason: "QUERY" };
  if (rest.includes("#")) return { ok: false, reason: "FRAGMENT" };
  if (rest === "/") return { ok: false, reason: "EMPTY_PATH" };
  const rawSegments = rest.slice(1).split("/");
  if (rawSegments.length > 1 && rawSegments[rawSegments.length - 1] === "") {
    return { ok: false, reason: "TRAILING_SLASH" };
  }
  const segments: string[] = [];
  for (const raw of rawSegments) {
    if (raw === "") return { ok: false, reason: "EMPTY_SEGMENT" };
    const decoded = decodeOnce(raw);
    if (decoded === null) return { ok: false, reason: "MALFORMED_PERCENT" };
    // 디코딩된 `%`는 문자 그대로 남는다. 그러나 `%XX`처럼 보이면 두 번째 디코딩을 기대한 형태이므로 거절한다.
    if (ENCODED_LOOKING.test(decoded)) return { ok: false, reason: "DOUBLE_ENCODED" };
    if (decoded === "." || decoded === "..") return { ok: false, reason: "DOT_SEGMENT" };
    if (/[/\\\u0000-\u001f\u007f]/.test(decoded)) return { ok: false, reason: "SEGMENT_ESCAPE" };
    segments.push(decoded);
  }
  return { ok: true, segments };
}

function sameSegments(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (i === 0 && DRIVE.test(a[0]) && DRIVE.test(b[0])) {
      // 드라이브 문자만 대소문자를 무시한다.
      if (a[0][0].toLowerCase() !== b[0][0].toLowerCase()) return false;
    } else if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** 받은 URI를 기대 URI와 비교한다. 원문은 그대로 돌려준다(정규화한 값을 원문 자리에 쓰지 않는다). */
export function compareScanUri(actual: unknown, expected: string): ScanUriComparison {
  if (typeof actual !== "string") return { result: "REJECTED", reason: "NOT_STRING", raw: null };
  const got = parse(actual);
  if (!got.ok) return { result: "REJECTED", reason: got.reason, raw: actual };
  const want = typeof expected === "string" ? parse(expected) : { ok: false as const };
  if (!want.ok) return { result: "REJECTED", reason: "EXPECTED_INVALID", raw: actual };
  return {
    result: sameSegments(got.segments, want.segments) ? "MATCH" : "DIFFERENT",
    reason: null,
    raw: actual,
  };
}
