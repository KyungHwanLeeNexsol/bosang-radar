import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { STAGE_NAMES, STAGE_VECTOR_PATTERN, parseStageTable } from "./stage-table";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC_DIR = join(REPO_ROOT, ".moai", "specs", "SPEC-B2C-LAUNCH-001");
const SPEC_PATH = join(SPEC_DIR, "spec.md");
const ACCEPTANCE_PATH = join(SPEC_DIR, "acceptance.md");
const RUNBOOK_PATH = join(REPO_ROOT, ".moai", "docs", "launch-gate-runbook.md");

const HEADER = "| 단계 | 정의 | 게이트 상태 벡터 | 도달 대상 | 판정 |";
const SEPARATOR = "|---|---|---|---|---|";

const DARK =
  "| 배포 완료(dark) | 정의 가 | 진단 게이트: 닫힘, 상담 화면: 닫힘, 상담 접수: 닫힘 | 대상 가 | 판정 가 |";
const INTERNAL = "| 내부 시험 공개 | 정의 나 | D-LAUNCH-03 Q2 집합 | 대상 나 | 판정 나 |";
const GENERAL = "| 일반 사용자 공개 | 정의 다 | D-LAUNCH-03 Q1 집합 | 대상 다 | 판정 다 |";

function table(...rows: string[]): string {
  return ["앞 문단", "", HEADER, SEPARATOR, ...rows, "", "뒤 문단"].join("\n");
}

function errorsOf(markdown: string): string[] {
  const result = parseStageTable(markdown);
  if (result.ok) throw new Error("오류가 있어야 하는 표가 통과했다");
  return result.errors;
}

function readText(path: string): string {
  return readFileSync(path, "utf-8").replace(/\r\n/g, "\n");
}

/** 헤더 줄로 시작하는 표의 본문 행 줄들을 그대로 돌려준다. */
function tableLines(markdown: string, header: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === header);
  expect(start, `헤더를 찾지 못했다: ${header}`).toBeGreaterThanOrEqual(0);
  const body: string[] = [];
  for (let i = start + 2; i < lines.length && lines[i].trim().startsWith("|"); i += 1) {
    body.push(lines[i]);
  }
  return body;
}

describe("parseStageTable — 정상 표", () => {
  it("세 단계가 한 행씩 있고 다섯 칸이 모두 차 있으면 행을 단계 순서대로 돌려준다", () => {
    const result = parseStageTable(table(DARK, INTERNAL, GENERAL));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((row) => row.stage)).toEqual([...STAGE_NAMES]);
    expect(result.rows[0]).toEqual({
      stage: "배포 완료(dark)",
      definition: "정의 가",
      vector: "진단 게이트: 닫힘, 상담 화면: 닫힘, 상담 접수: 닫힘",
      target: "대상 가",
      verdict: "판정 가",
    });
  });

  it("행 순서가 바뀌어도 단계 이름이 맞으면 통과한다", () => {
    expect(parseStageTable(table(GENERAL, DARK, INTERNAL)).ok).toBe(true);
  });

  it("고정 벡터는 표면 이름과 닫힘/열림만 허용하고 열림 조합도 통과한다", () => {
    const open = DARK.replace("진단 게이트: 닫힘", "진단 게이트: 열림");

    expect(parseStageTable(table(open, INTERNAL, GENERAL)).ok).toBe(true);
  });

  it("CRLF 줄바꿈으로 읽어도 같은 결과를 낸다", () => {
    expect(parseStageTable(table(DARK, INTERNAL, GENERAL).replace(/\n/g, "\r\n")).ok).toBe(true);
  });
});

