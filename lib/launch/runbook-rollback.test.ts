import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { FLAG_VARIABLES } from "./procedure-steps";
import { OBSERVATION_COLUMNS, parseObservationRecord } from "./observation-record";

// SPEC-B2C-LAUNCH-001 M5 (REQ-B2CLAUNCH-014·016, AC-B2CLAUNCH-014의 문서 열람 조건과 AC-B2CLAUNCH-016의 양식) —
// 런북의 `## 롤백 절차`와 `## 사후 관측 기록 양식` 절을 기계로 읽어 확인한다. 이 시험이 보는 것은 절의 구조와
// 참조·문장의 존재다. 운영 값(주소·연락처·담당자·기간·저장 위치·시크릿 값)은 이 절에 없어야 하고 있어서도 안 된다.

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

const ROLLBACK = sectionOf(RUNBOOK, "## 롤백 절차");
const OBSERVATION = sectionOf(RUNBOOK, "## 사후 관측 기록 양식");

function expectNoOperationalValues(section: string): void {
  expect(section).not.toMatch(/https?:\/\//i);
  expect(section).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  expect(section).not.toMatch(/\b\d{2,3}-\d{3,4}-\d{4}\b/);
  // 기간·시간 값(예: 30분, 2시간, 3일)을 적지 않는다.
  expect(section).not.toMatch(/\d+\s*(분|시간|일|초)(?![가-힣])/);
}

describe("런북 `## 롤백 절차` 절 (REQ-B2CLAUNCH-014, AC-B2CLAUNCH-014 열람 조건)", () => {
  it("절이 있다", () => {
    expect(ROLLBACK).not.toBe("");
  });

  it("선언 역할과 실행 역할을 역할 이름으로만 적는다(D-LAUNCH-07 결정)", () => {
    expect(ROLLBACK).toContain("운영 책임자");
    expect(ROLLBACK).toContain("제품 책임자");
    expect(ROLLBACK).toContain("둘 중 누구나");
    expect(ROLLBACK).toContain("운영 호스트 접근 보유자");
  });

  it("사유 목록·선언 역할·실행 역할의 기록(L-06, D-LAUNCH-07 결정 기록)을 가리킨다", () => {
    expect(ROLLBACK).toContain("L-06");
    expect(ROLLBACK).toContain("D-LAUNCH-07");
    expect(ROLLBACK).toContain(".moai/specs/SPEC-B2C-LAUNCH-001/progress.md");
  });

  it("사유 목록은 CONSULTOPS-001 §2.4의 작성자 기본 목록을 가리키기만 하고 목록을 옮겨 적지 않는다", () => {
    expect(ROLLBACK).toContain(".moai/specs/SPEC-B2C-CONSULTOPS-001/spec.md");
    expect(ROLLBACK).toContain("§2.4");
    // 기본 목록의 종류 문구를 옮겨 적으면 형제 기록과 어긋날 수 있다.
    for (const copied of [
      "사후 검증",
      "전제 변경",
      "시크릿 노출",
      "문구 오류",
      "x-forwarded-for",
    ]) {
      expect(ROLLBACK, copied).not.toContain(copied);
    }
  });

  it("진단 표면 전용 사유 2종((e)(f), 사용자 확인 전의 후속 변경안)을 사유로 적지 않는다", () => {
    for (const unapproved of ["잘못된 판정", "결과 매핑", "지원 범위 밖"]) {
      expect(ROLLBACK, unapproved).not.toContain(unapproved);
    }
  });

  it("롤백 목표는 배포 완료(dark) 벡터 하나이고 5종 플래그를 true가 아닌 값으로 되돌리는 환경 변경과 재시작이다", () => {
    expect(ROLLBACK).toContain("배포 완료(dark) 벡터");
    expect(ROLLBACK).toContain("5종");
    expect(ROLLBACK).toContain("`true`가 아닌 값");
    expect(ROLLBACK).toContain("재시작");
    for (const variable of FLAG_VARIABLES) expect(ROLLBACK, variable).toContain(variable);
    expect(ROLLBACK).toContain("이전 단계 벡터로의 부분 복귀");
  });

  it("되돌린 뒤 확인은 접수 행을 만들지 않는 읽기·요청뿐이고 기대 응답을 적는다", () => {
    expect(ROLLBACK).toContain("서비스 준비 중입니다");
    expect(ROLLBACK).toContain("503");
    expect(ROLLBACK).toContain("policy_unavailable");
    expect(ROLLBACK).toContain("접수 행을 만들지 않는");
  });

  it("롤백은 저장된 행과 시크릿 설정을 지우지 않는다고 적는다", () => {
    expect(ROLLBACK).toContain("롤백은 저장된 행과 시크릿 설정을 지우지 않는다");
  });

  it("상담 행 처분은 CONSULTOPS-001의 REQ-B2CCONSULTOPS-006·REQ-B2CCONSULTOPS-016을 가리킨다", () => {
    expect(ROLLBACK).toContain("REQ-B2CCONSULTOPS-006");
    expect(ROLLBACK).toContain("REQ-B2CCONSULTOPS-016");
  });

  it("재시작 전략은 R-04(CONSULTOPS-001 E-03)를 가리키고 이 절이 그것을 대신 판정하지 않는다고 적는다", () => {
    expect(ROLLBACK).toContain("R-04");
    expect(ROLLBACK).toContain("E-03");
    expect(ROLLBACK).toContain("다시 읽는지");
    expect(ROLLBACK).toContain("평범한 재시작");
  });

  it("로컬 시험(L-07)과 그 스크립트를 가리키고 로컬 시험이 보지 못하는 것을 적는다", () => {
    expect(ROLLBACK).toContain("L-07");
    expect(ROLLBACK).toContain("scripts/verify-rollback-dark.ts");
    expect(ROLLBACK).toContain("알 수 없다");
  });

  it("값 금지: 주소·이메일·연락처·기간 값이 절에 없다", () => {
    expectNoOperationalValues(ROLLBACK);
  });
});

describe("런북 `## 사후 관측 기록 양식` 절 (REQ-B2CLAUNCH-016, AC-B2CLAUNCH-016)", () => {
  it("절이 있고 헤더 줄이 검사기의 칸과 같다", () => {
    expect(OBSERVATION).not.toBe("");
    expect(OBSERVATION).toContain(`| ${OBSERVATION_COLUMNS.join(" | ")} |`);
  });

  it("양식은 값이 든 행을 담지 않는다 — 검사기가 이 양식 자체를 기록으로 통과시키지 않는다", () => {
    const result = parseObservationRecord(OBSERVATION);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toEqual([expect.stringContaining("행이 없다")]);
  });

  it("D-LAUNCH-08 결정과 L-09, REQ-B2CLAUNCH-016을 가리키고 담당은 운영 책임자다", () => {
    expect(OBSERVATION).toContain("D-LAUNCH-08");
    expect(OBSERVATION).toContain("L-09");
    expect(OBSERVATION).toContain("REQ-B2CLAUNCH-016");
    expect(OBSERVATION).toContain("운영 책임자");
  });

  it("관측 수단은 기존·신규로 구분하고 신규는 도입하는 SPEC 식별자나 BLOCKED 사유를 적는다", () => {
    expect(OBSERVATION).toContain("기존");
    expect(OBSERVATION).toContain("신규");
    expect(OBSERVATION).toContain("BLOCKED 사유");
  });

  it("허용된 칸 밖의 칸을 거부한다고 적고 점검기가 못 보는 것을 적는다", () => {
    expect(OBSERVATION).toContain("허용된 칸 밖의 칸");
    expect(OBSERVATION).toContain("알 수 없다");
  });

  it("값 금지: 주소·이메일·연락처·기간 값이 절에 없다", () => {
    expectNoOperationalValues(OBSERVATION);
  });
});
