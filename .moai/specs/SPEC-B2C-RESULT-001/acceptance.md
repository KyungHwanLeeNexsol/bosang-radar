# Acceptance Criteria — SPEC-B2C-RESULT-001

Given-When-Then 형식. 각 AC는 대응하는 REQ를 인용한다.

## 데이터 계약 · 집계

**AC-B2CRESULT-001** (REQ-B2CRESULT-001)
Given `lib/diagnosis/types.ts`가 정의되어 있을 때
When `CoverageCategory` 타입을 검사하면
Then 정확히 4개 값(실손 의료비/정액 담보/후유장해/특별 보상에 대응하는 리터럴)만 허용하고, 5번째 값을 추가하면 타입 체크가 실패한다.

추가 시나리오 — 식별·버전 필드 검증:
Given `DiagnosisResult` 인스턴스가 생성되었을 때
When `resultId`·`schemaVersion` 필드를 검사하면
Then 둘 다 비어있지 않은 문자열이며, 서로 다른 두 번의 진단 실행에서 생성된 두 `DiagnosisResult`의 `resultId`는 서로 다르다.

추가 시나리오 — `inputSummary` 4-fact 독립 렌더링 · rawInput 재파싱 금지:
Given `DiagnosisResult.inputSummary`가 `{ title, when, where, mechanism, bodyPart }`(각 when/where/mechanism/bodyPart는 `{ label, value }`)로 주어졌을 때
When "입력하신 사고 내용" 카드를 렌더링하면
Then 4개 값이 각각 대응하는 필드에서 독립적으로 렌더링되며(라벨 톤과 값 톤이 분리 표시됨), `components/result/result-input-summary.tsx` 소스 코드 안에 `rawInput`을 정규식·문자열 분리 등으로 재파싱해 4개 값 중 하나라도 도출하는 로직이 존재하지 않는다(정적 검사).

추가 시나리오 — `priorityChecks` 구조체 렌더링 · 선택 시 이동:
Given `DiagnosisResult.priorityChecks`가 `{ id, title, description, targetCategory }` 구조의 항목 3개로 주어졌을 때
When "먼저 확인할 항목" 카드를 렌더링하면
Then 각 행이 `title`과 `description`을 함께 표시하며(문자열 하나가 아니라 두 필드가 별도로 렌더링됨), 그중 한 행을 선택하면 `targetCategory`가 가리키는 카테고리 섹션(Desktop) 또는 탭(Mobile)으로 이동한다(`design.md` §6).

추가 시나리오 — 배지 배열 데이터 계약 검증:
Given 서로 다른 `kind`(`"subscription-check"`/`"policy-type-check"`/`"facility-check"`/`"group-insurance-check"` 등)를 가진 `CoverageBadge` 항목들이 여러 `CoverageItem.badges`에 흩어져 주어졌을 때
When 각 카드를 렌더링하면
Then 모든 카드가 동일한 `badges: CoverageBadge[]` 배열 계약 하나로 렌더링되며, `multiMatch`/`subscriptionGenBadge` 같은 카드별 단일 목적 optional 필드에 의존하는 렌더링 분기가 소스 코드에 존재하지 않는다(정적 검사).

**AC-B2CRESULT-002** (REQ-B2CRESULT-002)
Given `computeAggregate(items)`가 5개 항목(검토 대상 2 · 추가 정보 필요 2 · 가능성 낮음 1)을 받았을 때
When 함수를 호출하면
Then `{ total: 5, review: 2, needsInfo: 2, lowLikelihood: 1 }`을 반환한다.

추가 시나리오 — 하드코딩 방지 검증:
Given 동일한 `computeAggregate`에 항목 1개를 추가한(6개) 고정 배열을 전달했을 때
When 두 호출 결과를 비교하면
Then `total`이 5에서 6으로, 그리고 추가한 항목의 상태에 대응하는 필드가 함께 바뀐다 — 숫자가 상수로 고정되어 있지 않음을 증명한다.

**AC-B2CRESULT-003** (REQ-B2CRESULT-003)
Given 뷰포트가 1440px(Desktop)일 때
When `/result` 페이지를 렌더링하면
Then 4개 카테고리 섹션이 모두 동시에 DOM에 표시된다.

