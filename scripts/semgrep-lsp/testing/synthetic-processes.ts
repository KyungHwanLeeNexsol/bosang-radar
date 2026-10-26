// 합성 프로세스 자료와 가짜 조회 어댑터. **실제 운영체제를 읽지 않는다** — 여기서 만든 목록으로 얻은 결과는 판정 로직이 합성 입력에서
// 의도대로 동작한다는 것만 보여 줄 뿐, 실제 운영체제나 실제 Semgrep 프로세스 식별의 증거가 아니다. provenance는 항상 "stub"이다.

import type {
  ForeignServerObservationSummary,
  ProcessListResult,
  ProcessLister,
  ProcessRow,
  ProcessSnapshot,
  ProcessListSource,
} from "../types";

/** 시험에서 하네스(검사 프로그램 자신)로 쓰는 PID. */
export const OWN_PID = 4242;
/** 시험에서 쓰는 서버 트리와 Semgrep 실행 파일(둘 다 합성 경로). */
export const TREE = "/work/scan-tree";
export const BIN = "/opt/semgrep/bin/semgrep";

export function row(partial: Partial<ProcessRow> & { pid: number }): ProcessRow {
  return {
    ppid: null,
    startTime: null,
    name: null,
    executable: null,
    args: null,
    cwd: null,
    vanished: false,
    ...partial,
  };
}

/** 하네스 자신: node가 cli.ts를 실행하고 있다(인자에 `semgrep`이 들어 있어도 자기 자신이라 다른 서버가 아니다). */
export function ownRow(partial: Partial<ProcessRow> = {}): ProcessRow {
  return row({
    pid: OWN_PID,
    ppid: 100,
    name: "node",
    executable: "/usr/bin/node",
    args: ["node", "/repo/scripts/semgrep-lsp/cli.ts", "run", "--semgrep-bin", BIN],
    cwd: "/repo",
    ...partial,
  });
}

/** 조상(셸) 한 줄. ownRow의 부모(100)다. */
export function parentRow(partial: Partial<ProcessRow> = {}): ProcessRow {
  return row({
    pid: 100,
    ppid: 1,
    name: "bash",
    executable: "/usr/bin/bash",
    args: ["bash", "-c", `node cli.ts run --semgrep-bin ${BIN} # semgrep lsp`],
    cwd: "/repo",
    ...partial,
  });
}

/** `semgrep lsp` 서버 한 줄(역할이 SERVER). 작업 폴더와 추가 인자를 정한다. */
export function serverRow(
  pid: number,
  partial: Partial<ProcessRow> & { extraArgs?: readonly string[] } = {}
): ProcessRow {
  const { extraArgs, ...rest } = partial;
  return row({
    pid,
    ppid: 1,
    name: "semgrep",
    executable: BIN,
    args: [BIN, "lsp", "--debug", ...(extraArgs ?? [])],
    cwd: "/elsewhere/project",
    ...rest,
  });
}

/** `semgrep --version` 한 줄(역할이 VERSION_CHECK). */
export function versionRow(pid: number, partial: Partial<ProcessRow> = {}): ProcessRow {
  return row({
    pid,
    ppid: 1,
    name: "semgrep",
    executable: BIN,
    args: [BIN, "--version"],
    cwd: "/elsewhere/project",
    ...partial,
  });
}

/** 관계없는 프로세스 한 줄. */
export function plainRow(
  pid: number,
  name = "sleep",
  partial: Partial<ProcessRow> = {}
): ProcessRow {
  return row({
    pid,
    ppid: 1,
    name,
    executable: `/usr/bin/${name}`,
    args: [name, "1"],
    cwd: "/",
    ...partial,
  });
}

export function snapshotOf(
  rows: readonly ProcessRow[],
  options: { source?: ProcessListSource; parentLinkNeedsStartTime?: boolean } = {}
): ProcessSnapshot {
  return {
    source: options.source ?? "linux-proc",
    parentLinkNeedsStartTime: options.parentLinkNeedsStartTime ?? false,
    rows,
  };
}

/** 하네스와 그 부모를 포함한 가장 작은 목록(다른 프로세스 없음). */
export function baseRows(): ProcessRow[] {
  return [ownRow(), parentRow()];
}

/** 별칭을 가진 가짜 physicalKey: 맵에 있는 경로는 대상으로, 없으면 사전식 정규화. 던져야 하는 경로는 `unresolvable`에 적는다. */
export function aliasFs(
  aliases: Readonly<Record<string, string>> = {},
  unresolvable: readonly string[] = []
): { physicalKey(path: string): Promise<string> } {
  const normalize = (path: string): string => {
    const stack: string[] = [];
    for (const part of path.replace(/\\/g, "/").split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    return `/${stack.join("/")}`;
  };
  return {
    async physicalKey(path: string): Promise<string> {
      const normalized = normalize(path);
      if (unresolvable.includes(normalized)) throw new Error("합성: 풀 수 없는 경로");
      for (const [from, to] of Object.entries(aliases)) {
        const f = normalize(from);
        if (normalized === f || normalized.startsWith(`${f}/`)) {
          return normalize(`${to}${normalized.slice(f.length)}`);
        }
      }
      return normalized;
    },
  };
}

/** 정해 둔 결과(또는 함수)를 돌려주는 가짜 조회 어댑터. 호출 횟수를 센다. */
export class SyntheticLister implements ProcessLister {
  readonly provenance = "stub" as const;
  readonly source: ProcessListSource | null;
  calls = 0;
  signals: (AbortSignal | undefined)[] = [];

  constructor(
    private readonly result:
      ProcessListResult | ((signal?: AbortSignal) => Promise<ProcessListResult>),
    source: ProcessListSource | null = "linux-proc"
  ) {
    this.source = source;
  }

  async list(options: { signal?: AbortSignal }): Promise<ProcessListResult> {
    this.calls++;
    this.signals.push(options.signal);
    return typeof this.result === "function" ? this.result(options.signal) : this.result;
  }
}

export function listerOf(rows: readonly ProcessRow[]): SyntheticLister {
  return new SyntheticLister({ ok: true, snapshot: snapshotOf(rows) });
}

/** 하네스에 넘기는 관측 요약의 합성 자료(건수를 정해 만든다). 합성이므로 실제 관측이 아니다. */
export function foreignSummaryOf(
  foreignServerProcesses: number | null,
  over: Partial<ForeignServerObservationSummary> = {}
): ForeignServerObservationSummary {
  const observed = foreignServerProcesses !== null;
  return {
    scope: "POINT_IN_TIME",
    status: observed ? "OBSERVED" : "INCONCLUSIVE",
    failure: null,
    foreign_server_processes: foreignServerProcesses,
    count_is_lower_bound: false,
    listing: { source: "linux-proc", provenance: "stub", rows: 2 },
    counts: {
      own_process: 1,
      own_ancestors: 1,
      own_descendants: 0,
      version_check: 0,
      other_semgrep: 0,
      servers_same_tree: foreignServerProcesses ?? 0,
      servers_undetermined: observed ? 0 : 1,
      role_undetermined: 0,
      unreadable_unrelated: 0,
      vanished_not_candidate: 0,
    },
    undetermined_reasons: observed ? {} : { CWD_UNAVAILABLE: 1 },
    not_established: {
      semgrep_server_identification: "UNVERIFIED",
      foreign_server_tree_binding: "UNVERIFIED",
      hidden_processes: "NOT_OBSERVED",
    },
    ...over,
  };
}
