// SPEC-B2C-LAUNCH-001 M1b: 마크다운 표 읽기 보조.
// 항목 정의표와 go/no-go 기록 표가 같은 방식으로 헤더 줄을 찾고 본문 행을 자른다
// (단계 표 파서 lib/launch/stage-table.ts와 같은 규칙이다).

import { splitCells } from "./stage-table";

/**
 * 헤더 줄이 `labels`로 시작하면 찾는다. 그 뒤에 덧붙은 칸(extras)이 있어도 찾아서 돌려주며,
 * 덧붙은 칸을 허용할지는 부르는 쪽이 정한다(허용되지 않는 칸을 표 없음이 아니라 칸 오류로 거부하기 위해서다).
 */
export function findTableWithExtras(
  lines: string[],
  labels: readonly string[]
): { extras: string[]; width: number; body: string[] } | null {
  const start = lines.findIndex((line) => {
    const cells = splitCells(line);
    return (
      line.trim().startsWith("|") &&
      cells.length >= labels.length &&
      labels.every((label, i) => cells[i] === label)
    );
  });
  if (start === -1) return null;

  const header = splitCells(lines[start]);
  const body: string[] = [];
  for (let i = start + 2; i < lines.length && lines[i].trim().startsWith("|"); i += 1) {
    body.push(lines[i]);
  }
  return { extras: header.slice(labels.length), width: header.length, body };
}

/** 헤더 줄 다음의 구분선을 건너뛴 본문 행 줄들. 헤더가 없으면 null. */
export function findTableBody(lines: string[], labels: readonly string[]): string[] | null {
  const start = lines.findIndex((line) => {
    const cells = splitCells(line);
    return (
      line.trim().startsWith("|") &&
      cells.length === labels.length &&
      cells.every((cell, i) => cell === labels[i])
    );
  });
  if (start === -1) return null;

  const body: string[] = [];
  for (let i = start + 2; i < lines.length && lines[i].trim().startsWith("|"); i += 1) {
    body.push(lines[i]);
  }
  return body;
}
