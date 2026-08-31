# SPEC-EVIDENCE-001 — Evidence Coverage Matrix (M1)

REQ-EVIDENCE-001 / AC-EVIDENCE-001. 두 담보(`INJURY_DISABILITY`/`DISEASE_DISABILITY`) ×
8개 `QueryIssueType`(`lib/pipeline/types.ts` `QUERY_ISSUE_TYPES`) = 16개 셀 전체를
표에 유지한다. `N/A` 셀도 삭제하지 않고 명시한다(추적 가능성 보존, design.md §7).

이 문서는 M1(스키마/타입/seed validation) 시점의 스냅샷이다 — "현재 건수"는 M1이
`db/seed/evidence.json` 전체 10건에 `issueTypes: []`(design.md §1.1, 재감사 이전
기본값)를 채운 직후의 상태이며, 실제 issueType 분류(재감사 + 신규 curation)는
M4(design.md §5)의 범위다. "목표 건수"는 corpus 확장의 배분 근거일 뿐 M1에서
확정하는 최종 값이 아니다 — M4가 재감사 결과를 반영해 재산정할 수 있다
(plan.md M4b).

## N/A 판정 근거

`lib/pipeline/query-planner.ts`의 `domainPlans` 배열은 도메인별 "위치/진단"
issueType을 고정 매핑한다:

```ts
const domainPlans: DomainPlan[] = [
  { domain: "INJURY_DISABILITY", issueType: "DISABILITY_LOCATION", ... },
  { domain: "DISEASE_DISABILITY", issueType: "DIAGNOSIS", ... },
];
```

`DomainPlan.issueType`은 `Extract<QueryIssueType, "DISABILITY_LOCATION" | "DIAGNOSIS">`로
타입 자체가 도메인당 정확히 1개 값으로 고정되어 있고, `planQueries()`는 이 배열을
순회하며 각 도메인 plan의 `issueType`만 사용한다 — `INJURY_DISABILITY` 도메인이
`DIAGNOSIS` 쿼리를 생성하거나 `DISEASE_DISABILITY` 도메인이 `DISABILITY_LOCATION`
쿼리를 생성하는 코드 경로는 존재하지 않는다. 따라서 이 두 조합은 "QueryPlanner가
실제로 생성하지 않는 조합"으로 `N/A`다 — 임의로 배정을 미룬 것이 아니라 코드
구조상 원천적으로 발생하지 않는다.

나머지 6개 issueType(`DISABILITY_GRADE_CRITERIA`/`CAUSATION`은 매 사건 항상,
`PRE_EXISTING_CONDITION`/`INJURY_DISEASE_RELATION`/`INCIDENT_CIRCUMSTANCE`/
`ADDITIONAL_CONFIRMATION_NEEDED`는 사건 텍스트 키워드/길이 조건부)은 `planQueries()`
내부 for-loop가 **두 도메인 plan 모두**에 대해 동일하게 평가하므로, 두 도메인 모두에서
발생 가능하다 — N/A 아님.

## Coverage Matrix

| issueType | INJURY_DISABILITY (상해후유장해) | DISEASE_DISABILITY (질병후유장해) |
|---|---|---|
| `DISABILITY_LOCATION` | M1: 0건 → **M4: 4건** (001/011/012/013, non-OTHER) | **N/A** |
| `DIAGNOSIS` | **N/A** | M1: 0건 → **M4: 3건** (008/019/021, non-OTHER) |
| `DISABILITY_GRADE_CRITERIA` | M1: 0건 → **M4: 5건** (001/011/012/013/020, non-OTHER) | M1: 0건 → **M4: 0건** (non-OTHER 없음 — 004/017/018 모두 OTHER) |
| `CAUSATION` | M1: 0건 → **M4: 4건** (005/015/016/020, non-OTHER) | M1: 0건 → **M4: 4건** (008/009/016/021, non-OTHER) |
| `PRE_EXISTING_CONDITION` | M1: 0건 → **M4: 3건** (005/016/020, non-OTHER) | M1: 0건 → **M4: 0건** |
| `INJURY_DISEASE_RELATION` | M1: 0건 → **M4: 1건** (015, non-OTHER) | M1: 0건 → **M4: 0건** |
| `INCIDENT_CIRCUMSTANCE` | M1: 0건 → **M4: 1건** (014, non-OTHER) | M1: 0건 → **M4: 0건** |
| `ADDITIONAL_CONFIRMATION_NEEDED` | M1: 0건 → M4: 0건 | M1: 0건 → M4: 0건 |

