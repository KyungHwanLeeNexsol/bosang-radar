# Research — SPEC-B2C-ENGINE-001

이 문서는 plan-phase에서 코드를 직접 읽어 확인한 증거 장부다. 모든 `path:line`은 2026-10-02 `main@99993bf`에서 관찰한 값이다. 확인하지 못한 항목은 "미검증"으로 따로 모았다.

## 1. 코드 증거 장부 — 실제 / fixture / 부재

### 1.1 진단 판정 (01 → 02)

| 구분 | 사실 | 근거 |
|---|---|---|
| fixture | `mockJudge(input, reviewEnabled)`는 `reviewEnabled && input === FRACTURE_FIXTURE_INPUT`일 때만 `"result"`, 아니면 `"오류"` 포함 여부로 `"error"`/`"result-none"`을 반환한다. 엄격한 `===`이며 trim이 없다 | `components/diagnosis/step-loading.tsx:54-62` |
| fixture | 함수 전체를 실제 분석 호출로 교체하겠다는 `@MX:DEBT`/`@MX:CEILING`/`@MX:UPGRADE` 주석이 이미 있다 | `step-loading.tsx:30-43` |
| fixture | 고정 입력 문장 | `lib/diagnosis/fixtures/fracture-case.ts:14` |
| fixture | 같은 문장이 검색창 placeholder다 | `components/diagnosis/step-input.tsx:250` |
| fixture | `buildFractureResult(rawInput, answers)`가 결과를 만든다. `resultId`는 `fracture-${Date.now()}`, `generatedAt`은 현재 시각이고 나머지는 리터럴이다 | `fracture-case.ts:209-229` (resultId `:214`) |
| fixture | 담보 7개가 리터럴이다. 금액 범위도 리터럴("30만~50만원", "20만~40만원") | `fracture-case.ts:82-202` (금액 `:147-149,165-166`) |
| fixture | 답변은 `buildFactChips`로 표시용 Fact Chip만 만든다. status·benefit·항목은 답변과 무관하다 | `fracture-case.ts:41-54,82-202` |
| fixture | `StepLoading`은 `input`만 받고 answers를 받지 않는다 | `components/diagnosis/diagnosis-flow.tsx:452-457` |
| fixture | `buildFractureResult` 호출처 두 곳: 정상 플로우와 `?devFixture=fracture` 직접 진입 | `diagnosis-flow.tsx:464`, `components/result/result-view.tsx:82-87,153` |
| 실제(단순) | 02의 집계는 단순 개수 세기다 | `lib/diagnosis/aggregate.ts:18-28`, `result-view.tsx:185-193` |
| 부재 | 담보 매칭 엔진, `lib/coverage/`, 약관·상품·증권 데이터, OCR | 모든 `app/ components/ lib/diagnosis lib/consult lib/validation`에서 `lib/ai`·`lib/pipeline`·`@google/genai`·`gemini` import 검색 결과 0건. `lib/` 디렉터리에 `coverage/` 없음 |
| 부재 | 진단용 API·서버 액션·DB 테이블 | `app/` 라우트는 `app/api/consultations/route.ts`, `app/consult/page.tsx`, `app/page.tsx`, `app/result/page.tsx`뿐. `lib/db/schema.ts`의 테이블 목록에 진단·결과 테이블 없음(`consultations`는 `:200`) |
| 부재 | "판단 불가" 로직. needs-info / low-likelihood는 데이터 enum으로만 존재한다 | `lib/diagnosis/types.ts:19`, `schema.ts:14` |

### 1.2 01 화면 구조

| 사실 | 근거 |
|---|---|
| 상태 머신: `input → consent → questions → loading → (result-none \| error \| result)`. 동의는 질문 **앞**이다 | `diagnosis-flow.tsx:64`, `:134-145` |
| 입력 길이 상한 200자 | `step-input.tsx:37` |
| "많이 찾는 사례" 칩 6개: 교통사고, 계단에서 낙상, 운동 중 부상, 허리 디스크, 어깨 회전근개, 암 진단 | `step-input.tsx:43-50` |
| 01-B 질문은 3개 고정이며 각 4개 선택지다. Q1만 골절 문구("무릎 골절로 수술을 받으셨나요?"), Q2·Q3은 일반 문구다 | `components/diagnosis/step-questions.tsx:36-55` (Q1 `:39`) |
| 질문이 실제 서비스에서는 입력에 따라 동적이어야 한다고 이 파일 자신이 적고 있다 | `step-questions.tsx:12-18` |
| 01-D(결과 없음)는 "현재 입력만으로는 보상 가능성을 판단하기 어렵습니다"를 모든 비-fixture 입력에 보여 준다 | `components/diagnosis/step-result-none.tsx:61` |
| 01-D의 "데모/검토용 목업입니다" 표기는 조건 없이 항상 렌더링된다(01-E도 동일) | `step-result-none.tsx:104-106`, `components/diagnosis/step-error.tsx:81` |
| 01-D 입력 안내 예시 두 번째가 디스크 사례다. 최초 공개 범위에 따라 이 예시가 지원 범위 밖을 안내할 수 있다 | `step-result-none.tsx:20-23` |

