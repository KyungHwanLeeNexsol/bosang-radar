// Content-Length 기반 JSON-RPC 프레이밍. 디코더는 fail-closed다:
// 첫 위반에서 영구 실패 상태가 되고, 이후 바이트로 재동기화를 시도하지 않는다.
// 깨진 스트림에서 "그럴듯한" 메시지를 건져내면 진단이 조용히 섞여 들어오기 때문이다.

import type { FrameErrorKind, JsonRpcMessage } from "./types";

export const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_HEADER_BYTES = 8192;

export interface FrameDecodeError {
  kind: FrameErrorKind;
  detail: string;
  /** 문제가 된 프레임이 시작하는 바이트 오프셋(스트림 처음부터). */
  atByte: number;
}

export interface DecodeResult {
  messages: JsonRpcMessage[];
  error: FrameDecodeError | null;
}

export interface FrameDecoderOptions {
  maxMessageBytes?: number;
  maxHeaderBytes?: number;
}

const encoder = new TextEncoder();

/** 헤더의 Content-Length는 본문의 문자 수가 아니라 UTF-8 바이트 수다(한글·이모지 주의). */
export function encodeFrame(message: JsonRpcMessage): Uint8Array {
  const body = encoder.encode(JSON.stringify(message));
  const header = encoder.encode(`Content-Length: ${body.byteLength}\r\n\r\n`);
  const out = new Uint8Array(header.byteLength + body.byteLength);
  out.set(header, 0);
  out.set(body, header.byteLength);
  return out;
}

const CR = 0x0d;
const LF = 0x0a;
const COLON = 0x3a;
const NAME_CHARS = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function isNameByte(b: number): boolean {
  return (
    (b >= 0x30 && b <= 0x39) ||
    (b >= 0x41 && b <= 0x5a) ||
    (b >= 0x61 && b <= 0x7a) ||
    "!#$%&'*+-.^_`|~".includes(String.fromCharCode(b))
  );
}

function indexOfHeaderEnd(buf: Uint8Array): number {
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === CR && buf[i + 1] === LF && buf[i + 2] === CR && buf[i + 3] === LF) return i;
  }
  return -1;
}

class Malformed extends Error {
  constructor(message: string) {
    super(message);
  }
}

function parseBody(bytes: Uint8Array): JsonRpcMessage {
  let text: string;
  try {
    // ignoreBOM: BOM을 몰래 지우면 깨진 본문이 통과한다 — 그대로 두어 JSON 파싱에서 걸리게 한다.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Malformed("본문이 유효한 UTF-8이 아니다");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Malformed("본문이 유효한 JSON이 아니다");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Malformed("최상위 값이 일반 객체가 아니다(배열·배치·스칼라·null 거부)");
  }
  const obj = value as Record<string, unknown>;
  if (obj.jsonrpc !== "2.0") throw new Malformed('jsonrpc 필드가 "2.0"이 아니다');
  if ("method" in obj && typeof obj.method !== "string") {
    throw new Malformed("method가 문자열이 아니다");
  }
  if ("id" in obj) {
    const id = obj.id;
    if (!(typeof id === "string" || typeof id === "number" || id === null)) {
      throw new Malformed("id가 string | number | null이 아니다");
    }
  }
  return obj as unknown as JsonRpcMessage;
}

interface PendingBody {
  headerLen: number;
  bodyLen: number;
}

// @MX:ANCHOR: [AUTO] 자식 프로세스 stdout의 모든 바이트가 지나가는 단일 관문
// @MX:REASON: fail-closed 규칙(첫 위반 후 영구 실패, 재동기화 금지)이 깨지면 판정이 오염된
// 스트림의 일부를 정상 증거로 받아들인다. StreamCollector·시험이 이 계약에 기댄다.
export class FrameDecoder {
  private readonly maxMessageBytes: number;
  private readonly maxHeaderBytes: number;
  private buf: Uint8Array = new Uint8Array(0);
  /** buf[0]이 가리키는 스트림 오프셋 = 현재 프레임의 시작 위치. */
  private bufStart = 0;
  private pending: PendingBody | null = null;
  private seen = 0;
  private sticky: FrameDecodeError | null = null;

  constructor(options: FrameDecoderOptions = {}) {
    this.maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
    this.maxHeaderBytes = options.maxHeaderBytes ?? DEFAULT_MAX_HEADER_BYTES;
  }

  get failed(): boolean {
    return this.sticky !== null;
  }

  get bytesSeen(): number {
    return this.seen;
  }

