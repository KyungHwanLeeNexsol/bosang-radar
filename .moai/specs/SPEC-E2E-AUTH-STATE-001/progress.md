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

## §E.2b 독립 감사 (v0.1.5, HEAD `167c71b` 대상)

**감사 범위와 방법**: 기존 이 문서·`acceptance.md`의 PASS 표기와 `[x]` 체크박스 자체는 증거로 채택하지 않고, `spec.md` REQ-001~010 / `plan.md` M1~M6 / `acceptance.md` AC-001~015(a/b)를 실제 코드(`e2e/auth.setup.ts`, `e2e/storage-state-paths.ts`, `playwright.config.ts`, `e2e/case-input-mobile-layout.spec.ts`, `e2e/tenant-isolation.spec.ts`, `e2e/helpers.ts`, `lib/auth/config.ts`, `node_modules/better-auth@1.7.1` 소스)와 처음부터 직접 대조했다. 검토 기준선 SHA(`1d480eaac2e0b53e0a5f0080baf14a596f09f533`)와 외부 검토 HEAD(`167c71be25ae71391bbf44e8e569e6c4b850e28b`)가 감사 시작 시점의 실제 HEAD와 일치함을 `git log`/`git status`로 먼저 확인했다(추가 변경 없음 — 감사 대상은 정확히 그 커밋).

### REQ ↔ 구현 독립 재대조

| REQ | 요구사항 요지 | 코드 위치 | 검증 근거(직접 실행/실측) | 판정 |
|-----|---------------|-----------|---------------------------|------|
| REQ-E2EAUTH-001 | setup에서 TESTER_A/B 각 1회 로그인 + storageState 저장 | `e2e/auth.setup.ts` 2개 `test()` 블록 | run1~5/filterA/filterB(7회) 전부 setup 2개 테스트 성공, `.tmp/storageState-tester-{a,b}.json`이 `{cookies, origins}` 구조로 존재(직접 `node -e`로 JSON 파싱 확인) | PASS |
| REQ-E2EAUTH-002 | 대상 2개 파일이 `loginAsTester()` 대신 storageState 재사용 | `case-input-mobile-layout.spec.ts`/`tenant-isolation.spec.ts`의 `test.use({ storageState })` | `grep -n "loginAsTester"` 두 파일 빈 결과(직접 재실행, exit 1) | PASS |
| REQ-E2EAUTH-003 | 대상 2개 파일 제외 다른 `e2e/*.spec.ts`의 로그인 동작 무변경 | 나머지 8개 spec 파일 소스 | `git diff --stat $SPEC_START_SHA 167c71b`가 8개 파일 전부 빈 결과(소스 레벨 무변경) — **단, `case-flow.spec.ts`의 실행 시점 rate-limit 충돌 여부는 소스 무변경과 별개 사안임을 아래 § case-flow 회귀 조사에서 별도로 다룬다** | PASS(소스 레벨) — 실행 결과 회귀는 별도 항목 |
| REQ-E2EAUTH-004 | `e2e/helpers.ts` 무변경 | — | `git diff --stat` 빈 결과 | PASS |
| REQ-E2EAUTH-005 | `workers`/`retries`/`loginForDrawerTest` 무변경 | `playwright.config.ts`, `e2e/mobile-drawer-focus.spec.ts` | `grep -c "retries: 2"`=1, `grep -c "workers: 1"`=1, 두 파일 `git diff` 빈 결과 | PASS |
| REQ-E2EAUTH-006 | storageState 매 실행 재생성, 커밋 금지 | `e2e/auth.setup.ts`의 `storageState({ path })` | run1→run2 해시 변경(b7d5c4cdef9f→42f9010df9bc 등), `git log --all` 대상 파일 커밋 이력 없음, `.gitignore:108 *.tmp` 매칭 확인 | PASS |
| REQ-E2EAUTH-007 | `--spec` 필터 실행에서도 setup 의존성 수행 | `playwright.config.ts` `dependencies: ["setup"]` | filterA.log/filterB.log 둘 다 setup 2개 테스트 포함, exit 0 | PASS |
| REQ-E2EAUTH-008 | 대상 2개 파일의 기존 단언·시나리오 무변경 | 두 파일 본문 | `git diff $SPEC_START_SHA 167c71b`로 직접 확인 — 변경분은 import/`test.use`/`loginAsTester` 호출 제거뿐, 테스트 본문·단언 라인은 문자 그대로 동일 | PASS |
| REQ-E2EAUTH-009 | `e2e/`·`playwright.config.ts`·`scripts/` 외부 애플리케이션 코드 무변경 | — | 원래 pathspec으로 재실행 시 `CHANGELOG.md`가 비어 있지 않은 diff로 나타남을 발견(sync-phase가 추가) — REQ 문언("애플리케이션/프로덕션 코드")상 `CHANGELOG.md`는 대상 아님이 명백하여 `acceptance.md` AC-009 pathspec에 `':!CHANGELOG.md'` 추가로 정정. 정정된 pathspec으로는 빈 결과 | PASS(정정 후) |
| REQ-E2EAUTH-010 | storageState 경로 상수가 `import.meta` 미사용 leaf 모듈 | `e2e/storage-state-paths.ts` | `grep -n "import.meta"` 4개 관련 파일 전부 빈 결과(직접 재실행) | PASS |

AC-001~015(a/b)는 위 REQ 대조와 § E.2(각 AC 절, 이번 감사에서 실행 로그 원문으로 재확인)·§ E.2b 실행 증거 재검토가 함께 뒷받침한다 — 개별 AC 재확인 결과가 기존 판정과 다른 유일한 항목은 AC-E2EAUTH-004의 잔여 부채 서술(case-flow, 아래)과 AC-E2EAUTH-009(pathspec, 위)이며, 나머지 13개 AC는 재대조 후에도 동일하게 PASS다.

### 실행 증거 재검토 — 재사용 vs 재실행

| 대상 | 처리 | 근거 |
|------|------|------|
| run1~5.log, filterA/B.log의 setup A/B·대상 2개 파일 1차 시도/재시도 여부 | **재사용**(원본 로그 재확인) | 로그가 존재하고, 로그를 만든 코드 버전(`798a8b2`)이 현재 HEAD(`167c71b`)의 `e2e/`·`playwright.config.ts`와 `git diff --stat`로 완전히 동일함을 확인(§E.2 상단) — 버전 불일치 없음 |
| leftover 해시·mtime 변경(run1→run2, run5→filterA→filterB) | **재사용**(직접 관측한 1차 값) | 커맨드 실행 결과를 이 세션이 직접 관측·기록한 값이며 재실행해도 달라질 성질의 증거가 아님(해시/mtime은 실행 시점의 사실) |
| `pnpm test`/`pnpm lint`/`pnpm build`/`pnpm format:check` | **재사용**(sync-phase 재실행 로그, 코드 무변경 확인 후) | 이번 감사에서 코드 변경이 없었으므로(§E.2b 결론) 재실행 불필요 — 단 CHANGELOG.md 문서 정정 후 아래 "sync 필수 검증 재확인"에서 1회 더 재실행해 회귀 없음을 확인 |
| `case-flow.spec.ts`의 베이스라인 대비 회귀 여부 | **신규 재실행**(격리 워크트리 3회) | 기존 로그만으로는 "베이스라인에서도 그랬는지"를 판단할 수 없어(베이스라인 실행 기록이 없었음) 아래 § case-flow 회귀 조사에서 별도로 수행 |

### § case-flow 회귀 조사 (v0.1.5)

**배경**: `spec.md` §1 WHY와 이 문서의 과거 기록은 SPEC 시작 시점의 flaky 대상을 `case-input-mobile-layout.spec.ts`/`tenant-isolation.spec.ts` 2개 파일로 명시했다 — `case-flow.spec.ts`는 baseline 문서 어디에도 flaky로 언급되지 않는다. 그런데 이번 SPEC 구현 이후 `case-flow.spec.ts`가 5회 연속 실행 전부에서 1차 시도 실패 → retry #1로 회복하는 패턴을 보였고(§E.2 AC-003 재확인 표), 과거 기록은 이를 "이 SPEC의 대상 파일이 아닌 기존 잔여 위험"으로만 서술했다 — `case-flow.spec.ts` 소스 자체는 무변경(§ REQ-003)이므로 그 서술은 일견 타당해 보이지만, **소스 무변경이 곧 실행 결과(타이밍) 무변경을 의미하지 않는다**는 점이 검증되지 않은 채 넘어갔다.

