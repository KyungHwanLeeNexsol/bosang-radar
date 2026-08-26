---
id: SPEC-RUNTIME-001
title: "보상레이더 MVP scaffold 실제 런타임 활성화 (DB 연결·시드·테스터 프로비저닝·E2E 검증)"
version: "0.5.1"
status: completed
created: 2026-08-24
updated: 2026-08-26
author: Nexsol
priority: P1
phase: "v0.5.0 target"
module: "lib/, scripts/, e2e/, db/"
lifecycle: spec-anchored
tags: "runtime, turso, migration, seed, better-auth, provisioning, e2e, env-validation"
tier: L
depends_on: [SPEC-SCAFFOLD-001]
---

## HISTORY

- 2026-08-25: 잔여 위험 보강 v0.5.1 (Nexsol 승인, sync-phase 품질 리뷰 중 보안 리뷰와 sync-auditor가 각각 독립적으로 발견한 LOW 등급 잔여 위험 2건 기록) — (1) `scripts/run-e2e.ts`의 동적 포트 탐색(`findFreePort()`, M5에서 하드코딩 포트 3000을 대체하며 도입)이 빈 포트를 찾은 시점과 실제 서버(`pnpm build && pnpm start`)가 그 포트를 바인딩하는 시점 사이의 TOCTOU, (2) `scripts/env-local-safety.ts`의 `.env.local` 백업 파일이 `{ mode: 0o600 }` 없이 `writeFileSync`로 작성되어 권한이 명시적으로 고정되지 않는 점. 두 항목 모두 두 리뷰어가 코드 변경이 필요 없는 문서화 전용(non-blocking) 잔여 위험으로 분류했다. `spec.md` §5(본 절)와 `design.md` §3.6에 이미 있는 `kill -9` 잔여 위험과 동일한 정직성 원칙에 따라 기록하며, `acceptance.md`의 AC 통과 기준이나 `spec.md` §2 REQ 21개 개수는 변경하지 않는다.
- 2026-08-25: 플랜 개정 v0.5.0 (Nexsol 승인, run-phase M2 진행 중 발견된 선행 SPEC 결함 보정) — M2(테스터 프로비저닝) 실행 중 `lib/db/schema.ts`가 SPEC-SCAFFOLD-001에서 이미 선언한 `account.issuer` 컬럼(Better Auth 1.7.1 요구, 커밋 `5dbaff7`)이 `db/migrations/0000_broad_big_bertha.sql`에는 반영되지 않은 스키마/마이그레이션 드리프트가 발견되어 `auth.api.signUpEmail()` 호출이 `SQLITE_ERROR: table account has no column named issuer`로 실패했다. 이 결함을 동기화하는 보정 마이그레이션 1건만 추가하기로 하고, `acceptance.md` AC-RUNTIME-017 (3)항 및 §B DoD 대응 항목에 그 1건만을 좁게 허용하는 예외 문구를 추가했다. `spec.md` §4 제외 범위·WHY/WHAT은 변경하지 않으며 REQ 21 / AC 22 개수는 불변이다. 이 개정은 이번 SPEC 자신의 설계 결정이 아니라 SPEC-SCAFFOLD-001이 남긴 기존 결함을 보정하는 것이며, `lib/db/schema.ts` 자체는 변경되지 않는다(해당 컬럼은 이미 선언되어 있었다). 근거는 `plan.md` §A.6, `acceptance.md` AC-RUNTIME-017, `progress.md` §E.1에 기록.
- 2026-08-24: 최초 작성 (Nexsol) — SPEC-SCAFFOLD-001(completed)이 구축한 scaffold를 실제 로컬 런타임에서 end-to-end 실행 가능한 상태로 만드는 런타임 활성화 SPEC. 현행 코드베이스 실측(`lib/db/client.ts`, `lib/auth/config.ts`, `db/migrations/`, `db/seed/evidence.json`, `package.json`) 기반으로 작성.
- 2026-08-25: 플랜 개정 v0.4.0 (Nexsol 요청, 구현 착수 승인 전 최종 정합성 점검) — AC-RUNTIME-022의 검증 범위를 `run-e2e.ts`가 직접 spawn하는 Playwright 러너 구간으로 좁히고(앱 서버 프로세스에 전달된 env는 이 AC의 관측 대상이 아니며, 그 구간까지의 실제 전파는 AC-RUNTIME-015의 실제 Playwright 실행이 기능적으로 커버함을 명시), sentinel/테스트 `.env.local`을 쓰고 검증 종료 후 원상복구하는 안전 교체·복원 설계를 신설했으며(`design.md` §3.6 — 모든 정상/실패/시그널 종료 경로에서 복원, `kill -9`는 닫히지 않는 잔여 위험으로 정직하게 명시), 잔존 문서 오류 3건(REQ/AC 개수 표기, `e2e/global-setup.ts` 잔존 표현, `progress.md` §E.1 시제 모호성)을 정리했다. `spec.md` §4 제외 범위·WHY/WHAT은 변경하지 않으며 REQ 21 / AC 22 개수는 불변이다. 근거는 `research.md` §5, `design.md` §3.5/§3.6, `progress.md` §E.1에 기록.
- 2026-08-24: 플랜 개정 v0.3.0 (Nexsol 요청, 3차 설계 검토) — 구현 착수 승인 전, **구현 접근 방식 3건**을 추가 개정했다. SPEC의 목표(WHY/WHAT)와 §4 제외 범위는 변경하지 않는다. (1) 독립 실행 CLI 스크립트(`db:migrate`/`db:seed`/`tester:add`)가 Next.js의 자동 `.env.local` 로딩에 무임승차한다는 암묵적 가정을 제거하고 **공용 CLI 부트스트랩의 명시적 로드 → 검증 순서**를 신설(REQ-RUNTIME-021), (2) AC-RUNTIME-015의 `.env.local` 우선순위 시험이 **실제 원격 Turso 자격증명**을 쓰던 것을 **비라우팅 sentinel 값**으로 교체(우선순위 가정이 틀렸을 때도 실제 DB에 도달·기록이 불가능하도록 blast radius 제거), (3) "로그인 성공이 `BETTER_AUTH_SECRET` 동일성을 입증한다"는 **논리적 과잉주장을 제거**하고 구조적 검증(AC-RUNTIME-022)과 기능적 검증(AC-RUNTIME-015)으로 분리. 근거 실측은 `research.md` §0.2에 기록.
- 2026-08-24: 플랜 개정 v0.2.0 (Nexsol 요청) — 구현 착수 승인 전, 사용자 설계 검토 결과 **구현 접근 방식 3건**을 개정했다. SPEC의 목표(WHY/WHAT)와 §4 제외 범위는 변경하지 않는다. (1) E2E 시크릿 수명주기를 Playwright `globalSetup` 환경 상속 가정에서 **단일 진입점 스크립트 소유 방식**으로 교체, (2) 테스터 계정 생성을 Better Auth 내부 해시 API + 직접 INSERT에서 **프로비저닝 전용 인스턴스의 공식 `auth.api.signUpEmail` 호출**로 교체, (3) 환경변수 검증을 단일 평면 집합에서 **실행 목적별 스코프 검증**으로 교체. 근거 실측은 `research.md` §0에 추가 기록.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-SCAFFOLD-001은 Next.js/TypeScript/Drizzle/Turso/Better Auth/Gemini 스택 위에 6단계 리서치 파이프라인의 **타입 계약 스텁**과 PII 차단 검증 계층을 구축하고 `completed`로 종료했다. 그러나 그 SPEC이 실제로 증명한 것은 "테스트와 빌드가 통과한다"는 사실까지다.

