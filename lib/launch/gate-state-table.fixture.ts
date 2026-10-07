// SPEC-B2C-LAUNCH-001 M3a: 게이트 상태 표의 독립된 기대값(AC-B2CLAUNCH-010 시나리오 1).
//
// spec.md §2.3의 진단 표 8행·상담 표 4행과 "불가능 조합" 문단을 손으로 옮긴 리터럴이다. 두 게이트 함수
// (computeDiagnosisFlags·computeConsultFlags)를 호출해 만들지 않는다 — 표와 함수 출력이 어느 한쪽에서
// 어긋나면 이 값과의 대조가 실패해야 하기 때문이다(AC가 "표를 그 출력에서 생성하지 않고 독립된 기대값으로
// 비교해야 한다"고 적었다). 경로별 도달 칸은 spec.md §2.3 "경로별 도달 규칙"을 옮긴 것이다.

import {
  BOOT_IMPOSSIBLE,
  BOOT_POSSIBLE,
  DOC_FORBIDDEN_MARK,
  NO_MARK,
  type GateStateTables,
} from "./gate-state-table";

export const GATE_STATE_FIXTURE: GateStateTables = {
  diagnosis: [
    {
      f: false,
      e: false,
      d: false,
      productionReady: false,
      reviewEnabled: false,
      gate: "닫힘",
      home: "placeholder",
      result: "placeholder",
      mark: NO_MARK,
    },
    {
      f: false,
      e: false,
      d: true,
      productionReady: false,
      reviewEnabled: true,
      gate: "열림(review 경로)",
      home: "본 화면",
      result: "본 화면",
      mark: DOC_FORBIDDEN_MARK,
    },
    {
      f: false,
      e: true,
      d: false,
      productionReady: false,
      reviewEnabled: false,
      gate: "닫힘",
      home: "placeholder",
      result: "placeholder",
      mark: NO_MARK,
    },
    {
      f: false,
      e: true,
      d: true,
      productionReady: false,
      reviewEnabled: true,
      gate: "열림(review 경로)",
      home: "본 화면",
      result: "본 화면",
      mark: DOC_FORBIDDEN_MARK,
    },
    {
      f: true,
      e: false,
      d: false,
      productionReady: false,
      reviewEnabled: false,
      gate: "닫힘",
      home: "placeholder",
      result: "placeholder",
      mark: NO_MARK,
    },
    {
      f: true,
      e: false,
      d: true,
      productionReady: false,
      reviewEnabled: true,
      gate: "열림(review 경로)",
      home: "본 화면",
      result: "본 화면",
      mark: DOC_FORBIDDEN_MARK,
    },
    {
      f: true,
      e: true,
      d: false,
      productionReady: true,
      reviewEnabled: false,
      gate: "열림(production 경로)",
      home: "본 화면",
      result: "본 화면",
      mark: NO_MARK,
    },
    {
      f: true,
      e: true,
      d: true,
      productionReady: true,
      reviewEnabled: true,
      gate: "열림(둘 다)",
      home: "본 화면",
      result: "본 화면",
      mark: DOC_FORBIDDEN_MARK,
    },
  ],
  consult: [
    {
      c: false,
      p: false,
      screen: "닫힘",
      intake: "닫힘(503)",
      consult: "placeholder",
      post: "503",
    },
    { c: false, p: true, screen: "닫힘", intake: "열림", consult: "placeholder", post: "503 아님" },
    { c: true, p: false, screen: "열림", intake: "닫힘(503)", consult: "본 화면", post: "503" },
    { c: true, p: true, screen: "열림", intake: "열림", consult: "본 화면", post: "503 아님" },
  ],
  // spec.md §2.3 "불가능 조합": P=1이고 S가 없으면 앱이 부팅 중 종료된다. S는 P=0에서 도달 상태에 영향이 없다.
  boot: [
    { p: false, s: false, boot: BOOT_POSSIBLE },
    { p: false, s: true, boot: BOOT_POSSIBLE },
    { p: true, s: false, boot: BOOT_IMPOSSIBLE },
    { p: true, s: true, boot: BOOT_POSSIBLE },
  ],
};
