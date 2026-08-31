# SPEC-EVIDENCE-001 M4e — Corpus Expansion Coverage Delta

생성 일자: 2026-08-31
범위: M1(초기, 10건 all-zero) → 현재(21건, corpus 확장 완료)
REQ-EVIDENCE-017 준수: cross-corpus Recall@5 비교 **없음** — coverage matrix 델타만 기록

**이력**: 이 문서는 M4e 완료 시점에 작성된 원본과, 이후 4개 셀 오차를 별도 절(§7)로
덧붙여 정정한 패치본을 통합해 다시 계산한 단일 최종본이다. 옛 표와 패치 각주가
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

AC-EVIDENCE-013 준수: ground truth 집계 기준은 non-OTHER 항목만 포함한다.
`scope="UNIVERSAL"`(category="공통") 레코드는 design.md §2.1 `isUniversal` 면제에 따라
두 domain 컬럼 모두에 집계한다. "N/A"는 해당 issueType이 그 domain에 구조적으로
적용되지 않음을 뜻하며(design.md의 domain별 issueType 정의), 데이터 재조회로 값이
바뀌는 셀이 아니다.

| issueType | INJURY_DISABILITY (상해후유장해) | DISEASE_DISABILITY (질병후유장해) |
|---|---|---|
| `DISABILITY_LOCATION` | **4건** (001/011/012/013) | N/A |
| `DIAGNOSIS` | N/A | **2건** (008/019) |
| `DISABILITY_GRADE_CRITERIA` | **5건** (001/011/012/013/020) | **0건** |
| `CAUSATION` | **5건** (005/015/016/020/021) | **3건** (008/016/021) |
| `PRE_EXISTING_CONDITION` | **3건** (005/016/020) | **1건** (016) |
| `INJURY_DISEASE_RELATION` | **1건** (015) | N/A |
| `INCIDENT_CIRCUMSTANCE` | **1건** (014) | N/A |
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
| 적용 가능(non-N/A) 셀 수 | 12 | 12 | 8개 issueType × 2 domain = 16칸 중 N/A 4칸(DISABILITY_LOCATION×DISEASE, DIAGNOSIS×INJURY, INJURY_DISEASE_RELATION×DISEASE, INCIDENT_CIRCUMSTANCE×DISEASE) 제외 |
| 위 12칸 중 0건 셀 수 | 12 (전부 — M1은 issueTypes 미배정) | **3** | 9칸 개선 |
| BenchmarkCase 중 ground truth ≥ 1건 쿼리 비율 | 0/7 (0%) | **7/7 (100%)** | 아래 §5 참고 |

---

## 4. 잔여 shortfall 셀 (§2 matrix에서 0건인 non-N/A 셀만)

| 셀 | 이유 | 권고 |
|---|---|---|
| DISEASE_DISABILITY × DISABILITY_GRADE_CRITERIA | non-OTHER 항목 없음 — seed-004/017이 질병후유장해 등급 관련이지만 둘 다 evidenceType=OTHER | 다음 세션에서 생명보험협회/손해보험협회 표준약관 원문 확보 후 POLICY 항목으로 추가 |
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

**bm-disease-grade-01 정정**: 이전 절(§7 이력 참고)에서는 이 케이스의 ground truth를
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
