---
id: SPEC-B2C-ENGINE-001
title: "진단·담보 매칭·결과 데이터 엔진 (Plan-Phase)"
version: "0.1.0"
status: draft
created: 2026-10-02
updated: 2026-10-02
author: Nexsol
priority: P1
phase: "v0.20.0 target"
module: "lib/coverage/, lib/diagnosis/, lib/consult/, lib/env.ts, components/diagnosis/, components/result/, app/api/, scripts/, e2e/"
lifecycle: spec-anchored
tags: "b2c-engine, coverage-matching, diagnosis-engine, result-identity, gold-set, privacy, funnel-01-02, plan-only"
tier: L
related_specs: [SPEC-B2C-FOUNDATION-001, SPEC-B2C-DIAGNOSIS-001, SPEC-B2C-RESULT-001, SPEC-B2C-CONSULT-001]
---

## HISTORY

- 2026-10-02: 최초 작성 (Nexsol) — 이 문서들은 2026-10-02에 `main@99993bf` 위에서 만든, 커밋되지 않은 plan-phase 초안이다. 코드·설정·워크플로·기존 SPEC 디렉터리는 변경하지 않았다.
- 2026-10-02: plan-auditor iteration 1(FAIL, 0.726 < Tier L 임계값 0.85)의 결함 D1~D19 반영(manager-spec 재위임, 문서 수정만). 요구사항·AC의 번호와 개수(25/25)는 유지하고, 결정 대기 항목을 선점하던 요구사항을 구조 중립 또는 조건부 문구로 바꿨으며, 기존 SPEC과의 충돌 N6~N8을 추가했다. 결함별 처리와 의미가 바뀐 요구사항 목록은 `progress.md` §G에 있다. 이 문서들은 여전히 `main@99993bf` 위의 커밋되지 않은 초안이며, 이 항목은 재감사 결과나 커밋·테스트 결과를 주장하지 않는다.
- 2026-10-02: plan-auditor iteration 2(FAIL, 0.807 < Tier L 임계값 0.85)의 결함 D20~D28과 iteration 1의 잔여 D8·D13 반영(manager-spec 재위임, 문서 수정만). 요구사항·AC의 번호와 개수(25/25)는 유지했다. REQ-015에 서명 비밀 부재 시 닫힘 절을, REQ-020에 노출 게이트가 거짓일 때의 서버 경계 거절을, REQ-023에 이 SPEC 산출물의 `DIAGNOSIS_ENGINE_READY` 설정 금지를 넣고 REQ-023의 차단 결과 서술을 구현 방식에 중립으로 바꿨다. 결함별 처리는 `progress.md` §G에 있다. 이 문서들은 여전히 `main@99993bf` 위의 커밋되지 않은 초안이며, 이 항목은 재감사 결과나 커밋·테스트 결과를 주장하지 않는다.

---

## 1. 배경 (Why)

B2C 3단계 퍼널(01 질문 입력 → 02 보상 진단 결과 → 03 상담 신청)의 화면과 상담 접수 API 코드는 모두 `main@99993bf`에 병합되어 있다. 그러나 01에서 02로 가는 "진단" 자체는 아직 존재하지 않는다. 코드로 확인한 현재 상태는 다음과 같다.

- 01 진단 중 단계의 판정은 `mockJudge(input, reviewEnabled)`(`components/diagnosis/step-loading.tsx:54-62`)다. `reviewEnabled && input === FRACTURE_FIXTURE_INPUT`(엄격한 `===`)일 때만 `"result"`를 반환하고, 그 외에는 `"오류"` 포함 여부로 `error`/`result-none`을 반환한다. 이 함수는 사용자의 추가 질문 답변(answers)조차 받지 않는다(`components/diagnosis/diagnosis-flow.tsx:452-457`이 `input`만 전달).
- "결과 있음"의 유일한 내용은 `buildFractureResult(rawInput, answers)`(`lib/diagnosis/fixtures/fracture-case.ts:209-229`)가 만드는 고정 골절 사례다. `rawInput`은 파싱되지 않고, 답변은 표시용 Fact Chip만 만들 뿐 status·benefit·항목을 바꾸지 않는다(`fracture-case.ts:82-202`).
- 담보 매칭 엔진, `lib/coverage/`, 약관·상품·증권 데이터, OCR, 외부 AI 호출은 B2C 경로(`app/`, `components/`, `lib/diagnosis`, `lib/consult`, `lib/validation`)에 존재하지 않는다(import 검색 결과 0건). 진단용 API 라우트·서버 액션·DB 테이블도 없다(`app/`의 라우트는 `app/api/consultations/route.ts`, `app/consult/page.tsx`, `app/page.tsx`, `app/result/page.tsx`뿐이다).
- `DIAGNOSIS_ENGINE_READY`는 단지 `=== "true"` 불리언이다(`lib/diagnosis/flags.ts:22-24,38-47`). 엔진이 실제로 존재하는지 확인하는 코드는 없다.
- 03 상담 신청이 받는 `resultId`는 서버가 검증할 수 없는 불투명 문자열이다(`lib/consult/schema.ts:23`, `lib/db/schema.ts:189-192,204`).

