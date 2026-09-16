---
id: SPEC-ORACLE-HOSTING-001
title: "Oracle Cloud Always Free VM 호스팅 전환 — M0 인스턴스 프로비저닝 기록 및 M1-M2 배포 계획"
version: "0.1.0"
status: draft
created: 2026-09-16
updated: 2026-09-16
author: Nexsol
priority: P1
phase: "v0.9.0 target"
module: "infra/oracle-cloud (신규 배포 대상), .moai/project/tech.md (호스팅 결정 갱신 대상)"
lifecycle: spec-anchored
tags: "oracle-cloud, always-free, hosting-migration, infrastructure, deployment, netlify-cutover"
tier: M
---

## HISTORY

- 2026-09-16: 최초 작성 (Nexsol) — SPEC-CLOUDFLARE-COMPAT-001(Cloudflare Workers Free-tier 호환성 스파이크, 4회 plan-audit 반복 후 `CLOUDFLARE-SPIKE-UNVERIFIED`로 종료, `status: rejected`)의 후속 SPEC. 이 프로젝트의 기존 Netlify 호스팅이 무료 크레딧을 소진한 실제 긴급성과, 사용자가 이미 활성 Oracle Cloud 계정을 보유하고 있다는 사실을 근거로, 프레임워크 마이그레이션이 필요한 Cloudflare 경로 대신 표준 Linux VM에서 기존 Next.js 앱을 그대로 구동하는 Oracle Cloud Always Free 경로로 전환하기로 결정했다.

  Cloudflare 경로와 달리 이 SPEC은 **순수 조사 스파이크가 아니다** — 이미 실행된 작업(실제 리서치 + 실제 Oracle Cloud 컴퓨트 인스턴스 프로비저닝)을 기록하고, 향후 별도 승인이 필요한 작업(실제 앱 배포)을 계획으로 남긴다. `tier: M`에 `research.md`를 추가한 이유는 SPEC-CLOUDFLARE-COMPAT-001과 동일하다 — plan-phase에서 실행한 근거(Oracle 공식 문서 WebFetch 검증, `oci` CLI 직접 조회 결과, 인스턴스 프로비저닝 명령 출력)를 남길 곳이 Tier M의 표준 3-파일 세트(spec/plan/acceptance)에는 없다. `design.md`는 추가하지 않는다 — 이 SPEC은 UI/아키텍처 설계 산출물이 없는 인프라 의사결정 기록이기 때문이다.

## 1. WHY (배경)

이 프로젝트(bosang-radar)는 지금까지 Netlify(Background Functions 포함)에 호스팅되어 왔으나, Netlify 무료 tier의 크레딧이 이미 소진되어 현재 사용 가능한 배포 대상이 없는 상태다. 이 문제는 즉시 해결이 필요한 실질적 제약이다.

사용자는 애초에 Cloudflare Workers Free tier로의 이전 가능성을 조사했다(SPEC-CLOUDFLARE-COMPAT-001). 4회의 독립 plan-audit 반복(최종 PASS 0.80) 끝에도, 이 프로젝트의 정확한 의존성 스택(Next.js 16.3.2 + Better Auth 1.7.1 + `@libsql/client` + `@google/genai`)이 vinext의 베타 Vite/workerd 빌드 파이프라인에서 실제로 빌드되는지 여부라는 가장 결정적인 질문이 미해결로 남았다 — Stage 3(실제 Cloudflare 테스트 배포)는 그 SPEC의 plan-phase 범위 밖이었기 때문이다. 추가로, `processCaseJob`(`lib/cases/create-case.ts`)이 재시도/종료/펜싱 신호를 구분할 방법 없이 `Promise<void>`만 반환하는 아키텍처적 결함도 발견되었는데, 이는 호스팅 플랫폼과 무관하게 프로덕션 투입 전 반드시 수정이 필요한 결함이다.

Cloudflare 경로를 Stage 3-5로 계속 진행하려면 추가 스파이크 작업(M1b/M1c, `npx vinext init` 실행 + 실제 Cloudflare 프리뷰 배포)이 GO/NO-GO 판정 전에 더 필요했다. 반면 사용자는 이미 활성 Oracle Cloud 계정을 보유하고 있고, Oracle Cloud Always Free VM 기반 호스팅은 **프레임워크 마이그레이션이 전혀 필요 없다** — 기존 Next.js 애플리케이션이 표준 Linux VM 위에서 그대로 구동된다. 시간 압박(Netlify 크레딧 소진)과 이 구조적 이점을 근거로, 사용자는 Cloudflare Stage 3-5 조사를 중단하고 Oracle Cloud Always Free 경로로 전환하기로 결정했다.

이 SPEC은 그 전환 결정을 기록하고, 이미 완료된 M0(인스턴스 프로비저닝) 작업의 증거를 남기며, 향후 별도 승인이 필요한 M1(앱 배포)·M2(Netlify 전환 완료) 마일스톤을 계획한다.

## 2. Requirements (GEARS)

### REQ-ORACLEHOST-001 (Ubiquitous)
The SPEC document shall record the pivot rationale from SPEC-CLOUDFLARE-COMPAT-001 to Oracle Cloud Always Free hosting, citing the exhausted Netlify free-tier credits (real urgency) and the user's already-active Oracle Cloud account as the two decision drivers.

### REQ-ORACLEHOST-002 (Ubiquitous)
research.md shall record the Oracle Cloud Always Free tier specifications (Ampere A1 and AMD Micro shapes, storage, egress, no-time-limit terms) with each claim attributed to a WebFetch-verified official Oracle documentation URL, per `verification-claim-integrity.md` §2.

