# SPEC-EVIDENCE-001 M4e — Corpus Expansion Coverage Delta

생성 일자: 2026-08-31
범위: M1(초기, 10건 all-zero) → 현재(21건, corpus 확장 완료)
REQ-EVIDENCE-017 준수: cross-corpus Recall@5 비교 **없음** — coverage matrix 델타만 기록

**이력**: 이 문서는 M4e 완료 시점에 작성된 원본과, 이후 4개 셀 오차를 별도의 패치
절로 덧붙여 정정한 패치본을 통합해 다시 계산한 단일 최종본이다. 옛 표와 패치 각주가
공존하던 이전 구조를 없애고, `db/seed/evidence.json`(21건)과
`lib/pipeline/evidence-retriever.benchmark.test.ts`의 `BENCHMARK_CASES`를 이 세션에서
직접 재조회해 모든 수치를 다시 산출했다.

---

## 1. corpus 건수 변화

| 단계 | 건수 | 비고 |
|------|------|------|
| M1 (초기 seed) | 10건 | seed-evidence-001~010, issueTypes 미배정 |
| M4 pilot | 19건 | seed-evidence-011~019 추가 (커밋 e68ba2b) |
| M4 full (M4c freeze) | 21건 | seed-evidence-020~021 추가 + seed-003 OTHER downgrade |
| **현재 (이 문서 재작성 시점)** | **21건** | 이 세션에서 `db/seed/evidence.json` 재조회로 확인 |

evidenceType 분포 (현재, 21건 재조회 결과): POLICY 5 / PRECEDENT 7 / STATUTE 2 / OTHER 7
(non-OTHER 14건)

---

## 2. Coverage matrix (non-OTHER 항목 기준, 현재 상태)

집계 기준: 이 coverage matrix는 non-OTHER 항목만 집계한다 — 이는 이 리포트 자체가
채택한 별도의 집계 정책이며, AC-EVIDENCE-013의 ground truth 판정 기준을 재진술한 것이
아니다(§7 참고). `scope="UNIVERSAL"`(category="공통") 레코드는 design.md §2.1
`isUniversal` 면제에 따라 두 domain 컬럼 모두에 집계한다.

**N/A 판정(정확히 2칸)**: `lib/pipeline/query-planner.ts`의 `domainPlans` 배열
(62-75행)이 `INJURY_DISABILITY` 도메인에는 `DISABILITY_LOCATION`만,
`DISEASE_DISABILITY` 도메인에는 `DIAGNOSIS`만 고정 매핑하므로,
`DIAGNOSIS × INJURY_DISABILITY`와 `DISABILITY_LOCATION × DISEASE_DISABILITY` 두
조합만 QueryPlanner가 구조적으로 생성하지 않는다 — "N/A"는 이 2칸뿐이다. 나머지
`DISABILITY_GRADE_CRITERIA`/`CAUSATION`(84-94행, 매 사건 항상 생성)과
`PRE_EXISTING_CONDITION`/`INJURY_DISEASE_RELATION`/`INCIDENT_CIRCUMSTANCE`/
`ADDITIONAL_CONFIRMATION_NEEDED`(96-143행, 사건 텍스트 조건부 생성)는 도메인 조건이
없는 for-loop 내부에서 두 도메인 모두에 대해 동일하게 평가되므로 두 도메인 모두에서
발생 가능하다 — 이 6개 issueType은 어느 domain 조합에서도 N/A가 아니며, 0건(미발생)과
N/A(구조적 불가능)를 혼동해서는 안 된다.

| issueType | INJURY_DISABILITY (상해후유장해) | DISEASE_DISABILITY (질병후유장해) |
|---|---|---|
| `DISABILITY_LOCATION` | **4건** (001/011/012/013) | N/A |
| `DIAGNOSIS` | N/A | **2건** (008/019) |
| `DISABILITY_GRADE_CRITERIA` | **5건** (001/011/012/013/020) | **0건** |
| `CAUSATION` | **5건** (005/015/016/020/021) | **3건** (008/016/021) |
| `PRE_EXISTING_CONDITION` | **3건** (005/016/020) | **1건** (016) |
| `INJURY_DISEASE_RELATION` | **1건** (015) | **0건** |
| `INCIDENT_CIRCUMSTANCE` | **1건** (014) | **0건** |
| `ADDITIONAL_CONFIRMATION_NEEDED` | **0건** | **0건** |

