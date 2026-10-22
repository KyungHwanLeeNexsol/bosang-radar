// 시계 구현. 실제 타이머는 SystemClock 안에서만 쓴다 — 세션·시험의 시간 의존 로직은
// Clock 포트로 주입받으므로 VirtualClock으로 결정적으로 재현할 수 있다.

import type { Clock, TimerHandle } from "./types";

export class SystemClock implements Clock {
  now(): number {
    // 벽시계가 아니라 단조 시계 — 시스템 시각 조정에 판정 한도가 흔들리면 안 된다.
    return performance.now();
  }

  setTimer(fn: () => void, ms: number): TimerHandle {
    const handle = setTimeout(fn, Math.max(0, ms));
    return { cancel: () => clearTimeout(handle) };
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, ms));
    });
  }
}

interface VirtualTimer {
  seq: number;
  due: number;
  fn: () => void;
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

// @MX:ANCHOR: [AUTO] 세션 한도·장벽·종료 대기 시험이 시간을 만지는 유일한 수단
// @MX:REASON: advance가 타이머 사이마다 이벤트 루프를 한 바퀴 돌려 약속 연쇄를 가라앉히는 순서
// 계약에 시험의 결정성이 달려 있다. 이 순서를 바꾸면 "다음 타이머가 이전 콜백의 결과를 보고
// 등록되는" 시나리오가 실제 시계와 다르게 재생된다.
export class VirtualClock implements Clock {
  private current: number;
  private seq = 0;
  private timers: VirtualTimer[] = [];

  constructor(startMs = 0) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  setTimer(fn: () => void, ms: number): TimerHandle {
    const timer: VirtualTimer = { seq: this.seq++, due: this.current + Math.max(0, ms), fn };
    this.timers.push(timer);
    return {
      cancel: () => {
        this.timers = this.timers.filter((t) => t !== timer);
      },
    };
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.setTimer(resolve, ms);
    });
  }

  get pendingTimers(): number {
    return this.timers.length;
  }

  /**
   * 가상 시간을 ms만큼 앞으로 보내며 기한이 된 타이머를 기한 순(동률이면 등록 순)으로 실행한다.
   * 각 콜백이 도는 동안 now()는 그 타이머의 기한이고, 콜백 뒤에는 이벤트 루프를 한 바퀴 돌려
   * 그 콜백이 시작한 약속 연쇄가 다음 타이머 전에 가라앉게 한다. 창 안에서 새로 등록된 타이머도 돈다.
   */
  async advance(ms: number): Promise<void> {
    const target = this.current + Math.max(0, ms);
    for (;;) {
      const next = this.nextDue(target);
      if (!next) break;
      this.timers = this.timers.filter((t) => t !== next);
      this.current = Math.max(this.current, next.due);
      next.fn();
      await nextTurn();
    }
    this.current = target;
  }

  /** 시간을 움직이지 않고 이벤트 루프만 한 바퀴 돌려 대기 중인 약속 연쇄를 가라앉힌다. */
  async flush(): Promise<void> {
    await nextTurn();
  }

  private nextDue(limit: number): VirtualTimer | undefined {
    let best: VirtualTimer | undefined;
    for (const timer of this.timers) {
      if (timer.due > limit) continue;
      if (!best || timer.due < best.due || (timer.due === best.due && timer.seq < best.seq)) {
        best = timer;
      }
    }
    return best;
  }
}
