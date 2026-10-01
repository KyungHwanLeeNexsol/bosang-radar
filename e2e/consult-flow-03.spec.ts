// e2e/consult-flow-03.spec.ts
// SPEC-B2C-CONSULT-001 M7 (plan.md §F item 7) — 03(상담 신청) 화면 범위의
// Playwright e2e. 02 SPEC의 e2e/diagnosis-flow-02.spec.ts와 동일한
// webServer/env/헬퍼 컨벤션을 그대로 따르되, 그 파일에는 export가 하나도
// 없어 helper를 import할 수 없다 — 이 파일에 동일한 스타일로 다시
// 작성한다(01/02 SPEC의 e2e 파일은 절대 수정하지 않는다).
//
// [SCOPE EXTENSION] 03 화면은 ENABLE_CONSULT_FLOW=true + CONSULT_POLICY_READY
// =true 두 플래그가 모두 켜져 있어야 실제 제출까지 도달한다(app/consult/
// page.tsx computeConsultFlags, app/api/consultations/route.ts). 01/02
// 스펙이 공유하는 단일 webServer(playwright.config.ts)에 이 두 플래그 +
// RATE_LIMIT_HMAC_SECRET(design.md §4.2 — CONSULT_POLICY_READY="true"일
// 때만 lib/env.ts가 요구하며, 없으면 instrumentation.ts register()가 부팅
// 시점에 `next start` 프로세스 자체를 종료시킨다)을 추가로 주입했다 —
// 기존 ENABLE_DIAGNOSIS_DEV_STATES는 그대로 유지되며 01/02 화면의 동작에는
// 영향이 없다.
//
// [환경 노트 1] POST /api/consultations의 rate limit 판정은 신뢰 가능한 IP
// (x-forwarded-for — Nginx 리버스 프록시가 채우는 헤더, route.ts
// getTrustedIp)가 없으면 fail closed로 500/server_error를 반환하도록
// 설계돼 있다(design.md §9.3). 성공/중복 경로를 검증하는 테스트는 이
// 전제를 안전하게 만족시키기 위해 page.setExtraHTTPHeaders로
// x-forwarded-for를 직접 주입한다.
//
// [환경 노트 2 — 03-D(실패) 화면 결정론적 트리거 부재, 실측 확인됨]
// 애초 계획은 "x-forwarded-for를 주입하지 않으면 fail closed로 500이
// 난다"는 사실을 03-D 트리거로 재사용하는 것이었다. 그러나 실측 결과 이
// 전제가 이 Next.js 버전에서는 성립하지 않는다 — next@16.3.2의
// node_modules/next/dist/server/base-server.js(약 612번째 줄)가
// `req.headers['x-forwarded-for'] ??= originalRequest.socket.remoteAddress`
// 로 헤더 부재 시 raw TCP 소켓의 remoteAddress를 자동으로 채워 넣는다.
// 즉 리버스 프록시 없이 `next start`로 직접 서빙되는 이 e2e 환경에서는
// x-forwarded-for를 브라우저/curl 그 무엇도 보내지 않아도 getTrustedIp()가
// 항상 비어 있지 않은 값을 관측한다(raw curl로 직접 재현 확인 — 헤더를
// 전혀 보내지 않고 POST해도 201 Created가 반환된다). route.ts의 fail
// closed 분기(`!trustedIp`)는 이 환경에서 사실상 도달 불가능한 코드
// 경로다. 이는 이 SPEC 범위 밖의 관찰이지만, design.md §9.3이 전제하는
// "프록시가 없으면 헤더가 비어 있다"는 위협 모델이 실제 Next.js 16
// 런타임 동작과 어긋난다는 점은 별도로 팀에 보고한다.
//
// 이 관측 때문에 클라이언트에서 결정론적으로 03-D(실패)를 유발할 방법이
// 없다 — RATE_LIMIT_HMAC_SECRET 누락은 서버 부팅 자체를 막고(§SCOPE
// EXTENSION 참고), idempotency_conflict/consent_version_mismatch는 UI
// 조작만으로 재현할 수 없는 페이로드 변조가 필요하며, rate_limited(429)는
// 60초 rate limit 윈도우 경계와 실제 브라우저 내비게이션 소요 시간이
// 서로 얽혀 있어 결정론적으로 재현하기 어렵다(윈도우 경계를 걸치면
// 카운트가 리셋된다). 새 테스트 전용 서버 훅이나 장애 주입 더블을
// 만드는 대신, 이 SPEC 범위에서는 03-D 화면 자동화 검증을 커버하지
// 않는 것으로 남겨 둔다(알려진 공백으로 명시적으로 기록 — 컴포넌트
// 단위 테스트 components/consult/consult-failure.test.tsx가 렌더링
// 자체는 이미 커버하고 있다).

import fs from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

// lib/diagnosis/fixtures/fracture-case.ts의 FRACTURE_FIXTURE_INPUT과 동일한
// 문자열 — mockJudge의 정확 일치 트리거. 01/02 스펙과 마찬가지로 소스를
// import하지 않고 문자열을 그대로 복제한다(01/02 스펙과 일관된 관례).
const FRACTURE_INPUT = "3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요";

// lib/consult/phone.ts KOREAN_MOBILE_PATTERN(01[016789]+7~8자리)을 만족하는
// 유효한 연락처 — normalizePhone("01012345678") === "01012345678",
// maskPhone(...) === "010-****-5678"(components/consult/*.tsx 검증에 재사용).
const CONSULT_NAME = "홍길동";
const CONSULT_PHONE = "01012345678";
const CONSULT_PHONE_MASKED = "010-****-5678";
const CONSULT_CALL_TIME = "평일 오후 (13시 ~ 18시)";

async function submitDiagnosisInput(page: Page, text: string): Promise<void> {
  await page
    .getByPlaceholder("예) 3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요")
    .fill(text);
  await page.getByRole("button", { name: "보상 진단" }).click();
}

async function checkConsentAndConfirm(page: Page): Promise<void> {
  const confirmButton = page.getByRole("button", { name: "동의하고 진단하기" });
  await expect(confirmButton).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
}

async function answerAllQuestions(page: Page): Promise<void> {
  // 3문항 순차 진행 — 각 문항에서 첫 번째 라디오 옵션을 선택하고 다음으로
  // 진행한다(01/02 스펙의 동명 헬퍼와 동일한 절차).
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("radio").first().check();
    const nextButton = page.getByRole("button", { name: /^(다음|결과 보기)$/ });
    await nextButton.click();
  }
}

/**
 * 01 전체 플로우(입력 → 동의 → 3문항 응답 → 진단 중)를 완주해 /result로
 * 도착한다(diagnosis-flow-02.spec.ts의 동명 헬퍼와 동일한 절차 — 02 fixture
 * 경유 진입점).
 */
