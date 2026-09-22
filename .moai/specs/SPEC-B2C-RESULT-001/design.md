# Design — SPEC-B2C-RESULT-001

이 문서는 후속 run-phase가 그대로 구현할 수 있도록 기술 결정을 코드베이스 조사(`research.md`) 근거로 구체화한다. 이번 plan-phase는 문서만 작성하며, 아래 경로·컴포넌트는 아직 존재하지 않는다(단, "최소 확장" 대상으로 명시된 기존 파일은 이미 존재한다).

## 0. 아키텍처 요약

- **02는 별도 Next.js 라우트다(`/result`)** — 01처럼 하나의 상태 머신 안의 한 단계가 아니다. SPEC-B2C-DIAGNOSIS-001 `design.md` §18.2가 이미 이 경계를 예고했다: "실제 라우팅(예: `router.push('/result')`)은 02 SPEC이 구현한다."
- **서버 저장 없음** — 01→02 인계 데이터는 `sessionStorage`를 통해 클라이언트 메모리 수준에서만 이동한다(§3 참고).
- **동일 데이터 원본** — Desktop/Mobile 레이아웃은 `DiagnosisResult` 하나를 공유하며, 레이아웃별 별도 fetch·재가공이 없다.

## 1. `DiagnosisResult` 데이터 타입 (`lib/diagnosis/types.ts`, 신규)

SPEC-B2C-DIAGNOSIS-001 `design.md` §9가 예고한 느슨한 `DiagnosisHandoff { rawInput, answers }`를 이 SPEC이 확정 스키마로 구체화한다.

```ts
// [설계 의도 — run-phase가 실제 코드로 작성한다]
export type CoverageCategory =
  | "reimbursement"   // 실손 의료비
  | "fixed"            // 정액 담보
  | "disability"        // 후유장해
  | "special";          // 특별 보상

export type CoverageStatus = "review" | "needs-info" | "low-likelihood";
// 라벨 매핑(코드는 영문 식별자, 화면 텍스트만 한글):
//   review        → "검토 대상"
//   needs-info    → "추가 정보 필요"
//   low-likelihood → "가능성 낮음"
// design/MIGRATION-PLAN.md §4 "청구 가능/조건부/해당 없음은 구 표현" 참고 —
// 이 세 값이 유일한 현행 상태 정의다.

export interface FactChip {
  questionId: string;   // 01-B 질문 ID
  label: string;        // 예: "수술 여부: 예"
}

// 금액은 항상 displayText를 함께 들고 다닌다 — UI는 min/max/value를 직접
// 조합해 문구를 만들지 않고 displayText를 그대로 출력한다(REQ-B2CRESULT-006,
// AC-B2CRESULT-006). "unavailable"은 표시할 금액 자체가 없는 케이스
// (예: 가능성 낮음이라 금액 산정을 아예 시도하지 않은 담보)를 표현한다.
export type CoverageAmount =
  | { kind: "range"; min: number; max: number; displayText: string }
  | { kind: "fixed"; value: number; displayText: string }
  | { kind: "unavailable"; displayText: string };

// CoverageItem은 status로 판별되는 discriminated union이다 — REQ-B2CRESULT-005가
// 요구하는 "가능성 낮음은 reasonNote 필수"를 타입 체크 시점에 강제하기 위해,
// reasonNote는 개별 optional 필드가 아니라 status별 분기 안에서만 필수/선택이
// 결정되도록 구성한다.
interface CoverageItemBase {
  id: string;
  category: CoverageCategory;
  name: string;                       // 예: "5대 골절 진단비"
  description: string;                // 담보/보장 방식 설명(카테고리·케이스 공통이 아닌, 이 항목 전용 문구)
  whyCheck: string;                   // "왜 이 담보를 확인해야 하는지"에 대한 설명
  evidenceRefs?: string[];            // 판정 근거 참조(예: 약관 조항, 답변 요약)
  additionalInfoNote?: string;        // status === "needs-info"일 때의 안내 문구
  requiredDocuments?: string[];       // 청구/확인에 필요한 서류 목록
  multiMatch?: boolean;               // "복수 확인" 배지 — 하나의 사고가 여러 세부 담보에 걸칠 때
  factChips: FactChip[];
  subscriptionGenBadge?: string;      // 실손 의료비 카테고리 전용 — 가입 세대(1~4세대) 보조 배지(MIGRATION-PLAN §4)
}

export type CoverageItem =
  | (CoverageItemBase & { status: "review"; amount: CoverageAmount })
  | (CoverageItemBase & { status: "needs-info"; amount: CoverageAmount })
  | (CoverageItemBase & { status: "low-likelihood"; reasonNote: string; amount?: CoverageAmount });
// ↑ "low-likelihood" 분기에서만 reasonNote가 필수 필드다(REQ-B2CRESULT-005,
// AC-B2CRESULT-005 추가 시나리오) — 다른 두 분기는 reasonNote를 갖지 않는다.

// 구조화된 입력 요약 — rawInput 원문을 그대로 재노출하는 대신, 02 화면이
// 필요로 하는 최소 구조(사고 유형 라벨 + 요약 문장)로 가공한 값이다.
export interface InputAccidentSummary {
  category: string;      // 예: "골절"
  description: string;   // 예: "3일 전 헬스장에서 벤치프레스 중 무릎 골절"
}

export interface DiagnosisResult {
  resultId: string;                    // 결과 인스턴스 식별자(REQ-B2CRESULT-001) — run-phase가 UUID 등으로 생성
  schemaVersion: string;                // 이 계약의 버전(예: "1"). 03 SPEC 등 후속 소비자가 형태 변화를 감지하기 위함
  rawInput: string;
  answers: Record<string, string>;
  inputSummary: InputAccidentSummary;   // 사고 내용 구조화 요약
  priorityChecks: string[];             // "확인 우선순위" — 우선 확인할 항목을 순서대로 나열(문구는 items에서 파생하거나 fixture가 직접 제공)
  items: CoverageItem[];
  generatedAt: string; // ISO 8601 — 표시 전용, 저장되지 않음
}
```

