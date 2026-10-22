// 검사 범위 E(ADR D6)와 스캔 트리. 파일·git 접근은 FsPort·GitPort로만 한다(git 명령을 직접 실행하지 않는다).
//
// 공개 API (B2가 쓴다):
//   resolveTarget(git, rev): Promise<ResolveTargetResult>      전체 40자 SHA만 받는다
//   computeScope(git, targetSha, scopeConfig): Promise<ScopeResult>
//   buildScanTree(fs, git, scope, outRoot): Promise<{ written: number }>
//   verifyScanTree(fs, scope, treeRoot, scopeConfig): Promise<Reason[]>
//   SCOPE_REASON: 내장 제외 사유 식별자(명시적 제외는 scope.json의 id를 그대로 쓴다)
//
// 개수는 어디에도 상수로 두지 않는다: E는 대상 SHA에서 매번 계산한다.

import { gitBlobSha1, sha256Hex } from "./sha";
import type { Reason } from "./status";
import type { FsPort, GitPort, GitTreeEntry, ScopeConfig, ScopeEntry, ScopeResult } from "./types";

export const SCOPE_REASON = {
  nonRegularFile: "non-regular-file",
  notJsTsExtension: "not-js-ts-extension",
  languageExcluded: "language-excluded",
  semgrepDefaultIgnore: "semgrep-default-ignore",
  maxTargetBytes: "max-target-bytes",
} as const;

const FULL_SHA = /^[0-9a-f]{40}$/;

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

// ── 대상 SHA ────────────────────────────────────────────────────

export type ResolveTargetResult = { ok: true; sha: string } | { ok: false; reasons: Reason[] };

function unresolved(detail: string): ResolveTargetResult {
  return { ok: false, reasons: [{ code: "TARGET_SHA_UNRESOLVED", detail }] };
}

/**
 * 대상은 전체 40자 소문자 16진수 커밋 SHA만 받는다. 브랜치 이름·약식 SHA·대문자 SHA·ref 표현은
 * git 포트를 부르기 전에 거부한다(대문자는 같은 SHA의 두 표기가 증거에 섞이지 않게 하려는 선택이다).
 * 포트가 입력과 다른 SHA를 돌려줘도(별칭 해석) 거부한다.
 */
export async function resolveTarget(git: GitPort, rev: string): Promise<ResolveTargetResult> {
  if (!FULL_SHA.test(rev)) {
    return unresolved("대상은 전체 40자 소문자 커밋 SHA여야 한다(브랜치 이름·약식 SHA 불가)");
  }
  let resolved: string | null;
  try {
    resolved = await git.resolveCommit(rev);
  } catch (error) {
    return unresolved(`git이 SHA를 해석하지 못했다: ${(error as Error).message}`);
  }
  if (resolved === null) return unresolved(`git이 커밋으로 해석하지 못했다: ${rev}`);
  if (resolved !== rev) return unresolved(`해석 결과가 입력과 다르다: ${rev} → ${resolved}`);
  return { ok: true, sha: resolved };
}

