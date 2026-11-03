# LSP-SCAN-1 실제 1회 관측 보고서

- 실행일: 2026-11-03 (UTC 02:47~02:55, 마지막 독립 재확인 02:59)
- 기준: PR #44 HEAD `fdc95b8657861d2b001120bca54bbc83e029058e` (시작 전 로컬·원격·PR 모두 같고 작업 트리가 깨끗했다. 이 보고서와 README를 쓰기 전까지 저장소 파일은 바뀌지 않았다)
- RunId: `20261103T024748Z-3e4360b8` (전용 계정 `bsi3e4360b8`, SID 접미 `-1013`)
- 범위: 설치된 `semgrep.exe`를 `["lsp","--debug"]` 인자로 **딱 1회** 실행했다. 소유자가 이번 한 번에 한해 D2와 격리 적용을 승인했다. 승인은 합성 입력 한 건의 관측에만 적용되며 보안 게이트·대조 참조 자격·실제 저장소 스캔 승인이 아니다. 코드·테스트·계약, 환경, 인자, 한도, 판정 규칙은 바꾸지 않았고 `--version`, LSP-MIN-1, LSP-RULES-1, `Test-IsolationEffect.ps1`, 추가 네트워크 프로브도 실행하지 않았다. `pin.json`, `verified`, `policy_accepted`, ADR 상태, 다른 PR, `main`, 보담 저장소는 그대로다.
- 구분 표기: **사실** = 이번 실행의 출력이나 읽은 파일의 내용, **도출** = 사실을 이어 붙인 판단, **미확인** = 이 실행으로 확인되지 않은 것.
- 수용한 한계(해결로 기록하지 않는다): 설치된 바이너리와 공개 소스의 대응은 확인되지 않았고, 2026-10-28 `--version` 시간 초과의 원인도 확정되지 않았다. 이번 관측은 이 두 한계를 안고 한 번 해 본 것이다.

## 1. 결론

| 질문 | 답 | 구분 |
| --- | --- | --- |
| 관측이 성립했는가 | **아니오.** 판정 `ABORTED:SERVER_REQUEST_NOT_ALLOWED`, 기록 상태 `ABORTED`, 최종 상태 `NOT_ESTABLISHED`. 16개 조건 중 13개 `PASS`, 3개 `FAIL`(11·13·16). 기록의 `established`는 비어 있고 `evidence_scope`는 `NONE_ESTABLISHED`다 | 사실 |
| 왜 중단됐는가 | 러너의 실시간 감시기가 `didOpen` 송신 **뒤에 읽은** `window/workDoneProgress/create` 서버 요청 한 건을 허용 밖으로 보고 규칙 A6(`REQUEST_AFTER_DID_OPEN`)로 4,281ms에 중단했다. `shutdown`·`exit`는 보내지 못했고 첫 강제 종료 시도는 5,160ms, 종료 관측은 5,314ms(종료 코드 없음)였다 | 사실 |
| 서버는 기대한 진단을 냈는가 | 낸 것으로 읽힌다. 진단 알림 1건(진단 1개), URI·`code`·`source`·`message`·`severity`·`range` `(1,8)–(1,53)` 모두 기대와 일치, 엔진 로그 묶음 완성(대상 1·규칙 1·매치 1·건너뜀 0·오류 없음). 다만 이 증거는 중단 판정을 바꾸지 않으며 기록은 아무것도 `established`로 올리지 않았다 | 사실 |
| 중단은 `didOpen`에 대한 서버의 반응이었는가 | **그렇게 보이지 않는다.** 중단을 일으킨 요청의 진행 토큰을 서버가 `didOpen` 이전 구간(stderr 231행, 바이트 10,102)에 만들었다고 기록했고, 이 구간은 `didOpen` 송신 때의 stderr 읽기 위치(11,944)보다 앞이다. 러너가 그 프레임을 `didOpen` 뒤에 읽었을 뿐이다. 단 서버가 stdout에 쓴 시각은 저장된 증거에 없어 확정하지 못했다(5.7절) | 사실(토큰·위치) / 도출(해석) / 미확인(쓰기 시각) |
| 관측·프로세스 정리·시스템 복구 | 따로 보고한다. 관측 `ABORTED`, 프로세스 정리 완료(`ok`), 시스템 복구 완료(`ok`, 복구 뒤 기준과 48개 항목 모두 같고 직접 대조 26개도 모두 같음) | 사실 |
| 외부 통신이 없었다고 말할 수 있는가 | **아니오.** 루프백 0건·귀속된 5157 0건이지만 식별 불가 5157이 9건 있고(5.11절), DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 않았다 | 사실 |
| `git` 프로세스가 만들어졌는가 | 미확인. 시도 로그 줄은 2건(기대 모양)이고, 프로세스 표본 10회에 `git` 이미지는 없었다. 로그 줄과 실제 생성은 따로 다룬다 | 사실 / 미확인 |
| 이 결과로 규칙 일반의 탐지 성능·스캔·보안 통과·대조 참조 자격을 말할 수 있는가 | **아니오.** 기록의 `not_established`에 `NOT_ESTABLISHED`로 남아 있다 | 사실 |

## 2. 실행 전 확인

