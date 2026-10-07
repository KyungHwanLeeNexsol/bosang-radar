# Acceptance Criteria — SPEC-B2C-ENGINE-001

Given-When-Then 형식이며 각 AC는 대응하는 REQ를 인용한다. 이 문서는 검증 계층이고, GEARS 요구사항은 `spec.md`에 있다.

각 AC에는 네 항목을 붙였다.

- **검증**: 실행 방법. 이미 존재하는 명령(`pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm lint`, `pnpm visual:verify`, `pnpm verify:flag-runtime`)은 `package.json`에서 확인했다. 그 외 명령·파일명은 run-phase에서 확정될 **후보**다.
- **통과 판정**: 통과와 실패를 가르는 한 줄. 수치 기준은 이 문서에 쓰지 않으며 D-ENGINE-09의 서명 기록이 정한다.
- **선결**: AC가 의존하는 결정·산출물. **선결이 충족되지 않은 동안 AC는 BLOCKED이며 통과로 계산하지 않는다.** BLOCKED는 실패도 통과도 아니다.
- **서명**: 사람(도메인 전문가·법무·제품 책임자)의 확인이 필요한 AC의 역할.

## 계약 · 결과 분류 · 표현

**AC-B2CENGINE-001** (REQ-B2CENGINE-001)
Given 정답 집합의 모든 입력으로 엔진을 호출했을 때
When `determined` 결과의 `DiagnosisResult`를 `DiagnosisResultSchema.safeParse`에 통과시키면
Then 모두 `success: true`이고, 기존 4개 카테고리·3개 상태 밖의 값이 없으며, 기존 필드가 삭제·의미 변경되지 않았다.
검증: `pnpm test`(후보 `lib/coverage/*.test.ts`) | 통과 판정: 정답 집합의 `determined` 출력 전부가 `success: true`이고 기존 `lib/diagnosis/schema.test.ts`가 변경 없이 통과한다 | 선결: 정답 집합(D-ENGINE-02/03) | 서명: 불필요

**AC-B2CENGINE-002** (REQ-B2CENGINE-002)
Given 엔진 호출 결과 타입이 `determined | cannot-determine | error`로 정의되어 있을 때
When 소비자가 세 결과를 처리하는 `switch`를 컴파일하고, 한 분기를 제거하거나 네 번째 값을 추가하면
Then 타입 검사가 실패하며, 세 결과가 서로 구별 가능한 필드(`kind` 등)를 가진다.
검증: 타입 검사(후보 `tsc --noEmit`)와 `pnpm test` | 통과 판정: 분기 제거와 값 추가 두 변형 모두 타입 검사가 실패하고 원본은 통과한다 | 선결: 없음 | 서명: 불필요

**AC-B2CENGINE-003** (REQ-B2CENGINE-003)
Given 정답 집합 전체의 엔진 출력에서 사용자 노출 문자열(`whyCheck`, `description`, `reasonNote`, `additionalInfoNote`, `benefit.displayText`, 질문 문구)을 수집했을 때
When 법무가 확정한 금지 표현 목록으로 검사하면 — 목록은 최소한 REQ-B2CRESULT-022가 예로 든 "받으실 수 있습니다"를 포함한다(`components/result/result-disclaimer.tsx:9`의 원칙)
Then 일치가 0건이다.
검증: `pnpm test` | 통과 판정: 금지 표현 목록과의 일치 0건 | 선결: 법무가 확정한 금지 표현 목록 — 목록이 없는 동안 BLOCKED(예시 문구 하나에 대한 일치 0건 검사는 선행 실행할 수 있으나 통과로 계산하지 않는다) | 서명: **법무**(금지 표현 목록)

**AC-B2CENGINE-004** (REQ-B2CENGINE-004)
Given 판정 근거 데이터와 엔진 출력의 모든 `benefit` 값 중 `range`·`fixed`로 표현되는 수치가 있을 때
When 각 수치의 근거 식별자·근거 데이터 버전 필드를 검사하면
Then 근거가 없는 수치는 `benefit.kind`가 `conditional` 또는 `unavailable`이며, 엔진 출력에서도 근거 없는 `range`·`fixed`가 0건이다.
검증: `pnpm test` | 통과 판정: 근거 식별자 또는 근거 데이터 버전이 비어 있는 `range`·`fixed` 0건 | 선결: 판정 근거 데이터(D-ENGINE-02), 정답 집합 | 서명: 도메인 전문가(수치 출처 확인)

## 입력 이해 · 판정 · 불확실성

**AC-B2CENGINE-005** (REQ-B2CENGINE-005)
시나리오 1 — 고정 변형 목록(이진 판정).
Given 도메인 전문가가 소유하는 고정 변형 목록이 있고(각 항목은 입력과 기대 분류 — 최초 공개 범위의 진단 대상 유형 또는 `cannot-determine` — 를 가진다. 목록은 고정 표본 문장 "3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요" 자체와 그 앞뒤 공백·어순·조사 변형을 포함한다)
When 각 항목의 입력을 엔진에 넣으면
Then 모든 항목에서 실제 분류가 그 항목의 기대 분류와 같다. 어느 항목도 "고정 표본 문장과 문자열이 같은지"로 갈리지 않는다.
시나리오 2 — 목록 밖 변형의 분류 정확도(측정 판정).
Given 목록 밖 변형 집합(도메인 전문가 지정)에 대한 분류 정확도 측정값이 있을 때
When 그 값을 D-ENGINE-09 서명 기록의 기준값과 비교하면
Then 측정값이 D-ENGINE-09가 정한 기준값을 충족하면 통과다. D-ENGINE-09가 결정되기 전에는 이 시나리오는 BLOCKED이며 통과로 계산하지 않는다(이 문서는 기준값을 정하지 않는다).
검증: `pnpm test`(정답 집합 분류 케이스) | 통과 판정: 시나리오 1은 목록 전 항목 일치, 시나리오 2는 기준값 충족 | 선결: 시나리오 1은 변형 목록(D-ENGINE-03 범위), 시나리오 2는 D-ENGINE-09 | 서명: 도메인 전문가(변형 목록), 제품 책임자(기준값)

