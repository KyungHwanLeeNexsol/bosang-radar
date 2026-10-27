import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { NegativeControlSuite } from "./negative-control";
import { buildControlWorld } from "./testing/control-world";
import {
  SUITE,
  caseOf,
  entryOf,
  makeRig,
  notRunOutcomes,
  statuses,
} from "./testing/negative-control-rig";
import type { FsPort } from "./types";

// 성공으로 보정하지 않는 경로들. 모든 실행은 메모리 파일 시스템과 스텁 엔진 위에서 돈다 — 실제 Semgrep의 동작이 아니다.

function fixtureBytes(fixture: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
}

const world = buildControlWorld(fixtureBytes);

/** FsPort 한 곳만 바꾸는 얕은 감싸기. */
function overrideFs(inner: FsPort, over: Partial<FsPort>): FsPort {
  return {
    readFile: (p) => inner.readFile(p),
    writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
    mkdirp: (p) => inner.mkdirp(p),
    listFilesRecursive: (r) => inner.listFilesRecursive(r),
    exists: (p) => inner.exists(p),
    physicalKey: (p) => inner.physicalKey(p),
    ...over,
  };
}

const allNotRun = (suite: NegativeControlSuite): boolean =>
  suite.entries.every((e) => e.status === "NOT_RUN");

describe("runNegativeControls — 기준 실행이 깨끗하지 않을 때", () => {
  it("휠 해시를 관측하지 못하면(실제 pin처럼 확인되지 않은 환경) 변형을 돌리지 않고 전부 NOT_RUN이다", async () => {
    const rig = makeRig(world, { inputs: { wheelSha256Observed: null } });
    const suite = await rig.run();
    expect(suite.baseline.clean).toBe(false);
    expect(suite.binding_sha256).toBeNull();
    expect(allNotRun(suite)).toBe(true);
    expect(rig.processKeys.map((k) => k.runId)).toEqual([`${SUITE}-baseline`]);
    const outcomes = notRunOutcomes(suite);
    expect(outcomes["R9:engine"]).toBe("BLOCKED_CONTRACT_CONFLICT"); // 충돌은 기준과 무관하게 남는다
    expect(
      Object.entries(outcomes)
        .filter(([key]) => key !== "R9:engine")
        .every(([, outcome]) => outcome === "BASELINE_NOT_CLEAN")
    ).toBe(true);
  });

  it("기준 실행이 엔진을 띄우지 못하면 깨끗하지 않다 — 사전 검사 층도 근거를 잃는다", async () => {
    const rig = makeRig(world, {
      wrapPort: (key, port) => {
        if (key.id === "baseline") port.failSpawnWith(new Error("시험: 띄울 수 없다"));
        return port;
      },
    });
    const suite = await rig.run();
    expect(suite.baseline.clean).toBe(false);
    expect(allNotRun(suite)).toBe(true);
  });
});

describe("runNegativeControls — 두 층은 서로 대신하지 못한다", () => {
  it("엔진이 뜨지 않은 사례는 NOT_RUN(ENGINE_NOT_STARTED)이고, 같은 id의 사전 검사 PASS가 엔진 항목을 PASS로 승격하지 않는다", async () => {
    const rig = makeRig(world, {
      wrapPort: (key, port) => {
        if (key.id === "R3" && key.layer === "engine") {
          port.failSpawnWith(new Error("시험: 띄울 수 없다"));
        }
        return port;
      },
    });
    const suite = await rig.run();
    expect(entryOf(suite, "R3", "preflight").status).toBe("PASS");
    expect(entryOf(suite, "R3", "engine")).toMatchObject({
      status: "NOT_RUN",
      observed: null,
      binding_sha256: null,
    });
    expect(caseOf(suite, "R3", "engine").outcome).toBe("ENGINE_NOT_STARTED");
    expect(entryOf(suite, "R8", "engine").status).toBe("PASS"); // 다른 사례는 영향이 없다
  });

  it("엔진 층의 PASS가 사전 검사 항목을 대신하지도 않는다: 사전 검사 층이 FAIL이어도 엔진 항목은 따로 정해진다", async () => {
    const rig = makeRig(world, {
      wrapFs: (m) =>
        overrideFs(m, {
          listFilesRecursive: async (root) =>
            (await m.listFilesRecursive(root)).filter(
              (f) => !(root.includes(`${SUITE}-r3-preflight`) && f.includes("zz-negative-control"))
            ),
        }),
    });
    const suite = await rig.run();
    expect(entryOf(suite, "R3", "preflight").status).toBe("FAIL");
    // R3 엔진은 사전 검사 사유가 상태를 가리는데 엔진 고유 관측의 계약이 없어 PASS를 만들 수 없다 — 사전 검사 층과 무관하게 NOT_RUN이다.
    expect(entryOf(suite, "R3", "engine").status).toBe("NOT_RUN");
    expect(caseOf(suite, "R3", "engine").outcome).toBe("ENGINE_OBSERVATION_UNCONFIRMED");
    // 엔진 PASS를 만들 수 있는 항목(R8)은 따로 정해진다.
    expect(entryOf(suite, "R8", "engine").status).toBe("PASS");
  });
});

