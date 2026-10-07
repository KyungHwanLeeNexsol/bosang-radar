// SPEC-B2C-LAUNCH-001 M1b·M1d: 출시 게이트 점검기 (REQ-B2CLAUNCH-002·008, AC-B2CLAUNCH-002·008).
//
// 사용: pnpm exec tsx scripts/check-launch-gate.ts --items <항목 정의표 문서> --record <기록 문서>
//         --environment <local|production> [--stage <I|G>] --surfaces <S1,S2,S3 중 목적 벡터>
//         --signature <go 서명 기록 문서> --allowed-roles <서명 허용 역할, 쉼표로 구분>
//         [--targets <현재 대상 값 JSON>] [--events <관측 뒤 사건 JSON>] [--exemptions <면제 결정 JSON>]
//         [--sibling-refs <참조 줄 문서> [--sibling-defs <형제 정의표 JSON>] [--sibling-records <형제 기록 JSON>]]
// 종료 코드: 0 = 통과, 1 = 항목 점검 또는 서명 점검이 통과하지 못해 불가(서명 없음·서명 뒤 UNVERIFIED가 된 항목·
//         허용되지 않은 역할·서명의 실행 환경이 요청 형태와 다름·서명이 덮는 항목이 필수 항목 집합과 다름 포함),
//         2 = 입력 거부(요청 형태·표·기록·서명 기록의
//         칸 오류·사용법 오류).
//
// 점검기는 기록의 상태 칸과 넘겨 받은 현재 대상 값·사건만 읽는다. 사건 발생을 스스로 감지하지 못하고
// 기록을 쓰거나 바꾸지 않는다. 판정 문구(`…가능`)는 항목 점검과 서명 점검이 모두 통과했을 때만 낸다 — 서명 기록이
// 없으면 통과가 아니며(fail-closed) 서명 점검을 건너뛰거나 통과한 것으로 두는 인자·옵션은 없다.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { OUTPUT_ONLY_MARKER, parseGateRecord, type RecordItem } from "../lib/launch/gate-record";
import {
  SURFACES,
  appliesToVector,
  parseItemTable,
  type ItemRow,
  type Surface,
} from "../lib/launch/item-table";
import {
  evaluateSiblingReferences,
  parseSiblingReferences,
  type SiblingDefinitionSource,
  type SiblingRecord,
  type SiblingRefInput,
} from "../lib/launch/sibling-reference";
import {
  judgeSignature,
  parseSignatureRecord,
  type SignatureRecord,
} from "../lib/launch/signature";
import { resolveEffectiveStatus, type EffectiveStatus } from "../lib/launch/target-check";

export type ExitCode = 0 | 1 | 2;

export interface CheckResult {
  exitCode: ExitCode;
  output: string;
  /** 통과·불가 판정(요청이 거부되면 없다). */
  verdict?: string;
}

/** 점검 요청. 입력 칸은 일부러 느슨한 문자열이다 — 형태 오류를 점검기가 거부해야 하기 때문이다. */
export interface CheckRequest {
  /** 실행 환경. 기본값이 없다. */
  environment?: string;
  /** 목적 단계(I 또는 G). 로컬 시험 판정에는 없어야 한다. */
  stage?: string;
  /** 목적 벡터: 이 요청이 여는 표면 집합. */
  surfaces: readonly string[];
}

/** `결정 대기` 칸에 대해 결정 기록이 항목별로 `해당 없음`을 정한 면제. 그 항목의 그 열에만 적용된다. */
export interface Exemption {
  itemId: string;
  column: "I" | "G";
}

export interface EvaluateInput {
  items: readonly ItemRow[];
  record: readonly RecordItem[];
  /** 항목 식별자 → 호출하는 절차가 계산한 현재 대상 값. */
  currentTargets: Readonly<Record<string, string>>;
  /** 항목 식별자 → 관측 뒤에 일어났다고 호출하는 절차가 넘긴 무효화 사건. */
  eventsAfterObservation?: Readonly<Record<string, readonly string[]>>;
  exemptions?: readonly Exemption[];
  /** 형제 증거 참조 줄(REQ-B2CLAUNCH-004). 넘기지 않으면 점검은 M1b와 똑같이 동작한다. */
  siblingReferences?: SiblingRefInput;
  /** go 서명 기록(REQ-B2CLAUNCH-008). 없으면 판정은 통과가 아니다(fail-closed). */
  signature?: SignatureRecord;
  /** 서명 역할 허용 목록. D-LAUNCH-04의 결정을 코드에 박지 않고 호출하는 쪽이 넘긴다. */
  allowedRoles?: readonly string[];
  request: CheckRequest;
}

