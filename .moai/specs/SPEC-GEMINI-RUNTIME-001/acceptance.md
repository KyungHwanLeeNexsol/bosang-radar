# SPEC-GEMINI-RUNTIME-001 — 인수 기준 (acceptance.md)

## §A. 개요

각 AC는 원칙적으로 정확히 1개의 `REQ-GEMINI-RUNTIME-XXX`를 검증하되, 배치 격리 계약처럼 Researcher/Skeptic 양쪽에 동일한 패턴이 반복되는 경우 REQ 하나에 여러 AC가 대응한다(§E 커버리지 매트릭스 참고). 모든 자동화 AC는 이진(binary) 판정 가능하도록 작성했으며, 실제 Gemini API를 호출하는 자동화 테스트는 하나도 없다 — fake error 객체·fake clock/sleep 함수·결정론적 provider만 사용한다. 유일한 예외는 §C의 수동 실 Gemini 스모크이며, 이는 자동화 테스트가 아니다.

**용어 구분**: "`generateStructured()` 호출"은 spec.md §2와 동일하게 **논리적 호출**(Researcher/Skeptic/Verifier가 provider에 요청하는 단위)을 가리키며, 429/503 재시도로 인한 **실제 HTTP 시도 횟수**와는 별개다. AC-GEMINI-RUNTIME-023과 AC-GEMINI-RUNTIME-018a는 각각 논리적 호출 수와 실제 시도 타이밍을 서로 다른 관점에서 검증한다 — 어느 쪽을 세는지 각 AC의 Then 절에 명시한다.

## §B. AC 매트릭스 (Given-When-Then)

**AC-GEMINI-RUNTIME-001** (REQ-GEMINI-RUNTIME-001, D1)
- Given: `model` 옵션 없이 생성된 `GeminiProvider`와, `model: "gemini-3.6-flash"` 옵션으로 생성된 또 다른 `GeminiProvider`
- When: 각각 `generate()`를 호출한다
- Then: 전자는 SDK 호출에 `model: "gemini-3.5-flash-lite"`(`DEFAULT_MODEL` — Fast 역할 기본값과 동일한 값으로 정정됨, 더 이상 `gemini-2.5-flash`가 아님)가 전달되고, 후자는 `model: "gemini-3.6-flash"`가 전달된다(mock된 `generateContent` 호출 인자로 확인).

**AC-GEMINI-RUNTIME-002** (REQ-GEMINI-RUNTIME-002, D1)
- Given: `GEMINI_RESEARCH_MODEL="gemini-test-research"`, `GEMINI_FAST_MODEL="gemini-test-fast"`가 설정된 env 객체와, `GeminiProvider` 생성자 호출 인자를 기록하는 spy
- When: `getLLMProviders(env)`를 호출한 뒤 `research`/`fast` 각 provider로 `generate()`를 호출한다
- Then: `GeminiProvider` 생성자가 받은 `options.model`이 두 provider 모두 `undefined`가 아니라 각각 `"gemini-test-research"`/`"gemini-test-fast"`라는 명시적 문자열이었음을 spy로 확인하고(즉 `provider-factory.ts`가 model을 확정해 넘겼지 `GeminiProvider` 내부 폴백에 위임하지 않았음을 검증), 실제 SDK 호출에도 동일한 문자열이 전달된다 — 소스 코드 수정 없이 env 값만으로 각 역할의 모델이 독립적으로 결정된다.

**AC-GEMINI-RUNTIME-003** (REQ-GEMINI-RUNTIME-002, D1)
- Given: `GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL`이 모두 설정되지 않은 env 객체와, `GeminiProvider` 생성자 호출 인자를 기록하는 spy
- When: `getLLMProviders(env)`를 호출한다
- Then: `GeminiProvider` 생성자가 받은 `options.model`이 두 provider 모두 `undefined`가 아니라 `research`는 `"gemini-3.6-flash"`, `fast`는 `"gemini-3.5-flash-lite"`라는 명시적 문자열이었음을 spy로 확인한다(env가 없어도 `provider-factory.ts`가 자신의 기본값을 확정해 넘기며, `GeminiProvider` 자신의 `DEFAULT_MODEL` 폴백에는 도달하지 않는다 — 두 값 모두 design.md §1에서 Google 공식 문서로 Stable 재확인됨).

**AC-GEMINI-RUNTIME-004** (REQ-GEMINI-RUNTIME-003)
- Given: `LLM_PROVIDER_MODE="deterministic"`이고 `GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL`/`GEMINI_API_KEY` 모두 미설정인 env 객체
- When: `getLLMProviders(env)`를 호출한다
- Then: 예외 없이 `{ research, fast }`가 반환되고 `research === fast`(동일 결정론적 provider 인스턴스, 참조 동등성으로 확인)이며, 어느 쪽도 실제 model 문자열을 요구하지 않는다.