// ── E 계산 ──────────────────────────────────────────────────────

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** `*`·`?`만 지원하는 파일 이름 glob(기본 ignore의 file_globs 용). 기준은 경로가 아니라 파일 이름이다. */
function globToRegExp(glob: string): RegExp {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${body}$`);
}

const REGULAR_MODES = new Set(["100644", "100755"]);

/**
 * 한 추적 파일의 제외 사유(포함이면 null). 사유 우선순위는 ADR D6 그대로다:
 * 비정규 → JS/TS 확장자 아님 → 언어 제외 → Semgrep 기본 ignore → 명시적 제외 → 크기.
 */
function exclusionReason(entry: GitTreeEntry, config: ScopeConfig, globs: RegExp[]): string | null {
  // 일반 파일 모드만 통과시킨다(심볼릭 링크 120000, 서브모듈 160000, 그 밖의 모드는 fail-closed로 제외).
  if (entry.type !== "blob" || !REGULAR_MODES.has(entry.mode)) return SCOPE_REASON.nonRegularFile;

  const base = basenameOf(entry.path);
  // 확장자 비교는 대소문자를 구분한다. Semgrep이 `.JS`를 읽는다면 P ∖ E로 TARGET_MISMATCH가 되어 드러난다.
  if (!config.extensions.some((ext) => base.endsWith(ext))) return SCOPE_REASON.notJsTsExtension;
  if (config.language_excluded_suffixes.some((suffix) => base.endsWith(suffix))) {
    return SCOPE_REASON.languageExcluded;
  }

  const dirs = entry.path.split("/").slice(0, -1);
  const ignore = config.semgrep_default_ignore;
  if (dirs.some((d) => ignore.dir_names.includes(d)) || globs.some((g) => g.test(base))) {
    return SCOPE_REASON.semgrepDefaultIgnore;
  }

  for (const rule of config.explicit_excludes) {
    if (rule.match.kind === "basename-regex" && new RegExp(rule.match.value).test(base)) {
      return rule.id;
    }
    if (rule.match.kind === "dir-prefix" && entry.path.startsWith(rule.match.value)) {
      return rule.id;
    }
  }

  // Semgrep은 max_target_bytes를 넘는 파일을 건너뛴다. 정확히 같은 크기는 포함한다.
  if (entry.size === null) {
    throw new Error(`크기를 알 수 없는 일반 blob은 범위를 확정할 수 없다: ${entry.path}`);
  }
  if (entry.size > config.max_target_bytes) return SCOPE_REASON.maxTargetBytes;
  return null;
}

/**
 * 대상 SHA의 추적 파일 전부에 대해 포함/제외를 결정한다. 모든 경로가 정확히 한 번 나오고,
 * 경로 바이트(UTF-8)순으로 정렬한다. targetSha는 resolveTarget이 통과시킨 전체 SHA여야 한다.
 */
export async function computeScope(
  git: GitPort,
  targetSha: string,
  config: ScopeConfig
): Promise<ScopeResult> {
  if (!FULL_SHA.test(targetSha)) {
    throw new Error(`대상 SHA는 전체 40자 소문자 16진수여야 한다: ${targetSha}`);
  }
  const tree = await git.lsTree(targetSha);
  const globs = config.semgrep_default_ignore.file_globs.map(globToRegExp);

  const seen = new Set<string>();
  const entries: ScopeEntry[] = [];
  for (const item of tree) {
    if (seen.has(item.path)) throw new Error(`lsTree가 같은 경로를 두 번 돌려줬다: ${item.path}`);
    seen.add(item.path);
    const reason = exclusionReason(item, config, globs);
    entries.push({
      path: item.path,
      blobSha: item.blobSha,
      size: item.size,
      decision: reason === null ? "include" : "exclude",
      reason,
    });
  }
  entries.sort((a, b) => compareBytes(a.path, b.path));

  const included = entries.filter((e) => e.decision === "include");
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.reason !== null) counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1);
  }
  const excludedCounts: Record<string, number> = {};
  for (const reason of [...counts.keys()].sort(compareBytes)) {
    excludedCounts[reason] = counts.get(reason) as number;
  }

  return {
    targetSha,
    entries,
    included,
    excludedCounts,
    scopeSha256: sha256Hex(included.map((e) => `${e.path}\t${e.blobSha}\n`).join("")),
  };
}

// ── 스캔 트리 ───────────────────────────────────────────────────

function joinRoot(root: string, path: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${path}`;
}

/** 저장소 상대 경로가 트리 밖으로 새거나 Windows에서 쓸 수 없는 형태면 예외를 던진다. */
function assertSafeRelativePath(path: string): void {
  const parts = path.split("/");
  const bad =
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    parts.some((p) => p === "" || p === "." || p === ".." || p.includes(":"));
  if (bad) throw new Error(`스캔 트리에 쓸 수 없는 경로다: ${JSON.stringify(path)}`);
}