추가 시나리오 — Mobile 뷰포트:
Given 뷰포트가 390px(Mobile)일 때
When `/result` 페이지를 렌더링하면
Then 실손 의료비 탭이 기본 선택 상태로 표시되고, 다른 3개 카테고리는 선택되기 전까지 표시되지 않는다.

**AC-B2CRESULT-004** (REQ-B2CRESULT-004)
Given 동일한 `DiagnosisResult` 데이터가 주어졌을 때
When Desktop 렌더링 결과와 Mobile 렌더링 결과(카테고리별로 순회)를 비교하면
Then 두 렌더링이 참조하는 담보 항목 집합이 완전히 동일하다(별도 fetch·가공 없음).

**AC-B2CRESULT-005** (REQ-B2CRESULT-005)
Given `DiagnosisResult.items`에 상태가 "가능성 낮음"인 항목이 포함되어 있을 때
When 결과 화면을 렌더링하면
Then 그 항목이 숨겨지지 않고 카드로 표시되며, `reasonNote` 텍스트가 함께 렌더링된다.

추가 시나리오 — 타입 수준 강제:
Given `CoverageItem` 타입 정의(status별 discriminated union)를 검사할 때
When status가 `"low-likelihood"`인 분기를 확인하면
Then `reasonNote` 필드가 선택(optional)이 아닌 필수 필드로 선언되어 있다(그 값 없이는 타입 체크를 통과할 수 없다) — status가 `"review"`/`"needs-info"`인 분기에서는 `reasonNote`가 선택 필드다.

추가 시나리오 — `benefit` 필드는 status와 무관하게 항상 필수:
Given `DiagnosisResult.items` 중 status가 `"low-likelihood"`인 항목("5대 골절 진단비" 등)이 있을 때
When 그 항목의 `benefit` 필드를 검사하면
Then `benefit`이 `undefined`가 아니라 항상 존재하며, `benefit.kind`가 `"unavailable"` 또는 `"conditional"`로 "산정 시도 자체를 하지 않음"/"확인 전 판단 불가"를 표현한다 — 옛 설계의 `amount?: CoverageAmount`처럼 status별로 필드 자체가 생략되는 optional 패턴은 타입 정의에 존재하지 않는다(`CoverageItemBase`가 `benefit`을 공통 필수 필드로 선언).

**AC-B2CRESULT-006** (REQ-B2CRESULT-006)
Given `CoverageItem.benefit`이 `{ kind: "range", label: "일반적인 가입금액 예시", min: 300000, max: 500000, displayText: "30만~50만원" }`로 주어졌을 때
When 카드를 렌더링하면
Then 화면에 표시되는 문자열이 `displayText` 값과 정확히 일치하며(단위 변환 없음), 코드 내 어떤 산술 연산도 `min`/`max`/`displayText` 값을 변경하지 않는다(소스 코드 정적 검사: 렌더 경로의 `benefit` 값 필드에 `+`/`*` 등 산술 연산자가 적용되지 않음).

추가 시나리오 — `benefit.label`과 `benefit.displayText` 동시 렌더링:
Given `CoverageItem.benefit`이 `{ kind: "formula", label: "보장 방식", displayText: "가입금액 × 장해지급률" }`로 주어졌을 때
When 카드를 렌더링하면
Then `label`("보장 방식")과 `displayText`("가입금액 × 장해지급률")가 화면에 각각 대응하는 위치(라벨 행 / 값 행)에 함께 표시되며, 어느 한쪽만 렌더링되거나 두 값이 하나의 문자열로 합쳐져 렌더링되지 않는다.

추가 시나리오 — `BenefitDisplay` 5분기 discriminated union의 타입/스키마 수준 강제:
Given `BenefitDisplay` 타입 정의(`kind: "range" | "fixed" | "formula" | "conditional" | "unavailable"`로 판별되는 discriminated union)와 그 런타임 파싱에 쓰이는 zod 스키마를 검사할 때
When `kind: "range"`이면서 `min`/`max`가 없는 객체, 또는 `kind: "formula"`이면서 `min`/`max`가 존재하는 객체를 각각 타입 체크·zod `safeParse`에 통과시키면
Then 타입 체크는 컴파일 시점에 실패하고, zod `safeParse`는 런타임에 `success: false`를 반환한다 — 유효하지 않은 kind-필드 조합이 타입 레벨과 스키마 레벨 양쪽에서 거부된다.