| 확인 | 결과 (사실) |
| --- | --- |
| 로컬·원격·PR HEAD, 작업 트리 | 셋 모두 `fdc95b8657861d2b001120bca54bbc83e029058e`. `git ls-remote`로 원격 두 브랜치(`security/semgrep-lsp-scan-preflight`, 기반 `security/semgrep-lsp-scan-exec` = `348f7e1`)를 읽어 로컬 참조와 같음을 확인했다. PR #44·#43 모두 열려 있고 Draft이며 병합되지 않았다. 작업 트리 `git status --short` 출력 없음. 실행 직전에도 HEAD와 상태를 다시 읽어 같았다 |
| 이번 요청의 중복 흔적 | 없음. 마지막 이전 RunId는 `20261030T081256Z-d5a30afc`이고 그 뒤 새 RunId 폴더·`lsp-scan-*` 산출물·실행 시도 표지가 없었다. `bsi*` 계정 0, 접두 방화벽 규칙 0, 작업 루트(`%ProgramData%\bosang-semgrep-iso`) 없음, `semgrep*` 프로세스 0. 사전 점검 P09도 `PASS`였다. 이번 RunId는 사전 점검이 새로 만들었다 |
| 실행 권한 | 관리자 권한 세션(`elevated=True`). 이 세션의 PowerShell 도구는 PowerShell 7.6.9이고, 이 도구 프로세스의 실행 정책은 프로세스 범위에서 `Bypass`로 읽혔다(`Get-ExecutionPolicy -List`). 시스템(`LocalMachine`) 실행 정책은 `RemoteSigned` 그대로이며 바꾸지 않았다. 모든 스크립트는 `powershell.exe`(5.1)를 `-NoProfile -ExecutionPolicy RemoteSigned -File`로 불러 실행했다. 7의 `PSModulePath`가 5.1 자식에 새지 않도록 부르기 직전에 5.1 기본 모듈 경로로 맞췄다(관리자 쪽 호출 환경만 해당하며 Semgrep 자식의 환경·인자·한도는 그대로다) |
| 설치물 전체 해시 (직접 계산, .NET SHA-256) | `semgrep.exe` `960388bc…013`(108,456B), `pysemgrep.exe` `4061ec6d…89c`(108,455B), `semgrep-core.exe` `6790bb4a…116`(246,296,090B), 휠 `b403865e…fc6`(58,108,036B). 값은 PR #35 보고서(`semgrep-dist-verification-20261027.md`)와 지시서에서 가져온 전체 값이며 모두 크기까지 같았다. 진입점의 L03~L06도 같은 결과(보고서 교차 확인 R1·R2·R3 모두 `True`) |
| 프로브 규칙 | 233바이트, SHA-256 `d5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145`. 고정값과 같고 기대값을 파일에 맞춰 바꾸지 않았다 |
| 합성 대상 파일 | 135바이트, SHA-256 `097b6a5ddb0f1f822b91ccebad23fa448d1970222502e4f18447479d0cd741ba`. 고정값과 같다 |
| 이번 진입점 인자 | 선례(LSP-RULES-1)와 달리 `-ExpectedCoreSha256`(위 core 전체 해시)도 넘겼다. 기대값을 더 주는 쪽이며 검사를 약하게 하지 않는다. `-TsxCmd`는 이 작업 트리에 `node_modules`가 없어 같은 버전(4.23.12)의 `semgrep-lsp-rules-load-exec` 작업 트리 것을, node는 nvm 24.22.1을 썼다. 이 둘은 TS 재해석에만 쓰인다 |

## 3. 기준 저장 (저장소 밖)

적용 전에 `Save-IsolationBaseline.ps1 -Mode Save -TreeStats`로 48개 항목을 읽어 저장했다. 종료 0, `OK` 42 / 근거 있는 `NOT_PRESENT` 6 / `READ_FAILED` 0이다. 읽기 실패가 하나라도 있었다면 적용하지 않기로 했으나 없었다.

- 계정 5개, `Administrators`·`Users` 그룹 구성원, 프로필 폴더·프로필 목록 SID, 방화벽 규칙 이름 전체(692개, 접두 `bosang-semgrep-iso` 0개)
- 감사 원문 두 하위 범주(`{0CCE9226…}` 연결 차단, `{0CCE922B…}` 프로세스 생성): 둘 다 `No Auditing`
- ACL(SDDL·ACE·소유자): 가상환경 루트, 기반 Python 폴더, `semgrep.exe`, 두 `python.exe`, `semgrep-core.exe`. 설치물 해시·크기, 두 폴더의 파일 수·바이트
- 작업 루트 없음, 실행 중인 `semgrep*` 프로세스 0개

## 4. 절차와 결과

| 단계 | 결과 (사실) |
| --- | --- |
| 읽기 전용 사전 점검 | 종료 0. 적용 차단 항목 없음. P12 `NEEDS_GRANT`(권한 부여 두 건 필요)는 예상된 값이다. 스냅숏 확인값 `1e67f8a9ae6d` |
| 기준 저장 (`-Mode Save`) | 종료 0. 위 3절 |
| 적용 dry-run | 종료 0. 계획이 허용 범위와 같다(계정 1, 작업 폴더 1, ACE 2, 방화벽 규칙 1). 실제로는 아무것도 만들어지지 않았다(계정·규칙·작업 루트 0을 직접 확인) |
| 적용 (`-Apply -GrantReadExecute`, 두 경로) | 종료 0. 계정 생성(`Users` 그룹만, 비활성), 암호는 DPAPI 파일, 작업 폴더, ACE 두 건, 방화벽 규칙 생성·활성화 |
| 적용 직후 확인 (`-Mode Verify`) | 종료 0, `EQUAL`(같음 53 / 다름 0 / 확인 불가 0) |
| 적용 직후 직접 다시 읽기 | 아래 4.1절. 스크립트의 자기 보고에 기대지 않고 따로 읽었다 |
| 진입점 dry-run | 종료 0. T01·T03~T09, P01·P02, L01~L08·L10·L11, A01 모두 `PASS`(21개), 판정 `NOT_EXECUTED`. 표지·SCAN 산출물·프로세스 0, 계정은 계속 비활성 |
| 진입점 실행 (`-Execute -ConfirmRunId`, 1회) | **종료 60**(관측 성립하지 않음, 정리는 완료). 사전 조건 T02·L09까지 모두 `PASS`. 판정 `ABORTED:SERVER_REQUEST_NOT_ALLOWED`. 스크립트 시작~종료 약 22초(UTC 02:53:13~02:53:34) |
| 복구 dry-run → 복구 (`-Apply -RemoveProfile`) | 종료 0 / 종료 0. 규칙, ACE 두 건, 계정, 프로필, 작업 폴더, 빈 작업 루트, 암호 파일 모두 `OK`. 감사는 이미 원래 값(`ALREADY_RESTORED`) |
| 복구 뒤 비교 (`-Mode Compare`) | 종료 0, `EQUAL`(같음 48 / 다름 0 / 확인 불가 0) |

### 4.1 적용 직후 직접 확인한 내용

