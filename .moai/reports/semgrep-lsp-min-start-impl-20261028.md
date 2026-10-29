# LSP-MIN-1 실행기와 Windows 표준 입력 러너: 구현 전 정정과 구현 기록

- 작성일: 2026-10-28
- 기준: PR #37의 HEAD `1314337f5285a47040b8e4eaa64f11abfa533926`. 그 위에 별도 브랜치 `security/semgrep-lsp-min-start-exec`를 만들어 코드, 시험, 이 문서를 더했다.
- 성격: **코드와 스텁 시험만 다룬다.** 실제 Semgrep은 `--help`, `--version`을 포함해 실행하지도 임포트하지도 않았다. 계정, 방화벽, 감사, ACL도 건드리지 않았다. 규칙 다운로드, 스캔, 음성 대조, 병합, 배포도 없다. `pin.json`, `verified`, `policy_accepted`, ADR 상태, 기존 PR, `main`, bodam은 그대로다.
- 구분 표기: **사실** = 읽은 파일의 내용이나 이번에 실행한 시험의 출력, **도출** = 사실을 이어 붙인 판단, **실행 필요** = 실제 Semgrep을 띄워 봐야만 확인되는 것.
- 소유자 결정(이번 작업의 전제):
  1. `initialized`를 보내지 않는 경로를 **별도 최소 관측**으로 인정한다. 정상 LSP 시작, 규칙 로딩, 보안 판정을 대신하지 않는다.
  2. 기존 격리·복구 흐름은 재사용하되 기존 버전 실행기와 정상 하네스의 계약은 약하게 만들지 않는다.
  3. 새 실행기 전용 상한은 전체 150초, stdout 1 MiB, stderr 256 KiB다. 기존 `REAL_LIMITS`는 바꾸지 않는다.
  4. LSP 자식 환경에 `SEMGREP_ENABLE_VERSION_CHECK`를 더하지 않는다.
  5. Linux `HOME` 변경과 정상 하네스의 `LogFormat` 변경은 이번 범위 밖이다.
  6. 실제 LSP 실행 허용 여부는 이 구현을 검토한 뒤에 정한다.

이 문서의 1~4절은 **구현에 들어가기 전에** 적은 정정이고, 5절 이후는 구현과 검증을 끝낸 뒤 채운 기록이다. 앞선 계획 보고서(`semgrep-lsp-min-start-contract-20261028.md`)의 절 번호는 "계획 x.y"로 부른다.

## 1. 정정 1: `initialize` 응답은 "`error`가 없다"로 성공 처리하지 않는다

### 1.1 왜 고쳐야 하는가

계획 5.6의 O2는 "`initialize` 응답이 한도 안에 오고 `error`가 없다"였다. 고정 공개 소스를 다시 읽어 보니 이 조건은 부족하다.

- 정정(9.5): 아래 A8의 이유 문장은 과장이었다. A8은 `window/logMessage`의 **본문 문구를 보지 않고** 알림 메서드 이름 둘만 본다. 로그 문구가 stdout 알림에 실려 오는 경우의 감시는 구현하지 않았다(10절).
- 사실: `Legacy_request_handler.ml:74-97`. 초기화 처리 중 예외가 나면 서버는 먼저 오류 로그 알림(`Legacy_lsp_.log_error_to_client`)을 보내고, 이어서 **`error`가 아니라 `result`에** `InitializeError.create ~retry:false`를 담아 응답한다. 즉 응답은 `{"jsonrpc":"2.0","id":…,"result":{"retry":false}}` 모양이다. `error` 필드는 없다.
- 사실: 같은 파일 98-101. 서버가 `Uninitialized`인 동안 들어온 다른 요청(`shutdown` 포함)에는 일부러 응답하지 않는다.
- 사실: `Legacy_rpc_server.ml:133-135`, `:171`. 초기화 매개변수를 해석하지 못하거나 예외가 처리되지 않은 경우에는 표준 JSON-RPC `error` 응답이 나간다.
- 도출: `error` 부재만 보고 성공으로 치면 `{"retry":false}`를 성공 응답으로 읽는다. 이 경우 서버는 `Uninitialized`로 남으므로 뒤이은 `shutdown`은 응답 없이 무시되고 `exit`도 무시된다. 실행기가 정상 종료를 기다리며 시간을 쓰다가 강제 종료로 끝난다.

### 1.2 검증 규칙 (모두 충족해야 `INIT_RESPONSE_VALID`)

`initialize` 요청의 id는 문자열 `"lsp-min-init-1"` 하나로 고정한다. 응답으로 인정하는 메시지는 아래를 모두 만족해야 한다.

| # | 규칙 | 어기면 (사유 토큰) | 구분 |
| --- | --- | --- | --- |
| V1 | 프레임이 온전하고 본문이 JSON 객체이며 `jsonrpc`가 `"2.0"`이다 | 프레임 계층이 `FRAME_ERROR`로 먼저 막는다(기존 디코더 재사용) | 기존 계약 |
| V2 | `method`가 없다 (서버가 보낸 요청이나 알림이 아니다) | `INIT_MESSAGE_HAS_METHOD` | 핵심 |
| V3 | `id`가 `"lsp-min-init-1"`과 **엄격히 같다** (숫자 `1`, 문자열 `"1"`, 대소문자만 다른 문자열, `null`은 모두 다른 응답이다) | 응답으로 세지 않는다. 해당 메시지는 `UNMATCHED_RESPONSES`로 센다. 맞는 응답이 끝내 없으면 `INIT_NO_RESPONSE` | 핵심 |
| V4 | `error`가 없다 | `INIT_ERROR_RESPONSE` | 핵심 |
| V5 | `result`가 있고 `error`와 함께 있지 않다 | `INIT_RESULT_MISSING`, `INIT_RESULT_AND_ERROR` | 핵심 |
| V6 | `result`가 JSON 객체다 (배열, `null`, 문자열, 숫자는 거절) | `INIT_RESULT_NOT_OBJECT` | 핵심 |
| V7 | `result`에 `retry` 키가 없다 (InitializeError의 모양) | `INIT_RESULT_IS_INITIALIZE_ERROR` | 핵심 |
| V8 | `result.capabilities`가 있고 JSON 객체다 (`{}`는 허용, 배열과 `null`은 거절) | `INIT_CAPABILITIES_MISSING`, `INIT_CAPABILITIES_NOT_OBJECT` | 핵심 |
| V9 | `result.serverInfo`가 있으면 객체이고 `name`은 문자열, `version`이 있으면 문자열이다 | `INIT_SERVERINFO_MALFORMED` | 분석 |
| V10 | 이 응답보다 앞이나 뒤에 stderr로 `Error initializing server` 줄이 나오지 않았다 | `INIT_ERROR_LOGGED` | 분석 |
| V11 | 같은 id의 두 번째 응답이 없다 | 첫 응답의 판정은 그대로 두고 `anomalies`에 `INIT_RESPONSE_DUPLICATE`를 남긴다 | 분석 |

"핵심"(V2~V8)은 **실행의 흐름도 정한다.** 핵심 규칙을 통과한 응답이 오면 `shutdown`, `exit`를 보내고, 통과하지 못한 응답이 오면 더 보내지 않는다(4절). "분석"(V9~V11)은 기록의 판정(`status`)만 바꾼다. 이렇게 나눈 이유는 Windows 러너(PowerShell)가 핵심 규칙만 같은 결과로 되풀이하면 되도록 하려는 것이다. 분석 규칙은 TypeScript 한 곳에서만 구현한다.

### 1.3 기록하되 판정에는 쓰지 않는 값

- `serverInfo.name`, `serverInfo.version` (핀의 `1.180.0`과 비교한 결과는 **기록만** 한다. 불일치가 기록의 `status`를 바꾸지 않는다),
- `result.capabilities`의 정규 직렬화 해시, `result`의 키 이름 목록(값은 싣지 않는다),
- 응답 전에 온 알림의 메서드 이름 목록, 서버가 보낸 요청(메서드와 id 형식)의 개수. 이 실행기는 서버 요청에 답하지 않는다(메시지는 세 개뿐이다).

### 1.4 응답 외의 신호

