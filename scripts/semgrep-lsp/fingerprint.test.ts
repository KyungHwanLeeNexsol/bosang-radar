import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BINDING_SCHEMA,
  CONTROL_FINGERPRINT_SCHEMA,
  HARNESS_FINGERPRINT_SCHEMA,
  buildBinding,
  computeControlFingerprint,
  computeHarnessFingerprint,
  controlFingerprintOf,
  controlManifest,
  harnessFingerprintOf,
  harnessManifest,
  isHarnessImplementationFile,
  type BindingComponents,
} from "./fingerprint";
import { canonicalJson } from "./evidence";
import { sha256Hex } from "./sha";
import { MemoryFs } from "./testing/memory-fs";
import type { ControlExpectations } from "./types";

// PR #28 외부 검토(발견 3) 회귀 시험: 하네스·대조 지문과 결합(binding)의 계약.
// 이 파일의 모든 시험은 아직 없는 fingerprint.ts를 대상으로 쓴 것이라 지금은 모듈을 찾지 못해 실패한다([RED]).
// 기대값은 설계 명세(§4, §7)에서 가져온 것이며, 구현에서 거꾸로 베끼지 않았다.

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const E = "e".repeat(64);
const ONE = "1".repeat(64);
const TWO = "2".repeat(64);

const enc = (text: string) => new TextEncoder().encode(text);

describe("스키마 상수", () => {
  it("[RED] 세 스키마 문자열이 명세와 같다", () => {
    expect(HARNESS_FINGERPRINT_SCHEMA).toBe("semgrep-lsp-harness-fingerprint/1");
    expect(CONTROL_FINGERPRINT_SCHEMA).toBe("semgrep-lsp-control-fingerprint/1");
    expect(BINDING_SCHEMA).toBe("semgrep-lsp-binding/1");
  });
});

// ── 범위 규칙 ───────────────────────────────────────────────────

