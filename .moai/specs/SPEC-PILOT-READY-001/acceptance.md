# SPEC-PILOT-READY-001 — Acceptance Criteria

Given-When-Then scenarios, grouped by REQ family. Each criterion is binary-testable
(PASS/FAIL against an observable command output, DB row, rendered element, or the
existence + stated content of a report file) per the verification-layer contract —
GEARS requirement wording lives in `spec.md` §2; this file never restates a
requirement as a scenario.

## AC Group A — 배포 대상 tier 결정 및 호스팅 실행 시간 정합성 확인 (REQ-PILOT-READY-001, REQ-PILOT-READY-002)

**AC-PILOT-READY-001** (v0.11.0 재작성 — Netlify 3층위 증거 기준. 이전 버전의
Vercel Hobby/Pro tier 문구는 HISTORICAL이다)
- Given `.moai/reports/pilot-ready-deployment-tier-decision-*.md` 리포트 **또는**
  `.moai/reports/pilot-ready-netlify-suitability-spike-*.md`(3층위 증거를 이미
  담고 있는 기존 스파이크 리포트 — 전용 파일명이 아직 없다는 이유만으로 이 AC를
  FAIL 처리하지 않는다, v0.11.0)
- When Netlify 동기 함수 실행 시간 상한에 대한 기록 내용을 확인하면
- Then 3개 증거 층위 — (a) 공식 게시 값(60초, 변경 불가,
  `docs.netlify.com/build/functions/configuration/#default-values` 인용 포함),
  (b) 상충하는 커뮤니티 관측(~10초, 출처 URL 및 "Netlify 직원의 공식 확인 없음"이
  함께 명시됨), (c) 이 프로젝트 계정에 실제 적용되는 상한(실 배포 전까지
  UNVERIFIED) — 이 각각 구분되어 기록되어 있다.
- And 세 층위 중 어느 것도 다른 층위의 값으로 대체되거나 혼동되어 기록되지 않았다
  — 예를 들어 (b)의 관측치를 (c)의 확정값처럼 서술하면 FAIL이다.
- And 이 AC는 3층위 기록의 완전성·구분 여부만 판정하며, (c)가 UNVERIFIED로
  남아 있는 것 자체를 FAIL로 판정하지 않는다.

**AC-PILOT-READY-002** (v0.10.0 재작성 — Netlify 배포 도메인 기준)
- Given AC-PILOT-READY-001의 3층위 기록, 배포된 Netlify 환경(또는 가장 근접한 가용
  환경)
- When `POST /api/cases`에 대해 실제 요청을 **최소 3회 이상**(v0.5.0 정밀화) 개별
  실행하면
- Then `.moai/reports/pilot-ready-timeout-measurement-*.md` 리포트가 존재하고, 각
  실행의 실측 처리 시간(초 단위 구체적 수치)이 개별적으로 기록되어 있으며,
  AC-PILOT-READY-001(c)에서 그 시점에 실제로 확인된 상한과의 비교 결론(상한
  이내/초과, 또는 (c)가 여전히 UNVERIFIED라 비교 불가함)이 명시적으로 기록되어
  있다. 실행 횟수가 3회 미만이면 이 AC는 FAIL이다.
- And 가장 근접한 가용 환경(로컬 대체 포함)으로 대체했다면, 그 사실과 한계가
  리포트에 명시되어 있다 — 로컬 대체 실측값은 참고 증거로만 취급되며, "배포된
  환경에서 실측했다"고 리포트에 오기재해서는 안 된다.
- And 이 AC는 "측정이 정확히 수행·기록되었는가"만 판정한다 — 측정된 처리 시간이
  상한을 초과하거나 미달하는 것 자체는 이 AC의 PASS/FAIL을 바꾸지 않는다(spec.md §
  측정 완료 vs. 파일럿 진행 여부 판단 구분 참고).

## AC Group B — Gemini 쿼터 사전 점검 (REQ-PILOT-READY-003)

