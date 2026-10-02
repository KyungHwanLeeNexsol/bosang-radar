// SPEC-B2C-DIAGNOSIS-001 D2 7차 — 디자인 export와 구현 화면의 시각 정합성을
// 기계적으로 검증하는 재현 가능한 스크립트(design.md §16의 "잠정 수동 절차"를
// 대체한다).
//
// 실행:
//   pnpm visual:verify
//
// 선택 환경변수:
//   VISUAL_BASE_URL   이미 떠 있는 프로덕션 서버를 재사용한다(디버깅용).
//                     설정하지 않으면 이 스크립트가 직접 build + start 한다.
//   VISUAL_SKIP_BUILD 1이면 build를 건너뛰고 기존 .next로 start만 한다.
//   VISUAL_ONLY       쉼표로 구분한 화면 id만 검증한다(예: M01-B,M01-C).
//                     알 수 없는 id거나 0개 화면이 선택되면 즉시 exit 1.
//
// 종료 코드: 허용 오차 초과, 상태/문구/줄바꿈 불일치, 배경색 결함, 측정
// 실패가 하나라도 있으면 1.
//
// [HARD] audit-ready 근거가 되는 `measurements.json`은 **제약 없는 전체
// 24화면 실행**에서만 갱신된다(SPEC-B2C-DIAGNOSIS-001 10 + SPEC-B2C-RESULT-001
// 5 + SPEC-B2C-CONSULT-001 9). VISUAL_ONLY로 화면을 고르거나,
// VISUAL_SKIP_BUILD=1로 현재 소스를 빌드하지 않거나, VISUAL_BASE_URL로 외부
// 서버를 재사용한 실행은 `measurements.partial.json`에 기록되며, 두 파일 모두
// `canonical` 필드로 스스로를 구분한다.
//
// [HARD] 캡처는 반드시 **프로덕션 서버**(`next build` + `next start`)를
// 대상으로 한다 — `next dev`는 `<nextjs-portal>` 개발 전용 DOM을 주입해
// 픽셀 비교를 오염시킨다. 매 화면 캡처 직전에 그 요소의 부재를 단언한다.

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { chromium, type Browser, type Locator, type Page } from "@playwright/test";

import { evaluateCardBorderGate, type BorderAxis, type BorderBox } from "./visual-verify-card-gate";
import { findRemoteDatabaseViolation } from "./visual-verify-db-guard";
import { HELPERS_SOURCE } from "./visual-verify-helpers";
// SPEC-B2C-CONSULT-001 M7 — 03-B/03-C(성공/중복)가 실제 POST
// /api/consultations 제출로 도달해야 해서 DB 마이그레이션이 필요해졌다.
// scripts/run-e2e.ts와 동일하게 in-process 재사용한다(서브프로세스 호출은
// env 전달 경계가 하나 더 생긴다는 그 파일의 이유와 동일).
import { runMigrations } from "./db-migrate";
// 포트 선정(금지 포트 회피) · 준비 확인 · 프로세스 트리 정리는 이 파일이 import되는
// 순간 main()이 도는 탓에 테스트할 수 없어 별도 모듈로 분리했다.
import {
  decideOutcome,
  MEASUREMENTS_CANONICAL,
  MEASUREMENTS_PARTIAL,
  measurementsFileName,
  writeMeasurements,
} from "./visual-verify-report";
import { releaseResources, startManagedServer, type ManagedServer } from "./visual-verify-server";

// tsx(esbuild)는 `keepNames` 옵션 때문에 함수 리터럴마다 `__name(...)` 호출을
// 덧붙인다. 그 함수를 `page.evaluate`로 브라우저에 보내면 헬퍼가 없어
// `ReferenceError: __name is not defined`가 난다 — 페이지마다 항등 함수를
// 미리 정의해 둔다.
const KEEP_NAMES_SHIM = "globalThis.__name = globalThis.__name || ((fn) => fn);";

// ── 경로 ─────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DESIGN_DIR = path.join(PROJECT_ROOT, "design", "exports");
// SPEC-B2C-CONSULT-001 D-RUN-5 — 03 계열 9화면(03/03-A2/03-B/03-C/03-D,
// M03/M03-B/M03-C/M03-D)의 증거(스크린샷/정규화 디자인/오버레이/diff/
// measurements.json)는 이 SPEC 소유 경로로 분리한다 — 기존 15화면
// (01 계열 10 + 02 계열 5)은 SPEC-B2C-DIAGNOSIS-001 경로를 그대로 유지한다.
// 어느 화면이 어느 SPEC 소유인지는 CONSULT_SCREEN_IDS 하나로만 판정해
// 두 곳에서 따로 판단 기준이 갈리지 않게 한다(Enforce Simplicity).
const REPORT_DIR_DIAGNOSIS = path.join(
  PROJECT_ROOT,
  ".moai",
  "reports",
  "visual-check",
  "SPEC-B2C-DIAGNOSIS-001"
);
const REPORT_DIR_CONSULT = path.join(
  PROJECT_ROOT,
  ".moai",
  "reports",
  "visual-check",
  "SPEC-B2C-CONSULT-001"
);
const CONSULT_SCREEN_IDS = new Set([
  "03",
  "03-A2",
  "03-B",
  "03-C",
  "03-D",
  "M03",
  "M03-B",
  "M03-C",
  "M03-D",
]);

function reportDirFor(screenId: string): string {
  return CONSULT_SCREEN_IDS.has(screenId) ? REPORT_DIR_CONSULT : REPORT_DIR_DIAGNOSIS;
}

const dirScreenshots = (screenId: string) => path.join(reportDirFor(screenId), "screenshots");
const dirNormalized = (screenId: string) => path.join(reportDirFor(screenId), "normalized-design");
const dirOverlays = (screenId: string) => path.join(reportDirFor(screenId), "overlays");
const dirDiffs = (screenId: string) => path.join(reportDirFor(screenId), "diffs");

// ── 허용 오차 (D2 7차 판정 기준: 이 두 값만 존재한다) ────────────────
// [HARD] "PASS 근접" / "PASS(경계)" 같은 완화 범주를 도입하지 않는다 —
// 판정은 Δ ≤ tolerance 인지 아닌지의 이진 판정뿐이다.
const TOLERANCE = { desktop: 8, mobile: 4 } as const;

type Platform = keyof typeof TOLERANCE;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DesignBand extends Box {
  cols: Box[];
}

/** 화면 안의 개별 측정 대상. */
interface ElementSpec {
  key: string;
  label: string;
  /** 구현 쪽 요소를 찾는 locator. */
  locate: (page: Page) => Locator;
  /** 디자인 이미지에서 이 요소에 대응하는 밴드의 대략적인 top(px, 1배 기준). */
  designTopHint: number;
  /** 디자인에서 이 요소가 여러 밴드로 쪼개져 보이는 경우 합칠 밴드 수. */
  mergeBands?: number;
  /** 밴드 안에서 가로로 나뉜 열 중 몇 번째인지(좌→우, 0-based). */
  designColIndex?: number;
  /** 밴드 안의 열 여러 개를 하나의 요소로 합칠 때의 범위(양 끝 포함). */
  designColRange?: readonly [number, number];
  /** 좌표/크기 비교에서 제외할 축(측정·기록은 하되 게이트하지 않음). */
  skipMetrics?: ReadonlyArray<"left" | "top" | "width" | "height">;
  /** skipMetrics를 둔 근거(SPEC/AC가 인정하는 허용된 차이여야 한다). */
  skipReason?: string;
  /**
   * 저대비 박스(옅은 테두리·옅은 배경의 카드/행/버튼)는 기본 임계값 18로는
   * 상자 경계가 잡히지 않고 안쪽 글자만 잡힌다. 그런 요소는 낮은 임계값을
   * 지정한다 — **디자인과 구현 양쪽에 동일하게** 적용되므로 "같은 알고리즘
   * 으로 비교한다"는 원칙은 유지된다.
   */
  inkThreshold?: number;
  /** 디자인과 정확히 일치해야 하는 줄 수. */
  expectLines?: number;
  /** 디자인과 정확히 일치해야 하는 줄별 텍스트(줄바꿈 지점 검증). */
  expectLineTexts?: readonly string[];
  /** 디자인과 정확히 일치해야 하는 전체 텍스트. */
  expectText?: string;
  /**
   * 요약 카드처럼 옅은 테두리 카드는 잉크 측정으로 크기를 믿을 수 없어(progress.md
   * Claim 48/51) 이 옵션을 준 요소는 **잉크 측정을 하지 않고** 바깥 테두리 상자로만
   * 비교한다: 구현은 getBoundingClientRect(), 디자인은 PNG 원본 해상도에서 카드
   * 테두리색 가로줄을 찾아 잰 상자(findCardBorderBox). 이 요소에는 skipMetrics/
   * inkThreshold/mergeBands가 적용되지 않는다.
   */
  borderBox?: {
    /** 디자인 PNG에서 카드 맨 위 테두리의 대략적인 top(CSS px). */
    hintTopCss: number;
    /** 디자인 PNG에서 요구하는 행 구분선 최소 개수(기본 1). 구분선 없는 안내 박스는 0. */
    minDividers?: number;
    /**
     * 게이트에서 제외할 축 → 제외 근거(SPEC/디자인 결정 인용). 근거 없는 제외는
     * 인정되지 않는다(evaluateCardBorderGate가 그 축을 그대로 검사한다).
     */
    skip?: Partial<Record<BorderAxis, string>>;
  };
}

/**
 * 배경색 게이트용 프로브 영역(D2 8차).
 *
 * 콘텐츠가 절대 침범하지 않는 좌우 가장자리 세로 띠를 디자인·구현 양쪽에서
 * 같은 방식으로 샘플링한다. 화면 전체 최빈색을 쓰지 않는 이유는
 * `visual-verify-helpers.ts`의 `edgeBackground` 주석 참고.
 */
interface BackgroundProbe {
  /** 프로브 시작 y. 미지정 시 플랫폼별 헤더 아래 기본값. */
  top?: number;
  /** 프로브 끝 y. 미지정 시 뷰포트 바닥. */
  bottom?: number;
  /** 최빈색이 띠에서 차지해야 하는 최소 비율(균일도 하한). */
  minCoverage?: number;
  /** 이 화면에서 기본값이 아닌 값을 쓰는 근거. */
  reason?: string;
}

// 헤더 띠(흰색)는 페이지 배경과 다른 색이므로 프로브에서 제외한다.
// design/exports 실측: Mobile 헤더 하단 ≈59px, Desktop ≈63px.
const PROBE_TOP_DEFAULT: Record<Platform, number> = { desktop: 70, mobile: 66 };

// 가장자리 띠는 디자인·구현 모두 순수 배경이어야 한다. 2배 export를 1배로
// 리샘플할 때 생기는 미세한 디더링을 감안해 1.0이 아닌 값을 쓴다.
const PROBE_MIN_COVERAGE = 0.99;

// 배경색 비교의 채널당 허용치. 2배 디자인 export를 1배로 리샘플하는 과정과
// 반투명 backdrop의 sRGB 합성 반올림에서 채널당 ±1이 생긴다(01-A2는 정확히
// 일치하지만 M01-A2는 R채널만 1 차이가 남는다). 이 값은 "거의 같은 색"을
// 통과시킬 뿐, 실제 배경 결함은 그대로 잡는다 — 7차의 M01-C 결함은
// #ffffff vs #f4f6f8로 채널차가 (11,9,7)이었다.
const BACKGROUND_CHANNEL_TOLERANCE = 1;

interface ScreenSpec {
  id: string;
  label: string;
  platform: Platform;
  viewport: { width: number; height: number };
  designExport: string;
  screenshotName: string;
  /** 반투명 오버레이 화면은 밝은 박스(모달/시트)로 먼저 크롭한다. */
  cropMode?: "bright-box";
  /** 배경색 게이트 프로브 영역 재정의. */
  backgroundProbe?: BackgroundProbe;
  /** 크롭된 박스 자체의 위치/크기도 검증 대상이면 라벨을 준다. */
  cropBoxLabel?: string;
  /** 밴드 분리에 쓰는 quiet-gap(px). 화면마다 요소 간격이 달라 조정한다. */
  quietGap?: number;
  colGap?: number;
  prepare: (page: Page, baseURL: string) => Promise<void>;
  elements: readonly ElementSpec[];
  /** 텍스트/순서 등 픽셀이 아닌 의미 검증. 위반은 허용 오차와 무관하게 FAIL. */
  semanticChecks?: (
    page: Page
  ) => Promise<Array<{ label: string; expected: string; actual: string }>>;
}

// ── 공통 조작 ────────────────────────────────────────────────────────
const SAMPLE_INPUT = "3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요";

// 같은 test id가 Desktop/Mobile 두 벌로 존재하는 요소(카드 그리드, 푸터
// 면책 문구, 로딩 설명 등)가 있으므로 항상 "보이는" 쪽만 고른다.
const vis = (page: Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`);

// 옅은 테두리·옅은 배경을 가진 "상자형" 요소들. 기본 잉크 임계값(18)으로는
// 상자 경계가 배경과 구분되지 않아 안쪽 글자만 잡히므로, 디자인·구현 **양쪽에
// 동일하게** 낮은 임계값(6)을 적용해 상자 자체를 측정한다.
const BOX_LIKE_KEYS = new Set([
  "searchRow",
  "searchBox",
  "notice",
  "chipRow",
  "cardGrid",
  "cardList",
  "consentRow",
  "cta",
  "buttons",
  "panel",
  "icon",
  "badge",
  "spinner",
  "progressTrack",
  "option0",
  "option1",
  "option2",
  "option3",
  "stage0",
  "stage1",
  "stage2",
  "skeleton",
  // SPEC-B2C-CONSULT-001 D-RUN-1 — 03-B/C/D "돌아가기"류 버튼(옅은
  // border-app-line 테두리 + 흰 배경)은 회색 페이지 배경과 채널당 차이가
  // 10px 안팎이라 기본 임계값(18)으로는 상자가 안 잡히고 텍스트만 잡힌다.
  "backCta",
  "retry",
]);

const BOX_INK_THRESHOLD = 6;

const inkThresholdFor = (element: ElementSpec) =>
  element.inkThreshold ?? (BOX_LIKE_KEYS.has(element.key) ? BOX_INK_THRESHOLD : 18);

async function gotoInput(page: Page, baseURL: string) {
  await page.goto(baseURL + "/", { waitUntil: "networkidle" });
  await page.getByTestId("diagnosis-search-textbox").waitFor();
}

async function gotoConsent(page: Page, baseURL: string) {
  await gotoInput(page, baseURL);
  await page.getByTestId("diagnosis-search-textbox").fill(SAMPLE_INPUT);
  await page.getByRole("button", { name: "보상 진단" }).click();
  await page.getByTestId("diagnosis-consent-cta").waitFor();
}

async function gotoQuestions(page: Page, baseURL: string) {
  await gotoConsent(page, baseURL);
  await page.getByTestId("diagnosis-consent-checkbox").check();
  await page.getByTestId("diagnosis-consent-cta").click();
  await page.getByTestId("diagnosis-question-title").waitFor();
}

/**
 * 01-C / M01-C 진단 중 화면을 **디자인과 같은 단계 상태**로 고정해 캡처한다.
 *
 * 디자인은 "1단계 완료 / 2단계 진행 중 / 3단계 대기" 상태다. 구현은
 * STAGE_DELAY_MS(200ms)마다 자동으로 다음 단계로 넘어가므로 고정 sleep으로는
 * 이 상태를 재현할 수 없다(6차까지의 캡처가 1단계를 "진행 중"으로 찍은 원인).
 * Playwright의 가짜 시계로 타이머를 정지시킨 뒤 정확히 한 단계만 진행시키고,
 * 캡처 전에 세 행의 상태 문구를 DOM에서 직접 확인한다.
 */
async function gotoLoadingStageOne(page: Page, baseURL: string) {
  await page.goto(baseURL + "/?devStep=loading&devStage=1", { waitUntil: "networkidle" });
  await page.getByTestId("diagnosis-loading-stage-0").waitFor();
  // 고정 sleep이 아니라 세 행의 상태 문구를 DOM에서 직접 확인한 뒤 캡처한다.
  await expectStageTexts(page, ["완료", "진행 중", "대기"]);
}

async function expectStageTexts(page: Page, expected: readonly string[]) {
  for (const [index, text] of expected.entries()) {
    await page
      .getByTestId(`diagnosis-loading-stage-${index}-status`)
      .filter({ hasText: text })
      .waitFor({ timeout: 5_000 });
  }
}

async function stageTexts(page: Page) {
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    out.push(
      ((await page.getByTestId(`diagnosis-loading-stage-${i}-status`).textContent()) ?? "").trim()
    );
  }
  return out;
}

// SPEC-B2C-RESULT-001 M6 (design.md §9, REQ-B2CRESULT-009/012) — review
// 전용 `?devFixture=fracture` 직접 진입점으로 02/M02 계열 5화면을
// 결정론적으로 캡처한다. startProductionServer()가 이미
// ENABLE_DIAGNOSIS_DEV_STATES=true로 서버를 띄우므로(design.md §9의
// reviewEnabled 게이트) 여기서는 URL 쿼리만 지정하면 된다 — 01 플로우를
// 매번 완주할 필요가 없다.
async function gotoResultFixture(page: Page, baseURL: string) {
  await page.goto(baseURL + "/result?devFixture=fracture", { waitUntil: "networkidle" });
  await page.getByTestId("result-view").waitFor();
}

async function gotoResultFixtureTab(page: Page, baseURL: string, category: string) {
  await gotoResultFixture(page, baseURL);
  await page.getByTestId(`category-tab-${category}`).click();
  await page.getByTestId(`coverage-section-${category}`).waitFor();
}

// SPEC-B2C-RESULT-001 D3(리뷰) — 02/M02 계열 5화면은 상단 3~4개 레이아웃
// 요소만 픽셀 비교하고 semanticChecks가 하나도 없어서, 하단 위젯(가입 세대
// 선택·면책 문구·푸터·최종 CTA)이 통째로 사라져도 통과했다. 아래 헬퍼는
// 모두 "존재/부재"만 판정하며, semanticChecks의 판정식이 `expected ===
// actual`(문자열 등가)이므로 boolean·개수 모두 문자열로 변환해 반환한다.

/** data-testid 요소가 페이지 안에 하나 이상 있는지 "true"/"false"로 반환한다. */
async function testIdExists(page: Page, testId: string): Promise<string> {
  return String((await page.locator(`[data-testid="${testId}"]`).count()) > 0);
}

/** parentTestId 요소 안에 data-testid가 childPrefix로 시작하는 자손이 하나 이상 있는지 반환한다. */
async function descendantWithPrefixExists(
  page: Page,
  parentTestId: string,
  childPrefix: string
): Promise<string> {
  return String(
    (await page
      .locator(`[data-testid="${parentTestId}"] [data-testid^="${childPrefix}"]`)
      .count()) > 0
  );
}

/**
 * 현재 DOM에 마운트된 카테고리 섹션(coverage-section-*) 개수. Mobile은
 * activeCategory 하나만 렌더링하므로(result-view.tsx), 값이 1이면 비활성
 * 탭의 섹션이 숨겨진 채 남아있는 게 아니라 DOM에서 아예 빠졌다는 뜻이다.
 *
 * [HARD] `<section>` 태그로 스코프를 좁힌다 — `coverage-category-section.tsx`
 * 는 같은 접두어를 공유하는 `<p data-testid="coverage-section-description-
 * ${category}">`도 렌더링하므로, 태그 없이 `[data-testid^="coverage-section-"]`
 * 만 쓰면 섹션 1개당 2개(섹션 자체 + 그 설명 문단)로 이중 계산돼 "비활성
 * 탭이 제거됐다"는 이 체크의 목적과 무관한 오탐(실측: count=2)이 난다.
 */
async function coverageSectionCount(page: Page): Promise<string> {
  return String(await page.locator('section[data-testid^="coverage-section-"]').count());
}

/** 카테고리 탭의 aria-selected 값("true"/"false"). 탭이 없으면 "missing". */
async function tabAriaSelected(page: Page, category: string): Promise<string> {
  return (
    (await page
      .locator(`[data-testid="category-tab-${category}"]`)
      .getAttribute("aria-selected")) ?? "missing"
  );
}

/** 하단 고정 CTA 바(result-cta-final)의 계산된 CSS position 값. 없으면 "missing". */
async function finalCtaPosition(page: Page): Promise<string> {
  const locator = page.locator('[data-testid="result-cta-final"]');
  if ((await locator.count()) === 0) return "missing";
  return locator.first().evaluate((el) => window.getComputedStyle(el).position);
}

// SPEC-B2C-CONSULT-001 M7 — 03(상담 신청) 계열 9화면 헬퍼.
//
// design.md §12는 `?devFixture=fracture&devConsultState=success|duplicate|
// error` review 전용 우회 경로를 "run-phase가 구체 구현 확정"이라는 전제로
// 계획했으나, M2~M5 실제 구현(components/consult/consult-view.tsx 전체
// 확인)에는 devConsultState를 처리하는 코드가 0건이다 — 그 계획은 실제로
// 채택되지 않았다(plan-vs-actual gap, 아래 보고 참고). 그래서 이 9화면은
// design.md가 상정한 것과 다른 경로로 도달한다:
//   - 03/03-A2: 01→02→03 전체 플로우를 실제로 완주한다
//     (e2e/consult-flow-03.spec.ts의 completeFractureFlowToResult와 동일한
//     절차를 이 파일 안에 독립적으로 재작성한다 — 그 e2e 파일은 절대
//     import하지 않는다, 01/02 관례와 동일).
//   - 03-B/03-C: 실제 POST /api/consultations 제출로 도달한다(x-forwarded-
//     for 헤더 직접 주입으로 rate limit fail-closed 500 분기를 피한다 —
//     e2e [환경 노트 1]과 동일한 이유).
//   - 03-D: 아래 gotoConsultFailure() 주석에서 설명하는 요청 중단(네트워크
//     예외) 분기로 도달한다(결과를 알 수 없는 공용 03-D, 100% 결정론적).
const CONSULT_NAME = "홍길동";
// lib/consult/phone.ts KOREAN_MOBILE_PATTERN을 만족하는 유효한 연락처 —
// normalizePhone("01012345678") === "01012345678", maskPhone(...) ===
// "010-****-5678"(e2e/consult-flow-03.spec.ts와 동일한 상수 재선언 관례).
const CONSULT_PHONE = "01012345678";
const CONSULT_PHONE_MASKED_PATTERN = /\d{3}-\*{4}-\d{4}/;
const CONSULT_CALL_TIME = "평일 오후 (13시 ~ 18시)";

async function answerAllDiagnosisQuestions(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /^(다음|결과 보기)$/ }).click();
  }
}

