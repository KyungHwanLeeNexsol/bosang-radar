# 파일럿 운영 개시 계획 (SPEC-PILOT-OPS-001)

> 이 문서는 파일럿을 실제로 개시하기 **직전** 참고하는 절차 문서다 — 계정 발급
> 절차 요약(§1), 프로덕션 단일 계정 스모크 체크리스트와 테넌트 격리 게이트
> (§2), 3단계 롤아웃과 성공지표 집계(§3), Gemini 쿼터 운영 계획(§4)을 담는다.
> 계정 발급 절차 자체의 SSOT는 `.moai/docs/account-provisioning.md`이고,
> 파일럿 운영 **중** 장애 대응 절차는 `.moai/docs/pilot-incident-runbook.md`다
> — 세 문서는 서로 다른 문서이며, 이 문서는 앞의 두 문서 내용을 복제하지
> 않고 참조만 한다. **이 문서 자체는 계획 문서이며, 어떤 절차도 이 문서
> 작성 시점에 실제로 실행되지 않았다** — 실 계정 발급·실 배포·실 Gemini
> 호출·실 스모크·실제 단계 착수 모두 SPEC-PILOT-OPS-001의 범위 밖이다.

## 1. 계정 발급 절차

최초 운영 계정 발급 대상은 운영자 본인 계정 `zuge3927@naver.com`이다 — 이
이메일은 `SPEC-PILOT-READY-001` spec.md HISTORY(2026-09-11, v0.8.0 항목)에서
장애 대응 triage 담당자(이경환, 1영업일 이내 1차 확인)와 함께 지원 연락처로
확정된 주소이며, 이 SPEC(SPEC-PILOT-OPS-001) spec.md REQ-PILOT-OPS-003·
AC-PILOT-OPS-003에서도 운영 계정 겸 문의 채널 주소로 재확인됐다 — 신규
이메일이 아니라 기존에 확정된 주소를 재사용한다. `.moai/docs/
pilot-incident-runbook.md` §3 자체는 그 확정 결과 중 triage 담당자와
1영업일 이내 1차 확인이라는 응대 목표만 기록하며, 이메일 주소 자체를 §3
본문에 별도로 기재하지는 않는다.

발급 절차 자체는 `.moai/docs/account-provisioning.md`를 그대로 따른다 —
이 문서는 그 절차를 대체하지 않고 참조만 한다.

- **발급 전 확인**: `account-provisioning.md` §2-1이 요구하는 대로,
  `TURSO_DATABASE_URL`이 실제 프로덕션 호스트를 가리키는지 먼저 확인한다
  (`file:` 프리픽스면 로컬 SQLite 파일이므로 프로덕션이 아니며, 예상 프로덕션
  Turso 호스트명과 다르면 즉시 중단한다). `TURSO_AUTH_TOKEN` 값은 로그·커밋
  메시지·대화창 어디에도 출력하지 않는다.
- **발급 절차**: `account-provisioning.md` 전문을 그대로 따른다 — 실
  프로덕션 환경변수로 `pnpm tester:add`를 1회 실행하며, 동일 이메일로
  재실행하면 조용한 무연산(no-op)이 되어 비밀번호가 재설정되지 않는다는
  제약도 그대로 적용된다.
- **발급 후 검증**: `account-provisioning.md` §5가 요구하는 대로, exit
  code 0만으로 발급 완료를 단정하지 않고 실제 프로덕션 로그인 화면에서
  발급한 이메일/비밀번호로 직접 로그인 성공을 확인해야 비로소 발급이
  의도한 대로 완료된 것으로 간주한다.
- **이 SPEC은 실 계정을 발급하지 않는다**: SPEC-PILOT-OPS-001의
  plan-phase·run-phase 모두 실제로 `pnpm tester:add`를 실행하지 않으며,
  실 계정을 생성하거나 원격 DB에 쓰지 않는다.

## 2. 프로덕션 스모크 체크리스트 + 테넌트 격리 게이트

### 2.1 단일 계정 E2E 스모크 체크리스트

운영자 계정(`zuge3927@naver.com`) **1개만으로** 수행하는 E2E 흐름 검증이다.
**이 체크리스트는 테넌트 격리를 검증하지 않는다** — 계정 1개로는 구조적으로
불가능하며, 테넌트 격리는 §2.3의 별도 게이트에서 검증한다.

