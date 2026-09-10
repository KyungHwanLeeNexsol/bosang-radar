# SPEC-PILOT-READY-001 — Acceptance Criteria

Given-When-Then scenarios, grouped by REQ family. Each criterion is binary-testable
(PASS/FAIL against an observable command output, DB row, rendered element, or the
existence + stated content of a report file) per the verification-layer contract —
GEARS requirement wording lives in `spec.md` §2; this file never restates a
requirement as a scenario.

## AC Group A — 배포 대상 tier 결정 및 호스팅 실행 시간 정합성 확인 (REQ-PILOT-READY-001, REQ-PILOT-READY-002)

**AC-PILOT-READY-001**
- Given `.moai/reports/pilot-ready-deployment-tier-decision-*.md` 리포트
- When 배포 대상 tier 결정 내용을 확인하면
- Then Hobby(무료, Fair Use Guidelines 상용 사용 정의 미확인)와 Pro($20/좌석/월 +
  사용량, ToS 준수 명시) 두 후보가 각각의 트레이드오프와 함께 명시적으로 기록되어
  있고, 실제 선택이 "비용 결정 권한자의 확인이 필요한 미확정 결정"으로 표시되어
  있거나, 사용자 확인을 거쳐 확정된 선택과 확인 근거(누가/언제 확인했는지)가 기록되어
  있다.
- And 이 AC는 리포트 존재와 기록 내용의 완전성만 판정하며, Hobby와 Pro 중 어느 쪽을
  최종 선택했는지에 대해서는 옳고 그름을 판정하지 않는다.

**AC-PILOT-READY-002**
- Given AC-PILOT-READY-001에서 확정(또는 잠정 확정)된 tier, 배포된(또는 가장 근접한
  가용) 환경
- When `POST /api/cases`에 대해 실제 요청을 1건 이상 실행하면
- Then `.moai/reports/pilot-ready-timeout-measurement-*.md` 리포트가 존재하고, 실측
  처리 시간(초 단위 구체적 수치)과 확정된 tier의 실행 시간 상한과의 비교 결론(상한
  이내/초과)이 명시적으로 기록되어 있다.
- And 가장 근접한 가용 환경(로컬 대체 포함)으로 대체했다면, 그 사실과 한계가
  리포트에 명시되어 있다 — 로컬 대체 실측값은 참고 증거로만 취급되며, "배포된
  환경에서 실측했다"고 리포트에 오기재해서는 안 된다.
- And 이 AC는 "측정이 정확히 수행·기록되었는가"만 판정한다 — 측정된 처리 시간이
  상한을 초과하거나 미달하는 것 자체는 이 AC의 PASS/FAIL을 바꾸지 않는다(spec.md §
  측정 완료 vs. 파일럿 진행 여부 판단 구분 참고).

## AC Group B — Gemini 쿼터 사전 점검 (REQ-PILOT-READY-003)

**AC-PILOT-READY-003**
- Given 파일럿 런칭 전 운영 체크리스트 문서(런북 또는 별도 리포트)
- When 그 문서를 확인하면
- Then "AI Studio 쿼터 대시보드를 확인하고 `GEMINI_RESEARCH_RPM_BUDGET`/
  `GEMINI_FAST_RPM_BUDGET`을 관측된 실제 한도의 약 70~80%로 설정한다"는 절차가 체크리스트
  항목으로 명시적으로 존재한다.
- And 이 AC는 코드 diff에 `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`의 기본값
  변경을 요구하지 않는다(운영 절차 문서화만으로 충족).

## AC Group C — 원격 DB 마이그레이션/시드 실행 검증 (REQ-PILOT-READY-004)

**AC-PILOT-READY-004**
- Given 실제 원격 Turso 인스턴스(`libsql://` 또는 `https://` 스킴) 접속 정보
- When `pnpm db:migrate` → `pnpm db:seed` → `pnpm tester:add`를 그 원격 인스턴스에 대해 실제로 실행하면
- Then `.moai/reports/pilot-ready-remote-db-verification-*.md` 리포트가 존재하고,
  각 명령의 실행 결과(성공/실패, 관측된 오류 메시지가 있다면 그 내용)가 기록되어 있다.
