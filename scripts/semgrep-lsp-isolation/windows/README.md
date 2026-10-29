# Windows 격리 준비 스크립트 (Semgrep LSP 다음 실행 전 단계)

실제 도구를 처음 실행하기 전에, 그 실행이 나가는 통신을 OS 수준에서 막고 그 사실을 관측할 수 있는 환경을 만드는 스크립트 묶음이다. **Windows(이 PC)에서 적용 → PowerShell 프로브 → 복구를 1회 실제로 실행했고, 확인된 범위는 TCP IPv4 두 목적지(`127.0.0.1`, `192.0.2.1:9`)뿐이다.** Semgrep·가상환경 Python·DNS·UDP·ICMP·IPv6의 격리는 아직 미확인이다. 이 관측은 그 범위 안에서 다음 단계를 판단할 때 사용할 수 있는 근거이며, 범위 밖으로 넓혀 읽지 않는다. 이어서 같은 격리 안에서 전용 비관리자 계정으로 설치된 `semgrep.exe --version`을 1회 실행했으나 종료 코드 1(`RuntimeError: Could not determine home directory.`)로 **버전 문자열을 얻지 못했다.** 이 실행은 서명되지 않은 배포물의 버전 명령을 실행하는 것까지만 허용받은 것이며, 배포물의 공개 소스 대응이나 신뢰 검증의 근거가 아니다. 그 뒤 실패 원인으로 해석한 홈 위치 환경 변수(`USERPROFILE`) 누락과, 수집이 불완전해도 버전을 사용 가능한 관측으로 확정할 수 있던 판정 결함을 코드로 보완했다. 재현·수정·시험은 [보완 보고서](../../../.moai/reports/semgrep-version-observer-hardening-20261028.md)에 있다. 보완한 코드로 같은 실행을 새 RunId로 별도 1회 다시 했으나(2026-10-28) 30초 한도까지 끝나지 않아 강제 종료됐고(`NOT_OBSERVED:TIMEOUT`, stdout·stderr 0바이트) **버전 문자열을 이번에도 얻지 못했다.** 상세는 [두 번째 관측 보고서](../../../.moai/reports/semgrep-version-observation-20261028.md)에 있다. 이어서 버전 관측 자식의 환경에만 온라인 최신 버전 조회를 끄는 고정값 `SEMGREP_ENABLE_VERSION_CHECK=0`을 더하고 새 RunId로 별도 1회 다시 실행했더니(2026-10-28) 종료 코드 0, 14.7초에 `1.180.0`이 관측됐다(`VERSION_OBSERVED_AS_EXPECTED`). 이것은 **조회를 끈 조건에서 한 번 관측한 결과**이며, 이전 시간 초과의 원인을 확정하지 않고 핀 검증·배포물 신뢰·전체 격리의 근거도 아니다. 상세는 [세 번째 관측 보고서](../../../.moai/reports/semgrep-version-observation-20261028-version-check-off.md)에 있다. 그 뒤 2026-10-29에 LSP 최소 관측(LSP-MIN-1)을 새 RunId로 실제 1회 실행해, 전용 계정이 설치된 `semgrep.exe lsp --debug`를 띄워 `initialize` 응답(`serverInfo` `Semgrep` `1.180.0`)을 받고 서버가 종료 코드 0으로 스스로 끝나는 것을 관측했다(`LSP_MIN_OBSERVED`). 이것은 **그 최소 기동 한 번의 관측**이며 정상 LSP 시작·규칙 로딩·스캔·보안 통과·대조 참조 자격이나 외부 통신 부재의 근거가 아니다. 상세는 [LSP 최소 관측 보고서](../../../.moai/reports/semgrep-lsp-min-observation-20261029.md)에 있다. 실행 결과와 한계는 [실행 보고서](../../../.moai/reports/semgrep-win-isolation-run-20261027.md)와 [버전 관측 보고서](../../../.moai/reports/semgrep-version-observation-20261027.md), 배경과 근거 구분은 [계획서](../../../.moai/reports/semgrep-win-isolation-plan-20261027.md)에 있다. 아래 "확인 수준"을 먼저 읽는다.

## 확인 수준

실제 Windows에서 확인한 것과 모의(합성) 시험으로 확인한 것을 구분한다. 모의 시험의 통과는 "가짜 시스템 위에서 흐름이 의도대로 동작한다"까지만 뜻한다.