- stdout 알림 중 `semgrep/rulesRefreshed`와 `textDocument/publishDiagnostics`는 `initialized` 없이 나오면 안 되는 신호다. 나오면 즉시 중단한다(3절 A8). 계획 5.7에는 stderr 문자열만 있었으므로 **추가한 조건**이다. 이유: 같은 정보가 `window/logMessage`로 stdout에 실려 나가면 stderr만 보는 감시가 놓친다.

## 2. 정정 2: 실시간 감시, 사후 비교, 미관측을 나눠 적는다

계획 5.5~5.7은 "라이브로는 홈과 작업 폴더의 변경 감시만 한다"고 적으면서도 5.5의 표에서는 "작업 폴더 밖에 생긴 파일"을 기록 항목에 두었다. 감시한 적 없는 곳의 결과를 기록 항목으로 약속한 셈이라 고친다. 새 기록(`semgrep-lsp-min-observation/1`)은 세 구역을 따로 가진다.

| 구역 | 무엇을 | 언제, 어떻게 | 어긋나면 | 한계 |
| --- | --- | --- | --- | --- |
| **실시간 감시** (`coverage.live`) | A1 stderr에 규칙 새로고침·스캔 문구, A2 `download`·`registry`, A8 stdout의 규칙·진단 알림 | 출력이 들어오는 즉시. 청크 경계에 걸친 문구도 잡도록 꼬리 버퍼를 둔다. 개행 없는 마지막 줄도 본다 | 즉시 트리 강제 종료 | stdout 알림은 파싱에 성공한 프레임만 본다 |
| | A3 루프백 수신기 적중 | 표본 간격마다 읽기 | 1건이라도 늘면 즉시 종료 | 수신기를 읽지 못하면(`null`) **감시 불능으로 보고 중단**한다(0건으로 치지 않는다) |
| | A4 허용 이미지 밖 프로세스 | 표본 간격마다 프로세스 목록 | 즉시 종료 | **표본 사이에 떴다 사라지는 프로세스는 못 본다.** 목록 조회가 연속 3번 실패하면 감시 불능으로 중단한다 |
| | A5 감시 폴더 안의 금지된 변경 | 표본 간격마다 폴더 목록 | 즉시 종료 | 감시 폴더는 아래 `watched_roots` 셋뿐이다 |
| | A6 상한(전체, 출력, 프레임 오류, 초기화 시간) | 계속 | 4절의 정책 | |
| | A7 취소 신호 | 계속 | 즉시 종료 | |
| **사후 비교** (`coverage.post_hoc`) | 감시 폴더 셋의 실행 전후 파일 이름 목록 차이(추가, 삭제) | 종료 확인 뒤 한 번 | 기록만 한다(멈출 수 없다) | 파일 이름만 비교한다. 내용 변화는 보지 않는다 |
| | 설치물 해시의 실행 전후 비교 | 시작 전, 종료 뒤 | 기록만 한다 | 호출자가 준 경로의 파일만 본다 |
| **미관측** (`coverage.unobserved`) | 아래 감시 폴더 셋 밖의 파일시스템 전체 | 감시도 비교도 하지 않는다 | | 이 실행기는 "작업 폴더 밖에 파일이 생기지 않았다"고 **말하지 않는다** |
| | DNS, UDP, IPv6, 서비스 대행 통신, 표본 사이의 프로세스 | 이 모듈은 수집하지 않는다 | | 격리 계정의 5157 이벤트는 Windows 진입 스크립트가 종료 뒤에 따로 모은다(이번 범위 밖) |
| | 바이너리와 공개 소스의 대응, 실제 Windows에서의 동작 | | | **실행 필요** |

`watched_roots`는 정확히 셋이다. 요청의 경로에서 도출하고, 기록에는 경로 문자열 대신 **역할 이름**(`WORKSPACE`, `RULES_DIR`, `HOME_DIR`)과 파일 수만 싣는다.

| 역할 | 기대 | A5(즉시 종료) 조건 |
| --- | --- | --- |
| `WORKSPACE` (`<work>\ws`) | 비어 있다 | 파일이 하나라도 생김 |
| `RULES_DIR` (`<work>\lsp-state\rules-empty`) | 비어 있다 | 파일이 하나라도 생김 |
| `HOME_DIR` (`<work>\lsp-state\home`) | `shutdown`이 `.semgrep/cache/fingerprinted_ignored_findings/` 아래에 파일 하나를 쓸 수 있다(계획 O9) | 그 폴더 **밖**에 파일이 생김 |

상태 폴더의 나머지(`settings.yml`, `semgrep.log`, 임시 폴더)는 감시 폴더가 아니다. 사후 비교의 대상도 아니므로 "생기지 않았다"고 말하지 않는다. 기록은 이 점을 `unobserved`에 적는다.

실시간 감시의 이름도 정직하게 쓴다. A3~A5는 **표본 추출**이다. 이벤트를 받는 방식이 아니라 일정 간격으로 읽는 방식이라, 간격 사이에 지나간 일은 보이지 않는다. 기록에 표본 수와 실패 수를 싣는다.

경로 안전: 감시 폴더의 경로와 설치물 경로가 중단 문구(A1, A2)를 **포함하면 실행기가 시작 전에 거절한다.** `--debug`가 `initializationOptions`와 `rootUri`를 stderr에 찍으므로 경로의 문구가 스스로 중단을 일으키는 사고를 막으려는 것이다.

## 3. 중단 조건 전체 (계획 5.7 + 정정)

| # | 조건 | 구역 | 계획 대비 |
| --- | --- | --- | --- |
| A1 | stderr에 `Refreshing rules`, `Rules refreshed`, `Scanning workspace`, `Scanning open documents`, `Scanning single file`, `Scanned workspace`, `Scanned open documents` (대소문자 무시, 부분 문자열) | 실시간 | 뒤의 둘을 더했다(같은 로그 키의 완료 쪽) |
| A2 | stderr에 `download` 또는 `registry` (대소문자 무시) | 실시간 | 그대로 |
| A3 | 루프백 수신기에 요청 도착, 또는 수신기를 읽을 수 없음 | 실시간 | "읽을 수 없음"을 중단 사유로 명시 |
| A4 | 허용 이미지 밖의 프로세스: 허용은 `semgrep.exe`, `python.exe`, `semgrep-core.exe`, `pysemgrep.exe`, `conhost.exe`(대소문자 무시). 목록 조회 3회 연속 실패도 중단 | 실시간 | 조회 실패의 처리를 명시 |
| A5 | 2절 표의 감시 폴더 위반 | 실시간 | 범위를 감시 폴더 셋으로 좁혀 명시 |
| A6 | 초기화 응답 시간 초과, 프레임 오류, stdout·stderr 상한 초과, stdin 쓰기 실패, 전체 실행 상한 | 실시간 | 4절의 정책에 따라 처리 |
| A7 | 취소 신호 | 실시간 | 그대로 |
| A8 | stdout에 `semgrep/rulesRefreshed` 또는 `textDocument/publishDiagnostics` 알림 | 실시간 | **추가** (1.4절) |

## 4. 정정 3: 종료 정책을 한 표로 정한다

### 4.1 상태 흐름 (TypeScript 실행기와 PowerShell 러너가 같다)

1. 시작: 자식을 띄우고 **전체 시계**(150초)를 시작한다. 띄우는 데 실패하면 기록만 남기고 끝난다(`SPAWN_FAILED`).
2. `initialize` 요청 하나를 보낸다(`initialized`는 보내지 않는다). 응답을 `init` 한도(60초)까지 기다린다.
3. 응답이 1.2절의 핵심 규칙을 통과하면 `shutdown` 요청과 `exit` 알림을 이 순서로 보내고 자식의 종료를 `exit` 한도(30초)까지 기다린다.
4. 응답이 핵심 규칙을 통과하지 못했거나 `init` 한도가 지났으면 `shutdown`, `exit`를 **보내지 않는다.** 초기화되지 않은 서버는 둘 다 무시하므로 보내도 기다리기만 한다. 바로 stdin을 닫는다.
5. 3단계에서 `exit` 한도가 지나도 자식이 남아 있으면 stdin을 닫는다.
6. stdin을 닫은 뒤 유예(10초) 안에 끝나지 않으면 프로세스 트리를 강제 종료한다.
7. 중단 조건(A1~A5, A7, A8)이나 전체 상한이 걸리면 위 단계와 무관하게 **즉시** 트리를 강제 종료한다. 그때는 stdin 닫기나 유예를 거치지 않는다.

