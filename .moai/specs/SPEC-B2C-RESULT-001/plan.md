# Plan — SPEC-B2C-RESULT-001

## 결정 우선순위 (Decision Review Priority)

아래 마일스톤은 실행 순서(의존성 기반)로 정렬되어 있다. 그중 **되돌리기 어렵거나 다른 결정에 가장 큰 영향을 주는 결정**은 다음 네 가지이며, 리뷰 시 이 순서로 먼저 확인할 것을 권장한다.

1. **M1 — `DiagnosisResult` 데이터 타입 계약** (`lib/diagnosis/types.ts`): 이후 모든 컴포넌트(Desktop/Mobile 렌더링, 집계 배너, Fact Chip, fixture)가 이 타입에 의존한다. 실제 매칭 엔진이 아직 없으므로 이 타입이 사실상 엔진과 UI 사이의 유일한 계약이다(`design.md` §1).
2. **M2 — 01→02 인계 데이터 채널** (`sessionStorage` 기반 `lib/diagnosis/handoff.ts`): 서버 저장 없이 라우트 경계를 넘는 유일한 메커니즘이며, 잘못 설계하면 새로고침·직접 접근·정상 플로우 세 가지 진입 경로 처리 전체가 흔들린다(`design.md` §3).
3. **M2 — 기존 01 mock 판정 로직 확장 방식** (`step-loading.tsx`의 `mockJudge` 정확 일치 분기 추가): 기존 `RESULT_NONE_INPUT`("무릎 골절로 수술을 받았어요")이 "골절"이라는 단어를 포함하고 있어, **부분 문자열 키워드 방식으로 확장하면 기존 01 E2E 회귀가 발생한다** — 반드시 정확 문자열 일치(exact match)로 신규 fixture를 구분해야 한다(`design.md` §4, `plan.md` §B 참고).
4. **M4 — Desktop/Mobile 컴포넌트 재사용 경계** (같은 `DiagnosisResult` 데이터를 소비하는 단일 렌더 트리 vs 두 개의 병렬 트리): 이 경계를 잘못 그으면 REQ-B2CRESULT-004(데이터 원본 동일성)가 유지보수 과정에서 깨지기 쉬워진다(`design.md` §5).

## §A. Context

- 선행 SPEC: SPEC-B2C-DIAGNOSIS-001(완료) — `app/page.tsx`가 `productionReady || reviewEnabled` 게이트 뒤에 `<DiagnosisFlow />`를 렌더링하며, `loading` 상태의 `mockJudge()`가 `"result-none" | "error"` 두 갈래만 반환한다. `design.md` §9가 미래 02 경계용 `DiagnosisHandoff { rawInput, answers }` 데이터 shape을 느슨하게 예고해 두었다.
- 배포 기준선: PR #17(`2c53ace`)이 01 화면 배포·검증 완료. 이 SPEC은 배포 워크플로를 수정하지 않는다(§4 Out of Scope).
- 기존 재사용 가능 자산: `components/diagnosis/use-media-query.ts`(`DESKTOP_MEDIA_QUERY`, 768px 판정 — 재사용, 복제하지 않음), `components/diagnosis/diagnosis-header.tsx`/`diagnosis-footer.tsx`(레이아웃 셸 재사용 검토), `components/ui/*` 11종, `zod` 4.4.3.
- 디자인 SSOT: `design/MIGRATION-PLAN.md` §2 ②/④(화면 목록·Desktop/Mobile 대응), §4(디자인 언어 — 4카테고리·집계 기준·담보 카드 3톤·CTA 배치), §5(금액 표기 정책) + `design/exports/`(5개 대상 화면).

## §B. Known Issues (미결정 · 리스크)

