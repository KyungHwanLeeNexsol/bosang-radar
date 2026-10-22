# ADR-001: 외부 Semgrep LSP 하네스 값을 LSP security 진단원으로 인정하는 기준 (제안)

- **Decision Date**: 2026-10-22
- **Status**: Proposed
- **Supersedes**:

> 이 문서는 **제안**이다. `Accepted`가 되기 전에는 어떤 기존 게이트·설정·임계값·훅과도 연결되지 않는다.
> 상태를 바꾸려면 새 변경으로 소유자가 직접 바꾼다. 이 문서의 어느 구절도 "기존 규칙이 Semgrep 결과를
> `lsp_security_warnings`로 이미 인정한다"는 뜻으로 읽어서는 안 된다.

## 0. 범위와 상태

| 항목 | 내용 |
| --- | --- |
| 대상 저장소 | `KyungHwanLeeNexsol/bosang-radar` (SPEC-B2C-LAUNCH-001). 보담(bodam) 저장소와 `SPEC-REIMBURSEMENT-001` M6와 무관하다 |
| 이 변경이 하는 것 | 하네스·순수 판정 로직·합성 시험(`scripts/semgrep-lsp/`), 고정 입력 데이터, 대조용 정적 입력(`.moai/fixtures/semgrep-control/`), 이 문서 |
| 이 변경이 하지 않는 것 | Semgrep 설치·실행, LSP 기동, 실제 규칙 탐지, 대상 스캔, 네트워크 대조, `quality.yaml`·`lsp.yaml`·임계값·훅 변경, PR #25 변경, 의존성 취약점 수정, 병합·배포 |
| 변하지 않는 기존 상태 | Security FAIL(npm 의존성 감사 `braces` High 1건), LSP security 진단원 UNVERIFIED, 서명 0건, AC PASS 1 / UNVERIFIED 15, sync 미종결, 운영 공개 보류, PR #25 Draft. 기록된 상태를 그대로 인용하며 이번에 다시 측정하지 않았다 |

### 0.1 기준 SHA (조회한 사실)

2026-10-22에 GitHub API와 `git`으로 직접 조회한 값이다.

| 대상 | 값 |
| --- | --- |
| PR #25 head (`sync/SPEC-B2C-LAUNCH-001`) | `165738238f8d9c35ca7008df6f4358a753aabddb` (외부 검토 때 확인한 값과 같다) |
| PR #25 base (`main`) | `1296890816f0a79ba0d7216aab1ee3e0c4e15423` |
| PR #25 상태 | open, Draft, 14커밋, 변경 15파일, 조회 시점 mergeable_state clean |
| 이 작업의 base | PR #25 head `1657382` (이 ADR을 담은 PR의 base는 `sync/SPEC-B2C-LAUNCH-001`이다. 그래서 PR에는 이번 변경분만 보인다) |

**로컬 `main` `99993bf`와 원격 `main` `1296890`이 다른 이유 (확인 가능한 사실만)**

- `99993bf`는 `1296890`의 **조상**이다(`git merge-base --is-ancestor`). 로컬 `main`에만 있는 커밋은 0개다.
- 원격 `main`이 로컬 `main`보다 68개 커밋 앞서 있다(`git rev-list --left-right --count main...origin/main` = `0 68`). 로컬 `main`은 `origin/main`을 추적하며 `behind 68`로 표시된다.
- 그 68개에는 PR #24(`worktree-launch-run`) 병합, PR #26(`security/deps-g1-g3`) 병합, PR #27(`fix/deploy-command-timeout`) 병합이 들어 있다.
- PR #25 head는 원격 `main`의 후손이다(원격 `main`보다 14커밋 앞).
- 이 작업은 어느 쪽 `main`도 "최신"이라고 가정하지 않았고, 로컬 `main`을 갱신하지도 않았다. 기준은 오직 PR #25 head다.

## Context

### 문제

SPEC-B2C-LAUNCH-001 sync 감사는 "LSP security 진단원"을 UNVERIFIED로 두었다. 규칙 원문(`quality.yaml`,
sync 규칙, `lsp.yaml`, `gate.yaml`)에는 security 진단원을 특정 도구에 연결하거나 LSP가 꺼졌을 때의 대체로
인정하는 문장이 없고, `lsp.enabled: false`이며, `moai ast-grep`은 `sg` CLI가 없어 스캔이 실행되지 않았다
(커밋 `20f16c8`의 `sync-lspsec-e77f6b6.md`). Semgrep의 LSP 서버(`semgrep lsp`)가 후보다.

### 확인한 사실 (외부 검토 반영, 고정 소스 기준)

모든 소스 인용은 semgrep/semgrep v1.180.0 `a35fe8306115b3e55274969098cc46f8451d6b4d`의 파일·줄이다.
규칙은 semgrep-rules `16b9e6d45f10649f6a531ec4838ed9924372c3bc`다.

| 영역 | 사실 |
| --- | --- |
| 규칙 | `javascript/`·`typescript/`의 YAML 205개가 규칙 214개다(js-yaml로 센 상한값, Semgrep 파서의 결과는 미확인). 원문 ID는 고유 205개이고 7종이 16개 규칙에서 겹친다. 규칙 목록 해시 `70233e53…`는 YAML 205개 항목만으로 계산할 때 재현된다 |
| 최종 ID | 규칙 파일 경로가 상대경로일 때만 디렉터리 조각 접두어가 붙는다(`Rule_fetching.ml:79-118`). 접두어가 없으면 9개가 중복 제거로 조용히 사라진다(`Legacy_session.ml:386-390`) |
| 로딩 오류 | 파일 단위 오류는 `Got N errors …`로 **개수만** 기록된다(`:374-376`). 반환된 `invalid_rules`는 `cache_session`이 버린다(`:481`). 파일 안의 무효 규칙은 `skipping rule` 경고로 따로 남는다(`Parse_rule.ml:1243-1245`). 중복 제거와 SCA·Secrets 제외는 로그가 없다 |
| 설정 | `initializationOptions.scan`은 알 수 없는 키가 하나라도 있으면 역직렬화가 실패하고, 객체 전체가 기본값(`ci=true`, `onlyGitDirty=true`, `configuration=[]` → 레지스트리 `auto`)으로 조용히 돌아간다. `metrics` 객체도 같고 `enabled` 기본값은 `true`다 |
| 응답 | `shutdown`은 응답이 없고(`Legacy_request_handler.ml:146-149`), 서버는 응답을 `Lwt.dont_wait`로 비동기 실행한다(`Legacy_rpc_server.ml:240-247`). `debug/echo`는 즉시 응답한다(`:150`) |
| 로그 순서 | `Scanned workspace`(`Legacy_scan_helpers.ml:259`)는 진단 전송 **전**, `Scanning workspace complete`(`Legacy_notification_handler.ml:213`, debug)는 전송 **후**에 찍힌다 |
| 게시 범위 | 진단은 세션에 누적된 `scanned_files` 전체에 대해 게시된다(`Legacy_scan_helpers.ml:239-246`, `Legacy_session.ml:529-540`). 한 프로세스의 두 번째 스캔은 이전 파일을 빈 진단으로 다시 게시할 수 있다 |
| 대상 | JS는 `.cjs .js .jsx .mjs`, TS는 `.ts .tsx`(`.min.js`·`.d.ts` 제외). `paths`가 없는 regex 규칙 `detect-insecure-websocket` 하나가 JS/TS가 아닌 파일도 스캔 대상으로 끌어들인다 |
| 건수 관계 | `Found M matches`의 M은 skipped fingerprint·git-dirty 필터를 거친 **뒤**의 매치 수다(`Legacy_scan_helpers.ml:162-166`, `:184`, `Legacy_processed_run.ml:72-78`). 진단은 같은 목록에서 파일마다 `path = file`인 매치만 골라 하나씩 만들고 **직렬화된 JSON이 같은 것만** 합친다(`Legacy_diagnostics.ml:61-70`, 심각도·규칙 필터 없음). 그래서 게시 진단의 원시 개수 D에 대해 `D ≤ M`이고 `M > 0`이면 `D ≥ 1`이다. `D < M`은 정상이다. 하네스의 집계 키(파일·`code`·범위)는 서버 키(진단 JSON 전체)와 달라서 비교는 집계 합계가 아니라 원시 D로 한다 |

