# LSP-RULES-1 계약과 계획: `initialized` 이후, 내려받기 없는 로컬 규칙 로딩 관측

- 작성일: 2026-10-29
- 기준: PR #39 HEAD `eaf9320439ab6a8859553b4fa1d393500e5c5c2e` (로컬·원격·PR이 같음을 작성 직전에 확인). 이 문서는 그 위의 별도 브랜치 `security/semgrep-lsp-rules-load-plan`에 문서 1개로 더한다.
- 성격: **계약의 정적 확인과 실행 계획뿐이다.** 실제 Semgrep은 `--help`·`--version`을 포함해 실행하지도 임포트하지도 않았고, 계정·방화벽·감사·ACL 같은 시스템 격리는 적용하지 않았다. 규칙 다운로드, 대상 스캔, 음성 대조, 병합, 배포도 하지 않았다. 운영 코드, 시험, 계약 파일, `pin.json`, `verified`, `policy_accepted`, ADR 상태, 기존 PR, `main`, 보담 저장소는 그대로다. LSP-MIN-1과 `--version` 시간 초과 원인 추적은 다시 하지 않았다.
- 읽은 것: 고정 공개 커밋 `a35fe8306115b3e55274969098cc46f8451d6b4d`의 소스 파일 85개(git 트리 API로 목록을 받고 blob 해시 85/85 일치, 트리 응답 `truncated=false`). 소스 텍스트를 읽었을 뿐 Semgrep **규칙**을 내려받은 것이 아니다. 저장소 쪽은 PR #39 HEAD의 하니스 파일을 읽었다.
- 구분 표기: **[소스]** 고정 공개 커밋에서 읽은 것, **[설치물]** 이 PC의 설치물과 LSP-MIN-1 증거에서 확인한 것, **[미확인]** 설치된 바이너리의 동작으로는 확인하지 못한 것, **[도출]** 위를 이어 붙인 판단. 근거는 `[S12]`처럼 ID로 인용하고, 줄 번호는 11절 부록에 있다.

## 1. 결론

| 질문 | 답 | 구분 |
| --- | --- | --- |
| `initialized` 뒤 "규칙 로딩만" 관측하는 것이 가능한가 | **가능하다고 단정하지 않는다.** 소스상으로는 근거가 있다: 열린 문서가 없으면 자동 스캔 절차가 시작되지만 엔진을 돌리기 전에 되돌아온다([S13] [S17] [S20]). 바이너리에서는 확인된 바 없고, 그것을 확인하는 것이 다음 실행의 목적이다 | 소스 / 도출 / 미확인 |
| `initialized`가 자동으로 시작하는 것 | 토큰 확인(조건부), 규칙 새로고침, **열린 문서 스캔 절차(대상 0개)**, 서버→클라이언트 진행 **요청**과 진행 알림. 작업 영역 전체 스캔은 시작하지 않는다 | 소스 |
| `semgrep/rulesRefreshed` 알림이 규칙 로딩 성공의 증거인가 | **아니오.** 규칙이 0개여도, 파일이 잘못돼도 나온다([S32] [S33]) | 소스 |
| 현재 하니스를 그대로 쓸 수 있는가 | **아니오.** 로그 판독기는 실제 머리말을 처리하지 못하고, LSP-MIN-1의 중단 문구는 이 단계의 정상 신호를 중단 사유로 취급하며, 서버 요청은 이상으로 분류되고, 옛 평가기는 알림 한 번이면 `rulesOk`로 둔다(4.6절, 5절) | 하니스 |
| 다음 실행에서 새로 허용해야 하는 동작 | `initialized` 1회 송신과 그에 따른 서버의 자체 동작, 해시 고정 규칙 파일 1개의 읽기·구문 분석, 장벽 뒤 짧은 대기, 서버 요청 무응답(7.4절 (나)). 코드 변경도 별도 승인 대상이다 | 계획 |
| 아직 막혀 있는 조건 | 구현·시험 없음, 헤더 형태(INFO/WARNING) 미관측, 프로브 규칙의 유효성 미확인, 소스↔바이너리 대응 미확인, 네트워크 출처 검사의 빈틈(4.2절). 전체 목록은 7.4절 (다)·(라) | 계획 |

## 2. 시작 확인

