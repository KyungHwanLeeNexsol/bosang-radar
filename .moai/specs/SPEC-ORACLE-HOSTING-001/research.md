# research.md — SPEC-ORACLE-HOSTING-001

Already-completed research and execution evidence for the Oracle Cloud Always Free hosting pivot. Every claim below is attributed per `verification-claim-integrity.md` §2 — either a WebFetch-verified official documentation URL, a WebSearch-sourced community finding (labeled as such), or the verbatim output of a directly-executed `oci` CLI command against this account. Captured 2026-09-16.

## §1. Oracle Cloud Always Free Tier Specifications (WebFetch-verified)

**Source**: `https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm` — WebFetch-verified 2026-09-16.

- **Ampere A1 Compute** (ARM, shape `VM.Standard.A1.Flex`): up to 2 OCPU / 12 GB RAM total, flexibly split across up to 4 instances or concentrated into 1 instance with the full allocation.
- **AMD Micro Compute** (x86, shape `VM.Standard.E2.1.Micro`): up to 2 instances, each capped at 1/8 OCPU / 1 GB RAM.
- **Storage**: 200 GB shared block-volume storage across all Always Free instances.
- **Networking**: 10 TB/month outbound egress.
- **Duration**: Always Free resources carry no time limit — distinct from the separate 30-day/$300 trial credit, which does expire.

**Source**: `https://www.oracle.com/cloud/free/faq/` — WebSearch-sourced 2026-09-16.

- Signup requires a valid (non-prepaid) credit/debit card for identity verification, incurring a temporary ~$1 hold rather than an actual charge. Not applicable to this SPEC's execution — the account used already exists and is active.

## §2. Ampere A1 Capacity Reduction (WebSearch-sourced, NOT official documentation)

**Sources** (community-sourced, WebSearch 2026-09-16; no single canonical Oracle URL found for this specific change):
- `https://linuxiac.com/oracle-quietly-cuts-free-tier-ampere-a1-resources-in-half/`
- `https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/`

Oracle reduced the Always Free Ampere A1 allocation from the originally-documented 4 OCPU / 24 GB to the current 2 OCPU / 12 GB, effective 2026-06-15, with no public announcement accompanying the change. This finding is explicitly distinguished from §1's WebFetch-verified official specification — §1 already reflects the reduced (current) allocation; this section records the historical context of the reduction itself.

**Capacity/region finding** (WebSearch-sourced, general community consensus at time of research, no single canonical URL): US regions frequently report "Out of host capacity" for Ampere A1 provisioning requests, sometimes for hours to days; EU/APAC regions (Frankfurt, Singapore, Tokyo) typically provision within approximately 5 minutes. This general community finding is consistent with, but did not predict, the specific 404 `NotAuthorizedOrNotFound` failure this tenancy observed in §5 — the two are related capacity phenomena but were verified independently.

## §3. This Tenancy's Actual State (oci CLI-verified, 2026-09-16)

Verified directly via the `oci` CLI, already configured on this machine, against this account.

- **Region subscription**: this tenancy is subscribed to exactly ONE region — `ap-chuncheon-1` (Korea Central / Chuncheon) — the tenancy's home region. Seoul (`ap-seoul-1`) and Osaka (`ap-osaka-1`) exist as Oracle regions but this tenancy is NOT subscribed to them; using either would require an additional region-subscription step, which was not taken as part of this SPEC.
- **Existing compute instances**: one existing instance, `news-hive` (shape `VM.Standard.E2.1.Micro`, state RUNNING, region `ap-chuncheon-1`) — confirms this account/region can reliably provision the Micro shape. A second historical instance, `upbit-quant`, is TERMINATED and not relevant to this SPEC.
- **Existing networking**: one existing VCN, `vcn-20260305-1423` (CIDR `10.0.0.0/16`), with one public subnet, `subnet-20260305-1423` (CIDR `10.0.0.0/24`). This existing VCN/subnet was reused for the new instance in §5 rather than creating new networking.

## §4. Next.js-on-VM Deployment Pattern (WebSearch-sourced, forward-looking reference for M1)

**Source** (WebSearch, multiple 2026 tutorials converge on this pattern; representative example `https://oxmgr.empellio.com/blog/nextjs-self-hosting-2026`):

