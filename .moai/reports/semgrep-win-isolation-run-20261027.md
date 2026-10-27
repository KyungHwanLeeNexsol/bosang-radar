# Windows 격리 첫 실제 실행: 적용 → 프로브 1회 → 복구 결과

- 작성일: 2026-10-27
- 기준: PR #36 브랜치 `security/semgrep-lsp-win-isolation`의 HEAD `6e2d29c5b0256a3539546857b86f7a3de5e55333`. 실행 전에 로컬 HEAD, 원격 HEAD, PR 헤드가 모두 이 값이고 작업 트리에 변경이 없음을 확인했다.
- 성격: 계획서(`semgrep-win-isolation-plan-20261027.md`)가 "미확인"으로 남긴 `-Apply`·`-Execute` 경로를 **이 PC에서 한 번** 실제로 실행한 기록이다. 스크립트·코드는 바꾸지 않았고, 이 문서만 추가한다.
- 이 문서가 말하는 범위는 **Windows PowerShell 5.1 부모→자식 프로세스의 TCP IPv4 연결 두 가지(`127.0.0.1`, `192.0.2.1:9`)를 한 번 시도한 결과**뿐이다. `semgrep`·`semgrep-core`·가상환경 `python`·DNS·UDP·ICMP·IPv6의 격리는 관측하지 않았고 주장하지 않는다.

## 1. 결론

| 항목 | 결과 | 확인 수준 |
| --- | --- | --- |
| 사전 점검 | 적용 차단 항목 없음(PASS 9, INFO 5, NEEDS_GRANT 1). NEEDS_GRANT(P12)는 가상환경 폴더 권한 안내이고 이번 실행은 해당 옵션을 쓰지 않았다 | 실행·확인 |
| 적용(`-Apply`) | 종료 코드 0. 계정·규칙·작업 폴더 생성. 규칙의 계정 범위와 차단 범위를 **직접 다시 읽어** 요청과 일치함을 확인한 뒤 프로브를 진행했다 | 실행·확인 |
| 프로브(`-Execute`) | 종료 코드 0, 판정 `PROBE_ISOLATION_OBSERVED`. 신원 교차 확인 통과, 루프백 연결 성공, `192.0.2.1:9` 연결은 `AccessDenied`, 이번 실행에 귀속된 5157 1건 | 실행·확인(1회) |
| 복구(`-Apply -RemoveProfile`) | 종료 코드 0, 항목 전부 `OK`/`ALREADY_RESTORED`. 실행 전 따로 저장한 기록과 **직접 읽어 비교**해 계정·규칙·폴더·프로필·`credential.dpapi`·감사 값이 모두 원래대로임을 확인했다 | 실행·확인 |
| 관측하지 못한 것 | 3절 참고. 특히 단 1회 실행이며 `semgrep`·`python`·DNS·UDP·IPv6 등은 관측하지 않았다 | **미확인** |

## 2. 실행 입력

- 환경: Windows 11 Home(빌드 26200), 관리자 권한 셸. 스크립트는 Windows PowerShell 5.1(`powershell.exe`)로 실행했다.
- 쓰지 않은 옵션: `-GrantReadExecute`, `-VenvPython`, `-IncludeSelfAddressProbe`, `-IncludeProcessCreationAudit`. 기존 설치 폴더·기존 사용자 프로필의 ACL은 바꾸지 않았다. `semgrep` 계열 명령과 패키지 임포트는 실행하지 않았다.
- 실행 식별: RunId `20261027T074758Z-207d08f6`, 계정 `bsi207d08f6`(SID `S-1-5-21-…-1007`), 규칙 `bosang-semgrep-iso-20261027T074758Z-207d08f6-out`, 확인 해시(ConfirmSnapshot) `b04eca59b288`.
- 실행 기록 폴더(저장소 밖): `%LOCALAPPDATA%\bosang-radar\semgrep-isolation\20261027T074758Z-207d08f6`

## 3. 단계별 기록

### 3.1 실행 전 기준값(스크립트 밖에서 따로 저장)

복구 뒤 비교하려고 적용 전에 직접 읽어 둔 값: 로컬 계정 5개, 방화벽 규칙 688개(우리 접두 0개), `ProgramData\bosang-semgrep-iso` 없음, `C:\Users` 프로필 폴더 5개, 감사 "Filtering Platform Connection"·"Process Creation" 둘 다 `No Auditing`.

### 3.2 사전 점검 → dry-run → 적용

