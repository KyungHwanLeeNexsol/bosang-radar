import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { evaluateEngineReadySteps } from "./engine-ready-step";
import {
  PENDING_MARK,
  SECRET_VARIABLE,
  parseProcedureSteps,
  type ProcedureStep,
} from "./procedure-steps";
import { parseStageTable } from "./stage-table";
import {
  checkTransitions,
  checkTransitionsFromMarkdown,
  parseExposureOrder,
} from "./transition-list";

// SPEC-B2C-LAUNCH-001 M3b (REQ-B2CLAUNCH-011·012, AC-B2CLAUNCH-011의 런북 열람 조건) — 런북의
// `## 플래그 변경 절차` 절을 점검기와 같은 파서·검사로 읽어 기계로 확인한다. 이 시험이 보는 것은 절의 구조다.
// 운영 값(주소·연락처·담당자·기간·시크릿 값)은 이 절에 없어야 하고 있어서도 안 된다.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNBOOK = readFileSync(join(ROOT, ".moai/docs/launch-gate-runbook.md"), "utf-8").replace(
  /\r\n/g,
  "\n"
);

function sectionOf(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
}

const SECTION = sectionOf(RUNBOOK, "## 플래그 변경 절차");

function stepsOfSection(): ProcedureStep[] {
  const parsed = parseProcedureSteps(SECTION);
  expect(parsed.ok, parsed.ok ? "" : parsed.errors.join("\n")).toBe(true);
  return parsed.ok ? parsed.steps : [];
}

