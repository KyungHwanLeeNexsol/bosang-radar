import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXIT, main } from "./cli";
import { loadControlReference } from "./reference-record";
import {
  BIN,
  EVIDENCE_ROOT,
  FIXTURES_ROOT,
  FLAG,
  SUITE_ID,
  WORK_ROOT,
  argvControlRun,
  argvNegativeControl,
  makeCliWorld as buildCliWorld,
  type CliWorld,
  type CliWorldOptions,
} from "./testing/cli-negative-control-world";
import { serverRow, listerOf, ownRow, parentRow } from "./testing/synthetic-processes";
import { SYNTHETIC_CACHE_DIR, SYNTHETIC_HARNESS_ROOT } from "./testing/synthetic-data";
import { drive } from "./testing/stub-lsp";

// 이 시험의 모든 실행은 메모리 파일 시스템, 가짜 프로세스 포트, 스크립트된 스텁 엔진 위에서 돈다. 실제 Semgrep을 설치·실행하지 않고,
// 실제 규칙 YAML도 읽지 않으며, 규칙·대조 예제·엔진 반응은 전부 합성이다(provenance "stub", trust "SYNTHETIC"). 여기서의 통과는
// CLI → 실행기 → 하네스 → run.json → 읽기 어댑터 연결이 합성 입력에서 의도대로 동작한다는 뜻일 뿐, 실제 엔진이 변형에 그렇게 반응한다는
// 증거도, 음성 대조가 실제로 통과했다는 증거도 아니다.

function fixtureBytes(fixture: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
}
const makeCliWorld = (options: CliWorldOptions = {}): CliWorld =>
  buildCliWorld(fixtureBytes, options);

const MAX_MS = 1000 * 3_600_000;
const SUITE_RECORD = `${EVIDENCE_ROOT}/${SUITE_ID}/negative-controls.json`;
const decoder = new TextDecoder();

interface Entry {
  id: string;
  layer: "preflight" | "engine";
  expected: string;
  observed: string | null;
  status: "PASS" | "FAIL" | "NOT_RUN";
  binding_sha256: string | null;
}
interface SuiteBody {
  command: string;
  status: string;
  provenance: string;
  counts: { pass: number; fail: number; not_run: number };
  baseline: { run_id: string; clean: boolean };
  entries: Entry[];
  cases: { id: string; layer: string; outcome: string }[];
  conflicts: { id: string }[];
  record: { written: boolean; path: string };
  cleanup: { run_id: string; lock: string; receiver_closed: boolean }[];
  not_established: Record<string, string>;
  not_implemented_or_not_verified: unknown;
}
interface RunBody {
  status: string;
  ok: boolean;
  started: boolean;
  complete: boolean;
  negative_controls: {
    given: boolean;
    loaded?: {
      accepted: boolean;
      rejection: string | null;
      counts: { pass: number; fail: number; not_run: number };
    };
  };
  record: {
    resources: {
      negative_control_suite?: { accepted: boolean; rejection: string | null };
      engine_diagnostic?: unknown;
    } | null;
  } | null;
}
interface RunJson {
  provenance: string;
  trust: string;
  measurement: { status: string };
  resources?: { engine_diagnostic?: { policy: string; started_despite_refusals: boolean } };
  control_assertions: { negative_controls: Entry[] };
  reference_qualification: {
    eligible: boolean;
    requirements: { id: string; satisfied: boolean; detail: string }[];
  };
}

const runCli = (w: CliWorld, argv: string[]): Promise<number> =>
  drive(w.clock, main(argv, w.deps), MAX_MS);
const suiteOut = (w: CliWorld): SuiteBody => JSON.parse(w.out.join("")) as SuiteBody;
const runOut = (w: CliWorld): RunBody => JSON.parse(w.out.join("")) as RunBody;
const readRunJson = async (w: CliWorld, runId: string): Promise<RunJson> =>
  JSON.parse(decoder.decode(await w.fs.readFile(`${EVIDENCE_ROOT}/${runId}/run.json`))) as RunJson;
const statusOf = (body: SuiteBody): Record<string, string> =>
  Object.fromEntries(body.entries.map((e) => [`${e.id}:${e.layer}`, e.status]));
