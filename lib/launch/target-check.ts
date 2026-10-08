// SPEC-B2C-LAUNCH-001 M1b: 대상 값·무효화 사건 판정과 덮는 파일 목록 검사 (REQ-B2CLAUNCH-005).
//
// 점검기는 기록의 상태 칸과 입력으로 받은 현재 대상 값·사건만 읽는다. 대상 값을 계산하는 일과
// 사건이 일어났는지 알아채는 일은 호출하는 절차의 몫이며 이 모듈은 둘 다 하지 않는다
// (acceptance.md AC-B2CLAUNCH-002·005 "이 AC가 보지 못하는 것").

import type { ItemStatus, RecordItem } from "./gate-record";

export interface EffectiveStatus {
  status: ItemStatus;
  /** READY가 UNVERIFIED로 바뀐 이유. 기록 상태 그대로면 없다. */
  reason?: string;
}

/**
 * 기록 상태를 점검 시점의 유효 상태로 바꾼다. READY만 되돌릴 수 있고 올리는 일은 없다.
 * READY는 (1) 현재 대상 값이 기록된 값과 같고 (2) 그 항목의 무효화 사건이 관측 뒤에 일어나지 않았을 때만 유지된다.
 * 현재 대상 값이 넘어오지 않았으면 같다고 확인할 수 없으므로 UNVERIFIED다(fail-closed).
 *
 * 감시하는 사건은 기록 행의 무효화 사건 칸(`item.events`)과 항목 정의표가 그 항목에 정한 사건(`definedEvents`)의
 * 합집합이다. 기록이 정의표의 사건을 빼고 적어도 그 사건이 일어나면 강등되어야 하므로(기록을 바꿔 점검을 우회하지
 * 못하게), 정의표가 정한 사건은 기록 칸에 적혔는지와 무관하게 감시한다. 기록 칸에만 있는 사건도 그대로 감시한다.
 */
export function resolveEffectiveStatus(
  item: RecordItem,
  currentTarget: string | undefined,
  eventsAfterObservation: readonly string[],
  definedEvents: readonly string[] = []
): EffectiveStatus {
  if (item.status !== "READY") return { status: item.status };

  if (currentTarget === undefined) {
    return {
      status: "UNVERIFIED",
      reason: "현재 대상 값이 넘어오지 않아 기록된 대상 값과 같은지 확인할 수 없다",
    };
  }
  if (currentTarget !== item.target) {
    return { status: "UNVERIFIED", reason: "기록된 대상 값이 현재 대상 값과 다르다" };
  }
  const watched = new Set([...item.events, ...definedEvents]);
  const occurred = [...new Set(eventsAfterObservation.filter((event) => watched.has(event)))];
  if (occurred.length > 0) {
    const omitted = occurred.filter((event) => !item.events.includes(event));
    return {
      status: "UNVERIFIED",
      reason:
        `관측 뒤에 무효화 사건 ${occurred.join(", ")}이(가) 일어났다` +
        (omitted.length > 0
          ? ` — ${omitted.join(", ")}은(는) 기록의 무효화 사건 칸에 없지만 항목 정의표가 정한 사건이다`
          : ""),
    };
  }
  return { status: "READY" };
}

export interface CoveringList {
  id: string;
  files: readonly string[];
}

function normalizePath(file: string): string {
  return file
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "");
}

/**
 * 덮는 파일 목록 검사: 어느 항목의 목록에도 go/no-go 기록 파일과 증거 기록 파일이 들어 있으면 안 된다
 * (기록만 바꾸는 커밋이 항목을 스스로 무효화하지 않게 하기 위해서다). 금지 파일 경로는 호출하는 쪽의 입력이다.
 * 목록 항목이 금지 파일과 같은 경로이거나, 금지 파일을 품은 디렉터리(`/`로 끝남)여도 거부한다.
 */
export function coveringFileListErrors(
  lists: readonly CoveringList[],
  forbiddenFiles: readonly string[]
): string[] {
  const forbidden = forbiddenFiles.map(normalizePath);
  const errors: string[] = [];

  for (const list of lists) {
    for (const file of list.files) {
      const path = normalizePath(file);
      const hit = forbidden.find(
        (target) => path === target || (path.endsWith("/") && target.startsWith(path))
      );
      if (hit !== undefined) {
        errors.push(
          `"${list.id}" 항목의 덮는 파일 목록에 기록 파일 "${hit}"가 들어 있다(${file}) — 기록 파일은 어느 항목의 덮는 집합에도 넣지 않는다`
        );
      }
    }
  }
  return errors;
}