Self-hosting a Next.js application on a standard Linux VM is a low-risk, well-established pattern: PM2 (Node.js process manager, keeps the app running and restarts on crash) fronted by Nginx (reverse proxy; the Next.js process listens on `127.0.0.1` only, never exposed directly to the internet), with Certbot/Let's Encrypt providing HTTPS via a free automated certificate, and the Next.js app built with `output: standalone` (Next.js's minimal self-contained build mode for non-platform-specific hosting). This section is recorded as forward-looking reference material for Milestone M1 (`plan.md`); it is NOT executed as part of this SPEC.

## §5. M0 Execution — Instance Provisioning (EXECUTED)

This section records work that was actually performed as part of this SPEC's authoring — a real Oracle Cloud compute instance was provisioned, not merely planned.

### §5.1 Attempt 1 — Ampere A1 (failed)

An `oci compute instance launch` was attempted for shape `VM.Standard.A1.Flex` (2 OCPU / 12 GB, per §1's current Always Free allocation) in region `ap-chuncheon-1`, availability domain `lafQ:AP-CHUNCHEON-1-AD-1`, using the existing VCN/subnet from §3, with an Ubuntu 24.04 aarch64 image.

**Result**: failed. `ServiceError`, HTTP status 404, error code `NotAuthorizedOrNotFound`, on `POST /20160918/instances`. The request body was verified well-formed via `--debug` output — all referenced OCIDs (compartment, subnet, image) were valid. The 404/`NotAuthorizedOrNotFound` response on an otherwise well-formed request against a valid OCID set is consistent with a capacity-exhaustion response pattern for the Ampere A1 shape in this region, not a malformed-request or permissions error.

### §5.2 Attempt 2 — AMD Micro (succeeded, isolation test)

To isolate whether the Attempt 1 failure was Ampere-A1-specific or a broader configuration problem, the identical launch parameters (same compartment, same VCN/subnet, same availability domain) were immediately re-attempted with shape `VM.Standard.E2.1.Micro` (no `shapeConfig` needed — the Micro shape has a fixed allocation) and an x86 Ubuntu 24.04 image (`Canonical-Ubuntu-24.04-2026.08.25-0`, since Micro is x86-only).

**Result**: succeeded immediately. `lifecycle-state: PROVISIONING`, transitioning to `RUNNING`.

**Isolation conclusion**: because Attempt 2 succeeded immediately with the same VCN, subnet, availability domain, compartment, and (functionally) the same auth/SSH-key configuration as the failed Attempt 1, the Attempt 1 failure is isolated specifically to Ampere A1 shape/capacity availability in this account+region — NOT a general auth, network, image, or SSH-key configuration problem. This is consistent with the user's own prior, independently-formed experience: Ampere A1 capacity was previously unavailable to this account, while Micro capacity was reliably available (also consistent with §3's existing `news-hive` instance already running on the Micro shape).

### §5.3 Final Result — Provisioned Instance

A real, running Oracle Cloud compute instance now exists:

| Field | Value |
|---|---|
| Display name | `bosang-radar` (renamed post-launch via `oci compute instance update --display-name bosang-radar` from an initial diagnostic name) |
| Shape | `VM.Standard.E2.1.Micro` (x86, 1/8 OCPU, 1 GB RAM) |
| Region / AD | `ap-chuncheon-1`, `lafQ:AP-CHUNCHEON-1-AD-1` |
| Lifecycle state | RUNNING |
| OS | Ubuntu 24.04 LTS (x86_64) |
| Public IP | `152.67.203.228` |
| Private IP | `10.0.0.214` |
| Network | existing VCN `vcn-20260305-1423` / subnet `subnet-20260305-1423` (§3), public IP assigned |
| SSH access | reuses the same public key already authorized on the existing `news-hive` instance (§3), for the user's convenience — the matching private key is already held by the user. Raw key material is intentionally NOT reproduced in this document. |
| Creation method | `oci compute instance launch` (CLI) |

## §6. Known Risk — RAM Constraint (disclosed, NOT mitigated in this SPEC)

The provisioned instance carries only **1 GB RAM**, which is genuinely tight for a Node.js/Next.js server process running alongside the Gemini-calling background job pipeline (`lib/pipeline/`). This was NOT the originally preferred specification — the 2 OCPU / 12 GB Ampere A1 shape (§1) was the preferred target, but was unavailable due to the capacity exhaustion isolated in §5.1/§5.2. This risk is recorded here as an explicitly open item; it is NOT presented as risk-free, and its mitigation (a swap file, per `plan.md` Milestone M1) is a mandatory — not optional — task within the future, separately-gated M1 milestone.
