// SPEC-B2C-LAUNCH-001 M5 (REQ-B2CLAUNCH-014, AC-B2CLAUNCH-014) — 롤백 로컬 시험의 판정 로직.
//
// 열린 벡터(진단 production 경로 + 상담 열림 + 시험용 시크릿)에서 합성 접수 1건을 저장한 뒤, 5종 플래그를 true가
// 아닌 값으로 되돌려 다시 시작한 서버에서 관측한 것을 기대와 대조한다. 서버를 띄우는 일은
// scripts/verify-rollback-dark.ts가 하고 이 모듈은 관측을 받아 판정·출력·해시만 한다(순수 함수).
//
// 이 관측은 게이트 함수·경로의 로컬 검증이다. 운영 PM2가 바뀐 환경을 다시 읽는지, 이후 배포의 평범한 재시작이
// dark 상태를 유지하는지는 알 수 없다(R-04, CONSULTOPS-001 E-03이 다룬다).

import { createHash } from "node:crypto";
import { FLAG_VARIABLES, SECRET_VARIABLE } from "./procedure-steps";

type EnvLike = Readonly<Record<string, string | undefined>>;

/** 닫힌 화면의 `<title>`(scripts/verify-gate-reachability.ts의 CLOSED_TITLE과 같은 문구다). */
export const CLOSED_TITLE = "서비스 준비 중";
export const EXPECTED_SEED_STATUS = 201;
export const EXPECTED_API_STATUS = 503;
export const EXPECTED_API_CODE = "policy_unavailable";
/** 롤백 뒤 placeholder여야 하는 세 경로(AC-B2CLAUNCH-014). */
export const CLOSED_PAGES = ["/", "/result", "/consult"] as const;
export type ClosedPage = (typeof CLOSED_PAGES)[number];

/** 한 경로의 응답에서 읽은 것: `<title>`과 본문의 placeholder 문구 유무. */
export interface PageObservation {
  readonly title: string | null;
  readonly hasPlaceholder: boolean;
}

export interface RollbackObservation {
  /** 롤백 전(열린 벡터)의 전제 관측. */
  readonly open: {
    /** 합성 접수 요청(POST /api/consultations)의 응답 상태 */
    readonly seedStatus: number;
    readonly pages: Readonly<Record<ClosedPage, PageObservation>>;
  };
  readonly rowsBefore: number;
  readonly hashBefore: string;
  /** 롤백 뒤 서버의 세 경로 */
  readonly pages: Readonly<Record<ClosedPage, PageObservation>>;
  /** 롤백 뒤 접수 API 응답(스키마를 통과하는 요청의 응답) */
  readonly apiStatus: number;
  readonly apiCode: string | null;
  readonly rowsAfter: number;
  readonly hashAfter: string;
  /** 롤백 재시작에 넘긴 환경에서 아직 true인 플래그 이름 */
  readonly flagsStillTrue: readonly string[];
  /** 롤백 재시작에 넘긴 환경에서 시크릿이 설정 상태인가(값은 읽지 않는다) */
  readonly secretConfigured: boolean;
}

export interface RollbackCheck {
  readonly label: string;
  readonly expected: string;
  readonly observed: string;
  readonly ok: boolean;
}

const isClosedPage = (page: PageObservation) => page.hasPlaceholder && page.title === CLOSED_TITLE;
const isOpenPage = (page: PageObservation) => !page.hasPlaceholder && page.title !== CLOSED_TITLE;

const describePage = (page: PageObservation) =>
  `제목 "${page.title ?? "(없음)"}", placeholder 문구 ${page.hasPlaceholder ? "있음" : "없음"}`;

