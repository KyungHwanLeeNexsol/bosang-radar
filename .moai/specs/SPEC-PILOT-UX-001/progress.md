# SPEC-PILOT-UX-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-09-01
tier: M
artifact_set: spec.md, plan.md, acceptance.md (3 files, Tier M) + progress.md (not counted in Tier total)
spec_id_check: PASS (`SPEC-PILOT-UX-001` matches `^SPEC(-[A-Z][A-Z0-9]*)+-[0-9]{3}$`, verified via Bash regex per manager-spec pre-write protocol)
depends_on_status: SPEC-RESEARCH-001 (completed), SPEC-GEMINI-RUNTIME-001 (completed), SPEC-EVIDENCE-001 (completed), SPEC-FEEDBACK-001 (completed) — all four dependencies fulfilled at plan-phase authoring time
open_clarifications: 0 — the plan.md §A decision 1 NULL-handling clarification question (nonce unique-index behavior under Drizzle Kit) was originally resolved in the iteration-2 fix-up (see `iteration_2_fixups` below for that historical resolution). **That resolution — and the DB-backed `submissionNonce`/unique-index idempotency design it applied to — was fully superseded in iteration 3** (see `iteration_3_amendment` below and spec.md HISTORY): server/DB idempotency is explicitly Out of Scope for this SPEC (an external independent review found it did not actually prevent the concurrent-request race it was meant to prevent). **Current final design**: duplicate-submission prevention is implemented exclusively as a client-only `useRef`-based single-flight guard (REQ-PILOT-UX-002/003 for the case-input form, REQ-PILOT-UX-007/010/011 for the feedback form). There is no `submissionNonce` column, no unique index, and no Drizzle migration anywhere in this SPEC's final scope.
iteration_2_fixups: plan-auditor 1st-pass FAIL response (score 0.875) — D1/MP-7 (NEEDS CLARIFICATION marker) resolved as above; D2 (original REQ-PILOT-UX-014 multi-obligation bundling) resolved by splitting into a fetch-failure requirement (When) + a new error.tsx-boundary requirement (Ubiquitous), then merging the original REQ-PILOT-UX-004 (nonce reuse/regeneration scope) into the original REQ-PILOT-UX-003 via an And sub-clause to net the count back to 16; the whole REQ set was then renumbered contiguously 001-016 to avoid a numbering gap (mapping: 001,002,003(merged) unchanged; former 005-016 shift down by one to 004-015; the new error-boundary requirement lands at 014; Group G — former 015/016 — coincidentally lands back on 015/016). D3 (Type-column mislabeling) resolved by relabeling the (post-renumbering) REQ-PILOT-UX-001/004/007 from Ubiquitous to While to match their actual conditional wording. spec.md/plan.md/acceptance.md updated consistently with the new numbering; REQ count verified at 16, contiguous 001-016, no duplicates/orphans.

iteration_3_amendment: 2026-09-02 — 외부 독립 리뷰 반영. iteration-2까지 승인되어 있던 DB 기반 서버측 idempotency(REQ-PILOT-UX-003/008의 `submissionNonce` 컬럼 + unique index, `create-case.ts`/`submit-feedback.ts`의 DB-nonce dedup 로직, 신규 Drizzle 마이그레이션, plan.md 구 M1/M2 마일스톤)를 SPEC 범위에서 전면 제거했다. 근거: `createCase`의 실제 실행 순서(`validate → runPipeline → cases insert → reports insert`)상, `runPipeline` 실행 전 SELECT + 실행 후 unique index 접근으로는 동일 nonce를 가진 두 동시 요청이 모두 파이프라인(고비용 Gemini 호출)을 실행하는 경합을 막지 못한다 — 이는 이 SPEC의 범위를 넘어서는 진정한 분산 idempotency(예약/대기/완료 상태 전이 + 크래시 복구) 없이는 해결 불가능하며, 후속 SPEC 후보로 명시적으로 미뤘다(spec.md §Out of Scope 신규 항목).

