import { describe, expect, it } from "vitest";
import { expectedUri, normalizePublishedUri } from "./uri";

const WIN_ROOT = "C:\\Users\\dev\\scan\\tree";
const POSIX_ROOT = "/tmp/scan/tree";

describe("expectedUri", () => {
  it("Windows 루트: 드라이브 문자는 대문자, 구분자는 /", () => {
    expect(expectedUri(WIN_ROOT, "src/a.ts")).toBe("file:///C:/Users/dev/scan/tree/src/a.ts");
    expect(expectedUri("c:/Users/dev/scan/tree/", "src/a.ts")).toBe(
      "file:///C:/Users/dev/scan/tree/src/a.ts"
    );
  });

  it("POSIX 루트", () => {
    expect(expectedUri(POSIX_ROOT, "src/a.ts")).toBe("file:///tmp/scan/tree/src/a.ts");
  });

  it("조각마다 퍼센트 인코딩한다(공백, 한글, #, ?, %)", () => {
    const uri = expectedUri(POSIX_ROOT, "app/한글 #1?.ts");
    expect(uri).toBe("file:///tmp/scan/tree/app/%ED%95%9C%EA%B8%80%20%231%3F.ts");
    expect(normalizePublishedUri(uri, POSIX_ROOT)).toBe("app/한글 #1?.ts");
    expect(normalizePublishedUri(expectedUri(POSIX_ROOT, "a%20b.ts"), POSIX_ROOT)).toBe("a%20b.ts");
  });

  it("상대 루트나 안전하지 않은 상대 경로는 예외", () => {
    expect(() => expectedUri("scan/tree", "a.ts")).toThrow();
    expect(() => expectedUri(POSIX_ROOT, "../a.ts")).toThrow();
    expect(() => expectedUri(POSIX_ROOT, "/a.ts")).toThrow();
    expect(() => expectedUri(POSIX_ROOT, "")).toThrow();
  });
});

describe("normalizePublishedUri: S14 정상 변형(Windows 형식은 미확인 U7)", () => {
  const rel = "src/app/page.ts";

  it.each([
    ["대문자 드라이브 + 콜론", "file:///C:/Users/dev/scan/tree/src/app/page.ts"],
    ["소문자 드라이브 + 콜론", "file:///c:/Users/dev/scan/tree/src/app/page.ts"],
    ["소문자 드라이브 + 인코딩된 콜론", "file:///c%3A/Users/dev/scan/tree/src/app/page.ts"],
    ["대문자 드라이브 + 인코딩된 콜론", "file:///C%3a/Users/dev/scan/tree/src/app/page.ts"],
    ["역슬래시 구분자", "file:///C:\\Users\\dev\\scan\\tree\\src\\app\\page.ts"],
    ["연속 슬래시", "file:///C:/Users//dev/scan/tree/src//app/page.ts"],
    ["localhost 호스트", "file://localhost/C:/Users/dev/scan/tree/src/app/page.ts"],
    ["스킴 대문자", "FILE:///C:/Users/dev/scan/tree/src/app/page.ts"],
    ["드라이브가 호스트 자리", "file://C:/Users/dev/scan/tree/src/app/page.ts"],
    ["퍼센트 인코딩된 구분자 없는 문자", "file:///C:/Users/dev/scan/tree/src/%61pp/page.ts"],
  ])("Windows 루트에서 %s → 같은 상대 경로", (_name, uri) => {
    expect(normalizePublishedUri(uri, WIN_ROOT)).toBe(rel);
  });

  it("루트 표기가 달라도(슬래시, 소문자 드라이브, 끝 구분자) 같다", () => {
    const uri = "file:///C:/Users/dev/scan/tree/src/app/page.ts";
    for (const root of [
      "C:/Users/dev/scan/tree",
      "c:\\Users\\dev\\scan\\tree\\",
      "C:\\Users\\dev\\scan\\tree/",
    ]) {
      expect(normalizePublishedUri(uri, root)).toBe(rel);
    }
  });

  it("비ASCII 경로: 퍼센트 인코딩된 UTF-8과 인코딩 없는 원문이 같다", () => {
    const encoded = "file:///c%3A/Users/dev/scan/tree/app/%ED%95%9C%EA%B8%80.ts";
    const raw = "file:///C:/Users/dev/scan/tree/app/한글.ts";
    expect(normalizePublishedUri(encoded, WIN_ROOT)).toBe("app/한글.ts");
    expect(normalizePublishedUri(raw, WIN_ROOT)).toBe("app/한글.ts");
  });

  it("공백이 포함된 루트와 경로", () => {
    const root = "C:\\My Docs\\scan tree";
    expect(normalizePublishedUri("file:///c%3A/My%20Docs/scan%20tree/a%20b.ts", root)).toBe(
      "a b.ts"
    );
    expect(normalizePublishedUri(expectedUri(root, "a b.ts"), root)).toBe("a b.ts");
  });

  it("expectedUri가 만든 URI는 항상 원래 상대 경로로 돌아온다", () => {
    for (const root of [WIN_ROOT, POSIX_ROOT]) {
      for (const p of ["a.ts", "src/a b/c.tsx", "한글/😀.ts", "x/#y/%z.js", "p/.hidden.ts"]) {
        expect(normalizePublishedUri(expectedUri(root, p), root)).toBe(p);
      }
    }
  });

  it("POSIX 루트의 기본형", () => {
    expect(normalizePublishedUri("file:///tmp/scan/tree/src/a.ts", POSIX_ROOT)).toBe("src/a.ts");
  });
});

