---
id: SPEC-B2C-RESULT-001
title: "02 보상 진단 결과 (Plan-Phase)"
version: "0.1.0"
status: draft
created: 2026-09-22
updated: 2026-09-22
author: Nexsol
priority: P1
phase: "v0.18.0 target"
module: "app/result/, components/result/, lib/diagnosis/"
lifecycle: spec-anchored
tags: "b2c-result, coverage-grid, funnel-02, fact-chip, accessibility, plan-only"
tier: L
related_specs: [SPEC-B2C-DIAGNOSIS-001]
---

## HISTORY

- 2026-09-22: 최초 작성 (Nexsol) — B2C 3단계 퍼널(01 질문 입력 → 02 보상 진단 결과 → 03 상담 신청) 중 **① 질문 입력 및 진단**(SPEC-B2C-DIAGNOSIS-001, `status: completed`)에 이어 **② 보상 진단 결과** 화면의 plan-phase 문서만 작성한다. 실제 화면·컴포넌트·API 구현은 후속 `/moai run SPEC-B2C-RESULT-001`의 범위이며, 이번 커밋에는 코드 변경이 포함되지 않는다. 디자인 SSOT는 `design/MIGRATION-PLAN.md`(§2 ②, §4)이다.
- 2026-09-22: review 피드백 반영 amendment(같은 plan-phase, 재감사 전) — ① fixture 안전 게이트를 명시적 boolean 매개변수 기반으로 재정의(REQ-B2CRESULT-009), ② `DiagnosisResult`/`CoverageItem` 계약을 resultId·schemaVersion·구조화 필드·discriminated union으로 확장(REQ-B2CRESULT-001/005/006), ③ 01→02 인계 채널을 "완전히 구성된 `DiagnosisResult` 저장" 단일 흐름으로 통일(REQ-B2CRESULT-010), ④ `sessionStorage` 수명 정책을 "1회 읽고 즉시 삭제"에서 "탭 세션 동안 유지 + 명시적 트리거로만 삭제"로 변경(REQ-B2CRESULT-013/016), ⑤ 상담 CTA stub 형태를 `aria-disabled` 기반으로 확정(REQ-B2CRESULT-023). REQ/AC 개수는 각각 25건으로 불변(기존 ID의 본문만 수정, 신규 ID 없음). (plan-auditor iteration 3 — PASS 0.96, 감사 대상 커밋 `d274161`, D1 수정 커밋 `0d10516` — 이 amendment 직후 완료됨. 상세: `progress.md` §G.)
- 2026-09-22: 실제 디자인 화면(02/M02/M02-B/M02-C/M02-D) 5종 재대조 amendment(같은 plan-phase, iteration 3 감사 이후) — 실제 화면이 요구하는 동적 데이터 요소 중 계약에서 빠져 있던 부분을 채운다: ① `InputAccidentSummary`를 `category`/`description` 2필드에서 `title` + `when`/`where`/`mechanism`/`bodyPart` 4개 `AccidentSummaryFact`(label+value)로 구조화(REQ-B2CRESULT-001), ② `priorityChecks: string[]`를 `PriorityCheck[]`(id/title/description/targetCategory)로 구조화해 "먼저 확인할 항목" 카드의 제목·설명·이동 대상을 함께 표현(REQ-B2CRESULT-001), ③ `multiMatch`/`subscriptionGenBadge` 같은 단일 목적 optional 필드를 `CoverageBadge[]`(id/label/kind, kind는 9종 고정 유니언) 배열로 일반화(REQ-B2CRESULT-001/005), ④ `CoverageAmount`(kind: range/fixed/unavailable, 3종)를 `BenefitDisplay`(kind: range/fixed/formula/conditional/unavailable, 5종, 모든 분기가 `label`+`displayText` 동시 보유)로 확장하고 필드명을 `amount`→`benefit`으로 변경, `CoverageItemBase`에서 항상 필수 필드로 승격(REQ-B2CRESULT-006), ⑤ `FactChip`을 결합 문자열(`label: string`, 예 "수술 여부: 예")에서 `AccidentSummaryFact`를 상속하는 `{ questionId, label, value }` 구조로 변경 — 실제 화면의 라벨/값 2단 타이포그래피 표현과 일치시킴, 상단 "추가 질문 답변" strip은 신규 저장 필드가 아니라 `items[].factChips`의 questionId 기준 중복 제거 파생값(`collectAnsweredFacts`)으로 정의(REQ-B2CRESULT-001). REQ/AC 개수는 각각 25건으로 불변(REQ-B2CRESULT-001/005/006 및 대응 acceptance.md AC의 본문·추가 시나리오만 확장, 신규 ID 없음). 이 amendment는 iteration 3이 감사한 artifact 내용을 재차 대체하므로 iteration 3의 PASS 0.96 verdict는 이 시점 기준 stale이다 — plan-auditor는 이미 표준 3-iteration 예산(iteration 1/2/3)을 모두 소진했으므로, 추가 재검토(iteration 4)는 orchestrator/user의 명시적 승인이 필요하다(`progress.md` §G 참고). `plan_status`는 `audit-ready`로 재확인되지 않는다.

