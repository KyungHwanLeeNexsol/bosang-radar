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
// 10화면 실행**에서만 갱신된다. VISUAL_ONLY로 화면을 고르거나,
// VISUAL_SKIP_BUILD=1로 현재 소스를 빌드하지 않거나, VISUAL_BASE_URL로 외부
// 서버를 재사용한 실행은 `measurements.partial.json`에 기록되며, 두 파일 모두
// `canonical` 필드로 스스로를 구분한다.
//
// [HARD] 캡처는 반드시 **프로덕션 서버**(`next build` + `next start`)를
// 대상으로 한다 — `next dev`는 `<nextjs-portal>` 개발 전용 DOM을 주입해
// 픽셀 비교를 오염시킨다. 매 화면 캡처 직전에 그 요소의 부재를 단언한다.

import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

import { chromium, type Browser, type Locator, type Page } from "@playwright/test";

import { HELPERS_SOURCE } from "./visual-verify-helpers";

// tsx(esbuild)는 `keepNames` 옵션 때문에 함수 리터럴마다 `__name(...)` 호출을
// 덧붙인다. 그 함수를 `page.evaluate`로 브라우저에 보내면 헬퍼가 없어
// `ReferenceError: __name is not defined`가 난다 — 페이지마다 항등 함수를
// 미리 정의해 둔다.
const KEEP_NAMES_SHIM = "globalThis.__name = globalThis.__name || ((fn) => fn);";

// ── 경로 ─────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DESIGN_DIR = path.join(PROJECT_ROOT, "design", "exports");
const REPORT_DIR = path.join(
  PROJECT_ROOT,
  ".moai",
  "reports",
  "visual-check",
  "SPEC-B2C-DIAGNOSIS-001"
);
const DIR_SCREENSHOTS = path.join(REPORT_DIR, "screenshots");
const DIR_NORMALIZED = path.join(REPORT_DIR, "normalized-design");
const DIR_OVERLAYS = path.join(REPORT_DIR, "overlays");
const DIR_DIFFS = path.join(REPORT_DIR, "diffs");

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
  semanticChecks?: (page: Page) => Promise<Array<{ label: string; expected: string; actual: string }>>;
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
    out.push(((await page.getByTestId(`diagnosis-loading-stage-${i}-status`).textContent()) ?? "").trim());
  }
  return out;
}

