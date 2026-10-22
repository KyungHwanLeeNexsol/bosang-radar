import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RulesManifestParseError,
  checkRulesPin,
  compareRulesTree,
  computeRulesFacts,
  deriveFinalId,
  expectedFinalIdsSha256,
  expectedRulesSha256,
  parseExpectedRules,
  parseRulesFiles,
  rulesListSha256,
  rulesTreeConfigFromPin,
} from "./rules-manifest";
import { gitBlobSha1 } from "./sha";
import { representativeStatus } from "./status";
import { MemoryFs } from "./testing/memory-fs";
import type { ExpectedRule, Pin, RuleFileEntry } from "./types";

function dataText(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./data/${name}`, import.meta.url)), "utf8");
}
const pin = JSON.parse(dataText("pin.json")) as Pin;

const enc = new TextEncoder();
const CONFIG = { cacheDirName: "semgrep-rules", configDirs: ["semgrep-rules/javascript"] };

/** 합성 자리표시 파일. 실제 Semgrep 규칙 문서가 아니다. */
function placeholder(tag: string): string {
  return `# placeholder ${tag}\n`;
}

function entryOf(path: string, content: string): RuleFileEntry {
  return { path, blobSha: gitBlobSha1(enc.encode(content)) };
}

// 합성 캐시: 파일 두 개를 담은 규칙 트리와 그에 맞는 고정 목록.
const A = "javascript/a/one.yaml";
const B = "javascript/b/two.yml";
const contents: Record<string, string> = { [A]: placeholder("A"), [B]: placeholder("B") };
const expectedFiles: RuleFileEntry[] = [entryOf(A, contents[A]), entryOf(B, contents[B])];

function cacheFs(extra: Record<string, string> = {}, drop: string[] = []): MemoryFs {
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries({ ...contents, ...extra })) {
    if (!drop.includes(path)) files[`/cache/semgrep-rules/${path}`] = content;
  }
  return new MemoryFs(files);
}

describe("실제 고정 데이터와 핀", () => {
  const files = parseRulesFiles(dataText("rules-files.tsv"));
  const rules = parseExpectedRules(dataText("rules-expected.tsv"));

  it("목록 해시가 핀의 값을 그대로 재현한다(원문 줄 = 경로\\t블롭SHA)", () => {
    expect(files).toHaveLength(pin.rules.yaml_files);
    expect(rulesListSha256(files)).toBe(pin.rules.yaml_list_sha256);
  });

  it("기대 규칙 해시가 핀의 값을 재현한다(원문 줄 = 6열, 파일 순서 그대로)", () => {
    expect(rules).toHaveLength(pin.rules.expected_rules);
    expect(expectedRulesSha256(rules)).toBe(pin.rules.expected_rules_sha256);
  });

  it("정렬한 최종 ID 목록 해시가 핀의 값을 재현한다", () => {
    expect(expectedFinalIdsSha256(rules)).toBe(pin.rules.expected_final_ids_sorted_sha256);
  });

  it("사실: 고유 원문 ID 205, 겹치는 묶음 7종, 파일마다 규칙 1개 이상", () => {
    const facts = computeRulesFacts(files, rules);
    expect(facts.yamlFiles).toBe(205);
    expect(facts.totalRules).toBe(214);
    expect(facts.distinctOriginalIds).toBe(pin.rules.distinct_original_ids);
    expect(facts.duplicateOriginalIdGroups).toHaveLength(pin.rules.duplicate_original_id_groups);
    expect(facts.distinctFinalIds).toBe(214);
    expect(Object.keys(facts.rulesPerFile)).toHaveLength(205);
    expect(Math.min(...Object.values(facts.rulesPerFile))).toBeGreaterThanOrEqual(1);
    // 겹치는 묶음의 규칙 수 합 - 묶음 수 = 접두어가 없을 때 사라질 규칙 수(214 - 205).
    const inGroups = facts.duplicateOriginalIdGroups.reduce((n, g) => n + g.finalIds.length, 0);
    expect(inGroups - facts.duplicateOriginalIdGroups.length).toBe(214 - 205);
  });

  it("핀과 모순이 없다(사유 없음)", () => {
    expect(checkRulesPin(files, rules, pin.rules)).toEqual([]);
  });

  it("규칙 파일은 모두 목록에 있고 최종 ID는 전체 경로 기반이다", () => {
    const paths = new Set(files.map((f) => f.path));
    for (const rule of rules) {
      expect(paths.has(rule.file)).toBe(true);
      expect(rule.finalId).toBe(deriveFinalId(rule.file, rule.originalId, "semgrep-rules"));
    }
  });
});

