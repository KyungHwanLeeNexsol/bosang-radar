import { describe, expect, it } from "vitest";
import {
  IdGenerator,
  ResponseRouter,
  isNotification,
  isRequest,
  isResponse,
  makeNotification,
  makeRequest,
} from "./jsonrpc";
import type { JsonRpcMessage } from "./types";

describe("메시지 생성", () => {
  it("makeRequest: params가 있으면 포함한다", () => {
    expect(makeRequest(1, "initialize", { a: 1 })).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { a: 1 },
    });
  });

  it("makeRequest: params가 undefined면 키를 아예 두지 않는다", () => {
    const message = makeRequest("r-1", "shutdown");
    expect("params" in message).toBe(false);
    expect(JSON.stringify(message)).toBe('{"jsonrpc":"2.0","id":"r-1","method":"shutdown"}');
  });

  it("makeRequest: params가 null·0·빈 문자열이어도 유지한다", () => {
    expect(makeRequest(1, "m", null).params).toBeNull();
    expect(makeRequest(1, "m", 0).params).toBe(0);
    expect(makeRequest(1, "m", "").params).toBe("");
  });

  it("makeNotification: id가 없고 params는 있을 때만 포함한다", () => {
    const withParams = makeNotification("initialized", {});
    expect(withParams).toEqual({ jsonrpc: "2.0", method: "initialized", params: {} });
    const without = makeNotification("exit");
    expect("id" in without).toBe(false);
    expect("params" in without).toBe(false);
  });
});

describe("분류", () => {
  const request = makeRequest(1, "m");
  const notification = makeNotification("m");
  const response: JsonRpcMessage = { jsonrpc: "2.0", id: 1, result: {} };
  const errorResponse: JsonRpcMessage = {
    jsonrpc: "2.0",
    id: "a",
    error: { code: -32601, message: "no" },
  };

  it("isRequest", () => {
    expect(isRequest(request)).toBe(true);
    expect(isRequest(notification)).toBe(false);
    expect(isRequest(response)).toBe(false);
  });

  it("isNotification", () => {
    expect(isNotification(notification)).toBe(true);
    expect(isNotification(request)).toBe(false);
    expect(isNotification(response)).toBe(false);
  });

  it("isResponse: result 또는 error가 있고 method가 없고 id가 null이 아니다", () => {
    expect(isResponse(response)).toBe(true);
    expect(isResponse(errorResponse)).toBe(true);
    expect(isResponse(request)).toBe(false);
    expect(isResponse(notification)).toBe(false);
  });

  it("isResponse: id가 null이거나 없으면 응답이 아니다", () => {
    expect(isResponse({ jsonrpc: "2.0", id: null, result: 1 })).toBe(false);
    expect(isResponse({ jsonrpc: "2.0", result: 1 })).toBe(false);
  });

  it("isResponse: result도 error도 없으면 응답이 아니다", () => {
    expect(isResponse({ jsonrpc: "2.0", id: 1 })).toBe(false);
  });

  it("result가 null인 응답도 응답이다", () => {
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: null })).toBe(true);
  });
});

describe("IdGenerator", () => {
  it("접두어와 1부터 시작하는 순번을 붙인다", () => {
    const ids = new IdGenerator("run");
    expect([ids.next(), ids.next(), ids.next()]).toEqual(["run-1", "run-2", "run-3"]);
  });

  it("생성기마다 순번이 독립이다", () => {
    const a = new IdGenerator("a");
    const b = new IdGenerator("b");
    a.next();
    expect(b.next()).toBe("b-1");
  });
});

describe("ResponseRouter", () => {
  const reply = (id: string | number | null): JsonRpcMessage => ({ jsonrpc: "2.0", id, result: 1 });

  it("등록한 id의 첫 응답은 matched다", () => {
    const router = new ResponseRouter();
    router.register("x-1");
    const outcome = router.route(reply("x-1"));
    expect(outcome.kind).toBe("matched");
    expect(outcome.id).toBe("x-1");
    expect(outcome.message).toEqual(reply("x-1"));
  });

  it("같은 id의 두 번째 응답은 duplicate다", () => {
    const router = new ResponseRouter();
    router.register(1);
    router.route(reply(1));
    expect(router.route(reply(1)).kind).toBe("duplicate");
    expect(router.route(reply(1)).kind).toBe("duplicate");
  });

  it("등록한 적 없는 id는 unmatched다", () => {
    const router = new ResponseRouter();
    router.register(1);
    expect(router.route(reply(2)).kind).toBe("unmatched");
  });

  it("id가 null이거나 없는 메시지는 unmatched이고 id는 null이다", () => {
    const router = new ResponseRouter();
    router.register(1);
    const nullId = router.route(reply(null));
    expect(nullId).toMatchObject({ kind: "unmatched", id: null });
    const noId = router.route({ jsonrpc: "2.0", result: 1 });
    expect(noId).toMatchObject({ kind: "unmatched", id: null });
  });

  it('숫자 1과 문자열 "1"은 다른 id다', () => {
    const router = new ResponseRouter();
    router.register(1);
    expect(router.route(reply("1")).kind).toBe("unmatched");
    expect(router.route(reply(1)).kind).toBe("matched");
    router.register("2");
    expect(router.route(reply(2)).kind).toBe("unmatched");
    expect(router.route(reply("2")).kind).toBe("matched");
  });

  it("pending과 isPending은 응답을 받지 못한 id를 등록 순서로 보여 준다", () => {
    const router = new ResponseRouter();
    router.register("a");
    router.register("b");
    router.register(3);
    expect(router.pending()).toEqual(["a", "b", 3]);
    router.route(reply("b"));
    expect(router.pending()).toEqual(["a", 3]);
    expect(router.isPending("a")).toBe(true);
    expect(router.isPending("b")).toBe(false);
  });

  it("응답을 받은 뒤 같은 id를 다시 등록하면 다시 matched가 된다", () => {
    const router = new ResponseRouter();
    router.register(1);
    router.route(reply(1));
    router.register(1);
    expect(router.route(reply(1)).kind).toBe("matched");
  });
});