**AC-B2CENGINE-006** (REQ-B2CENGINE-006)
Given 범위 안 진단 대상 유형과 특정 답변 조합, 그리고 판정 근거 버전 V가 있을 때
When 엔진이 판정하면
Then 각 `CoverageItem`에 근거 식별자와 근거 버전이 귀속되어 있다. 근거가 규칙 데이터인 구성에서는 status·benefit·badges·whyCheck가 버전 V의 규칙이 선언한 값과 같다(표 기반 테스트). 근거가 모델 판정인 구성에서는 값 일치를 검증할 수 없으므로 귀속(식별자·버전 기록)만 검증하고 값의 정확도는 AC-B2CENGINE-022의 측정으로 본다.
검증: `pnpm test` | 통과 판정: 모든 항목에 비어 있지 않은 근거 식별자·근거 버전이 있고, 규칙 데이터 구성에서는 선언 값과 전부 일치 | 선결: D-ENGINE-01(근거의 종류), D-ENGINE-02, D-ENGINE-03 | 서명: **도메인 전문가**(규칙 데이터 검수)

**AC-B2CENGINE-007** (REQ-B2CENGINE-007)
Given 판정 근거가 특정 답변을 요구하는 항목에 대해 해당 질문이 건너뛰기로 비어 있고, 다른 항목은 판정 근거상 가능성이 낮을 때
When 엔진이 판정하면
Then 비어 있는 항목은 `needs-info`이고, 가능성이 낮은 항목은 `low-likelihood`와 비어 있지 않은 `reasonNote`를 가지며, 판정 근거가 없는 항목이 `review`로 나오는 경우가 0건이다.
검증: `pnpm test` | 통과 판정: 위 세 조건 전부 충족, 근거 없는 `review` 0건 | 선결: D-ENGINE-02, D-ENGINE-03 | 서명: 도메인 전문가

**AC-B2CENGINE-008** (REQ-B2CENGINE-008) — 부정 AC
Given 최초 공개 범위가 D-ENGINE-03에서 정해졌고, 범위 밖 입력(예: "허리 디스크로 병원 다녔어요"가 범위 밖인 경우)과 분류 불가 입력(의미 없는 문자열, 이모지·특수문자만)이 있을 때
When 각 입력을 엔진에 넣으면
Then 결과는 `cannot-determine`이고 `CoverageItem`이 0개이며, 출력 어디에도 골절 fixture 항목 id(`item-fixed-5-fracture` 등)나 다른 진단 대상 유형 담보 내용이 없다.
검증: `pnpm test`, `pnpm test:e2e`(후보 `e2e/diagnosis-flow-01.spec.ts`) | 통과 판정: 모든 입력에서 `cannot-determine`·항목 0개·fixture id 0건 | 선결: D-ENGINE-03, 범위 밖 입력 목록 | 서명: 제품 책임자(범위 확인)

**AC-B2CENGINE-009** (REQ-B2CENGINE-009)
Given D-ENGINE-11이 (c) 또는 (d)로 확정된 구성에서
When 범위 안 입력과 분류 불가 입력을 각각 넣어 01-B에 도달하면
Then 범위 안 입력은 해당 진단 대상 유형에 정의된 질문을 보이고, 분류 불가 입력은 일반 질문 세트를 보이며, 일반 질문 세트의 문구에 진단 대상 유형 특정 표현(예: "무릎", "골절")이 없다. "진단 대상 유형 특정 표현"의 전체 목록은 도메인 전문가가 D-ENGINE-03 범위(최초 공개 6개 진단 대상 유형)를 기준으로 정하는 고정 목록이다(AC-B2CENGINE-005 시나리오 1의 고정 변형 목록과 같은 방식) — "무릎", "골절"은 그 목록의 예시 두 건일 뿐이며, 통과 판정은 그 고정 목록 전체와의 일치로 한다(목록이 없는 동안 이 조건은 BLOCKED).
검증: `pnpm test`, `pnpm test:e2e` | 통과 판정: 위 세 조건 충족 | 선결: **D-ENGINE-11이 (c) 또는 (d)** — (a)·(b)로 확정되면 이 AC는 적용되지 않고, 미결정인 동안 BLOCKED. 도메인 전문가의 고정 표현 목록이 없는 동안 일반 질문 세트 조건만 추가로 BLOCKED | 서명: 도메인 전문가(질문 세트, 고정 표현 목록)

## 판정 근거 데이터 관리

**AC-B2CENGINE-010** (REQ-B2CENGINE-010)
Given 판정 근거 데이터를 사용하는 구성에서 데이터 파일이 변경되었고 버전이 증가하지 않았거나 확인 기록이 없을 때
When CI의 검사가 실행되면
Then 검사가 실패한다.
검증: `pnpm test`(후보 `lib/coverage/knowledge-schema.test.ts`) | 통과 판정: 버전 미증가 변경과 확인 기록 없는 변경 둘 다 검사 실패, 버전 증가와 확인 기록이 모두 있는 변경은 통과 | 선결: D-ENGINE-02 | 서명: **도메인 전문가**(확인 기록)

## 실행 경계 · fixture · 실패