async function completeFractureFlowToResult(page: Page): Promise<void> {
  await page.goto("/");
  await submitDiagnosisInput(page, FRACTURE_INPUT);
  await checkConsentAndConfirm(page);
  await answerAllQuestions(page);
  await page.waitForURL("**/result", { timeout: 15_000 });
  await page.getByTestId("result-view").waitFor();
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

async function submitConsultForm(page: Page): Promise<void> {
  await page.getByTestId("consult-submit-button").click();
}

/**
 * 02의 후유장해 섹션 CTA로 03에 진입한다. Mobile은 result-view.tsx가
 * activeCategory 하나만 렌더링하므로(scripts/visual-verify.ts의 동명 헬퍼와
 * 동일한 이유) 기본 활성 탭이 "disability"가 아니면 이 CTA가 DOM에 아예
 * 없다 — 존재하면 먼저 그 탭으로 전환한다(Desktop은 이 클릭이 no-op).
 */
async function clickDisabilityConsultCta(page: Page): Promise<void> {
  const disabilityTab = page.getByTestId("category-tab-disability");
  if (await disabilityTab.isVisible().catch(() => false)) {
    await disabilityTab.click();
  }
  await page.getByTestId("result-cta-disability-button").click();
}

test.describe("03 화면 — 02→03 전체 플로우: 성공 → 결과 복귀 → 중복 (Desktop, 1440x900)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("02 결과 화면의 CTA로 03에 진입해 채널 전환·폼 입력·동의·제출까지 완주하면 성공 화면이 뜨고, 결과로 돌아간 뒤 동일 입력으로 재신청하면 중복 화면이 뜬다", async ({
    page,
  }) => {
    // 파일 상단 [환경 노트] 참고 — 리버스 프록시가 없는 이 e2e 환경에서
    // rate limit이 fail-closed(500)로 떨어지지 않도록, 이 테스트에서만
    // 신뢰 가능한 IP 헤더를 직접 주입한다.
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "127.0.0.1" });

    await completeFractureFlowToResult(page);

    // 후유장해 섹션 CTA — 특정 채널을 강요하지 않는 중립 진입점이라
    // ?channel= 쿼리가 없다(result-cta-bar.tsx). 기본 채널은 카카오톡이어야
    // 한다(REQ-B2CCONSULT-004 resolveInitialChannel 폴백).
    await page.getByTestId("result-cta-disability-button").click();
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();
    await expect(page.getByLabel(/카카오톡 연락에 사용할 휴대폰 번호/)).toBeVisible();

    // 채널을 전화로 전환 — 라디오 선택 시 연락처 라벨과 연락 희망 시간
    // 필수 표기가 즉시 바뀐다(consult-form.tsx channel prop 분기).
    await page.getByRole("radio", { name: /전화 상담/ }).check();
    await expect(page.getByLabel(/통화 가능한 전화번호/)).toBeVisible();

    await fillConsultForm(page, {
      name: CONSULT_NAME,
      contact: CONSULT_PHONE,
      preferredCallTime: CONSULT_CALL_TIME,
    });
    await checkRequiredConsents(page);
    await submitConsultForm(page);

    // 03-B 성공 상태 — 서버 응답(maskedContact/preferredCallTime)을 그대로
    // 렌더링한다(AC-B2CCONSULT-018).
    await page.getByTestId("consult-success").waitFor();
    const successSummary = page.getByTestId("consult-success-summary");
    await expect(successSummary).toContainText("전화 상담");
    await expect(successSummary).toContainText(CONSULT_PHONE_MASKED);
    await expect(successSummary).toContainText(CONSULT_CALL_TIME);

    // "진단 결과로 돌아가기" — 제출 전과 동일한 진단 결과가 그대로 다시
    // 표시되어야 한다(REQ-B2CCONSULT-025 — draft만 지워지고 진단 handoff는
    // 건드리지 않는다).
    await page.getByTestId("consult-success-back-cta").click();
    await page.waitForURL("**/result", { timeout: 10_000 });
    await page.getByTestId("result-view").waitFor();
    await expect(page.getByTestId("result-aggregate-banner")).toContainText(
      /사고 내용으로 [1-9]\d*개 담보를 분석했습니다/
    );

    // 같은 resultId + 같은 정규화 연락처로 재신청 → 비즈니스 중복 판정
    // (resultId + contactNormalized 복합 키, route.ts 8번 단계). 03에
    // 재진입하면 성공 시 clearConsultationDraft()가 draft를 지웠으므로 새
    // idempotencyKey가 발급되어(폼 마운트 시 1회 생성) idempotencyKey 조회
    // (4-6번 단계)로는 중복이 걸리지 않고, 8번 비즈니스 중복 조회에서만
    // 걸린다.
    await page.getByTestId("result-cta-disability-button").click();
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();

    await fillConsultForm(page, { name: CONSULT_NAME, contact: CONSULT_PHONE });
    await checkRequiredConsents(page);
    await submitConsultForm(page);

    // 03-C 중복 상태 — 내부 consultationId나 전체 페이로드는 노출하지
    // 않고 마스킹된 연락처·날짜 단위 접수일·처리 상태 라벨만 렌더링한다.
    await page.getByTestId("consult-duplicate").waitFor();
    const duplicateSummary = page.getByTestId("consult-duplicate-summary");
    await expect(duplicateSummary).toContainText("카카오톡 상담");
    await expect(duplicateSummary).toContainText(CONSULT_PHONE_MASKED);
    await expect(duplicateSummary).toContainText("상담 대기 중");
  });
});

test.describe("03 화면 — CTA 쿼리 파라미터로 채널 사전 선택 (Desktop, 1440x900)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  // [버그 수정 완료] 이 테스트는 REQ-B2CCONSULT-004(CTA의 ?channel= 쿼리로
  // 03 진입 시 채널이 미리 선택되어야 한다)를 검증한다.
  //
  // 원인이었던 버그: components/consult/consult-view.tsx의
  // resolveInitialChannel()은 useState 지연 초기화 함수 안에서
  // window.location.search를 읽는다. Next.js <Link>를 통한 클라이언트
  // 사이드 전환(이 테스트처럼 /result에서 클릭으로 진입하는 실제 사용자
  // 경로)에서는 ConsultView가 마운트되는 시점에 브라우저 주소창은 이미
  // "?channel=phone"으로 갱신돼 있지만, 그 값을 읽는 resolveInitialChannel()
  // 호출이 매번 "kakao"로 귀결되던 타이밍 문제였다(하드 내비게이션에서는
  // 재현되지 않음). consult-view.tsx에 마운트 후 보정 effect를 추가해
  // 수정했다(M7 후속 수정 — draft 복원 채널이 없을 때만 location을 다시
  // 읽어 보정).
  test("하단 최종 CTA(전화 상담)로 진입하면 /consult?channel=phone으로 이동하고 전화 채널이 미리 선택되어 있다", async ({
    page,
  }) => {
    await completeFractureFlowToResult(page);

    await page.getByTestId("result-cta-final-phone").click();
    // waitForURL의 glob 문자열은 "?"를 와일드카드로 해석하므로(우연히
    // 리터럴 "?"에도 매칭되지만 혼동을 피하기 위해) 정규식을 명시한다.
    await page.waitForURL(/\/consult\?channel=phone/, { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();

    await expect(page.getByRole("radio", { name: /전화 상담/ })).toBeChecked();
    await expect(page.getByLabel(/통화 가능한 전화번호/)).toBeVisible();
  });
});

// 03-D(제출 실패) 화면은 서버 오류를 유발하는 방식으로는 재현할 수 없다 —
// 파일 상단 [환경 노트 2]에서 실측으로 확인한 이유(next@16.3.2 base-server.js가
// x-forwarded-for를 raw 소켓 주소로 자동 채워 fail closed 분기가 이
// 환경에서 도달 불가능함) 때문이다. 대신 아래 "응답 유실 후 재시도" 테스트가
// 브라우저 쪽에서 응답만 끊어(page.route) 03-D를 결정론적으로 만든다.
// 렌더링 자체는 components/consult/consult-failure.test.tsx가 커버한다.

// SPEC-B2C-CONSULT-001 D-NEW-29 — 서버는 상담을 커밋했지만 브라우저가 응답을
// 받지 못한 경우. 첫 POST를 실제 서버로 보내 커밋시킨 뒤(route.fetch) 브라우저에는
// 네트워크 오류(route.abort)를 돌려준다. 03-D는 접수 여부를 단정하지 않아야 하고,
// "다시 시도하기"는 같은 idempotencyKey로 재전송해 서버의 재생 응답으로 03-B에
// 도달해야 한다. 정책 준비 모드 전용(태그 없음)이다.
test.describe("03 화면 — 응답 유실 후 같은 키 재시도 (Desktop, 1440x900)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("서버가 커밋한 뒤 응답이 유실되면 03-D는 접수 여부를 단정하지 않고, 다시 시도하기는 같은 idempotencyKey로 재전송해 성공 화면에 도달한다", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "127.30.0.1" });

    const postedKeys: string[] = [];
    await page.route("**/api/consultations", async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }
      postedKeys.push((request.postDataJSON() as { idempotencyKey: string }).idempotencyKey);
      if (postedKeys.length === 1) {
        await route.fetch();
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await completeFractureFlowToResult(page);
    await clickDisabilityConsultCta(page);
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();

    await fillConsultForm(page, { name: CONSULT_NAME, contact: "01000009901" });
    await checkRequiredConsents(page);
    await submitConsultForm(page);

    const failure = page.getByTestId("consult-failure");
    await failure.waitFor();
    await expect(failure).toContainText("상담 신청 접수 여부를 확인하지 못했습니다");
    await expect(failure).not.toContainText("접수되지 않았습니다");

    await page.getByTestId("consult-failure-retry").click();
    await page.getByTestId("consult-success").waitFor();

    expect(postedKeys).toHaveLength(2);
    expect(postedKeys[1]).toBe(postedKeys[0]);
  });
});

// SPEC-B2C-CONSULT-001 D-RUN 재작업(이번 세션) — 모바일 실제 크기(390×605/
// 718/737)에서 성공·중복·실패 전환 후 브라우저 스크롤·포커스 복원을
// 검증한다. 재현: 폼 전체가 뷰포트보다 길어 제출 버튼에 닿으려면 실제로
// 스크롤이 필요하고, 성공/중복/실패 전환은 client-side 상태 전환(하드
// 네비게이션 없음)이라 그 스크롤 위치가 전환 후에도 남는다(디자인 검증
// 하네스인 scripts/visual-verify.ts에서만 window.scrollTo(0,0)로 되돌리고
// 있었을 뿐, 실제 사용자가 쓰는 이 컴포넌트 자체에는 그 보정이 없었다 —
// 이 테스트가 프로덕트 코드의 실제 동작을 검증한다).
async function scrollFormToSubmitButton(page: Page): Promise<void> {
  // 실제 사용자가 제출 버튼을 누르려면 브라우저가 그 지점까지 스크롤해야
  // 한다 — Playwright의 .click()도 대상이 뷰포트 밖이면 자동으로
  // scrollIntoView를 수행하므로, 명시적으로 호출해 재현 조건을 보장한다.
  await page.getByTestId("consult-submit-button").scrollIntoViewIfNeeded();
}

