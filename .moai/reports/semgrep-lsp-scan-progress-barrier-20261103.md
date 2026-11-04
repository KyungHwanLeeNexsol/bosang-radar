# LSP-SCAN-1 초기 진행 메시지 장벽: `didOpen` 전에 stdout의 초기 진행 수명주기 두 개를 끝까지 읽는다

- 작성일: 2026-11-03
- 기준: PR #44 HEAD `6a565f3039162fd90544a7fe9a5e34e4bb8de9e7`. 시작 전에 로컬 워크트리·원격 브랜치·PR #44가 모두 이 커밋이고 작업 트리가 깨끗함을 확인했다. 같은 목적의 후속 브랜치나 PR은 없었다(열린 PR은 #25와 #28~#44뿐이었다). 이 작업은 새 브랜치 `security/semgrep-lsp-scan-progress-barrier`와 별도 Draft PR로 올린다. PR #43·#44는 수정하지 않았다.
- 성격: **구현과 합성·스텁 검증까지다.** 실제 Semgrep은 실행하지도 임포트하지도 않았고, 시스템 격리(계정·방화벽·감사·ACL)도 적용하지 않았다. 네트워크 프로브, 규칙 다운로드, 실제 스캔, 기존 관측 재실행도 하지 않았다. 새 RunId의 실제 재시도 승인도 내리지 않았다.
- 바꾸지 않은 것: `pin.json`, `verified`, `policy_accepted`, ADR 상태, 프로브 규칙(233바이트)과 합성 파일(135바이트)의 고정 해시, 진단 성공 조건, URI·`code`·범위, 외부 명령 정책, 모든 한도(`scanMs=30000`, `settleMs=2000` 포함), 프레임 파서, mode 결합, 확인 인자, 실행 시도 표지, 복구 방어, 기존 MIN·RULES 파일, A6의 정의(`didOpen` 뒤에 읽힌 서버 요청은 허용하지 않는다).
- 2026-11-04 후속: 소유자가 구현 방향을 수용하고 남은 5.1 회귀만 마무리하라고 지시해 같은 PR에서 검증을 이어 갔다. 코드(운영·계약·스텁·러너)는 바꾸지 않았고 시험 도구 한 파일에 분할 실행 인자만 더했다. 5.1 러너·관리자·프레임 시험을 모두 통과시켰고(13절), 소스 줄 번호를 원문으로 확정했다(3절, 13.6). 이 후속에서도 실제 Semgrep 실행·임포트, 시스템 격리 적용, 네트워크 프로브, 실제 스캔, 기존 관측 재실행, 새 RunId 재시도는 하지 않았다. `pin.json`·`verified`·`policy_accepted`·ADR 상태도 그대로다.
- 구분 표기: **합성** TS 단위·실행기 시험, **스텁·5.1** 이 PC의 Windows PowerShell 5.1에서 모의 시스템·무해한 스텁으로 돌린 시험, **오프라인 재해석** 저장된 실제 원문을 서버 없이 분석기에 먹인 것, **미검증** 확인하지 못한 것.

## 1. 결론

| 질문 | 답 |
| --- | --- |
| 무엇을 고쳤는가 | `didOpen`을 보내도 되는 조건에 "stdout에서 초기 진행 수명주기 두 개(규칙 새로고침, 초기 열린 문서 스캔)가 완전한 프레임으로 끝까지 읽혔다"를 더했다. TS 실시간 추적기·장벽·쓰기 직전 방어선·사후 재해석과 PowerShell 대응 구현을 함께 바꿨다 |
| A6를 풀었는가 | 아니다. `didOpen` 뒤에 읽힌 서버 요청은 여전히 A6로 중단된다. stderr의 토큰 생성 줄과 맞는다는 이유로 예외를 두거나 사전 요청으로 소급하지 않는다. 고정 시간 대기·무출력 시간·반복 횟수로 완료를 추정하지도 않는다 |
| 수정 전 실패가 재현됐는가 | 그렇다. TS 재현 시험 5건이 수정 전에 모두 실패했고, 같은 합성 입력에서 **실제 관측과 같은 판정 `ABORTED:SERVER_REQUEST_NOT_ALLOWED`가 다시 나왔다**(4절). PowerShell은 수정 전 코드에 새 골든을 대면 지연 사례 네 가지 모두 `ready=True clean=True`였다 |
| 실제 관측 원문에 대면 | 저장된 실제 stdout을 새 분석기에 오프라인으로 먹이면, 실제 `didOpen` 송신 위치(stdout 1,463바이트)에서는 `INCOMPLETE`(`PROGRESS_CREATE_COUNT_1`)라 새 장벽이 열리지 않았을 상태다. 저장된 stdout 전체는 `COMPLETE`로 새 계약에 어긋나지 않는다(5절, 도출) |
| 기존 결과는 | 보존했다. `ABORTED` 판정, 표지, 원본 증거, 해시는 바꾸지 않았고 원본 증거 5개의 크기·해시가 PR #44 보고서 7절과 지금도 같다 |
| 검증 | TS 전체 회귀 84파일 4,235건 통과(기준선 82파일 4,186건). 5.1 골든 177건 일치. 제한된 변이 26건(TS 17·PS 9)을 모두 잡았고 매번 원본 해시 복원을 확인했다. 2026-11-03에는 5.1 전체 러너 시험이 메모리 부족으로 중단되었으나(9절), **2026-11-04에 분할 실행으로 5.1 러너 1,363건·관리자 224건·프레임 125건을 모두 통과(실패 0, 건너뜀 0)시켰다**(13절) |

## 2. 문제와 계약 변경 이유

PR #44의 보고서(`semgrep-lsp-scan-observation-20261103.md` 5.7절)가 남긴 사실: 중단을 일으킨 요청은 stdout 프레임 6(`window/workDoneProgress/create`, 초기 열린 문서 스캔의 토큰)이고, 러너는 이 프레임을 `didOpen`을 보낸 뒤에 처음 읽었다. 서버가 stderr에 그 토큰을 만들었다고 적은 위치(바이트 10,102)는 `didOpen` 송신 때의 stderr 읽기 위치(11,944)보다 앞이었다.