/** 01 전체 플로우(입력 → 동의 → 3문항 응답)를 완주해 /result에 도착한다. */
async function completeFractureFlowToResult(page: Page, baseURL: string): Promise<void> {
  await gotoQuestions(page, baseURL);
  await answerAllDiagnosisQuestions(page);
  await page.waitForURL("**/result", { timeout: 15_000 });
  await page.getByTestId("result-view").waitFor();
}

/**
 * 02의 후유장해 섹션 중간 CTA로 03에 진입한다(특정 채널을 강요하지 않는
 * 중립 진입점 — 기본 채널은 카카오톡). Mobile은 result-view.tsx가
 * activeCategory 하나만 렌더링하므로(M02 semanticChecks 주석 참고)
 * 기본 활성 탭이 "disability"가 아니면 이 CTA가 DOM에 아예 없다 —
 * 존재하면 먼저 그 탭으로 전환한다(Desktop은 4카테고리가 전부 펼쳐져
 * 있어 이 클릭이 no-op).
 */
async function clickDisabilityConsultCta(page: Page): Promise<void> {
  const disabilityTab = page.getByTestId("category-tab-disability");
  if (await disabilityTab.isVisible().catch(() => false)) {
    await disabilityTab.click();
  }
  await page.getByTestId("result-cta-disability-button").click();
}

async function gotoConsultMain(page: Page, baseURL: string): Promise<void> {
  await completeFractureFlowToResult(page, baseURL);
  await clickDisabilityConsultCta(page);
  await page.waitForURL("**/consult", { timeout: 10_000 });
  await page.getByTestId("consult-view").waitFor();
}

/** 03에 진입한 뒤 전화 채널 라디오를 선택한다(03-A2). */
async function gotoConsultPhoneChannel(page: Page, baseURL: string): Promise<void> {
  await gotoConsultMain(page, baseURL);
  await page.getByRole("radio", { name: /전화 상담/ }).check();
}

interface ConsultFormInput {
  name: string;
  contact: string;
  preferredCallTime?: string;
}

async function fillConsultForm(page: Page, input: ConsultFormInput): Promise<void> {
  await page.getByTestId("consult-name-input").fill(input.name);
  await page.getByTestId("consult-contact-input").fill(input.contact);
  if (input.preferredCallTime) {
    await page.getByTestId("consult-preferred-call-time-input").fill(input.preferredCallTime);
  }
}

async function checkRequiredConsents(page: Page): Promise<void> {
  await page.getByTestId("consult-consent-checkbox-piiCollection").check();
  await page.getByTestId("consult-consent-checkbox-healthInfoUse").check();
}

// route.ts 7단계 rate limit(60초 윈도 · IP당 최대 5회)이 x-forwarded-for
// "127.0.0.1" 고정값을 여러 화면(03-B/03-C/M03-B/M03-C)이 공유하면 같은
// 윈도 안에서 합산돼 누적 초과할 수 있다(실측 — M03-C가 "다시 시도해도
// 접수되지 않으면…" rate_limited 03-D로 떨어져 consult-duplicate
// waitFor가 타임아웃났다). 화면마다, 그리고 03-C/M03-C 내부의 두 제출마다
// 서로 다른 합성 IP를 주입해 윈도를 분리한다 — 비즈니스 중복 판정
// (resultId+정규화 연락처)은 IP와 무관하므로 이 조작이 03-C 시나리오
// 자체에는 영향이 없다.
let syntheticIpCounter = 0;
function nextSyntheticIp(): string {
  syntheticIpCounter += 1;
  return `127.0.${Math.floor(syntheticIpCounter / 256)}.${syntheticIpCounter % 256}`;
}

/**
 * 03-B(성공) — 실제 POST /api/consultations 제출로 도달한다. 전화 채널로
 * 전환해 연락 희망 시간까지 채운 4행 요약(디자인의 4행 레이아웃과 일치)을
 * 재현한다. x-forwarded-for를 직접 주입해 신뢰 가능한 IP가 없을 때의
 * fail-closed 500 분기(design.md §9.3)를 피한다 — startProductionServer()가
 * 리버스 프록시 없이 next start를 직접 서빙하기 때문에 필요하다
 * (e2e/consult-flow-03.spec.ts [환경 노트 1]과 동일한 이유).
 */
async function gotoConsultSuccess(page: Page, baseURL: string): Promise<void> {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextSyntheticIp() });
  await gotoConsultPhoneChannel(page, baseURL);
  await fillConsultForm(page, {
    name: CONSULT_NAME,
    contact: CONSULT_PHONE,
    preferredCallTime: CONSULT_CALL_TIME,
  });
  await checkRequiredConsents(page);
  await page.getByTestId("consult-submit-button").click();
  await page.getByTestId("consult-success").waitFor({ timeout: 10_000 });
}

/**
 * 03-C(중복) — 같은 page 컨텍스트(같은 resultId)에서 성공 제출 1회 후
 * "진단 결과로 돌아가기" → 03 재진입 → 동일 연락처로 재제출한다. 성공
 * 시 clearConsultationDraft()가 draft를 지우므로 재진입 시 새
 * idempotencyKey가 발급되어 idempotencyKey 조회로는 중복이 걸리지 않고,
 * resultId+정규화 연락처 복합키 조회(route.ts 8번 단계)에서만 중복
 * 판정된다(e2e/consult-flow-03.spec.ts와 동일한 절차).
 */
async function gotoConsultDuplicate(page: Page, baseURL: string): Promise<void> {
  await gotoConsultSuccess(page, baseURL);
  await page.getByTestId("consult-success-back-cta").click();
  await page.waitForURL("**/result", { timeout: 10_000 });
  await page.getByTestId("result-view").waitFor();
  await clickDisabilityConsultCta(page);
  await page.waitForURL("**/consult", { timeout: 10_000 });
  await page.getByTestId("consult-view").waitFor();
  await fillConsultForm(page, { name: CONSULT_NAME, contact: CONSULT_PHONE });
  await checkRequiredConsents(page);
  await page.getByTestId("consult-submit-button").click();
  await page.getByTestId("consult-duplicate").waitFor({ timeout: 10_000 });
}

/**
 * 03-D(실패) — 요청이 중단되는 네트워크 예외 분기로 도달한다.
 * consult-view.tsx handleSubmit()은 fetch가 예외를 던지면(오프라인, 응답
 * 유실 등) 접수 여부를 알 수 없는 공용 03-D(reason "unknown_outcome")로
 * 전환한다. 폼을 채운 뒤 POST /api/consultations를 abort해 이 분기를
 * 결정론적으로 재현한다 — 요청이 서버에 닿지 않으므로 DB·rate limit 상태와
 * 무관하다.
 *
 * [이전 방식을 버린 이유] 예전에는 제출 직전 sessionStorage의 핸드오프
 * resultId를 변조해 handoff_mismatch 분기로 03-D에 도달했다. 그 분기는 이제
 * 요청을 보내지 않았음을 알리는 별도 변형(재시도 버튼·안내 박스 없음)을
 * 렌더링하므로, .pen의 03-D(재시도 버튼·안내 박스 포함)와 비교할 수 없다.
 * handoff_mismatch 변형의 동작은 단위 시험과 e2e가 검증하고, 이 스크립트의
 * 픽셀 비교 대상은 아니다(.pen에 그 변형 프레임이 없다).
 */
async function gotoConsultFailure(page: Page, baseURL: string): Promise<void> {
  await gotoConsultPhoneChannel(page, baseURL);
  await fillConsultForm(page, {
    name: CONSULT_NAME,
    contact: CONSULT_PHONE,
    preferredCallTime: CONSULT_CALL_TIME,
  });
  await checkRequiredConsents(page);
  await page.route("**/api/consultations", (route) => route.abort("failed"));
  await page.getByTestId("consult-submit-button").click();
  await page.getByTestId("consult-failure").waitFor({ timeout: 10_000 });
}

async function radioChecked(page: Page, name: RegExp): Promise<string> {
  return String(await page.getByRole("radio", { name }).isChecked());
}

/** data-testid 요소의 속성값. 요소가 없거나 속성이 없으면 "missing". */
async function attrValue(page: Page, testId: string, attr: string): Promise<string> {
  const value = await page.getByTestId(testId).getAttribute(attr);
  return value ?? "missing";
}

/**
 * 03-B/M03-B 성공 화면 — 안내 문구(부제) → 요약 카드 → CTA가 .pen 순서로 세로로 쌓이고
 * 서로 겹치지 않는지 실제 DOM rect로 확인한다. 픽셀 게이트는 위치·크기 지표만 봐서,
 * 데스크톱에서 CTA(md:mt-[-39px])가 안내 문구를 덮던 결함(progress.md Claim 52)을
 * 통과시켰다. 결과는 "none" 또는 문제 요약 문자열이다.
 * [.pen 최우선 지시] 예전 순서(카드 → 안내 → CTA, design.md §10)는 .pen의 "제목 → 부제 →
 * 카드 → 버튼"으로 바뀌었다.
 */
async function successStackCheck(
  page: Page
): Promise<{ label: string; expected: string; actual: string }> {
  const actual = await page.evaluate(() => {
    const parts: Array<[string, string]> = [
      ["안내 문구", "consult-success-notice"],
      ["요약 카드", "consult-success-summary"],
      ["돌아가기 CTA", "consult-success-back-cta"],
    ];
    const rects = parts.map(([name, id]) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      return { name, rect: el ? el.getBoundingClientRect() : null };
    });
    const problems: string[] = [];
    for (let i = 0; i < rects.length; i++) {
      const cur = rects[i];
      if (!cur.rect) {
        problems.push(`${cur.name} 없음`);
        continue;
      }
      const prev = rects[i - 1];
      if (prev?.rect && cur.rect.top < prev.rect.bottom - 0.5) {
        problems.push(
          `${cur.name}(top ${cur.rect.top.toFixed(1)})가 ${prev.name}(bottom ${prev.rect.bottom.toFixed(1)}) 위로 겹침`
        );
      }
    }
    return problems.length === 0 ? "none" : problems.join("; ");
  });
  return { label: "안내 → 카드 → CTA 세로 순서·비겹침(실제 DOM rect)", expected: "none", actual };
}

/** data-testid 요소의 속성이 기대값과 같은지 "true"/"false"로 반환한다(속성이 없으면 "false"). */
async function attrEquals(
  page: Page,
  testId: string,
  attr: string,
  expected: string
): Promise<string> {
  return String((await attrValue(page, testId, attr)) === expected);
}

/**
 * 데스크톱 푸터(consult-footer)가 화면에 보이는지 "true"/"false"로 반환한다. .pen은 03 / 03-A2 /
 * 03-B / 03-C / 03-D에만 푸터가 있고 모바일(M03*)에는 없다 — 요소가 없거나 display:none이면 false.
 */
async function footerVisible(page: Page): Promise<string> {
  return String(await page.getByTestId("consult-footer").isVisible());
}

/** containerTestId 안에 aria-hidden 아이콘(svg)이 있는지 "true"/"false"로 반환한다. */
async function iconExists(page: Page, containerTestId: string): Promise<string> {
  return String(
    (await page
      .locator(`[data-testid="${containerTestId}"] span[aria-hidden="true"] svg`)
      .count()) > 0
  );
}

/**
 * 03-D/M03-D 입력 보존 검증(부분) — design.md §10의 요약 4행(상담 방식/
 * 연락처/연락 희망 시간/입력 내용)에는 "이름"이 없어 화면에 이름이
 * 보이지 않는다. 보존 메커니즘은 lib/consult/draft.ts가 쓰는 sessionStorage
 * draft이므로, 그 draft에 기대한 이름이 남아 있는지만 확인한다.
 * [범위] 이 검사는 draft의 이름 한 필드만 본다 — 채널·연락처·연락 희망
 * 시간·마케팅 동의의 보존이나 재시도 요청 payload의 동일성은 증명하지
 * 않는다. 재전송(payload) 검증은 components/consult/consult-view.test.tsx
 * (AC-B2CCONSULT-022)의 몫이다.
 */
async function draftNameMatches(page: Page, expectedName: string): Promise<boolean> {
  const raw = await page.evaluate(() =>
    window.sessionStorage.getItem("bosang-radar:consultation-draft-v1")
  );
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as { name?: string }).name === expectedName;
  } catch {
    return false;
  }
}

/** 상담 동의 체크박스(consult-consent-checkbox-*) 개수. */
async function consentCheckboxCount(page: Page): Promise<string> {
  return String(await page.locator('[data-testid^="consult-consent-checkbox-"]').count());
}

/** data-testid 요소의 계산된 CSS position 값. 없으면 "missing". */
async function elementPosition(page: Page, testId: string): Promise<string> {
  const locator = page.locator(`[data-testid="${testId}"]`);
  if ((await locator.count()) === 0) return "missing";
  return locator.first().evaluate((el) => window.getComputedStyle(el).position);
}

// M03 채널 안내 하단 → 폼 상단의 허용 간격(px). 부모(consult-view.tsx)의
// flex-col gap-5 = 20px 기준이며 폰트·브라우저 오차를 ±4px 허용한다. M03 form의
// 절대 top은 skipMetrics로 제외되므로(디자인 목업에는 안내가 없다), 폼이 안내
// 아래로 과도하게 밀리거나 안내와 겹치는 회귀는 이 상대 위치 게이트가 잡는다.
const M03_NOTICE_TO_FORM_GAP = { min: 16, max: 24 } as const;

/**
 * upperSelector 요소 하단 → lowerSelector 요소 상단의 세로 간격이 범위 안이면
 * "min~maxpx", 벗어나면 실측 간격("NN.Npx"), 요소가 없으면 "missing"을 반환한다.
 * semanticChecks가 기대값 문자열과 정확히 비교하므로 위반 시 실측값이 그대로 보인다.
 */
async function gapBetweenWithinRange(
  page: Page,
  upperSelector: string,
  lowerSelector: string,
  range: { readonly min: number; readonly max: number }
): Promise<string> {
  const gap = await page.evaluate(
    ({ upper, lower }) => {
      const upperEl = document.querySelector(upper);
      const lowerEl = document.querySelector(lower);
      if (!upperEl || !lowerEl) return null;
      return lowerEl.getBoundingClientRect().top - upperEl.getBoundingClientRect().bottom;
    },
    { upper: upperSelector, lower: lowerSelector }
  );
  if (gap === null) return "missing";
  if (gap >= range.min && gap <= range.max) return `${range.min}~${range.max}px`;
  return `${Math.round(gap * 10) / 10}px`;
}