- And 이 AC는 로컬 대체를 허용하지 않는다 — 로컬 `file:` DB에 대한 실행 결과는 이
  AC의 PASS 조건을 충족시키지 않는다(정의상 "원격" 인스턴스가 요구되기 때문).
  §A 결정 1에서 옵션 A(예약 테이블)가 채택된 경우, 신규 `reservations` 테이블
  마이그레이션도 이 실행 대상에 포함되어야 한다.

## AC Group D — 실제 배포 도메인 인증 설정 검증 (REQ-PILOT-READY-005)

**AC-PILOT-READY-005**
- Given 실제 배포된 도메인으로 설정된 `BETTER_AUTH_URL`
- When 그 도메인에 대해 로그인 요청(`POST /api/auth/sign-in/email` 또는 UI를 통한 로그인)을 실행하면
- Then `.moai/reports/pilot-ready-auth-domain-verification-*.md` 리포트가 존재하고,
  다음 3가지가 각각 개별적으로 구분되어 기록되어 있다: (a) 로그인 요청 자체의 성공
  여부(HTTP 상태 또는 UI 성공 신호), (b) 그 로그인으로 실제 세션이 수립됐는지(세션
  쿠키/토큰 존재 확인), (c) 수립된 세션으로 보호된 페이지(`/cases/new`)에 실제로
  접근 가능한지. 세 가지 중 하나라도 리포트에서 확인할 수 없으면 이 AC는 FAIL이다.
- And 이 AC는 로컬 대체를 허용하지 않는다 — 로컬(`localhost`)에 대한 검증 결과는 이
  AC의 PASS 조건을 충족시키지 않는다(정의상 "실제 배포된 도메인"이 요구되기 때문).

## AC Group E — 동시성 실측 (REQ-PILOT-READY-006)

**AC-PILOT-READY-006**
- Given 배포된(또는 가장 근접한 가용) 환경, **서로 다른 사용자 계정** N개(3~5)
- When 그 N개의 서로 다른 사용자 계정으로 각각 `POST /api/cases` 요청을 동시에
  (simultaneous) 발생시키면
- Then `.moai/reports/pilot-ready-concurrency-measurement-*.md` 리포트가 존재하고, 각
  요청의 관측된 결과(성공/실패/지연/오류 메시지)가 개별적으로 기록되어 있다.
- And 그 리포트 안에 "큐/락/Redis를 도입해야 한다" 또는 "도입할 필요 없다"는 결론성
  판단 문장이 없다 — 관측 사실만 기록되어 있다(§D Risk 1 스코프 준수 확인). 이 제약은
  인프라 도입 여부라는 후속 SPEC 결정 범위에 한정되며, 이 리포트를 읽고 파일럿 진행
  여부를 판단하는 것 자체를 막지 않는다.
- And 이 AC는 서로 다른 사용자의 일반 동시 부하만 검증하며, REQ-PILOT-READY-007
  (동일 사용자당 동시 1개 제한)을 검증하지 않는다 — 동일 사용자 시나리오는
  AC-PILOT-READY-015가 별도로 담당한다. 로컬 대체는 그 사실과 한계를 리포트에
  명시하는 조건으로 허용되나, 참고 증거로만 취급된다.

## AC Group F — 최소 서버측 재제출 가드 (REQ-PILOT-READY-007)

**AC-PILOT-READY-007**
- Given `lib/cases/create-case.ts`의 `createCase` 함수, `runPipeline`이 즉시 resolve하지
  않도록 mock(pending Promise)된 상태
- When 동일한 `ownerUserId`로 `createCase`를 두 번째로 호출(첫 번째 호출이 아직
  진행 중인 동안)하면
- Then `runPipeline`은 정확히 1회만 호출되고, 두 번째 호출의 반환값은 첫 번째 호출의
  성공 응답과 구분되는("이미 처리 중") 값이다.
- And (실패 후 재시도 허용) given 첫 번째 호출의 mock된 `runPipeline`이 reject하도록
  설정된 상태에서, when 그 실패 이후 동일 `ownerUserId`로 다시 `createCase`를 호출하면,
  then `runPipeline`이 다시 호출된다 — 가드가 실패 시 해제되어 영구히 재시도를 막지
  않는다.
- And (성공 후 정상 완료) given 첫 번째 호출의 mock된 `runPipeline`이 성공적으로
  resolve된 상태에서, when 해당 `cases` 행을 DB에서 직접 조회하면, then 그 행의
  `status`는 `"completed"`이고 `"processing"`으로 영구히 남아있지 않는다.