test.describe("03 화면 — 모바일(390px) 스크롤·포커스 복원", () => {
  test("성공 전환 후 스크롤이 최상단으로 복원되고 포커스가 결과 제목으로 이동한다 (390×605)", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "127.10.0.1" });
    await page.setViewportSize({ width: 390, height: 605 });

    await completeFractureFlowToResult(page);
    await clickDisabilityConsultCta(page);
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();

    await page.getByRole("radio", { name: /전화 상담/ }).check();
    await fillConsultForm(page, {
      name: CONSULT_NAME,
      contact: CONSULT_PHONE,
      preferredCallTime: CONSULT_CALL_TIME,
    });
    await checkRequiredConsents(page);
    await scrollFormToSubmitButton(page);
    const scrollYBeforeSubmit = await page.evaluate(() => window.scrollY);
    expect(scrollYBeforeSubmit).toBeGreaterThan(0); // 재현 전제: 실제로 스크롤된 상태에서 제출한다.

    await submitConsultForm(page);
    await page.getByTestId("consult-success").waitFor();

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: "성공 화면 전환 후 스크롤이 최상단으로 복원되지 않았다",
      })
      .toBe(0);
    await expect(page.getByTestId("consult-outcome-title")).toBeFocused();
  });

  test("중복 전환 후 스크롤이 최상단으로 복원되고 포커스가 결과 제목으로 이동한다 (390×718)", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "127.10.0.2" });
    await page.setViewportSize({ width: 390, height: 718 });

    await completeFractureFlowToResult(page);
    await clickDisabilityConsultCta(page);
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();
    await fillConsultForm(page, { name: CONSULT_NAME, contact: CONSULT_PHONE });
    await checkRequiredConsents(page);
    await submitConsultForm(page);
    await page.getByTestId("consult-success").waitFor();

    await page.getByTestId("consult-success-back-cta").click();
    await page.waitForURL("**/result", { timeout: 10_000 });
    await page.getByTestId("result-view").waitFor();
    await clickDisabilityConsultCta(page);
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();

    await fillConsultForm(page, { name: CONSULT_NAME, contact: CONSULT_PHONE });
    await checkRequiredConsents(page);
    await scrollFormToSubmitButton(page);
    const scrollYBeforeSubmit = await page.evaluate(() => window.scrollY);
    expect(scrollYBeforeSubmit).toBeGreaterThan(0);

    await submitConsultForm(page);
    await page.getByTestId("consult-duplicate").waitFor();

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: "중복 화면 전환 후 스크롤이 최상단으로 복원되지 않았다",
      })
      .toBe(0);
    await expect(page.getByTestId("consult-outcome-title")).toBeFocused();
  });

  test("handoff_mismatch 실패 전환 후 스크롤이 최상단으로 복원되고 포커스가 결과 제목으로 이동하며, 보내지 않았음을 안내하고 재시도 버튼은 없다 (390×737)", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "127.10.0.3" });
    await page.setViewportSize({ width: 390, height: 737 });

    await completeFractureFlowToResult(page);
    await clickDisabilityConsultCta(page);
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();

    await page.getByRole("radio", { name: /전화 상담/ }).check();
    await fillConsultForm(page, {
      name: CONSULT_NAME,
      contact: CONSULT_PHONE,
      preferredCallTime: CONSULT_CALL_TIME,
    });
    await checkRequiredConsents(page);

    // scripts/visual-verify.ts gotoConsultFailure()와 동일한 절차 —
    // 제출 직전 sessionStorage의 진단 handoff resultId를 변조해
    // handleSubmit()의 handoff_mismatch 분기(consult-view.tsx)를
    // 결정론적으로 재현한다. 실제 서버 호출도, DB도 필요 없다.
    await page.evaluate(() => {
      const KEY = "bosang-radar:diagnosis-handoff-v1";
      const raw = window.sessionStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { resultId?: string };
      parsed.resultId = `${parsed.resultId}-e2e-mismatch`;
      window.sessionStorage.setItem(KEY, JSON.stringify(parsed));
    });

    await scrollFormToSubmitButton(page);
    const scrollYBeforeSubmit = await page.evaluate(() => window.scrollY);
    expect(scrollYBeforeSubmit).toBeGreaterThan(0);

    await submitConsultForm(page);
    await page.getByTestId("consult-failure").waitFor();

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: "실패 화면 전환 후 스크롤이 최상단으로 복원되지 않았다",
      })
      .toBe(0);
    await expect(page.getByTestId("consult-outcome-title")).toBeFocused();

    // handoff_mismatch는 서버로 아무것도 보내지 않은 경로라 03-D가 "보내지
    // 않았음"을 안내하고 재시도 버튼·"중복 접수되지 않습니다" 안내 박스를 그리지
    // 않는다(재시도는 같은 비교를 반복해 계속 실패하므로). 이전 화면 링크는 남는다.
    await expect(page.getByTestId("consult-outcome-title")).toHaveText(
      "상담 신청을 보내지 않았습니다"
    );
    await expect(page.getByTestId("consult-failure-retry")).toHaveCount(0);
    await expect(page.getByTestId("consult-failure-notice")).toHaveCount(0);
    await expect(page.getByTestId("consult-failure-back-cta")).toBeVisible();
  });

  // 03-D 요약 카드의 "입력 내용 · 유지됨" 주장을 실제 재진입 경로로 확인한다. 이 안내가 맞으려면
  // "이전 화면으로 돌아가기"(/result)로 나갔다가 /consult로 다시 들어왔을 때 입력이 복원되어야
  // 한다. 필수 동의 두 항목은 설계상 draft에 저장하지 않으므로 복원되지 않는 것이 정상이다.
  async function expectConsultInputRestoredAfterLeavingFailure(page: Page): Promise<void> {
    await page.getByTestId("consult-failure-back-cta").click();
    await page.waitForURL("**/result", { timeout: 10_000 });
    await page.getByTestId("result-view").waitFor();

    await clickDisabilityConsultCta(page);
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();

    await expect(page.getByRole("radio", { name: /전화 상담/ })).toBeChecked();
    await expect(page.getByTestId("consult-name-input")).toHaveValue(CONSULT_NAME);
    await expect(page.getByTestId("consult-contact-input")).toHaveValue(CONSULT_PHONE);
    await expect(page.getByTestId("consult-preferred-call-time-input")).toHaveValue(
      CONSULT_CALL_TIME
    );
    await expect(page.getByTestId("consult-consent-checkbox-piiCollection")).not.toBeChecked();
    await expect(page.getByTestId("consult-consent-checkbox-healthInfoUse")).not.toBeChecked();
  }

  test("handoff_mismatch 실패 화면에서 이전 화면으로 나갔다 /consult로 다시 들어오면 이름·연락처·희망 시간이 복원된다 (390×737)", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "127.10.0.4" });
    await page.setViewportSize({ width: 390, height: 737 });

    await completeFractureFlowToResult(page);
    await clickDisabilityConsultCta(page);
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();

    await page.getByRole("radio", { name: /전화 상담/ }).check();
    await fillConsultForm(page, {
      name: CONSULT_NAME,
      contact: CONSULT_PHONE,
      preferredCallTime: CONSULT_CALL_TIME,
    });
    await checkRequiredConsents(page);

    // 위 handoff_mismatch 시험과 같은 절차로 제출 직전에 handoff resultId를 변조한다.
    await page.evaluate(() => {
      const KEY = "bosang-radar:diagnosis-handoff-v1";
      const raw = window.sessionStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { resultId?: string };
      parsed.resultId = `${parsed.resultId}-e2e-mismatch-restore`;
      window.sessionStorage.setItem(KEY, JSON.stringify(parsed));
    });

    await scrollFormToSubmitButton(page);
    await submitConsultForm(page);
    await page.getByTestId("consult-failure").waitFor();
    await expect(page.getByTestId("consult-outcome-title")).toHaveText(
      "상담 신청을 보내지 않았습니다"
    );

    await expectConsultInputRestoredAfterLeavingFailure(page);
  });

  test("unknown_outcome 실패 화면에서 이전 화면으로 나갔다 /consult로 다시 들어오면 이름·연락처·희망 시간이 복원된다 (390×737)", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "127.10.0.5" });
    await page.setViewportSize({ width: 390, height: 737 });

    await completeFractureFlowToResult(page);
    await clickDisabilityConsultCta(page);
    await page.waitForURL("**/consult", { timeout: 10_000 });
    await page.getByTestId("consult-view").waitFor();

    await page.getByRole("radio", { name: /전화 상담/ }).check();
    await fillConsultForm(page, {
      name: CONSULT_NAME,
      contact: CONSULT_PHONE,
      preferredCallTime: CONSULT_CALL_TIME,
    });
    await checkRequiredConsents(page);

    // 서버에 닿기 전에 요청을 끊어 응답 유실·네트워크 오류와 같은 unknown_outcome 실패를 만든다.
    await page.route("**/api/consultations", (route) => route.abort("failed"));

    await scrollFormToSubmitButton(page);
    await submitConsultForm(page);
    await page.getByTestId("consult-failure").waitFor();
    await expect(page.getByTestId("consult-outcome-title")).toHaveText(
      "상담 신청 접수 여부를 확인하지 못했습니다"
    );

    await expectConsultInputRestoredAfterLeavingFailure(page);
  });
});

