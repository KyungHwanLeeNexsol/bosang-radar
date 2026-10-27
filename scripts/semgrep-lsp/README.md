# scripts/semgrep-lsp — Semgrep LSP 외부 하네스 (G1, 실행 전)

상태: **Proposed**. 결정 문서는 `.moai/decisions/lsp-security-source.md`(ADR-001)다. 이 디렉터리는
Semgrep을 설치하지도, 실행하지도 않는다. 모든 시험은 합성 트랜스크립트와 시험용 LSP 스텁만 쓴다.

## 하지 않는 것

- Semgrep 설치, `semgrep` 실행, `semgrep lsp` 기동, 실제 규칙 탐지, 대상 스캔, 네트워크 대조.
- 실제 엔진으로 음성 대조 R1~R9를 실행하는 일. 실행기(`negative-control` 명령)는 구현했지만 합성 스텁으로만 돌렸다(아래 '음성 대조 실행기와 기록 연결').
- `quality.yaml`·`lsp.yaml`·임계값·훅과의 연결. 외부 하네스 값은 `candidate_gate`로만 계산하고
  기존 보안 게이트에는 닿지 않는다(`policy_accepted`는 타입이 리터럴 `false`로 봉인한다).
- 규칙 YAML 원문의 커밋. 규칙 자료는 gitignore된 캐시(`.moai/cache/semgrep-rules`)에서 읽는다.
  저장소에는 파일 목록·blob SHA(`data/rules-files.tsv`)와 기대 규칙 목록(`data/rules-expected.tsv`)만 둔다.
- 대조 예제(`.moai/fixtures/semgrep-control/cases/*.in`)의 실행·import. 정적 입력일 뿐이다.
- 밖으로 나가는 네트워크 통신. 네트워크 모듈은 루프백 수신기(`metrics-node.ts`)와 그 시험 클라이언트(`testing/loopback-client.ts`)만 가져오며
  `127.0.0.1`에만 바인딩·접속한다(구조 시험이 지킨다).
- 다른 프로세스를 끝내거나 신호를 보내거나 정리하는 일. 프로세스 목록은 **읽기만** 한다(끝내는 것은 목록을 읽으려고 어댑터가 직접 띄운 조회 자식뿐이며,
  구조 시험이 그 밖의 종료 표현이 없음을 지킨다).

## 스텁 결과의 해석

스텁으로 통과한 시험은 **하네스 판정 로직이 합성 입력에서 의도대로 동작한다**는 것만 증명한다.
실제 Semgrep의 로그 형식, Windows URI 형식, `debug/echo` 응답, 종료 코드, 규칙 수, 탐지 여부는
증명하지 않는다. 스텁 실행의 `provenance`는 `stub`, `trust`는 `SYNTHETIC`이고
`candidate_gate.evaluation`은 항상 `UNVERIFIED`다.

## 모듈과 소유 범위

| 파일                                                                                         | 책임                                                                                    | 단계       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| `types.ts`, `status.ts`                                                                      | 공용 계약, 실패 상태 우선순위, 사유→상태 표                                             | 계약(고정) |
| `sha.ts`                                                                                     | sha256, git blob SHA-1, 줄 목록 해시                                                    | A          |
| `framing.ts`                                                                                 | Content-Length JSON-RPC 인코더·점진 디코더(fail-closed)                                 | A          |
| `jsonrpc.ts`                                                                                 | 요청·알림 생성, id 생성기, id 기반 응답 라우터                                          | A          |
| `clock.ts`                                                                                   | `SystemClock`, `VirtualClock`(결정적 시험용)                                            | A          |
| `streams.ts`                                                                                 | 비동기 바이트 큐, 줄 조립기, stdout·stderr 독립 수집기                                  | A          |
| `testing/fake-process.ts`                                                                    | 메모리 상의 `ProcessPort`·`ChildHandle`                                                 | A          |
| `testing/memory-fs.ts`, `testing/memory-git.ts`                                              | 메모리 `FsPort`·`GitPort`                                                               | A          |
| `rules-manifest.ts`                                                                          | 규칙 파일·기대 목록 파싱, 최종 ID 모델, 목록 해시, 규칙 트리 대조                       | B          |
| `scope.ts`                                                                                   | 대상 SHA에서 E 계산, 스캔 트리 생성·대조                                                | B          |
| `log-matcher.ts`                                                                             | stderr 줄 인식(메시지 본문 전체 일치)                                                   | B          |
| `aggregate.ts`                                                                               | 진단 집계(중복 제거, 심각도 규칙, 소계)                                                 | B          |
| `settings.ts`                                                                                | `initializationOptions` 생성, 허용 키 검사(알 수 없는 키 거부)                          | B          |
| `precheck.ts`                                                                                | PH0 사전 검사(서버 없이)                                                                | B          |
| `evaluate.ts`                                                                                | 트랜스크립트 → `Verdict` (순수 함수)                                                    | B          |
| `control.ts`                                                                                 | 대조 단언 A1~A4, 정상 쌍, 음성 대조, 전체 상태 규칙, 필요한 검사 목록                   | B          |
| `control-expectations.ts`                                                                    | 대조 기대 입력(`data/control-expectations.json`) 읽기 — 하네스·어댑터 공용              | B          |
| `canonical.ts`                                                                               | 정규 JSON 직렬화(키 정렬, 2칸, LF) — `evidence.ts`와 `fingerprint.ts`가 함께 쓴다       | B          |
| `fingerprint.ts`                                                                             | 하네스·대조 지문, 도구·규칙·하네스·대조를 묶는 결합(binding) 해시                       | B          |
| `reference.ts`                                                                               | 대조 참조 자격(`qualifyControlRun`)과 target 쪽 사실 확인(`checkControlReferenceFacts`) | B          |
| `reference-record.ts`                                                                        | 명시한 control `run.json`을 읽어 구조·자격을 다시 확인하고 target의 대조 참조로 변환    | B          |
| `evidence.ts`                                                                                | `RunRecord` 구성(`reference_qualification` 포함), 증거 파일 9개 작성                    | B          |
| `testing/transcript-builder.ts`                                                              | 합성 트랜스크립트 작성기                                                                | B          |
| `testing/evaluate-fixtures.ts`, `testing/evaluate-scenarios.ts`, `testing/synthetic-data.ts` | 판정·CLI 시험이 공유하는 합성 입력과 시나리오 표(시험 전용)                             | B·C        |
| `testing/control-record-fixtures.ts`                                                         | 합성 control 기록 빌더(시험 전용 — 실제 실행에서 나온 기록이 아니다)                    | B·C        |
| `session.ts`                                                                                 | PH1~PH4 세션 제어기(포트·시계 주입)                                                     | C          |
| `process-node.ts`, `git-node.ts`, `fs-node.ts`                                               | 실제 어댑터(자식 프로세스·git·파일)                                                     | C          |
| `run-lock.ts`                                                                                | 공유 실행 잠금 코어(획득·해제·요약, 파일 시스템은 포트로 받는다)                        | B          |
| `run-lock-node.ts`, `metrics-node.ts`                                                        | 실제 어댑터(잠금 파일·경로 정규화, 127.0.0.1 루프백 수신기)                             | C          |
| `path-containment.ts`                                                                        | 증거 폴더가 서버 트리 안인지의 순수 판정(실제 접근 자리 `FsPort.physicalKey` 기준)      | B          |
| `run-id.ts`                                                                                  | `--run-id`·`runId` 형식 규칙의 유일한 출처(CLI·하네스·대조 기록 읽기가 함께 쓴다)       | B          |
| `tool-observation.ts`                                                                        | 도구 버전(`--version` 자식)·휠 sha256 관측 코어(포트로만 만진다, 던지지 않는다)         | B          |
| `artifact-node.ts`                                                                           | 실제 어댑터(명시한 휠 파일 하나를 읽기 전용으로 스트리밍 해시)                          | C          |
| `testing/stub-version.mjs`, `testing/memory-artifact.ts`                                     | 버전 출력 스텁(Node, 실제 Semgrep이 아니다), 메모리 해시 포트                           | B·C        |
| `process-observation.ts`                                                                     | 같은 트리의 다른 서버 프로세스 판정 코어(역할·트리 관계·합산, 조회 시점, 순수)          | B          |
| `process-list.ts`                                                                            | 프로세스 목록 해석(PowerShell 출력·Windows 명령줄·/proc 파일, 순수)                     | B          |
| `process-list-node.ts`                                                                       | 실제 어댑터(Windows: PowerShell CIM을 프로세스 포트로, Linux: /proc 읽기 전용)          | C          |
| `testing/synthetic-processes.ts`, `testing/memory-procfs.ts`, `testing/stub-sleeper.mjs`     | 합성 프로세스 자료·가짜 조회 어댑터, 메모리 /proc, 무해한 대기 스텁(Semgrep이 아니다)   | B·C        |
| `testing/posix-open-emulator.ts`                                                             | POSIX 열기 의미 모델(FIFO 열기 대기 재현, 커널의 증거가 아니다)                         | B·C        |
| `testing/memory-run-lock.ts`, `testing/fake-metrics.ts`                                      | 잠금·수신기 시험 지원(메모리 포트, 가짜 수신기)                                         | B          |
| `testing/loopback-client.ts`, `testing/lock-child.mjs`                                       | 루프백 시험 클라이언트(127.0.0.1 전용), 잠금 경쟁 자식 프로세스                         | C          |
| `harness.ts`                                                                                 | 범위 계산 → 사전 검사 → 세션 → 판정 → 증거를 잇는 함수                                  | C          |
| `negative-control.ts`                                                                        | 음성 대조 실행기(R1~R9 변형·층별 실행)와 항목을 만드는 순수 판정                        | B·C        |
| `negative-control-record.ts`                                                                 | 스위트 기록 직렬화·읽기(항목을 사례별 증거에서 다시 도출)                               | B          |
| `testing/control-world.ts`, `testing/negative-control-rig.ts`                                | 음성 대조 시험의 합성 세계(메모리 파일 시스템 + 스텁 엔진)                              | B·C        |
| `testing/cli-negative-control-world.ts`                                                      | 음성 대조 CLI 시험의 합성 세계(가짜 포트 + 스텁 엔진)                                   | B·C        |
| `cli.ts`                                                                                     | 명령줄 진입점, 실제 실행 방지 장치                                                      | C          |
| `testing/stub-lsp.ts`, `testing/stub-child.mjs`                                              | 시험용 LSP 스텁(메모리·`node`로 띄우는 별도 프로세스). Semgrep이 아니다                 | C          |
| `structure.test.ts`, `structure.negative-control.test.ts`                                    | 구조 보장 시험(프로세스·네트워크 사용 위치, 기존 게이트 비연결, 규칙 원문 부재)         | C          |

## 순수 판정의 규칙

판정은 `evaluateTranscript(transcript, inputs)`의 순수 함수다. 트랜스크립트의 사건 순서는 **스트림
내부 순서**만 신뢰한다. stdout과 stderr는 별개 파이프라서 서로의 도착 순서는 증거가 아니다.

- stdout 구간은 메시지 인덱스로 가른다: 스캔 송신 시점의 `cursor.stdout` 이전 = 스캔 전, 송신 이후 `echo-post-barrier`
  응답 이전 = 이번 스캔의 게시, 그 응답 이후 = 늦은 진단.
- stderr 구간은 **마커 줄**로 가른다: `Scanned open documents`까지 = PH1~PH2, 첫 `Scanning workspace`부터
  `Scanning workspace complete`까지 = PH3. 마커 사이의 스캔 관련 줄은 오염 사유다.
- 단 하나의 예외: 스캔 로그가 `scan-workspace` 송신보다 먼저 도착한 경우(`seq` 비교)는 원인이 결과보다
  뒤에 와야 하므로 서버가 스스로 스캔한 것이다(오염).
- 사유는 전부 `Reason[]`에 담고 대표 상태는 `representativeStatus`가 정한다. 필수 증거(로그 줄, 응답,
  장벽, echo 응답)가 없으면 그 부재가 사유다 — 사유가 비어 있는 채 `COMPLETE`가 되는 경로는 없다.
- 프레임이 깨졌거나(`MALFORMED`) 잘렸으면(`TRUNCATED`) 그 시점부터 stdout은 신뢰하지 않는다.
- `Found M matches`는 게시 진단의 **원시** 개수 D(스캔 송신 이후 게시분)와 `D ≤ M`이고 `M > 0`이면 `D ≥ 1`이어야 한다
  (고정 소스: 진단은 같은 매치 목록에서 파일별로 만들어지고 JSON이 같은 것만 합쳐진다). 어기면 `MATCH_COUNT_DIAGNOSTICS_*`(→ `PARTIAL`)다.
  `D < M`은 서버 쪽 중복 제거로 정상이다. 하네스의 집계 키는 서버 키와 달라서 집계 합계가 아니라 원시 D와 비교한다.
- 확정된 `s0`(관측 값이 있고 설명됨)는 `Semgrep skipped S rules`의 S와 0을 포함해 같아야 한다(`SKIPPED_RULES_S0_MISMATCH`).
  확정되지 않았으면 S = 0이어야 하고 S > 0은 `ENGINE_SKIPPED_RULES_UNEXPLAINED`다.

stderr 줄은 **메시지 본문 전체 일치**로만 인식한다(접두 일치 금지). 실제 형식(접두어·시각)은 미확인이라
`LogFormat.extractMessage`로 주입하고, 기본값은 줄 전체(앞뒤 공백 제거)다.

| 키                                               | 메시지 본문                                                                         | 소스(S = v1.180.0)                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------ |
| `refreshingRules`                                | `Refreshing rules`                                                                  | `Legacy_scan_helpers.ml:324`         |
| `rulesRefreshed`                                 | `Rules refreshed`                                                                   | `:331`                               |
| `scanningOpenDocuments` / `scannedOpenDocuments` | `Scanning open documents` / `Scanned open documents`                                | `:263`, `:278`                       |
| `scanningWorkspace`                              | `Scanning workspace`                                                                | `:250`                               |
| `scannedWorkspace`                               | `Scanned workspace` (진단 전송 **전**)                                              | `:259`                               |
| `barrier`                                        | `Scanning workspace complete` (debug, 전송 **후**)                                  | `Legacy_notification_handler.ml:213` |
| `fullScan`                                       | `Scanning workspace, full: true` (debug)                                            | `:208`                               |
| `ciDisabled`                                     | `CI disabled, not checking API token` (debug)                                       | `Legacy_session.ml:198`              |
| `usingAuto`                                      | `No rules source specified, using auto` (debug)                                     | `Legacy_session.ml:351`              |
| `scanningSingleFile`                             | `Scanning single file`                                                              | `Legacy_scan_helpers.ml:283`         |
| `gotErrors`                                      | `Got <N> errors while refreshing rules in language server` (info)                   | `Legacy_session.ml:374-376`          |
| `loading` / `doneLoading`                        | `loading local config from <경로>` / `Done loading local config from <경로>` (info) | `Rule_fetching.ml:367`, `:371`       |
| `skippingRule`                                   | `skipping rule <ID>, error = <사유>`                                                | `Parse_rule.ml:1243-1245`            |
| `download`                                       | `trying to download from <URL>` (info)                                              | `Rule_fetching.ml:136`               |
| `runningRules`                                   | `Running Semgrep with <N> rules` (debug)                                            | `Legacy_scan_helpers.ml:143-144`     |
| `engineErrors`                                   | `Semgrep errors: <본문>`                                                            | `:180`                               |
| `skippedRules`                                   | `Semgrep skipped <S> rules`                                                         | `:182`                               |
| `scannedFiles`                                   | `Scanned <K> files`                                                                 | `:183`                               |
| `foundMatches`                                   | `Found <M> matches`                                                                 | `:184`                               |

위 형식은 모두 **소스 문자열**이다. 실제 stderr에 이 모양으로 나오는지는 미확인(ADR U3)이다.

## 대조 참조 자격 (ADR D11)

target 실행은 "양성·정상 쌍 단언이 `PASS`였다"는 이유만으로 대조 참조를 받지 않는다.