| 구분                               | 한 일                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 결과                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **실제 Windows(이 PC)**            | 읽기 전용 사전 점검 실행(진짜 `auditpol /backup`·방화벽·계정·ACL 읽기)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 통과(적용 차단 항목 없음)                                                                                                                                                                                                                                                                                                                       |
| **실제 Windows(이 PC)**            | 변경 스크립트의 dry-run, 거부 경로(`-Apply` 없음, 틀린 스냅숏 해시), 실행 기록이 없을 때의 검증(50), 대상 없는 복구(30), 복구 dry-run, `-Discover`                                                                                                                                                                                                                                                                                                                                                                            | 기대한 종료 코드. 아무것도 바뀌지 않음                                                                                                                                                                                                                                                                                                          |
| **실제 Windows(이 PC)**            | 위 실행 전후의 방화벽 규칙(688개)·로컬 계정·감사 값·ACL 비교                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 동일                                                                                                                                                                                                                                                                                                                                            |
| **실제 Windows(이 PC)**            | 진짜 `Get-Acl`이 읽기에 실패할 때의 동작을 읽기 전용으로 관측(없는 경로, 접근 불가 레지스트리 키 `HKLM:\SAM\SAM`). 아무것도 바꾸지 않음                                                                                                                                                                                                                                                                                                                                                                                       | 없는 경로는 기본 설정에서 비종료 오류 + `$null`, `Stop`이면 예외. pwsh 7.6.9는 접근 불가 레지스트리 키에서 `Stop`이어도 **오류 없이 `$null`**. 관리자 셸이라 **파일·폴더 ACL의 접근 거부는 재현하지 못했다**                                                                                                                                    |
| 파일·메모리 점검                   | `Test-IsolationScripts.ps1`: 구문, BOM, 구조(변경 호출 위치), 신원 검증·이벤트 대조·판정·권한 계산의 합성 입력 시험                                                                                                                                                                                                                                                                                                                                                                                                           | pwsh 7.6.9와 Windows PowerShell 5.1에서 각각 191/191(버전 관측 파일의 역할별 구조 검사와 고정값 한정 검사 포함. 심은 위반 12개를 모두 잡음)                                                                                                                                                                                                     |
| **합성(모의 시스템)**              | `tests/Test-IsolationFlows.ps1`: 적용 → 검증 → 복구 진입 스크립트를 가짜 시스템 위에서 끝까지 실행(정상 대조군, 신원 불일치 12종, 이전 결과 파일, 감사·계정 정리 실패, 이벤트 0건, 복구의 ACL·작업 폴더 읽기 실패와 소유 불일치 거절 등)                                                                                                                                                                                                                                                                                      | 자식 엔진 5.1과 pwsh 각각 162/162                                                                                                                                                                                                                                                                                                               |
| **합성(모의 시스템)**              | 같은 시험을 수정 전 코드(`06825e1`)에 실행                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 50/69 — 지적된 문제가 그대로 재현된다(실패가 나오는 것이 정상)                                                                                                                                                                                                                                                                                  |
| **합성(모의 시스템)**              | 복구 쪽 새 시험 47건(`recover-acl`·`recover-keep`·`recover-owner`)을 수정 전 코드(`8ff316c`)에 실행                                                                                                                                                                                                                                                                                                                                                                                                                           | 23/47 — 복구가 첫 읽기 실패에서 중단되는 문제가 재현된다(정상 복구·dry-run·소유 불일치 거절은 수정 전에도 통과)                                                                                                                                                                                                                                 |
| **실제 Windows(이 PC)**            | 적용(`-Apply`) → 효과 관측(`-Execute`) 1회 → 복구(`-Apply -RemoveProfile`)를 처음으로 실제 실행(`-GrantReadExecute`·`-VenvPython`·`-IncludeSelfAddressProbe`·`-IncludeProcessCreationAudit` 미사용). 상세는 [실행 보고서](../../../.moai/reports/semgrep-win-isolation-run-20261027.md)                                                                                                                                                                                                                                       | 적용·검증·복구 종료 코드 0. 프로브 판정 `PROBE_ISOLATION_OBSERVED`(**TCP IPv4 두 목적지, 1회**). 5157 1건이 해당 규칙의 필터와 대조됨. 복구 뒤 실행 전 기록과 동일. 이 관측은 그 범위 안에서 다음 단계 판단에 사용할 수 있는 근거다                                                                                                             |
| **실제 Windows(이 PC)**            | 전용 비관리자 계정으로 설치된 `semgrep.exe`를 절대 경로·인자 `["--version"]` 하나로 1회 실행(`Test-VersionObservation.ps1 -Execute`, 같은 환경에서 무해한 스텁 점검을 먼저 1회). `-GrantReadExecute`로 가상환경 루트·기반 Python 폴더 두 곳에만 임시 읽기·실행 권한을 줬다가 되돌렸다. 홈 위치 환경 변수는 주지 않았다. 상세는 [버전 관측 보고서](../../../.moai/reports/semgrep-version-observation-20261027.md)                                                                                                             | 종료 코드 1, 약 15.4초, stdout 0바이트, stderr는 파이썬 예외. 판정 `NOT_OBSERVED:NONZERO_EXIT` — **버전 문자열(`1.180.0`)을 관측하지 못했다.** 이번 실행에 귀속된 5157 0건·루프백 수신 0건이며 **외부 통신이 없었다는 증거가 아니다.** `semgrep.exe`가 `semgrep-core.exe`·`pysemgrep.exe`까지 실행했다. 복구 뒤 실행 전 기록과 대조(보고서 6절) |
| **실제 Windows(이 PC)**            | 보완한 코드(`9bda3ba`)로 같은 실행을 새 RunId로 별도 1회(스텁 점검 없음). 전용 `USERPROFILE`(`work\state\home`)을 주고 한도·해석 규칙은 그대로 둠. [두 번째 관측 보고서](../../../.moai/reports/semgrep-version-observation-20261028.md)                                                                                                                                                                                                                                                                                      | 판정 `NOT_OBSERVED:TIMEOUT`: 30초 한도에서 강제 종료, stdout·stderr 0바이트. **버전 문자열을 얻지 못했다.** 루프백 수신 2건(귀속 불가), 귀속된 5157 0건 — **외부 통신이 없었다는 증거가 아니다.** 복구 뒤 실행 전 기록과 대조                                                                                                                   |
| **실제 Windows(이 PC)**            | 같은 실행을 새 RunId로 별도 1회(스텁 점검 없음). 버전 관측 자식의 환경에만 온라인 최신 버전 조회를 끄는 고정값 `SEMGREP_ENABLE_VERSION_CHECK=0`을 더함(코드 `b95e9e3`. 한도·해석 규칙·나머지 환경은 그대로). [세 번째 관측 보고서](../../../.moai/reports/semgrep-version-observation-20261028-version-check-off.md)                                                                                                                                                                                                          | 판정 `VERSION_OBSERVED_AS_EXPECTED`: 종료 코드 0, 14.7초, stdout `1.180.0`(9바이트), stderr 0바이트, `streamsClosed=true`. 루프백 수신 0건·귀속된 5157 0건 — **외부 통신이 없었다는 증거가 아니다.** **조회를 끈 조건에서 한 번 관측한 결과**이며 이전 시간 초과의 원인을 확정하지 않는다. 복구 뒤 실행 전 기록과 대조                          |
| 합성(스텁)                         | `tests/Test-VersionRunner.ps1`: 무해한 스텁으로 시간 제한, 출력 한도, 자손 정리, 환경 격리, 거부 경로, 해석 계약(TS `parseVersionStdout`과 20개 입력 대조), 읽기 함수(가짜 스트림으로 정상 EOF·읽기 실패·한도 초과를 구분), 수집 판정 함수(합성 표와 진짜 실행기 결과), 환경 계약(전용 `USERPROFILE`, 조회를 끄는 고정값과 부모 값 비상속, TS `buildVersionChildEnv` 대조)을 확인. 시스템 설정을 바꾸지 않는다                                                                                                                | pwsh 7.6.9와 Windows PowerShell 5.1에서 각각 169/169(건너뜀 0). 실제 Semgrep의 동작은 말하지 않는다                                                                                                                                                                                                                                             |
| **합성(모의 시스템, 진입점 판정)** | `tests/Test-VersionFlows.ps1`: `Test-VersionObservation.ps1`을 모의 시스템 위에서 끝까지 실행(실행기 결과 파일은 모의가 시나리오대로 만든다). 읽기 실패·실행기 오류·`streamsClosed=false`·필수 상태 누락·자식 상태 이상에서 버전을 사용 가능한 관측으로 확정하지 않는지, 이미 받은 바이트가 보존되는지, 관측 실패여도 정리가 끝까지 도는지, 관측 실패와 정리 실패가 따로 기록되는지, 전용 `USERPROFILE`이 자식에게 가고 canary가 새지 않는지, 홈 폴더가 복구 때 지워지는지(stub 모드)                                         | 자식 엔진 pwsh와 5.1 각각 141/141                                                                                                                                                                                                                                                                                                               |
| **합성(모의 시스템, 진입점 판정)** | 같은 시험을 수정 전 코드(`f099c84`)에 실행                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 60/140 — 수집이 불완전한 10개 사례가 모두 `VERSION_OBSERVED_AS_EXPECTED`·종료 0·`versionUsable=true`로 판정되는 결함이 재현된다(실패가 나오는 것이 정상)                                                                                                                                                                                        |
| **합성(스텁·모의 시스템)**         | 조회를 끄는 고정값의 새 시험을 수정 전 코드(`b9bf681`)에 실행                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | TS 6건 실패, 정적 점검 188/190, 흐름 139/141(두 엔진), 실행기 시험은 3건 실패 뒤 스텁 시나리오가 없어 중단 — 고정값이 없는 상태가 재현된다(실패가 나오는 것이 정상)                                                                                                                                                                             |
| **합성(가짜 스트림)**              | 수정 전 실행기의 읽기 루프 원문을 `EndRead`가 예외를 던지는 가짜 스트림에 실행(저장소 밖 임시 스크립트)                                                                                                                                                                                                                                                                                                                                                                                                                       | 읽기 실패가 `eof=True`로 접혀 `streamsClosed=True`가 되는 결함이 재현된다. 수정 뒤에는 `readFailed=true`·`eof=false`·`streamsClosed=false`                                                                                                                                                                                                      |
| **실제 Windows(이 PC)**            | 기존 Python 3.12.9(`-I -S`, 현재 관리자 사용자로 실행, **Semgrep 미임포트**)로 `Path.home()`만 확인                                                                                                                                                                                                                                                                                                                                                                                                                           | 전용 `USERPROFILE`을 주면 그 값을 돌려주고, 없는 환경에서는 실제 실패와 같은 오류 `Could not determine home directory.`로 실패한다. 전용 계정·격리 규칙 안에서의 값은 확인하지 않았다                                                                                                                                                           |
| 합성(TS)                           | `scripts/semgrep-lsp` 전체 vitest: `buildChildEnv`(win32)의 `USERPROFILE`·최소 이름 집합·부모 값 비복사, `childHomeDir`, 홈 폴더 생성, Linux 불변, `buildVersionChildEnv`의 고정값·부모 값 비상속·버전 경로 한정(서버 경로 불변, `precheck` 허용 목록 밖)                                                                                                                                                                                                                                                                     | 61파일 2729 통과, 8 건너뜀(이번에 8개 추가: 고정값 6, 허용 목록 1, 구조 1)                                                                                                                                                                                                                                                                      |
| **미확인(관측하지 않음)**          | **온라인 최신 버전 조회를 켠 상태(10-28 조건)에서 `semgrep.exe --version`이 끝나는지·왜 30초를 넘겼는지, 조회를 끈 조건의 1회 관측(14.7초, `1.180.0`)이 반복되는지, 그 14.7초의 출처**, Semgrep이 `USERPROFILE` 말고 다른 위치(`APPDATA` 등)를 요구하는지, 진짜 파이프에서 읽기 실패가 났을 때 보완한 실행기의 동작, Semgrep·가상환경 Python의 격리, `semgrep.exe --version`의 정상 출력과 그 연결 시도, DNS·UDP·ICMP·IPv6 격리, 반복 실행의 재현성, 서비스가 대신 수행하는 통신, 파일·폴더 ACL 접근 거부 때의 실제 복구 동작 | **미확인.** 위 1회 관측들로 이 항목들을 말하지 않는다                                                                                                                                                                                                                                                                                           |
| 실행하지 않았다                    | `--version`·`lsp --debug`(LSP 최소 관측) 외 인자의 `semgrep`, 규칙 내려받기, 스캔, 음성 대조의 실제 실행                                                                                                                                                                                                                                                                                                                                                                                                                      | 하지 않았다(보완 뒤 실제 Semgrep은 `--version`만 두 번(10-28 한도 초과 1회, 조회를 끈 조건 1회) 실행했고, `lsp --debug`는 2026-10-29에 한 번 실행했다). 새 실행기(`version-runner.ps1`)는 이름이 `semgrep.exe`인 절대 경로와 인자 `["--version"]` 외를 거부한다                                                                                 |

## 파일

