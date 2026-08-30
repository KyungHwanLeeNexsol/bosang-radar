# SPEC-EVIDENCE-001 — Evidence Source Audit Manifest (M4)

design.md §5.3 확장 6-컬럼 형식. REQ-EVIDENCE-005(기존 10건 재감사) + REQ-EVIDENCE-002/021(신규 9건 curation)
결과를 함께 기록한다. 검토자는 이 run-phase 세션(WebFetch/WebSearch 실사용)이다.

**중요 — 이 세션의 scope 한계(정직 고지)**: 이번 세션은 SPEC-EVIDENCE-001 M4의 **pilot 범위**만
수행한다(plan.md M4c/4d/4e — benchmark freeze, algorithm effect, corpus expansion effect 측정 —
는 이번 세션에서 수행하지 않았다). 아래 표는 4a(재감사) + 4b(pilot 신규 확장)만을 다룬다.

## §A. 기존 10건 재감사 (REQ-EVIDENCE-005)

| id | evidenceType | sourceUrl 접근 확인일 | 원문 대조 결과 | issueTypes | issueTypes 검토 결과/tagging rationale | 결정(유지/OTHER downgrade/제외) | 검토자 |
|----|--------------|------------------------|----------------|------------|------------------------------------------|-----------------------------------|--------|
| seed-evidence-001 | POLICY | 2026-08-29 (WebFetch) | URL 생존 확인(나사손해사정법인). 내용은 실제 생명보험표준약관 장해분류표(관절 ROM 4단계 완전상실/심한/뚜렷한/약간의장해)를 정확히 반영 — 과장 없음. **다만 출처가 협회 공식 사이트가 아닌 민간 손해사정법인 재게시본**(design.md §5.1a "insclaim.co.kr 재검토 대상" 지적과 일치) — 이번 세션에서 생명보험협회·손해보험협회 공식 개별 URL을 찾지 못함(WebSearch로 Samsung Fire 공식 PDF `samsungfire.co.kr/foreign/support/pdf/PERMANENT DISABILITY PAYMENT TABLE.pdf` 등으로 동일 내용 교차검증만 확보). §5.1a 2차 출처 예외 조건("공식 source 현실적으로 확보 불가")에 해당한다고 판단해 유지. | 재검토(정확), 최초 판정과 동일하게 유지 | issueTypes(DISABILITY_LOCATION, DISABILITY_GRADE_CRITERIA)는 title/content(발목 관절, ROM 기준 지급률)와 정합. 변경 없음. | **유지** (POLICY, 2차 출처 사유 기록) | run-phase agent |
| seed-evidence-002 | OTHER | N/A (sourceUrl null) | 원문 대조 대상 없음(sourceUrl null, OTHER로 이미 분류됨). content 자체가 "특정 법령·판례에 근거한 확정 수치는 아니다"라고 스스로 한정해 과장 없음. | issueTypes=[]. 후유장해 진단서 발급 실무 요건(행정절차)이며 8개 QueryIssueType 중 안전하게 매핑되는 항목 없음 — 사유 기록. | **유지** | run-phase agent |
| seed-evidence-005 | PRECEDENT | 2026-08-29 (WebFetch + WebSearch 교차확인) | 사건 실재 확인(대법원 2009.11.26. 선고 2008다44689,44696, 채무부존재확인·보험금). **원문 대조 결과 content 일부 과장 발견** — 기존 content는 "원심이 기왕증 감액 주장에 대한 심리를 충분히 하지 않았다는 이유로 파기환송되었다"고 서술했으나, WebFetch·WebSearch 양쪽 모두 실제 파기환송 사유는 "피해일" 해석·자립지원자금 지급시기 쟁점이었고 기왕증 심리부족이 파기환송 사유였다는 근거는 확인되지 않음. **REQ-EVIDENCE-021(과장하지 않은 요약) 위반 소지로 판단해 이 세션에서 해당 문장을 삭제·수정**(기왕증 감액의 법적 근거 확인 판시만 남기고, 미확인 파기환송 사유 주장은 제거). | 재검토 결과 CAUSATION, PRE_EXISTING_CONDITION 태깅은 여전히 정확(기왕증 감액 법리 + 인과관계 법리를 함께 판시). 변경 없음. | **유지 (content 수정)** — evidenceType 변경 없음, content만 정정 | run-phase agent |
| seed-evidence-006 | OTHER | N/A (sourceUrl null) | "구체적 사건번호·결정일자를 특정할 수 있는 개별 사례는 확인되지 않았다"고 스스로 한정 — 과장 없음, 재검증 시에도 이 자기한정이 정확함을 재확인(개별 결정례 지어내지 않음). | issueTypes=[PRE_EXISTING_CONDITION] — content(기왕증 기여도 판단 요소)와 정합. 변경 없음. | **유지** | run-phase agent |
| seed-evidence-007 | STATUTE | 2026-08-29 (WebFetch) | 상법 제737조 조문 원문과 정확히 일치 확인("상해보험계약의 보험자는 신체의 상해에 관한 보험사고가 생길 경우에 보험금액 기타의 급여를 할 책임이 있다"). | issueTypes=[] — 총칙성 책임조항으로 특정 쟁점 분류 아님, 변경 없음. | **유지** | run-phase agent |
| seed-evidence-003 | **OTHER** (POLICY→OTHER **downgrade**) | 2026-08-30 (WebFetch M4 full) | URL 재접근 확인. **insu-fit.com은 마케팅·보험비교 설명글 사이트**임을 확인 — 페이지 title "질병후유장해보험 기준 완벽정리: 장해율 인정범위·청구서류·면책기간 한눈에", keywords에 "보험 비교" 포함, 공식 약관 원문이 아닌 블로그성 설명글. design.md §5.1a "POLICY는 공식 약관 원문이어야 함" 조건을 충족하지 못함. 따라서 POLICY→**OTHER downgrade** 결정. content 서술 자체는 정확하므로 corpus에서 제거하지는 않음 — evidenceType만 OTHER로 변경. | issueTypes=[DIAGNOSIS, CAUSATION] — 내용 적합성은 유지이나 OTHER type으로 ground truth 제외(AC-EVIDENCE-013 준수). | **OTHER downgrade** (사유: 마케팅/정보사이트, 공식 약관 원문 아님) | run-phase agent (M4 full, 2026-08-30) |
| seed-evidence-004 | OTHER | N/A (sourceUrl null) | 제3의료기관 감정 절차 활용 가능성이라는 일반 서술 — 특정 사례를 지어내지 않음. | issueTypes=[DISABILITY_GRADE_CRITERIA] — 감정 절차는 등급판정 기준의 일부, 정합. 변경 없음. | **유지** | run-phase agent |
| seed-evidence-008 | PRECEDENT | 2026-08-29 (WebFetch + WebSearch 교차확인) | 사건 실재 확인(대법원 2015.8.31. 선고 2015다218730,218747). WebFetch는 "후유장해지급률(30%) 합산 불가"를, WebSearch(로톡 칼럼 "같은 병명 다른 부위, 법원은 '별개 질병'으로 봤다")는 "진단명이 같더라도 발병 부위가 다르고 인과관계가 없으면 별개 질병"이라는 취지를 각각 독립적으로 확인 — 기존 content의 판시 요지 서술이 두 출처 모두와 정합, 과장 없음. | issueTypes=[DIAGNOSIS, CAUSATION] — "동일 질병 여부" 판단(진단명) + "인과관계" 요건과 정합. 변경 없음. | **유지** | run-phase agent |
| seed-evidence-009 | OTHER | N/A (sourceUrl null) | "구체적 사건번호·결정일자를 특정할 수 있는 개별 사례는 확인되지 않았다"는 자기한정 재확인, 과장 없음. | issueTypes=[CAUSATION] — 질병 간 인과관계·동일성 판단 일반 구조, 정합. 변경 없음. | **유지** | run-phase agent |
| seed-evidence-010 | STATUTE | 2026-08-29 (WebFetch) | 상법 제658조 조문 원문과 정확히 일치 확인(약정기간/10일 이내 지급 규정). | issueTypes=[] — 지급 절차·기한 조항으로 특정 쟁점 분류 아님, 변경 없음. | **유지** | run-phase agent |