**경로 사실**: 이 프로젝트의 실제 프로덕션 경로는 `app/api/cases/route.ts`
(`startCaseJob` 호출, `createCase`는 임포트하지 않음) →
`netlify/functions/process-case-background.ts` → `processCaseJob`으로
이어지는 **비동기** 경로다. `route.ts` 처리(Next.js API route 실행)와
`process-case-background.ts` 처리(Background Function 실행)는 **서로 다른
두 개의 Netlify function invocation**이며 각자 별도의 로그 스트림·
invocation ID를 가진다 — 하나의 연속된 로그가 아니므로, 아래 확인은 각
invocation의 로그 범위를 별도로 기록·판정한다(다만 두 invocation 모두
같은 전체 격리된 스모크 시간창(고유 스모크런 ID로 식별, 시작·종료
타임스탬프) 안에 있어야 한다는 전제는 유지한다).

**주의(대시보드 함수명 사전 확인 필요)**: `route.ts`라는 명칭은 소스 파일
경로 이름이며, Netlify 대시보드에 그 경로 이름 그대로 별도 함수 항목으로
표시된다고 단정하지 않는다 — Next.js API route는 실제 배포 시 소스 파일
경로와 다르게 번들링·명명될 수 있다. 따라서 스모크를 실제로 수행하기
**전에** 운영자가 실제 배포된 Netlify 대시보드에서 `POST /api/cases`를
처리하는 함수의 실제 표시 이름(display name)과 invocation ID를 먼저
확인·기록한 뒤에만 아래 (6-a) 확인에 사용한다(추정 명칭을 그대로 신뢰하지
않는다). `process-case-background`는 Background Function으로서 이미
파일명 자체가 진입점 이름이므로 별도 확인이 필요 없다.

1. 로그인 성공 및 세션 유지 확인
2. 사건 제출 시 `202` 응답 및 jobId 수신 확인
3. Background Function 처리 완료 후 사건 상태가 `completed`로 전이되는지
   확인
4. 생성된 사건(case)과 리포트(report)가 저장되고 재조회로 확인되는지 검증
5. 구조화 전문가 피드백 제출·저장 확인
6. **(6-a) ROUTE invocation 범위**(`app/api/cases/route.ts`) 안에서:
   `case_request_received` 이벤트가 존재함을 확인(**양성 증거**)하고, 같은
   ROUTE invocation 범위 안에서 `case_job_enqueue_failed`·
   `case_job_cancel_failed`·`case_job_create_lease_release_failed` 3개
   이벤트가 전혀 관측되지 않음을 확인(**음성 증거**)한다.
   **(6-b) BACKGROUND invocation 범위**(`netlify/functions/process-case-background.ts`)
   안에서: `pipeline_stage_failed`·`case_job_status_update_failed`·
   `case_job_failed_lease_release_failed`·`case_job_failed` 4개 이벤트가
   전혀 관측되지 않음을 확인(**음성 증거**)한다. 위 8개 이벤트는 모두
   jobId·caseId 필드를 전혀 포함하지 않으므로, 이 확인은 "동일 jobId/
   caseId 기준" 상관관계가 아니라 각 invocation의 격리된 **시간창**·
   **invocation 범위** 안에서의 이벤트 존재/부재로만 판정하며, 다른 동시
   활동 없이 격리된 시간창에서 수행한다.
   **주의(레거시 경로 구분)**: `pipeline_failed`·`completion_transaction_failed`·
   `post_failure_lease_release_failed`는 동기(sync) 레거시 함수
   `createCase` 전용 이벤트이며(테스트·e2e 스펙 파일에서만 참조되고 현재
   프로덕션 라우트에서는 호출되지 않음), 프로덕션 비동기 경로의 판정
   근거나 주요 실패 신호로 사용하지 않는다(역사적 맥락으로만 언급 가능).
7. (6-a)와 (6-b) 각 invocation 범위 확인을 모두 마쳐 7개 실패 이벤트
   (ROUTE 3개 + BACKGROUND 4개)가 어느 invocation에서도 전혀 관측되지
   않았음을 종합 확인(**음성 증거 종합**) — 이 중 하나라도 관측되면
   판정은 "주의사항 있는 PASS"가 아니라 **즉시 중단·트리아지**
   (`.moai/docs/pilot-incident-runbook.md`로 라우팅)이며 전체 스모크를
   중단한다.