---

## 1. 배경 (Why)

`design/MIGRATION-PLAN.md`가 정의한 B2C 3단계 퍼널에서, 01 화면(질문 입력 → 동의 → 추가 질문 → 진단 중)은 이미 기능 플래그 뒤에 구현이 완료됐다(SPEC-B2C-DIAGNOSIS-001). 그러나 01의 "진단 중" 상태 다음에 오는 실제 결과 화면(02)은 존재하지 않는다 — 01 SPEC은 "결과 있음" 분기를 의도적으로 Out of Scope로 남겨두었다(`design.md` §18.2: "미래 02 결과 화면으로 넘어가는 경계 … 실제 라우팅(예: `router.push('/result')`)은 02 SPEC이 구현한다").

`product.md`의 핵심 메시지 "이것도 되고 저것도 되고, 이만큼이나 나온다"는 02 화면에서 완성된다 — 사용자가 놓치고 있던 담보를 4카테고리 그리드로 전부 펼쳐 보여주는 것이 이 SPEC의 존재 이유다. 이 SPEC은 **데이터 계약(DiagnosisResult 타입)과 UI만** 정의한다 — 실제 담보 매칭 엔진(정적 규칙 vs Gemini vs 하이브리드, `tech.md` § 담보 매칭 로직 — 미결정 사항)은 여전히 미결정이며, 이 SPEC의 범위 밖이다.

## 2. 범위 (Scope)

### 포함 화면 (Desktop 1 + Mobile 4 = 5개, `design/exports/` 기준)

| 화면 | 노드 ID | Export 파일 |
|---|---|---|
| 02 · 보상 진단 결과 (Desktop, 4카테고리 전체 펼침) | `A1oCfT` | `02-보상-진단-결과.png` |
| M02 · 보상 진단 결과 (Mobile, 실손의료비 탭 기본) | `OMjpE` | `M02-보상-진단-결과.png` |
| M02-B · 결과 정액 담보 탭 | `nkNMP` | `M02-B-결과-정액-담보-탭.png` |
| M02-C · 결과 후유장해 탭 | `WyBBk` | `M02-C-결과-후유장해-탭.png` |
| M02-D · 결과 특별 보상 탭 | `RboYG` | `M02-D-결과-특별-보상-탭.png` |

### 산출물 (이번 plan-phase)

`spec.md`(본 문서) · `plan.md` · `acceptance.md` · `design.md` · `research.md` · `progress.md`. 코드, 스키마, API, E2E 테스트는 포함하지 않는다 — 모두 후속 run-phase 산출물이다.

후속 run-phase의 산출물 범위는 4갈래로 나뉜다 — ① 프로덕션 애플리케이션 코드(`app/result/`, `components/result/`, `lib/diagnosis/` 신설 + `app/page.tsx`/`components/diagnosis/step-loading.tsx`/`components/diagnosis/diagnosis-flow.tsx` 최소 확장), ② 테스트(단위·컴포넌트 테스트 및 `e2e/` 신규 파일 + `scripts/visual-verify.ts` 확장), ③ 문서(`.moai/` SPEC 산출물 및 프로젝트 문서), ④ 배포(이 SPEC은 배포 워크플로를 수정하지 않는다 — `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY` 전환은 여전히 이 SPEC의 Out of Scope). 아래 `module:` frontmatter 필드는 이 중 ①(프로덕션 코드) 범위만을 가리키며, 전체 4갈래 범위는 `plan.md` §D를 참고한다.

## 3. 요구사항 (GEARS)

### 3.1 데이터 계약 · 제품 원칙 (Ubiquitous)

