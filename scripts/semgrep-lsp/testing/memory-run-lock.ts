// 시험 전용: 메모리 위의 RunLockPort. 실제 파일 시스템이나 프로세스 사이의 경쟁을 대신하지 않는다 — 코어 로직(run-lock.ts)과
// CLI 연결을 빠르게 확인하려는 것이고, 원자성과 경로 정규화는 run-lock-node.test.ts가 실제 디스크에서 확인한다.
//
// 트리 경로 → 키는 단순화되어 있다(구분자 통일, `.`·`..` 정리, 끝의 `/` 제거, 선택적 소문자). 실패 주입 필드로 읽기·쓰기·지우기
// 실패를 재현할 수 있다.

import { sha256Hex } from "../sha";
import type { RunLockPort, TreeResolution } from "../run-lock";

export interface MemoryRunLockOptions {
  /** 다른 인스턴스와 파일 저장소를 공유한다(같은 디스크를 쓰는 두 "프로세스"를 흉내). */
  files?: Map<string, string>;
  caseInsensitive?: boolean;
  pid?: number;
  hostname?: string;
  nowIso?: string;
}

function normalize(treePath: string, caseInsensitive: boolean): string {
  const parts: string[] = [];
  for (const part of treePath.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  const key = `/${parts.join("/")}`;
  return caseInsensitive ? key.toLowerCase() : key;
}

export class MemoryRunLock implements RunLockPort {
  /** 잠금 파일 경로 → 내용. 시험이 직접 읽고 바꿀 수 있다. */
  readonly files: Map<string, string>;
  /** 실패 주입: 값이 있으면 해당 연산이 그 오류로 던진다. */
  fail: {
    resolve: Error | null;
    create: Error | null;
    read: Error | null;
    remove: Error | null;
  } = { resolve: null, create: null, read: null, remove: null };
  readonly calls: string[] = [];
  private counter = 0;

  constructor(private readonly options: MemoryRunLockOptions = {}) {
    this.files = options.files ?? new Map<string, string>();
  }

  async resolveTree(treePath: string): Promise<TreeResolution> {
    this.calls.push(`resolve:${treePath}`);
    if (this.fail.resolve) throw this.fail.resolve;
    const key = normalize(treePath, this.options.caseInsensitive ?? false);
    const cut = key.lastIndexOf("/");
    if (cut <= 0) throw new Error("루트 폴더는 트리로 잠글 수 없다");
    const keySha256 = sha256Hex(`memory-tree-lock\n${key}`);
    return {
      keySha256,
      lockPath: `${key.slice(0, cut)}/semgrep-lsp-tree-${keySha256.slice(0, 32)}.lock`,
    };
  }

  newToken(): string {
    this.counter += 1;
    return `token-${this.counter.toString(16).padStart(26, "0")}`;
  }

  identity(): { pid: number; hostname: string; nowIso: string } {
    return {
      pid: this.options.pid ?? 4242,
      hostname: this.options.hostname ?? "test-host",
      nowIso: this.options.nowIso ?? "2026-10-23T00:00:00.000Z",
    };
  }

  async createExclusive(path: string, text: string): Promise<"CREATED" | "EXISTS"> {
    this.calls.push(`create:${path}`);
    if (this.fail.create) throw this.fail.create;
    if (this.files.has(path)) return "EXISTS";
    this.files.set(path, text);
    return "CREATED";
  }

  async read(path: string): Promise<string | null> {
    this.calls.push(`read:${path}`);
    if (this.fail.read) throw this.fail.read;
    return this.files.get(path) ?? null;
  }

  async remove(path: string): Promise<boolean> {
    this.calls.push(`remove:${path}`);
    if (this.fail.remove) throw this.fail.remove;
    return this.files.delete(path);
  }
}
