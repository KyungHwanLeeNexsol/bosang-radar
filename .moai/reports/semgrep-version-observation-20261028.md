# 전용 계정에서 `semgrep --version` 두 번째 관측: 결과와 복구

- 작성일: 2026-10-28
- 기준: PR #36 브랜치 `security/semgrep-lsp-win-isolation`의 HEAD `9bda3bab062a374bb44d7f68417919fc5c9369d1` 위의 후속 커밋
- 성격: 10-27 실패 실행 이후 보완한 코드(홈 위치 `USERPROFILE` 추가, 수집 판정 보강)로, 격리 환경을 새로 적용한 안에서 설치된 `semgrep.exe`를 전용 비관리자 계정으로 `["--version"]` 한 번 실행하고 모두 복구한 기록이다. 이전 실행과 별개의 RunId를 썼다.
- **결과: 버전 문자열을 얻지 못했다.** 30초 한도까지 끝나지 않아 실행기가 프로세스 트리를 강제 종료했다. 종료 코드 없음, stdout 0바이트, stderr 0바이트. 판정은 `NOT_OBSERVED:TIMEOUT`이다. **출력이 `1.180.0`이라는 확인은 이 문서에 없다.**
- 이번 실행은 서명되지 않은 해당 배포물의 버전 명령을 실행하는 것까지만 허용받았다. **이것을 배포물의 공개 소스 대응, 핀 검증, 배포물 신뢰, 전체 격리, 보안 게이트 통과로 읽지 않는다.** 배포물이 동작한다는 확인도 아니다.
- 관측 판정과 정리 결과는 따로 적는다. 관측은 성립하지 않았고, 정리와 복구는 끝났으며 직접 읽어 확인했다.

## 1. 결론

| 항목 | 결과 | 확인 수준 |
| --- | --- | --- |
| 중복 실행 여부 | 작업 트리가 깨끗하고 원격 HEAD가 지시된 `9bda3ba`와 같으며, 10-27 이후 새 RunId·`bsi*` 계정·규칙이 없었다. 이번 관측을 이미 수행한 흔적이 없어 실행했다 | 확인 |
| 실행 전 확인 | 원본 휠·`semgrep.exe`·`semgrep-core.exe`의 SHA-256이 PR #35 보고서의 전체 값과 일치. 두 `python.exe`·`pyvenv.cfg`·두 폴더의 파일 수와 바이트는 10-27 실행 기록과 같다 | 확인 |
| 격리 구성 | 적용 직후 계정(Users 그룹 하나, 실행 전 비활성), 규칙(켜짐, `Block`, `Outbound`, `LocalUser`=전용 SID 하나, 루프백 제외 범위), 작업 폴더 ACL(SYSTEM·Administrators·전용 계정 셋, 전용 계정은 Modify), 두 폴더의 ACE(각 1건 추가, 나머지 ACE는 기준값과 동일)를 직접 다시 읽어 17개 항목 모두 통과한 뒤 실행 | 확인 |
| `semgrep.exe --version` | 30초 한도에서 강제 종료. 종료 코드 없음, stdout 0B, stderr 0B, `streamsClosed=false`. **버전 출력 없음** | 확인(실패 관측) |
| 신원 교차 확인 | 통과(실패 0). 실행기·`semgrep.exe` 모두 소유 SID가 전용 계정이고 실행 파일·명령줄이 요청과 일치 | 확인 |
| 루프백 수신 / 5157 | 수신 2건(어느 프로세스·어느 요청인지는 모른다) / 이번 실행에 귀속된 5157 0건. **외부 통신이 없었다는 뜻이 아니다**(4절) | 관측 |
| 복구 | 규칙·ACE 2건·계정·프로필·작업 폴더·`credential.dpapi`·감사 값 모두 복구. 사후에 직접 읽어 실행 전 기록과 항목별로 대조해 일치 | 확인 |
| `1.180.0` 출력, 정상 동작, 외부 통신 여부, 공개 소스 대응 | 관측하지 않았다 | **미확인** |

## 2. 하지 않은 것

