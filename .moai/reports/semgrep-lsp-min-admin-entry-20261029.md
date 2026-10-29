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

## 7. 외부 재현 두 건의 수정 (HEAD `59f88af` 이후)

이 절은 위 4절의 수치를 바꾸지 않고, 그 뒤에 고친 두 결함과 그 검증을 따로 적는다. 4.1·4.5의 수치(253, 317)와 "변이 점검을 하지 않았다"는 문장은 `59f88af` 시점의 기록이다. 실제 Semgrep은 `--help`·`--version`을 포함해 실행하지 않았고, 계정·방화벽·감사·ACL 적용, 규칙 다운로드, 스캔, 음성 대조도 하지 않았다. 핀 파일, 검증 표지, 정책 수락, ADR 상태, 기존 PR은 그대로다.

### 7.1 결함과 수정 전 재현

수정 전 코드(`59f88af`)에서, 이 PC(Windows 11)의 실제 정션과 무해한 `.cmd` 스텁으로 재현했다. 외부 재현은 Linux 심볼릭 링크였고 여기서는 Windows 정션이라 환경이 다르다. Windows PowerShell 5.1과 pwsh 7.6.9에서 결과가 같았다.

| 결함 | 수정 전 재현 | 수정 후 |
| --- | --- | --- |
| 1. 작업 경로의 상위 링크 우회 | `task\work` → `outside` 정션, `outside\lsp`는 일반 폴더. `Find-LspMinReparseInTree(task\work\lsp)`는 0건이고, 같은 `work` 경로로 쓴 `lsp-min-request.json`이 `outside`에 생겼다. 진입점 전체 흐름(모의 시스템)에서도 `work`가 정션이면 관측이 "성립"으로 끝났고 요청·결과·러너 사본 4개가 링크 대상 폴더에 쓰였다. 새 시험을 수정 전 코드에 돌리면 26건 중 7건만 통과(19 실패) | 사전 조건 T08에서 종료 50. 계정 켜기·감사 변경·러너 실행·삭제·복사·쓰기 없음, 링크 대상 폴더의 파일·목록·바이트 불변 |
| 2. 재해석 도구의 파이프 읽기 정체 | 부모는 즉시 종료하고 자손이 출력 파이프를 2초 붙잡는 스텁. `TimeoutMs=200`인데 pwsh 7에서 2521ms, 5.1에서 2524ms 뒤 `ran=True`, `exitCode=0`, 오류 없음으로 돌아왔다(외부 재현은 약 2183ms) | `ran=False`, `error=PIPE_NOT_CLOSED`, 자손 정리 확인, 5.1에서 0.54초·pwsh 7에서 1.17초 뒤 반환(첫 호출의 작업 개체 형식 컴파일 시간 포함) |

### 7.2 고친 내용

결함 1 (신뢰 루트부터 목적지까지 경로 조각 확인):
- 포트 `Get-LspMinWorkPathProblems`: 신뢰 루트(`names.WorkDir`, 루트 자신 포함)에서 각 목적지까지 이미 있는 조각을 위에서 아래로 본다. `LINK`·`UNREADABLE`·`NOT_A_DIRECTORY`·`OUTSIDE_ROOT`·`ROOT_MISSING`은 문제다. 아직 없는 조각에서 멈추고 문제로 세지 않는다(검증한 기존 부모 아래에 만든다). 링크는 따라가지 않는다. `Get-LspMinWorkSafetyProblems`는 여기에 상위 경로가 깨끗할 때만 `lsp` 안의 링크 확인을 더한다.
- 목적지 목록 `Get-LspMinWorkTargets`(계약, 순수): `work`, `lsp`, 지우는 파일 4개, 복사하는 파일 4개. 진입점의 삭제·복사 목록과 같은 상수(`LspMinWorkTransientFiles`, `LspMinWorkCopyFiles`)에서 나온다.
- 확인 위치: 사전 조건 T08, 첫 변경(수신기·삭제·감사 창·계정)보다 앞선 관문 1, 계정을 켠 뒤 첫 작업 폴더 만들기·복사보다 앞선 관문 2, 러너가 살아 있는 동안 쓰는 중단 파일의 쓰기 직전(`Write-LspMinAbortFile -TrustedRoot`). 중단 파일을 못 쓰면 기존대로 전용 계정 프로세스를 직접 끝낸다.
- 보고서에 `workPath`(신뢰 루트, 사전 조건 결과, 관문별 문제 목록, 한계)가 생겼고, 새 실패 토큰 `WORK_PATH_UNSAFE`와 판정 `NOT_ATTEMPTED:WORK_PATH_UNSAFE`가 있다.