### 1.3 계약 · 인계

| 사실 | 근거 |
|---|---|
| 카테고리 4개, 상태 3개, `DiagnosisResult` 필드 | `lib/diagnosis/types.ts:6-10,19,125-128,136-145` |
| 런타임 계약은 `z.strictObject`이며 `schemaVersion`은 리터럴 `"1"` | `lib/diagnosis/schema.ts:135-144`, `types.ts:134` |
| 인계는 `sessionStorage` 키 `bosang-radar:diagnosis-handoff-v1`, 읽기 3갈래(empty/valid/invalid) | `lib/diagnosis/handoff.ts:11,32-37,45-74` |
| 게이트 계산: `productionReady = FLOW && ENGINE_READY`, `reviewEnabled = DEV_STATES`, 모두 `=== "true"` | `lib/diagnosis/flags.ts:22-24,38-47` |
| 앱·라이브러리 소스(`app/`, `components/`, `lib/`, `instrumentation.ts`, `playwright.config.ts`, `.github/workflows/`)에서 `*.test.*`와 주석 행을 제외하면 `DIAGNOSIS_ENGINE_READY`를 대입하는 코드는 없다(읽기만 있음). **단 `scripts/verify-flag-runtime.ts`는 대입한다** — `:174`(기대 상태 계산용 입력 객체의 `DIAGNOSIS_ENGINE_READY: String(start.engine)`)와 `:293`(임시 서버 프로세스 env의 `env.DIAGNOSIS_ENGINE_READY = String(flags.diag.engine)`). 이 스크립트는 임시 서버를 띄우는 검증 하네스이므로 AC-023은 시험 코드로 분류한다. 비-`.moai` 참조 파일은 11개이며 `CHANGELOG.md`, `README.md`, `playwright.config.ts`, `components/diagnosis/step-loading.tsx`(주석), `lib/diagnosis/flags.ts`, `lib/diagnosis/fixtures/fracture-case.ts`(주석), `scripts/verify-flag-runtime.ts`, 테스트 파일들이다 | 저장소 검색(`.moai/**` 제외, 파일 11개·발생 28건). 대입 패턴 검색 `grep -rnE "DIAGNOSIS_ENGINE_READY[[:space:]]*(=|:)[[:space:]]*[^=[:space:]]" app components lib instrumentation.ts playwright.config.ts .github/workflows --exclude="*.test.*"`에서 주석 행을 제거하면 출력 0줄(`main@99993bf`) |
| `computeDiagnosisFlags`는 env만 입력으로 받는 순수 함수이며 `productionReady = ENABLE_DIAGNOSIS_FLOW && DIAGNOSIS_ENGINE_READY`다. `scripts/verify-flag-runtime.ts`는 이 함수로 기대 게이트 상태를 계산하고(`:165-181`), 엔진을 켠 조합 `PROD_READY`·`FLOW_ONLY`·`ALL_ON`(`:447-449`)을 실제 서버에 대해 검증한다. 시험 파일은 `scripts/verify-flag-runtime.test.ts`다 | `lib/diagnosis/flags.ts:38-47`, `scripts/verify-flag-runtime.ts:165-181,293,447-449`, `package.json`의 `verify:flag-runtime` |
| 세 라우트(`app/page.tsx:49`, `app/result/page.tsx:38`, `app/consult/page.tsx:30`)는 `dynamic = "force-dynamic"`이라 플래그를 요청마다 읽는다. 빌드 하나가 프로덕션과 review를 동시에 만족시킬 수 없다 | 위 세 파일, `app/page.test.tsx:231-233` |

### 1.4 03 상담과의 접점

