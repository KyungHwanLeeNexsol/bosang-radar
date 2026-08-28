import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../ai/provider";
import { createDeterministicLLMProvider } from "../ai/providers/deterministic";
import { RateScheduler } from "../ai/rate-scheduler";

// 결정론적 provider(design.md §1)로 Gemini API 호출 없이 파이프라인 전 구간을
// 검증한다. EvidenceRetriever(M4)가 정적 seed JSON 대신 실제 Drizzle DB
// 조회로 재작성되면서(evidence-retriever.ts) retrieveEvidence()의 기본
// 인자(db = getDb())가 TURSO_DATABASE_URL 등 app 스코프 환경변수를 요구하게
// 되었다 — runPipeline()은 db를 옵션으로 노출하지 않으므로,
// evidence-retriever.test.ts가 db를 직접 주입받는 것과 동일한 효과를 이
// 통합 테스트에서는 "../db/client" 모듈 목업으로 재현한다(get-case-for-owner.test.ts와
// 동일한 vi.mock 패턴).
// evidenceOverride: AC-GEMINI-RUNTIME-023 계측 테스트가 시나리오별로 evidence
// 행 구성을 직접 통제하기 위한 재할당 가능한 홀더다 — null이면 기존
// fakeEvidenceRows로 폴백해 다른 테스트의 동작을 바꾸지 않는다.
const { fakeEvidenceRows, evidenceOverride } = vi.hoisted(() => ({
  fakeEvidenceRows: [
    {
      id: "vitest-index-evidence-1",
      category: "상해후유장해",
      evidenceType: "PRECEDENT",
      scope: "UNIVERSAL",
      title: "우측 발목 관련 결정론적 테스트 근거자료",
      content: "우측 발목 상해 관련 검토용 테스트 콘텐츠입니다.",
      sourceUrl: null,
    },
  ],
  evidenceOverride: { rows: null as unknown[] | null },
}));

vi.mock("../db/client", () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: async () => evidenceOverride.rows ?? fakeEvidenceRows,
    }),
  })),
}));

const validInput = {
  incidentDescription: "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.",
  diagnosisName: "우측 발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
};

describe("lib/pipeline/index runPipeline end-to-end (AC-SCAFFOLD-013, REQ-SCAFFOLD-014, AC-RESEARCH-025)", () => {
  it("6단계(CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier)를 순차 실행해 seed evidence와 연결된 Research Report를 생성한다", async () => {
    const { runPipeline } = await import("./index");

    // 결정론적 provider를 명시 주입한다 — Gemini API 키가 없는 테스트 환경에서도
    // 실제 네트워크 호출 없이 파이프라인 전 구간을 검증한다(design.md §1, §3,
    // AC-RESEARCH-025). options.providers가 있으면 getDefaultLLMProviders()
    // (env 기반 선택 싱글턴)는 호출되지 않는다(lib/pipeline/index.ts).
    const deterministicProvider = createDeterministicLLMProvider();
    const report = await runPipeline(validInput, {
      providers: { research: deterministicProvider, fast: deterministicProvider },
    });

    expect(report.caseSummary.incidentDescription).toBe(validInput.incidentDescription);
    expect(report.verifiedClaims.length).toBeGreaterThan(0);
    // VERIFIED claim은 반드시 evidence를 갖고, INSUFFICIENT claim은 반드시
    // 비어 있어야 한다(2차 코드 리뷰 item 1 — semantic verification fail-closed
    // 시 claim.status와 supportingEvidenceIds가 항상 함께 비워지도록 정합화됨).
    // 최소 하나는 VERIFIED로 evidence-backed claim이 실제로 존재함을 확인한다.
    for (const claim of report.verifiedClaims) {
      if (claim.status === "VERIFIED") {
        expect(claim.supportingEvidenceIds.length).toBeGreaterThan(0);
      } else {
        expect(claim.supportingEvidenceIds.length).toBe(0);
      }
    }
    expect(report.verifiedClaims.some((claim) => claim.status === "VERIFIED")).toBe(true);
    expect(() => new Date(report.generatedAt).toISOString()).not.toThrow();
  });
});