| 파일                                  | 역할                                                                                                                                                                                                                | 상태를 바꾸나                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `IsolationCommon.ps1`                 | 공용 함수(점 읽기 전용). 변경 관문 `Invoke-Mutation`, 신원 검증, 이벤트 대조·판정, 감사 창, 정리 결과, 실행 기록                                                                                                    | 불러오기만으로는 아니다                     |
| `IsolationFlows.ps1`                  | 적용·검증·복구의 본문(`Invoke-IsoApply`/`Invoke-IsoVerify`/`Invoke-IsoRecover`). 진입 스크립트는 이것을 부르고 종료 코드로 끝난다                                                                                   | 불러오기만으로는 아니다                     |
| `Invoke-IsolationPreflight.ps1`       | 현재 설정을 읽어 스냅숏으로 보관                                                                                                                                                                                    | 아니다(RunDir에 기록만 쓴다)                |
| `Initialize-Isolation.ps1`            | 전용 계정 + 계정 범위 아웃바운드 차단 규칙 + (선택) 경로 읽기·실행 권한                                                                                                                                             | `-Apply`일 때만                             |
| `Test-IsolationEffect.ps1`            | 무해한 부모→자식 프로브로 차단·루프백을 관측, 신원 교차 확인, 5157 대조, 정리                                                                                                                                       | `-Execute`일 때만(감사 창·계정 사용 켜기)   |
| `Get-IsolationEvidence.ps1`           | 임의 실행의 프로세스 기록으로 5157을 대조(읽기 전용)                                                                                                                                                                | 아니다                                      |
| `Remove-Isolation.ps1`                | 이 실행이 만든 것만 소유 확인 후 되돌림. `-Discover`로 남은 것 찾기                                                                                                                                                 | `-Apply`일 때만                             |
| `probe-parent.ps1`, `probe-child.ps1` | 전용 계정으로 실행되는 무해한 프로브(TCP 연결 시도만, 이번 실행의 `runToken`을 파일에 적는다)                                                                                                                       | 아니다                                      |
| `Test-IsolationScripts.ps1`           | 자체 점검(구문·BOM·구조·논리). 버전 관측 파일은 역할별 규칙(진입점·실행기·스텁·계약 파일)을 받는다. 시스템을 읽지도 바꾸지도 않는다                                                                                 | 아니다                                      |
| `tests/MockSystem.ps1`                | 모의 시스템(계정·방화벽·감사·ACL·프로세스·Security 로그·버전 실행기 결과를 흉내). 시험 전용이며 운영 스크립트는 읽지 않는다                                                                                         | 아니다(샌드박스 안에서만)                   |
| `tests/Test-IsolationFlows.ps1`       | 모의 시스템 위에서 적용·검증·복구 진입 스크립트를 끝까지 돌리는 흐름 시험                                                                                                                                           | 아니다(임시 샌드박스 안에서만)              |
| `Test-VersionObservation.ps1`         | 관리자 쪽 진입점(기본 dry-run). 전용 계정으로 `version-runner.ps1`을 실행하고 5157 수집·신원 교차 확인·독립 정리를 하며, 수집 상태를 계약 함수로 판정해 관측 성립과 정리 완료를 따로 기록한다                       | `-Execute`일 때만(감사 창·계정 사용 켜기)   |
| `version-runner.ps1`                  | 전용 계정으로 실행되는 좁은 실행기. `semgrep.exe`의 절대 경로 + 인자 `["--version"]`(또는 스텁)만 셸 없이 실행, 시간·출력 한도, 정상 EOF와 읽기 실패의 구분, 자손 정리                                              | 아니다                                      |
| `version-stub.ps1`                    | 실행기 점검용 무해한 스텁(시나리오 고정, 버전 자리는 항상 `0.0.0`)                                                                                                                                                  | 아니다                                      |
| `VersionContract.ps1`                 | 어댑터 계약(`tool-observation.ts`)의 한도와 `parseVersionStdout`의 PowerShell 이식본, 수집 판정 함수(`Get-VersionObservationFailures`), 자식 환경 구성(`New-VersionChildEnv`, 전용 홈)                              | 아니다                                      |
| `tests/Test-VersionRunner.ps1`        | 스텁·가짜 스트림·합성 결과로 실행기의 제한·정리·환경 격리·거부 경로·읽기 함수와 판정 함수, 해석 계약·환경 계약의 TS 대조를 확인하는 시험                                                                            | 아니다(임시 샌드박스 안에서만)              |
| `tests/Test-VersionFlows.ps1`         | 모의 시스템 위에서 버전 관측 진입점의 판정·정리·환경을 끝까지 돌리는 흐름 시험(실행기는 돌리지 않고 결과 파일을 모의가 만든다)                                                                                      | 아니다(임시 샌드박스 안에서만)              |
| `lsp-min-runner.ps1`                  | LSP-MIN-1 표준 입력 러너. `semgrep.exe lsp --debug`(또는 스텁)를 한 번 띄워 initialize → shutdown → exit만 보내고 원문 바이트·종료·정리 기록을 결과 파일로 남긴다. 관리자 진입점은 `Test-LspMinObservation.ps1`이다 | 진입점이 전용 계정으로 실행(2026-10-29 1회) |
| `lsp-min-stub.ps1`                    | 러너 점검용 무해한 스텁 서버(시나리오 25개). 실제 Semgrep이 아니다                                                                                                                                                  | 아니다(임시 샌드박스 안에서만)              |
| `LspMinContract.ps1`                  | LSP-MIN-1 계약의 PowerShell 이식본(고정 인자·메시지, 환경 이름 집합, 초기화 핵심 규칙, 중단 문구, 허용 이미지). 실행 부작용이 없다                                                                                  | 아니다                                      |
| `tests/Test-LspMinRunner.ps1`         | 러너를 스텁으로 끝까지 돌리고, 계약을 TS 모듈(`lsp-min.ts`)과 같은 입력으로 대조하며, 러너 결과 → TS 기록 변환까지 확인하는 시험                                                                                    | 아니다(임시 샌드박스 안에서만)              |

모든 `.ps1`은 UTF-8 BOM으로 저장한다(Windows PowerShell 5.1이 BOM 없는 UTF-8을 ANSI로 읽어 한글이 깨지기 때문). `.gitattributes`의 `eol=lf`와 함께 둔다.

## 순서와 명령

관리자 권한 PowerShell에서 실행한다. 스크립트 폴더로 이동한 뒤 `powershell.exe`(5.1)로 부른다.

```powershell
$d = '<저장소>\scripts\semgrep-lsp-isolation\windows'
$ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"

# 0. 자체 점검과 흐름 시험 (시스템을 건드리지 않는다)
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Test-IsolationScripts.ps1"
& pwsh -NoProfile -File "$d\tests\Test-IsolationFlows.ps1" -Engine powershell      # 자식 엔진: powershell(5.1) 또는 pwsh
& pwsh -NoProfile -File "$d\tests\Test-VersionFlows.ps1" -Engine powershell        # 버전 관측 진입점의 판정·정리·환경(모의 시스템)
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\tests\Test-VersionRunner.ps1" `
      -TsxCmd <저장소>\node_modules\.bin\tsx.cmd -ToolObservationTs <저장소>\scripts\semgrep-lsp\tool-observation.ts `
      -CliTs <저장소>\scripts\semgrep-lsp\cli.ts -NodeDir <node 폴더> -PythonExe <기반 Python 폴더>\python.exe   # 마지막 네 인자는 선택(없으면 해당 항목 SKIPPED)

# 1. 읽기 전용 사전 점검 → RunDir, ConfirmSnapshot(12자리)이 출력된다
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Invoke-IsolationPreflight.ps1"

# 2. 적용 계획 보기 (dry-run: 아무것도 만들지 않는다)
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Initialize-Isolation.ps1" -PreflightDir <RunDir> `
      -GrantReadExecute "<가상환경 폴더>,<기반 Python 폴더>"

# 3. 적용 — 소유자 승인 뒤에만. 사전 점검 스냅숏을 검토했다는 표시로 ConfirmSnapshot을 넘긴다
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Initialize-Isolation.ps1" -PreflightDir <RunDir> `
      -ConfirmSnapshot <12자리> -Apply -GrantReadExecute "<가상환경 폴더>,<기반 Python 폴더>"

# 4. 효과 관측 계획 보기 → 실행 (실행도 소유자 승인 뒤에만)
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Test-IsolationEffect.ps1" -RunDir <RunDir>
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Test-IsolationEffect.ps1" -RunDir <RunDir> -Execute

# 5. 되돌리기 (정상 종료·실패·중단 모두 같은 명령)
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Remove-Isolation.ps1" -RunDir <RunDir>           # dry-run
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Remove-Isolation.ps1" -RunDir <RunDir> -Apply [-RemoveProfile]

# 6. (별도 승인·별도 1회) 버전 관측: 계획·사전 조건만 보기 → 실행. 3단계의 -GrantReadExecute 가 적용돼 있어야 한다
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Test-VersionObservation.ps1" -RunDir <RunDir> `
      -SemgrepExe <venv>\Scripts\semgrep.exe -ExpectedExeSha256 <hex> -WheelPath <휠> -ExpectedWheelSha256 <hex> [-Execute]
