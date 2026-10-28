# 전용 계정에서 `semgrep --version` 세 번째 관측: 온라인 최신 버전 조회를 끈 조건

- 작성일: 2026-10-28
- 기준: PR #36 브랜치 `security/semgrep-lsp-win-isolation`의 HEAD `b9bf68193e949c14d20a85246b68bf538dae1412` 위의 후속 커밋. 실행한 코드는 커밋 `b95e9e3fbde31298d0acc0cdf9ef99eb05b822fb`(환경 고정값 추가)와 같다. 그 뒤 문서 커밋에서 진입점 설명 주석과 정적 점검 한 항목을 더했고, 실행 코드는 바꾸지 않았다.
- 성격: 10-27(예외 종료), 10-28(30초 한도 `TIMEOUT`)에 이은 세 번째 실제 관측이다. **이전 두 실행과 다른 점은 버전 관측 자식의 환경에 `SEMGREP_ENABLE_VERSION_CHECK=0`을 고정값으로 더한 것 하나뿐이다.** 새 RunId로 격리 환경을 새로 적용한 안에서 설치된 `semgrep.exe`를 전용 비관리자 계정으로 `["--version"]` 한 번 실행하고 모두 복구했다.
- **결과: 버전 문자열 `1.180.0`을 관측했다.** 종료 코드 0, 소요 14.7초, stdout 9바이트(`1.180.0` + CRLF), stderr 0바이트. 판정은 `VERSION_OBSERVED_AS_EXPECTED`(관측 성립, 버전 후보가 기대값과 같음), 정리와 복구는 끝났고 직접 읽어 확인했다.
- **이 결과는 "온라인 최신 버전 조회를 끈 조건에서 한 번 관측한 결과"다.** 이전 시간 초과의 원인이 그 조회였다는 증거가 아니다(8절). 이 결과를 배포물의 공개 소스 대응, 핀 검증, 배포물 신뢰, 전체 격리, 보안 게이트 통과로 읽지 않는다. `pin.json`·`verified`·`policy_accepted`·ADR 상태는 바꾸지 않았다.
- 관측 판정과 정리 결과는 따로 적는다. 둘 다 성립했다.

## 1. 결론

| 항목 | 결과 | 확인 수준 |
| --- | --- | --- |
| 중복 실행 여부 | 작업 트리가 깨끗하고 원격 HEAD가 지시된 `b9bf681`과 같으며, 10-28 이후 새 RunId·`bsi*` 계정·규칙이 없었다. 이번 관측을 이미 수행한 흔적이 없어 실행했다 | 확인 |
| 조건 변경 | 버전 관측 자식 환경에만 `SEMGREP_ENABLE_VERSION_CHECK=0`(문자열 상수, 부모 환경에서 읽지 않음)을 더했다. 서버(LSP) 경로와 `precheck.ts` 허용 목록은 그대로다 | 확인(코드·시험) |
| 모의 검증 | 수정 전 실패 확인 후 통과: 정적 점검 191/191, 흐름 141/141(두 엔진), 실행기 169/169(두 엔진, 건너뜀 0), `scripts/semgrep-lsp` 61파일 2729 통과·8 건너뜀. 모두 스텁·모의 시스템·합성 입력이며 실제 Semgrep은 실행하지 않았다 | 확인 |
| 실행 전 확인 | 원본 휠·`semgrep.exe`·`semgrep-core.exe`의 SHA-256이 PR #35 보고서의 전체 값과 일치. 나머지 해시·ACL·파일 수·방화벽 규칙 이름 집합·계정·프로필·감사 값은 10-28 복구 후 기록과 같다 | 확인 |
| 격리 구성 | 적용 직후 계정·규칙·작업 폴더 ACL·두 폴더의 ACE·전용 홈 위치를 직접 다시 읽어 17개 항목 모두 통과한 뒤 실행 | 확인 |
| `semgrep.exe --version` | 종료 코드 0, 14,702ms, stdout `1.180.0\r\n`(9B), stderr 0B, `streamsClosed=true`, 두 스트림 `readFailed=false` | 확인(1회 관측) |
| 신원 교차 확인 | 통과(실패 0). 실행기·`semgrep.exe` 모두 소유 SID가 전용 계정이고 실행 파일·명령줄이 요청과 일치 | 확인 |
| 루프백 수신 / 5157 | 수신 0건 / 이번 실행에 귀속된 5157 0건, 식별 불가 0건. **외부 통신이 없었다는 뜻이 아니다**(5.4절) | 관측 |
| 복구 | 규칙·ACE 2건·계정·프로필·작업 폴더·`credential.dpapi`·감사 값 모두 복구. 사후에 직접 읽어 실행 전 기록과 항목별로 대조해 일치 | 확인 |
| 이전 시간 초과의 원인, 조회를 켠 상태의 동작, 재현성, 정상 동작, 외부 통신 여부, 공개 소스 대응 | 관측하지 않았다 | **미확인** |

