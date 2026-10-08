// SPEC-B2C-LAUNCH-001: 형제 증거 합성 fixture (시험 전용).
//
// 실제 형제 증거 기록의 형식과 위치는 형제 SPEC이 아직 정하지 않았다(acceptance.md AC-B2CLAUNCH-004 선결).
// 그래서 이 모듈은 형제 SPEC의 식별자·증거를 만들어내지 않고, 이름부터 합성임이 드러나는 가짜 형제 SPEC
// 하나(SYNTHETIC_SIBLING_SPEC)에 이 SPEC의 항목마다 항목 하나·기록 하나를 붙여 준다.
// 점검기가 "형제 항목 목록을 복제하지 않고 입력으로 조회한다"는 규칙은 그대로 지켜진다 — 정의표·기록은
// 모두 호출하는 쪽(시험)이 넘기는 입력이다.

import {
  SIBLING_REF_COLUMNS,
  siblingRecordKey,
  type SiblingDefinitionSource,
  type SiblingRecord,
  type SiblingRefLine,
} from "./sibling-reference";

export const SYNTHETIC_SIBLING_SPEC = "SPEC-SYNTHETIC-SIBLING-001";
export const SYNTHETIC_DEFINITION_LABELS = ["ID", "증거 항목"] as const;

export interface SyntheticSiblingOptions {
  /** 참조 줄을 만들지 않을 이 SPEC 항목(필수 참조 줄 누락 시험). */
  omitLines?: readonly string[];
  /** 형제 기록 현재 내용을 넘기지 않을 이 SPEC 항목(비교 불가 시험). */
  omitRecords?: readonly string[];
  /** 이 SPEC 항목 → 형제 기록의 현재 상태. 기본은 READY다. */
  recordStatus?: Readonly<Record<string, string>>;
  /** 이 SPEC 항목 → 참조 줄에 옮겨 적은 상태. 기본은 형제 기록의 현재 상태와 같다(값이 같은 줄). */
  lineStatus?: Readonly<Record<string, "READY" | "BLOCKED" | "UNVERIFIED">>;
}

export interface SyntheticSiblingEvidence {
  /** 참조 줄 표의 본문 행(칸 6개). */
  rows: string[][];
  /** 헤더를 갖춘 참조 줄 문서(마크다운). */
  markdown: string;
  /** 참조 줄 객체(파서를 거치지 않고 evaluateLaunchGate에 넘길 때). */
  lines: SiblingRefLine[];
  /** 형제 SPEC id → 형제 정의표. */
  definitions: Record<string, SiblingDefinitionSource>;
  /** `형제 SPEC id/형제 항목 id` → 형제 기록의 현재 상태·대상 값. */
  records: Record<string, SiblingRecord>;
}

export const syntheticSiblingItem = (launchItem: string): string => `SYN-${launchItem}`;
export const syntheticSiblingTarget = (launchItem: string): string => `형제값-${launchItem}`;

function markdownTable(columns: readonly string[], rows: readonly string[][]): string {
  return [
    `| ${columns.join(" | ")} |`,
    `|${columns.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

/** `launchItems`(이 SPEC의 형제 참조 항목들)마다 합성 형제 항목·참조 줄·형제 기록을 만든다. */
export function syntheticSiblingEvidence(
  launchItems: readonly string[],
  options: SyntheticSiblingOptions = {}
): SyntheticSiblingEvidence {
  const recordStatusOf = (id: string): string => options.recordStatus?.[id] ?? "READY";
  const lineStatusOf = (id: string): "READY" | "BLOCKED" | "UNVERIFIED" =>
    options.lineStatus?.[id] ?? (recordStatusOf(id) as "READY" | "BLOCKED" | "UNVERIFIED");

  const lines: SiblingRefLine[] = launchItems
    .filter((id) => !options.omitLines?.includes(id))
    .map((id) => ({
      launchItem: id,
      siblingSpec: SYNTHETIC_SIBLING_SPEC,
      siblingItem: syntheticSiblingItem(id),
      status: lineStatusOf(id),
      target: syntheticSiblingTarget(id),
      location: "형제위치-예시",
    }));

  const rows = lines.map((line) => [
    line.launchItem,
    line.siblingSpec,
    line.siblingItem,
    line.status,
    line.target,
    line.location,
  ]);

  const records: Record<string, SiblingRecord> = {};
  for (const id of launchItems) {
    if (options.omitRecords?.includes(id)) continue;
    records[siblingRecordKey(SYNTHETIC_SIBLING_SPEC, syntheticSiblingItem(id))] = {
      status: recordStatusOf(id),
      target: syntheticSiblingTarget(id),
    };
  }

  return {
    rows,
    markdown: markdownTable(SIBLING_REF_COLUMNS, rows),
    lines,
    definitions: {
      [SYNTHETIC_SIBLING_SPEC]: {
        markdown: markdownTable(
          SYNTHETIC_DEFINITION_LABELS,
          launchItems.map((id) => [syntheticSiblingItem(id), "합성 형제 항목"])
        ),
        labels: SYNTHETIC_DEFINITION_LABELS,
      },
    },
    records,
  };
}
