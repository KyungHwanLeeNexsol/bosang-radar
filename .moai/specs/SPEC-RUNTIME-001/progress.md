# Progress — SPEC-RUNTIME-001

## §E.1 Plan-phase Audit-Ready Signal

```yaml
plan_complete_at: 2026-08-24
plan_status: audit-ready   # iteration 3 PASS (0.92) + D1(유일 blocking-class) 해소 완료
spec_version: "0.2.0"
tier: L
route: B (PR route — Tier L)
artifacts:
  - spec.md
  - plan.md
  - acceptance.md
  - design.md
  - research.md
  - progress.md
requirements: 20   # REQ-RUNTIME-001 ~ 020 (Tier L ceiling 25)
acceptance_criteria: 20   # AC-RUNTIME-001 ~ 020 (Tier L ceiling 25) — v0.2.0에서 AC-020 신설
spec_id_check: PASS   # Bash ERE regex, verbatim output "PASS"
frontmatter: 12/12 canonical fields present
next_step: plan-auditor 재감사 → (PASS 시) Implementation Kickoff Approval (plan→run human gate)
audit_iterations:
  - iteration: 1
    verdict: FAIL
    score: 0.83          # Tier L threshold 0.85; must-pass 7/7 PASS
    disposition: targeted fixes applied (D1 risk-fallback, D2 e2e env-supply, D3 REQ-010 boot-time, D4-D6 minor)
    report: .moai/reports/plan-audit/SPEC-RUNTIME-001-review-1.md
  - iteration: 2
    verdict: PASS
    score: 0.92          # Tier L threshold 0.85; must-pass 7/7 PASS
    disposition: D1-D5 RESOLVED, D6 partially resolved -> re-flagged D-A (fixed post-audit), D-B stale AC-count (fixed post-audit), D-C review-1 persistence gap (fixed post-audit); D7/D8 UNVERIFIED (no prior content), D-E/D-F optional (not applied — no material impact per auditor)
    report: .moai/reports/plan-audit/SPEC-RUNTIME-001-review-2.md
  - iteration: 3
    verdict: PASS
    score: 0.92          # Tier L threshold 0.85 — v0.2.0 개정 아티팩트에 대한 신규 전체 감사
    disposition: D1 (env-local-precedence-gap, major/blocking-class) FIXED; D2-D6 (minor, citation-precision) 전건 적용; D7 non-actionable 종결
    note: verdict는 이미 확정 — 아래 수정으로 뒤집히지 않음 (blocking-class 해소만 수행)
plan_revisions:
  - version: "0.2.0"
    date: 2026-08-24
    origin: 사용자 설계 검토 (구현 착수 승인 전)
    kind: 구현 접근 방식 개정 — 상태 전이 amendment 아님 (status는 draft 유지)
    changes: 3   # E2E 시크릿 수명주기 / 프로비저닝 계정 생성 경로 / 목적별 env 검증
    scope_changed: false   # spec.md §4 Out of Scope 6개 항목 불변, WHY/WHAT 불변
    ac_bar_lowered: false  # AC-RUNTIME-007 "실제 로그인 성공" 기준 포함, 어떤 AC도 완화하지 않음
    reaudit: pending
```

플랜 단계 산출물이 모두 작성되었고, v0.2.0 개정 아티팩트에 대한 **신규 전체 감사(iteration 3)를 통과했다**(PASS 0.92, Tier L 기준선 0.85). 유일한 blocking-class 지적(D1)이 해소되어 `plan_status`를 `audit-ready`로 전환한다. 미검증 사항은 `research.md` §6에 Gap으로 명시했다.

**감사 1회차 반영(2026-08-24)**: 아래 6건을 targeted fix로 반영했다. 아티팩트 집합·Tier·라우트는 변경되지 않았다.

