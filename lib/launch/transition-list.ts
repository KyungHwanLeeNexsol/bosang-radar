// SPEC-B2C-LAUNCH-001 M3b: 전환 목록 점검 (REQ-B2CLAUNCH-011, AC-B2CLAUNCH-011).
//
// 플래그 변경 절차의 각 단계는 환경을 바꾸는 재시작 한 번이고 게이트 상태 벡터 하나에서 벡터 하나로 옮기는
// 전환이다(spec.md §2.3 "벡터와 전환"). 점검기는 각 전환이 (1) 전·후 벡터를 §2.3의 어휘로 적었고 (2) 두 벡터가
// 모두 D-LAUNCH-03이 기록한 순서에 있으며 순서에서 인접하고 (3) 재시작이 정확히 한 번인지 본다. 순서는 입력이며
// 이 모듈은 어떤 순서도 기억하지 않는다 — 순서가 기록되지 않았으면(D-LAUNCH-03 결정 전) 통과가 아니라 BLOCKED다.
// 결정 대기로 둔 벡터가 있는 단계도 BLOCKED이고 통과로 읽지 않는다(fail-closed).
//
// 이 점검은 단계 표가 적은 벡터를 믿는다 — 설정 변수에서 벡터를 다시 계산하지 않고 단계가 이어지는지(앞 단계의
// 후 벡터와 다음 단계의 전 벡터가 같은지)도 보지 않는다. 운영 호스트에서 재시작이 실제로 한 번만 일어났는지도
// 알 수 없다. 출력은 전환 번호와 칸 이름만 적고 칸의 값은 되풀이하지 않는다.

import { findTableWithExtras } from "./markdown-table";
import {
  PENDING_MARK,
  SECRET_VARIABLE,
  parseGateVector,
  parseProcedureSteps,
  vectorKey,
  type GateVector,
  type ProcedureStep,
} from "./procedure-steps";
import { splitCells } from "./stage-table";

/** 노출 순서 표의 열. 런북 `## 플래그 변경 절차`의 순서 표와 같다. */
export const ORDER_COLUMNS = ["순번", "게이트 상태 벡터", "근거"] as const;

export type OrderEntry =
  { kind: "vector"; vector: GateVector; basis: string } | { kind: "pending"; basis: string };

export type ExposureOrderResult =
  { ok: true; entries: OrderEntry[] } | { ok: false; errors: string[] };

export interface TransitionFinding {
  step: number;
  reason: string;
}

export type TransitionStatus = "PASS" | "REJECT" | "BLOCKED";

export interface TransitionCheckResult {
  status: TransitionStatus;
  /** 확정된 위반(전환 번호와 이유). */
  violations: TransitionFinding[];
  /** 결정 대기 때문에 판정하지 못한 전환. */
  blocked: TransitionFinding[];
  output: string;
}

export interface MarkdownTransitionResult {
  /** 0 = 통과, 1 = 거부, 2 = 입력 거부(표 오류), 3 = BLOCKED. */
  exitCode: 0 | 1 | 2 | 3;
  status: TransitionStatus | "INPUT_ERROR";
  output: string;
}

/**
 * 노출 순서 표를 읽는다. 표가 없으면 오류가 아니라 순서가 기록되지 않은 것(빈 목록)이다 — 점검기가
 * BLOCKED로 읽는다. 표가 있는데 칸이 어휘 밖이거나 순번이 이어지지 않거나 같은 벡터가 겹치면 입력 거부다.
 */
export function parseExposureOrder(markdown: string): ExposureOrderResult {
  const table = findTableWithExtras(markdown.replace(/\r\n/g, "\n").split("\n"), ORDER_COLUMNS);
  if (table === null) return { ok: true, entries: [] };

  if (table.extras.length > 0) {
    return {
      ok: false,
      errors: table.extras.map(
        (extra) =>
          `"${extra}" 칸은 허용되지 않는다 — 노출 순서 표가 담는 칸은 ${ORDER_COLUMNS.join("·")}뿐이다`
      ),
    };
  }

  const errors: string[] = [];
  const entries: OrderEntry[] = [];
  const sequence: number[] = [];

  table.body.forEach((line, index) => {
    const cells = splitCells(line);
    const ordinal = `${index + 1}번째 행`;
    if (cells.length !== table.width) {
      errors.push(`${ordinal}의 칸이 ${cells.length}개다(${table.width}개여야 한다)`);
      return;
    }
    if (!/^[1-9]\d*$/.test(cells[0])) {
      errors.push(`${ordinal}의 "순번" 칸이 양의 정수가 아니다`);
      return;
    }
    const number = Number(cells[0]);
    sequence.push(number);

    const basis = cells[2];
    if (basis === "") errors.push(`순번 ${number}의 "근거" 칸이 비어 있다`);

    if (cells[1] === PENDING_MARK) {
      entries.push({ kind: "pending", basis });
      return;
    }
    const vector = parseGateVector(cells[1]);
    if (vector === null) {
      errors.push(`순번 ${number}의 "게이트 상태 벡터" 칸이 벡터 어휘도 ${PENDING_MARK}도 아니다`);
      return;
    }
    entries.push({ kind: "vector", vector, basis });
  });

  if (sequence.some((number, index) => number !== index + 1)) {
    errors.push("순번이 1부터 차례로 이어지지 않는다");
  }
  const keys = entries.flatMap((entry) =>
    entry.kind === "vector" ? [vectorKey(entry.vector)] : []
  );
  if (new Set(keys).size !== keys.length) errors.push("같은 벡터가 두 번 나온다");

  return errors.length === 0 ? { ok: true, entries } : { ok: false, errors };
}