8. 해당 사건에 대해 실제 Gemini 호출이 발생했고 결과가 반영됐는지 확인
   (하이브리드 라우팅에 따라 Lite·Premium 어느 쪽이 응답했는지는 무관).

### 2.2 스모크 데이터 정리(cleanup) 계약

(a) 매 스모크 실행마다 고유 **스모크런 ID**를 부여하고 그 실행이 건드린
    정확한 사용자·사건·job 식별자를 기록한다("최근 N개 행" 같은 모호한
    범위 지정은 금지한다).
(b) 정리 조사 범위는 `cases`/`reports`/`feedback`에 한정되지 않고
    `case_jobs`, `gemini_request_observations`, 그리고 그 식별자에 연결된
    `reservations`/리스 상태까지 포함한다.
(c) 삭제 전 행 소유권과 정확한 대상 행(기록된 식별자 기준)을 확인한다 —
    `created_at > X` 같은 넓은 WHERE 스윕은 절대 금지한다.
(d) FK/리스 관계를 지키는 안전한 의존성 순서로 삭제한 뒤, 그 식별자에
    연결된 행이 0개 남았는지 확인하는 절차 자체를 계약의 일부로 명시한다
    (생략 불가).
(e) 원격 DB 정리 작업은 `.moai/docs/pilot-incident-runbook.md` §4(한
    시점에 한 사람만, 시작 라벨·종료 결과 통보)를 그대로 따른다.
(f) 어떤 경우에도 실제 파일럿 데이터에 대한 광범위/일괄 삭제는 금지하며,
    정리 범위는 항상 스모크런 식별자에 한정한다(와일드카드 금지).
(g) 사건마다 `case_jobs.leaseId`(DB 컬럼 `lease_id`)를 정확히 기록한다
    (jobId만으로는 불충분하다).
(h) 정상 완료 후에는 같은 리스의 `reservations` 행이 더 이상 존재하지
    않아야 하며 이를 확인 절차로 명시한다 — 같은 리스가 "정상 완료"
    이후에도 여전히 존재한다면 이는 자동 PASS나 광범위/일괄 정리의
    근거가 아니라 (7)과 같은 등급의 **즉시 중단·트리아지** 대상이다.
(i) 삭제가 실제로 필요한 경우, `ownerUserId`와 `leaseId`가 모두 기록된
    값과 일치할 때만, 그리고 그 소유자에 대한 새 활성 job이 없을 때만
    삭제한다(`releaseLeaseFenced(db, ownerUserId, leaseId)`와 동일한
    펜싱 조건) — 그 행에서 기록된 값과 **다른 leaseId**가 발견되면
    (`reservations`는 `ownerUserId`를 기본키로 하므로, 다른 leaseId는
    반드시 같은 사용자의 더 새로운 유효 리스를 의미하며 다른 사람의
    동시 리스일 수는 구조적으로 없다) 어떤 경우에도 삭제하지 않는다.
(j) `gemini_request_observations` 행을 삭제하기 전에, 그 스모크 실행의
    실제 모델별(Lite/Premium) 요청 횟수를 운영 기록(스모크런 기록, 코드
    아님)에 먼저 남긴다 — 이 선기록은 §4(e)가 정의하는 일일 집계 절차에
    투입되는 여러 입력 중 하나로만 취급한다. `gemini_request_observations`
    의 이 행이 실제로 삭제되는지 여부는 일일 집계의 기준 출처를 콘솔
    로그에서 DB로 전환하지 않는다 — 삭제는 정리(cleanup) 행정 작업일
    뿐이며, 어느 출처가 권위 있는 기준 집계인지를 바꾸는 스위치가 아니다.
(k) 위 (j)의 선기록-보충 절차는 `gemini_request_observations`에 대한
    (d)의 0행 확인이 실제로 성공했을 때만 성립한다 — 그 스모크 실행의
    식별자에 연결된 행이 삭제 후에도 하나라도 남아 있으면, (h)와 동일한
    등급의 **즉시 중단·트리아지** 대상이며 결코 조용히 일일 집계에
    포함되지 않는다. 이 경우 해당 스모크 실행에 대해 (j)가 선기록한 호출
    수치는 이 상태가 해소될 때까지 "있는 그대로" 일일 집계에 사용하지
    않고 수동으로 **재조정(reconcile)**해야 한다.