**결정 (확정)**: 카테고리·상태는 문자열 리터럴 union으로 고정하며 `string` 타입으로 느슨화하지 않는다(REQ-B2CRESULT-001) — TypeScript strict 모드가 5번째 카테고리 추가를 컴파일 시점에 차단하는 것이 목적이다. `CoverageItem`은 `status`로 판별되는 discriminated union이며, `reasonNote`의 필수/선택 여부는 (zod refine 같은 런타임 검증이 아니라) 타입 정의 자체에서 결정된다 — 컴파일 시점에 "가능성 낮음인데 reasonNote 누락"을 차단하는 것이 목적이다.

**하드코딩 문구 금지 (REQ-B2CRESULT-001, AC-B2CRESULT-006 추가 시나리오)**: `components/result/*` 컴포넌트는 카테고리 설명·whyCheck·배지 등 케이스별로 달라지는 문구를 절대 리터럴로 직접 작성하지 않는다 — 모든 동적 문구는 위 `DiagnosisResult`/`CoverageItem` 필드에서 오거나(케이스별 값), 상태 pill 라벨("검토 대상"/"추가 정보 필요"/"가능성 낮음") 같은 케이스 무관 고정 문구는 `lib/diagnosis/labels.ts` 같은 공용 상수 모듈 하나에서만 온다.

## 2. 집계 함수 (`lib/diagnosis/aggregate.ts`, 신규)

```ts
// [설계 의도]
export interface DiagnosisAggregate {
  total: number;
  review: number;
  needsInfo: number;
  lowLikelihood: number;
}

export function computeAggregate(items: readonly CoverageItem[]): DiagnosisAggregate {
  // items.length와 status별 reduce만으로 구현 — 하드코딩된 상수 없음(REQ-B2CRESULT-002)
}
```