따라서 코드 사실과 운영 사실을 구분해야 한다.

- **코드 사실 — "화면·상담 API가 `main@99993bf`에 병합됨"**: `git log`로 확인된다. 병합은 `deploy.yml`의 배포 파이프라인을 실행한다(`SPEC-B2C-CONSULT-001/progress.md` Claim 123).
- **운영 사실 — "운영에서 어떤 상태인가"**: 이 SPEC 작성 세션은 운영 서버를 관찰하지 않았다. 마지막 관찰은 2026-10-02 **병합 이전**이다 — 가동 커밋 `f7ef4ec`, 플래그 5종(`ENABLE_CONSULT_FLOW`, `CONSULT_POLICY_READY`, `ENABLE_DIAGNOSIS_FLOW`, `DIAGNOSIS_ENGINE_READY`, `ENABLE_DIAGNOSIS_DEV_STATES`) 모두 미설정(`SPEC-B2C-CONSULT-001/progress.md:4081,4153`). 병합 이후의 운영 상태는 **미관측**이다(`research.md` §4).
- **"일반 사용자 대상 서비스 출시 가능"** — 사실이 아니다. 코드상 일반 사용자가 02에 도달할 수 있는 유일한 경로는 review 플래그를 켜고 고정 문장을 정확히 입력하는 것이며, 그 결과는 하드코딩된 골절 표본 1건이다. 그 외 모든 입력은 "결과 없음"이다.

이 SPEC은 고정 표본을 **진짜 진단 + 담보 매칭 + 결과 데이터 파이프라인**으로 대체하기 위해 필요한 작업을 계획한다. 목표는 일반 사용자의 01 입력이 **진실한 02 결과** 또는 **정직한 "판단 불가"**로 이어지게 하는 것이다. 매칭 방식(정적 규칙 / LLM / 하이브리드)은 `tech.md:108-136`과 `SPEC-B2C-FOUNDATION-001/design.md:157-161`이 의도적으로 미뤄 온 결정이며, 이 SPEC은 그 결정을 사용자에게 올리기 위한 대안 비교와 결정 후 구현 계획을 담는다. **결정 자체를 이 SPEC이 내리지 않는다.** 아래 요구사항은 결정 D-ENGINE-xx의 어느 옵션도 선점하지 않도록 구조 중립이거나, 특정 옵션이 확정된 경우에만 적용되는 조건부(`Where`) 문구로 썼다.

## 2. 범위 (Scope)

### 2.1 포함

- 01 입력의 분류, 판정 근거 적용, 정직한 불확실성 상태(needs-info / low-likelihood / cannot-determine) 산출
- `DiagnosisResult`/`DiagnosisResultSchema`를 엔진 출력 계약으로 유지
- 01 진단 중 단계의 고정 판정 교체와 운영 경로에서의 fixture 도달 차단
- 01-B 추가 질문의 입력 적응(D-ENGINE-11이 적응 방식을 택하는 경우)
- 03 상담이 검증할 수 있는 결과 식별(`resultId`, D-ENGINE-05가 서버 검증 방식을 택하는 경우)
- 정답 집합(gold set)과 정확도 측정 절차, 엔진 준비 증거
- 자유 문장 입력의 개인정보·외부 AI 전송·로그·남용 방지 처리
- `GEMINI_API_KEY` 부팅 요구 잔재 정리, `DIAGNOSIS_ENGINE_READY`의 진실성

### 2.2 의존성 · 차단 관계

| 관계 | 내용 |
|---|---|
| **이 SPEC이 막는 것** | ① `DIAGNOSIS_ENGINE_READY=true` 전환(소유: SPEC-B2C-LAUNCH-001), ② 01/02의 일반 사용자 대상 공개, ③ 03 상담의 일반 사용자 대상 사용(실제 상담에는 실제 결과가 필요하다) |
| **이 SPEC이 의존하는 것** | 사용자·법무 결정 D-ENGINE-01~11(`plan.md` §B, `progress.md` Open Decisions). 특히 D-ENGINE-07(진단 동의 상세 6개 문구)은 D-ENGINE-01/04/05/06이 확정되어야 법무가 작성할 수 있다 |
| **의존하지 않는 것** | SPEC-B2C-CONSULTOPS-001(상담 운영 활성화). 엔진과 상담 운영은 서로 독립적으로 진행할 수 있다 |
| **이 SPEC에 의존하는 것** | SPEC-B2C-LAUNCH-001(출시 게이트). LAUNCH는 이 SPEC의 엔진 준비 증거(REQ-B2CENGINE-023)를 입력으로 받는다 |
| **여기서 처리하지 않는 것** | `.github/workflows/deploy.yml:96-101`의 "서비스 준비 중입니다" placeholder smoke check 교체. 이 교체의 트리거는 이미 완료된 SPEC이 소유한다 — REQ-B2CDIAG-023과 AC-B2CDIAG-024(`SPEC-B2C-DIAGNOSIS-001/spec.md:99`, `acceptance.md:55`)는 두 플래그가 프로덕션에서 실제로 `true`가 될 때 교체한다고 정했다. 그 시점은 게이트를 실제로 여는 SPEC-B2C-LAUNCH-001이다(이 SPEC의 산출물은 게이트를 열지 않는다) |
| **이 SPEC이 정하지 않는 것(소유 주체와 시기가 따로 있음)** | `DIAGNOSIS_ENGINE_READY` 전환의 소유(SPEC-B2C-LAUNCH-001로 지정 — N5 확인 필요). 이 SPEC은 산출물 안에 그 값을 `true`로 설정하는 지점을 만들지 않으며, 이 제약은 이 SPEC의 REQ-B2CENGINE-023이 규정한다. REQ-B2CDIAG-025와 REQ-B2CRESULT-024의 같은 취지의 문장은 각 SPEC이 전달하는 코드 범위에 한정되어 있어 이 SPEC의 산출물을 구속하지 않는다(`plan.md` §D, `acceptance.md` AC-B2CENGINE-023 시나리오 5) |

