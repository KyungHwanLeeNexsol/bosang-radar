import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { RecordItem } from "./gate-record";
import { coveringFilesOf, parseItemTable, type ItemRow } from "./item-table";
import { coveringFileListErrors, resolveEffectiveStatus } from "./target-check";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC_PATH = join(REPO_ROOT, ".moai", "specs", "SPEC-B2C-LAUNCH-001", "spec.md");
const RUNBOOK_PATH = join(REPO_ROOT, ".moai", "docs", "launch-gate-runbook.md");

// 파일 경로·값은 모두 합성한 예시다. 기록 파일 경로는 함수의 입력이며 상수가 아니다.
const RECORD_FILE = "records/example-go-no-go.md";
const EVIDENCE_FILE = "records/example-evidence.md";
const RUNBOOK_FILE = ".moai/docs/launch-gate-runbook.md";

function item(overrides: Partial<RecordItem> = {}): RecordItem {
  return {
    id: "L-90",
    proves: "증명",
    location: "위치-예시",
    role: "역할-예시",
    date: "날짜-예시",
    target: "대상-값-가",
    events: ["EV-L1", "EV-L2"],
    status: "READY",
    ...overrides,
  };
}

function readText(path: string): string {
  return readFileSync(path, "utf-8").replace(/\r\n/g, "\n");
}

function itemRows(path: string): ItemRow[] {
  const result = parseItemTable(readText(path));
  if (!result.ok) throw new Error(result.errors.join(" | "));
  return result.rows;
}

describe("resolveEffectiveStatus — AC-B2CLAUNCH-005 (가)(나)(다)", () => {
  it("(가) READY이고 기록된 대상 값이 현재 값과 같으며 사건 기록이 없으면 READY가 유지된다", () => {
    expect(resolveEffectiveStatus(item(), "대상-값-가", [])).toEqual({ status: "READY" });
  });

  it("(나) READY이나 기록된 대상 값이 현재 값과 다르면 UNVERIFIED이고 이유를 적는다", () => {
    const result = resolveEffectiveStatus(item(), "대상-값-나", []);

    expect(result.status).toBe("UNVERIFIED");
    expect(result.reason).toContain("대상 값");
  });

  it("(다) READY이나 관측 뒤의 EV-L2 사건 기록이 있으면 UNVERIFIED이고 사건을 적는다", () => {
    const result = resolveEffectiveStatus(item(), "대상-값-가", ["EV-L2"]);

    expect(result.status).toBe("UNVERIFIED");
    expect(result.reason).toContain("EV-L2");
  });

  it("항목이 적지 않은 사건은 무효화 사건이 아니다(그 항목에 적힌 사건만 센다)", () => {
    expect(resolveEffectiveStatus(item(), "대상-값-가", ["EV-L4"])).toEqual({ status: "READY" });
  });

  // PR #24 재현 결함 3: 기록의 무효화 사건 칸에서 정의표가 정한 사건을 빼도 그 사건이 일어나면 강등되어야 한다.
  it("정의표가 정한 사건이 기록의 사건 칸에 없어도 관측 뒤에 일어나면 UNVERIFIED이고 정의표가 정한 사건임을 적는다", () => {
    const record = item({ events: ["EV-L3"] });

    const result = resolveEffectiveStatus(record, "대상-값-가", ["EV-L5"], ["EV-L3", "EV-L5"]);

    expect(result.status).toBe("UNVERIFIED");
    expect(result.reason).toContain("EV-L5");
    expect(result.reason).toContain("항목 정의표가 정한 사건");
  });

  it("기록의 사건 칸에만 있는 사건도 그대로 감시한다(합집합이며 기록이 더 적을 수만 있는 것이 아니다)", () => {
    const record = item({ events: ["EV-L1", "EV-L2"] });

    const result = resolveEffectiveStatus(record, "대상-값-가", ["EV-L2"], ["EV-L1"]);

    expect(result.status).toBe("UNVERIFIED");
    expect(result.reason).not.toContain("항목 정의표가 정한 사건");
  });

  it("정의표에도 기록에도 없는 사건은 무효화 사건이 아니다(과차단하지 않는다)", () => {
    const record = item({ events: ["EV-L3"] });

    expect(resolveEffectiveStatus(record, "대상-값-가", ["EV-L2"], ["EV-L3", "EV-L5"])).toEqual({
      status: "READY",
    });
  });

  it("같은 사건이 여러 번 넘어와도 이유에 한 번만 적고, 정의표 사건 인자를 생략하면 기록 칸만 본다", () => {
    const record = item({ events: ["EV-L1"] });

    const result = resolveEffectiveStatus(record, "대상-값-가", ["EV-L1", "EV-L1"], ["EV-L1"]);

    expect(result.reason).toBe("관측 뒤에 무효화 사건 EV-L1이(가) 일어났다");
    expect(resolveEffectiveStatus(record, "대상-값-가", ["EV-L5"])).toEqual({ status: "READY" });
  });

  it("READY가 아닌 기록은 정의표 사건이 일어나도 그대로다(상태를 올리지도 바꾸지도 않는다)", () => {
    expect(
      resolveEffectiveStatus(item({ status: "BLOCKED" }), "대상-값-가", ["EV-L5"], ["EV-L5"])
    ).toEqual({ status: "BLOCKED" });
  });

  it("현재 대상 값이 넘어오지 않은 READY 항목은 같다고 확인할 수 없으므로 UNVERIFIED다", () => {
    const result = resolveEffectiveStatus(item(), undefined, []);

    expect(result.status).toBe("UNVERIFIED");
    expect(result.reason).toContain("현재 대상 값");
  });

  it("READY가 아닌 기록 상태는 대상 값·사건과 상관없이 그대로다(점검기는 상태를 올리지 않는다)", () => {
    expect(resolveEffectiveStatus(item({ status: "BLOCKED" }), "대상-값-가", [])).toEqual({
      status: "BLOCKED",
    });
    expect(resolveEffectiveStatus(item({ status: "UNVERIFIED" }), "대상-값-가", [])).toEqual({
      status: "UNVERIFIED",
    });
  });
});