### 4.2 경우별 정책

| 경우 | 보내는 것 | stdin 닫기 | 강제 종료 | 기록의 `trigger` |
| --- | --- | --- | --- | --- |
| 정상 (핵심 규칙을 통과한 응답) | `initialize`, `shutdown`, `exit` | `exit` 한도 안에 안 끝날 때만 | stdin 닫기 유예 안에 안 끝날 때만 | `NORMAL` |
| 초기화 실패 (오류 응답, `retry`, 잘못된 모양) | `initialize`만 | 즉시 | 유예 안에 안 끝날 때만 | `INIT_INVALID` |
| 초기화 시간 초과 (`init` 한도) | `initialize`만 | 즉시 | 유예 안에 안 끝날 때만 | `INIT_TIMEOUT` |
| 라이브 중단 (A1~A5, A7, A8) | 그 시점까지 보낸 것 | 하지 않음 | **즉시** | `LIVE_ABORT` + 조건 id |
| 전체 상한 (150초) | 그 시점까지 보낸 것 | 하지 않음 | **즉시** | `TOTAL_TIMEOUT` |
| 출력·프레임 오류, stdin 쓰기 실패, stdout·stderr 읽기 실패 | 그 시점까지 보낸 것(이후 새 메시지 없음) | 하지 않음 | **즉시** | `OUTPUT_LIMIT`, `FRAME_ERROR`, `STDIN_ERROR`(쓰기 실패), `STREAM_READ_FAILED`(읽기 실패) |
| 자식이 먼저 끝남 (응답 전에 종료·스트림 닫힘) | 더 보내지 않는다 | 해당 없음 | 남은 자손만 정리 | `CHILD_EXITED_EARLY` |

여러 사유가 겹치면 **먼저 일어난 것**이 `trigger`이고 나머지는 `also`에 순서대로 남긴다. 순서는 기록으로 보존할 뿐이고, **관측 성립을 막는 사유는 `trigger`와 `also` 전체에서 읽는다**(`TOTAL_TIMEOUT`, `STDIN_ERROR`, `STREAM_READ_FAILED`, `CHILD_EXITED_EARLY`, `OUTPUT_LIMIT`). 첫 사유가 `EXIT_TIMEOUT`이어도 뒤따른 `TOTAL_TIMEOUT`이 관측을 막는다(9.6절).

### 4.3 시간 규칙 (유예가 계속 붙어 실행이 늘어나지 않도록)

- 각 단계의 한도는 `전체 시작 + 150초`를 넘지 못한다. 단계 한도가 전체 마감보다 늦으면 전체 마감이 이긴다.
- 전체 마감에 닿으면 **그 즉시 강제 종료**한다. 새 유예를 붙이지 않는다. stdin 닫기 단계도 건너뛴다.
- 최악의 정상 경로: 초기화 60초 + 종료 30초 + stdin 닫기 유예 10초 = 100초로 150초 안에 든다.
- **관측 구간**은 시작부터 "강제 종료 신호를 보낸 시각 또는 자식이 끝난 시각"까지다. 이 구간만 150초로 묶는다.
- **정리 구간**은 그 뒤다. 종료를 확인하는 창은 **한 번, 고정 10초**다. 이 창이 지나도 종료를 관측하지 못하면 `KILL_NOT_OBSERVED`로 기록하고 끝낸다. 같은 창을 다시 열지 않는다. 어댑터 내부의 `dispose` 대기(5초)는 따로 있다.
- **전체 벽시계 시간의 상한은 보장되지 않는다.** 보장되는 것은 두 가지뿐이다: 관측 구간은 150초에서 끊기고, 그 뒤 종료 확인 창은 고정 한 번 10초다(새 유예도 자동 재시도도 없다). 기록의 `timeline`에는 구간별 시간을 나눠 싣는다. 이 둘이나 어댑터 `dispose` 대기(5초)를 더한 값(예: 150 + 10 + 5 = 165초)을 "최악의 전체 벽시계"로 읽으면 안 된다. 시간 제한이 없는 호출이 이 구간들 바깥과 안쪽에 있다: TS 포트의 `spawn`·`dispose`·`listFilesRecursive`·`hashFile`(사전 확인과 사후 읽기 포함), PS 러너의 사후 폴더 목록·`Get-FileHash`·정리 구간의 기존 `Get-ProcessTable`·`Stop-ProcessTree`. 이 호출 하나가 멈추면 전체 시간은 그만큼 늘어난다. 가상 시계 시험에서는 이 호출들이 0초라 시험으로도 확인되지 않는다. 모든 포트에 시간 제한을 다는 재설계는 이번 범위 밖이다(10절 9번).

### 4.4 관측 결과와 정리 결과를 따로 적는다

기록의 `observation`과 `cleanup`은 서로 다른 객체다.

- `observation.status`: `OBSERVED`(핵심·분석 규칙 통과, 중단 없음, 강제 종료 없이 끝남), `ABORTED`(라이브 중단이 일어남), `NOT_OBSERVED`(그 밖의 실패. **강제 종료가 필요했던 경우 포함**, 사유 `FORCE_KILL_REQUIRED`), `NOT_ATTEMPTED`(시작 전에 거절).
- 서버가 스스로 끝난 경로(`SELF_EXIT`)와 `exit`를 무시해 stdin EOF로 끝난 경로(`STDIN_CLOSED`)는 `termination.path`로 구분해 기록한다. EOF로 끝난 경로는 `OBSERVED`로 남고, 강제 종료(`FORCE_KILLED`)는 `NOT_OBSERVED`다. 강제 종료여도 `initialize.response`·`sent` 같은 실제 관측 사실은 그대로 남는다.
- `cleanup.ok`: 자식 종료 확인, 자손 잔존 0, 스트림 닫힘, 타이머 해제, `dispose` 성공이 모두 맞을 때만 `true`.
- **정리가 실패해도 `observation.status`를 바꾸지 않고, 관측이 성공했다고 정리 실패를 덮지도 않는다.** 두 값을 합친 점수나 한 줄 판정을 만들지 않는다.
- 기록은 `not_established`에 `complete`, `security_pass`, `control_reference`, `normal_startup`을 모두 `NOT_ESTABLISHED`로 고정해 싣는다. 기존 평가기(`evaluate.ts`)와 하네스(`harness.ts`)는 이 기록을 읽지 않고 이 모듈도 그 둘을 가져오지 않는다.

## 5. 계획 대비 달라진 점 (요약)

| 계획 | 정정 |
| --- | --- |
| 5.3 순서 4: 초기화 오류 뒤에도 `shutdown`, `exit` 송신 | 초기화 실패와 시간 초과에서는 보내지 않고 바로 stdin을 닫는다(4.2). 초기화되지 않은 서버는 둘 다 무시하기 때문이다 |
| 5.6 O2: 응답이 오고 `error`가 없다 | 1.2절의 규칙 V1~V11. 특히 `result.retry`(InitializeError)를 거절한다 |
| 5.5 "작업 폴더 밖에 생긴 파일" 기록 | 약속하지 않는다. 감시 폴더 셋의 실행 전후 이름 차이만 기록하고 나머지는 `unobserved`에 적는다 |
| 5.7 A5 "작업 폴더 밖에 파일이 생김" | 감시 폴더 셋 안의 위반으로 좁혔다(2절) |
| 5.7 A1 | 완료 쪽 로그 키 둘을 더했다 |
| 5.7 (없음) | A8 추가 |
| 5.4 한도 | 전체 150초, stdout 1 MiB, stderr 256 KiB를 새 실행기 전용으로 채택(소유자 결정). 기존 `REAL_LIMITS` 불변 |
| 5.2 환경 | `SEMGREP_ENABLE_VERSION_CHECK`는 넣지 않는다(소유자 결정). 시험으로 고정한다 |

## 6. 구현 기록

### 6.1 파일