// SPEC-GEMINI-RUNTIME-001 M4 (design.md §4, plan.md §B M4): 동시 사건 제한
// (pipelineChain 프로세스 로컬 뮤텍스) + D-NEW1(getDefaultLLMProviders() 싱글턴을
// 통한 사건 경계 간 RateScheduler 페이싱 기억 보존) 테스트. 아래 헬퍼는 research
// 배치 프롬프트("[RESEARCH] 쿼리 ID: <id>" + 근거자료 불릿 "- [id] title: content")에서
// 쿼리 ID/evidence ID를 추출해, buildFindingBatchSchema()를 satisfy하는 finding 1건을
// 만든다 — researcher.ts/skeptic.ts/verifier.ts는 이번 milestone에서 변경하지 않으므로
// (plan.md §D 제약 1), 실제 배치 프롬프트 마커 규약을 그대로 재사용한다.
function extractResearchFixture(prompt: string): { queryId: string; evidenceId: string } | null {
  const queryIdMatch = /\[RESEARCH\] 쿼리 ID: (\S+)/.exec(prompt);
  const evidenceIdMatch = /^-\s*\[([^\]\s]+)\]/m.exec(prompt);
  if (!queryIdMatch || !evidenceIdMatch) {
    return null;
  }
  return { queryId: queryIdMatch[1], evidenceId: evidenceIdMatch[1] };
}

describe("동시 사건 제한 — 프로세스 로컬 pipelineChain 뮤텍스 (M4, design.md §4, REQ-GEMINI-RUNTIME-013/014)", () => {
  it("두 runPipeline() 호출이 거의 동시에 시작되어도 Gemini 호출 구간(Researcher~Verifier)이 항상 직렬화되며, 대기하는 두 번째 호출은 에러 없이 정상 완료된다 (AC-GEMINI-RUNTIME-016)", async () => {
    const { runPipeline } = await import("./index");

    let active = 0;
    let maxActive = 0;
    const events: string[] = [];

    function makeConcurrencyProbeProvider(label: string, holdMs: number): LLMProvider {
      return {
        async generate() {
          return { text: "probe" };
        },
        async generateStructured() {
          active += 1;
          maxActive = Math.max(maxActive, active);
          events.push(`${label}-enter`);
          await new Promise((resolve) => setTimeout(resolve, holdMs));
          events.push(`${label}-exit`);
          active -= 1;
          return { ok: false, reason: "invalid_json", raw: "" };
        },
      };
    }

    const providerA = makeConcurrencyProbeProvider("A", 30);
    const providerB = makeConcurrencyProbeProvider("B", 5);

    const [reportA, reportB] = await Promise.all([
      runPipeline(validInput, { providers: { research: providerA, fast: providerA } }),
      runPipeline(validInput, { providers: { research: providerB, fast: providerB } }),
    ]);

    // 프로세스 안에서 두 사건의 Gemini 호출 구간이 동시에 활성화된 적이 없어야 한다.
    expect(maxActive).toBe(1);
    // 두 사건 모두 실제로 provider를 호출했다 — 뮤텍스가 한쪽을 건너뛰지 않는다.
    expect(events.filter((e) => e.endsWith("-enter")).length).toBe(2);
    // 대기한 쪽도 예외 없이 정상 완료된다(design.md §4 — "예외로 거부되지 않는다").
    expect(() => new Date(reportA.generatedAt).toISOString()).not.toThrow();
    expect(() => new Date(reportB.generatedAt).toISOString()).not.toThrow();
  });

  it("사건 A의 Gemini 호출 구간이 예외로 실패해도 pipelineChain이 끊기지 않고, 뒤이은 사건 B가 정상적으로 자신의 차례를 얻어 완료된다 (design.md §4 — '체인이 한번 끊기면 이후 모든 호출이 즉시 실행돼버리므로, 실패도 반드시 삼켜 체인을 이어간다')", async () => {
    const { runPipeline } = await import("./index");

    const failingProvider: LLMProvider = {
      async generate() {
        return { text: "probe" };
      },
      async generateStructured() {
        throw new Error("사건 A의 Gemini 호출 실패(테스트 주입)");
      },
    };

    // 사건 A는 예외로 거부되어야 한다 — @MX:WARN(index.ts) "한 단계의 실패가
    // 전체 파이프라인 실패로 즉시 전파된다"와 일관된 동작이다.
    await expect(
      runPipeline(validInput, { providers: { research: failingProvider, fast: failingProvider } })
    ).rejects.toThrow("사건 A의 Gemini 호출 실패(테스트 주입)");

    // 사건 B는 사건 A의 실패와 무관하게 정상적으로 자신의 차례를 얻어 완료된다 —
    // pipelineChain이 실패 이후에도 끊기지 않았음을 직접 확인한다.
    const deterministicProvider = createDeterministicLLMProvider();
    const reportB = await runPipeline(validInput, {
      providers: { research: deterministicProvider, fast: deterministicProvider },
    });
    expect(() => new Date(reportB.generatedAt).toISOString()).not.toThrow();
  });
});