describe("runNegativeControls — 진단은 정상 경로의 검증을 약화하지 않는다", () => {
  it("허용되지 않은 환경변수가 있으면 변형 사유가 있어도 엔진을 띄우지 않는다", async () => {
    const rig = makeRig(world, {
      resources: (key) =>
        key.id === "R1" && key.layer === "engine"
          ? { spawnEnv: { PATH: "/usr/bin", SEMGREP_NEGATIVE_CONTROL_FORBIDDEN: "1" } }
          : {},
    });
    const suite = await rig.run();
    expect(entryOf(suite, "R1", "engine").status).toBe("NOT_RUN");
    expect(caseOf(suite, "R1", "engine").outcome).toBe("ENGINE_NOT_STARTED");
    expect(rig.ports.get(`${SUITE}-r1-engine`)?.spawnCalls).toEqual([]);
    expect(entryOf(suite, "R1", "preflight").status).toBe("PASS"); // 같은 사례의 사전 검사 층은 영향이 없다
  });

  it("잠금을 쥐지 못했거나 다른 서버 프로세스를 배제하지 못하면 서버 트리를 만들지도 엔진을 띄우지도 않는다", async () => {
    for (const resources of [
      { lockHeld: false },
      { lockHeld: null },
      { foreignServerProcesses: 1 },
      { foreignServerProcesses: null },
    ]) {
      const rig = makeRig(world, {
        resources: (key) => (key.id === "R2" && key.layer === "engine" ? resources : {}),
      });
      const suite = await rig.run();
      expect(entryOf(suite, "R2", "engine").status, JSON.stringify(resources)).toBe("NOT_RUN");
      expect(rig.ports.get(`${SUITE}-r2-engine`)?.spawnCalls).toEqual([]);
      expect(await rig.memory.exists(`/work/${SUITE}-r2-engine/tree`)).toBe(false);
    }
  });
});

describe("runNegativeControls — 취소·실패·일부 완료", () => {
  it("도중에 취소하면 그 사례와 이후는 NOT_RUN(CANCELLED)이고 앞서 끝난 항목만 남는다(일부 완료)", async () => {
    const controller = new AbortController();
    const rig = makeRig(world, {
      inputs: { signal: controller.signal },
      onResources: (key) => {
        if (key.runId === `${SUITE}-r2-engine`) controller.abort();
      },
    });
    const suite = await rig.run();
    const s = statuses(suite);
    expect(s["R1:preflight"]).toBe("PASS");
    expect(s["R1:engine"]).toBe("NOT_RUN"); // 실행했지만 엔진 고유 관측의 계약이 없어 PASS가 아니다
    expect(notRunOutcomes(suite)["R1:engine"]).toBe("ENGINE_OBSERVATION_UNCONFIRMED");
    expect(s["R2:preflight"]).toBe("PASS");
    expect(s["R2:engine"]).toBe("NOT_RUN"); // 도중에 취소됐다 — 결과가 나왔더라도 쓰지 않는다
    expect(caseOf(suite, "R2", "engine").outcome).toBe("CANCELLED");
    for (const key of [
      "R3:preflight",
      "R3:engine",
      "R4:preflight",
      "R6:engine",
      "R8:engine",
      "R9:preflight",
    ]) {
      expect(s[key], key).toBe("NOT_RUN");
      expect(notRunOutcomes(suite)[key], key).toBe("CANCELLED");
    }
    expect(rig.processKeys.map((k) => k.runId)).not.toContain(`${SUITE}-r3-preflight`);
  });

  it("이미 취소된 상태로 시작하면 아무 사례도 돌지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const rig = makeRig(world, { inputs: { signal: controller.signal } });
    const suite = await rig.run();
    expect(allNotRun(suite)).toBe(true);
    expect(rig.resourceKeys).toEqual([]);
  });

  it("실행 실패(자원을 쥐다 던짐)는 그 사례만 NOT_RUN(RUN_FAILED)이고 나머지는 이어진다", async () => {
    const rig = makeRig(world, {
      onResources: (key) => {
        if (key.runId === `${SUITE}-r4-preflight`) throw new Error("시험: 자원을 쥐지 못했다");
      },
    });
    const suite = await rig.run();
    expect(entryOf(suite, "R4", "preflight").status).toBe("NOT_RUN");
    expect(caseOf(suite, "R4", "preflight").outcome).toBe("RUN_FAILED");
    expect(entryOf(suite, "R6", "engine").status).toBe("PASS");
    expect(entryOf(suite, "R5", "preflight").status).toBe("PASS");
  });

  it("작업 공간을 만들지 못한 사례는 NOT_RUN(WORKSPACE_FAILED)이고 하네스를 돌리지 않는다", async () => {
    const rig = makeRig(world, {
      wrapFs: (m) =>
        overrideFs(m, {
          writeFileExclusive: async (p, d) => {
            if (p.startsWith(`/work/${SUITE}-r5-preflight/`)) throw new Error("시험: 쓸 수 없다");
            return m.writeFileExclusive(p, d);
          },
        }),
    });
    const suite = await rig.run();
    expect(entryOf(suite, "R5", "preflight").status).toBe("NOT_RUN");
    expect(caseOf(suite, "R5", "preflight").outcome).toBe("WORKSPACE_FAILED");
    expect(rig.resourceKeys.map((k) => k.runId)).not.toContain(`${SUITE}-r5-preflight`);
    expect(entryOf(suite, "R6", "engine").status).toBe("PASS");
  });

  it("작업 공간이 증거 폴더나 원본(규칙 캐시·대조 예제·데이터·하네스)과 겹치면 아무것도 쓰지 않고 전부 NOT_RUN이다", async () => {
    for (const workRoot of [
      "/evidence/work",
      "/evidence",
      "/cache/semgrep-rules/work",
      "/cache",
      "/repo/work",
      "/data/work",
      "/harness/work",
    ]) {
      const rig = makeRig(world, { inputs: { workRoot } });
      const suite = await rig.run();
      expect(allNotRun(suite), workRoot).toBe(true);
      expect(rig.writes, workRoot).toEqual([]);
      expect(rig.resourceKeys, workRoot).toEqual([]);
    }
  });
});

