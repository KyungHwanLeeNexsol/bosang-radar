# LSP-RULES-1 실제 1회 관측 보고서

- 실행일: 2026-10-30 (UTC 08:12~08:19)
- 기준: PR #41 HEAD `e52ef8385daa1e5e6012b714d4722189dffa9225` (로컬·원격·PR 모두 같음. 시작할 때와 실행을 마친 뒤 모두 작업 트리가 깨끗함)
- RunId: `20261030T081256Z-d5a30afc` (전용 계정 `bsid5a30afc`, SID 접미 `-1012`)
- 범위: 설치된 `semgrep.exe`를 `["lsp","--debug"]` 인자로 **딱 1회** 실행하고 `initialize → initialized(정확히 1회) → 장벽 → 2초 감시 → shutdown → exit`만 보냈다. 코드·테스트·계약, 환경, 인자, 한도, 수신기 동작, 감시 조건, 판정 규칙은 바꾸지 않았다. `--version`, LSP-MIN-1, 추가 네트워크 프로브는 실행하지 않았다. 규칙 다운로드, 대상 스캔, 음성 대조, 병합, 배포도 하지 않았다. `pin.json`, `verified`, `policy_accepted`, ADR 상태, 다른 PR, `main`, 보담 저장소는 그대로다.
- 구분 표기: **사실** = 이번 실행의 출력이나 읽은 파일의 내용, **도출** = 사실을 이어 붙인 판단, **미확인** = 이 실행으로 확인되지 않은 것.
- 수용한 한계(해결로 기록하지 않는다): 설치된 바이너리와 공개 소스의 대응은 확인되지 않았고, 2026-10-28 `--version` 시간 초과의 원인도 확정되지 않았다. 이번 관측은 이 두 한계를 안고 한 번 해 본 것이다.

## 1. 결론

| 질문 | 답 | 구분 |
| --- | --- | --- |
| 관측이 성립했는가 | 예. 판정 `RULES_LOAD_OBSERVED`, 기록 상태 `OBSERVED`, 13개 조건 모두 `PASS`, 실패 토큰 없음. 다만 이 판정은 **간접 신호들이 갖춰졌다**는 뜻이다(8절) | 사실 |
| 서버가 `initialize`에 답했는가 | 예. 응답 id `lsp-rules-init-1`, `VALID`, `serverInfo` = `Semgrep` `1.180.0`(핀 버전과 `MATCH`), 응답까지 1,892ms | 사실 |
| `initialized`를 몇 번 보냈는가 | 정확히 1회(관측 시작 2,470ms). 송신 목록은 `initialize`, `initialized`, `shutdown`, `exit` 넷뿐 | 사실 |
| 서버는 어떻게 끝났는가 | 스스로 종료(`SELF_EXIT`), 종료 코드 0. 하니스가 stdin을 닫지 않았고 강제 종료도 없었다(`kill_count` 0) | 사실 |
| 관측·프로세스 정리·시스템 복구 | 셋 다 완료(`ok`). 복구 뒤 실행 전 기준과 48개 항목이 모두 같다(다름 0, 확인 불가 0) | 사실 |
| 이 결과로 규칙 개수·프로브의 탐지 동작·스캔·보안 통과·대조 참조 자격을 말할 수 있는가 | **아니오.** 기록의 `not_established`에 `NOT_ESTABLISHED`·`NOT_OBSERVED`로 남아 있다 | 사실 |
| 외부 통신이 없었다고 말할 수 있는가 | **아니오.** 루프백 0건·귀속된 5157 0건이지만 DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 않았다 | 사실 |
| 판정 조건이 다루지 않는 사실이 있었는가 | 있다. 서버가 작업 영역에서 외부 `git rev-parse --show-toplevel`을 실행하려 한 로그 줄이 1건 있다(5.6절) | 사실 |

## 2. 실행 전 확인