**AC-GEMINI-RUNTIME-005** (REQ-GEMINI-RUNTIME-004)
- Given: evidence가 있는 서로 다른 5개 `ResearchQuery`
- When: `research(queries, evidenceMap, provider)`를 실행한다
- Then: `provider.generateStructured()`가 정확히 1회 호출되고, 반환된 `DraftFinding[]`의 각 원소의 `queryId`가 원본 5개 쿼리 중 실제로 응답을 받은 쿼리와 정확히 대응한다(association 보존).

**AC-GEMINI-RUNTIME-006** (REQ-GEMINI-RUNTIME-004)
- Given: 5개 쿼리 중 2개는 evidence가 있고 3개는 evidence가 0건인 상황
- When: `research()`를 실행한다
- Then: `generateStructured()`에 전달된 프롬프트/스키마의 candidate 집합에 evidence 0건인 3개 쿼리가 전혀 포함되지 않으며, 그 3개 쿼리에 대한 억지 `DraftFinding`도 생성되지 않는다.

**AC-GEMINI-RUNTIME-007** (REQ-GEMINI-RUNTIME-005)
- Given: evidence가 있는 서로 다른 4개 `DraftFinding`
- When: `challenge(findings, evidenceMap, provider)`를 실행한다
- Then: `provider.generateStructured()`가 정확히 1회 호출되고, 반환된 `Challenge[]`의 각 `findingId`가 원본 finding의 `queryId`와 정확히 일치한다.

**AC-GEMINI-RUNTIME-008** (REQ-GEMINI-RUNTIME-006)
- Given: `runPipeline()`이 준비한 `researchProvider`/`fastProvider` 두 인스턴스
- When: 파이프라인을 실행하며 각 단계에 전달된 provider 인스턴스를 계측한다
- Then: `challenge()`와 `verify()`는 동일한 `fastProvider` 인스턴스(참조 동등성)를 전달받고, `verify()`의 배치 스키마·프롬프트 구성 로직은 이전과 동일하게 동작한다(기존 `verifier.test.ts` 케이스 무회귀).

**AC-GEMINI-RUNTIME-009** (REQ-GEMINI-RUNTIME-007, REQ-GEMINI-RUNTIME-008 — Researcher)
- Given: query A의 evidence ID를 query B의 finding 항목이 인용하도록 조작된 fake provider 응답(단, query A 자신은 자신의 유효 evidence ID만 인용하는 정상 응답을, 같은 배치 내 다른 query C도 정상적으로 유효한 evidence ID만 인용하는 응답을 함께 반환)
- When: `research()`를 실행한다
- Then: query B의 결과는 폐기되어(finding 없음) query B에 위조 ID가 남지 않으며, 위조 ID의 출처가 된 query A 자신의 정상 결과와 무관한 제3자 query C의 정상 결과 둘 다 영향받지 않고 그대로 `DraftFinding[]`에 남는다 — 즉 evidence를 도용당한 쪽(A)과 도용과 무관한 쪽(C) 모두 부분 배치 실패의 영향을 받지 않음을 함께 확인한다(부분 배치 실패가 전체 배치를 실패시키지 않음을 직접 확인).

**AC-GEMINI-RUNTIME-009a** (REQ-GEMINI-RUNTIME-007, REQ-GEMINI-RUNTIME-004 — Researcher 그라운딩 계약, D-NEW2)
- Given: 같은 Researcher 배치 응답 안에서 query A는 유효한 evidence ID를 1개 이상 인용하고, query B는 `supportingEvidenceIds: []`(빈 배열)를 반환하며, query C도 유효한 evidence ID를 1개 이상 인용하는 fake provider 응답
- When: `research()`를 실행한다
- Then: query B의 결과만 폐기되어(finding 없음) 반환된 `DraftFinding[]`에 나타나지 않으며, query A와 query C의 finding은 둘 다 그대로 보존된다 — 배치 전체는 실패하지 않는다. query B의 근거 없는(ungrounded) finding이 `DraftFinding[]`에 등장하는 경우는 없다(외부 독립 리뷰 5차 지적 — 배치 전환 이후에도 "Researcher finding은 최소 1개의 실제 evidence ID를 인용해야 한다"는 그라운딩 계약이 항목 단위로 정확히 강제됨을 직접 확인).

**AC-GEMINI-RUNTIME-010** (REQ-GEMINI-RUNTIME-007, REQ-GEMINI-RUNTIME-008 — Skeptic)
- Given: finding A의 evidence ID를 finding B의 반론 항목이 인용하도록 조작된 fake provider 응답(다른 finding C는 정상)
- When: `challenge()`를 실행한다
- Then: finding B에 대한 반론은 폐기되고, finding C에 대한 정상 반론은 `Challenge[]`에 그대로 남는다.

**AC-GEMINI-RUNTIME-011** (REQ-GEMINI-RUNTIME-007)
- Given: 배치 전체 응답이 최상위에서 JSON 파싱조차 불가능하도록 조작된 fake provider(Researcher/Skeptic 각각에 대해)
- When: `research()`/`challenge()`를 각각 실행한다
- Then: 예외를 던지지 않고 그 호출에서는 빈 결과(`DraftFinding[]`/`Challenge[]`가 해당 사건에 대해 비어 있거나 원인 쿼리/finding이 모두 결과 없음)로 안전하게 처리된다(진짜 구조적 실패에 대한 fail-closed 확인).

