import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createNodeProcessPort } from "./process-node";

// 구조 보증: 소스를 읽어 "이 디렉터리가 하지 않는 일"을 지킨다. 이 파일 자신은 검사 대상에서 뺀다(패턴을 담고 있다).
// 주석은 줄 단위로 걷어내고(줄 머리의 // , /* , * 와 ' //' 뒤), 문자열 안의 URL(`://`)은 건드리지 않는다.

const BASE = fileURLToPath(new URL("./", import.meta.url));
const ROOT = resolve(BASE, "..", "..");
const SELF = "structure.test.ts";
const CLI_ENTRY_MARKER = "// ── 진입점(직접 실행할 때만)";

interface Source {
  /** BASE 기준 상대 경로('/' 구분). */
  rel: string;
  isTest: boolean;
  isMjs: boolean;
  raw: string;
  /** 주석을 걷어낸 코드. */
  code: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function stripComments(text: string): string {
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
    kept.push(line.replace(/\s\/\/.*$/, ""));
  }
  return kept.join("\n");
}

const sources: Source[] = walk(BASE)
  .filter((f) => /\.(ts|mjs)$/.test(f))
  .map((f) => {
    const rel = relative(BASE, f).split(sep).join("/");
    const raw = readFileSync(f, "utf8");
    return {
      rel,
      isTest: rel.endsWith(".test.ts"),
      isMjs: rel.endsWith(".mjs"),
      raw,
      code: stripComments(raw),
    };
  })
  .filter((s) => s.rel !== SELF);

const nonTest = sources.filter((s) => !s.isTest);
const byRel = (rel: string): Source => {
  const found = sources.find((s) => s.rel === rel);
  if (!found) throw new Error(`소스를 찾지 못했다: ${rel}`);
  return found;
};

const ADAPTERS = ["process-node.ts", "git-node.ts"];

/** import/require/동적 import 지정자를 모두 뽑는다. */
function specifiersOf(code: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s+["']([^"']+)["']/gm,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) out.push(m[1]);
  return out;
}

const bare = (spec: string): string => spec.replace(/^node:/, "");

describe("구조 — 소스 목록", () => {
  it("검사 대상이 비어 있지 않다(시험이 헛돌지 않는다)", () => {
    expect(sources.length).toBeGreaterThan(30);
    expect(nonTest.map((s) => s.rel)).toEqual(
      expect.arrayContaining([
        "cli.ts",
        "process-node.ts",
        "git-node.ts",
        "fs-node.ts",
        "testing/stub-child.mjs",
      ])
    );
  });
});