- **REQ-B2CRESULT-001**: 시스템은 `DiagnosisResult` 타입(`lib/diagnosis/types.ts`)을 02 화면 데이터의 단일 SSOT로 정의하며, 담보 카테고리는 정확히 4개(실손 의료비 · 정액 담보 · 후유장해 · 특별 보상)로 고정한다 — 카테고리 집합은 케이스별로 확장되지 않는다. `DiagnosisResult`는 `resultId`·`schemaVersion`으로 각 결과 인스턴스를 식별·버전화하며, 02/M02 화면이 실제로 렌더링하는 모든 동적 문구·구조를 다음과 같이 데이터로 포함한다 — 컴포넌트 소스 코드에 케이스 특정 문구를 하드코딩하지 않으며, 모든 동적 문구는 이 데이터 또는 `lib/diagnosis/` 공용 상수 모듈에서만 온다:
  - **사고 내용 구조화 요약**(`inputSummary: InputAccidentSummary`): 상단 "입력하신 사고 내용" 카드가 표시하는 제목(`title`)과 "언제"/"어디서"/"어떻게"/"어디를" 4개 사실을 각각 독립된 `AccidentSummaryFact`(`{ label, value }`) 필드(`when`/`where`/`mechanism`/`bodyPart`)로 보유한다 — `/result`는 이 4개 필드를 그대로 렌더링할 뿐 `rawInput`을 재파싱해 값을 추출하지 않는다.
  - **확인 우선순위**(`priorityChecks: PriorityCheck[]`): "먼저 확인할 항목" 카드의 각 항목을 문자열 배열이 아니라 `{ id, title, description, targetCategory }` 구조로 표현한다 — `title`/`description`은 카드에 표시되는 문구이며, `targetCategory`는 그 항목을 선택했을 때 이동할 담보 카테고리(`CoverageCategory`)다.
  - **담보별 확인 배지**(`CoverageItem.badges: CoverageBadge[]`): "가입 확인 필요"/"보험증권 확인 필요"/"시설 가입 여부 확인"/"단체보험 가입 여부 확인" 등 카드별로 달라지는 보조 배지를 `{ id, label, kind }` 배열로 표현한다 — `kind`는 `"subscription-check" | "generation-check" | "policy-type-check" | "hospital-type-check" | "facility-check" | "group-insurance-check" | "individual-check" | "multi-match" | "custom"` 고정 유니언이며, 이전 초안의 `multiMatch?: boolean`/`subscriptionGenBadge?: string` 같은 단일 목적 optional 필드는 이 배열 하나로 대체되어 더 이상 존재하지 않는다.
  - **보장 방식·가입금액 표시**(`CoverageItem.benefit: BenefitDisplay`, REQ-B2CRESULT-006 상세): 모든 카드가 공통으로 갖는 필수 필드다.
  - **카테고리별 설명·확인이 필요한 이유(whyCheck)·근거·추가 정보 필요 안내·필요 서류**: 기존과 동일하게 `CoverageItem`의 `description`/`whyCheck`/`evidenceRefs`/`additionalInfoNote`/`requiredDocuments` 필드로 데이터화된다.
  - **응답 Fact Chip**(`CoverageItem.factChips: FactChip[]`, REQ-B2CRESULT-007/008 상세): `FactChip`은 `AccidentSummaryFact`를 상속해 `{ questionId, label, value }` 구조를 가지며(예: `label: "수술 여부"`, `value: "수술 받음"`), 담보 카드 위에 표시되는 라벨-값 2단 타이포그래피를 그대로 데이터화한다. 상단 "입력하신 사고 내용" 카드의 "추가 질문 답변" strip은 별도 저장 필드가 아니라, `items[].factChips`를 `questionId` 기준으로 중복 제거해 먼저 발견된 순서를 유지하는 파생 함수(`collectAnsweredFacts`, REQ-B2CRESULT-002 인접 `lib/diagnosis/aggregate.ts`)의 결과다 — `/result`는 이 파생값을 렌더링할 뿐 `answers`를 별도로 재순회해 strip을 직접 구성하지 않는다.