SPEC-B2C-LAUNCH-001과 SPEC-B2C-CONSULTOPS-001은 현재 저장소(`.moai/specs`, `.moai/project`, `.moai/docs`)에 존재하지 않으며(검색 결과 0건), 계획된 SPEC ID로만 참조한다.

### 2.3 기존 SPEC 요구사항과의 관계

| 기존 요구사항 | 이 SPEC과의 관계 |
|---|---|
| REQ-B2CDIAG-024 (`SPEC-B2C-DIAGNOSIS-001/spec.md:103`) — 엔진 미연결 상태에서 mock 결과를 실제처럼 제시 금지 | **유지**한다(REQ-B2CENGINE-012가 엔진 경로로 연장). 02의 review 전용 fixture 경로(`?devFixture=fracture`)에는 현재 렌더링되는 mock 표기가 없다(`components/result/`에는 주석뿐). 이 SPEC은 N8이 결정되기 전에는 그 표기를 계획하지 않는다. |
| REQ-B2CDIAG-025 (`spec.md:104`) — `productionReady = ENABLE_DIAGNOSIS_FLOW && DIAGNOSIS_ENGINE_READY` 정의 | `design.md` §9.2 (c)·(d)를 택하면 **amendment 필요**: REQ-B2CENGINE-023의 차단을 런타임 게이트로 구현하면 이 정의에 엔진 준비 증거 조건을 AND로 더하므로 "유지"가 아니다(N7). §9.2 (b)(CI 검사만)이면 `productionReady` 정의는 바뀌지 않으며 대신 N7의 확인 사항이 남는다. 같은 요구사항의 `reviewEnabled`·OR 합성은 유지된다. "산출물에 `true` 설정 지점 없음"은 이 SPEC이 전달하는 코드 자체에 한정된 서술(`SPEC-B2C-DIAGNOSIS-001/spec.md:104`)이라 이 SPEC의 산출물에는 REQ-B2CENGINE-023이 따로 규정한다. |
| REQ-B2CRESULT-012 (`SPEC-B2C-RESULT-001/spec.md:81`) — 게이트 계산을 단일 헬퍼(`lib/diagnosis/flags.ts`)로 통합 | 단일 헬퍼 원칙은 유지한다. `computeDiagnosisFlags`의 입력이 바뀌므로 호출부 두 곳(`app/page.tsx`, `app/result/page.tsx`)과 시험이 함께 바뀐다(N7). |
| REQ-B2CRESULT-024 (`spec.md:105`) — "이 SPEC이 전달하는 코드 범위 안에서" `DIAGNOSIS_ENGINE_READY=true` 설정 지점 금지 | RESULT-001이 전달하는 코드에 한정된 요구사항이라 이 SPEC의 산출물을 구속하지 않는다. 같은 제약을 이 SPEC 산출물에 대해 REQ-B2CENGINE-023이 **재진술**한다(`plan.md` §D, `acceptance.md` AC-B2CENGINE-023 시나리오 5). |
| REQ-B2CDIAG-004/021 (`SPEC-B2C-DIAGNOSIS-001/spec.md:68,97`) — 진단 입력·응답의 서버 영구 저장 금지, 클라이언트 메모리 안 관리 | D-ENGINE-04가 서버 경계를 택하면 입력이 서버를 **통과**한다. 이 통과가 두 요구사항과 양립하는지는 해석이 필요하다(N2). D-ENGINE-04 (1)을 택하면 이 문제는 생기지 않는다. |
| REQ-B2CRESULT-009/010/011 (`SPEC-B2C-RESULT-001/spec.md:78-80`) — review 전용 fixture 분기, 정확 일치 트리거, 기존 result-none/error 판정 유지 | 엔진이 호출되는 경로에서는 **대체**된다. 특히 REQ-B2CRESULT-011이 고정한 e2e 입력 "무릎 골절로 수술을 받았어요"(`e2e/diagnosis-flow-01.spec.ts:28-29,81`)는 골절 사례로 분류될 수 있어 result-none을 기대하는 현행 e2e와 충돌한다(N3). |
| REQ-B2CRESULT-016 (`spec.md:91`) — 인계 데이터 서버 영구 저장 금지 | 결과 식별 옵션에 따라 달라진다(D-ENGINE-05, N2). |
| REQ-B2CCONSULT-009 (`SPEC-B2C-CONSULT-001/spec.md:79`) — 새로고침·뒤로가기 재현을 위한 별도의 신선도(TTL) 검사를 추가하지 않는다 | REQ-B2CENGINE-015의 **`resultId` 만료 절과 충돌**한다. 만료 없는 서명 토큰이면 충돌이 없고, 만료를 두는 방식을 택하면 이 요구사항의 amendment가 먼저 필요하다(N1). |
| REQ-B2CCONSULT-019 (`spec.md:104`) / `SPEC-B2C-CONSULT-001/design.md:62` — `resultId`는 opaque이며 서버 검증 불가를 잔여 위험으로 수용 | D-ENGINE-05 (b)~(d)는 이 수용된 잔여 위험을 바꾼다. (a)는 그대로 둔다(N1). |
| REQ-B2CCONSULT-025 (`spec.md:122`) — `visual:verify`의 기존 15화면 정의·허용 오차(`TOLERANCE`)·승인된 debt 불변(기록된 예외 하나가 있다). REQ-B2CRESULT-025 (`spec.md:106`) — 기존 DIAGNOSIS-001 10화면 커버리지를 깨지 않고 화면 추가는 덧붙이는 방식으로만(허용 오차·debt는 언급하지 않는다) | 두 요구사항의 강도가 다르다. 이 SPEC의 `scripts/visual-verify.ts`·`playwright.config.ts` 변경은 빌드·플래그 배선에 한정하며 화면 정의·허용 오차·debt는 바꾸지 않는다(CONSULT-025를 따른다). 그 이상이 필요하면 amendment가 필요하다(N8). |
| REQ-RESEARCH-012 (`SPEC-RESEARCH-001/spec.md:62`, `status: completed`) — `LLM_PROVIDER_MODE`가 deterministic이 아니면 app 스코프 부팅이 `GEMINI_API_KEY`를 필수로 요구 | REQ-B2CENGINE-024는 엔진이 LLM을 쓰지 않는 구조에서 이 요구를 제거한다. 완료된 SPEC의 계약을 바꾸는 것이다(N6). |

