// 같은 서버 트리의 다른 Semgrep LSP 프로세스 관측(ADR C0 (e)). CLI가 null로 넘기던 foreignServerProcesses를 실제 관측으로 채운다.
//
// 이 모듈은 **판정 로직만** 가진다(순수): 프로세스 목록은 ProcessLister(운영체제 어댑터, process-list-node.ts)가 읽어 오고, 경로의 실제
// 위치는 FsPort.physicalKey가 푼다. 그래서 child_process·node:fs를 가져오지 않고 시험은 합성 자료로 결정적이다.
// 이 관측은 **읽기만** 한다: 다른 프로세스에 신호를 보내거나 끝내거나 정리하지 않는다.
//
// ── 이 관측이 말하는 것: 조회 시점의 사실 ─────────────────────────────────────────────────────────────────────────────────
//  · 목록을 읽은 그 순간에 보인 프로세스에 대한 판정이다. 조회 **이후** 하네스 밖에서 시작되는 프로세스는 막지 못한다.
//  · 공유 실행 잠금은 이 판정과 무관하다: 잠금을 얻었다는 이유로 건수를 0으로 채우지 않는다(잠금은 다른 **하네스** 실행만 막는다).
//
// ── 판별 근거 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
//  1) 자기 자신 구분: 하네스 프로세스(ownPid), 그 조상, 그 자손(조회 자식 포함)은 "다른" 프로세스가 아니다. Windows에서는 부모 PID가
//     재사용되므로 부모 시작 시각이 자식보다 늦지 않을 때만 부모-자식으로 본다. 목록에 ownPid가 없으면 목록을 믿지 않는다.
//  2) 역할: 인자 배열(요소 단위, 앞쪽 MAX_ARGS_SCANNED칸)에서 Semgrep 프로그램 이름(semgrep·pysemgrep·osemgrep·semgrep-core·
//     semgrep-cli, 확장자·`-script` 제거, 대소문자 무시, `-m 모듈` 포함)을 찾고 그 뒤 인자 **전체**를 본다. 실행기 옵션이나 공백이 든 경로가 이름을
//     앞쪽 몇 칸 밖으로 밀어내도 놓치지 않기 위해서다.
//       · `lsp`(또는 `-lsp`)가 있다 → SERVER. · 없고 `--version`이 있다 → VERSION_CHECK(서버가 아니다). · 그 밖 → OTHER(검사 등).
//       · 한도를 넘는 목록에서 앞쪽 MAX_ARGS_SCANNED칸에 이름이 없다 → UNSCANNED(다 보지 못함). 못 본 칸에 `semgrep lsp`가 있을 수 있으므로
//         이미지 이름과 무관하게 판별 불가다(ARGS_SCAN_LIMIT) — 한도를 늘려서 가리지 않고, 못 본 부분을 서버 부재의 근거로 쓰지 않는다.
//     프로그램 이름이 인자에 없어도 이미지 이름·실행 파일이 Semgrep 이름이거나 --semgrep-bin과 같은 이름이면 **후보**지만 역할을 알 수 없다.
//     인자를 읽지 못한(또는 비어 있는) 프로세스는 이미지 이름·실행 파일이 Semgrep 이름이거나 Python 계열 실행기(python·pypy·py·uv·uvx·pipx)일 때만
//     후보다. 살아 있는데 이름·실행 파일·인자를 모두 읽지 못한 프로세스는 무엇인지 알 수 없으므로 후보로 본다(ROW_UNREADABLE).
//  3) 트리 관계(SERVER만): 관측할 수 있는 단서는 작업 폴더(cwd)와 인자 속 경로 두 가지뿐이다. 단서마다 FsPort.physicalKey로 풀어(별칭·
//     링크·junction·`..`·대소문자) 서버 트리와 비교한다.
//       · 하나라도 트리와 같거나 그 안이다 → SAME(건수에 센다).
//       · 그 밖에는 **언제나 미확인**이다: 트리를 감싸는 단서(ANCHOR_ENCLOSES_TREE), 작업 폴더를 모름(CWD_UNAVAILABLE), 풀 수 없는 단서
//         (ANCHOR_UNRESOLVABLE), 그리고 단서가 모두 트리와 겹치지 않는 경우(TREE_BINDING_UNOBSERVABLE). 마지막은 LSP 서버의 작업 폴더가 stdio의
//         initialize로 전달되어 목록에서 보이지 않기 때문이다 — 이 하네스도 서버를 트리가 아닌 규칙 캐시의 부모 폴더에서 띄운다. 실행 위치가
//         트리와 다르다는 것은 서버가 다른 트리를 스캔한다는 증거가 아니다.
//
// ── 판별 불가 조건(하나라도 있으면 건수를 0으로 채우지 않고 null) ───────────────────────────────────────────────────────────
//  · 목록을 읽지 못함(미지원 환경·실행 실패·권한 부족·시간 초과·출력 한도·출력 파손·취소·읽기 실패) 또는 목록에 자기 자신이 없음.
//  · 보이는 서버 후보가 같은 트리로 확인되지 않음(위 3).
//  · 후보인데 역할을 알 수 없음(ARGS_UNAVAILABLE·ARGS_SCAN_LIMIT·ROLE_UNCLEAR·ROW_UNREADABLE) 또는 후보를 읽는 도중 사라짐(CANDIDATE_VANISHED).
//  · 같은 트리의 서버가 확인되면 건수(숫자)를 돌려주되 다른 미확인 후보가 있으면 count_is_lower_bound로 표시한다.
//
// ── 0이 뜻하는 것 / 세워 주지 않는 것 ───────────────────────────────────────────────────────────────────────────────────────
//  · 건수 0은 "식별 규칙에 맞는 다른 서버 후보가 목록에 보이지 않았고, 보인 후보는 모두 서버가 아님이 확인되었다"는 뜻이지 "다른 서버가 없다"는 증명이
//    아니다. 이름도 인자도 Semgrep과 닮지 않게 바꾼 프로세스, 다른 사용자·다른 PID 이름공간(컨테이너)·다른 호스트의 프로세스, 읽는 도중 끝난 프로세스는
//    식별하지 못한다. 식별 규칙은 실제 Semgrep으로 확인하지 않았다(ADR U20). 합성 자료나 Node 스텁의 결과는 실제 Semgrep 프로세스 식별의 증거가 아니다.
//  · 목록을 읽은 뒤 하네스가 트리를 준비·서버를 띄우기까지 시간이 흐른다(그 사이 시작된 프로세스는 보지 못한다).
//
// 공개 API:
//   observeForeignServers({ fs }, snapshot, context): Promise<ForeignObservationOutcome>   목록 한 장의 판정(던지지 않는다)
//   runForeignProcessObservation(inputs): Promise<ForeignProcessObservationResult>         잠금 확인 → 목록 읽기 → 판정 → 요약(던지지 않는다)
//   programIdOf / argvRoleOf / pathAnchorsOf   (시험용 순수 도우미)