**AC-PILOT-READY-003** (v0.5.0 격상 — 체크리스트 문서화에서 실제 실행 검증으로)
- Given `.moai/reports/pilot-ready-quota-checklist-*.md`(또는 런북 통합 섹션) 리포트
- When 그 리포트를 확인하면
- Then 실제 AI Studio 쿼터 대시보드를 확인한 기록(확인 날짜, 확인한 사람, 관측된
  실제 쿼터/레이트리밋 한도)과, 그 근거로 실제 선택한
  `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET` 두 값이 모두 리포트에
  명시적으로 기록되어 있다.
- And 이 확인이 수행되지 않았거나 위 항목이 리포트에 기록되지 않았다면 이 AC는
  FAIL이다 — "파일럿 런칭 담당자가 나중에 확인할 절차"로만 문서화된 상태(운영
  체크리스트 문구만 존재하고 실제 확인 기록이 없는 상태)는 더 이상 이 AC를 충족하지
  않는다.
- And RPM budget 값이 확인 후에도 코드 기본값 4로 유지되는 것 자체는 이 AC를
  FAIL시키지 않는다 — 4가 실제로 관측된 한도의 약 70~80%에 해당한다는 근거가 함께
  기록되어 있으면 정상적으로 PASS한다. 대시보드 확인 없이 기본값 4만 남아 있는
  상태(근거 기록 없음)만이 FAIL이다.
- And 이 AC는 코드 diff에 `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`의
  기본값 변경 자체를 요구하지 않는다 — 요구되는 것은 실제 확인·기록 행위다.

## AC Group C — 원격 DB 마이그레이션/시드 실행 검증 (REQ-PILOT-READY-004)

**AC-PILOT-READY-004**
- Given 실제 원격 Turso 인스턴스(`libsql://` 또는 `https://` 스킴) 접속 정보
- When `pnpm db:migrate` → `pnpm db:seed` → `pnpm tester:add`를 그 원격 인스턴스에 대해 실제로 실행하면
- Then `.moai/reports/pilot-ready-remote-db-verification-*.md` 리포트가 존재하고,
  각 명령의 실행 결과(성공/실패, 관측된 오류 메시지가 있다면 그 내용)가 기록되어 있다.
- And 이 AC는 로컬 대체를 허용하지 않는다 — 로컬 `file:` DB에 대한 실행 결과는 이
  AC의 PASS 조건을 충족시키지 않는다(정의상 "원격" 인스턴스가 요구되기 때문).
  M1의 신규 `reservations`(리스) 테이블 마이그레이션은 항상 존재하므로, 이 실행
  대상에 반드시 포함되어야 한다.

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
  성공 응답과 구분되는("이미 처리 중", `409 Conflict`) 값이다.
- And (실패 후 재시도 허용) given 첫 번째 호출의 mock된 `runPipeline`이 reject하도록
  설정된 상태에서, when 그 실패 이후 동일 `ownerUserId`로 다시 `createCase`를 호출하면,
  then `runPipeline`이 다시 호출된다 — 가드가 실패 시 해제되어 영구히 재시도를 막지
  않는다.
- And (성공 후 정상 완료) given 첫 번째 호출의 mock된 `runPipeline`이 성공적으로
  resolve된 상태에서, when 해당 `cases` 행을 DB에서 직접 조회하면, then 그 행의
  `status`는 `"completed"`이고 `"processing"`으로 영구히 남아있지 않는다.
- And (**완료 기록의 트랜잭션 원자성 — REQ-PILOT-READY-007(3), v0.4.0 강화**) given
  `reports` 테이블 INSERT가 mock을 통해 실패하도록 설정된 상태에서, when 파이프라인이
  성공적으로 완료되어 단일 완료 기록 트랜잭션(리스 소유권 재확인 + `cases` INSERT +
  `reports` INSERT + `reservations` DELETE)이 실행되면, then 그 트랜잭션이 롤백된
  **직후** 시점에는 `cases` 행이 전혀 존재하지 않고(부분 커밋 없음), `reports` 행도
  존재하지 않으며, `reservations` 리스 행은 트랜잭션 시도 이전과 동일하게(트랜잭션에
  포함됐던 삭제도 함께 롤백되므로) 여전히 존재한다 — **트랜잭션 롤백 직후 DB 상태가
  이 트랜잭션이 아예 시도되지 않았던 것과 정확히 동일함**을 세 테이블 모두에 대한
  직접 조회로 확인한다(부분 성공/부분 롤백 상태는 FAIL). 이 리스 행의 최종 처리는
  아래 별도 사후 해제 시나리오(v0.5.0 신규)가 이어서 검증한다.
