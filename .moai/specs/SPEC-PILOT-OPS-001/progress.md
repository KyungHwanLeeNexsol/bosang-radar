# SPEC-PILOT-OPS-001 진행 상황

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready
- plan_complete_at: 2026-09-15
- tier: S
- artifact_set: spec.md, plan.md (acceptance.md 없음 — AC는 spec.md §3에 인라인), progress.md, `.moai/docs/pilot-incident-runbook.md`(5차 개정부터 이 SPEC이 plan-phase 중 직접 편집·선반영 — §E.1 5차/6차 개정 기록 참고. README.md/`.moai/project/product.md`/신규 문서 `.moai/docs/pilot-ops-launch-plan.md`는 이 SPEC 자신의 plan-phase 산출물이 아니라 run-phase에서 편집될 **대상 파일**이므로 이 artifact_set에는 포함하지 않음 — 대상 파일 전체 목록은 spec.md §1 영향 파일 절 참고)
- 요약: README.md/product.md 문서 현행화(11→12개 SPEC, 배포 URL·SHA 확정값
  반영 — 아래 참고), 계정 발급 절차 계획, 단일 계정 스모크 체크리스트, 테넌트
  격리 게이트, 3단계 롤아웃 + 성공지표 집계 계약, Gemini 쿼터 운영 계획을
  신규 문서 `.moai/docs/pilot-ops-launch-plan.md` 1건에 담는 7개 REQ
  (REQ-PILOT-OPS-001~007) / 8개 AC로 구성(Tier S AC 상한 정확히 도달). 코드·
  테스트·실 배포·실 계정 발급·실 Gemini 호출 없음.
- 1차 개정 라운드 기록(2026-09-15, plan-auditor D1/D2 반영): (1) 사용자가
  Netlify 대시보드를 직접 확인해 프로덕션 URL
  (`https://musical-macaron-82feb3.netlify.app`)과 배포 SHA
  (`381e38d6c88f77c4281ebb4007fb46475cce426b`)를 제공, plan.md §C에 해소
  기록으로 반영하고 spec.md REQ-PILOT-OPS-001/002·AC-PILOT-OPS-002에 전파함 —
  상세는 plan.md §C 참고. (2) spec.md/progress.md의 "REQ 4개" 표기 오류를
  "REQ 6개(REQ-PILOT-OPS-001~006, 이후 2차 개정에서 7개로 재조정)"로 정정.
  (3) 이번 개정 작업 중 `git log`로 관찰: main에 새 커밋 `381e38d`("로그인
  페이지 랜딩 링크 제거, 로그인 실패 메시지 한글화", 작성자
  kyunghwan/zuge3927@naver.com, `app/login/*` 한정)가 직접 push되어 main을 이
  SHA로 전진시켰다 — 이 커밋이 현재 프로덕션에 반영된 배포 SHA다. 이 SPEC의
  영향 파일(README.md, product.md, 신규 운영 문서)과 겹치지 않아 충돌은
  아니며, 출처 기록 목적으로만 남긴다.
- 2차 개정 라운드 기록(2026-09-15, plan-auditor 재감사 D1~D6 반영 — 점수는
  `.moai/reports/plan-audit/SPEC-PILOT-OPS-001-review-2.md` 참고, 이 세션은
  그 파일을 직접 작성하지 않음): (1) REQ-004(계정 수 모순, 당시)를 8항목
  단일 계정 스모크로 재정의하고 테넌트 격리를 신규 REQ-PILOT-OPS-005 게이트로
  분리. (2) REQ-006(Gemini 쿼터, 당시)을 하이브리드 라우팅 실제 동작(사건 수
  ≠ Premium 모델 요청 수, 20 RPD 절대 상한 vs 15회/일 보수적 목표 구분,
  `.moai/reports/pilot-ready-quota-checklist-20260913.md`·
  `.moai/reports/hybrid-research-routing-20260913.md` 재확인 근거)에 맞춰
  REQ-PILOT-OPS-007로 재작성. (3) REQ-PILOT-OPS-006(3단계, 재번호)에 성공지표
  집계 계약(운영자/임시 계정 자동 제외, 부분 사이클 미집계, 이중 집계 금지)
  추가. (4) REQ-PILOT-OPS-004에 스모크 PASS/abort 판정 이중 기준(양성/음성
  로그 증거) 추가. (5) REQ-PILOT-OPS-004 cleanup 계약을 6개 항목으로 구체화
  (`lib/db/schema.ts` 재확인 — `cases`/`reports`/`feedback`/`caseJobs`/
  `geminiRequestObservations`/`reservations` 모두 실존). (6) HISTORY/WHAT/
  plan.md §A.2·§G의 URL·SHA 잔존 미해결 서술을 전수 정정하고, URL 표기를
  스킴 포함 `https://musical-macaron-82feb3.netlify.app` 형태로 통일. REQ
  7개(REQ-PILOT-OPS-001~007)/AC 8개로 재구성(둘 다 Tier S 상한 이내 또는
  정확히 도달).
