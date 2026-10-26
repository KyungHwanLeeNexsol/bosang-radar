// 휠 아티팩트 해시의 실제 어댑터(ArtifactHashPort). 호출자가 명시한 파일 하나를 읽기 전용으로 열어 실제 바이트로 SHA-256을 계산한다.
//
// 공개 API:
//   createNodeArtifactHasher(): ArtifactHashPort
//
// 동작:
//  · 파일 전체를 메모리에 올리지 않는다: 1 MiB 단위로 읽어 해시에 넣는다(휠은 수십 MB일 수 있다).
//  · 열기 자체가 대기하지 않는다. POSIX에서 FIFO를 읽기로 열면 쓰기 쪽이 열릴 때까지 open(2)가 운영체제 안에서 대기하는데, 그 대기는
//    libuv 스레드풀에서 일어나 AbortSignal로 끊을 수 없다(바깥 Promise만 끊으면 열기 작업과 핸들이 남는다). 그래서 대기를 끊지 않고
//    생기지 않게 한다: 읽기 전용 + O_NONBLOCK(+ 터미널 장치가 제어 터미널이 되지 않게 O_NOCTTY)으로 연다 — FIFO도 쓰기 쪽이 없는 채로
//    곧바로 열리고, 열린 핸들의 fstat이 일반 파일이 아님을 알려 NOT_A_FILE로 거절한다(읽지도 해시하지도 않는다). 심볼릭 링크는 따라가므로
//    FIFO를 가리키는 링크도 같다. 일반 파일에는 O_NONBLOCK이 아무 영향이 없다. Windows에는 FIFO가 없어 플래그는 예전과 같은 O_RDONLY다.
//    O_NONBLOCK을 쓸 수 없는 POSIX 플랫폼에서는 막힐 수 있는 열기로 되돌아가지 않고 열기 전에 READ_FAILED로 거절한다.
//  · 일반 파일이 아니면(디렉터리·FIFO·장치 등) NOT_A_FILE, 없으면 NOT_FOUND, 크기가 maxBytes를 넘으면 읽기 전에 TOO_LARGE(읽는 도중 넘어도
//    TOO_LARGE), 취소되면 CANCELLED, 그 밖의 읽기 오류는 READ_FAILED다. 오류 원문(경로·시스템 메시지)은 토큰 밖으로 새지 않는다.
//  · 읽은 바이트 수가 처음 확인한 크기와 다르거나 읽은 뒤 크기·수정 시각이 달라졌으면 FILE_CHANGED_DURING_READ다(부분 결과를
//    돌려주지 않는다). 이 확인은 최선의 노력이다 — 크기와 수정 시각을 그대로 둔 채 바이트만 바꾸는 쓰기는 잡지 못한다.
//  · 심볼릭 링크는 따라간다: 해시는 링크 대상 파일의 바이트에 대한 것이다.
//  · 파일을 만들거나 바꾸거나 지우지 않는다. 네트워크·프로세스를 쓰지 않는다.

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open as nodeOpen, type FileHandle } from "node:fs/promises";
import { ArtifactHashError, type ArtifactHashPort } from "./tool-observation";

const CHUNK_BYTES = 1024 * 1024;

/** 시험 주입점: 파일을 여는 함수. flags는 open(2) 플래그의 비트 조합이다. 생략하면 실제 파일을 연다(운영은 항상 생략한다). */
export type OpenForRead = (path: string, flags: number) => Promise<FileHandle>;

/** readOnlyOpenFlags가 읽는 open(2) 플래그 상수. node:fs의 constants가 그대로 들어맞는다(Windows에는 O_NONBLOCK·O_NOCTTY가 없다). */
export interface OpenConstants {
  O_RDONLY: number;
  O_NONBLOCK?: number;
  O_NOCTTY?: number;
}

/**
 * 읽기 전용 열기 플래그. 열기가 대기하지 않게 하는 것이 목적이다(위 '동작' 두 번째 항목).
 *  · win32: O_RDONLY 하나 — 예전 `"r"`과 같은 값이라 Windows의 동작은 그대로다.
 *  · 그 밖: O_RDONLY | O_NONBLOCK | O_NOCTTY(O_NOCTTY가 없는 플랫폼은 생략). 쓰기 계열 비트는 절대 넣지 않는다.
 *  · O_NONBLOCK이 없는 비-Windows 플랫폼: null — 호출자는 열지 말고 거절해야 한다.
 */
export function readOnlyOpenFlags(constants: OpenConstants, platform: string): number | null {
  if (platform === "win32") return constants.O_RDONLY;
  if (constants.O_NONBLOCK === undefined) return null;
  return constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOCTTY ?? 0);
}

function errnoOf(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

export function createNodeArtifactHasher(
  deps: { open?: OpenForRead; openFlags?: number | null } = {}
): ArtifactHashPort {
  const open: OpenForRead = deps.open ?? nodeOpen;
  // 시험 주입점: 운영은 생략한다. null을 주면 "비차단 열기를 쓸 수 없는 플랫폼"을 재현한다.
  const flags =
    deps.openFlags === undefined
      ? readOnlyOpenFlags(fsConstants, process.platform)
      : deps.openFlags;
  return {
    async hashFile(path, options) {
      if (typeof path !== "string" || path.length === 0 || path.includes("\0")) {
        throw new ArtifactHashError("READ_FAILED", "경로가 올바르지 않다");
      }
      if (flags === null) {
        throw new ArtifactHashError("READ_FAILED", "대기하지 않는 읽기 전용 열기를 쓸 수 없다");
      }
      if (options.signal?.aborted) throw new ArtifactHashError("CANCELLED", "취소됐다");

      let handle: FileHandle;
      try {
        // @MX:WARN: [AUTO] 열기 플래그에서 O_NONBLOCK(POSIX)을 빼면 FIFO 입력이 열기에서 무기한 매달린다.
        // @MX:REASON: 매달린 open(2)는 스레드풀 안에서 일어나 AbortSignal로 끊을 수 없고, CLI의 잠금·수신기 정리가 시작되지 못한다.
        handle = await open(path, flags);
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