- 계정: 실행 전 `Enabled=False`, 설명에 RunId 표식, 소속 그룹은 `Users`뿐이고 `Administrators`가 아니다.
- **작업 폴더 ACL**: 상속이 끊겼고(`AreAccessRulesProtected=True`) 소유자는 `Administrators`다. 허용 주체는 `NT AUTHORITY\SYSTEM`(FullControl), `BUILTIN\Administrators`(FullControl), 전용 계정(`Modify, Synchronize`, 마스크 `0x1301bf`) 셋뿐이고 거부 ACE는 없다.
- 방화벽 규칙(`Name` = `bosang-semgrep-iso-20261103T024748Z-3e4360b8-out`, 표시 이름은 다르다): 사용함·`Outbound`·`Block`·프로필 `Any`. `LocalUser`는 `D:(A;;CC;;;<이 SID>)` 한 건이고 이 SID가 정확히 한 번 나온다(SID 뒤에 숫자가 더 붙은 오탐 없음). 원격 주소는 `0.0.0.0-126.255.255.255`, `128.0.0.0-255.255.255.255`, `::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff`이고 `127.0.0.1`을 포함하지 않는다. 프로그램·프로토콜·로컬/원격 포트·로컬 주소·서비스는 모두 `Any`다. 규칙 수는 692 → 693(우리 규칙 1개만 늘어남). 처음 `DisplayName`으로 조회해 규칙을 못 찾았고, `Name`으로 다시 읽어 확인했다(조회 방식의 실수였고 규칙 문제가 아니었다).
- 임시 ACE 두 건: 가상환경 루트와 기반 Python 폴더에 각각 `Allow`·`ReadAndExecute, Synchronize`(`0x1200a9`)·`ContainerInherit, ObjectInherit`·비상속 ACE가 **정확히 한 건씩** 있다.
- 감사 값은 실행 전 상태 그대로(`No Auditing` 두 범주)였다.
- 이 PC에서 새로 만든 격리 규칙의 생성 계약 대조(`Test-BlRunRuleContract`)는 `Verify`의 `vfy:run-rule`과 진입점 T04가 같은 규칙 1개를 `PASS`로 판정했다.
- 이 직접 확인은 대화 중에 읽은 값이며 별도 파일로 저장하지 않았다(복구 뒤 확인은 파일로 저장했다. 7절).

## 5. 관측 사실

### 5.1 실행한 것

| 항목 | 값 (사실) |
| --- | --- |
| 실행 파일 | `%LOCALAPPDATA%\bosang-radar\semgrep-dist\1.180.0\venv\Scripts\semgrep.exe` (108,456바이트). 실행 전·후 해시 같음. 서명 여부는 따로 확인하지 않았다 |
| 인자 | `["lsp","--debug"]` |
| 환경 이름(값 제외) | 요청 기록의 `envNames`가 선례와 같은 11개(`PATH`, `SYSTEMROOT`, `TEMP`, `TMP`, `USERPROFILE`, `SEMGREP_APP_URL`, `SEMGREP_METRICS_URL`, `SEMGREP_VERSION_CHECK_URL`, `SEMGREP_LOG_FILE`, `SEMGREP_SETTINGS_FILE`, `SEMGREP_VERSION_CACHE_PATH`). 이름을 더하지 않았다 |
| 한도 | 전체 150,000ms, 장벽 60,000ms, `scanMs` 30,000ms, 감시(`settleMs`) 2,000ms, 종료 30,000ms, stdout 1,048,576바이트, stderr 262,144바이트, 표본 간격 40ms. 계약 값 그대로이며 자동 연장·유예·재시도는 없다 |
| 자식에게 준 `PATH`와 작업 폴더 | `PATH` = `C:\WINDOWS\System32;C:\WINDOWS`, 작업 폴더 = `<작업 폴더>\work\lsp-scan\lsp-state` (기록의 `child_env`) |
| 설치물 해시 (전·후 같음) | `semgrep.exe` `960388bc…013`, `semgrep-core.exe` `6790bb4a…116`, 가상환경 `python.exe` `3638cd6a…191`, 기반 `python.exe` `805fd296…886`(기록의 `artifact_hashes`와 관리자 쪽 `hashes.unchanged=true`) |
| 이번 진입점의 한계 | 진입점 dry-run의 `[PLAN]` 안내 문구(전용 계정으로 러너 실행 줄)가 `didOpen`·`scanMs`를 말하지 않고 RULES 때 문장 그대로다. 표시 문구의 문제이며, 실제로 복사된 러너·계약 파일(`lsp-scan-runner.ps1`, `LspScanContract.ps1`)과 송신 허용 목록(`initialize`·`initialized`·`didOpen`·`shutdown`·`exit`)은 코드와 결과 파일로 확인했다. 코드는 고치지 않았다 |

### 5.2 신원·결합·프로세스 체인·감독·표지

- 결합: 결과 상태 `ACCEPTED`, 실패 없음. 토큰·모드·요청 반향·시작 시각이 맞았다.
- 신원 교차 확인: 통과(실패 없음). 러너 = `powershell.exe` 5.1이고 소유 SID가 전용 계정, 자식의 부모 = 러너·소유 SID = 전용 계정·실행 파일 = 요청한 파일·명령줄 = 요청한 인자·시작 시각 = 자기 보고.
- **mode 교차 확인**: 통과. 기록의 `provenance`가 `real`이고 `ADMIN_MODE_MISMATCH`·`ADMIN_RUNNER_MODE_INVALID`·`ADMIN_CONTEXT_MALFORMED:mode` 사유가 없으며 관리자 쪽 `externalReasons`·`contextProblems`도 비어 있다.
- 프로세스 체인(관리자 쪽 CIM 표본, 모두 소유 SID가 전용 계정): 러너(`powershell.exe`) → `conhost.exe`, `semgrep.exe lsp --debug` → (`conhost.exe`, 가상환경 `python.exe` → 기반 `python.exe` → `osemgrep lsp --debug`). `pysemgrep.exe`와 `git`은 나타나지 않았다. 러너 쪽 표본 10회(실패 0)에서 본 이미지는 `conhost.exe`, `python.exe`, `semgrep.exe`, `semgrep-core.exe`뿐이고 허용되지 않은 이미지는 없었다(최대 자손 4).
- 감독: 감독자의 중단 요청 없음(`abortRequestedAtMs` 없음), 중단 파일 전달 없음. 중단은 러너의 실시간 감시기가 일으켰다.
- 실행 시도 표지: `lsp-scan-attempt.marker`(611바이트)를 UTC 02:53:18.247에 배타적으로 확보했다(`acquired=true`, `autoDelete=false`, `retryable=false`). 복구 뒤에도 그대로 있다. 이 RunId는 소모됐다.

### 5.3 송신 목록과 `initialize` 응답

| 순서 | 메시지 | 시각(관측 시작 기준) | stderr 누적(송신 시점) | stdout 누적(송신 시점) |
| --- | --- | --- | --- | --- |
| 1 | `initialize` | 136ms | 0B | 0B |
| 2 | `initialized` | 2,647ms | 5,936B | 643B |
| 3 | `textDocument/didOpen` | 3,598ms | 11,944B | 1,463B |