## 2. 조건 변경과 모의 검증

### 2.1 무엇을 바꿨나

근거(소유자 지시문의 서술을, 이 PC에 설치된 배포물 소스에서 읽기 전용으로 다시 확인했다):

- `semgrep/commands/scan.py`: `--enable-version-check/--disable-version-check` 옵션의 환경 변수는 `SEMGREP_ENABLE_VERSION_CHECK`, 기본값은 켜짐. `--version`이면 `__VERSION__`을 출력한 뒤 `enable_version_check`가 참일 때만 `version_check()`를 부른다.
- `semgrep/app/session.py`: HTTP 재시도 어댑터가 `Retry(total=3, backoff_factor=16, …)`을 쓴다.
- 확인하지 못한 것: 자손으로 뜨는 `semgrep-core.exe osemgrep --version`이 이 변수를 보는지, 어떤 요청이 실제로 어떤 재시도를 겪었는지.

변경(커밋 `b95e9e3`):

| 위치 | 내용 |
| --- | --- |
| `scripts/semgrep-lsp/cli.ts` | `buildVersionChildEnv` 신설 = `buildChildEnv(…, VERSION_STATE_DIR)` + `SEMGREP_ENABLE_VERSION_CHECK: "0"`. 버전 관측 호출 두 곳(단일 실행 경로, 음성 대조 스위트 경로)만 교체 |
| `VersionContract.ps1` | `New-VersionChildEnv`에 `SEMGREP_ENABLE_VERSION_CHECK = '0'`(문자열 상수) |
| `version-stub.ps1`·`version-runner.ps1`·`Test-VersionObservation.ps1` | 스텁 시나리오 `version-check`(받은 이 변수의 값 한 줄만 찍는다) 추가, 허용 목록 세 곳 일치 |
| 그대로 둔 것 | 인자 `["--version"]` 하나, 해석 규칙, 기대 버전, 30,000ms·4,096B·16,384B·5,000ms, `USERPROFILE`, 수신기 동작, 메트릭 설정, 나머지 환경. `APPDATA`·`PYTHONUNBUFFERED` 등은 더하지 않았다. 서버(LSP) 경로의 `buildChildEnv` 호출 두 곳, `precheck.ts` 허용 목록 |

이것은 온라인 최신 버전 조회를 끄는 실행 조건 변경이다. 설치 버전 출력을 끄거나 결과를 `1.180.0`으로 맞추는 변경이 아니다. 해석 규칙은 stdout의 한 줄 `숫자.숫자.숫자`를 기대값과 비교하는 그대로다.

### 2.2 시험 (실제 Semgrep 미실행)

