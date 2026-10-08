// SPEC-B2C-LAUNCH-001 M3b: 저장소 코드 오라클 (AC-B2CLAUNCH-012 "저장소 코드 오라클").
//
// 비시험 코드·스크립트·워크플로·`package.json`·`.env.local.example`에서 엔진 준비 변수를 대입하는 줄을 찾는다.
// AC가 적은 명령을 그대로 옮긴 것이다 — 정규식(두 단계: 이름 뒤 따옴표·대괄호, 공백, `=` 또는 `:`, 값의 첫 글자),
// `//`·`*`·`#`로 시작하는 줄 거르기, 시험 파일(`*.test.*`) 제외, 그리고 같은 경로 목록.
//
// 이 오라클이 보지 못하는 것(AC가 적은 맹점): 공백으로 구분하는 `ENV` 형태와 `??=` 대입, 변수 이름을 계산해
// 만드는 대입, 실제 `.env*` 파일과 운영 호스트의 PM2 저장 환경·셸 프로필, 시험 파일(별도 열람). 이 모듈은
// 그 밖의 것을 보장하지 않는다. 허용 목록(시험 하네스의 임시 서버 환경)은 호출하는 쪽이 넘긴다.

import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** AC가 적은 검색 경로 목록. 저장소 루트 기준이고 파일 경로도 직접 지정할 수 있다. */
export const SCAN_ROOTS: readonly string[] = [
  "app",
  "components",
  "lib",
  "scripts",
  "instrumentation.ts",
  "playwright.config.ts",
  "package.json",
  ".github",
  ".env.local.example",
];

/**
 * 대입 줄 정규식. 이름 뒤에 `]`·`"`·`'`가 올 수 있고(대괄호 접근, JSON 키), 공백을 지나 `=` 또는 `:`가 오며,
 * 선택적 따옴표 뒤에 `=`도 공백도 아닌 글자가 와야 한다(`===` 비교와 값 없는 대입은 일치하지 않는다).
 */
export const ASSIGNMENT_PATTERN = /DIAGNOSIS_ENGINE_READY[\]"']*[ \t]*[=:][ \t]*["'`]?[^=\s]/;

export interface OracleHit {
  /** 루트 기준 경로(슬래시). */
  file: string;
  line: number;
  /** 앞뒤 공백을 뺀 줄 내용. */
  text: string;
}

export interface AllowlistEntry {
  file: string;
  text: string;
}

const isCommentLine = (text: string) =>
  text.startsWith("//") || text.startsWith("*") || text.startsWith("#");

/** 한 파일의 내용에서 대입 줄을 찾는다(주석 줄 제외). 줄 번호는 1부터다. */
export function findAssignmentLines(source: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  source.split("\n").forEach((raw, index) => {
    const text = raw.replace(/\r$/, "").trim();
    if (!isCommentLine(text) && ASSIGNMENT_PATTERN.test(text)) {
      found.push({ line: index + 1, text });
    }
  });
  return found;
}

/**
 * 루트 아래 지정한 경로들을 훑어 대입 줄을 모은다. `*.test.*` 파일은 제외하고 심볼릭 링크는 따라가지 않는다.
 * 존재하지 않는 경로는 missing으로 알린다(조용히 건너뛰면 오라클이 빈 범위를 통과로 읽는다).
 */
export function scanTree(
  rootDir: string,
  roots: readonly string[] = SCAN_ROOTS
): { hits: OracleHit[]; missing: string[] } {
  const hits: OracleHit[] = [];
  const missing: string[] = [];

  const visit = (absolute: string, relative: string): void => {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const child of readdirSync(absolute).sort()) {
        visit(join(absolute, child), `${relative}/${child}`);
      }
      return;
    }
    if (!stat.isFile() || /\.test\./.test(relative.slice(relative.lastIndexOf("/") + 1))) return;
    for (const { line, text } of findAssignmentLines(readFileSync(absolute, "utf-8"))) {
      hits.push({ file: relative, line, text });
    }
  };

  for (const root of roots) {
    try {
      lstatSync(join(rootDir, root));
    } catch {
      missing.push(root);
      continue;
    }
    visit(join(rootDir, root), root);
  }

  hits.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return { hits, missing };
}

/**
 * 찾은 줄을 허용 목록과 대조한다. 허용 항목 하나는 같은 파일의 같은 내용 줄 하나만 허용하며(줄 번호는 보지
 * 않는다), 목록 밖의 줄(unexpected)과 트리에서 사라진 항목(unusedAllowlist)이 모두 비어야 통과다.
 */
export function compareToAllowlist(
  hits: readonly OracleHit[],
  allowlist: readonly AllowlistEntry[]
): { unexpected: OracleHit[]; unusedAllowlist: AllowlistEntry[] } {
  const remaining = allowlist.map((entry) => ({ ...entry, text: entry.text.trim(), used: false }));
  const unexpected: OracleHit[] = [];

  for (const hit of hits) {
    const match = remaining.find(
      (entry) => !entry.used && entry.file === hit.file && entry.text === hit.text
    );
    if (match === undefined) unexpected.push(hit);
    else match.used = true;
  }
  return {
    unexpected,
    unusedAllowlist: remaining
      .filter((entry) => !entry.used)
      .map(({ file, text }) => ({ file, text })),
  };
}