변경 내용: (1) 사건/피드백 중복 제출 방지를 `case-input-form.tsx`/`feedback-form.tsx`의 순수 클라이언트측 `useRef` 단일 흐름(single-flight) 가드로 재정의(REQ-PILOT-UX-003/008 전문 재작성). (2) REQ-PILOT-UX-009(성공 확인)를 확장해 성공 후 해당 마운트 인스턴스에서 제출 버튼이 계속 비활성 상태로 유지되도록 함 — 새 폼 인스턴스(새로고침/재진입)에서는 새 논리적 제출이 다시 허용되어 SPEC-FEEDBACK-001의 append-only 정책과 완전히 일치, 서버측 write-path는 전혀 수정하지 않음. (3) REQ-PILOT-UX-010의 필드 오류 키 계약을 `submit-feedback.ts`의 실제 `toFieldErrors` 동작(Zod issue의 `path[0]`만 사용, 최상위 키만 존재)에 맞춰 정정 — 존재하지 않던 중첩 경로(`missedIssues.0.description`) 예시를 제거. (4) `reportFeedbackPayloadSchema`에 `submissionNonce` optional 필드를 추가하지 않기로 결정(REQ-PILOT-UX-016에서 관련 문구 제거) — Gold Dataset 시맨틱 페이로드에 transport metadata를 섞지 않는다는 원칙 유지. (5) AC-PILOT-UX-007의 잘못된 `QueryIssueType` fixture(`DISABILITY_GRADE`)를 실제 SSOT 값(`DISABILITY_GRADE_CRITERIA`, `lib/pipeline/types.ts:38`)으로 수정. (6) `app/cases/new/loading.tsx`(신규) 계획 항목을 영향 파일 목록·마일스톤에서 모두 제거 — 이를 생성하는 마일스톤이 애초에 없었고 REQ-PILOT-UX-001의 폼 내부 대기 표시만으로 충분. (7) REQ-PILOT-UX-006에 `evidenceType`/`issueTypes`에 대한 선택적(비필수) 한글 표시 레이블 매핑 문구를 추가. (8) acceptance.md Definition of Done의 포맷 검사 명령을 `package.json`의 실제 스크립트명(`pnpm format:check`, 기존에는 `pnpm format --check`로 오기재)에 맞춰 정정.

영향받은 파일: spec.md(프론트매터 version 0.1.1→0.2.0·updated·module·tags, HISTORY, §1 WHY 일부 문구·WHAT·Tier 근거, §2 REQ-003/006/008/009/010/016 본문, §Out of Scope 신규 서브섹션), plan.md(§A decision 1 전면 재작성·decision 2 유지, §B 구 M1/M2 삭제·M3~M6을 M1~M4로 재넘버링 및 본문 수정, §C 재작성, §D Risk 1/2 재구성, §E PRESERVE 목록에 `create-case.ts`/`submit-feedback.ts`/`lib/feedback/schema.ts`/`lib/validation/case-input.ts` 추가), acceptance.md(AC Group B/E 시나리오 전면 재작성, AC-007 fixture 수정, AC-016 재작성, Definition of Done 명령 정정). REQ 총량은 16개로 변동 없음(내용 재작성만, ID 추가/삭제 없음) — `grep -c "^| REQ-PILOT-UX-" spec.md`로 재확인 필요.

plan_audit_verdict (iteration 3): FAIL — 종합 점수 0.82, must-pass MP-2(GEARS 단일 트리거 형식) 위반으로 차단됨. 오케스트레이터가 재위임한 fix round(iteration 4)로 대응했다(아래).

iteration_4_amendment: 2026-09-02 — plan-auditor iteration-3 FAIL(0.82, MP-2 GEARS 단일 트리거 형식 위반) 대응. 구 REQ-PILOT-UX-003(가드 반환+실패 시 리셋+성공 시 유지, 3개 절을 하나의 ID에 묶음)을 원자적 단일-트리거 REQ 2개(신 002/003)로 분리하고, `useRef` 구현 세부사항(HOW) 서술을 제거했다(plan.md §B M2/M3에 이미 명시됨). 구 REQ-PILOT-UX-008에서 동일한 `useRef` preamble을 제거했다(분리하지 않음, 원래 단일 트리거). 구 REQ-PILOT-UX-009(성공 확인+비활성 유지+재진입 재허용 — 2개의 독립적 트리거를 하나의 ID에 묶음)를 원자적 단일-트리거 REQ 2개(신 008/009)로 분리했다. REQ 총량이 16→18로 늘어난 것을 상쇄하기 위해, plan-auditor가 지목한 대로 구 REQ-001(대기 표시)+구 REQ-002(필드 비활성화)를 하나의 While 요구사항(신 001)으로, 구 REQ-004(배너 렌더링)+구 REQ-005(집계 검증 상태)를 하나의 While 요구사항(신 004)으로 병합했다. 순 변화 0, REQ 총량 16 유지. 전체 REQ ID를 001~016으로 재넘버링(매핑: 구 001/002 병합→신 001, 구 003 분리→신 002/003, 구 004/005 병합→신 004, 구 006/007→신 005/006, 구 008→신 007, 구 009 분리→신 008/009, 구 010~016→신 010~016 동일값 — 병합/분리가 상쇄되어 Group F 진입 전 항목 총량 11개로 변동 없음). spec.md 요구사항 표·§4 교차 참조, acceptance.md의 AC Group 헤더 REQ-ID 참조(AC 본문 자체는 재작성하지 않음 — plan-auditor 관찰대로 이미 원자적으로 분해되어 있었음), plan.md §A/§B/§D의 REQ-ID 참조를 모두 새 번호 체계로 갱신했다. `grep -c "^| REQ-PILOT-UX-" spec.md` = 16으로 확인.