| 사실 | 근거 |
|---|---|
| `resultId`는 `z.string().min(1)`만 검증된다 | `lib/consult/schema.ts:23` |
| 서버는 `resultId`를 중복 키로만 사용하며, 존재 여부를 어디와도 대조하지 않는다 | `app/api/consultations/route.ts:253-258`(로그용 존재 여부), `:263`, `:306-308`, `:397-416` |
| `consultations.result_id`는 FK가 아닌 opaque 참조이며, 대조할 원본이 없다고 스키마 주석이 명시한다 | `lib/db/schema.ts:189-192,204` |
| 03은 마운트 시 `resultId`를 캡처하고 제출 직전에 다시 읽어 불일치 시 `handoff_mismatch`로 판정한다. 이것은 **클라이언트측** 변조 탐지일 뿐 서버 검증이 아니다 | `components/consult/consult-view.tsx:259-267,371-381` |
| 유효한 handoff가 없으면 03은 no-data/error 화면을 보인다. 따라서 "판단 불가" 상태에서 상담으로 보내려면 결과 없는 상담 경로가 새로 필요하다 | `consult-view.tsx:453-472` |
| 상담 e2e도 고정 문장을 입력해 02에 도달한다 | `e2e/consult-flow-03.spec.ts:63,105` |
| CONSULT-001은 `resultId`를 위한 별도의 신선도(TTL) 검사를 **금지**한다(REQ-B2CCONSULT-009) | `.moai/specs/SPEC-B2C-CONSULT-001/spec.md:79` |
| CONSULT-001은 `consultations` 테이블이 진단 상세를 복제하지 않고 `resultId`는 opaque 참조라고 정했다(REQ-B2CCONSULT-019). 03 설계는 `resultId`를 "참조용, 검증 불가 — 잔여 위험"으로 기록했다 | `spec.md:104`, `.moai/specs/SPEC-B2C-CONSULT-001/design.md:62` |
| CONSULT-001은 `visual:verify` 기존 15화면 정의·허용 오차(`TOLERANCE`)·02의 승인된 debt 4건의 수정을 금지한다(기록된 예외 하나가 있다). RESULT-001은 기존 화면 정의를 대체하지 않고 추가하는 방식만 허용한다 | `SPEC-B2C-CONSULT-001/spec.md:122`(REQ-B2CCONSULT-025), `SPEC-B2C-RESULT-001/spec.md:106`(REQ-B2CRESULT-025) |

### 1.5 AI·환경 자산

| 사실 | 근거 |
|---|---|
| `LLMProvider.generate`/`generateStructured`(zod 스키마 검증 포함) 인터페이스 | `lib/ai/provider.ts:34-37` (구조화 결과 `:24-32`) |
| `LLM_PROVIDER_MODE=deterministic`이면 결정론적 공급자를 반환한다 | `lib/ai/provider-factory.ts:29-33` (파일 `lib/ai/providers/deterministic.ts` 존재) |
| 공급자·모델별 RPM 예산 예시 값 4(예시 설정 값이며 실제 공급자 한도가 아니다) | `.env.local.example:72,75` |
| 무료 tier 한도와, 이를 막는 프로세스 로컬 스케줄러(여러 인스턴스 공유 아님) | `.moai/project/tech.md:47` |
| `lib/pipeline/`은 B2B `CaseInput`을 입력 계약으로 쓰고, B2C 경로가 import하지 않는다 | `lib/pipeline/types.ts:1`, 위 1.1의 import 검색 |
| Gemini SDK import 경계를 지키는 기존 테스트 | `lib/pipeline-gemini-boundary.test.ts:6-25` |
| 앱 부팅은 `LLM_PROVIDER_MODE !== "deterministic"`이면 `GEMINI_API_KEY`를 요구한다. 이 요구는 완료된 SPEC-RESEARCH-001의 REQ-RESEARCH-012의 구현이며 시험은 `lib/env.test.ts:94`(AC-RESEARCH-011b 면제 경로), `:105-107`(AC-RESEARCH-011a 필수 경로)이다 | `lib/env.ts:130-136`, `lib/env.test.ts:94-115`, `.moai/specs/SPEC-RESEARCH-001/spec.md:62`(`status: completed`) |
| `lib/ai/providers/deterministic.ts`의 `generateStructured`는 고정 후보(B2B 소견·반론 형태)와 프롬프트에서 뽑은 evidence id로 채운 후보를 요청 스키마로 `safeParse`해 처음 통과한 것을 돌려준다. 입력별로 달라지는 응답 표가 아니다. 새 분류 스키마에서 통과하는 후보가 있는지는 실행해 확인하지 않았다 | `lib/ai/providers/deterministic.ts:10-60` |
| 앱 부팅은 `CONSULT_POLICY_READY === "true"`일 때만 `RATE_LIMIT_HMAC_SECRET`을 요구한다 | `lib/env.ts:143-145` |
| `.github/workflows/deploy.yml`에는 `GEMINI`, `LLM_PROVIDER`, `DIAGNOSIS`, `ENABLE_` 문자열이 없다. 운영 환경 변수 주입 경로는 이 파일 밖이다 | 파일 검색 |
| placeholder smoke check는 `grep -q "서비스 준비 중입니다"`다 | `.github/workflows/deploy.yml:96-101` |