describe("runNegativeControls — 결합·출처가 다른 실행은 쓰지 않는다", () => {
  it("실행 도중 하네스 구현이 바뀌어 결합이 달라진 사례는 BINDING_DRIFT다", async () => {
    let drift = false;
    const rig = makeRig(world, {
      onResources: (key) => {
        drift = key.runId === `${SUITE}-r3-preflight`;
      },
      wrapFs: (m) =>
        overrideFs(m, {
          readFile: async (p) =>
            drift && p === "/harness/evaluate.ts"
              ? new TextEncoder().encode("// 바뀐 하네스 구현\n")
              : m.readFile(p),
        }),
    });
    const suite = await rig.run();
    expect(entryOf(suite, "R3", "preflight")).toMatchObject({
      status: "NOT_RUN",
      binding_sha256: null,
    });
    expect(caseOf(suite, "R3", "preflight").outcome).toBe("BINDING_DRIFT");
    expect(entryOf(suite, "R6", "engine").status).toBe("PASS");
  });

  it("출처가 다른 사례(기준은 stub인데 real이라고 주장)는 같은 결합으로 묶지 않는다", async () => {
    const rig = makeRig(world, {
      wrapPort: (key, port) =>
        key.id === "R6" && key.layer === "engine"
          ? { provenance: "real", spawn: (spec) => port.spawn(spec) }
          : port,
    });
    const suite = await rig.run();
    expect(entryOf(suite, "R6", "engine").status).toBe("NOT_RUN");
    expect(caseOf(suite, "R6", "engine").outcome).toBe("BINDING_DRIFT");
  });
});

describe("runNegativeControls — 기대와 다른 결과는 FAIL로 드러난다", () => {
  it("[가정한 엔진 반응] 변형이 사전 검사에 닿지 않으면(파일이 보이지 않음) 사전 검사 층은 FAIL이다 — 막아야 할 것을 못 막았다", async () => {
    const rig = makeRig(world, {
      wrapFs: (m) =>
        overrideFs(m, {
          listFilesRecursive: async (root) =>
            (await m.listFilesRecursive(root)).filter(
              (f) => !(root.includes(`${SUITE}-r3-preflight`) && f.includes("zz-negative-control"))
            ),
        }),
    });
    const suite = await rig.run();
    const entry = entryOf(suite, "R3", "preflight");
    expect(entry.status).toBe("FAIL");
    expect(entry.observed).not.toBe("MANIFEST_MISMATCH");
    expect(entry.observed).not.toBeNull();
    // 사전 검사 층은 띄울 수 없는 포트로 돌아 실제로는 엔진이 뜨지 않았다. 띄우려 한 시도는 있었다.
    expect(rig.ports.get(`${SUITE}-r3-preflight`)?.spawnCalls).toEqual([]);
    expect(entryOf(suite, "R8", "engine").status).toBe("PASS");
  });

  it("[가정한 엔진 반응] 엔진 층에서 변형이 판정에 닿지 않으면(COMPLETE) FAIL이다 — observed는 기대가 아니라 COMPLETE다 (R6: 엔진이 없는 규칙 경로에 반응하지 않음)", async () => {
    const noReaction = () => undefined; // 기준(깨끗한) 반응 — 엔진이 변형을 알아채지 못한다
    const suite = await makeRig(world, { engine: noReaction }).run();
    expect(entryOf(suite, "R6", "engine")).toMatchObject({
      expected: "RULES_NOT_LOADED",
      observed: "COMPLETE",
      status: "FAIL",
    });
  });
});