// SPEC-B2C-CONSULT-001 후속(React hydration 오류 #418 회귀) — /consult를
// 전체 로드(page.goto)하거나 새로고침(page.reload)하면 서버 HTML(window
// 없음 → handoff "empty" → no-data 안내)과 클라이언트 첫 렌더(실제
// sessionStorage → 폼)의 텍스트가 달라 프로덕션 빌드에서
// "Minified React error #418"이 1건 발생했다. 클라이언트 사이드 내비게이션
// (/result에서 CTA 클릭)에서는 재현되지 않고 오직 전체 로드에서만 나타나므로,
// 이 회귀 테스트는 반드시 프로덕션 빌드(pnpm build && pnpm start)에서 goto/
// reload로 검증해야 한다.
//
// 모드: CONSULT_POLICY_READY는 빌드 시점에 고정되는 서버 플래그라
// playwright.config.ts가 E2E_CONSULT_POLICY_READY 환경변수로 모드를 나누고
// 제목의 `@policy-not-ready` 태그로 실행 대상을 고른다(준비 모드 실행에서는
// 태그 없는 테스트만, 미준비 모드 실행에서는 태그 있는 테스트만 돈다). 같은
// 시나리오를 두 모드로 각각 등록한다.
const POLICY_NOT_READY_TAG = "@policy-not-ready";
const DIAGNOSIS_HANDOFF_STORAGE_KEY = "bosang-radar:diagnosis-handoff-v1";
const CONSULT_DRAFT_STORAGE_KEY = "bosang-radar:consultation-draft-v1";
const CLIENT_ERROR_PATTERN = /hydrat|418|Minified React error/i;
const NO_DATA_COPY = "먼저 진단 결과가 필요합니다";

/**
 * 페이지 오류(pageerror)와 콘솔 오류(console type "error" 또는 hydration
 * 관련 메시지)를 수집한다. 반드시 대상 내비게이션 전에 호출해 리스너를 먼저
 * 붙인다 — hydration 오류는 첫 로드 도중에 발생한다.
 */
function collectClientErrors(page: Page): string[] {
  const collected: string[] = [];
  page.on("pageerror", (error) => {
    collected.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error" || CLIENT_ERROR_PATTERN.test(message.text())) {
      collected.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  return collected;
}

function expectNoClientErrors(errors: string[]): void {
  expect(errors, `수집된 클라이언트 오류: ${JSON.stringify(errors, null, 2)}`).toEqual([]);
}

async function overwriteDiagnosisHandoff(page: Page, value: string): Promise<void> {
  await page.evaluate(
    ([key, next]) => {
      window.sessionStorage.setItem(key, next);
    },
    [DIAGNOSIS_HANDOFF_STORAGE_KEY, value] as const
  );
}

function registerHydrationTests(policyReady: boolean): void {
  const tag = policyReady ? "" : ` ${POLICY_NOT_READY_TAG}`;
  const modeLabel = policyReady ? "정책 준비 모드" : "정책 미준비 모드";

  test.describe(`03 화면 — 전체 로드·새로고침 hydration 오류 없음 (${modeLabel}, Desktop, 1440x900)${tag}`, () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test(`(a) 진단 handoff 없이 /consult를 직접 열고 새로고침해도 empty 안내가 뜨고 오류가 없다${tag}`, async ({
      page,
    }) => {
      const errors = collectClientErrors(page);

      await page.goto("/consult");
      await expect(page.getByTestId("consult-no-data")).toBeVisible();
      await expect(page.getByText(NO_DATA_COPY)).toBeVisible();

      await page.reload();
      await expect(page.getByTestId("consult-no-data")).toBeVisible();
      await expect(page.getByText(NO_DATA_COPY)).toBeVisible();

      expectNoClientErrors(errors);
    });

    test(`(b-i) 손상된 handoff(파싱 불가 텍스트)여도 전체 로드·새로고침에서 오류 안내가 뜨고 hydration 오류가 없다${tag}`, async ({
      page,
    }) => {
      await completeFractureFlowToResult(page);
      await overwriteDiagnosisHandoff(page, "{not valid json");
      const errors = collectClientErrors(page);

      await page.goto("/consult");
      await expect(page.getByTestId("consult-error")).toBeVisible();
      await expect(page.getByText("진단 결과를 불러올 수 없어요")).toBeVisible();

      await page.reload();
      await expect(page.getByTestId("consult-error")).toBeVisible();

      expectNoClientErrors(errors);
    });

    test(`(b-ii) 손상된 handoff(유효 JSON이나 잘못된 형태)여도 전체 로드·새로고침에서 오류 안내가 뜨고 hydration 오류가 없다${tag}`, async ({
      page,
    }) => {
      await completeFractureFlowToResult(page);
      await overwriteDiagnosisHandoff(page, JSON.stringify({ unexpected: "shape" }));
      const errors = collectClientErrors(page);

      await page.goto("/consult");
      await expect(page.getByTestId("consult-error")).toBeVisible();

      await page.reload();
      await expect(page.getByTestId("consult-error")).toBeVisible();

      expectNoClientErrors(errors);
    });

    test(`(c) 유효한 handoff로 /consult를 전체 로드·새로고침해도 폼이 뜨고 hydration 오류가 없다${tag}`, async ({
      page,
    }) => {
      await completeFractureFlowToResult(page);
      const errors = collectClientErrors(page);

      await page.goto("/consult");
      await page.getByTestId("consult-view").waitFor();
      await expect(page.getByText(NO_DATA_COPY)).toHaveCount(0);

      await page.reload();
      await page.getByTestId("consult-view").waitFor();
      await expect(page.getByText(NO_DATA_COPY)).toHaveCount(0);

      // 제출 영역은 정책 준비 여부에 따라 갈린다(REQ-B2CCONSULT-005/006 예외).
      if (policyReady) {
        await expect(page.getByTestId("consult-submit-button")).toBeVisible();
        await expect(page.getByTestId("consult-submit-policy-notice")).toHaveCount(0);
      } else {
        await expect(page.getByTestId("consult-submit-policy-notice")).toBeVisible();
        await expect(page.getByTestId("consult-submit-button")).toHaveCount(0);
      }

      expectNoClientErrors(errors);
    });

    test(`(c) 유효한 handoff + ?channel=phone 전체 로드에서 전화 채널이 선택되고 hydration 오류가 없다${tag}`, async ({
      page,
    }) => {
      await completeFractureFlowToResult(page);
      const errors = collectClientErrors(page);

      await page.goto("/consult?channel=phone");
      await page.getByTestId("consult-view").waitFor();

      await expect(page.getByRole("radio", { name: /전화 상담/ })).toBeChecked();
      await expect(page.getByLabel(/통화 가능한 전화번호/)).toBeVisible();

      expectNoClientErrors(errors);
    });

    test(`(c) 유효한 handoff에서 입력·blur 후 새로고침하면 ${policyReady ? "draft가 복원되고 필수 동의는 해제된다" : "draft가 저장·복원되지 않는다"}${tag}`, async ({
      page,
    }) => {
      await completeFractureFlowToResult(page);
      const errors = collectClientErrors(page);

      await page.goto("/consult");
      await page.getByTestId("consult-view").waitFor();

      const nameInput = page.getByTestId("consult-name-input");
      const contactInput = page.getByTestId("consult-contact-input");
      await nameInput.fill(CONSULT_NAME);
      await nameInput.blur();
      await contactInput.fill(CONSULT_PHONE);
      await contactInput.blur();
      await page.getByTestId("consult-consent-checkbox-marketing").check();
      await checkRequiredConsents(page);

      await page.reload();
      await page.getByTestId("consult-view").waitFor();

      // 필수 동의 두 항목은 정책 모드와 무관하게 새로고침 후 항상 해제된다.
      await expect(page.getByTestId("consult-consent-checkbox-piiCollection")).not.toBeChecked();
      await expect(page.getByTestId("consult-consent-checkbox-healthInfoUse")).not.toBeChecked();

      if (policyReady) {
        await expect(page.getByTestId("consult-name-input")).toHaveValue(CONSULT_NAME);
        await expect(page.getByTestId("consult-contact-input")).toHaveValue(CONSULT_PHONE);
        await expect(page.getByTestId("consult-consent-checkbox-marketing")).toBeChecked();
        await expect(page.getByTestId("consult-submit-button")).toBeVisible();
      } else {
        // 정책 미준비: persistDraft 가드로 draft 자체가 저장되지 않아 복원할 값이 없다.
        const draftRaw = await page.evaluate(
          (key) => window.sessionStorage.getItem(key),
          CONSULT_DRAFT_STORAGE_KEY
        );
        expect(draftRaw).toBeNull();
        await expect(page.getByTestId("consult-name-input")).toHaveValue("");
        await expect(page.getByTestId("consult-contact-input")).toHaveValue("");
        await expect(page.getByTestId("consult-consent-checkbox-marketing")).not.toBeChecked();
        await expect(page.getByTestId("consult-submit-policy-notice")).toBeVisible();
        await expect(page.getByTestId("consult-submit-button")).toHaveCount(0);
      }

      expectNoClientErrors(errors);
    });
  });
}

registerHydrationTests(true);
registerHydrationTests(false);

// SPEC-B2C-CONSULT-001 후속(모바일 390px 채널 안내 겹침 회귀) — /consult 모바일에서
// 채널 안내(role=status)가 "이름" 라벨·입력 위로 덮여 그려지던 결함
// (consult-form.tsx의 -mt-[62px] 음수 마진이 폼을 안내 위로 끌어올렸다)을
// 실제 브라우저 레이아웃(boundingBox)으로 검증한다. jsdom은 레이아웃을 측정하지
// 못하므로 이 e2e가 진짜 검증이고, components/consult/consult-form.test.tsx의
// `-mt-` 클래스 부재 단위 테스트는 값싼 가드일 뿐이다.
//
// 모드(정책 준비/미준비)는 위 hydration 테스트와 동일한 태그 메커니즘을 쓴다.
// LAYOUT_EVIDENCE_DIR 환경변수가 설정되면(선택) 측정값 JSON과 스크린샷을 그
// 디렉터리에 남긴다 — 설정되지 않으면 파일을 전혀 쓰지 않는다.
const MOBILE_LAYOUT_VIEWPORT = { width: 390, height: 737 };
const LAYOUT_EVIDENCE_DIR = process.env.LAYOUT_EVIDENCE_DIR;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** 엄격한 교차 판정 — 맞닿기만 한(면적 0) 경우는 겹침으로 보지 않는다. */
function rectsIntersect(a: Rect, b: Rect): boolean {
  return intersectionArea(a, b) > 0;
}

function describeRect(rect: Rect): string {
  const round = (value: number) => Math.round(value * 10) / 10;
  return `top=${round(rect.y)} bottom=${round(rect.y + rect.height)} left=${round(rect.x)} right=${round(rect.x + rect.width)}`;
}

async function rectOf(locator: Locator, name: string): Promise<Rect> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${name} 요소의 boundingBox를 측정하지 못했다(렌더링되지 않았거나 숨겨짐)`);
  }
  return box;
}

function expectNoOverlap(aName: string, a: Rect, bName: string, b: Rect): void {
  expect(
    rectsIntersect(a, b),
    `${aName}(${describeRect(a)})와 ${bName}(${describeRect(b)})가 겹친다 — 교차 면적 ${intersectionArea(a, b)}px²`
  ).toBe(false);
}

// 채널 안내 하단 → 폼(이름 라벨) 상단의 세로 간격 허용 범위. 비겹침만 단언하면
// 폼이 안내에서 과도하게 아래로 밀려도 통과하므로 상·하한을 둔다. 기준은 부모
// (consult-view.tsx)의 flex-col gap-5 = 20px이다. 이 값은 CSS gap이라 폰트
// 렌더링에 따라 변하지 않지만, 서브픽셀 반올림·브라우저 차이를 ±4px 허용한다.
// 하한 16은 음수 마진(겹침)·간격 붕괴 회귀를, 상한 24는 폼이 밀려 내려가는
// 회귀를 잡는다.
const NOTICE_TO_FORM_GAP_PX = { min: 16, max: 24 } as const;

function expectGapWithin(
  name: string,
  gap: number,
  range: { readonly min: number; readonly max: number }
): void {
  expect(
    gap >= range.min && gap <= range.max,
    `${name} 간격이 ${Math.round(gap * 10) / 10}px — 허용 범위 ${range.min}~${range.max}px(부모 gap-5=20px 기준)를 벗어난다`
  ).toBe(true);
}

function saveLayoutEvidence(fileStem: string, data: unknown): void {
  if (!LAYOUT_EVIDENCE_DIR) return;
  const dir = path.resolve(LAYOUT_EVIDENCE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${fileStem}.json`), JSON.stringify(data, null, 2));
}