| 확인 | 결과 (사실) |
| --- | --- |
| 로컬·원격·PR HEAD, 작업 트리 | 셋 모두 `e52ef8385daa1e5e6012b714d4722189dffa9225`. `git fetch` 뒤 `origin/…`과의 앞뒤 차이 `0 0`, `git status --short` 출력 없음. PR #41은 열려 있고 Draft이며 base는 `security/semgrep-lsp-rules-load-plan` |
| 이번 관측의 중복 흔적 | 없음. 마지막 이전 RunId는 `20261029T060257Z-5386c62f`이고 그 뒤 새 RunId·`lsp-rules-*` 결과 파일 없음, `bsi*` 계정 0, 접두 방화벽 규칙 0, 작업 루트(`%ProgramData%\bosang-semgrep-iso`) 없음, `semgrep*` 프로세스 0. 이번 RunId는 사전 점검이 새로 만들었다. 실행 직전에도 이 RunId의 관측 결과·원문 출력 파일이 없음을 코드로 확인했다 |
| 실행 권한 | 관리자 권한 세션(`elevated=True`) |
| 설치물 전체 해시 (직접 계산, .NET SHA-256) | 휠 `b403865e…fc6`, `semgrep.exe` `960388bc…013`, `semgrep-core.exe` `6790bb4a…116`, `pysemgrep.exe` `4061ec6d…89c`. PR #35 보고서(`semgrep-dist-verification-20261027.md`)의 전체 값과 모두 같고 크기도 같다. 진입점의 L03~L06도 같은 결과다 |
| 프로브 규칙 | 233바이트, SHA-256 `d5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145`. 지시서와 계약의 고정값과 같다. 기대값은 현재 파일에 맞춰 바꾸지 않았다 |
| 실행 환경 | 이 세션의 PowerShell 도구는 PowerShell 7.6.9다. 모든 스크립트는 `powershell.exe`(5.1)를 `-NoProfile -ExecutionPolicy RemoteSigned -File`로 불러 실행했다. 7의 `PSModulePath`가 5.1 자식에 새지 않도록 부르기 직전에 5.1 기본 모듈 경로로 맞췄다(관리자 쪽 호출 환경만 해당하며, Semgrep 자식의 환경과 스크립트·인자·한도는 그대로다). `-ExpectedCoreSha256`은 LSP-MIN-1 때와 같이 넘기지 않았다(core 해시는 L05·L06과 위의 직접 계산으로 확인) |

## 3. 기준 저장 (저장소 밖)

적용 전에 `Save-IsolationBaseline.ps1 -Mode Save -TreeStats`로 48개 항목을 읽어 저장했다. 종료 0, `OK` 42 / 근거 있는 `NOT_PRESENT` 6 / `READ_FAILED` 0이다. 읽기 실패가 하나라도 있었다면 적용하지 않기로 했으나 없었다.

- 계정 5개, `Administrators`·`Users` 그룹 구성원, 프로필 폴더·프로필 목록 SID, 방화벽 규칙 이름 전체(691개, 접두 `bosang-semgrep-iso` 0개)
- 감사 원문 두 하위 범주(`{0CCE9226…}` 연결 차단, `{0CCE922B…}` 프로세스 생성): 둘 다 `No Auditing`
- ACL(SDDL·ACE·소유자): 가상환경 루트, 기반 Python 폴더, `semgrep.exe`, 두 `python.exe`, `semgrep-core.exe`. 설치물 해시·크기, 두 폴더의 파일 수·바이트
- 작업 루트 없음, 실행 중인 `semgrep*` 프로세스 0개

## 4. 절차와 결과

| 단계 | 결과 (사실) |
| --- | --- |
| 읽기 전용 사전 점검 | 종료 0. 적용 차단 항목 없음. P12 `NEEDS_GRANT`(권한 부여 두 건 필요)는 예상된 값이다. 스냅숏 확인값 `ede358868505` |
| 기준 저장 (`-Mode Save`) | 종료 0. 위 3절 |
| 적용 dry-run | 종료 0. 계획이 허용 범위와 같다(계정 1, 작업 폴더 1, ACE 2, 방화벽 규칙 1). 실제로는 아무것도 만들어지지 않았다(계정·규칙·작업 폴더 0) |
| 적용 (`-Apply -GrantReadExecute`, 두 경로) | 종료 0. 계정 생성(`Users` 그룹만, 비활성), 암호는 DPAPI 파일, 작업 폴더, ACE 두 건, 방화벽 규칙 생성·활성화 |
| 적용 직후 확인 (`-Mode Verify`) | 종료 0, `EQUAL`(같음 53 / 다름 0 / 확인 불가 0) |
| 적용 직후 직접 다시 읽기 | 아래 4.1절. 스크립트의 자기 보고에 기대지 않고 따로 읽었다 |
| 진입점 dry-run | 종료 0. T01·T03~T09, P01, L01~L08·L10·L11, A01 모두 `PASS`, 판정 `NOT_EXECUTED`. 남은 프로세스·결과 파일 없음 |
| 진입점 실행 (`-Execute`, 1회) | 종료 0. 사전 조건 T02·L09까지 모두 `PASS`. 판정 `RULES_LOAD_OBSERVED`. 관측 4.9초, 스크립트 시작~종료 약 12.9초 |
| 복구 dry-run → 복구 (`-Apply -RemoveProfile`) | 종료 0 / 종료 0. 규칙, ACE 두 건, 계정, 프로필, 작업 폴더, 빈 작업 루트, 암호 파일 모두 `OK`. 감사는 이미 원래 값(`ALREADY_RESTORED`) |
| 복구 뒤 비교 (`-Mode Compare`) | 종료 0, `EQUAL`(같음 48 / 다름 0 / 확인 불가 0) |

