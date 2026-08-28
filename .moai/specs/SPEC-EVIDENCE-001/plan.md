# SPEC-EVIDENCE-001 — plan.md

## §A. 접근 방식 (Approach)

Route A(Hybrid Trunk main-direct)를 따른다 — `main`에 직접 커밋하며 별도 PR을 열지 않는다(Tier
L이지만 이 저장소는 1인 운영 관례를 그대로 유지, SPEC-GEMINI-RUNTIME-001의 PR #4 관례는 외부
독립 리뷰 요청이 있었던 예외였다 — 이번 SPEC은 PR 요청이 없으므로 기본 관례로 돌아간다). 6개
milestone을 순차 실행하며, corpus 큐레이션(M4)은 실제 웹 조사 도구가 있는 세션에서 수행해야
하므로 M1~M3(스키마/알고리즘/진단 인프라)을 먼저 끝내 "10건짜리 corpus로도 새 인프라가 정상
동작함"을 검증한 뒤 M4로 넘어간다 — corpus 확장이 실패하거나 지연되어도 M1~M3의 가치(스키마,
ranking, 진단 장치)는 이미 확보된 상태를 유지한다.

## §A.5 PRESERVE 목록 (변경 금지 대상)

- `lib/pipeline/{researcher,skeptic,verifier}.ts`의 evidence-ID 계약(격리, `supportingEvidenceIds>=1`,
  위조 ID 차단, fail-closed) — REQ-EVIDENCE-020
- `lib/ai/{provider-factory,rate-scheduler}.ts`, `lib/ai/providers/{gemini,deterministic}.ts` —
  SPEC-GEMINI-RUNTIME-001 계약 전체(모델/RPM budget/동시성) 무변경
- `lib/pipeline/index.ts`의 논리적 호출 수(3회) — REQ-EVIDENCE-019
- `evidence` 테이블의 기존 8개 컬럼과 `id` 기준 upsert idempotency — REQ-EVIDENCE-004/021
- `lib/pipeline/boundary.test.ts`(형제 단계 모듈 간 직접 import 금지 경계)

## §B. 마일스톤

### M1 — Coverage matrix 정의 + Evidence 스키마 마이그레이션

- 담보(2) × issueType(8) coverage matrix를 작성하고 현재(대부분 0건) 상태를 기록.
- **run-phase 착수 조건 재확인(spec.md §5 잔여 위험)**: 이 milestone 시작 시점에 WebSearch/WebFetch
  또는 등록된 `law.go.kr` OC 키 등 실제 웹 조사 도구 가용성을 확인한다 — 가용하지 않으면 M4(corpus
  큐레이션)를 별도 세션으로 미루고 M1~M3/M5는 그대로 진행한다(corpus 큐레이션이 다른 milestone을
  막지 않도록 설계, design.md §0).
- `lib/db/schema.ts`에 `issueTypes`/`sourceIdentifier`/`sourceDate` 컬럼 추가, `drizzle-kit generate`로
  migration 파일 생성.
- `lib/pipeline/types.ts` `EvidenceCandidate`에 `issueTypes` 추가, `scripts/db-seed.ts`
  `EvidenceSeedRecord`/upsert 확장.
- 기존 10건 seed에 `issueTypes: []`(또는 명백히 판별 가능한 경우 실제 값)를 채워 재실행 —
  `pnpm db:seed` idempotency 회귀 테스트(REQ-EVIDENCE-004).

### M2 — Retriever 쟁점 중심 Ranking + Benchmark 인프라

- `evidence-retriever.ts`에 issueType 가중치(design.md §2.2) + tie-break(§2.3) 추가.
- `evidence-retriever.benchmark.test.ts` 신설, 최소 7개 벤치마크 케이스(design.md §3.2) 정의 —
  이 시점 corpus(10건, M1에서 issueTypes 채워진 상태)만으로도 실행 가능해야 한다.