| 항목 | 상태 | 비고 |
|---|---|---|
| 담보 매칭 로직(정적 규칙 vs AI) | 미결정 (`tech.md`) | 이 SPEC은 `DiagnosisResult` 데이터 계약과 UI만 정의하고, 실제 엔진 연결은 다루지 않는다 |
| `lib/pipeline/` 재사용 여부 | 미결정 (REQ-B2CFOUND-007) | 이 SPEC은 관여하지 않음 |
| **기존 `mockJudge()` 키워드("골절")와 신규 fixture 트리거의 충돌 위험** | **결정됨** — 부분 문자열이 아닌 정확 문자열 일치(exact match)로 신규 fixture를 판정해 기존 `RESULT_NONE_INPUT`("무릎 골절로 수술을 받았어요")과의 충돌을 원천 차단한다. 판정 순서: ① `reviewEnabled && input === FRACTURE_FIXTURE_INPUT` → `"result"`, ② `input.includes("오류")` → `"error"`, ③ 그 외 → `"result-none"`(기존 동작 그대로) — `reviewEnabled &&`는 REQ-B2CRESULT-009 defense-in-depth 게이트를 판정식 자체에 명시한 것이다(단독 `input === ...` 만으로 fixture를 트리거하지 않는다) | `design.md` §4, `research.md` §3 참고 |
| 01→02 인계 데이터 채널 방식(URL 쿼리 vs `sessionStorage` vs 서버 왕복) | **결정됨** — `sessionStorage`, 탭 세션 동안 유지(마운트 시 1회 읽되 제거하지 않음 — 새 진단 시작/상담 신청 완료/사용자 명시적 초기화 3가지 트리거에서만 제거, REQ-B2CRESULT-016) | 근거: 서버 미경유(REQ-B2CDIAG-021 원칙의 자연스러운 연장), URL 인코딩 복잡도 회피, 라우트 전환 시 React state 소실 문제 해결. 이전 초안의 "1회 읽고 즉시 삭제" 설계는 새로고침·뒤로가기 시 결과가 사라지는 부작용이 있어 review 피드백으로 철회됨(`design.md` §3 참고) |
| 02 담보 데이터 확장(암·뇌혈관 등) | 후속 SPEC 범위, 이 SPEC의 Out of Scope | `product.md` §Roadmap A |
| 03 상담 CTA의 정확한 stub 형태 | **결정됨** — `aria-disabled="true"`(네이티브 `disabled` 아님) + 클릭/키보드(Enter·Space) 공통 no-op 핸들러 + 스크린리더가 인지 가능한 "준비 중" 안내. 키보드 포커스·접근성 트리 노출을 유지한다 | `design.md` §8(확정), `acceptance.md` AC-B2CRESULT-023(키보드 조작성·스크린리더 시맨틱 추가 시나리오) |

## §C. Pre-flight

- [ ] `git status` clean 확인, `plan/SPEC-B2C-RESULT-001` 브랜치가 `origin/main` 기준으로 생성됨(본 plan-phase에서 완료)
- [ ] `design/exports/`의 5개 대상 PNG(02, M02, M02-B, M02-C, M02-D) 확인됨(본 plan-phase에서 완료)
- [ ] `pnpm ls @base-ui/react zod` — 두 의존성 모두 이미 설치되어 있음을 확인(SPEC-B2C-DIAGNOSIS-001에서 이미 검증됨, 재확인만 필요)
- [ ] SPEC-B2C-DIAGNOSIS-001의 10화면 `pnpm visual:verify` 기준선이 여전히 PASS 상태인지 run-phase 착수 직전 재확인
- [ ] 후속 run-phase 시작 전, `origin/main`이 이 plan PR 병합 후의 최신 상태인지 재확인

## §D. Constraints

이 SPEC의 run-phase 산출물 범위는 4갈래로 나뉜다 — 아래 블랑킷 제약("신규 코드는 …")은 ①(프로덕션 애플리케이션 코드)에만 적용된다.