## 3. 요구사항 (GEARS)

### 3.1 데이터 계약 · 결과 분류 · 표현 (Ubiquitous)

- **REQ-B2CENGINE-001**: 엔진은 판정 결과를 기존 `DiagnosisResult`(`lib/diagnosis/types.ts`)와 `DiagnosisResultSchema`(`lib/diagnosis/schema.ts`) 계약 그대로 산출한다. 계약 확장이 필요하면 부가적(additive)이고 `schemaVersion`으로 버전 관리되는 방식으로만 하며, 기존 필드의 의미·4개 카테고리·3개 상태를 바꾸지 않는다.
- **REQ-B2CENGINE-002**: 엔진은 모든 호출에서 `determined`(`DiagnosisResult`를 담음), `cannot-determine`(사유 코드를 담음), `error`(처리 실패) 중 정확히 하나를, 서로 구별되는 타입으로 산출한다.
- **REQ-B2CENGINE-003**: 시스템은 엔진이 생성하는 어떤 사용자 노출 문구에서도 단정형 보상 확정 표현(예: "받으실 수 있습니다")을 사용해서는 안 된다(REQ-B2CRESULT-022의 엔진 경로 연장).
- **REQ-B2CENGINE-004**: 시스템은 근거 식별자와 근거 데이터 버전이 없는 금액·지급률 수치를 `benefit`에 담아서는 안 되며, 근거가 없으면 `benefit.kind`는 `conditional` 또는 `unavailable`이다.

### 3.2 입력 이해 · 담보 판정 · 정직한 불확실성 (Event-driven)

- **REQ-B2CENGINE-005** (When): 사용자의 자유 문장 입력이 엔진에 전달될 때, 엔진은 입력 내용으로부터 사고 유형·부위·시기·경위를 분류해 `inputSummary`를 도출하며, 이 분류는 고정 표본 문장과의 문자열 일치 여부에 의존하지 않는다.
- **REQ-B2CENGINE-006** (When): 분류된 사고 유형이 최초 공개 범위(D-ENGINE-03)에 속할 때, 엔진은 판정 근거(D-ENGINE-02가 정하는 원천)와 추가 질문 답변으로 각 `CoverageItem`의 status·benefit·badges·whyCheck를 산출하며, 각 항목을 그것을 만든 근거 식별자와 근거 버전에 귀속시킨다.
- **REQ-B2CENGINE-007** (When): 판정 근거가 요구하는 정보가 입력·답변에 없거나 건너뛰기로 비어 있을 때, 엔진은 해당 항목을 `needs-info`로 산출한다. 판정 근거상 가능성이 낮을 때는 `low-likelihood`와 비어 있지 않은 `reasonNote`로 산출하며, 근거 없이 `review`를 기본값으로 산출해서는 안 된다.
- **REQ-B2CENGINE-008** (When): 입력이 최초 공개 범위 밖이거나 분류할 수 없을 때, 엔진은 `cannot-determine`을 산출하며 어떤 `CoverageItem`도 담지 않고 다른 사고 유형의 담보 내용을 노출하지 않는다.
- **REQ-B2CENGINE-009** (Where): D-ENGINE-11이 입력 적응 방식((c) 분류 호출 후 질문 선택 또는 (d) 클라이언트 경량 분류)으로 확정된 경우, 01-B 질문 단계에 진입할 때 시스템은 분류가 범위 안 사고 유형이면 그 유형에 대응하는 질문 세트를, 분류할 수 없으면 사고 유형 특정 표현이 없는 일반 질문 세트를 표시한다. 질문 흐름은 REQ-B2CDIAG-010~012를 유지한다. D-ENGINE-11이 (a) 또는 (b)로 확정되면 이 요구사항은 적용되지 않는다(각 옵션의 귀결은 `design.md` §7).