현행 코드베이스를 실측한 결과, 실행 가능한 런타임과 현재 상태 사이에 다음 간극이 확인된다:

- `db/migrations/0000_broad_big_bertha.sql`은 생성되어 있으나, 이를 **실제 인스턴스에 적용하는 경로가 없다**. `package.json`에는 `db:generate`만 있고 `db:migrate`가 없다.
- `db/seed/evidence.json`은 존재하지만 이를 DB에 적재하는 경로가 없어 `evidence` 테이블은 실행 시 비어 있다. 즉 **evidence 조회를 DB 기반으로 전환하기 위해 후속 SPEC이 필요로 하는 전제가 아직 갖춰지지 않았다**. (이번 SPEC에서 조회 경로 자체는 바뀌지 않는다 — `lib/pipeline/evidence-retriever.ts`와 `app/cases/[caseId]/page.tsx`는 계속 JSON을 직접 읽으므로, 시드 적재는 이번 주기에 관측 가능한 동작 변화를 만들지 않는 쓰기 전용 준비 작업이다.)
- `lib/auth/config.ts`가 `disableSignUp: true`이므로 **셀프 가입 경로가 없고**, 그렇다고 운영자가 초대 전용 테스터 계정을 만들 수단도 없다. 즉 현재 상태에서는 **아무도 로그인할 수 없다**.
- `lib/db/client.ts`는 환경변수 누락 시 예외를 던지지만, 이는 **첫 DB 접근 시점의 지연 실패**이며 부팅 시점 fail-fast가 아니다. 어떤 변수가 왜 필요한지도 설명하지 않는다.
- 로그인부터 피드백 저장까지의 흐름을 **재현 가능하게 검증하는 자동화 수단이 없다**. 현재 테스트는 모두 단위/모킹 수준이다.

