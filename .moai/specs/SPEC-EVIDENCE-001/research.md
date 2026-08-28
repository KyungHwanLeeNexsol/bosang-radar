# SPEC-EVIDENCE-001 — research.md

## §0. 이 세션의 조사 도구 가용성 (정직하게 명시)

이 plan-phase를 작성한 세션은 전용 WebSearch/WebFetch 도구가 없다. 대신 Bash `curl`로 실제
연결성을 검증했으며, 그 결과 두 갈래로 나뉜다 — **검증(verification)은 가능, 발견(discovery)은
제한적**이다.

- **검증 가능**: 이미 알고 있는 특정 URL(예: `casenote.kr/대법원/2015다218730`)에 `curl`로 직접
  접근해 실제 존재·내용 일치 여부를 확인할 수 있다. 실측: `https://casenote.kr` 응답 200, URL
  인코딩(한글 경로 percent-encoding) 후 `db/seed/evidence.json`의 기존 `seed-evidence-008`이
  인용한 "대법원 2015다218730(본소), 2015다218747(반소)" 판결 페이지가 실제로 존재하며, 페이지
  타이틀·사건 유형("채무부존재확인, 보험금")이 seed 레코드의 서술과 정합함을 직접 확인했다(25KB
  HTML, `<title>` 태그 검증) — seed의 이 인용이 지어낸 것이 아님을 이번 세션에서 독립적으로
  재확인했다.
- **발견은 제한적**: `casenote.kr`의 검색 엔드포인트(`/search/?q=...`)는 200을 반환하지만 응답
  본문에서 판례 인용 패턴이 검출되지 않았다 — 클라이언트 사이드 렌더링(SPA) 또는 별도 AJAX
  엔드포인트를 쓰는 것으로 추정되며, 이 세션에서 그 엔드포인트를 역공학하지 않았다. 국가법령정보센터
  Open API(`law.go.kr/DRF/lawSearch.do`)는 200을 반환하지만 실제 조회에는 등록된 `OC`(기관/개인
  식별자) 키가 필요하며, 이 세션은 그 키를 갖고 있지 않다.
- **결론**: "이미 아는 특정 판례/법령을 검증"하는 작업은 이 세션의 도구로도 가능하지만, "이 issueType에
  맞는 새 판례를 찾아낸다"는 발견 작업은 검색 API 접근(WebSearch, 또는 등록된 `law.go.kr` OC 키,
  또는 casenote.kr의 실제 검색 엔드포인트)이 있는 세션에서 수행해야 한다. 이 SPEC의 §5(spec.md)
  잔여 위험에 이미 명시했고, plan.md M1이 이 재확인을 run-phase 착수 조건으로 못박는다.

## §1. 기존 코드베이스 baseline (실측)

### 1.1 `db/seed/evidence.json` — 현재 10건

| id | category | evidenceType | scope | sourceUrl 유무 |
|----|----------|--------------|-------|----------------|
| seed-evidence-001 | 상해후유장해 | POLICY | DOMAIN_SPECIFIC | 있음(insclaim.co.kr) |
| seed-evidence-002 | 상해후유장해 | OTHER | DOMAIN_SPECIFIC | 없음(null) |
| seed-evidence-005 | 상해후유장해 | PRECEDENT | DOMAIN_SPECIFIC | 있음(casenote.kr, 대법원 2008다44689) |
| seed-evidence-006 | 상해후유장해 | OTHER | DOMAIN_SPECIFIC | 없음(null) |
| seed-evidence-007 | 상해후유장해 | STATUTE | DOMAIN_SPECIFIC | 있음(casenote.kr, 상법 제737조) |
| seed-evidence-003 | 질병후유장해 | POLICY | DOMAIN_SPECIFIC | 있음(insu-fit.com) |
| seed-evidence-004 | 질병후유장해 | OTHER | DOMAIN_SPECIFIC | 없음(null) |
| seed-evidence-008 | 질병후유장해 | PRECEDENT | DOMAIN_SPECIFIC | 있음(casenote.kr, 대법원 2015다218730 — 이번 세션 재검증 완료) |
| seed-evidence-009 | 질병후유장해 | OTHER | DOMAIN_SPECIFIC | 없음(null) |
| seed-evidence-010 | 공통 | STATUTE | UNIVERSAL | 있음(casenote.kr, 상법 제658조) |

관찰: `DISPUTE_CASE`(금융감독원 분쟁조정 등) evidenceType은 현재 0건이다. `category`는 자유
문자열("상해후유장해"/"질병후유장해"/"공통")이며 `CoverageDomain` enum과 `evidence-retriever.ts`의
`DOMAIN_CATEGORY_LABEL` 상수를 통해서만 매핑된다. `issueType`에 대응하는 필드는 evidence 쪽에
전혀 없다 — 이것이 spec.md REQ-EVIDENCE-006이 다루는 공백이다.

### 1.2 `lib/db/schema.ts` — `evidence` 테이블 (실측)