`result-aggregate-banner.tsx`는 이 함수의 반환값만 렌더링하며, 디자인 목업의 예시 숫자(15/8/6/1, `design/MIGRATION-PLAN.md` §4)는 픽스처 데이터 안에만 존재하고 코드 상수로는 어디에도 등장하지 않는다.

## 3. 01→02 인계 채널 (`lib/diagnosis/handoff.ts`, 신규) — 결정 및 근거

**검토한 대안 세 가지**:

| 대안 | 장점 | 단점 | 채택 여부 |
|---|---|---|---|
| URL 쿼리 파라미터(base64 JSON) | 새로고침·북마크 가능, 서버 미경유 | `answers` 확장 시 URL 길이 관리 필요, 인코딩/디코딩 로직 추가 | 미채택 |
| `sessionStorage` | 서버 미경유, 라우트 전환에도 생존, 구현 단순 | 새로고침 후 재방문 시 재사용 불가(단, 이는 REQ-B2CDIAG-015의 "새로고침 시 초기화" 원칙과 오히려 정합) | **채택** |
| 서버 API 왕복(임시 세션 레코드) | 데이터 크기 제약 없음 | REQ-B2CDIAG-021/REQ-B2CFOUND 원칙(서버 영구 저장 없음)과 충돌, 신규 API 라우트 필요(Out of Scope) | 미채택 |

**결정 (확정)**: `sessionStorage`. 저장·조회·삭제를 3개의 분리된 함수로 노출한다 — 어떤 함수도 "읽으면서 동시에 지운다"는 암묵적 부수효과를 갖지 않는다(review 피드백 반영: 이전 초안의 read-once-then-clear 설계는 새로고침 시 결과가 사라지는 문제가 있어 철회한다).

```ts
// [설계 의도]
export function writeDiagnosisHandoff(result: DiagnosisResult): void { /* ... */ }
export function readDiagnosisHandoff(): DiagnosisResult | null { /* 읽기만 하며, 제거하지 않는다 */ }
export function clearDiagnosisHandoff(): void { /* 명시적 트리거에서만 호출 */ }
```

`writeDiagnosisHandoff(result: DiagnosisResult)`는 진단 중 단계가 `"result"`로 완료되는 시점에 `buildFractureResult(rawInput, answers)`가 구성한 **완전한** `DiagnosisResult`를 1회 기록한다(§4) — `rawInput`/`answers`만 저장하고 결과 구성을 `/result` 쪽으로 미루지 않는다(REQ-B2CRESULT-010). `/result` 마운트 시 `readDiagnosisHandoff()`가 값을 읽어 렌더링하며, 이 호출은 `sessionStorage`를 변경하지 않는다(REQ-B2CRESULT-016, AC-B2CRESULT-016). SSR 환경(`typeof window === "undefined"`)에서는 세 함수 모두 안전하게 `null`/no-op을 반환한다. 키는 프로젝트 네임스페이스를 포함한 전용 문자열을 사용한다(REQ-B2CRESULT-017, 예: `"bosang-radar:diagnosis-handoff-v1"`— 실제 값은 run-phase가 확정).

**왜 탭 세션 동안 유지하는가(수명 정책, REQ-B2CRESULT-016)**: 이전 초안의 "1회 읽고 즉시 삭제" 설계는 새로고침·뒤로가기 시 결과가 사라지는 부작용이 있었다(review 피드백 — 사용자가 결과를 다시 보려고 새로고침하면 "결과 없음" 상태로 튕기는 것은 좋은 경험이 아니다). 새 설계는 데이터를 동일 탭 세션 동안 유지하고, `clearDiagnosisHandoff()`를 아래 세 경우에만 명시적으로 호출한다:

1. **새 진단 시작** — 01 입력 화면에서 새 입력을 제출해 새로운 `loading` 사이클이 시작될 때(`diagnosis-flow.tsx`가 호출).
2. **상담 신청 완료** — 03 상담 신청 SPEC의 범위. 이 SPEC은 `clearDiagnosisHandoff()`를 상담 신청 완료 콜백에서 호출한다는 **트리거 지점만 예약**하며, 03의 실제 구현은 다루지 않는다(§12 참고).
3. **사용자의 명시적 초기화 요청** — run-phase가 UI 형태(예: "새로 진단하기" 버튼)를 확정한다.

이 세 트리거 밖에서는(단순 페이지 조회·새로고침·뒤로가기) 데이터가 보존되며, 02 화면 안에서의 탭 전환·인터랙션은 모두 React state(마운트 시 1회 읽은 값)로 처리된다.

## 4. 기존 01 mock 판정 로직 확장 (`step-loading.tsx`, 기존 파일 최소 확장) — 충돌 회피 결정

SPEC-B2C-DIAGNOSIS-001의 `mockJudge(input)`는 현재 다음과 같다:

```ts
export function mockJudge(input: string): "result-none" | "error" {
  return input.includes("오류") ? "error" : "result-none";
}
```

이 SPEC은 세 번째 결과("결과 있음")를 추가해야 하지만, **부분 문자열 키워드 방식을 그대로 확장하면 기존 01 E2E 회귀가 발생한다**: `e2e/diagnosis-flow-01.spec.ts`의 `RESULT_NONE_INPUT = "무릎 골절로 수술을 받았어요"`가 이미 "골절"이라는 단어를 포함하고 있고, 이 브리프가 제시한 예시 fixture 입력(`"3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요"`, `step-input.tsx` placeholder와 동일)도 "골절"을 포함한다 — 만약 "골절" 포함 여부로 새 분기를 만들면 기존 `RESULT_NONE_INPUT` 테스트가 더 이상 `result-none`으로 판정되지 않아 깨진다.

**결정 (확정)**: 신규 분기는 **정확 문자열 일치(exact match)** 로만 트리거하며, **fixture 실행 여부는 항상 명시적 boolean 인자로 게이트한다** — `<DiagnosisFlow />`가 마운트되었다는 사실(즉 `productionReady || reviewEnabled`가 참이었다는 암묵적 추론)만으로는 fixture를 허용하지 않는다(REQ-B2CRESULT-009 — review 피드백: defense-in-depth). `mockJudge`는 `reviewEnabled`를 2번째 인자로 받는다.

```ts
// [설계 의도 — 실제 판정 순서]
export function mockJudge(input: string, reviewEnabled: boolean): "result-none" | "error" | "result" {
  if (reviewEnabled && input === FRACTURE_FIXTURE_INPUT) return "result";
  if (input.includes("오류")) return "error";
  return "result-none";
}
```

`FRACTURE_FIXTURE_INPUT`은 `lib/diagnosis/fixtures/fracture-case.ts`에서 import한다(단일 정의처, 중복 금지). `reviewEnabled`는 `DiagnosisFlow`가 이미 prop으로 받는 `enableDevStates`(§0, `app/page.tsx`의 `computeDiagnosisFlags()` 결과)를 `StepLoading`에 그대로 전달(prop drilling)한 값이다 — `StepLoading`이 `process.env`를 직접 읽거나 다른 상태로부터 이 값을 추론하지 않는다. 조건 순서(reviewEnabled && exact 일치 → "오류" 포함 → 기본값)는 `FRACTURE_FIXTURE_INPUT` 문자열 자체가 "오류"를 포함하지 않으므로 순서 자체가 동작에 영향을 주지는 않지만, 가장 구체적인 조건을 먼저 둔다. 기존 `RESULT_NONE_INPUT`("무릎 골절로 수술을 받았어요")과 `ERROR_INPUT`("분석 중 오류가 발생했어요")은 `FRACTURE_FIXTURE_INPUT`과 정확히 다른 문자열이므로 `reviewEnabled` 값과 무관하게 각각 기존과 동일하게 `result-none`/`error`로 판정된다(REQ-B2CRESULT-011, AC-B2CRESULT-011/011b).

