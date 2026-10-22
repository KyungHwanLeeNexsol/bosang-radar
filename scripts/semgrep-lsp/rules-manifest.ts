// 규칙 기대 목록(ADR D7)과 규칙 트리 대조(C0 (b)). 순수 모듈이다: 파일은 FsPort로만 읽고,
// Semgrep을 실행하지 않으며, 규칙 YAML 원문을 해석하지 않는다(블롭 SHA로만 비교한다).
//
// 공개 API (B2가 쓴다):
//   parseRulesFiles(text): RuleFileEntry[]            data/rules-files.tsv 파싱(엄격)
//   parseExpectedRules(text): ExpectedRule[]          data/rules-expected.tsv 파싱(엄격)
//   rulesListSha256(entries): string                  핀 rules.yaml_list_sha256 재현
//   expectedRulesSha256(rules): string                핀 rules.expected_rules_sha256 재현
//   expectedFinalIdsSha256(rules): string             핀 rules.expected_final_ids_sorted_sha256 재현
//   deriveFinalId(file, originalId, cacheDirName)     최종 ID 모델
//   computeRulesFacts(files, rules): RulesFacts       고유 ID·겹침 묶음·파일별 규칙 수
//   checkRulesPin(files, rules, pinRules): Reason[]   목록 ↔ 핀 교차 검증(RULES_PIN_INCONSISTENT)
//   compareRulesTree(fs, cacheRoot, expectedFiles, config): Promise<Reason[]>
//   rulesTreeConfigFromPin(pinRules): RulesTreeConfig
//
// 해시 공식(핀 값을 시험으로 재현해 확인했다):
//   · rules.yaml_list_sha256       = sha256( 각 항목 "경로\t블롭SHA\n"을 경로 바이트순으로 이은 바이트 )
//                                    = data/rules-files.tsv 원문 바이트와 같다.
//   · rules.expected_rules_sha256  = sha256( 각 규칙 "파일\t원문ID\t최종ID\t언어(+로 이음)\t모드\t심각도\n"을
//                                    파일 순서(= rules-expected.tsv 순서) 그대로 이은 바이트 ) = 파일 원문 바이트.
//   · expected_final_ids_sorted_sha256 = sha256( 최종 ID 214개를 바이트순 정렬해 "ID\n"씩 이은 바이트 ).
// 줄 목록 해시는 sha.ts의 lineListSha256(각 줄 뒤에 LF)과 같다.

import { gitBlobSha1, lineListSha256 } from "./sha";
import type { Reason } from "./status";
import type { ExpectedRule, FsPort, Pin, RuleFileEntry } from "./types";

export class RulesManifestParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulesManifestParseError";
  }
}

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

// ── 파싱 ────────────────────────────────────────────────────────

/**
 * 고정 TSV의 공통 틀: LF 종료, 빈 줄·주석·CR 없음, 열 수 고정.
 * 해시가 원문 바이트에 걸려 있으므로 느슨하게 받아들이는 경로를 두지 않는다
 * (CRLF로 체크아웃된 사본은 해시가 달라지기 전에 여기서 거부된다).
 */
function splitTsv(text: string, name: string, columns: number): string[][] {
  if (text.length === 0) throw new RulesManifestParseError(`${name}: 비어 있다`);
  if (text.includes("\r")) throw new RulesManifestParseError(`${name}: CR 문자가 있다(LF만 허용)`);
  if (!text.endsWith("\n")) throw new RulesManifestParseError(`${name}: 끝 줄바꿈이 없다`);
  const lines = text.slice(0, -1).split("\n");
  return lines.map((line, i) => {
    const cols = line.split("\t");
    if (cols.length !== columns) {
      throw new RulesManifestParseError(
        `${name}:${i + 1}: 열이 ${columns}개여야 하는데 ${cols.length}개다`
      );
    }
    return cols;
  });
}

