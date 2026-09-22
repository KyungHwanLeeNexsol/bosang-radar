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

export interface CoverageItem {
  id: string;
  category: CoverageCategory;
  name: string;                       // 예: "5대 골절 진단비"
  status: CoverageStatus;
  reasonNote?: string;                // status === "low-likelihood"일 때 사실상 필수(run-phase가 zod refine으로 강제 검토)
  amount?: {
    kind: "range" | "fixed";
    min?: number;
    max?: number;
    value?: number;
    label?: string;                   // 예: "정액 · 약관 확정"
  };
  factChips: FactChip[];
  subscriptionGenBadge?: string;      // 실손 의료비 카테고리 전용 — 가입 세대(1~4세대) 보조 배지(MIGRATION-PLAN §4)
}

export interface DiagnosisResult {
  rawInput: string;
  answers: Record<string, string>;
  items: CoverageItem[];
  generatedAt: string; // ISO 8601 — 표시 전용, 저장되지 않음
}
```

**결정 (확정)**: 카테고리·상태는 문자열 리터럴 union으로 고정하며 `string` 타입으로 느슨화하지 않는다(REQ-B2CRESULT-001) — TypeScript strict 모드가 5번째 카테고리 추가를 컴파일 시점에 차단하는 것이 목적이다.

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

**결정 (확정)**: `sessionStorage`. `writeDiagnosisHandoff(data: DiagnosisResultHandoff)`가 진단 중 단계 완료 시점에 1회 기록하고, `/result` 마운트 시 `readAndClearDiagnosisHandoff()`가 1회 읽은 뒤 즉시 키를 제거한다(REQ-B2CRESULT-016). SSR 환경(`typeof window === "undefined"`)에서는 두 함수 모두 안전하게 `null`/no-op을 반환한다. 키는 프로젝트 네임스페이스를 포함한 전용 문자열을 사용한다(REQ-B2CRESULT-017, 예: `"bosang-radar:diagnosis-handoff-v1"`— 실제 값은 run-phase가 확정).

**왜 1회 읽고 즉시 삭제하는가**: 새로고침 시 01의 기존 원칙(REQ-B2CDIAG-015 — 새로고침은 항상 초기 상태로)과 자연스럽게 일치시키기 위함이다. 02 화면 안에서의 탭 전환·인터랙션은 모두 React state(첫 읽기 이후)로 처리되므로, 키 삭제가 화면 내 상호작용에 영향을 주지 않는다.

## 4. 기존 01 mock 판정 로직 확장 (`step-loading.tsx`, 기존 파일 최소 확장) — 충돌 회피 결정

SPEC-B2C-DIAGNOSIS-001의 `mockJudge(input)`는 현재 다음과 같다:

```ts
export function mockJudge(input: string): "result-none" | "error" {
  return input.includes("오류") ? "error" : "result-none";
}
```

이 SPEC은 세 번째 결과("결과 있음")를 추가해야 하지만, **부분 문자열 키워드 방식을 그대로 확장하면 기존 01 E2E 회귀가 발생한다**: `e2e/diagnosis-flow-01.spec.ts`의 `RESULT_NONE_INPUT = "무릎 골절로 수술을 받았어요"`가 이미 "골절"이라는 단어를 포함하고 있고, 이 브리프가 제시한 예시 fixture 입력(`"3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요"`, `step-input.tsx` placeholder와 동일)도 "골절"을 포함한다 — 만약 "골절" 포함 여부로 새 분기를 만들면 기존 `RESULT_NONE_INPUT` 테스트가 더 이상 `result-none`으로 판정되지 않아 깨진다.

**결정 (확정)**: 신규 분기는 **정확 문자열 일치(exact match)** 로만 트리거한다 — 부분 문자열 매칭이 아니다.

```ts
// [설계 의도 — 실제 판정 순서]
export function mockJudge(input: string): "result-none" | "error" | "result" {
  if (input === FRACTURE_FIXTURE_INPUT) return "result";
  if (input.includes("오류")) return "error";
  return "result-none";
}
```

`FRACTURE_FIXTURE_INPUT`은 `lib/diagnosis/fixtures/fracture-case.ts`에서 import한다(단일 정의처, 중복 금지). 이 순서(정확 일치 → "오류" 포함 → 기본값)는 `FRACTURE_FIXTURE_INPUT` 문자열 자체가 "오류"를 포함하지 않으므로 순서 자체는 동작에 영향을 주지 않지만, 가독성을 위해 가장 구체적인 조건을 먼저 둔다. 기존 `RESULT_NONE_INPUT`("무릎 골절로 수술을 받았어요")과 `ERROR_INPUT`("분석 중 오류가 발생했어요")은 `FRACTURE_FIXTURE_INPUT`과 정확히 다른 문자열이므로 각각 기존과 동일하게 `result-none`/`error`로 판정된다(REQ-B2CRESULT-011, AC-B2CRESULT-011/011b).

**`diagnosis-flow.tsx` 최소 확장**: `StepLoading`이 `onDone(step: "result-none" | "error" | "result")`를 호출할 때, `"result"`인 경우 `FORCE_STEP` dispatch(기존 상태 머신 전이)가 아니라 handoff 기록 + `router.push('/result')`를 수행하는 분기를 추가한다 — `DiagnosisStep` 유니언 타입 자체에는 `"result"`를 추가하지 않는다(01의 6단계 상태 머신은 변경하지 않고, "결과 있음"은 애초에 라우트 이동이므로 상태값이 아니라 사이드 이펙트로 처리한다, Enforce Simplicity).

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
        └── fracture-case.ts         # FRACTURE_FIXTURE_INPUT + buildFractureResult(answers)
```

