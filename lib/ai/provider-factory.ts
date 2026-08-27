import type { LLMProvider } from "./provider";
import { RateScheduler } from "./rate-scheduler";
import { createDeterministicLLMProvider } from "./providers/deterministic";
import { GeminiProvider } from "./providers/gemini";

// SPEC-GEMINI-RUNTIME-001 M1 (design.md §1 D1/D3): 오케스트레이터 수준
// 역할별(Research/Fast) provider 선택 지점. model 문자열은 GeminiProvider를
// 생성하기 이전에 여기서 확정하며(GeminiProvider 자신의 내부 DEFAULT_MODEL
// 폴백에 위임하지 않는다), 확정된 model ID가 같은 두 역할은 RateScheduler
// 인스턴스 하나를 공유하고 더 보수적인(작은) budget을 적용한다(D3).
const DEFAULT_RESEARCH_MODEL = "gemini-3.6-flash";
const DEFAULT_FAST_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_RPM_BUDGET = 4; // 보수적 self-imposed 기본값 — Google이 보장하는 값이 아니다.

export interface RoleProviders {
  research: LLMProvider;
  fast: LLMProvider;
}

function parseRpmBudget(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

// @MX:NOTE: [AUTO] provider 선택 조건(env.LLM_PROVIDER_MODE)과 GeminiProvider
// 생성자의 apiKey(env.GEMINI_API_KEY)가 동일한 env 파라미터를 공유한다 — 테스트가
// 주입한 env가 전역 process.env와 조용히 섞이는 경로를 구조적으로 차단하기 위함이다.
export function getLLMProviders(env: NodeJS.ProcessEnv = process.env): RoleProviders {
  if (env.LLM_PROVIDER_MODE === "deterministic") {
    const shared = createDeterministicLLMProvider();
    return { research: shared, fast: shared }; // 결정론적 모드는 역할 구분이 무의미하다.
  }

  const apiKey = env.GEMINI_API_KEY;

  const researchModel = env.GEMINI_RESEARCH_MODEL ?? DEFAULT_RESEARCH_MODEL;
  const fastModel = env.GEMINI_FAST_MODEL ?? DEFAULT_FAST_MODEL;
  const researchBudget = parseRpmBudget(env.GEMINI_RESEARCH_RPM_BUDGET) ?? DEFAULT_RPM_BUDGET;
  const fastBudget = parseRpmBudget(env.GEMINI_FAST_RPM_BUDGET) ?? DEFAULT_RPM_BUDGET;

  // model ID가 아니라 "역할"을 기준으로 스케줄러를 나누면, 두 역할이 같은 실제
  // model을 가리킬 때 합산 요청률이 어느 한쪽의 budget도 넘어설 수 있다(D3) —
  // 확정된 model ID가 같으면 하나의 스케줄러를 공유하고 더 보수적인 budget을 쓴다.
  let researchScheduler: RateScheduler;
  let fastScheduler: RateScheduler;
  if (researchModel === fastModel) {
    const shared = new RateScheduler({ rpmBudget: Math.min(researchBudget, fastBudget) });
    researchScheduler = shared;
    fastScheduler = shared;
  } else {
    researchScheduler = new RateScheduler({ rpmBudget: researchBudget });
    fastScheduler = new RateScheduler({ rpmBudget: fastBudget });
  }

  return {
    research: new GeminiProvider({ apiKey, model: researchModel, scheduler: researchScheduler }),
    fast: new GeminiProvider({ apiKey, model: fastModel, scheduler: fastScheduler }),
  };
}

// SPEC-GEMINI-RUNTIME-001 M1 (design.md §1 D-NEW1): 프로세스 생애주기 지연
// 초기화 싱글턴 — 정상 앱 경로 전용이다. runPipeline()이 사건마다 getLLMProviders()를
// 새로 호출하면 RateScheduler의 lastStartedAt이 사건 경계마다 초기화되어, 자체
// 부과 RPM 페이싱이 "사건 하나 내에서만" 유효한 범위로 축소된다 — 이 싱글턴이
// 그 페이싱 기억을 프로세스 생애주기 동안 보존한다. options.providers를
// 명시적으로 주입하는 테스트 경로는 이 싱글턴을 전혀 거치지 않는다.
let defaultProviders: RoleProviders | undefined;

export function getDefaultLLMProviders(): RoleProviders {
  if (!defaultProviders) {
    defaultProviders = getLLMProviders(process.env);
  }
  return defaultProviders;
}
