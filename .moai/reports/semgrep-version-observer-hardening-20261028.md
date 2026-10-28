# 버전 관측 판정 결함과 Windows 홈 환경 보완 (코드·시험·문서만, 실행 없음)

- 작성일: 2026-10-28
- 기준: PR #36 브랜치 `security/semgrep-lsp-win-isolation`의 HEAD `f099c84c65793a603b2efc8d75fb3a15ed2fee8b` 위의 후속 커밋
- 성격: 수정·모의 검증. **실제 Semgrep을 다시 실행하지 않았고, 계정·방화벽·감사·ACL을 적용하지 않았다.** 시스템 실행 정책도 바꾸지 않았다.
- 기존 실패 보고서 [`semgrep-version-observation-20261027.md`](semgrep-version-observation-20261027.md)는 한 글자도 고치지 않았다. 그 보고서의 `NOT_OBSERVED:NONZERO_EXIT`(홈 위치를 정하지 못해 종료 코드 1)는 기록 그대로 남고, 이 문서의 수정으로 성공으로 바뀌지 않는다.
- **다음 실제 버전 관측은 이 수정본을 검토한 뒤 별도 1회로 진행한다.** 이 보완이 실제 `semgrep.exe --version`에서 `1.180.0`을 낸다는 것은 확인하지 않았다.

## 1. 결론

| 항목 | 결과 | 확인 수준 |
| --- | --- | --- |
| 불완전한 수집이 버전 성공으로 이어지는 결함 | 수정 전 코드에서 진입점 판정까지 재현(수집이 온전하지 않은 10개 사례가 모두 `VERSION_OBSERVED_AS_EXPECTED`·종료 0). 수정 뒤 모두 `NOT_OBSERVED:<토큰>`·종료 60 | 합성(모의 시스템 위에서 진입점을 끝까지 실행) |
| 실행기가 읽기 실패를 EOF로 바꾸던 결함 | 수정 전 읽기 루프 원문으로 재현(`failed=true`인데 `eof=true`, `streamsClosed=true`). 수정 뒤 `readFailed=true`·`eof=false`·`streamsClosed=false` | 합성(가짜 스트림). 진짜 파이프에서 `EndRead` 예외를 만들지는 못했다 |
| Windows 전용 `USERPROFILE` | PS와 TS가 같은 이름 집합을 만든다. 값은 상태 폴더 아래 `home`이며 부모 값은 복사하지 않는다 | 합성 + 실제 Windows에서 기존 Python의 `Path.home()` 확인(Semgrep 미임포트) |
| 새 파일의 구조 검사 | 역할별 규칙 추가. 자체 점검 139 → 188. 심은 위반 12개를 모두 잡음 | 합성 |
| 실제 `semgrep.exe --version`이 `1.180.0`을 내는가 | **관측하지 않았다** | **미확인** |

## 2. 수정 전 재현

### 2.1 진입점 판정 (`tests/Test-VersionFlows.ps1`을 수정 전 코드 `f099c84`에 실행)

모의 시스템 위에서 `Test-VersionObservation.ps1 -Mode stub -Execute`를 자식 프로세스로 끝까지 돌렸다. 모의 `Start-Process`가 실행기가 남길 수 있는 결과 파일을 시나리오대로 만들고, 판정은 진입 스크립트의 진짜 코드가 한다. 파서 단독 시험이 아니다. 결과: **60/140 통과(80건 실패)**.

신원 확인 정상 + 종료 코드 0 + stdout `0.0.0\r\n`인데도 다음이 모두 `STUB_VERSION_OBSERVED_AS_EXPECTED`·종료 코드 0·`versionUsable=true`로 판정됐다.

| 주입한 상태 | 수정 전 |
| --- | --- |
| `stdout.readFailed=true` / `stderr.readFailed=true` | 성공 |
| 실행기 `error`가 비어 있지 않음 | 성공 |
| `streamsClosed=false` | 성공 |
| `streamsClosed` 없음 / `null` | 성공 |
| `stdout.readFailed` 없음 / `stderr` 기록 전체 없음 | 성공 |
| 자식 상태 `RUNNING` | 성공 |
| `stdout.readFailed=true` + `streamsClosed=false` | 성공 |

요청에 적힌 세 가지(읽기 실패, 실행기 오류, 스트림 미종료)에 더해, **필수 상태가 누락되거나 `null`인 경우와 자식이 끝나지 않은 상태도 성공으로 판정**됐다. 관측 실패와 정리 실패가 겹칠 때도 판정 이름이 성공으로 남았다. 정상 대조군(`control`, stderr 경고만 있는 경우)과 기존 동작(`nonzero-exit`, `no-result`)의 핵심 항목(종료 코드·판정·`versionUsable`·정리)은 수정 전에도 통과했다.