async function saveLayoutScreenshot(page: Page, fileStem: string): Promise<void> {
  if (!LAYOUT_EVIDENCE_DIR) return;
  const dir = path.resolve(LAYOUT_EVIDENCE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${fileStem}.png`) });
}

type LayoutChannel = "kakao" | "phone";

/** 02 결과 → 03 진입 후 채널을 선택하고 페이지 맨 위로 스크롤한다. */
async function openConsultWithChannel(page: Page, channel: LayoutChannel): Promise<void> {
  await completeFractureFlowToResult(page);
  await clickDisabilityConsultCta(page);
  await page.waitForURL("**/consult", { timeout: 10_000 });
  await page.getByTestId("consult-view").waitFor();

  const radio = page.getByRole("radio", {
    name: channel === "kakao" ? /카카오톡 상담/ : /전화 상담/,
  });
  await radio.check();
  await expect(radio).toBeChecked();
  await page.evaluate(() => window.scrollTo(0, 0));
}

function registerLayoutTests(policyReady: boolean): void {
  const tag = policyReady ? "" : ` ${POLICY_NOT_READY_TAG}`;
  const modeLabel = policyReady ? "정책 준비 모드" : "정책 미준비 모드";
  const modeStem = policyReady ? "ready" : "not-ready";

  test.describe(`03 화면 — 모바일(390x737) 채널 안내·폼·하단 CTA 겹침 없음 (${modeLabel})${tag}`, () => {
    test.use({ viewport: MOBILE_LAYOUT_VIEWPORT, isMobile: true, hasTouch: true });

    for (const channel of ["kakao", "phone"] as const) {
      test(`(a)(b)(d) ${channel} 채널 — 채널 안내가 이름·연락처·연락 희망 시간 라벨/입력과 폼 위로 겹치지 않고 채널 카드 아래에 위치하며, 안내 하단과 이름 라벨·폼 상단의 간격이 gap-5 부근이다${tag}`, async ({
        page,
      }) => {
        await openConsultWithChannel(page, channel);

        const selector = page.getByTestId("consult-channel-selector");
        const notice = selector.locator("[role=status]");
        await expect(notice).toBeVisible();

        const noticeRect = await rectOf(notice, "채널 안내");
        const cardRects = await Promise.all(
          (await selector.locator("label").all()).map((card, index) =>
            rectOf(card, `채널 카드 ${index + 1}`)
          )
        );
        const nameLabelRect = await rectOf(
          page.locator("label[for=consult-name-input]"),
          "이름 라벨"
        );
        const nameInputRect = await rectOf(page.getByTestId("consult-name-input"), "이름 입력");
        const contactLabelRect = await rectOf(
          page.locator("label[for=consult-contact-input]"),
          "연락처 라벨"
        );
        const contactInputRect = await rectOf(
          page.getByTestId("consult-contact-input"),
          "연락처 입력"
        );
        const callLabelRect = await rectOf(
          page.locator("label[for=consult-preferred-call-time-input]"),
          "연락 희망 시간 라벨"
        );
        const callInputRect = await rectOf(
          page.getByTestId("consult-preferred-call-time-input"),
          "연락 희망 시간 입력"
        );
        const formRect = await rectOf(page.getByTestId("consult-form"), "폼 컨테이너");

        const noticeBottom = noticeRect.y + noticeRect.height;
        const noticeToNameLabelGap = nameLabelRect.y - noticeBottom;
        const noticeToFormGap = formRect.y - noticeBottom;

        saveLayoutEvidence(`rects-${modeStem}-${channel}`, {
          viewport: MOBILE_LAYOUT_VIEWPORT,
          gaps: {
            noticeToNameLabel: noticeToNameLabelGap,
            noticeToForm: noticeToFormGap,
            allowed: NOTICE_TO_FORM_GAP_PX,
          },
          notice: noticeRect,
          channelCards: cardRects,
          nameLabel: nameLabelRect,
          nameInput: nameInputRect,
          contactLabel: contactLabelRect,
          contactInput: contactInputRect,
          callLabel: callLabelRect,
          callInput: callInputRect,
          form: formRect,
        });
        await saveLayoutScreenshot(page, `mobile-top-${modeStem}-${channel}`);

        // (a) 세로 순서 — 채널 카드 → 안내 → 이름 라벨, 그리고 안내가 아래 요소와 교차하지 않는다.
        cardRects.forEach((cardRect, index) => {
          expect(
            cardRect.y + cardRect.height,
            `채널 카드 ${index + 1}(${describeRect(cardRect)})가 채널 안내(${describeRect(noticeRect)}) 위에서 끝나야 한다`
          ).toBeLessThanOrEqual(noticeRect.y);
          expectNoOverlap(`채널 카드 ${index + 1}`, cardRect, "채널 안내", noticeRect);
        });
        expect(
          noticeRect.y + noticeRect.height,
          `채널 안내(${describeRect(noticeRect)})가 이름 라벨(${describeRect(nameLabelRect)}) 위에서 끝나야 한다`
        ).toBeLessThanOrEqual(nameLabelRect.y);

        expectNoOverlap("채널 안내", noticeRect, "이름 라벨", nameLabelRect);
        expectNoOverlap("채널 안내", noticeRect, "이름 입력", nameInputRect);
        expectNoOverlap("채널 안내", noticeRect, "연락처 라벨", contactLabelRect);
        expectNoOverlap("채널 안내", noticeRect, "연락처 입력", contactInputRect);
        expectNoOverlap("채널 안내", noticeRect, "연락 희망 시간 라벨", callLabelRect);
        expectNoOverlap("채널 안내", noticeRect, "연락 희망 시간 입력", callInputRect);

        // (b) 폼 컨테이너 전체가 안내와 교차하지 않는다.
        expectNoOverlap("폼 컨테이너", formRect, "채널 안내", noticeRect);

        // (d) 상대 위치 — 겹치지 않는 것만으로는 폼이 과도하게 아래로 밀려도 통과하므로,
        // 안내 하단 → 이름 라벨/폼 상단의 실측 간격이 gap-5(20px) 부근이어야 한다.
        expectGapWithin(
          "채널 안내 하단 → 이름 라벨 상단",
          noticeToNameLabelGap,
          NOTICE_TO_FORM_GAP_PX
        );
        expectGapWithin(
          "채널 안내 하단 → 폼 컨테이너 상단",
          noticeToFormGap,
          NOTICE_TO_FORM_GAP_PX
        );
      });

      test(`(c) ${channel} 채널 — 하단 sticky CTA가 입력·동의 체크박스를 가리지 않고 ${policyReady ? "제출 버튼이 뷰포트에 온전히 들어온다" : "정책 미준비 안내가 잘리지 않고 보인다"}${tag}`, async ({
        page,
      }) => {
        await openConsultWithChannel(page, channel);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect
          .poll(() => page.evaluate(() => window.scrollY), {
            message: "테스트 준비: 하단 스크롤 실패",
          })
          .toBeGreaterThan(0);

        const bar = page.getByTestId("consult-submit-bar");
        await expect(bar).toBeVisible();

        const targets: Array<[string, Locator]> = [
          ["이름 입력", page.getByTestId("consult-name-input")],
          ["연락처 입력", page.getByTestId("consult-contact-input")],
          ["연락 희망 시간 입력", page.getByTestId("consult-preferred-call-time-input")],
          [
            "개인정보 수집 동의 체크박스",
            page.getByTestId("consult-consent-checkbox-piiCollection"),
          ],
          [
            "건강정보 이용 동의 체크박스",
            page.getByTestId("consult-consent-checkbox-healthInfoUse"),
          ],
          ["마케팅 수신 동의 체크박스", page.getByTestId("consult-consent-checkbox-marketing")],
        ];

        const measured: Record<string, unknown> = {};
        for (const [name, target] of targets) {
          await target.scrollIntoViewIfNeeded();
          const targetRect = await rectOf(target, name);
          const barRect = await rectOf(bar, "하단 CTA 영역");
          measured[name] = { target: targetRect, bar: barRect };

          expectNoOverlap(name, targetRect, "하단 CTA 영역", barRect);
          // 실제 포인터가 도달 가능한지 — 가려져 있으면 trial 클릭이 실패한다.
          await target.click({ trial: true, timeout: 5_000 });
          const hitOk = await target.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2
            );
            if (!hit) return false;
            const labels = (element as HTMLInputElement).labels;
            return (
              hit === element ||
              element.contains(hit) ||
              hit.contains(element) ||
              (labels !== null &&
                labels !== undefined &&
                Array.from(labels).some((label) => label.contains(hit)))
            );
          });
          expect(
            hitOk,
            `${name}(${describeRect(targetRect)}) 중심에서 실제로 가장 위에 그려지는 요소가 이 요소(또는 그 라벨)가 아니다 — 하단 CTA(${describeRect(barRect)})가 가리고 있을 수 있다`
          ).toBe(true);
        }

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        saveLayoutEvidence(`sticky-${modeStem}-${channel}`, {
          viewport: MOBILE_LAYOUT_VIEWPORT,
          measured,
        });
        await saveLayoutScreenshot(page, `mobile-bottom-${modeStem}-${channel}`);

        if (policyReady) {
          // 제출 버튼 전체가 뷰포트 안에 들어와야 한다(잘리지 않음).
          await expect(page.getByTestId("consult-submit-button")).toBeInViewport({ ratio: 1 });
        } else {
          // 정책 미준비 안내는 뷰포트 안에 온전히 보이고 텍스트가 잘리지 않는다.
          const policyNotice = page.getByTestId("consult-submit-policy-notice");
          await expect(policyNotice).toBeInViewport({ ratio: 1 });
          const clip = await policyNotice.evaluate((element) => ({
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          }));
          expect(
            clip.scrollHeight <= clip.clientHeight && clip.scrollWidth <= clip.clientWidth,
            `정책 미준비 안내 텍스트가 잘린다: ${JSON.stringify(clip)}`
          ).toBe(true);
        }
      });
    }
  });

  // 데스크톱은 이번 수정 범위 밖이다 — 같은 겹침 검사를 회귀 가드로 유지한다.
  test.describe(`03 화면 — 데스크톱(1440x900) 채널 안내가 폼과 겹치지 않는다 (${modeLabel})${tag}`, () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test(`채널 안내가 이름 라벨·입력과 겹치지 않고 채널 카드 아래에 있다${tag}`, async ({
      page,
    }) => {
      await openConsultWithChannel(page, "kakao");

      const selector = page.getByTestId("consult-channel-selector");
      const noticeRect = await rectOf(selector.locator("[role=status]"), "채널 안내");
      const nameLabelRect = await rectOf(
        page.locator("label[for=consult-name-input]"),
        "이름 라벨"
      );
      const nameInputRect = await rectOf(page.getByTestId("consult-name-input"), "이름 입력");
      const formRect = await rectOf(page.getByTestId("consult-form"), "폼 컨테이너");
      saveLayoutEvidence(`rects-desktop-${modeStem}`, {
        viewport: DESKTOP_VIEWPORT,
        notice: noticeRect,
        nameLabel: nameLabelRect,
        nameInput: nameInputRect,
        form: formRect,
      });
      await saveLayoutScreenshot(page, `desktop-top-${modeStem}`);

      expect(
        noticeRect.y + noticeRect.height,
        `채널 안내(${describeRect(noticeRect)})가 이름 라벨(${describeRect(nameLabelRect)}) 위에서 끝나야 한다`
      ).toBeLessThanOrEqual(nameLabelRect.y);
      expectNoOverlap("채널 안내", noticeRect, "이름 라벨", nameLabelRect);
      expectNoOverlap("채널 안내", noticeRect, "이름 입력", nameInputRect);
      expectNoOverlap("폼 컨테이너", formRect, "채널 안내", noticeRect);
    });
  });
}

registerLayoutTests(true);
registerLayoutTests(false);

// ── 성공 화면(03-B/M03-B) 요소 비겹침 회귀 가드 ─────────────────────────
// jsdom에는 레이아웃이 없어 단위 테스트로는 겹침을 잡을 수 없다 — 실제 브라우저의
// getBoundingClientRect(=Playwright boundingBox)로 안내 문구·CTA·요약 카드가 서로
// 겹치지 않고 .pen 순서(안내 → 카드 → CTA)로 쌓이는지 단언한다. 이 순서는 design.md
// §10의 카드 → 안내 → CTA를 대체한다(사용자 지시 ".pen 최우선").
// 데스크톱에서 CTA 그룹의 음수 상단 마진(md:mt-[-39px])이 CTA를 안내 문구 위로
// 끌어올려 덮던 결함(progress.md Claim 52)의 회귀를 막는다.
async function reachSuccessScreen(page: Page, phone: string): Promise<void> {
  await completeFractureFlowToResult(page);
  await clickDisabilityConsultCta(page);
  await page.waitForURL("**/consult", { timeout: 10_000 });
  await page.getByTestId("consult-view").waitFor();
  await page.getByRole("radio", { name: /전화 상담/ }).check();
  await fillConsultForm(page, {
    name: CONSULT_NAME,
    contact: phone,
    preferredCallTime: CONSULT_CALL_TIME,
  });
  await checkRequiredConsents(page);
  await submitConsultForm(page);
  await page.getByTestId("consult-success").waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function expectSuccessScreenNoOverlap(page: Page): Promise<void> {
  const cardRect = await rectOf(page.getByTestId("consult-success-summary"), "요약 카드");
  const noticeRect = await rectOf(page.getByTestId("consult-success-notice"), "안내 문구");
  const ctaRect = await rectOf(page.getByTestId("consult-success-back-cta"), "돌아가기 CTA");

  expectNoOverlap("안내 문구", noticeRect, "돌아가기 CTA", ctaRect);
  expectNoOverlap("요약 카드", cardRect, "안내 문구", noticeRect);
  expectNoOverlap("요약 카드", cardRect, "돌아가기 CTA", ctaRect);
  // .pen 03-B 순서: 안내(부제) → 카드 → CTA. 안내는 카드 위, CTA는 카드 아래.
  // (사용자 지시 ".pen 최우선"으로 design.md §10의 카드 → 안내 → CTA 순서를 대체했다.)
  expect(
    cardRect.y,
    `요약 카드(${describeRect(cardRect)})는 안내 문구(${describeRect(noticeRect)}) 아래에서 시작해야 한다`
  ).toBeGreaterThanOrEqual(noticeRect.y + noticeRect.height);
  expect(
    ctaRect.y,
    `돌아가기 CTA(${describeRect(ctaRect)})는 요약 카드(${describeRect(cardRect)}) 아래에서 시작해야 한다`
  ).toBeGreaterThanOrEqual(cardRect.y + cardRect.height);
}

test.describe("03-B 성공 화면 — 요약 카드·안내·CTA 비겹침 (Desktop, 1440x900)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("데스크톱에서 안내 문구와 돌아가기 CTA와 요약 카드가 서로 겹치지 않는다", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "127.20.0.1" });
    await reachSuccessScreen(page, "01023450001");
    await expectSuccessScreenNoOverlap(page);
  });
});

test.describe("M03-B 성공 화면 — 요약 카드·안내·CTA 비겹침 (Mobile, 390x605)", () => {
  test.use({ viewport: { width: 390, height: 605 } });

  test("모바일에서 안내 문구와 돌아가기 CTA와 요약 카드가 서로 겹치지 않는다", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "127.20.0.2" });
    await reachSuccessScreen(page, "01023450002");
    await expectSuccessScreenNoOverlap(page);
  });
});

// ── 성공 화면(03-B/M03-B) 채널별 레이아웃 계측 — 전화 4행 / 카카오 3행 ────────────
// pnpm visual:verify는 전화 채널(4행)만 디자인과 비교한다. 카카오 채널은 "연락 희망
// 시간" 행이 없어 3행이며, 이 카드에는 디자인 캡처가 없다. 그래서 디자인 대조 대신
// 실제 브라우저 레이아웃(getBoundingClientRect·scrollWidth 등)으로 잘림·겹침·CTA
// 침범이 없는지만 단언한다. 측정값은 LAYOUT_EVIDENCE_DIR이 설정된 경우에만 파일로
// 남긴다(위 layout 테스트와 같은 규약).
type SuccessChannel = "kakao" | "phone";

async function reachSuccessScreenWithChannel(
  page: Page,
  channel: SuccessChannel,
  phone: string,
  preferredCallTime?: string
): Promise<void> {
  await completeFractureFlowToResult(page);
  await clickDisabilityConsultCta(page);
  await page.waitForURL("**/consult", { timeout: 10_000 });
  await page.getByTestId("consult-view").waitFor();
  await page
    .getByRole("radio", { name: channel === "kakao" ? /카카오톡 상담/ : /전화 상담/ })
    .check();
  await fillConsultForm(page, { name: CONSULT_NAME, contact: phone, preferredCallTime });
  await checkRequiredConsents(page);
  await submitConsultForm(page);
  await page.getByTestId("consult-success").waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
}

interface TextMetric {
  text: string;
  rect: Rect;
  scrollWidth: number;
  clientWidth: number;
  textOverflow: string;
  lineClamp: string;
  lineCount: number;
}

interface SuccessLayoutMetrics {
  viewportWidth: number;
  documentScrollWidth: number;
  card: Rect & {
    scrollWidth: number;
    clientWidth: number;
    borderTop: number;
    borderBottom: number;
  };
  rows: { rect: Rect; dt: TextMetric; dd: TextMetric }[];
  notice: TextMetric;
  cta: Rect;
  cancel: Rect;
}

async function measureSuccessLayout(page: Page): Promise<SuccessLayoutMetrics> {
  return page.evaluate(() => {
    const rectOfElement = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const textMetric = (el: Element) => {
      const style = getComputedStyle(el);
      const lineHeight = parseFloat(style.lineHeight);
      const r = el.getBoundingClientRect();
      return {
        // innerText는 display:none인 쪽을 빼고 화면에 보이는 글자만 돌려준다. 연락 희망
        // 시간 라벨은 모바일/데스크톱 두 글자를 모두 그리고 CSS로 하나만 보이게 하므로
        // textContent를 쓰면 두 라벨이 이어 붙어 읽힌다.
        text: ((el as HTMLElement).innerText ?? el.textContent ?? "").trim(),
        rect: rectOfElement(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        textOverflow: style.textOverflow,
        lineClamp: style.getPropertyValue("-webkit-line-clamp") || "none",
        lineCount:
          Number.isFinite(lineHeight) && lineHeight > 0 ? Math.round(r.height / lineHeight) : -1,
      };
    };
    const byTestId = (id: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) throw new Error(`data-testid="${id}" 요소가 없다`);
      return el;
    };
    const card = byTestId("consult-success-summary");
    const cardStyle = getComputedStyle(card);
    const rows = Array.from(card.children).map((row) => ({
      rect: rectOfElement(row),
      dt: textMetric(row.querySelector("dt") as Element),
      dd: textMetric(row.querySelector("dd") as Element),
    }));
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      card: {
        ...rectOfElement(card),
        scrollWidth: card.scrollWidth,
        clientWidth: card.clientWidth,
        borderTop: parseFloat(cardStyle.borderTopWidth),
        borderBottom: parseFloat(cardStyle.borderBottomWidth),
      },
      rows,
      notice: textMetric(byTestId("consult-success-notice")),
      cta: rectOfElement(byTestId("consult-success-back-cta")),
      cancel: rectOfElement(byTestId("consult-success-cancel-inquiry")),
    };
  });
}

/** inner가 outer 안에 들어 있는지(서브픽셀 반올림 0.5px 허용). */
function expectContained(innerName: string, inner: Rect, outerName: string, outer: Rect): void {
  const tolerance = 0.5;
  const contained =
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance;
  expect(
    contained,
    `${innerName}(${describeRect(inner)})이 ${outerName}(${describeRect(outer)}) 밖으로 나간다`
  ).toBe(true);
}

function expectTextNotClipped(name: string, metric: TextMetric): void {
  expect(
    metric.scrollWidth,
    `${name}("${metric.text}") 내용 폭 ${metric.scrollWidth}px가 상자 폭 ${metric.clientWidth}px를 넘는다(가로 잘림)`
  ).toBeLessThanOrEqual(metric.clientWidth);
  expect(metric.textOverflow, `${name}에 말줄임(ellipsis)이 걸려 있다`).not.toBe("ellipsis");
  expect(["none", ""], `${name}에 line-clamp가 걸려 있다`).toContain(metric.lineClamp);
}

function expectSuccessLayoutSound(
  metrics: SuccessLayoutMetrics,
  expectedLabels: readonly string[]
): void {
  const { card, rows, notice, cta, cancel } = metrics;
  expect(
    rows.map((row) => row.dt.text),
    "요약 카드 행 구성"
  ).toEqual([...expectedLabels]);

  // (a) 카드·안내·CTA·취소 문의 사이 쌍별 비교차 + 카드 → 안내 → CTA 순서
  const blocks: [string, Rect][] = [
    ["요약 카드", card],
    ["안내 문구", notice.rect],
    ["돌아가기 CTA", cta],
    ["취소 문의 문구", cancel],
  ];
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      expectNoOverlap(blocks[i][0], blocks[i][1], blocks[j][0], blocks[j][1]);
    }
  }
  expect(card.y, "요약 카드는 안내 문구 아래에서 시작해야 한다").toBeGreaterThanOrEqual(
    notice.rect.y + notice.rect.height
  );
  expect(cta.y, "CTA는 요약 카드 아래에서 시작해야 한다").toBeGreaterThanOrEqual(
    card.y + card.height
  );

  // (b) 모든 행과 dt/dd가 카드 안에 있고, 한 행에서 dt와 dd가 서로 겹치지 않는다
  for (const row of rows) {
    expectContained(`행 "${row.dt.text}"`, row.rect, "요약 카드", card);
    expectContained(`dt "${row.dt.text}"`, row.dt.rect, "요약 카드", card);
    expectContained(`dd "${row.dd.text}"`, row.dd.rect, "요약 카드", card);
    expectNoOverlap(`dt "${row.dt.text}"`, row.dt.rect, `dd "${row.dd.text}"`, row.dd.rect);
  }

  // (c) 잘림·가로 넘침 없음
  for (const row of rows) {
    expectTextNotClipped(`dt "${row.dt.text}"`, row.dt);
    expectTextNotClipped(`dd "${row.dd.text}"`, row.dd);
  }
  expectTextNotClipped("안내 문구", notice);
  expect(card.scrollWidth, "카드가 가로로 넘친다").toBeLessThanOrEqual(card.clientWidth);
  expect(metrics.documentScrollWidth, "페이지가 가로로 넘친다").toBeLessThanOrEqual(
    metrics.viewportWidth
  );
  for (const [name, rect] of [
    ["요약 카드", card],
    ["안내 문구", notice.rect],
    ["돌아가기 CTA", cta],
    ["취소 문의 문구", cancel],
  ] as [string, Rect][]) {
    expect(rect.x, `${name} 왼쪽이 뷰포트 밖이다`).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width, `${name} 오른쪽이 뷰포트 밖이다`).toBeLessThanOrEqual(
      metrics.viewportWidth + 0.5
    );
  }

  // (d) 카드 높이 = 행 높이의 합 + 위·아래 테두리(예상치 못한 여백 없음)
  const rowsHeight = rows.reduce((sum, row) => sum + row.rect.height, 0);
  expect(
    Math.abs(card.height - (rowsHeight + card.borderTop + card.borderBottom)),
    `카드 높이 ${card.height}px ≠ 행 높이 합 ${rowsHeight}px + 테두리 ${card.borderTop + card.borderBottom}px`
  ).toBeLessThanOrEqual(0.5);
}

async function saveSuccessEvidence(
  page: Page,
  stem: string,
  metrics: SuccessLayoutMetrics
): Promise<void> {
  saveLayoutEvidence(stem, {
    card: {
      width: metrics.card.width,
      height: metrics.card.height,
      rows: metrics.rows.length,
      rowHeights: metrics.rows.map((row) => row.rect.height),
    },
    metrics,
  });
  if (!LAYOUT_EVIDENCE_DIR) return;
  const dir = path.resolve(LAYOUT_EVIDENCE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${stem}.png`), fullPage: true });
}