export interface CheckInput extends Omit<
  EvaluateInput,
  "items" | "record" | "siblingReferences" | "signature"
> {
  itemTableMarkdown: string;
  recordMarkdown: string;
  /** go 서명 기록 문서(마크다운). */
  signatureMarkdown?: string;
  /** 형제 증거 참조 줄 표(마크다운). 있으면 정의표 조회와 기록 비교를 함께 입력해야 의미가 있다. */
  siblingReferenceMarkdown?: string;
  /** 형제 SPEC id → 그 SPEC의 항목 정의표 문서와 헤더 칸. 항목 목록은 이 입력에서만 조회한다. */
  siblingDefinitions?: Readonly<Record<string, SiblingDefinitionSource>>;
  /** `형제 SPEC id/형제 항목 id` → 형제 기록의 현재 상태와 대상 값. */
  siblingRecords?: Readonly<Record<string, SiblingRecord>>;
}

/** 운영 한정 항목: `local`에서는 적용하지 않고 `production`에서는 I·G 열 표대로 필수다(spec.md §2.4 "실행 환경"). */
const PRODUCTION_ONLY_ITEMS: readonly string[] = ["L-01", "L-05", "R-04"];

type ValidRequest =
  | { ok: true; form: "local"; column: "I"; vector: Surface[] }
  | { ok: true; form: "production"; column: "I" | "G"; vector: Surface[] }
  | { ok: false; message: string };

/** spec.md §2.4 "점검 요청의 두 형태"와 거부하는 조합 네 가지. 환경은 명시 입력이며 기본값을 가정하지 않는다. */
function validateRequest(request: CheckRequest): ValidRequest {
  const { environment, stage } = request;

  if (environment === undefined) {
    return {
      ok: false,
      message: "실행 환경 입력이 없다 — local·production 중 하나를 명시해야 하며 기본값은 없다",
    };
  }
  if (environment !== "local" && environment !== "production") {
    return {
      ok: false,
      message: `실행 환경 입력 "${environment}"이 열거 밖이다(local·production 중 하나여야 한다) — 기본값을 가정하지 않는다`,
    };
  }
  if (environment === "local" && stage !== undefined) {
    return {
      ok: false,
      message: `local 요청은 목적 단계를 받지 않는다(받은 목적 단계: ${stage}). 운영 단계 점검은 production에서만 가능하다`,
    };
  }
  if (environment === "production" && stage !== "I" && stage !== "G") {
    return {
      ok: false,
      message: `production에는 목적 단계 I 또는 G가 필요하다(받은 값: ${stage === undefined ? "없음" : stage})`,
    };
  }

  const badSurface = request.surfaces.find(
    (surface) => !(SURFACES as readonly string[]).includes(surface)
  );
  if (badSurface !== undefined) {
    return {
      ok: false,
      message: `목적 벡터의 표면 "${badSurface}"는 ${SURFACES.join("·")} 중 하나가 아니다`,
    };
  }
  const vector = request.surfaces as Surface[];

  return environment === "local"
    ? { ok: true, form: "local", column: "I", vector }
    : { ok: true, form: "production", column: stage as "I" | "G", vector };
}

const PRODUCTION_VERDICTS = {
  I: { pass: "내부 시험 공개 가능", fail: "내부 시험 공개 불가" },
  G: { pass: "일반 사용자 공개 가능", fail: "일반 사용자 공개 불가" },
} as const;