| 단계 | 종료 코드 | 요점 |
| --- | --- | --- |
| 읽기 전용 사전 점검 | 0 | 적용 차단 항목 없음. 스냅숏 SHA-256 앞 12자리 `b04eca59b288` |
| 적용 dry-run | 0 | 만들 이름과 차단 범위만 출력, 아무것도 만들지 않음 |
| 적용 `-Apply -ConfirmSnapshot b04eca59b288` | 0 | 계정(Users 그룹만, 만든 직후 비활성)·작업 폴더·꺼진 채 만든 뒤 켠 규칙 |

**적용 직후 직접 다시 읽은 값**(스크립트의 출력이 아니라 별도 조회):

| 항목 | 읽은 값 | 요청과 일치 |
| --- | --- | --- |
| 계정 | 비활성, 소속 그룹 `Users`만, SID가 기록과 같음 | 예 |
| 규칙 동작 | Outbound / Block / 활성 / 프로필 Any / 프로토콜·포트·프로그램 Any | 예 |
| 규칙의 계정 범위 | `LocalUser = D:(A;;CC;;;S-1-5-21-…-1007)`, 이 SID 하나뿐 | 예 |
| 규칙의 차단 범위 | `0.0.0.0-126.255.255.255`, `128.0.0.0-255.255.255.255`(루프백 `127/8`만 제외), IPv6 `::2-…` | 예 |
| 작업 폴더 ACL | 상속 끊김, SYSTEM·Administrators 전체 제어, 전용 계정 수정 | 예 |

### 3.3 프로브 1회(`Test-IsolationEffect.ps1 -Execute`, 시작 2026-10-27T07:50:56Z, 종료 07:51:04Z)

결과 파일 `verification-20261027T075054Z.json`을 항목별로 읽었다. 항목을 섞지 않고 적는다.