plan_audit_verdict (iteration 4): FAIL — 종합 점수 0.875(informational)에도 불구하고 must-pass MP-2(GEARS 단일 트리거 형식)가 여전히 위반됨. 신 REQ-PILOT-UX-002가 "재호출됨"(When)과 "성공적으로 제출된 이후"(별개 이벤트)라는 두 트리거를 여전히 하나의 When 요구사항에 묶고 있다는 지적. 오케스트레이터가 재위임한 targeted fix round(iteration 5)로 대응했다(아래).

iteration_5_amendment: 2026-09-02 — plan-auditor iteration-4 FAIL(0.875 informational, MP-2 잔존 위반) 대응. REQ-PILOT-UX-002를 When 패턴에서 단일 While-패턴("While 제출 가드가 활성 상태이면 ... 즉시 반환해야 한다")으로 재작성 — 가드 활성 상태라는 하나의 트리거가 in-flight(요청 진행 중)와 post-success(성공 후 미해제, REQ-003에 따라 실패 시에만 해제)를 모두 포괄하므로 트리거 결합이 아니다. REQ 개수·ID 변화 없음(단일 REQ 재작성만). 누락되어 있던 post-success 재호출 검증 AC를 acceptance.md AC-PILOT-UX-003에 And 하위 시나리오로 추가했다(REQ-008/009 쌍의 AC-010과 동일한 패턴 — in-flight/post-success 두 상태를 모두 독립적으로 Given/When/Then 검증 가능). 이번 fix round는 spec.md §2 REQ-002 본문·Type·근거 열과 acceptance.md AC-PILOT-UX-003만 수정했으며 그 외 파일(plan.md 등)은 건드리지 않았다 — REQ-002의 참조 대상(가드 메커니즘)이 plan.md에서 이미 REQ-002/003으로 정확히 인용되어 있었으므로 plan.md 갱신이 불필요했다.

plan_audit_verdict (iteration 5): PASS
score: 0.98
iteration: 5 (DB-idempotency-removal amendment로 열린 fix cycle의 3번째 감사: iter3 FAIL 0.82 → iter4 FAIL 0.875-informational → iter5 PASS 0.98)
non_blocking_findings (2건, 결함 아님):
  1. REQ-PILOT-UX-006(근거자료 클릭 가능 링크) — Type-label 스타일 관련 사소한 지적(nit). 타입 자체는 올바르게 While로 분류되어 있으나 요구사항 본문이 "While"로 문자 그대로 시작하지는 않음(서술형 어순). 형식 위반은 아님.
  2. plan.md 일관성 확인 완료 — REQ-002가 iteration-5에서 While-패턴으로 재작성된 뒤에도 plan.md의 기존 참조(§B M3 (c), §B M4 e2e 어서션, §D)가 여전히 의미상 정확함을 확인. 갭 아님(gap 아님, 확인 완료 상태).
plan-audit 리포트(`.moai/reports/plan-audit/`)는 이 프로젝트 정책상 gitignore된 로컬 아티팩트이므로, 커밋된 리포트 파일의 존재를 주장하지 않으며 검증 결과(verdict/score/finding 2건)만 이 progress.md에 기록한다. 이 PASS 판정은 plan-auditor가 내렸으며, 이 항목을 기록한 에이전트가 자체적으로 내린 판정이 아니다.

pre_run_coherence_correction_cycle: 2026-09-02 — iteration-5 PASS(0.98) 커밋·푸시(SHA `7b584a1`) 이후, `/moai run` 진입 전 마지막 정합성 보정으로 진행된 별도 감사 사이클. 새 SPEC 없음, DB/서버 write-path/스키마 변경 없음, client-only single-flight 결정 유지, REQ 16개 유지라는 제약 하에 3개 항목(피드백 single-flight 실패 복구 계약 추가, M4 자동 검증 범위를 AC와 정합화, AC-PILOT-UX-016 문구 정정)을 적용했다.