import { keyIsSameOrInside } from "./path-containment";
import type {
  FsPort,
  ForeignObservationFailure,
  ForeignServerObservationSummary,
  ForeignUndeterminedReason,
  ProcessListFailure,
  ProcessLister,
  ProcessRow,
  ProcessSnapshot,
} from "./types";

// ── 식별 규칙 ────────────────────────────────────────────────────

/**
 * 인자 배열에서 Semgrep 프로그램 이름을 찾는 상한(요소 수). 실행기 옵션(`python -W ignore -X utf8 -u -m semgrep`, `uv run --python 3.12 semgrep`)이나
 * 따옴표 없이 공백이 든 Windows 경로가 프로그램 이름을 앞쪽 몇 칸 밖으로 밀어내도 놓치지 않도록 인자 전체를 보되, 비정상적으로 긴 목록은 여기까지만 본다.
 * 한도를 넘는 목록에서 이 안에 이름이 없으면 "없음"이 아니라 "다 보지 못함"(UNSCANNED)이다 — 못 본 칸이 서버 부재의 근거가 되지 않는다.
 */
export const MAX_ARGS_SCANNED = 4096;
/** 부모 연결을 따라가는 최대 단계(순환·비정상 자료에서 멈춘다). */
const MAX_CHAIN = 256;