**조사 방법**: `git worktree add`로 `$SPEC_START_SHA`(`1d480eaac2e0b53e0a5f0080baf14a596f09f533`, storageState 도입 이전 코드)를 별도 워크트리에 격리(`pnpm install` 후 동일 `pnpm test:e2e` 진입점)해, 현재 코드와 **동일한 실행 조건**(같은 머신, 같은 DB 리셋, 같은 rate-limit 설정)에서 3회 연속 실행하고 결과를 비교했다.

| 대상 | 베이스라인(`$SPEC_START_SHA`, 3회) | 현재(`167c71b`, 5회 전체 + 필터 2회 = 7회) |
|------|-------------------------------------|----------------------------------------------|
| `case-flow.spec.ts` | **3/3 1차 시도 통과**(재시도 0건) | **5/5(전체 스위트 실행) 1차 시도 실패 → retry #1로 회복** |
| `case-input-mobile-layout.spec.ts` | **3/3 1차 시도 실패 → retry #1로 회복**(당시 `loginAsTester` 직접 호출) | **[v0.1.6 정정 — 과잉 집계였음] 6/6 1차 시도 통과**(재시도 0건) — 전체 스위트 5회 + 이 파일을 포함하는 `--spec=case-input-mobile-layout` 필터 1회 = 6회. `--spec=tenant-isolation` 필터에는 이 파일이 포함되지 않으므로 그 실행은 계수하지 않는다(과거 "7/7"은 "독립 실행 7회"와 "이 파일이 등장하는 실행 횟수"를 혼동한 과잉 집계였다) |
| `tenant-isolation.spec.ts` | **3/3 1차 시도 실패 → retry #1로 회복**(당시 `loginAsTester` 직접 호출) | **[v0.1.6 정정 — 과잉 집계였음] 6/6 1차 시도 통과**(재시도 0건) — 전체 스위트 5회 + `--spec=tenant-isolation` 필터 1회 = 6회(`--spec=case-input-mobile-layout` 필터는 계수하지 않음, 사유는 위와 동일) |
| 매 실행(pnpm test:e2e 호출 단위) exit code | 3/3 exit 0 | 7/7 exit 0 — 이 행만 "독립 실행 7회" 단위(전체 스위트 5회 + 필터 2회)이며, 위 두 파일의 등장 횟수(6회)와는 분모가 다르다 |

로그 원문: `.moai/state/verify/e2e-auth-state-001/baseline/base{1,2,3}.log`(베이스라인), `run{1..5}.log`/`filterA.log`/`filterB.log`(현재).

**원인 특정**: 베이스라인에서는 `chromium` project 안에서 파일이 알파벳 순으로 실행되며, `case-flow.spec.ts`가 실행될 때까지 `/sign-in/email` POST는 `auth.spec.ts`의 2건(성공 1 + 거부 1, 거부도 `/sign-in/email`에 POST됨)뿐이었다 — `case-flow.spec.ts`의 로그인이 그 창 안에서 3번째 요청이었다. 현재 코드는 `e2e/auth.setup.ts`가 스위트 시작 직후 TESTER_A/TESTER_B 로그인 2건을 **추가로** 선행시키므로(**[v0.1.7 정정]** setup이 `chromium`보다 먼저 실행되는 것은 `dependencies: ["setup"]`(이 필드는 `chromium-authed`에만 선언되어 있다)로 config가 강제하는 보장이 아니라, `projects` 배열 선언 순서에 따라 관측된 Playwright 스케줄링 동작이다 — 상세: 위 §E.2c "스케줄링 의존성" 정정), `case-flow.spec.ts`가 로그인을 시도하는 시점에는 이미 setup 2건 + auth.spec 2건 = 4건의 `/sign-in/email` POST가 짧은 시간 안에 선행되어 있다 — `case-flow.spec.ts`의 로그인은 그 창 안에서 5번째 요청이 되어, Better Auth 기본 rate limit(`/sign-in` 10초 창 내 최대 3회)을 초과한다. 이 인과관계는 (a) 두 조건에서 `case-flow.spec.ts` 소스가 완전히 동일하고, (b) 실행 순서상 `case-flow.spec.ts` 앞에 새로 추가된 요청이 정확히 setup 2건뿐이며, (c) `--spec` 필터 실행(filterA/filterB, `case-flow.spec.ts`가 아예 실행되지 않는 경로)에서는 이 현상이 관측되지 않는다는 사실과 모두 정합적이다.

**결론**: `case-flow.spec.ts`의 flakiness는 "이 SPEC과 무관하게 기존부터 있던 잔여 위험"이 아니라, **이 SPEC이 도입한 setup 로그인 2건이 rate-limit 충돌 지점을 원래 대상 2개 파일에서 `case-flow.spec.ts`로 이동시킨 결과**다 — `case-flow.spec.ts` 소스는 무변경이지만 그 파일이 실행되는 **타이밍 컨텍스트**가 이 SPEC에 의해 변경됐기 때문에 나타난, 인과관계가 특정된 부작용이다. `spec.md` §5는 "setup 프로젝트 실행이 인접 스펙 파일의 rate-limit 예산을 소비할 가능성"을 일반론으로 이미 예견했고, 그 완화책으로 기존 `retries: 2` 안전망과 AC-E2EAUTH-004의 "무재시도가 아니라 통과(재시도 허용)만 요구" 판정 기준을 명시적으로 지정해 두었다 — 그 설계상 이 사실만으로 어떤 AC도 FAIL되지 않는다(AC-E2EAUTH-003의 무재시도 요건은 setup A/B + 대상 2개 파일 3항목에만 적용되고, `case-flow.spec.ts`는 그 3항목에 포함되지 않는다). 다만 "기존 flaky 패턴을 그대로 유지"라는 과거 서술은 사실과 다르므로, 이번 감사에서 "이동(shift)"으로 정정한다.

**미확인/잔여 사항**: (1) 베이스라인 3회 vs 현재 7회로 표본 크기가 다르다 — baseline 5회 재현까지는 수행하지 않았다(3회로도 100%/100% 대비가 명확해 표본을 늘려도 결론이 바뀔 가능성은 낮다고 판단했으나, 통계적으로 완전히 동일한 표본 크기는 아니다). (2) `auth.spec.ts`의 두 번째 테스트(거부된 로그인)가 실제로 `/sign-in/email`에 POST를 보내는지는 코드 리딩으로 강하게 추정했을 뿐 네트워크 레벨로 재확인하지 않았다 — 다만 (a)(b)(c)의 정합성 논거는 이 세부사항과 무관하게 성립한다. (3) rate-limit 윈도우의 정확한 슬라이딩 경계(몇 초 시점에 몇 건이 만료되는지)까지는 재현하지 않았다 — "충돌이 발생한다"는 사실은 `case-flow.spec.ts`가 실제로 실행되는 전체 스위트 5회 전부(5/5, **[v0.1.6 정정]** `case-flow.spec.ts`가 아예 실행되지 않는 `--spec` 필터 2회는 이 인과관계의 증거로 집계하지 않는다 — 존재하지 않는 실행을 "확인됨"으로 세는 것을 피하기 위함)로 확정됐으나, "정확히 몇 번째 요청부터"는 근사치다.

**후속 처리 권고 (수정하지 않음 — 범위 확장 필요)**: 이 회귀를 없애려면 (a) `case-flow.spec.ts`를 수정(이 SPEC의 PRESERVE/out-of-scope 대상 — `spec.md` §4 "다른 e2e 스펙 파일의 storageState 전환" 목록에 명시)하거나, (b) `playwright.config.ts`의 `retries`/rate-limit 관련 설정을 조정(REQ-E2EAUTH-005가 명시적으로 금지)하거나, (c) Better Auth의 rate limit 설정을 완화(spec.md §4 "프로덕션 인증 코드 변경"이 명시적으로 배제)해야 하는데, 세 경로 모두 이 SPEC의 명시적 제약을 위반한다. `e2e/auth.setup.ts`(이 SPEC이 신설한, 수정 가능한 유일한 파일)에 인위적 지연을 추가하는 방안도 검토했으나, 그 자체가 근본 원인(요청 총량 증가)을 해결하지 못하고 다른 파일로 충돌 지점을 한 번 더 이동시킬 뿐인 임시방편이라 채택하지 않았다. **따라서 이번 sync-phase에서는 코드를 수정하지 않고, 이 발견을 정확히 기록한 뒤 "스위트 시작 시점 rate-limit 충돌 근본 해결"을 후속 SPEC 후보로 남긴다.**

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

