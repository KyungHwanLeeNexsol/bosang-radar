# SPEC-EVIDENCE-001 — 인수 기준 (acceptance.md)

## §A. 개요

각 AC는 원칙적으로 정확히 1개의 `REQ-EVIDENCE-XXX`를 검증한다. REQ-EVIDENCE-019(A/B/C 진단 +
over-claim 방지)만 네 개의 서브레터 AC(016a/b/c/d)로 나눈다(design.md §4.1/§4.3/§4.4의 "무엇을
자동화하고 무엇을 하지 않는가" 경계를 AC 단위로도 그대로 반영하기 위함). 밀접하게 연관된 신규
REQ(REQ-EVIDENCE-013→AC-008, REQ-EVIDENCE-017→AC-014, REQ-EVIDENCE-020→AC-016d)는 기존 AC에 Given/Then 절을 추가하는
방식으로 통합해 Tier L AC 상한(25개)을 지킨다. 실제 Gemini API를 호출하는 자동화 테스트는
없다 — 결정론적 fake/mock provider만 사용한다. `db/seed/evidence.json`의 실제 출처 검증(원문
대조)은 자동화 불가능한 수작업 절차(design.md §5)이므로, 해당 AC는 "구조적으로 검증 가능한
부분"(예: `sourceUrl`/`sourceIdentifier` 존재 여부)만 이진 판정한다 — 이는 verification-claim-integrity
원칙("관측하지 않은 것을 관측했다고 주장하지 않는다")을 AC 설계에도 그대로 적용한 것이다.

## §B. AC 매트릭스 (Given-When-Then)

**AC-EVIDENCE-001** (REQ-EVIDENCE-001)
- Given: `.moai/specs/SPEC-EVIDENCE-001/`(또는 `.moai/docs/`) 내 coverage matrix 문서
- When: 문서를 검토한다
- Then: 두 담보(`INJURY_DISABILITY`/`DISEASE_DISABILITY`) × 8개 `QueryIssueType` 전체 16개 셀이
  표에 존재하고(`N/A`로 명시된 셀 포함, 셀 자체를 삭제하지 않음), `N/A`가 아닌 각 셀에 현재
  건수와 목표 건수가 명시되어 있으며, evidenceType별 목표 건수가 이 matrix에서 도출된 값임을
  문서 내에서 설명한다(임의 균등배분 문구가 없음). `N/A` 셀에는 `query-planner.ts`의 실제 조건부
  트리거 로직을 근거로 든 설명이 있다(design.md §7).

**AC-EVIDENCE-002** (REQ-EVIDENCE-002, REQ-EVIDENCE-005)
- Given: `db/seed/evidence.json`의 `evidenceType`이 `PRECEDENT`/`STATUTE`/`DISPUTE_CASE`/`POLICY`인
  **모든** 레코드(기존 10건 중 재감사를 통과한 레코드 + 신규 레코드 전부 — 신규 레코드만이 아님)
- When: 각 레코드의 `sourceUrl` 또는 `sourceIdentifier` 필드를 검사한다
- Then: 전부 `null`이 아닌 값을 가진다. **이 AC는 authenticity PASS를 주장하지 않는다** — 필드
  존재라는 구조적 최소 검증일 뿐이며, 원문 내용 대조·실제 authenticity 판정은
  `.moai/reports/evidence-source-audit-manifest.md`(AC-EVIDENCE-026)가 별도로 기록한다(구조
  검증과 수동 검증의 경계는 §A/§C에 명시).

**AC-EVIDENCE-003** (REQ-EVIDENCE-003)
- Given: `db/seed/evidence.json`(production seed)과 신규 benchmark/diagnostic fixture 파일
- When: 두 파일 집합을 비교한다
- Then: benchmark/diagnostic 전용으로 작성된 synthetic 레코드가 `db/seed/evidence.json`에
  존재하지 않는다 — 두 데이터가 물리적으로 다른 파일에 있다.

**AC-EVIDENCE-004** (REQ-EVIDENCE-004)
- Given: 확장된 `db/seed/evidence.json`(M1~M4 반영 이후)
- When: `pnpm db:seed`를 연속 2회 실행한다
- Then: `evidence` 테이블의 행 수가 1회차와 2회차 사이에 변하지 않고, 각 `id`의 다른 컬럼 값도
  2회차 실행 이후 1회차와 동일하다(idempotency 회귀 테스트).

**AC-EVIDENCE-005** (REQ-EVIDENCE-006)
- Given: `lib/db/schema.ts`에 추가된 신규 컬럼 목록과 `lib/pipeline/evidence-retriever.ts`/benchmark
  채점 코드/dedup 코드(design.md §6)
- When: 각 신규 컬럼을 실제로 읽는 코드 경로를 grep으로 확인한다
- Then: M1 시점 신규 컬럼은 `issueTypes` 1개뿐이며(`sourceIdentifier`/`sourceDate`가 이 시점
  스키마에 없음을 확인), `issueTypes`는 `evidence-retriever.ts`의 candidate eligibility(전략 B)와
  score 함수 양쪽에서 소비된다. 이후 `sourceIdentifier`가 추가된 경우, 그 컬럼을 실제로 읽는
  source-integrity 검증 또는 dedup(design.md §6 `isDuplicate()`) 코드 경로가 존재함을 확인한다 —
  존재 여부 구조 검증만 하는 코드는 이 AC를 만족시키지 않는다. `keywords`는 이번 milestone에서
  스키마에 추가되지 않았음을 확인한다(research.md §4 "보류" 결정과 일치).

**AC-EVIDENCE-006** (REQ-EVIDENCE-007)
- Given: `EvidenceCandidate.issueTypes` 타입 정의
- When: TypeScript 컴파일러로 타입을 확인한다
- Then: `issueTypes`의 타입이 `QueryIssueType[]`(8개 리터럴 유니온의 배열)이며, 사건별 판정이
  아니라 evidence 레코드 자신의 정적 분류임이 타입 주석에 명시되어 있다.
- Given(runtime, 외부 독립 리뷰 v0.3.0 이슈 2): `db/seed/evidence.json`을 복제해 한 레코드의
  `issueTypes`에 `QueryIssueType` 8개 값에 속하지 않는 문자열(예: `"INVALID_TYPE"`)을 주입한
  fixture 파일
- When: `scripts/db-seed.ts`의 `loadSeedRecords()`(또는 동등한 로딩 함수)로 이 fixture를 로드한다
- Then: zod 스키마 검증이 `ZodError`를 던지고, 로딩 함수가 이를 잡아 명확한 에러 메시지와 함께
  fail-fast하며, 잘못된 레코드만 건너뛰고 나머지를 부분 삽입(partial insert)하지 않는다 — 이
  검사는 TypeScript 컴파일 타임 타입 체크가 아니라 실제 JSON 데이터에 대한 runtime 검증이다.
- Then(SSOT, optional 일관성 검토, 외부 독립 리뷰 잔여 정합성 이슈 4): `db/seed/evidence-seed-schema.ts`와
  `lib/pipeline/types.ts`를 grep해 `QueryIssueType`의 8개 값이 `lib/pipeline/types.ts`의
  `QUERY_ISSUE_TYPES` const 한 곳에서만 리터럴로 선언되어 있고, `evidence-seed-schema.ts`의
  zod enum은 그 const를 import해서 사용할 뿐 8개 값을 별도로 하드코딩하지 않는다.

**AC-EVIDENCE-007** (REQ-EVIDENCE-008)
- Given: `lib/db/schema.ts`, `lib/pipeline/types.ts` 전체
- When: `claimant`/`insurer`/`stance`/`argumentRole` 등 관점 라벨 관련 필드명을 grep한다
- Then: 매치가 0건이다.

**AC-EVIDENCE-008** (REQ-EVIDENCE-009, REQ-EVIDENCE-013)
- Given: (1) `issueTypes`에 query와 동일한 issueType을 가진 evidence A와, 키워드만 우연히 1개
  겹치고 `issueTypes`는 다른(또는 빈) evidence B — 둘 다 title/content에 query keyword가 있는
  상황. (2) **별도로**, `issueTypes`에 query와 동일한 issueType을 갖지만 title/content 어디에도
  query keyword 문자열이 전혀 없는 evidence C(known-relevant로 지정, REQ-EVIDENCE-013 케이스)
- When: 전략 A와 전략 B(design.md §2.1) 각각으로 동일 query에 `retrieveEvidence()`를 호출한다
- Then: (a) 두 전략 모두에서 A의 score가 B의 score보다 높고 정렬된 후보 목록에서 A가 B보다 앞에
  온다(ranking 확인). (b) **전략 A에서는 evidence C가 candidate 목록에 아예 나타나지 않고(진입
  실패 — 이전 결함 재현 확인), 전략 B에서는 evidence C가 candidate 목록에 나타난다**(§D 벤치마크가
  측정하는 "known-relevant, exact issueType, no keyword" 복구 케이스가 실제로 복구됨을 단위
  테스트 수준에서도 확인).

**AC-EVIDENCE-009** (REQ-EVIDENCE-010)
- Given: design.md §3의 curated benchmark 케이스 최소 1건에 "무관하지만 키워드 하나가 우연히
  겹치는 evidence"를 의도적으로 포함한 회귀 fixture
- When: 그 벤치마크 케이스를 실행한다
- Then: 그 무관 evidence가 known-relevant 목록에 없는 evidence 중 top-5 안에 실제 relevant
  evidence보다 높은 순위로 들어오지 않는다.

**AC-EVIDENCE-010** (REQ-EVIDENCE-011)
- Given: `evidence-retriever.ts`의 `TOP_N` 상수
- When: M2 benchmark 측정 결과 문서를 확인한다
- Then: `TOP_N`이 5로 유지되었거나, 변경되었다면 그 변경이 M2 baseline 대비 개선 수치를 근거로
  들고 있다 — 근거 문서 없이 값만 바뀐 diff가 아니다.

**AC-EVIDENCE-011** (REQ-EVIDENCE-012)
- Given: score가 동점인 evidence 후보 2건 이상을 포함하는 고정 evidence corpus
- When: `retrieveEvidence()`를 동일 입력으로 3회 연속 호출한다
- Then: 3회 모두 정확히 동일한 순서의 배열을 반환하며, 동점 evidence 간 순서는 `id` 오름차순과
  일치한다.

**AC-EVIDENCE-012** (REQ-EVIDENCE-014)
- Given: `evidence-retriever.benchmark.test.ts`의 벤치마크 케이스 목록
- When: 케이스의 `query.domain`/`query.issueType` 조합을 집계한다
- Then: 두 담보 각각에서 CAUSATION/DISABILITY_GRADE_CRITERIA/DIAGNOSIS 또는
  DISABILITY_LOCATION 조합이 최소 1건씩 존재하고, `PRE_EXISTING_CONDITION` 케이스가 최소 1건
  존재한다(총 7건 이상).

**AC-EVIDENCE-013** (REQ-EVIDENCE-015)
- Given: 모든 벤치마크 케이스의 `knownRelevantEvidenceIds`와 `.moai/reports/evidence-source-audit-manifest.md`
- When: 그 ID 집합을 (a) `db/seed/evidence.json`의 실제 `id` 집합과, (b) manifest에서 "유지"로
  결정된 `id` 집합과 대조한다
- Then: 전부 (a)를 만족하고, 전부 (b)도 만족한다 — 벤치마크 전용으로 새로 만든 가상의 `id`가
  없을 뿐 아니라, manifest에서 `OTHER` downgrade되거나 제외된 evidence를 ground truth로 참조하는
  케이스도 없다.
- Then(completeness, 외부 독립 리뷰 잔여 정합성 이슈 2): 각 `BenchmarkCase`에 대해, freeze
  대상 corpus 전체를 검토해 relevant로 판정된 complete set으로 `knownRelevantEvidenceIds`를
  확정했다는 기록(progress.md 또는 manifest)이 존재한다 — 이 기록이 없는 케이스는 Precision@5가
  최종 acceptance 근거로 쓰이지 않았음을 AC-EVIDENCE-014 확인 시 함께 확인한다.

**AC-EVIDENCE-014** (REQ-EVIDENCE-016, REQ-EVIDENCE-017)
- Given: M2에서 측정한 exploratory 단계 수치(전략 A/B, 10건 corpus)와 M4d에서 측정한 algorithm
  effect 수치(baselineRetriever/newRetriever, 동일한 freeze된 최종 corpus)와 M4e에서 측정한
  corpus expansion effect 수치(coverage delta, 초기 corpus → freeze된 최종 corpus)
- When: `.moai/reports/`의 측정 기록 문서를 확인한다
- Then(exploratory/frozen 분리): exploratory 수치와 M4d 수치가 **서로 다른 절**로 명확히
  라벨링되어 있다("exploratory"/"frozen" 또는 동등한 표현) — exploratory 수치가 최종 acceptance
  threshold의 직접 근거로 인용되지 않으며, threshold는 M4d(algorithm effect) 수치 이후에 별도
  절에서 도출됨을 확인한다.
- Then(algorithm effect vs corpus expansion effect 분리, 외부 독립 리뷰 v0.3.0 이슈 1): M4d
  절은 "algorithm effect"(또는 동등한 표현)로 라벨링되어 있고, "corpus 확장 효과"라는 이름으로
  잘못 라벨링되어 있지 않다. M4e 절은 "corpus expansion effect"(또는 동등한 표현)로 별도
  라벨링되어 있으며, 두 절의 수치가 하나로 합쳐져 보고되지 않는다.
- Then(3-지표 기록): M4d 절에 Recall@5, Hit@5, Precision@5 세 지표가 모두 baseline/new 값과 함께
  기록되어 있다 — Recall@5만 보고하고 Precision@5(또는 Hit@5)가 누락되어 있지 않다.
- Then(coverage-delta 검증): M4e 절이 domain × issueType coverage matrix(초기 → 최종 건수), 빈
  coverage cell 수(초기 → 최종), ground truth 존재 query 비율(초기 → 최종) 중 최소 coverage
  matrix와 query 비율을 포함하며, cross-corpus Recall@5 수치를 직접 비교해 "효과"라고 주장하는
  문장이 없다(grep으로 "corpus 확장" 인근에 "Recall@5" 직접비교 문구가 없는지 확인).
- Then(기본 PASS 조건 — 외부 독립 리뷰 잔여 정합성 이슈 1, 구현 전 최종 정합성 수정으로 보강): 다음 두 경로 중 하나를 만족해야 이 Then이 PASS다. **(경로 A, 정상 PASS)** M4d의 실측값이 new Recall@5 ≥ baseline Recall@5 AND new Hit@5 ≥ baseline Hit@5 AND new Precision@5 ≥ baseline Precision@5를 모두 만족한다. **(경로 B, trade-off exception)** 경로 A를 만족하지 못한 metric마다 (a) 악화 폭, (b) 이를 수용하는 제품적 사유, (c) 검토한 대체 전략/weight 조정 결과, (d) acceptance 계약이 이 결과에 맞춰 의도적으로 변경됐음을 명시한 design exception이 acceptance.md 또는 progress.md에 기록되어 있고, **그 변경된 계약에 대해 plan-auditor가 실제로 재검토를 실행해 PASS했다는 기록(iteration 번호 · verdict · overall score · 근거)**이 progress.md에 존재해야 경로 B도 PASS로 인정된다 — design exception 문서만 작성하고 plan-auditor 재검토 없이(또는 재검토가 FAIL이거나 아직 실행되지 않은 채로) 이 Then을 PASS로 처리해서는 안 된다. threshold 문구가 실측값에 맞춰 사후에 조용히 수정된 diff가 아니다.
- Then(REQ-EVIDENCE-013 target case 복구, 외부 독립 리뷰 잔여 정합성 이슈 1): M4d 절에
  REQ-EVIDENCE-013가 지정한 target case(exact issueType, no keyword)에서 baseline이 miss하고
  new가 hit했음이 그 케이스 단위로 명시적으로 기록되어 있다 — 집계 지표만으로 대체되지 않는다.
  **이 Then은 위 '기본 PASS 조건' Then의 trade-off exception 경로(경로 B)의 대상이 아니다** —
  target case 복구가 관측되지 않으면 3개 지표가 전부 정상 PASS(경로 A)를 만족해도 AC-EVIDENCE-014
  전체는 미충족이며, design exception으로 이 Then을 대체할 수 없다(REQ-EVIDENCE-016, 외부 독립
  리뷰 잔여 정합성 이슈 D8).

**AC-EVIDENCE-015** (REQ-EVIDENCE-018)
- Given: 이 SPEC의 acceptance.md 전체와 `evidence-diagnostic.test.ts`
- When: "counterEvidenceIds"를 grep한다
- Then: "빈 배열이면 FAIL" 또는 "최소 1개 필요"라는 취지의 강제 조건이 어디에도 없다 — 모든 관련
  단언은 A/B/C 구분(§016a/b/c)에 대한 것이지 counterEvidenceIds 자체의 비어있음 여부에 대한 것이
  아니다.

**AC-EVIDENCE-016a** (REQ-EVIDENCE-019, stage A)
- Given: `evidence-diagnostic.test.ts`의 고정 fixture evidence corpus
- When: 그 corpus에서 미리 지정한 `known-counter-relevant-id`를 검색한다
- Then: 그 id가 fixture corpus 안에 실제로 존재한다(corpus 자체에 counter-relevant evidence가
  없는 경우가 아님을 확인).

**AC-EVIDENCE-016b** (REQ-EVIDENCE-019, stage B)
- Given: 위 fixture corpus와 그 evidence를 relevant로 만드는 고정 `ResearchQuery`
- When: `retrieveEvidence()`를 실행한다
- Then: 반환된 후보 목록(해당 query의 값)에 `known-counter-relevant-id`가 포함된다(top-K 탈락이
  아님을 확인).

**AC-EVIDENCE-016c** (REQ-EVIDENCE-019, stage C-전제조건)
- Given: 위 후보 목록을 입력받는 `challenge()`와, 전달된 프롬프트 텍스트를 캡처하는 결정론적
  fake provider
- When: `challenge()`를 실행한다
- Then: 캡처된 프롬프트 텍스트에 `known-counter-relevant-id`가 포함된다(Skeptic에게 실제로
  전달되었음을 확인 — 모델이 그것을 `counterEvidenceIds`로 선택했는지는 이 AC의 범위 밖이며
  design.md §4.3 해석표와 실 Gemini smoke 리포트가 그 이후를 다룬다).

**AC-EVIDENCE-016d** (REQ-EVIDENCE-019, REQ-EVIDENCE-020, over-claim 방지 + replay 조건부 서술)
- Given: M3 산출물(design.md §4.3 해석표를 채운 진단 노트, `.moai/reports/`) 전체
- When: "배제"/"excluded"/"제외됨" 등의 표현과 "counterEvidenceIds"/"A/B/C"가 같은 문장·인접
  문장에 등장하는 부분을 grep·육안으로 검토한다
- Then: (a) "fixture에서 A/B가 확인됐으므로 실제 smoke의 A/B가 배제된다"는 취지의 문장이
  존재하지 않는다. (b) design.md §4.4의 replay 전제조건(실제 smoke의 case/query snapshot 보존·
  재현 가능 여부)이 충족되지 않았다면, 문서에 "corpus/Retriever/prompt/model behavior 미확정"이
  그대로 유지되어 있다 — 충족됐다면 실제 replay 결과(§4.4)가 별도로 기록되어 있고 그 결과만
  실제 smoke의 원인 서술 근거로 쓰인다.

**AC-EVIDENCE-017** (REQ-EVIDENCE-021)
- Given: `evidenceType`이 `PRECEDENT`인 모든 production evidence의 `content` 필드
- When: "지급 확정"/"지급 확률"/"확정 보험금"/"무조건 지급" 등 SPEC-GEMINI-RUNTIME-001의 금지
  표현 패턴과 "이 사건에 그대로 적용된다"류 자동 적용 단정 표현을 검사한다
- Then: 매치가 0건이다.

**AC-EVIDENCE-018** (REQ-EVIDENCE-022)
- Given: `db/seed/evidence.json`의 모든 레코드와 design.md §6 `isDuplicate()` 판정 함수
- When: 동일 `sourceUrl`을 가진 레코드 쌍마다(이 SPEC의 기본 구현, §1.2 — `sourceIdentifier`가
  추후 §1.2 조건을 만족해 추가된 경우에는 동일 `sourceIdentifier`를 가진 쌍도 포함) `isDuplicate()`를
  실행한다
- Then: `isDuplicate() === true`인 쌍이 0건이다(정규화된 `content`가 실질적으로 동일한 진짜
  중복이 없다는 뜻). **동일 source의 레코드가 같은 `issueTypes`를 공유하는 것 자체는 이 AC에서
  실패 조건이 아니다** — content가 다르면 중복이 아니다(design.md §6, 외부 독립 리뷰 이슈 6).

**AC-EVIDENCE-019** (REQ-EVIDENCE-023)
- Given: M1~M5 반영 이후의 전체 파이프라인과, 확장된 evidence corpus를 반환하는 결정론적 provider
- When: `runPipeline()`을 evidence가 있는 사건 1건으로 실행한다
- Then: `generateStructured()`의 논리적 호출 수가 정확히 3(Researcher 1 + Skeptic 1 + Verifier 1)이다
  — corpus 크기·candidate 개수 증가와 무관하게 SPEC-GEMINI-RUNTIME-001 AC-GEMINI-RUNTIME-023과
  동일한 계측 방식으로 확인.

**AC-EVIDENCE-020** (REQ-EVIDENCE-024)
- Given: SPEC-GEMINI-RUNTIME-001이 확립한 기존 테스트 스위트 전체(`researcher.test.ts`,
  `skeptic.test.ts`, `verifier.test.ts`, `index.test.ts`, `provider-factory.test.ts`,
  `rate-scheduler.test.ts`, e2e 4종)
- When: `pnpm test`와 `pnpm test:e2e`를 M1~M5 반영 이후 실행한다
- Then: 전부 기존과 동일하게 통과한다(0건 회귀) — query 격리, 위조 ID 차단, fail-closed,
  safety-validator, 프로세스 로컬 동시성, Gemini env 계약을 검증하는 기존 케이스가 전부 그린이다.

**AC-EVIDENCE-021** (REQ-EVIDENCE-025)
- Given: M1 신규 Drizzle migration 파일과 마이그레이션 적용 전/후의 `evidence` 테이블 스키마
- When: `pnpm db:migrate`를 빈 DB와 기존 10건이 있는 DB 양쪽에 실행한다
- Then: 두 경우 모두 오류 없이 완료되고, 기존 8개 컬럼과 기존 10건의 데이터가 변경되지 않으며,
  `issueTypes` 컬럼(M1이 확정하는 유일한 신규 컬럼, design.md §1.1)이 추가되어 있다(기존 행은
  `.default("[]")`에 의해 빈 배열). `sourceIdentifier`/`sourceDate`가 이 시점 스키마에 없음을
  함께 확인한다(design.md §1.2).

**AC-EVIDENCE-026** (REQ-EVIDENCE-005)
- Given: `db/seed/evidence.json`의 기존 10건(`seed-evidence-001`~`seed-evidence-010`)과
  `.moai/reports/evidence-source-audit-manifest.md`
- When: manifest에서 이 10개 `id`를 조회한다
- Then: 10건 전부에 대해 manifest에 (evidenceType, sourceUrl 접근 확인일, 원문 대조 결과,
  결정(유지/OTHER downgrade/제외), 검토자) 행이 존재한다 — 예외로 누락된 레코드가 없으며,
  `POLICY`로 분류된 `seed-evidence-001`/`seed-evidence-003`도 포함되어 있다.

## §C. 수동 검증 (자동화 불가 영역, 명시적 범위 밖)

이 SPEC은 corpus 큐레이션(M4, 신규 record + 기존 10건 재감사 모두)에서 개별 레코드의 원문-요약
정합성을 사람(또는 run-phase 에이전트의 개별 WebFetch)이 확인하는 수작업 절차에 의존한다
(design.md §5). 이 수작업 절차 자체는 자동화된 AC로 강제하지 않는다 — AC-EVIDENCE-002/017/018은
구조적으로 검증 가능한 부분(필드 존재, 금지 표현 부재, content 정규화 동일성)만 이진 판정하며,
"이 판례가 실제로 이렇게 판시했다"는 사실 자체의 진위는 자동화 테스트의 범위 밖이다.
AC-EVIDENCE-026은 그 수작업 검증의 **결과가 manifest에 기록되어 있는지**(검증 자체의 진위가
아니라 기록의 존재)만 확인한다 — 자동 테스트가 원문 대조 자체를 대신 수행한다고 주장하지 않는다.

## §D. 커버리지 매트릭스

25개 REQ(REQ-EVIDENCE-001~025) 중 REQ-EVIDENCE-019만 4개 AC(016a/b/c/d)에
대응하고, REQ-EVIDENCE-013은 AC-008에, REQ-EVIDENCE-017은 AC-014에, REQ-EVIDENCE-020은
AC-016d에 통합 대응하며, 나머지는 1:1 대응 — 총 25개 AC(AC-001~021, 026). REQ 25개 / AC 25개,
Tier L 상한(각 25개)에 정확히 도달.
