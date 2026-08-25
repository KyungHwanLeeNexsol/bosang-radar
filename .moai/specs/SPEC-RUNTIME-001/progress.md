# Progress — SPEC-RUNTIME-001

## §E.1 Plan-phase Audit-Ready Signal

```yaml
plan_complete_at: 2026-08-24
plan_status: audit-ready   # /moai run Phase 1 게이트 — 6차 감사 PASS(0.97) 확정 (D4 qualifier 문장 반영 후 재감사) — Implementation Kickoff Approval 대기
spec_version: "0.4.0"
tier: L
route: B (PR route — Tier L)
artifacts:
  - spec.md
  - plan.md
  - acceptance.md
  - design.md
  - research.md
  - progress.md
requirements: 21   # REQ-RUNTIME-001 ~ 021 (Tier L ceiling 25) — v0.3.0에서 REQ-021 신설
acceptance_criteria: 22   # AC-RUNTIME-001 ~ 022 (Tier L ceiling 25) — v0.3.0에서 AC-021/022 신설
spec_id_check: PASS   # Bash ERE regex, verbatim output "PASS" (v0.3.0 재실행 확인)
frontmatter: 12/12 canonical fields present
next_step: Implementation Kickoff Approval (plan→run human gate) — 5차 감사 PASS(0.97) 확정, 추가 감사 불필요
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
  - iteration: 4
    verdict: PASS
    score: 0.97          # Tier L threshold 0.85; must-pass 7/7 PASS — v0.3.0 아티팩트에 대한 신규 전체 감사
    disposition: v0.3.0 개정 3건(REQ-RUNTIME-021 CLI env bootstrap / AC-RUNTIME-015 sentinel 교체 / AC-RUNTIME-022 신설-과잉주장 제거) 전건 완전 반영 확인. D1(REQ-021 3개 규범문 번들, non-blocking) / D2(phase 프론트매터 "v0.2.0 target" 드리프트, label drift·schema 위반 아님) 2건 non-blocking finding
    report: .moai/reports/plan-audit/SPEC-RUNTIME-001-review-4.md
  - iteration: 5
    verdict: PASS
    score: 0.97          # Tier L threshold 0.85; must-pass 7/7 PASS — v0.4.0 아티팩트에 대한 신규 전체 감사
    disposition: v0.4.0 개정 3건(AC-RUNTIME-022 검증 범위 조정 / .env.local 안전 교체-복원 설계 신설 / 잔존 문서 오류 3건 정리) 전건 검증 완료. AC-RUNTIME-022의 좁혀진 범위가 REQ-RUNTIME-016 커버리지 갭을 만들지 않음(AC-022 + AC-RUNTIME-015 (3)항이 함께 여전히 완전히 충족)을 확인했고, .env.local 안전장치(design.md §3.6)가 AC-RUNTIME-015·AC-RUNTIME-021 Given에 정확히 배선되었으며, kill-9 잔여 위험이 4곳 모두에서 일관되게 정직히 명시됨을 확인했다. 전체 6개 아티팩트에서 잔존 `e2e/global-setup.ts` 현재 시제 참조 0건(정당한 과거 시제·존재 확인 항목만 남음). D1(carried, REQ-021 3개 규범문 번들, non-actionable) / D3(carried, closed — REQ-010 GEARS 라벨, 재확인 종결) 유지. D4(신규, minor) — acceptance.md AC-022 역할 분담 서술의 "AC-022+AC-015 함께 완전히 충족한다" 요약이 러너→서버 구간의 값 수준 동일성(OS 상속 + 정적 검증에 근거한 추론이지 직접 관측이 아님)에 비해 아주 약간 강하게 읽힘 — non-blocking. D4 대응으로 acceptance.md AC-022 역할 분담 문단에 한 문장 qualifier 추가(오케스트레이터 반영, 재감사 불필요)
    report: .moai/reports/plan-audit/SPEC-RUNTIME-001-review-5.md
  - iteration: 6
    verdict: PASS
    score: 0.97          # Tier L threshold 0.85; must-pass 7/7 PASS(1건 N/A) — /moai run Phase 1 Plan Audit Gate 정식 호출
    disposition: 5차 감사 이후 acceptance.md AC-RUNTIME-022 역할 분담 문단에 추가된 D4 qualifier 한 문장으로 플랜 아티팩트 해시가 변경되어 캐시 재사용 불가 — 신규 전체 감사 실시. 필수 통과 기준 7개 전항목 PASS(1건 N/A). 변경된 그 한 문장이 design.md·research.md와 일관되며 새 결함을 만들지 않음을 확인. D1(carried, non-actionable)·D3(carried, closed) 유지, D4 RESOLVED 확인. SPEC은 구현 착수 승인 준비 완료.
    report: .moai/reports/plan-audit/SPEC-RUNTIME-001-review-6.md
plan_revisions:
  - version: "0.5.0"
    date: 2026-08-25
    origin: run-phase M2 진행 중 발견된 SPEC-SCAFFOLD-001 스키마/마이그레이션 드리프트 보정 (사용자 승인)
    kind: 선행 SPEC 결함 보정 — 이 SPEC 자신의 설계 결정 아님 — 상태 전이 amendment 아님 (status는 in-progress 유지, D-NEW-1 inline-fix 재-delegation)
    changes: 1   # AC-RUNTIME-017 (3)항 + §B DoD 대응 항목에 보정 마이그레이션 1건 예외 허용 문구 추가
    scope_changed: false   # spec.md §4 Out of Scope 6개 항목 불변, WHY/WHAT 불변
    ac_bar_lowered: false  # 예외는 SPEC-SCAFFOLD-001 결함을 보정하는 정확히 1건의 마이그레이션에만 좁게 적용됨
    req_delta: "21 → 21 (변경 없음)"
    ac_delta: "22 → 22 (no new AC, AC-RUNTIME-017 (3) wording narrowed with a scoped exception)"
    reaudit: pending
  - version: "0.4.0"
    date: 2026-08-25
    origin: 사용자 요청 최종 정합성 점검 (구현 착수 승인 전)
    kind: 검증 범위 조정 + 안전장치 설계 추가 + 문서 정합성 정리 — 상태 전이 amendment 아님 (status는 draft 유지)
    changes: 3   # AC-RUNTIME-022 토폴로지 범위 조정 / .env.local 안전 교체-복원 설계 신설 / 잔존 문서 오류 3건 정리
    scope_changed: false   # spec.md §4 Out of Scope 6개 항목 불변, WHY/WHAT 불변
    ac_bar_lowered: false  # AC-022는 관측 가능한 경계로 범위를 좁혔을 뿐 REQ-RUNTIME-016 커버리지는 AC-015와 합쳐 불변, 나머지는 순수 추가/정정
    req_delta: "21 → 21 (변경 없음)"
    ac_delta: "22 → 22 (변경 없음 — AC-RUNTIME-022 서술 범위만 조정)"
    reaudit: complete (PASS 0.97, review-5)
  - version: "0.3.0"
    date: 2026-08-24
    origin: 사용자 설계 검토 3차 (구현 착수 승인 전)
    kind: 구현 접근 방식 + 검증 설계 개정 — 상태 전이 amendment 아님 (status는 draft 유지)
    changes: 3   # 독립 CLI 명시적 env 로드 / 우선순위 시험 sentinel 교체 / 시크릿 동일성 과잉주장 제거
    scope_changed: false   # spec.md §4 Out of Scope 6개 항목 불변, WHY/WHAT 불변
    ac_bar_lowered: false  # 2건 강화(AC-021 신설, AC-015 Given 안전화) + 1건 과잉주장 제거(AC-022로 직접 관측 승격)
    req_delta: "20 → 21 (REQ-021 신설)"
    ac_delta: "20 → 22 (AC-021/022 신설)"
    blocking_finding: "@next/env가 pnpm strict 레이아웃에서 import 불가 — M1-a 직접 devDependency 선언이 선행 조건 (research.md §0.2)"
    reaudit: complete (PASS 0.97, review-4)
  - version: "0.2.0"
    date: 2026-08-24
    origin: 사용자 설계 검토 (구현 착수 승인 전)
    kind: 구현 접근 방식 개정 — 상태 전이 amendment 아님 (status는 draft 유지)
    changes: 3   # E2E 시크릿 수명주기 / 프로비저닝 계정 생성 경로 / 목적별 env 검증
    scope_changed: false   # spec.md §4 Out of Scope 6개 항목 불변, WHY/WHAT 불변
    ac_bar_lowered: false  # AC-RUNTIME-007 "실제 로그인 성공" 기준 포함, 어떤 AC도 완화하지 않음
    reaudit: pending
```

**v0.3.0 개정 직후 시점(4차 감사 이전)에는 다음과 같았다**: 플랜 단계 산출물이 모두 작성되어 있었고, v0.2.0 아티팩트는 감사 3회차를 통과한 상태였다(PASS 0.92, Tier L 기준선 0.85). 그러나 그 이후 사용자 개정 v0.3.0(아래 4차 개정 노트)이 적용되었으므로, 당시 아티팩트 집합은 아직 감사받지 않은 상태였다. 따라서 당시 `plan_status`는 `audit-ready`가 아니라 **`revision-applied (pending re-audit)`** 이었다 — v0.2.0에 대한 PASS는 v0.3.0 아티팩트의 통과 근거가 되지 못했다(변경된 문서에 대해 얻은 적 없는 판정을 주장하지 않는다는 원칙). **이후 감사 4회차가 PASS(0.97)를 확정했으며(아래 "감사 4회차" 절 참고), 그다음 사용자 개정 v0.4.0이 다시 적용되어 §E.1 상단 YAML의 `plan_status`는 한때 다시 `revision-applied (pending re-audit)`로 돌아갔었다** — 이는 이 문단이 기술하는 v0.3.0 시점의 상태와 우연히 같은 값이었지만, 근거는 서로 다른 개정(v0.3.0 vs v0.4.0)이었다. **이후 감사 5회차가 v0.4.0 아티팩트를 대상으로 PASS(0.97)를 확정하면서(아래 "감사 5회차" 절 참고) `plan_status`는 다시 `audit-ready`로 올라와 현재에 이른다.** 미검증 사항은 `research.md` §6에 Gap으로 명시했다.

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