**판정**: 3항목(setup/case-input-mobile-layout/tenant-isolation) × 5회 = 15칸 전부 "1차 시도 통과" → **PASS 유지**. 상시 계정 검증 추가가 이 3항목의 무재시도 요건에 영향을 주지 않았다(전체 스위트 무재시도를 뜻하지 않음 — `case-flow.spec.ts`는 이 3항목에 포함되지 않으며 5회 전부 retry로 회복, § 잔여 부채 참고).

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

**[HISTORICAL — v0.1.2, `e97dac2` 시점 기록]** `signInHits === 1`의 `expect()` 단언이 `e2e/auth.setup.ts`의 TESTER_A/TESTER_B 두 테스트 블록 모두에서 5회 연속 실행 + 015a/015b 3회 추가 실행(총 8회 invocation × 2 테스터 = 16회 테스트 실행) 전부 통과. 이 수치는 당시(임시 코드 기반 AC-015a/015b 절차) 실행 구성에서 나온 것이며, 아래 v0.1.5 재계산과 다르다.

**[개정 v0.1.5 — 실행 횟수 재계산]** v0.1.3(상시 검증 코드 도입) 재검증은 전체 스위트 5회(run1~5) + `--spec` 필터 2회(filterA/filterB) = **독립 실행 7회**다. 이 7회 각각이 setup TESTER_A/TESTER_B 블록을 1회씩 실행하므로 setup invocation 합계는 **7 × 2 = 14회**다 — AC-E2EAUTH-015a의 leftover 재실행(run2)은 이 5회 중 2번째 실행을 그대로 재사용한 것이며 별도의 6번째 실행이 아니므로 8회로 집계하지 않는다. 이 카운트는 정수이며 쿠키·토큰을 포함하지 않는다.

**판정**: PASS.

**[개정 v0.1.3]** 구현 코드(`page.on("request", ...)`를 `page.goto("/login")` 이전에 등록)는 처음부터 이렇게 작성되어 있었다 — 실패 요청도 계수하기 위함이다. `acceptance.md` AC-E2EAUTH-014의 문구가 실제 구현과 다르게 `page.on("requestfinished", ...)`로 잘못 기술되어 있던 것을 이번 커밋에서 정정했다(외부 구현 검토 지적). 코드 변경 없음, 문서만 실제 구현에 맞춰 정정. 재확인 5회(run1~5) + 필터 2회(filterA/filterB) 전부에서 TESTER_A/TESTER_B 각 `signInHits === 1` 단언 통과(exit 0으로 간접 확인 — 실패 시 그 실행 자체가 실패한다).

### AC-E2EAUTH-015a — storageState 재생성 실측: leftover 파일 + 전체 스위트

**[HISTORICAL — v0.1.2, `e97dac2` 이전 기록, 대체됨]** 아래 절차는 M6 검증 전용으로 `GET /api/auth/get-session` 계정 검증 테스트를 **임시로 추가했다가 확인 후 제거**하는 방식이었다 — 외부 구현 검토가 지적한 누락이 바로 이것이다(계정 검증이 코드에 상시로 남지 않음). 수치는 그 시점의 실측 기록으로 보존만 한다.

**절차(HISTORICAL)**: run 5 종료 직후(leftover 상태, 삭제하지 않음) 두 파일의 SHA-256/mtime을 기록 → 두 대상 파일에 TEMP 계정 검증 테스트(`GET /api/auth/get-session` 호출 + `user.email` 비교)를 임시 추가 → `pnpm test:e2e`(전체 스위트) 1회 실행 → 재측정 → TEMP 테스트 제거(git diff로 순수 wording 변경만 남았음을 확인).

| | mtime(leftover) | mtime(재실행 후) | SHA-256(leftover, 앞 12자) | SHA-256(재실행 후, 앞 12자) | 계정 일치(TEMP 테스트) |
|---|---|---|---|---|---|
| tester-a | 1788850787 | 1788851310 | `744fc6f044ec` | `fad8dc505e07` | PASS (TESTER_A_EMAIL 일치) |
| tester-b | 1788850788 | 1788851310 | `3bc0ee35fc9b` | `c100c53232fa` | PASS (TESTER_B_EMAIL 일치) |

**[개정 v0.1.3 — 상시 검증으로 재작성]** `e2e/auth.setup.ts`가 저장 직후 새 컨텍스트로 `GET /api/auth/get-session`을 호출하고 `user.email`을 단언하는 코드를 **영구적으로** 갖게 되었으므로, 이 AC의 계정-검증 부분은 더 이상 별도 임시 테스트가 필요 없다.

**[개정 v0.1.4 — `retries: 2` 정합성 정정, sync-phase]** 매 실행의 exit 0은 **최종**(재시도 포함) 결과가 통과였다는 근거다 — `playwright.config.ts`의 `retries: 2`로 인해 `expect(body.user?.email).toBe(email)`이 첫 시도에서 실패해도 재시도가 성공하면 그 실행은 여전히 exit 0으로 끝난다("한 번이라도 실패하면 exit 0이 불가능하다"는 이전 표현은 부정확했다). 다만 계정 교차오염은 결정론적으로 재현되는 오류이므로 재시도해도 같은(잘못된) 이메일이 나오고, `retries: 2`를 모두 소진한 뒤에도 실패가 남으면 exit 0에 도달하지 못한다 — 즉 exit 0(최종)은 "계정 검증이 **결국** 통과했다"는 근거다. **최초 시도(무재시도) 여부는 별도로 확인한다**: 위 § AC-E2EAUTH-003 재확인 표(run1~5) + filterA/filterB에서 setup(TESTER_A)/setup(TESTER_B) 모두 **7회 독립 실행(14회 invocation)** 전부 reporter에 재시도 표시(`(retry #N)`) 없이 "1차 시도 통과"로 기록되어 있다(run2는 그 5회 중 2번째 실행이며 별도 실행이 아니다 — v0.1.5 재계산 참고).

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

**[개정 v0.1.3 — 상시 검증으로 재작성]** TEMP 테스트 없이, run5(전체 스위트, 5회차 — leftover 기준) 이후 `--spec=case-input-mobile-layout`와 `--spec=tenant-isolation`을 순차 실행했다. 두 필터 실행 모두 `dependencies: ["setup"]`에 의해 TESTER_A/TESTER_B 두 setup 테스트가 항상 함께 실행되므로(`plan.md` §C M1 D9 재현과 동일 메커니즘), 매 필터 실행이 두 파일 모두를 재생성하고 setup의 상시 계정 검증도 (재시도를 포함해) 최종적으로 통과해야 exit 0에 도달한다 — **[v0.1.4]** 실측으로는 두 필터 실행 모두 재시도 없이 1차 시도에서 exit 0에 도달했다(아래 표의 "실행 결과" 열).

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
| AC-E2EAUTH-014 | PASS | signInHits===1, 7회 독립 실행(14회 invocation) 전부 통과(v0.1.5 재계산 — 과거 "16회"는 임시 코드 기반 v0.1.2 절차의 수치, HISTORICAL). **v0.1.3**: acceptance.md 문구를 실제 구현(`page.on("request", ...)`, 로그인 전 등록)에 맞춰 정정, 코드 변경 없음 |
| AC-E2EAUTH-015a | PASS | **[v0.1.3 재작성]** 계정 검증이 `auth.setup.ts` 상시 코드로 전환 — leftover 해시/mtime 변경 + run2 exit 0(= 상시 계정 검증 통과)으로 재확인 |
| AC-E2EAUTH-015b | PASS | **[v0.1.3 재작성]** 상시 코드 기준, `--spec` 필터 2레그 모두 해시/mtime 변경 + exit 0으로 재확인 |

**전체 15개 AC 전부 PASS.** 잔여 부채 1건 있음 — 아래 § 잔여 부채(Residual Debt) 참고. **[v0.1.5 정정]** 이 부채는 "이 SPEC이 만든 결함 아님(기존 flaky 그대로)"이 아니라 **이 SPEC의 변경이 원인으로 특정된, rate-limit 충돌 지점의 이동**이다 — 상세 인과관계는 § case-flow 회귀 조사 참고. 어떤 AC도 FAIL시키지는 않는다(AC-E2EAUTH-004가 재시도를 허용하기 때문).

### 잔여 부채 (Residual Debt) — **[HISTORICAL, v0.1.2~v0.1.5 시점 기록, v0.1.6에서 해소됨]**

> 아래 표와 그 아래 문단은 v0.1.2~v0.1.5 시점(HEAD `798a8b2`~`167c71b`)의 실제 관측 기록이며, **그 시점의 사실로서 그대로 보존**한다. 이 부채는 **v0.1.6**(`e2e/auth.setup.ts` 10초 대기 추가)에서 해소됐다 — 현재(v0.1.7 시점) 유효한 잔여 사항은 이 섹션이 아니라 바로 아래 "§ 현재 잔여 사항(v0.1.6 이후)"을 참고한다.