describe("구조 (1)(7) — child_process는 두 어댑터만 쓴다", () => {
  it("child_process를 가져오는 파일은 process-node.ts와 git-node.ts뿐이다(시험·스텁 포함)", () => {
    const importers = sources
      .filter((s) => specifiersOf(s.code).some((spec) => bare(spec) === "child_process"))
      .map((s) => s.rel)
      .sort();
    expect(importers).toEqual([...ADAPTERS].sort());
  });

  it("두 어댑터는 실제로 호출 지점을 갖는다(검사가 헛돌지 않는다)", () => {
    expect(byRel("process-node.ts").code).toMatch(/\bnodeSpawn\s*\(/);
    expect(byRel("git-node.ts").code).toMatch(/\bexecFile\s*\(/);
  });

  it("그 밖의 파일에는 child_process 호출 식별자(execFile·spawnSync·nodeSpawn 등)가 없다", () => {
    const offenders = sources
      .filter((s) => !ADAPTERS.includes(s.rel))
      .filter((s) => /\b(execFile|execFileSync|execSync|spawnSync|nodeSpawn)\b/.test(s.code))
      .map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it("process.binding으로 우회하는 코드가 없다", () => {
    expect(
      sources.filter((s) => /process\s*\.\s*binding\b/.test(s.code)).map((s) => s.rel)
    ).toEqual([]);
  });

  it("git 어댑터는 shell을 쓰지 않는다(shell:false)", () => {
    const code = byRel("git-node.ts").code;
    expect(code).toMatch(/shell:\s*false/);
    expect(code).not.toMatch(/shell:\s*true/);
    const proc = byRel("process-node.ts").code;
    expect(proc).toMatch(/shell:\s*false/);
    expect(proc).not.toMatch(/shell:\s*true/);
  });
});

describe("구조 (2) — 네트워크 모듈과 fetch가 없다", () => {
  const NET = new Set(["net", "http", "https", "http2", "dgram", "dns", "tls", "dns/promises"]);

  it("net·http·https·dgram·dns를 가져오는 파일이 없다(시험·스텁 포함)", () => {
    const offenders = sources
      .filter((s) => specifiersOf(s.code).some((spec) => NET.has(bare(spec))))
      .map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it("fetch( 호출과 WebSocket·XMLHttpRequest 사용이 없다", () => {
    const offenders = sources
      .filter((s) => /(?<![.\w\\])fetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b/.test(s.code))
      .map((s) => s.rel);
    expect(offenders).toEqual([]);
  });
});

describe("구조 (3) — 환경·argv·exit는 cli.ts의 진입점만 만진다", () => {
  const ENV = /\bprocess\s*\.\s*(env|argv|exit|exitCode)\b/;

  it("비시험 소스(스텁 자식 제외)에는 process.env·argv·exit가 없다 — cli.ts 진입점 구역 제외", () => {
    const offenders: string[] = [];
    for (const s of nonTest.filter((x) => !x.isMjs)) {
      const code =
        s.rel === "cli.ts" ? s.code.slice(0, s.code.indexOf("async function runEntry")) : s.code;
      if (ENV.test(code)) offenders.push(s.rel);
    }
    expect(offenders).toEqual([]);
  });

  it("cli.ts에 진입점 표지가 있고, 그 구역에서만 process를 만진다", () => {
    const cli = byRel("cli.ts");
    expect(cli.raw).toContain(CLI_ENTRY_MARKER);
    const entry = cli.code.slice(cli.code.indexOf("async function runEntry"));
    expect(entry).toMatch(/process\.env/);
    expect(entry).toMatch(/process\.argv/);
    expect(entry).not.toMatch(/process\s*\.\s*exit\s*\(/); // exitCode만 쓴다(출력을 비운 뒤 끝난다)
  });

  it("진입점은 이 파일을 직접 실행했을 때만 돈다(import만으로는 아무것도 하지 않는다)", () => {
    const cli = byRel("cli.ts");
    const tail = cli.code.slice(cli.code.indexOf("async function runEntry"));
    // runEntry의 호출은 단 한 곳이고 argv[1]과 이 파일 경로를 비교하는 조건 안에 있다.
    const calls = [...tail.matchAll(/\brunEntry\s*\(/g)];
    expect(calls).toHaveLength(2); // 정의 한 번 + 호출 한 번
    expect(tail).toMatch(
      /if \(invokedPath\.toLowerCase\(\) === resolvePath\(fileURLToPath\(import\.meta\.url\)\)\.toLowerCase\(\)\) \{\s*void runEntry\(\);/
    );
  });

  it("node:process를 가져오는 비시험 소스가 없다", () => {
    expect(
      nonTest
        .filter((s) => specifiersOf(s.code).some((x) => bare(x) === "process"))
        .map((s) => s.rel)
    ).toEqual([]);
  });
});

describe("구조 (4) — package.json은 이 하네스와 연결되지 않는다", () => {
  const pkgText = readFileSync(join(ROOT, "package.json"), "utf8");
  const pkg = JSON.parse(pkgText) as Record<string, unknown>;

  it("어떤 스크립트도 semgrep을 가리키지 않는다", () => {
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    for (const [name, value] of Object.entries(scripts)) {
      expect(name.toLowerCase(), name).not.toContain("semgrep");
      expect(value.toLowerCase(), name).not.toContain("semgrep");
    }
  });

  it("semgrep 의존성이 없고 package.json 어디에도 semgrep이라는 말이 없다", () => {
    expect(pkgText.toLowerCase()).not.toContain("semgrep");
  });
});

describe("구조 (5) — 디렉터리 밖을 가리키지 않고 기존 설정을 건드리지 않는다", () => {
  it("모든 import는 node:*·vitest 또는 이 디렉터리 안의 상대 경로다", () => {
    const offenders: string[] = [];
    for (const s of sources) {
      const dir = dirname(join(BASE, s.rel));
      for (const spec of specifiersOf(s.code)) {
        if (spec.startsWith(".")) {
          const target = resolve(dir, spec);
          if (target !== BASE.replace(/[\\/]$/, "") && !target.startsWith(BASE)) {
            offenders.push(`${s.rel}: ${spec}`);
          }
        } else if (!spec.startsWith("node:") && spec !== "vitest") {
          offenders.push(`${s.rel}: ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("비시험 소스의 문자열에 .moai/config·quality.yaml·lsp.yaml·lsp_security_warnings 참조가 없다", () => {
    const literal =
      /(["'`])(?:(?!\1).)*(?:\.moai\/config|quality\.yaml|lsp\.yaml|(?<![A-Za-z_])lsp_security_warnings)(?:(?!\1).)*\1/;
    const offenders = nonTest.filter((s) => literal.test(s.code)).map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it("cli.ts는 설정·임계값·훅을 가리키는 말을 코드에 담지 않는다", () => {
    const code = byRel("cli.ts").code;
    // timeoutThreshold는 Semgrep 시간 제한 설정의 이름이지 게이트 임계값이 아니다.
    expect(code).not.toMatch(
      /quality\.yaml|lsp\.yaml|\.moai\/config|(?<!timeout)thresholds?\b|hooks?\b/i
    );
  });
});

describe("구조 (6) — 대조 예제(.in)는 정적 입력이다", () => {
  it("비시험 소스에 .moai/fixtures 경로 문자열이 없다", () => {
    expect(nonTest.filter((s) => /\.moai\/fixtures/.test(s.code)).map((s) => s.rel)).toEqual([]);
  });

  it(".in 파일을 import·require하는 코드가 없다", () => {
    const offenders = sources
      .filter((s) => specifiersOf(s.code).some((spec) => /\.in$/.test(spec)))
      .map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it("비시험 소스에서 node:fs를 가져오는 곳은 fs 어댑터와 시험 지원 도구(고정 입력 JSON만 읽는다)뿐이다", () => {
    const users = nonTest
      .filter((s) => specifiersOf(s.code).some((spec) => bare(spec).split("/")[0] === "fs"))
      .map((s) => s.rel)
      .sort();
    expect(users).toEqual(
      ["fs-node.ts", "testing/evaluate-fixtures.ts", "testing/synthetic-data.ts"].sort()
    );
    for (const rel of users.filter((r) => r.startsWith("testing/"))) {
      const code = byRel(rel).code;
      expect(code, rel).not.toMatch(/semgrep-control|fixtures\/|\.in["'`]/);
    }
  });
});

describe("구조 (8) — 실제 프로세스 포트는 실수로 얻을 수 없다", () => {
  it("provenance는 필수 인자다(타입 수준)", () => {
    // @ts-expect-error provenance 없이 부를 수 없다
    expect(() => createNodeProcessPort({})).toThrow(TypeError);
    // @ts-expect-error 인자 없이 부를 수 없다
    expect(() => createNodeProcessPort()).toThrow(TypeError);
  });

  it("옵션 타입의 provenance에 ?가 없고 기본값 구문도 없다", () => {
    const code = byRel("process-node.ts").code;
    expect(code).toMatch(/interface NodeProcessPortOptions\s*\{\s*provenance:\s*Provenance;/);
    expect(code).toMatch(/function createNodeProcessPort\(options:\s*NodeProcessPortOptions\)/);
    expect(code).not.toMatch(/provenance\s*=\s*["']/);
    expect(code).not.toMatch(/provenance\?\s*:/);
  });

  it("createNodeProcessPort를 부르는 비시험 코드는 cli.ts 진입점뿐이고 리터럴을 넘기지 않는다", () => {
    const callers = nonTest
      .filter((s) => s.rel !== "process-node.ts")
      .filter((s) => /\bcreateNodeProcessPort\s*\(/.test(s.code))
      .map((s) => s.rel);
    expect(callers).toEqual(["cli.ts"]);
    const cli = byRel("cli.ts").code;
    const before = cli.slice(0, cli.indexOf("async function runEntry"));
    expect(before).not.toMatch(/createNodeProcessPort\s*\(/);
    const call = cli.match(/createNodeProcessPort\(\s*\{([^}]*)\}\s*\)/);
    expect(call?.[1].trim()).toBe("provenance");
  });

  it('"real"을 포트 공장에 넘기는 곳은 cli.ts의 run 한 곳이고 방지 장치 뒤에 있다', () => {
    const offenders = nonTest
      .filter((s) => s.rel !== "cli.ts")
      .filter((s) => /makeProcessPort\s*\(\s*["']real["']/.test(s.code))
      .map((s) => s.rel);
    expect(offenders).toEqual([]);
    const cli = byRel("cli.ts").code;
    const occurrences = [...cli.matchAll(/makeProcessPort\s*\(\s*["']real["']\s*\)/g)];
    expect(occurrences).toHaveLength(1);
    const at = occurrences[0].index as number;
    const guard = cli.indexOf("await missingGuardConditions(");
    const refusal = cli.indexOf("return EXIT.notRun");
    expect(guard).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(guard);
    expect(at).toBeGreaterThan(refusal);
  });

  it('시험은 createNodeProcessPort를 "stub"으로만 부른다', () => {
    const offenders: string[] = [];
    for (const s of sources.filter((x) => x.isTest)) {
      for (const m of s.code.matchAll(
        /createNodeProcessPort\(\s*\{\s*provenance:\s*([^}]*?)\s*\}/g
      )) {
        if (m[1] !== '"stub"') offenders.push(`${s.rel}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("구조 (9) — 규칙 원문은 저장소에 없다", () => {
  it(".moai/cache/는 gitignore되어 있다", () => {
    const lines = readFileSync(join(ROOT, ".gitignore"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim());
    expect(lines).toContain(".moai/cache/");
  });

  it("이 디렉터리와 .moai/fixtures의 파일에 규칙 YAML 본문(rules: + pattern 키)이 없다", () => {
    const targets = [
      ...walk(BASE).filter((f) => !/[\\/]data[\\/][^\\/]+\.(tsv|json)$/.test(f)),
      ...walk(join(ROOT, ".moai", "fixtures")),
    ];
    expect(targets.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const file of targets) {
      const text = readFileSync(file, "utf8");
      const hasRules = /^\s*-?\s*rules:\s*$/m.test(text);
      const hasPattern = /^\s*-?\s*(pattern|patterns|pattern-either|pattern-regex):/m.test(text);
      if (hasRules && hasPattern) offenders.push(relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});
