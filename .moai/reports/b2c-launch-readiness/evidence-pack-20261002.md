# B2C pre-launch evidence pack (base main@99993bf, 2026-10-02)

Provenance: compiled by the orchestrator from three read-only Explore reports. Items marked [ORCH-VERIFIED] were re-read by the orchestrator directly. Everything else is an Explore claim: RE-VERIFY with your own Read/Grep before citing it as fact in a SPEC (verification-claim-integrity.md section 1). Anything you cannot re-verify must go in the SPEC as "unverified".

## A. Diagnosis 01 -> 02: real vs fixture

- [ORCH-VERIFIED] `components/diagnosis/step-loading.tsx:54-62` `mockJudge(input, reviewEnabled)`: returns "result" only if `reviewEnabled && input === FRACTURE_FIXTURE_INPUT` (strict ===, no trim); else `input.includes("오류") ? "error" : "result-none"`. Comment block 30-53 carries @MX:DEBT / @MX:CEILING / @MX:UPGRADE saying the whole function is to be replaced by a real analysis API call once DIAGNOSIS_ENGINE_READY work exists.
- FRACTURE_FIXTURE_INPUT = "3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요" (`lib/diagnosis/fixtures/fracture-case.ts:14`); equals the search-box placeholder (`step-input.tsx:250`).
- `buildFractureResult(rawInput, answers)` at `fracture-case.ts:209-229`. Callers in prod code: `components/diagnosis/diagnosis-flow.tsx:464` and the `?devFixture=fracture` path `components/result/result-view.tsx:82-87,153`. Result content is literal: 3 priority checks, 7 CoverageItems, literal amount ranges (e.g. "30만~50만원"); only resultId (`fracture-${Date.now()}`) and generatedAt vary. rawInput is NOT parsed; the 3 answers only create display FactChips and never change status/benefit/items.
- Design shows ~15 coverage items; fixture has 7 (accepted visual debt in RESULT-001 progress.md ~:444-451).
- 01-B questions are fixed to 3 and fracture-worded (`step-questions.tsx:39`); they do not adapt to input.
- 02 derivation is trivial counting (`lib/diagnosis/aggregate.ts`, `result-view.tsx:185-193`). `/result` does no matching.
- e2e locks "무릎 골절로 수술을 받았어요" (nearly the fixture sentence) to result-none (`e2e/diagnosis-flow-01.spec.ts:28-29,81`). All e2e inject ENABLE_DIAGNOSIS_DEV_STATES=true (`playwright.config.ts:82`).
- Handoff: sessionStorage key `bosang-radar:diagnosis-handoff-v1`, zod DiagnosisResultSchema (`lib/diagnosis/handoff.ts`). No diagnosis API, no server action, no diagnosis/result DB table; 01/02 run client-side only.
- ABSENT: any coverage/담보 matching engine; `lib/coverage/` (FOUNDATION design.md:136-140 lists it as "[신규, 후속 SPEC]"); any B2C 약관/상품/증권 dataset; OCR; any Gemini/AI call in B2C paths (app/, components/, lib/diagnosis, lib/consult, lib/validation); "판정 불가" logic (needs-info / low-likelihood exist as data enum only); 실손 세대 logic; other case types (chips for 허리 디스크/어깨/암/교통사고 all lead to result-none); server-side check that resultId refers to a real result (consultations.result_id is an opaque string, `lib/consult/schema.ts:23`).
- `lib/pipeline/` (B2B research pipeline) preserved by REQ-B2CFOUND-007; imported by no app/ or components/ file; consumes B2B CaseInput (`lib/pipeline/types.ts:1`); `lib/ai/` Gemini provider unused by B2C. `db/seed/evidence.json` = 21 B2B research-evidence entries. FOUNDATION design.md:157-161 decision gate: pipeline deletion only after the matching decision; tech.md:108-136 deliberately defers static rules vs Gemini vs hybrid to a follow-up SPEC.
- `lib/env.ts:134-136` requires GEMINI_API_KEY at app boot unless LLM_PROVIDER_MODE=deterministic (B2B residue).
- Verdict to carry: "화면·상담 API 배포 완료" is TRUE (flags unset = dark launch). "일반 사용자 대상 서비스 출시 가능" is FALSE: the only reachable 02 result is one hard-coded 골절 sample, and only with the review flag on and the exact sentence.

