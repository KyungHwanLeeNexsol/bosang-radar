// SPEC-B2C-LAUNCH-001 M1b: 증거 항목 정의표 파서.
// spec.md §2.4와 런북(.moai/docs/launch-gate-runbook.md)의 항목 정의표가 같은 규칙을 지키는지 읽어 내고,
// 점검기가 쓸 수 있는 행 모델로 바꾼다. 표를 읽는 규칙은 AC-B2CLAUNCH-002 "검증" 칸이 적은 것이다.

import { findTableBody } from "./markdown-table";
import { splitCells } from "./stage-table";

/** 표면: S1 = 진단 화면, S2 = 상담 화면, S3 = 상담 접수 API (spec.md §2.4). */
export const SURFACES = ["S1", "S2", "S3"] as const;
export type Surface = (typeof SURFACES)[number];

/** I·G 칸이 가질 수 있는 값. `결정 대기`는 결정이 기록되기 전에는 `필수`와 같게 취급한다. */
export const CELL_VALUES = ["필수", "결정 대기", "해당 없음"] as const;
export type CellValue = (typeof CELL_VALUES)[number];

/** 표의 열. 헤더 줄과 같은 순서이며 오류 메시지의 칸 이름으로도 쓴다. */
const COLUMN_LABELS = ["ID", "항목", "표면", "I", "G", "근거", "대상 / 무효화 사건"] as const;

export interface ItemRow {
  id: string;
  item: string;
  /** `전체`는 항상 적용되고, 표면 목록은 목적 벡터가 그중 하나라도 열 때만 적용된다. */
  surfaces: "전체" | readonly Surface[];
  i: CellValue;
  g: CellValue;
  basis: string;
  /** 마지막 칸의 ` / ` 앞부분(항목이 증명하는 대상). */
  target: string;
  /** 마지막 칸의 ` / ` 뒷부분(무효화 사건 EV-Lx 목록). */
  events: readonly string[];
}

export type ItemTableResult = { ok: true; rows: ItemRow[] } | { ok: false; errors: string[] };

const SEPARATOR = " / ";

function isCellValue(value: string): value is CellValue {
  return (CELL_VALUES as readonly string[]).includes(value);
}

function parseSurfaces(cell: string): "전체" | Surface[] | null {
  if (cell === "전체") return "전체";
  const tokens = cell.split("·").map((token) => token.trim());
  const surfaces = tokens.filter((token): token is Surface =>
    (SURFACES as readonly string[]).includes(token)
  );
  return surfaces.length === tokens.length ? surfaces : null;
}

export function parseItemTable(markdown: string): ItemTableResult {
  const body = findTableBody(markdown.replace(/\r\n/g, "\n").split("\n"), COLUMN_LABELS);
  if (body === null) {
    return {
      ok: false,
      errors: [`항목 정의표(헤더: ${COLUMN_LABELS.join("·")})를 찾지 못했다`],
    };
  }

  const errors: string[] = [];
  const rows: ItemRow[] = [];
  const seen = new Map<string, number>();

  for (const line of body) {
    const cells = splitCells(line);
    const id = cells[0];

    if (id === "") {
      errors.push("식별자(ID) 칸이 비어 있는 행이 있다");
      continue;
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);

    if (cells.length !== COLUMN_LABELS.length) {
      errors.push(`"${id}" 행의 칸이 ${cells.length}개다(${COLUMN_LABELS.length}개여야 한다)`);
      continue;
    }

    let rowOk = true;
    COLUMN_LABELS.forEach((label, index) => {
      if (cells[index] === "") {
        errors.push(`"${id}" 행의 "${label}" 칸이 비어 있다`);
        rowOk = false;
      }
    });
    if (!rowOk) continue;

    const [, item, surfaceCell, i, g, basis, lastCell] = cells;

    const surfaces = parseSurfaces(surfaceCell);
    if (surfaces === null) {
      errors.push(`"${id}" 행의 "표면" 칸 값 "${surfaceCell}"은 전체도 S1·S2·S3의 ·연결도 아니다`);
      rowOk = false;
    }
    for (const [label, value] of [
      ["I", i],
      ["G", g],
    ] as const) {
      if (!isCellValue(value)) {
        errors.push(
          `"${id}" 행의 "${label}" 칸 값 "${value}"은 ${CELL_VALUES.join("·")} 중 하나가 아니다`
        );
        rowOk = false;
      }
    }
    const parts = lastCell.split(SEPARATOR);
    if (parts.length !== 2) {
      errors.push(
        `"${id}" 행의 "대상 / 무효화 사건" 칸의 ' / ' 구분자가 ${parts.length - 1}개다(정확히 1개여야 한다)`
      );
      rowOk = false;
    }
    if (!rowOk || surfaces === null) continue;

    rows.push({
      id,
      item,
      surfaces,
      i: i as CellValue,
      g: g as CellValue,
      basis,
      target: parts[0].trim(),
      events: parts[1]
        .split(",")
        .map((event) => event.trim())
        .filter((event) => event !== ""),
    });
  }

  for (const [id, count] of seen) {
    if (count > 1) errors.push(`"${id}" 항목 행이 ${count}번 나온다`);
  }

  return errors.length === 0 ? { ok: true, rows } : { ok: false, errors };
}

/** 표면 열 규칙: `전체`는 항상, 표면을 적은 항목은 목적 벡터가 그 표면 하나라도 열 때만 적용된다. */
export function appliesToVector(row: ItemRow, vector: readonly Surface[]): boolean {
  return row.surfaces === "전체" || row.surfaces.some((surface) => vector.includes(surface));
}

/**
 * 항목의 `대상` 칸에 백틱으로 적힌 덮는 파일 경로. 파일을 적지 않은 항목은 빈 목록이다.
 * 덮는 파일 목록을 새로 정하지 않고 표 칸에 이미 적힌 것만 읽는다.
 */
export function coveringFilesOf(row: ItemRow): string[] {
  const tokens = [...row.target.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  return tokens.filter((token) => /^[^\s"'=]+\.[A-Za-z0-9]+$/.test(token));
}