| 항목 | 범위 | 근거 | 판정에 미치는 영향 |
|------|------|------|---------------------|
| `e2e/case-flow.spec.ts`가 5/5(전체 스위트) 1차 시도 실패 → retry #1로만 회복(flaky) | 이 SPEC의 대상 파일이 아님(out-of-scope, `spec.md` §4가 storageState 전환 대상에서 명시적으로 제외) — **단, 이 flaky 자체는 이 SPEC이 새로 유발한 rate-limit 충돌 이동의 결과임이 격리 베이스라인 대조로 확인됨(§ case-flow 회귀 조사)** | `run1.log`~`run5.log` 5회 전부 동일 패턴(`grep -cE "✘"` = 1, 매 회) + 격리 워크트리 베이스라인 3회 대조(베이스라인은 3/3 무재시도 통과) | AC-E2EAUTH-004는 "무재시도"가 아니라 "통과(재시도 허용)"만 요구하므로 판정에 영향 없음. AC-E2EAUTH-003의 무재시도 요건은 대상 3항목(setup/case-input-mobile-layout/tenant-isolation)만 채점 대상이므로 마찬가지로 영향 없음 — **다만 이 부채는 "이 SPEC과 무관한 기존 문제"가 아니라 "이 SPEC이 유발했으나 SPEC 제약(PRESERVE/out-of-scope) 때문에 이 SPEC 범위에서 고칠 수 없는 부작용"으로 정확히 분류해야 한다** |

이 SPEC은 위 1건 외에 알려진 잔여 부채가 없다(당시 기준). "잔여 부채 없음"이라는 v0.1.2 문구, 그리고 v0.1.2~v0.1.4가 이 항목을 "이 SPEC과 무관한 기존 flaky"로 서술한 것 모두 v0.1.5 독립 감사에서 정정했다 — 당시에는 근본 해결(스위트 시작 시점 rate-limit 충돌 제거)을 후속 SPEC 후보로 남겼으나, **v0.1.6에서 이 SPEC 범위 안에서 직접 해결했다**(§E.2c).

### 현재 잔여 사항(v0.1.6 이후) — 이 섹션이 최신 상태다

- **잔여 부채**: 없음. 위 case-flow flaky는 v0.1.6에서 해소되어 **전체 스위트 5/5(`case-flow.spec.ts`는 필터 실행에는 등장하지 않으므로 분모는 5)** 전부 1차 시도 통과로 확인됐다 — setup(TESTER_A/B) 각 7/7, 대상 2개 파일 각 6/6과는 분모가 다르다(§E.2c 4 실행 횟수 표 참고). 상세: §E.2c "AC-E2EAUTH-003/004 회차별 판정표".
- **알려진 검증 한계(부채와 구분 — 코드 결함이 아니라 검증 설계의 한계)**: `auth.spec.ts`(PRESERVE, 무변경)의 미등록 이메일 거부 테스트는 오류 원인(진짜 인증 거부 vs rate-limit)을 구분하지 않는다. v0.1.6에서 이 테스트가 진짜 401 응답을 받는 것을 계측 1회로 직접 확인했으나, 이후 스위트에 새 sign-in 요청이 추가되는 등 변경이 생기면 같은 유형의 429 거짓 통과가 재발할 수 있고, 그 경우에도 이 테스트만으로는 검출되지 않는다 — `auth.spec.ts`를 건드리지 않는 한(PRESERVE) 구조적으로 남는 한계다.
- **[v0.1.7]** 위 두 항목은 v0.1.6 시점부터 유효하며 이번 v0.1.7(문서 정확도 정정)로 인해 바뀌지 않았다.

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

외부 구현 검토(HEAD `009dd0e`) 2차 지적 대응 sync-phase. 구현 코드(`e2e/auth.setup.ts` 등)는 이번 sync에서 변경하지 않는다 — 문서 정합화 + PR 생성만 수행한다.

- **sync_complete_at**: 2026-09-09
- **sync_commit_sha**: `2a2ea78`(full: `2a2ea783af5939ac774562b428681d9ba1103e15`)
- **sync_status**: complete
- **문서 정정 내역**:
  1. `plan.md` M3(3) 코드 예제의 `requestfinished` → `request` 정정(실제 구현과 일치, 로그인 트리거 이전 등록)
  2. `acceptance.md`/`progress.md` AC-E2EAUTH-015a/015b의 "단언이 한 번이라도 실패하면 exit 0이 불가능하다" 표현을 `playwright.config.ts`의 `retries: 2`에 맞게 정정 — exit 0(최종, 재시도 포함)은 계정 검증이 결국 통과했다는 근거이며, 최초 시도(무재시도) 여부는 reporter 재시도 표시로 별도 확인
  3. `acceptance.md` §B DoD **14개**(체크박스 실제 개수 — 15는 논리 AC 개수) 항목 전부 실측 증거와 대조해 `[x]`로 갱신, case-flow 5회 연속 retry + 사전 format 위반 3건을 DoD 상단 고지로 명시(**[v0.1.5 정정]** 당시 "15개"로 잘못 표기했던 것을 아래 v0.1.5에서 바로잡음)
  4. `spec.md` frontmatter: `version` `0.1.2` → `0.1.4`, `status` `in-progress` → `completed`, `updated` `2026-09-08` → `2026-09-09`(body 내용은 manager-spec 소유 범위이므로 미변경)
  5. `progress.md`(이 파일): §E.2 재확인 결과 통합, 잔여 부채 섹션 유지, §E.4 신설
- **sync 필수 검증 재확인(문서 변경만이므로 코드 검증은 회귀 확인 목적)**:
  - `pnpm test`(단위) → exit 0, 59 test files / 395 tests 전부 통과(로그: `.moai/state/verify/e2e-auth-state-001/unit-test.log`)
  - `pnpm lint` → exit 0, 0건
  - `pnpm run format:check` → exit 1, 사전 위반 3건과 완전 동일(신규 위반 0건) — `app/globals.css`/`CHANGELOG.md`/`docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html`
  - `pnpm run build` → exit 0
  - `pnpm test:e2e`는 이번 sync에서 재실행하지 않음(코드 무변경 — 직전 run-phase 커밋 `009dd0e`에서 5회 연속 + 필터 2회 실측 완료, §E.2 참고). 문서 서술과 실제 코드(`e2e/auth.setup.ts`) 간 정합은 `git diff --stat` 무변경으로 확인(아래)
  - 구현 코드 무변경 확인: `git diff --stat 798a8b2 HEAD -- e2e/ playwright.config.ts` → 빈 결과(이번 sync 커밋이 e2e/playwright.config.ts를 건드리지 않음)
