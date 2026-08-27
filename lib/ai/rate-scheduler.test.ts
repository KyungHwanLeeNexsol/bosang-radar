import { describe, expect, it } from "vitest";
import { RateScheduler } from "./rate-scheduler";

describe("lib/ai/rate-scheduler RateScheduler (SPEC-GEMINI-RUNTIME-001 M1, design.md §3)", () => {
  it("rpmBudget에서 유도한 최소 간격(60000/rpmBudget)만큼 연속 요청을 페이싱한다 (AC-GEMINI-RUNTIME-013)", async () => {
    let currentTime = 0;
    const sleepCalls: number[] = [];
    const scheduler = new RateScheduler({
      rpmBudget: 4, // 최소 간격 = 60000/4 = 15000ms
      nowFn: () => currentTime,
      sleepFn: async (ms: number) => {
        sleepCalls.push(ms);
        currentTime += ms; // fake sleep이 fake clock을 그만큼 전진시킨다
      },
    });

    await scheduler.waitForSlot(); // 최초 호출 — 대기 없음
    await scheduler.waitForSlot(); // 두 번째 — 15000ms 대기
    await scheduler.waitForSlot(); // 세 번째 — 15000ms 대기

    expect(sleepCalls).toEqual([15000, 15000]);
  });

  it("이미 최소 간격만큼 시간이 지났으면 sleepFn을 호출하지 않는다", async () => {
    let currentTime = 0;
    const sleepCalls: number[] = [];
    const scheduler = new RateScheduler({
      rpmBudget: 4,
      nowFn: () => currentTime,
      sleepFn: async (ms: number) => {
        sleepCalls.push(ms);
      },
    });

    await scheduler.waitForSlot();
    currentTime += 20000; // 최소 간격(15000ms)보다 더 많은 시간 경과
    await scheduler.waitForSlot();

    expect(sleepCalls).toEqual([]);
  });

  it("rpmBudget을 읽기 전용 public 필드로 노출한다 — provider-factory.ts의 min-budget 계산에 사용된다", () => {
    const scheduler = new RateScheduler({ rpmBudget: 10 });
    expect(scheduler.rpmBudget).toBe(10);
  });

  it("nowFn/sleepFn을 생략하면 기본값(Date.now/setTimeout 래핑)으로 동작한다", async () => {
    const scheduler = new RateScheduler({ rpmBudget: 6000 }); // 최소 간격 1ms — 실제 대기 시간을 짧게 유지
    await scheduler.waitForSlot();
    await scheduler.waitForSlot();
    // 예외 없이 완료되면 기본 nowFn/sleepFn 경로가 정상 동작한다는 증거다.
    expect(scheduler.rpmBudget).toBe(6000);
  });
});
