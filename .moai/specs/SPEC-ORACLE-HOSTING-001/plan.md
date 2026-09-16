# plan.md — SPEC-ORACLE-HOSTING-001

## §A. Context

- **Branch**: `main` (Route A — Hybrid Trunk main-direct, Tier M, per `spec-workflow.md` § SPEC Phase Discipline). No per-phase branch or PR for this SPEC.
- **Predecessor**: SPEC-CLOUDFLARE-COMPAT-001 (`status: rejected`) — see that SPEC's HISTORY for the full rejection rationale. This SPEC is its named successor.
- **SPEC artifacts**: `spec.md` (this SPEC's requirements + scope), `research.md` (already-completed research + M0 execution evidence), `acceptance.md` (AC matrix), `progress.md` (lifecycle tracking).
- **Existing infrastructure to PRESERVE**: the M0 Oracle Cloud instance (`research.md` §5.3), its VCN/subnet (`research.md` §3), and the existing `news-hive` instance/SSH key configuration it reuses. Nothing in this SPEC's own authoring modifies any of these — M0 was already completed before/during authoring, and M1/M2 are future, separately-gated milestones.
- **Existing Netlify hosting**: currently exhausted of free-tier credits (the urgency driver, `spec.md` §1). Not touched by this SPEC's authoring; M2 is the future gated milestone that would eventually decommission it.

## §B. Milestones

Milestones are ordered by decision-reversibility per this project's plan-authoring convention: M0 is a closed historical record (no open decisions remain — presented first as the factual foundation the rest of this plan depends on). Within M1, the sub-tasks are ordered with the decisions most likely to change first (RAM-mitigation strategy, process-management choice) and the mechanical/sequencing steps deferred toward the end. M2 is almost entirely mechanical (a cutover sequence gated on M1's verified success) and is presented last.

### M0 — Instance Provisioning [EXECUTED — this SPEC's authoring]

**Status**: CLOSED. Evidence: `research.md` §5.

This milestone is not a future task — it records work already performed as part of this SPEC's plan-phase authoring, per the same pattern SPEC-CLOUDFLARE-COMPAT-001 used for its Stage 1-2 investigation work. No further action is required to close M0; it is included here for plan.md completeness and as the factual dependency M1 builds on.

Deliverables (all closed, evidenced in `research.md` §5):
- Attempted `VM.Standard.A1.Flex` launch → isolated failure (404 `NotAuthorizedOrNotFound`, capacity-related).
- Attempted `VM.Standard.E2.1.Micro` launch with identical parameters → success, isolating the failure to Ampere A1 specifically.
- Final provisioned instance: `bosang-radar`, `VM.Standard.E2.1.Micro`, `ap-chuncheon-1`, public IP `152.67.203.228`, RUNNING.

### M1 — Application Deployment onto the Instance [NOT EXECUTED — future, gated]

**Entry criteria**: a separate, explicit user approval, distinct from the approval that authorizes this SPEC's own authoring. Per REQ-ORACLEHOST-008, no part of M1 is executed as part of authoring this SPEC.

Ordered by decision-likely-to-change first:

1. **RAM-risk mitigation (swap file)** — MANDATORY per REQ-ORACLEHOST-009 (capability-gate requirement), NOT optional, and MUST be provisioned before PM2 is configured. Sizing is an open decision to be made at M1 entry time (informed by measuring actual Node.js/Gemini-pipeline memory usage on the instance) — this is the parameter most likely to require iteration once real workload behavior is observed.
2. **Process-management + reverse-proxy topology** — PM2 (process manager, restart-on-crash) fronted by Nginx (reverse proxy; the Next.js process bound to `127.0.0.1` only, never exposed directly), per the researched pattern (`research.md` §4). The exact PM2 ecosystem-file shape and Nginx virtual-host configuration are implementation-time decisions within this topology.
3. **HTTPS provisioning** — Certbot/Let's Encrypt, standard automated flow, once DNS (step 5 below) is in place.
4. **Node.js/pnpm toolchain + build** — install Node.js (matching `engines.node` in `package.json`, per `.moai/project/tech.md`), pnpm, and build the app with Next.js `output: standalone` mode (per `research.md` §4).
5. **Secrets provisioning** — set required environment variables/secrets (Turso database credentials, Gemini API key, Better Auth secrets) via a secure mechanism on the instance — never committed to the repository, never logged. The exact secure-storage mechanism (environment file with restricted permissions, a secrets manager, etc.) is an implementation-time decision.
6. **DNS cutover to the new public IP** — pointing the domain at `152.67.203.228` (or a successor IP if the instance is later re-provisioned). Sequenced after the app is confirmed building and running locally on the instance, and before final HTTPS issuance depends on DNS resolution.
7. **End-to-end verification** — confirm the deployed app actually serves traffic correctly: login, case submission, and background job processing (the Gemini research pipeline) all function against the Oracle-hosted instance, before considering Netlify fully replaced.