**사용자 요청 플랜 개정 v0.3.0 — 3차 설계 검토 (2026-08-24)**: 감사 3회차 PASS(0.92) 이후, 사용자가 설계를 다시 검토해 **구현 접근 방식·검증 설계 3건**의 변경을 요청했다. v0.2.0 개정과 마찬가지로 **사용자 주도 개정**이며 구현 착수 승인(Implementation Kickoff Approval) 이전에 적용했다. `status`는 `draft`로 유지되므로 상태 전이 amendment 절차(`amendment_of` 필드, HISTORY `## Amendments` 하위 절)는 해당하지 않는다.

- **개정 1 — 독립 실행 CLI의 명시적 `.env.local` 로드 (REQ-RUNTIME-021 / AC-RUNTIME-021 신설)**: `db:migrate`·`db:seed`·`tester:add`는 Next.js 런타임이 아니라 `tsx`/`node`로 실행되는 **독립 프로세스**이므로, Next.js의 자동 `.env.local` 로딩(= `next build`/`start`/`dev` 경로의 동작)이 적용되지 않는다. v0.2.0까지의 설계는 이 점을 다루지 않아 "프레임워크가 해줄 것"이라는 **암묵적 가정**이 남아 있었다. `scripts/cli-bootstrap.ts` 공용 모듈을 신설해 `@next/env`의 `loadEnvConfig`로 **명시적 로드 → 스코프 검증** 순서를 고정하고, 4개 스크립트가 이 모듈 하나만 경유하도록 했다. 반영: `spec.md` REQ-021·§3·§5, `design.md` §1 원칙 5·§2·§3.2/§3.2.2·§6, `plan.md` §A.3·M1(a/b/c 분해)·M2/M3/M4·M6·§D·§E·§F·§G, `research.md` §0.2·§5, **AC-RUNTIME-021 신설**.
- **개정 2 — 우선순위 시험의 sentinel 교체 (AC-RUNTIME-015)**: v0.2.0의 D1 수정은 AC-RUNTIME-015 Given에 "**실제 원격 Turso 자격증명**이 담긴 `.env.local`"을 요구했다. 사용자가 이 수정 자체를 위험으로 지적했다 — 이 시험이 검증하려는 명제가 "상속된 값이 `.env.local`을 이긴다"인데, **그 명제가 거짓이면 시험이 실제 프로덕션 인스턴스에 연결·기록한다**. 즉 검증 절차가 REQ-RUNTIME-017이 막으려는 사고를 스스로 유발하는 구조였다. `libsql://sentinel-nonexistent-host.invalid` + 더미 토큰으로 교체했다(`.invalid`는 RFC 2606 §2 예약 + RFC 6761 §6.4가 즉시 부정 응답을 규정 — 실패가 규격상 보장). **검증 대상 성질은 축소되지 않았다**: 우선순위는 그대로 시험되며, 달라진 것은 가정이 깨졌을 때 "실제 DB 오염" → "안전한 연결 실패(= 진단 신호)"라는 결과뿐이다. 반영: `spec.md` §3·§5, `design.md` §3.4(sentinel 절 신설)·§6, `plan.md` M5·§D·§E, `research.md` §0.2 결론 3, AC-RUNTIME-015 Given/Then + 양방향 판정.
- **개정 3 — 시크릿 동일성 과잉주장 제거 (AC-RUNTIME-022 신설)**: v0.2.0 AC-RUNTIME-015 (3)항은 "로그인 시나리오가 통과한다는 사실 자체가 서버·테스트 프로세스의 시크릿 일치를 **입증한다**"고 기술했다. 이는 논리적 과잉이다 — 로그인 성공은 **인증 흐름이 동작한다**는 증거이지 특정 환경변수 **값의 동일성**에 대한 직접 증거가 아니고, "불일치했다면 실패했을 것"이라는 역추론은 로그인을 성공시킬 다른 경로(세션 쿠키 재사용, 캐시된 세션, 재시도)가 모두 배제되었을 때만 성립하는데 이 SPEC은 그 배제를 확보하지 않았다. 근본 문제는 **관측 지점과 주장 지점의 불일치**였다. 검증을 두 층으로 분리했다 — **구조적**(AC-RUNTIME-022: `run-e2e.ts`가 각 자식 프로세스 생성 호출에 전달한 env 객체를 단위 테스트에서 **직접 단언**, Playwright 불필요) + **기능적**(AC-RUNTIME-015 (3): 인증 흐름의 동작만 주장). 반영: `design.md` §1 원칙 6·§3.5 신설·§6, `plan.md` M5·§D·§G, `research.md` §0.2 결론 4, AC-RUNTIME-015 (3)항 재서술 + **AC-RUNTIME-022 신설**.

**실측으로 확인한 blocking-class 발견 (개정 1의 전제)**: `@next/env@16.3.2`는 `loadEnvConfig`를 기대한 시그니처로 export하나(`dist/index.d.ts` 실측), **pnpm strict `node_modules` 레이아웃에서 프로젝트 코드가 import할 수 없는 상태**다 — 루트 `node_modules/@next/` **부재**, 루트/홈 `.npmrc`에 hoisting 설정 **부재**(`research.md` §0.2). 따라서 M1-a의 `pnpm add -D @next/env@16.3.2`(`next`와 동일 버전 고정)가 **M2/M3/M4 전체의 선행 조건**이며, 이를 건너뛰면 세 CLI가 모두 `MODULE_NOT_FOUND`로 기동 불가 상태로 "완성"된다. 부수 발견 2건: (a) `tsx`가 `node_modules/.bin/`에 없어 4개 독립 스크립트의 TS 실행 수단이 미확정(M1-a에서 `node --version` 실측 후 확정), (b) `@next/env`의 `processEnv` 소스를 직접 읽어 **상속된 `process.env`가 `.env.local`을 이김을 확인** — `research.md` §6의 D1 Gap 근거 등급이 **문서 → 소스**로 승격됐다(단 실행 관측은 아니므로 M5 실측 의무는 유지).

**개정 범위 불변 확인**: `spec.md` §4 Out of Scope 6개 항목 불변, WHY/WHAT 불변, Tier L·Route B 불변, 아티팩트 집합 불변(5 + progress.md). REQ 20 → 21, AC 20 → 22 (Tier L 상한 25/25 이내). **어떤 AC의 판정 기준도 낮추지 않았다** — AC-RUNTIME-007의 "실제 로그인 성공" 기준 불변이며, 개정 3은 AC-015에서 **증명되지 않던 주장을 제거하고 그 성질을 직접 관측하는 AC로 승격**한 것이므로 검증 범위는 넓어졌다.

**감사 4회차 — v0.3.0 개정 아티팩트 신규 전체 감사 (2026-08-25)**: 위 개정 3건(REQ-RUNTIME-021 신설, AC-RUNTIME-015 sentinel 교체, AC-RUNTIME-022 신설) 반영 후 plan-auditor 재감사를 실시해 **PASS(0.97, Tier L 기준선 0.85)**를 받았다. 필수 통과 기준 7개 전항목 PASS(REQ 일관성·GEARS 형식·프론트매터·D7 교차SPEC·D8 크로스플랫폼·명확화 게이트). progress.md 자기기술 수치(REQ 21개·AC 22개)도 spec.md/acceptance.md 실측과 교차 검증해 일치를 확인했다. 개정 3건 모두 5개 아티팩트 전체에 걸쳐 정확·완전 반영됨을 확인했다.

- **D1(minor, 비차단)** — REQ-RUNTIME-021 하나에 정규 진술 3건이 묶여 있음(원자성 위반은 아님, 참고만).
- **D2(minor, 비차단) → 적용** — 프론트매터 `phase: "v0.2.0 target"`이 `version: "0.3.0"`과 라벨 드리프트 상태였다(스키마 위반은 아님). `"v0.3.0 target"`으로 정정하고 `updated`를 갱신했다.
- **D3(cosmetic, 기종결)** — REQ-RUNTIME-010 GEARS 라벨 건은 3·4회차 모두 재확인 후 종결 유지, 재오픈 없음.

보고서: `.moai/reports/plan-audit/SPEC-RUNTIME-001-review-4.md`.

**사용자 요청 플랜 개정 v0.4.0 — 최종 정합성 점검 (2026-08-25)**: 감사 4회차 PASS(0.97) 확인 이후, 사용자가 구현 착수 승인 직전 최종 검토를 요청해 **검증 범위 조정 1건 + 신규 안전장치 설계 1건 + 문서 정합성 정리 3건**을 반영했다. v0.2.0/v0.3.0과 마찬가지로 **사용자 주도 개정**이며 구현 착수 승인(Implementation Kickoff Approval) 이전에 적용했다. `status`는 `draft`로 유지되므로 상태 전이 amendment 절차(`amendment_of` 필드, HISTORY `## Amendments` 하위 절)는 해당하지 않는다.