- And (**트랜잭션 실패 후 리스의 후속 명시적 해제 — REQ-PILOT-READY-007(3-보충),
  v0.5.0 신규**) 위 시나리오에 이어서, when 그 트랜잭션 실패를 처리하는 catch 경로가
  실행되면, then 별도의 펜싱된 `DELETE`(자신의 `ownerUserId` AND `leaseId` 일치
  조건)로 `reservations` 리스 행이 실제로 삭제되고, 이어서 동일한 `ownerUserId`로
  즉시 새 `createCase` 요청을 보내면 그 요청은 새 `leaseId`로 리스를 성공적으로
  재획득하고 `runPipeline`이 정상적으로 호출된다 — 인위적인 추가 대기 없이 즉시
  재제출이 가능함을 확인한다. 이 후속 해제는 위 4단계 트랜잭션 자체의 일부가
  아니며(트랜잭션이 이미 실패해 롤백된 이후에만 실행되는 별개의 단계), 트랜잭션
  원자성 요구사항을 완화하지 않는다.
- And (**리스 재획득(reacquisition) 클린 성공 — REQ-PILOT-READY-007(3), v0.4.0 신규**)
  given 첫 번째 `createCase` 호출이 위 완료 기록 트랜잭션(리스 소유권 재확인 + `cases`
  INSERT + `reports` INSERT + `reservations` DELETE)을 정상적으로 성공시킨 직후,
  when 동일한 `ownerUserId`로 두 번째 `createCase` 요청을 즉시 보내면, then 그 요청은
  새 `leaseId`로 리스를 깨끗이 재획득하고 `runPipeline`이 정상적으로 호출된다 — 첫
  번째 실행이 남긴 어떤 잔여 상태(고아 `reservations` 행, 잠긴 상태 등)도 다음
  사용자의 요청을 막지 않음을 확인한다.
- And (**현실적 worst-case 지속 시간 동안의 가드 유지 — REQ-PILOT-READY-007(1), v0.4.0
  신규**) given `runPipeline`이 즉시 resolve하지 않고 새 TTL(최소 330초) 여유 안의
  현실적인 worst-case 지속 시간(예: 200초 이상) 동안 계속 pending 상태로 남도록 mock된
  상태에서, when 그 지속 시간 내내 동일 `ownerUserId`로 반복적으로 `createCase`를
  호출하면, then 모든 반복 호출에서 `runPipeline`은 여전히 1회만 호출된 상태를 유지하고
  각 반복 호출은 "이미 처리 중" 응답을 받는다 — 이 AC는 30초 happy-path 지속 시간이
  아니라 TTL 여유 안의 더 긴 현실적 지속 시간 동안에도 가드가 계속 유효함을 검증하며,
  AC-PILOT-READY-007의 다른 크래시/재획득 시나리오(TTL을 실제로 지난 경우)와는
  구분된다. **테스트 방법론(명시, v0.5.0 신규)**: 이 시나리오는 실제로 200초 이상
  기다리는(real wall-clock sleep) 방식으로 구현하지 않는다 — fake timer/mock
  clock(테스트 프레임워크의 시간 조작 유틸리티, 또는 리스 만료 판정 로직이 읽는
  "현재 시각" 값을 mock)으로 "200초 이상 경과했다"는 상태를 시뮬레이션하고,
  `runPipeline`은 그 시뮬레이션된 시간 동안 단지 즉시 resolve하지 않는 pending
  Promise로만 유지하면 충분하다 — 실제 테스트 실행 시간이 200초 이상 걸려서는
  안 된다.
- And (**크래시 후 TTL 만료·재획득 — REQ-PILOT-READY-007(1)**) given 첫 번째 `createCase`
  호출이 리스를 획득한 뒤 정상 종료도 실패도 하지 않고 그대로 멈춘 상태(크래시 시뮬레이션
  — 해제 로직이 실행되지 않음)에서, when 그 리스의 `expiresAt`을 지난 시각(mock 시계
  또는 과거 `expiresAt` 값을 직접 주입)에 동일 `ownerUserId`로 새 `createCase` 요청을
  보내면, then 그 요청은 새 `leaseId`로 리스를 성공적으로 재획득하고 `runPipeline`을
  실행한다 — TTL 경과 전에는 동일한 요청이 "이미 처리 중"으로 거부됨을 대조 확인한다.
