# 엔진 층 음성 대조의 최소 계약·계획 (정적 확인, 실행 승인 아님)

- 작성일: 2026-11-04
- 기준: PR #45 HEAD `b2a693ee98f64caf9650eb4f9a856abe4b68b2fe` 위의 별도 브랜치 `security/semgrep-lsp-neg-engine-plan`. 이 PR이 더하는 파일은 이 보고서 하나다.
- 성격: **계획만 제안한다.** 기존 R1~R9 계약, 기대 상태, 상태 우선순위, 사유 코드, 판정, `pin.json`·`verified`·`policy_accepted`·ADR 상태를 확정하거나 바꾸지 않았다. 이 문서는 실제 실행의 승인이 아니다.
- 이번 작업에서 하지 않은 것: Semgrep 실행·임포트, 시스템 격리 적용, 네트워크 프로브, 새 RunId 관측, 규칙 다운로드, 실제 스캔, 코드·시험·판정 변경, 다른 PR·`main`·보담 저장소 변경, 병합·배포. 읽은 것은 저장소 파일, 이전 실행의 저장소 밖 원본 증거(읽기 전용), 그리고 GitHub API로 받은 고정 커밋의 공개 소스 원문이다. Semgrep이 아닌 독립 YAML 파서(`js-yaml`) 한 번을 변형 바이트에 돌렸다.
- 구분 표기: **사실** = 읽은 파일·원문·출력의 내용, **도출** = 사실을 이어 붙인 판단(고정 공개 소스 읽기 포함), **미확인** = 실제 바이너리로 관측되지 않았거나 이 작업에서 확인하지 못한 것.
- 수용한 한계(해결로 쓰지 않는다): 설치된 바이너리와 공개 소스의 대응은 확인되지 않았다. 아래 "도출"은 모두 이 한계 안에 있다.

## 1. 결론

| 질문 | 답 | 구분 |
| --- | --- | --- |
| R2(깨진 YAML 규칙)를 첫 후보로 쓸 수 있는가 | **정적으로는 구별 가능하지만, 지금의 최소 입력(프로브 규칙 1개)에서는 첫 후보로 적합하지 않다.** 이유 세 가지는 5.5절. 규칙 캐시(YAML 205개)를 확보한 뒤의 R2는 별개의 문제로 남는다 | 도출 |
| 대안 | **R3의 최소형(`R3-MIN`)**: 유효한 프로브는 그대로 두고, 같은 규칙 폴더에 깨진 YAML 파일 하나를 **추가**한다. 한 사례만 제안하며 여러 사례로 넓히지 않는다 | 제안 |
| 사전 검사 실패와 엔진이 직접 낸 반응을 구별할 수 있는가 | 구별 규칙을 7.2~7.4절에 적었다. 핵심은 **엔진 원문 바이트(stderr)의 줄만 반응으로 세고, 하네스의 게이트·해시·허용 목록 결과와 "`didOpen`이 나가지 않았다"는 사실은 반응으로 세지 않는다**는 것이다 | 제안 |
| 2026-11-04의 정상 반응 관측이 기존 음성 대조의 기준 실행이나 대조 참조 자격을 충족하는가 | **아니오.** 자격 요건 8개 중 대부분과 무관하고 R9 충돌은 그대로다(3절) | 사실 / 도출 |
| 현재 코드로 `R3-MIN`을 실행할 수 있는가 | **아니오.** 네 곳에서 막힌다(7.6절). 그래서 구현 PR이 먼저 필요하고 그 뒤에도 실제 실행은 별도 승인이다 | 사실(코드 읽기) |
| 이 PR이 확정하는 것 | 없다. 결정이 필요한 항목은 11절 | — |

## 2. 이번 결과의 인용 범위와 PR #45 정리

**PR #45 정리(사실).** 제목을 `feat(semgrep-lsp): LSP-SCAN-1 초기 진행 장벽 및 실제 1회 관측`으로 바꿨다. 서버에서 다시 읽어 제목·Draft·`open`·head(`b2a693e…`)를 확인했고, 본문의 SHA-256은 전후가 같다(`7fe34affa8caf8159b7d2f2f6f32161b1d981b1841a767330d03379b2a25d39c`). 본문과 기존 결과는 다시 쓰지 않았다.

**인용해도 되는 표현.**

- RunId `20261104T010928Z-99e25e61`의 `SCAN_RESPONSE_OBSERVED`는 "합성 입력 한 건과 고정 프로브 규칙 하나에 대한 진단 반응, 그리고 계약상 정상 종료의 근거"로 인용한다.
- RunId `20261103T024748Z-3e4360b8`의 `ABORTED:SERVER_REQUEST_NOT_ALLOWED`는 별도 실행으로 보존한다. 새 코드로 재판정하거나 성공으로 바꾸지 않는다.
- 두 RunId는 모두 소모됐다. 표지(`lsp-scan-attempt.marker`)는 둘 다 보존돼 있다.

**성립시키지 않는 것.** 재현성, 실제 저장소 스캔, 음성 대조, 대조 참조 자격, 보안 통과, 외부 통신 부재, 바이너리와 공개 소스의 대응.

**기존 사실·한계로 유지하는 것.** `shutdown` 응답 프레임 미관측, 식별 불가 5157(2026-11-04에 25건, 2026-11-03에 9건), 장벽 완료에서 `didOpen`까지 약 1초(998ms / 913ms), 복구 입력이 없는 재해석 기록의 `outcomes.system_recovery = NOT_OBSERVED`. 이 작업은 이 항목들의 판정이나 정책을 바꾸지 않았다.

## 3. 2026-11-04 SCAN 관측이 제공하는 것과 제공하지 않는 것