// ── 24개 화면 정의 (런타임 추론 없이 코드에 전부 열거한다) ───────────
// 기존 10개(SPEC-B2C-DIAGNOSIS-001) + SPEC-B2C-RESULT-001 M6이 추가한
// 5개(02/M02/M02-B/M02-C/M02-D) + SPEC-B2C-CONSULT-001 M7이 추가하는
// 9개(03/03-A2/03-B/03-C/03-D, M03/M03-B/M03-C/M03-D) — 기존 15개 항목은
// 절대 수정하지 않는다(REQ-B2CRESULT-025, design.md §12).
const SCREENS: readonly ScreenSpec[] = [
  {
    id: "01",
    label: "01 보상 진단 질문 입력 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 940 },
    designExport: "01-보상-진단-질문-입력.png",
    screenshotName: "01-input.png",
    prepare: gotoInput,
    elements: [
      {
        key: "subtitle",
        label: "부제",
        locate: (p) => vis(p, "diagnosis-hero-subtitle"),
        designTopHint: 154,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p, "diagnosis-hero-title"),
        designTopHint: 194,
        expectLines: 1,
      },
      {
        key: "description",
        label: "설명(2줄)",
        locate: (p) => vis(p, "diagnosis-hero-description"),
        designTopHint: 261,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: [
          "사고 경위나 진단명을 한 줄로 적어주세요. 입력하신 내용을 바탕으로",
          "실손 · 정액 담보 · 후유장해 · 배상책임에서 검토해 볼 보상 항목을 알려드립니다.",
        ],
      },
      {
        key: "trustRow",
        label: "시계/자물쇠 행",
        locate: (p) => vis(p, "diagnosis-trust-row"),
        designTopHint: 337,
      },
      {
        key: "searchRow",
        label: "검색 + CTA 결합 행",
        locate: (p) => vis(p, "diagnosis-search-row"),
        designTopHint: 366,
      },
      {
        key: "notice",
        label: "안내 배너",
        locate: (p) => vis(p, "diagnosis-notice"),
        designTopHint: 467,
      },
      {
        key: "chipRow",
        label: "칩 행",
        locate: (p) => vis(p, "diagnosis-chip-row"),
        designTopHint: 537,
      },
      {
        key: "cardGrid",
        label: "카드 그리드",
        locate: (p) => vis(p, "diagnosis-card-grid"),
        designTopHint: 617,
      },
      {
        key: "footerLinks",
        label: "푸터 링크 행",
        locate: (p) => vis(p, "diagnosis-footer-links"),
        designTopHint: 800,
        // 디자인 푸터 행은 링크 3개(열 0~2)와 우측 BORA 로고(열 3)가 한
        // 밴드로 묶인다 — 링크 3개만 합쳐 nav 요소에 대응시킨다.
        designColRange: [0, 2],
      },
      {
        key: "footerDisclaimer",
        label: "푸터 면책 문구",
        locate: (p) => vis(p, "diagnosis-footer-disclaimer"),
        designTopHint: 850,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: [
          "본 서비스의 진단 결과는 입력하신 내용을 바탕으로 한 참고용 안내이며, 보상 여부와 금액을 보장하지 않습니다. 실제 지급은 가입하신 보험의 약관과 보험사 심사",
          "결과에 따릅니다.",
        ],
      },
    ],
  },
  {
    id: "01-A2",
    label: "01-A2 진단 시작 동의 (Desktop Modal)",
    platform: "desktop",
    viewport: { width: 1440, height: 940 },
    designExport: "01-A2-진단-시작-동의.png",
    screenshotName: "01-A2-consent.png",
    cropMode: "bright-box",
    cropBoxLabel: "모달 박스",
    quietGap: 10,
    // 모달은 화면 중앙(x 440~1000)이라 좌우 가장자리 띠는 전 구간이
    // backdrop이고, Desktop은 헤더 아래 본문도 흰색이라 합성 결과가 균일하다
    // — 기본 프로브 영역(헤더 아래 ~ 바닥)을 그대로 쓴다.
    prepare: gotoConsent,
    elements: [
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p, "diagnosis-consent-title"),
        designTopHint: 365,
        expectLines: 1,
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p, "diagnosis-consent-description"),
        designTopHint: 402,
      },
      {
        key: "consentRow",
        label: "동의 행",
        locate: (p) => vis(p, "diagnosis-consent-row"),
        designTopHint: 436,
      },
      {
        key: "cta",
        label: "CTA",
        locate: (p) => vis(p, "diagnosis-consent-cta"),
        designTopHint: 507,
      },
      {
        key: "note",
        label: "하단 안내문",
        locate: (p) => vis(p, "diagnosis-consent-note"),
        designTopHint: 563,
      },
    ],
  },
  {
    id: "01-B",
    label: "01-B 추가 질문 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 940 },
    designExport: "01-B-추가-질문.png",
    screenshotName: "01-B-questions.png",
    prepare: gotoQuestions,
    elements: [
      {
        key: "badge",
        label: "확인 배지",
        locate: (p) => vis(p, "diagnosis-confirm-badge"),
        designTopHint: 144,
      },
      {
        key: "progress",
        label: "진행 표시 행",
        locate: (p) => vis(p, "diagnosis-question-progress"),
        designTopHint: 198,
      },
      {
        key: "subtitle",
        label: "부제",
        locate: (p) => vis(p, "diagnosis-question-subtitle"),
        designTopHint: 230,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p, "diagnosis-question-title"),
        designTopHint: 264,
        expectLines: 1,
      },
      {
        key: "option0",
        label: "옵션 1",
        locate: (p) => vis(p, "diagnosis-option-0"),
        designTopHint: 328,
      },
      {
        key: "option1",
        label: "옵션 2",
        locate: (p) => vis(p, "diagnosis-option-1"),
        designTopHint: 393,
      },
      {
        key: "option2",
        label: "옵션 3",
        locate: (p) => vis(p, "diagnosis-option-2"),
        designTopHint: 458,
      },
      {
        key: "option3",
        label: "옵션 4",
        locate: (p) => vis(p, "diagnosis-option-3"),
        designTopHint: 523,
      },
      {
        key: "answerGuide",
        label: "답변 안내",
        locate: (p) => vis(p, "diagnosis-answer-guide"),
        designTopHint: 599,
      },
      {
        key: "skip",
        label: "건너뛰기 링크",
        locate: (p) => vis(p, "diagnosis-skip-link"),
        designTopHint: 654,
      },
    ],
  },
  {
    id: "01-C",
    label: "01-C 진단 중 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 900 },
    designExport: "01-C-진단-중.png",
    screenshotName: "01-C-loading.png",
    prepare: gotoLoadingStageOne,
    elements: [
      {
        key: "spinner",
        label: "스피너",
        locate: (p) => vis(p, "diagnosis-loading-spinner"),
        designTopHint: 145,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p, "diagnosis-loading-title"),
        designTopHint: 192,
        expectLines: 1,
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p, "diagnosis-loading-description"),
        designTopHint: 237,
      },
      {
        key: "stage0",
        label: "단계 행 1",
        locate: (p) => vis(p, "diagnosis-loading-stage-0"),
        designTopHint: 285,
      },
      {
        key: "stage1",
        label: "단계 행 2",
        locate: (p) => vis(p, "diagnosis-loading-stage-1"),
        designTopHint: 343,
      },
      {
        key: "stage2",
        label: "단계 행 3",
        locate: (p) => vis(p, "diagnosis-loading-stage-2"),
        designTopHint: 401,
      },
      {
        key: "skeleton",
        label: "스켈레톤 카드",
        locate: (p) => vis(p, "diagnosis-loading-skeleton"),
        designTopHint: 469,
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "단계 상태 문구(완료/진행 중/대기)",
        expected: "완료 / 진행 중 / 대기",
        actual: (await stageTexts(page)).join(" / "),
      },
    ],
  },
  {
    id: "01-D",
    label: "01-D 결과 없음 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 900 },
    designExport: "01-D-결과-없음.png",
    screenshotName: "01-D-result-none.png",
    prepare: (page, baseURL) =>
      page.goto(baseURL + "/?devStep=result-none", { waitUntil: "networkidle" }).then(async () => {
        await page.getByTestId("diagnosis-result-none").waitFor();
      }),
    elements: [
      {
        key: "icon",
        label: "아이콘",
        locate: (p) => vis(p, "diagnosis-state-icon"),
        designTopHint: 174,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p, "diagnosis-state-title"),
        designTopHint: 266,
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p, "diagnosis-state-description"),
        designTopHint: 315,
      },
      {
        key: "panel",
        label: "안내 패널",
        locate: (p) => vis(p, "diagnosis-state-panel"),
        designTopHint: 355,
      },
      {
        key: "cta",
        label: "CTA",
        locate: (p) => vis(p, "diagnosis-state-cta"),
        designTopHint: 491,
        // 허용된 차이(plan.md §G): 디자인은 "손해사정사에게 바로 문의" 버튼을
        // 함께 보여주지만 03 상담 플로우는 이 SPEC의 Out of Scope다. 버튼이
        // 하나뿐이라 그룹의 좌표·폭이 달라지는 것은 결함이 아니다.
        skipMetrics: ["left", "width"],
        skipReason: "plan.md §G — 두 번째 버튼(상담 문의)은 Out of Scope",
      },
    ],
  },
  {
    id: "01-E",
    label: "01-E 분석 오류 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 900 },
    designExport: "01-E-분석-오류.png",
    screenshotName: "01-E-error.png",
    prepare: (page, baseURL) =>
      page.goto(baseURL + "/?devStep=error", { waitUntil: "networkidle" }).then(async () => {
        await page.getByTestId("diagnosis-error").waitFor();
      }),
    elements: [
      {
        key: "icon",
        label: "아이콘",
        locate: (p) => vis(p, "diagnosis-state-icon"),
        designTopHint: 174,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p, "diagnosis-state-title"),
        designTopHint: 266,
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p, "diagnosis-state-description"),
        designTopHint: 315,
      },
      {
        key: "buttons",
        label: "버튼 그룹",
        locate: (p) => vis(p, "diagnosis-state-cta"),
        designTopHint: 361,
      },
    ],
  },
  {
    id: "M01",
    label: "M01 질문 입력 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 1110 },
    designExport: "M01-질문-입력.png",
    screenshotName: "M01-input.png",
    prepare: gotoInput,
    elements: [
      {
        key: "subtitle",
        label: "부제",
        locate: (p) => vis(p, "diagnosis-hero-subtitle"),
        designTopHint: 82,
      },
      {
        key: "title",
        label: "제목(2줄)",
        locate: (p) => vis(p, "diagnosis-hero-title"),
        designTopHint: 114,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: ["이거, 보상 받을 수", "있나요?"],
      },
      {
        key: "description",
        label: "설명(2줄)",
        locate: (p) => vis(p, "diagnosis-hero-description"),
        designTopHint: 202,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: [
          "사고 경위나 진단명을 한 줄로 적어주세요. 실손 · 정액 담보 ·",
          "후유장해 · 배상책임에서 검토해 볼 항목을 알려드립니다.",
        ],
      },
      {
        key: "searchBox",
        label: "검색창",
        locate: (p) => vis(p, "diagnosis-search-textbox"),
        designTopHint: 266,
      },
      {
        key: "cta",
        label: "CTA",
        locate: (p) => vis(p, "diagnosis-submit-cta"),
        designTopHint: 396,
      },
      {
        key: "notice",
        label: "안내 배너(2줄)",
        locate: (p) => vis(p, "diagnosis-notice"),
        designTopHint: 462,
        // D2(9차) — 8차까지 이 요소에는 expectLines도 expectLineTexts도
        // 없었다(8차 comparison.md §7은 "줄 수만 검증"으로 적었으나 실제
        // 설정에는 둘 다 없었다). 검증기가 실제 줄 수를 출력에 기록하긴
        // 했지만 판정에 쓰이는 값은 아니었다. 9차에 두 게이트를 함께 넣어
        // design/exports/M01-질문-입력에서 읽은 실제 줄 구성으로 지점까지
        // 고정한다.
        // mergeBands는 두지 않는다 — 이 배너의 두 줄은 줄 간격이 좁아
        // 디자인 쪽에서 이미 한 밴드로 잡힌다(2를 주면 아래 시계 행까지
        // 끌어와 높이가 84로 부풀었다). 줄 검사는 DOM 기반이라 밴드 병합과
        // 무관하게 동작한다.
        expectLines: 2,
        expectLineTexts: ["이름 · 전화번호 · 주민등록번호 등 개인 식별정보는 입력하지", "마세요"],
      },
      {
        key: "chipRow",
        label: "칩 영역(라벨 + 칩 2행)",
        locate: (p) => vis(p, "diagnosis-chip-row"),
        designTopHint: 573,
        mergeBands: 3,
      },
      {
        key: "cardList",
        label: "카드 목록(4장)",
        locate: (p) => vis(p, "diagnosis-card-grid"),
        designTopHint: 691,
        mergeBands: 4,
      },
      {
        key: "footerDisclaimer",
        label: "푸터 면책 문구",
        locate: (p) => vis(p, "diagnosis-footer-disclaimer"),
        designTopHint: 1035,
      },
    ],
  },
  {
    id: "M01-A2",
    label: "M01-A2 진단 시작 동의 (Mobile Bottom Sheet)",
    platform: "mobile",
    viewport: { width: 390, height: 1110 },
    designExport: "M01-A2-진단-시작-동의.png",
    screenshotName: "M01-A2-consent.png",
    cropMode: "bright-box",
    cropBoxLabel: "시트 박스",
    quietGap: 10,
    // 프로브 상단은 기본값(헤더 아래)을 쓴다 — backdrop은 헤더까지 덮지만
    // 헤더는 흰색, 본문은 회색이라 합성 결과가 달라 두 구간을 섞으면 균일도가
    // 무너진다. 하단은 전폭 bottom sheet(디자인 실측 y≈762~)와 그 위 그림자를
    // 피해 750에서 끊는다 — 그 아래는 배경이 아니라 시트 자체다.
    backgroundProbe: {
      bottom: 730,
      reason: "전폭 시트(y≈762~)와 그 상단 그림자를 제외한다",
    },
    prepare: gotoConsent,
    elements: [
      {
        key: "title",
        label: "제목(2줄)",
        locate: (p) => vis(p, "diagnosis-consent-title"),
        // 시트 제목 2줄은 줄 간격이 좁아 디자인에서도 한 밴드로 잡힌다.
        designTopHint: 828,
        expectLines: 2,
        expectLineTexts: ["건강정보 처리에", "동의해 주세요"],
      },
      {
        key: "description",
        label: "설명(2줄)",
        locate: (p) => vis(p, "diagnosis-consent-description"),
        designTopHint: 889,
        // D2(9차) — 8차까지 이 요소에도 expectLines도 expectLineTexts도
        // 없었다. 줄 수는 출력에 기록만 됐을 뿐 판정에 쓰이지 않았고,
        // 9차에 두 게이트를 함께 넣자마자 한 글자 어긋남이 드러났다.
        // design/exports/M01-A2의 실제
        // 줄바꿈은 "…처리됩니" / "다."로, 어절이 아니라 글자 단위에서
        // 끊긴다(한글 CSS 기본 동작). 제목(break-keep)과 달리 이 문단은
        // 디자인 자체가 글자 단위로 끊으므로 그대로 고정한다.
        // 안내 배너와 같은 이유로 mergeBands는 두지 않는다(2를 주면 아래
        // 동의 행까지 병합돼 높이가 104로 부푼다).
        expectLines: 2,
        expectLineTexts: [
          "입력한 사고 · 질병 · 치료 정보는 보상 가능성 분석을 위해 처리됩니",
          "다.",
        ],
      },
      {
        key: "consentRow",
        label: "동의 행",
        locate: (p) => vis(p, "diagnosis-consent-row"),
        designTopHint: 942,
      },
      {
        key: "cta",
        label: "CTA",
        locate: (p) => vis(p, "diagnosis-consent-cta"),
        designTopHint: 1009,
      },
      {
        key: "note",
        label: "하단 안내문",
        locate: (p) => vis(p, "diagnosis-consent-note"),
        designTopHint: 1073,
      },
    ],
  },
  {
    id: "M01-B",
    label: "M01-B 추가 질문 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 672 },
    designExport: "M01-B-추가-질문.png",
    screenshotName: "M01-B-questions.png",
    // 진행 라벨과 진행률 트랙 사이 간격이 좁아 기본 colGap(12)으로는 한 열로
    // 뭉친다.
    colGap: 6,
    prepare: gotoQuestions,
    elements: [
      {
        key: "badge",
        label: "확인 배지",
        locate: (p) => vis(p, "diagnosis-confirm-badge"),
        designTopHint: 78,
      },
      {
        key: "progressLabel",
        label: "진행 표시 행(라벨 + 트랙)",
        // Mobile은 "다음 질문 안내"가 아랫줄로 내려가므로 바깥 컨테이너가
        // 아니라 라벨+트랙 한 행만 대응시킨다.
        locate: (p) => vis(p, "diagnosis-progress-row"),
        designTopHint: 127,
      },
      {
        key: "progressTrack",
        label: "진행률 트랙",
        locate: (p) => vis(p, "diagnosis-progress-track"),
        // 트랙 자체가 배경과 저대비라 ink 세그먼트로 top을 잡기 어렵다 —
        // 진행 표시 행과 같은 밴드 안의 우측 열로 지정해 폭을 실측한다.
        designTopHint: 127,
        designColIndex: 1,
        skipMetrics: ["top", "height"],
      },
      {
        key: "upcoming",
        label: "다음 질문 안내",
        locate: (p) => vis(p, "diagnosis-question-upcoming"),
        designTopHint: 151,
      },
      {
        key: "subtitle",
        label: "부제",
        locate: (p) => vis(p, "diagnosis-question-subtitle"),
        designTopHint: 180,
      },
      {
        key: "title",
        label: "제목(2줄)",
        locate: (p) => vis(p, "diagnosis-question-title"),
        designTopHint: 209,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: ["무릎 골절로 수술을", "받으셨나요?"],
      },
      {
        key: "option0",
        label: "옵션 1",
        locate: (p) => vis(p, "diagnosis-option-0"),
        designTopHint: 293,
      },
      {
        key: "option1",
        label: "옵션 2",
        locate: (p) => vis(p, "diagnosis-option-1"),
        designTopHint: 354,
      },
      {
        key: "option2",
        label: "옵션 3",
        locate: (p) => vis(p, "diagnosis-option-2"),
        designTopHint: 415,
      },
      {
        key: "option3",
        label: "옵션 4",
        locate: (p) => vis(p, "diagnosis-option-3"),
        designTopHint: 476,
      },
      {
        key: "answerGuide",
        label: "답변 안내(2줄)",
        locate: (p) => vis(p, "diagnosis-answer-guide"),
        designTopHint: 549,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: [
          "이 답변은 수술비 · 후유장해 담보 검토에 사용되며, 결과 화면의 「추가",
          "질문 답변」에 그대로 표시됩니다.",
        ],
      },
      {
        key: "skip",
        label: "건너뛰기 링크",
        locate: (p) => vis(p, "diagnosis-skip-link"),
        designTopHint: 601,
      },
    ],
  },
  {
    id: "M01-C",
    label: "M01-C 진단 중 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 650 },
    designExport: "M01-C-진단-중.png",
    screenshotName: "M01-C-loading.png",
    prepare: gotoLoadingStageOne,
    elements: [
      {
        key: "spinner",
        label: "스피너",
        locate: (p) => vis(p, "diagnosis-loading-spinner"),
        designTopHint: 87,
      },
      {
        key: "title",
        label: "제목(2줄)",
        locate: (p) => vis(p, "diagnosis-loading-title"),
        designTopHint: 130,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: ["입력하신 내용을", "확인하고 있습니다"],
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p, "diagnosis-loading-description"),
        designTopHint: 202,
        expectText: "보통 10~20초 정도 걸립니다.",
      },
      {
        key: "stage0",
        label: "단계 행 1",
        locate: (p) => vis(p, "diagnosis-loading-stage-0"),
        designTopHint: 242,
      },
      {
        key: "stage1",
        label: "단계 행 2",
        locate: (p) => vis(p, "diagnosis-loading-stage-1"),
        designTopHint: 295,
      },
      {
        key: "stage2",
        label: "단계 행 3",
        locate: (p) => vis(p, "diagnosis-loading-stage-2"),
        designTopHint: 348,
      },
      {
        key: "skeleton",
        label: "스켈레톤(2장)",
        locate: (p) => vis(p, "diagnosis-loading-skeleton"),
        designTopHint: 415,
        mergeBands: 2,
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "단계 상태 문구(완료/진행 중/대기)",
        expected: "완료 / 진행 중 / 대기",
        actual: (await stageTexts(page)).join(" / "),
      },
    ],
  },
  // ── SPEC-B2C-RESULT-001 M6 — 신규 5화면 (02/M02/M02-B/M02-C/M02-D) ──
  // design/exports 1x 치수(2x export ÷ 2)를 뷰포트에 그대로 맞춰 정규화
  // 시 왜곡이 없게 한다(01/M01과 동일한 관례). 담보 카드 그리드
  // (coverage-section-*)는 카드 수만큼 밴드가 잘게 쪼개져 mergeBands를
  // 눈대중으로 맞추기 어려우므로 이번 milestone에서는 측정 대상에서
  // 제외한다 — 화면 등록·캡처·핵심 3요소(입력 요약/집계 배너/우선순위
  // 체크리스트) 정합성 확인이 1차 목표다(잔여 위험으로 보고).
  {
    id: "02",
    label: "02 보상 진단 결과 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 3442 },
    designExport: "02-보상-진단-결과.png",
    screenshotName: "02-result.png",
    quietGap: 4,
    // 하단 전폭 CTA 바(어두운 배경)·푸터가 회색 페이지 배경과 다른 색이라
    // 프로브 균일도를 깨뜨린다 — M01-A2가 시트를 제외한 것과 같은 방식으로
    // 담보 카드 콘텐츠 구간까지만 측정한다.
    backgroundProbe: {
      bottom: 2300,
      reason: "하단 전폭 CTA 바(어두운 배경)·푸터는 회색 배경과 다른 색이라 제외",
    },
    prepare: gotoResultFixture,
    elements: [
      {
        key: "inputSummary",
        label: "입력하신 사고 내용 카드",
        locate: (p) => vis(p, "result-input-summary"),
        designTopHint: 96,
      },
      {
        // D-RUN-2 — height는 SPEC-B2C-RESULT-001이 이미 승인한 4건의 시각
        // debt 중 하나(design.md §13 "ResultAggregateBanner height 편차") —
        // 이 SPEC에서 재선언·재승인하지 않는다. top은 그 승인된 height
        // 편차가 페이지 흐름상 아래로 누적되며 함께 흔들리는 종속 값이라
        // 별도로 게이트하지 않는다(진짜 결함은 여전히 height 축 하나뿐).
        key: "aggregateBanner",
        label: "집계 배너",
        locate: (p) => vis(p, "result-aggregate-banner"),
        designTopHint: 334,
        skipMetrics: ["top", "height"],
        skipReason: "design.md §13 승인된 ResultAggregateBanner height 편차 — top은 그 종속 값",
      },
      {
        // D-RUN-2 — 위 aggregateBanner의 승인된 height 편차가 문서 흐름상
        // 아래로 누적돼 이 요소의 top도 함께 흔들린다(§13 참고).
        key: "priorityChecklist",
        label: "먼저 확인할 항목",
        locate: (p) => vis(p, "result-priority-checklist"),
        designTopHint: 578,
        skipMetrics: ["top"],
        skipReason: "design.md §13 승인된 상위 요소 height 편차의 누적 종속 값",
      },
    ],
    // SPEC-B2C-RESULT-001 D3(리뷰) — 상단 3요소만 좌표 비교하던 이 화면에
    // 하단 위젯(가입 세대 선택·면책 문구·후유장해 중간 CTA·최종 CTA·푸터)과
    // 4개 카테고리 섹션의 존재를 semanticChecks로 추가한다. "장해 중간 페이지
    // CTA"는 리뷰가 언급한 항목인데, result-cta-bar.tsx의
    // ResultDisabilitySectionCta(`data-testid="result-cta-disability"`)로
    // 실제 존재하며 Desktop은 4카테고리가 전부 펼쳐지므로 항상 렌더링된다
    // (result-view.tsx category === "disability" 분기) — 존재하는 요소이므로
    // 여기 포함한다.
    semanticChecks: async (page) => [
      {
        label: "입력 요약 카드 존재",
        expected: "true",
        actual: await testIdExists(page, "result-input-summary"),
      },
      {
        label: "집계 배너 존재",
        expected: "true",
        actual: await testIdExists(page, "result-aggregate-banner"),
      },
      {
        label: "먼저 확인할 항목 존재",
        expected: "true",
        actual: await testIdExists(page, "result-priority-checklist"),
      },
      {
        label: "실손 의료비 섹션 존재",
        expected: "true",
        actual: await testIdExists(page, "coverage-section-reimbursement"),
      },
      {
        label: "정액 담보 섹션 존재",
        expected: "true",
        actual: await testIdExists(page, "coverage-section-fixed"),
      },
      {
        label: "후유장해 섹션 존재",
        expected: "true",
        actual: await testIdExists(page, "coverage-section-disability"),
      },
      {
        label: "특별 보상 섹션 존재",
        expected: "true",
        actual: await testIdExists(page, "coverage-section-special"),
      },
      {
        label: "실손 가입 세대 선택 위젯 존재",
        expected: "true",
        actual: await testIdExists(page, "result-generation-selector"),
      },
      {
        label: "입력 조건 disclosure 존재",
        expected: "true",
        actual: await testIdExists(page, "result-input-condition-disclosure"),
      },
      {
        label: "면책 문구 존재",
        expected: "true",
        actual: await testIdExists(page, "result-disclaimer"),
      },
      {
        label: "후유장해 섹션 중간 CTA 존재",
        expected: "true",
        actual: await testIdExists(page, "result-cta-disability"),
      },
      {
        label: "최종 CTA 존재",
        expected: "true",
        actual: await testIdExists(page, "result-cta-final"),
      },
      {
        label: "푸터 존재",
        expected: "true",
        actual: await testIdExists(page, "result-footer"),
      },
    ],
  },
  {
    id: "M02",
    label: "M02 보상 진단 결과 — 실손 의료비 탭 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 2348 },
    designExport: "M02-보상-진단-결과.png",
    screenshotName: "M02-result.png",
    // D-RUN-2 — 02(Desktop)와 동일하게 하단 전폭 CTA 바(어두운 배경)가
    // 회색 페이지 배경과 달라 프로브 균일도를 깨뜨린다.
    backgroundProbe: {
      bottom: 1600,
      reason: "하단 전폭 CTA 바(어두운 배경)·푸터는 회색 배경과 다른 색이라 제외",
    },
    prepare: gotoResultFixture,
    elements: [
      {
        key: "inputSummary",
        label: "입력하신 사고 내용 카드",
        locate: (p) => vis(p, "result-input-summary"),
        // visual-verify 튜닝 — scripts/_debug-dump-bands.ts로 정규화된
        // design/exports/M02-보상-진단-결과.png의 실제 segmentBands(기본
        // 임계값 18) 출력을 직접 측정해 얻은 참값이다(이전 값 56은 카드
        // 상단 테두리 한 줄이 quietGap으로 분리된 1px 밴드(top=51)에 더
        // 가까워 오매칭됐었다 — 실제 카드 본문 밴드는 top=72).
        designTopHint: 72,
        // D-RUN-2 — height는 SPEC-B2C-RESULT-001이 이미 승인한 4건의 시각
        // debt 중 하나(design.md §13 "모바일 입력 요약 카드 잔여 height
        // 편차") — 이 SPEC에서 재선언·재승인하지 않는다.
        // D-RUN-2 — top(Δ~9px)은 4개 탭 변형 전부에서 동일하게 나타나는
        // 작은 잔여 편차로, 이 SPEC의 변경과 무관한 기존 렌더링 오차다
        // (헤더/CTA 분기와 무관 — 근본 원인 미확정, 후속 세션에서 재조사
        // 필요). height는 위와 동일하게 §13 승인 debt.
        skipMetrics: ["top", "height"],
        skipReason:
          "design.md §13 승인된 height 편차 + top은 4개 변형 공통의 작은 미확정 잔여 편차(이 SPEC 무관)",
      },
      {
        key: "aggregateBanner",
        label: "집계 배너",
        locate: (p) => vis(p, "result-aggregate-banner"),
        // 참값 — 이전 값 288은 실제 밴드(top=448)에서 160px 떨어져 있어
        // dist<=30 매칭 조건을 넘겨 "밴드를 찾지 못함"으로 처리됐었다.
        designTopHint: 448,
        // D-RUN-2 — height는 §13 승인된 ResultAggregateBanner height 편차.
        // top은 위 inputSummary의 승인된 height 편차가 문서 흐름상 누적돼
        // 함께 흔들리는 종속 값이다.
        skipMetrics: ["top", "height"],
        skipReason: "design.md §13 승인된 height 편차 + 상위 요소 누적 종속(top)",
      },
      {
        key: "priorityChecklist",
        label: "먼저 확인할 항목",
        locate: (p) => vis(p, "result-priority-checklist"),
        // 참값(top=693) — 4개 탭 변형(M02/M02-B/M02-C/M02-D) 모두 이 세
        // 섹션(입력 요약/집계 배너/먼저 확인할 항목)의 디자인 좌표가
        // 동일하다 — 탭별로 달라지는 담보 콘텐츠는 이 섹션들 아래에서만
        // 갈린다.
        designTopHint: 693,
        // D-RUN-2 — 근본 원인 재확인: design/exports/M02-*.png는 "먼저
        // 확인할 항목"을 아이콘 없는 번호+한 줄 라벨+화살표 리스트로
        // 보여주지만, 구현(result-priority-checklist.tsx)은 각 항목을
        // 설명 문구까지 있는 카드(border+p-3+description)로 렌더링한다 —
        // ENABLE_CONSULT_FLOW와 무관한 SPEC-B2C-RESULT-001 자체의 기존
        // 콘텐츠 구조 편차(이 SPEC이 만든 결함이 아니며, 그 컴포넌트를
        // 재설계하는 것은 이 delegation 범위 밖이다). top은 위 두 요소의
        // 누적 종속 값이라 함께 게이트하지 않는다.
        skipMetrics: ["top", "height"],
        skipReason:
          "SPEC-B2C-RESULT-001 기존 콘텐츠 구조 편차(카드형 vs 번호목록형) — 이 SPEC 범위 밖, 재설계 없이 top/height 게이트하지 않음",
      },
      {
        key: "categoryTabs",
        label: "카테고리 탭",
        locate: (p) => vis(p, "result-category-tabs"),
        // 참값(top=923). top은 위 세 요소의 누적 종속 값이라 게이트하지
        // 않는다(D-RUN-2). height(Δ~7-9px)도 4개 변형 전부에서 동일하게
        // 나타나는 작은 잔여 편차라 함께 스킵한다.
        designTopHint: 923,
        skipMetrics: ["top", "height"],
        skipReason: "상위 요소들의 누적 종속 값(top) + 4개 변형 공통 잔여 편차(height) — D-RUN-2",
      },
    ],
    // SPEC-B2C-RESULT-001 D3(리뷰) — Mobile 기본 탭(실손 의료비): 탭 활성
    // 상태 + 담보 카드 마운트 + 비활성 탭 미마운트(coverageSectionCount===1,
    // result-view.tsx는 activeCategory 하나만 렌더링해 다른 3개 카테고리
    // 섹션은 숨김이 아니라 DOM에서 아예 빠진다) + 하단 고정 위젯을 검증한다.
    semanticChecks: async (page) => [
      {
        label: "실손 의료비 탭 활성 상태(aria-selected)",
        expected: "true",
        actual: await tabAriaSelected(page, "reimbursement"),
      },
      {
        label: "실손 의료비 섹션 존재",
        expected: "true",
        actual: await testIdExists(page, "coverage-section-reimbursement"),
      },
      {
        label: "실손 의료비 담보 카드 1개 이상 존재",
        expected: "true",
        actual: await descendantWithPrefixExists(
          page,
          "coverage-section-reimbursement",
          "coverage-item-"
        ),
      },
      {
        label: "마운트된 카테고리 섹션 개수(비활성 탭은 DOM에서 제거됨)",
        expected: "1",
        actual: await coverageSectionCount(page),
      },
      {
        label: "실손 가입 세대 선택 위젯 존재",
        expected: "true",
        actual: await testIdExists(page, "result-generation-selector"),
      },
      {
        label: "입력 조건 disclosure 존재",
        expected: "true",
        actual: await testIdExists(page, "result-input-condition-disclosure"),
      },
      {
        label: "면책 문구 존재",
        expected: "true",
        actual: await testIdExists(page, "result-disclaimer"),
      },
      {
        label: "푸터 존재",
        expected: "true",
        actual: await testIdExists(page, "result-footer"),
      },
      {
        label: "하단 고정 CTA 존재",
        expected: "true",
        actual: await testIdExists(page, "result-cta-final"),
      },
      {
        label: "하단 고정 CTA sticky 포지션 적용(md 미만 뷰포트)",
        expected: "sticky",
        actual: await finalCtaPosition(page),
      },
    ],
  },
  {
    id: "M02-B",
    label: "M02-B 결과 — 정액 담보 탭 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 3169 },
    designExport: "M02-B-결과-정액-담보-탭.png",
    screenshotName: "M02-B-result-fixed.png",
    backgroundProbe: {
      bottom: 1700,
      reason: "하단 전폭 CTA 바(어두운 배경)·푸터는 회색 배경과 다른 색이라 제외",
    },
    prepare: (page, baseURL) => gotoResultFixtureTab(page, baseURL, "fixed"),
    elements: [
      {
        key: "inputSummary",
        label: "입력하신 사고 내용 카드",
        locate: (p) => vis(p, "result-input-summary"),
        // visual-verify 튜닝 — 참값(top=73, M02와 동일 섹션).
        designTopHint: 73,
        // D-RUN-2 — M02와 동일한 이유(design.md §13 승인된 height 편차).
        // D-RUN-2 — top(Δ~9px)은 4개 탭 변형 전부에서 동일하게 나타나는
        // 작은 잔여 편차로, 이 SPEC의 변경과 무관한 기존 렌더링 오차다
        // (헤더/CTA 분기와 무관 — 근본 원인 미확정, 후속 세션에서 재조사
        // 필요). height는 위와 동일하게 §13 승인 debt.
        skipMetrics: ["top", "height"],
        skipReason:
          "design.md §13 승인된 height 편차 + top은 4개 변형 공통의 작은 미확정 잔여 편차(이 SPEC 무관)",
      },
      {
        key: "aggregateBanner",
        label: "집계 배너",
        locate: (p) => vis(p, "result-aggregate-banner"),
        designTopHint: 449,
        skipMetrics: ["top", "height"],
        skipReason: "design.md §13 승인된 height 편차 + 상위 요소 누적 종속(top)",
      },
      {
        key: "priorityChecklist",
        label: "먼저 확인할 항목",
        locate: (p) => vis(p, "result-priority-checklist"),
        designTopHint: 693,
        // D-RUN-2 — M02와 동일한 근본 원인(design.md 번호목록형 vs 구현
        // 카드형, SPEC-B2C-RESULT-001 기존 콘텐츠 구조 편차, 이 SPEC 범위 밖).
        skipMetrics: ["top", "height"],
        skipReason:
          "SPEC-B2C-RESULT-001 기존 콘텐츠 구조 편차(카드형 vs 번호목록형) — 이 SPEC 범위 밖, 재설계 없이 top/height 게이트하지 않음",
      },
      {
        key: "categoryTabs",
        label: "카테고리 탭",
        locate: (p) => vis(p, "result-category-tabs"),
        designTopHint: 924,
        skipMetrics: ["top", "height"],
        skipReason: "상위 요소들의 누적 종속 값(top) + 4개 변형 공통 잔여 편차(height) — D-RUN-2",
      },
    ],
    // SPEC-B2C-RESULT-001 D3(리뷰) — M02와 동일한 패턴. 정액 담보 탭에는
    // 실손 전용 위젯(result-generation-selector)이 없으므로 그 항목만 뺀다.
    semanticChecks: async (page) => [
      {
        label: "정액 담보 탭 활성 상태(aria-selected)",
        expected: "true",
        actual: await tabAriaSelected(page, "fixed"),
      },
      {
        label: "정액 담보 섹션 존재",
        expected: "true",
        actual: await testIdExists(page, "coverage-section-fixed"),
      },
      {
        label: "정액 담보 카드 1개 이상 존재",
        expected: "true",
        actual: await descendantWithPrefixExists(page, "coverage-section-fixed", "coverage-item-"),
      },
      {
        label: "마운트된 카테고리 섹션 개수(비활성 탭은 DOM에서 제거됨)",
        expected: "1",
        actual: await coverageSectionCount(page),
      },
      {
        label: "입력 조건 disclosure 존재",
        expected: "true",
        actual: await testIdExists(page, "result-input-condition-disclosure"),
      },
      {
        label: "면책 문구 존재",
        expected: "true",
        actual: await testIdExists(page, "result-disclaimer"),
      },
      {
        label: "푸터 존재",
        expected: "true",
        actual: await testIdExists(page, "result-footer"),
      },
      {
        label: "하단 고정 CTA 존재",
        expected: "true",
        actual: await testIdExists(page, "result-cta-final"),
      },
      {
        label: "하단 고정 CTA sticky 포지션 적용(md 미만 뷰포트)",
        expected: "sticky",
        actual: await finalCtaPosition(page),
      },
    ],
  },
  {
    id: "M02-C",
    label: "M02-C 결과 — 후유장해 탭 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 1903 },
    designExport: "M02-C-결과-후유장해-탭.png",
    screenshotName: "M02-C-result-disability.png",
    backgroundProbe: {
      bottom: 1200,
      reason: "하단 전폭 CTA 바(어두운 배경)·푸터는 회색 배경과 다른 색이라 제외",
    },
    prepare: (page, baseURL) => gotoResultFixtureTab(page, baseURL, "disability"),
    elements: [
      {
        key: "inputSummary",
        label: "입력하신 사고 내용 카드",
        locate: (p) => vis(p, "result-input-summary"),
        // visual-verify 튜닝 — 참값(top=72, M02와 동일 섹션).
        designTopHint: 72,
        // D-RUN-2 — top(Δ~9px)은 4개 탭 변형 전부에서 동일하게 나타나는
        // 작은 잔여 편차로, 이 SPEC의 변경과 무관한 기존 렌더링 오차다
        // (헤더/CTA 분기와 무관 — 근본 원인 미확정, 후속 세션에서 재조사
        // 필요). height는 위와 동일하게 §13 승인 debt.
        skipMetrics: ["top", "height"],
        skipReason:
          "design.md §13 승인된 height 편차 + top은 4개 변형 공통의 작은 미확정 잔여 편차(이 SPEC 무관)",
      },
      {
        key: "aggregateBanner",
        label: "집계 배너",
        locate: (p) => vis(p, "result-aggregate-banner"),
        designTopHint: 448,
        skipMetrics: ["top", "height"],
        skipReason: "design.md §13 승인된 height 편차 + 상위 요소 누적 종속(top)",
      },
      {
        key: "priorityChecklist",
        label: "먼저 확인할 항목",
        locate: (p) => vis(p, "result-priority-checklist"),
        designTopHint: 693,
        skipMetrics: ["top", "height"],
        skipReason:
          "SPEC-B2C-RESULT-001 기존 콘텐츠 구조 편차(카드형 vs 번호목록형) — 이 SPEC 범위 밖, 재설계 없이 top/height 게이트하지 않음",
      },
      {
        key: "categoryTabs",
        label: "카테고리 탭",
        locate: (p) => vis(p, "result-category-tabs"),
        designTopHint: 923,
        skipMetrics: ["top", "height"],
        skipReason: "상위 요소들의 누적 종속 값(top) + 4개 변형 공통 잔여 편차(height) — D-RUN-2",
      },
    ],
    // SPEC-B2C-RESULT-001 D3(리뷰) — M02와 동일한 패턴(실손 전용 위젯 제외).
    semanticChecks: async (page) => [
      {
        label: "후유장해 탭 활성 상태(aria-selected)",
        expected: "true",
        actual: await tabAriaSelected(page, "disability"),
      },
      {
        label: "후유장해 섹션 존재",
        expected: "true",
        actual: await testIdExists(page, "coverage-section-disability"),
      },
      {
        label: "후유장해 카드 1개 이상 존재",
        expected: "true",
        actual: await descendantWithPrefixExists(
          page,
          "coverage-section-disability",
          "coverage-item-"
        ),
      },
      {
        label: "마운트된 카테고리 섹션 개수(비활성 탭은 DOM에서 제거됨)",
        expected: "1",
        actual: await coverageSectionCount(page),
      },
      {
        label: "입력 조건 disclosure 존재",
        expected: "true",
        actual: await testIdExists(page, "result-input-condition-disclosure"),
      },
      {
        label: "면책 문구 존재",
        expected: "true",
        actual: await testIdExists(page, "result-disclaimer"),
      },
      {
        label: "푸터 존재",
        expected: "true",
        actual: await testIdExists(page, "result-footer"),
      },
      {
        label: "하단 고정 CTA 존재",
        expected: "true",
        actual: await testIdExists(page, "result-cta-final"),
      },
      {
        label: "하단 고정 CTA sticky 포지션 적용(md 미만 뷰포트)",
        expected: "sticky",
        actual: await finalCtaPosition(page),
      },
    ],
  },
  {
    id: "M02-D",
    label: "M02-D 결과 — 특별 보상 탭 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 1882 },
    designExport: "M02-D-결과-특별-보상-탭.png",
    screenshotName: "M02-D-result-special.png",
    backgroundProbe: {
      bottom: 1200,
      reason: "하단 전폭 CTA 바(어두운 배경)·푸터는 회색 배경과 다른 색이라 제외",
    },
    prepare: (page, baseURL) => gotoResultFixtureTab(page, baseURL, "special"),
    elements: [
      {
        key: "inputSummary",
        label: "입력하신 사고 내용 카드",
        locate: (p) => vis(p, "result-input-summary"),
        // visual-verify 튜닝 — 참값(top=72, M02와 동일 섹션).
        designTopHint: 72,
        // D-RUN-2 — top(Δ~9px)은 4개 탭 변형 전부에서 동일하게 나타나는
        // 작은 잔여 편차로, 이 SPEC의 변경과 무관한 기존 렌더링 오차다
        // (헤더/CTA 분기와 무관 — 근본 원인 미확정, 후속 세션에서 재조사
        // 필요). height는 위와 동일하게 §13 승인 debt.
        skipMetrics: ["top", "height"],
        skipReason:
          "design.md §13 승인된 height 편차 + top은 4개 변형 공통의 작은 미확정 잔여 편차(이 SPEC 무관)",
      },
      {
        key: "aggregateBanner",
        label: "집계 배너",
        locate: (p) => vis(p, "result-aggregate-banner"),
        designTopHint: 448,
        skipMetrics: ["top", "height"],
        skipReason: "design.md §13 승인된 height 편차 + 상위 요소 누적 종속(top)",
      },
      {
        key: "priorityChecklist",
        label: "먼저 확인할 항목",
        locate: (p) => vis(p, "result-priority-checklist"),
        designTopHint: 693,
        skipMetrics: ["top", "height"],
        skipReason:
          "SPEC-B2C-RESULT-001 기존 콘텐츠 구조 편차(카드형 vs 번호목록형) — 이 SPEC 범위 밖, 재설계 없이 top/height 게이트하지 않음",
      },
      {
        key: "categoryTabs",
        label: "카테고리 탭",
        locate: (p) => vis(p, "result-category-tabs"),
        designTopHint: 923,
        skipMetrics: ["top", "height"],
        skipReason: "상위 요소들의 누적 종속 값(top) + 4개 변형 공통 잔여 편차(height) — D-RUN-2",
      },
    ],
    // SPEC-B2C-RESULT-001 D3(리뷰) — M02와 동일한 패턴(실손 전용 위젯 제외).
    semanticChecks: async (page) => [
      {
        label: "특별 보상 탭 활성 상태(aria-selected)",
        expected: "true",
        actual: await tabAriaSelected(page, "special"),
      },
      {
        label: "특별 보상 섹션 존재",
        expected: "true",
        actual: await testIdExists(page, "coverage-section-special"),
      },
      {
        label: "특별 보상 카드 1개 이상 존재",
        expected: "true",
        actual: await descendantWithPrefixExists(
          page,
          "coverage-section-special",
          "coverage-item-"
        ),
      },
      {
        label: "마운트된 카테고리 섹션 개수(비활성 탭은 DOM에서 제거됨)",
        expected: "1",
        actual: await coverageSectionCount(page),
      },
      {
        label: "입력 조건 disclosure 존재",
        expected: "true",
        actual: await testIdExists(page, "result-input-condition-disclosure"),
      },
      {
        label: "면책 문구 존재",
        expected: "true",
        actual: await testIdExists(page, "result-disclaimer"),
      },
      {
        label: "푸터 존재",
        expected: "true",
        actual: await testIdExists(page, "result-footer"),
      },
      {
        label: "하단 고정 CTA 존재",
        expected: "true",
        actual: await testIdExists(page, "result-cta-final"),
      },
      {
        label: "하단 고정 CTA sticky 포지션 적용(md 미만 뷰포트)",
        expected: "sticky",
        actual: await finalCtaPosition(page),
      },
    ],
  },
  // ── SPEC-B2C-CONSULT-001 M7 — 신규 9화면 (03/03-A2/03-B/03-C/03-D,
  // M03/M03-B/M03-C/M03-D) ──
  // 진입 경로는 위 "SPEC-B2C-CONSULT-001 M7 — 03(상담 신청) 계열 9화면
  // 헬퍼" 주석 블록 참고 — design.md §12가 계획한 devFixture/devConsultState
  // 우회 경로는 실제 구현에 없다. designTopHint 값은 design/exports의 해당
  // PNG를 1x로 정규화해 segmentBands로 실측한 값이다(첫 실행 시 추가 조정이
  // 필요할 수 있다 — progress.md §E.2 M7 참고). 디자인 export 1x 치수를
  // 뷰포트에 그대로 맞춰 정규화 시 왜곡이 없게 한다(01/02와 동일한 관례).
  {
    id: "03",
    label: "03 상담 신청 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 1426 },
    designExport: "03-상담-신청-손해사정사-연결.png",
    screenshotName: "03-consult.png",
    quietGap: 10,
    prepare: gotoConsultMain,
    elements: [
      {
        key: "summary",
        label: "진단 결과 요약 카드",
        // visual-verify 실행(1차) — normalized-design/03.png을 직접 열어
        // 확인한 실측값. 디자인은 헤더(0~70)+페이지 히어로 타이틀"손해
        // 사정사에게 무료로 물어보세요"+설명 2줄(116~206)이 요약 카드보다
        // 먼저 오고, 카드는 그 아래 top=254부터 시작한다.
        locate: (p) => vis(p, "consult-summary-card"),
        designTopHint: 254,
        mergeBands: 2,
      },
      {
        key: "channelSelector",
        label: "채널 선택",
        // 실측 — "어떻게 상담받으시겠어요?" 제목(387) + 옵션 2개 행(427) +
        // 안내 배너(538)까지가 consult-channel-selector.tsx 한 컨테이너다.
        locate: (p) => vis(p, "consult-channel-selector"),
        designTopHint: 387,
        mergeBands: 3,
        inkThreshold: BOX_INK_THRESHOLD,
      },
      {
        key: "form",
        label: "입력 폼",
        // 실측 — 이름/연락처 라벨 행(584) + 입력창 행(608) + 연락 희망
        // 시간 라벨(672) + 입력창(696)까지가 consult-form.tsx다. 디자인은
        // 이 아래에 "정하은 손해사정사" 카드(782)를 보여주지만, design.md
        // §1 D3가 이미 이 카드를 **성공/중복 요약의 텍스트 한 줄**로
        // 대체하기로 확정했다(폼 화면 자체에는 아예 렌더링하지 않는다) —
        // 그래서 이 요소는 폼(696+46=742)에서 끝나고 그 카드는 측정
        // 대상에 넣지 않는다.
        locate: (p) => vis(p, "consult-form"),
        designTopHint: 584,
        mergeBands: 4,
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "카카오 라디오 선택됨(기본값)",
        expected: "true",
        actual: await radioChecked(page, /카카오톡 상담/),
      },
      {
        label: "연락처 라벨 — 카카오톡 연락에 사용할…",
        expected: "true",
        actual: String(await page.getByLabel(/카카오톡 연락에 사용할 휴대폰 번호/).isVisible()),
      },
      {
        label: "연락 희망 시간 aria-required 부재(카카오 채널)",
        expected: "missing",
        actual: await attrValue(page, "consult-preferred-call-time-input", "aria-required"),
      },
      {
        label: "필수 동의 2 + 선택 1 = 동의 체크박스 3개 존재",
        expected: "3",
        actual: await consentCheckboxCount(page),
      },
      {
        label: "제출 버튼 aria-disabled=true(동의 전)",
        expected: "true",
        actual: await attrValue(page, "consult-submit-button", "aria-disabled"),
      },
      { label: "데스크톱 푸터 표시(.pen 03)", expected: "true", actual: await footerVisible(page) },
      {
        label: "상담 예정 전문가 카드 표시(내용은 중립 '배정 예정')",
        expected: "true",
        actual: String(
          await page.getByTestId("consult-expert-card").filter({ hasText: "배정 예정" }).isVisible()
        ),
      },
    ],
  },
  {
    id: "03-A2",
    label: "03-A2 상담 신청 — 전화 채널 선택 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 1426 },
    designExport: "03-A2-상담-신청-전화-선택.png",
    screenshotName: "03-A2-consult-phone.png",
    quietGap: 10,
    prepare: gotoConsultPhoneChannel,
    elements: [
      {
        key: "summary",
        label: "진단 결과 요약 카드",
        locate: (p) => vis(p, "consult-summary-card"),
        designTopHint: 254,
        mergeBands: 2,
      },
      {
        key: "channelSelector",
        label: "채널 선택",
        locate: (p) => vis(p, "consult-channel-selector"),
        designTopHint: 387,
        mergeBands: 3,
        inkThreshold: BOX_INK_THRESHOLD,
      },
      {
        key: "form",
        label: "입력 폼",
        locate: (p) => vis(p, "consult-form"),
        designTopHint: 584,
        mergeBands: 4,
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "전화 라디오 선택됨",
        expected: "true",
        actual: await radioChecked(page, /전화 상담/),
      },
      {
        label: "연락 희망 시간 aria-required=true(전화 채널)",
        expected: "true",
        actual: await attrValue(page, "consult-preferred-call-time-input", "aria-required"),
      },
      {
        // .pen 03-A2 문구(사용자 결정으로 design.md §1 D6의 중립 문구를 대체했다).
        label: "안내 문구 — 영업일 기준 1일 이내에 입력하신 번호로 전화드립니다(.pen 03-A2)",
        expected: "true",
        actual: String(
          await page
            .locator('[data-testid="consult-channel-notice"][role="status"]')
            .filter({ hasText: "영업일 기준 1일 이내에 입력하신 번호로 전화드립니다" })
            .isVisible()
        ),
      },
      {
        label: "상담 예정 전문가 카드 표시(내용은 중립 '배정 예정')",
        expected: "true",
        actual: String(
          await page.getByTestId("consult-expert-card").filter({ hasText: "배정 예정" }).isVisible()
        ),
      },
      {
        label: "이름 필드 힌트 '상담 시 호칭' 표시",
        expected: "true",
        actual: String(await page.getByTestId("consult-name-hint").isVisible()),
      },
      {
        label: "데스크톱 푸터 표시(.pen 03-A2)",
        expected: "true",
        actual: String(await page.getByTestId("consult-footer").isVisible()),
      },
    ],
  },
  {
    id: "03-B",
    label: "03-B 상담 신청 완료 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 805 },
    designExport: "03-B-상담-신청-완료.png",
    screenshotName: "03-B-consult-success.png",
    prepare: gotoConsultSuccess,
    elements: [
      {
        key: "summary",
        label: "성공 요약",
        locate: (p) => vis(p, "consult-success-summary"),
        designTopHint: 325,
        // D-NEW-17 — 잉크 측정 대신 바깥 테두리 상자(DOM rect vs 디자인 PNG 테두리 검출)로
        // left/width/height/top 4축을 게이트한다.
        // [.pen 최우선 지시] 부제를 .pen처럼 카드 위로 옮겨 예전에 제외했던 top(design.md §10
        // 순서 유지 결정)도 다시 게이트한다.
        borderBox: { hintTopCss: 306 },
      },
      {
        key: "backCta",
        // 디자인 export에서 이 행은 두 버튼(진단 결과로 돌아가기 / 신청 취소·정보 삭제 문의)
        // 사이 간격이 colGap 임계값보다 좁아 하나의 밴드/컬럼으로 병합 측정된다(segmentBands가
        // 둘을 분리하지 못함) — 병합된 디자인 폭을 버튼 하나와 비교하는 건 성립하지 않으므로
        // left/width는 게이트하지 않는다(top/height는 비교한다).
        label: "진단 결과로 돌아가기 CTA",
        locate: (p) => vis(p, "consult-success-back-cta"),
        designTopHint: 528,
        skipMetrics: ["left", "width"],
        skipReason: "같은 행의 두 번째 버튼과 병합 측정되어 폭 비교 불가 — top/height는 게이트한다",
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "체크 아이콘 존재",
        expected: "true",
        actual: await iconExists(page, "consult-success"),
      },
      {
        label: "마스킹 연락처 정규식 매칭",
        expected: "true",
        actual: String(
          CONSULT_PHONE_MASKED_PATTERN.test(
            (await page.getByTestId("consult-success-summary").textContent()) ?? ""
          )
        ),
      },
      {
        label: "원시 연락처 문자열 DOM 부재",
        expected: "false",
        actual: String(
          ((await page.getByTestId("consult-success-summary").textContent()) ?? "").includes(
            CONSULT_PHONE
          )
        ),
      },
      await successStackCheck(page),
      {
        label: "데스크톱 푸터 표시(.pen 03-B)",
        expected: "true",
        actual: await footerVisible(page),
      },
      {
        label: "신청 취소 · 정보 삭제 문의는 준비 중 비활성 버튼",
        expected: "true",
        actual: await attrEquals(page, "consult-success-cancel-inquiry", "aria-disabled", "true"),
      },
    ],
  },
  {
    id: "03-C",
    label: "03-C 상담 신청 중복 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 920 },
    designExport: "03-C-상담-신청-중복.png",
    screenshotName: "03-C-consult-duplicate.png",
    prepare: gotoConsultDuplicate,
    elements: [
      {
        key: "summary",
        label: "중복 요약",
        locate: (p) => vis(p, "consult-duplicate-summary"),
        designTopHint: 350,
        // D-NEW-17 — 바깥 테두리 상자로 4축을 모두 게이트한다.
        // [.pen 최우선 지시] 2줄 부제와 카드 아래 안내 박스를 .pen대로 구현해, 예전에 제외했던
        // top(design.md §10 계약에 없다는 이유)도 다시 게이트한다.
        borderBox: { hintTopCss: 331 },
      },
      {
        key: "note",
        label: "안내 박스(신청 내용 변경, 취소, 접수 상태 확인은…)",
        locate: (p) => vis(p, "consult-duplicate-notice"),
        // 구분선 없는 단일 안내 박스라 minDividers: 0으로 바깥 테두리 상자를 잰다(progress.md
        // D-NEW-28). 일반 측정 경로(글자 잉크)는 줄바꿈 위치 차이가 그대로 수치가 되어 척도로
        // 쓸 수 없었다.
        designTopHint: 553,
        borderBox: { hintTopCss: 553, minDividers: 0 },
      },
      {
        key: "backCta",
        // 이 행은 왼쪽 "기존 신청 상태 확인"(준비 중 비활성) + 오른쪽 "진단 결과로 돌아가기"라
        // 03-B와 같은 이유로 병합 측정된다. left/width는 게이트하지 않고 top/height는 비교한다.
        label: "진단 결과로 돌아가기 CTA",
        locate: (p) => vis(p, "consult-duplicate-back-cta"),
        designTopHint: 643,
        skipMetrics: ["left", "width"],
        skipReason: "같은 행의 첫 번째 버튼과 병합 측정되어 폭 비교 불가 — top/height는 게이트한다",
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "시계 아이콘 존재",
        expected: "true",
        actual: await iconExists(page, "consult-duplicate"),
      },
      {
        label: "기존 신청 상태 확인 CTA(스텁) 존재",
        expected: "true",
        actual: await testIdExists(page, "consult-duplicate-status-inquiry"),
      },
      {
        label: "기존 신청 상태 확인은 준비 중 비활성(aria-disabled=true)",
        expected: "true",
        actual: await attrEquals(page, "consult-duplicate-status-inquiry", "aria-disabled", "true"),
      },
      {
        label: "데스크톱 푸터 표시(.pen 03-C)",
        expected: "true",
        actual: await footerVisible(page),
      },
    ],
  },
  {
    id: "03-D",
    label: "03-D 상담 신청 실패 (Desktop)",
    platform: "desktop",
    viewport: { width: 1440, height: 899 },
    designExport: "03-D-상담-신청-실패.png",
    screenshotName: "03-D-consult-failure.png",
    prepare: gotoConsultFailure,
    elements: [
      {
        key: "summary",
        label: "실패 요약(입력 보존)",
        locate: (p) => vis(p, "consult-failure-summary"),
        designTopHint: 350,
        // D-NEW-17 — design.md §10은 이 카드에 정확히 4행(상담 방식/연락처/연락 희망
        // 시간/입력 내용)만 명시한다. 잉크 측정 대신 바깥 테두리 상자로 4축을 모두
        // 게이트한다(제외 축 없음).
        borderBox: { hintTopCss: 331 },
      },
      {
        key: "note",
        label: "안내 박스(같은 내용으로 다시 시도해도…)",
        locate: (p) => vis(p, "consult-failure-notice"),
        // 03-C 안내 박스와 같은 이유로 minDividers: 0(progress.md D-NEW-28).
        designTopHint: 553,
        borderBox: { hintTopCss: 553, minDividers: 0 },
      },
      {
        key: "retry",
        // 같은 행(다시 시도하기 + 이전 화면으로 돌아가기) — 03-B/03-C와
        // 동일한 이유로 두 버튼이 하나의 밴드로 병합 측정된다. left/width는
        // 게이트하지 않는다.
        label: "다시 시도하기",
        locate: (p) => vis(p, "consult-failure-retry"),
        designTopHint: 622,
        skipMetrics: ["left", "width"],
        skipReason: "design.md §10 — 같은 행의 두 번째 버튼과 병합 측정되어 폭 비교 불가",
      },
      {
        key: "backCta",
        label: "이전 화면으로 돌아가기",
        locate: (p) => vis(p, "consult-failure-back-cta"),
        designTopHint: 622,
        skipMetrics: ["left", "width"],
        skipReason: "design.md §10 — 같은 행의 첫 번째 버튼과 병합 측정되어 폭 비교 불가",
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "경고 아이콘 존재",
        expected: "true",
        actual: await iconExists(page, "consult-failure"),
      },
      {
        label: "다시 시도하기 CTA 존재",
        expected: "true",
        actual: await testIdExists(page, "consult-failure-retry"),
      },
      {
        // D-RUN 재작업(이번 세션) — design.md §10의 요약 4행(상담 방식/
        // 연락처/연락 희망 시간/입력 내용)에는 "이름"이 없다(design/exports/
        // 03-D-신청-실패.png 원본 목업도 4행뿐). 이전 버전은 요약 카드
        // 텍스트에 이름이 포함되는지로 "폼 상태 보존"을 확인했는데, 그
        // 요구 자체가 design.md와 어긋난 콘텐츠(요약에 이름 표시)를
        // 전제하고 있었다. 보존 메커니즘은 sessionStorage draft이므로 그
        // draft에 이름이 남아 있는지를 확인한다. [범위] draft의 이름 한
        // 필드만 본다 — 다른 필드의 보존과 재전송 payload 동일성은 이
        // 검사가 증명하지 않는다(consult-view.test.tsx가 검증).
        label: "draft에 이름 보존(sessionStorage, 이름 한 필드만 — 재전송 증명 아님)",
        expected: "true",
        actual: String(await draftNameMatches(page, CONSULT_NAME)),
      },
      {
        label: "데스크톱 푸터 표시(.pen 03-D)",
        expected: "true",
        actual: await footerVisible(page),
      },
    ],
  },
  {
    id: "M03",
    label: "M03 상담 신청 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 1244 },
    designExport: "M03-상담-신청.png",
    screenshotName: "M03-consult.png",
    quietGap: 10,
    // consult-submit-bar.tsx가 모바일에서 sticky + -mx-4(엣지투엣지) 흰
    // 배경(bg-app-surface)이라 회색 페이지 배경(bg-app-bg)과 다르다 — 02의
    // 하단 CTA 바 제외와 동일한 이유로 제출 바 상단에서 끊는다.
    backgroundProbe: {
      bottom: 1100,
      reason: "하단 sticky 제출 바(흰 배경)를 제외한다",
    },
    prepare: gotoConsultMain,
    elements: [
      {
        // D-RUN-1 — 이 hint(80)는 헤더/히어로가 구현에 없던 시점(요약
        // 카드가 페이지 첫 콘텐츠)에 잡힌 값이다. 헤더+히어로가 이제
        // 그 위에 오므로 normalized-design/M03.png 실측(카드 테두리
        // top≈181)으로 재조정한다.
        key: "summary",
        label: "진단 결과 요약 카드",
        locate: (p) => vis(p, "consult-summary-card"),
        designTopHint: 181,
        mergeBands: 2,
        inkThreshold: BOX_INK_THRESHOLD,
      },
      {
        // D-NEW-28 단위 2b — 모바일 디자인에는 채널 안내 배너가 없다. hint 386에서
        // 병합 4밴드는 카드1 상단 → 이름 입력창 하단(386→630)이라, 구현의
        // `consult-channel-selector` 전체 div(제목 → 안내 배너 하단)와 서로 다른
        // 구간을 비교하고 있었다. 양쪽에 모두 있는 요소인 라디오그룹(옵션 카드 2개,
        // 1열 스택)으로 재정의한다: 디자인은 카드1+카드2 = 2밴드(386→540).
        key: "channelSelector",
        label: "채널 선택(카드 2개)",
        locate: (p) =>
          p.locator('[data-testid="consult-channel-selector"]:visible [role="radiogroup"]'),
        designTopHint: 386,
        mergeBands: 2,
        inkThreshold: BOX_INK_THRESHOLD,
      },
      {
        // D-RUN-1 — mergeBands:3은 필드 3개=밴드 3개를 전제했지만 실측
        // (normalized-design/M03.png)에서 라벨/입력창이 각각 별도 밴드로
        // 잡혀 필드당 2밴드(라벨+입력창)×3필드=6밴드가 필요하다.
        key: "form",
        label: "입력 폼",
        locate: (p) => vis(p, "consult-form"),
        designTopHint: 584,
        mergeBands: 6,
        inkThreshold: BOX_INK_THRESHOLD,
        skipMetrics: ["top"],
        skipReason:
          "모바일 디자인 목업에는 채널 안내(role=status)가 없다. 그 안내를 모바일에서도 표시하는 것은 현재 화면의 설계 선택이며 REQ/AC나 M03 semanticChecks가 요구하는 필수 사항은 아니다(데스크톱 03-A2만 안내 문구를 검사한다). 예전에는 음수 마진(-mt-[62px])으로 폼을 안내 위로 끌어올려 top을 맞췄으나 그것이 안내가 이름 라벨·입력을 덮는 결함이었다. 음수 마진 제거로 폼이 안내 높이만큼 아래로 밀려 top이 약 62px 커진다(left/width/height는 계속 게이트). 이 편차에 대한 디자인 승인 기록은 없다. 절대 top 대신 semanticChecks의 '채널 안내 하단 → 이름 라벨/폼 상단 간격' 상대 위치 게이트(16~24px)가 폼이 과도하게 밀리거나 안내와 겹치는 회귀를 잡는다",
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "카카오 라디오 선택됨(기본값)",
        expected: "true",
        actual: await radioChecked(page, /카카오톡 상담/),
      },
      {
        label: "하단 제출 바 sticky 포지션 적용(md 미만 뷰포트)",
        expected: "sticky",
        actual: await elementPosition(page, "consult-submit-bar"),
      },
      {
        label: "채널 안내 하단 → 이름 라벨 상단 간격(상대 위치, gap-5=20px 기준)",
        expected: `${M03_NOTICE_TO_FORM_GAP.min}~${M03_NOTICE_TO_FORM_GAP.max}px`,
        actual: await gapBetweenWithinRange(
          page,
          '[data-testid="consult-channel-selector"] [role="status"]',
          'label[for="consult-name-input"]',
          M03_NOTICE_TO_FORM_GAP
        ),
      },
      {
        label: "채널 안내 하단 → 폼 컨테이너 상단 간격(상대 위치, gap-5=20px 기준)",
        expected: `${M03_NOTICE_TO_FORM_GAP.min}~${M03_NOTICE_TO_FORM_GAP.max}px`,
        actual: await gapBetweenWithinRange(
          page,
          '[data-testid="consult-channel-selector"] [role="status"]',
          '[data-testid="consult-form"]',
          M03_NOTICE_TO_FORM_GAP
        ),
      },
      {
        label: "푸터 숨김(.pen 모바일에는 없음)",
        expected: "false",
        actual: await footerVisible(page),
      },
      {
        label: "상담 예정 전문가 카드 표시(내용은 중립 '배정 예정')",
        expected: "true",
        actual: String(
          await page.getByTestId("consult-expert-card").filter({ hasText: "배정 예정" }).isVisible()
        ),
      },
    ],
  },
  {
    id: "M03-B",
    label: "M03-B 신청 완료 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 605 },
    designExport: "M03-B-신청-완료.png",
    screenshotName: "M03-B-consult-success.png",
    prepare: gotoConsultSuccess,
    elements: [
      {
        key: "summary",
        label: "성공 요약",
        locate: (p) => vis(p, "consult-success-summary"),
        designTopHint: 265,
        // D-NEW-17 — 옛 잉크 측정은 인접 밴드가 섞여 카드 height를 145/303/174px로
        // 제각각 재서 height를 제외해 두었다(progress.md Claim 48). 바깥 테두리 상자
        // (DOM rect vs 디자인 PNG 테두리색 가로줄 검출, 176px)로 바꿔 4축 모두 게이트한다.
        // 모바일은 카드 top이 디자인과 일치하므로 top도 게이트한다.
        borderBox: { hintTopCss: 248 },
      },
      {
        key: "backCta",
        label: "진단 결과로 돌아가기 CTA",
        locate: (p) => vis(p, "consult-success-back-cta"),
        // 442 = .pen M03-B 주 버튼 top(카드 248 + 176 + 간격 18). 이전 기준값 501은 디자인 export의
        // 두 번째 버튼("신청 취소 · 정보 삭제 문의") 위치라 구현의 주 버튼(447)과 54px 어긋난 것으로
        // 잘못 측정됐다(단위 4 측정에서 발견).
        designTopHint: 442,
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "체크 아이콘 존재",
        expected: "true",
        actual: await iconExists(page, "consult-success"),
      },
      {
        label: "마스킹 연락처 정규식 매칭",
        expected: "true",
        actual: String(
          CONSULT_PHONE_MASKED_PATTERN.test(
            (await page.getByTestId("consult-success-summary").textContent()) ?? ""
          )
        ),
      },
      {
        label: "원시 연락처 문자열 DOM 부재",
        expected: "false",
        actual: String(
          ((await page.getByTestId("consult-success-summary").textContent()) ?? "").includes(
            CONSULT_PHONE
          )
        ),
      },
      await successStackCheck(page),
      {
        label: "푸터 숨김(.pen 모바일에는 없음)",
        expected: "false",
        actual: await footerVisible(page),
      },
    ],
  },
  {
    id: "M03-C",
    label: "M03-C 신청 중복 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 718 },
    designExport: "M03-C-신청-중복.png",
    screenshotName: "M03-C-consult-duplicate.png",
    prepare: gotoConsultDuplicate,
    elements: [
      {
        key: "summary",
        label: "중복 요약",
        locate: (p) => vis(p, "consult-duplicate-summary"),
        designTopHint: 319,
        // D-NEW-17 — 바깥 테두리 상자로 4축을 모두 게이트한다.
        // [.pen 최우선 지시] 2줄 부제·안내 박스를 .pen대로 구현해 예전 top 제외를 풀었다.
        borderBox: { hintTopCss: 302 },
      },
      {
        key: "note",
        label: "안내 박스(변경·취소·상태 확인은…)",
        locate: (p) => vis(p, "consult-duplicate-notice"),
        // 03-C 안내 박스와 같은 이유로 minDividers: 0(progress.md D-NEW-28).
        designTopHint: 496,
        borderBox: { hintTopCss: 496, minDividers: 0 },
      },
      {
        // .pen M03-C: 주 버튼(기존 신청 상태 확인, 준비 중 비활성) top 555, 보조 버튼 top 614.
        key: "statusInquiry",
        label: "기존 신청 상태 확인(준비 중)",
        locate: (p) => vis(p, "consult-duplicate-status-inquiry"),
        designTopHint: 555,
      },
      {
        key: "backCta",
        label: "진단 결과로 돌아가기 CTA",
        locate: (p) => vis(p, "consult-duplicate-back-cta"),
        designTopHint: 614,
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "시계 아이콘 존재",
        expected: "true",
        actual: await iconExists(page, "consult-duplicate"),
      },
      {
        label: "기존 신청 상태 확인 CTA(스텁) 존재",
        expected: "true",
        actual: await testIdExists(page, "consult-duplicate-status-inquiry"),
      },
      {
        label: "푸터 숨김(.pen 모바일에는 없음)",
        expected: "false",
        actual: await footerVisible(page),
      },
    ],
  },
  {
    id: "M03-D",
    label: "M03-D 신청 실패 (Mobile)",
    platform: "mobile",
    viewport: { width: 390, height: 737 },
    designExport: "M03-D-신청-실패.png",
    screenshotName: "M03-D-consult-failure.png",
    prepare: gotoConsultFailure,
    elements: [
      {
        key: "summary",
        label: "실패 요약(입력 보존)",
        locate: (p) => vis(p, "consult-failure-summary"),
        designTopHint: 319,
        // D-NEW-17 — design.md §10은 이 카드에 정확히 4행(상담 방식/연락처/연락 희망
        // 시간/입력 내용)만 명시한다. 옛 잉크 측정(height 176~381px로 측정법마다 달랐음)
        // 대신 바깥 테두리 상자로 4축을 모두 게이트한다(제외 축 없음).
        borderBox: { hintTopCss: 302 },
      },
      {
        key: "note",
        label: "안내 박스(같은 내용으로 다시 시도해도…)",
        locate: (p) => vis(p, "consult-failure-notice"),
        // 03-C 안내 박스와 같은 이유로 minDividers: 0(progress.md D-NEW-28).
        designTopHint: 496,
        borderBox: { hintTopCss: 496, minDividers: 0 },
      },
      {
        key: "retry",
        label: "다시 시도하기",
        locate: (p) => vis(p, "consult-failure-retry"),
        designTopHint: 574,
      },
      {
        key: "backCta",
        label: "이전 화면으로 돌아가기",
        locate: (p) => vis(p, "consult-failure-back-cta"),
        designTopHint: 633,
      },
    ],
    semanticChecks: async (page) => [
      {
        label: "경고 아이콘 존재",
        expected: "true",
        actual: await iconExists(page, "consult-failure"),
      },
      {
        label: "다시 시도하기 CTA 존재",
        expected: "true",
        actual: await testIdExists(page, "consult-failure-retry"),
      },
      {
        // D-RUN 재작업(이번 세션) — 03-D와 동일한 이유(design.md §10 요약
        // 4행에 "이름" 없음)와 동일한 범위 한계. draftNameMatches() 참고.
        label: "draft에 이름 보존(sessionStorage, 이름 한 필드만 — 재전송 증명 아님)",
        expected: "true",
        actual: String(await draftNameMatches(page, CONSULT_NAME)),
      },
      {
        label: "푸터 숨김(.pen 모바일에는 없음)",
        expected: "false",
        actual: await footerVisible(page),
      },
    ],
  },
];

