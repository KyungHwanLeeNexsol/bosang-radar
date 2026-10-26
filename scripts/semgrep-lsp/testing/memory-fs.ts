// 메모리 FsPort. 경로는 '/' 기준으로 정규화한다(Windows 구분자 '\'도 '/'로 바꾼다).

import type { FsPort } from "../types";

const encoder = new TextEncoder();

export function normalizePath(input: string): string {
  const absolute = input.replace(/\\/g, "/").startsWith("/");
  const stack: string[] = [];
  for (const part of input.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return (absolute ? "/" : "") + stack.join("/");
}

function parentDirs(path: string): string[] {
  const dirs: string[] = [];
  const parts = path.split("/");
  const absolute = path.startsWith("/");
  for (let i = absolute ? 2 : 1; i < parts.length; i++) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export class MemoryFs implements FsPort {
  private readonly files = new Map<string, Uint8Array>();
  private readonly dirs = new Set<string>();

  constructor(initial: Record<string, string | Uint8Array> = {}) {
    for (const [path, data] of Object.entries(initial)) {
      const normalized = normalizePath(path);
      this.files.set(normalized, typeof data === "string" ? encoder.encode(data) : data.slice());
      for (const dir of parentDirs(normalized)) this.dirs.add(dir);
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const data = this.files.get(normalizePath(path));
    if (!data) throw new Error(`ENOENT: 파일이 없다: ${path}`);
    return data.slice();
  }

  async writeFileExclusive(path: string, data: Uint8Array): Promise<void> {
    const normalized = normalizePath(path);
    if (this.files.has(normalized) || this.dirs.has(normalized)) {
      throw new Error(`EEXIST: 이미 있다: ${path}`);
    }
    this.files.set(normalized, data.slice());
    for (const dir of parentDirs(normalized)) this.dirs.add(dir);
  }

  async mkdirp(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (normalized === "" || normalized === "/") return;
    this.dirs.add(normalized);
    for (const dir of parentDirs(normalized)) this.dirs.add(dir);
  }

  async listFilesRecursive(root: string): Promise<string[]> {
    const normalized = normalizePath(root);
    const prefix = normalized === "" || normalized.endsWith("/") ? normalized : `${normalized}/`;
    const found: string[] = [];
    for (const path of this.files.keys()) {
      if (path.startsWith(prefix)) found.push(path.slice(prefix.length));
    }
    return found.sort(compareBytes);
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    return this.files.has(normalized) || this.dirs.has(normalized);
  }

  /** 메모리 파일 시스템에는 링크가 없고 경로를 사전식으로 정규화해 접근한다 — 그 의미 그대로가 실제로 닿는 자리다. */
  async physicalKey(path: string): Promise<string> {
    return normalizePath(path);
  }

  /** 시험 편의: mkdirp로 기록된 디렉터리 목록(오름차순). */
  get directories(): string[] {
    return [...this.dirs].sort(compareBytes);
  }
}