**M4 현황**: non-N/A 14셀 중 7셀 개선(0건→1건+). 빈 셀 14→7. BenchmarkCase 7/7 중 6/7에서 ground truth ≥ 1건 (bm-disease-grade-01만 0건).  
**최종 corpus**: 21건 (POLICY 5건, PRECEDENT 7건, STATUTE 2건, OTHER 7건)

## 목표 건수 배분 근거 (임의 균등배분 아님)

목표 건수는 evidenceType(PRECEDENT/STATUTE/DISPUTE_CASE/POLICY/OTHER)별로 균등
배분한 것이 아니라, 이 coverage matrix가 식별한 issueType별 실제 발생 빈도에
비례해 배분한다(REQ-EVIDENCE-001):

- **`DISABILITY_GRADE_CRITERIA`/`CAUSATION`**: `planQueries()`가 **모든 사건에서
  예외 없이** 생성하는 쟁점이다(도메인당 3개 기본 쿼리 중 2개) — 실제 사건에서
  가장 자주 조회될 쟁점이므로 가장 높은 목표(6건)를 배정한다.
- **도메인 고유 위치/진단 쟁점**(`DISABILITY_LOCATION`/`DIAGNOSIS`): 마찬가지로
  모든 사건에서 항상 생성되지만, 도메인당 정확히 1개 issueType에만 매핑되어
  다른 쟁점들과 겹치지 않는 독립 슬롯이라 5건으로 배정한다.
- **조건부 쟁점 4종**: 사건 텍스트 조건에 따라 선택적으로만 생성되므로,
  트리거 빈도가 상대적으로 낮을 것으로 예상되는 순서(기왕증 > 상해질병관련성
  ≈ 사고경위 > 추가확인필요)로 4/3/3/2건을 배정한다. 이 순서는
  `query-planner.ts`의 `@MX:DEBT` 주석이 명시하듯 실사용 데이터로 재조정될
  후보다(plan.md §F 잔여 위험).

**Total 목표**: (5+5) + (6+6)×2 + (4+3+3+2)×2 = 10 + 24 + 24 = 58건 — spec.md §1의
"약 50~100건" 범위 하한 근처. M4 재감사(design.md §5.2) 결과 기존 10건 중 일부가
`OTHER` downgrade/제외될 수 있으므로(spec.md §5 잔여 위험), 실제 M4 목표는 재감사
결과를 반영해 재산정한다.

## M1 상태 요약

- 담보(2) × issueType(8) = 16칸 전부 표에 존재(칸 삭제 없음).
- `N/A` 2칸(교차 도메인 위치/진단 쌍)에는 `query-planner.ts`의 실제 조건부
  트리거 로직(고정 `domainPlans` 매핑)을 근거로 든 설명이 있다.
- `N/A`가 아닌 14칸 전부에 현재 건수(0건, M1 시점 — 기존 10건은 아직
  issueTypes로 분류되지 않음)와 목표 건수가 명시되어 있다.
- 목표 건수는 evidenceType별 임의 균등배분이 아니라, `planQueries()`의 실제
  생성 빈도(항상 생성 vs 조건부)에 비례해 배분되었음을 위 절에서 설명한다.

## M4 pilot 이후 현재 건수 (2026-08-29, `.moai/reports/evidence-source-audit-manifest.md` 기준)

**PILOT SCOPE 고지**: 이 절은 M4a(기존 10건 재감사) + M4b(pilot 신규 9건 확장)만 반영한다.
M4c(benchmark freeze)/M4d(algorithm effect)/M4e(corpus expansion effect)는 이번 세션에서
수행하지 않았다 — 아래 "현재 건수"는 여전히 **exploratory** 스냅샷이며, frozen 최종 corpus가
아니다. `evidence.json` 총 레코드 수: 10 → **19**(재감사로 인한 downgrade/제외 0건, 신규 9건).

