# 실 Gemini 프로덕션 파이프라인 Smoke 테스트 — 2026-08-28

목적: `feat/SPEC-GEMINI-RUNTIME-001` 현재 HEAD(`fb23553`)에서, 코드를 전혀 수정하지 않고
env만으로 model/RPM budget을 고정한 채, 실제 Gemini API를 태운 Researcher → Skeptic →
Verifier 3단계가 로그인부터 report DB 저장, 사건 상세 조회까지 끝까지 정상 동작하는지
1건 확인한다. 이 리포트는 `.moai/reports/gemini-smoke-20260827.md`(2026-08-27, 별개
실행)를 덮어쓰지 않는 신규 리포트다.

**결론: PASS (11개 기준 전부 충족).**

## 환경

- 브랜치/HEAD: `feat/SPEC-GEMINI-RUNTIME-001` @ `fb23553`
  (full SHA: `fb2355397e547b1f77d938812e8d6af6678862ea`)
- 코드 수정: 없음 (`git status --short`가 이번 smoke 종료 시점에 빈 결과 — 추적 대상
  파일 변경 0건. 아래 "관측 방법론" 절 참고)
- 모델/RPM budget: **env로만** 고정, 코드 변경 없음 (`.env.local`, gitignore 대상, 커밋 안 됨)
  - `GEMINI_RESEARCH_MODEL=gemini-3.6-flash`
  - `GEMINI_FAST_MODEL=gemini-3.5-flash-lite`
  - `GEMINI_RESEARCH_RPM_BUDGET=4`, `GEMINI_FAST_RPM_BUDGET=4` — 이번 세션에서 AI Studio
    실 쿼터 대시보드를 확인할 수 있는 브라우저/네트워크 접근이 없어(코드 기본값과
    동일한) 4를 그대로 유지했다. 실제 프로젝트 쿼터의 70~80% 산정은 대시보드 접근
    가능한 세션에서 재확인이 필요하다(잔여 위험 참고).
  - `LLM_PROVIDER_MODE`는 의도적으로 미설정 — deterministic이 아닌 실제 Gemini 경로.
- 로컬 DB: `file:./.tmp/local-dev.db` — `pnpm db:migrate` + `pnpm db:seed` 재실행으로
  최신 스키마/시드(상해·질병후유장해 근거 10건) 확인 후 진행.
- 테스터 계정: `smoke-20260828@test.com` (`pnpm tester:add`로 신규 프로비저닝, synthetic
  이메일, 실명/전화번호/주민번호 등 실제 PII 없음)
- 서버 실행: `pnpm build`(이번 세션 앞선 게이트 실행에서 이미 성공한 프로덕션 빌드 재사용,
  코드 변경 없으므로 재빌드 불필요) 후 `next start` 프로덕션 모드로 기동. 로그인/API
  경로는 `curl`로 직접 호출해 검증(브라우저 자동화 미연결, 2026-08-27 smoke와 동일한
  방법론).

## 관측 방법론 — "코드 임시 수정 없음" 조건과 logical call count 관측의 양립

