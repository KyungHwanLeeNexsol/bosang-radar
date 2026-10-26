import { describe, expect, it } from "vitest";
import { createNodeFs } from "./fs-node";
import { evidenceInsideServerTree, keyIsSameOrInside } from "./path-containment";
import { MemoryFs } from "./testing/memory-fs";
import { createPosixPathOps } from "./testing/posix-path-ops";

// 증거 실행 폴더가 서버 트리와 같거나 그 안인지의 판정. 실제 디스크 위의 CLI·하네스 시험은 cli.test.ts·harness.test.ts에 있다.
// 여기서는 순수 키 비교, 메모리 파일 시스템, 그리고 POSIX 의미(링크를 푼 뒤의 `..`는 대상의 부모)를 메모리 표로 모의한 경로
// 해석을 확인한다 — 모의는 **실제 Linux·macOS 디스크의 증거가 아니다**(testing/posix-path-ops.ts 머리 주석).

describe("keyIsSameOrInside — 순수 키 비교", () => {
  it("같거나 안이면 true, 이름만 비슷하거나 위쪽·바깥이면 false", () => {
    expect(keyIsSameOrInside("/a/scan", "/a/scan")).toBe(true);
    expect(keyIsSameOrInside("/a/scan/ev/run-1", "/a/scan")).toBe(true);
    expect(keyIsSameOrInside("/a/scan-evidence", "/a/scan")).toBe(false); // 이름 접두만 같다
    expect(keyIsSameOrInside("/a/scan2/ev", "/a/scan")).toBe(false);
    expect(keyIsSameOrInside("/a/ev", "/a/scan")).toBe(false);
    expect(keyIsSameOrInside("/a", "/a/scan")).toBe(false); // 증거가 트리의 부모이면 트리 안이 아니다
  });

  it("루트 키(끝이 /)도 하위를 포함한다", () => {
    expect(keyIsSameOrInside("/x/y", "/")).toBe(true);
    expect(keyIsSameOrInside("/", "/")).toBe(true);
  });
});

describe("evidenceInsideServerTree — 메모리 파일 시스템(링크 없음, 사전식 의미)", () => {
  const fs = new MemoryFs({});

  it("메모리 파일 시스템은 `..`를 사전식으로 접어 접근하므로 그 의미대로 판정한다", async () => {
    expect(await evidenceInsideServerTree(fs, "/base/outside/../scan/evidence", "/base/scan")).toBe(
      true
    );
    expect(await evidenceInsideServerTree(fs, "/base/scan/a/b", "/base/scan")).toBe(true);
    expect(await evidenceInsideServerTree(fs, "/base/scan", "/base/scan")).toBe(true);
    expect(await evidenceInsideServerTree(fs, "/base/scan-evidence/run", "/base/scan")).toBe(false);
    expect(await evidenceInsideServerTree(fs, "/evidence/run-1", "/scan/run-1")).toBe(false);
  });
});

describe("evidenceInsideServerTree — POSIX 의미 모의(Windows 컴퓨터에서 Linux 규칙을 확인하는 용도)", () => {
  const B = "/fake/base";
  const table = {
    dirs: [`${B}/tree`, `${B}/outside`, `${B}/elsewhere/sub`, `${B}/tree-evidence`],
    links: {
      [`${B}/alias`]: `${B}/tree`, // B 경로: alias → tree
      [`${B}/chain`]: `${B}/alias`, // 링크의 링크
      [`${B}/outlink`]: `${B}/elsewhere/sub`, // 서버 트리 바깥으로 가는 링크
      [`${B}/dangling`]: `${B}/gone`, // 대상이 없는 링크
    },
    files: [`${B}/file.txt`],
  };
  const fs = createNodeFs({ pathOps: createPosixPathOps(table), caseInsensitive: false });
  const inside = (evidence: string, tree = `${B}/tree`) =>
    evidenceInsideServerTree(fs, evidence, tree);

  it("A: 존재하는 outside를 지나 `..`로 돌아오는 경로는 서버 트리 안이다", async () => {
    expect(await inside(`${B}/outside/../tree/evidence`)).toBe(true);
  });

  it("A 변형: 아직 없는 폴더를 지나 `..`로 돌아오는 경로도 안이다(mkdir -p가 만든 뒤 `..`로 돌아온다)", async () => {
    expect(await inside(`${B}/nowhere/../tree/evidence`)).toBe(true);
    expect(await inside(`${B}/nowhere/deeper/../../tree/a/b/c`)).toBe(true);
  });

  it("B: 서버 트리를 가리키는 링크 아래의 경로는 안이다(아직 없는 하위 폴더 포함, 링크의 링크 포함)", async () => {
    expect(await inside(`${B}/alias/evidence`)).toBe(true);
    expect(await inside(`${B}/alias/a/b/c`)).toBe(true);
    expect(await inside(`${B}/chain/evidence`)).toBe(true);
  });

  it("링크를 푼 뒤의 `..`는 대상의 부모다: chain/..는 base이므로 chain/../tree/x는 서버 트리 안이다", async () => {
    expect(await inside(`${B}/chain/../tree/x`)).toBe(true);
  });

  it("서버 트리 자신이 링크로 주어져도 같은 자리로 비교한다", async () => {
    expect(await inside(`${B}/tree/evidence`, `${B}/alias`)).toBe(true);
    expect(await inside(`${B}/alias/evidence`, `${B}/chain`)).toBe(true);
  });

  it("바깥으로 가는 링크 뒤의 `..`는 대상의 부모를 가리키므로 서버 트리 바깥이다(사전식으로 접으면 안이라고 오판한다)", async () => {
    // outlink → elsewhere/sub 이므로 outlink/.. 는 elsewhere이다. 사전식으로 접으면 base/tree/evidence(안)가 된다.
    expect(await inside(`${B}/outlink/../tree/evidence`)).toBe(false);
  });

  it("이름 접두만 비슷한 별도 폴더·나란한 폴더·서버 트리의 부모는 안이 아니다", async () => {
    expect(await inside(`${B}/tree-evidence/run`)).toBe(false);
    expect(await inside(`${B}/outside/evidence`)).toBe(false);
    expect(await inside(`${B}/elsewhere/sub/evidence`)).toBe(false);
    expect(await inside(B)).toBe(false);
  });

  it("같은 위치와 그 하위는 안이다", async () => {
    expect(await inside(`${B}/tree`)).toBe(true);
    expect(await inside(`${B}/tree/x/y/z`)).toBe(true);
    expect(await inside(`${B}/tree/../tree/./evidence`)).toBe(true);
  });

  it("안전하게 풀 수 없는 경로는 던진다 — 호출자는 쓰기 전에 거절한다(끊어진 링크, 파일 뒤의 `..`)", async () => {
    await expect(inside(`${B}/dangling/evidence`)).rejects.toMatchObject({ code: "DANGLING_LINK" });
    await expect(inside(`${B}/file.txt/../x`)).rejects.toMatchObject({
      code: "UNRESOLVABLE_DOTDOT",
    });
    await expect(inside(`${B}/tree/evidence`, `${B}/dangling`)).rejects.toMatchObject({
      code: "DANGLING_LINK",
    });
  });
});
