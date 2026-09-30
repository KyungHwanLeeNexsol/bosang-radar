import { describe, expect, it } from "vitest";
import {
  buildDiagnosisObservation,
  compareDiagnosisObservation,
  compareObservation,
  expectedDiagnosisObservation,
  expectedObservation,
  extractConsultPolicyProp,
  extractGateState,
  extractResultConsultProp,
  extractTitle,
  findPrerenderedRoutes,
} from "./verify-flag-runtime";

// SPEC-B2C-CONSULT-001 D-NEW-18 — verify-flag-runtime.ts의 순수 판정 함수 단위 테스트.
// 실제 build/start 검사는 느려서 pnpm verify:flag-runtime으로 따로 실행한다.

describe("expectedObservation", () => {
  it("consult 플래그는 페이지 제목과 prop을, policy 플래그는 API 503 여부를 결정한다", () => {
    expect(expectedObservation({ consult: true, policy: false })).toEqual({
      consultTitle: "상담 신청",
      consultPolicyProp: false,
      resultConsultProp: true,
      apiIsPolicyUnavailable: true,
    });
    expect(expectedObservation({ consult: false, policy: true })).toEqual({
      consultTitle: "서비스 준비 중",
      consultPolicyProp: null,
      resultConsultProp: false,
      apiIsPolicyUnavailable: false,
    });
  });
});

describe("extractTitle / extract*Prop", () => {
  it("title 태그 내용을 꺼낸다", () => {
    expect(extractTitle("<head><title>상담 신청</title></head>")).toBe("상담 신청");
    expect(extractTitle("<head></head>")).toBeNull();
  });

  it("RSC 페이로드의 이스케이프된 shouldRenderConsult prop을 꺼낸다", () => {
    expect(extractResultConsultProp('..{\\"shouldRenderConsult\\":true}..')).toBe(true);
    expect(extractResultConsultProp('"shouldRenderConsult":false')).toBe(false);
    expect(extractResultConsultProp("<p>없음</p>")).toBeNull();
  });

  it("RSC 페이로드의 이스케이프된 isPolicyReady prop을 꺼낸다", () => {
    expect(extractConsultPolicyProp('..{\\"isPolicyReady\\":false}..')).toBe(false);
    expect(extractConsultPolicyProp('"isPolicyReady":true')).toBe(true);
    expect(extractConsultPolicyProp("<h1>서비스 준비 중입니다</h1>")).toBeNull();
  });
});

describe("compareObservation", () => {
  it("시작 env와 일치하면 불일치가 없다", () => {
    expect(
      compareObservation(
        { consult: true, policy: true },
        {
          consultTitle: "상담 신청",
          consultPolicyProp: true,
          resultConsultProp: true,
          apiStatus: 201,
        }
      )
    ).toEqual([]);
  });

  it("consult 화면이 닫힌 정상 상태는 isPolicyReady prop이 없어도 일치다", () => {
    expect(
      compareObservation(
        { consult: false, policy: true },
        {
          consultTitle: "서비스 준비 중",
          consultPolicyProp: null,
          resultConsultProp: false,
          apiStatus: 201,
        }
      )
    ).toEqual([]);
  });

  it("빌드 시점에 굳은 페이지(닫힘)와 열린 API의 불일치를 페이지 3곳 모두 보고한다", () => {
    const mismatches = compareObservation(
      { consult: true, policy: true },
      {
        consultTitle: "서비스 준비 중",
        consultPolicyProp: null,
        resultConsultProp: false,
        apiStatus: 201,
      }
    );
    expect(mismatches).toHaveLength(3);
  });

  it("policy가 false인데 API가 503이 아니면 불일치다", () => {
    const mismatches = compareObservation(
      { consult: false, policy: false },
      {
        consultTitle: "서비스 준비 중",
        consultPolicyProp: null,
        resultConsultProp: false,
        apiStatus: 201,
      }
    );
    expect(mismatches).toEqual(["API 상태: 기대 503 / 관측 201"]);
  });
});