PASS 기준 1번("코드 임시 수정 없음")과 11번("logical call count를 관측 가능한 방식으로
확인")을 동시에 만족시키기 위해, **애플리케이션 소스 파일은 전혀 건드리지 않고** 별도의
네트워크 레벨 관측기(observer)를 `NODE_OPTIONS=--require=<observer>.cjs`로 서버 프로세스
시작 전에 preload했다. 이 관측기는 `globalThis.fetch`를 감싸(wrap) `generativelanguage.
googleapis.com`을 대상으로 하는 요청만 `{timestamp, method, url}`을 별도 로그 파일에 기록하고
원래 `fetch`를 그대로 호출한다 — **API key 값은 이 관측기가 읽거나 기록하지 않는다**(key는
요청 헤더에 실리며, 로그는 URL/method/시각만 남긴다). `@google/genai` SDK가 Node 전역
`fetch()`를 사용함을 소스(`node_modules/@google/genai/dist/node/index.cjs`)에서 직접 확인한
뒤 이 방식을 채택했다.

이 방식이 "코드 수정"이 아닌 근거: (1) `lib/`, `app/` 등 저장소 추적 대상 파일을 단 하나도
Write/Edit하지 않았다 — `git status --short`가 smoke 세션 종료 시점에 빈 결과를 반환함으로
확인. (2) 관측기 자체는 저장소 밖 임시 경로에만 존재하며 커밋되지 않는다. (3) 이는 OpenTelemetry
auto-instrumentation과 동일한 클래스의 기법 — 대상 프로세스 시작 전에 외부에서 전역 함수를
계측(instrument)하는 것으로, 애플리케이션 코드 자체의 로직/동작을 변경하지 않는다.

## 실행 로그

1. `pnpm db:migrate` → `✅ 마이그레이션 완료`
2. `pnpm db:seed` → `✅ 시드 완료`
3. `pnpm tester:add -- --email smoke-20260828@test.com`(`TESTER_PASSWORD`는 `.env.local`에서
   셸 변수로만 추출해 전달, 값 자체는 어디에도 echo하지 않음) → `✅ 테스터 프로비저닝 완료`
4. **사전 예열(warm-up) 실행 — 참고용, 공식 기록 아님**: 관측기를 장착하지 않은 상태로
   포트 3005에서 먼저 1건(`caseId: ae84e3ae-91c1-430c-9ff7-b40329605fb7`) 실행해 `201`,
   ~30초 소요, 서버 로그에 오류 없음을 먼저 확인했다. logical call count 관측이 없어
   공식 smoke 기록으로 채택하지 않고, 관측기를 장착한 재실행(아래 5번)을 공식 기록으로
   삼는다. 이 예열 실행이 사용한 서버는 계속 백그라운드에 남아 있다(잔여 위험 참고).
5. **공식 smoke 실행**: `NODE_OPTIONS=--require=<observer>.cjs`로 포트 3006에서 재기동
   (`.env.local`의 `BETTER_AUTH_URL`을 이 실행 동안만 `:3006`으로 맞췄다가 실행 후
   `:3005`로 원복 — env 값 변경이며 코드 변경 아님).
   - `POST /api/auth/sign-in/email` → **200**
   - `POST /api/cases`(synthetic 사건 입력, 아래 참고) → **201**, `caseId:
     bd453cfb-d40f-41f4-bb22-d49bc0ab4c8b`, **소요시간 30초**
   - `GET /cases/bd453cfb-d40f-41f4-bb22-d49bc0ab4c8b` → **200** (사건 상세 페이지 정상 렌더,
     "사건 상세" 헤딩 확인)

### 사용한 synthetic 사건 입력

`caseInputSchema`(`lib/validation/case-input.ts`)가 요구하는 4개 필드만 포함 — 완전
synthetic, 실명/주민번호/전화번호/상세주소/원본 의료기록 없음:

```json
{
  "incidentDescription": "2026년 8월 20일 창고에서 물건을 옮기던 중 바닥의 물기에 미끄러져 넘어지면서 왼쪽 발목을 심하게 접질렀습니다. 통증으로 즉시 병원 응급실로 이송되었습니다.",
  "diagnosisName": "좌측 발목 관절 인대 파열",
  "disabilityBodyPart": "좌측 발목",
  "incidentDate": "2026-08-20"
}
```

## 관측 결과

### 사용 model ID

| 역할 | model ID | env 변수 |
|------|----------|----------|
| Researcher | `gemini-3.6-flash` | `GEMINI_RESEARCH_MODEL` |
| Skeptic | `gemini-3.5-flash-lite` | `GEMINI_FAST_MODEL` |
| Verifier | `gemini-3.5-flash-lite` | `GEMINI_FAST_MODEL` |

### HTTP 결과

| 호출 | 결과 |
|------|------|
| `POST /api/auth/sign-in/email` | `200` |
| `POST /api/cases` | `201` |
| `GET /cases/{caseId}` | `200` |

### 총 소요시간

`POST /api/cases` 요청 시작~응답 수신까지 **30초**(curl 실측, CaseNormalizer →
QueryPlanner → EvidenceRetriever → Researcher → Skeptic → Verifier → report DB 저장 전
과정 포함).

### logical structured call count (관측기 로그, verbatim)

```json
{"ts":"2026-08-28T04:07:22.688Z","method":"POST","url":"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"}
{"ts":"2026-08-28T04:07:34.915Z","method":"POST","url":"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"}
{"ts":"2026-08-28T04:07:49.919Z","method":"POST","url":"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"}
```

파이프라인이 순차 실행(`lib/pipeline/index.ts`: Researcher → Skeptic → Verifier, 병렬 아님)이므로
시간 순서 그대로 역할이 대응된다:

| 순번 | 시각(UTC) | model | 역할 | 해석 |
|------|-----------|-------|------|------|
| 1 | 04:07:22.688 | gemini-3.6-flash | **Researcher = 1회** | 최초 호출, RESEARCH 전용 스케줄러 |
| 2 | 04:07:34.915 | gemini-3.5-flash-lite | **Skeptic = 1회** | FAST 공유 스케줄러 최초 호출(1번과 12.227초 간격 — 페이싱 대상 아님, 순수 처리 시간) |
| 3 | 04:07:49.919 | gemini-3.5-flash-lite | **Verifier = 1회** | FAST 공유 스케줄러 2번째 호출(2번과 **15.004초** 간격 — RPM budget 4 = 60/4=15초 최소 간격과 정확히 일치, RateScheduler pacing 계약이 실제로 작동함을 확인) |

**합계 3회(Researcher 1 + Skeptic 1 + Verifier 1) — PASS 기준 11 충족.** 중복 URL(재시도)
없음.

### retry / 429 / 503 발생 여부

**발생 없음.** 서버 로그(`grep -iE "429|503|error|retry|RESOURCE_EXHAUSTED|UNAVAILABLE"`)
매치 0건. RPM budget 4(15초 최소 간격)로 3회 호출 전부 첫 시도에 성공했다 — 지시사항의
"429가 발생하면 RetryInfo/backoff/RateScheduler pacing/bounded retry 계약에 따라 정상
회복되는지 확인" 절차는 이번 실행에서는 발동되지 않았다(429 자체가 없었으므로).

### DB 직접 조회 결과

```
case.status: "completed"
reviewTargets: 8개
verifiedClaims: 3개 (VERIFIED: 3, INSUFFICIENT: 0)
missingMaterials: 5개
counterArguments: 3개
claim.supportingEvidenceIds 길이 분포: [1, 1, 3]
counterArgument.counterEvidenceIds 길이 분포: [0, 0, 0]
```

### 금지 표현 검사

리포트 JSON 전체 텍스트 대상, "보험금 지급 확정"/"지급확률"/"지급 확률"/"확정 보험금"/
"100% 지급"/"무조건 지급" 6개 패턴 검사 — **0건 매치.**

### 전달되지 않은 evidence ID 인용 검사

리포트가 인용한 evidence ID 총 5개, `evidence` 테이블에 실제 존재하지 않는(전달되지
않은) ID **0건** — 전부 실제 전달된 evidence 집합의 부분집합.

## PASS 기준 판정 (11개 전부)

| # | 기준 | 판정 | 근거 |
|---|------|------|------|
| 1 | 코드 임시 수정 없음 | **PASS** | `git status --short` 빈 결과 — 추적 파일 변경 0건. env 값(`.env.local`, gitignore 대상)만 사용. 관측 방법론은 위 절 참고 |
| 2 | 실제 Researcher Gemini 호출 성공 | **PASS** | 관측 로그 1번째 호출(`gemini-3.6-flash`) + `reviewTargets` 8건 정상 생성 |
| 3 | 실제 Skeptic Gemini 호출 성공 | **PASS** | 관측 로그 2번째 호출 + `counterArguments` 3건 정상 생성 |
| 4 | 실제 Verifier Gemini 호출 성공 | **PASS** | 관측 로그 3번째 호출 + `verifiedClaims` 3건(VERIFIED 3, INSUFFICIENT 0) 정상 생성 |
| 5 | `POST /api/cases` = 201 | **PASS** | HTTP 201, `caseId` 반환 확인 |
| 6 | report DB 저장 성공 | **PASS** | `reports` 테이블에 `case_id` 매칭 행 존재, `case.status = "completed"` |
| 7 | `schema_validation_failed` 없음 | **PASS** | 서버 로그 grep 0건 매치 |
| 8 | 처리되지 않은 500 없음 | **PASS** | 서버 로그에 `500`/`Error:` 0건, 모든 HTTP 응답이 200/201 |
| 9 | 전달되지 않은 evidence ID 인용 없음 | **PASS** | 인용 evidence ID 5개 전부 전달된 evidence 집합의 부분집합, 미전달 ID 인용 0건 |
| 10 | 보험금 지급 확정/지급확률 등 금지 표현 없음 | **PASS** | 6개 금지 패턴 전수 검사 0건 매치 |
| 11 | 정상 logical call count Researcher=1/Skeptic=1/Verifier=1(총 3회), 관측 가능한 방식으로 확인 | **PASS** | `fetch()` 레벨 네트워크 관측기(코드 수정 아님, 위 방법론 절 참고)로 정확히 3건, 순서·모델 ID로 역할 대응 |

## 부가 관찰 (참고용, 코드 수정하지 않음)

- **`counterEvidenceIds`가 다시 전부 빈 배열([0,0,0])이었다.** 2026-08-27 smoke와 동일한
  관측 — `gemini-smoke-20260827.md`에 이미 기록된 "실제 출력에서 반박 evidence ID가
  선택되지 않았다"는 실측 사실과 정합한다. 원인(corpus 부족/Retriever 후보 부족/Skeptic
  prompt semantics/model behavior)은 여전히 미확정이며, 이번 smoke가 그 결론을 재확인
  (2/2 표본)했을 뿐 새로운 원인 후보를 추가하지는 않는다.
