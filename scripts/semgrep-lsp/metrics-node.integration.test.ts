import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { failedMetricsReceiver, startMetricsReceiver, type MetricsReceiver } from "./metrics-node";
import {
  canConnectLoopback,
  holdLoopbackConnection,
  rawLoopback,
  sendKeepAliveRequests,
  sendLoopbackRequest,
} from "./testing/loopback-client";

// 실제 루프백 소켓(127.0.0.1, OS 할당 포트) 위에서 메트릭 수신기를 확인한다. 요청은 이 시험이 같은 컴퓨터의 수신기로 보내는
// 로컬 요청뿐이며 밖으로 나가는 통신은 없다(시험 클라이언트는 127.0.0.1이 아니면 접속하기 전에 던진다).
// 이 수신기가 "관찰한 요청"은 다른 목적지로의 통신이 없었다는 증거가 아니고, 실제 Semgrep이 환경변수를 읽는지는 확인하지 않는다.

const started: MetricsReceiver[] = [];

async function start(): Promise<MetricsReceiver & { url: string }> {
  const receiver = await startMetricsReceiver();
  started.push(receiver);
  if (receiver.url === null) throw new Error("전제: 수신기가 열려야 한다");
  return receiver as MetricsReceiver & { url: string };
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((r) => r.close()));
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("수신기 열기 — 루프백에만, OS가 정한 포트", () => {
  it("주소는 http://127.0.0.1:<포트>이고 포트는 OS가 할당한다(서로 다른 수신기는 서로 다른 포트)", async () => {
    const a = await start();
    const b = await start();
    expect(a.url).toMatch(/^http:\/\/127\.0\.0\.1:[1-9]\d*$/);
    expect(b.url).toMatch(/^http:\/\/127\.0\.0\.1:[1-9]\d*$/);
    expect(a.url).not.toBe(b.url);
    expect(Number(new URL(a.url).port)).toBeGreaterThan(0);
  });

  it("열린 직후의 관측: LISTENING, 0건(관측 중에 센 0이다), 실패 없음", async () => {
    const receiver = await start();
    expect(receiver.observe()).toEqual({
      bind: "127.0.0.1",
      state: "LISTENING",
      failure: null,
      hits: 0,
      connections: 0,
      requests: 0,
      client_errors: 0,
    });
  });

  it("시간이 지나도 아무도 접속하지 않으면 계속 0건이다", async () => {
    const receiver = await start();
    await sleep(150);
    expect(receiver.observe()).toMatchObject({ state: "LISTENING", hits: 0 });
  });
});

