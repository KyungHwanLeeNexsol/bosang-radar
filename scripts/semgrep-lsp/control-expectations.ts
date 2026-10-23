// 대조 기대 입력(data/control-expectations.json)의 위치와 읽기 — 하네스와 대조 기록 어댑터가 같은 입력을 같은 방식으로 읽는다.
//
// 하네스는 이 파일로 대조 단언을 만들고 대조 지문(control_sha256)을 계산한다. 대조 기록을 읽는 쪽(reference-record.ts)은 같은
// 파일에서 기록의 검사 목록이 갖춰야 할 모양을 도출한다. 두 곳이 파일 이름·경로·스키마 확인을 따로 갖지 않도록 여기 하나에 둔다.
// 기록이 스스로 주장하는 목록이나 검사 대상(--repo)에서 찾은 파일은 기준이 아니다.
//
// 공개 API:
//   CONTROL_EXPECTATIONS_FILE                      파일 이름
//   controlExpectationsPath(dataDir)               dataDir 아래의 경로(지문 계산에도 이 경로를 쓴다)
//   parseControlExpectations(bytes)                바이트 → 기대 목록 | 실패(코드·메시지). 던지지 않는다
//   readControlExpectations(fs, dataDir)           FsPort로 읽기 + 파싱. 던지지 않는다. 사례 필드 검증은 호출자 몫(controlCaseProblems)

import { SCHEMAS, type ControlExpectations, type FsPort } from "./types";

export const CONTROL_EXPECTATIONS_FILE = "control-expectations.json";

export function controlExpectationsPath(dataDir: string): string {
  return `${dataDir.replace(/[\\/]+$/, "")}/${CONTROL_EXPECTATIONS_FILE}`;
}

export type ControlExpectationsFailureCode =
  "READ_FAILED" | "INVALID_JSON" | "NOT_AN_OBJECT" | "SCHEMA_UNSUPPORTED";

export type ControlExpectationsParse =
  | { ok: true; expectations: ControlExpectations }
  | { ok: false; code: ControlExpectationsFailureCode; message: string };

const decoder = new TextDecoder();

/** 하네스가 고정 입력 단계에서 쓰는 검사와 같다: 스키마와 cases 배열만 본다. 사례 필드의 모양은 controlCaseProblems가 본다. */
export function parseControlExpectations(bytes: Uint8Array): ControlExpectationsParse {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    return {
      ok: false,
      code: "INVALID_JSON",
      message: `${CONTROL_EXPECTATIONS_FILE}: JSON이 아니다`,
    };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      code: "NOT_AN_OBJECT",
      message: `${CONTROL_EXPECTATIONS_FILE}: 최상위 값이 객체가 아니다`,
    };
  }
  const raw = value as Record<string, unknown>;
  if (raw.schema !== SCHEMAS.controlExpectations || !Array.isArray(raw.cases)) {
    return {
      ok: false,
      code: "SCHEMA_UNSUPPORTED",
      message: `${CONTROL_EXPECTATIONS_FILE}: 스키마·필수 필드가 맞지 않는다`,
    };
  }
  return { ok: true, expectations: raw as unknown as ControlExpectations };
}

/** dataDir의 기대 입력을 읽어 파싱한다. 읽기 실패의 메시지는 경로·시스템 오류가 섞일 수 있어 코드만 돌려준다. */
export async function readControlExpectations(
  fs: FsPort,
  dataDir: string
): Promise<ControlExpectationsParse> {
  let bytes: Uint8Array;
  try {
    bytes = await fs.readFile(controlExpectationsPath(dataDir));
  } catch {
    return {
      ok: false,
      code: "READ_FAILED",
      message: `${CONTROL_EXPECTATIONS_FILE}을(를) 읽지 못했다`,
    };
  }
  return parseControlExpectations(bytes);
}