- Researcher→Skeptic 간격(12.227초)과 Skeptic→Verifier 간격(15.004초)의 차이는 RateScheduler
  설계와 정확히 일치한다 — Researcher는 RESEARCH 전용 스케줄러(이번 호출이 그 스케줄러의
  최초 호출이라 페이싱 대기 없음), Skeptic·Verifier는 동일 model(`gemini-3.5-flash-lite`)이라
  FAST 공유 스케줄러 하나를 쓰며, budget 4 RPM = 최소 15초 간격이 Skeptic→Verifier 사이에
  정확히 관측됐다.

## 잔여 위험 (Residual-risk)

- **RPM budget 재산정 필요**: 이번 세션은 AI Studio 대시보드 접근 수단이 없어 코드 기본값
  4를 그대로 사용했다 — 실제 프로젝트의 정확한 무료 tier 한도를 확인할 수 있는 세션에서
  70~80% 값으로 재조정하는 것이 권장된다(지시사항 원 조건).
- **백그라운드 dev 서버 잔존**: 이번 smoke를 위해 시작한 두 `next start` 프로세스(포트
  3005 예열용, 포트 3006 공식 관측용)가 이 세션 종료 시점에도 계속 실행 중이다 — 이 세션의
  권한 정책상 프로세스 종료(`kill`) 명령이 거부되어 직접 정리하지 못했다. 사용자가 필요시
  포트 3005/3006을 점유한 `node`/`next start` 프로세스를 직접 종료해야 한다.
- **표본 크기 1건**: 이번 smoke는 지시사항대로 1건만 수행했다 — `counterEvidenceIds` 항상
  빈 배열 관측은 2026-08-27/2026-08-28 두 차례 실행에서 모두 재현됐으나(n=2), 통계적으로
  확정적 결론을 내리기에는 여전히 표본이 작다.

## 결론

`feat/SPEC-GEMINI-RUNTIME-001` HEAD(`fb23553` / `fb2355397e547b1f77d938812e8d6af6678862ea`)에서 코드 수정 없이 env만으로 실제 Gemini
프로덕션 경로(로그인 → 사건 생성 → Researcher/Skeptic/Verifier 실호출 → report DB 저장 →
사건 상세 조회)가 끝까지 정상 동작함을 확인했다. 11개 PASS 기준 전부 충족. 자동 코드
수정이나 PR merge는 수행하지 않았다 — PR #4는 이 smoke 수행 전 상태(실 Gemini smoke 전
단계)에서 변경 없이 그대로 열려 있다.