**AC-B2CENGINE-011** (REQ-B2CENGINE-011)
Given 01 진단 중 단계의 엔진 호출 지점을 `determined`·`cannot-determine`·`error`를 각각 돌려주는 시험용 대역으로 바꾼 구성에서
When 입력 문자열을 바꿔 가며(고정 표본 문장, "오류"가 들어간 문장, 일반 문장) 진단 중 단계를 실행하면
Then 전이는 입력 문자열과 무관하게 대역이 돌려준 결과로만 정해진다 — `determined`는 결과 있음, `cannot-determine`은 결과 없음, `error`는 오류.
검증: `pnpm test`(후보 `components/diagnosis/step-loading.test.tsx`) | 통과 판정: 3개 결과 × 3개 입력 = 9개 조합이 모두 기대 전이와 일치 | 선결: 없음 | 서명: 불필요

**AC-B2CENGINE-012** (REQ-B2CENGINE-012) — 부정 AC
시나리오 1 — fixture 도달 불가(항상 적용).
Given `productionReady=true`이고 `reviewEnabled=false`인 게이트 상태이고, fixture 모듈의 결과 생성 함수(현재 `buildFractureResult`, `lib/diagnosis/fixtures/fracture-case.ts:209`)에 호출 기록 스파이를 걸고 엔진 호출 지점(REQ-B2CENGINE-011)에는 호출 기록을 남기는 시험용 대역을 걸었을 때
When 고정 표본 문장을 입력해 01 진단 중 단계를 실행하고, 별도로 `?devFixture=fracture`로 `/result`에 접근하면
Then 두 경로 모두에서 fixture 결과 생성 함수의 호출 횟수가 0이다. 01 경로에서 화면에 도달한 결과가 있다면 그 결과는 엔진 호출 지점 대역이 돌려준 값과 같다(대역이 `cannot-determine`·`error`를 돌려준 경우에는 그에 대응하는 01-D·01-E다). `/result` 경로는 결과 없음 상태이며 fixture 항목을 표시하지 않는다. 판정은 항목 id나 `resultId` 문자열 패턴이 아니라 호출 기록으로 한다.
시나리오 2 — 번들 검색(조건부).
Given `design.md` §9.1에서 빌드 시 제외((c))가 선택되었고 프로덕션용과 review용 빌드를 따로 만들었을 때(플래그가 요청마다 읽히므로 — `app/page.tsx:49`, `app/result/page.tsx:38`의 `force-dynamic` — 빌드 하나로는 둘을 동시에 만족시킬 수 없다)
When 프로덕션용 빌드 산출물(`.next/static`)에서 fixture 식별자(`item-fixed-5-fracture`, `fracture-` 접두 `resultId` 생성 코드)를 검색하면
Then 일치가 0건이다. (a)·(b)가 선택되면 이 시나리오는 적용되지 않으며, 시나리오 1이 도달 불가의 유일한 증거다.
시나리오 3 — 목업 표기.
Given 엔진이 산출한 `cannot-determine`·`error`와, `devStep` 강제 렌더링으로 만든 01-D·01-E가 있을 때
When 두 경우의 01-D·01-E를 렌더링하면
Then 엔진 산출 결과에는 "데모/검토용 목업" 표기(`step-result-none.tsx:104-106`, `step-error.tsx:81`)가 렌더링되지 않고, `devStep` 강제 렌더링에는 렌더링된다. 02의 review 전용 fixture 경로(`?devFixture=fracture`)의 표기는 이 AC가 단언하지 않는다(N8).
검증: `pnpm test`, `pnpm test:e2e`, 시나리오 2는 `pnpm build` 후 산출물 검색 | 통과 판정: 시나리오 1·3은 위 Then 전부, 시나리오 2는 일치 0건 | 선결: 시나리오 2는 §9.1 결정과 N8, 시나리오 3은 없음 | 서명: 불필요

**AC-B2CENGINE-013** (REQ-B2CENGINE-013)
Given 프로덕션 빌드 산출물이 있을 때
When `.next/static` 안에서 외부 AI 키 환경 변수 이름·값 패턴과 D-ENGINE-02가 비공개로 분류한 데이터의 고유 문자열을 검색하면
Then 일치가 0건이다.
검증: `pnpm build` 후 산출물 검색 | 통과 판정: 키 패턴과 비공개 데이터 고유 문자열 모두 0건 | 선결: D-ENGINE-02의 공개·비공개 분류 목록 — 목록이 없는 동안 데이터 검색은 BLOCKED(키 패턴 검색만 실행 가능) | 서명: 법무 또는 데이터 소유자(비공개 분류 목록)

**AC-B2CENGINE-014** (REQ-B2CENGINE-014)
Given REQ-B2CENGINE-025의 시험 구성에서 엔진 호출을 시간 초과·공급자 429·형식 오류가 나도록 만든 결정론적 실패 모드에서
When 사용자가 진단을 진행하면
Then 01-E가 표시되고 입력이 보존되며(REQ-B2CDIAG-014의 재시도·입력 복귀 경로), `sessionStorage` handoff에 결과가 기록되지 않고, fixture나 근거 없는 기본 결과가 표시되지 않는다.
검증: `pnpm test`, `pnpm test:e2e` | 통과 판정: 세 실패 모드 모두 위 Then 충족 | 선결: REQ-B2CENGINE-025의 시험 구성 | 서명: 불필요

## 결과 식별 · 영속성