```
id, category, evidenceType(default "OTHER"), scope(default "DOMAIN_SPECIFIC"),
title, content, sourceUrl(nullable), createdAt
```

`issueTypes`/`keywords`/`sourceDate`/`sourceIdentifier` 컬럼 없음 — 전부 신규 추가 대상.

### 1.3 `lib/pipeline/query-planner.ts` — `ResearchQuery` 생성 규칙 (실측)

두 도메인마다 `DISABILITY_LOCATION`(또는 `DIAGNOSIS`) + `DISABILITY_GRADE_CRITERIA` +
`CAUSATION` 3개를 항상 생성(최소 6개/사건), 나머지 4개 issueType(`PRE_EXISTING_CONDITION`,
`INJURY_DISEASE_RELATION`, `INCIDENT_CIRCUMSTANCE`, `ADDITIONAL_CONFIRMATION_NEEDED`)은
사건 텍스트의 한국어 키워드 신호로 조건부 추가한다. `ResearchQuery.keywords`는 `focus`(장해
부위 또는 진단명) + issueType별 고정 문자열(예: "장해 평가 기준", "인과관계")로 구성된다 —
이것이 현재 Retriever가 사용하는 유일한 매칭 신호다.

### 1.4 `lib/pipeline/evidence-retriever.ts` — 현재 ranking (실측)

```
relevant = UNIVERSAL ? keywordScore > 0 : (domainMatch AND keywordScore > 0)
score = (domainMatch ? 2 : 0) + (isUniversal ? 1 : 0) + keywordScore
```

`keywordScore`는 `title`/`content`에 대한 단순 substring `.includes()` 카운트다. `TOP_N = 5`
(코드 주석이 이미 "seed 데이터 규모(10개)를 전제로 한 초기 파라미터"라고 자인, `@MX:WARN`).
동점 시 정렬 안정성(tie-break)이 명시적으로 정의되어 있지 않다 — Array.prototype.sort의 구현
의존적 안정성에 암묵적으로 기대고 있다(REQ-EVIDENCE-011이 이를 명시 규칙으로 만든다).

### 1.5 `lib/pipeline/researcher.ts` / `skeptic.ts` / `verifier.ts` — evidence-ID 계약 (실측, SPEC-GEMINI-RUNTIME-001에서 확정)

- Researcher: `supportingEvidenceIds.length >= 1`(빈 경우 그 항목만 개별 폐기), query별로 전달된
  evidence 부분집합만 인용 가능(격리, REQ-GEMINI-RUNTIME-008).
- Skeptic: 빈 evidence 배열 허용(비대칭), `supportingEvidenceIds`/`counterEvidenceIds` 별도 역할.
- Verifier: 위조 evidence ID를 조용히 제거(`lib/pipeline/verifier.ts:278` 부근), semantic
  fail-closed.

이 세 계약은 이번 SPEC이 절대 건드리지 않는 회귀 방지 대상이다(spec.md REQ-EVIDENCE-019/020).

## §2. 두 번의 실 Gemini smoke 관측 재확인

`.moai/reports/gemini-smoke-20260827.md`와 `.moai/reports/gemini-runtime-smoke-20260828.md`
모두 `counterEvidenceIds`가 3건 전부 빈 배열이었다. 두 리포트 모두 이미 "corpus 부족 확정"이라는
과잉 서술을 정정한 상태이며(각각 REQ-GEMINI-RUNTIME-010/020, post-run fix `fb23553`), 원인
후보 4가지(corpus 부족/Retriever 후보 부족/Skeptic prompt semantics/model behavior)는 두
리포트 모두 미확정으로 남겨두었다. 표본 n=2 — 통계적으로 결론을 내리기에는 작다.

## §3. 후보 공개 출처 (검증 방법론, 최종 확정 목록 아님)

아래는 §0의 발견-제한 때문에 이번 세션에서 실제로 조사·확정하지 못한 **후보 출처 카탈로그**다 —
run-phase M1이 실제 검색 도구로 이 카탈로그를 근거로 조사를 수행한다(plan.md M1).

| 출처 | evidenceType 대응 | 접근 방법(이번 세션 실측) |
|------|---------------------|---------------------------|
| 대법원 종합법률정보 / `casenote.kr` | PRECEDENT | 특정 URL 직접 접근은 가능(§0), 검색은 별도 엔드포인트 필요 |
| 국가법령정보센터(`law.go.kr`) | STATUTE | Open API 응답은 200이나 실 조회에는 등록 `OC` 키 필요 |
| 금융감독원 금융소비자보호처 분쟁조정사례 | DISPUTE_CASE | 이번 세션에서 접근 시도 안 함(run-phase 조사 대상) |
| 생명보험협회/손해보험협회 표준약관·장해분류표 | POLICY | 이번 세션에서 접근 시도 안 함(run-phase 조사 대상) |