**AC-GEMINI-RUNTIME-012** (REQ-GEMINI-RUNTIME-009, REQ-GEMINI-RUNTIME-010)
- Given: `lib/pipeline/skeptic.ts`의 배치 프롬프트 생성 함수와 `lib/pipeline/types.ts`의 `Challenge` 타입 문서 주석
- When: 프롬프트 생성 결과 문자열과 타입 주석을 검사한다
- Then: 프롬프트에 `supportingEvidenceIds`(보험사 관점 뒷받침)와 `counterEvidenceIds`(피보험자/청구인 관점 반박)를 구분하는 지시 문장이 명시적으로 포함되고, `Challenge` 타입 주석도 동일한 두 역할을 서술하며, `counterEvidenceIds`가 빈 배열임을 corpus 부족의 확정 원인으로 단정하는 문구가 코드 주석·문서 어디에도 없다(grep 기반 확인).

**AC-GEMINI-RUNTIME-013** (REQ-GEMINI-RUNTIME-011)
- Given: `rpmBudget: 4`로 설정된 `RateScheduler`와 fake clock(고정 증가)/fake sleep(호출 인자 기록)
- When: `waitForSlot()`을 연속 3회 호출한다
- Then: 두 번째·세 번째 호출 시 `sleepFn`이 약 15000ms(60000/4, 밀리초 반올림 오차 허용)로 호출되어, 동일 역할 요청 간 최소 간격이 지켜진다.

**AC-GEMINI-RUNTIME-014** (REQ-GEMINI-RUNTIME-011)
- Given: `GEMINI_RESEARCH_MODEL !== GEMINI_FAST_MODEL`이고 `GEMINI_RESEARCH_RPM_BUDGET=60`(간격 1000ms), `GEMINI_FAST_RPM_BUDGET=4`(간격 15000ms)로 설정된 env에서 `getLLMProviders(env)`가 반환한 research/fast provider를 동시에 빠르게 연속 호출하는 시나리오
- When: 두 provider의 `generate()`를 인터리빙해 호출한다
- Then: research provider가 참조하는 `RateScheduler`와 fast provider가 참조하는 `RateScheduler`가 서로 다른 인스턴스이며(참조 비동등성), research provider 호출의 sleep 간격은 fast provider의 페이싱 상태와 무관하게 자신의 1000ms 기준으로만 결정된다(두 스케줄러 상태가 완전히 독립적임을 확인).

**AC-GEMINI-RUNTIME-014a** (REQ-GEMINI-RUNTIME-022, D3)
- Given: `GEMINI_RESEARCH_MODEL`과 `GEMINI_FAST_MODEL`이 **동일한 값**(예: `"gemini-shared-model"`)으로 설정되고, `GEMINI_RESEARCH_RPM_BUDGET=10`, `GEMINI_FAST_RPM_BUDGET=4`로 서로 다르게 설정된 env
- When: `getLLMProviders(env)`를 호출한다
- Then: 반환된 `research`/`fast` provider가 내부적으로 참조하는 `RateScheduler` 인스턴스가 참조 동등성으로 **동일한 하나의 인스턴스**이며, 그 공유 인스턴스의 `rpmBudget`이 두 값 중 더 작은 `4`(둘 중 더 보수적인 값)로 설정되어 있다 — model ID가 다를 때(AC-GEMINI-RUNTIME-014)는 독립, 같을 때(이 AC)는 공유+min-budget이라는 대조가 성립함을 확인한다.

**AC-GEMINI-RUNTIME-015** (REQ-GEMINI-RUNTIME-012)
- Given: `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`이 모두 미설정인 env
- When: `getLLMProviders(env)`가 생성한 provider의 내부 스케줄러 설정을 검사한다
- Then: 둘 다 보수적인 코드 기본값(예: 4)으로 초기화되며, 이 값이 "Google이 보장하는 한도"라고 주장하는 코드 주석·문서 문구가 어디에도 없다(grep 기반 확인 — 오직 "자체 예산(self-imposed budget)"이라는 표현만 존재).

**AC-GEMINI-RUNTIME-016** (REQ-GEMINI-RUNTIME-013)
- Given: 각각 Gemini 호출을 포함하는 두 개의 `runPipeline()` 호출(사건 A, 사건 B)을 거의 동시에 시작
- When: 계측 가능한 fake provider로 두 호출의 Gemini 관련 단계 시작·종료 시각을 기록한다
- Then: 사건 B의 Gemini 관련 단계는 사건 A의 Gemini 관련 단계가 완료된 이후에만 시작되며(직렬화 확인), 사건 B는 오류 없이 대기 후 정상 완료된다.

