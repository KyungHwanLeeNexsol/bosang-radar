// 시험 전용: 메모리 위의 ArtifactHashPort. 실제 파일을 읽지 않는다. 해시는 sha.ts(순수 구현)로 계산한다 — 시험이 "독립적인 계산값"과
// 비교할 때는 node:crypto를 시험 쪽에서 직접 써서 이 구현과 겹치지 않게 한다.

import { sha256Hex } from "../sha";
import {
  ArtifactHashError,
  type ArtifactHashFailureReason,
  type ArtifactHashPort,
} from "../tool-observation";

const encoder = new TextEncoder();

export class MemoryArtifactHasher implements ArtifactHashPort {
  /** hashFile 호출 기록(받은 경로). 호출하지 않았음을 확인하는 데 쓴다. */
  readonly calls: string[] = [];
  private readonly files = new Map<string, Uint8Array>();
  private readonly failures = new Map<string, ArtifactHashFailureReason>();
  /** 설정하면 다음 호출이 이 값을 그대로 돌려준다(어댑터가 형식이 틀린 값을 주는 경우를 흉내 낸다). */
  forcedResult: { sha256: unknown; sizeBytes: unknown } | null = null;

  constructor(initial: Record<string, string | Uint8Array> = {}) {
    for (const [path, data] of Object.entries(initial)) this.set(path, data);
  }

  set(path: string, data: string | Uint8Array): void {
    this.files.set(path, typeof data === "string" ? encoder.encode(data) : data.slice());
  }

  /** 이 경로는 reason으로 실패한다. */
  failWith(path: string, reason: ArtifactHashFailureReason): void {
    this.failures.set(path, reason);
  }

  async hashFile(
    path: string,
    options: { maxBytes: number; signal?: AbortSignal }
  ): Promise<{ sha256: string; sizeBytes: number }> {
    this.calls.push(path);
    if (options.signal?.aborted) throw new ArtifactHashError("CANCELLED", "취소됐다");
    if (this.forcedResult !== null) {
      return this.forcedResult as unknown as { sha256: string; sizeBytes: number };
    }
    const reason = this.failures.get(path);
    if (reason !== undefined) throw new ArtifactHashError(reason, "시험이 정한 실패");
    const bytes = this.files.get(path);
    if (bytes === undefined) throw new ArtifactHashError("NOT_FOUND", "파일이 없다");
    if (bytes.byteLength > options.maxBytes) throw new ArtifactHashError("TOO_LARGE", "너무 크다");
    return { sha256: sha256Hex(bytes), sizeBytes: bytes.byteLength };
  }
}
