# LSP-SCAN-1 후속 실제 1회 관측 보고서 (초기 진행 메시지 장벽 적용)

- 실행일: 2026-11-04 (UTC 01:09~01:15)
- 기준: PR #45 HEAD `b1eef5b792a58aa517c7004a1461ebfc9d38737f` (장벽 구현 커밋 `5471861`, 시험·문서 커밋 `b1eef5b`). 시작 전 로컬·원격·PR 모두 같았고 작업 트리가 깨끗했다. 이 보고서와 README를 쓰기 전까지 저장소 파일은 바뀌지 않았다.
- RunId: `20261104T010928Z-99e25e61` (전용 계정 `bsi99e25e61`, SID 접미 `-1014`)
- 범위: 설치된 `semgrep.exe`를 `["lsp","--debug"]` 인자로 **딱 1회** 실행했다. 소유자가 이번 한 번에 한해 실제 엔진 실행과 격리 적용을 승인했다. 승인은 합성 입력 한 건의 관측에만 적용되며 보안 게이트·대조 참조 자격·실제 저장소 스캔 승인이 아니다. 코드·테스트·계약, 환경, 인자, 한도, 판정 규칙은 바꾸지 않았고 `--version`, LSP-MIN-1, LSP-RULES-1, `Test-IsolationEffect.ps1`, 추가 네트워크 프로브도 실행하지 않았다. `pin.json`, `verified`, `policy_accepted`, ADR 상태, 다른 PR, `main`, 보담 저장소는 그대로다.
- 구분 표기: **사실** = 이번 실행의 출력이나 읽은 파일의 내용, **도출** = 사실을 이어 붙인 판단, **미확인** = 이 실행으로 확인되지 않은 것.
- 수용한 한계(해결로 기록하지 않는다): 설치된 바이너리와 공개 소스의 대응은 확인되지 않았고, 2026-10-28 `--version` 시간 초과의 원인도 확정되지 않았다. 이번 관측은 이 두 한계를 안고 한 번 해 본 것이며, 신뢰 검증이 끝났다는 뜻이 아니다.
- **별도 실행.** 2026-11-03의 `ABORTED:SERVER_REQUEST_NOT_ALLOWED`(RunId `20261103T024748Z-3e4360b8`, PR #44 HEAD `fdc95b8`)는 이 실행과 별개이며, 판정·표지·원문·해시를 바꾸거나 새 코드로 다시 판정하지 않았다. 두 실행은 서로 다른 코드(이번에는 초기 진행 장벽이 있다)와 서로 다른 RunId의 한 번씩의 관측이다.

## 1. 결론

| 질문 | 답 | 구분 |
| --- | --- | --- |
| 관측이 성립했는가 | **예.** 판정 `SCAN_RESPONSE_OBSERVED`, 기록 상태 `OBSERVED`, 최종 상태 `SCAN_RESPONSE_OBSERVED`. 16개 조건 모두 `PASS`. 진입점 종료 코드 0 | 사실 |
| 무엇이 성립했는가 | 기록의 `evidence_scope`는 `ONE_SYNTHETIC_INPUT_REACTION`이고 `established`는 `ONE_SYNTHETIC_INPUT_DIAGNOSTIC_REACTION`, `ENGINE_GIVEN_RULE_COUNT_PARTIAL_OBSERVATION`, `DIAGNOSTIC_FIELDS_CONFIRMED` 세 가지다. 즉 **합성 파일 한 건에 해시 고정 프로브 규칙 하나로 서버가 진단 한 건을 낸 반응**까지다 | 사실 |
| 새 장벽은 동작했는가 | 이 한 번의 실행에서는 그렇게 읽힌다. `didOpen`은 stdout에서 초기 진행 수명주기 두 개가 모두 읽힌 뒤(장벽 완료 3,525ms, `didOpen` 송신 4,523ms, 그때 stdout 2,177B)에 나갔고, `didOpen` 뒤에 읽힌 서버 요청은 0건, `didOpen` 뒤 진행 알림도 0건이었다. 한 번의 관측이라 재현성은 확인하지 못했다 | 사실 / 미확인(재현성) |
| 종료 경로는 계약대로였는가 | `shutdown`(9,329ms)과 `exit`(9,332ms)를 보냈고 서버가 종료 코드 0으로 스스로 끝났다. 강제 종료 0회, 중단 요청 없음. 단 `shutdown`에 대한 응답 프레임은 stdout에서 관측되지 않았다(5.7절) | 사실 |
| 관측·프로세스 정리·시스템 복구 | 따로 보고한다. 관측 성립, 프로세스 정리 완료(`ok`), 시스템 복구 완료(`ok`, 복구 뒤 기준과 48개 항목 모두 같음) | 사실 |
| 외부 통신이 없었다고 말할 수 있는가 | **아니오.** 루프백 0건·귀속된 5157 0건이지만 식별 불가 5157이 25건 있고(5.10절), DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 않았다 | 사실 |
| `git` 프로세스가 만들어졌는가 | 미확인. 시도 로그 줄은 2건(기대 모양)이고 프로세스 표본 16회에 `git` 이미지는 없었다 | 사실 / 미확인 |
| 이 결과로 규칙 일반의 탐지 성능·실제 저장소 스캔·보안 통과·음성 대조·대조 참조 자격을 말할 수 있는가 | **아니오.** 기록의 `not_established`에 `NOT_ESTABLISHED`로 남아 있고 `real_binary_verified`는 `false`다 | 사실 |

## 2. 실행 전 확인

| 확인 | 결과 (사실) |
| --- | --- |
| 로컬·원격·PR HEAD, 작업 트리 | 셋 모두 `b1eef5b792a58aa517c7004a1461ebfc9d38737f`. `git fetch` 뒤 `origin/security/semgrep-lsp-scan-progress-barrier`가 같고 앞섬/뒤처짐 `0 0`. PR #45는 열려 있고 Draft이며 base는 `security/semgrep-lsp-scan-preflight`. `git status --porcelain` 출력 없음. 실행 직전(UTC 01:13)에도 HEAD와 상태를 다시 읽어 같았다 |
| 이번 요청의 중복 흔적 | 없음. 마지막 이전 RunId는 `20261103T024748Z-3e4360b8`이었고 그 뒤 새 RunId 폴더·`lsp-scan-*` 산출물·표지가 없었다. `bsi*` 계정 0, 접두 방화벽 규칙 0(전체 692), `semgrep*` 프로세스 0. 사전 점검 P09도 `PASS`였다. 이번 RunId는 사전 점검이 새로 만들었다 |
| 이전 RunId | `20261103T024748Z-3e4360b8`의 실행 기록 폴더·표지·원문은 건드리지 않았다 |
| 실행 권한·정책 | 관리자 권한 세션(`IsInRole(Administrator)=True`). PowerShell 도구는 7.6.9이고 도구 프로세스의 실행 정책은 프로세스 범위 `Bypass`로 읽혔다. 모든 스크립트는 `powershell.exe`(파일 버전 `10.0.26100.8875`)를 `-NoProfile -ExecutionPolicy RemoteSigned -File`로 불러 실행했다. 7의 `PSModulePath`가 5.1 자식에 새지 않도록 부르기 직전에 5.1 기본 모듈 경로로 맞췄다(호출 환경만 해당하며 Semgrep 자식의 환경·인자·한도는 그대로다). 시스템(`LocalMachine`) 실행 정책은 `RemoteSigned` 그대로이고 마지막에 다시 읽어 확인했다 |
| 설치물·프로브·합성 파일 전체 해시 (직접 계산, .NET SHA-256) | 모두 기존 근거의 고정 리터럴과 비교해 같았다(기대값을 현재 파일에서 만들지 않았다): `semgrep.exe` `960388bc3dc6a6c38f84ffac1c38df434ff5d0a02c9c277ee214d88de9cb4013`(108,456B), `semgrep-core.exe` `6790bb4a902c99a15a3356c082a66dee9edda80a2994f1964ab82ebacdfed116`(246,296,090B), 휠 `b403865e64f5ba0691630adf9bc13592cc38830726d4a114960d7e2d3fb21fc6`(58,108,036B), 프로브 규칙 `d5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145`(233B), 합성 대상 파일 `097b6a5ddb0f1f822b91ccebad23fa448d1970222502e4f18447479d0cd741ba`(135B). 값의 출처는 PR #35 보고서(`semgrep-dist-verification-20261027.md`)와 2026-11-03 보고서다. 진입점의 L03~L06, P01·P02도 같은 결과(보고서 교차 확인 R1·R2·R3 모두 `True`) |
| 진입점 인자 | 2026-11-03과 같은 필수 인자(`-RunDir -Mode semgrep-lsp -DistRoot -SemgrepExe -ExpectedExeSha256 -ExpectedCoreSha256 -WheelPath -ExpectedWheelSha256 -DistReport -TsxCmd -NodeDir`)에 `-Execute -ConfirmRunId`를 더했다. `-ConfirmRunId`는 `resources.json`의 RunId를 읽어 RunDir 이름과 서수 비교로 같음을 확인한 값이다 |
| 실제 사용한 tsx·Node | `tsx` v4.23.12 (인자로 넘긴 경로는 `semgrep-lsp-rules-load-exec` 작업 트리의 `node_modules\.bin\tsx.cmd`. 이 PR 작업 트리의 `node_modules`는 그 `node_modules`로 가는 정션이며 2026-11-03과 같은 경로를 썼다), Node v24.22.1 (`C:\Users\Nexsol\AppData\Local\Author Software\nvm\installs\v24.22.1\node.exe`). 둘은 TS 재해석에만 쓰인다 |

## 3. 기준 저장 (저장소 밖)

적용 전에 `Save-IsolationBaseline.ps1 -Mode Save -TreeStats`로 48개 항목을 읽어 저장했다. 종료 0, `OK` 42 / 근거 있는 `NOT_PRESENT` 6 / `READ_FAILED` 0이다(읽기 실패가 하나라도 있었다면 적용하지 않기로 했으나 없었다). 읽은 항목은 계정, `Administrators`·`Users` 그룹 구성원, 프로필 폴더·프로필 목록 SID, 방화벽 규칙 이름 전체, 감사 원문 두 하위 범주(`{0CCE9226…}` 연결 차단, `{0CCE922B…}` 프로세스 생성; 둘 다 `No Auditing`), 여섯 경로의 ACL, 설치물 해시·크기, 두 폴더의 파일 수·바이트, 작업 루트 없음, `semgrep*` 프로세스 0이다.

## 4. 절차와 결과

| 단계 | 결과 (사실) |
| --- | --- |
| 읽기 전용 사전 점검 | 종료 0. 적용 차단 항목 없음. P12 `NEEDS_GRANT`(권한 부여 두 건 필요)는 예상된 값이다. 스냅숏 확인값 `28e37b3a008d` |
| 기준 저장 (`-Mode Save`) | 종료 0. 위 3절 |
| 적용 dry-run | 종료 0. 계획이 허용 범위와 같다(계정 1, 작업 폴더 1, ACE 2, 방화벽 규칙 1). 실제로는 아무것도 만들어지지 않았다(계정·규칙·작업 루트 0을 직접 읽어 확인) |
| 적용 (`-ConfirmSnapshot 28e37b3a008d -Apply -GrantReadExecute`, 가상환경 루트·기반 Python 폴더) | 종료 0. 계정 생성(`Users` 그룹만, 비활성), 암호는 DPAPI 파일, 작업 폴더, ACE 두 건, 방화벽 규칙 생성·활성화 |
| 적용 직후 확인 (`-Mode Verify`) | 종료 0, `EQUAL`(같음 53 / 다름 0 / 확인 불가 0). 결과를 파일로 보존했다 |
| 진입점 dry-run | 종료 0. 사전 조건 23개 중 dry-run에서 보이는 21개 모두 `PASS`, 판정 `NOT_EXECUTED`. 표지·SCAN 산출물·`semgrep*` 프로세스 0, 계정은 계속 비활성. 계획 문구에 새 장벽 조건(초기 진행 두 수명주기)과 `didOpen`·`scanMs`가 들어 있었다 |
| 진입점 실행 (`-Execute -ConfirmRunId`, **1회**) | **종료 0**(관측 성립 + 정리 완료). 사전 조건 T01~T09·P01·P02·L01~L11·A01 모두 `PASS`(원본 출력의 `[PASS]` 23줄, `[FAIL]`·`NEEDS` 0줄). 스크립트 시작~종료 26.7초(UTC 01:13:29.8~01:13:56.5), 관측 구간은 UTC 01:13:35.27~01:13:56.41 |
| 복구 dry-run → 복구 (`-Apply -RemoveProfile`) | 종료 0 / 종료 0. 방화벽 규칙, ACE 두 건, 계정, 프로필 폴더, 작업 폴더, 빈 작업 루트, 암호 파일 모두 `OK`. 감사는 진입점이 이미 원래 값으로 되돌려 놓아 `ALREADY_RESTORED` |
| 복구 뒤 비교 (`-Mode Compare`) | 종료 0, `EQUAL`(같음 48 / 다름 0 / 확인 불가 0) |

## 5. 관측 사실

### 5.1 실행한 것, 신원·결합·프로세스 체인·감독·표지

- 결합: 결과 상태 `ACCEPTED`, 실패 없음. 신원 교차 확인: 통과(실패 없음). 러너 = `powershell.exe` 5.1이고 소유 SID가 전용 계정, 자식의 부모 = 러너·소유 SID = 전용 계정·실행 파일 = 요청한 파일·명령줄 = 요청한 인자·시작 시각 = 자기 보고. 기록의 `provenance`는 `real`이고 mode 불일치 사유는 없다.
- 실행 요청: `semgrep.exe lsp --debug`, 보낼 수 있는 메시지는 `initialize`·`initialized`·`didOpen`·`shutdown`·`exit`뿐이다. 한도는 계약 값 그대로(전체 150,000 / 초기화 60,000 / 장벽 60,000 / 스캔 30,000 / settle 2,000 / 종료 30,000ms). 자식 `PATH`는 `C:\WINDOWS\System32;C:\WINDOWS`, 작업 디렉터리는 작업 폴더의 `lsp-scan\lsp-state`다.
- 프로세스 체인(관리자 쪽 CIM 표본, 모두 소유 SID가 전용 계정): 러너 `powershell.exe`(PID 11116) → `conhost.exe`, `semgrep.exe lsp --debug`(6832) → (`conhost.exe`, 가상환경 `python.exe`(7692) → 기반 `python.exe`(17548) → `semgrep-core.exe`(21440, 명령줄 `osemgrep lsp --debug`)). 러너 쪽 표본 16회(실패 0)에서 본 이미지는 `conhost.exe`, `python.exe`, `semgrep.exe`, `semgrep-core.exe`뿐이고 허용되지 않은 이미지는 없었다(최대 자손 4). `pysemgrep.exe`와 `git`은 나타나지 않았다. `semgrep.exe` 이하 서버 쪽 프로세스 다섯 개(자기 `conhost.exe` 포함)의 종료 시각은 UTC 01:13:47.442로 같았고 러너는 01:13:50.88에 끝났다.
- 감독: 감독자의 중단 요청 없음, 강제 종료 없음, 관측 마감 도달 없음, 루프 84회, CIM 읽기 실패 0.
- 실행 시도 표지: `lsp-scan-attempt.marker`(611바이트)를 UTC 01:13:35.230에 배타적으로 확보했다(`acquired=true`, `autoDelete=false`, `retryable=false`). 복구 뒤에도 그대로 있다. 이 RunId는 소모됐다.

### 5.2 송신 목록과 `initialize` 응답

| 순서 | 메시지 | 시각(관측 시작 기준) | stderr 누적(송신 시점) | stdout 누적(송신 시점) |
| --- | --- | --- | --- | --- |
| 1 | `initialize` | 184ms | 0B | 0B |
| 2 | `initialized` | 2,604ms | 5,936B | 643B |
| 3 | `textDocument/didOpen` | 4,523ms | 11,944B | 2,177B |
| 4 | `shutdown` | 9,329ms | 18,413B | 2,699B |
| 5 | `exit` | 9,332ms | 18,413B | 2,699B |

`initialize` 응답: id `lsp-scan-init-1`, 판정 `VALID`, 지연 1,939ms, `serverInfo` = `Semgrep` `1.180.0`(핀 버전과 `MATCH`), capabilities SHA-256 `edbaada3346b3a866c0d425d25b6832475403115f1159a705fa2363b07179113`(2026-11-03과 같은 값). `initialized`는 이 응답이 유효하고 버전이 맞은 뒤에 정확히 1회 보냈다. `didOpen`의 URI는 `file:///C:/ProgramData/bosang-semgrep-iso/<RunId>/work/lsp-scan/ws/lsp-scan-1-target.txt`, `languageId` `plaintext`, `version` 1, 본문 해시는 합성 파일 해시(`097b6a5d…41ba`)와 같다. 문서 변경·저장·닫기, 작업 영역 메시지, `semgrep/scanWorkspace`, `semgrep/refreshRules`, `debug/echo`는 보내지 않았다. 러너는 서버 요청에 응답하지 않았다.

### 5.3 초기 진행 장벽 (이번 실행의 핵심 변경)

기록의 `evidence.progress_barrier`는 상태 `COMPLETE`, 평가한 프레임 7개, 평가 기준 stdout 위치 2,177B, 문제·미완료·위반 없음이다. `didOpen` 송신 때의 stdout 위치(2,177B)가 두 번째 수명주기 `end` 프레임의 끝과 같다.

| 수명주기 | 단계 | `create` (stdout 바이트) | `begin` (바이트, 제목 / 문구) | `end` (바이트) | 상태 |
| --- | --- | --- | --- | --- | --- |
| 0 | `REFRESH_RULES` | 643–884 (id `bf1ce4c0…`, 토큰 `e6397847…`) | 884–1133, `Semgrep` / `Refreshing Rules` | 1133–1333 | `COMPLETE` |
| — | (`semgrep/rulesRefreshed`) | — | — | 1333–1463 | 1회 |
| 1 | `SCAN_OPEN_DOCUMENTS` | 1463–1704 (id `464e4edb…`, 토큰 `35d3f818…`) | 1704–1977, `Semgrep Scan in Progress` / `Scanning Open Documents` | 1977–2177 | `COMPLETE` |

- 두 요청의 id와 토큰은 모두 문자열이고 서로 다르며, 토큰이 요청 id와만 같은 경우(`token_is_request_id_only`)는 없었다. 네 `begin`·`end` 알림의 판정은 모두 `ACCEPTED`다.
- 장벽 완료 시각은 3,525ms, `didOpen` 송신은 4,523ms로 **998ms 뒤**다. 장벽이 열린 뒤 러너 코드(`lsp-scan-runner.ps1` `BARRIER_WAIT`)는 프로브·합성 파일 해시를 한 번 더 읽고 `didOpen`을 만들어 보내며 그 사이에 명시적 대기는 없다(코드 읽기, 도출). 이 998ms의 실제 원인은 확인하지 못했다. 2026-11-03에도 장벽 도달에서 `didOpen`까지 913ms였다(그 보고서 5.3절)
- stderr 쪽 장벽 신호: 맨줄 `Scanned open documents`는 286행(시작 바이트 11,872)이며 `didOpen` 송신 때의 stderr 읽기 위치(11,944B)보다 앞이다. `rulesRefreshed`는 1회.
- 서버가 두 번째 수명주기의 토큰을 만든 줄: stderr 231행 `Creating progress token 35d3f818-… (Semgrep Scan in Progress: Scanning Open Documents)`(시작 바이트 10,102)로, stdout의 두 번째 `create` 토큰과 같다.
- 서버 메시지 요약: 프레임 9개, 서버 요청 2건(모두 `window/workDoneProgress/create`, 허용 2, **`didOpen` 뒤 0**), 진행 알림 4건(`didOpen` 뒤 0), 진단 프레임 1건, 예상 밖 알림 없음, 오류 알림 0.

### 5.4 16개 조건

모두 `PASS`, `detail` 비어 있음, `verdict_reasons` 비어 있음.

| # | 조건 | # | 조건 |
| --- | --- | --- | --- |
| 1 | `PRECONDITIONS_AND_HASHES` | 9 | `DIAGNOSTIC_FIELDS_MATCH` |
| 2 | `INITIALIZE_VALID_AND_VERSION_MATCH` | 10 | `LOG_AND_NOTIFICATION_CONSISTENT` |
| 3 | `INITIALIZED_SENT_ONCE_AFTER_VALID_INIT` | 11 | `NO_OTHER_NOTIFICATIONS_REQUESTS_OR_ERRORS` |
| 4 | `RULES_BARRIER_BEFORE_DID_OPEN` | 12 | `BOTH_BUNDLES_WITHIN_SCAN_MS` |
| 5 | `DID_OPEN_ONCE_AFTER_BARRIER_EXACT_CONTENT` | 13 | `SETTLE_WATCH_FROM_LATER_BUNDLE` |
| 6 | `SINGLE_FILE_SCAN_STARTED_ONCE` | 14 | `FILES_UNCHANGED_AS_EXPECTED` |
| 7 | `ENGINE_LOG_BUNDLE_COMPLETE_IN_ORDER` | 15 | `NO_NETWORK_FORBIDDEN_IMAGE_OR_EXTERNAL_COMMAND_VIOLATION` |
| 8 | `ONE_DIAGNOSTIC_NOTIFICATION` | 16 | `SHUTDOWN_EXIT_SELF_EXIT_ZERO` |

### 5.5 stdout 프레임과 진단

stdout은 2,699B, 프레임 9개, 읽기 실패 0·넘침 없음·EOF 확인(SHA-256 `ab8876d88ca2cd29461e1a4c1cf0b6b56d12f99d2dc536edca5d7293560dfb4f`). 구성은 `initialize` 응답(0–643B), 5.3절의 진행 프레임 7개(643–2,177B 중 `rulesRefreshed` 포함), `textDocument/publishDiagnostics` 1건(2,177–2,699B)이다.

| 필드 | 값 (사실) |
| --- | --- |
| 진단 알림 수 | 1건, 진단 1개 (`didOpen` 뒤 프레임 1개) |
| URI | `file:///c%3A/ProgramData/bosang-semgrep-iso/20261104T010928Z-99e25e61/work/lsp-scan/ws/lsp-scan-1-target.txt` — 기대 URI와 `MATCH` |
| `code` / `source` | `rules-probe.lsp-rules-1-probe` / `Semgrep` — 일치 |
| `message` | `LSP-RULES-1 probe rule. It is loaded but is not expected to match any target.` — 일치 |
| `severity` | 3 — 일치 |
| `range` | (줄 1, 문자 8) – (줄 1, 문자 53), 분류 `EXACT` |
| 그 밖 | `codeDescription` 없음, 알 수 없는 필드 없음 |

프로브 규칙의 `message`는 "어떤 대상과도 맞지 않을 것으로 기대한다"고 말하는 LSP-RULES-1 때의 고정 문구다. 반면 이번 합성 대상 파일의 본문(`didOpen` 원문, stderr 297행 부근)은 그 규칙의 패턴 토큰 `LSP_RULES_1_PROBE_TOKEN_THAT_IS_NEVER_PRESENT`를 한 줄(줄 1)에 담고 있고 엔진 로그도 `Found 1 matches`를 냈다(사실). 문구와 달리 매치가 한 건 나오는 것이 이 입력에서 기대되는 결과라는 해석은 도출이다(진단 위치 줄 1, 문자 8–53과 토큰 길이가 맞는 것은 확인했으나 입력 설계 의도 자체는 이 실행의 증거 밖이다).

러너가 두 묶음(진단 1건, 엔진 로그 묶음) 완성을 기록한 시각은 7,045ms로 `didOpen` 송신(4,523ms)에서 2,522ms 뒤이고 `scanMs`(30,000ms)의 약 8.4%다. 이 시각은 러너가 읽어서 확인한 시각이며 서버가 쓴 시각이 아니다(서버 로그의 대괄호 시각 `[03.86]`, `[03.88]`은 서버 자체 시계라 러너의 ms 시계에 대응시키지 않았다). settle 창은 7,045~9,045ms이고 `shutdown`은 그로부터 284ms 뒤 나갔다.

### 5.6 엔진 로그 (stderr, 줄 번호는 1부터)

stderr는 18,810B, 423줄, SHA-256 `10f9b0e8251185a68389e66732cccb5110f28b33cfc55b444fb7d4718c682a2d`, 넘침 없음·EOF 확인. 기록의 로그 분류: 레코드 95개(헤더 있음 78, 맨줄 17), 헤더 오류 0, 고아 맨줄 0, 줄 안 신호 문구 0, 분류되지 않은 `INFO` 7건(구성은 확인하지 않았다).

| 줄 (시작 바이트) | 내용 |
| --- | --- |
| 229 (9,915) / 231 (10,102) | `Scanning open documents` / `Creating progress token 35d3f818-… (Semgrep Scan in Progress: Scanning Open Documents)` |
| 230 (9,940) | `Running external command: "git" "-C" "<작업 영역>" "rev-parse" "--show-toplevel"` — `didOpen` 이전 (`BARRIER` 구간) |
| 286 (11,872) | 맨줄 `Scanned open documents` — `didOpen` 송신 시점의 stderr 위치(11,944B) 앞 |
| 297 (12,382) | `"method": "textDocument/didOpen"` 처리 (본문에 합성 파일 텍스트 3줄) |
| 300–301 (12,442 / 12,464) | `Scanning single file` / `Scanned single file` |
| 302 (12,485) | `Running external command: "git" "-C" "<작업 영역>" "rev-parse" "--show-toplevel"` — `didOpen` 이후 (`SCAN` 구간) |
| 302행 뒤 ~ 371행 앞 | `Scanning 1 targets`, `Running Semgrep with 1 rules`, `1 applicable rules of 1 valid rules, 0 invalid rules`, `core scan: 1 valid rules, 0 invalid rules`, `scan: processing 1 files (skipping 0), with 1 rules (skipping 0 )`, `found 1 matches, 0 errors (scanned 1 targets, skipped 0)` (개별 줄 번호는 적지 않았다) |
| 371 (16,182) | `Found 1 matches before processing` |
| 374–377 (16,996~) | `Semgrep errors: `(빈 값) / `Semgrep skipped 0 rules` / `Scanned 1 files` / `Found 1 matches` |
| 이후 | `Sending notification`(`publishDiagnostics`, 진단 1개), `Sending response`(같은 내용) |
| 417 (18,413) / 419 / 421 / 422 / 423 | `Handling request: { "id": 0, "method": "shutdown" … }` / `Shutting down server` / `Server exiting` / `Server stopped` / `Producing exit code 0 (OK) at: File "OSS/src/osemgrep/cli_lsp/Lsp_subcommand.ml", line 51, characters 20-27` |

엔진 요약(기록): 대상 1, 규칙 1(`engine_rule_count_passed=1`), `matches_before` 1, `scanned_files` 1, `matches` 1, `skipped` 0, 오류 텍스트 없음. 로딩 경로가 프로브 경로와 일치(`loading_paths_match_probe=true`). 규칙 수는 엔진이 알려 준 값까지만 본 부분 관측이다(`LOADED_RULE_COUNT_BEYOND_ENGINE_GIVEN_COUNT`는 미관측).

### 5.7 종료

| 항목 | 값 (사실) |
| --- | --- |
| 종료 경로 | `trigger=NORMAL`, 중단 사유 없음, stdin을 하니스가 닫지 않음(`stdin_closed_by_harness=false`), 강제 종료 0회(`kill_count=0`) |
| 서버 종료 | 종료 관측됨, 코드 0, 신호 없음. 자손 정리 `ROOT_GONE`, 남은 자손 0 |
| 시간 | 관측 9,349ms(한도 150,000ms의 약 6.2%), 정리 294ms, 감독 종료 14,719ms |
| `shutdown` 응답 | stdout 프레임으로 **관측되지 않았다**(`shutdown_response_seen=false`). stdout은 `shutdown` 송신 시점과 종료 시점 모두 2,699B로 그 뒤 쓰인 바이트가 없다. stderr에는 `Handling request … shutdown`부터 `Shutting down server`, `Server exiting`, `Server stopped`, 종료 코드 0이 모두 있다 |

`shutdown` 응답 프레임이 없었다는 것은 사실이다. 서버가 응답을 쓰지 않았는지 쓰기 전에 끝났는지는 구분하지 못했다(**미확인**). 조건 16은 "`shutdown`·`exit` 송신 뒤 서버가 스스로 종료 코드 0으로 끝났는가"이고, 응답 프레임 관측은 요구하지 않아 `PASS`다.

### 5.8 외부 명령 시도(`git`): 로그 줄과 실제 프로세스를 따로 적는다

| 구분 | 값 |
| --- | --- |
| 시도 로그 줄 | 2건, 모양이 기대와 같다(`shape_ok`). 230행(`didOpen` 이전, 장벽 구간)과 302행(`didOpen` 이후, 스캔 구간). 2026-11-03에도 같은 줄 번호였다 |
| 허용 이미지 | `git`을 더하지 않았다. 표본에 `git` 이미지가 없어 `UNEXPECTED_IMAGE`는 발생하지 않았다 |
| 실제 프로세스 생성 | **미확인**. 러너 쪽 표본 16회(실패 0)와 관리자 쪽 CIM 표본에 `git`이 없었다(`NOT_ESTABLISHED_NO_GIT_IMAGE_SAMPLED`). 표본 사이에 끝난 프로세스는 보이지 않는다 |
| 자식 `PATH` | `C:\WINDOWS\System32;C:\WINDOWS`. `git` 폴더가 없어 이름만으로는 찾기 어려울 것이라는 것은 도출이며, 실행이 성공했는지 실패했는지는 확인하지 못했다 |

### 5.9 프로브·합성 파일·감시 폴더

| 항목 | 값 (사실) |
| --- | --- |
| 프로브 해시 | 원본 / 복사 직후 / 실행 뒤 모두 `d5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145`(233B). 실행 뒤 값은 관리자가 규칙 폴더의 파일을 직접 다시 읽어 잰 값과 합쳤다 |
| 합성 파일 해시 | 원본 / 쓴 직후 / 실행 뒤 모두 `097b6a5ddb0f1f822b91ccebad23fa448d1970222502e4f18447479d0cd741ba`(135B). 복구 직전 작업 폴더 목록 읽기에서도 같았다 |
| `WORKSPACE` | 파일 1 → 1 (합성 파일만, 추가·삭제 없음) |
| `RULES_DIR` | 파일 1 → 1 (프로브 1개만) |
| `HOME_DIR` | 파일 0 → 1. 추가된 파일은 `.semgrep/cache/fingerprinted_ignored_findings/ws.txt`(0바이트, 복구 직전 목록으로 확인). 2026-11-03에는 이 폴더가 0 → 0이었다 |
| 설치물 | `semgrep.exe`, `semgrep-core.exe`, 가상환경 `python.exe`(`3638cd6a1236660910fe5e278994d309c073fb4bb49ee061f48bd4ccaaa0a191`), 기반 `python.exe`(`805fd29612c221ebea570d372ec5ed46093c25a1033f1765de9b2f8103868886`) 네 개의 해시가 실행 전·후 같음 |

감시 폴더 밖의 파일 시스템은 관측하지 않았다. 복구 전 dry-run이 전용 계정의 Windows 프로필 폴더(`C:\Users\bsi99e25e61`)가 남아 있다고 보고했고(실행 중 만들어진 것) 복구에서 지워졌다. 복구 직전의 작업 폴더 23개 항목(경로·크기·해시)은 저장소 밖에 보존했다.

### 5.10 네트워크 관측

| 항목 | 값 (사실) |
| --- | --- |
| 루프백 수신기 | `127.0.0.1:4442`, 기준 0 → 최종 0, 표본 86회, 읽기 실패 0 |
| 귀속된 5157 | 0건 |
| **식별 불가 5157** | **25건** |
| 5157 수집 | 성공(`collection.ok=True`), 감사 실패 기록 켜짐, 로그 순환으로 밀림 없음(`wrapped=False`), 프로세스 기록 읽기 성공, 건수 사용 가능, 사용 불가 사유 없음 |

식별 불가 25건의 원문 필드: 모두 방향 `Inbound`, 프로토콜 17(UDP)이다. 목적 포트 1900이 21건(PID 20556), 5355가 4건(PID 2600)이며 판정기가 적은 사유는 모두 "PID가 이번 실행의 프로세스가 아니다"이다. 이번 실행의 프로세스 표본에 없는 PID라는 것까지가 사실이다. 이 포트들이 통상 SSDP 탐색(1900)과 LLMNR 이름 질의(5355)에 쓰이는 포트라는 점에서 이 컴퓨터 쪽의 주변 수신 트래픽일 수 있다는 것은 도출이고, 그 두 PID가 무엇이었는지는 확인하지 않았다(**미확인**). 감사 창이 컴퓨터 전체를 보기 때문에 이번 실행과 무관한 이벤트도 섞인다. 판정기는 이 25건을 조건 15의 위반으로 세지 않았다. 2026-11-03의 식별 불가는 9건(목적 포트 138·1900)이었고 방향·프로토콜은 같다. 루프백·5157이 0이거나 식별 불가가 있다는 사실은 외부 통신의 부재나 존재의 증거가 아니다. DNS·UDP·ICMP·IPv6·서비스가 대신 수행하는 통신은 관측하지 않았고, 표본 사이에 끝난 프로세스의 5157은 식별 불가로 남을 수 있다.

### 5.11 TS 재해석과 정리 세 갈래

- TS 재해석: 상태 `RUN`, 종료 0, 출력 `RECORD_WRITTEN verdict=SCAN_RESPONSE_OBSERVED`, 소요 418ms. 기록 파일의 `outcomes.system_recovery`가 `NOT_OBSERVED`로 적힌 것은 재해석 도구에 복구 입력이 전달되지 않았다는 뜻이며 복구 실패가 아니다(2026-11-03 보고서와 같은 동작).
- **관측**: 성립(`OBSERVED`, `SCAN_RESPONSE_OBSERVED`).
- **프로세스 정리**: 완료(`ok`). 수신기 종료 `DONE`, 전용 계정 프로세스 `NONE_LEFT`, 재해석 도구 `NOT_NEEDED`.
- **시스템 복구**(실행 구간 안): 완료(`ok`). 전용 계정 비활성화 `DISABLED`(`enabledAfter=false`), 감사 값 복구 `RESTORED`(원래 0 / 설정 2 / 현재 0). 이어서 6절의 복구와 비교로 한 번 더 확인했다.
- 이 셋은 서로의 결과를 바꾸지 않고 따로 기록한다. 표지(`attemptMarker`)도 이 셋과 따로이며 복구에 막히지 않았다.

## 6. 이전 ABORTED 실행과의 대조 (별도 실행의 값을 나란히 놓은 것)

2026-11-03 값은 그 보고서의 기록이다. 판정을 다시 내리지 않았다.

| 항목 | 2026-11-03 (`…3e4360b8`, PR #44 `fdc95b8`) | 2026-11-04 (`…99e25e61`, PR #45 `b1eef5b`) |
| --- | --- | --- |
| 판정 | `ABORTED:SERVER_REQUEST_NOT_ALLOWED` | `SCAN_RESPONSE_OBSERVED` |
| 조건 | 16개 중 13 `PASS`, 3 `FAIL`(11·13·16) | 16개 모두 `PASS` |
| `initialize` / `initialized` / `didOpen` 송신 | 136 / 2,647 / 3,598ms | 184 / 2,604 / 4,523ms |
| `didOpen` 송신 때 stdout / stderr 누적 | 1,463B / 11,944B | 2,177B / 11,944B |
| 두 번째 `create`(토큰 생성 줄 stderr 231행, 바이트 10,102)의 stdout 위치 | 1,463B부터. `didOpen` 송신 때의 stdout 위치와 같아 `didOpen` 뒤로 읽혔고 A6로 중단 | 1,463–1,704B. `didOpen` 송신 전에 읽힘 |
| `didOpen` 뒤 서버 요청 | 1건(중단 원인) | 0건 |
| `shutdown` / `exit` | 보내지 못함 | 9,329 / 9,332ms에 보냄 |
| 종료 | 강제 종료 1회, 종료 코드 없음 | 강제 종료 0회, 종료 코드 0 |
| 진단 | 1건, 필드 일치 (중단·종료 뒤에 읽은 바이트) | 1건, 필드 일치 (정상 구간) |
| `HOME_DIR` 파일 수 | 0 → 0 | 0 → 1 |
| 귀속 5157 / 식별 불가 5157 / 루프백 | 0 / 9 / 0 | 0 / 25 / 0 |
| 복구 뒤 기준 비교 | `EQUAL` 48/0/0 | `EQUAL` 48/0/0 |

**도출** (이 해석으로 이전 실행의 판정을 바꾸지 않았다): 두 실행에서 stderr의 해당 줄 번호·시작 바이트(229·231·300행, 10,102B·12,442B)와 `didOpen` 시점의 stderr 위치(11,944B)가 같고, 이전 실행에서 A6를 일으킨 두 번째 `create`에 해당하는 요청이 이번에는 `didOpen` 전에 stdout에서 읽혔으며 `didOpen` 뒤 서버 요청이 없었다. 이는 2026-11-03 보고서의 도출(그 요청은 `didOpen`에 대한 반응이 아니라 이전 구간에 속한 요청이 늦게 읽힌 것으로 읽힌다)과 어긋나지 않는다. 그러나 서버가 그 프레임을 stdout에 쓴 시각은 두 실행 모두 저장된 증거에 없고, 이번에도 한 번의 관측이라 장벽이 `ABORTED`를 항상 없앤다고 말할 수 없다.

## 7. 복구와 기준 비교

복구(`Remove-Isolation.ps1 -Apply -RemoveProfile`, 종료 0) 뒤 `Save-IsolationBaseline.ps1 -Mode Compare`와 따로 읽은 직접 대조로 실행 전 상태와 맞췄다.

| 항목 | 결과 (사실) |
| --- | --- |
| `Compare` | `EQUAL`, 같음 48 / 다름 0 / 확인 불가 0, 종료 0 |
| 복구 항목 | 방화벽 규칙 `OK`, 가상환경 루트 ACE 제거 `OK`, 기반 Python 폴더 ACE 제거 `OK`(다른 ACE는 그대로), 계정 삭제 `OK`, 프로필 폴더 `OK`, 작업 폴더 `OK`, 빈 작업 루트 삭제, 암호 파일 `OK`, 감사 `ALREADY_RESTORED` |
| 직접 다시 읽기 | `bsi*` 계정 0개, 접두 방화벽 규칙 0개(전체 692 = 기준), 작업 루트 없음, `C:\Users\bsi99e25e61` 없음, `semgrep*` 프로세스 0개, 감사 두 범주 원문 행 `No Auditing` |
| 표지 | `lsp-scan-attempt.marker` 보존됨(삭제하지 않았다) |
| 실행 정책 | `LocalMachine=RemoteSigned` 그대로 |

읽기 실패나 빈 값끼리의 일치는 같음으로 세지 않았다(양쪽이 읽혔고 값이 같을 때, 또는 근거 있는 `NOT_PRESENT`일 때만 같음). 복구가 불완전한 항목은 없다. 직접 다시 읽기는 위 항목에 한정되며 ACL·SDDL 문자열 전체의 별도 직접 대조는 이번에는 하지 않았다(`Compare`의 ACL·ACE·소유자 항목에 맡겼다).

## 8. 원본 증거와 해시 (저장소 밖, 커밋하지 않음)

위치: `%LOCALAPPDATA%\bosang-radar\semgrep-isolation\20261104T010928Z-99e25e61`(표의 `RunDir`)과 `%LOCALAPPDATA%\bosang-radar\semgrep-isolation-baseline`(표의 `Baseline`). 암호 파일 `credential.dpapi`는 복구에서 지워졌고 증거가 아니다. 아래 표는 같은 위치의 `run-20261104-scan-evidence-hashes.txt`(크기 4,015B, SHA-256 `3f601c8617b281d32c725d92f430e8b4ce00dede22017571ff55344a9859649f`)에서 옮겼다. 해시는 전체 SHA-256이다. `preflight.json`은 시스템 목록을 담고 있어 커밋하지 않았다.

| 위치\파일 | 크기(B) | SHA-256 (전체) |
| --- | ---: | --- |
| `Baseline\run-20261104-scan-apply-dryrun-raw-output.txt` | 1,536 | `d1d29a2b5fbaca711bd2b41eb3fc1118bee35cdf440a4ea9dbd3ecb54bd58a98` |
| `Baseline\run-20261104-scan-apply-raw-output.txt` | 2,045 | `692e23634d05a3085d5ffef5085664134305af95a66579c720a8fbcbfcb20d40` |
| `Baseline\run-20261104-scan-baseline-save-raw-output.txt` | 168 | `0e5f8529d4d70c27da09e73b801741854458e9840ddfb46f1f4ca9976de99180` |
| `Baseline\run-20261104-scan-compare-raw-output.txt` | 261 | `34bde4e2dff5c2c0281914031b1d4a8bae255f9663737324c2b172b634f4892c` |
| `Baseline\run-20261104-scan-entry-dryrun-raw-output.txt` | 6,154 | `4cb4f3f367a0f3cdd20c43dba538f03ca69d1447591237912d14f1d411f1c8a3` |
| `Baseline\run-20261104-scan-execute-raw-output.txt` | 6,508 | `5da0af74b8b60700ba70d30e20edb9004892d2d27fbfa03a6c0e5b6d108c95a3` |
| `Baseline\run-20261104-scan-post.json` | 91,770 | `a204aad8a912e527a0d102635cdaae3f16253826c50597086423e220c527030a` |
| `Baseline\run-20261104-scan-pre.json` | 52,261 | `a29443c5cb9e5a97fee4eb0c82b0d30ad95a241c18090e3a08d32abae5f627c9` |
| `Baseline\run-20261104-scan-preflight-raw-output.txt` | 2,855 | `89b4ea75b0a263cd9ea5cfa90618f8344592ed49a1a21c93598b9c6a790e91a3` |
| `Baseline\run-20261104-scan-recover-apply-raw-output.txt` | 2,522 | `54ff3f6a4f7fec2be68f3a246bbbf59c52b586fd89806856e33051fbd1d850db` |
| `Baseline\run-20261104-scan-recover-dryrun-raw-output.txt` | 2,613 | `6d50e5793c6469ef17161aa76f52ac416ae3aa07618503b447e2d94c5db7463e` |
| `Baseline\run-20261104-scan-verify-raw-output.txt` | 305 | `def3ffcfab9ce9e968fbfed0fe166ef736cadf5c7e20c6affa55c88aac8cb1a5` |
| `Baseline\run-20261104-scan-workdir-listing-before-recovery.json` | 5,626 | `5654910091857c683c25c438530d78f807d5220fc25a0134fc3c77366ad6efde` |
| `Baseline\verify-applied-20261104T010928Z-99e25e61.json` | 94,376 | `db3aea563828df86eaf45fa6566b0a27870261a2ab3918c1563625e2ec4ded21` |
| `RunDir\auditpol-backup.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `RunDir\auditpol-before-011335325.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `RunDir\auditpol-before-011335325.csv.after.csv` | 5,661 | `8c47e3882dd0b258b03791ef24256b5a99c25f0b394675c39bcecb624755b84c` |
| `RunDir\auditpol-evidence-011353012.csv` | 5,661 | `8c47e3882dd0b258b03791ef24256b5a99c25f0b394675c39bcecb624755b84c` |
| `RunDir\auditpol-restore-011355293.csv` | 5,661 | `8c47e3882dd0b258b03791ef24256b5a99c25f0b394675c39bcecb624755b84c` |
| `RunDir\auditpol-restore-011355334.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `RunDir\auditpol-restore-011412799.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `RunDir\auditpol-restore-011431645.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `RunDir\log.jsonl` | 28,559 | `01a2885d4d5f411c286ccb81a07e07bcd7c80b04eef93692a3e155d37cbab044` |
| `RunDir\lsp-scan-admin-context-20261104T011330Z.json` | 2,716 | `3b21ce9480bd7e063e48807aff2a6ddc00d3f3cf4ddfe6d67f2e4158e998889a` |
| `RunDir\lsp-scan-attempt.marker` | 611 | `e640609aabce97afadd8ec44ab93c6f80a287173f033e29703a54245360654b2` |
| `RunDir\lsp-scan-observation-20261104T011330Z.json` | 71,428 | `fa2a3750c77b48fd10ee90d338309f6c93ed5f69de89b7de8e0f3c67dbf68e85` |
| `RunDir\lsp-scan-record-20261104T011330Z.json` | 19,642 | `6505194ff95ddb2dd90283937fe776efe74e18dc95a940f8292145b0a5dcc900` |
| `RunDir\lsp-scan-runner-result-20261104T011330Z.json` | 46,542 | `e22388d00a3f5ab33202acb4436a4273ef8d81f0a823d244ce029a38d2955fe3` |
| `RunDir\lsp-scan-stderr-20261104T011330Z.bin` | 18,810 | `10f9b0e8251185a68389e66732cccb5110f28b33cfc55b444fb7d4718c682a2d` |
| `RunDir\lsp-scan-stdout-20261104T011330Z.bin` | 2,699 | `ab8876d88ca2cd29461e1a4c1cf0b6b56d12f99d2dc536edca5d7293560dfb4f` |
| `RunDir\preflight.json` | 508,582 | `28e37b3a008d39fe150c86e303f47a4a3de255db8a10c87468ca6cf3d0962a4c` |
| `RunDir\recovery-20261104T011454394.json` | 2,109 | `44b764b130effae7844e05cdc270d682222c90b942959ba51f5171ad75b20947` |
| `RunDir\resources.json` | 5,247 | `5a54d3d34eebbd9771a66081b4ccfde56e66d0a0c738e42e38df6e4e173a0c88` |

## 9. 이 결과가 말하지 않는 것 / 미확인

1. 이 관측이 성립했다는 것은 **합성 파일 한 건에 프로브 규칙 하나가 반응했다**는 뜻이다. 규칙 일반의 탐지 성능, 음성 대조, 대조 참조 자격, 실제 저장소 스캔, 보안 통과, 격리 전체의 효과는 `NOT_ESTABLISHED`다. 기록의 `coverage.unobserved` 16개 항목(예: `NEGATIVE_CONTROLS`, `BINARY_SOURCE_CORRESPONDENCE`, `WHOLE_ISOLATION_EFFECT`, `PIN_AND_LOG_FORMAT_VERIFICATION`)이 그대로 유효하다.
2. 한 번의 관측이다. 같은 코드로 다시 했을 때의 재현성, 다른 입력·다른 PC·다른 계정에서의 동작은 확인하지 않았다. Windows 11 한 대, 전용 비관리자 계정 한 개, 합성 파일 한 개, 규칙 한 개만 다뤘다.
3. 서버가 각 stdout 프레임(특히 두 번째 진행 수명주기와 진단)을 **쓴 시각**은 알 수 없다. 장벽은 러너가 읽은 위치로 판단하며, 6절의 도출은 이 한계 안에서만 유효하다.
4. 장벽 완료에서 `didOpen`까지 998ms의 원인은 확인하지 않았다(2026-11-03에도 913ms였다).
5. `shutdown` 요청에 대한 응답 프레임이 stdout에 없었던 이유(응답 미송신인지 종료가 앞섰는지)는 구분하지 못했다.
6. `git`의 실제 프로세스 생성과 결과, 식별 불가 5157 25건의 출처 프로세스(PID 20556, 2600), 외부 통신 부재는 말할 수 없다.
7. 바이너리와 공개 소스의 대응은 미확인이다(수용한 한계). 로그 문구가 계약의 예측과 맞았다는 것이 대응의 증명은 아니다. 2026-10-28 `--version` 시간 초과의 원인도 확정되지 않았다(수용한 한계).
8. 기록의 `unclassified_info` 7건의 구성은 확인하지 않았다.
9. 서버 로그의 대괄호 시각은 서버 자체 시계로 보고 러너 시계와 대응시키지 않았다.
10. 이번 결과는 `pin.json`·`verified`·`policy_accepted`·ADR 상태에 반영하지 않았다.

## 10. 이번 작업이 하지 않은 것

`--version`·LSP-MIN-1·LSP-RULES-1·`Test-IsolationEffect.ps1` 같은 다른 Semgrep 실행이나 추가 네트워크 프로브, 같은 관측의 재시도와 새 RunId로의 추가 시도, 실행 뒤 코드·파서·허용 목록·환경·한도 수정, 실행 시도 표지 삭제, 규칙 다운로드, 추가 대상·규칙, 실제 저장소 스캔, 음성 대조, 서버 요청에 대한 응답, 추가 문서·작업 영역 메시지, `git` 이미지 허용, 4688 감사 추가, 전체 시험·변이 점검·독립 감사의 반복, `pin.json`·`verified`·`policy_accepted`·ADR 상태 변경, 다른 PR·`main`·보담 저장소 변경, 병합·배포. 운영 코드·시험·계약은 바꾸지 않았고 문서(이 보고서와 README)만 바뀌었으므로 시험을 다시 돌리지 않았다.

## 11. 소유자 결정이 필요한 것

이번 승인(RunId `20261104T010928Z-99e25e61`)은 소진됐다. 아래 중 어느 것도 이 작업에서 정하거나 실행하지 않았다.

| # | 결정 |
| --- | --- |
| D1 | 이번 결과(진단 1건 일치 + 정상 종료)를 계약 6.2절의 소스 도출과 함께 어떻게 기록·인용할지. `pin.json`·`verified`·`policy_accepted`·ADR에는 반영하지 않았다 |
| D2 | 다음 단계(음성 대조의 엔진 층, 실제 저장소 스캔 등)로 갈지. 각각 별도의 계획, 새 RunId, 새 승인, 새 기준 저장이 따른다. 같은 관측의 재현성 확인(새 RunId)을 원하는지도 소유자가 정한다 |
| D3 | 식별 불가 5157(이번에는 `Inbound` UDP 25건)을 조건 15에서 어떻게 다룰지. 현재 판정기는 위반으로 세지 않고 건수만 기록한다 |
| D4 | `shutdown` 응답 프레임 미관측(5.7절)을 계약에서 어떻게 볼지. 현재 조건 16은 응답을 요구하지 않는다 |
| D5 | 장벽 완료에서 `didOpen`까지 약 1초(998ms)의 원인을 따로 조사할지 |
| D6 | 재해석 기록의 `outcomes.system_recovery`가 복구 입력이 없으면 `NOT_OBSERVED`로 남는 점을 관리자 보고와 어떻게 합칠지 (2026-11-03 D6과 같음) |
| D7 | PR #43·#44·#45의 병합 여부 (이번에도 병합하지 않았다) |

참고: 2026-11-03 보고서의 D5(진입점 dry-run `[PLAN]` 문구가 `didOpen`·`scanMs`를 말하지 않는 표시 문제)는 PR #45에서 문구가 갱신되어 이번 dry-run 출력에 새 장벽 조건이 표시된 것까지 확인했다(그 결정을 닫는지는 소유자의 몫이다).
