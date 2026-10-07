// SPEC-B2C-LAUNCH-001 M1d: go 서명 기록 파서와 판정 (REQ-B2CLAUNCH-008, AC-B2CLAUNCH-008).
//
// 서명 기록은 마크다운 문서이고(D-LAUNCH-04 형식 (i)) 표 둘을 담는다 — 서명 행(역할·날짜·실행 환경)과
// 서명 시점의 항목 상태·대상 값 전체. 허용 역할 목록은 D-LAUNCH-04의 결정이며 코드에 박지 않고 호출하는 쪽이
// 넘긴다(결정이 바뀌는 것은 무효화 사건이다). 이 모듈이 강제하는 것은 역할의 목록 소속뿐이다 — 세 역할이 모두
// 서명해야 하는지(서명자 구성, U3)는 확인 대기라 정하지 않았다.
//
// 오류·판정 메시지는 서명 행의 역할·날짜 칸 값과 열거 밖 칸의 값을 적지 않고 서명 행 번호와 칸 이름만 적는다:
// 그 칸에 이름·연락처가 잘못 들어가도 검증 출력에 되풀이되지 않게 하려는 것이다(REQ-B2CLAUNCH-007).

import { ITEM_STATUSES, type ItemStatus } from "./gate-record";
import { findTableBody } from "./markdown-table";
import { splitCells } from "./stage-table";

export const SIGNATURE_ENVIRONMENTS = ["local", "production"] as const;
export type SignatureEnvironment = (typeof SIGNATURE_ENVIRONMENTS)[number];

/** 서명 행 표의 열. 런북 "서명 기록 양식" 절과 같다. */
export const SIGNER_COLUMNS = ["서명 역할", "날짜", "실행 환경"] as const;
/** 서명 시점 항목 표의 열. 기록 표의 식별자·상태·대상만 서명 시점 값으로 옮긴다. */
export const SNAPSHOT_COLUMNS = ["식별자", "상태", "대상"] as const;

export interface SignatureSigner {
  role: string;
  date: string;
  environment: SignatureEnvironment;
}

export interface SignatureSnapshotItem {
  id: string;
  status: ItemStatus;
  target: string;
}

export interface SignatureRecord {
  signers: readonly SignatureSigner[];
  snapshot: readonly SignatureSnapshotItem[];
}

export type SignatureResult =
  { ok: true; record: SignatureRecord } | { ok: false; errors: string[] };

function isEnvironment(value: string): value is SignatureEnvironment {
  return (SIGNATURE_ENVIRONMENTS as readonly string[]).includes(value);
}

function isItemStatus(value: string): value is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value);
}

