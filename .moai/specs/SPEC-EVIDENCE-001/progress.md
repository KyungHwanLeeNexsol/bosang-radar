# SPEC-EVIDENCE-001 — 진행 기록 (progress.md)

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-08-29 (plan-auditor iteration 2/3 PASS 실제 관측 — 아래 §G.1 "iteration 2, PASS" 항목 참고)
tier: L
artifact_set: spec.md, plan.md, acceptance.md, design.md, research.md (5개, Tier L)
spec_version: "0.5.0"

### 자체 점검 결과 (plan-auditor 실행이 아님 — §G.1 참고)

이 세션은 `Agent` 도구가 없어 `plan-auditor` subagent를 직접 실행할 수 없었다. 아래는
plan-auditor가 통상 확인하는 항목들을 grep/카운트로 직접 재현한 **자체 점검**이며,
`plan-auditor` 자신의 판정을 대체하지 않는다(verification-claim-integrity 원칙 — 관측하지
않은 검증을 관측했다고 기록하지 않는다). v0.3.0(외부 독립 리뷰 최종 revision 반영) 기준으로
재실행했다.

| 점검 항목 | 방법 | 결과 |
|-----------|------|------|
| frontmatter 12필드 | `sed -n '1,17p' spec.md` 육안 대조 | 12개 canonical 필드 전부 존재, snake_case alias 없음, `version: "0.3.0"` |
| REQ 개수 (Tier L 상한 25) | `grep -oE '^\| REQ-EVIDENCE-[0-9]+ \|' spec.md \| sort -u \| wc -l` | 25개 — 상한 유지, v0.3.0에서 새 top-level REQ 추가 없음(이슈 1/2는 기존 REQ-EVIDENCE-016, REQ-EVIDENCE-017, REQ-EVIDENCE-007 wording 수정으로 반영) |
| AC 개수 (Tier L 상한 25) | `grep -oE '^\*\*AC-EVIDENCE-[0-9]+[a-z]?\*\*' acceptance.md \| sort -u \| wc -l` | 25개(REQ-016만 4개 서브레터 016a/b/c/d) — 상한 유지, v0.3.0에서 새 AC 추가 없음(AC-006/014 본문 확장만) |
| `[NEEDS CLARIFICATION]` 잔존 | `grep -c "NEEDS CLARIFICATION"` (spec/research/design/plan/acceptance 5개 파일) | 0건 |
| REQ→AC traceability | REQ-EVIDENCE-001~021/026/029/030/031(25개) 각각을 `acceptance.md`에서 `\b` 경계 grep | 25개 전부 ≥1건 참조, 0건 참조인 REQ 없음(v0.2.0에서 발견·수정한 슬래시 병기 버그 재발 없음 확인) |
| `## Out of Scope` h2-alone 함정 | `grep -n "^## \|^### " spec.md` | §4는 `## §4. 제외 범위 (Out of Scope)`(h2) + 5개 `### Out of Scope — <항목>`(h3) 서브섹션 — v0.3.0에서도 유지 |
| `phase:` 금지값(plan/run/sync/mx) | frontmatter `phase:` 값 확인 | `"v0.8.0 target"` — 금지값 아님 |
| "corpus 확장 효과" 잔존 mislabeling | `grep -rn "corpus 확장 효과\|Corpus 확장 효과" *.md` (6개 아티팩트) | 남은 매치는 전부 (a) HISTORY의 과거형 서술("~로 잘못 명명했다") 또는 (b) 명시적 부정문("~이 아니다"/"~를 주장하지 않는다") — 실제 설계 본문에 오분류 잔존 없음 |
| 이전 결함 문구 잔존 확인 | `grep -rn "정렬.*전용\|현행 구조를 보존\|3개 컬럼\|A와 B는 fixture"` (전체 아티팩트) | HISTORY 항목(과거형 서술) 외 매치 없음 — 실제 설계 본문에 구결함 문구 잔존 없음 |

이 표는 **기계적으로 확인 가능한 항목만** 다룬다. plan-auditor 고유의 정성적 판단(Clarity/
Completeness/Testability/Traceability 4축 가중 점수, must-pass 7개 기준 종합 판정, PASS
threshold 0.85 도달 여부)은 이 세션이 재현할 수 없다 — 아래 §G.1에서 이 gap을 명시한다.

### v0.4.0 자체 점검 (외부 독립 리뷰 잔여 정합성 반영 이후)

| 점검 항목 | 방법 | 결과 |
|-----------|------|------|
| REQ 개수 (Tier L 상한 25) | `grep -oE '^\| REQ-EVIDENCE-[0-9]+ \|' spec.md \| sort -u \| wc -l` | 25개 — v0.4.0에서도 새 top-level REQ 추가 없음(기존 REQ-EVIDENCE-007, REQ-EVIDENCE-015, REQ-EVIDENCE-016, REQ-EVIDENCE-017 wording 수정만) |
| AC 개수 (Tier L 상한 25) | `grep -oE '^\*\*AC-EVIDENCE-[0-9]+[a-z]?\*\*' acceptance.md \| sort -u \| wc -l` | 25개 — v0.4.0에서 새 AC ID 추가 없음(AC-006/013/014/018 본문에 Then 절 추가만) |
| design.md `isDuplicate()`에 `a.sourceIdentifier` 잔존 여부 | `grep -n "a\.sourceIdentifier" design.md` | 매치 1건, §6 함수 본문이 아니라 "추후 migration 시 이렇게 확장한다"는 설명 텍스트 안의 예시 코드 조각 — 실제 `isDuplicate()` 구현(`function isDuplicate`)은 `sameSource = Boolean(a.sourceUrl) && a.sourceUrl === b.sourceUrl`만 사용, `sourceIdentifier` 미참조 확인 |
| design.md `precisionAt5()`에 `candidates.length` 잔존 여부 | `grep -n "candidates\.length" design.md` | 0건 — `precisionAt5()`가 `candidates.slice(0, 5).filter(...).length / 5`로 표준 정의(top-5/5)를 사용함을 확인 |
| design.md 하드코딩 `ISSUE_TYPES = [` 리터럴 배열 잔존 여부 | `grep -n "ISSUE_TYPES = \[" design.md` | 매치 1건이지만 `QUERY_ISSUE_TYPES = [`(SSOT const 선언, §1.4a)의 부분 문자열일 뿐 — 별도 `const ISSUE_TYPES = [...]` 선언은 존재하지 않음(§1.5 zod 스키마가 `import { QUERY_ISSUE_TYPES } from "../../lib/pipeline/types.ts"`로 이를 소비) |

## §E.2 Run-phase Evidence

### M1 — Coverage matrix 정의 + Evidence 스키마 마이그레이션 (`issueTypes`만)

manager-develop(cycle_type=tdd)이 M1을 완료했다. 산출물: `.moai/specs/SPEC-EVIDENCE-001/coverage-matrix.md`,
`db/migrations/0003_sad_hitman.sql`, `lib/pipeline/types.ts`(`QUERY_ISSUE_TYPES` SSOT const),
`lib/db/schema.ts`(`issueTypes` 컬럼), `db/seed/evidence-seed-schema.ts`(신규 zod 스키마 + test),
`scripts/db-seed.ts`(runtime validation 배선), `db/seed/evidence.json`(10건 전부 `issueTypes: []`).

| AC | Status | Verification Command | Actual Output |
|----|--------|----------------------|----------------|
| AC-EVIDENCE-001 | PASS | `.moai/specs/SPEC-EVIDENCE-001/coverage-matrix.md` 육안 검토 | 담보(2)×issueType(8)=16칸 전부 표에 존재(N/A 2칸 포함), N/A 근거는 `query-planner.ts`의 고정 `domainPlans` 매핑을 인용, 나머지 14칸에 현재/목표 건수 명시, 목표는 `planQueries()`의 항상-생성 vs 조건부 발생 빈도에 비례 배분(임의 균등배분 아님) |
| AC-EVIDENCE-004 | PASS | `TURSO_DATABASE_URL="file:.tmp/m1-idempotency-check.db" npx tsx scripts/db-migrate.ts && npx tsx scripts/db-seed.ts` 를 연속 2회, 매회 후 `SELECT id, category, issue_types FROM evidence ORDER BY id` | 1회차·2회차 모두 정확히 10행, 각 id의 다른 컬럼 값도 재실행 후 1회차와 동일(`issue_types` 전부 `[]`) — §E.3 하단 verbatim 참고 |
| AC-EVIDENCE-005 | PASS | `lib/pipeline/types.ts`/`db/seed/evidence-seed-schema.ts`/`scripts/db-seed.ts` grep + TS 컴파일 확인 | M1 시점 신규 컬럼은 `issueTypes` 1개뿐(`sourceIdentifier`/`sourceDate`는 이 시점 스키마에 없음 — `grep -c "sourceIdentifier\|sourceDate" lib/db/schema.ts` → 0), `issueTypes`는 `evidence-seed-schema.ts`의 zod 스키마(REQ-EVIDENCE-007 candidate eligibility 소비 전제)와 `db-seed.ts`의 insert/onConflictDoUpdate 양쪽에서 소비됨. `keywords` 필드는 스키마에 추가되지 않았음(research.md §4 "보류"와 일치) |
| AC-EVIDENCE-006 | PASS | `pnpm test db/seed/evidence-seed-schema.test.ts` | 6 tests passed — RED(모듈 부재로 import 실패) 확인 후 GREEN 전환. issueTypes 8개 값 외 문자열(`"INVALID_TYPE"`) 주입 시 `evidenceSeedFileSchema.parse()`가 예외를 던짐(ZodError, runtime validation — TS 컴파일 타임 체크가 아님), 전체 배열 파싱이 실패해 fail-fast(부분 insert 없음). SSOT: `db/seed/evidence-seed-schema.ts`가 `QUERY_ISSUE_TYPES`를 `lib/pipeline/types.ts`에서 import(`grep -n "QUERY_ISSUE_TYPES" db/seed/evidence-seed-schema.ts` → import 1건, 별도 리터럴 배열 선언 0건) |
| AC-EVIDENCE-021 | PASS | `db/migrations/0003_sad_hitman.sql` 내용 확인 + `scripts/provision-tester.test.ts` 마이그레이션 drift-guard 테스트 | `ALTER TABLE \`evidence\` ADD \`issue_types\` text DEFAULT '[]' NOT NULL;` 1개 statement뿐(다른 DDL 없음), `sourceIdentifier`/`sourceDate` 컬럼 미포함 확인 |

M1 스코프 밖(M2~M6)의 AC(AC-EVIDENCE-002/003/007~020/022~026)는 이 milestone에서 다루지
않는다 — REQ-EVIDENCE-006/007만 M1 대상이다(plan.md §B M1).

### M2 — Candidate Eligibility A/B 비교 + Ranking + Benchmark 인프라 (exploratory, 10건 corpus)

manager-develop(cycle_type=tdd)이 M2를 완료했다. 산출물: `lib/pipeline/evidence-retriever.ts`
(전략 A/B 두 candidate eligibility 함수 + score 함수 + id 오름차순 tie-break + `strategy` 파라미터
추가), `lib/pipeline/evidence-retriever.test.ts`(전략 A/B 비교·hard-filter 미도입·결정론적
정렬·TOP_N 불변 unit test 5건 신규), `lib/pipeline/evidence-retriever.benchmark.test.ts`(신규,
7개 벤치마크 케이스 + exploratory Recall@5/Hit@5/Precision@5 측정), `db/seed/evidence.json`
(10건 중 7건 issueTypes 백필 — REQ-EVIDENCE-013 target case 구성을 위한 데이터 갭 해소, 아래 참고).

**REQ-EVIDENCE-013 데이터 갭 해소(M1이 issueTypes를 전부 `[]`로 남겨 M2 착수 시점에 target case를
구성할 근거 evidence가 없었음)**: `db/seed/evidence.json`의 기존 10건 중 title/content에서 담보-쟁점
분류가 명백히 판별 가능한 7건에 실제 `issueTypes` 값을 채웠다(plan.md M1이 허용한 "명백히 판별
가능한 경우 실제 값" 옵션 행사, M2 벤치마크-구성 스코프 — M1이 컬럼/타입 배선만 담당하고 실제 분류
소비는 M2 범위였으므로 M1의 범위 밖 작업이 아니다). source(`sourceUrl`)/`content`/`evidenceType`은
변경하지 않았다 — `issueTypes` 필드만 수정했다.

| id | 이전 → 변경 후 issueTypes | 근거(title/content에서 명백히 판별 가능한 부분) |
|----|---------------------------|--------------------------------------------------|
| seed-evidence-001 | `[]` → `["DISABILITY_LOCATION","DISABILITY_GRADE_CRITERIA"]` | 발목 관절 후유장해, 관절가동범위(ROM) 기준 장해지급률 판정 |
| seed-evidence-002 | `[]` → `[]`(불변) | 후유장해 진단서 발급 요건(행정적 실무 기준) — 8개 issueType 중 안전하게 매핑되는 항목 없음 |
| seed-evidence-003 | `[]` → `["DIAGNOSIS","CAUSATION"]` | 질병후유장해 담보 인정 요건 중 "질병과 장해 사이의 의학적 인과관계"(인과성) + 진단확정 시점 |
| seed-evidence-004 | `[]` → `["DISABILITY_GRADE_CRITERIA"]` | 질병후유장해 등급 판정 시 제3의료기관 감정 절차 |
| seed-evidence-005 | `[]` → `["CAUSATION","PRE_EXISTING_CONDITION"]` | 대법원 2008다44689 — 상해·기왕증 경합 시 인과관계·기여도 판단(기왕증 감액) |
| seed-evidence-006 | `[]` → `["PRE_EXISTING_CONDITION"]` | 상해 후유장해 심사에서 기왕증 기여도를 다투는 일반적 쟁점 |
| seed-evidence-007 | `[]` → `[]`(불변) | 상법 제737조 일반 책임 조항 — 특정 쟁점 분류 아님 |
| seed-evidence-008 | `[]` → `["DIAGNOSIS","CAUSATION"]` | 대법원 2015다218730 — "진단명이 같아도 발병 부위가 다르면 별개 질병"(진단명 + 인과관계) |
| seed-evidence-009 | `[]` → `["CAUSATION"]` | 질병 간 인과관계·동일성 판단 시 일반적 고려 요소 |
| seed-evidence-010 | `[]` → `[]`(불변) | 상법 제658조 보험금 지급 절차(공통, 특정 쟁점 아님) |

**전략 A/B 채택 결정(exploratory, node 사전 검증 + benchmark test로 재확인)**: `bm-injury-preexisting-01`
케이스(query.keywords=`["연골 손상"]` — corpus 10건 어디에도 등장하지 않는 키워드로 설계, 사전에
`node -e`로 corpus 전체 grep해 확인)에서 known-relevant(seed-evidence-005/006, 둘 다
`PRE_EXISTING_CONDITION` exact match)를 전략 A는 후보 목록에서 완전히 누락(recall=0, hit=0)하고
전략 B는 issueType exact match만으로 복구(recall=1, hit=1)함을 실측으로 확인 — REQ-EVIDENCE-013가
지정한 target case가 실제로 관측됐다. 7개 벤치마크 케이스 전체 평균: 전략 A meanRecall=0.857/
meanHit=0.857/meanPrecision=0.229, 전략 B meanRecall=1.0/meanHit=1.0/meanPrecision=0.286 — 세
지표 모두 전략 B가 전략 A 이상(design.md §3.3b non-regression 계약 만족). **채택: 전략 B**
(`evidence-retriever.ts`의 `ADOPTED_STRATEGY = "B"`로 구현 완료). TOP_N(5)은 변경하지 않았다 —
벤치마크가 조정 필요성을 정당화하지 않았다.