const runIdOf = (id: string, layer: string): string => `${SUITE_ID}-${id.toLowerCase()}-${layer}`;
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function suiteRun(
  options: CliWorldOptions = {},
  extra: string[] = []
): Promise<{ w: CliWorld; code: number; body: SuiteBody }> {
  const w = makeCliWorld(options);
  const code = await runCli(w, argvNegativeControl(extra));
  return { w, code, body: suiteOut(w) };
}

/** 어떤 경로로 끝나도 얻은 잠금은 모두 풀렸고 열린 수신기는 모두 한 번씩 닫혔다. */
function expectCleanedUp(w: CliWorld, body: SuiteBody): void {
  expect(w.lock.files.size).toBe(0);
  expect(body.cleanup.length).toBeGreaterThan(0);
  expect(body.cleanup.filter((c) => c.lock === "NOT_RELEASED" || !c.receiver_closed)).toEqual([]);
  expect(w.receivers.length).toBe(body.cleanup.length);
  for (const receiver of w.receivers) expect(receiver.closeCalls).toBe(1);
}

describe("negative-control — 방지 장치와 인자", () => {
  const guardCases: { name: string; options: CliWorldOptions; argv: () => string[] }[] = [
    { name: "환경변수 없음", options: { env: {} }, argv: () => argvNegativeControl() },
    {
      name: "플래그 없음",
      options: {},
      argv: () => argvNegativeControl().filter((a) => a !== FLAG),
    },
    {
      name: "실행 파일 인자 없음",
      options: {},
      argv: () => {
        const argv = argvNegativeControl();
        argv.splice(argv.indexOf("--semgrep-bin"), 2);
        return argv;
      },
    },
    {
      name: "실행 파일이 없는 경로",
      options: {},
      argv: () => {
        const argv = argvNegativeControl();
        argv[argv.indexOf("--semgrep-bin") + 1] = "/opt/missing/semgrep";
        return argv;
      },
    },
  ];

  for (const g of guardCases) {
    it(`방지 장치를 통과하지 못하면(${g.name}) NOT_RUN 3이고, 포트·잠금·수신기·쓰기가 하나도 없다`, async () => {
      const w = makeCliWorld(g.options);
      expect(await runCli(w, g.argv())).toBe(EXIT.notRun);
      const body = JSON.parse(w.out.join("")) as { status: string; command: string };
      expect(body).toMatchObject({ command: "negative-control", status: "NOT_RUN" });
      expect(w.portCalls).toEqual([]);
      expect(w.lock.calls).toEqual([]);
      expect(w.receivers).toEqual([]);
      expect(w.versionCalls).toEqual([]);
      expect(w.serverCalls).toEqual([]);
      expect(w.writes).toEqual([]);
    });
  }

  it("방지 장치는 값 검증보다 먼저다: suite-id 값이 틀려도 장치가 열려 있지 않으면 사용법 오류가 아니라 NOT_RUN이다", async () => {
    const w = makeCliWorld({ env: {} });
    const argv = argvNegativeControl();
    argv.splice(argv.indexOf("--suite-id") + 1, 1, "../escaped");
    expect(await runCli(w, argv)).toBe(EXIT.notRun);
    expect(w.portCalls).toEqual([]);
    expect(w.lock.calls).toEqual([]);
  });

  const usageCases: { name: string; mutate: (argv: string[]) => string[] }[] = [
    {
      name: "잘못된 suite-id",
      mutate: (a) => (a.splice(a.indexOf("--suite-id") + 1, 1, "../escaped"), a),
    },
    {
      name: "상대 경로 work-root",
      mutate: (a) => (a.splice(a.indexOf("--work-root") + 1, 1, "work"), a),
    },
    {
      name: "상대 경로 wheel-artifact",
      mutate: (a) => (a.splice(a.indexOf("--wheel-artifact") + 1, 1, "x.whl"), a),
    },
    { name: "work-root 누락", mutate: (a) => (a.splice(a.indexOf("--work-root"), 2), a) },
    {
      name: "control-fixtures-root 누락",
      mutate: (a) => (a.splice(a.indexOf("--control-fixtures-root"), 2), a),
    },
    {
      name: "증거 폴더와 작업 공간이 겹침",
      mutate: (a) => (a.splice(a.indexOf("--work-root") + 1, 1, EVIDENCE_ROOT), a),
    },
  ];
  for (const c of usageCases) {
    it(`사용법 오류(${c.name}): 종료 코드 2이고, 포트·잠금·수신기·쓰기가 없다`, async () => {
      const w = makeCliWorld();
      expect(await runCli(w, c.mutate(argvNegativeControl()))).toBe(EXIT.usage);
      expect(w.err.join("")).toContain("사용법");
      expect(w.portCalls).toEqual([]);
      expect(w.lock.calls).toEqual([]);
      expect(w.receivers).toEqual([]);
      expect(w.writes).toEqual([]);
    });
  }
});