### 2.2 실행기 읽기 루프

수정 전 `version-runner.ps1`의 읽기 루프 원문(162~173행)을 그대로 추출해, 첫 `EndRead`가 예외를 던지는 가짜 스트림에 돌렸다(저장소 밖 임시 스크립트, 두 엔진 동일).

| 사례 | stdout | `streamsClosed`(수정 전 계산) |
| --- | --- | --- |
| 데이터 뒤 정상 EOF | `eof=True failed=False`, 8바이트 | True |
| 첫 `EndRead`가 예외 | **`eof=True failed=True`**, 0바이트 | **True** |

읽기 실패가 EOF로 접혀 `streamsClosed=true`가 된다. 실제 이 PC의 이전 실행 기록(`readFailed=False`, `streamsClosed=True`)에서는 정상 종료 때 `EndRead`가 예외 없이 0을 돌려줬으므로, EOF와 실패를 나눠도 정상 실행은 오판정되지 않는다.

### 2.3 TS 환경 계약

수정 전 `buildChildEnv`(win32)는 `USERPROFILE`을 만들지 않아, PS 환경 계약과의 대조 시험이 `이름 집합이 같다`·`USERPROFILE 값이 같다`에서 실패했다(`USERPROFILE TS='' PS='…\version-check-state\home'`).

## 3. 수정 내용

### 3.1 불완전한 수집 (결함 1)

- **판정 한 곳**: `VersionContract.ps1`의 `Get-VersionObservationFailures`(순수 함수). 진입점은 이 함수 하나로 수집 상태·종료 상태·stdout 해석을 판정한다. 정규식·기대 버전·한도는 바꾸지 않았다(`30000ms / 4096B / 16384B / 5000ms`, `["--version"]`, 해석 규칙 그대로).
- **주 토큰 우선순위**(해당하는 토큰은 모두 `failures`에 남긴다): `RUNNER_NO_RESULT` → `RUNNER_REFUSED` → `SPAWN_FAILED` → `RUNNER_ERROR` → `STREAM_READ_FAILED` → `TIMEOUT` → `OUTPUT_LIMIT_EXCEEDED` → `KILLED` → `STREAMS_NOT_CLOSED` → `COLLECTION_STATE_UNKNOWN` → `CHILD_NOT_EXITED` → `NONZERO_EXIT` → `OUTPUT_*`(해석 실패).
- **필수 상태가 없거나 불리언이 아니면 정상으로 보지 않는다**: `streamsClosed`, 두 스트림의 `readFailed`·`overflow`·`b64`, `child`의 `started`·`timedOut`·`outputLimitExceeded`·`killed`, `childState`. 하나라도 빠지면 `COLLECTION_STATE_UNKNOWN`.
- **진단 증거 보존**: 이미 받은 stdout·stderr 바이트는 그대로 저장소 밖 증거 폴더에 쓰고, 보고서의 `execution`에 `readFailed`·`readState`·`readError`·`runnerError`를 남긴다. 수집에 문제가 있어도 받은 stdout을 계약으로 읽어 본 참고 결과(`interpretation.diagnosticParse`, `usable=false`)를 남기되 `versionCandidate`는 비워 둔다.
- **관측과 정리를 따로 기록**: `report.observation`(`established`·`failure`·`failures`)과 `report.cleanup`(`ok`·`items`). 관측이 실패해도 정리는 끝까지 돌고(항목마다 독립 실행·읽어서 확인), 정리가 실패해도 관측 판정을 덮지 않는다. 종료 코드는 기존 그대로(0 성립+정리 완료 / 60 성립하지 않음 / 70 정리 불완전).
- **실행기** (`version-runner.ps1`, 결과 `schema` 2):
  - 정상 EOF는 `EndRead`가 예외 없이 0을 돌려줄 때만이다. `BeginRead`/`EndRead`가 예외를 던지면 `readFailed=true`이고 `eof=false`이며, 기다리지 않고 자식 트리를 끝낸다(`child.streamReadFailed`). 오류 문구는 가장 안쪽 예외의 종류와 문구를 적는다(PowerShell이 `MethodInvocationException`으로 감싸 원인이 가려지던 것을 시험이 잡아 고쳤다).
  - 각 스트림 기록에 `eof`·`state`(`EOF`/`READ_FAILED`/`LIMIT_EXCEEDED`/`OPEN`)·`error`를 더했다. `streamsClosed`는 `Test-StreamsClosed` 한 함수가 정한다.
  - 실행기가 오류로 중간에 끝나도 이미 받은 바이트·읽기 상태·오류를 결과에 쓰고, 아직 하지 않았다면 남은 자손 정리를 이어간다.
  - `-LoadFunctionsOnly`: 함수 정의만 읽고 곧바로 돌아온다(프로세스를 시작하는 코드보다 앞). 시험이 가짜 스트림으로 읽기 함수를 직접 확인하려고 쓴다.