**집계 규칙**: `category="공통"`/`scope="UNIVERSAL"` 레코드(seed-evidence-010/016/018)는
`retrieveEvidence()`의 `isUniversal` 분기가 domainMatch 요건을 면제하므로, 두 도메인 셀
모두의 "현재 건수"에 함께 집계한다(design.md §2.1).

| issueType | INJURY_DISABILITY (상해후유장해) | DISEASE_DISABILITY (질병후유장해) |
|---|---|---|
| `DISABILITY_LOCATION` | 현재 **4**건(001/011/012/013) / 목표 5건 | **N/A** |
| `DIAGNOSIS` | **N/A** | 현재 **3**건(003/008/019) / 목표 5건 |
| `DISABILITY_GRADE_CRITERIA` | 현재 **5**건(001/011/012/013 + universal 018) / 목표 6건 | 현재 **3**건(004/017 + universal 018) / 목표 6건 |
| `CAUSATION` | 현재 **3**건(005/015 + universal 016) / 목표 6건 | 현재 **4**건(003/008/009 + universal 016) / 목표 6건 |
| `PRE_EXISTING_CONDITION` | 현재 **3**건(005/006 + universal 016) / 목표 4건 | 현재 **1**건(universal 016만) / 목표 4건 |
| `INJURY_DISEASE_RELATION` | 현재 **1**건(015) / 목표 3건 | 현재 **0**건 / 목표 3건 |
| `INCIDENT_CIRCUMSTANCE` | 현재 **1**건(014) / 목표 3건 | 현재 **0**건 / 목표 3건 |
| `ADDITIONAL_CONFIRMATION_NEEDED` | 현재 **0**건 / 목표 2건 | 현재 **0**건 / 목표 2건 |

### 잔여 공백 (M4b pilot 이후에도 목표 미달, 정직 고지)

- `INJURY_DISEASE_RELATION`(질병), `INCIDENT_CIRCUMSTANCE`(질병), `ADDITIONAL_CONFIRMATION_NEEDED`(양 도메인)는 이번 pilot에서 신규 레코드를 전혀 확보하지 못했다.
- 그 외 셀도 대부분 목표에 못 미친다 — pilot은 "15~20건 SMALL 확장" 범위였고 전체 50~100건
  목표(spec.md §1)에는 크게 못 미친다. 이는 설계된 결과다(task 지시: pilot scope, 4c/4d/4e 및
  전체 목표 달성은 후속 세션).
- `DISPUTE_CASE` evidenceType: 이번 pilot에서도 **0건** — manifest §C에 시도 경위와 실패 사유를
  정직하게 기록했다(FSS 분쟁조정 사례집 PDF 텍스트 추출 실패, 개별 결정 URL 부재).

### evidenceType 분포 (19건)

POLICY 6건(001/003/011/012/013/019), PRECEDENT 5건(005/008/014/015/016), STATUTE 2건
(007/010), OTHER 6건(002/004/006/009/017/018), DISPUTE_CASE 0건.

## M4c/M4d/M4e 이후 post-correction 재검증 (evidence-retriever.ts 재발 방지 수정 세션, 21건 실측)

**Scope**: 이 절은 evidence-retriever.ts의 score/정렬 배선 결함(design.md §2.1 "명시적
확인" 문단 위반) 수정 세션에서, `db/seed/evidence.json`(21건, 위 §"M1 상태 요약" 이후
불변)을 이번 세션이 직접 재조회해 위 "Coverage Matrix" 절(21건 기준)의 셀 값을 재검증한
결과다. `db/seed/evidence.json`은 이 세션에서 전혀 수정하지 않았다 — 검증만 수행했다.

**검증 방법**: 위 "Coverage Matrix" 절과 동일한 방법론(non-OTHER 항목만 집계,
`scope="UNIVERSAL"` 레코드는 `retrieveEvidence()`의 `isUniversal` 분기가 domainMatch를
면제하므로 두 도메인 셀 모두에 집계 — design.md §2.1)을 그대로 적용해, `db/seed/evidence.json`을
직접 파싱한 스크립트로 각 셀을 재계산했다.

