import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
// Node의 네이티브 타입 스트리핑 실행(`node scripts/*.ts`)은 확장자 없는 상대
// import를 해석하지 못한다(실측: M3) — `.ts` 확장자를 명시해야
// `node scripts/db-migrate.ts` 등 독립 스크립트가 실제로 기동한다.
import { validateEnv, type EnvScope, type ValidatedEnv } from "../lib/env.ts";

// @next/env는 ncc로 번들된 CommonJS 모듈이라 cjs-module-lexer가 named export를
// 정적으로 감지하지 못한다 — `import { loadEnvConfig } from "@next/env"`는
// Node ESM 인터롭에서 SyntaxError로 실패한다(실측: research.md §0.2 갱신 필요,
// M1 실측). default import 후 구조분해하는 형태만 안전하다.
const { loadEnvConfig } = nextEnv;

// @MX:ANCHOR: [AUTO] 독립 실행 스크립트(db-migrate/db-seed/provision-tester/run-e2e)가
// .env.local을 로드하는 유일한 진입점
// @MX:REASON: (1) 로드 → 검증 순서는 뒤집을 수 없다 — 검증은 로드된 값을 판정하므로,
// 순서가 뒤집히면 항상 "누락"을 보고한다. (2) 로드 호출을 다른 파일로 복제하면 로드
// 경로가 갈라진다(REQ-RUNTIME-021의 단일 정의 요건).
export function bootstrapCli(scope: EnvScope): ValidatedEnv {
  const projectRoot = resolveProjectRoot();
  loadEnvConfig(projectRoot);
  return validateEnv(scope);
}

// dir 인자는 실행 시점 cwd가 아니라 이 스크립트 파일의 위치를 기준으로 프로젝트
// 루트를 확정한다 — cwd에 의존하면 하위 디렉터리에서 실행했을 때 조용히 아무것도
// 로드하지 않는다(design.md §3.2.2).
function resolveProjectRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}