- **① 프로덕션 애플리케이션 코드**: `app/result/`, `components/result/`, `lib/diagnosis/`(신규 디렉터리)만 새로 추가한다. **기존 파일 중 정확히 3개만 최소 확장**이 허용된다 — `app/page.tsx`(게이트 계산을 `lib/diagnosis/flags.ts`로 위임하도록 리팩터), `components/diagnosis/step-loading.tsx`(`mockJudge` 반환 타입에 `"result"` 분기 추가), `components/diagnosis/diagnosis-flow.tsx`(loading 완료 콜백이 `"result"` 결과를 받으면 handoff 기록 + `/result` 이동을 트리거하는 새 prop/콜백 추가). 이 3개 외의 기존 01 컴포넌트(`step-input.tsx`, `step-consent-*.tsx`, `step-questions.tsx`, `step-result-none.tsx`, `step-error.tsx` 등)는 **손대지 않는다**. `lib/pipeline/`, `lib/ai/`, `lib/db/`, `db/`는 손대지 않는다(REQ-B2CFOUND-007 decision gate 유지). 신규 의존성 추가 없이 기존 스택으로 구현한다.
- **② 테스트**: 위 프로덕션 코드에 대응하는 단위·컴포넌트 테스트 및 Playwright `e2e/diagnosis-flow-02.spec.ts`(신규) — 기존 `e2e/diagnosis-flow-01.spec.ts`는 수정하지 않는다(회귀 검증 대상으로만 재실행). `scripts/visual-verify.ts`의 `SCREENS` 배열에 5개 항목을 **추가**한다(기존 10개 항목은 수정하지 않는다).
- **③ 문서**: `.moai/` SPEC 산출물 및 프로젝트 문서(`product.md`/`structure.md` Roadmap 갱신, Milestone 6).
- **④ 배포**: 이 SPEC은 배포 워크플로를 수정하지 않는다 — `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY`는 손대지 않는다.
- `sessionStorage` 외 DB·서버 영구 저장 없음. `sessionStorage`는 탭 세션 동안 유지하며(REQ-B2CRESULT-016), 명시적 트리거(새 진단 시작/상담 신청 완료/사용자 초기화) 없이는 제거하지 않는다 — 마운트 시 자동으로 지우는 "읽으면 사라지는" 구현은 이 제약 위반이다.
- `components/result/*` 컴포넌트 소스에 케이스 특정 동적 문구(카테고리 설명·whyCheck·배지 등)를 리터럴로 하드코딩하지 않는다 — 모든 동적 문구는 `DiagnosisResult`/`CoverageItem` 데이터 또는 `lib/diagnosis/` 공용 상수 모듈에서만 온다(REQ-B2CRESULT-001, AC-B2CRESULT-006 추가 시나리오).
- `design/claimradar-ui.pen`, `design/exports/`, `design/internal/`은 읽기 전용 참고 자료다 — 수정하지 않는다.

## §E. Self-Verification (plan-phase)

- [x] GEARS 표기 요구사항 25건 작성, Tier L 상한(25) 충족
- [x] Out of Scope 섹션에 5개 `### Out of Scope —` 하위 제목 + 각 bullet 작성
- [x] 기존 코드베이스 조사(app/, components/diagnosis/, lib/, scripts/visual-verify.ts, e2e/) 완료 — `research.md`
- [x] 디자인 export 5개 직접 열람 완료(파일 존재 확인)
- [x] plan-auditor 최종 독립 재검토 완료 — iteration 6 PASS 0.96, must-pass 5/7 PASS + 2/7 N/A, 감사 대상 커밋 `3dc7ae7`(iteration 5 PASS 0.95는 이후 4차 amendment로 stale화됐으며, 이 iteration 6이 그 대체 결과다)

## §F. Milestones (후속 `/moai run SPEC-B2C-RESULT-001`의 실행 계획)

아래 마일스톤은 모두 **후속 run-phase가 실행할 계획**이며, 이번 plan-phase는 문서만 작성한다.