describe("negative-control — 합성 스텁으로 한 번 끝까지(스위트 기록)", () => {
  it("R9 엔진 층은 계약 충돌이라 실행하지 않고 NOT_RUN으로 남으며, 그래서 종료 코드는 1이고 COMPLETE가 아니다", async () => {
    const { w, code, body } = await suiteRun();
    expect(code).toBe(EXIT.failed);
    expect(body.command).toBe("negative-control");
    expect(body.status).toBe("INCOMPLETE");
    expect(body.provenance).toBe("stub"); // 스텁 결과는 SYNTHETIC이다 — 실제 엔진 검증이라고 쓰지 않는다
    expect(body.entries).toHaveLength(16);
    expect(body.counts).toEqual({ pass: 15, fail: 0, not_run: 1 });
    expect(body.baseline.clean).toBe(true);

    const r9 = body.entries.find((e) => e.id === "R9" && e.layer === "engine");
    expect(r9).toMatchObject({ status: "NOT_RUN", observed: null, binding_sha256: null });
    expect(body.cases.find((c) => c.id === "R9" && c.layer === "engine")?.outcome).toBe(
      "BLOCKED_CONTRACT_CONFLICT"
    );
    expect(body.conflicts.map((c) => c.id)).toEqual(["R9"]);
    // R9 엔진 층에는 서버를 띄운 흔적이 없다: 기준 1 + 엔진 층 8(R9 제외)
    expect(w.serverCalls).toHaveLength(9);
    expect(w.serverCalls.some((s) => (s.cwd ?? "").includes("r9-engine"))).toBe(false);
    expect(body.not_established).toEqual({
      actual_engine_behavior: "UNVERIFIED",
      mutated_yaml_validity: "UNVERIFIED",
    });
    expect(body.not_implemented_or_not_verified).toBeDefined();
    expectCleanedUp(w, body);
  });

  it("버전 확인은 스위트 전체에서 한 번이고, 프로세스 포트도 한 번만 만든다", async () => {
    const { w } = await suiteRun();
    expect(w.versionCalls).toHaveLength(1);
    expect(w.portCalls).toEqual(["real"]);
  });

  it("사전 검사 층 7개는 서버를 띄우지 않고, 엔진 층은 사전 검사가 막는 입력에서도 엔진 진단으로만 서버를 띄운다", async () => {
    const { w, body } = await suiteRun();
    const preflight = body.cases.filter((c) => c.layer === "preflight");
    expect(preflight).toHaveLength(7);
    // 사전 검사 사례의 작업 공간에서는 어떤 서버도 뜨지 않았다
    expect(w.serverCalls.filter((s) => /-preflight(\/|$)/.test(s.cwd ?? ""))).toEqual([]);
    for (const c of body.cases.filter((c) => c.layer === "engine" && c.outcome === "EXECUTED")) {
      const run = await readRunJson(w, runIdOf(c.id, "engine"));
      expect(run.resources?.engine_diagnostic?.policy, c.id).toBe("ENGINE_DIAGNOSTIC");
    }
    for (const c of preflight) {
      const run = await readRunJson(w, runIdOf(c.id, "preflight"));
      expect(run.resources?.engine_diagnostic, c.id).toBeUndefined();
    }
  });

  it("observed는 사례 실행 증거(run.json)의 판정에서 왔고, 항목마다 사례별 증거와 해시가 연결된다", async () => {
    const { w, body } = await suiteRun();
    const stored = JSON.parse(decoder.decode(await w.fs.readFile(SUITE_RECORD))) as {
      cases: {
        id: string;
        layer: string;
        evidence: { run_id: string; run_json_sha256: string } | null;
      }[];
    };
    for (const c of body.cases.filter((c) => c.outcome === "EXECUTED")) {
      const entry = body.entries.find((e) => e.id === c.id && e.layer === c.layer);
      const run = await readRunJson(w, runIdOf(c.id, c.layer));
      expect(entry?.observed, `${c.id}:${c.layer}`).toBe(run.measurement.status);
      const ref = stored.cases.find((s) => s.id === c.id && s.layer === c.layer)?.evidence;
      expect(ref?.run_id).toBe(runIdOf(c.id, c.layer));
      expect(ref?.run_json_sha256).toBe(
        sha256(await w.fs.readFile(`${EVIDENCE_ROOT}/${runIdOf(c.id, c.layer)}/run.json`))
      );
    }
  });

  it("원본 규칙·대조 예제·고정 입력·하네스 파일을 쓰거나 바꾸지 않는다: 쓰기는 증거·작업 공간 아래뿐이다", async () => {
    const before = new Map<string, string>();
    const probe = makeCliWorld();
    for (const root of ["/cache", FIXTURES_ROOT, SYNTHETIC_HARNESS_ROOT]) {
      for (const rel of await probe.fs.listFilesRecursive(root)) {
        const path = `${root}/${rel}`;
        before.set(path, sha256(await probe.fs.readFile(path)));
      }
    }
    expect(before.size).toBeGreaterThan(0);
    await runCli(probe, argvNegativeControl());
    for (const [path, hash] of before) {
      expect(sha256(await probe.fs.readFile(path)), path).toBe(hash);
    }
    expect(probe.writes.length).toBeGreaterThan(0);
    for (const path of probe.writes) {
      expect(path.startsWith(`${EVIDENCE_ROOT}/`) || path.startsWith(`${WORK_ROOT}/`), path).toBe(
        true
      );
    }
  });

  it("스위트 기록을 증거 폴더에 쓰고, 이미 있으면 덮어쓰지 않는다(같은 suite-id를 다시 쓰면 기존 기록이 그대로다)", async () => {
    const { w, body } = await suiteRun();
    expect(body.record).toEqual({ written: true, path: SUITE_RECORD });
    const first = await w.fs.readFile(SUITE_RECORD);
    w.out.length = 0;
    const code = await runCli(w, argvNegativeControl());
    expect(code).toBe(EXIT.failed);
    const again = suiteOut(w);
    expect(again.record.written).toBe(false);
    expect(await w.fs.readFile(SUITE_RECORD)).toEqual(first);
    expect(again.counts.pass).toBe(0); // 이미 쓰인 증거 표지 때문에 어떤 사례도 성공으로 부풀려지지 않는다
  });
});

