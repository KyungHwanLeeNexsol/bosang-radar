# SPEC-B2C-LAUNCH-001 — sync 감사 교정 근거 (기준 SHA `d80adc8`)

`progress.md` §E.4의 교정(2026-10-08, PR #25 외부 검토 반영)이 기대는 명령·종료 코드·원문 출력을 검토 가능한 형태로 모은 문서다. `spec.md`·`plan.md`·`acceptance.md`가 아니므로 계획 감사의 해시 대상이 아니다(해시 대상은 그 세 파일과 `design.md`·`research.md`·`tasks.md`다).

- 대상: `main` = 병합 커밋 `d80adc877e8f0258aa8c4f7dd24b87814ead2f3c`. 실행한 작업 트리는 sync 브랜치 `dde263be744903a4e509b1295938e1d156a15a36`이고 코드는 `d80adc8`과 같다(`git diff --name-status d80adc8 dde263b`가 `.moai/specs/SPEC-B2C-LAUNCH-001/progress.md`와 `CHANGELOG.md` 둘만 보여 준다).
- §5.6(Phase 9 해소)만 sync 브랜치 `98d5827` 위의 작업 트리에서 실행했다. 이 트리는 `d80adc8`과 코드 논리가 같고 주석 27줄(코드 4개 파일)만 다르다.
- 구분: **직접** = 이 교정 작업에서 실행해 출력을 읽은 것. **재사용** = 앞선 기록을 쓰되 관측 시각과 이후 변경 범위를 확인한 것. **미확인** = 하지 못했거나 근거가 성립하지 않은 것.
- 이 문서에는 시크릿 값, 운영 호스트 접속 정보, 개인 식별 정보, 패키지별 취약점 목록을 적지 않았다. 원문 로그는 git이 무시하는 `.moai/state/verify/sync-launch001/`에 있고(§8) 이 저장소에 올라가지 않는다. 아래 인용은 그 로그의 핵심 줄이다.

## 1. 한눈에 보는 표

| § | 차원 | 명령(저장소 루트 기준) | 종료 코드 | 구분 |
|---|---|---|---|---|
| 2 | Security | `pnpm-audit*.json`에서 심각도 수치만 추출 | — | 직접(수치 재추출) / 재사용(감사 실행 자체) |
| 3 | Craft | `pnpm exec vitest run <30개 파일> --coverage …`(전문 §3.1) | 0 | 직접 |
| 4 | Functionality(AC-013) | 보류 브랜치 교체본 + 정적 시험 8개 실행 | 0 | 직접 |
| 4 | Functionality(AC-013) | smoke 일곱 상태(아홉 행) `V64` | 0 | 재사용(변경 범위 확인) |
| 4b | Functionality(AC-014) | `pnpm exec tsx scripts/verify-rollback-dark.ts` | 0 | 직접 |
| 5 | Consistency | `pnpm exec tsc --noEmit` | 0 | 직접 |
| 5 | Consistency | `pnpm lint` | 0 | 직접 |
| 5 | Consistency | `pnpm exec prettier --check <PR #24 변경 TS/TSX 65개>` | 0 | 직접 |
| 5 | Consistency | `moai spec lint .moai/specs/SPEC-B2C-LAUNCH-001/spec.md` | 0 | 직접 |
| 5 | sync Phase 9 | @MX P1/P2 읽기 전용 스캔(스크립트) — 해소 전 | 0 | 직접 |
| 5.6 | sync Phase 9 해소 | 태그 추가(주석 27줄), P1 재점검 두 방식, P2 14건 판독, `prettier`·`eslint`·영향받는 시험 28개 파일, `moai mx scan` | 0 | 직접 |
| 6 | S-2 | `pnpm exec tsx scripts/check-launch-gate.ts …` 두 번 | 0, 1 | 직접 |

## 2. Security — 수치만 (판정 변경 없음)

`pnpm-audit-prod.json`·`pnpm-audit.json`(앞선 감사에서 `d80adc8`의 `package.json`·`pnpm-lock.yaml`로 실행, 이 PR은 두 파일을 바꾸지 않았다)에서 심각도 수치만 다시 뽑았다. 패키지 이름과 권고 본문은 공개 저장소라 적지 않는다.

```text
pnpm-audit-prod.json: metadata.vulnerabilities={"info":0,"low":4,"moderate":22,"high":13,"critical":4} advisories(count by severity)={"moderate":22,"critical":4,"high":13,"low":4} totalAdvisoryEntries=43
pnpm-audit.json:      metadata.vulnerabilities={"info":0,"low":7,"moderate":29,"high":18,"critical":4} advisories(count by severity)={"moderate":29,"critical":4,"high":18,"low":7} totalAdvisoryEntries=58
```

이전 기록(prod `{low 4, moderate 22, high 13, critical 4}`, 전체 `{7, 29, 18, 4}`)과 같다. 이 SPEC이 도입한 것이 아니다. 하드 임계값(Critical/High 없음)을 충족하지 못하므로 Security는 FAIL 그대로다.

## 3. Craft — 커버리지

### 3.1 실행한 명령과 결과 (직접)

```text
pnpm exec vitest run lib/launch scripts/check-launch-gate.test.ts scripts/check-launch-transitions.test.ts scripts/launch-marker-check.test.ts scripts/smoke-check.test.ts scripts/verify-smoke-check.test.ts scripts/verify-rollback-dark.test.ts scripts/verify-gate-reachability.test.ts scripts/verify-flag-runtime.test.ts --coverage --coverage.reporter=text --coverage.reporter=json-summary --coverage.reportsDirectory=.moai/state/verify/sync-launch001/coverage-r2 --coverage.include='lib/launch/**/*.ts' --coverage.include='scripts/check-launch-gate.ts' --coverage.include='scripts/check-launch-transitions.ts' --coverage.include='scripts/launch-marker-check.ts' --coverage.include='scripts/smoke-check.ts' --coverage.include='scripts/verify-smoke-check.ts' --coverage.include='scripts/verify-rollback-dark.ts' --coverage.include='scripts/verify-gate-reachability.ts' --coverage.include='scripts/verify-flag-runtime.ts' --coverage.exclude='node_modules/**' --coverage.exclude='.next/**' --coverage.exclude='**/*.test.ts'
```

```text
 Test Files  30 passed (30)
      Tests  845 passed (845)
Statements   : 85.42% ( 1776/2079 )
Branches     : 89.33% ( 1114/1247 )
Functions    : 86.95% ( 340/391 )
Lines        : 85.33% ( 1560/1828 )
exit=0
```

- 작업 트리 코드 = `d80adc8`(위 대상 항목). 시험 파일 30개 = `lib/launch/*.test.ts` 22개 + `scripts/` 시험 8개.
- **왜 `--coverage.exclude`를 명령줄에서 덮어썼나**: 이 작업 공간은 `.claude/worktrees/` 아래이고 `vitest.config.ts`의 기본 제외 목록에 `.claude/**`가 있어서, 덮어쓰지 않으면 모든 파일이 제외돼 `0/0`이 된다. 앞선 첫 실행(`vitest-coverage.log`)이 그 문제였고 실제 커버리지 수치가 아니었다. 덮어쓴 제외 목록은 `node_modules`·`.next`·시험 파일만 뺀다.
- **왜 `--coverage.include`를 명령줄에서 적었나**: 프로젝트의 기본 커버리지 대상(`vitest.config.ts`의 `coverage.include`)은 `app/**`·`components/**`·`lib/**`뿐이라 `scripts/`가 들어 있지 않다. 점검 CLI와 하네스를 재려면 명시해야 한다.
- 앞선 기록의 98.69%도 이 문서가 같은 방식으로 재현했다. 보관된 `coverage/coverage-summary.json`(앞선 실행 `vitest-coverage-v2.log`, 시험 28개 파일·783개 통과)에서 파일 24개를 합산하면 줄 1276/1293 = 98.69%이고, 이번 새 실행에서도 같은 24개 파일의 값이 같다.

### 3.2 범위별 집계 (직접, `coverage-r2/coverage-summary.json`에서 계산)

| 범위 | 파일 수 | 줄 | 문장 | 분기 | 함수 |
|---|---:|---|---|---|---|
| A. `lib/launch` 제품 모듈 | 20 | 100.00% (1023/1023) | 99.74% (1165/1168) | 98.76% (714/723) | 100.00% (199/199) |
| B. 점검·smoke CLI 4개 | 4 | 93.70% (253/270) | 93.35% (295/316) | 91.63% (219/239) | 95.89% (70/73) |
| **A+B. 제품 코드 — 앞서 보고한 "98.69%"의 범위** | 24 | **98.69%** (1276/1293) | 98.38% (1460/1484) | 96.99% (933/962) | 98.90% (269/272) |
| C. 하네스 `scripts/verify-*.ts` 4개 | 4 | 50.20% (250/498) | 50.00% (275/550) | 61.28% (163/266) | 53.40% (55/103) |
| **A+B+C. PR #24가 추가·수정한 구현 소스 합산** | 28 | **85.20%** (1526/1791) | 85.30% (1735/2034) | 89.25% (1096/1228) | 86.40% (324/375) |
| 시험 지원 fixture 3개(합산에서 제외) | 3 | 91.89% (34/37) | 91.11% (41/45) | 94.74% (18/19) | 100.00% (16/16) |
| vitest가 출력한 All files(fixture 포함) | 31 | 85.34% (1560/1828) | 85.43% (1776/2079) | 89.33% (1114/1247) | 86.96% (340/391) |

vitest 텍스트 보고서는 소수 둘째 자리를 내려서 적는다(85.33·85.42). 위 표는 `covered/total`을 반올림한 값이다.

범위 C의 파일: `scripts/verify-flag-runtime.ts`(이 PR 이전부터 있던 파일이고 이 PR이 수정했다 — 아래 수치는 파일 전체), `scripts/verify-gate-reachability.ts`, `scripts/verify-rollback-dark.ts`, `scripts/verify-smoke-check.ts`. 범위 A의 파일: `cross-combination`·`engine-ready-oracle`·`engine-ready-step`·`exposure-record`·`footer-element-state`·`gate-record`·`gate-state-table`·`item-table`·`legal-confirmation`·`legal-notice-gate`·`markdown-table`·`observation-record`·`procedure-steps`·`rollback-observation`·`sibling-reference`·`signature`·`smoke-check`·`stage-table`·`target-check`·`transition-list`(모두 `lib/launch/*.ts`). 범위 B의 파일: `scripts/check-launch-gate.ts`·`check-launch-transitions.ts`·`launch-marker-check.ts`·`smoke-check.ts`. fixture 3개: `lib/launch/gate-state-table.fixture.ts`·`legal-notice-record.fixture.ts`·`sibling-evidence.fixture.ts`(시험 지원 파일이라 제품 코드 집계에서 뺐다 — 포함해도 합산은 줄 85.34%로 85% 이상이다).

### 3.3 파일별 줄 커버리지 — 100% 미만이거나 `lib/launch` 밖인 파일

| 줄 % | 줄(covered/total) | 파일 |
|---:|---|---|
| 96.87 | 186/192 | `scripts/check-launch-gate.ts` |
| 83.33 | 25/30 | `scripts/check-launch-transitions.ts` |
| 97.05 | 33/34 | `scripts/launch-marker-check.ts` |
| 64.28 | 9/14 | `scripts/smoke-check.ts` |
| 50.29 | 86/171 | `scripts/verify-flag-runtime.ts` |
| 52.27 | 69/132 | `scripts/verify-gate-reachability.ts` |
| 31.94 | 23/72 | `scripts/verify-rollback-dark.ts` |
| 58.53 | 72/123 | `scripts/verify-smoke-check.ts` |

`lib/launch` 제품 모듈 20개는 모두 줄 100%다. 하네스 네 개의 미커버 줄은 각 파일의 빌드·서버 기동·`main` 구간에 몰려 있다(예: `verify-rollback-dark.ts` 126–235·242–248, `verify-gate-reachability.ts` 282–430·437–443, `verify-smoke-check.ts` 끝쪽 `…85–374,381–387`). 이 구간은 `pnpm test`가 돌리지 않고(런북 "점검 도구와 실행 방법") 별도 명령으로 서버를 띄워 관측한다. 그 별도 실행은 프로세스 밖이라 v8 측정에 잡히지 않는다.

### 3.4 필수 측정 범위의 판단 근거

| 출처 | 내용 | 이 판단에 주는 것 |
|---|---|---|
| `.moai/config/evaluator-profiles/default.md` | Craft 기준은 "Coverage >= 85%", "Coverage below 85% = Craft FAIL". 경로 범위 서술 없음 | 합격선은 85% 하나이고 파일별 기준이 아니다 |
| `.moai/config/sections/quality.yaml` | `test_coverage_target: 85`, `coverage_exemptions.enabled: false`, `tdd_settings.min_coverage_per_commit: 80` | 면제가 꺼져 있어 하네스를 면제로 뺄 근거가 없다. 80%는 run 단계 커밋별 기준이라 이번에 측정하지 않았다 |
| `.claude/skills/moai/workflows/sync/quality-gates-quality.md` Phase 10 | 커버리지를 측정하고(Step 0.7.1), 목표 미만 파일을 갭으로 식별해 위험순으로 분류하고(0.7.2), 목표에 못 미치면 갭을 기록하고 계속한다("do not block pipeline", 0.7.4) | 파일별 미달은 갭 후보로 기록하는 것이지 판정 기준이 아니다 |
| `vitest.config.ts` | 기본 `coverage.include`는 `app`·`components`·`lib`만 | 점검 CLI·하네스는 프로젝트 기본 측정 밖이라 명시 측정이 필요했다 |

결론: 근거 없는 파일별 85% 기준을 만들지 않았다. 판정은 합산 기준이고, 어느 범위를 잡아도(A, A+B, A+B+C) 네 지표가 모두 85% 이상이다. 여유는 A+B+C의 줄에서 가장 얇다(0.20%p).

## 4. AC-013 — 보류 브랜치 교체본

### 4.1 AC 문구에서 AC 안과 밖을 가르는 곳

- `acceptance.md` 도입부(12행): "`deploy.yml` 변경을 `main`에 올려 운영 배포를 일으키는 일은 별도의 운영 행위이며 이 SPEC의 AC가 아니다."
- AC-013의 "이 AC가 보지 못하는 것"(113행): "교체를 `main`에 올리는 것은 운영 배포를 일으키는 운영 행위라 이 AC 밖이다(N9)."
- Definition of Done(147행): "…`deploy.yml` 변경의 `main` 병합과 그로 인한 배포 … 은 이 SPEC의 완료 조건에 포함되지 않는다."

### 4.2 보류 브랜치의 사실 (직접)

```text
git ls-remote --heads origin smoke-deploy-workflow        → 0줄 (원격에 없다: 로컬 전용)
git log --oneline -3 smoke-deploy-workflow                → dd7122c  504f3d4  d241674
git merge-base smoke-deploy-workflow origin/main          → 504f3d4630c72fb6663b181bf3106044ade89dab
git rev-parse 504f3d4:.github/workflows/deploy.yml        → ab14c5a4092fd55bff4ce5b2a4482d4bc0b29143
git rev-parse d80adc8:.github/workflows/deploy.yml        → ab14c5a4092fd55bff4ce5b2a4482d4bc0b29143   (main의 deploy.yml = 보류 브랜치 기준점의 것)
git rev-parse dd7122c:.github/workflows/deploy.yml        → 35bf30f3a6cc8dde7a547ad533005c90fa50f6e5   (교체본)
git rev-parse dd7122c:scripts/deploy-workflow-static.test.ts → 4ff613f06c3bb5149ea13e61a08375604410b218
git diff --stat 504f3d4 dd7122c                           → deploy.yml 63줄, launch-gate-runbook.md 2줄, progress.md 3줄, deploy-workflow-static.test.ts 121줄 (4 files, +131 −58)
```

`main`의 `deploy.yml` blob이 보류 브랜치 기준점과 같으므로 교체 커밋 `dd7122c`의 `deploy.yml` 변경은 `main`에 그대로 적용되는 형태다. 보류 브랜치는 원격에 올리지 않았다(사용자 선택) — 그래서 교체본 전문을 아래 4.5에 diff로 남겼다.

### 4.3 기존 smoke 증거를 재사용해도 되는지 — 변경 범위 확인 (직접)

```text
git log --oneline 504f3d4..d80adc8 -- lib/launch/smoke-check.ts lib/launch/smoke-check.test.ts scripts/smoke-check.ts scripts/smoke-check.test.ts scripts/verify-smoke-check.ts scripts/verify-smoke-check.test.ts
(빈 출력 — 변경 없음)
git diff --stat 504f3d4 d80adc8 -- .github
(빈 출력 — 변경 없음)
git log --format='%h %ci' d80adc8 -- scripts/verify-smoke-check.ts   → 85c3c2e 2026-10-07 15:57:55 +0900 (마지막 변경)
git log --format='%h %ci' d80adc8 -- scripts/smoke-check.ts lib/launch/smoke-check.ts → cb3740b 2026-10-07 15:44:12 +0900 (마지막 변경)
git log --format='%h %ci' d80adc8 -- scripts/verify-flag-runtime.ts → 85c3c2e 2026-10-07 15:57:55 +0900 (환경 조립 함수 export; 그 앞은 2026-10-02)
관측 로그 V64-seven-states.log 수정 시각: 2026-10-07 16:01:30
```

smoke 관련 파일의 마지막 변경(15:44·15:57)이 관측(16:01:30)보다 앞서고 그 뒤 `d80adc8`까지 변경이 없다. 따라서 `V64`는 `d80adc8`의 smoke 코드에 대한 관측으로 재사용할 수 있다. 앱 본체(`app`·`components`·`lib/diagnosis`·`lib/consult`·`lib/env.ts`)가 관측 뒤 바뀌었는지는 4b에서 확인한다.

### 4.4 교체본의 정적 시험 8개를 직접 실행 (직접)

방법: `git show dd7122c:.github/workflows/deploy.yml`과 `git show dd7122c:scripts/deploy-workflow-static.test.ts`를 저장소 밖 스크래치 폴더의 같은 상대 경로에 꺼내고, 그 폴더에서 이 저장소의 `node_modules`를 가리키는 링크를 임시로 만들어 vitest를 실행했다(저장소 트리는 건드리지 않았고 링크만 지웠다). 시험은 `ROOT`를 자기 위치 기준으로 잡으므로 꺼낸 `deploy.yml`을 읽는다.

```text
node ./node_modules/vitest/vitest.mjs run --root . --reporter=verbose
 ✓ deploy.yml — 파서로 읽힌다 > YAML이 파싱되고 트리거·동시성·단일 배포 단계 구조가 그대로다
 ✓ deploy.yml — 파서로 읽힌다 > 시크릿 참조는 기존 다섯 개 그대로이고 새로 늘지 않았다
 ✓ deploy.yml — smoke 검사는 저장소 스크립트를 부른다 > 저장소의 smoke 스크립트를 pnpm exec tsx로 호출한다
 ✓ … > 호출 줄이 실패를 삼키지 않는다(파이프·|| true·& 없음) — 실패하면 set -e로 배포가 실패한다
 ✓ … > 기준 주소는 인자로 넘긴다(스크립트에 기본 주소를 두지 않는다)
 ✓ … > 예전 인라인 검사(placeholder 문구 grep·본문 임시 파일·CSS 경로 추출)가 남아 있지 않다
 ✓ deploy.yml — 단계 순서(재시작 뒤에 smoke) > 빌드 → 정적 자산 복사 → pm2 확인 → 재시작 → 저장 → smoke 순서가 그대로다
 ✓ … > smoke 호출은 정확히 한 번이고, 정보용 제거 라우트 확인은 smoke 뒤에 그대로 있다
 Test Files  1 passed (1)
      Tests  8 passed (8)
exit=0
```

이 시험은 워크플로를 실행하지 않고 YAML 구조·호출·순서만 본다. GitHub Actions에서의 실제 실행은 보지 못한다(AC-013이 적은 한계).

### 4.5 교체본 diff 전문 (`git diff 504f3d4 dd7122c -- .github/workflows/deploy.yml`)

```diff
@@ -61,61 +61,14 @@ jobs:
             pm2 restart "$PM2_APP"
             pm2 save
 
-            echo "== smoke check: public entry point (/) — bounded retry, no blind sleep =="
-            (… 인라인 curl 재시도 루프 · placeholder 문구 `grep -q "서비스 준비 중입니다"` · CSS 청크 경로 grep · CSS 응답 코드 검사: 53줄 삭제 …)
-            echo "OK: GET ${CSS_PATH} responded ${CSS_CODE}"
+            echo "== smoke check: repository script (diagnosis gate closed or open both accepted) =="
+            # 검사 로직은 저장소 스크립트에 있다(SPEC-B2C-LAUNCH-001 D-LAUNCH-06).
+            # 판정은 홈 응답이 2xx이고 본문이 가리키는 CSS 청크가 서빙되는지뿐이며,
+            # 진단 게이트가 닫혀 있든 열려 있든 같은 규칙이다(게이트 상태는 출력만 한다).
+            # 재시도 횟수·대기는 스크립트의 기본값이 정한다. 스크립트가 0이 아닌 코드로
+            # 끝나면 set -e로 이 배포 단계가 실패한다. 기준 주소는 인자로만 넘긴다.
+            SMOKE_BASE_URL="http://127.0.0.1:3000"
+            pnpm exec tsx scripts/smoke-check.ts --base-url="$SMOKE_BASE_URL"
 
             echo "== informational only: confirm removed B2B routes stay gone (does NOT fail deploy) =="
```

삭제된 53줄은 로컬 `r2-deploy-yml.diff`에 전문이 있다. 위 발췌는 줄임 표시(괄호)를 제외하면 diff 원문 그대로다. `127.0.0.1`은 서버 안의 루프백 주소다.

### 4.6 로컬 smoke 일곱 상태 (재사용 `V64`, 2026-10-07 16:01, `exit=0`)

```text
| (가)   | 진단 게이트 닫힘(플래그 미설정, 변경을 싣는 배포의 상태) — 실제 서버 | 0 / 닫힘     | 0 / 닫힘     | OK |
| (나)   | production 경로로 열림 — 실제 서버                                  | 0 / 열림     | 0 / 열림     | OK |
| (다)   | review 경로로만 열림 — 실제 서버                                    | 0 / 열림     | 0 / 열림     | OK |
| (라)   | 두 경로 모두 열림 — 실제 서버                                       | 0 / 열림     | 0 / 열림     | OK |
| (마-1) | 정상 응답, 열림 표지(placeholder 없음) — 임시 서버                  | 0 / 열림     | 0 / 열림     | OK |
| (마-2) | 정상 응답, 닫힘 표지(placeholder 있음) — 임시 서버                  | 0 / 닫힘     | 0 / 닫힘     | OK |
| (바)   | HTTP 500 — 임시 서버                                               | 1 / 알 수 없음 | 1 / 알 수 없음 | OK |
| (사-1) | 200이지만 CSS 청크 참조가 없음 — 임시 서버                          | 1 / 열림     | 1 / 열림     | OK |
| (사-2) | 200이고 CSS 청크를 참조하지만 청크가 404 — 임시 서버                 | 1 / 닫힘     | 1 / 닫힘     | OK |
불일치 관측 합계: 0
```

(마)의 설계 결과: D-LAUNCH-06 설계 (a) "두 상태 수용"이라 (마-1)(마-2)는 게이트 표지와 무관하게 통과한다. REQ-B2CLAUNCH-013의 (가) 닫힘 통과, (나) 열린 상태를 기록된 방식으로 기대하는 구성에서 통과, (다) 2xx가 아니거나 CSS가 서빙되지 않으면 게이트 상태와 무관하게 실패 — 와 어긋나지 않는다((바)(사-1)(사-2)는 모두 종료 코드 1). 열린 상태의 `data-testid`는 쓰지 않는다(`lib/launch/smoke-check.ts`·`scripts/smoke-check.ts`에 `data-testid` 일치 0건).

### 4.7 AC-013 조건별 판정

| AC-013이 요구하는 것 | 증거 | 구분 | 판정 |
|---|---|---|---|
| 일곱 서버 (가)~(사)의 기대 결과 | §4.6, 변경 범위 §4.3 | 재사용 | 충족 |
| (마)의 결과를 기록하고 REQ-013 (가)~(다)와 어긋나지 않음(열람) | §4.6 문단, `progress.md` §E.2 M4 | 열람 | 충족 |
| 교체 뒤 `deploy.yml`에 현행 placeholder 문구 검사가 설계 밖에 남지 않음(열람) | §4.5 diff, 정적 시험 "예전 인라인 검사 … 남아 있지 않다" | 직접 | 충족(교체본 기준) |
| 워크플로 YAML이 파서로 읽힘 | §4.4 정적 시험 8개 | 직접 | 충족 |
| 선결 D-LAUNCH-06 | `progress.md` 결정 기록: 2026-10-03, 설계 (a), 위치 (ii) | 열람 | 충족(BLOCKED 아님) |
| 서명: 엔지니어링·제품 책임자(배포 동작 변경 승인) | 없음 | — | **미수령** |
| (AC 밖) 교체의 `main` 병합과 운영 배포, 실제 Actions 실행, VM 재시작 타이밍, 운영 환경 변수 | — | — | 판정에 쓰지 않음 |

## 4b. AC-014 — 롤백 로컬 관측의 재사용 근거

`scripts/verify-rollback-dark.ts`는 `scripts/verify-gate-reachability.ts`를 import한다. 그런데 롤백 관측 `V74`(2026-10-07 16:28:53) 이후 `56d7e4a`(17:05:50, M3c)가 `verify-gate-reachability.ts`를 163줄 추가·22줄 삭제로 바꿨다(`git log --since='2026-10-07 16:28:30 +0900' d80adc8 -- <앱·하네스 관련 경로>`가 이 커밋 하나만 낸다). 그래서 "이 하네스가 쓰는 모듈은 그 뒤 바뀌지 않았다"는 앞선 재사용 근거는 성립하지 않는다. 하네스를 한 번 다시 실행했다.

```text
pnpm exec tsx scripts/verify-rollback-dark.ts        (로컬 file DB, 원격 접속 없음, 빌드 한 번 + 서버 두 번 기동)
## 롤백 로컬 시험 (AC-B2CLAUNCH-014)
- 롤백 전 합성 접수 상태: 기대 201 / 관측 201 OK
- 롤백 전 /, /result, /consult: 기대 열림(placeholder 아님) / 관측 제목 "보상 진단"·"보상 진단 결과"·"상담 신청", placeholder 문구 없음 OK
- 롤백 전 행 수: 기대 1 / 관측 1 OK
- 롤백 뒤 /, /result, /consult: 기대 placeholder(제목 "서비스 준비 중" + 문구 있음) / 관측 같음 OK
- 롤백 뒤 접수 API 상태: 기대 503 / 관측 503 OK
- 롤백 뒤 접수 API 오류 코드: 기대 policy_unavailable / 관측 policy_unavailable OK
- 롤백 뒤 행 수: 기대 롤백 전과 같음(1) / 관측 1 OK
- 롤백 뒤 전체 열 해시: 기대 롤백 전과 같음 / 관측 같음 OK
- 롤백 환경의 플래그: 기대 5종 모두 true가 아님 / 관측 5종 모두 true가 아님 OK
- 롤백 환경의 시크릿: 기대 설정됨(값 미출력) / 관측 설정됨(값 미출력) OK
불일치 관측 합계: 0
exit=0
```

관측 14개가 모두 기대와 일치했고 로그의 `exit=` 줄이 0이다(백그라운드 작업 알림의 "exit code 0"은 셸 래퍼의 값이라 근거로 쓰지 않았다). 이 실행은 `d80adc8`과 같은 코드에서 한 것이라 AC-014 구현 인수의 근거는 `V74`가 아니라 이 직접 실행이다. 접수 행은 합성 로컬 DB의 것이고 값은 이 문서에 적지 않았다.

AC-014가 "보지 못하는 것"으로 적은 운영 PM2의 환경 재읽기, 롤백 뒤 평범한 재시작이 dark를 유지하는지, 앱이 읽는 효과적 시크릿 자체, 운영 호스트는 이 관측의 대상이 아니고 미충족 근거로 쓰지 않는다.

## 5. Consistency

### 5.1 타입·린트·서식 (직접)

```text
pnpm exec tsc --noEmit                         → (출력 없음)                                  exit=0
pnpm lint                                      → $ eslint .  (경고·오류 줄 없음)               exit=0
pnpm exec prettier --check <PR #24 변경 TS/TSX 65개> → Checking formatting...
                                                 All matched files use Prettier code style!   exit=0
```

65개 파일 목록은 `git diff --name-only 2c244e0 d80adc8 -- lib scripts components app`(`.ts`/`.tsx`)다.

### 5.2 `moai` CLI — 앞선 "미연결"의 정정

앞선 기록은 "`moai` CLI·MCP 미연결"이라 적었다. 이 교정에서 확인한 사실: `moai` 실행 파일은 설치돼 있고(사용자 프로그램 폴더의 `moai.exe`, `moai version` → `moai-adk 3.1.2`) **PATH에만 없었다.** MCP 서버 `moai`의 연결 실패(이 세션에서도 `mcp__moai__*` 도구는 쓸 수 없다)는 별개다. 그래서 `moai spec lint`와 `moai mx`는 직접 실행할 수 있었다.

### 5.3 `moai spec lint` (직접)

```text
moai spec lint .moai/specs/SPEC-B2C-LAUNCH-001/spec.md
✓ No findings — all SPEC documents are valid
exit=0
```

### 5.4 LSP 게이트 — 필수 여부와 대체 증거의 인정 근거

- 필수: `quality.yaml`의 `lsp_quality_gates.enabled: true`, sync 단계 `max_errors 0 / max_warnings 10 / require_clean_lsp true`. `sync.md` Phase 7 "LSP Quality Gates"도 같다.
- 도구 상태: `.moai/config/sections/lsp.yaml`의 `lsp.enabled: false` — 런타임 LSP 서버는 이 프로젝트에서 켜져 있지 않다.
- 대체 증거를 인정하는 근거: `quality.yaml`의 `lsp_integration.diagnostic_sources: [typecheck, lint, security]`가 진단원을 종류(typecheck·lint·security)로 정의한다. 이 프로젝트에서 typecheck = `tsc --noEmit`, lint = `eslint .`이다.
- 결과: typecheck 오류 0(exit 0), lint 오류 0·경고 0(exit 0, 경고 줄 없음, 허용 10) → 두 진단원은 충족. **security 진단원은 실행하지 못했다**(전용 보안 진단 도구가 설치돼 있지 않고 `pnpm audit`의 Critical/High는 Security 차원에서 이미 FAIL이다). 따라서 LSP 게이트는 "typecheck·lint 충족, security 진단원 UNVERIFIED"이고 PASS로 닫지 않는다.

### 5.5 sync Phase 9 — @MX 검증 (직접, 읽기 전용)

필수 여부: `sync/quality-gates-quality.md` Phase 9 — "P1/P2 violations BLOCK sync"(P1 = `fan_in >= 3`인 exported 함수에 `@MX:ANCHOR` 없음, P2 = async 패턴에 `@MX:WARN` 없음). 건너뛰는 방법은 `--skip-mx`(보고서에 기록)뿐이다. 규칙 원문: `.claude/rules/moai/workflow/mx-tag-protocol.md`("`@MX:ANCHOR` — Function has fan_in >= 3 callers"), `.moai/config/sections/mx.yaml`(`thresholds.fan_in_anchor: 3`). 이전 run 단계는 `moai` CLI를 못 써서 @MX를 점검하지 않았다.

방법: PR #24가 추가·수정한 비시험·비fixture `.ts`/`.tsx` 28개 파일을 읽어 (1) `@MX:` 태그 수, (2) 각 exported 함수·상수의 다른 비시험 파일 참조 수(fan_in 대용), (3) `async` 줄을 셌다. `moai mx scan`은 기존 태그를 색인할 뿐 누락을 판정하지 않아서 쓰지 않았다.

```text
files scanned (PR #24 product .ts/.tsx, non-test, non-fixture): 28
@MX: tags present in those files: 0
exported symbols examined: 154
P1 candidates, narrow (distinct other non-test files referencing >= 3): 10   ← 이 중 5개는 일반 단어 `main`의 오탐
P2 pattern lines (async / Promise.all) in those files: 21
```

P1 — 호출 위치를 `git grep`으로 확인한 5개(오탐 `main` 5건은 뺐다):

| 함수 | 정의 | 사용처 | 확인 |
|---|---|---|---|
| `splitCells` | `lib/launch/stage-table.ts:26` | `lib/launch`의 11개 모듈이 import해 호출 | fan_in 11 |
| `findTableWithExtras` | `lib/launch/markdown-table.ts` | 6개 파일 | fan_in 6 |
| `findTableBody` | `lib/launch/markdown-table.ts` | 5개 파일 | fan_in 5 |
| `assembleEnv` | `scripts/verify-flag-runtime.ts:284` | `verify-flag-runtime`(3곳)·`verify-gate-reachability`·`verify-rollback-dark`·`verify-smoke-check` 호출 지점 6곳 | fan_in 6 |
| `runPnpm` | `scripts/verify-flag-runtime.ts:303` | `verify-flag-runtime`(2곳)·`verify-rollback-dark`(2곳)·`verify-smoke-check`(2곳) 호출 지점 6곳 | fan_in 6 |

다섯 개 모두 exported이고 `@MX:ANCHOR`가 없다. P1 위반 5건 확인. `assembleEnv`·`runPnpm`은 이 PR 이전부터 있던 함수지만 이 PR이 export하고(`85c3c2e`) 하네스 셋이 호출하게 해 fan_in을 늘렸다. 이 5건의 `fan_in`은 호출·import 위치를 센 값이고, TypeScript에 대한 정식 fan_in 계산 도구는 이 저장소에서 찾지 못했다.

P2 — `async` 함수 21개를 대상으로, 함수 본문에 `try {` 또는 `.catch(`가 있는지 휴리스틱(중괄호 짝 맞추기)으로 봤다: 있음 7, 없음 14.

```text
NO-TRY lib/launch/smoke-check.ts:84 (arrow) · scripts/smoke-check.ts:16 main · scripts/verify-flag-runtime.ts:391 observe, :473 main
NO-TRY scripts/verify-gate-reachability.ts:303 observe, :323 observeCross, :368 main
NO-TRY scripts/verify-rollback-dark.ts:138 observePages, :147 postConsultation, :159 snapshotRows
NO-TRY scripts/verify-smoke-check.ts:196 startTempServer, :308 observeState, :311 (arrow), :343 main
```

TypeScript의 P2 기준은 문서에 "async functions without try/catch"라고만 있다. 오류를 호출자에게 전파하는 것이 의도인 함수(예: `main`을 감싸는 최상위 처리)를 구분하려면 각 함수의 오류 전파를 읽어야 하는데 읽지 않았다. **P2는 후보이고 판정은 UNVERIFIED다.**

판정: Phase 9는 **미충족**(P1 5건 확인). 이것은 4차원 점수(Consistency)와 별개의 sync 필수 단계이고, 규칙대로면 sync 종결을 막는다. 해소하는 길은 둘이다 — 태그를 다는 코드 주석 변경을 별도로 하거나, `--skip-mx`와 사유 기록으로 건너뛰는 것. 어느 쪽도 이 교정에서 하지 않았다(코드 변경과 우회 모두 사용자 결정).

> 위 §5.5는 해소 전(`d80adc8` 기준) 기록이다. 해소는 아래 §5.6이다.

### 5.6 sync Phase 9 해소 — 태그 추가와 재점검 (직접, 2026-10-08)

사용자가 지시한 대로 sync 브랜치(원격 HEAD `98d5827`과 같은 작업 트리)에서 **주석만** 추가했다. 실행 로직·오류 처리 흐름·API·환경 설정·`spec.md`·`plan.md`·`acceptance.md`·운영 DB·플래그·워크플로는 바꾸지 않았고 `--skip-mx`와 프로필 예외는 쓰지 않았다.

#### 5.6.1 변경 범위

```text
$ git diff --stat
 lib/launch/markdown-table.ts        | 6 ++++++
 lib/launch/stage-table.ts           | 3 +++
 scripts/verify-flag-runtime.ts      | 9 +++++++++
 scripts/verify-gate-reachability.ts | 9 +++++++++
 4 files changed, 27 insertions(+)
삭제된 줄: 0 / 주석(`//`)으로 시작하지 않는 추가 줄: 0
```

(이 문서와 `progress.md`의 변경은 위 코드 diff에 포함하지 않았다.)

#### 5.6.2 fan_in 재점검 — 두 가지 세는 방식

fan_in은 "이 함수를 부르는 곳의 수"다. 규칙 문구는 `Function has fan_in >= 3 callers`(`mx-tag-protocol.md`)이고 TypeScript용 계산 도구는 없다. `moai mx query`의 `fan_in` 필드는 TypeScript 색인에 채워지지 않는다(JSON에 필드 자체가 없음). 그래서 PR #24가 추가·수정한 비시험·비fixture `.ts`/`.tsx` 28개 파일의 내보낸 함수·상수 154개를 두 방식으로 직접 셌다.

- **방식 A — 외부 import 파일 수**: `import` 문 기준으로 정의 파일을 뺀 서로 다른 비시험 파일 수(단어 일치가 아니다). 4개가 3 이상이다: `splitCells` 11, `findTableWithExtras` 6, `findTableBody` 5, `assembleEnv` 3.
- **방식 B — 호출하는 함수 수**: 파일 안 호출을 포함해 서로 다른 호출 함수 수(규칙 문구 "callers"의 가장 자연스러운 읽기). 9개가 3 이상이다. **사용자 결정으로 방식 B를 채택했다.**

두 방식 모두 호출 지점은 `git grep`으로 손으로 대조했다. 스캐너의 오탐 두 가지를 걸렀다 — 문자열 안의 `assembleEnv(`(`verify-gate-reachability.ts:413`), 전개 호출 `...buildMismatchProbe()`를 놓친 것.

| 함수 | 위치(`d80adc8`) | 호출 지점 | 호출 함수 | 호출 파일 | 외부 import 파일 | 구분 |
|---|---|---|---|---|---|---|
| `splitCells` | `lib/launch/stage-table.ts:26` | 17 | 15 | 12 | 11 | 처음 5개 |
| `findTableWithExtras` | `lib/launch/markdown-table.ts:11` | 6 | 6 | 6 | 6 | 처음 5개 |
| `findTableBody` | `lib/launch/markdown-table.ts:34` | 6 | 5 | 5 | 5 | 처음 5개 |
| `assembleEnv` | `scripts/verify-flag-runtime.ts:284` | 6 | 6 | 4 | 3 | 처음 5개 |
| `runPnpm` | `scripts/verify-flag-runtime.ts:303` | 6 | 4 | 3 | 2 | 처음 5개, **경계 사례** |
| `extractTitle` | `scripts/verify-flag-runtime.ts:84` | 6 | 5 | 3 | 2 | 재점검에서 추가 |
| `checkPreconditions` | `scripts/verify-gate-reachability.ts:174` | 3 | 3 | 3 | 2 | 재점검에서 추가 |
| `extractApiCode` | `scripts/verify-gate-reachability.ts:185` | 3 | 3 | 2 | 1 | 재점검에서 추가 |
| `buildMismatchProbe` | `scripts/verify-gate-reachability.ts:203` | 4 | 4 | 2 | 1 | 재점검에서 추가 |

- 시험 파일은 세지 않았다. 시험 파일이 부르는 것은 `splitCells`(2곳)와 `findTableBody`(2곳, 모두 `lib/diagnosis/flags.gate-table.test.ts`)뿐이다. `assembleEnv`·`runPnpm`은 시험 파일이 직접 부르지 않는다.
- **같은 이름의 함수**: `verify-gate-reachability.ts:281`에 비공개 지역 `runPnpm`이 따로 있다(자기 `main`에서 2곳 호출). `verify-flag-runtime.ts`가 내보낸 `runPnpm`과 다른 함수이고 import 관계도 없어 세지 않았다. 호출 함수는 이 파일의 `build`·`main`, `verify-rollback-dark.ts`의 `main`, `verify-smoke-check.ts`의 `main`이다.
- **§5.5 표 정정**: 위 §5.5 표의 `fan_in` 열은 호출 지점 수와 파일 수가 섞인 값이었다. `runPnpm`이 3개 다른 파일에서 쓰인다고 센 것은 이름이 같은 지역 함수가 있는 `verify-gate-reachability.ts`를 한 파일로 센 결과였다. 바로잡은 값이 위 표다. `runPnpm`은 호출 함수 기준으로는 4라 충족하지만 외부 import 파일 기준으로는 2라 미달이므로, 처음 5개 중 어느 기준을 쓰느냐에 따라 필수 여부가 갈리는 것은 `runPnpm`뿐이다.
- 처음 5개와 재점검에서 나온 4개 모두 내보낸(exported) 함수이고, 재점검 4개는 PR #24가 추가·수정한 파일에 정의돼 있다.

#### 5.6.3 추가한 태그

각 함수 바로 위에 `@MX:ANCHOR: [AUTO] …`, `@MX:REASON: …`, `@MX:SPEC: SPEC-B2C-LAUNCH-001` 세 줄을 한국어(`language.yaml` `code_comments: ko`)로 달았다. REASON에 호출 지점·호출 함수·파일 수를 적었다. 파일당 개수(한도: ANCHOR 3·WARN 5·NOTE 10·TODO 5):

| 파일 | ANCHOR | REASON | WARN·NOTE·TODO |
|---|---|---|---|
| `lib/launch/stage-table.ts` | 1 | 1 | 0 |
| `lib/launch/markdown-table.ts` | 2 | 2 | 0 |
| `scripts/verify-flag-runtime.ts` | 3 | 3 | 0 |
| `scripts/verify-gate-reachability.ts` | 3 | 3 | 0 |

`moai mx scan`(CLI `moai-adk 3.1.2`, 전체 경로로 호출) 결과: 태그 34개 기록(ANCHOR 27·NOTE 4·WARN 2·DEBT 1), 내 ANCHOR 9개 모두 색인되고 REASON이 비어 있지 않다. 스캐너 경고 2건(`lib/pipeline/evidence-retriever.ts:16`, `scripts/env-local-safety.ts:132`의 REASON 누락)은 PR #24의 28개 파일 밖이며 이번에 고치지 않았다. 스캔 오류 5건(비치명)의 내용은 확인하지 못했다.

엔진 준비 오라클(`lib/launch/engine-ready-oracle.test.ts`)은 줄 번호가 아니라 줄 내용으로 대조하고 `//` 시작 줄을 거른다. `verify-flag-runtime.ts`의 허용 줄은 주석 때문에 `:174`·`:293`에서 `:177`·`:299`로 밀렸다(`grep -n`으로 확인). 시험은 통과한다.

#### 5.6.4 P2 후보 14건 — 개별 판독

기준: TypeScript `async ` 패턴의 설명은 "Async function may require try/catch"(`mx.yaml`)다. 문자열이 아니라 실패 경로를 봐서, **실패가 어디서도 처리되지 않거나 실패했을 때 자원이 새면** 위반으로 본다. 위치는 `d80adc8` 기준이다.

공통 근거 두 가지: ① `startManagedServer`(`scripts/visual-verify-server.ts:268-282`)는 준비 확인이 실패하면 자식 프로세스 트리를 정리하고 원래 오류를 다시 던진다 — 그래서 호출자가 `await startManagedServer(…)`를 `try` 밖에 둬도 새는 자원이 없다. ② 각 스크립트의 `main`은 직접 실행될 때 최상위 `main().then(ok, 오류 처리)`가 메시지를 출력하고 `process.exitCode = 1`로 끝낸다.

| # | 함수 | 오류 처리·호출자·최상위 catch·자원 정리 | 판정 |
|---|---|---|---|
| 1 | `lib/launch/smoke-check.ts:84` `createSmokeFetch`가 돌려주는 화살표 함수 | `fetch` 거부(연결 실패·시간 초과)를 이 함수는 잡지 않는다. 이 함수를 부르는 곳은 `attemptFetch`(113-120)뿐이고 `try/catch`로 상태 0으로 바꾼다. 응답 본문은 `drain`(`try/catch`)이 읽어 버린다 | 위반 아님 |
| 2 | `scripts/smoke-check.ts:16` `main` | 인자 오류는 `parseSmokeArgs`가 결과 값으로 돌려준다(주소 파싱은 `try/catch`). 네트워크 실패는 `runSmokeCheck` 안 `attemptFetch`가 처리한다. 최상위 `.then(ok, 오류 처리)`(40-51)가 있고 자원이 없다. 시험은 서버를 `try/finally`로 닫는다 | 위반 아님 |
| 3 | `scripts/verify-flag-runtime.ts:391` `observe` | 직접 처리는 없다. 부르는 곳은 `startAndObserve`뿐이고 `try { return await observe(…) } finally { managed.stop() }`로 서버를 반드시 끈다. 실패는 `main`을 거쳐 최상위로 간다 | 위반 아님 |
| 4 | `scripts/verify-flag-runtime.ts:473` `main` | 잘못된 인자·마이그레이션·빌드 실패는 `throw`되고 최상위 `.then(ok, 오류 처리)`(551-559)가 `exitCode = 1`로 끝낸다. 서버는 `startAndObserve`의 `try/finally`에만 있고 동기 `spawnSync`(`runPnpm`)는 새는 자원이 없다 | 위반 아님 |
| 5 | `scripts/verify-gate-reachability.ts:303` `observe` | 부르는 곳은 `observeWithServer`(347-366)뿐이고 `try/finally`로 서버를 끈다. 안에서 쓰는 `countConsultations`(293-301)는 `try/finally`로 DB 클라이언트를 닫는다 | 위반 아님 |
| 6 | `scripts/verify-gate-reachability.ts:323` `observeCross` | 5번과 같다(`observeWithServer`의 `try/finally`, `countConsultations`의 `finally`) | 위반 아님 |
| 7 | `scripts/verify-gate-reachability.ts:368` `main` | 사전 점검·계획 실패는 반환 코드 2, 빌드·마이그레이션 실패는 `throw`되고 최상위 `.then(ok, 오류 처리)`(436-445)가 처리한다. 서버는 `observeWithServer`의 `try/finally`에서만 열린다 | 위반 아님 |
| 8 | `scripts/verify-rollback-dark.ts:138` `observePages` | `main`의 `try/finally`(198-204, 211-217) 안에서만 불리고 `finally`가 서버를 끈다 | 위반 아님 |
| 9 | `scripts/verify-rollback-dark.ts:147` `postConsultation` | 8번과 같다 | 위반 아님 |
| 10 | `scripts/verify-rollback-dark.ts:159` `snapshotRows` | 함수 안에 `try/finally { client.close() }`가 있다(휴리스틱이 반환 타입의 `{`를 본문으로 오인해 놓쳤다). 실패는 `main`을 거쳐 최상위로 간다 | 위반 아님 |
| 11 | `scripts/verify-smoke-check.ts:196` `startTempServer` | `listen` 오류는 `reject`로 전파되고 그때 서버는 바인딩되지 않아 닫을 것이 없다. 금지 포트면 서버를 닫고 다시 고른다. 호출자는 반환된 서버를 닫는다 — `observeState`와 시험 3곳은 `try/finally`로, 시험 1곳(`verify-smoke-check.test.ts:194`)은 시작 직후 곧바로 `stop()`을 부른다 | 위반 아님 |
| 12 | `scripts/verify-smoke-check.ts:308` `observeState` | 두 갈래 모두 `try { … } finally { 서버 정리 }`가 있다(휴리스틱이 반환 타입의 `{`를 오인해 놓쳤다) | 위반 아님 |
| 13 | `scripts/verify-smoke-check.ts:311` `run`(`observeState` 안 화살표 함수) | 두 갈래의 `try` 안에서만 불린다. `runSmokeCli`는 자식 프로세스 오류를 `reject`로 돌려주고 자체 자원이 없다 | 위반 아님 |
| 14 | `scripts/verify-smoke-check.ts:343` `main` | 사전 점검 실패는 반환 코드 2, 빌드·마이그레이션 실패는 `throw`되고 최상위 `.then(ok, 오류 처리)`(381-389)가 처리한다. 서버는 `observeState`의 `finally`에서만 열린다 | 위반 아님 |

- 결과: 위반 0건, `UNVERIFIED` 0건, `@MX:WARN` 추가 0건. 같은 스캔의 나머지 async 함수 7개(`drain`·`attemptFetch`·`runSmokeCheck`·`startAndObserve`·`countConsultations`·`observeWithServer`·`verify-rollback-dark`의 `main`)는 직접 `try/catch`·`try/finally`가 있어 처음부터 후보가 아니었다.
- **남은 관찰(범위 밖, 바꾸지 않음)**: 3·5·6·8·9번이 부르는 `fetch`에는 시간 상한(`signal`)이 없다. 응답이 영영 오지 않으면 `finally`의 서버 정리까지 가지 못하고 멈춘다. 오류 처리의 결함이 아니라 대기 문제이며 이번 범위(주석만)에서 다루지 않았다.

#### 5.6.5 검증 출력 (직접, 작업 트리 = 원격 HEAD `98d5827` + 위 주석)

```text
$ pnpm exec prettier --check <변경 코드 4개>        → All matched files use Prettier code style!   (대조군: 서식이 틀린 입력이 const a = 1; 로 고쳐짐)
$ pnpm exec eslint <변경 코드 4개>                   → exit=0, 출력 없음
$ vitest run lib/launch lib/diagnosis/flags.gate-table.test.ts scripts/verify-flag-runtime.test.ts \
    scripts/verify-gate-reachability.test.ts scripts/verify-rollback-dark.test.ts \
    scripts/verify-smoke-check.test.ts scripts/smoke-check.test.ts
                                                     → Test Files 28 passed (28), Tests 591 passed (591), exit=0
$ moai mx scan                                       → OK: wrote 34 tags (ANCHOR 27), exit=0
```

- 재사용: `tsc --noEmit`·`pnpm lint` 전체·전체 시험 137개 파일은 다시 돌리지 않았다. 코드가 §5의 `exit=0` 실행 때와 같고 이번 변경은 주석 27줄뿐이다(위 diff). 서버를 띄우는 하네스(`verify:*`)와 `pnpm build`도 다시 돌리지 않았다.
- 한계: P2는 코드를 읽은 판단이고 오류를 일부러 일으켜 보지는 않았다. 권고 등급인 P3(긴 exported 함수의 `@MX:NOTE`)·P4(시험 없는 public 함수의 `@MX:TODO`)는 보지 않았다. `moai mx scan`은 기존 태그를 색인할 뿐 누락을 판정하지 않으므로 누락 여부는 위 두 가지 직접 계산이 근거다.

**판정(Phase 9)**: P1 — 호출 함수 수 기준 9개 모두 태그됨(외부 import 파일 수 기준 4개도 포함). P2 — 14건 모두 위반 아님. Phase 9는 **충족**이다. 이것은 4차원 판정과 전체 판정(FAIL)을 바꾸지 않는다.

## 6. S-2 — 점검기가 부분 정의표로 "공개 가능"을 출력하는지

### 6.1 최소 입력 (이 문서에 전문을 적는다 — 파일은 비추적 폴더에 두었다)

`--items` (정의표 한 행짜리):

```text
| ID | 항목 | 표면 | I | G | 근거 | 대상 / 무효화 사건 |
|---|---|---|---|---|---|---|
| L-04 | 플래그 조합표 로컬 검증 기록 | 전체 | 필수 | 필수 | LF-05 | 게이트 검증 파일 집합 / EV-L1 |
```

`--record`:

```text
| 식별자 | 증명하는 것 | 산출물 보관 위치 | 서명 또는 관측 역할 | 날짜 | 대상 | 무효화 사건 | 상태 |
|---|---|---|---|---|---|---|---|
| L-04 | 조합표 로컬 검증 | store-ref | engineering | 2026-10-08 | T-L04-v1 | EV-L1 | READY |
```

`--signature`:

```text
| 서명 역할 | 날짜 | 실행 환경 |
|---|---|---|
| product-owner | 2026-10-08 | production |

| 식별자 | 상태 | 대상 |
|---|---|---|
| L-04 | READY | T-L04-v1 |
```

`--targets`: `{"L-04": "T-L04-v1"}`. 값은 모두 합성 값이다.

### 6.2 실행 (직접, 실제 CLI)

A. 한 행짜리 표:

```text
pnpm exec tsx scripts/check-launch-gate.ts --items <items-one.md> --record <record.md> --environment production --stage G --surfaces S1 --signature <sig.md> --allowed-roles product-owner --targets <targets.json>
실행 환경: production
요청 형태: 운영 단계 점검 (목적 단계 G)
목적 벡터: S1
L-04: READY
서명 점검: 통과 (서명 1건)
판정: 일반 사용자 공개 가능
exit=0
```

B. 같은 기록·서명, `--items`만 정식 `spec.md`로 바꿈:

```text
pnpm exec tsx scripts/check-launch-gate.ts --items .moai/specs/SPEC-B2C-LAUNCH-001/spec.md --record <record.md> --environment production --stage G --surfaces S1 --signature <sig.md> --allowed-roles product-owner --targets <targets.json>
L-01: 기록에 없다 — 필수 항목이 기록에 없으면 READY로 볼 수 없다
L-02: 기록에 없다 — … [결정 대기 칸 — 결정 기록이 없어 필수로 취급]
L-04: READY
L-05, L-06, L-07: 기록에 없다 …
L-08: 기록에 없다 … [결정 대기 칸 …]
L-09, R-02, R-03, R-04: 기록에 없다 …
R-05: 기록에 없다 … [결정 대기 칸 …]
서명 점검: 서명이 덮지 않은 필수 항목 식별자: L-01, L-02, L-05, L-06, L-07, L-08, L-09, R-02, R-03, R-04, R-05
불가 사유: 필수 항목이 READY가 아니다 — L-01, L-02, L-05, L-06, L-07, L-08, L-09, R-02, R-03, R-04, R-05
판정: 일반 사용자 공개 불가
exit=1
```

외부 검토가 보고한 결과(두 경우의 종료 코드 0 / 1과 문구)가 그대로 재현됐다. 점검기는 필수 항목 집합을 `--items`로 받은 표에서만 계산한다(`scripts/check-launch-gate.ts:298–318`의 `requiredItemIds`). 표의 출처·개수·digest를 보는 코드는 없다(`digest`·`sha256`·`canonical`·`정식` 검색 일치 0건). 시험의 기본 표 입력은 실제 `spec.md`다.

### 6.3 SPEC·AC·런북과의 대조

| 출처 | 문구 | 이 문제에 대해 말하는 것 |
|---|---|---|
| `spec.md` §2.4 "점검 요청의 두 형태"(131행) | 점검기는 "목적 단계의 열(I 열 또는 G 열)의 필수 항목 전체를 읽고" | "필수 항목"은 §2.4 정의표가 정한다. 점검기가 그 표를 어떻게 얻는지는 정하지 않았다 |
| REQ-B2CLAUNCH-002(198행) | "…출시 절차는 노출 확대 단계를 수행해서는 안 된다. … 점검은 기록의 상태 칸과 입력으로 받은 현재 대상 값만 읽는다." 점검기가 거부하는 것으로 적은 것은 요청 형태(실행 환경·목적 단계) | 의무의 주체는 "출시 절차"다. 표의 출처·완전성 검사는 점검기의 거부 목록에 없다 |
| REQ-B2CLAUNCH-008(204행) | 서명 기록이 담은 항목 집합은 "그 단계의 필수 항목 집합과 같아야" 한다 | 집합 동일성의 기준은 "그 단계의 필수 항목 집합"이다. 점검기는 입력 표로 그 집합을 계산한다 |
| `spec.md` §2.4(147행) | I→G 이행의 "집행 지점은 REQ-002와 REQ-008의 절차 규칙 하나이며 저장소의 어떤 산출물도 … 기계적으로 막지 못한다(N11)" | 집행을 절차에 둔다고 SPEC이 밝혔다 |
| AC-B2CLAUNCH-002(23, 26행) | Given "항목 정의표(`spec.md` §2.4)"; "점검기는 이 표를 입력으로 받을 때 같은 규칙으로 통과해야 한다"; 보지 못하는 것: 사건 감지·운영 호스트 손 변경(N11)·실행 환경 입력의 진위 | AC는 정식 표를 입력으로 받는 경우의 통과를 시험한다. 부분 표를 거부해야 한다고도, 보지 못한다고도 적지 않았다 |
| 런북 점검기 호출(429행) | `--items <항목 정의표 문서>` | 파일을 고정하지 않는다. 정의표를 담은 문서는 `spec.md`와 런북 둘이다 |
| 런북 "항목 상태 갱신 절차" 6·8항(399, 401행) | "정의표 자체는 `spec.md`가 소유하므로 …", "정의표나 점검 규칙이 바뀌어 필수 항목 집합이 달라지면 … 서명을 다시 받는다" | 정의표가 SPEC 소유의 표라는 전제는 있다. 그 표를 `--items`로 넘겼는지 확인하는 단계는 적지 않았다 |
| 런북 "이 점검으로는 알 수 없다"(435행) | 사건·대상 값 계산·서명 진위·형제 참조 줄의 적절성 등을 열거 | 표 출처·완전성은 열거되지 않았다 |

### 6.4 분류

- **기존 명시 요구 위반이 아니다.** 어떤 REQ·AC도 점검기에게 입력 표가 정식·완전한지 확인하라고 요구하지 않고, 그럴 필요가 없다고도 하지 않는다. SPEC은 집행을 출시 절차에 둔다고 적었다(REQ-002, §2.4 147행). 따라서 "차단 결함"으로 분류하지 않는다. "설계상 선택 사항"으로도 분류하지 않는다 — 전제가 문서 어디에도 적혀 있지 않기 때문이다.
- **신뢰 전제의 한계다.** 전제: "호출하는 절차가 `--items`로 `spec.md` §2.4의 정식 정의표(현재 판, 변경·삭제 없는 전체)를 넘긴다." 보장 주체: SPEC 기준으로는 출시 절차(호출하는 쪽). 실제 보장 절차: **미확인 — 찾지 못했다**(런북에 `--items`를 `spec.md`로 정하는 문장이 없고, 출력의 필수 항목 목록을 §2.4와 대조하는 단계가 없고, CI 검사도 없다).
- 영향: REQ-008의 "서명이 필수 항목 전체를 덮는다"는 보장은 같은 입력 표를 기준으로 하므로 이 전제가 깨지면 함께 약해진다(위 A의 결과).
- **이번 작업에서 하지 않은 것**: 코드·런북·SPEC 수정. 선택지만 적는다 — (i) 런북에 `--items`를 `spec.md`로 정하고 출력의 필수 항목 식별자 목록을 §2.4 정의표와 사람이 대조하는 단계를 적는 문서 변경, (ii) 점검기가 표의 출처를 고정하는 코드 변경(출처 형태가 SPEC 결정이라 사용자 결정 필요). 출력에 항목 수나 digest를 덧붙이는 것은 불일치를 사람 눈에 띄게 할 뿐이고, 틀린 표를 넘기는 호출 자체를 막지는 못한다 — 막으려면 점검기 밖에 독립된 기준이 있어야 한다. 이 선택지들은 수정 범위에 넣지 않았다.

## 7. 관측하지 못한 것 (Gaps)

- 운영 호스트·프록시·외부 도달성, 노출 플래그와 PM2 저장 환경, 운영 DB, `appleboy/ssh-action`을 거친 실제 워크플로 실행(AC가 보지 못한다고 적은 것 포함).
- 저장소 전체 커버리지(프로젝트 기본 대상 `app`·`components`·`lib` 전체), 하네스의 프로세스 밖 실행 경로의 커버리지, run 단계의 커밋별 커버리지(`min_coverage_per_commit: 80`).
- `pnpm test` 전체(137 파일)와 `pnpm build`의 `d80adc8` 재실행(코드가 같은 `7bda045`·`45c1a32` 기록을 재사용 — 변경 범위: 문서 둘), `pnpm test:e2e`, `pnpm visual:verify`.
- `reachability`·`flag-runtime` 하네스의 `d80adc8` 재관측(재사용: 관측 시각 17:09·16:02 이후 앱·하네스 관련 경로의 변경은 `56d7e4a`뿐이고 `V94`는 그 뒤에 실행됐다).
- LSP security 진단원, 전용 비밀 스캐너(`git diff 2c244e0 d80adc8`를 grep으로만 훑었고 실제 자격증명 형태 0건), 교차 모델 감사(`audit_multi`·codex·GLM: MCP 연결 실패).
- P2 후보 14건은 §5.6.4에서 코드를 읽어 판단했다. 오류를 일부러 일으키는 시험과 권고 등급 P3·P4 점검은 하지 않았다.

## 8. 로컬 증거 위치 (git이 무시, 저장소에 올라가지 않음)

`.moai/state/verify/sync-launch001/`: `r2-coverage.log`, `coverage-r2/coverage-summary.json`, `r2-tsc.log`, `r2-lint.log`, `r2-prettier.log`, `r2-rollback-dark.log`, `r2-deploy-yml.diff`, `s2/`(S-2 입력 4개와 `run-A.out`·`run-B.out`), 앞선 감사의 `vitest-coverage.log`·`vitest-coverage-v2.log`·`coverage/coverage-summary.json`·`pnpm-audit*.json`·`deploy-run-37729280763.log`·`sync-audit-report.md`. `.moai/state/verify/launch-run/`의 `V64`·`V65`·`V74`·`V94`·`VB4-test-A.log`.