| 기존 계약의 요건 | SCAN 관측(`…99e25e61`)이 제공하는 것 | 제공하지 않는 것 / 근거 |
| --- | --- | --- |
| 로그 형식(ADR U3) | **정상 경로**의 줄 모양: `[ss.cc][INFO\|DEBUG\|WARNING]: …` 헤더와 맨줄, `loading local config from <경로>`(stderr 195행), `Done loading local config from <경로>`(196행), `Got 0 errors while refreshing rules in language server`(197행), `[WARNING]: No targets to scan! Not scanning anything.`(268행) | 오류 경로의 줄은 관측되지 않았다. `pin.json`의 `log_format`은 여전히 `UNVERIFIED`, `prefix_regex`는 `null`이다. 이 작업은 `pin.json`을 바꾸지 않았다 |
| 엔진 고유 반응 계약(`ENGINE_OBSERVATION_CONTRACTS`) | 반응 후보가 될 줄의 **정상형**을 제공한다 | 이 상수는 `negative-control.ts` 244행에서 비어 있고(`= {}`) 그대로 둔다. README 694~696행이 확정 후보(확정 아님)로 "R2·R3 구문 오류 보고"를 적어 두었을 뿐이다 |
| 기준 실행(변형 없는 clean 실행) | 프로브 1개·합성 파일 1개의 실제 정상 반응 한 건 | 하네스의 기준 실행은 규칙 205개(`pin.json` `yaml_files`)·`expected_rules` 214·`n0` 확정을 전제한다. `n0.confirmed`는 `false`다. SCAN은 다른 실행 경로(PowerShell 러너)의 다른 스키마(`semgrep-lsp-scan-observation/1`) 기록이다 |
| 대조 참조 자격(`reference.ts` 131~204행) | `PROVENANCE_REAL` 한 요건과 의미가 닿는다 | `MEASUREMENT_COMPLETE`, `CONTROL_ASSERTIONS_PASS`, `N0_CONFIRMED`, `FINGERPRINTS_COMPLETE`(도구 버전·휠 해시 관측 포함 5값), `NEGATIVE_PREFLIGHT_PASS`, `NEGATIVE_ENGINE_PASS`, `NEGATIVE_BINDING_MATCH`는 SCAN 기록이 채우지 않는다. `pin.json`의 휠 `sha256`은 `null`, `verified`는 `false`다 |
| R9 엔진 층 | 루프백 수신기 0건 관측(수신기가 작동함을 증명하지는 않는다) | R9는 `BLOCKED_CONTRACT_CONFLICT`로 고정이다(4절). ADR 293행이 자격을 막는 세 가지(실제 엔진 미실행, R9 충돌, 휠 해시 미확정)를 적었고 SCAN은 그중 첫째를 부분적으로만 건드린다 |

**도출.** 정상 반응 한 건은 "실제 엔진이 이 입력에서 이 모양으로 반응했다"까지만 말한다. 음성 대조의 PASS는 "변형했을 때 하네스가 그 변형을 알아챈다"를 뜻하고, 그 입증에는 변형 실행 쪽의 관측이 따로 필요하다. 정상 반응이 있다고 해서 변형 쪽 판정이 채워지지 않는다.

## 4. 기존 R1~R9 엔진 층 계약의 현황 (바꾸지 않았다)

근거: `control.ts` 81~136행(표), `negative-control.ts` 22~26행·44~47행·705~771행(변형), README 687~757행.

| id | 변형(표) | 표의 엔진 기대 | 사전 검사 사유 | 엔진 층의 현재 상태 |
| --- | --- | --- | --- | --- |
| R1 | 규칙 파일 제거 | `MANIFEST_MISMATCH` | `RULES_FILE_REMOVED` | 실행해도 `NOT_RUN(ENGINE_OBSERVATION_UNCONFIRMED)` |
| R2 | 규칙 파일 YAML 구문 손상 | `MANIFEST_MISMATCH` | `RULES_FILE_CHANGED` | 같음 |
| R3 | 깨진 YAML 파일 추가(규칙 수 그대로) | `MANIFEST_MISMATCH` | `RULES_FILE_ADDED` | 같음 |
| R4 | 유효한 새 규칙 파일 추가 | `MANIFEST_MISMATCH` | `RULES_FILE_ADDED` | 같음 |
| R5 | 기존 파일 본문 변경 | `MANIFEST_MISMATCH` | `RULES_FILE_CHANGED` | 같음 |
| R6 | 없는 규칙 경로 | `RULES_NOT_LOADED` | 없음 | 사전 검사가 없어 엔진이 필요하다. 실제 엔진이 기대 상태를 내는지는 미확인(ADR U22, 90행) |
| R7 | `scan`에 알 수 없는 키 | `SETTINGS_MISMATCH` | `SETTINGS_KEY_NOT_ALLOWED` | `NOT_RUN(ENGINE_OBSERVATION_UNCONFIRMED)` |
| R8 | 구성 경로를 cwd 밖 절대경로로 | `PREFIX_MISSING` | 없음 | 엔진 반응에 달림(README 756행: 충돌로 확정하지 못함) |
| R9 | `metrics`에 알 수 없는 키 | `ISOLATION_VIOLATION` | `SETTINGS_KEY_NOT_ALLOWED` | `BLOCKED_CONTRACT_CONFLICT` 고정(기대의 우선순위 19가 `SETTINGS_MISMATCH`(4)에 가려짐) |

이 표의 기대 상태, 우선순위(`status.ts` 18~38행), R1~R5·R7의 "계약 미확정 `NOT_RUN`", R9의 계약 충돌은 이 작업이 바꾸지 않는다.

## 5. R2 정적 검토

### 5.1 정의와 변형 바이트

