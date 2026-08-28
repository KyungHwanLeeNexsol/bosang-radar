// SPEC-GEMINI-RUNTIME-001 M1: Free-tier self-imposed rate scheduler(design.md §3).
// Google 문서는 실제 quota를 하드코딩하지 말라고 명시하므로, 이 스케줄러는
// "Google이 보장하는 값"이 아니라 우리가 스스로 부과하는 요청 예산만 다룬다.

export interface RateSchedulerOptions {
  rpmBudget: number; // ex) 4 → 요청 시작 간 최소 간격 = 60000/4 = 15000ms
  nowFn?: () => number; // 테스트 주입용 fake clock (기본 Date.now)
  sleepFn?: (ms: number) => Promise<void>; // 테스트 주입용 (기본 setTimeout 래핑)
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// @MX:ANCHOR: [AUTO] provider-factory.ts가 역할별 GeminiProvider에 주입하는
// 자체 부과(self-imposed) rate limiter — model ID가 같은 두 역할은 이 인스턴스를
// 공유할 수 있다(design.md §1 D3).
// @MX:REASON: rpmBudget/waitForSlot() 시그니처 변경은 provider-factory.ts의
// 공유·min-budget 계산 로직 전체와 GeminiProvider.withRetry()(M3)에 영향을 준다.
export class RateScheduler {
  readonly rpmBudget: number;
  private lastStartedAt: number | null = null;

  constructor(private readonly opts: RateSchedulerOptions) {
    this.rpmBudget = opts.rpmBudget;
  }

  async waitForSlot(): Promise<void> {
    const minIntervalMs = Math.ceil(60_000 / this.rpmBudget);
    const now = (this.opts.nowFn ?? Date.now)();
    if (this.lastStartedAt !== null) {
      const remaining = minIntervalMs - (now - this.lastStartedAt);
      if (remaining > 0) {
        await (this.opts.sleepFn ?? defaultSleep)(remaining);
      }
    }
    this.lastStartedAt = (this.opts.nowFn ?? Date.now)();
  }
}
