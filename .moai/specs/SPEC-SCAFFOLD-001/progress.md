# Progress — SPEC-SCAFFOLD-001

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready
- plan_complete_at: 2026-08-24
- tier: L (5 artifacts: spec.md, plan.md, acceptance.md, design.md, research.md)
- artifact_count: 5
- 작성자: manager-spec (Nexsol)
- 비고: research.md는 plan-phase 시작 이전 오케스트레이터가 이미 작성 완료(Explore 서브에이전트 조사 결과). spec.md/plan.md/acceptance.md/design.md/progress.md는 이번 턴에 작성됨.

## §E.2 Run-phase Evidence

M1-M6가 모두 완료된 상태에서(HEAD 23ccf1c) M5(최소 UI 라우트)를 마지막으로
전체 17개 AC를 재검증한다. M5에서 신규로 검증한 항목(AC-010, AC-015)은
verification command + 실제 output을 이번 턴에 직접 관측했고, M1-M4에서
이미 확립된 항목은 `pnpm test` 전체 스위트 재실행(71/71 PASS)으로
회귀가 없음을 재확인했다.

| AC | Status | Verification Command | Actual Output |
|----|--------|----------------------|----------------|
| AC-SCAFFOLD-001 | PASS | `pnpm build` | `✓ Compiled successfully`, `Finished TypeScript`, exit 0 |
| AC-SCAFFOLD-002 | PASS | `Read lib/db/schema.ts` | `cases`(ownerUserId 포함)/`evidence`/`reports`/`feedback`/`allowedTesters` 5개 테이블 확인 |
| AC-SCAFFOLD-003 | PASS | `grep drizzle-orm\|@libsql/client package.json` | `"drizzle-orm": "0.45.2"`, `"@libsql/client": "0.17.4"` (둘 다 stable, `@rc` 아님) |
| AC-SCAFFOLD-004 | PASS | `pnpm vitest run lib/db/client.test.ts` | 3/3 PASS — `createClient()`이 `{url, authToken}`으로 정확히 호출됨을 mock assert로 검증 |
| AC-SCAFFOLD-005 | PASS | `ls db/migrations/*.sql` | `db/migrations/0000_broad_big_bertha.sql` 존재 |
| AC-SCAFFOLD-006 | PASS | `Read lib/ai/provider.ts, lib/ai/providers/gemini.ts` | Gemini adapter가 `LLMProvider` 구현, `@google/genai` `2.18.0`(`<3.0.0`) 고정 |
| AC-SCAFFOLD-007 | PASS | `pnpm vitest run lib/ai/providers/gemini.test.ts` | 포함된 스위트(8/8 PASS 중 일부) — 429 지수 백오프 재시도 및 소진 시 실패 처리 검증 |
| AC-SCAFFOLD-008 | PASS | `pnpm vitest run lib/auth/config.test.ts` | 8/8 PASS — allowed_testers 미등록 이메일 `isAllowedTesterEmail()` false 반환 확인 |
| AC-SCAFFOLD-009 | PASS | `pnpm vitest run proxy.test.ts`(전체 스위트에 포함) | 5/5 PASS — 비로그인 `/cases/new`, `/api/cases` 접근 시 `/login`으로 리다이렉트 |
| AC-SCAFFOLD-010 | PASS | `pnpm vitest run lib/cases/get-case-for-owner.test.ts` (M5 신규) | 3/3 PASS — "사용자 A 소유 사건을 사용자 B가 조회 → null 반환(cross-user access blocked)" 테스트 포함. RED 증거는 §E.2 하단 참조 |
| AC-SCAFFOLD-011 | PASS | `pnpm vitest run lib/validation/case-input.test.ts lib/cases/create-case.test.ts` | 9/9 + 4/4 PASS — PII 형식 입력은 `createCase()`가 `runPipeline()`/DB insert 호출 전에 거부(`insertMock` 0회 호출로 확인) |
| AC-SCAFFOLD-012 | PASS | `grep -rn 'from "\./\(case-normalizer\|query-planner\|evidence-retriever\|researcher\|skeptic\|verifier\)"' lib/pipeline/*.ts \| grep -v index.ts \| grep -v .test.ts` | 0 matches (exit 1) — index.ts만 형제 단계 모듈을 import |
| AC-SCAFFOLD-013 | PASS | `pnpm vitest run lib/pipeline/index.test.ts` | 1/1 PASS — 6단계 순차 실행 후 seed evidence와 연결된 claims 생성 확인 |
| AC-SCAFFOLD-014 | PASS | `node -e "console.log(require('./db/seed/evidence.json').length)"` | `4`건, 카테고리 `상해후유장해, 질병후유장해` 2종 확인 |
| AC-SCAFFOLD-015 | PASS | `pnpm build` route 목록 + `Read app/cases/new/*, app/cases/[caseId]/*, app/api/cases/route.ts` (M5 신규) | `/cases/new`(폼) → POST `/api/cases`(검증+파이프라인+저장) → `/cases/[caseId]`(리포트 뷰 + 피드백 폼) 배선 완료, 빌드 성공 |
| AC-SCAFFOLD-016 | PASS | `grep -rln '@google/genai' lib/pipeline/` | 0 matches (exit 1) — `lib/pipeline/` 외부(즉 `lib/ai/providers/gemini.ts`만)에서만 import |
| AC-SCAFFOLD-017 | PASS | `pnpm test && pnpm lint && pnpm build && pnpm format:check` | test 22 files/71 tests PASS, lint 0 errors, build exit 0(TypeScript strict 포함), format:check 통과 |