`shutdown`과 `exit`는 보내지 못했다(중단). `initialize` 응답: id `lsp-scan-init-1`, 판정 `VALID`, 지연 1,974ms, `serverInfo` = `Semgrep` `1.180.0`(핀 버전과 `MATCH`), capabilities SHA-256 `edbaada3346b3a866c0d425d25b6832475403115f1159a705fa2363b07179113`(LSP-RULES-1 때와 같은 값). `initialized`는 이 응답이 유효하고 버전이 맞은 뒤에만 보냈다. 장벽(stdout `rulesRefreshed` 1회 그리고 stderr 맨줄 `Scanned open documents` 1회) 도달은 2,685ms, `didOpen` 송신은 그로부터 913ms 뒤다. `didOpen`의 URI는 `file:///C:/ProgramData/bosang-semgrep-iso/<RunId>/work/lsp-scan/ws/lsp-scan-1-target.txt`, `languageId` `plaintext`, `version` 1, 본문 해시는 합성 파일 해시와 같다. 문서 변경·저장·닫기, 작업 영역 메시지, `semgrep/scanWorkspace`, `semgrep/refreshRules`, `debug/echo`는 보내지 않았다. 러너는 서버 요청에 응답하지 않았다.

### 5.4 16개 조건

| # | 조건 | 결과 | 사유 |
| --- | --- | --- | --- |
| 1 | `PRECONDITIONS_AND_HASHES` | PASS | |
| 2 | `INITIALIZE_VALID_AND_VERSION_MATCH` | PASS | |
| 3 | `INITIALIZED_SENT_ONCE_AFTER_VALID_INIT` | PASS | |
| 4 | `RULES_BARRIER_BEFORE_DID_OPEN` | PASS | |
| 5 | `DID_OPEN_ONCE_AFTER_BARRIER_EXACT_CONTENT` | PASS | |
| 6 | `SINGLE_FILE_SCAN_STARTED_ONCE` | PASS | |
| 7 | `ENGINE_LOG_BUNDLE_COMPLETE_IN_ORDER` | PASS | |
| 8 | `ONE_DIAGNOSTIC_NOTIFICATION` | PASS | |
| 9 | `DIAGNOSTIC_FIELDS_MATCH` | PASS | |
| 10 | `LOG_AND_NOTIFICATION_CONSISTENT` | PASS | |
| 11 | `NO_OTHER_NOTIFICATIONS_REQUESTS_OR_ERRORS` | **FAIL** | `SERVER_REQUEST_AFTER_DID_OPEN` |
| 12 | `BOTH_BUNDLES_WITHIN_SCAN_MS` | PASS | |
| 13 | `SETTLE_WATCH_FROM_LATER_BUNDLE` | **FAIL** | `SETTLE_WATCH_NOT_CONFIRMED`, `EXIT_DURING_SETTLE` |
| 14 | `FILES_UNCHANGED_AS_EXPECTED` | PASS | |
| 15 | `NO_NETWORK_FORBIDDEN_IMAGE_OR_EXTERNAL_COMMAND_VIOLATION` | PASS | |
| 16 | `SHUTDOWN_EXIT_SELF_EXIT_ZERO` | **FAIL** | `SHUTDOWN_EXIT_NOT_SENT`, `EXIT_CODE_NOT_ZERO`, `FORCE_KILLED` |

판정 사유 목록: `ABORT:A6`, `SERVER_REQUEST_AFTER_DID_OPEN_NOT_CAUGHT_LIVE`, `SHUTDOWN_EXIT_NOT_SENT`, `EXIT_CODE_NOT_ZERO`, `FORCE_KILLED`. 판정 우선순위상 실시간 중단(`ABORTED`)이 앞서므로 `PASS` 13개가 있어도 관측은 성립하지 않는다. 조건 7~10·12의 `PASS`는 강제 종료 뒤 마지막 회수 청크(5,323ms)까지 읽은 바이트를 기준으로 한 판정이다. 조건 13의 `FAIL`은 중단 때문에 감시 구간(5,323~7,323ms)이 시작되기 전에 프로세스가 끝나서다.

### 5.5 stdout 프레임과 진단

stdout 2,699바이트, 프레임 9개, EOF까지 읽음, 읽기 실패·한도 초과 없음.

| # | 시작 바이트 | 종류 | 내용 |
| --- | --- | --- | --- |
| 1 | 0 | 응답 | `initialize` 응답 |
| 2 | 643 | 서버 요청 | `window/workDoneProgress/create` (토큰 `6ec17aee…`) |
| 3 | 884 | 알림 | `$/progress` begin, `Semgrep: Refreshing Rules` |
| 4 | 1,133 | 알림 | `$/progress` end (같은 토큰) |
| 5 | 1,333 | 알림 | `semgrep/rulesRefreshed` |
| 6 | 1,463 | 서버 요청 | `window/workDoneProgress/create` (토큰 `8c424946…`) |
| 7 | 1,704 | 알림 | `$/progress` begin, `Semgrep Scan in Progress: Scanning Open Documents` |
| 8 | 1,977 | 알림 | `$/progress` end (같은 토큰) |
| 9 | 2,177 | 알림 | `textDocument/publishDiagnostics` (진단 1개) |

진단 알림(2,177~2,699바이트, 한 건):

| 필드 | 값 (사실) | 기대와 |
| --- | --- | --- |
| `uri` (원문) | `file:///c%3A/ProgramData/bosang-semgrep-iso/<RunId>/work/lsp-scan/ws/lsp-scan-1-target.txt` | 정규화 뒤 `MATCH`(`didOpen`의 `file:///C:/…`와 소문자 드라이브·`%3A` 인코딩만 다르다) |
| `code` | `rules-probe.lsp-rules-1-probe` | 허용 두 형태 중 접두가 있는 형태, 일치 |
| `source` | `Semgrep` | 일치 |
| `message` | `LSP-RULES-1 probe rule. It is loaded but is not expected to match any target.` | 일치(규칙 파일의 고정 문구다) |
| `severity` | 3 | 일치 |
| `range` | 시작 (줄 1, 열 8) – 끝 (줄 1, 열 53) | `EXACT` |
| 진단 개수·추가 필드 | 1개, 알려지지 않은 필드 없음(키: `code`, `message`, `range`, `severity`, `source`), `codeDescription` 없음 | 일치 |

서버가 보낸 요청은 2건이고 모두 `window/workDoneProgress/create`다. 진단 프레임은 1개, 오류 알림은 0개, 예상 밖 알림은 없다. 이 8개 프레임(진단 제외)의 구성은 LSP-RULES-1 관측(`semgrep-lsp-rules-load-observation-20261030.md` 5.4절)의 stdout 8프레임 구성(응답 1·생성 요청 2·`$/progress` 4·`rulesRefreshed` 1)과 같다.

