# SPEC-RESEARCH-001 — Progress Log

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready (Phase 1 Plan Audit Gate — 5차 plan-audit PASS 1.0, `/moai run` 진입 완료)
- plan_complete_at: 2026-08-26 (최초 작성)
- last_revision_at: 2026-08-26 (4차 plan revision — 사용자 지시 3개 항목)
- audit_verdict: PASS
- audit_report: .moai/reports/plan-audit/SPEC-RESEARCH-001-review-5.md
- audit_at: 2026-08-26
- auditor_version: plan-auditor (5차 독립 재검토)
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

9. **4차 revision 커밋·푸시** (커밋 `872b4dc`) — 4차 plan revision 3개 항목 + 4차 plan-audit의 D1/D2/D4 후속 정정을 5개 문서(spec/plan/acceptance/design/progress.md)에 담아 `plan/SPEC-RESEARCH-001` 브랜치에 커밋 후 `origin`으로 푸시(fast-forward, force 아님). 사용자의 명시적 "커밋푸시해봐" 지시로 수행. PR 존재 여부는 이 환경에 `gh` CLI가 없어 확인하지 못함 — GitHub 웹에서 수동 확인 필요.
10. **Phase 1 Plan Audit Gate — 5차 plan-audit (`/moai run SPEC-RESEARCH-001` 진입)** (커밋 `872b4dc` 상태 대상) — 9번 커밋으로 plan-artifact 해시가 4차 감사(0.923) 시점과 달라져 스킵 조건(해시 불변)이 성립하지 않았으므로, `/moai run` Phase 1 게이트가 캐시를 쓰지 않고 plan-auditor를 새로 실행. **결과: PASS, 점수 1.0**(Clarity/Completeness/Testability/Traceability 전부 1.0). Must-pass 5 PASS + 2 N/A, FAIL 0건. 4차 감사에서 나온 D1/D2/D3/D4 전부 해소 확인(회귀 없음). 신규 발견 4건 중 3건(D5/D6/D8)은 optional/cosmetic로 정정 불필요, D7(SPEC 폴더 안에 우발 생성된 빈 `.claude/agent-memory/plan-auditor/` 디렉터리)은 orchestrator가 즉시 삭제(추적된 적 없음, 손실 없음). D8이 지적한 progress.md "Next step" 문구의 오래된 서술(커밋 전이라던 부분)은 이 항목으로 갱신해 해소.
    - **절차상 참고**: 이번은 이 SPEC에 대한 **5번째** plan-auditor 호출이며, plan-auditor 본인도 반복 상한 초과를 재차 지적했다. 다만 이 5번째 호출은 iter1~3의 자동 반복이 아니라 (a) 사용자의 명시적 4차 전체 재감사 지시, (b) `/moai run` 진입 시 매번 실행되는 필수 게이트(harness 레벨과 무관하게 스킵 불가) — 두 가지 별도의 정당한 트리거에 의한 것이므로, plan-phase 저작 단계의 3회 재시도 한도와는 다른 컨텍스트다. plan-auditor의 권고대로 이 PASS(1.0)를 최종으로 삼고 6번째 호출은 하지 않는다.
    - 리포트 파일: `.moai/reports/plan-audit/SPEC-RESEARCH-001-review-5.md`.

- Prepared by: manager-spec (plan-phase revision, 4차) + plan-auditor (4차·5차 독립 감사) + manager-git (커밋·푸시) + orchestrator (D1/D2/D4/D7 정정)
- Next step: **Implementation Kickoff Approval 승인 완료** — 사용자가 AskUserQuestion에서 "지금 시작"(TDD, 자동 진행, 새 feat 브랜치 생성)을 선택했다. `feat/SPEC-RESEARCH-001` 브랜치를 `plan/SPEC-RESEARCH-001`의 HEAD(`872b4dc`)에서 새로 만들고(커밋 `e2f9a4c`로 이 Phase 1 게이트 기록을 반영), M1부터 구현을 시작한다.

## §F Phase 4 Mode Selection

