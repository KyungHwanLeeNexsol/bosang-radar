# 실제 LSP 최소 기동 관측: 계약의 정적 확인과 실행 계획

- 작성일: 2026-10-28
- 기준: PR #36 브랜치 `security/semgrep-lsp-win-isolation`의 HEAD `024505d7decbc569d403c04a1394e45bdea9502e`. 그 위에 별도 브랜치 `security/semgrep-lsp-min-start-plan`을 만들어 이 보고서 한 파일만 더했다.
- 성격: **문서만 다룬다.** 실제 Semgrep은 실행하지도 임포트하지도 않았다(`--help` 포함). 규칙 다운로드, 스캔, 음성 대조, 계정·방화벽·감사·ACL 변경도 하지 않았다. `pin.json`, `verified`, `policy_accepted`, ADR 상태는 그대로다.
- 구분 표기: **사실** = 읽은 파일의 내용, **도출** = 사실을 이어 붙인 판단, **실행 필요** = 실제로 띄워 봐야만 확인되는 것.
- 소유자 결정(이번 작업의 전제): (1) 버전 관측 자식의 `SEMGREP_ENABLE_VERSION_CHECK=0`은 유지한다. (2) 조회를 켠 대조 실행과 10-28 시간 초과의 원인 규명 실험은 하지 않는다. (3) 이 값을 LSP 자식 환경에 자동으로 더하지 않는다. (4) 관측된 `semgrep-core`·`pysemgrep`·Python 자손 체인은 다음 실행의 관측과 정리 범위에 넣는다.

## 1. 결론

| 질문 | 답 | 구분 |
| --- | --- | --- |
| `lsp --debug`는 서버를 여는 유효한 인자 조합인가 | 그렇다. `lsp`는 `Lsp_subcommand.main`이 직접 처리하고(`CLI.ml:189`) `--debug`는 공통 옵션이다(`CLI_common.ml:84-88`). | 사실 |
| initialize 응답까지만 처리하면 규칙 로딩, 자동 스캔, 기본 규칙 다운로드, 버전 확인, 메트릭 요청이 시작되는가 | 고정 공개 소스에서는 시작하지 않는다. initialize는 설정 해석, 스레드 풀 준비, 작업 영역 폴더의 파일 열거까지만 한다. 다만 실제 바이너리가 이 소스와 같다는 보장이 없어서 **실행 전에는 배제하지 못한다.** | 도출, 실행 필요 |
| `initialized`를 보내지 않으면 | 규칙 새로고침, 토큰 확인, 열린 문서 스캔, 지문 파일 읽기가 전부 이 알림에서 시작되므로 시작되지 않는다. 서버 상태는 initialize 안에서 이미 `Running`이 되어 `shutdown`과 `exit`을 받는다. | 사실, 도출 |
| 새로 드러난 부작용 | `shutdown` 요청이 **응답 없이 파일을 쓴다.** 경로는 `<홈>/.semgrep/cache/fingerprinted_ignored_findings/<작업 영역 폴더 이름>.txt`다(`Legacy_session.ml:434-448`). | 사실 |
| 기존 하네스로 이 관측이 되는가 | 되지 않는다. `runSession`은 initialize가 성공하면 항상 `initialized`를 보내고(`session.ts:553-566`), 평가기는 그 부재를 `INITIALIZED_NOT_SENT`(`INIT_FAILED`)로 본다(`evaluate.ts:679`). 새 실행기가 필요하다. | 사실 |
| "시작, initialize 응답, shutdown·exit, 정리"만 관측하는 계획이 가능한가 | 가능하다. 5절에 하나를 적었다. 이번 작업에서는 구현하지 않았다. | 도출 |
| 사전에 필요한 소유자 결정 | 7절. 핵심은 "바이너리와 공개 소스의 대응이 확정되지 않은 채로 initialize 경로의 안전을 소스로만 믿고 한 번 띄울 것인가"다. | 결정 대기 |

## 2. 방법과 한계

- **공개 소스**: `semgrep/semgrep`의 커밋 `a35fe8306115b3e55274969098cc46f8451d6b4d`(태그 `v1.180.0`, `pin.json`의 커밋과 같다)에서 96개 파일(OCaml 69개 포함)을 텍스트로 받았다. 받은 파일마다 `git hash-object`로 구한 blob 해시를 그 커밋 트리의 해시와 대조했고 **모두 일치했다.** 받은 파일은 읽기만 했다.
- **설치된 배포물**: 격리 설치 폴더의 `semgrep/` 아래 `.py` 파일만 텍스트로 읽었다. 읽은 파일 중 7개(`console_scripts/entrypoint.py`, `console_scripts/pysemgrep.py`, `main.py`, `env.py`, `commands/scan.py`, `__init__.py`, `app/version.py`)는 고정 커밋의 `cli/src/semgrep/` 같은 경로 파일과 blob 해시가 같았다. **이것은 그 7개 파일의 일치일 뿐이다.** 246MB의 `semgrep-core.exe`가 이 소스에서 빌드되었다는 증거가 아니며, 전체 휠의 소스 대응도 확정하지 않는다.
- **알려진 대응 공백**: PR #35 보고서가 적은 대로 휠 증명서의 소스 커밋은 비공개 저장소의 `semgrep-proprietary@037fc1d`다. 이 세션에서 다시 확인하지 않았고, 공개 소스 커밋 `a35fe83`과의 대응은 여전히 미확인이다.
- **검색의 범위**: "이 이름의 소비자를 찾지 못했다"는 말은 **받은 96개 파일 안에서**라는 뜻이다. 저장소 전체를 grep한 것이 아니다. GitHub 코드 검색은 기본 브랜치 기준이라 위치를 찾는 단서로만 썼고 근거로 쓰지 않았다.
- **외부 라이브러리**: 로그 머리말의 정확한 바이트는 `Logs_fmt`(외부 라이브러리) 소관이라 이 저장소 소스로는 확정할 수 없다.
- 줄 번호 표기: `Session`은 `src/lsp_legacy/server/Legacy_session.ml`, `Notification_handler`는 `src/lsp_legacy/notifications/Legacy_notification_handler.ml`, `Request_handler`는 `src/lsp_legacy/requests/Legacy_request_handler.ml`, `Rpc_server`는 `src/lsp_legacy/server/Legacy_rpc_server.ml`, `Scan_helpers`는 `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml`이다. 부록 A에 파일별 blob 해시 앞 12자리를 적었다.

## 3. 질문별 근거표

### 3.1 LSP 실행 인자와 `--debug`