### 5.6 엔진 로그 (stderr 원문 줄 번호)

stderr 18,413바이트, 416줄(기록 기준), EOF까지 읽음, 읽기 실패·한도 초과·잘린 꼬리 없음. 머리말 없는 기록 15개, 머리말 있는 기록 74개, 잘못된 머리말 0.

- 규칙 로딩: 195~196행 `loading local config from …\lsp-state\rules-probe\lsp-rules-1-probe.yaml` / `Done loading local config from` 같은 경로. 경로가 프로브 규칙 파일과 일치한다. 197행 `Got 0 errors while refreshing rules in language server`.
- 초기 열린 문서 스캔(`didOpen` 이전): 189행 `Refreshing rules` → 228행 `Rules refreshed` → 229행 `Scanning open documents` → 286행 `Scanned open documents`. 268행 `[WARNING]: No targets to scan! Not scanning anything.`(1건, 열린 문서가 없을 때의 정상 경고)
- 단일 파일 스캔(`didOpen` 이후, 288행부터): 300행 `Scanning single file`, 301행 `Scanned single file`, 303행 `Scanning 1 targets`, 304행 `Running Semgrep with 1 rules`, 370행 `scan: found 1 matches, 0 errors (scanned 1 targets, skipped 0)`, 371행 `Found 1 matches before processing`, 374행 `Semgrep errors: ` (내용 없음), 375행 `Semgrep skipped 0 rules`, 376행 `Scanned 1 files`, 377행 `Found 1 matches`.
- 수치: 엔진에 넘긴 규칙 1개, 대상 1, 매치(처리 전) 1, 스캔한 파일 1, 매치 1, 건너뜀 0, 오류 문자열 빈 값, `ERROR` 머리말 줄 0, 오류 알림 0.
- 금지 신호: 다운로드·레지스트리·로그인·`semgrep.dev`·`https?://`·작업 영역 스캔·`Rules not loaded yet`·`No rules` 줄은 0건이다. 토큰 관련 줄은 `CI disabled, not checking API token`, `Checking for API token in environment variables`, `No API token found in environment variables`(환경 변수 확인만)이다.
- 종료 줄: `Producing exit code`는 없다(강제 종료).
- 진행 토큰 생성 줄은 stderr 전체에서 2건이다: 152행(바이트 6,092, `Refreshing Rules`)과 231행(바이트 10,102, `Scanning Open Documents`). `didOpen` 이후 구간(288행~)에는 없다.
- 기록의 `unclassified_info` = 7(판정 신호로 분류되지 않은 `INFO` 줄). 구성은 줄 단위로 대조하지 않았다.

### 5.7 중단 경위: 규칙 A6

**사실**

1. 러너의 실시간 감시기는 유효한 `window/workDoneProgress/create` 서버 요청이 **러너가 `didOpen`을 보낸 뒤에 읽히면** A6(`REQUEST_AFTER_DID_OPEN`)로 중단한다(`lsp-scan-watch.ts` 125~130행). 사후 분류도 "프레임의 첫 바이트가 `didOpen` 송신 때의 stdout 읽기 위치 이후인가"로 정한다(`lsp-scan-record.ts` 382~385행). 둘 다 서버가 쓴 시각이 아니라 러너가 읽은 위치·시각을 기준으로 한다.
2. 중단을 일으킨 요청은 stdout 프레임 6(시작 바이트 1,463)이다. `didOpen` 송신 때 러너가 읽은 stdout은 정확히 1,463바이트였다.
3. 프레임 6~8은 4,253ms 청크(바이트 1,463~2,177)에서 처음 읽혔다. 직전 stdout 청크는 2,685ms(바이트 643~1,463)였고, `didOpen`은 3,598ms에 나갔다. 청크 시각은 러너가 읽은 시각이며 서버가 쓴 시각이 아니다.
4. 프레임 6의 토큰 `8c424946-4c0e-4903-8d08-80c1c4ebdc8b`는 stderr 231행의 `Creating progress token 8c424946-… (Semgrep Scan in Progress: Scanning Open Documents)`와 같다. 231행은 시작 바이트 10,102로 `didOpen` 송신 때의 stderr 읽기 위치(11,944)보다 앞이고, 단일 파일 스캔 시작 줄(300행, 바이트 12,442)보다도 앞이며, 초기 열린 문서 스캔(229행 `Scanning open documents`) 바로 뒤에 있다. 프레임 2의 토큰도 152행의 새로고침 토큰과 같다.
5. 중단 감지는 4,281ms, 첫 강제 종료 시도는 5,160ms, 종료 관측은 5,314ms다. 진단 프레임(바이트 2,177~2,699)과 로그 꼬리(바이트 16,614~18,413)는 종료 뒤 마지막 회수 청크(5,323ms)에서 읽혔다.

**도출** (이 해석으로 판정을 바꾸지 않았다)

- 4번과 5.5절의 프레임 구성 비교(didOpen이 없던 LSP-RULES-1에도 같은 생성 요청 2건이 있었다)로 보면, 프레임 6은 `didOpen`에 대한 서버의 반응이 아니라 `didOpen` 이전의 초기 열린 문서 스캔에 속한 요청이 러너에 늦게 읽힌 것으로 읽힌다. `didOpen` 이후 구간에는 새 진행 토큰 생성이 없다는 점도 이 읽기와 맞고, 계약 6.2절의 "단일 파일 스캔 경로에는 새 요청이 없다"는 소스 도출과도 어긋나지 않는다.
- 같은 이유로 A6 중단은 서버의 허용 밖 동작을 잡은 것이라기보다 "읽은 시점"을 "쓴 시점"으로 본 분류에서 나온 것일 수 있다.

**미확인**

- 서버가 프레임 6을 stdout에 쓴 시각. 저장된 증거에는 읽기 위치와 읽은 시각만 있어서 `didOpen` 송신 전이었는지 확정하지 못했다.
- 중단 감지(4,281ms)와 첫 강제 종료 시도(5,160ms) 사이 약 0.9초의 원인.
- 중단이 없었다면 같은 입력에서 `shutdown`·`exit`·감시 구간이 계약대로 끝났을지.

### 5.8 외부 명령 시도(`git`): 로그 줄과 실제 프로세스를 따로 적는다

