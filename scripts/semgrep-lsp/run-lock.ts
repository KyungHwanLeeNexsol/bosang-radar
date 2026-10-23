// 공유 실행 잠금의 핵심 로직(ADR C0 (e) "실행 잠금을 얻었다"). 파일 시스템은 RunLockPort로 받는다 — 실제 구현은
// run-lock-node.ts, 시험용 메모리 구현은 testing/memory-run-lock.ts.
//
// 잠금 범위: **서버가 스캔하는 트리 하나**(target은 스캔 트리, control은 대조 트리)다. 같은 트리를 가리키는 실행은 runId·
// evidenceRoot·mode가 달라도 같은 잠금을 두고 부딪힌다. 트리 경로의 정규화와 잠금 파일 위치는 포트가 정한다
// (run-lock-node.ts 머리 주석과 README "공유 실행 잠금"). 서로 겹치는 트리(한쪽이 다른 쪽의 하위 폴더)는 서로 막지 않는다.
//
// 이것은 실행별 증거 표지(`run.marker`)와 다르다: 표지는 같은 증거 폴더를 두 번 쓰지 않게 하는 실행별 파일이고, 이 잠금만이
// 서로 다른 실행 사이의 상호 배제다.
//
// 규칙:
//  · 획득은 원자적 배타 생성 한 번이다. 기다리거나 다시 시도하지 않고, 이미 있으면 거절한다.
//  · 잠금 파일에는 소유자(무작위 토큰, runId, mode, pid, hostname, 획득 시각)가 들어 있다. 해제는 자기 토큰이 든 파일만 지운다.
//  · 오래된 잠금은 **자동으로 지우지 않는다**. 소유자 프로세스의 생사도 확인하지 않는다. 거절하고 잠금 경로와 소유자 정보를
//    알려 주며, 운영자가 직접 확인한 뒤 지우는 방법은 README "공유 실행 잠금 — 오래된 잠금 복구"에 있다.
//  · 읽을 수 없는 소유자(만들다 만 파일, 깨진 내용, 알 수 없는 스키마)도 거절한다. 지우지 않는다.
//  · 어떤 실패도 던지지 않는다: 잠금을 얻지 못한 이유는 상태와 토큰으로 돌려준다.
//
// 이 파일은 런타임 import가 없다(타입만 가져온다). 자식 프로세스 경쟁 시험이 Node로 직접 실행할 수 있게 하기 위해서다.
//
// 공개 API:
//   acquireRunLock(port, request): Promise<AcquireOutcome>
//   releaseRunLock(port, handle): Promise<ReleaseOutcome>
//   lockSummaryOf(outcome, markerCreated): RunLockSummary
//   RunLockPort / RunLockHandle / HolderInfo / RUN_LOCK_SCHEMA / RECOVERY_HINT

import type { RunLockSummary } from "./types";

export const RUN_LOCK_SCHEMA = "semgrep-lsp-run-lock/1";

/** 오래된 잠금을 만났을 때 운영자에게 보여 줄 복구 안내(자세한 절차는 README). */
export const RECOVERY_HINT =
  "자동으로 지우지 않는다. 소유자(pid·hostname)가 실제로 끝났고 같은 트리에 semgrep 프로세스가 없음을 확인한 뒤 잠금 파일을 직접 지운다(README '오래된 잠금 복구').";

/** 트리 경로를 정규화한 결과. keySha256은 정규화한 키의 해시, lockPath는 잠금 파일의 경로다. */
export interface TreeResolution {
  keySha256: string;
  lockPath: string;
}