**AC-GEMINI-RUNTIME-016a** (REQ-GEMINI-RUNTIME-025, D-NEW1)
- Given: `options.providers`를 명시적으로 주입하지 않아 정상 앱 경로(`getDefaultLLMProviders()` 프로세스 생애주기 싱글턴)를 그대로 타는 `runPipeline()` 호출 2회를 순차 실행하는 시나리오 — Fast 역할 `RateScheduler`의 `rpmBudget=4`(최소 간격 15000ms)이고, fake clock(`nowFn`)으로 경과 시간을 제어 가능
- When: 사건 A를 실행해 Fast 단계(Skeptic 또는 Verifier)의 실제 Gemini 호출이 시각 `t=0`에 발사되도록 하고, 사건 A가 완전히 끝난 뒤(동시성 락 해제 후) `t=5000ms`(15000ms 경과 전) 시점에 사건 B를 시작해 Fast 단계 호출을 시도한다
- Then: 사건 B의 Fast 단계 실제 Gemini 호출은 `t=5000ms`에 즉시 발사되지 않고, 사건 A의 `lastStartedAt`(`t=0`) 기준 최소 간격이 충족되는 `t=15000ms` 시점까지 대기한 뒤에야 발사된다 — 즉 사건 B가 새로 초기화된(리셋된) 스케줄러처럼 동작하지 않고, 프로세스 생애주기 동안 재사용되는 동일 `RateScheduler` 인스턴스의 페이싱 기억을 그대로 이어받음을 직접 확인한다. 이 AC는 프로세스 로컬 범위에서만 검증하며, 별도 OS 프로세스/서버리스 인스턴스 간 공유는 검증하지 않는다(범위 밖).

**AC-GEMINI-RUNTIME-016b** (REQ-GEMINI-RUNTIME-025, D-NEW1 — 테스트 주입 경로 격리)
- Given: `getDefaultLLMProviders()`(및 그 내부의 `getLLMProviders()` 호출)를 계측하는 spy와, 서로 다른 두 개의 명시적 `RoleProviders` 인스턴스(각각 독립된 `RateScheduler`를 가짐) — 하나는 사건 A 테스트에, 다른 하나는 사건 B 테스트에 각각 `options.providers`로 명시적으로 주입
- When: 사건 A 테스트가 자신의 `RoleProviders`(Fast 스케줄러 A)로 `runPipeline()`을 실행해 완료한 뒤, 사건 B 테스트가 자신의 별도 `RoleProviders`(Fast 스케줄러 B)로 `runPipeline()`을 실행한다
- Then: (1) 두 호출 전체에 걸쳐 `getDefaultLLMProviders()`(그리고 그것이 감싸는 `getLLMProviders()`의 싱글턴 생성 경로)는 단 한 번도 호출되지 않는다(spy 호출 횟수 = 0) — 즉 명시적 주입 경로는 프로세스 싱글턴을 전혀 거치지 않는다. (2) 사건 B의 Fast 스케줄러 B는 사건 A의 Fast 스케줄러 A와 별개의 인스턴스이며(참조 비동등성), 스케줄러 B의 `lastStartedAt`은 사건 A의 어떤 호출 시각에도 영향받지 않고(초기 미설정 상태 그대로) 자신만의 기준으로 페이싱을 시작한다 — 즉 두 명시적 주입 테스트 사이에 `RateScheduler.lastStartedAt` 누수가 없음을 직접 확인한다.

**AC-GEMINI-RUNTIME-017** (REQ-GEMINI-RUNTIME-014)
- Given: 이번 SPEC 완료 시점의 `lib/pipeline/index.ts` 소스와 `package.json`
- When: 동시성 락 관련 코드 주석과 의존성 목록을 검사한다
- Then: "프로세스 로컬" 또는 이에 준하는 명시적 한계 서술이 코드 주석에 존재하고, `redis`/`bullmq`/유사 분산 큐 패키지가 `dependencies`/`devDependencies`에 추가되지 않았다.

**AC-GEMINI-RUNTIME-018** (REQ-GEMINI-RUNTIME-015)
- Given: `error.message`가 `{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"2s"}]}}`인 fake 429 오류를 1회 반환한 뒤 성공하는 fake provider와, 호출 인자를 기록하는 주입된 `sleepFn`
- When: `GeminiProvider.generate()`(또는 `generateStructured()`)를 호출한다
- Then: `sleepFn`이 기존 지수 백오프 값(예: 1000ms)이 아니라 파싱된 힌트에서 유도된 값(약 2000ms)으로 호출된다.

