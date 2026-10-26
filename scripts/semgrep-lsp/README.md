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
- 밖으로 나가는 네트워크 통신. 네트워크 모듈은 루프백 수신기(`metrics-node.ts`)와 그 시험 클라이언트(`testing/loopback-client.ts`)만 가져오며
  `127.0.0.1`에만 바인딩·접속한다(구조 시험이 지킨다).

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
| `testing/memory-run-lock.ts`, `testing/fake-metrics.ts`                                      | 잠금·수신기 시험 지원(메모리 포트, 가짜 수신기)                                         | B          |
| `testing/loopback-client.ts`, `testing/lock-child.mjs`                                       | 루프백 시험 클라이언트(127.0.0.1 전용), 잠금 경쟁 자식 프로세스                         | C          |
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
  맞게 꾸미면 이 어댑터로는 구별할 수 없다. 지금은 엔진 음성 대조를 `PASS`로 기록하는 운영 코드가 없어
  이 저장소가 만든 어떤 기록도 수락 조건을 채우지 못한다 — 수락 경로는 시험용 합성 기록으로만 시험했다.

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
- **증거 폴더는 서버 트리 밖이어야 한다**: `<evidence-root>/<run-id>`가 서버 트리와 같거나 그 안이면 CLI는 잠금을 얻기 전에 사용법 오류(2)로,
  `runHarness`는 쓰기 전에 하드 실패(`config`)로 거절한다. 안에 쓰면 잠금이 없는 실행도 증거 파일로 다른 실행의 트리를 바꾸게 된다.
  비교는 사전식이다(링크·`..`를 풀지 않는다).
- **다른 서버 프로세스 검사는 구현하지 않았다.** 잠금을 얻었다는 이유로 `foreignServerProcesses`를 0으로 채우지 않는다. 계속 `null`이라
  `FOREIGN_SERVER_PROCESS`로 거부된다. 잠금은 "하네스끼리의" 상호 배제일 뿐 하네스 밖에서 같은 트리를 쓰는 서버 프로세스를 막지 못한다.

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
- 경로를 푼 **뒤**에 일어나는 변경은 막지 못한다. 잠금을 얻은 다음에 누가 경로 안의 폴더를 링크로 바꾸면 키가 가리키던 자리와 실제로
  쓰는 자리가 달라질 수 있다(풀기와 쓰기 사이의 틈).
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
방지 장치 → 인자 → 공유 잠금 획득(서버 트리) → 증거 표지(run.marker) → 루프백 수신기 시작 → [기록 읽기] → 하네스(잠금이 있을 때만 서버 트리
준비 → 사전 검사 → 세션 → 판정 시점 관측 → 증거 쓰기) → finally: 수신기 닫기 → 잠금 해제 → 출력(cleanup 포함)
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

## 실제 실행 전에 남은 전제 (이 변경에는 없다)

방지 장치를 통과해도 아래가 채워지기 전에는 사전 검사가 거부해서 프로세스가 시작되지 않는다. 비어 있는 채로
`COMPLETE`가 되는 경로는 없다.

1. 도구 버전 관측(`toolVersionObserved`)과 휠 sha256 관측(`wheelSha256Observed`). `pin.json`의 휠 해시는 `verified: false`다.
2. 같은 트리의 다른 서버 프로세스 검사(`foreignServerProcesses`). 공유 실행 잠금은 구현했지만(위 절) 이 값을 채우지 않는다 — 계속 `null`이다.
3. (해결: 루프백 메트릭 수신기를 구현했다 — 위 절. 다만 실제 Semgrep이 `SEMGREP_METRICS_URL` 등을 읽는지는 **미확인**이고, 0건은 외부 통신 전체가
   없었다는 증거가 아니다.)
4. (해결: `--control-record` 어댑터가 명시한 `run.json`을 읽어 연결한다. 다만 수락 조건을 채우는 기록은 아래 5번이 있어야 만들어진다.)
5. 엔진 음성 대조 실행기와 그 결과를 `PASS`로 표시·기록하는 코드(없으면 실제 control 실행도 `eligible=false`다).
6. 실행 인자 `lsp --debug`, `SEMGREP_*` 환경변수 이름, 단계별 시간 한도, `scan` 설정값은 모두 **미확인**이다(ADR U3·U8·U12).