describe("(라) 기록 파일만 바뀐 변경 — 대상 값은 덮는 파일 집합에서만 계산된다", () => {
  // 계산 수단은 run-phase가 정하는 것이고 이 SPEC은 정하지 않는다(spec.md §2.4 "대상").
  // 여기서는 '덮는 파일 집합의 내용만 읽는 계산'이 무엇을 뜻하는지 보이는 시험용 계산이다.
  function targetOf(files: readonly string[], contents: Readonly<Record<string, string>>): string {
    const hash = createHash("sha256");
    for (const file of files) hash.update(`${file}\n${contents[file] ?? ""}\n`);
    return hash.digest("hex");
  }

  const covering = ["lib/example-a.ts", "lib/example-b.ts"];
  const before = { "lib/example-a.ts": "가", "lib/example-b.ts": "나", [RECORD_FILE]: "기록 1" };

  it("기록 파일 내용만 바뀌면 대상 값이 같아 READY가 유지된다", () => {
    const recorded = targetOf(covering, before);
    const after = { ...before, [RECORD_FILE]: "기록 2 — 서명 추가" };

    const current = targetOf(covering, after);

    expect(current).toBe(recorded);
    expect(resolveEffectiveStatus(item({ target: recorded }), current, [])).toEqual({
      status: "READY",
    });
  });

  it("덮는 파일 하나가 바뀌면 대상 값이 달라져 UNVERIFIED가 된다(비교 대상)", () => {
    const recorded = targetOf(covering, before);
    const after = { ...before, "lib/example-b.ts": "나 수정" };

    const current = targetOf(covering, after);

    expect(resolveEffectiveStatus(item({ target: recorded }), current, []).status).toBe(
      "UNVERIFIED"
    );
  });
});

describe("coveringFileListErrors — AC-B2CLAUNCH-005 (마)", () => {
  const forbidden = [RECORD_FILE, EVIDENCE_FILE];

  it("(마) 덮는 파일 목록에 go/no-go 기록 파일이 있으면 항목 식별자와 함께 거부한다", () => {
    const errors = coveringFileListErrors(
      [
        { id: "L-04", files: ["lib/example-a.ts"] },
        { id: "L-90", files: ["lib/example-a.ts", RECORD_FILE] },
      ],
      forbidden
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-90"');
    expect(errors[0]).toContain(RECORD_FILE);
  });

  it("증거 기록 파일이 들어 있어도 거부한다", () => {
    const errors = coveringFileListErrors([{ id: "L-91", files: [EVIDENCE_FILE] }], forbidden);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-91"');
  });

  it("경로 표기가 달라도(./ 접두, 역슬래시) 같은 파일이면 거부한다", () => {
    const errors = coveringFileListErrors(
      [
        { id: "L-92", files: [`./${RECORD_FILE}`] },
        { id: "L-93", files: [RECORD_FILE.replace(/\//g, "\\")] },
      ],
      forbidden
    );

    expect(errors.map((error) => /"(L-\d+)"/.exec(error)?.[1])).toEqual(["L-92", "L-93"]);
  });

  it("기록 파일을 품은 디렉터리를 덮는다고 적어도 거부한다", () => {
    const errors = coveringFileListErrors([{ id: "L-94", files: ["records/"] }], forbidden);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-94"');
  });

  it("이름만 닮은 다른 파일이나 다른 디렉터리는 거부하지 않는다", () => {
    expect(
      coveringFileListErrors(
        [
          {
            id: "L-95",
            files: ["records-other/example-go-no-go.md", "records/example-go-no-go.ts"],
          },
        ],
        forbidden
      )
    ).toEqual([]);
  });

  it("기록 파일이 어느 목록에도 없으면 오류가 없다", () => {
    expect(
      coveringFileListErrors([{ id: "L-04", files: ["lib/example-a.ts"] }], forbidden)
    ).toEqual([]);
  });
});

describe("실제 항목 표에 같은 검사를 적용한다(AC-B2CLAUNCH-005 — AC-001의 런북 표 포함)", () => {
  for (const [name, path] of [
    ["spec.md §2.4", SPEC_PATH],
    ["런북", RUNBOOK_PATH],
  ] as const) {
    it(`${name} 항목 표의 모든 덮는 파일 목록에 런북과 기록 파일이 없다`, () => {
      const lists = itemRows(path).map((row) => ({ id: row.id, files: coveringFilesOf(row) }));

      expect(lists.some((list) => list.files.length > 0)).toBe(true);
      expect(coveringFileListErrors(lists, [RUNBOOK_FILE, RECORD_FILE, EVIDENCE_FILE])).toEqual([]);
    });
  }

  it("표의 L-04 목록에 기록 파일이 들어 있다고 가정하면 L-04가 거부된다", () => {
    const lists = itemRows(RUNBOOK_PATH).map((row) => ({
      id: row.id,
      files: row.id === "L-04" ? [...coveringFilesOf(row), RECORD_FILE] : coveringFilesOf(row),
    }));

    const errors = coveringFileListErrors(lists, [RUNBOOK_FILE, RECORD_FILE]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"L-04"');
  });
});
