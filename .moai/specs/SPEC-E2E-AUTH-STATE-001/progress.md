# Progress — SPEC-E2E-AUTH-STATE-001

## §E.1 Plan-phase Audit-Ready Signal

- **상태**: plan-phase 아티팩트(spec.md / plan.md / acceptance.md) 최초 작성 완료, status: draft.
- **Tier**: M (spec.md 프론트매터, plan.md §A.1 판정 근거).
- **SPEC ID 정합성**: `SPEC-E2E-AUTH-STATE-001`이 SPEC ID 정규식(`^SPEC(-[A-Z][A-Z0-9]*)+-[0-9]{3}$`)을 통과함을 Bash로 실행 확인(PASS), 기존 `.moai/specs/` 9개 디렉터리와 충돌 없음을 확인.
- **GEARS 준수**: REQ-E2EAUTH-001~010 전체가 GEARS 5개 패턴(Event-driven/Where/Unwanted/Ubiquitous) 중 하나로 작성됨. 레거시 `IF/THEN` 모달리티 미사용.
- **Out of Scope 규칙 준수**: spec.md §4에 5개의 `### Out of Scope — <주제>` H3 서브헤딩과 각 `-` 불릿, 그리고 영문 리터럴 "out of scope" 문구 포함 확인.
- **AC 추적성**: acceptance.md §C에서 REQ 10개 전체가 최소 1개 AC로 추적됨을 확인.
- **plan-auditor iteration-1**: FAIL, 종합 점수 0.71 (Tier M 기준 0.80). D2/D3(blocking, major) + D4(blocking, minor)를 수정하고 D1/D5(선택)도 반영 — spec.md v0.1.1, HISTORY에 상세 기록. AC 11개 → 12개(AC-E2EAUTH-012 신규), REQ 10개 불변.
- **외부 리뷰어 심층 기술 리뷰 (v0.1.1 → v0.1.2)**: 브랜치 `plan/SPEC-E2E-AUTH-STATE-001`, 리뷰 기준 HEAD `d29fce99c0e1e9a7e8741cccf90f55cf1ac30be3` / SPEC-start 기준선 `1d480eaac2e0b53e0a5f0080baf14a596f09f533`(양쪽 모두 브랜치 히스토리에서 실측 검증됨). 6개 범주 — (1) 무변경 검증의 비교 기준선 오류(인자 없는 `git diff` → `$SPEC_START_SHA`/`$IMPL_COMPLETE_HEAD` 커밋 diff + 작업 트리 2단계, `scripts/`·`webServer` PRESERVE 정합), (2) auth-setup 단계를 무재시도 검증에 포함(3항목×5회 세분화, `/sign-in` 네트워크 요청 횟수 검증 신설, 과잉주장 완화), (3) storageState 재생성 실측 구체화(leftover 파일 + 전체 스위트/`--spec` 필터 양쪽, 계정 교차-오염 없음, 원문 비밀 미기록), (4) M1 설계 재정리(project-dependency를 base 설계로 확정, `test.beforeAll` fallback 전면 삭제 — Playwright 공식 문서 + `1.62.1` 재현으로 확인됨), (5) capture-evidence 2파일 EXPECTED-SKIP 명시 + lint/format 사전 위반(3건, `pnpm lint` 0건/`pnpm format:check` 3건 — plan-phase 실측, `plan.md` §D 인용) vs 신규 위반 구분, (6) `plan.md`의 낡은 AC 개수 표기 정정 — 모두 spec.md v0.1.2 HISTORY에 상세 기록. AC 12개 → 15개(013/014/015a/015b 신규), REQ 10개 불변. 기존 AC 판정 기준 완화 없음(모두 강화/정밀화).
- **Better Auth 엔드포인트 실측**: `node_modules/better-auth@1.7.1` 소스에서 `POST /api/auth/sign-in/email`, `GET /api/auth/get-session`(응답 `{ session, user }`) 직접 확인 — AC-E2EAUTH-014/015a/015b의 검증 메커니즘 근거.
- **plan-auditor iteration-3 (v0.1.2 대상, 코디네이터 보고 기준)**: **PASS, 종합 점수 0.92** — iteration-1 0.71(FAIL) → iteration-2 0.86 → iteration-3 0.92로 단조 개선, 어떤 단계에서도 회귀 없음. Must-pass 기준 7개 전원 PASS. 코디네이터가 보고한 바에 따르면 이 SPEC이 v0.1.2에서 주장한 6개 범주 전체(무변경 검증 기준선/auth-setup 무재시도 세분화/storageState 재생성 실측/M1 base 설계 확정/capture-evidence EXPECTED-SKIP·lint-format 구분/문서 정합)를 감사자가 실측 인용 증거(`$SPEC_START_SHA` 조상 관계, Better Auth 엔드포인트 소스, `pnpm format:check`/`pnpm lint` 출력 등)로 직접 재현해 독립 검증했다고 한다. 이 재감사 자체는 오케스트레이터/plan-auditor가 수행한 것으로, manager-spec인 이 세션이 직접 실행·재현한 것이 아니다 — 코디네이터의 보고를 있는 그대로 기록하며 임의로 부풀리지 않는다(`verification-claim-integrity.md` §1.1 — 관측되지 않은 검증 주장 금지, 이 항목은 "코디네이터가 보고했다"는 사실을 정확히 그 범위로 기록).
  - **D9 (major, non-blocking, run-phase로 이월)**: `plan.md:44-50`/`spec.md:96`의 "Playwright project-dependency가 1.62.1의 `--spec` 필터에서도 정상 동작한다"는 주장이 문서 내 인용이나 재현 출력 없이 서술되어 있다는 지적 — 이 SPEC의 다른 모든 사실 주장과 달리 근거가 누락됨. 감사자 권고에 따라 **지금(plan-phase) 고치지 않는다** — run-phase M1의 실제 첫 행동으로 이월하며, 조용히 잊혀지지 않도록 여기 명시적으로 기록한다.
  - **D10 (minor, cosmetic)**: `spec.md`/`acceptance.md`/`plan.md`의 "두 파일 55-56번째 줄 부근" 인용이 `capture-evidence-round5.spec.ts`의 실제 위치(52번째 줄, `capture-evidence.spec.ts`는 56번째 줄)와 달랐던 것을 이번 커밋에서 3개 파일 모두 정정했다 — 실측 재확인(`grep -n "test.skip"` 두 파일).