- **REQ-B2CRESULT-002**: 시스템은 상단 집계 배너의 네 숫자(전체 분석 담보 · 검토 대상 · 추가 정보 필요 · 가능성 낮음)를 `DiagnosisResult.items` 배열로부터 렌더링·계산 시점에 매번 동적으로 산출하며, 어떤 예시 숫자도(예: 디자인 목업의 15/8/6/1) 코드에 상수로 고정하지 않는다.
- **REQ-B2CRESULT-003**: 시스템은 Desktop에서 4카테고리 전체를 한 페이지에 펼쳐 렌더링하고, Mobile에서는 카테고리 단일 선택 탭(기본 탭: 실손 의료비)으로 한 번에 하나만 렌더링한다.
- **REQ-B2CRESULT-004**: 시스템은 Desktop과 Mobile 두 레이아웃이 완전히 동일한 `DiagnosisResult` 데이터 원본을 사용하도록 보장한다 — 레이아웃별로 데이터를 별도 가공·재요청하지 않는다.
- **REQ-B2CRESULT-005**: 시스템은 각 담보 카드에 3톤 상태(검토 대상 / 추가 정보 필요 / 가능성 낮음)를 표시하며, "가능성 낮음" 상태의 담보도 숨기지 않고 사유(reason note)와 함께 항상 노출한다. `reasonNote`는 `CoverageItem` 타입 수준에서 status별 discriminated union으로 강제되는 필드다 — status가 "가능성 낮음"인 분기에서는 필수(non-optional)이며, 그 외 분기에서는 선택(optional)이다. `benefit`(REQ-B2CRESULT-006) 필드는 이 discriminated union과 독립적으로 `CoverageItemBase`가 정의하는 공통 필수 필드다 — "가능성 낮음" 분기에서도 `benefit` 자체가 생략되지 않으며, `benefit.kind`가 `"unavailable"` 또는 `"conditional"`로 "산정을 시도하지 않음"/"확인 전 판단 불가"를 표현할 뿐이다(과거 초안의 `amount?: CoverageAmount` optional 패턴은 폐기됨).
- **REQ-B2CRESULT-006**: 시스템은 담보 카드의 보장 방식·가입금액 표시를 `CoverageItem.benefit`이 제공하는 `label`+`displayText` 쌍 그대로 렌더링하며(단위 변환 없음), 클라이언트에서 금액을 재계산·재합산하지 않는다 — 렌더 경로의 `benefit` 값 필드에는 어떤 산술 연산자도 적용하지 않는다. `benefit: BenefitDisplay`는 `kind`로 판별되는 5분기 discriminated union(`"range" | "fixed" | "formula" | "conditional" | "unavailable"`)이며, 모든 분기가 카드에 표시되는 라벨(예: "보장 방식", "일반적인 가입금액 예시", "현재 정보상")과 `displayText`를 함께 보유한다 — `range`/`fixed` 분기만 추가로 `min`/`max`/`value` 원시값을 보유하고, 이 원시값은 `displayText` 생성을 위한 참고용일 뿐 렌더 경로가 직접 조합하지 않는다.

### 3.2 Fact Chip 연동 — 01→02 데이터 흐름 (Event-driven)

- **REQ-B2CRESULT-007** (When): 01-B 추가 질문에 대한 사용자 응답이 결과 데이터에 존재할 때, 시스템은 해당 응답을 대응하는 담보 카드 위에 Fact Chip UI 요소로 표시한다.
- **REQ-B2CRESULT-008** (When): 특정 추가 질문에 대한 응답이 없을 때(건너뛰기 등), 시스템은 그 질문에 대응하는 Fact Chip을 생성하지 않는다.

### 3.3 01→02 연결 — review 전용 골절 사례 fixture (Where / Event-driven)

