import { describe, expect, it } from "vitest";
import {
  argvRoleOf,
  foreignObservationConflict,
  observeForeignServers,
  pathAnchorsOf,
  programIdOf,
  runForeignProcessObservation,
} from "./process-observation";
import {
  BIN,
  OWN_PID,
  SyntheticLister,
  TREE,
  aliasFs,
  baseRows,
  listerOf,
  ownRow,
  parentRow,
  plainRow,
  row,
  serverRow,
  snapshotOf,
  versionRow,
} from "./testing/synthetic-processes";
import type { ForeignServerObservationSummary, ProcessListFailure, ProcessRow } from "./types";

// 이 파일의 모든 목록은 **합성 자료**다. 실제 운영체제도 실제 Semgrep도 읽지 않으므로, 통과는 판정 로직이 합성 입력에서 의도대로
// 동작한다는 뜻일 뿐 실제 Semgrep 프로세스 식별의 증거가 아니다. 실제 운영체제를 읽는 시험은 process-list-node.integration.test.ts에 있다.

const CONTEXT = { ownPid: OWN_PID, serverTree: TREE, semgrepBin: BIN };

async function observe(
  rows: readonly ProcessRow[],
  fs: { physicalKey(path: string): Promise<string> } = aliasFs(),
  snapshotOptions: { parentLinkNeedsStartTime?: boolean } = {}
) {
  return observeForeignServers({ fs }, snapshotOf(rows, snapshotOptions), CONTEXT);
}

// ── 순수 도우미 ──────────────────────────────────────────────────

describe("programIdOf — 프로그램 이름의 비교형", () => {
  it("경로·확장자·대소문자·-script를 떼어 같은 이름으로 모은다", () => {
    for (const name of [
      "semgrep",
      "/usr/local/bin/semgrep",
      "C:\\Python\\Scripts\\semgrep.exe",
      "C:\\Python\\Scripts\\SEMGREP.EXE",
      "semgrep-script.py",
      "/x/semgrep.cmd",
    ]) {
      expect(programIdOf(name), name).toBe("semgrep");
    }
    expect(programIdOf("/opt/pysemgrep")).toBe("pysemgrep");
    expect(programIdOf("semgrep-core.exe")).toBe("semgrep-core");
  });

  it("비슷해 보이는 이름은 같은 이름이 아니다", () => {
    for (const name of ["semgrep-lsp", "mysemgrep", "semgrepx", "semgrep.txt", "cli.ts"]) {
      expect(programIdOf(name), name).not.toBe("semgrep");
    }
  });
});

describe("argvRoleOf — 인자 배열로 역할을 가른다(요소 단위)", () => {
  it("lsp가 있으면 SERVER, --version만 있으면 VERSION_CHECK, 그 밖은 OTHER, 프로그램이 없으면 NONE", () => {
    expect(argvRoleOf([BIN, "lsp", "--debug"]).role).toBe("SERVER");
    expect(argvRoleOf([BIN, "--debug", "lsp"]).role).toBe("SERVER");
    expect(argvRoleOf([BIN, "-lsp"]).role).toBe("SERVER");
    expect(argvRoleOf([BIN, "--version"]).role).toBe("VERSION_CHECK");
    expect(argvRoleOf([BIN, "scan", "--config", "p/ci"]).role).toBe("OTHER");
    expect(argvRoleOf([BIN]).role).toBe("OTHER");
    expect(argvRoleOf(["python3", "-m", "http.server"]).role).toBe("NONE");
    expect(argvRoleOf([]).role).toBe("NONE");
  });

  it("실행기가 감싼 경우도 앞쪽 몇 칸 안이면 찾는다(python 스크립트·-m 모듈·uv run)", () => {
    expect(argvRoleOf(["python3", "/venv/bin/semgrep", "lsp"]).role).toBe("SERVER");
    expect(argvRoleOf(["python3", "-m", "semgrep", "lsp"]).role).toBe("SERVER");
    expect(argvRoleOf(["python3", "-m", "semgrep.cli", "lsp"]).role).toBe("SERVER");
    expect(argvRoleOf(["uv", "run", "semgrep", "lsp"]).role).toBe("SERVER");
    expect(
      argvRoleOf(["C:\\Py\\python.exe", "C:\\Py\\Scripts\\semgrep-script.py", "--version"]).role
    ).toBe("VERSION_CHECK");
  });

  it("역할 토큰은 프로그램 **뒤**에서만 본다 — 앞에 있는 lsp나 멀리 있는 semgrep은 서버가 아니다", () => {
    expect(argvRoleOf(["lsp", BIN]).role).toBe("OTHER");
    // 실행기 옵션이나 공백이 든 경로가 프로그램 이름을 뒤로 밀어도 놓치지 않는다(독립 검토 M1).
    expect(argvRoleOf(["a", "b", "c", "d", BIN, "lsp"]).role).toBe("SERVER");
    expect(argvRoleOf(["python3", "-W", "ignore", "-m", "semgrep", "lsp"]).role).toBe("SERVER");
    expect(argvRoleOf(["python", "-X", "utf8", "-u", "-m", "semgrep", "lsp"]).role).toBe("SERVER");
    expect(argvRoleOf(["uv", "run", "--python", "3.12", "semgrep", "lsp"]).role).toBe("SERVER");
    expect(argvRoleOf(["C:\\Program", "Files\\Python\\Scripts\\semgrep.exe", "lsp"]).role).toBe(
      "SERVER"
    );
  });

  it("lsp와 --version이 함께 있으면 서버로 본다(보수적)", () => {
    expect(argvRoleOf([BIN, "--version", "lsp"]).role).toBe("SERVER");
  });
});