**`diagnosis-flow.tsx` 최소 확장**: `StepLoading`이 `onDone(step: "result-none" | "error" | "result")`를 호출할 때, `"result"`인 경우 `FORCE_STEP` dispatch(기존 상태 머신 전이)가 아니라 다음 순서의 사이드 이펙트를 수행하는 분기를 추가한다 — `DiagnosisStep` 유니언 타입 자체에는 `"result"`를 추가하지 않는다(01의 6단계 상태 머신은 변경하지 않고, "결과 있음"은 애초에 라우트 이동이므로 상태값이 아니라 사이드 이펙트로 처리한다, Enforce Simplicity):

1. `buildFractureResult(state.input, state.answers)`를 호출해 완전한 `DiagnosisResult`를 구성한다(§1/§7).
2. `writeDiagnosisHandoff(result)`로 그 결과 전체를 기록한다(§3) — `rawInput`/`answers`만 별도로 저장하지 않는다.
3. `router.push('/result')`로 이동한다.

동일 컴포넌트가 소유한 reducer가 새 진단을 시작하는 액션(예: 입력 화면으로 돌아가 새 입력을 제출)을 처리할 때는 `clearDiagnosisHandoff()`를 호출해 이전 세션의 handoff를 제거한다(§3의 새 진단 시작 트리거).

## 5. `/result` 라우트 셸 (`app/result/page.tsx`, 신규) + 게이트 공유 리팩터

`app/page.tsx`가 현재 인라인으로 계산하는 `productionReady`/`reviewEnabled`/`shouldRenderDiagnosis`(§19, REQ-B2CDIAG-025)를 `lib/diagnosis/flags.ts`의 `computeDiagnosisFlags(env)` 단일 함수로 추출한다(REQ-B2CRESULT-012). `app/page.tsx`는 이 함수를 호출하도록 최소 리팩터되며(기존 `app/page.test.tsx`의 5행 동작 행렬은 회귀 없이 계속 PASS해야 한다), `app/result/page.tsx`는 동일 함수를 재사용한다.

```
app/
└── result/
    └── page.tsx   # [신규] Server Component — computeDiagnosisFlags() 재사용
                    #        shouldRenderDiagnosis=false → 기존과 동일한 "서비스 준비 중입니다" placeholder
                    #        shouldRenderDiagnosis=true  → <Suspense fallback={<ResultSkeleton/>}><ResultView/></Suspense>

components/
└── result/          # [신규]
    ├── result-view.tsx              # "use client" — 마운트 시 handoff 1회 읽기, Desktop/Mobile 분기
    ├── result-skeleton.tsx          # Suspense fallback
    ├── result-aggregate-banner.tsx
    ├── coverage-category-section.tsx
    ├── coverage-item-card.tsx
    ├── result-category-tabs.tsx     # Mobile 전용 tablist/tab/tabpanel
    ├── result-cta-bar.tsx           # 3곳 CTA, 03 부재로 stub
    ├── result-no-data.tsx           # REQ-B2CRESULT-013
    └── result-error.tsx             # REQ-B2CRESULT-014

lib/
└── diagnosis/        # [신규]
    ├── types.ts
    ├── aggregate.ts
    ├── handoff.ts
    ├── flags.ts                     # computeDiagnosisFlags() — app/page.tsx도 이 함수로 리팩터
    └── fixtures/
        └── fracture-case.ts         # FRACTURE_FIXTURE_INPUT + buildFractureResult(rawInput, answers): DiagnosisResult
```

**Server/Client 경계**: `app/result/page.tsx`는 `app/page.tsx`와 동일하게 Server Component로 유지한다. `sessionStorage` 접근은 브라우저 API이므로 `result-view.tsx`부터 하위 전체가 `"use client"`다.

## 6. Desktop/Mobile 컴포넌트 재사용 경계