// ── 서버 기동 ────────────────────────────────────────────────────────
async function startProductionServer(): Promise<{ baseURL: string; stop: () => void }> {
  // SPEC-B2C-CONSULT-001 M7 — 03-B/03-C(성공/중복)가 실제 POST
  // /api/consultations 제출로 도달해야 해서 서버 부팅에 TURSO_DATABASE_URL
  // (lib/env.ts app 스코프는 항상 필수 — CONSULT_POLICY_READY와 무관)과
  // 상담 신청 3개 env가 필요해졌다. 기존 값이 이미 있으면 그대로 두고, 없을 때만 이
  // 스크립트 전용 로컬 file DB 기본값을 채운다. 이미 설정된 값이 file:이 아닌 원격
  // 주소면 main() 진입 직후 findRemoteDatabaseViolation이 실행 자체를 거부한다.
  process.env.TURSO_DATABASE_URL ??= "file:./.tmp/visual-verify.db";
  process.env.LLM_PROVIDER_MODE ??= "deterministic";
  fs.mkdirSync(path.join(PROJECT_ROOT, ".tmp"), { recursive: true });
  await runMigrations();

  const env = {
    ...process.env,
    ENABLE_DIAGNOSIS_DEV_STATES: "true",
    // design.md §4(REQ-B2CCONSULT-005) — ENABLE_CONSULT_FLOW 단독으로
    // /consult 라우트 게이트가 열린다. CONSULT_POLICY_READY=true는
    // 03-B/03-C의 실제 제출 성공에 필요하다(route.ts 2단계 정책 검증) —
    // 03-D는 요청을 중단시키는 네트워크 예외 분기로 도달하므로 서버 응답과 무관하다.
    ENABLE_CONSULT_FLOW: "true",
    CONSULT_POLICY_READY: "true",
    RATE_LIMIT_HMAC_SECRET:
      process.env.RATE_LIMIT_HMAC_SECRET ?? "visual-verify-rate-limit-hmac-secret",
  };

  if (process.env.VISUAL_SKIP_BUILD !== "1") {
    console.log(
      "[visual-verify] pnpm build (ENABLE_DIAGNOSIS_DEV_STATES=true, ENABLE_CONSULT_FLOW=true)"
    );
    execSync("pnpm build", { cwd: PROJECT_ROOT, env, stdio: "inherit" });
  }

  // 포트는 금지 포트(Node fetch "bad port" / Chromium ERR_UNSAFE_PORT)를 피해 고른다.
  // spawn 이후 준비 확인이 실패하면 startManagedServer가 자식 트리를 정리하고 던지므로,
  // 이 함수가 실패하면 남은 서버가 없다.
  return startManagedServer({
    readyTimeoutMs: 120_000,
    log: (message) => console.log(`[visual-verify] ${message}`),
    spawnOnPort: (port) => {
      console.log(`[visual-verify] pnpm start → http://localhost:${port}`);
      return spawn("pnpm", ["start"], {
        cwd: PROJECT_ROOT,
        env: { ...env, PORT: String(port) },
        stdio: "ignore",
        shell: true,
        detached: process.platform !== "win32",
      });
    },
  });
}