**AC-GEMINI-RUNTIME-018a** (REQ-GEMINI-RUNTIME-021, D2)
- Given: AC-GEMINI-RUNTIME-018과 동일한 fake 429(`retryDelay: "2s"`) + 1회 재시도 후 성공 시나리오이되, `GeminiProvider`에 `rpmBudget: 4`(최소 간격 15000ms)로 구성된 `RateScheduler`가 함께 주입되고, fake clock(`nowFn`)으로 각 실제 시도의 시각을 계측 가능하게 설정
- When: `generate()`를 호출하고 (a) `sleepFn`에 전달된 지연 값과 (b) 첫 시도와 두 번째(재시도) 실제 시도 사이의 총 경과 시간(스케줄러 대기 포함)을 각각 관측한다
- Then: `sleepFn`은 여전히 `retryDelay`에서 파싱된 값(약 2000ms)으로 호출되지만, 두 번째 실제 시도는 그 2000ms 시점이 아니라 스케줄러의 다음 가용 슬롯(첫 시도로부터 약 15000ms 시점)에 도달한 뒤에야 실행된다 — 즉 실제 재시도 발사 시각이 `max(retryDelay 유도 지연, 스케줄러 다음 가용 슬롯)`과 일치함을 직접 확인한다(재시도가 스케줄러 페이싱을 우회하지 않음 — REQ-GEMINI-RUNTIME-011과의 상호작용).

**AC-GEMINI-RUNTIME-019** (REQ-GEMINI-RUNTIME-015)
- Given: `status: 503`인 fake 오류를 1회 반환한 뒤 성공하는 fake provider
- When: `generate()`를 호출한다
- Then: 429와 동일한 재시도 경로를 거쳐 재시도 후 성공 결과가 반환된다(503이 즉시 전파되지 않고 재시도 대상에 포함됨을 확인).

**AC-GEMINI-RUNTIME-020** (REQ-GEMINI-RUNTIME-016)
- Given: (a) 항상 429를 반환하는 fake provider(`maxRetries`와 `maxTotalWaitMs`를 테스트용으로 작게 설정), (b) `status: 400`인 fake 오류를 반환하는 fake provider
- When: 각각 `generate()`를 호출한다
- Then: (a)는 재시도 횟수 또는 누적 대기 시간 상한 중 먼저 도달하는 조건에서 원본 429 오류를 그대로 던지고(삼키지 않음), (b)는 단 1회 호출 후 즉시 원본 오류를 던진다(재시도 없음 — 기존 "429 아닌 오류는 즉시 전파" 동작이 503 추가 이후에도 다른 코드에 대해서는 유지됨을 확인).

**AC-GEMINI-RUNTIME-021** (REQ-GEMINI-RUNTIME-017)
- Given: 기존 `lib/validation/case-input.ts`의 주민등록번호/전화번호/필드-외-키 거부 단위 테스트 전체
- When: 이번 SPEC 완료 후 그 테스트 스위트를 재실행한다
- Then: 전부 무수정으로 통과하며, `lib/pipeline/researcher.ts`/`skeptic.ts`/`verifier.ts`의 프롬프트 생성 함수 소스에 `caseInputSchema`가 정의하지 않는 필드명(예: `address`, `medicalRecordRaw`, `residentRegistrationNumber`)에 대한 참조가 존재하지 않는다(grep 기반 확인).

**AC-GEMINI-RUNTIME-021a** (REQ-GEMINI-RUNTIME-023, D5-a)
- Given: 이번 SPEC 완료 시점의 `spec.md`와 `.moai/docs/runtime-runbook.md`
- When: 두 파일의 개인정보/데이터 취급 관련 서술을 검사한다
- Then: `caseInputSchema`(또는 그 필드들)가 "비식별을 보증한다"/"비식별화한다"는 취지의 과잉 단정 문구가 존재하지 않으며, 대신 "주민등록번호/전화번호 패턴과 스키마 외 필드만 구조적으로 차단"하고 "자유 텍스트 필드의 완전한 비식별화까지는 보증하지 않는다"는 취지의 문장이 최소 1곳 이상 명시적으로 존재한다(문자열 검색 기반 확인).

**AC-GEMINI-RUNTIME-021b** (REQ-GEMINI-RUNTIME-024, D5-b/D5-c)
- Given: 이번 SPEC 완료 시점의 `.moai/docs/runtime-runbook.md`
- When: 파일 내용을 검사한다
- Then: (a) "합성(synthetic) 사건 또는 사전 비식별화된 사건만 입력"하라는 운영 계약과 "실명·주민등록번호·전화번호·상세주소가 포함된 실 사건, 원본 진료기록·보험증권 문서 입력 금지" 문구가 존재하고, (b) "실 고객 사건을 사용하는 외부 파일럿 확장은 별도의 데이터 처리/정책 적합성 검토가 선행되어야 한다"는 문구가 존재하며, (c) Google 무료 tier가 제출된 콘텐츠를 사람 검토·제품 개선에 사용할 수 있다는 사실이 `https://ai.google.dev/gemini-api/docs/pricing` 또는 `https://ai.google.dev/gemini-api/terms` 중 최소 하나의 정확한 URL과 함께 명시되어 있다.

**AC-GEMINI-RUNTIME-022** (REQ-GEMINI-RUNTIME-018)
- Given: 이번 SPEC 완료 후의 `lib/pipeline/*.ts` 전체
- When: `lib/pipeline/boundary.test.ts`와 `lib/pipeline-gemini-boundary.test.ts`를 실행한다
- Then: 두 테스트 모두 무수정 상태로 그대로 통과한다(형제-import 0건, `@google/genai` 문자열 0건 유지).

