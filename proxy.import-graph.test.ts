import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// 회귀 테스트 — Netlify Middleware 네이티브 애드온 번들링 방지
//
// proxy.ts(Next.js 16 Middleware, 항상 nodejs 런타임에서 실행)는 정적 번들링 시
// import 그래프에 도달 가능한 전체 모듈을 포함한다(사용하는 named export만이
// 아니라). @libsql/client는 네이티브 C++ 애드온(@libsql/linux-x64-gnu/index.node
// 등)을 포함하므로 Netlify의 Next.js Middleware 런타임에서 지원되지 않는다.
//
// 이 테스트는 proxy.ts의 로컬(상대 경로/별칭) import 그래프를 BFS로 순회하며
// 금지된 모듈(lib/db/client, @libsql/client, *.node)이 그래프에 재도입되는 것을
// 방지한다.

const PROJECT_ROOT = path.resolve(__dirname);
const ENTRY = path.join(PROJECT_ROOT, "proxy.ts");

// 로컬(상대/별칭) import를 판별한다 — bare 패키지 import는 재귀 대상에서 제외한다
// (node_modules 내부까지 파싱하지 않는다).
function isLocalSpecifier(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/");
}

// bare 패키지 specifier 중 금지 대상인지 확인한다.
const FORBIDDEN_BARE_PATTERNS = [/^@libsql\/client(\/.*)?$/];

function isForbiddenSpecifier(spec: string): boolean {
  if (FORBIDDEN_BARE_PATTERNS.some((re) => re.test(spec))) return true;
  if (spec.endsWith(".node")) return true;
  return false;
}

// 소스 파일에서 `import ... from "..."` / `export ... from "..."` /
// `import "..."` 형태의 specifier를 정규식으로 추출한다. 전체 TS AST 파서가
// 아니라 간단한 정규식 스캐너로 충분하다(이 저장소의 다른 테스트들이 이미
// 파일 내용 기반 assertion 패턴을 사용한다).
const IMPORT_SPEC_RE = /(?:import|export)\s+(?:[\s\S]*?\bfrom\s+)?["']([^"']+)["']/g;

function extractImportSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = new RegExp(IMPORT_SPEC_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    specs.push(match[1]);
  }
  return specs;
}

function resolveLocalSpecifier(spec: string, fromFile: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(PROJECT_ROOT, spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec);

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

interface ForbiddenImportFound {
  forbiddenSpecifier: string;
  chain: string[];
}

function walkImportGraph(entry: string): ForbiddenImportFound | null {
  const visited = new Set<string>();

  function visit(file: string, chain: string[]): ForbiddenImportFound | null {
    if (visited.has(file)) return null;
    visited.add(file);

    const source = readFileSync(file, "utf-8");
    const specifiers = extractImportSpecifiers(source);

    for (const spec of specifiers) {
      const nextChain = [...chain, spec];

      if (isForbiddenSpecifier(spec)) {
        return { forbiddenSpecifier: spec, chain: nextChain };
      }

      if (isLocalSpecifier(spec)) {
        const resolved = resolveLocalSpecifier(spec, file);
        if (resolved) {
          const result = visit(resolved, nextChain);
          if (result) return result;
        }
      }
      // bare 패키지 import(금지 대상이 아닌 경우)는 재귀하지 않는다 —
      // node_modules 내부까지 파싱하지 않는다.
    }

    return null;
  }

  return visit(entry, [path.relative(PROJECT_ROOT, entry)]);
}

describe("proxy.ts import graph regression (Netlify Middleware native addon)", () => {
  it("proxy.ts의 로컬 import 그래프에는 lib/db/client, @libsql/client, *.node가 포함되지 않아야 한다", () => {
    const found = walkImportGraph(ENTRY);

    if (found) {
      throw new Error(
        `proxy.ts의 import 그래프에서 금지된 모듈을 발견했다: "${found.forbiddenSpecifier}"\n` +
          `import 체인: ${found.chain.join(" -> ")}\n` +
          `Netlify Middleware 런타임(nodejs)은 네이티브 C++ 애드온(@libsql/client)을 ` +
          `지원하지 않는다. proxy.ts가 DB 접근 코드(lib/db/client)를 정적으로 참조하는 ` +
          `모듈을 import하지 않도록 하라 (lib/auth/session-cookie.ts처럼 쿠키 존재 여부만 ` +
          `확인하는 DB-독립 모듈을 사용하라).`
      );
    }

    expect(found).toBeNull();
  });
});