기존 장벽은 stdout `rulesRefreshed`와 stderr `Scanned open documents`만 기다렸다. 두 스트림은 독립된 파이프라 한쪽 도착 시각이 서버 내부 순서를 말해 주지 않으므로, stderr 쪽 신호가 다 와도 초기 열린 문서 스캔의 진행 요청·begin·end는 stdout에서 아직 읽히지 않았을 수 있다. 외부 검토가 TS와 PowerShell 양쪽에서 재현한 순서는 다음과 같다: 초기화 응답·첫 진행 묶음·`rulesRefreshed` 수신 → stderr의 초기 열린 문서 스캔 완료 줄 수신 → 장벽 `ready=true, clean=true` → `didOpen` 송신 → 늦게 전달된 두 번째 진행 요청에서 A6 중단.

A6를 느슨하게 하면 `didOpen` 뒤의 진짜 추가 요청(허용 밖 동작)도 놓치게 된다. 그래서 A6는 그대로 두고, **그 요청이 오기를 기다린 뒤에만 `didOpen`을 보내도록** 장벽을 넓혔다. 이 변경은 "서버가 `didOpen`에 반응해 요청을 보냈다"는 판정 의미를 지키면서, "`didOpen` 이전 구간의 요청이 늦게 읽혔다"는 읽기 시점의 우연이 관측을 무너뜨리지 못하게 한다.

## 3. 새 장벽의 계약

출처를 나누어 적는다. 바이너리와 공개 소스의 대응은 계속 미확인이다.

| 항목 | 내용 | 출처 |
| --- | --- | --- |
| 메시지 순서 | `create → begin → end → rulesRefreshed → create → begin → end` | 소스 도출(고정 커밋 `a35fe8306115b3e55274969098cc46f8451d6b4d`: 규칙 새로고침이 `create_progress` → 규칙 읽기 → `end_progress` → `rulesRefreshed` 알림 → 열린 문서 스캔 호출, 열린 문서 스캔이 `create_progress` → 스캔 → `end_progress`) + 2026-11-03 실제 관측 1회의 프레임 순서(응답, create, begin, end, rulesRefreshed, create, begin, end, 진단)와 일치 |
| 단계 식별 | 첫 수명주기는 begin의 제목·문구가 `Semgrep` / `Refreshing Rules`, 둘째는 `Semgrep Scan in Progress` / `Scanning Open Documents` | 같은 출처. 비교는 서수 비교다 |
| 요청 id와 토큰 | 서로 다른 값이고, 토큰은 값과 자료형이 모두 같아야 같은 토큰이다(숫자 1과 문자열 "1"은 다르다). 요청 id를 토큰 자리에 쓴 알림은 등록되지 않은 토큰이다 | 요구사항. 실제 관측에서 둘은 서로 다른 UUID 문자열이었다 |
| 토큰 값 | 상수로 쓰지 않는다(이번 실행의 UUID 없음). 시험의 토큰은 합성 값이다 | 요구사항 |
| 완료 | 올바른 모양의 create 정확히 두 건, 각 토큰의 begin·end 한 건씩 완전한 프레임, 수명주기가 섞이지 않음, `rulesRefreshed` 정확히 1회가 계약 위치. 알 수 없거나 불완전한 상태는 완료가 아니다 | 요구사항 |
| 기존 조건 | stdout `rulesRefreshed`와 stderr `Scanned open documents`, 맨줄·로딩·오류·외부 명령 정책은 그대로 필요하다 | 유지 |
| 기다림 | 기존 `rulesMs`와 전체 한도 안에서만 기다린다. 별도 유예·연장·재시도는 없고 `scanMs`는 실제 `didOpen` 송신부터 센다 | 유지 |

소스 줄 번호에 대해(2026-11-04 갱신): 2026-11-03 작업에서는 웹 조회 도구가 요약만 돌려주어 줄 번호를 확정하지 못했고 PR #42·#44 계획 보고서가 인용한 값(S08~S16, P01~P05)에 기댔다. 2026-11-04에 고정 커밋의 `Legacy_scan_helpers.ml`·`Legacy_lsp_.ml` 원문 바이트를 직접 받아 git blob 해시를 계산해 대조하고 줄 단위로 읽었다. `scan_open_documents`는 262~279행, `refresh_rules`는 320~335행이며, `create_progress`·`end_progress`의 호출 위치와 `Legacy_lsp_.ml`의 정의(122~137행, 140~146행)까지 위 표의 순서와 맞고, 외부 검토가 확인한 값과 모두 일치한다. 줄별 표와 해시는 13.6절에 있다. 이는 소스 읽기이며 소스와 바이너리의 대응이 증명된 것은 아니다.

**상태 세 가지.** `COMPLETE`(문제 없음), `INCOMPLETE`(아직 오지 않은 프레임뿐이라 더 기다리면 완료될 수 있음), `INVALID`(이미 계약을 어김: 중복·미등록 토큰·짝 없는 begin/end·계약 밖 kind·단계 뒤바뀜·순서 위반·세 번째 create 등. 스트림 안의 순서는 되돌릴 수 없으므로 더 기다려도 완료되지 않는다). 기다림의 종료 조건은 `COMPLETE` 또는 `INVALID`다. `INVALID`면 장벽은 열린 것으로 세어 기다림은 끝나지만 `clean`이 아니라서 `didOpen`을 보내지 않고, 짧은 감시 뒤 정상 종료한다.

## 4. 구현