| 확인 | 결과 (사실) |
| --- | --- |
| 로컬·원격·PR HEAD | 모두 `eaf9320439ab6a8859553b4fa1d393500e5c5c2e`, PR #39는 Draft·열림 |
| 작업 트리 | 깨끗함(PR #39 워크트리에서 `git status --short` 출력 없음) |
| 기존 흔적 | 이 단계용 브랜치, PR, 워크트리, 보고서가 없었다. 원격 `security/semgrep-lsp-*` 브랜치 11개는 모두 이전 단계의 것이다. 그래서 새로 만들었고 중복은 없다 |
| 기반 | 새 브랜치 `security/semgrep-lsp-rules-load-plan`을 `eaf9320`에서 만들었다(`git worktree add -b`, 주 체크아웃의 브랜치는 `main` 그대로) |

## 3. 기존 결과 정리

### 3.1 LSP-MIN-1은 그 계약 안의 결과로 유지한다

RunId `20261029T060257Z-5386c62f`의 판정 `LSP_MIN_OBSERVED`는 "`initialize → shutdown → exit` 최소 기동이 그 계약대로 성립했다"는 뜻으로만 둔다. 규칙 로딩, 스캔, 보안 통과, 대조 참조 자격으로 넓히지 않는다. 기록의 `not_established` 일곱 항목은 그대로 `NOT_ESTABLISHED`다. 이번에 증거 파일은 다시 실행하지 않고 읽기만 했다.

### 3.2 `python.exe` 두 경로의 확인 결과 (읽기 전용 확인)

| 저장된 증거 | 구분 가능한가 |
| --- | --- |
| 적용 직후 직접 확인 JSON(`verify-applied-20261029T060257Z-5386c62f.json`, 해시는 11.1절) | **구분할 수 없다.** `ace.file.*` 키는 `semgrep.exe`, `python.exe`, `semgrep-core.exe` 셋뿐이고 `python.exe` 키의 값은 **기반 Python** 경로(`…\Python312\python.exe`)다. 같은 키를 두 번 썼으므로 가상환경 `python.exe`의 값은 덮여서 남지 않았다 |
| 진입점의 L08 결과 문자열 | 실행 당시 사전 조건 기록에 `semgrep.exe=1, python.exe=1, python.exe=1`로 남아 있다. 경로 이름표가 없고, 순서가 코드의 점검 순서(`semgrep.exe`, 가상환경 `python.exe`, 기반 `python.exe`)와 같다는 것은 코드에서 도출한 것이다([H17]). 저장된 이름표가 아니다 |
| `resources.json`의 권한 부여 기록 | 폴더 단위(가상환경 루트, 기반 Python 폴더 각 1건)이고 파일 단위가 아니다 |

복원할 근거가 더 없다. 임시 ACE는 복구에서 지워졌고 시스템 변경이 금지된 이번 작업에서는 다시 확인할 수 없으므로 **저장 증거의 한계로 남긴다.** 과거 확인을 새로 수행한 것으로 쓰지 않는다. 폴더 단위 ACE가 정확히 한 건씩 추가된 것은 실행 전·후 SDDL 비교로 남아 있는 별개의 증거다.

### 3.3 `shutdown` 무응답: 사전 소스 조사와 이번 관측이 일치한다

- [소스] `shutdown` 처리는 맨줄 `Shutting down server`를 남기고 무시 목록 파일을 쓴 뒤 **빈 응답**(`Reply.empty`)을 돌려준다([S36] [S48] [S49] [S50] [S51]).
- [설치물] LSP-MIN-1의 stderr에 맨줄 `Shutting down server`, 홈에 `ws.txt` 생성, stdout에 `shutdown` 응답 프레임이 없었다.
- [도출] 사전 소스 조사의 예상과 관측이 일치한다. 이 일치는 소스와 바이너리가 같다는 증명은 아니다.

### 3.4 로그의 `"id": 0`은 응답 id와 다른 값이다

- [설치물] stderr `Handling request` 로그에는 `"id": 0`이 찍혔지만, stdout의 initialize 응답은 보낸 문자열 id `lsp-min-init-1`을 그대로 되돌렸다.
- [소스] 요청 로그는 해석된 요청을 **상수 id** `` `Int 0``으로 다시 만들어 찍는다([S47]). 실제 요청 id와 무관한 로그 표기다.
- [미확인] 설치된 바이너리가 같은 코드인지는 확인하지 않았다. 앞선 보고서의 "원인 미확인"은 그 시점의 기록이며, 이제 "소스에서 설명됨, 바이너리 일치는 미확인"으로 둔다. 판정의 응답 일치는 stdout의 응답 id로 하며 이 로그 값에 기대지 않는다.

### 3.5 이 계획에 필요한 LSP-MIN-1 관측 사실

| 항목 | 값 |
| --- | --- |
| stderr | 6,244 B, 152줄(머리말 있는 줄 20, 없는 줄 132), sha256 `0992b0b1…8566` |
| 머리말 있는 줄 | 20줄 **모두 `DEBUG`이고 태그가 `(default)`**. 예: `[00.11][DEBUG](default): Executed as: osemgrep lsp --debug`. 경과 시간 필드는 0.04~0.70 |
| 머리말 없는 줄(맨줄, App 수준) | `Starting legacy language server`, `Initializing server`, `Caching workspace targets`, `Finished caching workspace targets`, `Server initialized`, `Shutting down server`, `Server stopped` |
| `INFO`·`WARNING`·`ERROR` 머리말 | **관측된 적 없다**(initialize까지만 갔기 때문) |
| 서버 유형 | `Starting legacy language server`가 나왔으므로 legacy 경로임이 설치물에서 확인된다. 소스의 기본 경로와 같다([S74]) |
| 시간 | initialize 응답 1,930 ms, 관측 전체 2,675 ms |
| 세션 덤프 | `initialized = false`, `open_documents = []`, `deployment_id = None`, `skipped_app_fingerprints = []`, `metrics.client_metrics.enabled = false` |

## 4. 다음 단계의 정적 계약 확인

### 4.1 `initialized`가 시작하는 경로

| 단계 | 하는 일 | 네트워크 | 근거 |
| --- | --- | --- | --- |
| 가드 | `initialized` 알림 처리의 시작. 서버가 아직 초기화되지 않았으면 알림을 처리하지 않는다 | 없음 | [S01] [S02] |
| 토큰 확인 | `ci`와 `pro_intrafile`이 **둘 다 false**이면 디버그 줄 `CI disabled, not checking API token`만 남기고 끝낸다. 하나라도 true이고 토큰이 있으면 `verify_token_async`로 검증한다 | 조건부 (이 계획의 설정에서는 없음) | [S03] [S25] [S26] [S27] |
| 규칙 새로고침 | 맨줄 `Refreshing rules` → 규칙 읽기(`cache_session`) → 진행 종료 → stdout 알림 `semgrep/rulesRefreshed` → 맨줄 `Rules refreshed` | 설정에 따라 다름(4.2절) | [S08] [S09] [S10] [S11] [S12] |
| 토큰이 있을 때만 | 앱에서 무시 목록·배포 id를 가져온다. 토큰 출처는 환경 변수 → 설정 파일 | 토큰이 있을 때만 | [S28] [S34] [S35] |
| **열린 문서 스캔** | 새로고침이 끝나면 **항상** 호출된다. 맨줄 `Scanning open documents` → 진행 요청 → 열린 문서 목록으로 스캔 → 맨줄 `Scanned open documents` | 없음 (엔진을 돌리지 않으면) | [S13] [S14] [S15] [S16] [S17] |
| 무시 목록 읽기 | 홈의 캐시 파일을 읽는다(없으면 건너뜀) | 없음 | [S04] |
| 진행 표시 | 서버가 클라이언트에 **요청** `window/workDoneProgress/create`와 `$/progress` 알림을 보낸다(새로고침 때와 열린 문서 스캔 때 각 한 번) | 없음 | [S44] [S45] [S46] |

`initialized`가 **시작하지 않는** 것: 문서 열기·저장([S05]), 작업 영역 폴더 변경([S06]), 사용자 정의 알림 `semgrep/scanWorkspace`([S07]). 이것들을 보내지 않는 한 작업 영역 전체 스캔과 단일 파일 스캔은 일어나지 않는다. [소스]

### 4.2 명시한 로컬 규칙만 쓰고 기본 규칙·레지스트리로 넘어가지 않는 조건

| 조건 | 어긋나면 | 근거 | 현재 하니스 |
| --- | --- | --- | --- |
| `configuration`이 비어 있지 않다 | `["auto"]`(레지스트리)로 간다 | [S30] [S38] | 거절함 [H04] |
| 항목이 특수 문자열이 아니다: `auto`, `r2c`, `policy`, `supply-chain`, `hooks`, `r/…`, `p/…`, `s/…`, `http(s)://…` | 레지스트리·앱·내려받기로 간다 | [S52] [S53] [S54] [S55] [S56] [S57] | **부분만 거절한다.** 정규식은 `auto`, `r/ p/ s/`, `http(s)://`만 본다 [H03]. `r2c`, `policy`, `supply-chain`, `hooks`가 빠졌다. 이 계획의 절대 경로(드라이브 문자)는 충돌하지 않지만 검사가 완전하다고는 쓸 수 없다 |
| 경로가 실제로 존재하는 폴더다 | 레지스트리로 넘어가지 **않고** 설정 오류 예외가 난다. 새로고침이 중간에 실패한다 | [S58] [S59] | 사전 조건에서 폴더 존재를 확인한다 |
| `ci`가 false다 | CI 규칙을 앱에서 가져온다 | [S40] [S29] | 고정 false |
| `scan` 객체에 알 수 없는 키가 없다 | 읽기에 실패하면 **세션 기본 설정**(`ci=true`, `configuration=[]` → `auto`)으로 되돌아간다. 읽기 실패가 알 수 없는 키 때문에 난다는 부분은 `[@@deriving yojson]`의 기본 엄격성에 기댄 도출이고(소스 줄이 아니라 외부 지식), 하니스 문서도 같은 설명이다 | [S75] [S76] [S38] [S39] [S40] [H18] | 키 집합을 검증함 |
| 환경에 `SEMGREP_APP_TOKEN`이 없고 전용 홈에 설정 파일이 없다 | 토큰이 생기면 앱 호출 경로가 열린다 | [S28] [S71] [S73] | 환경 11개 이름 고정, 홈은 비어 있음 |
| 폴더 안에서 읽는 것은 `.yaml`/`.yml`이면서 `.test.yaml` 계열이 아닌 파일뿐이다 | 그 밖의 파일은 무시된다 | [S62] [S63] [S64] [S65] | 폴더에 파일 1개만 둔다 |

[도출] 위 조건을 모두 지키면 소스상 규칙 읽기는 로컬 파일 1개에 한정된다. 하지만 하나라도 어긋날 때 서버가 조용히 레지스트리로 넘어가는 경로가 있으므로(`[S30]`), 사전 검사를 건너뛰는 일이 없어야 하고 실행 중에도 4.4절의 신호로 감시한다.

### 4.3 로딩 완료·실패를 구별할 관측값과 장벽

| 관측값 | 수준·머리말 | 무엇을 말하는가 | 한계 |
| --- | --- | --- | --- |
| stdout `semgrep/rulesRefreshed` | 알림 | 새로고침이 **끝났다**. 규칙 수와 무관 | 0개여도 나온다 [S33] |
| `Refreshing rules` → `Rules refreshed` → `Scanning open documents` → `Scanned open documents` | 맨줄(머리말 없음) | 단계 순서. `Scanned open documents`는 열린 문서 스캔이 끝난 뒤에 찍힌다 | 순서만 말한다 |
| `loading local config from <파일>`, `Done loading local config from <파일>` | `[..][INFO]: ` | 파일 단위로 읽기 시작·끝. `Done`은 파싱이 `Ok`일 때만 | 무효 규칙이 있어도 `Done`이 나올 수 있다 [S60] [S61] |
| `Got N errors while refreshing rules in language server` | `[..][INFO]: ` | 파일 단위 읽기 오류 수 | 무효 규칙(건너뛴 규칙)은 세지 않는다 [S31] |
| `No rules to run! Not scanning anything.` | `[..][WARNING]: ` | 로딩된 규칙이 **0개** | 원인은 말하지 않는다 [S19] |
| `No targets to scan! Not scanning anything.` | `[..][WARNING]: ` | 규칙은 **1개 이상** 있고 대상이 0개 | 규칙 수는 알 수 없다 [S20] |
| (없음) 엔진 경로의 `Running Semgrep with N rules`, `Semgrep errors:`, `Scanned N files` | 디버그·맨줄 | 엔진이 실행됐다 | 이 계획에서는 **나오면 안 된다** [S21] [S22] [S23] |

- [도출] **로딩된 규칙 수는 직접 관측되지 않는다.** 엔진이 돌지 않는 이 경로에서는 규칙 수를 찍는 줄이 없다. `No targets to scan!`(수가 1 이상)과 `No rules to run!`(수가 0)의 구별만 가능하다.
- [소스] 무효 규칙의 `skipping rule …` 경고는 라이브러리 로그 소스에서 나온다([S66]). LSP-MIN-1의 stderr 서두에 `Skipping logs for: [… semgrep.parsing …]`이 있었으므로(설치물) 기본 `--debug`에서는 보이지 않는다. 잘못된 규칙은 stderr에 흔적 없이 "규칙 0개"로 나타난다.
- 장벽: stdout `rulesRefreshed` **와** 맨줄 `Scanned open documents`가 모두 나온 시점. 옛 하니스의 PH2 조건과 같다([H13]).

### 4.4 오인 방지: 실패가 로딩 성공으로 읽히지 않는 판정

| 상황 | 소스상 일어나는 일 | 판정 |
| --- | --- | --- |
| `initialize`가 오류 응답이거나 `result` 안에 `InitializeError` | 서버가 초기화되지 않은 상태라 이후 알림을 처리하지 않는다 [S02] | `initialized`를 **보내지 않고** 기존 방식으로 종료. 판정 `NOT_OBSERVED:INIT_INVALID` |
| 사전 조건·결합·신원 확인 실패 | 서버를 띄우지 않는다 | `NOT_ATTEMPTED` (로딩 판정 없음) |
| 규칙 폴더가 없음 | 설정 예외 → 새로고침이 중간에 죽는다. `rulesRefreshed`와 `Scanned open documents`가 안 나온다 [S59] | `LOAD_FAILED:RULES_REFRESH_INCOMPLETE` |
| 폴더는 있는데 유효한 규칙 파일이 없음 | `rulesRefreshed`는 나오고 `Got 0 errors`, 이어서 `No rules to run!` [S33] [S19] | `LOAD_FAILED:NO_RULES_TO_RUN` |
| 파일이 YAML로 읽히지 않음 | `loading …`은 있고 `Done …`이 없으며 `Got 1 errors` [S60] [S61] [S31] | `LOAD_FAILED:LOCAL_CONFIG_ERRORS` |
| 파일은 읽혔지만 규칙이 무효 | `Done …`, `Got 0 errors`, `No rules to run!`. 원인은 stderr에 안 보인다 [S66] [S19] | `LOAD_FAILED:NO_RULES_TO_RUN` |
| 필요한 줄이 있는데 머리말 형태를 못 읽음 / 필요한 줄이 안 보임 | 판독 불가 | `NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED` 또는 `NOT_CONFIRMED:SIGNAL_ABSENT`. **성공으로 쓰지 않는다** |
| 알림만 있고 나머지 신호가 없음 | 알림은 규칙 수와 무관 [S33] | `NOT_CONFIRMED:SIGNAL_ABSENT` |
| 서버가 오류 수준 줄을 남김(`[..][ERROR]`) | 예: 새로고침 중 예외 | `LOAD_FAILED:SERVER_ERROR_LOGGED` |
| 레지스트리·내려받기·토큰 경로의 줄이 나옴 | 4.2절 조건이 어긋남 | 즉시 중단 `ABORTED:A2` |

### 4.5 `initialized`에 대한 서버 요청과 응답

[소스] 서버는 `initialized` 뒤 클라이언트에 `window/workDoneProgress/create` **요청**을 보낸다([S45]). 클라이언트가 응답하면 서버는 그것을 `Unhandled message`로 처리해 **오류 수준**으로 남기고([S41] [S42]), 응답이 중요한 요청을 보내지 않는다고 적어 두었다([S43]). 따라서 **응답하지 않는 것**이 맞고, 응답하면 오히려 `[ERROR]` 줄이 생긴다. 응답하지 않아도 서버가 기다리지 않는다는 것은 소스에서 읽은 것이고 바이너리로는 미확인이다. 현재 LSP-MIN-1 실행기는 서버 요청 1건 이상을 이상으로 분류한다([H12]).

### 4.6 stderr 머리말과 현재 로그 판독기

- [소스] 머리말은 `App` 수준에는 없고, `Error`·`Warning`·`Info`는 `[초][수준]: `(태그 없음), `Debug`는 `[초][수준](태그): `, 기본이 아닌 로그 소스는 `(소스이름)`이 더 붙는다([S67] [S68] [S69]).
- [설치물] 관측된 머리말은 `[..][DEBUG](default): `뿐이다(3.5절). `INFO`·`WARNING` 형태는 소스의 형식으로만 알고 바이너리로는 미관측이다.
- [하니스] `defaultLogFormat`은 접두어가 없다는 가정이라 머리말이 붙은 줄은 전부 인식하지 못한다([H01]). 인식 표에는 `No targets to scan!`·`No rules to run!`·토큰 확인·설정 파일 줄이 없다([H02]). LSP-MIN-1의 `HEADER_PREFIX`는 머리말을 세기만 하고 본문을 꺼내지 않는다([H11]). 핀 파일의 로그 형식은 아직 `UNVERIFIED`다([H16]).
- [도출] 지금의 판독기로는 4.3절의 `INFO`·`WARNING` 신호를 하나도 읽지 못하고 맨줄 4개만 읽는다. 머리말을 벗기는 형식과 새 키 추가가 **필수 변경**이다. 메시지가 여러 줄이면 머리말은 첫 줄에만 있고 이어지는 줄은 맨줄이다(설치물: `Handling request:` 뒤의 JSON 줄들).

### 4.7 빈 작업 영역에서도 자동 스캔이 시작되는가, 범위는

- [소스] **시작된다.** 열린 문서 스캔은 `initialized`의 새로고침 뒤 항상 호출되며([S13]) 열린 문서가 없어도 맨줄 `Scanning open documents`와 진행 요청이 나간다([S15] [S44]).
- [소스] 범위는 **열린 문서뿐**이다([S17]). 열린 문서가 없으면 대상 목록이 빈 목록이라 엔진 호출 전에 `No rules to run!` 또는 `No targets to scan!`으로 되돌아온다([S19] [S20]). 작업 영역의 파일 유무와 무관하다. 빈 작업 영역을 유지하는 이유는 이 분기에 기대지 않는 두 번째 방어(파일이 있어도 열리지 않는 한 스캔 안 됨, 감시 대상이 단순함)다.
- [소스] 메트릭 전송은 엔진 실행 경로에서만 호출되므로([S24] [S37]) 이 분기에서는 도달하지 않는다. 설정에서도 메트릭을 끈다.
- [미확인] 위는 모두 소스 읽기다. 바이너리가 같은 분기로 가는지는 실행으로만 확인된다.

### 4.8 소스·설치물·미확인 요약

| 주제 | 공개 소스(고정 커밋) | 설치물에서 확인 | 미확인 |
| --- | --- | --- | --- |
| initialize 흐름 | 읽음 | LSP-MIN-1에서 일치 | 소스와 바이너리의 동일성 |
| `shutdown` 무응답, 홈 파일 쓰기 | 읽음 [S48]~[S51] | 관측 일치 | 동일성 |
| `initialized` 이후 전체 | 읽음(4.1절) | **없음** (한 번도 보내지 않음) | 전부 |
| `INFO`·`WARNING` 머리말 형태 | 읽음 [S68] | 없음 | 전부 |
| 프로브 규칙의 유효성 | 해석기 소스만 읽음 | 없음 | 전부 |
| 열린 문서 0개일 때 엔진 미실행 | 읽음 [S20] | 없음 | 전부 |

소스와 바이너리의 대응이 미확인이라는 한계는 이번에 풀리지 않았다. 읽은 소스는 그 대응의 증명이 아니다.

## 5. 현재 하니스와의 차이

| 항목 | 현재 | 이 단계에서 필요한 것 |
| --- | --- | --- |
| 송신 순서 | `initialize, shutdown, exit`만 ([H05]) | `initialize, initialized, shutdown, exit` |
| 중단 문구 A1 | `Refreshing rules`·`Rules refreshed`·`Scanning open documents`·`Scanned open documents`를 중단 사유로 둠 ([H06]) | `initialized` 송신 **뒤**에는 정상 신호. 그 앞이거나 그 밖의 스캔 줄(`Scanning workspace` 등)은 계속 중단 |
| 중단 문구 A8 | stdout `rulesRefreshed`를 중단 사유로 둠 ([H08]) | `initialized` 뒤 1회는 정상. `publishDiagnostics`는 계속 중단 |
| A2 | `download`·`registry` 부분 문자열 ([H07]) | 유지하되 구체 문구(`trying to download from`, `No rules source specified, using auto`, `Found API token in environment variables`, `Settings file found` 등)를 더한다 |
| 서버 요청 | 1건 이상이면 이상 ([H12]) | `window/workDoneProgress/create` 최대 2건은 정상, 그 밖은 이상 |
| 로그 판독 | 머리말 미처리 ([H01]) | 머리말을 벗기는 형식, 새 키, 여러 줄 메시지 복원 |
| 판정 | 이 단계용 판정 모듈 없음. 옛 평가기는 알림 1회면 `rulesOk` ([H14] [H15]) | 4.4절 판정을 가진 새 순수 모듈. 옛 평가기와 연결하지 않는다 |
| 규칙 폴더 감시 | 비어 있어야 함 ([H10]) | 정확히 1개 파일, 해시 불변 |
| 네트워크 출처 검사 | 일부 누락 ([H03]) | 소스의 전체 목록과 절대 경로 요구 |

## 6. 최소 계획 LSP-RULES-1 (실행하지 않는다)

### 6.1 인자·환경·메시지 순서

- 실행 파일·인자·환경은 LSP-MIN-1과 **같다**: `["lsp","--debug"]`, 환경 이름 11개 고정, 부모 환경 비상속, `SEMGREP_ENABLE_VERSION_CHECK` 없음. 선택 사항으로 `SEMGREP_LOG_SRCS=semgrep.parsing`을 더하면 무효 규칙 경고가 보이지만 기본은 **더하지 않는다**(소유자 결정 D5).
- 초기화 옵션은 키 집합을 고정한다: `scan`{`ci:false`, `configuration:[<규칙 폴더 절대 경로>]`, `maxTargetBytes`, `onlyGitDirty:false`, `pro_intrafile:false`, `timeout`, `timeoutThreshold`}, `metrics`{`enabled:false`}.

| 단계 | 송신 | 기다리는 것 | 한도 (제안) |
| --- | --- | --- | --- |
| S1 | `initialize` | 응답 `VALID`(LSP-MIN-1의 V 규칙 그대로, `serverInfo.version`은 핀과 `MATCH`) | 60,000 ms (기존 initMs) |
| S2 | `initialized` **정확히 1회**, S1이 `VALID`일 때만 | 장벽: stdout `rulesRefreshed` 1회 **그리고** 맨줄 `Scanned open documents` 1회 | `rulesMs` 60,000 ms (신규) |
| S3 | (송신 없음) | 장벽 뒤 `settleMs` 2,000 ms 동안 표본 감시를 계속(금지 신호가 늦게 오는지 본다. 부재의 증명이 아니라 짧은 확인이다) | 2,000 ms (신규) |
| S4 | `shutdown` | 응답을 **기다리지 않는다**(3.3절) | — |
| S5 | `exit` | 자식 종료 | 30,000 ms (기존 exitMs) |

- 전체 상한 150,000 ms, stdout 1 MiB, stderr 256 KiB는 LSP-MIN-1 그대로다(관측 stderr는 6.2 KB였다). 장벽 한도를 넘기면 `shutdown`·`exit`을 보내지 않고 stdin을 닫은 뒤 유예 안에 안 끝나면 프로세스 트리를 종료한다(기존 INIT_TIMEOUT과 같은 경로, 판정 `NOT_OBSERVED:RULES_TIMEOUT`).
- **보내지 않는 것:** `textDocument/didOpen`·`didChange`·`didSave`·`didClose`, 작업 영역 변경 알림, `semgrep/scanWorkspace`, `semgrep/refreshRules`, `debug/echo`, 서버 요청에 대한 응답 ([S05] [S06] [S07] [S43]).

### 6.2 로컬 규칙의 출처·해시, 빈 작업 영역

- **출처:** 이 계획이 정하는 **새로 쓴 파일 1개**다. 내려받지 않는다. 고정 `semgrep-rules`의 일부 파일을 쓰는 안은 로컬 사본이 없어 내려받아야 하므로 이번 범위에서 제외하고 별도 승인 사항으로 둔다(D4).
- 파일 `lsp-rules-1-probe.yaml`의 전문:

```yaml
rules:
  - id: lsp-rules-1-probe
    message: LSP-RULES-1 probe rule. It is loaded but is not expected to match any target.
    severity: INFO
    languages:
      - generic
    pattern: LSP_RULES_1_PROBE_TOKEN_THAT_IS_NEVER_PRESENT
```

| 항목 | 값 (이번에 계산·확인) |
| --- | --- |
| 크기 | 233 바이트, 줄바꿈 LF, BOM 없음, 끝 줄바꿈 있음 |
| sha256 | `d5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145` |
| git blob sha1 | `bf70b1a4cb1d8ca194becebfc8002d3c76ba97f6` |
| 서식 | 저장소의 prettier 설정(`.prettierrc`)으로 `--check` 통과 |
| 실행 시 배치 | 구현 PR이 저장소에 **바이트 단위로 같게** 추가한다(제안 위치 `scripts/semgrep-lsp/data/lsp-rules-1-probe.yaml`). 관리자 진입점이 전용 규칙 폴더에 복사하고 복사 전·복사 후·실행 뒤 sha256을 대조한다 |

- **유효성은 미확인이다.** 이 파일이 Semgrep 1.180.0에서 유효한 규칙으로 해석되는지는 Semgrep을 실행하지 않고는 알 수 없다. 해석기가 요구하는 필수 항목(`id`, `message`, `severity`, `languages`, 패턴)을 갖췄다고 소스를 읽어 맞췄을 뿐이다. 무효로 판정되면 4.4절의 `NO_RULES_TO_RUN`으로 나타나며 성공으로 읽히지 않는다.
- **규칙 폴더:** 그 파일 1개만 둔다. 다른 파일, 하위 폴더, 이름 끝 `.test.yaml` 계열 금지. 경로에 `download`·`registry`·`auto` 같은 문구가 없어야 한다(기존 L11 확장). 절대 경로이고 드라이브 문자로 시작해야 한다.
- **작업 영역:** 파일이 0개인 빈 폴더. 규칙 폴더와 분리한다. 전용 홈은 기존 방식(작업 폴더 아래, 비어 있음).

### 6.3 규칙 로딩과 스캔의 경계

| 구간 | 신호 (시작 → 끝) | 이 관측이 다루는가 |
| --- | --- | --- |
| 규칙 로딩 | 맨줄 `Refreshing rules` → (`Info` 읽기 줄들) → `Rules refreshed` + stdout `rulesRefreshed` | 예 |
| 자동 열린 문서 스캔(대상 0개) | 맨줄 `Scanning open documents` → 경고 한 줄 → `Scanned open documents` | **시작은 막지 못하고** "엔진 없이 끝났다"는 신호만 본다 |
| 엔진 실행 | `Running Semgrep with N rules`, `Semgrep errors:`, `Scanned N files`, `Found N matches` | 아니오. **나오면 중단** |
| 작업 영역 스캔·단일 파일 스캔 | `Scanning workspace`, `Scanning single file` | 아니오. 나오면 중단 |
| 진단 | stdout `textDocument/publishDiagnostics` | 아니오. 나오면 중단 |

**숨기지 않고 적는다:** `initialized`는 열린 문서 스캔 절차를 자동으로 시작한다(범위 0개). 이를 막는 수단은 없고, 소스상 엔진 호출 전에 되돌아온다는 근거만 있다. 그래서 이것은 "규칙 로딩만 하는 관측"이 가능하다는 주장이 아니라, **그렇게 끝나는지를 관측하는 실행**이다.

### 6.4 성공·실패·미확인 기준과 중단 조건

**성공 `RULES_LOAD_OBSERVED`는 아래를 모두 만족할 때만이다.**

| # | 조건 |
| --- | --- |
| 1 | 사전 조건·결합·신원 확인 통과, 설치물 해시 불변 (LSP-MIN-1과 같음) |
| 2 | `initialize` 응답 `VALID`, 서버 버전이 핀과 같음 |
| 3 | `initialized`가 정확히 1회, 2번 뒤에만 송신됨 |
| 4 | stdout `semgrep/rulesRefreshed` 정확히 1회 |
| 5 | 맨줄 4개(`Refreshing rules`, `Rules refreshed`, `Scanning open documents`, `Scanned open documents`)가 각각 정확히 1회, 이 순서 |
| 6 | `loading local config from <프로브 파일>`과 `Done loading local config from <프로브 파일>`이 각각 정확히 1회, 다른 경로의 로딩 줄은 없음 |
| 7 | `Got 0 errors while refreshing rules in language server` 정확히 1회 |
| 8 | `No targets to scan! Not scanning anything.` 정확히 1회, `No rules to run!`·`Rules not loaded yet`는 없음 [S18] [S19] [S20] |
| 9 | 토큰 확인이 건너뛰어짐: `CI disabled, not checking API token`이 있고 `Found API token`·`Settings file found`·`using auto`·`trying to download from`은 없음. 토큰이 없을 때의 정상 줄은 `No API token found in environment variables`·`No settings file found, using default settings` [S26] [S70] [S71] [S72] [S73] [S30] |
| 10 | 엔진·작업 영역 스캔·진단 신호가 하나도 없음, 서버 요청은 허용 목록뿐, `[ERROR]` 줄 없음 |
| 11 | 파일 변화: 작업 영역 0→0, 규칙 폴더는 프로브 1개이고 sha256 불변, 홈은 `.semgrep/cache/fingerprinted_ignored_findings/`만 [H09], 설치물 해시 불변 |
| 12 | 루프백 수신 0, 귀속된 5157 0, 수집이 확실함(LSP-MIN-1의 `OS_BLOCK_*` 정책 그대로, 확실하지 않으면 성립하지 않음) |
| 13 | `shutdown`·`exit` 송신, 스스로 종료, 종료 코드 0, 강제 종료 없음 |

**그 밖의 결과**

| 판정 | 뜻 |
| --- | --- |
| `LOAD_FAILED:<사유>` | 부정적 증거가 관측됨(4.4절: `NO_RULES_TO_RUN`, `LOCAL_CONFIG_ERRORS`, `RULES_REFRESH_INCOMPLETE`, `SERVER_ERROR_LOGGED` 등) |
| `NOT_CONFIRMED:<사유>` | 성공도 실패도 말할 수 없음. 필요한 줄이 없거나 머리말 형태를 읽을 수 없음. **성공으로 쓰지 않는다** |
| `ABORTED:<A조건>` | 실시간 감시가 중단시킴 |
| `NOT_OBSERVED:<사유>` | 실행기 수준 실패(시간 초과, 강제 종료, 스트림 읽기 실패 등, LSP-MIN-1과 같은 규칙) |
| `NOT_ATTEMPTED:<사유>` | 사전 조건 실패로 서버를 띄우지 않음 |

**실시간 중단 조건** (감시 표본 간격은 LSP-MIN-1과 같은 40 ms)

| 조건 | 내용 |
| --- | --- |
| A1′ | 엔진·작업 영역·단일 파일 스캔 신호(6.3절 표), stdout `publishDiagnostics`. `initialized` 송신 **전**의 새로고침·스캔 줄 |
| A2′ | 6.4절 9번의 금지 줄, 레지스트리·내려받기·토큰 신호 |
| A3 | 루프백 수신기 적중·읽기 불가 (기존) |
| A4 | 허용 밖 이미지 (기존) |
| A5′ | 감시 폴더의 금지 변경(작업 영역 비어 있어야 함, 규칙 폴더 프로브 1개 해시 불변, 홈은 허용 위치만) |
| A6 | 허용 밖 서버 요청, 또는 서버 요청 3건 이상 |
| A7 | 감독 마감 (기존) |
| A9 | 장벽 한도 초과 |

실패·중단·시간 초과가 나와도 코드 수정, 한도 확대, 환경 보완, 재시도는 하지 않는다(LSP-MIN-1과 같은 원칙).

예상 stderr(소스에서 도출한 **예측**이며 판정이 순서에 기대는 것은 맨줄 4개뿐이다. `Info` 줄은 스레드 때문에 섞일 수 있어 줄 수와 짝으로만 본다):

```text
Refreshing rules
[..][INFO]: Checking for API token in environment variables      (여러 번 나올 수 있음)
[..][INFO]: No API token found in environment variables
[..][INFO]: No settings file found, using default settings
[..][INFO]: loading local config from <규칙 폴더>\lsp-rules-1-probe.yaml
[..][INFO]: Done loading local config from <규칙 폴더>\lsp-rules-1-probe.yaml
[..][INFO]: Got 0 errors while refreshing rules in language server
Rules refreshed
Scanning open documents
[..][WARNING]: No targets to scan! Not scanning anything.
Scanned open documents
```

## 7. 필요한 변경, 시험, 재사용 범위, 승인 범위

### 7.1 다음 구현 PR에서 필요한 변경 (이번에는 하지 않았다)

| # | 변경 | 비고 |
| --- | --- | --- |
| C1 | 로그 판독기에 머리말을 벗기는 형식 추가 (`[초][수준](태그)(소스): ` 형태, 태그·소스는 선택), 여러 줄 메시지 복원, 새 키(`noTargets`, `noRules`, `rulesNotLoaded`, 토큰·설정 줄) | 인식 표는 전체 일치로만 |
| C2 | 새 실행기: `initialized` 송신, 장벽 대기, 짧은 대기, 서버 요청 허용 목록 | 기존 `lsp-min`과 섞지 않고 단계 구분을 둔다 |
| C3 | 새 순수 판정 모듈 (6.4절) | 옛 `evaluate.ts`에 이어지지 않는다 |
| C4 | PS 러너와 계약 이식본에 같은 송신·대기 | TS와 PS의 대조 시험 유지 |
| C5 | 관리자 진입점: 프로브 규칙 복사·해시 대조, 규칙 폴더 감시 변경, 문맥 스키마에 규칙 파일 해시 추가 | 기존 진입점의 확장 또는 별도 진입점 |
| C6 | `settings.ts`: 네트워크 출처 목록을 소스와 맞추고 드라이브 문자로 시작하는 절대 경로를 요구 | 4.2절의 빈틈 |
| C7 | 프로브 규칙 파일을 저장소에 추가 | 6.2절의 해시와 같아야 함 |
| C8 | (선택) 기준 저장·직접 확인·비교 스크립트를 저장소에 포함 | 지금은 세션 임시 폴더에만 있고 LSP-MIN-1에서도 커밋하지 않았다 |

### 7.2 필요한 시험 (구현 PR의 몫)

- 스텁 서버 시나리오: 정상, 규칙 0개, 폴더 없음(예외), YAML 오류, 무효 규칙, 알림만 있고 줄이 없음, 머리말 변형(`INFO`·`WARNING`·`ERROR`, 태그 있음·없음, 알 수 없는 머리말), 여러 줄 메시지, 엔진 줄 누출, 다운로드·레지스트리 줄, `publishDiagnostics`, 작업 영역 스캔 줄, 설정 파일 쓰기, 허용 밖 서버 요청, 서버 요청 3건 이상, 알림 2회, 장벽 시간 초과, `initialize` 오류 뒤 `initialized` 미송신.
- 판정 모듈의 표 기반 시험(6.4절의 모든 행), TS와 PS의 같은 입력 대조, 정적 구조 점검(새 파일의 역할별 규칙, 허용 명령), 실제 Windows에서 정션·링크 우회 시험의 재사용.
- 수정 전 코드에 새 시험을 돌려 실패가 재현되는지, 변이 점검. (이번 작업에서는 하지 않았다.)

### 7.3 기존 격리·정리·복구 절차의 재사용 범위

| 절차 | 재사용 |
| --- | --- |
| 사전 점검, 적용(`-GrantReadExecute` 두 경로), 복구(`-RemoveProfile`), 감사 창, 루프백 수신기, 감독 루프, 신원·결합 확인, TS 재해석과 작업 개체 정리, 기준 저장·비교 방식 | **그대로** (격리 스크립트 3종은 바꾸지 않는다) |
| 진입점, 러너, 계약 이식본, 판정, 문맥 스키마, 규칙 폴더 감시 | **변경 필요** (7.1절) |

### 7.4 실제 실행 전에 소유자가 승인해야 하는 정확한 범위

**(가) LSP-MIN-1과 같은 범위의 재승인(새 RunId):** 전용 비관리자 계정과 계정 범위 아웃바운드 차단(루프백 제외), 가상환경 루트·기반 Python 폴더의 임시 읽기·실행 ACE 두 건, 감사 정책의 임시 변경과 복구, 전용 프로필·작업 폴더, 서명되지 않은 `semgrep.exe`(자손 `semgrep-core`·`python` 포함)를 `["lsp","--debug"]`로 **한 번** 실행.

**(나) 새로 허용해야 하는 동작**

| # | 동작 |
| --- | --- |
| N1 | `initialized` 알림을 **정확히 1회** 보낸다(`initialize` 응답이 `VALID`일 때만) |
| N2 | 서버가 `initialized`에 반응해 스스로 시작하는 동작: 규칙 새로고침, **열린 문서 스캔 절차(대상 0개)**, 서버→클라이언트 진행 요청·알림(응답하지 않는다) |
| N3 | `semgrep-core`가 해시 고정된 로컬 규칙 파일 1개를 **읽고 구문 분석**한다(읽기 전용) |
| N4 | 장벽 뒤 2초의 짧은 대기 후 `shutdown`·`exit` |
| N5 | 위 동작을 위한 코드 변경 PR의 검토와 병합 (별도 승인) |
| N6 | (선택, 기본 불채택) 환경 변수 `SEMGREP_LOG_SRCS=semgrep.parsing` 추가 |

**(다) 계속 막혀 있는 것:** 문서 열기·저장 같은 문서 알림, 작업 영역에 파일 두기, `semgrep/scanWorkspace`·`semgrep/refreshRules`, `auto`·`p/`·`r/`·`s/`·`policy`·`hooks`·`http(s)://` 설정, 토큰·로그인·메트릭 활성, 규칙 다운로드(GitHub 포함), 대상 스캔, 음성 대조, 같은 관측의 재실행, 서버 요청에 대한 응답, `pin.json`·`verified`·`policy_accepted`·ADR 상태 변경, 병합·배포.

**(라) 실행 전에 갖춰져야 하는 조건 (지금은 모두 미충족):** 7.1절의 C1~C7 구현과 시험 통과, 프로브 규칙 파일의 저장소 반영, 소유자 결정 D1~D3, 네트워크 출처 검사의 보완.

## 8. 한계

1. 이 문서의 계약은 모두 공개 소스의 읽기에서 도출한 것이다. `initialized` 이후의 바이너리 동작은 한 번도 관측하지 않았다.
2. `INFO`·`WARNING` 머리말, 두 경고 줄의 실제 문구, 맨줄 4개의 실제 출력은 이 바이너리에서 미관측이다. 문구가 다르면 판정은 `NOT_CONFIRMED`로 끝난다(성공이 되지 않는다).
3. 프로브 규칙의 유효성은 실행으로만 확인된다. 로딩된 규칙의 개수와 의미(탐지)는 이 계획으로 관측되지 않는다.
4. 엔진이 프로세스 안에서 돌기 때문에 엔진 실행은 프로세스 트리로는 보이지 않고 로그 줄에 의존한다. 그 줄이 안 찍히는 엔진 실행은 놓칠 수 있다(표본 사이에 끝난 프로세스처럼 부재의 증명이 아니다).
5. 동시성 때문에 `Info` 줄의 순서가 바뀔 수 있다. 판정은 맨줄 4개의 순서와 `Info` 줄의 수·짝에만 기댄다.
6. 정리 후 상태 비교는 같은 방식으로 하되, 그 스크립트는 저장소에 없다(C8).
7. Windows 11 한 대, 전용 비관리자 계정 한 개만 다룬다.

## 9. 소유자 결정이 필요한 것

| # | 결정 |
| --- | --- |
| D1 | LSP-RULES-1의 구현 PR(7.1절)을 진행할지 |
| D2 | 소스↔바이너리 대응이 미확인인 채로 `initialized`를 보내는 실행을 허용할지 |
| D3 | `INFO`·`WARNING` 머리말이 미관측인 채로 판정을 fail-closed(`NOT_CONFIRMED`)로 두는 것으로 충분한지 |
| D4 | 프로브 규칙을 새로 쓴 파일 1개로 할지, 고정 `semgrep-rules` 일부(내려받기 승인 필요)로 할지 |
| D5 | `SEMGREP_LOG_SRCS=semgrep.parsing` 추가 여부 |
| D6 | 장벽 뒤 대기 2초와 장벽 한도 60초의 값 |
| D7 | 기준 저장·비교 스크립트를 저장소에 포함할지 |
| D8 | 이 작업이 관측한 머리말 사실을 `pin.json`의 `log_format`에 언제 반영할지(이번에는 건드리지 않았다) |

## 10. 이번 작업이 하지 않은 것

Semgrep의 실행·임포트(`--help`·`--version` 포함), 계정·방화벽·감사·ACL 적용, 규칙 다운로드, 대상 스캔, 음성 대조, LSP-MIN-1 재실행, 10-28 시간 초과 원인 추적, 병합·배포, 운영 코드·시험·계약 변경, `pin.json`·`verified`·`policy_accepted`·ADR 상태 변경, 기존 PR·`main`·보담 저장소 변경. 전체 시험과 변이 점검도 반복하지 않았다.

## 11. 부록: 인용 목록과 확인

- 고정 공개 커밋: `a35fe8306115b3e55274969098cc46f8451d6b4d`. 받은 파일 85개의 blob 해시를 모두 `git` 방식으로 다시 계산해 트리 응답의 값과 비교했다(불일치 0). 소스 파일은 저장소 밖 임시 폴더에 두었고 실행하지 않았다.
- 하니스 인용은 PR #39 HEAD(`eaf9320`) 기준이다.
- 아래 94건은 줄 번호를 사람이 옮겨 적은 것이 아니라 정규식으로 자동 탐색해 확정했다(탐색 실패·모호 0건). 본문의 `[S..]`·`[H..]`는 이 표의 ID다.

| ID | 구분 | 위치 | 내용 |
| --- | --- | --- | --- |
| S01 | 공개 소스 | `src/lsp_legacy/notifications/Legacy_notification_handler.ml:61` | `initialized` 처리의 시작 |
| S02 | 공개 소스 | `src/lsp_legacy/notifications/Legacy_notification_handler.ml:58` | 서버가 초기화되기 전에는 알림을 처리하지 않는다 |
| S03 | 공개 소스 | `src/lsp_legacy/notifications/Legacy_notification_handler.ml:75` | 토큰 확인과 규칙 새로고침을 함께 시작 |
| S04 | 공개 소스 | `src/lsp_legacy/notifications/Legacy_notification_handler.ml:77` | 로컬 무시 목록 읽기(파일 읽기만) |
| S05 | 공개 소스 | `src/lsp_legacy/notifications/Legacy_notification_handler.ml:95` | 문서 열기: 단일 파일 스캔을 시작하는 트리거 |
| S06 | 공개 소스 | `src/lsp_legacy/notifications/Legacy_notification_handler.ml:105` | 작업 영역 폴더 변경: 작업 영역 스캔을 시작하는 트리거 |
| S07 | 공개 소스 | `src/lsp_legacy/notifications/Legacy_notification_handler.ml:172` | 사용자 정의 알림: 작업 영역 전체 스캔 트리거 |
| S08 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:320` | 규칙 새로고침 정의 |
| S09 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:324` | 맨줄(App) `Refreshing rules` |
| S10 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:325` | 규칙을 읽어 세션에 캐시 |
| S11 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:329` | stdout 알림 `semgrep/rulesRefreshed` |
| S12 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:331` | 맨줄(App) `Rules refreshed` |
| S13 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:335` | 새로고침 뒤 **항상** 열린 문서 스캔을 호출 |
| S14 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:262` | 열린 문서 스캔 정의 |
| S15 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:263` | 맨줄(App) `Scanning open documents` |
| S16 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:278` | 맨줄(App) `Scanned open documents`(장벽 후보) |
| S17 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:275` | 대상은 열린 문서뿐이다 |
| S18 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:61` | 맨줄(App): 규칙이 아직 로딩되지 않음 |
| S19 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:64` | 경고(Warning): 규칙 0개 |
| S20 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:67` | 경고(Warning): 규칙은 있으나 대상 0개 |
| S21 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:144` | 디버그: 엔진 실행 경로에서만 나온다 |
| S22 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:180` | 맨줄(App): 엔진 실행 경로에서만 |
| S23 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:183` | 맨줄(App): 엔진 실행 경로에서만 |
| S24 | 공개 소스 | `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml:185` | 메트릭 전송: 엔진 실행 경로에서만 호출 |
| S25 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:196` | 토큰 확인 정의 |
| S26 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:198` | 디버그: `ci`·`pro_intrafile`이 모두 false면 확인하지 않는다 |
| S27 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:206` | 토큰이 있고 `ci`/`pro_intrafile`이 켜지면 네트워크로 검증 |
| S28 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:189` | 토큰 출처: 환경 변수 → 설정 파일 |
| S29 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:333` | 규칙 가져오기 정의 |
| S30 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:351` | 설정 목록이 비면 `auto`(레지스트리)로 간다 |
| S31 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:375` | 정보(Info): 규칙 읽기 오류 수 |
| S32 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:481` | 무효 규칙 목록을 버린다 |
| S33 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:489` | 규칙 로딩 성공 여부와 무관하게 `initialized`를 켠다 |
| S34 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:406` | 토큰이 있을 때만 앱에서 가져온다 |
| S35 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:466` | 토큰이 있을 때만 앱에서 가져온다 |
| S36 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:434` | `shutdown`이 파일을 쓰는 곳 |
| S37 | 공개 소스 | `src/lsp_legacy/server/Legacy_session.ml:143` | 메트릭 전송 정의 |
| S38 | 공개 소스 | `src/lsp_legacy/server/Legacy_user_settings.ml:28` | `configuration` 기본값 빈 목록 |
| S39 | 공개 소스 | `src/lsp_legacy/server/Legacy_user_settings.ml:37` | `onlyGitDirty` 기본값 true |
| S40 | 공개 소스 | `src/lsp_legacy/server/Legacy_user_settings.ml:38` | `ci` 기본값 **true** |
| S41 | 공개 소스 | `src/lsp_legacy/server/Legacy_rpc_server.ml:185` | 클라이언트 응답은 `Unhandled message`로 처리된다 |
| S42 | 공개 소스 | `src/lsp_legacy/server/Legacy_rpc_server.ml:245` | 그 메시지를 오류(Error) 수준으로 남긴다 |
| S43 | 공개 소스 | `src/lsp_legacy/server/Legacy_rpc_server.ml:181` | 서버는 응답이 중요한 요청을 클라이언트에 보내지 않는다고 적어 둔다 |
| S44 | 공개 소스 | `src/lsp_legacy/server/Legacy_lsp_.ml:122` | 진행 표시 만들기 |
| S45 | 공개 소스 | `src/lsp_legacy/server/Legacy_lsp_.ml:130` | 서버→클라이언트 **요청** `window/workDoneProgress/create` |
| S46 | 공개 소스 | `src/lsp_legacy/server/Legacy_lsp_.ml:136` | `$/progress` 시작 알림 |
| S47 | 공개 소스 | `src/lsp_legacy/requests/Legacy_request_handler.ml:71` | 요청 로그가 상수 id `Int 0`으로 다시 만든다 |
| S48 | 공개 소스 | `src/lsp_legacy/requests/Legacy_request_handler.ml:146` | `shutdown` 처리 |
| S49 | 공개 소스 | `src/lsp_legacy/requests/Legacy_request_handler.ml:147` | 맨줄(App) `Shutting down server` |
| S50 | 공개 소스 | `src/lsp_legacy/requests/Legacy_request_handler.ml:148` | 무시 목록 파일을 쓴다 |
| S51 | 공개 소스 | `src/lsp_legacy/requests/Legacy_request_handler.ml:149` | 응답이 비어 있다(응답 프레임 없음) |
| S52 | 공개 소스 | `src/osemgrep/core/Rules_config.ml:70` | 설정 문자열 해석 |
| S53 | 공개 소스 | `src/osemgrep/core/Rules_config.ml:72` | `auto` → 레지스트리 |
| S54 | 공개 소스 | `src/osemgrep/core/Rules_config.ml:73` | `r2c` → 레지스트리 |
| S55 | 공개 소스 | `src/osemgrep/core/Rules_config.ml:74` | `policy` → 앱 설정 |
| S56 | 공개 소스 | `src/osemgrep/core/Rules_config.ml:76` | `hooks` → 앱 설정 |
| S57 | 공개 소스 | `src/osemgrep/core/Rules_config.ml:81` | `http(s)://` → 내려받기 |
| S58 | 공개 소스 | `src/osemgrep/core/Rules_config.ml:83` | 존재하는 폴더 → 로컬 폴더 |
| S59 | 공개 소스 | `src/osemgrep/core/Rules_config.ml:106` | 없는 경로는 예외다(레지스트리로 넘어가지 않는다) |
| S60 | 공개 소스 | `src/osemgrep/networking/Rule_fetching.ml:367` | 정보(Info): 파일별 로딩 시작 |
| S61 | 공개 소스 | `src/osemgrep/networking/Rule_fetching.ml:371` | 정보(Info): 파일별 로딩 완료 |
| S62 | 공개 소스 | `src/osemgrep/networking/Rule_fetching.ml:560` | 폴더 설정 처리(비동기 판, LSP가 쓰는 쪽) |
| S63 | 공개 소스 | `src/osemgrep/networking/Rule_fetching.ml:568` | 폴더 안에서 읽을 파일을 거른다 |
| S64 | 공개 소스 | `src/parsing/Rule_file.ml:23` | `.test.yaml` 계열 제외 |
| S65 | 공개 소스 | `src/parsing/Rule_file.ml:32` | YAML 설정 파일만 규칙 파일로 읽는다 |
| S66 | 공개 소스 | `src/parsing/Parse_rule.ml:1245` | 무효 규칙 건너뛰기 경고(라이브러리 로그 소스) |
| S67 | 공개 소스 | `libs/commons/Logs_.ml:184` | App 수준: 머리말 없음 |
| S68 | 공개 소스 | `libs/commons/Logs_.ml:192` | Error/Warning/Info: 태그 없는 머리말 |
| S69 | 공개 소스 | `libs/commons/Logs_.ml:178` | 머리말 형식 `[초][수준](태그)(소스)` |
| S70 | 공개 소스 | `src/osemgrep/configuring/Semgrep_settings.ml:110` | 정보(Info): 환경 변수에 토큰 없음 |
| S71 | 공개 소스 | `src/osemgrep/configuring/Semgrep_settings.ml:101` | 정보(Info): 환경 변수에 토큰 있음 |
| S72 | 공개 소스 | `src/osemgrep/configuring/Semgrep_settings.ml:196` | 정보(Info): 설정 파일 없음 |
| S73 | 공개 소스 | `src/osemgrep/configuring/Semgrep_settings.ml:207` | 정보(Info): 설정 파일 있음 |
| S74 | 공개 소스 | `src/osemgrep/cli_lsp/Lsp_subcommand.ml:50` | 기본 경로는 legacy 서버 |
| S75 | 공개 소스 | `src/lsp_legacy/requests/Legacy_initialize_request.ml:52` | 초기화 옵션의 `scan` 객체를 설정으로 읽는다 |
| S76 | 공개 소스 | `src/lsp_legacy/requests/Legacy_initialize_request.ml:53` | 읽기에 실패하면 **세션 기본 설정**으로 되돌아간다(기본값은 [S38]~[S40]) |
| H01 | 하니스 | `scripts/semgrep-lsp/log-matcher.ts:21` | 기본 로그 형식: 접두어 없음 가정 |
| H02 | 하니스 | `scripts/semgrep-lsp/log-matcher.ts:25` | 인식하는 줄의 표(경고 두 줄·토큰·설정 줄 없음) |
| H03 | 하니스 | `scripts/semgrep-lsp/settings.ts:57` | 네트워크 출처 거절 정규식 |
| H04 | 하니스 | `scripts/semgrep-lsp/settings.ts:69` | 빈 설정 목록 거절 |
| H05 | 하니스 | `scripts/semgrep-lsp/lsp-min.ts:53` | 송신 순서: initialize, shutdown, exit |
| H06 | 하니스 | `scripts/semgrep-lsp/lsp-min.ts:120` | A1: 정상 신호가 될 줄을 중단 문구로 둠 |
| H07 | 하니스 | `scripts/semgrep-lsp/lsp-min.ts:130` | A2: `download`, `registry` 부분 문자열 |
| H08 | 하니스 | `scripts/semgrep-lsp/lsp-min.ts:132` | A8: `rulesRefreshed`를 중단 사유로 둠 |
| H09 | 하니스 | `scripts/semgrep-lsp/lsp-min.ts:172` | 홈에서 허용되는 쓰기 위치 |
| H10 | 하니스 | `scripts/semgrep-lsp/lsp-min.ts:186` | WORKSPACE·RULES_DIR는 비어 있어야 한다 |
| H11 | 하니스 | `scripts/semgrep-lsp/lsp-min.ts:653` | 머리말을 세기만 한다(본문은 꺼내지 않는다) |
| H12 | 하니스 | `scripts/semgrep-lsp/lsp-min.ts:1063` | 서버 요청 1건 이상을 이상(anomaly)으로 분류 |
| H13 | 하니스 | `scripts/semgrep-lsp/session.ts:561` | 옛 하니스의 PH2 장벽 |
| H14 | 하니스 | `scripts/semgrep-lsp/evaluate.ts:694` | 옛 평가기: 알림 1회 이상이면 `rulesOk` |
| H15 | 하니스 | `scripts/semgrep-lsp/evaluate.ts:695` | 옛 평가기의 로딩 실패 사유는 알림 부재뿐 |
| H16 | 하니스 | `scripts/semgrep-lsp/data/pin.json:37` | 핀 파일의 로그 형식은 미확인 상태 |
| H18 | 하니스 | `scripts/semgrep-lsp/settings.ts:3` | 하니스 머리 주석: 알 수 없는 키 → 기본값(설계 시점의 소스 도출) |
| H17 | 하니스 | `scripts/semgrep-lsp-isolation/windows/Test-LspMinObservation.ps1:188` | L08은 이 순서로 세 파일의 ACE를 센다 |

### 11.1 LSP-MIN-1 증거(저장소 밖, 이번에 읽기만 함)

| 파일 | sha256 |
| --- | --- |
| `lsp-min-stderr-20261029T060738Z.bin` (6,244 B) | `0992b0b1768c1d6d69bbd673df5f18b4cf7756d510480c7df320714feb7b8566` |
| `lsp-min-stdout-20261029T060738Z.bin` (642 B) | `2ae56c933e7324ceb193f762043be54ec3f221ecd2620cd8cce7918457fbb330` |
| `lsp-min-observation-20261029T060738Z.json` | `9dd90032e3d2e7b9c65e752c1d3f144a66d1864e30422f54c0650ead97d2e7ae` |
| `verify-applied-20261029T060257Z-5386c62f.json` | `7cc7ac2472480fb0790007cd0cd2020a47a87809b738c06a203f52d14f45b3c4` |