- **Input parameters**: tier=L, scope≈17개 파일(신규: deterministic.ts/provider-factory.ts/query-planner 테스트; 수정: types.ts, schema.ts, provider.ts, gemini.ts, env.ts, index.ts, evidence-retriever.ts, evidence.json, db-seed.ts, researcher.ts, skeptic.ts, verifier.ts, page.tsx, run-e2e.ts, e2e/*.spec.ts + 각 대응 테스트 파일), domain count=4(타입 계약/AI provider/DB·evidence/파이프라인 단계+UI+E2E), file language mix=100% TypeScript, concurrency benefit=LOW(코딩 중심 — Anthropic coding-task parallelism caveat).
- **Mode evaluation**: Mode 1 trivial — 대상 아님(비자명한 다중 파일 변경). Mode 2 background — 대상 아님(순차적 상호 의존 마일스톤). Mode 3 agent-team — RETIRED, 선택 불가. Mode 4 parallel — 코딩 중심 작업이라 부적합(연구/리뷰용). Mode 6 workflow — 단일 규칙의 기계적 변환이 아니라 의미론적 구현이므로 부적합. **Mode 5 sub-agent(Full Pipeline envelope) — 선택**.
- **Decision**: Scale-based mode: sub-agent (files: ~17, domains: 4) — plan.md의 M1~M6 마일스톤 순서를 그대로 따라 manager-develop을 마일스톤당 1회 순차 위임한다.
- **Justification**: 이 SPEC은 타입 계약 확정(M1) → provider 인터페이스(M2) → 오케스트레이터 배선(M3) → evidence 검색(M4) → 3단계 LLM 로직(M5) → UI/E2E(M6)로 이어지는 강한 순차 의존성을 갖고, plan.md §A가 이미 "변경 가능성이 가장 높은 결정을 먼저 배치"하는 순서로 설계돼 있다. Anthropic의 코딩 작업 병렬성 경고("대부분의 코딩 작업은 리서치보다 진짜 병렬화 가능한 작업이 적다")에 따라 구현은 Mode 5 순차 sub-agent로 진행한다.

## §E.2 Run-phase Evidence

M1~M6 + 회귀 정합화, 총 8개 커밋으로 `feat/SPEC-RESEARCH-001` 브랜치(로컬, 아직 push 안 함)에 순차 구현:

| 마일스톤 | 커밋 | 요지 |
|---|---|---|
| (진입) | `e2f9a4c` | feat 브랜치 생성 + Phase 1 게이트 기록 |
| M1 | `0e2625d` | 타입 계약 확정(types.ts) + evidence 스키마 확장(schema.ts, 마이그레이션) — `status: draft → in-progress` |
| M2 | `f0a5082` | `LLMProvider.generateStructured()` + Gemini/결정론적 provider + provider-factory + env.ts 게이트 |
| M3 | `468d885` | `runPipeline()` provider 배선(queries 인자 포함) + QueryPlanner 규칙 기반 재작성 |
| M4 | `a845a27` | EvidenceRetriever DB 필터/스코어링(도메인 AND 키워드) + seed 4→10건 확장(4건은 웹 검증된 실제 법령/판례, 2건은 검증 불가로 의도적 비인용) |
| M5 | `cc5b484` | Researcher/Skeptic/Verifier evidence-first 재작성 — `findingId` 코드 부여, `verify()`의 `queries` 인자·`missingMaterials` 대조 로직, `mock-llm.ts` 폐지 |
| M6 | `4bfb5d9` | UI(`page.tsx`) `verifiedClaims`/`reviewTargets`/`missingMaterials` 반영 + E2E `LLM_PROVIDER_MODE=deterministic` |
| 회귀 정합화 | `60fe95f` | SPEC과 무관하게 낡아있던 기존 테스트 4건(env.test.ts/provision-tester.test.ts/create-case.test.ts×2) + 포맷 7건 정정 |

각 마일스톤은 orchestrator가 커밋 직후 독립적으로 재검증(테스트 재실행, 코드 직접 열람)했다 — 서브에이전트 자기보고를 그대로 신뢰하지 않았다.

### 코드 리뷰 발견 merge-blocking 결함 + post-run fix (M1~M6 이후, 별도 SPEC 없이 동일 SPEC에서 처리)

M1~M6 구현이 push된 뒤 진행된 코드 리뷰에서 6건의 결함(P0 3건/P1 2건/조사 1건)이 발견되어, 사용자 지시에 따라 새 SPEC을 만들지 않고 이 SPEC의 post-run fix로 처리했다. `/moai sync`는 아직 실행하지 않는다(사용자 명시적 지시).

| 항목 | 커밋 | 요지 |
|---|---|---|
| Fix-A (P0) | `d03a00d` | 신규 `lib/pipeline/safety-validator.ts` — 보험금 지급확정/반드시 지급/숫자%·확률/근거없는 액수 확정 표현을 정규식으로 차단하는 공용 validator. `researcher.ts`의 structured 결과에 적용해, 금지 표현이 감지된 finding은 억지로 만들지 않고 건너뛴다(기존 evidence-부재/구조검증실패 경로와 동일). adversarial fixture("보험금 지급 확률은 95%입니다." 등)로 직접 검증. |
| Fix-B (P0, **가장 중요한 결함**) | `888f8e8` | `verifier.ts`가 `provider`를 인자로 받고도 `void provider`로 버린 채 evidence-ID **존재 여부만** 검사하던 결함 — 실존하지만 무관한 evidence 하나만 인용해도 VERIFIED가 되던 구조를 수정. 기존 구조적 evidence-ID 검증은 그대로 유지한 위에, 사건당 1회 배치 structured call로 LLM 기반 의미 검증(evidence 내용이 claim을 실제로 뒷받침하는지)을 추가. `queryId`는 candidate 집합과 정확히 1:1 대응하도록 `.refine()`으로 강제(LLM이 식별자를 지어낼 수 없음 — M5의 `findingId` 원칙과 동일). **구조화 호출 자체가 실패하면 fail-open하지 않고 해당 배치 전체를 INSUFFICIENT로 처리**(명시적 요구사항, 코드로 직접 확인). safety-validator를 최종 출력(claim summary + counterArguments summary)에도 defense-in-depth로 재적용. |
| Fix-C (P0+P1) | `ffb9695`, `f60c2c6`(포맷) | `page.tsx`에서 `VerifiedClaim.status`가 전혀 표시되지 않아 VERIFIED/INSUFFICIENT가 화면상 구분 불가능했던 결함 수정 — "근거 확인"/"판단 불충분" 배지 추가(`data-testid="claim-status"`). `report.uncertainty`를 위한 별도 섹션("판단 불충분 사유", `data-testid="uncertainty"`) 신설. `VerifiedCounterArgument`의 `supportingEvidenceIds`/`counterEvidenceIds`가 UI에서 무시되던 것을 claim과 동일한 `evidenceById`로 표시("뒷받침 근거"/"반박 근거"). **잔여 위험**: 결정론적 E2E 픽스처는 항상 `supported: true`를 반환해 INSUFFICIENT 배지 경로가 E2E DOM에서는 실제로 노출되지 않음(unit 테스트에서는 verifier.ts 레벨로 이미 커버됨) — 정직하게 기록된 gap, 조작된 테스트 아님. |
| Fix-D (P1) | `f773e39` | `db/seed/evidence.json`의 seed-evidence-006/009가 `evidenceType: DISPUTE_CASE`였으나 본문 자체가 "특정 분쟁조정 결정례를 인용한 것이 아니다"라고 명시하고 있어 실제 유형과 라벨이 불일치 — `OTHER`로 하향 정정(design.md §6 소싱 규율 재적용, 내용은 그대로 유지). |
| 항목 6 (조사, 코드 변경 없음) | — | 레거시 report(`claims` 기반) 호환성 — `.env.local`이 이 프로젝트에 아예 존재하지 않고(`.env.local.example`만 존재), product.md/tech.md 상 배포(Vercel)도 아직 로드맵 단계로 확인되어, **보존해야 할 실제 프로덕션 DB 데이터가 없는 개발 단계**로 판단했다. 어댑터/마이그레이션을 추가하지 않고, 이 사실을 여기 명시하는 것으로 대체한다: **이 SPEC 이전에 생성된 `reports` row가 실제로 존재한다면, `page.tsx`가 그 row의 `content`에서 `reviewTargets`/`verifiedClaims`(신 shape)를 찾지 못해 런타임 오류가 날 수 있다 — 배포 전 DB reset(또는 해당 테이블 truncate)이 전제다.** |

**최종 5종 게이트(AC-RESEARCH-023/024/025) 결과 — orchestrator가 위 fix 전부 반영 후 독립 재실행으로 확인**(M6 시점 결과를 대체):
- `pnpm test`: exit 0, 36/36 파일·191/191 테스트 통과
- `pnpm lint`: exit 0
- `pnpm format:check`: exit 0 (1건 발견 즉시 정정 — `f60c2c6`)
- `pnpm build`: exit 0
- `pnpm test:e2e`: exit 0, 4/4(auth/tenant-isolation/case-flow) — `generativelanguage.googleapis.com` 아웃바운드 호출 0건

### 2차 코드 리뷰 발견 merge-blocking 결함 + post-run fix (Fix-A~D 이후, 동일 SPEC에서 처리)

Fix-A~D 완료·커밋(`4345c74`) 이후 진행된 2차 코드 리뷰에서 3건의 결함이 추가로 발견되어, 사용자 지시에 따라 새 SPEC을 만들지 않고 이 SPEC의 post-run fix로 처리했다. `/moai sync`는 아직 실행하지 않는다(사용자 명시적 지시).

| 항목 | 파일 | 요지 |
|---|---|---|
| item 1 | `verifier.ts`, `verifier.test.ts`, `deterministic.ts` | Fix-B의 의미 검증이 `DraftFinding.summary`+`supportingEvidenceIds`만 대상으로 하고 `VerifiedCounterArgument`(Skeptic 반론)는 evidence-ID 존재 여부만 구조적으로 검사하던 결함 수정. 사건당 Verifier structured call 1회 원칙을 유지한 채, claim과 counterArgument를 하나의 호출(`{claims, counterArguments}`)로 함께 검증하도록 확장. 반환 계약도 `supported:boolean`에서 `supportedEvidenceIds`/`counterEvidenceIds`(실제로 의미 검증을 통과한 evidence ID의 부분집합)로 변경 — LLM이 반환하는 evidence ID는 `.refine()`으로 해당 candidate가 실제로 받은 evidence ID 집합의 부분집합임을 강제한다. 의미검증 전체 실패 시 claim은 기존처럼 INSUFFICIENT로, counterArgument는 evidence 연결을 전부 비우는 fail-closed를 대칭 적용. |
| item 2 | `skeptic.ts`, `verifier.ts` | Skeptic `challenge()`가 `generateStructured()` 성공 후에도 safety-validator를 적용하지 않아 금지 표현이 담긴 반론이 그대로 Challenge로 만들어질 수 있던 결함 — Researcher와 동일한 no-forced-finding 패턴 적용(안전하지 않으면 Challenge 생략). Verifier의 defense-in-depth도 기존에는 `status === "VERIFIED"`인 item만 검사해 이미 INSUFFICIENT인 item의 unsafe counterArgument가 최종 report에 남을 수 있던 결함 — 최종 safety 스캔을 status와 무관하게 모든 item에 대해 수행하도록 수정하고, 금지 표현이 있는 counterArgument는 부모 claim status만 바꾸는 대신 최종 `counterArguments` 배열에서 직접 제거한다. |
| item 3 | `safety-validator.ts` | 기존 `/\d+%/` 전면 차단 규칙이 장해지급률/ROM 제한율/기왕증 기여도 같은 정상 수치까지 차단하던 결함 — "지급/성공/승인/수령/받을 확률·가능성 + 구체적 수치"로 좁혀, "확률"/"가능성" 단어가 실제로 붙은 경우(보험금 지급 확률 95%, 성공 확률 80%, 보험금 받을 확률 90%, 승인 가능성 80%)만 차단하고 장해지급률 10%/관절가동범위 50% 제한/기왕증 기여도 30%는 허용하도록 정정. 지급액 확정 표현 규칙도 억/만원 단위 + "입니다"/"확정"/"수령 가능" 등 다양한 확정 어미를 포괄하도록 넓혀, 예상 보험금 1,000만원입니다/보험금 500만원 수령 가능합니다/1억원 보상이 확정됩니다 형태를 모두 차단(MVP는 사건별 예상 보험금 자동 산정이 Out of Scope이므로 claim-specific 확정액 표현은 차단). |

**최종 5종 게이트 결과 — orchestrator가 위 3건 반영 후 독립 재실행으로 확인**:
- `pnpm test`: exit 0, 36/36 파일·207/207 테스트 통과
- `pnpm lint`: exit 0
- `pnpm format:check`: exit 0 (4건 발견 즉시 `prettier --write`로 정정)
- `pnpm build`: exit 0
- `pnpm test:e2e`: exit 0, 4/4(auth/tenant-isolation/case-flow)

### 3차(최종) 코드 리뷰 발견 정합성 결함 2건 + post-run fix

2차 코드 리뷰 fix(item 1~3, 커밋 `0b5b3ae`) 이후 진행된 최종 코드 리뷰에서 `verifier.ts`에 작은 정합성 결함 2건이 발견되어, 동일 SPEC의 post-run fix로 처리했다. `/moai sync`는 아직 실행하지 않는다(사용자 명시적 지시).

| 항목 | 파일 | 요지 |
|---|---|---|
| item 1 | `verifier.ts`, `verifier.test.ts` | semantic verification 전체 실패(`ok:false`) 시 claim candidate의 `status`만 INSUFFICIENT로 바뀌고 기존 `supportingEvidenceIds`는 그대로 남아, 같은 실패에서 evidence 연결을 전부 비우는 counterArgument와 동작이 비대칭이었던 결함 수정. fail-closed 시 claim candidate에도 `supportingEvidenceIds = []`를 함께 적용해 "의미 검증을 실제로 통과한 evidence ID만 최종 report에 남긴다" 원칙과 정합시킴. |
| item 2 | `verifier.ts`, `verifier.test.ts` | 최종 safety scan의 claim summary 검사가 `item.status === "VERIFIED" && findSafetyViolations(...)` 조건으로 게이팅되어 있어, 주석/progress.md에 적힌 "status와 무관한 최종 safety scan"과 실제 동작이 어긋나 있던 결함 수정. status 조건을 제거해 VERIFIED/INSUFFICIENT와 무관하게 모든 claim.summary를 검사하고, 위반 시 status/supportingEvidenceIds/uncertainty를 함께 갱신하도록 정정. |
| (부수 발견, 회귀 없음 확인 후 수정) | `lib/ai/providers/deterministic.ts`, `verifier.test.ts` | item 1 수정 후 `pnpm test` 전체 재실행 중 `index.test.ts`(파이프라인 end-to-end)가 실패해 조사한 결과, semantic verification fixture의 evidence-ID 추출 정규식(`/\[([^\]\s]+)\]/g`)이 "소견: [deterministic] ..." 같은 summary/반론 텍스트 안의 대괄호까지 evidence ID로 오인해 evidence 부분집합 `.refine()` 검증에 실패시키는 결함을 발견 — 이번 2건과 별개의, 지난 세션(item 1 최초 구현)에서 생긴 잠재 결함이었다. `- [id] title: content` 근거자료 불릿 줄만 매칭하도록 줄-앵커 정규식(`/^\s*-\s*\[([^\]\s]+)\]/gm`)으로 정정. `index.test.ts`의 기존 단언("모든 claim이 evidence를 가짐")도 status별 조건(VERIFIED는 evidence 필수, INSUFFICIENT는 빈 배열)으로 정정 — 기존 단언은 이번에 고친 비대칭 버그(evidence leftover) 덕에 우연히 통과하고 있었다. |

**최종 5종 게이트 결과 — orchestrator가 위 2건 + 부수 결함 반영 후 독립 재실행으로 확인**:
- `pnpm test`: exit 0, 36/36 파일·208/208 테스트 통과
- `pnpm lint`: exit 0
- `pnpm format:check`: exit 0
- `pnpm build`: exit 0
- `pnpm test:e2e`: exit 0, 4/4(auth/tenant-isolation/case-flow)

## §E.3 Run-phase Audit-Ready Signal

- run_status: implemented — 25개 REQ 전부 구현 완료, 25개 AC(+011a/b, 019a/b 서브레터) 전부 코드 레벨로 만족 가능한 상태이며, **M6 시점에 남아 있던 merge-blocking 결함(Fix-A~D) 및 2차·3차 코드 리뷰 결함까지 전부 해소**되었다. 이전 버전의 "25/25 구현 완료" 기록은 이 갱신으로 대체한다 — M6 완료 시점에는 Verifier가 evidence 내용을 실제로 검증하지 않는 결함이 남아 있었으므로, 그 시점의 "완료" 표현은 부정확했다.
- 미푸시 상태: `feat/SPEC-RESEARCH-001`에 로컬 전용 커밋이 존재(git-strategy `mode: manual`, `auto_push: false`에 따라 자동 푸시하지 않음) — 사용자 지시 시 푸시.
- Next step: 사용자 지시에 따라 **여기서 정지**. `/moai sync`는 실행하지 않는다.

## §E.4 Sync-phase Audit-Ready Signal

- sync_status: completed
- sync_commit_sha: pending-backfill-sync (커밋 전 — 오케스트레이터가 이 sync 작업을 커밋한 뒤 실제 SHA로 백필 예정. 자기참조 해시 물리적 제약에 따른 표준 placeholder — spec-frontmatter-schema.md § SHA placeholder backfill exemption 참고)
- sync_at: 2026-08-27
- 요지: `/moai sync SPEC-RESEARCH-001`를 (§E.2에 기록된 post-run 코드 리뷰 3라운드 완료 이후) **사용자가 명시적으로 호출**해 수행했다 — plan→run 파이프라인의 자동 체이닝이 아니라, 3차(최종) fix가 끝난 뒤 별도로 지시된 sync-phase 진입이다. 수행 내용: (1) `CHANGELOG.md` `[Unreleased]`에 SPEC-RESEARCH-001 신규 섹션 추가(SPEC-RUNTIME-001 항목 위, 최신순), (2) `spec.md` 프론트매터 `status: in-progress → completed` + `updated: 2026-08-27` 전환(이 SPEC의 유일한 프론트매터 보유 산출물 — plan.md/acceptance.md/design.md/research.md는 SPEC-RUNTIME-001/SPEC-SCAFFOLD-001과 동일하게 프론트매터가 없는 본문 전용 문서이므로 전환 대상이 아님, spec-frontmatter-schema.md와 정합), (3) 이 §E.4 섹션 작성.
- README.md: 이번 SPEC 범위에서는 수정하지 않음(오케스트레이터 사전 판단 — 사용자 대면 신규 기능/CLI 플래그/셋업 단계 없음). 다만 manager-docs가 사후 확인한 결과 README.md에 이 SPEC으로 사실이 아니게 된 서술(예: "AI 파이프라인은 mock 구현 유지", "실제 LLM 기반 소견 생성 로직 ... 아직 구현되지 않았습니다", 테스트 카운트 "33 files, 139 tests")이 다수 남아 있음을 발견 — orchestrator에게 별도 보고, 이 SPEC에서 직접 수정하지는 않았다.
- Next step: 3-phase close 완료(`in-progress → implemented → completed`). 오케스트레이터가 이 sync 작업 전체를 커밋한 뒤 `sync_commit_sha`를 백필한다.
