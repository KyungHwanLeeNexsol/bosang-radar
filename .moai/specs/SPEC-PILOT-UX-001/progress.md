# SPEC-PILOT-UX-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-09-01
tier: M
artifact_set: spec.md, plan.md, acceptance.md (3 files, Tier M) + progress.md (not counted in Tier total)
spec_id_check: PASS (`SPEC-PILOT-UX-001` matches `^SPEC(-[A-Z][A-Z0-9]*)+-[0-9]{3}$`, verified via Bash regex per manager-spec pre-write protocol)
depends_on_status: SPEC-RESEARCH-001 (completed), SPEC-GEMINI-RUNTIME-001 (completed), SPEC-EVIDENCE-001 (completed), SPEC-FEEDBACK-001 (completed) — all four dependencies fulfilled at plan-phase authoring time
open_clarifications: 0 — the plan.md §A decision 1 NULL-handling clarification question (nonce unique-index behavior under Drizzle Kit) was resolved in the iteration-2 fix-up: SQLite's official documentation ("For the purposes of UNIQUE constraints, NULL values are considered distinct from all other values, including other NULLs" — sqlite.org/lang_createtable.html, verified via WebFetch) confirms multiple `NULL`s never collide under a unique index, and this project's `turso` (libSQL) dialect inherits identical SQLite semantics. A plain unique index over the nullable `submissionNonce` column (no partial index) is the final design. Mechanical confirmation against the generated migration + a fixture test remains scheduled for M1/M6 as a sanity check, not as an open question.
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

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