- **개정 1 — AC-RUNTIME-022 검증 범위를 실제 관측 가능한 경계로 조정**: 기존 AC-RUNTIME-022 Then은 "Playwright 러너 프로세스"와 "앱 서버(Next.js) 프로세스" **양쪽** 모두에 전달된 env를 직접 관측한다고 서술했다. 그러나 `design.md` §3.4/§3.5가 확정한 프로세스 계보(`run-e2e.ts` → Playwright 러너 → Next.js 서버)상 `run-e2e.ts`가 직접 spawn하는 자식은 Playwright 러너 하나뿐이며, Next.js 서버는 Playwright 자신의 `webServer` 훅이 내부적으로 spawn하므로 `run-e2e.ts`의 주입 가능한 spawn 지점으로는 가로챌 수 없다 — 즉 AC의 Then이 자신의 Given/When 메커니즘이 만들어낼 수 없는 관측을 주장하고 있었다. AC-RUNTIME-022의 관측 범위를 "진입점 → Playwright 러너" 구간으로 좁히고, `playwright.config.ts`의 `webServer.env`가 네 키를 재선언하지 않는지에 대한 정적 검증을 추가했다. 앱 서버까지의 실제 전파와 인증 흐름 동작은 AC-RUNTIME-015의 실제 Playwright 실행이 기능적으로 검증한다는 점을 명시했다. **검증 범위는 축소되지 않는다** — REQ-RUNTIME-016의 "동일 시크릿 공유 보장" 요구는 AC-022(구조적, 진입점→러너)와 AC-015(기능적, 전체 흐름)가 함께 여전히 완전히 커버한다. 반영: `acceptance.md` AC-RUNTIME-022·§B·§C·§D, `design.md` §3.5, `plan.md` M5.
- **개정 2 — `.env.local` 안전 교체·복원 설계 신설**: AC-RUNTIME-015·AC-RUNTIME-021의 Given은 디스크의 `.env.local`이 특정 sentinel/테스트 내용을 담고 있을 것을 요구하는데, 개발자의 머신에는 이미 실제 자격증명이 담긴 `.env.local`이 존재할 수 있다. 이를 덮어쓴 뒤 복원하지 않으면 검증 절차 자체가 개발자의 작업 상태를 파괴하는 사고가 된다. `design.md` §3.6을 신설해 (a) 기본 메커니즘 — 백업(트리 밖) → sentinel/테스트 값 기입 → 정상/실패/`SIGINT`/`SIGTERM`/`exit` 전 경로에서 복원, (b) 우선 메커니즘 — 격리된 워크트리에서 실행 중이면 물리적으로 다른 파일이므로 백업·복원 자체가 불필요, 둘을 정의했다. **잔여 위험을 정직하게 명시** — `kill -9`(`SIGKILL`)처럼 인-프로세스 정리를 우회하는 강제 종료는 이 설계로 닫을 수 없다(`design.md` §3.6, `acceptance.md` §D, `spec.md` §5, `research.md` §6). 반영: `design.md` §3.6(신규), `acceptance.md` AC-RUNTIME-015 Given·AC-RUNTIME-021 Given·§B·§D, `research.md` §5·§6, `spec.md` §5, `plan.md` M5.
- **개정 3 — 잔존 문서 오류 3건 정리**: (a) `plan.md` §A.1의 "REQ 20 / AC 20" 잔존 표기를 실제 REQ 21 / AC 22로 정정, (b) `acceptance.md` AC-RUNTIME-011 Given의 "E2E 글로벌 셋업"(v0.2.0에서 이미 폐기된 `e2e/global-setup.ts` 개념) 잔존 표현을 `scripts/run-e2e.ts` 진입점 모델로 재서술, (c) 이 §E.1의 v0.3.0 직후 스냅샷 문단이 현재 시제로 읽혀 이미 확정된 감사 4회차 결과와 모순돼 보이던 것을 과거 시점 스냅샷임을 명시하는 서술로 재구성(내용 삭제 없음, 프레이밍만 조정).

**개정 범위 불변 확인**: `spec.md` §4 Out of Scope 6개 항목 불변, WHY/WHAT 불변, Tier L·Route B 불변, 아티팩트 집합 불변(5 + progress.md). REQ 21 / AC 22 **변경 없음**(개정 1은 AC-RUNTIME-022 서술 범위 조정일 뿐 AC 개수·다른 AC의 판정 기준을 낮추지 않는다). REQ-RUNTIME-016의 커버리지는 AC-RUNTIME-022(구조적, 좁혀진 범위) + AC-RUNTIME-015(기능적, 전체 흐름)가 여전히 함께 완전히 충족한다.

**감사 5회차 — v0.4.0 개정 아티팩트 신규 전체 감사 (2026-08-25)**: 위 개정 3건(AC-RUNTIME-022 검증 범위 조정, `.env.local` 안전 교체·복원 설계 신설, 잔존 문서 오류 3건 정리) 반영 후 plan-auditor 재감사를 실시해 **PASS(0.97, Tier L 기준선 0.85)**를 받았다. 필수 통과 기준 7개 전항목 PASS. AC-RUNTIME-022의 좁혀진 범위가 REQ-RUNTIME-016 커버리지 갭을 만들지 않음(AC-022 + AC-RUNTIME-015 (3)항이 함께 여전히 완전히 충족)을 확인했고, `.env.local` 안전장치(`design.md` §3.6)가 AC-RUNTIME-015·AC-RUNTIME-021 Given에 정확히 배선되었으며, kill-9 잔여 위험이 4곳 모두에서 일관되게 정직히 명시됨을 확인했다. 전체 아티팩트에서 잔존 `e2e/global-setup.ts` 현재 시제 참조는 0건이었다(정당한 과거 시제·존재 확인 항목만 남음).

- **D1(minor, non-blocking, carried)** — REQ-RUNTIME-021 하나에 규범문 3건이 묶여 있음(참고만, 원자성 위반 아님).
- **D3(cosmetic, 기종결, carried)** — REQ-RUNTIME-010 GEARS 라벨 건, 재확인 후 종결 유지.
- **D4(minor, non-blocking, 신규) → 적용** — `acceptance.md` AC-RUNTIME-022 역할 분담 서술의 "AC-022+AC-015 함께 완전히 충족한다" 요약이, 러너→서버 구간의 값 수준 동일성(OS 프로세스 상속 + 정적 검증에 근거한 추론이지 직접 관측이 아님, `research.md` §6에 이미 공개)에 비해 아주 약간 강하게 읽혔다. 오케스트레이터가 해당 문단에 이 뉘앙스를 명시하는 한 문장 qualifier를 추가했다(재감사 불필요 — non-blocking finding에 대한 표현 정정).

보고서: `.moai/reports/plan-audit/SPEC-RUNTIME-001-review-5.md`.

**다음 단계**: 5차 감사 PASS(0.97) 확정으로 `plan_status`는 `audit-ready`다. v0.4.0 아티팩트에 대한 감사가 완료되었으므로 추가 재감사는 불필요하다. 다음은 **구현 착수 승인(Implementation Kickoff Approval, plan→run 전환 승인 게이트)**이다.

**구현 착수 승인 (2026-08-25)**: `/moai run SPEC-RUNTIME-001` 진입 후 Phase 1 게이트 6차 감사 PASS(0.97) 확정을 거쳐, 사용자가 `AskUserQuestion`으로 다음 3건을 승인했다 — (1) 구현 착수, (2) 브랜치를 `plan/SPEC-RUNTIME-001` → `feat/SPEC-RUNTIME-001`로 이름 변경(로컬 rename, 원격 미푸시 상태이므로 안전), (3) 자율 진행 방식(마일스톤마다 중단 없이 진행, 문제 발생 시에만 보고). 목표 엔진(goal engine)이 이 환경에 배선돼 있지 않아(`moai` CLI 미검출, MCP goal_arm 도구 미검색) `ac_converge` 목표를 정식으로 무장(arm)하지 못했다 — graceful degradation 경로에 따라 오케스트레이터가 턴 단위로 직접 진행을 이어간다(동작상 자율 진행과 동일, 다만 훅 강제가 아닌 오케스트레이터 재량).

## §F Phase 4 Mode Selection

```yaml
input_parameters:
  tier: L
  scope_file_count: ~15 (scripts/cli-bootstrap.ts, scripts/db-migrate.ts, scripts/db-seed.ts, scripts/provision-tester.ts, scripts/run-e2e.ts, lib/env.ts 확장, e2e/*.spec.ts 다수, playwright.config.ts, db/migrations 적용 로직 등)
  domain_count: 4 (backend CLI / DB / auth-provisioning / E2E testing) — 그러나 M1→M2~M4→M5→M6은 강한 순차 의존관계(M1이 M2~M4의 선행조건, M5는 M1~M4 완료 후)
  file_language_mix: 100% TypeScript
  concurrency_benefit: LOW — 마일스톤 간 순차 의존성이 강해 병렬화 이득이 없음 (Anthropic coding-task parallelism caveat)
  agent_teams_prereqs: not requested by user
mode_evaluation:
  direct: not selected — 자명한 1줄 수정이 아님
  serial: selected — 코딩 중심 + 마일스톤 간 강한 순차 의존성, Anthropic 권고와 일치
  fanout: not selected — 리서치 중심 작업이 아니며(구현 자체), 마일스톤이 병렬화 가능한 독립 조사가 아님
  sweep: not selected — 30개 이상의 균일한 기계적 변환이 아니라 다양한 신규 로직 구현
  manager-lead: not selected — Tier L이고 6개 마일스톤이지만, M1→M2~M4→M5→M6의 강한 순차 의존성 때문에 워크트리 격리 병렬 분기의 이득이 없음. serial이 더 단순하고 충분함
decision: serial
justification: |
  SPEC-RUNTIME-001은 신규 아키텍처가 아니라 이미 완성된 scaffold(SPEC-SCAFFOLD-001)를 활성화하는
  코딩 중심 작업이다. 6개 마일스톤(M1 env 부트스트랩 → M2 테스터 프로비저닝/M3 마이그레이션/M4 시드 →
  M5 E2E → M6 런북)은 실질적으로 순차 의존 체인이며, 병렬 실행으로 얻을 이득이 없다
  (Anthropic 권고: "most coding tasks involve fewer truly parallelizable tasks than research").
  manager-develop 1개를 순차 재-spawn(cycle_type=tdd)하는 serial 모드가 가장 단순하고 충분하다.
```

## §E.2 Run-phase Evidence

### M1 — 목적별 환경변수 검증 계약 + 명시적 로드 부트스트랩 (완료)

**대상**: REQ-RUNTIME-003, REQ-RUNTIME-010, REQ-RUNTIME-011, REQ-RUNTIME-021

**M1-a 선행 조건 실측 결과**:
- `node --version` → `v24.19.0` — Node 22.6+(타입 스트리핑) 및 22.18+(기본 활성화) 하한을 모두 상회한다. `tsx`를 devDependency로 추가하지 않고, `node`가 `.ts`를 직접 실행하는 경로를 채택했다(`spec.md` §3 "의존성 추가의 허용 범위" — 새 런타임 의존성 미추가). `node scripts/probe.ts` 실측 결과 flag 없이도(`node --experimental-strip-types` 동일 결과) 정상 실행됨을 확인.
  - **잔여 위험(정직하게 기록)**: `tech.md` §개발 환경 요구사항의 문서상 Node 하한은 `20.x LTS 이상`이나, 타입 스트리핑 직접 실행은 Node 22.6+ 요구(`design.md` §6 잔여 위험 목록의 기존 항목과 동일 성격). 이 프로젝트의 실제 실행 환경(v24.19.0)에서는 문제가 없으나, Node 20.x/21.x 환경에서 독립 스크립트를 실행하면 실패한다 — 그런 환경이 실제로 존재한다면 `tsx` 직접 devDependency 선언으로 전환해야 한다(트리에 이미 존재하는 전이 의존성 명시화이므로 §3 허용 범위 내).