const NO_ORDER_OUTPUT =
  "판정: BLOCKED — 노출 순서가 기록되지 않았다(D-LAUNCH-03 결정 기록의 벡터 순서가 입력에 없다). " +
  "순서 없이는 어떤 전환도 통과로 읽지 않는다";

/** 전환 목록을 순서와 대조한다. 입력을 바꾸지 않는다. */
export function checkTransitions(input: {
  steps: readonly ProcedureStep[];
  order: readonly OrderEntry[];
}): TransitionCheckResult {
  const { steps, order } = input;
  if (!order.some((entry) => entry.kind === "vector")) {
    return { status: "BLOCKED", violations: [], blocked: [], output: NO_ORDER_OUTPUT };
  }

  const positions = new Map<string, number>();
  order.forEach((entry, index) => {
    if (entry.kind === "vector") positions.set(vectorKey(entry.vector), index);
  });

  const lines: string[] = [];
  const violations: TransitionFinding[] = [];
  const blocked: TransitionFinding[] = [];

  for (const step of steps) {
    const rejections: string[] = [];
    const pending: string[] = [];

    if (step.restarts !== 1) rejections.push("재시작 횟수가 1이 아니다");

    const stated = [
      { label: "전", side: step.before },
      { label: "후", side: step.after },
    ];
    const [from, to] = stated.map(({ label, side }) => {
      if (side.kind === "unstated") {
        rejections.push(`${label} 벡터를 적지 않았다`);
      } else if (side.kind === "pending") {
        pending.push(`${label} 벡터가 ${PENDING_MARK}다`);
      } else {
        const position = positions.get(vectorKey(side.vector));
        if (position === undefined) rejections.push(`${label} 벡터가 순서에 기록된 벡터가 아니다`);
        return position;
      }
      return undefined;
    });

    if (from !== undefined && to !== undefined) {
      if (from === to) {
        rejections.push("전 벡터와 후 벡터가 같다 — 전환이 아니다");
      } else if (Math.abs(from - to) !== 1) {
        // 두 벡터 사이에 결정 대기 항목이 있으면 그 자리가 무엇이 될지 몰라 인접 여부를 판정할 수 없다.
        const between = order.slice(Math.min(from, to) + 1, Math.max(from, to));
        if (between.some((entry) => entry.kind === "pending")) {
          pending.push("순서의 사이 항목이 결정 대기라 인접 여부를 판정할 수 없다");
        } else {
          rejections.push("순서의 인접한 두 벡터 사이가 아니다");
        }
      }
    }

    // REQ-B2CCONSULTOPS-011: 시크릿은 CONSULT_POLICY_READY를 true로 바꾸는 같은 재시작에 함께 설정한다.
    const setsSecret = step.variables.some((variable) => variable.name === SECRET_VARIABLE);
    const turnsOnPolicy = step.variables.some(
      (variable) => variable.name === "CONSULT_POLICY_READY" && variable.value === "true"
    );
    if (setsSecret !== turnsOnPolicy) {
      rejections.push("시크릿 설정과 CONSULT_POLICY_READY=true 설정이 같은 단계에 있지 않다");
    }

    if (rejections.length > 0) {
      const reason = rejections.join("; ");
      violations.push({ step: step.step, reason });
      lines.push(`단계 ${step.step}: 거부 — ${reason}`);
    } else if (pending.length > 0) {
      const reason = pending.join("; ");
      blocked.push({ step: step.step, reason });
      lines.push(`단계 ${step.step}: BLOCKED — ${reason}`);
    } else {
      lines.push(`단계 ${step.step}: 통과`);
    }
  }

  const numbers = (findings: TransitionFinding[]) => findings.map((f) => f.step).join(", ");
  if (violations.length > 0) lines.push(`위반한 전환 번호: ${numbers(violations)}`);
  if (blocked.length > 0) lines.push(`BLOCKED 전환 번호: ${numbers(blocked)}`);

  const status: TransitionStatus =
    violations.length > 0 ? "REJECT" : blocked.length > 0 ? "BLOCKED" : "PASS";
  const verdict = { PASS: "통과", REJECT: "거부", BLOCKED: "BLOCKED" }[status];
  lines.push(`판정: ${verdict}`);

  return { status, violations, blocked, output: lines.join("\n") };
}

const EXIT_CODES = { PASS: 0, REJECT: 1, BLOCKED: 3 } as const;

/**
 * 마크다운 문서로 받은 단계 표와 순서 표를 읽은 뒤 점검한다. 순서 문서가 없거나 순서 표가 없으면 순서가
 * 기록되지 않은 것이라 BLOCKED다. 표의 칸 오류는 입력 거부(2)이고 단계 표 오류가 순서 표 오류보다 앞선다.
 */
export function checkTransitionsFromMarkdown(input: {
  stepsMarkdown: string;
  orderMarkdown?: string;
}): MarkdownTransitionResult {
  const steps = parseProcedureSteps(input.stepsMarkdown);
  if (!steps.ok) {
    return {
      exitCode: 2,
      status: "INPUT_ERROR",
      output: steps.errors.map((error) => `단계 표 오류: ${error}`).join("\n"),
    };
  }

  const order =
    input.orderMarkdown === undefined
      ? ({ ok: true, entries: [] } as const)
      : parseExposureOrder(input.orderMarkdown);
  if (!order.ok) {
    return {
      exitCode: 2,
      status: "INPUT_ERROR",
      output: order.errors.map((error) => `노출 순서 표 오류: ${error}`).join("\n"),
    };
  }

  const result = checkTransitions({ steps: steps.steps, order: order.entries });
  return { exitCode: EXIT_CODES[result.status], status: result.status, output: result.output };
}
