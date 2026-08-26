# SPEC-RESEARCH-001 — Progress Log

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready (3차 revision, 3차 plan-audit — 결함 1건 발견·수정 완료)
- plan_complete_at: 2026-08-26 (최초 작성)
- last_revision_at: 2026-08-26 (3차 plan revision — 사용자 지시 4개 항목)
- tier: L
- artifacts: spec.md, plan.md, acceptance.md, design.md, research.md (5/5, Tier L set complete)
- REQ count: 25 / 25 (Tier L ceiling — 3차 revision에서도 신규 REQ 추가 없음; 항목 1/2는 REQ-RESEARCH-018/019 Then-절 확장으로 흡수)
- AC count: 25 / 25 (Tier L ceiling — 3차 revision에서도 신규 AC 추가 없음; 항목 1/2는 AC-RESEARCH-017/018 Then-절 확장으로 흡수; AC-RESEARCH-011은 011a/011b 서브-기준으로 분할, 여전히 1개 top-level 슬롯으로 집계)
- depends_on: SPEC-SCAFFOLD-001 (completed), SPEC-RUNTIME-001 (completed) — both fulfilled

### 이력

1. **최초 작성** (커밋 `3e51044`) — spec/plan/acceptance/design/research 5종 산출물 작성. 커밋 메시지 기록: plan-audit PASS (0.857/0.85). 로컬 audit 리포트 아티팩트(`.moai/reports/plan-audit/`)는 gitignore 정책상 현재 워킹 트리에 남아 있지 않음(관측 결과 재확인 — SPEC-RUNTIME-001과 동일한 정책).
2. **1차 revision** (커밋 `3e51044`에 포함, 별도 커밋 없음) — D1/D2 결함 수정: `verify()`에 `evidence` 인자 추가(3번째) + `provider`를 4번째 인자로 이동(당시에는 선택적 기본값 유지).
3. **2차 revision** (커밋 `e1d8ffb`) — 사용자 지시 8개 항목 반영: ① Gemini `responseJsonSchema` 전환, ② `research`/`challenge`/`verify` provider 필수 인자화, ③ QueryPlanner 6-쿼리 기준 acceptance 정합, ④ CaseNormalizer 책임 분리(QueryPlanner CoverageDomain 타입으로 이관), ⑤ Skeptic evidence 연결 강화(`Challenge.supportingEvidenceIds`/`counterEvidenceIds`), ⑥ EvidenceRetriever universal 관련성 규칙(`scope` 축 신설), ⑦ seed 4→10 curated 레코드 확장 결정. 신규 REQ/AC 없이 기존 항목의 Then-절/scope 확장으로 8개 항목 전부 처리(Tier L 상한 유지). 상세 변경 근거는 spec.md HISTORY 참고.
4. **2차 plan-audit 재수행 + 결함 수정** (커밋 `e1d8ffb`에 포함) — plan-auditor 독립 재검토 결과 **PASS 0.92**(Tier L 기준 0.85). 발견된 결함 2건 — design.md `verify()` evidence 인자 타입 표기 오류(`EvidenceCandidate[]` → `Map<string, EvidenceCandidate[]>`), plan.md M2의 잘못된 마일스톤 참조(M4 → M5) — 를 manager-spec에 재위임해 수정, orchestrator가 grep으로 직접 재검증 완료.
5. **3차 revision** (아직 미커밋) — 사용자 지시 4개 항목 반영: ① Verifier 반환 계약을 `VerificationResult`(`{ verifiedClaims, missingMaterials, uncertainty }`)로 명시화(design.md §3/§8, plan.md M3/M5, acceptance.md AC-RESEARCH-017/018), ② `VerifiedClaim.counterArguments`를 `string[]`에서 `VerifiedCounterArgument[]`로 구조화해 Skeptic evidence 연결을 최종 리포트까지 보존(design.md §7/§8, spec.md REQ-RESEARCH-018/019), ③ plan.md M2/M5에 남아 있던 "세 파일이 `deterministic.ts`를 직접 import한다"는 낡은 서술 제거·정정(2차 revision 항목 2의 필수-인자 설계와의 모순 해소), ④ `getLLMProvider(env)`의 env-source 일관성 명시(design.md §1) + 프로덕션 curated seed 소싱 규율 추가(design.md §6). 신규 REQ/AC 없이 기존 REQ-RESEARCH-018/019 및 AC-RESEARCH-017/018의 Then-절 확장으로 4개 항목 전부 처리(Tier L 상한 유지). 상세 변경 근거는 spec.md HISTORY 참고.
6. **3차 plan-audit 재수행 + 결함 수정** (아직 미커밋) — plan-auditor 독립 재검토 결과 **점수 0.857**(2차 0.92 대비 하락 → LEAN 워크플로 score-regression STOP 절차에 따라 절차상 FAIL로 처리). 신규 결함 1건 발견: `verify()` 반환 타입이 항목 1로 `VerificationResult`로 바뀌었는데 AC-RESEARCH-019(When-절)가 옛 반환 형태(`VerifiedClaim[]` + 별도 `uncertainty`)를 그대로 언급해 모순 — manager-spec에 재위임해 `VerificationResult`(및 그 안의 `VerifiedCounterArgument.summary`) 기준으로 정정, orchestrator가 grep으로 직접 재검증 완료(다른 AC/파일은 건드리지 않았음을 diff stat으로 확인). plan-auditor 본인이 "이 결함은 범위가 좁은 한 줄 수정이므로 전체 재감사는 불필요, 정정 후 해당 결함만 재확인하면 된다"고 명시적으로 권고했으므로, 별도의 4차 plan-auditor 전체 재실행 없이 orchestrator의 scoped 재검증으로 마무리한다(1·2차 revision에서도 동일한 패턴 적용).

- Prepared by: manager-spec (plan-phase revision) + plan-auditor (3차 독립 재검토)
- Next step: **Implementation Kickoff Approval 대기**. 3차 plan-audit에서 나온 결함 1건이 수정·재검증 완료됐고, 4개 항목 전부와 이전 라운드의 모든 수정 사항이 spec/plan/acceptance/design/progress 5종 문서에 일관되게 반영돼 있다. `/moai run SPEC-RESEARCH-001` 실행 시 Phase 1 Plan Audit Gate는 스킵 조건(PASS + 점수 임계값 충족 + 아티팩트 해시 불변)을 재검토한다 — 이번 라운드는 점수 0.857이 절차상 FAIL로 기록됐으므로, 스킵 여부는 오케스트레이터가 이 fix 이후 상태를 근거로 판단해야 한다. 구현(run-phase)은 사용자의 명시적 지시 전까지 시작하지 않는다.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
