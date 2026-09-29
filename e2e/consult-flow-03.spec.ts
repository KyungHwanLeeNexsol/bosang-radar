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

import { expect, test, type Page } from "@playwright/test";

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
    await expect(duplicateSummary).toContainText("접수됨");
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

// 03-D(제출 실패) 화면의 자동화 커버리지는 이 파일에 없다 — 파일 상단
// [환경 노트 2]에서 실측으로 확인한 이유(next@16.3.2 base-server.js가
// x-forwarded-for를 raw 소켓 주소로 자동 채워 fail closed 분기가 이
// 환경에서 도달 불가능함) 때문이다. 렌더링 자체는
// components/consult/consult-failure.test.tsx가 이미 커버한다.

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

  test("handoff_mismatch 실패 전환 및 재시도 후에도 스크롤이 최상단으로 복원되고 포커스가 결과 제목으로 이동한다 (390×737)", async ({
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

    // 제출 실패 후 재시도 — handoff_mismatch는 sessionStorage에 남은
    // 변조값 때문에 재시도에서도 다시 실패로 귀결되지만(핸드오프 자체를
    // 복구하지 않는 한), 매 전환마다 스크롤·포커스가 다시 복원되는지는
    // 별도로 검증해야 한다(한 번만 복원되고 재시도에서는 안 되는 회귀를
    // 잡기 위함).
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { message: "테스트 준비: 스크롤 강제 이동 실패" })
      .toBeGreaterThan(0);
    await page.getByTestId("consult-failure-retry").click();
    await page.getByTestId("consult-failure").waitFor();

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: "재시도 후 스크롤이 최상단으로 다시 복원되지 않았다",
      })
      .toBe(0);
    await expect(page.getByTestId("consult-outcome-title")).toBeFocused();
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