| 파일 | 변경 |
| --- | --- |
| `scripts/semgrep-lsp/lsp-scan-progress.ts` (새 파일) | 순수 분석기 `analyzeScanProgress`, 실시간 추적기 `ScanProgressTracker`, 단계 상수. 실시간 경로와 사후 재해석이 같은 함수를 쓴다 |
| `lsp-scan-watch.ts` | `ScanLiveWatch`가 진행 추적기를 갖고, `barrierReady()`·`barrierStatus()`·`progressComplete()`가 진행 상태를 보며, `markDidOpenSent()`가 추적기를 얼린다. `evaluateScanBarrier`는 진행 분석을 필수 인자로 받는다(빠뜨린 호출이 조용히 통과하지 않도록 선택 인자로 두지 않았다) |
| `lsp-scan.ts` | 쓰기 직전 방어선 `ScanSendGuardContext.progressComplete`(필수). `true`가 아닌 모든 값(없음 포함)은 거절. `analyzeScanStdout`이 진행 프레임을 바이트 구간과 함께 모은다 |
| `lsp-scan-run.ts` | 방어선에 `progressComplete`를 넘기고, 거절 사유 코드 `DID_OPEN_BEFORE_PROGRESS`를 더했다. 기다림은 기존 `barrierReady()` 하나다 |
| `lsp-scan-record.ts` | `didOpen` 송신 때의 stdout 위치 앞에서 **완전히 끝난** 프레임만으로 원문에서 다시 확인한다(위치에 걸친 프레임은 읽히지 않은 것). 조건 4에 진행 문제 토큰과 `DID_OPEN_BEFORE_BARRIER_PROGRESS`를 싣고(무결성 사유라 `NOT_OBSERVED`), 확인 불가 사유 `BARRIER_PROGRESS_INCOMPLETE`·`BARRIER_PROGRESS_INVALID`를 더했다. 기록의 `evidence.progress_barrier`에 요청·토큰·begin/end 프레임·상태·사유를 남긴다 |
| `LspScanContract.ps1` | 같은 분석기·장벽·방어선·얼림의 PowerShell 대응. 사전은 대소문자를 구별하지 않는 해시테이블 대신 서수 비교 `Dictionary`·`HashSet`을 쓴다 |
| `lsp-scan-runner.ps1`, `lsp-scan-stub.ps1`, `LspScanAdminContract.ps1`, `Test-LspScanObservation.ps1` | 러너가 방어선에 `progressComplete`를 넘김. 스텁 시나리오 4개(`late-initial-progress`, `late-initial-progress-split`, `initial-progress-incomplete`, `initial-progress-wrong-token`)와 이름 목록 네 곳의 일치. 진입점 dry-run 안내가 `didOpen`·`scanMs`·새 장벽 조건을 말한다(표시만 바꿨고 실행 계약은 넓히지 않았다) |
| 시험·골든 | `lsp-scan-progress.test.ts`, `lsp-scan-progress-barrier.test.ts`(새 파일), `testing/scan-fixtures.ts`, `lsp-scan-bridge.mts`, `lsp-scan-parity.json`, `Test-LspScanRunner.ps1` 외 기존 시험의 인자 보정 |

기록 스키마 문자열(`semgrep-lsp-scan-observation/1`)은 그대로이고 `evidence.progress_barrier`는 **추가 필드**다. 이전 기록과의 호환을 위해 필드를 빼지는 않았지만, 스키마 버전은 올리지 않았다.

## 5. 수정 전후 재현

### 5.1 TS (합성)

수정 전 코드에서 재현 시험 5건(`lsp-scan-progress-barrier.test.ts`)을 먼저 썼고 모두 실패했다(`repro-before-fix.log`).

| 시험 | 수정 전 실패 내용 |
| --- | --- |
| stderr가 `Scanned open documents`까지 왔지만 두 번째 진행 묶음이 없다 | 장벽이 `ready`였다(기대: 아님) |
| 두 번째 create만, create+begin만, end 프레임 일부만 온 상태 | create만 온 시점에 이미 `ready`였다 |
| 실행기: 두 번째 묶음이 한참 늦게 온다 | `didOpen`이 initialized 뒤 70ms에 나갔다(기대: 602ms 이후). 판정이 **`ABORTED:SERVER_REQUEST_NOT_ALLOWED`**로 실제 관측과 같았다 |
| 실행기: 두 번째 묶음이 create·begin까지만 오고 끝나지 않는다 | `didOpen`이 1건 나갔다(기대: 0건) |
| 사후 재해석: `didOpen` 위치가 두 번째 묶음보다 앞이다 | 같은 이유로 처음 단정에서 실패 |

수정 후 5건 모두 통과했고, 이후 변이 점검이 드러낸 빈틈을 메우는 2건을 더해 11건(`lsp-scan-progress-barrier.test.ts`)이 통과한다.

### 5.2 PowerShell (5.1, 수정 전 코드 대 수정 후 코드)

기준 커밋 `6a565f3`의 PS 파일에 새 골든을 대고, 두 번째 진행 묶음이 늦게 오는 감시 대본에서 stderr 장벽 줄까지 온 단계의 장벽 상태를 찍었다(`ps-barrier-before-after.log`).

| 두 번째 진행 묶음 | 수정 전 `ready` / `clean` | 수정 후 `ready` / `clean` (상태) |
| --- | --- | --- |
| 없음 | True / True | False / False (INCOMPLETE) |
| create만 | True / True | False / False (INCOMPLETE) |
| create+begin | True / True | False / False (INCOMPLETE) |
| end 일부만 | True / True | False / False (INCOMPLETE) |
| 완전 수신 | True / True | True / True (COMPLETE) |

수정 전 코드에 새 골든 전체를 대면 76건(사례와 점검 합산)이 어긋난다(`ps-golden-vs-prefix-code.log`). 대부분은 새 필드(`progressState`)와 정정된 메시지 순서 때문이고, 위 표가 버그 자체를 보여 주는 지점이다.

## 6. 실제 관측 원문의 오프라인 재해석 (도출)

PR #44가 저장한 stdout 원문(2,699바이트, 프레임 9개)을 읽기 전용으로 새 분석기에 먹였다(`replay-real-stdout-offline.log`). 서버는 띄우지 않았다.

| 평가 범위 | 결과 |
| --- | --- |
| 실제 `didOpen` 송신 위치(stdout 1,463바이트)까지 완전히 읽힌 프레임 | `INCOMPLETE` — 문제 `PROGRESS_CREATE_COUNT_1`. 첫 수명주기(`REFRESH_RULES`)만 완료. 새 장벽이었다면 이 시점에 `didOpen`을 보내지 않았을 상태다 |
| 저장된 stdout 전체 | `COMPLETE` — 수명주기 둘(`REFRESH_RULES`, `SCAN_OPEN_DOCUMENTS`)이 모두 완료, 요청 id와 토큰은 서로 다른 문자열 |