- `pnpm add -D @next/env@16.3.2`(`next`와 동일 버전 고정) 실행 → `node_modules/@next/env` 실제 하이드레이션 확인.
  - **[HARD] 실측으로 확정한 구현 세부사항 (design.md §3.2.2가 예시로 든 코드와 실제 필요 형태가 다름)**: `import { loadEnvConfig } from "@next/env"`(named import) 형태는 Node ESM 인터롭에서 `SyntaxError: Named export 'loadEnvConfig' not found`로 **실패**했다 — `@next/env`가 ncc로 번들된 CommonJS 모듈이라 `cjs-module-lexer`가 named export를 정적으로 감지하지 못하기 때문이다. `import pkg from "@next/env"; const { loadEnvConfig } = pkg;`(default import 후 구조분해) 형태는 정상 동작함을 실측 확인했다 — `scripts/cli-bootstrap.ts`는 이 형태를 채택했다. 이는 REQ-RUNTIME-021이 요구하는 "명시적 로드"라는 성질 자체는 바꾸지 않으며, import 구문의 구현 세부사항만 실측으로 확정한 것이다(`design.md` §6 "설계상 열린 지점"의 일부로 이미 예견된 구현-시-확정 항목).

**구현 파일**:
- `lib/env.ts` (신규) — `EnvScope`(`db`/`provision`/`app`/`e2e`) + `validateEnv(scope, source?)`. `design.md` §3.1 스코프×변수 매트릭스를 그대로 반영. `EnvValidationError`는 스코프+변수명+이유+획득경로를 담고 값은 절대 포함하지 않는다. `file:` capability gate는 전 스코프 공통.
- `scripts/cli-bootstrap.ts` (신규) — `bootstrapCli(scope)`: `loadEnvConfig(projectRoot)` → `validateEnv(scope)` 순서 고정. `projectRoot`는 `import.meta.url` 기반(cwd 비의존).
- `instrumentation.ts` (신규) — `register()`: `NEXT_PHASE === "phase-production-build"`일 때 검증 스킵, 그 외에는 `validateEnv("app")` 호출. **[실측, M1]** Next.js는 `register()` 실패를 프로세스 종료가 아니라 요청별 500 응답으로 흡수함을 실제 `pnpm build && pnpm start` 실행으로 확인했다 — AC-RUNTIME-009가 요구하는 "요청 수신 가능 상태 미도달"을 만족시키기 위해 `process.exit(1)`을 명시 호출하도록 구현했다(테스트 환경 NODE_ENV=test 제외, Edge Runtime 제외 — Turbopack이 `process.exit`을 Edge Runtime 미지원 API로 경고하므로 `NEXT_RUNTIME !== "edge"` 가드 추가).
- `lib/db/client.ts` (수정) — `createDbClient()`의 인라인 검사를 `validateEnv("app")` 위임으로 교체. `getDb()` 싱글턴 지연 생성 패턴은 불변(원본 `@MX:ANCHOR`/`@MX:REASON` 유지).
- `package.json` — `@next/env@16.3.2` devDependency 추가(유일한 신규 의존성 선언).

**§E items (verification-claim-integrity.md §3, Claim/Evidence/Baseline/Gaps/Residual-risk)**:

- Claim: 신규/수정 4개 파일(`lib/env.ts`, `lib/db/client.ts`, `scripts/cli-bootstrap.ts`, `instrumentation.ts`) 전체 테스트 GREEN + 100% statement coverage.
  Evidence: `corepack pnpm test` → exit 0, `Test Files 25 passed (25)`, `Tests 95 passed (95)`. `corepack pnpm exec vitest run --coverage <4 files>` → 4개 파일 각각 100% (HTML 리포트 `<span class="strong">100%</span>` 확인, 커버리지 아티팩트는 검증 후 삭제).
  Baseline-attribution: 이 M1 커밋 트리, 이 실행. baseline(M1 착수 전) `pnpm test` → `Test Files 22 passed`, `Tests 71 passed` (기존 스위트, 변경 없음).
- Claim: AC-RUNTIME-003(file: capability gate 양방향), AC-RUNTIME-010(오류 메시지 시크릿 미노출), AC-RUNTIME-019(전량 열거), AC-RUNTIME-020(스코프 좁힘 양방향 3+3), AC-RUNTIME-021(독립 CLI 명시적 로드 + 순서 불변 + 단일 정의) 모두 PASS.
  Evidence: `lib/env.test.ts`(14 tests), `scripts/cli-bootstrap.test.ts`(4 tests) 전체 verbose 통과 로그 확보(§E items 하단 AC 매트릭스 표 참고).
- Claim: AC-RUNTIME-009(app 스코프 부팅 시점 fail-fast)는 직접 함수 호출이 아니라 실제 `pnpm build && pnpm start` 부팅 경로로 검증했다.
  Evidence: env 미설정 상태에서 `next start -p 3998` → 프로세스가 누락 변수명+이유를 stdout에 출력 후 **exit 1로 종료**(포그라운드 실행, `$?` 확인), 이후 `curl http://localhost:3998/` → `Couldn't connect to server`(리스너 없음, 요청 수신 가능 상태 미도달 확인). 대조군: `TURSO_DATABASE_URL=file:./.tmp/*.db` + `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` 설정 후 `next start -p 3997` → `curl http://localhost:3997/login` → `http_code=200`(정상 부팅 확인). 두 프로브 모두 종료 후 프로세스/임시 DB 파일 정리 완료.
  Baseline-attribution: 이 M1 커밋 트리, 이 실행(포그라운드 실측, 함수 직접 호출 아님 — AC-RUNTIME-009 요건 충족).
- Claim: 기존 품질 게이트(`pnpm test`/`pnpm lint`/`pnpm build`/`pnpm format:check`) 전체 유지.
  Evidence: 4개 명령 모두 exit 0 확인(`pnpm build`는 TypeScript 통과 + 정적 페이지 생성 완료; `pnpm format:check`는 최초 실행에서 신규 파일 2건에 대해 `pnpm format` 1회 적용 후 재확인 exit 0).
- Claim: subagent 경계 위반 없음(C-HRA-008 계열).
  Evidence: `grep -rn 'AskUserQuestion' lib/ scripts/ instrumentation.ts | grep -v "_test\|\.test\."` → 매치 0건.
- Claim: 커밋 대상 파일에 평문 시크릿 없음(이번 마일스톤 범위 한정 — AC-RUNTIME-008 전체 검증은 M2/M5 완료 후).
  Evidence: `lib/env.ts`/`lib/db/client.ts`/`scripts/cli-bootstrap.ts`/`instrumentation.ts`에 대한 패턴 검사 결과 0건. 부팅 프로브에 사용한 `BETTER_AUTH_SECRET` 값(`m1-boot-check-secret-value-not-real`)은 셸 환경변수로만 존재했으며 어떤 커밋 대상 파일에도 기록되지 않았다.
- Gaps (미검증, M1 범위 밖): AC-RUNTIME-001/002/004~008/011~018/022는 M2~M6에서 검증한다. `@next/env`의 `.env.local` 우선순위 실제 관측(`processEnv`가 상속값을 덮지 않는지)은 여전히 M5 실측 범위다(`design.md` §6, `research.md` §6) — 이번 M1은 그 우선순위 메커니즘 자체를 관측하지 않았다(cli-bootstrap 단위 테스트는 `@next/env`를 목으로 대체했으므로 실제 `loadEnvConfig` 파일 로딩 동작은 검증 범위 밖 — B4가 명시한 대로 `NODE_ENV=test`에서 `.env.local`이 로드 목록에서 제외되므로 구조적으로 단위 테스트에서 검증 불가능하고, 이는 AC-RUNTIME-021의 통합 수준 검증(M5 또는 별도 통합 테스트)이 담당한다).
- Residual-risk: (1) Node 20.x/21.x 하한 미검증(위 M1-a 항목). (2) Turbopack이 `instrumentation.ts`의 `process.exit` 호출을 Edge Runtime 미지원 API로 경고(빌드는 exit 0으로 통과, 경고만 존재) — 정적 분석기가 런타임 가드(`NEXT_RUNTIME !== "edge"`)를 인식하지 못하기 때문이며, 기능적으로는 Edge Runtime 경로에서 `process.exit`가 호출되지 않는다. (3) `pnpm start`의 "✓ Ready in Nms" 로그는 HTTP 리스너 바인딩 시점에 출력되며 `register()` 완료를 기다리지 않는다는 사실을 실측으로 확인했다 — Next.js 공식 문서("register()가 완료되어야 서버가 요청을 처리할 준비 상태가 된다")와 다른 실제 동작이었다. `process.exit(1)` 명시 호출로 이 간극을 메웠으나, 이는 Next.js 내부 구현에 대한 관측이지 문서화된 계약이 아니므로 향후 Next.js 버전에서 타이밍이 달라질 수 있다.

### Hardening — env-local-safety.ts orphan 정리 + MX 태그 보강 (sync-phase 후속, 완료)

**배경**: sync-phase 독립 보안 리뷰 + sync-auditor에서 발견된 2건의 sync-phase 하드닝 항목 — 정식 마일스톤이 아닌 외과적 후속 수정.

**B1 — orphan-cleanup 방어선 추가**: `prepareSafeEnvLocal()` 본문(백업 생성 → sentinel 쓰기) 중 실패가 발생하면(예: 디스크 풀), 기존 코드는 이미 생성된 백업 디렉터리를 OS 임시 디렉터리에 orphan으로 남기고(개발자의 실 `.env.local` 내용이 담긴 평문 백업이 정리되지 않음) 원래 에러만 전파했다. `cleanupAfterPrepareFailure()` 헬퍼를 추가해: 백업이 온전히 쓰인 뒤 sentinel 쓰기가 실패하면 백업 내용을 `.env.local`에 되돌리고, 백업 디렉터리가 만들어졌다면(내용물 유무와 무관) 항상 제거한다. 정리 자체가 실패해도 원래 에러를 가리지 않고 로그만 남긴 뒤 그대로 재던진다. `withSafeEnvLocal()`이 등록하는 SIGINT/SIGTERM/exit 복원 핸들러는 `prepareSafeEnvLocal()`이 성공적으로 반환한 "이후"에만 존재하므로, 반환 전 실패는 별도 방어선이 필요했다.