- 3차 개정 라운드 기록(2026-09-15, 오케스트레이터가 위임 전 직접 Grep으로
  재확인한 코드 근거 2건 반영): (1) 로그 이벤트(`app/api/cases/route.ts:26-29`,
  `lib/pipeline/index.ts:81,92`, `lib/cases/create-case.ts` 전체)에 jobId·
  caseId 필드가 전혀 없음을 재확인해, REQ-PILOT-OPS-004의 스모크 판정을
  "동일 jobId/caseId 기준"에서 "격리된 시간창·invocation 범위 기준"으로
  정정(신규 로깅 필드 추가는 Out of Scope로 명명만). (2) `leaseId`가
  `reservations`/`caseJobs` 양쪽에 실제 `lease_id` 컬럼으로 존재하고
  `releaseLeaseFenced(db, ownerUserId, leaseId)`가 둘 다 일치할 때만
  해제함을 재확인해(`lib/db/schema.ts:148,156-161`,
  `lib/cases/create-case.ts:119-121,161,230,279,481`), REQ-PILOT-OPS-004
  정리 계약에 leaseId 기록·정상완료후 리스부재확인(존재시 즉시 중단·
  트리아지)·ownerUserId+leaseId 이중일치 펜싱삭제(다른 leaseId 절대 미삭제)
  3개 조건을 추가. (3) `gemini_request_observations` 삭제와 REQ-PILOT-OPS-007
  쿼터 집계의 충돌을 발견해 삭제 전 호출 횟수 선기록 + 스모크런 ID·
  타임스탬프 범위 기준 결합 규칙을 REQ-PILOT-OPS-004(j)/REQ-PILOT-OPS-007(e)
  양쪽에 추가. (4) REQ-PILOT-OPS-006의 "10명 내외·약 30건" 근사 표현을
  "최소 10명·최소 30건" 정밀 표현으로 정정. (5) plan.md §E 자체 검증 표에
  헤딩 존재가 아닌 실제 내용(시간창 기준·리스 펜싱·삭제-쿼터 결합·정밀
  최소값·20RPD/15회 구분)을 확인하는 grep 행 5개 추가. REQ/AC 개수는
  변경 없음(REQ 7개, AC 8개 — 기존 REQ 본문 내용만 정정·구체화).
- 4차 개정 라운드 기록(2026-09-15, plan-auditor iteration-4 스트레스 테스트가
  발견한 결함 D-new-1 1건 수정 — D-new-2/D-new-3은 논블로킹 정보성 항목으로
  이번 라운드에서 손대지 않음): REQ-PILOT-OPS-004(j)의 "이중 계산·누락 방지"
  결합 규칙이 gemini_request_observations 삭제(항목 (j))가 항상 완전히
  성공한다는 암묵적 전제에 의존하고 있었음을 발견 — 항목 (d)의 범용 "0행
  확인"은 6개 cleanup 테이블 전체에 적용되지만 이 테이블 실패에는 항목
  (h)와 같은 명시된 결과가 없었다. 수정: REQ-PILOT-OPS-004에 (k) 절 신설(0행
  확인 실패 시 (h)와 동일 등급의 즉시 중단·트리아지 + 해당 스모크 실행의
  선기록 호출 수치를 수동 재조정 대상으로 표시) — REQ-PILOT-OPS-007(e)에
  동기화하고 AC-PILOT-OPS-004(cleanup 계약 10개→11개 항목 a~k)·
  AC-PILOT-OPS-007도 갱신. REQ 7개/AC 8개 그대로(내용만 정정). plan.md는
  이번 라운드에서 변경하지 않음(§E 자체 검증 표는 3차 개정에서 이미 삭제-
  쿼터 결합 규칙을 다루는 grep 행을 보유 — (k) 절은 그 결합 규칙의 실패
  조건을 구체화한 것으로 별도 표 행 추가 불필요로 판단).
