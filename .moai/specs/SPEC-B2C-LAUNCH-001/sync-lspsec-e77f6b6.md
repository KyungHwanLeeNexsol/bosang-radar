# SPEC-B2C-LAUNCH-001 — LSP security 진단원: 규칙 원문과 설치 도구 대조 (대상 `e77f6b6`)

`progress.md` §E.4 끝의 "LSP security 진단원 — 규칙·도구 대조" 소절이 기대는 규칙 위치·명령·종료 코드·출력·한계를 모은 문서다. `spec.md`·`plan.md`·`acceptance.md`가 아니므로 계획 감사의 해시 대상이 아니다.

- **이 문서는 새 감사가 아니다.** `d80adc8` 기준 SPEC 전체 감사와 그 교정은 `sync-evidence-d80adc8.md`(특히 §5.4)와 `progress.md` §E.4 본문에 **역사적 기록으로 그대로 보존**돼 있고, 새 `main` `1296890` 기준 후속 기록은 `sync-followup-1296890.md`가 갖는다. 이 문서는 둘 다 고치지 않는다.
- **반복하지 않은 것**: `lsp.enabled: false`, `quality.yaml`의 security 진단원 요구, ast-grep TypeScript 보안 규칙 2종만으로 PASS를 인정하지 않았던 기존 판단. 이 문서는 그 판단을 뒤집거나 다시 조사하지 않고, 그 위에 **규칙 원문의 위치**와 **현재 HEAD에서 도구가 실제로 도는지**를 직접 실행으로 보태기만 한다.
- 구분: **직접** = 이 작업에서 실행해 출력을 읽은 것. **재사용** = 앞선 기록을 쓰되 변경 범위를 확인한 것. **미확인** = 하지 못했거나 근거가 성립하지 않은 것.
- 이 문서에는 시크릿 값, 환경변수 값, DB 내용, 운영 호스트의 접속 정보를 적지 않았다. 원문 로그는 git이 무시하는 `.moai/state/verify/sync-launch001/lspsec/`에 있다(§8).
- 시각은 한국 시간(`+09:00`)이다.

## 1. 결론

| 항목 | 판정 | 한 줄 이유 |
|---|---|---|
| **LSP security 진단원** | **UNVERIFIED 유지** | (A) 규칙 원문에 security 진단원을 특정 도구에 연결하거나 LSP가 꺼졌을 때의 대체 수단으로 인정하는 문장이 없다. (B) 가장 가까운 후보 도구(`moai ast-grep`)가 이 HEAD에서 **스캔을 실행하지 못했다**(`sg` CLI 없음, 종료 코드 1) |
| npm 의존성 감사 `braces` High | **FAIL 유지** (Security 차원) | 별도 축. §6 |

두 판정은 서로를 대신하지 않는다. LSP security 진단원이 충족돼도 `braces` High는 남고, `braces` High가 남아 있다는 사실이 LSP security 진단원의 결과는 아니다.

## 2. 대상