`Test-IsolationEffect.ps1`(안내 문구가 다음 단계로 권하는 효과 관측)은 추가 네트워크 프로브라서 이번 허용 범위 밖이므로 실행하지 않았다.

### 4.1 적용 직후 직접 확인한 내용

- 계정: SID가 기록과 같고, 실행 전 `Enabled=False`, 설명에 RunId 표식, 소속 그룹은 `Users`뿐이며 `Administrators`가 아니다.
- **작업 폴더 ACL**: 상속이 끊겼고(`AreAccessRulesProtected=True`), 소유자는 `Administrators`다. 허용 주체는 `NT AUTHORITY\SYSTEM`(FullControl), `BUILTIN\Administrators`(FullControl), 전용 계정(`Modify, Synchronize`, 마스크 `0x1301bf`) 셋뿐이고 거부 ACE는 없다. SDDL: `O:BAG:S-1-5-21-…-513D:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1301bf;;;S-1-5-21-…-1012)`.
- 방화벽 규칙(이름 `bosang-semgrep-iso-20261030T081256Z-d5a30afc-out`): 사용함·`Outbound`·`Block`·프로필 `Any`. `LocalUser`는 `D:(A;;CC;;;<이 SID>)` 한 건이다. 원격 주소는 `0.0.0.0-126.255.255.255`, `128.0.0.0-255.255.255.255`, `::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff`이고 `127.0.0.1`은 들어가지 않는다(주소 계산으로 확인). 프로그램·프로토콜·로컬/원격 포트·로컬 주소는 모두 `Any`다. 규칙 수는 691 → 692(우리 규칙 1개만 늘어남).
- 임시 ACE 두 건: 가상환경 루트와 기반 Python 폴더에 각각 전용 SID의 `Allow`·`ReadAndExecute, Synchronize`(`0x1200a9`)·`ContainerInherit, ObjectInherit` ACE가 **정확히 한 건씩** 있다.
- 감사 값은 실행 전 상태 그대로(`No Auditing` 두 범주)였다.
- 이 PC에서 새로 만든 격리 규칙을 실제로 읽어 방화벽 규칙 생성 계약 대조(`Test-BlRunRuleContract`)에 넣어 본 것은 이번이 처음이다. `Verify`의 `vfy:run-rule`과 진입점 T04가 이 규칙 1개를 `PASS`로 판정했다(정상 규칙의 거짓 거절은 없었다). 결함이 있는 규칙을 실제로 거절하는지는 실제 규칙으로 시험하지 않았다(모의 시험으로만 확인했다).

## 5. 관측 사실

### 5.1 실행한 것

| 항목 | 값 (사실) |
| --- | --- |
| 실행 파일 | `%LOCALAPPDATA%\bosang-radar\semgrep-dist\1.180.0\venv\Scripts\semgrep.exe` (108,456바이트, SHA-256 `960388bc3dc6a6c38f84ffac1c38df434ff5d0a02c9c277ee214d88de9cb4013`). 실행 전·후 해시 같음. 서명 여부는 이번에 따로 확인하지 않았다(지시서와 이전 보고서는 서명되지 않은 파일로 다룬다) |
| 인자 | `["lsp","--debug"]` |
| 환경 이름(값 제외) | `PATH`, `SYSTEMROOT`, `TEMP`, `TMP`, `USERPROFILE`, `SEMGREP_APP_URL`, `SEMGREP_METRICS_URL`, `SEMGREP_VERSION_CHECK_URL`, `SEMGREP_LOG_FILE`, `SEMGREP_SETTINGS_FILE`, `SEMGREP_VERSION_CACHE_PATH` (11개. 이름을 더하지 않았다. 세 URL 변수는 루프백 수신기 주소 `http://127.0.0.1:11307`) |
| 한도 | 전체 150,000ms, 장벽 60,000ms, 장벽 뒤 2,000ms, 종료 30,000ms, stdout 1,048,576바이트, stderr 262,144바이트, 표본 간격 40ms. 계약 값 그대로다 |
| 설치물 해시 (전·후 같음) | `semgrep-core.exe` `6790bb4a902c99a15a3356c082a66dee9edda80a2994f1964ab82ebacdfed116`, 가상환경 `python.exe` `3638cd6a…a191`, 기반 `python.exe` `805fd296…6886`, 휠 `b403865e64f5ba0691630adf9bc13592cc38830726d4a114960d7e2d3fb21fc6` |
| 배포 보고서 교차 확인 | R1(`semgrep.exe`), R2(`semgrep-core.exe`), R3(휠 `win_amd64` 행) 모두 일치 |