추가 시나리오 — 하드코딩 문구 금지 검증:
Given `components/result/` 하위 컴포넌트 소스 파일 전체를 검사할 때
When 카테고리 설명·whyCheck·배지 라벨(`CoverageBadge.label`)·보장 방식 문구(`benefit.label`/`benefit.displayText`)·확인 우선순위 문구(`PriorityCheck.title`/`description`) 등 동적 문구에 해당하는 리터럴 한글 문자열 패턴을 찾으면
Then 그 문구는 `DiagnosisResult` 페이로드 필드 참조이거나 `lib/diagnosis/` 공용 상수 모듈 참조이며, 특정 케이스 전용 리터럴로 컴포넌트에 직접 하드코딩되어 있지 않다.

## Fact Chip

**AC-B2CRESULT-007** (REQ-B2CRESULT-007)
Given 01-B 질문 "수술 여부"에 대한 응답이 `answers`에 존재하고, 대응하는 담보 카드에 그 질문 ID가 매핑되어 있을 때
When 카드를 렌더링하면
Then 그 응답 값을 담은 Fact Chip이 카드 위에 표시된다.

**AC-B2CRESULT-008** (REQ-B2CRESULT-008)
Given 특정 질문에 대한 응답이 `answers`에 없을 때(건너뛰기)
When 카드를 렌더링하면
Then 그 질문에 대응하는 Fact Chip이 생성되지 않는다(DOM에 부재).

## 01→02 연결 — review 전용 fixture

**AC-B2CRESULT-009** (REQ-B2CRESULT-009)
Given `productionReady=false AND reviewEnabled=false`(프로덕션 기본값 조합)일 때
When 정확히 `FRACTURE_FIXTURE_INPUT` 문자열을 입력하고 진단 플로우를 완주해도
Then `<DiagnosisFlow />` 자체가 마운트되지 않으므로(`productionReady || reviewEnabled` 게이트) 이 fixture 분기에 도달할 수 없다.

추가 시나리오 — `productionReady=true` 단독 조합(defense-in-depth):
Given `productionReady=true AND reviewEnabled=false`일 때(즉 `<DiagnosisFlow />`는 마운트되지만 review 플래그는 꺼진 상태)
When 정확히 `FRACTURE_FIXTURE_INPUT` 문자열을 입력하고 진단 플로우를 완주하면
Then `mockJudge`(또는 그 호출부)가 전달받은 명시적 `reviewEnabled` boolean 인자가 `false`이므로 fixture 분기가 실행되지 않고, 기존 `result-none`/`error` 판정 로직만 적용된다.

추가 시나리오 — 직접 진입 파라미터 무시:
Given `reviewEnabled=false`일 때
When `/result?devFixture=fracture`로 직접 접근하면
Then `devFixture` 파라미터가 동일한 boolean 게이트에 의해 무시되고(§9 재사용), `sessionStorage`에 유효한 handoff가 없으므로 02 전용 "결과 없음" 상태(AC-B2CRESULT-013)가 표시된다.

**AC-B2CRESULT-010** (REQ-B2CRESULT-010)
Given `ENABLE_DIAGNOSIS_DEV_STATES=true`인 review 환경에서 입력값이 정확히 `FRACTURE_FIXTURE_INPUT`일 때
When 동의 → 추가 질문(응답 포함) → 진단 중 단계를 완주하면
Then `sessionStorage`에 `buildFractureResult(rawInput, answers)`로 구성된 완전한 `DiagnosisResult`(`items`·`resultId`·`schemaVersion`·`generatedAt` 포함)가 기록되고, 브라우저가 `/result`로 이동한다.

**AC-B2CRESULT-011** (REQ-B2CRESULT-011)
Given `ENABLE_DIAGNOSIS_DEV_STATES=true`일 때
When 입력값이 정확히 "무릎 골절로 수술을 받았어요"(`e2e/diagnosis-flow-01.spec.ts`의 `RESULT_NONE_INPUT`, `FRACTURE_FIXTURE_INPUT`과 다른 문자열)이면
Then 기존과 동일하게 `result-none` 상태로 전이하며 `/result`로 이동하지 않는다.

추가 시나리오 — error 상태 분기:
Given `ENABLE_DIAGNOSIS_DEV_STATES=true`일 때
When 입력값이 정확히 "분석 중 오류가 발생했어요"(`ERROR_INPUT`)이면
Then 기존과 동일하게 `error` 상태로 전이한다.