LSP 서버 실행, 규칙 내려받기, 대상 스캔, 음성 대조, `--version` 외 인자의 실행, `APPDATA` 등 환경 변수 추가, 30초 한도·출력 한도·종료 대기 한도 변경, 해석 규칙 완화, 실패 뒤 수정과 자동 재실행, 무해한 스텁 점검(지시된 실제 관측 1회 외의 실행을 만들지 않으려고 하지 않았다), `pin.json`·`verified`·`policy_accepted`·ADR 상태 변경, 다른 PR·`main`·`bodam` 변경, 병합·배포. `STREAMS_NOT_CLOSED`는 사용 불가로 유지했고, 실행기 오류·읽기 실패·필수 상태 누락도 성공으로 보정하지 않았다.

## 3. 실행 전 확인

| 항목 | 값 |
| --- | --- |
| 실행 식별 | RunId `20261028T024629Z-525c2bf9`, 계정 `bsi525c2bf9`(SID `S-1-5-21-…-1009`), 규칙 `bosang-semgrep-iso-20261028T024629Z-525c2bf9-out`. 사전 점검 스냅숏 `aebf11ba852e` |
| 실행 파일 | `%LOCALAPPDATA%\bosang-radar\semgrep-dist\1.180.0\venv\Scripts\semgrep.exe` (108,456B, SHA-256 `960388bc…4013` = PR #35 보고서 값, 이번에 다시 계산) |
| 가상환경 / 기반 Python | `…\1.180.0\venv` / `%LOCALAPPDATA%\Programs\Python\Python312` (`pyvenv.cfg`의 `home`) |
| 원본 휠 | 58,108,036B, SHA-256 `b403865e…1fc6` = PR #35 보고서 값, 이번에 다시 계산 |
| `semgrep-core.exe` | 246,296,090B, SHA-256 `6790bb4a…d116` = PR #35 보고서 값, 이번에 다시 계산 |
| 두 `python.exe` / `pyvenv.cfg` | SHA-256이 10-27 실행 기록의 값과 같다 |
| 두 폴더 | 파일 수·바이트·최신 수정 시각이 10-27 실행 기록과 같다(가상환경 4,235개·338,435,603B, 기반 Python 95,532개·2,672,287,092B) |
| 사전 점검 | 적용 차단 항목 없음(P12만 `NEEDS_GRANT`, 아래 권한 부여로 처리) |
| 적용 dry-run | 계정 1·작업 폴더 1·ACL 추가 2·규칙 1. 규칙 차단 범위는 `0.0.0.0-126.255.255.255`, `128.0.0.0-255.255.255.255`, `::2-ffff:…` |
| 진입점 dry-run | 사전 조건 T01~T06, V01~V06 모두 PASS. 한도는 30,000ms / 4,096B / 16,384B / 5,000ms로 고정 |

실행 전에 따로 저장한 기준값(관리자 쪽 읽기, 저장소 밖): 로컬 계정 5개, 방화벽 규칙 689개(이름 목록), 프로필 폴더 5개와 `ProfileList` 4개, `ProgramData\bosang-semgrep-iso` 없음, 감사 "Filtering Platform Connection"·"Process Creation" 모두 `No Auditing`, 두 폴더의 ACL SDDL, 두 폴더의 파일 수·바이트·최신 수정 시각, 핵심 파일 해시, 남은 `semgrep*` 프로세스 0개. 기존 상속 ACE 하나(이름으로 해석되지 않는 고아 SID)는 10-27과 같이 건드리지 않았다.

방화벽 규칙은 10-27 복구 직후 688개였고 이번 실행 전 689개였다. 10-28 재확인(10-27 보고서 10절)이 이미 적은 Edge·WebView2 `mDNS-In` 규칙 갱신과 같은 종류의 차이로 **해석**한다. 이번 실행의 전후 비교는 이번 기준값(689개)을 기준으로 한다.

## 4. 실행 결과 (항목을 섞지 않고 적는다)

실행 시각(UTC): 진입점 시작 02:50:44Z, `semgrep.exe` 시작 02:50:46Z, 실행기의 강제 종료와 모든 프로세스 종료 02:51:16Z, 진입점 종료 02:51:21Z. 복구는 약 02:53Z.

### 4.1 [A] 실행 결과

| 항목 | 값 |
| --- | --- |
| 실행 파일 / 인자 | `…\venv\Scripts\semgrep.exe` / `["--version"]` 하나 |
| 작업 폴더 | 전용 작업 폴더의 `work`(프로젝트·저장소 파일 없음) |
| 실행 계정 | 전용 비관리자 계정, SID `S-1-5-21-…-1009`(실행기·자식의 소유 SID를 관리자 쪽 CIM으로 확인) |
| `USERPROFILE` 위치 | 이번 실행의 전용 상태 폴더 아래 `…\work\state\home`(부모 사용자 값 복사 없음). 작업 폴더 ACL은 상속이 끊겼고 SYSTEM·Administrators·전용 계정만 있다 |
| 자식에게 준 환경 변수 이름 | `PATH`, `SYSTEMROOT`, `TEMP`, `TMP`, `USERPROFILE`, `SEMGREP_APP_URL`, `SEMGREP_METRICS_URL`, `SEMGREP_VERSION_CHECK_URL`, `SEMGREP_LOG_FILE`, `SEMGREP_SETTINGS_FILE`, `SEMGREP_VERSION_CACHE_PATH`. `APPDATA`·`HOME` 계열은 주지 않았다 |
| 종료 코드 / 상태 | 없음 / `KILLED`(`timedOut=true`, 출력 한도 초과 아님). 실행기가 한도에서 트리를 끝냈기 때문에 자식의 종료 코드를 얻지 못했다 |
| 소요 시간 | 30,135ms(관측), 30,274ms(OS 기록) |
| stdout | 0바이트 (`bytesRead` 0, `overflow=false`, `readFailed=false`, 읽기 상태 `OPEN`) |
| stderr | 0바이트 (`bytesRead` 0, `overflow=false`, `readFailed=false`, 읽기 상태 `OPEN`) |
| `streamsClosed` | `false` (두 스트림 모두 EOF를 보지 못했다) |
| 실행기 오류 / 거부 | 없음 / 없음 |

### 4.2 관측 판정과 정리 결과 (따로 기록)

| 구분 | 값 |
| --- | --- |
| **관측 판정** | `NOT_OBSERVED:TIMEOUT`. 실패 토큰: `TIMEOUT`, `KILLED`, `STREAMS_NOT_CLOSED`, `CHILD_NOT_EXITED`, `NONZERO_EXIT`. 버전 후보 없음, `versionUsable=false`, 관측 성립 아님, 최종 상태 `NOT_ESTABLISHED`, 종료 코드 60 |
| **정리 결과** | 진입점 정리 4항목 모두 성공(수신기 정지 `DONE`, 남은 프로세스 `NONE_LEFT`, 계정 비활성화 `DISABLED`, 감사 값 `RESTORED`). 이어서 `Remove-Isolation.ps1 -Apply -RemoveProfile` 종료 코드 0, 규칙·ACE 2건·계정·프로필·작업 폴더·`credential.dpapi` 삭제 모두 `OK`(감사 값은 `ALREADY_RESTORED`) |

이 판정은 `TIMEOUT` 하나만으로 사용 불가다. `KILLED`·`CHILD_NOT_EXITED`·`NONZERO_EXIT`는 강제 종료의 결과이고, `STREAMS_NOT_CLOSED`도 그 상태에서 함께 기록됐다. 따라서 **이번 실행은 `STREAMS_NOT_CLOSED`를 사용 불가로 두는 기준을 시험하지 못했다**(그 기준이 아니어도 같은 판정이다). 해석 규칙·기대 버전·한도는 바꾸지 않았다.

### 4.3 [B] 프로세스 트리와 자식 정리

관리자 쪽 CIM 폴링(약 40ms 간격)이 본 프로세스 10개(실행기 포함, 모두 소유 SID가 전용 계정). 10-27 실행과 같은 체인이다.

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

모두 02:50:45Z~02:50:47Z에 시작해 02:51:16Z~02:51:17Z에 끝났다. 실행기가 본 자손 7개, 실행기 정리가 따로 끝낸 자손 0개, 정리 뒤 남은 자손 0개, 관리자 쪽 정리에서 전용 계정의 남은 프로세스 0개(`NONE_LEFT`). 사후에 `semgrep`·`semgrep-core`·`pysemgrep` 프로세스를 다시 조회해 0개, 전용 SID 소유 프로세스 0개를 확인했다. 폴링 방식이라 아주 짧게 산 프로세스를 놓쳤는지는 확정할 수 없다.

### 4.4 [C] 루프백 수신기

`127.0.0.1`의 임시 포트에 연결 **2건**(서로 다른 클라이언트 임시 포트 2개, 환경의 세 URL이 가리킨 곳). 수신기는 연결을 받고 바로 닫을 뿐이며 요청 내용·URL 경로·연결한 프로세스를 볼 수 없다. 그래서 **어느 프로세스가 어느 URL로 무엇을 보냈는지 모른다.** 신원 교차 확인 통과를 근거로 전용 계정 실행에 귀속했다. 10-27 실행의 수신은 0건이었다(그때는 홈 오류로 15.4초에 끝났다). **0건이든 2건이든 외부 통신 여부를 말해 주지 않는다.**

### 4.5 [D] OS 차단 관측(5157)

수집 성공, 실패 감사 켜짐 확인, 로그 밀림 없음, 프로세스 기록 있음. **이번 실행의 프로세스에 귀속된 5157은 0건**이다. 식별 불가 8건은 모두 다른 PID(4336)의 인바운드 UDP 1900(SSDP)이며 사유는 "PID가 이번 실행의 프로세스가 아니다"다. 해석:

- 0건은 "기록된 차단 시도가 이 프로세스들에서 없었다"는 관측일 뿐이다. 외부 통신이 없었다는 증거가 아니다. 허용된 연결(루프백 등)은 이 로그에 남지 않고, 서비스가 대신 수행하는 통신(DNS 해석 등)은 이 프로세스에 귀속되지 않으며, 폴링이 놓친 프로세스의 5157은 식별 불가로 남는다.
- 이번에도 DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 않았다. 규칙의 IPv6 필터는 읽지 않았다. 프로세스 생성 감사(4688)는 켜지 않았다.

### 4.6 신원 교차 확인

통과(실패 0). 실행기 결과 파일의 실행 토큰, 실행기의 소유 SID·실행 파일·시작 시각, 실행기 자기 보고(PID·SID·경로)와 CIM의 일치, 자식(`semgrep.exe`)의 부모=실행기·소유 SID·실행 파일·명령줄(`"…\semgrep.exe" --version`)·시작 시각 일치.

### 4.7 전용 홈과 작업 폴더에 만들어진 파일 (복구 전에 읽고, 내용은 읽지 않았다)

| 위치 | 만들어진 것 | 정리 |
| --- | --- | --- |
| 전용 `USERPROFILE`(`work\state\home`) | **비어 있었다**(파일 0, 폴더 0). Semgrep은 이곳에 아무것도 쓰지 않았다 | 작업 폴더와 함께 삭제 |
| `work\state` | `settings.yml` 96B(키 이름 `has_shown_metrics_notification`, `anonymous_user_id`, 값은 기록하지 않음), `semgrep.log` 0B. 두 파일 모두 02:51:03Z에 생겼다(`semgrep.exe` 시작 17초 뒤, 강제 종료 13초 전). 환경의 `SEMGREP_SETTINGS_FILE`·`SEMGREP_LOG_FILE`이 가리킨 곳이다 | 작업 폴더와 함께 삭제 |
| `work\tmp` | 빈 폴더 `semgrep-mcp`(10-27에도 생긴 같은 빈 폴더) | 작업 폴더와 함께 삭제 |
| 작업 폴더의 우리 파일 | `.owner`, `version-runner.ps1` 사본, `version-request.json`(1,746B), `version-result.json`(9,984B) | 삭제. 결과 파일의 내용은 진입점 보고서의 `runnerResult`로 저장소 밖에 남아 있다 |
| 전용 계정 프로필(`C:\Users\bsi525c2bf9`) | 파일 76개·폴더 84개·약 2.8MB. 확장자 분포(바로가기, `.ini`, 레지스트리 하이브 로그 등)로 보아 Windows가 프로필을 만들 때 생기는 종류로 **해석**한다. `semgrep`·`python`·`pip`가 들어간 이름은 0개 | `-RemoveProfile`로 삭제, 사후 부재 확인 |

## 5. 복구 후 직접 읽은 상태 (실행 전 기록과 비교)

모든 조회가 성공한 경우에만 "없음"·"같음"으로 적었다. 실행 전·후에 같은 읽기 스크립트로 상태를 저장하고 항목별로 비교했다.

| 대상 | 실행 후 읽은 값 | 비교 |
| --- | --- | --- |
| 로컬 계정 | 5개, `bsi*` 없음 | 이름·사용 여부·SID 동일 |
| 방화벽 규칙 | 689개, 우리 접두(`bosang-semgrep-iso*`) 0개 | 실행 전 이름 목록과 집합 동일(전후 차집합 0·0) |
| 프로필 폴더 / `ProfileList` | 5개 / 4개, 전용 SID 항목 없음 | 동일 |
| `ProgramData\bosang-semgrep-iso` | 없음(루트까지 삭제) | 실행 전에도 없음 |
| 작업 폴더·프로필 폴더·`credential.dpapi` | 모두 없음 | 삭제됨 |
| 감사 Filtering Platform Connection / Process Creation | `No Auditing` / `No Auditing` (`auditpol /get /subcategory:{GUID}`를 GUID로 직접 조회, 종료 코드 0) | 실행 전·후 원문 CSV 줄이 글자 그대로 같음 |
| 가상환경 루트 ACL | SDDL이 실행 전 원본과 **문자열까지 같음**(대소문자 구분 비교), SDDL에 전용 SID 없음 | 일치 |
| 기반 Python 폴더 ACL | 같음, SDDL에 전용 SID 없음 | 일치 |
| 설치물 해시(휠, `semgrep.exe`, `semgrep-core.exe`, 두 `python.exe`, `pyvenv.cfg`) | 모두 실행 전과 같음. 진입점이 실행 뒤에 다시 계산한 `semgrep.exe` 해시도 같음 | 동일 |
| 두 폴더의 파일 수·바이트·최신 수정 시각 | 4,235개/338,435,603B/2026-10-27T02:27:04Z, 95,532개/2,672,287,092B/2026-06-29T00:44:33Z (열거 오류 0) | 동일. 이번 작업으로 쓰이거나 만들어진 파일 0개 |
| `semgrep*` 프로세스 / 전용 SID 소유 프로세스 | 0개 / 0개 | — |

## 6. 증거 파일 (저장소 밖에만 보관, 컴퓨터 이름·사설 IP·경로 포함)

위치: `%LOCALAPPDATA%\bosang-radar\semgrep-isolation\20261028T024629Z-525c2bf9\` 와 `%LOCALAPPDATA%\bosang-radar\semgrep-isolation-baseline\`. 암호·토큰·DPAPI 조각을 찾는 패턴 검색(DPAPI 블롭 접두, `password`, bearer·api key·secret, `ConvertFrom-SecureString`)에서 해당 파일 0개를 확인했다. 암호 파일 `credential.dpapi`는 복구에서 삭제됐다.

| 파일 | 크기(B) | SHA-256 |
| --- | --- | --- |
| `preflight.json` | 506,511 | `aebf11ba852e0d093bcbbc96e160e67ac8203af4bbead9581be1dce07a9d35f6` |
| `version-observation-20261028T025041Z.json` (**본 실행**) | 56,926 | `87434e7ec87f44b1d21ac57de81a011c6846d57c1c7aae6949c7d748a5d4821e` |
| `version-stdout-20261028T025041Z.bin` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (빈 입력의 해시) |
| `version-stderr-20261028T025041Z.bin` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (빈 입력의 해시) |
| `pre-recovery-home-listing.json` | 22,473 | `89fba3c636c9ae8ea50569316be561f0bffa703396bc95a42a782acdae17e8d2` |
| `recovery-20261028T025317140.json` | 2,109 | `7b9a823e2ec02ea1b82e0b7094287afc2a87683b79d699376fc14c5e37460297` |
| `resources.json` (상태 복구 후) | 5,247 | `cf68d2b0d27fbf797d4b65ff138293b8688b4fbba00c06e398348064c39f9e96` |
| `log.jsonl` | 20,970 | `e3b4dac0b8ba47dab1dc3b1768e04903b53c4102ac994d32315c312a15fcba1c` |
| `auditpol-backup.csv` (실행 전 감사 원본) | 5,665 | `755f5cbeacd2fdc2ba8c21499010159a8399c869ff1243e469ae3c3b8c534a6e` |
| `semgrep-isolation-baseline\run-20261028-pre.json` (실행 전 상태·ACL SDDL) | 39,975 | `a697f76822b65fe43602184791ebf0dbcdf0578c8a1833362a008b88017f4603` |
| `semgrep-isolation-baseline\run-20261028-post.json` (복구 후 상태) | 39,981 | `74ff5027f20bfcea3d05f1b3bb86a873fac65c3ffc848c696cb09fd585ac77f5` |
| `semgrep-isolation-baseline\verify-applied-20261028T024629Z-525c2bf9.json` (적용 직후 17항목 확인) | 2,848 | `47fdb30ee1a40941deed4e6418317a751835f83f6dcdd80ad1b596a8b1540db8` |
| `semgrep-isolation-baseline\run-20261028-execute-raw-output.txt` (진입점 원시 출력) | 3,813 | `e9700c417b4d20b7662a91773fb4c50877caec8dccd4c73ade63e8614989580a` |

실행 전·후 상태를 읽고 비교한 스크립트는 이 세션의 임시 폴더에만 있고 커밋하지 않았다(읽기 전용이며 시스템을 바꾸지 않는다).

## 7. 10-27 실행과의 비교 (사실과 해석을 나눈다)

| 항목 | 10-27 (`f5dde226`, 코드 `f099c84`) | 10-28 (`525c2bf9`, 코드 `9bda3ba`) |
| --- | --- | --- |
| `USERPROFILE` | 주지 않음 | 전용 상태 폴더 아래 `home` |
| 결과 | 약 15.4초에 종료 코드 1 | 30초 한도까지 종료하지 않아 강제 종료, 종료 코드 없음 |
| stderr | 3,283B, `RuntimeError: Could not determine home directory.` | 0B |
| 프로세스 체인 | `semgrep.exe` → `python` ×2 → `semgrep-core.exe osemgrep --version` → `pysemgrep.exe` → `python` ×2 | 같다 |
| 루프백 수신 / 귀속 5157 | 0건 / 0건 | 2건 / 0건 |
| 전용 홈의 내용 | 해당 없음(홈 변수 없음) | 비어 있음. `state`에 설정·로그 파일 |

**사실**: 같은 프로세스 체인이 이번에는 10-27에 예외로 끝난 15초 시점을 지나 30초 한도까지 살아 있었고, 그동안 stdout·stderr에는 읽힌 바이트가 없었다. **해석(이번 증거로 확정할 수 없다)**: 홈 위치 오류가 났던 지점은 넘긴 것으로 보인다(예외 추적이 stderr에 없고 프로세스가 살아 있었다). 그러나 왜 끝나지 않았는지는 이 증거로 알 수 없다.

이 문서가 확인하지 않은 가설(시험하지 않았다): (1) 환경의 세 URL이 가리키는 루프백 수신기가 연결을 받고 바로 닫으므로, 응답을 기다리거나 재시도하는 클라이언트가 있을 수 있다. 수신 2건과 지연의 관계는 확인하지 않았다. (2) Semgrep이 `USERPROFILE`이 아닌 다른 위치나 환경 변수를 기다릴 수 있다. (3) 이 PC에서 첫 실행의 `--version`이 단순히 30초보다 오래 걸릴 수 있다. 세 가설 모두 증거가 없다.

## 8. 한계와 남은 위험

1. **1회, 성립하지 않은 실행**이다. `--version`이 정상 동작하는지, 어떤 출력을 내는지, 시간이 얼마나 걸리는지(30초보다 오래 걸리는지, 끝나지 않는지) 모른다.
2. **네트워크 관련 관측은 제한적이다.** 루프백 수신 2건은 귀속 불가이고, 귀속된 5157 0건은 외부 통신이 없었다는 증거가 아니다. DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 않았고, 규칙의 IPv6 필터는 읽지 않았다.
3. 프로세스 기록은 관리자 쪽 폴링이라 놓친 프로세스의 5157은 식별 불가로 남는다. 프로세스 생성 감사(4688)는 켜지 않았다.
4. 진짜 파이프에서의 읽기 실패는 이번에도 나타나지 않았다(`readFailed=false`). 보완한 실행기가 진짜 읽기 실패를 만났을 때의 동작은 여전히 미확인이다.
5. Semgrep이 `USERPROFILE` 말고 `APPDATA` 등을 요구하는지는 모른다. 근거 없이 미리 주지 않았다.
6. `semgrep.exe`·`semgrep-core.exe`는 서명되지 않은 실행 파일이고, 이번 실행은 그 실행을 허용받은 범위에서 1회 한 것이다. 휠 ↔ 공개 소스 커밋 대응(PR #35 보고서 미확인 1)은 여전히 미확인이다.
7. 보안 로그에 이번 실행의 이벤트가 남아 있다(지우지 않았다). 방화벽 규칙 689개는 10-27 복구 직후 값(688개)과 다르며, 이번 실행의 전후 값은 같다(3절).
8. 검증 도구 자체의 결함 두 가지를 실행 중 만나 고쳤다. 적용 직후 확인 스크립트의 ACE 비교가 잘못된 메서드를 불러 한 번 중단됐고(읽기 전용, 수정 뒤 재실행해 17항목 통과), 복구 후 비교 스크립트의 감사 항목 비교가 빈 값끼리 비교해 `SAME`을 냈다. 후자는 증거로 쓰지 않고 원문 CSV 줄을 직접 비교하고 `auditpol`을 다시 읽어 확인했다(5절의 감사 행은 이 확인에 근거한다). 둘 다 시스템을 바꾸지 않는 읽기 스크립트의 결함이다.
9. 이미 커밋된 `Test-IsolationScripts.ps1`의 합성 감사 CSV 줄에 이 PC의 컴퓨터 이름이 들어 있는 것(10-27 보고서 10절)은 고치지 않았다. 이 문서에는 컴퓨터 이름·사설 IP·전체 SID·사용자 경로를 넣지 않았다.

## 9. 소유자 결정이 필요한 것

- **이 결과를 어떻게 다룰지.** 현재 기록은 "이 계약 조건(30초 한도, 홈만 보완한 환경, 루프백 수신기가 연결을 닫음)에서 `semgrep.exe --version`은 30초 안에 끝나지 않았다"까지다. 다음 관측을 할지, 한다면 무엇을 바꿔도 되는지(한도, 수신기의 응답 동작, 버전 확인·메트릭을 끄는 옵션이나 환경 변수, 추가 위치 변수)는 소유자가 먼저 정해야 한다. 이번에는 아무것도 바꾸지 않았다. 출력을 본 뒤 계약을 맞추는 보정이 되지 않도록, 변경은 사전 결정과 별도 작업으로 다루기를 권한다.
- `STREAMS_NOT_CLOSED`를 사용 불가로 두는 기준은 유지했다. 이번 실행은 그 기준을 시험하지 못했다(4.2절).
- `semgrep.exe --version`이 `semgrep-core.exe`와 `pysemgrep`까지 실행하고 30초 이상 살아 있을 수 있다는 관측을 다음 격리 설계(허용 범위, 시간 한도)에 반영할지.
- 이 관측의 사용 범위: 이 문서는 **관측 범위(전용 계정, 이 규칙, `semgrep.exe --version` 1회, 전용 `USERPROFILE`을 준 환경) 안에서** 다음 단계 판단에 사용할 수 있는 근거이며, 버전 확인이나 Semgrep 격리 성공의 근거는 아니다.

## 10. 후속 (2026-10-28, 세 번째 실제 관측)

1절~9절의 문장은 이 문서를 쓰던 시점의 상태이며 바꾸지 않았다. 9절 첫 항목이 남긴 결정 대기에 대해, 소유자 지시로 버전 관측 자식의 환경에만 `SEMGREP_ENABLE_VERSION_CHECK=0`을 더한 조건으로 새 RunId(`20261028T043454Z-730dc964`)에서 별도 1회를 실행했다. 결과는 종료 코드 0, 14.7초, 버전 `1.180.0`의 관측 성립이다. 이 문서의 `NOT_OBSERVED:TIMEOUT` 기록(30초 한도 강제 종료)은 바뀌지 않는다. 변경이 환경 변수 하나였다는 사실과 두 결과가 달랐다는 사실만 말할 수 있고, 그것이 원인이라는 확정은 없다. 상세는 [세 번째 관측 보고서](semgrep-version-observation-20261028-version-check-off.md)에 있다.