- baseline(issueType 가중치 적용 전) vs 개선 후 Recall@5/Hit@5 측정, `.moai/reports/`에 기록.
- 측정 결과를 근거로 acceptance.md의 threshold AC를 확정(REQ-EVIDENCE-014) — 이 milestone이
  끝나야 그 AC의 정확한 숫자가 정해진다는 점을 progress.md에 명시.
- top-K(5) 조정 필요성 재검토 — 벤치마크가 정당화하지 못하면 5 유지.

### M3 — counterEvidenceIds=[] 진단 fixture

- `evidence-diagnostic.test.ts` 신설(design.md §4.2) — A/corpus 존재, B/Retriever 후보 포함,
  C-전제조건/Skeptic 프롬프트 포함 3개 테스트.
- design.md §4.3 해석표를 실제 fixture 실행 결과로 1행 채워 progress.md에 기록(A✅/B✅/C-전제✅
  가 이 시점 기대값 — corpus에 counter-relevant evidence를 의도적으로 배치했으므로).
- 이 fixture와 두 실 Gemini smoke 리포트(`gemini-smoke-20260827.md`,
  `gemini-runtime-smoke-20260828.md`)를 상호 참조하는 짧은 진단 노트를 `.moai/reports/`에 추가 —
  "A/B/C 중 A와 B는 fixture로 배제됨, 남은 후보는 C(모델 선택) 또는 D(smoke가 쓴 실제 사건에는
  fixture와 달리 counter-relevant evidence가 corpus에 없었을 가능성)"임을 명시.

### M4 — Corpus 큐레이션 (실제 공개 출처 조사, 별도 세션 가능)

- design.md §5 워크플로에 따라 coverage matrix 공백을 실제 검증 가능한 출처로 채운다 — 목표
  50~100건, 하지만 검증 가능한 출처가 그에 못 미치면 미달 상태로 정직하게 보고하고 억지로
  채우지 않는다(REQ-EVIDENCE-002가 우선).
- 각 신규 레코드는 `sourceUrl` + 가능하면 `sourceIdentifier`/`sourceDate`를 채운다.
- `DISPUTE_CASE` evidenceType을 최소 1건 이상 실제로 도입(현재 0건).
- 확장된 corpus로 M2의 benchmark를 재측정 — corpus 확장이 실제로 Recall@5를 개선하는지 확인.

### M5 — 회귀 검증

- REQ-EVIDENCE-019/020 전체(Researcher/Skeptic/Verifier 1/1/1 호출, query 격리, 위조 ID 차단,
  fail-closed, safety-validator, deterministic E2E, 프로세스 로컬 동시성, Gemini env 계약) —
  기존 SPEC-GEMINI-RUNTIME-001 테스트 스위트가 그대로 통과하는지 확인.
- 신규 fabrication guard 테스트(REQ-EVIDENCE-002/003) — production evidence.json에 대해 (a)
  `evidenceType`이 PRECEDENT/STATUTE/DISPUTE_CASE/POLICY인 레코드는 전부 `sourceUrl` 또는
  `sourceIdentifier` 중 하나 이상을 가져야 한다는 최소 구조 검증(실제 원문 대조는 자동화 불가 —
  M4의 수작업 절차가 이미 담당, 이 테스트는 "출처 미상 채로 PRECEDENT로 분류되는 것"만 기계적으로
  차단).
- REQ-EVIDENCE-009(무관 evidence가 키워드 하나로 상위 회귀) 벤치마크 케이스 신설.

### M6 — 문서/마무리

- coverage matrix 최종본 + benchmark baseline/개선 결과 + M3 진단 노트를 하나의 요약 문서로
  `.moai/docs/` 또는 `.moai/reports/`에 정리.
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
원인이 여전히 미확정(model behavior)으로 남을 가능성, (3) issueType ranking이 기존 벤치마크(있다면)
순위를 바꿀 부작용. 추가: (4) M2의 threshold AC가 M2 실행 전에는 확정되지 않으므로, acceptance.md는
"측정 후 확정" 상태로 plan-auditor에 제출된다 — 이는 REQ-EVIDENCE-014의 명시적 설계(임의 목표
선정 금지)이며 결함이 아니다.