/** 파싱을 마친 표·기록·입력으로 판정한다. 입력을 바꾸지 않는다. */
export function evaluateLaunchGate(input: EvaluateInput): CheckResult {
  const request = validateRequest(input.request);
  if (!request.ok) return { exitCode: 2, output: `거부: ${request.message}` };

  const knownIds = new Set(input.items.map((row) => row.id));
  const unknown = input.record.filter((item) => !knownIds.has(item.id));
  if (unknown.length > 0) {
    return {
      exitCode: 2,
      output: unknown
        .map((item) => `거부: 기록의 "${item.id}" 항목이 항목 정의표에 없다`)
        .join("\n"),
    };
  }

  // 형제 증거 참조 줄(REQ-B2CLAUNCH-004): 조회할 수 없는 줄·없는 항목은 입력 거부, 값이 어긋난 줄은 그 항목의 EV-L3 강등이다.
  let siblingUnverified: Readonly<Record<string, readonly string[]>> = {};
  if (input.siblingReferences !== undefined) {
    const evaluation = evaluateSiblingReferences(input.siblingReferences);
    const rejections = [
      ...input.siblingReferences.lines
        .filter((line) => !knownIds.has(line.launchItem))
        .map((line) => `형제 참조 줄의 이 SPEC 항목 "${line.launchItem}"이 항목 정의표에 없다`),
      ...evaluation.rejections,
    ];
    if (rejections.length > 0) {
      return { exitCode: 2, output: rejections.map((message) => `거부: ${message}`).join("\n") };
    }
    siblingUnverified = evaluation.unverified;
  }

  const recordById = new Map(input.record.map((item) => [item.id, item]));

  /** 항목의 점검 시점 유효 상태: 대상 값·사건 판정에 형제 참조 줄의 EV-L3 강등을 더한다. */
  const effectiveStatusOf = (recorded: RecordItem): EffectiveStatus => {
    const effective = resolveEffectiveStatus(
      recorded,
      input.currentTargets[recorded.id],
      input.eventsAfterObservation?.[recorded.id] ?? []
    );
    const referenceProblems = siblingUnverified[recorded.id];
    return effective.status === "READY" && referenceProblems !== undefined
      ? { status: "UNVERIFIED", reason: referenceProblems.join("; ") }
      : effective;
  };

  const lines: string[] = [
    `실행 환경: ${request.form}`,
    request.form === "local"
      ? "요청 형태: 로컬 시험 판정 (I 열의 필수 항목 목록을 판정 규칙으로 읽는다)"
      : `요청 형태: 운영 단계 점검 (목적 단계 ${request.column})`,
    `목적 벡터: ${request.vector.length === 0 ? "없음" : request.vector.join("·")}`,
  ];
  const failed: string[] = [];
  /** 이 요청이 읽는 필수 항목 식별자(서명이 덮어야 하는 집합). 판정에서 빠지는 항목은 담지 않는다. */
  const requiredItemIds: string[] = [];

  for (const row of input.items) {
    if (!appliesToVector(row, request.vector)) continue;

    if (request.form === "local" && PRODUCTION_ONLY_ITEMS.includes(row.id)) {
      lines.push(`${row.id}: ${OUTPUT_ONLY_MARKER}`);
      continue;
    }

    const cell = request.column === "I" ? row.i : row.g;
    if (cell === "해당 없음") continue;
    if (
      cell === "결정 대기" &&
      input.exemptions?.some((e) => e.itemId === row.id && e.column === request.column)
    ) {
      lines.push(`${row.id}: 해당 없음 (결정 기록의 면제)`);
      continue;
    }

    requiredItemIds.push(row.id);
    const note = cell === "결정 대기" ? " [결정 대기 칸 — 결정 기록이 없어 필수로 취급]" : "";
    const recorded = recordById.get(row.id);
    if (recorded === undefined) {
      failed.push(row.id);
      lines.push(`${row.id}: 기록에 없다 — 필수 항목이 기록에 없으면 READY로 볼 수 없다${note}`);
      continue;
    }

    const effective = effectiveStatusOf(recorded);
    if (effective.status === "READY") {
      lines.push(`${row.id}: READY${note}`);
    } else {
      failed.push(row.id);
      lines.push(
        `${row.id}: ${effective.status} — ${effective.reason ?? "필수 항목이 READY가 아니다"}${note}`
      );
    }
  }

  const verdicts =
    request.form === "local"
      ? { pass: "로컬 시험 가능", fail: "로컬 시험 불가" }
      : PRODUCTION_VERDICTS[request.column];
  // 서명 점검(REQ-B2CLAUNCH-008): 서명 기록이 없으면 통과가 아니다. 서명 시점 항목의 현재 상태는 위 항목 점검과 같은
  // 유효 상태로 읽는다(서명 뒤 UNVERIFIED가 된 항목은 서명의 효력을 없앤다).
  const signatureProblems = judgeSignature(input.signature, {
    allowedRoles: input.allowedRoles ?? [],
    requestEnvironment: request.form,
    requiredItemIds,
    currentStatus: (id) => {
      const recorded = recordById.get(id);
      return recorded === undefined ? undefined : effectiveStatusOf(recorded).status;
    },
  });
  if (signatureProblems.length === 0) {
    lines.push(`서명 점검: 통과 (서명 ${input.signature?.signers.length ?? 0}건)`);
  } else {
    for (const problem of signatureProblems) lines.push(`서명 점검: ${problem}`);
  }

  const passed = failed.length === 0 && signatureProblems.length === 0;
  const verdict = passed ? verdicts.pass : verdicts.fail;
  if (failed.length > 0) lines.push(`불가 사유: 필수 항목이 READY가 아니다 — ${failed.join(", ")}`);
  lines.push(`판정: ${verdict}`);

  return { exitCode: passed ? 0 : 1, output: lines.join("\n"), verdict };
}