**AC-B2CRESULT-012** (REQ-B2CRESULT-012)
Given `app/page.tsx`와 `app/result/page.tsx` 소스 코드가 존재할 때
When 두 파일을 정적으로 검사하면
Then `productionReady`/`reviewEnabled`/`shouldRenderDiagnosis` 계산 로직이 `lib/diagnosis/flags.ts`의 단일 함수 호출로만 나타나며, 각 파일 안에 그 계산식이 인라인으로 중복 작성되어 있지 않다.

## 02 전용 상태 계약

**AC-B2CRESULT-013** (REQ-B2CRESULT-013)
Given `sessionStorage`에 handoff 데이터가 없는 상태에서
When 사용자가 `/result`에 직접 접근하면
Then 02 전용 "결과 없음" 안내와 01 입력 화면으로 돌아가는 CTA가 표시되며, 01의 `result-none`(01-D) 문구와는 다른 문구를 사용한다.

추가 시나리오 — 새로고침·뒤로가기 후 재현:
Given 정상적으로 `/result`에 도착해 결과가 표시된 상태에서
When 페이지를 새로고침하거나 브라우저 뒤로가기 후 다시 `/result`로 진입하면
Then `sessionStorage`의 handoff 데이터가 여전히 존재하므로 동일한 `DiagnosisResult`(동일 `resultId`)가 다시 표시된다 — 02 전용 "결과 없음" 상태로 전환되지 않는다.

**AC-B2CRESULT-014** (REQ-B2CRESULT-014)
Given `sessionStorage`의 handoff 값이 유효하지 않은 JSON일 때
When `/result`가 마운트되면
Then 콘솔 예외로 애플리케이션이 중단되지 않고 02 전용 오류 상태가 표시된다.

추가 시나리오 — 구문은 유효하나 스키마와 불일치하는 JSON:
Given `sessionStorage`의 handoff 값이 구문적으로는 유효한 JSON이지만(`JSON.parse` 성공) `DiagnosisResultSchema`(`design.md` §1b)의 필수 필드가 누락되었거나 타입이 맞지 않아 `safeParse`가 `success: false`를 반환할 때
When `/result`가 마운트되면
Then `readDiagnosisHandoff()`가 `{ status: "invalid", reason }`을 반환하고(`design.md` §3), 그 값이 `sessionStorage`에서 그대로 유지된 채(제거되지 않음) 02 전용 오류 상태가 표시된다 — `{ status: "empty" }`(핸드오프 데이터 부재, AC-B2CRESULT-013)로 오인되어 02 전용 "결과 없음" 상태로 잘못 전환되지 않는다.

**AC-B2CRESULT-015** (REQ-B2CRESULT-015)
Given `/result`가 클라이언트 데이터 읽기를 아직 완료하지 않았을 때
When 초기 렌더가 일어나면
Then `<Suspense fallback>`으로 지정된 스켈레톤이 표시되고, `<nextjs-portal>` 등 개발 서버 전용 DOM 없이 프로덕션 빌드에서 정상 동작한다.

## 저장 정책

**AC-B2CRESULT-016** (REQ-B2CRESULT-016)
Given `/result`가 handoff를 성공적으로 읽어 결과를 표시했을 때
When 읽기 직후의 `sessionStorage` 상태를 검사하면
Then 해당 키가 그대로 유지되어 있다(읽기만으로는 제거되지 않는다).

추가 시나리오 — 명시적 초기화 트리거:
Given `/result`에 결과가 표시된 상태에서
When 사용자가 01 입력 화면으로 돌아가 새 진단을 시작하면(신규 입력 제출)
Then 이전 `sessionStorage` handoff 데이터가 제거되고, 새 진단 완료 시 새로운 `resultId`를 가진 데이터로 교체된다. (상담 신청 완료 시 초기화 트리거는 03 SPEC 범위이며, 이 SPEC은 `clearDiagnosisHandoff()` 호출 지점만 예약한다.)

**AC-B2CRESULT-017** (REQ-B2CRESULT-017)
Given `lib/diagnosis/handoff.ts`의 `sessionStorage` 키 상수를 검사할 때
When 다른 기존 키 사용처(코드베이스 전체 grep)와 비교하면
Then 프로젝트 네임스페이스가 붙은 전용 키이며 다른 기능과 충돌하지 않는다.

## 반응형

