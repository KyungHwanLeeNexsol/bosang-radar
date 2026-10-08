// SPEC-B2C-LAUNCH-001 M1c: 법무 확인 기록 검사 (REQ-B2CLAUNCH-006, AC-B2CLAUNCH-006).
//
// 확인 기록은 두 기록(문구 식별자·버전 또는 전송 필드 집합 식별자 등)이 서로 일치하는지 법무가 확인했다는
// 사실만 담는다. 법적 결론·판단 근거·의견을 담는 칸은 없고, 허용된 다섯 칸 밖의 칸은 모두 거부한다.
// 허용된 칸 안에 결론 문구를 적는 경우는 감지하지 못한다(AC-B2CLAUNCH-006 "이 AC가 보지 못하는 것").

import type { ItemStatus } from "./gate-record";
import { findTableWithExtras } from "./markdown-table";
import { splitCells } from "./stage-table";

/** 확인 기록 표의 열. 확인 대상 식별자·버전, 확인한 역할, 날짜, 결과(REQ-B2CLAUNCH-006)뿐이다. */
export const LEGAL_CONFIRMATION_COLUMNS = [
  "확인 대상 식별자",
  "확인 대상 버전",
  "확인한 역할",
  "날짜",
  "결과",
] as const;

export const LEGAL_RESULTS = ["일치 확인", "불일치", "미확인"] as const;
export type LegalResult = (typeof LEGAL_RESULTS)[number];

export interface LegalConfirmation {
  targetId: string;
  targetVersion: string;
  role: string;
  date: string;
  result: LegalResult;
}

export type LegalConfirmationResult =
  { ok: true; records: LegalConfirmation[] } | { ok: false; errors: string[] };

function isLegalResult(value: string): value is LegalResult {
  return (LEGAL_RESULTS as readonly string[]).includes(value);
}

export function parseLegalConfirmation(markdown: string): LegalConfirmationResult {
  const table = findTableWithExtras(
    markdown.replace(/\r\n/g, "\n").split("\n"),
    LEGAL_CONFIRMATION_COLUMNS
  );
  if (table === null) {
    return {
      ok: false,
      errors: [`확인 기록 표(헤더: ${LEGAL_CONFIRMATION_COLUMNS.join("·")})를 찾지 못했다`],
    };
  }

  // 자유 서술 칸(의견·결론 등)을 포함해 허용된 칸 밖의 칸은 모두 거부한다.
  if (table.extras.length > 0) {
    return {
      ok: false,
      errors: table.extras.map(
        (extra) =>
          `"${extra}" 칸은 허용되지 않는다 — 확인 기록은 ${LEGAL_CONFIRMATION_COLUMNS.join("·")}만 담고 법적 결론이나 판단 문구를 담지 않는다`
      ),
    };
  }

  const errors: string[] = [];
  const records: LegalConfirmation[] = [];

  for (const row of table.body) {
    const cells = splitCells(row);
    const label = `"${cells[0] || "(식별자 없음)"}" 확인 기록`;

    if (cells.length !== table.width) {
      errors.push(`${label}의 칸이 ${cells.length}개다(${table.width}개여야 한다)`);
      continue;
    }

    const emptyColumns = LEGAL_CONFIRMATION_COLUMNS.filter((_, index) => cells[index] === "");
    if (emptyColumns.length > 0) {
      for (const column of emptyColumns) errors.push(`${label}의 "${column}" 칸이 비어 있다`);
      continue;
    }

    const [targetId, targetVersion, role, date, result] = cells;
    if (!isLegalResult(result)) {
      errors.push(
        `${label}의 "결과" 칸 값 "${result}"은 ${LEGAL_RESULTS.join("·")} 중 하나가 아니다`
      );
      continue;
    }
    records.push({ targetId, targetVersion, role, date, result });
  }

  return errors.length === 0 ? { ok: true, records } : { ok: false, errors };
}

export interface LegalJudgment {
  status: ItemStatus;
  /** READY가 아닌 이유. READY면 없다. */
  reason?: string;
}

/**
 * 확인 기록 하나를 항목 상태로 판정한다. 결과가 `불일치`면 BLOCKED, `미확인`이거나 확인 대상 버전이 현재 버전과
 * 다르거나 현재 버전이 넘어오지 않았으면 UNVERIFIED, 그 밖(`일치 확인`이고 버전이 같음)에만 READY다.
 * 현재 버전을 계산하는 일은 호출하는 절차의 몫이다.
 */
export function judgeLegalConfirmation(
  record: LegalConfirmation,
  currentVersion: string | undefined
): LegalJudgment {
  if (record.result === "불일치") {
    return { status: "BLOCKED", reason: "법무 확인 결과가 불일치다" };
  }
  if (record.result === "미확인") {
    return { status: "UNVERIFIED", reason: "법무 확인 결과가 미확인이다" };
  }
  if (currentVersion === undefined) {
    return {
      status: "UNVERIFIED",
      reason: "확인 대상의 현재 버전이 넘어오지 않아 확인한 버전과 같은지 확인할 수 없다",
    };
  }
  if (record.targetVersion !== currentVersion) {
    return {
      status: "UNVERIFIED",
      reason: "확인 대상 버전이 대상의 현재 버전과 다르다",
    };
  }
  return { status: "READY" };
}
