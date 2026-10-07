import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { RECORD_COLUMNS, parseGateRecord } from "../lib/launch/gate-record";
import { parseItemTable, type ItemRow } from "../lib/launch/item-table";
import {
  checkLaunchGate,
  evaluateLaunchGate,
  runCli,
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

function targetOf(id: string): string {
  return `대상-${id}`;
}

/** 표의 모든 항목을 한 행씩 적은 기록 마크다운. 기본 상태는 READY이고 `statuses`가 항목별로 덮어쓴다. */
function recordFor(statuses: Readonly<Record<string, string>> = {}, omit: readonly string[] = []) {
  const rows = ITEM_ROWS.filter((row) => !omit.includes(row.id)).map((row) => {
    const status = row.id in statuses ? statuses[row.id] : "READY";
    return `| ${row.id} | 증명 ${row.id} | 위치-예시 | 역할-예시 | 날짜-예시 | ${targetOf(row.id)} | ${row.events.join(", ")} | ${status} |`;
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
  return checkLaunchGate({
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

    // 얼린 입력을 쓰므로 점검기가 기록을 고치려 하면 TypeError로 드러난다.
    const result = evaluateLaunchGate({
      items: deepFreeze(ITEM_ROWS.map((row) => ({ ...row }))),
      record,
      currentTargets: CURRENT_TARGETS,
      request: local(["S1"]),
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.stringify(record)).toBe(before);
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
    const result = checkLaunchGate({
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

    const result = checkLaunchGate({
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

  function files(statuses: Record<string, string>): { record: string; targets: string } {
    tmpDir = mkdtempSync(path.join(tmpdir(), "check-launch-gate-"));
    const record = path.join(tmpDir, "record.md");
    const targets = path.join(tmpDir, "targets.json");
    writeFileSync(record, recordFor(statuses), "utf-8");
    writeFileSync(targets, JSON.stringify(CURRENT_TARGETS), "utf-8");
    return { record, targets };
  }

  function runCli(args: string[]) {
    return spawnSync(process.execPath, [tsxCliPath, scriptPath, ...args], {
      cwd: projectRoot,
      encoding: "utf-8",
    });
  }

  it("통과하는 로컬 시험 판정은 종료 코드 0이고 판정과 해당 없음(local) 표지를 stdout에 적는다", () => {
    const { record, targets } = files(UNVERIFIED_PRODUCTION_ONLY);

    const result = runCli([
      "--items",
      SPEC_PATH,
      "--record",
      record,
      "--targets",
      targets,
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
    const { record, targets } = files({ "L-04": "BLOCKED" });

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

  it("열거 밖 실행 환경은 종료 코드 2로 거부하고 이유를 stderr에 적는다", () => {
    const { record, targets } = files({});

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
    const { record, targets } = files({});

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

    const result = runCli(
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
