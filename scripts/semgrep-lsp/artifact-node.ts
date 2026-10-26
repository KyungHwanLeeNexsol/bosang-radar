// 휠 아티팩트 해시의 실제 어댑터(ArtifactHashPort). 호출자가 명시한 파일 하나를 읽기 전용으로 열어 실제 바이트로 SHA-256을 계산한다.
//
// 공개 API:
//   createNodeArtifactHasher(): ArtifactHashPort
//
// 동작:
//  · 파일 전체를 메모리에 올리지 않는다: 1 MiB 단위로 읽어 해시에 넣는다(휠은 수십 MB일 수 있다).
//  · 일반 파일이 아니면(디렉터리 등) NOT_A_FILE, 없으면 NOT_FOUND, 크기가 maxBytes를 넘으면 읽기 전에 TOO_LARGE(읽는 도중 넘어도
//    TOO_LARGE), 취소되면 CANCELLED, 그 밖의 읽기 오류는 READ_FAILED다. 오류 원문(경로·시스템 메시지)은 토큰 밖으로 새지 않는다.
//  · 읽은 바이트 수가 처음 확인한 크기와 다르거나 읽은 뒤 크기·수정 시각이 달라졌으면 FILE_CHANGED_DURING_READ다(부분 결과를
//    돌려주지 않는다). 이 확인은 최선의 노력이다 — 크기와 수정 시각을 그대로 둔 채 바이트만 바꾸는 쓰기는 잡지 못한다.
//  · 심볼릭 링크는 따라간다: 해시는 링크 대상 파일의 바이트에 대한 것이다.
//  · 파일을 만들거나 바꾸거나 지우지 않는다. 네트워크·프로세스를 쓰지 않는다.

import { createHash } from "node:crypto";
import { open as nodeOpen, type FileHandle } from "node:fs/promises";
import { ArtifactHashError, type ArtifactHashPort } from "./tool-observation";

const CHUNK_BYTES = 1024 * 1024;

/** 시험 주입점: 파일을 여는 함수. 생략하면 실제 파일을 읽기 전용으로 연다(운영은 항상 생략한다). */
export type OpenForRead = (path: string, flags: "r") => Promise<FileHandle>;

function errnoOf(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

export function createNodeArtifactHasher(deps: { open?: OpenForRead } = {}): ArtifactHashPort {
  const open: OpenForRead = deps.open ?? nodeOpen;
  return {
    async hashFile(path, options) {
      if (typeof path !== "string" || path.length === 0 || path.includes("\0")) {
        throw new ArtifactHashError("READ_FAILED", "경로가 올바르지 않다");
      }
      if (options.signal?.aborted) throw new ArtifactHashError("CANCELLED", "취소됐다");

      let handle: FileHandle;
      try {
        handle = await open(path, "r");
      } catch (error) {
        const code = errnoOf(error);
        if (code === "ENOENT" || code === "ENOTDIR")
          throw new ArtifactHashError("NOT_FOUND", "파일이 없다");
        if (code === "EISDIR") throw new ArtifactHashError("NOT_A_FILE", "일반 파일이 아니다");
        throw new ArtifactHashError("READ_FAILED", "파일을 열지 못했다");
      }

      try {
        const before = await handle.stat();
        if (!before.isFile()) throw new ArtifactHashError("NOT_A_FILE", "일반 파일이 아니다");
        if (before.size > options.maxBytes) {
          throw new ArtifactHashError("TOO_LARGE", "크기 제한을 넘는다");
        }

        const hash = createHash("sha256");
        const buffer = Buffer.allocUnsafe(Math.max(1, Math.min(CHUNK_BYTES, before.size + 1)));
        let total = 0;
        for (;;) {
          if (options.signal?.aborted) throw new ArtifactHashError("CANCELLED", "취소됐다");
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
          if (bytesRead === 0) break;
          total += bytesRead;
          if (total > options.maxBytes)
            throw new ArtifactHashError("TOO_LARGE", "크기 제한을 넘는다");
          hash.update(buffer.subarray(0, bytesRead));
        }

        const after = await handle.stat();
        if (
          total !== before.size ||
          after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs
        ) {
          throw new ArtifactHashError("FILE_CHANGED_DURING_READ", "읽는 도중 파일이 바뀌었다");
        }
        return { sha256: hash.digest("hex"), sizeBytes: total };
      } catch (error) {
        if (error instanceof ArtifactHashError) throw error;
        throw new ArtifactHashError("READ_FAILED", "파일을 읽지 못했다");
      } finally {
        await handle.close().catch(() => {});
      }
    },
  };
}
