# SPEC-PILOT-READY-001 — Implementation Plan

## §A. Key Decisions (highest change-likelihood — read this first)

Per decision-reversibility ordering, these are the decisions most likely to need revision
during review or implementation. Everything else in this plan is a comparatively mechanical
consequence of these decisions.

1. **재제출 가드는 기존 `cases.status` 컬럼을 재사용하는 case-level "처리 중" 상태
   전이로 구현한다 — 신규 컬럼/마이그레이션 없음** (`lib/cases/create-case.ts`,
   REQ-PILOT-READY-007). `lib/db/schema.ts:75`의 `status` 컬럼(기본값 `"pending"`)은
   현재 파이프라인 완료 **이후** `"completed"`로 1회 INSERT될 때만 쓰인다. 이 SPEC은
   실행 순서를 다음과 같이 바꾼다: (a) `runPipeline` 호출 **이전**에 `status: "processing"`
   상태로 `cases` 행을 먼저 INSERT(같은 사용자·같은 논리적 제출에 대해 처리 중 행이
   이미 있으면 그 행을 재사용하고 새 파이프라인 실행 없이 "이미 처리 중" 응답 반환),
   (b) 파이프라인 완료 후 그 행을 `status: "completed"`로 UPDATE하고 `reports` 행을
   INSERT, (c) 파이프라인이 실패하면 그 행을 `status: "failed"`(또는 삭제)로 남겨
   재시도가 가능하게 한다. **매칭 키**: 클라이언트가 별도 dedup 키(nonce)를 보내지
   않으므로, 파일럿 규모(10명)에 맞춰 "동일 사용자(`ownerUserId`)당 동시에 최대 1개의
   `processing` 상태 행"이라는 단순한 스코프로 매칭한다 — 이는 SPEC-PILOT-UX-001
   iteration 3에서 기각된 `submissionNonce` + unique index 방식(요청 페이로드 해시
   기반 정밀 dedup)보다 훨씬 단순하며, 진정한 분산 idempotency를 주장하지 않는다.
   **거부된 대안**: `submissionNonce` 컬럼 추가 — SPEC-PILOT-UX-001 iteration 3에서
   이미 "`createCase`의 실행 순서상 SELECT-후-unique-index 접근으로는 동시 요청 경합을
   막지 못한다"는 이유로 기각됐고 이 판단은 유효하다; 이 SPEC의 가드는 nonce 매칭이
   아니라 "사용자당 동시 in-flight 파이프라인 최대 1개"라는 더 단순한 성질만 보장한다.
2. **Vercel Hobby(무료) tier를 배포 대상으로 가정한다** (REQ-PILOT-READY-001/002) — 이
   프로젝트에 유료 플랜 사용의 증거가 없다. 이 가정이 REQ-PILOT-READY-002의 타임아웃
   실측 결과 해석(상한을 넘는지 여부) 전체의 전제가 되므로, 만약 실제로 유료 플랜이거나
   다른 호스팅 대상이라면 이 SPEC의 run-phase 착수 전에 정정되어야 한다.
3. **동시성 REQ(REQ-PILOT-READY-006)는 측정만 하고 어떤 동시성 인프라도 도입하지
   않는다** — 큐/Redis/락 서비스 도입 여부는 이 SPEC이 내리는 결정이 아니라, 이 SPEC이
   남기는 측정 결과를 근거로 한 **후속 SPEC의 판단 대상**이다. run-phase 실행자는 이
   경계를 넘지 않는다(§D Risk 1 참고).

나머지(로깅 추가, 런북 작성, 데이터 고지 문구 개선, 운영 체크리스트 문서화)는 위
결정들의 비교적 기계적인 결과이며 독립적인 재검토 없이도 진행 가능하다.

## §B. Milestones

### M1 — 최소 서버측 재제출 가드 (코드 변경, §A 결정 1)

- Edit `lib/cases/create-case.ts`: `runPipeline(parsed.data)` 호출 **이전**에, 해당
  `ownerUserId`에 대해 `status: "processing"`인 기존 `cases` 행이 있는지 조회한다.
  있으면 새 파이프라인을 실행하지 않고 그 행의 상태("이미 처리 중")를 나타내는 구분된
  응답을 즉시 반환한다(REQ-PILOT-READY-007). 없으면 `status: "processing"`으로 새
  `cases` 행을 먼저 INSERT한 뒤 `runPipeline`을 호출한다.