describe("isHarnessImplementationFile: 하네스 구현 파일의 범위", () => {
  it("[RED] 최상위와 중첩된 .ts·.mjs는 포함한다", () => {
    for (const path of [
      "evaluate.ts",
      "cli.ts",
      "stub.mjs",
      "sub/dir/x.ts",
      "sub/x.mjs",
      // 이름이 testing·data로 시작할 뿐 그 디렉터리 아래가 아닌 최상위 파일은 구현 파일이다.
      "testing-utils.ts",
      "data-model.ts",
      "database.ts",
    ]) {
      expect(isHarnessImplementationFile(path), path).toBe(true);
    }
  });

  it("[RED] *.test.ts·*.test.mjs는 제외한다(최상위·중첩 모두)", () => {
    for (const path of ["evaluate.test.ts", "x.test.mjs", "sub/y.test.ts", "sub/deep/z.test.mjs"]) {
      expect(isHarnessImplementationFile(path), path).toBe(false);
    }
  });

  it("[RED] testing/ 아래는 무엇이든 제외한다", () => {
    for (const path of ["testing/a.ts", "testing/deep/b.mjs", "testing/evaluate-fixtures.ts"]) {
      expect(isHarnessImplementationFile(path), path).toBe(false);
    }
  });

  it("[RED] data/ 아래는 무엇이든 제외한다", () => {
    for (const path of ["data/pin.json", "data/x.ts", "data/deep/y.mjs"]) {
      expect(isHarnessImplementationFile(path), path).toBe(false);
    }
  });

  it("[RED] README.md·.json·.js·.tsx 같은 다른 확장자는 제외한다", () => {
    for (const path of [
      "README.md",
      "pin.json",
      "x.json",
      "x.js",
      "x.tsx",
      "noext",
      "sub/notes.md",
    ]) {
      expect(isHarnessImplementationFile(path), path).toBe(false);
    }
  });

  it("[RED] 구조 시험: 포함되는 실제 파일 중 어느 것도 testing/을 가져오지(import) 않는다(제외가 구멍이 되지 않는다)", () => {
    const root = fileURLToPath(new URL("./", import.meta.url));
    const listed: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const relPath = rel === "" ? name : `${rel}/${name}`;
        if (statSync(full).isDirectory()) walk(full, relPath);
        else listed.push(relPath);
      }
    };
    walk(root.replace(/[\\/]$/, ""), "");
    const included = listed.filter(isHarnessImplementationFile);
    // 빈 순회로 통과하지 않도록: 실제 구현 파일이 충분히 잡혀야 한다.
    expect(included.length).toBeGreaterThan(10);
    expect(included).toContain("evaluate.ts");
    const offenders = included.filter((rel) =>
      /\bfrom\s+["'](?:\.\/|\.\.\/)*testing\//.test(readFileSync(`${root}${rel}`, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});

// ── 하네스 지문(순수 부분) ──────────────────────────────────────

describe("harnessManifest / harnessFingerprintOf", () => {
  const files = [
    { path: "b.ts", sha256: B },
    { path: "a.ts", sha256: A },
  ];

  it("[RED] 매니페스트 문장이 정확하다: 스키마 줄 + 경로\\t해시\\n(경로 바이트순)", () => {
    expect(harnessManifest(files)).toBe(
      `semgrep-lsp-harness-fingerprint/1\na.ts\t${A}\nb.ts\t${B}\n`
    );
  });

  it("[RED] 지문은 매니페스트 UTF-8의 sha256이다(손으로 계산한 값과 같다)", () => {
    expect(harnessFingerprintOf(files)).toBe(
      "aaf660ab101429a70ff89e0b344296d0d0e2154169d23197fac7d24733d9213a"
    );
    expect(harnessFingerprintOf(files)).toBe(sha256Hex(harnessManifest(files)));
  });

  it("[RED] 정렬은 UTF-8 바이트순이다: 대문자가 소문자 앞, '.'가 '/' 앞", () => {
    const text = harnessManifest([
      { path: "a/b.ts", sha256: C },
      { path: "a.ts", sha256: B },
      { path: "a.mjs", sha256: B },
      { path: "B.ts", sha256: A },
    ]);
    const paths = text
      .split("\n")
      .slice(1, -1)
      .map((line) => line.split("\t")[0]);
    // 'B'(0x42) < 'a'(0x61), "a.mjs" < "a.ts"('m' < 't'), "a.ts" < "a/b.ts"('.' 0x2E < '/' 0x2F)
    expect(paths).toEqual(["B.ts", "a.mjs", "a.ts", "a/b.ts"]);
  });

  it("[RED] 정렬은 UTF-16 코드 단위순이 아니라 UTF-8 바이트순이다(보충 평면 문자 대 전각 문자)", () => {
    // UTF-8: U+FF21 = EF BC A1, U+1F600 = F0 9F 98 80 → 전각이 앞.
    // UTF-16 코드 단위: U+1F600 = D83D DE00 < FF21 → 기본 문자열 정렬이면 이모지가 앞(틀린 순서).
    const fullwidth = `${String.fromCodePoint(0xff21)}.ts`;
    const emoji = `${String.fromCodePoint(0x1f600)}.ts`;
    const text = harnessManifest([
      { path: emoji, sha256: B },
      { path: fullwidth, sha256: A },
    ]);
    expect(text).toBe(`semgrep-lsp-harness-fingerprint/1\n${fullwidth}\t${A}\n${emoji}\t${B}\n`);
  });

  it("[RED] 입력 배열의 순서는 결과에 영향이 없다", () => {
    expect(harnessFingerprintOf([...files].reverse())).toBe(harnessFingerprintOf(files));
    expect(harnessManifest([...files].reverse())).toBe(harnessManifest(files));
  });

  it("[RED] 입력 배열을 바꾸지 않는다", () => {
    const input = structuredClone(files);
    harnessManifest(input);
    harnessFingerprintOf(input);
    expect(input).toEqual(files);
  });

  it("[RED] 파일이 하나도 없으면 던진다(빈 집합의 해시를 지문으로 쓰지 않는다)", () => {
    expect(() => harnessManifest([])).toThrow();
    expect(() => harnessFingerprintOf([])).toThrow();
  });

  it("[RED] 파일 해시 하나·파일 추가·파일 삭제·이름 변경은 모두 지문을 바꾼다", () => {
    const base = harnessFingerprintOf(files);
    const variants: Record<string, { path: string; sha256: string }[]> = {
      "해시 변경": [
        { path: "a.ts", sha256: C },
        { path: "b.ts", sha256: B },
      ],
      "파일 추가": [...files, { path: "c.ts", sha256: C }],
      "파일 삭제": [{ path: "a.ts", sha256: A }],
      "이름 변경": [
        { path: "a.ts", sha256: A },
        { path: "z.ts", sha256: B },
      ],
    };
    const seen = new Set<string>([base]);
    for (const [name, list] of Object.entries(variants)) {
      const fp = harnessFingerprintOf(list);
      expect(fp, name).not.toBe(base);
      seen.add(fp);
    }
    expect(seen.size).toBe(1 + Object.keys(variants).length); // 변형끼리도 서로 다르다
  });
});

// ── 하네스 지문(FsPort 읽기) ────────────────────────────────────

describe("computeHarnessFingerprint", () => {
  const ROOT = "/h";
  const base = (): Record<string, string | Uint8Array> => ({
    "/h/a.ts": "export const a = 1;\n",
    "/h/sub/b.mjs": "export const b = 2;\n",
    "/h/sub/deep/c.ts": "export const c = 3;\n",
    "/h/a.test.ts": "test a\n",
    "/h/sub/b.test.mjs": "test b\n",
    "/h/testing/helper.ts": "helper\n",
    "/h/data/pin.json": "{}\n",
    "/h/README.md": "# readme\n",
  });

  it("[RED] 포함 파일(중첩 포함)만 해시하고 매니페스트·지문이 순수 함수와 일치한다", async () => {
    const result = await computeHarnessFingerprint(new MemoryFs(base()), ROOT);
    expect(result).not.toBeNull();
    const files = (result?.files ?? []).map((f) => f.path).sort();
    expect(files).toEqual(["a.ts", "sub/b.mjs", "sub/deep/c.ts"]);
    const expectedFiles = [
      { path: "a.ts", sha256: sha256Hex("export const a = 1;\n") },
      { path: "sub/b.mjs", sha256: sha256Hex("export const b = 2;\n") },
      { path: "sub/deep/c.ts", sha256: sha256Hex("export const c = 3;\n") },
    ];
    expect([...(result?.files ?? [])].sort((x, y) => (x.path < y.path ? -1 : 1))).toEqual(
      expectedFiles
    );
    expect(result?.manifest).toBe(harnessManifest(expectedFiles));
    expect(result?.sha256).toBe(harnessFingerprintOf(expectedFiles));
  });

  it("[RED] 시험·testing·data·README 파일을 바꾸거나 더해도 지문은 그대로다", async () => {
    const before = await computeHarnessFingerprint(new MemoryFs(base()), ROOT);
    const changed = {
      ...base(),
      "/h/a.test.ts": "다른 시험 내용\n",
      "/h/testing/helper.ts": "다른 도우미\n",
      "/h/testing/new.ts": "새 파일\n",
      "/h/data/pin.json": '{"changed":true}\n',
      "/h/data/extra.ts": "export {};\n",
      "/h/README.md": "# 바뀐 문서\n",
      "/h/notes.json": "{}\n",
    };
    const after = await computeHarnessFingerprint(new MemoryFs(changed), ROOT);
    expect(before).not.toBeNull();
    expect(after?.sha256).toBe(before?.sha256);
    expect(after?.manifest).toBe(before?.manifest);
  });

  it("[RED] 포함 파일의 내용·추가·삭제·이름 변경은 지문을 바꾼다", async () => {
    const before = await computeHarnessFingerprint(new MemoryFs(base()), ROOT);
    const edited = { ...base(), "/h/sub/deep/c.ts": "export const c = 4;\n" };
    const added = { ...base(), "/h/sub/new.ts": "export {};\n" };
    const removed = base();
    delete removed["/h/a.ts"];
    const renamed = base();
    renamed["/h/renamed.ts"] = renamed["/h/a.ts"];
    delete renamed["/h/a.ts"];
    const fps = new Set<string | undefined>([before?.sha256]);
    for (const files of [edited, added, removed, renamed]) {
      const r = await computeHarnessFingerprint(new MemoryFs(files), ROOT);
      expect(r).not.toBeNull();
      fps.add(r?.sha256);
    }
    expect(fps.size).toBe(5);
  });

  it("[RED] 원시 바이트를 해시한다: 줄바꿈(CRLF 대 LF)만 달라도 지문이 다르다", async () => {
    const lf = await computeHarnessFingerprint(new MemoryFs({ "/h/a.ts": "line1\nline2\n" }), ROOT);
    const crlf = await computeHarnessFingerprint(
      new MemoryFs({ "/h/a.ts": "line1\r\nline2\r\n" }),
      ROOT
    );
    expect(lf).not.toBeNull();
    expect(crlf).not.toBeNull();
    expect(crlf?.sha256).not.toBe(lf?.sha256);
    // 파일별 해시도 원시 바이트의 sha256이다.
    expect(crlf?.files[0].sha256).toBe(sha256Hex(enc("line1\r\nline2\r\n")));
  });

  it("[RED] 포함 파일이 하나도 없으면 null이다(빈 집합의 해시가 아니다)", async () => {
    const onlyExcluded = new MemoryFs({
      "/h/a.test.ts": "t\n",
      "/h/testing/x.ts": "x\n",
      "/h/data/pin.json": "{}\n",
      "/h/README.md": "r\n",
    });
    expect(await computeHarnessFingerprint(onlyExcluded, ROOT)).toBeNull();
    expect(await computeHarnessFingerprint(new MemoryFs({}), ROOT)).toBeNull();
  });

  it("[RED] 파일을 읽지 못하면 던지지 않고 null이다", async () => {
    class ReadFails extends MemoryFs {
      override async readFile(): Promise<Uint8Array> {
        throw new Error("EACCES: 읽을 수 없다");
      }
    }
    await expect(computeHarnessFingerprint(new ReadFails(base()), ROOT)).resolves.toBeNull();
  });

  it("[RED] 목록을 얻지 못해도 던지지 않고 null이다", async () => {
    class ListFails extends MemoryFs {
      override async listFilesRecursive(): Promise<string[]> {
        throw new Error("EIO: 목록 실패");
      }
    }
    await expect(computeHarnessFingerprint(new ListFails(base()), ROOT)).resolves.toBeNull();
  });
});

// ── 대조 지문(순수 부분) ────────────────────────────────────────

describe("controlManifest / controlFingerprintOf", () => {
  const cases = [
    { path: "cases/b.js", fixture: "fixtures/b.js.in", sha256: TWO },
    { path: "cases/a.js", fixture: "fixtures/a.js.in", sha256: ONE },
  ];

  it("[RED] 매니페스트 문장이 정확하다: 스키마, expectations 줄, 경로 바이트순의 case 줄", () => {
    expect(controlManifest(E, cases)).toBe(
      `semgrep-lsp-control-fingerprint/1\nexpectations\t${E}\n` +
        `case\tcases/a.js\tfixtures/a.js.in\t${ONE}\n` +
        `case\tcases/b.js\tfixtures/b.js.in\t${TWO}\n`
    );
  });

  it("[RED] 지문은 매니페스트의 sha256이다(손으로 계산한 값과 같다)", () => {
    expect(controlFingerprintOf(E, cases)).toBe(
      "407e79b32c8344563c74d6e0f7bb1a6ed6afc652f3a3427d3979530d9ee04ad3"
    );
    expect(controlFingerprintOf(E, cases)).toBe(sha256Hex(controlManifest(E, cases)));
  });

  it("[RED] 사례는 경로의 UTF-8 바이트순으로 정렬된다(UTF-16 순서가 아니다)", () => {
    const fullwidth = `cases/${String.fromCodePoint(0xff21)}.js`;
    const emoji = `cases/${String.fromCodePoint(0x1f600)}.js`;
    const text = controlManifest(E, [
      { path: emoji, fixture: "f/emoji.in", sha256: TWO },
      { path: fullwidth, fixture: "f/wide.in", sha256: ONE },
      { path: "Cases/upper.js", fixture: "f/upper.in", sha256: A },
    ]);
    const order = text
      .split("\n")
      .slice(2, -1)
      .map((line) => line.split("\t")[1]);
    expect(order).toEqual(["Cases/upper.js", fullwidth, emoji]);
  });

  it("[RED] 사례 입력 순서는 영향이 없고, 입력 배열을 바꾸지 않는다", () => {
    const input = structuredClone(cases);
    expect(controlFingerprintOf(E, [...cases].reverse())).toBe(controlFingerprintOf(E, cases));
    controlManifest(E, input);
    expect(input).toEqual(cases);
  });

  it("[RED] expectations 해시가 지문에 들어간다", () => {
    expect(controlFingerprintOf(A, cases)).not.toBe(controlFingerprintOf(B, cases));
  });

  it("[RED] 사례의 경로·fixture 이름·해시 어느 하나만 바뀌어도 지문이 바뀐다", () => {
    const base = controlFingerprintOf(E, cases);
    const edits: Record<string, typeof cases> = {
      경로: [{ ...cases[0], path: "cases/z.js" }, cases[1]],
      fixture: [{ ...cases[0], fixture: "fixtures/other.in" }, cases[1]],
      해시: [{ ...cases[0], sha256: C }, cases[1]],
      "사례 삭제": [cases[0]],
    };
    for (const [name, list] of Object.entries(edits)) {
      expect(controlFingerprintOf(E, list), name).not.toBe(base);
    }
  });
});

// ── 대조 지문(FsPort 읽기) ──────────────────────────────────────

describe("computeControlFingerprint", () => {
  const EXPECTATIONS_PATH = "/repo/data/control-expectations.json";
  const FIXTURES_ROOT = "/repo/fixtures";

  function expectationsOf(order: readonly string[], claimed = ONE): ControlExpectations {
    const all = {
      "cases/a.js": { path: "cases/a.js", fixture: "a.js.in" },
      "cases/b.js": { path: "cases/b.js", fixture: "sub/b.js.in" },
    } as const;
    return {
      schema: "semgrep-lsp-control-expectations/1",
      note: "",
      detection_status: "UNVERIFIED",
      // sha256은 "주장"일 뿐이다: 지문은 실제로 읽은 바이트로 계산한다.
      cases: order.map((key) => ({ ...all[key as keyof typeof all], sha256: claimed })),
    } as unknown as ControlExpectations;
  }
  const files = (over: Record<string, string> = {}): Record<string, string> => ({
    [EXPECTATIONS_PATH]: '{"cases":"실제 파일 내용"}\n',
    "/repo/fixtures/a.js.in": "eval(a);\n",
    "/repo/fixtures/sub/b.js.in": "eval(b);\n",
    ...over,
  });
  const args = (expectations = expectationsOf(["cases/a.js", "cases/b.js"])) => ({
    expectationsPath: EXPECTATIONS_PATH,
    fixturesRoot: FIXTURES_ROOT,
    expectations,
  });

  it("[RED] 실제 바이트로 계산한 매니페스트·지문을 돌려준다(순수 함수와 일치)", async () => {
    const r = await computeControlFingerprint(new MemoryFs(files()), args());
    const expected = [
      { path: "cases/a.js", fixture: "a.js.in", sha256: sha256Hex("eval(a);\n") },
      { path: "cases/b.js", fixture: "sub/b.js.in", sha256: sha256Hex("eval(b);\n") },
    ];
    const expectationsSha = sha256Hex('{"cases":"실제 파일 내용"}\n');
    expect(r).not.toBeNull();
    expect(r?.manifest).toBe(controlManifest(expectationsSha, expected));
    expect(r?.sha256).toBe(controlFingerprintOf(expectationsSha, expected));
  });

  it("[RED] 대조 코드(.in 고정 입력)의 바이트 하나가 바뀌면 지문이 바뀐다", async () => {
    const before = await computeControlFingerprint(new MemoryFs(files()), args());
    const after = await computeControlFingerprint(
      new MemoryFs(files({ "/repo/fixtures/sub/b.js.in": "eval(b );\n" })),
      args()
    );
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after?.sha256).not.toBe(before?.sha256);
  });

  it("[RED] expectations 파일의 바이트가 바뀌면 지문이 바뀐다", async () => {
    const before = await computeControlFingerprint(new MemoryFs(files()), args());
    const after = await computeControlFingerprint(
      new MemoryFs(files({ [EXPECTATIONS_PATH]: '{"cases":"바뀐 내용"}\n' })),
      args()
    );
    expect(after).not.toBeNull();
    expect(after?.sha256).not.toBe(before?.sha256);
  });

  it("[RED] expectations.cases의 나열 순서가 달라도 지문은 같다", async () => {
    const fs = new MemoryFs(files());
    const forward = await computeControlFingerprint(
      fs,
      args(expectationsOf(["cases/a.js", "cases/b.js"]))
    );
    const reversed = await computeControlFingerprint(
      fs,
      args(expectationsOf(["cases/b.js", "cases/a.js"]))
    );
    expect(forward).not.toBeNull();
    expect(reversed?.sha256).toBe(forward?.sha256);
    expect(reversed?.manifest).toBe(forward?.manifest);
  });

  it("[RED] 기대 목록 안의 sha256 '주장'은 지문에 들어가지 않는다(실제 바이트만 쓴다)", async () => {
    const fs = new MemoryFs(files());
    const honest = await computeControlFingerprint(
      fs,
      args(expectationsOf(["cases/a.js", "cases/b.js"], ONE))
    );
    const lying = await computeControlFingerprint(
      fs,
      args(expectationsOf(["cases/a.js", "cases/b.js"], TWO))
    );
    expect(honest?.sha256).toBe(lying?.sha256);
  });

  it("[RED] 고정 입력을 읽지 못하면 null이다(던지지 않는다)", async () => {
    const withoutFixture = files();
    delete withoutFixture["/repo/fixtures/sub/b.js.in"];
    await expect(
      computeControlFingerprint(new MemoryFs(withoutFixture), args())
    ).resolves.toBeNull();
  });

  it("[RED] expectations 파일을 읽지 못하면 null이다(던지지 않는다)", async () => {
    const withoutExpectations = files();
    delete withoutExpectations[EXPECTATIONS_PATH];
    await expect(
      computeControlFingerprint(new MemoryFs(withoutExpectations), args())
    ).resolves.toBeNull();
  });
});

// ── 결합(binding) ───────────────────────────────────────────────

/** 시험 안에서 따로 구현한 명세 공식(§4). 운영 buildBinding이 이것과 같아야 한다. */
function specBinding(c: BindingComponents): string {
  return sha256Hex(
    canonicalJson({
      schema: "semgrep-lsp-binding/1",
      tool: { version: c.tool_version, wheel_sha256: c.wheel_sha256 },
      pin_sha256: c.pin_sha256,
      rules: { list_sha256: c.rules_list_sha256, expected_sha256: c.rules_expected_sha256 },
      harness_sha256: c.harness_sha256,
      control_sha256: c.control_sha256,
    })
  );
}

describe("buildBinding", () => {
  const components = (): BindingComponents => ({
    tool_version: "1.180.0",
    wheel_sha256: sha256Hex("wheel"),
    pin_sha256: sha256Hex("pin"),
    rules_list_sha256: sha256Hex("rules-list"),
    rules_expected_sha256: sha256Hex("rules-expected"),
    harness_sha256: sha256Hex("harness"),
    control_sha256: sha256Hex("control"),
  });

  it("[RED] 같은 입력이면 같은 64자리 16진수 해시다", () => {
    const first = buildBinding(components());
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(buildBinding(components())).toBe(first);
  });

  it("[RED] 명세 공식(canonicalJson의 sha256)과 같다", () => {
    expect(buildBinding(components())).toBe(specBinding(components()));
  });

  it("[RED] 일곱 구성 요소 중 하나만 바뀌어도 값이 바뀐다(서로 다른 값이다)", () => {
    const base = buildBinding(components());
    const changes: Record<keyof BindingComponents, string> = {
      tool_version: "1.181.0",
      wheel_sha256: sha256Hex("other-wheel"),
      pin_sha256: sha256Hex("other-pin"),
      rules_list_sha256: sha256Hex("other-list"),
      rules_expected_sha256: sha256Hex("other-expected"),
      harness_sha256: sha256Hex("other-harness"),
      control_sha256: sha256Hex("other-control"),
    };
    const seen = new Set<string | null>([base]);
    for (const [key, value] of Object.entries(changes)) {
      const changed = { ...components(), [key]: value };
      const result = buildBinding(changed);
      expect(result, key).not.toBe(base);
      expect(result, key).toBe(specBinding(changed));
      seen.add(result);
    }
    expect(seen.size).toBe(1 + Object.keys(changes).length);
  });

  it("[RED] 구성 요소가 하나라도 null이면 null이다(검증 못 한 두 실행이 '일치'하지 않게)", () => {
    for (const key of Object.keys(components()) as (keyof BindingComponents)[]) {
      const withNull = { ...components(), [key]: null } as unknown as BindingComponents;
      expect(buildBinding(withNull), key).toBeNull();
    }
    const allNull = {
      tool_version: null,
      wheel_sha256: null,
      pin_sha256: null,
      rules_list_sha256: null,
      rules_expected_sha256: null,
      harness_sha256: null,
      control_sha256: null,
    } as unknown as BindingComponents;
    expect(buildBinding(allNull)).toBeNull();
  });

  it("[RED] 입력 객체를 바꾸지 않는다", () => {
    const input = components();
    const copy = structuredClone(input);
    buildBinding(input);
    expect(input).toEqual(copy);
  });
});