function checkRulePath(path: string, name: string, line: number): void {
  const where = `${name}:${line}`;
  if (path.length === 0) throw new RulesManifestParseError(`${where}: 경로가 비어 있다`);
  if (path.startsWith("/")) throw new RulesManifestParseError(`${where}: 절대 경로다: ${path}`);
  if (path.includes("\\")) throw new RulesManifestParseError(`${where}: 역슬래시가 있다: ${path}`);
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new RulesManifestParseError(`${where}: 경로 조각이 올바르지 않다: ${path}`);
  }
  if (!/\.ya?ml$/.test(path)) {
    throw new RulesManifestParseError(`${where}: .yaml/.yml 파일이 아니다: ${path}`);
  }
}

/** data/rules-files.tsv: "경로\t블롭SHA" 줄. 경로 바이트순 오름차순, 중복 불가. */
export function parseRulesFiles(text: string): RuleFileEntry[] {
  const name = "rules-files.tsv";
  const rows = splitTsv(text, name, 2);
  const out: RuleFileEntry[] = [];
  rows.forEach(([path, blobSha], i) => {
    checkRulePath(path, name, i + 1);
    if (!SHA1.test(blobSha)) {
      throw new RulesManifestParseError(`${name}:${i + 1}: 블롭 SHA가 소문자 40자 16진수가 아니다`);
    }
    if (i > 0 && compareBytes(out[i - 1].path, path) >= 0) {
      throw new RulesManifestParseError(`${name}:${i + 1}: 경로가 중복이거나 정렬 순서가 아니다`);
    }
    out.push({ path, blobSha });
  });
  return out;
}

/** data/rules-expected.tsv: 6열. 파일 오름차순(같은 파일의 규칙은 파일 안 순서 그대로). */
export function parseExpectedRules(text: string): ExpectedRule[] {
  const name = "rules-expected.tsv";
  const rows = splitTsv(text, name, 6);
  const out: ExpectedRule[] = [];
  rows.forEach((cols, i) => {
    const [file, originalId, finalId, languages, mode, severity] = cols;
    cols.forEach((col, c) => {
      if (col.length === 0)
        throw new RulesManifestParseError(`${name}:${i + 1}: ${c + 1}번째 열이 비어 있다`);
    });
    checkRulePath(file, name, i + 1);
    const langs = languages.split("+");
    if (langs.some((l) => l.length === 0)) {
      throw new RulesManifestParseError(
        `${name}:${i + 1}: 언어 목록에 빈 조각이 있다: ${languages}`
      );
    }
    if (i > 0 && compareBytes(out[i - 1].file, file) > 0) {
      throw new RulesManifestParseError(`${name}:${i + 1}: 파일 순서가 오름차순이 아니다`);
    }
    out.push({ file, originalId, finalId, languages: langs, mode, severity });
  });
  return out;
}

// ── 해시 ────────────────────────────────────────────────────────

function fileLine(entry: RuleFileEntry): string {
  return `${entry.path}\t${entry.blobSha}`;
}

function sortedByPath(entries: readonly RuleFileEntry[]): RuleFileEntry[] {
  return [...entries].sort((a, b) => compareBytes(a.path, b.path));
}

/** 규칙 파일 목록 해시. 입력 순서와 무관하게 경로 바이트순으로 정렬해 계산한다. */
export function rulesListSha256(entries: readonly RuleFileEntry[]): string {
  return lineListSha256(sortedByPath(entries).map(fileLine));
}

function expectedRow(rule: ExpectedRule): string {
  return [
    rule.file,
    rule.originalId,
    rule.finalId,
    rule.languages.join("+"),
    rule.mode,
    rule.severity,
  ].join("\t");
}

/** 기대 규칙 해시. 순서를 바꾸지 않는다(파싱 단계가 파일 순서를 보장한다). */
export function expectedRulesSha256(rules: readonly ExpectedRule[]): string {
  return lineListSha256(rules.map(expectedRow));
}

