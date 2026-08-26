# SPEC-RESEARCH-001 — Progress Log

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready (4차 revision, 4차 plan-audit — 전체 재감사 PASS 0.923)
- plan_complete_at: 2026-08-26 (최초 작성)
- last_revision_at: 2026-08-26 (4차 plan revision — 사용자 지시 3개 항목)
- tier: L
- artifacts: spec.md, plan.md, acceptance.md, design.md, research.md (5/5, Tier L set complete)
- REQ count: 25 / 25 (Tier L ceiling — 4차 revision에서도 신규 REQ 추가 없음; 항목 1/2/3은 REQ-RESEARCH-018/019/023 Then-절 확장으로 흡수)
- AC count: 25 / 25 (Tier L ceiling — 4차 revision에서도 신규 top-level AC 추가 없음; 항목 1/3은 AC-RESEARCH-016/021 Then-절 확장으로 흡수; 항목 2는 AC-RESEARCH-019a/019b 서브-기준 신설(011a/011b와 동일 패턴)로 흡수, 여전히 1개 top-level 슬롯으로 집계)
- depends_on: SPEC-SCAFFOLD-001 (completed), SPEC-RUNTIME-001 (completed) — both fulfilled

### 이력

1. **최초 작성** (커밋 `3e51044`) — spec/plan/acceptance/design/research 5종 산출물 작성. 커밋 메시지 기록: plan-audit PASS (0.857/0.85). 로컬 audit 리포트 아티팩트(`.moai/reports/plan-audit/`)는 gitignore 정책상 현재 워킹 트리에 남아 있지 않음(관측 결과 재확인 — SPEC-RUNTIME-001과 동일한 정책).
2. **1차 revision** (커밋 `3e51044`에 포함, 별도 커밋 없음) — D1/D2 결함 수정: `verify()`에 `evidence` 인자 추가(3번째) + `provider`를 4번째 인자로 이동(당시에는 선택적 기본값 유지).
3. **2차 revision** (커밋 `e1d8ffb`) — 사용자 지시 8개 항목 반영: ① Gemini `responseJsonSchema` 전환, ② `research`/`challenge`/`verify` provider 필수 인자화, ③ QueryPlanner 6-쿼리 기준 acceptance 정합, ④ CaseNormalizer 책임 분리(QueryPlanner CoverageDomain 타입으로 이관), ⑤ Skeptic evidence 연결 강화(`Challenge.supportingEvidenceIds`/`counterEvidenceIds`), ⑥ EvidenceRetriever universal 관련성 규칙(`scope` 축 신설), ⑦ seed 4→10 curated 레코드 확장 결정. 신규 REQ/AC 없이 기존 항목의 Then-절/scope 확장으로 8개 항목 전부 처리(Tier L 상한 유지). 상세 변경 근거는 spec.md HISTORY 참고.
4. **2차 plan-audit 재수행 + 결함 수정** (커밋 `e1d8ffb`에 포함) — plan-auditor 독립 재검토 결과 **PASS 0.92**(Tier L 기준 0.85). 발견된 결함 2건 — design.md `verify()` evidence 인자 타입 표기 오류(`EvidenceCandidate[]` → `Map<string, EvidenceCandidate[]>`), plan.md M2의 잘못된 마일스톤 참조(M4 → M5) — 를 manager-spec에 재위임해 수정, orchestrator가 grep으로 직접 재검증 완료.
5. **3차 revision** (아직 미커밋) — 사용자 지시 4개 항목 반영: ① Verifier 반환 계약을 `VerificationResult`(`{ verifiedClaims, missingMaterials, uncertainty }`)로 명시화(design.md §3/§8, plan.md M3/M5, acceptance.md AC-RESEARCH-017/018), ② `VerifiedClaim.counterArguments`를 `string[]`에서 `VerifiedCounterArgument[]`로 구조화해 Skeptic evidence 연결을 최종 리포트까지 보존(design.md §7/§8, spec.md REQ-RESEARCH-018/019), ③ plan.md M2/M5에 남아 있던 "세 파일이 `deterministic.ts`를 직접 import한다"는 낡은 서술 제거·정정(2차 revision 항목 2의 필수-인자 설계와의 모순 해소), ④ `getLLMProvider(env)`의 env-source 일관성 명시(design.md §1) + 프로덕션 curated seed 소싱 규율 추가(design.md §6). 신규 REQ/AC 없이 기존 REQ-RESEARCH-018/019 및 AC-RESEARCH-017/018의 Then-절 확장으로 4개 항목 전부 처리(Tier L 상한 유지). 상세 변경 근거는 spec.md HISTORY 참고.
6. **3차 plan-audit 재수행 + 결함 수정** (커밋 미완료 상태에서 수행) — plan-auditor 독립 재검토 결과 **점수 0.857**(2차 0.92 대비 하락 → LEAN 워크플로 score-regression STOP 절차에 따라 절차상 FAIL로 처리). 신규 결함 1건 발견: `verify()` 반환 타입이 항목 1로 `VerificationResult`로 바뀌었는데 AC-RESEARCH-019(When-절)가 옛 반환 형태(`VerifiedClaim[]` + 별도 `uncertainty`)를 그대로 언급해 모순 — manager-spec에 재위임해 `VerificationResult`(및 그 안의 `VerifiedCounterArgument.summary`) 기준으로 정정, orchestrator가 grep으로 직접 재검증 완료(다른 AC/파일은 건드리지 않았음을 diff stat으로 확인). plan-auditor 본인이 "이 결함은 범위가 좁은 한 줄 수정이므로 전체 재감사는 불필요, 정정 후 해당 결함만 재확인하면 된다"고 명시적으로 권고했으므로, 그 시점에는 전체 재실행 없이 orchestrator의 scoped 재검증으로 마무리했다(1·2차 revision에서도 동일한 패턴 적용).
7. **4차 revision** (아직 미커밋) — 사용자 지시 3개 항목 반영: ① Challenge↔DraftFinding 연결 무결성 — `buildChallengeSchema()`에서 `findingId` 필드를 제거하고 `challenge()`가 `finding.queryId`를 코드에서 직접 부여하도록 design.md §7 정정(LLM이 존재하지 않는 finding 식별자를 지어내 Verifier 연결에 쓰이는 경로 원천 차단), AC-RESEARCH-016 Then-절에 `findingId === finding.queryId` 동등성 검증 추가; ② evidence 부족/구조화 실패 → INSUFFICIENT 경로 명확화 — `verify()`에 `queries: ResearchQuery[]` 인자 신설(design.md §3/§7), Researcher의 no-forced-finding 원칙과 Verifier의 query↔finding 대조·`missingMaterials.relatedIssueType` 산출 로직을 design.md §7에 신설, REQ-RESEARCH-019 Then-절 확장, AC-RESEARCH-019a(evidence 0건)/019b(structured validation 실패) 신규 서브-기준(011a/011b와 동일 관례) 추가; ③ ResearchReport counterArguments 계약 정합화 — REQ-RESEARCH-023 및 spec.md §1 WHAT 서술이 `counterArguments`를 top-level 필드처럼 잘못 표현하던 것을 `verifiedClaims[].counterArguments`(design.md §8과 일치하는 중첩 구조)로 정정, AC-RESEARCH-021 Then-절에 `VerifiedCounterArgument[]` shape 검사 보강. 신규 REQ/AC 번호 없이 기존 REQ-RESEARCH-018/019/023 및 AC-RESEARCH-016/019/021의 Then-절 확장(+ 019a/019b 서브레터)으로 3개 항목 전부 처리(Tier L 상한 유지). 상세 변경 근거는 spec.md HISTORY 참고.
8. **4차 plan-audit 재수행(전체, scoped 아님)** (아직 미커밋) — 사용자가 이번에는 "scoped grep 검증으로 끝내지 말고 최종 상태 전체에 대해 plan-auditor를 다시 실행"하도록 명시적으로 지시. **절차상 참고**: spec-workflow.md의 Retry Loop Contract는 SPEC plan-phase당 plan-auditor 최대 3회 반복을 규정하며, 이번 실행은 (iter1 0.857 PASS → iter2 0.92 PASS → iter3 0.857 절차상 FAIL/scoped 재검증) 이후의 **4번째** 호출이다 — 이 4차 실행은 iter3까지의 자동 반복이 아니라, 이 세션에서 사용자가 직접·명시적으로 지시한 별도의 전체 재감사이므로, Retry Loop Contract가 요구하는 "iter3 이후 명시적 사용자 override" 요건을 이 지시 자체가 충족한다.
   - **결과: PASS, 점수 0.923**(Tier L 기준 0.85 통과). Must-pass 7개 항목 전부 PASS/N-A. 카테고리 점수(조화평균): Clarity 1.0 / Completeness 1.0 / Testability 1.0 / Traceability 0.75.
   - **발견 사항 4건, 그중 3건(D1/D2/D4)을 orchestrator가 즉시 반영**: D1(§D 매트릭스에 REQ-RESEARCH-015 행 누락 — 각주로만 존재) → 매트릭스에 `REQ-RESEARCH-015 | AC-RESEARCH-009` 행 추가; D2(§A가 "AC는 정확히 1개의 REQ를 검증"이라 단언하나 AC-009/AC-024는 각각 REQ 2개를 검증 — 자기모순) → §A 문구를 두 예외를 명시하는 형태로 정정; D4(AC-RESEARCH-019a 문장 내 `emptyEvidenceMap`/`evidenceMap` 변수명 불일치) → `emptyEvidenceMap`으로 통일. D3(SPEC 폴더 내부에 우발적으로 생성된 미추적 런타임 캐시 디렉터리 `.moai/specs/SPEC-RESEARCH-001/.moai/state/`)는 SPEC 문서 내용이 아닌 실행 부산물이므로 삭제로 정리(git에 추적된 적 없음, 삭제로 인한 손실 없음).
   - **주의**: 위 D1/D2/D4 정정은 0.923 검증 이후에 이루어진 추가 편집이므로, 이 검증이 참조한 plan-artifact 해시는 이 정정들을 포함하지 않는다 — 다음 `/moai run` 진입 시 Phase 1 Plan Audit Gate의 스킵 조건(아티팩트 해시 불변) 중 하나가 성립하지 않아 자동 스킵되지 않고 Phase 1이 실제로 재실행될 것으로 예상되며, 이는 정상적인 동작이다(게이트는 어떤 harness 레벨에서도 비활성화되지 않음).
   - 리포트 파일: `.moai/reports/plan-audit/SPEC-RESEARCH-001-review-4.md`, `.moai/reports/plan-audit/SPEC-RESEARCH-001-2026-08-26.md`.

- Prepared by: manager-spec (plan-phase revision, 4차) + plan-auditor (4차 독립 전체 재감사) + orchestrator (D1/D2/D4 정정 + D3 정리)
- Next step: **Implementation Kickoff Approval 대기**. 4차 plan-audit이 Tier L 기준을 만족하는 명시적 PASS(0.923)를 반환했고, 남은 결함(D1/D2/D4)은 즉시 정정, D3(우발적 캐시 디렉터리)는 제거했다. 이 세션에서는 아직 어떤 것도 커밋하지 않았다 — 커밋·푸시 및 `/moai run SPEC-RESEARCH-001`(구현 착수)은 사용자의 명시적 지시 전까지 시작하지 않는다.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
