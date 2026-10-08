// SPEC-B2C-LAUNCH-001 M1d: 표지값 유출 검사 (REQ-B2CLAUNCH-007, AC-B2CLAUNCH-007).
//
// 표지값은 실행 시점에 무작위로 만들며 어떤 추적 파일에도 값을 고정 리터럴로 적지 않는다 — 이 시험 소스에는
// 접두사와 난수 생성 호출(도우미 모듈 안)만 있다. 값이 든 입력 파일은 저장소 밖 임시 폴더에만 두고 시험이
// 끝나면(실패 경로 포함) 지운다. 단언이 실패해도 값이 출력되지 않도록 항상 표지값의 라벨(이름)만 적는다.
//
// 이 검사가 보지 못하는 것(acceptance.md AC-B2CLAUNCH-007 "이 검사가 보지 못하는 것"):
//  - 미리 알지 못하는 실제 값의 유출(표지값이 아닌 실제 연락처·실명·진단 문장)
//  - 표지값을 인코딩·절단한 형태
//  - 저장소 밖과 `.gitignore`가 무시하는 경로에 있는 기록의 내용 자체(`git grep --untracked`는 무시되는 파일을
//    보지 않으며 (3)이 그 위치만 확인한다)
//  - 두 번의 실행이 서로 다르다는 사실은 값이 매번 새로 생성된다는 증명이 아니다
// 이 시험이 표지값을 놓는 자리 밖의 입력 칸(열거 칸: 기록 상태, 법무 확인 결과, 실행 환경)은 열거 밖 값을 오류
// 메시지에 되풀이해 적는 기존 설계(gate-record.test.ts가 그 값을 단언한다)라서 이 검사의 대상이 아니다.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { normalizePhone } from "../lib/consult/phone";
import { RECORD_COLUMNS, parseGateRecord } from "../lib/launch/gate-record";
import { parseItemTable } from "../lib/launch/item-table";
import {
  LEGAL_CONFIRMATION_COLUMNS,
  judgeLegalConfirmation,
  parseLegalConfirmation,
} from "../lib/launch/legal-confirmation";
import {
  SYNTHETIC_SIBLING_SPEC,
  syntheticSiblingEvidence,
} from "../lib/launch/sibling-evidence.fixture";
import { SIBLING_REF_COLUMNS, siblingRecordKey } from "../lib/launch/sibling-reference";
import { SIGNER_COLUMNS, SNAPSHOT_COLUMNS } from "../lib/launch/signature";
import { runCli } from "./check-launch-gate";
import {
  createMarkerSet,
  findMarkersInDirectory,
  generateMarkerSet,
  gitGrepFiles,
  gitGrepHasMatch,
  isAcceptableMarkerLocation,
  markerStrings,
  type MarkerSet,
} from "./launch-marker-check";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const scriptPath = path.join(scriptDir, "check-launch-gate.ts");
const tsxCliPath = fileURLToPath(import.meta.resolve("tsx/cli"));
const RUNBOOK_PATH = path.join(projectRoot, ".moai", "docs", "launch-gate-runbook.md");
const CONSULTOPS_SPEC = "SPEC-B2C-CONSULTOPS-001";
const CONSULTOPS_SPEC_PATH = path.join(projectRoot, ".moai", "specs", CONSULTOPS_SPEC, "spec.md");
const ALLOWED_ROLES = ["제품 책임자", "운영 책임자", "법무"];

// ---- 정리 ------------------------------------------------------------------------------------

const cleanups: Array<() => void> = [];