**§A 요약**: 10건 중 1건(seed-evidence-005)은 content 수정, 1건(seed-evidence-003)은 M4 full 단계에서 OTHER downgrade. 나머지 8건은 최초 판정 그대로 통과. 
- seed-evidence-005: content에서 미검증 파기환송 사유 서술 제거(REQ-EVIDENCE-021)
- seed-evidence-003: insu-fit.com이 마케팅/보험비교 설명글 사이트임을 M4 full 재확인 → POLICY→OTHER downgrade, 기존 §C에 "배제했다"고 기록한 2010다25353은 결국 M4 full 단계에서 seed-evidence-021로 채택(고지의무·보험사고 인과관계 법리가 CAUSATION issueType과 연관성 있음을 재판단).
- seed-evidence-001(POLICY, insclaim.co.kr): 재게시본 2차 출처 예외로 유지(공식 협회 원문 미확보).

## §B. 신규 레코드 확장 (REQ-EVIDENCE-002, design.md §5.1/§5.1a) — pilot 9건

| id | evidenceType | sourceUrl 접근 확인일 | 원문 대조 결과 | issueTypes | issueTypes 검토 결과/tagging rationale | 결정(유지/OTHER downgrade/제외) | 검토자 |
|----|--------------|------------------------|----------------|------------|------------------------------------------|-----------------------------------|--------|
| seed-evidence-011 | POLICY | 2026-08-29 (WebFetch) | 생명보험표준약관 장해분류표(부표3) 척추 항목 원문과 일치(척추체 유합 개수별 지급률, 후만증/측만증 각도 기준, 추간판탈출증 지급률). 민간 손해사정법인 출처(insclaim.co.kr) — §5.1a 예외 사유 동일 적용. | DISABILITY_LOCATION(척추 부위) + DISABILITY_GRADE_CRITERIA(지급률 기준) 부여 — content가 두 쟁점 모두를 직접 다룸. | **채택(신규)** | run-phase agent |
| seed-evidence-012 | POLICY | 2026-08-29 (WebFetch) | 동일 출처, 손가락 장해 지급률(5개 상실 55%, 엄지 15%, 기타 각 10%) 원문과 일치. | DISABILITY_LOCATION + DISABILITY_GRADE_CRITERIA — 011과 동일 근거. | **채택(신규)** | run-phase agent |
| seed-evidence-013 | POLICY | 2026-08-29 (WebFetch) | 동일 출처, 발가락 장해 지급률(리스프랑관절 이상 40%, 5개 상실 30%, 엄지 10%) 원문과 일치. | DISABILITY_LOCATION + DISABILITY_GRADE_CRITERIA. | **채택(신규)** | run-phase agent |
| seed-evidence-014 | PRECEDENT | 2026-08-29 (WebFetch, 대법원 98다28114) | 사건 실재 확인(1998.10.13. 선고, 채무부존재확인). "외래의 사고" 정의 및 음주 후 구토 기도폐색 질식사 사안이 외래성 요건을 충족한다고 본 판시가 원문과 일치. | INCIDENT_CIRCUMSTANCE — 사고의 성격(외래성/우연성) 판단 쟁점, CAUSATION 등 다른 issueType은 이 판결의 핵심 쟁점이 아니므로 과도 태깅 회피 차원에서 부여하지 않음. | **채택(신규)** | run-phase agent |
| seed-evidence-015 | PRECEDENT | 2026-08-29 (WebFetch, 대법원 99다48245) | 사건 실재 확인(2000.9.8. 선고, 손해배상(기)). 치료 중 의료과실로 증상 악화/새 증상 발생 시 상당인과관계 인정 법리가 원문과 일치. | INJURY_DISEASE_RELATION(상해 이후 파생 증상과의 관계) + CAUSATION(상당인과관계 법리). | **채택(신규)** | run-phase agent |
| seed-evidence-016 | PRECEDENT | 2026-08-29 (WebFetch + WebSearch 교차확인, 대법원 2002다564) | 사건 실재 확인(2002.10.11. 선고, 보험금 — 사망보험금 사건). 기왕증 경합 시 감액 법리 + "사회적·법적 인과관계" 법리가 원문과 일치. **사망보험금 사건이므로 category="공통"/scope="UNIVERSAL"로 분류** — 후유장해 등급판정에 특정된 판시가 아니라 기왕증/인과관계 일반 법리이므로 도메인 특정 없이 배경 법리로만 사용, content에도 사망 사건이었음을 명시해 오인 방지. | CAUSATION + PRE_EXISTING_CONDITION — 판시가 두 쟁점의 핵심 법리를 모두 다룸. | **채택(신규)** | run-phase agent |
| seed-evidence-017 | **OTHER** (POLICY 아님) | 2026-08-29 (WebFetch) | "180일 확정" 조항 문구가 원문과 일치 확인. **다만 출처가 다음 카페(보영소, 사용자생성 커뮤니티 게시물)로, insclaim.co.kr(손해사정법인 법인 사이트)보다 신뢰도 티어가 낮다고 판단** — 여러 독립 검색 결과가 동일 문구로 수렴해 내용 정확성은 높으나, 공식·법인 출처가 아니므로 POLICY로 분류하지 않고 OTHER로 다운그레이드. | DISABILITY_GRADE_CRITERIA — 질병후유장해 지급률 확정 시점 기준. | **채택하되 OTHER로 다운그레이드(신규)** | run-phase agent |
| seed-evidence-018 | **OTHER** (POLICY 아님) | 2026-08-29 (WebFetch) | "장해 악화 시 재산정" 조항 문구가 원문과 일치. 017과 동일 사유(다음 카페 출처)로 OTHER 다운그레이드. category="공통"/scope="UNIVERSAL" — 원문 자체가 "생명보험·손해보험 다양한 상품에서 표준약관으로 사용"이라고 명시. | DISABILITY_GRADE_CRITERIA. | **채택하되 OTHER로 다운그레이드(신규)** | run-phase agent |
| seed-evidence-019 | POLICY | 2026-08-29 (WebFetch, cardif.co.kr) | BNP파리바카디프생명 공식 사이트("라이프스테이지" 가이드) 확인 — 해부병리/임상병리 전문의 현미경 소견 기준, 진단서 발급일이 아닌 조직검사 결과보고일 기준 진단확정이라는 내용이 원문과 일치. 실제 보험회사 공식 페이지이므로 POLICY로 분류(insclaim.co.kr류 손해사정법인보다 한 단계 높은 신뢰 등급으로 판단). content는 이 페이지가 명시적으로 확인한 범위(자격증 세부 요건 등 미기재 부분 제외)로 보수적으로 서술. | DIAGNOSIS — 질병 진단확정 방법/시점 기준. | **채택(신규)** | run-phase agent |