### 2.3 테넌트 격리 확인 게이트

§3.1의 2단계 착수 **전** 반드시 통과해야 하는, §2.1의 단일 계정 스모크와는
별도의 게이트다. 최소 서로 다른 계정 **2개**(운영자 계정 + 첫 실제 외부
사용자 계정, 또는 아래 임시 계정 대안)로 수행한다.

1. **양성 대조군(positive control)**: 먼저 각 계정이 **자기 자신의**
   사건 목록·사건 상세에 정상 접근됨을 확인한다 — 이 확인 없이 (2)의
   음성 결과만으로는 접근 자체가 애초에 안 되는 것인지 격리가 되는
   것인지 구분할 수 없다.
2. **양방향 교차 계정 확인**: 다른 계정이 소유한 알려진 caseId로 사건
   상세 URL에 접근하면 `notFound()`가 반환되고(`app/cases/[caseId]/page.tsx:143-146`의
   `getCaseForOwner(caseId, session.user.id)`가 null을 반환해 Next.js
   404-동등 페이지로 전이), 다른 계정이 소유한 알려진 jobId로 상태
   API에 접근하면 `404` JSON이 반환됨을(`app/api/cases/status/route.ts:19,26`의
   `and(eq(caseJobs.id, jobId), eq(caseJobs.ownerUserId, session.user.id))`
   조건 조회) 각각 확인한다.
3. 계정 간 전환은 별도 브라우저 세션을 사용하거나, 같은 세션에서 전환할
   경우 반드시 완전한 로그아웃/재로그인을 거친다(세션 잔존으로 인한
   위양성/위음성 방지).
4. 입력하는 사건은 합성이거나 이미 비식별화된 사례만 사용한다.

두 경로 모두 명시한다:

- **기본 경로**: 첫 실제 외부 실무자 계정이 발급될 때까지 이 게이트를
  대기한다. 이 경로로 생성된 사건도 §3.2 성공지표 집계에서 명시적으로
  **제외**되고 §2.2와 동일한 기준으로 **정리** 대상이다.
- **임시 계정 대안 경로**: 대기하지 않고 임시(throwaway) 계정을 사용할
  경우, 아래 9단계 절차를 문서화한다. **이 절차 자체는 계획 문서이며,
  이 SPEC의 plan-phase·run-phase 어느 쪽도 실제로 이 절차를 실행해
  실 계정을 발급하거나 실 DB 행을 쓰거나 지우지 않는다.**
  1. 발급 착수 **전에** 고유한 스모크런 ID와 이번 임시 계정 전용의
     새 임시(throwaway) 이메일 주소를 먼저 정하고 기록한다.
  2. 발급 절차 자체는 `account-provisioning.md`의 기존 단계를 그대로
     따른다(이 절차를 여기서 복제하지 않고 참조만 한다) — §2-1이
     요구하는 대로 `TURSO_DATABASE_URL`이 실제 프로덕션 호스트를
     가리키는지 먼저 확인한 뒤, 실 프로덕션 환경변수로
     `pnpm tester:add`를 1회 실행하고, §5가 요구하는 대로 실제
     프로덕션 로그인 화면에서 로그인 성공을 확인한다.
  3. 발급이 실제로 완료되면, 그 결과로 생성된 정확한 `userId`와
     이메일을 기록한다.
  4. 검증(§2.3의 4단계 격리 확인 절차)이 끝난 뒤, **먼저** §2.2와
     동일한 기준으로 이 임시 계정이 생성한 사건 관련 데이터
     (`cases`/`reports`/`feedback`/`case_jobs`/
     `gemini_request_observations`/`reservations`)를 3번에서 기록한
     정확한 `userId`/이메일 기준으로 정리한다(§2.2와 동일하게
     와일드카드·날짜범위·"최근 N개" 지정은 금지).
  5. **그 다음** 임시 계정 자신의 `session`/`account`/`user` 행과,
     해당하는 `verification` 행, 그리고 해당하는 `allowed_testers`
     행을 3번에서 기록한 정확한 `userId`/이메일 기준으로 정리한다
     (`verification`은 `identifier` 컬럼, `allowed_testers`는
     `email` 컬럼이 각각 유일한 매칭 기준이며 둘 다 `userId` 컬럼이
     없다) — 정리를 마친 뒤 `session`/`account`/`user`/`verification`/
     `allowed_testers` **다섯** 테이블 모두에 그 식별자에 연결된
     행이 0개 남았는지 확인하는 절차를 명시적으로 거친다(생략 불가).
  6. `user`/`session`/`account`/`verification`/`allowed_testers`
     (Drizzle 스키마명 `allowedTesters`) 중 어느 것이 `user` 행 삭제로
     **자동(cascade) 삭제**되고 어느 것이 **별도 삭제가 필요한지**를
     구분한다 — `lib/db/schema.ts` 확인 결과, `session.userId`와
     `account.userId`는 각각 `user.id`를 참조하며
     `onDelete: "cascade"`로 선언돼 있어 `user` 행을 삭제하면 함께
     삭제된다. 반면 `verification`(`identifier` 문자열 컬럼으로만
     식별)과 `allowed_testers`(`email` 컬럼으로만 식별)는 `user`를
     외래키로 참조하지 **않으므로** `user` 행 삭제로 자동 삭제되지
     않으며, 5번의 정리 절차에서 이메일 일치 기준으로 반드시 별도
     삭제해야 한다.
  7. 절차 도중 다른 계정이나 예상치 못한 새로운 활동이 관측되면
     즉시 중단한다.
  8. 어떤 삭제 단계에서도 와일드카드·날짜 범위·"최근 N개" 지정 삭제는
     금지하며, 모든 삭제는 3번에서 기록한 정확한 식별자(userId 또는
     이메일)만을 대상으로 한다.
  9. 이 절차와 그 결과로 생성된 사건은 모두 §3.2 성공지표 집계에서
     명시적으로 **제외**된다.

