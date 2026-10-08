// SPEC-B2C-LAUNCH-001 M5 (REQ-B2CLAUNCH-016, AC-B2CLAUNCH-016) — 사후 관측 기록 검사.
//
// 사후 관측 기록은 관측 수단 하나마다 한 행이고, 그 행이 관측 대상·담당 역할·기록 위치·관측 수단·기존/신규 구분·
// 관측 시점을 적는다. 신규 수단은 도입하는 SPEC 식별자나 BLOCKED 사유도 적어야 한다. 검사는 칸이 찼는지와 구분
// 어휘만 본다 — 대상·역할·위치·시점의 어휘와 표기는 D-LAUNCH-08 결정 기록이 정하며 이 검사는 정하지 않는다.
// 출력은 행 번호와 칸 이름(고정 어휘)으로만 적고 칸의 값은 되풀이하지 않는다. 값이 시크릿·연락처·개인 정보가
// 아니어야 한다는 REQ-B2CLAUNCH-007을 검사 출력에서도 지키기 위해서다.
//
// 이 검사로는 "기존"으로 적힌 수단이 저장소에 실제로 있는지, 관측이 실제로 수행됐는지, 기존·신규 구분이 사실인지,
// 칸의 값이 주소나 연락처가 아닌지를 알 수 없다(열람으로 확인한다).

import { findTableWithExtras } from "./markdown-table";
import { splitCells } from "./stage-table";

/** 기록 표의 열. 런북 `## 사후 관측 기록 양식` 절과 같다. */
export const OBSERVATION_COLUMNS = [
  "관측 대상",
  "담당 역할",
  "기록 위치",
  "관측 수단",
  "구분",
  "도입 SPEC 또는 BLOCKED 사유",
  "관측 시점",
] as const;

export const MEANS_KINDS = ["기존", "신규"] as const;
export type MeansKind = (typeof MEANS_KINDS)[number];

export interface ObservationRow {
  target: string;
  role: string;
  location: string;
  means: string;
  kind: MeansKind;
  /** 신규 수단을 도입하는 SPEC 식별자 또는 BLOCKED 사유(기존 수단이면 비어 있어도 된다). */
  introducedBy: string;
  timing: string;
}

export type ObservationRecordResult =
  { ok: true; rows: ObservationRow[] } | { ok: false; errors: string[] };

type Column = (typeof OBSERVATION_COLUMNS)[number];

const COLUMN = Object.fromEntries(
  OBSERVATION_COLUMNS.map((label, index) => [label, index])
) as Record<Column, number>;

/** 모든 행에서 비어 있으면 안 되는 칸. */
const ALWAYS_REQUIRED: readonly Column[] = [
  "관측 대상",
  "담당 역할",
  "기록 위치",
  "관측 수단",
  "구분",
  "관측 시점",
];

function isMeansKind(value: string): value is MeansKind {
  return (MEANS_KINDS as readonly string[]).includes(value);
}

export function parseObservationRecord(markdown: string): ObservationRecordResult {
  const table = findTableWithExtras(
    markdown.replace(/\r\n/g, "\n").split("\n"),
    OBSERVATION_COLUMNS
  );
  if (table === null) {
    return {
      ok: false,
      errors: [`관측 기록 표(헤더: ${OBSERVATION_COLUMNS.join("·")})를 찾지 못했다`],
    };
  }

  // 담당자 연락처 같은 칸을 포함해 허용된 칸 밖의 칸은 모두 거부한다. 칸 이름도 되풀이하지 않는다.
  if (table.extras.length > 0) {
    return {
      ok: false,
      errors: [
        `허용된 칸 밖의 칸이 ${table.extras.length}개 있다 — 관측 기록이 담는 칸은 ${OBSERVATION_COLUMNS.join("·")}뿐이다`,
      ],
    };
  }

  if (table.body.length === 0) {
    return { ok: false, errors: ["관측 기록 표에 행이 없다"] };
  }

  const errors: string[] = [];
  const rows: ObservationRow[] = [];

  table.body.forEach((line, index) => {
    const cells = splitCells(line);
    const where = `${index + 1}번째 행`;

    if (cells.length !== table.width) {
      errors.push(`${where}의 칸이 ${cells.length}개다(${table.width}개여야 한다)`);
      return;
    }

    const cell = (label: Column) => cells[COLUMN[label]];
    const rowErrors: string[] = [];

    for (const column of ALWAYS_REQUIRED) {
      if (cell(column) === "") rowErrors.push(`${where}의 "${column}" 칸이 비어 있다`);
    }

    const kind = cell("구분");
    if (kind !== "" && !isMeansKind(kind)) {
      rowErrors.push(`${where}의 "구분" 칸이 ${MEANS_KINDS.join("·")} 중 하나가 아니다`);
    }
    if (kind === "신규" && cell("도입 SPEC 또는 BLOCKED 사유") === "") {
      rowErrors.push(
        `${where}의 "도입 SPEC 또는 BLOCKED 사유" 칸이 비어 있다 — 신규 수단은 도입하는 SPEC 식별자나 BLOCKED 사유가 필요하다`
      );
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    rows.push({
      target: cell("관측 대상"),
      role: cell("담당 역할"),
      location: cell("기록 위치"),
      means: cell("관측 수단"),
      kind: kind as MeansKind,
      introducedBy: cell("도입 SPEC 또는 BLOCKED 사유"),
      timing: cell("관측 시점"),
    });
  });

  return errors.length === 0 ? { ok: true, rows } : { ok: false, errors };
}