describe("요청 누적 관측", () => {
  it("요청 1건 → 1건. 응답은 내용 없는 204다", async () => {
    const receiver = await start();
    const response = await sendLoopbackRequest(receiver.url, { body: "x" });
    expect(response.status).toBe(204);
    expect(receiver.observe()).toMatchObject({
      state: "LISTENING",
      hits: 1,
      requests: 1,
      connections: 1,
      client_errors: 0,
    });
  });

  it("요청이 여러 건이면 누적된다(서로 다른 연결 3개 → 3건)", async () => {
    const receiver = await start();
    for (let i = 0; i < 3; i += 1) await sendLoopbackRequest(receiver.url);
    expect(receiver.observe()).toMatchObject({ hits: 3, requests: 3, connections: 3 });
  });

  it("한 연결로 보낸 여러 요청은 요청 수로 센다(연결 1개, 요청 3건 → 3건)", async () => {
    const receiver = await start();
    const statuses = await sendKeepAliveRequests(receiver.url, 3);
    expect(statuses).toEqual([204, 204, 204]);
    expect(receiver.observe()).toMatchObject({ requests: 3, hits: 3 });
    expect(receiver.observe().connections).toBeLessThanOrEqual(3);
  });

  it("접속만 하고 아무것도 보내지 않아도 센다(보수적): 연결 1개, 요청 0건 → 1건", async () => {
    const receiver = await start();
    const held = await holdLoopbackConnection(receiver.url);
    expect(held.connected).toBe(true);
    await sleep(50);
    expect(receiver.observe()).toMatchObject({ connections: 1, requests: 0, hits: 1 });
    held.close();
  });

  it("HTTP가 아닌 바이트를 보내도 센다(잘못된 요청 1건)", async () => {
    const receiver = await start();
    await rawLoopback(receiver.url, "this is not http\r\n\r\n", { settleMs: 200 });
    const seen = receiver.observe();
    expect(seen.client_errors).toBeGreaterThanOrEqual(1);
    expect(seen.hits).toBeGreaterThanOrEqual(1);
    expect(seen.requests).toBe(0);
  });

  it("지연 요청: 접속은 즉시 센 뒤 늦게 도착한 요청까지 같은 연결의 1건으로 누적한다(이중 계산 없음)", async () => {
    const receiver = await start();
    const atStart = receiver.observe(); // 시작 시점의 스냅샷
    const late = rawLoopback(
      receiver.url,
      "POST /late HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
      { delayMs: 150, settleMs: 300 }
    );
    await sleep(60);
    // 요청 본문이 아직 오지 않았어도 접속은 이미 관측됐다.
    expect(receiver.observe()).toMatchObject({ connections: 1, requests: 0, hits: 1 });
    await late;
    expect(receiver.observe()).toMatchObject({ connections: 1, requests: 1, hits: 1 });
    // 시작 시점의 스냅샷은 그대로 0이다 — 판정에 이것을 쓰면 놓친다. 그래서 하네스는 판정 시점에 observe()를 부른다.
    expect(atStart.hits).toBe(0);
  });

  it("관측값에는 건수와 상태만 있다 — 본문·헤더·토큰·URL은 어디에도 남지 않는다", async () => {
    const receiver = await start();
    await sendLoopbackRequest(receiver.url, {
      path: "/secret-path?token=URLTOKEN",
      headers: { authorization: "Bearer HEADERSECRET", "x-semgrep-token": "XTOKEN" },
      body: "BODYSECRET",
    });
    const seen = receiver.observe();
    expect(Object.keys(seen).sort()).toEqual([
      "bind",
      "client_errors",
      "connections",
      "failure",
      "hits",
      "requests",
      "state",
    ]);
    const text = JSON.stringify(seen);
    for (const secret of ["URLTOKEN", "HEADERSECRET", "XTOKEN", "BODYSECRET", "secret-path"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("닫기와 정리", () => {
  it("닫으면 새 접속이 거부되고, 닫기 전까지의 관측은 그대로 유효하다(CLOSED)", async () => {
    const receiver = await start();
    await sendLoopbackRequest(receiver.url);
    await receiver.close();
    expect(await canConnectLoopback(receiver.url!)).toBe(false);
    expect(receiver.observe()).toMatchObject({ state: "CLOSED", failure: null, hits: 1 });
  });

  it("닫은 뒤의 요청은 거부되어 세지 않는다", async () => {
    const receiver = await start();
    await receiver.close();
    await expect(sendLoopbackRequest(receiver.url!)).rejects.toBeTruthy();
    expect(receiver.observe()).toMatchObject({ state: "CLOSED", hits: 0 });
  });

  it("열려 있는 소켓은 닫을 때 끊기고, 닫기는 기다리지 않고 끝난다", async () => {
    const receiver = await start();
    const held = await holdLoopbackConnection(receiver.url);
    expect(held.connected).toBe(true);
    const began = Date.now();
    await receiver.close();
    await held.closed; // 수신기가 소켓을 끊었다
    expect(Date.now() - began).toBeLessThan(3000);
  });

  it("여러 번·동시에 닫아도 안전하다", async () => {
    const receiver = await start();
    await Promise.all([receiver.close(), receiver.close(), receiver.close()]);
    await receiver.close();
    expect(receiver.observe().state).toBe("CLOSED");
  });

  it("관측은 닫은 뒤에도 읽을 수 있고 값이 변하지 않는다", async () => {
    const receiver = await start();
    await sendLoopbackRequest(receiver.url);
    await receiver.close();
    const a = receiver.observe();
    await sleep(50);
    expect(receiver.observe()).toEqual(a);
  });
});

/** 서버를 흉내 내는 시험용 객체. 어댑터가 쓰는 부분만 갖췄다. */
class FakeServer extends EventEmitter {
  listening = false;
  closed = false;
  constructor(
    private readonly mode: "listen-error" | "non-loopback" | "ok",
    private readonly address_: { address: string; port: number } | null = null
  ) {
    super();
  }
  listen(_options: unknown, callback: () => void): this {
    queueMicrotask(() => {
      if (this.mode === "listen-error") {
        this.emit("error", new Error("EADDRINUSE"));
        return;
      }
      this.listening = true;
      callback();
    });
    return this;
  }
  address(): { address: string; family: string; port: number } | null {
    if (this.mode === "listen-error") return null;
    return this.address_ === null ? null : { ...this.address_, family: "IPv4" };
  }
  close(callback?: () => void): this {
    this.closed = true;
    this.listening = false;
    queueMicrotask(() => {
      this.emit("close");
      callback?.();
    });
    return this;
  }
  closeAllConnections(): void {}
}

const withFake = (server: FakeServer) => ({ createServer: (() => server) as never });

describe("시작 실패와 관측 실패는 0건이 아니다", () => {
  it("바인딩에 실패하면 FAILED(BIND_FAILED)이고 주소가 없으며 건수는 null이다", async () => {
    const receiver = await startMetricsReceiver(withFake(new FakeServer("listen-error")));
    expect(receiver.url).toBeNull();
    expect(receiver.observe()).toMatchObject({
      state: "FAILED",
      failure: "BIND_FAILED",
      hits: null,
    });
    await expect(receiver.close()).resolves.toBeUndefined();
  });

  it("서버를 만들다 던져도 같은 결과다", async () => {
    const receiver = await startMetricsReceiver({
      createServer: (() => {
        throw new Error("boom");
      }) as never,
    });
    expect(receiver.url).toBeNull();
    expect(receiver.observe()).toMatchObject({
      state: "FAILED",
      failure: "BIND_FAILED",
      hits: null,
    });
  });

  it("열린 주소가 127.0.0.1이 아니면 FAILED(NOT_LOOPBACK)이고 서버를 닫는다", async () => {
    for (const address of ["0.0.0.0", "::", "192.0.2.10", "localhost"]) {
      const server = new FakeServer("non-loopback", { address, port: 4321 });
      const receiver = await startMetricsReceiver(withFake(server));
      expect(receiver.url, address).toBeNull();
      expect(receiver.observe(), address).toMatchObject({
        state: "FAILED",
        failure: "NOT_LOOPBACK",
        hits: null,
      });
      expect(server.closed, address).toBe(true);
    }
  });

  it("포트가 0이면 열린 것으로 보지 않는다", async () => {
    const server = new FakeServer("non-loopback", { address: "127.0.0.1", port: 0 });
    const receiver = await startMetricsReceiver(withFake(server));
    expect(receiver.url).toBeNull();
    expect(receiver.observe()).toMatchObject({ state: "FAILED", hits: null });
  });

  it("열린 뒤 서버 오류가 나면 이미 센 숫자가 있어도 null이다(SERVER_ERROR)", async () => {
    const server = new FakeServer("ok", { address: "127.0.0.1", port: 5555 });
    const receiver = await startMetricsReceiver(withFake(server));
    expect(receiver.url).toBe("http://127.0.0.1:5555");
    server.emit("connection", { destroy() {}, on() {} });
    expect(receiver.observe()).toMatchObject({ state: "LISTENING", hits: 1 });
    server.emit("error", new Error("EIO"));
    expect(receiver.observe()).toMatchObject({
      state: "FAILED",
      failure: "SERVER_ERROR",
      hits: null,
    });
    await receiver.close();
  });

  it("닫기 전에 서버가 닫혀 버리면 null이다(CLOSED_EARLY)", async () => {
    const server = new FakeServer("ok", { address: "127.0.0.1", port: 5556 });
    const receiver = await startMetricsReceiver(withFake(server));
    server.emit("close");
    expect(receiver.observe()).toMatchObject({
      state: "FAILED",
      failure: "CLOSED_EARLY",
      hits: null,
    });
  });

  it("서버가 닫히지 않으면 close()는 제한 시간 뒤 CLOSE_TIMEOUT으로 거부한다(호출자가 영원히 기다리지 않는다)", async () => {
    class HangingServer extends FakeServer {
      override close(): this {
        this.closed = true; // 닫으라는 요청은 받았지만 콜백이 영영 오지 않는다
        return this;
      }
    }
    const server = new HangingServer("ok", { address: "127.0.0.1", port: 5557 });
    const receiver = await startMetricsReceiver({ ...withFake(server), closeTimeoutMs: 40 });
    await expect(receiver.close()).rejects.toThrow("CLOSE_TIMEOUT");
    expect(server.closed).toBe(true);
    // 닫기를 시도한 뒤에도 닫기 전까지의 관측은 읽을 수 있다.
    expect(receiver.observe().state).toBe("CLOSED");
  });

  it("failedMetricsReceiver: 주소 없음, 관측 null, 닫을 것 없음", async () => {
    const receiver = failedMetricsReceiver("BIND_FAILED");
    expect(receiver.url).toBeNull();
    expect(receiver.observe()).toMatchObject({ state: "FAILED", hits: null, connections: 0 });
    await expect(receiver.close()).resolves.toBeUndefined();
  });
});