plan_audit_verdict (iteration 6): FAIL — 종합 점수 0.74. D1: 구 REQ-PILOT-UX-010이 검증실패/예외·reject 두 트리거를 하나의 When에 묶었을 뿐 아니라, 두 트리거의 **응답 자체가 실제로 분기**함(공유되는 것은 가드 리셋뿐 — REQ-002(단일 응답)와 다름)을 지적. D2: plan.md M4 테스트 계획에 AC-001(대기 인디케이터)/AC-002(필드 비활성화)/AC-012(섹션 그룹핑)에 대응하는 테스트 계획 항목이 전혀 없음을 지적.

iteration_6_fixup: 2026-09-02 — D1: 구 REQ-PILOT-UX-010을 REQ-002가 REQ-003을 참조하는 것과 동일한 방식으로 공유 가드-리셋(REQ-007)을 교차 참조하며 원자적 단일-When 요구사항 2개로 분리 — 신 REQ-PILOT-UX-010(검증실패 분기: 가드 리셋 + fieldErrors 표시)과 신 REQ-PILOT-UX-011(예외/reject 분기: 가드 리셋 + 폼-레벨 오류 + unhandled-rejection 금지). REQ 총량이 16→17로 늘어난 것을 상쇄하기 위해, 트리거 없이 전역 적용되는 두 Unwanted 제약(구 REQ-015 안전 문구, 구 REQ-016 개인정보)을 REQ-014(사건 폼 네트워크 예외)가 이미 쓰던 단일-트리거(없음)/복합-응답("shall not A and shall not B") 병합 패턴으로 신 REQ-016 하나로 통합했다. 순 변화 0(+1-1), REQ 총량 16 유지. 전체 REQ ID를 001~016으로 재넘버링(매핑: 구 001~009 불변, 구 010 분리→신 010/011, 구 011(섹션 그룹핑)→신 012, 구 012(빈 상태)→신 013, 구 013(네트워크 예외)→신 014, 구 014(error.tsx)→신 015, 구 015+016 병합→신 016). D2: plan.md M4에 AC-001/002를 `case-input-form.test.tsx` 불릿에, AC-012를 `feedback-form.test.tsx` 불릿에 추가해 AC-001~014의 M4 커버리지 갭을 해소했다 — AC-015/016은 render 테스트가 아닌 문구·diff 검토형 기준(AC 본문 자체가 "When each string is reviewed..."/"When the diff...is inspected" 형태)이라 M1-M4 대상에서 의도적으로 제외했다. spec.md 요구사항 표(Group E/F/G)·§4 교차 참조, plan.md §B M2/M3/M4의 REQ-ID 참조, acceptance.md AC Group E/F/G 헤더·AC-011/013/014 본문의 REQ-ID 참조를 모두 새 번호 체계로 갱신했다 — AC 본문 시나리오 내용 자체는 재작성하지 않고 REQ-ID 레이블 및 M4 커버리지 갭만 보완했다. `grep -c "^| REQ-PILOT-UX-" spec.md` = 16으로 확인.

plan_audit_verdict (iteration 7): PASS
score: 0.92 (Tier M 임계값 0.80 상회)
recommendation: "PASS stands." — 재감사 불필요
iteration: 7 (DB-idempotency-removal amendment 이후 pre-run coherence correction 사이클의 2번째 감사: iter6 FAIL 0.74 → iter7 PASS 0.92)
trivial_citation_typo_fixes (4건, must-pass 기준 무관·REQ/AC 내용 및 개수 무변경): (1) plan.md M1 empty-state 불릿의 "REQ-PILOT-UX-012" 오기재를 "REQ-PILOT-UX-013"으로 정정. (2) plan.md M2 첫 불릿의 "REQ-PILOT-UX-010's action-rejection branch" 오기재를 "REQ-PILOT-UX-011's action-rejection branch"로 정정(다음 두 불릿이 이미 정확히 쓰던 것과 일치). (3) spec.md REQ-016 근거 열의 "REQ-013(사건 폼 네트워크 예외)" 오기재를 "REQ-014(사건 폼 네트워크 예외)"로 정정(현재 REQ-013은 빈 상태 요구사항, 네트워크 예외는 REQ-014). (4) spec.md iteration-6 HISTORY 엔트리의 "AC-001~016 전체가... 정합화" 과장 서술을 "AC-001~014의 M4 커버리지 갭을 해소했으며, AC-015/016은 render 테스트가 아닌 문구·diff 검토형 기준이라 M1-M4 대상에서 의도적으로 제외함"으로 완화.
plan-audit 리포트(`.moai/reports/plan-audit/`)는 이 프로젝트 정책상 gitignore된 로컬 아티팩트이므로, 커밋된 리포트 파일의 존재를 주장하지 않으며 검증 결과(verdict/score/recommendation/trivial-fix 4건)만 이 progress.md에 기록한다. 이 PASS 판정은 plan-auditor가 내렸으며, 이 항목을 기록한 에이전트가 자체적으로 내린 판정이 아니다.