// ── 10개 화면 정의 (런타임 추론 없이 코드에 전부 열거한다) ───────────
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
        locate: (p) => vis(p,"diagnosis-hero-subtitle"),
        designTopHint: 154,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p,"diagnosis-hero-title"),
        designTopHint: 194,
        expectLines: 1,
      },
      {
        key: "description",
        label: "설명(2줄)",
        locate: (p) => vis(p,"diagnosis-hero-description"),
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
        locate: (p) => vis(p,"diagnosis-trust-row"),
        designTopHint: 337,
      },
      {
        key: "searchRow",
        label: "검색 + CTA 결합 행",
        locate: (p) => vis(p,"diagnosis-search-row"),
        designTopHint: 366,
      },
      {
        key: "notice",
        label: "안내 배너",
        locate: (p) => vis(p,"diagnosis-notice"),
        designTopHint: 467,
      },
      {
        key: "chipRow",
        label: "칩 행",
        locate: (p) => vis(p,"diagnosis-chip-row"),
        designTopHint: 537,
      },
      {
        key: "cardGrid",
        label: "카드 그리드",
        locate: (p) => vis(p,"diagnosis-card-grid"),
        designTopHint: 617,
      },
      {
        key: "footerLinks",
        label: "푸터 링크 행",
        locate: (p) => vis(p,"diagnosis-footer-links"),
        designTopHint: 800,
        // 디자인 푸터 행은 링크 3개(열 0~2)와 우측 BORA 로고(열 3)가 한
        // 밴드로 묶인다 — 링크 3개만 합쳐 nav 요소에 대응시킨다.
        designColRange: [0, 2],
      },
      {
        key: "footerDisclaimer",
        label: "푸터 면책 문구",
        locate: (p) => vis(p,"diagnosis-footer-disclaimer"),
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
        locate: (p) => vis(p,"diagnosis-consent-title"),
        designTopHint: 365,
        expectLines: 1,
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p,"diagnosis-consent-description"),
        designTopHint: 402,
      },
      {
        key: "consentRow",
        label: "동의 행",
        locate: (p) => vis(p,"diagnosis-consent-row"),
        designTopHint: 436,
      },
      {
        key: "cta",
        label: "CTA",
        locate: (p) => vis(p,"diagnosis-consent-cta"),
        designTopHint: 507,
      },
      {
        key: "note",
        label: "하단 안내문",
        locate: (p) => vis(p,"diagnosis-consent-note"),
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
        locate: (p) => vis(p,"diagnosis-confirm-badge"),
        designTopHint: 144,
      },
      {
        key: "progress",
        label: "진행 표시 행",
        locate: (p) => vis(p,"diagnosis-question-progress"),
        designTopHint: 198,
      },
      {
        key: "subtitle",
        label: "부제",
        locate: (p) => vis(p,"diagnosis-question-subtitle"),
        designTopHint: 230,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p,"diagnosis-question-title"),
        designTopHint: 264,
        expectLines: 1,
      },
      {
        key: "option0",
        label: "옵션 1",
        locate: (p) => vis(p,"diagnosis-option-0"),
        designTopHint: 328,
      },
      {
        key: "option1",
        label: "옵션 2",
        locate: (p) => vis(p,"diagnosis-option-1"),
        designTopHint: 393,
      },
      {
        key: "option2",
        label: "옵션 3",
        locate: (p) => vis(p,"diagnosis-option-2"),
        designTopHint: 458,
      },
      {
        key: "option3",
        label: "옵션 4",
        locate: (p) => vis(p,"diagnosis-option-3"),
        designTopHint: 523,
      },
      {
        key: "answerGuide",
        label: "답변 안내",
        locate: (p) => vis(p,"diagnosis-answer-guide"),
        designTopHint: 599,
      },
      {
        key: "skip",
        label: "건너뛰기 링크",
        locate: (p) => vis(p,"diagnosis-skip-link"),
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
        locate: (p) => vis(p,"diagnosis-loading-spinner"),
        designTopHint: 145,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p,"diagnosis-loading-title"),
        designTopHint: 192,
        expectLines: 1,
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p,"diagnosis-loading-description"),
        designTopHint: 237,
      },
      {
        key: "stage0",
        label: "단계 행 1",
        locate: (p) => vis(p,"diagnosis-loading-stage-0"),
        designTopHint: 285,
      },
      {
        key: "stage1",
        label: "단계 행 2",
        locate: (p) => vis(p,"diagnosis-loading-stage-1"),
        designTopHint: 343,
      },
      {
        key: "stage2",
        label: "단계 행 3",
        locate: (p) => vis(p,"diagnosis-loading-stage-2"),
        designTopHint: 401,
      },
      {
        key: "skeleton",
        label: "스켈레톤 카드",
        locate: (p) => vis(p,"diagnosis-loading-skeleton"),
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
        locate: (p) => vis(p,"diagnosis-state-icon"),
        designTopHint: 174,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p,"diagnosis-state-title"),
        designTopHint: 266,
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p,"diagnosis-state-description"),
        designTopHint: 315,
      },
      {
        key: "panel",
        label: "안내 패널",
        locate: (p) => vis(p,"diagnosis-state-panel"),
        designTopHint: 355,
      },
      {
        key: "cta",
        label: "CTA",
        locate: (p) => vis(p,"diagnosis-state-cta"),
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
        locate: (p) => vis(p,"diagnosis-state-icon"),
        designTopHint: 174,
      },
      {
        key: "title",
        label: "제목",
        locate: (p) => vis(p,"diagnosis-state-title"),
        designTopHint: 266,
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p,"diagnosis-state-description"),
        designTopHint: 315,
      },
      {
        key: "buttons",
        label: "버튼 그룹",
        locate: (p) => vis(p,"diagnosis-state-cta"),
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
        locate: (p) => vis(p,"diagnosis-hero-subtitle"),
        designTopHint: 82,
      },
      {
        key: "title",
        label: "제목(2줄)",
        locate: (p) => vis(p,"diagnosis-hero-title"),
        designTopHint: 114,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: ["이거, 보상 받을 수", "있나요?"],
      },
      {
        key: "description",
        label: "설명(2줄)",
        locate: (p) => vis(p,"diagnosis-hero-description"),
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
        locate: (p) => vis(p,"diagnosis-search-textbox"),
        designTopHint: 266,
      },
      {
        key: "cta",
        label: "CTA",
        locate: (p) => vis(p,"diagnosis-submit-cta"),
        designTopHint: 396,
      },
      {
        key: "notice",
        label: "안내 배너(2줄)",
        locate: (p) => vis(p,"diagnosis-notice"),
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
        expectLineTexts: [
          "이름 · 전화번호 · 주민등록번호 등 개인 식별정보는 입력하지",
          "마세요",
        ],
      },
      {
        key: "chipRow",
        label: "칩 영역(라벨 + 칩 2행)",
        locate: (p) => vis(p,"diagnosis-chip-row"),
        designTopHint: 573,
        mergeBands: 3,
      },
      {
        key: "cardList",
        label: "카드 목록(4장)",
        locate: (p) => vis(p,"diagnosis-card-grid"),
        designTopHint: 691,
        mergeBands: 4,
      },
      {
        key: "footerDisclaimer",
        label: "푸터 면책 문구",
        locate: (p) => vis(p,"diagnosis-footer-disclaimer"),
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
        locate: (p) => vis(p,"diagnosis-consent-title"),
        // 시트 제목 2줄은 줄 간격이 좁아 디자인에서도 한 밴드로 잡힌다.
        designTopHint: 828,
        expectLines: 2,
        expectLineTexts: ["건강정보 처리에", "동의해 주세요"],
      },
      {
        key: "description",
        label: "설명(2줄)",
        locate: (p) => vis(p,"diagnosis-consent-description"),
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
        locate: (p) => vis(p,"diagnosis-consent-row"),
        designTopHint: 942,
      },
      {
        key: "cta",
        label: "CTA",
        locate: (p) => vis(p,"diagnosis-consent-cta"),
        designTopHint: 1009,
      },
      {
        key: "note",
        label: "하단 안내문",
        locate: (p) => vis(p,"diagnosis-consent-note"),
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
        locate: (p) => vis(p,"diagnosis-confirm-badge"),
        designTopHint: 78,
      },
      {
        key: "progressLabel",
        label: "진행 표시 행(라벨 + 트랙)",
        // Mobile은 "다음 질문 안내"가 아랫줄로 내려가므로 바깥 컨테이너가
        // 아니라 라벨+트랙 한 행만 대응시킨다.
        locate: (p) => vis(p,"diagnosis-progress-row"),
        designTopHint: 127,
      },
      {
        key: "progressTrack",
        label: "진행률 트랙",
        locate: (p) => vis(p,"diagnosis-progress-track"),
        // 트랙 자체가 배경과 저대비라 ink 세그먼트로 top을 잡기 어렵다 —
        // 진행 표시 행과 같은 밴드 안의 우측 열로 지정해 폭을 실측한다.
        designTopHint: 127,
        designColIndex: 1,
        skipMetrics: ["top", "height"],
      },
      {
        key: "upcoming",
        label: "다음 질문 안내",
        locate: (p) => vis(p,"diagnosis-question-upcoming"),
        designTopHint: 151,
      },
      {
        key: "subtitle",
        label: "부제",
        locate: (p) => vis(p,"diagnosis-question-subtitle"),
        designTopHint: 180,
      },
      {
        key: "title",
        label: "제목(2줄)",
        locate: (p) => vis(p,"diagnosis-question-title"),
        designTopHint: 209,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: ["무릎 골절로 수술을", "받으셨나요?"],
      },
      {
        key: "option0",
        label: "옵션 1",
        locate: (p) => vis(p,"diagnosis-option-0"),
        designTopHint: 293,
      },
      {
        key: "option1",
        label: "옵션 2",
        locate: (p) => vis(p,"diagnosis-option-1"),
        designTopHint: 354,
      },
      {
        key: "option2",
        label: "옵션 3",
        locate: (p) => vis(p,"diagnosis-option-2"),
        designTopHint: 415,
      },
      {
        key: "option3",
        label: "옵션 4",
        locate: (p) => vis(p,"diagnosis-option-3"),
        designTopHint: 476,
      },
      {
        key: "answerGuide",
        label: "답변 안내(2줄)",
        locate: (p) => vis(p,"diagnosis-answer-guide"),
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
        locate: (p) => vis(p,"diagnosis-skip-link"),
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
        locate: (p) => vis(p,"diagnosis-loading-spinner"),
        designTopHint: 87,
      },
      {
        key: "title",
        label: "제목(2줄)",
        locate: (p) => vis(p,"diagnosis-loading-title"),
        designTopHint: 130,
        mergeBands: 2,
        expectLines: 2,
        expectLineTexts: ["입력하신 내용을", "확인하고 있습니다"],
      },
      {
        key: "description",
        label: "설명",
        locate: (p) => vis(p,"diagnosis-loading-description"),
        designTopHint: 202,
        expectText: "보통 10~20초 정도 걸립니다.",
      },
      {
        key: "stage0",
        label: "단계 행 1",
        locate: (p) => vis(p,"diagnosis-loading-stage-0"),
        designTopHint: 242,
      },
      {
        key: "stage1",
        label: "단계 행 2",
        locate: (p) => vis(p,"diagnosis-loading-stage-1"),
        designTopHint: 295,
      },
      {
        key: "stage2",
        label: "단계 행 3",
        locate: (p) => vis(p,"diagnosis-loading-stage-2"),
        designTopHint: 348,
      },
      {
        key: "skeleton",
        label: "스켈레톤(2장)",
        locate: (p) => vis(p,"diagnosis-loading-skeleton"),
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
];

