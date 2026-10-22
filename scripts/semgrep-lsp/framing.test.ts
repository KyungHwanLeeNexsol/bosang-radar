import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_MESSAGE_BYTES,
  FrameDecoder,
  encodeFrame,
  type DecodeResult,
  type FrameDecodeError,
} from "./framing";
import type { JsonRpcMessage } from "./types";

const enc = new TextEncoder();
// 종결자가 없는 "garbage"는 아직 오지 않은 헤더 이름과 구별할 수 없다 — 줄바꿈까지 포함해 쓴다.
const GARBAGE = "garbage\r\n\r\n";

function bytes(text: string): Uint8Array {
  return enc.encode(text);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** 원하는 헤더 문자열과 본문 문자열로 프레임을 직접 만든다(잘못된 프레임 포함). */
function raw(header: string, body: string): Uint8Array {
  return concat(bytes(`${header}\r\n\r\n`), bytes(body));
}

function frameOf(body: string): Uint8Array {
  return raw(`Content-Length: ${bytes(body).byteLength}`, body);
}

const MSG_A: JsonRpcMessage = { jsonrpc: "2.0", id: 1, method: "initialize", params: { a: 1 } };
const MSG_B: JsonRpcMessage = {
  jsonrpc: "2.0",
  method: "textDocument/publishDiagnostics",
  params: { message: "한글 진단 메시지 😀 — 끝" },
};
const MSG_C: JsonRpcMessage = { jsonrpc: "2.0", id: "x-3", result: null };

function decodeAll(chunks: Uint8Array[], options?: { maxMessageBytes?: number }): DecodeResult {
  const decoder = new FrameDecoder(options);
  const messages: JsonRpcMessage[] = [];
  let error: FrameDecodeError | null = null;
  for (const chunk of chunks) {
    const result = decoder.push(chunk);
    messages.push(...result.messages);
    if (result.error) error = result.error;
  }
  const end = decoder.end();
  if (end.error && !error) error = end.error;
  return { messages, error };
}

function expectMalformed(chunk: Uint8Array, options?: { maxMessageBytes?: number }) {
  const decoder = new FrameDecoder(options);
  const result = decoder.push(chunk);
  expect(result.messages).toEqual([]);
  expect(result.error?.kind).toBe("MALFORMED");
  expect(decoder.failed).toBe(true);
  return result.error as FrameDecodeError;
}

describe("encodeFrame", () => {
  it("Content-Length는 문자 수가 아니라 UTF-8 바이트 수다", () => {
    const frame = encodeFrame(MSG_B);
    const text = new TextDecoder().decode(frame);
    const [header, body] = text.split("\r\n\r\n");
    const length = Number(/^Content-Length: (\d+)$/.exec(header)?.[1]);
    expect(length).toBe(bytes(body).byteLength);
    expect(length).toBeGreaterThan(body.length);
  });

  it("인코딩한 프레임을 디코딩하면 원본과 같다(한글·이모지 포함)", () => {
    const result = decodeAll([encodeFrame(MSG_A), encodeFrame(MSG_B), encodeFrame(MSG_C)]);
    expect(result.error).toBeNull();
    expect(result.messages).toEqual([MSG_A, MSG_B, MSG_C]);
  });
});

describe("FrameDecoder — 청크 분할", () => {
  const stream = concat(encodeFrame(MSG_A), encodeFrame(MSG_B), encodeFrame(MSG_C));

  it("한 청크에 메시지가 여러 개 들어 있어도 모두 돌려준다", () => {
    const result = new FrameDecoder().push(stream);
    expect(result.error).toBeNull();
    expect(result.messages).toEqual([MSG_A, MSG_B, MSG_C]);
  });

  it("모든 바이트 경계에서 둘로 나눠도 결과가 같다(멀티바이트 문자 중간 포함)", () => {
    for (let cut = 0; cut <= stream.byteLength; cut++) {
      const result = decodeAll([stream.slice(0, cut), stream.slice(cut)]);
      expect(result.error, `cut=${cut}`).toBeNull();
      expect(result.messages, `cut=${cut}`).toEqual([MSG_A, MSG_B, MSG_C]);
    }
  });

  it("한 바이트씩 넣어도 결과가 같다", () => {
    const chunks = Array.from(stream, (b) => new Uint8Array([b]));
    const result = decodeAll(chunks);
    expect(result.error).toBeNull();
    expect(result.messages).toEqual([MSG_A, MSG_B, MSG_C]);
  });

  it("push는 이번 호출로 완성된 메시지만 돌려준다", () => {
    const decoder = new FrameDecoder();
    const first = encodeFrame(MSG_A);
    const second = encodeFrame(MSG_B);
    expect(decoder.push(concat(first, second.slice(0, 5))).messages).toEqual([MSG_A]);
    expect(decoder.push(second.slice(5)).messages).toEqual([MSG_B]);
    expect(decoder.push(new Uint8Array(0)).messages).toEqual([]);
  });

  it("bytesSeen은 넣은 바이트 수의 합이다", () => {
    const decoder = new FrameDecoder();
    decoder.push(stream.slice(0, 10));
    decoder.push(stream.slice(10));
    expect(decoder.bytesSeen).toBe(stream.byteLength);
  });
});

describe("FrameDecoder — 헤더", () => {
  const body = JSON.stringify(MSG_A);

  it("헤더 이름은 대소문자를 구분하지 않는다", () => {
    for (const name of ["content-length", "CONTENT-LENGTH", "CoNtEnT-LeNgTh"]) {
      const result = new FrameDecoder().push(raw(`${name}: ${bytes(body).byteLength}`, body));
      expect(result.error).toBeNull();
      expect(result.messages).toEqual([MSG_A]);
    }
  });

  it("Content-Type과 모르는 헤더는 무시한다", () => {
    const header = `X-Extra: 1\r\nContent-Length: ${bytes(body).byteLength}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8`;
    const result = new FrameDecoder().push(raw(header, body));
    expect(result.error).toBeNull();
    expect(result.messages).toEqual([MSG_A]);
  });

  it("값 앞뒤 공백은 허용한다", () => {
    const result = new FrameDecoder().push(
      raw(`Content-Length:   ${bytes(body).byteLength}  `, body)
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual([MSG_A]);
  });

  it("Content-Length가 없으면 MALFORMED", () => {
    expectMalformed(raw("Content-Type: x", body));
  });

  it("Content-Length가 중복되면 MALFORMED", () => {
    const n = bytes(body).byteLength;
    expectMalformed(raw(`Content-Length: ${n}\r\ncontent-length: ${n}`, body));
  });

  it.each(["+5", "-1", "0x10", "1e3", "5 5", "", "abc", "1.5"])(
    "Content-Length 값 %j는 MALFORMED",
    (value) => {
      expectMalformed(raw(`Content-Length: ${value}`, body));
    }
  );

  it("Content-Length 0은 MALFORMED", () => {
    expectMalformed(raw("Content-Length: 0", ""));
  });

  it("maxMessageBytes를 넘으면 본문을 기다리지 않고 바로 MALFORMED", () => {
    const decoder = new FrameDecoder({ maxMessageBytes: 10 });
    const result = decoder.push(bytes("Content-Length: 11\r\n\r\n"));
    expect(result.error?.kind).toBe("MALFORMED");
  });

  it("maxMessageBytes와 같은 길이는 허용한다", () => {
    const small = '{"jsonrpc":"2.0","method":"m"}';
    const n = bytes(small).byteLength;
    const result = new FrameDecoder({ maxMessageBytes: n }).push(frameOf(small));
    expect(result.error).toBeNull();
    expect(result.messages).toHaveLength(1);
  });

  it("기본 한도는 64MiB이고 자릿수가 아주 많은 값도 거부한다", () => {
    expect(DEFAULT_MAX_MESSAGE_BYTES).toBe(64 * 1024 * 1024);
    expectMalformed(bytes(`Content-Length: ${DEFAULT_MAX_MESSAGE_BYTES + 1}\r\n\r\n`));
    expectMalformed(bytes(`Content-Length: ${"9".repeat(40)}\r\n\r\n`));
  });

  it("종결자 없이 헤더가 maxHeaderBytes를 넘으면 MALFORMED", () => {
    expectMalformed(bytes(`X-Long: ${"a".repeat(9000)}`));
    expectMalformed(bytes("a".repeat(9000)));
  });

  it("작은 maxHeaderBytes 옵션을 지킨다", () => {
    const decoder = new FrameDecoder({ maxHeaderBytes: 16 });
    const result = decoder.push(raw("Content-Length: 5", "12345"));
    expect(result.error?.kind).toBe("MALFORMED");
  });

  it("콜론 없는 헤더 줄은 MALFORMED", () => {
    expectMalformed(raw(`Content-Length: ${bytes(body).byteLength}\r\nBadLine`, body));
  });

  it("헤더 앞에 쓰레기 바이트가 있으면 MALFORMED", () => {
    expectMalformed(concat(bytes("garbage\r\n"), frameOf(body)));
    expectMalformed(bytes("\r\n"));
    expectMalformed(bytes("not a header at all"));
  });
});

describe("FrameDecoder — 본문", () => {
  it("유효하지 않은 UTF-8 본문은 MALFORMED", () => {
    const bad = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
    expectMalformed(concat(bytes("Content-Length: 4\r\n\r\n"), bad));
  });

  it("유효하지 않은 JSON은 MALFORMED", () => {
    expectMalformed(frameOf("{not json"));
  });

  it("최상위가 객체가 아니면 MALFORMED(배열·배치·스칼라·null)", () => {
    for (const body of ['[{"jsonrpc":"2.0","method":"m"}]', "[]", "42", '"s"', "null", "true"]) {
      expectMalformed(frameOf(body));
    }
  });

  it('jsonrpc가 "2.0"이 아니면 MALFORMED', () => {
    expectMalformed(frameOf('{"jsonrpc":"1.0","method":"m"}'));
    expectMalformed(frameOf('{"method":"m"}'));
    expectMalformed(frameOf('{"jsonrpc":2,"method":"m"}'));
  });

  it("method가 문자열이 아니면 MALFORMED", () => {
    expectMalformed(frameOf('{"jsonrpc":"2.0","method":5}'));
    expectMalformed(frameOf('{"jsonrpc":"2.0","method":null}'));
  });

  it("id가 string | number | null이 아니면 MALFORMED", () => {
    expectMalformed(frameOf('{"jsonrpc":"2.0","id":true,"result":1}'));
    expectMalformed(frameOf('{"jsonrpc":"2.0","id":{},"result":1}'));
    expectMalformed(frameOf('{"jsonrpc":"2.0","id":[1],"result":1}'));
  });

  it("id가 null이거나 숫자·문자열이면 허용한다", () => {
    for (const id of ["null", "0", '"a"', "7"]) {
      const result = new FrameDecoder().push(frameOf(`{"jsonrpc":"2.0","id":${id},"result":1}`));
      expect(result.error).toBeNull();
      expect(result.messages).toHaveLength(1);
    }
  });

  it("본문 앞의 BOM은 조용히 지워지지 않고 MALFORMED로 걸린다", () => {
    const body = concat(
      new Uint8Array([0xef, 0xbb, 0xbf]),
      bytes('{"jsonrpc":"2.0","method":"m"}')
    );
    expectMalformed(concat(bytes(`Content-Length: ${body.byteLength}\r\n\r\n`), body));
  });
});

describe("FrameDecoder — fail-closed", () => {
  it("오류 앞에서 완성된 메시지는 같은 청크에서 오류와 함께 돌려준다", () => {
    const decoder = new FrameDecoder();
    const result = decoder.push(concat(encodeFrame(MSG_A), encodeFrame(MSG_C), bytes(GARBAGE)));
    expect(result.messages).toEqual([MSG_A, MSG_C]);
    expect(result.error?.kind).toBe("MALFORMED");
    expect(result.error?.atByte).toBe(
      encodeFrame(MSG_A).byteLength + encodeFrame(MSG_C).byteLength
    );
  });

  it("atByte는 문제가 된 프레임이 시작하는 오프셋이다", () => {
    const decoder = new FrameDecoder();
    const first = encodeFrame(MSG_A);
    decoder.push(first);
    const result = decoder.push(frameOf("[]"));
    expect(result.error?.atByte).toBe(first.byteLength);
  });

  it("실패는 영구적이다 — 이후 push는 같은 오류를 돌려주고 재동기화하지 않는다", () => {
    const decoder = new FrameDecoder();
    const first = decoder.push(bytes(GARBAGE));
    expect(first.error).not.toBeNull();
    const valid = encodeFrame(MSG_A);
    const second = decoder.push(valid);
    expect(second.messages).toEqual([]);
    expect(second.error).toBe(first.error);
    expect(decoder.failed).toBe(true);
    expect(decoder.bytesSeen).toBe(GARBAGE.length + valid.byteLength);
    expect(decoder.end().error).toBe(first.error);
  });

  it("나쁜 프레임 뒤의 정상 프레임은 같은 청크 안에 있어도 전달되지 않는다", () => {
    const decoder = new FrameDecoder();
    const result = decoder.push(concat(frameOf("[]"), encodeFrame(MSG_A)));
    expect(result.messages).toEqual([]);
    expect(result.error?.kind).toBe("MALFORMED");
  });
});

describe("FrameDecoder — end()", () => {
  it("깨끗하게 끝나면 오류가 없다", () => {
    const decoder = new FrameDecoder();
    decoder.push(encodeFrame(MSG_A));
    expect(decoder.end()).toEqual({ messages: [], error: null });
    expect(decoder.failed).toBe(false);
  });

  it("아무것도 받지 않고 끝나도 오류가 없다", () => {
    expect(new FrameDecoder().end()).toEqual({ messages: [], error: null });
  });

  it("헤더 도중에 끝나면 TRUNCATED이고 atByte는 그 프레임의 시작이다", () => {
    const decoder = new FrameDecoder();
    const first = encodeFrame(MSG_A);
    decoder.push(concat(first, bytes("Content-Len")));
    const end = decoder.end();
    expect(end.error?.kind).toBe("TRUNCATED");
    expect(end.error?.atByte).toBe(first.byteLength);
    expect(decoder.end().error).toBe(end.error);
  });

  it("본문 도중에 끝나면 TRUNCATED이고 atByte는 그 프레임의 시작이다", () => {
    const decoder = new FrameDecoder();
    const first = encodeFrame(MSG_A);
    const second = encodeFrame(MSG_B);
    decoder.push(concat(first, second.slice(0, second.byteLength - 3)));
    const end = decoder.end();
    expect(end.error?.kind).toBe("TRUNCATED");
    expect(end.error?.atByte).toBe(first.byteLength);
  });

  it("헤더가 끝난 직후(본문 0바이트)에 끝나도 TRUNCATED", () => {
    const decoder = new FrameDecoder();
    decoder.push(bytes("Content-Length: 30\r\n\r\n"));
    const end = decoder.end();
    expect(end.error?.kind).toBe("TRUNCATED");
    expect(end.error?.atByte).toBe(0);
  });
});