### 3.3 판정 근거 데이터 관리 (Where)

- **REQ-B2CENGINE-010** (Where): 엔진이 판정 근거 데이터(D-ENGINE-02가 정하는 원천)를 사용하는 경우, 시스템은 그 데이터의 모든 변경에 버전을 부여하고 변경마다 소유 역할(D-ENGINE-02)의 확인 기록을 남긴다.

### 3.4 실행 경계 · fixture 격리 · 실패 (Ubiquitous / Unwanted / Event-driven)

- **REQ-B2CENGINE-011** (When): 01 진단 중 단계가 엔진을 호출했을 때, 시스템은 결과 있음 / 결과 없음 / 오류 전이를 그 엔진 결과(REQ-B2CENGINE-002)만으로 결정하며, 입력 문자열 자체에 대한 고정 판정(고정 표본 문장과의 일치 여부, 특정 단어 포함 여부)을 하지 않는다.
- **REQ-B2CENGINE-012**: 시스템은 `productionReady`가 참이고 `reviewEnabled`가 거짓인 게이트 상태에서 어떤 입력·URL로도 fixture 결과(골절 사례 고정 결과 포함)에 도달할 수 있게 해서는 안 되며, 01-D·01-E 화면은 "데모/검토용 목업" 표기를 결과가 `devStep` 강제 렌더링이나 fixture 판정처럼 엔진 밖에서 만들어진 경우에만 렌더링하고 엔진이 산출한 `cannot-determine`·`error`에는 렌더링하지 않는다(REQ-B2CDIAG-024 유지).
- **REQ-B2CENGINE-013**: 시스템은 외부 AI 자격증명과 비공개로 분류된 판정 근거 데이터를 클라이언트 번들에 포함해서는 안 된다(공개·비공개 분류는 D-ENGINE-02가 정한다).
- **REQ-B2CENGINE-014** (When): 엔진 호출이 시간 초과·외부 공급자 오류·응답 형식 오류로 실패할 때, 시스템은 01-E(분석 오류)를 표시하며 입력을 보존하고(REQ-B2CDIAG-014), fixture나 근거 없는 기본 결과로 대체해서는 안 된다.

### 3.5 결과 식별 · 영속성 (Where / Unwanted)

- **REQ-B2CENGINE-015** (Where): D-ENGINE-05가 서버 검증 가능한 결과 식별((b)·(c)·(d))으로 확정된 경우, 상담 신청이 제출될 때 서버는 `resultId`가 엔진이 발급한 것인지 검증하며, 발급되지 않았거나 변조된 `resultId`로는 상담을 접수해서는 안 된다. D-ENGINE-05가 만료를 포함하는 방식으로 확정된 경우에는 만료된 `resultId`로도 접수해서는 안 된다(이 만료 절은 REQ-B2CCONSULT-009와 충돌하므로 N1의 amendment 경로가 선행한다). D-ENGINE-05 (b)(서버 비밀로 서명)로 확정된 경우 서명 비밀이 없거나 비어 있으면 서버는 `resultId`를 발급하지 않고 접수 검증은 어떤 `resultId`도 통과시키지 않는다 — 빈 값을 키로 서명하거나 검증하지 않는다(fail-closed).
- **REQ-B2CENGINE-016**: 시스템은 D-ENGINE-05가 보존 기간과 삭제 절차를 포함해 허용하기 전에는 자유 문장 입력과 추가 질문 답변 원문을 서버에 영구 저장해서는 안 된다.

### 3.6 개인정보 · 외부 AI · 남용 방지 (Where / Unwanted / Ubiquitous)