**§B 요약**: 9건 신규 채택 — evidenceType 분포는 POLICY 4건(011/012/013/019), PRECEDENT 3건
(014/015/016), OTHER 2건(017/018 — 다운그레이드), DISPUTE_CASE 0건, STATUTE 0건. **fabrication 없음**:
사건번호(98다28114/99다48245/2002다564/2015다218730 등)·조문 번호·sourceUrl 어느 것도 지어내지
않았으며, 검증 불가능한 세부(예: 019의 "전문의 자격증" 구체 요건)는 WebFetch가 실제로 확인한
범위로 content를 보수적으로 축소했다.

## §B2. M4 full 추가 레코드 (2026-08-30)

| id | evidenceType | sourceUrl 접근 확인일 | 원문 대조 결과 | issueTypes | issueTypes 검토 결과/tagging rationale | 결정 | 검토자 |
|----|--------------|------------------------|----------------|------------|------------------------------------------|------|--------|
| seed-evidence-020 | PRECEDENT | 2026-08-30 (casenote.kr WebFetch) | 대법원 2005. 10. 27. 선고 2004다52033 판결(보험금) 실재 확인. 기왕증 경합 시 후유장해지급률 합계로 지급의무 발생 여부 판단하고, 기왕증 감액은 보험금액 산정 단계에서 반영한다는 판시 확인. 내용이 판결문과 정합, 과장 없음. | CAUSATION + PRE_EXISTING_CONDITION + DISABILITY_GRADE_CRITERIA — 기왕증 기여도와 후유장해지급률 산정 법리 모두 다룸. | **채택(신규)** | run-phase agent (M4 full) |
| seed-evidence-021 | PRECEDENT | 2026-08-30 (casenote.kr WebFetch) | 대법원 2010. 7. 22. 선고 2010다25353 판결(보험계약해지무효확인) 실재 확인. 고지의무 위반과 보험사고 발생 간 인과관계 불문 해지 가능 + 인과관계 없으면 보험금 지급책임 존속이라는 판시 확인. 기존 §C에서 "쟁점이 계약 해지 요건"으로 배제했으나, CAUSATION(인과관계 법리) 쟁점과의 연관성을 재검토해 채택. **post-correction(Fix4, 2026-08-30)**: DIAGNOSIS 태깅 제거 — 이 판례는 고지의무/계약해지 쟁점이며 "질병후유장해의 diagnosisName 확인" QueryPlanner DIAGNOSIS issueType과 다르다. CAUSATION만 유지. | CAUSATION — 인과관계 법리(고지의무 위반과 보험사고 간 인과관계). DIAGNOSIS 제거(과도 태깅). | **채택(신규), DIAGNOSIS 태깅 제거됨** | run-phase agent (M4 full), Fix4 보정 2026-08-30 |