/** 최종 ID를 바이트순으로 정렬한 목록의 해시. */
export function expectedFinalIdsSha256(rules: readonly ExpectedRule[]): string {
  return lineListSha256(rules.map((r) => r.finalId).sort(compareBytes));
}

// ── 최종 ID 모델 (ADR D7) ───────────────────────────────────────

/**
 * 최종 ID = `<캐시 디렉터리 이름>.` + 파일의 디렉터리 조각을 `.`로 이은 값 + `.` + 원문 ID.
 * 규칙 키는 항상 이 전체 문자열이다(마지막 조각으로 줄이지 않는다).
 * file은 캐시 디렉터리 기준 상대 경로('/' 구분)다.
 */
export function deriveFinalId(file: string, originalId: string, cacheDirName: string): string {
  const parts = file.split("/");
  const dirs = parts.slice(0, -1);
  if (dirs.length === 0) {
    throw new RulesManifestParseError(`디렉터리 조각이 없는 규칙 파일 경로: ${file}`);
  }
  return `${cacheDirName}.${dirs.join(".")}.${originalId}`;
}

export interface DuplicateGroup {
  originalId: string;
  finalIds: string[];
}

export interface RulesFacts {
  yamlFiles: number;
  totalRules: number;
  distinctOriginalIds: number;
  distinctFinalIds: number;
  /** 원문 ID가 둘 이상의 규칙에서 쓰이는 묶음(원문 ID 바이트순). */
  duplicateOriginalIdGroups: DuplicateGroup[];
  /** 파일 경로 → 그 파일의 규칙 수(기대 목록 기준). */
  rulesPerFile: Record<string, number>;
}

export function computeRulesFacts(
  files: readonly RuleFileEntry[],
  rules: readonly ExpectedRule[]
): RulesFacts {
  const byOriginal = new Map<string, string[]>();
  const perFile: Record<string, number> = {};
  for (const rule of rules) {
    const list = byOriginal.get(rule.originalId) ?? [];
    list.push(rule.finalId);
    byOriginal.set(rule.originalId, list);
    perFile[rule.file] = (perFile[rule.file] ?? 0) + 1;
  }
  const groups: DuplicateGroup[] = [...byOriginal.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([originalId, finalIds]) => ({ originalId, finalIds: [...finalIds].sort(compareBytes) }))
    .sort((a, b) => compareBytes(a.originalId, b.originalId));
  return {
    yamlFiles: files.length,
    totalRules: rules.length,
    distinctOriginalIds: byOriginal.size,
    distinctFinalIds: new Set(rules.map((r) => r.finalId)).size,
    duplicateOriginalIdGroups: groups,
    rulesPerFile: perFile,
  };
}

type PinRules = Pick<
  Pin["rules"],
  | "cache_dir_name"
  | "yaml_files"
  | "yaml_list_sha256"
  | "expected_rules"
  | "expected_rules_sha256"
  | "expected_final_ids_sorted_sha256"
  | "distinct_original_ids"
  | "duplicate_original_id_groups"
>;

function inconsistent(detail: string): Reason {
  return { code: "RULES_PIN_INCONSISTENT", detail };
}

/**
 * 고정 목록 두 개와 핀이 서로 모순되지 않는지 본다. 서버를 띄우기 전에 고정 입력 자체를 믿어도
 * 되는지 확인하는 단계라서, 어긋남은 모두 RULES_PIN_INCONSISTENT(→ MANIFEST_MISMATCH)다.
 * 규칙 캐시의 내용은 보지 않는다(그건 compareRulesTree).
 */