describe("normalizePublishedUri: 정규화 불가·트리 밖은 null", () => {
  it.each([
    ["스킴이 file이 아님", "http://example.com/C:/Users/dev/scan/tree/a.ts"],
    ["스킴 없음", "/C:/Users/dev/scan/tree/a.ts"],
    ["빈 문자열", ""],
    ["루트 밖", "file:///C:/Users/dev/other/a.ts"],
    ["루트 자신", "file:///C:/Users/dev/scan/tree"],
    ["루트 자신 + 슬래시", "file:///C:/Users/dev/scan/tree/"],
    ["루트와 이름만 같은 형제", "file:///C:/Users/dev/scan/tree-extra/a.ts"],
    ["다른 드라이브", "file:///D:/Users/dev/scan/tree/a.ts"],
    ["상위 경로 조각", "file:///C:/Users/dev/scan/tree/../tree/a.ts"],
    ["루트 밖으로 나가는 상위 경로", "file:///C:/Users/dev/scan/tree/../../a.ts"],
    ["깨진 퍼센트 인코딩", "file:///C:/Users/dev/scan/tree/%E0%A4%A.ts"],
    ["유효하지 않은 UTF-8 퍼센트 열", "file:///C:/Users/dev/scan/tree/%FF.ts"],
    ["인코딩된 구분자(%2F)", "file:///C:/Users/dev/scan/tree/a%2Fb.ts"],
    ["인코딩된 역슬래시(%5C)", "file:///C:/Users/dev/scan/tree/a%5Cb.ts"],
    ["쿼리", "file:///C:/Users/dev/scan/tree/a.ts?x=1"],
    ["프래그먼트", "file:///C:/Users/dev/scan/tree/a.ts#L1"],
    ["UNC 호스트", "file://server/share/Users/dev/scan/tree/a.ts"],
    ["NUL 문자", "file:///C:/Users/dev/scan/tree/a%00.ts"],
  ])("Windows 루트: %s", (_name, uri) => {
    expect(normalizePublishedUri(uri, WIN_ROOT)).toBeNull();
  });

  it("POSIX 루트에 Windows 형 URI는 null", () => {
    expect(normalizePublishedUri("file:///C:/tmp/scan/tree/a.ts", POSIX_ROOT)).toBeNull();
  });

  it("POSIX 경로는 대소문자를 구분한다", () => {
    expect(normalizePublishedUri("file:///TMP/scan/tree/a.ts", POSIX_ROOT)).toBeNull();
  });

  it("상대 루트는 예외(호출자 오류)", () => {
    expect(() => normalizePublishedUri("file:///a/b.ts", "scan/tree")).toThrow();
  });
});
