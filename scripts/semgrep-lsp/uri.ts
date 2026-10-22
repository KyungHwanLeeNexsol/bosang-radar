// publishDiagnostics의 URI ↔ 스캔 트리 상대 경로 (rev2 S14).
//
// 공개 API (B2가 쓴다):
//   expectedUri(scanRoot, relPath): string                 우리가 기대하는 표준 형태(정보용)
//   normalizePublishedUri(uri, scanRoot): string | null    상대 경로 또는 null
//
// null은 "정규화할 수 없거나 스캔 루트 밖"이다. 호출자는 이를 URI_UNNORMALIZABLE /
// URI_PUBLISHED_NOT_EXPECTED 사유로 바꾼다(여기서는 사유를 만들지 않는다).
//
// 주의(ADR U7): Semgrep이 Windows에서 실제로 내보내는 URI 형식은 아직 확인하지 못했다. 아래는
// 그럴듯한 변형(`file:///C:/…`, `file:///c%3A/…`, 역슬래시, 연속 슬래시, `file://localhost/…`,
// 드라이브가 호스트 자리에 온 `file://C:/…`)을 받아들일 뿐, 어느 것이 실제 형식이라는 뜻이 아니다.
// 첫 실제 실행의 원문으로 형식을 동결할 때까지 이 목록은 가정이다. 받아들이지 못한 형식은 null이 되어
// TARGET_MISMATCH로 드러난다(fail-closed).
//
// 비교 규칙: 드라이브 문자만 대소문자를 무시한다. 그 밖의 경로는 대소문자를 구분하고, 유니코드
// 정규화(NFC/NFD)도 하지 않는다 — 다르게 보이는 표기는 같은 파일로 합치지 않고 불일치로 남긴다.

const DRIVE = /^[A-Za-z]:$/;

interface RootKey {
  /** 비교용 키: 드라이브 문자는 소문자, 구분자는 '/', 끝 구분자 없음. */
  key: string;
  /** URI를 만들 때 쓰는 조각들(드라이브 제외). */
  segments: string[];
  drive: string | null;
}

function rootKeyOf(scanRoot: string): RootKey {
  const normalized = scanRoot
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
  const win = /^([A-Za-z]):(\/.*)?$/.exec(normalized);
  if (win) {
    const rest = win[2] ?? "";
    return {
      key: `${win[1].toLowerCase()}:${rest}`,
      segments: rest.split("/").filter((s) => s !== ""),
      drive: win[1].toUpperCase(),
    };
  }
  if (normalized.startsWith("/") || (normalized === "" && scanRoot.startsWith("/"))) {
    return {
      key: normalized,
      segments: normalized.split("/").filter((s) => s !== ""),
      drive: null,
    };
  }
  throw new Error(`스캔 루트는 절대 경로여야 한다: ${scanRoot}`);
}

function assertSafeRelPath(relPath: string): string[] {
  const parts = relPath.split("/");
  if (
    relPath.length === 0 ||
    relPath.includes("\\") ||
    relPath.includes("\0") ||
    parts.some((p) => p === "" || p === "." || p === "..")
  ) {
    throw new Error(`스캔 루트 아래의 안전한 상대 경로가 아니다: ${JSON.stringify(relPath)}`);
  }
  return parts;
}

/** 표준 형태: `file:///C:/…`(드라이브 대문자, 콜론 그대로) 또는 `file:///…`, 조각마다 퍼센트 인코딩. */
export function expectedUri(scanRoot: string, relPath: string): string {
  const root = rootKeyOf(scanRoot);
  const rel = assertSafeRelPath(relPath);
  const encoded = [...root.segments, ...rel].map(encodeURIComponent).join("/");
  return root.drive === null ? `file:///${encoded}` : `file:///${root.drive}:/${encoded}`;
}

/** 스캔 루트 아래의 상대 경로('/' 구분) 또는 null. */
export function normalizePublishedUri(uri: string, scanRoot: string): string | null {
  const root = rootKeyOf(scanRoot);

  const scheme = /^file:/i.exec(uri);
  if (!scheme) return null;
  // 쿼리·프래그먼트는 파일 경로의 일부가 될 수 없다(경로의 '#', '?'는 %23, %3F로 와야 한다).
  let rest = uri.slice(scheme[0].length);
  if (rest.includes("?") || rest.includes("#")) return null;
  rest = rest.replace(/\\/g, "/");

  let path: string;
  if (rest.startsWith("//")) {
    const slash = rest.indexOf("/", 2);
    const authority = slash === -1 ? rest.slice(2) : rest.slice(2, slash);
    const tail = slash === -1 ? "" : rest.slice(slash);
    if (authority === "" || authority.toLowerCase() === "localhost") path = tail;
    else if (DRIVE.test(authority)) path = `/${authority}${tail}`;
    else return null; // UNC 등 다른 호스트
  } else if (rest.startsWith("/")) {
    path = rest;
  } else {
    return null;
  }

  const segments: string[] = [];
  for (const raw of path.split("/")) {
    if (raw === "") continue; // 연속 슬래시는 하나로 본다
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return null; // 깨진 퍼센트 인코딩, 유효하지 않은 UTF-8
    }
    if (seg === "." || seg === ".." || /[/\\\0]/.test(seg)) return null;
    segments.push(seg);
  }
  if (segments.length === 0) return null;

  let candidate: string;
  if (DRIVE.test(segments[0])) {
    candidate = `${segments[0].toLowerCase()}/${segments.slice(1).join("/")}`;
  } else {
    candidate = `/${segments.join("/")}`;
  }

  const prefix = `${root.key}/`;
  if (!candidate.startsWith(prefix)) return null;
  const rel = candidate.slice(prefix.length);
  return rel === "" ? null : rel;
}