### 미확인 (실행해야만 확인된다 — 스텁 결과로 채우지 않는다)

| # | 항목 |
| --- | --- |
| U1 | Semgrep 파서가 214개를 모두 로딩하는지(N), 엔진이 건너뛰는 S개와 신원 |
| U2 | `interfile: true` 15개 규칙이 OSS 엔진에서 실행되는지 |
| U3 | `Logs.info`·`Log.warn`·`Logs.debug` 줄이 `--debug`에서 실제 stderr에 나오는지, 줄 접두어·형식, Windows 경로 구분자 |
| U4 | `Parse_rule.ml:1416-1426`의 규칙 덤프로 최종 ID 214개를 추출할 수 있는지 |
| U5 | 대조 예제가 실제로 탐지(양성)·미탐지(정상)되는지 |
| U6 | 전체 묶음에서의 겹침 예상(`window.eval`과 `eval-detected`, 정상 파일의 0건) |
| U7 | `publishDiagnostics` URI의 Windows 형식(드라이브 문자, 인코딩) |
| U8 | `scan`·`metrics` 객체의 알 수 없는 키 처리가 실제로 그렇게 동작하는지 |
| U9 | Windows(beta)에서 `semgrep lsp`가 stdio로 동작하는지, `exit` 후 종료 코드가 0인지 |
| U10 | `debug/echo`가 실제로 응답하는지, 응답이 장벽 뒤 stdout 순서를 지키는지 |
| U11 | `Scanned K files`의 K와 게시 URI 수의 일치, regex 규칙의 실제 적용 범위 |
| U12 | `semgrep` 진입점이 `lsp`에서 버전 확인 요청을 하는지, cwd를 바꾸는지, 설정 파일을 만드는지 |
| U13 | 휠 단독 설치 가능 여부와 전체 잠금 크기, 휠 sha256(`pin.json`에는 개정 1이 보고한 값이 `verified: false`로만 있다) |
| U14 | v1.180.0과 v1.182.0 엔진 본체 차이, `Language.ml`·`Rule_ID.ml`의 차이 내용 |
| U15 | 메트릭 수신기 작동과 `send_metrics` 경로의 실제 동작 |
| U16 | Semgrep Rules License 해석(법률 자문 아님) — 이 저장소에는 규칙 본문이 아니라 파일 경로·blob SHA·규칙 ID 목록만 둔다 |

## Decision

**외부 하네스가 계산한 값을 기존 내장 수집기와 분리된 "후보 측정"으로 정의하고, 측정 완료(`measurement`)·
대조 단언(`control_assertions`)·후보 평가(`candidate_gate`)를 서로 다른 필드로 기록하며, 정책 인정
(`policy_accepted`)은 이 ADR이 `Accepted`가 되기 전까지 `false`로 고정한다.**

`Accepted`가 되는 순간 참이 되는 것: 위 후보 측정을 `lsp_security_warnings`의 진단원으로 쓴다. 그 연결은
이 변경에 없으며 별도 변경이 필요하다.

### D1. 실행 단위와 단계

한 **실행(run)** = 서버 프로세스 1개 = `initialize` 1회 = 규칙 로딩 1회 = 대상 스캔 1회. 이 구성이
"초기화나 다른 스캔의 진단이 이번 대상 실행에 섞이지 않게" 하는 기본 장치다.

| 단계 | 시작 | 끝 | 불변 조건 |
| --- | --- | --- | --- |
| PH0 사전 | 하네스 시작 | C0 전부 통과 | 서버 프로세스가 없다 |
| PH1 프로세스·초기화 | 새 프로세스 생성, `initialize` 송신 | `initialize` 응답(id 일치), `initialized` 송신 | `publishDiagnostics` 0건 |
| PH2 규칙 로딩 | `initialized` 송신 | stdout `semgrep/rulesRefreshed` **와** stderr `Scanned open documents`, 그 뒤 `debug/echo`(echo-pre-scan) 응답 | 진단 0건 |
| PH3 대상 스캔 | echo-pre-scan 응답 뒤 `semgrep/scanWorkspace {"full":true}`를 **정확히 1회** 송신 | stderr `Scanning workspace complete`(메시지 본문 전체 일치) | 다른 스캔 트리거(`didOpen`·`didSave`·`semgrep/refreshRules`)를 보내지 않는다 |
| PH4 배수·종료 | 장벽 관측 | `debug/echo`(echo-post-barrier) 응답, 이어서 `shutdown`·`exit` 송신, 프로세스 종료 | 응답 이후 진단 0건. `shutdown`의 응답을 기다리지 않는다 |

**완료 장벽 `Scanning workspace complete`의 사용과 한계**

- 진단 전송 호출이 끝난 **뒤** 찍히는 줄은 소스에서 이것 하나다(F12). `Scanned workspace`·진행 종료 알림은 전송 전이다.
- 로그(stderr)와 진단(stdout)은 별개 파이프라 장벽이 먼저 읽혀도 stdout에 진단이 남아 있을 수 있다. 그래서 **장벽 시점에 판정하지 않고**,
  장벽 관측 뒤 `debug/echo`를 보내 그 응답이 stdout에 도착할 때까지 읽는다. 서버가 echo 응답을 쓰는 시점에는
  이미 끝난 스캔의 모든 쓰기가 앞서 있다. 장벽 전에 echo를 보내면 스캔보다 먼저 응답할 수 있으므로 보내지 않는다.
- stdout과 stderr는 **각각 독립된 reader**로 끝까지 읽는다. 한쪽을 읽지 않으면 OS 파이프가 차서 서버가 막힌다.
- `debug` 수준 줄이라 `--debug`가 필요하고 줄 형식은 미확인(U3)이다. 형식은 첫 대조 실행의 원문으로 동결한다(`pin.json`의 `log_format`).
- 장벽은 "스캔 진행과 전송 호출이 끝났다"만 증명한다. 결과가 옳다는 증거가 아니다.

### D2. 완료 조건

`COMPLETE`는 아래를 **모두** 만족할 때만이다. 하나라도 어기면 D3의 상태가 되고 `value`는 `null`이다.

