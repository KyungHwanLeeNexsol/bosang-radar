import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildControlTree, runPrecheck, type PrecheckInput } from "./precheck";
import {
  deriveFinalId,
  expectedFinalIdsSha256,
  expectedRulesSha256,
  rulesListSha256,
  rulesTreeConfigFromPin,
} from "./rules-manifest";
import { buildScanTree, computeScope } from "./scope";
import { gitBlobSha1, sha256Hex } from "./sha";
import { REASON_STATUS, representativeStatus, type Reason, type ReasonCode } from "./status";
import { MemoryFs } from "./testing/memory-fs";
import { MemoryGit } from "./testing/memory-git";
import type { ControlExpectations, ExpectedRule, Pin, RuleFileEntry, ScopeConfig } from "./types";

function dataText(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./data/${name}`, import.meta.url)), "utf8");
}
const realPin = JSON.parse(dataText("pin.json")) as Pin;
const scopeConfig = JSON.parse(dataText("scope.json")) as ScopeConfig;
const controlExpectations = JSON.parse(
  dataText("control-expectations.json")
) as ControlExpectations;

const enc = new TextEncoder();
const SHA = "a".repeat(40);
const TOOL_VERSION = realPin.semgrep.version;
const WHEEL = "b".repeat(64);
const EVIDENCE = "/evidence/run-1";

// ── 합성 규칙 트리: 자리표시 텍스트뿐이며 실제 규칙 YAML이 아니다 ──────────────
const RULE_FILES = [
  "javascript/lang/a.yaml",
  "javascript/lang/b.yml",
  "typescript/react/c.yaml",
] as const;
const ruleContent: Record<string, string> = {
  "javascript/lang/a.yaml": "# placeholder a\n",
  "javascript/lang/b.yml": "# placeholder b\n",
  "typescript/react/c.yaml": "# placeholder c\n",
};
const rulesFiles: RuleFileEntry[] = RULE_FILES.map((path) => ({
  path,
  blobSha: gitBlobSha1(enc.encode(ruleContent[path])),
}));
const expectedRules: ExpectedRule[] = RULE_FILES.map((file, i) => ({
  file,
  originalId: `rule-${i}`,
  finalId: deriveFinalId(file, `rule-${i}`, "semgrep-rules"),
  languages: ["js"],
  mode: "search",
  severity: "ERROR",
}));

function makePin(overrides: Partial<Pin["semgrep"]["wheel"]> = {}): Pin {
  return {
    ...realPin,
    semgrep: {
      ...realPin.semgrep,
      wheel: { ...realPin.semgrep.wheel, sha256: WHEEL, verified: true, ...overrides },
    },
    rules: {
      ...realPin.rules,
      yaml_files: rulesFiles.length,
      yaml_list_sha256: rulesListSha256(rulesFiles),
      expected_rules: expectedRules.length,
      expected_rules_sha256: expectedRulesSha256(expectedRules),
      expected_final_ids_sorted_sha256: expectedFinalIdsSha256(expectedRules),
      distinct_original_ids: expectedRules.length,
      duplicate_original_id_groups: 0,
    },
  };
}

// ── 합성 대상 저장소와 대조 입력 ────────────────────────────────────────────
const productFiles: Record<string, string> = {
  "src/a.ts": "export const a = 1;\n",
  "src/b.tsx": "export const b = 2;\n",
  "README.md": "# readme\n",
};
const git = new MemoryGit({ [SHA]: productFiles });

function fixtureBytes(fixture: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
}

interface World {
  fs: MemoryFs;
  input: PrecheckInput;
}

/** 모든 것이 맞는 세계. 시험이 한 군데씩 망가뜨린다. */
async function makeWorld(
  opts: {
    ruleDrop?: string[];
    ruleExtra?: Record<string, string>;
    ruleOverride?: Record<string, string>;
    scanTreeOverrides?: Record<string, string | null>;
    controlSourceOverride?: Record<string, string>;
    controlTreeOverrides?: Record<string, string | null>;
  } = {}
): Promise<World> {
  const merged: Record<string, string | Uint8Array> = {};
  for (const path of RULE_FILES) {
    if (opts.ruleDrop?.includes(path)) continue;
    merged[`/cache/semgrep-rules/${path}`] = opts.ruleOverride?.[path] ?? ruleContent[path];
  }
  for (const [path, content] of Object.entries(opts.ruleExtra ?? {})) {
    merged[`/cache/semgrep-rules/${path}`] = content;
  }
  // 정적 입력의 저장소 사본(변조 시험은 merged에만 덮어쓰고, 트리는 원본으로 만든다).
  const pristine: Record<string, Uint8Array> = {};
  for (const c of controlExpectations.cases) {
    pristine[`/repo/${c.fixture}`] = fixtureBytes(c.fixture);
    merged[`/repo/${c.fixture}`] =
      opts.controlSourceOverride?.[c.fixture] ?? pristine[`/repo/${c.fixture}`];
  }

  // 스캔 트리와 대조 트리는 정상 경로(buildScanTree·buildControlTree)로 만든 뒤 시험이 한 군데씩 망가뜨린다.
  const scratch = new MemoryFs(pristine);
  const scope = await computeScope(git, SHA, scopeConfig);
  await buildScanTree(scratch, git, scope, "/scan");
  const built = await buildControlTree(scratch, {
    expectations: controlExpectations,
    fixturesRoot: "/repo",
    treeRoot: "/ctl",
  });
  expect(built).toEqual([]);
  for (const root of ["/scan", "/ctl"]) {
    for (const p of await scratch.listFilesRecursive(root)) {
      merged[`${root}/${p}`] = await scratch.readFile(`${root}/${p}`);
    }
  }
  for (const [p, content] of Object.entries(opts.scanTreeOverrides ?? {})) {
    if (content === null) delete merged[`/scan/${p}`];
    else merged[`/scan/${p}`] = content;
  }
  for (const [p, content] of Object.entries(opts.controlTreeOverrides ?? {})) {
    if (content === null) delete merged[`/ctl/${p}`];
    else merged[`/ctl/${p}`] = content;
  }
  const finalFs = new MemoryFs(merged);

  const pin = makePin();
  return {
    fs: finalFs,
    input: {
      pin,
      rulesFiles,
      expectedRules,
      rulesTreeConfig: rulesTreeConfigFromPin(pin.rules),
      rulesCacheRoot: "/cache/semgrep-rules",
      scopeConfig,
      mode: "target",
      targetSha: SHA,
      scanTreeRoot: "/scan",
      controlExpectations,
      controlTreeRoot: "/ctl",
      controlFixturesRoot: "/repo",
      env: { PATH: "/usr/bin", HOME: "/home/x" },
      toolVersionObserved: TOOL_VERSION,
      wheelSha256Observed: WHEEL,
      lockHeld: true,
      foreignServerProcesses: 0,
      evidenceRoot: EVIDENCE,
    },
  };
}

function codes(reasons: readonly Reason[]): ReasonCode[] {
  return reasons.map((r) => r.code);
}

async function check(world: World, patch: Partial<PrecheckInput> = {}) {
  return runPrecheck({ fs: world.fs, git }, { ...world.input, ...patch });
}

describe("runPrecheck: 모든 것이 맞을 때", () => {
  it("target 모드: 사유가 없다", async () => {
    const world = await makeWorld();
    const result = await check(world);
    expect(result.reasons).toEqual([]);
    expect(representativeStatus(result.reasons)).toBe("COMPLETE");
    expect(result.details.mode).toBe("target");
  });

  it("control 모드: 사유가 없고 대조 트리를 검사한다", async () => {
    const world = await makeWorld();
    const result = await check(world, { mode: "control", targetSha: null });
    expect(result.reasons).toEqual([]);
    expect(JSON.stringify(result.details)).toContain("control_tree_sha256");
  });

  it("details는 결정적이고 JSON으로 직렬화된다", async () => {
    const world = await makeWorld();
    const a = await check(world);
    const b = await check(world);
    expect(JSON.stringify(a.details)).toBe(JSON.stringify(b.details));
    expect(JSON.parse(JSON.stringify(a.details))).toEqual(a.details);
  });
});

describe("runPrecheck: 규칙 트리 (rev2 R1~R5, ADR C0 (b))", () => {
  it("R1: 규칙 파일 제거 → RULES_FILE_REMOVED, MANIFEST_MISMATCH", async () => {
    const world = await makeWorld({ ruleDrop: ["javascript/lang/a.yaml"] });
    const result = await check(world);
    expect(codes(result.reasons)).toContain("RULES_FILE_REMOVED");
    expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
  });

  it("R2: 파일 손상(내용이 바뀜) → RULES_FILE_CHANGED", async () => {
    const world = await makeWorld({ ruleOverride: { "javascript/lang/a.yaml": "{ broken: [\n" } });
    const result = await check(world);
    expect(codes(result.reasons)).toContain("RULES_FILE_CHANGED");
    expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
  });

  it("R3: 깨진 YAML 파일 추가(규칙 수는 그대로) → 같은 개수여도 MANIFEST_MISMATCH", async () => {
    const world = await makeWorld({
      ruleExtra: { "javascript/lang/zz-broken.yaml": "{ broken: [\n" },
    });
    const result = await check(world);
    expect(codes(result.reasons)).toContain("RULES_FILE_ADDED");
    expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
    // 기대 규칙 수는 시험 전후로 같다: 개수가 통과 근거가 아님을 보인다.
    expect(world.input.expectedRules).toHaveLength(3);
    expect(result.details.expected_rules).toBe(3);
  });

  it("R4: 유효한 새 규칙 파일 추가 → RULES_FILE_ADDED", async () => {
    const world = await makeWorld({
      ruleExtra: { "typescript/react/new.yaml": "# placeholder new\n" },
    });
    const result = await check(world);
    expect(codes(result.reasons)).toContain("RULES_FILE_ADDED");
    expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
  });

  it("R5: 규칙 본문 한 줄만 바뀜 → RULES_FILE_CHANGED", async () => {
    const world = await makeWorld({
      ruleOverride: { "typescript/react/c.yaml": "# placeholder C\n" },
    });
    const result = await check(world);
    expect(codes(result.reasons)).toContain("RULES_FILE_CHANGED");
  });

  it("목록 자체가 핀과 모순되면 RULES_PIN_INCONSISTENT", async () => {
    const world = await makeWorld();
    const pin = { ...world.input.pin, rules: { ...world.input.pin.rules, yaml_files: 205 } };
    const result = await check(world, { pin });
    expect(codes(result.reasons)).toContain("RULES_PIN_INCONSISTENT");
    expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
  });
});

describe("runPrecheck: 대상 SHA와 스캔 트리 (target)", () => {
  it("브랜치 이름은 TARGET_SHA_UNRESOLVED이고 스캔 트리 사유를 내지 않는다", async () => {
    const world = await makeWorld();
    const result = await check(world, { targetSha: "main" });
    expect(codes(result.reasons)).toEqual(["TARGET_SHA_UNRESOLVED"]);
  });

  it("target 모드에서 SHA가 없으면(null) TARGET_SHA_UNRESOLVED", async () => {
    const world = await makeWorld();
    const result = await check(world, { targetSha: null });
    expect(codes(result.reasons)).toEqual(["TARGET_SHA_UNRESOLVED"]);
  });

  it("git에 없는 40자 SHA도 TARGET_SHA_UNRESOLVED", async () => {
    const world = await makeWorld();
    const result = await check(world, { targetSha: "c".repeat(40) });
    expect(codes(result.reasons)).toEqual(["TARGET_SHA_UNRESOLVED"]);
  });

  it("옛 파일 목록을 복사한 트리(새 제품 파일 누락) → SCAN_TREE_FILE_MISSING", async () => {
    const world = await makeWorld({ scanTreeOverrides: { "src/b.tsx": null } });
    const result = await check(world);
    expect(codes(result.reasons)).toEqual(["SCAN_TREE_FILE_MISSING"]);
    expect(result.reasons[0].detail).toContain("src/b.tsx");
    expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
  });

  it("트리에 E에 없는 파일이 있으면 SCAN_TREE_FILE_ADDED, 내용이 다르면 SCAN_TREE_FILE_CHANGED", async () => {
    const world = await makeWorld({
      scanTreeOverrides: { "src/extra.ts": "export {};\n", "src/a.ts": "tampered\n" },
    });
    const result = await check(world);
    expect(codes(result.reasons).sort()).toEqual([
      "SCAN_TREE_FILE_ADDED",
      "SCAN_TREE_FILE_CHANGED",
    ]);
  });

  it("트리 안의 기본 ignore 디렉터리 이름은 SCAN_TREE_IGNORED_DIR_NAME", async () => {
    const world = await makeWorld({ scanTreeOverrides: { "build/x.ts": "x\n" } });
    const result = await check(world);
    expect(codes(result.reasons)).toContain("SCAN_TREE_IGNORED_DIR_NAME");
  });

  it("details에 E의 해시와 개수가 있다(목록 원문은 넣지 않는다)", async () => {
    const world = await makeWorld();
    const result = await check(world);
    const scope = await computeScope(git, SHA, scopeConfig);
    expect(result.details.scope_sha256).toBe(scope.scopeSha256);
    expect(result.details.scope_included).toBe(2);
    expect(JSON.stringify(result.details)).not.toContain("src/a.ts");
  });

  it("control 모드에서는 대상 SHA와 스캔 트리를 보지 않는다", async () => {
    const world = await makeWorld({ scanTreeOverrides: { "src/b.tsx": null } });
    const result = await check(world, { mode: "control", targetSha: "main" });
    expect(result.reasons).toEqual([]);
  });
});

describe("runPrecheck: 대조 트리 (control)", () => {
  it("정적 입력 바이트가 한 바이트라도 바뀌면 CONTROL_TREE_MISMATCH", async () => {
    const changed = controlExpectations.cases[0].fixture;
    const bytes = fixtureBytes(changed);
    const tampered = new Uint8Array(bytes.byteLength + 1);
    tampered.set(bytes);
    tampered[bytes.byteLength] = 0x0a;
    const world = await makeWorld({
      controlSourceOverride: { [changed]: new TextDecoder().decode(tampered) },
    });
    const result = await check(world, { mode: "control", targetSha: null });
    expect(codes(result.reasons)).toContain("CONTROL_TREE_MISMATCH");
    expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
  });

  it("대조 트리의 파일 내용이 바뀌면 CONTROL_TREE_MISMATCH", async () => {
    const world = await makeWorld({ controlTreeOverrides: { "cases/eval.pos.js": "eval(x);\n" } });
    const result = await check(world, { mode: "control", targetSha: null });
    expect(codes(result.reasons)).toEqual(["CONTROL_TREE_MISMATCH"]);
    expect(result.reasons[0].detail).toContain("cases/eval.pos.js");
  });

  it("대조 트리에 파일이 빠지거나 더해져도 CONTROL_TREE_MISMATCH", async () => {
    const world = await makeWorld({
      controlTreeOverrides: { "cases/eval.ok.js": null, "cases/extra.js": "x\n" },
    });
    const result = await check(world, { mode: "control", targetSha: null });
    expect(codes(result.reasons)).toEqual(["CONTROL_TREE_MISMATCH", "CONTROL_TREE_MISMATCH"]);
  });

  it("target 모드에서는 대조 트리를 보지 않는다", async () => {
    const world = await makeWorld({ controlTreeOverrides: { "cases/eval.pos.js": "eval(x);\n" } });
    const result = await check(world);
    expect(result.reasons).toEqual([]);
  });

  it("buildControlTree는 실제 확장자로 복사하고 이미 있으면 덮어쓰지 않는다", async () => {
    const initial: Record<string, Uint8Array> = {};
    for (const c of controlExpectations.cases)
      initial[`/repo/${c.fixture}`] = fixtureBytes(c.fixture);
    const fs = new MemoryFs(initial);
    const args = { expectations: controlExpectations, fixturesRoot: "/repo", treeRoot: "/out" };
    expect(await buildControlTree(fs, args)).toEqual([]);
    const listed = await fs.listFilesRecursive("/out");
    expect(listed).toEqual(controlExpectations.cases.map((c) => c.path).sort());
    for (const c of controlExpectations.cases) {
      expect(sha256Hex(await fs.readFile(`/out/${c.path}`))).toBe(c.sha256);
    }
    await expect(buildControlTree(fs, args)).rejects.toThrow();
  });

  it("buildControlTree는 정적 입력이 기대 해시와 다르면 아무것도 쓰지 않고 사유를 돌려준다", async () => {
    const initial: Record<string, Uint8Array | string> = {};
    for (const c of controlExpectations.cases)
      initial[`/repo/${c.fixture}`] = fixtureBytes(c.fixture);
    initial[`/repo/${controlExpectations.cases[2].fixture}`] = "changed\n";
    const fs = new MemoryFs(initial);
    const reasons = await buildControlTree(fs, {
      expectations: controlExpectations,
      fixturesRoot: "/repo",
      treeRoot: "/out",
    });
    expect(codes(reasons)).toEqual(["CONTROL_TREE_MISMATCH"]);
    expect(await fs.listFilesRecursive("/out")).toEqual([]);
  });
});

describe("runPrecheck: 도구 버전·휠", () => {
  it("버전이 다르면 TOOL_VERSION_MISMATCH", async () => {
    const result = await check(await makeWorld(), { toolVersionObserved: "1.181.0" });
    expect(codes(result.reasons)).toEqual(["TOOL_VERSION_MISMATCH"]);
    expect(representativeStatus(result.reasons)).toBe("ENV_MISMATCH");
  });

  it("관측하지 못했으면(null) TOOL_VERSION_UNVERIFIED", async () => {
    const result = await check(await makeWorld(), { toolVersionObserved: null });
    expect(codes(result.reasons)).toEqual(["TOOL_VERSION_UNVERIFIED"]);
  });

  it("휠 sha256이 다르면 WHEEL_HASH_MISMATCH", async () => {
    const result = await check(await makeWorld(), { wheelSha256Observed: "c".repeat(64) });
    expect(codes(result.reasons)).toEqual(["WHEEL_HASH_MISMATCH"]);
  });

  it("휠 관측값이 없으면 WHEEL_HASH_UNVERIFIED", async () => {
    const result = await check(await makeWorld(), { wheelSha256Observed: null });
    expect(codes(result.reasons)).toEqual(["WHEEL_HASH_UNVERIFIED"]);
  });

  it("핀의 휠 sha256이 null이거나 verified=false면 관측값이 있어도 UNVERIFIED(fail-closed)", async () => {
    const world = await makeWorld();
    const nullPin = makePin({ sha256: null });
    expect(codes((await check(world, { pin: nullPin })).reasons)).toEqual([
      "WHEEL_HASH_UNVERIFIED",
    ]);
    const unverifiedPin = makePin({ verified: false });
    expect(codes((await check(world, { pin: unverifiedPin })).reasons)).toEqual([
      "WHEEL_HASH_UNVERIFIED",
    ]);
  });

  it("저장소의 실제 핀은 휠이 미확인이라 그대로는 통과하지 못한다(의도)", async () => {
    const world = await makeWorld();
    const result = await check(world, {
      pin: {
        ...realPin,
        rules: world.input.pin.rules,
      },
    });
    expect(codes(result.reasons)).toEqual(["WHEEL_HASH_UNVERIFIED"]);
  });
});

describe("runPrecheck: 환경변수", () => {
  it("허용 목록 밖의 SEMGREP_* → ENV_VAR_NOT_ALLOWED(이름만 기록)", async () => {
    const result = await check(await makeWorld(), { env: { SEMGREP_FOO: "bar-value" } });
    expect(codes(result.reasons)).toEqual(["ENV_VAR_NOT_ALLOWED"]);
    expect(result.reasons[0].detail).toContain("SEMGREP_FOO");
    expect(JSON.stringify(result)).not.toContain("bar-value");
  });

  it("SEMGREP_가 아닌 변수는 보지 않는다", async () => {
    const result = await check(await makeWorld(), { env: { FOO: "1", SEMGREPX: "1" } });
    expect(result.reasons).toEqual([]);
  });

  it("소문자 이름도 같은 변수로 취급한다(Windows 환경변수는 대소문자를 구분하지 않는다)", async () => {
    const result = await check(await makeWorld(), { env: { semgrep_foo: "1" } });
    expect(codes(result.reasons)).toEqual(["ENV_VAR_NOT_ALLOWED"]);
  });

  it("URL 변수가 루프백이 아니면 ENV_URL_NOT_LOOPBACK, 루프백이면 통과", async () => {
    const bad = await check(await makeWorld(), {
      env: {
        SEMGREP_METRICS_URL: "https://metrics.example.com/x",
        SEMGREP_VERSION_CHECK_URL: "http://localhost:8080/v",
        SEMGREP_APP_URL: "http://127.0.0.1:9/a",
      },
    });
    expect(codes(bad.reasons)).toEqual(["ENV_URL_NOT_LOOPBACK"]);
    expect(bad.reasons[0].detail).toContain("SEMGREP_METRICS_URL");
    expect(bad.reasons[0].detail).toContain("host is not loopback");
    expect(JSON.stringify(bad)).not.toContain("metrics.example.com");
  });

  it("루프백 판정: ::1과 127.x는 통과, 해석할 수 없거나 빈 값은 fail-closed", async () => {
    const world = await makeWorld();
    const ok = await check(world, {
      env: { SEMGREP_METRICS_URL: "http://[::1]:7/m", SEMGREP_APP_URL: "http://127.9.9.9/a" },
    });
    expect(ok.reasons).toEqual([]);
    for (const value of [
      "",
      "not a url",
      "http://localhost.evil.com/",
      "http://127.0.0.1.evil.com/",
    ]) {
      const bad = await check(world, { env: { SEMGREP_METRICS_URL: value } });
      expect(codes(bad.reasons)).toEqual(["ENV_URL_NOT_LOOPBACK"]);
    }
  });

  it("로그·설정 파일 경로가 증거 폴더 밖이면 ENV_PATH_OUTSIDE_EVIDENCE", async () => {
    const world = await makeWorld();
    const inside = await check(world, {
      env: {
        SEMGREP_LOG_FILE: `${EVIDENCE}/semgrep.log`,
        SEMGREP_SETTINGS_FILE: `${EVIDENCE}/s/settings.yml`,
      },
    });
    expect(inside.reasons).toEqual([]);
    for (const value of [
      "/home/x/.semgrep/settings.yml",
      `${EVIDENCE}/../other/log`,
      `${EVIDENCE}-evil/log`,
      "relative/log",
      EVIDENCE,
    ]) {
      const bad = await check(world, { env: { SEMGREP_LOG_FILE: value } });
      expect(codes(bad.reasons)).toEqual(["ENV_PATH_OUTSIDE_EVIDENCE"]);
      if (value !== EVIDENCE) expect(JSON.stringify(bad)).not.toContain(value);
    }
  });

  it("Windows 형식 경로(역슬래시, 드라이브 대소문자)도 증거 폴더 안이면 통과", async () => {
    const world = await makeWorld();
    const result = await check(world, {
      evidenceRoot: "C:\\evidence\\run-1",
      env: { SEMGREP_LOG_FILE: "c:\\evidence\\run-1\\semgrep.log" },
    });
    expect(result.reasons).toEqual([]);
  });

  it("앱 토큰은 빈 값이어도 APP_TOKEN_PRESENT이고 값은 기록하지 않는다", async () => {
    const world = await makeWorld();
    const empty = await check(world, { env: { SEMGREP_APP_TOKEN: "" } });
    expect(codes(empty.reasons)).toEqual(["APP_TOKEN_PRESENT"]);
    const filled = await check(world, { env: { SEMGREP_APP_TOKEN: "sgp_secret-token-123" } });
    expect(codes(filled.reasons)).toEqual(["APP_TOKEN_PRESENT"]);
    expect(JSON.stringify(filled)).not.toContain("sgp_secret-token-123");
  });

  it("값이 undefined인 항목은 없는 변수로 취급한다", async () => {
    const result = await check(await makeWorld(), {
      env: { SEMGREP_APP_TOKEN: undefined, SEMGREP_FOO: undefined },
    });
    expect(result.reasons).toEqual([]);
  });

  it("기밀처럼 보이는 값은 직렬화된 결과 어디에도 나타나지 않는다", async () => {
    const secrets = [
      "sgp_tok-AAAA1111",
      "https://leak.example.org/hook?key=BBBB2222",
      "/home/CCCC3333/.semgrep/log",
    ];
    const result = await check(await makeWorld(), {
      env: {
        SEMGREP_APP_TOKEN: secrets[0],
        SEMGREP_METRICS_URL: secrets[1],
        SEMGREP_LOG_FILE: secrets[2],
        SEMGREP_SECRET_EXTRA: "DDDD4444",
      },
    });
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
    const text = JSON.stringify(result);
    for (const needle of [
      ...secrets,
      "AAAA1111",
      "BBBB2222",
      "CCCC3333",
      "DDDD4444",
      "leak.example.org",
    ]) {
      expect(text).not.toContain(needle);
    }
  });
});

describe("runPrecheck: 잠금·다른 서버 프로세스", () => {
  it("잠금을 얻지 못했거나(false) 모르면(null) LOCK_NOT_ACQUIRED", async () => {
    const world = await makeWorld();
    expect(codes((await check(world, { lockHeld: false })).reasons)).toEqual(["LOCK_NOT_ACQUIRED"]);
    expect(codes((await check(world, { lockHeld: null })).reasons)).toEqual(["LOCK_NOT_ACQUIRED"]);
  });

  it("잠금을 얻지 못한 이유 토큰은 상세에만 붙고, 코드와 판정은 같다(이유를 주지 않으면 기존 문구)", async () => {
    const world = await makeWorld();
    const plain = (await check(world, { lockHeld: false })).reasons[0];
    const withReason = (await check(world, { lockHeld: false, lockRefusal: "HELD_BY_OTHER" }))
      .reasons[0];
    expect(plain).toMatchObject({ code: "LOCK_NOT_ACQUIRED", detail: "실행 잠금을 얻지 못했다" });
    expect(withReason).toMatchObject({
      code: "LOCK_NOT_ACQUIRED",
      detail: "실행 잠금을 얻지 못했다 (HELD_BY_OTHER)",
    });
    // 확인하지 못함(null)에도 같은 규칙이다. 잠금을 얻었으면(true) 이유가 있어도 사유가 없다.
    expect(
      (await check(world, { lockHeld: null, lockRefusal: "TREE_UNRESOLVABLE" })).reasons[0].detail
    ).toBe("잠금 상태를 확인하지 못했다 (TREE_UNRESOLVABLE)");
    expect((await check(world, { lockHeld: true, lockRefusal: "IGNORED" })).reasons).toEqual([]);
  });

  it("잠금을 얻어도 다른 서버 프로세스 검사는 별개다 — 잠금이 foreignServerProcesses를 채우지 않는다", async () => {
    const world = await makeWorld();
    const result = await check(world, { lockHeld: true, foreignServerProcesses: null });
    expect(codes(result.reasons)).toEqual(["FOREIGN_SERVER_PROCESS"]);
    expect(result.details.lock_held).toBe(true);
    expect(result.details.foreign_server_processes).toBeNull();
  });

  it("다른 서버 프로세스: null(미확인)과 1 이상은 FOREIGN_SERVER_PROCESS, 0은 통과", async () => {
    const world = await makeWorld();
    expect(codes((await check(world, { foreignServerProcesses: null })).reasons)).toEqual([
      "FOREIGN_SERVER_PROCESS",
    ]);
    expect(codes((await check(world, { foreignServerProcesses: 2 })).reasons)).toEqual([
      "FOREIGN_SERVER_PROCESS",
    ]);
    expect((await check(world, { foreignServerProcesses: 0 })).reasons).toEqual([]);
  });
});

describe("runPrecheck: 준비하지 않은 서버 트리(treeNotPrepared)", () => {
  const noTree = { scanTreeOverrides: Object.fromEntries(scanPaths().map((p) => [p, null])) };

  function scanPaths(): string[] {
    return Object.keys(productFiles).filter((p) => p.startsWith("src/"));
  }

  it("생략하면 예전처럼 비어 있는 스캔 트리를 SCAN_TREE_FILE_MISSING으로 판정한다", async () => {
    const world = await makeWorld(noTree);
    const result = await check(world, { lockHeld: false });
    expect(codes(result.reasons)).toContain("SCAN_TREE_FILE_MISSING");
    expect(result.details).not.toHaveProperty("server_tree");
  });

  it("true이면 비어 있는 스캔 트리를 판정하지 않아 대표 상태가 LOCK_NOT_ACQUIRED(ENV_MISMATCH)로 남는다", async () => {
    const world = await makeWorld(noTree);
    const result = await check(world, { lockHeld: false, treeNotPrepared: true });
    expect(codes(result.reasons)).toEqual(["LOCK_NOT_ACQUIRED"]);
    expect(representativeStatus(result.reasons)).toBe("ENV_MISMATCH");
    expect(result.details.server_tree).toBe("NOT_PREPARED");
    // 범위 E 자체는 트리와 무관하게 계산된다.
    expect(result.details.scope_included).toBe(scanPaths().length);
  });

  it("잠금을 가졌으면(lockHeld true) treeNotPrepared를 무시하고 트리를 검증한다 — 검증하지 않은 트리로 통과하는 경로가 없다(독립 검토 F2)", async () => {
    const world = await makeWorld(noTree);
    const result = await check(world, { lockHeld: true, treeNotPrepared: true });
    expect(codes(result.reasons)).toContain("SCAN_TREE_FILE_MISSING");
    expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
    expect(result.details).not.toHaveProperty("server_tree");
    // 건너뛸 때(잠금 없음)는 언제나 LOCK_NOT_ACQUIRED가 함께 있다.
    for (const lockHeld of [false, null] as const) {
      const skipped = await check(world, { lockHeld, treeNotPrepared: true });
      expect(codes(skipped.reasons)).toContain("LOCK_NOT_ACQUIRED");
    }
  });

  it("control 모드: 비어 있는 대조 트리는 판정하지 않지만 정적 입력의 바이트 확인은 그대로 한다", async () => {
    const empty = Object.fromEntries(controlExpectations.cases.map((c) => [c.path, null]));
    const clean = await makeWorld({ controlTreeOverrides: empty });
    const ok = await check(clean, {
      mode: "control",
      targetSha: null,
      lockHeld: false,
      treeNotPrepared: true,
    });
    expect(codes(ok.reasons)).toEqual(["LOCK_NOT_ACQUIRED"]);
    expect(ok.details.server_tree).toBe("NOT_PREPARED");
    expect(ok.details.control_tree_sha256).toBeNull();

    const fixture = controlExpectations.cases[0].fixture;
    const tampered = await makeWorld({
      controlTreeOverrides: empty,
      controlSourceOverride: { [fixture]: "// 바이트가 달라졌다\n" },
    });
    const bad = await check(tampered, {
      mode: "control",
      targetSha: null,
      lockHeld: false,
      treeNotPrepared: true,
    });
    expect(codes(bad.reasons)).toEqual(["CONTROL_TREE_MISMATCH", "LOCK_NOT_ACQUIRED"]);
  });

  it("잠금이 있어도 다른 서버가 있거나(1 이상) 확인하지 못했으면(null) 비어 있는 트리를 판정하지 않는다 — 막는 원인은 FOREIGN_SERVER_PROCESS다", async () => {
    const world = await makeWorld(noTree);
    for (const foreignServerProcesses of [null, 1, 4] as const) {
      const result = await check(world, {
        lockHeld: true,
        treeNotPrepared: true,
        foreignServerProcesses,
      });
      expect(codes(result.reasons), String(foreignServerProcesses)).toEqual([
        "FOREIGN_SERVER_PROCESS",
      ]);
      expect(representativeStatus(result.reasons)).toBe("ENV_MISMATCH");
      expect(result.details.server_tree).toBe("NOT_PREPARED");
    }
  });

  it("잠금이 있고 다른 서버가 0건이면 treeNotPrepared를 무시하고 트리를 검증한다(트리를 만들 수 있었다)", async () => {
    const world = await makeWorld(noTree);
    const result = await check(world, {
      lockHeld: true,
      treeNotPrepared: true,
      foreignServerProcesses: 0,
    });
    expect(codes(result.reasons)).toContain("SCAN_TREE_FILE_MISSING");
    expect(result.details).not.toHaveProperty("server_tree");
  });

  it("검사를 건너뛸 때는 언제나 LOCK_NOT_ACQUIRED 또는 FOREIGN_SERVER_PROCESS가 함께 있다 — 검증하지 않은 트리로 통과하는 조합이 없다", async () => {
    const world = await makeWorld(noTree);
    for (const lockHeld of [true, false, null] as const) {
      for (const foreignServerProcesses of [0, 1, null] as const) {
        const result = await check(world, {
          lockHeld,
          foreignServerProcesses,
          treeNotPrepared: true,
        });
        const skipped = result.details.server_tree === "NOT_PREPARED";
        const label = `lockHeld=${String(lockHeld)} foreign=${String(foreignServerProcesses)}`;
        expect(skipped, label).toBe(!(lockHeld === true && foreignServerProcesses === 0));
        if (skipped) {
          const got = codes(result.reasons);
          expect(
            got.includes("LOCK_NOT_ACQUIRED") || got.includes("FOREIGN_SERVER_PROCESS"),
            label
          ).toBe(true);
        }
      }
    }
  });

  it("control 모드: 다른 서버를 배제하지 못해도 정적 입력의 바이트 확인은 그대로 한다", async () => {
    const empty = Object.fromEntries(controlExpectations.cases.map((c) => [c.path, null]));
    const world = await makeWorld({ controlTreeOverrides: empty });
    const result = await check(world, {
      mode: "control",
      targetSha: null,
      lockHeld: true,
      treeNotPrepared: true,
      foreignServerProcesses: null,
    });
    expect(codes(result.reasons)).toEqual(["FOREIGN_SERVER_PROCESS"]);
    expect(result.details.server_tree).toBe("NOT_PREPARED");
  });
});

describe("runPrecheck: 사유는 전부 모은다(조기 반환 없음)", () => {
  it("규칙·대상·도구·환경·잠금이 동시에 틀리면 사유가 모두 나온다", async () => {
    const world = await makeWorld({
      ruleDrop: ["javascript/lang/a.yaml"],
      scanTreeOverrides: { "src/b.tsx": null },
    });
    const result = await check(world, {
      toolVersionObserved: null,
      wheelSha256Observed: null,
      env: { SEMGREP_APP_TOKEN: "x", SEMGREP_FOO: "1" },
      lockHeld: false,
      foreignServerProcesses: 3,
    });
    const got = new Set(codes(result.reasons));
    for (const code of [
      "RULES_FILE_REMOVED",
      "RULES_LIST_HASH_MISMATCH",
      "SCAN_TREE_FILE_MISSING",
      "TOOL_VERSION_UNVERIFIED",
      "WHEEL_HASH_UNVERIFIED",
      "APP_TOKEN_PRESENT",
      "ENV_VAR_NOT_ALLOWED",
      "LOCK_NOT_ACQUIRED",
      "FOREIGN_SERVER_PROCESS",
    ] as const) {
      expect(got.has(code)).toBe(true);
    }
    // 대표 상태는 가장 앞선 MANIFEST_MISMATCH다.
    expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
    expect(REASON_STATUS.LOCK_NOT_ACQUIRED).toBe("ENV_MISMATCH");
  });

  it("사유 순서는 결정적이다(같은 입력 → 같은 출력)", async () => {
    const world = await makeWorld({ ruleExtra: { "javascript/lang/zz.yaml": "x\n" } });
    const patch = { lockHeld: false, toolVersionObserved: null } as const;
    const a = await check(world, patch);
    const b = await check(world, patch);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
