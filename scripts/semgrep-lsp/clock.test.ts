import { describe, expect, it } from "vitest";
import { SystemClock, VirtualClock } from "./clock";

describe("VirtualClock", () => {
  it("시작 시각을 주면 now()가 그 값이고, 기본은 0이다", () => {
    expect(new VirtualClock().now()).toBe(0);
    expect(new VirtualClock(500).now()).toBe(500);
  });

  it("advance 없이는 타이머가 돌지 않는다", async () => {
    const clock = new VirtualClock();
    let ran = false;
    clock.setTimer(() => {
      ran = true;
    }, 10);
    await clock.flush();
    expect(ran).toBe(false);
    expect(clock.pendingTimers).toBe(1);
  });

  it("기한 순으로 실행하고 동률이면 등록 순으로 실행한다", async () => {
    const clock = new VirtualClock();
    const order: string[] = [];
    clock.setTimer(() => order.push("c@30"), 30);
    clock.setTimer(() => order.push("a@10"), 10);
    clock.setTimer(() => order.push("b1@20"), 20);
    clock.setTimer(() => order.push("b2@20"), 20);
    await clock.advance(100);
    expect(order).toEqual(["a@10", "b1@20", "b2@20", "c@30"]);
    expect(clock.now()).toBe(100);
  });

  it("콜백이 도는 동안 now()는 그 타이머의 기한이다", async () => {
    const clock = new VirtualClock(5);
    const seen: number[] = [];
    clock.setTimer(() => seen.push(clock.now()), 10);
    clock.setTimer(() => seen.push(clock.now()), 40);
    await clock.advance(50);
    expect(seen).toEqual([15, 45]);
    expect(clock.now()).toBe(55);
  });

  it("창 밖의 타이머는 남겨 두고 시간만 흐른다", async () => {
    const clock = new VirtualClock();
    let ran = 0;
    clock.setTimer(() => ran++, 10);
    clock.setTimer(() => ran++, 100);
    await clock.advance(50);
    expect(ran).toBe(1);
    expect(clock.pendingTimers).toBe(1);
    await clock.advance(50);
    expect(ran).toBe(2);
    expect(clock.pendingTimers).toBe(0);
  });

  it("기한이 정확히 창의 끝이면 실행한다", async () => {
    const clock = new VirtualClock();
    let ran = false;
    clock.setTimer(() => {
      ran = true;
    }, 50);
    await clock.advance(50);
    expect(ran).toBe(true);
  });

  it("음수 지연은 0으로 본다", async () => {
    const clock = new VirtualClock(10);
    let at = -1;
    clock.setTimer(() => {
      at = clock.now();
    }, -5);
    await clock.advance(0);
    expect(at).toBe(10);
  });

  it("창 안에서 등록된 타이머도 같은 advance에서 돈다", async () => {
    const clock = new VirtualClock();
    const order: string[] = [];
    clock.setTimer(() => {
      order.push(`outer@${clock.now()}`);
      clock.setTimer(() => order.push(`inner@${clock.now()}`), 20);
      clock.setTimer(() => order.push(`late@${clock.now()}`), 500);
    }, 10);
    await clock.advance(100);
    expect(order).toEqual(["outer@10", "inner@30"]);
    expect(clock.pendingTimers).toBe(1);
  });

  it("취소한 타이머는 돌지 않고 pendingTimers에도 세지 않는다", async () => {
    const clock = new VirtualClock();
    let ran = false;
    const handle = clock.setTimer(() => {
      ran = true;
    }, 10);
    clock.setTimer(() => {}, 20);
    expect(clock.pendingTimers).toBe(2);
    handle.cancel();
    expect(clock.pendingTimers).toBe(1);
    handle.cancel();
    await clock.advance(100);
    expect(ran).toBe(false);
    expect(clock.pendingTimers).toBe(0);
  });

  it("콜백이 다른 타이머를 취소하면 그 타이머는 돌지 않는다", async () => {
    const clock = new VirtualClock();
    const order: string[] = [];
    const later = clock.setTimer(() => order.push("later"), 20);
    clock.setTimer(() => {
      order.push("first");
      later.cancel();
    }, 10);
    await clock.advance(100);
    expect(order).toEqual(["first"]);
  });

  it("advance는 타이머 사이에 약속 연쇄를 가라앉힌다", async () => {
    const clock = new VirtualClock();
    const order: string[] = [];
    let resolveGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    // @10: 약속을 풀면, 그 연쇄가 @30 타이머를 새로 등록한다.
    void gate.then(async () => {
      order.push(`chain-start@${clock.now()}`);
      await Promise.resolve();
      clock.setTimer(() => order.push(`chained@${clock.now()}`), 20);
    });
    clock.setTimer(() => {
      order.push("first");
      resolveGate();
    }, 10);
    clock.setTimer(() => order.push("second@50"), 50);
    await clock.advance(100);
    expect(order).toEqual(["first", "chain-start@10", "chained@30", "second@50"]);
  });

  it("sleep은 가상 시간이 지나야 풀린다", async () => {
    const clock = new VirtualClock();
    let done = false;
    const sleeping = clock.sleep(100).then(() => {
      done = true;
    });
    await clock.advance(99);
    expect(done).toBe(false);
    await clock.advance(1);
    await sleeping;
    expect(done).toBe(true);
  });

  it("콜백이 던지면 advance가 거부된다", async () => {
    const clock = new VirtualClock();
    clock.setTimer(() => {
      throw new Error("콜백 실패");
    }, 10);
    await expect(clock.advance(20)).rejects.toThrow("콜백 실패");
  });

  it("flush는 시간을 움직이지 않는다", async () => {
    const clock = new VirtualClock(7);
    let settled = false;
    void Promise.resolve().then(() => {
      settled = true;
    });
    await clock.flush();
    expect(settled).toBe(true);
    expect(clock.now()).toBe(7);
  });
});

describe("SystemClock", () => {
  it("now()는 단조 증가한다", () => {
    const clock = new SystemClock();
    const a = clock.now();
    const b = clock.now();
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it("setTimer는 지연 뒤에 콜백을 부르고 sleep은 풀린다", async () => {
    const clock = new SystemClock();
    const fired = new Promise<void>((resolve) => {
      clock.setTimer(resolve, 1);
    });
    await fired;
    await clock.sleep(1);
  });

  it("취소한 타이머는 콜백을 부르지 않는다", async () => {
    const clock = new SystemClock();
    let ran = false;
    const handle = clock.setTimer(() => {
      ran = true;
    }, 1);
    handle.cancel();
    await clock.sleep(20);
    expect(ran).toBe(false);
  });
});