- **Implementation Kickoff Approval**: 아직 수행되지 않음 — run-phase 진입 전 필수. plan-auditor PASS(0.92)는 이 승인 게이트를 대체하지 않는다(`orchestration-mode-selection.md` Implementation Kickoff Approval mandatory-restoration policy).

_<이하 §E.4는 sync-phase에서 채워짐>_

## §E.2 Run-phase Evidence

> **[v0.1.3 보완, 외부 구현 검토 HEAD `e97dac2` 대상]** 외부 구현 검토가 지적한 누락(계정 검증이 `auth.setup.ts`에 영구 코드로 남지 않고 M6 전용 임시 테스트로만 존재)을 보완한 커밋이다. 아래 §E.2 본문 중 "실행 환경"부터 AC-E2EAUTH-014까지는 **`e97dac2` 시점(v0.1.2)의 기록으로 그대로 보존**한다 — 그 시점의 사실이었고 지금도 유효하다. **AC-E2EAUTH-015a/015b 절만 이번 보완에서 재작성**했다: 과거 절차(M6 검증 전용으로 임시 계정-검증 테스트 코드를 추가했다가 검증 후 제거하는 방식)는 **[HISTORICAL — v0.1.2, 임시 코드 기반, 대체됨]**으로 표시해 구분하고, 그 아래에 **이번 커밋의 상시 검증**(임시 코드가 아니라 `e2e/auth.setup.ts`에 영구히 남는 코드) 증거를 추가했다. 나머지 절(AC-001~014, lint/format/build)도 이번 보완 작업 중 실제로 재실행해 재확인했으며, 새 회차 결과를 §E.2 하단에 추가하고 §E.3의 최종 SHA·push 상태·잔여 부채를 갱신한다.

### 실행 환경 (v0.1.2, `e97dac2` 시점)

`.claude/worktrees/agent-a42ca4696a50e5b1e`(격리 세션 워크트리)에서 실행. 브랜치는 origin `plan/SPEC-E2E-AUTH-STATE-001`(HEAD `1e1847d656f75c0532326d5c1d3d1ee24f2634b6`)로 fast-forward 정렬 후 구현. `pnpm install`로 의존성 설치, Playwright `1.62.1` + Chromium 브라우저 확인.

### 실행 환경 (v0.1.3 보완, 이번 커밋)

메인 체크아웃(`plan/SPEC-E2E-AUTH-STATE-001`, 브랜치 HEAD `e97dac2`)에서 직접 실행 — 별도 워크트리 격리 없음. `pnpm test:e2e` 5회 연속 + `--spec` 필터 2회 + lint/format:check/build를 모두 이번 세션에서 실측 재실행했다(아래 각 AC 절 참고).

### 구현 산출물 (계획된 5개 파일, 전부 구현)

| 파일 | 상태 |
|------|------|
| `e2e/storage-state-paths.ts` | 신규 |
| `e2e/auth.setup.ts` | 신규 |
| `playwright.config.ts` | 수정(setup + chromium-authed project 추가) |
| `e2e/case-input-mobile-layout.spec.ts` | 수정(storageState 전환) |
| `e2e/tenant-isolation.spec.ts` | 수정(storageState 전환) |

### D9 close-out (M1 첫 행동, plan-auditor D9 이월 사항)

**Claim**: Playwright project-dependency(`dependencies: ["setup"]`)가 `scripts/run-e2e.ts`의 `--spec=<filter>` 패스스루와 실제로 호환된다.

**Evidence** — 구현 완료 후 실제 진입점과 동일한 필터링 방식으로 라이브 미니멀 재현(문서 인용 대신 실측 선택):

