// 해시 보조 함수. 문자열은 항상 UTF-8 바이트로 해시한다(플랫폼 인코딩에 기대지 않는다).

import { createHash } from "node:crypto";

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(toBytes(data)).digest("hex");
}

export function sha1Hex(data: Uint8Array | string): string {
  return createHash("sha1").update(toBytes(data)).digest("hex");
}

/** git blob 객체 ID: sha1("blob <바이트 길이>\0" + 내용). 길이는 문자 수가 아니라 바이트 수다. */
export function gitBlobSha1(content: Uint8Array): string {
  const hash = createHash("sha1");
  hash.update(`blob ${content.byteLength}\0`);
  hash.update(content);
  return hash.digest("hex");
}

/** 각 줄 뒤에 "\n"을 붙여 이어 붙인 바이트의 sha256. 빈 목록은 빈 입력의 해시다. */
export function lineListSha256(lines: readonly string[]): string {
  const hash = createHash("sha256");
  for (const line of lines) hash.update(`${line}\n`);
  return hash.digest("hex");
}