**AC-B2CENGINE-015** (REQ-B2CENGINE-015)
시나리오 1 — 발급·변조 검증.
Given D-ENGINE-05가 (b)·(c)·(d) 중 하나로 확정되었고, 엔진이 발급한 `resultId`, 발급되지 않은 임의 문자열, 변조된 값이 있을 때
When 각각으로 상담 신청을 POST하면
Then 발급된 값만 접수되고 나머지 둘은 검증 실패로 접수되지 않으며(기존 `validation` 계열 오류 응답 형식 유지), `consultations` 테이블에 행이 생기지 않는다.
시나리오 2 — 만료(조건부).
Given D-ENGINE-05가 만료를 포함하는 방식으로 확정되었고 N1의 REQ-B2CCONSULT-009 amendment가 끝났을 때
When 만료된 `resultId`로 상담 신청을 POST하면
Then 접수되지 않고 행이 생기지 않는다.
시나리오 3 — 서명 비밀 부재(D-ENGINE-05 (b) 한정, 조건부).
Given D-ENGINE-05가 (b)로 확정되었고 서명 비밀이 설정되지 않았거나 빈 값인 환경에서, 선택된 서명 방식으로 빈 값을 키로 만든 `resultId` 후보가 있을 때
When 엔진이 `resultId` 발급을 시도하고 그 후보로 상담 신청을 POST하면
Then 발급은 `resultId`를 만들지 않는 실패 결과로 끝나고, 후보는 검증 실패로 접수되지 않으며 `consultations` 테이블에 행이 생기지 않는다.
검증: `pnpm test`(후보 `app/api/consultations/route.test.ts`) | 통과 판정: 시나리오 1은 발급 값 접수·나머지 거부·행 0, 시나리오 2는 거부·행 0, 시나리오 3은 발급 실패·후보 거부·행 0 | 선결: D-ENGINE-05, N1 — (a)가 확정되면 이 AC는 적용되지 않고, 미결정인 동안 BLOCKED. D-ENGINE-05는 (b)(무저장+서명 토큰)로 결정되어 시나리오 1·3은 적용되나, **만료 유무(하위 선택 b-1 무만료/b-2 유만료)는 이 SPEC에서 아직 결정되지 않았다** — 시나리오 2는 그 하위 선택이 b-2 또는 (c)·(d)의 만료 정책으로 확정되고 N1의 REQ-B2CCONSULT-009 amendment가 끝나야 적용되며, 그전까지는 전체 D-ENGINE-05가 "결정됨"이라는 사실과 무관하게 시나리오 2만 계속 BLOCKED다(이 BLOCKED를 "D-ENGINE-05 결정 완료"로 해소된 것처럼 읽지 않는다). 시나리오 3은 (b)가 확정되어야 한다(확정됨) | 서명: 법무(만료 정책, D-ENGINE-05)

**AC-B2CENGINE-016** (REQ-B2CENGINE-016) — 부정 AC
Given 카나리 문자열이 들어 있는 자유 문장과 답변으로 엔진을 호출하기 전후에
When 모든 DB 테이블의 행과, 시험이 엔진 호출의 쓰기 가능 위치로 지정한 디렉터리(임시 디렉터리와 로그 디렉터리 포함)의 파일 내용을 비교하면
Then 카나리 문자열이 어디에도 저장되지 않았다. D-ENGINE-05가 보존 기간과 삭제 절차를 포함해 저장을 허용한 경우에는 그 허용 범위의 저장만 인정하며, 그 경우 보존 기간과 삭제 절차가 문서와 코드에 존재한다.
검증: `pnpm test`(DB 비교) | 통과 판정: 허용 전 기본 상태에서 카나리 문자열 저장 0건 | 선결: 없음(저장 금지가 기본) | 서명: **법무**

## 개인정보 · 외부 AI · 남용 방지

**AC-B2CENGINE-017** (REQ-B2CENGINE-017)
Given 서버 경계 뒤의 엔진이 있을 때
When 클라이언트 검증을 우회해 201자 입력, 휴대전화번호 형식, 주민등록번호 형식(하이픈 포함·미포함)을 직접 전송하면
Then 모두 검증 오류로 거부되고 분류·외부 AI 호출이 일어나지 않는다.
검증: `pnpm test` | 통과 판정: 네 입력 모두 거부, 분류·공급자 호출 횟수 0 | 선결: D-ENGINE-04가 서버 경계((2)·(3))로 확정 — (1)이면 적용되지 않고, 미결정인 동안 BLOCKED | 서명: 불필요

**AC-B2CENGINE-018** (REQ-B2CENGINE-018)
Given 카나리 문자열이 포함된 입력·답변으로 엔진 호출(정상·실패 경로 모두)을 수행하면서 stdout·stderr와 시험이 지정한 로그 파일 경로를 캡처했을 때(REQ-B2CENGINE-018의 "관측 도구"는, 이 저장소의 `package.json`에서 sentry·datadog·posthog·analytics·opentelemetry·newrelic·logrocket 이름으로 검색했을 때 의존성이 없었다 — 이후 도입되면 그 전송 페이로드도 캡처에 포함한다)
When 캡처 전체에서 카나리 문자열을 검색하면
Then 일치가 0건이다.
검증: `pnpm test` | 통과 판정: 정상·실패 경로 캡처 모두 일치 0건 | 선결: 없음 | 서명: 불필요

**AC-B2CENGINE-019** (REQ-B2CENGINE-019)
Given 외부 AI를 쓰는 구성에서 공급자 호출을 가로채는 모킹 공급자가 있고, 01-B 추가 질문에 답변이 입력된 상태일 때
When 엔진이 호출되면(D-ENGINE-11 (c)의 분류 호출과 질문 선택 호출을 모두 포함)
Then 공급자로 나가는 페이로드의 필드 집합이 D-ENGINE-06 결정 기록이 허용한 최소 필드 집합의 부분집합이고(식별자·IP·세션 값·연락처 없음), D-ENGINE-06이 (a)로 확정된 경우에는 공급자 호출이 0건이다. **교차 확인(D-ENGINE-06 (b) 전제)**: 분류 호출과 질문 선택 호출 중 어느 쪽의 페이로드에도 01-B 답변 값(선택지 문자열·식별자)이 나타나지 않는다 — 허용된 최소 필드 집합은 자유 문장(또는 그 분류 결과)뿐이며 01-B 답변은 그 집합 밖이므로, D-ENGINE-11이 어느 옵션으로 확정되든(호출 1회든 2회든) 모든 호출에 대해 이 조건을 검사한다.
검증: `pnpm test` | 통과 판정: 페이로드 필드 ⊆ 허용 집합, 모든 호출의 페이로드에 01-B 답변 값 0건 | 선결: D-ENGINE-06 결정 기록의 필드 집합 — 미결정인 동안 BLOCKED. 시험이 읽을 수 있도록 그 기록이 기계 판독 가능한 형태로 정해져야 한다(`design.md` §9.3, run-phase에서 확정). 법무 확인 기록(전송 필드 집합과 동의 문구의 일치)은 이 AC가 아니라 AC-B2CENGINE-023이 게이트로 다룬다 | 서명: **법무**(필드 집합의 결정 기록)

