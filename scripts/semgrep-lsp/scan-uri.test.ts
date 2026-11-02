import { describe, expect, it } from "vitest";
import { compareScanUri, type ScanUriRejection } from "./scan-uri";

// 기대 URI: 작업 영역 URI + /lsp-scan-1-target.txt (LSP-RULES-1 stderr:49 와 같은 인코딩 모양).
const EXPECTED =
  "file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt";
const PATH = "ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt";

describe("compareScanUri — 허용하는 동치(MATCH)", () => {
  const MATCHES: [string, string][] = [
    ["기대 문자열 그대로", EXPECTED],
    ["드라이브 c%3A (소문자 c, 대문자 hex)", `file:///c%3A/${PATH}`],
    ["드라이브 c: (콜론 그대로)", `file:///c:/${PATH}`],
    ["드라이브 C: (대문자 문자)", `file:///C:/${PATH}`],
    ["드라이브 C%3a (소문자 hex)", `file:///C%3a/${PATH}`],
    ["드라이브 c%3a", `file:///c%3a/${PATH}`],
    [
      "경로 조각의 불필요한 퍼센트 인코딩 (소문자 hex)",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target%2etxt`,
    ],
    [
      "경로 조각의 불필요한 퍼센트 인코딩 (대문자 hex)",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target%2Etxt`,
    ],
    [
      "한 글자 인코딩 (P = %50)",
      `file:///c%3A/%50rogramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt`,
    ],
  ];
  for (const [name, uri] of MATCHES) {
    it(name, () => {
      const r = compareScanUri(uri, EXPECTED);
      expect(r.result, uri).toBe("MATCH");
      expect(r.reason).toBeNull();
      expect(r.raw).toBe(uri); // 원문은 그대로 보존한다
    });
  }

  it("기대 URI 쪽이 file:///C:/ 모양(expectedUri 출력)이어도 같은 파일로 본다", () => {
    const upper = `file:///C:/${PATH}`;
    expect(compareScanUri(EXPECTED, upper).result).toBe("MATCH");
    expect(compareScanUri(upper, upper).result).toBe("MATCH");
  });
});