| 경로 | 역할 |
| --- | --- |
| `scripts/semgrep-lsp/lsp-min.ts` | 순수 모듈. 고정 계약(인자, 메시지 id, 한도), 요청 검사, 환경 구성, 송신 방어선, 초기화 응답 검증(1절), 중단 문구와 stdout 알림 분류, 자손 계산, 관측 기록 조립(`semgrep-lsp-min-observation/1`) |
| `scripts/semgrep-lsp/lsp-min-run.ts` | 실행기. 프로세스·시계·파일·수신기·프로세스 목록·산출물 해시를 포트로만 받고 4절의 종료 정책을 구현한다. `initialized`를 보내는 코드가 없다 |
| `scripts/semgrep-lsp/lsp-min-runner-result.ts` | PowerShell 러너가 남긴 결과 JSON을 기록 조립 입력으로 바꾸는 순수 변환. 형식이 어긋나면 `RUNNER_RESULT_MALFORMED:<필드>`로 관측 불성립 처리 |
| `scripts/semgrep-lsp/testing/stub-lsp-min.ts`, `testing/stub-lsp-min-server.mjs` | 스크립트형 가짜 자식(가상 시계 시험용), 실제 Node 프로세스로 뜨는 스텁 서버(통합 시험용) |
| `scripts/semgrep-lsp/lsp-min*.test.ts` | 순수 모듈 147, 실행기 105, 러너 결과 변환 21, 통합 11 |
| `scripts/semgrep-lsp-isolation/windows/lsp-min-runner.ps1`, `LspMinContract.ps1`, `lsp-min-stub.ps1`, `tests/Test-LspMinRunner.ps1` | 표준 입력 러너, 계약 이식본, 스텁 서버, 러너 시험 |
| `scripts/semgrep-lsp-isolation/windows/README.md` | 새 파일과 범위·한도·종료·판정 설명 추가(34줄, 기존 줄 변경 없음) |

기존 파일은 셋을 고쳤다(README는 6.1 표에 적었다). `structure.test.ts`는 구조 (13)을 더했고(136줄 추가, 허용 목록에 스텁 서버 한 줄), `Test-IsolationScripts.ps1`은 LSP-MIN 파일 전용 점검 절 (F)를 더했다(98줄 추가). 줄 수는 9.6절 수정 뒤 `git diff --numstat 1314337`로 다시 센 값이고 셋 모두 삭제 0줄이다. 세션 제어기, 평가기, 프레임·JSON-RPC 코드, `process-node.ts`, `tool-observation.ts`, `cli.ts`(`REAL_LIMITS` 포함), `version-runner.ps1`, `VersionContract.ps1`은 수정하지 않았다. `pin.json`, ADR, 기존 PR, `main`, 보담 저장소도 바꾸지 않았다.

### 6.2 구조 시험이 지키는 경계 (`structure.test.ts` 구조 (13))

- 새 순수 모듈 셋은 `node:*`를 가져오지 않고, 정해진 프로젝트 모듈만 가져온다. 다른 모듈이 이 셋을 가져오지 않는다.
- 평가기·하네스·세션 제어기 등 기존 정상 경로 모듈을 가져오지 않는다. 세션 제어기의 `initialized` 송신과 `INITIALIZED_NOT_SENT` 판정은 그대로다.
- 새 코드 어디에도 `"initialized"` 문자열이 없고, 코드에 `SEMGREP_ENABLE_VERSION_CHECK`가 없다(정상 경로의 서버 환경도 그대로).
- 전역 시간 함수를 쓰지 않는다. `writeStdin` 호출은 하나이며 송신 방어선을 거친다. 강제 종료 호출은 하나이며 `killCount > 0` 가드가 있다. 요청 검사는 폴더 생성보다, 폴더 생성은 프로세스 시작보다 앞선다.
- `pin`, `verified`, ADR을 참조하지 않는다.

## 7. 검증 결과 (이번 작업에서 실제로 실행한 것만)

### 7.1 실행 결과

| 검증 | 결과 | 어떤 환경에서 |
| --- | --- | --- |
| `vitest run scripts/semgrep-lsp` | 65개 파일, **3059** 통과, 8 건너뜀, 0 실패 (9.6절 수정 전 3038, 9.5절 수정 전 3025) | 건너뜀 8건은 기존 파일(`artifact-node.test.ts` 5, `cli.test.ts` 2, `process-list-node.integration.test.ts` 1)의 것이다 |
| 새 파일별 (9.6절 수정 후 다시 센 값) | `lsp-min` 160, `lsp-min-run` 114, `lsp-min-runner-result` 33, `lsp-min.integration` 11, `structure` 86 | 가상 시계·가짜 자식(단위) / 실제 Windows(통합). 이 표의 앞선 숫자(147·105·21)는 9.5절 이전 값이라 낡았다 |
| `tsc --noEmit` | 오류 1건 `app/layout.tsx(20,50) LayoutProps` | 이번 변경과 무관한 기존 오류(그 파일을 건드리지 않았다). 새 파일의 타입 오류는 없다 (9.6절 수정 후에도 같다) |
| `eslint scripts/semgrep-lsp` | 종료 코드 0 | 9.6절 수정 후 |
| `prettier --check scripts/semgrep-lsp scripts/semgrep-lsp-isolation` | 통과 | `.moai/` 아래 이 보고서는 prettier 제외 대상이라 검사하지 않았다. 9.6절 수정 뒤 시험 파일 한 곳의 서식을 `prettier --write`로 고쳤다 |
| `Test-LspMinRunner.ps1` | **296/296** 통과, 건너뜀 0 (9.6절 수정 전 267, 9.1~9.4 수정 전 196, 9.5 수정 전 265) | Windows PowerShell 5.1과 PowerShell 7 양쪽. TS 대조 항목 포함(`tsx` 경로를 줬다) |
| `Test-IsolationScripts.ps1` (절 (F) 포함) | **243/243** 통과 (9.6절 수정 전 239/243, 그 전 239) | 양쪽 엔진 |
| 기존 `Test-IsolationFlows.ps1` | 162/162 (바깥 pwsh 7, 안쪽 엔진 `pwsh`·`powershell` 각 1회) | 모의 시스템. 이 시험은 바깥이 항상 pwsh이고 `-Engine powershell`로 안쪽만 5.1로 바꾼다 |
| 기존 `Test-VersionFlows.ps1` | 141/141 (같은 방식) | 모의 시스템 |
| 기존 `Test-VersionRunner.ps1` | 167/167, 건너뜀 1(선택 항목) | 5.1과 7 양쪽 |
| 기존 `Test-VersionRunner.ps1` | 167/167, 건너뜀 1(`-PythonExe`를 주지 않은 선택 항목) | 5.1과 7 양쪽 |

위 표의 숫자는 모두 2026-10-29에 다시 실행해서 확인한 값이다(vitest 32초, 러너 시험 엔진당 약 140초).

### 7.2 요청한 스텁 검증 항목 ↔ 시험

| 요청 항목 | TypeScript 쪽 | PowerShell 쪽 |
| --- | --- | --- |
| 정상 응답, 정상 exit | 정상 경로 | 시나리오 `ok` |
| 오류 응답 | 초기화 실패 | `error` |
| result 안 InitializeError | `classifyInitResponseCore` 표, 초기화 실패 | `initialize-error`, 핵심 규칙 표 |
| 잘못된 ID·구조 | 같은 표, 초기화 실패 | `wrong-id`, 핵심 규칙 표 |
| 응답 지연·미응답 | 초기화 실패(`silent`), 전체 상한과 유예 | `silent`, `silent-hold` |
| shutdown 무응답, exit 무시, stdin EOF 종료 | exit 이후의 종료 경로 | `ok`, `ignore-exit`, `ignore-exit-eof` |
| 강제 종료(한 번만) | 종료 경로 전반, 취소 | `silent-hold`, `ignore-exit` |
| 자손의 파이프 보유 | 자손의 파이프 보유, 통합 | `orphan` |
| 분할된 프레임·로그 | 프레임 분할, `StderrWatcher` | `split`, `stderr-split`, 프레임 해석 함수 |
| 잘못된 프레임 | 프레임 오류 | `garbage` |
| 출력·시간 한도 | 출력 한도, 전체 상한과 유예 | `flood-out`, `flood-err` |
| 취소, 읽기·쓰기 실패 | 취소, 입출력 오류 | 취소: 중단 파일(A7). 쓰기 실패: 가짜 stdin 스트림으로 `Send-LspMinMessage`를 직접 불러 Write·Flush 실패와 프레임 한도 초과가 `STDIN_ERROR`로 끝나는지 확인(9.4). 읽기 실패(9.6절): 가짜 읽기 스트림(`BeginRead`/`EndRead`)으로 stdout·stderr 각각 초기화 응답 전·유효한 응답을 받은 뒤의 실패를 `Step-StreamRead` → `Step-LspMinStreamTriggers` 로 만들고, 이유(`STREAM_READ_FAILED`)·즉시 종료·받은 바이트와 오류 문구 보존·이후 `Send-LspMinMessage` 거절을 확인한다. **메인 루프가 그 함수를 부르고 즉시 종료 사유 확인으로 빠져나가는 배선은 구조 점검(AST/원문 순서)으로 확인하고, 실제 끊어지는 파이프를 러너 전체에 흘려 보는 시험은 없다** |
| 허용하지 않은 메시지가 실제로 송신되지 않음 | 허용되지 않은 메시지는 송신되지 않는다, 구조 시험 | 스텁이 받은 기록(`received.log`)에 `initialize`·`shutdown`·`exit`만 있다 |
| 환경 비상속 | 환경 구성, 통합 | `env-names`, 요청 env 일치 검사 |
| 전용 홈의 실제 생성 | 통합 | 러너 시험 |
| 고정 인자·경로 거절 | 요청 거절 | 거부 경로 시험 |
| 라이브 중단 조건 | 라이브 중단 조건 A1~A8 | `stderr-scan`, `stderr-download`, `publish`, `write-ws`, `spawn-disallowed` |
| 관측과 정리의 분리 | 관측 결과와 정리 결과를 따로 적는다 | 러너 결과 → TS 기록 변환 |