describe("parseStageTable — 음성 fixture(오류가 단계와 칸을 이름으로 가리킨다)", () => {
  it("비어 있는 칸은 단계와 칸 이름을 적은 오류가 된다", () => {
    const empty = INTERNAL.replace("| 대상 나 |", "|   |");

    const errors = errorsOf(table(DARK, empty, GENERAL));

    expect(errors).toEqual(['"내부 시험 공개" 행의 "도달 대상" 칸이 비어 있다']);
  });

  it("벡터 칸이 정규식과 맞지 않으면 단계와 벡터 칸을 적은 오류가 된다", () => {
    const bad = GENERAL.replace("D-LAUNCH-03 Q1 집합", "상담 화면만 열림");

    const errors = errorsOf(table(DARK, INTERNAL, bad));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"일반 사용자 공개" 행의 "게이트 상태 벡터" 칸');
    expect(errors[0]).toContain("상담 화면만 열림");
  });

  it("벡터 칸의 표면 값이 닫힘/열림 밖이거나 참조 토큰 뒤에 서술이 붙으면 거부한다", () => {
    const wrongValue = DARK.replace("상담 접수: 닫힘", "상담 접수: 503");
    const trailingProse = INTERNAL.replace(
      "D-LAUNCH-03 Q2 집합",
      "D-LAUNCH-03 Q2 집합 (참여자 한정)"
    );

    expect(errorsOf(table(wrongValue, INTERNAL, GENERAL))[0]).toContain(
      '"배포 완료(dark)" 행의 "게이트 상태 벡터" 칸'
    );
    expect(errorsOf(table(DARK, trailingProse, GENERAL))[0]).toContain(
      '"내부 시험 공개" 행의 "게이트 상태 벡터" 칸'
    );
  });

  it("단계 행이 빠지면 빠진 단계 이름을 적은 오류가 된다", () => {
    const errors = errorsOf(table(DARK, INTERNAL));

    expect(errors).toEqual(['"일반 사용자 공개" 단계 행이 없다']);
  });

  it("정의된 세 단계 밖의 행이 더 있으면 그 이름을 적은 오류가 된다", () => {
    const extra =
      "| 시범 공개 | 정의 | 진단 게이트: 열림, 상담 화면: 닫힘, 상담 접수: 닫힘 | 대상 | 판정 |";

    const errors = errorsOf(table(DARK, INTERNAL, GENERAL, extra));

    expect(errors).toEqual(['정의되지 않은 단계 행 "시범 공개"가 있다']);
  });

  it("같은 단계 이름이 두 번 나오면 중복으로 거부한다", () => {
    const errors = errorsOf(table(DARK, INTERNAL, GENERAL, INTERNAL));

    expect(errors).toEqual(['"내부 시험 공개" 단계 행이 2번 나온다']);
  });

  it("칸 수가 다섯이 아닌 행은 그 행의 단계 이름과 칸 수를 적은 오류가 된다", () => {
    const short = "| 일반 사용자 공개 | 정의 다 | D-LAUNCH-03 Q1 집합 | 대상 다 |";

    const errors = errorsOf(table(DARK, INTERNAL, short));

    expect(errors[0]).toContain('"일반 사용자 공개" 행');
    expect(errors[0]).toContain("5");
    expect(errors[0]).toContain("4");
  });

  it("단계 표 헤더가 없는 문서는 표가 없다는 오류가 된다", () => {
    expect(errorsOf("# 제목\n\n표가 없는 문서")).toEqual([
      "단계 표(헤더: 단계·정의·게이트 상태 벡터·도달 대상·판정)를 찾지 못했다",
    ]);
  });

  it("한 표에서 여러 문제가 겹치면 오류를 모두 모아 돌려준다", () => {
    const empty = DARK.replace("| 판정 가 |", "|  |");
    const bad = GENERAL.replace("D-LAUNCH-03 Q1 집합", "열림");

    const errors = errorsOf(table(empty, bad));

    expect(errors).toEqual([
      '"배포 완료(dark)" 행의 "판정" 칸이 비어 있다',
      '"일반 사용자 공개" 행의 "게이트 상태 벡터" 칸이 정규식과 맞지 않는다: "열림"',
      '"내부 시험 공개" 단계 행이 없다',
    ]);
  });
});