// ── 측정 ─────────────────────────────────────────────────────────────
declare global {
  interface Window {
    __vv: {
      loadImageData: (dataUrl: string, w?: number, h?: number) => Promise<ImageData>;
      dominantColor: (d: ImageData, region?: Box) => { r: number; g: number; b: number };
      edgeBackground: (
        d: ImageData,
        opts: { top?: number; bottom?: number; stripWidth?: number }
      ) => {
        r: number;
        g: number;
        b: number;
        coverage: number;
        sampled: number;
        region: { top: number; bottom: number; stripWidth: number };
      };
      segmentBands: (d: ImageData, opts: Record<string, unknown>) => DesignBand[];
      tightBox: (
        d: ImageData,
        bg: { r: number; g: number; b: number },
        threshold: number,
        region: Box
      ) => Box | null;
      findBrightBox: (d: ImageData, minBrightness: number) => Box | null;
      findCardBorderBox: (
        d: ImageData,
        opts: { scale: number; hintTopCss: number; hintToleranceCss?: number; minDividers?: number }
      ) => (BorderBox & { dividerCount: number }) | null;
      composeOverlay: (a: string, b: string, w: number, h: number) => Promise<string>;
      composeDiff: (a: string, b: string, w: number, h: number) => Promise<string>;
      normalizeDesign: (a: string, w: number, h: number) => Promise<string>;
    };
  }
}

