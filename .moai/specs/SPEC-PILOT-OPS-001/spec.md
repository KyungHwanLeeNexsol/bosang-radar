---
id: SPEC-PILOT-OPS-001
title: "실제 파일럿 운영 개시 — 문서 현행화, 계정 발급·스모크·단계별 롤아웃 계획"
version: "0.3.0"
status: draft
created: 2026-09-15
updated: 2026-09-15
author: Nexsol
priority: P1
phase: "v1.2.0 target"
module: "README.md, .moai/project/product.md, .moai/docs/"
lifecycle: spec-anchored
tags: "pilot, operations, launch-plan, account-provisioning, rollout"
tier: S
depends_on: [SPEC-PILOT-READY-001, SPEC-PILOT-LAUNCH-001]
---

## HISTORY

- 2026-09-15: 최초 작성 (Nexsol) — SPEC-PILOT-READY-001(파일럿 배포 준비, GO 판정,
  PR #10 병합 `d74ece4`)과 SPEC-PILOT-LAUNCH-001(프로덕션 사용자 문구 정리·계정
  발급 절차 문서화, PR #11 병합 `bc289ad`, 이후 `14a6394`로 3-phase close)이 모두
  `status: completed`로 종결된 이후, **실제 파일럿 운영을 개시하기 위한 계획**을
  다루는 후속 SPEC. 이 SPEC의 plan-phase와 run-phase 모두 실 계정 발급, 실 배포,
  실 Gemini API 호출, 실 사용자 초대, 실제 스모크 테스트 실행, 실제 파일럿 단계
  착수를 수행하지 않는다 — 문서 3건(README.md 현행화, product.md 현행화, 신규
  운영 절차 문서 1건)을 작성·갱신하는 것만이 이 SPEC의 전체 범위다. 사용자 요청의
  5개 항목을 각각 REQ로 전환했다: ①README.md/product.md 문서 현행화, ②최초 운영
  계정(zuge3927@naver.com) 발급 절차 계획, ③프로덕션 합성 사례 E2E 스모크
  체크리스트 작성, ④파일럿 운영 3단계 분리 계획, ⑤후속 작업(실 Gemini 코퍼스
  품질 평가, 완료/피드백 집계 대시보드, Gold Dataset 도구, 로그인
  rate-limiting·계정 비활성화·비밀번호 재설정)은 명시적으로 범위 밖으로 분리한다.
  당시 시점 기준 Netlify 프로덕션 배포의 정확한 URL·배포 SHA는
  SPEC-PILOT-LAUNCH-001 plan-phase(3차 개정) 및 종결 시점 모두에서 독립 검증되지
  못한 채 이어져 온 미해결 항목이었다. **이 항목은 같은 날 진행된 1차 개정
  라운드(plan.md §C "확인 사항 해소 기록" 참고)에서 사용자가 Netlify 대시보드를
  직접 확인해 URL·SHA 값을 제공함으로써 해소됐다** — 아래 2026-09-15 2차 개정
  항목 및 plan.md §C가 최신 상태를 반영한다.
- 2026-09-15: 2차 개정 라운드 (Nexsol, plan-auditor 재감사 지적사항 D1~D6 반영 —
  점수는 `.moai/reports/plan-audit/SPEC-PILOT-OPS-001-review-2.md` 참고) —
  6가지 결함을 수정했다. ①(D1) REQ-PILOT-OPS-004(당시)의 9개 항목 스모크
  체크리스트가 "운영자 계정 1개"로 수행한다면서 그 안에 "서로 다른 두 계정 간"
  테넌트 격리 확인을 포함하는 구조적 모순을 발견 — REQ-PILOT-OPS-004를 계정
  1개로 가능한 8개 항목(E2E 흐름 검증)만으로 재정의하고, 테넌트 격리 확인을
  2단계 착수 전 별도 게이트(신규 REQ-PILOT-OPS-005, 최소 계정 2개 필요, 임시
  계정 대안 경로의 발급·정리·집계제외 명시 의무 포함)로 분리했다. ②(D2) 기존
  REQ-PILOT-OPS-006(Gemini 쿼터, 당시)이 "사건 수 ≤ 20건/일"이라는 하이브리드
  라우팅 도입(2026-09-13) 이전 모델을 그대로 전제하고 있음을 발견 —
  `.moai/reports/pilot-ready-quota-checklist-20260913.md`와
  `.moai/reports/hybrid-research-routing-20260913.md`를 직접 재확인해
  REQ-PILOT-OPS-007로 재작성: 20 RPD는 절대 상한(사건 수 아닌 Premium 모델 호출
  수 기준), 일반 사건은 Lite로 시작하고 복합 쟁점·품질 실패 사건만 Premium으로
  승격되므로 사건 수 ≠ 모델 요청 수, 보수적 운영 목표(하루 15회 이내, 재시도
  여유 포함, 출처 `pilot-ready-quota-checklist-20260913.md:58`)와 절대 상한을
  구분 기술, 일일 예산에 스모크·승격·재시도·재제출 호출 모두 포함, `gemini_request_observations`
  테이블 기반 일일 점검→다음날 배치 결정→쿼터 소진 연동 중단 기준의 구체적
  절차를 신규 요구했다. ③(D3) 성공지표("실무자 10명×3건") 집계 시 운영자
  스모크 세션·임시 계정·부분 완료 사이클·이중 집계를 배제하는 명시적 계약이
  없었음을 발견 — REQ-PILOT-OPS-006(3단계 분리, 재번호)에 집계 계약을 추가했다.
  ④(D4) 스모크 "정상" 판정 기준이 로그 이벤트의 존재/부재를 명확히 구분하지
  않았음을 발견 — REQ-PILOT-OPS-004에 "양성 증거(`case_request_received` 존재)
  + 음성 증거(`pipeline_stage_failed`/`pipeline_failed`/`completion_transaction_failed`
  부재)" 이중 기준과, 음성 증거 위반 시 "주의사항 있는 PASS"가 아니라 즉시
  중단·트리아지라는 단일 판정 규칙을 명시했다. ⑤(D5) 스모크 데이터 정리 계약이
  "무엇을 어떻게 정리하는지" 구체성이 부족했음을 발견 — 고유 스모크런 ID +
  정확한 식별자 기록, `case_jobs`/`gemini_request_observations`/리스 상태까지
  포함하는 정리 범위, 소유권·대상 확인 후 안전한 순서로 삭제 + 0행 확인이라는
  구체 계약을 REQ-PILOT-OPS-004에 추가했다(`lib/db/schema.ts`로 테이블명 재확인:
  `cases`/`reports`/`feedback`/`caseJobs`/`geminiRequestObservations`/`reservations`
  모두 실존 확인). ⑥(D6) HISTORY 최초 작성 항목과 WHAT 절, plan.md §A.2/§G가
  URL·SHA를 여전히 "미확인"으로 서술하고 있어 1차 개정 라운드의 해소 기록과
  모순됐음을 발견 — 전체 문서에서 잔존 서술을 찾아 정정했고, URL 표기를
  스킴 포함 `https://musical-macaron-82feb3.netlify.app` 형태로 통일했다.
  이 라운드는 REQ 7개(REQ-PILOT-OPS-001~007, Tier S 상한 8개 이내)와
  AC 8개(Tier S 상한 정확히 도달)로 재구성됐다.
- 2026-09-15: 3차 개정 라운드 (Nexsol, 오케스트레이터가 직접 Grep으로 재확인한
  코드 근거 2건 반영) — 5가지 결함을 수정했다. 오케스트레이터가 이번 라운드
  위임 전에 직접 확인한 사실: (a) `case_request_received`(`app/api/cases/route.ts:26-29`)·
  `pipeline_stage_failed`(`lib/pipeline/index.ts:81,92`)·
  `pipeline_failed`/`pipeline_failed_lease_release_failed`/
  `completion_transaction_failed`/`post_failure_lease_release_failed`
  (모두 `lib/cases/create-case.ts`) 로그 이벤트 어디에도 jobId·caseId 필드가
  없다(필드는 `event`/`timestamp`/`hasOwnerUserId`(일부)/safe-error-meta뿐);
  (b) `leaseId`는 `reservations`(`lib/db/schema.ts:148`)와 `caseJobs`
  (`lib/db/schema.ts:156-161`) 양쪽에 실제 `lease_id` 컬럼으로 존재하고,
  실제 해제 함수 `releaseLeaseFenced(db, ownerUserId, leaseId)`
  (`lib/cases/create-case.ts:119`, 161/230/279/481행 호출)는 ownerUserId AND
  leaseId 둘 다 일치할 때만 펜싱 해제한다. ①(재확인 (a)) REQ-PILOT-OPS-004의
  스모크 로그 검증 항목(6)(7)이 "동일 jobId/caseId 기준"이라는, 실제 코드에
  존재하지 않는 상관관계를 전제하고 있었음을 발견 — 격리된 스모크
  시간창(고유 스모크런 ID·시작/종료 타임스탬프·Netlify function invocation
  범위로 식별)을 기준으로 이벤트 존재/부재를 판정하도록 정정했다. 실 jobId/
  caseId 상관관계 필드를 로깅 코드에 추가하는 것은 이 SPEC이 계획하지 않으며,
  Out of Scope에 별도 후속 구현 후보로만 명명했다(신규 SPEC 생성은 하지
  않음). ②REQ-PILOT-OPS-004의 정리 계약이 `gemini_request_observations`
  행을 삭제하면서도 REQ-PILOT-OPS-007의 쿼터 집계가 같은 테이블의 라이브
  값을 읽는 충돌을 발견 — 삭제 전 스모크 실행의 실제 모델별 호출 횟수를
  운영 기록(코드 아님)에 먼저 남기고, 일일 집계를 "기록되고 이미 삭제된
  스모크 호출 + 라이브 DB 관측치"로 재정의(스모크런 ID·타임스탬프 범위 기준
  결합, 시간 중복 없음)하는 사항을 REQ-PILOT-OPS-004(j)/REQ-PILOT-OPS-007(e)에
  추가했다. ③(재확인 (b)) 정리 계약의 리스 관련 조건이 실제 코드의 펜싱
  메커니즘과 분리되어 있었음을 발견 — `case_jobs.leaseId` 기록, 정상 완료 후
  동일 리스의 `reservations` 행 부재 확인(존재 시 즉시 중단·트리아지, 자동
  PASS나 광범위 정리 근거 아님), 삭제는 ownerUserId AND leaseId 둘 다 일치 +
  새 활성 job 없음일 때만(`releaseLeaseFenced`와 동일 조건), 다른 leaseId
  발견 시 절대 미삭제를 REQ-PILOT-OPS-004에 명시했다. ④REQ-PILOT-OPS-006의
  "총 10명 내외·약 30건"이라는 근사 표현을 "집계 가능한 실제 실무자 최소
  10명·집계 가능한 완료 사이클 최소 30건"이라는 정밀 최소값 표현으로
  정정했다(기존 자격/전체사이클/이중집계금지 계약은 무변경). ⑤plan.md §E
  자체 검증 표가 헤딩 존재 여부만으로 AC-004~007을 PASS 처리하던 것을
  발견 — 시간창 기반 검증(jobId 상관관계 아님), 리스 펜싱 조건, 삭제-쿼터
  결합 규칙, "최소 10명/최소 30건" 정밀 표현, 20 RPD/15회 구분 유지 여부를
  각각 실제 내용으로 확인하는 grep 행을 추가했다. REQ/AC 개수는 이번
  라운드에서 변경되지 않았다(REQ 7개, AC 8개 그대로 — 기존 REQ 본문의
  내용만 정정·구체화됐다).
