import { describe, expect, it } from "vitest";
import { createPosixPathOps } from "./posix-path-ops";

// 모의 도구 자체의 확인. POSIX 규칙(링크를 푼 뒤의 `..`는 대상의 부모)을 모의하는지 본다. 실제 Linux 디스크의 증거가 아니다.

const B = "/fake/base";

// 외부 검토가 보고한 구조: physical/{branch,tree} 폴더와 route/link → physical/branch 링크.
const ops = createPosixPathOps({
  dirs: [`${B}/physical/branch`, `${B}/physical/tree`, `${B}/route`],
  files: [`${B}/physical/file.txt`],
  links: {
    [`${B}/route/link`]: `${B}/physical/branch`,
    [`${B}/route/relative`]: "../physical/tree", // 링크가 있는 폴더(route) 기준 상대 대상
    [`${B}/route/chain`]: `${B}/route/link`, // 링크의 링크
    [`${B}/route/loop-a`]: `${B}/route/loop-b`,
    [`${B}/route/loop-b`]: `${B}/route/loop-a`,
  },
});

const codeOf = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => "OK",
    (error: { code?: string }) => error.code ?? "?"
  );

describe("모의 POSIX 경로 해석", () => {
  it("보고된 구조: `route/link/../tree`와 `physical/tree`는 같은 physical/tree로 풀리고, 사전식으로 접은 route/tree가 아니다", async () => {
    expect(await ops.realpath(`${B}/physical/tree`)).toBe(`${B}/physical/tree`);
    expect(await ops.realpath(`${B}/route/link/../tree`)).toBe(`${B}/physical/tree`);
    // 링크 앞의 `..`를 먼저 지운 경로(예전 코드가 만든 경로)는 존재하지 않는 다른 자리다.
    expect(await codeOf(ops.realpath(`${B}/route/tree`))).toBe("ENOENT");
  });

  it("링크 대상의 부모로 올라간다: link → physical/branch 이므로 link/.. 는 physical이다", async () => {
    expect(await ops.realpath(`${B}/route/link/..`)).toBe(`${B}/physical`);
    expect(await ops.realpath(`${B}/route/link/../..`)).toBe(B);
  });

  it("상대 링크는 링크가 있는 폴더 기준이고, 링크의 링크도 끝까지 푼다", async () => {
    expect(await ops.realpath(`${B}/route/relative`)).toBe(`${B}/physical/tree`);
    expect(await ops.realpath(`${B}/route/chain/../tree`)).toBe(`${B}/physical/tree`);
  });

  it("없는 칸은 ENOENT, 파일 아래는 ENOTDIR, 링크 순환은 ELOOP", async () => {
    expect(await codeOf(ops.realpath(`${B}/physical/missing`))).toBe("ENOENT");
    expect(await codeOf(ops.realpath(`${B}/physical/missing/..`))).toBe("ENOENT");
    expect(await codeOf(ops.realpath(`${B}/physical/file.txt/x`))).toBe("ENOTDIR");
    expect(await codeOf(ops.realpath(`${B}/physical/file.txt/..`))).toBe("ENOTDIR");
    expect(await codeOf(ops.realpath(`${B}/route/loop-a`))).toBe("ELOOP");
  });

  it("`.`와 중복 구분자는 무시하고, 역슬래시·드라이브 접두는 같은 표로 읽는다", async () => {
    expect(await ops.realpath(`${B}//physical/./tree/`)).toBe(`${B}/physical/tree`);
    expect(await ops.realpath(`C:\\fake\\base\\route\\link\\..\\tree`)).toBe(`${B}/physical/tree`);
  });

  it("readlink: 링크는 대상을, 링크가 아닌 것은 EINVAL, 없는 것은 ENOENT", async () => {
    expect(await ops.readlink(`${B}/route/link`)).toBe(`${B}/physical/branch`);
    expect(await codeOf(ops.readlink(`${B}/physical/tree`))).toBe("EINVAL");
    expect(await codeOf(ops.readlink(`${B}/physical/missing`))).toBe("ENOENT");
  });
});