export function parseSignatureRecord(markdown: string): SignatureResult {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const signerBody = findTableBody(lines, SIGNER_COLUMNS);
  const snapshotBody = findTableBody(lines, SNAPSHOT_COLUMNS);

  const errors: string[] = [];
  if (signerBody === null) {
    errors.push(`서명 표(헤더: ${SIGNER_COLUMNS.join("·")})를 찾지 못했다`);
  }
  if (snapshotBody === null) {
    errors.push(`서명 시점 항목 표(헤더: ${SNAPSHOT_COLUMNS.join("·")})를 찾지 못했다`);
  }
  if (signerBody === null || snapshotBody === null) return { ok: false, errors };

  const signers: SignatureSigner[] = [];
  signerBody.forEach((line, index) => {
    const row = `서명 행 ${index + 1}`;
    const cells = splitCells(line);
    if (cells.length !== SIGNER_COLUMNS.length) {
      errors.push(`${row}의 칸이 ${cells.length}개다(${SIGNER_COLUMNS.length}개여야 한다)`);
      return;
    }
    const [role, date, environment] = cells;
    if (role === "") errors.push(`${row}의 "서명 역할" 칸이 비어 있다`);
    if (date === "") errors.push(`${row}의 "날짜" 칸이 비어 있다`);
    if (!isEnvironment(environment)) {
      errors.push(
        `${row}의 "실행 환경" 칸이 비어 있거나 ${SIGNATURE_ENVIRONMENTS.join("·")} 밖의 값이다`
      );
    }
    if (role !== "" && date !== "" && isEnvironment(environment)) {
      signers.push({ role, date, environment });
    }
  });

  const snapshot: SignatureSnapshotItem[] = [];
  const seen = new Map<string, number>();
  for (const line of snapshotBody) {
    const cells = splitCells(line);
    const id = cells[0];
    if (id === "") {
      errors.push("서명 시점 항목 표에 식별자 칸이 비어 있는 행이 있다");
      continue;
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);
    if (cells.length !== SNAPSHOT_COLUMNS.length) {
      errors.push(
        `"${id}" 항목 행의 칸이 ${cells.length}개다(${SNAPSHOT_COLUMNS.length}개여야 한다)`
      );
      continue;
    }
    const [, status, target] = cells;
    if (!isItemStatus(status)) {
      errors.push(`"${id}" 항목의 서명 시점 상태가 ${ITEM_STATUSES.join("·")} 중 하나가 아니다`);
      continue;
    }
    if (status === "READY" && target === "") {
      errors.push(`"${id}" 항목은 READY인데 "대상" 칸이 비어 있다`);
      continue;
    }
    snapshot.push({ id, status, target });
  }
  for (const [id, count] of seen) {
    if (count > 1) errors.push(`"${id}" 항목이 서명 시점 항목 표에 ${count}번 나온다`);
  }

  return errors.length === 0 ? { ok: true, record: { signers, snapshot } } : { ok: false, errors };
}

export interface SignatureContext {
  /** 서명할 수 있는 역할 목록. D-LAUNCH-04의 결정을 호출하는 쪽이 넘긴다(비어 있으면 모든 역할이 거부된다). */
  allowedRoles: readonly string[];
  /** 점검 요청의 실행 환경. 서명의 실행 환경이 이와 같아야 한다. */
  requestEnvironment: SignatureEnvironment;
  /** 서명 시점 항목의 점검 시점 유효 상태. 현재 기록에 없는 항목이면 undefined. */
  currentStatus: (id: string) => ItemStatus | undefined;
}

/**
 * 서명 점검. 문제가 없으면 빈 목록이다. 서명 기록이 없거나 서명 행이 없으면 서명 없음이고(기본값은 통과가 아니다),
 * 허용 목록 밖의 역할·요청 형태와 다른 실행 환경·서명 뒤 UNVERIFIED가 된 항목을 각각 이유로 적는다.
 * 서명 시점의 대상 값은 기록에 담긴 사실로 보존할 뿐 이 점검이 현재 값과 비교하지는 않는다 — 항목이 현재도
 * 유효한지는 항목 점검의 유효 상태가 정한다.
 */
export function judgeSignature(
  record: SignatureRecord | undefined,
  context: SignatureContext
): string[] {
  if (record === undefined) return ["서명 없음 — 서명 기록이 넘어오지 않았다"];
  if (record.signers.length === 0) return ["서명 없음 — 서명 표에 서명 행이 없다"];

  const problems: string[] = [];
  record.signers.forEach((signer, index) => {
    const row = `서명 행 ${index + 1}`;
    if (!context.allowedRoles.includes(signer.role)) {
      problems.push(`${row}의 역할이 허용 역할 목록에 없다`);
    }
    if (signer.environment !== context.requestEnvironment) {
      problems.push(
        `${row}의 실행 환경(${signer.environment})이 요청 형태(${context.requestEnvironment})와 다르다`
      );
    }
  });

  if (record.snapshot.length === 0) {
    problems.push("서명이 덮는 항목이 없다 — 서명 시점 항목 표가 비어 있다");
  }
  for (const item of record.snapshot) {
    const current = context.currentStatus(item.id);
    if (current === undefined) {
      problems.push(`서명 대상 항목 ${item.id}가 현재 기록에 없다`);
    } else if (current === "UNVERIFIED") {
      problems.push(`서명 뒤 ${item.id}가 UNVERIFIED가 되었다`);
    }
  }
  return problems;
}