interface DomInfo {
  rect: Box;
  text: string;
  lines: string[];
  backgroundColor: string;
  fontSize: string;
  lineHeight: string;
}

/** 구현 쪽 DOM 정보(요소 식별 + 줄 구성 + 배경색). */
async function readDom(locator: Locator): Promise<DomInfo> {
  return locator.evaluate((el: Element) => {
    const rect = el.getBoundingClientRect();
    // 줄 구성은 글자 하나씩의 클라이언트 사각형을 세로 위치로 묶어 만든다.
    // Range 전체의 getClientRects()는 줄별 사각형을 주지만 그 줄의 "텍스트"는
    // 알려주지 않으므로, 줄바꿈 지점 검증에는 글자 단위 묶음이 필요하다.
    const buckets: Array<{ top: number; chars: string[] }> = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    const range = document.createRange();
    while (node) {
      const value = node.nodeValue ?? "";
      for (let i = 0; i < value.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        let bucket = buckets.find((b) => Math.abs(b.top - r.top) < 4);
        if (!bucket) {
          bucket = { top: r.top, chars: [] };
          buckets.push(bucket);
        }
        bucket.chars.push(value[i]);
      }
      node = walker.nextNode();
    }
    const lines = buckets
      .sort((a, b) => a.top - b.top)
      .map((b) => b.chars.join("").replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);
    const style = getComputedStyle(el);
    return {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
      lines,
      backgroundColor: style.backgroundColor,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
    };
  });
}

