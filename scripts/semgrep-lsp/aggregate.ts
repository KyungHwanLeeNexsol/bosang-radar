// 진단 집계 (ADR D5, rev2 S18). 순수 함수다.
//
// 공개 API (B2가 쓴다):
//   aggregateDiagnostics(published, expectedFinalIds, options?): AggregateResult
//   PublishedDiagnostics, LspDiagnostic, AggregateResult
//
// 규칙(ADR D5):
//   · 심각도 1=error, 2=warning, 3=information. 4(hint)·누락·미상은 error로 센다.
//   · 합계 = error + warning + information 전부(information을 빼면 기준 완화다).
//   · 중복 키 = (파일, `code` 전체, 범위 시작·끝). 같은 위치의 다른 규칙은 중복이 아니고,
//     같은 규칙이 같은 위치에 두 번이면 중복이다. 키에 심각도는 없으므로 먼저 온 것을 센다.
//   · perFile·perRule의 규칙 키는 항상 **전체 최종 ID**다(마지막 조각으로 줄이지 않는다).
//   · 접두어가 없는 code → PUBLISHED_CODE_UNPREFIXED, 기대 목록에 없는 code → UNKNOWN_RULE_CODE.
//
// 파일 키는 입력의 `uri`를 불투명한 문자열로 그대로 쓴다. URI 정규화(uri.ts)와 같은 URI의 중복
// 게시 판정(DUPLICATE_URI)은 호출자의 몫이며, 필요하면 정규화한 경로를 uri 자리에 넣어 호출한다.
// 이 함수는 `diagnostics`가 배열이 아니면 예외를 던진다 — 모양이 깨진 게시를 0건으로 바꾸지 않기 위해,
// 그런 입력은 호출자(트랜스크립트 계층)가 먼저 걸러야 한다(맞는 ReasonCode가 아직 없다).

import type { Reason } from "./status";
import type { ObservedFacts, Totals } from "./types";

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspDiagnostic {
  range?: { start: LspPosition; end: LspPosition };
  severity?: unknown;
  /** string | number | { value: string | number }. 다른 모양은 "code 없음"으로 본다. */
  code?: unknown;
  message?: unknown;
}

export interface PublishedDiagnostics {
  uri: string;
  diagnostics: readonly LspDiagnostic[];
}

export interface AggregateResult {
  totals: Totals;
  perFile: ObservedFacts["perFile"];
  perRule: Record<string, number>;
  reasons: Reason[];
}

export interface AggregateOptions {
  /** 최종 ID의 접두어. 기본 "semgrep-rules.". */
  prefix?: string;
}

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** code를 문자열로 바꾼다. 해석할 수 없거나 비어 있으면 null. */
function codeOf(code: unknown): string | null {
  let value: unknown = code;
  if (typeof code === "object" && code !== null && !Array.isArray(code)) {
    value = (code as { value?: unknown }).value;
  }
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

type Bucket = "error" | "warning" | "information";

function bucketOf(severity: unknown): Bucket {
  if (severity === 2) return "warning";
  if (severity === 3) return "information";
  return "error"; // 1, 4(hint), 누락, 미상 전부 error
}

function positionKey(position: LspPosition | undefined): string {
  return position ? `${position.line}:${position.character}` : "?";
}

export function aggregateDiagnostics(
  published: readonly PublishedDiagnostics[],
  expectedFinalIds: Iterable<string>,
  options: AggregateOptions = {}
): AggregateResult {
  const prefix = options.prefix ?? "semgrep-rules.";
  const expected = new Set(expectedFinalIds);

  const totals: Totals = { error: 0, warning: 0, information: 0, total: 0 };
  const perFile = new Map<
    string,
    { error: number; warning: number; information: number; codes: Set<string> }
  >();
  const perRule = new Map<string, number>();
  const seen = new Set<string>();
  const unprefixed = new Set<string>();
  const unknown = new Set<string>();
  let missingCode = 0;
  let unkeyed = 0;

  for (const entry of published) {
    if (!Array.isArray(entry.diagnostics)) {
      throw new TypeError(`publishDiagnostics의 diagnostics가 배열이 아니다: ${entry.uri}`);
    }
    let file = perFile.get(entry.uri);
    if (!file) {
      file = { error: 0, warning: 0, information: 0, codes: new Set() };
      perFile.set(entry.uri, file);
    }

    for (const diagnostic of entry.diagnostics) {
      const code = codeOf(diagnostic.code);
      const range = diagnostic.range;
      // 범위가 없는 진단은 위치를 비교할 수 없으므로 합치지 않는다(합치면 조용히 적게 센다).
      const where = range
        ? `${positionKey(range.start)}-${positionKey(range.end)}`
        : `no-range#${unkeyed++}`;
      const key = JSON.stringify([entry.uri, code, where]);
      if (seen.has(key)) continue;
      seen.add(key);

      const bucket = bucketOf(diagnostic.severity);
      totals[bucket]++;
      totals.total++;
      file[bucket]++;

      if (code === null) {
        missingCode++;
        continue;
      }
      file.codes.add(code);
      perRule.set(code, (perRule.get(code) ?? 0) + 1);
      if (!code.startsWith(prefix)) unprefixed.add(code);
      if (!expected.has(code)) unknown.add(code);
    }
  }

  const reasons: Reason[] = [];
  for (const code of [...unprefixed].sort(compareBytes)) {
    reasons.push({ code: "PUBLISHED_CODE_UNPREFIXED", detail: `code=${code}` });
  }
  for (const code of [...unknown].sort(compareBytes)) {
    reasons.push({ code: "UNKNOWN_RULE_CODE", detail: `code=${code}` });
  }
  if (missingCode > 0) {
    reasons.push({
      code: "UNKNOWN_RULE_CODE",
      detail: `code가 없거나 해석할 수 없는 진단 ${missingCode}건`,
    });
  }

  const sortedFiles: ObservedFacts["perFile"] = {};
  for (const uri of [...perFile.keys()].sort(compareBytes)) {
    const f = perFile.get(uri) as NonNullable<ReturnType<typeof perFile.get>>;
    sortedFiles[uri] = {
      error: f.error,
      warning: f.warning,
      information: f.information,
      codes: [...f.codes].sort(compareBytes),
    };
  }
  const sortedRules: Record<string, number> = {};
  for (const code of [...perRule.keys()].sort(compareBytes)) {
    sortedRules[code] = perRule.get(code) as number;
  }

  return { totals, perFile: sortedFiles, perRule: sortedRules, reasons };
}
