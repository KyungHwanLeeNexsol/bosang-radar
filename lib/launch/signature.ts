// SPEC-B2C-LAUNCH-001 M1d: go 서명 기록 파서와 판정 (REQ-B2CLAUNCH-008, AC-B2CLAUNCH-008).
//
// 서명 기록은 마크다운 문서이고(D-LAUNCH-04 형식 (i)) 표 둘을 담는다 — 서명 행(역할·날짜·실행 환경)과
// 서명 시점의 항목 상태·대상 값 전체. 허용 역할 목록은 D-LAUNCH-04의 결정이며 코드에 박지 않고 호출하는 쪽이
// 넘긴다(결정이 바뀌는 것은 무효화 사건이다). 서명자에 대해 이 모듈이 강제하는 것은 역할의 목록 소속뿐이다 — 세 역할이
// 모두 서명해야 하는지(서명자 구성, U3)는 확인 대기라 정하지 않았다. 서명이 덮는 항목은 요청의 필수 항목 집합과
// 같아야 한다(필수 항목 집합은 호출하는 쪽이 넘긴다).
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
  /**
   * 서명 시점 항목의 현재 유효 항목의 대상 값(현재 기록이 담은 대상). 현재 기록에 없는 항목이면 undefined.
   * 필수 입력이다 — 이 값이 없으면 서명이 어느 대상에 대한 것인지 현재 항목과 대조할 수 없다.
   */
  currentTarget: (id: string) => string | undefined;
  /** 이 요청이 읽는 단계(또는 로컬 시험 판정)의 필수 항목 식별자. 서명이 덮는 항목 집합이 이와 같아야 한다. */
  requiredItemIds: readonly string[];
}

/**
 * 서명 점검. 문제가 없으면 빈 목록이다. 서명 기록이 없거나 서명 행이 없으면 서명 없음이고(기본값은 통과가 아니다),
 * 허용 목록 밖의 역할·요청 형태와 다른 실행 환경·서명이 덮는 항목 집합과 필수 항목 집합의 불일치·서명 뒤
 * UNVERIFIED가 된 항목을 각각 이유로 적는다.
 *
 * 서명이 덮은 필수 항목마다 두 가지를 더 본다(REQ-B2CLAUNCH-008, spec.md §2.4 "서명 기록"의 "대상과 대상 값").
 * (1) 서명 시점의 상태가 READY여야 한다 — 서명 시점에 BLOCKED·UNVERIFIED였던 항목을 서명이 보증했을 수 없다.
 * (2) 서명 시점의 대상 값이 현재 유효 항목의 대상 값과 같아야 한다 — 항목이 새 대상으로 READY가 되어도 이전 대상에
 *     대한 서명이 자동으로 이어지지 않으며, 새 대상에는 새 서명이 필요하다. 서명 뒤 UNVERIFIED가 된 항목은 위의
 *     "서명 뒤 UNVERIFIED" 이유로 따로 적는다. 필수 항목 집합 밖의 항목은 집합 불일치로 이미 거부하므로 여기서
 *     상태·대상을 다시 따지지 않는다. 이유에는 식별자와 상태 이름만 적고 대상 값은 적지 않는다.
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
    // 아무것도 덮지 않은 서명은 이 한 줄로 끝낸다 — 필수 항목마다 덮지 않았다고 되풀이하지 않는다.
    problems.push("서명이 덮는 항목이 없다 — 서명 시점 항목 표가 비어 있다");
  } else {
    // 서명이 덮는 항목 집합은 요청의 필수 항목 집합과 같아야 한다(REQ-B2CLAUNCH-008, AC (카)). SPEC 문구 그대로
    // 집합 동일성이므로 필수 항목을 빠뜨린 서명도, 필수가 아닌 항목(목적 단계 열이 해당 없음·열지 않는 표면·local의
    // 운영 한정 항목·면제된 결정 대기 칸의 항목)을 덮은 서명도 거부한다. 이유에는 식별자만 적고 값은 적지 않는다.
    const signed = new Set(record.snapshot.map((item) => item.id));
    const required = new Set(context.requiredItemIds);
    const uncovered = context.requiredItemIds.filter((id) => !signed.has(id));
    const outside = record.snapshot.map((item) => item.id).filter((id) => !required.has(id));
    if (uncovered.length > 0) {
      problems.push(`서명이 덮지 않은 필수 항목 식별자: ${uncovered.join(", ")}`);
    }
    if (outside.length > 0) {
      problems.push(`서명이 필수 항목 집합 밖의 항목을 덮는다 — 식별자: ${outside.join(", ")}`);
    }
  }
  const requiredIds = new Set(context.requiredItemIds);
  for (const item of record.snapshot) {
    const current = context.currentStatus(item.id);
    if (current === undefined) {
      problems.push(`서명 대상 항목 ${item.id}가 현재 기록에 없다`);
    } else if (current === "UNVERIFIED") {
      problems.push(`서명 뒤 ${item.id}가 UNVERIFIED가 되었다`);
    }

    if (!requiredIds.has(item.id)) continue;
    if (item.status !== "READY") {
      problems.push(`서명 시점 ${item.id}의 상태가 READY가 아니다(서명 시점 상태: ${item.status})`);
    }
    if (current !== undefined && context.currentTarget(item.id) !== item.target) {
      problems.push(
        `서명 시점 ${item.id}의 대상 값이 현재 유효 항목의 대상 값과 다르다 — 이전 대상에 대한 서명은 새 대상에 쓸 수 없다`
      );
    }
  }
  return problems;
}