- 음성 대조 R1~R9는 `preflight`(서버 없이 거부, 7개)와 `engine`(실제 엔진 진단 실행, 9개) 두 층이며 서로 대신하지 못한다.
  항목마다 결과를 얻은 조합의 결합 해시(`binding_sha256`)를 단다.
- `RunRecord.reference_qualification`이 control 실행의 자격(`eligible`)을 따로 기록한다. 음성 대조가 `NOT_RUN`이어도
  `control_assertions`의 `PASS`는 그대로 남고, 대신 자격이 불충족이다.
- `control_reference`는 판정이 아니라 사실(지문, 음성 대조 요약)을 싣는다. target 판정은 자기 선언 `eligible`을 믿지 않고
  이번 실행의 지문과 다시 맞춘다. 없는 지문은 없는 지문과도 일치하지 않는다.
- 하네스 지문: `scripts/semgrep-lsp/` 아래 `.ts`·`.mjs` 구현 파일(`*.test.*`, 최상위 `testing/`·`data/` 제외)을
  경로 바이트순으로 `<경로>\t<원시 바이트 sha256>\n` 매니페스트로 만든 해시. 대조 지문: 대조 기대 파일과 `.in` 예제의 실제 바이트.
- 지금은 `engine` 항목을 `PASS`로 표시하는 운영 코드가 없어서, 실제 control 실행도 자격이 없다. 즉 이 변경만으로는
  어떤 target 실행도 `COMPLETE`가 될 수 없다(의도한 fail-closed).

## 실행 방지 장치

- `package.json`에 이 디렉터리를 가리키는 스크립트를 추가하지 않는다. `pnpm test`는 합성·스텁 시험만 돌며
  Semgrep을 찾거나 시작하지 않는다. 통합 시험은 `node`로 `testing/stub-child.mjs`(스텁)를 띄우고, git 어댑터
  시험은 이 저장소를 읽기 전용으로 조회한다.
- `createNodeProcessPort`는 `provenance`를 **필수 인자**로 받는다(기본값 없음). 시험은 항상 `"stub"`이고
  `"real"`은 `cli.ts`의 `run` 방지 장치 뒤에서만 넘긴다. 그래서 스텁 자식의 기록이 실제 실행으로 표시될 수 없다.
- `cli.ts`의 `run`은 `--allow-real-semgrep`, 환경변수 `MOAI_SEMGREP_LSP_ALLOW_REAL=1`,
  `--semgrep-bin <절대 경로>`가 **모두** 있어야 프로세스를 띄운다. 하나라도 없으면 `NOT_RUN`을 출력하고
  종료 코드 3으로 끝나며 `spawn`을 호출하지 않는다. PATH 탐색과 자동 설치는 없다.
- 실제 `child_process` 사용은 `process-node.ts`(실행 어댑터)와 `git-node.ts`(읽기 전용 git)에만 있다.
  구조 시험이 이를 지킨다.

## 명령(모두 명시적 호출, 인자에 기본 위치 없음)

```text
pnpm exec tsx scripts/semgrep-lsp/cli.ts precheck --rules-cache <dir> [--scan-tree <dir> --repo <dir> --target-sha <40자 SHA>]
pnpm exec tsx scripts/semgrep-lsp/cli.ts scope --repo <dir> --target-sha <40자 SHA> [--format json|tsv]
pnpm exec tsx scripts/semgrep-lsp/cli.ts run --mode control|target ...   # 실제 실행 전용. 방지 장치 없이는 NOT_RUN (종료 코드 3)
pnpm exec tsx scripts/semgrep-lsp/cli.ts negative-control --suite-id <id> ...   # 음성 대조 R1~R9 실행 전용. 방지 장치 없이는 NOT_RUN (종료 코드 3)
```

`run`과 `negative-control`의 전체 인자는 `cli.ts --help`에 있다. `precheck`와 `scope`는 읽기 전용이고 Semgrep을 쓰지 않는다.

`run`의 경로 계약:

| 옵션                      | target                                         | control     |
| ------------------------- | ---------------------------------------------- | ----------- |
| `--repo`, `--target-sha`  | 필수. 검사 대상 저장소와 커밋                  | 쓰지 않는다 |
| `--scan-root`             | 필수. 대상 SHA에서 만든(또는 대조할) 스캔 트리 | 쓰지 않는다 |
| `--control-fixtures-root` | 선택. 대조 지문 계산에 읽는 대조 예제의 저장소 | 필수        |
| `--control-tree-root`     | 쓰지 않는다(자리표시 경로로 남는다)            | 필수        |
| `--control-record`        | 선택. 대조 실행의 `run.json` 한 개(명시만)     | 쓸 수 없다  |
| `--negative-controls`     | 쓸 수 없다                                     | 선택        |
| `--wheel-artifact`        | 선택. 휠 파일 하나의 절대 경로(명시만)         | 같다        |

`--wheel-artifact`는 휠 sha256 관측에 쓰는 파일이다(아래 '도구 버전·휠 sha256 관측'). 생략하면 휠 해시는 관측하지 않는다(`null`) — 기본 경로·자동
탐색·내려받기는 없다. 상대 경로는 사용법 오류(2)다.
`--negative-controls`는 control 실행이 음성 대조 스위트 기록 한 개를 명시하는 옵션이다(명시만, 자동 탐색 없음 — 아래 '음성 대조 실행기와 기록 연결'). target에서 주면 사용법 오류(2)다.

- `--control-fixtures-root`는 **두 모드 모두** 대조 지문(`inputs.control_sha256`)을 계산하는 데 쓴다. target에서도 하네스가
  대조 지문을 계산하기 때문이다. 이 위치는 `--repo`와 **별개의 경로**다. 검사 대상 SHA에는 대조 예제가 없을 수 있어서
  `--repo` 아래에 있다고 가정하지 않는다.
- target에서 `--control-fixtures-root`를 생략하거나, 위치가 없거나, 예제 하나라도 읽을 수 없으면 대조 지문은 `null`
  (확인하지 못함)이고 결합 해시도 `null`이다. 거짓 지문을 만들지 않고 대조 참조의 값을 복사하지도 않는다. 대조 참조는
  기존대로 거절된다.

`--control-record`(대조 기록 읽기, `reference-record.ts`):

- 세 경로는 서로 다르다: 검사 대상 저장소(`--repo`), 대조 예제 저장소(`--control-fixtures-root`), 대조 기록(`--control-record`).
  **최신 기록 자동 탐색도 기본 경로도 없다.** 경로는 하나만 명시하고, control 모드에서는 쓸 수 없다(사용법 오류).
  방지 장치를 통과하지 못하면(NOT_RUN) 기록 파일을 읽지도 않는다.
- 옵션을 생략하면 기존 동작 그대로다: 대조 참조가 없어 `CONTROL_REFERENCE_MISSING`만 남는다.
- 파일에서 읽은 값은 전부 `unknown`으로 다루고 소비하는 필드를 하나씩 검사해 새 객체로 옮긴다(타입 단언으로 `RunRecord`라고
  간주하지 않는다). 읽기 실패·깨진 JSON·UTF-8 오류·크기 초과(16 MiB)·지원하지 않는 스키마·필드 누락·잘못된 타입은 던지지 않고 거절한다.
- 수락 조건: control 실행 기록이고(target 기록은 거절), 출처 `real`·trust `REAL_UNREVIEWED`(stub·SYNTHETIC 거절), 그리고 저장된
  `reference_qualification`을 믿지 않고 기록의 사실로 `qualifyControlRun`을 **다시 돌린 자격이 충족**이며 저장된 선언(`eligible`과
  요구별 충족 표시)이 재계산과 어긋나지 않을 것 — 측정 `COMPLETE`, 대조 단언 `PASS`, N0 확정, 지문 값과 결합 완비, 음성 대조 두 층
  16쌍이 정확히 하나씩 `PASS`이고 같은 결합. `eligible:true`를 선언해도 사실이 받쳐 주지 않으면 거절한다.
  - **음성 대조 `PASS`의 근거**(`qualifyControlRun`): 기록의 `expected`가 현재 `NEGATIVE_CONTROL_TABLE`의 기준과 같아야 한다 — 엔진은
    `spec.expected`, 사전 검사는 `spec.preflight.status`이며 두 층의 기대 상태는 같다고 가정하지 않는다(R9: 엔진
    `ISOLATION_VIOLATION`, 사전 검사 `SETTINGS_MISMATCH`). `observed`는 `null`이 아니고 그 기대 상태와 같아야 한다. 어긋나면
    관측을 보정하거나 `PASS`로 덮어쓰지 않고 거절하며, 거절 상세에 `R1:engine(observed-null)`·`(observed)`·`(expected)` 같은
    (id, 층) 토큰을 남긴다. target 쪽 사실 확인(`checkControlReferenceFacts`)은 이 검사를 하지 않는다 — 참조 요약은
    `expected`·`observed`를 싣지 않으므로, 근거는 전체 기록을 보는 자격 계산과 이 어댑터에서 확인한다.
  - **세부 결과와 요약 상태의 모순 거절**(기록의 자기 일관성만 본다): `COMPLETE`·`NOT_RUN` 측정에 `reasons`가 있으면
    `MEASUREMENT_REASONS_INCONSISTENT`(기록 생성 계약과 같다). `control_assertions.checks`는 항목마다 `id`·`kind`·`file`·`status`·
    `detail`을 검사하고, 사례 검사(A1·A3)가 하나도 없으면 `ASSERTION_CHECKS_EMPTY`다(목록이 갖춰야 할 모습은 다음 항목이 기대 사례로 정한다). `design_errors`는 문자열 배열이며 비어
    있지 않으면 `ASSERTION_DESIGN_ERRORS(개수)`다(내용은 사유에 옮기지 않는다). 저장된 `control_assertions.status`는 세부 결과
    (검사·음성 대조·설계 오류)로 계산한 값과 같아야 하며 다르면 `ASSERTION_SUMMARY_MISMATCH(stored=…, derived=…)`다. 계산 규칙은
    `control.ts`의 `summarizeControlAssertions` 하나이고 `evaluateControlAssertions`도 같은 함수를 쓴다. FAIL·REVIEW·NOT_RUN인
    세부 검사(A1~A4·PAIR 어느 종류든)와 FAIL인 음성 대조 항목, 설계 오류는 전체 `PASS`로 인정하지 않는다.
  - **검사 목록의 완전성**(기록의 자기 일관성): 기록의 `checks`는 **기대 사례에서 도출한 필요한 검사 목록**과 `(id, kind, file)`의
    다중집합으로 같아야 한다. 기대 사례는 하네스가 쓰는 `data/control-expectations.json`이며 대조 지문(`control_sha256`)을 계산할 때
    읽는 파일과 같은 입력이다(`--repo`에서 찾지 않고, 기록이 주장하는 목록이나 검사 개수를 기준으로 삼지 않으며, 별도의 기대 목록
    파일도 없다). 도출 규칙은 `control.ts`의 `requiredControlChecks` 하나다: 정상 사례(`normal`이거나 `expect_zero`)는 A3 하나,
    그 밖의 사례는 A1·A2이고 금지 ID가 있으면 A4가 더해지며, 짝이 있는 양성마다 PAIR(`PAIR:<계열>`, file은 양성 사례) 하나다.
    `evaluateControlAssertions`가 검사를 만들 때도 같은 계획(`planControlChecks`)을 순회하므로 생성과 검증이 갈라지지 않는다. 개수는
    상수가 아니다(기대 사례가 바뀌면 필요한 검사 목록도 따라 바뀐다). 순서만 다른 목록은 수락하고, 아래는 거절한다:
    `CHECKS_MISSING(id…)`(필수 검사 누락), `CHECKS_DUPLICATE(id…)`(같은 검사가 둘 이상 — 개수가 같아도 구성이 다르면 거절),
    `CHECK_IDENTITY_MISMATCH(id…)`(필수 id인데 kind·file이 다른 잘못된 조합), `CHECKS_UNEXPECTED(checks[i]…)`(필수가 아닌 검사 —
    기록이 주장한 문자열은 사유에 옮기지 않고 위치만 적는다). 한 토큰에는 6개까지 보이고 나머지는 `+N`이다. 검사 결과(`status`)는
    기대에서 채우지 않는다 — 기록이 가진 값을 그대로 쓰고 요약과의 모순은 위 검사가 본다.
  - **기대 입력을 읽거나 검증하지 못하면 수락하지 않는다**: 기대 파일이 없거나 읽기·JSON·스키마·사례 필드(`path`·`kind`·`family`·
    `pair`·`forbidden`·`expect_zero`, `path` 중복, 사례 0개)가 맞지 않으면 기록을 보기 전에 `EXPECTATIONS_UNAVAILABLE(READ_FAILED
| INVALID_JSON | NOT_AN_OBJECT | SCHEMA_UNSUPPORTED | INVALID_CASES(...))`로 거절한다. 불완전한 검증으로 수락하는 경로는 없다.
    하네스도 같은 파일을 고정 입력 단계에서 읽으므로, 이때 target 실행은 서버를 띄우기 전에 하드 실패한다.
- 수락한 요약은 기존 `toControlReference`로 만들고(자격은 재계산한 값), target 판정이 **이번 실행의** 핀·도구·규칙·하네스·대조 지문과
  결합을 다시 맞춘다. 기록의 지문을 이번 실행의 지문으로 바꾸거나, 이번 실행이 관측하지 못한 값(도구 버전·휠·결합)을 기록의
  값으로 채우지 않는다.
- 거절하면 참조 없이 진행한다: 사유 `CONTROL_REFERENCE_RECORD_REJECTED`(상세 = 이유 토큰과 필드 경로, 값 없음)와
  `CONTROL_REFERENCE_MISSING`이 함께 남고 대표 상태는 `CONTROL_MISSING`이며 `COMPLETE`가 될 수 없다. 출력 JSON의
  `control_record`에 경로·수락 여부·거절 이유가 있다.
- **한계**: 기록 파일은 서명되어 있지 않다. 어댑터는 기록의 자기 일관성과 이번 실행과의 지문 일치를 확인할 뿐 파일이 실제 Semgrep
  실행에서 나왔다는 것은 증명하지 못한다(출처 위조는 막지 못한다). 자기 일관성에는 위의 세 검사(음성 대조 `PASS`의 근거, 세부
  결과와 요약의 모순, 검사 목록의 완전성)가 포함되지만, 서명·출처 인증 체계나 원시 트랜스크립트 전체 재검증은 하지 않는다 —
  완전한 목록의 각 검사 `status`가 실제 관측에서 나왔는지는 확인하지 않으므로, 위조자가 `checks`·`negative_controls`·요약을 서로
  맞게 꾸미면 이 어댑터로는 구별할 수 없다. 음성 대조를 실행해 기록하는 코드는 이제 있지만(아래 '음성 대조 실행기와 기록 연결')
  실제 엔진으로 실행한 적이 없고 R9 엔진 층은 계약 충돌로 `NOT_RUN`에 고정되어, 이 저장소가 만든 어떤 기록도 수락 조건을 채우지 못한다 —
  수락 경로는 시험용 합성 기록으로만 시험했다. 엔진 진단 실행의 `run.json`(`resources.engine_diagnostic`)은 정상 control 실행이 아니므로
  `DIAGNOSTIC_RUN`으로 거절한다.

종료 코드: 0 통과, 1 불일치·거부·실패(정리에 실패해 잠금이 남은 경우 포함), 2 사용법 오류, 3 NOT_RUN(실행 방지 장치).

## 공유 실행 잠금과 루프백 메트릭 수신기

실제 실행 전에 필요한 두 자원이다. 둘 다 이 변경에서 구현했고, 실제 Semgrep은 설치하지도 실행하지도 않았다.

### 공유 실행 잠금

ADR C0 (e)의 "실행 잠금을 얻었다"를 실행 사이의 상호 배제로 구현한다. 코어는 `run-lock.ts`, 실제 파일 시스템 어댑터는
`run-lock-node.ts`다.

- **잠금 범위**: 서버가 스캔하는 **트리 하나**다. target은 `--scan-root`, control은 `--control-tree-root`. 같은 트리를 가리키는 실행은
  `--run-id`·`--evidence-root`·`--mode`가 달라도 같은 잠금을 두고 부딪힌다. 다른 트리는 서로 막지 않는다. 한쪽이 다른 쪽의
  하위 폴더인 겹치는 트리는 서로 막지 않는다(범위 밖).
