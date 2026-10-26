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

  // 루프백 수신기(ADR C9) 때문에 네트워크 모듈을 가져오는 파일은 정확히 둘이다: 수신기 어댑터와, 그 수신기에 로컬 요청을 보내는
  // 시험 클라이언트. 그 밖의 파일(시험·스텁 포함)은 여전히 가져올 수 없다. 두 파일의 사용 범위는 아래 구조 (11)이 지킨다.
  const NET_ALLOWED = ["metrics-node.ts", "testing/loopback-client.ts"];

  it("net·http·https·dgram·dns를 가져오는 파일은 루프백 수신기 어댑터와 시험 클라이언트뿐이다(시험·스텁 포함)", () => {
    const offenders = sources
      .filter((s) => specifiersOf(s.code).some((spec) => NET.has(bare(spec))))
      .map((s) => s.rel)
      .sort();
    expect(offenders).toEqual([...NET_ALLOWED].sort());
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
    // 공유 실행 잠금의 노드 어댑터(run-lock-node.ts)와 그 경쟁 시험용 자식 프로세스(testing/lock-child.mjs)가 더해졌다.
    // 잠금 어댑터는 잠금 파일만 만지고(만들기·읽기·지우기), 자식은 시험 폴더의 표지 파일과 잠금 파일만 만진다.
    // 휠 아티팩트 해시 어댑터(artifact-node.ts)가 더해졌다: 호출자가 명시한 파일 하나를 읽기 전용으로 열 뿐 아무것도 쓰지 않는다
    // (아래 "도구 버전·휠 관측" 구조 시험이 읽기 전용임을 지킨다).
    // 프로세스 목록 어댑터(process-list-node.ts)가 더해졌다: /proc을 나열하고 읽을 뿐 아무것도 쓰지 않는다
    // (아래 "구조 (12)"가 읽기 전용·종료 금지를 지킨다).
    expect(users).toEqual(
      [
        "artifact-node.ts",
        "fs-node.ts",
        "process-list-node.ts",
        "run-lock-node.ts",
        "testing/evaluate-fixtures.ts",
        "testing/lock-child.mjs",
        "testing/synthetic-data.ts",
      ].sort()
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

describe("구조 (10) — 지문 제외 범위가 구멍이 되지 않는다", () => {
  it("운영 소스(시험·testing/ 제외)는 testing/ 아래를 가져오지 않는다", () => {
    const production = nonTest.filter((s) => !s.rel.startsWith("testing/"));
    expect(production.length).toBeGreaterThan(20); // 검사가 헛돌지 않는다
    const offenders = production
      .filter((s) => specifiersOf(s.code).some((spec) => /(^|\/)testing(\/|$)/.test(spec)))
      .map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it("지문·참조·정규 직렬화 모듈은 순수하다: node:fs·child_process·net·process 접근이 없다", () => {
    const pure = [
      "fingerprint.ts",
      "reference.ts",
      "canonical.ts",
      "path-containment.ts",
      "run-id.ts",
      "tool-observation.ts",
      "process-observation.ts",
      "process-list.ts",
    ];
    const FORBIDDEN = new Set([
      "fs",
      "child_process",
      "net",
      "http",
      "https",
      "dgram",
      "dns",
      "process",
    ]);
    for (const rel of pure) {
      const s = byRel(rel);
      const imported = specifiersOf(s.code).map((spec) => bare(spec).split("/")[0]);
      expect(
        imported.filter((m) => FORBIDDEN.has(m)),
        rel
      ).toEqual([]);
      expect(s.code, rel).not.toMatch(/\bprocess\s*\.\s*(env|argv|exit|exitCode|binding)\b/);
      expect(s.code, rel).not.toMatch(/(?<![.\w\\])fetch\s*\(/);
    }
  });

  it("지문 계산은 FsPort로만 읽는다: fingerprint.ts는 FsPort를 받고 node:* 중 crypto 계열(sha.ts 경유)만 쓴다", () => {
    const s = byRel("fingerprint.ts");
    expect(s.code).toMatch(/computeHarnessFingerprint\(\s*fs:\s*FsPort/);
    expect(s.code).toMatch(/computeControlFingerprint\(\s*fs:\s*FsPort/);
    expect(specifiersOf(s.code).filter((spec) => spec.startsWith("node:"))).toEqual([]);
  });
});

describe("구조 (11) — 공유 실행 잠금과 루프백 수신기의 범위", () => {
  const NET_MODULES = new Set([
    "net",
    "http",
    "https",
    "http2",
    "dgram",
    "dns",
    "tls",
    "dns/promises",
  ]);
  const importLines = (code: string): string[] =>
    code.split("\n").filter((line) => /^\s*import\b/.test(line));

  describe("루프백 수신기(metrics-node.ts)", () => {
    const code = (): string => byRel("metrics-node.ts").code;

    it("127.0.0.1과 OS가 정하는 포트(0)에만 바인딩한다 — 다른 호스트·모든 인터페이스·호스트 이름이 없다", () => {
      expect(code()).toMatch(/const HOST = "127\.0\.0\.1";/);
      expect(code()).toMatch(/listen\(\{\s*host:\s*HOST,\s*port:\s*0\s*\}/);
      for (const bad of ["0.0.0.0", '"::"', "localhost", "listen(0", "listen(8", "port: 9"]) {
        expect(code(), bad).not.toContain(bad);
      }
      // 열린 주소가 127.0.0.1인지 다시 확인한다.
      expect(code()).toMatch(/address\.address !== HOST/);
    });

    it("밖으로 나가는 호출이 없다 — 서버를 만들기만 하고 요청·접속 API를 쓰지 않는다", () => {
      expect(code()).toMatch(/createServer/);
      for (const bad of [
        ".request(",
        ".get(",
        "createConnection",
        "connect(",
        "fetch",
        "WebSocket",
      ]) {
        expect(code(), bad).not.toContain(bad);
      }
    });

    it("요청의 본문·헤더·URL·토큰을 읽거나 저장하지 않는다 — 본문은 버리고 건수만 센다", () => {
      for (const bad of [
        "request.url",
        ".headers",
        ".rawHeaders",
        "request.on(",
        'on("data"',
        "setEncoding",
        "readFileSync",
        "writeFile",
      ]) {
        expect(code(), bad).not.toContain(bad);
      }
      expect(code()).toMatch(/request\.resume\(\)/);
    });

    it("네트워크 모듈은 node:http 하나만 가져온다", () => {
      const specs = specifiersOf(byRel("metrics-node.ts").code).map(bare);
      expect(specs.filter((s) => NET_MODULES.has(s))).toEqual(["http"]);
    });
  });

  describe("시험 클라이언트(testing/loopback-client.ts)", () => {
    it("대상이 127.0.0.1이 아니면 접속하기 전에 던진다", () => {
      const code = byRel("testing/loopback-client.ts").code;
      expect(code).toMatch(/parsed\.hostname !== "127\.0\.0\.1"/);
      expect(code).toMatch(/host: "127\.0\.0\.1"/);
      expect(code).not.toMatch(/host:\s*parsed\.hostname/);
    });
  });

  describe("공유 실행 잠금(run-lock.ts·run-lock-node.ts)", () => {
    it("코어(run-lock.ts)는 런타임 import가 없다 — 타입만 가져온다(자식 프로세스가 Node로 직접 실행한다)", () => {
      for (const line of importLines(byRel("run-lock.ts").code)) {
        expect(line).toMatch(/^\s*import type\b/);
      }
    });

    it("노드 어댑터(run-lock-node.ts)는 node: 모듈만 런타임으로 가져오고 프로젝트 모듈은 타입만 가져온다", () => {
      for (const line of importLines(byRel("run-lock-node.ts").code)) {
        if (/^\s*import type\b/.test(line)) continue;
        expect(line).toMatch(/from "node:/);
      }
    });

    it("오래된 잠금을 자동으로 지우지 않는다 — 코어에서 remove는 해제(releaseRunLock) 안에서 한 번만 쓰이고, 획득 경로에는 없다", () => {
      const code = byRel("run-lock.ts").code;
      const acquireAt = code.indexOf("export async function acquireRunLock");
      const releaseAt = code.indexOf("export async function releaseRunLock");
      expect(acquireAt).toBeGreaterThan(-1);
      expect(releaseAt).toBeGreaterThan(acquireAt);
      expect(code.slice(acquireAt, releaseAt)).not.toMatch(/\.remove\(|unlink|rm\(/);
      expect(code.match(/port\.remove\(/g)).toHaveLength(1);
      // 해제는 자기 토큰을 확인한 뒤에만 지운다.
      const release = code.slice(releaseAt);
      expect(release.indexOf("owner.token !== handle.token")).toBeGreaterThan(-1);
      expect(release.indexOf("owner.token !== handle.token")).toBeLessThan(
        release.indexOf("port.remove(")
      );
    });

    it("소유자 프로세스의 생사를 확인하지 않는다 — 신호·프로세스 조회가 없다", () => {
      for (const rel of ["run-lock.ts", "run-lock-node.ts"]) {
        const code = byRel(rel).code;
        for (const bad of ["process.kill", ".kill(", "tasklist", "child_process", "execFile"]) {
          expect(code, `${rel}: ${bad}`).not.toContain(bad);
        }
      }
    });

    it("획득은 배타 생성('wx') 하나다 — 덮어쓰기 열기('w')나 존재 확인 뒤 만들기가 없다", () => {
      const code = byRel("run-lock-node.ts").code;
      expect(code).toMatch(/open\(path, "wx"/);
      expect(code).not.toMatch(/open\([^)]*,\s*"w"\s*[,)]/);
      expect(code).not.toMatch(/\b(access|stat|lstat|exists)\(/);
      // 지우기(unlink)는 방금 만든 불완전한 파일의 정리와 remove뿐이다.
      expect(code.match(/unlink\(/g)).toHaveLength(2);
    });
  });

  describe("증거 경로 겹침 검사(path-containment.ts)", () => {
    it("문자열 비교로 겹침을 판단하는 함수가 없다 — 포트가 실제로 접근할 자리(physicalKey)로만 판단한다", () => {
      expect(nonTest.filter((s) => /\bisSameOrInside\b/.test(s.code)).map((s) => s.rel)).toEqual(
        []
      );
      expect(byRel("path-containment.ts").code).toMatch(/fs\.physicalKey\(evidenceDir\)/);
      expect(byRel("path-containment.ts").code).toMatch(/fs\.physicalKey\(serverTree\)/);
    });

    it("CLI: 겹침 검사는 잠금 획득과 run.marker·semgrep-state 쓰기보다 앞선다", () => {
      const c = byRel("cli.ts").code;
      const check = c.indexOf("await evidenceInsideServerTree(deps.fs, evidenceDir, serverTree)");
      expect(check).toBeGreaterThan(-1);
      expect(check).toBeLessThan(c.indexOf("await acquireRunLock("));
      // 실제로 쓰는 호출(표지 파일 만들기, 상태 폴더 만들기)보다 앞선다 — buildChildEnv의 경로 문자열은 쓰기가 아니다.
      expect(check).toBeLessThan(
        c.indexOf('await deps.fs.mkdirp(joinPath(evidenceDir, "semgrep-state"))')
      );
      expect(check).toBeLessThan(c.indexOf('joinPath(evidenceDir, "run.marker")'));
    });

    it("하네스: 겹침 검사는 lockHeld와 무관하게 서버 트리 준비·증거 존재 확인·증거 쓰기보다 앞선다", () => {
      const c = byRel("harness.ts").code;
      const check = c.indexOf("await evidenceInsideServerTree(fs, evidenceDir, serverTreeRoot)");
      expect(check).toBeGreaterThan(-1);
      expect(check).toBeLessThan(c.indexOf("await buildScanTree("));
      expect(check).toBeLessThan(c.indexOf("await buildControlTree("));
      expect(check).toBeLessThan(c.indexOf("await fs.exists(joinPath(evidenceDir"));
      expect(check).toBeLessThan(c.indexOf("await writeEvidence("));
      // 검사 구간에 lockHeld를 읽는 분기가 없다: 잠금을 가져도 증거를 서버 트리 안에 쓰는 설정은 거절한다.
      const region = c.slice(check - 400, check + 600);
      expect(region).not.toMatch(/lockHeld/);
    });

    it("풀 수 없으면 쓰기 전에 거절한다 — 오류를 삼켜 '겹치지 않음'으로 보는 분기가 없다", () => {
      for (const rel of ["cli.ts", "harness.ts"]) {
        const c = byRel(rel).code;
        const at = c.indexOf("evidenceInsideServerTree(");
        const catchAt = c.indexOf("} catch (error) {", at);
        expect(catchAt, rel).toBeGreaterThan(at);
        expect(c.slice(catchAt, catchAt + 120), rel).toMatch(
          /throw new (UsageError|HardFailure)\(/
        );
      }
    });

    it("fs-node의 physicalKey는 경로 해석(canonicalTreePath)만 쓰고 만들기·쓰기·지우기 호출이 없다(탐침 파일 금지)", () => {
      const c = byRel("fs-node.ts").code;
      const start = c.indexOf("async physicalKey(");
      expect(start).toBeGreaterThan(-1);
      const body = c.slice(start, c.indexOf("async readFile(", start));
      expect(body).toMatch(/canonicalTreePath\(/);
      expect(body).not.toMatch(/\b(mkdir|writeFile|unlink|rm|open|rename)\s*\(/);
    });
  });

  describe("--run-id 선검증(run-id.ts)", () => {
    it("runId 형식 규칙은 run-id.ts 한 곳에만 있다 — 다른 파일에 같은 규칙을 복제하지 않는다", () => {
      const holders = nonTest
        .filter((s) => /\[A-Za-z0-9\]\[A-Za-z0-9\._-\]/.test(s.code))
        .map((s) => s.rel);
      expect(holders).toEqual(["run-id.ts"]);
    });

    it("CLI·하네스·대조 기록 읽기 어댑터가 모두 같은 함수를 가져다 쓴다", () => {
      for (const rel of ["cli.ts", "harness.ts", "reference-record.ts"]) {
        const c = byRel(rel).code;
        expect(c, rel).toMatch(/import \{[^}]*\bisValidRunId\b[^}]*\} from "\.\/run-id";/);
        expect(c, rel).toMatch(/\bisValidRunId\(/);
      }
    });

    it("CLI: 실행 방지 장치 다음, 경로를 만들거나 자원을 얻기 전에 run-id를 검증한다", () => {
      const c = byRel("cli.ts").code;
      const start = c.indexOf("async function cmdRun(");
      expect(start).toBeGreaterThan(-1);
      const guard = c.indexOf("await missingGuardConditions(parsed, deps)", start);
      const check = c.indexOf("if (!isValidRunId(runId))", start);
      expect(guard).toBeGreaterThan(start);
      expect(check).toBeGreaterThan(guard); // 장치가 먼저: 장치를 못 넘으면 NOT_RUN(3)이다
      expect(c.slice(check, check + 200)).toMatch(/throw new UsageError\(/);
      // run-id가 들어가는 첫 경로, 그리고 읽기·git·겹침 검사·잠금·수신기·프로세스 포트·하네스보다 앞선다.
      for (const later of [
        "joinPath(evidenceRoot, runId)",
        "const rulesCache = need(",
        "deps.makeGit(",
        "loadControlReference(deps.fs",
        "await evidenceInsideServerTree(",
        "await acquireRunLock(",
        "await deps.startMetricsReceiver()",
        "await runHarness(",
      ]) {
        const at = c.indexOf(later, start); // cmdRun 안에서 처음 나오는 자리
        expect(at, later).toBeGreaterThan(-1);
        expect(check, later).toBeLessThan(at);
      }
    });

    it("하네스: runId 검사는 옵션 검사(checkOptions) 안에 있고, 증거 겹침 검사·파일 시스템 접근보다 앞선다", () => {
      const c = byRel("harness.ts").code;
      const inCheck = c.indexOf("if (!isValidRunId(options.runId))");
      const callCheck = c.indexOf("checkOptions(options);");
      expect(inCheck).toBeGreaterThan(-1);
      expect(c.slice(c.indexOf("function checkOptions("), inCheck)).not.toMatch(/\bfs\./);
      expect(callCheck).toBeGreaterThan(-1);
      expect(callCheck).toBeLessThan(c.indexOf("await evidenceInsideServerTree("));
    });
  });

  describe("도구 버전·휠 관측(tool-observation.ts, artifact-node.ts)", () => {
    const cliCode = (): string => byRel("cli.ts").code;

    it("버전 확인에 넘기는 인자는 `--version` 하나뿐이고 CLI는 인자를 직접 만들어 넘기지 않는다(LSP 인자와 섞이지 않는다)", () => {
      const tool = byRel("tool-observation.ts").code;
      expect(tool).toMatch(/export const VERSION_ARGS = \["--version"\] as const;/);
      expect(tool).toMatch(/args: VERSION_ARGS,/);
      const cli = cliCode();
      const start = cli.indexOf("await runToolObservation({");
      expect(start).toBeGreaterThan(-1);
      const call = cli.slice(start, cli.indexOf("});", start));
      expect(call).not.toMatch(/\bargs\s*:/);
      expect(call).not.toContain("SERVER_ARGS");
    });

    it("CLI: 포트를 한 번 만든 뒤, 잠금·수신기 다음에 관측하고, 하네스보다 먼저이며, 잠금 여부(lockHeld)를 함께 넘긴다", () => {
      const c = cliCode();
      const port = c.indexOf('const port = deps.makeProcessPort("real");');
      const lock = c.indexOf("await acquireRunLock(");
      const receiver = c.indexOf("await deps.startMetricsReceiver()");
      const observe = c.indexOf("await runToolObservation({");
      const harness = c.indexOf("await runHarness(");
      expect(port).toBeGreaterThan(-1);
      expect(lock).toBeLessThan(receiver);
      expect(receiver).toBeLessThan(port);
      expect(port).toBeLessThan(observe);
      expect(observe).toBeLessThan(harness);
      expect(c.slice(observe, c.indexOf("});", observe))).toMatch(/\blockHeld,/);
      // 하네스는 같은 포트로 돈다 — 관측과 서버의 출처(provenance)가 갈라지지 않는다.
      expect(c).toMatch(
        /runHarness\(\s*\{\s*fs: deps\.fs,\s*git,\s*process: port,\s*clock: deps\.clock\s*\},\s*options\s*\)/
      );
    });

    it("CLI는 핀의 값(버전·휠 해시)이나 대조 기록의 관측값을 현재 관측으로 쓰지 않는다", () => {
      const c = cliCode();
      expect(c).not.toMatch(/semgrep\.version|semgrep\.wheel|wheel\.sha256|pin\.semgrep/);
      expect(c).not.toMatch(/fingerprints\.(tool_version|wheel_sha256)|tool_version_observed/);
    });

    it("pin.json을 쓰는 코드가 없다 — 관측했다는 이유로 verified나 승인 상태를 바꾸지 않는다", () => {
      const offenders = nonTest
        .filter((s) => /writeFileExclusive\([^)]*pin\.json|writeFile\([^)]*pin\.json/.test(s.code))
        .map((s) => s.rel);
      expect(offenders).toEqual([]);
      // 핀을 받는 쪽(completeToolObservation)은 입력을 바꾸지 않고 복사해서 비교만 한다.
      const tool = byRel("tool-observation.ts").code;
      const at = tool.indexOf("export function completeToolObservation(");
      const body = tool.slice(at, tool.indexOf("export function toolObservationConflict("));
      expect(body).not.toMatch(/\bpin\.semgrep[\w.]*\s*=[^=]/);
      expect(body).toContain("structuredClone(summary)");
    });

    it("버전 확인 자식의 종료를 확인하지 못하면(KILL_NOT_OBSERVED) 정리 실패로 끝난다 — 종료 코드에 반영한다", () => {
      // CLI 시험으로는 이 줄의 효과를 증명할 수 없다(다른 거부 사유로 항상 실패 종료). 그래서 소스에서 지킨다.
      const c = cliCode();
      const at = c.indexOf("const cleanedUp =");
      expect(at).toBeGreaterThan(-1);
      expect(c.slice(at, at + 400)).toMatch(
        /cleanup\.version_check_process\.state !== "KILL_NOT_OBSERVED"/
      );
      expect(c).toMatch(/return complete && cleanedUp \? EXIT\.ok : EXIT\.failed;/);
    });

    it("휠 해시 어댑터는 읽기 전용이다: 열기 플래그에 쓰기 계열이 없고, 쓰기·지우기·옮기기·만들기 호출이 없다", () => {
      const c = byRel("artifact-node.ts").code;
      // 파일을 여는 호출은 하나뿐이고, 그 플래그는 readOnlyOpenFlags가 만든 값이다(문자열 "r"로 되돌아가지 않는다 — 아래 항목).
      expect(c.match(/\bopen\(/g)).toHaveLength(1);
      expect(c).toMatch(/open\(path, flags\)/);
      expect(c).toMatch(/readOnlyOpenFlags\(fsConstants, process\.platform\)/);
      // 쓰기·생성·잘라내기·덧붙이기 플래그 이름은 소스(주석 제외) 어디에도 없다.
      expect(c).not.toMatch(/\bO_(WRONLY|RDWR|CREAT|EXCL|TRUNC|APPEND|DIRECT|TMPFILE)\b/);
      expect(c).not.toMatch(
        /\b(writeFile|appendFile|createWriteStream|unlink|rm|rmdir|rename|copyFile|mkdir|truncate|chmod|symlink|link)\s*\(/
      );
      expect(c).not.toMatch(/\bhandle\.(write|truncate|appendFile|writeFile)\s*\(/);
    });

    it("휠 해시 어댑터의 열기는 대기하지 않는다: 비차단 플래그를 쓰고, 막힐 수 있는 문자열 'r' 열기로 되돌아가지 않으며, 플래그를 정할 수 없으면 열지 않는다", () => {
      const c = byRel("artifact-node.ts").code;
      // 열기 자체의 대기를 끊는 것이 아니라 생기지 않게 한다 — 그래서 O_NONBLOCK이 읽기 전용 플래그에 들어 있어야 한다.
      const fn = c.slice(c.indexOf("export function readOnlyOpenFlags("));
      const body = fn.slice(0, fn.indexOf("\n}\n"));
      expect(body).toMatch(/O_NONBLOCK/);
      expect(body).toMatch(/platform === "win32"/);
      expect(c).not.toMatch(/\bopen\(path,\s*["'`]r["'`]\)/);
      // 안쪽 열기를 남겨 두고 바깥 대기만 끊는 방식(race)이나 타이머로 취소를 흉내 내는 방식을 쓰지 않는다.
      expect(c).not.toMatch(/Promise\.(race|any)\s*\(|setTimeout\s*\(/);
      // 플래그를 정할 수 없으면(null) 열기 앞에서 거절한다.
      expect(c.indexOf("flags === null")).toBeGreaterThan(-1);
      expect(c.indexOf("flags === null")).toBeLessThan(c.indexOf("open(path, flags)"));
    });

    it("관측 코어는 PATH를 탐색하지 않는다 — 명령은 호출자가 준 절대 경로 그대로이고 셸을 쓰지 않는다", () => {
      const c = byRel("tool-observation.ts").code;
      expect(c).not.toMatch(/\bPATH\b\s*[=:]|which\b|shell\s*:/);
      expect(byRel("process-node.ts").code).toMatch(/shell:\s*false/);
    });

    it("버전 확인 자식은 어떤 경로에서도 dispose로 정리한다(finally 안)", () => {
      const c = byRel("tool-observation.ts").code;
      const fn = c.slice(c.indexOf("export async function observeToolVersion("));
      const fin = fn.indexOf("} finally {");
      expect(fin).toBeGreaterThan(-1);
      expect(fn.slice(fin)).toMatch(/await child\.dispose\(\)/);
      expect(fn.slice(fin)).toMatch(/child\.kill\("SIGKILL"\)/);
    });
  });

  describe("CLI 생명주기(cli.ts)", () => {
    const code = (): string => byRel("cli.ts").code;

    it("잠금 획득 → 수신기 시작 → 하네스 → finally에서 정리 순서이고, 정리는 finally 안에 있다", () => {
      const c = code();
      const acquire = c.indexOf("await acquireRunLock(");
      const receiver = c.indexOf("await deps.startMetricsReceiver()");
      const harness = c.indexOf("await runHarness(");
      const finallyAt = c.indexOf("} finally {");
      const releaseAll = c.indexOf("await releaseAll()");
      expect(acquire).toBeGreaterThan(-1);
      expect(acquire).toBeLessThan(receiver);
      expect(receiver).toBeLessThan(harness);
      expect(harness).toBeLessThan(finallyAt);
      expect(finallyAt).toBeLessThan(releaseAll);
      expect(c.match(/await releaseRunLock\(/g)).toHaveLength(1);
    });

    it("잠금은 서버가 스캔하는 트리에서 얻고, 증거 폴더나 runId에서 얻지 않는다", () => {
      expect(code()).toMatch(/const serverTree = mode === "target" \? scanRoot : controlTreeRoot;/);
      expect(code()).toMatch(/acquireRunLock\(deps\.runLock, \{ treePath: serverTree/);
    });

    it("lockHeld는 공유 잠금과 증거 표지가 모두 있을 때만 true다", () => {
      expect(code()).toMatch(/const lockHeld = lock\.state === "ACQUIRED" && markerCreated;/);
    });

    it("관측하지 않은 값은 채우지 않는다 — foreignServerProcesses는 관측 결과만, 도구 버전·휠은 이 실행의 관측값만, 수신 건수는 수신기가 정한다", () => {
      expect(code()).toMatch(/foreignServerProcesses: foreign\.foreignServerProcesses,/);
      // 어디에도 건수를 0으로 직접 채우는 곳이 없다(잠금을 얻었다는 이유로도).
      expect(code()).not.toMatch(/foreignServerProcesses:\s*0\b/);
      expect(code()).not.toMatch(/foreignServerProcesses:\s*null,/);
      expect(code()).toMatch(/toolVersionObserved: tools\.toolVersionObserved,/);
      expect(code()).toMatch(/wheelSha256Observed: tools\.wheelSha256Observed,/);
      expect(code()).toMatch(/metricsReceiverHits: null,\s*metricsReceiver: receiver,/);
    });

    it("옛 이름 run.lock을 더 만들지 않는다(증거 표지는 run.marker)", () => {
      expect(code()).toContain('"run.marker"');
      expect(code()).not.toContain('"run.lock"');
    });

    it("취소 신호(SIGINT·SIGTERM)는 모두 AbortController로 이어져 정리 경로를 탄다", () => {
      const c = code();
      const entry = c.slice(c.indexOf("async function runEntry"));
      expect(entry).toContain('["SIGINT", "SIGTERM"] as const');
      expect(entry).toContain("process.once(signal, () => controller.abort())");
    });

    it("자식 환경의 주소는 열린 수신기의 주소를 쓴다", () => {
      expect(code()).toMatch(/buildChildEnv\(deps, evidenceDir, receiver\.url\)/);
    });
  });
});

describe("구조 (12) — 다른 서버 프로세스 관측은 읽기만 한다", () => {
  const cliCode = (): string => byRel("cli.ts").code;
  // 다른 프로세스를 끝내거나 정리하는 표현. 어댑터가 자기가 띄운 조회 자식을 끝내는 `child.kill("SIGKILL")` 한 곳만 예외다.
  const KILLING =
    /process\s*\.\s*kill\b|taskkill|Stop-Process|\bpkill\b|\bkillall\b|SIGTERM|\bwmic\b|Remove-Item|Invoke-Expression/;

  it("관측 코어(process-observation.ts·process-list.ts)에는 종료·신호 표현이 없다", () => {
    for (const rel of ["process-observation.ts", "process-list.ts"]) {
      const code = byRel(rel).code;
      expect(code, rel).not.toMatch(KILLING);
      expect(code, rel).not.toMatch(/\.kill\s*\(/);
    }
  });

  it("목록 어댑터(process-list-node.ts)는 쓰기·삭제·종료 호출이 없고, 끝내는 것은 자기가 띄운 조회 자식 한 곳뿐이다", () => {
    const code = byRel("process-list-node.ts").code;
    expect(code).not.toMatch(KILLING);
    expect(code).not.toMatch(
      /\b(writeFile|appendFile|unlink|rmdir|rm|rename|mkdir|chmod|chown|truncate|copyFile|symlink|open)\s*\(/
    );
    const kills = [...code.matchAll(/\.kill\s*\(([^)]*)\)/g)].map((m) => m[0]);
    expect(kills).toEqual(['.kill("SIGKILL")']);
    // 그 호출은 조회 자식(child)에게만 향한다.
    expect(code).toMatch(/child\.kill\("SIGKILL"\)/);
    // node: 모듈은 파일 읽기 하나뿐이고 child_process는 가져오지 않는다.
    const specs = specifiersOf(code).filter((s) => s.startsWith("node:"));
    expect(specs).toEqual(["node:fs/promises"]);
    expect(code).toMatch(/import \{ readFile, readdir, readlink \} from "node:fs\/promises";/);
  });

  it("Windows 조회 스크립트는 Get-CimInstance 하나만 쓰고 변경·종료·실행 cmdlet이 없다", () => {
    const script = [
      ...byRel("process-list.ts").raw.matchAll(
        /export const WINDOWS_LIST_SCRIPT = \[([\s\S]*?)\]\.join/g
      ),
    ][0]?.[1];
    expect(script).toBeDefined();
    expect(script).toContain("Get-CimInstance -ClassName Win32_Process");
    expect(script).not.toMatch(
      /Stop-|Remove-|Set-|New-|Start-|Invoke-|Out-File|Add-Content|Clear-|Restart-|taskkill|wmic/
    );
  });

  it("Windows 조회 자식은 SystemRoot 아래 고정 경로의 powershell.exe를 포트로만 띄운다 — 셸 문자열·PATH 탐색이 없다", () => {
    const code = byRel("process-list-node.ts").code;
    expect(code).toContain("System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe");
    expect(code).toMatch(/options\.process\.spawn\(\{/);
    expect(code).not.toMatch(/shell:\s*true/);
  });

  it("CLI: 조회 어댑터는 버전 확인·서버와 같은 포트로 만들고, 도구 관측 뒤 하네스 앞에서 관측하며, 잠금 여부를 함께 넘긴다", () => {
    const c = cliCode();
    const tools = c.indexOf("await runToolObservation({");
    const observe = c.indexOf("await runForeignProcessObservation({");
    const harness = c.indexOf("await runHarness(");
    expect(tools).toBeGreaterThan(-1);
    expect(tools).toBeLessThan(observe);
    expect(observe).toBeLessThan(harness);
    const call = c.slice(observe, c.indexOf("});", observe));
    expect(call).toMatch(/lister: deps\.makeProcessLister\(port\),/);
    expect(call).toMatch(/\blockHeld,/);
    expect(call).toMatch(/ownPid: deps\.ownPid/);
    // 실제 포트는 여전히 run의 한 곳에서만 만든다.
    expect([...c.matchAll(/makeProcessPort\s*\(\s*["']real["']\s*\)/g)]).toHaveLength(1);
  });

  it("하네스: 서버 트리 준비 쓰기는 잠금을 가졌고 다른 서버가 0건으로 확정된 경우에만 한다", () => {
    const c = byRel("harness.ts").code;
    expect(c).toMatch(
      /const mayWriteServerTree = options\.lockHeld === true && options\.foreignServerProcesses === 0;/
    );
    // 트리를 만드는 호출은 모두 그 변수 뒤에 있다.
    const build =
      (c.match(/buildScanTree\(/g) ?? []).length + (c.match(/buildControlTree\(/g) ?? []).length;
    expect(build).toBe(2);
    expect(c.match(/\(mayWriteServerTree &&/g)).toHaveLength(2);
  });
});