| issueType | INJURY_DISABILITY (상해후유장해) | DISEASE_DISABILITY (질병후유장해) |
|---|---|---|
| `DISABILITY_LOCATION` | **4건** (001/011/012/013) | **N/A** |
| `DIAGNOSIS` | **N/A** | **2건** (008/019) |
| `DISABILITY_GRADE_CRITERIA` | **5건** (001/011/012/013/020) | **0건** (004/017/018 모두 OTHER) |
| `CAUSATION` | **5건** (005/015/016/020/021 — 021은 UNIVERSAL) | **3건** (008/016/021 — 016/021은 UNIVERSAL) |
| `PRE_EXISTING_CONDITION` | **3건** (005/016/020) | **1건** (016 — UNIVERSAL) |
| `INJURY_DISEASE_RELATION` | **1건** (015) | **0건** |
| `INCIDENT_CIRCUMSTANCE` | **1건** (014) | **0건** |
| `ADDITIONAL_CONFIRMATION_NEEDED` | **0건** | **0건** |

**위 "Coverage Matrix" 절(21건 기준)과의 차이 — 정정 사항(honest disclosure)**:

이번 재검증에서 위 기존 "Coverage Matrix" 절의 4개 셀이 현재 `evidence.json` 실측치와
불일치함을 확인했다. 옛 프로즈를 신뢰하지 않고 실제 데이터로 재계산한 결과이며, 기존 절은
삭제하지 않고 이 절에서 정정 사항만 기록한다:

1. **`DIAGNOSIS` × DISEASE_DISABILITY**: 기존 절은 "3건 (008/019/021)"이라 기록했으나,
   `seed-evidence-021`은 evidence-source-audit-manifest.md §B2의 Fix4(2026-08-30)에서
   `DIAGNOSIS` 태깅이 제거되었다(현재 `issueTypes: ["CAUSATION"]`만 보유) — 실측 **2건
   (008/019)**이 정확하다.
2. **`CAUSATION` × INJURY_DISABILITY**: 기존 절은 "4건 (005/015/016/020)"이라 기록했으나,
   `seed-evidence-021`(UNIVERSAL, `issueTypes: ["CAUSATION"]`)이 `isUniversal` 면제로
   INJURY_DISABILITY 셀에도 집계되어야 한다 — 실측 **5건 (005/015/016/020/021)**이 정확하다.
3. **`CAUSATION` × DISEASE_DISABILITY**: 기존 절은 "4건 (008/009/016/021)"이라 기록했으나,
   `seed-evidence-009`는 evidenceType이 `OTHER`이며 evidence-source-audit-manifest.md
   §A에서도 처음부터 OTHER로 재확인됐다 — 이 절의 non-OTHER 집계 규칙상 제외 대상이다.
   실측 **3건 (008/016/021)**이 정확하다.
4. **`PRE_EXISTING_CONDITION` × DISEASE_DISABILITY**: 기존 절은 "0건"이라 기록했으나,
   `seed-evidence-016`(UNIVERSAL, `issueTypes: ["CAUSATION", "PRE_EXISTING_CONDITION"]`)이
   `isUniversal` 면제로 DISEASE_DISABILITY 셀에도 집계되어야 한다 — 실측 **1건 (016)**이
   정확하다.

나머지 10개 셀(N/A 2칸 포함)은 기존 절의 값과 일치함을 확인했다.

**참고**: 위 4개 정정 사항은 coverage 커버리지 재검토 결과이며, `evidence-retriever.benchmark.test.ts`의
`BENCHMARK_CASES`(개별 벤치마크 쿼리별 큐레이션된 ground truth)와는 별개 지표다 — 이
coverage matrix는 "domain×issueType 조합별 non-OTHER 레코드 존재 여부"를 집계하고,
`BENCHMARK_CASES`는 "특정 쿼리에 실제로 관련 있다고 사람이 판단한 evidence 집합"을
기록한다. 두 지표가 항상 1:1로 일치할 필요는 없다.