- Edit `lib/cases/create-case.ts`: 파이프라인 성공 시 방금 INSERT한 행을
  `status: "completed"`로 UPDATE하고 `reports` 행을 INSERT한다(기존 성공 경로와 동일한
  최종 상태를 유지 — `CreateCaseSuccess` 반환 타입은 변경하지 않는다). 파이프라인이
  예외를 던지면 그 행을 `status: "failed"`로 UPDATE하여(또는 삭제하여) 이후 재시도가
  차단되지 않게 한다 — 실패 후 무한정 "처리 중"으로 남아 영구히 재시도를 막는 상태가
  되어서는 안 된다.
- Edit `app/api/cases/route.ts`: "이미 처리 중" 응답을 구분 가능한 HTTP 상태(예:
  `409 Conflict`)와 함께 클라이언트에 전달한다. 기존 `201`/`400`/`401` 응답 계약은
  변경하지 않는다.
- 신규 응답 타입(`CreateCaseResult` 유니온에 "already processing" 케이스 추가)의 정확한
  판별자(discriminant) 이름은 구현 시점에 기존 `success: false`/`fieldErrors` 패턴과
  충돌하지 않는 새 필드로 결정한다(예: `{ success: false, alreadyProcessing: true }`).

### M2 — 최소 구조적 로깅 (코드 변경)

- Edit `app/api/cases/route.ts`: 요청 시작 시점에 최소 1줄 구조적 로그(요청 ID 또는
  타임스탬프 + `ownerUserId` 존재 여부만, PII 없음)를 출력한다.
- Edit `lib/cases/create-case.ts` / `lib/pipeline/index.ts`: 파이프라인 각 단계
  (CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier) 실패 시
  단계 이름과 오류 요약을 로그로 남긴다 — 사건 입력 원문(자유 텍스트 3개 필드)은
  로그에 절대 포함하지 않는다(PII 최소화 원칙 유지).
- Edit `lib/cases/create-case.ts`: `cases`/`reports` 테이블 INSERT/UPDATE 실패 시 오류를
  로그로 남긴다.
- 새 의존성 추가 없음 — `console.error`/`console.warn`/`console.info` 기반의 최소
  구조(예: `{ event, caseId?, stage?, error? }` 형태의 JSON 문자열)로 충분하다
  (REQ-PILOT-READY-008).

### M3 — 데이터 취급 고지 정직성 개선 (코드+문서 변경)

- Edit `app/cases/new/page.tsx` (또는 `case-input-form.tsx`의 안내 영역): 기존
  "개인정보 비식별 안내" Notice(`page.tsx:55-56`)를 확장해, 스키마가 실제로 차단하는
  것(주민등록번호·전화번호 형식, 주소·의료기록 원본 필드 부재)과 차단하지 않는 것(3개
  자유 텍스트 필드는 스캔되지 않음)을 명시적으로 구분하고, "합성이거나 이미
  비식별화된 사례만 입력하라"는 테스터 책임 문장을 추가한다(REQ-PILOT-READY-011/012).
  "보장"·"확실히 차단"과 같은 과대 주장 표현은 사용하지 않는다.
- Edit `app/cases/new/page.tsx` (또는 안내 영역): 올바르게 비식별화된 synthetic 사건
  입력 예시 1건을 추가한다(REQ-PILOT-READY-014) — `.moai/reports/gemini-runtime-smoke-20260828.md`
  §"사용한 synthetic 사건 입력"에 이미 검증된 예시(`incidentDescription`/
  `diagnosisName`/`disabilityBodyPart`/`incidentDate` 4필드, 완전 synthetic)를 재사용해도
  된다.
- Edit `app/login/login-form.tsx`: `FOOTER_LINKS`의 "고객지원" 항목(`:14,127-135`)을
  실제 연락 채널(예: `mailto:` 링크)로 교체하거나, 그 옆에 실제 채널을 별도로
  추가한다(REQ-PILOT-READY-013) — 기존 `aria-disabled` 처리된 다른 2개 링크(이용약관/
  개인정보처리방침)는 이 SPEC의 범위 밖이므로 그대로 둔다.

### M4 — 운영 측정·검증 절차 실행 및 문서화 (측정형 REQ)