### 1.6 동의 · 법무 문구 상태

| 사실 | 근거 |
|---|---|
| 진단 동의 상세 6개 항목이 모두 `{…확정 문구}` placeholder다 | `components/diagnosis/consent-detail-content.tsx:13-18` |
| 이 placeholder들이 `ENABLE_DIAGNOSIS_FLOW=true`를 막는다고 기록돼 있다 | `.moai/specs/SPEC-B2C-DIAGNOSIS-001/plan.md:26` |
| 상담 동의 상세는 "문구는 아직 확정되지 않았습니다" 안내 문장이다 | `components/consult/consult-consent-group.tsx:66-70` |
| 02 면책 문구 현행 문장 | `components/result/result-disclaimer.tsx:19-22` |

### 1.7 e2e · 시험 환경

| 사실 | 근거 |
|---|---|
| Playwright 웹 서버는 `ENABLE_DIAGNOSIS_DEV_STATES=true`(및 상담 플래그)를 주입한다 | `playwright.config.ts:82-84` |
| e2e의 "결과 없음" 입력은 "무릎 골절로 수술을 받았어요"다. 현행 판정에서 fixture 문장과 달라서 result-none이 된다 | `e2e/diagnosis-flow-01.spec.ts:28-29,81` |
| 디자인은 담보 약 15개를 보이나 fixture는 7개이며, 이는 승인된 시각 debt다 | `.moai/specs/SPEC-B2C-RESULT-001/progress.md:440-452` 구간 |
| 02의 review 전용 fixture 경로(`?devFixture=fracture`)는 렌더링되는 mock 표기가 없다. `components/result/`와 `app/result/`에서 `mock\|목업\|데모\|검토용`을 검색하면 주석(`result-cta-bar.tsx`, `result-input-summary.tsx` 등의 디자인 대조 주석, `app/result/page.tsx:21`)과 시험 파일의 `vi.mock`뿐이다. `result-view.tsx`는 이 경로에서 표기 없이 fixture를 표시한다 | `components/result/*.tsx`, `app/result/page.tsx`, `components/result/result-view.tsx:82-87,153` (Grep 검색 결과) |
| `visual:verify`의 02 계열 캡처는 `?devFixture=fracture`로 진입하고 서버는 `ENABLE_DIAGNOSIS_DEV_STATES=true`로 시작한다 | `scripts/visual-verify.ts:333-338` 부근, `playwright.config.ts:82-84` |
| `mockJudge` 식별자는 비-테스트 소스 `components/diagnosis/step-loading.tsx:54,103`에 정의·사용되고, 주석에 `app/result/page.tsx:21`, `lib/diagnosis/fixtures/fracture-case.ts:6,12`가 등장한다. e2e 스펙 주석에도 있다 | 저장소 검색(`*.ts`, `*.tsx`) |

## 2. 미결정 이력

| 시점 | 문서 | 미결정 내용 |
|---|---|---|
| 2026-09-17 | `tech.md:108-136` | 정적 규칙 / 기존 AI provider(Gemini) / 혼합 중 매칭 방식을 의도적으로 미룸. 기존 AI 리서치 엔진 재활용 여부도 후속 SPEC으로 이관 |
| SPEC-B2C-FOUNDATION-001 | `design.md:136-140`, `:157-161`, `spec.md:57-59` | `lib/coverage/`는 "신규, 후속 SPEC". `lib/pipeline/` 삭제는 매칭 결정 이후에만. 결정 전 보존 요구(REQ-B2CFOUND-007) |
| SPEC-B2C-DIAGNOSIS-001 | `spec.md:103-104`, `plan.md:26,69` | 실제 엔진 연결과 `DIAGNOSIS_ENGINE_READY=true`는 후속 SPEC의 몫. 동의 상세 6개 문구는 법무 확정 전까지 출시 차단. 배포 smoke 교체는 플래그 전환 시점으로 이연 |
| SPEC-B2C-RESULT-001 | `spec.md:105`, Out of Scope | 매칭 엔진·Gemini 호출·`lib/pipeline` 재사용·신규 DB 저장·골절 외 담보 데이터는 모두 이 SPEC의 범위 밖으로 둠 |
| SPEC-B2C-CONSULT-001 | `design.md:62`, `lib/db/schema.ts:189-192` | `resultId`는 "검증 불가" opaque 참조로 두고 잔여 위험으로 기록 |