/** 관측을 기대와 항목별로 대조한다. 판정·출력이 같은 항목 목록을 쓴다. */
export function rollbackChecks(observed: RollbackObservation): RollbackCheck[] {
  const checks: RollbackCheck[] = [];

  checks.push({
    label: "롤백 전 합성 접수 상태",
    expected: String(EXPECTED_SEED_STATUS),
    observed: String(observed.open.seedStatus),
    ok: observed.open.seedStatus === EXPECTED_SEED_STATUS,
  });
  for (const page of CLOSED_PAGES) {
    const opened = observed.open.pages[page];
    checks.push({
      label: `롤백 전 ${page}`,
      expected: "열림(placeholder 아님)",
      observed: describePage(opened),
      ok: isOpenPage(opened),
    });
  }
  checks.push({
    label: "롤백 전 행 수",
    expected: "1",
    observed: String(observed.rowsBefore),
    ok: observed.rowsBefore === 1,
  });

  for (const page of CLOSED_PAGES) {
    const closed = observed.pages[page];
    checks.push({
      label: `롤백 뒤 ${page}`,
      expected: `placeholder(제목 "${CLOSED_TITLE}" + 문구 있음)`,
      observed: describePage(closed),
      ok: isClosedPage(closed),
    });
  }
  checks.push({
    label: "롤백 뒤 접수 API 상태",
    expected: String(EXPECTED_API_STATUS),
    observed: String(observed.apiStatus),
    ok: observed.apiStatus === EXPECTED_API_STATUS,
  });
  checks.push({
    label: "롤백 뒤 접수 API 오류 코드",
    expected: EXPECTED_API_CODE,
    observed: observed.apiCode ?? "(없음)",
    ok: observed.apiCode === EXPECTED_API_CODE,
  });
  checks.push({
    label: "롤백 뒤 행 수",
    expected: `롤백 전과 같음(${observed.rowsBefore})`,
    observed: String(observed.rowsAfter),
    ok: observed.rowsAfter === observed.rowsBefore,
  });
  checks.push({
    label: "롤백 뒤 전체 열 해시",
    expected: `롤백 전과 같음(${observed.hashBefore.slice(0, 12)})`,
    observed: observed.hashAfter.slice(0, 12),
    ok: observed.hashAfter === observed.hashBefore,
  });
  checks.push({
    label: "롤백 환경의 플래그",
    expected: "5종 모두 true가 아님",
    observed:
      observed.flagsStillTrue.length === 0
        ? "5종 모두 true가 아님"
        : `true인 플래그: ${observed.flagsStillTrue.join(", ")}`,
    ok: observed.flagsStillTrue.length === 0,
  });
  checks.push({
    label: "롤백 환경의 시크릿",
    expected: "설정됨(값 미출력)",
    observed: observed.secretConfigured ? "설정됨(값 미출력)" : "설정되지 않음",
    ok: observed.secretConfigured,
  });

  return checks;
}

/** 기대와 다른 관측을 한국어 한 줄씩 돌려준다. 빈 배열이면 기대와 모두 같다. */
export function compareRollbackObservation(observed: RollbackObservation): string[] {
  return rollbackChecks(observed)
    .filter((check) => !check.ok)
    .map((check) => `${check.label}: 기대 ${check.expected} / 관측 ${check.observed}`);
}

/** 기대와 관측을 한 줄씩 보여 주는 출력. 시크릿·DB 경로·행 내용은 적지 않는다(해시는 앞 12자만). */
export function formatRollbackReport(observed: RollbackObservation): string[] {
  const checks = rollbackChecks(observed);
  return [
    "## 롤백 로컬 시험 (AC-B2CLAUNCH-014)",
    "시작 조합: 진단 production 경로 열림 + 상담 화면·접수 열림 + 시험용 시크릿(값 미출력), DB=로컬 file, 롤백 = 5종 플래그를 true가 아닌 값으로 되돌려 재시작",
    ...checks.map(
      (check) =>
        `- ${check.label}: 기대 ${check.expected} / 관측 ${check.observed} ${check.ok ? "OK" : "MISMATCH"}`
    ),
    `불일치 관측 합계: ${checks.filter((check) => !check.ok).length}`,
  ];
}

// bigint는 JSON이 직렬화하지 못하고 바이트 배열은 모양을 잃으므로 값이 구별되는 문자열로 바꾼다.
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (value instanceof ArrayBuffer) return `bytes:${Buffer.from(value).toString("hex")}`;
  if (ArrayBuffer.isView(value)) {
    return `bytes:${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex")}`;
  }
  return value;
}

function canonical(row: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.keys(row)
      .sort()
      .map((key) => [key, row[key]])
  );
  return JSON.stringify(sorted, replacer);
}

/**
 * consultations 행 전체의 SHA-256(16진수). 행 순서와 열 순서에 의존하지 않고 모든 열의 값을 덮는다. 값 자체는
 * 출력하지 않고 해시만 비교에 쓴다.
 */
export function hashConsultationRows(rows: readonly Record<string, unknown>[]): string {
  const lines = rows.map(canonical).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/**
 * 롤백 재시작에 넘긴 환경에서 설정 여부만 읽는다: 5종 플래그 중 정확히 `true`인 것(게이트가 그 문자열만 켜짐으로
 * 읽는다)과 시크릿이 비어 있지 않은지. 시크릿 값은 결과에 담지 않는다.
 */
export function inspectRollbackEnv(env: EnvLike): {
  flagsStillTrue: string[];
  secretConfigured: boolean;
} {
  return {
    flagsStillTrue: FLAG_VARIABLES.filter((name) => env[name] === "true"),
    secretConfigured: (env[SECRET_VARIABLE] ?? "").trim() !== "",
  };
}