/** 마크다운 문서로 받은 표·기록을 읽은 뒤 판정한다. 요청 형태 검사가 표·기록 읽기보다 먼저다. */
export function checkLaunchGate(input: CheckInput): CheckResult {
  const request = validateRequest(input.request);
  if (!request.ok) return { exitCode: 2, output: `거부: ${request.message}` };

  const table = parseItemTable(input.itemTableMarkdown);
  if (!table.ok) {
    return { exitCode: 2, output: table.errors.map((e) => `항목 정의표 오류: ${e}`).join("\n") };
  }
  const record = parseGateRecord(input.recordMarkdown);
  if (!record.ok) {
    return { exitCode: 2, output: record.errors.map((e) => `기록 오류: ${e}`).join("\n") };
  }

  let siblingReferences: SiblingRefInput | undefined;
  if (input.siblingReferenceMarkdown !== undefined) {
    const references = parseSiblingReferences(input.siblingReferenceMarkdown);
    if (!references.ok) {
      return {
        exitCode: 2,
        output: references.errors.map((e) => `형제 참조 오류: ${e}`).join("\n"),
      };
    }
    siblingReferences = {
      lines: references.lines,
      definitions: input.siblingDefinitions ?? {},
      records: input.siblingRecords,
    };
  }

  // 서명 기록의 칸 오류(실행 환경 칸이 비었거나 열거 밖 등)는 요청 형태와 무관한 입력 거부다.
  let signature: SignatureRecord | undefined;
  if (input.signatureMarkdown !== undefined) {
    const parsedSignature = parseSignatureRecord(input.signatureMarkdown);
    if (!parsedSignature.ok) {
      return {
        exitCode: 2,
        output: parsedSignature.errors.map((e) => `서명 기록 오류: ${e}`).join("\n"),
      };
    }
    signature = parsedSignature.record;
  }

  return evaluateLaunchGate({
    items: table.rows,
    record: record.items,
    currentTargets: input.currentTargets,
    eventsAfterObservation: input.eventsAfterObservation,
    exemptions: input.exemptions,
    siblingReferences,
    signature,
    allowedRoles: input.allowedRoles,
    request: input.request,
  });
}

// ---- CLI ------------------------------------------------------------------------------------

const FLAGS = [
  "items",
  "record",
  "environment",
  "stage",
  "surfaces",
  "targets",
  "events",
  "exemptions",
  "sibling-refs",
  "sibling-defs",
  "sibling-records",
  "signature",
  "allowed-roles",
] as const;
type Flag = (typeof FLAGS)[number];

/** 사용법 오류(인자·입력 파일 문제). runCli가 종료 코드 2의 결과로 바꾼다. */
class UsageError extends Error {}

function parseFlags(argv: readonly string[]): Partial<Record<Flag, string>> {
  const flags: Partial<Record<Flag, string>> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, "");
    if (!argv[i].startsWith("--") || !(FLAGS as readonly string[]).includes(name)) {
      throw new UsageError(`알 수 없는 인자 "${argv[i]}"`);
    }
    const value = argv[i + 1];
    if (value === undefined) throw new UsageError(`--${name}에 값이 없다`);
    flags[name as Flag] = value;
  }
  return flags;
}

function isObjectOf(value: unknown, isValue: (v: unknown) => boolean): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isValue)
  );
}

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObjectOf(value, (v) => typeof v === "string");

const isEventsRecord = (value: unknown): value is Record<string, string[]> =>
  isObjectOf(value, (v) => Array.isArray(v) && v.every((e) => typeof e === "string"));

const isExemptionList = (value: unknown): value is Exemption[] =>
  Array.isArray(value) &&
  value.every(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      typeof e.itemId === "string" &&
      (e.column === "I" || e.column === "G")
  );

/** 형제 정의표 입력: 형제 SPEC id → 그 정의표 문서의 파일 경로와 표의 헤더 칸. */
interface SiblingDefinitionFile {
  file: string;
  labels: string[];
}