describe("pathAnchorsOf — 인자 속 경로 단서", () => {
  it("절대·상대·--옵션=값의 값을 뽑고 URL·단어·옵션은 거른다", () => {
    const args = [
      BIN,
      "lsp",
      "--config",
      "/rules/dir",
      "--workspace=/w/ws",
      "..\\up",
      "p/ci",
      "auto",
      "https://example.invalid/x/y",
      "--debug",
      "C:\\work\\tree",
      ".",
    ];
    expect(pathAnchorsOf(args, 0)).toEqual([
      { value: "/rules/dir", absolute: true },
      { value: "/w/ws", absolute: true },
      { value: "..\\up", absolute: false },
      { value: "p/ci", absolute: false },
      { value: "C:\\work\\tree", absolute: true },
      { value: ".", absolute: false },
    ]);
  });

  it("프로그램 앞의 요소는 보지 않는다", () => {
    expect(pathAnchorsOf(["/usr/bin/python3", "/venv/bin/semgrep", "lsp"], 1)).toEqual([]);
  });
});

// ── 후보 없음 ────────────────────────────────────────────────────

describe("observeForeignServers — 후보 없음", () => {
  it("자기 자신과 조상뿐이면 0으로 확정된다", async () => {
    const r = await observe(baseRows());
    expect(r).toMatchObject({ status: "OBSERVED", foreignServerProcesses: 0, failure: null });
    expect(r.counts).toMatchObject({ own_process: 1, own_ancestors: 1, servers_same_tree: 0 });
    expect(r.countIsLowerBound).toBe(false);
  });

  it("관계없는 프로세스가 많아도 0이다 — 인자를 읽었고 Semgrep 단서가 없다", async () => {
    const rows = [
      ...baseRows(),
      plainRow(501),
      plainRow(502, "python3", { args: ["python3", "-m", "http.server"] }),
    ];
    const r = await observe(rows);
    expect(r.foreignServerProcesses).toBe(0);
    expect(r.rows).toBe(4);
  });

  it("인자를 읽지 못했어도 Semgrep·실행기 이름이 아니면 후보가 아니다(시스템 프로세스)", async () => {
    const rows = [
      ...baseRows(),
      row({ pid: 4, name: "System", args: null }),
      row({ pid: 188, name: "Secure System", args: null }),
    ];
    const r = await observe(rows);
    expect(r.foreignServerProcesses).toBe(0);
    expect(r.counts.unreadable_unrelated).toBe(2);
  });
});

// ── 같은 트리 / 다른 트리 / 경로 별칭 ─────────────────────────────

describe("observeForeignServers — 같은 트리", () => {
  it("작업 폴더가 서버 트리이거나 그 안이면 센다", async () => {
    for (const cwd of [TREE, `${TREE}/src`, `${TREE}/a/b/c`]) {
      const r = await observe([...baseRows(), serverRow(601, { cwd })]);
      expect(r, cwd).toMatchObject({ status: "OBSERVED", foreignServerProcesses: 1 });
      expect(r.counts.servers_same_tree).toBe(1);
    }
  });

  it("여러 개면 건수가 그만큼이다", async () => {
    const r = await observe([
      ...baseRows(),
      serverRow(601, { cwd: TREE }),
      serverRow(602, { cwd: `${TREE}/x` }),
      serverRow(603, { cwd: "/elsewhere" }),
    ]);
    expect(r.foreignServerProcesses).toBe(2);
    // 실행 위치가 다른 세 번째 서버는 다른 트리라는 증거가 없다 — 판별 불가로 남아 하한 표시가 붙는다.
    expect(r.counts).toMatchObject({ servers_same_tree: 2, servers_undetermined: 1 });
    expect(r.countIsLowerBound).toBe(true);
  });

  it("인자의 절대 경로가 트리 안이면 작업 폴더가 다른 곳이어도 센다", async () => {
    const r = await observe([
      ...baseRows(),
      serverRow(601, { cwd: "/elsewhere", extraArgs: ["--config", `${TREE}/rules`] }),
    ]);
    expect(r.foreignServerProcesses).toBe(1);
  });

  it("상대 경로 인자는 작업 폴더 기준으로 풀어 비교한다", async () => {
    const same = await observe([
      ...baseRows(),
      serverRow(601, { cwd: "/work/other", extraArgs: ["../scan-tree"] }),
    ]);
    expect(same.foreignServerProcesses).toBe(1);
    const elsewhere = await observe([
      ...baseRows(),
      serverRow(601, { cwd: "/work/other", extraArgs: ["../another"] }),
    ]);
    expect(elsewhere).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
    expect(elsewhere.undeterminedReasons).toEqual({ TREE_BINDING_UNOBSERVABLE: 1 });
  });

  it("같은 트리 서버가 있고 다른 후보를 판별하지 못했으면 건수와 함께 하한 표시가 붙는다", async () => {
    const r = await observe([
      ...baseRows(),
      serverRow(601, { cwd: TREE }),
      serverRow(602, { cwd: null }),
    ]);
    expect(r).toMatchObject({
      status: "OBSERVED",
      foreignServerProcesses: 1,
      countIsLowerBound: true,
    });
    expect(r.undeterminedReasons).toEqual({ CWD_UNAVAILABLE: 1 });
  });
});