## B. Flags

- Strict `=== "true"` (`lib/diagnosis/flags.ts:22-24,38-47,63-70`; tests flags.test.ts). `shouldRenderDiagnosis = productionReady || reviewEnabled`; productionReady = ENABLE_DIAGNOSIS_FLOW && DIAGNOSIS_ENGINE_READY; reviewEnabled = ENABLE_DIAGNOSIS_DEV_STATES (review-only; must stay unset in production).
- DIAGNOSIS_ENGINE_READY is only a boolean; no code checks an engine exists. If ops sets both ENABLE_DIAGNOSIS_FLOW and DIAGNOSIS_ENGINE_READY, 01 renders and mockJudge yields only result-none/error: no user can reach 02.
- Consult: ENABLE_CONSULT_FLOW gates screen/CTA exposure; CONSULT_POLICY_READY gates real PII collection (API 503 `policy_unavailable` otherwise). Consult flags affect only /consult and /result, not `/`.
- Flags are read per request (force-dynamic pages; API reads process.env in handler); flipping needs a process restart, no rebuild, if the build includes commits d958a2b and 2cc1511 (runtime-runbook.md section 11.2, verified locally by `pnpm verify:flag-runtime`).
- Observed 2026-10-02 (twice, BEFORE merge 99993bf): all 5 flags unset on the prod VM (progress.md CONSULT :4081,:4155). Current post-merge prod state NOT observed.

## C. Consult activation facts (SPEC-B2C-CONSULT-001, status in-progress, Tier L, 25 REQ / 25 AC)

- Open items 25-29 defined at `.moai/specs/SPEC-B2C-CONSULT-001/progress.md:4247-4251` (mirrored design.md:30-34, spec.md:26, runbook section 11.3 step 5). All "미해결, 목적지·운영 절차 없음". No owner/deadline/procedure anywhere:
  - 25: destination/lookup for the "기존 신청 상태 확인" stub on 03-C (no lookup screen/API exists).
  - 26: real cancel / "신청 취소·정보 삭제 문의" (03-B stub; no cancel mechanism).
  - 27: real contact channel for 03-D failure screen (KakaoTalk sentence was removed, decision 7).
  - 28: can ops keep the "영업일 기준 1일 이내" promise shown at `components/consult/consult-success.tsx:50` and `consult-channel-selector.tsx:43`; progress.md says do not enable CONSULT_POLICY_READY before this is confirmed.
  - 29: do the 03-C text "처리 중" and label "상담 대기 중" match ops reality.