R2의 변형은 `NEGATIVE_MUTATIONS.R2`(`negative-control.ts` 712~717행)다. 규칙 매니페스트의 **첫 규칙 파일**을 `BROKEN_YAML`(665~666행: `["rules: [", "  - id: negative-control-broken", ""].join("\n")`)로 **교체**한다. 같은 바이트를 R3는 `zz-negative-control-broken.yaml`이라는 새 파일로 **추가**한다(718~726행). 하네스는 규칙 YAML을 해석하지 않고 바이트만 비교하므로 구문 유효성은 `mutated_yaml_validity: "UNVERIFIED"`로 남는다(827~828행).

| 항목 | 값 (사실: 이 작업에서 계산·실행) |
| --- | --- |
| `BROKEN_YAML` 바이트 수 | 41 |
| 전체 SHA-256 | `d7dfc6537aed290cb5bdcf27a1d7b20ab40fedc7ffcf364dbefb66e151d6b24a` |
| 16진 | `72756c65733a205b0a20202d2069643a206e656761746976652d636f6e74726f6c2d62726f6b656e0a` |
| 형식 | UTF-8, BOM 없음, CR 없음, 끝은 LF 하나 |
| 독립 파서 `js-yaml` 4.3.2 | **거부**: `YAMLException`, reason `missed comma between flow collection entries`, line 1 col 2 (0부터) |
| 보존할 정상 입력(프로브) | `lsp-rules-1-probe.yaml` 233바이트, `d5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145`, 같은 파서가 **수락** |
| 보존할 정상 입력(합성 대상) | `lsp-scan-1-target.txt` 135바이트, `097b6a5ddb0f1f822b91ccebad23fa448d1970222502e4f18447479d0cd741ba` |

`js-yaml`은 Semgrep이 쓰는 YAML 파서가 아니다. 위 거부는 "이 바이트가 YAML로 유효하지 않다"는 독립 근거일 뿐 **Semgrep의 파서가 거부한다는 증거가 아니다**(미확인). `pin.json`이 규칙 수를 센 도구로 적은 `js-yaml 4.3.1`과 이번에 실제로 쓴 4.3.2는 다르다.

### 5.2 엔진 경로 (고정 커밋 `a35fe8306115b3e55274969098cc46f8451d6b4d`, 도출)

실제 LSP 구성은 **폴더**였다(사실: SCAN 원본 stderr 39행 `"configuration": [ "…\\lsp-state\\rules-probe" ]`). 폴더 구성은 엔진이 안의 `.yaml` 파일을 열거해 하나씩 읽는다.

| 단계 | 소스(파일: 줄) | 하는 일 (도출) |
| --- | --- | --- |
| 1 | `Legacy_session.ml` 333~364 | `fetch_rules`가 `configuration`마다 `rules_from_dashdash_config_async`를 부른다. 구성이 비어 있으면 `auto`(레지스트리)로 간다(349~353). 이번 구성은 비어 있지 않다 |
| 2 | `Rule_fetching.ml` 560~571 | 폴더면 `List_files.list dir`에서 `Rule_file.is_valid_rule_filename`을 통과한 파일마다 `load_rules_from_file`을 부르고 `Result_.partition`으로 성공과 오류를 나눈다 |
| 3 | `Rule_file.ml` 32~40 | `.yaml`/`.yml`이면서 `*.test.yaml` 계열이 아닌 파일만 규칙으로 인정한다. `zz-negative-control-broken.yaml`은 통과한다 |
| 4 | `Rule_fetching.ml` 365~378 | `loading local config from <파일>`(INFO)을 먼저 남기고, 파싱이 `Ok`일 때만 `Done loading local config from <파일>`(INFO)을 남긴다. `Error`면 `Done` 없이 `Error`를 돌려준다 |
| 5 | `Rule_fetching.ml` 322~352, `Parse_rule.ml` 1416~1426, 1352~1410 | `parse_and_filter_invalid_rules`는 `parse_file`을 부른다. YAML 파일이면 `parse_yaml_rule_file`로 간다 |
| 6 | `Parse_rule.ml` 1333~1349 | `Yaml_to_generic.parse_yaml_file`가 `Parsing_error.Other_error`를 던지면 `Error (InvalidYaml …)`로 바꾼다. 이는 규칙 단위 스킵(`invalid_rule`)이 아니라 **파일 단위 `Error`**다 |
| 7 | `yaml_to_generic.ml` 82~84, `Parse_yaml.ml` 190~213, 717~735 | 라이브러리가 `Msg` 오류를 내면 `Other_error`로 바꿔 던진다 |
| 8 | `Legacy_session.ml` 367~376 | 오류들을 모아 `Got %d errors while refreshing rules in language server`(INFO)로 **개수만** 남긴다 |
| 9 | `Legacy_session.ml` 480~490 | `cache_session`은 `let%lwt rules, _ = fetch_rules session`으로 무효 규칙 쪽을 **버리고** `rules`를 저장하며 `initialized <- true`로 둔다 |
| 10 | `Legacy_scan_helpers.ml` 51~68, 320~335 | `refresh_rules`는 진행 알림 → `Refreshing rules` → 규칙 저장 → `semgrep/rulesRefreshed` → `Rules refreshed` → `scan_open_documents`로 이어진다. `run_semgrep`은 규칙이 `[]`이면 `No rules to run! Not scanning anything.`(WARNING, 63~65), 대상이 `[]`이면 `No targets to scan! …`(66~68)을 남긴다 |
| 11 | `Legacy_diagnostics.ml` 61~80 | 결과가 비어도 대상 파일마다 `publishDiagnostics`를 **하나** 만든다(`diagnostics: []`) |

**도출의 결론.** 이 경로에서 깨진 YAML에 대한 LSP의 **관측 가능한 반응은 로그 줄뿐이다**: `loading …` 줄은 있고 같은 경로의 `Done loading …`은 없으며, `Got N errors …`의 N이 올라간다. 오류 내용(구문 오류 문구)을 LSP가 남기는 코드는 읽지 못했다(8, 9단계에서 개수만 남고 내용은 버려진다). README가 후보로 적은 "구문 오류 보고"는 이 소스에서는 **개수**로 보인다. Windows 바이너리가 실제로 같은 줄을 내는지는 미확인이다.