**AC-B2CRESULT-018** (REQ-B2CRESULT-018)
Given 뷰포트 폭이 767px와 768px 각각일 때
When `/result`를 렌더링하면
Then 767px는 Mobile 탭 레이아웃, 768px는 Desktop 전체 펼침 레이아웃이 적용된다(SPEC-B2C-DIAGNOSIS-001과 동일한 분기점).

## 접근성

**AC-B2CRESULT-019** (REQ-B2CRESULT-019)
Given Mobile 뷰포트에서 카테고리 탭 그룹이 렌더링되었을 때
When 접근성 트리를 검사하면
Then 탭 컨테이너가 `tablist` 역할을, 각 탭이 `tab` 역할과 `aria-selected` 상태를, 콘텐츠 영역이 `tabpanel` 역할을 갖는다.

**AC-B2CRESULT-020** (REQ-B2CRESULT-020)
Given 담보 카드의 상태 pill이 렌더링되었을 때
When 그 요소의 텍스트 콘텐츠를 읽으면
Then "검토 대상"/"추가 정보 필요"/"가능성 낮음" 중 하나의 텍스트가 항상 존재한다(색상에만 의존하지 않음).

**AC-B2CRESULT-021** (REQ-B2CRESULT-021)
Given Mobile에서 "정액 담보" 탭을 클릭했을 때
When 포커스 대상을 확인하면
Then 포커스가 전환된 패널의 제목(카테고리 헤더) 요소로 이동해 있다.

## 금지 사항

**AC-B2CRESULT-022** (REQ-B2CRESULT-022)
Given 이 SPEC이 작성한 모든 UI 문구 소스 파일을 검사할 때
When "받으실 수 있습니다" 등 단정형 확정 문구 패턴을 검색하면
Then 매칭 결과가 0건이다.

**AC-B2CRESULT-023** (REQ-B2CRESULT-023)
Given 02/M02 화면의 상담 CTA 버튼(`aria-disabled="true"`)을 클릭했을 때
When 브라우저 네비게이션을 관찰하면
Then 실제 페이지 이동이 발생하지 않으며 "준비 중" 안내가 표시된다.

추가 시나리오 — 키보드 조작성:
Given 상담 CTA 버튼이 렌더링되었을 때
When `Tab` 키로 포커스를 이동하면
Then 버튼이 포커스를 받으며(tabindex로 배제되지 않음), `Enter` 또는 `Space`로 활성화하면 클릭과 동일하게 페이지 이동 없이 "준비 중" 안내만 표시된다.

추가 시나리오 — 스크린리더 시맨틱:
Given 상담 CTA 버튼의 접근성 트리를 검사할 때
When `aria-disabled` 속성과 접근 가능한 이름을 확인하면
Then `aria-disabled="true"`가 노출되고, "준비 중" 상태가 스크린리더에 인지 가능한 텍스트(`aria-live` 안내 또는 접근 가능한 이름/설명)로 전달된다.

**AC-B2CRESULT-024** (REQ-B2CRESULT-024)
Given 이 SPEC이 전달하는 전체 코드 diff를 검사할 때
When `DIAGNOSIS_ENGINE_READY`를 `true`로 대입하는 코드 지점을 검색하면
Then 매칭 결과가 0건이다.

**AC-B2CRESULT-025** (REQ-B2CRESULT-025)
Given `pnpm visual:verify`를 이 SPEC의 run-phase 구현 완료 후 전체 실행할 때
When 결과를 확인하면
Then SPEC-B2C-DIAGNOSIS-001의 기존 10화면이 여전히 PASS하고, 이 SPEC이 추가한 5화면(02/M02/M02-B/M02-C/M02-D)도 PASS한다(총 15화면).

## Quality Gate 기준

- **프로덕션 빌드 검증**: `next build`(또는 `package.json`이 정의한 동등 빌드 스크립트)가 `/result` 라우트를 포함해 오류·경고 없이 성공해야 한다.
- **커버리지**: 신규 `lib/diagnosis/`, `components/result/` 대상 85% 이상(TRUST 5 Tested 기준, `moai-constitution.md`).
- **회귀 게이트**: `e2e/diagnosis-flow-01.spec.ts`와 기존 `pnpm visual:verify` 10화면이 이 SPEC의 run-phase 완료 후에도 계속 PASS해야 한다(AC-B2CRESULT-011/011b/025의 상위 조건).