const isSiblingDefinitionFiles = (value: unknown): value is Record<string, SiblingDefinitionFile> =>
  isObjectOf(
    value,
    (v) =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as SiblingDefinitionFile).file === "string" &&
      Array.isArray((v as SiblingDefinitionFile).labels) &&
      (v as SiblingDefinitionFile).labels.every((label) => typeof label === "string")
  );

const isSiblingRecords = (value: unknown): value is Record<string, SiblingRecord> =>
  isObjectOf(
    value,
    (v) =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as SiblingRecord).status === "string" &&
      typeof (v as SiblingRecord).target === "string"
  );

function runCliUnchecked(argv: readonly string[], readText: (file: string) => string): CheckResult {
  const flags = parseFlags(argv);
  for (const required of ["items", "record", "surfaces"] as const) {
    if (flags[required] === undefined) throw new UsageError(`--${required} 인자가 필요하다`);
  }
  for (const dependent of ["sibling-defs", "sibling-records"] as const) {
    if (flags[dependent] !== undefined && flags["sibling-refs"] === undefined) {
      throw new UsageError(`--${dependent}는 --sibling-refs와 함께 써야 한다`);
    }
  }

  const read = (flag: Flag): string => {
    const file = flags[flag] as string;
    try {
      return readText(file);
    } catch {
      throw new UsageError(`--${flag} 파일을 읽지 못했다(${file})`);
    }
  };
  const readJson = <T>(
    flag: Flag,
    guard: (value: unknown) => value is T,
    shape: string
  ): T | undefined => {
    if (flags[flag] === undefined) return undefined;
    const text = read(flag);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new UsageError(`--${flag} 파일이 JSON이 아니다`);
    }
    if (!guard(parsed)) throw new UsageError(`--${flag} 파일은 ${shape} 형태여야 한다`);
    return parsed;
  };

  const definitionFiles = readJson(
    "sibling-defs",
    isSiblingDefinitionFiles,
    '{"형제 SPEC id": {"file": "정의표 문서 경로", "labels": ["ID", "…"]}}'
  );
  const siblingDefinitions =
    definitionFiles === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(definitionFiles).map(([spec, { file, labels }]) => {
            try {
              return [spec, { markdown: readText(file), labels }];
            } catch {
              throw new UsageError(`--sibling-defs의 ${spec} 정의표 파일을 읽지 못했다(${file})`);
            }
          })
        );

  return checkLaunchGate({
    itemTableMarkdown: read("items"),
    recordMarkdown: read("record"),
    siblingReferenceMarkdown:
      flags["sibling-refs"] === undefined ? undefined : read("sibling-refs"),
    siblingDefinitions,
    siblingRecords: readJson(
      "sibling-records",
      isSiblingRecords,
      '{"형제 SPEC id/형제 항목 id": {"status": "READY", "target": "대상 값"}}'
    ),
    // 서명 기록·허용 역할을 넘기지 않으면 서명 없음(또는 허용되는 역할 없음)이라 어떤 판정도 통과하지 못한다.
    signatureMarkdown: flags.signature === undefined ? undefined : read("signature"),
    allowedRoles: (flags["allowed-roles"] ?? "")
      .split(",")
      .map((role) => role.trim())
      .filter((role) => role !== ""),
    // 대상 값을 넘기지 않으면 모든 READY 항목이 UNVERIFIED가 된다(fail-closed).
    currentTargets: readJson("targets", isStringRecord, '{"항목 ID": "대상 값"}') ?? {},
    eventsAfterObservation: readJson("events", isEventsRecord, '{"항목 ID": ["EV-L1"]}'),
    exemptions: readJson("exemptions", isExemptionList, '[{"itemId": "R-02", "column": "I"}]'),
    request: {
      environment: flags.environment,
      stage: flags.stage,
      surfaces: (flags.surfaces as string).split(",").filter((surface) => surface !== ""),
    },
  });
}

/** 명령줄 인자를 읽어 판정한다. 파일 경로는 모두 인자로만 받고 기본 위치가 없다. */
export function runCli(
  argv: readonly string[],
  readText: (file: string) => string = (file) => readFileSync(file, "utf-8")
): CheckResult {
  try {
    return runCliUnchecked(argv, readText);
  } catch (error) {
    if (error instanceof UsageError) {
      return { exitCode: 2, output: `사용법 오류: ${error.message}` };
    }
    throw error;
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const result = runCli(process.argv.slice(2));
  if (result.exitCode === 2) console.error(result.output);
  else console.log(result.output);
  process.exitCode = result.exitCode;
}