// .pen은 연락 희망 시간 행 라벨을 모바일(md=768px 미만)에서 "희망 시간"으로 줄여 쓴다.
const MOBILE_MAX_WIDTH = 768;

function successLabels(channel: SuccessChannel, viewportWidth: number): readonly string[] {
  if (channel === "kakao") return ["상담 방식", "연락처", "상담 예정 전문가"];
  const callTimeLabel = viewportWidth < MOBILE_MAX_WIDTH ? "희망 시간" : "연락 희망 시간";
  return ["상담 방식", "연락처", callTimeLabel, "상담 예정 전문가"];
}

const SUCCESS_VIEWPORTS = [
  { name: "desktop", size: DESKTOP_VIEWPORT },
  { name: "mobile", size: { width: 390, height: 605 } },
] as const;

// 010-0000-NNNN 형태의 가상 번호와 테스트 전용 x-forwarded-for(rate limit 창 분리).
const SUCCESS_LAYOUT_CASES: {
  channel: SuccessChannel;
  viewport: (typeof SUCCESS_VIEWPORTS)[number];
  phone: string;
  ip: string;
}[] = [
  { channel: "kakao", viewport: SUCCESS_VIEWPORTS[0], phone: "01000000201", ip: "127.21.0.1" },
  { channel: "kakao", viewport: SUCCESS_VIEWPORTS[1], phone: "01000000202", ip: "127.21.0.2" },
  { channel: "phone", viewport: SUCCESS_VIEWPORTS[0], phone: "01000000203", ip: "127.21.0.3" },
  { channel: "phone", viewport: SUCCESS_VIEWPORTS[1], phone: "01000000204", ip: "127.21.0.4" },
];

