# LSP-MIN-1 관리자 진입점: 구현 기록과 실제 1회 실행 계획

- 작성일: 2026-10-29
- 기준: PR #38의 HEAD `e0cf06f78ea4fef90cca1d3f8c7ce6f6a91d2d4e`. 그 위에 별도 브랜치 `security/semgrep-lsp-min-start-admin`을 만들어 코드, 시험, README, 이 문서를 더했다.
- 성격: **코드와 모의·스텁 시험까지만 다룬다.** 실제 Semgrep은 `--help`, `--version`을 포함해 실행하지도 임포트하지도 않았다. 실제 격리 적용, 프로브, 규칙 다운로드, 스캔, 음성 대조도 하지 않았다. 이 PC의 계정·방화벽·감사·ACL은 읽기만 했고(시험 전후 비교), 바꾸지 않았다. 병합과 배포도 없다. `pin.json`, `verified`, `policy_accepted`, ADR 상태, 기존 PR, `main`, 보담 저장소는 그대로다.
- 구분 표기: **사실** = 이번에 실행한 시험의 출력이나 읽은 파일의 내용, **도출** = 사실을 이어 붙인 판단, **실행 필요** = 실제 Semgrep을 띄워 봐야만 확인되는 것.

## 1. 결론

| 질문 | 답 | 구분 |
| --- | --- | --- |
| 관리자 진입점이 만들어졌는가 | 예. `Test-LspMinObservation.ps1`. 기본은 읽기 전용 사전 확인과 dry-run이고, `-Execute` 없이는 수신기·감사 창·계정·복사·러너 실행을 하지 않는다 | 사실 |
| 진입점 → 러너 → 결과 재해석 → 정리 전체 흐름이 확인됐는가 | 모의 시스템 위에서 확인했다. 러너와 스텁 서버는 **현재 사용자로 실제 실행**되고, 계정·방화벽·감사·ACL·Security 로그는 모의다 | 사실 |
| 실제 Semgrep, 전용 계정, 방화벽, 감사, ACL 아래에서 확인됐는가 | 아니오. 한 번도 하지 않았다 | 사실 |
| 지금 실제 1회 실행이 가능한가 | 코드는 갖춰졌다. 다만 아래 5절의 선행 조건(소유자 결정 포함)이 남아 있다 | 도출 |

## 2. 확정된 계약과 이번에 지킨 방식