## 8. 확인 범위: 스텁·모의로만 본 것과 실제 운영체제에서 본 것

**실제 Windows 11(이 PC)에서 본 것.**

- 실제 파이프, 파일 시스템, 프로세스 목록, 프로세스 종료를 쓰는 통합 시험 11건: Node 실행 파일을 `semgrep.exe`라는 이름으로 복사해 띄운 **스텁 서버**를 상대로 한다.
- PowerShell 러너가 `ProcessStartInfo`로 실제 자식 프로세스(스텁)를 띄우고, 실제 프로세스 트리 종료와 자손 정리, 전용 홈 폴더 생성, 환경 비움을 수행하는 것: 5.1과 7 양쪽.
- 허용 목록 밖 이미지(`ping.exe`)를 스텁이 실제로 띄웠을 때 러너가 A4로 중단하는 것(PowerShell 쪽 시험).

**모의·스텁으로만 본 것.**

- 루프백 수신기는 가짜다(실제 포트를 열지 않았다).
- 가상 시계와 스크립트형 가짜 자식으로 본 종료 경로 대부분(시간 한도, 유예, 취소, 쓰기 실패 등).
- Linux 분기(`/proc` 목록, POSIX 복사본 이름)는 작성만 했고 한 번도 실행하지 않았다.

**하지 못한 것.**

- 실제 Semgrep 실행. 실제 `initialize` 응답의 모양, 서버가 실제로 하는 일, `semgrep.exe` 래퍼가 만드는 자손 구성은 공개 소스를 읽은 도출일 뿐 실행으로 확인하지 않았다(`실행 필요`).
- 전용 계정, 방화벽, 감사, ACL 아래에서의 실행. 격리가 실제 LSP 실행에서 어떻게 작동하는지는 확인하지 못했다.
- 관리자 쪽 진입 스크립트(수신기 감시, 중단 파일 생성, 5157 수집)와 그 위의 전체 흐름은 만들지 않았다.

## 9. 2026-10-29 재검증에서 찾아 고친 것

앞 절들은 끊긴 이전 세션이 남긴 미커밋 구현을 이어받아 다시 확인하기 전의 기록이다. 이어받은 뒤 모든 시험을 처음부터 다시 돌렸고(7.1), 코드를 직접 읽다가 아래를 찾아 고쳤다. 고치기 전에 **수정 전 동작을 되살린 복사본에서 새 시험을 돌려 실패하는 것을 먼저 확인**했다(수정 전 러너에서 14개 실패, 5.1 기준 246/260).

### 9.1 러너(흐름)와 TS(기록)가 같은 메시지를 다르게 읽던 곳

러너는 PowerShell의 `ConvertFrom-Json` 결과를 `Get-LmProp`(대소문자 무시 조회)와 `-cne`(형 변환 비교)로 읽었다. JSON-RPC는 멤버 이름의 대소문자를 구분하고, TS(`framing.ts`, `classifyServerMessage`)는 그렇게 읽는다. 같은 본문을 두 쪽에 넣은 결과(합성 입력, Semgrep 없음):

| 본문 | TS | 수정 전 PS | 영향 |
| --- | --- | --- | --- |
| `JSONRPC` 키 | 거절(MALFORMED) | 받아들임 | 러너는 정상 경로로 `shutdown`·`exit`를 보냈고 기록은 프레임 오류가 된다 |
| `"jsonrpc": 2.0` (숫자) | 거절 | 받아들임 (`2.0 -cne '2.0'`이 거짓) | 같다 |
| `"method": null` | 거절 | 받아들임 | 같다 |
| 최상위 `[ {…} ]` (원소 하나) | 거절 | pwsh 7만 받아들임 (원소로 풀어 버림) | 같다 |
| `"id": 1.5` | 받아들임 | 5.1만 거절 (`[decimal]`) | 러너가 불필요하게 프레임 오류로 끝낸다 |
| `Id` / `ID` 키의 응답 | id 없는 메시지(`invalid`) | **initialize 응답으로 받아들임** | 러너가 `shutdown`·`exit`를 보내는데 기록은 `INIT_NO_RESPONSE` |
| `id`와 함께 있는 `Method` 멤버 | 응답 | 서버 요청으로 보고 무시 | 러너가 응답을 놓쳐 `INIT_TIMEOUT`, 기록은 `VALID` |

고친 것: `Test-LmExactMember`·`Get-LmExactMember`(키 이름을 `-ceq`로 비교), `Get-LspMinMessageKind`(TS `classifyServerMessage`와 같은 분류), 프레임 해석기가 `jsonrpc`는 문자열 `"2.0"`, `method` 키가 있으면 문자열, `id` 키가 있으면 문자열·숫자·null(소수는 `[decimal]` 포함)만 받고 최상위가 `{`로 시작하지 않으면 거절. 메인 루프는 분류 함수 결과로만 응답과 알림을 가른다. 이 동작을 TS와 같은 본문 24개로 대조하는 시험이 생겼다(PS ↔ TS 받아들임·분류·핵심 규칙 일치). 이 불일치는 실제 서버가 보낼 가능성이 낮은 모양이지만, "잘못된 id·구조를 엄격히 검증한다"는 요구가 흐름 쪽에서 지켜지지 않던 것이다.

### 9.2 프로세스 표본(CIM)이 전체 상한을 넘길 수 있던 곳

주 루프가 표본마다 `Get-CimInstance`를 **동기로** 불렀고 시간 제한이 없었다. 표본 간격 상한이 40ms라서 조회가 거의 연속으로 돈다. 이 PC에서 잰 조회 시간은 91~323ms(10회)라 평소 초과 폭은 0.4초 미만이지만, 조회가 멈추면 전체 상한 뒤에도 기다린다. 고친 것: 조회마다 `-OperationTimeoutSec`(남은 시간의 초 수와 5초 중 작은 값), 마감까지 1초도 남지 않으면 표본을 시작하지 않는다(`Get-LspMinSampleTimeoutSec`). 시간 제한은 조회 한 번을 묶는 값이지 정확한 상한이 아니다. 정리 구간은 기존 `Get-ProcessTable`(수정하지 않은 `version-runner.ps1`)을 그대로 쓰므로 거기에는 같은 제한이 없다(10절).

### 9.3 형식 정리

`LspMinContract.ps1`과 `lsp-min-runner.ps1`만 CRLF였다. 저장소가 `eol=lf`를 강제하므로 LF로 바꿨다(BOM 유지, 바이트로 CR만 제거). 스텁 시나리오 `id-case`·`jsonrpc-case`·`method-case`가 더해져 22개에서 25개가 됐다. `Send-LspMinMessage`·`Add-LspMinTrigger` 정의를 `-LoadFunctionsOnly` 반환 앞으로 옮겼다(시험이 불러 쓰려고. 실행 코드는 그대로다).