**AC-B2CENGINE-020** (REQ-B2CENGINE-020)
시나리오 1 — 동의 표지 없음.
Given 진단 동의 확인 표지가 없는 엔진 요청이 있을 때
When 엔진 경계가 요청을 받으면
Then 처리 없이 거부되고, 공급자 호출 스파이의 호출 횟수가 0이다.
시나리오 2 — 노출 게이트 거짓.
Given `ENABLE_DIAGNOSIS_FLOW`·`DIAGNOSIS_ENGINE_READY`·`ENABLE_DIAGNOSIS_DEV_STATES`가 모두 `true`가 아니어서 `shouldRenderDiagnosis`가 거짓인 구성이고, 공급자 호출 스파이가 걸려 있을 때
When 유효한 동의 표지를 가진 요청을 엔진 경계에 직접 보내면(페이지를 거치지 않는다)
Then 정의된 거절 결과(REQ-B2CENGINE-020이 `error` 결과의 사유 코드로 정의하고 01-E로 매핑)가 돌아오고, 처리가 일어나지 않으며, 공급자 호출 스파이의 호출 횟수가 0이다.
검증: `pnpm test` | 통과 판정: 시나리오 1·2 모두 거부와 공급자 호출 0 | 선결: D-ENGINE-04가 서버 경계, N4(표지 형태) — (1)이면 적용되지 않고(게이트는 페이지 경로에서 평가된다), 미결정인 동안 BLOCKED | 서명: 불필요

**AC-B2CENGINE-021** (REQ-B2CENGINE-021)
Given 요청률·크기 상한이 설정 값으로 주입되어 있을 때
When 상한을 넘는 요청률과 크기로 호출하면
Then 초과 요청은 처리 없이 거부되고 UI는 01-E로 매핑한다. 테스트는 상한 **값**을 단언하지 않고 설정 값을 기준으로 초과를 만든다.

프로덕션 준비 교차 확인(REQ-B2CENGINE-021, 수치 자체는 이 문서가 정하지 않는다 — 운영 투입 전 검증 의무): 외부 AI를 쓰는 구성(D-ENGINE-01 (3))이면 설정 값(요청률·크기 상한, 호출당 요청 수)을 운영에 반영하기 전에 (1) 공급자 콘솔·계약에서 확인한 실제 한도 기록 — `.env.local.example`의 예시 RPM(`:72,75`)처럼 문서 예시 수치를 실제 한도로 대체한 기록은 인정하지 않는다 —, (2) 분류→질문 선택 각 호출의 실측 응답 지연(latency) 기록, (3) 시간 초과·429·형식 오류에 대한 재시도·오류 처리 시험(REQ-B2CENGINE-014) 결과, (4) 호출당 요청 수(2회, D-ENGINE-11 (c))가 (1)의 실제 한도를 넘지 않는다는 확인, 네 가지가 모두 기록되어 있어야 한다. 네 가지 중 하나라도 기록이 없으면 이 교차 확인은 BLOCKED이며, 설정 값의 운영 반영은 Pre-flight에서 거부된다.
검증: `pnpm test`(요청률·크기 상한 본체), 운영 투입 전 기록 열람(프로덕션 준비 교차 확인 — 후보, run-phase에서 기록 경로 확정) | 통과 판정: 초과 요청 거부·01-E 매핑, 그리고(외부 AI 구성이면) 네 가지 기록 전부 존재 | 선결: D-ENGINE-04가 서버 경계 — 미결정인 동안 BLOCKED. 프로덕션 준비 교차 확인은 D-ENGINE-01이 (3)으로 확정된 구성에서만 적용(확정됨) | 서명: 불필요(상한 본체), **엔지니어링**(프로덕션 준비 교차 확인 네 가지 기록)

## 평가 · 준비 상태 · 환경

**AC-B2CENGINE-022** (REQ-B2CENGINE-022)
Given 정답 집합과 평가 절차가 있을 때
When 엔진·판정 근거 데이터·프롬프트 중 하나를 바꾼 뒤 평가를 실행하면
Then 정답 집합 버전, 엔진 버전, 판정 근거 데이터 버전, 지표별 측정값을 담은 보고서가 생성·기록되고, 기록이 없으면 준비 증거 검사가 실패한다.
합격 판정: 지표별 측정값이 D-ENGINE-09 서명 기록의 기준값을 충족하면 통과다. D-ENGINE-09가 결정되기 전에는 합격 판정은 BLOCKED이며 통과로 계산하지 않는다. 보고서 생성·기록 부분은 기준값 없이 시험할 수 있다.
검증: 평가 러너(후보 `lib/coverage/eval/`)와 `pnpm test` | 통과 판정: 보고서 필드 4종 존재·기록 없을 때 검사 실패(항상), 지표 ≥ 기준값(D-ENGINE-09 이후) | 선결: 정답 집합, 합격 판정은 D-ENGINE-09 | 서명: **제품 책임자 + 도메인 전문가**(기준값·합격 판정)