## 3. 파일럿 운영 3단계 분리 + 성공지표 집계

### 3.1 단계 구성

- **1단계(운영자 단독)** — §2.1의 단일 계정 E2E 흐름 검증만 수행한다
  (테넌트 격리는 이 단계에서 검증하지 않는다).
- **테넌트 격리 게이트** — §2.3을 통과해야 2단계로 진행할 수 있다.
- **2단계(제한적 외부 검증)** — 외부 실무자 2~3명만 초대해 소수 사건으로
  제한 검증한다.
- **3단계(전체 파일럿)** — 나머지 실무자를 포함해 집계 가능한 실제
  실무자 **최소 10명**이 각자 **최소 3건**씩, 집계 가능한 완료 사이클
  **최소 30건**을 수행한다.

각 단계 전환 조건은 앞 단계의 절차를 모두 통과하는 것이며, 중단(abort)
기준은 §2.1의 (7)/(8)이 정의하는 즉시 중단·트리아지 사유가 발생하면 다음
단계 착수를 보류하는 것이다. 문의 채널은 `zuge3927@naver.com`
(`.moai/docs/pilot-incident-runbook.md` §3 이경환 담당, 1영업일 이내 1차
확인)이다. 참여자 초대 안내에는 SPEC-PILOT-LAUNCH-001이 확정한 "합성이거나
이미 비식별화된 사례만 입력해 주세요"라는 기존 문구를 그대로 재사용한다
(신규 문구 작성 금지).

### 3.2 성공지표 집계 계약

성공 기준은 "실제 실무자 최소 10명, 각자 최소 3건의 완료된(`completed`)
리서치 사이클 + 제출된 구조화 피드백"이다.

(a) 1단계 운영자 스모크 세션과 §2.3의 임시/검증 계정(임시 격리 확인
    계정 포함)은 이 집계에 절대 자동 포함되지 않는다.
(b) 2단계 참여자는 실무자 자격 기준을 충족하고 전체 사이클(제출→
    `completed`→피드백)을 완료한 경우에만 10명 목표에 집계된다 — 부분/
    미완료 사이클은 집계되지 않는다.
(c) 이중 집계를 금지한다 — 앞선 단계에서 이미 집계된 사용자나 사건은
    후속 단계에 참여하더라도 다시 집계하지 않는다.

### 3.3 읽기 전용 수동 집계 절차

신규 코드나 관리자 대시보드 구현은 여전히 Out of Scope다 — 아래는 사람이
직접 조회·기록하는 수작업 절차만 서술한다.

