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
| `control.ts`                                                                                 | 대조 단언 A1~A4, 정상 쌍, 음성 대조                                                     | B          |
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
| `harness.ts`                                                                                 | 범위 계산 → 사전 검사 → 세션 → 판정 → 증거를 잇는 함수                                  | C          |
| `cli.ts`                                                                                     | 명령줄 진입점, 실제 실행 방지 장치                                                      | C          |
| `testing/stub-lsp.ts`, `testing/stub-child.mjs`                                              | 시험용 LSP 스텁(메모리·`node`로 띄우는 별도 프로세스). Semgrep이 아니다                 | C          |
| `structure.test.ts`                                                                          | 구조 보장 시험(프로세스·네트워크 사용 위치, 기존 게이트 비연결, 규칙 원문 부재)         | C          |

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
```

`run`의 전체 인자는 `cli.ts --help`에 있다. `precheck`와 `scope`는 읽기 전용이고 Semgrep을 쓰지 않는다.

`run`의 경로 계약:

| 옵션                      | target                                         | control     |
| ------------------------- | ---------------------------------------------- | ----------- |
| `--repo`, `--target-sha`  | 필수. 검사 대상 저장소와 커밋                  | 쓰지 않는다 |
| `--scan-root`             | 필수. 대상 SHA에서 만든(또는 대조할) 스캔 트리 | 쓰지 않는다 |
| `--control-fixtures-root` | 선택. 대조 지문 계산에 읽는 대조 예제의 저장소 | 필수        |
| `--control-tree-root`     | 쓰지 않는다(자리표시 경로로 남는다)            | 필수        |
| `--control-record`        | 선택. 대조 실행의 `run.json` 한 개(명시만)     | 쓸 수 없다  |

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
- 수락한 요약은 기존 `toControlReference`로 만들고(자격은 재계산한 값), target 판정이 **이번 실행의** 핀·도구·규칙·하네스·대조 지문과
  결합을 다시 맞춘다. 기록의 지문을 이번 실행의 지문으로 바꾸거나, 이번 실행이 관측하지 못한 값(도구 버전·휠·결합)을 기록의
  값으로 채우지 않는다.
- 거절하면 참조 없이 진행한다: 사유 `CONTROL_REFERENCE_RECORD_REJECTED`(상세 = 이유 토큰과 필드 경로, 값 없음)와
  `CONTROL_REFERENCE_MISSING`이 함께 남고 대표 상태는 `CONTROL_MISSING`이며 `COMPLETE`가 될 수 없다. 출력 JSON의
  `control_record`에 경로·수락 여부·거절 이유가 있다.
- **한계**: 기록 파일은 서명되어 있지 않다. 어댑터는 기록의 자기 일관성과 이번 실행과의 지문 일치를 확인할 뿐 파일이 실제 Semgrep
  실행에서 나왔다는 것은 증명하지 못한다(출처 위조는 막지 못한다). 지금은 엔진 음성 대조를 `PASS`로 기록하는 운영 코드가 없어
  이 저장소가 만든 어떤 기록도 수락 조건을 채우지 못한다 — 수락 경로는 시험용 합성 기록으로만 시험했다.

종료 코드: 0 통과, 1 불일치·거부·실패, 2 사용법 오류, 3 NOT_RUN(실행 방지 장치).

## 실제 실행 전에 남은 전제 (이 변경에는 없다)

방지 장치를 통과해도 아래가 채워지기 전에는 사전 검사가 거부해서 프로세스가 시작되지 않는다. 비어 있는 채로
`COMPLETE`가 되는 경로는 없다.

1. 도구 버전 관측(`toolVersionObserved`)과 휠 sha256 관측(`wheelSha256Observed`). `pin.json`의 휠 해시는 `verified: false`다.
2. 같은 트리의 다른 서버 프로세스 검사(`foreignServerProcesses`)와 실제 실행 잠금(지금은 실행별 `run.lock` 표지뿐이다).
3. 하네스가 여는 루프백 메트릭 수신기(`metricsReceiverHits`). 이 변경에는 수신기가 없다.
4. (해결: `--control-record` 어댑터가 명시한 `run.json`을 읽어 연결한다. 다만 수락 조건을 채우는 기록은 아래 5번이 있어야 만들어진다.)
5. 엔진 음성 대조 실행기와 그 결과를 `PASS`로 표시·기록하는 코드(없으면 실제 control 실행도 `eligible=false`다).
6. 실행 인자 `lsp --debug`, `SEMGREP_*` 환경변수 이름, 단계별 시간 한도, `scan` 설정값은 모두 **미확인**이다(ADR U3·U8·U12).
