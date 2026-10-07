import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  SCAN_ROOTS,
  compareToAllowlist,
  findAssignmentLines,
  scanTree,
  type AllowlistEntry,
  type OracleHit,
} from "./engine-ready-oracle";

// SPEC-B2C-LAUNCH-001 M3b (AC-B2CLAUNCH-012) — 저장소 코드 오라클 시험.
// 이 오라클은 AC가 적은 명령(두 단계 정규식 + `//`·`*`·`#` 시작 줄 거르기 + 시험 파일 제외)을 옮긴 것이다.
// AC가 적은 맹점을 그대로 둔다: 공백으로 구분하는 `ENV` 형태와 `??=` 대입은 일치하지 않고, 변수 이름을 계산해
// 만드는 대입과 `.env*` 실제 파일·운영 호스트의 환경은 보지 못한다. 시험 파일(`*.test.*`)은 오라클 대상이 아니며
// 그래서 이 파일 안의 예시 줄은 스캔에 걸리지 않는다.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 허용 목록: 시험 하네스(임시 서버 환경)의 두 줄. 줄 번호가 아니라 줄 내용으로 대조한다. */
const HARNESS_ALLOWLIST: AllowlistEntry[] = [
  { file: "scripts/verify-flag-runtime.ts", text: "DIAGNOSIS_ENGINE_READY: String(start.engine)," },
  {
    file: "scripts/verify-flag-runtime.ts",
    text: "env.DIAGNOSIS_ENGINE_READY = String(flags.diag.engine);",
  },
];

const linesOf = (source: string) => findAssignmentLines(source).map((hit) => hit.line);

describe("findAssignmentLines — 샘플 시험", () => {
  const MATCH: [string, string][] = [
    ["DIAGNOSIS_ENGINE_READY=true", "대입"],
    ['process.env.DIAGNOSIS_ENGINE_READY = "true"', "점 접근 대입"],
    ['process.env["DIAGNOSIS_ENGINE_READY"] = "true"', "대괄호 접근 대입"],
    ['  "DIAGNOSIS_ENGINE_READY": "true",', "JSON 키"],
    ["DIAGNOSIS_ENGINE_READY: 'true'", "객체 속성"],
    ["DIAGNOSIS_ENGINE_READY = `true`", "백틱 값"],
    ["export DIAGNOSIS_ENGINE_READY=1", "셸 export"],
    ["env.DIAGNOSIS_ENGINE_READY = String(flags.diag.engine);", "하네스 형태의 동적 값 대입"],
    ["    DIAGNOSIS_ENGINE_READY\t=\ttrue", "탭 공백"],
  ];

  it.each(MATCH)("%s — %s 는 일치한다", (source) => {
    expect(linesOf(source)).toEqual([1]);
  });

  const NO_MATCH: [string, string][] = [
    ["ENV DIAGNOSIS_ENGINE_READY true", "공백으로 구분하는 형태(이 명령의 맹점)"],
    ['env.DIAGNOSIS_ENGINE_READY ??= "true"', "??= 대입(이 명령의 맹점)"],
    ['if (env.DIAGNOSIS_ENGINE_READY === "true") {', "=== 비교"],
    ['if (env.DIAGNOSIS_ENGINE_READY == "true") {', "== 비교"],
    ["isFlagEnabled(env.DIAGNOSIS_ENGINE_READY) && ok", "읽기"],
    ["DIAGNOSIS_ENGINE_READY=", "값이 없는 대입(명령의 정규식이 값 한 글자를 요구한다)"],
    ['const NAME = "DIAGNOSIS_ENGINE_READY";', "이름 문자열 상수"],
  ];

  it.each(NO_MATCH)("%s — %s 는 일치하지 않는다", (source) => {
    expect(linesOf(source)).toEqual([]);
  });

  it("//·*·# 로 시작하는 줄은 대입처럼 보여도 거른다", () => {
    for (const line of [
      "// DIAGNOSIS_ENGINE_READY=true",
      "   // DIAGNOSIS_ENGINE_READY=true",
      " * DIAGNOSIS_ENGINE_READY=true",
      "\t* DIAGNOSIS_ENGINE_READY: 'true'",
      "# DIAGNOSIS_ENGINE_READY=true",
    ]) {
      expect(linesOf(line), line).toEqual([]);
    }
  });

  it("줄 끝에 붙은 주석과 /* 로 시작하는 줄은 거르지 않는다(명령의 필터는 줄 시작만 본다)", () => {
    expect(linesOf("run(); // DIAGNOSIS_ENGINE_READY=true")).toEqual([1]);
    expect(linesOf("/* DIAGNOSIS_ENGINE_READY=true */")).toEqual([1]);
  });

  it("줄 번호는 1부터 세고 CRLF 줄바꿈도 같다", () => {
    expect(
      linesOf("a\nb\nDIAGNOSIS_ENGINE_READY=true\nc\nexport DIAGNOSIS_ENGINE_READY=1")
    ).toEqual([3, 5]);
    expect(linesOf("a\r\nDIAGNOSIS_ENGINE_READY=true\r\n")).toEqual([2]);
  });

  it("일치한 줄의 앞뒤 공백을 뺀 내용을 돌려준다", () => {
    expect(findAssignmentLines("  DIAGNOSIS_ENGINE_READY=true  ")).toEqual([
      { line: 1, text: "DIAGNOSIS_ENGINE_READY=true" },
    ]);
  });
});