describe("observeForeignServers — 단서가 트리와 겹치지 않는 서버는 '다른 트리'가 아니라 판별 불가다", () => {
  // LSP 서버의 작업 폴더는 stdio의 initialize로 전달되어 프로세스 목록에서 보이지 않는다(이 하네스도 서버를 트리가 아닌 규칙 캐시의 부모에서 띄운다).
  // 그래서 실행 위치·인자 경로가 트리와 겹치지 않는다는 것은 그 서버가 다른 트리를 스캔한다는 증거가 아니고, 건수 0의 근거가 될 수 없다(독립 검토 M2).
  it("작업 폴더를 알고 모든 단서가 트리와 겹치지 않아도 0으로 확정하지 않는다", async () => {
    const r = await observe([...baseRows(), serverRow(601, { cwd: "/elsewhere/project" })]);
    expect(r).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
    expect(r.undeterminedReasons).toEqual({ TREE_BINDING_UNOBSERVABLE: 1 });
    expect(r.counts).toMatchObject({ servers_undetermined: 1, servers_same_tree: 0 });
  });

  it("이름만 비슷한 옆 폴더도 같은 트리로 세지 않지만, 0으로 확정하지도 않는다", async () => {
    for (const cwd of [`${TREE}-evidence`, `${TREE}2`, "/work/scan"]) {
      const r = await observe([...baseRows(), serverRow(601, { cwd })]);
      expect(r.counts.servers_same_tree, cwd).toBe(0);
      expect(r.foreignServerProcesses, cwd).toBeNull();
      expect(r.undeterminedReasons, cwd).toEqual({ TREE_BINDING_UNOBSERVABLE: 1 });
    }
  });

  it("작업 폴더가 /tmp이고 작업 공간은 stdio로 받는 서버(편집기가 띄운 서버의 모양)도 0이 아니다", async () => {
    const r = await observe([
      ...baseRows(),
      serverRow(601, { cwd: "/tmp", args: ["semgrep", "lsp"] }),
    ]);
    expect(r.foreignServerProcesses).toBeNull();
  });
});

describe("observeForeignServers — 경로 별칭(링크·`..`)", () => {
  it("별칭으로 적힌 작업 폴더가 실제로 서버 트리면 같은 트리다", async () => {
    const fs = aliasFs({ "/home/u/link-to-tree": TREE });
    const r = await observe(
      [...baseRows(), serverRow(601, { cwd: "/home/u/link-to-tree/src" })],
      fs
    );
    expect(r.foreignServerProcesses).toBe(1);
  });

  it("서버 트리 자신이 별칭이어도 실제 위치로 비교한다", async () => {
    const fs = aliasFs({ [TREE]: "/real/storage/tree" });
    const real = await observe([...baseRows(), serverRow(601, { cwd: "/real/storage/tree" })], fs);
    expect(real.foreignServerProcesses).toBe(1); // 실제 저장 위치로 적은 작업 폴더
    const viaAlias = await observe([...baseRows(), serverRow(601, { cwd: TREE })], fs);
    expect(viaAlias.foreignServerProcesses).toBe(1); // 별칭 이름으로 적은 작업 폴더
    const elsewhere = await observe(
      [...baseRows(), serverRow(601, { cwd: "/real/storage/other" })],
      fs
    );
    expect(elsewhere.counts.servers_same_tree).toBe(0); // 같은 트리로 세지 않는다(그렇다고 0으로 확정하지도 않는다)
    expect(elsewhere.foreignServerProcesses).toBeNull();
  });

  it("문자열로는 트리 안인데 실제로는 밖을 가리키는 별칭은 같은 트리로 세지 않는다", async () => {
    const fs = aliasFs({ [`${TREE}/linked`]: "/outside/target" });
    const r = await observe([...baseRows(), serverRow(601, { cwd: `${TREE}/linked/sub` })], fs);
    expect(r.counts.servers_same_tree).toBe(0);
    expect(r).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
  });

  it("`..`를 거쳐 돌아오는 작업 폴더·인자도 실제 위치로 비교한다", async () => {
    const r = await observe([
      ...baseRows(),
      serverRow(601, { cwd: "/work/elsewhere/../scan-tree/sub" }),
    ]);
    expect(r.foreignServerProcesses).toBe(1);
  });

  it("문자열로는 트리와 달라 보이는 별칭 인자도 실제로 트리 안이면 센다", async () => {
    const fs = aliasFs({ "/mnt/shortcut": `${TREE}/rules` });
    const r = await observe(
      [...baseRows(), serverRow(601, { cwd: "/elsewhere", extraArgs: ["--config=/mnt/shortcut"] })],
      fs
    );
    expect(r.foreignServerProcesses).toBe(1);
  });
});

// ── 관계를 확인하지 못함 ─────────────────────────────────────────

