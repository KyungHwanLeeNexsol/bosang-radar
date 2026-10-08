// SPEC-B2C-LAUNCH-001 M1c: 형제 증거 참조 줄 검사 (REQ-B2CLAUNCH-004, AC-B2CLAUNCH-004).
//
// 참조 줄은 형제 SPEC이 소유한 증거를 가리킬 뿐이다. 이 모듈은 형제 항목 목록을 복제하지 않고 입력으로 받은
// 형제 정의표에서 식별자로 조회하며, 옮겨 적은 상태·대상 값을 입력으로 받은 형제 기록의 현재 내용과 비교한다.
// 실제 형제 증거 기록의 형식과 위치는 형제 SPEC이 아직 정하지 않았으므로(acceptance.md AC-B2CLAUNCH-004 선결)
// 형제 기록 내용은 호출하는 쪽이 넘기는 입력이고, 넘기지 않으면 비교하지 못한 것으로 보아 UNVERIFIED다.

import { ITEM_STATUSES, type ItemStatus } from "./gate-record";
import { findTableBody, findTableWithExtras } from "./markdown-table";
import { splitCells } from "./stage-table";

/**
 * 참조 줄 표의 열. 형제 SPEC id·항목 id·옮겨 적은 상태와 대상 값·형제 기록 위치(REQ-B2CLAUNCH-004)에
 * 이 줄이 속한 이 SPEC 항목(R-nn) 하나를 더한다 — AC-B2CLAUNCH-004 (라)가 "그 줄의 항목"을 UNVERIFIED로
 * 판정하려면 줄이 어느 항목의 것인지 알아야 하기 때문이다.
 */
export const SIBLING_REF_COLUMNS = [
  "이 SPEC 항목",
  "형제 SPEC",
  "형제 항목",
  "옮겨 적은 상태",
  "옮겨 적은 대상 값",
  "형제 기록 위치",
] as const;

export interface SiblingRefLine {
  /** 이 줄이 속한 이 SPEC의 항목 식별자(R-nn). */
  launchItem: string;
  siblingSpec: string;
  siblingItem: string;
  /** 형제 기록에서 옮겨 적은 상태. 이 SPEC이 판정한 상태가 아니다. */
  status: ItemStatus;
  target: string;
  location: string;
}

export type SiblingRefsResult =
  { ok: true; lines: SiblingRefLine[] } | { ok: false; errors: string[] };

export function parseSiblingReferences(markdown: string): SiblingRefsResult {
  const table = findTableWithExtras(
    markdown.replace(/\r\n/g, "\n").split("\n"),
    SIBLING_REF_COLUMNS
  );
  if (table === null) {
    return {
      ok: false,
      errors: [`참조 줄 표(헤더: ${SIBLING_REF_COLUMNS.join("·")})를 찾지 못했다`],
    };
  }

  // 자체 판정 칸을 포함해 허용된 칸 밖의 칸은 모두 거부한다(참조 줄은 형제 상태만 옮길 수 있다).
  if (table.extras.length > 0) {
    return {
      ok: false,
      errors: table.extras.map(
        (extra) =>
          `참조 줄은 형제 상태만 옮길 수 있다 — "${extra}" 칸은 허용되지 않는다(참조 줄이 담는 칸은 ${SIBLING_REF_COLUMNS.join("·")}뿐이다)`
      ),
    };
  }

  const errors: string[] = [];
  const lines: SiblingRefLine[] = [];

  for (const row of table.body) {
    const cells = splitCells(row);
    const label = `"${cells[0] || "(이 SPEC 항목 없음)"}" 줄(${cells[1] || "?"}/${cells[2] || "?"})`;

    if (cells.length !== table.width) {
      errors.push(`${label}의 칸이 ${cells.length}개다(${table.width}개여야 한다)`);
      continue;
    }

    const emptyColumns = SIBLING_REF_COLUMNS.filter((_, index) => cells[index] === "");
    if (emptyColumns.length > 0) {
      for (const column of emptyColumns) errors.push(`${label}의 "${column}" 칸이 비어 있다`);
      continue;
    }

    const [launchItem, siblingSpec, siblingItem, status, target, location] = cells;
    if (!(ITEM_STATUSES as readonly string[]).includes(status)) {
      errors.push(
        `${label}의 옮겨 적은 상태 "${status}"는 ${ITEM_STATUSES.join("·")} 중 하나가 아니다`
      );
      continue;
    }
    lines.push({
      launchItem,
      siblingSpec,
      siblingItem,
      status: status as ItemStatus,
      target,
      location,
    });
  }

  return errors.length === 0 ? { ok: true, lines } : { ok: false, errors };
}

/** 형제 SPEC의 항목 정의표 문서와 그 표의 헤더 칸. 헤더 칸을 입력으로 받으므로 표 하나를 고정하지 않는다. */
export interface SiblingDefinitionSource {
  markdown: string;
  labels: readonly string[];
}

/** 형제 기록의 현재 내용(상태와 대상 값). 시험에서는 합성 stub이고 실제 기록 위치·형식은 미정이다. */
export interface SiblingRecord {
  status: string;
  target: string;
}

export function siblingRecordKey(siblingSpec: string, siblingItem: string): string {
  return `${siblingSpec}/${siblingItem}`;
}

/** 형제 정의표의 첫 칸(식별자) 집합. 헤더 칸이 맞는 표가 없으면 null이다. */
export function siblingItemIds(source: SiblingDefinitionSource): Set<string> | null {
  const body = findTableBody(source.markdown.replace(/\r\n/g, "\n").split("\n"), source.labels);
  if (body === null) return null;
  return new Set(body.map((line) => splitCells(line)[0]).filter((id) => id !== ""));
}

