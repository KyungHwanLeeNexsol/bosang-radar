import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// AC-RUNTIME-015 구조적 요건 + AC-RUNTIME-022 정적 보완 검증. 파일 존재/문자열
// 검사만 수행하므로 Playwright·브라우저·앱 기동이 필요 없다(pnpm test에 포함).

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("AC-RUNTIME-015 — e2e/global-setup.ts 부재", () => {
  it("저장소에 e2e/global-setup.ts가 존재하지 않는다", () => {
    expect(existsSync(path.join(projectRoot, "e2e", "global-setup.ts"))).toBe(false);
  });
});

describe("AC-RUNTIME-022 — playwright.config.ts webServer.env 재선언 금지 (정적 보완)", () => {
  it("playwright.config.ts에 4개 시크릿/env 키가 어디에도 재선언되지 않는다", () => {
    const configPath = path.join(projectRoot, "playwright.config.ts");
    expect(existsSync(configPath)).toBe(true);

    // 주석은 재선언 금지 근거를 설명하기 위해 키 이름을 문서화 목적으로
    // 언급할 수 있다 — 검사 대상은 실제 코드(주석이 아닌 라인)로 한정한다.
    const codeOnly = readFileSync(configPath, "utf-8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    const forbiddenKeys = [
      "BETTER_AUTH_SECRET",
      "TESTER_PASSWORD",
      "TURSO_DATABASE_URL",
      "BETTER_AUTH_URL",
    ];

    for (const key of forbiddenKeys) {
      expect(codeOnly.includes(key)).toBe(false);
    }
  });
});
