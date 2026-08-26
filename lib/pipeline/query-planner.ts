import type { CoverageDomain, NormalizedCase, QueryIssueType, ResearchQuery } from "./types";

// QueryPlanner (2/6) — 정규화된 사건으로부터 규칙 기반(rule-based)으로
// 리서치 쟁점을 구조화해 ResearchQuery[]를 생성한다(REQ-RESEARCH-002/003/010,
// design.md §5). LLM을 호출하지 않는다 — NormalizedCase 필드(진단명/장해
// 부위 존재, 사고 경위 텍스트 길이 등)만을 규칙으로 검사해, 8개 issueType
// 중 사건에 해당하는 항목을 선택적으로 조합한다.
//
// @MX:NOTE: 두 도메인(INJURY_DISABILITY/DISEASE_DISABILITY)마다 도메인에
// 맞는 위치/진단 이슈타입 1개 + DISABILITY_GRADE_CRITERIA + CAUSATION을
// 항상 생성하고(합산 최소 6개, AC-RESEARCH-002), 나머지 4개 이슈타입은
// 사건 텍스트의 키워드/길이 신호로 조건부 추가한다(design.md §5).
//
// @MX:DEBT: PRE_EXISTING_CONDITION의 트리거 키워드("이전"/"기존"/"과거")만
// design.md §5에 명시적으로 예시되어 있다. 나머지 3개 조건부 이슈타입
// (INJURY_DISEASE_RELATION/INCIDENT_CIRCUMSTANCE/ADDITIONAL_CONFIRMATION_NEEDED)의
// 트리거는 design.md §5의 일반 규칙("진단명 존재, 장해 부위 존재, 사고
// 경위 텍스트 길이 등")과 각 issueType의 의미에 근거해 이 파일에서 정한
// 판단이다 — AC-RESEARCH-002/003은 이 3개 트리거의 정확한 값에 의존하지
// 않는다(plan.md §F 잔여 위험: QueryPlanner 규칙은 이번 SPEC에서 재고
// 가능성이 가장 높은 판단).
// @MX:CEILING: 아래 키워드 리스트/길이 임계값 범위 내에서만 유효
// @MX:UPGRADE: 실사용 사건 데이터로 트리거 정확도를 재조정하거나, 후속
// SPEC에서 LLM 기반 QueryPlanner로 교체할 때 갱신
const PRE_EXISTING_CONDITION_KEYWORDS = ["이전", "기존", "과거", "재발", "퇴행성"];
const INJURY_DISEASE_RELATION_KEYWORDS = ["질병", "지병", "합병증", "악화", "기저질환"];
const ADDITIONAL_CONFIRMATION_KEYWORDS = ["불명확", "확인 필요", "미상", "추정"];
const INCIDENT_CIRCUMSTANCE_MIN_LENGTH = 30;

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

interface DomainPlan {
  domain: CoverageDomain;
  issueType: Extract<QueryIssueType, "DISABILITY_LOCATION" | "DIAGNOSIS">;
  focus: string;
  topicPrefix: string;
}

function buildQuery(
  domain: CoverageDomain,
  issueType: QueryIssueType,
  topic: string,
  focus: string,
  keywords: string[]
): ResearchQuery {
  return {
    id: `q-${domain.toLowerCase()}-${issueType.toLowerCase()}`,
    topic,
    focus,
    domain,
    issueType,
    keywords,
  };
}

export function planQueries(normalizedCase: NormalizedCase): ResearchQuery[] {
  const { incidentDescription, diagnosisName, disabilityBodyPart } = normalizedCase;
  const combinedText = `${incidentDescription} ${diagnosisName} ${disabilityBodyPart}`;

  const domainPlans: DomainPlan[] = [
    {
      domain: "INJURY_DISABILITY",
      issueType: "DISABILITY_LOCATION",
      focus: disabilityBodyPart,
      topicPrefix: `${disabilityBodyPart} 상해후유장해`,
    },
    {
      domain: "DISEASE_DISABILITY",
      issueType: "DIAGNOSIS",
      focus: diagnosisName,
      topicPrefix: `${diagnosisName} 질병후유장해`,
    },
  ];

  const queries: ResearchQuery[] = [];

  for (const plan of domainPlans) {
    const { domain, issueType, focus, topicPrefix } = plan;

    // 도메인에 맞는 위치/진단 이슈타입 + DISABILITY_GRADE_CRITERIA + CAUSATION —
    // 매 사건마다 항상 생성되는 최소 3개 (AC-RESEARCH-002 기준선)
    queries.push(
      buildQuery(domain, issueType, `${topicPrefix} 담보 검토`, focus, [focus]),
      buildQuery(domain, "DISABILITY_GRADE_CRITERIA", `${topicPrefix} 장해 평가 기준 검토`, focus, [
        focus,
        "장해 평가 기준",
      ]),
      buildQuery(domain, "CAUSATION", `${topicPrefix} 인과관계 쟁점 검토`, focus, [focus, "인과관계"])
    );

    // 이하 4개는 사건 텍스트의 키워드/길이 신호로 조건부 추가한다(design.md §5)
    if (includesAny(combinedText, PRE_EXISTING_CONDITION_KEYWORDS)) {
      queries.push(
        buildQuery(domain, "PRE_EXISTING_CONDITION", `${topicPrefix} 기왕증·퇴행성 가능성 검토`, focus, [
          focus,
          "기왕증",
          "퇴행성",
        ])
      );
    }

    if (includesAny(combinedText, INJURY_DISEASE_RELATION_KEYWORDS)) {
      queries.push(
        buildQuery(domain, "INJURY_DISEASE_RELATION", `${topicPrefix} 상해·질병 관련성 검토`, focus, [
          focus,
          "상해",
          "질병",
          "관련성",
        ])
      );
    }

    if (incidentDescription.length >= INCIDENT_CIRCUMSTANCE_MIN_LENGTH) {
      queries.push(
        buildQuery(domain, "INCIDENT_CIRCUMSTANCE", `${topicPrefix} 사고 경위 검토`, incidentDescription, [
          focus,
          "사고 경위",
        ])
      );
    }

    if (includesAny(combinedText, ADDITIONAL_CONFIRMATION_KEYWORDS)) {
      queries.push(
        buildQuery(domain, "ADDITIONAL_CONFIRMATION_NEEDED", `${topicPrefix} 추가 확인 필요 조건 검토`, focus, [
          focus,
          "추가 확인",
        ])
      );
    }
  }

  return queries;
}