describe("observeForeignServers — 트리 관계를 확인하지 못하면 0으로 보정하지 않는다", () => {
  it("작업 폴더를 알 수 없는 서버(Windows 등)는 미확인이다", async () => {
    const r = await observe([...baseRows(), serverRow(601, { cwd: null })]);
    expect(r).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
    expect(r.undeterminedReasons).toEqual({ CWD_UNAVAILABLE: 1 });
    expect(r.counts.servers_undetermined).toBe(1);
  });

  it("작업 폴더가 서버 트리를 감싸는 폴더면 미확인이다(스캔 여부가 보이지 않는다)", async () => {
    for (const cwd of ["/work", "/", "/work/"]) {
      const r = await observe([...baseRows(), serverRow(601, { cwd })]);
      expect(r, cwd).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
      expect(r.undeterminedReasons, cwd).toEqual({ ANCHOR_ENCLOSES_TREE: 1 });
    }
  });

  it("풀 수 없는 경로 단서가 있으면 다른 단서가 겹치지 않아도 미확인이다", async () => {
    const r = await observe(
      [...baseRows(), serverRow(601, { cwd: "/elsewhere", extraArgs: ["--config=/gone/link"] })],
      aliasFs({}, ["/gone/link"])
    );
    expect(r).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
    expect(r.undeterminedReasons).toEqual({ ANCHOR_UNRESOLVABLE: 1 });
  });

  it("작업 폴더를 모르면 상대 경로 인자는 풀 수 없다 — 작업 폴더 미확인이 우선 사유다", async () => {
    const r = await observe([...baseRows(), serverRow(601, { cwd: null, extraArgs: ["rules/x"] })]);
    expect(r.foreignServerProcesses).toBeNull();
    expect(r.undeterminedReasons).toEqual({ CWD_UNAVAILABLE: 1 });
  });

  it("작업 폴더를 알 수 없어도 인자의 경로가 트리 안이면 같은 트리로 확정된다", async () => {
    const r = await observe([
      ...baseRows(),
      serverRow(601, { cwd: null, extraArgs: [`--config=${TREE}/rules`] }),
    ]);
    expect(r).toMatchObject({ status: "OBSERVED", foreignServerProcesses: 1 });
  });

  it("서버 트리 자체를 풀 수 없으면 관측 실패다", async () => {
    const r = await observe([...baseRows(), serverRow(601)], aliasFs({}, [TREE]));
    expect(r).toMatchObject({
      status: "FAILED",
      failure: "TREE_UNRESOLVABLE",
      foreignServerProcesses: null,
    });
  });
});

// ── 역할 구분: 자기 자신 / 버전 확인 / 서버 / 검사 ────────────────

describe("observeForeignServers — 역할 구분", () => {
  it("버전 확인(--version) 프로세스는 서버가 아니다 — 세지 않고 요약에만 센다", async () => {
    const r = await observe([...baseRows(), versionRow(701, { cwd: TREE }), versionRow(702)]);
    expect(r).toMatchObject({ status: "OBSERVED", foreignServerProcesses: 0 });
    expect(r.counts.version_check).toBe(2);
  });

  it("같은 실행 파일의 다른 하위 명령(scan 등)은 LSP 서버가 아니다", async () => {
    const scan = row({
      pid: 703,
      ppid: 1,
      name: "semgrep",
      executable: BIN,
      args: [BIN, "scan", TREE],
      cwd: TREE,
    });
    const r = await observe([...baseRows(), scan]);
    expect(r).toMatchObject({ status: "OBSERVED", foreignServerProcesses: 0 });
    expect(r.counts.other_semgrep).toBe(1);
  });

  it("검사 프로그램 자신은 인자에 semgrep이 있어도 다른 서버가 아니다", async () => {
    // 자신의 인자가 우연히 서버처럼 보여도(예: 래퍼가 lsp를 넘김) 자기 PID는 제외한다.
    const self = ownRow({ args: [BIN, "lsp"], cwd: TREE });
    const r = await observe([self, parentRow()]);
    expect(r).toMatchObject({ status: "OBSERVED", foreignServerProcesses: 0 });
    expect(r.counts.own_process).toBe(1);
  });

  it("조상(셸)과 자손(조회 자식·남은 버전 확인)은 다른 서버가 아니다", async () => {
    const child = serverRow(801, { ppid: OWN_PID, cwd: TREE });
    const grandchild = versionRow(802, { ppid: 801 });
    const grandParent = row({ pid: 1, ppid: 0, name: "init", args: ["init"] });
    const r = await observe([...baseRows(), grandParent, child, grandchild]);
    expect(r.foreignServerProcesses).toBe(0);
    expect(r.counts).toMatchObject({ own_ancestors: 2, own_descendants: 2, servers_same_tree: 0 });
  });

  it("부모가 하네스인 서버가 아니라 이름만 닮은 다른 서버는 센다(자손 판정이 PID 하나로 새지 않는다)", async () => {
    const r = await observe([...baseRows(), serverRow(805, { ppid: 777, cwd: TREE })]);
    expect(r.foreignServerProcesses).toBe(1);
  });

  it("순환·끊어진 부모 연결에서도 멈춘다", async () => {
    const a = serverRow(901, { ppid: 902, cwd: TREE });
    const b = serverRow(902, { ppid: 901, cwd: "/elsewhere" });
    const r = await observe([...baseRows(), a, b]);
    expect(r.foreignServerProcesses).toBe(1);
  });
});

describe("observeForeignServers — Windows의 부모 PID 재사용", () => {
  const OWN_START = 2_000_000;

  it("부모 시작 시각이 자식보다 늦은 연결은 부모-자식이 아니다 — 옛 서버가 자손으로 가려지지 않는다", async () => {
    // 서버(601)의 부모 PID가 하네스 PID와 같지만 서버가 하네스보다 먼저 시작했다: 부모 번호가 재사용된 것이다.
    const server = serverRow(601, { ppid: OWN_PID, startTime: OWN_START - 1000, cwd: TREE });
    const r = await observe(
      [ownRow({ startTime: OWN_START }), parentRow({ startTime: 1000 }), server],
      aliasFs(),
      { parentLinkNeedsStartTime: true }
    );
    expect(r.foreignServerProcesses).toBe(1);
    expect(r.counts.own_descendants).toBe(0);
  });

  it("부모가 먼저 시작했으면 자손이다", async () => {
    const child = serverRow(602, { ppid: OWN_PID, startTime: OWN_START + 50, cwd: TREE });
    const r = await observe(
      [ownRow({ startTime: OWN_START }), parentRow({ startTime: 1000 }), child],
      aliasFs(),
      { parentLinkNeedsStartTime: true }
    );
    expect(r.foreignServerProcesses).toBe(0);
    expect(r.counts.own_descendants).toBe(1);
  });

  it("시작 시각을 모르면 연결을 믿지 않는다 — 자손·조상으로 가리지 않는다", async () => {
    const child = serverRow(603, { ppid: OWN_PID, startTime: null, cwd: TREE });
    const r = await observe(
      [ownRow({ startTime: null }), parentRow({ startTime: null }), child],
      aliasFs(),
      {
        parentLinkNeedsStartTime: true,
      }
    );
    expect(r.foreignServerProcesses).toBe(1);
    expect(r.counts).toMatchObject({ own_descendants: 0, own_ancestors: 0 });
  });

  it("재사용된 조상 번호도 시작 시각이 어긋나면 조상이 아니다", async () => {
    // 하네스의 부모(100)가 사실은 하네스보다 나중에 시작했다 — 진짜 부모는 이미 끝났고 번호만 재사용됐다.
    const imposter = serverRow(100, { ppid: 1, startTime: OWN_START + 10, cwd: TREE });
    const r = await observe([ownRow({ startTime: OWN_START }), imposter], aliasFs(), {
      parentLinkNeedsStartTime: true,
    });
    expect(r.foreignServerProcesses).toBe(1);
    expect(r.counts.own_ancestors).toBe(0);
  });
});