**Server/Client 경계**: `app/result/page.tsx`는 `app/page.tsx`와 동일하게 Server Component로 유지한다. `sessionStorage` 접근은 브라우저 API이므로 `result-view.tsx`부터 하위 전체가 `"use client"`다.

## 6. Desktop/Mobile 컴포넌트 재사용 경계

`result-view.tsx`가 `useMediaQuery(DESKTOP_MEDIA_QUERY)`(`components/diagnosis/use-media-query.ts` 재사용, 복제하지 않음)로 분기한다:

- **Desktop**: `items`를 4개 카테고리로 `groupBy` 한 뒤 `coverage-category-section.tsx`를 4번(카테고리 순서 고정) 렌더링 — 전부 동시에 DOM에 존재.
- **Mobile**: `result-category-tabs.tsx`가 선택된 카테고리 하나만 `coverage-category-section.tsx`에 전달 — 나머지 3개는 렌더 트리에서 제외(REQ-B2CRESULT-003b, "한 번에 하나만"이 디자인 의도이므로 `hidden` CSS가 아니라 조건부 렌더링).

두 분기 모두 `coverage-category-section.tsx`/`coverage-item-card.tsx`를 그대로 재사용하며, 이 SPEC은 Desktop 전용·Mobile 전용 카드 컴포넌트를 별도로 만들지 않는다(REQ-B2CRESULT-004, Enforce Simplicity).

## 7. Fact Chip 매핑

`CoverageItem.factChips`는 `buildFractureResult(answers)`(review 전용 fixture 빌더)가 골절 사례 고정 담보 목록 위에 `answers` 딕셔너리를 매핑해 생성한다 — 매핑 규칙(질문 ID → 어느 카드에 Chip을 붙일지)은 fixture 내부에 하드코딩된 골절 사례 전용 테이블이며, 실제 매칭 엔진이 결정되기 전까지는 일반화하지 않는다(§ Out of Scope와 일치). 응답이 `answers`에 없는 질문 ID는 매핑 테이블에서 제외되어 Chip이 생성되지 않는다(REQ-B2CRESULT-008).

## 8. 03 상담 CTA — stub 처리

`design/MIGRATION-PLAN.md` §4 "상담 CTA 배치(3곳)"를 그대로 배치하되(상단 탑바 "카톡 상담", 후유장해 섹션 "내 장해율이 얼마나 나올지 궁금하신가요?", 하단 "N가지를 전부 청구하시겠어요?"), 03 라우트가 존재하지 않으므로 클릭 시 실제 페이지 이동을 수행하지 않는다(REQ-B2CRESULT-023). run-phase가 두 형태 중 선택한다 — (a) `disabled` 버튼 + 툴팁 안내, (b) 클릭 시 "준비 중" 안내를 표시하는 no-op 핸들러. 결정은 run-phase 착수 시 디자인 재확인 후 확정(`plan.md` §B 미결정 목록).

## 9. review 전용 결정론적 진입 (시각 검증용)

01 SPEC이 확립한 `?devStep=`(`ENABLE_DIAGNOSIS_DEV_STATES` 게이트) 패턴을 `/result`에도 동일하게 적용한다 — `reviewEnabled`가 참인 환경에서 `/result?devFixture=fracture`로 직접 접근하면 01 플로우를 매번 완주하지 않고도 `buildFractureResult()`의 고정 데이터로 `ResultView`를 결정론적으로 렌더링할 수 있다. 이는 `pnpm visual:verify`가 5개 신규 화면을 안정적으로 캡처하기 위한 전용 진입점이며, `reviewEnabled=false`(프로덕션 기본값)에서는 무시된다(01의 `?devStep=` 계약과 동일한 안전 원칙).

## 10. 접근성

- `result-category-tabs.tsx`: WAI-ARIA Tabs 패턴(`role="tablist"`/`role="tab"` + `aria-selected`/`role="tabpanel"`), 방향키로 탭 이동.
- 탭 전환 시 포커스는 새 패널의 카테고리 제목(`<h2>`)으로 이동한다(01의 "질문 전환 시 포커스가 새 제목으로 이동" 패턴 재사용, REQ-B2CRESULT-021).
- 상태 pill은 텍스트 라벨을 항상 포함한다(REQ-B2CRESULT-020) — 배경/보더 색상은 보조 신호일 뿐이다.
- 모든 애니메이션은 `prefers-reduced-motion` 존중(기존 `diagnosis-flow.tsx`/`popover.tsx` 패턴 재사용).

## 11. 금액·문구 정책 (재확인)

`design/MIGRATION-PLAN.md` §5를 그대로 따른다 — 놀라움의 축은 담보 개수, 금액은 범위 표기(정액 담보만 예외), 면책 문구 항상 노출, 단정형 표현 금지(REQ-B2CRESULT-022). 이 원칙은 `product.md`가 이미 프로젝트 전역 원칙으로 채택했으므로 이 SPEC은 새로 결정하지 않고 그대로 적용한다.