describe("deriveFinalId", () => {
  it("접두어 + 디렉터리 조각 + 원문 ID", () => {
    expect(deriveFinalId("javascript/lang/security/x.yaml", "my-id", "semgrep-rules")).toBe(
      "semgrep-rules.javascript.lang.security.my-id"
    );
  });

  it("같은 원문 ID라도 디렉터리가 다르면 최종 ID가 다르다", () => {
    const a = deriveFinalId("javascript/a/x.yaml", "same", "semgrep-rules");
    const b = deriveFinalId("typescript/a/x.yaml", "same", "semgrep-rules");
    expect(a).not.toBe(b);
  });

  it("디렉터리가 없는 경로는 거부한다", () => {
    expect(() => deriveFinalId("x.yaml", "id", "semgrep-rules")).toThrow(RulesManifestParseError);
  });
});

describe("parseRulesFiles: 엄격한 파싱", () => {
  const SHA = "0f8f702a8b3f126730911681b6105e90f69cc34c";
  const ok = `javascript/a.yaml\t${SHA}\n`;

  it("정상 줄을 읽는다", () => {
    expect(parseRulesFiles(ok)).toEqual([{ path: "javascript/a.yaml", blobSha: SHA }]);
  });

  it.each([
    ["빈 입력", ""],
    ["끝 줄바꿈 없음", ok.trimEnd()],
    ["CRLF", ok.replace("\n", "\r\n")],
    ["빈 줄", `${ok}\n`],
    ["열 부족", "javascript/a.yaml\n"],
    ["열 초과", `javascript/a.yaml\t${SHA}\textra\n`],
    ["blob SHA 형식 오류", "javascript/a.yaml\tnothex\n"],
    ["대문자 SHA", `javascript/a.yaml\t${SHA.toUpperCase()}\n`],
    ["절대 경로", `/javascript/a.yaml\t${SHA}\n`],
    ["역슬래시", `javascript\\a.yaml\t${SHA}\n`],
    ["상위 경로 조각", `javascript/../a.yaml\t${SHA}\n`],
    ["yaml 확장자 아님", `javascript/a.json\t${SHA}\n`],
    ["중복 경로", `${ok}${ok}`],
    ["정렬 위반", `javascript/b.yaml\t${SHA}\njavascript/a.yaml\t${SHA}\n`],
    ["주석 줄", `# 주석\n${ok}`],
  ])("거부: %s", (_name, text) => {
    expect(() => parseRulesFiles(text)).toThrow(RulesManifestParseError);
  });

  it("오류 메시지에 줄 번호가 있다", () => {
    expect(() => parseRulesFiles(`${ok}javascript/b.yaml\tbad\n`)).toThrow(/2/);
  });
});

describe("parseExpectedRules: 엄격한 파싱", () => {
  const row = (cols: string[]) => `${cols.join("\t")}\n`;
  const base = [
    "javascript/a/x.yaml",
    "my-id",
    "semgrep-rules.javascript.a.my-id",
    "javascript+typescript",
    "search",
    "WARNING",
  ];

  it("정상 줄: 언어를 +로 가른다", () => {
    expect(parseExpectedRules(row(base))).toEqual<ExpectedRule[]>([
      {
        file: "javascript/a/x.yaml",
        originalId: "my-id",
        finalId: "semgrep-rules.javascript.a.my-id",
        languages: ["javascript", "typescript"],
        mode: "search",
        severity: "WARNING",
      },
    ]);
  });

  it("같은 파일의 규칙 여러 개는 파일 안 순서를 지킨다", () => {
    const text =
      row(base) +
      row([...base.slice(0, 1), "second", "semgrep-rules.javascript.a.second", ...base.slice(3)]);
    expect(parseExpectedRules(text).map((r) => r.originalId)).toEqual(["my-id", "second"]);
  });

  it.each([
    ["빈 입력", ""],
    ["열 부족", row(base.slice(0, 5))],
    ["열 초과", row([...base, "x"])],
    ["빈 열", row([base[0], "", ...base.slice(2)])],
    ["빈 언어 조각", row([...base.slice(0, 3), "javascript+", ...base.slice(4)])],
    ["CRLF", row(base).replace("\n", "\r\n")],
    ["파일 순서 위반", row(["javascript/b.yaml", ...base.slice(1)]) + row(base)],
  ])("거부: %s", (_name, text) => {
    expect(() => parseExpectedRules(text)).toThrow(RulesManifestParseError);
  });
});

