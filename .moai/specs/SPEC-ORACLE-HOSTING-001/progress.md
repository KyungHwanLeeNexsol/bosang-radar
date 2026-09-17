# progress.md — SPEC-ORACLE-HOSTING-001

## §E.1 Plan-phase Audit-Ready Signal

```yaml
plan_status: audit-ready
plan_complete_at: 2026-09-16
tier: M
artifacts: [spec.md, plan.md, acceptance.md, research.md]
```

Plan-phase artifact set authored: `spec.md` (12 GEARS requirements), `plan.md` (M0 executed / M1-M2 gated future milestones), `acceptance.md` (11 Given-When-Then ACs), `research.md` (already-completed research + M0 execution evidence, evidence-attributed per `verification-claim-integrity.md` §2). Predecessor: SPEC-CLOUDFLARE-COMPAT-001 (`status: rejected`).

## §E.2 Run-phase Evidence

M1 executed 2026-09-17 (orchestrator-direct interactive SSH deployment, not delegated to manager-develop, given the real-infrastructure/interactive-secrets nature of the work):

- Swap file provisioned (2GB → resized to 4GB after two OOM build failures during TypeScript checking; V8's heap-size auto-detection was the root cause, not literal memory exhaustion).
- Node.js 22.23.2, pnpm 12.4.2, PM2 7.0.4, Nginx 1.24.0 installed.
- `next.config.ts`: added `output: "standalone"` (commit `c8dd980`, pushed to `main` per Route A).
- Repo cloned onto the instance via a dedicated read-only GitHub deploy key (`oracle-vm-deploy`), never via the user's own credentials.
- `.env` populated: `BETTER_AUTH_SECRET` auto-generated (`openssl rand -base64 32`); `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` / `GEMINI_API_KEY` filled in directly by the user over their own SSH session (never transmitted through this conversation). `BETTER_AUTH_URL=http://152.67.203.228` (no domain yet, per user decision — DNS cutover deferred).
- DB migration (`pnpm run db:migrate`) succeeded against the live Turso database.
- Build succeeded on the 3rd attempt: `NODE_OPTIONS=--max-old-space-size=3072 pnpm run build` (attempts 1-2 failed with V8 OOM during the TypeScript check step; attempt 1 also independently confirmed a stalled local SSH connection is not a reliable build-progress signal — the remote process had already died from a dropped connection while the local `ssh` client kept waiting).
- PM2 (`ecosystem.config.js`) running `.next/standalone/server.js`, bound to `127.0.0.1:3000`; `pm2 save` + `pm2 startup systemd` confirmed enabled (`pm2-ubuntu.service`).
- Nginx reverse-proxies `:80` → `127.0.0.1:3000` (`/etc/nginx/sites-available/bosang-radar`).
- iptables: discovered the default INPUT chain had no ACCEPT rule for tcp/80 or tcp/443 (only established/related + SSH were allowed; everything else REJECTed) — added ACCEPT rules for both, persisted via `netfilter-persistent save`.
- External verification: `curl http://152.67.203.228/login` → `HTTP/1.1 200 OK`, real Next.js-rendered HTML (Pretendard/Geist fonts, correct `X-Powered-By: Next.js` header) served through `nginx/1.24.0`.

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_status: audit-ready
run_complete_at: 2026-09-17
milestone: M1
```

M1 step 7 (end-to-end verification) confirmed by user 2026-09-17: login succeeds, case submission returns 202 and completes, Gemini research pipeline runs and produces a report. This closed a real production defect discovered during verification — `app/api/cases/route.ts` called a Netlify-only Background Function path (`/.netlify/functions/process-case-background`, 404 on this host), causing every case submission to fail with a self-issued 502. Fixed by replacing the HTTP round-trip with Next.js `after()` (same-process background execution, appropriate for a persistent PM2 server vs. serverless) — commit `b4aeba8`. M0 remains executed (research.md §5); M2 (Netlify decommission) remains a future, separately-gated milestone per plan.md — not started.

Out-of-band fix bundled into this same deploy session, unrelated to Oracle hosting but discovered during live verification: sidebar "전문가 피드백" nav item removed per explicit user request (reverses SPEC-SIDEBAR-NAV-001's in-page-anchor-retention decision) — commit `5ec78ce`. Tracked here for traceability only; SPEC-SIDEBAR-NAV-001's own artifacts were not amended.

Deferred to a follow-up SPEC (user requested, out of this SPEC's scope): a real (non-fake) percentage progress bar for case analysis, which requires backend instrumentation (case_jobs stage/percent tracking) + API + frontend — to be scoped via `/moai plan`.

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