- **REQ-B2CENGINE-017** (Where): 엔진이 서버 경계 뒤에서 실행되는 경우(D-ENGINE-04), 서버는 클라이언트 검증과 무관하게 입력을 다시 검증한다 — 길이 1~200자와 전화번호·주민등록번호 형식 거부(REQ-B2CDIAG-020).
- **REQ-B2CENGINE-018**: 시스템은 자유 문장 입력·추가 질문 답변 원문을 stdout·파일·관측 도구 어디에도 평문으로 기록해서는 안 된다.
- **REQ-B2CENGINE-019** (Where): 엔진이 외부 AI 서비스를 사용하는 경우, 시스템은 D-ENGINE-06이 허용한 최소 필드 집합 밖의 데이터를 외부 AI 서비스로 전송해서는 안 된다.
- **REQ-B2CENGINE-020** (When): 서버 경계 뒤의 엔진이 (가) 진단 동의 확인(01-A2) 표지 — 요청이 필수 동의 완료 이후임을 엔진 경계가 확인할 수 있는 값(형태는 N4) — 가 없는 요청, 또는 (나) 01 노출 게이트 `shouldRenderDiagnosis`(단일 헬퍼 `computeDiagnosisFlags`, REQ-B2CRESULT-012)가 거짓인 상태에서 도착한 요청을 받을 때, 엔진은 요청을 처리하지 않고 정의된 거절 결과로 거부하며 외부 AI를 호출하지 않는다. (나)는 `design.md` §9.2가 런타임 게이트((c)·(d))를 택한 경우 REQ-B2CENGINE-023의 증거 부재로 `productionReady`가 거짓인 경우를 포함한다. 엔진이 클라이언트에서만 실행되면(D-ENGINE-04 (1)) 서버 경계가 없으므로 이 요구사항은 적용되지 않으며, 같은 게이트는 REQ-B2CDIAG-025에 따라 페이지 경로에서 평가된다.
- **REQ-B2CENGINE-021** (Where): 엔진이 서버 경계 뒤에서 실행되는 경우, 엔진 경계는 요청률과 입력 크기에 상한을 두고(값은 설정으로 주입한다) 초과한 요청을 처리 없이 거부한다.

### 3.7 평가 · 준비 상태 · 환경 (Ubiquitous / State-driven / Where)