| # | 단계 | 조건 |
| --- | --- | --- |
| C0 | PH0 | (a) 도구 버전·휠 sha256이 핀과 같다. (b) 구성 디렉터리에서 **규칙 파일로 읽히는 파일**(`.yaml`/`.yml`, `.test.` 접미 제외, 점 파일 포함)의 목록·blob SHA가 고정 목록과 같다. 깨진 YAML 추가를 포함해 추가·삭제·변경은 모두 `MANIFEST_MISMATCH`이고 서버를 띄우지 않는다. (c) 스캔 트리가 대상 SHA에서 계산한 E와 파일·blob SHA까지 같고 디렉터리 이름에 기본 ignore 이름이 없다. (d) 허용 목록 밖의 `SEMGREP_*`가 없고 URL이 루프백이며 설정·로그 경로가 증거 폴더이고 앱 토큰이 없다. (e) 실행 잠금을 얻었고 같은 트리에 다른 서버 프로세스가 없다 |
| C1 | PH1 | 새 프로세스, `initialize` 응답의 서버 버전이 핀과 같고 `initialized`는 1회. 이 구간 진단 0건 |
| C2 | PH2 | 기대 YAML 205개 각각에 `loading local config from`·`Done loading local config from`이 정확히 1회씩(경로 구분자 정규화 비교), `Got N errors`가 정확히 1회이고 N = 0, `skipping rule` 0개, `rulesRefreshed` 정확히 1회, 레지스트리 접속 흔적 0회, `Scanned open documents` 관측, echo-pre-scan 응답 뒤 진단 0건 |
| C3 | PH3 시작 | 설정 효과의 **간접 증거**: `CI disabled, not checking API token` 1회, `Scanning workspace, full: true` 1회, 로딩 경로가 모두 구성 디렉터리 아래. 파싱 결과는 로그에 남지 않으므로(F9) `maxTargetBytes`·`timeout`·`timeoutThreshold`·`pro_intrafile`의 효과는 관측하지 못하고 요청값만 기록한다. `scan`·`metrics`에는 허용 키만 보낸다 |
| C4 | PH3 로그 | `Scanning workspace` 1회, `Running Semgrep with N rules`의 N = 기대 규칙 수, `Semgrep errors:` 뒤가 비어 있음, `Semgrep skipped S rules`의 S가 `s0`와 같다(`s0`가 확정됐으면 0을 포함해 정확히 그 값, 확정되지 않았으면 0), `Scanned K files`, `Found M matches`(게시 진단 원시 개수 D와 `D ≤ M`이고 `M > 0`이면 `D ≥ 1`), `Scanned workspace` 1회. 두 번째 `Scanning workspace`·`Scanning single file`·추가 `Scanning open documents`·두 번째 `Refreshing rules`는 0회 |
| C5 | PH3~PH4 | 장벽 정확히 1회 + 장벽 뒤 echo 응답. 스캔 송신 이후 echo 응답 이전의 `publishDiagnostics`만 P로 센다. 응답 이후 진단이 있으면 `LATE_DIAGNOSTIC` |
| C6 | 집합 | P의 각 URI는 정규화 후 **정확히 1회** 게시, `E ∖ P = ∅`, `P ∖ E = ∅`, `K = \|P\| = \|E\|`. `K = \|P\|`는 새 프로세스에서 구성상 항상 참이라 전송 손실만 잡는다. 완료의 증거는 C4~C6의 조합이다 |
| C7 | 종료 | `exit` 후 제한 시간 안에 프로세스가 끝나고 종료 코드가 기록된다(0이 기대값, 미확인 U9) |
| C8 | 대조 참조 | **target 모드만.** 같은 도구(버전·휠)·규칙 핀·하네스 지문·대조 지문(D11)의 `control` 실행이어야 한다. 그 실행은 `provenance=real`이고 측정 COMPLETE이며 `control_assertions=PASS`이고 `n0.confirmed=true`이며 `reference_qualification.eligible=true`다 — 필수 음성 대조 R1~R9의 사전 검사 층과 엔진 층이 **각각** 모두 `PASS`이고 같은 결합(binding)에서 얻은 결과여야 한다. 참조의 `eligible` 선언은 믿지 않고 지문·결합·음성 대조 사실로 다시 계산한다 |
| C9 | 격리 | 하네스가 연 루프백 수신기가 작동하고 그 수신기에서 관찰한 요청이 0건. 다른 목적지로의 연결이 없었다는 뜻이 아니다 |

### D3. 상태와 우선순위 (확정)

한 실행의 상태는 **성립한 사유가 가리키는 상태 중 가장 앞선 하나**(대표 상태)이고, 성립한 사유는 전부 기록한다.
사유→상태 표와 우선순위의 기계 판독본은 `scripts/semgrep-lsp/status.ts`이다. `COMPLETE`는 사유가 하나도 없을 때뿐이다.

우선순위의 원칙은 셋이다.

1. 증거가 완성되는 단계가 이른 것이 앞선다.
2. 같은 단계에서는 구체적인 원인이 일반적인 부재보다 앞선다.
3. 단계를 가리지 않는 일반 실패(프로세스 종료·프레임 오류·한도 초과)는 **실패가 난 단계**의 대표 상태로 보고한다.
   PH1은 `INIT_FAILED`, PH2는 `RULES_NOT_LOADED`, PH3·PH4는 `ENGINE_FAILED`(종료·프레임)와 `TIMEOUT`(장벽·echo·종료 한도).

| 순위 | 상태 | 해당 | 비고 |
| --- | --- | --- | --- |
| 1 | `MANIFEST_MISMATCH` | 규칙 트리·스캔 트리·대조 트리가 고정 목록과 다름, 대상 SHA 해석 실패 | 서버를 띄우지 않음 |
| 2 | `ENV_MISMATCH` | 도구 버전·휠, 환경변수, 루프백, 잠금, 다른 서버 프로세스 | |
| 3 | `INIT_FAILED` | 실행 실패, `initialize` 무응답·오류·버전 불일치, PH1 종료·프레임 오류·한도 초과 | |
| 4 | `SETTINGS_MISMATCH` | 허용 외 키, `auto` 폴백, 레지스트리 접속, `ci`·`full` 증거 부재 | |
| 5 | `RULE_LOAD_ERROR` | `Got N errors`의 N ≥ 1, `Done loading` 없는 `loading`, 로딩 쌍 누락·여분·중복 | |
| 6 | `RULE_INVALID` | `skipping rule` 경고 | `Got 0 errors`여도 성립할 수 있다 |
| 7 | `RULES_NOT_LOADED` | `rulesRefreshed` 없음, 경로 오류, `still loading rules` 알림, 로딩 증거 줄 부재, PH2 종료·프레임·한도 | 로딩 완료를 **증명하지 못함** |
| 8 | `PREFIX_MISSING` | N이 고유 원문 ID 수(205)와 같음, 게시 `code`에 접두어 없음 | |
| 9 | `RULE_COUNT_MISMATCH` | N ≠ 기대 규칙 수, `Running Semgrep with N rules` 줄 부재 | |
| 10 | `CONTAMINATED` | 스캔 전 진단, 두 번째 스캔·갱신 흔적, `rulesRefreshed` 중복 | |
| 11 | `ENGINE_FAILED` | PH3·PH4 종료(장벽·echo 전), 종료 코드 ≠ 0, 잘린·깨진 프레임, 취소, 응답 id 불일치 | |
| 12 | `TIMEOUT` | 장벽 없음, echo 응답 없음, 종료 한도 | `NO_BARRIER`·`ECHO_MISSING`은 상태가 아니라 **사유** |
| 13 | `LATE_DIAGNOSTIC` | echo 응답 이후 진단 | |
| 14 | `DUPLICATE_PUBLISH` | 같은 URI 2회 이상 | 마지막 게시를 임의로 채택하지 않는다 |
| 15 | `TARGET_MISMATCH` | `E ∖ P`, `P ∖ E`, `K` 불일치, URI 정규화 불가 | |
| 16 | `UNKNOWN_RULE_ID` | 게시 `code`가 기대 목록에 없음 | 키는 **전체 최종 ID** |
| 17 | `PARTIAL` | `Semgrep errors:` 비어 있지 않음, 엔진 보고 줄 부재, 설명되지 않은 S > 0, 확정된 `s0`와 다른 S(0 포함), `Found M matches`와 게시 진단의 모순(`D > M`, 또는 `M > 0`인데 `D = 0`) | `D < M`은 서버 쪽 중복 제거로 정상이라 사유가 아니다 |
| 18 | `CONTROL_MISSING` | 대조 참조 없음·PASS 아님·핀 불일치·합성(stub), `n0` 미확정, 지문(하네스·대조·도구·결합)이 없거나 다름, 필수 음성 대조 미충족, 자격(`eligible`) 불충족 | target 전용 |
| 19 | `ISOLATION_VIOLATION` | 메트릭 수신기에 요청, 수신기가 관찰 중임을 증명하지 못함 | |

### D4. 겹치는 조합의 확정

