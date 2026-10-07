// SPEC-B2C-LAUNCH-001 M1d: 표지값 검사 도우미 (REQ-B2CLAUNCH-007, AC-B2CLAUNCH-007).
//
// 표지값은 실행 시점에 무작위로 만든다 — 이 소스에는 접두사와 난수 생성 호출만 있고 고정 값이 없다. 만든 값이
// `git grep -nF --untracked`로 이미 어떤 파일에도 없는지 확인해 있으면 다시 만든다. 값 자체는 오류 메시지·반환
// 값의 라벨 어디에도 적지 않는다(실패 출력이 값을 다시 퍼뜨리지 않게 하려는 것이다).
// 이 도우미는 시험이 쓰며 앱 코드는 가져오지 않는다. git을 자식 프로세스로 부르므로 scripts/ 에 둔다.

import { spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export interface MarkerSet {
  /** 시크릿 값. */
  secret: string;
  /** 합성 진단 입력 문장. */
  diagnosis: string;
  /** 합성 상담 연락처(하이픈 없는 표기). lib/consult/phone.ts의 국내 휴대폰 형식을 따른다. */
  phone: string;
  /** 같은 연락처의 하이픈 표기. */
  phoneHyphen: string;
  /** 합성 상담 이름(20자 이하, lib/consult/schema.ts의 이름 칸 한도). */
  name: string;
  /** 합성 담당자·서명자 이름. */
  ownerName: string;
  /** 합성 담당자·서명자 연락처. */
  ownerContact: string;
  /** 합성 법적 판단 문구. */
  legal: string;
}

export interface MarkerString {
  label: keyof MarkerSet;
  value: string;
}

const hex = (bytes: number): string => randomBytes(bytes).toString("hex");
const digits = (count: number): string =>
  Array.from({ length: count }, () => String(randomInt(10))).join("");

export function createMarkerSet(): MarkerSet {
  const phone = `010${digits(8)}`;
  return {
    secret: `marker-secret-${hex(12)}`,
    diagnosis: `marker-diagnosis-${hex(8)}`,
    phone,
    phoneHyphen: `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`,
    name: `mkn-${hex(6)}`,
    ownerName: `marker-owner-${hex(8)}`,
    ownerContact: `marker-contact-${hex(8)}`,
    legal: `marker-legal-${hex(8)}`,
  };
}

/** 검색 대상 문자열 전부. 연락처는 하이픈 표기와 하이픈 없는 표기를 따로 찾는다. */
export function markerStrings(set: MarkerSet): MarkerString[] {
  return (Object.keys(set) as Array<keyof MarkerSet>).map((label) => ({
    label,
    value: set[label],
  }));
}

/**
 * 표지값 한 세트를 만든다. 어느 값이든 `isPresent`가 이미 있다고 답하면 세트를 통째로 버리고 다시 만든다.
 * 끝까지 없는 세트를 얻지 못하면 값을 적지 않은 오류를 던진다.
 */
export function generateMarkerSet(
  isPresent: (value: string) => boolean,
  maxAttempts = 20
): MarkerSet {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const set = createMarkerSet();
    if (markerStrings(set).every((marker) => !isPresent(marker.value))) return set;
  }
  throw new Error(`표지값을 ${maxAttempts}번 만들었으나 모두 저장소에 이미 있는 값과 겹쳤다`);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

/** `grep -rnF`에 해당하는 폴더 검색. 찾은 것은 `상대 경로:라벨`로만 돌려주고 값은 돌려주지 않는다. */
export function findMarkersInDirectory(dir: string, strings: readonly MarkerString[]): string[] {
  const found: string[] = [];
  for (const file of listFiles(dir)) {
    const content = readFileSync(file, "utf-8");
    const relative = path.relative(dir, file).split(path.sep).join("/");
    for (const marker of strings) {
      if (content.includes(marker.value)) found.push(`${relative}:${marker.label}`);
    }
  }
  return found;
}

function git(root: string, args: string[]) {
  return spawnSync("git", args, { cwd: root, encoding: "utf-8" });
}

/** `git grep -qF --untracked`: 추적 파일과 무시되지 않는 미추적 파일에 값이 있으면 true. */
export function gitGrepHasMatch(root: string, value: string): boolean {
  const result = git(root, ["grep", "-qF", "--untracked", "-e", value]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git grep 실행 실패(종료 코드 ${result.status})`);
}

/** `git grep -lF --untracked`: 값 중 하나라도 든 파일 경로 목록(내용은 돌려주지 않는다). */
export function gitGrepFiles(root: string, values: readonly string[]): string[] {
  const result = git(root, ["grep", "-lF", "--untracked", ...values.flatMap((v) => ["-e", v])]);
  if (result.status === 1) return [];
  if (result.status !== 0) throw new Error(`git grep 실행 실패(종료 코드 ${result.status})`);
  return result.stdout.split("\n").filter((line) => line !== "");
}

/**
 * 표지값을 담은 기록 파일의 위치로 인정할 수 있는가: 저장소 밖이거나, 저장소 안이라면 추적되지 않고 `.gitignore`가
 * 무시하는 경로여야 한다. 무시되지 않는 미추적 파일은 실수로 추적될 수 있어 위치로 인정하지 않는다.
 */
export function isAcceptableMarkerLocation(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return true;

  const tracked = git(root, ["ls-files", "--error-unmatch", "--", relative]);
  if (tracked.status === 0) return false;
  return git(root, ["check-ignore", "-q", "--", relative]).status === 0;
}
