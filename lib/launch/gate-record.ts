// SPEC-B2C-LAUNCH-001 M1b: go/no-go 기록 모델과 파서.
// D-LAUNCH-04가 기록 형식을 마크다운 문서로 정했다. 기록 파일의 위치는 정하지 않았으므로 이 모듈은
// 위치를 상수로 갖지 않고 마크다운 문자열만 읽는다(파일 경로는 호출하는 쪽의 입력이다).

import { findTableBody } from "./markdown-table";
import { splitCells } from "./stage-table";

/** 항목의 기록 상태. 빈 값과 이 셋 밖의 값은 허용되지 않는다(REQ-B2CLAUNCH-003). */
export const ITEM_STATUSES = ["READY", "BLOCKED", "UNVERIFIED"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/**
 * 점검 출력에만 나타나는 표지다. 항목의 기록 상태도 표의 I·G 칸 값도 아니며(spec.md §2.4 "실행 환경"),
 * 기록의 상태 칸에 있으면 열거 밖 값으로 거부한다.
 */
export const OUTPUT_ONLY_MARKER = "해당 없음(local)";

/** 기록 표의 열. spec.md §2.4 "항목 기록 필드"의 순서이고 런북 "기록 양식" 절과 같다. */
export const RECORD_COLUMNS = [
  "식별자",
  "증명하는 것",
  "산출물 보관 위치",
  "서명 또는 관측 역할",
  "날짜",
  "대상",
  "무효화 사건",
  "상태",
] as const;

export interface RecordItem {
  id: string;
  proves: string;
  location: string;
  role: string;
  date: string;
  /** 관측 시점에 기록한 대상 값(코드·환경·결정 기록·형제 기록 중 항목이 증명하는 것의 값). */
  target: string;
  /** 이 항목에 적힌 무효화 사건 종류(EV-L1~EV-L5). */
  events: readonly string[];
  status: ItemStatus;
}

export type GateRecordResult = { ok: true; items: RecordItem[] } | { ok: false; errors: string[] };

const EVENT_PATTERN = /^EV-L[1-5]$/;

function isItemStatus(value: string): value is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value);
}

/** READY 정의(spec.md §2.4)가 요구하는 칸: 보관 위치·역할·날짜·대상, 그리고 사건이 적혀야 무효화를 따질 수 있다. */
const READY_REQUIRED: ReadonlyArray<{ label: (typeof RECORD_COLUMNS)[number]; index: number }> = [
  { label: "산출물 보관 위치", index: 2 },
  { label: "서명 또는 관측 역할", index: 3 },
  { label: "날짜", index: 4 },
  { label: "대상", index: 5 },
  { label: "무효화 사건", index: 6 },
];

export function parseGateRecord(markdown: string): GateRecordResult {
  const body = findTableBody(markdown.replace(/\r\n/g, "\n").split("\n"), RECORD_COLUMNS);
  if (body === null) {
    return { ok: false, errors: [`기록 표(헤더: ${RECORD_COLUMNS.join("·")})를 찾지 못했다`] };
  }

  const errors: string[] = [];
  const items: RecordItem[] = [];
  const seen = new Map<string, number>();

  for (const line of body) {
    const cells = splitCells(line);
    const id = cells[0];

    if (id === "") {
      errors.push("식별자 칸이 비어 있는 행이 있다");
      continue;
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);

    if (cells.length !== RECORD_COLUMNS.length) {
      errors.push(
        `"${id}" 항목 행의 칸이 ${cells.length}개다(${RECORD_COLUMNS.length}개여야 한다)`
      );
      continue;
    }
    if (cells.slice(1).every((cell) => cell === "")) {
      errors.push(`"${id}" 항목은 식별자만 있고 나머지 칸이 모두 비어 있다`);
      continue;
    }

    const [, proves, location, role, date, target, eventsCell, status] = cells;

    if (status === "") {
      errors.push(`"${id}" 항목의 "상태" 칸이 비어 있다`);
      continue;
    }
    if (status === OUTPUT_ONLY_MARKER) {
      errors.push(
        `"${id}" 항목의 상태 칸에 ${OUTPUT_ONLY_MARKER}가 있다 — 점검 출력에만 나타나는 출력 전용 표지이며 기록 상태가 아니다`
      );
      continue;
    }
    if (!isItemStatus(status)) {
      errors.push(`"${id}" 항목의 상태 "${status}"는 ${ITEM_STATUSES.join("·")} 중 하나가 아니다`);
      continue;
    }

    const events = eventsCell
      .split(",")
      .map((event) => event.trim())
      .filter((event) => event !== "");
    const badEvent = events.find((event) => !EVENT_PATTERN.test(event));
    let rowOk = true;
    if (badEvent !== undefined) {
      errors.push(`"${id}" 항목의 무효화 사건 "${badEvent}"는 EV-L1~EV-L5 형태가 아니다`);
      rowOk = false;
    }
    if (status === "READY") {
      for (const { label, index } of READY_REQUIRED) {
        if (cells[index] === "") {
          errors.push(`"${id}" 항목은 READY인데 "${label}" 칸이 비어 있다`);
          rowOk = false;
        }
      }
    }
    if (rowOk) items.push({ id, proves, location, role, date, target, events, status });
  }

  for (const [id, count] of seen) {
    if (count > 1) errors.push(`"${id}" 항목이 기록에 ${count}번 나온다`);
  }

  return errors.length === 0 ? { ok: true, items } : { ok: false, errors };
}