// UNVERIFIED: 이름 목록은 하네스가 정한 것이며 실제 Semgrep 배포의 실행 파일 이름과 같다는 것은 확인하지 않았다.
const SEMGREP_PROGRAMS: ReadonlySet<string> = new Set([
  "semgrep",
  "pysemgrep",
  "osemgrep",
  "semgrep-core",
  "semgrep-cli",
]);
/** Semgrep(파이썬 응용)을 품을 수 있는 실행기 이름. 인자를 읽지 못한 프로세스가 후보인지 가르는 데만 쓴다. */
const HOST_PROGRAM = /^(?:python|pythonw|pypy|py)\d*(?:\.\d+)*$/;
const HOST_PROGRAMS: ReadonlySet<string> = new Set(["uv", "uvx", "pipx"]);

function baseNameOf(path: string): string {
  const unified = path.replace(/\\/g, "/");
  return unified.slice(unified.lastIndexOf("/") + 1);
}

/** 프로그램 이름의 비교형: 경로 없이, 소문자, 실행 확장자와 `-script`를 뗀다. */
export function programIdOf(pathOrName: string): string {
  let id = baseNameOf(pathOrName).toLowerCase();
  id = id.replace(/(?:\.(?:exe|cmd|bat|com|py|pyw|pyz))+$/, "");
  return id.replace(/-script$/, "");
}

/**
 * NONE: 인자를 모두 보았고 Semgrep 프로그램 이름이 없다. UNSCANNED: 앞쪽 MAX_ARGS_SCANNED칸에 이름이 없고 목록이 그보다 길다 — 못 본 칸에
 * 있을지 모르므로 "없음"이 아니다(호출자는 이를 판별 불가로 다룬다).
 */
export type ArgvRole = "SERVER" | "VERSION_CHECK" | "OTHER" | "NONE" | "UNSCANNED";

export interface ArgvAnalysis {
  role: ArgvRole;
  /** Semgrep 프로그램 이름이 있던 색인(없으면 -1). */
  programIndex: number;
}

/**
 * 인자 배열의 역할 판정(파일 머리말 2). 인자 전체를 문자열로 보지 않고 **요소 단위**로 본다. 프로그램 이름은 앞쪽 MAX_ARGS_SCANNED칸에서만 찾지만,
 * 찾으면 역할 토큰(`lsp`·`--version`)은 그 뒤 **전체**에서 본다.
 */
export function argvRoleOf(args: readonly string[]): ArgvAnalysis {
  const limit = Math.min(args.length, MAX_ARGS_SCANNED);
  for (let i = 0; i < limit; i++) {
    const element = args[i];
    // `-m semgrep.cli`처럼 모듈로 부른 경우는 점 앞 이름을 프로그램으로 본다.
    const id =
      i > 0 && args[i - 1] === "-m" ? element.split(".")[0].toLowerCase() : programIdOf(element);
    if (!SEMGREP_PROGRAMS.has(id)) continue;
    const rest = args.slice(i + 1);
    if (rest.includes("lsp") || rest.includes("-lsp")) return { role: "SERVER", programIndex: i };
    if (rest.includes("--version")) return { role: "VERSION_CHECK", programIndex: i };
    return { role: "OTHER", programIndex: i };
  }
  // 앞쪽 limit칸에서 이름을 찾지 못했다. 목록이 더 길면 남은 칸은 보지 않았으므로 "없음"이 아니라 판정 불완전이다.
  return { role: args.length > limit ? "UNSCANNED" : "NONE", programIndex: -1 };
}