- **잔여 부채**: 1건(`case-flow.spec.ts`, out-of-scope, 판정 영향 없음) — **[v0.1.5 정정]** "기존 flaky"가 아니라 이 SPEC이 유발한 rate-limit 충돌 이동으로 원인 재분류됨, § case-flow 회귀 조사 참고
- **PR**: `plan/SPEC-E2E-AUTH-STATE-001` → `main` (#9), 아래 최종 보고에 URL 기록

### v0.1.5 독립 감사 (외부 검토 HEAD `167c71b` 대상, 이번 커밋)

기존 progress/acceptance의 PASS·체크박스를 증거로 쓰지 않고 REQ-001~010/AC-001~015(a/b)를 코드·실행 로그와 처음부터 재대조했다(방법·결과는 §E.2b). 구현 코드(`e2e/`, `playwright.config.ts`)는 이번 라운드에서도 변경하지 않는다 — 문서 정정 + `case-flow.spec.ts` 회귀 원인 조사만 수행한다.

- **감사_complete_at**: 2026-09-09
- **감사_commit_sha**: `6f7bc77`(full: `6f7bc77178670f8af234eeeb6f930a479b91b569`)
- **정정 내역**:
  1. `acceptance.md` AC-E2EAUTH-009 pathspec에 `':!CHANGELOG.md'` 추가(REQ-009 의도 — 애플리케이션 코드만 대상 — 와 기계적 검증 정합, 판정 자체는 불변)
  2. `progress.md`/`acceptance.md`의 AC-E2EAUTH-014/015a/015b 실행 횟수를 "8회 invocation/16회 테스트"(HISTORICAL, v0.1.2 임시 코드 절차 수치)와 "7회 독립 실행/14회 invocation"(v0.1.3 상시 코드 절차, run2 중복 집계 제거)로 명확히 분리
  3. `case-flow.spec.ts` 잔여 부채 서술을 "이 SPEC과 무관한 기존 flaky"에서 "이 SPEC이 유발한 rate-limit 충돌 이동(원인 특정, 격리 베이스라인 3회 대조)"으로 정정 — 격리 워크트리(`$SPEC_START_SHA`) 3회 재현으로 실증
  4. `progress.md` §E.4의 "DoD 15개" 표기를 실제 개수 "14개"로 정정
  5. `CHANGELOG.md`의 "pnpm test/lint/build/format:check 전부 exit 0" 표현을 "test/lint/build exit 0, format:check exit 1(사전 위반 3건, 신규 0건)"로 분리하고 case-flow 서술을 위 3번과 동일하게 정정
- **sync 필수 검증 재확인(문서 변경만이므로 코드 재실행 없음)**:
  - `pnpm test`(단위) → exit 0(재실행, 로그: `unit-test-v015.log`)
  - `pnpm lint` → exit 0
  - `pnpm run format:check` → exit 1, 사전 위반 3건과 동일(신규 0건)
  - `pnpm run build` → exit 0
  - `pnpm test:e2e` 5회·필터 2회는 **재실행하지 않음**(코드 무변경 — `git diff --stat 798a8b2 167c71b -- e2e/ playwright.config.ts` 빈 결과로 이번 라운드에서도 재확인) — 기존 run1~5/filterA/filterB 로그를 재사용
  - `case-flow.spec.ts` 회귀 조사용 베이스라인 3회는 **신규 실행**(격리 워크트리, §E.2b 참고) — 감사 종료 후 `git worktree remove`로 정리
- **잔여 부채**: 1건(위와 동일, 원인 재분류)
- **PR**: #9 본문을 이번 정정 내용에 맞춰 갱신(case-flow 서술, exit code 표현)

## §E.2c 외부 재검토 3차 대응 — 계측 기반 원인 확정 + 근본 수정 + 거짓 통과 정정 (v0.1.6, PR #9 HEAD `49f986a` 대상)

**배경**: v0.1.5는 case-flow 원인을 "베이스라인 대조 + 소스 리딩"으로 정합적으로 설명했으나, 실제 요청의 타임스탬프·HTTP 상태·오류 코드를 직접 계측하지는 않았다. 외부 재검토가 (1) 이 원인을 실측으로 확정할 것, (2) `auth.spec.ts`의 미등록 이메일 거부 테스트가 429로 거짓 통과하고 있지 않은지 확인할 것, (3) PRESERVE 제약 안에서 근본 수정 가능성을 조사할 것, (4) 실행 횟수 표기를 정정할 것, (5) 최종 코드로 전량 재검증할 것을 요구했다.

### 1) 원인 계측 — 관측 vs 추정의 구분

**계측 방법**: 격리된 조사 환경이 아니라 이 세션의 클린 작업 트리에서, 실제 `pnpm test:e2e` 진입점으로 임시 계측을 3개 파일(`e2e/auth.setup.ts`의 기존 `signInHits` 리스너 옆, `e2e/auth.spec.ts`·`e2e/case-flow.spec.ts`에 임시 추가)에 넣어 `page.on("response", ...)`로 `/api/auth/sign-in/email` 응답의 `Date.now()` 타임스탬프·HTTP 상태·(4xx일 때만) 오류 코드를 `console.log`로 남겼다. 비밀번호·쿠키·토큰·응답 본문 전체는 어디에도 기록하지 않았다(상태 코드와 오류 코드 필드만 추출). 계측은 `auth.spec.ts`/`case-flow.spec.ts`(PRESERVE 대상)에는 **영구 반영하지 않는다** — 계측 종료 직후 `git checkout -- e2e/auth.spec.ts e2e/case-flow.spec.ts`로 두 파일을 원본과 바이트 단위로 동일하게 되돌렸다(`git diff`/`git status --porcelain` 빈 결과로 확인). `e2e/auth.setup.ts`의 계측 리스너도 최종 구현에는 남기지 않았다 — 아래 3)의 10초 대기 한 줄과 그 설명 주석만 남는다.

**Claim**: `case-flow.spec.ts`의 로그인이 스위트 시작 이후 문자 그대로 5번째 `/api/auth/sign-in/email` 요청이며, Better Auth 기본 rate limit(10초 창/최대 3회)을 초과해 429를 받는다 — 이것은 추정이 아니라 계측으로 직접 관측된 사실이다.

**Evidence**(수정 전 코드, 1회 계측 실행, 로그 원문 `.moai/state/verify/e2e-auth-state-001/review2/run1.log`):
```
[INVESTIGATE] t=1788998951236 label=setup-A   status=200
[INVESTIGATE] t=1788998951778 label=setup-B   status=200                (setup-A로부터 +542ms)
[INVESTIGATE] t=1788998953516 label=auth-success status=200             (+2280ms)
[INVESTIGATE] t=1788998954035 label=auth-reject  status=429 error=Too many requests. Please try again later.  (+2799ms)
[INVESTIGATE] t=1788998954533 label=case-flow    status=429 error=Too many requests. Please try again later.  (+3297ms, 1차 시도)
[INVESTIGATE] t=1788998986285 label=case-flow    status=200             (+31.75s 뒤, retry #1로 회복)
```
리포터 요약: `12 passed, 1 flaky(case-flow, 30.1s 타임아웃 후 retry #1 1.7s로 회복)`.

**Baseline-attribution**: 이 run, HEAD `49f986a`(수정 전) 작업 트리 대상, 메인 체크아웃에서 단독 실행(다른 병렬 세션 없음, `git status --porcelain` 사전 확인).

**Gaps(관측하지 않은 것)**: (a) Better Auth rate-limit 알고리즘이 고정 창인지 슬라이딩 창인지는 소스를 재확인하지 않고 관측된 429/200 전환 지점으로만 역산했다. (b) 위 6줄은 1회 계측의 결과다 — 계측 자체를 5회 반복하지는 않았다(계측 코드는 PRESERVE 파일에 영구히 남길 수 없어 반복 계측 비용이 매회 코드 삽입/제거를 요구하기 때문 — 대신 아래 4)의 5+2회 재검증은 계측 없이 최종 코드로 반복해 인과관계가 재현성 있게 해소됐는지를 별도로 확인했다). (c) "5번째 요청"이라는 서수는 이 1회 실행의 관측값이며, Playwright의 파일 실행 순서가 매 실행 완전히 결정론적이라는 런타임 보장을 주장하는 것은 아니다 — 5회 연속 실행 전부에서 동일 실패 패턴이 재현된 것(§E.2b)은 순서가 사실상 안정적임을 뒷받침하는 별도 증거다.

**Residual-risk**: rate-limit 윈도우의 정확한 슬라이딩 경계(밀리초 단위)는 역산치이지, Better Auth 내부 구현을 읽어 확정한 값이 아니다. 아래 3)의 10초 대기 값은 이 근사치에 안전 여유(관측된 자연 간격 약 2.2~3.3초를 제거하고도 남는 여유)를 더한 것이다.

**[HARD] 필터 결과를 원인 입증에 오용하지 않음**: `case-flow.spec.ts`가 아예 실행되지 않는 `--spec` 필터 실행(filterA/filterB)은 이 인과관계의 증거로 사용하지 않는다 — "실행되지 않았다"는 "충돌이 없었다"의 증거가 될 수 없다(관측 부재는 실패의 증거도 성공의 증거도 아니다). 필터 실행은 아래 4)의 "대상 2개 파일이 필터 경로에서도 정상 동작하는지"의 증거로만 사용한다.

### 2) [HARD] `auth.spec.ts` 거짓 통과 확정

**Claim**: `auth.spec.ts`의 "allowed_testers에 없는 이메일은 로그인이 거부되어 세션이 생성되지 않는다" 테스트는, 수정 전 코드에서 실제로는 Better Auth의 인증 거부 로직이 아니라 **rate-limit(HTTP 429)**에 의해 그 요청이 차단되어 통과하고 있었다.

**근거(코드 검토 + 계측)**: `app/login/login-form.tsx`는 `authClient.signIn.email()`이 반환한 `signInError.message`를 원인 구분 없이 그대로 `login-error`(data-testid)에 표시한다(108행). `auth.spec.ts`의 해당 테스트는 `login-error`가 보이고 URL이 `/login`에 머무르는지, 그리고 `/cases/new`가 `/login`으로 리다이렉트되는지만 단언한다 — HTTP 상태 코드나 오류 메시지 내용은 전혀 확인하지 않는다. 위 1)의 계측이 직접 보여주듯 이 요청은 **429**를 받았다(`error=Too many requests. Please try again later.`) — "미등록 이메일이므로 거부됨"이 아니라 "네 번째 sign-in 요청이므로 rate-limit에 걸림"이었다. 두 실패 모드 모두 "에러 배너 표시 + 세션 미생성 + `/login` 유지"라는 동일한 관찰 가능 증상을 만들기 때문에, 이 테스트의 단언만으로는 둘을 구분할 수 없다 — 이것이 "false pass"의 정의다: 테스트는 PASS하지만, 그 PASS가 REQ가 실제로 의도한 동작(인증 로직에 의한 거부)을 증명하지 않는다.