### 3.2 Windows 전용 홈 (`USERPROFILE`)

- 원인 연결(보고서 10-27 5.2절의 해석을 이번에 재현으로 뒷받침): 기존 Python 3.12.9로 `Path.home()`을 `USERPROFILE` 없는 환경에서 부르면 **실제 실패와 같은 오류 `Could not determine home directory.`** 로 실패하고, 전용 `USERPROFILE`을 주면 그 값을 돌려준다(`python.exe -I -S`, Semgrep 미임포트).
- 환경 이름 집합(PS `New-VersionChildEnv` = TS `buildChildEnv`(win32)): `PATH`·`SYSTEMROOT`·`TEMP`·`TMP` + **`USERPROFILE`** + `SEMGREP_APP_URL`/`METRICS_URL`/`VERSION_CHECK_URL` + `SEMGREP_LOG_FILE`/`SETTINGS_FILE`/`VERSION_CACHE_PATH`. `HOME`·`HOMEDRIVE`·`HOMEPATH`·`APPDATA`는 근거가 없어 주지 않는다(Python의 Windows `Path.home()`은 `USERPROFILE` 하나면 된다). 값의 출처만 다르다(PS는 `PATH`를 Windows 폴더로 고정하고 `TEMP`/`TMP`를 작업 폴더 안에 둔다).
- 값: 부모 환경에서 복사하지 않고 그 실행의 **상태 폴더 아래 `home`**.
  - PS: 작업 폴더 `work\state\home`. 진입점이 `tmp`·`state`와 같은 자리에서 `Invoke-Mutation`으로 만든다. 복구가 작업 폴더를 `.owner` 확인 뒤 통째로 지울 때 함께 지워진다(흐름 시험이 복구 뒤 부재를 확인).
  - TS: `version-check-state\home`(버전 확인)과 `semgrep-state\home`(LSP 서버)을 따로 쓴다 — 상태의 기존 분리를 유지. 상태 폴더를 만드는 자리(`runToolObservation`, `cli.ts`의 두 표지 생성 자리)에서 같이 만들고, 음성 대조의 쓰기 경로 검사(`plannedOutputs`)에 같은 상수(`CHILD_HOME_DIR`)로 들어 있다. 새 증거 폴더 안이라 기존 경로 보호와 같은 범위다.
  - Linux는 예전과 같다(`USERPROFILE` 없음, `PATH`·`HOME` 복사, 홈 폴더를 만들지 않음).
- 부모의 `USERPROFILE`·토큰·프록시는 복사하지 않는다(이름도 값도). 실행기가 `EnvironmentVariables.Clear()` 뒤 요청의 값만 채우는 방식은 그대로다.

### 3.3 새 파일의 구조 검사 (`Test-IsolationScripts.ps1`)

기존 규칙은 하나도 느슨하게 하지 않았다. 관리자 진입점은 오히려 기존 "변경 명령은 `Invoke-Mutation` 안에서만"·".NET 쓰기 위치"·"모의 시스템이 변경 명령을 덮는다" 규칙의 대상에 새로 들어갔다(그 과정에서 `New-Item`을 모의가 덮지 않는 틈이 드러나, 샌드박스 밖 폴더 만들기를 거부하는 모의 `New-Item`을 더했다). 역할마다 더한 규칙:

| 파일 | 더한 규칙 |
| --- | --- |
| 관리자 진입점 `Test-VersionObservation.ps1` | `-Execute` 없으면 `NOT_EXECUTED`로 돌아오고 그 분기가 첫 `Invoke-Mutation`보다 앞(AST 위치 비교), `-Execute`는 `[bool]`로 넘어가 `ApplyMode`를 켠다, 실제 모드 한도는 계약 값에 고정(다르면 30), 자식 환경은 `New-VersionChildEnv`로만(`$env:`는 `WINDIR` 하나), 판정은 계약 함수 한 곳, 성공은 신원·실패 없음·버전이 모두 있을 때만, 정리 불완전이면 70이고 정리는 항목마다 독립(4곳 이상), 관측·정리를 따로 기록 |
| 자식 실행기 `version-runner.ps1` | `Stop-Process` 외 변경 명령 없음, .NET 쓰기는 `Write-ResultFile` 안에서만, mode 둘뿐이고 그 밖은 거부, `semgrep.exe` 이름·절대 경로·인자 `["--version"]` 고정, 셸 비사용(`UseShellExecute=$false`, `cmd /c`·`Start-Process`·`Invoke-Expression` 없음), `EnvironmentVariables.Clear()`가 첫 대입보다 앞이고 `$env:`는 `WINDIR` 하나, 한도 네 개 검증, 시간·출력·읽기 실패 때 트리 종료, **읽기 예외(catch) 안에서 `eof`를 켜지 않음**, `eof`를 켜는 곳은 한 곳뿐, `streamsClosed`는 한 함수가 정함, `-LoadFunctionsOnly`는 프로세스 시작보다 앞에서 돌아옴 |
| 스텁 `version-stub.ps1` | 시나리오 목록이 스텁·실행기·진입점에서 같음, 변경 명령·파일 쓰기 없음, 읽는 환경 변수는 `SYSTEMROOT`·`USERPROFILE`뿐, 프로세스 시작은 고정 인자 자손 하나 |
| 계약 `VersionContract.ps1` | 최상위는 대입과 함수 정의뿐(불러오기만으로 실행되는 것 없음), 부르는 명령은 `New-Object`·`Join-Path`·자기 함수뿐, `New-Object`는 인코딩·목록만, 파일·프로세스·네트워크·환경 접근 없음, `$Script:` 대입은 상수 둘뿐 |

README의 명령 예시는 실제로 쓴 `-ExecutionPolicy RemoteSigned`로 바꿨다. 시스템 실행 정책은 변경하지 않았다. 프로브를 띄우는 코드 안의 프로세스 범위 `Bypass`(`IsolationFlows.ps1:306`, `probe-parent.ps1:26`)와 `Invoke-IsolationPreflight.ps1` 머리말의 예시 주석은 이번 요청 범위 밖이라 바꾸지 않았다.

## 4. 시험 결과 (실제 Windows · 합성 · 미검증을 구분)

| 구분 | 시험 | 결과 |
| --- | --- | --- |
| **합성(모의 시스템, 진입점 판정)** | `tests/Test-VersionFlows.ps1` — 수정 전 코드 `f099c84` | 60/140 (재현, 실패가 정상) |
| 합성(모의 시스템, 진입점 판정) | 같은 시험 — 수정 후, 자식 엔진 pwsh / Windows PowerShell 5.1 | 각 140/140 |
| 합성(가짜 스트림·합성 결과) | `tests/Test-VersionRunner.ps1` (가짜 스트림으로 읽기 함수 직접 확인, 판정 함수 합성 표, 진짜 실행기 결과 → 판정, 환경 계약, TS 대조) — pwsh 7.6.9 / 5.1 | 각 164/164, 건너뜀 0 |
| **실제 Windows(이 PC)** | 기존 Python 3.12.9(`-I -S`, 현재 관리자 사용자로 실행, Semgrep 미임포트)로 `Path.home()`: 전용 `USERPROFILE` 주면 그 값, 없으면 `Could not determine home directory.` | 통과 (양성·음성 대조군) |
| 합성(TS 대조) | tsx로 실제 `buildChildEnv`(win32/linux)를 실행해 PS 환경 계약과 이름 집합·`USERPROFILE`·상태 경로 대조 | 통과 |
| 합성(TS 단위·통합) | `scripts/semgrep-lsp` 전체 vitest (이번에 8개 추가: `buildChildEnv`·`childHomeDir` 5, 관측 2, CLI 흐름 Windows 1 + Linux 대조 보강) | 61파일 2721 통과, 8 건너뜀 |
| 정적 | tsc(프로젝트 전체) / eslint(변경 TS) / prettier(변경 TS·MD) | tsc는 기존 `app/layout.tsx` 1건뿐(이번 변경과 무관), eslint·prettier 통과 |
| 파일·구조 점검 | `Test-IsolationScripts.ps1` — pwsh / 5.1 | 각 188/188 (기존 139) |
| 구조 점검의 유효성 | 임시 복사본에 위반 12개를 심어 검사(catch에서 eof, 셸 사용, 환경 Clear 제거, 허용 밖 mode, `streamsClosed` 직접 계산, 허용 밖 파일 쓰기, 변경 관문 밖 계정 켜기, 판정 인라인, 부모 `USERPROFILE` 읽기, 계약 최상위 명령, 계약 파일 읽기, 시나리오 목록 어긋남) | 12/12 잡힘 (대규모 변이 점검은 아님) |
| 합성(기존 흐름 시험, 모의 시스템 변경 확인) | `tests/Test-IsolationFlows.ps1` — 자식 엔진 5.1 / pwsh | 각 162/162 |

