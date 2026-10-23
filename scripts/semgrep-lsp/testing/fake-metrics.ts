// 시험 전용: 관측값을 시험이 정하는 가짜 루프백 수신기. 실제 소켓을 열지 않는다 — CLI·하네스의 연결과 판정 시점 관측을 빠르게
// 확인하려는 것이고, 수신기 자체는 metrics-node.integration.test.ts가 실제 루프백 소켓으로 확인한다.

import type { MetricsReceiver } from "../metrics-node";
import type { MetricsReceiverSummary } from "../types";

export interface FakeMetricsOptions {
  url?: string | null;
  hits?: number | null;
  state?: MetricsReceiverSummary["state"];
  failure?: string | null;
}

export class FakeMetricsReceiver implements MetricsReceiver {
  url: string | null;
  hits: number | null;
  state: MetricsReceiverSummary["state"];
  failure: string | null;
  closeCalls = 0;
  observeCalls = 0;
  /** true면 observe()가 던진다(관측 실패 재현). */
  throwOnObserve = false;
  /** true면 close()가 거부된다(닫지 못함 재현). */
  failClose = false;
  /** observe()가 불릴 때마다 호출된다. 시험이 "관측 시점에" 건수를 바꾸는 데 쓴다. */
  onObserve: ((call: number) => void) | null = null;

  constructor(options: FakeMetricsOptions = {}) {
    this.url = options.url === undefined ? "http://127.0.0.1:41999" : options.url;
    this.hits = options.hits === undefined ? 0 : options.hits;
    this.state = options.state ?? "LISTENING";
    this.failure = options.failure ?? null;
  }

  observe(): MetricsReceiverSummary {
    this.observeCalls += 1;
    this.onObserve?.(this.observeCalls);
    if (this.throwOnObserve) throw new Error("시험: 관측 실패");
    return {
      bind: "127.0.0.1",
      state: this.state,
      failure: this.failure,
      hits: this.state === "FAILED" ? null : this.hits,
      connections: this.hits ?? 0,
      requests: this.hits ?? 0,
      client_errors: 0,
    };
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    if (this.failClose) throw new Error("CLOSE_TIMEOUT");
    if (this.state === "LISTENING") this.state = "CLOSED";
  }
}
