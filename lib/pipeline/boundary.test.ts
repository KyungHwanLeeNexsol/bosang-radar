import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// AC-SCAFFOLD-012: 파이프라인 단계 모듈 간 경계를 코드로 강제한다 —
// index.ts만 각 단계 모듈을 import할 수 있고, 형제 단계 모듈 파일 간
// 직접 import는 0건이어야 한다.
//
// Gemini SDK import 경계(REQ-SCAFFOLD-018, AC-SCAFFOLD-016) 검증은
// ../pipeline-gemini-boundary.test.ts로 분리되어 있다 — plan.md §B DoD의
// grep 기반 0건 요구사항을 만족시키기 위해, 검증 대상 SDK 패키지명 문자열을
// lib/pipeline/ 디렉터리 밖에서 참조한다.

const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));

const STAGE_MODULES = [
  "case-normalizer",
  "query-planner",
  "evidence-retriever",
  "researcher",
  "skeptic",
  "verifier",
] as const;

describe("lib/pipeline sibling-import boundary (AC-SCAFFOLD-012)", () => {
  it.each(STAGE_MODULES)(
    "%s.ts는 다른 형제 단계 모듈 파일을 직접 import하지 않는다",
    (moduleName) => {
      const source = readFileSync(join(PIPELINE_DIR, `${moduleName}.ts`), "utf-8");
      const siblingImports = STAGE_MODULES.filter((other) => other !== moduleName).filter((other) =>
        new RegExp(`from ["']\\./${other}["']`).test(source)
      );

      expect(siblingImports).toEqual([]);
    }
  );
});