자격 확인이 끝난 실무자 명단을 기준으로, 각 사용자의 **서로 다른
(distinct)** 완료(`completed`) caseId를 조회하고 각 caseId마다 구조화
피드백이 실제로 존재하는지 확인하며, 같은 사건에 대한 여러 리포트/피드백
항목을 중복 집계하지 않는다. 운영자 스모크 사건, §2.3의 격리 게이트 사건
(임시 계정 경로와 실제 외부 계정 경로 둘 다), 그 밖의 임시/검증 계정은
모두 명시적으로 제외한다.

아래 표는 실무자별 **완료 사건 수**와 **피드백** 존재 여부를 함께
기록한다 — 이 표만으로 "실무자 최소 10명이 각자 최소 3건" 통과/실패
여부를 판정할 수 있어야 한다.

| `practitioner_id` | `completed_case_count`(완료 사건 수) | `feedback_present`(피드백 존재 여부) |
|---|---|---|
| (실무자 식별자) | (서로 다른 완료 caseId 개수) | (각 caseId별 구조화 피드백 존재 여부) |

## 4. Gemini 쿼터 운영 계획

**Where** Gemini `gemini-3.6-flash`(Research/Premium) 모델의 일일 요청
한도가 적용되는 동안, 아래 절차를 모두 따른다.

(a) **20 RPD는 절대 상한(hard ceiling)이며 목표치가 아니다**(출처:
    `.moai/reports/pilot-ready-quota-checklist-20260913.md`의 AI Studio
    실측 한도 표 — `gemini-3.6-flash` RPD 실제 한도 20).
(b) 2026-09-13 하이브리드 라우팅 도입 이후 모든 사건이 Premium 모델을
    호출하지 않는다 — 일반 사건은 `gemini-3.5-flash-lite`(Fast/Lite)로
    시작하고, 복합 쟁점 사건(`PRE_EXISTING_CONDITION`/
    `INJURY_DISEASE_RELATION`/`ADDITIONAL_CONFIRMATION_NEEDED`) 또는
    Lite 결과가 품질 실패(Verifier `INSUFFICIENT` 등)한 사건만 Premium
    으로 1회 승격되며, 승격은 `pipeline_research_routed`/
    `pipeline_research_escalated` 구조화 로그로 남는다(출처:
    `.moai/reports/hybrid-research-routing-20260913.md`) — **따라서
    사건 수 ≠ 모델 요청 수**이며, 이 절 어디에서도 그 등식을 전제하지
    않는다.
(c) 기존 보수적 운영 목표는 Premium 모델 **호출 자체**(사건 수가 아님)
    기준 재시도 여유를 포함해 **하루 15회 이내**이며, 이 값은 20 RPD
    절대 상한과 구분해 둘 다 출처
    (`.moai/reports/pilot-ready-quota-checklist-20260913.md:58`)와 함께
    명시한다.
(d) 일일 예산에는 스모크 단계 호출, 승격(promotion) 호출, 429/503
    재시도-백오프 호출, 실패 후 재제출 호출을 모두 포함해야 하며,
    낙관적인 happy-path 건수만으로 예산을 세우지 않는다.
