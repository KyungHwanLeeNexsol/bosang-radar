// 루프백 메트릭 수신기(ADR C9·D9). 하네스가 연 수신기에서 관찰한 요청 수를 세는 어댑터이며, 이 디렉터리에서 네트워크 모듈을
// 가져오는 유일한 운영 소스다(구조 시험이 이 파일의 바인딩 규칙을 지킨다).
//
// 규칙:
//  · 바인딩은 `127.0.0.1`과 OS가 정한 포트(0)뿐이다. 호스트 이름·모든 인터페이스(0.0.0.0·::)·고정 포트를 쓰지 않는다.
//    열린 주소가 실제로 127.0.0.1이 아니면 닫고 실패로 돌려준다.
//  · 수신기는 요청 본문·헤더·URL·토큰을 읽지도 저장하지도 않는다. 세는 것은 연결 수·요청 수·잘못된 요청 수뿐이고, 응답은
//    내용 없는 204와 연결 닫기다. 요청 본문은 버린다.
//  · 건수 = max(수락한 연결 수, 요청 수 + 잘못된 요청 수). 연결만 하고 아무것도 보내지 않은 접속도 센다(보수적). 한 연결의 여러
//    요청은 요청 수로 센다.
//  · 관측하지 못하면 0건이 아니라 null이다: 열지 못함(BIND_FAILED)·루프백이 아님(NOT_LOOPBACK)·열린 뒤의 서버 오류
//    (SERVER_ERROR)·닫기 전에 서버가 닫힘(CLOSED_EARLY). 이 상태에서 센 숫자는 신뢰하지 않는다.
//  · observe()는 호출한 시점까지의 누적 관측이다. 닫은 뒤에도 읽을 수 있고, 정상적으로 닫기 전까지의 관측은 유효하다.
//  · close()는 여러 번 불러도 된다. 새 연결을 받지 않고, 열려 있는 소켓을 모두 끊고, 서버가 닫힐 때까지 기다린다.
//
// 이 수치는 "이 수신기에서 관찰한 요청"이다. 다른 목적지로의 통신이 없었다는 증거가 아니며, 실제 Semgrep이 메트릭·버전 확인·앱
// URL 환경변수를 읽는지는 확인하지 않았다(미확인).

import { createServer } from "node:http";
import type { MetricsObserver, MetricsReceiverSummary } from "./types";

const HOST = "127.0.0.1";

export interface MetricsReceiver extends MetricsObserver {
  /** 자식 환경에 넣을 주소(`http://127.0.0.1:<포트>`). 열지 못했으면 null. */
  readonly url: string | null;
  /** 수신기를 닫고 열린 소켓을 정리한다. 여러 번 불러도 된다. */
  close(): Promise<void>;
}

export interface StartMetricsOptions {
  /** 시험용: 서버 생성 함수를 바꿔 열기 실패 등을 재현한다. 기본은 node:http의 createServer. */
  createServer?: typeof createServer;
  /** close()가 이 시간(ms) 안에 끝나지 않으면 CLOSE_TIMEOUT으로 거부한다(기본 5000). 뒤따르는 잠금 해제를 막지 않으려는 한도다. */
  closeTimeoutMs?: number;
}

/** 열지 못한 수신기. 관측은 null(관측 실패)이고 닫을 것이 없다. */
export function failedMetricsReceiver(failure: string): MetricsReceiver {
  return {
    url: null,
    observe: () => ({
      bind: HOST,
      state: "FAILED",
      failure,
      hits: null,
      connections: 0,
      requests: 0,
      client_errors: 0,
    }),
    close: async () => undefined,
  };
}

// @MX:WARN: [AUTO] 네트워크 수신기를 여는 유일한 곳 — 127.0.0.1과 OS 할당 포트에만 바인딩한다.
// @MX:REASON: 호스트·인터페이스가 넓어지면 외부에서 접속할 수 있는 수신기가 된다(구조 시험이 바인딩 규칙을 지킨다).
export async function startMetricsReceiver(
  options: StartMetricsOptions = {}
): Promise<MetricsReceiver> {
  const make = options.createServer ?? createServer;
  const counters = { connections: 0, requests: 0, clientErrors: 0 };
  let state: MetricsReceiverSummary["state"] = "FAILED";
  let failure: string | null = "BIND_FAILED";
  let url: string | null = null;
  let closing = false;
  const sockets = new Set<{ destroy(): void }>();

  let server: ReturnType<typeof createServer>;
  try {
    server = make((request, response) => {
      counters.requests += 1;
      request.resume(); // 본문은 읽지 않고 버린다
      response.writeHead(204, { connection: "close" });
      response.end();
    });
  } catch {
    return failedMetricsReceiver("BIND_FAILED");
  }

  server.on("connection", (socket) => {
    counters.connections += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("clientError", (_error, socket) => {
    counters.clientErrors += 1;
    socket.destroy();
  });
  server.on("close", () => {
    if (!closing && state === "LISTENING") {
      state = "FAILED";
      failure = "CLOSED_EARLY";
    }
  });

  let settled = false;
  let listening: boolean;
  try {
    listening = await new Promise<boolean>((done) => {
      server.on("error", () => {
        if (!settled) {
          settled = true;
          done(false);
        } else if (state === "LISTENING") {
          state = "FAILED";
          failure = "SERVER_ERROR";
        }
      });
      server.listen({ host: HOST, port: 0 }, () => {
        settled = true;
        done(true);
      });
    });
  } catch {
    listening = false;
  }

  let closePromise: Promise<void> | null = null;
  const destroySockets = (): void => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
  };
  const close = (): Promise<void> => {
    if (closePromise !== null) return closePromise;
    closing = true;
    if (state === "LISTENING") state = "CLOSED";
    closePromise = new Promise<void>((done, fail) => {
      // 서버가 닫히지 않아도 호출자(CLI)가 영원히 기다리지 않게 한다. 닫지 못했다는 사실은 거부로 알린다.
      const timer = setTimeout(
        () => fail(new Error("CLOSE_TIMEOUT")),
        options.closeTimeoutMs ?? 5000
      );
      const finish = (): void => {
        clearTimeout(timer);
        done();
      };
      try {
        if (!server.listening) {
          destroySockets();
          finish();
          return;
        }
        server.close(() => finish());
        destroySockets();
        server.closeAllConnections?.();
      } catch {
        destroySockets();
        finish();
      }
    });
    return closePromise;
  };

  if (!listening) {
    await close();
    return failedMetricsReceiver("BIND_FAILED");
  }
  const address = server.address();
  if (
    address === null ||
    typeof address === "string" ||
    address.address !== HOST ||
    address.port <= 0
  ) {
    await close();
    return failedMetricsReceiver("NOT_LOOPBACK");
  }
  url = `http://${HOST}:${address.port}`;
  state = "LISTENING";
  failure = null;

  return {
    url,
    observe: () => ({
      bind: HOST,
      state,
      failure,
      // 관측이 깨졌으면 센 숫자를 믿지 않는다(0건으로 보지 않고 null).
      hits:
        state === "FAILED"
          ? null
          : Math.max(counters.connections, counters.requests + counters.clientErrors),
      connections: counters.connections,
      requests: counters.requests,
      client_errors: counters.clientErrors,
    }),
    close,
  };
}