**Baseline-attribution**: 위 1)과 동일 계측 실행. `auth-reject status=429`가 직접 증거.

**Gaps**: 이 false-pass가 이 SPEC 도입(setup 프로젝트 신설) 이전부터 존재했는지, 아니면 이 SPEC이 유발했는지는 별도로 재현하지 않았다 — `spec.md`의 최초 작성 시점 근거(2026-09-08 HISTORY)가 이미 "Better Auth 기본 rate limit이 IP+경로 기준"이라고 명시하고 있고, 이 SPEC이 setup 로그인 2건을 스위트 시작 직후 추가하기 전에는 `auth-reject`가 스위트 안에서 3번째 요청(auth-success 다음)이었을 가능성이 높아 그 시점에는 rate-limit에 걸리지 않았을 것으로 추정되나, `$SPEC_START_SHA` 베이스라인에서 이 특정 테스트를 계측 재현하지는 않았다 — 이 SPEC이 이 false-pass를 새로 유발했는지 이미 있던 것을 이 SPEC이 드러냈을 뿐인지는 미확인으로 남긴다.

**Residual-risk**: 아래 3)의 수정으로 이 특정 실행 조건에서는 해소되지만, 향후 스위트에 새 sign-in 요청이 추가되면 동일한 유형의 false-pass가 재발할 수 있다 — `auth.spec.ts` 자체가 원인 불문 단언이라는 구조적 취약점은 이 SPEC의 PRESERVE 제약(`auth.spec.ts` 무변경)상 이번 수정 범위에서 고치지 않는다.

### 3) 최소 수정 — PRESERVE 안에서의 해결

**검토한 후보와 기각 사유** (모두 PRESERVE/out-of-scope 위반이므로 채택하지 않음): (a) `case-flow.spec.ts` 수정 — `spec.md` §4가 명시적으로 out-of-scope. (b) `playwright.config.ts`의 `retries`/rate-limit 관련 설정 조정 — REQ-E2EAUTH-005가 명시적으로 금지. (c) Better Auth rate limit 완화 — `spec.md` §4 "프로덕션 인증 코드 변경"이 명시적으로 배제.

**채택한 수정**: `e2e/auth.setup.ts`의 TESTER_B 로그인 테스트 끝에 `await page.waitForTimeout(10_000)` 1줄을 추가했다(이 SPEC이 신설한, 수정 가능한 유일한 파일). 근거: setup(TESTER_A/B) 2건이 뒤이은 요청들(auth-success/auth-reject/case-flow)과 같은 10초 rate-limit 창에 들어가는 것이 원인이므로, setup 완료 시점을 10초 이상 앞당기면(=대기) 그 창이 갈릴 때 chromium project가 시작되어 setup의 2건이 이미 만료된 상태가 된다. 10초 값은 관측된 rate-limit 창 길이(10초)에서 자연 간격(약 2.2~3.3초)을 뺀 여유(약 6.7~7.8초)보다 큰 값을 선택해 타이밍 변동에 대한 여유를 확보했다.

**측정한 효과와 비용**:
- **효과(재계측, 로그 `.moai/state/verify/e2e-auth-state-001/review2/run2-candidate.log`)**: `setup-A(t=0)/setup-B(t=+574ms)/auth-success(t=+11759ms, 200)/auth-reject(t=+801ms 후, **401** `error=INVALID_EMAIL_OR_PASSWORD`)/case-flow(t=+506ms 후, **200**, 1차 시도)` — `auth-reject`가 이제 진짜 자격증명 거부(401)를 받고, `case-flow`가 재시도 없이 1차 시도로 통과한다.
- **추가 실행 시간**: 매 `pnpm test:e2e` 실행(setup이 실행되는 모든 경로 — 전체 스위트 및 두 `--spec` 필터 모두)에 10초 고정 추가. 그러나 수정 전에는 `case-flow.spec.ts`가 매회 30초 타임아웃 후 1.7초 retry로 회복하는 비용을 치렀으므로(§E.2b), 전체 스위트 기준 순 변화는 오히려 감소 방향이다 — 실측 리포터 총 소요시간은 수정 전/후 모두 반올림 표기로 "5.0m" 동일(§E.2 v0.1.6 재검증 로그 참고).
- **[v0.1.7 정정] 스케줄링 의존성 — 설정 보장 vs 관측된 동작 구분**: `playwright.config.ts`를 다시 확인하면 `dependencies: ["setup"]`는 **`chromium-authed` project에만** 선언되어 있다(대상 2개 파일이 속한 project). `chromium` project(여기에 `auth.spec.ts`·`case-flow.spec.ts`가 속함)는 `dependencies`를 전혀 선언하지 않는다 — 따라서 "setup이 `chromium-authed`보다 먼저 실행된다"는 것은 config가 강제하는 사실이지만, "setup이 `chromium` project보다 먼저 실행된다"는 것은 **config가 보장하지 않는다**. 이전 v0.1.6 서술("setup project가 chromium/chromium-authed project보다 먼저 실행된다는 순서 보장에만 의존한다")은 이 둘을 구분하지 않아 부정확했다 — 정정한다. 실제로는 `projects` 배열에서 `setup`이 첫 번째로 선언되어 있고, `chromium-authed`가 그것에 의존하므로 Playwright가 setup을 먼저 스케줄링하는 것으로 보이며, 이 관측은 이번 조사에 포함된 7회 전부(§E.2c 5)에서 안정적으로 재현됐다 — 그러나 이는 **관측된 스케줄링 동작**이지 `chromium` project에 대한 **설정상의 보장**이 아니다. `chromium` 전체에 `dependencies: ["setup"]`를 추가하면 이 보장을 config 수준으로 격상시킬 수 있으나, 이는 `playwright.config.ts`의 `projects` 구조를 이 SPEC이 확정한 base 설계(M1, D9 close-out) 이상으로 변경하는 것이라 이번 수정 범위에서는 채택하지 않는다 — 관측 사실을 정확히 구분해 기록하는 것으로 대신한다.
- **[v0.1.7 정정] setup 재시도 영향 — 근거 없는 인과 추론 철회**: 10초 대기는 TESTER_B 테스트 **자체의 실행 시간**에 그대로 더해지며, Playwright 테스트 timeout 예산(이 프로젝트는 `timeout` 오버라이드가 없으므로 기본값 30000ms)을 함께 소비한다. 이전 v0.1.6 서술("`page.on` 리스너나 `expect()` 단언 이후에 실행되어 setup 자신의 무재시도 판정에 영향을 주지 않는다")은 "단언 이후에 실행되므로 재시도에 영향이 없다"는 인과관계를 주장했으나, 이 인과관계를 뒷받침하는 근거가 없다 — timeout은 단언 통과 여부가 아니라 테스트 전체 소요시간으로 판정되므로, 대기가 단언 뒤에 있다는 사실만으로 timeout/retry 영향이 없다고 결론지을 수 없다. 이번 개정에서 이 주장을 철회하고, 실측으로 한정한다: 최종 7회(final-run1~5, final-filterA/B — 로그 원문 아래) 각각에서 TESTER_B 테스트의 리포터 소요시간은 `10.6s / 10.5s / 10.6s / 10.5s / 10.5s`(전체 스위트) · `10.6s / 10.5s`(필터 2회)로, 기본 timeout 30초 대비 약 19.4~19.5초의 여유가 있었고, 이 7회 전부에서 setup(TESTER_A/B)가 재시도 표시(`(retry #N)`) 없이 1차 시도로 통과했다. **이 관측은 이 7회에 한정되며, 대기가 timeout/재시도에 구조적으로 영향을 주지 않는다는 일반 보장을 주장하지 않는다** — 근거 없이 timeout이나 `retries` 값을 늘리는 조치도 취하지 않았다(현재 여유로 충분하다고 판단).
- **다른 파일로의 충돌 이동 여부**: 재검증(아래 4)에서 `sidebar-sticky`/`mobile-drawer-focus`/`comparison-docs-images`/`capture-evidence`류를 포함한 전체 13개 테스트가 매회 동일 패턴(EXPECTED-SKIP 10개, 통과 13개, 재시도 0건)으로 통과해 충돌이 다른 파일로 이동한 흔적은 없다.