RED evidence (AC-SCAFFOLD-010, cross-user-access-blocked 테스트, GREEN 이전 캡처):

```
$ pnpm vitest run lib/cases/get-case-for-owner.test.ts
 ❯ lib/cases/get-case-for-owner.test.ts (3 tests | 3 failed) 16ms
     × 사건을 소유한 사용자가 조회하면 case + report를 반환한다 11ms
     × 사용자 A 소유의 사건을 사용자 B가 조회하면 owner_user_id 필터링에 의해 null을 반환한다 (cross-user access blocked) 2ms
     × 존재하지 않는 caseId를 조회하면 null을 반환한다 1ms
Error: Cannot find module '/lib/cases/get-case-for-owner' imported from .../lib/cases/get-case-for-owner.test.ts
 Test Files  1 failed (1)
      Tests  3 failed (3)
```

Gaps (미검증):
- AC-SCAFFOLD-007/008/009는 M1-M2에서 이미 확립된 항목을 이번 턴에 재실행해 회귀 없음만 재확인했다 — 이번 턴에 처음부터 RED-GREEN 사이클을 거치지 않았다.
- Research Report의 "추가로 확보해야 할 자료 목록"(product.md §4 네 번째 항목)은 `lib/pipeline/types.ts`의 `ResearchReport`/`VerifiedClaim` 타입에 대응 필드가 없어(M4 mock 파이프라인 범위 밖) UI에서 "후속 SPEC에서 지원 예정" 안내 문구로 대체했다. 파이프라인 로직 자체는 M5 범위 밖이라 수정하지 않았다.
- 실제 브라우저에서의 E2E 수동 시연(로그인→입력→제출→리포트 조회)은 수행하지 않았다 — TURSO_*/BETTER_AUTH_* 등 런타임 시크릿이 이 환경에 없어 `pnpm dev` 기반 수동 검증이 불가능하다. 대신 `pnpm build`(TypeScript strict + 라우트 수집)와 mock 기반 단위 테스트로 배선을 검증했다.