- **D1** — `plan.md` §E의 최상위 잔여 위험에 폴백 트리거(AC-RUNTIME-007 연속 2회 실패)와 사전 승인 폴백 경로(스크립트 전용 인스턴스 한정 admin 플러그인)를 추가하고, `research.md` §3 경로 B 판정을 `✕` → `△`로 조정했다.
- **D2** — `design.md` §3.4(신규)에 E2E 환경변수 공급 경로를 정의했다. AC-RUNTIME-015 Given 강화, AC-RUNTIME-008 (4)항 추가, AC-RUNTIME-018 런북에 E2E 사전 준비 단계를 추가했다.
- **D3** — REQ-RUNTIME-010의 부팅 시점 요구를 유지하는 방향(a)을 채택했다. `design.md` §6에서 "첫 요청 경계" 후퇴를 제거하고 빌드 단계 스킵으로 한정했으며, `plan.md` §E 해당 위험 행도 같은 방향으로 정렬했다. AC-RUNTIME-009에서 "검증 함수 직접 호출" 선택지를 제거하고, 함수 단위 검증은 신규 AC-RUNTIME-019로 분리했다(AC 18 → 19, Tier L 상한 25 이내).
- **D4** — `design.md` §5 evidence 조회 경로에 `app/cases/[caseId]/page.tsx`를 추가(실측 확인).
- **D5** — `spec.md` §1 WHY 항목을 "후속 SPEC의 전제 미비"로 재서술(이번 주기에는 관측 가능한 동작 변화가 없음을 명시).
- **D6** — `.gitignore` 관련 주장을 실측에 맞게 완화. `git check-ignore -v .tmp/e2e.db`가 `.gitignore:108:*.tmp`로 이미 덮고 있음을 확인해 `research.md` §0에 증거로 기록했다.

**감사 2회차(2026-08-24)**: 검증 PASS(0.92점, Tier L 기준선 0.85 초과). D1~D5는 실물 재검증으로 RESOLVED 확인. D6은 `plan.md`/`acceptance.md`는 완화됐으나 `research.md` §4가 미반영이라 §0과 자기모순 상태였음(재등재: D-A) — 오케스트레이터가 즉시 반영 완료. 추가로 자기기술 수치 드리프트 1건(D-B, `plan.md`의 "AC 18"이 D3로 늘어난 실제 19개를 반영 못함) 발견 — 즉시 반영 완료. 1회차 리뷰 보고서가 `.moai/reports/plan-audit/`에 영속화되지 않았던 gap(D-C)도 오케스트레이터가 review-1.md를 소급 작성하고 본 review-2.md와 함께 저장해 복구했다. D7/D8(1회차 optional, 내용 미기록)은 UNVERIFIED로 남았으나 optional 등급이라 verdict에 영향 없음. D-E(REQ-010 GEARS 라벨 표기)·D-F(Tier 판정 파일 열거의 `.gitignore` 조건부 표기)는 auditor 권고에 따라 미적용(과형식화 방지, 실질 영향 없음).

**사용자 요청 플랜 개정 v0.2.0 (2026-08-24)**: 위 감사 2회차 PASS(0.92) 이후, 사용자가 설계를 검토하고 **구현 접근 방식 3건**의 변경을 요청했다. 이는 감사 지적사항 반영(위 1·2회차 노트)과는 성격이 다른 **사용자 주도 개정**이며, 구현 착수 승인(Implementation Kickoff Approval) 이전에 적용했다. `status`는 `draft`로 유지되므로 `completed → in-progress` 상태 전이 amendment 절차(`amendment_of` 필드, HISTORY `## Amendments` 하위 절)는 해당하지 않는다.