네 SPEC이 같은 결정을 차례로 뒤로 밀었고, 이 SPEC이 처음으로 그 결정을 수집·대안화하는 문서다.

## 3. "화면·상담 API 배포 완료"와 "일반 사용자 대상 서비스 출시 가능"의 구분

| 질문 | 현재 답 | 근거 |
|---|---|---|
| 01/02/03 화면과 상담 접수 API 코드가 `main`에 병합됐는가 | 예 | `git log`: `main@99993bf`(PR #22, 2026-10-02 13:58 +0900). 병합은 `db:migrate` → `build` → `pm2 restart` → smoke를 자동 실행한다(`SPEC-B2C-CONSULT-001/progress.md:4073`, Claim 123) |
| 운영의 현재 플래그 상태 | **미관측** | 마지막 관찰은 2026-10-02 병합 **이전**이다 — 가동 커밋 `f7ef4ec`, 플래그 5종(`ENABLE_CONSULT_FLOW`, `CONSULT_POLICY_READY`, `ENABLE_DIAGNOSIS_FLOW`, `DIAGNOSIS_ENGINE_READY`, `ENABLE_DIAGNOSIS_DEV_STATES`) 모두 미설정, 게이트 계산값 모두 `false`(`SPEC-B2C-CONSULT-001/progress.md:4081`, `:4153`의 읽기 전용 관측). 병합 뒤 배포가 성공했는지와 병합 뒤의 플래그 상태는 이 SPEC 작성 세션이 관찰하지 않았다 |
| 일반 사용자가 01 입력으로 진실한 02 결과를 받을 수 있는가 | 아니오 | 1.1: 02에 도달하는 경로는 review 플래그 + 고정 문장 + 하드코딩 표본뿐 |
| 일반 사용자가 입력하면 안전하게 "판단 불가"를 받는가 | 아니오 | 1.2: 모든 비-fixture 입력이 "목업" 표기가 붙은 결과 없음 화면으로 간다. 이는 실제 판단이 아니다 |
| 실제 상담이 실제 결과에 연결되는가 | 아니오 | 1.4: `resultId`가 서버에서 검증되지 않고, 결과 자체가 고정 표본이다 |

내부 시험 공개와 일반 사용자 공개의 판정 기준은 SPEC-B2C-LAUNCH-001이 정한다. 이 SPEC은 그 판정에 입력으로 들어갈 엔진 준비 증거(정확도 측정 기록, 지식 원천 확인 기록, 서명)를 만든다.

## 4. 미검증 항목

- 이 SPEC 작성 시점의 운영 서버 플래그·환경 변수 상태와 병합 뒤 배포의 성공 여부(마지막 관찰은 2026-10-02 병합 이전의 읽기 전용 관측이다 — `SPEC-B2C-CONSULT-001/progress.md:4081,4153`)
- 새 분류 스키마에서 `lib/ai/providers/deterministic.ts`가 응답을 만들 수 있는지(실행하지 않았다)
- `REQ-RESEARCH-012`가 보호하는 B2B 연구 경로가 지금 앱에서 `GEMINI_API_KEY`를 실제로 쓰는지(B2C 경로는 import하지 않는다는 검색 결과만 있다)
- 운영 서버에 `GEMINI_API_KEY`가 주입되어 있는지, 그 경로(`deploy.yml`에는 없음)
- Gemini 무료 tier의 실제 한도·데이터 보존 약관·학습 사용 여부(예시 설정 값 4는 실제 한도가 아님)
- 담보 지식 원천(약관·상품 데이터)을 누가 갖고 있는지, 라이선스, 갱신 주기
- 디자인 원본의 담보 약 15개 항목 목록(`.pen`은 이 plan-phase에서 열지 않음)
- 현재 저장소에 `pull_request` CI가 없다는 증거 팩 주장
- PM2 `restart`가 변경된 환경 변수를 다시 읽는지
- 클라이언트 번들에 fixture가 포함되는지의 실측(`result-view.tsx`와 `diagnosis-flow.tsx`가 fixture 모듈을 정적 import하므로 포함될 가능성이 높으나 빌드 산출물은 확인하지 않음)
