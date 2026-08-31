# SPEC-EVIDENCE-001 — plan.md

## §A. 접근 방식 (Approach)

**Route(외부 독립 리뷰 이슈 8 반영)**: Tier L이므로 main-direct(Route A)를 plan-phase 시점에
사전 고정하지 않는다. 이 저장소의 최근 SPEC(SPEC-GEMINI-RUNTIME-001)이 Tier L에서 feature
branch + PR(Route B, PR #4)을 실제로 사용한 선례가 있으므로, **feature branch + PR을 기본
권고안**으로 제시한다 — 이 SPEC은 이미 `plan/SPEC-EVIDENCE-001` 브랜치에서 plan-phase 작업을
진행 중이며, run-phase는 `feat/SPEC-EVIDENCE-001` 브랜치로 이어가는 것이 자연스럽다. 다만 이는
제품 로직 blocker가 아니다 — 실제 repo workflow 정책(`git-strategy.yaml` 등)과 사용자 선택에
따라 run-phase 착수 시점에 main-direct로 전환해도 무방하며, 그 결정은 이 문서가 강제하지 않는다.

6개 milestone을 순차 실행하되, M2는 **exploratory(10건 corpus)** 단계와 M4 이후의 **frozen 최종
비교** 단계로 나뉜다(design.md §3.4, 외부 독립 리뷰 이슈 2) — 두 효과(ranking 알고리즘 개선 vs
corpus 확장)를 혼합하지 않기 위한 의도적 순서다. corpus 큐레이션(M4)은 실제 웹 조사 도구가 있는
세션에서 수행해야 하므로, M1~M3(스키마/알고리즘/진단 인프라)을 먼저 끝내 "10건짜리 corpus로도
새 인프라가 정상 동작함"을 검증한 뒤 M4로 넘어간다 — corpus 확장이 실패하거나 지연되어도 M1~M3의
가치(스키마, candidate eligibility, 진단 장치)는 이미 확보된 상태를 유지한다.

## §A.5 PRESERVE 목록 (변경 금지 대상)

- `lib/pipeline/{researcher,skeptic,verifier}.ts`의 evidence-ID 계약(격리, `supportingEvidenceIds>=1`,
  위조 ID 차단, fail-closed) — REQ-EVIDENCE-024
- `lib/ai/{provider-factory,rate-scheduler}.ts`, `lib/ai/providers/{gemini,deterministic}.ts` —
  SPEC-GEMINI-RUNTIME-001 계약 전체(모델/RPM budget/동시성) 무변경
- `lib/pipeline/index.ts`의 논리적 호출 수(3회) — REQ-EVIDENCE-023
- `evidence` 테이블의 기존 8개 컬럼과 `id` 기준 upsert idempotency — REQ-EVIDENCE-004, REQ-EVIDENCE-025
- `lib/pipeline/boundary.test.ts`(형제 단계 모듈 간 직접 import 금지 경계)

## §B. 마일스톤

### M1 — Coverage matrix 정의 + Evidence 스키마 마이그레이션 (`issueTypes`만)

- 담보(2) × issueType(8) 16칸 coverage matrix를 작성하고 현재(대부분 0건) 상태를 기록 — 실제
  발생하지 않는 조합은 `N/A`로 명시(design.md §7, REQ-EVIDENCE-001 개정).
- **run-phase 착수 조건 재확인(spec.md §5 잔여 위험)**: 이 milestone 시작 시점에 WebSearch/WebFetch
  또는 등록된 `law.go.kr` OC 키 등 실제 웹 조사 도구 가용성을 확인한다 — 가용하지 않으면 M4(corpus
  큐레이션)를 별도 세션으로 미루고 M1~M3/M5는 그대로 진행한다(corpus 큐레이션이 다른 milestone을
  막지 않도록 설계, design.md §0).
- `lib/db/schema.ts`에 `issueTypes` 컬럼 1개만 추가(design.md §1.1) — `sourceIdentifier`/
  `sourceDate`는 M1에 포함하지 않는다(design.md §1.2, REQ-EVIDENCE-006/027(027은 v0.2.0 당시 병합되어 폐기된 구 번호) 통합 조항). `drizzle-kit
  generate`로 migration 파일 생성.
- `lib/pipeline/types.ts` `EvidenceCandidate`에 `issueTypes` 추가, `scripts/db-seed.ts`
  `EvidenceSeedRecord`/upsert 확장(`issueTypes` 1개 필드만). 이때 `QueryIssueType` 8개 값을
  `QUERY_ISSUE_TYPES` const로부터 파생시키고(design.md §1.4a), `db/seed/evidence-seed-schema.ts`의
  zod enum이 이 const를 import해서 쓰도록 해 8개 값의 이중 하드코딩을 없앤다(optional, 외부
  독립 리뷰 잔여 정합성 이슈 4).
- 기존 10건 seed에 `issueTypes: []`(또는 명백히 판별 가능한 경우 실제 값)를 채워 재실행 —
  `pnpm db:seed` idempotency 회귀 테스트(REQ-EVIDENCE-004).

### M2 — Candidate Eligibility A/B 비교 + Ranking + Benchmark 인프라 (exploratory, 10건 corpus)

- `evidence-retriever.ts`에 전략 A(현행)/전략 B(최소 확장안, design.md §2.1) 두 구현을 준비하고,
  score 함수에 issueType 가중치(design.md §2.2) + tie-break(§2.3) 추가.
- `evidence-retriever.benchmark.test.ts` 신설, 최소 7개 벤치마크 케이스(design.md §3.2) 정의 —
  이 시점 corpus(10건, M1에서 issueTypes 채워진 상태)만으로도 실행 가능해야 하며, "known-relevant
  evidence가 exact issueType이지만 keyword가 없는" 케이스를 최소 1건 포함(REQ-EVIDENCE-013).
- **M2 corpus 불변성(design.md §3.1a, 외부 독립 리뷰 측정방법론 이슈 2)** — 이 milestone은 `[M2
  EXPLORATORY]` 섹션의 corpus 소스로 `db/seed/evidence-m2-snapshot.json`(M2 당시 10건 고정
  스냅샷, 이후 절대 수정 금지)을 별도로 생성해 사용할 것을 요구한다. `evidence-retriever.benchmark.test.ts`의
  `[M2 EXPLORATORY]` 섹션은 mutable production `db/seed/evidence.json`을 직접 import해서는 안
  된다 — M4 이후 production corpus가 확장되어도 이 섹션의 exploratory 측정 수치가 조용히 바뀌지
  않도록 하기 위함이다. production `evidence.json`은 `[M5 REGRESSION]`/`[M4d FINAL]` 섹션
  전용으로 남긴다(acceptance.md AC-EVIDENCE-014 참고).
- 전략 A vs 전략 B(+ score 함수 적용) Recall@5/Hit@5를 **exploratory baseline**으로 측정·기록
  (design.md §3.4 1단계) — 이 수치는 알고리즘 방향(어느 전략을 채택할지)만 결정하며, 최종
  acceptance threshold의 근거로 직접 쓰지 않는다.
- 이 exploratory 측정 결과를 근거로 채택 전략(A 또는 B)을 확정하고 `evidence-retriever.ts`에
  구현한다. top-K(5) 조정 필요성도 이 시점에 재검토 — 벤치마크가 정당화하지 못하면 5 유지.

### M3 — counterEvidenceIds=[] 진단 fixture (harness self-test — 실제 smoke 원인 판정 아님)

- `evidence-diagnostic.test.ts` 신설(design.md §4.2) — A/corpus 존재, B/Retriever 후보 포함,
  C-전제조건/Skeptic 프롬프트 포함 3개 테스트.
- design.md §4.3 해석표를 실제 fixture 실행 결과로 채워 progress.md에 기록하되, **이 결과는
  fixture 진단 harness 자체의 self-test 결과로만 서술한다** — "A/B는 fixture로 배제됨 → 남은
  후보는 C/D"라는 문구는 어떤 문서에도 남기지 않는다(외부 독립 리뷰 이슈 3, REQ-EVIDENCE-019).
- design.md §4.4의 production snapshot replay 전제조건(실제 smoke가 쓴 de-identified case/query가
  안전하게 보존·재현 가능한지)을 확인한다. 조건을 만족하면 replay를 수행해 실제 smoke의 A/B를
  직접 관측하고 그 결과를 기록한다(REQ-EVIDENCE-020). 조건을 만족하지 못하면(가장 유력한 경우 —
  이번 plan-phase 시점에는 그런 snapshot이 별도로 보존되어 있다는 근거가 없다), `.moai/reports/`에
  "fixture harness는 정상 동작 확인(self-test), 실제 smoke 원인은 corpus/Retriever/prompt/model
  behavior 미확정으로 유지"라고 정직하게 기록하고 M3를 종료한다.

### M4 — Corpus 큐레이션: 기존 10건 재감사 + 신규 확장 + frozen algorithm/corpus effect 측정

- **4a. 기존 10건 재감사(design.md §5.2/§5.3, REQ-EVIDENCE-005, 외부 독립 리뷰 이슈 5/3)** — 신규
  확장에 **앞서** 먼저 수행한다: 10건 전부에 대해 (i) sourceUrl 접근성/원문 대조/content 과장
  여부와 (ii) `issueTypes` 배열이 실제 담보-쟁점 분류를 올바르게 반영하는지를 함께 검토하고,
  (i)을 통과하지 못한 레코드는 `OTHER` downgrade 또는 제외를 명시적으로 결정한다. 이 결과(source
  검토 + issueTypes 검토)를 `.moai/reports/evidence-source-audit-manifest.md`(design.md §5.3의
  확장된 6-컬럼 형식)에 기록한다 — POLICY/STATUTE/PRECEDENT 레코드도 예외 없이 포함. 모든
  issueType을 무조건 부여하는 과도한 tagging은 금지하며, 빈 `issueTypes`는 사유를 manifest에
  기록한다(design.md §5.3).
- **4b. 신규 record 확장(design.md §5.1/§5.1a)** — coverage matrix 공백(N/A 아닌 셀)을 실제 검증
  가능한 출처로 채운다 — 공식 원문 > 공식기관 공개 요약 > 신뢰 가능한 2차 출처 순으로 우선하며,
  2차 출처를 쓸 수밖에 없는 경우 manifest에 사유를 기록한다(design.md §5.1a). 목표 50~100건
  (4a에서 줄어든 유효 corpus 기준으로 재산정 가능), 검증 가능한 출처가 그에 못 미치면 미달 상태로
  정직하게 보고하고 억지로 채우지 않는다(REQ-EVIDENCE-002가 우선). 각 신규 레코드도 4a와 동일하게
  source 검토 + issueTypes 검토를 manifest에 기록한다. **`DISPUTE_CASE` evidenceType 도입은
  best-effort 목표다(v0.7.0 → v0.8.0, 사용자 승인 downgrade)** — 텍스트 추출 가능한 공식 출처를
  확보할 수 있으면 최소 1건 이상 도입을 시도하되, 선의의 조사 끝에도(확보 시도 및 결론은
  progress.md §M Fix7/§O 참고) 텍스트 추출 가능한 형식의 공식 출처를 확보하지 못하면 **0건도 이
  목표를 만족하는 종료 상태로 인정한다**. 사건번호·결정번호를 지어내거나 텍스트 추출 불가능한
  바이너리를 근거 없이 "확보"로 간주해서는 안 된다(REQ-EVIDENCE-002 위반 금지는 무변경). 도구가
  개선되면(예: HWP 텍스트 추출 유틸리티, 유료 판례 DB 접근) 후속 세션에서 이 목표를 다시 시도할
  수 있다 — 이 downgrade는 blocking 상태만 해제할 뿐 목표 자체를 삭제하지 않는다.
- **4c. Benchmark ground truth 갱신 + freeze(design.md §3.4A, REQ-EVIDENCE-015, REQ-EVIDENCE-017)** — 4a/4b가
  끝나 corpus가 안정되면, 각 `BenchmarkCase`의 query에 대해 freeze 대상 production corpus
  **전체**를 검토하여 relevant로 판정된 evidence — source 검토와 issueTypes 검토를 모두
  통과한(authenticated) evidence만 — 의 **complete** 집합으로 `knownRelevantEvidenceIds`를
  사람이 검토(human review)해 확정하고 **freeze**한다(더 이상 수정하지 않는 고정 버전으로 커밋).
  일부 예시적 evidence만 반영해서는 안 되며(외부 독립 리뷰 잔여 정합성 이슈 2), 이 completeness
  검토가 없는 BenchmarkCase는 Precision@5를 최종 acceptance 근거로 쓰지 않는다. ground truth는
  manifest(4a)에서 "유지"로 결정된 evidence id만 참조할 수 있다.
- **4d. Algorithm effect 측정(design.md §3.4A)** — freeze된 **동일** corpus/벤치마크 위에서
  benchmark-only true old-main baseline(예: `trueBaselineRetrieveEvidence()` — design.md §3.4A가
  예시로 드는 benchmark 전용 순수 헬퍼, production 코드 경로에는 존재하지 않음)와 production
  `retrieveEvidence(strategy="B")`(M2가 채택한 전략 B + `computeScore()`, design.md §2.1/§2.2)를
  동일 입력으로 실행해 Recall@5/Hit@5/Precision@5(design.md §3.3a)를 비교한다. corpus는
  두 실행 모두 동일하고 알고리즘만 바뀌므로 이것은 "algorithm effect"이며, acceptance.md의
  threshold AC 확정 근거다(REQ-EVIDENCE-016) — M2 exploratory 수치를 threshold 근거로 재사용하지
  않는다. 실측 결과가 REQ-EVIDENCE-016의 기본 PASS 조건(new Recall/Hit/Precision ≥ baseline +
  REQ-EVIDENCE-013 target case hit)을 만족하지 못하면, threshold를 결과에 맞춰 자동으로 낮추지 않는다 —
  score 파라미터 재조정 또는 trade-off 수용 근거를 design exception으로 `.moai/reports/`와
  progress.md에 기록하고, 그렇게 완화된 acceptance 계약은 다시 plan-auditor 재검토를 거친다
  (design.md §3.3b, 외부 독립 리뷰 잔여 정합성 이슈 1).
- **4e. Corpus expansion effect 측정(design.md §3.4B)** — M1 시점(초기, 10건) corpus 스냅샷과 4c의
  freeze 시점(최종, N건) corpus 사이의 coverage delta(domain × issueType authenticated coverage
  matrix, 빈 cell 수, ground truth 존재 query 비율)를 기록한다 — cross-corpus Recall@5 직접
  비교로 corpus 확장 효과를 주장하지 않는다(design.md §3.4B). 4d(algorithm effect)와 4e(corpus
  expansion effect)는 `.moai/reports/`에 서로 다른 항목으로 기록한다(REQ-EVIDENCE-017).

### M5 — 회귀 검증

- REQ-EVIDENCE-023, REQ-EVIDENCE-024 전체(Researcher/Skeptic/Verifier 1/1/1 호출, query 격리, 위조 ID 차단,
  fail-closed, safety-validator, deterministic E2E, 프로세스 로컬 동시성, Gemini env 계약) —
  기존 SPEC-GEMINI-RUNTIME-001 테스트 스위트가 그대로 통과하는지 확인.
- 신규 fabrication guard 테스트(REQ-EVIDENCE-002/003) — production evidence.json에 대해 (a)
  `evidenceType`이 PRECEDENT/STATUTE/DISPUTE_CASE/POLICY인 레코드는 전부 `sourceUrl` 또는
  `sourceIdentifier` 중 하나 이상을 가져야 한다는 최소 구조 검증(실제 원문 대조는 자동화 불가 —
  M4a/4b의 수작업 절차 + manifest가 이미 담당, 이 테스트는 "출처 미상 채로 PRECEDENT로 분류되는
  것"만 기계적으로 차단하며 authenticity PASS를 주장하지 않는다 — 외부 독립 리뷰 이슈 5).
- 신규 dedup 테스트(REQ-EVIDENCE-022 개정, design.md §6) — 동일 `sourceUrl`(이 SPEC의 기본 구현,
  §1.2) + 정규화된 content 동일성 기준으로 중복을 탐지하는지 검증한다. `sourceIdentifier`는 이
  SPEC의 기본안에 포함되지 않으므로 이 테스트의 기본 판정 기준이 아니다(외부 독립 리뷰 잔여
  정합성 이슈 3) — §1.2 조건을 만족해 추후 추가되는 경우, 그 시점에 동일 `sourceIdentifier`
  기준도 함께 검증하도록 테스트를 확장한다.
- REQ-EVIDENCE-010(무관 evidence가 키워드 하나로 상위 회귀) 벤치마크 케이스 신설.

### M6 — 문서/마무리

- coverage matrix 최종본 + M2 exploratory 결과 + M4d algorithm effect 결과 + M4e corpus expansion
  effect 결과 + M3 진단 노트를 하나의 요약 문서로 `.moai/docs/` 또는 `.moai/reports/`에 정리 —
  algorithm effect와 corpus expansion effect를 분리해 서술한다(design.md §3.4).
- CHANGELOG 갱신(manager-docs 영역 — 이 SPEC의 sync-phase에서 수행, plan-phase 범위 아님).
- `pnpm test`/`lint`/`format:check`/`build`/`test:e2e` 전체 통과 확인.

## §C. 사전 점검 (Pre-flight)

```bash
git branch --show-current
git rev-parse HEAD
pnpm test lib/pipeline/evidence-retriever.test.ts   # 기존 baseline 통과 확인
grep -c '"id"' db/seed/evidence.json                 # 현재 10건 확인
```

## §D. 위험 (Risks)

spec.md §5와 동일 — (1) corpus 확장 규모가 웹 조사 도구 가용성에 의존, (2) counterEvidenceIds=[]
원인이 여전히 미확정(model behavior)으로 남을 가능성 — M3의 replay 전제조건이 충족되지 않으면
이 SPEC이 끝나도 미확정 상태 그대로일 수 있다, (3) issueType eligibility/ranking이 기존
벤치마크(있다면) 순위를 바꿀 부작용, (4) M4a 재감사로 기존 corpus가 오히려 줄어들 수 있음(spec.md
§5), (5) frozen benchmark 재실행 비용 — M4를 여러 번 나누어 하면 freeze도 여러 번 반복돼야 하므로
큰 배치로 묶는 것이 바람직. 추가: (6) M2의 threshold AC는 M4d(frozen 최종 비교)가 끝나야 확정되므로,
acceptance.md는 "측정 후 확정" 상태로 plan-auditor에 제출된다 — 이는 REQ-EVIDENCE-016의 명시적
설계(임의 목표 선정 금지, exploratory와 frozen 분리)이며 결함이 아니다.