`result-view.tsx`가 `useMediaQuery(DESKTOP_MEDIA_QUERY)`(`components/diagnosis/use-media-query.ts` 재사용, 복제하지 않음)로 분기한다:

- **Desktop**: `items`를 4개 카테고리로 `groupBy` 한 뒤 `coverage-category-section.tsx`를 4번(카테고리 순서 고정) 렌더링 — 전부 동시에 DOM에 존재.
- **Mobile**: `result-category-tabs.tsx`가 선택된 카테고리 하나만 `coverage-category-section.tsx`에 전달 — 나머지 3개는 렌더 트리에서 제외(REQ-B2CRESULT-003b, "한 번에 하나만"이 디자인 의도이므로 `hidden` CSS가 아니라 조건부 렌더링).

두 분기 모두 `coverage-category-section.tsx`/`coverage-item-card.tsx`를 그대로 재사용하며, 이 SPEC은 Desktop 전용·Mobile 전용 카드 컴포넌트를 별도로 만들지 않는다(REQ-B2CRESULT-004, Enforce Simplicity).

## 7. Fact Chip 매핑

`CoverageItem.factChips`는 `buildFractureResult(rawInput, answers): DiagnosisResult`(review 전용 fixture 빌더)가 골절 사례 고정 담보 목록 위에 `answers` 딕셔너리를 매핑해 생성한다 — 매핑 규칙(질문 ID → 어느 카드에 Chip을 붙일지)은 fixture 내부에 하드코딩된 골절 사례 전용 테이블이며, 실제 매칭 엔진이 결정되기 전까지는 일반화하지 않는다(§ Out of Scope와 일치). 응답이 `answers`에 없는 질문 ID는 매핑 테이블에서 제외되어 Chip이 생성되지 않는다(REQ-B2CRESULT-008). `buildFractureResult`는 `factChips`뿐 아니라 `resultId`/`schemaVersion`/`inputSummary`/`priorityChecks`를 포함한 `DiagnosisResult` 전체를 반환한다(§1) — 반환값은 즉시 `writeDiagnosisHandoff()`로 기록되는 최종 형태이며(§3/§4), `/result`가 추가로 가공하지 않는다. 컴포넌트별 설명 문구(`description`/`whyCheck`/`requiredDocuments` 등)도 이 fixture가 골절 사례 전용 값으로 채워 넣으며, 컴포넌트에 리터럴로 존재하지 않는다(§1 하드코딩 문구 금지).

## 8. 03 상담 CTA — stub 처리 (결정 확정)

`design/MIGRATION-PLAN.md` §4 "상담 CTA 배치(3곳)"를 그대로 배치하되(상단 탑바 "카톡 상담", 후유장해 섹션 "내 장해율이 얼마나 나올지 궁금하신가요?", 하단 "N가지를 전부 청구하시겠어요?"), 03 라우트가 존재하지 않으므로 클릭 시 실제 페이지 이동을 수행하지 않는다(REQ-B2CRESULT-023).

**결정 (확정, review 피드백 반영 — 더 이상 run-phase 미결정 항목이 아니다)**: 네이티브 `disabled` 속성은 사용하지 않는다 — `disabled` 버튼은 키보드 포커스 대상에서 완전히 제외되고 일부 스크린리더 조합에서 존재 자체가 인지되지 않아, "왜 이 버튼이 비활성인지" 사용자가 알 수 없다. 대신:

- `aria-disabled="true"`를 부여해 버튼을 포커스 가능하게 유지한다(`tabindex`로 제외하지 않는다).
- 클릭 핸들러와 `Enter`/`Space` 키 활성화 모두 동일한 no-op 경로로 처리하며, 실제 네비게이션(`router.push`/`<a href>` 등) 없이 "준비 중" 안내를 표시한다(토스트 또는 `aria-live` 영역 — run-phase가 기존 `components/ui/*`의 알림 패턴을 재사용해 구현 형태를 정한다).
- "준비 중" 안내는 스크린리더가 인지할 수 있는 텍스트로 전달되어야 한다 — 시각적으로만 보이는 툴팁 하나로 끝내지 않는다(AC-B2CRESULT-023 스크린리더 시맨틱 시나리오).