- **개정 1 — E2E 시크릿 수명주기**: `e2e/global-setup.ts`가 시크릿을 생성하고 그 값이 Playwright `webServer`가 띄우는 Next.js 프로세스까지 환경 상속으로 전달된다는 **라이프사이클 가정**을 제거했다. `scripts/run-e2e.ts` 단일 진입점이 시크릿 생성 → 환경 조립 → DB 준비 → Playwright spawn을 모두 소유하며, 서버 프로세스와 테스트 프로세스는 **같은 조상 프로세스의 환경을 상속**하므로 일치가 구조적으로 보장된다. `e2e/global-setup.ts`는 아티팩트 목록에서 제거됐다. 반영: `design.md` §3.3/§3.4, `plan.md` M5, `research.md` §4, AC-RUNTIME-008 (4)·015·018.
- **개정 2 — 테스터 계정 생성 경로**: `better-auth/crypto`의 내부 해시 API + `user`/`account` 직접 INSERT(경로 C)를, **프로비저닝 전용 `betterAuth` 인스턴스의 공식 `auth.api.signUpEmail` 호출**(신규 경로 D)로 교체했다. 인스턴스는 프로덕션과 동일한 Drizzle 어댑터를 재사용하되 자신의 옵션만 갖고, 어떤 HTTP 라우트에도 마운트되지 않는다 — 프로덕션 `lib/auth/config.ts`의 `disableSignUp: true`는 불변이다. 기술적 성립 여부는 설치된 `better-auth@1.7.1` 소스 직접 읽기로 확인했다(`research.md` §0.1). 폴백 트리거를 "AC-RUNTIME-007 연속 2회 실패"(런타임 실패 신호)에서 **"`signUpEmail` 호출이 기술적으로 불가능함이 확인된 경우"**(실현 가능성 판정)로 교체했다. 반영: `research.md` §3(경로 D 신설, 순위 D→B→C), `plan.md` M2/§E, `design.md` §3.2.1, AC-RUNTIME-007·017 (4).
- **개정 3 — 목적별 env 검증**: 단일 평면 필수 집합을 `db`/`provision`/`app`/`e2e` **스코프별 요구 집합**으로 분리하고, `GEMINI_API_KEY`를 `app` 스코프 요구 항목에서 제외했다(파이프라인이 mock이므로 소비 지점 없음 — 실호출을 도입하는 후속 SPEC이 승격해야 한다는 전방 설계 노트를 남겼다). REQ-RUNTIME-010의 fail-fast 요구는 완화되지 않았다 — 바뀐 것은 "무엇이 부팅인가"와 "어떤 변수가 어떤 목적을 막는가"다. 반영: `spec.md` REQ-RUNTIME-010, `design.md` §2/§3.1, `plan.md` M1/M6, `research.md` §5, AC-RUNTIME-009·018·019 + **AC-RUNTIME-020 신설**.

**개정이 하지 않은 것**: `spec.md` §4 Out of Scope 6개 항목 불변, WHY/WHAT 불변, Tier L·Route B 불변, 아티팩트 집합 불변(5 + progress.md). **어떤 AC의 판정 기준도 낮추지 않았다** — AC-RUNTIME-007은 "행이 생성됨"이 아닌 "실제 로그인 성공"을 그대로 유지한다. REQ 20개 불변, AC 19 → 20.

**감사 3회차 — v0.2.0 개정 아티팩트 신규 전체 감사 (2026-08-24)**: 위 개정 3건 반영 후 plan-auditor 재감사를 실시해 **PASS(0.92, Tier L 기준선 0.85)**를 받았다. verdict는 이 시점에 확정됐으며, 아래 수정은 감사가 권고한 결함 해소일 뿐 verdict를 되돌리지 않는다.