```
$ pnpm exec playwright test --list tenant-isolation
Listing tests:
  [setup] › auth.setup.ts:62:5 › TESTER_A 로그인 후 storageState 저장
  [setup] › auth.setup.ts:66:5 › TESTER_B 로그인 후 storageState 저장
  [chromium-authed] › tenant-isolation.spec.ts:30:7 › Tenant Isolation — AC-RUNTIME-014 › 테스터 B는 테스터 A가 소유한 사건 상세에 접근할 수 없다
Total: 3 tests in 2 files

$ pnpm exec playwright test --list case-input-mobile-layout
Listing tests:
  [setup] › auth.setup.ts:62:5 › TESTER_A 로그인 후 storageState 저장
  [setup] › auth.setup.ts:66:5 › TESTER_B 로그인 후 storageState 저장
  [chromium-authed] › case-input-mobile-layout.spec.ts:28:7 › ... › 모바일 뷰포트별 Footer 줄바꿈/겹침/오버플로 검증(단일 세션)
Total: 3 tests in 2 files

$ pnpm exec playwright test --list   # 필터 없음, 전체
Total: 23 tests in 10 files   # case-input-mobile-layout/tenant-isolation은 [chromium-authed]에서만 나타나고 [chromium]에서 중복되지 않음
```

**Baseline-attribution**: 이 run, `IMPL_COMPLETE_HEAD` 이전 작업 트리(구현 완료 직후) 대상.

**결론**: `--spec=<filter>`가 setup 프로젝트 테스트 파일 자체와 매칭되지 않아도, 그 setup에 의존하는 대상 project가 실행 대상에 포함되는 한 setup은 실행된다 — plan.md §C M1의 base 설계 전제가 실측으로 재확인됨. D9 해소.

### AC-E2EAUTH-003 — 5회 연속 실행 무재시도 (setup 단계 포함)

**Claim**: 클린 트리에서 `pnpm test:e2e`를 5회 연속 실행할 때, `auth.setup.ts`(setup 자신)/`case-input-mobile-layout.spec.ts`/`tenant-isolation.spec.ts` 3항목 모두 5회 전부 1차 시도 통과.

**Evidence** — 5회 각각의 Playwright `list` 리포터 출력에서 대상 3항목 행 발췌(재시도 표시 `(retry #N)` 없음 = 1차 시도 통과):

| 회차 | setup(TESTER_A) | setup(TESTER_B) | case-input-mobile-layout | tenant-isolation | 회차 전체 결과 |
|------|------------------|------------------|---------------------------|-------------------|----------------|
| 1 | 1차 시도 통과 (804ms) | 1차 시도 통과 (492ms) | 1차 시도 통과 (730ms) | 1차 시도 통과 (308ms) | exit 0, 12 passed / 1 flaky(case-flow, out-of-scope) / 10 skipped |
| 2 | 1차 시도 통과 (689ms) | 1차 시도 통과 (450ms) | 1차 시도 통과 (668ms) | 1차 시도 통과 (279ms) | exit 0, 동일 |
| 3 | 1차 시도 통과 (911ms) | 1차 시도 통과 (573ms) | 1차 시도 통과 (922ms) | 1차 시도 통과 (373ms) | exit 0, 동일 |
| 4 | 1차 시도 통과 (889ms) | 1차 시도 통과 (500ms) | 1차 시도 통과 (657ms) | 1차 시도 통과 (301ms) | exit 0, 동일 |
| 5 | 1차 시도 통과 (745ms) | 1차 시도 통과 (489ms) | 1차 시도 통과 (656ms) | 1차 시도 통과 (287ms) | exit 0, 동일 |

**Baseline-attribution**: 5회 모두 `IMPL_COMPLETE_HEAD` 직전 작업 트리(구현 완료, temp 검증 코드 삽입 전) 대상, 각 회차 독립 실행(매 회 `resetE2EDatabase()`로 DB 초기화 + 테스터 재프로비저닝).

**판정**: 3항목 × 5회 = 15칸 전부 "1차 시도 통과" → **PASS**. setup이 재시도 후 통과한 회차는 0건.

**잔여 위험**: out-of-scope `case-flow.spec.ts`는 5회 전부 1차 시도 실패 → retry #1 통과(flaky)로 재현됐다 — 이는 spec.md §5가 명시한 기존에도 존재하던 잔여 위험이며, 이 SPEC의 대상 파일이 아니고 AC-E2EAUTH-004는 "무재시도"가 아니라 "통과(재시도 허용)"만 요구하므로 이 AC의 판정에 영향 없음. **이 잔여 위험을 § 잔여 부채(Residual Debt)에 정식으로 기록한다(v0.1.3, 아래 참고) — "잔여 부채 없음"으로 뭉뚱그리지 않는다.**

### AC-E2EAUTH-003 재확인 (v0.1.3 보완, `e2e/auth.setup.ts`에 상시 계정 검증 코드 추가 후 5회 재실행)

**Claim**: `e2e/auth.setup.ts`에 저장 직후 `GET /api/auth/get-session` 상시 검증 코드를 추가한 뒤에도, 클린 트리에서 `pnpm test:e2e`를 5회 연속 실행할 때 3항목(setup 자신/`case-input-mobile-layout.spec.ts`/`tenant-isolation.spec.ts`) 모두 5회 전부 1차 시도 통과가 유지된다(새 검증 코드가 setup 시간을 늘려 rate-limit이나 타이밍에 새로운 flaky를 유발하지 않음을 확인).

**Evidence** — 5회 각각의 Playwright `list` 리포터 출력에서 대상 3항목 행 발췌:

| 회차 | setup(TESTER_A) | setup(TESTER_B) | case-input-mobile-layout | tenant-isolation | 회차 전체 결과 |
|------|------------------|------------------|---------------------------|-------------------|----------------|
| 1 | 1차 시도 통과 (1.0s) | 1차 시도 통과 (573ms) | 1차 시도 통과 (662ms) | 1차 시도 통과 (303ms) | exit 0, capture-evidence 10개 EXPECTED-SKIP, case-flow retry #1 통과 |
| 2 | 1차 시도 통과 (819ms) | 1차 시도 통과 (524ms) | 1차 시도 통과 (601ms) | 1차 시도 통과 (311ms) | exit 0, 동일 |
| 3 | 1차 시도 통과 (834ms) | 1차 시도 통과 (528ms) | 1차 시도 통과 (683ms) | 1차 시도 통과 (309ms) | exit 0, 동일 |
| 4 | 1차 시도 통과 (791ms) | 1차 시도 통과 (533ms) | 1차 시도 통과 (645ms) | 1차 시도 통과 (262ms) | exit 0, 동일 |
| 5 | 1차 시도 통과 (710ms) | 1차 시도 통과 (425ms) | 1차 시도 통과 (674ms) | 1차 시도 통과 (276ms) | exit 0, 동일 |

**Baseline-attribution**: 5회 모두 이번 커밋(작업 트리, `e97dac2` + `e2e/auth.setup.ts` 상시 검증 코드 추가분) 대상, 메인 체크아웃에서 각 회차 독립 실행(매 회 DB 초기화 + 테스터 재프로비저닝). 로그 원문: `.moai/state/verify/e2e-auth-state-001/run{1..5}.log`.

**Gaps**: 없음 — 5회 모두 실제로 실행하고 리포터 출력을 직접 관측했다.

**판정**: 3항목 × 5회 = 15칸 전부 "1차 시도 통과" → **PASS 유지**. 상시 계정 검증 추가가 무재시도 요건에 영향을 주지 않았다.

### AC-E2EAUTH-004 — 전체 스위트 회귀 없음 + capture-evidence 예상 스킵

**Evidence**: 5회 모두 `capture-evidence.spec.ts`·`capture-evidence-round5.spec.ts`(총 10개 테스트)가 EXPECTED-SKIP(리포터의 `-` 마크)으로 나타났고, `auth.spec.ts`/`comparison-docs-images.spec.ts`/`mobile-drawer-focus.spec.ts`/`sidebar-sticky.spec.ts`/`case-flow.spec.ts`(retry 허용)는 5회 모두 통과, 매 회 exit 0.

**판정**: PASS.

**재확인(v0.1.3 보완)**: 상시 계정 검증 추가 후 재실행한 5회(`run1.log`~`run5.log`) 각각에서 `grep -cE "^\s*-\s+[0-9]"`로 EXPECTED-SKIP 라인 수를 세면 5회 전부 정확히 `10`, `grep -cE "✘"`로 1차 실패 라인 수를 세면 5회 전부 정확히 `1`(case-flow, retry로 회복) — 회귀 없음. **판정**: PASS 유지.

### AC-E2EAUTH-001/002/008/010 — 정적/구조 확인

```
$ grep -n "loginAsTester" e2e/case-input-mobile-layout.spec.ts e2e/tenant-isolation.spec.ts
(빈 출력, exit=1)   # AC-E2EAUTH-002 PASS

$ grep -n "import.meta" e2e/storage-state-paths.ts e2e/auth.setup.ts e2e/case-input-mobile-layout.spec.ts e2e/tenant-isolation.spec.ts
(빈 출력, exit=1)   # AC-E2EAUTH-010 PASS

$ node -e "... JSON.parse(readFileSync('.tmp/storageState-tester-a.json'))..."
tester-a top-level keys: [ 'cookies', 'origins' ]   cookies count: 1   origins count: 0
tester-b top-level keys: [ 'cookies', 'origins' ]   cookies count: 1   origins count: 0
# AC-E2EAUTH-001 구조 확인 PASS(유효 storageState 형식 + 세션 쿠키 보유; 원문 쿠키 값은 기록하지 않음)
```

AC-E2EAUTH-008은 D9 섹션의 `--spec=<filter>` 재현 + 아래 AC-E2EAUTH-015b의 필터링된 실행 exit 0 결과로 확인됨(실제 진입점을 통한 env 상속 확인).

### AC-E2EAUTH-005/007/009/011/012/013 — 무변경(커밋 기준) 검증

`$SPEC_START_SHA=1d480eaac2e0b53e0a5f0080baf14a596f09f533`, `$IMPL_COMPLETE_HEAD=bed08d2`(최종 구현 완료 HEAD — comment 표현 수정 후) 기준:

```
=== AC-005 e2e/helpers.ts ===        (git diff --stat 빈 결과, git status --short 빈 결과) → PASS
=== AC-007a e2e/mobile-drawer-focus.spec.ts ===   (git diff --stat 빈 결과, git status --short 빈 결과) → PASS
=== AC-007b grep -c "retries: 2" playwright.config.ts ===   1 → PASS
=== AC-007c grep -c "workers: 1" playwright.config.ts ===   1 → PASS
=== AC-007d webServer 블록 diff($SPEC_START_SHA vs $IMPL_COMPLETE_HEAD) ===   빈 결과(exit 0) → PASS
=== AC-009 (e2e/, playwright.config.ts, scripts/, .moai/ 외부) ===   (git diff --stat 빈 결과, git status --short 빈 결과) → PASS
=== AC-011 e2e/auth.spec.ts ===      (git diff --stat 빈 결과, git status --short 빈 결과) → PASS
=== AC-012 (case-flow/sidebar-sticky/capture-evidence×2/comparison-docs-images) ===   (양쪽 모두 빈 결과) → PASS
=== AC-013 scripts/ 전체 ===          (git diff --stat 빈 결과, git status --short 빈 결과) → PASS
```