| 조합 | 성립하는 사유 | 대표 상태 | 적용한 원칙 |
| --- | --- | --- | --- |
| `rulesRefreshed` 전에 서버 종료 (로딩 오류 증거 없음) | `RULES_REFRESHED_MISSING`, `EXIT_DURING_RULES` | `RULES_NOT_LOADED` | 3 (PH2) |
| 같은 종료가 `initialize` 응답 전 | `INIT_RESPONSE_MISSING`, `EXIT_DURING_INIT` | `INIT_FAILED` | 3 (PH1) |
| 로딩 오류 후 종료 | `RULE_FILE_ERRORS_REPORTED`, `LOADING_WITHOUT_DONE`, `RULES_REFRESHED_MISSING`, `EXIT_DURING_RULES` | `RULE_LOAD_ERROR` | 2 (구체적 원인 우선) |
| 장벽·echo 없이 시간 초과 (프로세스 생존) | `NO_BARRIER`, `TIMEOUT_SCAN`, 엔진 보고 줄 부재 | `TIMEOUT` | 3 (PH3) |
| 모든 URI 도착 후 장벽 누락 | `NO_BARRIER`, `TIMEOUT_SCAN` | `TIMEOUT` | K = \|P\|는 완료 증거가 아니다 |
| 장벽 없이 프로세스 종료 | `EXIT_BEFORE_BARRIER`, `NO_BARRIER` | `ENGINE_FAILED` | 3 (종료가 먼저 관측됨) |
| 장벽 도착 후 잘린 프레임 | `TRUNCATED_FRAME`, `ECHO_MISSING` | `ENGINE_FAILED` | 프레임 오류 이후 stdout은 신뢰하지 않음 |
| echo 이후 늦은 진단 | `DIAGNOSTIC_AFTER_ECHO` | `LATE_DIAGNOSTIC` | |
| 대조 참조 누락 + 진단 0건 | `CONTROL_REFERENCE_MISSING` | `CONTROL_MISSING`, `value` null | 0건은 "측정 없음"이 아니라 "참조 없는 0건" |
| 대조 PASS 참조 + 진단 0건 | (없음) | `COMPLETE`, `value` 0, 평가 `WOULD_PASS` (스텁이면 `UNVERIFIED`) | |
| 스캔 전 빈 게시 + 스캔 구간 게시 없음 | `PRE_SCAN_DIAGNOSTIC`, `URI_EXPECTED_NOT_PUBLISHED` | `CONTAMINATED` | 오염이 집합 불일치보다 앞섬 |
| 같은 URI 2회 게시 (내용이 같든 다르든) | `DUPLICATE_URI` | `DUPLICATE_PUBLISH` | |
| `Found 1 matches`인데 모든 URI가 빈 진단으로 게시 | `MATCH_COUNT_DIAGNOSTICS_MISSING` | `PARTIAL`, `value` null | 건수와 게시의 모순은 0건으로 읽히지 않는다 |
| `Found 0 matches`인데 게시 진단 양수, 또는 게시 진단이 `M`보다 많음 | `MATCH_COUNT_DIAGNOSTICS_EXCESS` | `PARTIAL`, `value` null | 소스상 불가능한 관계(`D > M`) |
| `Found 3 matches`, 게시 진단 2건(서버 쪽 중복 제거) | (없음) | `COMPLETE` | `D < M`은 정상이다. 차이는 `observed.scan.matchesDeduplicated`에 기록한다 |
| 확정된 `s0`=2인데 로그 `Semgrep skipped 0 rules` | `SKIPPED_RULES_S0_MISMATCH` | `PARTIAL`, `value` null | S = 0도 확정된 S0와 비교한다 |
| 양성·정상 단언 `PASS` + 음성 대조 전부 `NOT_RUN`인 참조를 target에 넣음 | `CONTROL_REFERENCE_NEGATIVE_INCOMPLETE`, `CONTROL_REFERENCE_NOT_ELIGIBLE` | `CONTROL_MISSING`, `value` null | 단언 `PASS`는 참조 자격이 아니다 |
| 핀이 같지만 하네스 지문이 다른 참조 | `CONTROL_REFERENCE_HARNESS_MISMATCH`, `CONTROL_REFERENCE_NOT_ELIGIBLE` | `CONTROL_MISSING`, `value` null | 옛 참조는 재사용할 수 없다 |

필수 증거(로그 줄, 응답, 장벽, echo 응답)가 없거나 프레임이 깨졌는데 `COMPLETE`·0건이 되는 경로는 없다.
증거의 부재는 그 자체가 사유다.

### D5. 필드 분리

`run.json`(스키마 `semgrep-lsp-run/1`)은 아래를 서로 다른 필드로 둔다. 서로 섞지 않는다.

| 필드 | 뜻 | 비고 |
| --- | --- | --- |
| `measurement` | 측정이 끝났는가(`status`, `complete`, `reasons`, `phases_reached`) | 보안 기준 통과 여부가 아니다 |
| `control_assertions` | 필수 탐지·금지 탐지·정상 쌍·음성 대조의 성공 여부(`PASS`/`FAIL`/`REVIEW_REQUIRED`/`NOT_RUN`/`NOT_APPLICABLE`) | 의도적 취약 예제를 탐지한 control 실행은 `PASS`이면서 진단 합계가 양수일 수 있다 |
| `candidate_gate` | 제안된 기준(`== 0`)으로 계산한 평가 | `evaluation`은 `WOULD_PASS`/`WOULD_FAIL`/`UNVERIFIED`/`NOT_APPLICABLE`. `policy_accepted`·`counts_as_lsp_security_warnings`는 타입이 리터럴 `false`. target이고 `COMPLETE`일 때만 `value`가 숫자 |
| `reference_qualification` | control 실행이 target의 **대조 참조가 될 자격**이 있는가(`applicable`, `eligible`, 요구 8개의 `satisfied`) | `control_assertions`의 `PASS`와 별개다. 음성 대조가 미실행이면 단언은 `PASS`여도 `eligible`은 `false`다. target 모드는 `{applicable:false, eligible:false}` |
| `existing_gates` | 기존 내장 수집기와 공식 게이트 | `builtin_collector`는 `UNVERIFIED`·`changed:false`, `official_gate`는 `effect:"NONE"`·`changed:false` |
| `not_executed` | 아직 실행해 확인하지 못한 값 | `null`·`NOT_RUN`·`UNVERIFIED`만 허용. 스텁 결과로 채우지 않는다 |

- control 실행의 진단 합계는 `observed.totals`에 **정보로** 남지만 `candidate_gate.applicable`은 `false`이고 `value`는 `null`이다. target의 `value == 0` 판정과 섞지 않는다.
- `provenance`가 `stub`이면 `trust`는 `SYNTHETIC`이고 `candidate_gate.evaluation`은 항상 `UNVERIFIED`이며, 그 실행은 target의 대조 참조가 될 수 없다(`CONTROL_REFERENCE_SYNTHETIC`).
- 이 하네스의 어떤 출력도 기존 보안 게이트에 PASS를 전달하는 경로가 없다. 후보 값은 `candidate_gate`에서 끝난다.
- 진단 합계는 error + warning + information 전부다(LSP 단계에서 LOW·INFO가 Information으로 합쳐져 구분되지 않고 기존 임계값이 엄격한 0이므로 Information을 빼면 기준 완화다). 심각도 4(hint)·누락·미상은 error로 센다. 중복 키는 (파일, `code` 전체, 범위 시작·끝)이다.

### D6. 검사 범위 E

- 검사 **대상 SHA를 필수 입력**으로 받는다(전체 40자 커밋 SHA, 해석 실패는 `TARGET_SHA_UNRESOLVED`). 브랜치 이름·약식 SHA를 받지 않는다.
- E는 그 SHA의 추적 파일(`git ls-tree -r -l`)과 `scripts/semgrep-lsp/data/scope.json`의 명시적 포함·제외 규칙으로 **매번 계산**한다. 파일 목록을 복사해 둔 고정본은 쓰지 않는다. 128개라는 개수는 특정 SHA에서 관측된 값이며 어디에도 상수로 쓰지 않는다.
- 추적 파일 **전부**에 대해 (경로, blob SHA, 크기, 결정, 제외 사유)를 기록하며 모든 경로가 정확히 한 번 나온다. 사유 우선순위: 비정규 파일(심볼릭 링크·서브모듈) → JS/TS 확장자가 아님 → Semgrep 언어 제외(`.min.js`, `.d.ts`) → Semgrep 기본 ignore → 명시적 제외(테스트·스펙, `e2e/`, `.claude/`, `.moai/`) → `maxTargetBytes` 초과 → 포함.
- 스캔 트리는 E에 해당하는 파일만 담도록 SHA의 blob에서 **하네스가 직접 만든다**(`paths`가 없는 regex 규칙이 다른 파일을 끌어들이는 일을 구조로 막는다). 옛 목록을 복사해 새 파일을 빠뜨린 트리는 C0(c)에서 `MANIFEST_MISMATCH`이고, 사전 검사를 우회한 진단 실행에서도 `E ∖ P`로 `TARGET_MISMATCH`가 된다.
- 하네스 코드(`scripts/semgrep-lsp/`)는 제외하지 않는다. 자기 코드의 스캔 결과도 정직하게 보고한다.