- **D1 — `env-local-precedence-gap` (major, blocking-class) → 해소**. 기존 설계는 E2E 환경변수 공급원을 둘(진입점 상속 / `webServer.env` 재기재—금지)로만 상정했으나, 감사가 **세 번째 공급원**을 지적했다: `webServer`가 띄우는 Next.js 서버가 `.env.local`을 디스크에서 **독립적으로** 로드한다. 이 SPEC 자신의 런북(`research.md` §2)이 `.env.local.example`을 `.env.local`로 복사해 **실제 원격 Turso 자격증명**을 기입하도록 지시하므로(`.env.local.example`의 `libsql://<database-name>-<org>.turso.io` 플레이스홀더 실측 확인), 런북을 따른 개발자의 정상 상태에서 상속된 `file:./.tmp/e2e.db`와 디스크의 원격 URL이 **동시에 존재**한다. AC-RUNTIME-015가 REQ-RUNTIME-017(실제 Turso 무접근)의 **유일한** 검증 지점인데, 그 현실적 상태에서는 검증이 재현·보장되지 않았다. 반영 3건: (a) `research.md` §6에 Gap 신설, (b) AC-RUNTIME-015에 현실적 상태 Given(원격 자격증명이 담긴 `.env.local` 존재) + `.env.local` 무관 불변식 Then 추가, (c) `design.md` §3.4에 "세 번째 공급원" 절 신설 + §6에 구현 확정 항목 추가.
  - **조사 중 추가 발견(감사 지적 강화)**: 설치된 패키지 동봉 Next.js 문서가 조회 순서를 `process.env` → `.env.$(NODE_ENV).local` → `.env.local` → … 로 명시하고 "*stopping once the variable is found*"이라고 기술함을 확인했다(`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` §Environment Variable Load Order, 266-276행) — **문서상으로는 상속된 값이 이긴다**. 다만 실제 로더(`loadEnvConfig`)는 번들·미니파이된 `next/dist/compiled/next-server/server.runtime.prod.js` 안에 있어 소스 확인이 불가했고 실행 관측도 하지 않았다. 따라서 **문서 근거는 확보하되 관측으로 승격하지 않았고**, 구체적 보장 메커니즘의 확정은 run-phase M5로 명시 이관했다(verification-claim-integrity: 문서는 근거이지 관측이 아니다).
- **D2 (minor) → 적용**. "기본 최소 8자"의 귀속처를 정정. `sign-up.mjs:154-159`는 검증만 수행하고 기본값은 `create-context.mjs:185`(`minPasswordLength: options.emailAndPassword?.minPasswordLength || 8`)에 있음을 실측 확인해 두 인용을 병기했다.
- **D3 (minor) → 적용**. `autoSignIn:false` 인용 범위 `sign-up.mjs:262-265` → **`260-266`** 정정(실측: 260-263 조기 반환, 264-266 `createSession`/`setSessionCookie`). §0.1 표 + §3 채택 근거 4항 2곳 반영.
- **D4 (minor) → 적용**. 중복 이메일 인용 범위 `199-211` → **`200-213`**, 오류 상수 `USER_ALREADY_EXISTS` → **`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`** 정정(실측: throw는 212행). §0.1 표 + §3 재실행 안전성 2곳 반영.
- **D5 (minor) → 적용**. `design.md` §3.2.1에 generic 중복 응답이 열거 공격 방어 목적의 **합성(non-DB) user id**를 실을 수 있으므로 프로비저닝 스크립트가 그 경로의 반환 id를 신뢰하지 않는다는 문장 추가(실측 근거: `sign-up.mjs:169` `generateId()` 합성 경로).
- **D6 (minor) → 적용**. AC-RUNTIME-017의 `**Traces**` 헤더에 `REQ-RUNTIME-007 (항목 4)` 추가 — §C 추적 매트릭스가 이미 AC-017을 REQ-007의 추적 AC로 인정하고 있었으므로 양방향 일치 복구.
- **D7 — 의도적 종결(non-actionable), gap 아님**. REQ-RUNTIME-010의 GEARS 타입 라벨(`When(event-detected)`) 표기 건은 **3개 반복에 걸쳐 3회 지적됐고 매번 auditor 자신이 미적용을 권고**했다 — 요구사항 본문 산문이 이미 표준 Event-driven 형태이고 차이는 타입 라벨 문자열뿐이라 실질 영향이 없기 때문이다. 이번에도 미적용하며, `spec.md`는 손대지 않았다. 반복 재등재를 막기 위해 **종결(closed)** 로 기록한다.

**개정 범위 불변 확인**: `spec.md` 무수정(WHY/WHAT/§4 Out of Scope 포함). REQ 20개 / AC 20개 유지. Tier L·Route B·아티팩트 집합 불변. 어떤 AC의 판정 기준도 낮추지 않았다 — D1은 AC-RUNTIME-015를 **강화**(현실적 Given 추가)했다.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
