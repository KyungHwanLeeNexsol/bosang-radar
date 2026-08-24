import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// REQ-SCAFFOLD-018 / AC-SCAFFOLD-016: lib/pipeline/*.ts 파일은
// lib/ai/providers/gemini.ts 외부에서 Gemini SDK를 직접 import할 수 없다.
//
// 이 파일은 의도적으로 lib/pipeline/ 디렉터리 밖(lib/ 바로 아래)에 위치한다
// — 검증 대상 문자열 자체를 lib/pipeline/ 안에 두면, plan.md §B DoD의
// `grep -rn "@google/genai" lib/pipeline/` 결과 0건 요구사항을 테스트
// 소스 코드 자신이 깨뜨리게 된다.
const GEMINI_SDK_IMPORT = ["@google", "genai"].join("/");
const PIPELINE_DIR = join(dirname(fileURLToPath(import.meta.url)), "pipeline");

describe("lib/pipeline Gemini SDK import boundary (REQ-SCAFFOLD-018, AC-SCAFFOLD-016)", () => {
  it("lib/pipeline/*.ts 파일은 gemini.ts 외부에서 Gemini SDK를 직접 import하지 않는다", () => {
    const files = readdirSync(PIPELINE_DIR).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
    );
    const offenders = files.filter((name) =>
      readFileSync(join(PIPELINE_DIR, name), "utf-8").includes(GEMINI_SDK_IMPORT)
    );

    expect(offenders).toEqual([]);
  });
});