### 5.3 신호 비교 (정상은 실관측, 나머지는 도출)

| 신호 | 정상(SCAN 실관측) | `R2-MIN`(프로브 교체) 도출 | `R3-MIN`(깨진 파일 추가) 도출 |
| --- | --- | --- | --- |
| `loading local config from` 줄 | 1건(프로브 경로, 195행) | 1건(교체된 프로브 경로) | 2건(프로브 경로와 `zz-negative-control-broken.yaml` 경로. 두 줄의 순서는 폴더 열거 순서라 단언하지 않는다) |
| `Done loading local config from` 줄 | 1건(196행) | **0건** | 1건(프로브 경로만. 깨진 파일 경로는 **없음**) |
| `Got N errors …` | N=0(197행) | N=1 | N=1 |
| 유효 규칙 수 | 1 | **0** | 1 |
| 사전 구간의 `WARNING` | `No targets to scan!`(268행) | `No rules to run! …`(규칙이 `[]`이고 `initialized`가 true라서 `Legacy_scan_helpers.ml` 63~65행 분기) | `No targets to scan!`(정상과 같음) |
| `didOpen` 이후 구간(보낸다면) | 진단 1건, `Found 1 matches` | `diagnostics: []`인 `publishDiagnostics` 1건(11단계), `Scanning 1 targets`·`Found N matches` 줄 없음 | 정상과 같음 |

`R3-MIN`의 차이는 **사전 구간(규칙 새로고침) 안**에만 있고, `didOpen` 이후 구간이 있다면 정상과 같아야 한다는 것이 도출이다. 규칙 ID 재작성(`rewrite_rule_ids`)이 폴더 안 파일 수에 영향을 받는지는 읽지 않았다(미확인).

### 5.4 사전 검사 실패와 엔진이 직접 낸 반응의 구별

두 갈래의 "사전 검사"가 있다.

1. **TS 하네스 경로**(`negative-control` 명령). 변형이 PH0의 규칙 목록 바이트 비교에서 `RULES_FILE_CHANGED`(R2)·`RULES_FILE_ADDED`(R3)를 먼저 낸다. R2의 엔진 기대도 `MANIFEST_MISMATCH`(우선순위 1)라서, 엔진을 띄운 실행에서도 대표 상태는 **엔진이 무엇을 했든** `MANIFEST_MISMATCH`다. 그래서 상태 일치는 "엔진이 변형을 따로 잡았다"의 증거가 아니다(`negative-control.ts` 44~47행). 엔진 `PASS`에는 엔진이 낸 반응 사유가 사유 목록에 있어야 하고, 그 후보가 이미 사유 코드로 존재한다: `RULE_FILE_ERRORS_REPORTED`(`Got N errors`의 N≥1)와 `LOADING_WITHOUT_DONE`(`status.ts` 91~92행, `evaluate.ts` 750·770행, `log-matcher.ts` 60행의 정규식). 이 두 사유는 R2와 R3에서 **같다**(도출: 같은 로그 패턴에서 같은 사유가 나온다). 둘을 가르는 것은 사유가 아니라 어느 경로가 깨졌는가와 남은 유효 규칙이다.
2. **PowerShell 격리 경로**(지금까지의 모든 실제 관측). 여기에는 규칙 매니페스트 비교가 없다. 대응되는 "사전 검사"는 관리자 진입점의 사전 조건(T·P·L·A 게이트)과 러너의 요청 검사·해시 3점(원본/복사 직후/실행 뒤)이다. 이 게이트들은 YAML 구문을 해석하지 않는다. 즉 하네스는 변형 파일이 **우리가 둔 바이트와 같다**는 것만 안다.

**구별 규칙(제안).** 엔진 반응으로 세는 것은 엔진 자식의 stderr 원문 바이트에서 읽은 줄이고, 줄마다 시작 바이트 위치를 기록한다. 게이트·허용 목록·해시·`runnerLaunched`·"`didOpen`이 나가지 않았다"는 하네스 쪽 사실은 별도 항목으로 기록하고 반응으로 세지 않는다. 장벽이 `clean`이 아니라서 러너가 `didOpen`을 보류하는 것(`lsp-scan-runner.ps1` 438~449행)은 하네스가 엔진 로그를 읽고 내린 결정이므로 반응의 증거가 아니라 결과다.

### 5.5 R2의 적합성 판단

R2 자체를 탈락시키는 것이 아니다. 지금의 **최소 입력(프로브 규칙 1개)** 에서 R2를 첫 후보로 쓰기 어려운 이유다.

1. **표의 R2와 의미가 달라진다.** 표의 R2는 규칙 캐시(JS·TS 205개)의 첫 파일을 깨뜨려 나머지 204개는 그대로 읽히는 상태를 뜻한다. 프로브가 하나뿐인 폴더에서 그 파일을 교체하면 **유효 규칙 0개**가 되어 R1(파일 제거)과 R2가 섞인 다른 상태가 된다(5.3절의 `No rules to run!` 분기). 규칙 캐시는 내려받기 금지라 이번에 확보하지 않았다.
2. **같은 실행 안의 양성 대조가 사라진다.** 엔진이 정상 동작했다는 내부 증거(프로브의 `loading`/`Done` 쌍, 진단 1건)가 없다. 게다가 `didOpen`을 보내면 `diagnostics: []`인 `publishDiagnostics`가 정상 알림처럼 보이는 함정이 있다(11단계). 진단 "알림 수"가 아니라 "진단 개수"를 봐야 구별된다.
3. **변경해야 할 현재 판정과 게이트가 가장 많다.** 프로브 교체는 프로브 고정 해시 게이트(`P01`)·`PROBE_CHANGED`(러너 435행)·`DONE_LOADING_COUNT_0`·`NO_TARGETS_COUNT_0`(`lsp-scan-record.ts` 1004~1033행)을 모두 건드린다.
4. (보조) Semgrep 파서가 이 41바이트를 실제로 거부하는지는 미확인이다. 거부하지 않으면 R2-MIN은 "유효하지만 이상한 규칙"을 읽는 다른 실험이 된다.

