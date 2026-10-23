// 시험 전용: 루프백 수신기에 로컬 요청을 보내는 클라이언트. 네트워크 모듈(node:http·node:net)을 가져오는 시험 지원 파일은
// 이 파일 하나다(구조 시험이 지킨다). 모든 함수는 대상이 127.0.0.1이 아니면 접속하기 전에 던진다 — 밖으로 나가는 통신은 없다.

import { Agent, request } from "node:http";
import { connect } from "node:net";

function loopbackPort(url: string): number {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1") {
    throw new Error(`루프백(127.0.0.1)이 아닌 주소에는 접속하지 않는다: ${parsed.hostname}`);
  }
  return Number(parsed.port);
}

export interface LoopbackRequestOptions {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** 한 번 요청하고 응답 상태를 돌려준다. 접속이 거부되면 던진다. */
export function sendLoopbackRequest(
  url: string,
  options: LoopbackRequestOptions = {}
): Promise<{ status: number }> {
  const port = loopbackPort(url);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "POST",
        path: options.path ?? "/metrics",
        headers: options.headers ?? {},
        agent: false,
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve({ status: response.statusCode ?? 0 }));
        response.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

/** 한 연결(keep-alive)로 요청을 차례로 count번 보낸다. */
export async function sendKeepAliveRequests(url: string, count: number): Promise<number[]> {
  const port = loopbackPort(url);
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  const statuses: number[] = [];
  try {
    for (let i = 0; i < count; i += 1) {
      statuses.push(
        await new Promise<number>((resolve, reject) => {
          const req = request(
            { host: "127.0.0.1", port, method: "POST", path: "/metrics", agent },
            (response) => {
              response.resume();
              response.on("end", () => resolve(response.statusCode ?? 0));
            }
          );
          req.on("error", reject);
          req.end("x");
        })
      );
    }
  } finally {
    agent.destroy();
  }
  return statuses;
}

/**
 * 원시 소켓으로 접속해 delayMs 뒤에 payload를 보내고 상대가 닫을 때까지(또는 settleMs까지) 기다린다. 접속은 하지만 아무것도
 * 보내지 않으려면 payload를 null로 준다. 접속 거부 등 소켓 오류는 삼키고 연결에 성공했는지만 돌려준다.
 */
export function rawLoopback(
  url: string,
  payload: string | null,
  options: { delayMs?: number; settleMs?: number } = {}
): Promise<{ connected: boolean }> {
  const port = loopbackPort(url);
  return new Promise((resolve) => {
    let connected = false;
    const socket = connect({ host: "127.0.0.1", port });
    const finish = (): void => {
      socket.destroy();
      resolve({ connected });
    };
    const settle = setTimeout(finish, (options.delayMs ?? 0) + (options.settleMs ?? 300));
    socket.on("connect", () => {
      connected = true;
      if (payload !== null) {
        setTimeout(() => socket.write(payload), options.delayMs ?? 0);
      }
    });
    socket.on("error", () => undefined);
    socket.on("close", () => {
      clearTimeout(settle);
      finish();
    });
  });
}

/** 연결해 두고 닫지 않는 접속(열린 소켓 정리 시험용). close()로 우리 쪽에서 끊는다. */
export function holdLoopbackConnection(
  url: string
): Promise<{ connected: boolean; closed: Promise<void>; close(): void }> {
  const port = loopbackPort(url);
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const closed = new Promise<void>((done) => socket.on("close", () => done()));
    socket.on("error", () => undefined);
    socket.on("connect", () => resolve({ connected: true, closed, close: () => socket.destroy() }));
    socket.on("close", () => resolve({ connected: false, closed, close: () => undefined }));
  });
}

/** 이 주소로 지금 접속할 수 있는가(닫힌 수신기에 접속이 거부되는지 확인하는 용도). */
export async function canConnectLoopback(url: string): Promise<boolean> {
  const held = await holdLoopbackConnection(url);
  held.close();
  return held.connected;
}