| 구분 | 값 |
| --- | --- |
| 시도 로그 줄 | 2건, 모양 `"git" "-C" "<작업 영역>" "rev-parse" "--show-toplevel"`로 기대와 같다. 230행(초기 열린 문서 스캔, `didOpen` 이전)과 302행(단일 파일 스캔, `didOpen` 이후) |
| 허용 이미지 | `git`을 더하지 않았다. 표본에 `git` 이미지가 없어 `UNEXPECTED_IMAGE`는 발생하지 않았다 |
| 실제 프로세스 생성 | **미확인**. 러너 쪽 표본 10회와 관리자 쪽 CIM 표본에 `git`이 없었다(`NOT_ESTABLISHED_NO_GIT_IMAGE_SAMPLED`). 표본 사이에 끝난 프로세스는 보이지 않는다 |
| 자식 `PATH` | `C:\WINDOWS\System32;C:\WINDOWS`. `git` 폴더가 없어 이름만으로는 찾기 어려울 것이라는 것은 도출이며, 실행이 성공했는지 실패했는지는 확인하지 못했다 |

### 5.9 종료

중단은 러너의 실시간 감시기가 일으켰고(`trigger=LIVE_ABORT`), stdin을 하니스가 닫지 않았으며(`stdin_closed_by_harness=false`), 강제 종료는 1회(`kill_count=1`, 확인됨)다. 종료 관측 5,314ms, 종료 코드·신호 없음. 자손은 5개를 보았고 남은 자손은 0이다(`descendant_tracking=ROOT_GONE`). 관측 시간은 5,160ms, 정리는 1,231ms이고, 관측 시간은 한도(150,000ms)의 약 3%다. `shutdown`에 대한 stdout 응답은 `shutdown`을 보내지 않아 없었다.

### 5.10 프로브·합성 파일·감시 폴더

| 항목 | 값 (사실) |
| --- | --- |
| 프로브 해시 | 원본 / 복사 직후 / 실행 뒤 모두 `d5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145`(233바이트). 실행 뒤 값은 관리자가 규칙 폴더의 파일을 직접 다시 읽어 잰 값과 합쳤다 |
| 합성 파일 해시 | 원본 / 쓴 직후 / 실행 뒤 모두 `097b6a5ddb0f1f822b91ccebad23fa448d1970222502e4f18447479d0cd741ba`(135바이트). 복구 직전 작업 폴더 목록 읽기에서도 같았다 |
| `WORKSPACE` | 파일 1 → 1 (합성 파일만, 추가·삭제 없음) |
| `RULES_DIR` | 파일 1 → 1 (프로브 1개만) |
| `HOME_DIR` | 파일 0 → 0. LSP-RULES-1에서는 `shutdown` 시점에 `.semgrep/cache/…/ws.txt`가 생겼으나 이번에는 생기지 않았다(도출: 정상 종료 경로를 타지 못했다) |
| 설치물 | `semgrep.exe` 등 4개 해시 전·후 같음 |

감시 폴더 밖의 파일 시스템은 관측하지 않았다. 실행 중 전용 계정의 Windows 프로필 폴더(`C:\Users\bsi3e4360b8`)가 만들어졌고(복구 전 존재 확인) 복구에서 지워졌다.

### 5.11 네트워크 관측

| 항목 | 값 (사실) |
| --- | --- |
| 루프백 수신기 | `127.0.0.1`의 임의 포트, 기준 0 → 최종 0, 표본 53회, 읽기 실패 0 |
| 귀속된 5157 | 0건 |
| **식별 불가 5157** | **9건** |
| 5157 수집 | 성공(`collection.ok=True`), 감사 실패 기록 켜짐, 로그 순환으로 밀림 없음(`wrapped=False`), 사용 불가 사유 없음 |

식별 불가 9건의 원문 필드: 모두 방향 `Inbound`, 프로토콜 17(UDP)이다. 목적 포트 138이 3건(PID 4), 1900이 6건(PID 14584)이며, 판정기가 적은 사유는 "PID가 이번 실행의 프로세스가 아니다"이다. 이번 실행의 프로세스 표본에 없는 PID라는 것까지가 사실이다. 이 포트들이 통상 NetBIOS 데이터그램과 SSDP 탐색에 쓰이는 포트라는 점에서 이 컴퓨터 쪽의 주변 수신 트래픽일 수 있다는 것은 도출이고, 그 PID가 무엇이었는지는 확인하지 않았다(**미확인**). 감사 창이 컴퓨터 전체를 보기 때문에 이번 실행과 무관한 이벤트도 섞인다. 판정기는 이 9건을 조건 15의 위반으로 세지 않았다. 루프백·5157이 0이거나 식별 불가가 있다는 사실은 외부 통신의 부재나 존재의 증거가 아니다. DNS·UDP·ICMP·IPv6·서비스가 대신 수행하는 통신은 관측하지 않았고, 표본 사이에 끝난 프로세스의 5157은 식별 불가로 남을 수 있다.

### 5.12 TS 재해석과 정리 세 갈래

- TS 재해석: 상태 `RUN`, 종료 0, 출력 `RECORD_WRITTEN verdict=ABORTED:SERVER_REQUEST_NOT_ALLOWED`. 기록 파일의 `outcomes.system_recovery`가 `NOT_OBSERVED`로 적힌 것은 재해석 도구에 복구 입력이 전달되지 않았다는 뜻(`lsp-scan-record.ts`의 `f.recovery === null` 분기)이며 복구 실패가 아니다.
- **관측**: `ABORTED`(성립하지 않음).
- **프로세스 정리**: 완료(`ok`). 수신기 종료 `DONE`, 전용 계정 프로세스 `NONE_LEFT`, 자손 정리 `ROOT_GONE`, 남은 자손 0.
- **시스템 복구**(실행 구간 안): 완료(`ok`). 전용 계정 비활성화 `DISABLED`(`enabledAfter=false`), 감사 값 복구 `restored`(원래 0 / 설정 2 / 현재 0). 이어서 6절의 복구와 비교로 한 번 더 확인했다.
- 이 셋은 서로의 결과를 바꾸지 않고 따로 기록한다. 표지(`attemptMarker`)도 이 셋과 따로이며 복구에 막히지 않았다.

## 6. 복구와 기준 비교

복구(`Remove-Isolation.ps1 -Apply -RemoveProfile`, 종료 0) 뒤 `Save-IsolationBaseline.ps1 -Mode Compare`와 따로 쓴 직접 대조로 실행 전 상태와 맞췄다.