**AC-B2CENGINE-023** (REQ-B2CENGINE-023)

진단 대상 유형별 준비 상태 매트릭스(D-ENGINE-03이 둘 이상의 진단 대상 유형을 최초 공개 범위로 정한 경우 적용 — 현재 결정은 (d) 6개 유형 전부). 아래 6개 유형 각각이 6개 조건을 모두 충족해야 "6유형 전체 일반 공개" 게이트가 참이 될 수 있다. 한 유형이라도 한 조건을 미충족이면 그 유형의 행은 거짓이고, 거짓인 행이 하나라도 있으면 전체 게이트는 BLOCKED다 — **평균·가중 집계로 상쇄하지 않는 AND-게이트**다(구조적으로 "부분 충족 → 전체 PASS"가 나올 수 없다).

| 진단 대상 유형 | (a) 규칙 근거 | (b) 정답 사례 | (c) 01-B 질문 세트 적합 | (d) 02 결과 표시 준비 | (e) 도메인 전문가 검수 | (f) 정확도 기준 충족 |
|---|---|---|---|---|---|---|
| 교통사고 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 |
| 계단에서 낙상 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 |
| 운동 중 부상 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 |
| 허리 디스크 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 |
| 어깨 회전근개 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 |
| 암 진단 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 | 미충족 |

모든 셀이 "미충족"인 것은 이 SPEC이 아직 plan-phase이고 구현이 시작되지 않았다는 사실을 그대로 반영한다(허위 충족 표기 금지). run-phase에서 각 셀을 실제 기록(날짜·서명자·근거 경로)으로 갱신한다 — 이 문서는 틀과 각 열의 판정 근거만 정의한다. 열의 판정 근거: (a)는 REQ-B2CENGINE-010/AC-B2CENGINE-010의 그 유형에 대한 확인 기록, (b)는 REQ-B2CENGINE-022/AC-B2CENGINE-022가 요구하는 정답 집합 중 그 유형의 커버리지, (c)는 REQ-B2CENGINE-009/AC-B2CENGINE-009(D-ENGINE-11이 (c)·(d)로 확정된 경우에만 적용 — 그 외에는 이 열이 "해당 없음"으로 항상 충족 처리), (d)는 REQ-B2CENGINE-006/AC-B2CENGINE-006의 그 유형에 대한 `CoverageItem` 렌더링 확인, (e)는 AC-B2CENGINE-006·AC-B2CENGINE-007·AC-B2CENGINE-010의 도메인 전문가 서명이 그 유형의 규칙·질문·표시를 대상으로 했는지, (f)는 AC-B2CENGINE-005 시나리오 2·AC-B2CENGINE-022 합격 판정이 그 유형의 측정값에 D-ENGINE-09 기준값을 적용했는지다.