### D7. 규칙 기대 목록과 로딩 무결성

- 기대 목록은 대상 파일 목록과 **별도로** 고정한다: `data/rules-files.tsv`(YAML 205개의 경로·blob SHA, 해시 `70233e53…`),
  `data/rules-expected.tsv`(규칙 214개의 파일·원문 ID·최종 ID·언어·모드·심각도, 해시 `aaae3b7c…`), `data/pin.json`.
  규칙 YAML 원문은 저장소에 두지 않는다. 규칙 자료는 gitignore된 캐시에서 읽는다.
- **최종 ID** = `semgrep-rules.` + 파일의 디렉터리 조각을 `.`로 이은 값 + `.` + 원문 ID. 전제: 구성 경로가 상대(`semgrep-rules/javascript`, `semgrep-rules/typescript`)이고 서버 cwd가 `semgrep-rules`의 부모 폴더다. 규칙 키는 **전체 최종 ID**이며 마지막 조각으로 줄이지 않는다.
- 첫 실행의 관측값을 기준으로 채택하지 않는다. N0 = 214는 **기대값**이다. `n0.confirmed`는 (1) C0 통과, (2) 로딩 쌍 205/205, (3) `Got 0 errors` 1회, (4) `skipping rule` 0개, (5) `N = 214`, (6) 대조 양성에서 게시된 최종 ID가 기대 최종 ID와 정확히 일치, (7) S를 기록하고 S = 0이거나 소스·문서 근거로 설명됨, 을 모두 만족할 때만 `true`다. 오류나 설명되지 않은 누락이 있으면 `n0.value`는 `null`로 둔다.
- 증명 가능한 범위: L1 파일(로딩 쌍 205/205, 파일 오류 0) → "고정 YAML이 모두 파싱됨". L2 개수(`N = 214`, `skipping rule` 0, 접두어 확인) → "실행 규칙 수가 기대와 같음". **개수만으로 모든 규칙이 정상 로딩됐다고 주장하지 않는다.** L3 신원은 대조 양성에서 게시된 규칙에 한정된다. 엔진이 건너뛴 S개의 신원은 LSP 경로로 알 수 없다(U1, U2, U4).

### D8. 대조 예제와 단언

- 예제 9개(`.moai/fixtures/semgrep-control/cases/*.in`)는 **정적 입력**이다. `.in` 확장자라 tsc·eslint·vitest·prettier가 읽지 않고, 어떤 시험도 실행하거나 import하지 않는다. 스캔할 때만 실제 확장자로 복사한 새 트리를 쓴다.
- 기대값은 `data/control-expectations.json`이며 전부 "소스 조건 확인, 실제 탐지 미검증"이다. 단언은 서로 바꿔 쓰지 않는다.
  - **A1** 양성의 필수: 필수 최종 ID가 게시 `code`에 있다. 없으면 실패(대상 규칙의 **탐지 여부**).
  - **A2** 허용 밖: 필수·허용 밖의 ID는 `REVIEW`이며 자동 실패가 아니다. `control_assertions`는 `REVIEW_REQUIRED`가 되고 `PASS`가 되기 전에는 target의 대조 참조가 될 수 없다.
  - **A3** 정상의 0건: 정상 파일의 게시 `code`가 비어 있다(**전체 묶음의 진단 0건**). 0건이 아니면 "정상"이 아니라 대조 설계의 오류로 `design_errors`에 기록하고 정상 기준으로 채택하지 않는다.
  - **A4** 금지: 금지 ID가 있으면 실패.
  - 정상 쌍은 같은 계열의 양성이 A1을 통과하고 정상이 A3을 통과해야 쌍이 통과한다.
- `eval.nosource.js`는 "대상 규칙(`detect-eval-with-expression`)의 미탐"과 "전체 묶음의 진단 0건"이 다른 단언임을 보인다. `eval-detected`가 이 호출을 잡을 것으로 예상하므로 A1(필수 `eval-detected`)과 A4(금지 `detect-eval-with-expression`)로 판정하고, 0건이면 오히려 실패다.
- 음성 대조(R1~R9)는 `control_assertions.negative_controls`에 **두 층**으로 기록한다. `preflight`는 서버 없이 사전 검사·설정 검사가 거부했는지(R1~R5, R7, R9: 7개), `engine`은 실제 엔진을 띄운 진단 실행의 관측(R1~R9: 9개)이다. 두 층은 서로 대신하지 못한다 — 사전 검사 `PASS`는 "엔진 없이 거부했다"만 증명하며 엔진 실행을 대체하지 않는다. 각 항목은 그 결과를 얻은 도구·규칙·하네스·대조 조합의 지문(`binding_sha256`)을 달고 있어야 `PASS`로 인정된다.
- 이 변경에서는 엔진이 필요한 것을 실행하지 않았으므로 `engine` 9개는 항상 `NOT_RUN`이고, 하네스가 기록하는 `preflight` 7개도 `NOT_RUN`이다(단위 시험이 합성 규칙 트리로 R1~R5의 `MANIFEST_MISMATCH`와 R7·R9의 허용 키 거부를 확인한다). `NOT_RUN` 음성 대조는 양성·정상 쌍 단언의 `PASS`를 `FAIL`로 바꾸지 않는다(성공 기록을 거짓 실패로 덮지 않는다). 대신 `reference_qualification`이 불충족으로 남아 target의 대조 참조가 될 수 없다(D11). `engine` 항목을 `PASS`로 표시하는 운영 코드는 아직 없다.

### D9. 격리와 메트릭 서술

- 메트릭은 `metrics.enabled`가 참일 때만 전송 경로가 열린다. `metrics` 객체가 파싱에 실패하면 `enabled`가 기본값 `true`로 돌아가므로 허용 키만 보낸다.
- `SEMGREP_METRICS_URL`·`SEMGREP_VERSION_CHECK_URL`·앱 URL을 하네스가 연 루프백 수신기로 돌린다.
- 보고 문구는 "**이 하네스가 연 루프백 수신기에서 관찰한 메트릭 요청은 N건이었다**"로 한정한다. 다른 목적지로의 연결이 없었다는 뜻이 아니다. 수신기가 실제로 요청을 받는지는 양성 통제(R9)로 증명한다.

### D10. 실행 방지와 증거

- 실제 도구를 띄우는 코드는 `process-node.ts`에만 있고, `cli.ts run`은 `--allow-real-semgrep` + `MOAI_SEMGREP_LSP_ALLOW_REAL=1` + `--semgrep-bin <절대 경로>`가 모두 있을 때만 시작한다. 하나라도 없으면 `NOT_RUN`(종료 코드 3)이며 `spawn`을 호출하지 않는다. PATH 탐색·자동 설치·`package.json` 스크립트가 없다.
- 증거는 `.moai/state/verify/semgrep-lsp/<run-id>/`(gitignore)에 정규 JSON(키 정렬, 2칸, LF)으로 쓰며 이미 있는 파일은 덮어쓰지 않는다. 구성은 `run.json`, `diagnostics.jsonl`(받은 `publishDiagnostics` 원문), `lsp-transcript.jsonl`, `stderr.log`, `files.expected.txt`, `files.published.txt`, `files.missing.txt`, `scope.tsv`, `fingerprints.txt`(하네스·대조 지문 값과 두 매니페스트 — 참조가 거절됐을 때 어느 파일이 달랐는지 진단하는 용도)의 9개이고 `run.json`이 마지막에 쓰인다. `run.json`의 SHA-256만 `progress.md`에 한 줄로 연결하는 일은 이 변경의 범위 밖이다.
- 환경변수 값·토큰·기밀은 증거에 쓰지 않는다. 이름과 판정 사유만 남긴다.