describe("negative-control — 기대와 다른 결과·미실행·취소·실패·일부만 완료", () => {
  it("엔진이 변형에 반응하지 않으면(R6·R8) 그 항목은 FAIL이고 observed는 실제 판정이다(기대값 복사 없음)", async () => {
    const { w, code, body } = await suiteRun({ engine: () => undefined });
    expect(code).toBe(EXIT.failed);
    const states = statusOf(body);
    expect(states["R6:engine"]).toBe("FAIL");
    expect(states["R8:engine"]).toBe("FAIL");
    for (const id of ["R6", "R8"]) {
      const entry = body.entries.find((e) => e.id === id && e.layer === "engine");
      expect(entry?.observed).not.toBeNull();
      expect(entry?.observed).not.toBe(entry?.expected);
      const run = await readRunJson(w, runIdOf(id, "engine"));
      expect(entry?.observed).toBe(run.measurement.status);
    }
    // 반응이 필요 없는 항목은 그대로다
    expect(states["R7:engine"]).toBe("PASS");
    expect(body.counts.fail).toBe(2);
    expect(body.counts.pass + body.counts.fail + body.counts.not_run).toBe(16);
    expectCleanedUp(w, body);
  });

  it("사례 하나의 서버가 뜨지 못하면(실행 실패) 그 항목만 PASS가 아니고, 나머지는 영향이 없고, 정리는 끝난다", async () => {
    const { w, body } = await suiteRun({ failServer: (key) => key.id === "R7" });
    const states = statusOf(body);
    expect(states["R7:engine"]).not.toBe("PASS");
    expect(states["R7:preflight"]).toBe("PASS");
    expect(states["R1:engine"]).toBe("PASS");
    expect(body.counts.pass).toBeLessThan(15);
    expect(body.entries).toHaveLength(16);
    expectCleanedUp(w, body);
  });

  it("미리 취소된 신호: 어떤 항목도 PASS가 아니고(성공으로 보정하지 않음), 서버도 버전 확인도 시작하지 않으며, 정리는 끝난다", async () => {
    const w = makeCliWorld();
    w.deps.signal = AbortSignal.abort();
    const code = await runCli(w, argvNegativeControl());
    const body = suiteOut(w);
    expect(code).toBe(EXIT.failed);
    expect(body.counts.pass).toBe(0);
    expect(body.entries).toHaveLength(16);
    expect(body.entries.every((e) => e.status !== "PASS")).toBe(true);
    expect(w.serverCalls).toEqual([]);
    expect(w.versionCalls).toEqual([]);
    expectCleanedUp(w, body);
  });

  it("도구 버전이 핀과 다르면 기준 실행이 깨끗하지 않아 16개 모두 NOT_RUN이다(변형 실행을 성공으로 세지 않는다)", async () => {
    const { w, code, body } = await suiteRun({ versionOutput: "1.179.0\n" });
    expect(code).toBe(EXIT.failed);
    expect(body.baseline.clean).toBe(false);
    expect(body.counts).toEqual({ pass: 0, fail: 0, not_run: 16 });
    expectCleanedUp(w, body);
  });

  it("버전을 관측하지 못해도(확인 프로세스를 띄우지 못함) 핀 값으로 채우지 않고 16개 모두 NOT_RUN이다", async () => {
    const { body } = await suiteRun({ versionOutput: null });
    expect(body.baseline.clean).toBe(false);
    expect(body.counts).toEqual({ pass: 0, fail: 0, not_run: 16 });
  });

  it("휠 해시가 핀과 다르면 16개 모두 NOT_RUN이다", async () => {
    const { body } = await suiteRun({ wheelSha256: "c".repeat(64) });
    expect(body.baseline.clean).toBe(false);
    expect(body.counts.pass).toBe(0);
  });

  it("수신기를 열지 못하면 격리를 확인하지 못한 것이라 어떤 항목도 PASS가 아니다(0건으로 간주하지 않는다)", async () => {
    const { body } = await suiteRun({
      receiver: () => {
        throw new Error("시험: 수신기를 열지 못한다");
      },
    });
    expect(body.counts.pass).toBe(0);
    expect(body.entries.every((e) => e.status !== "PASS")).toBe(true);
  });

  it("같은 서버 트리에 다른 서버 프로세스가 보이면 기준 실행이 깨끗하지 않아 모두 NOT_RUN이고 서버를 띄우지 않는다", async () => {
    const baselineTree = `${WORK_ROOT}/${SUITE_ID}-baseline/tree`;
    const lister = listerOf([ownRow(), parentRow(), serverRow(601, { cwd: baselineTree })]);
    const { w, body } = await suiteRun({ lister });
    expect(body.baseline.clean).toBe(false);
    expect(body.counts.pass).toBe(0);
    expect(w.serverCalls.some((s) => (s.cwd ?? "").includes("-baseline"))).toBe(false);
  });

  it("잠금을 해제하지 못하면 정리 결과에 그대로 남고 종료 코드는 실패다(오래된 잠금을 지우지 않는다)", async () => {
    const w = makeCliWorld();
    w.lock.fail.remove = new Error("시험: 잠금 파일을 지우지 못한다");
    const code = await runCli(w, argvNegativeControl());
    const body = suiteOut(w);
    expect(code).toBe(EXIT.failed);
    expect(body.cleanup.some((c) => c.lock === "NOT_RELEASED")).toBe(true);
    expect(w.lock.files.size).toBeGreaterThan(0);
    for (const receiver of w.receivers) expect(receiver.closeCalls).toBe(1);
  });
});