for (const { channel, viewport, phone, ip } of SUCCESS_LAYOUT_CASES) {
  test.describe(`03-B 성공 화면 — ${channel} 채널 레이아웃 계측 (${viewport.name}, ${viewport.size.width}x${viewport.size.height})`, () => {
    test.use({ viewport: viewport.size });

    test(`${channel} 채널 성공 화면에서 카드 안의 모든 행이 잘리지 않고, 카드·안내·CTA·취소 문의가 겹치지 않으며 카드에 여분의 여백이 없다`, async ({
      page,
    }) => {
      await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
      await reachSuccessScreenWithChannel(
        page,
        channel,
        phone,
        channel === "phone" ? CONSULT_CALL_TIME : undefined
      );
      const metrics = await measureSuccessLayout(page);
      await saveSuccessEvidence(page, `success-${channel}-${viewport.name}`, metrics);
      expectSuccessLayoutSound(metrics, successLabels(channel, viewport.size.width));
    });
  });
}

// 연락 희망 시간은 스키마(lib/consult/schema.ts)상 min(1)인 자유 문자열이며 허용값
// 열거나 최대 길이가 없다 — 따라서 "허용되는 가장 긴 값"은 정의되지 않는다. 저장소에서
// 확인되는 서버 형식 값은 입력란 placeholder 형식("평일 오후 (13시 ~ 18시)")뿐이라
// 위 4개 케이스가 이미 그 값을 쓴다. 여기서는 스키마가 통과시키는 합성 스트레스 값 두
// 가지(공백 있는 긴 문장 / 공백 없는 긴 연속 문자열)를 390px 전화 채널에서 계측한다.
const LONG_CALL_TIME_CASES = [
  {
    label: "공백 있는 긴 문장",
    value: "평일 오전 9시부터 11시 사이 또는 평일 오후 2시부터 6시 사이 어느 때든 가능합니다",
    phone: "01000000205",
    ip: "127.21.0.5",
    stem: "spaced",
  },
  {
    label: "공백 없는 긴 한글 연속 문자열",
    value: "평일오전9시부터11시사이또는평일오후2시부터6시사이어느때든연락가능합니다감사합니다",
    phone: "01000000206",
    ip: "127.21.0.6",
    stem: "unbroken-hangul",
  },
  {
    label: "공백 없는 긴 영문 연속 문자열",
    value: "hong.gildong.kakao.id.1234567890abcdefghij",
    phone: "01000000207",
    ip: "127.21.0.7",
    stem: "unbroken-latin",
  },
  {
    label: "공백 없는 매우 긴 영문 연속 문자열",
    value: "hong.gildong.kakao.id.1234567890abcdefghij.hong.gildong.kakao.id.1234567890abcdefghij",
    phone: "01000000208",
    ip: "127.21.0.8",
    stem: "unbroken-latin-long",
  },
] as const;

for (const { label, value, phone, ip, stem } of LONG_CALL_TIME_CASES) {
  test.describe(`03-B 성공 화면 — 전화 채널 긴 연락 희망 시간(${label}, 390x605)`, () => {
    test.use({ viewport: { width: 390, height: 605 } });

    test(`긴 연락 희망 시간(${label}, ${value.length}자)이 카드 밖으로 잘리거나 넘치지 않고 카드·안내·CTA가 겹치지 않는다`, async ({
      page,
    }) => {
      await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
      await reachSuccessScreenWithChannel(page, "phone", phone, value);
      const metrics = await measureSuccessLayout(page);
      await saveSuccessEvidence(page, `success-phone-mobile-long-${stem}`, metrics);
      expectSuccessLayoutSound(metrics, successLabels("phone", 390));
    });
  });
}