const URL_LIKE = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
/** `--옵션=값`·`-o=값` (옵션 이름에 밑줄 허용). */
const OPTION_VALUE = /^--?[A-Za-z0-9_][A-Za-z0-9_-]*=([\s\S]*)$/;
/** 붙여 쓴 짧은 옵션 `-w/경로`·`-wC:\경로` (값이 절대 경로일 때만). */
const SHORT_ATTACHED = /^-[A-Za-z]((?:\/|\\\\|[A-Za-z]:[\\/])[\s\S]*)$/;
const ABSOLUTE = /^(?:\/|\\\\|[A-Za-z]:[\\/])/;

export interface PathAnchor {
  value: string;
  absolute: boolean;
}

/** 프로그램 뒤 인자에서 경로로 보이는 요소를 뽑는다(`--옵션=값`의 값 포함). URL·구분자 없는 단어는 경로가 아니다. */
export function pathAnchorsOf(args: readonly string[], programIndex: number): PathAnchor[] {
  const out: PathAnchor[] = [];
  for (const raw of args.slice(programIndex + 1)) {
    const value = OPTION_VALUE.exec(raw)?.[1] ?? SHORT_ATTACHED.exec(raw)?.[1] ?? raw;
    if (value.length === 0 || value.startsWith("-") || URL_LIKE.test(value)) continue;
    const absolute = ABSOLUTE.test(value);
    if (absolute || /[\\/]/.test(value) || value === "." || value === "..") {
      out.push({ value, absolute });
    }
  }
  return out;
}

// ── 목록 한 장의 판정 ────────────────────────────────────────────

export interface ForeignObservationContext {
  /** 하네스(검사 프로그램 자신)의 PID. */
  ownPid: number;
  /** 서버가 스캔하는 트리(target은 스캔 트리, control은 대조 트리). */
  serverTree: string;
  /** --semgrep-bin. 이름이 같은 실행 파일을 후보로 보는 데만 쓴다. */
  semgrepBin: string;
}

type Counts = ForeignServerObservationSummary["counts"];

export interface ForeignObservationOutcome {
  status: "OBSERVED" | "INCONCLUSIVE" | "FAILED";
  failure: ForeignObservationFailure | null;
  foreignServerProcesses: number | null;
  countIsLowerBound: boolean;
  counts: Counts;
  undeterminedReasons: Partial<Record<ForeignUndeterminedReason, number>>;
  rows: number;
}

function emptyCounts(): Counts {
  return {
    own_process: 0,
    own_ancestors: 0,
    own_descendants: 0,
    version_check: 0,
    other_semgrep: 0,
    servers_same_tree: 0,
    servers_undetermined: 0,
    role_undetermined: 0,
    unreadable_unrelated: 0,
    vanished_not_candidate: 0,
  };
}

function failed(failure: ForeignObservationFailure, rows: number): ForeignObservationOutcome {
  return {
    status: "FAILED",
    failure,
    foreignServerProcesses: null,
    countIsLowerBound: false,
    counts: emptyCounts(),
    undeterminedReasons: {},
    rows,
  };
}

/** 부모 연결이 믿을 만한가. Windows는 부모 시작 시각이 자식보다 늦지 않아야 한다(PID 재사용 방지). */
function linkValid(snapshot: ProcessSnapshot, child: ProcessRow, parent: ProcessRow): boolean {
  if (!snapshot.parentLinkNeedsStartTime) return true;
  return (
    child.startTime !== null && parent.startTime !== null && parent.startTime <= child.startTime
  );
}