describe("checkRulesPin: 핀과의 교차 검증", () => {
  const files = parseRulesFiles(dataText("rules-files.tsv"));
  const rules = parseExpectedRules(dataText("rules-expected.tsv"));

  function codes(f: RuleFileEntry[], r: ExpectedRule[], p = pin.rules): string[] {
    return checkRulesPin(f, r, p).map((x) => x.code);
  }

  it("파일 개수가 핀과 다르면 RULES_PIN_INCONSISTENT", () => {
    expect(codes(files.slice(1), rules)).toContain("RULES_PIN_INCONSISTENT");
  });

  it("핀의 해시가 달라지면 RULES_PIN_INCONSISTENT", () => {
    const tampered = { ...pin.rules, yaml_list_sha256: "0".repeat(64) };
    const reasons = checkRulesPin(files, rules, tampered);
    expect(reasons.every((r) => r.code === "RULES_PIN_INCONSISTENT")).toBe(true);
    expect(reasons.some((r) => r.detail?.includes("yaml_list_sha256"))).toBe(true);
  });

  it("규칙 하나의 최종 ID가 바뀌면(접두어 누락 등) 모순으로 잡힌다", () => {
    const bad = rules.map((r, i) => (i === 0 ? { ...r, finalId: r.originalId } : r));
    const reasons = checkRulesPin(files, bad, pin.rules);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.some((r) => r.detail?.includes(rules[0].originalId))).toBe(true);
  });

  it("목록에 없는 파일을 가리키는 규칙은 모순이다", () => {
    const bad = rules.map((r, i) => (i === 0 ? { ...r, file: "javascript/zz/none.yaml" } : r));
    expect(codes(files, bad)).toContain("RULES_PIN_INCONSISTENT");
  });

  it("규칙이 하나도 없는 파일은 모순이다", () => {
    const extra = [...files, { path: "typescript/zzz/empty.yaml", blobSha: "1".repeat(40) }];
    expect(codes(extra, rules)).toContain("RULES_PIN_INCONSISTENT");
  });

  it("최종 ID가 겹치면 모순이다(조용한 중복 제거의 원인)", () => {
    const dup = rules.map((r, i) => (i === 1 ? { ...r, finalId: rules[0].finalId } : r));
    expect(codes(files, dup)).toContain("RULES_PIN_INCONSISTENT");
  });

  it("모든 사유가 MANIFEST_MISMATCH로 대표된다", () => {
    expect(representativeStatus(checkRulesPin(files.slice(1), rules, pin.rules))).toBe(
      "MANIFEST_MISMATCH"
    );
  });
});