## 6. 제안하는 대안 후보: `R3-MIN` 하나

**정의.** 규칙 폴더 `…\lsp-state\rules-probe\`에 유효 프로브(233바이트, 불변)를 그대로 두고, `zz-negative-control-broken.yaml`(5.1절의 41바이트)을 **하나 더** 둔다. 표의 R3(`NEGATIVE_MUTATIONS.R3`)와 같은 파일 이름·바이트이며 폴더만 프로브 폴더다.

**적합한 이유(도출).**

- 양성 대조가 같은 실행 안에 남는다: 프로브의 `loading`/`Done` 쌍이 그대로 나와야 한다.
- 반응이 규칙 새로고침 구간(사전 구간)에 한정된다. 그래서 `didOpen`·스캔·진단 없이 관측할 수 있고, 메시지가 줄어든다(7.5절).
- 바이트·해시가 R2와 공유되어 5.1절의 값을 그대로 쓴다.
- 변경할 현재 코드가 상대적으로 적다(7.6절).

**말하지 않는 것.** `R3-MIN`의 관측은 **표의 R3 엔진 항목을 충족시키지 않는다.** 규칙 입력(프로브 1개 대 205개), 실행 경로(PowerShell 러너 대 TS `negative-control` 명령), 기준 실행의 결합이 다르고, `ENGINE_OBSERVATION_CONTRACTS`는 비어 있는 채로 유지된다. 기록할 때 id는 `R3-MIN`으로 구분하고 표의 R3 항목은 `NOT_RUN`으로 둔다(결정 N2).

## 7. 최소 실행 계획 (`R3-MIN`, 계획만)

### 7.1 입력

| 항목 | 값 |
| --- | --- |
| 보존할 정상 입력 | 프로브 233B `d5089fde…8145`, 합성 대상 135B `097b6a5d…41ba`(둘 다 불변. 합성 대상은 `didOpen`을 보내지 않으면 서버에 열리지 않지만 작업 공간에는 둔다) |
| 변형 입력 | `zz-negative-control-broken.yaml` 41B `d7dfc653…b24a`, 위치 `rules-probe\` 안 |
| 규칙 폴더 파일 집합 | 변형 전 1개 → 변형 후 2개(프로브, 추가 파일). 그 밖의 파일은 없다 |
| 구성 경로 | 이전과 같은 **폴더**(`rules-probe`) |
| 기대 신호의 사전 등록 | 아래 7.2절의 신호 집합은 **실행 전에 고정**하고, 실행 뒤 증거를 보고 고치지 않는다 |

### 7.2 엔진 반응으로 인정하는 신호와 인정하지 않는 신호

인정하려면 아래 E1~E4가 **모두** 필요하고, 증거는 stderr 원문 바이트(줄 시작 위치 기록)의 사전 구간(`Refreshing rules` 줄과 `Rules refreshed` 줄 사이)이어야 한다.

| 신호 | 내용 | 근거의 종류 |
| --- | --- | --- |
| E1 | `[…][INFO]: loading local config from <규칙 폴더>\zz-negative-control-broken.yaml` 정확히 1줄(경로는 러너가 쓴 경로와 서수 비교) | 줄 모양은 정상 경로에서 실관측(195행), 깨진 파일 경로의 등장은 도출 |
| E2 | 같은 경로의 `Done loading local config from …` 줄이 stderr 전체에 **없음** | 도출(`Rule_fetching.ml` 371행은 `Ok`일 때만) |
| E3 | `[…][INFO]: Got 1 errors while refreshing rules in language server` 정확히 1줄, E1 뒤·`Rules refreshed` 앞 | 줄 모양은 N=0에서 실관측(197행), N=1의 문구는 형식 문자열(`Legacy_session.ml` 374~376행)에서 도출 |
| E4 | 프로브 경로의 `loading`/`Done loading` 쌍이 정확히 1쌍(순서 loading→Done) | 정상 경로에서 실관측(195~196행) |

인정하지 않는 것:

- **N1.** 하네스의 게이트·사전 조건·해시·허용 목록·`runnerLaunched`·표지 결과. 엔진에 닿기 전이거나 하네스 자신의 판단이다.
- **N2.** "`Done loading`이 없다"는 부재만(E3의 개수 없이). 로그 잘림이나 읽기 실패와 구별되지 않는다.
- **N3.** E1과 같은 경로가 없는 `Got N errors`, N≠1인 값.
- **N4.** 종료 코드 0, 정상 `shutdown`, 크래시 없음. 정상 실행에도 같다.
- **N5.** 프로브의 진단·`Found 1 matches`·엔진 번들 같은 정상 항목. 대조(통제)이지 반응이 아니다. (`didOpen`을 보내는 변형 설계를 택할 때만 해당)
- **N6.** stdout의 어떤 프레임도 이 오류를 설명하지 않는다는 점이 도출이다(8, 9단계). 설명 프레임이 보이면 반응이 아니라 **예상 밖 추가 항목**으로 따로 기록한다.
- **N7.** YAML 구문 오류 문구. LSP 코드는 남기지 않는 것으로 읽혔으므로 요구하지 않는다.
- **N8.** 읽기 실패·넘침·부분 꼬리가 있는 구간의 줄.
- **N9.** 하네스나 `js-yaml`의 YAML 유효성 판단.

**도출과 미관측의 구분.** E1~E4 가운데 오류 경로(E1의 깨진 파일 경로, E2, E3의 N=1)는 고정 공개 소스에서 도출한 것이고 **실제 바이너리로는 관측되지 않았다**. 바이너리와 소스의 대응도 증명되지 않았다. 실제 관측이 도출과 다르면 그 사실을 원문과 함께 기록하고 도출을 고치는 쪽으로 판정하지 않는다(7.4절 `NEG_REACTION_NOT_AS_DERIVED`).

### 7.3 무결성 조건 (예상한 오류의 관측과 실행·정리 실패를 가르는 기준)

엔진이 `Got 1 errors`를 낸 것은 **의도한 반응**이지 실행 실패가 아니다. 반응 판정은 아래 I1~I7이 **모두** 만족될 때만 한다. 하나라도 어긋나면 신호가 있어도 반응으로 세지 않는다.

| 조건 | 내용 |
| --- | --- |
| I1 | 사전 조건·게이트 전부 통과, 러너 실행됨, 신원·결합 교차 확인 통과, 실행 시도 표지 확보 |
| I2 | `initialize` 응답 `VALID`·버전 일치, `initialized` 정확히 1회 |
| I3 | 규칙 로딩 장벽이 `ready`(stdout `rulesRefreshed` 1회, 맨줄 `Scanned open documents`, 초기 진행 두 수명주기 완료) |
| I4 | stdout·stderr 완전: 읽기 실패 없음, 넘침 없음, EOF 확인, 부분 꼬리 없음 |
| I5 | 종료 `NORMAL`, 종료 코드 0, 강제 종료 0, `shutdown`·`exit` 송신 |
| I6 | 프로브·추가 파일 해시가 원본/복사 직후/실행 뒤 같고, 규칙 폴더 파일 집합이 {프로브, 추가 파일}과 같다 |
| I7 | 프로세스 이미지 허용 목록 위반 없음, 루프백 수신기 읽기 실패 0 |
| (별도) | 프로세스 정리와 시스템 복구는 관측 상태를 바꾸지 않고 따로 기록한다(종료 코드 70 규칙 유지) |

반응을 판정하는 쪽은 기대 신호 집합을 **증거에서 읽지 않고** 사전 등록된 변형 id의 표에서 받는다(증거가 기대를 정하는 순환을 피한다).

### 7.4 결과 기록 (제안 어휘, 확정 아님)

기존 어휘(`NOT_ATTEMPTED`, `NOT_OBSERVED`, `ABORTED:*`, 음성 대조의 `ENGINE_NOT_STARTED`·`ENGINE_EXECUTION_FAILED`·`ENGINE_STAGE_NOT_REACHED`)를 최대한 재사용하고, 반응 판정에만 새 토큰을 제안한다.

| 상황 | 제안 기록 | 엔진 반응으로 세는가 |
| --- | --- | --- |
| 사전 검사·게이트가 막아 엔진이 뜨지 않음 | `NOT_ATTEMPTED:<게이트 id>` (음성 대조 쪽 `ENGINE_NOT_STARTED`) | 아니오. 게이트 결과만 기록 |
| 초기화 실패·전송 실패·프로세스 실패(장벽 전) | `NOT_OBSERVED:INIT_OR_TRANSPORT` (`ENGINE_EXECUTION_FAILED`) | 아니오 |
| 장벽 시간 초과·미완 | `NOT_OBSERVED:BARRIER` (`ENGINE_STAGE_NOT_REACHED`) | 아니오. 시간 초과를 "반응 없음"으로 읽지 않는다 |
| 실시간 감시 중단(A1~A10) | 기존 `ABORTED:<규칙>` | 아니오. 재판정하지 않는다 |
| 읽기 실패·넘침·원문 누락·해시 누락 | `NOT_OBSERVED:EVIDENCE_INCOMPLETE` | 아니오 |
| 비정상 종료(강제 종료, 종료 코드≠0, `shutdown` 미송신) | `NOT_OBSERVED:TERMINATION` | 아니오. 보인 신호는 사실로만 남긴다 |
| I1~I7 만족 + E1~E4 모두 충족 | `NEG_REACTION_OBSERVED` | 예. 범위는 "이 입력 한 건의 규칙 로딩 구간"이다 |
| I1~I7 만족 + 일부만 충족 | `NEG_REACTION_PARTIAL` | 충족한 신호만 사실로 기록 |
| I1~I7 만족 + 도출과 다른 반응(예: 추가 항목, 다른 문구) | `NEG_REACTION_NOT_AS_DERIVED` | 원문 그대로 보존. 소유자가 판정 |
| I1~I7 만족 + 반응 없음(E2 위반: `Done loading`이 있고 `Got 0 errors`) | `NEG_REACTION_ABSENT` | "엔진이 이 변형을 알리지 않았다"는 관측. `FAIL`로 분류할지는 소유자 결정(N5) |

정리·복구 실패는 어느 행에서도 관측 상태를 바꾸지 않고 `processCleanup`·`systemRecovery`에 따로 쓴다.

### 7.5 허용 범위

| 항목 | 2026-11-04 SCAN 값 | `R3-MIN` 제안 |
| --- | --- | --- |
| 보내는 메시지 | `initialize`, `initialized`(1회), `didOpen`(1회), `shutdown`, `exit` | `initialize`, `initialized`(1회), `shutdown`, `exit`. **`didOpen`은 보내지 않는다.** 장벽이 `clean`이 아니면 `didOpen`을 보류하고 `settleMs` 동안 지켜본 뒤 정상 종료하는 분기가 이미 있다(러너 438~449행). 서버 요청에는 응답하지 않는다 |
| 환경 | `PATH=C:\WINDOWS\System32;C:\WINDOWS`, 작업 디렉터리 `lsp-state`, 메트릭 비활성 | 같음 |
| 한도 | 전체 150,000 / 초기화 60,000 / 장벽 60,000 / settle 2,000 / 종료 30,000ms | 같음. 늘리지 않는다 |
| 파일 쓰기 | 규칙 폴더에 프로브 1개(배타 생성, 해시 대조), 작업 공간에 합성 파일 1개, 서버가 홈 폴더에 `ws.txt` | 규칙 폴더에 **추가 파일 1개**(41B, 배타 생성, 해시 3점 대조)를 더한다. 그 밖의 쓰기 없음 |
| 네트워크 관측 | 루프백 수신기 + 5157 감사 창 + 프로세스 표본 | 같음. 식별 불가 5157은 건수만 기록하고 위반으로 세지 않는다(기존 정책 유지) |
| 종료 | `shutdown` → `exit`, 코드 0 | 같음 |
| 복구 | `Remove-Isolation` + `Compare` | 같음. 추가 파일은 작업 폴더 삭제로 함께 지워지는지를 복구 뒤 `Compare`·직접 확인으로 확인한다(미확인) |
| 실행 횟수 | 1 | 변형 1회. 기준 쌍을 둘지는 결정 N4 |

### 7.6 현재 코드가 변형 실행을 막는 곳 (구현 PR의 몫, 이 PR은 고치지 않는다)

| # | 막는 곳(파일: 줄) | 내용 (사실: 코드 읽기) |
| --- | --- | --- |
| 1 | `LspRulesContract.ps1` 214~221, `lsp-scan-runner.ps1` 377~382 | 규칙 폴더에는 프로브 한 개만 허용한다. 다른 파일이 보이면 A5 `LIVE_ABORT`. 추가 파일은 첫 폴더 목록에서 중단을 부른다(도출) |
| 2 | `lsp-scan-watch.ts` 200~222 (`stderrBarrierProblems`), 러너 438~449 | 장벽 `clean`은 프로브 경로의 `loading`·`Done loading` 각 1건, `Got 0 errors`, `No targets` 1건, 추가 신호 없음을 요구한다. 아니면 `didOpen`이 보류된다(이 보류는 `R3-MIN`에는 유리하다) |
| 3 | `lsp-scan-record.ts` 1001~1033·1489~1491, `lsp-rules-record.ts` 365~390 | 판정 조건이 `LOADING_COUNT_1`, `DONE_LOADING_COUNT_1`, `GOT_ERRORS_NONZERO`(N≠0 위반), `NO_TARGETS_COUNT_1`을 요구하고, `GOT_ERRORS`≠0을 `LOCAL_CONFIG_ERRORS`(음성 증거)로 분류한다. 변형 실행은 이 틀에서 의도한 반응이어도 "관측 불성립"으로 읽힌다 |
| 4 | 관리자 진입점 사전 조건(`P01`·`P02`), 사후 감시 폴더 비교(`RULES_DIR` 파일 수) | 추가 파일의 원본·해시 게이트와 "파일 집합 = {프로브, 추가 파일}" 비교가 없다 |

TS 하네스의 `negative-control` 명령은 대안 경로이지만 `process-node.ts`가 `nodeSpawn`으로 현재 사용자 권한에서 직접 띄우며 전용 계정·방화벽 규칙과 결합된 코드가 없다(계정 전환 관련 검색 0건, 사실). 격리 아래의 실제 실행은 지금까지 PowerShell 러너·관리자 진입점으로만 해 왔다.

### 7.7 구현·스텁 시험·실제 실행 전에 필요한 결정

11절 N1~N8. 특히 N1(후보), N3(실행 경로), N4(기준 쌍), N5(`NEG_REACTION_ABSENT`의 분류)가 구현 설계를 정한다.

### 7.8 단계와 승인 경계

| 단계 | 내용 | 승인 |
| --- | --- | --- |
| A | 이 PR: 정적 확인과 계획 문서 | 이 PR은 어떤 실행도 승인하지 않는다 |
| B | 소유자 결정 N1~N8 | 소유자 |
| C | 구현 PR: 코드·판정·스텁 시험만(7.6절 네 곳, 새 스텁 시나리오와 변형 id 표, 사전 등록 신호 집합). Semgrep 미실행 | 별도 검토 |
| D | 실제 1회 관측: 새 RunId, 새 기준 저장, 격리 적용, `-Execute -ConfirmRunId`, 복구와 `Compare` | **별도 명시 승인.** 두 RunId(`…3e4360b8`, `…99e25e61`)는 소모됐다 |
| E | 결과 기록: 보고서, 원본 증거 해시 | 단계 D 뒤 |

## 8. 인용한 소스 (고정 커밋 `a35fe8306115b3e55274969098cc46f8451d6b4d`)

원문 바이트를 GitHub API(`contents?ref=<sha>`, `Accept: application/vnd.github.raw+json`)로 받아 git blob 해시를 직접 계산하고 트리 API의 값과 대조했다. 모두 일치했다(사실). 이 커밋이 설치된 바이너리를 만든 소스라는 증거는 없다(미확인).

| 파일 | 크기(B) | blob SHA-1 | 인용한 줄 |
| --- | ---: | --- | --- |
| `src/lsp_legacy/server/Legacy_session.ml` | 19571 | `2957d9e8e60f7fbbd1b804af2ff746a8a32ada29` | 333~404(`fetch_rules`, 349~353 `auto`, 374~376 `Got %d errors`), 480~490(`cache_session`) |
| `src/lsp_legacy/scan_helpers/Legacy_scan_helpers.ml` | 14096 | `be41b108c6420e0ae468f97a2e8165d6fdb73cc4` | 51~68(`run_semgrep` 조기 반환), 262~279, 282~318, 320~335(`refresh_rules`) |
| `src/osemgrep/networking/Rule_fetching.ml` | 32364 | `55981c8280d188c9aec88261f285390b6a20f45d` | 322~352(`parse_rule`), 365~378(`load_rules_from_file`), 542~571(`rules_from_dashdash_config_async`) |
| `src/parsing/Parse_rule.ml` | 55827 | `6c36dfe953b2d79e127b77f62d7eab22cee2dcba` | 1333~1349, 1352~1410, 1416~1426 |
| `languages/yaml/generic/yaml_to_generic.ml` | 3402 | `6b7ee185c3bd248fc31efba39825f3288757f9ef` | 82~84 |
| `languages/yaml/parser/Parse_yaml.ml` | 27094 | `eae4389b0fa8f5f1650a2d232197067f7dce50fa` | 186~213, 717~735 |
| `src/lsp_legacy/scan_helpers/Legacy_diagnostics.ml` | 2765 | `9c0e266395f5b00ade71bd005cdaddeebdd873a6` | 61~80 |
| `src/parsing/Rule_file.ml` | 1618 | `e1d35366c557808a8a6de5c0f23df3109405baa6` | 32~40 |

저장소 안 인용(이 PR의 기준 b2a693e): `scripts/semgrep-lsp/negative-control.ts`, `control.ts`, `status.ts`, `reference.ts`, `lsp-scan-record.ts`, `lsp-scan-watch.ts`, `lsp-rules-record.ts`, `evaluate.ts`, `log-matcher.ts`, `process-node.ts`, `data/pin.json`, `README.md`, `.moai/decisions/lsp-security-source.md`, `scripts/semgrep-lsp-isolation/windows/lsp-scan-runner.ps1`, `LspRulesContract.ps1`. 실제 관측 원문은 저장소 밖(`%LOCALAPPDATA%\bosang-radar\semgrep-isolation\20261104T010928Z-99e25e61\lsp-scan-stderr-20261104T011330Z.bin`, SHA-256 `10f9b0e8251185a68389e66732cccb5110f28b33cfc55b444fb7d4718c682a2d`)에서 읽었다.

## 9. 미확인 / 말하지 않는 것

1. Semgrep 파서(libyaml 기반으로 읽히나 확인하지 않았다)가 41바이트를 실제로 거부하는지, 거부 시 `Other_error`로 이어지는지. `js-yaml`의 거부는 독립 근거일 뿐이다.
2. 오류 경로에서 실제 바이너리가 내는 줄(E1~E3)과 그 정확한 문구·형식. `log_format`은 `UNVERIFIED` 그대로다.
3. `List_files.list`의 열거 순서, 규칙 ID 재작성이 폴더 안 파일 수에 영향을 받는지.
4. 변형 실행에서의 `shutdown` 응답, 식별 불가 5157, `git` 프로세스 생성, 외부 통신 부재. 기존 한계로 유지한다.
5. 재현성. 이 계획은 한 번의 관측만 정의한다.
6. `R3-MIN`이 표의 R3 엔진 항목이나 R1~R9 전체의 자격으로 이어지는지(이어지지 않는다는 것이 이 계획의 가정이다).
7. 바이너리와 공개 소스의 대응(수용한 한계).
8. 이 PR의 문서 서식: `.prettierignore`가 `.moai`를 제외하므로 `format:check`(`prettier --check .`)는 이 보고서를 검사하지 않는다. 서식 검사를 했다고 쓰지 않는다. 표 열 개수·해시 길이·줄 인용은 직접 점검했다.

## 10. 이번 작업이 하지 않은 것

Semgrep 실행·임포트, 시스템 격리 적용(계정·방화벽·감사·ACL), 네트워크 프로브, 새 RunId 관측, 규칙 다운로드, 실제 저장소 스캔, 코드·시험·계약·판정 변경, 실행 시도 표지 삭제, `pin.json`·`verified`·`policy_accepted`·ADR 상태 변경, 전체 시험·변이 점검·독립 감사의 반복, PR #45의 제목 외 변경, 다른 PR·`main`·보담 저장소 변경, 병합·배포.

## 11. 소유자 결정 요청 (이 PR은 어느 것도 정하지 않는다)

| # | 결정 | 이 문서의 제안 |
| --- | --- | --- |
| N1 | 첫 엔진 층 후보: R2(규칙 캐시 확보 뒤로 미룸) / `R3-MIN` / 그 밖 | `R3-MIN` (5.5절의 이유) |
| N2 | `R3-MIN`을 표의 R3 엔진 항목과 **별개 관측**(id `R3-MIN`)으로 기록할지 | 별개로 기록하고 표의 R3는 `NOT_RUN` 유지 |
| N3 | 실행 경로: 격리 계정 아래의 PowerShell 러너·진입점 확장 / TS `negative-control` 명령(현재 격리와 결합되지 않음) | PowerShell 경로 확장 |
| N4 | 기준 쌍: 변형 없는 기준 실행을 같은 코드로 새로 한 번 더(실제 실행 2회, 승인 2회) / 2026-11-04 SCAN을 구속력 없는 참조로 비교만(실행 1회, 자격 주장 없음) | 구속력 없는 참조 비교(자격을 주장하지 않음) |
| N5 | `NEG_REACTION_ABSENT`(엔진이 깨진 파일을 알리지 않음)를 음성 대조의 `FAIL`로 볼지 별도 관측으로 둘지 | 소유자 결정 |
| N6 | 7.4절의 기록 어휘(`NEG_REACTION_*`) 채택·수정 | 채택안 검토 |
| N7 | `didOpen`을 보내는 변형 설계(양성 진단까지 같은 실행에서 보기)를 원하는지. 보내려면 장벽 `clean` 조건을 바꿔야 한다 | `didOpen` 없이 시작 |
| N8 | 첫 오류 경로 관측 뒤 `pin.json`의 `log_format` 동결을 별도 결정으로 다룰지(이 작업은 건드리지 않았다) | 별도 결정 |