| 항목 | 값 | 구분 |
|---|---|---|
| 원격 `main` | `1296890`(병합 커밋, PR #27) | 직접: `git fetch origin` 뒤 `git rev-parse --short origin/main` |
| PR #25 | Draft, open, mergeable, head `e77f6b6` | 직접: `gh pr view 25` |
| 대상 작업 트리 | sync 작업 공간, 브랜치 `sync/SPEC-B2C-LAUNCH-001`, HEAD `e77f6b6`, 원격 브랜치와 `0 0` | 직접: `git rev-list --count --left-right origin/sync/SPEC-B2C-LAUNCH-001...HEAD` |
| 작업 트리 상태 | 변경 0줄(`.moai/state/` 제외) | 직접: `git status --porcelain` |

## 3. 규칙 원문 대조

아래 파일은 기본 체크아웃과 sync 작업 공간(`e77f6b6`)에서 `git hash-object`가 같고 모두 추적 중이다(직접 확인).

| 파일 (blob 앞 8자) | 위치 | 내용 | 이 문서가 읽는 의미 |
|---|---|---|---|
| `.moai/config/sections/quality.yaml` (`75f18250`) | 27~41줄 | `lsp_quality_gates.enabled: true`. sync 단계 `max_errors: 0`, `max_warnings: 10`, `require_clean_lsp: true` | sync에서 LSP 게이트가 **필수**다. security 전용 임계값은 없다 |
| 같은 파일 | 58~60줄 | `trust5_integration.secured`: `security_scan_pass`, `lsp_security_warnings == 0` | security 쪽 통과 조건은 이 두 줄이 전부다. 어떤 도구가 `lsp_security_warnings`를 내는지는 적혀 있지 않다 |
| 같은 파일 | 64~67줄 | `diagnostic_sources`: `typecheck`, `lint`, `security` | 진단원의 **종류**만 정한다. 종류와 도구의 연결이 없다 |
| `.claude/skills/moai/workflows/sync/quality-gates-quality.md` (`388099aa`) | 88~93줄 | "LSP Quality Gates": errors 0, warnings 최대 10, clean LSP 필수. 세 항목이 전부다 | LSP 비활성 시 허용되는 **대체 수단 문장이 없다**. security 진단원에 대한 언급도 없다 |
| `.moai/config/sections/lsp.yaml` (`961cdd10`) | 44줄 | `lsp.enabled: false` | 런타임 LSP 서버가 꺼져 있다 |
| 같은 파일 | 32~34줄(머리 주석) | "ast-grep / Tree-sitter provides AST analysis … When no LSP binary is available, ast-grep continues to provide quality gates." | **설계 설명 주석**이다. 품질 게이트 일반에 대한 문장이고, security 진단원으로 지정하거나 통과 조건을 정하지 않는다. 가장 가까운 문장이지만 대체 인정 조항으로 읽을 근거는 없다 |
| 같은 파일 | 302~304줄 | `delegate_to_astgrep.enabled: true`, `rules_dir: ".moai/config/astgrep-rules"` | ast-grep 규칙 위치만 정한다 |
| `.moai/config/sections/gate.yaml` (`79c268a1`) | 7~11줄, 24~33줄 | `ast_grep_gate`는 pre-commit 게이트의 **조언 단계**다. "findings reported, commits never blocked", `block_on_error: false`, `warn_only_mode: true`. "When the `sg` CLI is absent, the scan is skipped gracefully with a notice." | 이 스캔은 sync의 LSP 게이트가 아니라 pre-commit 게이트에 속하고, 결과가 어떻든 막지 않으며 `sg`가 없으면 건너뛴다고 **규칙이 스스로 적고 있다** |
| `.moai/config/astgrep-rules/sgconfig.yml` (`493b2c52`) | 8~14줄 | `ruleDirs`: `go`, `security`. "Language coverage is intentionally partial" | 규칙 범위가 부분적이라고 적혀 있다 |
| `…/security/credentials.yml` (`e594190d`), `…/security/injection.yml` (`2a284278`) | 49~51줄, 51~53줄 | TypeScript용 규칙 ID는 `sec-hardcoded-credential`, `sec-command-injection-exec` | 기존 기록과 같은 사실이다. **이번 판정의 근거로 쓰지 않았다** |

### 요구되는 세 가지를 규칙 원문에서 찾은 결과

| 요구 | 규칙 원문에서 찾은 것 |
|---|---|
| 대상(무엇을 진단하나) | 정한 곳이 없다. LSP 서버가 진단하는 파일이라는 전제만 있다 |
| 진단 방식(어떤 도구로) | 종류(`security`)만 있고 도구가 없다. 가장 가까운 두 문장(`lsp.yaml` 주석, `gate.yaml` 조언 단계)은 security 진단원의 대체를 지정하지 않는다 |
| 통과 조건 | `lsp_security_warnings == 0`과 sync 게이트의 `errors 0 / warnings ≤ 10 / clean` 뿐. security 전용 임계값이 없다 |
| LSP 비활성 시 대체 수단 | **명시돼 있지 않다**(위 두 문장은 대체 인정이 아니다) |

이 표의 "찾지 못했다"는 위에 적은 파일을 읽은 범위의 결과다. 규칙 트리 전체를 검색한 결과가 아니다.

## 4. 설치된 도구 직접 확인

| 확인 | 명령 | 결과 |
|---|---|---|
| `moai` CLI | `moai version` | `moai-adk 3.1.2` |
| `sg`·`ast-grep`·`semgrep` | `command -v sg; command -v ast-grep; command -v semgrep` | **세 개 모두 출력 없음**(PATH에 없음) |
| 작업 공간 `node_modules/.bin` | `ls node_modules/.bin \| grep -i -E "^(sg\|ast-grep\|semgrep\|eslint-plugin-security)"` | 출력 없음 |
| 실행 | `moai ast-grep --lang=typescript --format=json lib` (대상 HEAD `e77f6b6`, 2026-10-12 13:16:04 KST) | **종료 코드 1**. stdout 비어 있음. stderr: `level=WARN msg="ast-grep (sg) CLI not found; skipping scan" binary=sg …` 와 `ast-grep: scan did not run — the ast-grep (sg) CLI was not found.` |

이 실행은 **코드를 검사하지 않았다.** "발견 0건"이 아니라 "스캔 미실행"이다. 범위(`lib`)는 `sg`가 없어서 의미가 없고, 같은 이유로 `app`·`components`·`scripts`는 실행하지 않았다.

## 5. 판정 근거

- 규칙 원문이 허용하는 security 진단원으로 확정된 도구가 없다(§3). 이를 해석으로 채워 넣어 "동등한 진단원"으로 인정하지 않았다.
- 후보로 읽을 수 있는 `moai ast-grep`은 이 HEAD에서 실행되지 않는다(§4).
- 도구를 설치하거나 설정(`lsp.yaml` 등)을 바꾸는 일은 이번 지시의 허용 검증 범위가 아니어서 하지 않았다.
- 따라서 LSP 게이트는 **"typecheck·lint 충족(기존 기록), security 진단원 UNVERIFIED"**로 그대로다. 코드 결함은 관측되지 않았고, 관측하지 못했을 뿐이다.

## 6. npm 의존성 감사(`braces` High)는 별도 축

- **직접**: `pnpm audit --prod --json`을 `origin/main`(`1296890`)의 `package.json`·`pnpm-lock.yaml`·`pnpm-workspace.yaml` 복사본(스크래치)에서 실행(2026-10-12 낮) → `{critical 0, high 1, moderate 0, low 0}`, 1건은 `braces`(`<=3.0.3`, GHSA-vfj7-8cjw-p6xm, 수정 버전 `null`), `exit=1`. 이번 지시에서는 다시 실행하지 않았다.
- **재사용**: sync HEAD의 의존성 3파일이 `main`과 같다는 점은 `sync-followup-1296890.md` §7.2의 기록에 근거한다.
- 판정: Security 차원 **FAIL 유지**. `braces` 처리 방식(V: `shadcn`을 dependencies에서 빼고 CSS를 저장소로 가져옴 / W: 업스트림 대기)은 **사용자가 아직 선택하지 않았고** 의존성·CSS 변경을 시작하지 않았다.
- LSP security 진단원이 UNVERIFIED인 것과 `braces` High는 서로 다른 근거다. 한쪽 결과로 다른 쪽을 PASS 처리하지 않았다.

## 7. 직접 실행 / 재사용 / 미확인

**직접 실행(이 작업)**: `git fetch`, 원격 SHA와 PR #25 상태 조회, 작업 트리 깨끗함 확인, §3의 규칙 파일 읽기와 두 위치의 `git hash-object` 비교, §4의 PATH·`node_modules/.bin` 탐색, `moai version`, `moai ast-grep` 1회 실행, §6의 `pnpm audit --prod`(같은 날 스크래치).

**재사용**: 기존 판단(`lsp.enabled: false`, `quality.yaml` 요구, TypeScript 보안 규칙 2종만으로 PASS 불인정)과 `sync-evidence-d80adc8.md` §5.4의 "typecheck·lint 충족" 판정, `sync-followup-1296890.md` §7.2의 의존성 파일 동일 근거, AC 집계(PASS 1 / FAIL 0 / UNVERIFIED 15).

**미확인**:

- `sg` CLI를 설치했을 때의 스캔 결과.
- 그 결과를 규칙이 security 진단원으로 인정하는지. 규칙 원문에 명시가 없고 이 문서는 정하지 않았다.
- `lsp.enabled: true`로 TypeScript 언어 서버를 켰을 때의 진단(설정을 바꾸지 않았다).
- 규칙에 언급되지 않은 다른 도구(`semgrep`, `eslint-plugin-security`, CodeQL 등). 조사하거나 설치하지 않았다.
- `braces` 직접 패치·fork·다른 도구 구성(조사 범위 밖).

## 8. 실행하지 않은 것, 보존한 것, 증거 위치

- 실행하지 않았다: 전체 시험, 4차원 감사, `/moai sync` 전체, 도구 설치, 프로필 예외나 임계값 완화, 의존성·CSS·운영 변경, 병합.
- 보존했다: `d80adc8` 역사적 증거(`sync-evidence-d80adc8.md`), `spec.md`·`plan.md`·`acceptance.md`(blob `6d461bd`/`755670b`/`9865beb`), `sync-followup-1296890.md`, 로컬 전용 `smoke-deploy-workflow`(`dd7122c`)와 모든 원격 브랜치.
- 원문 로그(gitignored): `.moai/state/verify/sync-launch001/lspsec/astgrep-lib.err`, `astgrep-lib.json`(0바이트).

## 9. 승격하지 않는 것

전체 판정 **FAIL**, Security **FAIL**(`braces` High 1건), Functionality **UNVERIFIED**(AC PASS 1 / FAIL 0 / UNVERIFIED 15), LSP security 진단원 **UNVERIFIED**, **sync 미종결**(`status: in-progress`), 운영 공개 보류는 모두 그대로다. PR #25는 Draft·open으로 두며 병합하지 않는다.