**AC-GEMINI-RUNTIME-022a** (REQ-GEMINI-RUNTIME-018, 타입 shape 불변성)
- Given: 이번 SPEC 변경 전(SPEC-RESEARCH-001 completed 시점)과 변경 후(이번 SPEC 완료 시점) 각각의 `lib/pipeline/types.ts`
- When: `DraftFinding`/`Challenge`/`VerifiedClaim`/`ResearchReport` 4개 인터페이스의 필드 키 집합을 비교한다(TypeScript 컴파일 타임 구조적 동등성 검사 — 예: 각 인터페이스를 satisfy하는 고정 fixture 객체에 대해 `satisfies` 단언이 변경 전/후 동일한 키 집합으로 통과하는지 확인하는 테스트, 또는 키 배열을 `Object.keys()`로 추출해 스냅샷 비교하는 런타임 테스트)
- Then: 4개 인터페이스 모두 필드 키 집합이 변경 전후 정확히 동일하다(필드 추가·삭제·이름 변경 0건) — `Challenge.supportingEvidenceIds`/`counterEvidenceIds`의 문서 주석 텍스트 변경(REQ-GEMINI-RUNTIME-009)은 키 집합 자체에 영향을 주지 않으므로 이 검사를 통과한다.

**AC-GEMINI-RUNTIME-022b** (REQ-GEMINI-RUNTIME-018, safety-validator 3개소 적용)
- Given: 이번 SPEC 완료 후의 `lib/pipeline/{researcher,skeptic,verifier}.ts` 3개 파일
- When: `grep -c 'findSafetyViolations(' lib/pipeline/researcher.ts lib/pipeline/skeptic.ts lib/pipeline/verifier.ts`를 실행한다
- Then: 3개 파일 모두 호출 횟수가 1 이상이다(각 파일이 배치 파싱 이후 항목별로 `findSafetyViolations()`를 계속 호출함을 기계적으로 확인 — SPEC-RESEARCH-001이 확립한 3곳 defense-in-depth 적용 지점이 배치 전환 이후에도 소실되지 않았음을 grep 기반으로 검증).

**AC-GEMINI-RUNTIME-022c** (REQ-GEMINI-RUNTIME-018, DB 스키마 불변성)
- Given: 이번 SPEC 착수 시점의 `git rev-parse HEAD`(베이스라인 SHA)와 이번 SPEC 완료 시점의 워킹 트리
- When: `git diff --stat <베이스라인 SHA>..HEAD -- lib/db/schema.ts db/migrations/`를 실행한다(마이그레이션 디렉터리 경로는 프로젝트의 실제 Drizzle 마이그레이션 출력 경로로 run-phase에서 확정)
- Then: `lib/db/schema.ts`에 대한 diff가 없고, 신규 마이그레이션 파일이 추가되지 않았다(빈 diff 출력으로 확인) — 이번 SPEC이 DB 스키마를 전혀 건드리지 않았음을 기계적으로 확인.

**AC-GEMINI-RUNTIME-023** (REQ-GEMINI-RUNTIME-019)
- Given: evidence가 있는 8개 쿼리를 생성하는 완전한 `CaseInput` 하나(계측 가능한 fake/deterministic provider로 실행, 429/503 재시도 없는 정상 경로)
- When: `runPipeline(input)`을 실행하고 `generateStructured()` **논리적 호출** 횟수(Researcher/Skeptic/Verifier가 provider에 요청한 횟수 — 재시도로 인한 실제 HTTP 시도 횟수가 아님)를 센다
- Then: 논리적 호출 횟수가 정확히 3회(Researcher 1 + Skeptic 1 + Verifier 1)이며, evidence가 있는 Researcher 후보 쿼리 개수를 8개에서 3개로 줄여 재실행해도(원시 쿼리 집합 자체는 `query-planner.ts` 구조상 도메인 2개 × 필수 이슈타입 3개로 항상 최소 6개 이상 생성되므로, 여기서 8개→3개로 줄어드는 것은 evidence가 있는 후보 쿼리 수뿐이다) 여전히 3회로 동일하다(호출 수가 evidence가 있는 후보 쿼리 개수에 비례하지 않음을 직접 확인). 추가로, 8개 쿼리 중 5개만 evidence가 있고 3개는 evidence가 0건인 혼합 구성으로 동일하게 계측하면, evidence 0건인 3개 쿼리가 Researcher 배치 candidate에서 제외됨(AC-GEMINI-RUNTIME-006)에도 불구하고 논리적 호출 횟수는 여전히 정확히 3회로 동일하다(evidence 유무 혼합 구성에서도 호출 수가 3회로 고정됨을 하나의 AC로 직접 확인).

**AC-GEMINI-RUNTIME-024** (REQ-GEMINI-RUNTIME-020)
- Given: 이번 SPEC 완료 시점의 `.moai/reports/gemini-smoke-20260827.md`
- When: 파일 내용을 검사한다
- Then: design.md §7에 명시된 정정 대상 ①("신규 유저 계정에서는 더 이상 제공되지 않음" 계열의 플랫폼 전체 단정 문구)과 ②("corpus 부족이 원인으로 보인다"는 근접-확정 문구)가 더 이상 원문 그대로 존재하지 않으며, design.md §7에 명시된 정정문(또는 그와 동등한 관측-범위-한정 서술)으로 대체되어 있다.

