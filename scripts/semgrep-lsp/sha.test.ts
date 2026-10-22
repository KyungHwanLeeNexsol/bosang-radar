import { describe, expect, it } from "vitest";
import { gitBlobSha1, lineListSha256, sha1Hex, sha256Hex } from "./sha";

describe("sha", () => {
  it("sha256Hex: 빈 입력과 알려진 벡터", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("sha256Hex: 문자열은 UTF-8 바이트로 해시한다", () => {
    const text = "보상 레이더";
    expect(sha256Hex(text)).toBe(sha256Hex(new TextEncoder().encode(text)));
  });

  it("sha1Hex: 알려진 벡터", () => {
    expect(sha1Hex("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(sha1Hex("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it("gitBlobSha1: git이 계산하는 blob 해시와 같다", () => {
    expect(gitBlobSha1(new Uint8Array(0))).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    expect(gitBlobSha1(new TextEncoder().encode("hello\n"))).toBe(
      "ce013625030ba8dba906f756967f9e9ca394464a"
    );
  });

  it("gitBlobSha1: 헤더의 크기는 문자 수가 아니라 바이트 수다", () => {
    const bytes = new TextEncoder().encode("가나다\n");
    const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
    const expected = sha1Hex(new Uint8Array([...header, ...bytes]));
    expect(gitBlobSha1(bytes)).toBe(expected);
  });

  it("lineListSha256: 각 줄 뒤에 LF를 붙여 이어 붙인 값의 해시다", () => {
    expect(lineListSha256(["a", "b"])).toBe(sha256Hex("a\nb\n"));
    expect(lineListSha256(["한글"])).toBe(sha256Hex("한글\n"));
  });

  it("lineListSha256: 빈 목록은 빈 문자열의 해시다", () => {
    expect(lineListSha256([])).toBe(sha256Hex(""));
  });

  it("lineListSha256: 빈 줄 하나와 빈 목록은 구분된다", () => {
    expect(lineListSha256([""])).not.toBe(lineListSha256([]));
  });
});