이 마일스톤의 각 불릿은 코드 변경이 아니라 **실제 배포 환경(또는 가장 근접한 가용
환경)에서 명령을 실행하고 그 결과를 리포트로 남기는 작업**이다. run-phase 실행자는
실제 배포 대상에 접근할 수 없다면 그 사실 자체를 구조화된 blocker 보고로 남기고,
"가장 근접한 가용 환경"(예: production 빌드 로컬 실행)에서의 근사 측정으로 대체
가능함을 문서에 명시해야 한다 — 근사 측정으로 대체한 경우 그 사실과 한계를 리포트에
반드시 기록한다.

- `.moai/reports/pilot-ready-timeout-measurement-<date>.md`(신규): `POST /api/cases`
  실제 처리 시간을 실측하고, Vercel Hobby tier 실행 시간 상한과 비교한 결과를
  기록한다(REQ-PILOT-READY-002).
- `.moai/reports/pilot-ready-quota-checklist-<date>.md`(신규, 또는 런북에 통합):
  Gemini 쿼터 대시보드 확인 및 RPM budget 값 조정을 사람이 수행하기 위한 체크리스트
  항목을 문서화한다(REQ-PILOT-READY-003) — 이 항목은 이 세션에서 실행되는 것이 아니라
  "파일럿 런칭 담당자가 런칭 직전 반드시 확인해야 할 절차"로 문서화된다.
- `.moai/reports/pilot-ready-remote-db-verification-<date>.md`(신규): 원격 Turso
  인스턴스에 대한 `pnpm db:migrate`/`pnpm db:seed`/`pnpm tester:add` 실행 결과를
  기록한다(REQ-PILOT-READY-004).
- `.moai/reports/pilot-ready-auth-domain-verification-<date>.md`(신규): 실제 배포
  도메인으로 설정한 `BETTER_AUTH_URL`에 대한 로그인 테스트 결과를 기록한다
  (REQ-PILOT-READY-005).
- `.moai/reports/pilot-ready-concurrency-measurement-<date>.md`(신규): 3~5개 동시
  `POST /api/cases` 요청의 관측된 거동(성공/실패/지연/경쟁 증상)을 기록한다 — 어떤
  결론(큐 필요 여부 등)도 이 리포트 안에서 내리지 않고, 관측 사실만 기록한다
  (REQ-PILOT-READY-006).
- `.moai/reports/gemini-runtime-smoke-<date>.md`(신규, `gemini-runtime-smoke-20260828.md`와
  동일 방법론): main HEAD(run-phase 시점 기준) 대비 실 Gemini 스모크를 재실행하고
  새 날짜의 리포트로 남긴다(REQ-PILOT-READY-010) — 기존 2026-08-27/2026-08-28 리포트를
  덮어쓰지 않는다.

### M5 — 최소 장애 대응 런북 (문서)

- Create `.moai/docs/pilot-incident-runbook.md`(신규, `.moai/docs/runtime-runbook.md`와는
  별개 — 후자는 로컬 개발 환경 절차이고 전자는 파일럿 운영 중 장애 대응 절차):
  (a) M2에서 추가한 로그를 어디서/어떻게 확인하는지, (b) 테스터에게 안전하게 재시도를
  안내하는 방법(REQ-PILOT-READY-007의 "이미 처리 중" 응답이 있으므로 무작정
  재시도해도 중복 파이프라인 실행은 발생하지 않음을 포함), (c) 이슈의 최종 triage
  담당자를 문서화한다(REQ-PILOT-READY-009).

### M6 — 테스트 (M1-M3 코드 변경만 대상)

측정형 REQ(M4)는 리포트 자체가 증거이므로 별도 유닛 테스트 대상이 아니다.

- `lib/cases/create-case.test.ts`(신규 또는 기존 확장 — 구현 전 `Glob`으로 기존 테스트
  파일 존재 여부 확인): 동일 `ownerUserId`로 두 번째 요청이 첫 번째가 아직 `processing`
  상태인 동안 도착하면 `runPipeline`이 두 번째로 호출되지 않고 구분된 응답이 반환됨을
  검증한다(REQ-PILOT-READY-007 — mock `runPipeline`을 즉시 resolve하지 않는 pending
  Promise로 설정해 in-flight 상태를 시뮬레이션). 파이프라인 실패 후 재시도 시
  `runPipeline`이 다시 호출됨(가드가 실패 시 해제됨)도 함께 검증한다.
- 로깅(M2)은 콘솔 출력 스파이(`vi.spyOn(console, ...)`)로 최소 1개 이상의 호출이
  발생하는지만 확인하는 가벼운 테스트로 충분하다 — 로그 포맷의 정확한 문자열까지
  단정하는 과도하게 구체적인 테스트는 작성하지 않는다.