## §C. Pilot 목표 대비 shortfall — 정직 고지 (REQ-EVIDENCE-002 우선)

이번 세션의 신규 확장은 9건으로, task가 제시한 "15~20건" 목표에 미달한다. 그 사유를 아래에
정직하게 기록한다 — 목표 개수를 채우기 위해 검증 불가능한 레코드를 추가하지 않았다:

1. **DISPUTE_CASE(금융감독원 분쟁조정) 0건 도입** — plan.md M4b가 명시한 "DISPUTE_CASE 최소 1건
   도입" 목표를 이번 세션에서 달성하지 못했다. 시도한 경로: (a) WebSearch로 개별 조정결정번호를
   특정하려는 검색 5회 이상 시도 — 금융감독원(fss.or.kr)의 분쟁조정 사례는 대부분 연간
   결정사례집(PDF)으로만 공개되고 개별 결정 단위의 안정적 URL이 없음을 확인. (b) 손해보험협회(KNIA)
   "2021년 손해보험 관련 금융분쟁조정위원회 주요 결정사례" PDF, 보험연구원(KIRI) "암보험 관련 주요
   분쟁사례 연구" PDF를 WebFetch로 시도했으나 **두 PDF 모두 텍스트 추출이 실패**(바이너리/폰트
   인코딩 문제로 도구가 내용을 판독하지 못함 — `.tool-results/webfetch-*.pdf`에 원본 저장됨,
   검증 시도의 증거로 남김). 지어낸 조정번호나 결정 내용을 production evidence에 넣지 않았다.