describe("런북 `## 플래그 변경 절차` 절", () => {
  it("절이 있고 순서 표와 단계 표를 모두 담는다", () => {
    expect(SECTION).not.toBe("");
    const order = parseExposureOrder(SECTION);
    expect(order.ok).toBe(true);
    expect(order.ok ? order.entries.length : 0).toBeGreaterThan(0);
    expect(parseProcedureSteps(SECTION).ok).toBe(true);
  });

  it("순서 표는 기록된 두 벡터와 결정 대기 항목 하나이고 근거를 모두 적는다", () => {
    const order = parseExposureOrder(SECTION);
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect(order.entries.map((entry) => entry.kind)).toEqual(["vector", "vector", "pending"]);
    for (const entry of order.entries) expect(entry.basis.length).toBeGreaterThan(0);
  });

  it("순서의 첫 벡터는 단계 정의 표의 배포 완료(dark) 벡터와 같은 세 칸을 가진다", () => {
    const stages = parseStageTable(RUNBOOK);
    expect(stages.ok).toBe(true);
    if (!stages.ok) return;
    const dark = stages.rows.find((row) => row.stage === "배포 완료(dark)");
    expect(dark?.vector).toBe("진단 게이트: 닫힘, 상담 화면: 닫힘, 상담 접수: 닫힘");

    const order = parseExposureOrder(SECTION);
    expect(order.ok).toBe(true);
    const first = order.ok ? order.entries[0] : undefined;
    expect(first?.kind).toBe("vector");
    if (first?.kind !== "vector") return;
    const v1 = first.vector;
    expect(`진단 게이트: ${v1.diagnosis}, 상담 화면: ${v1.screen}, 상담 접수: ${v1.intake}`).toBe(
      dark?.vector
    );
  });

  it("모든 플래그 변경 단계는 전 벡터와 후 벡터를 적거나 결정 대기로 표시하고 재시작은 한 번이다", () => {
    const steps = stepsOfSection();
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step.before.kind, `단계 ${step.step} 전 벡터`).not.toBe("unstated");
      expect(step.after.kind, `단계 ${step.step} 후 벡터`).not.toBe("unstated");
      expect(step.restarts, `단계 ${step.step} 재시작`).toBe(1);
    }
  });

  it("점검기는 이 절을 거부하지 않는다 — 결정 기록이 없는 전환만 BLOCKED이다", () => {
    const result = checkTransitionsFromMarkdown({ stepsMarkdown: SECTION, orderMarkdown: SECTION });
    expect(result.status).toBe("BLOCKED");
    expect(result.exitCode).toBe(3);
    expect(result.output).not.toMatch(/거부/);
    expect(result.output).toContain("BLOCKED 전환 번호: 2");
    expect(result.output).toContain("단계 1: 통과");
  });

  it("결정된 순서가 있는 첫 전환(단계 1)만 따로 점검하면 통과한다", () => {
    const steps = stepsOfSection().filter((step) => step.before.kind === "vector");
    const order = parseExposureOrder(SECTION);
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect(steps.map((step) => step.step)).toEqual([1]);
    expect(checkTransitions({ steps, order: order.entries }).status).toBe("PASS");
  });

  it("결정 대기로 둔 단계는 순서 표의 결정 대기 항목과 짝이다 — 순서를 지어내지 않았다", () => {
    const pending = stepsOfSection().filter(
      (step) => step.before.kind === "pending" || step.after.kind === "pending"
    );
    expect(pending.length).toBeGreaterThan(0);
    for (const step of pending) {
      expect(step.before.kind).toBe("pending");
      expect(step.after.kind).toBe("pending");
    }
    expect(SECTION).toContain(PENDING_MARK);
  });

  it("시크릿을 설정하는 단계는 CONSULT_POLICY_READY를 true로 바꾸는 같은 재시작 단계이고 REQ-B2CCONSULTOPS-011을 가리킨다", () => {
    const steps = stepsOfSection();
    const secretSteps = steps.filter((step) =>
      step.variables.some((variable) => variable.name === SECRET_VARIABLE)
    );
    expect(secretSteps).toHaveLength(1);
    expect(
      secretSteps[0].variables.some(
        (variable) => variable.name === "CONSULT_POLICY_READY" && variable.value === "true"
      )
    ).toBe(true);
    // 반대 방향: CONSULT_POLICY_READY를 true로 바꾸는 단계는 모두 시크릿을 같은 단계에서 설정한다.
    for (const step of steps) {
      const turnsOnPolicy = step.variables.some(
        (variable) => variable.name === "CONSULT_POLICY_READY" && variable.value === "true"
      );
      const setsSecret = step.variables.some((variable) => variable.name === SECRET_VARIABLE);
      expect(setsSecret, `단계 ${step.step}`).toBe(turnsOnPolicy);
    }
    expect(SECTION).toContain("REQ-B2CCONSULTOPS-011");
  });

  it("선행 조건으로 REQ-B2CLAUNCH-002·008·012를 가리키고 점검기가 못 보는 것을 적는다", () => {
    for (const id of ["REQ-B2CLAUNCH-002", "REQ-B2CLAUNCH-008", "REQ-B2CLAUNCH-012"]) {
      expect(SECTION, id).toContain(id);
    }
    expect(SECTION).toContain("알 수 없다");
  });

  it("운영 호스트에서 D(ENABLE_DIAGNOSIS_DEV_STATES)를 true로 설정하지 않고 review 경로 벡터도 쓰지 않는다", () => {
    for (const step of stepsOfSection()) {
      expect(
        step.variables.some(
          (variable) => variable.name === "ENABLE_DIAGNOSIS_DEV_STATES" && variable.value === "true"
        ),
        `단계 ${step.step}`
      ).toBe(false);
    }
    const tables = SECTION.split("\n")
      .filter((line) => line.trim().startsWith("|"))
      .join("\n");
    expect(tables).not.toContain("review 경로");
    expect(tables).not.toContain("열림(둘 다)");
  });

  it("값 금지: 주소·이메일·시크릿 값처럼 보이는 것이 절에 없다", () => {
    expect(SECTION).not.toMatch(/https?:\/\//i);
    expect(SECTION).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(SECTION).not.toMatch(/\b\d{2,3}-\d{3,4}-\d{4}\b/);
  });
});

describe("런북 절차에 대한 REQ-B2CLAUNCH-012 점검 (R-02 상태는 fixture 입력)", () => {
  it("R-02가 READY가 아니면 이 절의 운영 호스트 단계(엔진 준비 변수를 true로 설정)는 거부된다", () => {
    const result = evaluateEngineReadySteps(stepsOfSection(), "UNVERIFIED");
    expect(result.ok).toBe(false);
    expect(result.violations.map((violation) => violation.step)).toEqual([1]);
  });

  it("R-02가 READY이면 통과한다", () => {
    expect(evaluateEngineReadySteps(stepsOfSection(), "READY").ok).toBe(true);
  });

  it("R-02의 실제 판정은 상태 소스가 없어 BLOCKED이고 출력이 그렇게 적는다", () => {
    const result = evaluateEngineReadySteps(stepsOfSection(), undefined);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("R-02 실제 판정: BLOCKED");
  });
});