이는 새 계약이 그 한 번의 실제 프레임과 어긋나지 않는다는 확인이며, **도출**이다. `didOpen`을 보류했다면 서버가 그 뒤에 어떻게 움직였을지, 서버가 프레임 6을 stdout에 쓴 시각이 `didOpen` 송신 전이었는지는 여전히 알 수 없다(PR #44 보고서 5.7절의 미확인 그대로).

## 7. 기존 결과의 보존

- RunId `20261103T024748Z-3e4360b8`은 소모된 채다. 실행 시도 표지, 원본 증거, 해시, 판정(`ABORTED:SERVER_REQUEST_NOT_ALLOWED`, 13/16 조건 `PASS`)을 수정하지 않았다. 이번 작업은 그 폴더를 읽기만 했다.
- 원본 증거 5개를 지금 다시 해시해 PR #44 보고서 7절과 대조했다: 관측 기록 58,764바이트, 판정 기록 16,525바이트, stdout 2,699바이트, stderr 18,413바이트, 실행 시도 표지 611바이트 모두 크기와 SHA-256이 같다.
- 기대 진단 1건과 엔진 로그(규칙 1·대상 1·매치 1·건너뜀 0)가 일치했다는 사실은 **부분 관측**으로만 인용한다. 정상 종료나 전체 관측 성공으로 승격하지 않는다.
- 이번 범위 밖으로 유지한 것: 식별 불가 5157의 처리 정책, 복구 입력이 없는 재해석 기록의 표기, 약 0.9초 중단 지연의 조사, 소스와 바이너리의 대응, 과거 `--version` 시간 초과의 원인. 해결로 기록하지 않는다.

## 8. 정정한 조립기와 바뀐 기존 기대값

**SCAN 시험용 정상 메시지 조립기를 고정 소스·실제 관측의 순서에 맞게 정정했다.**

- `testing/scan-fixtures.ts`의 `barrierStdoutMessages()`: 이전에는 새로고침의 end를 `rulesRefreshed` **뒤**에 놓았고 begin의 값이 `{ kind, title: "x" }`였다(제목·문구가 소스와 다름). 지금은 `create → begin → end → rulesRefreshed → create → begin → end`이고 begin이 `{ kind, title, message }`다.
- `lsp-scan-stub.ps1`: 정상 경로의 새로고침 end를 `rulesRefreshed` 앞(64ms)으로, begin의 제목·문구를 소스 값으로 바꿨다. 이전 `Get-ProgressNote`는 `Get-ProgressBegin`·`Get-ProgressEnd`로 대체했다.
- RULES 조립기(`testing/rules-fixtures.ts`, `rules-facts.ts` 등)와 RULES·MIN 파일은 바꾸지 않았다. SCAN 쪽은 RULES의 `progressCreate`·`RULES_REFRESHED`를 읽기 전용으로 재사용한다.

**기존 정상 기대값이 바뀐 곳.**

- 골든은 137건에서 177건이 됐다(새 사례 40건: 지연된 진행 묶음 감시 대본 9, 진행 분석 28, 송신 방어선 3). 기존 사례 중 감시 대본 31건의 기대값이 바뀌었다. 정규화(새 필드 `progressState`, 장벽 `problems`의 `PROGRESS_*` 토큰, 새 프레임 길이에 따른 `stdoutBytes` 제외)해서 비교하면 `happy-chunks-64` 한 건만 남는데, 프레임이 길어져 stdout 청크가 24개에서 27개로 늘어 단계 번호가 밀린 것이다. 의미가 바뀐 기존 사례는 없다. 나머지 32건은 입력만 바뀌었다(방어선 인자 추가, 조립기 정정).
- 기존 시험의 인자 보정: `lsp-scan-watch.test.ts`(`evaluateScanBarrier`의 네 번째 인자, 장벽 상태 키에 `progressState`), `lsp-scan.test.ts`(방어선 인자 `progressComplete`), `structure.test.ts`(가져오기 목록에 `lsp-scan-progress` 추가, 새 모듈을 핵심 모듈 목록에 추가), `Test-LspScanRunner.ps1`(골든 종류 여섯, 방어선 점검 인자, 단위 확인에서 가짜 감시기에 정상 진행 묶음을 먹임, 시나리오 표 4건, 러너가 쓰는 판정 확인).

## 9. 검증 환경과 결과

환경: Windows 11, Windows PowerShell 5.1.26100, Node 24.22.1, vitest 4.1.11(워크트리의 `node_modules`는 다른 워크트리 것을 연결해 썼다).

| 항목 | 결과 | 구분 |
| --- | --- | --- |
| `vitest run scripts/semgrep-lsp` 기준선(수정 전) | 82파일, 4,186 통과, 8 건너뜀 | 합성 |
| 같은 명령, 최종 상태 | **84파일, 4,235 통과, 8 건너뜀** (`ts-full-regression-final.log`) | 합성 |
| 새 시험 | `lsp-scan-progress.test.ts`(계약 상수, 정상, 누락 5개 사례, 위반 15개 사례, 자료형 혼동, id/토큰 혼동, 순서 위반 3건, 분할 불변성, 사후 재해석), `lsp-scan-progress-barrier.test.ts` 11건 | 합성 |
| 분할·순서 불변성 | 청크 크기(stdout 1·3·17·64, stderr 1·29·전체)와 stdout/stderr 도착 순서를 바꿔도 같은 결과. 바이트를 하나씩 먹이면 마지막 바이트에서만 완료 | 합성 |
| TS 골든 대조 | 177건 + 점검 3건, 5.1에서 **일치 180/180** | 스텁·5.1 |
| 5.1 단위(2·4절, tsx 제외) | 33/33 (`Send-LsMessage` 단위: 장벽을 넘었어도 진행이 미완이면 쓰지 않고 A10 `DID_OPEN_BEFORE_PROGRESS`) | 스텁·5.1 |
| 5.1 범위 축소 실행(새 시나리오 4개 + 단위 + tsx 대조) | 323/324 통과. 실패 1건은 방어선 계약 점검이 옛 인자로 호출한 것이라 인자를 고치고 따로 22/22로 확인 | 스텁·5.1 |
| 새 스텁 시나리오 | `late-initial-progress`, `late-initial-progress-split`(`didOpen`이 두 번째 묶음을 다 읽은 뒤에만 나가고 판정이 `SCAN_RESPONSE_OBSERVED`), `initial-progress-incomplete`(기존 장벽 한도 안에서만 기다리고 `NOT_OBSERVED:RULES_TIMEOUT`, `didOpen` 0건), `initial-progress-wrong-token`(`NOT_CONFIRMED:BARRIER_PROGRESS_INVALID`, `didOpen` 0건) | 스텁·5.1 |
| 시나리오 이름 목록 | 스텁·러너·관리자 계약·진입점이 94개씩 같은 순서(정적 대조) | 정적 |
| 서식·정적 검사 | 바뀐 `ts`·`mts`·`json`·`md`에 `prettier --check` 통과, 바뀐 TS에 `eslint` 오류 0, SCAN 관련 파일만 임시 설정으로 `tsc --noEmit` 오류 0 | 정적 |
| 제한된 변이 | **26건 모두 잡힘**(TS 17: 첫 실행 15, 보강 후 2 / PS 9: 첫 실행 8, 보강 후 1). 매번 변이가 파일 해시를 바꿨는지와 원본 복원 해시를 확인했고, 구문을 깨는 변이는 잡힌 것으로 세지 않았다 | 합성·5.1 |

변이가 처음에 놓친 세 건과 보강: TS `didOpen` 직전 추적기 얼림(감시기 수준의 얼림 시험 추가), TS 실행기가 `progressComplete`를 항상 true로 넘김(시험 이음새 `attemptSends`로 장벽이 열렸지만 진행이 위반인 상태에서 `didOpen`을 시도해 방어선이 직접 거절하는지 확인), PS `Test-LsBarrierReady`가 진행 상태를 보지 않음(골든은 평가 함수만 비교하므로 러너가 쓰는 가벼운 판정을 지연 사례에 직접 되감아 확인).

**미검증 (메모리 부족 중단; 2026-11-03 시점의 기록이며 2026-11-04에 13절에서 해소했다).** 5.1 전체 러너 시험(`Test-LspScanRunner.ps1` 전체, 약 12분, PowerShell 프로세스를 수백 번 띄움)을 한 번 돌리던 중 시스템 메모리 부족으로 Claude Code가 백그라운드 명령을 멈췄다. 시험 자체의 실패가 아니다. 남아 있던 시험 프로세스 트리는 확인해서 정리했고, 알림에 따라 같은 시험을 임의로 다시 돌리지 않았다. 그래서 다음은 **돌리지 않았다**: 기존 스텁 시나리오 수십 개의 5.1 end-to-end 회귀(정상 경로 순서를 정정했으므로 영향받을 수 있다), `Test-LspScanAdmin.ps1`, `Test-LspScanFrame.ps1`, 도착 순서 행렬·거부 경로 시험. 새 스텁 시나리오 4개와 단위 확인만 범위를 줄여 돌렸다.

독립 감사와 대규모 변이 점검은 요청대로 반복하지 않았다.

## 10. 남은 한계

- 소스와 바이너리의 대응은 미확인이다. 위 계약은 한 번의 실제 관측과 소스 읽기에서 온 것이라, 다른 바이너리에서 단계 제목·문구나 메시지 순서가 다르면 장벽이 열리지 않아 `RULES_TIMEOUT`으로 끝난다. 안전한 쪽으로 어긋나지만 관측이 성립하지 않는다.
- 이 장벽이 실제 Semgrep에서 `ABORTED`를 없앤다는 것은 말하지 않는다. 6절의 오프라인 재해석과 합성 재현이 근거의 전부이며, 서버가 프레임 6을 stdout에 쓴 시각은 알 수 없다.
- 장벽은 "stdout에서 읽힌 것"만 본다. 읽기 지연을 없애는 장치가 아니라 읽힐 때까지 기다리는 장치라서, 서버가 두 번째 진행 묶음을 `rulesMs` 안에 끝내 보내지 않으면 `RULES_TIMEOUT`이다.
- `INVALID`에서 장벽을 "열린 것"으로 세는 것은 기다림을 끝내기 위한 선택이다(더 기다려도 달라지지 않는다). 이 상태에서 `didOpen`은 나가지 않는다.
- 실행기의 사후 재해석은 러너의 `liveView`와 진행 상태를 대조하지 않는다. 러너 결과 스키마를 넓히지 않으려는 선택이며, 진행 상태는 원문에서만 다시 만든다(`TRACKER_DISAGREEMENT` 대상이 아니다).

## 11. 소유자 결정 (이번에 내리지 않음)

1. 새 RunId로 실제 관측을 다시 시도할지(승인 없음, 새 기준 저장·격리 적용·확인 인자가 다시 필요).
2. 5.1 전체 러너 시험·관리자 시험·프레임 시험을 메모리에 여유가 있을 때 다시 돌릴지. → 2026-11-04 소유자 지시로 분할 실행해 완료(13절). 남은 것은 단일 프로세스 `-Part All` 실행 여부뿐이다.
3. 단계 제목·문구와 메시지 순서를 이렇게 엄격히 고정할지(다른 바이너리에서는 장벽이 열리지 않을 수 있다).
4. 소스 줄 번호를 원문에서 다시 확정하는 작업을 할지. → 2026-11-04에 완료(13.6절).
5. 병합: PR #43·#44와 이 PR은 모두 Draft·미병합이다.

## 12. 증거 파일 (저장소 밖)

`%LOCALAPPDATA%\bosang-radar\semgrep-lsp-progress-barrier\` 아래에 보존했다.

| 파일 | 크기(바이트) | SHA-256 |
| --- | --- | --- |
| `baseline-vitest.log` | 683 | `4ff96495dccded6a6831384396edaac8d6c7dc45e6a7d73a72d3b893a84beb21` |
| `repro-before-fix.log` | 6,301 | `6cd0b0110799a18af2928ca2b480d70a626d9eead64e6f6e3c300fc94ae74649` |
| `repro-after-fix.log` | 649 | `87bc7721f107d4af9f07e899c2f40c7ad48ab34422a34cc78e98262db08e3468` |
| `ts-full-regression-final.log` | 676 | `41b8e49b76df354e50ff43818e83cce2f0c0cb843486c8a18164195cc33f10d8` |
| `ps-barrier-before-after.log` | 1,151 | `ed51a27d1c0968ccd0b8d5a02367358b62250c234f28b9649fc80eeb362e5806` |
| `ps-golden-vs-prefix-code.log` | 46,966 | `3af8ac260eda5ba963733ade6ec31a4031dd93aff1b434fe96653048656a3962` |
| `ps51-subset-run.log` | 177 | `2e28a3a7e05b91aec6231c2aee7afebe84b83c36b6d3c90828500d898826c660` |
| `ps51-final-results-summary.txt` | 558 | `eb81f7be7fe65ef76b489ae1289b5365385888e0e4306736d21d184f829e4c06` |
| `replay-real-stdout-offline.log` | 1,363 | `73cb9f304f5b7674b499654cdb909a37f92cb3166a40a7593cdfd6f4bff4a90b` |
| `mutation-ts-first-pass.json` | 7,827 | `4ed09ae25a5dba35c3748fa16962598165c3537b7790a84f115a46ce903810cd` |
| `mutation-ts-rerun-after-reinforcement.json` | 912 | `79b8f5b8c0579c0bcb372433bf012341eb2a7cf19b3e24fca8f9769ed13bc88b` |
| `mutation-ps-first-pass.json` | 3,947 | `c6da0215b5ad718fea405fafc3a68849c34f3b10790cf8e6761a57a51ef22614` |
| `mutation-ps-rerun-after-reinforcement.json` | 442 | `fb3191b7824b1238291e2f839909a23748a6cd5a3457ca93a02b03f6cd6d5073` |

`ps51-subset-run.log`가 177바이트인 것은 범위 축소 실행이 실패 줄과 요약 줄만 출력했기 때문이다(통과 항목은 출력하지 않는다). 그 로그는 한글 콘솔 인코딩 때문에 일부 글자가 깨져 있다.

## 13. 2026-11-04 후속 검증: 5.1 회귀 완료와 소스 줄 번호 확정

소유자가 구현 방향(초기 진행 수명주기 두 개를 stdout에서 완전히 읽은 뒤 `didOpen`, 단계 제목·문구와 순서 고정)을 수용하고 남은 5.1 회귀만 마무리하라고 지시해서 한 검증이다. 같은 PR #45에 기록하며 새 브랜치나 새 PR은 없다. A6의 `didOpen` 이후 서버 요청 금지, 한도, 해시, 진단 조건, 확인 인자, 실행 시도 표지, mode 결합, PR #44의 `ABORTED` 결과와 원본 증거는 건드리지 않았다.

### 13.1 기준과 환경

| 항목 | 내용 |
| --- | --- |
| 시험한 코드 SHA | `54718614d830c7e68305916409048dd3d9429389`. 시작 전에 로컬 HEAD, 원격 브랜치, PR #45 HEAD가 모두 이 값이고 작업 트리가 깨끗함을 확인했다 |
| 시험 도구 변경 | `tests/Test-LspScanRunner.ps1` 한 파일(13.2). 수정본 SHA-256 `9faae6454c1eb19b773d173435508c50a6414f454ceb97645f2d124022cacd25`. 운영 코드·계약·스텁·러너·골든·관리자·프레임 시험은 위 SHA와 바이트 동일하다(시험 시점의 `git status`가 이 시험 파일만 수정으로 표시) |
| 실행 환경 | Windows 11 Home 10.0.26200, Windows PowerShell 5.1.26100.9711, TS 대조용 Node 24.22.1. 모든 묶음은 새 5.1 프로세스에서 **순차** 실행했다(병렬 없음). 콘솔 출력은 UTF-8로 맞췄고 모든 시험을 `PSModulePath`를 비운 채 돌렸다 |
| 메모리 | 총 14,230MB. 묶음 시작 전 빈 메모리 848~2,157MB. 700MB 밑이면 시작하지 않는 안전선을 실행 스크립트에 두었고(메모리로 걸린 적 없음), 시작 전후로 남은 시험 프로세스가 0인지 확인했다. 그 점검이 딱 한 번(A1b 시작 전) "2개 남음"으로 시작을 막았으나, 곧바로 읽기 전용으로 다시 조회하니 해당 프로세스가 없었다. 직전에 내가 돌린 정리 명령의 명령줄이 검색 문구와 맞았던 것으로 보이며(가설), 같은 점검을 0으로 통과시킨 뒤 실행했다. 이번에는 메모리 부족 중단이 없었다. 다른 작업의 프로그램·프로세스는 종료하지 않았다 |
| 모의·건너뜀 | 계정·방화벽·감사·ACL은 모의 시스템에서만 다뤘다. 시스템 상태를 읽는 선택 구역(관리자 시험의 (E))은 `-SkipRealStateCheck`로 건너뛰었다 |

### 13.2 시험 도구 변경

이유: 단일 프로세스 전체 실행(약 12분, PowerShell 프로세스 수백 개)이 2026-11-03에 메모리 부족으로 중단되었기 때문이다. 운영 코드·판정·한도는 바꾸지 않았다.

- 새 인자: `-Part`(`All` 기본, `Pre`, `Cases`, `Post`, `Aggregate`), `-CaseFrom`·`-CaseTo`(시나리오 표의 번호 구간, 1부터), `-StateFile`(묶음 사이로 넘기는 결과 파일 위치, 저장소 밖), `-ResultsFile`(단언별 결과 JSON), `-KeepSandbox`.
- 구조: 1·3·4절과 정적 점검은 `if ($runPre)`, 5절 뒷부분은 `if ($runPost)`, 6절은 `if ($runAgg)`로 감쌌고 시나리오 루프는 표에서 번호 구간만 고른 `$casesToRun`을 돈다. `Cases`·`Post`는 결과 파일 위치를 `-StateFile`에 이어 적고(같은 이름은 바꿔 써서 같은 묶음을 다시 돌려도 겹치지 않는다), `Aggregate`가 그것을 모아 TS 어댑터 판정을 대조한다.
- 정의와 섞여 있어 건너뛸 수 없는 2절 계약 점검은 비-`Pre` 묶음에서 계산만 다시 하고 단언은 세지 않는다(`$Script:Recording`). `Pre`와 `All`이 센다.
- **기존 단언 보존.** 단언의 문구·조건·기대값을 바꾸거나 지우거나 느슨하게 하지 않았다. diff에서 사라진 4줄은 모두 다시 쓴 줄(`param` 선언, `Invoke-UnitTests` 호출 줄, 시나리오 루프 첫 줄, 샌드박스 삭제 줄)이다. 기본값 `-Part All`은 예전 실행 경로를 그대로 쓰도록 만들었다(이번에 실행해 보지는 않았다, 13.5).
- 파일은 BOM·LF를 유지하고 5.1 파서 오류가 0이다. `Pre` 묶음의 정적 점검과, 수정 뒤 다시 돌린 관리자 시험 `static`·`unit`(131/131)이 이 파일을 검사해 통과했다.

### 13.3 묶음별 결과 (모두 종료 코드 0)

| 시험 | 묶음 | 범위 | 단언 | 통과 / 실패 / 건너뜀 | 소요 |
| --- | --- | --- | --- | --- | --- |
| Frame | 전체 | 파서 사례·판단 사슬·TS 대조 | 125 | 125 / 0 / 0 | 수 초(미측정) |
| Admin | A1 | `static`, `unit` | 131 | 131 / 0 / 0 | 4초 |
| Admin | A2 | `control`, `dry-run`, `limits`, `not-attempted` | 20 | 20 / 0 / 0 | 28초 |
| Admin | A3 | `confirm`, `marker`, `marker-run` | 40 | 40 / 0 / 0 | 49초 |
| Admin | A4 | 사후 확인 8개(`hash-changed` ~ `rules-extra-file`) | 16 | 16 / 0 / 0 | 116초 |
| Admin | A5 | 사후 확인 7개(`roots-unreadable` ~ `mode-unknown`) | 17 | 17 / 0 / 0 | 101초 |
| Admin | A1b | `static`, `unit` 다시(러너 시험 수정 뒤) | 131 | 131 / 0 / 0 | 3초 |
| Runner | B0 `Pre` | 정적 점검·골든 177건·계약·TS 대조·단위 | 276 | 276 / 0 / 0 | 243초 |
| Runner | B1 | 시나리오 1~15 (새 시나리오 4개 = 11~14번 포함) | 174 | 174 / 0 / 0 | 118초 |
| Runner | B2 | 시나리오 16~30 | 169 | 169 / 0 / 0 | 118초 |
| Runner | B3 | 시나리오 31~45 | 149 | 149 / 0 / 0 | 101초 |
| Runner | B4 | 시나리오 46~60 | 135 | 135 / 0 / 0 | 97초 |
| Runner | B5 | 시나리오 61~75 | 140 | 140 / 0 / 0 | 60초 |
| Runner | B6 | 시나리오 76~89 | 128 | 128 / 0 / 0 | 67초 |
| Runner | B7 `Post` | 도착 순서 행렬·기본 한도·전체 상한·중단 파일·환경 격리·거부 경로·`semgrep-lsp` 모드 | 91 | 91 / 0 / 0 | 71초 |
| Runner | B8 `Aggregate` | 94개 결과 파일 → 실제 TS 어댑터 판정 | 101 | 101 / 0 / 0 | 3초 |

합계: 러너 1,363건, 관리자 224건(A1b 제외), 프레임 125건 — 모두 통과, 실패 0, 건너뜀 0. 러너 `Pre`·`Aggregate`에서 `-TsxCmd`가 실제로 쓰였다(건너뜀 0). 관리자·프레임 시험은 요약 줄만 출력하므로 원본 로그가 짧다(63~270바이트). 러너는 `-ResultsFile`로 단언별 기록을 남겼다.

### 13.4 전체 목록 확정과 누락·중복·제외·건너뜀 대조

- **목록 확정(묶음 나누기 전).** 러너 시험의 시나리오 표 89개(이름 중복 없음)를 표 순서로 15·15·15·15·15·14개씩 여섯 묶음에 배정했다. 관리자 시험의 선택 ID 24개(기본 9개 + 사후 확인 15개)를 다섯 묶음에 모두 배정했다.
- **표 밖 스텁 시나리오.** 스텁의 허용 목록은 94개이고 표는 89개다. 표에 없는 5개(`delayed-forbidden`, `header-variants`, `json-dump-signal-text`, `log-duplicate`, `notification-twice`)는 러너·관리자 시험 어디에서도 쓰이지 않는다. 이 PR 이전부터 그랬고(표는 `HEAD~1`에서 85개, 이번에 4개 추가) 이번 범위 밖으로 두었다. 해결로 기록하지 않는다.
- **대조 방법(저장소 밖 스크립트, 결과는 `reconcile.txt`).** 표의 각 시나리오에서 기대 단언 수를 시험 본문 규칙대로 계산(기본 8건 + 조건부 항목)해 실제 결과 파일과 맞췄다.
  - 시나리오 단언: 기대 889건 = 실제 889건. 89개 시나리오가 각자 정해진 묶음 한 곳에서만 세어졌고 모두 통과했다.
  - `Aggregate`의 TS 판정 단언: 판정 기대가 있는 88개 시나리오가 빠짐·초과 없이 한 번씩. `orphan`만 설계상 판정 단언이 없다.
  - `Post`: 거부 경로 표 33개로 계산한 기대 91건 = 실제 91건. `Pre`: 골든 파일 177건의 id가 모두 한 번씩.
  - 중복: 둘 이상의 묶음에 같은 이름으로 나온 단언은 "시험 뒤 남은 스텁 자손(대기자)이 없다" 하나뿐이다(묶음마다 한 번씩 9번). 단일 실행이었다면 1건이므로 서로 다른 단언은 1,355건이다(도출).
  - 제외: 관리자 시험의 시스템 상태 읽기 구역 (E)만(요청대로). 건너뜀 0, 실패 0.
- 일부 묶음의 통과를 전체 통과로 적지 않았다. 위 합계는 모든 묶음이 끝난 뒤의 대조 결과다.

### 13.5 반복한 것과 반복하지 않은 것

- **TS 전체 회귀(84파일, 4,235건)는 반복하지 않았다.** 원본 로그(`ts-full-regression-final.log`, 시작 17:45:29)가 있고, 바뀐 TS 파일의 마지막 수정 시각(16:33:33)보다 늦으며, 지금 작업 트리가 깨끗하다. TS 시험은 PS 시험 파일을 읽지 않는다(`structure.test.ts`는 `ts`·`mjs`만 훑는다).
- **골든·단위·새 시나리오 4개는 다시 돌렸다.** 지난번 통과는 손으로 적은 요약(`ps51-final-results-summary.txt`)만 있고 최종 코드의 원본 출력이 없어 현재 코드와의 일치를 증명할 수 없었다. 이 구역들은 프로세스 부담이 작고 `Pre`·`Cases`에 어차피 속해서 원본 기록을 남기는 쪽이 낫다고 판단했다.
- 독립 감사와 변이 점검은 요청대로 반복하지 않았다.
- **단일 프로세스 `-Part All` 전체 실행은 하지 않았다**(메모리 사정). 분할 실행의 합이 같은 단언 집합을 덮는다는 것은 13.4로 확인했지만, `All` 경로가 한 번에 통과하는지는 확인하지 않았다.

### 13.6 소스 줄 번호 확정

방법: GitHub 저장소 API로 고정 커밋의 원문 바이트를 받아 저장소 밖 폴더에 두고(요약이 아닌 바이트), git blob SHA-1을 로컬에서 계산해 트리 API가 알려 준 값과 대조했다.

| 항목 | 값 |
| --- | --- |
| 커밋 | `semgrep/semgrep` `a35fe8306115b3e55274969098cc46f8451d6b4d`, 제목 `chore: release 1.180.0`, 2026-10-07T22:50:13Z, 트리 `725eea38be88396cf2cedce16f85fa210e2c6088` |
| `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml` | 14,096바이트, blob `be41b108c6420e0ae468f97a2e8165d6fdb73cc4`(계산값 = API 값) |
| `src/lsp_legacy/server/Legacy_lsp_.ml` | 6,163바이트, blob `a183b7cfbc258e5b3809489db663c1b7211da2cc`(계산값 = API 값) |

| 파일 | 행 | 내용 |
| --- | --- | --- |
| `Legacy_scan_helpers.ml` | 262~279 | `scan_open_documents` 전체(262 시작, 279 끝) |
| | 270 | 초기 열린 문서 스캔의 `create_progress "Semgrep Scan in Progress" "Scanning Open Documents"` |
| | 274 | `Lwt_list.iter_s send packets` (create 요청과 begin 송신) |
| | 275 | `scan_something` (스캔) |
| | 277 | `send (end_progress token)` |
| | 278 | `Logs.app "Scanned open documents"` |
| | 320~335 | `refresh_rules` 전체 |
| | 322 | `create_progress "Semgrep" "Refreshing Rules"` |
| | 323 | packets 송신 |
| | 325 | `Legacy_session.cache_session` |
| | 326 | `send (end_progress token)` |
| | 329 | `send (notify_custom "semgrep/rulesRefreshed" ...)` |
| | 335 | `Reply.apply send (scan_open_documents session)` (열린 문서 스캔 호출) |
| `Legacy_lsp_.ml` | 122~137 | `create_progress`: UUID 토큰 생성, `WorkDoneProgressCreate` 요청과 begin(`~message ~title`)을 `[request; notify progress]`로 돌려줌 |
| | 140~146 | `end_progress` |

이 읽기로 3절 표의 순서가 줄 단위로 확정됐다: 새로고침의 create·begin(322~323), end(326), `rulesRefreshed`(329), 이어서 열린 문서 스캔 호출(335) 안의 create·begin(270~274), 스캔(275), end(277). 외부 검토가 확인한 값(270, 274, 277, 278, 322, 326, 329, 335, 122~137, 140~146)과 모두 같다.

한계: 이것은 소스 읽기다. **소스와 바이너리의 대응이 증명된 것은 아니다.** 이 커밋이 1.180.0 릴리스 커밋이라는 것은 커밋 제목으로 확인했지만, 관측에 쓸 1.180.0 휠이 이 커밋에서 빌드되었는지는 이 작업에서 확인하지 않았다. 실제 관측 프레임과의 순서 일치(3절)가 별도의 간접 근거다.

### 13.7 남은 미검증과 한계

- 단일 프로세스 `-Part All` 실행(13.5).
- 시스템 상태를 읽는 선택 구역 (E)와, 실제 Windows의 전용 계정·방화벽·감사·ACL 아래의 동작(모의로만 확인).
- 실제 Semgrep의 동작, 소스와 바이너리의 대응, 이 장벽이 실제 `ABORTED`를 없앤다는 점(10절 그대로).
- 다른 호스트·Windows 버전. 이번 모든 PS 결과는 이 PC 한 대의 5.1.26100.9711이다.
- 스텁에는 있으나 시험 표에 없는 시나리오 5개(13.4).
- 이전 세션(2026-11-03 14:19)의 중단된 실행이 남긴 임시 폴더 `%TEMP%\bosang-ls-test-5f83be2f8435`가 아직 있다. 이번에 만든 것이 아니라서 지우지 않았다.

### 13.8 추가 증거 파일 (저장소 밖)

`%LOCALAPPDATA%\bosang-radar\semgrep-lsp-progress-barrier\ps51-regression-20261104\` 아래에 보존했다. `manifest.tsv`에는 묶음별 종료 코드·소요·남은 프로세스·원본 로그의 전체 SHA-256이 들어 있다.

| 파일 | 크기(바이트) | SHA-256 |
| --- | --- | --- |
| `manifest.tsv` | 3,583 | `f33ab48d3f0db833844210c995347782d4116d2dfb1f660e7f2f18e657f0fdde` |
| `reconcile.txt` | 1,453 | `d9445d089428de2d6cc0d78e3740cf94e8f21fa85f855551684c5808c8d0c2ba` |
| `cases-table.txt` | 1,320 | `005592194ed8815af36b7887c6cb1e420631374ae50376cc9db046877eb4980f` |
| `runner-state.json` | 81,810 | `4711b007636960b5eee36f06ddcac3f0a5878fb3c8388e8c84491f071baa340a` |
| `Runner-B0-Pre.results.json` | 70,099 | `a53f36716c338d9adff4f1249b2681424c20a81e177d5702a8ff95b701f6c2e8` |
| `Runner-B1.results.json` | 40,875 | `1a9928d4d56d98846cee3f55f1485f584e10ab0f57d12976ae75e247fa414e42` |
| `Runner-B2.results.json` | 39,137 | `ca09174da229cc11496af5c46b168849ef6714427165163220185e21f9cec9ef` |
| `Runner-B3.results.json` | 33,693 | `1f20e9943b8ed8a3bd7e07e1910be9f9e0bc91afd64848f75cf4a22f0c670400` |
| `Runner-B4.results.json` | 25,894 | `b3a2bdf77c9f6be49ea60a82b96bde61b38113678ed3c9efb8582212e45987d4` |
| `Runner-B5.results.json` | 26,417 | `6061f47d52591506af2f58ae0eebe96022cc3f5bfcd24c12d424c57a61515533` |
| `Runner-B6.results.json` | 26,548 | `6989553d92840ae36cd2c514ea6b5dceeba0677cfa28e3959132c34f16897a5a` |
| `Runner-B7-Post.results.json` | 20,069 | `353df19cbcb5572dd1fc723b042d1b7cddf3eed87c348a6ce53229c7ee0e751e` |
| `Runner-B8-Aggregate.results.json` | 39,023 | `a1a989c97db57b980c5bbb4f1ae10ae087d774e69df2d4bc11aa23fca8316ac6` |
| `semgrep-source-a35fe83/Legacy_scan_helpers.ml` | 14,096 | `4fb3d9ef7ca15b2693a63b82b3e1f1937172c6123a3ed3b8121d8b30e11b5fc3` |
| `semgrep-source-a35fe83/Legacy_lsp_.ml` | 6,163 | `d64f55794c22aec402668dc158964c201a8936d1bf04f676287398bd260bb720` |

(소스 두 파일의 SHA-256은 파일 바이트 자체의 해시이고, 13.6의 blob SHA-1은 git 객체 해시다.)