describe("D-NEW1 — getDefaultLLMProviders() 프로세스 싱글턴을 통한 사건 경계 간 Fast 스케줄러 페이싱 기억 보존 (AC-GEMINI-RUNTIME-016a, REQ-GEMINI-RUNTIME-025)", () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalMode = process.env.LLM_PROVIDER_MODE;
  const originalResearchModel = process.env.GEMINI_RESEARCH_MODEL;
  const originalFastModel = process.env.GEMINI_FAST_MODEL;

  afterEach(() => {
    vi.useRealTimers();
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalMode === undefined) delete process.env.LLM_PROVIDER_MODE;
    else process.env.LLM_PROVIDER_MODE = originalMode;
    if (originalResearchModel === undefined) delete process.env.GEMINI_RESEARCH_MODEL;
    else process.env.GEMINI_RESEARCH_MODEL = originalResearchModel;
    if (originalFastModel === undefined) delete process.env.GEMINI_FAST_MODEL;
    else process.env.GEMINI_FAST_MODEL = originalFastModel;
    vi.doUnmock("@google/genai");
    vi.resetModules();
  });

  it("options.providers 없이(정상 앱 경로) 사건 A → 사건 B를 순차 실행하면, Fast 역할 RateScheduler의 lastStartedAt이 사건 경계를 넘어 유지되어 사건 B가 새로 초기화된 스케줄러처럼 즉시 발사되지 않는다", async () => {
    vi.resetModules();
    delete process.env.LLM_PROVIDER_MODE;
    delete process.env.GEMINI_RESEARCH_MODEL;
    delete process.env.GEMINI_FAST_MODEL;
    process.env.GEMINI_API_KEY = "test-key";

    // DEFAULT_RESEARCH_MODEL/DEFAULT_FAST_MODEL(provider-factory.ts, 비공개 상수) —
    // provider-factory.test.ts의 기존 검증과 동일한 리터럴 값을 그대로 참조한다.
    const FAST_MODEL = "gemini-3.5-flash-lite";
    const callLog: { model: string; t: number }[] = [];

    const generateContentMock = vi.fn(
      async ({ model, contents }: { model: string; contents: string }) => {
        callLog.push({ model, t: Date.now() });
        const fixture = extractResearchFixture(contents);
        if (fixture) {
          return {
            text: JSON.stringify({
              findings: [
                {
                  queryId: fixture.queryId,
                  summary: "테스트 소견",
                  supportingEvidenceIds: [fixture.evidenceId],
                },
              ],
            }),
          };
        }
        // Skeptic/Verifier 호출 — 이 테스트는 스케줄러 페이싱 타이밍만 검증하므로
        // 응답 내용의 스키마 정합성은 무관하다(GeminiProvider.generateStructured()가
        // JSON.parse 실패를 예외 없이 ok:false로 처리함, gemini.ts 참고).
        return { text: "not-json" };
      }
    );
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: vi.fn().mockImplementation(function MockGoogleGenAI() {
        return { models: { generateContent: generateContentMock } };
      }),
    }));

    vi.useFakeTimers();
    vi.setSystemTime(0);

    const { runPipeline } = await import("./index");

    // 사건 A — 프로세스 생애주기 싱글턴 경로(getDefaultLLMProviders())를 그대로 탄다.
    const caseAPromise = runPipeline(validInput);
    await vi.runAllTimersAsync();
    await caseAPromise;

    const fastTimesA = callLog
      .filter((entry) => entry.model === FAST_MODEL)
      .map((entry) => entry.t);
    expect(fastTimesA.length).toBeGreaterThanOrEqual(1);
    // Fast 스케줄러의 최초 사용이므로 대기 없이 즉시(t=0) 발사된다.
    expect(fastTimesA[0]).toBe(0);
    const lastFastTimeOfCaseA = Math.max(...fastTimesA);

    // 사건 A가 완전히 끝난 뒤(동시성 락 해제 후), 최소 간격(15000ms)이 아직 차지 않은
    // 시점(사건 A의 마지막 실제 Fast 시도 + 5000ms)에 사건 B를 시작한다.
    const caseBStartTime = lastFastTimeOfCaseA + 5000;
    vi.setSystemTime(caseBStartTime);
    const caseAFastCallCount = fastTimesA.length;

    const caseBPromise = runPipeline(validInput);
    await vi.runAllTimersAsync();
    await caseBPromise;

    const fastTimesB = callLog
      .filter((entry) => entry.model === FAST_MODEL)
      .map((entry) => entry.t)
      .slice(caseAFastCallCount);
    expect(fastTimesB.length).toBeGreaterThanOrEqual(1);

    // 사건 B가 새로 초기화된 스케줄러처럼 caseBStartTime에 즉시 발사되지 않는다.
    expect(fastTimesB[0]).not.toBe(caseBStartTime);
    // 사건 A의 lastStartedAt(사건 A의 마지막 실제 Fast 시도 시각) 기준 최소 간격이
    // 충족되는 시점까지 대기한 뒤에야 발사된다 — 프로세스 생애주기 동안 재사용되는
    // 동일 RateScheduler 인스턴스의 페이싱 기억을 그대로 이어받음을 직접 확인한다.
    expect(fastTimesB[0]).toBe(lastFastTimeOfCaseA + 15000);
  });
});

