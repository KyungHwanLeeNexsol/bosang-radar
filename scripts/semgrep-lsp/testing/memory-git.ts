// 메모리 GitPort. 커밋 SHA → 경로 → 내용 표로 만든다. blob SHA는 실제 git과 같은 규칙으로 계산한다.

import { gitBlobSha1 } from "../sha";
import type { GitPort, GitTreeEntry } from "../types";

type Content = string | Uint8Array;
export type MemoryGitFile = Content | { content: Content; mode?: string };
export type MemoryGitCommits = Record<string, Record<string, MemoryGitFile>>;

const SHA40 = /^[0-9a-f]{40}$/;
const encoder = new TextEncoder();

function toBytes(content: Content): Uint8Array {
  return typeof content === "string" ? encoder.encode(content) : content;
}

function isSpec(file: MemoryGitFile): file is { content: Content; mode?: string } {
  return typeof file === "object" && !(file instanceof Uint8Array);
}

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export class MemoryGit implements GitPort {
  private readonly trees = new Map<string, GitTreeEntry[]>();
  private readonly blobs = new Map<string, Uint8Array>();

  constructor(commits: MemoryGitCommits) {
    for (const [commitSha, files] of Object.entries(commits)) {
      if (!SHA40.test(commitSha)) {
        throw new Error(`커밋 SHA는 소문자 40자 16진수여야 한다: ${commitSha}`);
      }
      const entries: GitTreeEntry[] = [];
      for (const path of Object.keys(files).sort(compareBytes)) {
        const file = files[path];
        const spec = isSpec(file) ? file : { content: file };
        const mode = spec.mode ?? "100644";
        if (mode === "160000") {
          // 서브모듈: 내용 문자열이 가리키는 커밋 SHA다. blob이 아니므로 읽을 수 없다.
          const target = typeof spec.content === "string" ? spec.content : "";
          if (!SHA40.test(target)) {
            throw new Error(`서브모듈(160000) 항목의 내용은 40자 16진수 SHA여야 한다: ${path}`);
          }
          entries.push({ path, mode, type: "commit", blobSha: target, size: null });
          continue;
        }
        const bytes = toBytes(spec.content);
        const blobSha = gitBlobSha1(bytes);
        this.blobs.set(blobSha, bytes.slice());
        entries.push({ path, mode, type: "blob", blobSha, size: bytes.byteLength });
      }
      this.trees.set(commitSha, entries);
    }
  }

  async resolveCommit(rev: string): Promise<string | null> {
    return SHA40.test(rev) && this.trees.has(rev) ? rev : null;
  }

  async lsTree(commitSha: string): Promise<GitTreeEntry[]> {
    const entries = this.trees.get(commitSha);
    if (!entries) throw new Error(`알 수 없는 커밋: ${commitSha}`);
    return entries.map((entry) => ({ ...entry }));
  }

  async readBlob(blobSha: string): Promise<Uint8Array> {
    const data = this.blobs.get(blobSha);
    if (!data) throw new Error(`알 수 없는 blob: ${blobSha}`);
    return data.slice();
  }
}
