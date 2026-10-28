# 전용 계정에서 `semgrep --version` 1회 실행: 결과와 복구

- 작성일: 2026-10-27
- 기준: PR #36 브랜치 `security/semgrep-lsp-win-isolation`의 HEAD `1667527030a7e3bfd73fe99ece6bc045a78586e8` 위의 후속 커밋
- 성격: 격리 환경(계정 단위 아웃바운드 차단)을 새로 적용한 안에서, 설치된 `semgrep` 실행 파일을 전용 비관리자 계정으로 `["--version"]` 한 번 실행하고 모두 복구한 기록이다.
- **결과: 버전 문자열을 얻지 못했다.** 종료 코드 1, stdout 0바이트, stderr에 파이썬 예외(`RuntimeError: Could not determine home directory.`). 판정은 `NOT_OBSERVED:NONZERO_EXIT`이다. **출력이 `1.180.0`이라는 확인은 이 문서에 없다.**
- 이번 실행은 서명되지 않은 해당 배포물의 버전 명령을 실행하는 것까지만 허용받았다. **이것을 배포물의 공개 소스 대응이나 신뢰 검증 완료로 읽지 않는다.** 배포물이 동작한다는 확인도 아니다.

## 1. 결론

| 항목 | 결과 | 확인 수준 |
| --- | --- | --- |
| 실행 전 확인 | 원본 휠·`semgrep.exe`·`semgrep-core.exe` SHA-256이 PR #35 보고서 값과 일치. 경로(실행 파일, 가상환경, 기반 Python) 확정 | 확인 |
| 권한 부여 범위 | 가상환경 루트와 기반 Python 폴더 **두 곳에만** 전용 SID의 `ReadAndExecute` ACE 각 1건. 복구 뒤 두 폴더의 ACL SDDL이 실행 전 원본과 문자열까지 같다 | 확인 |
| 격리 구성 | 적용 직후 규칙의 계정 범위(`LocalUser`=전용 SID 하나)와 차단 범위(루프백 제외)를 직접 다시 읽어 요청과 일치함을 확인한 뒤 실행 | 확인 |
| 전용 계정 실행 경로 | 같은 환경에서 무해한 스텁으로 먼저 점검: 신원 확인 통과, 정리 완료 | 확인(스텁) |
| `semgrep.exe --version` | 종료 코드 1, 소요 약 15.4초(한도 30초 안), stdout 0B, stderr 3,283B. **버전 출력 없음** | 확인(실패 관측) |
| 실패 원인 | stderr의 마지막 줄: `RuntimeError: Could not determine home directory.` (`semgrep/env.py`의 `user_data_folder_default` → `pathlib.Path.home()`). 어댑터 계약의 Windows 환경 허용 목록에 홈 위치 변수가 없다 | 확인(원문), 계약과의 관계는 해석 |
| 신원 교차 확인 | 통과(실패 0). 실행기·`semgrep.exe` 모두 소유 SID가 전용 계정, 실행 파일·명령줄이 요청과 일치 | 확인 |
| 루프백 수신 / 5157 | 수신 0건 / 이번 실행에 귀속된 5157 0건. **외부 통신이 없었다는 뜻이 아니다**(5절) | 관측 |
| 복구 | 규칙·ACE 2건·계정·프로필·작업 폴더·`credential.dpapi`·감사 값 모두 복구, 실행 전 기록과 직접 대조해 일치 | 확인 |
| `1.180.0` 출력, 정상 동작, 네트워크 시도 여부, 공개 소스 대응 | 관측하지 않았다 | **미확인** |

## 2. 하지 않은 것

LSP 서버 실행, 규칙 내려받기, 대상 스캔, 음성 대조의 실제 실행, `--version` 외 인자의 실행, 환경을 바꿔 다시 실행하는 것, `pin.json`·`verified`·`policy_accepted`·보안 게이트·ADR 상태 변경, 다른 PR·`main`·`bodam` 변경, 병합·배포. 실패한 뒤 원인을 보고 계약이나 환경을 보정해 재시도하지 않았다(지시에 따라 멈췄다).

## 3. 실행 전 확인