시나리오 1 — 게이트 행렬(`design.md` §9.2 (c)·(d)가 선택된 경우).
Given `computeDiagnosisFlags`가 엔진 준비 증거를 입력으로 받는 구조이고, 증거 항목은 (i) 판정 근거 데이터 확인 기록 (ii) 정답 집합 측정 기록 (iii) D-ENGINE-09 서명 기록 (iv) 외부 AI 사용 구성의 법무 확인 기록일 때(해당하는 항목만 적용)
When `DIAGNOSIS_ENGINE_READY=true`이면서 증거가 하나도 없는 경우, 항목을 하나씩만 뺀 경우(각 항목마다), `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 `true`이고 증거가 전부 있는 경우, `DIAGNOSIS_ENGINE_READY`가 `false`이고 증거가 전부 있는 경우를 각각 계산하면
Then `productionReady`는 증거가 전부 있고 두 플래그가 모두 `true`인 경우에만 참이며 나머지는 모두 거짓이다. 외부 AI 구성에서 (iv)만 없는 경우도 거짓이다. **위 유형별 준비 상태 매트릭스가 적용되는 구성(D-ENGINE-03이 둘 이상의 유형을 범위로 정한 경우, 현재: 6유형 전부)에서는 매트릭스의 모든 유형·모든 조건이 충족된 경우에만 "증거가 전부 있다"로 계산한다 — 한 유형이라도 한 조건을 미충족이면 증거가 전부 있는 경우로 계산하지 않으며, 유형 간 평균이나 가중치로 상쇄하지 않는다.**
시나리오 2 — CI 증거 검사(`design.md` §9.2 (b)·(d)가 선택된 경우).
Given 준비 증거 기록이 전부 있는 작업 트리에서 항목을 하나씩만 제거하거나(각 항목마다, 해당하는 항목만) 기록 파일 전체를 제거한 변형이 있을 때
When 증거 기록을 검사하는 CI 명령(후보, run-phase에서 확정)을 각각 실행하면
Then 변형은 모두 비-0 종료로 실패하고, 증거가 전부 있는 원본은 통과한다. 이 시나리오가 REQ-B2CENGINE-023을 충족하는 범위는 N7의 확인 결과에 따른다.
시나리오 3 — 플래그 런타임 검증(`design.md` §9.2 (c)·(d)가 선택된 경우).
Given 갱신된 `scripts/verify-flag-runtime.ts`와 `scripts/verify-flag-runtime.test.ts`가 증거가 있는/없는 임시 서버 구성을 기대값과 함께 다루도록 바뀌었을 때
When `pnpm verify:flag-runtime`을 실행하면
Then 종료 코드 0이다(엔진을 켠 조합 `PROD_READY`·`ALL_ON`의 기대 게이트 상태가 증거 유무에 따라 계산된 값과 실제 서버 관측이 일치한다).
시나리오 4 — 서버 경계의 차단(D-ENGINE-04 (2)·(3), 외부 AI를 쓰는 구성, `design.md` §9.2 (c)·(d)가 선택된 경우).
Given 증거 (iv)만 없고 `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 `true`이며 `ENABLE_DIAGNOSIS_DEV_STATES`가 `true`가 아닌 구성에서, 공급자 호출 스파이가 걸려 있을 때
When 유효한 동의 표지를 가진 요청을 엔진 경계에 직접 보내면
Then 정의된 거절 결과(REQ-B2CENGINE-020이 `error` 결과의 사유 코드로 정의 — 네 번째 결과 종류가 아니다)가 돌아오고 공급자 호출 스파이의 호출 횟수가 0이다. (§9.2가 (b)만이면 같은 경계의 차단은 게이트 입력 플래그가 거짓인 경우로 한정되며 AC-B2CENGINE-020 시나리오 2가 그것을 시험한다.)
시나리오 5 — 설정 지점 부재(이 SPEC 산출물에 대한 불변 조건).
Given 비-테스트 코드를 `app/`, `components/`, `lib/`, `instrumentation.ts`, `playwright.config.ts`, `scripts/`, `package.json`, `.github/workflows/`, `.env.local.example` 아래의 소스에서 `*.test.*`와 `scripts/verify-flag-runtime.ts`(임시 서버 프로세스의 env를 구성하는 검증 하네스이므로 시험 코드로 분류)와 주석 행을 제외한 것으로 정의할 때
When 대괄호·JSON 키 대입 형태(`process.env["DIAGNOSIS_ENGINE_READY"] = ...`, `{ "DIAGNOSIS_ENGINE_READY": ... }` 등)까지 잡도록 보강한 명령 `grep -rnE "DIAGNOSIS_ENGINE_READY[]\"']*[[:space:]]*(=|:)[[:space:]]*[\"'\`]?[^=[:space:]]" app components lib instrumentation.ts playwright.config.ts scripts package.json .github/workflows .env.local.example --exclude="*.test.*" --exclude="verify-flag-runtime*" | grep -vE "^[^:]+:[0-9]+:[[:space:]]*(//|\*|#)"`를 실행하면
Then 출력이 0줄이다(2026-10-03 기준 `main@99993bf` 위의 이 작업 트리에서 같은 명령의 출력이 0줄임을 직접 실행해 관찰했다 — `scripts/` 경로를 넓혀 포함했을 때 `verify-flag-runtime*`를 제외하지 않으면 `scripts/verify-flag-runtime.ts:174,293`의 선언된 하네스 예외 두 줄만 나오고, 그 둘을 제외하면 0줄이다). 이전 명령(`DIAGNOSIS_ENGINE_READY[[:space:]]*(=|:)[[:space:]]*[^=[:space:]]`)은 대괄호·JSON 키 대입을 놓친다(`process.env["DIAGNOSIS_ENGINE_READY"] = "true"`와 JSON 키 `"DIAGNOSIS_ENGINE_READY": "true"`에서 직접 확인한 거짓 음성) — 이 시나리오는 그 결함을 고친 패턴을 쓴다.
검증: `pnpm test`(`lib/diagnosis/flags.test.ts` 확장 — 시나리오 1·4), CI 증거 검사 명령(시나리오 2, 후보), `pnpm verify:flag-runtime`(시나리오 3), 위 grep(시나리오 5) | 통과 판정: 시나리오 1 행렬 전부 기대값이고 D-ENGINE-03이 둘 이상의 유형을 범위로 정한 구성에서는 유형별 준비 상태 매트릭스 전체 충족이 추가 조건, 시나리오 2 변형 전부 실패·원본 통과, 시나리오 3 종료 코드 0, 시나리오 4 거절과 공급자 호출 0, 시나리오 5 출력 0줄(하네스 두 줄은 허용 목록) | 선결: 시나리오 1·3·4는 §9.2 (c)·(d), 시나리오 2는 §9.2 (b)·(d), 시나리오 4는 추가로 D-ENGINE-04 (2)·(3)과 외부 AI 사용 구성(D-ENGINE-01 (2)·(3), D-ENGINE-06 (a) 아님), 시나리오 5는 없음. §9.2가 미결정이거나 (a)이면 시나리오 1~4는 BLOCKED이며 (a)는 REQ-023의 개정이 먼저다. N7 | 서명: 불필요(증거 기록 자체의 서명은 각 항목의 소유 역할이 한다 — `design.md` §9.3)

**AC-B2CENGINE-024** (REQ-B2CENGINE-024)
Given D-ENGINE-01이 LLM을 쓰지 않는 구조((1))로 확정된 구성에서
When `validateEnv("app", { /* GEMINI_API_KEY 없음, LLM_PROVIDER_MODE 미설정 */ })`를 호출하면
Then 통과한다. D-ENGINE-01이 LLM을 쓰는 구조((2)·(3))로 확정된 구성에서는 키가 없으면 실패하며 누락 변수 목록에 `GEMINI_API_KEY`가 포함된다(`lib/env.ts:134-136`의 조건이 구조에 맞게 바뀌어 있다).
검증: `pnpm test`(`lib/env.test.ts`) | 통과 판정: 위 두 구성의 기대 결과 일치 | 선결: D-ENGINE-01, N6 — (1)이면 `lib/env.test.ts:94,105-107`(AC-RESEARCH-011a/011b)의 갱신 경로가 N6에서 정해져야 하며 미결정인 동안 BLOCKED | 서명: 불필요