이 결정으로 `plan.md` §B의 "미결정" 행은 제거되었다(§ 결정 이력은 `plan.md` §B 및 `progress.md` §G 참고).

## 9. review 전용 결정론적 진입 (시각 검증용)

01 SPEC이 확립한 `?devStep=`(`ENABLE_DIAGNOSIS_DEV_STATES` 게이트) 패턴을 `/result`에도 동일하게 적용한다 — `reviewEnabled`가 참인 환경에서 `/result?devFixture=fracture`로 직접 접근하면 01 플로우를 매번 완주하지 않고도 `buildFractureResult(rawInput, answers)`의 고정 데이터로 `ResultView`를 결정론적으로 렌더링할 수 있다. 이는 `pnpm visual:verify`가 5개 신규 화면을 안정적으로 캡처하기 위한 전용 진입점이며, `reviewEnabled=false`(프로덕션 기본값)에서는 무시된다(01의 `?devStep=` 계약과 동일한 안전 원칙). 이 진입점은 §4의 `mockJudge` boolean 게이트와 **같은 `reviewEnabled` 값**을 재사용한다 — `/result` 라우트 자체가 별도의 게이트 로직을 인라인으로 다시 계산하지 않는다(REQ-B2CRESULT-009/012, AC-B2CRESULT-009 추가 시나리오).

## 10. 접근성

- `result-category-tabs.tsx`: WAI-ARIA Tabs 패턴(`role="tablist"`/`role="tab"` + `aria-selected`/`role="tabpanel"`), 방향키로 탭 이동.
- 탭 전환 시 포커스는 새 패널의 카테고리 제목(`<h2>`)으로 이동한다(01의 "질문 전환 시 포커스가 새 제목으로 이동" 패턴 재사용, REQ-B2CRESULT-021).
- 상태 pill은 텍스트 라벨을 항상 포함한다(REQ-B2CRESULT-020) — 배경/보더 색상은 보조 신호일 뿐이다.
- 모든 애니메이션은 `prefers-reduced-motion` 존중(기존 `diagnosis-flow.tsx`/`popover.tsx` 패턴 재사용).

## 11. 금액·문구 정책 (재확인)

`design/MIGRATION-PLAN.md` §5를 그대로 따른다 — 놀라움의 축은 담보 개수, 금액은 범위 표기(정액 담보만 예외), 면책 문구 항상 노출, 단정형 표현 금지(REQ-B2CRESULT-022). 이 원칙은 `product.md`가 이미 프로젝트 전역 원칙으로 채택했으므로 이 SPEC은 새로 결정하지 않고 그대로 적용한다.

## 12. 03 상담 신청과의 전달 경계 (비구속 설계 노트)

이 절은 **결정이 아니라 노트**다 — 03 상담 신청 SPEC의 실제 설계는 그 SPEC 자신이 한다(§ Out of Scope). 다만 이 SPEC이 03을 막지 않도록 두 가지만 기록해 둔다:

- `DiagnosisResult`의 `resultId`/`schemaVersion`(§1)은 03이 "어느 진단 결과에 대한 상담 신청인지"를 참조할 수 있는 안정적인 식별자·버전 표지로 설계되었다 — 03이 별도 식별자 체계를 새로 만들 필요 없이 이 값을 그대로 소비할 수 있다.
- `clearDiagnosisHandoff()`(§3)는 상담 신청 "완료" 시점에 호출될 트리거 지점으로 예약되어 있다 — 03이 실제로 이 함수를 호출하는 코드(상담 신청 완료 콜백 등)를 작성하는 것은 이 SPEC의 범위 밖이며, 이 SPEC은 그 함수가 존재하고 호출 가능하다는 것만 보장한다.