**[신원] 통과(실패 0건).** 부모 PID 20756 → 자식 PID 23284. 두 프로세스 모두 소유 SID가 전용 계정이고 실행 파일이 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`다. 자식의 부모 PID가 20756이고, 부모가 보고한 자식 PID가 CIM 기록과 같다. 자기 보고와 CIM 기록(PID·경로·SID·시작 시각)이 일치하고 실행 토큰이 이번 실행의 것이다.

**[A] 연결 시도 결과.**

| 대상 | 시도 시각(UTC) | 결과 | 판정 |
| --- | --- | --- | --- |
| `127.0.0.1:13416` | 07:51:01.9156 ~ .9388 | `connected` | `ALLOWED_AS_EXPECTED` |
| `192.0.2.1:9` | 07:51:01.9438 ~ .9583 | `socket-error` / `AccessDenied` | `OS_BLOCK_OBSERVED` |

연결 실패만으로 차단이라고 쓰지 않는다. 아래 [C]의 5157이 맞았기 때문에 이 판정이 나왔다.

**[B] 루프백 수신기.** 수신 1건(출발 `127.0.0.1:13417`). 수신기는 연결한 계정을 볼 수 없고, 스크립트가 신원 교차 확인 통과를 근거로 전용 계정의 것으로 귀속했다(`attributedToDedicatedAccount=true`). 이 값은 "외부 통신이 없었다"는 뜻이 아니다.

**[C] OS 차단 관측(5157).** 수집 성공, 실패 감사 켜짐 확인, 로그 밀림 없음, 프로세스 기록 정상. 이번 실행에 맞춘 이벤트 1건: 레코드 2101229, PID 23284(자식), 방향 Outbound, 프로토콜 TCP(6), 목적지 `192.0.2.1:9`, 응용 프로그램 `\device\harddiskvolume4\windows\system32\windowspowershell\v1.0\powershell.exe`, 시각 07:51:01.944Z(연결 시도 구간 안), 필터 RTID 69213. 이번 실행의 다른 목적지로 간 5157은 0건이다.

식별 불가 7건은 모두 PID 4(System)의 **인바운드 UDP 137/138**(NetBIOS, 사설 대역 이웃 PC에서 온 패킷)로, 이번 실행의 프로세스가 아니라서 제외됐다. 실패 감사를 켜 둔 동안 시스템이 받던 패킷이 함께 기록된 것으로 보이며(추정), 이 실행의 프로세스와 PID가 맞지 않는다는 점은 결과 파일의 제외 사유로 확인했다.

**[D] 판정.** `PROBE_ISOLATION_OBSERVED`(위 범위 한정). 이 판정은 프로브 두 종류에 대한 관측이다.

**[E] 정리(검증 단계 안).** 수신기 정지 `DONE`, 남은 프로브 `NONE_LEFT`, 계정 `DISABLED`(끈 뒤 `Enabled=false` 확인), 감사 `RESTORED`(원래 0, 설정 2, 현재 0).

### 3.4 스크립트 밖에서 추가로 읽은 것: 5157의 필터는 우리 규칙의 것인가

5157은 "필터링 플랫폼이 연결을 막았다"는 사실만 말한다. 이벤트의 필터 RTID 69213이 **우리 규칙이 만든 필터**인지는 스크립트가 대조하지 않으므로, 규칙을 지우기 전에 `netsh wfp show filters`로 필터 목록(읽기 전용 덤프)을 읽어 찾았다. 이 대조는 스크립트의 판정에 쓰이지 않았고, 이 문서의 보강 확인이다.

- 필터 ID 69213: 이름 `bosang semgrep isolation outbound block (20261027T074758Z-207d08f6)`, 설명 `bosang-semgrep-iso:20261027T074758Z-207d08f6`, 레이어 `FWPM_LAYER_ALE_AUTH_CONNECT_V4`, 동작 `FWP_ACTION_BLOCK`.
- 조건: 원격 주소가 두 IPv4 범위(`0.0.0.0–126.255.255.255`, `128.0.0.0–255.255.255.255`) **그리고** `ALE_USER_ID`가 전용 계정 SID 하나.
- 복구 뒤 같은 덤프에서 69213과 우리 설명을 가진 필터는 0개였다.

계획서가 미확인으로 남긴 것 가운데 이번 1회에서 관측된 것: `LocalUser` SDDL 문자열과 `RemoteAddress` 범위를 이 PC가 그대로 받아 필터로 만들었다. 5157의 Process ID는 십진수로 기록됐다(`processIdFormat=decimal`). 계정 범위 규칙은 부모가 띄운 자식 PowerShell 프로세스에도 적용됐다(5157의 PID가 자식).

### 3.5 복구(`Remove-Isolation.ps1`)와 사후 비교

복구 dry-run(종료 코드 0)에서 지울 대상이 우리가 만든 것뿐임을 확인한 뒤 `-Apply -RemoveProfile`을 실행했다. 종료 코드 0, 복구 기록 `recovery-20261027T075239786.json`, 실행 기록 상태 `recovered`. 소유 확인에 실패한 자원은 없었다.

| 대상 | 복구 결과 | 사후 직접 읽기(조회 성공 여부) | 실행 전 기록과 비교 |
| --- | --- | --- | --- |
| 방화벽 규칙 | `OK` | 규칙 688개, 우리 접두 0개(성공) | 개수 동일 |
| 로컬 계정 `bsi207d08f6` | `OK` | 계정 5개, `bsi*` 없음(성공) | 목록 동일(이름·사용 여부·SID) |
| 프로필 `C:\Users\bsi207d08f6` | `OK` | 프로필 폴더 5개, `ProfileList` 레지스트리 항목 없음(성공) | 목록 동일 |
| 작업 폴더·작업 루트 | `OK` | `ProgramData\bosang-semgrep-iso` 없음(성공) | 실행 전에도 없었음 |
| `credential.dpapi` | `OK` | 실행 기록 폴더에 없음(성공) | 파일 삭제됨 |
| 감사 "Filtering Platform Connection" | `ALREADY_RESTORED` | `No Auditing`(성공, GUID로 읽음) | 원래 값 동일 |
| 감사 "Process Creation" | 바꾼 적 없음 | `No Auditing`(성공) | 동일 |
| WFP 필터 | 규칙 삭제로 함께 제거 | 69213 및 우리 설명 필터 0개(성공) | 해당 없음 |
| 리스너·남은 프로세스 | — | 13416 연결 0, 전용 SID 소유 프로세스 0(성공) | — |

"없음"이라고 적은 항목은 모두 조회가 성공한 경우다. 조회가 실패한 항목은 없었다.

## 4. 실행 중 있었던 일과 계획과의 차이

- **첫 실행 시도가 거부됐다.** README의 `-ExecutionPolicy Bypass`로 사전 점검을 처음 부르자 자동 권한 판정이 거부했고(표시된 사유는 "보안 약화"뿐이며, `Bypass` 옵션 때문이라는 것은 추정이다), 이때는 아무것도 실행되지 않았다. 이 PC의 실행 정책이 `RemoteSigned`이고 스크립트에 인터넷 다운로드 표시가 없음을 읽기로 확인한 뒤, 이후 진입 스크립트는 모두 **더 엄격한 `-ExecutionPolicy RemoteSigned`로 지정해** 실행했다. 거부를 우회한 것이 아니라 요구 권한을 낮춘 것이다.
- **스크립트가 직접 하는 `Bypass`는 그대로다.** 프로브를 띄우는 코드(`IsolationFlows.ps1:306`, `probe-parent.ps1:26`)는 프로세스 범위 `-ExecutionPolicy Bypass`를 쓴다. 이번 실행에서 이 호출은 막히지 않았고 코드는 바꾸지 않았다.
- **도구 세션의 PATH에 `System32`가 없었다.** 스크립트는 `auditpol`을 전체 경로로, 감사 하위 범주를 GUID로 부른다. 대표적인 외부 명령(`icacls`·`netsh`·`whoami`·`taskkill` 등)을 부르는 곳은 코드 검색에서 0건이었고, 이번 실행은 오류 없이 끝났다. 그래서 PATH는 바꾸지 않았다.
- **제 읽기 호출 한 번이 실패했다.** 기준값을 저장할 때 `auditpol`을 영어 하위 범주 이름으로 불렀더니 한국어 Windows라 오류 87이 났다(읽기 전용, 영향 없음). 이후 GUID로 다시 읽었다.
- 스크립트 오류, 중간 중단, 되돌림 실패는 없었다. 프로브는 1회만 실행했고 재시도·수정 재실행은 하지 않았다.

## 5. 한계와 남은 위험

1. **1회 실행.** 같은 조건에서 반복했을 때의 재현성은 모른다.
2. **관측 범위가 좁다.** PowerShell 5.1 부모→자식의 TCP IPv4 두 목적지뿐이다. `semgrep`·`semgrep-core`·가상환경 `python`·DNS·UDP·ICMP·IPv6는 관측하지 않았고, 규칙의 프로토콜·포트·프로그램이 `Any`라서 더 넓게 막힐 수 있다는 것은 추정이며 확인하지 않았다. 서비스가 대신 수행하는 통신(예: DNS 해석)이 규칙을 지나는지도 관측하지 않았다.
3. **IPv6 필터는 읽지 않았다.** 규칙의 주소 범위에 IPv6가 들어 있지만, 3.4절에서 읽은 것은 IPv4 연결 레이어(`ALE_AUTH_CONNECT_V4`)의 필터 하나다.
4. **루프백 수신 귀속은 간접 증거다.** 수신기가 연결한 계정을 직접 볼 수 없고 신원 확인 통과에 기댄 귀속이다.
5. **프로세스 생성 감사는 켜지 않았다**(`-IncludeProcessCreationAudit` 미사용). 신원은 실행기가 직접 기록한 CIM 프로세스 정보로 확인했고, 4688 이벤트로 사람이 교차 확인할 기록은 남기지 않았다.
6. **README의 "확인 수준" 표는 이 실행으로 낡았다.** `-Apply`/`-Execute` 경로를 "실행하지 않았다(미확인)"로 적은 행과 첫 문단의 "한 번도 실행되지 않았다"는 이 문서가 대체한다. README는 이번 요청 범위 밖이라 수정하지 않았다.
7. **보안 로그에 이번 실행의 이벤트가 남아 있다.** 로그를 지우지 않았다. 순환 로그라 오래된 기록은 밀려날 수 있다.
8. **실행 증거 파일은 저장소 밖에만 있다.** 컴퓨터 이름과 사설 IP가 들어 있어 커밋하지 않았다. 아래 해시로 같은 파일임을 대조할 수 있다.

| 파일(`%LOCALAPPDATA%\bosang-radar\semgrep-isolation\20261027T074758Z-207d08f6\`) | SHA-256 |
| --- | --- |
| `preflight.json` | `b04eca59b288626355a6eb3109ee93e7d84fff95c97a67f4b5b99218a73654e4` |
| `verification-20261027T075054Z.json` | `32a2e70859e18f8eaed4b0dfb8ef5426e575a327f93c719d8cc630b3452f4768` |
| `recovery-20261027T075239786.json` | `b4ad29ffb877bf62674762b2015a73ff89b4d8532af20595c5ac8fa278fc8592` |
| `resources.json` | `f9dc0a27bf5058bb2fecaeeb8d44e36dd8c1dab46e56d7f6daf06b8042f541c7` |
| `log.jsonl` | `5be14a329b08285855e90b390996340c4c797dd6a14af32592a89ae28d9e9c60` |

## 6. 하지 않은 것

스크립트 기능 변경, `semgrep` 계열 실행, 규칙 내려받기, 스캔, 핀 확정, 보안 게이트 연결, ADR `Accepted` 전환, 다른 PR·`main`·`bodam` 변경, 병합·배포. `-GrantReadExecute`로 기존 ACL에 SID를 추가하는 일도 하지 않았다.

## 7. 소유자 결정이 필요한 것

- README의 "확인 수준" 표를 이 결과에 맞게 고칠지.
- 이 1회 관측을 근거로 다음 단계(가상환경 읽기 권한 부여를 포함한 격리 구성)로 넘어갈지. 이 문서는 그 판단의 근거가 아니라 프로브 두 종류에 대한 관측 기록이다.