### D11. 대조 참조 자격과 지문 (C8의 구현)

target 실행이 받는 대조 참조는 "양성·정상 단언이 `PASS`였다"만으로 수락하지 않는다. 참조는 **이번 실행과 같은 도구·규칙·하네스·대조 조합**에서 얻은, **필수 음성 대조가 모두 통과한** control 실행이어야 한다.

**지문 규칙** (`scripts/semgrep-lsp/fingerprint.ts`)

| 지문 | 범위 | 정렬·해시 |
| --- | --- | --- |
| `harness_sha256` | `scripts/semgrep-lsp/` 아래 `.ts`·`.mjs` 구현 파일. **제외**: `*.test.ts`·`*.test.mjs`, 하네스 루트 바로 아래의 `testing/`·`data/` 전부, 그 밖의 확장자(README 포함). 중첩 경로의 `testing/` 같은 이름은 제외하지 않는다(더 많이 해시하는 쪽이 안전하다) | 하네스 루트 기준 상대 경로('/' 구분)의 UTF-8 바이트순. 파일마다 **원시 바이트**의 sha256(줄바꿈 정규화 없음 — CRLF 체크아웃은 지문이 달라지며 이는 fail-closed다). 매니페스트 = `semgrep-lsp-harness-fingerprint/1\n` + 파일마다 `<경로>\t<sha256>\n`. 지문 = 매니페스트의 sha256. 포함 파일이 0개이면 빈 집합의 해시가 아니라 "확인하지 못함"(null) |
| `control_sha256` | 대조 기대값(`data/control-expectations.json`)과 대조 예제 `.in` 9개 | 매니페스트 = `semgrep-lsp-control-fingerprint/1\n` + `expectations\t<기대 파일 바이트의 sha256>\n` + 사례를 `path` 바이트순으로 `case\t<path>\t<fixture>\t<실제로 읽은 예제 바이트의 sha256>\n`. 기대 파일 안의 해시 값은 "주장"이라 쓰지 않는다(사전 검사가 따로 대조한다). 읽지 못하면 null |
| `binding_sha256` | 도구(`tool_version`, `wheel_sha256`) + `pin_sha256` + 규칙(`rules_list_sha256`, `rules_expected_sha256`) + `harness_sha256` + `control_sha256` | `sha256(canonicalJson({schema:"semgrep-lsp-binding/1", tool:{version, wheel_sha256}, pin_sha256, rules:{list_sha256, expected_sha256}, harness_sha256, control_sha256}))`. 구성 요소가 **하나라도 null이면 null** — 확인하지 못한 두 실행이 같은 결합으로 보이지 않게 한다 |

하네스 지문에서 `data/`를 제외하는 근거: `pin.json`과 규칙 목록은 `pin_sha256`·`rules_*_sha256`으로, 대조 기대값과 예제는 `control_sha256`으로 묶이고, `scope.json`은 target의 범위(E)에만 쓰여 대조 참조에는 영향이 없다. `testing/`·테스트 파일을 제외하는 근거가 구멍이 되지 않도록 구조 시험이 "운영 소스는 `testing/`을 가져오지 않는다"를 지킨다.

**참조 자격** (`reference_qualification`, `scripts/semgrep-lsp/reference.ts`) — control 실행이 아래 요구를 **모두** 충족할 때만 `eligible`이다: `PROVENANCE_REAL`, `MEASUREMENT_COMPLETE`, `CONTROL_ASSERTIONS_PASS`, `N0_CONFIRMED`, `FINGERPRINTS_COMPLETE`(다섯 값이 모두 있고 결합이 구성 요소로 다시 만든 값과 같다), `NEGATIVE_PREFLIGHT_PASS`(7개 모두 정확히 하나씩 `PASS`), `NEGATIVE_ENGINE_PASS`(9개 모두 정확히 하나씩 `PASS`), `NEGATIVE_BINDING_MATCH`(모든 `PASS` 항목의 `binding_sha256`이 이 실행의 결합과 같다). 스텁 실행은 어떤 경우에도 `eligible`이 아니다.

**target의 확인** — `control_reference`는 판정이 아니라 사실(지문, 음성 대조 요약)을 싣고, target 판정은 자기 선언 `eligible`을 믿지 않고 이번 실행의 지문(`currentFingerprints`)과 다시 맞춘다. 기존 확인(없음·합성·PASS 아님·핀·`n0`) 뒤에 아래가 더해진다. 모두 `CONTROL_MISSING`으로 이어지고 `value`는 `null`이다.

| 사유 | 조건 |
| --- | --- |
| `CONTROL_REFERENCE_FINGERPRINT_MISSING` | 참조 또는 이번 실행에 하네스·대조·결합·도구 버전·휠 지문 중 비어 있는 것이 있다. 없는 값은 없는 값과도 일치하지 않는다 |
| `CONTROL_REFERENCE_HARNESS_MISMATCH` / `_CONTROL_MISMATCH` | 하네스 지문 / 대조 지문이 다르다(핀이 같아도) |
| `CONTROL_REFERENCE_TOOL_MISMATCH` | 도구 버전·휠·규칙 목록·규칙 기대 목록 중 다른 것이 있다 |
| `CONTROL_REFERENCE_BINDING_MISMATCH` | 결합이 이번 실행과 다르거나, 참조의 결합이 자기 구성 요소(자기 `pin_sha256` 포함)로 다시 만든 값과 다르다 |
| `CONTROL_REFERENCE_NEGATIVE_INCOMPLETE` | 요구된 (id, 층) 쌍 16개 중 없거나·중복이거나·`NOT_RUN`·`FAIL`이거나·결합이 다른 항목이 있다(상세는 `R3:engine(NOT_RUN)` 같은 토큰만) |
| `CONTROL_REFERENCE_NOT_ELIGIBLE` | 참조가 `eligible:true`를 선언하지 않았거나, 선언했는데 위 사실 확인이 하나라도 실패했다 |
| `CONTROL_REFERENCE_RECORD_REJECTED` | 호출자가 대조 기록(`--control-record`)을 명시했지만 참조로 수락하지 못했다. 상세는 이유 토큰과 필드 경로뿐이다. 참조가 없으므로 `CONTROL_REFERENCE_MISSING`이 함께 남는다. 기록을 명시하지 않았으면 이 사유는 없고 `MISSING`만 남는다 |

**저장된 기록 읽기** (`scripts/semgrep-lsp/reference-record.ts`) — target CLI는 명시한 control `run.json` 하나만 읽는다(최신 기록 탐색·기본 경로 없음). 파일에서 읽은 값은 전부 `unknown`으로 다루고 소비하는 필드를 검사해 새 객체로 옮긴다. 수락 조건: control 실행 기록, 출처 `real`·trust `REAL_UNREVIEWED`, 그리고 **저장된 `reference_qualification`을 믿지 않고** 기록의 사실로 `qualifyControlRun`을 다시 돌린 자격이 충족이며 저장된 선언(`eligible`·요구별 충족 표시)이 재계산과 어긋나지 않을 것. 수락한 요약은 `toControlReference`로 만들고 이번 실행의 핀·도구·규칙·하네스·대조 지문 및 결합과의 비교는 위 "target의 확인"이 그대로 한다. 기록의 지문을 이번 실행 값으로 바꾸거나 이번 실행이 관측하지 못한 값을 기록의 값으로 채우지 않는다. 파일의 출처 진위(실제 Semgrep 실행에서 나왔는가)는 이 경로로 증명할 수 없다.