function ancestorsOf(
  snapshot: ProcessSnapshot,
  byPid: ReadonlyMap<number, ProcessRow>,
  own: ProcessRow
): Set<number> {
  const out = new Set<number>();
  let current = own;
  for (let i = 0; i < MAX_CHAIN; i++) {
    if (current.ppid === null) break;
    const parent = byPid.get(current.ppid);
    if (parent === undefined || out.has(parent.pid) || parent.pid === own.pid) break;
    if (!linkValid(snapshot, current, parent)) break;
    out.add(parent.pid);
    current = parent;
  }
  return out;
}

function isDescendant(
  snapshot: ProcessSnapshot,
  byPid: ReadonlyMap<number, ProcessRow>,
  row: ProcessRow,
  ownPid: number
): boolean {
  const seen = new Set<number>([row.pid]);
  let current = row;
  for (let i = 0; i < MAX_CHAIN; i++) {
    if (current.ppid === null) return false;
    const parent = byPid.get(current.ppid);
    if (parent === undefined || seen.has(parent.pid) || !linkValid(snapshot, current, parent)) {
      return false;
    }
    if (parent.pid === ownPid) return true;
    seen.add(parent.pid);
    current = parent;
  }
  return false;
}

type Relation = "SAME" | { undetermined: ForeignUndeterminedReason };

/**
 * SERVER 후보와 서버 트리의 관계(파일 머리말 3). 읽기만 하며 던지지 않는다. **같은 트리로 확인되지 않으면 언제나 판별 불가다** — 보이는 LSP 서버의
 * 작업 폴더는 stdio로 전달되어 목록에서 보이지 않으므로(이 하네스도 서버를 트리가 아닌 규칙 캐시의 부모에서 띄운다) "단서가 겹치지 않음"은 "다른 트리"의
 * 증거가 아니고, 그래서 건수를 0으로 채우는 근거가 될 수 없다.
 */
async function relationOf(
  fs: Pick<FsPort, "physicalKey">,
  row: ProcessRow,
  args: readonly string[],
  programIndex: number,
  treeKey: string
): Promise<Relation> {
  const anchors = pathAnchorsOf(args, programIndex);
  const keys: string[] = [];
  let unresolvable = false;

  const resolve = async (path: string): Promise<void> => {
    try {
      keys.push(await fs.physicalKey(path));
    } catch {
      unresolvable = true;
    }
  };

  // 지워진 폴더(`/proc/<pid>/cwd`의 ` (deleted)`)는 실제 위치로 풀 수 없다.
  if (row.cwd !== null) {
    if (row.cwd.endsWith(" (deleted)")) unresolvable = true;
    else await resolve(row.cwd);
  }
  for (const anchor of anchors) {
    if (anchor.absolute) await resolve(anchor.value);
    // 상대 경로는 작업 폴더를 알아야 풀린다. 모르면 풀 수 없는 단서다.
    else if (row.cwd !== null) await resolve(`${row.cwd.replace(/[\\/]+$/, "")}/${anchor.value}`);
    else unresolvable = true;
  }

  if (keys.some((key) => keyIsSameOrInside(key, treeKey))) return "SAME";
  if (keys.some((key) => keyIsSameOrInside(treeKey, key))) {
    return { undetermined: "ANCHOR_ENCLOSES_TREE" };
  }
  if (row.cwd === null) return { undetermined: "CWD_UNAVAILABLE" };
  if (unresolvable) return { undetermined: "ANCHOR_UNRESOLVABLE" };
  return { undetermined: "TREE_BINDING_UNOBSERVABLE" };
}

