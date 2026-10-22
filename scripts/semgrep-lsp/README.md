# scripts/semgrep-lsp — Semgrep LSP 외부 하네스 (G1, 실행 전)

상태: **Proposed**. 결정 문서는 `.moai/decisions/lsp-security-source.md`(ADR-001)다. 이 디렉터리는
Semgrep을 설치하지도, 실행하지도 않는다. 모든 시험은 합성 트랜스크립트와 시험용 LSP 스텁만 쓴다.

## 하지 않는 것

- Semgrep 설치, `semgrep` 실행, `semgrep lsp` 기동, 실제 규칙 탐지, 대상 스캔, 네트워크 대조.
- `quality.yaml`·`lsp.yaml`·임계값·훅과의 연결. 외부 하네스 값은 `candidate_gate`로만 계산하고
  기존 보안 게이트에는 닿지 않는다(`policy_accepted`는 타입이 리터럴 `false`로 봉인한다).
- 규칙 YAML 원문의 커밋. 규칙 자료는 gitignore된 캐시(`.moai/cache/semgrep-rules`)에서 읽는다.
  저장소에는 파일 목록·blob SHA(`data/rules-files.tsv`)와 기대 규칙 목록(`data/rules-expected.tsv`)만 둔다.
- 대조 예제(`.moai/fixtures/semgrep-control/cases/*.in`)의 실행·import. 정적 입력일 뿐이다.

## 스텁 결과의 해석

스텁으로 통과한 시험은 **하네스 판정 로직이 합성 입력에서 의도대로 동작한다**는 것만 증명한다.
실제 Semgrep의 로그 형식, Windows URI 형식, `debug/echo` 응답, 종료 코드, 규칙 수, 탐지 여부는
증명하지 않는다. 스텁 실행의 `provenance`는 `stub`, `trust`는 `SYNTHETIC`이고
`candidate_gate.evaluation`은 항상 `UNVERIFIED`다.

## 모듈과 소유 범위

| 파일                                                                                         | 책임                                                                            | 단계       |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| `types.ts`, `status.ts`                                                                      | 공용 계약, 실패 상태 우선순위, 사유→상태 표                                     | 계약(고정) |
| `sha.ts`                                                                                     | sha256, git blob SHA-1, 줄 목록 해시                                            | A          |
| `framing.ts`                                                                                 | Content-Length JSON-RPC 인코더·점진 디코더(fail-closed)                         | A          |
| `jsonrpc.ts`                                                                                 | 요청·알림 생성, id 생성기, id 기반 응답 라우터                                  | A          |
| `clock.ts`                                                                                   | `SystemClock`, `VirtualClock`(결정적 시험용)                                    | A          |
| `streams.ts`                                                                                 | 비동기 바이트 큐, 줄 조립기, stdout·stderr 독립 수집기                          | A          |
| `testing/fake-process.ts`                                                                    | 메모리 상의 `ProcessPort`·`ChildHandle`                                         | A          |
| `testing/memory-fs.ts`, `testing/memory-git.ts`                                              | 메모리 `FsPort`·`GitPort`                                                       | A          |
| `rules-manifest.ts`                                                                          | 규칙 파일·기대 목록 파싱, 최종 ID 모델, 목록 해시, 규칙 트리 대조               | B          |
| `scope.ts`                                                                                   | 대상 SHA에서 E 계산, 스캔 트리 생성·대조                                        | B          |
| `log-matcher.ts`                                                                             | stderr 줄 인식(메시지 본문 전체 일치)                                           | B          |
| `aggregate.ts`                                                                               | 진단 집계(중복 제거, 심각도 규칙, 소계)                                         | B          |
| `settings.ts`                                                                                | `initializationOptions` 생성, 허용 키 검사(알 수 없는 키 거부)                  | B          |
| `precheck.ts`                                                                                | PH0 사전 검사(서버 없이)                                                        | B          |
| `evaluate.ts`                                                                                | 트랜스크립트 → `Verdict` (순수 함수)                                            | B          |
| `control.ts`                                                                                 | 대조 단언 A1~A4, 정상 쌍, 음성 대조                                             | B          |
| `evidence.ts`                                                                                | `RunRecord` 구성, 정규 JSON 직렬화, 증거 파일 작성                              | B          |
| `testing/transcript-builder.ts`                                                              | 합성 트랜스크립트 작성기                                                        | B          |
| `testing/evaluate-fixtures.ts`, `testing/evaluate-scenarios.ts`, `testing/synthetic-data.ts` | 판정·CLI 시험이 공유하는 합성 입력과 시나리오 표(시험 전용)                     | B·C        |
| `session.ts`                                                                                 | PH1~PH4 세션 제어기(포트·시계 주입)                                             | C          |
| `process-node.ts`, `git-node.ts`, `fs-node.ts`                                               | 실제 어댑터(자식 프로세스·git·파일)                                             | C          |
| `harness.ts`                                                                                 | 범위 계산 → 사전 검사 → 세션 → 판정 → 증거를 잇는 함수                          | C          |
| `cli.ts`                                                                                     | 명령줄 진입점, 실제 실행 방지 장치                                              | C          |
| `testing/stub-lsp.ts`, `testing/stub-child.mjs`                                              | 시험용 LSP 스텁(메모리·`node`로 띄우는 별도 프로세스). Semgrep이 아니다         | C          |
| `structure.test.ts`                                                                          | 구조 보장 시험(프로세스·네트워크 사용 위치, 기존 게이트 비연결, 규칙 원문 부재) | C          |

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
```

`run`의 전체 인자는 `cli.ts --help`에 있다. `precheck`와 `scope`는 읽기 전용이고 Semgrep을 쓰지 않는다.

종료 코드: 0 통과, 1 불일치·거부·실패, 2 사용법 오류, 3 NOT_RUN(실행 방지 장치).

## 실제 실행 전에 남은 전제 (이 변경에는 없다)

방지 장치를 통과해도 아래가 채워지기 전에는 사전 검사가 거부해서 프로세스가 시작되지 않는다. 비어 있는 채로
`COMPLETE`가 되는 경로는 없다.

1. 도구 버전 관측(`toolVersionObserved`)과 휠 sha256 관측(`wheelSha256Observed`). `pin.json`의 휠 해시는 `verified: false`다.
2. 같은 트리의 다른 서버 프로세스 검사(`foreignServerProcesses`)와 실제 실행 잠금(지금은 실행별 `run.lock` 표지뿐이다).
3. 하네스가 여는 루프백 메트릭 수신기(`metricsReceiverHits`). 이 변경에는 수신기가 없다.
4. target 실행에 쓸 대조 실행 기록(`controlReference`)을 `run.json`에서 읽어 연결하는 코드.
5. 실행 인자 `lsp --debug`, `SEMGREP_*` 환경변수 이름, 단계별 시간 한도, `scan` 설정값은 모두 **미확인**이다(ADR U3·U8·U12).
