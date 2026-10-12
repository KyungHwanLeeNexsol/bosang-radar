# SPEC-B2C-LAUNCH-001 — sync 후속 기록 (새 main 기준 SHA `1296890`)

`progress.md` §E.4 끝의 "후속 기록" 소절이 기대는 명령·핵심 출력·판정 근거를 모은 문서다. `spec.md`·`plan.md`·`acceptance.md`가 아니므로 계획 감사의 해시 대상이 아니다.

- **이 문서는 새 감사가 아니다.** `d80adc8` 기준 SPEC 전체 감사와 그 교정은 `sync-evidence-d80adc8.md`와 `progress.md` §E.4 본문에 **역사적 기록으로 그대로 보존**돼 있고 이 문서는 그것을 고치지 않는다. 여기에는 `d80adc8` 이후 `main`에 들어간 PR #26·#27과 배포 #37·#38, 그 뒤의 읽기 전용 관측을 **별도로** 적는다.
- 대상: `main` = 병합 커밋 `1296890816f0a79ba0d7216aab1ee3e0c4e15423`(PR #27). 이 기록을 쓴 작업 트리는 sync 브랜치에 그 `main`을 일반 merge한 커밋 `50b263f91fe057152254bf0250bd4b03f3b50357`(부모 `0504976`·`1296890`) 위다.
- 구분: **직접** = 이 작업에서 실행해 출력을 읽은 것. **재사용** = 앞선 기록을 쓰되 변경 범위를 확인한 것. **미확인** = 하지 못했거나 근거가 성립하지 않은 것.
- 이 문서에는 시크릿 값, 환경변수 값, DB 내용, 운영 호스트의 접속 정보(주소·계정·키·포트), 앱 이름과 앱 폴더 경로를 적지 않았다. 원문 로그는 git이 무시하는 `.moai/state/verify/sync-launch001/`에 있고(§9) 이 저장소에 올라가지 않는다.
- 시각은 모두 UTC(`Z`)다. 한국 시간은 +9시간이다.

## 1. 한눈에 보는 표

| § | 항목 | 결과 | 구분 |
|---|---|---|---|
| 2 | PR #26 → `eee8281`, 배포 #37 실패 → PR #27 → `1296890`, 배포 #38 성공 | 아래 타임라인 | 직접(GitHub API·실행 로그) |
| 3 | 배포 #38 로그 | Next.js 16.3.8 빌드·TypeScript 완료, PM2 재시작 `online`, 서버 안 smoke 3종 OK | 직접(`gh run view --log`) |
| 4 | 운영 읽기 전용 관측(배포 6분 뒤) | `online`·`v16.3.8`·작업 폴더 정상·산출물 존재·홈 200·참조 CSS/JS 13/13 200(서버 안·공개 주소 모두) | 직접(SSH 읽기 전용, 공개 주소 `curl`) |
| 5 | 배포 장애 복구 | **복구 확인**(관측 시각 기준, 범위·한계 명시) | 판정 |
| 6 | Security | **FAIL 유지** — prod 감사 `{critical 0, high 1, moderate 0, low 0}`, high 1건은 `braces` | 직접(`pnpm audit --prod`) |
| 7 | 재사용한 검증 | Phase 9 충족 등 — 변경 범위 확인 후 재사용 | 직접(범위 확인) / 재사용 |
| 8 | 하지 않은 것 | 새 의존성 트리에서 시험·빌드·커버리지 재실행 없음 등 | 미확인 |
| 9 | 승격하지 않는 것 | L-01 기록이 아니고 운영 공개 승인이 아니다 | 선언 |

## 2. 기준 SHA와 타임라인 (직접: `gh api`)

```text
# 조회 시작(이 작업): 2026-10-12T02:11:34Z
main: refs/heads/main -> 1296890816f0a79ba0d7216aab1ee3e0c4e15423
```

| 시각(UTC) | 사건 | 근거 |
|---|---|---|
| 00:37:37 | PR #26(`security/deps-g1-g3`, 머리 `b5c868999d5e7befd42f4004bca0e99d7cefd7c1`, 파일 3개 +270/-244)이 병합 커밋 `eee828145d54b37e096ce180fd1012483b6d103e`로 병합 | `gh api repos/…/pulls/26` → `merged_at`, `merge_commit_sha` |
| 00:37:39 ~ 00:47:50 | 배포 **#37** — run `38188727993`, push, `head_sha` `eee8281`, 결론 **failure** | `gh api …/actions/runs/38188727993` |
| 02:04:33 | PR #27(`fix/deploy-command-timeout`, 머리 `f63b8e1af1a21de5d3a5a84f47fbfd9ea173c5a2`, `deploy.yml` 1개 파일 +1/-0)이 병합 커밋 `1296890816f0a79ba0d7216aab1ee3e0c4e15423`으로 병합 | `gh api …/pulls/27` |
| 02:04:36 ~ 02:06:56 | 배포 **#38** — run `38194369077`, push, `head_sha` `1296890816f0a79ba0d7216aab1ee3e0c4e15423`, 결론 **success** | `gh api …/actions/runs/38194369077` |
| 02:11:34 ~ 02:12:29 | 이 작업의 배포 후 관측(§4) | 아래 |

**PR #26이 바꾼 것** (`git diff d80adc8 origin/main`의 `package.json`·`pnpm-workspace.yaml`, 직접). `next`·`@next/env`·`eslint-config-next`가 `16.3.2` → `16.3.8`. `pnpm-workspace.yaml`에 보안 권고 대응용 `overrides` 18줄 추가(`proxy-addr` 2.0.8, `qs` 6.16.0, `hono` 4.13.7, `fast-uri` 3.1.8, `brace-expansion@^5.0.8` 5.0.12, `ip-address` ^10.7.1). `pnpm-lock.yaml` 490줄 변경. 이 SPEC의 소스·시험 파일은 바뀌지 않았다(§7).

**PR #27이 바꾼 것** (직접). `.github/workflows/deploy.yml`의 SSH 배포 단계에 아래 한 줄만 추가했다. 따라서 `eee8281`의 `deploy.yml`에는 `command_timeout` 입력이 없었다.

```text
+          command_timeout: 20m
```

**배포 #37 실패 로그** (`gh run view 38188727993 --log`, 로컬 사본 §9, 핵심 줄):

```text
2026-10-12T00:37:51Z HEAD is now at eee8281 Merge pull request #26 from …/security/deps-g1-g3
2026-10-12T00:40:46Z ▲ Next.js 16.3.8 (Turbopack)
2026-10-12T00:45:45Z ✓ Compiled successfully in 4.8min
2026-10-12T00:45:46Z   Running TypeScript ...
2026-10-12T00:47:47Z 2026/10/12 00:47:47 Run Command Timeout
2026-10-12T00:47:47Z ##[error]Process completed with exit code 1.
```

- `Finished TypeScript` 줄이 없다. 이 배포에서 **TypeScript 결과는 관측되지 않았다.**
- 입력 목록이 찍힌 00:37:44.3Z부터 시간 초과 메시지까지 약 10분 3초다. 이 간격은 로그의 두 시각에서 계산한 값이다. 액션의 기본 `command_timeout`이 10분이라는 점은 앞선 세션 기록이고 이번에 문서를 다시 읽어 확인하지는 않았다.
- 같은 로그의 `next build`가 중간에 끊긴 뒤 운영 앱이 어떤 상태가 되었는지는 §2의 다음 항목과 §4가 따로 관측했다.

**배포 #37 직후 운영 상태** (직접, 이 대화에서 앞서 한 읽기 전용 관측 2026-10-12T01:39:49Z ~ 01:42:16Z, 병합 전):

```text
process_title=next-server (v16.3.2)
proc_cwd_deleted=YES
standalone_dir_exists=NO / standalone_server_js_exists=NO / BUILD_ID_exists=NO
홈 / -> 200 (서버 안·공개 주소)
참조 CSS -> 500, 참조 JS -> 500 (서버 안·공개 주소)
```

## 3. 배포 #38 로그에서 읽은 것 (직접: `gh run view 38194369077 --log`)

- 작업 `deploy` 02:04:38Z ~ 02:06:55Z `success`. 단계 `Deploy over SSH (build-first, restart-only-on-success)` `success`. 로그 끝 `duration_ms=133584`.
- 로그 입력 목록에 `command_timeout: 20m`이 있다(PR #27의 줄이 적용됐다).
- 서버 안(루프백)에서 워크플로가 한 검사다. 외부에서의 접근은 §4의 별도 관측이다.

```text
02:04:46Z HEAD is now at 1296890 Merge pull request #27 from …/fix/deploy-command-timeout
02:05:07Z ✅ 마이그레이션 완료
02:05:17Z ▲ Next.js 16.3.8 (Turbopack)
02:05:56Z ✓ Compiled successfully in 35.7s
02:05:56Z   Running TypeScript ...
02:06:31Z   Finished TypeScript in 35.5s ...
02:06:39Z ✓ Generating static pages using 1 worker (4/4) in 623ms
02:06:39Z Turbopack build encountered 1 warning:  ./instrumentation.ts:33:7  (process.exit, Edge Runtime 경고)
02:06:49Z == restart (build already succeeded, safe to restart) ==
02:06:50Z [PM2] [***](0) ✓   … │ 0 │ *** │ default │ 0.1.0 │ fork │ 363382 │ 0s │ 36 │ online │ …
02:06:51Z [PM2] Successfully saved in …/.pm2/dump.pm2
02:06:51Z   attempt 1/10: GET <loopback>/ -> HTTP 000 (retry in 2s)
02:06:54Z OK: GET <loopback>/ responded 200
02:06:54Z OK: placeholder text present in <loopback>/
02:06:54Z OK: GET /_next/static/chunks/2q7cbcwz7lgei.css responded 200
02:06:54Z   GET /login -> HTTP 404 (expected 404; informational, not a deploy gate)
02:06:54Z   GET /cases/new -> HTTP 404 (expected 404; informational, not a deploy gate)
02:06:54Z ✅ Successfully executed commands to all hosts.
```

- `instrumentation.ts` 경고 1건(Edge Runtime에서 지원되지 않는 `process.exit`)은 `progress.md` §E.2의 앞선 `pnpm build` 기록에도 같은 파일의 경고가 있었다. 이번 배포가 새로 만든 종류의 경고가 아니다. 경고는 고치지 않았다.
- smoke의 "placeholder 문구가 있다"는 이 배포의 **서비스 준비 중 화면**이 응답한다는 뜻이다. 노출 플래그를 읽은 것이 아니다(§9).

## 4. 운영 읽기 전용 관측 (직접, 배포 #38 종료 약 5분 뒤)

- 시각: 로컬 `02:12:23Z`, VM 시계 `02:12:24Z`(UTC). 공개 주소 조회 `02:12:29Z`.
- 방법: 임시 스크립트로 SSH 읽기 전용 명령만 실행했다(`pm2 jlist`에서 안전한 필드만 `node`로 추출, `ps`, `ss`, `curl`, `journalctl -k`, `git log`/`reflog`/`status --porcelain`). 시크릿·환경변수 값·DB 내용은 읽거나 출력하지 않았다. 재시작·종료·재배포·설정 변경 없음. 스크립트와 임시 SSH 설정은 실행 직후 삭제했고 폴더가 비어 있음을 확인했다.
- 종료 코드: 래퍼 `wrapper_exit=0`(스크립트가 `exit 0`으로 끝나므로 안쪽 명령의 성공·실패를 반영하지 않는다). `journalctl`은 실패했다면 `journal_rc=… UNVERIFIED`가 찍히게 되어 있었고 찍히지 않았다. 나머지 개별 명령의 종료 코드는 출력하지 않았다.

PM2·프로세스·파일 (원문):

```text
== T0 vm_utc=2026-10-12T02:12:24Z tz=UTC
 02:12:24 up 25 days, 17:22,  2 users,  load average: 0.01, 0.34, 0.26
Mem(MiB): total 954  used 409  free 76  buff/cache 630  available 544      psi_memory some avg10=0.00 avg60=0.01 avg300=0.69
pm2_app_count=1
{"app":"app0","status":"online","pid":363382,"restart_time":36,"unstable_restarts":0,"pm_uptime_utc":"2026-10-12T02:06:50.084Z","created_at_utc":"2026-10-12T02:06:49.532Z"}
pid_alive=yes etimes=335s rss_kb=96508
process_title=next-server (v16.3.8)
proc_cwd_deleted=no
proc_cwd_equals_pm2_cwd=yes
standalone_dir_exists=yes  mtime=2026-10-12T02:06:48Z
standalone_server_js_exists=yes  mtime=2026-10-12T02:06:43Z
BUILD_ID_exists=yes  mtime=2026-10-12T02:06:38Z
static_dir_exists=yes  static_file_count=32
standalone_static_exists=yes
build_or_ts_process_count=0
next_title_versions:       1 next-server (v16.3.8);
since_2026-10-12T02:00Z: oom_lines=0
```

- 실행 중 앱 버전은 **프로세스 제목** `next-server (v16.3.8)`로 확정했다. 저장소 HEAD로 확정하지 않았다.
- **배포 #38과 대조(직접)**: 로그의 PM2 표(`pid 363382`, 재시작 횟수 `36`, `online`)가 VM의 PM2 필드(`pid 363382`, `restart_time 36`, 시작 `02:06:50.084Z`)와 같다. 배포 #38이 띄운 프로세스가 지금 돌고 있는 그 프로세스다.
- 남은 build·TypeScript 프로세스 0개, 오래 남은 셸·세션은 sshd 리스너 1개뿐(출력 원문: `pid=207291 ppid=1 … comm=sshd`).

홈 HTML이 참조하는 CSS·JS 전부(홈 HTML에서 `/_next/static/…(css|js)`를 모두 추출, 서버 안과 공개 주소에서 각각 요청):

```text
GET / -> 200 type=text/html; charset=utf-8 size=8102        (서버 안 t=0.0148s, 공개 주소 t=0.2677s)
ref_count_total=13 css=1 js=12                              (서버 안·공개 주소 동일)
REF /_next/static/chunks/2q7cbcwz7lgei.css       -> 200 type=text/css; charset=UTF-8 size=72920
REF /_next/static/chunks/0134f22ofjjbq.js        -> 200 size=14377
REF /_next/static/chunks/0bgsdxprn9hz3.js        -> 200 size=6638
REF /_next/static/chunks/0cz1d0mv5g_q7.js        -> 200 size=112594
REF /_next/static/chunks/0rn07j_kzvnha.js        -> 200 size=156233
REF /_next/static/chunks/18nlqnnmu9w7m.js        -> 200 size=328882
REF /_next/static/chunks/1_fdl6myvo411.js        -> 200 size=10063
REF /_next/static/chunks/2li7sw3nvlsqk.js        -> 200 size=31482
REF /_next/static/chunks/328496v27jhf8.js        -> 200 size=229139
REF /_next/static/chunks/34xc7t2za6pnl.js        -> 200 size=12652
REF /_next/static/chunks/37_kcyyhzjtjv.js        -> 200 size=120580
REF /_next/static/chunks/41l6ju33qyviu.js        -> 200 size=37706
REF /_next/static/chunks/turbopack-22h0tbu4xxuxy.js -> 200 size=10946
```

서버 안과 공개 주소에서 참조 목록 13개와 파일별 응답 크기가 같았다. 앞선 배포 #37 직후 관측(§2)에서 500이던 CSS·JS가 모두 200이다(JS는 `application/javascript`).

참고로만 적는 VM 저장소 체크아웃(실행 중 앱 버전의 증거가 아니다): `head=1296890 branch=main`, reflog `1296890 … 2026-10-12T02:04:46+00:00 reset: moving to origin/main`, `porcelain` 항목은 `?? ecosystem.config.js` 하나(파일 이름만 확인, 내용은 읽지 않았다).

## 5. 판정 — 배포 장애 복구

복구 완료로 적는 조건은 "외부 CSS·JS와 실행 프로세스가 정상임을 확인했다"이다.

| 조건 | 관측 | 판정 |
|---|---|---|
| 실행 프로세스 | PM2 `online`, 프로세스 제목 `next-server (v16.3.8)`, 작업 폴더 삭제 아님, 배포 #38 로그의 프로세스와 동일 | 충족 |
| 빌드 산출물 | `standalone/` · `server.js` · `BUILD_ID` · 정적 파일 존재 | 충족 |
| 외부(공개 주소) 홈 | 200 | 충족 |
| 외부 CSS | 홈 HTML이 참조한 1/1 → 200 `text/css` | 충족 |
| 외부 JS | 홈 HTML이 참조한 12/12 → 200 | 충족 |
| 서버 안 홈·CSS·JS | 홈 200, 13/13 → 200 | 충족 |
| 남은 build·TypeScript 프로세스 | 0개 | 충족 |

**판정: `deploy_incident_recovery: 복구 확인`** — 2026-10-12T02:12Z ~ 02:12:29Z 관측 기준.

이 판정의 범위와 한계(Gaps):

- 관측은 배포 종료 약 5분 뒤의 한 번이다. 시간이 지난 뒤의 안정성(재시작 반복, 메모리, 다음 배포)은 관측하지 않았다.
- PM2의 systemd 서비스 유닛은 앞선 관측(2026-10-12T01:41:59Z)에서 `inactive`였고, 이번 조회는 그 항목을 다시 읽지 않았다. 재부팅 뒤 PM2가 자동으로 복구되는지는 **UNVERIFIED**다.
- 응답 코드만 봤다. 브라우저 렌더링, 홈 밖의 경로(`/consult`·`/result`·API), HTML에 직접 나오지 않는 지연 로드 청크와 글꼴 등은 관측하지 않았다.
- 노출 플래그, PM2 저장 환경, 운영 DB는 읽지 않았다(§9).
- 공개 주소 조회는 이 컴퓨터 한 곳에서만 했다.

## 6. Security (직접: 새 의존성 트리에서 `pnpm audit --prod`)

```text
audit_start_utc=2026-10-12T02:16:01Z
audit_head=50b263f            (작업 트리 깨끗, 감사 전후 변경 없음)
pnpm_audit_exit=1
vulnerabilities={"info":0,"low":0,"moderate":0,"high":1,"critical":0}
advisory_count=1
critical_high_packages=["high:braces"]
```

| 기준 | prod 의존성 감사 |
|---|---|
| `d80adc8` 기준(보존) | `{low 4, moderate 22, high 13, critical 4}` — 권고 43건 |
| 새 `main` 기준(`1296890` 트리, 이 작업) | `{low 0, moderate 0, high 1, critical 0}` — 권고 1건(`braces`, High) |

- **부분 개선이다.** Critical 4 → 0, High 13 → 1, 전체 43 → 1.
- 프로필 `default`의 Security 하드 임계값은 "Critical/High 없음"이다. High 1건이 남아 있으므로 Security는 **FAIL 그대로**다. 전체 판정도 FAIL이다.
- `braces`는 이 SPEC이 도입한 것이 아니다(이 SPEC은 의존성 파일을 바꾸지 않았다).
- `braces`에 수정 릴리스가 아직 없다는 점은 2026-10-08 조사 기록이고 이번에 다시 확인하지 않았다.
- 권고 DB는 시간에 따라 움직이므로 위 수치는 위 시각의 값이다. devDependencies를 포함한 전체 감사(`pnpm audit`)는 이번에 실행하지 않았다(**미확인**). 앞선 `d80adc8` 기준 전체 수치는 `{7, 29, 18, 4}`였다.

## 7. 재사용한 검증과 변경 범위 확인

`d80adc8` 이후 `main`이 바꾼 것(직접, `git diff --name-only d80adc8 origin/main`)은 아래 4개뿐이다. `lib/`·`scripts/`·`app/`·`components/`와 시험 파일은 **0개**다.

```text
.github/workflows/deploy.yml      (+1)
package.json                      (next · @next/env · eslint-config-next 16.3.2 → 16.3.8)
pnpm-lock.yaml                    (490줄)
pnpm-workspace.yaml               (+18, overrides)
```

merge로 sync 브랜치에 새로 들어온 것도 위 4개뿐이다(`git diff --name-only 0504976 HEAD`). sync 브랜치 고유 내용(`git diff --name-only origin/main HEAD`)은 PR #25의 `changed_files: 11`과 같다(문서·`CHANGELOG.md`·주석 파일 8개).

| 항목 | 이전 근거 | 변경 범위 확인 | 이번 처리 |
|---|---|---|---|
| sync Phase 9(@MX): `@MX:ANCHOR` 9 + `@MX:WARN` 18 | `0504976` | 소스 변경 0. 병합 HEAD에서 `git diff d80adc8 HEAD -- lib scripts`: 추가된 `@MX:ANCHOR` 줄 **9**, `@MX:WARN` 줄 **18**, 주석이 아닌 추가 줄 **0**, 삭제 **0** | **재사용**(태그 개수는 이번에 직접 다시 셈). 충족 유지 |
| SPEC 3문서 | blob `6d461bd`(spec)·`755670b`(plan)·`9865beb`(acceptance) | `d80adc8`·`0504976`·현재 HEAD에서 세 파일 blob이 모두 같다. `spec.md` `status: in-progress`, `updated: 2026-10-07` 그대로 | 변경 없음. 계획 감사 PASS 0.81과 `moai spec lint` 결과를 그대로 재사용 |
| AC 집계 PASS 1 / FAIL 0 / UNVERIFIED 15 | `98d5827` 교정 | 소스·시험·AC 문서 변경 없음. 새 서명 없음 | 변경 없음 |
| Craft(커버리지 85% 이상, 줄 85.20% 등) | `d80adc8` 기준 측정 | 소스·시험 파일 변경 0. 측정 도구 본체 `vitest`·`@vitest/coverage-v8`·`typescript`·`eslint`·`prettier`·`tsx`의 `package.json` 지정 값이 같다. 락 파일 diff에서 이 도구 이름이 들어간 줄은 8줄(4쌍)뿐이고 모두 `next` 계열(`next`·`eslint-config-next`·`@next/eslint-plugin-next`)의 16.3.2 → 16.3.8 줄이다. `typescript@5.9.3`·`eslint@9.39.5`는 그 줄의 해석 접미사로만 나오며 두 도구의 버전 자체는 바뀌지 않았다 | **재사용**. 새 트리에서 재측정한 관측은 아니다(§8). 전이 의존성 갱신(overrides 포함)은 있었다 |
| Consistency(`tsc`·`eslint`·`prettier`·`moai spec lint`) | `d80adc8` 기준 | 위와 같음 | **재사용**(같은 한계) |
| LSP 게이트 | typecheck·lint 진단원 충족, security 진단원 UNVERIFIED | 변경 없음 | 변경 없음 |
| `smoke-deploy-workflow`(`dd7122c`, 로컬 전용 보류 브랜치) | AC-013 구현 인수 확인 | 새 `main`과 `git merge-tree`(읽기 전용) 충돌 표식 **0개**. 브랜치는 그대로 두었다 | 유지. 병합 순서 보류도 그대로 |

배포 #38 로그에서 `Finished TypeScript in 35.5s`(§3)는 `1296890`에서 서버가 `next build`의 TypeScript 단계를 통과했다는 보충 관측이다. 이것이 위 `tsc --noEmit` 재사용을 **대체하지 않는다**(검사 범위가 같은지 확인하지 않았다).

## 8. 관측하지 못한 것 (Gaps)

- 새 의존성 트리(`next` 16.3.8 + overrides)에서 `pnpm test`, `pnpm lint`, `tsc --noEmit`, `prettier --check`, 커버리지 측정, `pnpm build`를 **이번에 다시 실행하지 않았다.** 위 §7은 변경 범위 확인에 의한 재사용이고 새 트리 관측이 아니다. 새로 실행하지 않은 이유: 소스·시험 파일 변경이 0이고 이 작업의 목적이 기록 갱신이라서다.
- 서버를 띄우는 하네스 관측(`verify-flag-runtime`·`verify-smoke-check`·`verify-gate-reachability`·롤백)은 `next` 16.3.2 트리 기준이다. `next`가 16.3.8로 바뀐 트리에서 다시 관측하지 않았다. 이전 근거의 재사용 폭이 이번에 약해졌다. AC가 서명 부재로 이미 UNVERIFIED여서 현재 판정은 바뀌지 않는다.
- `pnpm audit`(devDependencies 포함 전체)와 `braces` 수정 릴리스 유무의 재확인.
- 운영 호스트의 노출 플래그 5종, PM2 저장 환경, 운영 DB, 효과적 게이트 상태(읽지 않았다).
- 브라우저 렌더링과 홈 밖 경로, 시간이 지난 뒤의 안정성, PM2 systemd 서비스 유닛과 재부팅 뒤 자동 시작.
- LSP security 진단원(전용 도구 없음, `lsp.enabled: false`). 교차 모델 감사(`moai` MCP 서버 연결 실패).
- 사람의 서명 15개(AC-002 제외) — 새로 받은 것이 없다.

## 9. 승격하지 않는 것, 그리고 증거 위치

**이 관측은 L-01이 아니다.** `spec.md` §2.4의 L-01은 "병합 후 기준선 관측 — 가동 커밋, 플래그 5종의 설정 여부(값이 정확히 `"true"`인지만), 진단 게이트·상담 화면·상담 접수의 효과적 상태"다. 이번 관측은 가동 중인 앱 버전과 정적 자산 응답만 봤고 **플래그 5종과 효과적 상태를 읽지 않았다.** L-01 기록 파일을 만들지 않았고 어떤 점검기 항목의 상태도 바꾸지 않았다. 따라서:

- 배포 장애 복구 확인은 **정적 자산이 다시 제공된다**는 뜻이다. L-01 PASS도, L-01의 일부 충족도 아니다.
- 이 기록은 **운영 공개 승인이 아니다.** 공개 판정은 점검기·서명·L-01·R-02·R-03 등이 정한다. 배포 smoke가 placeholder 문구를 확인한 것(§3)도 노출 플래그의 관측이 아니다.
- 전체 판정은 **FAIL**(Security High 1건), Functionality는 **UNVERIFIED**(PASS 1 / FAIL 0 / UNVERIFIED 15), sync는 **닫지 않았다**(`status: in-progress`). Phase 9는 충족이다. LSP security 진단원은 UNVERIFIED다. 이 문서는 이 중 어느 것도 바꾸지 않았다.

증거 위치:

- 저장소에 올라간 것: 이 문서와 `progress.md` §E.4 끝의 "후속 기록" 소절. 패키지별 취약점 목록, 로컬 경로, 접속 정보는 없다.
- 로컬(git이 무시, 저장소에 올라가지 않는다): `.moai/state/verify/sync-launch001/` — `deploy-run-38188727993.log`(배포 #37 전체 로그 사본), `deploy-run-38194369077.log`(배포 #38 전체 로그 사본), `post-deploy-obs-1296890.txt`(§4 원문 출력), `pnpm-audit-prod-1296890.json`, `pr25-body-before-20261012.md`(이 작업 전 PR #25 본문).
- 원격에서 대조할 수 있는 것: PR #24·#25·#26·#27, 병합 커밋 `eee8281`·`1296890`, 배포 run `38188727993`(#37)·`38194369077`(#38), 이 파일.
- 보존한 브랜치(이 작업에서 삭제·이동 없음): 원격 `worktree-launch-run`(`cfe08a4`), `security/deps-g1-g3`(`b5c8689`), `fix/deploy-command-timeout`(`f63b8e1`), 로컬 전용 `smoke-deploy-workflow`(`dd7122c`).