afterEach(() => {
  // 뒤에 만든 것부터 지운다. 하나가 실패해도 나머지는 지운다.
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop() as () => void;
    try {
      cleanup();
    } catch {
      // 이미 지워진 경우 등. 정리 실패가 시험 결과를 가리지 않게 한다.
    }
  }
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function plantFile(file: string, content: string): void {
  writeFileSync(file, content, "utf-8");
  cleanups.push(() => rmSync(file, { force: true }));
}

/** 확장자는 `.gitignore`가 무시하지 않는 `.txt`여야 한다(`*.tmp`는 무시되어 비추적 파일 대조가 되지 않는다). */
function uniqueProbeName(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.txt`;
}

const presentInRepo = (value: string) => gitGrepHasMatch(projectRoot, value);

// ---- 표지값 만들기 ---------------------------------------------------------------------------

describe("표지값 생성 — 실행 시점에 무작위로 만들고 저장소에 이미 있으면 다시 만든다", () => {
  it("연락처는 lib/consult/phone.ts의 국내 휴대폰 형식을 따르고 하이픈 표기와 없는 표기가 같은 번호다", () => {
    const set = createMarkerSet();

    expect(normalizePhone(set.phone)).toBe(set.phone);
    expect(normalizePhone(set.phoneHyphen)).toBe(set.phone);
    expect(set.phoneHyphen).toMatch(/^01[016789]-\d{3,4}-\d{4}$/);
    expect(set.phoneHyphen).not.toBe(set.phone);
  });

  it("이름은 20자 이하이고 여덟 문자열이 서로 다르다", () => {
    const set = createMarkerSet();
    const values = markerStrings(set).map((marker) => marker.value);

    expect(set.name.length).toBeLessThanOrEqual(20);
    expect(new Set(values).size).toBe(values.length);
  });

  it("검색 대상은 여섯 종류의 표지값이고 연락처는 두 표기 모두 들어 있다", () => {
    const labels = markerStrings(createMarkerSet()).map((marker) => marker.label);

    expect(labels).toEqual([
      "secret",
      "diagnosis",
      "phone",
      "phoneHyphen",
      "name",
      "ownerName",
      "ownerContact",
      "legal",
    ]);
  });

  it("두 번 만든 표지값은 모든 문자열이 서로 다르다", () => {
    const a = markerStrings(createMarkerSet());
    const b = markerStrings(createMarkerSet());

    expect(a.map((marker) => marker.label)).toEqual(b.map((marker) => marker.label));
    expect(
      a.filter((marker, i) => marker.value === b[i].value).map((marker) => marker.label)
    ).toEqual([]);
  });

  it("만든 값이 이미 있으면 처음부터 다시 만든다", () => {
    const checked: string[] = [];
    let calls = 0;

    const set = generateMarkerSet((value) => {
      calls += 1;
      checked.push(value);
      // 처음 세 번의 검사는 "이미 있다"로 답한다 — 그때마다 한 세트가 통째로 버려진다.
      return calls <= 3;
    });

    expect(calls).toBeGreaterThan(3);
    // 돌려준 세트는 "없다"고 확인된 값들이고, 버려진 세트의 값은 쓰지 않는다.
    const returned = markerStrings(set).map((marker) => marker.value);
    expect(returned.every((value) => checked.indexOf(value) >= 3)).toBe(true);
  });

  it("끝까지 이미 있다고 답하면 포기하고 오류를 던지되 값은 오류 메시지에 적지 않는다", () => {
    let leaked = "";
    const seenValues: string[] = [];

    try {
      generateMarkerSet((value) => {
        seenValues.push(value);
        return true;
      });
    } catch (error) {
      leaked = (error as Error).message;
    }

    expect(leaked).not.toBe("");
    expect(seenValues.filter((value) => leaked.includes(value))).toEqual([]);
  });
});

// ---- 검색 도구 -------------------------------------------------------------------------------

describe("검색 도구 — 폴더 검색과 git grep --untracked", () => {
  it("폴더 안 파일에서 표지값을 찾고 라벨만 돌려준다(연락처는 두 표기를 따로 찾는다)", () => {
    const dir = makeTempDir("marker-find-");
    const set = createMarkerSet();
    mkdirSync(path.join(dir, "sub"));
    writeFileSync(path.join(dir, "a.log"), `줄 ${set.phoneHyphen} 끝`, "utf-8");
    writeFileSync(path.join(dir, "sub", "b.log"), `${set.secret} 와 ${set.phone}`, "utf-8");
    writeFileSync(path.join(dir, "c.log"), "표지값 없음", "utf-8");

    const found = findMarkersInDirectory(dir, markerStrings(set));

    expect(found.sort()).toEqual(
      ["a.log:phoneHyphen", "sub/b.log:phone", "sub/b.log:secret"].sort()
    );
    expect(found.filter((entry) => entry.includes(set.secret))).toEqual([]);
  });

  it("표지값이 없으면 빈 목록이다", () => {
    const dir = makeTempDir("marker-find-");
    writeFileSync(path.join(dir, "a.log"), "표지값 없음", "utf-8");

    expect(findMarkersInDirectory(dir, markerStrings(createMarkerSet()))).toEqual([]);
  });

  it("(양성·음성 대조) 방금 만든 값은 저장소 어디에도 없고, 작업 트리에 심은 비추적 파일의 값은 찾는다", () => {
    const set = createMarkerSet();
    const values = markerStrings(set).map((marker) => marker.value);
    expect(values.filter(presentInRepo)).toEqual([]);

    const probe = path.join(projectRoot, uniqueProbeName("marker-probe-unit"));
    plantFile(probe, `${set.secret}\n`);

    expect(gitGrepHasMatch(projectRoot, set.secret)).toBe(true);
    expect(gitGrepFiles(projectRoot, values).map((file) => path.basename(file))).toEqual([
      path.basename(probe),
    ]);
  });

  it("값 기록 위치 판정: 저장소 밖은 인정하고, 추적 파일과 무시되지 않는 미추적 파일은 인정하지 않고, 무시되는 미추적 파일은 인정한다", () => {
    const outside = path.join(makeTempDir("marker-location-"), "record.md");
    writeFileSync(outside, "내용 없음", "utf-8");

    const untrackedProbe = path.join(projectRoot, uniqueProbeName("marker-location-untracked"));
    plantFile(untrackedProbe, "내용 없음");

    const ignoredDir = path.join(projectRoot, ".moai", "state", "verify", "launch-run");
    mkdirSync(ignoredDir, { recursive: true });
    const ignoredProbe = path.join(ignoredDir, uniqueProbeName("marker-location-ignored"));
    plantFile(ignoredProbe, "내용 없음");

    expect(isAcceptableMarkerLocation(projectRoot, outside)).toBe(true);
    expect(isAcceptableMarkerLocation(projectRoot, path.join(projectRoot, "package.json"))).toBe(
      false
    );
    expect(isAcceptableMarkerLocation(projectRoot, untrackedProbe)).toBe(false);
    expect(isAcceptableMarkerLocation(projectRoot, ignoredProbe)).toBe(true);
  });
});

// ---- M1이 만든 절차를 표지값 입력으로 모두 실행한다 -------------------------------------------

/** 런북의 항목 정의표 행(표지값은 들어 있지 않다). */
const ITEM_ROWS = (() => {
  const parsed = parseItemTable(readFileSync(RUNBOOK_PATH, "utf-8").replace(/\r\n/g, "\n"));
  if (!parsed.ok) throw new Error(`런북 항목 표가 통과해야 한다: ${parsed.errors.join("|")}`);
  return parsed.rows;
})();

function table(columns: readonly string[], rows: readonly string[][]): string {
  return [
    `| ${columns.join(" | ")} |`,
    `|${columns.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

interface ProcedureRun {
  inDir: string;
  outDir: string;
  inputFiles: string[];
}

/**
 * 표지값을 AC가 적은 입력 자리에 쓰고 M1의 절차를 모두 실행한다. 입력은 저장소 밖 임시 폴더(in/)에, 절차가 남긴
 * 출력·로그는 out/에 둔다. 각 절차의 출력은 호출한 절차가 돌려준 문자열 그대로다.
 *  - 시크릿: 자식 프로세스 점검기의 환경 변수와 노출 기록의 보관 위치 칸
 *  - 진단 입력 문장: 기록의 `증명하는 것` 칸 / 상담 접수 행(연락처 두 표기·이름): L-07 칸들
 *  - 담당자·서명자 이름·연락처: 서명 기록의 역할·날짜 칸(거부 경로), 기록의 역할 칸, 형제 참조 줄의 위치 칸
 *  - 법적 판단 문구: 법무 확인 기록의 확인 대상 식별자 칸과 허용되지 않은 자유 서술 칸, 기록의 칸
 */
function runProcedures(set: MarkerSet): ProcedureRun {
  const workDir = makeTempDir("launch-marker-run-");
  const inDir = path.join(workDir, "in");
  const outDir = path.join(workDir, "out");
  mkdirSync(inDir);
  mkdirSync(outDir);
  const inputFiles: string[] = [];
  const writeInput = (name: string, content: string): string => {
    const file = path.join(inDir, name);
    writeFileSync(file, content, "utf-8");
    inputFiles.push(file);
    return file;
  };
  const writeOutput = (name: string, content: string): void => {
    writeFileSync(path.join(outDir, name), content, "utf-8");
  };

  // 기록: 모든 항목 READY, 표지값은 자유 서술 칸에만 쓴다.
  const freeText: Record<
    string,
    Partial<Record<"proves" | "location" | "role" | "date", string>>
  > = {
    "L-02": { location: set.secret },
    "L-04": { proves: set.diagnosis },
    "L-06": { role: set.ownerName },
    "L-07": { proves: set.phoneHyphen, location: set.phone, role: set.name },
    "L-08": { proves: set.legal },
    "L-09": { date: set.ownerContact },
  };
  const recordRows = ITEM_ROWS.map((row) => {
    const extra = freeText[row.id] ?? {};
    return [
      row.id,
      extra.proves ?? `증명 ${row.id}`,
      extra.location ?? "위치-예시",
      extra.role ?? "역할-예시",
      extra.date ?? "날짜-예시",
      `대상-${row.id}`,
      row.events.join(", "),
      "READY",
    ];
  });
  const record = table(RECORD_COLUMNS, recordRows);
  const recordFile = writeInput("record.md", record);
  const targetsFile = writeInput(
    "targets.json",
    JSON.stringify(Object.fromEntries(ITEM_ROWS.map((row) => [row.id, `대상-${row.id}`])))
  );

  // 서명은 요청(운영 단계 I, 표면 전체)의 필수 항목 집합과 같은 항목만 덮는다 — I 열이 해당 없음인 항목은 뺀다.
  const snapshot = recordRows
    .filter((_, index) => ITEM_ROWS[index].i !== "해당 없음")
    .map((row) => [row[0], "READY", row[5]]);
  const goodSignature = writeInput(
    "signature.md",
    `${table(SIGNER_COLUMNS, [["제품 책임자", "날짜-예시", "production"]])}\n\n${table(SNAPSHOT_COLUMNS, snapshot)}`
  );
  // 담당자·서명자 이름·연락처를 서명 기록의 역할·날짜 칸에 쓴 거부 경로.
  const strangerSignature = writeInput(
    "signature-stranger.md",
    `${table(SIGNER_COLUMNS, [[set.ownerName, set.ownerContact, "production"]])}\n\n${table(SNAPSHOT_COLUMNS, snapshot)}`
  );

  // 적용되는 필수 R 항목은 모두 완전한 형제 증거가 있어야 하므로 R-04는 실제 CONSULTOPS-001 정의표를 조회하고
  // 나머지 형제 참조 항목은 합성 형제 증거로 채운다(위치 칸에는 표지값을 그대로 써서 통과 경로의 누출을 본다).
  const others = syntheticSiblingEvidence(
    ITEM_ROWS.filter((row) => /^R-\d+$/.test(row.id) && row.id !== "R-04").map((row) => row.id)
  );
  const siblingRefs = writeInput(
    "sibling-refs.md",
    table(SIBLING_REF_COLUMNS, [
      ["R-04", CONSULTOPS_SPEC, "E-03", "READY", "형제값-예시-1", set.ownerContact],
      ...others.rows.map((cells) => [...cells.slice(0, 5), set.ownerContact]),
    ])
  );
  const syntheticDefinitions = writeInput(
    "sibling-synthetic-defs.md",
    others.definitions[SYNTHETIC_SIBLING_SPEC].markdown
  );
  const siblingDefs = writeInput(
    "sibling-defs.json",
    JSON.stringify({
      [CONSULTOPS_SPEC]: {
        file: CONSULTOPS_SPEC_PATH,
        labels: ["ID", "증거 항목", "I", "G", "근거", "대상 / 무효화 사건"],
      },
      [SYNTHETIC_SIBLING_SPEC]: {
        file: syntheticDefinitions,
        labels: others.definitions[SYNTHETIC_SIBLING_SPEC].labels,
      },
    })
  );
  const siblingRecords = writeInput(
    "sibling-records.json",
    JSON.stringify({
      ...others.records,
      [siblingRecordKey(CONSULTOPS_SPEC, "E-03")]: { status: "READY", target: "형제값-예시-1" },
    })
  );

  const baseArgs = [
    "--items",
    RUNBOOK_PATH,
    "--record",
    recordFile,
    "--targets",
    targetsFile,
    "--allowed-roles",
    ALLOWED_ROLES.join(","),
    "--sibling-refs",
    siblingRefs,
    "--sibling-defs",
    siblingDefs,
    "--sibling-records",
    siblingRecords,
    "--environment",
    "production",
    "--stage",
    "I",
    "--surfaces",
    "S1,S2,S3",
  ];

  // 1) 점검기(프로세스 안): 기록 파서·항목 점검·서명 점검·형제 참조 줄을 한 번에 지난다.
  const pass = runCli([...baseArgs, "--signature", goodSignature]);
  writeOutput("check-pass.log", `exit=${pass.exitCode}\n${pass.output}\n`);
  expect(pass.exitCode, "표지값이 든 입력도 점검기 통과 경로를 지나야 한다").toBe(0);

  // 2) 점검기(프로세스 안): 서명 기록의 역할·날짜 칸에 이름·연락처가 든 거부 경로.
  const stranger = runCli([...baseArgs, "--signature", strangerSignature]);
  writeOutput("check-stranger.log", `exit=${stranger.exitCode}\n${stranger.output}\n`);
  expect(stranger.exitCode, "허용되지 않은 역할은 종료 코드 1이어야 한다").toBe(1);

  // 3) 점검기(자식 프로세스): 시크릿을 환경 변수로 받고 stdout·stderr를 파일로 남기는 실제 명령줄 절차.
  const child = spawnSync(
    process.execPath,
    [tsxCliPath, scriptPath, ...baseArgs, "--signature", goodSignature],
    {
      cwd: projectRoot,
      encoding: "utf-8",
      env: { ...process.env, RATE_LIMIT_HMAC_SECRET: set.secret },
    }
  );
  writeOutput("check-child.stdout.log", child.stdout);
  writeOutput("check-child.stderr.log", child.stderr);
  expect(child.status, "자식 프로세스 점검기도 통과해야 한다").toBe(0);

  // 4) 기록 파서만의 검증 출력.
  const parsed = parseGateRecord(record);
  writeOutput(
    "record-parse.log",
    parsed.ok ? `ok items=${parsed.items.length}\n` : `${parsed.errors.join("\n")}\n`
  );
  expect(parsed.ok).toBe(true);

  // 5) 법무 확인 기록: 확인 대상 식별자 칸에 법적 판단 문구(허용된 칸 안), 그리고 자유 서술 칸(거부 경로).
  const legalOk = writeInput(
    "legal-confirmation.md",
    table(LEGAL_CONFIRMATION_COLUMNS, [[set.legal, "버전-예시", "법무", "날짜-예시", "일치 확인"]])
  );
  const legalFree = writeInput(
    "legal-free.md",
    table(
      [...LEGAL_CONFIRMATION_COLUMNS, "의견"],
      [[set.ownerName, "버전-예시", "법무", "날짜-예시", "일치 확인", set.legal]]
    )
  );
  const readInput = (file: string) => readFileSync(file, "utf-8");
  const legalParsed = parseLegalConfirmation(readInput(legalOk));
  writeOutput(
    "legal-confirmation.log",
    legalParsed.ok
      ? legalParsed.records
          .map((r) => `${judgeLegalConfirmation(r, "버전-예시").status}`)
          .join("\n")
      : legalParsed.errors.join("\n")
  );
  expect(legalParsed.ok).toBe(true);
  const legalRejected = parseLegalConfirmation(readInput(legalFree));
  writeOutput("legal-free.log", legalRejected.ok ? "통과" : legalRejected.errors.join("\n"));
  expect(legalRejected.ok, "자유 서술 칸이 있는 확인 기록은 거부되어야 한다").toBe(false);

  return { inDir, outDir, inputFiles };
}

describe("AC-B2CLAUNCH-007 — 표지값 유출 검사 (0)~(4)", () => {
  it("(0) 양성 대조: 같은 검색이 작업 트리 안에 심은 비추적 임시 파일의 표지값을 찾고, 지운 뒤에는 찾지 못한다", () => {
    const set = generateMarkerSet(presentInRepo);
    const values = markerStrings(set).map((marker) => marker.value);
    const probe = path.join(projectRoot, uniqueProbeName("marker-probe-ac007"));

    writeFileSync(probe, `${set.secret}\n${set.phoneHyphen}\n`, "utf-8");
    let foundWhilePlanted: string[] = [];
    try {
      foundWhilePlanted = gitGrepFiles(projectRoot, values).map((file) => path.basename(file));
    } finally {
      rmSync(probe, { force: true });
    }

    expect(foundWhilePlanted).toEqual([path.basename(probe)]);
    expect(existsSync(probe)).toBe(false);
    expect(gitGrepFiles(projectRoot, values)).toEqual([]);
  });

  it("(1)(2)(3) 모든 절차를 실행한 뒤 출력·로그와 저장소 전체에 표지값이 없고 값이 든 기록은 저장소 밖에만 있다", () => {
    const set = generateMarkerSet(presentInRepo);
    const strings = markerStrings(set);

    const run = runProcedures(set);

    // (1) 시험이 남긴 출력·로그(값 기록 위치인 in/은 제외).
    expect(findMarkersInDirectory(run.outDir, strings)).toEqual([]);
    // (2) 저장소의 추적 파일과 무시되지 않는 미추적 파일 전체.
    expect(
      gitGrepFiles(
        projectRoot,
        strings.map((marker) => marker.value)
      )
    ).toEqual([]);
    // (3) 표지값을 담은 기록은 저장소 밖(또는 추적되지 않고 무시되는 위치)에만 있다.
    expect(run.inputFiles.length).toBeGreaterThan(5);
    expect(run.inputFiles.filter((file) => !isAcceptableMarkerLocation(projectRoot, file))).toEqual(
      []
    );
    // 입력 폴더에는 표지값이 실제로 들어 있다 — 입력이 비어 있어 통과하는 것이 아님을 확인한다(값은 출력하지 않는다).
    expect(
      findMarkersInDirectory(run.inDir, strings).map((entry) => entry.split(":").pop())
    ).toEqual(expect.arrayContaining(strings.map((marker) => marker.label)));
  }, 120_000);

  it("(4) 시험을 두 번 실행하면 두 번의 표지값 집합이 모두 서로 다르다 — 단, 이것은 값이 매번 새로 생성된다는 증명이 아니다", () => {
    const first = generateMarkerSet(presentInRepo);
    runProcedures(first);
    const second = generateMarkerSet(presentInRepo);
    runProcedures(second);

    const a = markerStrings(first);
    const b = markerStrings(second);
    expect(
      a.filter((marker, i) => marker.value === b[i].value).map((marker) => marker.label)
    ).toEqual([]);
  }, 120_000);

  it("시험 도중 만든 임시 폴더와 심은 파일은 모두 afterEach에서 지워진다", () => {
    const dir = makeTempDir("marker-cleanup-");
    const probe = path.join(projectRoot, uniqueProbeName("marker-probe-cleanup"));
    plantFile(probe, "내용 없음");
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(probe)).toBe(true);

    // afterEach와 같은 순서로 정리를 직접 실행해 본다.
    const pending = cleanups.splice(0, cleanups.length);
    while (pending.length > 0) (pending.pop() as () => void)();

    expect(existsSync(dir)).toBe(false);
    expect(existsSync(probe)).toBe(false);
  });
});