### M2 — Netlify Cutover / Decommission [NOT EXECUTED — future, gated, separate approval]

**Entry criteria**: M1 verification (M1 step 7) must have succeeded AND a separate, explicit user approval, distinct from the M1 approval. Per REQ-ORACLEHOST-008.

This milestone is largely mechanical once M1 is verified: confirm the Oracle-hosted deployment is stable under real usage, then decommission or repurpose the Netlify deployment. No open architectural decisions are anticipated for M2 beyond the go/no-go timing judgment itself, which depends entirely on M1's verification outcome.

## §C. Technical Approach

No code changes accompany this SPEC's authoring. The technical approach for the future M1/M2 milestones is the standard Next.js-on-VM self-hosting pattern documented in `research.md` §4 (PM2 + Nginx + Certbot + `output: standalone`), applied to the M0 instance recorded in `research.md` §5. `.moai/project/tech.md`'s existing "무료 tier 우선" (free-tier-first) principle is preserved — Oracle Cloud Always Free carries no time limit, unlike Netlify's exhausted trial credits.

## §D. Risks

| Risk | Source | Disposition |
|---|---|---|
| 1 GB RAM is tight for Node.js + Gemini pipeline | `research.md` §6 | Disclosed, NOT mitigated by this SPEC. Mandatory swap-file mitigation required at M1 step 1 before PM2 configuration. |
| Ampere A1 capacity may become available later in this region | `research.md` §5.1/§5.2 | Out of scope for this SPEC (`spec.md` § Out of Scope). A future SPEC amendment MAY revisit upgrading the instance if capacity opens up. |
| Secrets handling on a self-managed VM (vs. a managed platform's secret store) | M1 step 5 | Deferred to M1 implementation-time decision; this SPEC records only the non-negotiable constraint (never committed, never logged). |

## §E. Self-Verification (plan-phase)

- [x] `spec.md` REQ-ORACLEHOST-001 through -012 authored in GEARS notation.
- [x] `research.md` records M0 execution evidence (§5) with verbatim `ServiceError` isolation evidence per REQ-ORACLEHOST-005.
- [x] `research.md` distinguishes WebFetch-verified official specs (§1) from WebSearch-sourced community findings (§2, §4) per REQ-ORACLEHOST-002/003/012.
- [x] `plan.md` records M1/M2 as future, gated, NOT-executed milestones per REQ-ORACLEHOST-008/009.
- [x] `acceptance.md` carries the Given-When-Then AC matrix, minimum 2 scenarios, binary-testable.
- [ ] plan-auditor independent review (pending — next step in the plan-phase workflow).

## §F. Milestones — Summary Table

| Milestone | Status | Entry Gate |
|---|---|---|
| M0 — Instance Provisioning | EXECUTED (this SPEC) | n/a — already closed |
| M1 — Application Deployment | NOT EXECUTED | Separate explicit user approval |
| M2 — Netlify Cutover | NOT EXECUTED | M1 verified success + separate explicit user approval |

## §G. Anti-Patterns Avoided

- Not presenting the M0 instance as risk-free (RAM constraint explicitly disclosed, `research.md` §6).
- Not conflating "M0 executed" with "M1/M2 authorized" — each future milestone carries its own explicit-approval gate (REQ-ORACLEHOST-008).
- Not printing raw SSH key material into a SPEC artifact (REQ-ORACLEHOST-006).
- Not silently reusing the Cloudflare SPEC's `spike/` branch-isolation pattern — this SPEC is the project's real infrastructure direction and follows the standard Route A (Hybrid Trunk main-direct) convention instead.

## §H. Cross-References

- SPEC-CLOUDFLARE-COMPAT-001 (`.moai/specs/SPEC-CLOUDFLARE-COMPAT-001/spec.md`) — predecessor investigation and rejection rationale.
- `.moai/project/tech.md` — this project's existing "무료 tier 우선" hosting principle and current Netlify entry (§ Netlify (Free tier 배포)); a future M2-close sync-phase SHOULD update this document to reflect the Oracle Cloud hosting decision.
- `.claude/rules/moai/workflow/spec-workflow.md` § SPEC Phase Discipline — Route A (Hybrid Trunk main-direct) this SPEC follows.