export function checkRulesPin(
  files: readonly RuleFileEntry[],
  rules: readonly ExpectedRule[],
  pinRules: PinRules
): Reason[] {
  const reasons: Reason[] = [];
  const facts = computeRulesFacts(files, rules);

  const numeric: [string, number, number][] = [
    ["yaml_files", files.length, pinRules.yaml_files],
    ["expected_rules", rules.length, pinRules.expected_rules],
    ["distinct_original_ids", facts.distinctOriginalIds, pinRules.distinct_original_ids],
    [
      "duplicate_original_id_groups",
      facts.duplicateOriginalIdGroups.length,
      pinRules.duplicate_original_id_groups,
    ],
  ];
  for (const [key, actual, pinned] of numeric) {
    if (actual !== pinned) reasons.push(inconsistent(`${key}: 목록 ${actual} ≠ 핀 ${pinned}`));
  }

  const hashes: [string, string, string][] = [
    ["yaml_list_sha256", rulesListSha256(files), pinRules.yaml_list_sha256],
    ["expected_rules_sha256", expectedRulesSha256(rules), pinRules.expected_rules_sha256],
    [
      "expected_final_ids_sorted_sha256",
      expectedFinalIdsSha256(rules),
      pinRules.expected_final_ids_sorted_sha256,
    ],
  ];
  for (const [key, actual, pinned] of hashes) {
    if (actual !== pinned) {
      reasons.push(
        inconsistent(`${key}: 목록 ${actual.slice(0, 12)}… ≠ 핀 ${pinned.slice(0, 12)}…`)
      );
    }
  }

  const listed = new Set(files.map((f) => f.path));
  for (const rule of rules) {
    if (!listed.has(rule.file)) {
      reasons.push(inconsistent(`규칙 ${rule.originalId}의 파일이 목록에 없다: ${rule.file}`));
    }
    const derived = deriveFinalId(rule.file, rule.originalId, pinRules.cache_dir_name);
    if (rule.finalId !== derived) {
      reasons.push(
        inconsistent(
          `규칙 ${rule.originalId}의 최종 ID가 모델과 다르다: ${rule.finalId} ≠ ${derived}`
        )
      );
    }
  }
  for (const file of files) {
    if (!facts.rulesPerFile[file.path]) {
      reasons.push(inconsistent(`규칙이 하나도 없는 파일: ${file.path}`));
    }
  }
  const seen = new Set<string>();
  for (const rule of rules) {
    // 최종 ID 충돌은 서버가 조용히 중복 제거하는 원인이다(Legacy_session.ml:386-390).
    if (seen.has(rule.finalId)) reasons.push(inconsistent(`최종 ID 중복: ${rule.finalId}`));
    seen.add(rule.finalId);
  }
  return reasons;
}

// ── 규칙 트리 대조 (C0 (b)) ─────────────────────────────────────

export interface RulesTreeConfig {
  /** 캐시 디렉터리 이름(핀 rules.cache_dir_name). cacheRoot가 이 디렉터리 자신을 가리킨다. */
  cacheDirName: string;
  /** 핀 rules.config_dirs 그대로(`<cacheDirName>/javascript` 꼴). */
  configDirs: readonly string[];
  /** 주면 실제 목록 해시를 이 값과 비교한다(핀의 yaml_list_sha256). 없으면 expectedFiles로 계산한다. */
  expectedListSha256?: string;
}

export function rulesTreeConfigFromPin(
  pinRules: Pick<Pin["rules"], "cache_dir_name" | "config_dirs" | "yaml_list_sha256">
): RulesTreeConfig {
  return {
    cacheDirName: pinRules.cache_dir_name,
    configDirs: [...pinRules.config_dirs],
    expectedListSha256: pinRules.yaml_list_sha256,
  };
}

/**
 * Semgrep이 규칙 파일로 읽을 파일인가: `.yaml`/`.yml`(대소문자 무시 — 더 많이 세는 쪽이 fail-closed다),
 * `.test.yaml`/`.test.yml`로 끝나는 것은 제외. 점 파일은 포함한다.
 * 시험 접미 제외는 가장 좁게 해석했다(`.test.`가 이름 중간에 있는 파일은 제외하지 않는다).
 */
function isRuleFile(relPath: string): boolean {
  const base = relPath.slice(relPath.lastIndexOf("/") + 1);
  if (!/\.ya?ml$/i.test(base)) return false;
  return !/\.test\.ya?ml$/i.test(base);
}