### AC-E2EAUTH-006 — storageState 미커밋 + gitignore 커버리지

```
$ git status --porcelain -- .tmp/          → (빈 출력, exit 0)
$ git check-ignore -v .tmp/storageState-tester-a.json .tmp/storageState-tester-b.json
.gitignore:108:*.tmp   .tmp/storageState-tester-a.json
.gitignore:108:*.tmp   .tmp/storageState-tester-b.json
```

**판정**: PASS. (커밋 이력에 `storageState-*.json` 추가된 적 없음 — `git log --stat "$SPEC_START_SHA".. -- .tmp/` 대상 커밋 2건 모두 위 5개 SPEC 파일만 포함.)

### AC-E2EAUTH-014 — `/sign-in` 네트워크 요청 횟수(테스터당 정확히 1회)

**Evidence**: `signInHits === 1`의 `expect()` 단언이 `e2e/auth.setup.ts`의 TESTER_A/TESTER_B 두 테스트 블록 모두에서 5회 연속 실행 + 015a/015b 3회 추가 실행(총 8회 invocation × 2 테스터 = 16회 테스트 실행) 전부 통과. 이 카운트는 정수이며 쿠키·토큰을 포함하지 않는다.

**판정**: PASS.

**[개정 v0.1.3]** 구현 코드(`page.on("request", ...)`를 `page.goto("/login")` 이전에 등록)는 처음부터 이렇게 작성되어 있었다 — 실패 요청도 계수하기 위함이다. `acceptance.md` AC-E2EAUTH-014의 문구가 실제 구현과 다르게 `page.on("requestfinished", ...)`로 잘못 기술되어 있던 것을 이번 커밋에서 정정했다(외부 구현 검토 지적). 코드 변경 없음, 문서만 실제 구현에 맞춰 정정. 재확인 5회(run1~5) + 필터 2회(filterA/filterB) 전부에서 TESTER_A/TESTER_B 각 `signInHits === 1` 단언 통과(exit 0으로 간접 확인 — 실패 시 그 실행 자체가 실패한다).

### AC-E2EAUTH-015a — storageState 재생성 실측: leftover 파일 + 전체 스위트

**[HISTORICAL — v0.1.2, `e97dac2` 이전 기록, 대체됨]** 아래 절차는 M6 검증 전용으로 `GET /api/auth/get-session` 계정 검증 테스트를 **임시로 추가했다가 확인 후 제거**하는 방식이었다 — 외부 구현 검토가 지적한 누락이 바로 이것이다(계정 검증이 코드에 상시로 남지 않음). 수치는 그 시점의 실측 기록으로 보존만 한다.

**절차(HISTORICAL)**: run 5 종료 직후(leftover 상태, 삭제하지 않음) 두 파일의 SHA-256/mtime을 기록 → 두 대상 파일에 TEMP 계정 검증 테스트(`GET /api/auth/get-session` 호출 + `user.email` 비교)를 임시 추가 → `pnpm test:e2e`(전체 스위트) 1회 실행 → 재측정 → TEMP 테스트 제거(git diff로 순수 wording 변경만 남았음을 확인).

| | mtime(leftover) | mtime(재실행 후) | SHA-256(leftover, 앞 12자) | SHA-256(재실행 후, 앞 12자) | 계정 일치(TEMP 테스트) |
|---|---|---|---|---|---|
| tester-a | 1788850787 | 1788851310 | `744fc6f044ec` | `fad8dc505e07` | PASS (TESTER_A_EMAIL 일치) |
| tester-b | 1788850788 | 1788851310 | `3bc0ee35fc9b` | `c100c53232fa` | PASS (TESTER_B_EMAIL 일치) |

**[개정 v0.1.3 — 상시 검증으로 재작성, 이번 커밋]** `e2e/auth.setup.ts`가 저장 직후 새 컨텍스트로 `GET /api/auth/get-session`을 호출하고 `user.email`을 단언하는 코드를 **영구적으로** 갖게 되었으므로, 이 AC의 계정-검증 부분은 더 이상 별도 임시 테스트가 필요 없다 — 매 실행의 `exit 0` 자체가 그 실행에 포함된 두 테스터 모두의 계정 검증이 통과했다는 직접 증거다(계정이 어긋나면 setup의 `expect(body.user?.email).toBe(email)`이 실패해 그 실행은 exit 0에 도달하지 못한다).

**절차(v0.1.3)**: 위 §E.2 AC-003 재확인 섹션의 run1(전체 스위트, 최초) → run2(파일을 삭제하지 않은 채 leftover 상태로 재실행) 두 회차를 그대로 이 AC의 leftover 절차로 재사용한다.