| 시험 | 수정 전(새 시험만 추가한 상태) | 수정 후 |
| --- | --- | --- |
| TS 관련 3파일(`cli`·`structure`·`precheck`) | 6건 실패(368 통과·2 건너뜀) | 374 통과·2 건너뜀 |
| 정적 점검 `Test-IsolationScripts.ps1` | 188/190 | 191/191(5.1). 문서 커밋에서 한 항목을 더하기 전 190/190 |
| 흐름 `Test-VersionFlows.ps1` | 139/141(두 엔진) | 141/141(두 엔진) |
| 실행기 `Test-VersionRunner.ps1` | 3건 실패 뒤 스텁에 시나리오가 없어 예외로 중단(총계 없음) | 169/169(두 엔진, 건너뜀 0) |
| `scripts/semgrep-lsp` 전체 | — | 61파일 2729 통과·8 건너뜀(기존 건너뜀 그대로) |

확인한 것:

- **환경 전달**: 실행기를 거친 스텁이 요청한 `SEMGREP_ENABLE_VERSION_CHECK=0`을 그대로 받는다.
- **부모 값 비상속**: 부모 환경에 `1`이 있어도 자식 값은 `0`이고(PS·TS 모두), 요청에 이름이 없으면 부모에 `1`이 있어도 자식은 받지 못한다. 토큰·프록시는 여전히 복사하지 않는다.
- **버전 경로 한정**: `buildChildEnv`(서버 경로) 결과에는 이 이름이 없다. `cli.ts`에서 버전 관측 호출은 정확히 두 곳이고 서버 호출 두 곳은 예전 모양 그대로다. `precheck`는 환경에 이 이름이 있으면 `ENV_VAR_NOT_ALLOWED`로 거절한다(부모에서 서버로 퍼지지 않음). 정적 점검이 이름의 출현 파일을 계약·진입점(설명 주석)·스텁·그 시험으로 한정하고, 계약 파일의 대입이 한 곳이며 진입점의 실행 코드에 없는지 본다(심은 위반 3종을 잡음).
- **PS ↔ TS 계약**: 이름 집합과 값이 같다(`USERPROFILE` 경로 구분자만 다름).
- **기존 판정**: 판정 계약 시험(합성 표, 진짜 실행기 결과) 전부 그대로 통과한다.

모의 검증 중 있었던 일: (1) 내 시험의 기대 목록 정렬 순서가 틀려 TS 시험 1건이 먼저 실패했고 고쳤다. (2) 기존 통합 시험 1건이 버전 환경의 이름 집합을 고정하고 있어, 의도한 변경에 맞게 기대 목록에 이 이름을 더했다. (3) PowerShell 도구의 PATH에 `git`이 없어 `git-node.test.ts` 3건이 `ENOENT`로 실패했다. 변경과 무관한 환경 문제였고 `git`을 PATH에 넣고 같은 시험이 통과했다.

## 3. 하지 않은 것

LSP 서버 실행, 규칙 내려받기, 대상 스캔, 음성 대조, `--version` 외 인자의 실행, `APPDATA` 등 환경 변수 추가, 30초·출력·종료 대기 한도 변경, 해석 규칙 완화, 수신기 응답 변경, 실행 뒤 수정과 재실행, `pin.json`·`verified`·`policy_accepted`·ADR 상태 변경, 다른 PR·`main`·`bodam` 변경, 병합·배포. `STREAMS_NOT_CLOSED`는 사용 불가로 유지했고 실행기 오류·읽기 실패·필수 상태 누락도 성공으로 보정하지 않았다(이번 실행은 이 기준에 걸리지 않았다). 실제 `semgrep.exe` 실행은 이번에 이 한 번뿐이다.

## 4. 실행 전 확인