- And (**지연 도착 결과의 펜싱 — REQ-PILOT-READY-007(2)/(3)**) given 위 크래시 시나리오에서
  새 리스가 재획득되어 두 번째 `createCase`가 진행 중인 상태에서, when 원래(만료된)
  첫 번째 호출이 뒤늦게 자신의 (이제 낡은) `leaseId`로 리스 해제 또는 완료 기록 커밋을
  시도하면, then 그 해제/커밋 시도는 0행에 매치되어 no-op으로 거부되고, 두 번째(현재)
  리스 행과 그 실행의 최종 상태는 첫 번째 호출의 시도로 인해 변경되거나 삭제되지 않는다
  — DB를 직접 조회해 현재 리스 행의 `leaseId`가 두 번째 호출의 것과 일치함을 확인한다.
- And (**Background Function 비동기 변형 — REQ-PILOT-READY-007(4), v0.15.0 신규 —
  실제 원격 Turso + Deploy Preview 대상 실측 완료**) 위 (1)-(3)의 시나리오를
  `startCaseJob()`/`processCaseJob()` 경로에 대해 실제 배포 도메인과 실제 원격
  Turso를 대상으로 재현했다: (a) 동일 사용자 두 `POST /api/cases`를 동시 발생시키면
  정확히 하나만 `202`, 나머지는 `409`; (b) 동일 jobId로 Background Function 엔드포인트를
  동시에 두 번 호출해도 `gemini_request_observations` 관측 행 수가 파이프라인 1회분과
  정확히 일치(중복 실행 없음); (c) 진행 중인 리스의 `expiresAt`을 원격 DB에서 직접
  과거로 되돌리면 동일 사용자의 새 제출이 즉시 `202`로 재획득에 성공하고, 원래(만료된)
  job은 뒤늦게 완료를 시도해도 `failed`로 남으며 `cases`/`reports` 행을 생성하지
  않는다(지연 완료 fencing) — 근거: `.moai/specs/SPEC-PILOT-READY-001/progress.md`
  §AA(2026-09-14 원격 실측, PR #10 HEAD `3f0859b` 이후 커밋 기준).
- And (**동등 검증 방법 인정 — 실제 프로세스 강제 종료의 대체, v0.16.0 신규**) readiness
  항목 (7)의 "Netlify Background Function 강제 종료 후 상태 지속" 시나리오를 검증할 때,
  실제 배포된 Deploy Preview(`*.netlify.app`)와 실제 원격 프로덕션 Turso에 synthetic-ID로
  태그된 행을 직접 써서 "리스는 만료됐지만 job은 아직 처리 중으로 남아 있는" 상태를
  재현하고, 그 상태에서 실제 `/api/cases/status` 응답과 원격 DB 재조회로 `recoverStaleCaseJob()`/
  완료 트랜잭션 펜싱이 정확하게 동작함을 확인하는 방법은, 실제로 Netlify 프로세스를
  라이브로 강제 종료(kill)하는 것과 **동등하게 인정되는 검증 방법**이다 — 실제 프로세스
  강제 종료 그 자체는 이 AC를 만족시키기 위한 필수 행위가 아니다. 검증 후에는 synthetic
  행이 모두 정리되어(0건) 프로덕션에 잔존하지 않았음이 함께 기록되어 있어야 한다.

**AC-PILOT-READY-015** (동일 사용자 진성 경쟁 조건 — REQ-PILOT-READY-007)
- Given `lib/cases/create-case.ts`의 리스(lease) 기반 재제출 가드 구현(REQ-PILOT-READY-007
  — 옵션 A/B의 선택 여지는 없다), 동일한 `ownerUserId`
- When 두 `createCase` 호출을 **첫 번째 읽기/확인 시점부터 가능한 한 동시에**(둘 중
  하나가 먼저 완료된 뒤 두 번째가 시작되는 것이 아니라) 발생시키면 — 실제 DB(또는
  `UNIQUE` 제약을 실제로 강제하는 동등한 대상)에 대해 두 조건부 UPSERT를 동시에
  실행하면
- Then `runPipeline`(리스 획득 성공)은 **정확히 1회만** 발생하고, 다른 한쪽은 "이미
  처리 중" 응답을 받는다. **PASS 판정 기준은 단일하며 예외를 허용하지 않는다** — 두
  번째 실행이 일시적으로라도(나중에 실패하거나 중단되더라도) 시작되면 그 자체로 FAIL이다.
  이 AC를 PASS로 만족시키는 구현 경로는 오직 하나(REQ-PILOT-READY-007의 리스 기반
  구현)이며, "다른 구현을 택했다면 이 AC가 FAIL하는 것도 허용된 결과"라는 식의 예외나
  특성화(characterization) 테스트로의 재해석은 존재하지 않는다.
- And 이 AC는 AC-PILOT-READY-007과 다른 것을 검증한다 — AC-PILOT-READY-007은 "첫 번째
  호출이 아직 진행 중인 동안 두 번째 호출이 도착"하는 시나리오(더 약한 순차적 경쟁)를,
  이 AC는 "두 호출이 첫 읽기 시점부터 동시에 경쟁"하는 시나리오(진성 경쟁 조건)를
  검증한다.

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
  각각의 실제 Gemini 호출 성공 여부, (b) `POST /api/cases`가 `202 Accepted`와 jobId를
  반환하고 최종 상태 조회가 완료된 사건의 `caseId`를 제공하는지, (c) 응답 결과가 실제로 `reports` 테이블에 영속화됐는지, (d) 그 DB
  행을 별도 조회로 재확인했을 때 응답 값과 일치하는지, (e) 관측된 실제 Gemini 호출
  횟수가 그 사건의 라우팅 경로가 요구하는 기대 호출 횟수와 일치하는지(v0.15.0 정정
  — 하이브리드 라우팅 도입 이후 고정 3회가 아니다: 일반/복합-직행 경로는 3회, Lite→Premium
  승격 경로는 최대 6회 — 리포트는 실행한 경로와 그 경로의 기대 횟수를 함께 명시한다).
  5가지 중 하나라도 리포트에서 확인할 수 없으면 이 AC는 FAIL이다.
- And 기존 `gemini-smoke-20260827.md`/`gemini-runtime-smoke-20260828.md` 파일은
  덮어써지지 않고 그대로 보존된다.

## AC Group K — 재제출 가드의 보장 범위 재판정 + 최종 파일럿 준비 상태 판정 (REQ-PILOT-READY-015, REQ-PILOT-READY-016)

**AC-PILOT-READY-016a** (REQ-PILOT-READY-015 — 재제출 가드 보장 범위 재판정)
- Given `.moai/reports/pilot-ready-idempotency-scope-*.md` 리포트
- When 그 리포트를 확인하면
- Then REQ-PILOT-READY-007의 리스(lease) 기반 구현이 명시되어 있고(더 이상 옵션 선택을
  기록하지 않는다 — 리스 구현은 확정 경로이므로), REQ-PILOT-READY-015(a)~(d) 4개 실패
  모드(크래시/강제종료 복구, 완료+리포트 저장 원자성, 응답 유실 후 재제출, 지연 도착
  결과 충돌) 각각에 대해 "해결됨(구체적 메커니즘 설명 포함 — (a)는 TTL 재획득, (b)는
  동일 트랜잭션, (d)는 leaseId 펜싱)" 또는 "이 파일럿 규모에서 의도적으로 다루지 않는
  gap((c)는 반드시 이 상태로 기록)"임이 4가지 모두 개별적으로 명시되어 있다.
