// JSON-RPC 2.0 메시지 생성·분류와 id 기반 응답 라우팅. 전송(프레이밍)은 framing.ts가 맡는다.

import type { JsonRpcId, JsonRpcMessage } from "./types";

export function makeRequest(id: JsonRpcId, method: string, params?: unknown): JsonRpcMessage {
  const message: JsonRpcMessage = { jsonrpc: "2.0", id, method };
  // params 키 자체를 빼야 한다 — undefined를 직렬화에 맡기면 호출자마다 결과가 달라질 수 있다.
  if (params !== undefined) message.params = params;
  return message;
}

export function makeNotification(method: string, params?: unknown): JsonRpcMessage {
  const message: JsonRpcMessage = { jsonrpc: "2.0", method };
  if (params !== undefined) message.params = params;
  return message;
}

function hasId(m: JsonRpcMessage): boolean {
  return m.id !== undefined && m.id !== null;
}

/** 요청 = method와 (null이 아닌) id가 모두 있다. */
export function isRequest(m: JsonRpcMessage): boolean {
  return m.method !== undefined && hasId(m);
}

/** 알림 = method는 있고 id는 없다. */
export function isNotification(m: JsonRpcMessage): boolean {
  return m.method !== undefined && m.id === undefined;
}

/** 응답 = id가 있고(null 아님) method가 없으며 result 또는 error가 있다. */
export function isResponse(m: JsonRpcMessage): boolean {
  return hasId(m) && m.method === undefined && (m.result !== undefined || m.error !== undefined);
}

/** "<접두>-1", "<접두>-2", ... 순서대로 id를 만든다. 접두어로 실행·용도를 구분한다. */
export class IdGenerator {
  private counter = 0;

  constructor(private readonly prefix: string) {}

  next(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}

export interface RouteOutcome {
  kind: "matched" | "unmatched" | "duplicate";
  id: JsonRpcId | null;
  message: JsonRpcMessage;
}

/**
 * 요청 id와 응답을 짝짓는다. id는 값의 엄격 동등으로 비교한다(1 !== "1").
 * 같은 id의 두 번째 응답은 duplicate, 등록한 적 없는 id(null 포함)는 unmatched다.
 */
export class ResponseRouter {
  private readonly open = new Set<JsonRpcId>();
  private readonly answered = new Set<JsonRpcId>();

  register(id: JsonRpcId): void {
    this.open.add(id);
    this.answered.delete(id);
  }

  route(message: JsonRpcMessage): RouteOutcome {
    const id = message.id ?? null;
    if (id === null) return { kind: "unmatched", id: null, message };
    if (this.open.delete(id)) {
      this.answered.add(id);
      return { kind: "matched", id, message };
    }
    if (this.answered.has(id)) return { kind: "duplicate", id, message };
    return { kind: "unmatched", id, message };
  }

  isPending(id: JsonRpcId): boolean {
    return this.open.has(id);
  }

  /** 아직 응답을 받지 못한 id 목록(등록 순서). */
  pending(): JsonRpcId[] {
    return [...this.open];
  }
}