### 4) 실행 횟수 정정 (v0.1.6)

과거 v0.1.5가 기록한 "대상 2개 파일 7/7"은 "독립 실행 7회(전체 스위트 5 + `--spec` 필터 2)"라는 분모를 두 파일 모두에 그대로 적용한 과잉 집계였다. 올바른 계산(각 파일이 실제로 실행되는 횟수만 계수):

| 대상 | 전체 스위트(5회) | `--spec=case-input-mobile-layout`(1회) | `--spec=tenant-isolation`(1회) | 합계 |
|---|---|---|---|---|
| setup(TESTER_A), setup(TESTER_B) | 5 | 1(`dependencies: ["setup"]`로 필터와 무관하게 항상 실행) | 1 | **7 각각** |
| `case-input-mobile-layout.spec.ts` | 5 | 1 | 0(이 필터에는 포함되지 않음) | **6** |
| `tenant-isolation.spec.ts` | 5 | 0(이 필터에는 포함되지 않음) | 1 | **6** |
| `case-flow.spec.ts` | 5 | 0(필터 실행에는 애초에 포함되지 않음) | 0 | **5** |

이 표에 맞춰 `acceptance.md` v0.1.5 HISTORY 절과 `progress.md` §E.2b의 "7/7" 2곳을 "6/6"으로 정정했다(이 문서 §E.2b 참고). `spec.md`/`plan.md`는 이 수치를 직접 인용하지 않으므로 추가 정정 대상이 없다.

### 5) 재검증 (v0.1.6, 전량 신규 실행 — 이전 버전 로그 재사용 없음)

구현이 변경됐으므로(`e2e/auth.setup.ts`에 10초 대기 추가) 위 §E.2/§E.2b의 기존 run1~5/filterA/filterB 로그는 이번 판정에 사용하지 않는다. 최종 코드(diff는 아래 "구현 변경 범위" 참고)로 전체 스위트 5회 연속 + `--spec` 필터 2회를 전량 재실행했다.

**Claim**: 최종 코드에서 setup(TESTER_A/B)·`case-input-mobile-layout.spec.ts`·`tenant-isolation.spec.ts`·`case-flow.spec.ts`·`auth.spec.ts`를 포함한 스위트 전체가 5회 연속 + 필터 2회 전부에서 exit 0 + 1차 시도 통과(재시도 0건)한다.

**Evidence**(리포터 요약 발췌, 로그 원문 `.moai/state/verify/e2e-auth-state-001/review2/final-run{1..5}.log`, `final-filterA.log`, `final-filterB.log`):
```
final-run1.log ... 13 passed (5.0m)   exit=0
final-run2.log ... 13 passed (5.0m)   exit=0
final-run3.log ... 13 passed (5.0m)   exit=0
final-run4.log ... 13 passed (5.0m)   exit=0
final-run5.log ... 13 passed (5.0m)   exit=0
final-filterA.log (--spec=case-input-mobile-layout) ... 3 passed (43.5s)  exit=0
final-filterB.log (--spec=tenant-isolation)          ... 3 passed (39.1s) exit=0
```
7개 로그 전부에 `retry #`, `✘`, `flaky` 문자열이 0건(각 로그를 `grep -E "retry #|✘|flaky"`로 확인, 빈 결과) — 수정 전(§E.2c 1) `12 passed, 1 flaky`이던 것과 대비된다. `auth.spec.ts`의 두 테스트(성공/거부)와 `case-flow.spec.ts`도 이 5회 전부에 포함되어 통과했다(전체 스위트 실행이므로 case-flow가 실제로 실행됨 — §E.2c 1)의 "필터 결과를 원인 입증에 쓰지 않음" 원칙과 별개로, 5회 전부가 case-flow를 포함하는 전체 스위트이므로 이 재검증 자체는 유효하다).

**AC-E2EAUTH-003/004 회차별 판정표(v0.1.6 최종 코드, 로그 원문에서 직접 발췌 — `[INVESTIGATE]` 계측 없는 공식 재검증)**:

| 회차 | setup(TESTER_A) | setup(TESTER_B) | `case-input-mobile-layout` | `tenant-isolation` | `case-flow.spec.ts` | `capture-evidence`류(10개) | `auth.spec.ts`(2개) | 회차 결과 |
|---|---|---|---|---|---|---|---|---|
| run1(전체) | 1차 통과(826ms) | 1차 통과(10.6s) | 1차 통과(760ms) | 1차 통과(305ms) | 1차 통과(1.6s) | EXPECTED-SKIP 10/10 | 1차 통과 2/2 | exit 0, 13 passed |
| run2(전체) | 1차 통과(806ms) | 1차 통과(10.5s) | 1차 통과(732ms) | 1차 통과(298ms) | 1차 통과(1.6s) | EXPECTED-SKIP 10/10 | 1차 통과 2/2 | exit 0, 13 passed |
| run3(전체) | 1차 통과(831ms) | 1차 통과(10.6s) | 1차 통과(825ms) | 1차 통과(337ms) | 1차 통과(1.6s) | EXPECTED-SKIP 10/10 | 1차 통과 2/2 | exit 0, 13 passed |
| run4(전체) | 1차 통과(840ms) | 1차 통과(10.5s) | 1차 통과(826ms) | 1차 통과(316ms) | 1차 통과(1.7s) | EXPECTED-SKIP 10/10 | 1차 통과 2/2 | exit 0, 13 passed |
| run5(전체) | 1차 통과(681ms) | 1차 통과(10.5s) | 1차 통과(685ms) | 1차 통과(290ms) | 1차 통과(1.5s) | EXPECTED-SKIP 10/10 | 1차 통과 2/2 | exit 0, 13 passed |
| filterA(`--spec=case-input-mobile-layout`) | 1차 통과(797ms) | 1차 통과(10.6s) | 1차 통과(752ms) | (필터 미포함) | (필터 미포함) | (필터 미포함) | (필터 미포함) | exit 0, 3 passed |
| filterB(`--spec=tenant-isolation`) | 1차 통과(816ms) | 1차 통과(10.5s) | (필터 미포함) | 1차 통과(510ms) | (필터 미포함) | (필터 미포함) | (필터 미포함) | exit 0, 3 passed |

**판정 근거**: AC-E2EAUTH-003 대상 3항목(setup 자신·대상 2개 파일) — 위 표에서 7회(해당 파일이 등장하는 실행만 계수 — §E.2c 4의 6/6·7/7 분모와 일치) 전부 "1차 시도 통과", 재시도 0건 → **PASS**. AC-E2EAUTH-004(전체 스위트 회귀 없음 + capture-evidence 예상 스킵) — 전체 스위트 5회 전부 `capture-evidence`류 10개 EXPECTED-SKIP + 나머지 전부 통과 + exit 0 → **PASS**. `case-flow.spec.ts`는 5/5(전체 스위트에만 등장) 전부 1차 시도 통과로, 이전 버전(v0.1.5 이하)이 기록한 "5/5 1차 실패 → retry로 회복"이라는 잔여 부채가 이번 수정으로 해소됐음을 재확인한다.

**Baseline-attribution**: 이 7회 실행 전부, HEAD `49f986a` + `e2e/auth.setup.ts`의 10초 대기 추가분(작업 트리, 커밋 전) 대상. 메인 체크아웃에서 순차 실행(병렬 세션 없음).

**Gaps**: `auth-reject`가 매회 401(진짜 거부)을 받았는지는 §E.2c 3)의 1회 재계측(run2-candidate.log)으로만 직접 확인했다 — 이 5+2회 공식 재검증에는 계측 코드가 없으므로(계측은 PRESERVE 파일에 영구 반영하지 않음, §E.2c 1)) 상태 코드를 직접 재확인하지 않았다. 다만 (a) 코드가 동일하고, (b) 타이밍 여유(10초 대기)가 결정론적으로 유지되며, (c) 7회 전부 재시도 없이 통과한 것이 rate-limit 충돌이 재발하지 않았다는 간접 증거이므로, 401 유지에 대한 신뢰도는 높다고 판단하되 "직접 관측"과 "간접 근거"를 구분해 기록한다.

**Residual-risk**: 7회는 유한 표본이다 — 이론상 낮은 확률로 timing jitter가 10초 여유를 넘어설 가능성을 완전히 배제하지는 못한다(다만 관측된 자연 간격이 최대 3.3초 수준이었고 여유가 6.7초 이상이므로 위험은 낮다고 판단). CI 환경(이 세션과 다른 머신 성능)에서의 재현은 이번 세션 범위 밖이다.