- And 리포트 어디에도 "재시도는 무제한으로 해도 항상 중복 실행을 막는다"는 식의,
  실제로 검증되지 않은 보장을 진술하는 문장이 없으며, "idempotency 가드"라는 부정확한
  명칭 대신 "사용자별 동시 실행 가드"가 일관되게 사용된다.

**AC-PILOT-READY-016b** (REQ-PILOT-READY-016 — 최종 파일럿 준비 상태 판정, v0.4.0 — 6개→7개 항목)
- Given `.moai/reports/pilot-ready-readiness-decision-*.md` 리포트
- When 그 리포트를 확인하면
- Then **7개 항목** — (1) 호스팅 적합성, (2) Gemini 쿼터(호스팅과 별개의 독립 항목),
  (3) 원격 DB, (4) 실 도메인 인증, (5) 실 Gemini 스모크, (6) 서로 다른 사용자 동시
  부하, (7) 저장소/복구 검증 — 각각이 READY / BLOCKED / UNVERIFIED 중 하나로
  개별적으로 판정되어 있다.
- And (**항목 1 — 호스팅 적합성, v0.10.0 재작성 — Netlify 기준, 특정 초 값을 미리
  확정하지 않는다**) 항목 (1)이 READY로 표시되어 있다면, Netlify Free 호스팅 확정
  기록과, 실제 **배포 도메인**(`*.netlify.app`) 환경에서 수행된 **최소 3회 이상**의
  개별 측정 실행 각각의 처리 시간이 기록되어 있고, AC-PILOT-READY-001(c)에서 실제로
  확인된 상한에서 콜드스타트·네트워크 오버헤드를 흡수할 안전 여유를 뺀 값 이하로
  **관측된 최대 처리 시간**이 들어옴을 보여주는 실측 증거 둘 다가 리포트에 존재한다
  — 결정 기록만 있고 실측 증거가 없는 상태, 실측 횟수가 3회 미만인 상태, 관측된
  최대 처리 시간이 그 안전 여유 기준을 초과하는 상태, 로컬(`next start`) 실행
  결과만으로 이 항목을 READY로 표시한 상태, 또는 AC-PILOT-READY-001(c)의 실제 적용
  상한 자체가 UNVERIFIED인 채로 이 항목을 READY로 표시한 상태는 모두 FAIL이다.