function toDataUrl(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function writeDataUrl(filePath: string, dataUrl: string) {
  fs.writeFileSync(filePath, Buffer.from(dataUrl.split(",")[1], "base64"));
}

function mergeBoxes(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

interface Finding {
  screen: string;
  element: string;
  kind: "metric" | "lines" | "line-text" | "text" | "state" | "missing" | "background";
  detail: string;
  delta?: number;
  tolerance?: number;
}

interface ElementResult {
  key: string;
  label: string;
  design: Box | null;
  impl: Box | null;
  delta: Partial<Record<"left" | "top" | "width" | "height", number>>;
  lines: { expected?: number; actual: number };
  lineTexts?: { expected: readonly string[]; actual: string[] };
  /** borderBox 요소만: 바깥 테두리 상자 게이트에서 근거와 함께 제외된 축(측정은 기록됨). */
  borderBoxSkipped?: Array<{ axis: BorderAxis; reason: string; delta: number }>;
  text: string;
  backgroundColor: string;
  fontSize: string;
  lineHeight: string;
  pass: boolean;
}

interface ScreenResult {
  id: string;
  label: string;
  platform: Platform;
  tolerance: number;
  viewport: { width: number; height: number };
  designExport: string;
  nextjsPortalCount: number;
  designBands: DesignBand[];
  designBandsLow: DesignBand[];
  cropBox?: { design: Box | null; impl: Box | null; delta: Record<string, number> };
  /**
   * D2(8차) — 게이트 대상 배경색. 7차의 `dominantBackground`(화면 전체 최빈색,
   * 기록만 하고 판정하지 않음)를 대체한다. 좌우 가장자리 띠에서 디자인·구현을
   * 같은 방식으로 측정하고 색과 균일도를 모두 게이트한다.
   */
  background: {
    probe: { top: number; bottom: number; minCoverage: number };
    design: { color: string; coverage: number };
    impl: { color: string; coverage: number };
  };
  elements: ElementResult[];
  semantic: Array<{ label: string; expected: string; actual: string; pass: boolean }>;
  maxDelta: number;
  pass: boolean;
}

function rgbToHex(c: { r: number; g: number; b: number }) {
  return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

async function verifyScreen(
  browser: Browser,
  analysis: Page,
  baseURL: string,
  spec: ScreenSpec,
  findings: Finding[]
): Promise<ScreenResult> {
  // D2(8차) — 이 화면이 만든 위반 건수로 PASS를 판정한다. 7차는
  // `elements.every(pass) && semantic.every(pass) && maxDelta<=tolerance`로
  // 판정해서, 요소 단위 pass 플래그에 반영되지 않는 위반(크롭 박스 측정
  // 실패, 배경색 결함)이 findings에는 쌓이면서도 화면은 PASS로 남을 수
  // 있었다. "위반이 하나라도 생겼으면 그 화면은 FAIL"이 유일한 규칙이다.
  const findingsBefore = findings.length;

  const context = await browser.newContext({
    viewport: spec.viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await context.addInitScript(KEEP_NAMES_SHIM);
  const page = await context.newPage();

  try {
    await spec.prepare(page, baseURL);

    // [HARD] 프로덕션 캡처 단언 — 개발 서버라면 이 요소가 존재한다.
    const portalCount = await page.locator("nextjs-portal").count();
    if (portalCount !== 0) {
      throw new Error(
        `${spec.id}: <nextjs-portal>이 ${portalCount}개 발견됐습니다 — 개발 서버를 캡처하고 있습니다.`
      );
    }

    // 애니메이션 정지(캡처 재현성). 오버레이 열림 전이가 끝난 뒤에 주입해
    // Drawer/Dialog의 마운트 동작을 방해하지 않는다.
    await page.addStyleTag({
      content: `*, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }`,
    });
    await page.waitForTimeout(120);

    // 03-B/03-D/M03-B/M03-D는 폼을 다 채운 뒤 제출하는데, 모바일 뷰포트에서는
    // 폼이 뷰포트보다 길어 제출 버튼에 도달하려면 실제로 스크롤이 필요하다
    // (실측: 제출 직전 scrollY≈650). 성공/실패 화면 전환이 client-side 상태
    // 전환(하드 네비게이션 없음)이라 그 스크롤 위치가 전환 후에도 그대로
    // 남는다(실측: 전환 직후 scrollY≈75, 0이 아님). 디자인 export는 항상
    // scrollY=0 기준이므로 여기서 명시적으로 top=0으로 되돌려야 두 기준이
    // 같은 원점을 공유한다. 이미 0이면 완전한 no-op이다(그 상태 자체는
    // ad-hoc 재현 스크립트로 확인함).
    await page.evaluate(() => window.scrollTo(0, 0));

    const domInfos = new Map<string, DomInfo | null>();
    for (const element of spec.elements) {
      const locator = element.locate(page);
      domInfos.set(
        element.key,
        (await locator.count()) > 0 ? await readDom(locator.first()) : null
      );
    }

    const semantic: ScreenResult["semantic"] = [];
    if (spec.semanticChecks) {
      for (const check of await spec.semanticChecks(page)) {
        const pass = check.expected === check.actual;
        semantic.push({ ...check, pass });
        if (!pass) {
          findings.push({
            screen: spec.id,
            element: check.label,
            kind: "state",
            detail: `기대 "${check.expected}" vs 실제 "${check.actual}"`,
          });
        }
      }
    }

    const implBuffer = await page.screenshot();
    const implUrl = toDataUrl(implBuffer);
    const designBuffer = fs.readFileSync(path.join(DESIGN_DIR, spec.designExport));
    const designRawUrl = toDataUrl(designBuffer);

    const { width, height } = spec.viewport;
    const designUrl = await analysis.evaluate(
      ([url, w, h]) => window.__vv.normalizeDesign(url as string, w as number, h as number),
      [designRawUrl, width, height] as const
    );

    // 산출물 저장 — 정규화 디자인 / 구현 캡처 / overlay / diff.
    // (SPEC-B2C-CONSULT-001 D-RUN-5 — 화면 id별로 소유 SPEC 경로가 갈린다.)
    writeDataUrl(path.join(dirNormalized(spec.id), `${spec.id}.png`), designUrl);
    fs.writeFileSync(path.join(dirScreenshots(spec.id), spec.screenshotName), implBuffer);
    writeDataUrl(
      path.join(dirOverlays(spec.id), `${spec.id}.png`),
      await analysis.evaluate(
        ([d, i, w, h]) =>
          window.__vv.composeOverlay(d as string, i as string, w as number, h as number),
        [designUrl, implUrl, width, height] as const
      )
    );
    writeDataUrl(
      path.join(dirDiffs(spec.id), `${spec.id}.png`),
      await analysis.evaluate(
        ([d, i, w, h]) =>
          window.__vv.composeDiff(d as string, i as string, w as number, h as number),
        [designUrl, implUrl, width, height] as const
      )
    );

    // 배경 프로브 영역 — 화면별 재정의가 없으면 플랫폼 기본값을 쓴다.
    const probe = {
      top: spec.backgroundProbe?.top ?? PROBE_TOP_DEFAULT[spec.platform],
      bottom: spec.backgroundProbe?.bottom ?? height,
      minCoverage: spec.backgroundProbe?.minCoverage ?? PROBE_MIN_COVERAGE,
    };

    // 디자인/구현 양쪽에서 동일한 ink 세그먼트 알고리즘으로 측정한다.
    const analysed = await analysis.evaluate(
      async ([d, i, w, h, cropMode, quietGap, colGap, rectsJson, probeJson]) => {
        const design = await window.__vv.loadImageData(d as string, w as number, h as number);
        const impl = await window.__vv.loadImageData(i as string, w as number, h as number);

        // 배경 프로브는 크롭/세그먼트와 무관하게 원본 프레임 좌표에서 잰다.
        const probeOpts = JSON.parse(probeJson as string) as { top: number; bottom: number };
        const designEdge = window.__vv.edgeBackground(design, probeOpts);
        const implEdge = window.__vv.edgeBackground(impl, probeOpts);

        let designRegion: Box | undefined;
        let implRegion: Box | undefined;
        if (cropMode === "bright-box") {
          designRegion = window.__vv.findBrightBox(design, 236) ?? undefined;
          implRegion = window.__vv.findBrightBox(impl, 236) ?? undefined;
        }

        const designBg = window.__vv.dominantColor(design, designRegion);
        const implBg = window.__vv.dominantColor(impl, implRegion);

        // 모달/시트 내부는 좌우 테두리와 상단 모서리 그림자를 제외한다.
        const inset = (b: Box | undefined) =>
          b
            ? { left: b.left + 6, top: b.top + 16, width: b.width - 12, height: b.height - 16 }
            : undefined;

        const bandOpts = {
          bg: designBg,
          quietGap: (quietGap as number) ?? 8,
          colGap: (colGap as number) ?? 12,
          region: inset(designRegion),
        };
        const bands = window.__vv.segmentBands(design, bandOpts);
        // 저대비 박스용 2차 세그먼트(동일 알고리즘, 임계값만 낮춤).
        // 테두리만 있는 상자는 위·아래 테두리 행만 잉크가 많고 중간 행은
        // 좌우 테두리 2픽셀뿐이다 — minInkPerRow를 2로 낮춰야 상자 전체가
        // 하나의 밴드로 잡힌다(6이면 위/아래 테두리가 각각 높이 3짜리
        // 별개 밴드로 쪼개진다).
        const bandsLow = window.__vv.segmentBands(design, {
          ...bandOpts,
          threshold: 6,
          minInkPerRow: 2,
        });

        // 구현 쪽은 DOM rect로 요소를 "식별"하고, 그 rect 안의 잉크로
        // "측정"한다 — 디자인의 ink 박스와 동일한 기준이 된다.
        const rects = JSON.parse(rectsJson as string) as Array<{
          key: string;
          rect: Box | null;
          threshold: number;
        }>;
        const implBoxes: Record<string, Box | null> = {};
        for (const { key, rect, threshold } of rects) {
          if (!rect || rect.width < 1 || rect.height < 1) {
            implBoxes[key] = null;
            continue;
          }
          const pad = 2;
          const region = {
            left: Math.max(0, Math.floor(rect.left) - pad),
            top: Math.max(0, Math.floor(rect.top) - pad),
            width: Math.min(impl.width, Math.ceil(rect.width) + pad * 2),
            height: Math.min(impl.height, Math.ceil(rect.height) + pad * 2),
          };
          region.width = Math.min(region.width, impl.width - region.left);
          region.height = Math.min(region.height, impl.height - region.top);
          implBoxes[key] = window.__vv.tightBox(impl, implBg, threshold, region);
        }

        return {
          bands,
          bandsLow,
          implBoxes,
          designBg,
          implBg,
          designEdge,
          implEdge,
          designCrop: designRegion ?? null,
          implCrop: implRegion ?? null,
        };
      },
      [
        designUrl,
        implUrl,
        width,
        height,
        spec.cropMode ?? null,
        spec.quietGap ?? null,
        spec.colGap ?? null,
        JSON.stringify(
          spec.elements.map((e) => ({
            key: e.key,
            rect: domInfos.get(e.key)?.rect ?? null,
            threshold: inkThresholdFor(e),
          }))
        ),
        JSON.stringify({ top: probe.top, bottom: probe.bottom }),
      ] as const
    );

    // ── 카드 바깥 테두리 상자(디자인 쪽) — borderBox 요소만 ─────────────
    // 리샘플하지 않은 원본 PNG(2배 export)에서 잰다: 1배로 줄이면 테두리색이 배경과
    // 섞여 검출 기준이 흐려진다. scale = 원본 폭 / 뷰포트 폭이 정수가 아니면 export
    // 규격이 바뀐 것이므로 조용히 넘어가지 않고 이 화면을 오류로 만든다.
    const borderBoxElements = spec.elements.filter((e) => e.borderBox);
    const designBorderBoxes: Record<string, BorderBox | null> = {};
    if (borderBoxElements.length > 0) {
      const measured = await analysis.evaluate(
        async ([raw, viewportWidth, hintsJson]) => {
          const image = await window.__vv.loadImageData(raw as string);
          const scale = image.width / (viewportWidth as number);
          const hints = JSON.parse(hintsJson as string) as Array<{
            key: string;
            hint: number;
            minDividers?: number;
          }>;
          const boxes: Record<string, BorderBox | null> = {};
          for (const { key, hint, minDividers } of hints) {
            const found = window.__vv.findCardBorderBox(image, {
              scale,
              hintTopCss: hint,
              minDividers,
            });
            boxes[key] = found
              ? { left: found.left, top: found.top, width: found.width, height: found.height }
              : null;
          }
          return { scale, boxes };
        },
        [
          designRawUrl,
          width,
          JSON.stringify(
            borderBoxElements.map((e) => ({
              key: e.key,
              hint: e.borderBox!.hintTopCss,
              minDividers: e.borderBox!.minDividers,
            }))
          ),
        ] as const
      );
      if (Math.abs(measured.scale - Math.round(measured.scale)) > 1e-6 || measured.scale < 1) {
        throw new Error(
          `${spec.id}: 디자인 export 폭/뷰포트 폭 비율이 정수가 아닙니다(${measured.scale}) — export 규격이 바뀌었는지 확인하세요.`
        );
      }
      Object.assign(designBorderBoxes, measured.boxes);
    }

    // ── 배경색 게이트 (D2 8차) ────────────────────────────────────────
    // 7차는 배경색을 "기록"만 하고 판정하지 않아, M01-C에서 콘텐츠 아래가
    // 통째로 흰색이던 실제 결함을 스크립트가 통과시켰다. 세 가지를 모두
    // 게이트한다.
    const designEdgeHex = rgbToHex(analysed.designEdge);
    const implEdgeHex = rgbToHex(analysed.implEdge);
    const probeLabel = `배경 프로브(y ${probe.top}~${probe.bottom}, 좌우 8px 띠)`;

    // ① 디자인 쪽 균일도 — 프로브 영역이 실제로 배경인지에 대한 설정 검증이다.
    //    여기서 걸리면 구현 결함이 아니라 프로브 영역 설정이 틀린 것이다.
    if (analysed.designEdge.coverage < probe.minCoverage) {
      findings.push({
        screen: spec.id,
        element: probeLabel,
        kind: "background",
        detail: `디자인 프로브 영역이 균일한 배경이 아닙니다 — 최빈색 ${designEdgeHex} 점유율 ${(analysed.designEdge.coverage * 100).toFixed(2)}% < 기준 ${(probe.minCoverage * 100).toFixed(2)}%. 프로브 영역 설정(backgroundProbe)을 재검토해야 합니다.`,
      });
    }

    // ② 구현 쪽 균일도 — "콘텐츠 아래만 다른 색"처럼 최빈색으로는 잡히지
    //    않는 결함을 잡는 축이다.
    if (analysed.implEdge.coverage < probe.minCoverage) {
      findings.push({
        screen: spec.id,
        element: probeLabel,
        kind: "background",
        detail: `구현 배경이 프로브 영역에서 균일하지 않습니다 — 최빈색 ${implEdgeHex} 점유율 ${(analysed.implEdge.coverage * 100).toFixed(2)}% < 기준 ${(probe.minCoverage * 100).toFixed(2)}% (배경이 아닌 색이 ${(100 - analysed.implEdge.coverage * 100).toFixed(2)}% 섞여 있습니다).`,
      });
    }

    // ③ 색 일치 — 디자인과 구현의 배경색 자체가 같아야 한다(채널당 ±1).
    const channelDelta = Math.max(
      Math.abs(analysed.designEdge.r - analysed.implEdge.r),
      Math.abs(analysed.designEdge.g - analysed.implEdge.g),
      Math.abs(analysed.designEdge.b - analysed.implEdge.b)
    );
    if (channelDelta > BACKGROUND_CHANNEL_TOLERANCE) {
      findings.push({
        screen: spec.id,
        element: probeLabel,
        kind: "background",
        detail: `배경색 디자인 ${designEdgeHex} vs 구현 ${implEdgeHex} (최대 채널차 ${channelDelta} > 허용 ${BACKGROUND_CHANNEL_TOLERANCE})`,
      });
    }

    const tolerance = TOLERANCE[spec.platform];
    const elements: ElementResult[] = [];
    let maxDelta = 0;

    for (const element of spec.elements) {
      const dom = domInfos.get(element.key) ?? null;
      const implBox = analysed.implBoxes[element.key] ?? null;

      // 바깥 테두리 상자 게이트 요소 — 잉크 측정 경로를 타지 않는다(위 borderBox 주석).
      if (element.borderBox) {
        const round2 = (v: number) => Math.round(v * 100) / 100;
        const designBorder = designBorderBoxes[element.key] ?? null;
        const implBorder: BorderBox | null = dom
          ? {
              left: round2(dom.rect.left),
              top: round2(dom.rect.top),
              width: round2(dom.rect.width),
              height: round2(dom.rect.height),
            }
          : null;
        if (!dom) {
          findings.push({
            screen: spec.id,
            element: element.label,
            kind: "missing",
            detail: "구현에서 요소를 찾지 못했습니다.",
          });
        }
        if (!designBorder) {
          findings.push({
            screen: spec.id,
            element: element.label,
            kind: "missing",
            detail: `디자인 PNG에서 top≈${element.borderBox.hintTopCss}px 부근의 카드 테두리 상자(테두리색 가로줄 + 구분선)를 찾지 못했습니다 — 측정 공백은 통과로 취급하지 않습니다.`,
          });
        }
        const gate = evaluateCardBorderGate({
          design: designBorder,
          impl: implBorder,
          tolerance,
          skip: element.borderBox.skip,
        });
        for (const v of gate.violations) {
          findings.push({
            screen: spec.id,
            element: element.label,
            kind: "metric",
            detail: `[바깥 테두리 상자] ${v.axis} 디자인 ${v.design} vs 구현 ${v.impl}`,
            delta: v.delta,
            tolerance,
          });
        }
        if (gate.deltas) {
          const skippedAxes = new Set(gate.skipped.map((s) => s.axis));
          for (const axis of ["left", "top", "width", "height"] as const) {
            if (!skippedAxes.has(axis)) maxDelta = Math.max(maxDelta, gate.deltas[axis]);
          }
        }
        elements.push({
          key: element.key,
          label: element.label,
          design: designBorder,
          impl: implBorder,
          delta: gate.deltas ?? {},
          lines: { expected: element.expectLines, actual: dom?.lines.length ?? 0 },
          borderBoxSkipped: gate.skipped,
          text: dom?.text ?? "",
          backgroundColor: dom?.backgroundColor ?? "",
          fontSize: dom?.fontSize ?? "",
          lineHeight: dom?.lineHeight ?? "",
          pass: gate.pass && dom !== null,
        });
        continue;
      }

      // 디자인 밴드 매칭 — hint에 가장 가까운 밴드를 고른다. 요소가 저대비
      // 박스면 같은 알고리즘의 낮은-임계값 세그먼트 결과에서 찾는다.
      const bandSource = inkThresholdFor(element) < 18 ? analysed.bandsLow : analysed.bands;
      const candidates = bandSource
        .map((band, index) => ({ band, index, dist: Math.abs(band.top - element.designTopHint) }))
        .sort((a, b) => a.dist - b.dist);
      const matched = candidates[0] && candidates[0].dist <= 30 ? candidates[0] : null;

      let designBox: Box | null = null;
      if (matched) {
        const merge = element.mergeBands ?? 1;
        const slice = bandSource.slice(matched.index, matched.index + merge);
        if (element.designColRange) {
          const [from, to] = element.designColRange;
          const picked = matched.band.cols.slice(from, to + 1).filter(Boolean);
          designBox = picked.length > 0 ? mergeBoxes(picked) : null;
        } else if (element.designColIndex !== undefined) {
          designBox = matched.band.cols[element.designColIndex] ?? null;
        } else {
          designBox = mergeBoxes(slice.map((b) => ({ ...b })));
        }
      }

      const delta: ElementResult["delta"] = {};
      let pass = true;

      if (!dom) {
        findings.push({
          screen: spec.id,
          element: element.label,
          kind: "missing",
          detail: "구현에서 요소를 찾지 못했습니다.",
        });
        pass = false;
      }
      if (!designBox) {
        findings.push({
          screen: spec.id,
          element: element.label,
          kind: "missing",
          detail: `디자인 이미지에서 top≈${element.designTopHint} 부근의 밴드를 찾지 못했습니다(가장 가까운 밴드 top=${candidates[0]?.band.top ?? "없음"}).`,
        });
        pass = false;
      }
      // D2(8차) — DOM 요소는 찾았는데 그 영역에서 잉크 박스가 안 나오는 경우
      // (요소가 0×0이거나 배경과 완전히 같은 색). 7차는 이 경우 delta를 아예
      // 계산하지 않고 조용히 넘어가 측정 공백이 PASS로 남았다.
      if (dom && !implBox) {
        findings.push({
          screen: spec.id,
          element: element.label,
          kind: "missing",
          detail: `구현에서 DOM 요소는 찾았지만 그 영역(${Math.round(dom.rect.width)}×${Math.round(dom.rect.height)}) 안에서 잉크 박스를 측정하지 못했습니다 — 측정 공백은 통과로 취급하지 않습니다.`,
        });
        pass = false;
      }

      if (designBox && implBox) {
        for (const axis of ["left", "top", "width", "height"] as const) {
          const d = Math.abs(designBox[axis] - implBox[axis]);
          delta[axis] = d;
          if (element.skipMetrics?.includes(axis)) continue;
          maxDelta = Math.max(maxDelta, d);
          if (d > tolerance) {
            pass = false;
            findings.push({
              screen: spec.id,
              element: element.label,
              kind: "metric",
              detail: `${axis} 디자인 ${designBox[axis]} vs 구현 ${implBox[axis]}`,
              delta: d,
              tolerance,
            });
          }
        }
      }

      if (dom && element.expectLines !== undefined && dom.lines.length !== element.expectLines) {
        pass = false;
        findings.push({
          screen: spec.id,
          element: element.label,
          kind: "lines",
          detail: `줄 수 기대 ${element.expectLines} vs 실제 ${dom.lines.length} (${dom.lines.join(" / ")})`,
        });
      }
      if (dom && element.expectLineTexts) {
        const actual = dom.lines;
        const same =
          actual.length === element.expectLineTexts.length &&
          actual.every((line, i) => line === element.expectLineTexts![i]);
        if (!same) {
          pass = false;
          findings.push({
            screen: spec.id,
            element: element.label,
            kind: "line-text",
            detail: `줄바꿈 지점 기대 [${element.expectLineTexts.join(" | ")}] vs 실제 [${actual.join(" | ")}]`,
          });
        }
      }
      if (dom && element.expectText !== undefined && dom.text !== element.expectText) {
        pass = false;
        findings.push({
          screen: spec.id,
          element: element.label,
          kind: "text",
          detail: `문구 기대 "${element.expectText}" vs 실제 "${dom.text}"`,
        });
      }

      elements.push({
        key: element.key,
        label: element.label,
        design: designBox,
        impl: implBox,
        delta,
        lines: { expected: element.expectLines, actual: dom?.lines.length ?? 0 },
        lineTexts: element.expectLineTexts
          ? { expected: element.expectLineTexts, actual: dom?.lines ?? [] }
          : undefined,
        text: dom?.text ?? "",
        backgroundColor: dom?.backgroundColor ?? "",
        fontSize: dom?.fontSize ?? "",
        lineHeight: dom?.lineHeight ?? "",
        pass,
      });
    }

    let cropBox: ScreenResult["cropBox"];
    if (spec.cropMode === "bright-box") {
      const d = analysed.designCrop;
      const i = analysed.implCrop;
      const cropDelta: Record<string, number> = {};
      // D2(8차) — 크롭 자체가 실패하면 이 화면의 모든 요소 측정이 크롭되지
      // 않은 좌표계에서 이뤄진 셈이므로 결과를 신뢰할 수 없다. 7차는 이
      // 경우 delta를 빈 객체로 두고 위반을 남기지 않았다.
      if (!d || !i) {
        findings.push({
          screen: spec.id,
          element: spec.cropBoxLabel ?? "크롭 박스",
          kind: "missing",
          detail: `밝은 박스(모달/시트) 경계를 찾지 못했습니다 — 디자인 ${d ? "측정됨" : "실패"} / 구현 ${i ? "측정됨" : "실패"}. 크롭 실패 시 요소 측정 좌표계가 어긋나므로 통과로 취급하지 않습니다.`,
        });
      }
      if (d && i) {
        for (const axis of ["left", "top", "width", "height"] as const) {
          const diff = Math.abs(d[axis] - i[axis]);
          cropDelta[axis] = diff;
          maxDelta = Math.max(maxDelta, diff);
          if (diff > tolerance) {
            findings.push({
              screen: spec.id,
              element: spec.cropBoxLabel ?? "크롭 박스",
              kind: "metric",
              detail: `${axis} 디자인 ${d[axis]} vs 구현 ${i[axis]}`,
              delta: diff,
              tolerance,
            });
          }
        }
      }
      cropBox = { design: d, impl: i, delta: cropDelta };
    }

    // 이 화면이 만든 위반이 0건일 때만 PASS다(위 findingsBefore 주석 참고).
    const pass = findings.length === findingsBefore;

    return {
      id: spec.id,
      label: spec.label,
      platform: spec.platform,
      tolerance,
      viewport: spec.viewport,
      designExport: spec.designExport,
      nextjsPortalCount: portalCount,
      designBands: analysed.bands,
      designBandsLow: analysed.bandsLow,
      cropBox,
      background: {
        probe,
        design: { color: designEdgeHex, coverage: analysed.designEdge.coverage },
        impl: { color: implEdgeHex, coverage: analysed.implEdge.coverage },
      },
      elements,
      semantic,
      maxDelta,
      pass,
    };
  } finally {
    await context.close();
  }
}

// ── 엔트리 포인트 ────────────────────────────────────────────────────
async function main() {
  // 빌드·서버·브라우저를 띄우기 전에 가장 먼저 거부한다 — 원격 DB에 상담 신청 행을
  // 쓰는 일이 없어야 한다(visual-verify-db-guard.ts).
  const remoteDbViolation = findRemoteDatabaseViolation(process.env);
  if (remoteDbViolation) {
    console.error(remoteDbViolation);
    process.exit(1);
  }

  for (const reportDir of [REPORT_DIR_DIAGNOSIS, REPORT_DIR_CONSULT]) {
    for (const sub of ["screenshots", "normalized-design", "overlays", "diffs"]) {
      fs.mkdirSync(path.join(reportDir, sub), { recursive: true });
    }
  }

  // ── 실행 범위 결정 (D2 8차) ──────────────────────────────────────
  // 7차는 VISUAL_ONLY에 오타나 없는 id를 주면 0개 화면을 조용히 검증하고
  // exit 0으로 끝났고, 부분 실행이 전체 10화면 기준 measurements.json을
  // 그대로 덮어써서 audit-ready 근거를 조용히 부분 결과로 강등시킬 수
  // 있었다. 둘 다 막는다.
  const onlyRaw = process.env.VISUAL_ONLY;
  let screens = SCREENS;
  if (onlyRaw !== undefined) {
    const ids = onlyRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      console.error(
        `[visual-verify] VISUAL_ONLY가 설정됐지만 화면 id가 하나도 없습니다(값: ${JSON.stringify(onlyRaw)}).`
      );
      process.exit(1);
    }
    const known = new Set(SCREENS.map((s) => s.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      console.error(
        `[visual-verify] VISUAL_ONLY에 알 수 없는 화면 id가 있습니다: ${unknown.join(", ")}\n` +
          `  사용 가능한 id: ${[...known].join(", ")}`
      );
      process.exit(1);
    }
    screens = SCREENS.filter((s) => ids.includes(s.id));
  }

  const externalBaseURL = process.env.VISUAL_BASE_URL ?? "";
  const skipBuild = process.env.VISUAL_SKIP_BUILD === "1";

  // audit-ready 근거가 되는 measurements.json은 **제약 없는 전체 실행**
  // 에서만 나온다. 화면을 골랐거나(VISUAL_ONLY), 현재 소스를 빌드하지
  // 않았거나(VISUAL_SKIP_BUILD), 외부 서버를 재사용한 실행은 전부
  // measurements.partial.json으로 간다.
  const isCanonicalRun =
    screens.length === SCREENS.length && onlyRaw === undefined && !skipBuild && !externalBaseURL;

  const findings: Finding[] = [];
  const results: ScreenResult[] = [];

  // 정리 범위는 서버 기동 시점부터 시작한다. 예전에는 서버 기동과
  // chromium.launch / newContext / goto가 try 밖에 있어서, 이 준비 단계 중 하나라도
  // 실패하면 이미 떠 있는 `next start` 트리(와 브라우저)가 그대로 남았다. 아래
  // finally는 각 자원이 실제로 만들어진 경우에만 해제한다.
  let server: ManagedServer | null = null;
  let browser: Browser | null = null;
  let cleanupFailures: string[] = [];
  try {
    let baseURL = externalBaseURL;
    if (!baseURL) {
      server = await startProductionServer();
      baseURL = server.baseURL;
    } else {
      console.log(`[visual-verify] 기존 서버 재사용: ${baseURL}`);
    }

    browser = await chromium.launch();
    const analysisContext = await browser.newContext();
    await analysisContext.addInitScript(KEEP_NAMES_SHIM);
    await analysisContext.addInitScript(HELPERS_SOURCE);
    const analysis = await analysisContext.newPage();
    await analysis.goto("about:blank");

    for (const spec of screens) {
      process.stdout.write(`[visual-verify] ${spec.id} … `);
      try {
        const result = await verifyScreen(browser, analysis, baseURL, spec, findings);
        results.push(result);
        console.log(
          `${result.pass ? "PASS" : "FAIL"} (maxΔ=${result.maxDelta}px / 허용 ${result.tolerance}px)`
        );
      } catch (error) {
        // 한 화면이 실패해도 나머지 화면의 측정 결과는 남긴다 — 실패 자체는
        // 위반으로 기록되므로 종료 코드는 1이 된다.
        const message = error instanceof Error ? error.message : String(error);
        findings.push({
          screen: spec.id,
          element: "(화면 전체)",
          kind: "missing",
          detail: message,
        });
        console.log(`ERROR — ${message.split("\n")[0]}`);
      }
    }
  } finally {
    // 브라우저 종료가 실패해도 서버 정리는 반드시 시도한다. 이 finally는 던지지
    // 않으므로 try 안의 원래 오류는 그대로 전파되고, 정리 실패는 그 옆에 기록된다.
    // 정리에 실패했다면 서버·브라우저가 남았을 수 있으므로 화면 검사에 위반이
    // 없더라도 종료 코드는 0이 될 수 없다.
    cleanupFailures = await releaseResources([
      { label: "브라우저 종료 실패", release: async () => void (await browser?.close()) },
      { label: "서버 프로세스 트리 정리 실패", release: () => server?.stop() },
    ]);
    for (const failure of cleanupFailures) console.error(`[visual-verify] ${failure}`);
    if (cleanupFailures.length > 0) process.exitCode = 1;
  }

  // SPEC-B2C-CONSULT-001 D-RUN-5 — measurements도 화면 소유 SPEC별로 나눠 쓴다.
  // 어떤 실행이 어떤 파일을 쓰는지는 visual-verify-report.ts가 정한다: 제약 없는
  // 전체 실행만 measurements.json, VISUAL_ONLY 등은 .partial.json, 정리에 실패한
  // 실행은 .failed.json(정규·부분 증거는 건드리지 않는다).
  const measurementsFile = measurementsFileName(isCanonicalRun, cleanupFailures);
  const measurementsContext = {
    isCanonicalRun,
    cleanupFailures,
    run: {
      totalScreens: SCREENS.length,
      visualOnly: onlyRaw ?? null,
      skipBuild,
      externalBaseURL: externalBaseURL || null,
    },
    tolerance: TOLERANCE,
    results,
    findings,
  };
  const diagnosisScreenIds = screens.filter((s) => !CONSULT_SCREEN_IDS.has(s.id)).map((s) => s.id);
  const consultScreenIds = screens.filter((s) => CONSULT_SCREEN_IDS.has(s.id)).map((s) => s.id);
  writeMeasurements(REPORT_DIR_DIAGNOSIS, diagnosisScreenIds, measurementsContext);
  writeMeasurements(REPORT_DIR_CONSULT, consultScreenIds, measurementsContext);
  if (cleanupFailures.length > 0) {
    console.log(
      `\n[visual-verify] 정리에 실패한 실행입니다 — 결과를 ${measurementsFile}에 기록했습니다(종료 사유·정리 실패 포함).\n` +
        `  기존 ${MEASUREMENTS_CANONICAL}·${MEASUREMENTS_PARTIAL}은 갱신하지 않았습니다.`
    );
  } else if (!isCanonicalRun) {
    console.log(
      `\n[visual-verify] 부분/비정규 실행입니다 — 결과를 ${measurementsFile}에 기록했습니다.\n` +
        `  audit-ready 근거가 되는 measurements.json은 제약 없는 전체 ${SCREENS.length}화면 실행에서만 갱신됩니다.`
    );
  }

  console.log("\n── 화면별 최대 Δ / 배경 ──");
  for (const r of results) {
    const bg =
      `bg D:${r.background.design.color}(${(r.background.design.coverage * 100).toFixed(2)}%)` +
      ` I:${r.background.impl.color}(${(r.background.impl.coverage * 100).toFixed(2)}%)`;
    console.log(
      `${r.id.padEnd(8)} ${String(r.maxDelta).padStart(4)}px  허용 ${r.tolerance}px  ${bg}  ${r.pass ? "PASS" : "FAIL"}`
    );
  }

  const outcome = decideOutcome({
    findingCount: findings.length,
    cleanupFailureCount: cleanupFailures.length,
  });

  if (findings.length > 0) {
    console.log(`\n── 위반 ${findings.length}건 ──`);
    for (const f of findings) {
      const delta = f.delta !== undefined ? ` Δ${f.delta} > ${f.tolerance}` : "";
      console.log(`  [${f.screen}] ${f.element} (${f.kind})${delta} — ${f.detail}`);
    }
    console.log(
      `\n측정 원본: .moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/${measurementsFile}` +
        ` (01/02 계열), .moai/reports/visual-check/SPEC-B2C-CONSULT-001/${measurementsFile} (03 계열)`
    );
  }

  if (cleanupFailures.length > 0) {
    console.error(
      `\n정리에 실패해(${cleanupFailures.length}건) 성공으로 보고하지 않습니다 — 종료 코드 1.`
    );
  }

  if (!outcome.reportSuccess) {
    process.exitCode = outcome.exitCode;
    return;
  }

  console.log("\n모든 화면이 허용 오차 이내이며 상태/문구/줄바꿈 불일치가 없습니다.");
}

// `next start` 자식 프로세스가 살아 있으면 이벤트 루프가 비지 않아 Node가
// 스스로 종료하지 못한다 — 검증 결과를 낸 뒤 종료 코드를 명시적으로 확정한다
// (이 스크립트의 계약은 "허용 오차 초과 시 exit 1"이므로 종료 자체가 계약의
// 일부다).
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
