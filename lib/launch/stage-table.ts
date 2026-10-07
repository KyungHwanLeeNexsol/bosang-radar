// SPEC-B2C-LAUNCH-001 M1a: 출시 게이트 단계 표 파서.
// spec.md §2.4와 런북(.moai/docs/launch-gate-runbook.md)의 단계 표가 같은 규칙을 지키는지 읽어 낸다.

/** 단계 표가 정확히 한 번씩 담아야 하는 세 단계. 표에 나오는 순서와 무관하게 이름으로만 대조한다. */
export const STAGE_NAMES = ["배포 완료(dark)", "내부 시험 공개", "일반 사용자 공개"] as const;

// acceptance.md AC-B2CLAUNCH-001 (2)에 적힌 정규식 그대로다(시험이 두 문서의 일치를 확인한다).
export const STAGE_VECTOR_PATTERN =
  /^(진단 게이트: (닫힘|열림), 상담 화면: (닫힘|열림), 상담 접수: (닫힘|열림)|D-LAUNCH-03 Q[12] 집합)$/;

/** 단계 표의 열. 헤더 줄과 같은 순서이며 오류 메시지의 칸 이름으로도 쓴다. */
const COLUMNS = [
  { key: "stage", label: "단계" },
  { key: "definition", label: "정의" },
  { key: "vector", label: "게이트 상태 벡터" },
  { key: "target", label: "도달 대상" },
  { key: "verdict", label: "판정" },
] as const;

export type StageRow = Record<(typeof COLUMNS)[number]["key"], string>;

export type StageTableResult = { ok: true; rows: StageRow[] } | { ok: false; errors: string[] };

const HEADER_LABELS = COLUMNS.map((column) => column.label);

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** 헤더 줄 다음의 구분선을 건너뛴 본문 행 줄들. 헤더가 없으면 null. */
function findBodyLines(lines: string[]): string[] | null {
  const start = lines.findIndex((line) => {
    const cells = splitCells(line);
    return (
      line.trim().startsWith("|") &&
      cells.length === HEADER_LABELS.length &&
      cells.every((cell, i) => cell === HEADER_LABELS[i])
    );
  });
  if (start === -1) return null;

  const body: string[] = [];
  for (let i = start + 2; i < lines.length && lines[i].trim().startsWith("|"); i += 1) {
    body.push(lines[i]);
  }
  return body;
}

export function parseStageTable(markdown: string): StageTableResult {
  const body = findBodyLines(markdown.replace(/\r\n/g, "\n").split("\n"));
  if (body === null) {
    return { ok: false, errors: [`단계 표(헤더: ${HEADER_LABELS.join("·")})를 찾지 못했다`] };
  }

  const errors: string[] = [];
  const rows: StageRow[] = [];
  const seen = new Map<string, number>();

  for (const line of body) {
    const cells = splitCells(line);
    const name = cells[0];
    seen.set(name, (seen.get(name) ?? 0) + 1);

    if (cells.length !== COLUMNS.length) {
      errors.push(`"${name}" 행의 칸이 ${cells.length}개다(${COLUMNS.length}개여야 한다)`);
      continue;
    }

    const row = Object.fromEntries(COLUMNS.map((column, i) => [column.key, cells[i]])) as StageRow;
    rows.push(row);

    for (const column of COLUMNS) {
      if (row[column.key] === "") errors.push(`"${name}" 행의 "${column.label}" 칸이 비어 있다`);
    }
    if (row.vector !== "" && !STAGE_VECTOR_PATTERN.test(row.vector)) {
      errors.push(`"${name}" 행의 "게이트 상태 벡터" 칸이 정규식과 맞지 않는다: "${row.vector}"`);
    }
  }

  const defined: readonly string[] = STAGE_NAMES;
  for (const [name, count] of seen) {
    if (!defined.includes(name)) errors.push(`정의되지 않은 단계 행 "${name}"가 있다`);
    else if (count > 1) errors.push(`"${name}" 단계 행이 ${count}번 나온다`);
  }
  for (const name of STAGE_NAMES) {
    if (!seen.has(name)) errors.push(`"${name}" 단계 행이 없다`);
  }

  return errors.length === 0 ? { ok: true, rows } : { ok: false, errors };
}
