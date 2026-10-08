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
  /** 이 SPEC 항목 → 참조 줄이 가리키는 형제 항목 목록(줄이 여럿인 항목). 기본은 항목마다 `SYN-<항목>` 하나다. */
  siblingItems?: Readonly<Record<string, readonly string[]>>;
  /** 이 SPEC 항목 → 참조 줄이 가리키는 형제 SPEC id. 기본은 `SYNTHETIC_SIBLING_SPEC`이다. */
  siblingSpec?: Readonly<Record<string, string>>;
  /** 형제 항목 id → 형제 기록의 현재 대상 값(참조 줄이 옮겨 적는 값도 같이 바뀐다). */
  siblingTarget?: Readonly<Record<string, string>>;
  /** 참조 줄의 순서를 뒤집는다(줄 순서가 결과에 영향을 주지 않는지 보는 시험용). */
  reverseLines?: boolean;
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
  const itemsOf = (id: string): readonly string[] =>
    options.siblingItems?.[id] ?? [syntheticSiblingItem(id)];
  const specOf = (id: string): string => options.siblingSpec?.[id] ?? SYNTHETIC_SIBLING_SPEC;
  const targetOfSibling = (launchItem: string, siblingItem: string): string =>
    options.siblingTarget?.[siblingItem] ??
    (siblingItem === syntheticSiblingItem(launchItem)
      ? syntheticSiblingTarget(launchItem)
      : `형제값-${siblingItem}`);

  const lines: SiblingRefLine[] = launchItems
    .filter((id) => !options.omitLines?.includes(id))
    .flatMap((id) =>
      itemsOf(id).map((siblingItem) => ({
        launchItem: id,
        siblingSpec: specOf(id),
        siblingItem,
        status: lineStatusOf(id),
        target: targetOfSibling(id, siblingItem),
        location: "형제위치-예시",
      }))
    );
  if (options.reverseLines) lines.reverse();

  const rows = lines.map((line) => [
    line.launchItem,
    line.siblingSpec,
    line.siblingItem,
    line.status,
    line.target,
    line.location,
  ]);

  // 형제 SPEC id → 그 SPEC 정의표에 올릴 형제 항목. 기본 형제 SPEC에는 줄이 없는 항목도 올린다.
  const itemsBySpec = new Map<string, string[]>([
    [SYNTHETIC_SIBLING_SPEC, launchItems.map(syntheticSiblingItem)],
  ]);
  const records: Record<string, SiblingRecord> = {};
  for (const id of launchItems) {
    const spec = specOf(id);
    for (const siblingItem of itemsOf(id)) {
      itemsBySpec.set(spec, [...(itemsBySpec.get(spec) ?? []), siblingItem]);
      if (options.omitRecords?.includes(id)) continue;
      records[siblingRecordKey(spec, siblingItem)] = {
        status: recordStatusOf(id),
        target: targetOfSibling(id, siblingItem),
      };
    }
  }

  const definitions: Record<string, SiblingDefinitionSource> = {};
  for (const [spec, items] of itemsBySpec) {
    definitions[spec] = {
      markdown: markdownTable(
        SYNTHETIC_DEFINITION_LABELS,
        [...new Set(items)].map((item) => [item, "합성 형제 항목"])
      ),
      labels: SYNTHETIC_DEFINITION_LABELS,
    };
  }

  return { rows, markdown: markdownTable(SIBLING_REF_COLUMNS, rows), lines, definitions, records };
}