describe("실제 문서의 단계 표", () => {
  it("spec.md §2.4 단계 표가 같은 파서를 통과한다(AC-B2CLAUNCH-001 (5))", () => {
    const result = parseStageTable(readText(SPEC_PATH));

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((row) => row.stage)).toEqual([...STAGE_NAMES]);
  });

  it("런북의 단계 표가 파서를 통과한다(AC-B2CLAUNCH-001 (1)(2))", () => {
    const result = parseStageTable(readText(RUNBOOK_PATH));

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((row) => row.stage)).toEqual([...STAGE_NAMES]);
  });

  it("런북 단계 표의 내용은 spec.md §2.4 표와 한 글자도 다르지 않다", () => {
    const header = HEADER;

    expect(tableLines(readText(RUNBOOK_PATH), header)).toEqual(
      tableLines(readText(SPEC_PATH), header)
    );
  });

  it("벡터 정규식은 acceptance.md AC-B2CLAUNCH-001 (2)에 적힌 정규식과 같다", () => {
    const acceptance = readText(ACCEPTANCE_PATH);
    const found = acceptance.match(/정규식 `(\^\(진단 게이트:[^`]+\$)`에 일치/);

    expect(found, "acceptance.md에서 벡터 정규식을 찾지 못했다").not.toBeNull();
    expect(STAGE_VECTOR_PATTERN.source).toBe(new RegExp(found![1]).source);
  });
});

describe("런북 문장 — AC-B2CLAUNCH-001 (3)(4)와 AC-B2CLAUNCH-003 Definition of Done", () => {
  const runbook = readText(RUNBOOK_PATH);

  it("(3) 배포 완료가 어느 공개 단계의 판정도 충족하지 않는다고 적는다", () => {
    expect(runbook).toContain("배포 완료는 어느 공개 단계의 판정도 충족하지 않는다");
  });

  it("(4) 단계는 운영 호스트의 상태이고 로컬 시험은 단계가 아니라고 적는다", () => {
    expect(runbook).toContain(
      "단계는 운영 호스트의 상태이고 참여자의 로컬 시험은 단계가 아니라 별도의 로컬 시험 판정이며 운영 호스트의 게이트 상태 벡터를 바꾸지 않는다"
    );
    expect(runbook).toContain("내부 시험 공개와 일반 사용자 공개는 운영 호스트에서만 성립한다");
  });

  it("(4) 로컬 시험 판정 절이 시작 조건 다섯 가지와 I 서명 규칙과 운영 한정 항목 규칙을 적는다", () => {
    const section = sectionOf(runbook, "로컬 시험 판정");

    expect(section).toContain("시작 조건");
    for (const n of [1, 2, 3, 4, 5]) expect(section).toMatch(new RegExp(`^${n}\\. `, "m"));
    expect(section).not.toMatch(/^6\. /m);
    expect(section).toContain("I 서명");
    expect(section).toContain("L-01·L-05·R-04");
    expect(section).toContain("`local`에서는 적용하지 않고");
    expect(section).toContain("`production`에서는 계속 필수");
  });

  it("(4) 점검 요청의 두 형태 절이 두 형태와 거부하는 조합을 적는다", () => {
    const section = sectionOf(runbook, "점검 요청의 두 형태");

    expect(section).toContain("운영 단계 점검");
    expect(section).toContain("`production` + 목적 단계 `I` 또는 `G`");
    expect(section).toContain("로컬 시험 판정");
    expect(section).toContain("`local` + 목적 단계 입력 없음");
    expect(section).toContain("`local` + 목적 단계 `I`");
    expect(section).toContain("`local` + 목적 단계 `G`");
    expect(section).toContain("`production` + 목적 단계가 없거나");
    expect(section).toContain("실행 환경 입력이 없거나");
  });

  it("항목 정의표는 spec.md §2.4의 열네 행과 한 글자도 다르지 않다", () => {
    const header = "| ID | 항목 | 표면 | I | G | 근거 | 대상 / 무효화 사건 |";
    const runbookRows = tableLines(runbook, header);

    expect(runbookRows).toEqual(tableLines(readText(SPEC_PATH), header));
    expect(runbookRows.map((row) => row.split("|")[1].trim())).toEqual([
      "L-01",
      "L-02",
      "L-03",
      "L-04",
      "L-05",
      "L-06",
      "L-07",
      "L-08",
      "L-09",
      "R-01",
      "R-02",
      "R-03",
      "R-04",
      "R-05",
    ]);
  });

  it("Definition of Done이 go/no-go 기록의 결과는 완료 조건이 아니라고 적는다", () => {
    expect(runbook).toContain("go/no-go 기록의 결과(go 또는 no-go)는 이 SPEC의 완료 조건이 아니다");
  });

  it("기록·서명·연락처·값·URL 같은 운영 기록을 담지 않는다", () => {
    expect(runbook).not.toMatch(/https?:\/\//);
    expect(runbook).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});

/** `## ` 또는 `### ` 제목이 `title`로 시작하는 절의 본문을 다음 같은 수준 이상의 제목 앞까지 돌려준다. */
function sectionOf(markdown: string, title: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex(
    (line) => /^#{2,3} /.test(line) && line.replace(/^#+ /, "").startsWith(title)
  );
  expect(start, `절 제목을 찾지 못했다: ${title}`).toBeGreaterThanOrEqual(0);
  const level = lines[start].match(/^#+/)![0].length;
  const end = lines.findIndex(
    (line, i) => i > start && /^#{1,3} /.test(line) && line.match(/^#+/)![0].length <= level
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}
