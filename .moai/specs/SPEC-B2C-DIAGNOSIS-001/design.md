# Design — SPEC-B2C-DIAGNOSIS-001

이 문서는 후속 run-phase가 그대로 구현할 수 있도록 기술 결정을 코드베이스 조사(`research.md`) 근거로 구체화한다. 이번 plan-phase는 문서만 작성하며, 아래 경로·컴포넌트는 아직 존재하지 않는다.

## 0. 아키텍처 요약

- **단일 route + 클라이언트 상태 머신**: 01/01-A2/01-B/01-C/01-D/01-E는 별도 페이지가 아니라 `app/page.tsx` 하나가 렌더링하는 하나의 상태 머신의 여섯 단계다. 동의 화면(01-A2)은 01 위에 뜨는 오버레이(Modal/Bottom Sheet)이지 별도 화면 전환이 아니다 — 디자인상으로도 01-A2는 01의 배경을 어둡게 깐 채 그 위에 겹쳐진다(§0.1의 캡처 참고).
- **상태는 `?step=` 쿼리 파라미터로 shallow-route** — 뒤로가기(browser back)가 자연스럽게 이전 단계로 이동하도록 브라우저 히스토리에 단계별 항목을 남긴다.
- **서버 저장 없음** — 모든 상태(입력값, 동의 여부, 추가 질문 응답)는 React state(클라이언트 메모리)에만 존재한다. 새로고침 시 사라지는 것이 설계 의도다(REQ-B2CDIAG-015, REQ-B2CDIAG-021).

## 1. 확정된 디자인 결정 — M01-D / M01-E 부재 처리

`design/MIGRATION-PLAN.md` §2④, §9에 따르면 모바일용 결과없음(`M01-D`)·분석오류(`M01-E`) 디자인이 아직 없다. 신규 제작은 이 SPEC의 Out of Scope다.

**결정 (확정)**: Desktop `01-D`/`01-E` 컴포넌트를 반응형으로 그대로 재사용한다 — 768px 미만(Mobile 레이아웃, §13 참고)에서 세로 스택으로 재배치한다. 이는 **기존 Desktop 컴포넌트의 반응형(CSS/Tailwind breakpoint) 재사용**이며, 신규 모바일 디자인 프로덕션(신규 Pencil/Figma 산출물 제작)이 아니다 — 신규 디자인 없이 기존 컴포넌트에 모바일 breakpoint 레이아웃만 추가한다. §13의 브레이크포인트 확정과 함께 이 결정으로 §9의 부재 항목이 해소된다.

## 2. Route 구조와 Server/Client 컴포넌트 경계

```
app/
├── layout.tsx          # 변경 없음 (Server Component, 공통 골격)
├── page.tsx            # [변경] Server Component 래퍼 — productionReady(ENABLE_DIAGNOSIS_FLOW && DIAGNOSIS_ENGINE_READY) 또는 reviewEnabled(ENABLE_DIAGNOSIS_DEV_STATES) 중 하나라도 참이면(shouldRenderDiagnosis, §19) <Suspense><DiagnosisFlow /></Suspense> 렌더링, 그 외(기본값)에는 기존 placeholder 유지
└── globals.css         # 변경 없음

components/
└── diagnosis/          # [신규]
    ├── diagnosis-flow.tsx        # "use client" — 상태 머신 오너, ?step= 쿼리 파라미터 read/write
    ├── step-input.tsx            # 01/M01 — 검색창 + 자주 찾는 사례 칩
    ├── step-consent-modal.tsx    # 01-A2 Desktop — @base-ui/react/dialog 래퍼
    ├── step-consent-sheet.tsx    # M01-A2 Mobile — @base-ui/react/drawer 래퍼
    ├── consent-detail-content.tsx # 01-A3/M01-A3 공용 — 동의 상세 6개 항목(placeholder)
    ├── step-questions.tsx        # 01-B/M01-B — 추가 질문 3문항
    ├── step-loading.tsx          # 01-C/M01-C — 진단 중 단계별 진행 표시
    ├── step-result-none.tsx      # 01-D — 결과 없음
    ├── step-error.tsx            # 01-E — 분석 오류
    └── use-diagnosis-state.ts    # 상태 머신 훅 (React state + useSearchParams)
```

**Server/Client 경계**: `app/page.tsx`는 Server Component로 유지한다(기존 관례와 일치, `layout.tsx`/`not-found.tsx`와 동일 패턴). 실제 상태 전이·이벤트 핸들러·`useSearchParams`/`useRouter`/포커스 관리는 모두 브라우저 API에 의존하므로 `diagnosis-flow.tsx`부터 그 하위 전체가 `"use client"` 경계 안에 있다. 이는 `components/ui/popover.tsx`가 이미 따르는 패턴(`"use client"` + Base UI 프리미티브 래퍼)과 동일하다.

**Suspense 경계 (필수)**: `diagnosis-flow.tsx`는 `"use client"` 컴포넌트이면서 `useSearchParams()`를 호출한다. Next.js는 `useSearchParams()`를 호출하는 Client Component가 상위 Server Component에서 `<Suspense>` 경계 없이 정적 렌더링되면 프로덕션 빌드가 실패하거나(또는 페이지 전체가 강제로 dynamic 렌더링되어 정적 최적화를 잃는다) — 따라서 `app/page.tsx`는 `<DiagnosisFlow />`를 반드시 `<Suspense fallback={...}>`로 감싸 렌더링해야 한다(§19 참고 — `shouldRenderDiagnosis`가 참일 때만). fallback은 01 화면의 초기 레이아웃(검색창 + 카테고리 카드 골격)과 유사한 스켈레톤으로 구성해 레이아웃 시프트를 최소화한다는 것이 design-phase 요구사항이며, 정확한 픽셀 스펙은 run-phase 구현 세부사항이다. 이 Suspense 래핑은 Milestone 2(공개 B2C route와 진단 shell)의 산출물이며, run-phase 테스트 계획은 `next build`(또는 `package.json`이 정의한 동등 빌드 스크립트)가 Suspense 경계 누락 오류·경고 없이 성공함을 확인하는 단계를 포함해야 한다(`acceptance.md` "## Quality Gate 기준" — 프로덕션 빌드 검증 항목 참고).