2. **일부 issueType 셀은 여전히 목표 미달** — coverage-matrix.md §신규 참고. 특히
   `ADDITIONAL_CONFIRMATION_NEEDED`(양 도메인), `INCIDENT_CIRCUMSTANCE`(질병후유장해)는 이번
   pilot에서 신규 레코드를 확보하지 못했다 — 검색은 시도했으나(예: "장해분류표에 없는 장해 → 유사
   장해 준용" 조항) 확인된 근거가 사설보험이 아닌 산업재해보상보험법 시행령 제53조제3항(별개 법
   영역)에 귀속되는 것으로 드러나, 이 SPEC의 도메인(민간 상해·질병 보험)에 그대로 적용된다고
   단정할 근거가 부족해 채택하지 않았다(도메인 혼동 방지).
3. ~~**의도적으로 배제한 후보**: 대법원 2010. 7. 22. 선고 2010다25353(고지의무 위반과 질병 발병 간 인과관계 부존재에도 계약해지 가능) — [M4 pilot §C에서 배제 결정 후 M4 full에서 재검토 반전]~~ **→ seed-evidence-021로 최종 채택(M4 full)**. 재검토 결과: CAUSATION 쟁점(인과관계 불요 원칙)은 QueryPlanner CAUSATION issueType과 접점이 있다고 재판단. 단 DIAGNOSIS 태깅은 제거(Fix4, 2026-08-30): 고지의무/계약해지 판례는 QueryPlanner DIAGNOSIS issueType("질병후유장해의 diagnosisName 확인 쟁점")이 아니다.

**"honest 9건이 20건보다 낫다"는 원칙(task 지시)에 따라, 이 shortfall은 M4b의 잔여 작업으로
남긴다 — 이후 세션에서 (a) 금융감독원 분쟁조정 사례집 PDF의 텍스트 추출 도구를 별도로 확보하거나
(b) 유료 판례 DB(로앤비/케이스노트 PRO) 접근이 가능해지면 DISPUTE_CASE 및 잔여 issueType 셀을
채울 것을 권고한다.

---

작성: run-phase agent (WebFetch/WebSearch 실사용), 2026-08-29. 이 manifest는
design.md §5.3의 6-컬럼 형식(id/evidenceType/sourceUrl 접근확인일/원문대조결과/issueTypes/
issueTypes검토결과/결정/검토자)을 그대로 따른다.