| 항목 | 내용 | 근거 | 구분 |
| --- | --- | --- | --- |
| 하네스가 쓰는 인자 | 정확히 `["lsp", "--debug"]`. 작업 폴더는 `parentOf(rulesCache)`. | `cli.ts:132`, `:870-871`, `:1205` | 사실 |
| Windows 진입 경로 | `semgrep.exe`(pip 실행기) → 가상환경 `python.exe` → `entrypoint.py`의 `main()`. `--legacy`가 없으면 `exec_osemgrep()`로 가서 `semgrep.bin/semgrep-core.exe`를 argv[0] `osemgrep`로 호출한다. | `entrypoint.py:281-305`, `:167-258` | 사실 |
| Windows에서 자식이 되는 방식 | `os.execvp`가 아니라 `subprocess.run(sys.argv, executable=...)`이라 **파이썬 래퍼가 부모로 남고** `semgrep-core`가 자식이 된다. 표준 입출력은 상속한다. | `entrypoint.py:259-273` | 사실 |
| 래퍼가 스스로 하는 일 | PATH 끝에 스크립트 폴더를 덧붙이고, stderr가 터미널이 아니면 `NO_COLOR=1`을, `SEMGREP_NEW_CLI_UX`를 설정한다. 하네스 환경 허용 목록과 별개로 도구가 직접 더하는 값이다. | `entrypoint.py:53-55`, `:175-181`, `:304` | 사실 |
| `lsp` 분기 | `known_subcommands`에 `lsp`가 있고 `Lsp_subcommand.main`으로 간다. `mcp`와 달리 `Pysemgrep.Fallback`을 내는 줄이 `lsp`에는 없다. | `CLI.ml:107-113`, `:189` | 사실 |
| pysemgrep 폴백 | 읽은 범위에서는 일어나지 않는다. | 위 두 줄 | 도출 |
| `--debug`의 정의 | `CLI_common.o_debug`. `Lsp_CLI.cmdline_term`이 `CLI_common.o_common`을 합치므로 `lsp`에서 유효하다. 기본 로그 레벨은 Warning이고 `--debug`는 Debug다. `--quiet`·`--verbose`·`--debug` 중복 지정은 오류다. | `CLI_common.ml:84-88`, `:130-140`, `Lsp_CLI.ml:41-43` | 사실 |
| `--debug`의 두 번째 효과 | argv에 `--debug`가 있으면 `safe_run`이 예외를 잡지 않는다. 로그 레벨만 바꾸는 플래그가 아니다. | `CLI.ml:254`, `:214-216` | 사실 |
| Debug 줄이 실제로 나오는가 | 태그 기본값이 `default`이고 `Logs.debug` 기본 태그도 `default`라서 `--debug`만으로 나온다. 레벨은 환경변수 `SEMGREP_LOG_LEVEL`로 덮어쓸 수 있으나 하네스 환경에는 없다. | `Logs_.ml:98`, `:341`, `Log_semgrep.ml:91-92` | 사실 |
| 쓰지 않을 인자 | `--x-eio-ls`는 독점 바이너리의 훅이 있을 때만 쓰이는 실험 서버다(없으면 오류 종료). `--legacy`, `--experimental`, `--pro*`도 쓰지 않는다. | `Lsp_subcommand.ml:38-48`, `entrypoint.py:59`, `:293-297` | 사실 |

### 3.2 단계별 외부 효과 (규칙 로딩, 스캔, 다운로드, 버전 확인, 메트릭)

| 단계 | 소스에서 일어나는 일 | 규칙 로딩·스캔 | 네트워크 | 파일·프로세스 | 구분 |
| --- | --- | --- | --- | --- | --- |
| 래퍼 시작 | 위 3.1의 환경 보정, 코어 경로 탐색, 자식 실행 | 없음 | 이 파일에는 없음. 파이썬의 버전 확인(`app/version.py`)은 `commands/scan.py`·`ci.py`가 부르며 `lsp` 경로는 이를 거치지 않는다. | 자식 `semgrep-core` 1개 | 사실, 도출 |
| `CLI.main` | 프록시 환경변수 검사, HTTP 클라이언트 지정, `metrics_init`(설정 파일을 **읽기만** 한다. 없으면 메모리의 기본값. 익명 ID는 메모리에서 생성), 디스패치 | 없음 | 요청 없음 | 파일 쓰기 없음 | 사실 |
| `lsp` 시작 | 로그 설정, "Starting legacy language server"(App), `set_engine`(`Sys.unix`면 libev, 아니면 select), 서버 생성, 읽기 루프. 상태는 `Uninitialized`. | 없음 | 없음 | 없음 | 사실 |
| `initialize` | 설정 해석, 작업 영역 폴더 결정, 스레드 풀 준비(같은 프로세스 안의 스레드), 메트릭 클라이언트 설정 **해석**(전송 아님), `cache_workspace_targets`, 상태 `Running`, 응답 `InitializeResult`(`serverInfo.version` 포함). | **없음**(규칙 로딩은 이 안에 없다) | 없음 | 폴더 열거(읽기). 프로젝트 루트가 `Filesystem` 강제라 `Gitignore_project`가 되고, git 호출은 `Git_project`일 때만이라 서브프로세스 없음. | 사실, 도출 |
| `initialized` | `check_token`과 `refresh_rules`를 함께 시작하고 `load_local_skipped_fingerprints`로 지문 파일을 읽는다. `refresh_rules`는 규칙 가져오기 후 열린 문서 스캔까지 이어진다. | **있음** | `ci`/`pro_intrafile`이 켜졌고 토큰이 있으면 토큰 확인. `configuration`이 비면 `auto`(레지스트리)로 간다. 토큰이 있으면 앱 호출 둘이 더 있다. 로컬 경로면 다운로드 없음. | 지문 파일 읽기 | 사실 |
| `shutdown` | 응답 없음. 로그 "Shutting down server". `save_local_skipped_fingerprints`. | 없음 | 없음 | **디렉터리 생성과 파일 쓰기** | 사실 |
| `exit` | 상태 `Stopped` → 루프 종료("Server stopped") → 종료 코드 `Exit_code.ok` → `Metrics_.add_exit_code`, `send_metrics`, `before_exit`. | 없음 | `send_metrics`는 `Metrics_.is_enabled`가 거짓이면 건너뛴다. 기본 설정은 `Off`이고 `lsp` 경로에서 `Metrics_.configure`를 부르는 곳이 없다. | 임시 파일 삭제 | 사실, 도출 |
| stdin 닫힘 | 루프가 "Client disconnected"로 끝난다. 서버가 `Uninitialized`여도 끝난다. | 없음 | 없음 | 없음 | 사실 |

근거 줄:

- `Request_handler:74-97`(Initialize), `Legacy_initialize_request.ml:29-112`(본문), `:105-107`(`Caching workspace targets`), `:118-130`(`serverInfo`).
- `Notification_handler:61-79`(`Initialized`), `Scan_helpers:320-333`(`refresh_rules`), `Session:196-230`(`check_token`), `:333-404`(`fetch_rules`), `:349-353`(`auto`), `:480-490`(`cache_session`), `:450-464`(지문 읽기).
- `Request_handler:146-149`, `Session:434-448`(shutdown), `Notification_handler:148-150`(exit), `Rpc_server:214-216`, `:251-253`.
- `CLI.ml:315`, `:324`(`metrics_init`, `send_metrics`), `Metrics_.ml:277`(기본 `Off`), `:306-311`, `Lsp_subcommand.ml:34-51`.
- `Find_targets.ml:622`, `:663`(`Git_project`일 때만 git, 그 밖은 `None`), `:740`(`Filesystem` 강제 → `Gitignore_project`), `Session:128-141`, `:287-294`.
- `Semgrep_settings.ml:185-208`(`load`는 읽기 전용), 쓰기는 `semgrep/logout` 알림(`Notification_handler:153-170`)과 로그인 요청 쪽뿐이다(받은 파일 범위).

### 3.3 기존 최소 환경과 상태 경로를 실제 LSP가 읽는 방식

| 변수·경로 | 하네스 값(Windows) | 실제 소스가 읽는 방식 | 주의 | 구분 |
| --- | --- | --- | --- | --- |
| `USERPROFILE` | 증거 폴더 안 `semgrep-state/home`(미리 만든다) | Windows는 `USERPROFILE`이 **실제 디렉터리일 때만** 쓰고, 아니면 `HOME`, 그것도 없으면 `/`. 그 아래 `.semgrep`이 사용자 점 폴더다. | shutdown 쓰기가 이 홈 아래로 간다. 폴더가 없으면 홈이 `/`로 떨어진다. | 사실 |
| `HOME`(Linux) | 부모 값 복사 | POSIX는 `XDG_CONFIG_HOME`(디렉터리일 때)을 **먼저**, 그다음 `HOME`을 본다. | Linux 계약은 부모의 실제 홈을 쓰므로 shutdown이 실제 `~/.semgrep`에 쓴다. 이번 계획은 Windows만 다룬다. | 사실 |
| `TEMP`, `TMP`, `PATH`, `SYSTEMROOT` | 허용 목록 | OCaml 표준 임시 폴더는 Windows에서 `TEMP`를 본다(소스 주석). 래퍼가 PATH 끝에 스크립트 폴더를 덧붙인다. | | 사실 |
| `SEMGREP_APP_URL` | 수신기 주소 | `SEMGREP_URL`이 있으면 그것이, 없으면 `SEMGREP_APP_URL`이 앱 주소다. | 소비는 토큰·규칙·로그인 경로(`initialized` 이후). | 사실 |
| `SEMGREP_METRICS_URL` | 수신기 주소 | 메트릭 전송 주소(`Semgrep_Metrics.ml:47`, `:92`). | 전송은 메트릭이 켜졌을 때만. `lsp` 종료 경로는 기본 `Off`. | 사실 |
| `SEMGREP_VERSION_CHECK_URL`, `SEMGREP_VERSION_CACHE_PATH` | 수신기 주소, 상태 폴더 안 경로 | `Semgrep_envvars.ml`에 정의만 있고 받은 96개 파일에서 사용처가 없다. 버전 확인 코드는 파이썬 쪽(`app/version.py`, `env.py`)이다. | `lsp`에서는 효과가 없을 가능성이 크다. | 사실, 도출 |
| `SEMGREP_ENABLE_VERSION_CHECK` | LSP 환경에는 **넣지 않음**(결정 3) | OCaml 환경변수 목록에 없다. 파이썬 `commands/scan.py:205`에만 있다. | LSP 환경에 넣어도 OCaml 경로에는 효과가 없다고 읽힌다. 자동으로 더하지 않는 결정과 어긋나지 않는다. | 사실, 도출 |
| `SEMGREP_LOG_FILE` | 상태 폴더 안 `semgrep.log` | `user_log_file`로 정의되지만, `with_logging`의 파일 로깅은 주석 처리된 TOPORT다(`CLI_common.ml:147-158`). 로그는 stderr로 간다(`Logs_.ml:127-130`). | OCaml `lsp`는 이 파일에 쓰지 않는다고 읽힌다. 10-28 관측에서 보인 빈 `semgrep.log`는 파이썬 쪽 동작으로 보인다. 로그 파일을 증거로 기대하면 안 된다. | 사실, 도출 |
| `SEMGREP_SETTINGS_FILE` | 상태 폴더 안 `settings.yml` | `Semgrep_settings.load`가 읽는다. `lsp` 경로에서 쓰기는 로그아웃·로그인 요청뿐이다. | 최소 관측에서는 이 파일이 **생기지 않는** 것이 예상이다. | 사실, 도출 |
| `SEMGREP_FAIL_OPEN_URL` | 넣지 않음 | 정의만 있다(받은 파일 범위). | | 사실 |
| `SEMGREP_LOG_LEVEL`, `SEMGREP_LOG_SRCS`, `SEMGREP_LOG_TAGS` | 넣지 않음 | 있으면 로그 레벨·출처·태그를 덮어쓴다. | 넣지 않아야 `--debug`의 의미가 고정된다. | 사실 |
| 사용자 점 폴더 | 별도 지정 없음 | `<홈>/.semgrep/cache/fingerprinted_ignored_findings`(shutdown 쓰기), `<홈>/.semgrep/cache/fingerprints`(`initialized` 후 읽기). | 환경변수로 따로 옮길 수 없고 홈 규칙에만 의존한다. | 사실 |
| 작업 폴더(cwd) | `parentOf(rulesCache)` | 상대 `configuration` 경로는 `Fpath.normalize` 후 그대로 쓰여 cwd 기준으로 풀린다. | 최소 관측은 규칙을 읽지 않는다. | 사실, 도출 |

### 3.4 shutdown·exit와 자손 프로세스 정리