### 5.2 신원·결합·프로세스 체인·감독

- 결합: 결과 상태 `ACCEPTED`, 실패 없음. 토큰(`lsp-<RunId>-<난수 32자리>`)·모드·요청 반향·시작 시각이 맞았다.
- 신원 교차 확인: 통과(실패 없음). 러너 = `powershell.exe` 5.1이고 소유 SID가 전용 계정, 자식의 부모 = 러너·소유 SID = 전용 계정·실행 파일 = 요청한 파일·명령줄 = 요청한 인자·시작 시각 = 자기 보고.
- 프로세스 체인(관리자 쪽 CIM 표본, 모두 소유 SID가 전용 계정): 러너(`powershell.exe`) → `conhost.exe`, `semgrep.exe lsp --debug` → (`conhost.exe`, 가상환경 `python.exe` → 기반 `python.exe` → `semgrep-core.exe`, 명령줄 `osemgrep lsp --debug`). `pysemgrep.exe`는 나타나지 않았다. 허용되지 않은 이미지는 없었다(`disallowed` 없음, 최대 자손 4).
- 감독: 중단 요청 없음, 강제 종료 `False`, 중단 파일 전달 없음, 마감 도달 `False`, 루프 35회, CIM 실패 0, 감독 종료 시각 7,131ms.

### 5.3 송신 목록과 `initialize` 응답

| 순서 | 메시지 | 시각(관측 시작 기준) | stderr 누적(송신 시점) | stdout 누적(송신 시점) |
| --- | --- | --- | --- | --- |
| 1 | `initialize` | 126ms | 0B | 0B |
| 2 | `initialized` | 2,470ms | 5,891B | 644B |
| 3 | `shutdown` | 4,874ms | 11,908B | 2,178B |
| 4 | `exit` | 4,876ms | 11,908B | 2,178B |

`initialize` 응답: id `lsp-rules-init-1`, 판정 `VALID`, 지연 1,892ms, `serverInfo` = `Semgrep` `1.180.0`, 핀 버전과 `MATCH`, capabilities SHA-256 `edbaada3346b3a866c0d425d25b6832475403115f1159a705fa2363b07179113`. `initialized`는 이 응답이 유효하고 버전이 맞은 뒤에만 보냈다. 문서 알림, 작업 영역 변경, `semgrep/scanWorkspace`, `semgrep/refreshRules`, `debug/echo`는 보내지 않았다.

### 5.4 원시 출력

| 스트림 | 크기 | SHA-256 | 상태 |
| --- | --- | --- | --- |
| stdout | 2,178B | `b355aa8770915451c35684b9c04672068f74cf81266eec4ea8619f439131442e` | 프레임 8개. EOF까지 읽음, 읽기 실패·한도 초과 없음 |
| stderr | 12,305B | `5ed39d51d068dbc0e574cbc64841bb1051ecfaa6ce68221874bf80f9a9725dee` | 291줄(기록 기준). EOF까지 읽음, 읽기 실패·한도 초과·잘린 꼬리 없음 |

stdout 프레임 8개: `initialize` 응답 1, 서버가 보낸 `window/workDoneProgress/create` 요청 2(응답하지 않음), `$/progress` 알림 4(`Refreshing Rules` 시작·끝, `Scanning Open Documents` 시작·끝), `semgrep/rulesRefreshed` 알림 1. 진단(`publishDiagnostics`) 0, 오류 알림 0. `shutdown`에 대한 stdout 응답은 없었다(`shutdown_response_seen=false`, 원인은 확인하지 않았다).

### 5.5 규칙 로딩 신호 (stderr 원문 줄 번호)