export interface RunLockPort {
  /** 트리 경로를 정규화해 키와 잠금 파일 위치를 정한다. 해석하지 못하면 던진다. */
  resolveTree(treePath: string): Promise<TreeResolution>;
  /** 추측할 수 없는 새 토큰. */
  newToken(): string;
  /** 이 프로세스의 식별과 현재 시각(ISO 8601). */
  identity(): { pid: number; hostname: string; nowIso: string };
  /** 없을 때만 만들고 내용을 쓴다(원자적). 이미 있으면 "EXISTS". 그 밖의 실패는 던지며, 만들다 만 파일은 지운다. */
  createExclusive(path: string, text: string): Promise<"CREATED" | "EXISTS">;
  /** 파일 내용. 없으면 null. 읽지 못하면 던진다. */
  read(path: string): Promise<string | null>;
  /** 파일을 지운다. 이미 없으면 false. */
  remove(path: string): Promise<boolean>;
}

/** 다른 실행의 소유자 정보(읽을 수 있을 때). 잠금 파일 내용에서 알려진 필드만 옮긴다. */
export interface HolderInfo {
  run_id: string;
  mode: string;
  pid: number;
  hostname: string;
  acquired_at: string;
}

export interface RunLockHandle {
  readonly lockPath: string;
  readonly token: string;
  readonly keySha256: string;
  /** 해제를 마쳤는가(두 번 해제하지 않는다). */
  released: boolean;
}

export type AcquireOutcome =
  | { state: "ACQUIRED"; handle: RunLockHandle; keySha256: string }
  | {
      state: "REFUSED";
      reason: "HELD_BY_OTHER" | "OWNER_UNREADABLE";
      keySha256: string;
      lockPath: string;
      holder: HolderInfo | null;
    }
  | {
      state: "ERROR";
      reason: "TREE_UNRESOLVABLE" | "ACQUIRE_FAILED";
      keySha256: string | null;
      lockPath: string | null;
      /** 시스템 오류 코드(EACCES 등). 메시지는 경로가 섞일 수 있어 옮기지 않는다. */
      code: string | null;
    };

export type ReleaseOutcome =
  | { state: "RELEASED" }
  | {
      state: "NOT_RELEASED";
      /** ALREADY_RELEASED: 이미 해제했다. MISSING: 파일이 없다. OTHER_OWNER: 소유자 토큰이 다르다(지우지 않았다).
       *  UNREADABLE: 내용을 읽을 수 없다(지우지 않았다). FAILED: 지우다 실패했다. */
      reason: "ALREADY_RELEASED" | "MISSING" | "OTHER_OWNER" | "UNREADABLE" | "FAILED";
    };

function codeOf(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code).slice(0, 32)
    : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 잠금 파일 내용에서 소유자 문서를 읽는다. 스키마와 토큰이 맞아야 소유자로 인정한다. */
function parseOwner(text: string): { token: string; holder: HolderInfo } | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(value) || value.schema !== RUN_LOCK_SCHEMA) return null;
  const { token, run_id, mode, pid, hostname, acquired_at } = value;
  if (
    typeof token !== "string" ||
    token.length < 16 ||
    typeof run_id !== "string" ||
    typeof mode !== "string" ||
    typeof pid !== "number" ||
    !Number.isInteger(pid) ||
    typeof hostname !== "string" ||
    typeof acquired_at !== "string"
  ) {
    return null;
  }
  return {
    token,
    holder: {
      run_id: run_id.slice(0, 128),
      mode: mode.slice(0, 16),
      pid,
      hostname: hostname.slice(0, 255),
      acquired_at: acquired_at.slice(0, 40),
    },
  };
}