// @MX:ANCHOR: [AUTO] 다른 서버 프로세스 판정의 유일한 입구 — 목록 한 장을 건수(또는 null)로 바꾼다.
// @MX:REASON: "확인하지 못한 것을 0으로 채우지 않는다"와 "자기 자신을 다른 서버로 세지 않는다"가 이 함수 한 곳에서만 지켜진다. 분기를 늘릴 때 둘 다 유지해야 한다.
export async function observeForeignServers(
  ports: { fs: Pick<FsPort, "physicalKey"> },
  snapshot: ProcessSnapshot,
  context: ForeignObservationContext
): Promise<ForeignObservationOutcome> {
  const rows = snapshot.rows;
  const byPid = new Map<number, ProcessRow>();
  for (const row of rows) {
    if (byPid.has(row.pid)) return failed("SNAPSHOT_INCONSISTENT", rows.length);
    byPid.set(row.pid, row);
  }
  const own = byPid.get(context.ownPid);
  if (own === undefined) return failed("SELF_NOT_IN_LISTING", rows.length);

  let treeKey: string;
  try {
    treeKey = await ports.fs.physicalKey(context.serverTree);
  } catch {
    return failed("TREE_UNRESOLVABLE", rows.length);
  }

  const ancestors = ancestorsOf(snapshot, byPid, own);
  const binId = programIdOf(context.semgrepBin);
  const counts = emptyCounts();
  const reasons: Partial<Record<ForeignUndeterminedReason, number>> = {};
  const undetermined = (reason: ForeignUndeterminedReason): void => {
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };

  for (const row of rows) {
    if (row.pid === own.pid) {
      counts.own_process++;
      continue;
    }
    if (ancestors.has(row.pid)) {
      counts.own_ancestors++;
      continue;
    }
    if (isDescendant(snapshot, byPid, row, context.ownPid)) {
      counts.own_descendants++;
      continue;
    }

    // 이미지 이름·실행 파일이 Semgrep 이름이거나 --semgrep-bin과 같은 이름인가(인자와 별개의 단서).
    const identities = [row.name, row.executable]
      .filter((v): v is string => v !== null && v.length > 0)
      .map(programIdOf);
    const nameSignal = identities.some((id) => SEMGREP_PROGRAMS.has(id) || id === binId);
    const hostLike = identities.some((id) => HOST_PROGRAM.test(id) || HOST_PROGRAMS.has(id));

    if (row.args === null) {
      if (row.vanished && row.name === null && row.executable === null) {
        counts.vanished_not_candidate++; // 아무것도 읽기 전에 끝났다 — 식별할 수 없고 지금은 없다.
      } else if (!row.vanished && row.name === null && row.executable === null) {
        // 살아 있는데 이름도 실행 파일도 인자도 읽지 못했다(권한·읽기 오류). 무엇인지 알 수 없는 프로세스를 "무관"으로 보지 않는다.
        counts.role_undetermined++;
        undetermined("ROW_UNREADABLE");
      } else if (nameSignal || hostLike) {
        counts.role_undetermined++;
        undetermined(row.vanished ? "CANDIDATE_VANISHED" : "ARGS_UNAVAILABLE");
      } else if (row.vanished) {
        counts.vanished_not_candidate++;
      } else {
        counts.unreadable_unrelated++;
      }
      continue;
    }

    const analysis = argvRoleOf(row.args);
    if (analysis.role === "UNSCANNED") {
      // 인자를 끝까지 보지 못했다. 못 본 칸에 `semgrep lsp`가 있을 수 있으므로 이미지 이름과 무관하게 "서버가 아님"으로 확정하지 않는다.
      counts.role_undetermined++;
      undetermined(row.vanished ? "CANDIDATE_VANISHED" : "ARGS_SCAN_LIMIT");
      continue;
    }
    if (analysis.role === "NONE") {
      // 인자가 비어 있는 Python 계열 실행기(빈 명령줄·argv를 바꾼 프로세스)는 무엇을 돌리는지 알 수 없다.
      if (nameSignal || (hostLike && row.args.length === 0)) {
        counts.role_undetermined++;
        undetermined(row.vanished ? "CANDIDATE_VANISHED" : "ROLE_UNCLEAR");
      } else if (row.vanished) {
        counts.vanished_not_candidate++;
      }
      continue;
    }
    if (analysis.role === "VERSION_CHECK") {
      counts.version_check++;
      continue;
    }
    if (analysis.role === "OTHER") {
      counts.other_semgrep++;
      continue;
    }

    // SERVER 후보. 읽는 도중 끝났으면 작업 폴더를 끝까지 읽었는지 알 수 없다.
    if (row.vanished) {
      counts.servers_undetermined++;
      undetermined("CANDIDATE_VANISHED");
      continue;
    }
    const relation = await relationOf(ports.fs, row, row.args, analysis.programIndex, treeKey);
    if (relation === "SAME") counts.servers_same_tree++;
    else {
      counts.servers_undetermined++;
      undetermined(relation.undetermined);
    }
  }

  const undeterminedTotal = counts.servers_undetermined + counts.role_undetermined;
  const same = counts.servers_same_tree;
  if (same > 0) {
    return {
      status: "OBSERVED",
      failure: null,
      foreignServerProcesses: same,
      countIsLowerBound: undeterminedTotal > 0,
      counts,
      undeterminedReasons: reasons,
      rows: rows.length,
    };
  }
  return {
    status: undeterminedTotal > 0 ? "INCONCLUSIVE" : "OBSERVED",
    failure: null,
    foreignServerProcesses: undeterminedTotal > 0 ? null : 0,
    countIsLowerBound: false,
    counts,
    undeterminedReasons: reasons,
    rows: rows.length,
  };
}