UNIVERSAL 레코드(seed-016, seed-021 — 둘 다 non-OTHER)가 실제로 두 domain 컬럼 모두에
집계됐음을 위 표에서 확인: `CAUSATION` INJURY 열의 016/021, DISEASE 열의 016/021;
`PRE_EXISTING_CONDITION` DISEASE 열의 016. seed-010/seed-018도 UNIVERSAL이지만
seed-010은 issueTypes가 비어 있고 seed-018은 evidenceType이 OTHER라 non-OTHER 집계에서
제외된다.

---

## 3. 비어있는 셀 수 변화

이 표는 §2 matrix에서 기계적으로 도출한 것으로, §2와 별도로 값을 관리하지 않는다.

| 측정 | M1 | 현재 | 비고 |
|------|-----|-----|------|
| 적용 가능(non-N/A) 셀 수 | 14 | 14 | 8개 issueType × 2 domain = 16칸 중 N/A **2칸만**(DISABILITY_LOCATION×DISEASE, DIAGNOSIS×INJURY — query-planner.ts의 고정 domainPlans 매핑에 의한 구조적 불가능) 제외 |
| 위 14칸 중 0건 셀 수 | 14 (전부 — M1은 issueTypes 미배정) | **5** | 9칸 개선(0건→1건+) |
| BenchmarkCase 중 ground truth ≥ 1건 쿼리 비율 | 0/7 (0%) | **7/7 (100%)** | 아래 §5 참고 |

---

## 4. 잔여 shortfall 셀 (§2 matrix에서 0건인 non-N/A 셀만, 5칸)

| 셀 | 이유 | 권고 |
|---|---|---|
| DISEASE_DISABILITY × DISABILITY_GRADE_CRITERIA | non-OTHER 항목 없음 — seed-004/017/018이 질병후유장해 등급 관련이지만 셋 다 evidenceType=OTHER | 다음 세션에서 생명보험협회/손해보험협회 표준약관 원문 확보 후 POLICY 항목으로 추가 |
| DISEASE_DISABILITY × INJURY_DISEASE_RELATION | 질병후유장해 도메인에서 상해·질병 관련성 쟁점을 다루는 non-OTHER 항목 없음(N/A가 아니라 0건 — query-planner.ts는 두 도메인 모두에서 이 issueType을 생성함) | 상해·질병 관련성이 쟁점이 되는 질병후유장해 판례/약관 사례 발굴 필요 |
| DISEASE_DISABILITY × INCIDENT_CIRCUMSTANCE | 질병후유장해 도메인에서 사고 경위 쟁점을 다루는 non-OTHER 항목 없음(N/A가 아니라 0건) | 사고 경위가 쟁점이 되는 질병후유장해 사례 발굴 필요 |
| INJURY_DISABILITY × ADDITIONAL_CONFIRMATION_NEEDED | 해당 항목 없음 | 트리거 조건("불명확"/"확인 필요") 해당 사례 발굴 필요 |
| DISEASE_DISABILITY × ADDITIONAL_CONFIRMATION_NEEDED | 해당 항목 없음 | 위와 동일 |

---

## 5. BenchmarkCase 별 ground truth 및 hit rate (현재, `BENCHMARK_CASES` FINAL 배열 재조회)

| BenchmarkCase | ground truth 건수 | ground truth id | skipped(빈 ground truth) 여부 |
|---|---|---|---|
| bm-injury-preexisting-01 | 3 | seed-evidence-005, 016, 020 | 아니오 |
| bm-injury-causation-01 | 4 | seed-evidence-005, 015, 016, 020 | 아니오 |
| bm-injury-grade-01 | 5 | seed-evidence-001, 011, 012, 013, 020 | 아니오 |
| bm-injury-location-01 | 4 | seed-evidence-001, 011, 012, 013 | 아니오 |
| bm-disease-causation-01 | 4 | seed-evidence-008, 009, 016, 021 | 아니오 |
| bm-disease-grade-01 | 3 | seed-evidence-004, 017, 018 | 아니오 |
| bm-disease-diagnosis-01 | 2 | seed-evidence-008, 019 | 아니오 |