- 규칙 로딩 시작·완료: 192~193줄 `loading local config from …\lsp-state\rules-probe\lsp-rules-1-probe.yaml` / `Done loading local config from` 같은 경로. 경로가 프로브 규칙 파일과 일치한다(`loading_paths_match_probe=true`). 로딩 쌍은 한 번뿐이다.
- 오류 수: 194줄 `Got 0 errors while refreshing rules in language server`(1회).
- 맨줄 4단계 순서: 186줄 `Refreshing rules` → 225줄 `Rules refreshed` → 226줄 `Scanning open documents` → 283줄 `Scanned open documents`. 각 한 번, 순서대로다.
- 대상 없음 신호: 265줄 `[WARNING]: No targets to scan! Not scanning anything.`(1회). `No rules` 신호는 0건이다.
- 종료: 291줄 `Producing exit code 0 (OK)`.
- 금지 신호: `download`·`registry`·`semgrep.dev`·`publishDiagnostics`·`scanWorkspace`·`login`은 0건이다. `http(s)://` 1건은 시작 배너의 도움말 링크(notion.so 문서 주소)이고, `metrics` 4건은 `"enabled": false` 설정 출력이다. 둘 다 통신 줄이 아니다. 토큰 관련 줄은 `Checking for API token in environment variables` / `No API token found in environment variables`(환경 변수 확인만)이다.
- 머리말 종류별 줄 수: `DEBUG` 42, `INFO` 19, `WARNING` 1.

### 5.6 판정 조건이 다루지 않는 사실

1. **외부 `git` 실행 시도.** 227줄(`Scanning open documents` 바로 다음) `[INFO]: Running external command: "git" "-C" "…\work\lsp-rules\ws" "rev-parse" "--show-toplevel"`. 서버가 빈 작업 영역의 루트를 찾으려 한 것으로 읽힌다(도출). 이어지는 출력·오류 줄은 없다. 관리자 쪽 CIM이 기록한 프로세스 7개와 러너 쪽 프로세스 표본 23회에는 `git` 프로세스가 없었다. 자식에게 `PATH` 환경 변수를 주었으나 값은 결과에 기록되지 않아(이름만 기록), `git`이 실제로 실행됐는지 실패했는지는 확인하지 못했다. 13개 판정 조건은 이 줄을 다루지 않는다(분류되지 않은 `INFO`). 네트워크 동작이나 저장소 변경은 관측되지 않았다. 계약 7.4절 N2의 "열린 문서 스캔 절차(대상 0개)"에 이 줄이 명시된 것은 아니므로, 범위 해석은 소유자가 확인한다.
2. **설정 파일.** 189~191, 197~199, 202~204줄: 서버가 `…\lsp-state\settings.yml`을 세 번 읽으려 했고 파일이 없어 기본 설정을 썼다(`does not exist or is not a regular file`). 읽기만 있었다.
3. **홈 폴더 쓰기.** 서버가 전용 홈 아래에 `.semgrep/cache/fingerprinted_ignored_findings/ws.txt`(0바이트) 한 개를 만들었다. 계약에서 예상한 `shutdown` 시점의 캐시 쓰기와 같다. 이 파일 말고는 감시 폴더에 변화가 없었다(5.8절).
4. **기록의 `unobserved` 목록은 정적이다.** 기록의 `coverage.unobserved`에는 이번 실행 뒤에도 `INFO_AND_WARNING_HEADER_SHAPE_OF_REAL_BINARY`가 남아 있다. 실제로는 이번 stderr에 `INFO` 19줄과 `WARNING` 1줄이 나타났고 판독기가 모두 처리했다(`malformed_headers` 0). 이 보고서는 기록의 목록과 판정 코드를 고치지 않는다.
5. 기록의 `unclassified_info` = 7(판정 신호로 분류되지 않은 `INFO` 줄. 위 1·2번에 해당하는 줄이 포함돼 있다고 읽히지만, 7건의 구성을 줄 단위로 대조하지는 않았다).

### 5.7 장벽·감시·종료

- 장벽 도달: 2,739ms(stdout `rulesRefreshed` 1회 **그리고** 맨줄 `Scanned open documents` 1회). 장벽 뒤 감시 종료: 4,774ms(장벽 뒤 2,035ms).
- 종료 경로: `shutdown` 4,874ms → `exit` 4,876ms → 종료 관측 4,907ms, 종료 코드 0, 신호 없음. 트리거 `NORMAL`, `SELF_EXIT`. 하니스의 stdin 닫기 없음, 강제 종료 0회.
- 시간: 관측 4,907ms, 정리 311ms. 한도(150,000ms)의 약 3%다.

