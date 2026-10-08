import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { RECORD_COLUMNS, parseGateRecord } from "../lib/launch/gate-record";
import {
  appliesToVector,
  parseItemTable,
  type ItemRow,
  type Surface,
} from "../lib/launch/item-table";
import {
  SIBLING_REF_COLUMNS,
  computeSiblingEvidenceTarget,
  parseSiblingReferences,
  siblingRecordKey,
  type SiblingDefinitionSource,
  type SiblingRecord,
  type SiblingRefLine,
} from "../lib/launch/sibling-reference";
import {
  SYNTHETIC_SIBLING_SPEC,
  syntheticSiblingEvidence,
  syntheticSiblingTarget,
  type SyntheticSiblingEvidence,
  type SyntheticSiblingOptions,
} from "../lib/launch/sibling-evidence.fixture";
import {
  SIGNER_COLUMNS,
  SNAPSHOT_COLUMNS,
  parseSignatureRecord,
  type SignatureRecord,
} from "../lib/launch/signature";
import {
  checkLaunchGate,
  evaluateLaunchGate,
  runCli,
  type CheckInput,
  type CheckRequest,
  type CheckResult,
  type Exemption,
} from "./check-launch-gate";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const scriptPath = path.join(scriptDir, "check-launch-gate.ts");
const tsxCliPath = fileURLToPath(import.meta.resolve("tsx/cli"));
const SPEC_PATH = path.join(projectRoot, ".moai", "specs", "SPEC-B2C-LAUNCH-001", "spec.md");
const RUNBOOK_PATH = path.join(projectRoot, ".moai", "docs", "launch-gate-runbook.md");

function readText(file: string): string {
  return readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
}

const SPEC_MARKDOWN = readText(SPEC_PATH);
const RUNBOOK_MARKDOWN = readText(RUNBOOK_PATH);

const parsedTable = parseItemTable(SPEC_MARKDOWN);
if (!parsedTable.ok)
  throw new Error(`spec.md 항목 표가 통과해야 한다: ${parsedTable.errors.join("|")}`);
const ITEM_ROWS: ItemRow[] = parsedTable.rows;

// ---- fixture 도우미 ------------------------------------------------------------------------
// 값은 모두 눈에 띄게 합성한 것이다(실제 역할·날짜·위치·값이 아니다).

// 형제 증거를 참조하는 R 항목(spec.md §2.4)의 대상 칸은 형제 증거에서 계산한 대상 값이다(REQ-B2CLAUNCH-005).
// 그래서 R 항목의 기본 대상 값은 합성 형제 증거로 계산한 값이고, 나머지 항목은 합성 문자열이다.
const SIBLING_ITEM_IDS = ITEM_ROWS.filter((row) => /^R-\d+$/.test(row.id)).map((row) => row.id);
const DEFAULT_SIBLING_EVIDENCE = syntheticSiblingEvidence(SIBLING_ITEM_IDS);

/** 참조 줄·형제 기록에서 항목별 현재 형제 증거 대상 값을 계산한다(줄이 없는 항목은 빠진다). */
function evidenceTargetsFor(
  lines: readonly SiblingRefLine[],
  records: Readonly<Record<string, SiblingRecord>> | undefined
): Record<string, string> {
  const targets: Record<string, string> = {};
  for (const id of SIBLING_ITEM_IDS) {
    const target = computeSiblingEvidenceTarget(id, lines, records);
    if (target !== undefined) targets[id] = target;
  }
  return targets;
}

const evidenceTargetsOf = (evidence: SyntheticSiblingEvidence): Record<string, string> =>
  evidenceTargetsFor(evidence.lines, evidence.records);

const DEFAULT_EVIDENCE_TARGETS = evidenceTargetsOf(DEFAULT_SIBLING_EVIDENCE);

function targetOf(id: string): string {
  return DEFAULT_EVIDENCE_TARGETS[id] ?? `대상-${id}`;
}

/**
 * 표의 모든 항목을 한 행씩 적은 기록 마크다운. 기본 상태는 READY이고 `statuses`가 항목별로 덮어쓴다.
 * `eventsOf`·`targetsOf`는 항목별로 기록의 무효화 사건 칸·대상 칸을 정의표 값 대신 적는다(우회 회귀 시험용).
 */
function recordFor(
  statuses: Readonly<Record<string, string>> = {},
  omit: readonly string[] = [],
  eventsOf: Readonly<Record<string, readonly string[]>> = {},
  targetsOf: Readonly<Record<string, string>> = {}
) {
  const rows = ITEM_ROWS.filter((row) => !omit.includes(row.id)).map((row) => {
    const status = row.id in statuses ? statuses[row.id] : "READY";
    const events = (eventsOf[row.id] ?? row.events).join(", ");
    const target = targetsOf[row.id] ?? targetOf(row.id);
    return `| ${row.id} | 증명 ${row.id} | 위치-예시 | 역할-예시 | 날짜-예시 | ${target} | ${events} | ${status} |`;
  });
  return [
    `| ${RECORD_COLUMNS.join(" | ")} |`,
    `|${RECORD_COLUMNS.map(() => "---").join("|")}|`,
    ...rows,
  ].join("\n");
}

const CURRENT_TARGETS: Readonly<Record<string, string>> = Object.fromEntries(
  ITEM_ROWS.map((row) => [row.id, targetOf(row.id)])
);

const ALL_SURFACES = ["S1", "S2", "S3"];

// ---- 형제 증거 도우미(시험 전용, 합성 값) ---------------------------------------------------
// 실제로 적용되는 필수 R 항목은 완전한 형제 증거(참조 줄·형제 정의표·현재 형제 기록)가 있어야 READY가 된다.
// 양성 시험은 R-nn 항목(spec.md §2.4: 형제 SPEC이 소유한 증거를 참조하는 이 SPEC의 항목)마다 합성 형제 증거를
// 넘겨 이 조건을 채운다 — 점검기에는 이런 기본값이 없다. 형제 증거를 일부러 빼거나 어긋나게 하는 시험은
// `syntheticSiblingEvidence`를 직접 쓴다. (EV-L3를 사건으로 적었다고 R 항목은 아니다 — L-08은 S2 판정에만 형제
// 결정 기록을 쓰고 참조 줄 대상이 아니다.)

/** 형제 증거 입력을 하나도 넘기지 않은 점검 입력에만 합성 형제 증거를 채운다. */
function withDefaultSibling(input: CheckInput): CheckInput {
  if (
    input.siblingReferenceMarkdown !== undefined ||
    input.siblingDefinitions !== undefined ||
    input.siblingRecords !== undefined
  ) {
    return input;
  }
  const evidence = syntheticSiblingEvidence(SIBLING_ITEM_IDS);
  return {
    ...input,
    siblingReferenceMarkdown: evidence.markdown,
    siblingDefinitions: evidence.definitions,
    siblingRecords: evidence.records,
  };
}

/** 명령줄 형태의 합성 형제 증거: 파일 이름(`at`이 경로로 바꾼다) → 내용, 그리고 세 인자. */
function siblingCliParts(
  evidence: SyntheticSiblingEvidence,
  at: (name: string) => string = (name) => name
): { files: Record<string, string>; args: string[] } {
  // 형제 SPEC마다 정의표 문서 하나를 둔다(기본 형제 SPEC은 `syn-defs-table.md`).
  const tableName = (spec: string): string =>
    spec === SYNTHETIC_SIBLING_SPEC ? "syn-defs-table.md" : `syn-defs-table-${spec}.md`;
  const specs = Object.keys(evidence.definitions);
  return {
    files: {
      [at("syn-refs.md")]: evidence.markdown,
      ...Object.fromEntries(
        specs.map((spec) => [at(tableName(spec)), evidence.definitions[spec].markdown])
      ),
      [at("syn-defs.json")]: JSON.stringify(
        Object.fromEntries(
          specs.map((spec) => [
            spec,
            { file: at(tableName(spec)), labels: evidence.definitions[spec].labels },
          ])
        )
      ),
      [at("syn-records.json")]: JSON.stringify(evidence.records),
    },
    args: [
      "--sibling-refs",
      at("syn-refs.md"),
      "--sibling-defs",
      at("syn-defs.json"),
      "--sibling-records",
      at("syn-records.json"),
    ],
  };
}

const DEFAULT_SIBLING_CLI = siblingCliParts(syntheticSiblingEvidence(SIBLING_ITEM_IDS));

// ---- 서명 도우미(시험 전용) -----------------------------------------------------------------
// 허용 역할은 D-LAUNCH-04 결정 기록의 세 역할 이름을 시험 입력으로만 쓴 것이다(코드에는 박혀 있지 않다).
// 서명자 구성(세 역할 전부가 서명해야 하는지, U3)은 확인 대기라 시험도 강제하지 않는다.

const ALLOWED_ROLES = ["제품 책임자", "운영 책임자", "법무"];
const ALLOWED_ROLES_ARG = ALLOWED_ROLES.join(",");
const PRODUCTION_ONLY = ["L-01", "L-05", "R-04"];