1. **`DiagnosisResult` 데이터 타입 SSOT** — `lib/diagnosis/types.ts`에 `CoverageCategory`(4값 enum) · `CoverageStatus`(3값 enum) · `AccidentSummaryFact`(label+value 공통 구조) · `InputAccidentSummary`(title + when/where/mechanism/bodyPart 4개 `AccidentSummaryFact`) · `FactChip`(`AccidentSummaryFact` 상속 + questionId) · `PriorityCheck`(id/title/description/targetCategory) · `CoverageBadgeKind`(9값 고정 유니언) · `CoverageBadge`(id/label/kind) · `BenefitDisplay`(kind별 판별 유니언 5종 — range/fixed/formula/conditional/unavailable, 모든 분기 `label`+`displayText` 필수) · `CoverageItem`(status별 discriminated union — `"low-likelihood"` 분기만 `reasonNote` 필수, `badges`/`benefit`/`factChips`는 모든 분기 공통 필수) · `DiagnosisResult`(resultId/schemaVersion/rawInput/answers/inputSummary/priorityChecks/items/generatedAt) 정의(`design.md` §1). `lib/diagnosis/schema.ts`에 위 타입 전체를 미러링하는 zod 런타임 스키마(`DiagnosisResultSchema`/`BenefitDisplaySchema`/`CoverageItemSchema` 등, 모든 분기 `z.strictObject` — 알 수 없는 키 거부)를 정의한다(`design.md` §1b) — `lib/validation/`이 아니라 `lib/diagnosis/`(타입 정의와 같은 디렉터리) 아래에 둔다. `lib/diagnosis/aggregate.ts`에 `computeAggregate(items): { total, review, needsInfo, lowLikelihood }`와 `collectAnsweredFacts(items): FactChip[]`(questionId 중복 제거, `design.md` §2) 순수 함수 작성 + 단위 테스트(항목 개수를 바꾸면 집계 숫자도 바뀜을 증명하는 테스트, 동일 questionId가 여러 카드에 걸쳐도 strip에는 1회만 나타남을 증명하는 테스트 포함, REQ-B2CRESULT-002).
2. **01→02 인계 채널 + 기존 01 최소 확장** — `lib/diagnosis/handoff.ts`(`writeDiagnosisHandoff(result: DiagnosisResult)` / `readDiagnosisHandoff(): DiagnosisHandoffReadResult`(`{status:"empty"}` | `{status:"valid";result}` | `{status:"invalid";reason}` 3갈래 판별 유니언, `DiagnosisResultSchema.safeParse`로 판정, 읽기 전용·제거하지 않음) / `clearDiagnosisHandoff()`(새 진단 시작 시 호출 + 상담 신청 완료용 트리거 지점 예약), `sessionStorage` 래퍼, SSR 가드, 프로젝트 네임스페이스 키, `design.md` §3). `lib/diagnosis/fixtures/fracture-case.ts`(`FRACTURE_FIXTURE_INPUT` 상수 + `buildFractureResult(rawInput, answers): DiagnosisResult`, review 전용, resultId/schemaVersion/inputSummary/priorityChecks까지 포함한 완전한 결과를 반환). `step-loading.tsx`의 `mockJudge(input, reviewEnabled)`를 `"result-none" | "error" | "result"` 3갈래로 확장하며 `reviewEnabled` boolean 인자로 fixture 분기를 명시적으로 게이트한다(§B의 정확 일치 판정 순서 그대로 구현, 기존 두 갈래 동작 회귀 없음을 단위 테스트로 증명 — REQ-B2CRESULT-011, defense-in-depth boolean 게이트는 REQ-B2CRESULT-009). `diagnosis-flow.tsx`에 loading 완료 시 `"result"` 결과를 받아 `buildFractureResult` → `writeDiagnosisHandoff` → `useRouter().push('/result')` 순으로 호출하는 콜백을 추가하고, 새 진단 시작 액션에서 `clearDiagnosisHandoff()`를 호출하는 분기를 추가한다(기존 `FORCE_STEP` 액션·상태 도형은 변경하지 않는다).
3. **게이트 공유 리팩터 + `/result` 라우트 셸** — `lib/diagnosis/flags.ts`에 `computeDiagnosisFlags(env)` 추출(REQ-B2CRESULT-012), `app/page.tsx`가 이 헬퍼를 사용하도록 최소 리팩터(동작 변경 없음, `app/page.test.tsx`의 5행 동작 행렬이 계속 PASS함을 확인). `app/result/page.tsx`(Server Component) 신설 — 동일 헬퍼로 `shouldRenderDiagnosis` 계산, 거짓이면 기존 placeholder와 동일한 문구, 참이면 `<Suspense fallback={<ResultSkeleton />}><ResultView /></Suspense>`.
4. **Desktop/Mobile 결과 컴포넌트** — `components/result/result-view.tsx`("use client", 마운트 시 `readDiagnosisHandoff()`(제거하지 않는 읽기)로 handoff 조회 → 반환된 `DiagnosisHandoffReadResult` 3갈래를 그대로 분기: `"empty"`이면 no-data 상태(REQ-B2CRESULT-013), `"invalid"`이면(JSON 파싱 실패뿐 아니라 구문적으로 유효한 JSON이 스키마와 불일치하는 경우도 포함) error 상태(REQ-B2CRESULT-014), `"valid"`이면 `useMediaQuery(DESKTOP_MEDIA_QUERY)`로 Desktop 전체 펼침 vs Mobile 탭 분기; 새로고침·뒤로가기 후 재마운트에도 동일한 결과가 다시 보이는지 컴포넌트 테스트로 검증, REQ-B2CRESULT-016). `result-input-summary.tsx`(`inputSummary`의 title + when/where/mechanism/bodyPart 4-fact 렌더링 + `collectAnsweredFacts(items)` 기반 "추가 질문 답변" strip + "사고 내용 수정" 버튼(stub), REQ-B2CRESULT-001). `result-priority-checklist.tsx`(`priorityChecks` 렌더링 + 선택 시 `targetCategory`로 이동 — Desktop은 anchor scroll, Mobile은 `result-category-tabs.tsx` 탭 전환, `design.md` §6). `coverage-category-section.tsx`(카테고리 헤더 + 담보 카드 목록). `coverage-item-card.tsx`(3톤 상태 pill + 텍스트 라벨(REQ-B2CRESULT-020) + `badges: CoverageBadge[]` 렌더링(REQ-B2CRESULT-001/005) + `benefit.label`/`benefit.displayText` as-is 렌더링(REQ-B2CRESULT-006, 산술 연산 금지) + `description`/`whyCheck`/`evidenceRefs`/`requiredDocuments` 등 데이터 기반 동적 문구 렌더링(하드코딩 금지, `plan.md` §D) + `factChips: FactChip[]` 목록(label/value 2단, REQ-B2CRESULT-007/008) + 가능성 낮음 사유(`reasonNote`, 타입이 필수를 보장)). `result-aggregate-banner.tsx`(computeAggregate 소비). `result-category-tabs.tsx`(Mobile 전용, `tablist`/`tab`/`tabpanel` ARIA + 탭 전환 시 패널 제목으로 포커스 이동, REQ-B2CRESULT-019/021). `result-cta-bar.tsx`(3곳 CTA 배치는 MIGRATION-PLAN §4 그대로, `aria-disabled="true"` + 클릭·키보드 공통 no-op + "준비 중" 안내, 네이티브 `disabled` 미사용, REQ-B2CRESULT-023 — 결정 확정, `design.md` §8). `result-no-data.tsx`/`result-error.tsx`(02 전용 상태, REQ-B2CRESULT-013/014).
5. **접근성 · 반응형 · unit/component 테스트** — 키보드 탭 전환, `prefers-reduced-motion` 대응(기존 `diagnosis-flow.tsx` 패턴 재사용). Vitest: 타입/집계 함수, Fact Chip 매핑(응답 있음/없음 각 케이스), 탭 전환 상태, no-data/error 상태, `mockJudge` 3갈래 회귀 테스트(REQ-B2CRESULT-011).
6. **E2E + 시각 정합성 확장 + 문서 동기화** — `e2e/diagnosis-flow-02.spec.ts` 신규(01 전체 플로우 → 골절 fixture 입력 → `/result` 도착 → 집계 배너 검증 → Desktop 4카테고리 전부 표시 → Mobile 탭 전환 → Fact Chip 존재/부재 검증 → 직접 `/result` 접근 시 no-data 상태). `scripts/visual-verify.ts`의 `SCREENS` 배열에 5개 화면 정의 추가(기존 10개 배열 항목은 수정 금지) — review 전용 직접 진입 파라미터(예: `/result?devFixture=fracture`, `ENABLE_DIAGNOSIS_DEV_STATES` 게이트 재사용)로 결정론적 캡처를 지원한다. `pnpm visual:verify` 실행해 기존 10화면 PASS 유지 + 신규 5화면 PASS 확인. `product.md`/`structure.md` Roadmap 갱신(02 완료 반영).