// ── 관측 한 번 ───────────────────────────────────────────────────

export interface ForeignProcessObservationInputs {
  lister: ProcessLister;
  fs: Pick<FsPort, "physicalKey">;
  /**
   * 호출자가 공유 실행 잠금과 증거 표지를 모두 얻었는가. true일 때만 목록을 읽는다. 잠금을 얻었다는 사실은 이 관측의 결과(건수)를
   * 바꾸지 않는다 — 잠금이 없으면 시도하지 않고 null이며, 있어도 건수는 목록에서만 나온다.
   */
  lockHeld: boolean;
  context: ForeignObservationContext;
  signal?: AbortSignal;
}

export interface ForeignProcessObservationResult {
  /** 하네스의 foreignServerProcesses. 확정하지 못했으면 null. */
  foreignServerProcesses: number | null;
  summary: ForeignServerObservationSummary;
}

const NOT_ESTABLISHED: ForeignServerObservationSummary["not_established"] = {
  semgrep_server_identification: "UNVERIFIED",
  foreign_server_tree_binding: "UNVERIFIED",
  hidden_processes: "NOT_OBSERVED",
};

function summaryOf(
  parts: Pick<ForeignServerObservationSummary, "status" | "failure"> &
    Partial<ForeignServerObservationSummary>
): ForeignServerObservationSummary {
  return {
    scope: "POINT_IN_TIME",
    foreign_server_processes: null,
    count_is_lower_bound: false,
    listing: { source: null, provenance: null, rows: null },
    counts: emptyCounts(),
    undetermined_reasons: {},
    not_established: { ...NOT_ESTABLISHED },
    ...parts,
  };
}

/**
 * 잠금 확인 → 목록 읽기 → 판정 → 증거용 요약. 던지지 않는다. 잠금이 없거나 이미 취소됐으면 아무것도 읽지 않는다. 읽지 못하거나
 * 판별하지 못하면 null이고, 어떤 경우에도 확인하지 못한 값을 0으로 보정하지 않는다.
 */