- **REQ-B2CENGINE-022**: 시스템은 엔진·판정 근거 데이터·프롬프트가 바뀔 때마다 정답 집합(gold set — 입력별 기대 분류와 기대 항목 status)으로 정확도를 측정해, 정답 집합 버전·엔진 버전·지표별 측정값을 담은 기록을 남긴다. 합격 기준값은 D-ENGINE-09가 정하며 이 SPEC은 수치를 정하지 않는다.
- **REQ-B2CENGINE-023** (While): 엔진 준비 증거 중 하나라도 없는 동안, 일반 사용자 노출 경로(`productionReady` 경로)는 열려서는 안 된다 — `DIAGNOSIS_ENGINE_READY`가 `true`로 설정되어도 마찬가지다. 이 차단을 런타임 게이트로 구현할지 CI 검사로 구현할지는 `design.md` §9.2가 정한다. 엔진 준비 증거는 다음 중 해당하는 항목 전부다 — (i) 현재 판정 근거 데이터 버전의 확인 기록(REQ-B2CENGINE-010), (ii) 현재 엔진·정답 집합 버전의 측정 기록(REQ-B2CENGINE-022), (iii) D-ENGINE-09 서명 기록, (iv) 엔진이 외부 AI를 사용하는 경우 법무 확인 기록(진단 동의 상세의 "외부 AI 서비스 전송 여부" 문구 식별자와 전송 필드 집합 식별자의 일치 확인, 구성은 `design.md` §9.3). 같은 차단은 페이지 경로뿐 아니라 서버 경계 뒤의 엔진에도 적용된다(REQ-B2CENGINE-020 (나)). 이와 별개의 불변 조건으로, 이 SPEC의 산출물 중 시험 코드가 아닌 것은 `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 지점을 만들어서는 안 된다(비-테스트 코드의 범위와 검사 명령은 AC-B2CENGINE-023 시나리오 5가 정의한다).
- **REQ-B2CENGINE-024** (Where): D-ENGINE-01이 LLM을 사용하지 않는 엔진 구조로 확정된 경우 앱 부팅은 `GEMINI_API_KEY`를 요구해서는 안 되며(현재 `lib/env.ts:134-136`은 `LLM_PROVIDER_MODE !== "deterministic"`이면 요구한다), LLM을 사용하는 구조로 확정된 경우 키 부재를 부팅 시 명시적으로 보고한다. 이 요구사항은 완료된 REQ-RESEARCH-012를 바꿀 수 있다(N6).
- **REQ-B2CENGINE-025**: 시스템은 외부 네트워크 호출 없이 엔진의 세 결과(`determined`·`cannot-determine`·`error`)를 모두 재현할 수 있는 시험 구성을 제공한다.

### 미해결 확인 사항 (Open Clarification)

사용자·법무가 결정하기 전에는 확정할 수 없는 항목이다. 결정 행(D-ENGINE-xx)은 `plan.md` §B와 `progress.md` Open Decisions에 있다.

- [NEEDS CLARIFICATION: N1 — 상담 접수 계약 변경 경로와 `resultId` 만료 충돌] REQ-B2CENGINE-015는 `app/api/consultations/route.ts`와 `lib/consult/schema.ts`(SPEC-B2C-CONSULT-001, `status: in-progress`)의 변경을 요구할 수 있다. CONSULT-001 본문을 amendment로 고칠지, 이 SPEC의 run-phase 마일스톤에서 변경하고 CONSULT-001에 참조만 남길지 확인이 필요하다. 이와 별개로 두 가지가 명시적으로 충돌한다. (1) REQ-B2CCONSULT-009(`spec.md:79`)는 새로고침·뒤로가기 재현을 위한 별도의 신선도(TTL) 검사를 금지한다 — `resultId` 만료는 D-ENGINE-05가 "만료 있음"을 택할 때만 필요하고, 그 경우 이 요구사항의 amendment가 먼저 필요하다. "만료 없는 서명 토큰"은 충돌하지 않는다. (2) REQ-B2CCONSULT-019와 `SPEC-B2C-CONSULT-001/design.md:62`는 `resultId`가 서버 검증 불가인 것을 수용된 잔여 위험으로 기록했다 — D-ENGINE-05 (b)~(d)는 그 수용을 뒤집는다.
- [NEEDS CLARIFICATION: N2 — 서버 통과와 "서버 저장 금지"의 양립] 서버 경계 뒤에서 엔진을 실행하되 저장하지 않는 호출이 REQ-B2CDIAG-004/021의 "클라이언트 메모리 안에서만 관리"와 양립하는지, 아니면 두 요구사항의 amendment가 필요한지 확인이 필요하다. D-ENGINE-04/05 선택에 따라 달라진다.
- [NEEDS CLARIFICATION: N3 — 완료된 RESULT-001 요구사항의 대체 처리] REQ-B2CRESULT-009/010/011을 완료 상태 SPEC의 in-place amendment로 정리할지, 이 SPEC의 후속 기록만 남길지 확인이 필요하다. e2e 입력 이행(AC-B2CENGINE-025)이 이 결정에 의존한다.
- [NEEDS CLARIFICATION: N4 — 진단 동의 버전 식별자] REQ-B2CENGINE-020의 "동의 확인 표지"에 담을 값(동의 정책 버전)이 진단 쪽에는 없다. 상담 쪽은 `CONSENT_POLICY_VERSION = "2026-09-25-v1"`(`lib/consult/consent-policy.ts:8`)가 있으나 진단 동의 상세 6개 문구는 아직 placeholder다(`components/diagnosis/consent-detail-content.tsx:13-18`). D-ENGINE-07 확정 후에 식별자 형태를 정해야 한다.
- [NEEDS CLARIFICATION: N5 — `DIAGNOSIS_ENGINE_READY` 전환 소유 확인] REQ-B2CDIAG-025와 REQ-B2CRESULT-024는 전환을 "후속 SPEC의 몫"이라고만 적었다. 이 SPEC은 전환 소유를 SPEC-B2C-LAUNCH-001로 명시하는데, 그 SPEC이 아직 없으므로 범위에 이 소유가 포함되는지 확인이 필요하다.
- [NEEDS CLARIFICATION: N6 — 완료된 REQ-RESEARCH-012와 REQ-B2CENGINE-024의 충돌 처리] SPEC-RESEARCH-001(`status: completed`)의 REQ-RESEARCH-012는 `LLM_PROVIDER_MODE`가 deterministic이 아닌 app 스코프 부팅에서 `GEMINI_API_KEY`를 필수로 요구하며, 구현은 `lib/env.ts:130-136`, 시험은 `lib/env.test.ts:94,105-107`(AC-RESEARCH-011a/011b)이다. D-ENGINE-01이 LLM을 쓰지 않는 구조((1))를 택하면 REQ-B2CENGINE-024가 이 요구를 제거하므로 amendment가 필요하다 — 요구의 조건을 `LLM_PROVIDER_MODE`가 아니라 LLM 사용 경로의 활성 여부로 바꾸는 in-place amendment로 정리할지, 이 SPEC의 후속 기록만 남기고 키 요구를 유지할지 확인이 필요하다. D-ENGINE-01이 LLM을 쓰는 구조((2)·(3))를 택하면 충돌이 없다.
- [NEEDS CLARIFICATION: N7 — `productionReady` 정의 변경과 `verify:flag-runtime`] (1) REQ-B2CENGINE-023의 차단을 런타임 게이트로 구현하는 `design.md` §9.2 (c)·(d)는 REQ-B2CDIAG-025가 정확히 정의한 `productionReady`에 증거 조건을 더하므로 amendment다. §9.2 (b)(CI 검사만)는 `productionReady` 정의를 바꾸지 않지만, CI는 배포 시점에 증거 없는 변경을 막을 뿐 운영 환경 변수가 증거와 무관하게 켜지는 경우는 관측하지 못한다 — 이 범위가 REQ-B2CENGINE-023의 "노출 경로가 열려서는 안 된다"를 충족하는지, 아니면 (b)에도 런타임 게이트가 필요한지 확인이 필요하다. (2) `computeDiagnosisFlags`(`lib/diagnosis/flags.ts`)의 입력이 바뀌면 `scripts/verify-flag-runtime.ts`가 영향받는다 — 이 스크립트는 기대 게이트 상태를 env만 쓰는 `computeDiagnosisFlags`로 계산하고(`:165-181`, `:174`에서 `DIAGNOSIS_ENGINE_READY`를 입력으로 구성), 엔진을 켠 조합(`PROD_READY`·`ALL_ON`, `:447-449`)을 실제 서버에 대해 검증하며(`:293`에서 임시 서버 env에 대입), 시험은 `scripts/verify-flag-runtime.test.ts`다. 증거가 없는 서버에서 이 조합의 게이트 기대값이 달라진다. REQ-B2CDIAG-025 amendment와 이 스크립트·시험의 갱신 경로를 N3와 같은 결정에 묶을지 확인이 필요하다.
- [NEEDS CLARIFICATION: N8 — 02 mock 표기 부재와 `visual:verify` 동결] (1) 02의 `?devFixture=fracture` review 전용 경로에는 렌더링되는 mock 표기가 없다(`components/result/`·`app/result/` 검색에서 주석 외 표기 없음, `result-view.tsx:82-87,153`이 표기 없이 fixture를 표시). 이 SPEC은 이 확인 사항이 결정되기 전에는 그 표기를 계획하지 않는다 — 표기를 추가하면 02의 시각 기준선이 바뀌어 REQ-B2CCONSULT-025·REQ-B2CRESULT-025의 동결과 부딪친다. 이 경로를 REQ-B2CDIAG-024의 기존 상태로 두어도 되는지, 표기를 새 요구로 추가할지 확인이 필요하다. (2) fixture 격리가 빌드 시 제외((c), `design.md` §9.1)로 정해지면 `scripts/visual-verify.ts`(`:337` 부근 `?devFixture=fracture` 캡처)와 `playwright.config.ts:82-84`의 review 플래그 의존 때문에 별도 review 빌드가 필요하다. 이때 바뀌는 것은 빌드·플래그 배선뿐이며 15화면 정의·허용 오차·승인 debt는 바꾸지 않는다 — 그 범위를 넘으면 REQ-B2CCONSULT-025 amendment가 필요한지 확인이 필요하다.

## 4. Out of Scope

### Out of Scope — 상담 운영 활성화

- `CONSULT_POLICY_READY`·`ENABLE_CONSULT_FLOW` 전환, 상담 접수 담당 창구·응답 기한·상태 어휘·보존 기간 확정, 03-B/03-C/03-D 스텁의 목적지 확정 (SPEC-B2C-CONSULTOPS-001)

### Out of Scope — 출시 게이트 · 배포

- `DIAGNOSIS_ENGINE_READY`·`ENABLE_DIAGNOSIS_FLOW`를 프로덕션에서 `true`로 전환하는 행위, 내부 시험 공개와 일반 사용자 공개의 판정 기준 확정, `.github/workflows/deploy.yml`의 smoke check 변경 (SPEC-B2C-LAUNCH-001, 트리거는 REQ-B2CDIAG-023/AC-B2CDIAG-024)

### Out of Scope — 상담 후속 시스템

- CRM 연동, 상담 신청 알림(이메일·메신저·웹훅), 상담 신청 조회·취소 화면

### Out of Scope — 증권·문서 입력

- 보험증권 이미지 업로드와 OCR, 가입 여부의 실제 외부 조회 (사용자 결정으로 범위에 들어오지 않는 한)

### Out of Scope — 법률 문구 확정

- 진단 동의 상세 6개 문구의 실제 문구(`components/diagnosis/consent-detail-content.tsx:13-18`), 02 면책 문구의 법무 검토 결과, 개인정보 처리방침 문구, 법무 확인 기록의 법적 결론 — 이 SPEC은 결정 대기 항목, 차단 관계, 기록의 구성 항목만 적는다

### Out of Scope — 02 review 전용 fixture 화면의 표기

- 02의 `?devFixture=fracture` 경로에 mock 표기를 추가하는 일(N8이 결정되기 전에는 계획하지 않는다)

### Out of Scope — 기존 B2B 자산 정리

- `lib/pipeline/`, `db/seed/evidence*`의 삭제·이전. D-ENGINE-01 확정 후 필요하면 별도 정리 작업으로 처리한다(REQ-B2CFOUND-007, `SPEC-B2C-FOUNDATION-001/spec.md:57-59`은 결정 전 보존을 요구한다)

## 5. 참고 문서

- `.moai/specs/SPEC-B2C-FOUNDATION-001/design.md` §2(`lib/coverage/` 후보), §4(decision gate, 157-161행)
- `.moai/specs/SPEC-B2C-DIAGNOSIS-001/spec.md`, `.moai/specs/SPEC-B2C-RESULT-001/spec.md`, `.moai/specs/SPEC-B2C-CONSULT-001/spec.md`, `.moai/specs/SPEC-RESEARCH-001/spec.md`
- `.moai/project/tech.md` § 담보 매칭 로직 — 미결정 사항(108-136행)
- 이 SPEC의 `design.md`(대안 비교), `research.md`(코드 증거 장부), `plan.md`, `acceptance.md`, `progress.md`
