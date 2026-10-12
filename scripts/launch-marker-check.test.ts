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
//
// 파일 끝의 "런북 갱신·로그 발췌" 절은 acceptance.md AC-B2CLAUNCH-007 Given의 남은 절차를 같은 표지값 입력에서
// 실행한다: 실제 런북의 저장소 밖 사본에서 L-08 스냅샷을 다시 측정해 고치고, 기록·서명·형제 참조를 런북의 `항목 상태
// 갱신 절차`대로 갱신하고, 실제 점검기·파서 출력에서 로그 발췌를 만든 뒤 사본·발췌·출력 모두를 누출 검색에 넣는다.
// 이 임시 사본·입력·발췌는 시험 자료이며 정식 go/no-go 기록·서명·L-09가 아니다. 저장소의 실제 런북은 읽기만 한다.
// "런북 갱신"을 이 두 갱신(런북이 스스로 고친다고 적은 유일한 표 + 기록 파일의 갱신 절차)으로 읽었다 — 런북의 다른
// 곳을 사람이 직접 고치는 경우는 이 시험이 보지 못한다.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { normalizePhone } from "../lib/consult/phone";
import { classifyFooterElement, type FooterElementState } from "../lib/launch/footer-element-state";
import { RECORD_COLUMNS, parseGateRecord } from "../lib/launch/gate-record";
import { parseItemTable } from "../lib/launch/item-table";
import {
  LEGAL_CONFIRMATION_COLUMNS,
  judgeLegalConfirmation,
  parseLegalConfirmation,
} from "../lib/launch/legal-confirmation";
import { ALLOWANCE_RECORD } from "../lib/launch/legal-notice-record.fixture";
import {
  SYNTHETIC_SIBLING_SPEC,
  syntheticSiblingEvidence,
} from "../lib/launch/sibling-evidence.fixture";
import {
  SIBLING_REF_COLUMNS,
  computeSiblingEvidenceTarget,
  siblingRecordKey,
} from "../lib/launch/sibling-reference";
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
  // 적용되는 필수 R 항목은 모두 완전한 형제 증거가 있어야 하므로 R-04는 실제 CONSULTOPS-001 정의표를 조회하고
  // 나머지 형제 참조 항목은 합성 형제 증거로 채운다(위치 칸에는 표지값을 그대로 써서 통과 경로의 누출을 본다).
  const others = syntheticSiblingEvidence(
    ITEM_ROWS.filter((row) => /^R-\d+$/.test(row.id) && row.id !== "R-04").map((row) => row.id)
  );
  const siblingRecordContents = {
    ...others.records,
    [siblingRecordKey(CONSULTOPS_SPEC, "E-03")]: { status: "READY", target: "형제값-예시-1" },
  };
  // R 항목의 기록 대상 칸은 현재 형제 증거 대상 값이다(REQ-B2CLAUNCH-005) — 이 입력의 형제 증거로 계산한다.
  const siblingLines = [
    {
      launchItem: "R-04",
      siblingSpec: CONSULTOPS_SPEC,
      siblingItem: "E-03",
      status: "READY" as const,
      target: "형제값-예시-1",
      location: set.ownerContact,
    },
    ...others.lines,
  ];
  const targetOf = (id: string): string =>
    computeSiblingEvidenceTarget(id, siblingLines, siblingRecordContents) ?? `대상-${id}`;
  const recordRows = ITEM_ROWS.map((row) => {
    const extra = freeText[row.id] ?? {};
    return [
      row.id,
      extra.proves ?? `증명 ${row.id}`,
      extra.location ?? "위치-예시",
      extra.role ?? "역할-예시",
      extra.date ?? "날짜-예시",
      targetOf(row.id),
      row.events.join(", "),
      "READY",
    ];
  });
  const record = table(RECORD_COLUMNS, recordRows);
  const recordFile = writeInput("record.md", record);
  const targetsFile = writeInput(
    "targets.json",
    JSON.stringify(Object.fromEntries(ITEM_ROWS.map((row) => [row.id, targetOf(row.id)])))
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
  const siblingRecords = writeInput("sibling-records.json", JSON.stringify(siblingRecordContents));

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

// ---- 런북 갱신·로그 발췌: Given의 남은 절차를 표지값 입력으로 실행한다 -------------------------------------
//
// 런북은 기록·서명·값을 담지 않는 문서라서(런북 머리) 사람이 손으로 고치는 런북 표는 `## L-08 법적 고지 표면 현황
// (M2 스냅샷)` 하나뿐이다 — 그 절이 "다시 측정하기 전에는 현재 상태로 읽지 않는다"고 적는다. 기록 파일(저장소 밖)의
// 상태·대상·참조 갱신은 `## 항목 상태 갱신 절차`가 따로 정한다. 둘 다 사람이 문서를 고치는 절차라 제품 코드가 없으므로,
// 이 시험이 같은 편집을 저장소 밖 임시 사본에 파일로 수행하고 실제 점검기·파서의 출력을 이어 붙인다.
// 실패 출력에는 값이 나오지 않도록 비교는 불리언·개수·라벨로만 한다.

const SNAPSHOT_HEADING = "## L-08 법적 고지 표면 현황 (M2 스냅샷)";
/** 공개 기록에서 자유 서술 칸을 대신하는 고정 문구. 값이 아니라 "저장소 밖 기록을 본다"는 표지다. */
const PUBLIC_REF = "저장소-밖-기록-참조";
const INJECTED_FAILURE = "주입한 실패";
/** 발췌에 남기는 줄: 요청 요약, 갱신 대상 두 항목, 서명 점검, 불가 사유, 판정. */
const EXCERPT_LINE = /^(실행 환경|요청 형태|서명 점검|불가 사유|판정)|^(L-08|R-04):/;

const sha256 = (content: string | Buffer): string =>
  createHash("sha256").update(content).digest("hex");
const isTableRow = (line: string): boolean => line.startsWith("|");
const has = (text: string, pattern: RegExp): boolean => pattern.test(text);

function cellsOf(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function withCells(cells: readonly string[], replacements: Record<number, string>): string[] {
  return cells.map((cell, index) => replacements[index] ?? cell);
}

/** 표의 한 행을 첫 칸으로 찾아 고친다. 정확히 하나가 아니면 던져서 "고친 것이 없는데 통과"하는 일을 막는다. */
function rewriteRow(
  markdown: string,
  firstCell: string,
  rewrite: (cells: string[]) => string[]
): string {
  let found = 0;
  const lines = markdown.split("\n").map((line) => {
    if (!isTableRow(line) || cellsOf(line)[0] !== firstCell) return line;
    found += 1;
    return `| ${rewrite(cellsOf(line)).join(" | ")} |`;
  });
  if (found !== 1) throw new Error(`고칠 표 행이 정확히 하나가 아니다(찾은 수: ${found})`);
  return lines.join("\n");
}

/** 런북의 L-08 스냅샷 표에서 요소 행만 칸 배열로 돌려준다. */
function snapshotRows(runbook: string): string[][] {
  const lines = runbook.split("\n");
  const start = lines.indexOf(SNAPSHOT_HEADING);
  if (start === -1) throw new Error("런북에서 L-08 스냅샷 절을 찾지 못했다");
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines
    .slice(start, next === -1 ? undefined : next)
    .filter(isTableRow)
    .map(cellsOf)
    .filter((cells) => /^\d\d-footer-/.test(cells[0]));
}

interface FooterMeasurement {
  href: string | null;
  ariaDisabled?: boolean;
}

/**
 * 푸터 요소를 다시 측정한 결과(속성)로 스냅샷 행을 고친다. 분류는 기존 `classifyFooterElement`이 하고, 칸 채우기는 런북 절의
 * 규칙을 따른다: 목적지 칸은 있음·없음만 적고(주소·연락처·정책 문구·법적 결론은 적지 않는다), I·G 허용 칸은 D-LAUNCH-09
 * 기록(`ALLOWANCE_RECORD`)을 옮기되 결정이 말하지 않은 `# 앵커`·`텍스트만`은 `아니오*`로 적는다.
 */
function refreshSnapshot(runbook: string, measured: Record<string, FooterMeasurement>): string {
  return Object.entries(measured).reduce((text, [id, attributes]) => {
    const state: FooterElementState = classifyFooterElement({
      getAttribute: (name) => {
        if (name === "href") return attributes.href;
        return name === "aria-disabled" && attributes.ariaDisabled ? "true" : null;
      },
    });
    const permitted = (stage: "I" | "G"): boolean =>
      (ALLOWANCE_RECORD[stage] as readonly string[]).includes(state);
    const unstated = state === "# 앵커" || state === "텍스트만";
    return rewriteRow(text, id, (cells) => [
      cells[0],
      cells[1],
      cells[2],
      state,
      state === "목적지 있음" ? "있음" : "없음",
      permitted("I") ? "예" : unstated ? "아니오*" : "아니오",
      permitted("G") ? "예" : "아니오",
    ]);
  }, runbook);
}

/** 저장소 안에 둘 수 있는 형태(런북 `항목 상태 갱신 절차` 9항): 식별자·대상·사건·상태만 남기고 자유 서술 칸은 고정 문구로 바꾼다. */
function toPublicRecord(privateRecord: string): string {
  return privateRecord
    .split("\n")
    .map((line) => {
      const cells = isTableRow(line) ? cellsOf(line) : [];
      if (!/^[LR]-\d+$/.test(cells[0] ?? "")) return line;
      return `| ${withCells(cells, { 1: PUBLIC_REF, 2: PUBLIC_REF, 3: PUBLIC_REF, 4: PUBLIC_REF }).join(" | ")} |`;
    })
    .join("\n");
}

interface UpdateStep {
  name: string;
  exitCode: number;
  output: string;
}

interface UpdateOptions {
  /** 이 지점에서 일부러 실패시킨다 — 실패 경로에서도 임시 산출물이 정리되는지 보려는 것이다. */
  failAt?: "after-copy" | "before-scan";
  /** 만든 임시 폴더 경로를 알려 준다. */
  created?: string[];
}

interface UpdateRun {
  privateDir: string;
  publicDir: string;
  /** 공개 폴더 안의 산출물(상대 경로). */
  publicFiles: string[];
  runbookCopy: string;
  originalRunbook: string;
  refreshedRunbook: string;
  recordBefore: string;
  recordAfter: string;
  publicRecord: string;
  steps: Record<string, UpdateStep>;
  excerpts: Record<string, string[]>;
}

/**
 * 표지값이 든 비공개 입력(기존 `runProcedures`가 만든 입력)에서 시작해 갱신 절차를 파일로 수행한다. 순서는 런북
 * `항목 상태 갱신 절차`를 따른다: 사건 보고(4항) → 기록 상태 `UNVERIFIED`(5항) → 재관측: 새 대상 값·날짜(2·3항) →
 * 서명이 새 대상에 이어지지 않음(8항) → 새 서명 → 형제 증거가 바뀌면 점검기가 출력한 현재 형제 증거 대상 값을 기록과
 * 서명에 옮김(7항). 비공개 폴더에는 표지값이 있고 공개 폴더(런북 사본·공개 기록·검증 출력·로그 발췌)에는 있으면 안 된다.
 */
function runUpdateProcedures(set: MarkerSet, options: UpdateOptions = {}): UpdateRun {
  const work = makeTempDir("launch-marker-update-");
  options.created?.push(work);
  const privateDir = path.join(work, "private");
  const publicDir = path.join(work, "public");
  mkdirSync(privateDir, { recursive: true });
  const publicFiles: string[] = [];
  const writePublic = (relative: string, content: string): string => {
    const file = path.join(publicDir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, "utf-8");
    publicFiles.push(relative);
    return file;
  };

  // 저장소 밖 임시 사본. 저장소의 실제 런북은 읽기만 한다.
  const originalRunbook = readFileSync(RUNBOOK_PATH, "utf-8").replace(/\r\n/g, "\n");
  const runbookCopy = writePublic("launch-gate-runbook.copy.md", originalRunbook);
  if (options.failAt === "after-copy") throw new Error(INJECTED_FAILURE);

  const base = runProcedures(set);
  options.created?.push(path.dirname(base.inDir));
  for (const file of base.inputFiles) {
    copyFileSync(file, path.join(privateDir, path.basename(file)));
  }
  const privateFile = (name: string): string => path.join(privateDir, name);
  const readPrivate = (name: string): string => readFileSync(privateFile(name), "utf-8");
  const rewritePrivate = (name: string, change: (text: string) => string): void =>
    writeFileSync(privateFile(name), change(readPrivate(name)), "utf-8");

  const checkArgs = (items: string, extra: readonly string[] = []): string[] => [
    "--items",
    items,
    "--record",
    privateFile("record.md"),
    "--targets",
    privateFile("targets.json"),
    "--allowed-roles",
    ALLOWED_ROLES.join(","),
    "--sibling-refs",
    privateFile("sibling-refs.md"),
    "--sibling-defs",
    privateFile("sibling-defs.json"),
    "--sibling-records",
    privateFile("sibling-records.json"),
    "--signature",
    privateFile("signature.md"),
    "--environment",
    "production",
    "--stage",
    "I",
    "--surfaces",
    "S1,S2,S3",
    ...extra,
  ];
  const steps: Record<string, UpdateStep> = {};
  const check = (name: string, args: readonly string[]): UpdateStep => {
    const result = runCli(args);
    writePublic(
      path.join("verify-output", `${name}.log`),
      `exit=${result.exitCode}\n${result.output}\n`
    );
    steps[name] = { name, exitCode: result.exitCode, output: result.output };
    return steps[name];
  };

  check("1-baseline", checkArgs(runbookCopy));
  const recordBefore = readPrivate("record.md");

  // 런북 갱신: 푸터를 다시 측정한 비공개 입력(주소·메모에 표지값)에서 스냅샷 두 행을 고친다.
  const measured = {
    "01-footer-privacy": {
      href: `https://example.invalid/${set.ownerContact}?memo=${set.legal}`,
    },
    "02-footer-contact": { href: `https://example.invalid/${set.ownerName}` },
  } satisfies Record<string, FooterMeasurement>;
  writeFileSync(privateFile("footer-measurement.json"), JSON.stringify(measured), "utf-8");
  const refreshedRunbook = refreshSnapshot(
    originalRunbook,
    JSON.parse(readPrivate("footer-measurement.json"))
  );
  writeFileSync(runbookCopy, refreshedRunbook, "utf-8");
  const snapshotTarget = `snapshot-sha256:${sha256(
    snapshotRows(refreshedRunbook)
      .map((cells) => cells.join("|"))
      .join("\n")
  ).slice(0, 16)}`;

  // 기록 갱신: 푸터가 바뀌었으니 L-08에 EV-L1이 일어났다.
  writeFileSync(privateFile("events.json"), JSON.stringify({ "L-08": ["EV-L1"] }), "utf-8");
  check("2-event-reported", checkArgs(runbookCopy, ["--events", privateFile("events.json")]));
  rewritePrivate("record.md", (text) =>
    rewriteRow(text, "L-08", (cells) => withCells(cells, { 7: "UNVERIFIED" }))
  );
  check("3-status-unverified", checkArgs(runbookCopy));

  // 재관측: 새 날짜·새 대상 값으로 READY. 이전 대상 값에 대한 서명은 새 대상에 이어지지 않는다.
  rewritePrivate("record.md", (text) =>
    rewriteRow(text, "L-08", (cells) =>
      withCells(cells, { 4: "날짜-예시-재관측", 5: snapshotTarget, 7: "READY" })
    )
  );
  rewritePrivate("targets.json", (text) =>
    JSON.stringify({ ...JSON.parse(text), "L-08": snapshotTarget })
  );
  check("4-reobserved-old-signature", checkArgs(runbookCopy));

  rewritePrivate("signature.md", (text) =>
    rewriteRow(
      rewriteRow(text, "제품 책임자", (cells) => withCells(cells, { 1: "날짜-예시-재서명" })),
      "L-08",
      (cells) => withCells(cells, { 2: snapshotTarget })
    )
  );
  check("5-resigned", checkArgs(runbookCopy));

  // 참조 갱신: 형제 기록이 바뀌면 점검기가 출력한 현재 형제 증거 대상 값을 기록과 서명에 옮기고 새로 서명한다.
  const siblingKey = siblingRecordKey(CONSULTOPS_SPEC, "E-03");
  rewritePrivate("sibling-records.json", (text) => {
    const records = JSON.parse(text);
    records[siblingKey] = { ...records[siblingKey], target: "형제값-예시-2" };
    return JSON.stringify(records);
  });
  rewritePrivate("sibling-refs.md", (text) =>
    rewriteRow(text, "R-04", (cells) => withCells(cells, { 4: "형제값-예시-2" }))
  );
  const changed = check("6-sibling-evidence-changed", checkArgs(runbookCopy));
  const siblingTarget = /현재 형제 증거 대상 값: (\S+)/.exec(changed.output)?.[1];
  if (siblingTarget === undefined)
    throw new Error("점검기 출력에서 현재 형제 증거 대상 값을 찾지 못했다");
  rewritePrivate("record.md", (text) =>
    rewriteRow(text, "R-04", (cells) =>
      withCells(cells, { 4: "날짜-예시-재관측", 5: siblingTarget })
    )
  );
  rewritePrivate("signature.md", (text) =>
    rewriteRow(
      rewriteRow(text, "제품 책임자", (cells) => withCells(cells, { 1: "날짜-예시-재서명-2" })),
      "R-04",
      (cells) => withCells(cells, { 2: siblingTarget })
    )
  );
  check("7-sibling-resigned", checkArgs(runbookCopy));

  // 공개 기록: 저장소 안에 둘 수 있는 형태로도 같은 판정이 나와야 한다.
  const recordAfter = readPrivate("record.md");
  const publicRecord = toPublicRecord(recordAfter);
  const publicRecordFile = writePublic("gate-record.public.md", publicRecord);
  check("8-public-record", checkArgs(runbookCopy, ["--record", publicRecordFile]));
  const parsed = parseGateRecord(publicRecord);
  writePublic(
    path.join("verify-output", "record-parse.log"),
    `${parsed.ok ? `ok items=${parsed.items.length}` : parsed.errors.join("\n")}\n`
  );

  // 로그 발췌: 실제 점검기 출력에서 필요한 줄만 골라 파일로 남긴다.
  const excerpts: Record<string, string[]> = {};
  for (const step of Object.values(steps)) {
    excerpts[step.name] = step.output.split("\n").filter((line) => EXCERPT_LINE.test(line));
    writePublic(
      path.join("excerpt", `${step.name}.log`),
      `exit=${step.exitCode}\n${excerpts[step.name].join("\n")}\n`
    );
  }

  if (options.failAt === "before-scan") throw new Error(INJECTED_FAILURE);
  return {
    privateDir,
    publicDir,
    publicFiles,
    runbookCopy,
    originalRunbook,
    refreshedRunbook,
    recordBefore,
    recordAfter,
    publicRecord,
    steps,
    excerpts,
  };
}

describe("AC-B2CLAUNCH-007 — Given의 런북 갱신·로그 발췌 절차를 표지값 입력으로 실행", () => {
  it("(갱신·발췌·검색) 런북 사본과 기록을 실제로 고치고 로그 발췌를 만든 뒤, 사본·발췌·출력·공개 기록에 표지값이 없다", () => {
    const set = generateMarkerSet(presentInRepo);
    const strings = markerStrings(set);
    const values = strings.map((marker) => marker.value);
    const realRunbookDigest = sha256(readFileSync(RUNBOOK_PATH));

    const run = runUpdateProcedures(set);
    const { steps } = run;

    // 점검기의 실제 종료 코드: 사건·상태·낡은 서명·형제 증거 변경은 막히고, 재관측·새 서명·공개 기록은 통과한다.
    expect(
      Object.fromEntries(Object.values(steps).map((step) => [step.name, step.exitCode]))
    ).toEqual({
      "1-baseline": 0,
      "2-event-reported": 1,
      "3-status-unverified": 1,
      "4-reobserved-old-signature": 1,
      "5-resigned": 0,
      "6-sibling-evidence-changed": 1,
      "7-sibling-resigned": 0,
      "8-public-record": 0,
    });
    expect(has(steps["2-event-reported"].output, /^L-08: UNVERIFIED/m)).toBe(true);
    expect(has(steps["3-status-unverified"].output, /^L-08: UNVERIFIED/m)).toBe(true);
    expect(has(steps["4-reobserved-old-signature"].output, /^L-08: READY/m)).toBe(true);
    expect(has(steps["4-reobserved-old-signature"].output, /^서명 점검: (?!통과)/m)).toBe(true);
    expect(has(steps["5-resigned"].output, /^서명 점검: 통과/m)).toBe(true);
    expect(has(steps["5-resigned"].output, /^판정: 내부 시험 공개 가능$/m)).toBe(true);
    expect(has(steps["6-sibling-evidence-changed"].output, /^R-04: UNVERIFIED/m)).toBe(true);
    expect(
      has(
        steps["6-sibling-evidence-changed"].output,
        /현재 형제 증거 대상 값: sibling-evidence:v1:/
      )
    ).toBe(true);
    expect(has(steps["7-sibling-resigned"].output, /^R-04: READY/m)).toBe(true);
    // 필요한 공개 기록은 남았다: 공개 기록만으로도 비공개 기록과 같은 출력이 나온다.
    expect(steps["8-public-record"].output === steps["7-sibling-resigned"].output).toBe(true);

    // 런북 사본 갱신: 전후가 달라졌고, 바뀐 것은 스냅샷 두 행뿐이며, 목적지 칸은 있음·없음만 적었다.
    const before = snapshotRows(run.originalRunbook);
    const after = snapshotRows(run.refreshedRunbook);
    expect(run.refreshedRunbook !== run.originalRunbook).toBe(true);
    expect(after.length).toBe(9);
    expect(after.map((cells) => cells[0])).toEqual(before.map((cells) => cells[0]));
    const original = run.originalRunbook.split("\n");
    const refreshed = run.refreshedRunbook.split("\n");
    expect(refreshed.length).toBe(original.length);
    expect(refreshed.filter((line, index) => line !== original[index]).length).toBe(2);
    expect(
      after
        .filter((cells, index) => cells.join("|") !== before[index].join("|"))
        .map((cells) => cells[0])
    ).toEqual(["01-footer-privacy", "02-footer-contact"]);
    for (const id of ["01-footer-privacy", "02-footer-contact"]) {
      const row = after.find((cells) => cells[0] === id) ?? [];
      expect(
        row.slice(3).join("|") === "목적지 있음|있음|예|예",
        `${id} 행이 재측정 결과로 바뀌었다`
      ).toBe(true);
    }
    const reparsed = parseItemTable(run.refreshedRunbook);
    expect(reparsed.ok && JSON.stringify(reparsed.rows) === JSON.stringify(ITEM_ROWS)).toBe(true);

    // 저장소의 실제 런북은 바뀌지 않았고, 갱신한 사본은 저장소 밖에 있다.
    expect(sha256(readFileSync(RUNBOOK_PATH)) === realRunbookDigest).toBe(true);
    expect(isAcceptableMarkerLocation(projectRoot, run.runbookCopy)).toBe(true);

    // 표지값이 실제로 갱신 과정에 들어갔다: 비공개 입력에 여섯 종류가 모두 있고, 갱신 뒤 비공개 기록에도 그대로 있다.
    expect(
      findMarkersInDirectory(run.privateDir, strings).map((entry) => entry.split(":").pop())
    ).toEqual(expect.arrayContaining(strings.map((marker) => marker.label)));
    const carried = strings.filter((marker) => run.recordBefore.includes(marker.value));
    expect(carried.length).toBeGreaterThan(0);
    expect(carried.every((marker) => run.recordAfter.includes(marker.value))).toBe(true);
    expect(run.recordAfter !== run.recordBefore).toBe(true);
    const publicParsed = parseGateRecord(run.publicRecord);
    const privateParsed = parseGateRecord(run.recordAfter);
    expect(publicParsed.ok && privateParsed.ok).toBe(true);
    if (publicParsed.ok && privateParsed.ok) {
      const keep = (items: typeof publicParsed.items): string[] =>
        items.map((item) => [item.id, item.status, item.target].join("|"));
      expect(keep(publicParsed.items)).toEqual(keep(privateParsed.items));
    }

    // 로그 발췌: 발췌의 모든 줄은 실제 출력의 줄이고, 출력보다 짧다.
    for (const step of Object.values(steps)) {
      const source = step.output.split("\n");
      const excerpt = run.excerpts[step.name];
      expect(excerpt.length > 0, `${step.name}: 발췌가 비어 있지 않다`).toBe(true);
      expect(
        excerpt.every((line) => source.includes(line)),
        `${step.name}: 발췌는 실제 출력의 줄이다`
      ).toBe(true);
      expect(excerpt.length < source.length, `${step.name}: 발췌는 출력보다 짧다`).toBe(true);
    }
    const kinds = (pattern: RegExp): number =>
      run.publicFiles.filter((file) => pattern.test(file.split(path.sep).join("/"))).length;
    expect(kinds(/^launch-gate-runbook\.copy\.md$/)).toBe(1);
    expect(kinds(/^verify-output\//)).toBe(9);
    expect(kinds(/^excerpt\//)).toBe(8);
    expect(kinds(/^gate-record\.public\.md$/)).toBe(1);

    // 누출 검색: 갱신한 런북 사본·공개 기록·검증 출력·로그 발췌(공개 폴더 전체)와 저장소 전체.
    expect(findMarkersInDirectory(run.publicDir, strings)).toEqual([]);
    expect(gitGrepFiles(projectRoot, values)).toEqual([]);

    // 대조: 표지값을 일부러 넣은 산출물은 같은 검색이 탐지한다(산출물 종류마다 하나씩, 여섯 종류 모두).
    const controlDir = makeTempDir("launch-marker-control-");
    const control = (relative: string, name: string, change: (text: string) => string): void =>
      writeFileSync(
        path.join(controlDir, name),
        change(readFileSync(path.join(run.publicDir, relative), "utf-8")),
        "utf-8"
      );
    control("launch-gate-runbook.copy.md", "runbook-copy.control.md", (text) =>
      rewriteRow(text, "01-footer-privacy", (cells) =>
        withCells(cells, { 4: `${set.ownerContact} ${set.legal}` })
      )
    );
    control(
      path.join("excerpt", "5-resigned.log"),
      "excerpt.control.log",
      (text) => `${text}${set.secret} ${set.diagnosis}\n`
    );
    control(
      path.join("verify-output", "5-resigned.log"),
      "verify-output.control.log",
      (text) => `${text}${set.phone} ${set.phoneHyphen} ${set.name}\n`
    );
    control("gate-record.public.md", "public-record.control.md", (text) =>
      text.replace(PUBLIC_REF, set.ownerName)
    );
    expect(findMarkersInDirectory(controlDir, strings).sort()).toEqual(
      [
        "runbook-copy.control.md:ownerContact",
        "runbook-copy.control.md:legal",
        "excerpt.control.log:secret",
        "excerpt.control.log:diagnosis",
        "verify-output.control.log:phone",
        "verify-output.control.log:phoneHyphen",
        "verify-output.control.log:name",
        "public-record.control.md:ownerName",
      ].sort()
    );
  }, 120_000);

  it("(4) 두 실행의 표지값은 모두 다르고, 공개 산출물은 표지값에 의존하지 않아 두 실행에서 같다", () => {
    const first = generateMarkerSet(presentInRepo);
    const firstRun = runUpdateProcedures(first);
    const second = generateMarkerSet(presentInRepo);
    const secondRun = runUpdateProcedures(second);

    const a = markerStrings(first);
    const b = markerStrings(second);
    expect(
      a.filter((marker, i) => marker.value === b[i].value).map((marker) => marker.label)
    ).toEqual([]);

    expect(secondRun.publicFiles).toEqual(firstRun.publicFiles);
    const differing = firstRun.publicFiles.filter(
      (relative) =>
        readFileSync(path.join(firstRun.publicDir, relative), "utf-8") !==
        readFileSync(path.join(secondRun.publicDir, relative), "utf-8")
    );
    expect(differing).toEqual([]);
  }, 180_000);

  it("갱신 도중 실패해도(런북 사본을 만든 직후, 누출 검색 직전) 만든 임시 폴더는 정리된다", () => {
    const set = generateMarkerSet(presentInRepo);

    for (const failAt of ["after-copy", "before-scan"] as const) {
      const created: string[] = [];

      expect(() => runUpdateProcedures(set, { failAt, created })).toThrow(INJECTED_FAILURE);
      expect(created.length).toBeGreaterThan(0);
      expect(created.every((dir) => existsSync(dir))).toBe(true);

      // afterEach와 같은 순서로 정리를 직접 실행해 본다.
      const pending = cleanups.splice(0, cleanups.length);
      while (pending.length > 0) (pending.pop() as () => void)();

      expect(created.filter((dir) => existsSync(dir))).toEqual([]);
    }
  }, 120_000);
});