## 5. 동작이 바뀌는 곳 (주의)

- **더 엄격해졌다**: 자식이 종료 코드 0과 정상 stdout으로 끝나도, 자손이 파이프를 쥐고 있어 EOF를 보지 못하면(`streamsClosed=false`) 이제 `STREAMS_NOT_CLOSED`로 사용 불가다. 수정 전에는 성공으로 판정됐다. 정리(남은 자손 종료)는 그대로 일어난다(`orphan` 시나리오로 확인). 실제 `semgrep.exe --version`이 자손(`semgrep-core.exe`·`pysemgrep.exe`)을 남기고 끝나는지는 모른다. 10-27 실행에서는 `streamsClosed=true`였다.
- 보고서에 `schema 2` 실행기 결과 필드(`eof`·`state`·`error`·`child.streamReadFailed`)와 `report.observation`이 늘었다. 기존 필드는 그대로다.
- 수정은 판정을 엄격하게 하는 방향뿐이다. 실패 기록을 성공으로 바꾸거나 stdout 해석 계약을 바꾸는 변경은 없다.

## 6. 하지 않은 것, 한계, 남은 위험

- **실제 `semgrep.exe`를 실행하지 않았다.** 어떤 계정·방화벽·감사·ACL도 적용하지 않았다. `pin.json`·`verified`·`policy_accepted`·보안 게이트·ADR 상태, 다른 PR·`main`·`bodam`은 바꾸지 않았다.
- 진입점 판정의 모의 시험은 **stub 모드**로 했다. `semgrep-version` 모드만의 사전 조건(해시·ACL 확인)은 흐름 시험이 덮지 않는다. 판정 코드는 모드와 무관한 같은 경로이고 `STUB_` 접두만 붙는다.
- 모의 실행기는 실행기를 흉내 낸 결과 파일을 만든다. **진짜 실행기가 진짜 파이프에서 읽기 실패를 만나는 경우는 만들지 못했다**(가짜 스트림으로 함수를 직접 확인했을 뿐이다).
- 기존 Python 확인은 현재 관리자 사용자로 한 것이다. 전용 계정·격리 규칙 안에서의 `Path.home()`은 확인하지 않았다. `USERPROFILE` 폴더를 전용 계정이 쓸 수 있는지는 작업 폴더의 상속 ACL에 기대며(`tmp`·`state`와 같은 방식, 10-27 실행에서 `tmp`는 실제로 쓰였다) 새 폴더에 대해 따로 관측하지 않았다.
- `semgrep.exe --version`이 `HOME` 없이 `USERPROFILE`만으로 충분한지는 Python의 `Path.home()` 수준에서만 확인했다. Semgrep이 `Path.home()` 말고 다른 위치(예: `APPDATA`, `LOCALAPPDATA`)를 요구하는지는 모른다 — 요구하면 다음 관측의 오류로 드러나고, 근거 없이 미리 주지 않았다.
- 5157·루프백 관측의 한계(0건은 외부 통신이 없었다는 증거가 아님, DNS·UDP·ICMP·IPv6 미관측)는 10-27 보고서 그대로다.
- TS 하네스의 Windows 실제 디스크 실행(상태 폴더·`home` 생성)은 하지 않았다(메모리 파일시스템과 vitest 통합 시험까지).
- 이미 커밋된 `Test-IsolationScripts.ps1`의 합성 감사 CSV 줄에 이 PC의 컴퓨터 이름이 들어 있는 것(10-28 재확인 보고서 10절)은 고치지 않았다.

## 7. 소유자 결정이 필요한 것

- 다음 실제 `semgrep.exe --version` 관측을 이 수정본으로 별도 1회 진행할지(이번에는 하지 않았다).
- `STREAMS_NOT_CLOSED`를 사용 불가로 두는 엄격한 기준(5절 첫 항목)을 유지할지. 자손이 파이프를 쥐는 정상 동작이 확인되면 기준을 다시 논의해야 한다.