- Item 13: privacy review of re-displaying the UNMASKED contact on 03-D unknown_outcome stays open (handoff_mismatch variant was masked by decision 6 on 2026-10-02).
- Other open: item 1 legal consent text, 2 retention period/deletion procedure, 3 when to flip CONSULT_POLICY_READY, 5 등록정보 확인 link URL, 15 provisional not-ready notice text, 24 multi-instance risk (T6/T7 passed on harness only).
- [ORCH-VERIFIED] Consult consent detail overlay body is a placeholder: `components/consult/consult-consent-group.tsx:68` ("…상세 안내 문구는 아직 확정되지 않았습니다. 법무 검토가 끝나는…"); it renders only when policy is ready (Explore: :127), otherwise "상세 안내 준비 중". => flipping CONSULT_POLICY_READY today would show users a "legal text not finalized" placeholder.
- [ORCH-VERIFIED] Diagnosis consent detail has 6 literal placeholders `{처리 목적 확정 문구}` etc. at `components/diagnosis/consent-detail-content.tsx:13-18` (purpose, health-info items, server storage, retention, external-AI transmission, refusal rights). DIAGNOSIS-001 plan.md:26 says they block ENABLE_DIAGNOSIS_FLOW=true. Items such as "서버 저장 여부" and "외부 AI 전송 여부" depend on the engine architecture decision.
- Consent version = bare label `CONSENT_POLICY_VERSION = "2026-09-25-v1"` (`lib/consult/consent-policy.ts:8`); no hash/versioned text content; not-ready notice is provisional (`consent-policy.ts:10-15`).
- unknown_outcome (`components/consult/consult-failure.tsx:60,78`; triggers `consult-view.tsx:412,418,435`): title "상담 신청 접수 여부를 확인하지 못했습니다"; shows contact UNMASKED (:123); retry reuses same idempotencyKey; NO fallback contact channel (item 27).
- [ORCH-VERIFIED] RATE_LIMIT_HMAC_SECRET: `lib/env.ts:138-145` makes it required at app boot only when CONSULT_POLICY_READY === "true"; `instrumentation.ts` validateEnv("app") exits 1 on failure (runbook 11.3 step 3 observed this). Request path fail-closed: unset secret => 500 (`app/api/consultations/route.ts:360-364`). Not injected by deploy.yml; documented in `.env.local.example:77-93`.
- Submissions go to DB table `consultations` only (`lib/db/schema.ts:~200-228`; UNIQUE idempotency_key; UNIQUE (result_id, contact_normalized)); only applicationStatus = "received". NO admin viewer, email, Slack, webhook or notification code. CRM/notification are explicitly out of scope (spec.md:135-136). Nothing defines an ops 창구/담당자/SLA/status vocabulary/retention. Current handling = implied manual DB query, undocumented.
- X-Forwarded-For trust (Nginx append vs overwrite) flagged unverified in route comments (`route.ts:159-173`).
- Runbook: `.moai/docs/runtime-runbook.md` section 11.3 = 7-step order to turn on CONSULT_POLICY_READY (migrate first; set RATE_LIMIT_HMAC_SECRET in the SAME restart; confirm ops can honor the 1-day promise; confirm destinations 11.3.5 a-f); section 12 = instance-count and X-Forwarded-For premises; 12.8/12.9 = remote Turso T1-T7 (7/7). Rollback: set CONSULT_POLICY_READY=false + restart => API 503; no row-deletion path exists in code. MERGE-CHECKLIST (`.moai/reports/merge-readiness/SPEC-B2C-CONSULT-001/MERGE-CHECKLIST.md`) sections 3.3/3.4 cover backup + rollback of the consult tables.
- Instance count 1 (PM2 fork, id 0), observed once 2026-09-30.
- No CHANGELOG consult entry; no prod activation/rollback runbook covering PM2 env injection; no smoke test that POSTs to a deployed app; no pull_request CI at all.

## D. Deploy / PM2