**AC-B2CENGINE-025** (REQ-B2CENGINE-025, REQ-B2CENGINE-005)
Given 엔진이 선택된 구성에서 `LLM_PROVIDER_MODE=deterministic` 등 외부 호출 없는 시험 구성으로 e2e를 실행할 때(외부 AI를 쓰는 구성이면 결정론적 공급자가 입력별 분류 응답을 돌려줄 수 있어야 한다 — 단일 고정 응답으로는 입력별 시나리오를 만들 수 없다, `design.md` §2.4)
When `pnpm test:e2e`를 실행하고 네트워크 요청을 기록하면
Then 외부 AI 공급자 호스트로의 요청이 0건이고, `determined`·`cannot-determine`·`error` 세 결과를 각각 재현하는 e2e 시나리오가 통과하며, 01·상담 e2e가 고정 표본 문장 "3일 전에 헬스장에서 …"의 정확 일치에 의존하지 않는다(기존 `e2e/diagnosis-flow-01.spec.ts:28-29`, `e2e/consult-flow-03.spec.ts:63`의 입력이 이행되어 있다).
검증: `pnpm test:e2e` | 통과 판정: 외부 호스트 요청 0건, 세 결과 시나리오 통과, 고정 문장 정확 일치에 의존하는 e2e 0건 | 선결: N3(RESULT-001 요구사항 대체 처리), 엔진 선택(D-ENGINE-01) | 서명: 불필요

## Edge Cases

- 200자 입력, 공백만 입력, 이모지·특수문자만 입력 → `cannot-determine` 또는 검증 오류(AC-008, 017).
- 입력이 여러 진단 대상 유형을 섞은 경우 → 지원 범위의 진단 대상 유형만 분류되거나 `cannot-determine`이며 두 유형의 항목이 섞이지 않는다(AC-008).
- 새로고침·뒤로가기 후 `/result` → 같은 `resultId`로 재표시(REQ-B2CRESULT-016 유지). 만료를 두는 `resultId`는 이 재표시와 충돌하지 않는지 D-ENGINE-05·N1에서 확인한다(AC-015 시나리오 2).
- 엔진이 `error`일 때 상담으로 넘어가지 않는다(AC-014).
- 증거가 일부만 있는 상태에서 `DIAGNOSIS_ENGINE_READY=true`(AC-023 시나리오 1·2).
- 페이지를 거치지 않고 엔진 경계를 직접 호출 — 게이트가 거짓이거나 증거 (iv)가 없는 상태 → 거절·공급자 호출 0(AC-020 시나리오 2, AC-023 시나리오 4).
- 서명 비밀이 없는 환경에서 상담 접수·`resultId` 발급(D-ENGINE-05 (b)) → 닫힘(AC-015 시나리오 3).
- 6개 진단 대상 유형 중 일부만 준비 상태 매트릭스를 충족한 경우 → 전체 게이트는 BLOCKED이며 부분 충족 비율로 PASS 처리되지 않는다(AC-023 유형별 준비 상태 매트릭스, AND-게이트).
- 외부 AI 공급자의 문서 예시 한도(RPM 등)만 있고 실제 한도·지연·재시도 확인 기록이 없는 경우 → 운영 반영은 거부된다(AC-021 프로덕션 준비 교차 확인).

## Quality Gate 기준

- Vitest: 신규 로직 85% 이상(`quality.yaml:5`), `pnpm lint`·타입 검사 0 오류(run-phase LSP 기준).
- `pnpm build` 성공. §9.1이 빌드 시 제외((c))로 정해지면 번들 검색(AC-012 시나리오 2, AC-013) 통과.
- `pnpm test:e2e` 전체 통과, `pnpm verify:flag-runtime` 통과(AC-023 시나리오 3, §9.2 (c)·(d)가 선택된 경우).
- `pnpm visual:verify` 기존 15화면 정의·허용 오차·승인된 debt 불변(REQ-B2CCONSULT-025). 02 쪽은 DIAGNOSIS-001 10화면 커버리지를 깨지 않고 덧붙이는 방식으로만 확장한다(REQ-B2CRESULT-025). 이 SPEC은 빌드·플래그 배선만 바꾸며 그 이상이 필요하면 amendment가 먼저다(N8).
- TRUST 5 Secured: OWASP LLM Top 10 매핑(`design.md` §2.3)을 근거로 입력 길이·출력 검증·로그 금지 확인(LLM을 쓰는 구성에 한함).
- 외부 AI를 쓰는 구성(D-ENGINE-01 (3)): 운영 투입 전 실제 공급자 한도·응답 지연·재시도 처리 기록 4종(AC-021 프로덕션 준비 교차 확인)이 모두 있어야 한다 — 문서 예시 수치로 대체할 수 없다.

## Definition of Done (이 plan-phase 기준)

- [ ] 25개 AC 각각이 run-phase에서 명령·테스트·측정·서명 중 하나로 매핑되고, 선결 조건이 명시됨
- [ ] 25개 REQ가 모두 최소 하나의 AC에 인용됨(REQ-001~025 ↔ AC-001~025 1:1)
- [ ] 사람 서명이 필요한 AC(003, 004, 005, 006, 007, 008, 009, 010, 013, 015, 016, 019, 022)의 서명 역할이 지정됨
- [ ] D-ENGINE-01~11이 결정되기 전에는 M2 이후가 시작되지 않음
- [ ] 선결 조건이 충족되지 않은 AC는 BLOCKED로 기록되고 통과로 계산되지 않음
- [ ] 이 SPEC의 어떤 AC도 `DIAGNOSIS_ENGINE_READY`를 켜는 행위를 포함하지 않음
- [ ] AC-023의 진단 대상 유형별 준비 상태 매트릭스 구조상, 6개 유형 중 하나라도 한 조건을 미충족이면 "6유형 전체 일반 공개" 게이트가 PASS로 계산될 수 없음(AND-게이트, 평균·가중치 집계 불가능)
- [ ] plan-auditor 독립 감사는 오케스트레이터가 수행(이 문서는 결과를 주장하지 않음)