### REQ-ORACLEHOST-003 (Ubiquitous)
research.md shall record the Ampere A1 capacity-reduction finding (Oracle halved the free-tier Ampere A1 allocation from 4 OCPU/24GB to 2 OCPU/12GB on 2026-06-15) with each claim attributed to a WebSearch-sourced URL, distinguishing this community-sourced finding from the WebFetch-verified official specifications in REQ-ORACLEHOST-002.

### REQ-ORACLEHOST-004 (Ubiquitous)
research.md shall record this tenancy's actual regional subscription, existing compute instances, and existing networking resources (VCN + subnet), with each claim attributed to the verbatim output of a directly-executed `oci` CLI command against this account.

### REQ-ORACLEHOST-005 (Event-driven)
**When** recording the M0 instance-provisioning attempt, the SPEC shall include the verbatim `ServiceError` evidence from the failed `VM.Standard.A1.Flex` launch attempt (HTTP 404, `NotAuthorizedOrNotFound`) and the verbatim success evidence from the immediately-following `VM.Standard.E2.1.Micro` launch attempt with identical parameters, so the isolation of the failure to Ampere A1 shape/capacity (not auth, network, image, or SSH-key configuration) is independently verifiable.

### REQ-ORACLEHOST-006 (Ubiquitous)
The SPEC shall record the final M0 instance's identifying details — display name, shape, region/availability domain, lifecycle state, OS, public and private IP addresses, and the VCN/subnet it was attached to — without printing the raw SSH public key material, stating only that the key is reused from an existing authorized instance.

### REQ-ORACLEHOST-007 (Ubiquitous)
The SPEC shall record the 1 GB RAM constraint of the provisioned `VM.Standard.E2.1.Micro` instance as an explicitly disclosed, unmitigated risk for the Node.js/Next.js server plus the Gemini-calling background pipeline (`lib/pipeline/`) — not as a risk-free outcome — and shall record that this was not the originally preferred specification (2 OCPU/12GB Ampere A1 was unavailable due to capacity).

### REQ-ORACLEHOST-008 (Ubiquitous)
plan.md shall record Milestone M1 (application deployment onto the M0 instance) and Milestone M2 (Netlify cutover/decommission) as future, NOT-executed milestones, each with explicit entry criteria requiring a separate, explicit user approval distinct from this SPEC's own authoring approval.

### REQ-ORACLEHOST-009 (Where — capability gate)
**Where** Milestone M1 is entered in a future run-phase, the milestone's task list shall require provisioning a swap file as a mandatory (not optional) mitigation for the REQ-ORACLEHOST-007 RAM risk, ordered before the PM2 process-manager configuration step.

### REQ-ORACLEHOST-010 (Unwanted — shall not)
Authoring this SPEC shall not perform application deployment, DNS changes, Netlify decommissioning, production secret provisioning, or any additional Oracle Cloud resource creation beyond the M0 instance and networking already recorded in research.md.

### REQ-ORACLEHOST-011 (Unwanted — shall not)
Authoring this SPEC shall not modify any application source code.

### REQ-ORACLEHOST-012 (Ubiquitous)
Every technical claim in research.md and spec.md shall be attributed to either the verbatim output of a directly-executed command or a WebFetch/WebSearch-verified source URL, per `verification-claim-integrity.md` §2 — no unattributed compatibility or capacity claim shall appear.

## 3. Non-Functional Constraints

- **No further Oracle resource creation in this SPEC's authoring**: the M0 instance and its VCN/subnet were created before or during this SPEC's authoring as recorded evidence; this SPEC's authoring itself creates no additional Oracle Cloud resources.
- **No production impact**: Netlify's existing (exhausted-credit) configuration, DNS records, and any production data remain untouched by this SPEC's authoring.
- **Evidence attribution**: every capacity, pricing, or capability claim about Oracle Cloud Always Free cites either a WebFetch-verified official documentation URL, a WebSearch-sourced community finding (explicitly labeled as such), or a directly-executed `oci` CLI command's verbatim output.
- **Secret handling (forward-looking, M1 scope)**: no production secret (database tokens, Gemini API key, auth secrets) is committed to this SPEC or any repository file; M1's task list records the requirement to provision these via a secure mechanism when M1 is later approved and executed.

## Out of Scope

### Out of Scope — Application deployment and cutover (M1/M2)
- Installing Node.js/pnpm, PM2, Nginx, or Certbot on the M0 instance.
- Setting required environment variables/secrets (Turso, Gemini, auth) on the instance.
- Pointing DNS at the new public IP.
- Verifying the deployed app serves traffic correctly (login, case submission, background job processing).
- Decommissioning or modifying the existing Netlify deployment.

All of the above are recorded as Milestone M1 (deployment) and Milestone M2 (cutover) in `plan.md`, each gated behind a separate, explicit future user approval — none of them are executed as part of this SPEC's authoring.

### Out of Scope — Further Oracle Cloud resource provisioning
- Creating any additional Oracle Cloud compute instance, VCN, subnet, load balancer, or block-volume resource beyond the M0 instance and existing networking already recorded in `research.md`.
- Retrying the `VM.Standard.A1.Flex` (Ampere A1) launch in a different availability domain or region — this MAY be revisited in a future SPEC amendment if Ampere A1 capacity becomes available, but is not attempted here.

### Out of Scope — Application source code changes
- Any refactor of `lib/pipeline/`, `lib/cases/`, `lib/auth/`, `lib/db/`, or any other application source file. This SPEC documents an infrastructure decision and records already-completed provisioning evidence; it does not change application behavior.