// ── 이름 한 가지로는 확정하지 않는다 ─────────────────────────────

describe("observeForeignServers — 이름 단서만으로 '없음'을 확정하지 않는다", () => {
  it("이미지 이름이 semgrep인데 인자를 읽지 못했다 → 미확인", async () => {
    const r = await observe([...baseRows(), row({ pid: 301, name: "semgrep", args: null })]);
    expect(r).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
    expect(r.undeterminedReasons).toEqual({ ARGS_UNAVAILABLE: 1 });
    expect(r.counts.role_undetermined).toBe(1);
  });

  it("python 계열 실행기인데 인자를 읽지 못했다 → 미확인(Semgrep은 파이썬 응용이다)", async () => {
    for (const name of ["python3", "python3.12", "pythonw.exe", "pypy3", "py", "uv", "pipx"]) {
      const r = await observe([...baseRows(), row({ pid: 302, name, args: null })]);
      expect(r.foreignServerProcesses, name).toBeNull();
    }
  });

  it("실행 파일이 --semgrep-bin과 같은 이름인데 인자가 그 이름을 보이지 않는다 → 역할 불명, 미확인", async () => {
    const renamed = row({
      pid: 303,
      name: "worker",
      executable: "/opt/semgrep/bin/semgrep",
      args: ["worker", "--serve"],
    });
    const r = await observe([...baseRows(), renamed]);
    expect(r).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
    expect(r.undeterminedReasons).toEqual({ ROLE_UNCLEAR: 1 });
  });

  it("이미지 이름이 semgrep이지만 인자는 다른 프로그램이다(프로세스 제목이 바뀜) → 역할 불명, 미확인", async () => {
    const r = await observe([
      ...baseRows(),
      row({ pid: 304, name: "semgrep", args: ["/usr/bin/other", "--serve"] }),
    ]);
    expect(r.foreignServerProcesses).toBeNull();
    expect(r.undeterminedReasons).toEqual({ ROLE_UNCLEAR: 1 });
  });

  it("[알려진 한계] 이름도 인자도 Semgrep과 닮지 않게 바꾼 프로그램은 식별하지 못한다 — 그래서 증거에 UNVERIFIED로 남긴다", async () => {
    const disguised = row({
      pid: 305,
      name: "tool",
      executable: "/opt/tool",
      args: ["/opt/tool", "serve"],
      cwd: TREE,
    });
    const r = await observe([...baseRows(), disguised]);
    expect(r.foreignServerProcesses).toBe(0);
    const summary = (
      await runForeignProcessObservation({
        lister: listerOf([...baseRows(), disguised]),
        fs: aliasFs(),
        lockHeld: true,
        context: CONTEXT,
      })
    ).summary;
    expect(summary.not_established.semgrep_server_identification).toBe("UNVERIFIED");
  });
});

// ── 불완전·사라짐 ────────────────────────────────────────────────

describe("observeForeignServers — 후보 정보가 불완전하거나 도중에 사라짐", () => {
  it("서버 후보가 읽는 도중 사라졌다 → 미확인(작업 폴더를 끝까지 읽지 못했다)", async () => {
    const r = await observe([...baseRows(), serverRow(401, { cwd: TREE, vanished: true })]);
    expect(r).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
    expect(r.undeterminedReasons).toEqual({ CANDIDATE_VANISHED: 1 });
  });

  it("후보로 보이던 이름(python·semgrep)의 프로세스가 인자를 읽기 전에 사라졌다 → 미확인", async () => {
    for (const name of ["semgrep", "python3"]) {
      const r = await observe([...baseRows(), row({ pid: 402, name, args: null, vanished: true })]);
      expect(r.foreignServerProcesses, name).toBeNull();
      expect(r.undeterminedReasons, name).toEqual({ CANDIDATE_VANISHED: 1 });
    }
  });

  it("Semgrep 단서를 보이던 프로세스가 사라졌다 → 미확인(인자는 읽었으나 역할 불명)", async () => {
    const r = await observe([
      ...baseRows(),
      row({ pid: 403, name: "semgrep", args: ["other"], vanished: true }),
    ]);
    expect(r.undeterminedReasons).toEqual({ CANDIDATE_VANISHED: 1 });
  });

  it("아무것도 읽기 전에 사라진 프로세스는 식별할 수 없고 지금은 없다 — 건수만 남기고 막지 않는다", async () => {
    const r = await observe([...baseRows(), row({ pid: 404, vanished: true })]);
    expect(r).toMatchObject({ status: "OBSERVED", foreignServerProcesses: 0 });
    expect(r.counts.vanished_not_candidate).toBe(1);
  });

  it("이름은 읽었지만 후보가 아닌 프로세스가 사라졌다 → 막지 않는다", async () => {
    const r = await observe([
      ...baseRows(),
      row({ pid: 405, name: "sleep", args: null, vanished: true }),
    ]);
    expect(r.foreignServerProcesses).toBe(0);
    expect(r.counts.vanished_not_candidate).toBe(1);
  });

  it("vanished인 버전 확인·기타 Semgrep 프로세스는 이미 분류됐으므로 막지 않는다", async () => {
    const r = await observe([...baseRows(), versionRow(406, { vanished: true })]);
    expect(r.foreignServerProcesses).toBe(0);
  });
});