## §F Phase 4 Mode Selection

phase_1_skip_decision: SKIPPED re-execution of plan-auditor (all 3 conditions satisfied per spec-workflow.md § Plan to Run skip contract):
  1. Verdict PASS — iteration 7 (2026-09-02)
  2. Score 0.92 >= Tier M threshold 0.80
  3. Artifact hash unchanged — last commit touching spec.md/plan.md/acceptance.md is `2304050` (the same commit that produced the iteration-7 PASS verdict); the only later commit `c5d41a8` touched progress.md only.

input_parameters: tier=M, scope=~10 files (page.tsx/feedback-form.tsx/case-input-form.tsx edit + error.tsx new + 4 test files new/extended + e2e/case-flow.spec.ts edit), domain_count=1 (frontend React/Next.js), file_language_mix=100% TypeScript/TSX, concurrency_benefit=LOW (coding-heavy, milestone dependencies)

mode_evaluation:
  - direct: not selected — non-trivial, multi-file semantic change
  - agent-team: not selected — not explicitly requested by user
  - fanout: not selected — single-domain coding-heavy work, not multi-domain research
  - sweep: not selected — scope well under ~30-file mechanical threshold; work is semantic (new UI logic/guards/tests), not a uniform mechanical transform
  - serial: SELECTED — default fallback; coding-heavy TDD implementation via manager-develop, per Anthropic's coding-task parallelism caveat

Decision: serial

justification: Single-domain frontend coding work with milestone dependencies (M1-M4 share components/patterns) and no genuinely parallel structure. manager-develop (cycle_type=tdd) executes M1-M4 sequentially in one delegation.

## §E.2 Run-phase Evidence

Implementation completed via manager-develop (cycle_type=tdd) across 4 local commits: `ac126c7`(M1) → `015834e`(M2) → `97fc198`(M3) → `a2d58de`(M4). No push (git_strategy.mode=manual, push_to_remote=false).

manager-develop's §E1 self-report: all 16 REQ-mapped ACs (AC-PILOT-UX-001~016) PASS; AC-015 is a manual text-review criterion (acceptance.md specifies it as review-type, not render-test-type).

Orchestrator independent re-verification (this run, this tree, HEAD `a2d58de`):
- `pnpm build` → exit 0 (Turbopack build succeeded; 1 pre-existing unrelated warning in `instrumentation.ts`)
- `pnpm lint` → exit 0 (clean)
- `npx vitest run "app/cases" "e2e" --reporter=dot` → 6 test files, 25 tests, all passed
- `grep -rn 'AskUserQuestion' app/cases | grep -v "_test.tsx" | grep -v "// "` → exit 1, no matches (subagent boundary respected)
- `git diff --stat origin/main -- lib/db/schema.ts lib/validation/case-input.ts lib/feedback/schema.ts lib/cases/create-case.ts lib/feedback/submit-feedback.ts` → no output (server write-path untouched, confirms AC-016)
- `git log origin/plan/SPEC-PILOT-UX-001` → unchanged since `c5d41a8` (confirms no push occurred)

Coverage gap (accepted by user, 2026-09-02): `case-input-form.tsx` 79.5%, `feedback-form.tsx` 61.6%, `page.tsx` 72.7% statement coverage — below quality.yaml `test_coverage_target: 85`. manager-develop's justification: uncovered lines are pre-existing interaction branches (issue add/remove, per-item assessment selects, outcome field) not required by this SPEC's ACs, per plan.md M4 scope note. User explicitly chose to proceed to sync with this gap recorded rather than requesting additional coverage tests (AskUserQuestion round, orchestrator session).

## §E.3 Run-phase Audit-Ready Signal

run_status: audit-ready
run_complete_at: 2026-09-02
run_commits: ac126c7, 015834e, 97fc198, a2d58de (all local on plan/SPEC-PILOT-UX-001, no push)
known_gap: coverage below 85% target for 3 files (see §E.2 for detail) — user-accepted, non-blocking for sync

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