- 5차 개정 라운드 기록(2026-09-15, 오케스트레이터가 위임 전 Grep/Read로 직접
  재확인한 코드 근거 5건 반영): (1) REQ-PILOT-OPS-004의 스모크 판정 근거를
  실제 프로덕션 async 경로(`route.ts`의 `startCaseJob`→
  `process-case-background.ts`→`processCaseJob`)로 정정 — 음성 증거를 기존
  3개(그중 2개는 실제 호출되지 않는 동기 레거시 `createCase` 전용)에서 실제
  async 경로 7개 이벤트로 교체하고 레거시 이벤트는 역사적 맥락으로만 구분.
  `.moai/docs/pilot-incident-runbook.md`를 영향 파일에 추가(3개→4개, Tier S
  유지)하고 §1 이벤트 표·§2 TTL 서술을 실제 값(960초/1020초, 구 "330초"는 미사용
  동기 경로 상수였음)으로 정정. (2) REQ-PILOT-OPS-005를 4단계 구체 절차(양성
  대조군→`notFound()`/`404` 양방향 확인→세션 분리·재로그인→합성 사례만 사용)로
  재작성하고 실제 외부 계정 경로 격리 게이트 사건도 집계 제외·정리 대상임을
  명시(기존엔 임시 계정 경로에만 명시). (3) REQ-PILOT-OPS-007에 (f) 절 신설 —
  일일 리셋 경계를 SPEC 작성 시점에 하드코딩하지 않고 운영 시점에 확인하는
  절차. (4) REQ-PILOT-OPS-006에 실무자×완료 사건 수×피드백 존재 여부 증거
  표 형식을 포함한 읽기 전용 수동 집계 절차 추가. (5) REQ-004(i)의 "다른
  사람의 정상적인 동시 리스"를 "같은 사용자의 더 새로운 유효 리스"로 정정
  (`reservations`가 `ownerUserId` 기본키인 사실 근거). AC-004~007 전부 갱신.
  plan.md §D(코드 파일 목록 4개 추가·runbook 편집 명시)·§E([5차] grep 행
  6개 추가)·§H(교차 참조 4개 추가)도 갱신. REQ/AC 개수는 이번 라운드에서도
  변경되지 않았다(REQ 7개, AC 8개 그대로).