- **경로 정규화** (이 규칙이 "같은 트리"의 정의다):
  1. 절대 경로로 만든다(상대 경로는 현재 작업 폴더 기준). **`..`와 `.`는 정리하지 않는다.** 심볼릭 링크를 따라간 뒤의 `..`는 링크 대상의
     부모를 가리키므로(Linux·macOS), 링크를 풀기 전에 `..`로 앞 칸을 지우면 실제로 쓰는 곳과 다른 트리를 잠그게 된다.
  2. **원문 경로의 존재하는 가장 긴 접두**를 운영체제 `realpath`로 푼다(심볼릭 링크·Windows junction·8.3 짧은 이름·대소문자 표기, 그리고
     `..` — 해석 규칙은 운영체제가 정한다. Windows는 `..`를 먼저 지우고 Linux·macOS는 링크를 푼 뒤 적용한다). 접두 뒤의 아직 없는
     칸은 `.`·`..`를 사전식으로 접어 붙인다. 단 `..`를 접었으면 **접힌 경로(이제 `..`가 없다)를 운영체제에 한 번 더 푼다** — 예를 들어
     `a/없음/../링크/x`는 쓰기(`mkdir -p`)가 `없음`을 만든 뒤 `..`로 `a`에 돌아와 `링크`를 따라가므로, 접은 `a/링크/x`를 그대로 키로 삼으면
     링크 대상이 아닌 다른 트리를 잠그게 된다. 트리가 아직 없어도 부모가 같으면 같은 키가 된다.
     **안전하게 풀 수 없는 경로는 풀지 않고 거절한다**(`TREE_UNRESOLVABLE`, 잠금을 얻지 않는다): 끊어진 링크(대상이 없는 심볼릭 링크·junction,
     `DANGLING_LINK`), 존재하는 접두 위로 올라가는 `..`(`UNRESOLVABLE_DOTDOT`), Windows의 드라이브 상대 경로(`DRIVE_RELATIVE`).
  3. 구분자를 `/`로 통일하고 끝의 `/`를 떼고 유니코드 NFC로 맞춘다.
  4. 대소문자를 구분하지 않는 플랫폼(win32·darwin)은 소문자로 접는다. 접어서 같아지는 서로 다른 폴더는 같은 잠금을 쓰게 된다(과도하게
     막는 쪽이라 안전하다). 리눅스는 접지 않는다.
  5. 키 = `sha256("semgrep-lsp-tree-lock/1\n" + 정규화한 경로)`. 루트 폴더는 트리로 잠글 수 없다.
- **잠금 파일의 위치**: 트리의 **부모 폴더**의 `semgrep-lsp-tree-<키 앞 32자>.lock`이다. 경로만으로 정해지므로 증거 폴더가 달라도 같은
  파일을 가리킨다. 트리 안에는 아무것도 만들지 않는다(스캔 트리는 E에 해당하는 파일만 담는다). 부모 폴더가 없으면 만든다.
- **획득**: `open(path, "wx")`(O_CREAT | O_EXCL) 한 번이다. 있으면 실패하므로 프로세스 사이에서 원자적이다. 기다리거나 다시 시도하지
  않고, 이미 있으면 거절한다. 같은 실행이 같은 트리를 두 번 잡는 것(재진입)도 거절한다.
- **소유자 정보**: 잠금 파일은 JSON 한 줄이다 — 스키마(`semgrep-lsp-run-lock/1`), 무작위 128비트 토큰, `run_id`, `mode`, `pid`,
  `hostname`, `acquired_at`, `tree_key_sha256`. 내용을 쓰다 실패하면 방금 만든 불완전한 파일을 지우고 실패로 끝낸다.
- **해제**: 파일을 읽어 **자기 토큰**이 든 것만 지운다. 다른 실행의 잠금(`OTHER_OWNER`)·읽을 수 없는 파일(`UNREADABLE`)·이미 없는
  파일(`MISSING`)은 건드리지 않고 사유만 돌려준다. 지우기에 실패하면 해제한 것으로 표시하지 않는다(`FAILED`).
- **정리 경로**: CLI의 `finally`가 정상 종료, 사전 검사 거부, 예외, 취소(`AbortSignal`) 어느 쪽이든 해제한다. 해제에 실패하면 출력의
  `cleanup.lock`에 `NOT_RELEASED`·남은 잠금 파일 경로·복구 안내를 싣고 종료 코드를 1로 한다.
- **증거 표지와의 구분**: 증거 폴더의 `run.marker`(옛 이름 `run.lock`)는 같은 증거 폴더를 두 번 쓰지 않게 하는 **실행별 표지**일 뿐
  공유 잠금이 아니다. `lockHeld`는 공유 잠금을 얻었고 **표지도 만들었을 때만** true다. 얻지 못했거나 오류이거나 표지를 못 만들었으면
  true로 보정하지 않고 `LOCK_NOT_ACQUIRED`로 거부하며, 사유 상세에 `HELD_BY_OTHER`·`OWNER_UNREADABLE`·`TREE_UNRESOLVABLE`·
  `ACQUIRE_FAILED`·`EVIDENCE_MARKER_NOT_CREATED` 같은 토큰만 붙인다(경로·소유자 없음).
- **잠금이 없으면 서버 트리를 만들거나 바꾸지 않는다**: `runHarness`는 `lockHeld === true`일 때만 서버 트리(target은 스캔 트리, control은
  대조 트리)를 준비한다. `false`(잠금 거절·획득 오류·증거 표지 생성 실패)와 `null`(확인하지 못함)에서는 트리를 만들지도, 폴더를 만들지도,
  파일을 쓰지도 않고, 다른 실행의 잠금 파일도 건드리지 않는다. 이 보장은 CLI가 아니라 하네스에 있어서 `runHarness`를 직접 부르는
  호출자도 같다. 거절 사유와 자기 증거 폴더의 기록은 그대로 남는다. 잠금이 없어 준비를 보류한 **빈** 트리는 사전 검사가 어긋남으로
  판정하지 않는다(그러면 `MANIFEST_MISMATCH`가 진짜 원인인 `LOCK_NOT_ACQUIRED`(`ENV_MISMATCH`)를 대표 상태에서 밀어낸다). 이미 파일이
  있는 트리는 예전처럼 **읽기만** 하고 판정한다. 대조 정적 입력(.in)의 바이트 확인은 트리와 무관한 사실이라 그대로 한다. 사전 검사는
  `lockHeld`가 true이면 `treeNotPrepared`를 무시하고 트리를 검증한다.
- **증거 폴더는 서버 트리 밖이어야 한다**: `<evidence-root>/<run-id>`가 서버 트리와 같거나 그 안이면 CLI는 `run.marker`·`semgrep-state`를
  만들기 전, 잠금을 얻기 전에 사용법 오류(2)로, `runHarness`는 증거를 쓰기 전에 하드 실패(`config`)로 **독립적으로** 거절한다.
  `lockHeld`가 `true`여도 같다(잠금을 가졌어도 증거를 서버 트리 안에 쓰는 설정은 거절한다). 안에 쓰면 잠금이 없는 실행도 증거 파일로
  다른 실행의 트리를 바꾸게 된다.
  - **판단 기준은 실제 파일 접근과 같은 경로 의미다**, 문자열이 아니다. 증거를 쓰게 될 그 파일 시스템 포트가 두 경로를 실제로 접근할
    자리로 풀어(`FsPort.physicalKey`) 키끼리 포함 관계를 본다. 실제 파일 시스템은 위의 공유 잠금과 **같은 해석**(`canonicalTreePath`)을
    쓴다 — 상대·절대 경로, `.`·`..`, 심볼릭 링크·junction을 풀고, `..`를 링크보다 먼저 지우지 않으며, 아직 없는 증거 하위 폴더는 존재하는
    가장 긴 접두를 기준으로 붙인다. 그래서 `<base>/outside/../tree/evidence`와 `<base>/alias/evidence`(`alias → tree`)도 서버 트리 안으로
    판정된다. 이름 접두만 같은 별도 폴더(`tree-evidence`)와 나란한 폴더는 안이 아니다.
  - **안전하게 풀 수 없으면 거절한다**(끊어진 링크, 존재하는 접두 위로 올라가는 `..`, Windows 드라이브 상대 경로, 그 밖의 해석 오류):
    증거 경로뿐 아니라 서버 트리 경로가 풀리지 않는 경우도 쓰기 전에 거절하며, "겹치지 않는다"고 가정하지 않는다. 호출자가 "겹치지
    않는다"를 알려 주는 옵션은 없다. **동작 변경**: 서버 트리 경로가 풀리지 않는 경우(예: `--scan-root`가 끊어진 링크)는 예전에는 공유 잠금이
    `ERROR`·`TREE_UNRESOLVABLE`이 되어 `LOCK_NOT_ACQUIRED` 증거 레코드가 남았지만, 이제 CLI는 증거를 쓰기 전에 사용법 오류(2)로 끝나고
    증거 레코드를 남기지 않는다(풀 수 없는 경로 옆에 증거를 쓰지 않기 위해서다).
  - **확인은 읽기만 한다**: `realpath`·`readlink`만 쓰므로 보호 트리 안에 폴더나 탐침 파일을 만들지 않고, 다른 실행의 잠금 파일도 건드리지
    않는다.
- **`--run-id`는 경로를 만들기 전에 검증한다**: `--run-id`는 증거 폴더 이름(`<evidence-root>/<run-id>`)이 되어 `run.marker`·`semgrep-state`·증거
  파일의 경로에 들어간다. CLI는 값을 받은 직후, 증거 경로를 만들거나 서버 트리와의 겹침을 보거나 대조 기록을 읽거나 잠금·수신기·git·프로세스
  포트를 얻기 **전에** 하네스와 같은 순수 규칙으로 거절한다 — 영숫자로 시작하고 영숫자·`.`·`_`·`-`만 쓴 1~128자
  (`/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`). `../escaped`·`a/b`·`a\b`·`.`·`..`·129자 이상은 사용법 오류(2)이고, 이때 파일 시스템에는 실행 방지 장치의
  실행 파일 존재 확인(읽기)밖에 호출하지 않아 증거 루트 안팎 어디에도 표지·폴더·잠금이 생기지 않는다(예전에는 `<base>/escaped/run.marker`와
  `semgrep-state`가 만들어진 뒤에야 하네스가 거절했다).
  - **규칙은 한 곳에 있다**: `run-id.ts`의 `isValidRunId`를 CLI, `runHarness`(`config` 하드 실패, 직접 호출하는 호출자도 그대로), 대조 기록 읽기의
    `run_id` 필드 검사가 함께 쓴다. 다른 파일에 정규식을 복제하지 않는다(구조 시험이 확인한다).
  - **순서**: 실행 방지 장치가 인자 검사보다 먼저다. 장치를 통과하지 못하면 잘못된 `--run-id`여도 `NOT_RUN`(3)이고 아무 포트도 만들지 않는다.
    오류 문구는 입력 값을 되풀이하지 않는다.
- **잠금은 "하네스끼리의" 상호 배제일 뿐이다.** 잠금을 얻었다는 이유로 `foreignServerProcesses`를 0으로 채우지 않는다. 하네스 밖에서 같은 트리를
  쓰는 서버 프로세스는 잠금이 막지 못하므로, 별도의 **조회 시점 관측**이 그 값을 채운다 — 아래 "같은 트리의 다른 서버 프로세스 관측".
  관측이 0건으로 확정되지 않으면 서버 트리를 준비하지 않는다(`lockHeld`가 true여도).

#### 오래된 잠금 복구

실행이 해제하지 못하고 끝나면(강제 종료·정전·`SIGKILL`) 잠금 파일이 남는다. 하네스는 **소유자의 생사를 확인하지 않고 자동으로 지우지
않는다** — 살아 있는 실행의 잠금을 잘못 지우면 두 실행이 같은 트리를 쓰게 되기 때문이다. 새 실행은 `REFUSED`로 거절되고 출력의 `lock`에
잠금 파일 경로(`path`)와 소유자(`holder`: `run_id`·`pid`·`hostname`·`acquired_at`)가 나온다. 소유자를 읽을 수 없으면
(`OWNER_UNREADABLE`, 만들다 만 파일 등) `holder`는 null이다. 복구는 운영자가 직접 한다:

1. 거절 출력의 `lock.path`와 `lock.holder`를 확인한다.
2. `hostname`이 이 컴퓨터인지 보고, `pid`의 프로세스가 살아 있는지 운영체제 도구로 확인한다(Windows `tasklist /FI "PID eq <pid>"`, POSIX
   `ps -p <pid>`). 살아 있으면 그 실행이 끝나기를 기다린다. pid는 재사용될 수 있으니 `acquired_at`과 프로세스 시작 시각도 본다.
   다른 컴퓨터가 같은 폴더를 공유한다면 그 컴퓨터에서 확인한다.
3. 같은 트리를 쓰는 `semgrep` 서버 프로세스가 없음을 확인한다.
4. 위가 모두 확인되면 `lock.path`의 잠금 파일을 직접 지운다. 하네스에는 이를 대신하는 옵션이 없다(강제 옵션도 없다).
5. 같은 `--run-id`를 다시 쓰려면 그 증거 폴더가 비어 있어야 한다(이미 있는 증거는 덮어쓰지 않는다). 새 `--run-id`를 권한다.

#### 알려진 한계

- 해제는 "토큰을 읽고 지우기"라서, 읽은 뒤 지우기 전에 운영자가 내 잠금을 지우고 다른 실행이 새로 잡는 짧은 틈이 이론상 있다. 자동
  삭제가 없으므로 사람이 활성 잠금을 손으로 지울 때만 가능하다.
- 겹치는 트리(한쪽이 다른 쪽의 하위 폴더)는 막지 않는다.
- `HarnessOptions.lockHeld`는 맨 불리언이라, `runHarness`를 직접 부르는 호출자가 **다른 트리의 잠금을 쥔 채** `true`를 주는 것은 하네스가
  검증할 수 없다. 잠금과 서버 트리의 대응은 호출자(CLI는 `serverTree`로 맞춘다)의 책임이다.
- 경로 문자열로 키를 만들기 때문에 운영체제가 같은 폴더로 보여 주지만 `realpath`가 하나로 합치지 않는 별칭은 잡지 못한다 — Linux의
  바인드 마운트, 대소문자를 구분하지 않는 Linux 파일 시스템(ext4 casefold, vfat), macOS의 firmlink. 이번 변경 이전부터 있던 한계다.
- 경로를 푼 **뒤**에 일어나는 변경은 막지 못한다. 잠금을 얻은 다음에, 또는 증거 겹침을 확인한 다음에 누가 경로 안의 폴더를 링크로 바꾸면
  키가 가리키던 자리와 실제로 쓰는 자리가 달라질 수 있다(풀기와 쓰기 사이의 틈). 실행 전부터 고정된 경로의 포함 관계만 보장한다.
- `--run-id` 검사는 **형식만** 본다(`run-id.ts`). 형식은 맞지만 Windows에서 폴더 이름으로 특별하게 다뤄지는 값 — 예약 장치 이름(`CON`·`NUL`·
  `COM1`…)이나 끝이 `.`인 값(`a.`는 Windows에서 `a`와 같은 이름이 된다) — 은 막지 않는다. 이 동작은 확인하지 않았다.
- 증거 겹침 검사는 **이 실행의 서버 트리**와 증거 폴더의 관계만 본다. 증거 폴더가 다른 실행이 잠근 **다른** 트리 안에 있는 설정은 이
  실행이 알 수 없어 막지 못한다. 판정은 증거를 쓰는 파일 시스템 포트의 의미를 따르므로, 서로 다른 포트를 섞어 쓰는 호출자(시험의 합성
  조합 등)에서는 포트마다 다른 의미로 풀린다 — 운영 CLI는 한 개의 노드 파일 시스템을 쓴다.