| 항목 | 내용 | 근거 | 구분 |
| --- | --- | --- | --- |
| shutdown | 응답이 없다. 서버가 `Uninitialized`가 아닐 때만 처리하고, `Uninitialized`면 오류를 기록하고 **응답 없이 무시**한다. | `Request_handler:98-101`, `:146-149` | 사실 |
| exit | 서버가 `Uninitialized`가 아닐 때만 `Stopped`로 만든다. `Uninitialized`에서는 경고만 남기고 **무시**한다. | `Notification_handler:58-60`, `:148-150` | 사실 |
| 루프 종료 | `Stopped`가 되면 다음 반복 첫머리에서 읽기를 기다리지 않고 끝난다. stdin EOF도 끝낸다. | `Rpc_server:212-216`, `:251-253` | 사실 |
| 종료 코드 | `Exit_code.ok`를 돌려주므로 0이 되리라 읽힌다. `Main.ml`은 읽지 않았다. | `Lsp_subcommand.ml:51` | 도출 |
| initialize가 예외로 실패하면 | 상태는 `Uninitialized`로 남아 `exit`이 무시된다. 서버는 stdin이 닫히거나 강제 종료될 때까지 산다. | `Request_handler:74-97`, `Notification_handler:58-60` | 도출 |
| OCaml 쪽 자손 프로세스 | initialize·shutdown·exit 경로에서 서브프로세스를 만드는 코드를 찾지 못했다. git 호출은 스캔 대상 선별(`Session:99-104`, `Legacy_processed_run.ml:48,54`)에 있다. | 해당 줄 | 도출 |
| 래퍼의 종료 | 자식이 끝나길 기다린 뒤 자식의 종료 코드로 끝난다. `KeyboardInterrupt`만 처리한다. 래퍼만 끝내면 코어가 남을 수 있다. | `entrypoint.py:266-273` | 사실, 도출 |
| 하네스의 강제 종료 | win32에서 `taskkill /pid <pid> /T /F`로 트리를 끝낸다. | `process-node.ts:17`, `:196` | 사실 |
| 관측된 체인(`--version`) | `semgrep.exe` → 가상환경 `python.exe` → 기반 `python.exe` → `semgrep-core.exe osemgrep --version` → `pysemgrep.exe --version` → 가상환경 `python.exe` → 기반 `python.exe`. 런너를 뺀 자손 7개, 정리 뒤 남은 자손 0개. 세 번(10-27, 10-28 두 번) 모두 같은 체인이다. | `semgrep-version-observation-20261027.md`, `…20261028.md`, `…20261028-version-check-off.md`의 프로세스 체인 절 | 사실(과거 관측) |
| `lsp`의 예상 체인 | `semgrep.exe` → 가상환경 `python.exe` → 기반 `python.exe` → `semgrep-core.exe osemgrep lsp --debug`. `pysemgrep`은 없을 것으로 읽힌다. | 3.1, 3.2 | 도출. 실행 필요 |
| 정리 조건 | 자식 종료와 stdout·stderr 파이프의 EOF가 함께 필요하다. 손자가 파이프 핸들을 쥐면 EOF가 오지 않는다. 이번에는 이 엄격성을 바꾸지 않는다. | 9bda3ba의 보완, 10-28 보고서 | 사실 |

### 3.5 현재 하네스 계약과 실제 소스가 다른 부분

| # | 하네스·문서의 계약 | 소스에서 읽힌 것 | 영향 | 구분 |
| --- | --- | --- | --- | --- |
| 1 | initialize 성공 뒤 **항상** `initialized` 송신(`session.ts:553-566`). 평가기는 부재를 `INITIALIZED_NOT_SENT`로 실패 처리(`evaluate.ts:679`). | `initialized`는 규칙 새로고침과 스캔을 시작하는 방아쇠다. | 최소 관측은 기존 세션 제어기와 평가기를 그대로 쓸 수 없다. 별도 기록이 필요하다. | 사실 |
| 2 | 기본 `LogFormat`은 접두어가 없다고 가정한다(`log-matcher.ts:20-23`). 한 줄 전체 일치만 인정. | Error·Warning·Info·Debug 줄은 `[00.04][DEBUG](default): …` 꼴의 머리말이 붙는다(`Log_semgrep.ml:31`의 예, `Logs_.ml:172-181`의 형식). **App 레벨만 장식이 없다.** | App 키는 지금 방식으로 맞고, Debug·Info 키는 접두어 처리 없이는 인식되지 않는다. 머리말 정확한 바이트는 `Logs_fmt` 소관이라 실행 필요. | 사실, 실행 필요 |
| 3 | 로그 키의 레벨 | App: `Refreshing rules`, `Rules refreshed`, `Scanning open documents`, `Scanned open documents`, `Scanning workspace`, `Scanned workspace`, `Scanning single file`. Debug: `Scanning workspace complete`(장벽), `Scanning workspace, full: true`, `CI disabled, not checking API token`, `No rules source specified, using auto`. Info: `Got N errors while refreshing rules in language server`. | 장벽 줄이 Debug라 `--debug`가 필요하다는 가정은 맞다. | 사실 |
| 4 | `SEMGREP_LOG_FILE`을 정해 둔다. | OCaml `lsp`는 이 파일에 쓰지 않는다고 읽힌다(3.3). | 로그 파일은 증거원이 아니다. | 도출 |
| 5 | 증거와 경로 보호는 `semgrep-state`(홈 포함) 안에서 쓴다고 가정한다. | shutdown이 그 홈 아래 `.semgrep/cache/...`를 새로 만든다. | Windows에서는 증거 폴더 안이라 범위 안이지만, 새 파일 목록이 기대와 달라진다. Linux는 실제 홈에 쓴다. | 사실 |
| 6 | 문서의 U3, U12 | 인자의 유효성, 이 경로에 버전 확인 호출이 없다는 점(받은 파일 범위)은 정적으로 풀렸다. 줄 형식의 바이트와 실제 stderr 출현은 아니다. | ADR은 바꾸지 않는다. 제안은 5.9에 적었다. | 사실 |
| 7 | `shutdown`에는 응답이 없고 `debug/echo`는 즉시 응답한다. | 일치(`Request_handler:146-150`). | 없음 | 사실 |
| 8 | 서버 버전을 `serverInfo.version`에서 받아 핀과 비교한다(`evaluate.ts:668-677`). | 일치. `serverInfo = {name: "Semgrep"; version = Version.version}`(`Legacy_initialize_request.ml:125`). | 최소 관측에서도 값을 기록할 수 있다. | 사실 |
| 9 | init 오류 응답 뒤에도 `shutdown`·`exit`을 보낸다(`session.ts:551`). | 서버가 `Uninitialized`로 남으면 `exit`이 무시된다. | 30초 `exit` 한도까지 기다린 뒤 강제 종료된다. 최소 관측 계획에는 stdin 닫기를 중간 단계로 둔다. | 도출 |
| 10 | 환경변수 `SEMGREP_VERSION_CHECK_URL`, `SEMGREP_VERSION_CACHE_PATH`를 보낸다. | `lsp` 경로에서 읽는 곳이 없다. | 해롭지 않다. 효과를 기대하지 않는다. | 도출 |
| 11 | Linux 계약은 부모의 `HOME`을 복사한다. | 홈은 `XDG_CONFIG_HOME`이 먼저이고, shutdown이 실제 홈에 쓴다. | Linux에서 실행하기 전에 손봐야 한다. 이번 범위 밖. | 사실 |