describe("findPrerenderedRoutes", () => {
  it("prerender-manifest의 routes에 든 후보만 돌려준다", () => {
    const manifest = { routes: { "/": {}, "/consult": {}, "/_not-found": {} } };
    expect(findPrerenderedRoutes(manifest, ["/", "/consult", "/result"])).toEqual([
      "/",
      "/consult",
    ]);
    expect(findPrerenderedRoutes({}, ["/consult"])).toEqual([]);
  });
});

describe("compareObservation — 진단 게이트가 닫혀 있을 때", () => {
  it("ResultView가 렌더되지 않아 shouldRenderConsult prop이 없는 것이 정상이다", () => {
    expect(
      compareObservation(
        { consult: false, policy: false },
        {
          consultTitle: "서비스 준비 중",
          consultPolicyProp: null,
          resultConsultProp: null,
          apiStatus: 503,
        },
        false
      )
    ).toEqual([]);
  });
});

// SPEC-B2C-CONSULT-001 D-NEW-21 — `/`와 `/result`의 진단 게이트 판정.

const CLOSED_HTML = "<h1>서비스 준비 중입니다</h1>";
const OPEN_HOME_HTML = '<div>{\\"enableDevStates\\":false}</div>';
const OPEN_RESULT_HTML =
  '<div>{\\"enableDevFixture\\":false,\\"shouldRenderConsult\\":false}</div>';

describe("expectedDiagnosisObservation", () => {
  it("시작 시점 env의 computeDiagnosisFlags 결과를 그대로 따른다", () => {
    expect(expectedDiagnosisObservation({ flow: false, engine: false, dev: false })).toEqual({
      gate: "closed",
      devProp: null,
    });
    expect(expectedDiagnosisObservation({ flow: true, engine: true, dev: false })).toEqual({
      gate: "open",
      devProp: false,
    });
    expect(expectedDiagnosisObservation({ flow: false, engine: false, dev: true })).toEqual({
      gate: "open",
      devProp: true,
    });
    // ENGINE_READY 없이 FLOW만 켜도 운영 게이트는 열리지 않는다.
    expect(expectedDiagnosisObservation({ flow: true, engine: false, dev: false }).gate).toBe(
      "closed"
    );
  });
});

describe("extractGateState", () => {
  it("placeholder 문구와 열림 prop이 서로 반대일 때만 확정한다", () => {
    expect(extractGateState(CLOSED_HTML, null)).toBe("closed");
    expect(extractGateState(OPEN_HOME_HTML, false)).toBe("open");
    expect(extractGateState("<p>없음</p>", null)).toBe("unknown");
    expect(extractGateState(CLOSED_HTML, true)).toBe("unknown");
  });
});

describe("compareDiagnosisObservation", () => {
  const openOpen = buildDiagnosisObservation(OPEN_HOME_HTML, OPEN_RESULT_HTML);

  it("시작 env(운영 활성)와 두 화면이 모두 일치하면 불일치가 없다", () => {
    expect(openOpen).toEqual({
      homeGate: "open",
      homeDevStatesProp: false,
      resultGate: "open",
      resultDevFixtureProp: false,
    });
    expect(compareDiagnosisObservation({ flow: true, engine: true, dev: false }, openOpen)).toEqual(
      []
    );
  });

  it("/는 빌드 시점에 닫혀 굳고 /result만 열린 어긋남을 SKEW로 보고한다", () => {
    const skewed = buildDiagnosisObservation(CLOSED_HTML, OPEN_RESULT_HTML);
    const mismatches = compareDiagnosisObservation(
      { flow: true, engine: true, dev: false },
      skewed
    );
    expect(mismatches[0]).toBe("SKEW: / = closed / /result = open");
    expect(mismatches).toContain("/ 게이트: 기대 open / 관측 closed");
    expect(mismatches.some((m) => m.startsWith("/ enableDevStates"))).toBe(true);
  });

  it("두 화면이 같아도 시작 env와 다르면 불일치다", () => {
    const mismatches = compareDiagnosisObservation(
      { flow: false, engine: false, dev: false },
      openOpen
    );
    expect(mismatches).toContain("/ 게이트: 기대 closed / 관측 open");
    expect(mismatches).toContain("/result 게이트: 기대 closed / 관측 open");
    expect(mismatches.some((m) => m.startsWith("SKEW"))).toBe(false);
  });
});