| 항목 | 결과 (사실) |
| --- | --- |
| `Compare` | `EQUAL`, 같음 48 / 다름 0 / 확인 불가 0, 종료 0 |
| 직접 대조 (`run-20261103-scan-direct-compare.txt`) | 26개 항목 `SAME` 26 / `DIFF` 0. 로컬 계정 5개(이름·SID·사용 여부), `Administrators`·`Users` 구성원, 방화벽 규칙 이름 집합(692 = 기준), 감사 두 범주 원문 행(`No Auditing`), `ProfileList` SID 4개, `C:\Users` 목록, 여섯 경로의 SDDL(기준 문자열과 서수 비교로 같음), 임시 ACE 0건씩, 설치물 4개의 크기·SHA-256, `semgrep*`·`python*`·`git` 프로세스 0 |
| 계정·프로필 | `bsi*` 0개, `C:\Users\bsi3e4360b8` 없음 |
| 방화벽 | 규칙 692개(기준 692), 접두 `bosang-semgrep-iso` 0개 |
| 작업 폴더·작업 루트·암호 파일 | 모두 없음 |
| 표지 | `lsp-scan-attempt.marker` 보존됨(삭제하지 않았다) |

읽기 실패나 빈 값끼리의 일치는 같음으로 세지 않았다(양쪽이 읽혔고 값이 같을 때, 또는 근거 있는 `NOT_PRESENT`일 때만 같음). 복구가 불완전한 항목은 없다. 기준과 달라진 항목도 없었으므로 외부 프로그램의 영향으로 해석할 것이 없다. 마지막 재확인(UTC 02:59:33)에서도 같은 상태였다(`run-20261103-scan-direct-recheck.txt`).

## 7. 원본 증거와 해시 (저장소 밖, 커밋하지 않음)

원본에는 이 PC의 SID·경로가 들어 있어 저장소에 넣지 않았다. 아래 해시는 복구와 비교, 재확인을 모두 마친 뒤에 계산한 값이다(이후 이 폴더에 쓰지 않았다).