describe("observeForeignServers — 독립 검토가 재현한 구멍(B1·M1·minor)", () => {
  it("[B1] 살아 있는데 이름·실행 파일·인자를 모두 읽지 못한 프로세스는 무관하다고 보지 않는다(권한·읽기 오류)", async () => {
    // /proc/<pid>의 읽기가 모두 막힌 서버(hidepid·EIO)는 모든 칸이 null이고 vanished도 아니다.
    const hidden = row({ pid: 900, ppid: 1, name: null, executable: null, args: null, cwd: null });
    const r = await observe([...baseRows(), hidden]);
    expect(r).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
    expect(r.undeterminedReasons).toEqual({ ROW_UNREADABLE: 1 });
    expect(r.counts.unreadable_unrelated).toBe(0);
  });

  it("[B1] 이름만 읽은 프로세스는 이름이 Semgrep·실행기가 아니면 무관하다(읽을 수 없는 시스템 프로세스를 막지 않는다)", async () => {
    const named = row({ pid: 901, ppid: 1, name: "lsass.exe", args: null });
    const r = await observe([...baseRows(), named]);
    expect(r).toMatchObject({ status: "OBSERVED", foreignServerProcesses: 0 });
    expect(r.counts.unreadable_unrelated).toBe(1);
  });

  it("[M1] 실행기 옵션이 프로그램 이름을 뒤로 밀어도 서버를 놓치지 않는다 — 작업 폴더가 트리면 센다, 모르면 미확인이다", async () => {
    const shapes: string[][] = [
      ["python3", "-W", "ignore", "-m", "semgrep", "lsp"],
      ["python", "-X", "utf8", "-u", "-m", "semgrep", "lsp"],
      ["uv", "run", "--python", "3.12", "semgrep", "lsp"],
      ["C:\\Program", "Files\\Python\\Scripts\\semgrep.exe", "lsp"],
    ];
    for (const args of shapes) {
      const inTree = await observe([
        ...baseRows(),
        row({ pid: 700, ppid: 1, name: "python3", args, cwd: TREE }),
      ]);
      expect(inTree.foreignServerProcesses, args.join(" ")).toBe(1);
      const unknownCwd = await observe([
        ...baseRows(),
        row({ pid: 701, ppid: 1, name: "python3", args, cwd: null }),
      ]);
      expect(unknownCwd.foreignServerProcesses, args.join(" ")).toBeNull();
    }
  });

  it("[minor] 인자가 비어 있는 Python 계열 실행기(빈 명령줄·argv를 바꾼 프로세스)는 무엇을 돌리는지 알 수 없다", async () => {
    for (const name of ["python3", "pythonw.exe", "uv"]) {
      const r = await observe([...baseRows(), row({ pid: 702, ppid: 1, name, args: [] })]);
      expect(r.foreignServerProcesses, name).toBeNull();
      expect(r.undeterminedReasons, name).toEqual({ ROLE_UNCLEAR: 1 });
    }
    // 인자가 있고 Semgrep과 무관한 Python은 그대로 무관하다.
    const other = await observe([
      ...baseRows(),
      row({ pid: 703, ppid: 1, name: "python3", args: ["python3", "app.py"] }),
    ]);
    expect(other.foreignServerProcesses).toBe(0);
  });

  it("[minor] 붙여 쓴 짧은 옵션(-w<경로>)과 밑줄 옵션 이름(--root_dir=<경로>)의 경로도 단서다", async () => {
    for (const extraArgs of [[`-w${TREE}`], [`--root_dir=${TREE}`], [`-r=${TREE}/sub`]]) {
      const r = await observe([...baseRows(), serverRow(601, { cwd: "/elsewhere", extraArgs })]);
      expect(r.foreignServerProcesses, extraArgs.join(" ")).toBe(1);
    }
    expect(pathAnchorsOf(["semgrep", "lsp", "-wC:\\work\\tree"], 0)).toEqual([
      { value: "C:\\work\\tree", absolute: true },
    ]);
  });

  it("[minor] 지워진 작업 폴더(' (deleted)')는 실제 위치로 풀지 않는다 — 같은 트리 단서도 다른 트리 단서도 아니다", async () => {
    const r = await observe([...baseRows(), serverRow(601, { cwd: `${TREE}/gone (deleted)` })]);
    expect(r).toMatchObject({ status: "INCONCLUSIVE", foreignServerProcesses: null });
    expect(r.undeterminedReasons).toEqual({ ANCHOR_UNRESOLVABLE: 1 });
  });
});

