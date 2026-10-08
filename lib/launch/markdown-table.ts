// SPEC-B2C-LAUNCH-001 M1b: 마크다운 표 읽기 보조.
// 항목 정의표와 go/no-go 기록 표가 같은 방식으로 헤더 줄을 찾고 본문 행을 자른다
// (단계 표 파서 lib/launch/stage-table.ts와 같은 규칙이다).

import { splitCells } from "./stage-table";

// @MX:ANCHOR: [AUTO] 헤더 칸이 `labels`로 시작하는 표를 찾아 덧붙은 칸(extras)·헤더 폭(width)·본문 행(body)을 돌려준다(없으면 null) — 덧붙은 칸을 허용할지는 부르는 쪽이 정한다
// @MX:REASON: 호출 지점 6곳(호출 함수 6개·파일 6개: exposure-record·legal-confirmation·observation-record·procedure-steps·sibling-reference·transition-list)이 쓴다. 시험 파일은 부르지 않는다. 반환 모양과 "labels로 시작하면 일치" 규칙이 바뀌면 이 여섯 파서의 표 탐지가 함께 달라진다.
// @MX:SPEC: SPEC-B2C-LAUNCH-001
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

// @MX:ANCHOR: [AUTO] 헤더 칸이 `labels`와 칸 수·내용까지 정확히 같은 표의 본문 행들을 돌려준다(구분선 줄은 건너뛰고, 헤더가 없으면 null)
// @MX:REASON: 비시험 호출 지점 6곳(호출 함수 5개·파일 5개: gate-record·gate-state-table·item-table·sibling-reference·signature — signature는 한 함수에서 두 번 부른다)이 쓴다. 시험 파일 1개(2곳)는 세지 않았다. "정확히 같을 때만 일치" 규칙이 바뀌면 이 다섯 파서의 표 탐지가 함께 달라진다.
// @MX:SPEC: SPEC-B2C-LAUNCH-001
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