- 2026-09-15: 4차 개정 라운드 (Nexsol, plan-auditor iteration-4 스트레스 테스트가
  발견한 결함 D-new-1 1건 수정 — D-new-2/D-new-3은 논블로킹으로 이번 라운드에서
  손대지 않음). REQ-PILOT-OPS-004(j)의 "이중 계산·누락 방지" 결합 규칙이
  gemini_request_observations 삭제(항목 (j))가 항상 완전히 성공한다는 전제에
  암묵적으로 의존하고 있었다는 점을 발견 — 항목 (d)의 범용 "0행 확인"은 6개
  cleanup 테이블 전체에 적용되지만, gemini_request_observations 실패에 대해서는
  항목 (h, lease 잔존)처럼 명시된 결과가 없었다. 삭제가 일부만 성공해 행이
  남으면 그 행은 (이미 (j)가 선기록한 값 + 여전히 살아있는 DB 값) 양쪽에
  잡혀 이중 계산되는데, 이는 REQ가 방지하겠다고 주장하는 바로 그 실패
  양상이다. 수정: REQ-PILOT-OPS-004에 (k) 절을 신설 — gemini_request_observations
  삭제 후 0행 확인이 실패(행 잔존)하면 (h)와 동일한 등급의 즉시 중단·트리아지
  대상이며 결코 조용히 일일 집계에 포함되지 않고, 그 스모크 실행의 선기록
  호출 수치는 상태가 해소될 때까지 수동 재조정(reconcile) 대상으로 별도
  표시한다. 동일 조건을 REQ-PILOT-OPS-007(e)에도 동기화했고, AC-PILOT-OPS-004·
  AC-PILOT-OPS-007도 함께 갱신했다(cleanup 계약 10개→11개 항목 a~k). REQ/AC
  개수는 이번 라운드에서도 변경되지 않았다(REQ 7개, AC 8개 그대로).
- 2026-09-15: 5차 개정 라운드 (Nexsol, 코드 근거 5건을 사전 검증한 외부 검토
  반영 — 오케스트레이터가 위임 전 Grep/Read로 직접 재확인한 사실로 취급하고
  이번 라운드에서 재검증만 수행함). (1) REQ-PILOT-OPS-004의 스모크 판정 근거를
  실제 프로덕션 async 경로(`app/api/cases/route.ts`의 `startCaseJob`
  호출 → `netlify/functions/process-case-background.ts` →
  `processCaseJob`)로 정정 — 음성 증거 이벤트를 기존 3개(`pipeline_stage_failed`·
  `pipeline_failed`·`completion_transaction_failed`, 이 중 뒤 2개는 실제로
  호출되지 않는 동기 레거시 `createCase` 전용)에서 실제 async 경로의 7개
  이벤트(`case_job_enqueue_failed`·`case_job_cancel_failed`·
  `case_job_create_lease_release_failed`·`pipeline_stage_failed`·
  `case_job_failed`·`case_job_status_update_failed`·
  `case_job_failed_lease_release_failed`)로 교체하고, 레거시 3개 이벤트
  (`pipeline_failed`/`completion_transaction_failed`/
  `post_failure_lease_release_failed`)는 역사적 맥락으로만 언급하도록
  구분했다. `.moai/docs/pilot-incident-runbook.md`를 이 SPEC의 영향 파일에
  추가하고(총 3개→4개, 여전히 Tier S), §1 이벤트 표·§2 TTL 서술을 실제
  값(`BACKGROUND_LEASE_TTL_SECONDS`=960초, 클라이언트 폴링 상한 1020초 —
  구 서술의 "최소 330초"는 사용되지 않는 구 동기 경로 상수였음)로 정정했다.
  (2) REQ-PILOT-OPS-005를 (a)양성 대조군 확인→(b)`notFound()`/`404` JSON
  양방향 교차 확인(코드 위치 인용)→(c)세션 분리 또는 완전 재로그인→(d)합성
  사례만 사용의 구체적 4단계 절차로 재작성하고, 실제 외부 계정 경로로 생성된
  격리 게이트 사건도(기존에는 임시 계정 경로에만 명시돼 있던) 집계 제외·정리
  대상임을 명시했다. (3) REQ-PILOT-OPS-007에 (f) 절 신설 — 일일 리셋 경계를
  SPEC 작성 시점에 추정·하드코딩하지 않고 운영 시점에 실제 콘솔에서 확인해
  UTC·KST로 기록하는 절차를 명시. (4) REQ-PILOT-OPS-006에 "실무자 × 완료
  사건 수 × 피드백 존재 여부" 증거 표 형식을 포함한 읽기 전용 수동 집계
  절차를 추가(관리자 대시보드 구현은 여전히 Out of Scope). (5) REQ-004(i)의
  "다른 사람의 정상적인 동시 리스"라는 부정확한 표현을 "같은 사용자의 더
  새로운 유효 리스"로 정정(`reservations`가 `ownerUserId` 기본키이므로 다른
  leaseId는 구조적으로 같은 사용자의 리스일 수밖에 없다는 사실 근거). AC-004~007
  전부 위 변경에 맞춰 갱신. REQ/AC 개수는 이번 라운드에서도 변경되지 않았다
  (REQ 7개, AC 8개 그대로).
- 2026-09-15: 6차 개정 라운드 (Nexsol, 코디네이터가 브랜치 오염 정리를 먼저
  위임하고 이어서 콘텐츠 수정 4건을 지시함 — 코디네이터가 위임 전 `git
  log`/`git show --stat`으로 직접 확인한 사실로 취급하고 이번 라운드에서
  재검증만 수행함). **브랜치 정리(Step 0)**: `plan/SPEC-PILOT-OPS-001`
  브랜치 HEAD에 동일 작성자(kyunghwan/zuge3927@naver.com)의 무관한 기능
  커밋 `3a3614c`(일자 입력 datepicker UI 교체, 10개 파일)가 직접 push돼
  있던 것을 발견 — 해당 커밋을 `feat/case-date-picker-ui` 브랜치로 보존한
  뒤 `git revert --no-edit`으로 비파괴적으로 되돌림(revert 커밋
  `19e3377`, 히스토리 재작성 없음). 이는 3~6차 개정에서 반복적으로
  플래그됐던 "설명되지 않은 datepicker 파일 변경" 우려가 실제 병렬 세션
  오염으로 확인된 것이다. 되돌린 뒤 `git diff main...plan/SPEC-PILOT-OPS-001
  --stat`으로 브랜치-main diff에 SPEC 범위 파일 4개(spec.md/plan.md/
  progress.md/pilot-incident-runbook.md) 외 `app/`·`components/`·`e2e/`
  파일이 전혀 남지 않았음을 재확인. **콘텐츠 수정 4건**: (1) REQ-PILOT-OPS-004의
  스모크 판정 항목 (6)/(7)을 재작성 — `app/api/cases/route.ts`(Next.js
  API route)와 `netlify/functions/process-case-background.ts`(Background
  Function)는 서로 **별개의 Netlify function invocation**(각자 별도
  로그 스트림·invocation ID를 가지며 하나의 연속된 로그가 아님)이라는
  사실을 명시하고, 8개 async 이벤트를 ROUTE invocation 범위(양성 1개 +
  음성 3개: `case_job_enqueue_failed`·`case_job_cancel_failed`·
  `case_job_create_lease_release_failed`)와 BACKGROUND invocation
  범위(음성 4개: `pipeline_stage_failed`·`case_job_status_update_failed`·
  `case_job_failed_lease_release_failed`·`case_job_failed`)로 나눠
  각 invocation의 로그 범위를 별도로 기록하도록 정정 — 두 invocation
  모두 같은 전체 격리된 스모크 시간창 안에 있어야 한다는 전제는 유지.
  AC-PILOT-OPS-004·plan.md §D/§E·`.moai/docs/pilot-incident-runbook.md`
  이벤트 표에도 동일한 두 invocation 구분을 동기화. (2) REQ-PILOT-OPS-007에
  Gemini 관측 지속성 한계를 명시 — 네트워크 예외로 끝난 호출은
  `gemini_request_observed` 콘솔 로그(`lib/observability/
  gemini-fetch-observer.ts` 성공 경로(67-73행)·예외 경로(86-99행) 양쪽
  모두)로만 남고 DB 저장 호출(`context.onObservation`, 같은 파일 75행)은
  성공 경로에서만 호출되어 예외 경로에서는 DB에 전혀 기록되지 않으며,
  DB 저장 자체도 독립적으로 실패할 수 있다(자체 try/catch, 같은 파일
  74-84행 — 실패 시 기존 실존 이벤트 `gemini_observation_persist_failed`로
  로깅). 따라서 "DB 행 수 + 스모크 선기록 합계 = 전체 사용량의 완전한
  그림"이라는 전제를 명시적으로 부정하고, **AI Studio 콘솔의 실시간
  사용량 표시를 일일 쿼터 판단의 운영상 ground-truth로 지정**하며 DB
  행 수·스모크 선기록·콘솔 로그는 교차 대조(cross-reference) 자료로만
  사용한다는 원칙, `gemini_observation_persist_failed` 관측 또는 콘솔-DB
  불일치 발견 시 신규 배치 착수 중단 또는 보수적 예약 태세로 전환한다는
  구체 대응, 단일 Google Cloud 프로젝트·단일 `GEMINI_API_KEY`
  (`lib/env.ts:53`, `lib/ai/providers/gemini.ts:91`) 아키텍처 제약(다중
  계정/다중 프로젝트 키 로테이션·라운드로빈·429 트리거 키 페일오버 명시적
  금지 — 현재 아키텍처와 일치하는 가드레일이며 해소해야 할 결함이 아님)을
  추가. (e)의 UTC/KST 운영 시점 확인 경계 계약은 변경하지 않음. AC-PILOT-OPS-007도
  동기화. (3) Out of Scope 절 "로그 jobId/caseId 상관관계 필드 추가" 항목의
  "현재 로그 이벤트" 평면 목록을 "실제 async 프로덕션 이벤트" 8개 vs "sync
  legacy 이벤트(미사용)" 3개로 명시적으로 분리하고, `app/api/cases/route.ts:12-13`의
  구 TTL 주석(`LEASE_TTL_SECONDS` 최소 330초 — 미사용 동기 경로 `createCase`
  전용 상수이며 실제 async 경로가 쓰는 `BACKGROUND_LEASE_TTL_SECONDS`
  960초와 불일치)을 알려진 code-comment debt로 기록하되, 이 SPEC은 문서
  전용이고 코드를 일절 변경하지 않으므로 이 주석 정정은 향후 코드를 다루는
  별도 SPEC으로 이연한다는 Out of Scope 항목을 신설(이번 SPEC은 그 SPEC을
  생성하지 않음 — 결함을 알고도 방치하는 것이 아니라 명시적으로 이연했음을
  기록). (4) `.moai/docs/pilot-incident-runbook.md`의 5차 개정 §1/§2 정정은
  이미 plan-phase 중에 선반영(pre-applied)됐음을 progress.md §E.1과
  plan.md §D에 명시적으로 기록하고, run-phase의 역할은 이 정정 내용을
  다시 새로 작성하는 것이 아니라 이미 정정된 상태가 그대로 보존돼 있는지
  검증하는 것으로 한정됨을 명확히 함. REQ/AC 개수는 이번 라운드에서도
  변경되지 않았다(REQ 7개, AC 8개 그대로 — 기존 REQ 본문 내용만 정정·구체화).