### 9.4 시험이 비어 있던 곳

PS 러너의 쓰기 실패 경로(`Write`·`Flush` 예외, 프레임 한도 초과, 허용 밖 메시지)에 시험이 없었다. 가짜 stdin 스트림으로 결정적으로 확인하는 단위 시험을 더했다(실제 파이프의 끊김 시점은 흔들려서 통합 시험으로는 결정적이지 않다). 정적 점검에는 세 규칙을 더했다: 서버 메시지를 대소문자 무시 조회로 읽지 않는다, CIM 조회에는 시간 제한이 있다, 표본 호출은 남은 시간에서 정한 제한을 준다. 수정 전 러너에서 세 규칙 모두 실패하는 것을 확인했다(234/237).

### 9.5 독립 검토(읽기 전용 에이전트)의 지적과 처리

코드만 주고 결론은 주지 않은 읽기 전용 검토를 한 번 받았다(Blocker 0, Major 4, Minor 8). 검토자는 시험이나 PowerShell을 실행하지 않았고, 9.1~9.4의 수정은 읽지 못한 채 보고했다. 항목마다 코드로 확인해서 처리했다.

| 지적 | 확인 | 처리 |
| --- | --- | --- |
| M1 같은 id의 두 번째 `initialize` 응답이 와도 `OBSERVED` | 맞다. 기존 시험이 오히려 이 동작을 못 박고 있었다 | 중복을 `status_reasons`의 `INIT_RESPONSE_DUPLICATE`로 올려 `NOT_OBSERVED`가 된다. 첫 응답의 판정(`initialize.response`)은 그대로 둔다. 시험 갱신. 변이로 확인 |
| M2 stdout 중단 알림(A8)에 사후 확인이 없다 | 맞다. PS 러너는 종료 뒤 도착한 stdout 바이트를 프레임으로 풀지 않는다 | TS가 원문에서 알림을 다시 찾아 `STDOUT_ABORT_METHOD_NOT_CAUGHT_LIVE`로 `NOT_OBSERVED`. 변이로 확인 |
| M3 PS 어댑터 경로에서 관측과 정리가 한 필드로 엮임 | 맞다. 정리 구간의 예외도 관측을 뒤집었고, 정리 블록 형식 오류도 `status`를 바꿨으며, 중단된 기록에는 형식 오류 사유가 빠졌다 | 러너가 오류 구간을 `errorPhase`(`OBSERVATION`/`CLEANUP`)로 적는다. 정리 구간 오류와 정리 블록 오류는 `cleanup.problems`로만, 관측 필드 오류는 `status`로만 간다. 중단된 기록에도 외부 사유가 남는다. 구간을 모르면 관측 불성립(안전한 쪽). 변이 2개로 확인 |
| M4(a) 상한 뒤 10초 종료 확인 창이 "유예"인가 | 해석 문제다 | 바꾸지 않았다. 관측 구간은 150초에서 끊기고, 이후 고정 한 번의 확인 창과 5초 `dispose`는 `timeline`에 따로 적는다. "상한 뒤 아무 대기도 허용하지 않는다"는 뜻이면 이 설계가 어긋나므로 소유자가 정해 달라 |
| M4(b)(c) 사후 읽기·해시와 포트 호출에 시간 제한이 없다 | 맞다 (TS: `snapshotRootsAfter`, `hashArtifacts("after")`, `spawn`, `dispose`, `listFilesRecursive`; PS: 사후 `GetFiles`, `Get-FileHash`) | 고치지 않았다. 포트 단위 시간 제한은 별도 작업(10절) |
| M4(d) CIM이 멈추면 상한을 넘는다 | 맞다. 9.2에서 이미 고쳤다 | 9.2 |
| m1 PS 프레임 해석기가 TS보다 느슨하다 | 맞다. 실측으로 5건 확인 | 9.1 |
| m4 실행 파일 경로를 중단 문구 검사에 넣지 않았다 | 맞다 | TS와 PS 양쪽이 시작 전에 `PATH_CONTAINS_ABORT_PATTERN:COMMAND`로 거절한다. 시험 추가 |
| m8 TS 요청 검사가 `layout`이 `work`에서 도출됐는지 보지 않는다 | 맞다 (PS는 봤다) | TS도 `LAYOUT_MISMATCH`로 거절한다. 변이로 확인 |
| m7 A8의 이유(stdout `logMessage` 본문 문구 감시)가 구현에 없다 | 맞다. 내가 쓴 이유 문장이 과장이었다 | 1.4절에 정정을 달았다. 구현은 하지 않았다(10절) |
| m2, m3, m5, m6 | 사실이다 | 고치지 않았다. 10절에 적었다 |

### 9.6 2026-10-29 두 번째 검토(PR #38 헤드 `2b62724`)에서 고친 것

두 결함과 판정 결정을 반영했다. 고치기 전에 새 시험을 먼저 쓰고 수정 전 코드에서 실패하는 것을 확인했다(TS 쪽 새·갱신 시험 18건 실패, PS 구조 점검 4건 실패 — 아래 9.6.5).

#### 9.6.1 후속 사유가 판정에서 빠지던 곳

`buildObservationRecord`가 `TOTAL_TIMEOUT`·`STDIN_ERROR`·`CHILD_EXITED_EARLY`를 `facts.trigger`만 보고 `status_reasons`에 올렸다. 재현(합성 입력, 가상 시계, Semgrep 없음): 초기화 응답 지연 20,000ms, `exit`와 stdin EOF를 모두 무시, `totalMs=55000`. `EXIT_TIMEOUT`(50초)이 첫 사유가 되고 stdin 닫기 유예가 전체 마감(55초)에 잘리며 `TOTAL_TIMEOUT`이 뒤따른다.

| | `trigger` | `also` | `termination.path` | `status` | `status_reasons` |
| --- | --- | --- | --- | --- | --- |
| 수정 전 | `EXIT_TIMEOUT` | `[TOTAL_TIMEOUT]` | `FORCE_KILLED` | `OBSERVED` | `[]` |
| 수정 후 | `EXIT_TIMEOUT` | `[TOTAL_TIMEOUT]` | `FORCE_KILLED` | `NOT_OBSERVED` | `TOTAL_TIMEOUT`, `FORCE_KILL_REQUIRED` |

고친 것: 관측 성립을 막는 사유(`TOTAL_TIMEOUT`, `STDIN_ERROR`, `STREAM_READ_FAILED`, `CHILD_EXITED_EARLY`, `OUTPUT_LIMIT`)를 `trigger`와 `also` 전체에서 읽는다. 순서는 `termination.trigger`·`also`에 그대로 남는다. TS 실행기와 PS 러너 결과 어댑터는 같은 `buildObservationRecord`를 쓰므로 판정이 한 곳에서 나온다. 시험: TS 실행 경로에서 `TOTAL_TIMEOUT`이 후속 사유인 경우와 첫 사유인 경우, 어댑터에 같은 모양의 러너 결과를 넣은 경우, 후속 사유 네 가지 각각, 판정 함수 단위 시험.

기존 시험 하나가 이 결함을 못 박고 있었다: `lsp-min-runner-result.test.ts`의 "PowerShell 5.1이 배열을 스칼라…"는 목적이 배열 모양인데 `also: "TOTAL_TIMEOUT"`인 입력에서 `OBSERVED`를 기대했다. 같은 시험이 배열 모양을 계속 확인하도록 입력의 사유를 관측을 막지 않는 `EXIT_TIMEOUT`으로 바꿨다(기대를 약하게 한 것이 아니라 새 판정과 모순되는 입력을 바꾼 것이다).

#### 9.6.2 스트림 읽기 실패 뒤에도 실행이 이어지던 곳