export async function runForeignProcessObservation(
  inputs: ForeignProcessObservationInputs
): Promise<ForeignProcessObservationResult> {
  const { lister, signal } = inputs;
  const listing = (rows: number | null): ForeignServerObservationSummary["listing"] => ({
    source: lister.source,
    provenance: lister.provenance,
    rows,
  });
  const notAttempted = (failure: ForeignObservationFailure): ForeignProcessObservationResult => ({
    foreignServerProcesses: null,
    summary: summaryOf({ status: "NOT_ATTEMPTED", failure }),
  });
  const listFailed = (failure: ProcessListFailure): ForeignProcessObservationResult => ({
    foreignServerProcesses: null,
    summary: summaryOf({ status: "FAILED", failure, listing: listing(null) }),
  });

  if (!inputs.lockHeld) return notAttempted("LOCK_NOT_HELD");
  if (signal?.aborted) return notAttempted("CANCELLED");

  let listed: Awaited<ReturnType<ProcessLister["list"]>>;
  try {
    listed = await lister.list(signal ? { signal } : {});
  } catch {
    return listFailed("UNEXPECTED_ERROR");
  }
  if (!listed.ok) {
    // 어댑터가 알 수 없는 토큰을 주면 성공으로 보정하지 않고 예기치 못한 오류로 기록한다.
    return listFailed(listed.failure);
  }
  // 읽는 사이 취소됐으면 목록이 있어도 쓰지 않는다.
  if (signal?.aborted) return listFailed("CANCELLED");

  let outcome: ForeignObservationOutcome;
  try {
    outcome = await observeForeignServers({ fs: inputs.fs }, listed.snapshot, inputs.context);
  } catch {
    return listFailed("UNEXPECTED_ERROR");
  }
  return {
    foreignServerProcesses: outcome.foreignServerProcesses,
    summary: summaryOf({
      status: outcome.status,
      failure: outcome.failure,
      foreign_server_processes: outcome.foreignServerProcesses,
      count_is_lower_bound: outcome.countIsLowerBound,
      listing: listing(outcome.rows),
      counts: outcome.counts,
      undetermined_reasons: outcome.undeterminedReasons,
    }),
  };
}

/**
 * 호출자가 준 관측 요약이 하네스에 넘긴 foreignServerProcesses와 모순되지 않는지 본다. 모순이면 사유 문구를, 아니면 null을 돌려준다.
 * 요약에 적힌 값과 사전 검사가 쓰는 값이 다르면 증거가 사실과 어긋나므로 쓰기 전에 거절한다.
 */
export function foreignObservationConflict(
  summary: ForeignServerObservationSummary,
  foreignServerProcesses: number | null
): string | null {
  if (summary.scope !== "POINT_IN_TIME") return "관측 범위가 조회 시점이 아니다";
  if (summary.foreign_server_processes !== foreignServerProcesses) {
    return "관측 요약의 건수가 foreignServerProcesses와 다르다";
  }
  if ((summary.status === "OBSERVED") !== (summary.foreign_server_processes !== null)) {
    return "관측 상태와 건수가 모순된다";
  }
  if (summary.status !== "OBSERVED" && summary.count_is_lower_bound) {
    return "확정되지 않은 관측에 하한 표시가 있다";
  }
  // 세부 건수가 상태·건수와 맞아야 한다(요약이 자기 모순이면 증거가 사실과 어긋난다).
  const c = summary.counts;
  const undeterminedTotal = c.servers_undetermined + c.role_undetermined;
  if (summary.status === "OBSERVED") {
    if (summary.failure !== null) return "확정된 관측에 실패 토큰이 있다";
    const n = summary.foreign_server_processes as number;
    if (c.servers_same_tree !== n) return "같은 트리 서버 건수가 확정된 건수와 다르다";
    if (summary.count_is_lower_bound !== (n > 0 && undeterminedTotal > 0)) {
      return "하한 표시가 판별하지 못한 후보 건수와 맞지 않는다";
    }
    if (n === 0 && undeterminedTotal > 0) return "0건으로 확정됐는데 판별하지 못한 후보가 있다";
  } else if (summary.status === "INCONCLUSIVE") {
    if (c.servers_same_tree !== 0 || undeterminedTotal === 0) {
      return "미확정 관측의 세부 건수가 상태와 맞지 않는다";
    }
  } else if (summary.failure === null) {
    return "실패·미시도 관측에 실패 토큰이 없다";
  }
  return null;
}