**bm-disease-grade-01 정정**: 이전 패치본(위 이력 참고)에서는 이 케이스의 ground truth를
"0건"으로 전제하고 `recallAt5`가 빈 ground truth에서 1을 반환하는 것처럼 서술했으나,
이는 현재 코드/데이터 어느 쪽으로도 사실이 아니다.

- `BENCHMARK_CASES`(`lib/pipeline/evidence-retriever.benchmark.test.ts` 262-277행) 재조회
  결과, `bm-disease-grade-01`의 `knownRelevantEvidenceIds`는
  `["seed-evidence-004", "seed-evidence-017", "seed-evidence-018"]` — **3건, 비어 있지
  않음**. progress.md §M Fix3에서 "manifest에서 OTHER로 downgrade된 항목만 제외 대상이며
  seed-004/017/018은 처음부터 OTHER이므로 포함 가능"으로 정정된 결과가 반영돼 있다.
- 같은 파일 300-318행의 `recallAt5`/`hitAt5`/`precisionAt5` 함수는 빈 ground truth
  (`knownRelevantIds.length === 0`)에 대해 **`null`을 반환**하며, `measureStrategy`/
  `measureTrueBaseline`의 mean 계산은 `perCase.filter((c) => !c.skipped)`로 이 케이스를
  **평균에서 제외**한다(design.md §3.3a). "빈 ground truth → Recall=1"로 처리하는 코드는
  존재하지 않는다.
- **현재 `BENCHMARK_CASES` 7건 전부 ground truth ≥ 1건**이므로, 이 FINAL 배열 기준으로는
  skipped case가 0건이다. null-반환/평균-제외 로직은 코드에 존재하지만, 지금은 실제로
  트리거되는 케이스가 없다.

---

## 6. 주의: cross-corpus Recall@5 비교 없음

REQ-EVIDENCE-017 명시: 이 문서는 M1→현재의 coverage matrix 개선 현황만 기록한다.
M4d FINAL 섹션에서 동일 frozen corpus(21건) 위의 strategy A/B 비교를 수행했으며,
corpus 규모가 다른 시점 간 Recall@5 비교는 이 문서에서 다루지 않는다.

---

## 7. AC-EVIDENCE-013 ground truth 판정 기준과 이 문서의 non-OTHER 집계 정책은 별개다

AC-EVIDENCE-013(REQ-EVIDENCE-015, `.moai/specs/SPEC-EVIDENCE-001/acceptance.md`
118-128행)의 실제 ground truth 판정 기준은 "manifest 유지 결정 + production id 존재 +
complete human review"다 — 벤치마크 케이스의 `knownRelevantEvidenceIds`가 (a)
`db/seed/evidence.json`의 실제 `id` 집합에 존재하고, (b)
`evidence-source-audit-manifest.md`에서 "유지"로 결정된 id 집합에도 존재해야 한다는
뜻이며, evidenceType이 OTHER인 항목을 ground truth에서 배제하라는 규칙이 아니다.

실제로 `BENCHMARK_CASES`(FINAL, `evidence-retriever.benchmark.test.ts` 173-292행)의
`bm-disease-grade-01` 케이스는 `knownRelevantEvidenceIds: ["seed-evidence-004",
"seed-evidence-017", "seed-evidence-018"]`를 그대로 사용하고,
`bm-disease-causation-01` 케이스도 `seed-evidence-009`를 포함한다(같은 파일
254-256행) — 넷 모두 evidenceType=OTHER이지만, manifest상 처음부터 OTHER였고
downgrade된 적이 없어(같은 파일 271-275행 주석) AC-EVIDENCE-013의 (b) 조건을
만족하므로 ground truth에 포함된다.

이 문서(coverage-delta-m4e.md)의 "non-OTHER 항목만 집계" 규칙은 AC-EVIDENCE-013의
ground truth 판정 기준을 재진술한 것이 아니라, 이 coverage 리포트 자체가 채택한
별도의 집계 정책이다 — "domain×issueType 조합별 non-OTHER 레코드 존재 여부"를 세는
것이 이 문서의 목적이고, `BENCHMARK_CASES`는 "특정 쿼리에 실제로 관련 있다고 사람이
판단한 evidence 집합"을 기록하는 별개 지표다. 두 지표가 항상 1:1로 일치할 필요는
없다.
