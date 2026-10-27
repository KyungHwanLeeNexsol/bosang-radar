# Windows 격리 준비 스크립트 (Semgrep LSP 다음 실행 전 단계)

실제 도구를 처음 실행하기 전에, 그 실행이 나가는 통신을 OS 수준에서 막고 그 사실을 관측할 수 있는 환경을 만드는 스크립트 묶음이다. **이 묶음의 적용·실행 경로는 실제 Windows에서 한 번도 실행되지 않았다.** 아래 "확인 수준"을 먼저 읽는다. 배경과 근거 구분은 `.moai/reports/semgrep-win-isolation-plan-20261027.md`에 있다.

## 확인 수준

실제 Windows에서 확인한 것과 모의(합성) 시험으로 확인한 것을 구분한다. 모의 시험의 통과는 "가짜 시스템 위에서 흐름이 의도대로 동작한다"까지만 뜻한다.

| 구분                        | 한 일                                                                                                                                                                                 | 결과                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **실제 Windows(이 PC)**     | 읽기 전용 사전 점검 실행(진짜 `auditpol /backup`·방화벽·계정·ACL 읽기)                                                                                                                | 통과(적용 차단 항목 없음)                                                |
| **실제 Windows(이 PC)**     | 변경 스크립트의 dry-run, 거부 경로(`-Apply` 없음, 틀린 스냅숏 해시), 실행 기록이 없을 때의 검증(50), 대상 없는 복구(30), 복구 dry-run, `-Discover`                                    | 기대한 종료 코드. 아무것도 바뀌지 않음                                   |
| **실제 Windows(이 PC)**     | 위 실행 전후의 방화벽 규칙(688개)·로컬 계정·감사 값·ACL 비교                                                                                                                          | 동일                                                                     |
| 파일·메모리 점검            | `Test-IsolationScripts.ps1`: 구문, BOM, 구조(변경 호출 위치), 신원 검증·이벤트 대조·판정·권한 계산의 합성 입력 시험                                                                   | pwsh 7.6.9와 Windows PowerShell 5.1에서 각각 139/139                     |
| **합성(모의 시스템)**       | `tests/Test-IsolationFlows.ps1`: 적용 → 검증 → 복구 진입 스크립트를 가짜 시스템 위에서 끝까지 실행(정상 대조군, 신원 불일치 12종, 이전 결과 파일, 감사·계정 정리 실패, 이벤트 0건 등) | 자식 엔진 5.1과 pwsh 각각 115/115                                        |
| **합성(모의 시스템)**       | 같은 시험을 수정 전 코드(`06825e1`)에 실행                                                                                                                                            | 50/69 — 지적된 문제가 그대로 재현된다(실패가 나오는 것이 정상)           |
| **실행하지 않았다(미확인)** | 실제 계정 생성, 방화벽 규칙, 감사 정책, ACL 변경, 전용 계정으로 프로브 실행(`-Apply`/`-Execute` 경로), 그 격리 효과                                                                   | **미확인.** 이 경로를 실제 Windows에서 처음 실행할 때 나올 오류는 모른다 |
| 실행하지 않았다             | `semgrep` 계열(`--version` 포함)                                                                                                                                                      | 이 묶음에는 호출하는 곳이 없고 자체 점검이 검사한다                      |

## 파일

| 파일                                  | 역할                                                                                                                              | 상태를 바꾸나                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `IsolationCommon.ps1`                 | 공용 함수(점 읽기 전용). 변경 관문 `Invoke-Mutation`, 신원 검증, 이벤트 대조·판정, 감사 창, 정리 결과, 실행 기록                  | 불러오기만으로는 아니다                   |
| `IsolationFlows.ps1`                  | 적용·검증·복구의 본문(`Invoke-IsoApply`/`Invoke-IsoVerify`/`Invoke-IsoRecover`). 진입 스크립트는 이것을 부르고 종료 코드로 끝난다 | 불러오기만으로는 아니다                   |
| `Invoke-IsolationPreflight.ps1`       | 현재 설정을 읽어 스냅숏으로 보관                                                                                                  | 아니다(RunDir에 기록만 쓴다)              |
| `Initialize-Isolation.ps1`            | 전용 계정 + 계정 범위 아웃바운드 차단 규칙 + (선택) 경로 읽기·실행 권한                                                           | `-Apply`일 때만                           |
| `Test-IsolationEffect.ps1`            | 무해한 부모→자식 프로브로 차단·루프백을 관측, 신원 교차 확인, 5157 대조, 정리                                                     | `-Execute`일 때만(감사 창·계정 사용 켜기) |
| `Get-IsolationEvidence.ps1`           | 임의 실행의 프로세스 기록으로 5157을 대조(읽기 전용)                                                                              | 아니다                                    |
| `Remove-Isolation.ps1`                | 이 실행이 만든 것만 소유 확인 후 되돌림. `-Discover`로 남은 것 찾기                                                               | `-Apply`일 때만                           |
| `probe-parent.ps1`, `probe-child.ps1` | 전용 계정으로 실행되는 무해한 프로브(TCP 연결 시도만, 이번 실행의 `runToken`을 파일에 적는다)                                     | 아니다                                    |
| `Test-IsolationScripts.ps1`           | 자체 점검(구문·BOM·구조·논리). 시스템을 읽지도 바꾸지도 않는다                                                                    | 아니다                                    |
| `tests/MockSystem.ps1`                | 모의 시스템(계정·방화벽·감사·ACL·프로세스·Security 로그를 흉내). 시험 전용이며 운영 스크립트는 읽지 않는다                        | 아니다(샌드박스 안에서만)                 |
| `tests/Test-IsolationFlows.ps1`       | 모의 시스템 위에서 적용·검증·복구 진입 스크립트를 끝까지 돌리는 흐름 시험                                                         | 아니다(임시 샌드박스 안에서만)            |

모든 `.ps1`은 UTF-8 BOM으로 저장한다(Windows PowerShell 5.1이 BOM 없는 UTF-8을 ANSI로 읽어 한글이 깨지기 때문). `.gitattributes`의 `eol=lf`와 함께 둔다.

## 순서와 명령

관리자 권한 PowerShell에서 실행한다. 스크립트 폴더로 이동한 뒤 `powershell.exe`(5.1)로 부른다.

```powershell
$d = '<저장소>\scripts\semgrep-lsp-isolation\windows'
$ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"

# 0. 자체 점검과 흐름 시험 (시스템을 건드리지 않는다)
& $ps -NoProfile -ExecutionPolicy Bypass -File "$d\Test-IsolationScripts.ps1"
& pwsh -NoProfile -File "$d\tests\Test-IsolationFlows.ps1" -Engine powershell      # 자식 엔진: powershell(5.1) 또는 pwsh

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
- `tests/Test-IsolationFlows.ps1`: 임시 샌드박스에 코드 사본과 `MockSystem.ps1`을 끼워 넣고 진입 스크립트를 **자식 프로세스**로 실행한다. 가짜 시스템의 상태는 샌드박스의 `fake-state.json`이며 단계 사이에 이어진다. 가짜로 대체하지 않은 변경 명령은 호출되면 예외를 던지고, 파일 삭제·복사는 샌드박스 밖이면 막는다. `-CodeDir`로 다른 판의 코드를 가리킬 수 있다(수정 전 코드에서는 지적된 문제 때문에 FAIL이 나오는 것이 정상).
- 이 시험들이 **하지 못하는 것:** 실제 `auditpol`·방화벽·계정·`Start-Process -Credential`·Security 로그의 실제 동작을 확인하지 못한다. 모의는 이 동작들을 우리가 이해한 대로 흉내 낸 것이다.
