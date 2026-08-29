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
| `DISABILITY_LOCATION` | 현재 0건 / 목표 5건 (domainPlans 고정 매핑 — 상해 도메인의 항상-생성 쟁점) | **N/A** — `domainPlans`가 `DISEASE_DISABILITY`에 이 issueType을 매핑하지 않음(query-planner.ts) |
| `DIAGNOSIS` | **N/A** — `domainPlans`가 `INJURY_DISABILITY`에 이 issueType을 매핑하지 않음(query-planner.ts) | 현재 0건 / 목표 5건 (domainPlans 고정 매핑 — 질병 도메인의 항상-생성 쟁점) |
| `DISABILITY_GRADE_CRITERIA` | 현재 0건 / 목표 6건 (모든 사건에서 항상 생성 — 최우선순위) | 현재 0건 / 목표 6건 (모든 사건에서 항상 생성 — 최우선순위) |
| `CAUSATION` | 현재 0건 / 목표 6건 (모든 사건에서 항상 생성 — REQ-EVIDENCE-013 target case 후보) | 현재 0건 / 목표 6건 (모든 사건에서 항상 생성 — REQ-EVIDENCE-013 target case 후보) |
| `PRE_EXISTING_CONDITION` | 현재 0건 / 목표 4건 (조건부 — "이전"/"기존"/"과거"/"재발"/"퇴행성" 키워드 트리거) | 현재 0건 / 목표 4건 (조건부 — 동일 키워드 트리거) |
| `INJURY_DISEASE_RELATION` | 현재 0건 / 목표 3건 (조건부 — "질병"/"지병"/"합병증"/"악화"/"기저질환" 키워드 트리거) | 현재 0건 / 목표 3건 (조건부 — 동일 키워드 트리거) |
| `INCIDENT_CIRCUMSTANCE` | 현재 0건 / 목표 3건 (조건부 — `incidentDescription.length >= 30`) | 현재 0건 / 목표 3건 (조건부 — 동일 길이 트리거) |
| `ADDITIONAL_CONFIRMATION_NEEDED` | 현재 0건 / 목표 2건 (조건부 — "불명확"/"확인 필요"/"미상"/"추정" 키워드 트리거) | 현재 0건 / 목표 2건 (조건부 — 동일 키워드 트리거) |

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