**AC-PILOT-READY-015** (동일 사용자 진성 경쟁 조건 — REQ-PILOT-READY-007)
- Given `lib/cases/create-case.ts`의 재제출 가드 구현(§A 결정 1에서 채택된 옵션 A 또는
  B), 동일한 `ownerUserId`
- When 두 `createCase` 호출을 **첫 번째 읽기/확인 시점부터 가능한 한 동시에**(둘 중
  하나가 먼저 완료된 뒤 두 번째가 시작되는 것이 아니라) 발생시키면 — 옵션 A가
  채택된 경우 실제 DB(또는 `UNIQUE` 제약을 실제로 강제하는 동등한 대상)에 대해 두
  `INSERT`를 동시에 실행하고, 옵션 B가 채택된 경우 가드 내부의 읽기/쓰기 순서를 mock
  으로 제어해 두 호출이 서로의 쓰기를 보기 전에 각자의 확인 단계에 도달하도록 강제하면
- Then `runPipeline`(또는 옵션 A의 예약 INSERT 성공)은 정확히 1회만 발생하고, 다른
  한쪽은 "이미 처리 중" 응답을 받는다.
- And 이 AC는 AC-PILOT-READY-007과 다른 것을 검증한다 — AC-PILOT-READY-007은 "첫 번째
  호출이 아직 진행 중인 동안 두 번째 호출이 도착"하는 시나리오(더 약한 순차적 경쟁)를,
  이 AC는 "두 호출이 첫 읽기 시점부터 동시에 경쟁"하는 시나리오(진성 경쟁 조건)를
  검증한다. 옵션 B(SELECT-후-INSERT)가 채택된 경우 이 AC가 FAIL하는 것은 예상된
  결과이며(REQ-PILOT-READY-007이 옵션 B의 한계로 이미 명시), 그 FAIL 자체와 그 한계가
  리포트(`.moai/reports/pilot-ready-idempotency-scope-*.md`)에 정직하게 기록되어 있으면
  이 SPEC의 완료 조건을 충족한다 — 옵션 B 채택 시 이 AC는 "경쟁 구간이 실제로 존재함을
  보여주는" 특성화(characterization) 테스트로 재해석된다.

## AC Group G — 최소 구조적 로깅 (REQ-PILOT-READY-008)

**AC-PILOT-READY-008**
- Given `console`에 대한 spy(`vi.spyOn`)가 설정된 테스트 환경
- When `POST /api/cases` 요청이 처리되면(성공 경로)
- Then 요청 시작을 나타내는 최소 1회 이상의 구조적 로그 호출이 관측된다.
- And (파이프라인 실패 로그) given 파이프라인 단계가 mock을 통해 실패하도록 설정된
  상태에서, when 그 요청이 처리되면, then 실패한 단계를 식별할 수 있는 최소 1회 이상의
  오류 로그 호출이 관측된다.
- And (DB 쓰기 실패 로그) given `cases` 또는 `reports` 테이블 INSERT/UPDATE가 mock을
  통해 실패하도록 설정된 상태에서, when 그 요청이 처리되면, then 그 DB 쓰기 실패를
  식별할 수 있는 최소 1회 이상의 오류 로그 호출이 관측된다 — 파이프라인 단계 실패
  로그와는 구분되는 별도 검증이다.
- And 관측된 어떤 로그 호출의 인자에도 `incidentDescription`/`diagnosisName`/
  `disabilityBodyPart`의 원문 값이 포함되어 있지 않다(PII 최소화 확인) — 위 3가지
  로그 시나리오(요청 시작, 파이프라인 실패, DB 쓰기 실패) 전부에 대해 이 확인을
  수행한다.

## AC Group H — 최소 장애 대응 런북 (REQ-PILOT-READY-009)

**AC-PILOT-READY-009**
- Given `.moai/docs/pilot-incident-runbook.md`(신규 문서)
- When 그 문서를 확인하면
- Then (a) M2 로그 확인 위치/방법, (b) 테스터 재시도 안내 방법, (c) triage 최종 담당자,
  3가지 항목이 모두 별도 섹션 또는 문단으로 명시적으로 존재한다.
- And `.moai/docs/runtime-runbook.md`(기존 로컬 개발 런북)의 내용과 혼동되지 않도록
  별개의 파일 또는 명확히 구분된 섹션이다.

## AC Group I — 실 Gemini 스모크 재검증 (REQ-PILOT-READY-010)