- 잠금이 없을 때 **이미 파일이 있는** 트리는 읽기만 하고 판정한다. 그 트리를 잠금 소유자가 쓰는 중이면 `LOCK_NOT_ACQUIRED`와 함께
  트리 어긋남 사유(`MANIFEST_MISMATCH` 계열)가 같이 나오고 대표 상태가 `MANIFEST_MISMATCH`가 될 수 있다. 파일은 바뀌지 않는다.
- 하네스의 "트리가 비어 있는가" 판단(`hasFiles`)은 나열 오류(트리 안의 심볼릭 링크, 권한 오류)도 "비어 있음"으로 본다. 잠금이 없으면 그
  경우 트리 판정을 건너뛰고 `LOCK_NOT_ACQUIRED`만 남아 진단이 줄어든다(서버는 어느 쪽이든 뜨지 않는다). 잠금이 있고 스캔 루트가 심볼릭
  링크이면 링크 대상에 쓰며 — 잠금 키도 링크 대상 기준이라 같은 자리를 잠근다 — 이 동작은 이번 변경 이전부터 있었다.
- 배타 생성(O_EXCL)을 보장하지 않는 파일 시스템(일부 네트워크 공유 등)에서는 상호 배제를 보증하지 않는다.

### 루프백 메트릭 수신기

ADR C9·D9의 "하네스가 연 루프백 수신기"다. 어댑터는 `metrics-node.ts`다(이 디렉터리에서 `node:http`를 가져오는 유일한 운영 소스).

- **바인딩**: `127.0.0.1`과 OS가 정한 포트(0)뿐이다. 호스트 이름·모든 인터페이스(`0.0.0.0`·`::`)·고정 포트를 쓰지 않는다. 열린 주소가 실제로
  `127.0.0.1`이 아니면 닫고 `NOT_LOOPBACK`으로 실패한다.
- **자식 환경 연결**: 실제로 열린 주소(`http://127.0.0.1:<포트>`)를 `SEMGREP_METRICS_URL`·`SEMGREP_VERSION_CHECK_URL`·`SEMGREP_APP_URL`에 넣는다.
  수신기를 열지 못했으면 아무것도 듣지 않는 자리표시 주소(포트 9)가 들어가고, 이때 판정은 관측 실패다.
- **준비 순서와 누적 관측**: 수신기는 자식 프로세스를 띄우기 전에 준비된다. 요청은 정리(닫기)까지 누적해서 센다.
- **판정 시점의 관측**: 하네스는 시작 시점의 숫자가 아니라 **판정하는 시점**(세션이 끝난 뒤)에 `observe()`로 누적 관측을 읽는다
  (`HarnessOptions.metricsReceiver`). 수신기를 주지 않는 호출자는 기존처럼 `metricsReceiverHits`를 쓴다.
- **건수의 정의**: `hits = max(수락한 연결 수, 요청 수 + 잘못된 요청 수)`. 접속만 하고 아무것도 보내지 않은 연결도 센다(보수적). 한 연결의
  여러 요청은 요청 수로 센다.
- **관측 실패는 0건이 아니다**: 열지 못함(`BIND_FAILED`)·루프백이 아님(`NOT_LOOPBACK`)·열린 뒤의 서버 오류(`SERVER_ERROR`)·닫기 전에
  서버가 닫힘(`CLOSED_EARLY`)·`observe()`가 던짐(`OBSERVE_FAILED`)은 모두 `hits=null`이고 `METRICS_RECEIVER_NOT_OBSERVING`
  (ISOLATION_VIOLATION)으로 이어진다. 요청이 1건 이상이면 `METRICS_RECEIVER_HIT`다.
- **기록하지 않는 것**: 요청 본문·헤더·URL·토큰은 읽지도 저장하지도 않는다(응답은 내용 없는 204이고 본문은 버린다). 남기는 것은 연결 수·요청
  수·잘못된 요청 수·상태뿐이다.
- **정리**: 닫으면 새 접속을 받지 않고, 열려 있는 소켓을 모두 끊고, 서버가 닫힐 때까지 기다린다. 닫은 뒤에도 관측을 읽을 수 있다. CLI는
  판정 뒤 닫기까지 들어온 요청도 `cleanup.metrics_receiver.hits_after_judgment`로 따로 알린다(판정에는 반영하지 못한 건수).
  닫기에는 제한 시간(기본 5초)이 있다 — 넘으면 `CLOSE_TIMEOUT`으로 거부되어 `cleanup.metrics_receiver.closed`가 false가 되지만, 뒤따르는 잠금 해제는
  막지 않는다.
- **의미의 한정**: 0건은 "**이 수신기에서 관찰한 요청이 없었다**"일 뿐 다른 목적지로의 통신이 없었다는 증거가 아니다. 실제 Semgrep이
  `SEMGREP_METRICS_URL` 등을 읽는지는 확인하지 않았다(**미확인**, ADR U15). 서버가 돌지 않았거나 관측이 깨진 실행은 `not_executed.
metrics_receiver_observation`을 `NOT_RUN`으로 두고, 서버가 돌았고 관측이 유효한 경우에만 `UNVERIFIED`(관측했으나 서버가 환경변수를 읽는지
  미확인)로 적는다.

### 증거에 남는 것

`run.json`의 `resources`(자원을 연결한 호출자가 있을 때만 있다. 없으면 필드 자체가 없어 기존 레코드와 같다)에는 판정 시점의 요약이 있다.
정리(해제·닫기)의 결과는 증거가 쓰인 뒤에 일어나므로 증거가 아니라 CLI 출력의 `cleanup`에 있다.

| 위치                         | 필드                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `resources.run_lock`         | `scope`(`server-tree`), `tree_key_sha256`, `state`(`ACQUIRED`·`REFUSED`·`ERROR`), `reason`, `evidence_marker`(`CREATED`·`NOT_CREATED`)         |
| `resources.metrics_receiver` | `bind`, `state`(`LISTENING`·`CLOSED`·`FAILED`), `failure`, `hits`(실패면 null), `connections`, `requests`, `client_errors`                     |
| CLI 출력 `lock`              | 위 요약에 더해 잠금 파일 `path`, 거절 시 `holder`, `error_code`, `recovery` (증거에는 싣지 않는다)                                             |
| CLI 출력 `cleanup`           | `lock`(`RELEASED`·`NOT_RELEASED`·`NOT_ACQUIRED`, 실패 시 `path`·`recovery`), `metrics_receiver`(`closed`, `final_hits`, `hits_after_judgment`) |

경로·소유자 정보·토큰·본문은 증거 어디에도 없다.

### 생명주기

```
방지 장치 → 인자 → 공유 잠금 획득(서버 트리) → 증거 표지(run.marker) → 루프백 수신기 시작 → [기록 읽기] → 도구 관측(버전·휠) →
다른 서버 프로세스 관측(조회 시점, 읽기만) → 하네스(잠금을 가졌고 다른 서버가 0건일 때만 서버 트리 준비 → 사전 검사 → 세션 → 판정 시점 관측 →
증거 쓰기) → finally: 수신기 닫기 → 잠금 해제 → 출력(cleanup 포함)
```

### 검증한 플랫폼

| 항목                                                             | 상태                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 11 Home 10.0.26200, 로컬 NTFS, Node v24.22.1             | **검증함.** 아래 시험을 모두 이 환경에서 실행했다 — 실제 디스크 위의 잠금(원자적 생성 50회 동시 시도, junction 별칭, 같은 트리 동시 경쟁), 서로 다른 Node 자식 프로세스 6개의 경쟁(3라운드), 강제 종료한 소유자의 오래된 잠금, 실제 루프백 소켓의 수신기(0건·1건 이상·지연 요청·열린 연결 정리), CLI·하네스 통합 |
| Linux, macOS, WSL                                                | **검증하지 못했다.** 정규화의 POSIX 분기(대소문자 구분, 심볼릭 링크)는 `caseInsensitive` 옵션을 바꿔 논리만 확인했고 해당 운영체제에서 실행하지 않았다. 자식 프로세스 시험이 쓰는 Node의 TypeScript 직접 실행은 Node 24에서만 확인했다                                                                           |
| FAT/exFAT, SMB/NFS 등 네트워크 파일 시스템, 클라우드 동기화 폴더 | **검증하지 못했다.** 배타 생성의 원자성을 보증하지 않는다                                                                                                                                                                                                                                                        |

#### 잠금 외부 검토 반영(트리 보호·`..` 경로)의 검증 범위

외부 검토가 Linux·Node 24.19.0에서 재현한 두 결함의 수정이다. 이 컴퓨터에서 **실제로 확인한 것**과 **하지 못한 것**을 나눈다.

- **실제 디스크(Windows 11 + 로컬 NTFS, junction)에서 확인함**
  - 트리 보호: 다른 실행이 잠금을 쥔 서버 트리가 target·control 각각에서 **비어 있을 때와 이미 파일이 있을 때** 모두, 하네스를 직접 부르는
    경우(`lockHeld` false·null)와 CLI를 거치는 경우(잠금 거절·잠금 파일 생성 오류·트리 경로 해석 오류·증거 표지 생성 실패) 모두에서 트리의
    존재 여부·폴더·파일 목록·파일 바이트와 소유자의 잠금 파일이 실행 전후에 같다. 잠금을 가진 정상 소유자는 트리를 준비하고 `COMPLETE`까지
    간다.
  - 경로: junction이 낀 경로에서 "잠금이 예측한 자리 == 원문 경로로 실제 만들었을 때 닿는 자리"가 시험한 조합(링크 뒤의 `..`, 아직 없는
    대상, 링크의 링크, 없는 칸을 지나는 `..`, 끝의 구분자, 상대 경로)에서 성립한다. 끊어진 junction은 거절하고 잠금 파일을 만들지 않는다.
- **메모리 모의로만 확인함 (Linux·macOS 디스크의 증거가 아니다)**: 외부 검토가 보고한 결함 구조(`physical/branch`, `physical/tree`,
  `route/link → physical/branch`)에서 `physical/tree`와 `route/link/../tree`가 같은 키·같은 잠금 파일이 되고 두 번째 획득이 거절된다는 것.
  **Windows는 운영체제가 `..`를 먼저 지우므로(`route\link\..\tree`가 곧바로 `route\tree`) 이 결함을 실제 디스크로 재현할 수 없다.**
  그래서 "링크를 푼 뒤의 `..`는 대상의 부모"라는 POSIX 규칙을 `testing/posix-path-ops.ts`의 메모리 표로 모의했다. 이 모의는 코드가 그
  규칙을 따른다는 것만 보이며, 규칙 자체가 맞는지는 운영체제가 정한다.
- **확인하지 못함**: Linux, macOS, WSL의 실제 디스크(이 컴퓨터에 없다 — 해당 운영체제에서 `run-lock-node.test.ts`를 돌려야 한다), Windows의
  디렉터리 심볼릭 링크(권한이 필요해 junction만 확인했다), 네트워크 파일 시스템.

#### 증거 경로 겹침 검사 우회(외부 재검토 2회차)의 검증 범위

외부 재검토가 Linux·Node 24.19.0에서 재현한 우회 — 다른 실행이 서버 트리의 잠금을 쥔 상태에서 `--evidence-root`를
`<base>/outside/../tree/evidence`(A) 또는 `<base>/alias/evidence`(`alias → tree` 링크, B)로 주면 문자열 비교가 겹침을 놓쳐 보호 트리 안에
증거 9개가 써지던 것 — 의 수정이다. 앞의 `..` 잠금 키 결함과 달리 **A와 B는 이 컴퓨터(Windows)의 실제 디스크에서 재현되고 수정 전에
시험이 실패했다.**

- **실제 디스크(Windows 11 + 로컬 NTFS, junction)에서 확인함**: A·B 각각을 CLI(`REFUSED`·`LOCK_NOT_ACQUIRED`가 될 상황에서 `run.marker`·
  `semgrep-state` 전에 사용법 오류)와 `runHarness` 직접 호출(`lockHeld` false·null·**true**)로, 상대 경로와 절대 경로가 같은 위치를 가리키는
  경우, 아직 없는 증거 하위 폴더, 서버 트리와 같은 위치·하위 위치, 링크 아래의 없는 하위 폴더, 풀 수 없는 경로(끊어진 junction)를 모두
  확인했고, 이름 접두만 비슷한 별도 폴더·나란한 폴더·트리 밖 정상 증거 폴더는 기존대로 쓰인다. 모든 경우에 실행 전후 보호 트리의 존재
  여부·폴더·파일 목록·파일 바이트와 부모 폴더 목록, 소유자의 잠금 파일 바이트가 같다.
- **메모리 모의로만 확인함 (Linux·macOS 디스크의 증거가 아니다)**: 링크를 푼 뒤의 `..`는 대상의 부모라는 POSIX 규칙에서의 판정. 예를 들어
  `outlink → elsewhere/sub`일 때 `outlink/../tree/evidence`는 `elsewhere/tree/evidence`(서버 트리 바깥)이고, 사전식으로 접으면 안이라고
  오판한다. `testing/posix-path-ops.ts`의 표로 `createNodeFs({ pathOps })`의 `physicalKey`를 확인했다(`path-containment.test.ts`).
- **확인하지 못함**: Linux 심볼릭 링크의 실제 디스크 동작(이 컴퓨터에 Linux·macOS·WSL이 없다 — 해당 운영체제에서 `path-containment.test.ts`,
  `fs-node.test.ts`, `harness.test.ts`, `cli.test.ts`를 돌려야 한다), Windows의 디렉터리 심볼릭 링크(권한이 필요해 junction만 확인했다),
  네트워크 파일 시스템. 링크를 못 만드는 환경에서는 링크 시험이 `skip`으로 표시되며 검증한 것으로 세지 않는다.

#### `--run-id` 선검증(외부 재검토 3회차)의 검증 범위

외부 재검토가 남긴 한 건 — `--evidence-root <base>/evidence --run-id ../escaped`(서버 트리와 증거 폴더는 겹치지 않음, 방지 장치 통과)에서
하네스가 `runId` 형식 오류로 `HARD_FAILURE`를 돌려주기 **전에** `<base>/escaped/run.marker`와 `semgrep-state`가 만들어지던 것 — 의
수정이다. 이 결함은 경로 의미가 운영체제마다 다른 문제가 아니라 CLI가 값을 검증 없이 경로에 붙인 순서의 문제라서, **이 컴퓨터(Windows)의
실제 디스크에서 재현되었고 수정 전에 시험이 실패했다**(수정 전: 종료 코드 1, `<dir>/escaped` 생성).

- **실제 디스크(Windows 11 + 로컬 NTFS)에서 확인함**: 증거 루트를 `<dir>/evidence`, 서버 트리를 `<dir>/scan`으로 두고 `../escaped`,
  `../../escaped`, `a/b`, `/abs`, `a\b`, `..\escaped`, `C:\x`, `.`, `..`, 점·밑줄·하이픈으로 시작하는 값, 공백·끝의 개행, 전각 영숫자,
  한글, `run:stream`, 129자·300자를 모두 사용법 오류(2)로 확인했다. 매번 `<dir>`(증거 루트 안, `escaped` 같은 밖의 자리, 서버 트리, `*.lock`)와
  그 위 폴더의 목록이 실행 전후에 같고, 파일 시스템 포트 호출은 실행 파일 존재 확인(`exists`) 하나뿐이며 잠금 포트·수신기·프로세스 포트·git
  포트 호출이 없다. 정상 값 1자·128자·`a..b`는 증거(`run.json`)가 `<증거 루트>/<run-id>/`에 실제 디스크로 쓰이고 잠금이 해제된다.
- **메모리 파일 시스템으로 확인함**: 같은 사례 표를 target·control 두 모드, `--run-id=<값>` 형식, `--control-record`를 함께 준 경우(기록 읽기 없음),
  `runHarness` 직접 호출(`config` 하드 실패, 파일 시스템 호출 0건, 문자열이 아닌 값 포함)에 적용했다. 실행 방지 장치가 먼저이므로 장치를
  통과하지 못하는 네 가지 경우에는 잘못된 값이어도 `NOT_RUN`(3)이다.
- **확인하지 못함**: Linux·macOS·WSL의 실제 디스크(이 컴퓨터에 없다 — 이 결함은 경로 의미에 기대지 않아 같은 결과가 예상되지만 측정하지
  않았다), Windows 예약 이름·끝이 `.`인 값의 동작(위 알려진 한계).