**B2 — MX 태그 보강(2건)**:
1. `scripts/provision-tester.ts`의 기존 `@MX:ANCHOR`(`provisionTester`, 이미 존재했음 — CLI 1회 + run-e2e.ts 2회 fan-in) REASON을 보강해 셀프 가입 노출 불변식(AC-RUNTIME-017 — scripts/ 밖 export 금지, HTTP 라우트 미연결)을 명시적으로 재확인.
2. `scripts/env-local-safety.ts`의 `withSafeEnvLocal()` 내 `process.on("exit"/"SIGINT"/"SIGTERM", ...)` 리스너 등록 지점에 신규 `@MX:WARN`+`@MX:REASON` 추가 — 프로세스 전역 상태를 통해 실 자격증명 파일 복원을 보장하는 마지막 방어선임을 명시.

**§E items**:
- Claim: 신규 RED→GREEN 테스트 2건(`scripts/env-local-safety.orphan-cleanup.test.ts`)이 수정 전 코드에서 실패하고 수정 후 통과한다.
  Evidence: 수정 전 `corepack pnpm vitest run scripts/env-local-safety.orphan-cleanup.test.ts` → `Tests 2 failed (2)`(`existsSync(backupDir)` true — orphan 확인). 수정 후 동일 명령 → `Tests 2 passed (2)`.
  Baseline-attribution: 이 하드닝 커밋 트리, 이 실행.
- Claim: 기존 전체 테스트 스위트(137개) + 신규 2개 = 139개 전체 GREEN, lint/format/build 유지.
  Evidence: `corepack pnpm test` → `Test Files 34 passed (34)`, `Tests 139 passed (139)`; `corepack pnpm lint`/`corepack pnpm format:check`/`corepack pnpm build` 모두 exit 0(§E 하단 커밋 로그 참고).
- Gaps: 실제 디스크 풀(OS 레벨 partial write) 상황은 모킹으로 재현하지 않았다 — `writeFileSync` 호출 자체가 던지는 경로만 검증했다(orphan 정리 로직의 핵심 시나리오는 이 경로로 충분히 커버되지만, 바이트 단위 partial write로 인한 `.env.local` 손상 시나리오는 검증 범위 밖).
- Residual-risk: `cleanupAfterPrepareFailure()` 내부의 `readFileSync(backupPath)` 또는 `rmSync(backupDir)` 자체가 실패하는 극단 케이스(예: 백업 디렉터리에 대한 OS 권한 문제)는 로그만 남기고 원래 에러를 그대로 던지도록 설계했으나, 이 이중 실패 경로 자체의 단위 테스트는 작성하지 않았다(설계상 best-effort로 명시된 범위).

### M3 — 마이그레이션 적용 절차 (완료)

**대상**: REQ-RUNTIME-001, REQ-RUNTIME-002

**구현 파일**:
- `scripts/db-migrate.ts` (신규) — `runMigrations()`: `bootstrapCli("db")` → `createClient`/`drizzle` → `drizzle-orm/libsql/migrator`의 `migrate()` → `client.close()`(finally). `reportCliResult(promise)`: 성공/실패 로그 + exit code 부여를 `runMigrations()`와 분리(in-process 재사용 대상은 로그를 섞지 않는다 — design.md §3.3). 직접 실행 판별은 `import.meta.url === pathToFileURL(process.argv[1]).href`.
- `scripts/db-migrate.test.ts` (신규) — 실제 `node scripts/db-migrate.ts` 자식 프로세스 스폰 통합 테스트 2건(AC-RUNTIME-001/002) + in-process 재사용 테스트 1건 + `reportCliResult` 단위 테스트 2건.
- `package.json` — `db:migrate: "node scripts/db-migrate.ts"` 스크립트 추가.