- And (**항목 2 — Gemini 쿼터 독립 검증, v0.5.0 정정**) 항목 (2)가 READY로 표시되어
  있다면, 실제 AI Studio 쿼터 대시보드를 확인했다는 기록(확인 날짜·확인자 포함)과,
  그 관측된 실제 한도를 근거로 실제 선택한
  `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET` 값이 리포트에 기록되어 있다
  — **값이 코드 기본값 4와 같더라도, 4가 관측된 실제 한도의 약 70~80%에 해당한다는
  근거가 함께 기록되어 있으면 정상적으로 READY 조건을 충족한다**(이전 "실제로
  조정된 값이어야 한다"는 취지의 과도하게 엄격한 표현을 교정). 대시보드 확인 자체가
  수행되지 않은 채 기본값 4만 남아 있는 상태(근거 기록 없음)를 READY로 표시한
  리포트는 FAIL이다.
- And (**항목 6 — 동시 부하 READY 기준 정밀화**) 항목 (6)이 READY로 표시되어 있다면,
  측정 배치 안의 모든 요청이 성공적인 최종 상태에 도달했고, 그 결과가 실제로 DB에
  영속화되어 조회 가능했으며, 처리되지 않은(재시도/백오프로 흡수되지 않은) 429/5xx/
  타임아웃이 하나도 없었다는 근거가 리포트에 기록되어 있다.
- And (**항목 7 — 원격 대상 필수**) 항목 (7)이 READY로 표시되어 있다면, 그 근거가 된
  검증이 실제 원격 Turso 대상에 대해 수행됐다는 기록이 있다 — 로컬 또는 in-memory
  SQLite 결과만을 근거로 항목 (7)을 READY로 표시한 리포트는 FAIL이다.
- And 항목 (1)의 tier/ToS "결정" 자체(문서 판단으로 가능한 부분)를 제외하고, 원격
  검증 또는 실측이 필요한 항목들((1)의 타임아웃 실측 포함, 2~7) 중 하나라도 BLOCKED
  또는 UNVERIFIED이면 리포트의 전체 판정이 **NO-GO**로 명시되어 있다 — 원격 필수
  항목에 대한 "부분적으로 준비됨"류의 절충 판정은 FAIL이다.
- And 리포트 어디에도 로컬(`next start`) 실행 결과만으로 원격 필수 항목을 READY로
  판정한 기록이 없다(§ 로컬 대체 실행 증거의 위상 위반 확인).
- And 이 리포트는 "이 SPEC 자체의 구현 완료"와 "파일럿을 실제 외부 테스터에게 열어도
  되는가"가 서로 다른 판단임을 리포트 본문에서 명시적으로 구분한다.
- And (**run-phase 완료 시점 공정 검증 — v0.4.0 신규**) 이 AC가 run-phase 종료
  시점에 평가될 때, 리포트의 7개 항목 표는 하나도 빈칸(템플릿 placeholder) 없이 실제
  READY/BLOCKED/UNVERIFIED 판정값으로 채워져 있고, 리포트 본문에 전체 GO/NO-GO
  판정이 명시적으로 기록되어 있다 — 템플릿이 채워지지 않은 채로 남아 있으면(파일이
  존재한다는 사실만으로는) 이 AC는 FAIL이다. 채워 넣은 전체 판정이 **NO-GO**인
  것 자체는 이 AC를 FAIL시키지 않는다 — 이 AC는 "판정이 실제로 내려졌는가"만 검증하며,
  "그 판정이 GO인가"는 검증하지 않는다.

## AC Group J — 데이터 취급 고지 정직성 (REQ-PILOT-READY-011 ~ REQ-PILOT-READY-014)

**AC-PILOT-READY-011**
- Given M3에서 수정된 `app/cases/new/page.tsx`(또는 그에 준하는 온보딩 위치)의 렌더링된 DOM
- When 그 페이지를 렌더링하면
- Then 텍스트 콘텐츠 어디에도 "보장", "확실히 차단", "완전히 비식별화"와 같이 스키마가
  완전한 비식별화를 보장한다고 주장하거나 암시하는 표현이 없다.

**AC-PILOT-READY-012**
- Given 동일 렌더링된 DOM
- When 개인정보 안내 영역을 확인하면
- Then 다음 4가지가 모두 DOM에 개별적으로 식별 가능한 텍스트로 존재한다: (a) 주민등록번호·
  휴대전화번호 형식은 검사된다는 설명, (b) 주소·의료기록 원본 필드는 스키마에 애초에
  정의되어 있지 않다는 **구조적 사실**, (c) 그럼에도 3개 자유 텍스트 필드에 실명·주소·
  상세 정황 등 다른 식별정보를 타이핑해 넣는 것은 스키마가 탐지·차단하지 않는다는
  **잔여 위험**(즉 (b)의 구조적 사실과 (c)의 잔여 위험이 하나로 뭉개지지 않고 구분되어
  진술됨), (d) "합성이거나 이미 비식별화된 사례만 입력하라"는 테스터 책임 문장.

**AC-PILOT-READY-013** (v0.6.0 정정 — 외부 구현 검토 5차 반영)
- Given M3에서 수정된 `app/login/login-form.tsx`의 렌더링된 DOM
- When `SUPPORT_CONTACT_EMAIL` 환경변수(실제 지원 이메일)가 설정된 상태에서 데이터 취급
  문의 관련 링크를 확인하면
- Then `aria-disabled="true"`가 아닌, 그 실제 주소를 가리키는 `mailto:` 링크가 존재한다.
- And `SUPPORT_CONTACT_EMAIL`이 설정되지 않은 기본 상태(운영자가 아직 실제 주소를
  확정하지 않은 상태)에서 확인하면, 클릭 가능한 것처럼 보이는 가짜(placeholder) 링크를
  노출하지 않고 `aria-disabled="true"`(또는 이에 준하는 비활성 표시)로 미설정 상태를
  정직하게 드러낸다 — RFC 2606 예약 도메인(example.com) 등을 실재하는 채널처럼 클릭
  가능하게 보여주는 것은 금지된다.

**AC-PILOT-READY-014**
- Given M3에서 수정된 사건 입력 화면(또는 그에 준하는 온보딩 위치)의 렌더링된 DOM
- When 그 페이지를 렌더링하면
- Then 올바르게 비식별화된 synthetic 사건 입력 예시(4개 필드 각각의 구체적인 예시 값)가
  최소 1건 텍스트로 존재한다.