### 5.8 프로브와 감시 폴더

| 항목 | 값 (사실) |
| --- | --- |
| 프로브 해시 | 원본 / 복사 직후 / 실행 뒤 모두 `d5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145`. 실행 뒤 값은 관리자가 규칙 폴더의 파일을 직접 다시 읽어 잰 값과 합쳤다(233바이트) |
| `WORKSPACE` | 파일 0 → 0 (변화 없음) |
| `RULES_DIR` | 파일 1 → 1 (프로브 1개만, 추가·삭제 없음) |
| `HOME_DIR` | 파일 0 → 1 (추가: `.semgrep/cache/fingerprinted_ignored_findings/ws.txt`) |
| 설치물 | `semgrep.exe` 등 4개 해시 전·후 같음 |

감시 폴더 밖의 파일 시스템은 관측하지 않았다. 실행하는 동안 전용 계정의 Windows 프로필 폴더(`C:\Users\bsid5a30afc`)가 만들어졌고(복구 전 존재 확인) 복구에서 지워졌다.

### 5.9 네트워크 관측

| 항목 | 값 (사실) |
| --- | --- |
| 루프백 수신기 | `127.0.0.1:11307`, 기준 0 → 최종 0, 표본 37회, 읽기 실패 0 |
| 귀속된 5157 | 0건 |
| 식별 불가 5157 | 0건 |
| 5157 수집 | 성공(`collection.ok=True`), 감사 실패 기록 켜짐(`auditFailureEnabled=True`), 로그 순환으로 밀림 없음(`wrapped=False`), 사용 불가 사유 없음 |

이 0건들은 외부 통신이 없었다는 증거가 아니다. DNS·UDP·ICMP·IPv6·서비스가 대신 수행하는 통신은 관측하지 않았고, 표본 사이에 끝난 프로세스의 5157은 식별 불가로 남을 수 있다.

### 5.10 TS 재해석과 정리

- TS 재해석: 상태 `RUN`, 종료 0, 출력 `RECORD_WRITTEN verdict=RULES_LOAD_OBSERVED`, 재해석 도구 소요 387ms. 도구 작업 개체 정리 `NOT_NEEDED`(활성 0). 13개 조건(전제·해시, 초기화·버전, `initialized` 1회, `rulesRefreshed` 1회, 맨줄 4개 순서, 프로브 로딩 쌍, 오류 0, 대상 없음·`No rules` 없음, 토큰·네트워크 줄 없음, 엔진·진단·추가 요청 없음, 파일 변화 예상대로, 루프백·OS 차단 없음, `shutdown`·`exit`·`SELF_EXIT` 0) 모두 `PASS`.
- 프로세스 정리: 수신기 종료 `DONE`, 전용 계정 프로세스 `NONE_LEFT`, 관리자 정리가 끝낸 프로세스 없음. 자손 정리 `ROOT_GONE`, 남은 자손 0.
- 시스템 복구(실행 구간 안): 전용 계정 비활성화 `DISABLED`(`enabledAfter=false`), 감사 값 복구 `RESTORED`(원래 0 / 설정 2 / 현재 0).
- 이 셋(관측·프로세스 정리·시스템 복구)은 서로의 결과를 바꾸지 않고 따로 기록한다.

## 6. 복구와 기준 비교

복구(`Remove-Isolation.ps1 -Apply -RemoveProfile`, 종료 0) 뒤 `Save-IsolationBaseline.ps1 -Mode Compare`와 별도 직접 조회로 실행 전 상태와 대조했다.

| 항목 | 복구 뒤 직접 조회 (사실) |
| --- | --- |
| `Compare` | `EQUAL`, 같음 48 / 다름 0 / 확인 불가 0, 종료 0 |
| 계정 | `bsi*` 0개, 로컬 계정 5개(기준과 같음) |
| 방화벽 | 규칙 691개(기준 691), 접두 `bosang-semgrep-iso` 0개 |
| 임시 ACE | 가상환경 루트 0건, 기반 Python 폴더 0건 |
| 프로필 | `C:\Users\bsid5a30afc` 없음, `ProfileList`의 SID 접미 `-1012` 0건 |
| 작업 폴더·작업 루트·암호 파일 | 모두 없음 |
| 감사 | 두 하위 범주 데이터 행 원문 모두 `No Auditing`(기준과 같음) |
| 프로세스 | `semgrep*` 0개 |

읽기 실패나 빈 값끼리의 일치는 같음으로 세지 않았다. 복구가 불완전한 항목은 없다.