## §G. Anti-Patterns (이 SPEC에서 피해야 할 것)

- 03 화면을 "겸사겸사" 함께 구현하지 않는다 — CTA는 stub까지만.
- 담보 매칭 엔진의 실제 구현 방식을 이 SPEC에서 판단하지 않는다.
- 기존 `mockJudge()`의 키워드 판정을 부분 문자열 방식으로 확장하지 않는다 — 반드시 정확 문자열 일치로 신규 fixture를 격리한다(§B 참고, 기존 `RESULT_NONE_INPUT`과의 충돌 방지).
- fixture 실행 여부를 `<DiagnosisFlow />` 마운트 여부 같은 다른 상태로부터 암묵적으로 추론하지 않는다 — `mockJudge`(또는 그 호출부)는 반드시 명시적 `reviewEnabled` boolean 인자를 받아 게이트한다(REQ-B2CRESULT-009, defense-in-depth).
- 집계 배너 숫자를 디자인 목업 값(15/8/6/1)으로 하드코딩하지 않는다 — 항상 `computeAggregate(items)`에서 도출한다.
- "가능성 낮음" 담보를 숨기거나 필터링하지 않는다.
- 금액을 클라이언트에서 재계산·합산하지 않는다 — `benefit.label`/`benefit.displayText`를 그대로 출력한다(`amount`/`CoverageAmount`라는 이전 필드명·타입명은 더 이상 존재하지 않는다).
- "먼저 확인할 항목"을 문자열 배열로 되돌리지 않는다 — `priorityChecks`는 항상 `{ id, title, description, targetCategory }` 구조를 유지한다.
- 담보 카드의 보조 배지를 `multiMatch?: boolean`/`subscriptionGenBadge?: string` 같은 단일 목적 optional 필드로 되돌리지 않는다 — 모든 배지는 `badges: CoverageBadge[]` 배열 하나로 표현한다.
- "입력하신 사고 내용"의 "추가 질문 답변" strip을 `answers`(`Record<string, string>`) 원본을 직접 순회해 구성하지 않는다 — 반드시 `collectAnsweredFacts(items)`(`items[].factChips` 파생) 결과만 렌더링한다.
- `components/result/*`에 케이스 전용 동적 문구(카테고리 설명·whyCheck·배지 등)를 리터럴로 하드코딩하지 않는다 — `DiagnosisResult` 데이터 또는 공용 상수 모듈에서만 가져온다.
- `sessionStorage` handoff를 읽자마자(또는 마운트 시) 자동으로 지우지 않는다 — 새 진단 시작/상담 신청 완료/사용자 초기화 3가지 명시적 트리거에서만 `clearDiagnosisHandoff()`를 호출한다.
- `DIAGNOSIS_ENGINE_READY`를 이 SPEC의 코드에서 `true`로 전환하지 않는다.
- `app/page.tsx`와 `app/result/page.tsx`에 게이트 계산 로직을 각각 따로 작성하지 않는다 — 반드시 `lib/diagnosis/flags.ts` 공유 헬퍼를 통한다.
- 기존 `e2e/diagnosis-flow-01.spec.ts`와 `scripts/visual-verify.ts`의 기존 10개 화면 정의를 수정하지 않는다 — 오직 추가만 한다.

## §H. Cross-References

- `.moai/specs/SPEC-B2C-RESULT-001/design.md` — 데이터 타입, 라우트/컴포넌트 경계, mock 판정 확장, 인계 채널 기술 결정 상세
- `.moai/specs/SPEC-B2C-RESULT-001/research.md` — 코드베이스·의존성 조사 근거
- `.moai/specs/SPEC-B2C-RESULT-001/acceptance.md` — Given-When-Then 수용 기준
- `.moai/specs/SPEC-B2C-DIAGNOSIS-001/` — 선행 SPEC(01 화면, 완료) — `mockJudge`/`app/page.tsx`/`diagnosis-flow.tsx` 확장 대상
- `design/MIGRATION-PLAN.md` §2 ②/④(화면 목록), §4(디자인 언어), §5(금액 표기 정책)