- 6차 개정 라운드 기록(2026-09-15, 코디네이터가 브랜치 오염 정리를 먼저
  위임하고 이어서 콘텐츠 수정 4건을 지시함): **브랜치 정리(Step 0)** —
  `plan/SPEC-PILOT-OPS-001` 브랜치 HEAD에 동일 작성자
  (kyunghwan/zuge3927@naver.com)의 무관한 기능 커밋 `3a3614c`(datepicker UI
  교체, 10개 파일)가 직접 push돼 있던 것을 코디네이터가 `git log`/
  `git show --stat`으로 독립 확인 후 위임 — `feat/case-date-picker-ui`
  브랜치로 보존한 뒤 `git revert --no-edit`으로 비파괴적으로 되돌림(revert
  커밋 `19e3377`). `git diff main...plan/SPEC-PILOT-OPS-001 --stat`으로
  브랜치-main diff가 SPEC 범위 파일 4개(spec.md/plan.md/progress.md/
  pilot-incident-runbook.md)만 포함함을 재확인. **콘텐츠 수정** — (1)
  REQ-PILOT-OPS-004(6)/(7)을 ROUTE invocation(`app/api/cases/route.ts`)
  범위와 BACKGROUND invocation(`netlify/functions/process-case-background.ts`)
  범위로 분리해 각각 별도 Netlify function invocation(별도 로그 스트림)임을
  명시하고 판정 항목을 재배치(AC-PILOT-OPS-004·plan.md §D/§E·
  pilot-incident-runbook.md 동기화). (2) REQ-PILOT-OPS-007에 Gemini 관측
  지속성 한계(네트워크 예외 호출은 콘솔에만 기록되고 DB에는 저장되지 않음,
  DB 저장 자체의 독립 실패 가능성 `gemini_observation_persist_failed`)를
  명시하고, AI Studio 콘솔 실시간 표시를 일일 쿼터 판단의 운영상
  ground-truth로 지정하며 DB/스모크 값은 교차 대조 자료로만 사용한다는
  원칙, 불일치·저장 실패 시 배치 중단/보수적 예약 태세 전환 대응, 단일
  Google Cloud 프로젝트·단일 `GEMINI_API_KEY` 아키텍처 제약(다중 계정/
  로테이션/페일오버 명시적 금지 — 현재 아키텍처와 일치, 해소할 결함 아님)을
  추가(AC-PILOT-OPS-007 동기화). (3) Out of Scope 절의 "현재 로그 이벤트"
  평면 목록을 "실제 async 프로덕션 이벤트" 8개 vs "sync legacy 이벤트
  (미사용)" 3개로 명시적으로 분리하고, `app/api/cases/route.ts:12-13`의 구
  TTL 주석(`LEASE_TTL_SECONDS` 330초, 미사용 동기 경로 전용, 실제
  `BACKGROUND_LEASE_TTL_SECONDS` 960초와 불일치)을 알려진
  code-comment debt로 기록하되 이 SPEC은 문서 전용이므로 정정은 향후
  코드를 다루는 별도 SPEC으로 이연한다는 Out of Scope 항목을 신설.
  (4) **runbook pre-application 투명성 기록**: `.moai/docs/
  pilot-incident-runbook.md`의 §1 이벤트 표·§2 TTL 서술 정정은 5차 개정
  라운드에서 이미 plan-phase 중에 선반영(pre-applied)돼 커밋됐다 —
  README.md/product.md 편집이나 신규 운영 문서 작성 같은 통상적인
  run-phase 문서화 REQ(plan.md §F M1~M6)보다 먼저 적용된 것이며, 이는
  scope creep이 아니라 정당한 정확성 수정이다. run-phase의 역할은 이
  정정 내용을 다시 새로 작성하는 것이 아니라, 이미 정정된 상태(§1 이벤트
  표의 ROUTE/BACKGROUND 두 invocation 구분 포함, §2의 960초/1020초 값)가
  그대로 보존돼 있는지 검증하는 것으로 한정된다 — plan.md §D에 이
  재작성-금지·검증-한정 제약을 명시적으로 추가했다. REQ/AC 개수는 이번
  라운드에서도 변경되지 않았다(REQ 7개, AC 8개 그대로 — 기존 REQ 본문
  내용만 정정·구체화). plan.md §A.5(역사적 평면 목록에 6차 개정 갱신
  안내 추가)·§D(코드 파일 3개 추가·ROUTE/BACKGROUND 구분 명시·runbook
  재작성-금지 제약)·§E([6차] grep 행 7개 추가)·§G(안티패턴 3개 추가)·
  §H(교차 참조 4개 추가)도 갱신.
- **plan-auditor 세션 검증 기록 (2026-09-15, iteration 9, 7차 개정 —
  semantic re-audit)**: Verdict **PASS**, Overall Score **0.98**.
  REQ-007(e)/(g)/AC-007 internal-contradiction fix independently verified as
  a genuine semantic resolution (not hedging language) — (e) no longer
  claims completeness, (g)'s decision rule confirmed operator-executable,
  round-6 D-new-1 abort/reconcile contract confirmed intact and unweakened.
  progress.md §E.1 artifact_set fix, REQ-004(6)
  dashboard-confirmation-without-reclassification, and Out-of-Scope 6-item
  count all independently re-verified against actual file content (not the
  self-report). `git diff --check`/`pnpm format:check` both independently
  re-run, exit=0. Branch-vs-main diff confirmed clean (4 SPEC-scope files
  only). No blocking defects. Minor note: plan.md §E actually gained 5 new
  `[7차]` rows (not the reported 2) — under-reported, not over-reported;
  does not affect SPEC quality.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