## 3. 컴포넌트 재사용 맵 (`components/ui/*`)

| 기존 컴포넌트 | 재사용 위치 |
|---|---|
| `button.tsx` | "보상 진단" CTA, "동의하고 진단하기", "다시 시도", "입력 내용으로 돌아가기", "내용을 수정할게요" 등 모든 버튼 |
| `card.tsx` | 01 화면 4카테고리 미리보기 카드(실손/정액담보/후유장해/특별보상) |
| `chip.tsx` | "많이 찾는 사례" 칩(교통사고, 계단에서 낙상 등) |
| `input.tsx` | 01 검색창(사고 경위 한 줄 입력) |
| `label.tsx` | 동의 체크박스 라벨, 폼 필드 라벨 |
| `notice.tsx` | "이름·전화번호 등 개인 식별정보는 입력하지 마세요" 경고 배너 |
| `popover.tsx` | 이 SPEC 범위에서는 직접 사용처 없음 — 기존 `date-picker.tsx` 전용 유지 |
| `status-badge.tsx` | 01-C 진단 중 화면의 "완료"/"진행 중"/"대기" 상태 배지 |
| `textarea.tsx` | 이 SPEC 범위에서는 사용처 없음(검색창은 단일 라인 `input.tsx`) |
| `calendar.tsx` / `date-picker.tsx` | 이 SPEC 범위에서는 사용처 없음(01 흐름에 날짜 입력 없음) |
| `exception-panel.tsx` | 01-E 분석 오류 화면의 오류 상태 표시에 재사용 검토(기존 컴포넌트가 이미 유사한 오류 패턴을 다룸) |

신규 프리미티브(`@base-ui/react/dialog`, `@base-ui/react/drawer`)는 `research.md` §2에서 확인된 대로 이미 설치되어 있으며, `components/ui/popover.tsx`와 동일한 래퍼 패턴으로 `components/ui/dialog.tsx`, `components/ui/drawer.tsx`를 신설한다(§14 참고).

## 4. 진단 입력 zod 스키마

`lib/validation/diagnosis-input.ts`(신규):

- 검색어 필드: 문자열, 1~200자(디자인의 `28 / 200자` 카운터와 일치).
- 검증은 2단계로 구성된다 — REQ-B2CDIAG-020: **(자동 차단)** 휴대전화번호 형식과 주민등록번호(RRN) 형식만 정규식으로 구조적 거부한다 — 이 두 패턴은 구조적으로 신뢰성 있게 식별 가능하다(하이픈 포함/미포함 모두 대응). **(안내만 제공)** 이름·주소 등 그 외 개인식별정보는 구조적으로 거부하지 않는다 — 이름 형식은 정규식으로 신뢰성 있게 판별할 수 없고 오탐(false positive)이 불가피하므로, 기존 경고 배너(`notice.tsx`, §3 참고)를 통한 안내만 제공하며 입력을 차단하지 않는다.
- `lib/validation/case-input.ts`의 전화번호·주민등록번호 정규식 **패턴 스타일만 참고하여 새로 작성** — 기존 스키마를 import하지 않는다. 이유: `case-input.ts`는 사건 접수용 필드 집합(주소·의료기록 등)을 포함하고 있어 01 화면의 단일 검색어 필드와 스키마 형태가 다르다. `tech.md` § PII 정책 예외에서 이미 "03 리드 폼은 새 스키마가 필요하다"고 명시한 것과 같은 이유로, 01 입력도 독립 스키마(`lib/validation/diagnosis-input.ts`)로 분리하며, 이 신규 스키마가 실제로 구조적 거부를 구현하는 규칙은 전화번호·주민등록번호 두 패턴뿐이다 — 이름 형식에 대한 구조적 거부 규칙은 구현하지 않는다.
- 검증 실패 시(전화번호·주민등록번호 형식 매칭) REQ-B2CDIAG-020에 따라 "보상 진단" 클릭이 무효화되고 인라인 오류 메시지를 표시한다(01-D "현재 입력만으로는 보상 가능성을 판단하기 어렵습니다"와는 다른, 입력 형식 자체의 오류 — §18 상태표 "입력 검증 오류" 참고).

## 5. 클라이언트 상태 관리

- 별도 상태관리 라이브러리(Zustand/Jotai 등) 도입 없이 `useReducer` 기반 상태 머신 하나로 충분하다 — 상태 개수(6개)와 전이 규칙이 명확하고, 상태가 컴포넌트 트리 최상단(`diagnosis-flow.tsx`) 한 곳에만 존재하면 되기 때문(Enforce Simplicity 원칙).
- 상태 도형(TypeScript): `{ step: 'input' | 'consent' | 'questions' | 'loading' | 'result-none' | 'error', input: string, consentGiven: boolean, answers: Record<string, string> }`.
- `?step=` 쿼리 파라미터는 **표시 전용 미러**다 — 실제 진실은 React state에 있고, URL은 뒤로가기 지원과 개발용 강제 진입(§10)을 위한 보조 채널이다(REQ-B2CDIAG-016 참고: URL만으로 상태를 재구성하지 않는다).

## 6. 브라우저 새로고침 처리

REQ-B2CDIAG-015에 따라 새로고침 시 모든 React state가 초기화되는 것이 **의도된 동작**이다. `sessionStorage`/`localStorage`를 이용한 상태 복원은 구현하지 않는다 — PII 미수집 원칙과 "영구 저장하지 않는다"는 원칙(REQ-B2CDIAG-004)에 따라, 진단 입력 내용이라도 브라우저 스토리지에 남기지 않는 편이 안전하다.

## 7. 비식별 데이터 범위 (영구저장 없음 정합)

01 흐름에서 다루는 모든 데이터(검색어, 동의 여부, 추가 질문 응답)는 서버로 전송되지 않거나, 전송되더라도 요청-응답 사이클 안에서만 존재하고 DB에 쓰이지 않는다(§8 참고). 즉 "비식별 데이터"라는 별도 마스킹 계층이 필요한 것이 아니라, **애초에 저장 자체를 하지 않는다**.

## 8. DB 및 서버 전송 필요 여부