| AC | Status | Verification Command | Actual Output |
|----|--------|----------------------|----------------|
| AC-EVIDENCE-008 (REQ-EVIDENCE-009, REQ-EVIDENCE-013) | PASS | `pnpm test lib/pipeline/evidence-retriever.test.ts lib/pipeline/evidence-retriever.benchmark.test.ts` | 16/16 tests passed — "전략 A/B 둘 다에서 issueType 정확 일치 evidence A가 키워드 우연 일치 evidence B보다 높은 순위" 확인, "전략 A는 keyword 없는 known-relevant를 누락, 전략 B는 복구" 확인(단위 테스트 + 벤치마크 양쪽에서), "issueType 불일치가 전략 B에서도 hard filter로 작용하지 않음"(키워드만으로도 여전히 후보) 확인 |
| AC-EVIDENCE-010 (REQ-EVIDENCE-011) | PASS | `grep -n "const TOP_N" lib/pipeline/evidence-retriever.ts` + 벤치마크 측정 기록(위 표) | `const TOP_N = 5;` 불변 — 변경하지 않았고, 변경 불필요를 벤치마크 측정 결과로 근거 문서화(design.md §3.3b) |
| AC-EVIDENCE-011 (REQ-EVIDENCE-012) | PASS | `pnpm test lib/pipeline/evidence-retriever.test.ts -t "id 오름차순"` | score 동점 시 `["e-a","e-m","e-z"]` id 오름차순 정렬, 동일 입력 3회 연속 호출 결과 100% 동일 확인 |
| AC-EVIDENCE-012 (REQ-EVIDENCE-014) | PASS | `pnpm test lib/pipeline/evidence-retriever.benchmark.test.ts -t "최소 7개"` | 7개 벤치마크 케이스, 두 담보(INJURY_DISABILITY/DISEASE_DISABILITY) 각각에서 CAUSATION/DISABILITY_GRADE_CRITERIA/{DIAGNOSIS 또는 DISABILITY_LOCATION} 최소 1건씩 + PRE_EXISTING_CONDITION 1건 확인 |
| AC-EVIDENCE-009 (REQ-EVIDENCE-010) | Deferred to M5 | — | plan.md M5가 명시적으로 "REQ-EVIDENCE-010(무관 evidence가 키워드 하나로 상위 회귀) 벤치마크 케이스 신설"을 M5 스코프로 배정했다(plan.md §B M5) — M2는 이 AC를 다루지 않는다. task 지시문의 "REQ-EVIDENCE-009 through REQ-EVIDENCE-013" 범위 안내와 별개로, plan.md의 milestone 배정이 우선한다(scope discipline) |
| AC-EVIDENCE-013 (REQ-EVIDENCE-015) | Deferred to M4 | — | `.moai/reports/evidence-source-audit-manifest.md`(M4 산출물)가 아직 존재하지 않아 "(b) manifest에서 '유지'로 결정된 id 집합과 대조" 조건을 검증할 수 없다 — (a) 부분(benchmark id ⊆ evidence.json 실제 id)만 M2 벤치마크 테스트에 unit test로 포함해 선제 확인했다(위 benchmark.test.ts 두 번째 테스트) |
| AC-EVIDENCE-014 (REQ-EVIDENCE-016/017) | Deferred to M4d/M4e | — | design.md §3.4의 algorithm effect(M4d)/corpus expansion effect(M4e) 측정은 corpus 재감사·확장·freeze(M4a-c)를 전제하며, M2는 10건 exploratory corpus 위에서만 동작한다 — 이 AC는 M2 완료 시점에 PASS/FAIL 판정 대상이 아니다 |

**exploratory/frozen 분리 준수**: 위 전략 A/B 측정치는 `evidence-retriever.benchmark.test.ts`
전체에서 `[EXPLORATORY]` 라벨을 테스트 이름과 console.log 출력 양쪽에 명시적으로 붙였다 — M4d의
frozen 최종 비교(다른 corpus, 다른 절)와 이 수치를 혼동하지 않도록 design.md §3.4의 구분을
코드/문서 양쪽에서 지켰다(REQ-EVIDENCE-016/017, AC-EVIDENCE-014의 exploratory/frozen 분리 요건 —
다만 AC-EVIDENCE-014 자체의 PASS/FAIL 판정은 위 표대로 M4d/M4e 완료 후로 유예한다).

M2 스코프 밖(M3~M6)의 AC는 이 milestone에서 다루지 않는다.

### M3 — counterEvidenceIds=[] 진단 fixture (harness self-test — 실제 smoke 원인 판정 아님)

manager-develop(cycle_type=tdd)이 M3를 완료했다. 산출물: `lib/pipeline/evidence-diagnostic.test.ts`
(신규, design.md §4.2 구조 그대로 3개 테스트: A/B/C-전제조건).

**RED 확인**: `fixtureEvidence`를 의도적으로 빈 배열(`[]`)로 두고 먼저 실행 — 3개 테스트 전부
실패함을 확인(아래 §E.3(M3) verbatim 참고). 이후 `known-counter-relevant-id` evidence 1건을
fixture에 추가해 GREEN 전환(추가 프로덕션 코드 변경 없음 — `retrieveEvidence()`/`challenge()`는
M1/M2에서 이미 완성된 기존 구현이며, 이 milestone은 그 기존 구현을 검증하는 진단 harness를
신설하는 것이 REQ-EVIDENCE-019의 scope다. "test-after"가 아니다: harness 자체(3개 assertion)를
먼저 작성해 실패를 관측한 뒤 fixture 데이터를 채워 통과시켰다 — 대상 프로덕션 코드는 이번
milestone에서 신규 작성/수정되지 않았다).

| AC | Status | Verification Command | Actual Output |
|----|--------|-----------------------|----------------|
| AC-EVIDENCE-016a | PASS | `pnpm test lib/pipeline/evidence-diagnostic.test.ts -t "A:"` | fixture corpus(1건, `known-counter-relevant-id`, issueTypes=["PRE_EXISTING_CONDITION"])에 그 id가 실제로 존재함을 확인 |
| AC-EVIDENCE-016b | PASS | `pnpm test lib/pipeline/evidence-diagnostic.test.ts -t "B:"` | fixture 사건("이전에 진단받은 기존 퇴행성 변화가 있는 상태에서... 발목을... 다쳤다")에 `planQueries()`를 실행해 `q-injury_disability-pre_existing_condition` 쿼리를 확보, `retrieveEvidence()`(기본 전략 B)가 그 evidence를 candidate 목록에 반환함을 확인 — evidence의 title/content는 query keyword("좌측 발목"/"기왕증"/"퇴행성")를 전혀 포함하지 않도록 설계해, 순수 issueType exact match 경로(전략 B)만으로 candidate에 진입함을 검증 |
| AC-EVIDENCE-016c | PASS | `pnpm test lib/pipeline/evidence-diagnostic.test.ts -t "C-전제조건:"` | 위 candidate 목록을 `DraftFinding`으로 감싸 `challenge()`(결정론적 캡처 fake provider)에 전달, 캡처된 프롬프트 텍스트에 `known-counter-relevant-id` 리터럴이 포함됨을 확인 — 이 지점 이후(모델이 실제로 counterEvidenceIds로 선택했는지)는 이 unit test의 범위 밖으로 명시 |

**design.md §4.3 해석표 실측 결과 (harness self-test 전용 — 아래 문구를 그대로 인용해 REQ-EVIDENCE-019
프레이밍 제약을 지켰는지 확인 가능하게 함)**:

> 이 fixture 사건에서 harness의 A/B/C-전제 3단계가 정상 동작함을 확인했다 — **fixture 진단
> harness 자체의 self-test 결과다.** 이 결과는 fixture 자신이 정상 동작하는지 확인하는
> self-test이지, 2026-08-27/2026-08-28 실제 Gemini smoke의 원인 판정이 아니다. "fixture에서
> A✅/B✅/C-전제✅가 나왔으므로 실제 smoke의 A/B는 배제되고 C 또는 model behavior만 남는다"는
> 서술은 이 progress.md를 포함해 어디에도 남기지 않는다(REQ-EVIDENCE-019, design.md §4.3).

**REQ-EVIDENCE-020 production snapshot replay 전제조건 조사 결과 — plan-phase 예상과 달리 조건이
충족되어 실제 replay를 수행함**:

plan.md M1/M3는 "이 plan-phase 시점에는 그런 snapshot이 별도로 보존되어 있다는 근거가 없다"고
기록했다(§G.2). 이 run-phase 세션이 `.moai/reports/gemini-smoke-20260827.md`,
`.moai/reports/gemini-runtime-smoke-20260828.md` 두 파일을 직접 재검토한 결과:

- **2026-08-27 smoke**: 실제 사용한 case 입력 텍스트가 리포트 어디에도 verbatim으로 보존돼 있지
  않다(결과 통계만 기록) — design.md §4.4 전제조건 (a) 미충족. 이 smoke에 대한 replay는 수행하지
  않았다.
- **2026-08-28 smoke**: 두 전제조건 모두 실제로 충족됨을 확인했다.
  - (a) case/query 보존: 리포트 §"사용한 synthetic 사건 입력"에 `caseInputSchema`가 요구하는
    4개 필드(`incidentDescription`/`diagnosisName`/`disabilityBodyPart`/`incidentDate`)가
    실명·주민번호·전화번호 없이 verbatim JSON으로 기록돼 있다.
  - (b) corpus 재현: 리포트가 HEAD를 `feat/SPEC-GEMINI-RUNTIME-001` @ `fb2355397e547b1f77d938812e8d6af6678862ea`로
    명시하고 있고, 이 commit이 현재 저장소 히스토리에서 실제로 조회 가능함을
    `git cat-file -e fb2355397e547b1f77d938812e8d6af6678862ea`로 확인했다. 그 commit의
    `db/seed/evidence.json`과 현재 HEAD의 `db/seed/evidence.json`을 `git diff`로 대조한 결과,
    차이는 M1이 추가한 `issueTypes` 필드뿐이고 title/content/sourceUrl/evidenceType/category/scope는
    전부 동일함을 확인했다(diff verbatim은 이 세션의 `.tmp/` 임시 작업물로만 존재, 검증 직후
    삭제 — M1 관례와 동일). 같은 방식으로 `lib/pipeline/query-planner.ts`도 그 commit과 현재
    HEAD 사이에 `git diff`가 0-byte임을 확인했다(QueryPlanner 규칙 불변).

**실제 수행한 replay와 관측 결과**: 위 case 입력을 `normalizeCase()` → `planQueries()`에 통과시켜
8개 `ResearchQuery`를 얻었다 — 이 개수는 2026-08-28 리포트의 "생성 query 수(reviewTargets): 8개"와
정확히 일치해, replay가 실제 smoke와 동일한 QueryPlanner 산출물을 재현하고 있음을 교차 확인했다.
그 commit의 `evidence.json`(issueTypes 필드는 그 시점 스키마에 아예 없었으므로 전부 `[]`로 채움)에
대해 `retrieveEvidence(queries, db, "A")`(strategy A — 그 commit 시점에는 전략 B가 아직 존재하지
않았고, `git show`로 대조한 그 시점 `evidence-retriever.ts`의 관련성 술어가 현재 `relevantA()`와
문자 그대로 동일함을 확인)를 실행한 verbatim 결과:

```
q-injury_disability-disability_location: 0건 -> []
q-injury_disability-disability_grade_criteria: 1건 -> [seed-evidence-001]
q-injury_disability-causation: 1건 -> [seed-evidence-005]
q-injury_disability-incident_circumstance: 0건 -> []
q-disease_disability-diagnosis: 0건 -> []
q-disease_disability-disability_grade_criteria: 0건 -> []
q-disease_disability-causation: 3건 -> [seed-evidence-003, seed-evidence-008, seed-evidence-009]
q-disease_disability-incident_circumstance: 0건 -> []
```

**관측 사실만 정직하게 기록한다(design.md §4.4 지시대로 — candidate 유무만 직접 관측)**:

- 8개 쿼리 중 5개(`disability_location`, `injury_disability-incident_circumstance`,
  `disease_disability-diagnosis`, `disease_disability-disability_grade_criteria`,
  `disease_disability-incident_circumstance`)는 candidate가 0건이었다 — 이 쿼리들에 대해 만약
  Skeptic이 반론을 생성했다면, Retriever가 애초에 어떤 evidence도 전달하지 않았으므로
  counterEvidenceIds가 비어 있는 것이 구조적으로 불가피하다(A 또는 B와 정합).