describe("compareScanUri — 같은 파일이 아니다(DIFFERENT, 정상 모양)", () => {
  const DIFFERENT: [string, string][] = [
    [
      "다른 파일 이름",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/other.txt`,
    ],
    [
      "다른 실행 폴더",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-2/work/lsp-scan/ws/lsp-scan-1-target.txt`,
    ],
    ["드라이브 문자만 다름", `file:///d%3A/${PATH}`],
    [
      "드라이브가 아닌 조각의 대소문자는 구별한다",
      `file:///c%3A/programdata/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt`,
    ],
    [
      "파일 이름 대소문자",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/LSP-SCAN-1-TARGET.TXT`,
    ],
    [
      "접두만 같음 (작업 영역 폴더 자체)",
      "file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws",
    ],
    ["접두만 같음 (대상 파일 아래 한 조각 더)", `${EXPECTED}/extra`],
    ["접두만 같음 (뒤에 글자가 붙음)", `${EXPECTED}2`],
    ["더 짧은 경로", "file:///c%3A/ProgramData"],
    [
      "퍼센트 인코딩된 비ASCII 조각 (한 번만 디코딩해도 기대와 다르다)",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/%C3%A9.txt`,
    ],
    [
      "디코딩된 % 는 그대로 남아 기대와 다르다",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt%25`,
    ],
  ];
  for (const [name, uri] of DIFFERENT) {
    it(name, () => {
      const r = compareScanUri(uri, EXPECTED);
      expect(r.result, uri).toBe("DIFFERENT");
      expect(r.reason).toBeNull();
      expect(r.raw).toBe(uri);
    });
  }
});

describe("compareScanUri — 거절(REJECTED)은 같다고도 다르다고도 하지 않는다", () => {
  const REJECTED: [ScanUriRejection, string, string][] = [
    ["AUTHORITY", "호스트 (localhost)", `file://localhost/c%3A/${PATH}`],
    ["AUTHORITY", "호스트 이름", `file://server/share/${PATH}`],
    ["AUTHORITY", "드라이브가 호스트 자리에 옴", `file://c:/${PATH}`],
    ["AUTHORITY", "슬래시 하나짜리 file:/", `file:/c%3A/${PATH}`],
    ["EMPTY_SEGMENT", "UNC 모양 file:////server/share", `file:////server/share/${PATH}`],
    ["QUERY", "쿼리 (벗겨서 비교하지 않는다)", `${EXPECTED}?x=1`],
    ["QUERY", "빈 쿼리", `${EXPECTED}?`],
    ["FRAGMENT", "프래그먼트 (벗겨서 비교하지 않는다)", `${EXPECTED}#L1`],
    ["FRAGMENT", "빈 프래그먼트", `${EXPECTED}#`],
    ["MALFORMED_PERCENT", "깨진 퍼센트 (%ZZ)", `file:///c%3A/ProgramData/%ZZ/${PATH}`],
    [
      "MALFORMED_PERCENT",
      "잘린 퍼센트 (%2)",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt%2`,
    ],
    ["MALFORMED_PERCENT", "끝의 %", `${EXPECTED}%`],
    [
      "MALFORMED_PERCENT",
      "유효하지 않은 UTF-8 (%FF)",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/%FF.txt`,
    ],
    [
      "DOUBLE_ENCODED",
      "두 번 인코딩된 점 (%252E)",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target%252Etxt`,
    ],
    ["DOUBLE_ENCODED", "두 번 인코딩된 드라이브 콜론 (%253A)", `file:///c%253A/${PATH}`],
    [
      "BACKSLASH",
      "역슬래시",
      `file:///c%3A/ProgramData\\bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt`,
    ],
    ["BACKSLASH", "역슬래시 경로", "file:///c:\\ProgramData\\x"],
    [
      "EMPTY_SEGMENT",
      "빈 조각 (연속 슬래시)",
      `file:///c%3A/ProgramData//bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt`,
    ],
    [
      "DOT_SEGMENT",
      "점 조각",
      `file:///c%3A/ProgramData/./bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt`,
    ],
    [
      "DOT_SEGMENT",
      "상위 조각 ..",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/../ws/lsp-scan-1-target.txt`,
    ],
    [
      "DOT_SEGMENT",
      "인코딩된 상위 조각 (%2e%2e)",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/%2e%2e/ws/lsp-scan-1-target.txt`,
    ],
    [
      "SEGMENT_ESCAPE",
      "디코딩된 슬래시 (%2F)",
      `file:///c%3A/ProgramData%2Fbosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt`,
    ],
    [
      "SEGMENT_ESCAPE",
      "디코딩된 역슬래시 (%5C)",
      `file:///c%3A/ProgramData%5Cbosang-semgrep-iso/RUN-1/work/lsp-scan/ws/lsp-scan-1-target.txt`,
    ],
    ["SEGMENT_ESCAPE", "디코딩된 NUL (%00)", `${EXPECTED}%00`],
    ["SEGMENT_ESCAPE", "디코딩된 제어 문자 (%0A)", `${EXPECTED}%0A`],
    ["SEGMENT_ESCAPE", "디코딩된 제어 문자 (%09)", `${EXPECTED}%09`],
    ["TRAILING_SLASH", "끝 슬래시", `${EXPECTED}/`],
    ["EMPTY_PATH", "경로가 슬래시 하나", "file:///"],
    [
      "NON_ASCII",
      "원문의 비ASCII 문자",
      `file:///c%3A/ProgramData/bosang-semgrep-iso/RUN-1/work/lsp-scan/ws/é.txt`,
    ],
    ["NON_ASCII", "원문의 한글", `file:///c%3A/ProgramData/보담/${PATH}`],
    ["CONTROL_CHAR", "원문의 공백", `${EXPECTED} `],
    ["CONTROL_CHAR", "원문의 개행", `${EXPECTED}\n`],
    ["CONTROL_CHAR", "원문의 NUL", `${EXPECTED}\0`],
    ["SCHEME", "대문자 스킴", `FILE:///c%3A/${PATH}`],
    ["SCHEME", "다른 스킴", `http:///c%3A/${PATH}`],
    ["SCHEME", "스킴 없음", `/c%3A/${PATH}`],
    ["SCHEME", "빈 문자열", ""],
  ];
  for (const [reason, name, uri] of REJECTED) {
    it(`${reason}: ${name}`, () => {
      const r = compareScanUri(uri, EXPECTED);
      expect(r.result, uri).toBe("REJECTED");
      expect(r.reason, uri).toBe(reason);
      expect(r.raw).toBe(uri); // 거절해도 원문은 보존한다
    });
  }

  it("문자열이 아닌 값은 거절한다 (null·숫자·객체·undefined)", () => {
    for (const bad of [null, undefined, 1, {}, [], true]) {
      const r = compareScanUri(bad, EXPECTED);
      expect(r.result).toBe("REJECTED");
      expect(r.reason).toBe("NOT_STRING");
      expect(r.raw).toBeNull();
    }
  });

  it("기대 URI 자체가 깨졌으면 EXPECTED_INVALID 로 거절한다 (같다고 하지 않는다)", () => {
    const r = compareScanUri(EXPECTED, "file://host/x");
    expect(r.result).toBe("REJECTED");
    expect(r.reason).toBe("EXPECTED_INVALID");
    const same = compareScanUri("file://host/x", "file://host/x");
    expect(same.result).toBe("REJECTED");
  });

  it("거절된 어떤 URI도 MATCH 가 되지 않는다 — 기대 문자열을 변형한 것 전부", () => {
    for (const [, , uri] of REJECTED) {
      expect(compareScanUri(uri, EXPECTED).result, uri).not.toBe("MATCH");
    }
  });
});