- **REQ-B2CRESULT-009** (Where): `ENABLE_DIAGNOSIS_DEV_STATES` 서버 전용 환경 변수(REQ-B2CDIAG-017, 기본값 `false`)가 `true`인 비프로덕션 환경에서, 시스템은 01 진단 중(`loading`) 단계의 mock 판정 로직에 "골절 사례 fixture" 분기를 추가로 제공한다 — 이 분기는 `DIAGNOSIS_ENGINE_READY`를 `true`로 전환하지 않으며, 이 SPEC이 전달하는 코드에는 그 지점이 존재하지 않는다. 이 분기를 구동하는 함수(또는 그 호출부)는 `reviewEnabled` 상태를 나타내는 **명시적 boolean 매개변수**를 전달받아 판정하며, `<DiagnosisFlow />`가 마운트되었는지 여부 등 다른 상태로부터의 암묵적 추론에 의존하지 않는다 — `productionReady=true AND reviewEnabled=false` 조합(즉 `<DiagnosisFlow />`는 마운트되었으나 review 플래그는 꺼진 상태)에서도 이 boolean 게이트가 fixture 분기 실행을 독립적으로 차단한다. §9의 review 전용 직접 진입 파라미터(`?devFixture=fracture`)도 동일한 boolean 게이트를 재사용하며 `reviewEnabled=false`에서는 무시된다.
- **REQ-B2CRESULT-010** (When): 사용자 입력이 지정된 골절 사례 fixture 입력 문자열과 정확히 일치할 때(부분 문자열 매칭이 아님), 시스템은 `buildFractureResult(rawInput, answers)`로 완전히 구성한 `DiagnosisResult` 객체(01-B 추가 질문 응답을 포함)를 세션 저장소(`sessionStorage`)에 기록하고 `/result` 라우트로 이동한다 — `rawInput`과 `answers`만 저장하고 결과 구성을 `/result` 쪽으로 미루지 않는다.
- **REQ-B2CRESULT-011**: 시스템은 기존 01 mock 판정 분기(정확 문자열 "오류" 포함 시 `error`, 그 외 기본값 `result-none`)의 동작을 이 SPEC의 확장 이후에도 그대로 유지한다 — `e2e/diagnosis-flow-01.spec.ts`의 `RESULT_NONE_INPUT`("무릎 골절로 수술을 받았어요")과 `ERROR_INPUT`("분석 중 오류가 발생했어요")은 계속 각각 `result-none`/`error`로 판정되어야 한다.
- **REQ-B2CRESULT-012**: 시스템은 `/result` 페이지의 프로덕션 활성화 게이트 계산(`productionReady`/`reviewEnabled`/`shouldRenderDiagnosis`)을 `app/page.tsx`와 공유하는 단일 헬퍼 함수(`lib/diagnosis/flags.ts`)로 통합하며, 두 라우트 어디에도 게이트 계산 로직을 중복 작성하지 않는다.

### 3.4 결과 상태 계약 — 02 전용 (Event-driven)

- **REQ-B2CRESULT-013** (When): `sessionStorage`에 유효한 진단 결과 데이터가 없는 상태에서 사용자가 `/result`에 접근할 때(직접 접근, 또는 이 탭 세션에서 한 번도 01→02 흐름을 거치지 않은 경우), 시스템은 02 전용 "결과 없음" 안내 상태를 표시하고 01 입력 화면으로 돌아가는 경로를 제공한다 — 이는 01의 `result-none`(01-D) 상태와는 별개의, 02 자체의 데이터 부재 상태다. `sessionStorage`에 유효한 데이터가 이미 있는 상태의 새로고침·뒤로가기는 이 상태를 트리거하지 않는다(REQ-B2CRESULT-016 참고).
- **REQ-B2CRESULT-014** (When): `sessionStorage`에 기록된 진단 인계 데이터가 파싱 불가능하거나 스키마와 불일치할 때, 시스템은 애플리케이션을 중단시키지 않고 02 전용 오류 상태를 표시한다.
- **REQ-B2CRESULT-015**: 시스템은 `/result` 페이지가 `useSearchParams()` 또는 클라이언트 전용 데이터 읽기를 수행하는 동안 스켈레톤 로딩 상태(`<Suspense fallback>`)를 렌더링해 레이아웃 시프트를 최소화한다.

### 3.5 기술 원칙 · 저장 정책 (Ubiquitous)

- **REQ-B2CRESULT-016**: 시스템은 01→02 진단 인계 데이터를 서버에 영구 저장하지 않는다 — `sessionStorage`에만 기록하며, 동일 탭 세션 동안 유지한다(새로고침·뒤로가기 후에도 동일한 결과가 다시 표시된다). 저장된 데이터는 다음 세 경우에만 제거된다: (a) 사용자가 새 진단을 시작할 때, (b) 상담 신청을 완료할 때(03 상담 신청 SPEC의 범위 — 이 SPEC은 초기화 트리거 지점만 예약하며 실제 03 연동은 구현하지 않는다), (c) 사용자가 명시적으로 초기화를 요청할 때.
- **REQ-B2CRESULT-017**: 시스템은 `sessionStorage` 키를 프로젝트 네임스페이스가 붙은 전용 키로 사용하며, 다른 기능과 키 충돌이 없도록 한다.
- **REQ-B2CRESULT-018**: 시스템은 Desktop(1440px 기준)과 Mobile(390px 기준) 두 반응형 레이아웃을 제공하며, SPEC-B2C-DIAGNOSIS-001이 확정한 768px 2-way 브레이크포인트(`md:`)를 그대로 재사용한다.