- 2026-09-15: 7차 개정 라운드 (Nexsol, 5차 콘텐츠 수정 라운드 — 외부 검토
  6회차 반영. `feat/case-date-picker-ui` 원격 push는 코디네이터가 이 브랜치와
  무관하게 독립적으로 직접 수행함, 이 SPEC의 작업 트리는 그 push 전후로
  동일하게 클린했음). (1) REQ-PILOT-OPS-007(e)의 "그날의 실제 Premium 모델
  호출 실적을 산출"이라는 완전성 과장 표현을 "DB·스모크 기록 기준
  관측치(observation)를 산출"로 완화하고, 이 관측치가 (g)의 지속성 한계
  때문에 총 실사용량을 담보하는 최종 수치가 아니며 (g) 결정 규칙에 투입되는
  여러 입력 중 하나(내부 보수적 원장)로만 취급됨을 명시 — (e) 자신의 문구가
  기존 (g)의 지속성 한계 서술과 내부 모순됐던 것을 해소. (2) REQ-PILOT-OPS-007(g)에서
  "AI Studio 콘솔 실시간 표시 = ground-truth" 단정을 제거하고, 그 콘솔
  표시의 실제 운영 동작(실시간 여부·표시 화면/필드·갱신 지연)을 계획
  시점에 가정하지 않고 운영 시점에 확인·기록하는 절차를 신설했으며, 확인
  결과에 따른 결정 규칙(확인 가능+지연 파악 시 AI Studio 표시값을 주
  수치로 사용, 확인 불가 또는 지연 불명확 시 내부 원장(DB+스모크) 기준
  Premium ≤15회/일 제약으로 운영)을 추가 — `gemini_observation_persist_failed`
  관측 또는 불일치 시 배치 중단/보수적 예약 태세 전환이라는 기존 대응은
  변경 없이 유지. AC-PILOT-OPS-007을 위 (e)/(g) 개정 내용에 맞춰 동기화.
  (3) progress.md §E.1의 `artifact_set` 목록에 `.moai/docs/pilot-incident-runbook.md`가
  누락돼 있던 것을 추가 — 이 파일은 5차 개정부터 이 SPEC이 plan-phase 중
  직접 편집·선반영한 파일이므로, 선반영 기록과 artifact_set 목록 사이의
  불일치를 해소(README.md/product.md/신규 운영 문서는 이 SPEC 자신의
  plan-phase 산출물이 아니라 run-phase 대상 파일이므로 artifact_set에는
  여전히 포함하지 않음을 명시). (4) REQ-PILOT-OPS-004(6)에 "대시보드 함수명
  사전 확인 필요" 주의를 신설 — `route.ts`라는 소스 파일 경로 이름이
  Netlify 대시보드의 실제 함수 표시 이름과 같다고 단정하지 않고, 스모크
  수행 전 운영자가 실제 배포된 대시보드에서 `POST /api/cases`를 처리하는
  함수의 실제 표시 이름·invocation ID를 먼저 확인·기록한 뒤에만 사용하도록
  명시(`process-case-background`는 파일명 자체가 Background Function
  진입점 이름이므로 추가 확인 불필요 — 이미 올바르게 구분돼 있었음을
  재확인만 함). ROUTE/BACKGROUND 이벤트 귀속 분류 자체(어느 이벤트가 어느
  invocation에 속하는지)는 이번 라운드에서 변경하지 않음. AC-PILOT-OPS-004를
  동기화. (5) Out of Scope "신규 SPEC 생성" 요약 절의 "5개 Out of Scope
  항목"을 "6개"로 정정 — 6차 개정에서 `route.ts` 구 TTL 주석 정정 Out of
  Scope 항목이 신설되면서 후속 SPEC 후보 집합이 5개에서 6개로 늘었으나
  이 요약 문구가 갱신되지 않은 채 남아 있던 것을 수정(8개 전체 Out of
  Scope H3 절 중 "실 계정 발급..." 절과 이 요약 절 자신을 제외한 나머지
  6개가 후속 SPEC 후보 집합 — 직접 재확인). REQ/AC 개수는 이번 라운드에서도
  변경되지 않았다(REQ 7개, AC 8개 그대로 — 기존 REQ 본문 내용만 정정·구체화).
- 2026-09-15: 8차 개정 라운드 (Nexsol, 6차 콘텐츠 수정 라운드 — 외부 검토
  7회차 반영, PASS 전 최종 재검토). (1) REQ-PILOT-OPS-007(e)/(g)의 AI
  Studio 미확인 시 폴백 원장을 전면 재구성 — 7차 개정의 "DB 관측치 +
  스모크 선기록" 정의를 폐기하고, 그날의 전체 시간창 `gemini_request_observed`
  콘솔 로그(성공·예외 경로 양쪽 모두에서 남음)를 호출 시도(call-attempt)
  기준으로 삼는 방식으로 대체. `gemini_request_observations`(DB)는 그
  집계에 대한 교차 대조 자료로만 사용하고 DB 행 수를 콘솔 로그 집계 위에
  합산하지 않음(성공 경로 이중 계산 방지). 스모크 선기록 호출은 로그에서
  이미 회전·삭제된 것으로 확인된 누락분에만 보충. `status:null` 네트워크
  예외 관측치와 `gemini_observation_persist_failed` 이벤트는 DB 반영
  여부와 무관하게 각각 실제 호출 1건으로 보수적으로 집계하는 신규
  요구사항을 추가. 로그 보존·회전 갭, 갱신 지연, 중복 제거 불확실성으로
  신뢰할 수 있는 호출 수를 확정할 수 없을 때는 "추적된 수치 ≤15이니
  진행"을 기본값으로 삼지 않고 그 불확실성이 해소될 때까지 신규 Premium
  배치 착수를 중단/보류(abort/halt)하도록 더 엄격한 실패 모드로 강화.
  AI Studio-확인-후-분기 IF/IF 결정 규칙 구조와 단일 Google Cloud
  프로젝트·단일 `GEMINI_API_KEY` 아키텍처 제약((h))은 변경 없이 유지.
  AC-PILOT-OPS-007과 plan.md §E 자기검증 표의 해당 행을 위 재구성 내용에
  맞춰 동기화. (2) `.moai/docs/pilot-incident-runbook.md`의 6차 개정
  §1.1 정정 블록에서 "Netlify 대시보드에서 두 함수를 조회할 때도 각각
  별도의 함수 항목·별도의 invocation 로그로 나타난다"는 무조건 단정을
  제거하고, spec.md/plan.md의 REQ-PILOT-OPS-004(6)이 7차 개정에서 이미
  채택한 것과 동일한 문구 패턴의 "대시보드 함수명 사전 확인 필요" 주의로
  대체 — 스모크 수행 전 운영자가 실제 배포된 Netlify 대시보드에서
  `POST /api/cases`를 처리하는 함수의 실제 표시 이름·그룹핑 동작·
  invocation ID를 먼저 확인·기록한 뒤에만 사용하도록 명시. ROUTE/BACKGROUND가
  서로 다른 Netlify function invocation(별도 로그 스트림·invocation
  ID)이라는 6차 개정의 사실 서술 자체는 코드로 뒷받침되므로 변경하지
  않음. REQ/AC 개수는 이번 라운드에서도 변경되지 않았다(REQ 7개, AC 8개
  그대로 — 기존 REQ 본문 내용만 정정·구체화).

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-PILOT-READY-001은 파일럿을 외부 테스터에게 안전하게 열기 위한 **운영
준비**(호스팅, 동시성 가드, 로깅, 런북, 데이터 취급 고지)를 완료했고,
SPEC-PILOT-LAUNCH-001은 사용자 노출 문구를 정상 서비스 수준으로 정리하고 계정
발급 **절차**를 문서화했다. 그러나 두 SPEC 모두 **실제로 외부 전문가에게
파일럿을 개시하는 절차 자체**(누구를 언제 어떤 순서로 초대하는지, 개시 전
마지막으로 무엇을 확인하는지, 문서가 두 완료 SPEC의 산출물을 정확히 반영하고
있는지)는 다루지 않았다. 이 SPEC은 "준비 완료 상태"와 "실제 개시" 사이의 마지막
계획 간극을 문서로 메운다.

### WHAT — 이번 SPEC 범위