실행 기록 폴더 `%LOCALAPPDATA%\bosang-radar\semgrep-isolation\20261103T024748Z-3e4360b8\`:

| 파일 | 바이트 | SHA-256 |
| --- | --- | --- |
| `lsp-scan-observation-20261103T025313Z.json` | 58,764 | `1fc0518a550283b960bfd74d99616fd87ed4cc3ff8affcd995f00984864d24a7` |
| `lsp-scan-record-20261103T025313Z.json` | 16,525 | `407e4b4c885674598ec11910131897a5f846251f5cd25e0132aaae4e69b1d784` |
| `lsp-scan-admin-context-20261103T025313Z.json` | 2,716 | `1f70cf252b97de926c2e71dd0d6f12fe0d0b4b4c5a4c3ce61ed2109500e343d6` |
| `lsp-scan-runner-result-20261103T025313Z.json` | 45,171 | `46c83f3b0ac26b0cbd38ed17d31829802a7158ac9e64a177567c8d19a8ab04bc` |
| `lsp-scan-stdout-20261103T025313Z.bin` | 2,699 | `117c4bbac238049de2c26a63c192588693157503136033c42c380bc54cdfd42a` |
| `lsp-scan-stderr-20261103T025313Z.bin` | 18,413 | `f602d0c89abf6709bffd0f9c4ef985b925e84f01065efef3835e70d4d5bab34a` |
| `lsp-scan-attempt.marker` | 611 | `bfce1683c21ea8d571a3b250b11165827e56d77c30f964095d9d56d36f92a2a6` |
| `preflight.json` | 508,582 | `1e67f8a9ae6d980358f74d5add865d3fb7f632469e52fd53bce3bf4b0134fba9` |
| `resources.json` (복구 뒤) | 5,247 | `bb2829f45c234bdd221e743339ee7704aedcfc67f56f79459b947fac8ce23263` |
| `log.jsonl` (복구 뒤) | 27,975 | `129c86eecc8d9a9b1c0127aa51f91d7391a7cfc4742ae6ced587bdf7eef243a6` |
| `recovery-20261103T025454718.json` | 2,109 | `b0ebde630b9d3c8f7f53fadf3fd2bd97519ac579de982cfda1141e6712216c19` |
| `auditpol-backup.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `auditpol-before-025318329.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `auditpol-before-025318329.csv.after.csv` | 5,661 | `8c47e3882dd0b258b03791ef24256b5a99c25f0b394675c39bcecb624755b84c` |
| `auditpol-evidence-025331007.csv` | 5,661 | `8c47e3882dd0b258b03791ef24256b5a99c25f0b394675c39bcecb624755b84c` |
| `auditpol-restore-025332947.csv` | 5,661 | `8c47e3882dd0b258b03791ef24256b5a99c25f0b394675c39bcecb624755b84c` |
| `auditpol-restore-025332989.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `auditpol-restore-025400832.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `auditpol-restore-025428808.csv` | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |

기준·확인·원문 출력 폴더 `%LOCALAPPDATA%\bosang-radar\semgrep-isolation-baseline\`:

| 파일 | 바이트 | SHA-256 |
| --- | --- | --- |
| `run-20261103-scan-pre.json` (실행 전 기준) | 52,261 | `af3f5f8bf70b6013bf715668ea5718c3e3cc1b152d254e75b99e736788cb7cd8` |
| `verify-applied-20261103T024748Z-3e4360b8.json` | 94,376 | `4587b1ff3c2b8f20c6aa0dc07f4b78d73dc1a3ed5df7297eb7feff7f54bd6def` |
| `run-20261103-scan-post.json` (복구 뒤) | 91,770 | `9fb21d2666dae31c1e6a0f70a6b36fadc7ee29fc46c02a37246430faf25c0c03` |
| `run-20261103-scan-preflight-raw-output.txt` | 2,855 | `dea5d7182ab57c8d64e23d23c2ed4bc2621addefb744ecdeda44346fd0727db1` |
| `run-20261103-scan-baseline-save-raw-output.txt` | 168 | `914dfae75894049a128d03304ef1f6c06401f9b8c414d95d54ad663bc642e9c8` |
| `run-20261103-scan-apply-dryrun-raw-output.txt` | 1,536 | `5a4d1449f2ebd54a37ed98551a4bae912c03f2bfd3715b7a62e536f553adb374` |
| `run-20261103-scan-apply-raw-output.txt` | 2,045 | `05f2b564345ddfdeaea717068ae9acbb3d9de027c30267f0a7f9522724d6b279` |
| `run-20261103-scan-verify-raw-output.txt` | 305 | `574c40bd42e823948d77efe28772464ae3d37c51c8ffeae08a72c5972aa4642b` |
| `run-20261103-scan-entry-dryrun-raw-output.txt` | 5,584 | `3c03a6014ff9701e5d79e41391dea56d62bfe3fe0f3af40ae12a17b12567de95` |
| `run-20261103-scan-execute-raw-output.txt` | 6,664 | `925d51b44b7023d28dee2d7916ba1728770e203a4f90f3b7386593564ca43287` |
| `run-20261103-scan-workdir-listing-before-recovery.json` | 2,867 | `b17fbe3f0c7657ff8d59e83c857ac3cd4aac691314c30a8d62f7f03e0ad04a82` |
| `run-20261103-scan-recover-dryrun-raw-output.txt` | 2,613 | `0f060aa31404ab71a960257e6cbb489be5d00b246762e02f24ce1bc86b1dffda` |
| `run-20261103-scan-recover-apply-raw-output.txt` | 2,522 | `feba29cd8d426c59b028dfcc81578163ce4b14b4acd4d5cba2a06b0fc9f209cd` |
| `run-20261103-scan-compare-raw-output.txt` | 261 | `87d2a201f26665622305239f90a824ad0cb3650a785656ba2559553641bdfbfc` |
| `run-20261103-scan-direct-recheck.txt` | 712 | `122bbc3962b5f85467a3bcf28404eb1f42b017167d545341673e5715aaff3611` |
| `run-20261103-scan-direct-compare.txt` | 1,511 | `68ac1607adcf4b682ceeae1a4d488dc3c4dd218de4bf9e6f25db4e8dc026b454` |

`lsp-scan-stdout`·`lsp-scan-stderr`의 크기와 해시는 기록의 `streams` 값과 같다. 이 보고서에 적은 프레임·줄 번호·바이트 위치는 위 `.bin` 두 파일을 따로 디코딩해 읽은 값이다.

## 8. 이 결과가 말하지 않는 것 / 미확인

1. **이 관측은 성립하지 않았다.** 16개 조건 중 13개가 `PASS`라는 사실은 관측이 성립했다는 뜻이 아니다. 기록의 `established`는 비어 있다.
2. 진단 1건이 기대 필드와 일치한 것은 서버가 합성 파일 한 건에 이 규칙으로 반응했다는 **간접 신호**이며, 중단과 강제 종료 뒤에 읽은 바이트에 근거한다. 규칙 일반의 탐지 성능, 음성 대조, 대조 참조 자격, 실제 저장소 스캔, 보안 통과는 `NOT_ESTABLISHED`다.
3. 5.7절의 해석(프레임 6이 `didOpen`에 대한 반응이 아니라는 것)은 도출이다. 서버가 stdout에 쓴 시각은 알 수 없다.
4. 중단 감지에서 첫 강제 종료 시도까지의 약 0.9초 원인, 기록의 `unclassified_info` 7건의 구성은 확인하지 않았다.
5. `git`의 실제 프로세스 생성과 결과, 식별 불가 5157 9건의 출처 프로세스, 외부 통신 부재는 말할 수 없다.
6. 바이너리와 공개 소스의 대응은 미확인이다(수용한 한계). 로그 문구가 계약의 예측과 맞았다는 것이 대응의 증명은 아니다.
7. 2026-10-28 `--version` 시간 초과의 원인은 확정되지 않았다(수용한 한계).
8. 한 번의 관측이라 재현성을 확인하지 않았다. Windows 11 한 대, 전용 비관리자 계정 한 개, 합성 파일 한 개, 규칙 한 개만 다뤘다.
9. 정상 종료 경로(`shutdown`·`exit`·감시 구간)는 이번에 실행되지 않았다. 그 구간에서의 서버 동작과 홈 폴더 쓰기는 관측하지 못했다.

## 9. 이번 작업이 하지 않은 것

`--version`·LSP-MIN-1·LSP-RULES-1·`Test-IsolationEffect.ps1` 같은 다른 Semgrep 실행이나 추가 네트워크 프로브, 같은 관측의 재시도와 새 RunId로의 재시도, 중단 뒤 코드·파서·허용 목록·환경·한도 수정, 실행 시도 표지 삭제, 규칙 다운로드, 추가 대상·규칙, 실제 저장소 스캔, 음성 대조, 서버 요청에 대한 응답, 추가 문서·작업 영역 메시지, `git` 이미지 허용, 4688 감사 추가, 전체 시험·변이 점검·독립 감사의 반복, `pin.json`·`verified`·`policy_accepted`·ADR 상태 변경, 다른 PR·`main`·보담 저장소 변경, 병합·배포. 문서만 바뀌었으므로 시험을 다시 돌리지 않았다.

## 10. 소유자 결정이 필요한 것

이번 승인(RunId `20261103T024748Z-3e4360b8`)은 소진됐다. 아래 중 어느 것도 이 작업에서 정하거나 실행하지 않았다.

| # | 결정 |
| --- | --- |
| D1 | A6가 "읽은 시점"으로 `didOpen` 뒤 서버 요청을 판단하는 현재 분류를 유지할지. 바꾼다면 방향(예: 요청의 진행 토큰이 `didOpen` 이전 stderr의 생성 줄과 맞으면 사전 요청으로 분류)은 소유자가 정하며, 코드 변경은 별도 PR과 새 검토가 필요하다 |
| D2 | 새 RunId로 실제 관측을 다시 시도할지. 필요하면 새 승인, 새 기준 저장, 새 격리 적용이 따른다 |
| D3 | 이번 결과(진단 1건 일치 + 중단)를 계약 6.2절의 소스 도출("단일 파일 스캔 경로에는 새 요청이 없다")과 함께 어떻게 기록·인용할지. `pin.json`·`verified`·`policy_accepted`에는 반영하지 않았다 |
| D4 | 식별 불가 5157(이번에는 `Inbound` UDP 9건)을 조건 15에서 어떻게 다룰지. 현재 판정기는 위반으로 세지 않고 건수만 기록한다 |
| D5 | 진입점 dry-run `[PLAN]` 문구가 SCAN 단계(`didOpen`·`scanMs`)를 말하지 않는 표시 문제를 고칠지 |
| D6 | 재해석 기록의 `outcomes.system_recovery`가 복구 입력이 없으면 `NOT_OBSERVED`로 남는 점을 관리자 보고와 어떻게 합칠지 |
| D7 | 중단 감지에서 첫 강제 종료 시도까지 약 0.9초가 걸린 원인을 따로 조사할지 |
| D8 | PR #43·#44의 병합 여부(이번에도 병합하지 않았다) |