(e) **구체적인 일일 절차**: 매일 그날의 **전체 시간창(time-window)
    `gemini_request_observed` 콘솔 로그**(`lib/observability/gemini-fetch-observer.ts` —
    성공 경로와 네트워크 예외 경로 양쪽 모두에서 남는다)를 **호출 시도
    (call-attempt) 기준**으로 사용해 그날의 호출 시도 수를 집계한다 —
    이 로그는 예외로 끝난 호출까지 포함해 시도된 모든 호출을 담으므로,
    성공적으로 저장된 것만 담는 DB보다 더 완전한 시도 기준이다.
    `gemini_request_observations`(DB)는 이 콘솔 로그 집계에 대한 **교차
    대조(cross-reference) 자료**로만 사용하며, DB 행 수를 콘솔 로그
    집계 위에 **합산하지 않는다** — 두 출처가 겹치는 성공 경로 호출을
    이중 계산하게 되기 때문이다. §2.2(j)가 요구하는 스모크 선기록 호출은,
    그 로그 라인이 이미 회전(rotation)·삭제(purge)돼 로그에 더 이상
    남아 있지 않은 것으로 확인된 항목에 **한해서만** 콘솔 로그 집계에
    추가한다(로그에 이미 나타나는 스모크 호출을 다시 더하는 것은 금지 —
    이중 계산). `status: null`인 모든 네트워크 예외 관측치, 그리고
    `gemini_observation_persist_failed`가 발생한 모든 관측치는 DB에
    도달했는지와 무관하게 각각 **실제 호출 1건으로 보수적으로 집계**해야
    한다(단지 DB에 반영되지 않았다는 이유로 "발생하지 않은 것"으로
    취급하지 않는다). 이 값들은 이미 위 로그 라인 집계에 포함돼 있으므로
    별도로 추가 집계하지 않는다 — 이 요구사항은 로그 스캔에서 이들을
    누락·제외하지 않도록 보장하기 위한 것일 뿐이다. 이 일일 산출물은
    그날 실제 총 호출을 담보하는 최종 수치가 아니라, (g)의 결정 규칙에
    투입되는 여러 입력 중 하나인 **관측치(observation)**일 뿐이다.
    로그 보존·회전 정책, 콘솔 로그 자체의 갱신 지연, 또는 중복 제거
    (de-duplication) 불확실성 때문에 신뢰할 수 있는 호출 수를 확정할 수
    없는 경우, "추적된 수치가 ≤15이니 진행한다"로 기본 설정하지
    **않는다** — 그 불확실성이 해소될 때까지 신규 Premium 모델 배치
    착수를 **중단/보류(abort/halt)**한다. 이 절차는 §2.2(d)의
    `gemini_request_observations` 0행 확인이 실제로 성공했다는 전제
    위에서만 유효하다 — §2.2(k)에 따라, 어느 스모크 실행이든 이 확인이
    실패(행 잔존)한 상태라면 그 실행의 선기록 호출 수치를 일일 합산에
    그대로 포함하지 않고, 해소될 때까지 수동 재조정(reconcile) 대상으로
    별도 표시한다. `gemini_request_observations` 행이 실제로 삭제되는지
    여부는 이 일일 집계의 기준 출처를 콘솔 로그에서 DB로 전환하지
    않는다 — 삭제는 정리 행정 작업일 뿐이다. 이 집계 결과를 (g)의 결정
    규칙에 따라 처리한 결과로 다음 날 배치 규모를 결정하고, 쿼터 소진에
    연동된 중단(abort)/중지 기준으로 삼는다.
(f) "하루"·"일일"이 실제로 의미하는 시작·종료 경계는 이 SPEC이 미리
    가정하거나 하드코딩하지 않는다 — 운영 시점에 AI Studio 콘솔(또는
    그 시점의 공식 출처)에서 실제 일일 리셋 스케줄을 확인하는 절차를
    거치고, 확인된 경계를 **UTC**와 **KST** 두 표기로 함께 기록하며,
    그 경계를 (e)가 정의하는 콘솔 로그 호출 시도 집계·확인된 로그-갭
    스모크 보충·DB 교차 대조 세 요소 모두에 동일하게 적용한다. 매 배치
    시작 직전 현재 사용량을 재확인해 Premium 15회/일 보수적 목표에
    도달하면 승격 대상 신규 사건 투입을 중단한다 — 리셋 시각을 SPEC
    작성 시점에 추정·확정해 문서에 상수로 박아 넣는 것은 금지되며, 이는
    계획 시점의 상수가 아니라 운영 시점의 확인 절차다.