```

`-ExecutionPolicy RemoteSigned`는 그 프로세스에만 적용되며 시스템 실행 정책을 바꾸지 않는다(이 PC의 정책이 `RemoteSigned`인 상태에서 실제로 쓴 값이다). 프로브를 띄우는 스크립트 안의 호출(`IsolationFlows.ps1`, `probe-parent.ps1`)은 코드에 박힌 프로세스 범위 `Bypass`를 쓴다.

`-File`로 부르면 배열 인자는 쉼표로 이어 한 문자열로 넘긴다(스크립트가 쉼표로 나눈다). 경로에 쉼표가 있으면 쓸 수 없다.

## 버전 관측(`Test-VersionObservation.ps1`)의 범위·환경·판정·정리

**범위.** 전용 계정으로 설치된 `semgrep.exe`를 절대 경로와 인자 `["--version"]` 하나로 1회 실행하는 것까지다. LSP 서버·규칙 내려받기·스캔·음성 대조의 실행을 허용하지 않으며, 이 진입점은 그런 허용으로 확대되지 않는다. 해석 계약(정규식·기대 버전·한도)은 `tool-observation.ts`의 값 그대로다.

**실행 범위에 대한 관측.** `semgrep.exe --version`은 프로세스 하나로 끝나지 않는다. 2026-10-27 실행에서 `semgrep.exe`(pip 실행기 래퍼) → 가상환경 `python.exe` → 기반 `python.exe` → `semgrep-core.exe osemgrep --version`(서명되지 않은 246MB 바이너리) → `pysemgrep.exe --version` → 다시 `python.exe`가 차례로 실행됐다(2026-10-28 실행에서도 같은 체인을 관측했고 그때는 30초 한도까지 끝나지 않았다. 온라인 최신 버전 조회를 끈 조건의 실행에서도 같은 체인을 관측했고 14.7초에 끝났다). 그러므로 (1) 전용 계정에는 `semgrep.exe` 한 파일이 아니라 가상환경 루트와 기반 Python 폴더(`-GrantReadExecute`)의 읽기·실행 권한이 필요하고, (2) 허용은 서명되지 않은 `semgrep-core.exe`와 `pysemgrep.exe`의 실행까지 포함하는 것으로 읽어야 하며, (3) 시간 한도(30초)는 자손 전체에 걸린다.

**정리.** 실행기는 시간 초과·출력 초과·읽기 실패 때 자식 트리를 끝내고, 정상 종료·오류 어느 쪽이든 남은 자손을 끝낸 뒤 정리 뒤 생존 수를 기록한다. 관리자 쪽은 이와 별개로 전용 계정이 소유한 남은 프로세스를 모두 끝내고(`process-cleanup`), 계정 비활성화·감사 값 복구·수신기 정지를 각각 독립으로 한 뒤 읽어서 확인한다. 40ms 간격 폴링에 잡히지 않은 아주 짧게 산 자손은 5157 귀속에서 빠질 수 있다.

**환경.** 자식 환경은 PS `New-VersionChildEnv`와 TS `buildVersionChildEnv`(= `buildChildEnv`(win32) + 고정값 하나)가 같은 이름 집합으로 만든다: `PATH`·`SYSTEMROOT`·`TEMP`·`TMP`, **`USERPROFILE`**, `SEMGREP_APP_URL`/`METRICS_URL`/`VERSION_CHECK_URL`, `SEMGREP_LOG_FILE`/`SETTINGS_FILE`/`VERSION_CACHE_PATH`, **`SEMGREP_ENABLE_VERSION_CHECK=0`**. 마지막 것은 `--version`이 버전을 출력한 뒤 하는 온라인 최신 버전 조회를 끄는 **버전 관측 자식 전용 고정값**이다(문자열 상수이고 부모 환경에서 읽지 않으며, 설치 버전 출력을 바꾸지 않는다). 서버(LSP) 경로의 환경에는 주지 않고 `precheck`는 이 이름을 허용 목록 밖으로 거절한다. `USERPROFILE`은 부모 값을 복사하지 않고 그 실행의 상태 폴더 아래 `home`이다(PS: 작업 폴더의 `work\state\home`, 복구가 작업 폴더를 `.owner` 확인 뒤 지울 때 함께 지워진다. TS: 증거 폴더의 `version-check-state\home`과 `semgrep-state\home`, 상태 폴더를 만드는 자리에서 만들고 쓰기 경로 검사에도 같은 상수가 들어 있다). `HOME`·`HOMEDRIVE`·`HOMEPATH`·`APPDATA`는 주지 않는다. 부모의 토큰·프록시는 이름도 값도 복사하지 않는다. Linux는 예전과 같다.

**판정.** 수집 상태·종료 상태·stdout 해석은 계약 함수 `Get-VersionObservationFailures` 한 곳이 정한다. 주 토큰 우선순위(해당하는 것은 모두 `failures`에 남는다): `RUNNER_NO_RESULT` → `RUNNER_REFUSED` → `SPAWN_FAILED` → `RUNNER_ERROR` → `STREAM_READ_FAILED` → `TIMEOUT` → `OUTPUT_LIMIT_EXCEEDED` → `KILLED` → `STREAMS_NOT_CLOSED` → `COLLECTION_STATE_UNKNOWN` → `CHILD_NOT_EXITED` → `NONZERO_EXIT` → `OUTPUT_*`. 필수 상태(`streamsClosed`, 두 스트림의 `readFailed`·`overflow`·`b64`, 자식의 `started`·`timedOut`·`outputLimitExceeded`·`killed`, `childState`)가 없거나 불리언이 아니면 정상으로 보지 않는다(`COLLECTION_STATE_UNKNOWN`). 이미 받은 바이트와 오류는 증거로 남기고 참고용 해석(`diagnosticParse`, `usable=false`)만 붙이며, 버전을 사용 가능한 관측으로 확정하지 않는다. **자식이 종료 코드 0으로 끝나도 자손이 파이프를 쥐어 EOF를 못 보면 `STREAMS_NOT_CLOSED`(사용 불가)다 — 수정 전보다 엄격하다.** 관측 성립(`report.observation`)과 정리 완료(`report.cleanup`)는 따로 기록하고, 정리가 불완전하면 종료 코드 70이 우선하되 관측 판정을 덮지 않는다.

## LSP 최소 관측(LSP-MIN-1, `lsp-min-runner.ps1`)의 범위·메시지·종료·판정

이 절의 파일은 코드와 스텁 시험까지만 만들어졌다. **실제 Semgrep은 `--help`·`--version`을 포함해 한 번도 실행하지 않았고**, 계정·방화벽·감사·ACL도 적용하지 않았다. 실제 LSP 실행을 허용할지는 이 구현을 검토한 뒤 소유자가 정한다. 관리자 쪽 진입 스크립트(수신기 감시, 중단 파일 생성, 5157 수집)도 아직 만들지 않았다. _(이 문단은 구현 시점의 기록이다. 진입점은 이후 만들어졌고 2026-10-29에 실제 1회 관측을 했다. 아래 "LSP 최소 관측의 실제 1회 실행" 절을 본다.)_

**범위.** 정상 LSP 시작이나 규칙 로딩, 보안 판정을 대신하지 않는 별도의 최소 관측이다. `initialized`를 보내지 않으므로 서버는 초기화만 마친 상태에서 끝나며, 기록은 COMPLETE·보안 통과·대조 참조 자격 어느 것과도 연결되지 않는다. 기존 세션 제어기·평가기·버전 실행기에는 손대지 않았다(구조 시험이 이를 지킨다).

**고정 사항.** 실행 파일 이름은 `semgrep.exe`(절대 경로), 인자는 정확히 `["lsp","--debug"]`이다. 보내는 메시지는 `initialize`(id `lsp-min-init-1`) → `shutdown`(id `lsp-min-shutdown-1`) → `exit` 셋뿐이고, 송신 직전 방어선이 그 밖의 메시지를 막는다. 작업 영역과 로컬 규칙 폴더는 비어 있어야 시작한다. 환경은 요청의 11개 이름만 쓰며 부모 환경을 물려주지 않고, `SEMGREP_ENABLE_VERSION_CHECK`는 넣지 않는다.

**한도.** 전체 150초, 초기화 응답 60초, exit 대기 30초, stdin 닫은 뒤 유예 10초, 종료 확인 창 10초(고정 한 번), stdout 1 MiB, stderr 256 KiB. 요청은 이 값을 낮출 수만 있다. 기존 버전 관측의 한도는 바꾸지 않았다.

**초기화 응답은 `error` 부재만으로 통과시키지 않는다.** 요청 id 일치, JSON-RPC 2.0 구조, `result`가 객체인지, `capabilities`가 객체인지를 보고, 공개 소스가 초기화 예외를 `result` 안에 `{retry:false}`로 보내는 경우(InitializeError)도 거절한다. 이 핵심 규칙을 통과하면 shutdown·exit를 보내고, 통과하지 못하거나 시간 안에 응답이 없으면 아무것도 더 보내지 않고 stdin을 닫는다. 서버가 `Uninitialized` 상태에서는 shutdown·exit를 조용히 무시하기 때문이다. 서버 정보와 분석용 규칙(capabilities 해시 등)은 러너가 아니라 TS 모듈이 원문 바이트로 다시 풀어 기록한다.

**종료 정책.** 강제 종료는 한 번만 보낸다. 라이브 중단 조건, 전체 상한, 출력 상한, 프레임 오류, stdin 쓰기 오류(`STDIN_ERROR`), stdout·stderr 읽기 오류(`STREAM_READ_FAILED`), 시작 직후 종료는 stdin을 닫지 않고 곧바로 프로세스 트리를 끝내고, 그 뒤에는 새 메시지를 보내지 않는다. 초기화 실패·시간 초과는 stdin을 닫은 뒤 유예를 두고, 안 끝나면 끝낸다. 모든 단계 한도는 남은 전체 시간으로 잘리므로 전체 상한 뒤에 유예가 더 붙지 않는다. 종료 확인 창만 관측 구간 밖에 고정 한 번(10초) 있다. **전체 벽시계 시간의 상한은 보장하지 않는다.** 관측 구간 150초와 이 확인 창 10초는 지켜지지만, 시간 제한이 없는 호출(사후 폴더 목록, `Get-FileHash`, 정리 구간의 프로세스 표 조회 등)이 그 바깥에서 시간을 더 쓸 수 있다.

**관측과 정리는 따로 기록한다.** 관측 상태(`OBSERVED`·`ABORTED`·`NOT_OBSERVED`·`NOT_ATTEMPTED`)와 정리 결과(`cleanup.ok`)는 서로 섞이지 않는다. 정리가 실패해도 관측은 `OBSERVED`일 수 있고, 반대도 마찬가지다. 관측 성립을 막는 사유는 먼저 일어난 이유(`trigger`)뿐 아니라 뒤따른 이유(`also`)에서도 읽는다. 강제 종료가 필요했다면 응답이 유효했어도 `NOT_OBSERVED`(`FORCE_KILL_REQUIRED`)이고, 응답·송신 같은 관측 사실은 그대로 남는다. `exit`를 무시해 stdin EOF로 끝난 경로는 `OBSERVED`로 남지만 `termination.path`가 `STDIN_CLOSED`라서 스스로 끝난 경로(`SELF_EXIT`)와 구분된다.

**실시간 감시·사후 비교·미관측.** 라이브 감시는 표본 추출이라 표본 사이는 보지 못한다.

| 구분        | 내용                                                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 실시간 감시 | stderr 중단 문구(A1·A2, 청크 경계 포함), 루프백 수신기 건수 증가(A3), 프로세스 이미지 이름(A4), 감시 폴더 3곳의 파일 목록(A5), 외부 중단 파일(A7), stdout 의 규칙·진단 알림(A8)                     |
| 사후 비교   | 감시 폴더의 전후 파일 이름 목록, 산출물 해시, 수신기 최종 건수, 표본에서 놓친 stderr 문구                                                                                                           |
| 미관측      | 감시 폴더 밖 파일 시스템 전체, 표본 사이에 생겼다 사라진 프로세스, 이미지 이름이 허용 목록과 같은 프로세스의 실제 동작. 기록의 `not_established`와 미관측 목록에 항상 남기며 감시했다고 쓰지 않는다 |

감시 폴더는 작업 영역(`WORKSPACE`)·규칙 폴더(`RULES_DIR`)가 비어 있어야 하고, 홈(`HOME_DIR`)은 `.semgrep/cache/fingerprinted_ignored_findings/` 밑만 허용한다. A4는 목록 조회가 연속 3번 실패해도 중단한다.

**환경 비상속의 한계.** 러너는 `ProcessStartInfo`의 환경을 비운 뒤 요청의 값만 채우고, 그 값이 계약 함수의 출력과 정확히 같지 않으면 거절한다. TS 쪽 `process-node.ts`는 Node(libuv)가 Windows에서 부모 이름 7개를 자식 환경에 주입하는 한계가 있고 이번에도 바꾸지 않았다. 러너 경로가 이 한계를 받지 않는다는 것은 스텁 시나리오 `env-names`(자식이 실제로 받은 이름 집합이 계약과 같은지)로 확인했을 뿐이며, 실제 Semgrep 자식에서 확인한 것은 아니다.

## LSP 최소 관측 관리자 진입점(`Test-LspMinObservation.ps1`)의 범위·감독·판정·정리

이 절의 파일도 코드와 스텁·모의 시험까지만 만들어졌다. **실제 Semgrep은 `--help`·`--version`을 포함해 한 번도 실행하지도 임포트하지도 않았고**, 이 PC의 계정·방화벽·감사·ACL도 바꾸지 않았다. `pin.json`·`verified`·`policy_accepted`·ADR 상태는 읽지도 바꾸지도 않는다. 실제로 한 번 돌려 볼지는 이 구현을 검토한 뒤 소유자가 정한다. _(이 문단은 구현 시점의 기록이다. 소유자가 이번 한 번에 한해 실행을 허용했고 2026-10-29에 실행했다. 아래 "LSP 최소 관측의 실제 1회 실행" 절을 본다.)_

**기본은 읽기 전용이다.** `-Execute` 없이는 사전 조건 확인과 계획 출력만 하고 `NOT_EXECUTED`로 끝난다(수신기, 감사 창, 계정, 복사, 삭제, 러너 실행 모두 하지 않는다. 실행 기록 폴더의 `log.jsonl`에 계획 줄이 더해지는 것은 선례와 같다). 기존 격리·복구 도구(`IsolationCommon.ps1`의 변경 관문, 감사 창, 정리 항목, 5157 대조)를 그대로 쓴다.

**설치물은 정확히 대조한다.** 실행 파일은 `-DistRoot`에서 도출한 `<DistRoot>\venv\Scripts\semgrep.exe`와 같은 경로여야 하고(`..`·상대·UNC 거절), 그 경로 조각에 심볼릭 링크·정션이 없어야 한다. 이름이 `semgrep.exe`라는 이유만으로 허용하지 않는다. 전체 64자리 SHA-256(실행 파일·휠, 선택으로 `semgrep-core.exe`)이 현재 파일과 같고, 배포물 검증 보고서(`-DistReport`, PR #35)의 `경로(크기바이트, SHA-256 해시)` 짝과 휠 행(`win_amd64`)에도 같은 값이 있어야 한다. 같은 파일 이름에 다른 해시가 하나라도 적혀 있으면 충돌로 거절한다. 앞부분만 쓴 해시는 거부(종료 30)한다. 실행 뒤 같은 파일들의 해시를 다시 읽어 바뀌었는지 기록한다.

**요청과 결과는 실행별 토큰으로 묶는다.** 토큰은 `lsp-<RunId>-<무작위 32자리>`이고 러너가 결과에 되돌려 쓴다. 이전 실행의 요청·결과·중단 파일은 시작 전에 지우고, 결과는 토큰이 같을 때만 받아들이며, 모드·요청 반향(실행 파일·인자·작업 폴더·환경 이름·한도)·시작 시각이 요청과 맞아야 한다. 맞지 않으면 `RESULT_BINDING_FAILED`다. 토큰은 비밀이 아니다(요청 파일은 같은 계정이 읽을 수 있다). 위조를 막는 것은 토큰이 아니라 관리자 CIM 교차 확인과 시작 시각이다. 결과의 자기 보고(PID·SID·경로·자식 시작 시각)는 관리자 쪽 CIM과 교차 확인하고(실행기·자식의 소유 SID, 실행 파일, 부모 관계, 명령줄), 어긋나면 `IDENTITY_UNVERIFIED`다. 러너 자신의 부모 프로세스는 기준으로 삼지 않는다(`Start-Process -Credential`로 띄운 프로세스의 부모는 호출한 스크립트가 아닐 수 있다). 자식의 부모가 러너인지는 확인한다. 후손의 실행 파일 경로가 설치 폴더·Windows 시스템 폴더 밖이면 `DESCENDANT_PATH_UNEXPECTED`다(러너의 이미지 허용 목록은 이름만 보기 때문에 경로로 다시 본다).

**수신기는 자식보다 먼저 열고 실행 중 계속 읽는다.** 열지 못하면 아무것도 시작하지 않는다(`NOT_ATTEMPTED:RECEIVER_NOT_READY`). 연결이 들어오면 중단 파일 `A3:RECEIVER_HIT`, 읽기에 실패하면 `A3:RECEIVER_UNREADABLE`을 러너에 전달한다. 중단 파일을 쓰지 못하면 전달 실패로 기록하고 전용 계정의 프로세스를 직접 끝낸다. 러너가 시작하기도 전에 연결이 들어와 중단 파일이 먼저 생긴 경우 러너는 시작을 거절한다(`ABORT_FILE_ALREADY_PRESENT`, 자식을 띄우지 않는다).

**러너가 매달려도 관리자 루프가 마감을 지킨다.** 이 스크립트의 감독 루프는 러너의 동기 CIM·파일 호출과 독립이다(프로세스 표, 프로세스 기록, 소유 SID 조회는 조회 한 번마다 제한 시간을 주는 포트로만 하고, 수신기 비우기는 호출당 연결 수에 상한이 있다. 다만 전용 계정의 프로세스 이름 열거(`Get-Process -IncludeUserName`)는 제한 시간을 줄 수 없어서, 종료할 때 **이미 추적한 PID를 먼저** 끝내고 열거는 그다음에 시도한다). 관측 마감(기동 허용 20초 + totalMs)에 중단 `A7:SUPERVISOR_DEADLINE`을 요청하고, 거기서 killConfirm + 유예 15초가 지나도 러너가 있으면 전용 계정의 프로세스를 끝낸 뒤 정리로 넘어간다. 결과 파일이 없으면 `RUNNER_NO_RESULT`로 관측 실패를 남기고 복구는 계속한다. 취소는 `-CancelFile`(기본 `<RunDir>\lsp-min-cancel.flag`)이 생기면 `A7:OPERATOR_CANCEL`을 전달한다. 시험은 요청도 중단 파일도 읽지 않는 진짜 정지 스텁 프로세스로 이 경로를 확인한다. 시간 제한이 없는 호출(러너의 사후 폴더 목록·해시 등)은 그대로이므로 전체 벽시계 상한은 보장하지 않는다.

**판정의 본체는 TS 재해석이다.** 러너 결과 원문과 이 스크립트가 모은 문맥(`lsp-min-admin-context/1`: 수신기, 신원, 결합, 감독, 설치물 해시)을 `scripts/semgrep-lsp/lsp-min-reinterpret-cli.ts`(tsx)가 기존 기록 조립기로 다시 해석해 `lsp-min-record-*.json`을 쓴다. 도구가 없으면 관측은 성립하지 않는다(`REINTERPRETATION_NOT_RUN`). 실제 모드의 `-Execute`는 이 도구가 없으면 사전 조건에서 멈춘다(L09). 이 호출은 **정리가 모두 끝난 뒤에** 하고(도구가 멈춰도 계정·감사 창·수신기가 이미 되돌려져 있다) 하나의 마감(120초)이 있다. 실행과 출력 수집을 같은 마감으로 세고, 부모 프로세스가 끝난 것을 출력 끝(EOF)으로 보지 않는다: stdout·stderr 두 파이프가 모두 닫혀야 끝난 것이다. 자손이 파이프를 붙잡은 채 마감을 넘기면 `PIPE_NOT_CLOSED`, 도구가 멈추면 `TIMEOUT`, 읽기가 실패하면 `STREAM_READ_FAILED`, 도구를 시작한 뒤 생긴 취소 표지는 `CANCELLED`로 기록하고 관측은 성립하지 않는다(`REINTERPRETATION_FAILED`). 도구는 시작 직후 Windows 작업 개체(Job Object)에 넣어, 마감·실패·취소 때 부모가 먼저 끝나 고아가 된 자손까지 개체째로 끝낸다. 이 뒤처리는 관측과 따로 `process-reinterpret-tool` 항목으로 프로세스 정리 묶음에 기록하고, 남은 프로세스나 끝나지 않은 읽기가 확인되면 정리 불완전(종료 70)이다. 마감을 넘긴 뒤 정리를 확인하느라 최대 5초(`KillConfirmMs`)를 더 쓸 수 있고, 작업 개체 형식을 처음 만드는 컴파일 시간은 마감에 들어가지 않는다. 한계: 프로세스를 시작한 뒤 작업 개체에 넣기 전에 이미 만든 후손은 개체에 속하지 못한다(틈은 아주 짧지만 0이 아니다).

**작업 경로는 신뢰 루트부터 목적지까지 링크를 확인하고, 이전 배치는 확인 뒤에 지운다.** 러너는 감시 폴더가 비어 있어야 시작하므로 이전 배치(`work\lsp`)를 관리자 권한으로 재귀 삭제하고, 요청·결과·중단 파일을 쓰고, 러너 사본을 복사한다. 전용 계정은 작업 폴더 아래에 정션·심볼릭 링크를 만들 수 있다. 예전에는 `lsp` 폴더 안만 봐서, 상위 `work` 폴더가 링크이고 `lsp` 자체와 그 안이 일반 폴더면 걸리지 않았고 삭제·복사·쓰기가 링크 대상 폴더로 샜다(실제 Windows 정션으로 재현). 이제는 신뢰 루트(`names.WorkDir`, `.owner`가 있는 폴더, 루트 자신 포함)부터 모든 목적지(`work`, `lsp`, 요청·결과·결과 임시·중단 표지 파일, 러너 사본 4개)까지 이미 있는 경로 조각을 위에서 아래로 확인한다: 링크(`LINK`), 읽지 못함(`UNREADABLE`), 중간 조각이 폴더가 아님(`NOT_A_DIRECTORY`), 루트 밖(`OUTSIDE_ROOT`), 루트 없음(`ROOT_MISSING`)은 모두 문제다. 아직 없는 조각에서는 멈추고 문제로 세지 않는다(검증한 기존 부모 아래에 만든다). 상위 경로가 깨끗할 때만 `lsp` 안의 링크도 훑는다. 같은 확인을 사전 조건 T08, 첫 변경(수신기·삭제·감사 창·계정)보다 앞선 관문 1, 계정을 켠 뒤 첫 작업 폴더 만들기·복사보다 앞선 관문 2에서 하고, 러너가 살아 있는 동안 쓰는 중단 파일은 쓰기 직전에 한 번 더 확인한다. 확인하지 못하거나 문제가 있으면 변경 전에 거절한다(T08은 종료 50, 관문은 `NOT_ATTEMPTED:WORK_PATH_UNSAFE`). 한계: 확인 시점의 상태만 본다(확인 뒤에 링크로 바뀌는 경쟁 상태는 막지 못한다). 하드 링크는 재해석 지점이 아니라서 찾지 못한다. 관리자 증거 파일을 쓰는 실행 기록 폴더는 이 확인의 범위 밖이다. 삭제는 전용 계정을 켜기 **전**에 하고, 확인은 링크를 따라가지 않고 찾는다.

**OS 차단 이벤트(5157)는 판정에 반영된다.** 귀속된 이벤트가 1건이라도 있으면 `OS_BLOCK_ATTRIBUTED`, 수집 실패·감사 미확인·로그 밀림이면 `OS_BLOCK_EVIDENCE_UNAVAILABLE`로 관측이 성립하지 않고(TS 문맥에도 `ADMIN_OS_BLOCK_*`로 전달), 건수는 0이 아니라 `null`과 사유로 남는다. 식별 불가 이벤트(예: 시스템 프로세스의 UDP 137/138)는 관측을 막지 않고 건수만 따로 적는다. 관측을 막지는 않지만 증거의 빈틈이 되는 신호(`observation.caveats`: 관리자 쪽 프로세스 표 읽기 실패, 러너가 치우지 못해 관리자 정리가 끝낸 잔존 프로세스)는 성립 여부와 따로 적는다. 최종 수신기 읽기는 루프 종료 직후 한 번이라 그 뒤의 접속은 세지 않는다.

**세 결과는 서로 바꾸지 않는다.** 보고서의 `observation`(관측), `processCleanup`(수신기 정지·전용 계정 프로세스 정리), `systemRecovery`(계정 비활성화·감사 값 복구)는 따로 적히고, 정리 항목은 각각 독립으로 실행된다. 정리가 하나라도 실패하면 종료 코드 70이고 관측 결과는 그대로다. 귀속된 5157, 식별 불가 이벤트, 루프백 건수는 따로 적고, 읽기 실패·감사 미확인·로그 밀림이면 0으로 채우지 않고 `null`과 사유(`unusableBecause`)를 적는다.

종료 코드: 0 관측 성립 + 정리 완료 / 30 거부(해시 축약·필수 인자 없음·한도 변경 등) / 50 사전 조건 실패 / 60 관측 성립하지 않음(정리는 완료) / 70 정리 불완전.

파일: `Test-LspMinObservation.ps1`(진입점), `LspMinAdminContract.ps1`(부작용 없는 계약·판정 함수), `LspMinAdminPorts.ps1`(수신기·중단 파일·CIM·재해석 호출 등 시스템에 닿는 곳), `tests/Test-LspMinAdmin.ps1`(단위·흐름·진짜 상태 불변 확인), `tests/MockSystemLsp.ps1`·`tests/MockPortsLsp.ps1`(기존 모의 위에 얹는 확장; 스텁 모드 러너만 현재 사용자로 실제 실행하고 `semgrep-lsp` 모드는 예외로 막는다). TS 쪽은 `scripts/semgrep-lsp/lsp-min-reinterpret.ts`(순수)·`lsp-min-reinterpret-cli.ts`(파일 입출력 래퍼)와 그 시험이다.

**이 시험들이 하지 못하는 것:** 실제 Semgrep의 동작, 실제 전용 계정·방화벽·감사·ACL 아래의 러너 동작과 격리 효과, 실제 `Start-Process -Credential`, 실제 Security 로그의 5157 형식. 흐름 시험의 러너와 스텁 서버는 **현재 사용자로** 실제 실행되고, 계정·방화벽·감사·ACL·Security 로그는 모의다.

## LSP 최소 관측의 실제 1회 실행(2026-10-29)

PR #39 HEAD `af08f20`에서, 소유자가 이번 한 번에 한해 허용한 범위(전용 비관리자 계정과 계정 범위 아웃바운드 차단, 가상환경 루트·기반 Python 폴더에 대한 임시 읽기·실행 ACE 두 건, 감사 정책의 임시 변경, 전용 프로필 생성, 서명되지 않은 `semgrep.exe`를 `["lsp","--debug"]`로 한 번 실행) 안에서 이 진입점을 `-Execute`로 한 번 실행했다. RunId는 `20261029T060257Z-5386c62f`다. 코드·환경·인자·한도·수신기 응답·판정 규칙은 바꾸지 않았고, 버전 확인 명령은 실행하지 않았다.

**사실.** 판정은 `LSP_MIN_OBSERVED`다. 송신은 `initialize → shutdown → exit` 셋뿐이고(`initialized` 없음), `initialize` 응답의 id는 `lsp-min-init-1`, `serverInfo`는 `Semgrep` `1.180.0`이다. 서버는 종료 코드 0으로 스스로 끝났다(`SELF_EXIT`, 하니스의 stdin 닫기와 강제 종료 없음). 관측은 약 2.7초였다. 신원·결합 확인은 통과했고, 루프백 수신 0건, 귀속된 5157 0건, 식별 불가 5157 0건이며 두 수집 모두 성공했다. 서버가 쓴 파일은 전용 홈의 `.semgrep/cache/fingerprinted_ignored_findings/ws.txt`(0바이트) 하나뿐이었다. 프로세스 체인은 러너 → `semgrep.exe` → 가상환경 `python.exe` → 기반 `python.exe` → `semgrep-core.exe`였고 `pysemgrep.exe`는 없었다. `shutdown`에는 stdout 응답이 없었고, 서버 로그는 요청 id를 `0`으로 찍었다(원인은 확인하지 않았다).

**분리 기록.** 관측, 프로세스 정리, 시스템 복구는 따로 기록했고 모두 완료됐다. 복구(`Remove-Isolation.ps1 -Apply -RemoveProfile`) 뒤 실행 전 기준과 19개 항목이 모두 같았다(다름 0, 읽기 실패 0).

**말하지 않는 것.** 정상 LSP 시작, 규칙 로딩, 스캔, 보안 통과, 대조 참조 자격, 외부 통신 부재, 바이너리와 공개 소스의 대응, 10-28 `--version` 시간 초과의 원인. 한 번의 관측이라 재현성도 확인하지 않았다. 같은 관측을 다시 실행하지 않으며, 다음 단계는 소유자가 정한다. 상세와 증거 해시는 [LSP 최소 관측 보고서](../../../.moai/reports/semgrep-lsp-min-observation-20261029.md)에 있다.

## 적용(`Initialize-Isolation.ps1 -Apply`)이 만드는 것과 예상 영향

| 자원            | 이름·위치                                                    | 영향                                                                                                                            |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 로컬 계정       | `bsi<8hex>`(설명 표식 `bosang-semgrep-iso:<RunId>`)          | Users 그룹만, 비관리자. 만든 직후 비활성화. 무작위 암호는 현재 사용자 DPAPI로 `credential.dpapi`에만 보관                       |
| 작업 폴더       | `%ProgramData%\bosang-semgrep-iso\<RunId>`                   | 상속을 끊고 SYSTEM·Administrators 전체, 새 계정 수정. `.owner` 표식 파일                                                        |
| 경로 권한(선택) | `-GrantReadExecute`로 지정한 경로                            | **기존 ACL에 새 계정 SID 한 건**(읽기·실행, 상속)만 추가. 사용자 프로필 아래 Python·가상환경은 기본 ACL에 Users가 없어 필요하다 |
| 방화벽 규칙     | `bosang-semgrep-iso-<RunId>-out`(Group `bosang-semgrep-iso`) | 아웃바운드 Block, `LocalUser` 조건 = 새 계정 SID, 원격 주소는 루프백 제외. 꺼진 채 만들어 범위를 읽어 확인한 뒤 켠다            |

바꾸지 않는 것: 기존 계정, 기존 방화벽 규칙, 방화벽 프로필 기본 정책(`Set-NetFirewallProfile`을 부르는 곳이 없고 자체 점검이 검사한다), 감사 정책(적용 단계에서는 안 건드린다).

## 검증(`Test-IsolationEffect.ps1 -Execute`)이 하는 일과 영향

1. **감사 창.** 감사 하위 범주 "Filtering Platform Connection"의 **실패** 감사를 이 실행 동안만 켠다. 켜기 직전에 `auditpol /backup`으로 원래 값을 새로 읽어 실행 기록에 적는다. 설정을 시도하기 **전에** 그 단계를 복구 목록에 넣고 실행 기록에 `intent`로 남기므로, 설정 직후 읽기가 실패하는 등 중간 오류가 나도 끝의 정리가 그 단계를 복구한다. `-IncludeProcessCreationAudit`를 주면 "Process Creation" 성공 감사(이벤트 4688)도 같은 방식으로 켠다. **이 스크립트는 4688을 읽어 대조하지 않는다.** 사람이 PID·계정을 교차 확인할 때 쓸 OS 기록만 남긴다.
2. **이번 실행과 파일을 묶는다.** 실행마다 `runToken`을 만들어 대상 목록과 프로브가 쓰는 모든 결과 파일에 적는다. 시작 전에 이전 실행의 프로브 파일을 지우고, 토큰이 다른 파일은 존재해도 받지 않는다(서명·출처 인증이 아니라 이전 실행의 파일과 구분하기 위한 값이다). 파일이 있다는 것만으로 준비 완료로 보지 않는다.
3. **프로브.** 전용 계정을 켜고(끝나면 끈다) 부모 `powershell.exe` → 자식 `powershell.exe`를 `Start-Process -Credential`로 띄운다. 프로세스 실행 정책은 프로세스 범위의 `-ExecutionPolicy Bypass`만 쓴다. 이때 `C:\Users\bsi<8hex>` 프로필 폴더가 생길 수 있다(`-RemoveProfile`로 정리). 연결 시도 두 가지: `127.0.0.1:<임시 수신기>`(허용 기대), `192.0.2.1:9`(RFC 5737 문서용 주소, 차단 기대). 선택 `-IncludeSelfAddressProbe`는 이 PC의 비루프백 주소에 수신기를 연다(방화벽 앱 허용 대화상자가 뜰 수 있어 기본 꺼짐).
4. **신원 교차 확인.** 성공 판정에 쓰기 전에 다음을 모두 확인한다. 하나라도 어긋나거나 필수 기록이 없으면 성공할 수 없다.
   - 부모·자식 프로세스의 CIM 기록이 있다(실행기가 직접 기록)
   - 두 프로세스의 소유 SID = 전용 계정, 실행 파일 = 기대한 `powershell.exe`
   - 자식의 부모 PID = 부모 프로브, 부모가 보고한 자식 PID = CIM의 자식
   - 자기 보고(PID·실행 파일·SID·시작 시각) = CIM 기록, 두 프로세스가 이번 실행 시작 이후에 떴다
   - 결과 파일의 `runToken` = 이번 실행, 자식이 보고한 종료 시각이 시작 이후이고 미래가 아니다

   실패하면 프로브의 자기 보고(연결 결과·시각)를 검증된 사실로 쓰지 않는다. 보고서의 `connectionAttempts`는 비어 있고, 읽은 내용은 진단용 `unverifiedProbeReports`에만 남는다. 5157 대조도 하지 않고(`osBlockObservation.skipped`), 판정은 `IDENTITY_UNVERIFIED`다. 루프백 수신 건수는 `attributedToDedicatedAccount=false`로 표시된다.

5. **OS 차단 관측.** 신원이 확인된 경우에만, 증거를 읽는 시점에 실패 감사가 켜져 있는지 다시 읽고(`Get-IsoAuditFailureState`, 읽지 못하면 `null`) 5157을 PID·경로·시각 구간으로 이번 실행에 귀속한다. 건수는 "감사가 켜져 있었다고 확인됐고 로그가 밀리지 않았을 때"만 숫자(`countsUsable=true`)이고, 아니면 `null`이다.
6. **정리.** 항목마다 독립 실행하고 읽어서 확인한다: 수신기 정지, 남은 프로브 종료, 계정 비활성화(끈 뒤 `Enabled`를 읽는다), 감사 값 복구. 하나가 실패해도 나머지를 건너뛰지 않는다.

보고서(`verification-<시각>.json`)는 항목을 섞지 않는다: **[A]** 연결 시도 결과(`connectionAttempts`), **[B]** 루프백 수신기 수신 건수(`loopbackReceiver`), **[C]** OS 차단 관측(`osBlockObservation`), **[D]** 프로브 판정(`verdict`, `probeVerdicts`), **[E]** 정리 결과(`cleanup`). 프로브 관측과 정리 결과는 따로 보존되고, `finalStatus`는 둘을 한 줄로 요약할 뿐이다.

### 프로브 판정

| 판정                          | 뜻                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `OS_BLOCK_OBSERVED`           | 연결이 실패했고, 5157 이벤트가 PID·실행 파일 경로·시각 구간·목적지까지 이번 실행과 맞았다                                            |
| `FAILED_WITHOUT_OS_EVIDENCE`  | 연결은 실패했지만 맞는 5157이 없다(로그 수집·감사·보존 범위·프로세스 기록은 정상). **차단이라고 쓰지 않는다**                        |
| `FAILED_EVIDENCE_UNAVAILABLE` | 로그를 못 읽었거나 실패 감사가 꺼져 있었거나 상태를 모르거나 기준점 이후 로그가 밀렸거나 필수 프로세스 기록이 없다. **0건이 아니다** |
| `IDENTITY_UNVERIFIED`         | 신원 교차 확인에 실패해서 연결 결과를 판정에 쓰지 않았다                                                                             |
| `NOT_BLOCKED`                 | 차단 기대인데 연결됐다                                                                                                               |
| `ALLOWED_AS_EXPECTED`         | 루프백 연결 성공                                                                                                                     |
| `UNEXPECTEDLY_FAILED`         | 허용 기대인데 실패(규칙이 루프백까지 막았을 수 있음)                                                                                 |
| `PROBE_ISOLATION_OBSERVED`    | 신원 확인 통과 + 루프백 허용 + 외부 예약 주소 `OS_BLOCK_OBSERVED` + 루프백 수신 1건 이상. **이 프로브 두 종류에 한정된 관측**이다    |

### 최종 상태(`finalStatus`)와 종료 코드

| `finalStatus`              | 조건                                                | 종료 코드 |
| -------------------------- | --------------------------------------------------- | --------- |
| `PROBE_ISOLATION_OBSERVED` | 프로브 판정이 관측됨 **그리고** 정리가 모두 완료됨  | 0         |
| `NOT_ESTABLISHED`          | 프로브 판정이 관측됨이 아님, 정리는 완료            | 60        |
| `CLEANUP_INCOMPLETE`       | 정리 항목 중 하나라도 실패·불확실(관측 결과와 무관) | 70        |

최종 판정이 `PROBE_ISOLATION_OBSERVED`여도 semgrep·`semgrep-core`·가상환경 `python`·UDP·ICMP·IPv6·DNS로 일반화하지 않는다.

## 실패·중단 후 복구

| 상황                                   | 하는 일                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 적용 도중 오류                         | `Initialize-Isolation.ps1`이 이 실행이 만든 것만 복구 함수로 되돌린다. 종료 코드 20, 되돌림도 불완전하면 21                      |
| 검증 도중 오류·Ctrl+C                  | `Test-IsolationEffect.ps1`의 `finally`가 정리를 항목별로 한다(위 6). Ctrl+C는 정리는 하지만 보고서는 못 쓸 수 있다               |
| 프로세스가 강제 종료됨·전원 차단       | `Remove-Isolation.ps1 -RunDir <RunDir> -Apply`. 실행 기록의 `intent`·`applying` 단계는 이름·값으로 찾아 소유 확인 뒤 정리한다    |
| 실행 기록이 없다(적용 첫 줄 전에 죽음) | `Remove-Isolation.ps1 -Discover`로 접두 자원을 찾고 `-RunId <RunId> -Apply`. 감사 정책·ACL은 기록이 없어 복구하지 못한다(보고됨) |

복구의 소유 확인: 방화벽 규칙은 이름 + Group + 설명 표식, 계정은 이름 + 표식 + 기록된 SID, 작업 폴더는 위치 + `.owner` 내용, ACL은 기록된 계정 SID의 ACE만, 감사는 `set` 값일 때만. 하나라도 다르면 `REFUSED_NOT_OURS`(또는 `DRIFT_NOT_RESTORED`)로 남기고 건드리지 않는다. 이미 없으면 `SKIPPED_ABSENT`.

**확인 단계 자체가 실패해도 복구 전체를 멈추지 않는다.** ACL 읽기·경로 확인·작업 폴더 `.owner` 읽기·암호 파일 경로 확인이 예외로 끝나면, 그 항목은 `FAILED`로 남고(실패한 단계 이름이 같이 적힌다) 없음(`SKIPPED_ABSENT`)이나 성공(`OK`)으로 쓰지 않는다. 읽거나 소유를 확인하지 못한 자원은 지우거나 바꾸지 않는다(ACL은 `Set-Acl`을 부르지 않고, 작업 폴더는 지우지 않는다). 독립적으로 처리할 수 있는 나머지 자원(뒤의 ACL·계정·프로필·작업 폴더·암호 파일)의 복구는 이어서 하고, 마지막에 종료 코드 40, 실행 기록 상태 `recovered-with-issues`, 완료한 항목과 실패한 항목이 함께 담긴 `recovery-<시각>.json`을 남긴다. 읽을 수 있게 된 뒤 같은 명령을 다시 실행하면 실패했던 항목만 다시 시도되고 이미 지운 자원은 `SKIPPED_ABSENT`로 나온다. dry-run에서도 읽기 실패는 `FAILED`와 종료 코드 40으로 보이고 아무것도 바꾸지 않는다. 오류를 삼키는 것이 아니라 항목별 결과로 수집한다.

**복구 결과는 구분해서 기록하고, 읽어서 확인하기 전에는 성공(`OK`/`restored`)으로 쓰지 않는다.** 감사 복구(`Close-IsoAuditWindow`)의 결과:

| 결과               | 뜻                                                                     | 정리 성공으로 세나      |
| ------------------ | ---------------------------------------------------------------------- | ----------------------- |
| `RESTORED`         | 우리가 바꾼 값이었고, 되돌린 뒤 다시 읽어 원래 값임을 확인했다         | 예                      |
| `ALREADY_RESTORED` | 읽어 보니 이미 원래 값이다(누군가 되돌렸거나 설정이 적용되지 않았다)   | 예                      |
| `NOT_CHANGED`      | 바꾼 적이 없다                                                         | 예                      |
| `READ_FAILED`      | 현재 값을 읽지 못했다. 복구하지 않았고, 단계는 복구 대상으로 남는다    | **아니오**              |
| `SET_FAILED`       | 되돌리는 설정이 실패했다                                               | **아니오**              |
| `VERIFY_FAILED`    | 되돌렸다고 했지만 다시 읽지 못했거나 원래 값이 아니다                  | **아니오**              |
| `DRIFT`            | 설정 값도 원래 값도 아니다 → 제3자의 변경으로 보고 **덮어쓰지 않았다** | **아니오**(사람이 확인) |

`Remove-Isolation.ps1`은 이 결과를 `OK` / `ALREADY_RESTORED` / `FAILED`(읽기·설정·확인 실패) / `DRIFT_NOT_RESTORED`로 옮겨 적는다. 계정 삭제·규칙 삭제·작업 폴더 삭제도 삭제 뒤 읽어서 없는지 확인한다. 건드리지 않았거나 실패한 항목이 있으면 종료 코드 40.

## 종료 코드

| 코드 | 뜻                                                                    |
| ---- | --------------------------------------------------------------------- |
| 0    | 정상(dry-run 포함). 검증은 프로브 관측 **그리고** 정리 완료           |
| 10   | 사전 점검에 적용 차단 항목이 있다                                     |
| 20   | 적용 중 실패(되돌림 완료)                                             |
| 21   | 적용 중 실패, 되돌림도 불완전(Remove 결과를 사람이 확인)              |
| 30   | 거부(스냅숏 해시 불일치, 권한 없음, 기록 없음, 이름 충돌 등)          |
| 40   | 복구에서 건드리지 않았거나 실패한 항목이 있다                         |
| 50   | 검증의 사전 조건 실패                                                 |
| 60   | 검증 판정이 `PROBE_ISOLATION_OBSERVED`가 아니다(정리는 완료)          |
| 70   | 검증의 정리가 불완전하다(관측 결과와 무관, 보고서에 둘이 따로 남는다) |

## 시험

- `Test-IsolationScripts.ps1`: 구문, BOM, 구조(상태 변경 명령은 `Invoke-Mutation` 안에서만, `auditpol`은 `Invoke-AuditPol`로만, 모의 시스템이 코드가 부르는 모든 변경 명령을 덮는지), 신원 검증·이벤트 대조·판정·권한 계산의 합성 입력 시험.
- `tests/Test-IsolationFlows.ps1`: 임시 샌드박스에 코드 사본과 `MockSystem.ps1`을 끼워 넣고 진입 스크립트를 **자식 프로세스**로 실행한다. 가짜 시스템의 상태는 샌드박스의 `fake-state.json`이며 단계 사이에 이어진다. 가짜로 대체하지 않은 변경 명령은 호출되면 예외를 던지고, 파일 삭제·복사는 샌드박스 밖이면 막는다. `-CodeDir`로 다른 판의 코드를 가리킬 수 있다(수정 전 코드에서는 지적된 문제 때문에 FAIL이 나오는 것이 정상). `-Only recover-acl,recover-keep,recover-owner`는 복구 쪽 시험만 돌린다(`-File`로 부르면 쉼표 배열이 문자열 하나로 들어가 아무것도 선택되지 않으므로 `-Command "& '…' -Only a,b,c"`로 부른다). 복구 쪽 시험은 `-GrantReadExecute`로 권한을 준 경로 둘이 있는 실행 기록을 쓰고, 시나리오의 손잡이 `aclReadFail`(`aclReadFailMode` = `throw` 또는 `null`)·`testPathThrow`로 읽기·경로 확인 실패를 주입한다. 작업 폴더 `.owner` 읽기 실패 시험은 모의가 아니라 시험 프로세스가 파일을 공유 없이 열어 두는 **진짜 파일 잠금**(공유 위반)을 쓴다.
- 버전 관측 파일(`Test-VersionObservation.ps1`·`version-runner.ps1`·`version-stub.ps1`·`VersionContract.ps1`)은 `Test-IsolationScripts.ps1`에서 **역할별 규칙**을 받는다. 관리자 진입점은 위의 변경 관문 규칙을 그대로 받고 `-Execute` 없이는 첫 `Invoke-Mutation` 앞에서 돌아오는지(dry-run)를 더 본다. 자식 실행기는 고정 모드·인자, 셸 비사용, 환경 제한, 시간·출력 제한, 읽기 예외에서 `eof`를 켜지 않는지를 본다. 스텁은 시나리오 목록 일치와 변경 명령 부재를, 계약 파일은 실행 부작용 없음(최상위는 대입·함수 정의뿐, 부르는 명령은 허용 목록뿐)을 본다. 모든 파일에 같은 규칙을 씌우지 않고, 기존 규칙을 느슨하게 하지도 않는다.
- `tests/Test-VersionRunner.ps1`: `version-runner.ps1`의 제한·정리·환경 격리·거부 경로, 읽기 함수(`-LoadFunctionsOnly`로 함수만 읽어 **가짜 스트림**으로 정상 EOF와 읽기 실패·한도 초과를 구분하는지), `Get-VersionObservationFailures`(합성 결과 표와 진짜 실행기가 남긴 결과), 환경 계약(`New-VersionChildEnv`)을 스텁으로 확인한다. `-TsxCmd`·`-ToolObservationTs`·`-NodeDir`를 주면 실제 TS `parseVersionStdout`과 같은 입력 20개의 결과를 대조하고, `-CliTs`를 더하면 실제 TS `buildVersionChildEnv`(win32/linux)와 환경 이름 집합·값(고정값 포함)·상태 경로를 대조하고 서버 경로의 `buildChildEnv`에는 고정값이 없는지도 본다. 스텁 시나리오 `version-check`는 자식이 실제로 받은 이 변수의 값만 찍어, 요청한 `0`이 도착하고 요청에 없으면 부모 값이 도착하지 않는지를 확인한다. `-PythonExe`(기반 Python)를 주면 `Path.home()`이 전용 `USERPROFILE`을 돌려주는지와, `USERPROFILE`이 없을 때 실제 실패와 같은 오류가 나는지를 본다(`-I -S`, Semgrep 미임포트, 현재 사용자로 실행). 주지 않은 항목은 `SKIPPED`로 표시하고 통과로 세지 않는다.
- `tests/Test-VersionFlows.ps1`: `Test-VersionObservation.ps1`을 `MockSystem.ps1` 위에서 자식 프로세스로 끝까지 실행한다(적용 → 버전 진입점 `-Mode stub -Execute` → 복구). 실행기는 돌리지 않고 모의 `Start-Process`가 실행기가 남길 결과 파일을 시나리오(`runner`의 `set`·`unset` 손잡이)대로 만든다. 읽기 실패·실행기 오류·`streamsClosed=false`·필수 상태 누락·자식 상태 이상이 성공으로 판정되지 않는지, 관측 실패와 정리 실패가 따로 기록되는지, 전용 `USERPROFILE`과 canary 비유출(부모의 `SEMGREP_ENABLE_VERSION_CHECK=1`이 요청에서 고정값 `0`으로 바뀌는지 포함), 복구 때 홈 폴더 삭제를 확인한다. `-CodeDir`로 수정 전 코드를 가리키면 결함이 재현된다(FAIL이 정상). `semgrep-version` 모드만의 사전 조건(해시·ACL)은 덮지 않는다.
- `tests/Test-LspMinRunner.ps1`: 러너를 스텁 시나리오 25개로 끝까지 돌린다(정상·오류·result 안 InitializeError·잘못된 id·키 이름 대소문자(`Id`·`JSONRPC`·`Method`)·분할 프레임·무응답·exit 무시·stdin EOF·시작 직후 종료·깨진 프레임·서버 요청·stderr 중단 문구(분할 포함)·다운로드 문구·진단 알림·작업 영역 쓰기·출력 초과·자손의 파이프 보유·환경 이름·허용 밖 이미지). 거부 경로(고정 인자·경로·환경·한도)가 아무것도 만들거나 띄우지 않는지, `initialized`가 송신되지 않는지, 전용 홈이 실제로 만들어지는지, 강제 종료가 한 번인지를 본다. 가짜 읽기 스트림(`BeginRead`/`EndRead`)으로 stdout·stderr의 읽기 실패(초기화 응답 전·유효한 응답을 받은 뒤)가 `STREAM_READ_FAILED`로 곧바로 끝나고 이후 쓰기가 없는지도 본다. `-TsxCmd`·`-NodeDir`·`-LspMinTs`·`-RunnerResultTs`를 주면 PS 계약과 TS 모듈을 같은 입력으로 대조하고 러너 결과를 TS 기록으로 변환한 결과도 본다. Windows PowerShell 5.1과 PowerShell 7 양쪽에서 돌린다.
- 같은 변경의 TS 쪽 시험은 `scripts/semgrep-lsp/lsp-min*.test.ts`에 있다: 순수 모듈, 가상 시계와 스크립트형 가짜 자식으로 모든 종료 경로를 확인하는 실행기 시험, 러너 결과 변환 시험, 실제 파이프·파일·프로세스 목록을 쓰는 통합 시험(Node를 `semgrep.exe`로 복사한 스텁 서버), 모듈 경계 구조 시험.
- 이 시험들이 **하지 못하는 것:** 실제 `auditpol`·방화벽·계정·`Start-Process -Credential`·Security 로그의 실제 동작을 확인하지 못한다. 모의는 이 동작들을 우리가 이해한 대로 흉내 낸 것이다. 진짜 `Get-Acl`의 **파일·폴더 접근 거부**도 재현하지 못했다(모의는 예외나 빈 값을 주입한 것이고, 이 PC의 관측은 관리자 셸이라 접근 거부가 나오지 않았다).