| | mtime(run1, leftover) | mtime(run2, 재실행 후) | SHA-256(run1, 앞 12자) | SHA-256(run2, 앞 12자) | run2 종료 상태 |
|---|---|---|---|---|---|
| tester-a | 1788913413 | 1788913705 | `b7d5c4cdef9f` | `42f9010df9bc` | exit 0 (setup 내장 계정 검증 통과 포함) |
| tester-b | 1788913413 | 1788913705 | `a7a3ef24bf74` | `83a06af97096` | exit 0 (동일) |

**판정**: mtime 갱신 + 해시 변경 + run2 exit 0(= setup 상시 계정 검증 통과, 교차오염 없음) 3가지 모두 확인 → **PASS**. (원문 쿠키·세션 값은 어떤 기록에도 남기지 않음 — 해시/mtime/exit code만 기록. 로그 원문: `run1.log`, `run2.log`.)

### AC-E2EAUTH-015b — storageState 재생성 실측: leftover 파일 + `--spec` 필터 개별 실행

**[HISTORICAL — v0.1.2, `e97dac2` 이전 기록, 대체됨]** AC-E2EAUTH-015a와 동일한 사유로 TEMP 테스트 기반이었다. 수치는 보존만 한다.

**절차(HISTORICAL, TESTER_A / case-input-mobile-layout 레그)**: 015a 실행 직후 leftover(tester-a) 기록 → `case-input-mobile-layout.spec.ts`에만 TEMP 계정 검증 테스트 추가 → `pnpm test:e2e -- --spec=case-input-mobile-layout` 실행(exit 0, 4 tests passed — setup 2개 + 대상 1개 + TEMP 1개) → 재측정 → TEMP 제거.

| | mtime(leftover) | mtime(재실행 후) | SHA-256(leftover, 앞 12자) | SHA-256(재실행 후, 앞 12자) | 계정 일치 |
|---|---|---|---|---|---|
| tester-a | 1788851310 | 1788851649 | `fad8dc505e07` | `f8e7303138cb` | PASS |

**절차(HISTORICAL, TESTER_B / tenant-isolation 레그)**: 위 레그가 남긴 leftover(tester-b) 기록 → `tenant-isolation.spec.ts`에만 TEMP 계정 검증 테스트 추가 → `pnpm test:e2e -- --spec=tenant-isolation` 실행(exit 0, 4 tests passed) → 재측정 → TEMP 제거.

| | mtime(leftover) | mtime(재실행 후) | SHA-256(leftover, 앞 12자) | SHA-256(재실행 후, 앞 12자) | 계정 일치 |
|---|---|---|---|---|---|
| tester-b | 1788851649 | 1788851724 | `a9daa5af1f3b` | `4277dc2bc9d3` | PASS |

**[개정 v0.1.3 — 상시 검증으로 재작성, 이번 커밋]** TEMP 테스트 없이, run5(전체 스위트, 5회차 — leftover 기준) 이후 `--spec=case-input-mobile-layout`와 `--spec=tenant-isolation`을 순차 실행했다. 두 필터 실행 모두 `dependencies: ["setup"]`에 의해 TESTER_A/TESTER_B 두 setup 테스트가 항상 함께 실행되므로(`plan.md` §C M1 D9 재현과 동일 메커니즘), 매 필터 실행이 두 파일 모두를 재생성하고 setup의 상시 계정 검증도 매번 통과해야 exit 0에 도달한다.

| 레그 | | mtime(leftover) | mtime(재실행 후) | SHA-256(leftover, 앞 12자) | SHA-256(재실행 후, 앞 12자) | 실행 결과 |
|---|---|---|---|---|---|---|
| `--spec=case-input-mobile-layout` | tester-a | 1788914664 | 1788915044 | `b6b879892676` | `f347158f918d` | exit 0, 3 tests passed(1차 시도) |
| `--spec=case-input-mobile-layout` | tester-b | 1788914664 | 1788915045 | `7d65471c436e` | `eed5f82838d2` | (동일 실행) |
| `--spec=tenant-isolation` | tester-a | 1788915044 | 1788915098 | `f347158f918d` | `e8733ed6503d` | exit 0, 3 tests passed(1차 시도) |
| `--spec=tenant-isolation` | tester-b | 1788915045 | 1788915099 | `eed5f82838d2` | `cf3057fcaadc` | (동일 실행) |

**판정**: 두 필터 실행 각각에서 mtime 갱신 + 해시 변경 + exit 0(= setup 상시 계정 검증 통과) 3가지 모두 성립 → **PASS**. 전체 스위트 경로에서만 재생성·계정 검증이 보장되는 회귀는 없음을 확인. 로그 원문: `filterA.log`, `filterB.log`.

### lint/format/build — 신규 위반 0건

```
$ pnpm run lint            → exit 0 (0 violations)
$ pnpm run format:check    → exit 1, 정확히 3건(app/globals.css, CHANGELOG.md, docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html) — plan.md §D 인용 사전 위반과 완전 일치, 이 SPEC 변경 파일 내 신규 위반 0건
$ pnpm run build           → exit 0
```

### lint/format/build 재확인 (v0.1.3 보완, `e2e/auth.setup.ts` 수정 후)