## 4. "시작 → initialize 응답 → shutdown/exit → 정리"만 관측할 수 있는가

**관측할 수 있다.** 필요한 메시지는 `initialize` 요청, `shutdown` 요청, `exit` 알림 세 개뿐이고, 어느 것도 `initialized`에 의존하지 않는다. 다만 아래 세 가지를 전제로 한다.

1. **`initialized`를 보내지 않는 것의 의미.**
   - 소스상 서버는 이미 `Running`이고(`Legacy_initialize_request.ml:92-103`), `shutdown`과 `exit`은 정상 처리된다.
   - 대신 규칙 새로고침, 토큰 확인, 열린 문서 스캔, 지문 파일 읽기가 모두 일어나지 않는다(`Notification_handler:61-79`).
   - LSP 표준에서는 클라이언트가 `initialized`를 보내는 것이 정상 순서다. 이 관측은 정상 시작 경로를 재현하지 않는다. 그래서 결과는 "서버가 뜨고 initialize에 답하고 끝난다"는 사실에 한정되며, 기존 PH1 통과로 읽으면 안 된다(기존 평가기는 실패로 본다, 3.5의 1번).
2. **initialize 경로만으로 규칙 다운로드나 스캔이 시작될 가능성을 배제할 수 있는가.**
   - 고정 공개 소스에서는 initialize 안에 규칙 로딩, 스캔, 네트워크 호출, 서브프로세스 생성이 없다(3.2).
   - 그러나 **실제 바이너리가 이 소스와 같다는 근거가 없다.** 휠 증명서의 소스는 비공개 저장소의 커밋이고(2절), `semgrep-core.exe`는 소스와 대조할 수 없다. 독점 빌드가 훅이나 다른 서버 구현을 등록했을 가능성은 소스만으로 배제하지 못한다(예: `Lsp_subcommand.ml:24-26`의 훅은 `--x-eio-ls`일 때만 쓰이지만, 이 바이너리에서 그 외의 훅이 없다는 보장은 없다).
   - 따라서 **"일어나지 않는다"는 도출이고, 배제는 실행으로만 된다.** 이 가능성을 받아들이고 한 번 띄울지는 소유자 결정이다(7절 D2).
3. **그 가능성을 줄이는 장치.** 아래 계획은 전용 계정의 나가는 연결 차단(기존 격리), 루프백 수신기 관측, 라이브 중단 조건(5.7)으로 위험을 제한한다. 이 장치들이 막아 주는 범위는 10-27 실행에서 관측한 PowerShell TCP IPv4 두 대상, 1회에 한정되어 있다. DNS, UDP, IPv6, 서비스 대행 통신은 관측하지 못했다.

## 5. 최소 관측 계획 (하나)

이름: **LSP-MIN-1**. 이번 작업에서는 실행하지 않고 구현도 하지 않는다.

### 5.1 범위와 전제