- TS `readStdout`·`readStderr`의 `catch`는 읽기 실패 플래그만 세웠다. 이제 `STREAM_READ_FAILED`를 올리고(즉시 종료 사유) 오류 문구를 `readError`로 남긴다. 이미 받은 바이트는 `stdoutChunks`·`stderrChunks`에 그대로 있고, 앞서 올라온 이유나 프레임 오류를 덮지 않는다. 읽기 실패는 정상 EOF가 아니다: `eof=false`, 끝 프레임 검사(`decoder.end()`)를 하지 않아 `FRAME_ERROR:TRUNCATED`도 만들지 않는다.
- TS `send()`는 즉시 종료 사유가 이미 걸렸으면 쓰기 전에 돌아온다. 대기를 마친 흐름이 이어서 다음 메시지를 쓰러 오는 사이에 사유가 걸리는 틈(9.5절 검토 m6)을 닫는다. 수정 전 코드에서는 이 틈에서 `shutdown`이 나갔다.
- PS 러너: stdout 읽기 실패를 `STDIN_ERROR`(쓰기 실패 이름)로 올리던 것을 `STREAM_READ_FAILED`로 바꿨고, stderr 읽기 실패는 플래그만 세우고 계속 진행하던 것을 같은 이유로 즉시 종료에 연결했다. 두 스트림의 처리는 `Step-LspMinStreamTriggers` 한 함수다(출력 상한 초과는 `OUTPUT_LIMIT`로 따로). `Send-LspMinMessage`도 즉시 종료 사유가 걸렸으면 쓰지 않고 송신 기록도 남기지 않는다. 즉시 종료 목록에 `STREAM_READ_FAILED`를 더했다. 어댑터의 사유 목록에도 더했고 러너가 남긴 `stdout.error`·`stderr.error`(형식: 메시지)를 읽는다.
- 기록: `streams.stdout.read_error`, `streams.stderr.read_error`(문자열 또는 null)를 더했다. 오류 문구는 `tokenOf`로 걸러(허용 문자 밖은 `?`) 80자까지만 싣는다. **스키마 문자열 `semgrep-lsp-min-observation/1`은 그대로다.** 기존 필드는 그대로이고 필드 둘이 늘었다.
- 시험: TS는 stdout·stderr 각각 초기화 응답 전(60초 초기화 한도를 기다리지 않고 200ms 시점에 끊는다)과 유효한 응답을 받은 뒤(`shutdown`을 쓰는 중)에 읽기를 끊어, 즉시 종료·`stdin` 닫기 없음·강제 종료 한 번·`exit` 미송신·받은 바이트와 오류 보존·정리 진행(종료 확인, `dispose`)·`STDIN_ERROR`로 부르지 않음을 확인한다. PS는 가짜 읽기 스트림으로 같은 두 시점을 만들고 `Step-LspMinStreamTriggers`와 이후 `Send-LspMinMessage`의 반응(쓰기 횟수·송신 기록 불변)을 확인한다.

#### 9.6.3 판정 결정(소유자 결정을 그대로 옮긴 것)

| 경우 | `status` | 기록 |
| --- | --- | --- |
| 강제 종료가 필요했다 | `NOT_OBSERVED` (`FORCE_KILL_REQUIRED`) | `initialize.response`(예: `VALID`), `sent` 등 관측한 사실은 그대로 |
| `exit`를 무시해 stdin EOF로 끝났다 | `OBSERVED` | `termination.path`=`STDIN_CLOSED`. 스스로 끝난 `SELF_EXIT`와 구분 |
| 같은 id의 두 번째 initialize 응답 | `NOT_OBSERVED` (`INIT_RESPONSE_DUPLICATE`) | 첫 응답의 판정은 `initialize.response`에 그대로 (시험으로 고정) |
| 정리 실패 / 관측 실패 | 서로를 바꾸지 않는다 | `cleanup.ok`는 따로 (시험: 강제 종료여도 `cleanup.ok`는 정리 결과대로) |

이 결정으로 기대가 바뀐 기존 항목: PS 러너 시험의 `ignore-exit-eof`(exit·EOF를 모두 무시해 강제 종료) 기대가 `OBSERVED`에서 `NOT_OBSERVED`(`FORCE_KILL_REQUIRED`)가 됐고, TS 쪽 같은 경로 시험에 상태 단언을 더했다. 10절 1번의 "`OBSERVED`의 의미"는 이 결정으로 정해졌다.

#### 9.6.4 시간 계약 정정

"최악의 전체 벽시계 150초 + 10초 + 5초"라는 표현은 합이 상한처럼 읽혀 정정했다(4.3절, README, PR 본문). **전체 벽시계 상한은 보장되지 않는다.** 보장되는 것은 관측 구간 150초와 그 뒤 고정 한 번의 10초 종료 확인 창이다. 새 유예도 자동 재시도도 더하지 않았다. 시간 제한이 없는 호출(TS 포트의 `spawn`·`dispose`·`listFilesRecursive`·`hashFile`, PS의 사후 폴더 목록·`Get-FileHash`·정리 구간의 기존 CIM 호출)은 그대로이고, 이번에 포트 전체의 시간 제한을 재설계하지 않았다.

#### 9.6.5 수정 전 실패와 수정 후 결과

| 확인 | 수정 전 | 수정 후 |
| --- | --- | --- |
| 새·갱신 TS 시험(`lsp-min`, `lsp-min-run`, `lsp-min-runner-result`) | 18건 실패 (재현 조건 시험은 `expected 'OBSERVED' to be 'NOT_OBSERVED'`, `send` 가드 시험은 `[initialize, shutdown]`이 나감) | 307 통과 |
| `vitest run scripts/semgrep-lsp` | 3038 통과, 8 건너뜀 | 3059 통과, 8 건너뜀 (아래 7.1 표) |
| `Test-IsolationScripts.ps1` | 239/243 (새 구조 규칙 4건 실패: `STDIN_ERROR` 이름이 `Send-LspMinMessage`·즉시 종료 목록 밖에 있음, 즉시 종료 목록에 `STREAM_READ_FAILED` 없음, 메인 루프가 `Step-LspMinStreamTriggers`를 부르지 않음, `Send-LspMinMessage`에 즉시 종료 가드 없음) | 243/243 (pwsh 7, 5.1 각각) |
| `Test-LspMinRunner.ps1` | 새 함수가 없어 시험이 중단됨(`Step-LspMinStreamTriggers`를 찾을 수 없음). 수정 전 러너의 동작은 원문으로 확인했다: stdout 실패는 `STDIN_ERROR`(358줄), stderr 실패는 플래그만(380줄) | 296/296, 건너뜀 0 (pwsh 7, 5.1 각각) |

PS 쪽 "수정 전 실패"는 TS처럼 같은 입력에서의 단언 실패가 아니라 구조 점검 실패와 새 함수 부재다. 수정 전 러너로 새 단위 시험을 끝까지 돌려 단언별 실패를 보지는 않았다. 대신 아래 변이로 새 단위 시험이 실제로 잡는지 확인했다.

변이 점검(수정한 곳 하나씩을 무효화하고 시험을 돌린 뒤 원본으로 복구, 복구는 SHA-256으로 확인):

| 변이 | 시험 | 결과 |
| --- | --- | --- |
| TS `buildObservationRecord`가 `trigger`만 읽음(`also` 무시) | vitest 3개 파일(307건) | 7건 실패 |
| TS `FORCE_KILL_REQUIRED` 사유 제거 | 같음 | 6건 실패 |
| TS 읽기 오류 문구를 기록에 싣지 않음 | 같음 | 6건 실패 |
| TS `readStdout`의 읽기 실패를 즉시 종료에 연결하지 않음 | 같음 | 2건 실패 |
| TS `readStderr`의 읽기 실패를 즉시 종료에 연결하지 않음 | 같음 | 2건 실패 |
| TS `send()`의 즉시 종료 가드 제거 | 같음 | 1건 실패 (`shutdown`이 나가는 시험) |
| TS 즉시 종료 목록에서 `STREAM_READ_FAILED` 제거 | 같음 | 3건 실패 |
| 어댑터 사유 목록에서 `STREAM_READ_FAILED` 제거 | 같음 | 2건 실패 |
| 어댑터가 러너의 오류 문구를 읽지 않음 | 같음 | 1건 실패 |
| PS 읽기 실패를 `STDIN_ERROR`로 올림 | `Test-LspMinRunner.ps1` (pwsh 7) | 290/296, 6건 실패 |
| PS 읽기 실패 분기 제거 | 같음 | 286/296, 10건 실패 |
| PS `Send-LspMinMessage` 가드 제거 | 같음 | 291/296, 5건 실패 |
| PS 즉시 종료 목록에서 `STREAM_READ_FAILED` 제거 | 같음 | 287/296, 9건 실패 |
| PS 메인 루프의 stderr 쪽 `Step-LspMinStreamTriggers` 호출 제거 | `Test-IsolationScripts.ps1` (pwsh 7) | 242/243, 1건 실패(구조 점검만 잡는다. 단위 시험은 함수만 부르므로 이 배선은 보지 못한다) |