// ── 서버 기동 ────────────────────────────────────────────────────────
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // 아직 기동 전 — 재시도한다.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`서버가 ${timeoutMs}ms 안에 기동하지 않았습니다: ${url}`);
}

async function startProductionServer(): Promise<{ baseURL: string; stop: () => void }> {
  const env = { ...process.env, ENABLE_DIAGNOSIS_DEV_STATES: "true" };

  if (process.env.VISUAL_SKIP_BUILD !== "1") {
    console.log("[visual-verify] pnpm build (ENABLE_DIAGNOSIS_DEV_STATES=true)");
    execSync("pnpm build", { cwd: PROJECT_ROOT, env, stdio: "inherit" });
  }

  const port = await findFreePort();
  const baseURL = `http://localhost:${port}`;
  console.log(`[visual-verify] pnpm start → ${baseURL}`);
  const child: ChildProcess = spawn("pnpm", ["start"], {
    cwd: PROJECT_ROOT,
    env: { ...env, PORT: String(port) },
    stdio: "ignore",
    shell: true,
    detached: process.platform !== "win32",
  });
  await waitForServer(baseURL, 120_000);
  return {
    baseURL,
    stop: () => {
      try {
        if (child.pid && process.platform === "win32") {
          // shell:true로 띄웠기 때문에 child.pid는 cmd.exe다 — /T로 자식
          // (pnpm → next start)까지 함께 종료해야 포트가 반납된다.
          execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
        } else if (child.pid) {
          process.kill(-child.pid, "SIGTERM");
        }
      } catch {
        // 이미 종료된 경우 — 무시한다.
      }
      child.unref();
    },
  };
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

    const domInfos = new Map<string, DomInfo | null>();
    for (const element of spec.elements) {
      const locator = element.locate(page);
      domInfos.set(element.key, (await locator.count()) > 0 ? await readDom(locator.first()) : null);
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
    writeDataUrl(path.join(DIR_NORMALIZED, `${spec.id}.png`), designUrl);
    fs.writeFileSync(path.join(DIR_SCREENSHOTS, spec.screenshotName), implBuffer);
    writeDataUrl(
      path.join(DIR_OVERLAYS, `${spec.id}.png`),
      await analysis.evaluate(
        ([d, i, w, h]) =>
          window.__vv.composeOverlay(d as string, i as string, w as number, h as number),
        [designUrl, implUrl, width, height] as const
      )
    );
    writeDataUrl(
      path.join(DIR_DIFFS, `${spec.id}.png`),
      await analysis.evaluate(
        ([d, i, w, h]) => window.__vv.composeDiff(d as string, i as string, w as number, h as number),
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
          b ? { left: b.left + 6, top: b.top + 16, width: b.width - 12, height: b.height - 16 } : undefined;

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
  for (const dir of [DIR_SCREENSHOTS, DIR_NORMALIZED, DIR_OVERLAYS, DIR_DIFFS]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ── 실행 범위 결정 (D2 8차) ──────────────────────────────────────
  // 7차는 VISUAL_ONLY에 오타나 없는 id를 주면 0개 화면을 조용히 검증하고
  // exit 0으로 끝났고, 부분 실행이 전체 10화면 기준 measurements.json을
  // 그대로 덮어써서 audit-ready 근거를 조용히 부분 결과로 강등시킬 수
  // 있었다. 둘 다 막는다.
  const onlyRaw = process.env.VISUAL_ONLY;
  let screens = SCREENS;
  if (onlyRaw !== undefined) {
    const ids = onlyRaw.split(",").map((s) => s.trim()).filter(Boolean);
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

  let server: { baseURL: string; stop: () => void } | null = null;
  const externalBaseURL = process.env.VISUAL_BASE_URL ?? "";
  const skipBuild = process.env.VISUAL_SKIP_BUILD === "1";
  let baseURL = externalBaseURL;
  if (!baseURL) {
    server = await startProductionServer();
    baseURL = server.baseURL;
  } else {
    console.log(`[visual-verify] 기존 서버 재사용: ${baseURL}`);
  }

  // audit-ready 근거가 되는 measurements.json은 **제약 없는 전체 실행**
  // 에서만 나온다. 화면을 골랐거나(VISUAL_ONLY), 현재 소스를 빌드하지
  // 않았거나(VISUAL_SKIP_BUILD), 외부 서버를 재사용한 실행은 전부
  // measurements.partial.json으로 간다.
  const isCanonicalRun =
    screens.length === SCREENS.length && onlyRaw === undefined && !skipBuild && !externalBaseURL;

  const browser = await chromium.launch();
  const analysisContext = await browser.newContext();
  await analysisContext.addInitScript(KEEP_NAMES_SHIM);
  await analysisContext.addInitScript(HELPERS_SOURCE);
  const analysis = await analysisContext.newPage();
  await analysis.goto("about:blank");

  const findings: Finding[] = [];
  const results: ScreenResult[] = [];

  try {
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
        findings.push({ screen: spec.id, element: "(화면 전체)", kind: "missing", detail: message });
        console.log(`ERROR — ${message.split("\n")[0]}`);
      }
    }
  } finally {
    await browser.close();
    server?.stop();
  }

  const measurementsFile = isCanonicalRun ? "measurements.json" : "measurements.partial.json";
  fs.writeFileSync(
    path.join(REPORT_DIR, measurementsFile),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        // 산출물이 스스로 "이 실행이 audit-ready 근거로 쓸 수 있는
        // 전체 실행이었는지"를 밝힌다.
        canonical: isCanonicalRun,
        run: {
          screenIds: screens.map((s) => s.id),
          totalScreens: SCREENS.length,
          visualOnly: onlyRaw ?? null,
          skipBuild,
          externalBaseURL: externalBaseURL || null,
        },
        tolerance: TOLERANCE,
        results,
        findings,
      },
      null,
      2
    )
  );
  if (!isCanonicalRun) {
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

  if (findings.length > 0) {
    console.log(`\n── 위반 ${findings.length}건 ──`);
    for (const f of findings) {
      const delta = f.delta !== undefined ? ` Δ${f.delta} > ${f.tolerance}` : "";
      console.log(`  [${f.screen}] ${f.element} (${f.kind})${delta} — ${f.detail}`);
    }
    console.log(
      `\n측정 원본: .moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/${measurementsFile}`
    );
    process.exitCode = 1;
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