- README.md와 `.moai/project/product.md`를 SPEC-PILOT-LAUNCH-001 완료 사실(12번째
  SPEC, PR #11 병합)로 현행화하고, Netlify 프로덕션 배포 URL·SHA가 이제 확정됐다는
  사실(사용자 직접 확인 값 `https://musical-macaron-82feb3.netlify.app`,
  `381e38d`)과 그럼에도 GitHub API로는 여전히 독립 검증할 수 없다는 한계를 함께
  정확히 반영한다(§2.A).
- 최초 운영 계정 발급 절차를 계획한다 — 기존 `.moai/docs/account-provisioning.md`
  절차를 참조하고, 이 SPEC 고유의 대상(운영자 계정 후보 `zuge3927@naver.com`)과
  발급 전 확인 단계를 문서에 반영한다. **실 계정은 발급하지 않는다**(§2.B).
- 프로덕션 환경에서 합성(또는 이미 비식별화된) 사례로 수행할 단일 계정 E2E
  스모크 절차와, 그와 분리된 테넌트 격리 확인 게이트를 신규 문서로 작성한다.
  **실제로 스모크를 실행하지 않는다**(§2.C).
- 파일럿 운영을 3단계(운영자 단독 → 테넌트 격리 게이트 → 외부 2~3명 제한 →
  전체 10명)로 분리하고, 성공지표 집계 계약을 명시하는 계획을 신규 문서로
  작성한다. **실제로 어떤 단계도 착수하지 않는다**(§2.D).
- Gemini 무료 티어의 하이브리드 라우팅(2026-09-13 도입) 실제 동작을 반영한
  쿼터 운영 계획을 작성한다 — 사건 수와 Premium 모델 호출 수를 구분하고, 절대
  상한과 보수적 운영 목표를 구분한다(§2.E).
- 후속 개발 후보(코퍼스 품질 평가, 집계 대시보드, Gold Dataset, 인증 하드닝)는
  이 SPEC에서 신규 SPEC으로 생성하지 않고 Out of Scope로 명시만 한다.

### 핵심 판단 근거 — Tier S

영향 파일은 기존 문서 3개(README.md, `.moai/project/product.md` — 현행화 편집;
`.moai/docs/pilot-incident-runbook.md` — 4차 개정에서 확인한 실제 async 경로에
맞춰 §1 이벤트 표와 §2 TTL 서술을 정정하는 편집)와 신규 문서 1개
(`.moai/docs/pilot-ops-launch-plan.md` — 스모크 체크리스트·테넌트 격리
게이트·3단계 롤아웃·쿼터 운영 계획을 함께 담는 단일 운영 문서)로 총 4개다(5차
개정에서 `pilot-incident-runbook.md`가 "참조만" 대상에서 "실제 편집" 대상으로
전환됐으나, 여전히 Tier S "< 5 files" 기준을 명확히 만족한다 — 재분류 아님).
코드 변경, 스키마 변경, 테스트 변경, 실 계정·실 배포·실 API 호출은 전혀 없다 —
순수 문서 작성/편집이며 Tier S의 "< 5 files" 기준을 명확히 만족한다. 요구사항
7개(REQ-PILOT-OPS-001~007)는 Tier S의 REQ 상한(8개) 이내이며, 인수 조건은 별도
acceptance.md 없이 본 문서 §3에 Given-When-Then 형식으로 인라인 기록한다(AC
8개, Tier S 상한 정확히 도달).

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 문서 현행화 (Documentation Currency)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-OPS-001 | Ubiquitous | README.md와 `.moai/project/product.md`는 SPEC-PILOT-LAUNCH-001의 완료(`status: completed`, PR #11 squash 병합 커밋 `bc289ad9b95cf862ca3785d3fd73c2b143ca8983`, 이후 3-phase close 문서 커밋 `14a6394`)를 정확히 반영해야 한다. 구체적으로: (a) README.md 헤딩(현재 `README.md:19` "## 현재 구현 상태 (11개 SPEC 완료 — SPEC-SCAFFOLD-001 ~ SPEC-PILOT-READY-001)")과 최종 수정 표기(`README.md:1-8`)를 "12개 SPEC ... ~ SPEC-PILOT-LAUNCH-001"로 갱신한다; (b) README.md 본문(`README.md:21,23`)에 SPEC-PILOT-LAUNCH-001이 수행한 사용자 노출 문구 정리 및 계정 발급 절차 문서화 사실을 추가한다; (c) README.md "## 다음 단계" 절(`README.md:132-149`)의 "구현 완료 (11개 SPEC)" 헤딩·목록(`README.md:136,138`)을 12개로 갱신한다; (d) `.moai/project/product.md`의 최종 수정 표기(`product.md:1-7`)와 "### 구현 완료 (11개 SPEC, `status: completed`)" 헤딩·목록(`product.md:82,84-104`)을 12개로 갱신한다. 이 REQ는 README.md/product.md **본문 문구 편집만** 요구하며, 코드나 SPEC 문서 자체(완료된 SPEC-PILOT-LAUNCH-001/READY-001의 spec.md)는 변경하지 않는다. | Read 조사 확인(README.md:1-8,19,21,23,132-149; product.md:1-7,82,84-104 — 2026-09-15 재확인). SPEC-PILOT-LAUNCH-001 spec.md HISTORY의 병합 커밋 SHA 재확인 |
| REQ-PILOT-OPS-002 | Ubiquitous | README.md(`README.md:142`)와 `.moai/project/product.md`(`product.md:122-125`)의 "Netlify 프로덕션 배포 확정" 관련 서술은 다음 확정 사실을 반영해야 한다 — 사용자가 Netlify 대시보드에서 직접 확인해 프로덕션 배포 URL은 스킴을 포함한 `https://musical-macaron-82feb3.netlify.app`, 배포 SHA는 `381e38d6c88f77c4281ebb4007fb46475cce426b`(단축 `381e38d`, 이번 2차 개정 시점 main HEAD와 일치)임이 확정됐다(plan.md §C 해소 기록 참고). 이 갱신은 두 가지를 동시에 만족해야 한다 — (i) URL·SHA 값 자체는 이제 확정된 사실로 정확히 반영하되, "이 시점 기준"이며 다음 push로 전진할 수 있는 값임을 명시(영구 고정 pin으로 서술하지 않음); (ii) 그럼에도 이 세션·향후 세션이 GitHub commit-status/deployments API로 그 배포를 **독립 검증**할 수단은 여전히 없다는 한계는 계속 정확히 기록한다(사용자 직접 확인 ≠ API 독립 검증, 두 사실을 혼동하지 않음). "배포 여부 자체가 아직 결정되지 않았다"는 과거 문구는 이제 사실과 어긋나므로 제거한다. URL은 어디에 인용하든 바레 도메인이 아니라 스킴을 포함한 전체 형태(`https://musical-macaron-82feb3.netlify.app`)로 표기한다. | Read 조사 확인(README.md:142; product.md:122-125); 사용자가 1차 개정 라운드에서 직접 제공한 Netlify 대시보드 확인값(URL·SHA); `git log -1 main`/`git log -1 origin/main` 재확인(둘 다 `381e38d`, 0/0 발산) |

### B. 최초 운영 계정 발급 절차 계획 (Initial Operator Account Provisioning Plan)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-OPS-003 | Ubiquitous | 신규 운영 문서 `.moai/docs/pilot-ops-launch-plan.md`의 계정 발급 절에는 다음을 모두 포함해야 한다: (a) 최초 발급 대상은 운영자 본인 계정 `zuge3927@naver.com`이며, 이 이메일은 이미 `.moai/docs/pilot-incident-runbook.md` §3와 파일럿 지원 연락처로 확정된 동일 주소임을 명시(신규 이메일이 아니라 기존 확정 주소 재사용); (b) 발급 절차 자체는 기존 `.moai/docs/account-provisioning.md`를 그대로 따르며 이 문서를 대체하지 않고 참조만 함; (c) 발급 **전** 확인 단계로 `account-provisioning.md` §2-1이 요구하는 대로 `TURSO_DATABASE_URL`이 실제 프로덕션 호스트를 가리키는지 확인하는 절차를 재확인·요약(이 SPEC이 그 확인을 실행하는 것은 아니며, 문서화만 함); (d) 발급 후 검증은 `account-provisioning.md` §5(실제 로그인 성공 확인)를 그대로 따름을 명시; (e) 이 SPEC은 실제로 `pnpm tester:add`를 실행하지 않으며, 실 계정을 생성하거나 원격 DB에 쓰지 않음을 명시. | Read 조사 확인(`.moai/docs/account-provisioning.md` 전문, `.moai/docs/pilot-incident-runbook.md` §3 "이경환(파일럿 운영 책임자)... 연락 경로는 §1의 로그 확인 절차로 발견된 이슈를 이 담당자에게 전달"); SPEC-PILOT-READY-001 spec.md HISTORY v0.8.0 "지원 연락처 이메일(`zuge3927@naver.com`)... 확정" |

### C. 프로덕션 스모크 절차 — 단일 계정 E2E 검증 + 테넌트 격리 게이트 (Production Smoke — Single-Account E2E and Tenant-Isolation Gate)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-OPS-004 | Ubiquitous | 신규 운영 문서의 스모크 체크리스트 절에는, 실제 파일럿 운영 개시 **전** 운영자 계정(`zuge3927@naver.com`) **1개만으로** 수행하는 단일 계정 E2E 흐름 검증을 다음 8개 항목으로 순서대로 기록해야 한다: (1) 로그인 성공 및 세션 유지 확인; (2) 사건 제출 시 `202` 응답 및 jobId 수신 확인; (3) Background Function 처리 완료 후 사건 상태가 `completed`로 전이되는지 확인; (4) 생성된 사건(case)과 리포트(report)가 저장되고 재조회로 확인되는지 검증; (5) 구조화 전문가 피드백 제출·저장 확인; (6) 이 프로젝트의 실제 프로덕션 경로는 `app/api/cases/route.ts`(`startCaseJob`을 호출하며 `createCase`는 임포트하지 않음) → `netlify/functions/process-case-background.ts` → `processCaseJob`(`lib/cases/create-case.ts:380-491`)로 이어지는 **비동기** 경로다. **주의(두 개의 별개 invocation)**: `route.ts` 처리(요청을 받는 Next.js API route 실행)와 `process-case-background.ts` 처리(Background Function 실행)는 **서로 다른 두 개의 Netlify function invocation**이며 각자 별도의 로그 스트림·invocation ID를 가진다 — 하나의 연속된 로그가 아니므로, 아래 확인은 각 invocation의 로그 범위를 별도로 기록·판정한다(두 invocation 모두 같은 전체 격리된 스모크 시간창(고유 스모크런 ID로 식별, 시작·종료 타임스탬프) 안에 있어야 한다는 전제는 유지). **주의(대시보드 함수명 사전 확인 필요)**: 위 `route.ts`라는 명칭은 소스 파일 경로이며, Netlify 대시보드에 그 파일 경로 이름 그대로 별도 함수 항목으로 표시된다고 단정하지 않는다 — Next.js API route는 실제 배포 시 소스 파일 경로와 다르게 번들링·명명될 수 있다. 따라서 신규 문서는, 스모크를 실제로 수행하기 **전에** 운영자가 실제 배포된 Netlify 대시보드에서 `POST /api/cases`를 처리하는 함수의 실제 표시 이름(function display name)과 invocation ID를 먼저 확인하고 그 확인된 이름·ID를 기록한 뒤에만 아래 (6-a) ROUTE invocation 확인에 사용한다는 절차를 명시해야 한다(추정 명칭을 그대로 신뢰하지 않음). `process-case-background`는 Background Function으로서 이미 파일명 자체가 진입점 이름이므로 별도의 함수 항목·별도의 invocation으로 명확히 구분되며 — 이 주의는 ROUTE invocation의 실제 대시보드 함수명 확인에만 적용되고, ROUTE/BACKGROUND 두 invocation으로 나눠 이벤트를 귀속시키는 아래 (6-a)/(6-b) 분류 자체(어느 이벤트가 어느 invocation에 속하는지)는 이번 개정에서 변경하지 않는다. **(6-a) ROUTE invocation 범위**(`app/api/cases/route.ts`, 이 스모크 요청이 실제로 호출한 정확한 invocation) 안에서: `case_request_received`(`route.ts:26`) 이벤트가 존재함을 확인(**양성 증거**)하고, 같은 ROUTE invocation 범위 안에서 `case_job_enqueue_failed`(`route.ts:62`)·`case_job_cancel_failed`(`route.ts:69`)·`case_job_create_lease_release_failed`(`create-case.ts:283`, `startCaseJob` 내부에서 동기 호출됨) 3개 이벤트가 전혀 관측되지 않음을 확인(**음성 증거**). **(6-b) BACKGROUND invocation 범위**(`netlify/functions/process-case-background.ts`, 이 스모크의 job을 처리한 정확한 invocation — ROUTE invocation과는 별개의 invocation ID) 안에서: `pipeline_stage_failed`(`lib/pipeline/index.ts:81,92`)·`case_job_status_update_failed`(`create-case.ts:476`)·`case_job_failed_lease_release_failed`(`create-case.ts:485`)·`case_job_failed`(`create-case.ts:491`) 4개 이벤트가 전혀 관측되지 않음을 확인(**음성 증거**). 위 8개 이벤트(ROUTE 4개 + BACKGROUND 4개)는 모두 **jobId·caseId 필드를 전혀 포함하지 않는다**(필드는 `event`/`timestamp`/`hasOwnerUserId`(일부)/safe-error-meta뿐) — 따라서 이 확인은 "동일 jobId/caseId 기준" 상관관계가 아니라 각 invocation의 격리된 로그 범위 안에서의 이벤트 존재/부재로만 판정하며, 신규 문서는 이 스모크를 다른 동시 활동 없이 격리된 시간창에서 수행한다는 절차 전제를 명시해야 한다. **주의(레거시 경로 구분)**: `pipeline_failed`/`completion_transaction_failed`/`post_failure_lease_release_failed`는 동기(sync) 레거시 함수 `createCase`(`lib/cases/create-case.ts:125-249`, 테스트·e2e 스펙 파일에서만 참조되고 현재 프로덕션 라우트에서는 호출되지 않음) 전용 이벤트이며, 프로덕션 비동기 경로의 판정 근거나 주요 실패 신호로 사용하지 않는다(역사적 맥락으로만 언급 가능); (7) (6-a)와 (6-b) 각 invocation 범위 확인을 모두 마쳐 위 7개 실패 이벤트(ROUTE 3개 + BACKGROUND 4개)가 어느 invocation에서도 전혀 관측되지 않았음을 종합 확인(**음성 증거 종합**) — 이 중 하나라도 관측되면 판정은 "주의사항이 있는 PASS"가 아니라 **즉시 중단·트리아지**(`.moai/docs/pilot-incident-runbook.md`로 라우팅)이며 전체 스모크를 중단한다; (8) 해당 사건에 대해 실제 Gemini 호출이 발생했고 결과가 반영됐는지 확인(REQ-PILOT-OPS-007의 하이브리드 라우팅에 따라 Lite·Premium 어느 쪽이 응답했는지는 무관). **이 체크리스트는 테넌트 격리를 검증하지 않는다** — 계정 1개로는 구조적으로 불가능하며, 테넌트 격리는 REQ-PILOT-OPS-005의 별도 게이트에서 검증한다. 추가로 스모크 데이터 정리(cleanup) 계약을 다음과 같이 구체적으로 기록해야 한다: (a) 매 스모크 실행마다 고유 스모크런 ID를 부여하고 그 실행이 건드린 정확한 사용자·사건·job 식별자를 기록한다("최근 N개 행" 같은 모호한 범위 지정 금지); (b) 정리 조사 범위는 `cases`/`reports`/`feedback`에 한정되지 않고 `case_jobs`, `gemini_request_observations`, 그리고 그 식별자에 연결된 `reservations`/리스 상태까지 포함한다; (c) 삭제 전 행 소유권과 정확한 대상 행(기록된 식별자 기준)을 확인한다 — `created_at > X` 같은 넓은 WHERE 스윕은 절대 금지; (d) FK/리스 관계를 지키는 안전한 의존성 순서로 삭제한 뒤, 그 식별자에 연결된 행이 0개 남았는지 확인하는 절차 자체를 계약의 일부로 명시한다(생략 불가); (e) 원격 DB 정리 작업은 `.moai/docs/pilot-incident-runbook.md` §4(한 시점에 한 사람만, 시작 라벨·종료 결과 통보)를 그대로 따른다고만 명시하고 재서술하지 않는다; (f) 어떤 경우에도 실제 파일럿 데이터에 대한 광범위/일괄 삭제는 금지하며, 정리 범위는 항상 스모크런 식별자에 한정한다(와일드카드 금지); (g) 사건마다 `case_jobs.leaseId`(DB 컬럼 `lease_id`)를 정확히 기록한다(jobId만으로는 불충분); (h) 정상 완료 후에는 같은 리스의 `reservations` 행이 더 이상 존재하지 않아야 하며 이를 확인 절차로 명시한다 — 같은 리스가 "정상 완료" 이후에도 여전히 존재한다면 이는 자동 PASS나 광범위/일괄 정리의 근거가 아니라 (7)과 같은 등급의 **즉시 중단·트리아지** 대상이다; (i) 삭제가 실제로 필요한 경우, `owner_user_id`와 `lease_id`가 모두 기록된 값과 일치할 때만, 그리고 그 소유자에 대한 새 활성 job이 없을 때만 삭제한다(`releaseLeaseFenced(db, ownerUserId, leaseId)`, `lib/cases/create-case.ts:119`, 161/230/279/481행 호출과 동일한 펜싱 조건) — 그 행에서 기록된 값과 다른 leaseId가 발견되면(`reservations`는 `ownerUserId`를 기본키로 하므로, 다른 leaseId는 반드시 같은 사용자의 더 새로운 유효 리스를 의미하며 — 다른 사람의 동시 리스일 수는 구조적으로 없다) 어떤 경우에도 삭제하지 않는다; (j) `gemini_request_observations` 행을 삭제하기 전에, 그 스모크 실행의 실제 모델별(Lite/Premium) 요청 횟수를 운영 기록(스모크런 기록, 코드 아님)에 먼저 남긴다 — 이 선기록은 REQ-PILOT-OPS-007(e)가 정의하는 일일 집계 절차(그날의 전체 시간창 `gemini_request_observed` 콘솔 로그를 호출 시도(call-attempt) 기준으로 삼고, `gemini_request_observations`(DB)는 그 집계에 대한 교차 대조 자료로만 사용하며 DB 행 수를 콘솔 로그 집계 위에 합산하지 않고, 이 선기록은 로그에서 이미 회전·삭제된 것으로 확인된 누락분에만 보충하는 절차)에 투입되는 여러 입력 중 하나로만 취급한다. `gemini_request_observations`의 이 행이 실제로 삭제되는지 여부는 일일 집계의 기준 출처를 콘솔 로그에서 DB로 전환하지 않는다 — 삭제는 정리(cleanup) 행정 작업일 뿐이며, 어느 출처가 권위 있는 기준 집계인지를 바꾸는 스위치가 아니다; (k) 위 (j)의 선기록-보충 절차는 `gemini_request_observations`에 대한 (d)의 0행 확인이 실제로 성공했을 때만 성립한다 — 그 스모크 실행의 식별자에 연결된 행이 삭제 후에도 하나라도 남아 있으면, (h)와 동일한 등급의 **즉시 중단·트리아지** 대상이며 결코 조용히 일일 집계에 포함되지 않는다. 이 경우 해당 스모크 실행에 대해 (j)가 선기록한 호출 횟수는 이 상태가 해소될 때까지 "있는 그대로" 일일 집계에 사용하지 않고 수동으로 재조정(reconcile)해야 한다 — 그렇지 않으면 그 남은 행이 향후 일일 교차 대조(cross-reference) 점검을 오염시키거나(스모크 데이터가 프로덕션 관측치처럼 섞임), 기본적인 cleanup 불변식조차 확인되지 않은 상태로 넘어가게 된다. 이 REQ는 체크리스트 **작성**만 요구하며, 이 SPEC의 plan-phase·run-phase 어느 쪽도 이 스모크를 실제로 실행하지 않는다. 실 jobId/caseId 로그 상관관계 필드를 로깅 코드에 추가하는 것은 이 SPEC의 범위가 아니다(Out of Scope 참고). | Read 조사 확인(`.moai/docs/pilot-incident-runbook.md` §1 이벤트 표·§4 단독 진행 원칙, README.md:35 "Netlify Background Function 비동기 분석 경로", product.md §3 6단계 파이프라인, product.md 핵심 원칙 4 "다른 테스터의 사건 데이터는 조회할 수 없다"); `lib/db/schema.ts`로 테이블명 재확인(`cases`/`reports`/`feedback`/`caseJobs`/`geminiRequestObservations`/`reservations` 모두 실존); 3차 개정에서 Grep 재확인: 로그 이벤트에 jobId/caseId 필드 부재(`app/api/cases/route.ts:26-29`, `lib/pipeline/index.ts:81,92`, `lib/cases/create-case.ts` 전체), `leaseId` 실존 및 `releaseLeaseFenced` 펜싱 메커니즘(`lib/db/schema.ts:148,156-161`, `lib/cases/create-case.ts:119-121,161,230,279,481`); 5차 개정에서 Grep/Read 재확인: `app/api/cases/route.ts:3`가 `cancelCaseJob, startCaseJob`을 임포트(`createCase` 아님), `createCase`(`create-case.ts:125-249`)는 `create-case.test.ts`·`capture-evidence*.spec.ts`에서만 참조되고 프로덕션 라우트에서 호출되지 않음, `startCaseJob`(`create-case.ts:250-296`)·`processCaseJob`(`create-case.ts:380-491`, `netlify/functions/process-case-background.ts:1,23`에서 호출)이 실제 프로덕션 비동기 경로, 7개 async 이벤트 각각의 소스 라인(`route.ts:26,62,69`, `create-case.ts:283,476,485,491`) |
| REQ-PILOT-OPS-005 | Ubiquitous | 신규 운영 문서에는 REQ-PILOT-OPS-004의 단일 계정 스모크와는 별도로, REQ-PILOT-OPS-006의 2단계 착수 **전**에 반드시 통과해야 하는 **테넌트 격리 확인 게이트**를 다음 구체적 절차로 기록해야 한다: (a) 먼저 각 계정이 **자기 자신의** 사건 목록·사건 상세에 정상 접근됨을 확인한다(양성 대조군, positive control — 이 확인 없이 (b)의 음성 결과만으로는 접근 자체가 애초에 안 되는 것인지 격리가 되는 것인지 구분할 수 없다); (b) 양방향으로 교차 계정 접근이 올바르게 실패함을 확인한다 — 다른 계정이 소유한 알려진 caseId로 사건 상세 URL에 접근하면 `notFound()`가 반환되고(`app/cases/[caseId]/page.tsx:143-146`의 `getCaseForOwner(caseId, session.user.id)`가 null을 반환해 Next.js 404-동등 페이지로 전이), 다른 계정이 소유한 알려진 jobId로 상태 API에 접근하면 `404` JSON이 반환됨을(`app/api/cases/status/route.ts:19,26`의 `and(eq(caseJobs.id, jobId), eq(caseJobs.ownerUserId, session.user.id))` 조건 조회) 각각 확인한다; (c) 계정 간 전환은 별도 브라우저 세션을 사용하거나, 같은 세션에서 전환할 경우 반드시 완전한 로그아웃/재로그인을 거쳐야 한다(세션 잔존으로 인한 위양성/위음성 방지); (d) 입력하는 사건은 합성이거나 이미 비식별화된 사례만 사용한다. 이 게이트는 최소 서로 다른 계정 **2개**(운영자 계정 + 첫 실제 외부 사용자 계정, 또는 아래 임시 계정 대안)로 수행한다. 문서는 두 경로를 모두 명시해야 한다: (a) 기본 경로 — 첫 실제 외부 실무자 계정이 발급될 때까지 이 게이트를 대기하며, 이 경로로 생성된 사건도 REQ-PILOT-OPS-006의 "10명×3건" 성공지표 집계에서 명시적으로 제외되고 정리(REQ-PILOT-OPS-004의 정리 계약과 동일한 기준 적용) 대상임을 문서에 기록해야 한다(2차 개정 당시에는 이 제외·정리 요구가 임시 계정 경로에만 명시돼 있었고 실제 외부 계정 경로에는 누락돼 있었다 — 이번 개정에서 두 경로 모두에 동일하게 적용); (b) 임시 계정 대안 경로 — 대기하지 않고 임시(throwaway) 계정을 사용할 경우, 그 계정을 (i) 어떻게 발급하는지, (ii) 검증 후 어떻게 정리(REQ-PILOT-OPS-004의 정리 계약과 동일한 기준 적용)하는지, (iii) 그 계정과 그 계정이 생성한 사건이 REQ-PILOT-OPS-006의 "10명×3건" 성공지표 집계에서 명시적으로 제외됨을 모두 문서에 기록해야 한다. | product.md 핵심 원칙 4 "다른 테스터의 사건 데이터는 조회할 수 없다"(구조적 요구사항의 근거); REQ-PILOT-OPS-004 D1 결함 수정(단일 계정으로 테넌트 격리 검증이 구조적으로 불가능하다는 재검토 결과); 5차 개정에서 Grep/Read 재확인: `app/cases/[caseId]/page.tsx:143-146`의 `getCaseForOwner`→`notFound()` 경로, `app/api/cases/status/route.ts:19,26`의 `ownerUserId` 스코프 쿼리→`404` JSON 경로 |

### D. 파일럿 운영 단계 분리 (Pilot Operation Stage Separation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-OPS-006 | Ubiquitous | 신규 운영 문서의 단계 분리 절에는 파일럿 운영을 다음 순서로 명시해야 한다: **1단계(운영자 단독)** — REQ-PILOT-OPS-004의 단일 계정 E2E 흐름 검증만 수행한다(테넌트 격리는 이 단계에서 검증하지 않는다); **테넌트 격리 게이트** — REQ-PILOT-OPS-005를 통과해야 2단계로 진행할 수 있다; **2단계(제한적 외부 검증)** — 외부 실무자 2~3명만 초대해 소수 사건으로 제한 검증한다; **3단계(전체 파일럿)** — 나머지 실무자를 포함해 집계 가능한 실제 실무자 최소 10명이 각자 최소 3건씩, 집계 가능한 완료 사이클 최소 30건을 수행한다(근사 표현 "내외"/"약"이 아닌 정밀 최소값 — REQ-PILOT-OPS-006 성공지표 집계 계약과 동일 기준). 각 단계 전환 조건, 중단(abort) 기준, 문의 채널(`zuge3927@naver.com`, `.moai/docs/pilot-incident-runbook.md` §3의 이경환 담당·1영업일 이내 1차 확인), 그리고 합성이거나 이미 비식별화된 사례만 입력하라는 기존 안내 문구(SPEC-PILOT-LAUNCH-001 REQ-PILOT-LAUNCH-003이 확정한 "합성이거나 이미 비식별화된 사례만 입력해 주세요" 표현 재사용, 신규 문구 작성 금지)를 명시해야 한다. **성공지표 집계 계약**도 명시적으로 기록해야 한다 — 성공 기준은 "실제 실무자 최소 10명, 각자 최소 3건의 완료된(`completed`) 리서치 사이클 + 제출된 구조화 피드백"이며: (a) 1단계 운영자 스모크 세션과 REQ-PILOT-OPS-005의 임시/검증 계정(임시 격리 확인 계정 포함)은 이 집계에 절대 자동 포함되지 않는다; (b) 2단계 참여자는 실무자 자격 기준을 충족하고 전체 사이클(제출→`completed`→피드백)을 완료한 경우에만 10명 목표에 집계된다 — 부분/미완료 사이클은 집계되지 않는다; (c) 이중 집계를 금지한다 — 앞선 단계에서 이미 집계된 사용자나 사건은 후속 단계에 참여하더라도 다시 집계하지 않는다. 신규 문서는 이 집계를 실제로 수행하는 **읽기 전용(read-only) 수동 집계 절차**도 구체적으로 기록해야 한다(신규 코드나 관리자 대시보드 구현은 여전히 Out of Scope — 이 절차는 사람이 직접 조회·기록하는 수작업 절차만 서술한다): 자격 확인이 끝난 실무자 명단을 기준으로, 각 사용자의 **서로 다른(distinct)** 완료(`completed`) caseId를 조회하고 각 caseId마다 구조화 피드백이 실제로 존재하는지 확인하며, 같은 사건에 대한 여러 리포트/피드백 항목을 중복 집계하지 않는다; 운영자 스모크 사건, REQ-PILOT-OPS-005의 격리 게이트 사건(임시 계정 경로와 실제 외부 계정 경로 둘 다), 그 밖의 임시/검증 계정은 모두 명시적으로 제외한다. 문서는 "실무자 × 완료 사건 수 × 피드백 존재 여부"(예: `practitioner_id`, `completed_case_count`, `feedback_present`) 형태의 구체적인 증거 표 형식을 명시해야 하며, 이 표만으로 "실무자 최소 10명이 각자 최소 3건" 통과/실패 여부를 판정할 수 있어야 한다. | Read 조사 확인(product.md "핵심 원칙" 9 "현직 실무자 10명 각각이 최소 3건의 사건 리서치 사이클을 완료"); SPEC-PILOT-LAUNCH-001 spec.md §2.C REQ-PILOT-LAUNCH-003 확정 문구; REQ-PILOT-OPS-004/005 D1/D3 결함 수정 결과 |

### E. Gemini 쿼터 운영 계획 (Gemini Quota Operating Plan)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-OPS-007 | Where | **Where** Gemini `gemini-3.6-flash`(Research/Premium) 모델의 일일 요청 한도가 적용되는 동안, 신규 운영 문서는 다음을 모두 명시해야 한다: (a) 20 RPD는 절대 상한(hard ceiling)이며 목표치가 아니다(출처: `.moai/reports/pilot-ready-quota-checklist-20260913.md`의 AI Studio 실측 한도 표 — `gemini-3.6-flash` RPD 실제 한도 20); (b) 2026-09-13 하이브리드 라우팅 도입 이후 모든 사건이 Premium 모델을 호출하지 않는다 — 일반 사건은 `gemini-3.5-flash-lite`(Fast/Lite)로 시작하고, 복합 쟁점 사건(`PRE_EXISTING_CONDITION`/`INJURY_DISEASE_RELATION`/`ADDITIONAL_CONFIRMATION_NEEDED`) 또는 Lite 결과가 품질 실패(Verifier `INSUFFICIENT` 등)한 사건만 Premium으로 1회 승격되며, 승격은 `pipeline_research_routed`/`pipeline_research_escalated` 구조화 로그로 남는다(출처: `.moai/reports/hybrid-research-routing-20260913.md`) — **따라서 사건 수 ≠ 모델 요청 수**이며, 문서는 이 등식을 어디에서도 전제하지 않는다; (c) 프로젝트의 기존 보수적 운영 목표는 Premium 모델 **호출 자체**(사건 수가 아님) 기준 재시도 여유를 포함해 **하루 15회 이내**이며, 이 값은 20 RPD 절대 상한과 구분해 둘 다 출처(`.moai/reports/pilot-ready-quota-checklist-20260913.md:58`)와 함께 명시한다; (d) 일일 예산에는 스모크 단계 호출, 승격(promotion) 호출, 429/503 재시도-백오프 호출, 실패 후 재제출 호출을 모두 포함해야 하며, 낙관적인 happy-path 건수만으로 예산을 세우지 않는다; (e) 구체적인 일일 절차를 명시해야 한다 — 매일 그날의 **전체 시간창(time-window) `gemini_request_observed` 콘솔 로그**(`lib/observability/gemini-fetch-observer.ts` — 6차 개정에서 재확인한 대로 성공 경로와 네트워크 예외 경로 양쪽 모두에서 남는다)를 **호출 시도(call-attempt) 기준**으로 사용해 그날의 호출 시도 수를 집계한다 — 이 로그는 예외로 끝난 호출까지 포함해 시도된 모든 호출을 담으므로, 성공적으로 저장된 것만 담는 DB보다 더 완전한 시도 기준이다. `gemini_request_observations`(DB)는 이 콘솔 로그 집계에 대한 **교차 대조(cross-reference) 자료**로만 사용하며, DB 행 수를 콘솔 로그 집계 위에 **합산하지 않는다** — 두 출처가 겹치는 성공 경로 호출을 이중 계산하게 되기 때문이다. REQ-PILOT-OPS-004(j)가 요구하는 스모크 선기록 호출은, 그 로그 라인이 이미 회전(rotation)·삭제(purge)돼 로그에 더 이상 남아 있지 않은 것으로 확인된 항목에 **한해서만** 콘솔 로그 집계에 추가한다(로그에 이미 나타나는 스모크 호출을 다시 더하는 것은 금지 — 이중 계산). `status: null`인 모든 네트워크 예외 관측치, 그리고 `gemini_observation_persist_failed`가 발생한 모든 관측치는 DB에 도달했는지와 무관하게 각각 **실제 호출 1건으로 보수적으로 집계**해야 한다(단지 DB에 반영되지 않았다는 이유로 "발생하지 않은 것"으로 취급하지 않는다)(이 값들은 이미 1단계의 로그 라인 집계에 포함돼 있으므로 별도로 추가 집계하지 않는다 — 이 요구사항은 로그 스캔에서 이들을 누락·제외하지 않도록 보장하기 위한 것이다) — 이는 6차/7차 개정의 지속성 한계 인정과는 별개의 신규 요구사항이다. 로그 보존·회전 정책, 콘솔 로그 자체의 갱신 지연, 또는 중복 제거(de-duplication) 불확실성 때문에 신뢰할 수 있는 호출 수를 확정할 수 없는 경우, "추적된 수치가 ≤15이니 진행한다"로 기본 설정하지 **않는다** — 정답은 그 불확실성이 해소될 때까지 신규 Premium 모델 배치 착수를 **중단/보류(abort/halt)**하는 것이며, 이는 직전 라운드 문구가 암시했던 것보다 더 엄격하고 보수적인 실패 모드다. 이 집계 결과를 (g)의 결정 규칙에 따라 처리한 결과로 다음 날 배치 규모를 결정 → 쿼터 소진에 연동된 중단(abort)/중지 기준을 명시한다. 이 절차는 REQ-PILOT-OPS-004(d)의 `gemini_request_observations` 0행 확인이 실제로 성공했다는 전제 위에서만 유효하다 — REQ-PILOT-OPS-004(k)에 따라, 어느 스모크 실행이든 이 확인이 실패(행 잔존)한 상태라면 그 실행의 선기록 호출 수치를 일일 합산에 그대로 포함하지 않고, 해소될 때까지 수동 재조정(reconcile) 대상으로 별도 표시해야 한다; (f) "하루"·"일일"이 실제로 의미하는 시작·종료 경계는 이 SPEC이 미리 가정하거나 하드코딩하지 않는다 — 신규 문서는 운영 시점에 AI Studio 콘솔(또는 그 시점의 공식 출처)에서 실제 일일 리셋 스케줄을 확인하는 절차를 명시하고, 확인된 경계를 UTC와 KST 두 표기로 함께 기록하며, 그 경계를 (e)가 정의하는 콘솔 로그 호출 시도 집계·확인된 로그-갭 스모크 보충·DB 교차 대조 세 요소 모두에 동일하게 적용하고, 매 배치 시작 직전 현재 사용량을 재확인해 Premium 15회/일 보수적 목표에 도달하면 승격 대상 신규 사건 투입을 중단한다는 절차를 명시해야 한다 — 리셋 시각을 SPEC 작성 시점에 추정·확정해 문서에 상수로 박아 넣는 것은 금지되며, 이는 계획 시점의 상수가 아니라 운영 시점의 확인 절차다; (g) **Gemini 관측 지속성 한계와 일일 사용량 판단 결정 규칙을 명시해야 한다** — `gemini_request_observations` 테이블은 전체 Gemini 호출을 빠짐없이 담보하지 않는다: 네트워크 예외로 끝난 호출은 `gemini_request_observed` 콘솔 로그(`lib/observability/gemini-fetch-observer.ts`, 성공 경로(67-73행)와 예외 경로(86-99행) 양쪽 모두에서 남는다)로만 기록되고, DB 저장 호출(`context.onObservation`, 같은 파일 75행)은 성공 경로에서만 호출되며 예외 경로에서는 전혀 호출되지 않으므로 네트워크 예외 호출은 DB에 결코 기록되지 않는다. DB 저장 자체도 독립적으로 실패할 수 있다 — `context.onObservation`은 자체 try/catch(같은 파일 74-84행)로 감싸여 있으며, 저장 실패는 기존에 실존하는 이벤트명 `gemini_observation_persist_failed`로 로깅될 뿐 관측치 자체는 유실된다. 따라서 신규 문서는 "DB 행 수 + 스모크 선기록 합계가 전체 사용량의 완전한 그림을 준다"고 전제하지 않는다는 점을 명시해야 한다. **AI Studio 콘솔을 지연 없는(lag-free) 실시간 원장으로 단정하지 않는다** — 이 SPEC은 AI Studio 콘솔 사용량 표시의 실제 운영 동작(실시간으로 표시되는지 여부, 어느 화면·어느 필드에 표시되는지, 표시값이 얼마나 최신인지/지연이 있는지)을 검증하지 않았으므로, 신규 문서는 이를 계획 시점에 가정하지 말고 **운영 시점에 실제로 확인**하고 그 확인 결과(어떤 화면·필드에서 무엇이 표시됐는지, 확인한 타임스탬프)를 기록하는 절차를 명시해야 한다. 그 확인 결과에 따라 다음 **결정 규칙**을 적용한다: **IF** AI Studio 사용량 표시가 실제로 확인 가능하고 그 갱신 지연(update-lag)이 파악돼 있다면 → 그 표시값을 일일 쿼터 판단의 **주(primary) 수치**로 사용한다. **IF** 그 표시를 확인할 수 없거나, 갱신 지연이 불명확·미확인 상태라면 → (e)에서 산출한 **콘솔 로그 기준 집계**(전체 시간창 `gemini_request_observed` 로그를 호출 시도 기준으로, DB는 교차 대조 자료로만, 로그에서 확인된 누락분만 스모크 선기록으로 보충, `status:null`·`gemini_observation_persist_failed`는 각 1건으로 보수 집계)를 기준으로, Premium **하루 15회 이내** 목표를 운영 제약으로 삼아 운영한다 — 단, (e)가 명시하는 대로 이 집계 자체가 로그 보존·회전, 갱신 지연, 중복 제거 불확실성으로 신뢰할 수 없는 상태라면 "≤15이니 진행"으로 기본 설정하지 않고 그 불확실성이 해소될 때까지 신규 Premium 배치 착수를 중단/보류한다. 이 결정 규칙과 무관하게, `gemini_observation_persist_failed`가 관측되거나 (AI Studio 표시값을 사용 중인 경우) 그 표시값과 내부 원장 사이에 불일치가 발견되면, 신규 배치 착수를 중단하거나 해소될 때까지 보수적 예약 태세(신규 승격 대상 사건 투입 축소)로 전환한다는 구체적 대응은 그대로 유지한다. (f)의 UTC/KST 운영 시점 확인 경계 계약은 이 항목 추가와 무관하게 그대로 유지한다; (h) **아키텍처 제약을 명시해야 한다** — 이 파일럿은 단일 Google Cloud 프로젝트·단일 `GEMINI_API_KEY`(`lib/env.ts:53`, `lib/ai/providers/gemini.ts:91`)만 사용하며, 프로젝트 전체에 다중 계정/다중 프로젝트 키 로테이션, 라운드로빈, 429 트리거 키 페일오버 패턴이 존재하지 않는다(전수 Grep 재확인 결과) — 신규 문서는 이런 다중 키 아키텍처를 파일럿 기간 중 명시적으로 금지한다고 기록해야 한다(현재 아키텍처와 일치하는 가드레일이며, 해소해야 할 결함이 아니라 범위 확장을 막는 명시적 제약이다). 이 REQ는 "≤20건/일" 같은 단순 사건 수 상한 표현만으로는 충족되지 않으며, 그런 프레이밍 자체가 2차 개정에서 수정한 결함이다. | Read 조사 확인(`.moai/reports/pilot-ready-quota-checklist-20260913.md` 전문 — 모델별 RPM/TPM/RPD 실측 표, §RPD 운영 제한과 하이브리드 후속 결정, 라인 58 보수적 운영 목표); `.moai/reports/hybrid-research-routing-20260913.md` 전문(승격 규칙 1-4, 구조화 로그 이벤트명, `gemini_request_observations` 실사용량 확인 출처); 6차 개정에서 코디네이터가 위임 전 직접 확인·이 세션이 재검증한 코드 근거: `lib/observability/gemini-fetch-observer.ts`(67-73행 성공 경로 콘솔 로그, 74-84행 `onObservation` try/catch 및 `gemini_observation_persist_failed`, 86-99행 예외 경로 콘솔 로그·DB 미저장), `lib/observability/gemini-observation-store.ts`(10-17행 단순 insert), `lib/env.ts:53`·`lib/ai/providers/gemini.ts:91`(단일 `GEMINI_API_KEY`, 다중 키/로테이션/페일오버 패턴 프로젝트 전체 Grep 재확인 결과 부재) |

### 확인 사항 해소 기록 (Resolved Clarification — 상세는 plan.md §C)

Netlify 프로덕션 배포의 정확한 URL과 배포 SHA는 SPEC-PILOT-LAUNCH-001의
plan-phase 3차 개정과 종결 시점까지 미해결로 남았던 항목이었으나, 1차 개정
라운드에서 사용자가 Netlify 대시보드를 직접 확인해 두 값(URL
`https://musical-macaron-82feb3.netlify.app`, SHA
`381e38d6c88f77c4281ebb4007fb46475cce426b` — 2차 개정 시점에도 main HEAD와
일치)을 제공함으로써 해소됐다. 이 값들은 "이번 개정 시점 기준"이며 main에 새
커밋이 push되면 전진하는 값이지, 영구 고정 pin이 아니다. 이 세션도 GitHub
commit-status/deployments API로는 여전히 독립 검증할 수단이 없으며
(SPEC-PILOT-LAUNCH-001에서 이미 관찰된 것과 동일한 무신호 패턴), 이 한계 자체는
계속 정확히 기록한다 — "사용자 직접 확인"과 "API 독립 검증"은 별개의 사실이다.
상세 해소 기록·근거는 `plan.md` §C를 참고한다. REQ-PILOT-OPS-002는 이 확정된
값과 위 한계를 모두 정확히 반영하도록 README.md/product.md를 갱신할 것을
요구한다.

## Out of Scope

### Out of Scope — 실 계정 발급·실 배포·실 Gemini 호출·실 스모크·실제 단계 착수

- 이 SPEC의 plan-phase 및 run-phase 모두 `pnpm tester:add`를 실행하거나, 원격 DB에
  계정 행을 쓰거나, Gemini API를 호출하거나, REQ-PILOT-OPS-004의 스모크
  체크리스트나 REQ-PILOT-OPS-005의 테넌트 격리 게이트를 실제로 수행하거나,
  REQ-PILOT-OPS-006의 3단계 중 어느 하나라도 실제로 착수하지 않는다 — 모든
  REQ는 **계획·문서화**만 요구한다.

### Out of Scope — 로그 jobId/caseId 상관관계 필드 추가

- 현재 로그 이벤트 — **실제 async 프로덕션 이벤트**(`case_request_received`/
  `case_job_enqueue_failed`/`case_job_cancel_failed`/
  `case_job_create_lease_release_failed`/`pipeline_stage_failed`/
  `case_job_status_update_failed`/`case_job_failed_lease_release_failed`/
  `case_job_failed`)와 **sync legacy 이벤트(미사용, 역사적 맥락만)**
  (`pipeline_failed`/`completion_transaction_failed`/
  `post_failure_lease_release_failed`) 양쪽 모두 — 에 jobId나 caseId 필드를
  추가해 스모크 로그를 사건 단위로 직접 상관관계 지을 수 있게 하는 로깅 코드
  변경은 이 SPEC의 범위가 아니다. 3차 개정에서 이 SPEC은 REQ-PILOT-OPS-004의
  스모크 판정을 격리된 시간창·invocation 범위 기준으로 재정의해 이 필드
  부재를 우회했다 — 만약 향후 실제 jobId 단위 로그 상관관계가 꼭 필요하다고
  판단되면, 그것은 이 SPEC이 아니라 명명된 별도 후속 SPEC 후보로 다뤄야 한다
  (이번 SPEC은 그 SPEC을 생성하지 않는다).

### Out of Scope — `app/api/cases/route.ts` 구 TTL 주석 정정

- `app/api/cases/route.ts:12-13`의 주석은 다음 내용을 그대로 담고 있다(원문
  요지): "route segment의 실행 시간 상한을 300초로 명시한다. lib/cases/
  create-case.ts 의 LEASE_TTL_SECONDS(최소 330초)는 이 상한보다 충분히 길게
  (약 30초 안전...". 이 `LEASE_TTL_SECONDS`(330초)는 미사용 동기 경로
  `createCase`(`lib/cases/create-case.ts:125-249`, 위 Out of Scope 항목이
  이미 명시한 "sync legacy 이벤트" 전용 함수) 전용 상수이며, 실제 async
  경로가 실제로 쓰는 `BACKGROUND_LEASE_TTL_SECONDS`(960초,
  `lib/cases/job-timing.ts:12`)와 불일치한다 — 6차 개정에서 코디네이터가
  위임 전 직접 재확인해 확정한 실제 코드 주석 결함(code-comment debt)이다.
  이 SPEC은 문서 전용(documentation-only) SPEC이며 코드를 일절 변경하지
  않으므로, 이 주석 자체를 정정하는 것은 이 SPEC의 범위가 아니다 — 향후
  코드를 다루는 별도 SPEC으로 이연한다(이번 SPEC은 그 SPEC을 생성하지
  않는다). 이 기록은 결함을 알고도 조용히 방치하는 것이 아니라, 알려진
  채로 명시적으로 이연했음을 남기기 위한 것이다.

### Out of Scope — 실 Gemini 코퍼스 품질 평가

- 대표성 있는 사례 표본에 대해 실제 Gemini로 코퍼스 품질을 평가하는 작업(예:
  `counterEvidenceIds`가 항상 빈 배열인 현상의 원인 규명)은 이 SPEC의 범위가
  아니다. product.md §Roadmap이 이미 "파일럿 실측 데이터 확보 이후" 1순위 후속
  작업으로 명시한 항목이며, 파일럿(이 SPEC이 계획하는 3단계)이 실제로 진행되어
  데이터가 쌓인 뒤에 별도 SPEC으로 착수해야 한다. 이번 SPEC은 그 SPEC을 생성하지
  않는다.

### Out of Scope — 사용자별 완료/피드백 집계 대시보드

- ①의 데이터를 바탕으로 완료 현황·피드백 집계를 보여주는 관리자 뷰는 이 SPEC의
  범위가 아니다(product.md §Roadmap 2순위 후속 작업).

### Out of Scope — Gold Dataset 추출·집계 도구

- 원시 피드백 행을 실제 골드 데이터셋으로 추출·가공하는 도구는 이 SPEC의 범위가
  아니다 — SPEC-FEEDBACK-001에서 이미 후속 SPEC으로 명시적으로 미뤄진 항목이며
  (product.md §Roadmap 3순위), 이번 SPEC에서도 신규 SPEC을 생성하지 않는다.

### Out of Scope — 로그인 rate-limiting·계정 비활성화·비밀번호 재설정

- 프로덕션 수준 인증 하드닝(로그인 시도 rate-limiting), 계정 비활성화, 비밀번호
  재설정 기능은 이 SPEC의 범위가 아니다. SPEC-PILOT-LAUNCH-001이 이미 계정
  비활성화·비밀번호 재설정에 대해 최소 설계 스케치를 Out of Scope로 남겨두었다
  (SPEC-PILOT-LAUNCH-001 §Out of Scope 참고) — 이 SPEC은 그 스케치를 반복하지
  않으며, 실제 파일럿 운영 중 필요성이 데이터로 확인된 뒤에만 별도 SPEC 착수
  여부를 판단한다.

### Out of Scope — 신규 SPEC 생성

- 위 "로그 jobId/caseId 상관관계 필드 추가"(`route.ts` 구 TTL 주석 정정 포함,
  6차 개정에서 신설)를 포함한 **6개** Out of Scope 항목("실 계정 발급·실
  배포..." 항목과 이 요약 항목 자체는 이 집계에서 제외) 모두, 이 SPEC의
  plan-phase는 해당 후속 SPEC을 실제로 생성(가칭 SPEC ID 부여 포함)하지
  않는다 — 필요성 확인 후 별도 `/moai plan` 호출로 착수한다.

## §3. 인수 조건 (Acceptance Criteria — Tier S, 본 문서 인라인)

| AC | Given | When | Then |
|----|-------|------|------|
| AC-PILOT-OPS-001a | README.md가 아직 "11개 SPEC" 표기와 SPEC-PILOT-LAUNCH-001 완료 미반영 상태일 때 | README.md의 헤딩(§ REQ-PILOT-OPS-001(a)), 본문(REQ-PILOT-OPS-001(b)), "다음 단계" 절(REQ-PILOT-OPS-001(c))을 편집하면 | README.md 전체에서 "12개 SPEC"·"SPEC-PILOT-LAUNCH-001"이 일관되게 나타나고, "11개 SPEC" 잔존 표기가 남아있지 않아야 한다(grep으로 검증 가능) |
| AC-PILOT-OPS-001b | `.moai/project/product.md`가 아직 "11개 SPEC" 표기 상태일 때 | product.md의 최종 수정 표기와 §Roadmap "구현 완료" 목록(REQ-PILOT-OPS-001(d))을 편집하면 | product.md 전체에서 "12개 SPEC"·"SPEC-PILOT-LAUNCH-001"이 일관되게 나타나고, "11개 SPEC" 잔존 표기가 남아있지 않아야 한다 |
| AC-PILOT-OPS-002 | README.md/product.md의 Netlify 배포 서술이 "배포 여부 자체가 미결정"이라는 구식 문구를 담고 있을 때 | REQ-PILOT-OPS-002에 따라 재서술하면 | 두 문서 모두 확정된 URL(`https://musical-macaron-82feb3.netlify.app`, 스킴 포함)·SHA(`381e38d`)를 "이 시점 기준" 값으로 명시하고, 동시에 "GitHub API로는 독립 검증이 여전히 불가능하다"는 한계를 구분해 기술해야 하며, 어느 쪽 서술도 URL·SHA를 영구 고정 pin으로 단정하지 않아야 한다 |
| AC-PILOT-OPS-003 | `.moai/docs/pilot-ops-launch-plan.md`가 아직 존재하지 않을 때 | REQ-PILOT-OPS-003에 따라 계정 발급 절을 작성하면 | 해당 절에 운영자 계정 후보(`zuge3927@naver.com`), `account-provisioning.md` 참조, 발급 전 Turso 호스트 확인 문구, 발급 후 로그인 검증 문구, "실 계정 미발급" 명시가 모두 존재해야 한다 |
| AC-PILOT-OPS-004 | 같은 신규 문서에 단일 계정 스모크 체크리스트 절이 아직 없을 때 | REQ-PILOT-OPS-004에 따라 작성하면 | 8개 확인 항목(로그인·202·completed 전이·저장/재조회·피드백·ROUTE/BACKGROUND 두 invocation 범위 기준 `case_request_received` 존재 및 7개 async 실패 이벤트(ROUTE 범위 3개: `case_job_enqueue_failed`·`case_job_cancel_failed`·`case_job_create_lease_release_failed`; BACKGROUND 범위 4개: `pipeline_stage_failed`·`case_job_status_update_failed`·`case_job_failed_lease_release_failed`·`case_job_failed`) 부재·Gemini 호출 확인)이 순서대로 모두 존재하고, `route.ts`(Next.js API route)와 `process-case-background.ts`(Background Function)가 서로 다른 두 개의 Netlify function invocation(별도 로그 스트림·invocation ID)이며 각 invocation의 로그 범위가 별도로 기록됨이 명시되고, 스모크 실행 **전에** 운영자가 실제 Netlify 대시보드에서 `POST /api/cases`를 처리하는 함수의 실제 표시 이름·invocation ID를 먼저 확인·기록한 뒤에만 ROUTE invocation 확인에 사용한다는 사전 확인 절차가 명시되며(소스 파일 경로 이름이 대시보드 표시명과 같다고 단정하지 않음), 로그 판정이 "동일 jobId/caseId 기준" 상관관계가 아니라 각 invocation의 격리된 로그 범위 기준임이 명시되며, `pipeline_failed`/`completion_transaction_failed`/`post_failure_lease_release_failed`가 동기 레거시 `createCase` 전용이며 프로덕션 비동기 경로 판정 근거가 아니라는 구분이 명시되고, 실패 이벤트 관측 시 "즉시 중단·트리아지"라는 단일 판정 규칙이 명시돼 있으며, cleanup 계약 11개 항목(a~k — 스모크런 ID+식별자 기록, 6개 테이블 범위, 소유권·대상 확인, 안전 순서 삭제+0행 확인, 런북 §4 참조, 광범위 삭제 금지, `leaseId` 기록, 정상 완료 후 리스 부재 확인(존재 시 즉시 중단·트리아지), ownerUserId+leaseId 이중 일치 펜싱 삭제(다른 leaseId 절대 미삭제 — 다른 leaseId는 같은 사용자의 더 새로운 유효 리스를 의미), `gemini_request_observations` 삭제 전 호출 횟수 선기록, `gemini_request_observations` 0행 확인 실패 시 즉시 중단·트리아지 + 해당 스모크 실행 선기록 수치의 수동 재조정 요구)이 모두 존재해야 한다 |
| AC-PILOT-OPS-005 | 같은 신규 문서에 테넌트 격리 게이트 절이 아직 없을 때 | REQ-PILOT-OPS-005에 따라 작성하면 | 최소 계정 2개 요구사항, 4단계 구체 절차(자기 계정 양성 대조군 확인, `notFound()`/`404` JSON 양방향 교차 계정 확인 각각 코드 위치 인용, 별도 세션 또는 완전 로그아웃/재로그인, 합성·비식별화 사례만 사용), 기본 경로(첫 실제 외부 계정 대기 — 이 경로의 게이트 사건도 집계 제외·정리 대상임을 명시)와 임시 계정 대안 경로(발급·정리·집계제외 3가지 모두 명시) 모두 존재해야 한다 |
| AC-PILOT-OPS-006 | 같은 신규 문서에 3단계 분리 절이 아직 없을 때 | REQ-PILOT-OPS-006에 따라 작성하면 | 1단계→격리 게이트→2단계→3단계 순서, 전환/중단 기준, 문의 채널, 기존 PII 안내 문구 재사용, "집계 가능한 실무자 최소 10명·집계 가능한 완료 사이클 최소 30건"이라는 정밀 최소값 표현(근사 표현 "내외"/"약" 잔존 금지), 성공지표 집계 계약 3개 항목(운영자·임시/격리 게이트 계정 자동 제외, 부분 사이클 미집계, 이중 집계 금지), 그리고 "실무자 × 완료 사건 수 × 피드백 존재 여부" 형태의 구체적 증거 표 형식을 포함하는 읽기 전용 수동 집계 절차가 모두 명시돼 있어야 한다 |
| AC-PILOT-OPS-007 | 같은 신규 문서에 Gemini 쿼터 운영 절이 아직 없거나 "사건 수 ≤ 20건/일"로만 서술돼 있을 때 | REQ-PILOT-OPS-007에 따라 작성하면 | 20 RPD 절대 상한과 15회/일 보수적 운영 목표가 각각 출처와 함께 구분 서술되고, "사건 수 ≠ 모델 요청 수" 설명과 하이브리드 라우팅 승격 규칙이 존재하며, 일일 예산에 스모크·승격·재시도·재제출 호출이 모두 포함되고, 그날의 **전체 시간창 `gemini_request_observed` 콘솔 로그**를 호출 시도(call-attempt) 기준으로 집계하고, `gemini_request_observations`(DB)는 그 집계에 대한 교차 대조 자료로만 사용(DB 행 수를 콘솔 로그 집계 위에 합산하지 않음)하며, REQ-PILOT-OPS-004(j)의 삭제-전-기록 스모크 호출은 로그에서 이미 회전·삭제된 것으로 확인된 누락분에만 보충하고, `status:null` 관측치와 `gemini_observation_persist_failed` 이벤트는 각각 실제 호출 1건으로 보수적으로 집계하며(이 값들은 이미 1단계의 로그 라인 집계에 포함돼 있으므로 별도로 추가 집계하지 않는다는 점, 즉 로그 스캔에서 누락·제외하지 않기 위한 요구사항이라는 점이 명시돼 있어야 하며), 로그 보존·회전·갱신 지연·중복 제거 불확실성으로 신뢰할 수 있는 수를 확정할 수 없을 때는 "≤15이니 진행"으로 기본 설정하지 않고 그 불확실성이 해소될 때까지 신규 Premium 배치 착수를 중단/보류한다는 **콘솔 로그 기준 관측치 산출**(그날 실제 총 호출 수를 담보하는 최종 수치가 아님을 명시)의 일일 점검→배치 결정→중단 기준 구체 절차가 존재하고, REQ-PILOT-OPS-004(k)의 0행 확인 실패 시 그 실행의 선기록 수치를 일일 합산에 그대로 포함하지 않고 수동 재조정 대상으로 표시한다는 조건이 명시돼 있으며, "하루"의 시작·종료 경계를 SPEC 작성 시점에 추정·하드코딩하지 않고 운영 시점에 AI Studio 콘솔(또는 그 시점의 공식 출처)에서 확인해 UTC·KST 두 표기로 기록하고 그 경계를 콘솔 로그 호출 시도 집계·확인된 로그-갭 스모크 보충·DB 교차 대조 세 요소 모두에 동일 적용한다는 절차가 명시돼 있어야 하며, 네트워크 예외 호출이 콘솔 로그에만 남고 DB에는 저장되지 않는다는 지속성 한계와 DB 저장 자체의 독립 실패 가능성(`gemini_observation_persist_failed`)이 명시되고 "DB 행 수 + 스모크 선기록 = 전체 사용량의 완전한 그림"이라는 전제를 부정하며, AI Studio 콘솔을 지연 없는 실시간 원장으로 단정하지 않고 그 실제 운영 동작(실시간 표시 여부·화면/필드·지연)을 운영 시점에 확인·기록하는 절차와 그 결과에 따른 결정 규칙(확인 가능 + 지연 파악 시 AI Studio 표시값을 주 수치로, 확인 불가 또는 지연 불명확 시 위 콘솔 로그 기준 집계를 Premium ≤15회/일 제약 기준으로 운영하되 그 집계 자체가 불확실하면 배치 중단/보류)이 명시되고, `gemini_observation_persist_failed` 관측 또는 (AI Studio 표시값 사용 시) 표시값-내부 원장 불일치 시 배치 중단/보수적 예약 태세 전환이라는 구체 대응이 명시돼 있어야 하고, 단일 Google Cloud 프로젝트·단일 `GEMINI_API_KEY` 아키텍처 제약(다중 계정/키 로테이션/페일오버 명시적 금지)이 명시돼 있어야 한다 — "≤20건/일" 단독 서술만으로는 PASS하지 않는다 |

## §4. 교차 참조

- SPEC-PILOT-READY-001 — 이 SPEC이 전제하는 배포 준비·운영 검증 SPEC(호스팅, 동시성 가드, 로깅, 런북, 데이터 취급 고지 상속)
- SPEC-PILOT-LAUNCH-001 — 이 SPEC이 반영하는 문구 정리·계정 발급 절차 문서화 SPEC(README/product.md 현행화 대상, account-provisioning.md 원본 출처, 배포 URL·SHA 미해결 항목의 최초 출처 — plan.md §C에서 해소)
- `.moai/docs/account-provisioning.md` — 계정 발급 절차의 SSOT(이 SPEC은 참조만 하며 대체하지 않음)
- `.moai/docs/pilot-incident-runbook.md` — 파일럿 운영 중 장애 대응 절차(triage 담당자·로그 이벤트 표·§4 원격 DB 단독 진행 원칙의 출처; 5차 개정에서 §1 이벤트 표·§2 TTL 서술을 실제 async 경로에 맞춰 이 SPEC이 직접 편집하는 대상으로 전환하고 plan-phase 중 선반영(pre-applied)함 — run-phase는 이 내용을 재작성하지 않고 보존 여부만 검증한다, plan.md §D 참고)
- `.moai/reports/pilot-ready-quota-checklist-20260913.md` — Gemini 쿼터 실측 한도·보수적 운영 목표의 출처
- `.moai/reports/hybrid-research-routing-20260913.md` — 하이브리드 라우팅 승격 규칙·구조화 로그 이벤트명의 출처
- `app/api/cases/route.ts`, `lib/pipeline/index.ts`, `lib/cases/create-case.ts` — 3차 개정에서 재확인한 로그 이벤트 실제 필드(jobId/caseId 필드 부재)의 출처(읽기 전용 재확인만 수행, 이 SPEC은 변경하지 않음)
- `lib/db/schema.ts`, `lib/cases/create-case.ts` (`releaseLeaseFenced`) — 3차 개정에서 재확인한 실제 `leaseId` 컬럼과 ownerUserId+leaseId 펜싱 메커니즘의 출처
- `netlify/functions/process-case-background.ts`, `lib/cases/job-timing.ts`, `app/cases/[caseId]/page.tsx`, `app/api/cases/status/route.ts` — 5차 개정에서 재확인한 실제 프로덕션 비동기 경로(`startCaseJob`→`processCaseJob`), TTL/폴링 상수(`BACKGROUND_LEASE_TTL_SECONDS`=960, `CLIENT_POLL_SAFETY_MARGIN_SECONDS`=60), 테넌트 격리 메커니즘(`getCaseForOwner`→`notFound()`, `ownerUserId` 스코프 쿼리→`404`)의 출처(읽기 전용 재확인만 수행, 이 SPEC은 변경하지 않음)
- `lib/observability/gemini-fetch-observer.ts`, `lib/observability/gemini-observation-store.ts` — 6차 개정에서 재확인한 Gemini 관측 지속성 한계(성공/예외 콘솔 로그 이중 경로, DB 저장은 성공 경로 한정, `gemini_observation_persist_failed`)의 출처(읽기 전용 재확인만 수행, 이 SPEC은 변경하지 않음)
- `lib/env.ts`, `lib/ai/providers/gemini.ts` — 6차 개정에서 재확인한 단일 `GEMINI_API_KEY` 아키텍처(다중 계정/로테이션/페일오버 패턴 부재)의 출처(읽기 전용 재확인만 수행, 이 SPEC은 변경하지 않음)
- SPEC-FEEDBACK-001 — Gold Dataset 추출·집계가 이미 후속 SPEC으로 명시적으로 미뤄진 근거