PS 변이는 pwsh 7에서만 돌렸다(5.1에서는 변이 없이 같은 시험이 통과한다).

#### 9.6.6 Linux

이 장비(Windows 11)에는 WSL도 Docker도 없어 **Linux에서는 한 번도 실행하지 못했다.** 통합 시험이 Linux에서 어떻게 될지는 두 가지를 구분해서 적는다.

- **고정 100ms 타이밍 가정(코드를 읽은 도출, 실행 아님).** `lsp-min.integration.test.ts`의 "사전 확인 도중의 취소" 시험은 100ms 뒤 취소를 걸고 "실제 목록 조회는 한 번에 1초 안팎이라 아직 사전 확인 중"이라는 Windows CIM 실측에 기댄다. Linux의 `/proc` 목록은 훨씬 빠를 수 있어, 취소가 사전 확인이 끝난 뒤(서버를 띄운 뒤)에 걸리면 `NOT_ATTEMPTED`가 아니라 다른 결과가 되어 시험이 어긋날 수 있다. 시계 가정이지 판정 규칙의 결함이 아니다.
- **PID 이름공간 차이(코드가 이미 적어 둔 한계).** `/proc` 목록은 다른 PID 이름공간(컨테이너)·`hidepid`로 숨겨진 프로세스를 보지 못한다(`process-list-node.ts` 머리 주석, `process-observation.test.ts`의 "목록에 자기 자신이 없으면 관측 실패"). 이름공간이 나뉜 환경에서는 목록에 자식이 보이지 않아 표본·정리 확인이 달라질 수 있다.

이 문서의 Linux 관련 결과는 전부 미실행이다. Linux에서 통과했다는 보고를 받더라도 위 두 구분 없이 "전체 통과"로 읽지 않는다.

## 10. 남은 한계 (코드를 읽고 알게 됐으나 고치지 않은 것 포함)

1. **`OBSERVED`의 의미(9.6절에서 정해졌다).** 응답이 유효하고 `shutdown`·`exit`를 보냈더라도 **강제 종료가 필요했다면 `NOT_OBSERVED`**(`FORCE_KILL_REQUIRED`)다. `exit`를 무시해서 stdin EOF로 끝난 경우는 `OBSERVED`로 남지만 `termination.path`가 `STDIN_CLOSED`라 스스로 끝난 경로(`SELF_EXIT`)와 구분된다. 따라서 `OBSERVED`는 "서버가 스스로, 또는 stdin EOF만으로 끝났다"까지를 뜻하고, "`exit`에 응해 깨끗하게 끝났다"는 뜻은 `path`가 `SELF_EXIT`일 때만 성립한다.
2. **PS 읽기 실패(9.6절에서 정리했다).** 읽기 실패는 이제 TS와 PS가 같은 이름 `STREAM_READ_FAILED`로 올리고, stdout·stderr 모두 곧바로 종료한다. 남은 한계: 끊어지는 실제 파이프를 러너 전체에 흘려 보는 시험은 없다(가짜 스트림 단위 시험과 구조 점검뿐). 읽기 오류 문구는 TS가 `tokenOf`로 걸러 `streams.*.read_error`에 80자까지만 싣는다.
3. **정리 구간의 CIM.** 정리 구간은 수정하지 않은 `version-runner.ps1`의 `Get-ProcessTable`·`Stop-ProcessTree`를 그대로 쓰므로 조회 한 번의 시간 제한이 없다. 정리 구간의 "종료 확인 창 10초 고정"은 이 조회들 바깥의 대기에만 걸린다.
4. **실행 파일 고정의 범위.** 러너와 TS 모두 "이름이 `semgrep.exe`인 절대 경로 + 인자 `["lsp","--debug"]`"만 강제한다(기존 버전 러너와 같은 수준). 경로를 설치된 그 파일로 못 박고 해시를 확인하는 일은 관리자 쪽 진입 스크립트의 몫인데 아직 없다. 실행 전후 해시 비교는 호출자가 `artifacts`로 준 파일에만 한다.
5. **표본 추출.** A3~A5는 일정 간격으로 읽는 방식이라 간격 사이의 일은 못 본다. 홈 폴더는 `.semgrep/cache/fingerprinted_ignored_findings/` 밖에 파일이 생기면 곧바로 중단하므로, 실제 Semgrep이 다른 파일을 쓰면 관측이 중단된다(보수적 방향).
6. **실제 Semgrep 미확인.** 초기화 응답의 모양, 서버가 하는 일, 자손 구성은 고정 공개 소스를 읽은 도출이다. 바이너리와 소스의 대응도 증명돼 있지 않다. Linux 분기(`/proc` 목록 등)는 작성만 했고 실행하지 않았다.
7. **기존 파일 변경.** 기존 파일 세 개는 추가만 했다(삭제 0줄). 그중 `structure.test.ts`의 "`testing/` 허용 파일 목록"에는 스텁 서버 파일 한 줄이 늘었다.
8. **프로세스 외 확인.** 이 작업에서는 `moai` CLI가 PATH에 없어 `moai model profile`로 에이전트 모델을 확인하지 못했다. 독립 검토 에이전트는 모델을 지정하지 않고(세션 모델 상속) 띄웠다.
9. **시간 제한이 없는 호출(검토 M4 b·c).** TS 실행기의 `spawn`·`dispose`·`listFilesRecursive`·`hashFile`과 PS 러너의 사후 폴더 목록·`Get-FileHash`(약 246 MB `semgrep-core.exe`를 해시할 수 있다)에는 시간 제한이 없다. 가상 시계 시험에서는 이 호출이 0초라 `cleanup_ms <= killConfirmMs`가 항상 참이다. 실제로는 이 호출들이 정리 시간을 늘릴 수 있다. **그래서 전체 벽시계 상한은 보장되지 않는다**(4.3절). 보장되는 것은 관측 구간 150초와 고정 한 번의 10초 종료 확인 창뿐이다.
10. **PS 경로의 "실시간" 범위(검토 m2).** 러너는 루프백 수신기를 직접 보지 않고 `abortFile` 존재만 본다(수신기를 읽는 관리자 쪽 폴러는 아직 없다). 그래서 PS 경로의 기록에서 `coverage.live.receiver.samples`는 호출자가 넘긴 값이고 0일 수 있다. `interval_ms`는 설정값이지 달성한 간격이 아니다. 감시 폴더는 파일만 열거하므로 빈 폴더·재해석 지점은 미관측이다. `initialized_sent: false`는 상수이고, 실제로 쓴 바이트의 기록은 러너의 라벨 목록뿐이다.
11. **이미지 허용 목록은 이름만 본다(검토 m3).** 어댑터가 러너의 `descendantsSeen`(실행 파일 경로 포함)을 기록으로 가져오지 않아, 다른 경로의 `python.exe`·`conhost.exe`도 A4를 통과한다.
12. **TS 실행기의 환경(검토 m5).** Node 포트로 띄우면 Windows에서 부모 이름 7개(`HOMEDRIVE` 등)가 자식 환경에 들어간다(통합 시험이 기록한다). 환경을 완전히 비우는 쪽은 PS 러너뿐이다. 기록은 어느 실행기가 만들었는지 적지 않는다.
13. **작은 경합(검토 m6).** (9.6절에서 TS `send()`가 즉시 종료 사유를 먼저 보도록 고쳤다. 아래 나머지는 그대로다.) 루트가 끝났는데 자손만 남은 경우 TS 실행기는 기록만 하고 끝내지 않는다(PS 러너는 정리한다). PS `finally`에서 `Stop-ProcessTree`가 한 번 더 불릴 수 있다(`killCount`는 1로 유지).
14. **stdout 알림 본문(검토 m7).** A1·A2 문구 검사는 stderr에만 걸린다. 같은 문구가 stdout `window/logMessage`의 본문으로 오는 경우는 감시하지 않는다.