**lint/format/build 재확인**(코드 변경이 `e2e/auth.setup.ts` 1개 파일, 1블록뿐이므로 회귀 확인 목적):
```
$ pnpm run lint         → exit 0
$ pnpm run format:check → exit 1, 사전 위반 3건과 동일(app/globals.css/CHANGELOG.md/docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html) — 신규 위반 0건
$ pnpm run build        → exit 0
```

**구현 변경 범위**: `e2e/auth.setup.ts` 1개 파일 — TESTER_B 테스트 끝에 `await page.waitForTimeout(10_000)` 1줄 + 설명 주석. `git diff --stat` 기준 다른 어떤 파일도 변경되지 않았다(SPEC 문서 4개 제외). PRESERVE 재확인: `e2e/helpers.ts`·`e2e/auth.spec.ts`·`e2e/case-flow.spec.ts`·`e2e/mobile-drawer-focus.spec.ts`·`scripts/` 전체·나머지 out-of-scope spec 파일·`playwright.config.ts`의 `workers`/`retries`/`webServer` 전부 `git diff --stat` 빈 결과로 무변경 확인.

**판정**: **AC-E2EAUTH-003/004 재확인 — PASS 유지**(재시도 0건으로 오히려 강화). **잔여 부채(§ 잔여 부채, `case-flow.spec.ts` flaky)는 이번 수정으로 해소** — 이 AC들의 원래 요구(무재시도 3항목/전체 스위트 통과)를 위해 필요했던 것은 아니었으나(재시도는 원래도 허용됐다), 근본 원인 제거의 부수 효과로 실제로 사라졌다.

**[v0.1.7 정정] 인증 검증 범위 — 계측 확인과 비계측 확인을 구분**: 이 두 종류의 증거를 혼동하지 않는다 — (a) `auth.spec.ts`의 거부 테스트가 **진짜 401 응답**을 받는다는 것은 §E.2c 3)의 계측 재실행 **1회**(`run2-candidate.log`)에서만 직접 관측했다. (b) 위 표의 공식 5+2회 재검증은 계측 코드가 없으므로 이 테스트가 **PASS했다는 사실**만 확인하며, 그 PASS의 원인이 401(진짜 거부)인지 다른 무언가인지는 재확인하지 않는다. 이전(v0.1.6) 문구가 "재검증(5+2회)에서 ... 진짜 401 응답으로 ... 확인했다"처럼 (a)와 (b)를 한 문장에 섞어 서술한 것을 이번 개정에서 분리한다. **알려진 검증 한계(해소되지 않음, 앞으로도 남음)**: `auth.spec.ts` 자체는 PRESERVE 대상이라 오류 원인(진짜 거부 vs rate-limit)을 구분하도록 수정하지 않았다 — 따라서 향후 스위트에 sign-in 요청이 추가되는 등의 변경으로 같은 유형의 429 거짓 통과가 재발해도, 이 테스트의 PASS/FAIL만으로는 검출되지 않는다. 이 한계는 이번 수정으로 해소된 것이 아니라 구조적으로 남아 있으며, `auth.spec.ts`를 건드리지 않는 한 계속 남는다.

- **완료_complete_at**: 2026-09-10
- **완료_commit_sha**: `595324f`(full: `595324f86c10ae921426e88009e5ed40b09dbe45`)
- **PR**: #9 — 아래 최종 보고의 내용으로 본문 갱신, **open 유지, merge하지 않음**(외부 재검토 요청)

## §E.2d 외부 재검토 4차 대응 — v0.1.6 서술 정확도 정정 (v0.1.7, PR #9 HEAD `8e7d36a` 대상)

**배경**: v0.1.6의 수정(10초 대기)은 유지하되, 외부 재검토가 그 설명에서 4가지 부정확성을 지적했다 — (1) 실행 순서 보장 범위 과장, (2) timeout 영향에 대한 근거 없는 인과 추론, (3) 계측 확인과 비계측 확인의 혼동, (4) AC-003 회차별 판정표 미제시. **구현 변경은 없다** — 이번 라운드는 문서 정정만 수행한다.

**정정 내역**(각 항목의 본문 위치는 위 §E.2c 및 § 잔여 부채 참고):
1. **스케줄링 의존성**: `dependencies: ["setup"]`가 `chromium-authed`에만 선언되어 있고 `chromium`에는 없음을 반영 — "config 보장"과 "관측된 스케줄링 동작"을 구분. `chromium` 전체에 `dependencies`를 추가하는 코드 변경은 하지 않았다(§E.2c "스케줄링 의존성" 정정 + 위 § case-flow 회귀 조사의 "[v0.1.7 정정]" 각주).
2. **timeout 영향**: "단언 이후라 재시도에 영향 없다"는 근거 없는 인과 추론을 철회하고, 실측(final-run1~5/final-filterA/B)한 TESTER_B 소요시간(10.5~10.6초, 기본 30초 timeout 대비 여유 확인)과 "이 7회에서 setup 재시도 0건"이라는 관측 사실로 한정했다(§E.2c "setup 재시도 영향" 정정). 근거 없이 `timeout`/`retries` 값을 늘리는 조치는 하지 않았다.
3. **인증 검증 범위**: `auth.spec.ts`의 진짜 401 확인(계측 1회, `run2-candidate.log`)과 공식 5+2회 재검증(PASS만 확인, 상태 코드 미확인)을 모든 문서(`progress.md`/`spec.md`/`acceptance.md`/`CHANGELOG.md`/PR 본문)에서 일관되게 구분했다. 향후 429 거짓 통과 재발 가능성을 "알려진 검증 한계"로 명시(§ 현재 잔여 사항). `e2e/auth.spec.ts`는 이번에도 수정하지 않았다(`git diff --stat` 빈 결과로 확인).
4. **AC-003/004 회차별 판정표**: 위 §E.2c에 `final-run1~5.log`/`final-filterA.log`/`final-filterB.log`에서 직접 발췌한 회차별 표(setup A/B·대상 2개 파일·case-flow·capture-evidence·auth.spec.ts)를 신설했다 — 새 실행 없이 기존 v0.1.6 최종 로그 원문에서 `grep`으로 재추출한 것이다.
5. **과거/현재 구분**: § 잔여 부채(Residual Debt) 섹션 전체를 "**[HISTORICAL, v0.1.2~v0.1.5 시점]**"로 명시하고, 그 아래 "§ 현재 잔여 사항(v0.1.6 이후)"을 신설해 현재 유효한 잔여 부채(없음)와 알려진 검증 한계(auth.spec.ts 원인 미구분)를 분리했다.

**재실행 여부**: 구현 변경이 없고 v0.1.6의 `final-run1~5.log`/`final-filterA.log`/`final-filterB.log`가 이번 판정에 충분하므로, 전체 E2E 5회 + 필터 2회는 **다시 반복하지 않았다**. 프로젝트 필수 sync 검증은 실제로 재실행해 기록한다:

```
$ pnpm run lint         → exit 0 (로그: .moai/state/verify/e2e-auth-state-001/review2/v017-lint.log)
$ pnpm run format:check → exit 1, 사전 위반 3건과 동일(app/globals.css/CHANGELOG.md/docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html) — 신규 위반 0건 (로그: v017-format.log)
$ pnpm run build        → 재실행하지 않음 — 코드 변경이 없으므로(git diff --stat 기준 e2e/·playwright.config.ts 등 코드 경로 무변경, SPEC 문서 5개만 변경) v0.1.6 시점의 exit 0(review2/final-build.log)을 그대로 인용한다
```

**Baseline-attribution**: lint/format:check는 이 세션에서 방금 재실행(HEAD `8e7d36a` + 이번 문서 변경, 작업 트리). build는 v0.1.6 시점(HEAD `8e7d36a` 이전 작업 트리, `final-build.log`)의 기존 실행 결과를 재사용 — 코드 무변경이므로 결과가 달라질 이유가 없다.

**Gaps**: build를 이번 라운드에서 직접 재실행하지는 않았다 — 문서만 변경했으므로 회귀 가능성이 없다고 판단했으나, 이는 "재실행해서 확인"이 아니라 "무변경이므로 재사용"이라는 판단에 근거한다.

- **완료_complete_at**: 2026-09-10
- **완료_commit_sha**: `b093990`(full: `b09399034d1bd96384d53e94ac2e69a0398c5faf`)
- **PR**: #9 — 아래 최종 보고 내용으로 본문 갱신, **open 유지, merge하지 않음**