describe("run --negative-controls — 실행 결과 → control_assertions → reference_qualification → run.json", () => {
  async function chained(
    options: CliWorldOptions = {}
  ): Promise<{ w: CliWorld; suite: SuiteBody; code: number; run: RunBody }> {
    const w = makeCliWorld(options);
    await runCli(w, argvNegativeControl());
    const suite = suiteOut(w);
    w.out.length = 0;
    const code = await runCli(w, argvControlRun("ctl-1", ["--negative-controls", SUITE_RECORD]));
    return { w, suite, code, run: runOut(w) };
  }

  it("명시한 스위트 기록은 증거에서 다시 도출한 항목으로 이어진다: 16개, R9 엔진은 NOT_RUN 그대로", async () => {
    const { w, run, code } = await chained();
    expect(code).toBe(EXIT.ok); // control 실행 자체의 측정은 완료다 — 음성 대조의 부족은 자격 계산이 막는다
    expect(run.negative_controls.given).toBe(true);
    expect(run.negative_controls.loaded).toMatchObject({ accepted: true, rejection: null });
    expect(run.record?.resources?.negative_control_suite).toMatchObject({
      accepted: true,
      rejection: null,
    });
    // 정상 control 실행은 엔진 진단이 아니다
    expect(run.record?.resources?.engine_diagnostic).toBeUndefined();

    const json = await readRunJson(w, "ctl-1");
    const entries = json.control_assertions.negative_controls;
    expect(entries).toHaveLength(16);
    expect(entries.filter((e) => e.status === "PASS")).toHaveLength(15);
    expect(entries.filter((e) => e.status !== "PASS")).toEqual([
      expect.objectContaining({ id: "R9", layer: "engine", status: "NOT_RUN", observed: null }),
    ]);
    // 모든 PASS 항목의 결합은 같은 하나다(변형 실행과 기준 입력의 관계가 한 값으로 추적된다)
    const bindings = new Set(
      entries.filter((e) => e.status === "PASS").map((e) => e.binding_sha256)
    );
    expect(bindings.size).toBe(1);
    expect([...bindings][0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("스텁 기록은 대조 참조 자격이 없다: 출처 조건과 R9 엔진 조건이 미충족으로 남고, 사전 검사 7개는 충족이다", async () => {
    const { w } = await chained();
    const json = await readRunJson(w, "ctl-1");
    expect(json.provenance).toBe("stub");
    expect(json.trust).toBe("SYNTHETIC");
    expect(json.reference_qualification.eligible).toBe(false);
    const req = Object.fromEntries(json.reference_qualification.requirements.map((r) => [r.id, r]));
    expect(req.PROVENANCE_REAL.satisfied).toBe(false);
    expect(req.NEGATIVE_PREFLIGHT_PASS.satisfied).toBe(true);
    expect(req.NEGATIVE_ENGINE_PASS.satisfied).toBe(false);
    expect(req.NEGATIVE_ENGINE_PASS.detail).toContain("R9:engine(NOT_RUN)");
    expect(req.NEGATIVE_BINDING_MATCH.satisfied).toBe(true);
  });

  it("preflight 성공은 engine 성공으로 승격되지 않는다: 사전 검사 7개가 PASS여도 엔진 층 항목은 자기 층의 실행 근거로만 PASS가 된다", async () => {
    // 변형된 엔진 층 사례의 서버만 못 뜨게 한다(기준 실행이 막히면 모든 항목이 NOT_RUN이 되어 이 시험의 뜻이 사라진다).
    const { w } = await chained({
      failServer: (key) => key.layer === "engine" && key.id !== "baseline",
    });
    const json = await readRunJson(w, "ctl-1");
    const entries = json.control_assertions.negative_controls;
    expect(entries.filter((e) => e.layer === "preflight" && e.status === "PASS")).toHaveLength(7);
    expect(entries.filter((e) => e.layer === "engine" && e.status === "PASS")).toEqual([]);
    expect(json.reference_qualification.eligible).toBe(false);
    const engine = json.reference_qualification.requirements.find(
      (r) => r.id === "NEGATIVE_ENGINE_PASS"
    );
    expect(engine?.satisfied).toBe(false);
  });

  it("명시하지 않으면 같은 증거 폴더에 기록이 있어도 읽지 않는다: 16개 모두 NOT_RUN이고 스위트 입력이 없다", async () => {
    const w = makeCliWorld();
    await runCli(w, argvNegativeControl());
    expect(await w.fs.exists(SUITE_RECORD)).toBe(true);
    const reads: string[] = [];
    const inner = w.deps.fs;
    w.deps.fs = { ...inner, readFile: async (p) => (reads.push(p), inner.readFile(p)) };
    w.out.length = 0;
    const code = await runCli(w, argvControlRun("ctl-2"));
    const run = runOut(w);
    expect(code).toBe(EXIT.ok);
    expect(run.negative_controls).toEqual({ given: false });
    expect(run.record?.resources?.negative_control_suite).toBeUndefined();
    expect(reads).not.toContain(SUITE_RECORD);
    const json = await readRunJson(w, "ctl-2");
    const entries = json.control_assertions.negative_controls;
    expect(entries).toHaveLength(16);
    expect(entries.every((e) => e.status === "NOT_RUN")).toBe(true);
  });

  it("정상 control 실행에는 음성 대조가 붙지 않는다: 서버는 그 실행 하나뿐이고 작업 공간도 만들지 않는다", async () => {
    const w = makeCliWorld();
    expect(await runCli(w, argvControlRun("ctl-3"))).toBe(EXIT.ok);
    expect(w.serverCalls).toHaveLength(1);
    expect(w.serverCalls[0].cwd).not.toContain(WORK_ROOT);
    expect(w.versionCalls).toHaveLength(1);
    expect(await w.fs.exists(WORK_ROOT)).toBe(false);
  });

  it("이번 실행의 결합과 다르면(휠 해시가 다름) 하네스가 스위트를 수락하지 않고 항목은 모두 NOT_RUN이다", async () => {
    const w = makeCliWorld();
    await runCli(w, argvNegativeControl());
    w.out.length = 0;
    w.hasher.forcedResult = { sha256: "d".repeat(64), sizeBytes: 31 };
    await runCli(w, argvControlRun("ctl-4", ["--negative-controls", SUITE_RECORD]));
    const run = runOut(w);
    expect(run.record?.resources?.negative_control_suite).toMatchObject({ accepted: false });
    expect(run.record?.resources?.negative_control_suite?.rejection).toMatch(
      /^(BINDING_MISMATCH|BINDING_UNAVAILABLE)$/
    );
    const json = await readRunJson(w, "ctl-4");
    expect(json.control_assertions.negative_controls.every((e) => e.status === "NOT_RUN")).toBe(
      true
    );
    expect(json.reference_qualification.eligible).toBe(false);
  });

  it("스위트 파일이 없으면 거절 사유를 남기고 실행은 계속된다(항목은 모두 NOT_RUN)", async () => {
    const w = makeCliWorld();
    const code = await runCli(
      w,
      argvControlRun("ctl-5", [
        "--negative-controls",
        `${EVIDENCE_ROOT}/none/negative-controls.json`,
      ])
    );
    const run = runOut(w);
    expect(code).toBe(EXIT.ok);
    expect(run.negative_controls.loaded).toMatchObject({ accepted: false });
    const json = await readRunJson(w, "ctl-5");
    expect(json.control_assertions.negative_controls.every((e) => e.status === "NOT_RUN")).toBe(
      true
    );
  });

  it("스위트 안의 사례 증거가 바뀌면(해시 불일치) 그 항목은 PASS로 이어지지 않는다", async () => {
    const w = makeCliWorld();
    await runCli(w, argvNegativeControl());
    // 읽는 쪽이 한 사례의 run.json을 다른 바이트로 보게 만든다. 저장된 항목 선언은 그대로여도 읽는 쪽은 증거에서 다시 도출한다.
    const path = `${EVIDENCE_ROOT}/${runIdOf("R6", "engine")}/run.json`;
    const inner = w.deps.fs;
    w.deps.fs = {
      ...inner,
      readFile: async (p) => {
        const bytes = await inner.readFile(p);
        return p === path ? new TextEncoder().encode(`${decoder.decode(bytes)}\n`) : bytes;
      },
    };
    w.out.length = 0;
    await runCli(w, argvControlRun("ctl-6", ["--negative-controls", SUITE_RECORD]));
    const json = await readRunJson(w, "ctl-6");
    const r6 = json.control_assertions.negative_controls.find(
      (e) => e.id === "R6" && e.layer === "engine"
    );
    expect(r6?.status).not.toBe("PASS");
  });

  it("target 모드에서는 쓸 수 없다: 사용법 오류 2이고 포트·잠금·읽기가 없다", async () => {
    const w = makeCliWorld();
    const argv = [
      "run",
      "--mode",
      "target",
      "--run-id",
      "t-1",
      "--rules-cache",
      `/cache/${SYNTHETIC_CACHE_DIR}`,
      "--evidence-root",
      EVIDENCE_ROOT,
      "--repo",
      "/r",
      "--target-sha",
      "a".repeat(40),
      "--scan-root",
      "/scan/t-1",
      "--negative-controls",
      SUITE_RECORD,
      FLAG,
      "--semgrep-bin",
      BIN,
    ];
    expect(await runCli(w, argv)).toBe(EXIT.usage);
    expect(w.err.join("")).toContain("--negative-controls");
    expect(w.portCalls).toEqual([]);
    expect(w.lock.calls).toEqual([]);
  });

  it("값이 비어 있거나 중복이면 사용법 오류다", async () => {
    for (const extra of [
      ["--negative-controls"],
      ["--negative-controls", ""],
      ["--negative-controls", "/a", "--negative-controls", "/b"],
    ]) {
      const w = makeCliWorld();
      expect(await runCli(w, argvControlRun("ctl-7", extra)), extra.join(" ")).toBe(EXIT.usage);
      expect(w.portCalls).toEqual([]);
    }
  });

  it("방지 장치를 통과하지 못하면 스위트 파일을 읽지도 않는다", async () => {
    const w = makeCliWorld({ env: {} });
    const reads: string[] = [];
    const inner = w.deps.fs;
    w.deps.fs = { ...inner, readFile: async (p) => (reads.push(p), inner.readFile(p)) };
    const code = await runCli(w, argvControlRun("ctl-8", ["--negative-controls", SUITE_RECORD]));
    expect(code).toBe(EXIT.notRun);
    expect(reads).toEqual([]);
    expect(w.portCalls).toEqual([]);
  });
});

describe("합성·진단 기록은 대조 참조가 될 수 없다(기존 읽기 어댑터의 거절 유지)", () => {
  it("스텁 control 실행 기록과 엔진 진단 기록 모두 거절된다", async () => {
    const w = makeCliWorld();
    await runCli(w, argvNegativeControl());
    await runCli(w, argvControlRun("ctl-9", ["--negative-controls", SUITE_RECORD]));
    const dataDir = w.deps.dataDir;
    const stubRun = await loadControlReference(
      w.deps.fs,
      `${EVIDENCE_ROOT}/ctl-9/run.json`,
      dataDir
    );
    expect(stubRun.reference).toBeNull();
    expect(stubRun.rejection).not.toBeNull();
    const diagnostic = await loadControlReference(
      w.deps.fs,
      `${EVIDENCE_ROOT}/${runIdOf("R1", "engine")}/run.json`,
      dataDir
    );
    expect(diagnostic.reference).toBeNull();
    expect(diagnostic.rejection).toContain("DIAGNOSTIC_RUN");
  });
});

describe("도움말", () => {
  it("negative-control 명령, 옵션, R9 충돌, 정상 실행에 붙지 않는다는 점, 종료 코드 기준을 알린다", async () => {
    const w = makeCliWorld();
    await runCli(w, ["--help"]);
    const help = w.out.join("");
    expect(help).toContain("negative-control");
    expect(help).toMatch(/--negative-controls[^\n]*\(control\)/);
    for (const word of ["--suite-id", "--work-root", "R9", "NOT_RUN", "자동"]) {
      expect(help, word).toContain(word);
    }
  });
});
