import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 구조 (13) — 음성 대조는 정상 target/control 경로와 분리되어 있다. 소스를 읽어 "이 경계를 넘지 않는다"를 지킨다.
// 이 파일 자신과 structure.test.ts는 패턴을 담고 있어 검사 대상에서 뺀다. 주석은 줄 단위로 걷어낸다.

const BASE = fileURLToPath(new URL("./", import.meta.url));

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

const sources = walk(BASE)
  .filter((f) => /\.ts$/.test(f))
  .map((f) => {
    const rel = relative(BASE, f).split(sep).join("/");
    return { rel, isTest: rel.endsWith(".test.ts"), code: stripComments(readFileSync(f, "utf8")) };
  })
  .filter((s) => s.rel !== "structure.negative-control.test.ts" && s.rel !== "structure.test.ts");
const nonTest = sources.filter((s) => !s.isTest);
const byRel = (rel: string): string => {
  const found = sources.find((s) => s.rel === rel);
  if (!found) throw new Error(`소스를 찾지 못했다: ${rel}`);
  return found.code;
};

const importsOf = (code: string): string[] =>
  [...code.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);

describe("구조 (13) — 음성 대조는 정상 경로와 분리되어 있다", () => {
  it("엔진 진단 진입점(runEngineDiagnostic)을 부르는 운영 코드는 음성 대조 실행기뿐이다", () => {
    const users = nonTest
      .filter((s) => s.rel !== "harness.ts")
      .filter((s) => /\brunEngineDiagnostic\b/.test(s.code))
      .map((s) => s.rel);
    expect(users).toEqual(["negative-control.ts"]);
    // 실행기 안에서도 층 판단 한 곳(엔진 층 또는 기준 실행)에서만 부른다.
    const code = byRel("negative-control.ts");
    expect(code.match(/\brunEngineDiagnostic\(/g)).toHaveLength(1);
    expect(code).toMatch(/layer === "engine" \|\| id === "baseline"\s*\?\s*runEngineDiagnostic\(/);
  });

  it('정상 진입점은 시작 정책을 "gated"로 고정하고, 정책은 옵션에서 고를 수 없다', () => {
    const code = byRel("harness.ts");
    expect(code).toMatch(
      /export async function runHarness\([^)]*\)[^{]*\{\s*return guarded\(deps, options, "gated"\);/
    );
    expect(code).toMatch(
      /runEngineDiagnostic\([^)]*\)[^{]*\{\s*return guarded\(deps, options, "diagnostic"\);/
    );
    const options = code.slice(
      code.indexOf("export interface HarnessOptions"),
      code.indexOf("export interface HarnessResult")
    );
    expect(options).not.toMatch(/policy|diagnostic/i);
    // 진단이 사유가 있어도 시작할 수 있는 사유는 표의 사전 검사 사유에서 도출한다(손으로 적은 목록이 아니다).
    expect(code).toMatch(
      /ENGINE_DIAGNOSTIC_STARTABLE[^=]*=\s*new Set<ReasonCode>\(\[\s*\.\.\.NEGATIVE_CONTROL_TABLE\.flatMap/
    );
    // 시작 예외는 서버 트리를 쓸 자격(잠금·다른 서버 0건)을 함께 요구한다.
    expect(code).toMatch(
      /policy === "diagnostic"\s*&&\s*refusals\.length > 0\s*&&\s*mayWriteServerTree\s*&&/
    );
  });

  it("음성 대조 모듈은 하네스·판정·증거·사전 검사·세션·참조 모듈에서 가져오지 않는다 — 정상 실행에 재귀적으로 붙을 길이 없다", () => {
    const protectedModules = [
      "harness.ts",
      "evaluate.ts",
      "evidence.ts",
      "precheck.ts",
      "session.ts",
      "control.ts",
      "reference.ts",
      "reference-record.ts",
      "settings.ts",
      "rules-manifest.ts",
    ];
    for (const rel of protectedModules) {
      const imports = importsOf(byRel(rel));
      expect(
        imports.filter((i) => /negative-control/.test(i)),
        rel
      ).toEqual([]);
    }
    // 음성 대조 모듈을 가져오는 운영 코드(시험 지원 testing/ 제외): cli.ts(명령)와, 같은 묶음의 읽기 모듈뿐이다.
    const users = nonTest
      .filter((s) => !s.rel.startsWith("testing/"))
      .filter((s) => importsOf(s.code).some((i) => /(^|\/)negative-control(-record)?$/.test(i)))
      .map((s) => s.rel)
      .sort();
    expect(users).toEqual(["cli.ts", "negative-control-record.ts"]);
  });

  it("실행기는 순수하다: node 모듈·프로세스 포트 생성·환경 접근이 없고 가져오는 것은 이 디렉터리의 모듈뿐이다", () => {
    for (const rel of ["negative-control.ts", "negative-control-record.ts"]) {
      const code = byRel(rel);
      expect(
        importsOf(code).filter((i) => !i.startsWith(".")),
        rel
      ).toEqual([]);
      expect(code, rel).not.toMatch(
        /createNodeProcessPort|makeProcessPort|process\.(env|argv|exit)/
      );
      expect(code, rel).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket/);
    }
  });

  it("실행기는 기대 상태를 복제하지 않는다: 표의 상태 이름과 id를 코드에 적지 않고 표에서 읽는다", () => {
    const code = byRel("negative-control.ts");
    for (const status of [
      "MANIFEST_MISMATCH",
      "RULES_NOT_LOADED",
      "SETTINGS_MISMATCH",
      "PREFIX_MISSING",
      "ISOLATION_VIOLATION",
    ]) {
      expect(code, status).not.toContain(status);
    }
    expect(code).not.toMatch(/["']R[1-9]["']/); // id를 문자열로 적은 곳(충돌 목록 등)이 없다
    expect(code).toContain("NEGATIVE_CONTROL_TABLE");
    expect(code).toContain("engineLayerConflicts");
  });

  it("observed는 관측에서만 온다: 항목을 만드는 코드는 expected를 observed에 옮기지 않는다", () => {
    const code = byRel("negative-control.ts");
    const derive = code.slice(
      code.indexOf("export function deriveNegativeControlEntry"),
      code.indexOf("export type MutationKind")
    );
    expect(derive.length).toBeGreaterThan(100);
    expect(derive).toMatch(/observed: obs\.status,/);
    expect(derive).not.toMatch(/observed:\s*expected/);
    expect(derive).not.toMatch(/observed:\s*spec\./);
  });

  it("기록 읽기는 스위트 파일의 entries를 읽지 않는다(저장된 선언을 믿지 않고 증거에서 다시 도출한다)", () => {
    const code = byRel("negative-control-record.ts");
    const parse = code.slice(
      code.indexOf("function parseSuite("),
      code.indexOf("interface EvidenceRead")
    );
    expect(parse.length).toBeGreaterThan(100);
    expect(parse).not.toMatch(/entries/);
    // 모든 항목은 실행기와 같은 순수 함수로 만든다.
    expect(code).toMatch(
      /deriveNegativeControlEntry\(spec, layer, read\.observation, binding, conflicts\)/
    );
  });

  it("엔진 진단 기록은 대조 참조가 될 수 없다: 읽기 어댑터가 표식을 거절 사유로 본다", () => {
    expect(byRel("reference-record.ts")).toMatch(/engine_diagnostic[\s\S]{0,80}DIAGNOSTIC_RUN/);
  });

  it("스위트 기록은 CLI에서 control 모드에서만 읽는다(target은 사용법 오류, 자동 탐색 없음)", () => {
    const cli = byRel("cli.ts");
    expect(cli).toMatch(/mode === "target" && negativeControlsPath !== undefined/);
    expect([...cli.matchAll(/loadNegativeControlSuite\(/g)]).toHaveLength(1);
    expect([...cli.matchAll(/runNegativeControls\(/g)]).toHaveLength(1);
  });
});