export interface SiblingRefInput {
  lines: readonly SiblingRefLine[];
  /** 형제 SPEC id → 그 SPEC의 항목 정의표. 항목 목록은 이 입력에서만 조회한다. */
  definitions: Readonly<Record<string, SiblingDefinitionSource>>;
  /** `siblingRecordKey`로 만든 키 → 형제 기록의 현재 상태·대상 값. */
  records?: Readonly<Record<string, SiblingRecord>>;
}

/**
 * 형제 SPEC이 소유한 증거를 참조하는 이 SPEC의 항목(`R-nn`, spec.md §2.4 "항목 정의표 읽는 법")인지.
 * 이런 항목은 형제 증거를 참조 줄로만 참조하므로 적용되는 요청에서는 참조 줄이 있어야 READY가 될 수 있다.
 * EV-L3를 사건으로 적었다고 R 항목은 아니다 — L-08은 S2 판정에만 형제 결정 기록을 쓰고 참조 줄 대상이 아니다.
 */
export function isSiblingReferenceItem(itemId: string): boolean {
  return /^R-\d+$/.test(itemId);
}

export interface SiblingRefEvaluation {
  /** 거부(입력 오류): 조회할 수 없거나 존재하지 않는 형제 항목. 줄을 평가하지 않는다. */
  rejections: string[];
  /** 이 SPEC 항목 식별자 → EV-L3 이유 목록(형제 기록과 달라졌거나 비교할 수 없음). */
  unverified: Record<string, string[]>;
  /**
   * 이 SPEC 항목 식별자 → 형제 기록의 현재 상태가 READY가 아니라서 이 항목이 READY가 될 수 없다는 이유.
   * 참조 줄과 형제 기록의 값이 같아도 형제 증거가 READY가 아니면 이 항목도 READY가 아니다. 상태는 형제 기록의
   * 현재 상태를 그대로 따른다(BLOCKED면 BLOCKED, 그 밖에는 UNVERIFIED) — 이 SPEC은 형제 증거의 상태를 형제 기록과
   * 다르게 판정하지 않는다(REQ-B2CLAUNCH-004). 한 항목에 줄이 여럿이면 하나라도 BLOCKED일 때 BLOCKED다.
   */
  notReady: Record<string, { status: "BLOCKED" | "UNVERIFIED"; reasons: string[] }>;
}

export function evaluateSiblingReferences(input: SiblingRefInput): SiblingRefEvaluation {
  const idsBySpec = new Map<string, Set<string> | null>();
  const rejections: string[] = [];
  const unverified: Record<string, string[]> = {};
  const notReady: SiblingRefEvaluation["notReady"] = {};

  const idsOf = (spec: string): Set<string> | null | undefined => {
    const source = input.definitions[spec];
    if (source === undefined) return undefined;
    if (!idsBySpec.has(spec)) idsBySpec.set(spec, siblingItemIds(source));
    return idsBySpec.get(spec);
  };

  for (const line of input.lines) {
    const { launchItem, siblingSpec, siblingItem } = line;
    const ids = idsOf(siblingSpec);

    if (ids === undefined) {
      rejections.push(
        `"${launchItem}" 줄의 형제 SPEC "${siblingSpec}" 정의표가 입력되지 않았다 — 형제 항목 "${siblingItem}"을 조회할 수 없다`
      );
      continue;
    }
    if (ids === null) {
      rejections.push(
        `형제 SPEC "${siblingSpec}"의 정의표(헤더: ${input.definitions[siblingSpec].labels.join("·")})를 찾지 못했다 — 형제 항목 "${siblingItem}"을 조회할 수 없다`
      );
      continue;
    }
    if (!ids.has(siblingItem)) {
      rejections.push(
        `존재하지 않는 형제 항목 식별자 "${siblingItem}" — ${siblingSpec} 정의표에 없다("${launchItem}" 줄)`
      );
      continue;
    }

    const record = input.records?.[siblingRecordKey(siblingSpec, siblingItem)];
    const reasons: string[] = [];
    if (record === undefined) {
      reasons.push(
        `${siblingSpec}/${siblingItem}: 형제 기록 내용이 입력되지 않아 옮겨 적은 값을 현재 값과 비교할 수 없다(EV-L3)`
      );
    } else {
      if (record.status !== "READY") {
        // 값이 참조 줄과 같아도 형제 증거 자체가 READY가 아니면 이 항목은 READY가 될 수 없다. 열거 밖 값은 그대로
        // 되풀이하지 않고 "열거 밖 값"으로 적는다.
        const shown = (ITEM_STATUSES as readonly string[]).includes(record.status)
          ? record.status
          : "열거 밖 값";
        const entry = (notReady[launchItem] ??= { status: "UNVERIFIED", reasons: [] });
        if (record.status === "BLOCKED") entry.status = "BLOCKED";
        entry.reasons.push(
          `${siblingSpec}/${siblingItem}: 형제 기록의 현재 상태가 READY가 아니다(${shown})`
        );
      }
      if (record.status !== line.status) {
        reasons.push(
          `${siblingSpec}/${siblingItem}: 옮겨 적은 상태가 형제 기록의 현재 상태와 다르다(EV-L3)`
        );
      }
      if (record.target !== line.target) {
        reasons.push(
          `${siblingSpec}/${siblingItem}: 옮겨 적은 대상 값이 형제 기록의 현재 대상 값과 다르다(EV-L3)`
        );
      }
    }
    if (reasons.length > 0)
      unverified[launchItem] = [...(unverified[launchItem] ?? []), ...reasons];
  }

  return { rejections, unverified, notReady };
}