## §4. metadata 필요성 분석 (REQ-EVIDENCE-005/006/007/027 근거, 외부 독립 리뷰 이슈 4 반영)

| 후보 필드 | 채택 여부 | 근거 |
|-----------|-----------|------|
| `issueTypes: QueryIssueType[]` | **채택(M1 확정)** | `evidence-retriever.ts`의 candidate eligibility(전략 B)와 score 함수가 `query.issueType`과 직접 비교할 대상이 evidence 쪽에 없다는 것이 §1.4에서 확인된 실제 공백 — REQ-EVIDENCE-008에 직접 소비됨. 이 SPEC이 plan-phase 시점에 확정하는 **유일한 필수 migration 대상**이다 |
| `keywords: string[]` | **보류(run-phase 재검토)** | 현재도 `title`/`content` substring 매칭이 동작하며, 명시적 keyword 필드가 substring 매칭보다 나은 recall/precision을 내는지 벤치마크(§D) 없이는 불명 — 신설 여부는 benchmark baseline 측정 후 결정 |
| `sourceUrl` | 이미 존재 | 스키마 변경 불필요 |
| `sourceDate` | **기각(M1)** | 판례 선고일 등 — 외부 독립 리뷰 지적대로, 이 SPEC의 어떤 코드 경로(ranking/benchmark/authenticity/dedup)도 `sourceDate`를 실제로 소비하지 않는다. "있으면 좋은 metadata"라는 이유만으로 추가하지 않는다(REQ-EVIDENCE-005/027) — ranking/authenticity 어느 쪽이든 실제 소비처가 후속 SPEC에서 입증되면 그때 재검토 |
| `sourceIdentifier`(사건번호/조문번호) | **조건부 채택(M1에는 미포함)** | design.md §6의 dedup 판정(`isDuplicate()`)이 실제 소비처로 확정됐다 — 이 컬럼을 추가하려면 그 dedup 코드와 함께 추가해야 하며(REQ-EVIDENCE-005), M1 스키마 migration에는 포함하지 않고 그 코드가 설계·구현되는 시점(M5)에 별도 migration으로 추가한다(design.md §1.2) |
| `claimant`/`insurer` stance | **기각** | 사용자 지시 §2가 명시적으로 배제, spec.md REQ-EVIDENCE-007 |
| argument-role(proposition 단위) | **기각(이번 SPEC)** | 근거 없이 스키마 확장 금지 원칙 적용 — 필요성이 입증되지 않음 |

### §4.1 기존 10건의 authenticity 재감사 필요성 (외부 독립 리뷰 이슈 5)

§1.1에서 이미 관찰했듯, `seed-evidence-001`(sourceUrl: `insclaim.co.kr`)과 `seed-evidence-003`
(sourceUrl: `insu-fit.com`)은 개인/중개 블로그성 도메인으로 보이며, REQ-EVIDENCE-002가 요구하는
"신뢰 가능한 공공기관 자료" 기준을 만족하는지 이번 plan-phase 세션에서 재검증하지 못했다(§0의
발견-제한과 별개로, 이 두 URL은 애초에 재확인 시도조차 하지 않았다 — §1.1은 `seed-evidence-005`/
`seed-evidence-008`(casenote.kr, 대법원)만 재검증했다). 이는 spec.md REQ-EVIDENCE-026(기존
10건 재감사)이 신설된 직접적 근거 중 하나다 — `POLICY` evidenceType이라는 이유로 이 두 레코드를
재감사 대상에서 제외해서는 안 된다.

## §5. Retrieval 지표 후보 (REQ-EVIDENCE-014 근거)

이 규모(수십~백여 건)의 curated corpus에서:

- **Recall@5**: "known-relevant 집합 중 top-5에 포함된 비율" — corpus가 작을 때 특히 의미 있음(모든
  관련 evidence를 놓치지 않는지가 우선 관심사).
- **Precision@5**: "top-5 중 실제 relevant 비율" — corpus가 작으면 애초에 무관한 후보가 섞일
  가능성 자체가 낮아 변별력이 떨어질 수 있음.
- **Hit@5**(Recall@5의 이진 변형, "최소 1개라도 top-5에 포함되는가"): 쿼리 단위 성공/실패를 더
  단순하게 보고 싶을 때 적합.

**권고(run-phase에서 실측으로 최종 확정)**: Recall@5를 주 지표로, Hit@5를 보조 지표로 채택하는
방향을 우선 검토한다 — corpus가 작을수록 "관련 있는 걸 다 찾아오는가"가 "무관한 걸 걸러내는가"보다
운영상 더 치명적이기 때문이다(무관한 evidence가 섞여도 Skeptic/Verifier가 이후 단계에서 걸러낼
여지가 있지만, 애초에 검색되지 않은 relevant evidence는 어떤 후속 단계도 복구할 수 없다). 최종
채택은 §D 벤치마크의 baseline 측정 결과를 본 뒤 확정한다(REQ-EVIDENCE-014, 임의 목표 선정 금지).
