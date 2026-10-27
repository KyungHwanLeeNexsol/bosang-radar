# Windows 격리 준비 스크립트 (Semgrep LSP 다음 실행 전 단계)

실제 도구를 처음 실행하기 전에, 그 실행이 나가는 통신을 OS 수준에서 막고 그 사실을 관측할 수 있는 환경을 만드는 스크립트 묶음이다. **이 묶음은 아직 한 번도 적용·실행되지 않았다.** 아래 "확인 수준"을 먼저 읽는다. 배경과 근거 구분은 `.moai/reports/semgrep-win-isolation-plan-20261027.md`에 있다.

## 확인 수준

| 한 일                                                                                            | 결과                                                                               |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 구문 점검 + 구조 점검 + 합성 입력 논리 시험(`Test-IsolationScripts.ps1`)                         | pwsh 7.6.9와 Windows PowerShell 5.1에서 각각 90/90 통과                            |
| 읽기 전용 사전 점검(`Invoke-IsolationPreflight.ps1`) 실행                                        | 통과(적용 차단 항목 없음). 실행 전후 방화벽 규칙·계정·감사 값·ACL 동일             |
| 변경 스크립트의 dry-run, 거부 경로(`-Apply` 없음, 스냅숏 해시 불일치)                            | 실행해 확인. 아무것도 바뀌지 않음                                                  |
| 계정 생성, 방화벽 규칙, 감사 정책, ACL 변경, 전용 계정으로 프로브 실행(`-Apply`/`-Execute` 경로) | **실행하지 않았다.** 이 경로의 동작과 격리 효과는 미확인이다                       |
| `semgrep` 계열 실행                                                                              | 하지 않았다(`--version` 포함). 이 묶음에는 호출하는 곳이 없고 자체 점검이 검사한다 |

## 파일

| 파일                                  | 역할                                                                                       | 상태를 바꾸나                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `IsolationCommon.ps1`                 | 공용 함수(점 읽기 전용). 변경 관문 `Invoke-Mutation`, 이벤트 대조·판정, 감사 창, 실행 기록 | 불러오기만으로는 아니다                   |
| `Invoke-IsolationPreflight.ps1`       | 현재 설정을 읽어 스냅숏으로 보관                                                           | 아니다(RunDir에 기록만 쓴다)              |
| `Initialize-Isolation.ps1`            | 전용 계정 + 계정 범위 아웃바운드 차단 규칙 + (선택) 경로 읽기·실행 권한                    | `-Apply`일 때만                           |
| `Test-IsolationEffect.ps1`            | 무해한 부모→자식 프로브로 차단·루프백을 관측, 5157 대조                                    | `-Execute`일 때만(감사 창·계정 사용 켜기) |
| `Get-IsolationEvidence.ps1`           | 임의 실행의 프로세스 기록으로 5157을 대조(읽기 전용)                                       | 아니다                                    |
| `Remove-Isolation.ps1`                | 이 실행이 만든 것만 소유 확인 후 되돌림. `-Discover`로 남은 것 찾기                        | `-Apply`일 때만                           |
| `probe-parent.ps1`, `probe-child.ps1` | 전용 계정으로 실행되는 무해한 프로브(TCP 연결 시도만)                                      | 아니다                                    |
| `Test-IsolationScripts.ps1`           | 자체 점검(구문·BOM·구조·논리). 시스템을 읽지도 바꾸지도 않는다                             | 아니다                                    |

모든 `.ps1`은 UTF-8 BOM으로 저장한다(Windows PowerShell 5.1이 BOM 없는 UTF-8을 ANSI로 읽어 한글이 깨지기 때문). `.gitattributes`의 `eol=lf`와 함께 둔다.

## 순서와 명령

관리자 권한 PowerShell에서 실행한다. 스크립트 폴더로 이동한 뒤 `powershell.exe`(5.1)로 부른다.

```powershell
$d = '<저장소>\scripts\semgrep-lsp-isolation\windows'
$ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"

# 0. 자체 점검 (시스템을 건드리지 않는다)
& $ps -NoProfile -ExecutionPolicy Bypass -File "$d\Test-IsolationScripts.ps1"

# 1. 읽기 전용 사전 점검 → RunDir, ConfirmSnapshot(12자리)이 출력된다
& $ps -NoProfile -ExecutionPolicy Bypass -File "$d\Invoke-IsolationPreflight.ps1"

# 2. 적용 계획 보기 (dry-run: 아무것도 만들지 않는다)
& $ps -NoProfile -ExecutionPolicy Bypass -File "$d\Initialize-Isolation.ps1" -PreflightDir <RunDir> `
      -GrantReadExecute "<가상환경 폴더>,<기반 Python 폴더>"