describe("scanTree — 스캔 범위와 제외 규칙", () => {
  const temp: string[] = [];
  afterEach(() => {
    for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function makeTree(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "engine-ready-oracle-"));
    temp.push(dir);
    for (const [name, content] of Object.entries(files)) {
      const path = join(dir, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    return dir;
  }

  it("지정한 경로의 비시험 파일에서만 대입 줄을 찾고 시험 파일(*.test.*)은 제외한다", () => {
    const dir = makeTree({
      "lib/a.ts": "const a = 1;\nprocess.env.DIAGNOSIS_ENGINE_READY = 'true';\n",
      "lib/a.test.ts": "DIAGNOSIS_ENGINE_READY=true\n",
      "lib/deep/b.spec.test.tsx": "DIAGNOSIS_ENGINE_READY=true\n",
      "app/page.tsx": "export default function Page() { return null; }\n",
      ".github/workflows/deploy.yml": "env:\n  DIAGNOSIS_ENGINE_READY: true\n",
      "package.json": '{ "name": "x" }\n',
      "outside/c.ts": "DIAGNOSIS_ENGINE_READY=true\n",
    });
    const { hits, missing } = scanTree(dir, ["app", "lib", ".github", "package.json"]);
    expect(missing).toEqual([]);
    expect(hits).toEqual([
      { file: ".github/workflows/deploy.yml", line: 2, text: "DIAGNOSIS_ENGINE_READY: true" },
      { file: "lib/a.ts", line: 2, text: "process.env.DIAGNOSIS_ENGINE_READY = 'true';" },
    ]);
  });

  it("파일을 경로로 직접 지정할 수 있고(루트 설정 파일) 없는 경로는 missing으로 알린다", () => {
    const dir = makeTree({ "instrumentation.ts": "DIAGNOSIS_ENGINE_READY=true\n" });
    const { hits, missing } = scanTree(dir, ["instrumentation.ts", "playwright.config.ts", "app"]);
    expect(hits.map((hit) => hit.file)).toEqual(["instrumentation.ts"]);
    expect(missing).toEqual(["playwright.config.ts", "app"]);
  });

  it("점으로 시작하는 파일(.env.local.example)도 스캔한다", () => {
    const dir = makeTree({ ".env.local.example": "DIAGNOSIS_ENGINE_READY=true\n" });
    expect(scanTree(dir, [".env.local.example"]).hits).toHaveLength(1);
  });

  it("스캔 범위는 AC가 적은 경로 목록과 같다", () => {
    expect([...SCAN_ROOTS]).toEqual([
      "app",
      "components",
      "lib",
      "scripts",
      "instrumentation.ts",
      "playwright.config.ts",
      "package.json",
      ".github",
      ".env.local.example",
    ]);
  });
});

describe("compareToAllowlist", () => {
  const hit = (file: string, text: string, line = 1): OracleHit => ({ file, line, text });

  it("허용 목록과 정확히 같으면 불일치가 없다(줄 번호는 보지 않는다)", () => {
    const result = compareToAllowlist(
      [hit("scripts/h.ts", "X=1", 10), hit("scripts/h.ts", "Y=2", 99)],
      [
        { file: "scripts/h.ts", text: "Y=2" },
        { file: "scripts/h.ts", text: "X=1" },
      ]
    );
    expect(result).toEqual({ unexpected: [], unusedAllowlist: [] });
  });

  it("허용 목록에 없는 줄은 unexpected로 알린다", () => {
    const extra = hit("lib/a.ts", "X=1");
    const result = compareToAllowlist(
      [hit("scripts/h.ts", "X=1"), extra],
      [{ file: "scripts/h.ts", text: "X=1" }]
    );
    expect(result.unexpected).toEqual([extra]);
    expect(result.unusedAllowlist).toEqual([]);
  });

  it("같은 내용이어도 파일이 다르면 허용 목록에 없는 줄이다", () => {
    const result = compareToAllowlist(
      [hit("lib/h.ts", "X=1")],
      [{ file: "scripts/h.ts", text: "X=1" }]
    );
    expect(result.unexpected).toHaveLength(1);
    expect(result.unusedAllowlist).toHaveLength(1);
  });

  it("허용 목록 항목이 현재 트리에 없으면 unusedAllowlist로 알린다(정확히 같아야 통과)", () => {
    const result = compareToAllowlist([], [{ file: "scripts/h.ts", text: "X=1" }]);
    expect(result.unusedAllowlist).toEqual([{ file: "scripts/h.ts", text: "X=1" }]);
  });

  it("허용 목록 한 항목은 같은 줄 하나만 허용한다(복제된 대입은 unexpected)", () => {
    const result = compareToAllowlist(
      [hit("scripts/h.ts", "X=1", 1), hit("scripts/h.ts", "X=1", 2)],
      [{ file: "scripts/h.ts", text: "X=1" }]
    );
    expect(result.unexpected).toHaveLength(1);
  });
});

describe("현재 트리의 저장소 코드 오라클 (AC-B2CLAUNCH-012)", () => {
  const scan = scanTree(ROOT);

  it("AC가 적은 경로가 모두 있다", () => {
    expect(scan.missing).toEqual([]);
  });

  it("비시험 코드에서 DIAGNOSIS_ENGINE_READY를 대입하는 줄은 하네스 허용 목록 두 줄뿐이다", () => {
    const { unexpected, unusedAllowlist } = compareToAllowlist(scan.hits, HARNESS_ALLOWLIST);
    expect(unexpected, "허용 목록 밖의 대입 줄").toEqual([]);
    expect(unusedAllowlist, "트리에서 사라진 허용 목록 항목").toEqual([]);
    expect(scan.hits).toHaveLength(2);
  });

  it("app·components·lib·.github에서는 0줄이다", () => {
    const outsideHarness = scan.hits.filter((h) => !h.file.startsWith("scripts/"));
    expect(outsideHarness).toEqual([]);
  });
});
