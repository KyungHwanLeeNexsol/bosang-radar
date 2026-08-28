# SPEC-EVIDENCE-001 — 인수 기준 (acceptance.md)

## §A. 개요

각 AC는 원칙적으로 정확히 1개의 `REQ-EVIDENCE-XXX`를 검증한다. REQ-EVIDENCE-016(A/B/C 진단)만
세 단계 각각에 대응하는 3개의 서브레터 AC로 나눈다(design.md §4.1의 "무엇을 자동화하고 무엇을
하지 않는가" 경계를 AC 단위로도 그대로 반영하기 위함). 실제 Gemini API를 호출하는 자동화 테스트는
없다 — 결정론적 fake/mock provider만 사용한다. `db/seed/evidence.json`의 실제 출처 검증(원문
대조)은 자동화 불가능한 수작업 절차(design.md §5)이므로, 해당 AC는 "구조적으로 검증 가능한
부분"(예: `sourceUrl`/`sourceIdentifier` 존재 여부)만 이진 판정한다 — 이는 verification-claim-integrity
원칙("관측하지 않은 것을 관측했다고 주장하지 않는다")을 AC 설계에도 그대로 적용한 것이다.

## §B. AC 매트릭스 (Given-When-Then)

**AC-EVIDENCE-001** (REQ-EVIDENCE-001)
- Given: `.moai/specs/SPEC-EVIDENCE-001/`(또는 `.moai/docs/`) 내 coverage matrix 문서
- When: 문서를 검토한다
- Then: 두 담보(`INJURY_DISABILITY`/`DISEASE_DISABILITY`) × 8개 `QueryIssueType` 전체 16개 셀이
  표에 존재하고, 각 셀에 현재 건수와 목표 건수가 명시되어 있으며, evidenceType별 목표 건수가
  이 matrix에서 도출된 값임을 문서 내에서 설명한다(임의 균등배분 문구가 없음).

**AC-EVIDENCE-002** (REQ-EVIDENCE-002)
- Given: `db/seed/evidence.json`의 `evidenceType`이 `PRECEDENT`/`STATUTE`/`DISPUTE_CASE`/`POLICY`인
  모든 레코드
- When: 각 레코드의 `sourceUrl` 또는 `sourceIdentifier` 필드를 검사한다
- Then: 전부 `null`이 아닌 값을 가진다(구조적 최소 검증 — 원문 내용 대조는 M4 수작업 절차의 몫이며
  이 AC의 범위 밖임을 명시).

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

**AC-EVIDENCE-005** (REQ-EVIDENCE-005)
- Given: `lib/db/schema.ts`에 추가된 신규 컬럼 목록과 `lib/pipeline/evidence-retriever.ts`/benchmark
  채점 코드
- When: 각 신규 컬럼을 실제로 읽는 코드 경로를 grep으로 확인한다
- Then: `issueTypes`는 `evidence-retriever.ts`의 score 함수에서 소비되고, `keywords`는 이번
  milestone에서 스키마에 추가되지 않았음을 확인한다(research.md §4 "보류" 결정과 일치) — 소비
  코드 경로가 없는 컬럼이 존재하지 않는다.

**AC-EVIDENCE-006** (REQ-EVIDENCE-006)
- Given: `EvidenceCandidate.issueTypes` 타입 정의
- When: TypeScript 컴파일러로 타입을 확인한다
- Then: `issueTypes`의 타입이 `QueryIssueType[]`(8개 리터럴 유니온의 배열)이며, 사건별 판정이
  아니라 evidence 레코드 자신의 정적 분류임이 타입 주석에 명시되어 있다.

**AC-EVIDENCE-007** (REQ-EVIDENCE-007)
- Given: `lib/db/schema.ts`, `lib/pipeline/types.ts` 전체
- When: `claimant`/`insurer`/`stance`/`argumentRole` 등 관점 라벨 관련 필드명을 grep한다
- Then: 매치가 0건이다.

**AC-EVIDENCE-008** (REQ-EVIDENCE-008)
- Given: `issueTypes`에 query와 동일한 issueType을 가진 evidence A와, 키워드만 우연히 1개 겹치고
  `issueTypes`는 다른(또는 빈) evidence B
- When: 동일 query로 `retrieveEvidence()`를 호출한다
- Then: A의 score가 B의 score보다 높고, 정렬된 후보 목록에서 A가 B보다 앞에 온다.

**AC-EVIDENCE-009** (REQ-EVIDENCE-009)
- Given: design.md §3의 curated benchmark 케이스 최소 1건에 "무관하지만 키워드 하나가 우연히
  겹치는 evidence"를 의도적으로 포함한 회귀 fixture
- When: 그 벤치마크 케이스를 실행한다
- Then: 그 무관 evidence가 known-relevant 목록에 없는 evidence 중 top-5 안에 실제 relevant
  evidence보다 높은 순위로 들어오지 않는다.

**AC-EVIDENCE-010** (REQ-EVIDENCE-010)
- Given: `evidence-retriever.ts`의 `TOP_N` 상수
- When: M2 benchmark 측정 결과 문서를 확인한다
- Then: `TOP_N`이 5로 유지되었거나, 변경되었다면 그 변경이 M2 baseline 대비 개선 수치를 근거로
  들고 있다 — 근거 문서 없이 값만 바뀐 diff가 아니다.

**AC-EVIDENCE-011** (REQ-EVIDENCE-011)
- Given: score가 동점인 evidence 후보 2건 이상을 포함하는 고정 evidence corpus
- When: `retrieveEvidence()`를 동일 입력으로 3회 연속 호출한다
- Then: 3회 모두 정확히 동일한 순서의 배열을 반환하며, 동점 evidence 간 순서는 `id` 오름차순과
  일치한다.

**AC-EVIDENCE-012** (REQ-EVIDENCE-012)
- Given: `evidence-retriever.benchmark.test.ts`의 벤치마크 케이스 목록
- When: 케이스의 `query.domain`/`query.issueType` 조합을 집계한다
- Then: 두 담보 각각에서 CAUSATION/DISABILITY_GRADE_CRITERIA/DIAGNOSIS 또는
  DISABILITY_LOCATION 조합이 최소 1건씩 존재하고, `PRE_EXISTING_CONDITION` 케이스가 최소 1건
  존재한다(총 7건 이상).

**AC-EVIDENCE-013** (REQ-EVIDENCE-013)
- Given: 모든 벤치마크 케이스의 `knownRelevantEvidenceIds`
- When: 그 ID 집합을 `db/seed/evidence.json`의 실제 `id` 집합과 대조한다
- Then: 전부 실제 production evidence corpus에 존재하는 `id`이며, 벤치마크 전용으로 새로 만든
  가상의 `id`가 하나도 없다.

**AC-EVIDENCE-014** (REQ-EVIDENCE-014)
- Given: M2에서 측정한 baseline(issueType 가중치 적용 전) Recall@5/Hit@5와 개선 후 수치
- When: `.moai/reports/`의 측정 기록 문서를 확인한다
- Then: baseline 수치가 개선 후 수치보다 먼저 기록되어 있고, acceptance threshold(예: "평균
  Recall@5가 baseline 대비 X%p 이상 개선")가 이 두 실측값 이후에 문서 내 별도 절에서 도출됨을
  확인한다(수치가 baseline 측정 이전에 미리 박혀 있지 않다).

**AC-EVIDENCE-015** (REQ-EVIDENCE-015)
- Given: 이 SPEC의 acceptance.md 전체와 `evidence-diagnostic.test.ts`
- When: "counterEvidenceIds"를 grep한다
- Then: "빈 배열이면 FAIL" 또는 "최소 1개 필요"라는 취지의 강제 조건이 어디에도 없다 — 모든 관련
  단언은 A/B/C 구분(§016a/b/c)에 대한 것이지 counterEvidenceIds 자체의 비어있음 여부에 대한 것이
  아니다.

**AC-EVIDENCE-016a** (REQ-EVIDENCE-016, stage A)
- Given: `evidence-diagnostic.test.ts`의 고정 fixture evidence corpus
- When: 그 corpus에서 미리 지정한 `known-counter-relevant-id`를 검색한다
- Then: 그 id가 fixture corpus 안에 실제로 존재한다(corpus 자체에 counter-relevant evidence가
  없는 경우가 아님을 확인).

**AC-EVIDENCE-016b** (REQ-EVIDENCE-016, stage B)
- Given: 위 fixture corpus와 그 evidence를 relevant로 만드는 고정 `ResearchQuery`
- When: `retrieveEvidence()`를 실행한다
- Then: 반환된 후보 목록(해당 query의 값)에 `known-counter-relevant-id`가 포함된다(top-K 탈락이
  아님을 확인).

**AC-EVIDENCE-016c** (REQ-EVIDENCE-016, stage C-전제조건)
- Given: 위 후보 목록을 입력받는 `challenge()`와, 전달된 프롬프트 텍스트를 캡처하는 결정론적
  fake provider
- When: `challenge()`를 실행한다
- Then: 캡처된 프롬프트 텍스트에 `known-counter-relevant-id`가 포함된다(Skeptic에게 실제로
  전달되었음을 확인 — 모델이 그것을 `counterEvidenceIds`로 선택했는지는 이 AC의 범위 밖이며
  design.md §4.3 해석표와 실 Gemini smoke 리포트가 그 이후를 다룬다).

**AC-EVIDENCE-017** (REQ-EVIDENCE-017)
- Given: `evidenceType`이 `PRECEDENT`인 모든 production evidence의 `content` 필드
- When: "지급 확정"/"지급 확률"/"확정 보험금"/"무조건 지급" 등 SPEC-GEMINI-RUNTIME-001의 금지
  표현 패턴과 "이 사건에 그대로 적용된다"류 자동 적용 단정 표현을 검사한다
- Then: 매치가 0건이다.

**AC-EVIDENCE-018** (REQ-EVIDENCE-018)
- Given: `db/seed/evidence.json`의 모든 레코드
- When: 동일 `sourceUrl`(또는 동일 `sourceIdentifier`)을 가진 레코드 그룹을 집계한다
- Then: 같은 그룹 내 레코드들의 `issueTypes` 교집합이 비어 있다(같은 source에서 나온 레코드는
  서로 다른 issueType을 다뤄야 하며, 완전히 동일한 issueType 조합의 중복 레코드가 없다).

**AC-EVIDENCE-019** (REQ-EVIDENCE-019)
- Given: M1~M5 반영 이후의 전체 파이프라인과, 확장된 evidence corpus를 반환하는 결정론적 provider
- When: `runPipeline()`을 evidence가 있는 사건 1건으로 실행한다
- Then: `generateStructured()`의 논리적 호출 수가 정확히 3(Researcher 1 + Skeptic 1 + Verifier 1)이다
  — corpus 크기·candidate 개수 증가와 무관하게 SPEC-GEMINI-RUNTIME-001 AC-GEMINI-RUNTIME-023과
  동일한 계측 방식으로 확인.

**AC-EVIDENCE-020** (REQ-EVIDENCE-020)
- Given: SPEC-GEMINI-RUNTIME-001이 확립한 기존 테스트 스위트 전체(`researcher.test.ts`,
  `skeptic.test.ts`, `verifier.test.ts`, `index.test.ts`, `provider-factory.test.ts`,
  `rate-scheduler.test.ts`, e2e 4종)
- When: `pnpm test`와 `pnpm test:e2e`를 M1~M5 반영 이후 실행한다
- Then: 전부 기존과 동일하게 통과한다(0건 회귀) — query 격리, 위조 ID 차단, fail-closed,
  safety-validator, 프로세스 로컬 동시성, Gemini env 계약을 검증하는 기존 케이스가 전부 그린이다.

**AC-EVIDENCE-021** (REQ-EVIDENCE-021)
- Given: 신규 Drizzle migration 파일과 마이그레이션 적용 전/후의 `evidence` 테이블 스키마
- When: `pnpm db:migrate`를 빈 DB와 기존 10건이 있는 DB 양쪽에 실행한다
- Then: 두 경우 모두 오류 없이 완료되고, 기존 8개 컬럼과 기존 10건의 데이터가 변경되지 않으며,
  신규 3개 컬럼이 추가되어 있다(신규 컬럼 값은 기존 행에 대해 스키마 기본값 또는 `null`).

## §C. 수동 검증 (자동화 불가 영역, 명시적 범위 밖)

이 SPEC은 corpus 큐레이션(M4)에서 개별 레코드의 원문-요약 정합성을 사람(또는 run-phase
에이전트의 개별 WebFetch)이 확인하는 수작업 절차에 의존한다(design.md §5). 이 수작업 절차
자체는 자동화된 AC로 강제하지 않는다 — AC-EVIDENCE-002/017/018은 구조적으로 검증 가능한
부분(필드 존재, 금지 표현 부재, 중복 없음)만 이진 판정하며, "이 판례가 실제로 이렇게 판시했다"는
사실 자체의 진위는 자동화 테스트의 범위 밖이다.

## §D. 커버리지 매트릭스

21개 REQ(REQ-EVIDENCE-001~021) 중 REQ-EVIDENCE-016만 3개 AC(016a/b/c)에 대응하고 나머지는
1:1 대응 — 총 23개 AC. Tier L REQ/AC 상한(각 25개) 이내.