# 3. 적용 — 소유자 승인 뒤에만. 사전 점검 스냅숏을 검토했다는 표시로 ConfirmSnapshot을 넘긴다
& $ps -NoProfile -ExecutionPolicy Bypass -File "$d\Initialize-Isolation.ps1" -PreflightDir <RunDir> `
      -ConfirmSnapshot <12자리> -Apply -GrantReadExecute "<가상환경 폴더>,<기반 Python 폴더>"

# 4. 효과 관측 계획 보기 → 실행 (실행도 소유자 승인 뒤에만)
& $ps -NoProfile -ExecutionPolicy Bypass -File "$d\Test-IsolationEffect.ps1" -RunDir <RunDir>
& $ps -NoProfile -ExecutionPolicy Bypass -File "$d\Test-IsolationEffect.ps1" -RunDir <RunDir> -Execute

# 5. 되돌리기 (정상 종료·실패·중단 모두 같은 명령)
& $ps -NoProfile -ExecutionPolicy Bypass -File "$d\Remove-Isolation.ps1" -RunDir <RunDir>           # dry-run
& $ps -NoProfile -ExecutionPolicy Bypass -File "$d\Remove-Isolation.ps1" -RunDir <RunDir> -Apply [-RemoveProfile]
```

`-File`로 부르면 배열 인자는 쉼표로 이어 한 문자열로 넘긴다(스크립트가 쉼표로 나눈다). 경로에 쉼표가 있으면 쓸 수 없다.

## 적용(`Initialize-Isolation.ps1 -Apply`)이 만드는 것과 예상 영향

| 자원            | 이름·위치                                                    | 영향                                                                                                                            |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 로컬 계정       | `bsi<8hex>`(설명 표식 `bosang-semgrep-iso:<RunId>`)          | Users 그룹만, 비관리자. 만든 직후 비활성화. 무작위 암호는 현재 사용자 DPAPI로 `credential.dpapi`에만 보관                       |
| 작업 폴더       | `%ProgramData%\bosang-semgrep-iso\<RunId>`                   | 상속을 끊고 SYSTEM·Administrators 전체, 새 계정 수정. `.owner` 표식 파일                                                        |
| 경로 권한(선택) | `-GrantReadExecute`로 지정한 경로                            | **기존 ACL에 새 계정 SID 한 건**(읽기·실행, 상속)만 추가. 사용자 프로필 아래 Python·가상환경은 기본 ACL에 Users가 없어 필요하다 |
| 방화벽 규칙     | `bosang-semgrep-iso-<RunId>-out`(Group `bosang-semgrep-iso`) | 아웃바운드 Block, `LocalUser` 조건 = 새 계정 SID, 원격 주소는 루프백 제외. 꺼진 채 만들어 범위를 읽어 확인한 뒤 켠다            |

바꾸지 않는 것: 기존 계정, 기존 방화벽 규칙, 방화벽 프로필 기본 정책(`Set-NetFirewallProfile`을 부르는 곳이 없고 자체 점검이 검사한다), 감사 정책(적용 단계에서는 안 건드린다).

## 검증(`Test-IsolationEffect.ps1 -Execute`)이 하는 일과 영향

- 감사 하위 범주 "Filtering Platform Connection"의 **실패** 감사를 이 실행 동안만 켠다. 켜기 직전에 `auditpol /backup`으로 원래 값을 새로 읽어 실행 기록에 적고, 끝나면 **우리가 바꾼 값일 때만** 원래 값으로 되돌린다(그 사이 다른 값이 되었으면 건드리지 않고 `drift-not-restored`로 보고). `-IncludeProcessCreationAudit`를 주면 "Process Creation" 성공 감사(이벤트 4688)도 같은 방식으로 켠다. **이 스크립트는 4688을 읽어 대조하지 않는다.** 사람이 PID·계정을 교차 확인할 때 쓸 OS 기록만 남긴다.
- 전용 계정을 켜고(끝나면 끈다) 부모 `powershell.exe` → 자식 `powershell.exe`를 `Start-Process -Credential`로 띄운다. 프로세스 실행 정책은 프로세스 범위의 `-ExecutionPolicy Bypass`만 쓴다(시스템 정책을 바꾸지 않는다). 이때 `C:\Users\bsi<8hex>` 프로필 폴더가 생길 수 있다(`-RemoveProfile`로 정리).
- 연결 시도 두 가지: `127.0.0.1:<임시 수신기>`(허용 기대), `192.0.2.1:9`(RFC 5737 문서용 주소, 차단 기대). 선택 `-IncludeSelfAddressProbe`는 이 PC의 비루프백 주소에 수신기를 연다(Windows 방화벽 앱 허용 대화상자가 뜰 수 있어 기본 꺼짐).
- 보고는 항목을 섞지 않는다: **[A]** 연결 시도 결과, **[B]** 루프백 수신기 수신 건수, **[C]** OS 차단 관측(5157 대조), **[D]** 판정.