결함 2 (실행과 수집을 하나의 마감으로):
- `Invoke-LspMinReinterpret`는 `WaitForExit`와 `ReadToEndAsync().Result`를 쓰지 않는다. 비동기 읽기를 20ms 간격으로 비차단 처리하고, 하나의 경과 시간이 `TimeoutMs`를 넘기면 끊는다. 끝났다는 판단은 부모 종료만이 아니라 stdout·stderr 두 파이프의 EOF까지다.
- 사유는 `TIMEOUT`(도구 본체가 안 끝남), `PIPE_NOT_CLOSED`(부모는 끝났는데 파이프가 안 닫힘), `STREAM_READ_FAILED`, `CANCELLED`(도구를 시작할 때 없던 취소 표지가 생김; 이미 있던 표지는 취소로 보지 않는다), `JOB_UNAVAILABLE`, `JOB_ASSIGN_FAILED`. 출력은 상한(기본 262,144자, 스트림마다)까지만 모으고 나머지는 비워 도구가 막히지 않게 한다.
- 도구는 시작 직후 Windows 작업 개체(Job Object)에 넣는다. 마감·실패·취소·예외 어느 경로로 나가도 `finally`에서 `Close-LspMinToolRun`이 개체 전체를 끝내고(부모가 먼저 끝나 고아가 된 자손 포함), 개체에 남은 프로세스 수와 끝나지 않은 읽기를 읽어서 확인한다. 이 정리 기록은 관측 결과와 따로 `reinterpretation.tool.cleanup`에 남고, 진입점은 이를 `process-reinterpret-tool` 항목으로 프로세스 정리 묶음에 넣는다(실패하면 종료 70).
- 출력 디코딩을 UTF-8로 지정했다(기존은 기본 코드 페이지). 도구(node)가 UTF-8로 출력하기 때문이다.

### 7.3 검증 결과 (2026-10-29, 이 PC, 관리자 권한 세션)

| 검증 | 결과 |
| --- | --- |
| `Test-LspMinAdmin.ps1` (안쪽 엔진별, 진짜 시스템 상태 불변 비교 포함) | pwsh 7 **324/324**, Windows PowerShell 5.1 **324/324**, 건너뜀 0 (4.1의 253에서 +71) |
| 새 시험 묶음만 5.1 호스트에서 단독 실행 | `workpath` 28/28, `reinterpret-io` 12/12 |
| `Test-IsolationScripts.ps1` | pwsh 7 **322/322**, 5.1 **322/322** (317에서 +5) |
| `Test-LspMinRunner.ps1` (바꾸지 않음, TS 경로 포함) | pwsh 7 296/296, 건너뜀 0 |
| `vitest run scripts/semgrep-lsp` | 66개 파일 3096 통과, 8 건너뜀, 실패 0 (TS는 바꾸지 않음) |
| `eslint scripts/semgrep-lsp`, `prettier --check scripts/semgrep-lsp scripts/semgrep-lsp-isolation` | 통과 |
| 변이 점검 12건 | 11건을 시험이 잡았다(실패 1~31건씩). 1건(첫 관문 제거)은 등가: 사전 조건 T08이 같은 확인을 하고 둘 사이에 끼어들 수단이 없어 시험으로 구분되지 않는다 |
| 시험 뒤 진짜 상태 | 전용 계정 `bsi*` 없음, 방화벽 규칙 `bosang-semgrep-iso*` 0개, `%ProgramData%\bosang-semgrep-iso` 없음, 감사 값 전후 같음(시험 안의 비교), 잔여 시험 프로세스 0 |

새 시험의 구성:
- `workpath`(실제 정션·파일 심볼릭 링크, 임시 폴더, 단언 28건): 정상·없는 경로 허용, `work` 상위 정션(옛 확인의 맹점 재현 포함), `lsp` 정션, `lsp` 안 정션, 목적지 7곳이 정션, 파일 심볼릭 링크 목적지, 신뢰 루트 정션·없음, 루트 밖(`..` 포함), 중간 조각이 파일, 읽지 못한 조각(모의), 중단 파일 쓰기. 거절 전후 링크 대상의 파일·목록·SHA-256 불변을 비교한다.
- `work-chain`(진입점 전체 흐름): `work` 정션, `lsp` 정션, 복사 목적지 정션, 요청 파일 목적지 정션 네 사례에서 `-Execute`와 dry-run 모두 종료 50, 계정·감사·러너 호출 없음, 링크 대상 불변, 보고서 없음. 계정을 켠 직후 `work`가 정션으로 바뀌는 사례(관문 2): 종료 60, `NOT_ATTEMPTED:WORK_PATH_UNSAFE`, 러너 미실행, 계정 다시 꺼짐·감사 복구. 정상 배치 재실행.
- `reinterpret-io`(실제 프로세스, 공백이 있는 경로): 정상 EOF, 인자 7개가 공백 경로 그대로 도착, 비정상 종료, 부모 종료 뒤에도 자손이 파이프를 놓을 때까지 기다림, `PIPE_NOT_CLOSED`와 자손 정리, `TIMEOUT`과 트리 정리, `CANCELLED`, 이미 있던 취소 표지 무시, 출력 상한, 실제 `tsx.cmd` + 재해석 CLI(공백 경로 입출력·공백이 있는 node 폴더), 공백이 있는 폴더의 `tsx.cmd` 껍데기 경유.
- `reinterpret-tool`(진입점 흐름): 진짜 포트를 파이프 점유 스텁으로 돌려 `REINTERPRETATION_FAILED`(사유 `PIPE_NOT_CLOSED`)·정리 항목 기록·계정/감사 복구 확인, 도구 정리 실패(합성 결과)는 종료 70·`processCleanup.ok=false`·`systemRecovery.ok=true`.