**AC-PILOT-READY-010**
- Given 이 SPEC의 run-phase 시점 main HEAD(또는 그 이후 커밋)
- When `.moai/reports/gemini-runtime-smoke-20260828.md`와 동일한 관측 방법론(네트워크
  레벨 fetch 관측기, 코드 임시 수정 없음)으로 스모크를 재실행하면
- Then 새 날짜의 `.moai/reports/gemini-runtime-smoke-*.md` 리포트가 생성되고, 다음
  5가지가 각각 개별적으로 확인·기록되어 있다: (a) Researcher/Skeptic/Verifier 3단계
  각각의 실제 Gemini 호출 성공 여부, (b) `POST /api/cases`의 최종 HTTP 상태가 `201
  Created`인지, (c) 응답 결과가 실제로 `reports` 테이블에 영속화됐는지, (d) 그 DB
  행을 별도 조회로 재확인했을 때 응답 값과 일치하는지, (e) 관측된 실제 Gemini 호출
  횟수가 기대 호출 횟수(3회, 또는 재시도가 있었다면 그 실제 횟수)와 일치하는지. 5가지
  중 하나라도 리포트에서 확인할 수 없으면 이 AC는 FAIL이다.
- And 기존 `gemini-smoke-20260827.md`/`gemini-runtime-smoke-20260828.md` 파일은
  덮어써지지 않고 그대로 보존된다.

## AC Group K — 재제출 가드의 보장 범위 및 실패 모드 문서화 (REQ-PILOT-READY-015)

**AC-PILOT-READY-016**
- Given `.moai/reports/pilot-ready-idempotency-scope-*.md` 리포트
- When 그 리포트를 확인하면
- Then §A 결정 1에서 실제로 채택된 옵션(A 또는 B)이 명시되어 있고,
  REQ-PILOT-READY-015(a)~(d) 4개 실패 모드(크래시/강제종료 복구, 완료+리포트 저장
  원자성, 응답 유실 후 재제출, 지연 도착 결과 충돌) 각각에 대해 "해결됨(구체적
  메커니즘 설명 포함)" 또는 "이 파일럿 규모에서 의도적으로 다루지 않는 gap"임이
  4가지 모두 개별적으로 명시되어 있다.
- And 리포트 어디에도 "재시도는 무제한으로 해도 항상 중복 실행을 막는다"는 식의,
  실제로 검증되지 않은 보장을 진술하는 문장이 없다.

## AC Group J — 데이터 취급 고지 정직성 (REQ-PILOT-READY-011 ~ REQ-PILOT-READY-014)

**AC-PILOT-READY-011**
- Given M3에서 수정된 `app/cases/new/page.tsx`(또는 그에 준하는 온보딩 위치)의 렌더링된 DOM
- When 그 페이지를 렌더링하면
- Then 텍스트 콘텐츠 어디에도 "보장", "확실히 차단", "완전히 비식별화"와 같이 스키마가
  완전한 비식별화를 보장한다고 주장하거나 암시하는 표현이 없다.

**AC-PILOT-READY-012**
- Given 동일 렌더링된 DOM
- When 개인정보 안내 영역을 확인하면
- Then (a) 스키마가 실제로 차단하는 것(주민등록번호/전화번호 형식, 주소/의료기록 원본
  필드 부재)에 대한 설명과, (b) 3개 자유 텍스트 필드는 스캔되지 않는다는 한계 설명과,
  (c) "합성이거나 이미 비식별화된 사례만 입력하라"는 테스터 책임 문장이, 세 가지 모두
  DOM에 개별적으로 식별 가능한 텍스트로 존재한다.

**AC-PILOT-READY-013**
- Given M3에서 수정된 `app/login/login-form.tsx`의 렌더링된 DOM
- When 데이터 취급 문의 관련 링크(또는 텍스트)를 확인하면
- Then `aria-disabled="true"`가 아닌, 실제로 클릭 가능한(`href` 속성이 `mailto:` 또는
  유효한 URL을 가리키는) 연락 채널 요소가 존재한다.

**AC-PILOT-READY-014**
- Given M3에서 수정된 사건 입력 화면(또는 그에 준하는 온보딩 위치)의 렌더링된 DOM
- When 그 페이지를 렌더링하면
- Then 올바르게 비식별화된 synthetic 사건 입력 예시(4개 필드 각각의 구체적인 예시 값)가
  최소 1건 텍스트로 존재한다.