- [ORCH-VERIFIED] `.github/workflows/deploy.yml`: triggers push to main + workflow_dispatch (:3-7); one SSH step runs on the VM: git reset --hard origin/main, pnpm install --frozen-lockfile, `pnpm run db:migrate` (:43), build, copy static, `pm2 restart "$PM2_APP"` (:61, NO --update-env), pm2 save, smoke checks. Merge to main = migrate + restart. Migrations run before build/restart, so a smoke failure leaves the new build already live.
- [ORCH-VERIFIED] Placeholder smoke check `deploy.yml:96-101`: `grep -q "서비스 준비 중입니다" /tmp/smoke-body.html` on `/`; exit 1 if absent. It presumes the diagnosis gate is CLOSED. It breaks when `shouldRenderDiagnosis` becomes true: both ENABLE_DIAGNOSIS_FLOW and DIAGNOSIS_ENGINE_READY true, OR ENABLE_DIAGNOSIS_DEV_STATES true. Either flag alone keeps it passing. Consult flags do not affect it. The 2xx check and the CSS-chunk check (:76-94,103-118) are flag-independent. `/consult` has its own closed placeholder with the same text (`app/consult/page.tsx:45`) and is not smoke-checked; `/api/consultations` is not smoke-checked.
- Already-recorded intent: DIAGNOSIS-001 plan.md:69 (Milestone 11b) + acceptance.md:55 (AC-B2CDIAG-024) say to replace the smoke string when flags are really turned on in production (non-blocking for that SPEC's completion); CONSULT progress.md:4153 separated this from merge judgment. Candidate stable identifiers in open-gate HTML (SSR presence UNVERIFIED): `data-testid="diagnosis-flow"` (`diagnosis-flow.tsx:396`), `<h1 data-testid="diagnosis-hero-title">` (`step-input.tsx:159-165`), `<title>보상 진단</title>` vs "서비스 준비 중" (`app/page.tsx:53-57`). A hard-coded string can match only one gate state, so a replacement must be gate-state-aware or must pass in BOTH states, because the deploy that ships the change itself runs while flags are still unset.
- Env source on the VM: PM2 saved env / process env / two app-folder `.env` files (all 5 flags unset in all of them). Unverified: whether `pm2 restart` re-reads changed env (runtime-runbook.md:319-322); env set outside PM2 (systemd, shell profile) not read; editing server `.env` then restarting not tested; real PM2 behavior on Linux not exercised (standalone server observed on Windows only). No ecosystem.config in repo (runbook :390).
- Scripts: `pnpm verify:flag-runtime` (local file DB only), `pnpm verify:remote-consult` (manual remote Turso T1-T7; needs --expect-fingerprint and --allow-write-remote), `pnpm visual:verify`. Not in CI.

## E. SPEC conventions in this repo (use the latest B2C SPECs as the template)

- Frontmatter template (CONSULT-001 spec.md:1-16): id, title, version "0.1.0", status (draft for new), created, updated, author Nexsol, priority, phase (a release label like "v0.20.0 target"; values plan/run/sync/mx are PROHIBITED), module, lifecycle spec-anchored, tags (comma string), tier, related_specs [..]; depends_on is used by PILOT SPECs. Schema: `.claude/rules/moai/development/spec-frontmatter-schema.md` (snake_case aliases rejected).
- ID: schema regex `^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$` taken literally does not match the existing `SPEC-B2C-CONSULT-001`, yet that form is the established precedent. Use `SPEC-B2C-<ONE-TOKEN>-NNN` and flag the schema/precedent mismatch for plan-auditor instead of resolving it silently.
- Tier: S=spec+plan; M=+acceptance; L=+design+research. PASS thresholds 0.75/0.80/0.85; REQ/AC ceilings 8/16/25. development_mode: tdd; coverage target 85.
- spec.md sections: HISTORY, 1 배경, 2 범위, 3 요구사항 (GEARS, subsection titles carry the type), 4 Out of Scope, 5 참고 문서. REQ id `REQ-B2C<ABBR>-NNN`, AC id `AC-B2C<ABBR>-NNN` with Given/When/Then and the REQ cited.
- plan.md: 결정 우선순위, A Context, B Known Issues (table with 상태 결정됨/미결정), C Pre-flight, D Constraints, E Self-Verification, F Milestones, G Anti-Patterns, H Cross-References.
- progress.md section map is parser-load-bearing: `## §E.1 Plan-phase Audit-Ready Signal`, `§E.2 Run-phase Evidence`, `§E.3`, `§E.4`, `§F Phase 4 Mode Selection`, `## Open Decisions for User`; new concerns use a fresh letter (§G...). DIAGNOSIS adds `§G Plan-Auditor Iteration Log`.
- Plan-audit report path `.moai/reports/plan-audit/{SPEC-ID}-review-{N}.md`; format: Verdict, Overall Score (harmonic mean of Clarity/Completeness/Testability/Traceability), Must-Pass MP-1..MP-7 (MP-7: no `[NEEDS CLARIFICATION]` in plan.md/research.md), Commands run.
- Open clarification precedent: `[NEEDS CLARIFICATION: ...]` inline in design.md / spec.md `### 미해결 확인 사항 (Open Clarification)` (SPEC-PILOT-LAUNCH-001/spec.md:192-222); plan.md `§B` rows 미결정; progress.md `## Open Decisions for User`.
- Reusable launch-gate structure (B2B-era content, reuse STRUCTURE only): READY-001 REQ-PILOT-READY-016 go/no-go separated from SPEC completion, each item READY / BLOCKED / UNVERIFIED, blank not allowed (`.moai/reports/pilot-ready-readiness-decision-2026-09-10.md`); OPS-001 staged rollout (stage 1 operator-only smoke, isolation gate, stage 2 limited external, stage 3 full; `SPEC-PILOT-OPS-001/spec.md:343-392`).

## F. Hard constraints for this task (from the user)

- Plan-phase ONLY. No application code edits, no run-phase, no prod DB writes, no prod flag changes, no merge to main, no commits, no pushes, no branch/worktree creation. Artifacts stay uncommitted in the working tree.
- Do NOT invent or finalize: the real 담당 창구, contact deadlines/SLA, status names, consent/policy wording, or 담보 판정 rules. Present each as a user decision (options + recommended option + what it blocks + which role must decide). A recommendation is not a decision.
- Keep "화면·상담 API 배포 완료" distinct from "일반 사용자 대상 서비스 출시 가능".
- Define 내부 시험 공개 vs 일반 사용자 공개 criteria separately.