실제 Windows에서 확인한 것: 정션과 파일 심볼릭 링크, `.cmd` 스텁 프로세스 트리, 작업 개체, 파이프 EOF 처리, 실제 `tsx.cmd` + 재해석 CLI, 진입점의 전체 흐름(러너와 스텁 서버는 현재 사용자로 실행). 모의인 것: 전용 계정, 방화벽, 감사 정책, ACL, Security 로그와 5157, `Start-Process -Credential`, 설치물, 읽지 못함(`UNREADABLE`) 상태(접근 거부를 이 관리자 계정으로 만들 수 없어 상태 함수를 대체해 흉내 냄), 도구 정리 실패(합성 결과).

### 7.4 바뀐 시험 기대값과 이유

- 정적 점검 "이전 작업 배치의 재귀 삭제는 링크 확인 뒤에만, 계정을 켜기 전에": 예전에는 `Find-LspMinReparseInTree -Root $lspWork`(lsp 폴더 안)만 요구했다. 이 확인은 상위 `work` 링크를 놓친다. 이제는 경로 조각 묶음(`Get-LspMinWorkSafetyProblems`)이 첫 삭제·수신기보다 앞(관문 1), 계정 켜기 뒤 첫 만들기·복사보다 앞(관문 2)에 있고 T08도 같은 확인을 쓰는지, 진입점에 lsp 안만 보는 호출이 남지 않았는지, 중단 파일에 신뢰 루트를 주는지를 요구한다.
- 정적 점검 "삭제 파일 목록 리터럴": 목록을 계약 상수로 옮겼으므로 진입점이 상수를 쓰고 계약이 같은 리터럴을 갖는지 본다.
- 정적 점검 "재해석 도구 호출은 `WaitForExit($TimeoutMs)`": 옛 기대값은 프로세스 종료만 마감이던 구조 그대로였다. 이제는 하나의 경과 시간 마감, 두 파이프 EOF 요구, 차단형 대기(`WaitForExit`·`ReadToEnd`) 금지, `.Result`는 끝난 읽기 한 곳(`Step-LspMinRead`)뿐, 작업 개체에 넣고 `finally`에서 정리하는지를 요구한다. 진입점이 취소 표지를 주고 `process-reinterpret-tool` 항목을 정리 묶음에 넣는지도 새로 요구한다.
- 계약 파일 허용 명령: `Join-Path`는 허용 목록 밖이라, 목적지 목록은 문자열 연결로 만든다(목록은 늘리지 않았다).
- 기존 흐름 시험(`old-layout` 등)과 T08 문구 기대는 바꾸지 않았고 그대로 통과한다. 모의 포트 시그니처에 `-TrustedRoot`·`-CancelFile`을 더했다.

### 7.5 유지한 결정

5157 증거가 불확실하면 관측 불성립(`OS_BLOCK_EVIDENCE_UNAVAILABLE`), 실제 실행에서 TS 재해석 필수(L09), PR #38의 러너 계약(읽기 실패·후속 사유·강제 종료·`STDIN_CLOSED`; 러너 코드와 시험은 바꾸지 않았고 296/296), 관측·프로세스 정리·시스템 복구 결과의 분리(도구 뒤처리는 프로세스 정리 묶음에 항목으로 더했을 뿐 관측 판정을 바꾸지 않는다).

### 7.6 하지 않은 것과 남은 한계

1. 확인과 사용 사이에 링크로 바뀌는 경쟁 상태는 막지 못한다. 관문 2와 중단 파일 직전 확인은 간격을 줄일 뿐이다. 하드 링크는 재해석 지점이 아니라서 찾지 못한다. 실행 기록 폴더(관리자 증거 파일)는 이 확인의 범위 밖이다.
2. 작업 개체: 프로세스를 시작한 뒤 개체에 넣기 전에 이미 만든 후손은 개체에 속하지 못한다(틈은 아주 짧지만 0이 아니다). 개체에 넣지 못하는 경우(`JOB_ASSIGN_FAILED`)는 시험하지 못했다. 개체의 마지막 핸들이 닫히면 남은 프로세스가 끝나도록 설정했지만 이 경로도 따로 시험하지 않았다.
3. 마감은 `TimeoutMs`(기본 120초) 뒤에 정리 확인을 위해 최대 `KillConfirmMs`(5초)를 더 쓸 수 있고, 첫 호출의 작업 개체 형식 컴파일 시간은 마감 밖이다. 포트 전체의 시간 제한 재설계는 하지 않았다.
4. 접근 거부로 읽지 못한 조각의 실제 재현은 하지 못했다(관리자 계정이라 만들 수 없어 상태 함수를 대체한 모의). 도구 정리 실패도 합성 결과로만 확인했다.
5. 사전 조건 T08과 관문 1은 같은 확인이라 시험으로 구분되지 않는다(변이 점검의 등가 1건).
6. 독립 검토 에이전트와 포트 전체 감사는 하지 않았다(범위를 넓히지 말라는 지시). Linux·macOS는 해당 없다(Windows 전용).
