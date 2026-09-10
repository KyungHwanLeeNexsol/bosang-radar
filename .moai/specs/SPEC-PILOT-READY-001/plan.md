# SPEC-PILOT-READY-001 — Implementation Plan

## §A. Key Decisions (highest change-likelihood — read this first)

Per decision-reversibility ordering, these are the decisions most likely to need revision
during review or implementation. Everything else in this plan is a comparatively mechanical
consequence of these decisions.

1. **재제출 가드의 원자성 구현 방식은 두 옵션 중 하나이며, 실제 채택은 run-phase 착수
   전 사용자 확인이 필요한 미확정 결정이다** (`lib/cases/create-case.ts`,
   REQ-PILOT-READY-007). 외부 리뷰에서 지적된 대로, SELECT-후-INSERT app 레벨
   check-then-act 구조는 두 요청이 거의 동시에 도착하면 경쟁 구간을 막지 못해 진정한
   원자성을 제공하지 않는다.
   - **옵션 A (권고안) — 신규 예약 테이블 + DB 제약 원자성**: `ownerUserId`를 키로 하는
     신규 `reservations` 테이블 + plain `UNIQUE` 제약. `INSERT INTO reservations
     (owner_user_id) VALUES (?) ON CONFLICT DO NOTHING` 후 `rowsAffected`를 확인해
     예약 획득 여부를 판정(0이면 이미 다른 요청이 보유 — "이미 처리 중"으로 응답),
     파이프라인 종료(성공/실패 모두) 시 그 예약 행을 삭제한다. 이 프로젝트가 사용하는
     Turso Cloud 표준(비-MVCC, 일반 `libsql://` 원격 연결 — 신규 opt-in MVCC `tursodb`
     타입이 아님) 아키텍처는 SQLite의 단일 writer 트랜잭션 모델을 그대로 가지므로
     (docs.turso.tech §Client Access — "쓰기 트랜잭션이 진행되는 동안 다른 쓰기
     트랜잭션은 진행될 수 없다"), `UNIQUE` + `ON CONFLICT DO NOTHING`은 DB 엔진 수준의
     진정한 원자성을 제공한다(turso.tech/blog/concurrent-writes-on-turso-cloud로 표준
     아키텍처와 opt-in MVCC 엔진이 별개임을 확인). 소규모 스키마 마이그레이션(신규
     테이블 1개)이 필요하다는 점에서 원 SPEC의 "무마이그레이션" 프레이밍과 상충한다.
   - **옵션 B — 무마이그레이션 대안 (원 설계)**: 기존 `cases.status` 컬럼만 재사용하는
     SELECT-후-INSERT 방식. 마이그레이션은 없으나 진정한 경쟁 구간 해소를 보장하지
     않는다 — 파일럿 규모(~10명, 의도적 동시 이중 제출 가능성 낮음)에서 좁아진 위험을
     수용하는 선택이다.
   - **매칭 키**: 두 옵션 모두 클라이언트가 별도 dedup 키(nonce)를 보내지 않으므로,
     "동일 사용자(`ownerUserId`)당 동시에 최대 1개의 in-flight 상태"라는 단순한
     스코프로 매칭한다 — 이는 SPEC-PILOT-UX-001 iteration 3에서 기각된
     `submissionNonce` + unique index 방식(요청 페이로드 해시 기반 정밀 dedup)보다
     훨씬 단순하며, 진정한 분산 idempotency(REQ-PILOT-READY-015 참고)를 주장하지 않는다.
   - **거부된 대안**: `submissionNonce` 컬럼 추가 — SPEC-PILOT-UX-001 iteration 3에서
     이미 "`createCase`의 실행 순서상 SELECT-후-unique-index 접근으로는 동시 요청 경합을
     막지 못한다"는 이유로 기각됐고 이 판단은 유효하다; 옵션 A/B 어느 쪽도 nonce 매칭이
     아니라 "사용자당 동시 in-flight 파이프라인 최대 1개"라는 더 단순한 성질만 보장한다.
2. **재제출 가드는 동시성 제한(concurrency limit)만 보장하며, 제출 idempotency는
   보장하지 않는다 — 4개 실패 모드는 명시적으로 문서화하되 코드로 전부 해결하지
   않는다** (REQ-PILOT-READY-015). 크래시로 인한 고착 상태 복구, 완료+리포트 저장의
   원자성, 응답 유실 후 재제출 시 동작, 지연 도착 결과와 재시도 결과의 충돌 가능성 —
   이 4가지 각각에 대해 "해결됨" 또는 "이 파일럿 규모에서 의도적으로 다루지 않는 gap"
   중 하나로 명확히 기록해야 하며, 다루지 않는 gap을 해결된 것처럼 진술해서는 안 된다.
3. **Vercel 배포 tier 선택은 실행 시간이 아니라 Fair Use Guidelines 상용 사용 정의 준수
   여부의 문제이며, 실제 tier 선택은 run-phase 착수 전 사용자 확인이 필요한 미확정
   결정이다** (REQ-PILOT-READY-001/002). Vercel Hobby tier의 Fair Use Guidelines는
   "이 프로젝트 제작에 관여한 누군가(유급 인력 포함)의 금전적 이익을 위한 배포"를
   상용 사용으로 정의하며, 유급 개발자가 구축한 B2B 파일럿이 이 정의에 해당하는지는
   Vercel 공식 문서만으로 확정할 수 없다. Fluid Compute 기본 활성화 상태에서 Hobby
   tier 실행 시간 상한(300초)은 로컬 실측(30초)에 여유가 있으므로 실행 시간 자체는
   더 이상 결정적 리스크가 아니다 — Pro tier($20/좌석/월 + 사용량, ToS 준수 명시)와
   Hobby tier(무료, ToS 준수 여부 미확인) 두 후보를 문서화하고 사용자 확인을 기다린다.
4. **동시성 REQ(REQ-PILOT-READY-006)는 서로 다른 사용자의 일반 동시 부하만 측정하고
   어떤 동시성 인프라도 도입하지 않는다** — REQ-PILOT-READY-007(동일 사용자 가드)과는
   측정 대상이 다르다는 점을 명확히 구분한다. 큐/Redis/락 서비스 도입 여부는 이 SPEC이
   내리는 결정이 아니라, 이 SPEC이 남기는 측정 결과를 근거로 한 **후속 SPEC의 판단
   대상**이다. run-phase 실행자는 이 경계를 넘지 않는다(§D Risk 1 참고).

나머지(로깅 추가, 런북 작성, 데이터 고지 문구 개선, 운영 체크리스트 문서화)는 위
결정들의 비교적 기계적인 결과이며 독립적인 재검토 없이도 진행 가능하다.

## §B. Milestones

### M1 — 최소 서버측 재제출 가드 (코드 변경, §A 결정 1 — 옵션 A/B 중 Kickoff 승인된 것으로 구현)

M1 착수 전, Implementation Kickoff Approval 단계에서 §A 결정 1의 옵션 A(예약 테이블,
권고) 또는 옵션 B(컬럼 재사용, 무마이그레이션)가 확정되어 있어야 한다. 아래는 두
옵션 각각의 구현 지침이다 — run-phase 실행자는 확정된 옵션 하나만 구현한다.

**옵션 A(권고, 예약 테이블) 채택 시:**
- `lib/db/schema.ts`에 신규 `reservations` 테이블 추가: `ownerUserId`(PK 또는
  `UNIQUE` 제약) 1개 컬럼 + 생성 시각. Drizzle Kit으로 마이그레이션 파일을 생성한다
  (`pnpm db:generate`).
- Edit `lib/cases/create-case.ts`: `runPipeline` 호출 **이전**에
  `INSERT INTO reservations (owner_user_id) VALUES (?) ON CONFLICT DO NOTHING`을
  실행하고 `rowsAffected`(또는 Drizzle이 노출하는 동등한 영향받은 행 수)를 확인한다.
  0이면 예약을 획득하지 못한 것이므로 새 파이프라인을 실행하지 않고 "이미 처리 중"
  응답을 즉시 반환한다. 1이면 예약을 획득한 것이므로 `runPipeline`을 호출한다.
- 파이프라인 종료(성공/실패 모두) 시 해당 `reservations` 행을 삭제한다 — 실패 후
  무한정 예약이 남아 영구히 재시도를 막는 상태가 되어서는 안 된다(REQ-PILOT-READY-015(a)
  크래시 복구 gap과는 별개로, 정상 종료 경로의 예약 해제는 이 코드 경로에서 직접
  보장한다).
- 파이프라인 성공 시 `cases` 행을 `status: "completed"`로 INSERT하고 `reports` 행을
  INSERT한다(기존 `CreateCaseSuccess` 반환 타입은 변경하지 않는다).

**옵션 B(무마이그레이션, 컬럼 재사용) 채택 시:**
- Edit `lib/cases/create-case.ts`: `runPipeline(parsed.data)` 호출 **이전**에, 해당
  `ownerUserId`에 대해 `status: "processing"`인 기존 `cases` 행이 있는지 조회한다.
  있으면 새 파이프라인을 실행하지 않고 그 행의 상태("이미 처리 중")를 나타내는 구분된
  응답을 즉시 반환한다. 없으면 `status: "processing"`으로 새 `cases` 행을 먼저
  INSERT한 뒤 `runPipeline`을 호출한다. **이 경로는 SELECT-후-INSERT이므로 진정한
  원자성을 제공하지 않는다** — REQ-PILOT-READY-007에 명시된 대로 그 한계를 코드
  주석과 리포트에 명시한다.
- Edit `lib/cases/create-case.ts`: 파이프라인 성공 시 방금 INSERT한 행을
  `status: "completed"`로 UPDATE하고 `reports` 행을 INSERT한다. 파이프라인이
  예외를 던지면 그 행을 `status: "failed"`로 UPDATE하여(또는 삭제하여) 이후 재시도가
  차단되지 않게 한다.

**두 옵션 공통:**
- Edit `app/api/cases/route.ts`: "이미 처리 중" 응답을 구분 가능한 HTTP 상태(예:
  `409 Conflict`)와 함께 클라이언트에 전달한다. 기존 `201`/`400`/`401` 응답 계약은
  변경하지 않는다. `app/cases/new/case-input-form.tsx`의 기존 제네릭 에러 처리
  (`response.status !== 201`이면 `data.error`를 표시)가 그대로 이 응답을 처리하므로,
  클라이언트 코드 변경은 필요 없다 — `data.error`에 "이미 처리 중입니다" 같은
  사용자 친화적 메시지를 담는 것으로 충분하다.
- 신규 응답 타입(`CreateCaseResult` 유니온에 "already processing" 케이스 추가)의 정확한
  판별자(discriminant) 이름은 구현 시점에 기존 `success: false`/`fieldErrors` 패턴과
  충돌하지 않는 새 필드로 결정한다(예: `{ success: false, alreadyProcessing: true }`).
- REQ-PILOT-READY-015(a)~(d)의 4개 실패 모드 각각에 대해, 채택된 옵션에서 실제로
  해결되는지 여부를 M4의 신규 리포트(아래)에 명시적으로 기록한다 — 코드로 해결하지
  않는 모드는 "의도적으로 다루지 않는 gap"으로 정직하게 남긴다.

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

- `.moai/reports/pilot-ready-deployment-tier-decision-<date>.md`(신규): Hobby(무료,
  ToS 준수 여부 미확인)와 Pro($20/좌석/월 + 사용량, ToS 준수 명시) 두 후보를
  Fair Use Guidelines 상용 사용 정의 관점에서 병기하고, 실제 tier 선택을 비용 결정
  권한자의 확인을 받아 기록한다(REQ-PILOT-READY-001) — 이 리포트가 확정하는 tier가
  아래 타임아웃 측정 리포트의 비교 기준이 된다.
- `.moai/reports/pilot-ready-timeout-measurement-<date>.md`(신규): `POST /api/cases`
  실제 처리 시간을 실측하고, 위에서 선택된 tier의 실행 시간 상한과 비교한 결과를
  기록한다(REQ-PILOT-READY-002) — 정합성 확인(sanity check)이며, 상한 초과 시
  대응책은 이 리포트에서 결정하지 않는다.
- `.moai/reports/pilot-ready-quota-checklist-<date>.md`(신규, 또는 런북에 통합):
  Gemini 쿼터 대시보드 확인 및 RPM budget 값 조정을 사람이 수행하기 위한 체크리스트
  항목을 문서화한다(REQ-PILOT-READY-003) — 이 항목은 이 세션에서 실행되는 것이 아니라
  "파일럿 런칭 담당자가 런칭 직전 반드시 확인해야 할 절차"로 문서화된다.
- `.moai/reports/pilot-ready-remote-db-verification-<date>.md`(신규): 원격 Turso
  인스턴스에 대한 `pnpm db:migrate`/`pnpm db:seed`/`pnpm tester:add` 실행 결과를
  기록한다(REQ-PILOT-READY-004) — §M1에서 옵션 A가 채택된 경우, 신규
  `reservations` 테이블 마이그레이션도 이 원격 실행 검증 대상에 포함한다. 로컬
  대체는 이 REQ에서 허용되지 않는다(정의상 원격 인스턴스가 필요).
- `.moai/reports/pilot-ready-auth-domain-verification-<date>.md`(신규): 실제 배포
  도메인으로 설정한 `BETTER_AUTH_URL`에 대해 (a) 로그인 요청 성공, (b) 세션 수립
  확인, (c) 그 세션으로 보호된 페이지(`/cases/new`) 접근 가능 여부, 3가지를 각각
  구분해 기록한다(REQ-PILOT-READY-005). 로컬 대체는 이 REQ에서 허용되지 않는다.
- `.moai/reports/pilot-ready-concurrency-measurement-<date>.md`(신규): 서로 다른
  사용자 계정으로 발생시킨 3~5개 동시 `POST /api/cases` 요청의 관측된 거동
  (성공/실패/지연/경쟁 증상)을 기록한다 — 어떤 결론(큐 필요 여부 등)도 이 리포트
  안에서 내리지 않고, 관측 사실만 기록한다(REQ-PILOT-READY-006). 이 리포트는
  REQ-PILOT-READY-007(동일 사용자 가드)을 검증하지 않는다 — 그 검증은 M6의 유닛
  테스트와 AC-PILOT-READY-015가 별도로 담당한다.
- `.moai/reports/pilot-ready-idempotency-scope-<date>.md`(신규): §A 결정 1에서
  채택된 옵션(A 또는 B)을 명시하고, REQ-PILOT-READY-015(a)~(d) 4개 실패 모드 각각에
  대해 "해결됨(메커니즘 설명)" 또는 "이 파일럿 규모에서 의도적으로 다루지 않는 gap"
  중 하나로 정직하게 기록한다(REQ-PILOT-READY-015) — 어떤 항목도 실제로 검증하지
  않은 채 "해결됨"으로 표시해서는 안 된다.
- `.moai/reports/gemini-runtime-smoke-<date>.md`(신규, `gemini-runtime-smoke-20260828.md`와
  동일 방법론): main HEAD(run-phase 시점 기준) 대비 실 Gemini 스모크를 재실행하고,
  Researcher/Skeptic/Verifier 3단계 각각의 성공 여부·`201` 응답·DB 영속화·재조회
  일치·실제 호출 횟수 일치 5가지를 개별 확인해 새 날짜의 리포트로 남긴다
  (REQ-PILOT-READY-010) — 기존 2026-08-27/2026-08-28 리포트를 덮어쓰지 않는다.

### M5 — 최소 장애 대응 런북 (문서)

- Create `.moai/docs/pilot-incident-runbook.md`(신규, `.moai/docs/runtime-runbook.md`와는
  별개 — 후자는 로컬 개발 환경 절차이고 전자는 파일럿 운영 중 장애 대응 절차):
  (a) M2에서 추가한 로그를 어디서/어떻게 확인하는지, (b) 테스터에게 안전하게 재시도를
  안내하는 방법 — REQ-PILOT-READY-007의 "이미 처리 중" 응답 덕분에 **같은 사용자가
  하나의 요청이 아직 처리 중인 동안 다시 제출해도 두 번째 파이프라인이 추가로
  시작되지는 않는다**는 점은 안내하되, "재시도는 무제한으로 해도 항상 안전하다"는
  과잉 보장은 하지 않는다 — REQ-PILOT-READY-015에서 문서화한 대로 크래시 복구·응답
  유실 후 재제출 등 이 가드가 다루지 않는 실패 모드가 남아 있으므로, 재시도 안내에는
  "짧은 시간 내 반복 재시도보다는 안내된 대기 후 재시도"를 권장하는 수준으로 그친다.
  (c) 이슈의 최종 triage 담당자를 문서화한다(REQ-PILOT-READY-009).

### M6 — 테스트 (M1-M3 코드 변경만 대상)

측정형 REQ(M4)는 리포트 자체가 증거이므로 별도 유닛 테스트 대상이 아니다.

- `lib/cases/create-case.test.ts`(신규 또는 기존 확장 — 구현 전 `Glob`으로 기존 테스트
  파일 존재 여부 확인): 동일 `ownerUserId`로 두 번째 요청이 첫 번째가 아직 `processing`
  (또는 옵션 A의 예약 행) 상태인 동안 도착하면 `runPipeline`이 두 번째로 호출되지
  않고 구분된 응답이 반환됨을 검증한다(REQ-PILOT-READY-007 — mock `runPipeline`을
  즉시 resolve하지 않는 pending Promise로 설정해 in-flight 상태를 시뮬레이션). 파이프라인
  실패 후 재시도 시 `runPipeline`이 다시 호출됨(가드가 실패 시 해제됨)도 함께 검증한다.
  **추가로(AC-PILOT-READY-015)**: "첫 번째 호출이 아직 진행 중인 동안 두 번째 호출"이
  아니라, **두 호출을 첫 번째 읽기/확인 시점부터 가능한 한 동시에** 발생시키는 테스트를
  별도로 작성한다(예: 두 `createCase` 호출을 `Promise.all`로 동시에 시작하고, 가드
  메커니즘 내부의 읽기/쓰기 순서를 mock으로 제어해 두 호출이 서로의 쓰기를 보기 전에
  각자의 확인 단계에 도달하도록 강제) — 이는 "두 번째 호출이 첫 번째 호출 완료를 기다린
  뒤 도착"하는 더 약한 시나리오와 구분되는, 진성 경쟁 조건(genuine race condition)
  테스트다. 옵션 A(예약 테이블)가 채택된 경우 이 테스트는 실제 DB(또는 in-memory
  SQLite 등 `UNIQUE` 제약을 실제로 강제하는 대상)에 대해 두 INSERT를 동시에 실행해
  `ON CONFLICT DO NOTHING`이 실제로 하나만 성공시키는지 확인해야 한다 — mock만으로는
  DB 엔진 수준의 원자성 자체를 검증할 수 없다.
- 로깅(M2)은 콘솔 출력 스파이(`vi.spyOn(console, ...)`)로 최소 1개 이상의 호출이
  발생하는지만 확인하는 가벼운 테스트로 충분하다 — 로그 포맷의 정확한 문자열까지
  단정하는 과도하게 구체적인 테스트는 작성하지 않는다.
- 데이터 고지 문구(M3)는 렌더 테스트로 "합성/비식별화된 사례만" 문구와 예시 텍스트가
  DOM에 존재하는지만 확인한다(REQ-PILOT-READY-012/014).

## §C. Technical Approach Summary

- **재제출 가드의 데이터 계층 변경 범위는 Kickoff 승인된 옵션에 따라 결정된다**: 옵션
  A(예약 테이블)이면 신규 테이블 1개 + 마이그레이션 1건, 옵션 B(컬럼 재사용)이면
  마이그레이션 없음 — 어느 쪽이든 진짜 원자성 여부(옵션 A: DB 제약 기반 원자성 /
  옵션 B: 경쟁 구간 존재)를 코드 주석과 리포트에 정직하게 기록한다.
- **측정 우선, 인프라 도입은 후속 SPEC 판단**: REQ-PILOT-READY-002/006은 관측 결과를
  리포트로 남기는 것이 완료 조건이며, 그 결과를 근거로 인프라를 새로 도입할지는 이
  SPEC의 결정 범위 밖이다. 이는 "측정 결과를 보고 파일럿 진행 여부를 판단하는 것"과는
  다른 별개의 스코프 제약이다(spec.md § 측정 완료 vs. 파일럿 진행 여부 판단 구분 참고).
- **동시성 제한과 제출 idempotency는 서로 다른 보장이며 혼동하지 않는다**: 재제출
  가드가 보장하는 것은 "동일 사용자당 동시 in-flight 1개"뿐이다. 크래시 복구,
  완료+리포트 저장 원자성, 응답 유실 후 재제출, 지연 도착 결과 충돌 — 이 4가지는
  REQ-PILOT-READY-015로 명시적으로 문서화하되, 코드로 전부 해결하지 않아도 된다(단,
  다루지 않는 gap을 해결된 것처럼 진술하는 것은 금지).
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
   환경으로 대체 가능, 단 그 사실과 한계를 리포트에 명시"라는 대체 경로를 이미
   포함하되, REQ-PILOT-READY-004/005(원격 DB/실 배포 도메인 인증)는 정의상 로컬 대체가
   불가능함을 유의한다. 접근이 전혀 불가능하면 구조화된 blocker 보고로 오케스트레이터에
   에스컬레이션한다.
3. **재제출 가드의 매칭 스코프가 파일럿 규모를 넘어서는 사용에는 부적합** — "사용자당
   동시 1개"라는 스코프는 10명 파일럿에는 충분하지만, 한 사용자가 의도적으로 여러
   사건을 동시에 제출하려는 정당한 사용 사례가 있다면 이 가드가 그것도 차단한다.
   완화책: §A 결정 1/2에서 이 트레이드오프를 명시적으로 진술했고, plan-auditor 검토
   시점에 이 스코프가 파일럿 사용 패턴과 실제로 맞는지 재확인이 필요하다.
4. **재제출 가드 구현 방식(옵션 A/B) 미확정 상태로 run-phase에 진입할 위험** — §A
   결정 1은 이 SPEC이 스스로 확정하지 않는 미확정 결정이다. 완화책: Implementation
   Kickoff Approval 단계에서 반드시 옵션 A/B 중 하나를 사용자로부터 확인받은 뒤에만
   M1을 시작한다 — 확정 없이 M1에 착수하는 것은 금지된다.
5. **배포 tier(Hobby/Pro) 미확정 상태로 run-phase에 진입할 위험** — §A 결정 3도 이
   SPEC이 스스로 확정하지 않는 미확정 결정이다. 완화책: M4의 tier 결정 리포트를 가장
   먼저 작성해 확정한 뒤에야 M4의 타임아웃 측정 리포트(비교 기준이 그 tier이므로)로
   진행한다.
6. **"최근 리서치" 패널의 processing/failed 상태 라벨 미표시** — REQ-PILOT-READY-007
   구현으로 `processing`/`failed` 상태의 `cases` 행이 실제로 생성될 수 있으나,
   `recent-research-panel.tsx`의 `STATUS_LABELS`는 이를 매핑하지 않아 영문 원문이
   노출된다(spec.md Out of Scope 참고). 완화책: 이 SPEC의 범위에서는 코드 수정 없이
   문서화만 하며, run-phase 실행자는 이 갭을 인지한 상태로 M1을 구현하되 UI 레이어를
   건드리지 않는다(§E PRESERVE 참고) — 후속 SPEC 또는 별도 후속 커밋의 판단에 맡긴다.

## §E. PRESERVE List (files this SPEC MUST NOT modify beyond the stated edit)

- `lib/pipeline/**`(단계 알고리즘 자체), `lib/ai/**`(모델 선택·RateScheduler 페이싱
  로직) — REQ-PILOT-READY-008의 로그 추가 지점(`lib/pipeline/index.ts`,
  `lib/ai/providers/gemini.ts`)을 제외하고는 알고리즘·타입 계약 미변경
- `lib/db/schema.ts` — §A 결정 1에서 옵션 B(무마이그레이션)가 승인된 경우에만 미변경;
  옵션 A(예약 테이블)가 승인된 경우 신규 `reservations` 테이블 추가만 허용되며 기존
  테이블(`cases`/`evidence`/`reports`/`feedback`/`allowed_testers`)의 컬럼·제약은
  변경하지 않는다
- `lib/validation/case-input.ts` — 기존 PII 차단 검증(`piiFreeText` 등) 미변경, 미약화
- `lib/feedback/**` — 완전히 범위 밖(이 SPEC은 사건 생성 경로만 다룸)
- `lib/auth/**`(설정값 제외) — 인증 로직 자체는 미변경, `BETTER_AUTH_URL` 등 배포
  환경변수 값만 REQ-PILOT-READY-005의 검증 대상
- `app/cases/[caseId]/**`(리포트 표시·피드백 화면) — 완전히 범위 밖
- `app/cases/new/recent-research-panel.tsx`(`STATUS_LABELS` 포함) — spec.md Out of
  Scope에서 명시적으로 미룬 UI 라벨 매핑 갭이며, 이 SPEC은 문서화만 하고 수정하지
  않는다
- `ResearchReport`/`VerifiedClaim`/`EvidenceCandidate` 타입 계약(`lib/pipeline/types.ts`) — 미변경
