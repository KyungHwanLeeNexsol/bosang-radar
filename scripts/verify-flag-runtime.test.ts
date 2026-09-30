import { describe, expect, it } from "vitest";
import {
  compareObservation,
  expectedObservation,
  extractConsultPolicyProp,
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