describe("observeForeignServers — 목록 자체를 믿을 수 없을 때", () => {
  it("목록에 자기 자신이 없으면 관측 실패다(다른 PID 이름공간·숨김)", async () => {
    const r = await observe([parentRow(), plainRow(1)]);
    expect(r).toMatchObject({
      status: "FAILED",
      failure: "SELF_NOT_IN_LISTING",
      foreignServerProcesses: null,
    });
  });

  it("같은 PID가 두 번 나오면 관측 실패다", async () => {
    const r = await observe([...baseRows(), plainRow(500), plainRow(500)]);
    expect(r).toMatchObject({ status: "FAILED", failure: "SNAPSHOT_INCONSISTENT" });
  });

  it("빈 목록은 0이 아니라 실패다", async () => {
    const r = await observe([]);
    expect(r).toMatchObject({
      status: "FAILED",
      failure: "SELF_NOT_IN_LISTING",
      foreignServerProcesses: null,
    });
  });
});

// ── runForeignProcessObservation ─────────────────────────────────

describe("runForeignProcessObservation — 잠금·취소·조회 실패", () => {
  const inputs = (
    lister: SyntheticLister,
    extra: { lockHeld?: boolean; signal?: AbortSignal } = {}
  ) => ({
    lister,
    fs: aliasFs(),
    lockHeld: extra.lockHeld ?? true,
    context: CONTEXT,
    ...(extra.signal ? { signal: extra.signal } : {}),
  });

  it("잠금이 없으면 목록을 읽지 않고 시도하지 않은 것으로 null이다", async () => {
    const lister = listerOf(baseRows());
    const r = await runForeignProcessObservation(inputs(lister, { lockHeld: false }));
    expect(lister.calls).toBe(0);
    expect(r.foreignServerProcesses).toBeNull();
    expect(r.summary).toMatchObject({
      status: "NOT_ATTEMPTED",
      failure: "LOCK_NOT_HELD",
      foreign_server_processes: null,
    });
  });

  it("잠금을 얻었다는 이유로 0이 되지 않는다 — 목록에서만 나온다", async () => {
    // 잠금은 있지만 목록에 자기 자신이 없다 → 0이 아니라 null.
    const lister = listerOf([plainRow(1)]);
    const r = await runForeignProcessObservation(inputs(lister));
    expect(lister.calls).toBe(1);
    expect(r.foreignServerProcesses).toBeNull();
    expect(r.summary.status).toBe("FAILED");
  });

  it("이미 취소됐으면 읽지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const lister = listerOf(baseRows());
    const r = await runForeignProcessObservation(inputs(lister, { signal: controller.signal }));
    expect(lister.calls).toBe(0);
    expect(r.summary).toMatchObject({ status: "NOT_ATTEMPTED", failure: "CANCELLED" });
  });

  it("읽는 도중 취소되면 목록이 와도 쓰지 않는다", async () => {
    const controller = new AbortController();
    const lister = new SyntheticLister(async () => {
      controller.abort();
      return { ok: true, snapshot: snapshotOf(baseRows()) };
    });
    const r = await runForeignProcessObservation(inputs(lister, { signal: controller.signal }));
    expect(r.foreignServerProcesses).toBeNull();
    expect(r.summary).toMatchObject({ status: "FAILED", failure: "CANCELLED" });
  });

  it("조회 신호가 어댑터에 전달된다", async () => {
    const controller = new AbortController();
    const lister = listerOf(baseRows());
    await runForeignProcessObservation(inputs(lister, { signal: controller.signal }));
    expect(lister.signals[0]).toBe(controller.signal);
  });

  it.each<ProcessListFailure>([
    "UNSUPPORTED_PLATFORM",
    "SPAWN_FAILED",
    "PERMISSION_DENIED",
    "TIMEOUT",
    "OUTPUT_LIMIT_EXCEEDED",
    "OUTPUT_MALFORMED",
    "NONZERO_EXIT",
    "READ_FAILED",
    "CANCELLED",
    "UNEXPECTED_ERROR",
  ])("조회 실패 %s → null이고 같은 토큰이 요약에 남는다", async (failure) => {
    const lister = new SyntheticLister({ ok: false, failure });
    const r = await runForeignProcessObservation(inputs(lister));
    expect(r.foreignServerProcesses).toBeNull();
    expect(r.summary).toMatchObject({ status: "FAILED", failure, foreign_server_processes: null });
    expect(r.summary.listing).toEqual({ source: "linux-proc", provenance: "stub", rows: null });
  });

  it("어댑터가 던져도 던지지 않고 UNEXPECTED_ERROR로 null이다", async () => {
    const lister = new SyntheticLister(async () => {
      throw new Error("합성 오류: C:\\secret\\path");
    });
    const r = await runForeignProcessObservation(inputs(lister));
    expect(r.foreignServerProcesses).toBeNull();
    expect(r.summary).toMatchObject({ status: "FAILED", failure: "UNEXPECTED_ERROR" });
    expect(JSON.stringify(r.summary)).not.toContain("secret");
  });

  it("physicalKey가 던져도 던지지 않는다(트리 해석 실패)", async () => {
    const r = await runForeignProcessObservation({
      lister: listerOf(baseRows()),
      fs: {
        physicalKey: async () => {
          throw new Error("x");
        },
      },
      lockHeld: true,
      context: CONTEXT,
    });
    expect(r.foreignServerProcesses).toBeNull();
    expect(r.summary).toMatchObject({ status: "FAILED", failure: "TREE_UNRESOLVABLE" });
  });
});