### 3.6 접근성 (Ubiquitous)

- **REQ-B2CRESULT-019**: 시스템은 Mobile 카테고리 탭 전환 시 스크린리더가 탭 목록/선택 상태를 인지할 수 있도록 적절한 ARIA 역할(`tablist`/`tab`/`tabpanel` 또는 동등 패턴)을 부여한다.
- **REQ-B2CRESULT-020**: 시스템은 담보 카드의 3톤 상태를 색상 단독으로 전달하지 않는다 — pill 텍스트 라벨(검토 대상/추가 정보 필요/가능성 낮음)을 항상 함께 표기한다.
- **REQ-B2CRESULT-021**: 시스템은 Mobile 탭 전환 시 포커스를 전환된 카테고리 패널의 제목 요소로 이동시켜 진행 상황을 인지 가능하게 한다.

### 3.7 금지 사항 (Unwanted — shall not)

- **REQ-B2CRESULT-022**: 시스템은 이 SPEC이 작성하는 UI 문구 어디에서도 단정형 보상 확정 문구(예: "받으실 수 있습니다")를 사용해서는 안 된다 — `design/MIGRATION-PLAN.md` §5의 조건부 표현(청구 가능/가능성) 정책을 그대로 따른다.
- **REQ-B2CRESULT-023**: 시스템은 03 상담 신청 화면(및 그 라우팅)이 아직 존재하지 않는 이 SPEC의 범위 안에서, 02/M02 화면의 상담 CTA 버튼을 `aria-disabled="true"` 상태로 렌더링하고, 클릭 또는 키보드 활성화(Enter/Space) 시 실제 페이지 이동 없이 "준비 중" 안내만 표시해야 한다 — 존재하지 않는 라우트로 이동을 시도해서는 안 되며, 버튼은 네이티브 `disabled` 속성으로 포커스 불가능하게 만들지 않고 키보드 포커스·스크린리더 접근이 항상 가능한 상태를 유지해야 한다.
- **REQ-B2CRESULT-024**: 시스템은 이 SPEC이 전달하는 코드 범위 안에서 `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 지점을 만들어서는 안 된다 — 실제 담보 매칭 엔진 연결은 후속 SPEC의 몫이다.
- **REQ-B2CRESULT-025**: 시스템은 기존 `pnpm visual:verify`의 SPEC-B2C-DIAGNOSIS-001 10화면 커버리지를 깨뜨려서는 안 된다 — 이 SPEC이 추가하는 5화면은 기존 화면 정의를 대체가 아니라 추가하는 방식으로만 확장한다.

## 4. Out of Scope

### Out of Scope — 후속 퍼널 단계

- 03 상담 신청 · 손해사정사 연결 화면(및 M03 계열)의 실제 구현, 이름·전화번호 수집, 상담 접수 처리

### Out of Scope — 매칭·AI·데이터

- 보험 가입 여부의 실제 외부 조회
- 보상 가능성 매칭 엔진의 실제 구현(정적 규칙 vs AI, `tech.md` § 담보 매칭 로직 — 미결정 사항 참고) — 이 SPEC은 `DiagnosisResult` 데이터 계약과 UI만 정의하며, 실제 엔진이 그 계약을 어떻게 채울지는 결정하지 않는다
- Gemini 등 외부 AI의 실제 호출
- `lib/pipeline/` 재사용 여부 결정 (담보 매칭 로직 결정과 함께 판단할 후속 SPEC의 몫)
- 신규 DB 영구 저장 구조 설계·마이그레이션
- 02 담보 데이터 확장 — 골절 외 암·뇌혈관·심장·디스크 등 케이스별 담보 세트 데이터 설계(`product.md` §Roadmap A) — 이 SPEC은 골절 사례 1종의 review 전용 fixture만 제공한다

### Out of Scope — 배포·활성화

- `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY`를 프로덕션에서 실제로 `true`로 전환하는 작업, 배포 워크플로(`.github/workflows/deploy.yml`) 수정

### Out of Scope — 법률·확정 문구

- 법률·보험 자문처럼 보이는 확정적 결과 문구
- 01-A2/03의 동의 상세 문구 확정(`design/internal/`의 6개 placeholder) — 이 SPEC은 동의 화면을 다루지 않는다

### Out of Scope — 테스트

- 03 상담 신청 테스트, 01→02→03 전체 E2E, 실제 매칭 엔진 검증, 실제 상담 접수 검증