- 데이터 고지 문구(M3)는 렌더 테스트로 "합성/비식별화된 사례만" 문구와 예시 텍스트가
  DOM에 존재하는지만 확인한다(REQ-PILOT-READY-012/014).

## §C. Technical Approach Summary

- **기존 `cases.status` 컬럼 재사용, 신규 마이그레이션 없음**: 재제출 가드는
  스키마 변경이 아니라 기존 컬럼의 기존 값(`"pending"`이 지금은 쓰이지 않던 상태였고,
  이 SPEC이 `"processing"`/`"failed"`를 실제로 활용하는 것)을 파이프라인 실행 순서
  재배치로 활용한다.
- **측정 우선, 인프라 도입은 후속 SPEC 판단**: REQ-PILOT-READY-002/006은 관측 결과를
  리포트로 남기는 것이 완료 조건이며, 그 결과를 근거로 인프라를 새로 도입할지는 이
  SPEC의 결정 범위 밖이다.
- **로깅은 최소 구조, 새 의존성 없음**: `console.*` 기반의 구조화된 JSON 한 줄 로그로
  충분하며, PII(자유 텍스트 입력 원문)는 절대 로그에 포함하지 않는다.
- **데이터 고지는 "과대 주장 금지"가 최우선 제약**: REQ-PILOT-READY-011(Unwanted)은
  다른 모든 REQ보다 우선하는 제약으로, M3의 모든 문구 변경에 적용된다.

## §D. Risks

1. **동시성 REQ의 범위 이탈(scope creep) 위험** — REQ-PILOT-READY-006은 명시적으로
   "측정만, 인프라 도입 없음"이다. run-phase 실행자가 관측 결과를 보고 "그럼 바로
   Redis 락을 추가하자"는 식으로 범위를 넘어서는 것은 이 SPEC의 승인 범위를 벗어난다.
   완화책: M4 해당 불릿에 "어떤 결론도 이 리포트 안에서 내리지 않는다"는 제약을 명시.
2. **배포 대상 접근 불가 위험** — run-phase 실행자가 실제 Vercel 배포 환경(또는 원격
   Turso 인스턴스)에 접근할 수 없을 수 있다. 완화책: M4 서문에 "가장 근접한 가용
   환경으로 대체 가능, 단 그 사실과 한계를 리포트에 명시"라는 대체 경로를 이미 포함함.
   접근이 전혀 불가능하면 구조화된 blocker 보고로 오케스트레이터에 에스컬레이션한다.
3. **재제출 가드의 매칭 스코프가 파일럿 규모를 넘어서는 사용에는 부적합** — "사용자당
   동시 1개"라는 스코프는 10명 파일럿에는 충분하지만, 한 사용자가 의도적으로 여러
   사건을 동시에 제출하려는 정당한 사용 사례가 있다면 이 가드가 그것도 차단한다.
   완화책: §A 결정 1에서 이 트레이드오프를 명시적으로 진술했고, plan-auditor 검토
   시점에 이 스코프가 파일럿 사용 패턴과 실제로 맞는지 재확인이 필요하다.

## §E. PRESERVE List (files this SPEC MUST NOT modify beyond the stated edit)

- `lib/pipeline/**`(단계 알고리즘 자체), `lib/ai/**`(모델 선택·RateScheduler 페이싱
  로직) — REQ-PILOT-READY-008의 로그 추가 지점(`lib/pipeline/index.ts`,
  `lib/ai/providers/gemini.ts`)을 제외하고는 알고리즘·타입 계약 미변경
- `lib/db/schema.ts` — 컬럼 추가/마이그레이션 없음(§A 결정 1)
- `lib/validation/case-input.ts` — 기존 PII 차단 검증(`piiFreeText` 등) 미변경, 미약화
- `lib/feedback/**` — 완전히 범위 밖(이 SPEC은 사건 생성 경로만 다룸)
- `lib/auth/**`(설정값 제외) — 인증 로직 자체는 미변경, `BETTER_AUTH_URL` 등 배포
  환경변수 값만 REQ-PILOT-READY-005의 검증 대상
- `app/cases/[caseId]/**`(리포트 표시·피드백 화면) — 완전히 범위 밖
- `ResearchReport`/`VerifiedClaim`/`EvidenceCandidate` 타입 계약(`lib/pipeline/types.ts`) — 미변경