/**
 * E에 해당하는 파일만 git blob에서 읽어 outRoot 아래 저장소 상대 경로로 쓴다.
 * 쓰기 전에 blob 내용이 blobSha와 같은지 확인하고, 이미 있는 파일은 덮어쓰지 않는다.
 * 규칙에 `paths`가 없어 다른 파일을 끌어들이는 일을 막으려고, 필터가 아니라 "E만 담은 새 트리"로 만든다.
 */
export async function buildScanTree(
  fs: FsPort,
  git: GitPort,
  scope: ScopeResult,
  outRoot: string
): Promise<{ written: number }> {
  await fs.mkdirp(outRoot);
  let written = 0;
  for (const entry of scope.included) {
    assertSafeRelativePath(entry.path);
    const data = await git.readBlob(entry.blobSha);
    const actual = gitBlobSha1(data);
    if (actual !== entry.blobSha) {
      throw new Error(
        `blob 내용의 SHA가 목록과 다르다: ${entry.path} (${actual} ≠ ${entry.blobSha})`
      );
    }
    const target = joinRoot(outRoot, entry.path);
    const dir = target.slice(0, target.lastIndexOf("/"));
    await fs.mkdirp(dir);
    await fs.writeFileExclusive(target, data);
    written++;
  }
  return { written };
}

/**
 * 스캔 트리가 E와 파일·blob SHA까지 같은지, 그리고 Semgrep 기본 ignore가 건너뛸 이름의 디렉터리가
 * 없는지 본다(C0 (c)). 어긋남은 모두 MANIFEST_MISMATCH 계열 사유이며 서버를 띄우지 않는다.
 * 빈 디렉터리는 FsPort가 파일만 나열하므로 보지 못한다(파일이 없으면 Semgrep도 읽을 것이 없다).
 */
export async function verifyScanTree(
  fs: FsPort,
  scope: ScopeResult,
  treeRoot: string,
  config: Pick<ScopeConfig, "semgrep_default_ignore">
): Promise<Reason[]> {
  const listed = await fs.listFilesRecursive(treeRoot);
  const expected = new Map(scope.included.map((e) => [e.path, e.blobSha]));
  const listedSet = new Set(listed);

  const added: Reason[] = [];
  const changed: Reason[] = [];
  for (const path of listed) {
    const blobSha = expected.get(path);
    if (blobSha === undefined) {
      added.push({ code: "SCAN_TREE_FILE_ADDED", detail: path });
      continue;
    }
    try {
      const actual = gitBlobSha1(await fs.readFile(joinRoot(treeRoot, path)));
      if (actual !== blobSha) {
        changed.push({ code: "SCAN_TREE_FILE_CHANGED", detail: `${path}: ${actual} ≠ ${blobSha}` });
      }
    } catch (error) {
      changed.push({
        code: "SCAN_TREE_FILE_CHANGED",
        detail: `${path}: 읽을 수 없다(${(error as Error).message})`,
      });
    }
  }
  const missing: Reason[] = scope.included
    .filter((e) => !listedSet.has(e.path))
    .map((e) => ({ code: "SCAN_TREE_FILE_MISSING" as const, detail: e.path }));

  // 트리 안의 모든 디렉터리 경로를 모아 이름이 기본 ignore 목록에 있는 것을 보고한다.
  const dirNames = new Set(config.semgrep_default_ignore.dir_names);
  const ignoredDirs = new Set<string>();
  for (const path of listed) {
    const parts = path.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      if (dirNames.has(parts[i])) ignoredDirs.add(parts.slice(0, i + 1).join("/"));
    }
  }
  const ignored: Reason[] = [...ignoredDirs]
    .sort(compareBytes)
    .map((dir) => ({ code: "SCAN_TREE_IGNORED_DIR_NAME" as const, detail: dir }));

  return [...added, ...missing, ...changed, ...ignored];
}
