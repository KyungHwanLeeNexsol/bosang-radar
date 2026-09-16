# acceptance.md — SPEC-ORACLE-HOSTING-001

Given-When-Then acceptance criteria for this SPEC's plan-phase authoring. Every AC is binary-testable against the artifacts this SPEC produces (`spec.md`, `plan.md`, `research.md`, `progress.md`) — none require executing M1/M2 future work, which is explicitly out of scope for this SPEC's authoring.

## AC Matrix

### AC-ORACLEHOST-001
**Given** SPEC-CLOUDFLARE-COMPAT-001 exists with `status: rejected`
**When** SPEC-ORACLE-HOSTING-001's `spec.md` §1 (WHY) is read
**Then** it names SPEC-CLOUDFLARE-COMPAT-001 as its predecessor and states both decision drivers verbatim — exhausted Netlify free-tier credits AND the user's already-active Oracle Cloud account — satisfying REQ-ORACLEHOST-001.

### AC-ORACLEHOST-002
**Given** `research.md` §1
**When** each Always Free specification claim (Ampere A1 allocation, AMD Micro allocation, storage, egress, no-time-limit) is checked
**Then** each is attributed to the WebFetch-verified URL `https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm`, satisfying REQ-ORACLEHOST-002.

### AC-ORACLEHOST-003
**Given** `research.md` §2
**When** the Ampere A1 capacity-reduction claim (4 OCPU/24GB → 2 OCPU/12GB, effective 2026-06-15) is checked
**Then** it is attributed to WebSearch-sourced URLs explicitly labeled as community-sourced (not official Oracle documentation), and is visually/structurally distinguished from the WebFetch-verified claims in §1, satisfying REQ-ORACLEHOST-003.

### AC-ORACLEHOST-004
**Given** `research.md` §3
**When** the tenancy's region subscription, existing instance list, and existing networking claims are checked
**Then** each is attributed to a directly-executed `oci` CLI command's result against this account (region subscription, `news-hive`/`upbit-quant` instance states, VCN/subnet identifiers), satisfying REQ-ORACLEHOST-004.

### AC-ORACLEHOST-005
**Given** `research.md` §5.1 and §5.2
**When** the Ampere A1 failure and Micro success evidence is checked
**Then** §5.1 records the verbatim `ServiceError` (HTTP 404, `NotAuthorizedOrNotFound`) from the Ampere A1 attempt, AND §5.2 records the immediately-following identical-parameter Micro attempt succeeding, AND §5.2 states the isolation conclusion (Ampere-A1-specific, not a general config problem), satisfying REQ-ORACLEHOST-005.

### AC-ORACLEHOST-006
**Given** `research.md` §5.3
**When** the final instance's field table is checked
**Then** it lists display name, shape, region/AD, lifecycle state, OS, public IP, private IP, network, and SSH-key-reuse note, AND no raw SSH public key material string appears anywhere in `spec.md`, `plan.md`, or `research.md`, satisfying REQ-ORACLEHOST-006.

### AC-ORACLEHOST-007
**Given** `research.md` §6 and `spec.md` REQ-ORACLEHOST-007
**When** the RAM-risk framing is checked
**Then** the 1 GB RAM constraint is stated as an explicitly disclosed, unmitigated risk (not a risk-free outcome), AND the text states this was not the originally preferred specification, satisfying REQ-ORACLEHOST-007.

### AC-ORACLEHOST-008
**Given** `plan.md` §B (Milestones)
**When** M1 and M2 are checked
**Then** each carries an explicit "Entry criteria" line requiring a separate, explicit user approval distinct from this SPEC's own authoring approval, AND neither M1 nor M2 shows any deliverable marked as executed, satisfying REQ-ORACLEHOST-008.

### AC-ORACLEHOST-009
**Given** `plan.md` §B M1 (Milestone M1 task list)
**When** the task ordering is checked
**Then** the swap-file mitigation task is present, is labeled MANDATORY (not optional), and is ordered before the PM2 process-manager configuration task, satisfying REQ-ORACLEHOST-009.

### AC-ORACLEHOST-010
**Given** the full artifact set for this SPEC's authoring session (git diff for this SPEC's plan-phase commit)
**When** the changed-files list is checked
**Then** it contains only markdown files under `.moai/specs/SPEC-ORACLE-HOSTING-001/`, AND no application source file (`app/`, `lib/`, `components/`, etc.) appears, AND no Netlify configuration file or DNS-related file appears, satisfying REQ-ORACLEHOST-010 and REQ-ORACLEHOST-011.

### AC-ORACLEHOST-011
**Given** every technical claim across `spec.md` and `research.md`
**When** each is traced to its evidence source
**Then** each resolves to either a verbatim command output block or a WebFetch/WebSearch-verified URL — no claim is found with no attributed source, satisfying REQ-ORACLEHOST-012.

## Edge Cases

- **EC-1 — Ambiguity between "executed" and "planned" language**: reviewers checking this SPEC MUST be able to distinguish M0 (past tense, evidence-backed) from M1/M2 (future tense, gated) purely from the section headers (`[EXECUTED — this SPEC's authoring]` vs `[NOT EXECUTED — future, gated]`) without needing to read the full body text. Verified by AC-ORACLEHOST-008's "no deliverable marked as executed" check.
- **EC-2 — Region-subscription claim staleness**: `research.md` §3's region-subscription claim is a point-in-time fact (2026-09-16). If this SPEC is read or amended later, the claim's `oci` CLI attribution makes it re-verifiable rather than assumed — this is why AC-ORACLEHOST-004 requires attribution to a command, not a bare assertion.

## Quality Gate Criteria

- All 11 ACs above PASS (binary, no partial credit).
- `spec.md` frontmatter passes the 12-field canonical schema check (SPEC ID regex, all required fields present).
- `spec.md` § Out of Scope contains at least one `### Out of Scope — <topic>` H3 heading with `-` bullets (satisfied — three such sections present).
- No REQ or AC count exceeds the Tier M ceiling (16 each) — this SPEC carries 12 REQ and 11 AC, both within budget.

## Definition of Done (plan-phase)

This SPEC's plan-phase is done when:
1. `spec.md`, `plan.md`, `acceptance.md`, `research.md`, `progress.md` all exist under `.moai/specs/SPEC-ORACLE-HOSTING-001/`.
2. `progress.md` §E.1 records `plan_status: audit-ready`.
3. plan-auditor has been invoked and returned a verdict (PASS / FAIL / INCONCLUSIVE) — tracked separately from this SPEC's own authoring, per `spec-workflow.md` § Phase 1 Plan Audit Gate.
4. This SPEC's frontmatter `status:` remains `draft` until the `(none) → draft` transition's owning commit (manager-spec) lands — no further transition happens within this SPEC's authoring.