### 도구 버전·휠 sha256 관측

`run`은 공유 잠금과 증거 표지를 얻은 실행에서만, 서버(LSP)를 띄우기 **전에** 두 가지를 관측해 하네스의 `toolVersionObserved`·
`wheelSha256Observed`에 넘긴다. 관측하지 못한 값은 `null`이고 사전 검사가 `TOOL_VERSION_UNVERIFIED`·`WHEEL_HASH_UNVERIFIED`로 거부한다 —
핀의 값이나 대조 기록의 값으로 채우지 않는다. 실행 방지 장치와 `--run-id` 검증이 먼저이고, 잠금이 없으면 프로세스도 파일 읽기도 없다.

- **버전 확인 프로세스는 LSP 서버와 별개다.** `--semgrep-bin`(절대 경로, PATH 탐색·자동 설치 없음)을 셸 없이 실행 파일 + 인자 **배열**
  `["--version"]`으로 한 번 실행한다. 증거에는 역할(`process_role: "version-check"`), 이 확인에 쓴 포트의 출처(`provenance`), 종료 정보,
  stdout·stderr 바이트 수, 소요 시간, 자식 정리 결과를 LSP 서버와 따로 남긴다. 환경은 LSP 서버와 같은 규칙(허용 목록의 `SEMGREP_*`만, URL은
  루프백 수신기, 경로는 증거 폴더 안)이되 **상태·로그 폴더는 `version-check-state/`로 따로** 쓴다(서버 로그와 섞이지 않는다). 확인 도중 수신기에
  들어온 요청의 늘어난 건수를 `metrics_hits_during`로 따로 남기고, 판정의 누적 건수에도 그대로 들어간다.
- **해석 계약** (하네스가 정한 것이며 **실제 Semgrep으로 확인하지 않았다**): ① 종료 코드 0이고 신호로 끝나지 않았다 ② 버전은 **stdout에서만** 읽는다.
  stderr는 해석하지 않고 바이트 수만 기록한다(버전이 stderr에만 있으면 관측 실패) ③ stdout은 유효한 UTF-8(BOM 불허)이고 끝의 줄 끝 하나를 뺀
  나머지가 **정확히 한 줄**이다 ④ 그 한 줄이 정확히 `숫자.숫자.숫자`(앞자리 0·접두 `v`·접미·공백 불허)이다. 이 문자열을 그대로 버전으로 쓴다.
  계약에 맞지 않으면 관측 실패이며 이유 토큰이 남는다: `OUTPUT_EMPTY`·`OUTPUT_NOT_UTF8`·`OUTPUT_NOT_SINGLE_LINE`·`OUTPUT_UNRECOGNIZED`·
  `NONZERO_EXIT`·`KILLED_BY_SIGNAL`·`SPAWN_FAILED`·`TIMEOUT`·`OUTPUT_LIMIT_EXCEEDED`·`STREAM_READ_FAILED`·`CANCELLED`.
- **제한·취소·정리**: 시간 30초, stdout 4 KiB, stderr 16 KiB(모두 실측하지 못한 **추정**)와 취소 신호를 지킨다. 제한을 넘기거나 취소되면
  `SIGKILL`로 끝내고 종료를 기다린다(5초). 어떤 경로로 끝나도 마지막에 자식을 `dispose`한다. 정리 결과는 `EXITED`(스스로 끝남)·`KILLED`·
  `KILL_NOT_OBSERVED`(끝냈지만 종료를 확인하지 못함)·`NOT_SPAWNED`이고, `KILL_NOT_OBSERVED`이면 측정이 끝났어도 실행은 실패로 끝난다. 잠금과 수신기는
  기존대로 `finally`에서 정리한다.
- **휠 해시**: `--wheel-artifact <절대 경로>`로 **명시한** 파일 하나의 실제 바이트로 SHA-256을 계산한다(기본 경로·자동 탐색·내려받기 없음). 1 MiB 단위로
  스트리밍하고 크기 상한은 1 GiB(추정)다. 옵션을 주지 않거나, 파일이 없거나(`NOT_FOUND`)·일반 파일이 아니거나(`NOT_A_FILE`)·상한을
  넘거나(`TOO_LARGE`)·읽지 못하거나(`READ_FAILED`)·읽는 도중 크기·수정 시각이 바뀌었거나(`FILE_CHANGED_DURING_READ`)·취소되면 해시 없이 실패한다
  (성공값으로 보정하지 않는다). 변경 확인은 최선의 노력이다 — 크기와 수정 시각을 그대로 둔 채 바이트만 바꾸는 쓰기는 잡지 못한다.
- **일반 파일이 아닌 입력은 열기에서 대기하지 않고 거절한다.** POSIX에서 FIFO를 읽기로 열면 쓰기 쪽이 열릴 때까지 `open(2)`가 운영체제 안에서 대기한다. 이
  대기는 스레드풀에서 일어나 `AbortSignal`로 끊을 수 없고, 바깥 `Promise`만 끊으면 안쪽 열기 작업과 핸들이 남는다. 그래서 대기를 **끊지 않고 생기지
  않게** 했다: 읽기 전용 + `O_NONBLOCK`(+ 터미널 장치가 제어 터미널이 되지 않게 `O_NOCTTY`)으로 열면 쓰기 쪽이 없는 FIFO도 곧바로 열리고, 열린
  핸들의 `fstat`이 일반 파일이 아님을 알려 `NOT_A_FILE`로 거절한다(읽지도 해시하지도 않고 핸들을 닫는다). 심볼릭 링크는 따라가므로 FIFO를 가리키는 링크도
  같다. 일반 파일에는 `O_NONBLOCK`이 아무 영향이 없다(스트리밍 해시·크기 상한·변경 확인·읽기 전용 계약은 그대로다 — 열기 플래그에 쓰기 계열 비트가
  없다). Windows는 FIFO가 없고 플래그가 예전과 같은 `O_RDONLY`라 동작이 바뀌지 않는다. `O_NONBLOCK`이 없는 비-Windows 플랫폼은 막힐 수 있는 열기로
  되돌아가지 않고 열기 전에 `READ_FAILED`로 거절한다. 거절·취소 뒤에는 CLI의 `finally`가 평소처럼 공유 잠금을 해제하고 수신기를 닫는다.
- **관측값과 핀은 따로 기록한다.** `run.json`의 `resources.tool_observation`(선택 필드 — 연결하지 않은 호출자의 기존 레코드는 바이트 단위로 같다)에
  관측 요약과 `pin` 비교(`expected`·`observed`·`comparison`)를 싣는다. 핀의 휠 해시가 `null`이거나 `verified`가 아니면 관측값이 있어도 비교할
  기준이 없다(`PIN_UNVERIFIED`, 사전 검사는 `WHEEL_HASH_UNVERIFIED`). 이 기록은 판정에 쓰이지 않고(판정은 두 관측값만 본다), 하네스는 요약이
  넘긴 관측값과 모순되면 쓰기 전에 `config` 하드 실패로 거절한다. **관측했다는 이유로 `pin.json`의 `verified`나 승인 상태를 바꾸지 않는다.**
- **아티팩트 해시 ≠ 설치 출처.** 휠 해시는 **그 파일의 바이트**에 대한 사실이다. 실행한 `semgrep` 실행 파일이 그 휠에서 설치되었다는 확인(설치 출처 검증)은
  하지 않았고, 증거의 `not_established`에 `executable_provenance: "NOT_VERIFIED"`·`version_output_format: "UNVERIFIED"`로 항상 남긴다.
- **경로는 증거에 싣지 않는다.** 실행 파일·아티팩트 경로와 자식의 출력 원문은 `run.json`에 없다(CLI 출력에만 `wheel_artifact`가 있다).
- **스텁은 스텁으로 남는다.** 버전 확인에 쓴 포트의 출처가 그대로 기록된다. `stub`이면 `trust`는 `SYNTHETIC`이고 실제 Semgrep 검증의 증거가 아니다.
  CLI는 프로세스 포트를 한 번만 만들어 버전 확인과 하네스가 같이 쓴다.
- **서버는 여전히 시작되지 않는다.** `pin.json`의 휠 해시가 `null`·`verified: false`라 실제 실행은 `WHEEL_HASH_UNVERIFIED`로 사전 검사가 거부한다.
  (엔진 음성 대조 실행기는 이후 구현했다 — 아래 '음성 대조 실행기와 기록 연결'. 다만 실제 엔진으로는 실행하지 않았다.)

#### 도구 관측의 검증 범위

- **확인함 (Windows 11 + 로컬 NTFS + Node v24.x)**: 가짜 자식과 실제 Node 프로세스(`testing/stub-version.mjs`)로 정상 출력(`\n`·`\r\n`·줄 끝 없음·stderr
  경고), 예상 밖 출력(접두·`v` 접두·여러 줄·빈 출력·stderr에만 있음), 비정상 종료, 시간 초과, 출력 초과(stdout·stderr), 실행 중 취소, 띄울 수 없는
  실행 파일을 시험했고, 시간 초과·출력 초과·취소 뒤에는 자식 `pid`가 실제로 사라졌다. 셸 메타문자가 든 인자는 한 덩어리로 전달되고 아무것도 실행되지
  않는다. 휠 해시는 임시 파일(빈 파일, 1 MiB 경계, 3 MiB 이상)에서 `node:crypto`로 독립 계산한 값과 같고, 한 비트를 바꾸면 달라지며, 없는 파일·디렉터리·
  잘못된 경로·상한 초과는 해시 없이 실패한다. 읽는 도중의 변경·읽기 오류는 `open`을 주입해 결정적으로 시험했다. CLI → 관측 → 하네스 → `run.json`은 메모리
  파일 시스템과 실제 디스크(실제 잠금·수신기·Node 프로세스 `node --version`)에서 확인했다.
