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

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