- **범위**: 실제 `semgrep.exe lsp --debug` 1회. 메시지는 `initialize`, `shutdown`, `exit` 셋만 보낸다. 규칙, 스캔, 음성 대조, 대상 코드는 다루지 않는다.
- **전제 1**: 5.10의 별도 작업(실행기, 러너, 시험, 검토)이 끝나 있다.
- **전제 2**: 실행 직전 중복 확인. 작업 트리가 깨끗하고, 원격 헤드가 검토한 커밋과 같고, `%LOCALAPPDATA%\bosang-radar\semgrep-isolation\`에 더 새로운 RunId가 없고, `bsi*` 계정이 없다.
- **전제 3**: 휠, `semgrep.exe`, `semgrep-core.exe`의 전체 SHA-256이 PR #35 보고서의 값과 같다. 격리 설치 폴더 전체의 실행 전 기준(ACL SDDL, 방화벽 규칙 이름 집합, 계정 목록, 프로필, 감사 값, 트리 통계)을 **저장소 밖에** 따로 저장한다(10-28 실행 때와 같은 방식).
- **전제 4**: 격리 적용, 실행, 복구는 기존 흐름(`Initialize-Isolation.ps1` → 실행 → `Remove-Isolation.ps1`)을 따른다. 전용 계정에는 가상환경 루트와 기반 Python 폴더의 읽기·실행 권한만 임시로 준다.

### 5.2 실행 형태

| 항목 | 값 |
| --- | --- |
| 실행 파일 | 10-27·10-28 관측과 같은 `semgrep.exe`(PR #35 보고서의 경로와 해시) |
| 인자 | 정확히 `["lsp", "--debug"]`. 그 밖의 인자는 거부한다. |
| 작업 폴더 | 실행별 새 폴더 `<work>\lsp-state` |
| 환경 | 10-28 버전 관측 계약의 Windows 목록(`New-VersionChildEnv`)에서 **`SEMGREP_ENABLE_VERSION_CHECK`만 뺀 것**: `PATH`(Windows 폴더 고정), `SYSTEMROOT`, `TEMP`·`TMP`(작업 폴더 안), `USERPROFILE`(`<work>\lsp-state\home`, 실행 전에 만든 실제 폴더), `SEMGREP_APP_URL`·`SEMGREP_METRICS_URL`·`SEMGREP_VERSION_CHECK_URL`(루프백 수신기 주소), `SEMGREP_LOG_FILE`, `SEMGREP_SETTINGS_FILE`, `SEMGREP_VERSION_CACHE_PATH`(상태 폴더 안). 토큰, 프록시, `SEMGREP_LOG_*`, `HOME`, `APPDATA` 등은 넣지 않는다. |
| 작업 영역 | 실행별로 새로 만든 **빈 폴더** `<work>\ws`. 초기화 응답 시간이 작업 영역 열거에 비례하므로 비워 둔다. |
| 규칙 구성 | 빈 폴더 `<work>\lsp-state\rules-empty`를 `configuration`으로 준다. `initialized`를 보내지 않으므로 읽히지 않는 것이 예상이지만, 만약 읽혀도 비어 있어 `auto`(레지스트리)로 떨어지지 않게 하는 안전망이다. |

### 5.3 메시지 순서

`initializationOptions`는 기존 `buildInitializationOptions`(`settings.ts:65-94`)를 그대로 쓴다. 결과는 `scan: {ci: false, configuration: ["…rules-empty"], maxTargetBytes, onlyGitDirty: false, pro_intrafile: false, timeout, timeoutThreshold}`와 `metrics: {enabled: false}`다. 허용 키 검사(`validateInitializationOptions`)는 그대로 통과한다.

| 순서 | 동작 | 기다리는 것 | 비고 |
| --- | --- | --- | --- |
| 1 | 자식 실행 | 실행 성공 | 실패하면 기록하고 정리로 간다. |
| 2 | `initialize` 요청 송신(`processId: null`, `rootUri`와 `workspaceFolders`는 `<work>\ws`, `capabilities: {}`, 위 `initializationOptions`) | 응답(`init` 한도) | 응답이 오류이거나 한도 초과면 4단계로 간다. |
| 3 | **`initialized`는 보내지 않는다.** | — | 이 계획의 핵심 선택이다. |
| 4 | `shutdown` 요청 송신(응답을 기다리지 않는다) | — | 소스상 응답이 없다. |
| 5 | `exit` 알림 송신 | 프로세스 트리 종료(`exit` 한도) | 서버가 `Uninitialized`로 남았으면 이 단계에서 끝나지 않는다. |
| 6 | 5단계 한도를 넘기면 stdin을 닫고 대기 | 종료(`killGrace` 한도) | EOF는 `Client disconnected` 경로로 루프를 끝낸다(`Rpc_server:251-253`). **새 단계**다. |
| 7 | 그래도 남으면 트리 강제 종료 | 종료 확인 | `taskkill /T /F`. |

### 5.4 시간과 출력 한도

- **기존 한도는 바꾸지 않는다**: 기존 `REAL_LIMITS`(`cli.ts:135-142`)의 `init` 60초, `exit` 30초, `killGrace` 10초를 그대로 쓴다. 근거: 버전 관측이 14.7초(`semgrep-core`와 파이썬 체인을 포함)였고, 초기화는 빈 폴더 열거라 그보다 크게 늘 이유가 소스에 없다. 근거가 없는 한도 축소는 하지 않는다.
- **새 실행기 전용 제안값(적용하지 않음)**:

| 항목 | 제안 | 근거 |
| --- | --- | --- |
| 전체 실행 상한 | 150초 | 최악의 경우를 더하면 init 60 + exit 30 + stdin 닫기 유예 10 + 종료 신호 유예 10 + 강제 종료 유예 10 = 120초. 여유 30초. |
| stdout 상한 | 1 MiB | 기대되는 출력은 initialize 응답 하나(능력 목록 포함 수 KB). 기존 프레임 한도(`framing.ts:7`)는 64 MiB로 이 관측에는 과하다. |
| stderr 상한 | 256 KiB | `--debug`는 `initializationOptions`와 요청, 응답, 세션 상태를 사람이 읽는 JSON으로 찍는다(`Legacy_initialize_request.ml:38-40`, `:108-110`, `Legacy_request_handler.ml:69-72`). 수 KB로 예상하지만 **실측이 아니라 추정**이다. 상한은 추정의 몇 배로 잡았다. |
| 라이브 관측 주기 | 약 40 ms(기존 CIM 폴링과 같음) | 10-27, 10-28 관측과 같은 방식. |

### 5.5 기록할 것 (판정이 아니라 관측)

| 기록 | 내용 |
| --- | --- |
| 송신 | 보낸 메시지와 송신 순서, 시각 |
| stdout | 받은 프레임 전체(상한 안), 프레임 오류 여부, 요청이 아닌 서버 알림 목록 |
| stderr | 원문 줄 전체(상한 안), 머리말 유무로 분류한 줄 수 |
| initialize 응답 | 응답 지연, `error` 유무, `serverInfo.name`, `serverInfo.version`(핀 `1.180.0`과 비교한 값은 **기록만**), `capabilities`의 해시 |
| 종료 | 종료 코드, 종료 시각, 종료까지의 경로(스스로 / stdin 닫기 / 강제), 종료 신호를 보낸 횟수 |
| 프로세스 | CIM 폴링으로 본 프로세스 목록(이미지, 부모, 소유 SID, 시작·종료 시각), 허용 이미지 목록 밖의 프로세스 |
| 네트워크 | 루프백 수신기 적중 수(실시간), 이번 실행에 귀속된 5157 건수와 식별 불가 건수, 수집 성공 여부 |
| 파일 | 작업 폴더와 홈 폴더 아래의 실행 전후 파일 목록 차이, 작업 폴더 밖에 생긴 파일(있으면) |
| 설치물 | 휠, `semgrep.exe`, `semgrep-core.exe`, 두 `python.exe`, `pyvenv.cfg`의 실행 전후 해시 |

### 5.6 관측이 성립했다고 보는 조건 (예상은 소스에서 도출한 값)

| # | 조건 | 예상 | 어긋나면 |
| --- | --- | --- | --- |
| O1 | 자식 실행 성공 | 성공 | 관측 실패로 기록 |
| O2 | `initialize` 응답이 한도 안에 오고 `error`가 없다 | 응답 | 관측 실패로 기록 |
| O3 | `serverInfo.name`이 `Semgrep`이고 `version`이 문자열 | 두 값 존재 | 값을 그대로 기록 |
| O4 | `exit` 뒤 트리가 한도 안에 모두 끝난다 | 스스로 종료 | 경로(stdin 닫기 / 강제)를 기록 |
| O5 | 종료 코드 | 0 | 그대로 기록. 0이 아니라고 해서 관측이 무효가 되지는 않는다. |
| O6 | 허용 이미지 밖의 프로세스 없음 | 없음 | 즉시 중단(5.7) |
| O7 | 루프백 적중 0, 귀속된 5157 0 | 0, 0 | 값을 기록. 1 이상이면 5.7에 걸린다. |
| O8 | 실행 후 전용 계정의 프로세스 0 | 0 | 복구 실패로 기록 |
| O9 | 새로 생긴 파일이 홈 폴더 아래 `.semgrep/cache/fingerprinted_ignored_findings/ws.txt` 하나 | 하나(예상 이름은 작업 영역 폴더 이름에서 도출, 변환 함수 `Legacy_convert_utils`는 읽지 않았다) | 목록을 그대로 기록. 작업 폴더 밖이면 5.7 |

O2~O5는 "서버가 뜨고 initialize에 답하고 끝난다"는 사실만 말한다. 이 결과로 **규칙 로딩, 스캔, 탐지, 정상 시작 경로, 핀 검증을 말하지 않는다.**

### 5.7 중단 조건 (즉시 트리 강제 종료 후 복구)

| # | 조건 | 비고 |
| --- | --- | --- |
| A1 | stderr에 `Refreshing rules`, `Rules refreshed`, `Scanning workspace`, `Scanning open documents`, `Scanning single file`가 나타남 | `initialized` 없이 새로고침이나 스캔이 시작되었다는 뜻이다. 가장 중요한 발견이므로 즉시 멈춘다. App 레벨 줄은 장식이 없지만, 이 조건은 **부분 문자열**로 본다(형식이 확정되지 않았다). |
| A2 | stderr에 `download` 또는 `registry`가 (대소문자 무시) 나타남 | 규칙 내려받기 시도의 신호. 부분 문자열 검사라 오탐할 수 있으나, 오탐은 중단 쪽으로 기우는 안전한 방향이다. |
| A3 | 루프백 수신기에 요청이 한 번이라도 들어옴 | 실시간 관측 |
| A4 | 허용 이미지 목록 밖의 프로세스 출현. 허용: `semgrep.exe`, 가상환경 `python.exe`, 기반 `python.exe`, `semgrep-core.exe`, `pysemgrep.exe`, `conhost.exe` | `pysemgrep`은 결정 4에 따라 허용 |
| A5 | 작업 폴더 밖에 파일이 생김 | 전후 목록 비교는 사후 확인이므로, 라이브로는 홈과 작업 폴더의 변경 감시만 한다. |
| A6 | `initialize` 응답 없이 `init` 한도 초과, 프레임 오류, stdout·stderr 상한 초과, 전체 실행 상한 초과 | |
| A7 | 취소 신호 | |

A3와 A4는 라이브로만 잡을 수 있다. 5157 이벤트는 실행이 끝난 뒤 수집하므로 라이브 중단 조건이 아니다.

### 5.8 복구

1. 트리 종료를 확인한다(전용 계정의 남은 프로세스 0).
2. 기존 복구 흐름으로 계정, 방화벽 규칙, 감사 설정, 임시 ACE를 되돌린다. 부분 실패는 항목별로 남기고 나머지를 계속한다(6e2d29c의 방식).
3. 복구 뒤 상태를 **실행 전 기준(저장소 밖)과 직접 대조한다**: 계정 목록, 방화벽 규칙 이름 집합, 프로필, 감사 값(원문 CSV), 두 폴더의 ACL SDDL, 설치물 해시, 트리 통계. 대조 스크립트가 빈 값 둘을 같다고 보지 않는지 눈으로 확인한다(10-28의 교훈).
4. 증거(원문 stdout·stderr, 프로세스 기록, 파일 목록 차이)는 저장소 밖 실행 폴더에 두고, 보고서에는 해시만 싣는다.
5. 어느 단계가 실패해도 **같은 관측을 다시 실행하지 않는다.** 다음 단계는 소유자 결정이다.

### 5.9 기존 판정 기준과 한도에 대한 제안 (적용하지 않음)

| # | 제안 | 근거 |
| --- | --- | --- |
| P1 | LSP-MIN-1의 결과는 새 기록 형식으로 남기고 기존 평가기 판정(`INIT_FAILED` 계열)에 연결하지 않는다. 기존 평가기를 고치지 않는다. | `initialized`를 보내지 않는 것은 정상 경로가 아니다(3.5의 1번). |
| P2 | 5.4의 새 실행기 전용 한도(전체 150초, stdout 1 MiB, stderr 256 KiB)는 새 실행기에만 적용한다. 기존 `REAL_LIMITS`는 건드리지 않는다. | 5.4 |
| P3 | 이후 단계(규칙 로딩, 스캔)에서 쓸 `LogFormat`은 머리말 `^\[\d+\.\d+\]\[(DEBUG\|INFO\|WARNING\|ERROR)\](\([^)]*\))?: `을 벗기는 형태를 검토한다. 정확한 바이트는 LSP-MIN-1의 stderr 원문으로 먼저 확인한다. | `Log_semgrep.ml:31`, `Logs_.ml:172-181`. 정규식 자체는 추정이다. |
| P4 | Linux 계약은 `HOME`을 상태 폴더 안 홈으로 바꾸고 `XDG_CONFIG_HOME`도 다룬다. 실행 전에 해결한다. | 3.3의 `HOME`(Linux) 행 |
| P5 | 증거 목록에 `home/.semgrep/cache/fingerprinted_ignored_findings/`를 기대 파일로 추가한다. | 3.2의 shutdown 행 |
| P6 | `SEMGREP_LOG_FILE`은 로그 증거원에서 빼고 stderr 원문을 증거로 삼는다. | 3.3 |

### 5.10 이 계획을 실행하기 전에 필요한 별도 작업 (이번에 하지 않았다)

| 작업 | 내용 |
| --- | --- |
| W1 | 새 실행기 구현: `initialize` → `shutdown` → `exit`만 보내고 `initialized`는 보내지 않는 세션. 스텁 LSP로 먼저 시험한다(응답 지연, 오류 응답, `Uninitialized` 잔류, 출력 상한 초과, 손자가 핸들을 쥐는 경우 포함). |
| W2 | 전용 계정으로 표준 입력을 쓰는 Windows 러너. 기존 `version-runner.ps1`은 표준 입력을 쓰지 않는다. 고정 인자·환경·한도를 검사하고 프로세스 트리 종료까지 맡는다. |
| W3 | 5.7의 중단 조건 시험과 5.5의 기록 형식 시험. |
| W4 | 독립 검토(코드만 주고 결론은 주지 않는다). |
| W5 | 5.1의 실행 전 확인과 저장소 밖 기준 저장. |
| W6 | 소유자 승인 뒤 **단 한 번**의 실제 실행, 복구, 결과 보고서. |

## 6. 확인 수준의 요약

| 분류 | 항목 |
| --- | --- |
| **확인된 사실** | `lsp --debug`는 유효한 인자 조합이다. `lsp`는 `Lsp_subcommand`가 직접 처리하고 폴백 줄이 없다. initialize 핸들러 안에는 규칙 로딩, 스캔, 네트워크 호출이 없다. `initialized`가 규칙 새로고침, 토큰 확인, 열린 문서 스캔을 시작한다. `shutdown`은 응답 없이 지문 파일을 쓴다. `exit`은 `Uninitialized`에서는 무시된다. 홈 규칙(Windows `USERPROFILE`, POSIX `XDG_CONFIG_HOME` 다음 `HOME`). Debug·Info·Warning·Error 줄에는 머리말이 있고 App 줄에는 없다. 파이썬 7개 파일은 고정 커밋과 바이트가 같다. |
| **소스에서 도출한 판단** | initialize와 shutdown·exit만으로 규칙 다운로드나 스캔이 시작되지 않는다. `lsp`는 `pysemgrep`을 거치지 않으므로 체인이 `--version`보다 짧다. 종료 코드는 0이다. `SEMGREP_ENABLE_VERSION_CHECK`는 OCaml 경로에 효과가 없다. 종료 시 메트릭 전송은 건너뛴다. `SEMGREP_LOG_FILE`은 쓰이지 않는다. |
| **실제 실행으로만 확인되는 것** | 실제 바이너리가 이 소스와 같은 동작을 하는지. Windows에서 `select` 엔진과 파이프로 stdio가 동작하는지(ADR U9). 머리말의 정확한 바이트(U3). 실제 체인과 자손 정리. 종료 코드. shutdown이 만드는 파일의 정확한 이름. initialize 응답 시간. 네트워크 시도 여부(귀속된 5157, DNS, UDP, IPv6 포함). |

## 7. 소유자 결정 대기

| # | 결정 | 권고 | 근거 |
| --- | --- | --- | --- |
| D1 | `initialized`를 보내지 않는 최소 관측을 정상 시작 경로의 대체가 아니라 **별도 관측**으로 인정할 것인가 | 인정 | 5.9의 P1. 기존 판정과 섞이지 않는다. |
| D2 | 바이너리와 공개 소스의 대응이 확정되지 않은 채, initialize 경로의 안전을 소스로 도출하고 격리 장치(나가는 연결 차단, 루프백 관측, 라이브 중단 조건)에 기대어 **한 번** 띄워도 되는가 | 조건부 허용: W1~W5 완료 뒤에만 | 4절. 격리 효과는 PowerShell TCP IPv4 두 대상 1회 관측이 전부다. |
| D3 | 표준 입력을 쓰는 새 Windows 러너(W2)를 기존 격리 스크립트 묶음에 더하는 방식으로 진행할 것인가 | 더한다 | 기존 정리·복구·계정 흐름을 재사용한다. |
| D4 | 5.4의 새 실행기 전용 한도(전체 150초, stdout 1 MiB, stderr 256 KiB)를 받아들일 것인가 | 받아들인다 | 기존 한도는 그대로이고, stderr 용량은 추정이다. |
| D5 | Linux 계약의 `HOME` 복사(P4)를 실행 전에 고칠 것인가 | 고친다. 단 Linux 실행을 계획할 때 | 이번 범위 밖 |
| D6 | LogFormat 머리말 처리(P3)를 LSP-MIN-1의 stderr 원문을 본 뒤에 정할 것인가 | 그렇게 한다 | 정확한 바이트가 외부 라이브러리 소관 |

## 8. 하지 않은 것

- 실제 Semgrep 실행과 임포트(`--help`, `--version` 포함), 새 실행기와 러너의 구현, 실제 적용과 프로브.
- 규칙 다운로드, 스캔, 음성 대조, 조회를 켠 상태와의 대조 실행, 10-28 시간 초과의 원인 규명 실험.
- `SEMGREP_ENABLE_VERSION_CHECK`를 LSP 자식 환경에 추가하는 변경(코드도 문서 규칙도).
- `pin.json`, `verified`, `policy_accepted`, ADR 상태 변경. 기존 PR, `main`, bodam 변경. 병합, 배포.
- 계정, 방화벽, 감사, ACL 등 시스템 상태 변경.
- 내려받은 소스는 세션 전용 임시 폴더에만 두었고 저장소에는 넣지 않았다. 다만 커밋 트리 목록 파일 하나(JSON)를 처음에 시스템 임시 폴더에 잘못 받았다가 곧바로 세션 폴더로 옮기고 원래 파일을 지웠다. 읽기 전용 자료이고 실행하지 않았다.
- 앞서 통과한 전체 시험과 변이 점검의 재실행(문서 작업이라 하지 않았다). 서식 검사 대상은 `.moai/`가 아니므로 prettier로 확인하지 않았다.

## 부록 A. 인용한 파일의 blob 해시 (앞 12자리, 고정 커밋 `a35fe83`)

| 파일 | blob |
| --- | --- |
| `src/osemgrep/cli/CLI.ml` | `78cbaf81d14d` |
| `src/osemgrep/cli_lsp/Lsp_CLI.ml` | `19c2b36d797f` |
| `src/osemgrep/cli_lsp/Lsp_subcommand.ml` | `35d58fbab543` |
| `src/osemgrep/core/CLI_common.ml` | `ba7d8c726195` |
| `src/osemgrep/core/Metrics_.ml` | `0bc3de573d2e` |
| `src/osemgrep/core/Rules_config.ml` | `5dff55df9783` |
| `src/osemgrep/configuring/Semgrep_envvars.ml` | `de01641790e1` |
| `src/osemgrep/configuring/Semgrep_settings.ml` | `4f94a63cc367` |
| `src/osemgrep/networking/Semgrep_Metrics.ml` | `b4f03989315a` |
| `src/lsp_legacy/Legacy_ls.ml` | `09d64b5e2a0a` |
| `src/lsp_legacy/Legacy_language_server.ml` | `9a160be23775` |
| `src/lsp_legacy/requests/Legacy_initialize_request.ml` | `734933a84514` |
| `src/lsp_legacy/requests/Legacy_request_handler.ml` | `713ae954b8e4` |
| `src/lsp_legacy/notifications/Legacy_notification_handler.ml` | `9339e6bf00f8` |
| `src/lsp_legacy/server/Legacy_rpc_server.ml` | `6d7105335213` |
| `src/lsp_legacy/server/Legacy_session.ml` | `2957d9e8e60f` |
| `src/lsp_legacy/server/Legacy_user_settings.ml` | `2710ff6a9e39` |
| `src/lsp_legacy/server/Legacy_ls_metrics.ml` | `30f944ec3f5a` |
| `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml` | `be41b108c642` |
| `src/targeting/Find_targets.ml` | `899a0ba8eeb9` |
| `src/core/Log_semgrep.ml` | `1a2a6259e293` |
| `libs/commons/Logs_.ml` | `2fc8e39abfee` |
| `libs/lwt_platform/unix/Lwt_platform.ml` | `bc97f943fb26` |
| `cli/src/semgrep/console_scripts/entrypoint.py` (설치본과 동일) | `0c9e2000429e` |
| `cli/src/semgrep/console_scripts/pysemgrep.py` (설치본과 동일) | `32641459fe76` |
| `cli/src/semgrep/main.py` (설치본과 동일) | `22543a517c49` |
| `cli/src/semgrep/env.py` (설치본과 동일) | `402480e17adf` |
| `cli/src/semgrep/commands/scan.py` (설치본과 동일) | `3c36f0273923` |
| `cli/src/semgrep/__init__.py` (설치본과 동일) | `aea0a268f366` |
| `cli/src/semgrep/app/version.py` (설치본과 동일) | `58f86c8c093d` |