describe("runForeignProcessObservation — 요약의 내용", () => {
  const SECRET = "tok-SECRET-0123456789";
  const rows = [
    ownRow({ args: ["node", "cli.ts", `--token=${SECRET}`] }),
    parentRow(),
    serverRow(601, { cwd: TREE, extraArgs: [`--metrics-token=${SECRET}`, "/very/private/path"] }),
    serverRow(602, { cwd: "/very/private/cwd" }),
    versionRow(603),
  ];

  it("조회 시점·상태·건수·이유만 담고 명령줄·경로·PID·환경변수 값은 담지 않는다", async () => {
    const r = await runForeignProcessObservation({
      lister: listerOf(rows),
      fs: aliasFs(),
      lockHeld: true,
      context: CONTEXT,
    });
    expect(r.foreignServerProcesses).toBe(1);
    expect(r.summary).toMatchObject({
      scope: "POINT_IN_TIME",
      status: "OBSERVED",
      foreign_server_processes: 1,
      count_is_lower_bound: true, // 실행 위치만 다른 서버(602)는 판별 불가로 남는다
      listing: { source: "linux-proc", provenance: "stub", rows: 5 },
      counts: {
        servers_same_tree: 1,
        servers_undetermined: 1,
        version_check: 1,
        own_process: 1,
        own_ancestors: 1,
      },
      not_established: {
        semgrep_server_identification: "UNVERIFIED",
        foreign_server_tree_binding: "UNVERIFIED",
        hidden_processes: "NOT_OBSERVED",
      },
    });
    const text = JSON.stringify(r.summary);
    for (const leak of [
      SECRET,
      "/very/private",
      "--token",
      "--metrics",
      "node",
      "cli.ts",
      BIN,
      TREE,
      String(OWN_PID),
      "601",
      "602",
    ]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("요약의 모든 값은 문자열 토큰·정수·불리언·null뿐이다(자유 문자열 필드가 없다)", async () => {
    const r = await runForeignProcessObservation({
      lister: listerOf(rows),
      fs: aliasFs(),
      lockHeld: true,
      context: CONTEXT,
    });
    const walk = (value: unknown, path: string): void => {
      if (value === null || typeof value === "boolean" || typeof value === "number") return;
      if (typeof value === "string") {
        expect(value, path).toMatch(/^[A-Z][A-Z0-9_-]*$|^(?:linux-proc|windows-cim|stub|real)$/);
        return;
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>))
        walk(v, `${path}.${k}`);
    };
    walk(r.summary, "summary");
  });
});

describe("foreignObservationConflict — 요약과 하네스 입력의 모순", () => {
  async function summaryOf(rows: readonly ProcessRow[]) {
    return (
      await runForeignProcessObservation({
        lister: listerOf(rows),
        fs: aliasFs(),
        lockHeld: true,
        context: CONTEXT,
      })
    ).summary;
  }

  it("건수가 같으면 모순이 없다(확정·미확정·실패 모두)", async () => {
    const zero = await summaryOf(baseRows());
    expect(foreignObservationConflict(zero, 0)).toBeNull();
    const inconclusive = await summaryOf([...baseRows(), serverRow(1000, { cwd: null })]);
    expect(foreignObservationConflict(inconclusive, null)).toBeNull();
  });

  it("건수가 다르면 모순이다 — 0을 넘겼는데 요약은 미확정", async () => {
    const inconclusive = await summaryOf([...baseRows(), serverRow(1000, { cwd: null })]);
    expect(foreignObservationConflict(inconclusive, 0)).toMatch(/다르/);
    const zero = await summaryOf(baseRows());
    expect(foreignObservationConflict(zero, null)).toMatch(/다르/);
    expect(foreignObservationConflict(zero, 1)).toMatch(/다르/);
  });

  it("세부 건수와 상태·건수가 어긋난 요약은 거절한다(독립 검토 minor 7)", async () => {
    const one = await summaryOf([...baseRows(), serverRow(1000, { cwd: TREE })]);
    expect(foreignObservationConflict(one, 1)).toBeNull();
    const zero = await summaryOf(baseRows());
    const bad: [string, ForeignServerObservationSummary, number | null][] = [
      ["같은 트리 건수 불일치", { ...one, counts: { ...one.counts, servers_same_tree: 0 } }, 1],
      ["0인데 판별 못한 후보", { ...zero, counts: { ...zero.counts, servers_undetermined: 1 } }, 0],
      ["확정인데 실패 토큰", { ...zero, failure: "TIMEOUT" }, 0],
      ["하한 표시가 후보와 어긋남", { ...one, count_is_lower_bound: true }, 1],
      [
        "미확정인데 같은 트리 건수",
        {
          ...zero,
          status: "INCONCLUSIVE",
          foreign_server_processes: null,
          counts: { ...zero.counts, servers_same_tree: 1 },
        },
        null,
      ],
      [
        "미확정인데 후보 없음",
        { ...zero, status: "INCONCLUSIVE", foreign_server_processes: null },
        null,
      ],
    ];
    for (const [label, summary, value] of bad) {
      expect(foreignObservationConflict(summary, value), label).not.toBeNull();
    }
  });

  it("상태와 건수가 서로 모순인 요약, 조회 시점이 아닌 요약은 거절한다", async () => {
    const zero = await summaryOf(baseRows());
    expect(foreignObservationConflict({ ...zero, status: "INCONCLUSIVE" }, 0)).toMatch(/모순/);
    // 실패·미시도는 실패 토큰이 있어야 한다.
    expect(
      foreignObservationConflict(
        { ...zero, status: "FAILED", foreign_server_processes: null },
        null
      )
    ).toMatch(/실패 토큰/);
    expect(
      foreignObservationConflict(
        { ...zero, status: "FAILED", failure: "TIMEOUT", foreign_server_processes: null },
        null
      )
    ).toBeNull();
    expect(
      foreignObservationConflict({ ...zero, scope: "ALWAYS" as unknown as "POINT_IN_TIME" }, 0)
    ).toMatch(/조회 시점/);
    expect(
      foreignObservationConflict(
        { ...zero, status: "FAILED", foreign_server_processes: null, count_is_lower_bound: true },
        null
      )
    ).toMatch(/하한/);
  });
});