(g) **Gemini 관측 지속성 한계와 일일 사용량 판단 결정 규칙**:
    `gemini_request_observations` 테이블은 전체 Gemini 호출을 빠짐없이
    담보하지 않는다 — 네트워크 예외로 끝난 호출은 `gemini_request_observed`
    콘솔 로그(`lib/observability/gemini-fetch-observer.ts`, 성공 경로
    (67-73행)와 예외 경로(86-99행) 양쪽 모두에서 남는다)로만 기록되고,
    DB 저장 호출(`context.onObservation`, 같은 파일 75행)은 성공 경로에서만
    호출되며 예외 경로에서는 전혀 호출되지 않으므로 네트워크 예외 호출은
    DB에 결코 기록되지 않는다. DB 저장 자체도 독립적으로 실패할 수 있다 —
    `context.onObservation`은 자체 try/catch(같은 파일 74-84행)로
    감싸여 있으며, 저장 실패는 기존에 실존하는 이벤트명
    `gemini_observation_persist_failed`로 로깅될 뿐 관측치 자체는
    유실된다. 따라서 "DB 행 수 + 스모크 선기록 합계가 전체 사용량의
    완전한 그림을 준다"고 전제하지 **않는다**. **AI Studio 콘솔을 지연
    없는(lag-free) 실시간 원장으로 단정하지 않는다** — 이 SPEC은 AI
    Studio 콘솔 사용량 표시의 실제 운영 동작(실시간으로 표시되는지 여부,
    어느 화면·어느 필드에 표시되는지, 표시값이 얼마나 최신인지/지연이
    있는지)을 검증하지 않았으므로, 이를 계획 시점에 가정하지 말고
    **운영 시점에 실제로 확인**하고 그 확인 결과(어떤 화면·필드에서
    무엇이 표시됐는지, 확인한 타임스탬프)를 **기록**하는 절차를 거친다.
    그 확인 결과에 따라 다음 **결정 규칙**을 적용한다:
    - **IF** AI Studio 사용량 표시가 실제로 확인 가능하고 그 갱신
      지연(update-lag)이 파악돼 있다면 → 그 표시값을 일일 쿼터 판단의
      **주(primary) 수치**로 사용한다.
    - **IF** 그 표시를 확인할 수 없거나, 갱신 지연이 불명확·미확인
      상태라면 → (e)에서 산출한 **콘솔 로그 기준 집계**(전체 시간창
      `gemini_request_observed` 로그를 호출 시도 기준으로, DB는 교차
      대조 자료로만, 로그에서 확인된 누락분만 스모크 선기록으로 보충,
      `status:null`·`gemini_observation_persist_failed`는 각 1건으로
      보수 집계)를 기준으로, Premium **하루 15회 이내** 목표를 운영
      제약으로 삼아 운영한다 — 단, (e)가 명시하는 대로 이 집계 자체가
      로그 보존·회전, 갱신 지연, 중복 제거 불확실성으로 신뢰할 수 없는
      상태라면 "≤15이니 진행"으로 기본 설정하지 않고 그 불확실성이
      해소될 때까지 신규 Premium 배치 착수를 중단/보류한다.
    이 결정 규칙과 무관하게, `gemini_observation_persist_failed`가
    관측되거나(AI Studio 표시값을 사용 중인 경우) 그 표시값과 내부
    원장 사이에 불일치가 발견되면, 신규 배치 착수를 중단하거나
    해소될 때까지 보수적 예약 태세(신규 승격 대상 사건 투입 축소)로
    전환한다. (f)의 UTC/KST 운영 시점 확인 경계 계약은 이 항목 추가와
    무관하게 그대로 유지한다.
(h) **아키텍처 제약**: 이 파일럿은 단일 Google Cloud 프로젝트·단일
    `GEMINI_API_KEY`(`lib/env.ts:53`, `lib/ai/providers/gemini.ts:91`)만
    사용하며, 프로젝트 전체에 다중 계정/다중 프로젝트 키 로테이션,
    라운드로빈, 429 트리거 키 페일오버 패턴이 존재하지 않는다(전수 Grep
    재확인 결과) — 이런 다중 키 아키텍처를 파일럿 기간 중 명시적으로
    **금지**한다(현재 아키텍처와 일치하는 가드레일이며, 해소해야 할
    결함이 아니라 범위 확장을 막는 명시적 제약이다).

## §5. 교차 참조

- `.moai/docs/account-provisioning.md` — 계정 발급 절차의 SSOT(이 문서는
  참조만 하며 대체하지 않음)
- `.moai/docs/pilot-incident-runbook.md` — 파일럿 운영 중 장애 대응 절차
  (triage 담당자, 로그 이벤트 표, §4 원격 DB 단독 진행 원칙의 출처)
- `.moai/reports/pilot-ready-quota-checklist-20260913.md` — Gemini 쿼터
  실측 한도·보수적 운영 목표의 출처
- `.moai/reports/hybrid-research-routing-20260913.md` — 하이브리드 라우팅
  승격 규칙·구조화 로그 이벤트명의 출처
- `.moai/specs/SPEC-PILOT-OPS-001/spec.md` — 이 문서가 구현하는 REQ 원문
  (REQ-PILOT-OPS-003~007)