describe("D-NEW1 — 테스트 주입 경로(options.providers) 격리: 프로세스 싱글턴 미경유 + 사건 간 lastStartedAt 무누수 (AC-GEMINI-RUNTIME-016b, REQ-GEMINI-RUNTIME-025)", () => {
  afterEach(() => {
    vi.doUnmock("../ai/provider-factory");
    vi.resetModules();
  });

  it("명시 주입된 서로 다른 두 RoleProviders는 getDefaultLLMProviders() 싱글턴을 단 한 번도 거치지 않으며, 사건 B의 Fast 스케줄러는 사건 A의 스케줄러와 무관하게 자신만의 기준으로 즉시 페이싱을 시작한다", async () => {
    vi.resetModules();
    vi.doMock("../ai/provider-factory", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../ai/provider-factory")>();
      return { ...actual, getDefaultLLMProviders: vi.fn(actual.getDefaultLLMProviders) };
    });

    const { runPipeline } = await import("./index");
    const providerFactory = await import("../ai/provider-factory");
    const getDefaultLLMProvidersSpy = vi.mocked(providerFactory.getDefaultLLMProviders);

    // research 역할은 이 테스트의 관심사가 아니므로 스케줄러 없이 finding만 생성한다.
    function makeResearchOnlyProvider(): LLMProvider {
      return {
        async generate() {
          return { text: "fake" };
        },
        async generateStructured(request) {
          const fixture = extractResearchFixture(request.prompt);
          if (fixture) {
            const candidate = {
              findings: [
                {
                  queryId: fixture.queryId,
                  summary: "테스트 소견",
                  supportingEvidenceIds: [fixture.evidenceId],
                },
              ],
            };
            const parsed = request.schema.safeParse(candidate);
            if (parsed.success) {
              return { ok: true, data: parsed.data };
            }
          }
          return { ok: false, reason: "invalid_json", raw: "" };
        },
      };
    }

    // Fast 역할은 실제 RateScheduler를 감싸, 호출 시각(주입된 fake clock 기준)을 기록한다.
    function makeFastProvider(
      scheduler: RateScheduler,
      nowFn: () => number,
      callLog: number[]
    ): LLMProvider {
      return {
        async generate() {
          await scheduler.waitForSlot();
          callLog.push(nowFn());
          return { text: "fake" };
        },
        async generateStructured() {
          await scheduler.waitForSlot();
          callLog.push(nowFn());
          return { ok: false, reason: "invalid_json", raw: "" };
        },
      };
    }

    // 사건 A — 독립된 fake clock/scheduler A.
    let currentTimeA = 0;
    const nowFnA = () => currentTimeA;
    const fastSchedulerA = new RateScheduler({
      rpmBudget: 4,
      nowFn: nowFnA,
      sleepFn: async (ms: number) => {
        currentTimeA += ms;
      },
    });
    const fastCallTimesA: number[] = [];

    await runPipeline(validInput, {
      providers: {
        research: makeResearchOnlyProvider(),
        fast: makeFastProvider(fastSchedulerA, nowFnA, fastCallTimesA),
      },
    });

    expect(fastCallTimesA.length).toBeGreaterThanOrEqual(1);
    // 스케줄러 A의 최초 사용이므로 대기 없이 즉시(t=0) 발사된다.
    expect(fastCallTimesA[0]).toBe(0);

    // 사건 B — 완전히 별개의 fake clock/scheduler B, 사건 A와 무관한 임의의 시각에서 시작.
    let currentTimeB = 100000;
    const nowFnB = () => currentTimeB;
    const fastSchedulerB = new RateScheduler({
      rpmBudget: 4,
      nowFn: nowFnB,
      sleepFn: async (ms: number) => {
        currentTimeB += ms;
      },
    });
    const fastCallTimesB: number[] = [];

    await runPipeline(validInput, {
      providers: {
        research: makeResearchOnlyProvider(),
        fast: makeFastProvider(fastSchedulerB, nowFnB, fastCallTimesB),
      },
    });

    // (2) lastStartedAt 누수 없음 — 스케줄러 B의 최초 Fast 호출이 사건 A의 어떤 호출
    // 시각에도 영향받지 않고 t=100000에 대기 없이 즉시 발사된다(참조 비동등성 +
    // 상태 독립성을 간접 확인).
    expect(fastCallTimesB.length).toBeGreaterThanOrEqual(1);
    expect(fastCallTimesB[0]).toBe(100000);

    // (1) 명시 주입 경로는 getDefaultLLMProviders() 프로세스 싱글턴을 단 한 번도
    // 거치지 않는다.
    expect(getDefaultLLMProvidersSpy).not.toHaveBeenCalled();
  });
});

