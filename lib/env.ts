// @MX:ANCHOR: [AUTO] 목적별 환경변수 검증 관문 — app 부팅(instrumentation.ts),
// 3개 운영 스크립트(scripts/db-migrate.ts, scripts/db-seed.ts,
// scripts/provision-tester.ts), E2E 진입점(scripts/run-e2e.ts)이 모두 의존한다.
// @MX:REASON: 스코프 열거형이나 스코프 × 변수 매트릭스를 변경하면 전 호출부에
// 파급된다(plan.md §F, design.md §3.1).

/** 실행 목적. db=마이그레이션/시드, provision=테스터 생성, app=Next.js 런타임 부팅, e2e=E2E 진입점 */
export type EnvScope = "db" | "provision" | "app" | "e2e";

interface VarInfo {
  reason: string;
  howToObtain: string;
}

// design.md §3.1 스코프 × 변수 매트릭스 (SSOT). TURSO_AUTH_TOKEN은 file: capability
// gate로 별도 처리하므로 이 표에는 포함하지 않는다. GEMINI_API_KEY도 app 스코프
// 조건부 게이트(LLM_PROVIDER_MODE !== "deterministic"일 때만 요구, SPEC-RESEARCH-001
// design.md §2)로 별도 처리하므로 이 표에는 포함하지 않는다.
//
// SPEC-GEMINI-RUNTIME-001 M5(design.md §1 Requirement A): GEMINI_RESEARCH_MODEL/
// GEMINI_FAST_MODEL/GEMINI_RESEARCH_RPM_BUDGET/GEMINI_FAST_RPM_BUDGET 4개
// 변수는 전부 코드 기본값(lib/ai/provider-factory.ts)을 가진 선택적 변수이며,
// 어떤 스코프에서도 필수가 될 수 없다 — 의도적으로 이 검증 대상에서 제외한다.
const REQUIRED_BY_SCOPE: Record<EnvScope, readonly string[]> = {
  db: ["TURSO_DATABASE_URL"],
  provision: ["TURSO_DATABASE_URL"],
  app: ["TURSO_DATABASE_URL"],
  e2e: ["TURSO_DATABASE_URL", "TESTER_PASSWORD"],
};

const VAR_INFO: Record<string, VarInfo> = {
  TURSO_DATABASE_URL: {
    reason: "Drizzle이 접속할 libSQL 인스턴스 주소입니다.",
    howToObtain: "Turso 대시보드에서 발급받거나, 로컬 개발 시 file: 스킴 경로를 사용하세요.",
  },
  TURSO_AUTH_TOKEN: {
    reason:
      "원격 Turso 인스턴스 인증에 필요합니다 (TURSO_DATABASE_URL이 libsql:// 또는 https://로 시작할 때만 필요).",
    howToObtain: "Turso 대시보드에서 발급받으세요.",
  },
  BETTER_AUTH_SECRET: {
    reason: "세션 토큰 서명 키입니다.",
    howToObtain: "무작위 문자열을 생성해 설정하세요 (예: openssl rand -base64 32).",
  },
  BETTER_AUTH_URL: {
    reason: "인증 콜백의 기준 오리진입니다.",
    howToObtain: "앱이 서비스되는 URL을 설정하세요 (예: http://localhost:3000).",
  },
  TESTER_PASSWORD: {
    reason: "비대화형 테스터 프로비저닝 비밀번호입니다 (대화형 프롬프트를 쓰지 않을 때 필요).",
    howToObtain: "8자 이상의 값을 설정하세요.",
  },
  GEMINI_API_KEY: {
    reason:
      "Researcher/Skeptic/Verifier가 실제 리서치 소견을 생성하는 데 필요한 Gemini API 키입니다.",
    howToObtain: "Google AI Studio(aistudio.google.com)에서 발급받으세요.",
  },
};

/** AC-RUNTIME-010: 오류 메시지는 스코프 + 변수명 + 필요 이유 + 획득 경로를 담되, 값은 절대 포함하지 않는다. */
export class EnvValidationError extends Error {
  readonly scope: EnvScope;
  readonly missing: readonly string[];

  // TS 파라미터 프로퍼티(생성자 인자에 public/readonly)는 Node의 네이티브
  // strip-only 타입 스트리핑이 지원하지 않는다(실측: M3, ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX)
  // — 필드 선언 + 생성자 본문 대입으로 풀어써서 `node scripts/db-migrate.ts` 등
  // 독립 스크립트가 이 모듈을 거쳐 기동할 수 있게 한다.
  constructor(scope: EnvScope, missing: readonly string[]) {
    const lines = missing.map((name) => {
      const info = VAR_INFO[name];
      return `  - ${name}: ${info?.reason ?? "필요한 환경변수입니다."} (${info?.howToObtain ?? ""})`;
    });
    super(`[${scope}] 환경변수 검증 실패 — 다음 변수가 누락되었습니다:\n${lines.join("\n")}`);
    this.name = "EnvValidationError";
    this.scope = scope;
    this.missing = missing;
  }
}

function isFileScheme(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith("file:");
}

export interface ValidatedEnv {
  scope: EnvScope;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  TESTER_PASSWORD?: string;
}

/**
 * 실행 목적(scope)이 실제로 소비하는 환경변수만 검증한다. 누락 변수는 첫 항목에서
 * 중단하지 않고 전부 열거한다(AC-RUNTIME-019). file: capability gate는 전 스코프
 * 공통이다(REQ-RUNTIME-003).
 */
export function validateEnv(
  scope: EnvScope,
  source: Record<string, string | undefined> = process.env
): ValidatedEnv {
  const required = REQUIRED_BY_SCOPE[scope];
  const missing: string[] = [];

  for (const name of required) {
    if (!source[name]) {
      missing.push(name);
    }
  }

  // file: capability gate — TURSO_DATABASE_URL이 file: 스킴이 아니면
  // TURSO_AUTH_TOKEN도 필요하다(전 스코프 공통). URL 자체가 없으면 스킴을 판정할
  // 수 없으므로 이 검사는 건너뛴다 — 그 경우는 이미 TURSO_DATABASE_URL 누락으로
  // 보고된다.
  if (
    source.TURSO_DATABASE_URL &&
    !isFileScheme(source.TURSO_DATABASE_URL) &&
    !source.TURSO_AUTH_TOKEN
  ) {
    missing.push("TURSO_AUTH_TOKEN");
  }

  // app 스코프 GEMINI_API_KEY 조건부 게이트 — LLM_PROVIDER_MODE가 deterministic으로
  // 설정되지 않은 정상 앱 부팅 경로에서만 요구한다(SPEC-RESEARCH-001 design.md §2,
  // REQ-RESEARCH-012). E2E는 LLM_PROVIDER_MODE=deterministic을 상속받으므로
  // 이 게이트에서 면제된다.
  if (scope === "app" && source.LLM_PROVIDER_MODE !== "deterministic" && !source.GEMINI_API_KEY) {
    missing.push("GEMINI_API_KEY");
  }

  if (missing.length > 0) {
    throw new EnvValidationError(scope, missing);
  }

  return {
    scope,
    TURSO_DATABASE_URL: source.TURSO_DATABASE_URL as string,
    TURSO_AUTH_TOKEN: source.TURSO_AUTH_TOKEN,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL,
    TESTER_PASSWORD: source.TESTER_PASSWORD,
  };
}