**AC-GEMINI-RUNTIME-025** (전체 SPEC 게이트, 특정 REQ 1개에 대응하지 않음)
- Given: 이번 SPEC의 모든 변경이 완료된 워킹 트리
- When: `pnpm test && pnpm lint && pnpm format:check && pnpm build && pnpm test:e2e`를 순차 실행한다
- Then: 5개 명령 모두 exit 0으로 종료하고, `pnpm test:e2e` 실행 로그 어디에도 실제 Gemini API 엔드포인트(`generativelanguage.googleapis.com`)로의 아웃바운드 호출 흔적이 없다.

## §C. 수동 실 Gemini 스모크 (Requirement J — 자동화 아님)

이 절은 REQ에 매핑되지 않는다 — 위 §B의 모든 AC가 자동화된 계약 검증인 것과 달리, 이 절은 **구현 완료 후 사용자 승인 하에 수동으로 1회 수행**하는 절차이며 `/moai run` 완료 조건에 포함되지 않는다(plan.md M6 참고).

PASS 조건(전부 만족해야 함):
1. 코드에 임시 수정이 없다 — main 브랜치 후보 코드 그대로.
2. 모델 선택이 전적으로 `GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL` 두 env 변수만으로 이루어진다(코드 수정 없이 어떤 계정/프로젝트에서도 동작하는 모델을 선택할 수 있다).
3. Researcher → Skeptic → Verifier 실제 Gemini 호출이 모두 성공한다.
4. `POST /api/cases`가 `201`을 반환한다.
5. 리포트가 DB에 저장된다.
6. 서버 로그에 `schema_validation_failed`나 처리되지 않은 `500`이 없다.
7. evidence ID 위조(전달되지 않은 ID의 인용)가 관측되지 않는다.
8. 금지된 확정성 표현(보험금 지급 확정/확률 등)이 관측되지 않는다.
9. 이 1건의 사건에 대한 정상 경로 핵심 Gemini 호출 수가 약 3회임을 관측 가능한 방식(서버 로그 라인 카운트, 또는 임시 계측)으로 확인한다.
10. 429가 발생하더라도 그 자체는 실패가 아니다 — scheduler/retry 계약(REQ-GEMINI-RUNTIME-011/015/016)에 따라 처리되었는지만 확인한다.

**명시적 비-요구사항**: "무료 tier quota 자체는 외부 조건이므로 '절대 429가 없어야 한다'를 acceptance로 두지 않는다 — 호출 수 감소와 scheduler/retry 계약이 검증 대상이다." 또한 이 스모크를 3~5회 반복 수행하는 것은 이번 SPEC의 필수 acceptance가 아니다(spec.md §4) — 최초 1회 성공 확인으로 충분하다.

## §D. 엣지 케이스

- `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`에 `0`이나 음수, 또는 파싱 불가능한 문자열이 설정된 경우 — 코드 기본값으로 안전하게 폴백하는지(0으로 나누기 등 런타임 오류가 발생하지 않는지) 확인.
- 배치 응답에서 같은 `queryId`/`findingId`가 두 번 이상 반환되는 경우 — 첫 번째 항목만 채택되고 이후 중복은 조용히 무시되는지(design.md §2 "Verifier와의 의도적 차이") 확인.
- Researcher/Skeptic 배치 프롬프트에 포함되는 evidence 목록이 우연히 Verifier의 `쿼리 ID: `/`반론 쿼리 ID: ` 마커 문자열을 포함하지 않는지(evidence 본문 텍스트에 그 문자열이 등장해도 `deterministic.ts`의 블록 파싱이 줄 시작 앵커로만 마커를 인식해 오탐하지 않는지) 확인.
- `runPipeline()` 호출 도중 앞선 사건의 파이프라인이 예외로 실패한 경우 — 동시성 락(Promise 체인)이 끊기지 않고 다음 대기 중인 사건이 정상적으로 이어서 실행되는지(design.md §4 "실패도 반드시 삼켜 체인을 이어간다") 확인.
- `retryDelay` 문자열이 예상치 못한 형식(예: `"41.5s"`, 소수점 포함, 또는 완전히 다른 형식)인 경우 — 파싱이 실패해도 예외를 던지지 않고 `null`을 반환해 기존 지수 백오프로 안전하게 대체되는지 확인.
- 단위 테스트가 `options.providers`를 명시적으로 주입하지 않고 `runPipeline()`을 호출하는 경우(테스트 작성 실수) — `getDefaultLLMProviders()` 프로세스 싱글턴을 건드리게 되어 테스트 간 상태 누수가 생길 위험이 있다는 점을 테스트 작성 가이드에 명시하고, 모든 자동화 테스트가 `options.providers`를 항상 명시적으로 주입하는지(grep 기반) 확인 — 이 계약 자체의 정식 검증은 AC-GEMINI-RUNTIME-016b(§B)가 담당한다.