```
$ pnpm run lint            → exit 0 (0 violations, e2e/auth.setup.ts 포함)
$ npx eslint e2e/auth.setup.ts   → exit 0, 출력 없음
$ npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "auth.setup"   → 출력 없음(타입 오류 0건)
$ pnpm run format:check    → exit 1, 여전히 정확히 동일한 사전 위반 3건(app/globals.css, CHANGELOG.md, docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html) — 이 SPEC이 이번에 수정한 파일(e2e/auth.setup.ts, .moai/specs/SPEC-E2E-AUTH-STATE-001/{plan,acceptance}.md) 안에서 신규 위반 0건
$ pnpm run build           → exit 0(Next.js 프로덕션 빌드 성공, 위 §E.2 run1~5 각 회차의 `pnpm test:e2e`가 내부에서 수행하는 `next build`와 별개로 독립 재확인)
```

**판정**: 신규 lint/format/build 위반 0건 유지 → PASS.

### AC 전체 PASS/FAIL 매트릭스

| AC | 상태 | 근거 |
|----|------|------|
| AC-E2EAUTH-001 | PASS | storageState JSON 구조(cookies/origins) 확인 |
| AC-E2EAUTH-002 | PASS | grep 정적 확인 + 인증 화면 진입(비-리다이렉트) |
| AC-E2EAUTH-003 | PASS | 5회 × 3항목 전부 1차 시도 통과 |
| AC-E2EAUTH-004 | PASS | 5회 exit 0, EXPECTED-SKIP 정합, 나머지 5파일 통과 |
| AC-E2EAUTH-005 | PASS | helpers.ts 무변경(커밋+작업트리) |
| AC-E2EAUTH-006 | PASS | 미추적 + gitignore 커버리지 |
| AC-E2EAUTH-007 | PASS | mobile-drawer-focus 무변경 + retries/workers grep=1 + webServer 블록 diff 없음 |
| AC-E2EAUTH-008 | PASS | `--spec` 필터 실행 exit 0(D9 재현 + 015b) |
| AC-E2EAUTH-009 | PASS | e2e/playwright.config.ts/scripts//.moai 외부 무변경 |
| AC-E2EAUTH-010 | PASS | import.meta grep 빈 결과(전 4개 신규/수정 파일) |
| AC-E2EAUTH-011 | PASS | auth.spec.ts 무변경 |
| AC-E2EAUTH-012 | PASS | 나머지 5개 out-of-scope 파일 무변경 |
| AC-E2EAUTH-013 | PASS | scripts/ 전체 무변경 |
| AC-E2EAUTH-014 | PASS | signInHits===1, 16회 테스트 실행 전부 통과. **v0.1.3**: acceptance.md 문구를 실제 구현(`page.on("request", ...)`, 로그인 전 등록)에 맞춰 정정, 코드 변경 없음 |
| AC-E2EAUTH-015a | PASS | **[v0.1.3 재작성]** 계정 검증이 `auth.setup.ts` 상시 코드로 전환 — leftover 해시/mtime 변경 + run2 exit 0(= 상시 계정 검증 통과)으로 재확인 |
| AC-E2EAUTH-015b | PASS | **[v0.1.3 재작성]** 상시 코드 기준, `--spec` 필터 2레그 모두 해시/mtime 변경 + exit 0으로 재확인 |

**전체 15개 AC 전부 PASS.** 잔여 부채 1건 있음 — 아래 § 잔여 부채(Residual Debt) 참고(out-of-scope `case-flow.spec.ts`의 기존 flaky 재시도 패턴, 이 SPEC이 만든 결함 아님, 어떤 AC도 FAIL시키지 않음).

### 잔여 부채 (Residual Debt)

| 항목 | 범위 | 근거 | 판정에 미치는 영향 |
|------|------|------|---------------------|
| `e2e/case-flow.spec.ts`가 5회 연속 실행 전부에서 1차 시도 실패 → retry #1로만 회복(flaky) | 이 SPEC의 대상 파일이 아님(out-of-scope, `spec.md` §4/§5에 기존 잔여 위험으로 이미 명시) | `run1.log`~`run5.log` 5회 전부에서 동일 패턴 재현(`grep -cE "✘"` = 1, 매 회) | AC-E2EAUTH-004는 "무재시도"가 아니라 "통과(재시도 허용)"만 요구하므로 판정에 영향 없음. AC-E2EAUTH-003은 대상 3항목(setup/case-input-mobile-layout/tenant-isolation)만 채점 대상이므로 마찬가지로 영향 없음 |

이 SPEC은 위 1건 외에 알려진 잔여 부채가 없다. "잔여 부채 없음"이라는 과거 문구(v0.1.2, `e97dac2`)는 이 항목을 별도 섹션으로 명시하지 않고 AC-003 절 안의 "잔여 위험" 각주로만 남겨 두어 상위 요약에서 누락된 것으로, 이번 커밋에서 정정한다.

### 부수적 발견 및 정정

구현 중 AC-E2EAUTH-002/010의 정확한 grep 검증 명령을 실제로 재현하는 과정에서, 두 대상 스펙 파일에 추가한 설명 주석이 검증 대상 리터럴 문자열("loginAsTester")을 그대로 포함해 grep이 오탐되는 것을 발견했다. 커밋 `bed08d2`에서 주석 표현만 수정(동작 변경 없음)했다 — `verification-claim-integrity.md`가 요구하는 "실제로 실행한 명령의 검증된 출력"을 확보하는 과정에서 자체 발견한 결함이며, 사후 정정 완료.