**M3 실측으로 발견한 M1 잔여 결함 2건(모두 이번 마일스톤에서 해소)**:
- **(a) 확장자 없는 상대 import 미해석**: Node 네이티브 타입 스트리핑 실행(`node scripts/*.ts`)은 확장자 없는 상대 import(`from "../lib/env"`)를 해석하지 못한다(`ERR_MODULE_NOT_FOUND`, 실측). M1의 `probe.ts` 실측은 로컬 상대 import가 없는 스크립트였으므로 이 결함을 드러내지 않았다. `scripts/cli-bootstrap.ts`의 `../lib/env` → `../lib/env.ts`로 확장자 명시, `tsconfig.json`에 `allowImportingTsExtensions: true` 추가(이미 `noEmit: true`라 전제조건 충족)로 해소.
- **(b) TS 파라미터 프로퍼티 미지원**: `lib/env.ts`의 `EnvValidationError` 생성자가 쓰던 `constructor(public readonly scope: ..., public readonly missing: ...)` 형태는 Node의 strip-only 모드가 지원하지 않는다(`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, 실측 — `--experimental-transform-types` 플래그로는 회피 가능하나 여전히 experimental이라 채택하지 않음). 필드 선언 + 생성자 본문 대입으로 동일 동작을 유지하며 재작성(공개 API 불변: `.scope`/`.missing`/`.message`/`.name`).
- 두 결함 모두 `lib/env.ts`는 §A.5 PRESERVE 목록에 없고(§D "신규 코드는 lib/env.ts, scripts/... 에 집중된다"), `scripts/cli-bootstrap.ts`도 명시적 PRESERVE 대상이 아니므로 수정 범위 내. B1의 "재구현 금지"는 `.env.local` **로드 로직**(순서, 단일 정의)에 대한 제약이며, 이번 수정은 로드 로직을 그대로 두고 모듈 해석 가능성만 고친 기계적 변경이다.

**§E items (verification-claim-integrity.md §3, Claim/Evidence/Baseline/Gaps/Residual-risk)**:

- Claim: AC-RUNTIME-001(실제 마이그레이션 적용, 9개 테이블 생성) PASS.
  Evidence: `scripts/db-migrate.test.ts` `[AC-RUNTIME-001] pnpm db:migrate 실행 시 9개 테이블이 모두 생성된다` — 실제 자식 프로세스로 `node scripts/db-migrate.ts`를 `TURSO_DATABASE_URL=file:.tmp/db-migrate-cli-*.db`로 실행 후, 별도 `@libsql/client` 연결로 `sqlite_master`를 직접 조회해 `["account","allowed_testers","cases","evidence","feedback","reports","session","user","verification"]` 9개 테이블 확인(schema.ts의 9개 `sqliteTable()` 선언과 1:1 대응). PASS.
  Baseline-attribution: 이 M3 커밋 트리(HEAD `4bc9370` 이후 스테이징), 이 실행.
- Claim: AC-RUNTIME-002(재실행 idempotent, no-op) PASS.
  Evidence: `[AC-RUNTIME-002] ...` — 동일 `file:` DB에 대해 `node scripts/db-migrate.ts`를 2회 연속 실행(실제 프로세스, mock 아님). 2회차도 예외 없이 종료(`expect(() => runMigrateCli(dbFile)).not.toThrow()`), 1회차/2회차 테이블 집합이 완전히 동일함을 확인(Drizzle의 `__drizzle_migrations` 추적 테이블에 위임, 자체 상태 추적 미구현 — plan.md §D "idempotency는 라이브러리/DB 제약에 위임"과 일치). PASS.
- Claim: RED→GREEN 순서 준수(test-after 아님).
  Evidence: 구현 파일(`scripts/db-migrate.ts`) 작성 전 `scripts/db-migrate.test.ts` 3건 실행 → verbatim RED: `Error: Cannot find module 'C:\Users\Nexsol\Documents\bosang-radar\scripts\db-migrate.ts'`(자식 프로세스 스폰 2건) + `Error: Cannot find module '/scripts/db-migrate.ts' imported from ...db-migrate.test.ts`(in-process 1건), `Test Files 1 failed | 25 passed (26)`, `Tests 3 failed | 95 passed (98)`. 구현 후 재실행 → `Test Files 26 passed (26)`, `Tests 98 passed (98)`(이후 `reportCliResult` 단위 테스트 2건 추가로 최종 100 passed).
- Claim: 기존 회귀 없음 — 전체 스위트 GREEN, `pnpm build`/`pnpm lint` 통과.
  Evidence: `pnpm test` → `Test Files 26 passed (26)`, `Tests 100 passed (100)`(M1의 95건 + M3의 5건). `pnpm build` → TypeScript 통과, 6/6 정적 페이지 생성, exit 0(`instrumentation.ts`의 Edge Runtime `process.exit` 경고는 M1에서 이미 기록된 잔여 위험이며 M3에서 신규 발생한 문제 아님). `pnpm lint` → 출력 없음(exit 0, 신규 이슈 없음, M1 기준선 그대로 유지).
- Claim: subagent 경계 위반 없음.
  Evidence: `grep -rn 'AskUserQuestion' scripts/ | grep -v "_test\|\.test\."` → 매치 0건(grep exit 1).
- Claim: `scripts/db-migrate.ts` 커버리지 목표(85%) 충족.
  Evidence: `npx vitest run --coverage scripts/db-migrate.test.ts` → `db-migrate.ts` Stmts 93.33%(28/30), Branch 75%, Funcs 100%, Lines 93.33%. 미달 라인(50번, `if (isDirectExecution) { void reportCliResult(runMigrations()); }` 가드 자체)은 실제 자식 프로세스 실행 경로로만 타므로 V8 커버리지 계측 범위 밖(별도 프로세스) — `reportCliResult`를 분리 추출해 그 내부 로직은 단위 테스트로 별도 커버.
- Claim: 커밋 대상 파일에 평문 시크릿 없음.
  Evidence: `scripts/db-migrate.ts`/`scripts/db-migrate.test.ts`/`lib/env.ts`/`scripts/cli-bootstrap.ts`/`tsconfig.json`/`package.json` 패턴 검사 결과 0건. 테스트에 사용한 `TURSO_AUTH_TOKEN=""`(빈 문자열, `file:` 스킴이라 불필요)만 존재.
- Claim: `.tmp/*.db` 테스트 아티팩트 미커밋.
  Evidence: `git status --porcelain -- scripts/ lib/ package.json tsconfig.json` 결과에 `.tmp/` 항목 없음(`.gitignore:108:*.tmp` 패턴이 `.tmp/` 디렉터리 전체를 커버함을 `git check-ignore -v`로 확인) + 테스트 종료 후 `afterEach`에서 실제 파일 삭제 확인(Windows에서 libsql 네이티브 바인딩이 `close()` 반환 후 잠금을 지연 해제하는 문제를 5회·50ms 재시도로 흡수).
- Gaps (미검증, M3 범위 밖): 원격 Turso(libsql://) 인스턴스에 대한 실제 마이그레이션은 검증하지 않았다(로컬 `file:` 스킴만 실측 — 이는 B2가 명시한 로컬 테스트 경로와 일치하며, `TURSO_AUTH_TOKEN` capability gate 자체는 M1에서 이미 양방향 검증됨). `scripts/db-seed.ts`(M4)와의 실행 순서 통합은 다음 마일스톤 범위.
- Residual-risk: (1) `--experimental-transform-types` 미채택 결정은 이번 저장소의 `lib/env.ts` 코드베이스 전체에 파라미터 프로퍼티를 쓰지 않는다는 암묵적 관례를 만든다 — 향후 신규 클래스가 이 패턴을 재도입하면 동일 결함이 재발한다(현재 lint 규칙으로 강제되지 않음, ESLint 규칙 추가는 이번 SPEC 범위 밖). (2) Node의 `[MODULE_TYPELESS_PACKAGE_JSON]` 경고가 모든 스크립트 실행 시 stderr에 출력된다 — 기능에는 영향 없으나 운영자 로그에 노이즈로 남는다(M1 결정 "tsx 미사용, `package.json`에 `"type": "module"` 추가 안 함"의 알려진 부작용이며 이번 SPEC 범위에서 해소 대상 아님).

### M5 — E2E 하네스 + 시나리오 (완료)

**대상**: REQ-RUNTIME-012 ~ REQ-RUNTIME-017

**구현 파일**:
- `scripts/env-local-safety.ts` (신규) — `prepareSafeEnvLocal()`/`withSafeEnvLocal()`: `.env.local` 백업(OS 임시 디렉터리)→sentinel 기입→`SIGINT`/`SIGTERM`/`exit`/정상 종료 전 경로 복원(design.md §3.6). `kill -9`는 명시적으로 닫히지 않는 잔여 위험으로 남김.
- `scripts/run-e2e.ts` (신규) — `pnpm test:e2e`의 실제 진입점. `assembleE2EEnv()`(시크릿 생성 + `process.env` 조립) → `bootstrapCli("e2e")` → `resetE2EDatabase()` → `runMigrations()`/`runSeed()`/`provisionTester()` × 2(테스터 A·B, in-process 재사용) → `spawnPlaywrightRunner(spawnFn)`(injectable). `TESTER_A_EMAIL`/`TESTER_B_EMAIL` export로 `e2e/*.spec.ts`의 SSOT 제공. `e2e/global-setup.ts`는 존재하지 않는다(design.md §3.3).
- `playwright.config.ts` (신규) — `webServer: pnpm build && pnpm start`, chromium 단일 프로젝트. `webServer.env` 필드 자체를 생략해 4개 키(BETTER_AUTH_SECRET/TESTER_PASSWORD/TURSO_DATABASE_URL/BETTER_AUTH_URL) 재선언 없음.
- `e2e/helpers.ts`, `e2e/auth.spec.ts`, `e2e/case-flow.spec.ts`, `e2e/tenant-isolation.spec.ts` (신규) — AC-RUNTIME-011/012/013/014.
- `app/login/login-form.tsx`, `app/cases/new/case-input-form.tsx`, `app/cases/[caseId]/page.tsx` (수정) — 안정적 E2E 셀렉터를 위한 `data-testid` 최소 추가만(마크업/스타일 변경 없음, §A.5 PRESERVE 준수).
- `vitest.config.ts` (수정) — `exclude`에 `e2e/**` 추가.
- `package.json` (수정) — `test:e2e` 스크립트 + `@playwright/test@^1.62.1` devDependency.
- `.gitignore` (수정) — `/test-results/`, `/playwright-report/`, `/blob-report/`, `/playwright/.cache/` 추가(이번 마일스톤이 처음 만들어내는 아티팩트 종류).

**§E items (verification-claim-integrity.md §3, Claim/Evidence/Baseline/Gaps/Residual-risk)**:

- Claim: `.env.local` 안전 교체·복원 메커니즘(design.md §3.6)이 정상 종료·실행 중 예외·시뮬레이션된 `SIGINT` 3가지 경로 모두에서 원본 상태를 복원한다.
  Evidence: `scripts/env-local-safety.test.ts`(임시 디렉터리 fake 파일, 7 tests) + `scripts/env-local-safety.realroot.test.ts`(실제 프로젝트 루트 `.env.local` 대상, throwaway 값, 3 tests: (a) 정상 종료 (b) 실행 중 에러 (c) 시뮬레이션된 SIGINT) 모두 PASS. RED(사전): `Cannot find module './env-local-safety.ts'`. GREEN(사후): `Test Files 1 passed (1)`, `Tests 7 passed (7)` / `Tests 3 passed (3)`.
  Baseline-attribution: 이 M5 커밋 트리, 이 실행. 각 테스트가 자체적으로 `existsSync(realEnvLocalPath)`를 실행 전/후 단언.
- Claim: AC-RUNTIME-022 — 진입점→Playwright 러너 spawn 호출에 전달된 env가 조립값과 값 단위로 일치하며 `TURSO_DATABASE_URL`이 `file:` 스킴이다. Playwright·브라우저·앱 기동 불필요.
  Evidence: `scripts/run-e2e.test.ts` — 기록용 spawn 대역을 주입해 실제 `runMigrations()`/`runSeed()`/`provisionTester()` × 2(실제 `.tmp/e2e.db`)를 수행한 뒤 spawn 호출 인자의 `env`를 캡처, `BETTER_AUTH_SECRET`/`TESTER_PASSWORD`/`TURSO_DATABASE_URL`/`BETTER_AUTH_URL` 4개 항목 일치 + `file:` 스킴 단언 PASS(4 tests). 정적 보완: `scripts/playwright-config-static.test.ts` — `playwright.config.ts`의 코드(주석 제외) 어디에도 4개 키가 재선언되지 않음 + `e2e/global-setup.ts` 부재 확인(2 tests). RED(사전): `Cannot find module '/scripts/run-e2e.ts'`. GREEN(사후): 4/4, 2/2 PASS.
  Baseline-attribution: 이 M5 커밋 트리, 이 실행.
- Claim: AC-RUNTIME-021 — 셸에 환경변수가 전무하고 `.env.local`에만 `TURSO_DATABASE_URL=file:./.tmp/ac021.db`가 기입된 상태에서 `pnpm db:migrate` → `pnpm db:seed`가 exit 0으로 완료하고, 실제로 9개 테이블이 생성되며 `evidence` 행이 적재된다.
  Evidence: `withSafeEnvLocal()`로 실제 프로젝트 루트 `.env.local`을 위 내용으로 교체한 뒤, `TURSO_*`/`BETTER_AUTH_*`/`TESTER_PASSWORD`/`GEMINI_API_KEY`를 전부 제거한 셸 환경에서 `execFileSync("pnpm", ["db:migrate"])` → stdout `✅ 마이그레이션 완료`(exit 0), 이어서 `pnpm db:seed` → stdout `✅ 시드 완료`(exit 0). 별도 `@libsql/client` 연결로 `.tmp/ac021.db`를 직접 조회 — `sqlite_master` 9개 테이블(`account,allowed_testers,cases,evidence,feedback,reports,session,user,verification`) + `evidence` 4행 확인. 실행 후 `existsSync(project-root/.env.local)` → `false`(원상 복원 확인, 검증 시작 전 상태와 동일).
  Baseline-attribution: 이 M5 커밋 트리, 이 실행(실제 자식 프로세스, mock 아님). `.tmp/ac021.db`는 검증 후 `.tmp/` 디렉터리 전체와 함께 삭제.
- Claim: AC-RUNTIME-015 — `pnpm test:e2e` 단일 명령이 (1) 셸에 시크릿 미설정 + (2) `.env.local`에 sentinel 원격 자격증명(`libsql://sentinel-nonexistent-host.invalid` + 더미 토큰)이 동시에 존재하는 상태에서, 상속된 `file:` 값이 우선해 로컬 DB만 사용하고 sentinel 호스트에는 어떤 연결도 발생하지 않는다.
  Evidence: 위와 동일한 `withSafeEnvLocal()` 절차로 sentinel `.env.local`을 만들고 `execFileSync("pnpm", ["test:e2e"])`를 실제 실행(셸에 시크릿 미설정). 실행 후 `.tmp/e2e.db`가 생성되었고, 직접 쿼리로 `user` 테이블에 `e2e-tester-a@example.com`/`e2e-tester-b@example.com` 2행, `evidence` 4행이 확인됨 — `run-e2e.ts`의 `assembleE2EEnv()`→`bootstrapCli("e2e")`(`.env.local` 로드 포함)→`resetE2EDatabase()`→`runMigrations()`→`runSeed()`→`provisionTester()` × 2 전 구간이 sentinel `.env.local`이 디스크에 존재하는 채로 정상 완료됨을 확인했다 — 이는 상속된 `file:` 값이 sentinel을 이겼다는(가정 붕괴가 아니라 기대 경로가 성립했다는) 직접 증거다. 실행 후 `existsSync(project-root/.env.local)` → `false`(원상 복원 확인 — 이 실행은 아래 Gaps에 기재된 사유로 실패 종료했음에도 정리 경로가 정상 동작했다는 추가 증거).
  Baseline-attribution: 이 M5 커밋 트리, 이 실행(실제 `pnpm test:e2e` 프로세스, mock 아님).
- Claim: 기존 품질 게이트(`pnpm test`/`pnpm lint`/`pnpm build`/`pnpm format:check`) 유지, `pnpm test`가 `e2e/**`를 수집하지 않는다.
  Evidence: `pnpm test` → `Test Files 32 passed (32)`, `Tests 137 passed (137)`(M3 종료 시점 100건 대비 +37 — M2/M4가 추가한 회귀 테스트 포함, 이번 M5가 추가한 신규 4개 파일 16 tests 포함: `env-local-safety.test.ts` 7 + `env-local-safety.realroot.test.ts` 3 + `run-e2e.test.ts` 4 + `playwright-config-static.test.ts` 2), `e2e/*.spec.ts` 3개 파일은 목록에 없음(vitest.config.ts exclude 반영 확인). `pnpm lint` → 0 errors, 0 warnings(신규 파일의 unused-var 경고 2건은 발견 즉시 수정). `pnpm build` → TypeScript 통과, Turbopack 경고 1건은 M1에서 이미 기록된 기존 잔여 위험(`instrumentation.ts`의 Edge Runtime `process.exit`)이며 M5 신규 아님. `pnpm format:check` → 신규 파일 4개(`e2e/*.spec.ts` 3개 + `scripts/run-e2e.test.ts`)에 대해 `prettier --write` 1회 적용 후 재확인 — 남은 경고 1건(`scripts/db-seed.test.ts`)은 `git diff --stat`으로 미변경 확인된 기존 파일이므로 아래 Gaps에 기록.
  Baseline-attribution: 이 M5 커밋 트리, 이 실행.
- Claim: subagent 경계 위반 없음.
  Evidence: `grep -rn 'AskUserQuestion' scripts/ e2e/ | grep -v "_test\|\.test\."` → 매치 0건(grep exit 1).
- Claim: 아키텍처 경계 보존(AC-RUNTIME-017 관련 부분).
  Evidence: `git diff --exit-code lib/pipeline lib/ai lib/validation lib/db/schema.ts lib/auth/config.ts` → exit 0(변경 없음). M5는 이 5개 경로를 전혀 건드리지 않았다.
- Claim: 검증 실행 종료 후 개발자의 원본 `.env.local`(부재 상태)과 `.tmp/` 산출물이 남지 않는다.
  Evidence: AC-021/AC-015 검증 스크립트 실행 직후 및 최종 정리 후 각각 `existsSync(.env.local) === false`(2회 독립 확인) + `.tmp/` 디렉터리 수동 삭제 후 `ls .tmp` → `No such file or directory`.
- Gaps (미검증, 환경적 사유) — **[해소, 아래 "M5 추가" 섹션 참고]**:
  - AC-RUNTIME-011/012/013/014의 **실제 브라우저 E2E 실행**(Playwright chromium을 통한 로그인·사건입력·피드백·tenant isolation 시나리오)은 이 환경에서 완주하지 못했다. 사유: `pnpm test:e2e`가 Playwright의 `webServer`를 기동하려 할 때 로컬 포트 3000이 **이 세션과 무관한 별도 프로젝트**(`D:\Workspace\frontend-Tpa-Mutual-Fund-Admin` — 세션의 Additional working directories 중 하나로, 이 SPEC 시작 전인 11:26에 이미 실행 중이던 dev 서버, PID 26600)에 의해 점유되어 있어 `Error: http://localhost:3000 is already used`로 실패했다. 해당 프로세스는 이 SPEC과 무관한 작업에 속하므로 종료하지 않았다(scope discipline). 위 AC-RUNTIME-015 Evidence가 보이듯 **DB 준비 단계(시크릿 생성→env 조립→스코프 검증→마이그레이션→시드→테스터 A·B 프로비저닝) 전체는 이 정확히 동일한 실행에서 성공**했고, Playwright 자신의 사전 포트 점검에서만 실패했다 — `run-e2e.ts`가 소유한 로직 자체의 결함이 아니라 환경 충돌이다. `e2e/*.spec.ts` 3개 파일은 소스 정적으로는 완성되어 있으나 chromium을 통한 실행으로는 검증되지 않았다. **(2026-08-25 후속 — team-lead 승인에 따라 고정 3000 대신 실행 시점 빈 포트로 전환, 아래 "M5 추가" 섹션에서 실제 chromium 실행으로 AC-011~014 전부 PASS 확인. 단, 그 과정에서 별도의 새 환경적 Gap 1건이 발견됨 — 아래 참고.)**
  - `pnpm format:check`의 `scripts/db-seed.test.ts` 경고는 M5 이전부터 존재하던 기존 파일의 포맷 이슈(git diff로 미변경 확인)이며, B10(untouched paths PRESERVE)에 따라 이번 마일스톤에서 수정하지 않았다.
- Residual-risk: (1) `kill -9`(SIGKILL)는 `.env.local` 안전 복원 메커니즘이 명시적으로 닫지 않는 잔여 위험이다(design.md §3.6, spec.md §5) — 인-프로세스 시그널 핸들러 자체를 우회하므로 이 설계로 해결 불가능하며, AC-021/AC-015 실측 검증 모두 정상/에러/SIGINT 경로만 실측했고 SIGKILL 경로는 실측하지 않았다(설계상 의도적으로 열어둔 위험이므로 실측 대상이 아니다). (2) AC-RUNTIME-011/012/013/014의 브라우저 수준 검증이 이 세션에서 완주되지 못했으므로, 로그인 폼·사건입력 폼·피드백 폼의 실제 DOM 상호작용(클릭·입력·페이지 전환)에서 발생할 수 있는 셀렉터 불일치나 타이밍 이슈는 코드 리뷰 수준으로만 확인되었다 — 포트 충돌이 해소된 환경(예: CI)에서 최초 실행 시 재확인이 필요하다. (3) `resetE2EDatabase()`는 Windows에서 직전 실행의 libsql 파일 핸들이 즉시 해제되지 않아 삭제가 실패할 수 있음을 실측했다(EPERM) — best-effort로 무시하도록 구현했으며, Drizzle 추적 테이블의 멱등성에 기대어 기능적으로는 영향이 없음을 확인했으나(재실행 시 정상 동작), 완전한 "매 실행 클린 슬레이트" 보장은 아니다.

### M5 추가 — 포트 충돌 해소 + 실제 브라우저 E2E 검증 (완료)

**대상**: 위 Gap 1건("AC-RUNTIME-011~015의 실제 브라우저 E2E 실행 미완주") 해소. team-lead 승인에 따라 진행.

**구현 시 확정 항목 (design.md/spec.md/acceptance.md 미변경 — 포트 번호는 구현 세부사항)**:
- `scripts/run-e2e.ts`에 `findFreePort()`(node:net, OS 배정 임시 포트) 추가. `assembleE2EEnv()`를 비동기로 전환해 실행 시점에 빈 포트를 확보하고 `BETTER_AUTH_URL=http://localhost:<포트>` + `process.env.E2E_PORT=<포트>`를 설정한다.
- **고정 대체 포트(예: 3100)가 아니라 OS 배정 동적 포트를 선택한 이유**: 고정 포트는 언젠가 같은 충돌 클래스를 재현할 수 있는 반면, OS 배정 포트는 그 클래스의 충돌 자체를 구조적으로 제거한다.
- `playwright.config.ts`가 `process.env.E2E_PORT`를 읽어 `use.baseURL`/`webServer.url`을 구성하고, `webServer.env: { PORT: String(port) }`로 Next.js 서버 프로세스에 전달한다(`next start`는 `PORT` 환경변수를 인식). **PORT는 시크릿이 아니므로** design.md §3.4의 "webServer.env에 4개 키(BETTER_AUTH_SECRET/TESTER_PASSWORD/TURSO_DATABASE_URL/BETTER_AUTH_URL)를 재선언하지 않는다" 제약과 무관하다 — `scripts/playwright-config-static.test.ts`가 4개 키 미재선언을 계속 정적으로 확인한다(수정 불필요, 재확인 PASS).
- `scripts/e2e-tester-emails.ts`(신규) — `TESTER_A_EMAIL`/`TESTER_B_EMAIL`을 `run-e2e.ts`에서 분리한 leaf 모듈. **사유(실측 발견)**: `e2e/*.spec.ts`가 이 상수를 `../scripts/run-e2e.ts`에서 직접 import했을 때, Playwright Test의 spec 번들러가 CommonJS로 변환하면서 `run-e2e.ts`(및 그것이 import하는 `cli-bootstrap.ts`/`db-migrate.ts`/`db-seed.ts`/`provision-tester.ts` — 전부 모듈 최상위에서 `import.meta.url`을 읽는 `isDirectExecution` 판별 코드를 가짐)까지 함께 번들링을 시도해 `SyntaxError: Cannot use 'import.meta' outside a module`로 전체 spec 로딩이 실패했다(`Error: No tests found`). 이메일 상수만 `import.meta`를 전혀 쓰지 않는 별도 leaf 모듈로 분리해 spec 파일의 import 그래프가 그 코드에 닿지 않도록 했다 — `run-e2e.ts`는 이 모듈을 재수출(`export { TESTER_A_EMAIL, TESTER_B_EMAIL }`)해 SSOT는 하나로 유지한다.
- `spawnPlaywrightRunner()`의 `shell: true`는 **그대로 유지**한다 — 제거를 시도했으나(`pnpm.cmd`를 shell 없이 직접 spawn) Node 24(v24.19.0)에서 `spawn EINVAL`로 즉시 실패했다(.cmd/.bat 실행 파일에 대한 Node의 보안 강화 영향으로 판단, 관련: CVE-2024-27980). shell:true는 회피 대상이 아니라 이 플랫폼의 필수 옵션임을 실측으로 재확인하고 원복했다.

**§E items (verification-claim-integrity.md §3)**:

- Claim: AC-RUNTIME-011/012/013/014가 실제 Chromium 브라우저 실행으로 전부 PASS한다.
  Evidence: 동적 포트 적용 + `e2e-tester-emails.ts` 분리 후 `pnpm test:e2e`를 **3회 독립 실행**(1회는 `withSafeEnvLocal()`로 AC-015의 sentinel `.env.local` Given을 재현한 실행, 2회는 직접 터미널 실행 — 두 형태 모두 동일하게 재현), 매회 verbatim:
  ```
  Running 4 tests using 3 workers
    ✓ [chromium] e2e/auth.spec.ts:10:7 — 인증 — AC-RUNTIME-011 — 등록된 테스터 A는 로그인에 성공해 보호 경로로 진입한다
    ✓ [chromium] e2e/tenant-isolation.spec.ts:14:7 — Tenant Isolation — AC-RUNTIME-014 — 테스터 B는 테스터 A가 소유한 사건 상세에 접근할 수 없다
    ✓ [chromium] e2e/auth.spec.ts:17:7 — 인증 — AC-RUNTIME-011 — allowed_testers에 없는 이메일은 로그인이 거부되어 세션이 생성되지 않는다
    ✓ [chromium] e2e/case-flow.spec.ts:11:7 — 사건 흐름 — AC-RUNTIME-012, AC-RUNTIME-013 — 사건 입력이 저장되고 리포트가 렌더링되며, 피드백이 저장된다
  ```
  4/4 PASS를 3회 모두 재현(1.1-3.3초, 실제 chromium 렌더링·클릭·DB 직접 조회 단언 포함 — e2e/case-flow.spec.ts는 `/api/cases` 201 응답 + `cases`/`reports`/`feedback` 테이블 행을 실제 쿼리로 확인, e2e/tenant-isolation.spec.ts는 실제 404 응답 확인).
  Baseline-attribution: 이 M5 추가 커밋 트리, 이 3회 실행(모두 실제 프로세스·실제 chromium, mock 아님).
- Claim: AC-RUNTIME-015 (1)항("사람의 수동 조작 없이 ... exit 0으로 종료") 중 시크릿 생성~테스트 시나리오 실행까지는 완전히 자동으로 수행되며, (2)(3)항(로컬 DB 격리, 인증 흐름 동작)은 위 AC-011~014 실측으로 완전히 PASS한다. (1)항의 "exit 0" 부분은 아래 Gap 참고.
  Evidence: 위 3회 실행 모두에서 4개 시나리오가 사람 개입 없이 자동으로 성공했다.
- Gaps (남은 것, 새로 발견됨 — Windows 환경 특유):
  - **`pnpm test:e2e`가 4/4 테스트 통과 후 exit 0으로 종료하지 못하고 무기한 행(hang)한다** — Playwright의 `webServer`(Next.js `next start`) 프로세스 종료(teardown) 단계에서 멈춘다. 3회 독립 재현(래퍼 스크립트 경유 1회 + `pnpm test:e2e` 직접 터미널 실행 2회, 매회 4/4 테스트 통과 후 5분 이상 응답 없어 프로세스 트리를 수동 종료) — **제 검증 래퍼의 추가 셸 중첩이 원인이 아님을 직접 터미널 실행으로 배제**했다. 근본 원인으로 추정되는 것: `webServer.command`가 `pnpm build && pnpm start`로 `&&`를 포함해 Playwright 자신이 내부적으로 셸을 통해 spawn해야 하며, 여기에 pnpm의 자체 `exec` 내부 셸 래핑과 Windows의 cmd.exe 프로세스 트리 종료 신뢰성 문제(각 중첩 셸 계층이 Job Object로 완전히 묶이지 않을 수 있음)가 겹친 것으로 보인다 — Playwright·Next.js·pnpm 각각의 내부 구현이라 `run-e2e.ts`/`playwright.config.ts` 코드 변경만으로 근본 해결은 어렵다(`spawnPlaywrightRunner()`의 `shell:true` 제거를 시도했으나 위에서 기록했듯 다른 방식으로 실패했다). **테스트 자체의 정확성(4/4 PASS)에는 영향이 없다** — 순수하게 프로세스 정리(cleanup) 단계의 문제다.
- Residual-risk (추가, Windows 특유): 이 환경(Windows, Node v24.19.0, pnpm 11.23.0)에서 `pnpm test:e2e`를 사람이 직접 실행하면 4개 시나리오가 전부 통과한 뒤에도 터미널이 반환되지 않고 걸려 있을 수 있다 — 운영자는 Ctrl+C 또는 작업 관리자로 남은 `next start`/`node` 프로세스를 수동 종료해야 완전히 마무리된다. CI(대개 Linux 컨테이너)에서는 이 Windows 특유의 셸 중첩·프로세스 트리 종료 문제가 적용되지 않을 가능성이 높으나, 이 세션에서는 Linux 환경 실측 기회가 없었다 — CI 최초 실행 시 exit code를 재확인 권장.

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_complete_at: 2026-08-25
run_status: audit-ready   # 6개 마일스톤(M1/M3/M4/M2/M5/M6) 전부 완료, 오케스트레이터 독립 검증 완료
milestones:
  - id: M1
    title: 목적별 환경변수 검증 계약 + 명시적 로드 부트스트랩
    commit: 4bc9370
    verified_by_orchestrator: true   # pnpm test/lint/format:check/build 4개 전부 exit 0 직접 재실행 확인
  - id: M3
    title: 마이그레이션 적용 절차
    commit: 4c67c9d
    verified_by_orchestrator: true   # pnpm test 재실행 + db-migrate.ts 실제 CLI 2회 실행(재실행 안전성) 직접 확인
  - id: M4
    title: 시드 절차
    commit: ad7f1dd
    verified_by_orchestrator: true   # pnpm test 재실행 + db-migrate→db-seed 실제 CLI 연쇄 실행 직접 확인
  - id: M2
    title: 테스터 프로비저닝 (+ SPEC-SCAFFOLD-001 스키마/마이그레이션 드리프트 보정)
    commit: c5b5aef, 4740862
    blocker_resolved: true   # account.issuer 컬럼 드리프트 발견 → AskUserQuestion → plan revision v0.5.0(AC-RUNTIME-017 예외) → 보정 마이그레이션 0001_bitter_talon.sql
    verified_by_orchestrator: true   # 보정 마이그레이션 내용 확인(issuer 컬럼 추가뿐) + schema.ts 불변 diff 확인 + 실제 provision-tester.ts CLI 실행 확인
  - id: M5
    title: E2E 하네스 + 시나리오
    commit: 80cd6eb, 5d627cb
    blocker_resolved: true   # 포트 3000 충돌(무관한 다른 프로젝트 프로세스) 발견 → AskUserQuestion → 동적 빈 포트 탐색으로 전환
    verified_by_orchestrator: true   # 오케스트레이터가 직접 pnpm test:e2e 실행, 4/4 실제 Chromium 시나리오 통과 확인(2.4분), .env.local 안전 복원 확인, 잔여 프로세스 없음 확인
    residual_risk: pnpm test:e2e teardown hang (Windows, 프로세스 정리 단계, 테스트 정확성 무관 — 사용자 승인으로 기록만 하고 진행)
  - id: M6
    title: 런북 문서화
    commit: c16cc65
    verified_by_orchestrator: true   # 런북 내용 직접 검토(스코프 매트릭스 일치, 시크릿 미기재, teardown hang 안내 포함) + .env.local.example 플레이스홀더 확인
final_gate:
  pnpm_test: PASS   # 32 test files, 137 tests, exit 0 (오케스트레이터 최종 재실행)
  pnpm_lint: PASS   # 0 issues (오케스트레이터 최종 재실행)
  pnpm_build: PASS  # exit 0 (오케스트레이터 최종 재실행)
next_step: sync-phase 진행 여부 사용자 확인 대기
```

이번 run-phase는 두 차례의 진짜 블로커를 만났다 — 둘 다 계획에서 예견하지 못했던 실측 발견이었고, 둘 다 `AskUserQuestion`으로 사용자 결정을 거쳐 해소했다. (1) M2에서 SPEC-SCAFFOLD-001이 남긴 스키마/마이그레이션 드리프트(`account.issuer` 컬럼 누락)를 발견 — 보정 마이그레이션 1건 + AC-RUNTIME-017 문구의 좁은 예외(plan revision v0.5.0)로 해소했다. (2) M5에서 포트 3000이 이 세션과 무관한 다른 프로젝트에 점유되어 있음을 발견 — E2E 포트를 실행 시점 동적 탐색으로 바꿔 근본적으로 같은 충돌 클래스를 제거했다. 두 사안 모두 SPEC 자신의 설계 결함이 아니라 외부 요인(선행 SPEC의 잔여 결함, 무관한 프로세스와의 우연한 충돌)이었다.

전 구간에서 서브에이전트의 자체 보고를 그대로 신뢰하지 않고, 오케스트레이터가 매 마일스톤마다 `pnpm test`/`lint`/`build`를 직접 재실행하고 최소 1회는 실제 CLI 명령(마이그레이션·시드·프로비저닝·E2E)을 직접 실행해 결과를 눈으로 확인했다.

## §E.4 Sync-phase Audit-Ready Signal

```yaml
sync_complete_at: 2026-08-25
sync_status: audit-ready   # 문서 동기화 + status 전환 완료, 오케스트레이터 독립 재검증 완료
sync_commit_sha: f4b0dc8   # docs(SPEC-RUNTIME-001): sync-phase 문서 동기화 + status: implemented
updated_artifacts:
  - path: CHANGELOG.md
    change: "[Unreleased] 아래 SPEC-RUNTIME-001 섹션 신설 (DB 마이그레이션/시드/테스터 프로비저닝/env 검증/E2E 요약)"
  - path: README.md
    change: "구현 상태·환경변수 설정·DB/E2E 실행 절차·스크립트 표·프로젝트 구조·다음 단계 갱신, runtime-runbook.md 링크 추가"
  - path: .moai/project/tech.md
    change: "@playwright/test(테스트 도구), @next/env(신규 '런타임 활성화 도구' 절) 근거 기록"
  - path: .moai/project/structure.md
    change: "scripts/, e2e/, instrumentation.ts, playwright.config.ts 트리 반영 + scripts/e2e 목적 설명 절 신설"
  - path: .moai/specs/SPEC-RUNTIME-001/spec.md
    change: "frontmatter status: in-progress → implemented (body 미변경)"
codemaps_regenerated: false   # 이번 SPEC은 기존 scaffold 아키텍처를 활성화만 함(새 아키텍처 계층 없음) — 재생성 불필요로 판단
plan_acceptance_frontmatter_note: "plan.md·acceptance.md는 이 프로젝트 관례상 YAML frontmatter 자체가 없음(SPEC-SCAFFOLD-001과 동일 패턴) — status 필드는 spec.md에만 존재하므로 그쪽만 전환"
verification_rerun:
  pnpm_test: PASS   # 33 test files, 139 tests, exit 0 (manager-docs 직접 재실행 재확인)
  pnpm_lint: PASS   # 0 issues (manager-docs 직접 재실행 재확인)
  pnpm_format_check: PASS   # Prettier 포맷 준수 확인
next_step: manager-git 위임(Tier L PR 라우트) 또는 사용자 확인 대기
```