function renderSignature(signers: readonly string[][], snapshot: readonly string[][]): string {
  const table = (columns: readonly string[], rows: readonly string[][]) =>
    [
      `| ${columns.join(" | ")} |`,
      `|${columns.map(() => "---").join("|")}|`,
      ...rows.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
  return `${table(SIGNER_COLUMNS, signers)}\n\n${table(SNAPSHOT_COLUMNS, snapshot)}`;
}

/**
 * 요청이 읽는 필수 항목 식별자 — 서명이 덮어야 하는 집합(REQ-B2CLAUNCH-008). 점검기의 계산을 부르지 않고
 * 시험이 따로 적은 것이다(표면 열 규칙·단계 열·운영 한정 항목·결정 대기 칸 면제). 두 계산이 어긋나면
 * 이 집합으로 만든 서명이 점검기를 통과하지 못하므로 (가)(마)가 실패해 드러난다.
 */
function requiredIdsFor(request: CheckRequest, exemptions: readonly Exemption[] = []): string[] {
  const column = request.environment === "production" && request.stage === "G" ? "G" : "I";
  const vector = request.surfaces as Surface[];
  return ITEM_ROWS.filter((row) => {
    if (!appliesToVector(row, vector)) return false;
    if (request.environment === "local" && PRODUCTION_ONLY.includes(row.id)) return false;
    const cell = column === "I" ? row.i : row.g;
    if (cell === "해당 없음") return false;
    return !(
      cell === "결정 대기" && exemptions.some((e) => e.itemId === row.id && e.column === column)
    );
  }).map((row) => row.id);
}

interface SignatureOptions {
  role?: string;
  /** 필수 항목 중 서명이 덮지 않을 식별자(일부만 덮는 서명). */
  omit?: readonly string[];
  /** 필수 항목 집합에 더해 덮을 식별자(집합 밖을 덮는 서명). */
  extra?: readonly string[];
  exemptions?: readonly Exemption[];
}

/**
 * 기록 문서에서 유효한 서명 기록을 만든다 — AC-B2CLAUNCH-002의 "서명 점검은 통과한 것으로 둔다"를 시험 코드에서
 * 충족하는 도우미이며 점검기에는 이런 우회가 없다. 서명 시점 항목은 요청의 필수 항목 집합과 정확히 같다
 * (로컬 서명은 운영 한정 항목 L-01·L-05·R-04를, 목적 단계 열이 해당 없음인 항목·목적 벡터가 열지 않는 표면의
 * 항목·면제된 항목을 서명 대상으로 삼지 않는다 — spec.md §2.4, REQ·AC-B2CLAUNCH-008). `environment`는 서명 기록의
 * 실행 환경 칸이고 `request`는 서명이 덮을 집합을 정하는 요청이다(둘이 달라야 시험할 수 있는 fixture가 있다).
 */
function signatureFor(
  recordMarkdown: string,
  environment: string,
  request: CheckRequest,
  options: SignatureOptions = {}
): string {
  const parsed = parseGateRecord(recordMarkdown);
  const covered = [
    ...requiredIdsFor(request, options.exemptions).filter((id) => !options.omit?.includes(id)),
    ...(options.extra ?? []),
  ];
  const items = parsed.ok ? parsed.items.filter((item) => covered.includes(item.id)) : [];
  return renderSignature(
    [[options.role ?? ALLOWED_ROLES[0], "날짜-예시", environment]],
    items.map((item) => [item.id, item.status, item.target])
  );
}

/** 서명 기록을 함께 넘기는 checkLaunchGate. 서명 환경은 요청의 실행 환경과 같게 두고 서명은 요청의 필수 항목을 덮는다. */
function signedCheck(input: CheckInput): CheckResult {
  return checkLaunchGate({
    signatureMarkdown: signatureFor(
      input.recordMarkdown,
      input.request.environment ?? "production",
      input.request,
      { exemptions: input.exemptions }
    ),
    allowedRoles: ALLOWED_ROLES,
    ...withDefaultSibling(input),
  });
}

function flagValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

/** 서명 기록과 허용 역할 인자를 더한 runCli(프로세스 안). record.md의 내용과 인자의 요청으로 서명 기록을 만든다. */
function signedCli(args: readonly string[], read: (file: string) => string): CheckResult {
  const environment = flagValue(args, "environment") ?? "production";
  const exemptionsFile = flagValue(args, "exemptions");
  // 형제 증거 인자를 하나도 넘기지 않았으면 합성 형제 증거를 더한다(양성 경로의 기본 입력).
  const hasSiblingFlag = ["sibling-refs", "sibling-defs", "sibling-records"].some(
    (name) => flagValue(args, name) !== undefined
  );
  const siblingArgs = hasSiblingFlag ? [] : DEFAULT_SIBLING_CLI.args;
  return runCli(
    [...args, ...siblingArgs, "--signature", "signature.md", "--allowed-roles", ALLOWED_ROLES_ARG],
    (file) =>
      file in DEFAULT_SIBLING_CLI.files
        ? DEFAULT_SIBLING_CLI.files[file]
        : file === "signature.md"
          ? signatureFor(
              read("record.md"),
              environment,
              {
                environment,
                stage: flagValue(args, "stage"),
                surfaces: (flagValue(args, "surfaces") ?? "").split(",").filter((s) => s !== ""),
              },
              {
                exemptions:
                  exemptionsFile === undefined
                    ? []
                    : (JSON.parse(read(exemptionsFile)) as Exemption[]),
              }
            )
          : read(file)
  );
}

function production(stage: string | undefined, surfaces: readonly string[]): CheckRequest {
  return { environment: "production", stage, surfaces };
}

function local(surfaces: readonly string[]): CheckRequest {
  return { environment: "local", surfaces };
}

interface RunExtras {
  currentTargets?: Readonly<Record<string, string>>;
  eventsAfterObservation?: Readonly<Record<string, readonly string[]>>;
  exemptions?: readonly Exemption[];
  itemTableMarkdown?: string;
}

function run(
  statuses: Readonly<Record<string, string>>,
  request: CheckRequest,
  extras: RunExtras = {}
): CheckResult {
  return signedCheck({
    itemTableMarkdown: extras.itemTableMarkdown ?? SPEC_MARKDOWN,
    recordMarkdown: recordFor(statuses),
    currentTargets: extras.currentTargets ?? CURRENT_TARGETS,
    eventsAfterObservation: extras.eventsAfterObservation,
    exemptions: extras.exemptions,
    request,
  });
}

// ---- AC-B2CLAUNCH-002 fixture 열아홉 가지 ---------------------------------------------------

interface Fixture {
  tag: string;
  form: "운영" | "로컬" | "형태 오류";
  describe: string;
  statuses: Record<string, string>;
  request: CheckRequest;
  extras?: RunExtras;
  exit0: boolean;
  /** 출력에 들어 있어야 하는 문자열. */
  outputHas: string[];
  /** 출력에 들어 있으면 안 되는 문자열. */
  outputLacks?: string[];
}

const UNVERIFIED_PRODUCTION_ONLY = {
  "L-01": "UNVERIFIED",
  "L-05": "UNVERIFIED",
  "R-04": "UNVERIFIED",
};

const FIXTURES: Fixture[] = [
  {
    tag: "가",
    form: "운영",
    describe: "목적 단계 I 열의 필수 항목이 모두 READY",
    statuses: {},
    request: production("I", ALL_SURFACES),
    exit0: true,
    outputHas: ["내부 시험 공개 가능"],
  },
  {
    tag: "나",
    form: "운영",
    describe: "필수 항목(L-04) 하나가 BLOCKED",
    statuses: { "L-04": "BLOCKED" },
    request: production("I", ALL_SURFACES),
    exit0: false,
    outputHas: ["L-04"],
    outputLacks: ["내부 시험 공개 가능"],
  },
  {
    tag: "다",
    form: "운영",
    describe: "필수 항목(L-06) 하나가 UNVERIFIED",
    statuses: { "L-06": "UNVERIFIED" },
    request: production("I", ALL_SURFACES),
    exit0: false,
    outputHas: ["L-06"],
  },
  {
    tag: "라",
    form: "운영",
    describe: "상태 칸이 비어 있음(L-07)",
    statuses: { "L-07": "" },
    request: production("I", ALL_SURFACES),
    exit0: false,
    outputHas: ["L-07", "상태"],
    outputLacks: ["내부 시험 공개 가능"],
  },
  {
    tag: "마",
    form: "운영",
    describe: "칸 값이 결정 대기인 R-02가 UNVERIFIED이고 결정 기록이 없음",
    statuses: { "R-02": "UNVERIFIED" },
    request: production("I", ALL_SURFACES),
    exit0: false,
    outputHas: ["R-02"],
  },
  {
    tag: "바",
    form: "운영",
    describe: "같은 항목에 결정 기록이 해당 없음으로 있음",
    statuses: { "R-02": "UNVERIFIED" },
    request: production("I", ALL_SURFACES),
    extras: { exemptions: [{ itemId: "R-02", column: "I" }] },
    exit0: true,
    outputHas: ["내부 시험 공개 가능"],
  },
  {
    tag: "사",
    form: "운영",
    describe: "표면이 S1인 L-05가 UNVERIFIED이고 목적 벡터가 상담 표면만 엶",
    statuses: { "L-05": "UNVERIFIED" },
    request: production("I", ["S2", "S3"]),
    exit0: true,
    outputHas: ["내부 시험 공개 가능"],
  },
  {
    tag: "아",
    form: "운영",
    describe: "같은 L-05가 UNVERIFIED이고 목적 벡터가 S1을 엶",
    statuses: { "L-05": "UNVERIFIED" },
    request: production("I", ["S1"]),
    exit0: false,
    outputHas: ["L-05"],
  },
  {
    tag: "자",
    form: "운영",
    describe: "표면이 S2·S3인 R-01이 UNVERIFIED이고 목적 벡터가 S2를 엶",
    statuses: { "R-01": "UNVERIFIED" },
    request: production("I", ["S2"]),
    exit0: false,
    outputHas: ["R-01"],
  },
  {
    tag: "차",
    form: "로컬",
    describe: "S1을 열고 운영 한정 항목 L-01·L-05·R-04가 UNVERIFIED, 나머지는 READY",
    statuses: UNVERIFIED_PRODUCTION_ONLY,
    request: local(["S1"]),
    exit0: true,
    outputHas: [
      "L-01: 해당 없음(local)",
      "L-05: 해당 없음(local)",
      "R-04: 해당 없음(local)",
      "로컬 시험 가능",
    ],
    outputLacks: ["로컬 시험 불가"],
  },
  {
    tag: "카",
    form: "운영",
    describe: "(차)와 같은 기록을 운영 단계 I 점검으로 점검",
    statuses: UNVERIFIED_PRODUCTION_ONLY,
    request: production("I", ["S1"]),
    exit0: false,
    outputHas: ["L-01", "L-05", "R-04"],
    outputLacks: ["해당 없음(local)"],
  },
  {
    tag: "타",
    form: "로컬",
    describe: "L-04가 UNVERIFIED이고 L-01·L-05·R-04는 READY",
    statuses: { "L-04": "UNVERIFIED" },
    request: local(["S1"]),
    exit0: false,
    outputHas: ["L-04", "로컬 시험 불가"],
  },
  {
    tag: "파",
    form: "형태 오류",
    describe: "실행 환경 입력이 없음",
    statuses: {},
    request: { stage: "I", surfaces: ALL_SURFACES },
    exit0: false,
    outputHas: ["실행 환경 입력이 없다"],
    outputLacks: ["로컬 시험 가능", "내부 시험 공개 가능", "일반 사용자 공개 가능"],
  },
  {
    tag: "하",
    form: "형태 오류",
    describe: "실행 환경 입력이 열거 밖 값(staging)",
    statuses: {},
    request: { environment: "staging", stage: "I", surfaces: ALL_SURFACES },
    exit0: false,
    outputHas: ["staging", "열거 밖"],
    outputLacks: ["로컬 시험 가능", "내부 시험 공개 가능", "일반 사용자 공개 가능"],
  },
  {
    tag: "거",
    form: "형태 오류",
    describe: "실행 환경 local + 목적 단계 G, 그 밖은 (가)와 같음",
    statuses: {},
    request: { environment: "local", stage: "G", surfaces: ALL_SURFACES },
    exit0: false,
    outputHas: [
      "local 요청은 목적 단계를 받지 않는다",
      "운영 단계 점검은 production에서만 가능하다",
    ],
    outputLacks: ["로컬 시험 가능", "일반 사용자 공개 가능"],
  },
  {
    tag: "너",
    form: "로컬",
    describe: "R-02(엔진 준비 증거 참조)가 UNVERIFIED",
    statuses: { "R-02": "UNVERIFIED" },
    request: local(["S1"]),
    exit0: false,
    outputHas: ["R-02", "로컬 시험 불가"],
  },
  {
    tag: "더",
    form: "로컬",
    describe: "R-03(확정 동의 문구 참조)이 UNVERIFIED",
    statuses: { "R-03": "UNVERIFIED" },
    request: local(["S1"]),
    exit0: false,
    outputHas: ["R-03", "로컬 시험 불가"],
  },
  {
    tag: "러",
    form: "형태 오류",
    describe: "실행 환경 local + 목적 단계 I, 그 밖은 (차)와 같음",
    statuses: UNVERIFIED_PRODUCTION_ONLY,
    request: { environment: "local", stage: "I", surfaces: ["S1"] },
    exit0: false,
    outputHas: [
      "local 요청은 목적 단계를 받지 않는다",
      "운영 단계 점검은 production에서만 가능하다",
    ],
    outputLacks: ["로컬 시험 가능"],
  },
  {
    tag: "머",
    form: "형태 오류",
    describe: "실행 환경 production + 목적 단계 입력 없음, 그 밖은 (가)와 같음",
    statuses: {},
    request: { environment: "production", surfaces: ALL_SURFACES },
    exit0: false,
    outputHas: ["production에는 목적 단계 I 또는 G가 필요하다"],
    outputLacks: ["내부 시험 공개 가능", "일반 사용자 공개 가능"],
  },
];

describe("AC-B2CLAUNCH-002 — 열아홉 fixture(가)~(머)", () => {
  it("fixture는 정확히 열아홉 가지이고 꼬리표가 acceptance.md와 같다", () => {
    expect(FIXTURES).toHaveLength(19);
    expect(FIXTURES.map((fixture) => fixture.tag).join("")).toBe(
      "가나다라마바사아자차카타파하거너더러머"
    );
    expect(FIXTURES.filter((fixture) => fixture.form === "운영")).toHaveLength(10);
    expect(FIXTURES.filter((fixture) => fixture.form === "로컬")).toHaveLength(4);
    expect(FIXTURES.filter((fixture) => fixture.form === "형태 오류")).toHaveLength(5);
  });

  for (const fixture of FIXTURES) {
    it(`(${fixture.tag}) [${fixture.form}] ${fixture.describe} → ${fixture.exit0 ? "종료 코드 0" : "종료 코드 0이 아님"}`, () => {
      const result = run(fixture.statuses, fixture.request, fixture.extras);

      if (fixture.exit0) expect(result.exitCode, result.output).toBe(0);
      else expect(result.exitCode, result.output).not.toBe(0);
      for (const text of fixture.outputHas) expect(result.output).toContain(text);
      for (const text of fixture.outputLacks ?? []) expect(result.output).not.toContain(text);
    });
  }

  it("종료 코드 0은 (가)(바)(사)(차) 넷이고 0이 아닌 것은 열다섯이다", () => {
    const results = FIXTURES.map((fixture) => ({
      tag: fixture.tag,
      exitCode: run(fixture.statuses, fixture.request, fixture.extras).exitCode,
    }));

    expect(results.filter((r) => r.exitCode === 0).map((r) => r.tag)).toEqual([
      "가",
      "바",
      "사",
      "차",
    ]);
    expect(results.filter((r) => r.exitCode !== 0)).toHaveLength(15);
  });
});

describe("AC-B2CLAUNCH-002 — 판정 출력과 기록 불변", () => {
  it("(차) 점검 뒤에도 입력 기록의 L-01·L-05·R-04 상태 칸은 입력 때 값(UNVERIFIED) 그대로다", () => {
    const parsedItems = parseGateRecord(recordFor(UNVERIFIED_PRODUCTION_ONLY));
    if (!parsedItems.ok) throw new Error(parsedItems.errors.join("|"));
    const record = deepFreeze(parsedItems.items);
    const before = JSON.stringify(record);

    const signature = parseSignatureRecord(
      signatureFor(recordFor(UNVERIFIED_PRODUCTION_ONLY), "local", local(["S1"]))
    );
    if (!signature.ok) throw new Error(signature.errors.join("|"));
    const signatureBefore = JSON.stringify(signature.record);
    const frozenSignature: SignatureRecord = deepFreeze(signature.record);

    const sibling = syntheticSiblingEvidence(SIBLING_ITEM_IDS);
    const frozenSibling = deepFreeze({
      lines: sibling.lines,
      definitions: sibling.definitions,
      records: sibling.records,
    });
    const siblingBefore = JSON.stringify(frozenSibling);

    // 얼린 입력을 쓰므로 점검기가 기록을 고치려 하면 TypeError로 드러난다.
    const result = evaluateLaunchGate({
      items: deepFreeze(ITEM_ROWS.map((row) => ({ ...row }))),
      record,
      currentTargets: CURRENT_TARGETS,
      siblingReferences: frozenSibling,
      signature: frozenSignature,
      allowedRoles: ALLOWED_ROLES,
      request: local(["S1"]),
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.stringify(record)).toBe(before);
    expect(JSON.stringify(frozenSignature)).toBe(signatureBefore);
    expect(JSON.stringify(frozenSibling)).toBe(siblingBefore);
    for (const id of ["L-01", "L-05", "R-04"]) {
      expect(record.find((item) => item.id === id)?.status).toBe("UNVERIFIED");
    }
  });

  it("운영 단계 점검 통과는 내부 시험 공개 가능, G는 일반 사용자 공개 가능을 적는다", () => {
    const internal = run({}, production("I", ALL_SURFACES));
    const general = run({}, production("G", ALL_SURFACES));

    expect([internal.exitCode, internal.verdict]).toEqual([0, "내부 시험 공개 가능"]);
    expect([general.exitCode, general.verdict]).toEqual([0, "일반 사용자 공개 가능"]);
  });

  it("운영 단계 점검 실패는 단계별 불가 판정과 사유를 적는다", () => {
    const internal = run({ "L-04": "BLOCKED" }, production("I", ALL_SURFACES));
    const general = run({ "L-06": "UNVERIFIED" }, production("G", ALL_SURFACES));

    expect([internal.exitCode, internal.verdict]).toEqual([1, "내부 시험 공개 불가"]);
    expect([general.exitCode, general.verdict]).toEqual([1, "일반 사용자 공개 불가"]);
    expect(internal.output).toContain("L-04: BLOCKED");
    expect(general.output).toContain("L-06: UNVERIFIED");
  });

  it("목적 단계 열에서 필수가 아닌 항목이 BLOCKED여도 (가)와 같은 결과다", () => {
    // R-05는 I 칸이 해당 없음, L-03은 G 칸이 해당 없음이다.
    const internal = run({ "R-05": "BLOCKED" }, production("I", ALL_SURFACES));
    const general = run({ "L-03": "BLOCKED" }, production("G", ALL_SURFACES));

    expect([internal.exitCode, internal.verdict]).toEqual([0, "내부 시험 공개 가능"]);
    expect([general.exitCode, general.verdict]).toEqual([0, "일반 사용자 공개 가능"]);
  });

  it("실제 런북의 항목 표를 입력으로 넘겨도 spec.md 표와 같은 결과를 낸다", () => {
    for (const fixture of FIXTURES) {
      const fromSpec = run(fixture.statuses, fixture.request, fixture.extras);
      const fromRunbook = run(fixture.statuses, fixture.request, {
        ...fixture.extras,
        itemTableMarkdown: RUNBOOK_MARKDOWN,
      });

      expect(fromRunbook, `(${fixture.tag})`).toEqual(fromSpec);
    }
  });
});

describe("결정 대기 칸의 fail-closed 처리와 면제", () => {
  it("면제는 그 항목의 그 열의 결정 대기 칸에만 적용된다 — 필수 칸은 면제되지 않는다", () => {
    // L-04는 I 칸이 필수다.
    const result = run({ "L-04": "BLOCKED" }, production("I", ALL_SURFACES), {
      exemptions: [{ itemId: "L-04", column: "I" }],
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("L-04");
  });

  it("I 열 면제는 G 점검의 결정 대기 칸을 면제하지 않고 그 반대도 같다", () => {
    // R-02: I 칸 결정 대기, G 칸 필수 / L-02: I 칸 필수, G 칸 결정 대기.
    const wrongColumn = run({ "L-02": "UNVERIFIED" }, production("G", ALL_SURFACES), {
      exemptions: [{ itemId: "L-02", column: "I" }],
    });
    const rightColumn = run({ "L-02": "UNVERIFIED" }, production("G", ALL_SURFACES), {
      exemptions: [{ itemId: "L-02", column: "G" }],
    });

    expect(wrongColumn.exitCode).toBe(1);
    expect(wrongColumn.output).toContain("L-02");
    expect(rightColumn.exitCode).toBe(0);
  });

  it("결정 대기 칸의 항목이 READY이면 면제 없이도 통과한다", () => {
    expect(run({}, production("I", ALL_SURFACES)).exitCode).toBe(0);
  });

  it("로컬 시험 판정은 I 열을 읽으므로 I 열 면제가 로컬에도 적용된다", () => {
    const result = run({ "R-02": "UNVERIFIED" }, local(["S1"]), {
      exemptions: [{ itemId: "R-02", column: "I" }],
    });

    expect([result.exitCode, result.verdict]).toEqual([0, "로컬 시험 가능"]);
  });
});

describe("기록과 입력의 어긋남(fail-closed)", () => {
  it("필수 항목이 기록에 없으면 항목 식별자를 적고 판정하지 못한다", () => {
    const result = signedCheck({
      itemTableMarkdown: SPEC_MARKDOWN,
      recordMarkdown: recordFor({}, ["L-06"]),
      currentTargets: CURRENT_TARGETS,
      request: production("I", ALL_SURFACES),
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("L-06");
    expect(result.output).toContain("기록에 없다");
  });

  it("정의표에 없는 식별자가 기록에 있으면 그 식별자를 적고 입력을 거부한다", () => {
    const withExtra = `${recordFor()}\n| L-99 | 증명 | 위치-예시 | 역할-예시 | 날짜-예시 | 대상 | EV-L1 | READY |`;

    const result = signedCheck({
      itemTableMarkdown: SPEC_MARKDOWN,
      recordMarkdown: withExtra,
      currentTargets: CURRENT_TARGETS,
      request: production("I", ALL_SURFACES),
    });

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("L-99");
  });

  it("READY 항목의 대상 값이 현재 값과 다르면 UNVERIFIED로 판정하고 항목을 적는다(AC-005 (나))", () => {
    const result = run({}, production("I", ALL_SURFACES), {
      currentTargets: { ...CURRENT_TARGETS, "L-04": "대상-다른-값" },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("L-04: UNVERIFIED");
    expect(result.output).toContain("대상 값");
  });

  it("현재 대상 값이 넘어오지 않은 READY 항목은 통과시키지 않는다", () => {
    const withoutL04 = Object.fromEntries(
      Object.entries(CURRENT_TARGETS).filter(([id]) => id !== "L-04")
    );

    const result = run({}, production("I", ALL_SURFACES), { currentTargets: withoutL04 });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("L-04");
  });

  it("관측 뒤의 EV-L2 사건이 넘어오면 그 READY 항목은 UNVERIFIED다(AC-005 (다))", () => {
    const result = run({}, production("I", ALL_SURFACES), {
      eventsAfterObservation: { "L-01": ["EV-L2"] },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("L-01: UNVERIFIED");
    expect(result.output).toContain("EV-L2");
  });

  it("점검기는 사건 발생을 스스로 감지하지 못한다 — 넘기지 않은 사건은 결과에 영향이 없다", () => {
    expect(run({}, production("I", ALL_SURFACES)).exitCode).toBe(0);
  });

  it("로컬 시험 판정에서는 운영 한정 항목을 읽지 않으므로 그 항목의 사건·대상 값 어긋남도 결과를 바꾸지 않는다", () => {
    const result = run({}, local(["S1"]), {
      currentTargets: { ...CURRENT_TARGETS, "L-01": "대상-다른-값" },
      eventsAfterObservation: { "L-05": ["EV-L1"] },
    });

    expect([result.exitCode, result.verdict]).toEqual([0, "로컬 시험 가능"]);
  });

  it("항목 정의표를 찾지 못한 입력은 종료 코드 2로 거부한다", () => {
    const result = run({}, production("I", ALL_SURFACES), { itemTableMarkdown: "# 표 없음" });

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("항목 정의표");
  });

  it("목적 벡터에 S1·S2·S3 밖의 값이 있으면 그 값을 적고 거부한다", () => {
    const result = run({}, production("I", ["S1", "S4"]));

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("S4");
  });

  it("요청 형태 오류는 기록·표를 읽기 전에 거부한다(표가 깨져 있어도 요청 오류가 먼저다)", () => {
    const result = run(
      {},
      { environment: "staging", surfaces: [] },
      { itemTableMarkdown: "# 표 없음" }
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("열거 밖");
    expect(result.output).not.toContain("항목 정의표");
  });
});

// ---- CLI(자식 프로세스) -------------------------------------------------------------------

describe("CLI — pnpm exec tsx scripts/check-launch-gate.ts", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  });

  function files(
    statuses: Record<string, string>,
    request: CheckRequest,
    signatureEnvironment = request.environment ?? "production"
  ): { record: string; targets: string; signature: string; siblingArgs: string[] } {
    tmpDir = mkdtempSync(path.join(tmpdir(), "check-launch-gate-"));
    const record = path.join(tmpDir, "record.md");
    const targets = path.join(tmpDir, "targets.json");
    const signature = path.join(tmpDir, "signature.md");
    writeFileSync(record, recordFor(statuses), "utf-8");
    writeFileSync(targets, JSON.stringify(CURRENT_TARGETS), "utf-8");
    writeFileSync(
      signature,
      signatureFor(recordFor(statuses), signatureEnvironment, request),
      "utf-8"
    );
    const sibling = siblingCliParts(syntheticSiblingEvidence(SIBLING_ITEM_IDS), (name) =>
      path.join(tmpDir, name)
    );
    for (const [file, content] of Object.entries(sibling.files))
      writeFileSync(file, content, "utf-8");
    return { record, targets, signature, siblingArgs: sibling.args };
  }

  function runCli(args: string[]) {
    return spawnSync(process.execPath, [tsxCliPath, scriptPath, ...args], {
      cwd: projectRoot,
      encoding: "utf-8",
    });
  }

  it("통과하는 로컬 시험 판정은 종료 코드 0이고 판정과 해당 없음(local) 표지를 stdout에 적는다", () => {
    const { record, targets, signature, siblingArgs } = files(
      UNVERIFIED_PRODUCTION_ONLY,
      local(["S1"])
    );

    const result = runCli([
      "--items",
      SPEC_PATH,
      "--record",
      record,
      "--targets",
      targets,
      ...siblingArgs,
      "--signature",
      signature,
      "--allowed-roles",
      ALLOWED_ROLES_ARG,
      "--environment",
      "local",
      "--surfaces",
      "S1",
    ]);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("로컬 시험 가능");
    expect(result.stdout).toContain("L-01: 해당 없음(local)");
  });

  it("판정이 불가인 운영 단계 점검은 종료 코드 1이고 항목 식별자를 stdout에 적는다", () => {
    const { record, targets } = files({ "L-04": "BLOCKED" }, production("I", ALL_SURFACES));

    const result = runCli([
      "--items",
      SPEC_PATH,
      "--record",
      record,
      "--targets",
      targets,
      "--environment",
      "production",
      "--stage",
      "I",
      "--surfaces",
      "S1,S2,S3",
    ]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("L-04");
    expect(result.stdout).toContain("내부 시험 공개 불가");
  });

  it("--signature 없이 실행하면 항목이 모두 READY여도 종료 코드 1이고 서명 없음을 stdout에 적는다(fail-closed)", () => {
    const { record, targets } = files({}, production("G", ALL_SURFACES));

    const result = runCli([
      "--items",
      SPEC_PATH,
      "--record",
      record,
      "--targets",
      targets,
      "--allowed-roles",
      ALLOWED_ROLES_ARG,
      "--environment",
      "production",
      "--stage",
      "G",
      "--surfaces",
      "S1,S2,S3",
    ]);

    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout).toContain("서명 없음");
    expect(result.stdout).toContain("일반 사용자 공개 불가");
    expect(result.stdout).not.toContain("일반 사용자 공개 가능");
  });

  it("서명의 실행 환경 칸 오류는 종료 코드 2로 거부하고 이유를 stderr에 적는다", () => {
    const { record, targets, signature } = files({}, production("I", ALL_SURFACES));
    writeFileSync(
      signature,
      signatureFor(recordFor(), "staging", production("I", ALL_SURFACES)),
      "utf-8"
    );

    const result = runCli([
      "--items",
      SPEC_PATH,
      "--record",
      record,
      "--targets",
      targets,
      "--signature",
      signature,
      "--allowed-roles",
      ALLOWED_ROLES_ARG,
      "--environment",
      "production",
      "--stage",
      "I",
      "--surfaces",
      "S1,S2,S3",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("서명 기록 오류");
    expect(result.stdout).toBe("");
  });

  it("열거 밖 실행 환경은 종료 코드 2로 거부하고 이유를 stderr에 적는다", () => {
    const { record, targets } = files({}, production("I", ["S1"]));

    const result = runCli([
      "--items",
      SPEC_PATH,
      "--record",
      record,
      "--targets",
      targets,
      "--environment",
      "staging",
      "--stage",
      "I",
      "--surfaces",
      "S1",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("열거 밖");
    expect(result.stdout).toBe("");
  });

  it("실행 환경 인자가 없으면 기본값을 가정하지 않고 종료 코드 2로 거부한다", () => {
    const { record, targets } = files({}, production("I", ["S1"]));

    const result = runCli([
      "--items",
      SPEC_PATH,
      "--record",
      record,
      "--targets",
      targets,
      "--surfaces",
      "S1",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("실행 환경 입력이 없다");
  });

  it("필수 인자(--record)가 없으면 사용법 오류로 종료 코드 2다", () => {
    const result = runCli(["--items", SPEC_PATH, "--environment", "local", "--surfaces", "S1"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--record");
  });
});

// ---- runCli(프로세스 안, 파일 읽기는 가짜로 대체) ---------------------------------------------

describe("runCli — 인자와 입력 파일 읽기", () => {
  function reader(files: Readonly<Record<string, string>>) {
    return (file: string): string => {
      if (!(file in files)) throw new Error(`없는 파일: ${file}`);
      return files[file];
    };
  }

  const baseFiles = {
    "items.md": SPEC_MARKDOWN,
    "record.md": recordFor({ "R-02": "UNVERIFIED" }),
    "targets.json": JSON.stringify(CURRENT_TARGETS),
  };
  const baseArgs = [
    "--items",
    "items.md",
    "--record",
    "record.md",
    "--environment",
    "production",
    "--stage",
    "I",
    "--surfaces",
    "S1,S2,S3",
  ];

  it("--targets·--exemptions를 읽어 면제가 적용된 판정을 낸다", () => {
    const files = {
      ...baseFiles,
      "exemptions.json": JSON.stringify([{ itemId: "R-02", column: "I" }]),
    };

    const result = signedCli(
      [...baseArgs, "--targets", "targets.json", "--exemptions", "exemptions.json"],
      reader(files)
    );

    expect([result.exitCode, result.verdict]).toEqual([0, "내부 시험 공개 가능"]);
  });

  it("--events로 넘긴 관측 뒤 사건은 해당 READY 항목을 UNVERIFIED로 만든다", () => {
    const files = {
      ...baseFiles,
      "events.json": JSON.stringify({ "L-01": ["EV-L2"] }),
      "exemptions.json": JSON.stringify([{ itemId: "R-02", column: "I" }]),
    };

    const result = runCli(
      [
        ...baseArgs,
        "--targets",
        "targets.json",
        "--exemptions",
        "exemptions.json",
        "--events",
        "events.json",
      ],
      reader(files)
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("L-01: UNVERIFIED");
  });

  it("--targets를 넘기지 않으면 현재 대상 값을 모르므로 READY 항목이 통과하지 못한다(fail-closed)", () => {
    const result = runCli(baseArgs, reader(baseFiles));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("L-04: UNVERIFIED");
  });

  it("--surfaces가 빈 문자열이면 목적 벡터 없음으로 읽는다", () => {
    const result = runCli(
      ["--items", "items.md", "--record", "record.md", "--environment", "local", "--surfaces", ""],
      reader({ ...baseFiles, "record.md": recordFor() })
    );

    expect(result.output).toContain("목적 벡터: 없음");
  });

  it("JSON이 아니거나 모양이 다른 입력 파일은 종료 코드 2의 사용법 오류다", () => {
    const run = (flag: string, content: string) =>
      runCli([...baseArgs, flag, "extra.json"], reader({ ...baseFiles, "extra.json": content }));

    expect(run("--targets", "{").output).toContain("--targets 파일이 JSON이 아니다");
    expect(run("--targets", "[]").output).toContain("--targets 파일은");
    expect(run("--targets", '{"L-01": 3}').output).toContain("형태여야 한다");
    expect(run("--events", '{"L-01": "EV-L1"}').output).toContain("--events 파일은");
    expect(run("--exemptions", '[{"itemId": "R-02", "column": "X"}]').output).toContain(
      "--exemptions 파일은"
    );
    expect(run("--exemptions", "{}").exitCode).toBe(2);
  });

  it("읽지 못하는 파일·알 수 없는 인자·값 없는 인자·빠진 필수 인자는 종료 코드 2다", () => {
    const missingFile = runCli(baseArgs, reader({ "record.md": baseFiles["record.md"] }));
    const unknownFlag = runCli(["--nope", "x"], reader(baseFiles));
    const notAFlag = runCli(["items.md"], reader(baseFiles));
    const noValue = runCli(["--items"], reader(baseFiles));
    const noSurfaces = runCli(
      ["--items", "items.md", "--record", "record.md", "--environment", "local"],
      reader(baseFiles)
    );

    expect(missingFile.exitCode).toBe(2);
    expect(missingFile.output).toContain("--items 파일을 읽지 못했다(items.md)");
    expect(unknownFlag.output).toContain('알 수 없는 인자 "--nope"');
    expect(notAFlag.output).toContain('알 수 없는 인자 "items.md"');
    expect(noValue.output).toContain("--items에 값이 없다");
    expect(noSurfaces.output).toContain("--surfaces 인자가 필요하다");
    for (const result of [unknownFlag, notAFlag, noValue, noSurfaces]) {
      expect(result.exitCode).toBe(2);
    }
  });
});

// ---- M1c: 형제 증거 참조 줄 (AC-B2CLAUNCH-004) ---------------------------------------------

describe("AC-B2CLAUNCH-004 — 점검기의 형제 증거 참조 줄 처리", () => {
  const CONSULTOPS_SPEC = "SPEC-B2C-CONSULTOPS-001";
  const consultopsDefinitions: Readonly<Record<string, SiblingDefinitionSource>> = {
    [CONSULTOPS_SPEC]: {
      markdown: readText(path.join(projectRoot, ".moai", "specs", CONSULTOPS_SPEC, "spec.md")),
      labels: ["ID", "증거 항목", "I", "G", "근거", "대상 / 무효화 사건"],
    },
  };

  // 형제 기록 stub: 실제 형제 증거 기록은 아직 없으므로 시험이 입력으로 만든 합성 값이다.
  const siblingRecords = {
    [siblingRecordKey(CONSULTOPS_SPEC, "E-03")]: { status: "READY", target: "형제값-예시-1" },
  };

  // 이 describe의 시험은 R-04 한 줄을 시험 대상으로 삼는다. 실제로 적용되는 다른 필수 R 항목도 완전한 형제 증거가
  // 있어야 하므로 `refTable`이 줄을 적지 않은 형제 참조 항목에 합성 참조 줄을 더하고, `runWithRefs`가 합성
  // 정의표·형제 기록을 더한다. 줄을 일부러 뺀 경우는 아래 "필수 형제 참조" 회귀 describe가 따로 시험한다.
  const baseEvidence = syntheticSiblingEvidence(SIBLING_ITEM_IDS);

  function refTable(...rows: string[]): string {
    const header = `| ${SIBLING_REF_COLUMNS.join(" | ")} |`;
    const separator = `|${SIBLING_REF_COLUMNS.map(() => "---").join("|")}|`;
    const covered = rows.map((row) => row.split("|")[1]?.trim());
    const baseRows = baseEvidence.rows
      .filter((cells) => !covered.includes(cells[0]))
      .map((cells) => `| ${cells.join(" | ")} |`);
    return [header, separator, ...rows, ...baseRows].join("\n");
  }

  function refRow(
    launchItem: string,
    siblingItem: string,
    status = "READY",
    target = "형제값-예시-1"
  ) {
    return `| ${launchItem} | ${CONSULTOPS_SPEC} | ${siblingItem} | ${status} | ${target} | 형제위치-예시 |`;
  }

  function runWithRefs(
    markdown: string,
    options: {
      statuses?: Record<string, string>;
      records?: Record<string, { status: string; target: string }>;
      definitions?: Readonly<Record<string, SiblingDefinitionSource>>;
      request?: CheckRequest;
    } = {}
  ): CheckResult {
    const mergedRecords = { ...baseEvidence.records, ...(options.records ?? siblingRecords) };
    // R 항목의 대상 칸은 현재 형제 증거 대상 값이다 — 이 시험의 형제 증거(CONSULTOPS 줄)로 계산한 값을 적는다.
    const parsed = parseSiblingReferences(markdown);
    const recordTargets = parsed.ok ? evidenceTargetsFor(parsed.lines, mergedRecords) : {};
    return signedCheck({
      itemTableMarkdown: SPEC_MARKDOWN,
      recordMarkdown: recordFor(options.statuses ?? {}, [], {}, recordTargets),
      currentTargets: { ...CURRENT_TARGETS, ...recordTargets },
      request: options.request ?? production("I", ALL_SURFACES),
      siblingReferenceMarkdown: markdown,
      siblingDefinitions: {
        ...baseEvidence.definitions,
        ...(options.definitions ?? consultopsDefinitions),
      },
      siblingRecords: mergedRecords,
    });
  }

  it("(가) 존재하는 형제 항목을 가리키고 형제 기록과 같은 값을 옮긴 참조 줄은 점검을 막지 않는다", () => {
    const result = runWithRefs(refTable(refRow("R-04", "E-03")));

    expect([result.exitCode, result.verdict]).toEqual([0, "내부 시험 공개 가능"]);
    expect(result.output).toContain("R-04: READY");
  });

  it("(나) 존재하지 않는 형제 항목 식별자는 종료 코드 2로 거부하고 식별자를 적는다", () => {
    const result = runWithRefs(refTable(refRow("R-04", "E-99")));

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("존재하지 않는 형제 항목 식별자");
    expect(result.output).toContain("E-99");
  });

  it("(다) 자체 판정 칸이 있는 참조 줄은 종료 코드 2로 거부한다", () => {
    const markdown = [
      `| ${SIBLING_REF_COLUMNS.join(" | ")} | 판정 |`,
      `|${[...SIBLING_REF_COLUMNS, "판정"].map(() => "---").join("|")}|`,
      `${refRow("R-04", "E-03")} READY |`,
    ].join("\n");

    const result = runWithRefs(markdown);

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("참조 줄은 형제 상태만 옮길 수 있다");
    expect(result.output).toContain("형제 참조 오류");
  });

  it("(라) 옮겨 적은 대상 값이 형제 기록의 현재 값과 다르면 그 줄의 항목이 EV-L3로 UNVERIFIED가 되어 점검이 불가다", () => {
    const result = runWithRefs(refTable(refRow("R-04", "E-03", "READY", "형제값-예시-9")));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("R-04: UNVERIFIED");
    expect(result.output).toContain("EV-L3");
    expect(result.output).toContain("내부 시험 공개 불가");
    expect(result.output).not.toContain("형제값-예시");
  });

  it("형제 기록 내용을 넘기지 않으면 비교할 수 없어 같은 항목이 UNVERIFIED다(fail-closed)", () => {
    const result = runWithRefs(refTable(refRow("R-04", "E-03")), { records: {} });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("R-04: UNVERIFIED");
    expect(result.output).toContain("비교할 수");
  });

  it("이미 BLOCKED인 항목은 참조 줄이 어긋나도 BLOCKED 그대로다(올리거나 바꾸지 않는다)", () => {
    const result = runWithRefs(refTable(refRow("R-04", "E-03", "READY", "형제값-예시-9")), {
      statuses: { "R-04": "BLOCKED" },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("R-04: BLOCKED");
  });

  it("이 SPEC 항목 칸이 항목 정의표에 없는 식별자이면 종료 코드 2로 거부한다", () => {
    const result = runWithRefs(refTable(refRow("R-99", "E-03")));

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("R-99");
  });

  it("연결 칸(이 SPEC 항목)이 비어 있는 줄은 종료 코드 2로 거부하고 칸 이름을 적는다", () => {
    const result = runWithRefs(refTable(refRow("", "E-03")));

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("형제 참조 오류");
    expect(result.output).toContain('"이 SPEC 항목" 칸이 비어 있다');
  });

  it("연결 칸이 헤더에 없는 다섯 칸 표는 종료 코드 2로 거부하고 어떤 항목도 UNVERIFIED로 만들지 않는다", () => {
    const withoutLink = SIBLING_REF_COLUMNS.slice(1);
    const markdown = [
      `| ${withoutLink.join(" | ")} |`,
      `|${withoutLink.map(() => "---").join("|")}|`,
      `| ${CONSULTOPS_SPEC} | E-03 | READY | 형제값-예시-9 | 형제위치-예시 |`,
    ].join("\n");

    const result = runWithRefs(markdown);

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("형제 참조 오류");
    expect(result.output).not.toContain("UNVERIFIED");
  });

  it("정의표가 입력되지 않은 형제 SPEC의 참조는 종료 코드 2로 거부한다", () => {
    const result = runWithRefs(refTable(refRow("R-04", "E-03")), { definitions: {} });

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain(CONSULTOPS_SPEC);
  });

  it("운영 한정 항목(R-04)은 local에서 적용되지 않으므로 참조 줄이 어긋나도 판정을 바꾸지 않는다", () => {
    const result = runWithRefs(refTable(refRow("R-04", "E-03", "READY", "형제값-예시-9")), {
      request: local(ALL_SURFACES),
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("R-04: 해당 없음(local)");
  });

  it("참조 줄 문서 없이 정의표와 형제 기록만 넘겨도 적용되는 필수 R 항목은 통과하지 못한다(참조 줄은 선택이 아니다)", () => {
    const result = signedCheck({
      itemTableMarkdown: SPEC_MARKDOWN,
      recordMarkdown: recordFor(),
      currentTargets: CURRENT_TARGETS,
      request: production("I", ALL_SURFACES),
      siblingRecords,
      siblingDefinitions: consultopsDefinitions,
    });

    expect(result.exitCode).toBe(1);
    for (const id of ["R-01", "R-02", "R-03", "R-04"]) {
      expect(result.output).toContain(`${id}: UNVERIFIED`);
    }
  });
});

describe("runCli — 형제 증거 참조 인자", () => {
  const CONSULTOPS_SPEC = "SPEC-B2C-CONSULTOPS-001";
  // R-04 한 줄은 실제 CONSULTOPS-001 정의표를 조회하고, 나머지 형제 참조 항목은 합성 형제 증거로 채운다.
  const others = syntheticSiblingEvidence(SIBLING_ITEM_IDS.filter((id) => id !== "R-04"));
  const cliSiblingRecords = {
    ...others.records,
    [siblingRecordKey(CONSULTOPS_SPEC, "E-03")]: { status: "READY", target: "형제값-예시-1" },
  };
  // R 항목의 대상 칸은 현재 형제 증거 대상 값이다 — R-04는 CONSULTOPS 줄로 계산한 값을 적는다.
  const cliRecordTargets = evidenceTargetsFor(
    [
      {
        launchItem: "R-04",
        siblingSpec: CONSULTOPS_SPEC,
        siblingItem: "E-03",
        status: "READY",
        target: "형제값-예시-1",
        location: "형제위치-예시",
      },
      ...others.lines,
    ],
    cliSiblingRecords
  );
  const files: Record<string, string> = {
    "items.md": SPEC_MARKDOWN,
    "record.md": recordFor({}, [], {}, cliRecordTargets),
    "targets.json": JSON.stringify({ ...CURRENT_TARGETS, ...cliRecordTargets }),
    "consultops.md": readText(path.join(projectRoot, ".moai", "specs", CONSULTOPS_SPEC, "spec.md")),
    "syn-defs-table.md": others.definitions[SYNTHETIC_SIBLING_SPEC].markdown,
    "defs.json": JSON.stringify({
      [CONSULTOPS_SPEC]: {
        file: "consultops.md",
        labels: ["ID", "증거 항목", "I", "G", "근거", "대상 / 무효화 사건"],
      },
      [SYNTHETIC_SIBLING_SPEC]: {
        file: "syn-defs-table.md",
        labels: others.definitions[SYNTHETIC_SIBLING_SPEC].labels,
      },
    }),
    "records.json": JSON.stringify(cliSiblingRecords),
  };
  const refsFor = (target: string) =>
    [
      `| ${SIBLING_REF_COLUMNS.join(" | ")} |`,
      `|${SIBLING_REF_COLUMNS.map(() => "---").join("|")}|`,
      `| R-04 | ${CONSULTOPS_SPEC} | E-03 | READY | ${target} | 형제위치-예시 |`,
      ...others.rows.map((cells) => `| ${cells.join(" | ")} |`),
    ].join("\n");

  const reader =
    (extra: Record<string, string>) =>
    (file: string): string => {
      const all = { ...files, ...extra };
      if (!(file in all)) throw new Error(`없는 파일: ${file}`);
      return all[file];
    };
  const baseArgs = [
    "--items",
    "items.md",
    "--record",
    "record.md",
    "--environment",
    "production",
    "--stage",
    "I",
    "--surfaces",
    "S1,S2,S3",
    "--targets",
    "targets.json",
  ];
  const siblingArgs = [
    "--sibling-refs",
    "refs.md",
    "--sibling-defs",
    "defs.json",
    "--sibling-records",
    "records.json",
  ];

  it("세 인자로 참조 줄·정의표·형제 기록을 읽어 통과 판정을 낸다", () => {
    const result = signedCli(
      [...baseArgs, ...siblingArgs],
      reader({ "refs.md": refsFor("형제값-예시-1") })
    );

    expect([result.exitCode, result.verdict]).toEqual([0, "내부 시험 공개 가능"]);
  });

  it("옮겨 적은 대상 값이 다르면 종료 코드 1이다", () => {
    const result = runCli(
      [...baseArgs, ...siblingArgs],
      reader({ "refs.md": refsFor("형제값-예시-9") })
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("R-04: UNVERIFIED");
  });

  it("--sibling-records를 넘기지 않으면 비교할 수 없어 UNVERIFIED다", () => {
    const result = runCli(
      [...baseArgs, "--sibling-refs", "refs.md", "--sibling-defs", "defs.json"],
      reader({ "refs.md": refsFor("형제값-예시-1") })
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("비교할 수");
  });

  it("--sibling-defs·--sibling-records만 있고 --sibling-refs가 없으면 사용법 오류다", () => {
    const withDefs = runCli([...baseArgs, "--sibling-defs", "defs.json"], reader({}));
    const withRecords = runCli([...baseArgs, "--sibling-records", "records.json"], reader({}));

    for (const result of [withDefs, withRecords]) {
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain("--sibling-refs");
    }
  });

  it("정의표 입력이 JSON이 아니거나 모양이 다르거나 가리킨 파일을 읽지 못하면 종료 코드 2다", () => {
    const run = (defs: string) =>
      runCli(
        [...baseArgs, ...siblingArgs],
        reader({ "refs.md": refsFor("형제값-예시-1"), "defs.json": defs })
      );

    expect(run("{").output).toContain("--sibling-defs 파일이 JSON이 아니다");
    expect(run("[]").output).toContain("--sibling-defs 파일은");
    expect(run('{"SPEC-X": {"file": 3, "labels": []}}').output).toContain("형태여야 한다");
    const missing = run(
      JSON.stringify({ [CONSULTOPS_SPEC]: { file: "없는-정의표.md", labels: ["ID"] } })
    );
    expect(missing.exitCode).toBe(2);
    expect(missing.output).toContain("없는-정의표.md");
  });

  it("형제 기록 입력의 모양이 다르면 종료 코드 2다", () => {
    const result = runCli(
      [...baseArgs, ...siblingArgs],
      reader({ "refs.md": refsFor("형제값-예시-1"), "records.json": '{"a": {"status": 1}}' })
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("--sibling-records 파일은");
  });
});

// ---- M1d: go 서명 점검 (AC-B2CLAUNCH-008, REQ-B2CLAUNCH-008) --------------------------------
// 서명자 구성(D-LAUNCH-04 (c)의 세 역할 전부가 서명해야 하는지, U3)은 확인 대기라 이 시험도 강제하지 않는다:
// 아래 (마)(바)(사)의 "서명자 구성" 부분은 acceptance.md AC-B2CLAUNCH-008 선결대로 BLOCKED로 남고,
// 시험은 역할 목록 소속(허용 역할)만 본다.

// M1e: 서명이 덮는 항목 집합은 요청의 필수 항목 집합과 같아야 한다(REQ-B2CLAUNCH-008 개정, AC (카) 추가).
// 아래 도우미는 서명 시점 항목 표를 요청의 필수 항목 집합으로 만든다 — 집합 밖 항목(목적 단계 열이 해당 없음,
// 목적 벡터가 열지 않는 표면, local의 운영 한정 항목, 면제된 결정 대기 칸)은 서명 대상이 아니다.

describe("AC-B2CLAUNCH-008 — 서명 fixture 열한 가지(가)~(카)", () => {
  const ALL_READY = recordFor();

  /** 서명 시점 항목 표: 요청의 필수 항목을 기록의 값 그대로 담되 `omit`는 뺀다. */
  function snapshotOf(request: CheckRequest, omit: readonly string[] = []): string[][] {
    const parsed = parseGateRecord(ALL_READY);
    if (!parsed.ok) throw new Error(parsed.errors.join("|"));
    const required = requiredIdsFor(request);
    return parsed.items
      .filter((item) => required.includes(item.id) && !omit.includes(item.id))
      .map((item) => [item.id, item.status, item.target]);
  }

  const sign = (
    environment: string,
    request: CheckRequest,
    role = "제품 책임자",
    omit: readonly string[] = []
  ) => renderSignature([[role, "날짜-예시", environment]], snapshotOf(request, omit));

  const PROD_I = production("I", ALL_SURFACES);
  const PROD_G = production("G", ALL_SURFACES);
  const LOCAL_S1 = local(["S1"]);

  interface SignatureFixture {
    tag: string;
    form: "운영" | "로컬";
    describe: string;
    requests: CheckRequest[];
    statuses?: Record<string, string>;
    signature: string | undefined;
    exitCode: 0 | 1 | 2;
    outputHas: string[];
    outputLacks?: string[];
  }

  const FIXTURES_008: SignatureFixture[] = [
    {
      tag: "가",
      form: "운영",
      describe: "목적 단계의 서명 기록이 있고 서명 이후 항목이 모두 READY",
      requests: [PROD_I],
      signature: sign("production", PROD_I),
      exitCode: 0,
      outputHas: ["서명 점검: 통과", "내부 시험 공개 가능"],
    },
    {
      tag: "나",
      form: "운영",
      describe: "서명 기록이 없음",
      requests: [PROD_G],
      signature: undefined,
      exitCode: 1,
      outputHas: ["서명 없음", "일반 사용자 공개 불가"],
      outputLacks: ["일반 사용자 공개 가능"],
    },
    {
      tag: "다",
      form: "운영",
      // 서명은 필수 항목 집합과 같은 항목만 덮으므로(M1e) 서명 뒤 UNVERIFIED가 되는 항목은 그 단계의 필수 항목이다 —
      // 이전에는 I 열이 해당 없음인 R-05를 골라 서명 점검만 실패하게 했으나 그런 항목은 이제 서명에 담지 못한다.
      describe: "서명 이후 기록 안의 항목(L-09) 하나가 UNVERIFIED가 됨",
      requests: [PROD_I],
      statuses: { "L-09": "UNVERIFIED" },
      signature: sign("production", PROD_I),
      exitCode: 1,
      outputHas: ["서명 점검: 서명 뒤 L-09가 UNVERIFIED가 되었다", "내부 시험 공개 불가"],
      outputLacks: ["내부 시험 공개 가능"],
    },
    {
      tag: "라",
      form: "운영",
      describe: "서명한 역할이 허용 역할 목록에 없음",
      requests: [PROD_I],
      signature: sign("production", PROD_I, "역할-밖-예시"),
      exitCode: 1,
      outputHas: ["서명 점검: 서명 행 1의 역할이 허용 역할 목록에 없다"],
      outputLacks: ["내부 시험 공개 가능", "역할-밖-예시"],
    },
    {
      tag: "마",
      form: "로컬",
      describe:
        "실행 환경 local의 I 서명 기록(운영 한정 항목은 서명 대상이 아님)이 있고 이후 모두 READY",
      requests: [LOCAL_S1],
      signature: sign("local", LOCAL_S1, "운영 책임자"),
      exitCode: 0,
      outputHas: ["서명 점검: 통과", "로컬 시험 가능"],
    },
    {
      tag: "바",
      form: "로컬",
      describe: "로컬 시험 판정에 서명 기록이 없음",
      requests: [LOCAL_S1],
      signature: undefined,
      exitCode: 1,
      outputHas: ["서명 없음", "로컬 시험 불가"],
      outputLacks: ["로컬 시험 가능"],
    },
    {
      tag: "사",
      form: "로컬",
      describe: "로컬 시험 판정의 서명 뒤 R-02가 UNVERIFIED가 됨",
      requests: [LOCAL_S1],
      statuses: { "R-02": "UNVERIFIED" },
      signature: sign("local", LOCAL_S1, "법무"),
      exitCode: 1,
      outputHas: ["서명 점검: 서명 뒤 R-02가 UNVERIFIED가 되었다", "로컬 시험 불가"],
      outputLacks: ["로컬 시험 가능"],
    },
    {
      tag: "아",
      form: "운영",
      describe: "서명 기록의 실행 환경 칸이 없거나 local·production 밖의 값(요청 형태와 무관)",
      requests: [PROD_I, LOCAL_S1],
      signature: undefined, // 아래에서 변형별로 만든다
      exitCode: 2,
      outputHas: ["서명 기록 오류", "실행 환경"],
      outputLacks: ["공개 가능", "로컬 시험 가능", "staging"],
    },
    {
      tag: "자",
      form: "운영",
      describe: "운영 단계 점검에 실행 환경 칸이 local인 서명 기록만 있음",
      requests: [PROD_I],
      // 서명이 덮는 항목은 요청의 필수 항목 집합과 같게 두어 실행 환경 불일치만 이유로 남긴다.
      signature: sign("local", PROD_I),
      exitCode: 1,
      outputHas: ["서명 점검: 서명 행 1의 실행 환경(local)이 요청 형태(production)와 다르다"],
      outputLacks: ["내부 시험 공개 가능", "서명이 덮지 않은 필수 항목 식별자"],
    },
    {
      tag: "차",
      form: "로컬",
      describe: "로컬 시험 판정에 실행 환경 칸이 production인 서명 기록만 있음",
      requests: [LOCAL_S1],
      signature: sign("production", LOCAL_S1),
      exitCode: 1,
      outputHas: ["서명 점검: 서명 행 1의 실행 환경(production)이 요청 형태(local)와 다르다"],
      outputLacks: ["로컬 시험 가능", "서명이 덮지 않은 필수 항목 식별자"],
    },
    {
      tag: "카",
      form: "운영",
      describe:
        "서명 기록이 목적 단계(I)의 필수 항목 일부(L-06·R-03)만 담음(담은 항목은 서명 이후 모두 READY)",
      requests: [PROD_I],
      signature: sign("production", PROD_I, "제품 책임자", ["L-06", "R-03"]),
      exitCode: 1,
      outputHas: [
        "서명 점검: 서명이 덮지 않은 필수 항목 식별자: L-06, R-03",
        "내부 시험 공개 불가",
      ],
      // 항목 점검은 통과한다(모두 READY) — 거부 이유는 서명이 덮지 않은 항목뿐이고 서명 시점 값은 출력에 없다.
      outputLacks: ["내부 시험 공개 가능", "불가 사유", "대상-L-06", "대상-R-03"],
    },
  ];

  function check(fixture: SignatureFixture, request: CheckRequest, signature = fixture.signature) {
    return checkLaunchGate(
      withDefaultSibling({
        itemTableMarkdown: SPEC_MARKDOWN,
        recordMarkdown: recordFor(fixture.statuses),
        currentTargets: CURRENT_TARGETS,
        signatureMarkdown: signature,
        allowedRoles: ALLOWED_ROLES,
        request,
      })
    );
  }

  it("fixture는 정확히 열한 가지이고 꼬리표가 acceptance.md와 같다", () => {
    expect(FIXTURES_008.map((fixture) => fixture.tag).join("")).toBe("가나다라마바사아자차카");
    expect(FIXTURES_008.filter((fixture) => fixture.form === "운영")).toHaveLength(7);
    expect(FIXTURES_008.filter((fixture) => fixture.form === "로컬")).toHaveLength(4);
  });

  for (const fixture of FIXTURES_008.filter((f) => f.tag !== "아")) {
    it(`(${fixture.tag}) [${fixture.form}] ${fixture.describe} → 종료 코드 ${fixture.exitCode}`, () => {
      const result = check(fixture, fixture.requests[0]);

      expect(result.exitCode, result.output).toBe(fixture.exitCode);
      for (const text of fixture.outputHas) expect(result.output).toContain(text);
      for (const text of fixture.outputLacks ?? []) expect(result.output).not.toContain(text);
    });
  }

  const ENVIRONMENT_CELL_ERRORS: Array<[string, string]> = [
    ["칸이 비어 있음", ""],
    ["local·production 밖의 값", "staging"],
  ];
  const fixtureAh = FIXTURES_008.find((f) => f.tag === "아") as SignatureFixture;
  for (const [what, cell] of ENVIRONMENT_CELL_ERRORS) {
    for (const request of fixtureAh.requests) {
      it(`(아) 서명의 실행 환경 ${what} → 요청 형태 ${request.environment}에서도 종료 코드 2`, () => {
        const signature = renderSignature(
          [["제품 책임자", "날짜-예시", cell]],
          snapshotOf(request)
        );

        const result = check(fixtureAh, request, signature);

        expect(result.exitCode, result.output).toBe(2);
        for (const text of fixtureAh.outputHas) expect(result.output).toContain(text);
        for (const text of fixtureAh.outputLacks ?? []) expect(result.output).not.toContain(text);
      });
    }
  }

  it("서명 점검을 통과하는 것은 (가)(마) 둘이고 (나)(다)(라)(바)(사)(아)(자)(차)(카) 아홉은 종료 코드가 0이 아니다", () => {
    const exits = FIXTURES_008.map((fixture) => ({
      tag: fixture.tag,
      exitCode:
        fixture.tag === "아"
          ? check(
              fixture,
              fixture.requests[0],
              renderSignature([["제품 책임자", "날짜-예시", ""]], snapshotOf(fixture.requests[0]))
            ).exitCode
          : check(fixture, fixture.requests[0]).exitCode,
    }));

    expect(exits.filter((e) => e.exitCode === 0).map((e) => e.tag)).toEqual(["가", "마"]);
    expect(exits.filter((e) => e.exitCode !== 0)).toHaveLength(9);
  });

  it("(가)는 목적 단계 G에서도 G의 필수 항목 집합을 덮는 production 서명으로 일반 사용자 공개 가능을 낸다", () => {
    const result = check(FIXTURES_008[0], PROD_G, sign("production", PROD_G));

    expect([result.exitCode, result.verdict]).toEqual([0, "일반 사용자 공개 가능"]);
  });

  it("I 단계의 서명으로 G 점검을 통과시키지 못한다 — 두 단계의 필수 항목 집합이 달라 덮지 않은 항목과 집합 밖 항목이 함께 적힌다", () => {
    // R-05는 G 열이 결정 대기(필수)이고 I 열이 해당 없음, L-03은 I 열이 필수이고 G 열이 해당 없음이다.
    const result = check(FIXTURES_008[0], PROD_G, sign("production", PROD_I));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("서명 점검: 서명이 덮지 않은 필수 항목 식별자: R-05");
    expect(result.output).toContain(
      "서명 점검: 서명이 필수 항목 집합 밖의 항목을 덮는다 — 식별자: L-03"
    );
    expect(result.verdict).toBe("일반 사용자 공개 불가");
  });

  it("(카) local 서명이 필수 항목 일부만 덮어도 같은 이유로 거부한다 — 서명은 로컬 시험 판정의 필수 항목 전체를 덮어야 한다", () => {
    const result = check(
      FIXTURES_008[0],
      LOCAL_S1,
      sign("local", LOCAL_S1, "제품 책임자", ["L-04"])
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("서명 점검: 서명이 덮지 않은 필수 항목 식별자: L-04");
    expect(result.verdict).toBe("로컬 시험 불가");
  });

  it("필수 항목 집합 밖의 항목을 덮은 서명은 집합이 같지 않아 거부한다 — 해당 없음 칸의 항목·운영 한정 항목·열지 않는 표면의 항목", () => {
    // I 열이 해당 없음인 R-05, local에서 적용하지 않는 L-01, S1만 여는 요청에서 열리지 않는 R-01.
    const productionForm = check(
      FIXTURES_008[0],
      PROD_I,
      renderSignature(
        [["제품 책임자", "날짜-예시", "production"]],
        [...snapshotOf(PROD_I), ["R-05", "READY", targetOf("R-05")]]
      )
    );
    const localForm = check(
      FIXTURES_008[0],
      LOCAL_S1,
      renderSignature(
        [["제품 책임자", "날짜-예시", "local"]],
        [
          ...snapshotOf(LOCAL_S1),
          ["L-01", "READY", targetOf("L-01")],
          ["R-01", "READY", targetOf("R-01")],
        ]
      )
    );

    expect(productionForm.exitCode).toBe(1);
    expect(productionForm.output).toContain(
      "서명이 필수 항목 집합 밖의 항목을 덮는다 — 식별자: R-05"
    );
    expect(localForm.exitCode).toBe(1);
    expect(localForm.output).toContain(
      "서명이 필수 항목 집합 밖의 항목을 덮는다 — 식별자: L-01, R-01"
    );
    expect(productionForm.output).not.toContain("서명이 덮지 않은 필수 항목 식별자");
  });

  it("면제된 결정 대기 칸의 항목은 필수 항목이 아니므로 서명이 덮지 않아야 하고 덮으면 거부된다", () => {
    const exemptions: Exemption[] = [{ itemId: "R-02", column: "I" }];
    const request = PROD_I;
    const signed = (extra: string[]) =>
      checkLaunchGate(
        withDefaultSibling({
          itemTableMarkdown: SPEC_MARKDOWN,
          recordMarkdown: ALL_READY,
          currentTargets: CURRENT_TARGETS,
          exemptions,
          allowedRoles: ALLOWED_ROLES,
          signatureMarkdown: signatureFor(ALL_READY, "production", request, { exemptions, extra }),
          request,
        })
      );

    expect(requiredIdsFor(request, exemptions)).not.toContain("R-02");
    expect(signed([]).exitCode).toBe(0);
    const covered = signed(["R-02"]);
    expect(covered.exitCode).toBe(1);
    expect(covered.output).toContain("서명이 필수 항목 집합 밖의 항목을 덮는다 — 식별자: R-02");
  });

  it("점검기가 읽는 필수 항목 집합은 단계 열·표면·실행 환경을 따른다(시험용 계산의 표본 확인)", () => {
    const ids = (request: CheckRequest) => requiredIdsFor(request);

    expect(ids(PROD_I)).toContain("L-04");
    expect(ids(PROD_I)).not.toContain("R-05");
    expect(ids(PROD_G)).toContain("R-05");
    expect(ids(PROD_G)).not.toContain("L-03");
    expect(ids(LOCAL_S1)).not.toContain("L-01");
    expect(ids(LOCAL_S1)).not.toContain("R-01");
    expect(ids(production("I", ["S2"]))).not.toContain("L-05");
  });

  it("fail-closed 기본값: 서명이 없으면 항목이 모두 READY여도 통과가 아니고 판정 문구는 불가다", () => {
    for (const request of [
      production("I", ALL_SURFACES),
      production("G", ALL_SURFACES),
      local(["S1"]),
    ]) {
      const result = evaluateLaunchGate({
        items: ITEM_ROWS,
        record: (() => {
          const parsed = parseGateRecord(ALL_READY);
          if (!parsed.ok) throw new Error(parsed.errors.join("|"));
          return parsed.items;
        })(),
        currentTargets: CURRENT_TARGETS,
        allowedRoles: ALLOWED_ROLES,
        request,
      });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("서명 없음");
      expect(result.verdict).toMatch(/불가$/);
      expect(result.output).not.toMatch(/공개 가능|로컬 시험 가능/);
    }
  });

  it("허용 역할 목록이 비어 있으면(넘기지 않으면) 모든 역할이 거부된다", () => {
    const result = checkLaunchGate({
      itemTableMarkdown: SPEC_MARKDOWN,
      recordMarkdown: ALL_READY,
      currentTargets: CURRENT_TARGETS,
      signatureMarkdown: sign("production", PROD_I),
      request: production("I", ALL_SURFACES),
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("서명 행 1의 역할이 허용 역할 목록에 없다");
  });

  it("서명 시점 항목이 현재 기록의 항목 정의표에 없는 식별자를 담으면 현재 기록에 없다고 거부한다", () => {
    const signature = renderSignature(
      [["제품 책임자", "날짜-예시", "production"]],
      [...snapshotOf(PROD_I), ["L-99", "READY", "대상-L-99"]]
    );

    const result = check(FIXTURES_008[0], production("I", ALL_SURFACES), signature);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("서명 대상 항목 L-99가 현재 기록에 없다");
  });

  it("항목 점검과 서명 점검이 모두 실패하면 두 이유를 함께 적는다", () => {
    const result = check(
      { ...FIXTURES_008[1], statuses: { "L-04": "BLOCKED" } },
      production("I", ALL_SURFACES)
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("L-04: BLOCKED");
    expect(result.output).toContain("서명 없음");
    expect(result.output).toContain("불가 사유: 필수 항목이 READY가 아니다 — L-04");
  });

  it("서명이 있어도 항목 점검이 실패하면 통과가 아니다(서명은 항목 점검을 대신하지 않는다)", () => {
    const result = check(
      { ...FIXTURES_008[0], statuses: { "L-04": "BLOCKED" } },
      production("I", ALL_SURFACES),
      sign("production", PROD_I)
    );

    expect([result.exitCode, result.verdict]).toEqual([1, "내부 시험 공개 불가"]);
  });

  it("서명 점검 출력은 서명 기록의 역할·날짜 칸 값을 적지 않는다", () => {
    const result = check(
      FIXTURES_008[0],
      production("I", ALL_SURFACES),
      renderSignature([["역할-밖-예시", "날짜-밖-예시", "production"]], snapshotOf(PROD_I))
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).not.toContain("역할-밖-예시");
    expect(result.output).not.toContain("날짜-밖-예시");
  });
});

describe("runCli — 서명 인자(--signature, --allowed-roles)", () => {
  const record = recordFor();
  const baseFiles: Record<string, string> = {
    "items.md": SPEC_MARKDOWN,
    "record.md": record,
    "targets.json": JSON.stringify(CURRENT_TARGETS),
    "signature.md": signatureFor(record, "production", production("I", ALL_SURFACES)),
  };
  const allFiles: Record<string, string> = { ...baseFiles, ...DEFAULT_SIBLING_CLI.files };
  const read = (file: string): string => {
    if (!(file in allFiles)) throw new Error(`없는 파일: ${file}`);
    return allFiles[file];
  };
  const baseArgs = [
    "--items",
    "items.md",
    "--record",
    "record.md",
    "--targets",
    "targets.json",
    "--environment",
    "production",
    "--stage",
    "I",
    "--surfaces",
    "S1,S2,S3",
    ...DEFAULT_SIBLING_CLI.args,
  ];

  it("두 인자를 읽어 서명이 있는 통과 판정을 낸다", () => {
    const result = runCli(
      [...baseArgs, "--signature", "signature.md", "--allowed-roles", ALLOWED_ROLES_ARG],
      read
    );

    expect([result.exitCode, result.verdict]).toEqual([0, "내부 시험 공개 가능"]);
  });

  it("--signature를 넘기지 않으면 서명 없음으로 종료 코드 1이다(우회 인자가 없다)", () => {
    const result = runCli([...baseArgs, "--allowed-roles", ALLOWED_ROLES_ARG], read);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("서명 없음");
    expect(result.verdict).toBe("내부 시험 공개 불가");
  });

  it("--allowed-roles를 넘기지 않으면 어떤 역할도 허용되지 않아 종료 코드 1이다", () => {
    const result = runCli([...baseArgs, "--signature", "signature.md"], read);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("허용 역할 목록에 없다");
  });

  it("--allowed-roles의 쉼표 목록은 앞뒤 공백과 빈 항목을 무시하고 읽는다", () => {
    const result = runCli(
      [...baseArgs, "--signature", "signature.md", "--allowed-roles", " 법무 , ,제품 책임자,"],
      read
    );

    expect(result.exitCode).toBe(0);
  });

  it("읽지 못하는 서명 파일과 표가 깨진 서명 파일은 종료 코드 2다", () => {
    const missing = runCli([...baseArgs, "--signature", "없는-서명.md"], read);
    const broken = runCli([...baseArgs, "--signature", "broken.md"], (file) =>
      file === "broken.md" ? "# 표 없음" : read(file)
    );

    expect(missing.exitCode).toBe(2);
    expect(missing.output).toContain("--signature 파일을 읽지 못했다(없는-서명.md)");
    expect(broken.exitCode).toBe(2);
    expect(broken.output).toContain("서명 기록 오류");
  });
});

// ---- PR #24 재현 결함 3건 회귀 (형제 증거 · 서명 대상 · 무효화 사건) ---------------------------
// 수정 전 점검기는 아래 입력을 통과시켰다. 세 경로 — checkLaunchGate(마크다운 입력), runCli(프로세스 안, 파일
// 읽기는 가짜), 자식 프로세스 CLI(실제 명령줄과 종료 코드) — 모두 실제 공개 판정에 연결된 길이다.
// ①~⑥은 요청서의 여섯 시험이고 그 옆의 양성 대조는 유효한 증거·서명이면 같은 길로 통과함을 보인다.

interface RegressionInputs {
  request: CheckRequest;
  record: string;
  targets: Readonly<Record<string, string>>;
  events?: Readonly<Record<string, readonly string[]>>;
  signature: string;
  /** undefined이면 형제 증거 인자(참조 줄·정의표·형제 기록)를 아예 넘기지 않는다. */
  sibling?: SyntheticSiblingEvidence;
}

/** 기본값은 모든 증거가 유효한 운영 단계 I 점검이다. `overrides`가 결함 하나씩을 만든다. */
function regressionInputs(overrides: Partial<RegressionInputs> = {}): RegressionInputs {
  const request = overrides.request ?? production("I", ALL_SURFACES);
  const record = overrides.record ?? recordFor();
  return {
    request,
    record,
    targets: CURRENT_TARGETS,
    signature: signatureFor(record, request.environment ?? "production", request),
    sibling: syntheticSiblingEvidence(SIBLING_ITEM_IDS),
    ...overrides,
  };
}

function regressionCliInputs(
  inputs: RegressionInputs,
  at: (name: string) => string
): { files: Record<string, string>; args: string[] } {
  const files: Record<string, string> = {
    [at("items.md")]: SPEC_MARKDOWN,
    [at("record.md")]: inputs.record,
    [at("targets.json")]: JSON.stringify(inputs.targets),
    [at("signature.md")]: inputs.signature,
  };
  const args = [
    "--items",
    at("items.md"),
    "--record",
    at("record.md"),
    "--targets",
    at("targets.json"),
    "--signature",
    at("signature.md"),
    "--allowed-roles",
    ALLOWED_ROLES_ARG,
    "--environment",
    inputs.request.environment ?? "",
    ...(inputs.request.stage === undefined ? [] : ["--stage", inputs.request.stage]),
    "--surfaces",
    inputs.request.surfaces.join(","),
  ];
  if (inputs.events !== undefined) {
    files[at("events.json")] = JSON.stringify(inputs.events);
    args.push("--events", at("events.json"));
  }
  if (inputs.sibling !== undefined) {
    const sibling = siblingCliParts(inputs.sibling, at);
    Object.assign(files, sibling.files);
    args.push(...sibling.args);
  }
  return { files, args };
}

type RegressionPath = "checkLaunchGate" | "runCli" | "자식 프로세스 CLI";

function runRegression(
  pathName: RegressionPath,
  inputs: RegressionInputs
): { exitCode: number | null; output: string } {
  if (pathName === "checkLaunchGate") {
    const result = checkLaunchGate({
      itemTableMarkdown: SPEC_MARKDOWN,
      recordMarkdown: inputs.record,
      currentTargets: inputs.targets,
      eventsAfterObservation: inputs.events,
      signatureMarkdown: inputs.signature,
      allowedRoles: ALLOWED_ROLES,
      siblingReferenceMarkdown: inputs.sibling?.markdown,
      siblingDefinitions: inputs.sibling?.definitions,
      siblingRecords: inputs.sibling?.records,
      request: inputs.request,
    });
    return { exitCode: result.exitCode, output: result.output };
  }
  if (pathName === "runCli") {
    const { files, args } = regressionCliInputs(inputs, (name) => name);
    const result = runCli(args, (file) => {
      if (!(file in files)) throw new Error(`없는 파일: ${file}`);
      return files[file];
    });
    return { exitCode: result.exitCode, output: result.output };
  }
  const dir = mkdtempSync(path.join(tmpdir(), "launch-gate-regression-"));
  try {
    const { files, args } = regressionCliInputs(inputs, (name) => path.join(dir, name));
    for (const [file, content] of Object.entries(files)) writeFileSync(file, content, "utf-8");
    const child = spawnSync(process.execPath, [tsxCliPath, scriptPath, ...args], {
      cwd: projectRoot,
      encoding: "utf-8",
    });
    return { exitCode: child.status, output: `${child.stdout}${child.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface RegressionCase {
  tag: string;
  name: string;
  inputs: () => RegressionInputs;
  exitCode: 0 | 1;
  /** `판정: …` 줄의 판정 문구. */
  verdict: string;
  outputHas: string[];
  outputLacks?: string[];
  /** 자식 프로세스 경로까지 시험할지(느리므로 대표 입력에만). */
  child?: boolean;
}

const PROD_I_REQUEST = production("I", ALL_SURFACES);
const INTERNAL_BLOCKED = "내부 시험 공개 불가";
/** 운영 단계 I·표면 전체 점검에서 실제로 필수인 R 항목(R-05는 I 칸이 해당 없음). */
const REQUIRED_SIBLING_ITEMS_AT_I = requiredIdsFor(PROD_I_REQUEST).filter((id) =>
  SIBLING_ITEM_IDS.includes(id)
);

/** 요청서 ①~⑥: 수정 전 통과하던 입력이며 모두 종료 코드 1이어야 한다. */
const BLOCKED_CASES: RegressionCase[] = [
  // ① 필수 형제 참조 전체 누락
  {
    tag: "①",
    name: "필수 형제 참조 전체 누락 — 참조 줄·정의표·형제 기록 인자를 하나도 넘기지 않음",
    inputs: () => regressionInputs({ sibling: undefined }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: [
      "R-01: UNVERIFIED",
      "R-02: UNVERIFIED",
      "R-03: UNVERIFIED",
      "R-04: UNVERIFIED",
      "참조 줄",
    ],
    outputLacks: ["공개 가능"],
    child: true,
  },
  {
    tag: "①",
    name: "참조 줄 표에 헤더만 있고 줄이 0개",
    inputs: () =>
      regressionInputs({
        sibling: syntheticSiblingEvidence(SIBLING_ITEM_IDS, { omitLines: SIBLING_ITEM_IDS }),
      }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: ["R-01: UNVERIFIED", "R-04: UNVERIFIED", "참조 줄"],
    outputLacks: ["공개 가능"],
  },
  {
    tag: "①",
    name: "참조 줄이 R-04 한 줄뿐이고 R-01·R-02·R-03 줄이 없음(수정 전에는 이 입력이 통과했다)",
    inputs: () =>
      regressionInputs({
        sibling: syntheticSiblingEvidence(SIBLING_ITEM_IDS, {
          omitLines: ["R-01", "R-02", "R-03"],
        }),
      }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: ["R-01: UNVERIFIED", "R-02: UNVERIFIED", "R-03: UNVERIFIED", "R-04: READY"],
    outputLacks: ["공개 가능"],
  },
  {
    tag: "①",
    name: "로컬 시험 판정: R-02·R-03 줄 누락은 막고 운영 한정 R-04는 여전히 해당 없음(local)",
    inputs: () => regressionInputs({ request: local(["S1"]), sibling: undefined }),
    exitCode: 1,
    verdict: "로컬 시험 불가",
    outputHas: ["R-02: UNVERIFIED", "R-03: UNVERIFIED", "R-04: 해당 없음(local)"],
    outputLacks: ["R-04: UNVERIFIED", "로컬 시험 가능"],
  },
  // ② 형제 기록·참조 줄이 모두 BLOCKED
  ...REQUIRED_SIBLING_ITEMS_AT_I.map((id): RegressionCase => ({
    tag: "②",
    name: `${id}: 형제 기록의 현재 상태와 참조 줄이 모두 BLOCKED(값이 같아도 통과하지 못한다)`,
    inputs: () =>
      regressionInputs({
        sibling: syntheticSiblingEvidence(SIBLING_ITEM_IDS, { recordStatus: { [id]: "BLOCKED" } }),
      }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: [`${id}: BLOCKED`, "형제 기록의 현재 상태가 READY가 아니다(BLOCKED)"],
    outputLacks: ["공개 가능"],
    child: id === "R-02",
  })),
  // ② 독립 감사가 짚은 공백: 일반 사용자 공개(G)의 R-05와 로컬 시험 판정에서도 같은 규칙이다
  {
    tag: "②",
    name: "운영 단계 G: R-05의 형제 기록과 참조 줄이 BLOCKED",
    inputs: () =>
      regressionInputs({
        request: production("G", ALL_SURFACES),
        sibling: syntheticSiblingEvidence(SIBLING_ITEM_IDS, {
          recordStatus: { "R-05": "BLOCKED" },
        }),
      }),
    exitCode: 1,
    verdict: "일반 사용자 공개 불가",
    outputHas: ["R-05: BLOCKED"],
    outputLacks: ["공개 가능"],
  },
  {
    tag: "②",
    name: "운영 단계 G: R-05의 참조 줄이 없음",
    inputs: () =>
      regressionInputs({
        request: production("G", ALL_SURFACES),
        sibling: syntheticSiblingEvidence(SIBLING_ITEM_IDS, { omitLines: ["R-05"] }),
      }),
    exitCode: 1,
    verdict: "일반 사용자 공개 불가",
    outputHas: ["R-05: UNVERIFIED", "참조 줄"],
    outputLacks: ["일반 사용자 공개 가능"],
  },
  {
    tag: "②",
    name: "로컬 시험 판정: R-02의 형제 기록과 참조 줄이 BLOCKED",
    inputs: () =>
      regressionInputs({
        request: local(["S1"]),
        sibling: syntheticSiblingEvidence(SIBLING_ITEM_IDS, {
          recordStatus: { "R-02": "BLOCKED" },
        }),
      }),
    exitCode: 1,
    verdict: "로컬 시험 불가",
    outputHas: ["R-02: BLOCKED"],
    outputLacks: ["로컬 시험 가능"],
  },
  // ③ 형제 기록·참조 줄이 모두 UNVERIFIED
  ...REQUIRED_SIBLING_ITEMS_AT_I.map((id): RegressionCase => ({
    tag: "③",
    name: `${id}: 형제 기록의 현재 상태와 참조 줄이 모두 UNVERIFIED(값이 같아도 통과하지 못한다)`,
    inputs: () =>
      regressionInputs({
        sibling: syntheticSiblingEvidence(SIBLING_ITEM_IDS, {
          recordStatus: { [id]: "UNVERIFIED" },
        }),
      }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: [`${id}: UNVERIFIED`, "형제 기록의 현재 상태가 READY가 아니다(UNVERIFIED)"],
    outputLacks: ["공개 가능"],
    child: id === "R-03",
  })),
  // ④ 이전 대상에 대한 서명 + 새 대상의 READY 기록
  {
    tag: "④",
    name: "L-04의 이전 대상 값으로 한 서명 + 같은 항목이 새 대상 값으로 READY",
    inputs: () =>
      regressionInputs({
        signature: signatureFor(
          recordFor({}, [], {}, { "L-04": "대상-L-04-이전" }),
          "production",
          PROD_I_REQUEST
        ),
      }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: [
      "L-04: READY",
      "서명 점검: 서명 시점 L-04의 대상 값이 현재 유효 항목의 대상 값과 다르다",
    ],
    outputLacks: ["공개 가능", "대상-L-04-이전"],
    child: true,
  },
  {
    tag: "④",
    name: "로컬 시험 판정: R-03의 이전 대상 값으로 한 서명",
    inputs: () => {
      const request = local(["S1"]);
      return regressionInputs({
        request,
        signature: signatureFor(
          recordFor({}, [], {}, { "R-03": "대상-R-03-이전" }),
          "local",
          request
        ),
      });
    },
    exitCode: 1,
    verdict: "로컬 시험 불가",
    outputHas: ["서명 점검: 서명 시점 R-03의 대상 값이 현재 유효 항목의 대상 값과 다르다"],
    outputLacks: ["로컬 시험 가능", "대상-R-03-이전"],
  },
  // ⑤ 서명 snapshot이 READY가 아닌데 현재 기록은 READY
  {
    tag: "⑤",
    name: "서명 snapshot의 L-04가 BLOCKED이고 현재 기록은 READY",
    inputs: () =>
      regressionInputs({
        signature: signatureFor(recordFor({ "L-04": "BLOCKED" }), "production", PROD_I_REQUEST),
      }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: [
      "L-04: READY",
      "서명 점검: 서명 시점 L-04의 상태가 READY가 아니다(서명 시점 상태: BLOCKED)",
    ],
    outputLacks: ["공개 가능"],
    child: true,
  },
  {
    tag: "⑤",
    name: "서명 snapshot의 R-02가 UNVERIFIED이고 현재 기록은 READY(로컬 시험 판정)",
    inputs: () => {
      const request = local(["S1"]);
      return regressionInputs({
        request,
        signature: signatureFor(recordFor({ "R-02": "UNVERIFIED" }), "local", request),
      });
    },
    exitCode: 1,
    verdict: "로컬 시험 불가",
    outputHas: ["서명 점검: 서명 시점 R-02의 상태가 READY가 아니다(서명 시점 상태: UNVERIFIED)"],
    outputLacks: ["로컬 시험 가능"],
  },
  // ⑥ 기록의 무효화 사건 칸에서 정의표의 사건을 뺐고 관측 뒤에 그 사건이 일어남
  {
    tag: "⑥",
    name: "R-04 기록에 EV-L3만 적혀 있고(정의표는 EV-L3·EV-L5) 관측 뒤에 EV-L5가 일어남",
    inputs: () =>
      regressionInputs({
        record: recordFor({}, [], { "R-04": ["EV-L3"] }),
        events: { "R-04": ["EV-L5"] },
      }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: ["R-04: UNVERIFIED", "EV-L5"],
    outputLacks: ["공개 가능"],
    child: true,
  },
  {
    tag: "⑥",
    name: "L-05 기록에 EV-L1만 적혀 있고(정의표는 EV-L1·EV-L5) 관측 뒤에 EV-L5가 일어남",
    inputs: () =>
      regressionInputs({
        record: recordFor({}, [], { "L-05": ["EV-L1"] }),
        events: { "L-05": ["EV-L5"] },
      }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: ["L-05: UNVERIFIED", "EV-L5"],
    outputLacks: ["공개 가능"],
  },
];

/** 같은 길로 유효한 증거·서명이 통과한다는 양성 대조(수정 전후 모두 종료 코드 0이어야 한다). */
const PASSING_CASES: RegressionCase[] = [
  {
    tag: "양성",
    name: "운영 단계 I: 형제 증거·서명·사건이 모두 유효하면 내부 시험 공개 가능",
    inputs: () => regressionInputs(),
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["R-04: READY", "서명 점검: 통과"],
    child: true,
  },
  {
    tag: "양성",
    name: "운영 단계 G: 일반 사용자 공개 가능",
    inputs: () => regressionInputs({ request: production("G", ALL_SURFACES) }),
    exitCode: 0,
    verdict: "일반 사용자 공개 가능",
    outputHas: ["R-05: READY", "서명 점검: 통과"],
  },
  {
    tag: "양성",
    name: "로컬 시험 판정: R-02·R-03 형제 증거가 유효하면 로컬 시험 가능",
    inputs: () => regressionInputs({ request: local(["S1"]) }),
    exitCode: 0,
    verdict: "로컬 시험 가능",
    outputHas: ["R-04: 해당 없음(local)", "서명 점검: 통과"],
  },
  {
    tag: "양성",
    name: "새 대상 값으로 다시 서명하면 통과한다(이전 서명은 재사용되지 않지만 새 서명은 인정된다)",
    inputs: () => {
      const record = recordFor({}, [], {}, { "L-04": "대상-L-04-새" });
      return regressionInputs({
        record,
        targets: { ...CURRENT_TARGETS, "L-04": "대상-L-04-새" },
      });
    },
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["L-04: READY", "서명 점검: 통과"],
  },
  {
    tag: "양성",
    name: "기록에 EV-L3만 적힌 R-04도 정의표·기록 어디에도 없는 사건(EV-L2)이 일어났을 뿐이면 READY 그대로",
    inputs: () =>
      regressionInputs({
        record: recordFor({}, [], { "R-04": ["EV-L3"] }),
        events: { "R-04": ["EV-L2"] },
      }),
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["R-04: READY"],
  },
];

describe("PR #24 재현 결함 3건 회귀 — 수정 전 통과하던 입력을 공개 판정 경로에서 거부한다", () => {
  // 독립 감사(sync-auditor)가 찾은 우회: 사건 이름이 EV-L1~EV-L5 형태가 아니거나 항목 키가 어긋나면 일어난 사건이
  // 조용히 무시되어 통과했다. 이제 입력 거부(종료 코드 2)다. 이 시험은 코드 수정 뒤에 더했다(수정 전 실패 증거 없음).
  const MALFORMED_EVENTS: Array<[string, Record<string, string[]>]> = [
    ["소문자 사건 이름", { "R-04": ["ev-l5"] }],
    ["앞 공백이 붙은 사건 이름", { "R-04": [" EV-L5"] }],
    ["뒤에 보이지 않는 문자가 붙은 사건 이름", { "R-04": ["EV-L5​"] }],
    ["EV-L1~EV-L5 밖의 사건 이름", { "R-04": ["EV-L9"] }],
    ["소문자 항목 키", { "r-04": ["EV-L5"] }],
    ["항목 정의표에 없는 항목 키", { "R-99": ["EV-L5"] }],
  ];
  for (const [what, events] of MALFORMED_EVENTS) {
    for (const pathName of ["checkLaunchGate", "runCli"] as const) {
      it(`⑥ 관측 뒤 사건 입력이 잘못됐다(${what}) → ${pathName}: 종료 코드 2로 거부하고 통과 판정을 내지 않는다`, () => {
        const result = runRegression(
          pathName,
          regressionInputs({ record: recordFor({}, [], { "R-04": ["EV-L3"] }), events })
        );

        expect(result.exitCode, result.output).toBe(2);
        expect(result.output).toContain("거부: 관측 뒤 사건 입력의");
        expect(result.output).not.toMatch(/공개 가능|로컬 시험 가능|판정:/);
        expect(result.output).not.toContain("EV-L9");
      });
    }
  }

  it("요청서의 여섯 시험(①~⑥)이 모두 있다", () => {
    expect(new Set(BLOCKED_CASES.map((c) => c.tag))).toEqual(
      new Set(["①", "②", "③", "④", "⑤", "⑥"])
    );
  });

  const allCases = [...BLOCKED_CASES, ...PASSING_CASES];
  for (const c of allCases) {
    const paths: RegressionPath[] = c.child
      ? ["checkLaunchGate", "runCli", "자식 프로세스 CLI"]
      : ["checkLaunchGate", "runCli"];
    for (const pathName of paths) {
      it(`${c.tag} ${c.name} → ${pathName}: 종료 코드 ${c.exitCode}`, { timeout: 60_000 }, () => {
        const result = runRegression(pathName, c.inputs());

        expect(result.exitCode, result.output).toBe(c.exitCode);
        expect(result.output).toContain(`판정: ${c.verdict}`);
        for (const text of c.outputHas) expect(result.output).toContain(text);
        for (const text of c.outputLacks ?? []) expect(result.output).not.toContain(text);
      });
    }
  }
});

// ---- PR #24 잔여 결함 F1 회귀 — 형제 증거 대상 값을 R 항목의 대상·서명에 묶는다 ---------------------
// 수정 전 점검기는 형제 기록의 대상 값이 바뀌어도(EV-L3) 참조 줄과 현재 형제 기록만 새 값으로 고치고 R 항목의 기록 `대상`
// 칸·`--targets` 값·옛 서명을 그대로 두면 통과시켰다 — 대상 값과 서명이 R 항목 자기 기록의 `대상` 칸하고만 비교됐기
// 때문이다. 이제 R 항목의 현재 대상 값은 현재 형제 증거(참조한 형제 SPEC·항목·현재 상태·현재 대상 값)에서 계산하고,
// `--targets` 값은 R 항목에 쓰지 않는다. 아래 입력은 모두 기록 `대상` 칸·`--targets`·서명을 증거 V1 값으로 두고 점검 시점
// 형제 증거만 V2로 바꾼다. 세 경로(checkLaunchGate, runCli, 자식 프로세스 CLI)를 같은 방식으로 시험한다.

const SECOND_SYNTHETIC_SPEC = "SPEC-SYNTHETIC-SIBLING-002";
const F1_CHANGED_VALUE = "형제값-변경됨";

/** 기록 `대상` 칸·`--targets`·서명은 `v1` 증거 값이고 점검 시점 형제 증거는 `v2`다. */
function f1Inputs(
  v1: SyntheticSiblingEvidence,
  v2: SyntheticSiblingEvidence,
  overrides: Partial<RegressionInputs> = {}
): RegressionInputs {
  const v1Targets = evidenceTargetsOf(v1);
  return regressionInputs({
    record: recordFor({}, [], {}, v1Targets),
    targets: { ...CURRENT_TARGETS, ...v1Targets },
    sibling: v2,
    ...overrides,
  });
}

const evidence = (options: SyntheticSiblingOptions = {}): SyntheticSiblingEvidence =>
  syntheticSiblingEvidence(SIBLING_ITEM_IDS, options);

/** R-02에 참조 줄이 둘인 증거(줄 하나 변경·추가·삭제 시험의 기준). */
const TWO_LINES = { "R-02": ["SYN-R-02", "SYN-R-02-b"] } as const;

/** 막힌 R 항목의 출력: UNVERIFIED 표시와, 기록 `대상` 칸에 적어야 할 현재 형제 증거 대상 값(digest). */
const f1BlockedOutput = (id: string, v2: SyntheticSiblingEvidence): string[] => [
  `${id}: UNVERIFIED`,
  `현재 형제 증거 대상 값: ${evidenceTargetsOf(v2)[id]}`,
];

/** 모두 종료 코드 1이어야 한다(수정 전에는 (B)를 빼고 종료 코드 0이었다). */
const F1_BLOCKED_CASES: RegressionCase[] = [
  // (A) 형제 기록의 대상 값이 바뀌고 참조 줄·현재 형제 기록만 새 값으로 고쳤다
  ...REQUIRED_SIBLING_ITEMS_AT_I.map((id): RegressionCase => {
    const v2 = evidence({ siblingTarget: { [`SYN-${id}`]: F1_CHANGED_VALUE } });
    return {
      tag: "F1-A",
      name: `${id}: 형제 기록의 대상 값이 바뀌어 참조 줄·형제 기록만 새 값인데 기록 대상 칸·--targets·서명은 옛 값`,
      inputs: () => f1Inputs(evidence(), v2),
      exitCode: 1,
      verdict: INTERNAL_BLOCKED,
      outputHas: f1BlockedOutput(id, v2),
      outputLacks: ["공개 가능", F1_CHANGED_VALUE],
      child: id === "R-02",
    };
  }),
  // (B) 기록 대상 칸은 새 digest로 고쳤지만 서명은 옛 증거에 한 것 그대로다
  ...REQUIRED_SIBLING_ITEMS_AT_I.map((id): RegressionCase => {
    const v1 = evidence();
    const v2 = evidence({ siblingTarget: { [`SYN-${id}`]: F1_CHANGED_VALUE } });
    return {
      tag: "F1-B",
      name: `${id}: 기록 대상 칸을 새 형제 증거 digest로 고쳤지만 서명은 옛 증거에 한 것`,
      inputs: () =>
        regressionInputs({
          record: recordFor({}, [], {}, { ...evidenceTargetsOf(v1), ...evidenceTargetsOf(v2) }),
          targets: { ...CURRENT_TARGETS, ...evidenceTargetsOf(v2) },
          signature: signatureFor(
            recordFor({}, [], {}, evidenceTargetsOf(v1)),
            "production",
            PROD_I_REQUEST
          ),
          sibling: v2,
        }),
      exitCode: 1,
      verdict: INTERNAL_BLOCKED,
      outputHas: [
        `${id}: READY`,
        `서명 점검: 서명 시점 ${id}의 대상 값이 현재 유효 항목의 대상 값과 다르다`,
      ],
      outputLacks: ["공개 가능", F1_CHANGED_VALUE],
    };
  }),
  // (C) 참조 줄이 다른 형제 항목을 가리키도록 바뀌었다(상태·대상 값은 같고 식별자만 다르다)
  ...REQUIRED_SIBLING_ITEMS_AT_I.map((id): RegressionCase => {
    const v2 = evidence({
      siblingItems: { [id]: [`SYN-${id}-alt`] },
      siblingTarget: { [`SYN-${id}-alt`]: syntheticSiblingTarget(id) },
    });
    return {
      tag: "F1-C",
      name: `${id}: 참조 줄이 같은 값을 가진 다른 형제 항목을 가리키도록 바뀜`,
      inputs: () => f1Inputs(evidence(), v2),
      exitCode: 1,
      verdict: INTERNAL_BLOCKED,
      outputHas: f1BlockedOutput(id, v2),
      outputLacks: ["공개 가능"],
    };
  }),
  // (D) 참조 줄이 다른 형제 SPEC을 가리키도록 바뀌었다
  ...REQUIRED_SIBLING_ITEMS_AT_I.map((id): RegressionCase => {
    const v2 = evidence({ siblingSpec: { [id]: SECOND_SYNTHETIC_SPEC } });
    return {
      tag: "F1-D",
      name: `${id}: 참조 줄이 같은 값을 가진 다른 형제 SPEC의 같은 항목을 가리키도록 바뀜`,
      inputs: () => f1Inputs(evidence(), v2),
      exitCode: 1,
      verdict: INTERNAL_BLOCKED,
      outputHas: f1BlockedOutput(id, v2),
      outputLacks: ["공개 가능"],
    };
  }),
  // (E) 한 항목에 참조 줄이 여럿일 때: 한 줄의 값 변경, 줄 추가, 줄 삭제
  ...(
    [
      [
        "한 줄의 형제 값이 바뀜",
        evidence({ siblingItems: TWO_LINES, siblingTarget: { "SYN-R-02-b": F1_CHANGED_VALUE } }),
        true,
      ],
      [
        "셋째 줄이 추가됨",
        evidence({ siblingItems: { "R-02": [...TWO_LINES["R-02"], "SYN-R-02-c"] } }),
        false,
      ],
      ["한 줄이 삭제됨", evidence(), false],
    ] as const
  ).map(([what, v2, child]): RegressionCase => ({
    tag: "F1-E",
    name: `R-02에 참조 줄이 둘인데 ${what} — 기록 대상 칸·서명은 줄 둘일 때의 값`,
    inputs: () => f1Inputs(evidence({ siblingItems: TWO_LINES }), v2),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: f1BlockedOutput("R-02", v2),
    outputLacks: ["공개 가능", F1_CHANGED_VALUE],
    child,
  })),
  // (F) 일반 사용자 공개(G)에서는 R-05가 필수다
  {
    tag: "F1-F",
    name: "운영 단계 G: R-05의 형제 증거가 바뀌었는데 기록 대상 칸·서명은 옛 값",
    inputs: () =>
      f1Inputs(evidence(), evidence({ siblingTarget: { "SYN-R-05": F1_CHANGED_VALUE } }), {
        request: production("G", ALL_SURFACES),
      }),
    exitCode: 1,
    verdict: "일반 사용자 공개 불가",
    outputHas: ["R-05: UNVERIFIED", "현재 형제 증거 대상 값: sibling-evidence:v1:"],
    outputLacks: ["일반 사용자 공개 가능", F1_CHANGED_VALUE],
  },
  // (G) 로컬 시험 판정: 적용되는 R-02는 막는다(운영 한정 R-04는 아래 양성 대조에서 영향이 없음을 본다)
  {
    tag: "F1-G",
    name: "로컬 시험 판정: R-02의 형제 증거가 바뀌었는데 기록 대상 칸·서명은 옛 값",
    inputs: () =>
      f1Inputs(evidence(), evidence({ siblingTarget: { "SYN-R-02": F1_CHANGED_VALUE } }), {
        request: local(["S1"]),
      }),
    exitCode: 1,
    verdict: "로컬 시험 불가",
    outputHas: ["R-02: UNVERIFIED", "현재 형제 증거 대상 값: sibling-evidence:v1:"],
    outputLacks: ["로컬 시험 가능", F1_CHANGED_VALUE],
  },
  // (H) --targets는 R 항목의 현재 대상 값을 덮어쓰지 못한다
  {
    tag: "F1-H",
    name: "R-02의 형제 증거가 바뀌었고 호출자가 옛 기록 대상 값을 R-02의 현재 대상 값으로 넘김",
    inputs: () =>
      f1Inputs(evidence(), evidence({ siblingTarget: { "SYN-R-02": F1_CHANGED_VALUE } }), {
        targets: { ...CURRENT_TARGETS, "R-02": evidenceTargetsOf(evidence())["R-02"] },
      }),
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: ["R-02: UNVERIFIED", "현재 형제 증거 대상 값: sibling-evidence:v1:"],
    outputLacks: ["공개 가능", F1_CHANGED_VALUE],
  },
  {
    tag: "F1-H",
    name: "R-02의 형제 증거가 바뀌었고 호출자가 새 digest를 R-02의 현재 대상 값으로 넘겼지만 기록 대상 칸은 옛 값",
    inputs: () => {
      const v2 = evidence({ siblingTarget: { "SYN-R-02": F1_CHANGED_VALUE } });
      return f1Inputs(evidence(), v2, {
        targets: { ...CURRENT_TARGETS, "R-02": evidenceTargetsOf(v2)["R-02"] },
      });
    },
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: ["R-02: UNVERIFIED", "현재 형제 증거 대상 값: sibling-evidence:v1:"],
    outputLacks: ["공개 가능", F1_CHANGED_VALUE],
  },
  // 항목 독립: R-01·R-02 증거가 모두 바뀌었는데 R-01의 기록 대상 칸만 고쳤다(서명은 옛 값)
  {
    tag: "F1-독립",
    name: "R-01·R-02 증거가 바뀌었고 R-01 기록 대상 칸만 새로 고침 — R-01은 READY 그대로, R-02는 UNVERIFIED",
    inputs: () => {
      const v2 = evidence({
        siblingTarget: { "SYN-R-01": F1_CHANGED_VALUE, "SYN-R-02": F1_CHANGED_VALUE },
      });
      return regressionInputs({
        record: recordFor(
          {},
          [],
          {},
          { ...evidenceTargetsOf(evidence()), "R-01": evidenceTargetsOf(v2)["R-01"] }
        ),
        targets: { ...CURRENT_TARGETS, ...evidenceTargetsOf(v2) },
        sibling: v2,
      });
    },
    exitCode: 1,
    verdict: INTERNAL_BLOCKED,
    outputHas: ["R-01: READY", "R-02: UNVERIFIED"],
    outputLacks: ["공개 가능"],
  },
];

/** 양성 대조: 유효한 새 증거 서명·같은 증거·줄 순서만 다른 증거는 같은 길로 통과한다. */
const F1_PASSING_CASES: RegressionCase[] = [
  {
    tag: "F1-양성",
    name: "형제 증거가 기록·서명과 같으면 통과한다",
    inputs: () => f1Inputs(evidence(), evidence()),
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["R-02: READY", "서명 점검: 통과"],
    child: true,
  },
  {
    tag: "F1-양성",
    name: "형제 증거가 바뀌어도 새 증거 digest를 기록 대상 칸에 쓰고 새로 서명하면 통과한다",
    inputs: () => {
      const v2 = evidence({ siblingTarget: { "SYN-R-02": F1_CHANGED_VALUE } });
      return f1Inputs(v2, v2);
    },
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["R-02: READY", "서명 점검: 통과"],
    outputLacks: [F1_CHANGED_VALUE],
  },
  {
    tag: "F1-양성",
    name: "참조 줄이 늘었다가 새 증거로 다시 기록·서명하면 통과한다",
    inputs: () => {
      const v2 = evidence({ siblingItems: { "R-02": [...TWO_LINES["R-02"], "SYN-R-02-c"] } });
      return f1Inputs(v2, v2);
    },
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["R-02: READY", "서명 점검: 통과"],
  },
  {
    tag: "F1-양성",
    name: "참조 줄이 줄었다가 새 증거로 다시 기록·서명하면 통과한다",
    inputs: () => {
      const v1 = evidence({ siblingItems: TWO_LINES });
      return f1Inputs(v1, evidence(), {
        record: recordFor({}, [], {}, evidenceTargetsOf(evidence())),
        targets: { ...CURRENT_TARGETS, ...evidenceTargetsOf(evidence()) },
      });
    },
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["R-02: READY", "서명 점검: 통과"],
  },
  {
    tag: "F1-양성",
    name: "참조 줄 순서만 바뀌면 같은 증거라서 통과한다",
    inputs: () =>
      f1Inputs(
        evidence({ siblingItems: TWO_LINES }),
        evidence({ siblingItems: TWO_LINES, reverseLines: true })
      ),
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["R-02: READY", "서명 점검: 통과"],
  },
  {
    tag: "F1-양성",
    name: "운영 단계 I: I 열이 해당 없음인 R-05의 증거가 바뀌어도 내부 시험 판정은 달라지지 않는다",
    inputs: () =>
      f1Inputs(evidence(), evidence({ siblingTarget: { "SYN-R-05": F1_CHANGED_VALUE } })),
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["서명 점검: 통과"],
    outputLacks: ["R-05"],
  },
  {
    tag: "F1-양성",
    name: "로컬 시험 판정: 운영 한정 R-04의 증거가 바뀌어도 해당 없음(local) 그대로이고 판정은 달라지지 않는다",
    inputs: () =>
      f1Inputs(evidence(), evidence({ siblingTarget: { "SYN-R-04": F1_CHANGED_VALUE } }), {
        request: local(["S1"]),
      }),
    exitCode: 0,
    verdict: "로컬 시험 가능",
    outputHas: ["R-04: 해당 없음(local)", "서명 점검: 통과"],
  },
  {
    tag: "F1-양성",
    name: "--targets에 R 항목이 없어도 R 항목의 현재 대상 값은 형제 증거에서 계산하므로 통과한다(--targets는 R 항목에 쓰지 않는다)",
    inputs: () =>
      f1Inputs(evidence(), evidence(), {
        targets: Object.fromEntries(
          Object.entries(CURRENT_TARGETS).filter(([id]) => !SIBLING_ITEM_IDS.includes(id))
        ),
      }),
    exitCode: 0,
    verdict: "내부 시험 공개 가능",
    outputHas: ["R-02: READY", "서명 점검: 통과"],
  },
];

describe("PR #24 잔여 결함 F1 회귀 — 형제 증거 대상 값이 바뀌면 R 항목의 기록·서명이 따라가지 못한다", () => {
  for (const c of [...F1_BLOCKED_CASES, ...F1_PASSING_CASES]) {
    const paths: RegressionPath[] = c.child
      ? ["checkLaunchGate", "runCli", "자식 프로세스 CLI"]
      : ["checkLaunchGate", "runCli"];
    for (const pathName of paths) {
      it(`${c.tag} ${c.name} → ${pathName}: 종료 코드 ${c.exitCode}`, { timeout: 60_000 }, () => {
        const result = runRegression(pathName, c.inputs());

        expect(result.exitCode, result.output).toBe(c.exitCode);
        expect(result.output).toContain(`판정: ${c.verdict}`);
        for (const text of c.outputHas) expect(result.output).toContain(text);
        for (const text of c.outputLacks ?? []) expect(result.output).not.toContain(text);
      });
    }
  }

  it("F1 시험은 요청서의 (A)~(H)와 항목 독립 시험을 모두 담는다", () => {
    expect(new Set(F1_BLOCKED_CASES.map((c) => c.tag))).toEqual(
      new Set(["F1-A", "F1-B", "F1-C", "F1-D", "F1-E", "F1-F", "F1-G", "F1-H", "F1-독립"])
    );
  });
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