// @MX:ANCHOR: [AUTO] 공유 실행 잠금의 획득 — CLI·자식 프로세스 경쟁 시험이 모두 이 함수로 얻는다.
// @MX:REASON: 획득은 포트의 배타 생성 한 번뿐이고, 이미 있으면 어떤 경우에도 지우지 않고 거절한다(오래된 잠금 자동 삭제 금지).
export async function acquireRunLock(
  port: RunLockPort,
  request: { treePath: string; runId: string; mode: string }
): Promise<AcquireOutcome> {
  let resolution: TreeResolution;
  try {
    resolution = await port.resolveTree(request.treePath);
  } catch (error) {
    return {
      state: "ERROR",
      reason: "TREE_UNRESOLVABLE",
      keySha256: null,
      lockPath: null,
      code: codeOf(error),
    };
  }
  const { keySha256, lockPath } = resolution;

  let token: string;
  let text: string;
  try {
    token = port.newToken();
    const who = port.identity();
    text = `${JSON.stringify({
      schema: RUN_LOCK_SCHEMA,
      token,
      run_id: request.runId,
      mode: request.mode,
      pid: who.pid,
      hostname: who.hostname,
      acquired_at: who.nowIso,
      tree_key_sha256: keySha256,
    })}\n`;
  } catch (error) {
    return { state: "ERROR", reason: "ACQUIRE_FAILED", keySha256, lockPath, code: codeOf(error) };
  }

  let created: "CREATED" | "EXISTS";
  try {
    created = await port.createExclusive(lockPath, text);
  } catch (error) {
    // 만들지 못했다(권한·읽기 전용 등). 얻지 못한 것이다 — 얻은 것으로 보정하지 않는다.
    return { state: "ERROR", reason: "ACQUIRE_FAILED", keySha256, lockPath, code: codeOf(error) };
  }
  if (created === "CREATED") {
    return {
      state: "ACQUIRED",
      handle: { lockPath, token, keySha256, released: false },
      keySha256,
    };
  }

  // 이미 있다: 누가 잡았는지 읽어 알려 주되, 어떤 경우에도 지우지 않는다.
  let existing: string | null;
  try {
    existing = await port.read(lockPath);
  } catch {
    return { state: "REFUSED", reason: "OWNER_UNREADABLE", keySha256, lockPath, holder: null };
  }
  const owner = existing === null ? null : parseOwner(existing);
  if (owner === null) {
    // 읽을 수 없거나(만들다 만 파일·깨진 내용·다른 스키마) 방금 사라졌다. 어느 쪽이든 이번 시도는 거절이다.
    return { state: "REFUSED", reason: "OWNER_UNREADABLE", keySha256, lockPath, holder: null };
  }
  return { state: "REFUSED", reason: "HELD_BY_OTHER", keySha256, lockPath, holder: owner.holder };
}

// @MX:WARN: [AUTO] 파일을 지우는 유일한 경로 — 자기 토큰이 확인된 잠금만 지운다.
// @MX:REASON: 토큰 확인을 빼면 다른 실행의 잠금을 지워 같은 트리를 두 실행이 쓰게 된다(구조 시험이 확인 순서를 지킨다).
/** 자기 토큰이 든 잠금만 지운다. 다른 실행의 잠금·읽을 수 없는 파일은 그대로 둔다. 던지지 않는다. */
export async function releaseRunLock(
  port: RunLockPort,
  handle: RunLockHandle
): Promise<ReleaseOutcome> {
  if (handle.released) return { state: "NOT_RELEASED", reason: "ALREADY_RELEASED" };
  let text: string | null;
  try {
    text = await port.read(handle.lockPath);
  } catch {
    return { state: "NOT_RELEASED", reason: "UNREADABLE" };
  }
  if (text === null) return { state: "NOT_RELEASED", reason: "MISSING" };
  const owner = parseOwner(text);
  if (owner === null) return { state: "NOT_RELEASED", reason: "UNREADABLE" };
  if (owner.token !== handle.token) return { state: "NOT_RELEASED", reason: "OTHER_OWNER" };
  try {
    const removed = await port.remove(handle.lockPath);
    handle.released = true;
    return removed ? { state: "RELEASED" } : { state: "NOT_RELEASED", reason: "MISSING" };
  } catch {
    return { state: "NOT_RELEASED", reason: "FAILED" };
  }
}

/** 증거에 남기는 요약. 경로·소유자 정보는 싣지 않는다. */
export function lockSummaryOf(outcome: AcquireOutcome, markerCreated: boolean): RunLockSummary {
  return {
    scope: "server-tree",
    tree_key_sha256: outcome.keySha256,
    state: outcome.state,
    reason: outcome.state === "ACQUIRED" ? null : outcome.reason,
    evidence_marker: markerCreated ? "CREATED" : "NOT_CREATED",
  };
}