| 항목 | 값 |
| --- | --- |
| 실행 파일 | `%LOCALAPPDATA%\bosang-radar\semgrep-dist\1.180.0\venv\Scripts\semgrep.exe` (108,456B, SHA-256 `960388bc…4013` = PR #35 보고서 4.2절) |
| 가상환경 / 기반 Python | `…\1.180.0\venv` / `%LOCALAPPDATA%\Programs\Python\Python312` (`pyvenv.cfg`의 `home`, Python 3.12.9) |
| 원본 휠 | 58,108,036B, SHA-256 `b403865e…1fc6` = 보고서 3.6절 값(이번에 다시 계산) |
| `semgrep-core.exe` | 246,296,090B, SHA-256 `6790bb4a…d116` = 보고서 3.7절 값 |
| 서명 | `semgrep.exe` **NotSigned**. 두 `python.exe`는 Python Software Foundation 서명 유효(서명 블록만 읽음) |
| 사전 점검 | 적용 차단 항목 없음(P12만 `NEEDS_GRANT`, 아래 권한 부여로 처리). 스냅숏 `7a9bf138ba54` |
| 적용 dry-run | 계정 1·작업 폴더 1·**ACL 추가 2**·규칙 1. 새 진입점 dry-run: 사전 조건 T01~T06, V01~V06 모두 PASS |

실행 전에 따로 저장한 기준값(관리자 쪽 읽기): 로컬 계정 5개, 방화벽 규칙 688개, `ProgramData\bosang-semgrep-iso` 없음, 프로필 폴더 5개, 감사 "Filtering Platform Connection"·"Process Creation" 모두 `No Auditing`, 두 폴더의 ACL SDDL, 두 폴더의 파일 수·바이트·최신 수정 시각, 핵심 파일 해시.

기존 상속 ACE 하나(`S-1-5-21-…-1004`, 읽기·실행)는 이름으로 해석되지 않는 고아 SID이며 이번 실행과 무관하다. 건드리지 않았다.

## 4. 추가한 코드와 시험 (스크립트 변경 사항)

기존 `Test-IsolationEffect.ps1`은 PowerShell 프로브 둘과 고정된 두 목적지에 묶여 있어 임의 실행 파일을 제한 시간·출력 제한·자식 정리와 함께 돌릴 수 없다. 그래서 요청대로 **좁은 전용 실행기**를 추가했다. 기존 파일은 하나도 수정하지 않았다(`git diff`로 확인).

| 파일 | 역할 |
| --- | --- |
| `version-runner.ps1` | 전용 계정으로 실행. mode가 `semgrep-version`이면 이름이 `semgrep.exe`인 절대 경로 + 인자 정확히 `["--version"]`만, `stub`이면 `version-stub.ps1`의 고정 시나리오만 허용하고 그 밖은 거부. 셸 없이 `ProcessStartInfo`, 환경은 요청의 것만(부모 환경 비움), stdin 즉시 닫기, 원시 바이트로 한도까지만 읽기, 한도 초과·시간 초과 시 자손 트리 종료 |
| `version-stub.ps1` | 무해한 스텁(버전 자리는 항상 `0.0.0`, 최대 90초 안에 스스로 끝남) |
| `VersionContract.ps1` | `tool-observation.ts`의 한도와 `parseVersionStdout`의 이식본 |
| `Test-VersionObservation.ps1` | 관리자 쪽 진입점(기본 dry-run). 기존 공용 함수를 재사용: 감사 창, 계정 켜기·끄기, 5157 수집과 PID·경로·시각 대조, 독립 정리 |
| `tests/Test-VersionRunner.ps1` | 스텁 시험 |

**재사용한 계약(`tool-observation.ts`)**: 한도 30,000ms / stdout 4,096B / stderr 16,384B / 종료 대기 5,000ms(실제 모드에서는 바꾸려 하면 거부), 인자 `["--version"]`, 환경 허용 목록(`PATH`·`SYSTEMROOT`·`TEMP`·`TMP`)과 `SEMGREP_APP_URL`·`METRICS_URL`·`VERSION_CHECK_URL`(=관리자가 연 루프백 수신기)·로그/설정/버전 캐시 경로, 해석 규칙(종료 코드 0, stdout에서만, UTF-8·BOM 불허, 줄 끝 하나를 뺀 정확히 한 줄, 정확히 `숫자.숫자.숫자`). 이 해석 계약은 하네스가 정한 것이며 실제 Semgrep으로 확인한 형식이 아니다.

**계약과 다르게 한 점**: `PATH`는 사용자 PATH가 아니라 `Windows\System32;Windows`로 고정했고, `TEMP`·`TMP`는 작업 폴더 안으로 두었다(더 좁게 한 것). 이 차이가 실패 원인은 아니다(원인은 5.2절).

**스텁 시험 결과** (임시 샌드박스, 시스템 설정 변경 없음):

| 시험 | 결과 |
| --- | --- |
| `Test-VersionRunner.ps1` pwsh 7.6.9 / Windows PowerShell 5.1 | 각 66/66 |
| 포함된 확인 | 시간 제한(3초에서 끝남, 자손까지 종료), stdout·stderr 한도 초과 종료, 자손을 남긴 정상 종료의 정리, 환경 canary 비유출·작업 폴더, 거부 경로 9종+한도·작업 폴더, `semgrep.exe` 이름의 파일을 셸 없이 `--version`으로 부르는 경로(내용은 `whoami.exe` 사본) |
| 해석 계약 대조 | 같은 20개 입력(BOM, 아랍 숫자, 잘못된 UTF-8, `\r` 단독, NUL 등)에서 **실제 TS `parseVersionStdout`(tsx)과 이식본의 결과가 모두 같다** |
| 기존 자체 점검 `Test-IsolationScripts.ps1` (수정 없음) | pwsh·5.1 각 139/139 |

시험 중 스텁이 `$env:WINDIR`을 읽다 실패한 것이 한 번 있었다. 계약대로 자식에게 `SYSTEMROOT`만 주기 때문에 생기는 일이며, 스텁을 `SystemRoot`로 고쳤다(환경 격리가 동작한다는 증거이기도 하다).

**이 시험이 덮지 못하는 것**: 새 파일은 기존 자체 점검의 고정 파일 목록에 들어 있지 않아 "변경 명령은 `Invoke-Mutation` 안에서만" 같은 구조 규칙이 기계로 검사되지 않는다(코드는 그 규칙대로 썼으나 검사는 사람의 읽기뿐). 모의 시스템 위의 흐름 시험도 없다. 관리자 쪽 진입점은 실제 환경의 스텁 1회와 본 실행 1회로만 실행됐다.

## 5. 실행 결과 (항목을 섞지 않고 적는다)

실행 식별: RunId `20261027T085118Z-f5dde226`, 계정 `bsif5dde226`(SID `S-1-5-21-…-1008`), 규칙 `bosang-semgrep-iso-20261027T085118Z-f5dde226-out`. 스텁 점검 약 08:55Z, 본 실행 08:56:03Z~08:56:20Z, 복구 약 08:58Z.

### 5.1 [A] 실행 결과

| 항목 | 값 |
| --- | --- |
| 실행 파일 / 인자 | `…\venv\Scripts\semgrep.exe` / `["--version"]` 하나 |
| 작업 폴더 | 전용 작업 폴더의 `work`(프로젝트·저장소 파일 없음) |
| 실행 계정 | 전용 비관리자 계정, SID `S-1-5-21-…-1008`(실행기·자식의 소유 SID를 관리자 쪽 CIM으로 확인) |
| 종료 코드 / 상태 | 1 / `EXITED`(시간 초과 아님, 출력 한도 초과 아님, 강제 종료 아님) |
| 소요 시간 | 15,395ms(관측), 15,225ms(OS 기록) |
| stdout | 0바이트 |
| stderr | 3,283바이트, 해석에 쓰지 않음. 원문은 저장소 밖(해시는 7절). 내용은 파이썬 예외 추적이며 마지막 줄이 `RuntimeError: Could not determine home directory.` |
| 자식에게 준 환경 변수 이름 | `PATH`, `SYSTEMROOT`, `TEMP`, `TMP`, `SEMGREP_APP_URL`, `SEMGREP_METRICS_URL`, `SEMGREP_VERSION_CHECK_URL`, `SEMGREP_LOG_FILE`, `SEMGREP_SETTINGS_FILE`, `SEMGREP_VERSION_CACHE_PATH` (실행기 자신의 환경에는 토큰·프록시·시크릿 계열 이름이 없었다) |

### 5.2 해석과 원인

- 계약의 첫 조건(종료 코드 0)이 깨져 해석 단계로 가지 않았다. 판정 `NOT_OBSERVED:NONZERO_EXIT`, 버전 후보 없음.
- stderr의 호출 경로: `semgrep/main.py` → `cli.py:74 get_state()` → `state.py` → `env.py:150 user_data_folder_default` → `pathlib.Path.home()` → 홈 디렉터리를 정하지 못함. 즉 **Semgrep은 `--version`에서도 CLI 초기화 중에 홈 위치를 요구한다.**
- Windows의 `Path.home()`은 `USERPROFILE`(또는 `HOMEDRIVE`+`HOMEPATH`)이 필요한데, 어댑터 계약의 win32 허용 목록(`PATH`·`SYSTEMROOT`·`TEMP`·`TMP`)에는 홈 위치 변수가 없다. 이 연결은 stderr 원문과 계약 코드를 대조한 해석이다. **홈 변수를 주면 `1.180.0`이 나온다는 것은 확인하지 않았다**(재실행하지 않았다).
- 스택이 `semgrep` 모듈 내부까지 들어갔다는 점은, 전용 계정이 실행 파일·가상환경·기반 Python을 읽고 실행하는 것 자체는 성공했다는 관측이기도 하다.

### 5.3 [B] 프로세스 트리와 자식 정리

관리자 쪽 CIM 폴링(약 40ms 간격)이 이번 실행에서 본 프로세스(모두 소유 SID가 전용 계정):

```
실행기(powershell.exe 5.1)
└ semgrep.exe --version                          (pip 실행기 래퍼)
  └ 가상환경 python.exe → 기반 python.exe          (semgrep.exe를 스크립트로 실행)
    └ semgrep-core.exe  osemgrep --version         (서명되지 않은 246MB 바이너리)
      └ pysemgrep.exe --version
        └ 가상환경 python.exe → 기반 python.exe     (예외로 종료)
```

(+ 콘솔 호스트 `conhost.exe` 둘). **`semgrep.exe --version`이 `semgrep-core.exe`까지 실행했다**는 점을 소유자가 알아야 한다. 자식 정리: 실행기가 본 자손 7개, 정상 종료 뒤 남은 자손 0개, 관리자 쪽 정리에서 전용 계정의 남은 프로세스 0개(`NONE_LEFT`). 놓친 짧은 프로세스가 있었는지는 폴링 방식이라 확정할 수 없다.

### 5.4 [C] 루프백 수신기

수신 0건(`127.0.0.1`의 임시 포트, 환경의 세 URL이 가리킨 곳). **0건은 외부 통신이 없었다는 증거가 아니다.** 수신기는 연결한 계정을 직접 볼 수 없고, 신원 교차 확인 통과를 근거로 귀속했다.

### 5.5 [D] OS 차단 관측(5157)

수집 성공, 실패 감사 켜짐 확인, 로그 밀림 없음, 프로세스 기록 있음. **이번 실행의 프로세스에 귀속된 5157은 0건**이고, 식별 불가 1건은 다른 PID의 인바운드 UDP 1900(SSDP)으로 이번 실행과 무관하다. 해석:

- 0건은 "기록된 차단 시도가 이 프로세스들에서 없었다"는 관측일 뿐이다. 외부 통신이 없었다는 증거가 아니다. 프로세스가 네트워크 코드에 도달하기 전에 종료했을 가능성이 있고(예외는 CLI 초기화 중 발생), 허용된 연결(루프백)은 이 로그에 남지 않으며, 서비스가 대신 수행하는 통신(DNS 해석 등)은 이 프로세스에 귀속되지 않는다.
- 스텁 점검 때도 귀속 5157은 0건이었다(스텁은 통신하지 않는다).

### 5.6 신원 교차 확인

통과(실패 0). 실행기 결과 파일의 실행 토큰, 실행기의 소유 SID·실행 파일·시작 시각, 실행기 자기 보고(PID·SID·경로)와 CIM의 일치, 자식(`semgrep.exe`)의 부모=실행기·소유 SID·실행 파일·명령줄(`"…\semgrep.exe" --version`)·시작 시각 일치.

### 5.7 [F] 정리와 복구 직후 읽기

실행 중 정리: 수신기 정지, 남은 프로세스 종료(0개 남음), 계정 비활성화(읽어서 확인), 감사 값 복구(`RESTORED`). 이어서 `Remove-Isolation.ps1 -Apply -RemoveProfile`: 규칙 삭제, **ACE 제거 2건(다른 ACE는 그대로)**, 계정·프로필·작업 폴더·작업 루트·`credential.dpapi` 삭제 모두 `OK`, 종료 코드 0. 실행 기록 상태 `recovered`.

## 6. 복구 후 직접 읽은 상태 (실행 전 기록과 비교)

모든 조회가 성공한 경우에만 "없음"·"같음"으로 적었다.

| 대상 | 실행 후 읽은 값 | 비교 |
| --- | --- | --- |
| 로컬 계정 | 5개, `bsi*` 없음 | 실행 전과 동일(이름·사용 여부·SID) |
| 방화벽 규칙 | 688개, 우리 접두 0개 | 개수 동일(10-27 복구 직후 시점의 값. 10-28 재확인은 10절) |
| 프로필 폴더 / `ProfileList` | 5개 / 전용 SID 항목 없음 | 동일 |
| `ProgramData\bosang-semgrep-iso` | 없음 | 실행 전에도 없음 |
| `credential.dpapi` | 없음 | 삭제됨 |
| 감사 Filtering Platform Connection / Process Creation | `No Auditing` / `No Auditing` | 원래 값 |
| 가상환경 루트 ACL | SDDL이 실행 전 원본과 **문자열까지 같음**, 전용 SID의 ACE 0개 | 일치 |
| 기반 Python 폴더 ACL | 같음, 전용 SID의 ACE 0개 | 일치 |
| 핵심 파일 4개의 전용 SID ACE | 모두 0개 | — |
| 설치물 해시(휠, `semgrep.exe`, 두 `python.exe`, `semgrep-core.exe`, `pyvenv.cfg`) | 모두 실행 전과 같음 | 동일 |
| 두 폴더의 파일 수·바이트·최신 수정 시각 | 4,235개/338,435,603B/2026-10-27T02:27:04Z, 95,532개/2,672,287,092B/2026-06-29T00:44:33Z | 동일. 이번 작업 중 쓰이거나 만들어진 파일 0개 |
| 전용 SID 소유 프로세스 | 0개 | — |

실행 중 작업 폴더에 `tmp\semgrep-mcp`(Semgrep의 `mcp` 모듈이 임시 폴더에 만든 빈 폴더)가 생겼고 `state`는 비어 있었다. 작업 폴더와 함께 삭제됐다. 전용 계정 프로필에는 `semgrep` 관련 파일이 없었다.

## 7. 증거 파일 (저장소 밖에만 보관, 컴퓨터 이름·사설 IP·경로 포함)

위치: `%LOCALAPPDATA%\bosang-radar\semgrep-isolation\20261027T085118Z-f5dde226\`

| 파일 | 크기(B) | SHA-256 |
| --- | --- | --- |
| `preflight.json` | 505,858 | `7a9bf138ba5441e1514eab92bc290e8a264f0defa1997c6c5e36a917b731f4a6` |
| `version-observation-20261027T085509Z.json` (스텁 점검) | 29,422 | `e040b8233446efda8c48b5467aa2e9f930289beef7184d44a7b3a992c2d1673a` |
| `version-observation-20261027T085600Z.json` (**본 실행**) | 53,047 | `e18cf6d139c56ae4def74d745bcad08a6370a59461cc9c1a3f72249800d50098` |
| `version-stdout-20261027T085600Z.bin` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (빈 입력의 해시) |
| `version-stderr-20261027T085600Z.bin` | 3,283 | `e96d3d3087ad39ba3d852d441ffca15fcf3b0a4c43171a7a30316d04ce605c62` |
| `recovery-20261027T085817288.json` | 2,400 | `69746fe5c4d5854d31cdd2dc0a3385bd16d2ec007be1194729755633a3366171` |
| `resources.json` (상태 `recovered`) | 5,836 | `91bf7129838cadf4b0ed09f95b5c41b46a1ab84af6720fcbb509e00bd954d35c` |
| `log.jsonl` | 23,837 | `233e58232e1c9ee38813d6f9792f97f33e079599ec3813be633d36a9b1f5d6b5` |

## 8. 한계와 남은 위험

1. **1회, 실패한 실행**이다. `--version`이 정상 동작하는지, 어떤 출력을 내는지, 시간이 얼마나 걸리는지(이번 실패까지 15.4초이며 한도 30초의 절반) 모른다.
2. **네트워크 관련 관측은 사실상 비어 있다.** 프로세스가 홈 디렉터리 오류로 일찍 끝났으므로, 이 실행으로는 Semgrep이 어디에 연결을 시도하는지 알 수 없다. DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 않았고, 규칙의 IPv6 필터는 읽지 않았다.
3. 프로세스 기록은 관리자 쪽 폴링이라 놓친 프로세스의 5157은 식별 불가로 남는다. 프로세스 생성 감사(4688)는 켜지 않았다.
4. 위 스텁 시험·실제 스텁 점검은 새 실행기·진입점이 의도대로 동작한다는 것까지만 말한다.
5. `semgrep.exe`·`semgrep-core.exe`는 서명되지 않은 실행 파일이고, 이번 실행은 그 실행을 허용받은 범위에서 1회 한 것이다. 휠 ↔ 공개 소스 커밋 대응(PR #35 보고서 미확인 1)은 여전히 미확인이다.
6. 보안 로그에 이번 실행의 이벤트가 남아 있다(지우지 않았다).

## 9. 소유자 결정이 필요한 것

- **홈 위치 변수를 어댑터 계약의 Windows 환경에 넣을지**(예: `USERPROFILE`을 전용 작업 폴더 안으로). 계약 변경이므로 승인 없이 하지 않았고, 바꿔 다시 돌리면 "실제 출력을 보고 계약에 맞추려는 보정"이 될 수 있어 이번에는 하지 않았다. 바꾼다면 계약 변경과 재실행을 별도 작업으로 다루는 것을 권한다.
- `semgrep.exe --version`이 `semgrep-core.exe`와 `pysemgrep`까지 실행한다는 관측을 다음 격리 설계(허용 범위, 시간 한도)에 반영할지.
- 이 관측의 사용 범위: 이 문서는 **관측 범위(전용 계정, 이 규칙, `semgrep.exe --version` 1회, 홈 변수 없는 환경) 안에서** 다음 단계 판단에 사용할 수 있는 근거이며, 버전 확인이나 Semgrep 격리 성공의 근거는 아니다.

## 10. 2026-10-28 재확인 (실행을 반복하지 않았다)

위 실행(10-27)은 커밋·푸시되기 전에 세션이 끝났고, 10-28에 같은 요청이 다시 들어왔다. 요청이 허용한 것은 `semgrep --version` **1회**였고 그 1회는 위에서 이미 쓰였다. 같은 조건에서 다시 돌려도 같은 오류가 날 뿐이며 "수정·재실행을 반복하지 마"라는 지시에도 어긋나므로 **실행을 반복하지 않았다.** 이번 세션이 한 일은 읽기, 시험, 문서 갱신뿐이다(계정·규칙·감사·ACL을 바꾸지 않았다).

| 확인 | 방법 | 결과 |
| --- | --- | --- |
| 증거 파일 | 저장소 밖 폴더에서 7절 표의 파일 8개의 크기·SHA-256을 다시 계산 | 8개 모두 7절 값과 일치 |
| 계정·프로필·작업 폴더 | `Get-LocalUser`, `C:\Users` 폴더 목록, `ProfileList`, `C:\ProgramData\bosang-semgrep-iso` | 로컬 계정 5개(`bsi*` 없음), 프로필 폴더 5개(전용 계정 폴더 없음), `ProfileList`에 전용 SID(-1008·-1009) 없음, `ProgramData` 폴더 없음 |
| 방화벽 규칙 | `Get-NetFirewallRule` 전체를 실행 전 스냅숏(`preflight.json`, 688개)과 이름으로 대조 | 우리 접두 규칙 0개. 현재 **689개**: 스냅숏에 없는 Microsoft Edge `mDNS-In` 규칙 2개가 있고, 스냅숏에 있던 같은 종류 1개가 없다(Edge `mDNS-In` 38→39개). 6절의 688개는 10-27 복구 직후 값이고, 차이는 Edge·WebView2 쪽 규칙 갱신으로 **해석**한다(갱신 시각은 읽지 않았다) |
| 감사 정책 | `auditpol /get /subcategory:{GUID} /r` (한국어 Windows라 이름이 현지화되어 GUID로 조회) | Filtering Platform Connection·Process Creation 모두 `No Auditing` |
| ACL | 가상환경 루트·기반 Python 폴더의 `Get-Acl` SDDL을 어제 저장한 실행 전·적용 직전·복구 직후 기준 파일 3개와 문자열 대조 | 두 폴더 모두 3개 기준 파일에 현재 SDDL이 **글자 그대로** 들어 있고, 전용 SID(-1008) ACE는 0개 |
| 설치물 해시 | 휠, `semgrep.exe`, 두 `python.exe`, `semgrep-core.exe`, `pyvenv.cfg`의 SHA-256을 다시 계산 | 모두 실행 전 기준값과 같다. 휠·`semgrep.exe`·`semgrep-core.exe`는 PR #35 보고서(`b403865e…`, `960388bc…`, `6790bb4a…`)와도 앞자리 일치 |
| 프로세스 | `semgrep.exe`·`semgrep-core.exe`·`pysemgrep.exe` 프로세스 조회 | 0개 |
| 시험 재실행 | `Test-IsolationScripts.ps1` / `tests/Test-VersionRunner.ps1`(TS 해석기 대조 포함)를 pwsh 7.6.9와 Windows PowerShell 5.1에서 각각 | 139/139, 139/139 / 66/66(건너뜀 0), 66/66(건너뜀 0). 시험 뒤 남은 프로세스 없음 |

**이 재확인이 말하지 않는 것:** 10-27 실행 자체를 다시 관측한 것이 아니다(실행 출력은 저장소 밖 증거 파일을 해시로 대조한 것까지). 현재 상태는 읽은 시점의 값이다. 보안 로그의 이벤트는 지우지 않았다.

**참고(이번 변경 범위 밖):** 이미 커밋된 `Test-IsolationScripts.ps1`의 합성 감사 CSV 줄에 이 PC의 컴퓨터 이름이 들어 있다(시험 데이터의 `Machine Name` 칸). 이번 커밋에서 새로 들어가는 파일에는 컴퓨터 이름·사설 IP·전체 SID·사용자 경로가 없는 것을 검색으로 확인했다. 앞의 것은 고치지 않았다.

## 11. 후속 (2026-10-28, 실행 없음)

이 문서의 기록(종료 코드 1, `NOT_OBSERVED:NONZERO_EXIT`, `1.180.0` 미관측)은 바뀌지 않았고 아래 보완으로 성공으로 고쳐지지 않는다. 5.2절에서 해석한 홈 위치 환경 변수(`USERPROFILE`) 누락은 **전용 USERPROFILE을 자식 환경에 명시하는 방향으로** 보완했고, 수집이 불완전해도 버전을 사용 가능한 관측으로 확정할 수 있던 판정 결함도 함께 고쳤다. 재현·수정·시험 결과는 [보완 보고서](semgrep-version-observer-hardening-20261028.md)에 있다. 보완 뒤 실제 Semgrep은 실행하지 않았으며, 다음 실제 관측은 수정본 검토 후 별도 1회로 진행한다.

## 12. 후속 (2026-10-28, 두 번째 실제 관측)

위 11절의 문장은 11절을 쓰던 시점의 상태이며 바꾸지 않았다. 그 뒤 보완한 코드로 같은 실행을 새 RunId(`20261028T024629Z-525c2bf9`)로 별도 1회 했고, 30초 한도에서 강제 종료되어(`NOT_OBSERVED:TIMEOUT`) 이번에도 버전 문자열을 얻지 못했다. 9절의 홈 위치 변수 결정은 11절의 보완(전용 `USERPROFILE`)으로 반영됐고, 그 관측 결과와 복구는 [두 번째 관측 보고서](semgrep-version-observation-20261028.md)에 있다. 이 문서의 10-27 기록은 그 결과로 바뀌지 않는다.