### 판정 기준

| 판정                          | 뜻                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `OS_BLOCK_OBSERVED`           | 연결이 실패했고, 5157 이벤트가 PID·실행 파일 경로·시각 구간·목적지까지 이번 실행과 맞았다                                                       |
| `FAILED_WITHOUT_OS_EVIDENCE`  | 연결은 실패했지만 맞는 5157이 없다. **차단이라고 쓰지 않는다**                                                                                  |
| `FAILED_EVIDENCE_UNAVAILABLE` | 로그를 못 읽었거나 실패 감사가 꺼져 있었거나 기준점 이후 로그가 밀렸거나 알 수 없다. **0건이 아니다**                                           |
| `NOT_BLOCKED`                 | 차단 기대인데 연결됐다                                                                                                                          |
| `ALLOWED_AS_EXPECTED`         | 루프백 연결 성공                                                                                                                                |
| `UNEXPECTEDLY_FAILED`         | 허용 기대인데 실패(규칙이 루프백까지 막았을 수 있음)                                                                                            |
| `PROBE_ISOLATION_OBSERVED`    | 최종: 루프백 허용 + 외부 예약 주소 `OS_BLOCK_OBSERVED` + 루프백 수신 1건 이상 + 프로세스 소유 SID 일치. **이 프로브 두 종류에 한정된 관측**이다 |

최종 판정이 `PROBE_ISOLATION_OBSERVED`여도 semgrep·`semgrep-core`·가상환경 `python`·UDP·ICMP·IPv6·DNS로 일반화하지 않는다.

## 실패·중단 후 복구

| 상황                                   | 하는 일                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 적용 도중 오류                         | `Initialize-Isolation.ps1`이 이 실행이 만든 것만 `Remove-Isolation.ps1 -Apply`로 되돌리고 종료 코드 20                           |
| 검증 도중 오류·Ctrl+C                  | `Test-IsolationEffect.ps1`의 `finally`가 수신기 정지, 남은 프로브 종료, 계정 비활성화, 감사 창 닫기를 한다                       |
| 프로세스가 강제 종료됨·전원 차단       | `Remove-Isolation.ps1 -RunDir <RunDir> -Apply`. 실행 기록의 `intent` 단계는 이름으로 찾아 소유 확인 뒤 정리한다                  |
| 실행 기록이 없다(적용 첫 줄 전에 죽음) | `Remove-Isolation.ps1 -Discover`로 접두 자원을 찾고 `-RunId <RunId> -Apply`. 감사 정책·ACL은 기록이 없어 복구하지 못한다(보고됨) |

복구의 소유 확인: 방화벽 규칙은 이름 + Group + 설명 표식, 계정은 이름 + 표식 + 기록된 SID, 작업 폴더는 위치 + `.owner` 내용, ACL은 기록된 계정 SID의 ACE만, 감사는 `set` 값일 때만. 하나라도 다르면 `REFUSED_NOT_OURS`(또는 `DRIFT_NOT_RESTORED`)로 남기고 건드리지 않는다. 이미 없으면 `SKIPPED_ABSENT`. 건드리지 않았거나 실패한 항목이 있으면 종료 코드 40.

## 종료 코드

| 코드 | 뜻                                                           |
| ---- | ------------------------------------------------------------ |
| 0    | 정상(dry-run 포함)                                           |
| 10   | 사전 점검에 적용 차단 항목이 있다                            |
| 20   | 적용 중 실패(되돌림 시도함)                                  |
| 30   | 거부(스냅숏 해시 불일치, 권한 없음, 기록 없음, 이름 충돌 등) |
| 40   | 복구에서 건드리지 않았거나 실패한 항목이 있다                |
| 50   | 검증의 사전 조건 실패                                        |
| 60   | 검증 판정이 `PROBE_ISOLATION_OBSERVED`가 아니다              |