**현재 상태의 결과**: 엔진 음성 대조를 실행해 `PASS`로 표시하는 운영 코드가 아직 없으므로(D8) **실제 control 실행도 `eligible=false`**다. 따라서 이 변경만으로는 어떤 target 실행도 `COMPLETE`가 될 수 없다. 이는 의도한 fail-closed 상태이며, 엔진 음성 대조 실행기와 그 결과의 표시·기록이 별도 변경으로 들어와야 풀린다. 기록 읽기 어댑터는 이제 있지만 수락 경로는 시험용 합성 기록으로만 시험했다.

## Consequences

**쉬워지는 것**

- 실제 Semgrep 없이도 완료 조건·실패 우선순위·증거 직렬화를 합성 입력으로 검증할 수 있다. 같은 판정 코드를 나중에 실제 실행이 그대로 쓴다.
- "0건"이 "측정 없음"·"스캔 안 함"·"전송 손실"과 구분된다. 증거가 없으면 사유가 생기고 `COMPLETE`가 될 수 없다.
- 범위(E)가 대상 SHA에서 매번 계산되므로 파일의 추가·삭제·이름 변경이 자동으로 반영된다.

**어려워지거나 감수하는 것**

- 하네스·시험·고정 데이터가 늘어난다(`scripts/semgrep-lsp/`). 이 코드는 `E`에 포함되어 다음 실행에서 함께 스캔된다.
- 로그 형식·URI 형식·`debug/echo` 동작은 실제 실행 전까지 가정이다. 가정이 틀리면 첫 대조 실행에서 `NO_BARRIER` 등 실패로 드러나고, 그때 형식을 동결하거나 장벽 방식을 바꿔야 한다.
- `data/rules-files.tsv`·`rules-expected.tsv`는 규칙 본문이 아니라 경로·blob SHA·ID 목록이다. 라이선스상 문제가 없는지는 소유자가 확인해야 한다(U16).
- 휠 sha256은 개정 1이 보고한 값이 있을 뿐 이번에 확인하지 않았다(`verified: false`).

**유지되는 위험**

- 이 변경이 병합되어도 `lsp_security_warnings`의 진단원은 UNVERIFIED다. 인정은 `Accepted`와 별도 연결 변경을 거쳐야 한다.
- 엔진 음성 대조를 실행·표시하는 코드가 없다. 이전 실행 기록(`run.json`)을 읽어 `controlReference`를 만드는 어댑터는 있지만 수락 조건을 채우는 기록을 만들 수 없으므로, 실제 실행에서도 target은 `CONTROL_MISSING`에서 벗어날 수 없다(D11). 기록 파일은 서명되지 않아 출처 위조는 어댑터가 막지 못한다.
- 지문은 메모리 파일시스템에서만 검증했다. 실제 파일시스템에서의 줄바꿈(CRLF 체크아웃), 심볼릭 링크, 하네스 루트 아래 `node_modules` 같은 경우는 시험하지 않았다.
- 규칙 커밋 `16b9e6d4`는 2026-10-21자라 채택 시점에 14일 이상 된 커밋으로 다시 고정하려면 목록·해시·기대 목록을 같은 방식으로 다시 계산해야 한다.

**다음 단계(실행이 필요한 것)**: 해시 고정 설치 → 규칙 캐시 고정과 목록 재대조 → 대조 1차(관측 전용, 기준값 확정 안 함) → N0·S0 확정 절차 → 음성·시간 시험(엔진 필요분) → 재현성 → target 실행. 각 단계는 별도 승인이 필요하다. 그 전에 **코드 전제**가 필요하다: 엔진 음성 대조 실행기와 그 결과를 `PASS`로 표시·기록하는 코드, 도구 버전·휠 해시 관측, 다른 서버 프로세스 검사와 실제 잠금, 루프백 메트릭 수신기(README "실제 실행 전에 남은 전제").

## Appendix A. 시험 근거

이 변경의 시험은 전부 **합성 트랜스크립트·시험용 스텁**으로만 돈다. 통과는 "하네스의 판정 로직이 합성 입력에서
의도대로 동작한다"만 뜻한다. 실제 Semgrep의 호환성, 탐지 성공, 로그·URI 형식, `debug/echo` 동작은 증명하지 않는다.

### A.1 시험 구성 (최초 전달 1029개·32개 파일, 외부 검토 반영 후 1229개·35개 파일)

아래 표의 시험 수는 최초 전달 시점의 값이다. 검토 반영으로 새 파일 3개(174개)가 더해졌고, 기존 파일에 26개가 더해졌다.

| 영역 | 파일 | 시험 수 | 무엇을 증명하는가 |
| --- | --- | --- | --- |
| 전송·시계·수집 | `sha`, `framing`, `jsonrpc`, `clock`, `streams`, `testing/*`(포트 가짜) | 157 | Content-Length 프레이밍(fail-closed), id 기반 응답 라우팅, 가상 시계, stdout·stderr 독립 수집 (rev2 S13a 포함) |
| 규칙·범위·URI·로그·집계 | `rules-manifest`, `scope`, `uri`, `log-matcher`, `aggregate` | 251 | 고정 해시 재현, 최종 ID 모델, 대상 SHA에서 E 계산(추가·삭제·이름 변경 반영, 옛 목록 복사본 거부), URI 정규화 변형, 메시지 본문 전체 일치, 집계·중복 제거 (S14, S18) |
| 사전 검사·대조·증거 | `settings`, `precheck`, `control`, `evidence` | 136 | 서버 없는 PH0 (R1~R5의 `MANIFEST_MISMATCH`, R7·R9의 허용 키 거부), 대조 단언 A1~A4와 정상 쌍, 정규 JSON·덮어쓰기 거부·필드 분리 |
| 순수 판정 | `evaluate*`, `testing/transcript-builder` | 216 + 6 | S1~S19(S13a·T1 제외), ADR D4의 12행 전체와 요청된 7개 조합(대표 상태와 사유 집합 모두), 필수 증거를 하나씩 빼도·중간까지만 잘라도 `COMPLETE`가 되지 않음, 사유 코드 전수 분류(`REASON_EMITTERS`) |
| 세션·하네스 | `session`, `testing/stub-lsp`, `harness` | 148 | T1a~d(가상 시계), 스캔 요청 정확히 1회, 실패·취소·종료마다 정리 1회·타이머 0개, 사전 검사 실패 시 프로세스 미생성, 스텁 기록의 `SYNTHETIC`·`UNVERIFIED` 고정 |
| 실제 어댑터·CLI·구조 | `fs-node`, `git-node`, `process-node`(+통합), `cli`, `structure` | 115 | 실제 파일·읽기 전용 git·`node` 스텁 자식과의 통합, 방지 장치 조합(하나라도 빠지면 `NOT_RUN`·종료 코드 3·프로세스 생성 호출 0회), `child_process`·네트워크 사용 위치, 기존 게이트 비연결 |
| 외부 검토 회귀 (검토 반영) | `evaluate.review-regressions`, `fingerprint`, `reference` | 82 + 40 + 52 | 건수↔진단 모순 거절과 정상 중복 제거 수락, S0 비교(0 포함), 음성 대조 두 층과 참조 자격, 하네스·대조 지문과 결합, 위조된 `eligible`과 null끼리의 일치 거절. 수정 **전** 코드에서 `[RED]` 58개가 실패하고 `[GUARD]` 24개가 통과함을 확인한 뒤 구현했다 |

### A.2 요청된 겹침 조합과 시험 ID

| 조합 | 시험 |
| --- | --- |
| `rulesRefreshed` 전에 서버 종료 | `D4-1` |
| 로딩 오류 후 종료 | `D4-3` |
| 장벽·echo 없이 시간 초과 | `D4-4`, `T1a` |
| 모든 URI 도착 후 장벽 누락 | `D4-5`, `S9` |
| 장벽 도착 후 잘린 프레임 | `D4-7`, `S13b` |
| echo 이후 늦은 진단 | `D4-8`, `S5b` |
| 대조 참조 누락 + 정상적인 0건 | `D4-9`, `S17-no-reference` |