이 SPEC 범위(01 화면)는 **서버 전송이 필요 없다** — 담보 매칭 로직이 미결정(`tech.md`)이므로 01-C "진단 중" 상태는 이 SPEC에서는 실제 분석을 수행하지 않고, 클라이언트 내에서 UI 시뮬레이션(고정 지연 + mock 결과 분기)으로 구현한다(§11 참고). 신규 API 라우트·DB 테이블은 이 SPEC의 Out of Scope이며, 실제 매칭 로직이 결정되는 후속 SPEC이 `app/api/diagnosis/`(구조 제안, `structure.md` § 목표 구조)를 신설한다.

**중요 — 이 mock 시뮬레이션은 로컬/테스트/리뷰 전용이며 프로덕션 동작이 아니다.** `loading` 상태의 고정 지연 + 키워드 기반 mock 판정 분기는 실제 매칭 엔진이 연결되기 전, 실제 프로덕션 사용자에게 자동으로 노출되어서는 안 된다 — 01-D("현재 입력만으로는 보상 가능성을 판단하기 어렵습니다")는 실제 "결과 없음" 응답과 사용자 입장에서 구분되지 않으므로, 실제 사용자를 겨냥한 자동 mock 분기 대상이 될 수 없다. 이 mock 자동 분기 로직이 프로덕션의 정상 사용자 플로우에서 도달 가능해지려면 `productionReady = ENABLE_DIAGNOSIS_FLOW && DIAGNOSIS_ENGINE_READY`가 참이어야 하는데, 실제 매칭 엔진 연결은 이 SPEC의 Out of Scope이므로 이 SPEC이 전달하는 코드 범위 안에는 `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 지점이 존재하지 않는다 — 따라서 `productionReady`는 이 SPEC이 전달한 코드만으로는 구조적으로 항상 거짓이다 — 이 mock 자동 분기 경로는 `productionReady`와 `reviewEnabled`가 모두 거짓인 프로덕션 기본 조합에서는 도달 불가능하지만, `ENABLE_DIAGNOSIS_DEV_STATES`가 프로덕션에서 실수로 `true`로 설정되면 `reviewEnabled`가 참이 되어 정상 사용자 플로우(검색 → 동의 → 추가 질문 → 분석 진행)로도 이 mock 자동 분기 경로에 도달할 수 있다. 이 차단은 코드 구조만으로 보장되지 않으며, `reviewEnabled` 경로에 한해서는 Oracle 프로덕션에서 `ENABLE_DIAGNOSIS_DEV_STATES`를 unset/false로 유지하는 배포 설정 규율에 의존한다. 이 원칙의 구체적 게이트 메커니즘(productionReady/reviewEnabled 논리합)은 §19를 참고한다.

## 9. 미래 02 결과 화면과의 인터페이스 경계

01→02 경계에서 전달할 데이터 shape을 **느슨하게** 정의한다(02 자체는 미구현이므로 확정 스키마가 아니라 방향성):

```ts
// [미구현 참고용 — 02 SPEC에서 확정] lib/diagnosis/types.ts 후보
interface DiagnosisHandoff {
  rawInput: string;          // 01 검색어 원문
  answers: Record<string, string>; // 01-B 추가 질문 응답 (질문 ID → 선택지)
  // 02가 실제 담보 매칭 결과를 어떻게 받을지(서버 재계산 vs 클라이언트 보관)는
  // 담보 매칭 로직 결정(tech.md) 이후 02 SPEC에서 확정한다.
}
```

이 SPEC은 `rawInput`과 `answers`만 정의하고, 매칭 결과 자체의 데이터 모델은 정의하지 않는다.

## 10. 개발·리뷰용 상태별 화면 접근 방법

REQ-B2CDIAG-017: `?devStep=consent-detail|loading|result-none|error` 쿼리 파라미터를 지원한다. 단, 이 파라미터의 유효성은 `process.env.NODE_ENV === 'production'` 판정 **하나만으로는 판단하지 않는다** — 이 프로젝트의 배포 구성상 스테이징 유사 빌드에도 `NODE_ENV=production`이 설정될 수 있어, `NODE_ENV` 단독 판정은 dev/staging/production을 신뢰성 있게 구분하지 못한다.

**가드 메커니즘**: 전용 서버 전용 환경 변수 `ENABLE_DIAGNOSIS_DEV_STATES`(boolean, 기본값 `false`)를 신설한다.

- `app/page.tsx`(Server Component)가 이 플래그를 서버 측에서 읽어 `enableDevStates` boolean prop으로 `<DiagnosisFlow enableDevStates={...} />`에 전달한다 — 클라이언트 컴포넌트는 이 판단을 위해 `process.env`를 직접 읽지 않는다.
- 기본값은 `false`이며, unset인 경우도 포함해 모든 곳에서 기본값을 유지한다. Oracle 프로덕션에서는 이 플래그를 설정하지 않거나 명시적으로 `false`로 유지한다.
- `true`로 설정하는 곳은 로컬 개발 환경과 전용 리뷰/스테이징 환경뿐이다 — CI/스테이징 환경에서 Playwright 시각 검증(§16)이 모든 상태를 URL 하나로 진입할 수 있게 하기 위함이며, 동시에 프로덕션에서 실사용자가 결과 화면을 우회 접근하는 경로를 원천 차단한다.

**두 플래그를 혼동하지 말 것**: `ENABLE_DIAGNOSIS_DEV_STATES`(이 절)는 `ENABLE_DIAGNOSIS_FLOW`(§19 — 01 플로우 전체의 프로덕션 활성화 게이트)와 별개의 플래그다. 전자는 이미 활성화된 환경 내에서 `devStep` 강제 진입이 동작하는지를 결정하고, 후자는 01 플로우 자체가 프로덕션에 존재하는지(placeholder vs `<DiagnosisFlow />`)를 결정한다. 두 플래그 모두 기본값 `false`다.

## 11. mock 데이터와 production 데이터의 구분

- 이 SPEC의 01-C "진단 중" 이후 분기(결과 있음/없음/오류)는 **고정된 mock 판정 로직**(예: 입력 문자열 길이나 특정 키워드로 분기)으로 구현하며, 실제 결과 화면(02)이 없으므로 "결과 있음" 분기는 이 SPEC에서 도달 불가능한 경로로 두거나 콘솔 로그로만 표시한다.
- 코드 내 mock 로직에는 `@MX:TODO` 또는 `@MX:DEBT`(진행 중 단순화) 주석을 남겨, 실제 매칭 엔진 연결 시 교체 지점을 명시한다(REQ-B2CDIAG-024, `moai-constitution.md` MX Tag Quality Gates).

**production 활성화 원칙 (REQ-B2CDIAG-025) — 반드시 준수:**

1. **실제 매칭 엔진이 연결되기 전, 프로덕션은 실제 사용자에게 mock 결과를 자동 노출해서는 안 된다.** `loading` 상태의 고정 지연/키워드 기반 자동 분기 로직은 **로컬/테스트/리뷰 전용 시뮬레이션**이며 프로덕션 동작이 아니다.
2. **01-D/01-E 도달 경로는 환경에 따라 세 갈래로 나뉜다.** 프로덕션 기본 조합(`productionReady=false`, `reviewEnabled=false`)에서는 `DiagnosisFlow` 자체가 렌더링되지 않으므로(§19) 01-D/01-E에 도달할 수 없다. 비프로덕션 리뷰 환경(`reviewEnabled=true`, 즉 `ENABLE_DIAGNOSIS_DEV_STATES=true`)에서는 `devStep` 강제 진입 파라미터(§10)로 직접 진입할 수 있을 뿐 아니라, 정상 입력→동의→추가 질문→`loading`→mock 판정의 정상 사용자 플로우를 통해서도 도달 가능하다. 향후 실제 매칭 엔진이 연결되어 `productionReady=true`가 되면, mock이 아닌 실제 엔진의 결과 없음/오류 응답을 통해 01-D/01-E에 도달한다(§19 참고).
3. **production 활성화 게이트는 두 개의 독립 경로 — `productionReady`와 `reviewEnabled` — 의 논리합(OR)으로 결정된다.** 상세 메커니즘, 각 경로의 정의, 그리고 5행 동작 행렬은 §19를 참고한다 — 요약하면 `productionReady = ENABLE_DIAGNOSIS_FLOW && DIAGNOSIS_ENGINE_READY`(둘 다 신설, 기본값 `false`)이고 `reviewEnabled = ENABLE_DIAGNOSIS_DEV_STATES`(§10, 기본값 `false`)이며, `app/page.tsx`는 `shouldRenderDiagnosis = productionReady || reviewEnabled`를 **한 곳에서만** 계산한다. 실제 담보 매칭 엔진 연결은 이 SPEC의 Out of Scope이므로, `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 지점이 이 SPEC의 코드에는 없다 — 따라서 `productionReady`는 이 SPEC 범위 내내 구조적으로 항상 거짓이며, mock 노출이 발생할 수 있는 유일한 경로는 `reviewEnabled`(비프로덕션 전용)뿐이다.
4. **"코드 구현 완료"와 "프로덕션에서 활성화해도 안전함"은 서로 다른 상태다.** 이 SPEC의 run-phase는 `ENABLE_DIAGNOSIS_FLOW=false`(및 `DIAGNOSIS_ENGINE_READY=false`)인 채로 01 화면 UI 구현 전체를 완료할 수 있다 — 이는 예상된, 정상적인 결과이며 실패가 아니다.
5. `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 각각 `true`로 전환되려면 서로 독립된 전제조건이 충족되어야 한다 — 하나의 전환이 다른 하나를 함의하지 않는다: (a) `DIAGNOSIS_ENGINE_READY → true`의 전제조건은 실제 매칭 엔진이 연결되어 `loading`→결과 경로가 mock이 아닌 실제 분석을 반영하는 상태(이 SPEC의 Out of Scope — 후속 SPEC의 몫), (b) `ENABLE_DIAGNOSIS_FLOW → true`의 전제조건은 §17의 동의 상세 문구 확정(6개 placeholder 항목 전체가 실제 확정 문구로 교체)이 완료된 상태다(§19 참고). 두 플래그가 모두 `true`여야만 `<DiagnosisFlow />`가 실제로 프로덕션에 렌더링된다.

§19에서 이 production 활성화 게이트를 별도 섹션으로 다시 정리한다.

## 12. 오류 및 재시도 처리

- 01-E는 "일시적 오류"를 전제로 문구가 작성되어 있다(`일시적인 오류일 수 있습니다`) — "다시 시도"는 동일 입력값으로 §0의 상태 머신을 `loading`으로 재진입시키고, "입력 내용으로 돌아가기"는 `input` 상태로 되돌아가되 검색어는 보존한다(REQ-B2CDIAG-014).
- mock 구현 단계에서 "오류" 분기는 실제 네트워크 오류가 없으므로 강제 트리거용 개발 파라미터(§10)로만 재현 가능하다.

## 13. Desktop 1440 / Mobile 390 반응형 전략 (확정)

- Tailwind 기준 브레이크포인트: 디자인은 1440(Desktop)과 390(Mobile) 두 폭만 존재한다. **결정(확정)**: 0px~767px 구간은 Mobile 레이아웃, 768px 이상(`md:` Tailwind 브레이크포인트)은 Desktop 레이아웃을 적용하는 2-way 분기를 최종안으로 확정한다 — 태블릿·소형 노트북 구간(391px~767px)에 대한 별도 디자인 없이 Mobile 레이아웃을 767px까지 확장 적용(Mobile-first 확장)함으로써 이 구간을 해소한다. 추가 확인 절차 없이 이 브레이크포인트로 run-phase가 착수한다.
- §1의 M01-D/M01-E 부재 문제도 이 브레이크포인트 결정과 연결된다 — Mobile 레이아웃이 Desktop 01-D/01-E를 세로 스택으로 재배치하는 방향(§1)을 최종 결정으로 삼는다. 이는 **반응형 재사용**이며, 새 Pencil/Figma 산출물을 생성하지 않는다 — 기존 Desktop 컴포넌트가 CSS/Tailwind만으로 모바일 breakpoint 레이아웃을 획득한다.

## 14. Modal과 Bottom Sheet 구현 방식

`research.md` §2에서 확인한 대로 `@base-ui/react`에는 `dialog`와 `drawer` 엔트리포인트가 모두 존재한다(v1.7.0, 이미 설치됨) — **신규 의존성 추가가 필요 없다**:

- Desktop 동의 상세(01-A2 "내용 보기", 01-A3 상세): `@base-ui/react/dialog` 기반 `components/ui/dialog.tsx` 신설, `components/ui/popover.tsx`와 동일한 래퍼 컨벤션(`data-slot`, `cn()`, motion 클래스) 적용.
- Mobile 동의 상세(M01-A2, M01-A3): `@base-ui/react/drawer` 기반 `components/ui/drawer.tsx` 신설, 화면 높이 약 88%까지 올라오는 형태(DEV-ONLY 캡처 기준)로 구현.
- 두 컴포넌트 모두 포커스 트랩·배경 스크롤 잠금은 Base UI 프리미티브가 기본 제공하는 동작에 의존한다(Base UI Dialog/Drawer는 접근성 프리미티브이므로 커스텀 포커스 관리 로직을 새로 작성하지 않는다 — Enforce Simplicity).

**동의 상세 UI 컨테이너와 6개 문구 법무 확정은 별개 작업이다.** `consent-detail-content.tsx`(01-A3/M01-A3 공용, §2)가 구현하는 것은 Modal/Bottom Sheet **셸**(레이아웃, 스크롤, 포커스 트랩, 닫기 동작)이며, 6개 항목의 실제 문구(§17 참고)는 법무·운영팀의 별도 확정 대상이다. run-phase가 이 컨테이너 구현을 완료하더라도, 6개 문구가 미확정 상태면 그 컨테이너를 `ENABLE_DIAGNOSIS_FLOW=true`(§19)인 프로덕션에 노출할 수 없다 — placeholder 문구(`{처리 목적 확정 문구}` 등)는 어떤 경우에도 프로덕션 UI에 렌더링되어서는 안 된다.

## 15. 키보드 · 포커스 · 스크린리더 접근성

- 동의 상세 열람 트리거("내용 보기") → 상세 오픈 시 포커스가 상세 컨텐츠(닫기 버튼 또는 첫 포커스 가능 요소)로 이동, 닫힘 시 트리거로 복귀(REQ-B2CDIAG-008).
- 동의 체크박스는 `<label>` + `aria-describedby`로 "건강정보 등 민감정보 처리 동의" 텍스트와 연결(REQ-B2CDIAG-009).
- 추가 질문 라디오 그룹은 방향키로 이동 가능해야 하며, 각 질문 전환 시 포커스가 새 질문의 제목(`<h1>`/`<h2>`)으로 이동해 스크린리더 사용자가 진행 상황을 인지할 수 있게 한다.
- 01-C 로딩 상태는 `aria-live="polite"` 영역으로 진행 단계 텍스트 변경을 낭독한다.
- 모든 애니메이션(모달 등장, 로딩 스피너)은 `prefers-reduced-motion` 존중 — 기존 `popover.tsx`의 `motion-reduce:transition-none` 패턴을 그대로 따른다.

## 16. 디자인 export와 구현 화면의 시각 비교 방법

- 자동화 픽셀 비교 도구(예: Percy, Chromatic)는 현재 스택에 없고 신규 도입은 이 SPEC 범위 밖(무료 tier 우선 원칙, `tech.md` § 비용 태도).
- 잠정 절차: (1) Playwright로 각 상태를 `?devStep=`(§10)으로 강제 진입해 스크린샷 캡처 → (2) `design/exports/`의 대응 PNG와 나란히 놓고 수동 리뷰(레이아웃 폭, 색상 토큰, 텍스트 일치 여부) → (3) 리뷰 결과를 run-phase progress.md에 캡처 경로와 함께 기록.
- 정밀 픽셀 diff 자동화는 이 SPEC에서 결정하지 않으며, 후속 SPEC에서 필요성이 확인되면 별도 도구를 검토한다.

## 17. 동의 화면 상세 계획 (01-A2 / M01-A2)

| 항목 | 결정 |
|---|---|
| CTA 비활성화 조건 | 필수 동의 체크박스가 선택되지 않으면 "동의하고 진단하기" `disabled` (REQ-B2CDIAG-006) |
| 상세보기 표시 방식 | Desktop = Modal(`@base-ui/react/dialog`), Mobile = Bottom Sheet(`@base-ui/react/drawer`) (REQ-B2CDIAG-007) |
| 상세 열람과 체크 상태 | 「내용 보기」→「확인」을 눌러도 체크박스는 자동 선택되지 않는다 — DEV-ONLY 캡처에 "확인해도 동의 체크박스는 자동 선택되지 않습니다" 문구가 명시됨 (REQ-B2CDIAG-007) |
| 상세보기 닫기 | 닫기(X) 버튼, ESC 키, 배경(Dim) 클릭 3가지 모두 동일하게 동작 (REQ-B2CDIAG-008) |
| 키보드 이동 | 상세 오픈 시 포커스 트랩(Base UI Dialog/Drawer 기본 제공), Tab/Shift+Tab으로 내부 순환 |
| 포커스 복귀 | 상세 닫힘 시 포커스는 「내용 보기」 트리거로 복귀 (REQ-B2CDIAG-008) |
| 스크린리더 연결 | 체크박스 label + `aria-describedby`로 설명 텍스트 연결 (REQ-B2CDIAG-009) |
| 이전 단계 이동·재진입 시 동의 상태 | 같은 세션(새로고침 없이) 내에서는 유지 — 추가 질문에서 동의 화면으로 되돌아가도 체크 상태 보존 (REQ-B2CDIAG-019) |
| 새로고침 시 동의 상태 | 초기화(미동의 상태로 리셋) — REQ-B2CDIAG-015와 일관 |
| 직접 URL 접근 시 | 동의를 거치지 않고 이후 단계 URL로 직접 진입 시 클라이언트 메모리에 동의 상태가 없으므로 초기 화면으로 리다이렉트 (REQ-B2CDIAG-016) |
| 동의 철회 시 데이터 처리 | 추가 질문 단계 이후의 진행을 차단하고, 그 시점까지의 응답을 다음 단계(진단 중/결과)로 전달하지 않는다 — 서버 전송 자체가 없으므로 "삭제"가 아니라 "다음 단계로 넘기지 않음"이 정확한 표현이며, 뒤로 가기로 이미 답변한 추가 질문 응답 자체는 클라이언트 상태(React state)에서 지워지지 않는다(§18.1 `questions` 상태의 "유지되는 데이터" 행과 일치, REQ-B2CDIAG-018, `acceptance.md` AC-B2CDIAG-017 참고) |
| 동의 상세 6개 문구 확정과 프로덕션 노출 | 6개 placeholder 문구(§14 참고)가 모두 실제 확정 문구로 교체되기 전까지 `ENABLE_DIAGNOSIS_FLOW`(§19)를 프로덕션에서 `true`로 전환할 수 없다 — 동의 상세 UI 컨테이너 구현 완료와는 별개의 전제조건이다 (REQ-B2CDIAG-025) |

## 18. 화면 상태와 전이

### 18.1 핵심 상태 머신 (6단계)

각 상태는 9개 속성(진입 조건 / 사용자 행동 / 검증 조건 / 다음 상태 / 뒤로 가기 동작 / 유지되는 데이터 / 초기화되는 데이터 / 접근성 요구사항 / 테스트 방법)으로 기록한다.

#### 상태: `input` — 진단 시작 / 기본 정보 입력

| 속성 | 내용 |
|---|---|
| 진입 조건 | 최초 진입, 또는 새로고침, 또는 다른 상태에서 "돌아가기" |
| 사용자 행동 | 검색어 입력(최대 200자) 또는 자주 찾는 사례 칩 클릭 |
| 검증 조건 | zod 스키마 통과(1~200자, PII 패턴 없음) — REQ-B2CDIAG-020 |
| 다음 상태 | 검증 통과 + "보상 진단" 클릭 → `consent` (오버레이) |
| 뒤로 가기 동작 | 최초 상태이므로 브라우저 뒤로가기 시 사이트 이탈(정상 동작) |
| 유지되는 데이터 | 없음(최초 상태) |
| 초기화되는 데이터 | 해당 없음 |
| 접근성 요구사항 | 검색창에 초기 포커스, 글자 수 카운터 `aria-live="polite"` |
| 테스트 방법 | Vitest 컴포넌트 테스트(입력·칩 클릭) + Playwright(01/M01 스크린샷) |

#### 상태: `input` (검증 실패 하위 상태) — 입력 검증 오류

| 속성 | 내용 |
|---|---|
| 진입 조건 | `input` 상태에서 "보상 진단" 클릭 시 zod 검증 실패 |
| 사용자 행동 | 인라인 오류 메시지 확인 후 입력 수정 |
| 검증 조건 | 재입력 후 재검증 |
| 다음 상태 | 검증 통과 시 `consent`로, 아니면 `input`(오류 상태) 유지 |
| 뒤로 가기 동작 | 없음(같은 화면 내 인라인 오류) |
| 유지되는 데이터 | 입력했던 검색어 원문(수정 편의를 위해 지우지 않음) |
| 초기화되는 데이터 | 없음 |
| 접근성 요구사항 | 오류 메시지를 `aria-invalid` + `aria-describedby`로 입력 필드와 연결, `role="alert"` |
| 테스트 방법 | Vitest(PII 패턴 입력 시 검증 실패 단위 테스트) |

#### 상태: `consent` — 필수 민감정보 동의

| 속성 | 내용 |
|---|---|
| 진입 조건 | `input`에서 검증 통과 + "보상 진단" 클릭 |
| 사용자 행동 | 체크박스 선택, "내용 보기"(상세 오버레이), "동의하고 진단하기" |
| 검증 조건 | 체크박스 선택 여부만(REQ-B2CDIAG-006) |
| 다음 상태 | 체크 + 클릭 → `questions` |
| 뒤로 가기 동작 | 닫기(X)/ESC/배경클릭 → `input`으로 복귀(동의 미완료 상태로) |
| 유지되는 데이터 | `input` 단계의 검색어(배경에 흐리게 노출) |
| 초기화되는 데이터 | 없음 |
| 접근성 요구사항 | §17 표 전체 적용(포커스 트랩, aria-describedby, 포커스 복귀) |
| 테스트 방법 | Vitest(체크박스 상태·CTA 활성화 로직) + Playwright(Modal/Sheet 열림·닫힘) |

#### 상태: `questions` — 추가 질문

| 속성 | 내용 |
|---|---|
| 진입 조건 | `consent`에서 동의 완료 |
| 사용자 행동 | 라디오 선택 후 다음 질문 진행, 또는 "건너뛰고 결과 보기" |
| 검증 조건 | 없음(모든 질문 선택 사항 — "잘 모르겠어요" 옵션 존재) |
| 다음 상태 | 3문항 완료 또는 스킵 → `loading` |
| 뒤로 가기 동작 | 이전 질문으로, 첫 질문에서 뒤로가기 시 `consent`로(동의 상태 유지, REQ-B2CDIAG-019) |
| 유지되는 데이터 | 이미 답변한 질문의 응답(뒤로 갔다 다시 진행해도 보존) |
| 초기화되는 데이터 | 없음(세션 내에서는) |
| 접근성 요구사항 | 질문 전환 시 포커스가 새 제목으로 이동, 라디오 그룹 방향키 지원 |
| 테스트 방법 | Vitest(스킵 로직, 응답 상태 보존) + Playwright(3문항 순회) |

#### 상태: `loading` — 분석 중

| 속성 | 내용 |
|---|---|
| 진입 조건 | `questions` 완료/스킵 |
| 사용자 행동 | 대기(입력 불가) |
| 검증 조건 | mock 판정 로직 실행(§11) — **이 로직은 로컬/테스트/리뷰 전용이다**. `shouldRenderDiagnosis=false`(즉 `productionReady`와 `reviewEnabled` 모두 거짓인 프로덕션 기본 조합)인 동안 프로덕션 실제 사용자는 정상 사용자 플로우로 이 상태에 도달할 수 없다 — `reviewEnabled`가 프로덕션에서 실수로 참이 되면 이 차단은 깨지므로, `ENABLE_DIAGNOSIS_DEV_STATES`를 프로덕션에서 unset/false로 유지하는 배포 설정 규율에 의존한다(§19) |
| 다음 상태 | mock 로직 결과에 따라 `result-none` 또는 `error`로(이 SPEC 범위에서 "결과 있음"=02는 도달 불가) |
| 뒤로 가기 동작 | 비활성화 권장(분석 중 이탈 방지) — 브라우저 뒤로가기는 차단하지 않되 `questions`로 돌아가면 분석을 취소한 것으로 간주 |
| 유지되는 데이터 | 검색어, 동의 상태, 추가 질문 응답 전체 |
| 초기화되는 데이터 | 없음 |
| 접근성 요구사항 | `aria-live="polite"`로 단계 텍스트("사고 내용 확인 중" → "관련 보상 유형 탐색 중" → "확인할 담보 정리 중") 변경 낭독 |
| 테스트 방법 | Vitest(mock 분기 로직) + Playwright(로딩 단계 시각 검증) |

#### 상태: `result-none` — 결과 없음

| 속성 | 내용 |
|---|---|
| 진입 조건 | 세 갈래로 도달한다 — ① 비프로덕션 리뷰 환경(`reviewEnabled=true`)에서 `loading`의 mock 판정 결과 0건, ② `devStep=result-none`(§10, `reviewEnabled=true` 필요)으로 직접 진입, ③ 향후 실제 매칭 엔진 연결 후(`productionReady=true`) 실제 엔진의 결과 0건 응답. 프로덕션 기본 조합(`productionReady=false`, `reviewEnabled=false`)에서는 `DiagnosisFlow` 자체가 렌더링되지 않으므로 도달 불가(§19) |
| 사용자 행동 | "내용을 수정할게요"(→ `input`) 또는 "손해사정사에게 바로 문의"(03 경계, 이 SPEC에서는 stub) |
| 검증 조건 | 없음 |
| 다음 상태 | "내용을 수정할게요" → `input`(검색어 보존) |
| 뒤로 가기 동작 | `questions`로 복귀(재진입 시 재분석 여부는 §12 재시도 원칙과 동일하게 처리) |
| 유지되는 데이터 | 검색어(수정 편의) |
| 초기화되는 데이터 | 동의 상태·추가 질문 응답은 유지(재시도 시 재사용, §12) |
| 접근성 요구사항 | 결과 없음 아이콘에 `aria-hidden`, 안내 텍스트가 실제 정보 전달 |
| 테스트 방법 | Playwright(§10 devStep=result-none으로 강제 진입 검증) |

#### 상태: `error` — 분석 오류

| 속성 | 내용 |
|---|---|
| 진입 조건 | 세 갈래로 도달한다 — ① 비프로덕션 리뷰 환경(`reviewEnabled=true`)에서 `loading`의 mock 오류 판정, ② `devStep=error`(§10, `reviewEnabled=true` 필요)로 직접 진입, ③ 향후 실제 매칭 엔진 연결 후(`productionReady=true`) 실제 엔진 오류 응답. 프로덕션 기본 조합(`productionReady=false`, `reviewEnabled=false`)에서는 `DiagnosisFlow` 자체가 렌더링되지 않으므로 도달 불가(§19) |
| 사용자 행동 | "다시 시도"(→ `loading` 재진입) 또는 "입력 내용으로 돌아가기"(→ `input`) |
| 검증 조건 | 없음 |
| 다음 상태 | REQ-B2CDIAG-014 참고 |
| 뒤로 가기 동작 | "입력 내용으로 돌아가기"와 동일하게 `input`으로 |
| 유지되는 데이터 | 검색어, 동의 상태, 추가 질문 응답(모두 보존 — "다시 시도"가 동일 입력으로 재분석해야 하므로) |
| 초기화되는 데이터 | 없음 |
| 접근성 요구사항 | 오류 아이콘 `aria-hidden`, `role="alert"`로 오류 메시지 낭독 |
| 테스트 방법 | Playwright(§10 devStep=error) + Vitest(재시도 로직) |

### 18.2 교차 관심사(Cross-cutting) — 별도 상태가 아닌 전역 규칙

- **이전 단계 이동**: 각 상태표의 "뒤로 가기 동작" 행이 상태별 규칙을 정의한다. 공통 원칙은 "뒤로 가기는 데이터를 지우지 않는다" — 오직 새로고침(REQ-B2CDIAG-015)과 동의 철회(REQ-B2CDIAG-018)만 데이터를 초기화/차단한다.
- **새로고침**: 모든 상태에서 동일 — `input` 상태로 완전 초기화(REQ-B2CDIAG-015, §6).
- **직접 URL 접근**: 모든 비-`input` 상태에 공통 적용 — 클라이언트 메모리에 선행 상태가 없으면 `input`으로 리다이렉트(REQ-B2CDIAG-016), 단 §10의 개발용 파라미터는 예외(REQ-B2CDIAG-017).
- **Desktop·Mobile 반응형 전환**: 상태 머신과 데이터 모델은 두 폭에서 완전히 동일하다 — 오직 `consent` 상태의 오버레이 컴포넌트(Modal vs Bottom Sheet, §14)와 레이아웃만 분기한다.
- **미래 02 결과 화면으로 넘어가는 경계**: `loading` 상태에서 "결과 있음"으로 판정되는 분기는 이 SPEC에서 UI가 존재하지 않는다 — §9의 `DiagnosisHandoff` 데이터만 정의하고, 실제 라우팅(예: `router.push('/result')`)은 02 SPEC이 구현한다.

## 19. 프로덕션 활성화 게이트 (REQ-B2CDIAG-025)

이 섹션은 §8/§11에서 언급된 production 활성화 원칙을 하나의 게이트 메커니즘으로 정리한다.

### 19.1 원칙

1. **실제 매칭 엔진이 연결되기 전, 프로덕션은 실제 사용자에게 mock 진단 결과를 자동 노출해서는 안 된다.** `loading` 상태의 고정 지연/키워드 기반 mock 자동 분기 로직(§11)은 **로컬/테스트/리뷰 전용 시뮬레이션**이며, 프로덕션 동작이 아니다. 01-D("현재 입력만으로는 보상 가능성을 판단하기 어렵습니다")는 사용자 입장에서 실제 "결과 없음" 응답과 구분되지 않으므로, 실제 사용자를 대상으로 하는 자동 mock 분기 목표가 될 수 없다.
2. **01-D/01-E 도달 경로는 환경에 따라 세 갈래로 나뉜다.** 프로덕션 기본 조합(`productionReady=false`, `reviewEnabled=false`)에서는 `<DiagnosisFlow />` 자체가 렌더링되지 않으므로(본 절 원칙 3) 01-D/01-E에 도달할 수 없다. 비프로덕션 리뷰 환경(`reviewEnabled=true`, 즉 `ENABLE_DIAGNOSIS_DEV_STATES=true`)에서는 `devStep` 강제 진입 파라미터(§10)로 직접 진입할 수 있을 뿐 아니라, 정상 입력→동의→추가 질문→`loading`→mock 판정의 정상 사용자 플로우를 통해서도 도달 가능하다. 향후 실제 매칭 엔진이 연결되어 `productionReady=true`가 되면, mock이 아닌 실제 엔진의 결과 없음/오류 응답을 통해 01-D/01-E에 도달한다.
3. **렌더링 여부는 두 개의 독립 경로 — `productionReady`와 `reviewEnabled` — 를 논리합(OR)으로 합성해 결정한다.**
   - `productionReady = ENABLE_DIAGNOSIS_FLOW === true && DIAGNOSIS_ENGINE_READY === true`(기존 AND 게이트 — 두 플래그 모두 신설, 기본값 `false`).
   - `reviewEnabled = ENABLE_DIAGNOSIS_DEV_STATES === true`(§10의 개발·리뷰 전용 플래그, 기본값 `false`).
   - `shouldRenderDiagnosis = productionReady || reviewEnabled`.
   - `app/page.tsx`(Server Component)는 이 세 값(`productionReady`, `reviewEnabled`, `shouldRenderDiagnosis`)을 **한 곳에서만** 계산한다.
   - `shouldRenderDiagnosis`가 거짓이면 placeholder("서비스 준비 중입니다")를, 참이면 `<DiagnosisFlow />`를(§2의 Suspense 래핑 준수) 렌더링한다.
   - `reviewEnabled` 경로는 UI 검증과 Playwright 시각 회귀 테스트 전용이며, 실제 매칭 엔진이 준비되었다는 의미가 아니다 — `DIAGNOSIS_ENGINE_READY`를 테스트 편의를 위해 거짓으로 `true`로 설정해서는 안 된다.
   - Oracle 프로덕션에서는 `ENABLE_DIAGNOSIS_DEV_STATES`를 unset이거나 명시적으로 `false`로 유지해 `reviewEnabled` 경로가 프로덕션에서 열리지 않도록 한다.
   - **이 SPEC이 전달하는 코드 범위 안에는 `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 지점이 존재하지 않는다** — 실제 담보 매칭 엔진 연결은 이 SPEC의 명시적 Out of Scope이기 때문이다(`spec.md` §4). 따라서 `productionReady`는 이 SPEC이 전달한 코드만으로는 구조적으로 항상 거짓이며, 프로덕션에서 mock 노출이 발생하려면 오직 `reviewEnabled` 경로(비프로덕션 전용, Oracle 프로덕션에서는 unset/false 유지)를 통해서만 가능하다. `DIAGNOSIS_ENGINE_READY`를 `true`로 전환하는 것은 실제 매칭 엔진을 연결하는 후속 SPEC의 몫이다.