/**
 * 규칙 캐시(gitignore, 커밋하지 않음)를 FsPort로 읽어 고정 목록과 대조한다. 서버를 띄우기 전의 검사다.
 * cacheRoot는 캐시 디렉터리(`semgrep-rules`) 자신이며, 목록의 경로는 그 아래 상대 경로다.
 * 블롭 SHA는 읽은 바이트 그대로 계산한다 — 줄바꿈 변환된 사본은 변경으로 잡힌다.
 * 깨진 YAML 파일의 추가는 규칙 개수가 그대로여도 RULES_FILE_ADDED다(내용을 해석하지 않으므로).
 */
export async function compareRulesTree(
  fs: FsPort,
  cacheRoot: string,
  expectedFiles: readonly RuleFileEntry[],
  config: RulesTreeConfig
): Promise<Reason[]> {
  const reasons: Reason[] = [];

  const prefix = `${config.cacheDirName}/`;
  const dirs: string[] = [];
  for (const dir of config.configDirs) {
    if (dir.startsWith(prefix) && dir.length > prefix.length) dirs.push(dir.slice(prefix.length));
    else
      reasons.push(
        inconsistent(`구성 디렉터리가 캐시 이름 접두어(${prefix})를 갖지 않는다: ${dir}`)
      );
  }

  let listing: string[];
  try {
    listing = await fs.listFilesRecursive(cacheRoot);
  } catch (error) {
    reasons.push({
      code: "RULES_LIST_HASH_MISMATCH",
      detail: `규칙 캐시를 나열하지 못했다: ${(error as Error).message}`,
    });
    return reasons;
  }

  const present = listing
    .filter((p) => dirs.some((d) => p.startsWith(`${d}/`)) && isRuleFile(p))
    .sort(compareBytes);
  const expectedByPath = new Map(expectedFiles.map((e) => [e.path, e.blobSha]));
  const presentSet = new Set(present);

  const added: Reason[] = [];
  const changed: Reason[] = [];
  const actualLines: string[] = [];
  for (const path of present) {
    let blobSha: string | null;
    try {
      blobSha = gitBlobSha1(await fs.readFile(`${cacheRoot.replace(/[\\/]+$/, "")}/${path}`));
    } catch (error) {
      blobSha = null;
      changed.push({
        code: "RULES_FILE_CHANGED",
        detail: `${path}: 읽을 수 없다(${(error as Error).message})`,
      });
    }
    actualLines.push(`${path}\t${blobSha ?? "unreadable"}`);
    const expected = expectedByPath.get(path);
    if (expected === undefined) {
      added.push({ code: "RULES_FILE_ADDED", detail: path });
    } else if (blobSha !== null && blobSha !== expected) {
      changed.push({ code: "RULES_FILE_CHANGED", detail: `${path}: ${blobSha} ≠ ${expected}` });
    }
  }
  const removed: Reason[] = sortedByPath(expectedFiles)
    .filter((e) => !presentSet.has(e.path))
    .map((e) => ({ code: "RULES_FILE_REMOVED" as const, detail: e.path }));

  const expectedHash = config.expectedListSha256 ?? rulesListSha256(expectedFiles);
  const actualHash = lineListSha256(actualLines);
  const hashReasons: Reason[] = [];
  if (config.expectedListSha256 !== undefined && !SHA256.test(config.expectedListSha256)) {
    hashReasons.push(inconsistent("expectedListSha256가 64자 16진수가 아니다"));
  }
  if (actualHash !== expectedHash) {
    hashReasons.push({
      code: "RULES_LIST_HASH_MISMATCH",
      detail: `실제 ${actualHash.slice(0, 12)}… ≠ 기대 ${expectedHash.slice(0, 12)}…`,
    });
  }

  // 안정된 순서: 추가 → 삭제 → 변경 → 목록 해시.
  return [...reasons, ...added, ...removed, ...changed, ...hashReasons];
}