## 7. 원본 증거와 해시 (저장소 밖, 커밋하지 않음)

실행 기록 폴더 `%LOCALAPPDATA%\bosang-radar\semgrep-isolation\20261030T081256Z-d5a30afc\`:

| 파일 | 바이트 | SHA-256 |
| --- | --- | --- |
| `lsp-rules-observation-20261030T081734Z.json` | 45,494 | `da697d081be3bb7e4ad486af87e21d10e5f06a74619a5bac4632e4bcec8609ce` |
| `lsp-rules-record-20261030T081734Z.json` | 9,667 | `f2954b960a0b616ced80e7d87454cc538075b3a1b5d21576ce614bd1d23975f8` |
| `lsp-rules-admin-context-20261030T081734Z.json` | 2,324 | `bbae0026b07ed7fb6540350c0fc07b577a96f90b772dccaa413813299347122b` |
| `lsp-rules-runner-result-20261030T081734Z.json` | 33,198 | `84d48cda3cac615ce6ec181e25f07bf956e70331b6526b5475b5c948c54f5412` |
| `lsp-rules-stdout-20261030T081734Z.bin` | 2,178 | `b355aa8770915451c35684b9c04672068f74cf81266eec4ea8619f439131442e` |
| `lsp-rules-stderr-20261030T081734Z.bin` | 12,305 | `5ed39d51d068dbc0e574cbc64841bb1051ecfaa6ce68221874bf80f9a9725dee` |
| `preflight.json` | 507,929 | `ede35886850561f923e6159fd79f71ac7aabfebeef8db3a9c7b3a3edc07bcd65` |
| `resources.json` (복구 뒤) | 5,247 | `90cd05f79399d957d86b3b22acb15ed7fa243be96fa9f81aa50cfbe530d56f05` |
| `recovery-20261030T081913583.json` | 2,109 | `756922045180ddb9d5cbf89f7f662d53bcb4457436606b38720217909fa07618` |
| `log.jsonl` (복구 뒤) | 26,090 | `e7132dfe728d9ef05b3a1cf546adeb477d9266a880c37257195e64e191ae2798` |

기준·확인·원문 출력 폴더 `%LOCALAPPDATA%\bosang-radar\semgrep-isolation-baseline\`:

| 파일 | 바이트 | SHA-256 |
| --- | --- | --- |
| `run-20261030-rules-pre.json` (실행 전 기준) | 52,221 | `3cd2bf9b4e75104dc970d4e95d8839b481b1be0ed8e9d4c485944dceefd1c8f5` |
| `verify-applied-20261030T081256Z-d5a30afc.json` | 94,337 | `51d75adf4d52b09f06412875ee47e02d8c1d3222e5cbae2ccea2396682baffaa` |
| `run-20261030-rules-post.json` (복구 뒤) | 91,731 | `8cc1bf66d55ef6d9636a1e24586defcdd3179226bf3e66e45a3a3fae9e7dcfae` |
| `run-20261030-rules-preflight-raw-output.txt` | 2,855 | `daa1ec26e61e4440bf48e3a97557d239b0bc90910292d7d8d5f4ff70130b909c` |
| `run-20261030-rules-baseline-save-raw-output.txt` | 169 | `a449e25e17fb2cad5883c67bdd722c2528b3d56b0bfd3cb58a6aba71d58a6636` |
| `run-20261030-rules-apply-dryrun-raw-output.txt` | 1,536 | `f0bd2443ae2d945af9bea956bdca0570d944fe54894e78056c3017415ed258c0` |
| `run-20261030-rules-apply-raw-output.txt` | 2,045 | `fcc57b1033f6e4ce8059de8d15b9b2af2cc20fa8537224699849edb6d8a5274d` |
| `run-20261030-rules-verify-raw-output.txt` | 305 | `bedee6d895f1041585b12da8e74a20ae444bb06d6a393f87cbb05afe267b2e83` |
| `run-20261030-rules-entry-dryrun-raw-output.txt` | 4,730 | `c3d9eca056522d8c3846c0eb5789592c7c509fbc8d2f96f269b2d0568d91aeff` |
| `run-20261030-rules-execute-raw-output.txt` | 5,756 | `0baceb4ee9925080c0de8e11c7534cfbeaa296294247bcf6594c100320167475` |
| `run-20261030-rules-recover-dryrun-raw-output.txt` | 2,523 | `77616afabdadc159536121b1c94fa688a23ff24879354c30193734cc4aebba33` |
| `run-20261030-rules-recover-apply-raw-output.txt` | 2,522 | `d34d47300b2a30a9e475215ff162a4c02ea7e5babb0d4e8cccf4fb43ba9d1673` |
| `run-20261030-rules-compare-raw-output.txt` | 262 | `a728f52562a8395e77bf6aea0aaf49e0520058e60b4e0fb4b7375a9de1a4d2dc` |

이 해시는 복구와 비교를 모두 마친 뒤에 계산한 값이다(이후 이 폴더에 쓰지 않았다). 원본에는 이 PC의 SID·경로가 들어 있어 저장소에 넣지 않았다.

## 8. 이 결과가 말하지 않는 것 / 미확인

1. **`RULES_LOAD_OBSERVED`의 뜻.** 간접 신호들(`initialized` 1회, `rulesRefreshed`와 맨줄 4단계, 프로브 파일 한 개의 로딩 쌍, `Got 0 errors`, `No targets`, 금지 신호 없음, 파일 변화 예상대로)이 갖춰졌다는 뜻이다. 기록의 `evidence_scope`는 `INDIRECT_SIGNALS_ONLY`다.
2. **로딩된 규칙의 정확한 개수**는 관측하지 않았다(`loaded_rule_count` `NOT_OBSERVED`).
3. **프로브 규칙의 의미와 탐지 동작**은 확인하지 않았다. 서버가 파일을 읽고 `0 errors`로 끝났다는 것은 규칙이 유효하게 해석됐다는 증명이 아니고, 대상이 0개라 탐지 여부는 시험되지 않았다.
4. **정상 LSP 동작, 스캔, 보안 통과, 대조 참조 자격, 핀 검증**은 모두 `NOT_ESTABLISHED`다.
5. **외부 통신 부재**는 말할 수 없다(5.9절).
6. **바이너리와 공개 소스의 대응**은 미확인이다(수용한 한계). 로그 문구가 계약의 예측과 맞았다는 것이 대응의 증명은 아니다.
7. **2026-10-28 `--version` 시간 초과의 원인**은 확정되지 않았다(수용한 한계). 이번 관측은 그것을 해결하지 않는다.
8. **표본 사이에 끝난 프로세스**(예: 5.6절 1번의 `git`), **엔진이 로그 없이 돈 경우**, **감시 폴더 밖의 파일 시스템**, **홈 외 상태 폴더의 내용**은 관측하지 않았다(기록의 `unobserved`).
9. 한 번의 관측이라 **재현성**을 확인하지 않았다. Windows 11 한 대, 전용 비관리자 계정 한 개만 다뤘다.
10. `shutdown`에 대한 stdout 응답이 없었던 이유, 기록의 `unclassified_info` 7건의 줄 단위 구성은 확인하지 않았다.

## 9. 이번 작업이 하지 않은 것

`--version`·LSP-MIN-1·`Test-IsolationEffect.ps1` 같은 다른 Semgrep 실행이나 추가 네트워크 프로브, 같은 관측의 재시도, 한도 확대·환경 변수 추가·유예, 파서·판정 기준·기대값 수정, 코드·테스트·계약 변경, 전체 시험과 변이 점검의 반복, 규칙 다운로드, 대상 스캔, 음성 대조, 병합·배포, `pin.json`·`verified`·`policy_accepted`·ADR 상태 변경, 다른 PR·`main`·보담 저장소 변경.

## 10. 소유자 결정이 필요한 것

| # | 결정 |
| --- | --- |
| D1 | 5.6절 1번의 외부 `git` 실행 시도를 계약의 허용 범위 안으로 볼지, 판정 조건으로 추가할지(이 PR은 판정 코드를 바꾸지 않았다) |
| D2 | 기록의 정적 `unobserved` 목록에서 `INFO_AND_WARNING_HEADER_SHAPE_OF_REAL_BINARY`를 언제·어떻게 갱신할지, `pin.json`의 `log_format`에 머리말 사실을 반영할지(이번에는 건드리지 않았다) |
| D3 | 이 관측을 기반으로 다음 단계(대조 참조 확보, 대상 스캔 등)를 계획할지. 이 결과는 그 근거로 쓰기에는 간접 신호뿐이다 |
| D4 | 기존 `.Contains($sid)` 방식의 약한 SID 대조가 남은 파일(`Test-LspMinObservation.ps1`, `Test-VersionObservation.ps1`, `IsolationFlows.ps1`)을 후속으로 고칠지 |