Residual-risk (잔여 위험):
- `getCaseForOwner`/`createCase`의 DB 계층 테스트는 drizzle 쿼리 체인을 전체 mock했다 — 실제 SQLite/libSQL의 `WHERE ownerUserId = ?` 조건이 의도대로 번역되는지는 drizzle-orm 자체의 신뢰에 의존한다(config.test.ts의 기존 테스트 패턴과 동일한 한계).
- 피드백 저장(`app/cases/[caseId]/actions.ts`)은 PII 검증을 적용하지 않는다 — design.md §3이 "데이터 모델까지만 범위"로 명시했고, 전문가 코멘트 텍스트는 case-input 스키마의 PII 차단 대상이 아니다.

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_status: audit-ready
run_complete_at: 2026-08-24
run_commit_sha: e0d252b4e172b3b358659ee39f02285c471f7160
ac_pass_count: 17
ac_fail_count: 0
preserve_list_post_run_count: 0
new_warnings_or_lints_introduced: 0
cross_platform_build: not-applicable (Next.js/Node 프로젝트 — Go GOOS/GOARCH 교차 빌드 대상 아님)
total_run_phase_files: 6 milestones (M6, M1, M2, M3, M4, M5)
m1_to_mN_commit_strategy: per-milestone separate commits, direct push to main (Route A Hybrid Trunk)
m5_new_files: 12 (lib/cases/create-case.ts, lib/cases/create-case.test.ts, lib/cases/get-case-for-owner.ts, lib/cases/get-case-for-owner.test.ts, app/api/cases/route.ts, app/api/cases/route.test.ts, app/cases/new/page.tsx, app/cases/new/case-input-form.tsx, app/cases/[caseId]/page.tsx, app/cases/[caseId]/actions.ts, app/cases/[caseId]/actions.test.ts, components/ui/{card,input,label,textarea}.tsx)
m5_modified_files: 2 (app/page.tsx, app/layout.tsx)
```

## §E.4 Sync-phase Audit-Ready Signal

```yaml
sync_status: audit-ready
sync_complete_at: 2026-08-24
sync_commit_sha: ddc8c288f1f48614207413f72eb0897f27f9ac17
```

- 작성자: manager-docs (sync-phase)
- 산출물: README.md 전면 재작성(create-next-app 보일러플레이트 → 실제 프로젝트 문서), CHANGELOG.md 신규 생성([Unreleased] SPEC-SCAFFOLD-001 항목), spec.md frontmatter `status: in-progress → completed` 전환.
- 검증: sync 커밋 이전 `pnpm build && pnpm lint && pnpm test && pnpm format:check` 재실행 — 문서 파일만 수정했으므로 회귀 없음 재확인.

## §F Phase 4 Mode Selection

- tier: L, scope: ~6 milestones / Next.js scaffold + DB + auth + AI provider + pipeline stubs + minimal UI, domain count: 1 (single Next.js app, no multi-service split), file language mix: TypeScript-heavy (single language), concurrency benefit: LOW (coding-heavy per-milestone implementation, not independent research)
- Mode evaluation: trivial — not selected (non-trivial multi-file scaffold); background — not selected (write-capable, needs foreground); agent-team — RETIRED, not selectable; parallel — not selected (coding-heavy work, Anthropic's coding-task parallelism caveat; also user requested per-milestone checkpoints, which requires sequential foreground execution); workflow — not selected (not a uniform mechanical transform, this is new-code architecture work); sub-agent — SELECTED
- Decision: sub-agent
- Justification: Coding-heavy new-code implementation across 6 ordered milestones with cross-milestone dependencies (DB schema before pipeline stubs, AI provider before Gemini adapter, etc.) — per Anthropic's coding-task parallelism caveat, sequential single-agent delegation is the safe default for coding work. The user additionally selected semi-autonomous per-milestone checkpoint review, which requires the orchestrator to regain control between milestones — incompatible with parallel/workflow fan-out, naturally aligned with Mode 5.
- Route: Route A (Hybrid Trunk main-direct) — chosen over the Tier L default Route B (PR-based) because `gh` CLI is unavailable in this environment, so automated PR creation is not possible; user explicitly opted into direct-to-main commits at git initialization. manager-develop commits + pushes directly to `main` per milestone.
