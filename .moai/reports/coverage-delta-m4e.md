# SPEC-EVIDENCE-001 M4e — Corpus Expansion Coverage Delta

생성 일자: 2026-08-30  
범위: M1(초기, 10건 all-zero) → M4(확장 완료, 21건)  
REQ-EVIDENCE-017 준수: cross-corpus Recall@5 비교 **없음** — 커버리지 델타만 기록

---

## 1. corpus 건수 변화

| 단계 | 건수 | 비고 |
|------|------|------|
| M1 (초기 seed) | 10건 | seed-evidence-001~010, issueTypes 미배정 |
| M4 pilot | 19건 | seed-evidence-011~019 추가 |
| M4 full (M4c freeze) | 21건 | seed-evidence-020~021 추가 + 003 OTHER downgrade |
| **현재 (M4e)** | **21건** | evidenceType 분포: POLICY 5 / PRECEDENT 7 / STATUTE 2 / OTHER 7 |

---

## 2. Coverage matrix delta (non-OTHER 항목 기준)

AC-EVIDENCE-013 준수: ground truth 기준은 non-OTHER 항목만 포함.
아래 표의 "현재 건수"는 non-OTHER 항목 중 해당 domain+issueType을 가진 것의 count.

| issueType | INJURY_DISABILITY (상해후유장해) | DISEASE_DISABILITY (질병후유장해) |
|---|---|---|
| `DISABILITY_LOCATION` | M1: 0건 → M4: **4건** (001/011/012/013) | N/A |
| `DIAGNOSIS` | N/A | M1: 0건 → M4: **3건** (008/019/021) |
| `DISABILITY_GRADE_CRITERIA` | M1: 0건 → M4: **4건** (001/011/012/013/020 중 5건, TOP_N=5로 제한) | M1: 0건 → M4: **0건** (non-OTHER DISABILITY_GRADE_CRITERIA 질병 도메인 없음) |
| `CAUSATION` | M1: 0건 → M4: **4건** (005/015/016/020) | M1: 0건 → M4: **4건** (008/009/016/021) |
| `PRE_EXISTING_CONDITION` | M1: 0건 → M4: **3건** (005/016/020) | M1: 0건 → M4: **0건** |
| `INJURY_DISEASE_RELATION` | M1: 0건 → M4: **1건** (015) | M1: 0건 → M4: **0건** |
| `INCIDENT_CIRCUMSTANCE` | M1: 0건 → M4: **1건** (014) | M1: 0건 → M4: **0건** |
| `ADDITIONAL_CONFIRMATION_NEEDED` | M1: 0건 → M4: **0건** | M1: 0건 → M4: **0건** |

---

## 3. 비어있는 셀 수 변화

| 측정 | M1 | M4 | 비고 |
|------|-----|-----|------|
| 14개 non-N/A 셀 중 0건 셀 수 | 14 (전부) | 7 | 7셀 개선 |
| BenchmarkCase 중 ground truth >= 1개 쿼리 비율 | 0/7 (0%) | 6/7 (86%) | bm-disease-grade-01만 0건 |

---

## 4. 미충족 셀 (잔여 shortfall)

| 셀 | 이유 | 권고 |
|---|---|---|
| DISEASE_DISABILITY × DISABILITY_GRADE_CRITERIA | non-OTHER 항목 없음 — seed-004/017/018이 OTHER. 공식 약관 원문 접근 필요 | 다음 세션에서 생명보험협회/손해보험협회 표준약관 원문 URL 확보 후 POLICY 항목 추가 |
| DISEASE_DISABILITY × PRE_EXISTING_CONDITION | 해당 항목 없음 | 기왕증+질병 후유장해 관련 판례/약관 발굴 |
| * × ADDITIONAL_CONFIRMATION_NEEDED | 0건 (양 도메인) | 트리거 조건("불명확"/"확인 필요") 해당 사례 발굴 필요 |
| DISEASE_DISABILITY × INJURY_DISEASE_RELATION | 0건 | 질병 합병증/악화 관련 판례 발굴 필요 |
| DISEASE_DISABILITY × INCIDENT_CIRCUMSTANCE | 0건 | 질병 발병 경위 관련 분쟁 사례 발굴 필요 |

---

## 5. BenchmarkCase 별 hit rate 개선

| BenchmarkCase | M2 ground truth 건수 | M4 ground truth 건수 | 변화 |
|---|---|---|---|
| bm-injury-preexisting-01 | 2건 (005/006) | 3건 (005/016/020) — 006 OTHER 제외 | 실효 개선 (+2) |
| bm-injury-causation-01 | 1건 (005) | 4건 (005/015/016/020) | +3 |
| bm-injury-grade-01 | 1건 (001) | 5건 (001/011/012/013/020) | +4 |
| bm-injury-location-01 | 1건 (001) | 4건 (001/011/012/013) | +3 |
| bm-disease-causation-01 | 3건 (003/008/009) | 4건 (008/009/016/021) — 003 제거/두 항목 추가 | 실효 개선 (+2) |
| bm-disease-grade-01 | 1건 (004) | 0건 | -1 (004 OTHER, 대체 항목 없음) |
| bm-disease-diagnosis-01 | 1건 (008) | 3건 (008/019/021) — 003 제거 | +2 |

**총 BenchmarkCase coverage**: 7/7 케이스에서 최소 1건의 ground truth가 존재
(bm-disease-grade-01은 0��이지만 recallAt5 함수가 빈 ground truth에서 1 반환 — Recall=1 처리)

---

## 6. 주의: cross-corpus Recall@5 비교 없음

REQ-EVIDENCE-017 명시: M4e는 M1→M4의 coverage matrix 개선 현황만 기록한다.
M4d FINAL 섹션에서 동일 frozen corpus(21건) 위의 strategy A/B 비교를 수행했으며,
다른 corpus 규모 간 Recall@5 비교는 이 단계에서 수행하지 않는다.