외부 검토(PR #28, 검토 HEAD `8ebf8b2`)가 재현한 4건은 `evaluate.review-regressions.test.ts`의 `[RED]` 시험이 고정한다.

| 검토 지적 | 수정 후 결과 |
| --- | --- |
| `happyTarget({ m: 1 })` + 전부 빈 게시가 `COMPLETE`·0건 | `PARTIAL`, `MATCH_COUNT_DIAGNOSTICS_MISSING`, `value` null |
| 음성 대조 `NOT_RUN` 참조를 target이 수락 | `CONTROL_MISSING`, `..._NEGATIVE_INCOMPLETE`·`..._NOT_ELIGIBLE`, `value` null (대조 기록의 단언 `PASS`·측정 `COMPLETE`는 그대로) |
| 핀이 같으면 하네스·대조가 바뀐 참조도 수락 | 하네스·대조·도구·결합 지문이 다르거나 없으면 `CONTROL_MISSING` |
| `skippedS > 0`일 때만 S0 비교 | 확정된 S0는 S = 0도 비교(`SKIPPED_RULES_S0_MISMATCH`) |

### A.3 증명하지 않는 것

- 실제 Semgrep 프로세스·Windows 파이프 동작(스텁 자식을 `taskkill /T /F`로 끝내는 것만 확인했다), 로그 형식, URI 형식, 종료 코드 (U3, U7, U9, U10).
- 실제 규칙 로딩 수(N)·건너뛴 규칙 수(S)·대조 예제 탐지 (U1, U2, U5, U6).
- `initializationOptions` 키 이름이 실제 서버가 읽는 이름과 같은지 (U8).
- 음성 대조 R1~R9의 엔진 진단 실행(모두 `NOT_RUN`)과 시간 시험 T2·T3. 음성 대조가 `NOT_RUN`이어도 `control_assertions`는 필수·금지·정상 쌍 단언만으로 `PASS`가 될 수 있다. 기록에는 `NOT_RUN`이 그대로 남고, 대신 `reference_qualification`이 불충족이라 target의 대조 참조가 될 수 없다.
- 자격을 갖춘 참조가 **실제 control 실행에서 만들어지는 경로**. 시험은 손으로 만든 참조로 수락 경로를 확인했을 뿐이고, 엔진 음성 대조를 `PASS`로 표시하는 운영 코드와 이전 `run.json`을 읽는 어댑터는 없다.
- `Found M matches`와 게시 진단의 관계는 고정 소스를 읽어 도출했다(소스 인용은 "확인한 사실"의 건수 관계 행). 실제 서버가 그 관계를 지키는지는 실행해 보지 않았다.
- 시험 대부분은 구현과 같은 단계에서 작성됐다. 단위별 일부 시험은 구현 전에 실패를 확인했고, 나머지는 소스를 일부러 망가뜨리는 변이 점검으로 시험이 실제로 잡아내는지 확인했다.

## Appendix B. 개정 2에서 이 문서가 확정한 것

| # | 확정 내용 |
| --- | --- |
| 1 | `RULE_LOAD_ERROR`·`RULE_INVALID`를 `RULES_NOT_LOADED`보다 앞에 둔다(구체적 원인 우선). 개정 2는 반대였다 |
| 2 | `NO_BARRIER`·`ECHO_MISSING`은 상태가 아니라 사유다. 상태는 `TIMEOUT`(프로세스 생존) 또는 `ENGINE_FAILED`(장벽 전 종료) |
| 3 | 단계를 가리지 않는 일반 실패는 실패가 난 단계의 대표 상태로 보고한다(`INIT_FAILED` / `RULES_NOT_LOADED` / `ENGINE_FAILED`·`TIMEOUT`) |
| 4 | `PREFIX_MISSING`을 `RULE_COUNT_MISMATCH`보다 앞에 둔다(N = 205의 구체적 원인) |
| 5 | `UNKNOWN_RULE_ID`를 결과 집합 쪽(`TARGET_MISMATCH` 뒤)으로 옮긴다. 증거가 스캔 끝에서 완성된다 |
| 6 | `CANARY_MISSING`은 측정 상태에서 빼고 `control_assertions`의 단언 실패로 둔다 |
| 7 | `PARTIAL`에 "엔진 보고 줄 부재"와 "설명되지 않은 S > 0"을 포함한다 |
| 8 | PH3 진입 전에 echo-pre-scan 응답을 필수로 한다(stdout을 비운 상태에서 스캔을 보낸다) |
| 9 | 규칙 키는 전체 최종 ID다(마지막 조각 정규화를 폐기) |
| 10 | 필드를 `measurement`/`control_assertions`/`candidate_gate`/`existing_gates`로 나누고, 후보 평가는 `PASS`/`FAIL`이 아니라 `WOULD_PASS`/`WOULD_FAIL`로 쓴다 |
| 11 | 스텁 실행은 `provenance=stub`·`trust=SYNTHETIC`이며 평가는 항상 `UNVERIFIED`이고 대조 참조가 될 수 없다 |
| 12 | 대상 범위는 상수 목록이 아니라 대상 SHA에서 매번 계산한다 |
| 13 | 구현 중 사유 코드 3개를 추가했다. `INITIALIZED_NOT_SENT`·`INITIALIZED_REPEATED`(→ `INIT_FAILED`), `CLEANUP_FAILED`(→ `ENGINE_FAILED`). 프로세스를 띄웠다면 자식 정리 성공 기록이 필수 증거다 — 없거나 실패면 `COMPLETE`가 될 수 없다 |
| 14 | 사유→상태 표의 정본은 `scripts/semgrep-lsp/status.ts`다. 이 문서의 D3 표는 상태 단위 요약이다 |
| 15 | (외부 검토) `Found M matches`와 게시 진단의 관계를 고정 소스에서 도출해 `D ≤ M`, `M > 0 ⇒ D ≥ 1`로 확정했다. `M = D`를 강제하지 않는다. 사유 `MATCH_COUNT_DIAGNOSTICS_MISSING`·`_EXCESS`(→ `PARTIAL`) |
| 16 | (외부 검토) 확정된 `s0`는 관측 S = 0도 비교한다. 사유 `SKIPPED_RULES_S0_MISMATCH`(→ `PARTIAL`) |
| 17 | (외부 검토) 음성 대조를 `preflight`/`engine` 두 층으로 나누고, 항목마다 결합(`binding_sha256`)을 단다. 양성·정상 쌍 단언의 `PASS`와 별개로 `reference_qualification`을 둔다 |
| 18 | (외부 검토) 하네스·대조 지문과 결합을 정의하고(D11) 실행 기록의 `inputs`와 대조 참조에 보존한다. 증거 파일에 `fingerprints.txt`를 더해 9개로 한다 |
| 19 | (외부 검토) 사유 코드 10개를 더했다: `MATCH_COUNT_DIAGNOSTICS_MISSING`·`_EXCESS`, `SKIPPED_RULES_S0_MISMATCH`(→ `PARTIAL`), `CONTROL_REFERENCE_FINGERPRINT_MISSING`·`_HARNESS_MISMATCH`·`_CONTROL_MISMATCH`·`_TOOL_MISMATCH`·`_BINDING_MISMATCH`·`_NEGATIVE_INCOMPLETE`·`_NOT_ELIGIBLE`(→ `CONTROL_MISSING`). 상태 우선순위는 바뀌지 않았다 |
| 20 | (기록 읽기 어댑터) 사유 코드 `CONTROL_REFERENCE_RECORD_REJECTED`(→ `CONTROL_MISSING`)를 더했다. 대조 기록을 명시했지만 수락하지 못한 이유를 남기며, 기록을 명시하지 않은 경우의 `CONTROL_REFERENCE_MISSING` 동작은 그대로다. 기록은 `--control-record`로 한 개만 명시하고(자동 탐색 없음) 저장된 자격 선언을 믿지 않고 다시 계산한다 |