- **FIFO 등 일반 파일이 아닌 입력 — 플랫폼별 검증 범위**
  - **Windows 11 + 로컬 NTFS + Node v24.x에서 확인함**: ① POSIX 열기 의미를 흉내 낸 모델(`testing/posix-open-emulator.ts` — "`O_NONBLOCK` 없이 쓰기 쪽
    없는 FIFO를 읽기로 열면 대기한다"만 따르는 **모델이며 커널의 증거가 아니다**)에서 FIFO·FIFO 링크·링크 사슬·디렉터리가 대기 없이 `NOT_A_FILE`로 거절되고
    핸들·대기 중인 열기·읽기 호출이 남지 않는다 ② 열기가 진행 중인 순간의 취소와 읽는 도중의 취소 ③ 실제 Windows 특수 입력: `\\.\NUL` 문자 장치는
    `NOT_A_FILE`, 서버 없는 이름 있는 파이프 경로는 대기 없이 `NOT_FOUND` ④ CLI 전체 경로(`--wheel-artifact` → 관측 → 거절 → 실제 디스크 잠금 해제·실제
    루프백 수신기 닫기·버전 확인 자식 정리, 외부에서 쓰기 쪽을 열어 주지 않음). **수정 전 구현이 모델 위에서 매달려 실패하는 것을 같은 시험으로 측정했다**
    (어댑터 시험 8건 실패 = 매달림 5건 + 열기 플래그 전달 확인 3건, CLI 시험 3건 실패 = 모두 매달림. 시험 쪽 시간 한도 2~5초 뒤 매달린 열기를 풀어 정리했고
    전역 제한까지 끌려가지 않았다). 서버가 있는 이름 있는 파이프는 수정 전 구현으로 한 번 손으로 확인했다(연결은 되고 6ms 만에 `NOT_A_FILE`) — 자동 시험은
    없다(`net` 사용이 구조 시험으로 제한되어 있다).
  - **Linux에서 확인함 (외부 검토가 보고한 결과 — 이 PC에서 직접 재현한 값이 아니다)**: Linux·Node 24.22.1에서 하네스 49개 파일·2,268개가 통과했고
    (Windows 전용 2개 건너뜀) **실제 POSIX FIFO 시험 7개가 모두 통과했다**(`artifact-node.test.ts`·`cli.test.ts`의 "실제 POSIX FIFO" 구간, `mkfifo`는
    프로세스 포트로 실행). 이 PC에서는 POSIX 전용이라 건너뛰어 실행하지 못했다(ADR U19). 이 기록은 그 보고를 옮겨 적은 것이다.
  - **여전히 확인하지 못함**: **macOS**(이 PC에도, 외부 검토에도 없다), WSL, 네트워크 파일 시스템. 이 저장소의 CI는 시험을 돌리지 않는다.
  - **알려진 한계**: ① 거절하려고 FIFO의 읽기 쪽을 잠깐 열었다 닫는다. 그 FIFO에 이미 쓰는 프로세스가 있었다면 그쪽에 미치는 영향은 평가하지 않았다
    ② Windows에서는 서버가 있는 이름 있는 파이프에 클라이언트로 연결한 뒤에야 거절한다(열기 전에 경로로 미리 거르지 않는다 — Windows 동작을 바꾸지 않기
    위해서다) ③ 느린 네트워크 파일 시스템의 일반 파일 읽기 지연은 다루지 않는다(일반 파일 읽기는 조각마다 취소를 확인할 뿐 한 번의 읽기를 끊지 못한다).
- **확인하지 못함**: 실제 Semgrep의 `--version` 출력 형식·종료 코드·소요 시간(ADR U17), 설치 출처(U18), Linux·macOS·WSL, 네트워크 파일 시스템, 읽기 권한 오류의
  실제 디스크 재현(Windows에서는 `chmod`가 통하지 않아 `open` 주입으로만 확인했다), Windows에서 `"1.180.0"`을 찍는 실제 실행 파일을 만드는 방법이 없어
  **정상 출력의 실제 프로세스 경로는 CLI가 아니라 코어 통합 시험에서만** 확인했다(CLI의 정상 경로는 가짜 자식으로 확인했다).

### 같은 트리의 다른 서버 프로세스 관측

`run`은 공유 잠금과 증거 표지를 얻은 실행에서만, 도구 관측 뒤 서버(LSP)를 띄우기 **전에** 운영체제 프로세스 목록을 읽어 하네스의
`foreignServerProcesses`를 채운다. 공유 잠금은 하네스끼리만 막으므로, 하네스 밖에서 같은 트리를 쓰는 Semgrep LSP 서버가 있는지는 이 관측이 **식별
규칙에 맞는 후보를 찾는 범위에서** 살핀다. **이것은 조회한 그 시점의 읽기 전용 관측이다.** 조회 이후 하네스 밖에서 시작되는 프로세스까지 막는다는 뜻이
아니며, 어떤 프로세스도 끝내거나 정리하지 않는다. **건수 0은 "다른 서버가 없다"는 증명이 아니라 "식별 규칙에 맞는 후보가 보이지 않았다"는 뜻이다.** 판정(순수)은 `process-observation.ts`, 목록 읽기(어댑터)는 `process-list-node.ts`, 해석은 `process-list.ts`로 나뉘어 있다.

- **어댑터** (미지원 환경은 `UNSUPPORTED_PLATFORM` → null):

  | 운영체제 | 읽는 방법                                                                                                                                  | 알 수 있는 것                                                      |
  | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
  | Windows  | 프로세스 포트로 `SystemRoot` 아래 고정 경로의 `powershell.exe`를 셸 없이 인자 배열(`-EncodedCommand`)로 한 번 실행. `Get-CimInstance` 하나 | 이름·실행 파일·명령줄·부모 PID·시작 시각. **작업 폴더는 모른다**   |
  | Linux    | `/proc/<pid>/{status,cmdline}` 읽기, `exe`·`cwd`는 링크 읽기                                                                               | 이름·부모 PID·정확한 인자 배열·실행 파일·작업 폴더(권한이 있을 때) |
  | 그 밖    | 지원하지 않음(macOS 포함, 검증하지 않았다)                                                                                                 | —                                                                  |

  시간 제한(30초)·출력 한도(32 MiB, 행 100,000개)·취소를 지킨다(모두 실측하지 못한 추정). 조회 실패(실행 불가·권한 부족·시간 초과·출력 한도·출력
  파손·취소·읽기 오류)는 던지지 않고 토큰으로 끝나 null이 된다. 출력은 줄 끝 표지(`END`)와 건수가 맞아야만 받는다 — 잘린 출력으로 목록을 만들지 않는다.

- **판별 근거와 순서** (파일 머리말 주석이 정본이다):
  1. **자기 자신 구분**: 하네스 PID, 그 조상, 그 자손(조회 자식 포함)은 "다른" 프로세스가 아니다. Windows는 부모가 끝나도 자식에 부모 PID가 남고 번호가
     재사용되므로 부모의 시작 시각이 자식보다 늦지 않을 때만 부모-자식으로 본다. 목록에 자기 PID가 없으면(다른 PID 이름공간·숨김) 목록을 믿지 않는다.
  2. **역할**(인자 배열의 요소 단위, 앞쪽 4096칸에서 프로그램 이름 `semgrep`·`pysemgrep`·`osemgrep`·`semgrep-core`·`semgrep-cli`를 찾는다 — 실행기 옵션이나 공백이 든 경로가 이름을 뒤로 밀어도 놓치지 않는다): 찾으면 그 뒤 인자 **전체**에서 `lsp`·`-lsp`가
     있으면 **서버**, 없고 `--version`이 있으면 **버전 확인**(서버가 아니다), 그 밖은 `scan` 같은 **검사**(서버가 아니다). 이 하네스가 띄우는 버전 확인 프로세스와
     LSP 서버, 그리고 검사 프로그램(하네스) 자신을 이렇게 구분한다. **인자가 4096칸을 넘고 앞쪽 4096칸에 이름이 없으면 "서버가 아님"이 아니라 "다 보지 못함"이다** —
     못 본 칸에 `semgrep lsp`가 있을 수 있으므로 이미지 이름과 무관하게 판별 불가(`ARGS_SCAN_LIMIT`)이고 건수는 0이 되지 않는다. 한도를 늘려 가리지 않는다.
  3. **이름 한 가지로는 "없음"을 확정하지 않는다**: 이미지 이름·실행 파일이 Semgrep 이름이거나 `--semgrep-bin`과 같은 이름인데 인자가 역할을 보이지 않는 프로세스,
     인자를 읽지 못한(또는 비어 있는) Semgrep·Python 계열 실행기(`python*`·`pypy*`·`py`·`uv`·`uvx`·`pipx`) 프로세스는 **후보**로 남겨 건수를 0으로 채우지 않는다
     (`ROLE_UNCLEAR`·`ARGS_UNAVAILABLE`). 살아 있는데 이름·실행 파일·인자를 모두 읽지 못한 프로세스(권한·읽기 오류)도 무엇인지 알 수 없으므로 후보다(`ROW_UNREADABLE`).
     인자를 읽지 못해도 이름이 읽히고 그런 이름이 아닌 시스템 프로세스는 후보가 아니다.
  4. **트리 관계**(서버만): 작업 폴더와 인자 속 경로(절대·상대·`--옵션=값`·`-w경로`의 값, URL 제외)를 `FsPort.physicalKey`로 **실제 위치**(별칭·링크·junction·`..`·대소문자)로 풀어
     서버 트리와 견준다. 하나라도 트리와 같거나 그 안이면 **같은 트리**(건수에 센다). **그 밖에는 언제나 판별 불가다**: 트리를 **감싸는** 폴더(`ANCHOR_ENCLOSES_TREE`),
     작업 폴더를 모름(`CWD_UNAVAILABLE`), 풀지 못한 단서(`ANCHOR_UNRESOLVABLE`), 그리고 단서가 모두 트리와 겹치지 않는 경우(`TREE_BINDING_UNOBSERVABLE`).
     마지막은 LSP 서버의 작업 공간이 stdio의 `initialize`로 전달되어 목록에서 보이지 않기 때문이다(이 하네스도 서버를 트리가 아닌 규칙 캐시의 부모 폴더에서 띄운다) —
     **실행 위치가 트리와 다르다는 것은 그 서버가 다른 트리를 스캔한다는 증거가 아니다.** 그래서 보이는 서버가 있으면(같은 트리로 확인된 경우를 빼고) 건수는 0이 되지 않는다.
- **판별 불가 조건 → 건수를 0으로 채우지 않고 null**: 목록을 읽지 못함 · 목록에 자기 자신이 없음 · 보이는 서버 후보가 같은 트리로 확인되지 않음 · 후보인데 역할을
  모름 · 인자를 한도(4096칸)까지만 보고 끝까지 보지 못함(`ARGS_SCAN_LIMIT`) · 후보가 읽는 도중 사라짐(`CANDIDATE_VANISHED`). 같은 트리 서버가 확인되면 그 건수를 돌려주되 판별하지 못한 후보가 더 있으면 `count_is_lower_bound`다.
  아무것도 읽기 전에 사라진 프로세스는 식별할 수 없고 지금은 없으므로 막지 않고 건수만 남긴다(`vanished_not_candidate`).
- **게이트**: 하네스는 `lockHeld === true`이고 `foreignServerProcesses === 0`일 때만 서버 트리(스캔 트리·대조 트리)를 만들거나 쓴다. 다른 서버가 있거나 확인하지
  못하면 트리 준비 쓰기도 서버 기동도 하지 않는다. 이미 파일이 있는 트리는 읽기만 하고 판정한다. 잠금이 없으면 목록을 읽지도 않는다(`NOT_ATTEMPTED`).
  사전 검사는 이때 준비되지 않은 빈 트리를 어긋남으로 판정하지 않는다(그러면 `MANIFEST_MISMATCH`가 진짜 원인 `FOREIGN_SERVER_PROCESS`를 밀어낸다). 건너뛰는 모든 경우에
  `LOCK_NOT_ACQUIRED` 또는 `FOREIGN_SERVER_PROCESS`가 함께 있다(시험이 모든 조합으로 확인한다).
- **증거**: `run.json`의 `resources.foreign_server_observation`(선택 필드 — 연결하지 않은 호출자의 기존 레코드는 바이트 단위로 같다)에 `scope: "POINT_IN_TIME"`,
  상태(`OBSERVED`·`INCONCLUSIVE`·`FAILED`·`NOT_ATTEMPTED`), 건수, 판별 불가 사유별 건수, 목록 출처·행 수, 역할별 건수만 싣는다. **명령줄·환경변수·토큰·경로·PID는 싣지
  않는다**(시험이 비밀 토큰이 든 인자로 확인한다). 요약이 하네스에 넘긴 건수와 모순되면 쓰기 전에 `config` 하드 실패다. `not_established`가 항상 남는다:
  `semgrep_server_identification: UNVERIFIED`, `foreign_server_tree_binding: UNVERIFIED`, `hidden_processes: NOT_OBSERVED`.
- **세워 주지 않는 것 / 한계**: ① 식별 규칙은 실제 Semgrep으로 확인하지 않았다(ADR U20). 합성 자료나 Node 스텁의 결과는 실제 Semgrep 프로세스 식별의 증거가
  아니다 ② LSP 서버의 작업 폴더는 stdio로 전달되어 목록에 없다 — 그래서 "다른 트리"로 확정하는 경로가 없고, 같은 트리로 확인되지 않은 보이는 서버는 판별 불가다
  (이 때문에 다른 프로젝트에서 도는 편집기 서버가 보여도 실행은 거부된다 — 닫고 다시 시도해야 한다) ③ Windows는 작업 폴더를
  알 수 없어 서버 후보는 인자 경로가 트리 안일 때만 확정되고 그 밖에는 null이다 ④ 이름도 인자도 Semgrep과 닮지 않게 바꾼 프로세스, 컨테이너·다른 사용자·다른 호스트의
  프로세스는 식별하지 못한다(시험 "알려진 한계") ⑤ 같은 실행 파일의 `scan` 등 서버가 아닌 사용은 세지 않는다 ⑥ `hidepid`처럼 목록 자체를 가리는 환경은
  자기 PID가 목록에 있어야 믿는 검사와, 읽지 못한 행을 판별 불가(`ROW_UNREADABLE`)로 보는 규칙으로 일부 걸러진다 ⑦ 경로는 하네스가 보는 파일 시스템 기준으로 푼다
  (다른 마운트 이름공간·바인드 마운트의 별칭은 알 수 없고, 대소문자를 구분하지 않는 Linux 마운트는 구분하는 것으로 비교한다) ⑧ 목록을 읽은 뒤 트리를 준비하고 서버를
  띄우기까지 시간이 흐른다(그 사이 시작된 프로세스는 보지 못한다) ⑨ `/proc` 읽기는 읽기가 돌아온 뒤(배치 사이와 마지막 배치 뒤)에만 시간·취소를 확인한다. 기한(조회 시작 + 30초)을
  **넘겨** 끝난 목록은 마지막 배치라도 `TIMEOUT`(null)이지만(경계: 정확히 기한에 끝나면 기한 안), 돌아오지 않는 읽기를 강제로 끊지는 못한다 ⑩ 인자가 4096칸을 넘는 프로세스는
  앞쪽 4096칸에 Semgrep 이름이 없으면 이미지 이름과 무관하게 판별 불가라, 그런 프로세스(대량 파일 인자를 받은 빌드·`xargs` 등)가 보이면 실행이 거부된다 — 끝난 뒤 다시 시도해야 한다.

#### 다른 서버 프로세스 관측의 검증 범위

세 가지를 구분한다. **합성 자료로 확인한 것**은 판정 로직이 의도대로라는 뜻일 뿐 운영체제나 Semgrep에 대한 증거가 아니다.

| 구분                                      | 시험                                                                                                          | 확인한 것                                                                                                                                                                                                          | 실행 환경                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 합성 프로세스 정보                        | `process-observation.test.ts`, `cli.test.ts`·`harness.test.ts`·`precheck.test.ts`의 새 구역                   | 후보 없음·같은 트리·트리와 겹치지 않는 서버(판별 불가)·경로 별칭·버전 확인·자기 자신/조상/자손·Windows PID 재사용·불완전/사라짐·읽지 못한 행·목록 신뢰 불가·CLI→관측→하네스→`run.json`·거부 경로(서버·트리 무변경) | 모든 환경(순수·메모리)                   |
| 가짜 프로세스 포트·메모리 `/proc`         | `process-list.test.ts`, `process-list-node.test.ts`                                                           | 출력 해석(파손 전수), Windows 어댑터의 실패 경로(실행 불가·권한·시간 초과·출력 한도·취소·종료 무시 자식)와 정리, `/proc` 어댑터의 권한 없음·사라짐·깨진 상태·취소·시간 한도                                        | 모든 환경(가짜·메모리)                   |
| **실제 운영체제 목록 + 무해한 Node 스텁** | `process-list-node.integration.test.ts` (`testing/stub-sleeper.mjs`를 `semgrep lsp …`처럼 보이는 인자로 띄움) | 실제 목록에서 자기 자신·조상·자손을 보고, 스텁의 역할(서버·버전 확인·검사)을 가르고, 별칭(junction)을 풀고, 읽기만 하며(띄운 프로세스가 모두 살아 있다), 요약에 명령줄·경로가 없음                                 | **Windows 11 + Node 24.22.1에서 실행함** |
| 실제 Linux                                | 위 통합 시험의 Linux 분기(작업 폴더 단서)                                                                     | 작성만 했다                                                                                                                                                                                                        | **이 환경에서 실행하지 못했다**(ADR U21) |

실행한 실제 운영체제 시험이 **보여 주지 않는 것**: 실제 Semgrep 프로세스를 이 규칙이 식별하는지(실제 Semgrep은 설치도 실행도 하지 않았다), 이 PC에서 건수 0이 확정되는지
(장비에 인자를 읽을 수 없는 Python 계열 프로세스가 있으면 정당하게 null이다 — 그래서 실제 운영체제 시험은 0을 단정하지 않고 상대적인 성질만 본다).
기존 오류와 새 오류의 구분, 전체 시험 수는 PR 본문에 있다.

#### 외부 검토가 재현한 결함 두 건과 수정 (ADR 결정 기록 29번)

- **`/proc` 조회의 마지막 배치 시간 초과 누락**: 시간 검사가 배치를 읽기 **전**에만 있어, 마지막 배치가 기한을 넘겨 끝나도 성공 목록이 나갔다
  (`timeoutMs` 5000, 프로세스 1개, 읽기가 끝난 시각 6000 → `list()` 성공 → `OBSERVED`·0건). 이제 마지막 배치 뒤에도 같은 기준으로 확인한다. 기한 = 조회 시작 +
  `timeoutMs`, **끝난 시각이 기한을 넘으면**(경과 > `timeoutMs`) `TIMEOUT`이고 정확히 기한에 끝나면 기한 안이다. `TIMEOUT`은 관측 요약(`status: FAILED`, `failure: TIMEOUT`)과
  `foreignServerProcesses = null`로 이어져 서버 트리 준비 쓰기도 서버 기동도 일어나지 않는다. 돌아오지 않는 읽기의 강제 취소는 이번 범위가 아니다.
- **인자 탐색 한도 초과를 서버 부재로 인정함**: `argvRoleOf`가 앞 4096칸만 보고 `NONE`을 돌려주어, `["python3", …"-u" 4095개, "-m", "semgrep", "lsp"]`(4099칸, 작업 폴더 = 서버 트리)가
  0건으로 인정되었다. 이제 한도를 넘는 목록에서 앞쪽 4096칸에 이름이 없으면 `UNSCANNED`(다 보지 못함)를 전달하고, 호출부는 이를 이미지 이름과 무관하게 판별 불가로 둔다
  (`ARGS_SCAN_LIMIT`, 관측 `INCONCLUSIVE`, 건수 null). 한도는 늘리지 않았다. 프로그램 이름이 앞쪽 4096칸 안에 있으면 그 뒤가 아무리 길어도 서버·버전 확인·검사 판정은 그대로다.
- **검증 범위**: 두 결함 모두 합성 자료(메모리 `/proc`·합성 프로세스 목록)에서 재현했고, 수정 전 구현에서 새 시험이 실패하며 수정 후 통과한다. CLI까지 이어지는 시험이 미확인 결과에서
  서버 트리 준비 쓰기와 LSP 서버 기동이 일어나지 않음을 확인한다. 실제 Linux `/proc`의 시간 동작이나 실제 Semgrep 프로세스를 새로 확인한 것은 없다.
- **수정 후 재검토 보고 (이 PC에서 직접 재현한 값이 아니다)**: 위 두 결함은 해결로 확인되었고, 같은 Linux·Node 24.22.1에서 원본 하네스는 2,506개 통과·7개 실패(아래와 같은 PID 이름공간 원인)·Windows 전용 2개 건너뜀으로 보고되었다.
  이 값 역시 원본 전체 시험 통과나 실제 Semgrep 식별 성공이 아니다. 음성 대조 변경(ADR 결정 기록 30번)을 위해 PID 이름공간 지원을 추가하지 않았다.
- **외부 Linux 검증 기록 (외부 검토가 보고한 결과 — 이 PC에서 직접 재현한 값이 아니다)**: Linux·Node 24.22.1에서 수정 전 원본 하네스는 2,470개 통과·7개 실패, Windows 전용 2개 건너뜀이었다.
  7개 실패는 실행 환경의 PID 이름공간과 마운트된 `/proc`의 PID 기준이 맞지 않아서라고 보고되었다. 시험에서 PID 대응만 보정한 실제 `/proc` 통합 10개는 통과했다.
  **이것은 원본 전체 시험 통과도, 실제 Semgrep 프로세스 식별 성공도 아니다.** 이 특수 환경을 지원하도록 운영 코드를 바꾸지 않았다(ADR U21은 그대로 열려 있다).

## 음성 대조 실행기와 기록 연결 (ADR 결정 기록 30번)

`negative-control` 명령은 `NEGATIVE_CONTROL_TABLE`의 R1~R9를 사례별 작업 공간에서 실행하고, 그 결과를 control 실행의 `control_assertions`로 잇는다.
**이 변경은 실행기와 연결을 구현했을 뿐, 실제 엔진으로 한 번도 실행하지 않았다.** 모든 시험은 합성 스텁이며, 표의 기대 상태와 사유 코드·상태 우선순위는
바꾸지 않았다. `NOT_RUN`을 `PASS`로 바꾸는 경로는 없다.

### 계약 표 (R1~R9)

입력 변형은 사례별 작업 공간의 **사본**에만 가한다(원본 규칙 캐시·대조 예제는 읽기만 한다). 변형은 바이트 단위이며 YAML을 해석하지 않으므로 변형된 YAML이 실제로
무효·유효한지는 확인하지 않았다(ADR U22). 기대 상태와 사유는 표(`control.ts`)에서 읽으며 이 절이 복제한 값이 아니라 그 시점의 표를 옮긴 것이다.

| id  | 입력 변형(사본에만)                                        | 사전 검사 층: 기대 · 표의 사유                   | 엔진 층: 기대         | 엔진 층 계약 상태                                 |
| --- | ---------------------------------------------------------- | ------------------------------------------------ | --------------------- | ------------------------------------------------- |
| R1  | 첫 규칙 파일 제거                                          | `MANIFEST_MISMATCH` · `RULES_FILE_REMOVED`       | `MANIFEST_MISMATCH`   | 실행함. 엔진 고유 관측 계약 미확정 → `NOT_RUN`    |
| R2  | 첫 규칙 파일을 깨진 YAML로 교체                            | `MANIFEST_MISMATCH` · `RULES_FILE_CHANGED`       | `MANIFEST_MISMATCH`   | 실행함. 엔진 고유 관측 계약 미확정 → `NOT_RUN`    |
| R3  | 깨진 YAML 파일 추가(`zz-negative-control-broken.yaml`)     | `MANIFEST_MISMATCH` · `RULES_FILE_ADDED`         | `MANIFEST_MISMATCH`   | 실행함. 엔진 고유 관측 계약 미확정 → `NOT_RUN`    |
| R4  | 유효한 새 규칙 파일 추가(`zz-negative-control-added.yaml`) | `MANIFEST_MISMATCH` · `RULES_FILE_ADDED`         | `MANIFEST_MISMATCH`   | 실행함. 엔진 고유 관측 계약 미확정 → `NOT_RUN`    |
| R5  | 첫 규칙 파일의 본문 변경                                   | `MANIFEST_MISMATCH` · `RULES_FILE_CHANGED`       | `MANIFEST_MISMATCH`   | 실행함. 엔진 고유 관측 계약 미확정 → `NOT_RUN`    |
| R6  | 구성 경로를 없는 경로로                                    | 없음(엔진이 필요)                                | `RULES_NOT_LOADED`    | 실행함. 엔진 반응에 달려 있음                     |
| R7  | `scan`에 알 수 없는 키 1개                                 | `SETTINGS_MISMATCH` · `SETTINGS_KEY_NOT_ALLOWED` | `SETTINGS_MISMATCH`   | 실행함. 엔진 고유 관측 계약 미확정 → `NOT_RUN`    |
| R8  | 구성 경로를 작업 공간 밖 절대 경로로(밖에 사본)            | 없음(엔진이 필요)                                | `PREFIX_MISSING`      | 실행함. 충돌 후보이나 엔진 반응에 달려 확정 못 함 |
| R9  | `metrics`에 알 수 없는 키 1개                              | `SETTINGS_MISMATCH` · `SETTINGS_KEY_NOT_ALLOWED` | `ISOLATION_VIOLATION` | **실행하지 않음 — 계약 충돌(`NOT_RUN`)**          |

### 층 규칙과 호출 경로

두 층은 서로를 대신하지 못한다. 사전 검사 7개와 엔진 9개는 각자의 실행 근거로만 `PASS`가 된다.

| 층        | 호출 경로                                                                                              | `PASS`에 필요한 관측 근거 (사례별 `run.json`에서 다시 읽는다)                                                                |
| --------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 사전 검사 | 정상 진입점 `runHarness`. 엔진을 띄우지 못하게 감싼 포트를 넘겨 서버 없이 거부를 관측한다              | 판정 상태 = 표의 사전 검사 상태, 사유 목록에 표의 사유, **서버를 띄우려는 시도 없음**, 진단 표식 없음, 기준 실행과 같은 결합 |
| 엔진      | 별도 진입점 `runEngineDiagnostic`. 실제 포트로 엔진을 띄운다(사전 검사 사유가 변형이 부른 것뿐일 때만) | 판정 상태 = 표의 엔진 기대, **진단 표식(`resources.engine_diagnostic`)과 서버 기동 사건**, 기준 실행과 같은 결합             |
| 기준 실행 | `runEngineDiagnostic`(변형 없음)                                                                       | `COMPLETE`이고 엔진까지 떴어야 한다. 아니면 변형의 효과를 가릴 수 없어 **16개 모두 `NOT_RUN`**(`BASELINE_NOT_CLEAN`)         |

- **정상 경로는 약해지지 않았다.** 정상 진입점은 시작 정책이 `"gated"`로 고정되어 옵션으로 바꿀 수 없고(구조 시험), 사유가 하나라도 있으면 서버를 띄우지 않는다.
  엔진 진단은 사유가 전부 변형이 부른 것이고 서버 트리를 쓸 자격(잠금 보유·다른 서버 0건)이 있을 때만 사유를 판정에 담은 채 엔진을 띄운다. 도구·휠·환경변수·잠금·다른 서버·핀
  사유가 있으면 진단도 시작하지 않는다. 진단 실행은 control 전용이고 대조 참조가 될 수 없다(`DIAGNOSTIC_RUN`).
- **`observed`는 실제 관측이다.** 항목은 순수 함수 `deriveNegativeControlEntry` 하나로 만들며 실행기와 기록 읽기가 같은 함수를 쓴다. 판단 순서: 계약 충돌 → 취소 → 미기록 →
  결합 없음·어긋남 → 층·진단 표식 불일치 → 엔진 미기동 → 기대 비교. `NOT_RUN`: 미실행·취소·실행 실패·증거 누락·결합 어긋남·엔진 미기동·계약 충돌. `FAIL`: 실행했지만 기대와 다름.
- **사례별 격리.** 사례마다 작업 공간(`<work-root>/<run-id>/`의 규칙 캐시 사본과 `tree/`)과 증거 폴더가 따로이고, 서버 트리마다 공유 잠금·루프백 수신기·다른 서버 프로세스 관측을
  쥐며(`run`과 같은 계약) 어떤 경로로 끝나도 수신기를 닫고 얻은 잠금만 해제한다. 도구 버전·휠 해시는 스위트 전체에서 한 번 관측해 모든 사례의 결합에 쓴다.

### 외부 검토 보완 네 건 (결정 기록 31번)

외부 검토가 합성 환경(메모리 파일 시스템·가짜 포트·스텁 엔진)에서 재현한 네 결함을 고쳤다. **사유 코드, 상태 우선순위, 표의 기대 상태는 바꾸지 않았고 `PASS`를 만들려고 기대를
바꾸거나 필수 항목을 지우지 않았다.** 아래는 모두 합성 환경의 결과이며 실제 Semgrep 검증이 아니다.

| #   | 결함                                                                                                                                        | 이제                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 버전 확인 중 수신기가 요청 1건을 봐도(`metrics_hits_during = 1`) 사례별 수신기는 0건이라 `baseline.clean = true`·15쌍 `PASS`                | `toolIsolationBlock`이 시작 관문이다. 0건이 아니면(1건 이상·`null`·요약 없음) 기준·변형 서버를 하나도 시작하지 않고 16개 `NOT_RUN`(`TOOL_OBSERVATION_BLOCKED`)이며 원인이 `blocked`에 남는다. `null`을 0으로 보정하지 않고 관측값은 바꾸지 않는다                |
| 2   | R1 엔진의 `initialize`가 오류여도(PH0·PH1, 사유에 `RULES_FILE_REMOVED`와 `INIT_ERROR_RESPONSE`) 대표 상태 `MANIFEST_MISMATCH` 때문에 `PASS` | 엔진 층은 대표 상태가 아니라 **사유와 도달한 단계**를 본다. PH2(규칙 로딩)에 이르기 전의 초기화·전송 실패는 `NOT_RUN`(`ENGINE_EXECUTION_FAILED` / `ENGINE_STAGE_NOT_REACHED`). R1~R5·R7은 엔진 고유 관측 계약이 없어 `NOT_RUN`(`ENGINE_OBSERVATION_UNCONFIRMED`) |
| 3   | R5 엔진을 `EXECUTED`로 고치고 R2 엔진의 `run_id`·해시를 가리키면 `PASS`로 재도출되고 `problems = []`                                        | 사례별 `run.json`에 신원(`resources.negative_control_case`)을 남기고, 읽는 쪽이 기대 `run_id`·내부 `run_id`·신원·변형 해시를 대조한다. 다른 사례·기준 증거, 중복 참조, 내부 `run_id` 불일치는 그 사례 `NOT_RUN`. 증거 경로는 공유 `isValidRunId`로 만든다        |
| 4   | `--evidence-root`를 `--control-fixtures-root`와 같게 주면 원본 대조 예제 루트 아래에 `run.marker`·상태 폴더·사례별 증거가 생김              | 계산된 출력 경로 전부가 원본(규칙 캐시·대조 예제·고정 데이터·하네스) 안인지 `physicalKey`로 **쓰기 전에** 본다. CLI는 포트·잠금·표지·상태 폴더·수신기 전에 사용법 오류(2), `runNegativeControls` 직접 호출은 쓰지 않고 16개 `NOT_RUN`                            |

**2번 보완 — 엔진 층의 관측 단계와 엔진 고유 관측 (선택지 B)**

- **관측 단계 = PH2.** 모든 엔진 사례의 입력 변형(규칙 사본·구성 경로·서버 옵션)은 `initialize` 뒤 규칙 로딩에서 엔진에 닿는다. PH2에 이르기 전(PH0·PH1)의 실패 —
  `INIT_FAILED`로 매핑된 모든 사유(표에서 도출)와 전송 무결성 실패(`STDIN_WRITE_FAILED`·`RESPONSE_ID_UNMATCHED`·`RESPONSE_ID_DUPLICATE`) — 는 사전 검사 사유가 대표 상태를 정해도
  관측이 성립하지 않은 것이다. PH2 **안**에서 서버가 죽거나(`EXIT_DURING_RULES`) 프레임이 깨지거나(`FRAME_ERROR_DURING_RULES`) 취소된(`CANCELLED_DURING_RULES`) 경우도 같다 — 대표 상태가 `RULES_NOT_LOADED`가 되어도 없는 경로에 대한 엔진의 반응이라는 증거가 아니다. 사례가 의도한 관측이 아닌 실행 실패를 가려내되 **일괄 차단하지 않는다**: PH2 **안**의 규칙 로딩에 대한 반응과 그 단계의 대기 시간 초과(`TIMEOUT_RULES` — 반응하지 않음이 드러나는 모양)는 사례가 의도한
  관측일 수 있어 실행 실패로 보지 않고, PH2 **뒤**의 스캔·종료 실패는 이 사례의 관측과 무관해 막지 않는다. 사전 검사 사유가 없는 R6·R8도 같다(관측이 성립하지 않았는데 `FAIL`로 읽지 않는다).
- **엔진 고유 관측.** 사전 검사 사유가 있는 id(R1~~R5·R7·R9)는 그 사유가 대표 상태를 이미 정하므로 상태 일치는 엔진이 변형을 따로 잡았다는 증거가 아니다. 엔진 `PASS`에는 엔진이 낸 반응 사유가 필요하다.
  그 사유를 정하려면 규칙 로딩 로그·진단 형식(ADR U3·U11)이 실제 Semgrep으로 확정되어야 하는데 아직 아니다. 그래서 확정된 계약(`ENGINE_OBSERVATION_CONTRACTS`)은 **비어 있고** 추측으로 채우지 않았다.
  R1~~R5·R7 엔진은 실행하고 증거를 남기지만 `NOT_RUN`(`ENGINE_OBSERVATION_UNCONFIRMED`)이다. 계약이 확정되면 그 id에 반응 사유 목록을 넣으면 되고, 그때 판정은 상태 일치에 더해 그 사유가
  있어야 `PASS`(없으면 `FAIL`)다 — 이 기전은 **가정한 계약**으로만 시험했다. 확정 후보(확정 아님): R1 규칙 파일 로딩 줄의 변화, R2·R3 구문 오류 보고, R4 규칙 수 증가, R7 설정 효과의 간접 증거 로그.
  R5(본문 변경)는 변형이 주석 줄 추가일 수 있어 엔진이 관측할 차이가 없을 수도 있다.
- 실행기와 기록 읽기는 같은 `deriveNegativeControlEntry`를 쓴다. 스위트 파일이 `EXECUTED`라고 속여도 읽는 쪽이 같은 판정으로 `NOT_RUN`으로 되돌린다.

**3번 보완 — 증거 신원 대조의 범위**: 서명·출처 인증이나 원시 트랜스크립트 재검증은 추가하지 않았다. 증거와 스위트를 함께 위조해 신원·해시를 모두 맞추는 경우는 구별하지 못한다 — 남는 방어는 control 실행이
이번 실행의 결합·출처를 다시 맞춰 보는 것과 운영자가 경로를 명시하는 것뿐이다.

**R9 엔진 층의 선택지 B 방향 — 이번에는 구현하지 않고 `NOT_RUN`을 유지**: 표의 R9 기대를 `SETTINGS_MISMATCH`로 바꾸지 않았고 필수 항목도 지우지 않았다(`BLOCKED_CONTRACT_CONFLICT` 그대로).
엔진 층은 알 수 없는 키가 아니라 **허용된 설정에서 격리 관측을 확인하는 별도 변형**이 필요하다. 그 변형이 성립하려면 필요한 관측 계약은 다음과 같고 **모두 미확인**이다(U15·U23):

1. 변형이 사전 검사 사유를 내지 않는 허용된 설정이어야 한다(알 수 없는 키를 쓰면 `SETTINGS_MISMATCH`가 대표 상태를 가린다).
2. 그 설정에서 실제 엔진이 하네스가 연 루프백 수신기로 요청을 보내 건수가 1 이상으로 관측되어야 한다(`METRICS_RECEIVER_HIT`). 엔진이 메트릭·버전 확인·앱 URL 환경변수를 읽는지, 어떤 설정과 시점(시작·스캔·종료)에
   요청을 보내는지 모른다.
3. 판정 시점에 수신기가 관측 중이어야 한다(`METRICS_RECEIVER_NOT_OBSERVING`이 아니다).
4. 변형을 뺀 기준 실행은 0건이어야 한다(위 1번 결함의 시작 관문과 기준 실행이 이미 요구한다).

### 후속 보완 — 원본 경로 보호의 하위 링크 우회 (한 건)

외부 재현(Linux 실제 임시 디스크, `createNodeFs`, `workRoot`·`evidenceRoot`는 원본과 분리): 사례 폴더(`<work>/nc1-baseline`)는 정상 디렉터리인데 그 아래 캐시 폴더 이름이 원본 예제 폴더를 가리키는
링크였다. `outputPathProblem`은 `null`을 돌려줬고, `runNegativeControls`의 `writeTree`가 링크를 따라 원본 예제 폴더에 YAML 5개를 만들었다. 기준 실행이 이후 실패해도 원본의 파일 목록은 이미 바뀐 뒤였다.

- **원인.** 검사는 사례 폴더 루트의 푼 자리까지만 봤고, 실제 쓰기는 그 아래(캐시 루트·하위 폴더·파일·대조 트리)에서 일어났다. 부모가 안전해도 하위 링크는 원본을 가리킬 수 있다.
- **이제.** 쓰기 전에 **쓰게 될 경로 하나하나**를 `FsPort.physicalKey`로 푼 자리로 본다. 파일 경로 하나의 푼 자리에서 그 위의 모든 링크가 풀리므로 캐시 루트만 검사해서 더 아래가 남는 일이 없다.
  대상: 규칙 사본(변형을 적용한 뒤의 파일 전부)·R8의 밖 사본·대조 트리 안의 파일·사례별 증거 폴더와 그 안의 증거 파일 9개·`run.marker`·`semgrep-state`, 스위트 증거 폴더와 그 안의 `run.marker`·
  `semgrep-state`·`version-check-state`·`negative-controls.json`. 하나라도 원본 안으로 풀리면 `OUTPUT_INSIDE_<원본>`이고, 풀 수 없으면(끊어진 링크 등) `OUTPUT_PATH_UNRESOLVABLE`이다.
- **검사와 쓰기가 어긋나지 않게.** 쓰는 쪽과 검사하는 쪽이 같은 함수로 경로를 만든다(`runKeyOf`·`planRulesCopy`·`rulesCopyRoot`·`outsideCopyRoot`·`treeTarget`). 증거 파일 이름·표지·상태 폴더 이름은
  `evidence.ts`의 상수를 쓴다. `cli.ts`의 `run.marker`·`semgrep-state` 리터럴은 기존 구조 시험이 문자열로 확인하므로 그대로 두었고, 한쪽만 바뀌면 시험이 드러낸다(아래).
- **거절 시점.** 어떠한 `mkdir`·파일 쓰기도 하기 전이다. `runNegativeControls`는 기준 실행을 포함해 사례를 하나도 시작하지 않고 16개 모두 `NOT_RUN`(`blocked.stage = WORKSPACE`)이다. CLI는 포트·잠금·표지·상태 폴더·
  수신기를 만들기 전에 `writePlanFor`(읽기만)로 계획을 세워 `outputPathProblem`에 넘기고 사용법 오류(종료 코드 2)로 끝낸다. 직접 호출과 CLI가 각자 독립적으로 같은 검사를 한다.
- **시험.** `negative-control.output-links.test.ts` 34건. 합성(메모리 위 링크 모형 `testing/linked-fs.ts`: 링크 이름 아래의 쓰기가 대상 자리로 옮겨진다고 가정)과 실제 임시 디스크(Windows `junction`·POSIX `symlink`)를
  구분한다. 처음 작성한 33건 중 29건이 수정 전 구현에서 실패했고(4건은 대조군), 실제 디스크에서는 수정 전에 원본 예제 폴더 아래에 `javascript/…`·`typescript/…` YAML 5개와 대조 트리 파일이 생겼다. 거절 전후의
  파일 목록·디렉터리·기존 파일 바이트는 같고, 작업·증거 폴더에도 아무것도 생기지 않는다. "쓴 모든 자리는 첫 쓰기 전에 이미 검사한 경로이거나 그 상위 폴더"라는 시험은 직접 호출과 CLI 양쪽에 있다.
- **한계(고치지 않았다).** (1) 검사 뒤에 링크를 바꾸는 경쟁 상태는 다루지 않는다. (2) 원본이 **아닌** 곳을 가리키는 링크는 막지 않는다 — 보호 범위는 규칙 캐시·대조 예제·고정 데이터·하네스뿐이다. (3) 실제 엔진이
  상태 폴더에 쓰는 내용은 폴더 위치만 본다. (4) 실행 잠금 파일(`semgrep-lsp-tree-<해시>.lock`)은 트리의 부모 폴더에 배타 생성되며 그 폴더까지만 본다. (5) Linux·macOS의 실제 `symlink` 시험은 작성만 했고 이
  환경(Windows 11)에서는 실행하지 못했다. 외부 Linux 재현은 보고된 값으로만 기록한다.

### 계약 충돌과 결정이 필요한 부분

충돌은 표에서 **기계적으로** 도출한다(`engineLayerConflicts`): 엔진 기대가 같은 변형이 반드시 내는 사전 검사 사유의 상태보다 우선순위가 뒤이면 엔진을 띄워도 그 기대 상태가
대표 상태가 될 수 없다. 현재 표에서는 R9 엔진뿐이다. 기준(표)을 조용히 바꾸지 않았고, 해결되지 않은 항목은 `NOT_RUN`으로 남는다.

**① R9 엔진 층(충돌 확정)**: 기대 `ISOLATION_VIOLATION`(우선순위 19)이 `metrics` 알 수 없는 키가 반드시 내는 `SETTINGS_MISMATCH`(4)에 가려진다. 결정 전에는
`NEGATIVE_ENGINE_PASS`가 충족될 수 없어 **어떤 기록도 대조 참조 자격을 갖출 수 없다**(`negative-control` 명령의 종료 코드도 0이 될 수 없다).

| 선택지                                                         | 영향                                                                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 표의 R9 엔진 기대를 `SETTINGS_MISMATCH`로 바꾼다            | 16개 모두 실행 가능해진다. 다만 R9 엔진 층이 사전 검사 층과 같은 기대·사유가 되어 "엔진이 떴다" 외의 새 정보가 없고, 루프백 수신기 작동 증명이라는 원래 목적을 잃는다 |
| B. R9 엔진 변형을 사전 검사가 막지 않는 입력으로 다시 설계한다 | 표의 id가 뜻하는 바를 바꾸는 결정이다. 새 변형 설계가 필요하고, 실제 엔진이 메트릭 환경변수를 읽는지(U15) 확인이 선행되어야 한다                                      |
| C. 표에서 R9 엔진 층을 없애고 격리 증명은 따로 둔다            | 엔진 항목이 9 → 8, 쌍이 16 → 15가 된다. `qualifyControlRun`의 16쌍 가정과 기록 계약, 관련 시험을 함께 바꿔야 한다                                                     |
| D. 현 상태 유지(`NOT_RUN` 고정)                                | 이 변경의 상태다. 자격을 갖춘 기록이 영구히 나올 수 없다                                                                                                              |

**② R1~R5·R7 엔진 층(충돌은 아니지만 가림 — 선택지 B 채택, 결정 기록 31번)**: 우선순위가 같아 충돌로 도출되지 않지만, 기대 상태를 사전 검사 사유가 이미 정한다. 그래서 엔진 `PASS`는 "엔진이 떴고 상태가 기대와 같았다"일 뿐
엔진이 변형을 따로 잡았다는 증거가 아니다.

| 선택지                                                                                  | 영향                                                                                                                 |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A. 현행 유지(위 의미를 문서로 밝힘)                                                     | 추가 작업 없음. `PASS`가 약한 증거라는 점을 받아들이는 결정이다                                                      |
| **B. 엔진 `PASS`에 엔진 고유 관측(규칙 로딩 로그·진단 집합 변화 등)을 요구한다 — 채택** | 표에 없는 새 계약이다. 판정(`evaluate`)과 기록 필드를 넓혀야 하고 실제 엔진의 로그·진단 형식(U3·U11)이 먼저 필요하다 |
| C. 이 항목들의 엔진 층을 R9처럼 `NOT_RUN`으로 고정한다                                  | 자격이 영구히 불가능해진다                                                                                           |

**③ R8 엔진 층(후보)**: 실제 엔진이 작업 공간 밖 구성을 읽지 못하면 `RULES_NOT_LOADED`(7)가 `PREFIX_MISSING`(8)보다 앞서 기대와 달라진다. 엔진 반응에 달려 있어 충돌로 확정하지 못했다.
실행은 하고, 다르면 `FAIL`로 남긴다(기준을 바꾸지 않는다). 합성 스텁에서는 시험이 가정한 반응(접두어 없는 code 게시)만 흉내 낸다.

### 기록 연결

```text
negative-control 명령
  └─ 사례별 증거 폴더(<evidence-root>/<suite-id>-<id>-<층>/run.json 등) + 스위트 기록 <evidence-root>/<suite-id>/negative-controls.json
       (사례별 변형 해시·규칙 경로 토큰·증거 참조(run_json_sha256)·기준 실행 결합; 이미 있으면 덮어쓰지 않는다)
run --mode control --negative-controls <스위트 기록 경로>        (명시한 경우에만 읽는다 — 자동 탐색 없음, target은 사용법 오류)
  ├─ 로더: 저장된 entries를 읽지 않고, 사례별 run.json을 다시 읽어(해시 대조) 항목을 deriveNegativeControlEntry로 재도출
  ├─ 하네스: 스위트의 결합·출처가 이번 실행과 같을 때만 control_assertions.negative_controls에 쓴다
  │          (BINDING_MISMATCH · PROVENANCE_MISMATCH · BINDING_UNAVAILABLE이면 쓰지 않고 16개 모두 NOT_RUN)
  ├─ reference_qualification: 출처 real, 사전 검사 7 PASS(NEGATIVE_PREFLIGHT_PASS), 엔진 9 PASS(NEGATIVE_ENGINE_PASS), 결합 일치(NEGATIVE_BINDING_MATCH) …
  └─ run.json 기록 → 기존 --control-record 읽기 어댑터(target): stub·SYNTHETIC 거절, 엔진 진단 기록은 DIAGNOSTIC_RUN 거절
```

- 정상 `run`·target 실행에는 자동으로 붙지 않는다. 음성 대조 모듈을 가져오는 운영 코드는 `cli.ts`와 기록 읽기 모듈뿐이고, 하네스·판정·증거·사전 검사·세션·참조 모듈은 가져오지 않는다(구조 시험).
- 명령의 종료 코드: 16개가 모두 `PASS`이고 기록을 썼고 정리가 끝났을 때만 0. 현재 표에서는 R9 엔진 층 때문에 0이 될 수 없다. 사용법 오류 2, 방지 장치 `NOT_RUN` 3.

### 검증 범위

| 구분                        | 시험                                                                  | 확인한 것                                                                                                                                                                                                                                                                     | 실행 환경                             |
| --------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 순수 판정·실행기(합성 스텁) | `negative-control.test.ts`, `negative-control.failure.test.ts`        | 사례별 변형·격리, 기대와 다른 결과(`FAIL`), 미실행·취소·실행 실패·증거 누락·일부만 완료(`NOT_RUN`), 사전 검사 성공이 엔진 성공으로 승격되지 않음, 기준 실행이 깨끗하지 않으면 전부 `NOT_RUN`, R9 충돌, 원본 불변, 잠금·수신기 정리                                            | 모든 환경(메모리·가짜 포트·스텁 엔진) |
| 기록 읽기·하네스 연결       | `negative-control-record.test.ts`, `harness.negative-control.test.ts` | 저장된 선언을 믿지 않고 증거에서 재도출, 증거 해시 불일치·누락·중복·다른 결합·다른 출처 거절, 합성 기록의 target 참조 거절 유지, 엔진 진단 기록 거절                                                                                                                          | 모든 환경                             |
| CLI 전체 경로               | `cli.negative-control.test.ts`                                        | 방지 장치(`NOT_RUN` 3, 쓰기·포트 없음), 사용법 오류, 한 번 끝까지(9 PASS + 계약 미확정·R9 `NOT_RUN`), 정리 계약, 스위트 기록 비덮어쓰기, `--negative-controls` → `control_assertions` → `reference_qualification` → `run.json`, 명시하지 않으면 읽지 않음, target 사용법 오류 | 모든 환경(가짜 포트·스텁 엔진)        |
| 구조                        | `structure.negative-control.test.ts`, `structure.test.ts`             | 음성 대조가 정상 경로에 붙지 않음, 진단 진입점 호출은 실행기 한 곳, 정상 진입점 정책 고정, 표 값을 복제하지 않음. 기존 "real 포트는 `cmdRun` 한 곳" 시험을 함수 범위 시험으로 넓혀 `cmdRun`·`cmdNegativeControl` 두 곳(합계 2)으로 정했다                                     | 모든 환경                             |
| **실제 엔진**               | 없음                                                                  | 확인하지 않았다                                                                                                                                                                                                                                                               | **실행하지 않았다**(ADR U22)          |

- 전체 하네스: 61개 파일·2,713개 통과·8개 건너뜀(하위 링크 우회 보완 전 60개 파일·2,679개·8개 건너뜀; 그 앞 보완의 기록: 외부 검토 보완 전 59개 파일·2,632개·8개 건너뜀; 시작 시 53개 파일·2,507개·8개 건너뜀). 외부 검토가 재현한 네 건의 시험(`negative-control.review-repro.test.ts`)은 처음 작성한 31건 중 28건이 수정 전 구현에서 실패했고(나머지 3건은 대조군), 이후 추가한 연결 시험까지 수정 후 모두 통과한다(현재 36건). 하네스 범위 eslint·prettier·tsc에 새 오류가 없고, 저장소 전체의 기존 오류(`app/layout.tsx`의 `LayoutProps` 타입 오류,
  prettier의 `db/migrations/meta/_journal.json`·`0008_snapshot.json`·`design/MIGRATION-PLAN.md`)는 이 변경과 무관하게 그대로다.
- 핵심 판정·수락·진단 정책 로직에 결함을 하나씩 넣는 변이 17건은 외부 검토 보완 전에 확인했다. 이번 보완에서는 전체 감사나 변이 점검을 반복하지 않았다.
- 합성 스텁에서 9쌍(사전 검사 7 + 엔진 R6·R8)이 `PASS`로 나온다(엔진 R1~R5·R7은 실행하지만 계약 미확정으로 `NOT_RUN`, R9 엔진은 충돌 `NOT_RUN`). 이것은 판정·연결 로직이 의도대로라는 뜻일 뿐이며, R6·R8의 엔진 반응은 시험이 **가정한** 값이다. 스텁 기록은 provenance `stub`·trust
  `SYNTHETIC`이라 `reference_qualification`의 `PROVENANCE_REAL`에서 막힌다. **실제 Semgrep 검증이나 음성 대조의 실제 통과로 읽어서는 안 된다.**
- 외부 Linux 보고(2,506개 통과·7개 실패·건너뜀 2)는 보고된 값으로만 기록했고, 음성 대조를 위해 PID 이름공간 지원을 추가하지 않았다.

## 실제 실행 전에 남은 전제 (이 변경에는 없다)

방지 장치를 통과해도 아래가 채워지기 전에는 사전 검사가 거부해서 프로세스가 시작되지 않는다. 비어 있는 채로
`COMPLETE`가 되는 경로는 없다.

1. (구현함: 도구 버전과 휠 sha256 관측 — 위 절. 다만 ① 버전 출력 형식은 실제 Semgrep으로 **미확인**이고(ADR U17) ② 휠 해시는 설치 출처 검증이 아니며(U18)
   ③ `pin.json`의 휠 해시는 여전히 `null`·`verified: false`라 관측해도 `WHEEL_HASH_UNVERIFIED`로 거부된다. 핀을 확정하려면 소유자가 실제 휠을 확인해
   `pin.json`을 직접 고쳐야 한다 — 이 하네스는 하지 않는다.)
2. (구현함: 같은 트리의 다른 서버 프로세스 **조회 시점** 관측 — 위 절. 다만 ① 식별 규칙(프로그램 이름·`lsp` 인자)은 실제 Semgrep으로 **미확인**이고(ADR U20)
   ② LSP 서버의 작업 폴더는 stdio로 전달되어 보이지 않아 같은 트리로 확인되지 않은 보이는 서버는 판별 불가(null)이며 ③ Windows는 작업 폴더를 알 수 없어 서버 후보가 있으면 대개 미확인(null)이고
   ④ Linux `/proc` 어댑터는 이 PC에서 실행하지 못했고(U21) ⑤ macOS는 지원하지 않으며 ⑥ 조회 이후 하네스 밖에서 시작되는 프로세스는 막지 못한다.)
3. (해결: 루프백 메트릭 수신기를 구현했다 — 위 절. 다만 실제 Semgrep이 `SEMGREP_METRICS_URL` 등을 읽는지는 **미확인**이고, 0건은 외부 통신 전체가
   없었다는 증거가 아니다.)
4. (해결: `--control-record` 어댑터가 명시한 `run.json`을 읽어 연결한다. 다만 수락 조건을 채우는 기록은 아래 5번이 있어야 만들어진다.)
5. (구현함: 음성 대조 실행기와 기록 연결 — 위 절. 다만 ① 실제 엔진으로 실행한 적이 없고(ADR U22) ② R9 엔진 층은 계약 충돌로 `NOT_RUN`에 고정되어 소유자 결정이 필요하며(U23)
   ③ 1번의 휠 해시 미확정 때문에 실제 기준 실행이 깨끗할 수 없어 어떤 기록도 아직 `eligible`이 될 수 없다.)
6. 실행 인자 `lsp --debug`, `SEMGREP_*` 환경변수 이름, 단계별 시간 한도, `scan` 설정값은 모두 **미확인**이다(ADR U3·U8·U12).