## §E. REQ ↔ AC 커버리지 매트릭스

| REQ | AC |
|---|---|
| REQ-GEMINI-RUNTIME-001 | AC-GEMINI-RUNTIME-001 |
| REQ-GEMINI-RUNTIME-002 | AC-GEMINI-RUNTIME-002, AC-GEMINI-RUNTIME-003 |
| REQ-GEMINI-RUNTIME-003 | AC-GEMINI-RUNTIME-004 |
| REQ-GEMINI-RUNTIME-004 | AC-GEMINI-RUNTIME-005, AC-GEMINI-RUNTIME-006, AC-GEMINI-RUNTIME-009a |
| REQ-GEMINI-RUNTIME-005 | AC-GEMINI-RUNTIME-007 |
| REQ-GEMINI-RUNTIME-006 | AC-GEMINI-RUNTIME-008 |
| REQ-GEMINI-RUNTIME-007 | AC-GEMINI-RUNTIME-009, AC-GEMINI-RUNTIME-009a, AC-GEMINI-RUNTIME-010, AC-GEMINI-RUNTIME-011 |
| REQ-GEMINI-RUNTIME-008 | AC-GEMINI-RUNTIME-009, AC-GEMINI-RUNTIME-010 |
| REQ-GEMINI-RUNTIME-009 | AC-GEMINI-RUNTIME-012 |
| REQ-GEMINI-RUNTIME-010 | AC-GEMINI-RUNTIME-012 |
| REQ-GEMINI-RUNTIME-011 | AC-GEMINI-RUNTIME-013, AC-GEMINI-RUNTIME-014 |
| REQ-GEMINI-RUNTIME-012 | AC-GEMINI-RUNTIME-015 |
| REQ-GEMINI-RUNTIME-013 | AC-GEMINI-RUNTIME-016 |
| REQ-GEMINI-RUNTIME-014 | AC-GEMINI-RUNTIME-017 |
| REQ-GEMINI-RUNTIME-015 | AC-GEMINI-RUNTIME-018, AC-GEMINI-RUNTIME-019 |
| REQ-GEMINI-RUNTIME-016 | AC-GEMINI-RUNTIME-020 |
| REQ-GEMINI-RUNTIME-017 | AC-GEMINI-RUNTIME-021 |
| REQ-GEMINI-RUNTIME-018 | AC-GEMINI-RUNTIME-022, AC-GEMINI-RUNTIME-022a, AC-GEMINI-RUNTIME-022b, AC-GEMINI-RUNTIME-022c |
| REQ-GEMINI-RUNTIME-019 | AC-GEMINI-RUNTIME-023 |
| REQ-GEMINI-RUNTIME-020 | AC-GEMINI-RUNTIME-024 |
| REQ-GEMINI-RUNTIME-021 | AC-GEMINI-RUNTIME-018a |
| REQ-GEMINI-RUNTIME-022 | AC-GEMINI-RUNTIME-014a |
| REQ-GEMINI-RUNTIME-023 | AC-GEMINI-RUNTIME-021a |
| REQ-GEMINI-RUNTIME-024 | AC-GEMINI-RUNTIME-021b |
| REQ-GEMINI-RUNTIME-025 | AC-GEMINI-RUNTIME-016a, AC-GEMINI-RUNTIME-016b |
| (전체 SPEC 정적 게이트) | AC-GEMINI-RUNTIME-025 |
| (전체 SPEC, 자동화 아님) | §C 수동 실 Gemini 스모크 |

25개 최상위 자동화 AC(AC-GEMINI-RUNTIME-001~025) + 10개 서브레터 AC(009a/022a/022b/022c/014a/016a/016b/018a/021a/021b) + 1개 수동 스모크 절차. 서브레터 AC는 인접한 최상위 AC(각각 009/022/014/016/018/021)와 밀접하게 결합된 논리적 검증을 페어링하는 관례(manager-spec AC 서브-ID 컨벤션 — spec.md/plan.md/acceptance.md 어디에도 이 관례가 SPEC ID 자체에는 적용되지 않음을 재확인)이므로, Tier L의 REQ/AC 상한(25개)은 최상위 AC 번호 기준(001~025)으로 계산하며 정확히 25개로 상한과 일치한다. 25개 REQ(REQ-GEMINI-RUNTIME-001~025, Tier L 상한 25개와 정확히 일치) 전부가 최소 1개의 최상위 또는 서브레터 AC에 매핑된다(위 매트릭스로 확인). REQ-GEMINI-RUNTIME-025는 정상 경로 재사용(016a)과 테스트 경로 격리(016b) 두 절반이 각각 별도 AC로 검증된다. REQ-GEMINI-RUNTIME-007은 부분 배치 실패(009/010/011)에 더해 Researcher 그라운딩 계약(009a, D-NEW2)까지 서브레터 AC로 별도 검증된다.