이 간극이 남아 있는 한, "scaffold가 실제로 동작한다"는 주장은 검증되지 않은 주장이다.

### WHAT — 이번 SPEC 범위

이번 SPEC은 **새 기능 개발이 아니라 런타임 활성화**다. SPEC-SCAFFOLD-001이 확립한 구조와 아키텍처 경계를 그대로 보존하며, 위 5개 간극만 채운다:

- 실제 Turso/libSQL 인스턴스에 대한 연결 확립 + 기존 Drizzle 마이그레이션의 실제 적용 절차
- `evidence` seed 데이터를 실제 DB에 적재하는 재실행 안전(idempotent) 시드 절차
- 초대 전용 테스터 계정의 안전한 프로비저닝 절차(allowlist 등록 + 실제 로그인 가능한 계정 생성, 평문 시크릿 커밋 금지, 셀프 가입 HTTP 경로 미노출)
- 실행 목적별(앱 런타임 부팅 · 마이그레이션/시드 · 프로비저닝 · E2E) 환경변수 fail-fast 검증(누락 변수명 + 필요 이유 명시)
- 로그인 → 사건 입력 → 처리 → 저장 → 리포트 조회 → 피드백 저장 → 타 사용자 격리까지를 단일 명령으로 재현하는 자동화 E2E 스위트(서버 프로세스와 테스트 프로세스가 동일한 실행 시점 시크릿을 공유함이 보장되는 형태)
- 위 절차를 운영자가 따라 할 수 있는 런북 문서

파이프라인 단계의 실제 LLM 로직, 대규모 근거자료 수집, UI 고도화는 이번 SPEC의 범위가 아니다(§4 참고).