**[v0.1.3]** 외부 구현 검토(HEAD `e97dac2`)가 지적한 누락 — AC-E2EAUTH-015a/015b의 계정 검증이 M6 전용 임시 테스트 코드(추가 후 제거)로만 존재해, `auth.setup.ts`를 단독으로 실행하거나 재사용해도 저장된 storageState 파일이 실제로 유효한지 상시로 확인할 방법이 없었다는 지적을 반영해 상시 검증 코드를 추가했다.

## §E.3 Run-phase Audit-Ready Signal

- **run_complete_at**: 2026-09-08
- **run_commit_sha**: `0db2e01` (M1-M5 구현), `bed08d2` (AC-E2EAUTH-002 grep 오탐 정정, 최종)
- **run_status**: complete
- **ac_pass_count**: 16 (15개 논리 AC, 015가 a/b 하위 시나리오 포함해 매트릭스 16행)
- **ac_fail_count**: 0
- **preserve_list_post_run_count**: 6개 PRESERVE 대상(helpers.ts, mobile-drawer-focus.spec.ts, playwright.config.ts의 workers/retries/webServer, scripts/ 전체, out-of-scope 5개 spec 파일, auth.spec.ts) 전부 무변경 확인 완료
- **l44_pre_commit_fetch**: 해당 없음 — 워크트리 격리 세션이며 원격 `plan/SPEC-E2E-AUTH-STATE-001` 브랜치와 fast-forward 정렬 후 작업, 병렬 세션 충돌 미검출
- **l44_post_push_fetch**: 아직 push 전(이 progress.md 커밋과 함께 push 예정)
- **new_warnings_or_lints_introduced**: 0
- **cross_platform_build**: Windows 환경에서 `next build`(exit 0) + `next start` + Playwright chromium 실행 전부 정상 확인. macOS/Linux 크로스 빌드는 이 SPEC 범위 밖(순수 테스트 인프라, 프로덕션 코드 무변경)
- **total_run_phase_files**: 5개(신규 2, 수정 3)
- **m1_to_mN_commit_strategy**: M1(D9 close-out, 설계 재확인)~M5(전환)를 단일 feature 커밋(`0db2e01`)으로 묶고, 검증 과정에서 발견한 주석 오탐을 별도 fix 커밋(`bed08d2`)으로 분리 — plan.md §C가 M1~M6을 순차 마일스톤으로 서술하지만 milestone 세분화는 manager-develop의 구현 재량(sprint-round-naming.md)이며, M6(검증)는 커밋 대상이 아니라 이 progress.md 자체에 기록됨

**Implementation Kickoff Approval**: 오케스트레이터가 별도 세션에서 승인 게이트를 통과시킨 후 이 위임을 발급한 것으로 전제하고 진행함(이 서브에이전트 세션 자체는 게이트를 수행하지 않음 — orchestrator-subagent 경계, `agent-common-protocol.md` §User Interaction Boundary).

### v0.1.3 보완 (외부 구현 검토 HEAD `e97dac2` 대상, 이번 커밋)

- **보완_complete_at**: 2026-09-09
- **보완_commit_sha**: `798a8b2`(코드+SPEC 문서 커밋, full: `798a8b2ff03d8fabe104127d034dee08d966cf6c`), 이 progress.md 커밋 자신은 `git log -1`로 확인 가능
- **보완_status**: complete
- **변경 파일**: `e2e/auth.setup.ts`(수정 — 상시 계정 검증 코드 추가), `.moai/specs/SPEC-E2E-AUTH-STATE-001/plan.md`(수정 — M3(3)/M6(6) 정합), `.moai/specs/SPEC-E2E-AUTH-STATE-001/acceptance.md`(수정 — AC-014/015a/015b 재작성), `.moai/specs/SPEC-E2E-AUTH-STATE-001/progress.md`(이번 커밋)
- **preserve_list_재확인**: `e2e/helpers.ts`·`e2e/auth.spec.ts`·`e2e/mobile-drawer-focus.spec.ts`·`scripts/` 전체·나머지 out-of-scope 5개 spec 파일·`playwright.config.ts`의 `workers`/`retries`/`webServer`·대상 2개 파일의 로그인 이후 assertion 전부 무변경 확인(커밋 diff 빈 결과 + 작업 트리 빈 결과, `e2e/case-input-mobile-layout.spec.ts`/`e2e/tenant-isolation.spec.ts`에 대한 `git diff --stat HEAD` 빈 결과로 로그인 이후 코드 무변경 직접 확인)
- **재실행 검증**: `pnpm test:e2e` 5회 연속(신규) + `--spec` 필터 2회(신규) + `pnpm lint`/`pnpm run format:check`/`pnpm run build` 재실행 — 위 §E.2 각 AC 절 "v0.1.3" 표기 참고
- **l44_post_push_fetch**: 이 progress.md 커밋과 함께 push 완료(§E.2 상단 및 아래 최종 SHA 참고 — 과거 "아직 push 전" 문구는 이번 커밋으로 대체됨)
- **잔여 부채**: 1건(§E.2 잔여 부채 섹션 참고 — `case-flow.spec.ts` 기존 flaky, out-of-scope, 판정 영향 없음)

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