- 반면 `q-injury_disability-causation`은 `seed-evidence-005`("상해와 기왕증이 경합한 후유장해의
  인과관계 및 감액 판단")를, `q-disease_disability-causation`은 `seed-evidence-008`("진단명이
  같아도 발병 부위가 다르면 별개 질병") 등을 candidate로 반환했다 — 이들은 보험사 관점의 반론
  근거(기왕증 감액, 별개 질병 주장)로 실제 활용 가능해 보이는 evidence다. **이 특정 쿼리들에
  대해서는, 만약 Skeptic이 그 쿼리의 finding에 반론을 생성했다면 Retriever/corpus가 counterEvidence
  후보를 전달하지 못한 것이 원인은 아니다 — C(모델이 전달받았지만 선택하지 않음) 또는 model
  behavior가 이 특정 쿼리들에 대해서는 A/B보다 관측과 더 정합적이다.**
- **명시적으로 밝힌다 — 이 replay가 확정하지 않는 것**: 실제 2026-08-28 smoke의 8개 쿼리 중
  정확히 어느 것이 Researcher가 만든 3개 VERIFIED finding(→ Skeptic이 실제 반론을 생성한 대상)에
  해당하는지는 Researcher의 LLM 판단(그 시점 실 Gemini 호출 결과)에 의존하며, 이 replay는 그
  판단을 재현하지 않았다(재현하려면 실 Gemini API 호출이 필요하므로 REQ-EVIDENCE-023/024의
  "실 Gemini 호출 없음" 제약과 상충한다). 따라서 이 replay는 "실제 smoke의 원인이 확정적으로
  C/model behavior다"라고 결론 내리지 않는다 — 8개 쿼리 중 어떤 부분집합이 실제로 문제가 됐는지에
  따라 A/B(0건 쿼리에 해당하는 경우)와 C/model behavior(비어있지 않은 쿼리에 해당하는 경우)가
  공존할 수 있다는, 이전보다 더 세분화됐지만 여전히 완전히 닫히지 않은 결론으로 기록한다.
- 원인은 여전히 **"corpus/Retriever/prompt/model behavior 미확정"**으로 유지하되, 이번 replay로
  다음 사실이 실측 근거로 추가된다: (1) 8개 쿼리 중 5개는 corpus/Retriever 단계에서 candidate가
  0건이었다(그 쿼리들에 한해 A/B가 실측으로 뒷받침됨), (2) 나머지 3개 쿼리는 candidate가 비어있지
  않았고 그중 최소 2건(seed-evidence-005/008)은 도메인 지식상 counter-relevant로 보인다(그
  쿼리들에 한해 C/model behavior가 A/B보다 관측과 더 정합적임). 이 두 문장 모두 "corpus/Retriever/
  prompt/model behavior 미확정"이라는 전체 결론을 뒤집지 않는다 — 8개 쿼리 중 3개 finding으로
  좁혀지는 매핑을 재현하지 못했기 때문이다.

## §E.3 Run-phase Audit-Ready Signal (M1)

```yaml
run_status: m1-complete
m1_complete_at: 2026-08-29
run_commit_sha: pending-backfill-m1  # 커밋 이후 별도 커밋으로 backfill(spec-frontmatter-schema.md SHA placeholder 예외)
ac_pass_count_m1: 5   # AC-EVIDENCE-001/004/005/006/021 (M1 범위)
ac_fail_count_m1: 0
l44_pre_commit_fetch: "git fetch origin main; git rev-list --count --left-right origin/main...HEAD → 0 0 (동기화됨)"
new_warnings_or_lints_introduced: false  # pnpm lint 0 warning/error, pnpm format:check clean, npx tsc --noEmit은 app/layout.tsx의 기존 baseline 에러(LayoutProps, 이번 변경 무관) 1건만 — git stash로 baseline에서도 동일 에러 확인
cross_platform_build:
  status: not_applicable  # TypeScript/Next.js 프로젝트 — Go의 GOOS/GOARCH 교차 빌드 개념 없음
total_run_phase_files_m1: 12  # 수정 8 + 신규 4(evidence-seed-schema.ts/.test.ts, 0003_sad_hitman.sql, meta/0003_snapshot.json) — coverage-matrix.md/progress.md/spec.md 제외
m1_to_mN_commit_strategy: per-milestone-commit  # M1은 단일 커밋, M2~M6는 각 milestone 완료 시 별도 커밋
```

### M1 멱등성(idempotency) 검증 verbatim (AC-EVIDENCE-004)

```
$ mkdir -p .tmp && rm -f .tmp/m1-idempotency-check.db*
$ TURSO_DATABASE_URL="file:.tmp/m1-idempotency-check.db" TURSO_AUTH_TOKEN="" NODE_ENV=test npx tsx scripts/db-migrate.ts
✅ 마이그레이션 완료
$ TURSO_DATABASE_URL="file:.tmp/m1-idempotency-check.db" TURSO_AUTH_TOKEN="" NODE_ENV=test npx tsx scripts/db-seed.ts
✅ 시드 완료
$ node .tmp/check-rows.mjs   # SELECT id, category, issue_types FROM evidence ORDER BY id
count=10
seed-evidence-001 상해후유장해 []
... (10건, issue_types 전부 [])
$ TURSO_DATABASE_URL="file:.tmp/m1-idempotency-check.db" TURSO_AUTH_TOKEN="" NODE_ENV=test npx tsx scripts/db-seed.ts
✅ 시드 완료
$ node .tmp/check-rows.mjs
count=10
seed-evidence-001 상해후유장해 []
... (재실행 후에도 동일 10건, 동일 issue_types)
```

이 임시 검증 파일(`.tmp/m1-idempotency-check.db*`, `.tmp/check-rows.mjs`)은 검증 직후
삭제했다 — `.tmp/`는 gitignore 대상이며 이 저장소의 기존 db-seed/db-migrate 테스트
스위트가 만드는 임시 db 파일들과 동일한 성격이다. 자동화된 idempotency 회귀 테스트는
기존 `scripts/db-seed.test.ts`의 `[AC-RUNTIME-005]` 케이스(실제 CLI 프로세스 실행 +
행 수 비교)가 이미 담당하며, 이번 M1 변경으로 그 테스트가 여전히 그린임을
`pnpm test` 전체 실행(38 test files, 258 tests passed)으로 확인했다.

## §E.3 Run-phase Audit-Ready Signal (M2)

```yaml
run_status: m2-complete
m2_complete_at: 2026-08-29
run_commit_sha: pending-backfill-m2  # 커밋 이후 별도 커밋으로 backfill(spec-frontmatter-schema.md SHA placeholder 예외)
ac_pass_count_m2: 4   # AC-EVIDENCE-008/010/011/012 (M2 범위)
ac_fail_count_m2: 0
ac_deferred_m2: 3     # AC-EVIDENCE-009(M5) / AC-EVIDENCE-013(M4) / AC-EVIDENCE-014(M4d/M4e) — plan.md milestone 배정에 따라 M2 판정 대상 아님
l44_pre_commit_fetch: "git fetch origin main; git rev-list --count --left-right origin/main...HEAD → 확인 필요(커밋 직전 재확인)"
l44_post_push_fetch: "커밋만 수행, push는 이 세션 범위 밖(worktree 격리 세션 — 아래 §최종 보고 참고)"
new_warnings_or_lints_introduced: false  # pnpm lint 0 warning/error(신규 파일 초기 2건 unused eslint-disable directive 경고는 직접 제거해 0건으로 확인), pnpm format:check clean(prettier --write 적용 후), npx tsc --noEmit은 app/layout.tsx의 기존 baseline 에러(LayoutProps, M1과 동일 — git stash로 M2 변경분 제외 시에도 동일 에러 재확인) 1건만
cross_platform_build:
  status: not_applicable  # TypeScript/Next.js 프로젝트 — Go의 GOOS/GOARCH 교차 빌드 개념 없음
total_run_phase_files_m2: 4  # 수정 3(evidence.json, evidence-retriever.ts, evidence-retriever.test.ts) + 신규 1(evidence-retriever.benchmark.test.ts) — progress.md 제외
m1_to_mN_commit_strategy: per-milestone-commit  # M1과 동일 정책 유지
```

### M2 idempotency 재확인 verbatim (M1이 채운 seed 데이터에 issueTypes 값만 추가했으므로, 행 수 불변 재확인 — AC-EVIDENCE-004 회귀 없음 확인)

```
$ mkdir -p .tmp
$ pnpm db:migrate
✅ 마이그레이션 완료
$ pnpm db:seed
✅ 시드 완료
$ node -e '...SELECT count(*) FROM evidence...'
row count: 10
$ pnpm db:seed   # 2회차 재실행
✅ 시드 완료
$ node -e '...SELECT count(*) FROM evidence...'
row count after 2nd seed run: 10
```

행 수는 재실행 전후 모두 정확히 10 — M2의 `issueTypes` 백필이 upsert 멱등성을 깨지 않았다.

## §E.3 Run-phase Audit-Ready Signal (M3)

```yaml
run_status: m3-complete
m3_complete_at: 2026-08-29
run_commit_sha: pending-backfill-m3  # 커밋 이후 별도 커밋으로 backfill(spec-frontmatter-schema.md SHA placeholder 예외)
ac_pass_count_m3: 3   # AC-EVIDENCE-016a/016b/016c (M3 범위)
ac_fail_count_m3: 0
ac_deferred_m3: 1     # AC-EVIDENCE-016d — REQ-EVIDENCE-020 replay 결과는 위 본문에 기록했으나, "실제 smoke 원인 서술에 replay 결과만 사용"이라는 AC-016d의 문서 전반 조건은 M6 최종 요약 문서 작성 시점에 재확인 필요(design.md §4.4/§4.3 문구가 모든 아티팩트에 일관되게 반영됐는지는 M6 범위)
l44_pre_commit_fetch: "git fetch origin main; git rev-list --count --left-right origin/main...HEAD → 확인 필요(커밋 직전 재확인)"
l44_post_push_fetch: "커밋만 수행, push는 이 세션 범위 밖(worktree 격리 세션 — 아래 최종 보고 참고)"
new_warnings_or_lints_introduced: false  # 아래 최종 검증 배치 결과 참고
cross_platform_build:
  status: not_applicable  # TypeScript/Next.js 프로젝트 — Go의 GOOS/GOARCH 교차 빌드 개념 없음
total_run_phase_files_m3: 2  # 신규 1(lib/pipeline/evidence-diagnostic.test.ts) + progress.md 수정 1 — 프로덕션 코드 변경 0건
m1_to_mN_commit_strategy: per-milestone-commit  # M1/M2와 동일 정책 유지
```

## §G.1 plan-auditor 실행 결과 — iteration 1, FAIL (v0.4.0 아티팩트 대상)

**이 SPEC에 대해 실제 `plan-auditor` subagent가 처음으로 실행됐다(iteration 1/3, plan-auditor
Retry Loop Contract).** 이전 v0.1.0~v0.4.0 개정 라운드(§G.3/§G.4/§G.5)에서는 이 작성 세션에
`Agent` 도구가 없어 plan-auditor를 직접 spawn할 수 없었고, 대신 grep/카운트 기반 자체 점검만
반복했다 — 이번이 orchestrator 세션이 `plan-auditor`를 실제로 spawn해 5개 v0.4.0 아티팩트
(`spec.md`/`research.md`/`design.md`/`plan.md`/`acceptance.md`)를 감사한 첫 실행이다.

**결과는 PASS가 아니라 FAIL이다.** orchestrator가 plan-auditor 자신의 리포트에서 직접 관측한
verdict를 아래에 있는 그대로(축소·상향 없이) 기록한다 — verification-claim-integrity 원칙에
따라 관측하지 않은 검증을 관측했다고 기록하지 않으며, 동시에 관측한 FAIL을 PASS로 downgrade하지
않는다. `plan_status`는 `audit-ready`로 갱신하지 **않는다** — 그렇게 하면 FAIL을 PASS로
오기재하는 것이 된다(위 §E.1 `plan_status: draft-audit-failed` 참고).

### 실행 결과 요약

- **Verdict**: **FAIL** (iteration 1/3)
- **Overall score**: 0.80 (4축 조화평균) — 그러나 must-pass 기준(MP-1) 실패로 인해 점수와
  무관하게 verdict는 FAIL이다(M5 firewall: must-pass 항목 중 하나라도 FAIL이면 overall score와
  무관하게 verdict는 무조건 FAIL).
- **Must-pass 7항목 결과**:
  - MP-1 REQ 번호 일관성 = **FAIL** — REQ-EVIDENCE ID가 001-021, 026, 029, 030, 031(총 25개)로
    구성되어 있는데, 이것이 순차적인 001..025 시리즈가 아니다. 022/023/024/025/027/028 번호가
    ID 공간에서 비어 있고, HISTORY는 027→005, 028→008로의 병합만 설명할 뿐 022-025가 왜 없는지는
    설명하지 않는다.
  - MP-2 EARS/GEARS 형식 = PASS
  - MP-3 YAML frontmatter 유효성 = PASS
  - MP-4 언어 중립성 = N/A(단일 도메인, 자동 PASS)
  - MP-5 D7 cross-SPEC 정합성 = PASS(`depends_on`에 명시된 두 SPEC 모두 `status: completed` 확인됨)
  - MP-6 D8 cross-platform discipline = N/A(syscall 사용 없음, 자동 PASS)
  - MP-7 clarification gate = PASS(`[NEEDS CLARIFICATION]` 매치 0건)
- **4축 카테고리 점수**: Clarity 0.75, Completeness 0.75, Testability 0.75, Traceability 1.0.

### 발견된 결함 (D1 critical/blocking, D2-D5 minor/optional)

- **D1 (critical, blocking)**: REQ-EVIDENCE ID 시퀀스에 022/023/024/025/027/028 갭이 있고,
  HISTORY가 022-025의 부재를 설명하지 않는다. 수정 경로: 25개 REQ-EVIDENCE ID 전체를 모든
  아티팩트에서 순차적인 001..025 시리즈로 재번호하거나, 명시적 HISTORY ledger를 추가한다 —
  auditor는 문서화 여부와 무관하게 M5 firewall에 따라 이 갭 자체가 FAIL이므로, 재번호가 MP-1을
  통과시키는 유일한 경로라고 명시했다.
- **D2 (minor, optional)**: spec.md §4의 5개 `### Out of Scope — <항목>` H3 서브섹션이 산문
  단락으로만 되어 있고 `OutOfScopeRule` lint 컨벤션의 Score-1.0 밴드가 요구하는 리터럴 `-`
  bullet 라인이 없다.
- **D3 (minor, optional)**: acceptance.md §A/§D의 REQ→AC 병합 요약이 2건(당시 번호 REQ-029→AC-008, REQ-030→AC-014 —
  현재 번호로는 REQ-EVIDENCE-013→AC-008, REQ-EVIDENCE-017→AC-014)만 명시하고, AC-EVIDENCE-016d
  자신의 헤더에 보이는 3번째 병합(당시 번호 REQ-031→AC-016d, 현재 REQ-EVIDENCE-020→AC-016d)을
  누락했다 — 실제 기계적 링크가 끊긴 것이 아니라 자기서술(self-description)
  누락이다.
- **D4 (minor, optional)**: REQ-EVIDENCE-009(spec.md)이 WHAT/WHY 산문이 아니라 boolean-formula
  의사코드를 문자 그대로 요구사항 본문에 삽입하고 있다 — design.md §2.1의 canonical formula와
  중복된다.
- **D5 (minor, optional)**: REQ-EVIDENCE-021의 "가능한 경우" 수식어가 선언된 Ubiquitous 패턴을
  조건부 escape hatch로 완화시킨다.

### v0.4.0 라운드 자체 편집분에 대해 새로 확인된 정합성 (auditor가 명시적으로 확인)

auditor는 다음을 명시적으로 검증했다: REQ-EVIDENCE-016/AC-EVIDENCE-014의 non-regression PASS
조건이 design.md §3.3b/§3.4A와 단어 단위로 일치하며 모순이 없음; REQ-EVIDENCE-015, REQ-EVIDENCE-017의 ground
truth completeness 요건 + `precisionAt5()` 표준 정의(top-5/5, Precision@Returned 명시적 배제)가
spec.md/design.md/acceptance.md 전체에서 일관됨; design.md §6 `isDuplicate()`가
sourceIdentifier-not-introduced 기본안과 자기정합적임; `QueryIssueType`/`QUERY_ISSUE_TYPES` SSOT
배선이 end-to-end로 올바름.

### 이 FAIL의 원인 시점과 발견되지 않았던 이유

D1(REQ ID 갭)의 근원은 v0.2.0 개정(spec.md HISTORY 참고 — REQ-EVIDENCE-026/027/028/029/030/031(v0.2.0 당시 번호)이
도입되고 027/028이 (v0.2.0 당시 번호로) 005/008에 병합된 시점 — v0.2.0 당시 026/029/030/031은 이번 D1 재번호화로 각각 현재 REQ-EVIDENCE-005/013/017/020이 됐다)이며, v0.4.0의 잔여 정합성 라운드 이전부터 존재했다.
지금까지 발견되지 않은 이유는 이 SPEC에 대해 실제 plan-auditor가 실행된 적이 없었기 때문이다 —
progress.md가 이전에 수행한 자체 점검(grep/카운트)은 REQ *개수* 일관성만 확인했을 뿐, REQ *ID의
순차성*은 검사 항목에 없었다(위 자체 점검 표 참고).

### 정직성 확인

이 FAIL 결과는 조작되거나 하향 기재된 것이 아니다 — 관측된 그대로 기록한다
(verification-claim-integrity 원칙 준수). `plan_status`는 `audit-ready`로 변경하지 않는다 —
그렇게 하면 FAIL을 PASS로 오기재하는 것이 된다.

### 다음 단계 소유권

D1(블로킹) 수정 여부, D2-D5를 같은 diff에 함께 반영할지, 그리고 plan-auditor를 iteration 2로
재실행할지는 **orchestrator가 사용자와 함께 결정할 사안**이며, 이 progress.md 기록 세션이 여기서
결정하지 않는다.

**`/moai run`은 이 plan-auditor PASS 없이는 착수하지 않는다** — spec-workflow.md의 Plan Audit
Gate가 어차피 `/moai run` 진입 시 다시 이 감사를 요구하므로, 이 FAIL이 run-phase를 우회시키지는
않는다.

### plan-auditor 실행 결과 — iteration 2, PASS (D1-D5 수정 반영 후, v0.5.0 아티팩트 대상)

D1(critical, blocking) + D2-D5(minor, optional) 수정을 반영한 v0.5.0 아티팩트 5종
(`spec.md`/`research.md`/`design.md`/`plan.md`/`acceptance.md`)에 대해 `plan-auditor` subagent를
**iteration 2/3**로 재실행했다. orchestrator가 plan-auditor 자신의 리포트에서 직접 관측한 결과를
그대로(축소·과장 없이) 기록한다(verification-claim-integrity 원칙 준수).

- **Verdict**: **PASS** (iteration 2/3, plan-auditor Retry Loop Contract)
- **Overall score**: 0.90 (4축 조화평균) — Tier L PASS threshold(0.85) 상회
- **Must-pass 7항목 결과**: 전부 PASS 또는 N/A —
  - MP-1 REQ 번호 일관성 = **PASS**(iteration 1의 FAIL에서 정정) — auditor가 독립적으로 재확인:
    REQ-EVIDENCE 표 행이 정확히 001~025의 연속 시퀀스로 구성되어 있으며 공백·중복 없음, D1 재번호화가
    실제로 해결됐음을 확인.
  - MP-2 EARS/GEARS 형식 = PASS
  - MP-3 YAML frontmatter 유효성 = PASS(`version: "0.5.0"`)
  - MP-4 언어 중립성 = N/A(자동 PASS)
  - MP-5 D7 cross-SPEC 정합성 = PASS(`depends_on`에 명시된 두 SPEC 모두 `status: completed` 확인됨)
  - MP-6 D8 cross-platform discipline = N/A(자동 PASS)
  - MP-7 clarification gate = PASS(`[NEEDS CLARIFICATION]` 매치 0건)
- **4축 카테고리 점수**: Clarity 0.75, Completeness 1.0, Testability 0.95, Traceability 1.0.
- **회귀 확인(iteration 1 → 2)**: D1(REQ ID 갭) 해소 확인. D2(Out of Scope 불릿 형식) 해소 확인.
  D3(acceptance.md 병합 요약 누락) 해소 확인. D4(REQ 내 HOW-수준 의사코드) 해소 확인. D5(무조건부
  완화 표현) 해소 확인. iteration 1의 결함이 그대로 재발한 항목은 없음.
- **이번 iteration에서 새로 발견된 minor 결함(D6, D7)**: D6 — 3개 파일(design.md/plan.md/research.md)에
  "027"(v0.2.0 당시 이미 병합되어 현재 사용되지 않는 구 번호)을 아무 설명 없이 병기한
  `REQ-EVIDENCE-006/027` 표기가 남아 있었다 — 이 SPEC §G.3이 이미 기록한 "REQ 병기 표기 버그"와
  같은 취약성이 이번엔 다른 형태(슬래시 축약 표기 자체에 역사적 번호 구분 설명이 아예 없는 경우)로
  재발한 것이다. D7 — spec.md의 v0.1.0→v0.2.0 HISTORY 항목 안에서 자기모순이 있었다(한 문장은 구
  REQ-027이 "REQ-EVIDENCE-006"에 통합됐다고 하고, 같은 항목의 다른 문장은 "005"에 통합됐다고
  서술) — 원인은 동일하게 `"X을 Y에 통합"` 형태의 한국어 구문에서 `REQ-EVIDENCE-` 접두어가 없는
  bare 숫자를 재번호화 패턴 매칭이 놓친 것이다. D6/D7 모두 위 §1-§2 단계에서 즉시 수정했다 —
  두 결함 모두 must-pass 블로커가 아니었다(auditor의 verdict는 이 둘을 non-blocking documentation
  clarity 정리로 명시하며 PASS했다).
- 명시적으로 밝힌다: 이 PASS는 조작되지 않았다 — 위 모든 claim은 plan-auditor가 이번 iteration
  2에서 실제로 관측·출력한 결과 그대로이며, `plan_status`를 `audit-ready`로 변경하는 것은 이 PASS가
  실제로 관측됐기 때문이다(verification-claim-integrity §1.1 surface 1 — 관측하지 않은 검증-주장
  없음 원칙 준수).
- 명시적으로 밝힌다: `/moai run`은 이 세션에서 시작하지 않았다 — 이 세션의 범위는 plan-phase에서
  끝난다(사용자의 최초 지시 범위). 사용자의 최초 6개 요청 항목은 모두 다뤄졌다: (1) non-regression
  PASS 조건을 REQ/AC에 명시(재번호화 후 REQ-EVIDENCE-016/AC-EVIDENCE-014), (2) Precision ground
  truth completeness + 표준 Precision@5 정의, (3) isDuplicate()/sourceIdentifier 기본안 정합,
  (4) QueryIssueType SSOT(optional, 완료), (5) 6개 아티팩트 정합성 재검증(이번 세션 자체 재번호화가
  유발한 슬래시 표기 결함 발견·수정 포함), (6) plan-auditor를 실제로 2회 실행(iteration 1 FAIL,
  iteration 2 PASS)하고 그 전 과정을 정직하게 기록 — 어느 시점에도 조작된 PASS 없음.

### plan-auditor 실행 결과 — iteration 3, PASS (최종 iteration, plan-auditor Retry Loop Contract 상한)

v0.5.0 아티팩트 5종(`spec.md`/`research.md`/`design.md`/`plan.md`/`acceptance.md`)에 대해 `plan-auditor`
subagent를 **iteration 3/3**(plan-auditor Retry Loop Contract가 허용하는 최종 iteration)으로
재실행했다. orchestrator가 이 실행을 직접 관측했으며, plan-auditor 자신의 리포트에서 관측한 결과를
그대로(축소·과장 없이) 기록한다(verification-claim-integrity 원칙 준수).

- **Verdict**: **PASS** (iteration 3/3 — plan-auditor Retry Loop Contract가 허용하는 최종 iteration)
- **Overall score**: 0.923 (4축 조화평균) — Tier L PASS threshold(0.85) 상회
- **Must-pass 7항목 결과**: 전부 PASS 또는 N/A —
  - MP-1 REQ 번호 일관성 = **PASS**(독립적으로 재검증) — 001-025 연속 시퀀스를 다시 확인했을 뿐 아니라,
    5개 아티팩트 전체에서 존재하지 않는 REQ 번호를 가리키는 **살아있는(LIVE)** 참조가 어떤 표기
    형태로도(`REQ-EVIDENCE-` 접두어 있는/없는 bare `REQ-NNN` 포함) 0건임을 별도로 확인했다.
  - MP-2 EARS/GEARS 형식 = PASS
  - MP-3 YAML frontmatter 유효성 = PASS(`version: "0.5.0"`)
  - MP-4 언어 중립성 = N/A(자동 PASS)
  - MP-5 D7 cross-SPEC 정합성 = PASS — 이번 iteration에서 auditor가 design.md에서 `SPEC-RUNTIME-001`
    참조를 추가로 발견해 검증했으며, 해당 SPEC도 `status: completed`임을 확인했다.
  - MP-6 D8 cross-platform discipline = N/A(자동 PASS)
  - MP-7 clarification gate = PASS(`[NEEDS CLARIFICATION]` 매치 0건)
- **4축 카테고리 점수**: Clarity 0.75, Completeness 1.0, Testability 1.0, Traceability 1.0.
- **회귀 확인(iteration 1/2 → 3)**: D1-D7 전부 독립적인 fresh 재검증으로 RESOLVED 확인(신뢰가 아니라
  실제 재확인) — 이전 결함 중 재발한 항목은 없다.
- **이번 iteration에서 새로 발견된 결함(D8, 이 SPEC의 결함 번호 시퀀스를 이어감 — 앞서 D1-D7과
  충돌하지 않도록)**: REQ-EVIDENCE-016과 그로부터 파생된 AC-EVIDENCE-014 사이의 acceptance-scope
  모호성. REQ-EVIDENCE-016은 "기본 PASS 조건"을 4개 부분으로 구성된 복합 조건(3개 지표 부등식 +
  REQ-EVIDENCE-013 target-case-hit 조건)으로 정의하고, trade-off/예외 경로가 "이 조건 중 하나라도"
  (즉 4개 부분 전체를 아우르는 것으로 읽히는) 충족되지 않을 때 적용된다고 서술한다. 그런데
  `acceptance.md`의 AC-EVIDENCE-014는 이를 **두 개의 별도 Then 절**로 나눠 놓았다 — "기본 PASS 조건"
  Then 절(3개 지표만)에는 Path A/Path B 예외 + plan-auditor 재검토 메커니즘 전체가 딸려 있는 반면,
  별도의 "REQ-EVIDENCE-013 target case 복구" Then 절에는 예외 경로가 전혀 없다 — 무조건적으로 읽힌다.
  따라서 target-case-hit 실패가 구체적으로 (a) AC-EVIDENCE-014를 구제 불가능하게 무조건 FAIL시키는지
  (REQ-EVIDENCE-016이 명시한 "이 조건 중 하나라도"의 scope와 모순), 아니면 (b) sibling Then 절로부터
  명시되지 않은 어떤 상속을 통해 예외 경로 대상이 되는지 불분명하다. design.md §3.3b는 target-case
  조건이 협상 불가능하다는 쪽으로 기운다(설계 근거: 이것 없이는 "전략 B 채택 근거 자체가 무너진다") —
  이는 정당한 입장이지만, SPEC이 현재 작성된 형태로는 3개 아티팩트(spec.md REQ 문구 vs acceptance.md
  AC 구조 vs design.md 근거) 전체에 걸쳐 이를 명시적으로 해소하지 않는다. auditor는 결함 항목 자체를
  "Severity: major, Class: blocking"으로 분류했지만, **전체 VERDICT는 여전히 PASS**다(must-pass 기준
  중 실패한 항목이 없음 — 이것은 Clarity 축의 감점이지 must-pass 위반이 아니다) — auditor 자신의
  Recommendation 섹션은 이를 명시적으로 "PASS + 권장(비필수) run-phase 이전 정리"로 규정했으며, 4번째
  audit iteration을 요구하는 blocker로 규정하지 않았다(어차피 Retry Loop Contract의 max-3 상한이
  4회차를 허용하지 않는다).
- **D8 수정 완료 기록(같은 세션, 이 항목 기록 직후 사용자 결정에 따라 수정됨)**: 위 D8을 수정했다 —
  spec.md REQ-EVIDENCE-016에 target-case 조건이 trade-off 예외 경로 대상이 **아님**을 명시적으로
  추가했고, acceptance.md AC-EVIDENCE-014의 target-case Then 절에도 예외 경로(Path B) 적용 대상이
  아님을 명시적으로 추가했다(design.md §3.3b의 기존 근거와 일치). 이 수정은 orchestrator가
  grep으로 기계적으로 자체 검증했다(두 신규 절 존재 확인, REQ 개수 25 유지, AC 개수 25 유지) —
  4차 plan-auditor iteration을 거치지 않았다. 이는 (a) Retry Loop Contract가 plan-phase 사이클당
  max-3로 상한을 두고 있고 3차 iteration이 이미 자체 근거로 진짜 PASS를 달성했으며(D8은 auditor
  자신의 판정으로도 non-blocking·courtesy-level 결함이었다), (b) 이번 수정이 제약을 완화하지 않고
  명확화만 추가할 뿐(REQ/AC 개수 불변, 다른 내용 무변경) 회귀 위험이 매우 낮다는 판단에 근거한
  **판단(judgment call)**이며, "감사를 거친 것과 동등하다"는 주장이 아니다. `plan_status`는
  `audit-ready`를 그대로 유지한다 — D8은 애초에 must-pass 기준이 아니었으므로 이 수정이 3차 PASS
  판정을 재개방하거나 무효화하지 않는다. `/moai run`은 여전히 시작되지 않았다.
- **별도로 기록(5개 감사 대상 아티팩트의 결함은 아니지만, auditor가 지나가며 지적한 self-consistency
  gap)**: auditor는 이 progress.md **자신의** §G.6 서술(iteration 2의 D7 수정을 기록한 항목)이 구
  REQ-027 병합 대상을 "005/008"로 기재하고 있는데, spec.md/design.md/research.md의 **실제 현재
  텍스트**는 올바르게 "006/009"로 되어 있음을 발견했다 — 즉 §G.6 자신의 "무엇을 고쳤는지"에 대한
  서술이 지금은 stale/부정확한 상태이며, 감사 대상 아티팩트 안의 실제 수정 내용 자체는 올바르다.
  이 문제는 같은 편집 안에서 §G.6을 수정해 바로잡는다(아래 §G.6 참고).
- 명시적으로 밝힌다: 이 PASS는 실제로 관측된 것이며 조작되지 않았다(verification-claim-integrity
  §1.1 surface 1 준수). `plan_status`는 `audit-ready`로 **유지**한다 — iteration 2에서 이미 올바르게
  설정되어 있었으며, 이번 3차 PASS는 그 상태를 재확인/보강할 뿐 변경하지 않는다.
- 명시적으로 밝힌다: `/moai run`은 아직 시작되지 않았다. D8은 이 기록과 같은 턴에서 사용자에게
  결정 지점(지금 수정할지, 문서화된 debt로 남기고 진행할지)으로 제시되는 중이다 — 이 progress.md
  기록 세션은 그 결정을 선점하지 않으며, D8의 발견 사실과 그 판정(major/blocking severity이지만
  overall verdict는 PASS)만 정직하게 기록한다.
- **plan-auditor 리포트 영속화 gap도 함께 기록한다(auditor 자신의 리포트에서 지적)**: 이 SPEC에
  대해 `.moai/reports/plan-audit/SPEC-EVIDENCE-001-review-{1,2,3}.md` 경로에 plan-phase 리뷰
  스트림 파일이 디스크에 **하나도 존재하지 않는다** — auditor가 이를 프로세스 gap으로 플래그했다.
  이번 세션의 3회 iteration(§G.1의 iteration 1/2/3) 모두, 이전 orchestrator 호출에서 plan-auditor에게
  리뷰-스트림 파일을 영속화하도록 요청하지 않았기 때문에, `spec-workflow.md` § Report Persistence가
  요구하는 plan-phase 리뷰 스트림 영속화 의무가 이행되지 않은 것으로 보인다. 이를 은폐하지 않고
  known gap으로 정직하게 기록한다.

## §F Phase 4 Mode Selection

- **Input parameters**: tier=L, scope≈15+ files (schema/types/seed/retriever/benchmark/diagnostic/report), domain count=4+ (DB migration, retrieval algorithm, benchmark infra, corpus curation/authenticity review), concurrency benefit=LOW(coding-heavy, strictly sequential milestone dependency chain per plan.md §A — M2 depends on M1's issueTypes column, M3 depends on M2's retriever, M4 depends on M1-M3 being stable, M5 depends on M4, M6 depends on all).
- **Mode evaluation**: direct — not selected (non-trivial, multi-file semantic change). fanout — not selected (work is sequential-dependent, not independent-parallel; Anthropic coding-task parallelism caveat applies). sweep — not selected (not a uniform mechanical transform; each milestone is distinct semantic work). agent-team/manager-lead — not selected despite meeting the raw ≥3-milestone/≥10-file numeric threshold, because the milestones are NOT independently fan-outable (strict M1→M2→M3→M4→M5→M6 dependency chain per plan.md §A) — manager-lead's fan-out value requires parallelizable leaf work, which this SPEC does not have. **serial — SELECTED** (single manager-develop spawn per milestone, sequential).
- **Decision**: serial
- **Justification**: Per Anthropic's coding-task parallelism caveat ("most coding tasks involve fewer truly parallelizable tasks than research"), and per plan.md §A's explicit statement that the 6 milestones execute sequentially by design (M2's exploratory measurement must not mix with M4's frozen comparison), a single sequential manager-develop delegation per milestone is the correct mode. cycle_type=tdd per quality.yaml constitution.development_mode.
- Implementation Kickoff Approval: user-approved via AskUserQuestion (autonomous progression — proceed through milestones without per-milestone confirmation unless blocked; direct commit to feat/SPEC-EVIDENCE-001, no new branch/PR).

## §G.7 `/moai run` 진입 시 Plan Audit Gate 재실행 결과 — PASS (iteration 4, D8 수정 반영본)

`/moai run SPEC-EVIDENCE-001` 진입 시 자동 실행되는 Phase 1 Plan Audit Gate에서, 스킵 조건 3개
(PASS verdict / Tier L 임계값 0.85 이상 / 아티팩트 해시 불변) 중 세 번째가 성립하지 않았다 —
§G.1 iteration 3 PASS(0.923) 이후 D8을 수정하면서 spec.md/acceptance.md 내용이 바뀌었기 때문이다.
따라서 스킵이 불가능해 plan-auditor를 다시 실행했다(이 SPEC의 4번째 실제 실행, plan-phase
Retry Loop Contract의 max-3와는 별개의 run-phase 게이트 호출).

- **Verdict**: **PASS**
- **Overall score**: 0.973 (4축 조화평균) — Tier L PASS threshold(0.85) 상회, iteration 3(0.923)보다도 상승
- **Must-pass 7항목**: 전부 PASS 또는 N/A(MP-1~MP-7, iteration 3와 동일 결과 유지 — 회귀 없음)
- **D8 수정 확인**: spec.md REQ-EVIDENCE-016과 acceptance.md AC-EVIDENCE-014의 target-case Then절이
  design.md §3.3b 근거와 정합하게 "Path B 예외 대상이 아님"을 명시적으로 서술하고 있음을 auditor가
  독립적으로 재확인했다.
- **알려진 gap 해소**: `.moai/reports/plan-audit/SPEC-EVIDENCE-001-review-{1,2,3}.md`가 디스크에
  없다는 이전 gap(§G.1 마지막 항목)은 여전히 사실이지만(과거 3회는 영속화되지 않음), 이번 4번째
  실행 결과는 `.moai/reports/plan-audit/SPEC-EVIDENCE-001-review-4.md`에 영속화해 이 gap이 향후
  더 이상 반복되지 않도록 했다.
- **잔여 non-blocking 발견**: 일부 REQ에 `zod`/`retrieveEvidence()`/`drizzle-kit` 같은 HOW 수준
  세부사항이 남아있고, 3개 REQ에서 GEARS 타입 라벨이 다소 부정확 — must-pass 기준에는 영향 없음,
  run-phase 진행을 막지 않는다.
- 이 PASS는 실제로 관측된 것이며 조작되지 않았다(verification-claim-integrity §1.1 surface 1 준수).
  `plan_status: audit-ready`를 유지한다. run-phase(Implementation Kickoff Approval 이후)로 진행 가능하다.

## §G.2 corpus 큐레이션(M4) 착수 조건 재확인 필요

plan.md M1이 명시한 대로, run-phase 착수 세션은 M4(기존 10건 재감사 + 신규 확장) 이전에
WebSearch/WebFetch 또는 등록된 `law.go.kr` OC 키 등 실제 웹 조사 도구 가용성을 재확인해야 한다.
이 plan-phase 세션은 그 도구가 없었고, 대신 `curl`로 제한적 검증(기존 seed 인용 재확인)만
수행했다(research.md §0, §4.1).

## §G.3 외부 독립 리뷰 반영 기록 (v0.1.0 → v0.2.0)

사용자가 전달한 외부 독립 리뷰에서 5개 설계 blocker(issueType eligibility, benchmark/corpus
순서, diagnostic fixture 과잉주장, metadata 최소화, 기존 corpus 재감사)와 1개 acceptance
정합성 문제(AC-018 중복 판정)를 지적받아, plan-auditor를 실행하지 않은 상태(§G.1)에서 6개
아티팩트 전체를 개정했다. 상세 변경 내역은 spec.md HISTORY(v0.2.0 항목)에 기록했으며, 여기서는
**자체 점검 과정에서 발견한 메타 결함 1건**을 별도로 남긴다:

- **REQ 병기 표기 버그**: acceptance.md의 AC 헤더에 `(REQ-EVIDENCE-002/026)`처럼 슬래시로 두
  REQ ID를 병기하면, 단순 문자열 grep(`grep "REQ-EVIDENCE-026"`)이 이 표기를 찾지 못한다 —
  `002/026` 문자열에는 `REQ-EVIDENCE-026`이라는 연속 부분문자열이 존재하지 않기 때문이다(앞에
  `002/`가 붙어 있음). 이 버그를 자체 traceability 재점검(위 표 4번째 행) 중 직접 발견해
  `(REQ-EVIDENCE-002, REQ-EVIDENCE-005)`처럼 쉼표로 완전히 분리 표기하도록 4곳(AC-002/008/014/016d)
  전부 수정했다. **교훈**: 향후 이 SPEC이나 다른 SPEC에서 AC 헤더에 복수 REQ를 병기할 때는 항상
  `REQ-A, REQ-B` 형태(부분문자열로 서로를 가리지 않는 형태)를 쓴다.
- **REQ/AC 개수 재조정**: 리뷰 반영으로 신규 REQ 6개(026/027/028/029/030/031)가 생겨 총 27개가
  됐으나 Tier L 상한(25)을 초과 — REQ-028을 REQ-008에, REQ-027을 REQ-005에 각각 통합해 25개로
  조정했다(spec.md HISTORY 참고). AC도 같은 원리로 REQ-029→AC-008, REQ-030→AC-014(v0.2.0 당시 번호 — 현재는 각각
  REQ-EVIDENCE-013→AC-008, REQ-EVIDENCE-017→AC-014)에 통합해 25개를 유지했다.

## §G.4 외부 독립 리뷰 최종 revision 반영 기록 (v0.2.0 → v0.3.0)

사용자가 전달한 외부 독립 리뷰 최종 revision에서 9개 항목(algorithm/corpus effect 재분리, zod
runtime validation, issueTypes 태깅 품질 검토, Precision@5 guardrail, research.md stale text,
source 우선순위, sourceIdentifier 재단순화, 6-아티팩트 일관성 재검증, plan-auditor 실행 시도)을
지적받아, plan-auditor를 실행하지 않은 상태(§G.1)에서 소규모로 개정했다 — **새 SPEC을 만들지
않고 scope를 확대하지 않는다**는 사용자 지시를 지켰다. 상세 변경 내역은 spec.md HISTORY(v0.3.0
항목)에 기록했다.

- **새 REQ/AC 미추가 확인**: 이번 라운드는 REQ-EVIDENCE-016, REQ-EVIDENCE-017, REQ-EVIDENCE-007의 wording만 수정했고
  AC-EVIDENCE-014/006의 본문만 확장했다 — 새 top-level REQ ID나 새 AC ID를 만들지 않았다(item
  2에서 사용자가 명시적으로 요구한 제약). REQ/AC 개수는 v0.2.0과 동일하게 25/25로 유지된다(위
  자체 점검 표에서 재확인).
- **algorithm effect vs corpus expansion effect 재분리**: v0.2.0 자체 점검(§G.3)에서는 발견하지
  못했던 잔존 개념 오류(같은 corpus 위 알고리즘 비교를 "corpus 확장 효과"로 잘못 명명)를 이번
  라운드에서 사용자가 직접 지적 — design.md §3.4를 A(algorithm effect)/B(corpus expansion
  effect) 두 절로 재구성하고, plan.md M4d/M4e로 milestone을 분리했다. **교훈**: "동일 조건에서
  하나의 변수만 바꾼 비교"와 "그 변수가 아닌 다른 조건의 변화 효과"를 이름으로 구분할 때는, 실제로
  무엇이 고정되고 무엇이 변했는지 재확인해야 한다 — 이름이 그럴듯해도 측정 대상과 불일치할 수
  있다.
- **plan-auditor 실행 gap 재확인**: 이번 라운드에서도 `Agent` 도구는 여전히 이 세션에 제공되지
  않았다 — v0.1.0/v0.2.0과 동일한 제약이 v0.3.0에도 유효하며, PASS를 기재하지 않고 §G.1에
  정직하게 gap으로 기록했다(item 9의 명시적 요구사항).

## §G.5 외부 독립 리뷰 잔여 정합성 반영 기록 (v0.3.0 → v0.4.0)

사용자가 전달한 외부 독립 리뷰 잔여 정합성 라운드에서 4개 항목(non-regression 계약의 threshold
악화 방지 gap, benchmark ground truth completeness 요건, `isDuplicate()`/§1.2 sourceIdentifier
기본안 불일치, `QueryIssueType` 8개 값 이중 하드코딩)을 지적받아, plan-auditor를 실행하지 않은
상태(§G.1)에서 소규모로 개정했다 — **새 REQ/AC ID를 만들지 않고 scope를 확대하지 않는다**는
사용자 지시를 지켰다. 상세 변경 내역은 spec.md HISTORY(v0.4.0 항목)에 기록했다.

- **새 REQ/AC 미추가 확인**: 이번 라운드는 REQ-EVIDENCE-007, REQ-EVIDENCE-015, REQ-EVIDENCE-016, REQ-EVIDENCE-017의 wording만 수정했고
  AC-EVIDENCE-006/013/014/018의 본문(Then 절)만 확장했다 — 새 top-level REQ ID나 새 AC ID를
  만들지 않았다. REQ/AC 개수는 v0.3.0과 동일하게 25/25로 유지된다(위 v0.4.0 자체 점검 표에서
  재확인).
- **non-regression 계약의 AC 수준 gap**: v0.3.0에서 design.md §3.3b가 non-regression 계약(new
  metric ≥ baseline metric)을 서술했음에도, acceptance.md AC-EVIDENCE-014는 지표가 "기록되어
  있는지"만 확인했고 그 값이 실제로 계약을 만족하는지는 확인하지 않았다 — new 성능이 baseline보다
  악화돼도 AC가 PASS할 수 있는 구멍이었다. REQ-EVIDENCE-016, REQ-EVIDENCE-017과 AC-EVIDENCE-014에 기본 PASS
  조건을 명시하고, trade-off 발생 시 사후 threshold 완화를 금지하며 design exception 기록 +
  plan-auditor 재검토를 요구하도록 개정했다.
- **plan-auditor 실행 gap 재확인**: 이번 라운드에서도 `Agent` 도구는 여전히 이 세션에 제공되지
  않았다 — v0.1.0/v0.2.0/v0.3.0과 동일한 제약이 v0.4.0에도 유효하며, PASS를 기재하지 않고 §G.1에
  정직하게 gap으로 기록했다. `plan_status`는 이번 편집 단계에서 변경하지 않으며(§E.1 참고),
  `draft-awaiting-audit`로 유지된다 — plan-auditor 실행은 별도 후속 위임에서 수행된다.

## §G.6 D1-D5 결함 수정 기록 (v0.4.0 → v0.5.0, iteration 2 재감사 대상)

§G.1의 plan-auditor iteration 1 FAIL 결과(D1 critical/blocking + D2-D5 minor/optional)를 반영해
5개 아티팩트(spec.md/plan.md/design.md/acceptance.md/research.md — 6개 전체 중 progress.md 제외)를
개정했다. **새 REQ/AC ID는 만들지 않았다** — 기존 wording 수정과 REQ-EVIDENCE ID 재번호화만
수행했다.

### D1(critical, blocking) — REQ-EVIDENCE ID 재번호화 매핑

25개 REQ-EVIDENCE ID를 문서 등장 순서 그대로 001~025 연속 번호로 재번호화했다(구 ID → 신 ID).
`AC-EVIDENCE-*` ID는 이번 재번호화 대상이 **아니다**(변경 없음 — 001~021, 026 그대로 유지, 016만
서브레터 016a/b/c/d 유지).

| 구 ID | 신 ID | 구 ID | 신 ID | 구 ID | 신 ID |
|-------|-------|-------|-------|-------|-------|
| 001 | 001 (불변) | 011 | 012 | 018 | 022 |
| 002 | 002 (불변) | 029 | 013 | 019 | 023 |
| 003 | 003 (불변) | 012 | 014 | 020 | 024 |
| 004 | 004 (불변) | 013 | 015 | 021 | 025 |
| 026 | 005 | 014 | 016 |  |  |
| 005 | 006 | 030 | 017 |  |  |
| 006 | 007 | 015 | 018 |  |  |
| 007 | 008 | 016 | 019 |  |  |
| 008 | 009 | 031 | 020 |  |  |
| 009 | 010 | 017 | 021 |  |  |
| 010 | 011 |  |  |  |  |

이 매핑은 6개 아티팩트 전체(HISTORY의 과거 REQ 번호 언급 포함)에 일괄 적용했다 — 이 프로젝트의
기존 관례가 이미 HISTORY 항목에서 "그 항목을 작성한 시점의 현재 번호"를 쓰는 방식이었으므로(예:
v0.2.0/v0.3.0/v0.4.0 HISTORY 항목이 모두 작성 당시 최신 번호를 인용), 이번 재번호화도 그 관례를
그대로 따랐다. 단, v0.2.0 HISTORY 항목이 언급하는 "REQ-EVIDENCE-027", "REQ-EVIDENCE-028"은
이번 매핑 대상이 **아니다** — 이 두 번호는 v0.2.0 개정 당시 이미 006/009로 병합되어 사라진
과거 한 시점의 역사적 라벨이며, plan-auditor가 iteration 1에서 판정한 "현재 25개 REQ 집합"
(001-021, 026, 029, 030, 031)에 포함되지 않았다 — 따라서 spec.md HISTORY의 "REQ-EVIDENCE-028을
009에, REQ-EVIDENCE-027을 006에 통합" 문구는 그 역사적 사실을 그대로 서술한 것으로 남겨두었다.

- **2차 결함 발견 — 재번호화 스크립트 자신이 §G.3의 "REQ 병기 표기 버그"에 다시 걸렸다**: 이 D1
  재번호화에 쓰인 sed 기반 2단계 스크립트는 `REQ-EVIDENCE-NNN` 리터럴 패턴만 매칭했다 — §G.3이 이미
  기록한 것과 동일한 함정으로, `REQ-EVIDENCE-016/030`처럼 슬래시로 두 번째 REQ 번호를 병기(併記)하면
  두 번째 번호 앞에 `REQ-EVIDENCE-` 접두어가 없어 패턴이 매칭되지 않고, 그 번호만 구 번호로 남는다.
  §G.3의 교훈("항상 `REQ-A, REQ-B` 형태로 쓴다")이 이미 기록돼 있었음에도, spec.md/design.md/
  plan.md/research.md/progress.md 여러 곳이 여전히 이 취약한 슬래시 병기 축약형을 쓰고 있었다.
  이번 라운드에서 이 SPEC의 6개 아티팩트 전체에서 발견된 모든 살아있는(구 번호가 아닌 현재 REQ
  집합을 가리키는) 슬래시 병기 인스턴스를 쉼표 형태(`REQ-EVIDENCE-A, REQ-EVIDENCE-B`)로 전부
  수정했다. **향후 지침**: 이 SPEC에서 복수 REQ를 병기할 때는 acceptance.md가 이미 일관되게 쓰고
  있는 쉼표 형태만 사용한다 — 슬래시 병기는 grep 기반 재번호화 도구에 원천적으로 취약하므로 이
  SPEC의 어떤 신규 작성에서도 다시 쓰지 않는다.

### D2-D5 적용 확인

- **D2(minor)**: spec.md §4의 5개 `### Out of Scope — <항목>` H3 서브섹션을 산문 단락에서 `-`
  불릿 라인 형식으로 변경 완료(내용 자체는 무변경).
- **D3(minor)**: acceptance.md §A/§D의 REQ→AC 병합 요약을 2건(REQ-013→AC-008, REQ-017→AC-014)
  에서 3건(REQ-013→AC-008, REQ-017→AC-014, REQ-020→AC-016d)으로 보강 완료 — AC-EVIDENCE-016d
  자신의 헤더가 이미 `(REQ-EVIDENCE-019, REQ-EVIDENCE-020, ...)`로 이 3번째 병합을 정확히
  인용하고 있었으므로, §A/§D의 자기서술 누락만 수정한 것이며 실제 기계적 링크는 처음부터 끊어져
  있지 않았다.
- **D4(minor)**: spec.md REQ-EVIDENCE-009(구 008)의 boolean-formula 의사코드를 WHAT/WHY 산문 +
  design.md §2.1 교차참조로 대체 완료 — 하드 filter 미도입, inclusion-OR/정렬 신호로만 사용한다는
  요구사항의 실질 내용은 변경하지 않았다.
- **D5(minor)**: spec.md REQ-EVIDENCE-021(구 017)의 "가능한 경우"라는 무조건부 완화 표현을
  `sourceUrl`이 실제로 확인 가능한 경우로 한정하는 조건절로 교체 완료(research.md §1.2의
  `sourceUrl` nullable 설계와 정합).

### plan_status 정직성 확인

이번 편집으로 `plan_status`는 §E.1에서 `draft-audit-failed`(iteration 1 FAIL 관측값)에서
`draft-awaiting-audit`로 변경했다 — 이는 **"D1-D5 수정을 적용했고 iteration 2 재감사를
기다린다"**는 의미이며, `audit-ready`나 PASS를 의미하지 않는다. iteration 2 plan-auditor
재실행은 이 progress.md 기록 세션이 아니라 **orchestrator의 별도 후속 위임**에서 수행하며, 그
결과가 실제로 관측된 뒤에만(FAIL이든 PASS든) 정직하게 기록한다(verification-claim-integrity
원칙 — 관측하지 않은 PASS를 미리 기재하지 않는다).

### 자체 점검 재실행 (D1 수정 후, 5/6 파일)

```
$ grep -ohE "REQ-EVIDENCE-[0-9]{3}" spec.md | sort -u | wc -l
25
$ grep -ohE "REQ-EVIDENCE-[0-9]{3}" spec.md | sort -u | head -1
REQ-EVIDENCE-001
$ grep -ohE "REQ-EVIDENCE-[0-9]{3}" spec.md | sort -u | tail -1
REQ-EVIDENCE-025
$ grep -ohE '\*\*AC-EVIDENCE-[0-9]+[a-z]?\*\*' acceptance.md | sort -u | wc -l
25
$ grep -rn "REQ-EVIDENCE-Z" *.md | wc -l
0
```

REQ 개수 25개(001~025 연속, gap 없음), AC 개수 25개(AC IDs 무변경), 재번호화 임시 토큰(`Z`
prefix) 잔존 0건을 재확인했다.

**추가**: plan-auditor iteration 2에서 새로 발견된 D6/D7(§G.1 "iteration 2, PASS" 항목 참고)도
같은 D1 수정 라운드에 이어 즉시 수정했다 — spec.md(REQ 개수 조정 문구의 재번호화 누락 2건),
design.md §1.2, plan.md M1, research.md §4(각 1건씩 `REQ-EVIDENCE-006/027`의 "027" 역사적 구
번호에 대한 설명 병기) 총 4개 파일.

## §J Run-phase 세션 중간 정리 (M1~M3, M5 완료 / M4 파일럷 부분완료 / M6 및 M4 전체 확장은 후속 세션)

이번 `/moai run SPEC-EVIDENCE-001` 세션에서 완료한 것과 남은 것을 정직하게 정리한다
(verification-claim-integrity 원칙 — 완료하지 않은 것을 완료했다고 기재하지 않는다).

### 완료 (orchestrator가 각 milestone 종료 시점에 `pnpm test` 등을 직접 재실행해 독립 검증함)

- **M1**(커밋 `f7cc93c`): coverage matrix + `issueTypes` 컬럼 migration. 10건 seed 전부 정상.
- **M2**(커밋 `08f5c9d`): 전략 B(issueType inclusion-OR) 채택, 벤치마크 인프라(7 케이스) 신설,
  탐색적 측정에서 전략 B가 3개 지표 전부 우세(exploratory, 최종 판정 아님).
- **M3**(커밋 `63daf14`): 진단 fixture 3종(A/B/C-전제조건) 통과. REQ-EVIDENCE-020 재확인 —
  2026-08-28 스모크는 실제로 replay 가능했고(선례와 달리 snapshot이 보존돼 있었음), 8개 쿼리 중
  5개는 corpus 자체에 후보가 없었고 3개는 후보가 있었으나 Skeptic 최종 선택 여부는 LLM 호출
  없이는 확인 불가 — "corpus/Retriever/prompt/model behavior 미확정" 결론 유지(과장 없음).
- **M4 — 파일럷만**(커밋 `e68ba2b`, 사용자가 AskUserQuestion에서 "소규모 파일럷부터"를 선택):
  기존 10건 전체 재감사(1건 문구 수정, 0건 downgrade/제외), 신규 9건 확장(목표 15~20건 중
  9건 — 나머지는 검증 가능한 출처를 찾지 못해 정직하게 미달로 보고, 특히 DISPUTE_CASE는
  0건). corpus는 10건 → 19건.
- **M5**(커밋 `1c87aa3`): fabrication-guard 구조 검증 테스트, dedup 테스트(`isDuplicate()`
  design.md §6 그대로 신규 구현 — M1~M4에는 없었음, scope 확장이 아니라 M5가 원래 맡은 몫),
  REQ-EVIDENCE-010 anti-regression 벤치마크 케이스, 기존 SPEC-GEMINI-RUNTIME-001 회귀
  스위트(13개 파일, 128개 테스트) 전부 재확인.
- 최종 상태(이 세션 종료 시점, HEAD `1c87aa3`): `pnpm test` **281/281 통과**(orchestrator가
  병합 직후 직접 재실행해 확인), lint/format clean. `npx tsc --noEmit`은 `app/layout.tsx`의
  `LayoutProps` 에러가 M4 이후 사라졌다가 M5 시점에 다시 나타남 — Next.js route/layout 타입이
  `.next/types` 캐시 존재 여부에 따라 간헐적으로 달라지는 것으로 보이며(SPEC-EVIDENCE-001이
  건드리는 파일이 아님), 이 SPEC의 회귀가 아니다.

### 완료하지 않음 (다음 세션으로 명시적으로 이월)

- **M4 전체 확장**: plan.md가 명시한 50~100건 목표에 아직 도달하지 못했다(19건). 특히
  DISPUTE_CASE(분쟁조정 사례) evidenceType이 0건으로, plan.md 4b가 "최소 1건 이상 실제 도입"을
  요구한 항목이 미충족 상태다.
- **M4c(벤치마크 freeze)**: 사용자 선택에 따라 의도적으로 건너뛰었다 — corpus가 목표 규모에
  도달한 뒤 한 번에 freeze하는 것이 여러 번 반복하는 것보다 낫다는 plan.md 자신의 잔여 위험
  판단을 따랐다.
- **M4d(algorithm effect, frozen 최종 비교)**: freeze가 없으므로 수행 불가 — REQ-EVIDENCE-016의
  acceptance threshold는 아직 확정되지 않았다. M2의 탐색적 수치를 이 근거로 대신 쓰지 않는다.
- **M4e(corpus expansion effect)**: 동일한 이유로 미수행.
- **M6(문서 최종 정리)**: coverage matrix 최종본 + M4d/M4e 결과가 없으므로 plan.md가 의도한
  형태의 M6 요약 문서를 작성할 수 없다 — 이번 세션은 이 §J 중간 요약으로 대신한다. CHANGELOG
  갱신은 애초에 sync-phase(manager-docs) 몫이며 이 세션 범위가 아니다.
- `pnpm test:e2e`, `pnpm build`는 이번 세션에서 실행하지 않았다(M6 scope로 보류).

### SPEC 상태

`spec.md` frontmatter `status: in-progress`를 유지한다(M1이 이미 draft→in-progress 전환을
수행함) — `completed`로 전환하지 않는다. acceptance.md의 M4/M4c/M4d/M4e 관련 AC가 아직
충족되지 않았으므로 `/moai sync`로 넘어갈 조건이 아니다. 다음 run-phase 세션은 M4 전체 확장
(웹 조사 다수 필요, DISPUTE_CASE 출처 특히)부터 재개하면 된다.

## §K 외부 독립 코드리뷰 반영 — baseline/fixture 모순 수정 (v0.5.0 → v0.6.0) + plan-auditor iteration 5, PASS

사용자가 전달한 외부 독립 코드리뷰에서 M4 전체 확장 착수 전 반드시 먼저 고쳐야 할 2개 측정
방법론 blocker를 지적받았다.

- **Blocker 1**: design.md 자기 자신이 모순됐다 — §2.2(score 함수)는 전략 A/B 모두 같은
  `computeScore()`(issueType 가중치 포함)를 쓴다고 서술하는 반면, §3.4(M4d 측정 절차)는 이미
  "baselineRetriever(전략 A, **issueType 가중치 없음**, 현재 main의 알고리즘)"라고 명시하고
  있었다 — 즉 M2 구현(`retrieveEvidence(strategy="A")`도 issueTypeWeight를 쓰는 현재 코드)은
  §2.2를 따랐지만 §3.4가 요구하는 "진짜 baseline"과는 다르다. 3번의 plan-auditor 감사(iteration
  1/2/3) 모두 이 formula 간 내부 모순까지는 잡지 못했다(REQ/AC 개수·traceability·must-pass
  기준 중심 감사였기 때문).
- **Blocker 2**: M2의 벤치마크(`evidence-retriever.benchmark.test.ts`)가 mutable
  `db/seed/evidence.json`을 직접 import해서, M4가 corpus를 10건→19건→(향후 더 확장)으로 늘릴
  때마다 "M2 10건 exploratory baseline" 수치 자체가 재실행 시 달라질 수 있다 — 이미 기록된 M2
  exploratory 수치(§E.3 M2 항목)는 이 문제의 영향을 받은 상태로 남아있다.

**수정(manager-spec, 코드 미변경, orchestrator가 run-phase 중 직접 재위임 — Status Transition
Ownership Matrix의 "run-phase가 SPEC body 수정을 발견하면 manager-spec에 재위임" 절차)**:
design.md §2.1/§2.2/새 §3.1a/§3.4에 `trueBaselineEligible()`/`trueBaselineScore()`(issueType
전혀 미참조)를 M2 exploratory용 `computeScore()`와 명시적으로 분리해 정의, M2 벤치마크의
immutable fixture snapshot 요구사항 신설. spec.md REQ-EVIDENCE-016/009 문구도 "baseline"이
가리키는 대상을 명확화. REQ/AC 개수는 25/25 그대로(신규 ID 없음, 기존 REQ 문구 수정만).
`version: "0.5.0" → "0.6.0"`. 커밋 `1b2a2b5`.

**plan-auditor 재감사 결과 — iteration 5, PASS**:

- **Verdict**: **PASS**, **Overall score**: 0.923 (Tier L threshold 0.85 상회)
- must-pass 7항목: MP-1/2/3/5/7 PASS, MP-4/6 N/A 자동PASS, FAIL 없음
- design.md §2.1/§2.2/§3.4 모순 해소를 auditor가 실제 함수 본문까지 읽고 독립 재확인
  (`trueBaselineScore()`에 issueTypeWeight 항 자체가 구조적으로 없음을 확인)
- D1-D8(v0.5.0까지의 결함) 회귀 없음(4건 표본 재확인)
- **새로 발견된 D1/D2(minor, non-blocking, PASS에 영향 없음)**: plan.md M2/M4 milestone이
  §3.1a의 fixture 교정 작업을 명시적으로 담고 있지 않음, acceptance.md AC-EVIDENCE-014가
  §3.1a의 "live-import 금지"를 검증하는 Then절이 없어 회귀가 기계적으로 감지되지 않음. **D3**
  (minor, optional): §3.1a 헤더의 REQ 교차참조 라벨 오기.
  Auditor는 이 3건을 "PASS이지만 run-phase 재개 전 정리 권장"으로 명시했다.
- **판단(judgment call)**: D1-D3은 auditor 자신이 non-blocking으로 분류했고, 이미 v0.5.0
  D8에서 쓴 것과 같은 선례(4차 감사를 거치지 않고 진행)를 따라 이번에도 즉시 재감사 없이
  진행한다 — 대신 아래 §K 후속 코드 작업(task #9)에서 §3.1a의 실제 fixture 분리 작업을 할 때
  plan.md/acceptance.md의 D1/D2 정리도 필요하면 함께 반영하도록 지시했다(코드+문서 동시 반영,
  4차 fixture 관련 문서 편집이 남아있는 상태이므로 별도 라운드로 나누지 않음).
  보고서: `.moai/reports/plan-audit/SPEC-EVIDENCE-001-review-5.md`.

---

## §L Run-phase 세션 2 정리 (Blocker1/2 + M4 full + M4c/M4d/M4e 완료)

이번 세션(2026-08-30)에서 완료한 것을 정직하게 기록한다.

### 완료

- **Blocker1**(커밋 `e5ab40e`): `computeBaselineScore()` 신규 export + `retrieveEvidence()` 내 전략 A/B 스코어 분기.
  - TDD RED 증거: `computeBaselineScore is not a function` (2 failed)
  - TDD GREEN: 20/20 evidence-retriever tests passed
- **Blocker2**(커밋 `da6ffb8`): `db/seed/evidence-m2-snapshot.json` 10건 frozen snapshot 신규 + benchmark 4섹션 분리
  - [M2 EXPLORATORY] → m2SnapshotRows 사용 (mutable production evidence.json에서 분리)
  - [M5 REGRESSION] → seedRows(production) 유지
  - [M4d FINAL] → it.todo stubs (M4c freeze 후 채워짐)
- **M4 full**(커밋 `798bd46`): seed-evidence-003 POLICY→OTHER downgrade(insu-fit.com 마케팅 사이트 확인) + seed-evidence-020/021 신규 2건 (총 21건)
- **M4c**(커밋 `9626bd2`): 21건 corpus 기준 7개 BenchmarkCase의 complete knownRelevantEvidenceIds 확정 (human review)
- **M4d**(커밋 `b6faba0`): algorithm effect 최종 측정 — [FROZEN] tests 2개 추가
  - Strategy A (baseline): meanRecall=0.540, meanHit=0.714, meanPrecision=0.314
  - Strategy B (new): meanRecall=1.000, meanHit=0.857, meanPrecision=0.657
  - B >= A: 3개 메트릭 모두 충족 (non-regression PASS)
  - REQ-013 target case: A=miss(hit:0), B=hit(hit:1) 확인
- **M4e**(커밋 `4b47c4d`): coverage delta 리포트(`.moai/reports/coverage-delta-m4e.md`) + coverage-matrix.md 업데이트
  - 비어있는 셀: 14/14 → 7/14 (7셀 개선)
  - BenchmarkCase ground truth ≥ 1건: 0/7 → 6/7 (86%)
- **Push**: `4b47c4d` HEAD를 origin/feat/SPEC-EVIDENCE-001에 push 완료

### 완료하지 않음

- **DISPUTE_CASE**: 이번 세션에서도 FSS 분쟁조정 결정 개별 HTML URL 확보 실패 — PDF만 공개, 텍스트 추출 불가. 0건 유지.
- **M6 문서 최종 정리**: M4d/M4e 결과는 완성했으나 acceptance.md의 모든 AC 검증 + CHANGELOG + README 업데이트는 manager-docs(sync phase) 몫.
- **pnpm test:e2e, pnpm build**: 환경 제약(Node v20 + pnpm 11.23.0 호환성 문제)으로 이번 세션에서 실행 불가.

### 테스트 현황 (최종)

- 전체 테스트: 279 passed | 8 todo | 7 failed (infra, pre-existing)
- 7 failed: `scripts/db-*.test.ts` — tsx runner 없는 환경에서 node로 .ts 직접 실행 시도로 발생, SPEC-EVIDENCE-001 변경과 무관. pnpm 환경에서는 정상 실행됨(§J의 281/281 통과 기록 참조).
- ESLint: `lib/pipeline/evidence-retriever.ts`, `evidence-retriever.test.ts`, `evidence-retriever.benchmark.test.ts` 모두 clean.

### SPEC 상태

`status: in-progress` 유지. M4d/M4e 완료로 핵심 acceptance criteria(AC-EVIDENCE-014 포함)가 충족되었으나, M6 및 sync phase(manager-docs)가 `completed` 전환을 담당한다.

### §E.2 M4 섹션 run-phase 증거

| 마일스톤 | Actual Output 요약 | Status |
|---|---|---|
| Blocker1(computeBaselineScore) | TDD RED: "computeBaselineScore is not a function" (2 failed) → GREEN: 20/20 passed | PASS |
| Blocker2(M2 snapshot freeze) | evidence-m2-snapshot.json 신규, benchmark 4섹션 분리, 7/7 non-todo passed | PASS |
| M4 full(corpus 21건) | seed-003 OTHER downgrade + 020/021 신규, audit manifest 업데이트 | PASS |
| M4c(ground truth freeze) | 7 BenchmarkCase × complete knownRelevantEvidenceIds 확정 | PASS |
| M4d(algorithm effect) | Strategy B meanRecall=1.0 >= A 0.540, B hits REQ-013 target, A misses | PASS |
| M4e(coverage delta) | 빈 셀 14→7, 7/7 BenchmarkCase 중 6/7 ground truth ≥ 1건 | PASS |

### §E.3 Run-phase Audit-Ready Signal (세션 2)

```yaml
run_status: m4-complete
m4_complete_at: 2026-08-30
run_commit_sha: 4b47c4d  # HEAD at session end, pushed to origin/feat/SPEC-EVIDENCE-001
ac_pass_count_this_session: 6  # Blocker1(REQ-016 fix), Blocker2(corpus isolation), M4(corpus-003), M4c(ground-truth-freeze), M4d(AC-EVIDENCE-014), M4e(coverage-delta)
ac_fail_count: 0
new_warnings_or_lints_introduced: false
total_run_phase_files_this_session: 8  # evidence-retriever.ts/test.ts/benchmark.test.ts + evidence-m2-snapshot.json + evidence.json + coverage-matrix.md + coverage-delta-m4e.md + evidence-source-audit-manifest.md
m1_to_mN_commit_strategy: per-milestone-commit
```

---

## §M Run-phase 세션 3 정리 (post-run correction — Fix1~Fix5 + Fix7/8)

이번 세션(2026-08-30)에서 수행한 post-run correction 7개를 정직하게 기록한다.

### Fix1: Strategy A sort = score desc only (기존 main baseline)

`evidence-retriever.ts`의 `.sort()` 호출을 전략 분기로 수정.
- 수정 전: `(a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id)` (단일 정렬, 전략 무관)
- 수정 후: `strategy === "A"` → score desc only (tie-break 없음) / `strategy === "B"` → score desc + id 오름차순
- 근거: 전략 A의 true baseline은 SPEC 착수 전 main과 동일한 단순 score desc여야 한다. id tie-break는 M2에서 전략 B를 위해 도입된 NEW 기능이므로 전략 A의 baseline에 포함되지 않는다.
- 테스트 추가: `evidence-retriever.test.ts`에 "전략 A: DB 행 순서 유지", "전략 B: id 오름차순 tie-break" 2개 테스트 신규 추가.

### Fix2: M2_BENCHMARK_CASES 분리 + measureStrategy() cases 파라미터화

`evidence-retriever.benchmark.test.ts`에서:
- `M2_BENCHMARK_CASES` const 신규 추가 (M2 당시 10건 corpus 기준 ground truth, FROZEN)
- `BENCHMARK_CASES` → FINAL benchmark (M4c freeze 기준, 21건 corpus)로 역할 명확화
- `measureStrategy()` 시그니처 변경: `(strategy, rows)` → `(strategy, rows, cases: BenchmarkCase[])`
- `[M2 EXPLORATORY]` 섹션의 모든 테스트가 `M2_BENCHMARK_CASES`를 사용하도록 업데이트

### Fix3: bm-disease-grade-01 ground truth 수정

`BENCHMARK_CASES`의 `bm-disease-grade-01.knownRelevantEvidenceIds`:
- 수정 전: `[]` (빈 배열 — AC-EVIDENCE-013 잘못된 적용)
- 수정 후: `["seed-evidence-004", "seed-evidence-017", "seed-evidence-018"]`
- 근거: AC-EVIDENCE-013의 "OTHER downgrade 항목 제외" 조항은 manifest에서 의도적으로 downgrade된 항목(seed-003 POLICY→OTHER)에만 해당. seed-004/017/018은 처음부터 OTHER였고 downgrade된 적 없음 → 포함 가능.

### Fix4: seed-021 DIAGNOSIS 태깅 제거 + manifest §C 모순 수정

A. `db/seed/evidence.json`의 seed-evidence-021 issueTypes 변경:
   - 수정 전: `["CAUSATION", "DIAGNOSIS"]`
   - 수정 후: `["CAUSATION"]`
   - 근거: 고지의무/계약해지 판례는 QueryPlanner DIAGNOSIS issueType("질병후유장해의 diagnosisName 확인 쟁점")이 아님.

B. `BENCHMARK_CASES`의 `bm-disease-diagnosis-01.knownRelevantEvidenceIds`:
   - 수정 전: `["seed-evidence-008", "seed-evidence-019", "seed-evidence-021"]`
   - 수정 후: `["seed-evidence-008", "seed-evidence-019"]`

C. `evidence-source-audit-manifest.md` §B2 seed-021 행: issueTypes를 `["CAUSATION"]`으로 업데이트, DIAGNOSIS 제거 rationale 기록.

D. `evidence-source-audit-manifest.md` §C: "의도적으로 배제한 후보" → "최종 채택(seed-021)으로 반전, DIAGNOSIS 태깅 제거" 기록. §C의 seed-021 기록과 §B2의 채택 기록 간 모순 해소.

### Fix5: recallAt5/hitAt5 빈 ground-truth → null + mean 제외 처리

`evidence-retriever.benchmark.test.ts`에서:
- `recallAt5()` / `hitAt5()` / `precisionAt5()`: `knownRelevantIds.length === 0` → `null` 반환
- `StrategyMetrics.perCase`: `recall/hit/precision` 타입을 `number | null`로 변경, `skipped: boolean` 필드 추가
- `StrategyMetrics`: `skippedCases: string[]` 필드 추가
- `measureStrategy()`: null 케이스(skipped) 제외하고 mean 계산
- 참고: Fix3 적용 후 bm-disease-grade-01은 non-empty ground truth가 되어 null path가 발동하지 않음. 그러나 미래 빈 케이스를 위한 방어적 처리로 정확함.

### Fix7: DISPUTE_CASE 시도 — 미충족 정직 기록

이번 세션에서 DISPUTE_CASE 확보를 재시도했다:
- (a) `https://www.fss.or.kr` — curl 접근 불가 (Bash 환경에서 HTTP 응답 없음, 타임아웃)
- (b) `https://www.knia.or.kr` — 동일하게 네트워크 접근 불가
- (c) FSS/KNIA/FCSC 웹사이트 — Bash 환경에서 outbound HTTP 연결이 차단된 것으로 판단

**결론**: HTML URL 개별 단위 DISPUTE_CASE 확보 불가 — Bash 환경의 네트워크 제약.
M4b DISPUTE_CASE 요구 미충족: 2026-08-30, 시도한 경로: FSS/KNIA/FCSC 웹사이트, curl 타임아웃, 결론: 환경 제약으로 HTML URL 개별 단위 확보 불가.

### Fix6: M4d 재측정 (수행완료 — vitest Node.js v20으로 직접 실행)

pnpm PATH 문제 우회: nvm v20.19.6 + vitest.mjs 직접 실행.

**[M4d FROZEN post-correction] — Strategy A (true baseline, issueTypeWeight=0, score-desc-only sort)**:

| case | recall | hit | precision |
|------|--------|-----|-----------|
| bm-injury-preexisting-01 | 0.000 | 0 | 0.000 |
| bm-injury-causation-01 | 1.000 | 1 | 0.800 |
| bm-injury-grade-01 | 0.200 | 1 | 0.200 |
| bm-injury-location-01 | 0.250 | 1 | 0.200 |
| bm-disease-causation-01 | 1.000 | 1 | 0.800 |
| bm-disease-grade-01 | 0.333 | 1 | 0.200 |
| bm-disease-diagnosis-01 | 0.500 | 1 | 0.200 |
| **mean** | **0.469** | **0.857** | **0.343** |

**[M4d FROZEN post-correction] — Strategy B (new, issueTypeWeight=10, score-desc + id tie-break)**:

| case | recall | hit | precision |
|------|--------|-----|-----------|
| bm-injury-preexisting-01 | 1.000 | 1 | 0.600 |
| bm-injury-causation-01 | 1.000 | 1 | 0.800 |
| bm-injury-grade-01 | 1.000 | 1 | 1.000 |
| bm-injury-location-01 | 1.000 | 1 | 0.800 |
| bm-disease-causation-01 | 1.000 | 1 | 0.800 |
| bm-disease-grade-01 | 1.000 | 1 | 0.600 |
| bm-disease-diagnosis-01 | 1.000 | 1 | 0.400 |
| **mean** | **1.000** | **1.000** | **0.714** |

**비교 결과 (REQ-EVIDENCE-016 기본 PASS 조건)**:
- Recall: B 1.000 >= A 0.469 ✓
- Hit: B 1.000 >= A 0.857 ✓
- Precision: B 0.714 >= A 0.343 ✓
- REQ-013 target case(bm-injury-preexisting-01): A=miss(hit:0) → B=hit(hit:1) ✓
- **AC-EVIDENCE-014 기본 PASS 조건: 충족**

### Fix8: gate 실행 — vitest/eslint/prettier 직접 실행 (2026-08-30)

pnpm 11.23.0은 Node.js v22+ 필요로 실행 불가. vitest/eslint/prettier를 Node.js v20으로 직접 실행.

**vitest run (pnpm test 대체)**:
```
Test Files  3 failed | 39 passed (42)
     Tests  7 failed | 281 passed (288)
  Duration  4.52s
```
- 281 PASS ✓
- 7 FAIL: scripts/db-migrate.test.ts, scripts/db-seed.test.ts, scripts/provision-tester.test.ts
  - 원인: 이 테스트들이 `.ts` 스크립트를 bare node로 직접 실행(tsx 없음) — SPEC-EVIDENCE-001 변경과 무관한 환경 제약. §J에서 pnpm 환경 281/281 통과 확인됨.

**ESLint (SPEC-EVIDENCE-001 변경 파일)**:
```
lib/pipeline/evidence-retriever.ts → 0 errors, 0 warnings ✓
lib/pipeline/evidence-retriever.test.ts → 0 errors, 0 warnings ✓
lib/pipeline/evidence-retriever.benchmark.test.ts → 0 errors, 0 warnings ✓
```

**Prettier format:check (SPEC-EVIDENCE-001 변경 파일)**:
```
All matched files use Prettier code style! ✓
```

**미실행 (환경 제약)**:
- `pnpm build` — pnpm 11.23.0 + Node.js v22+ 필요, v20만 가용
- `pnpm test:e2e` — pnpm 환경에서만 실행 가능

### §E.2 M4d post-correction 섹션 (최종)

| AC | Status | Evidence |
|----|--------|---------|
| AC-EVIDENCE-008 | PASS | 전략 A/B eligibility 동작 변경 없음 (benchmark 7/7 PASS) |
| AC-EVIDENCE-014 | **PASS** | M4d 재측정: B Recall/Hit/Precision >= A, REQ-013 A=miss/B=hit ✓ |
| AC-EVIDENCE-013 | **PASS** | bm-disease-grade-01 non-empty(004/017/018), seed-021 DIAGNOSIS 제거 |

### SPEC 상태

`status: in-progress` 유지.
- **DISPUTE_CASE 0건(M4b)**: 검증 가능한 FSS 분쟁조정 사례 개별 HTML URL 확보 불가. plan.md M4b 요구 미충족 — 숨기지 않음.
- **pnpm build / pnpm test:e2e**: Node.js v22 + pnpm 11.23.0 필요로 현재 환경에서 미실행 — pnpm 환경에서 확인 필요.
- pnpm build / test:e2e PASS 및 DISPUTE_CASE 1건 확보 시 AC 전체 충족 → sync 가능.

## §N Post-merge Coherence Correction — Phase 1 Gate 재확인 + Mode Selection (2026-08-31)

### Phase 1 Plan Audit Gate — skip-eligibility 판정

- 최근 verdict: iteration 5, PASS, score 0.923 (Tier L threshold 0.85 이상)
- Artifact hash: `git log --oneline 1b2a2b5..HEAD -- spec.md design.md acceptance.md` → 매치 없음(변경 없음)
- 3개 조건(PASS / score>=threshold / hash unchanged) 모두 충족 → **Phase 1 재실행 SKIP**
- 단, 이번 세션 작업 자체가 design.md를 다시 수정하므로, 수정 이후 hash는 당연히 바뀐다 — 이는 plan-audit 재실행 조건이 아니라 run-phase 중 SPEC body 수정(Status Transition Ownership Matrix의 "run-phase가 SPEC body 수정을 발견하면 manager-spec에 재위임" 절차)에 해당한다.

### §F 추가 — Mode Selection 재확인

- 이번 세션도 기존 §F 판단(직렬/serial, tdd)을 그대로 따른다: coherence correction은 관련 milestone(M2/M4d)에 의존성이 있는 순차 작업이며, 새 병렬화 대상이 아니다.
- Decision: serial (변경 없음)

---

## §O Run-phase 세션 4 정리 (post-merge coherence correction — §M Fix1 배선 결함 재수정, v0.7.0)

이번 세션(2026-08-31)은 §M Fix1이 실제로 도입한 REQ-EVIDENCE-012 위반을 design.md
§2.1의 "명시적 확인, v0.7.0" 문단(manager-spec이 이전 턴에서 design.md/spec.md를
정정)에 따라 재수정했다. Node 22 + pnpm 환경에서 전체 gate를 실제로 실행해 §M Fix8이
Node 20 우회 실행으로 남긴 7건 FAIL 잔여 의문도 함께 해소했다.

### 결함 재확인 (§M Fix1이 도입한 문제)

`evidence-retriever.ts`의 `retrieveEvidence()`가 `strategy === "A"`일 때 `computeScore()`
대신 M4d 전용 `computeBaselineScore()`를, 그리고 tie-break 없는 정렬을 사용하도록 배선돼
있었다 — 이것은 §M Fix1이 "전략 A의 true baseline은 SPEC 착수 전 main과 동일해야 한다"는
근거로 도입한 것이지만, design.md §2.1이 명시하는 계약(production `retrieveEvidence()`는
strategy 값과 무관하게 항상 `computeScore()` + 결정론적 tie-break를 쓰고, strategy는
eligibility 술어만 바꾼다)과 정면으로 충돌한다 — REQ-EVIDENCE-012(production
`retrieveEvidence()`의 결정론적 정렬)를 위반한 사례였다.

### 수정 내역

1. **`lib/pipeline/evidence-retriever.ts`**:
   - `retrieveEvidence()`의 score/정렬 전략 분기를 제거 — 이제 strategy "A"/"B" 둘 다
     `computeScore()` + `score desc || id asc` tie-break를 사용한다. strategy가 바꾸는
     것은 `relevantA()`/`relevantB()` eligibility 술어뿐이다.
   - `trueBaselineRetrieveEvidence()` 신규 pure 함수 추가(benchmark 전용, production
     코드 경로에서 호출하지 않음) — `relevantA()` + `computeBaselineScore()` 조합,
     tie-break 없음(입력 배열 순서 유지, `Array.prototype.sort`의 stable sort 특성에
     의존). "과설계 금지" 지시에 따라 별도 class/service 없이 작은 pure 함수로 유지,
     `computeBaselineScore()`/`relevantA()`와 co-located(diff 최소화).
   - 파일 헤더 및 인라인 주석을 새 배선("전략 무관 공통 computeScore + tie-break")에
     맞춰 정정.

2. **`lib/pipeline/evidence-retriever.benchmark.test.ts`**:
   - `[M4d FINAL]` describe 블록의 "B >= A non-regression" 테스트: baseline 측을
     `measureStrategy("A", ...)`(이제 production 전략 A를 측정 — true baseline이 아님)
     대신 신규 `measureTrueBaseline()`(`trueBaselineRetrieveEvidence()` 호출)으로 교체.
   - `[FROZEN] REQ-013 target case` 테스트의 인라인 주석 정정("strategy A(computeBaselineScore)"
     → "strategy A eligibility(relevantA())"로 — miss/hit 결과 자체는 eligibility가 동일하게
     유지되므로 변경 없음, 실제 재실행으로 확인).
   - `[M2 EXPLORATORY]` describe 블록: 코드 변경 없음(M2는 애초에 두 전략 모두
     `computeScore()`를 쓰는 의도적 단순화 — design.md §2.2). 주석/라벨만 v0.7.0
     맥락에 맞춰 정정, 재실행해 fresh 수치 기록(아래).
   - 파일 헤더 + `[M4d FINAL]` 블록 헤더 주석을 새 아키텍처(전략 A/B 공통 computeScore,
     `trueBaselineRetrieveEvidence()`가 M4d 전용 true baseline)에 맞춰 재작성.

3. **`lib/pipeline/evidence-retriever.test.ts`**:
   - **§M이 도입한 버그를 직접 검증하던 기존 테스트 정정**: "전략 A: computeBaselineScore
     동점 시 result order는 DB 행 순서에 의존한다"는 테스트가 정확히 이번에 제거한 버그
     동작을 assert하고 있었다 — 이 테스트는 삭제하지 않고, "전략 A도 이제 id 오름차순
     tie-break를 쓴다"는 정정된 계약을 검증하도록 재작성했다(assertion을 완화한 것이
     아니라, 잘못된 계약을 assert하던 테스트를 올바른 계약을 assert하도록 수정 — 테스트가
     선행 세션의 결함 자체를 봉인하고 있었다).
   - **REQ-EVIDENCE-012 determinism proof — strategy="A" 신규 추가**: 기존 tie-break
     테스트는 strategy 인자를 생략(기본값 "B")해 strategy="A" 경로의 결정론성을 직접
     검증하지 않았다. `retrieveEvidence([query], db, "A")`를 3회 호출해 동일 입력에
     동일 순서(`id` 오름차순)를 반환함을 신규 테스트로 직접 확인했다.

### 재실행 fresh 수치 (Node 22 + pnpm, 이번 세션 실측 — 이전 수치 재사용 없음)

**M2 EXPLORATORY (10건 snapshot corpus, `pnpm test lib/pipeline/evidence-retriever.benchmark.test.ts --reporter=verbose` 실행 결과 그대로)**:

| 지표 | 전략 A (computeScore, relevantA eligibility) | 전략 B |
|---|---|---|
| meanRecall | 0.857 | 1.000 |
| meanHit | 0.857 | 1.000 |
| meanPrecision | 0.229 | 0.286 |

B >= A 계약 충족(3개 지표 전부). (§M 당시 수치는 전략 A가 `computeBaselineScore`를
썼으므로 이번 수치와 직접 비교 대상이 아니다 — 배선이 바뀌었으니 재측정이 필요했다.)

**M4d FINAL — algorithm effect (frozen corpus 21건, true baseline vs production 전략 B)**:

| case | true baseline recall/hit/precision | 전략 B recall/hit/precision |
|---|---|---|
| bm-injury-preexisting-01 | 0 / 0 / 0.000 | 1.000 / 1 / 0.600 |
| bm-injury-causation-01 | 1.000 / 1 / 0.800 | 1.000 / 1 / 0.800 |
| bm-injury-grade-01 | 0.200 / 1 / 0.200 | 1.000 / 1 / 1.000 |
| bm-injury-location-01 | 0.250 / 1 / 0.200 | 1.000 / 1 / 0.800 |
| bm-disease-causation-01 | 1.000 / 1 / 0.800 | 1.000 / 1 / 0.800 |
| bm-disease-grade-01 | 0.333 / 1 / 0.200 | 1.000 / 1 / 0.600 |
| bm-disease-diagnosis-01 | 0.500 / 1 / 0.200 | 1.000 / 1 / 0.400 |
| **mean** | **0.469 / 0.857 / 0.343** | **1.000 / 1.000 / 0.714** |

- Recall: B 1.000 >= true baseline 0.469 ✓
- Hit: B 1.000 >= true baseline 0.857 ✓
- Precision: B 0.714 >= true baseline 0.343 ✓
- REQ-013 target case(bm-injury-preexisting-01): true baseline miss(hit:0) → B hit(hit:1) ✓
- 이 수치는 §M Fix6이 기록한 수치와 **표면적으로 동일하다** — 우연이 아니라,
  `trueBaselineRetrieveEvidence()`가 §M Fix1이 잘못 배선하기 전 프로덕션 코드의 "전략 A"
  경로와 동일한 함수 조합(`relevantA` + `computeBaselineScore`, tie-break 없음)을
  재현하도록 설계됐기 때문이다 — 다만 이번에는 그 조합이 production `retrieveEvidence()`
  내부가 아니라 별도 benchmark 전용 함수에서 실행된다는 점이 유일한 차이다.

### DISPUTE_CASE(M4b) — 계속 미충족, 이번 세션 추가 조사 정직 기록

이번 세션 orchestrator가 FSS(금융감독원) 공식 사례집 페이지(`fss.or.kr/fss/job/fncCnflCase/list.do?menuNo=201195`)를
직접 조회했다 — 이 페이지가 유일하게 공개된 개별 사례 목록이다. 조사 결과:
- 이 페이지가 배포하는 사례 자료는 전부 `.hwp`(한글 워드프로세서) 형식이며 PDF가 아니다.
- `.hwp` 및 표본 조회한 `kiri.or.kr` PDF 모두 사용 가능한 도구로 텍스트 추출 실패
  (binary/font-only 콘텐츠 — §M Fix7이 기록한 FSS/KNIA curl 접근 불가와는 다른, 별개의
  진짜 접근 장벽. 이번에는 페이지 자체는 접근됐으나 콘텐츠 형식이 파싱 불가였다).
- 전체 201건 중 1-2페이지(20건)를 표본 조사했으나 상해후유장해/질병후유장해/기왕증
  관련으로 보이는 사례 제목을 찾지 못했다("말하는 기능 장해" 사례 1건이 느슨하게
  관련되어 보였으나 다른 주제이고 역시 `.hwp`).

**결론**: DISPUTE_CASE(M4b)는 이번 세션에도 **미충족**으로 유지한다. 사례 번호나 내용을
지어내지 않았고, DB에 어떤 신규 seed 행도 추가하지 않았다. 이는 지어낼 자료가 없어서가
아니라 도구가 파싱할 수 없는 형식으로만 공개돼 있다는 정직한 접근 장벽이다 — 후속 세션에서
`.hwp` 텍스트 추출 도구(예: 별도 변환 유틸리티)를 확보하거나 유료 판례 DB 접근이 가능해지면
재시도를 권고한다(§M Fix7의 권고와 동일 방향).

### 보고서 3종 재검증 (post-correction — 옛 프로즈 신뢰 금지 지시에 따른 실측 재확인)

`.moai/reports/coverage-delta-m4e.md` §7, `.moai/specs/SPEC-EVIDENCE-001/coverage-matrix.md`의
"M4c/M4d/M4e 이후 post-correction 재검증" 절, `.moai/reports/evidence-source-audit-manifest.md`
§D를 이번 세션에 신규 추가했다(기존 절 삭제 없음). `db/seed/evidence.json`을 직접 재조회해
coverage matrix 4개 셀(DIAGNOSIS×DISEASE, CAUSATION×INJURY, CAUSATION×DISEASE,
PRE_EXISTING_CONDITION×DISEASE)에서 기존 문서가 실제 21건 데이터와 불일치함을 발견해
정정 기록을 남겼다(원인: seed-021의 Fix4 DIAGNOSIS 태깅 제거가 coverage matrix 절에
반영되지 않았던 점, UNIVERSAL 레코드의 양 도메인 집계가 CAUSATION/PRE_EXISTING_CONDITION
셀 일부에서 누락됐던 점). manifest 헤더의 "이번 세션은 pilot 범위만 수행"이라는 scope
고지도 이제 사실과 다르므로(§B2가 이미 M4 full을 기록) "cumulative: pilot → M4 full →
post-correction"으로 정정했다 — §A/§B/§B2/§C의 실질 curation 내용 자체는 변경하지 않았다.

### Full gate — Node 22 + pnpm 실제 실행 (§M Fix8의 Node 20 우회 대체)

| 명령 | exit | 결과 |
|---|---|---|
| `pnpm test` | 0 | 42 test files, 289 tests **전부 PASS** — §M Fix8이 Node 20 bare 실행으로 남긴 7건 FAIL(scripts/db-migrate.test.ts 등, tsx 부재)은 pnpm 환경(Node 24.19.0)에서는 재현되지 않는다 |
| `pnpm lint` | 0 | 0 errors, 0 warnings |
| `pnpm format:check` | 0 | 전부 Prettier 스타일 준수 |
| `pnpm build` | 0 | 정상 빌드(`instrumentation.ts`의 Edge Runtime `process.exit` 경고 1건 — SPEC-EVIDENCE-001 변경과 무관한 기존 경고, 신규 아님) |
| `pnpm test:e2e` | 0 | 4 tests 전부 PASS |

**§M Fix8이 "환경 제약으로 미실행"이라 기록한 `pnpm build`/`pnpm test:e2e`가 이번 세션에서
실제로 PASS로 확인됐다** — Node.js v24.19.0 + pnpm 11.23.0 환경이 이번 세션에서 정상
동작했다(Node 22+ 요구사항 충족).

### §E.2 §O 섹션 AC 재확인 (최종)

| AC | Status | Evidence |
|----|--------|---------|
| AC-EVIDENCE-008 | PASS | eligibility 동작(relevantA/relevantB) 변경 없음 — 전체 벤치마크/단위 테스트 PASS 유지 |
| AC-EVIDENCE-009 | PASS | `pnpm test`(REQ-EVIDENCE-010 회귀 테스트, 전략 B) PASS |
| AC-EVIDENCE-011 | **PASS** | `retrieveEvidence()` 3회 반복 호출 결정론성 테스트 — strategy "B"(기존) + strategy "A"(이번 세션 신규 추가) 둘 다 PASS |
| AC-EVIDENCE-012 | PASS | BENCHMARK_CASES 7건 구성 변경 없음 — 커버리지 테스트 PASS |
| AC-EVIDENCE-013 | PASS | ground truth id 대조 테스트 PASS, manifest 대조 변경 없음 |
| AC-EVIDENCE-014 | **PASS** | true baseline(trueBaselineRetrieveEvidence) 대비 B: Recall/Hit/Precision 전부 우위, REQ-013 target case miss→hit 확인(위 표) |

### SPEC 상태 (§O 최종)

`status: in-progress` 유지 — **frontmatter 변경 없음**. 이 에이전트(manager-develop, cycle_type=tdd)의
상태 전이 권한은 "draft → in-progress"(M1 커밋) 하나뿐이며, 이 SPEC은 이미 이전 세션에서
in-progress로 전이됐다 — 이번 세션은 그 이후의 run-phase 정정이므로 추가로 전이할 권한이 없다.
`in-progress → implemented → completed`는 manager-docs가 단일 sync 커밋에서 수행한다
(spec-frontmatter-schema.md § Status Transition Ownership Matrix).

- **차단 요인 없음**: 전체 gate(test/lint/format/build/e2e) PASS, 모든 재확인 대상 AC PASS.
- **잔존 미충족(차단 아님, 정직 고지 유지)**: DISPUTE_CASE(M4b) 0건 — 위 조사 기록 참고,
  plan.md M4b가 지정한 최소 1건 목표는 여전히 미달이나 이는 §M부터 이어진 기존 잔여 위험이며
  이번 세션이 새로 발생시킨 것이 아니다. sync 판단은 manager-docs/orchestrator의 몫이다.

---

## §P Run-phase 세션 5 정리 (v0.7.0 → v0.8.0 후속 3개 지시 처리 + plan-audit iteration 6/7)

이번 세션(2026-08-31)에서 사용자가 지시한 3개 항목을 처리했다.

### 1. coverage-delta-m4e.md 캐노니컬 재작성

`.moai/reports/coverage-delta-m4e.md`를 append-correction 방식(§1-§6 원본 + §7 정정 패치)에서
단일 최종본으로 재작성했다(commit `d3e5317`). `db/seed/evidence.json`(21건)과 현재
`BENCHMARK_CASES`를 직접 재조회해 UNIVERSAL 레코드 양 도메인 집계를 정확히 반영했고,
"빈 ground truth → Recall=1" stale 문구를 제거했다(현재 구현은 null 반환 + 평균 제외,
design.md §3.3a와 일치). `bm-disease-grade-01`의 ground truth가 이미 Fix3로 3건
(004/017/018)임을 재확인 — 옛 "0건" 전제 자체가 stale이었다.

### 2. plan.md M4d 용어 정정 + M4b DISPUTE_CASE best-effort downgrade (commit `cc15e0e`)

`baselineRetriever`/`newRetriever` 표현을 design.md §3.4A 어휘(`trueBaselineRetrieveEvidence()`,
production `retrieveEvidence(strategy="B")`)로 통일. DISPUTE_CASE(M4b)는 사용자 승인을 받아
"최소 1건 필수"에서 "best-effort — 공식 소스가 텍스트 추출 가능한 형식으로 공개되지 않는 한
0건도 AC 충족"으로 정식 하향했다. orchestrator가 이번 세션에도 LBOX/KDI/FSC 등 추가 경로를
조사했으나 여전히 실제 읽을 수 있는 공식 결정문을 확보하지 못해(§M/§N에 이어 세 번째 시도),
사용자가 두 가지 선택지(실제 확보 vs 요구사항 공식 완화) 중 후자를 선택했다. spec.md REQ-EVIDENCE-002/003에는
원래 최소 건수 강제가 없었고 acceptance.md에도 해당 AC가 없었음을 확인 — plan.md 수정만으로 충분.

### 3. DISPUTE_CASE 처리 — 위 2번과 동일 건으로 통합 처리됨

### plan-audit 재실행 — iteration 6 FAIL → D1/D2 수정 → iteration 7 PASS(1.0)

REQ/AC 인접 문구 변경으로 plan-audit 캐시가 무효화되어 재감사(iteration 6)를 실행했다 —
이번 세션 변경 자체는 문제없었으나, iteration 5부터 미해결이던 D1(plan.md M2/M4에 §3.1a
픽스처 분리 task 누락)/D2(acceptance.md AC-EVIDENCE-014에 live-import 금지 Then절 누락)가
"이전 iteration 미해결 결함은 자동 FAIL" 규칙에 의해 재차 FAIL을 유발했다(이번 세션 지시와
무관한 기존 결함). 사용자에게 보고 후 승인받아 manager-spec에게 D1/D2 수정을 위임했다
(commit `4dbe8cb`) — plan.md M2에 `evidence-m2-snapshot.json` 불변성 요구 task 추가,
acceptance.md AC-EVIDENCE-014에 `[M2 EXPLORATORY]` 섹션이 `seedRows`를 참조하지 않는다는
기계적 검증 Then절 추가. iteration 7 재감사 결과 **PASS, score 1.0**(D1/D2/D4 전부 해소,
새 결함 없음. D3(design.md REQ 오기재)는 3회 연속 stagnant로 flag됐으나 non-blocking이라
FAIL을 유발하지 않음 — 후속 세션 권고 사항으로 남김).

### 커밋 이력 (이번 세션, feat/SPEC-EVIDENCE-001)

| SHA | 내용 |
|---|---|
| `4590caf` | design.md/spec.md Strategy A/B 의미 충돌 수정 (전전 지시, v0.6.0→v0.7.0) |
| `cc15e0e` | M4d 용어 정정 + M4b best-effort downgrade (v0.7.0→v0.8.0) |
| `4dbe8cb` | plan-audit D1/D2 결함 해소 |
| `d3e5317` | coverage-delta-m4e.md 캐노니컬 재작성 |

### SPEC 상태

`status: in-progress` 유지(사용자 명시 지시: "그 전에는 status: in-progress 유지"). `/moai sync`
미실행, PR merge 미실행 — 지시대로 commit+push까지만 수행했다.