| 항목 | 값 |
| --- | --- |
| 실행 식별 | RunId `20261028T043454Z-730dc964`, 계정 `bsi730dc964`(SID `S-1-5-21-…-1010`), 규칙 `bosang-semgrep-iso-20261028T043454Z-730dc964-out`. 사전 점검 스냅숏 `4fee6342e4ee` |
| 실행 파일 | `%LOCALAPPDATA%\bosang-radar\semgrep-dist\1.180.0\venv\Scripts\semgrep.exe` (108,456B, SHA-256 `960388bc…4013` = PR #35 보고서 값) |
| 원본 휠 | 58,108,036B, SHA-256 `b403865e…1fc6` = PR #35 보고서 값 |
| `semgrep-core.exe` | 246,296,090B, SHA-256 `6790bb4a…d116` = PR #35 보고서 값 |
| 두 `python.exe` / `pyvenv.cfg` / 두 폴더 | 해시·파일 수·바이트·최신 수정 시각이 10-28 복구 후 기록과 같다(가상환경 4,235개·338,435,603B, 기반 Python 95,532개·2,672,287,092B) |
| 사전 점검 | 적용 차단 항목 없음(P12만 `NEEDS_GRANT`, 아래 권한 부여로 처리) |
| 적용 dry-run | 계정 1·작업 폴더 1·ACL 추가 2·규칙 1. 차단 범위 `0.0.0.0-126.255.255.255`, `128.0.0.0-255.255.255.255`, `::2-ffff:…` |
| 적용 직후 직접 확인 | 17개 항목 통과: 계정(Users 그룹 하나, 비관리자, 실행 전 비활성), 규칙(켜짐, `Block`·`Outbound`, `LocalUser`=전용 SID 하나, 루프백 비포함 범위, 프로토콜·프로그램 `Any`), 작업 폴더 ACL(상속 끊김, SYSTEM·Administrators·전용 계정 셋, 전용 계정은 Modify), 전용 홈 위치가 작업 폴더 안이고 아직 없음, 두 폴더에 전용 SID ACE 1건씩(나머지 ACE는 기준값과 동일) |
| 진입점 dry-run | 사전 조건 T01~T06, V01~V06 모두 PASS. 한도 30,000ms / 4,096B / 16,384B / 5,000ms 고정 |

실행 전에 따로 저장한 기준값(관리자 쪽 읽기, 저장소 밖): 로컬 계정 5개, 방화벽 규칙 689개(이름 목록), 프로필 폴더 5개와 `ProfileList` 4개, `ProgramData\bosang-semgrep-iso` 없음, 감사 "Filtering Platform Connection"·"Process Creation" 모두 `No Auditing`, 두 폴더의 ACL SDDL, 파일 수·바이트·최신 수정 시각, 핵심 파일 해시, 남은 `semgrep*` 프로세스 0개.

## 5. 실행 결과 (항목을 섞지 않고 적는다)

실행 시각(UTC): 진입점 시작 04:38:26Z, 실행기 시작 04:38:27Z, `semgrep.exe` 시작 04:38:28Z, 모든 프로세스 종료 04:38:43Z, 진입점 종료 04:38:47Z. 복구는 약 04:40Z.

### 5.1 [A] 실행 결과

| 항목 | 값 |
| --- | --- |
| 실행 파일 / 인자 | `…\venv\Scripts\semgrep.exe` / `["--version"]` 하나 |
| 작업 폴더 | 전용 작업 폴더의 `work`(프로젝트·저장소 파일 없음) |
| 실행 계정 | 전용 비관리자 계정, SID `S-1-5-21-…-1010`(실행기·자식의 소유 SID를 관리자 쪽 CIM으로 확인) |
| `USERPROFILE` 위치 | 이번 실행의 전용 상태 폴더 아래 `…\work\state\home`(부모 사용자 값 복사 없음) |
| 종료 코드 / 상태 | 0 / `EXITED`(`killed=false`, `timedOut=false`, 출력 한도 초과 아님) |
| 소요 시간 | 14,702ms(관측), 14,626ms(OS 기록) |
| stdout | 9바이트, 원시 바이트 `31 2e 31 38 30 2e 30 0d 0a`(= `1.180.0` + CRLF), SHA-256 `d3a014d7…43bd`. `overflow=false`, `readFailed=false`, 읽기 상태 `EOF` |
| stderr | 0바이트. `overflow=false`, `readFailed=false`, 읽기 상태 `EOF` |
| `streamsClosed` | `true` |
| 실행기 오류 / 거부 | 없음 / 없음 |

자식에게 준 환경(이름 12개, 값은 증거 `child-env-passed.json`, 토큰 제외):

| 이름 | 값 |
| --- | --- |
| `SEMGREP_ENABLE_VERSION_CHECK` | **`0`**(이번에 더한 고정값. 부모 환경에서 읽지 않음) |
| `USERPROFILE` | 작업 폴더 아래 `work\state\home` |
| `PATH` / `SYSTEMROOT` | `C:\WINDOWS\System32;C:\WINDOWS` / `C:\WINDOWS` |
| `TEMP` / `TMP` | 작업 폴더 아래 `work\tmp` |
| `SEMGREP_APP_URL`·`SEMGREP_METRICS_URL`·`SEMGREP_VERSION_CHECK_URL` | 이 실행이 연 루프백 수신기 `http://127.0.0.1:<포트>` |
| `SEMGREP_LOG_FILE`·`SEMGREP_SETTINGS_FILE`·`SEMGREP_VERSION_CACHE_PATH` | 작업 폴더 아래 `work\state\` |

`APPDATA`·`HOME` 계열·`PYTHONUNBUFFERED`·토큰·프록시는 주지 않았다.

### 5.2 관측 판정과 정리 결과 (따로 기록)

| 구분 | 값 |
| --- | --- |
| **관측 판정** | `VERSION_OBSERVED_AS_EXPECTED`. 실패 토큰 없음, 버전 후보 `1.180.0`(기대값과 같음), `versionUsable=true`, 관측 성립, 최종 상태 `VERSION_OBSERVED_AS_EXPECTED`, 종료 코드 0 |
| **정리 결과** | 진입점 정리 4항목 모두 성공(수신기 정지 `DONE`, 남은 프로세스 `NONE_LEFT`, 계정 비활성화 `DISABLED`, 감사 값 `RESTORED`). 이어서 `Remove-Isolation.ps1 -Apply -RemoveProfile` 종료 코드 0, 규칙·ACE 2건·계정·프로필·작업 폴더·`credential.dpapi` 삭제 모두 `OK`(감사 값은 `ALREADY_RESTORED`) |

### 5.3 [B] 프로세스 트리와 자식 정리

관리자 쪽 CIM 폴링(약 40ms 간격)이 본 프로세스는 10개(실행기 포함, 모두 소유 SID가 전용 계정)이고 10-27·10-28 실행과 같은 체인이다.

```
실행기(powershell.exe 5.1)
├ conhost.exe
└ semgrep.exe --version                            (pip 실행기 래퍼)
  ├ conhost.exe
  └ 가상환경 python.exe → 기반 python.exe            (semgrep.exe를 스크립트로 실행)
    └ semgrep-core.exe  osemgrep --version
      └ pysemgrep.exe --version
        └ 가상환경 python.exe → 기반 python.exe
```

`semgrep.exe`는 04:38:28Z에, `semgrep-core.exe`와 그 아래는 04:38:29Z에 시작했고 모두 04:38:43Z에 끝났다. 실행기가 본 자손 7개, 실행기 정리가 따로 끝낸 자손 0개, 정리 뒤 남은 자손 0개, 관리자 쪽 정리에서 전용 계정의 남은 프로세스 0개(`NONE_LEFT`). 사후에 `semgrep`·`semgrep-core`·`pysemgrep` 프로세스를 다시 조회해 0개, 전용 SID 소유 프로세스 0개를 확인했다. 폴링 방식이라 아주 짧게 산 프로세스를 놓쳤는지는 확정할 수 없다.

### 5.4 [C] 루프백 수신과 [D] 5157 (별도 기록, 둘 다 외부 통신 없음의 증거가 아니다)

| 구분 | 값 | 뜻 |
| --- | --- | --- |
| [C] 루프백 수신기 | 수신 0건(수신기 `127.0.0.1:<포트>`) | 이 수신기로 온 연결이 없었다는 뜻이다. 수신기는 연결한 계정을 직접 보지 못한다. 0건이라도 다른 목적지로의 통신이 없었다는 증거가 아니다 |
| [D] OS 차단 관측(5157) | 수집 성공, 실패 감사 켜짐, 로그 밀림 없음. 이번 실행의 프로세스에 귀속된 5157 0건, 식별 불가 0건 | 규칙이 차단한 연결 중 이번 프로세스로 귀속되는 것이 없었다는 뜻이다. TCP/IPv4 외의 경로(DNS·UDP·ICMP·IPv6)와 서비스가 대신 수행하는 통신은 이 관측에 잡히지 않을 수 있다 |

DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 못했으며 **미확인**으로 유지한다. 40ms 폴링에 잡히지 않은 아주 짧은 자손은 귀속에서 빠질 수 있다.

### 5.5 전용 홈·작업 폴더에 생긴 것과 정리

| 위치 | 생성된 것(내용은 읽지 않았고 종류·크기만 기록) | 정리 |
| --- | --- | --- |
| 전용 홈 `work\state\home` | **비어 있었다**(파일 0, 폴더 0) | 작업 폴더와 함께 삭제 확인 |
| `work\state` | `settings.yml` 96B, `semgrep.log` 0B. `version-cache`는 만들어지지 않았다 | 삭제 확인 |
| `work\tmp` | 빈 폴더 `semgrep-mcp` | 삭제 확인 |
| `work` | 실행 요청·결과·실행기 복사본(`version-request.json`·`version-result.json`·`version-runner.ps1`)과 `.owner` | `.owner` 확인 뒤 삭제 확인 |
| 프로필 `C:\Users\bsi…` | 파일 76·폴더 84·2,808,106B. 확장자는 `.lnk`·`.ini`·`.regtrans-ms`·`.blf`·`.dat` 등 Windows가 만든 것이고, 이름에 `semgrep`·`python`·`pip`·`cache`가 들어간 파일은 0개(10-28 실행과 같은 파일 수) | `-RemoveProfile`로 삭제, 사후 폴더 없음 확인 |

## 6. 복구 후 직접 읽은 상태

실행 전 기록(`run-20261028b-pre.json`)과 복구 후 기록을 읽어 항목별로 값을 출력해 대조했고, 복구 후 직접 조회로 없음을 확인했다. 모든 항목이 같다.

| 항목 | 복구 후 직접 읽은 값 |
| --- | --- |
| 가상환경 루트 ACL | SDDL 문자열이 실행 전과 같다(길이 221). 전용 SID 없음 |
| 기반 Python 폴더 ACL | SDDL 문자열이 실행 전과 같다(길이 265). 전용 SID 없음 |
| 설치물 해시 | 휠·`semgrep.exe`·`semgrep-core.exe`·두 `python.exe`·`pyvenv.cfg` 모두 같다 |
| 두 폴더 | 파일 수·바이트·최신 수정 시각 같음(4,235개 / 95,532개) |
| 로컬 계정 | 5개, 실행 전과 같음. `bsi*` 0개, `Get-LocalUser bsi730dc964` 없음 |
| 방화벽 규칙 | 689개, 이름 집합이 실행 전과 같음(양쪽 차집합 0). `bosang-semgrep-iso*` 0개, 규칙 직접 조회 없음 |
| 프로필 | 폴더 5개·`ProfileList` 4개 같음, 전용 SID 없음, `C:\Users\bsi730dc964` 없음 |
| 작업 폴더 | `ProgramData\bosang-semgrep-iso` 전체가 없음 |
| `credential.dpapi` | 없음 |
| 감사 값 | "Filtering Platform Connection"·"Process Creation" 모두 CSV 원문 줄이 실행 전과 같고 `No Auditing`. `auditpol` 직접 조회 종료 코드 0 |
| 프로세스 | `semgrep`·`semgrep-core`·`pysemgrep` 0개, 전용 SID 소유 프로세스 0개 |

## 7. 증거 파일과 해시

원본 증거는 저장소 밖에 있다. 이 보고서에는 요약과 해시만 둔다. 기기 이름·사설 주소·사용자 경로가 들어 있어 저장소에 두지 않는다. 암호·토큰·비밀 패턴 검색 결과 일회성 실행 토큰(`runToken`, 작업 폴더와 함께 폐기됨)이 `version-observation` 파일에 있는 것 외에는 0건이다.

위치: `%LOCALAPPDATA%\bosang-radar\semgrep-isolation\20261028T043454Z-730dc964\` 및 `%LOCALAPPDATA%\bosang-radar\semgrep-isolation-baseline\`

| 파일 | SHA-256 | 크기 |
| --- | --- | --- |
| `preflight.json` | `4fee6342e4ee57dffcef467ab71dcc1bbe24b200cbd760d7db24a486b554243d` | 506,511B |
| `version-observation-20261028T043824Z.json` | `fa7cf1c27d7f14335ef74fe6eb85f262a83251cb66621f60842651fa51b02488` | 49,759B |
| `version-stdout-20261028T043824Z.bin` | `d3a014d73f9bc6bad14f15bbb47e50c9d76b58c37849bfe4be8e1741204d43bd` | 9B |
| `version-stderr-20261028T043824Z.bin` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (빈 파일의 해시) | 0B |
| `child-env-passed.json` (토큰 제외) | `e282d368ffb76a4677bda8936bf3969cd5e947dea602cfb47dece1df0fcfa96f` | 1,393B |
| `pre-recovery-home-listing.json` | `82bf3c86d6f4b9f7b6a4a0de995ad57143c24f6b695a57fcb3fc69ea7f6ad892` | 22,474B |
| `resources.json` | `8c70860cfe49d81c05bdcf50ba60ae0bbf03972bc270e89a89393b3c7488e5de` | 5,247B |
| `log.jsonl` | `5f787d5d1468376c9f071aaa17050acc11e73e50f7f7a922229d35e74a94cc13` | 20,970B |
| `recovery-20261028T044001615.json` | `b81c8de69291fb6d7cdd7c5bc3600915fbce439f47485f956dcffdacd7eb5172` | 2,109B |
| `run-20261028b-pre.json` (baseline 폴더) | `f2e5b8d473f0a52a2c2c28c384fb832b83ec3a6191c9d935b8842fd5da4b24c7` | 39,985B |
| `run-20261028b-post.json` (baseline 폴더) | `ac053502816848cde71612164a2a3da84cc31ea2b0d0c2a3a0e2d718cc89ae01` | 39,986B |
| `run-20261028b-execute-raw-output.txt` (baseline 폴더) | `e32d750075fa1748dbc944f1c32212bd83325a7c9843ecf234e5c641610612da` | 3,812B |
| `verify-applied-20261028T043454Z-730dc964.json` (baseline 폴더) | `652270a921b953ce59cfdda366209da1bf24078297778e96cda9971ba51975f9` | 2,848B |

## 8. 이전 두 실행과의 비교와 해석의 한계

| 항목 | 10-27 | 10-28 | 이번(조회 끔) |
| --- | --- | --- | --- |
| 코드 | `f099c84` | `9bda3ba` | `b95e9e3` |
| `USERPROFILE` | 없음 | 전용 home | 전용 home |
| `SEMGREP_ENABLE_VERSION_CHECK` | 없음 | 없음 | `0` |
| 결과 | 종료 코드 1, 약 15.4초, `Could not determine home directory` | 30초 한도에서 강제 종료, 출력 0B | 종료 코드 0, 14.7초, `1.180.0` |
| 루프백 수신 | 0건 | 2건(귀속 불가) | 0건 |
| 귀속된 5157 / 식별 불가 | 0 / — | 0 / 8(다른 PID의 인바운드 UDP 1900) | 0 / 0 |
| 프로세스 체인 | `semgrep.exe` → python → `semgrep-core osemgrep` → `pysemgrep` → python | 같음 | 같음 |

이 표에서 말할 수 있는 것은 "10-28과 이번 사이에서 코드·환경 차이는 이 변수 하나였고, 결과가 달랐다"까지다. **그것을 원인으로 확정하지 않는다.**

- 같은 코드로 조회를 켠 상태와 끈 상태를 번갈아 비교한 관측이 없다. 10-28 실행은 이번과 시각·디스크 캐시·백신 검사 상태 등 다른 조건도 달랐고, 각 조건을 한 번씩만 관측했다.
- 10-28 루프백 수신 2건은 귀속되지 않았으므로, 이번 0건이 "그 2건이 조회였다"를 뜻하지 않는다.
- 이번 14.7초가 왜 걸렸는지(조회를 끈 뒤에도 남는 시간의 출처)는 관측하지 않았다.
- 소유자 지시문의 가설(재시도 설정과 응답 없이 연결을 닫는 수신기의 조합)은 소스상 개연성이 있다는 데까지 확인했고 실제 원인으로 확정하지 않았다.

## 9. 한계와 점검 중 발견한 문제

- 관측은 1회다. 반복 실행의 재현성, 조회를 켠 상태의 동작, 같은 조건에서의 소요 시간 분포는 **미확인**이다.
- stdout `1.180.0`은 이 실행의 출력이며 핀 검증·배포물 신뢰·휠↔소스 커밋 대응의 근거가 아니다. 서명되지 않은 `semgrep-core.exe`(246MB)와 `pysemgrep.exe`를 실행했다는 사실도 그대로다.
- 실행 허용 범위는 `semgrep.exe --version` 1회와 그 자손까지다. LSP 서버·규칙·스캔·음성 대조는 실행하지 않았으므로 이 결과로 말하지 않는다.
- `STREAMS_NOT_CLOSED` 엄격 기준은 이번에도 시험되지 않았다(정상 EOF로 끝났다).
- **내 사후 점검 스크립트의 결함 재발**: 복구 직후 비교의 마지막 항목(`auditpol` 직접 조회)이 `auditpol /r` 출력의 마지막 빈 줄을 읽어 `DIFF`로 나왔다. 상태 차이가 아니라 점검 코드의 결함이었고(10-28 보고서에 적은 것과 같은 종류), 마지막 비어 있지 않은 줄을 읽도록 바꿔 두 감사 항목을 다시 직접 읽어 `No Auditing`을 확인했다. 이 점검 스크립트는 세션 임시 폴더에만 있고 커밋하지 않았다.
- 모의 검증은 모두 스텁·모의 시스템·합성 입력이다. 실제 Semgrep이 `SEMGREP_ENABLE_VERSION_CHECK`를 어디까지 따르는지(자손 `semgrep-core osemgrep` 포함)는 이번 관측에서 분리해 보지 않았다.
- 이 PC의 관리자 셸에서 한 관측이다. 다른 환경(Linux/macOS, 일반 사용자 셸)은 관측하지 않았다.

## 10. 소유자 결정 대기

1. 이 결과를 어떻게 다룰지: "조회를 끈 조건에서 관측됨"으로만 두고 PR #36의 격리 계약에 이 고정값을 유지할지, 아니면 조회를 켠 상태와의 대조 관측(같은 코드·같은 환경에서 변수만 바꾼 1회)을 별도 작업으로 허용할지.
2. 대조 관측을 한다면 허용할 변경 범위(조회를 켠 상태에서 수신기가 HTTP 응답을 돌려주는 변형을 시험할지 포함). 이번 결과에 맞춰 조건을 고치는 보정이 되지 않도록 별도 지시가 필요하다.
3. 이 고정값을 서버(LSP) 실행 경로에 줄지 여부. 이번에는 주지 않았고 `precheck`는 이 이름을 허용 목록 밖으로 거절한다.
4. `semgrep-core`·`pysemgrep` 실행을 격리 설계의 전제로 문서화할지(이전 소유자 결정 대기 항목과 같음).