4. **"코드 구현 완료"와 "프로덕션에서 활성화해도 안전함"은 서로 다른 상태다.** 이 SPEC의 run-phase는 `productionReady=false`(및 `reviewEnabled`는 환경에 따라 참/거짓)인 채로 01 화면 UI 구현 전체를 완료할 수 있다 — 이는 예상된, 정상적인 결과이며 실패가 아니다.
5. `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 각각 `true`로 전환되려면 아래 전제조건이 충족되어야 한다 — 두 플래그는 서로 독립적으로 전환되며, 하나의 전환이 다른 하나를 자동으로 함의하지 않는다:
   - `DIAGNOSIS_ENGINE_READY → true`의 전제조건: 실제 담보 매칭 엔진이 연결되어 `loading`→결과 경로가 mock이 아닌 실제 분석을 반영하는 상태. 이 SPEC의 delivered 코드는 이 전환을 수행하지 않는다(후속 SPEC의 몫).
   - `ENABLE_DIAGNOSIS_FLOW → true`의 전제조건: §17의 동의 상세 6개 placeholder 문구(§14 참고 — 처리 목적 / 처리하는 건강정보 항목 / 서버 저장 여부 / 보유·이용 기간 / 외부 AI 서비스 전송 여부 / 동의 거부 권리 및 진단 이용 제한)가 모두 실제 확정 문구로 교체된 상태.
   - 두 플래그 모두 `true`가 되어야 `productionReady`가 참이 된다(§19.1 원칙 3).

### 19.1a 환경별 동작 행렬

| `ENABLE_DIAGNOSIS_FLOW` | `DIAGNOSIS_ENGINE_READY` | `ENABLE_DIAGNOSIS_DEV_STATES` | `productionReady` | `reviewEnabled` | `shouldRenderDiagnosis` | 결과 |
|---|---|---|---|---|---|---|
| false | false | false | false | false | false | placeholder (production 기본값) |
| true | false | false | false | false | false | placeholder |
| false | true | false | false | false | false | placeholder |
| true | true | false | true | false | true | 실제 DiagnosisFlow |
| false | false | true | false | true | true | review용 DiagnosisFlow |

`dev=false` 상태의 `?devStep=`은 무시된다(§10). Oracle production에서는 `ENABLE_DIAGNOSIS_DEV_STATES`를 unset이거나 명시적으로 `false`로 유지해 `reviewEnabled` 경로 자체를 열지 않는다.

### 19.2 검증 매핑

`acceptance.md` AC-B2CDIAG-021(production 기본 조합에서 정상 사용자 플로우로 mock 도달 불가), AC-B2CDIAG-015/016(`reviewEnabled` 경로 및 5행 동작 행렬의 기계적 검증), AC-B2CDIAG-025(placeholder 문구 미노출)가 이 게이트를 검증한다.
