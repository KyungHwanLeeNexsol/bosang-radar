// SPEC-B2C-LAUNCH-001 M3a: 노출 기록 검사 (REQ-B2CLAUNCH-009, AC-B2CLAUNCH-009 시나리오 1).
//
// 노출 기록은 도달 경로 다섯 종류마다 도달 대상·제한 수단·수단 위치(저장소 안/밖)를 적고, 제한이 없으면 그 상태를
// 수용한 역할과 날짜를 적는다. 제한 수단의 어휘는 D-LAUNCH-01이 정하므로 이 검사는 칸이 차 있는지만 본다
// (acceptance.md AC-B2CLAUNCH-009 선결). 출력은 빠진 경로와 칸을 고정 어휘의 이름으로만 적고 칸의 값은
// 되풀이하지 않는다 — 값이 연락처·주소가 아니어야 한다는 REQ-B2CLAUNCH-007을 검사 출력에서도 지키기 위해서다.

import { findTableWithExtras } from "./markdown-table";
import { splitCells } from "./stage-table";

/** 노출 기록이 모두 다뤄야 하는 도달 경로 다섯 종류(REQ-B2CLAUNCH-009). 마지막은 질의 둘을 묶은 경로다. */
export const EXPOSURE_PATHS = [
  "/",
  "/result",
  "/consult",
  "POST /api/consultations",
  "?devStep=·?devFixture=",
] as const;

/** 기록 표의 열. 런북 `## 노출 기록 양식` 절과 같다. */
export const EXPOSURE_COLUMNS = [
  "도달 경로",
  "도달 대상",
  "제한 수단",
  "수단 위치",
  "외부 관측 기록",
  "수용 역할",
  "수용 날짜",
] as const;

export const MEANS_LOCATIONS = ["저장소 안", "저장소 밖", "제한 없음"] as const;
export type MeansLocation = (typeof MEANS_LOCATIONS)[number];

export interface ExposureRow {
  path: (typeof EXPOSURE_PATHS)[number];
  audience: string;
  means: string;
  location: MeansLocation;
  /** 외부 관측 기록의 식별자(저장소 밖 제한 수단일 때). 주소·접속 정보가 아니다. */
  observation: string;
  acceptedBy: string;
  acceptedOn: string;
}

export type ExposureRecordResult =
  { ok: true; rows: ExposureRow[] } | { ok: false; errors: string[] };

const COLUMN = Object.fromEntries(EXPOSURE_COLUMNS.map((label, index) => [label, index])) as Record<
  (typeof EXPOSURE_COLUMNS)[number],
  number
>;

function isExposurePath(value: string): value is ExposureRow["path"] {
  return (EXPOSURE_PATHS as readonly string[]).includes(value);
}

function isMeansLocation(value: string): value is MeansLocation {
  return (MEANS_LOCATIONS as readonly string[]).includes(value);
}

export function parseExposureRecord(markdown: string): ExposureRecordResult {
  const table = findTableWithExtras(markdown.replace(/\r\n/g, "\n").split("\n"), EXPOSURE_COLUMNS);
  if (table === null) {
    return {
      ok: false,
      errors: [`노출 기록 표(헤더: ${EXPOSURE_COLUMNS.join("·")})를 찾지 못했다`],
    };
  }

  // 담당자 연락처 같은 칸을 포함해 허용된 칸 밖의 칸은 모두 거부한다.
  if (table.extras.length > 0) {
    return {
      ok: false,
      errors: table.extras.map(
        (extra) =>
          `"${extra}" 칸은 허용되지 않는다 — 노출 기록이 담는 칸은 ${EXPOSURE_COLUMNS.join("·")}뿐이다`
      ),
    };
  }

  const errors: string[] = [];
  const rows: ExposureRow[] = [];
  const seen = new Map<string, number>();

  table.body.forEach((line, index) => {
    const cells = splitCells(line);
    const where = `${index + 1}번째 행`;

    if (cells.length !== table.width) {
      errors.push(`${where}의 칸이 ${cells.length}개다(${table.width}개여야 한다)`);
      return;
    }

    // 경로 칸의 백틱 표기(`/result`, `?devStep=`·`?devFixture=`)는 같은 경로로 읽는다.
    const path = cells[COLUMN["도달 경로"]].replaceAll("`", "");
    if (!isExposurePath(path)) {
      errors.push(`${where}의 "도달 경로"가 다섯 경로 중 하나가 아니다`);
      return;
    }
    seen.set(path, (seen.get(path) ?? 0) + 1);

    const cell = (label: (typeof EXPOSURE_COLUMNS)[number]) => cells[COLUMN[label]];
    const label = `도달 경로 "${path}"`;
    const rowErrors: string[] = [];
    const requireFilled = (column: (typeof EXPOSURE_COLUMNS)[number], reason = "") => {
      if (cell(column) === "") rowErrors.push(`${label}의 "${column}" 칸이 비어 있다${reason}`);
    };

    requireFilled("도달 대상");
    const location = cell("수단 위치");
    if (location === "") {
      rowErrors.push(`${label}의 "수단 위치" 칸이 비어 있다`);
    } else if (!isMeansLocation(location)) {
      rowErrors.push(`${label}의 "수단 위치" 칸이 ${MEANS_LOCATIONS.join("·")} 중 하나가 아니다`);
    } else if (location === "제한 없음") {
      if (cell("제한 수단") !== "") {
        rowErrors.push(
          `${label}의 "제한 수단" 칸이 채워져 있다 — 제한이 없다고 적은 경로는 제한 수단을 담지 않는다`
        );
      }
      const reason = " — 제한이 없으면 수용한 역할과 날짜가 필요하다";
      requireFilled("수용 역할", reason);
      requireFilled("수용 날짜", reason);
    } else {
      requireFilled("제한 수단");
      if (location === "저장소 밖") {
        requireFilled(
          "외부 관측 기록",
          " — 저장소 밖 제한 수단은 외부 관측 기록 식별자가 필요하다"
        );
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    rows.push({
      path,
      audience: cell("도달 대상"),
      means: cell("제한 수단"),
      location: location as MeansLocation,
      observation: cell("외부 관측 기록"),
      acceptedBy: cell("수용 역할"),
      acceptedOn: cell("수용 날짜"),
    });
  });

  for (const [path, count] of seen) {
    if (count > 1) errors.push(`도달 경로 "${path}"가 ${count}번 나온다`);
  }
  for (const path of EXPOSURE_PATHS) {
    if (!seen.has(path)) errors.push(`도달 경로 "${path}" 행이 없다`);
  }

  return errors.length === 0 ? { ok: true, rows } : { ok: false, errors };
}