// post-run fix: AC-GEMINI-RUNTIME-023 (REQ-GEMINI-RUNTIME-019) — generateStructured()
// 논리적 호출 횟수(Researcher/Skeptic/Verifier가 provider에 요청한 횟수, 재시도로
// 인한 실제 HTTP 시도 횟수와는 별개)가 쿼리/evidence 개수와 무관하게 정확히 3회로
// 고정됨을 실제 6단계 파이프라인을 통해 계측한다(researcher.ts/skeptic.ts 단위
// 목업이 아니라 runPipeline() end-to-end 경로).
describe("AC-GEMINI-RUNTIME-023 — generateStructured() 논리적 호출 횟수는 쿼리/evidence 구성과 무관하게 정확히 3회(Researcher 1 + Skeptic 1 + Verifier 1)로 고정된다", () => {
  afterEach(() => {
    evidenceOverride.rows = null;
  });

  interface MarkedBlock {
    queryId: string;
    evidenceIds: string[];
  }

  // researcher.ts/skeptic.ts가 방출하는 "[RESEARCH]"/"[SKEPTIC] 쿼리 ID: <id>"
  // 마커로 구분된 각 블록을 파싱한다(researcher.test.ts/skeptic.test.ts와 동일한
  // extractQueryBlocks 패턴 재사용, plan.md §D 제약 1 — 이번 milestone에서 세
  // 단계 모듈의 마커 규약 자체는 변경하지 않는다).
  function extractMarkedBlocks(prompt: string, marker: string): MarkedBlock[] {
    const sections = prompt.split(`${marker} 쿼리 ID: `).slice(1);
    return sections.map((section) => {
      const [idLine, ...rest] = section.split("\n");
      const body = rest.join("\n");
      const evidenceIds = [...body.matchAll(/^- \[([^\]]+)\]/gm)].map((match) => match[1]);
      return { queryId: idLine.trim(), evidenceIds };
    });
  }

  // verifier.ts의 claim 블록 헤더는 "쿼리 ID: <id>"로 시작한다 — "반론 쿼리 ID: "로
  // 시작하는 counterArgument 블록과는 줄 시작 앵커(^)로 구분된다(반론 블록은
  // "반론"으로 시작하므로 이 정규식과 매칭되지 않는다).
  function extractVerifierClaimIds(prompt: string): string[] {
    return [...prompt.matchAll(/^쿼리 ID: (\S+)$/gm)].map((match) => match[1]);
  }

  function extractVerifierCounterArgumentBlocks(
    prompt: string
  ): { queryId: string; index: number }[] {
    const blocks = prompt.split("반론 쿼리 ID: ").slice(1);
    return blocks.map((block) => {
      const lines = block.split("\n");
      const queryId = lines[0].trim();
      const indexLine = lines.find((line) => line.startsWith("반론 번호: "));
      const index = indexLine ? Number(indexLine.replace("반론 번호: ", "").trim()) : 0;
      return { queryId, index };
    });
  }

  // Researcher/Skeptic/Verifier 세 단계 모두를 하나의 provider 인스턴스로
  // 계측한다 — 사건 전체의 논리적 배치 호출 총 횟수를 하나의 카운터로 직접
  // 센다. 프롬프트를 "[RESEARCH]"/"[SKEPTIC]" 마커로 식별하고, 둘 다 아니면
  // Verifier의 의미 검증 요청으로 간주해 실제로 전달된 candidate 집합과 정확히
  // 1:1 대응하는 응답을 구성한다(verifier.ts의 .refine() 1:1 대응 제약 충족).
  // per-stage 계측: 총 호출 횟수(calls)뿐 아니라 Researcher/Skeptic/Verifier
  // 각 단계가 정확히 1회씩만 호출됐음을 개별적으로 검증하기 위한 3개의 독립
  // 카운터(post-run cleanup: AC-GEMINI-RUNTIME-023 stage별 계측 보강).
  function makeInstrumentedBatchProvider(): {
    provider: LLMProvider;
    callCount: () => number;
    stageCallCounts: () => { research: number; skeptic: number; verifier: number };
  } {
    let calls = 0;
    let researchCalls = 0;
    let skepticCalls = 0;
    let verifierCalls = 0;
    const provider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(
        request: GenerateStructuredRequest<T>
      ): Promise<StructuredResult<T>> {
        calls += 1;
        let candidate: unknown;
        if (request.prompt.includes("[RESEARCH] 쿼리 ID: ")) {
          researchCalls += 1;
          const blocks = extractMarkedBlocks(request.prompt, "[RESEARCH]");
          candidate = {
            findings: blocks.map((block) => ({
              queryId: block.queryId,
              summary: "정상 소견입니다.",
              supportingEvidenceIds: block.evidenceIds.slice(0, 1),
            })),
          };
        } else if (request.prompt.includes("[SKEPTIC] 쿼리 ID: ")) {
          skepticCalls += 1;
          const blocks = extractMarkedBlocks(request.prompt, "[SKEPTIC]");
          candidate = {
            challenges: blocks.map((block) => ({
              queryId: block.queryId,
              counterArgument: "기왕증 가능성이 있어 추가 확인이 필요합니다.",
              supportingEvidenceIds: [],
              counterEvidenceIds: [],
            })),
          };
        } else {
          verifierCalls += 1;
          const claimIds = extractVerifierClaimIds(request.prompt);
          const caBlocks = extractVerifierCounterArgumentBlocks(request.prompt);
          candidate = {
            claims: claimIds.map((queryId) => ({
              queryId,
              supportedEvidenceIds: [],
              reason: "의미 검증 결과(테스트 스텁)",
            })),
            counterArguments: caBlocks.map(({ queryId, index }) => ({
              queryId,
              counterArgumentIndex: index,
              supportedEvidenceIds: [],
              counterEvidenceIds: [],
              reason: "의미 검증 결과(테스트 스텁)",
            })),
          };
        }
        const result = request.schema.safeParse(candidate);
        return result.success
          ? { ok: true, data: result.data }
          : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
      },
    };
    return {
      provider,
      callCount: () => calls,
      stageCallCounts: () => ({
        research: researchCalls,
        skeptic: skepticCalls,
        verifier: verifierCalls,
      }),
    };
  }

  function makeEvidenceRow(id: string, category: string, content: string) {
    return {
      id,
      category,
      evidenceType: "PRECEDENT",
      scope: "DOMAIN_SPECIFIC",
      title: `제목-${id}`,
      content,
      sourceUrl: null,
    };
  }

  // incidentDescription 길이 >= 30이면 두 도메인 모두에 INCIDENT_CIRCUMSTANCE가
  // 추가되어(query-planner.ts) 기본 6개(도메인당 3개) + 2개 = 8개 쿼리가 된다.
  // 다른 조건부 트리거 키워드("이전"/"질병"/"불명확" 등)는 포함하지 않는다.
  const eightQueryInput = {
    incidentDescription:
      "2024년 5월 10일 사무실 계단에서 발을 헛디뎌 넘어지면서 우측 무릎을 심하게 부딪혔습니다.",
    diagnosisName: "우측 무릎 전방십자인대 파열",
    disabilityBodyPart: "우측 무릎",
    incidentDate: "2024-05-10",
  };

  // incidentDescription 길이가 짧아(< 30) INCIDENT_CIRCUMSTANCE가 트리거되지
  // 않으므로 기본 6개 쿼리(도메인당 3개)만 생성된다.
  const sixQueryInput = {
    incidentDescription: "계단에서 넘어져 다쳤습니다.",
    diagnosisName: "우측 무릎 인대파열",
    disabilityBodyPart: "우측 무릎",
    incidentDate: "2024-05-10",
  };

  it("evidence가 있는 8개 쿼리 → 3회, evidence-bearing 후보를 3개로 줄여도 3회, 5+3 혼합 구성에서도 3회로 논리적 호출 횟수가 고정된다", async () => {
    const { runPipeline } = await import("./index");

    // (1) evidence가 있는 8개 쿼리 — 두 도메인 각 4개 쿼리 전체에 evidence를
    // 부여한다(REQ-GEMINI-RUNTIME-019 Given). "우측 무릎"(disabilityBodyPart)이
    // 상해후유장해 도메인 4개 쿼리 전부의 keywords에 공통 포함되고, 진단명
    // 전체 문자열이 질병후유장해 도메인 4개 쿼리 전부의 keywords에 공통
    // 포함되므로, evidence 행 2개만으로 8개 쿼리 전체를 커버한다.
    evidenceOverride.rows = [
      makeEvidenceRow("ev-injury-1", "상해후유장해", "우측 무릎 상해 관련 근거자료입니다."),
      makeEvidenceRow(
        "ev-disease-1",
        "질병후유장해",
        "우측 무릎 전방십자인대 파열 관련 근거자료입니다."
      ),
    ];
    const eightQuery = makeInstrumentedBatchProvider();
    await runPipeline(eightQueryInput, {
      providers: { research: eightQuery.provider, fast: eightQuery.provider },
    });
    expect(eightQuery.callCount()).toBe(3);
    expect(eightQuery.stageCallCounts()).toEqual({ research: 1, skeptic: 1, verifier: 1 });

    // (2) 쿼리 개수를 8개에서 3개로 줄여 재실행해도 여전히 3회 — QueryPlanner는
    // 사건당 최소 6개(도메인 2개 × 기본 3개, query-planner.ts)를 항상 생성하므로
    // "쿼리 개수" 자체를 3까지 낮출 수는 없다. Researcher 배치 candidate 개수를
    // 실제로 결정하는 것은 "evidence가 있는 쿼리 개수"이므로(REQ-GEMINI-RUNTIME-004
    // evidence-필터 candidate 집합), INCIDENT_CIRCUMSTANCE 트리거를 끄고(기본 6개)
    // 상해후유장해 도메인(3개)에만 evidence를 부여해 evidence-bearing candidate를
    // 정확히 3개로 통제한다 — AC가 검증하는 핵심 불변량(호출 수가 evidence-bearing
    // 쿼리 개수에 비례하지 않는다)은 그대로 유지된다.
    evidenceOverride.rows = [
      makeEvidenceRow("ev-injury-2", "상해후유장해", "우측 무릎 상해 관련 근거자료입니다."),
    ];
    const threeQuery = makeInstrumentedBatchProvider();
    await runPipeline(sixQueryInput, {
      providers: { research: threeQuery.provider, fast: threeQuery.provider },
    });
    expect(threeQuery.callCount()).toBe(3);
    expect(threeQuery.stageCallCounts()).toEqual({ research: 1, skeptic: 1, verifier: 1 });

    // (3) 8개 쿼리 중 5개만 evidence가 있고 3개는 evidence가 0건인 혼합 구성 —
    // evidence 0건인 3개 쿼리가 Researcher 배치 candidate에서 제외됨
    // (AC-GEMINI-RUNTIME-006)에도 불구하고 논리적 호출 횟수는 여전히 정확히
    // 3회다. 상해후유장해 도메인 4개 전부 + 질병후유장해 도메인의
    // DISABILITY_GRADE_CRITERIA 1개(오직 "장해 평가 기준" 키워드로만 매칭,
    // 진단명 문자열은 포함하지 않아 나머지 3개 질병후유장해 쿼리는 매칭되지
    // 않는다)만 evidence를 갖도록 구성한다.
    evidenceOverride.rows = [
      makeEvidenceRow("ev-injury-3", "상해후유장해", "우측 무릎 상해 관련 근거자료입니다."),
      makeEvidenceRow("ev-disease-grade", "질병후유장해", "장해 평가 기준 관련 근거자료입니다."),
    ];
    const mixedQuery = makeInstrumentedBatchProvider();
    await runPipeline(eightQueryInput, {
      providers: { research: mixedQuery.provider, fast: mixedQuery.provider },
    });
    expect(mixedQuery.callCount()).toBe(3);
    expect(mixedQuery.stageCallCounts()).toEqual({ research: 1, skeptic: 1, verifier: 1 });
  });
});
