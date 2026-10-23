# GitHub security monitoring

This baseline reports vulnerabilities; it does not automatically fix or deploy production code.

## Coverage
- On pull requests, main pushes, Mondays at 10:17 KST, and manual dispatch: high/critical dependency audit and CodeQL (JS/TS, security-extended).
- Audit covers every dependency (including dev dependencies) from the committed pnpm lockfile. Findings fail the job; inspect the Actions log.
- CodeQL findings appear under **Security → Code scanning**.
- Dependabot checks npm dependencies and GitHub Actions weekly and opens PRs, but does not auto-merge.

## Required follow-up
- This project declares **pnpm 11.23.0**, and published GitHub Dependabot support information may lag pnpm 11. Check the first npm Dependabot run in **Insights → Dependency graph → Dependabot**. Do not assume automated pnpm updates are effective until verified; the CI audit is independent.
- Under **Settings → Advanced Security**, review Dependency graph, Dependabot alerts, Dependabot security updates, secret scanning, push protection and code scanning availability. Workflow files cannot change those account settings.
- Do not require the new checks in branch protection until they have run successfully.
- Existing security and launch review Draft PRs are separate; this workflow does not resolve, approve, or merge them.
- **Important:** `.github/workflows/deploy.yml` deploys on every `main` push. Merging this PR triggers the pre-existing deployment workflow even though deploy.yml is unchanged. Merge only in an appropriate deployment window.

## Out of scope
GitHub cannot establish the installed versions of Nginx, OpenSSL or Node.js on the Oracle VM, inspect PM2, verify certificate renewal, or prove that a patched package is deployed. Audit these separately on the server.