  /** 이번 호출로 완성된 메시지만 돌려준다. 오류가 나면 그 앞에서 완성된 메시지도 함께 돌려준다. */
  push(chunk: Uint8Array): DecodeResult {
    this.seen += chunk.byteLength;
    if (this.sticky) return { messages: [], error: this.sticky };

    const joined = new Uint8Array(this.buf.byteLength + chunk.byteLength);
    joined.set(this.buf, 0);
    joined.set(chunk, this.buf.byteLength);
    this.buf = joined;

    const messages: JsonRpcMessage[] = [];
    try {
      for (;;) {
        const message = this.tryExtract();
        if (message === null) break;
        messages.push(message);
      }
    } catch (e) {
      if (!(e instanceof Malformed)) throw e;
      return { messages, error: this.fail("MALFORMED", e.message) };
    }
    return { messages, error: null };
  }

  /** EOF 선언. 처리 중인 프레임이 남아 있으면 TRUNCATED다. */
  end(): DecodeResult {
    if (this.sticky) return { messages: [], error: this.sticky };
    if (this.buf.byteLength > 0) {
      const where = this.pending ? "본문" : "헤더";
      return {
        messages: [],
        error: this.fail("TRUNCATED", `${where} 도중에 스트림이 끝났다`),
      };
    }
    return { messages: [], error: null };
  }

  private fail(kind: FrameErrorKind, detail: string): FrameDecodeError {
    this.sticky = { kind, detail, atByte: this.bufStart };
    this.buf = new Uint8Array(0);
    this.pending = null;
    return this.sticky;
  }

  /** 프레임 하나를 꺼낸다. 아직 덜 왔으면 null. 위반이면 Malformed를 던진다. */
  private tryExtract(): JsonRpcMessage | null {
    if (this.buf.byteLength === 0) return null;
    if (!this.pending) {
      const headerEnd = indexOfHeaderEnd(this.buf);
      if (headerEnd < 0) {
        this.checkFirstLine();
        if (this.buf.byteLength > this.maxHeaderBytes + 3) {
          throw new Malformed(`헤더가 ${this.maxHeaderBytes}바이트를 넘도록 끝나지 않았다`);
        }
        return null;
      }
      if (headerEnd > this.maxHeaderBytes) {
        throw new Malformed(`헤더가 ${this.maxHeaderBytes}바이트를 넘는다`);
      }
      const bodyLen = this.parseHeader(this.buf.subarray(0, headerEnd));
      this.pending = { headerLen: headerEnd + 4, bodyLen };
    }
    const { headerLen, bodyLen } = this.pending;
    const total = headerLen + bodyLen;
    if (this.buf.byteLength < total) return null;

    const message = parseBody(this.buf.subarray(headerLen, total));
    this.buf = this.buf.slice(total);
    this.bufStart += total;
    this.pending = null;
    return message;
  }

  /** 종결자를 기다리는 동안에도 첫 줄이 헤더 모양이 아니면 바로 거부한다(쓰레기 접두). */
  private checkFirstLine(): void {
    for (let i = 0; i < this.buf.byteLength; i++) {
      const b = this.buf[i];
      if (b === COLON) return;
      if (!isNameByte(b)) {
        throw new Malformed("헤더가 시작되어야 할 위치에 헤더가 아닌 바이트가 있다");
      }
    }
  }

  private parseHeader(block: Uint8Array): number {
    const text = new TextDecoder("latin1").decode(block);
    let lengthValue: string | null = null;
    for (const line of text.split("\r\n")) {
      const colon = line.indexOf(":");
      if (colon < 0) throw new Malformed("콜론이 없는 헤더 줄이다");
      const name = line.slice(0, colon);
      if (!NAME_CHARS.test(name)) throw new Malformed("헤더 이름이 올바르지 않다");
      if (name.toLowerCase() === "content-length") {
        if (lengthValue !== null) throw new Malformed("Content-Length가 두 번 이상 나왔다");
        lengthValue = line.slice(colon + 1).replace(/^[ \t]+|[ \t]+$/g, "");
      }
    }
    if (lengthValue === null) throw new Malformed("Content-Length가 없다");
    if (!/^\d+$/.test(lengthValue))
      throw new Malformed("Content-Length가 숫자만으로 이루어지지 않았다");
    // 자릿수가 너무 많으면 Number 정밀도 문제가 생기므로 한도 초과로 같이 거부한다.
    const length = lengthValue.length > 15 ? Number.POSITIVE_INFINITY : Number(lengthValue);
    if (length === 0) throw new Malformed("Content-Length가 0이다");
    if (length > this.maxMessageBytes) {
      throw new Malformed(`Content-Length가 한도(${this.maxMessageBytes}바이트)를 넘는다`);
    }
    return length;
  }
}