describe("compareRulesTree", () => {
  const config = CONFIG;

  it("목록과 같으면 사유가 없다", async () => {
    expect(
      await compareRulesTree(cacheFs(), "/cache/semgrep-rules", expectedFiles, config)
    ).toEqual([]);
  });

  it("파일 추가: RULES_FILE_ADDED, 대표 상태는 MANIFEST_MISMATCH", async () => {
    const fs = cacheFs({ "javascript/c/new.yaml": placeholder("C") });
    const reasons = await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config);
    expect(reasons.map((r) => r.code)).toContain("RULES_FILE_ADDED");
    expect(reasons.find((r) => r.code === "RULES_FILE_ADDED")?.detail).toContain(
      "javascript/c/new.yaml"
    );
    expect(representativeStatus(reasons)).toBe("MANIFEST_MISMATCH");
  });

  it("R3: 깨진 YAML 파일 추가는 규칙 개수가 같아도 MANIFEST_MISMATCH다", async () => {
    // 내용이 파싱되지 않는 자리표시. 목록에 없는 파일이라는 사실만으로 불일치여야 한다.
    const fs = cacheFs({ "javascript/lang/security/zz-broken.yaml": ": : [ broken\n" });
    const reasons = await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config);
    expect(reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(["RULES_FILE_ADDED", "RULES_LIST_HASH_MISMATCH"])
    );
    expect(representativeStatus(reasons)).toBe("MANIFEST_MISMATCH");
  });

  it("점 파일(.hidden.yaml)도 규칙 파일로 센다", async () => {
    const fs = cacheFs({ "javascript/.hidden.yaml": placeholder("H") });
    const reasons = await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config);
    expect(reasons.map((r) => r.code)).toContain("RULES_FILE_ADDED");
  });

  it("점 디렉터리 아래의 .yml도 센다", async () => {
    const fs = cacheFs({ "javascript/.dir/y.yml": placeholder("Y") });
    const reasons = await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config);
    expect(reasons.map((r) => r.code)).toContain("RULES_FILE_ADDED");
  });

  it("규칙 파일이 아닌 파일은 무시한다(.test.yaml, .md, .json, .yaml.bak)", async () => {
    const fs = cacheFs({
      "javascript/a/one.test.yaml": placeholder("t"),
      "javascript/a/one.test.yml": placeholder("t"),
      "javascript/a/readme.md": "x",
      "javascript/a/data.json": "{}",
      "javascript/a/one.yaml.bak": "x",
    });
    expect(await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config)).toEqual([]);
  });

  it("구성 디렉터리 밖의 파일은 무시한다", async () => {
    const fs = cacheFs({ "python/x.yaml": placeholder("p"), ".git/y.yaml": placeholder("g") });
    expect(await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config)).toEqual([]);
  });

  it("디렉터리 이름 경계: 'javascript-extra/'는 'javascript/' 아래가 아니다", async () => {
    const fs = cacheFs({ "javascript-extra/x.yaml": placeholder("e") });
    expect(await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config)).toEqual([]);
  });

  it("파일 삭제: RULES_FILE_REMOVED", async () => {
    const fs = cacheFs({}, [B]);
    const reasons = await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config);
    expect(reasons.map((r) => r.code)).toContain("RULES_FILE_REMOVED");
    expect(reasons.map((r) => r.code)).toContain("RULES_LIST_HASH_MISMATCH");
  });

  it("내용 변경(바이트 하나): RULES_FILE_CHANGED", async () => {
    const fs = cacheFs({ [A]: placeholder("A!") });
    const reasons = await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config);
    expect(reasons.find((r) => r.code === "RULES_FILE_CHANGED")?.detail).toContain(A);
  });

  it("줄바꿈만 CRLF로 바뀐 사본도 변경으로 잡는다", async () => {
    const fs = cacheFs({ [A]: contents[A].replace("\n", "\r\n") });
    const reasons = await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config);
    expect(reasons.map((r) => r.code)).toContain("RULES_FILE_CHANGED");
  });

  it("캐시 디렉터리가 비어 있으면 전부 삭제로 잡는다", async () => {
    const reasons = await compareRulesTree(
      new MemoryFs(),
      "/cache/semgrep-rules",
      expectedFiles,
      config
    );
    expect(reasons.filter((r) => r.code === "RULES_FILE_REMOVED")).toHaveLength(2);
  });

  it("목록 해시 기대값을 핀에서 받으면 그 값과 비교한다", async () => {
    const reasons = await compareRulesTree(cacheFs(), "/cache/semgrep-rules", expectedFiles, {
      ...config,
      expectedListSha256: "0".repeat(64),
    });
    expect(reasons.map((r) => r.code)).toEqual(["RULES_LIST_HASH_MISMATCH"]);
  });

  it("목록 해시는 정렬한 '경로\\t블롭SHA' 줄로 계산한다(읽기 순서와 무관)", async () => {
    const reversed = [...expectedFiles].reverse();
    expect(await compareRulesTree(cacheFs(), "/cache/semgrep-rules", reversed, config)).toEqual([]);
  });

  it("구성 디렉터리가 캐시 이름 접두어를 갖지 않으면 RULES_PIN_INCONSISTENT", async () => {
    const reasons = await compareRulesTree(cacheFs(), "/cache/semgrep-rules", expectedFiles, {
      cacheDirName: "semgrep-rules",
      configDirs: ["other/javascript"],
    });
    expect(reasons.map((r) => r.code)).toContain("RULES_PIN_INCONSISTENT");
  });

  it("파일 목록 조회가 실패하면 사유로 남긴다(삼키지 않는다)", async () => {
    const fs = cacheFs();
    fs.listFilesRecursive = async () => {
      throw new Error("EACCES");
    };
    const reasons = await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config);
    expect(reasons.map((r) => r.code)).toContain("RULES_LIST_HASH_MISMATCH");
  });

  it("파일을 읽을 수 없으면 변경으로 본다", async () => {
    const fs = cacheFs();
    const read = fs.readFile.bind(fs);
    fs.readFile = async (p: string) => {
      if (p.endsWith("two.yml")) throw new Error("EACCES");
      return read(p);
    };
    const reasons = await compareRulesTree(fs, "/cache/semgrep-rules", expectedFiles, config);
    expect(reasons.map((r) => r.code)).toContain("RULES_FILE_CHANGED");
  });

  it("rulesTreeConfigFromPin: 핀 값을 그대로 옮긴다", () => {
    expect(rulesTreeConfigFromPin(pin.rules)).toEqual({
      cacheDirName: "semgrep-rules",
      configDirs: ["semgrep-rules/javascript", "semgrep-rules/typescript"],
      expectedListSha256: pin.rules.yaml_list_sha256,
    });
  });
});
