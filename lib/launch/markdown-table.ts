// SPEC-B2C-LAUNCH-001 M1b: 마크다운 표 읽기 보조.
// 항목 정의표와 go/no-go 기록 표가 같은 방식으로 헤더 줄을 찾고 본문 행을 자른다
// (단계 표 파서 lib/launch/stage-table.ts와 같은 규칙이다).

import { splitCells } from "./stage-table";

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