## §2. 요구사항 (Requirements — GEARS 표기법)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-RUNTIME-001 | Event-driven | 운영자가 마이그레이션 적용 명령(`pnpm db:migrate`)을 실행하면, 마이그레이션 러너는 `db/migrations/`의 모든 미적용 마이그레이션을 `TURSO_DATABASE_URL`이 가리키는 libSQL 인스턴스에 적용해야 한다. | 사용자 요구사항 MUST-1 |
| REQ-RUNTIME-002 | Event-driven | 운영자가 이미 최신 상태인 DB에 대해 마이그레이션 적용 명령을 재실행하면, 마이그레이션 러너는 중복 적용 없이 성공(exit 0)으로 종료해야 한다. | 재실행 안전성 |
| REQ-RUNTIME-003 | Where(capability gate) | Where `TURSO_DATABASE_URL`이 `file:` 스킴인 경우(로컬/E2E 모드), DB 클라이언트와 마이그레이션 러너는 `TURSO_AUTH_TOKEN` 없이도 연결에 성공해야 한다. | 실측: `lib/db/client.ts`가 두 변수를 모두 필수로 요구해 로컬 파일 DB 사용 불가 |
| REQ-RUNTIME-004 | Event-driven | 운영자가 시드 명령(`pnpm db:seed`)을 실행하면, 시드 러너는 `db/seed/evidence.json`의 모든 레코드를 `evidence` 테이블에 적재해야 한다. | 사용자 요구사항 MUST-2 |
| REQ-RUNTIME-005 | Event-driven | 운영자가 시드 명령을 재실행하면, 시드 러너는 동일 `id` 레코드를 중복 생성하지 않고 `evidence` 테이블의 행 수를 불변으로 유지해야 한다. | 사용자 요구사항 MUST-2 (idempotent) |
| REQ-RUNTIME-006 | Event-driven | 운영자가 테스터 프로비저닝 명령을 대상 이메일과 함께 실행하면, 프로비저닝 스크립트는 해당 이메일을 `allowed_testers` 테이블에 등록해야 한다. | 사용자 요구사항 MUST-3 |
| REQ-RUNTIME-007 | Event-driven | 운영자가 테스터 프로비저닝 명령을 실행하면, 프로비저닝 스크립트는 프로덕션 인증 설정(`lib/auth/config.ts`의 `disableSignUp: true`)을 변경하지 않고, 어떤 HTTP 라우트에도 마운트되지 않은 경로를 통해 실제 로그인 가능한 Better Auth 계정(`user` 행 + credential `account` 행, 해시된 비밀번호)을 생성해야 한다. | 사용자 요구사항 MUST-3, 실측: `lib/auth/config.ts` |
| REQ-RUNTIME-008 | Unwanted | 프로비저닝 스크립트를 포함한 이 SPEC의 어떤 커밋 대상 파일도 실제 비밀번호·API 키·인증 토큰을 평문으로 포함해서는 안 된다. | 사용자 요구사항 MUST-3 (보안 제약) |
| REQ-RUNTIME-009 | Event-driven | 운영자가 이미 프로비저닝된 이메일에 대해 프로비저닝 명령을 재실행하면, 스크립트는 중복 `user`/`account` 행을 생성하지 않아야 한다. | 재실행 안전성 |
| REQ-RUNTIME-010 | When(event-detected) | 각 실행 목적(앱 런타임 부팅 · 마이그레이션/시드 · 테스터 프로비저닝 · E2E)의 진입 시점에 **그 목적이 요구하는** 환경변수의 누락이 감지되면, 환경변수 검증 모듈은 누락된 변수 이름과 그 변수가 필요한 이유를 명시한 오류 메시지와 함께 즉시 실패(fail-fast)해야 한다. 검증은 목적별로 스코프가 나뉘며, 어떤 목적도 그 목적이 실제로 소비하지 않는 변수를 진입 조건으로 요구해서는 안 된다. | 사용자 요구사항 MUST-4 |
| REQ-RUNTIME-011 | Unwanted | 환경변수 검증 오류 메시지는 환경변수의 실제 값(시크릿)을 포함해서는 안 된다. | 보안 제약 |
| REQ-RUNTIME-012 | Ubiquitous | E2E 테스트 스위트는 `allowed_testers`에 등록된 테스터의 로그인 성공과, 미등록 이메일의 로그인 거부를 모두 검증해야 한다. | 사용자 요구사항 MUST-5 (로그인) |
| REQ-RUNTIME-013 | Ubiquitous | E2E 테스트 스위트는 `/cases/new` 사건 입력 → `/api/cases` 처리 → `cases`/`reports` DB 저장 → `/cases/[caseId]` 리포트 조회 흐름을 end-to-end로 검증해야 한다. | 사용자 요구사항 MUST-5 |
| REQ-RUNTIME-014 | Ubiquitous | E2E 테스트 스위트는 사건 상세 화면에서 제출한 전문가 피드백이 `feedback` 테이블에 저장됨을 검증해야 한다. | 사용자 요구사항 MUST-5 (feedback) |
| REQ-RUNTIME-015 | Ubiquitous | E2E 테스트 스위트는 사용자 B가 사용자 A 소유 사건(`/cases/[caseId]`)에 접근할 수 없음을 검증해야 한다. | 사용자 요구사항 MUST-5 (tenant isolation) |
| REQ-RUNTIME-016 | Event-driven | 개발자가 단일 E2E 명령(`pnpm test:e2e`)을 실행하면, 단일 진입점 프로세스가 사람의 수동 조작 없이 시크릿 생성·DB 준비·앱 기동·시나리오 실행·정리까지 자동 수행해야 하며, 검증 대상 앱 서버 프로세스와 E2E 테스트 프로세스가 **동일한 실행 시점 시크릿을 공유함이 보장**되어야 한다(테스트 프레임워크 내부 훅의 실행 순서나 환경 전파 동작에 의존해서는 안 된다). | 사용자 요구사항 MUST-6 (재현 가능성) |
| REQ-RUNTIME-017 | Where(capability gate) | Where E2E 전용 환경 설정이 활성화된 경우, E2E 스위트는 로컬 libSQL 파일 DB를 사용하여 개발자의 실제 Turso 인스턴스를 오염시키지 않아야 한다. | 사용자 요구사항 MUST-6 (재현 가능성) |
| REQ-RUNTIME-018 | Ubiquitous | 이 SPEC의 모든 변경 이후에도 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`는 계속 통과(exit 0)해야 한다. | 사용자 요구사항 MUST-7 |
| REQ-RUNTIME-019 | Unwanted | 이 SPEC은 SPEC-SCAFFOLD-001이 확립한 아키텍처 경계(6단계 mock 파이프라인, `lib/ai/provider.ts` 인터페이스, Drizzle ORM 단일 DB 접근 경로, `lib/validation/` PII 차단 계층)를 리팩토링하거나 대체해서는 안 된다. | 사용자 지시: 기존 구조 유지, 불필요한 리팩토링 금지 |
| REQ-RUNTIME-020 | Ubiquitous | 런북 문서는 연결 → 마이그레이션 → 시드 → 테스터 생성 → E2E 실행까지의 절차를, 실제 시크릿 값 없이 플레이스홀더만으로 재현 가능한 형태로 제공해야 한다. | 사용자 요구사항 MUST-3/MUST-4 운영 절차화 |
| REQ-RUNTIME-021 | Event-driven | 운영자가 Next.js 런타임이 아닌 독립 실행 스크립트(`pnpm db:migrate`, `pnpm db:seed`, `pnpm tester:add`)를 실행하면, 각 스크립트는 **공용 부트스트랩 모듈을 통해 `.env.local`을 명시적으로 로드한 뒤** 자신의 스코프 환경변수 검증을 수행해야 한다. 어떤 독립 실행 스크립트도 프레임워크의 암묵적·자동 환경 로딩에 의존해서는 안 되며, 로딩 동작은 스크립트마다 재구현하지 않고 단일 모듈에 정의되어야 한다. | 개정 v0.3.0: Next.js 자동 `.env.local` 로딩은 `next build`/`start`/`dev`에만 적용되며 `tsx`/`node`로 실행되는 독립 스크립트에는 적용되지 않음 (`research.md` §0.2) |

REQ 개수: 21개 (Tier L 상한 25개 이내).

## §3. 비기능 제약 (Constraints)

- **시크릿 비커밋**: 실제 비밀번호·API 키·토큰은 커밋되는 어떤 파일(`spec.md`, `plan.md`, 스크립트, `.env.local.example`, 런북 문서)에도 평문으로 포함하지 않는다. 예시 파일은 플레이스홀더만 사용한다.
- **아키텍처 보존**: SPEC-SCAFFOLD-001의 계층 경계를 유지한다. 파이프라인 단계는 mock 구현을 유지하고, DB 접근은 Drizzle ORM만 사용하며, Gemini SDK는 `lib/ai/providers/gemini.ts` 밖에서 import하지 않는다.
- **프로비저닝 전용 인증 인스턴스의 비노출**: 프로비저닝 경로가 별도의 Better Auth 인스턴스를 구성하는 경우, 그 인스턴스는 어떤 HTTP 핸들러·라우트에도 마운트되지 않으며 `scripts/` 밖으로 export되지 않는다. 프로덕션 `lib/auth/config.ts`(`disableSignUp: true`)는 변경하지 않는다 — 즉 공개 셀프 가입 표면은 어느 시점에도 생기지 않는다.
- **무료 tier 우선**: Turso/Vercel 무료 tier에서 동작 가능해야 한다(`tech.md` §비용 태도). E2E는 외부 계정 없이 로컬 파일 DB로 재현 가능해야 한다.
- **overengineering 금지**: 별도 vector DB, microservice, 외부 시크릿 관리 서비스를 도입하지 않는다(`product.md` §핵심 원칙 8).
- **패키지 매니저**: pnpm으로 통일한다. Node.js 20.x LTS 이상(`tech.md` §개발 환경 요구사항).
- **버전 고정 유지**: `drizzle-orm` 0.45.x stable, `@libsql/client` stable, `@google/genai` `<3.0.0`, `better-auth` 1.7.1 — 기존 고정을 변경하지 않는다.
- **의존성 추가의 허용 범위 (개정 v0.3.0)**: 이번 SPEC이 추가할 수 있는 것은 **이미 의존성 트리에 존재하는 전이(transitive) 패키지를 직접 devDependency로 명시 선언**하는 경우에 한한다(pnpm strict `node_modules`에서는 전이 의존성이 프로젝트 코드에서 import되지 않으므로, 명시 선언이 없으면 해당 import는 `MODULE_NOT_FOUND`로 실패한다 — `research.md` §0.2 실측). 새로운 런타임 의존성이나 트리에 없던 패키지의 도입은 계속 금지한다. 명시 선언 시 버전은 트리에 이미 설치된 것과 **동일 버전으로 고정**한다.
- **실제 원격 DB 무접근 (개정 v0.3.0)**: 이 SPEC의 어떤 자동 검증(AC)도 **실제로 동작하는 원격 Turso 자격증명**을 사용해서는 안 된다. 우선순위·격리 관련 시험은 비라우팅 sentinel 값으로만 수행한다 — 검증 대상 가정이 틀렸을 때 실제 인스턴스에 도달·기록하는 경로 자체를 제거하기 위함이다(REQ-RUNTIME-017이 막으려는 사고를 검증 절차가 스스로 유발하지 않도록).

## §4. 제외 범위 (Out of Scope)

이번 SPEC의 out of scope 항목은 다음과 같다 — 아래 항목들은 런타임 활성화 범위 밖이며, `product.md` §Roadmap의 후속 SPEC 후보로 이연한다.

### Out of Scope — 파이프라인 LLM 로직 구현
- Researcher/Skeptic/Verifier 등 파이프라인 단계의 실제 LLM 프롬프트 엔지니어링과 소견 생성 로직은 이번 SPEC에서 다루지 않는다. 현행 mock 구현(`lib/pipeline/mock-llm.ts` 및 각 단계 모듈)을 그대로 유지한다.

### Out of Scope — Evidence 대규모 수집
- 실제 판례·약관 등 대규모 근거자료 수집·정제는 이번 SPEC에서 다루지 않는다. `db/seed/evidence.json`의 기존 소규모 데이터셋만 DB에 적재한다.

### Out of Scope — Vector DB 도입
- 임베딩 기반 검색을 위한 별도 vector DB 도입은 이번 SPEC에서 다루지 않는다. evidence 조회는 기존 Drizzle ORM 쿼리 범위를 유지한다.

### Out of Scope — UI/UX 디자인 고도화
- 로그인·사건 입력·리포트 뷰의 폴리시된 UI/UX 디자인은 이번 SPEC에서 다루지 않는다. E2E 검증에 필요한 최소한의 셀렉터 안정성 확보 외에 시각적 개선은 수행하지 않는다.

### Out of Scope — 새로운 담보(coverage) 종류 추가
- 상해후유장해·질병후유장해 외 담보 영역(질병사망, 실손의료비 등) 확장은 이번 SPEC에서 다루지 않는다.

### Out of Scope — Gold Dataset 구조 추가
- 파이프라인 품질 평가를 위한 Gold Dataset 스키마·저장소·평가 하네스 도입은 이번 SPEC에서 다루지 않는다.

## §5. 잔여 위험 (Residual Risks)

- **프로비저닝 경로의 트랜잭션·어댑터 상호작용**: 프로비저닝이 Better Auth의 공식 계정 생성 API를 경유하도록 개정되면서(v0.2.0), `account.issuer`를 포함한 필수 컬럼 집합을 스크립트가 추정할 필요는 사라졌다(라이브러리가 채운다 — `research.md` §0). 남는 위험은 그 API가 내부적으로 어댑터 트랜잭션으로 감싸여 실행된다는 점이며, libSQL/Drizzle 어댑터에서의 실제 동작은 미검증이다 — AC-RUNTIME-007(실제 로그인 성공)이 이 경로를 검증 대상으로 삼는다.
- **프로비저닝 전용 인증 인스턴스의 오용**: 프로비저닝 인스턴스는 셀프 가입이 허용된 설정을 갖는다. 이 인스턴스가 실수로 HTTP 라우트에 마운트되거나 `scripts/` 밖으로 export되면 공개 가입 표면이 열린다 — AC-RUNTIME-017이 이 비노출을 정적으로 검증하며, 스크립트에 `@MX:WARN`을 부착한다.
- **Turso 무료 tier 한도**: 실사용 테스터 10명 규모에서는 충분할 것으로 판단하나, 대시보드에서 실제 한도를 재확인해야 한다.
- **로그인 시도 rate-limiting 미구현**: SPEC-SCAFFOLD-001 §5에서 이연된 잔여 위험이 이번 SPEC에서도 해소되지 않는다. 프로비저닝된 계정이 실제로 로그인 가능해지므로 노출 표면이 커진다 — 프로덕션 하드닝 SPEC에서 우선 검토 대상.
- **E2E 셀렉터 취약성**: UI 고도화가 out of scope이므로 E2E는 현행 마크업에 의존한다. 후속 UI SPEC에서 마크업이 바뀌면 E2E가 깨질 수 있다 — 안정적 셀렉터(`data-testid`) 부착을 최소 범위로 허용한다.
- **`file:` 스킴과 원격 Turso의 동작 차이**: E2E가 로컬 파일 DB에서 통과해도 원격 Turso에서의 네트워크 지연·인증 실패 경로는 검증되지 않는다. 원격 연결은 별도 수동 확인(런북 절차)으로 보완한다.
- **`@next/env` 직접 의존성 선언 필요 (개정 v0.3.0, 착수 전 확정 필요)**: 실측 결과 `@next/env@16.3.2`는 pnpm 가상 스토어(`node_modules/.pnpm/@next+env@16.3.2/`)에만 존재하고 프로젝트 루트 `node_modules/@next/`는 **존재하지 않는다**. 루트/홈 `.npmrc`에 hoisting 설정도 없다(`research.md` §0.2). 따라서 `scripts/`에서의 `import { loadEnvConfig } from "@next/env"`는 현재 상태에서 실패하며, REQ-RUNTIME-021은 **`@next/env`를 `next`와 동일한 16.3.2로 고정해 직접 devDependency로 선언**하는 것을 전제로 한다. 이 선언은 §3의 "의존성 추가의 허용 범위" 안에 있다(트리에 이미 존재하는 전이 의존성의 명시화, 신규 패키지 도입 아님). 선언이 누락되면 세 CLI 스크립트가 모두 기동 불가다.
- **독립 스크립트의 TypeScript 실행 수단 미확정 (개정 v0.3.0)**: `tsx@4.23.12`는 전이 의존성으로 스토어에 존재하나 `node_modules/.bin/tsx`로 링크되어 있지 않아 현재 `tsx scripts/*.ts`를 실행할 수 없다(`research.md` §0.2). 또한 `node --experimental-strip-types`는 Node 22.6+ 기능이라 `tech.md`가 요구하는 Node 20.x LTS 하한에서는 성립하지 않는다. M1에서 실제 Node 버전을 실측해 (a) 타입 스트리핑 직접 실행, (b) `tsx` 직접 devDependency 명시 중 하나로 확정한다 — 어느 쪽이든 REQ-RUNTIME-021의 부트스트랩 경유 구조는 변하지 않는다.
- **sentinel 우선순위 시험의 잔여 위험 (개정 v0.3.0)**: AC-RUNTIME-015는 이제 sentinel 값으로만 우선순위를 시험하므로 실제 인스턴스 오염 위험은 제거됐다. 남는 위험은 **오진**이다 — 우선순위 가정이 틀렸을 경우 증상이 "sentinel 호스트에 대한 연결/DNS 실패"로 나타나는데, 이를 네트워크 일시 장애로 오해하면 근본 원인(우선순위 역전)을 놓친다. AC-RUNTIME-015 Then이 이 실패 양상을 **우선순위 역전의 진단 신호로 해석하라**고 명시해 완화한다.
- **`GEMINI_API_KEY` 부재 상태로의 앱 기동 가능성**: 이번 SPEC의 파이프라인은 mock 구현을 유지하므로(§4 제외 범위) 앱 런타임 스코프는 `GEMINI_API_KEY`를 요구하지 않는다(`design.md` §3.1). 그 결과 실제 Gemini 호출을 활성화하는 후속 SPEC 이전까지는, 키가 없는 상태로 앱이 정상 기동한다 — 후속 SPEC이 실호출을 도입하는 시점에 이 변수를 앱 런타임 스코프의 필수 항목으로 승격해야 하며, 승격이 누락되면 실패 지점이 부팅에서 첫 호출 시점으로 밀린다.
- **`.env.local` 안전 교체·복원의 강제 종료(kill -9) 경로 (개정 v0.4.0)**: AC-RUNTIME-015·AC-RUNTIME-021의 검증은 개발자가 이미 보유했을 수 있는 실제 `.env.local`을 sentinel/테스트 내용으로 임시 교체한다. `design.md` §3.6이 정상 종료·테스트 실패·`SIGINT`/`SIGTERM`·프로세스 `exit` 경로 모두에서 원본을 복원하는 설계를 두지만, **`SIGKILL`(`kill -9`)처럼 인-프로세스 정리 로직 자체를 우회하는 강제 종료**는 이 설계로 닫을 수 없다 — 그 경로에서는 백업이 복원되지 못한 채 sentinel 내용이 `.env.local`에 남을 수 있다. 이는 의도적으로 열어두는 잔여 위험이며, 격리된 워크트리에서 실행하면(`design.md` §3.6) 이 위험 자체가 발생하지 않는다.
- **E2E 동적 포트 탐색과 서버 바인딩 사이의 TOCTOU (v0.5.1 추가 기록)**: `scripts/run-e2e.ts`의 `findFreePort()`(하드코딩된 포트 3000을 동적 탐색으로 교체하며 M5에서 도입 — `progress.md` §E.2/§E.3 M5 항목)는 빈 포트를 찾아 probe 소켓을 닫지만, 실제 서버(`pnpm build && pnpm start`)는 빌드 단계(10초 이상 소요 가능) 이후에야 그 포트를 바인딩한다. 그 사이 구간에 다른 프로세스가 동일 포트를 선점하면 이 SPEC의 코드 정합성과 무관한 `EADDRINUSE`로 플레이키하게 실패할 수 있다 — `get-port` 같은 통용 npm 패키지가 채택하는 것과 동일한 수용된 타이밍 위험이며 결함은 아니다. 침묵하지 않고 명시적으로 기록해 둔다.
- **`.env.local` 백업 파일의 권한(mode) 미고정 (v0.5.1 추가 기록)**: `scripts/env-local-safety.ts`의 `prepareSafeEnvLocal()`(`design.md` §3.6의 백업·복원 메커니즘)은 개발자의 실제 `.env.local` 내용을 임시 디렉터리의 백업 파일에 `writeFileSync`로 쓰되 `{ mode: 0o600 }` 같은 명시적 옵션을 지정하지 않는다. 현재는 `mkdtempSync`가 만드는 디렉터리 자체의 기본 권한(POSIX에서 통상 0700)에 보호를 위임하며, 파일 자체의 mode는 별도로 고정하지 않는다. 개발자의 `.env.local`이 이미 디스크에 보호되지 않은 채 존재한다는 전제에 비해 새로 추가되는 위험은 아니지만, 암묵적으로 남겨두지 않고 운영상 수용 사항으로 명시한다.

## §6. 참고 문서

- `.moai/project/product.md`, `.moai/project/structure.md`, `.moai/project/tech.md`
- `.moai/specs/SPEC-SCAFFOLD-001/{spec,plan,acceptance,design,research}.md` (선행 SPEC, status: completed)
- 이 SPEC의 `research.md` (현행 코드베이스 실측 + 절차 조사), `design.md` (신규 계층 경계 설계)