| 계약 | 지킨 방식 |
| --- | --- |
| `STDIN_CLOSED` 종료는 `OBSERVED`를 유지하되 `SELF_EXIT`와 구분 | 기존 기록 조립기를 그대로 쓴다(PR #38 `e0cf06f`). 이 PR은 그 모듈을 고치지 않는다 |
| 강제 종료는 `NOT_OBSERVED`, 유효했던 초기화 응답 등 관측 사실은 보존 | 같음. 재해석 시험에서 러너가 본 사실(`initialize.response`, 송신 목록)이 관리자 사유가 붙어도 그대로 남는 것을 확인한다 |
| 읽기 실패·후속 사유·중복 응답 처리는 현재 수정본 유지 | 같음. `lsp-min.ts`, `lsp-min-run.ts`, `lsp-min-runner-result.ts`, 러너와 계약 이식본은 한 줄도 바꾸지 않았다 |
| `initialized`를 보내지 않는다. LSP 환경에 `SEMGREP_ENABLE_VERSION_CHECK`를 더하지 않는다 | 새 파일의 코드 문자열에 두 이름이 없음을 정적 점검(AST)이 지킨다. 요청 자기 점검은 환경 이름이 계약 목록과 다르면 거절한다 |
| `read_error` 필드 추가 유지 | 기존 필드 그대로. 새 문맥 스키마는 별도(`lsp-min-admin-context/1`)다 |

## 3. 요청한 역할 7가지 ↔ 구현 ↔ 시험

| # | 요청 | 구현 | 시험 |
| --- | --- | --- | --- |
| 1 | 기존 격리·복구 흐름 재사용, 기본은 읽기 전용 사전 확인과 dry-run | `IsolationCommon.ps1`의 변경 관문(`Invoke-Mutation`), 감사 창, 정리 항목, 5157 대조를 그대로 쓴다. `-Execute` 없이는 첫 변경 앞에서 돌아온다 | 흐름 `dry-run`(모의 상태·호출 기록 불변), 정적 점검 (G-1) |
| 2 | 정확한 실행 파일 경로·전체 기대 해시, 이름만으로 허용 금지, 배포물 보고서 대조, 핀 파일 불변 | `-DistRoot`에서 도출한 경로와 정확히 같고 경로 조각에 링크가 없어야 한다. 64자리 해시(실행 파일·휠, 선택 core)와 PR #35 보고서의 `경로(크기바이트, SHA-256)` 짝·휠 행을 대조한다. 코드는 핀 파일을 가리키지 않는다 | 단위 시험(해시 축약·충돌·크기 불일치·pysemgrep 혼동), 흐름 `real-mode`(경로·정션·해시·보고서 변조), 정적 점검 |
| 3 | 실행별 토큰·RunId 결합, 이전 결과 재사용 거절, 경로·SID·시작 시각·부모 관계 확인, 자기 보고만 믿지 않음 | 토큰 `lsp-<RunId>-<난수>`. 시작 전 이전 요청·결과·중단 파일 삭제. 결합 검사(토큰·모드·요청 반향·시작 시각)와 관리자 CIM 교차 확인(소유 SID·실행 파일·부모·명령줄·시작 시각·자기 보고) | 흐름 `result`, `identity`(9가지), `binding`(5가지), 단위 시험 |
| 4 | 수신기를 자식보다 먼저 준비·실행 중 감시, 적중·관측 실패 시 중단 전달, 폴러·전달 실패도 기록 | `New-LspMinReceiver`가 감사 창·계정·자식보다 먼저. 적중 `A3:RECEIVER_HIT`, 읽기 실패 `A3:RECEIVER_UNREADABLE`. 전달 실패는 기록하고 전용 계정 프로세스를 직접 종료 | 흐름 `receiver`(적중·시작 전 적중·읽기 실패·전달 실패), `receiver-not-ready` |
| 5 | 러너의 동기 호출과 독립된 부모 감독, 정체 시 마감에 중단 요청 후 정리, 결과 없으면 관측 실패+복구 계속 | 관리자 루프가 순수 결정 함수로 마감을 판단한다: 기동 허용 20초 + totalMs에 `A7:SUPERVISOR_DEADLINE` 요청, killConfirm + 유예 뒤에도 러너가 있으면 전용 계정 프로세스 종료 | 흐름 `hang`(요청도 중단 파일도 읽지 않는 **진짜 정지 스텁 프로세스**), `cancel`, `result`, 단위 시험 |
| 6 | 귀속된 5157, 식별 불가, 루프백 건수를 따로 기록, 읽기 실패·로그 밀림·감사 미확인은 0으로 채우지 않음 | 건수는 `Get-LspMinOsBlockCounts`를 거쳐 따로 적고, 수집이 확실하지 않으면 `null`과 사유 | 단위 시험(5가지 불확실 사유), 흐름 `control`(숫자 0은 확실할 때만), `receiver`(루프백 `null`) |
| 7 | 관측·프로세스 정리·시스템 복구 분리, 한 항목의 실패가 뒤의 복구를 중단시키지 않음 | 보고서의 `observation` / `processCleanup` / `systemRecovery`. 정리 항목은 각각 독립 실행. 종료 코드는 정리 실패 70, 관측 성립 0, 불성립 60 | 흐름 `cleanup`(계정 비활성화 실패, 감사 복구 실패, 종료 호출이 듣지 않음) |

## 4. 검증 결과

### 4.1 실행한 것 (2026-10-29, 이 PC 한 대. 관리자 권한 세션)

| 검증 | 결과 | 구분 |
| --- | --- | --- |
| `Test-LspMinAdmin.ps1` (단위·흐름·진짜 상태 불변) | 안쪽 엔진 pwsh 7 **253/253**, Windows PowerShell 5.1 **253/253**, 건너뜀 0 | 순수 계약·정적 구조는 합성 입력. 흐름은 아래 4.2 |
| `Test-IsolationScripts.ps1` (정적 구조, 새 절 G 포함) | pwsh 7 **317/317**, 5.1 **317/317** | 파일 읽기와 메모리 계산뿐 |
| `Test-LspMinRunner.ps1` (기존, 바꾸지 않음) | pwsh 7 296/296, 5.1 296/296 | 기존 러너가 회귀하지 않았다는 확인 |
| `Test-IsolationFlows.ps1`, `Test-VersionFlows.ps1` (기존) | 162/162, 141/141 (pwsh) | 이 두 시험이 읽는 파일(`IsolationCommon.ps1`, `IsolationFlows.ps1` 등)은 이 PR에서 바꾸지 않았다. 시험은 작업 중간에 한 번 돌렸고 그 뒤에 바뀐 것은 새 파일과 `Test-IsolationScripts.ps1`뿐이다 |
| `vitest run scripts/semgrep-lsp` | 66개 파일, **3096** 통과, 8 건너뜀(기존 파일의 것), 0 실패. PR #38 기준 3059에서 +37 (재해석 36, 구조 1) | 합성 입력 |
| `eslint scripts/semgrep-lsp`, `prettier --check scripts/semgrep-lsp scripts/semgrep-lsp-isolation` | 통과 | `.moai/` 아래 이 보고서는 prettier 제외 대상이라 검사하지 않았다 |
| `tsc --noEmit` | 오류 1건 `app/layout.tsx(20,50) LayoutProps` | 이번 변경과 무관한 기존 오류 |
| 진짜 시스템 상태 불변 | 시험 전후에 읽기 전용으로 비교: 전용 계정(`bsi*`), 방화벽 규칙(`bosang-semgrep-iso*`), 감사 값 둘(`auditpol /get`), `%ProgramData%\bosang-semgrep-iso` 루트와 그 안의 이름. 모두 같았다 | 관리자 권한이라 `auditpol` 읽기가 됐다(비관리자면 읽지 못한 값을 통과가 아니라 건너뜀으로 표시한다) |

### 4.2 흐름 시험이 실제로 실행한 것과 모의인 것

| 실제 Windows 11에서 실행됨 | 모의(합성) |
| --- | --- |
| 진짜 `lsp-min-runner.ps1`과 스텁 서버 프로세스(**현재 사용자로**), 실제 파이프·프로세스 트리·CIM 읽기, 실제 루프백 수신기(`TcpListener`)와 연결, 실제 중단 파일, 요청도 중단 파일도 읽지 않는 **진짜 정지 스텁 프로세스**의 종료, 실제 정션 검사, 실제 TS 재해석(tsx) | 전용 계정, 방화벽 규칙, 감사 정책, ACL, Security 로그와 5157 이벤트(주입한 합성 이벤트), `Start-Process -Credential`(모의가 가로채 현재 사용자로 실행), 설치물(흉내 파일이고 실행하지 않는다) |

실제 Semgrep, 실제 전용 계정·방화벽·감사·ACL 아래의 동작은 한 번도 확인하지 않았다.

### 4.3 흐름 시험이 덮는 경우

정상(`control`), dry-run, 도구 없음, 수신기 준비 실패, 재해석 실패, 수신기 적중·**러너 시작 전 적중**·읽기 실패·중단 파일 전달 실패, 취소, **러너 정체(진짜 정지 스텁)**, 결과 누락·손상·이전 토큰 재사용, 신원 불일치 9가지, 결합 불일치 5가지, 스텁 서버 변종 5가지, 5157 갈래(귀속·수집 실패·로그 밀림·감사 미확인·식별 불가), 이전 작업 배치(일반 파일 삭제, 정션이 있으면 지우지 않고 멈춤), 정리 부분 실패 3가지(계정 비활성화·감사 복구·종료 호출이 듣지 않음), 실제 모드의 사전 조건 실패·거부 경로(경로, 정션, 해시, core, 보고서 부재·변조, 해시 축약, 필수 인자 없음, 한도 변경)와 `-Execute`가 모의에 막혀 러너가 띄워지지 않는 경로.

### 4.4 독립 검토 (읽기 전용 에이전트 1회, 코드만 주고 결론은 주지 않음)

Blocker 0, Major 4, Minor 9. 검토자는 시험이나 PowerShell을 실행하지 않았다(정적 읽기). 항목마다 코드로 확인했고 모두 사실이었다.

| 지적 | 처리 |
| --- | --- |
| M1 감독 루프 안에 제한 시간 없는 호출(`GetOwnerSid`, `Get-ProcessRecord`, `Get-Process -IncludeUserName`), README 문장이 실제보다 넓음 | 소유 SID·프로세스 기록 조회를 `-OperationTimeoutSec`을 주는 포트로 옮겼다. 강제 종료는 추적한 PID(소유 SID·시작 시각 재확인)를 이름 열거보다 먼저 끝낸다. 정적 점검이 직접 호출을 금지한다. `Get-Process -IncludeUserName`은 제한 시간을 줄 수 없어 남는다(README에 그렇게 적었다) |
| M2 5157이 판정에 반영되지 않음 | 귀속 1건 이상은 `OS_BLOCK_ATTRIBUTED`, 수집 실패·감사 미확인·로그 밀림은 `OS_BLOCK_EVIDENCE_UNAVAILABLE`로 관측이 성립하지 않는다. TS 문맥에도 `ADMIN_OS_BLOCK_*`로 전달한다. 식별 불가는 막지 않는다 |
| M3 관리자 권한 재귀 삭제에 링크 확인 없음 | 사전 조건 T08과 삭제 직전 재확인(링크를 따라가지 않고 찾는다), 삭제는 계정을 켜기 전에 한다 |
| M4 5157 연결부를 흐름 시험이 한 번도 거치지 않음 | 모의에 러너 트리의 자식 PID에 귀속되는 이벤트 주입을 더했고 5가지 갈래를 시험한다. 처음에 모의가 `conhost.exe`를 자식으로 잘못 기억해 귀속 시험이 실패했고(시험 도구의 오류), 스텁 서버만 기억하도록 고쳤다 |
| m1 수신기 비우기 무제한 | 호출당 256건 상한 |
| m2 느린 재해석이 정리 앞, 시간 제한 없음 | 재해석은 정리 뒤로, 120초 제한(시간이 지나면 도구 프로세스를 끊는다) |
| m3 강제 종료 사유 오표기, 열거 실패 시 대체 경로 없음 | 사유에 실제 중단 요청 사유(`ABORT_NOT_FOLLOWED:<요청>`), 추적 PID 우선 |
| m4 항상 참인 단언, 정지 스텁 누수 | 단언을 실제 종료 확인으로 바꾸고 정지 스텁 명령줄에 샌드박스 경로를 넣었다 |
| m5 비관리자에서 공허한 통과 | 읽지 못한 값은 건너뜀, 루트 안의 이름까지 비교 |
| m6 불완전 관측 신호가 사유가 되지 않음 | `observation.caveats`로 따로 적는다(프로세스 표 읽기 실패, 관리자 정리가 끝낸 잔존 프로세스). 성립을 막지는 않는다. 최종 수신기 읽기 뒤의 접속은 세지 않는다(README에 적었다) |
| m7 사전 조건 단계의 예외가 종료 코드 1 | ACL 읽기 실패와 매니페스트 읽기 실패를 사전 조건 실패(50)로 바꿨다 |
| m8 러너가 거절할 경로를 관리자가 거르지 않음 | 사전 조건 T09·L11 |
| m9 러너 부모 관계 미확인, 링크 점검 범위 | 러너의 부모는 `Start-Process -Credential`에서 신뢰할 기준이 아니라 확인하지 않는다(README). 링크 점검은 가상환경 python 경로와 기반 Python 폴더까지 넓혔다. 후손 기록 재조회는 하지 않았다(실패 쪽으로 기울어 안전) |

### 4.5 하지 않은 것

- **변이 점검(mutation)은 하지 않았다.** 이전 라운드와 달리 이번에는 단언 하나씩 무효화해 보는 점검을 돌리지 않았다. 대신 독립 검토가 항상 참인 단언을 찾았고(m4) 고쳤다.
- 두 번째 독립 검토는 하지 않았다. 지적 반영 이후의 코드는 독립적으로 다시 읽히지 않았다.
- Linux는 이 변경과 무관하다(Windows 전용 PowerShell과 TS 순수 모듈).

## 5. 실제 1회 실행 전에 남은 것과 실행 계획

**이 PR은 실제 실행을 허용하지 않는다.** 아래는 소유자가 검토한 뒤 정할 때 쓸 계획이다.

### 5.1 소유자 결정이 필요한 것

| # | 결정 | 이 PR의 입장 |
| --- | --- | --- |
| D1 | 이 구현으로 실제 LSP 최소 관측을 1회 허용할지 | 정하지 않았다 |
| D2 | 배포물 바이너리와 공개 소스의 대응이 증명되지 않은 상태(PR #35 미확인 항목)에서 실행해도 되는지 | 정하지 않았다 |
| D3 | 5157 증거가 불확실하면 관측을 성립시키지 않는 정책(`OS_BLOCK_EVIDENCE_UNAVAILABLE`)을 받아들일지. 감사 켜짐과 로그 비밀림이 확인돼야 성립한다 | 이 PR이 정했다(되돌리려면 `Get-LspMinOsBlockFailureTokens` 한 곳) |
| D4 | 재해석 도구(tsx)를 실제 실행의 필수 조건으로 두는 것(L09) | 이 PR이 정했다 |
| D5 | PR #36의 선결 결정 5건과 계정·방화벽·감사·ACL 적용 승인(`Initialize-Isolation.ps1 -Apply`) | 이 PR은 적용하지 않는다 |
| D6 | 이전 `--version` 관측의 TIMEOUT(2026-10-28) 원인이 미확정인 채로 150초 제한의 LSP 서버를 띄우는 것 | 정하지 않았다 |

### 5.2 선행 조건 (실제 실행은 이것들이 모두 갖춰진 뒤)

1. PR #36의 적용(`Initialize-Isolation.ps1 -Apply -ConfirmSnapshot <12자리> -GrantReadExecute "<가상환경 폴더>,<기반 Python 폴더>"`)이 이번 실행에 대해 끝나 있어야 한다(`resources.json`의 `aclGrant` 두 줄이 사전 조건 L08에서 확인된다).
2. 설치물: `<DistRoot>\venv\Scripts\semgrep.exe`가 PR #35 보고서의 해시·크기와 같고, 휠과 `semgrep-core.exe`도 같다(L03~L06).
3. tsx와 `lsp-min-reinterpret-cli.ts`(L09).
4. 사전 조건 T08(이전 배치에 링크 없음), T09·L11(경로에 거절 문구 없음).

### 5.3 명령 (모두 관리자 권한, 바꾸기 전에는 반드시 dry-run부터)

```powershell
$d  = '<저장소>\scripts\semgrep-lsp-isolation\windows'
$ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$common = @('-NoProfile','-ExecutionPolicy','RemoteSigned','-File',"$d\Test-LspMinObservation.ps1",'-RunDir','<RunDir>',
            '-DistRoot','<...>\semgrep-dist\1.180.0','-SemgrepExe','<...>\semgrep-dist\1.180.0\venv\Scripts\semgrep.exe',
            '-ExpectedExeSha256','<64자리>','-WheelPath','<휠>','-ExpectedWheelSha256','<64자리>',
            '-DistReport','<저장소>\.moai\reports\semgrep-dist-verification-20261027.md',
            '-TsxCmd','<저장소>\node_modules\.bin\tsx.cmd','-NodeDir','<node 폴더>')

# 1. 읽기 전용: 사전 조건과 계획만 (아무것도 바꾸지 않는다). 모든 항목이 PASS여야 한다
& $ps @common

# 2. (별도 승인, 단 1회) 실행
& $ps @common -Execute

# 3. 판독 후 복구 (기존 명령)
& $ps -NoProfile -ExecutionPolicy RemoteSigned -File "$d\Remove-Isolation.ps1" -RunDir <RunDir> -Apply
```

`-Execute`는 한 번만 쓴다. 실패해도 같은 관측을 되풀이하지 않는다. 다음 단계는 결과를 읽고 소유자가 정한다.

### 5.4 결과를 읽는 순서

1. 종료 코드와 `lsp-min-observation-*.json`의 `verdict`, `observation.failures`.
2. `processCleanup`, `systemRecovery`가 모두 `ok`인가(70이면 먼저 복구).
3. `binding`, `identity`(토큰·신원), `supervisor`(중단 요청·강제 종료·전달 여부).
4. `receiver`(기준→최종 건수, 읽기 실패)와 `osBlockObservation`(귀속·식별 불가·`unusableBecause`).
5. `reinterpretation.recordStatus`와 `lsp-min-record-*.json`(초기화 응답 판정, 송신 목록, 종료 경로).
6. 원시 증거: `lsp-min-stdout-*.bin`, `lsp-min-stderr-*.bin`, `lsp-min-runner-result-*.json`.

### 5.5 이 결과가 말하지 않는 것

성립한 관측도 "정상 LSP 시작", "규칙 로딩", "보안 판정", "대조 참조 자격"이 아니다. 루프백 0건과 5157 0건은 외부 통신이 없었다는 증거가 아니다(DNS·UDP·ICMP·IPv6·서비스 대행 통신은 관측하지 않는다). 감시 폴더 밖 파일 시스템은 관측하지 않는다.

## 6. 남은 한계

1. 실제 Semgrep, 실제 전용 계정·방화벽·감사·ACL, 실제 5157 형식은 확인하지 않았다.
2. `Get-Process -IncludeUserName`(전용 계정의 이름 열거)은 제한 시간을 줄 수 없다. 강제 종료와 정리는 추적한 PID를 먼저 끝내므로 열거가 걸려도 알려진 프로세스는 끝낸다. 추적하지 못한 프로세스는 열거가 돌아와야 끝난다.
3. 러너의 사후 폴더 목록·해시 등 시간 제한이 없는 호출은 그대로다. 전체 벽시계 상한은 보장하지 않는다(PR #38 보고서 4.3절). 감독 루프는 관리자 쪽에서 마감을 지키지만 러너 안쪽 호출이 매달렸을 때의 결과는 러너가 남기지 못한다(결과 파일 없음 → `RUNNER_NO_RESULT`).
4. 후손 기록은 처음 잡은 값으로 굳는다(소유 SID·경로가 비어 있으면 보수적으로 실패한다).
5. 최종 수신기 읽기는 루프 종료 직후 한 번이다. 그 뒤 정리 전에 생긴 접속은 세지 않는다.
6. 변이 점검과 두 번째 독립 검토를 하지 않았다(4.5).
7. 흐름 시험의 5157 이벤트는 합성이다. 실제 이벤트의 PID 형식(10진수)은 PR #36의 실행에서 한 번 관측했을 뿐이다.
