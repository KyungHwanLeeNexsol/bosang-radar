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
- 8차 개정 라운드 기록(2026-09-15, 코디네이터가 독립적으로 확인한 두 건의
  잔여 결함 — REQ-007 AI Studio 미확인 시 폴백 원장의 취약함,
  pilot-incident-runbook.md의 대시보드 표시 과잉 단정 — 을 PASS 전 최종
  재검토 라운드로 위임함): (1) REQ-PILOT-OPS-007(e)/(g)와 AC-PILOT-OPS-007의
  폴백 원장을 "DB 관측치 + 스모크 선기록"에서 "전체 시간창
  `gemini_request_observed` 콘솔 로그 = 호출 시도 기준, DB = 교차 대조
  전용(비합산), 스모크 선기록 = 로그 누락분만 보충"으로 전면 재구성하고,
  `status:null`/`gemini_observation_persist_failed`의 1건 보수 집계와
  집계 불확실 시 배치 중단/보류(≤15 진행 금지)를 신규 요구사항으로 추가 —
  AI Studio-확인-후-분기 IF/IF 구조와 단일 `GEMINI_API_KEY` 제약(h)은
  변경 없음. (2) `.moai/docs/pilot-incident-runbook.md` §1.1의 "Netlify
  대시보드에서 두 함수를 조회할 때도 각각 별도의 함수 항목·별도의
  invocation 로그로 나타난다"는 무조건 단정을 제거하고, REQ-004(6)와 동일
  문구 패턴의 "대시보드 함수명 사전 확인 필요" 주의로 대체 — ROUTE/BACKGROUND가
  서로 다른 Netlify function invocation이라는 사실 서술 자체는 유지.
  plan.md §D(제약 3개 추가·1개 갱신)·§E([8차] 행 4개 추가·[7차] 행 1개
  문구 갱신)도 동기화. REQ/AC 개수는 이번 라운드에서도 변경되지 않았다
  (REQ 7개, AC 8개 그대로 — 기존 REQ 본문 내용만 정정·구체화).
- 9차 개정 라운드 기록(2026-09-15, 코디네이터가 독립적으로 확인한 잔여 결함
  — REQ-PILOT-OPS-004(j)가 REQ-PILOT-OPS-007(e)의 8차 재구성 이후에도 여전히
  옛 "DB+스모크 선기록 합산" 프레이밍을 서술하고 있던 것 — 를 최종 PASS 전
  종결 재검토 라운드로 위임함. plan-auditor iteration-12에서 D1(REQ-004(k)의
  이중 계산 근거 문구가 옛 합산 메커니즘 전제였음) 지적 → 수정 → iteration-13
  재감사 PASS 0.99로 종결): (1) REQ-PILOT-OPS-004(j)를 REQ-007(e)의 콘솔 로그
  기준 메커니즘에 동기화 — "삭제 이후 일일 집계 = 기록되고 이미 삭제된 스모크
  호출 + 현재 라이브 DB 관측치" 프레이밍을 전면 제거하고, (j)의 선기록이
  REQ-007(e)의 절차(콘솔 로그=호출 시도 기준, DB=교차 대조 전용·비합산,
  스모크 선기록=로그-갭 확인분에만 보충)에 투입되는 입력 중 하나로만 취급됨을
  명시. `gemini_request_observations` 행이 실제로 삭제되는지 여부는 일일
  집계의 기준 출처를 콘솔 로그에서 DB로 전환하지 않는다(삭제는 정리 행정
  작업일 뿐, 권위 있는 기준 출처를 바꾸는 스위치가 아님)는 문장을 신설.
  (2) REQ-PILOT-OPS-007(f)의 "그 경계를 (e)의 스모크 선기록 집계와 라이브
  DB 관측 집계 양쪽에 동일하게 적용"이라는 낡은 이분법 서술을 "콘솔 로그
  호출 시도 집계·확인된 로그-갭 스모크 보충·DB 교차 대조 세 요소 모두에
  동일하게 적용"으로 정정하고, AC-PILOT-OPS-007의 동일 위치 문구를 정확히
  같은 표현으로 동기화. (3) D1 수정: REQ-PILOT-OPS-004(k)의 이중 계산 근거
  절("그 남은 행이 라이브 관측치로도 잡히고 선기록 값으로도 잡혀 동일 호출이
  이중 계산된다")이 옛 합산 메커니즘 하에서만 성립하는 인과 설명이었음을
  확인 — DB를 더 이상 합산 대상으로 취급하지 않는 새 메커니즘 하에서는
  발생할 수 없는 메커니즘이었으므로, 교차 대조 오염/cleanup 불변식 확인
  실패 근거로 교체("그렇지 않으면 그 남은 행이 향후 일일 교차 대조 점검을
  오염시키거나, 기본적인 cleanup 불변식조차 확인되지 않은 상태로 넘어가게
  된다"). 0행 확인 실패 → 즉시 중단·트리아지 → 수동 재조정이라는 절차적
  계약 자체는 변경하지 않음. AC-PILOT-OPS-004는 인과 설명을 포함하지
  않으므로 수정 불필요(plan-auditor 확인). REQ/AC 개수는 이번 라운드에서도
  변경되지 않았다(REQ 7개, AC 8개 그대로 — 기존 REQ 본문 내용만 정정·구체화).
  이 라운드로 SPEC의 plan-phase 개정 사이클이 종결됨.
- **plan-auditor 세션 검증 기록 (2026-09-15, iteration 13, 9차 개정 —
  final closing cross-consistency check)**: Verdict **PASS**, Overall
  Score **0.99**. D1(REQ-004(k) 이중 계산 근거 문구 교체)이 실제로 해소됐음을
  독립 재검증했으며, REQ-004(j)/(k) + REQ-007(e)/(f)/(g) + AC-PILOT-OPS-007
  클러스터 전체가 완전히 수렴된 무모순 상태임을 확인. 이 SPEC의 전체
  개정 이력(9개 라운드)에 걸쳐 총 13회의 독립 plan-auditor 감사 이터레이션이
  수행됨. 이 검증으로 SPEC의 plan-phase 개정 사이클이 종결됨 — 이후 변경은
  run-phase 진입 후 필요 시 D-NEW-1 인라인 수정 패턴을 통해서만 이뤄진다.

## §F Phase 4 Mode Selection

- Input parameters: tier=S, scope=4 files (README.md, .moai/project/product.md, `.moai/docs/pilot-ops-launch-plan.md` 신규, `.moai/docs/pilot-incident-runbook.md` 보존 검증만), domain count=1(문서화), file language mix=100% markdown, concurrency benefit=LOW(순차 편집 — 서로 참조), Agent Teams 전제=미충족
- Mode evaluation: direct=not selected(다중 파일·비trivial), fanout=not selected(단일 도메인·순차 의존), sweep=not selected(문서 4개, 30파일 미만 + Kickoff Approval 이전), **serial=selected**(기본값 — 코드 없음, manager-develop 1회 순차 위임으로 충분)
- Decision: serial
- Justification: Tier S 문서 전용 SPEC으로 파일 수(4개)가 적고 서로 참조 관계(README→product.md 문구 재사용)가 있어 병렬화 이득이 없음. Anthropic coding-task parallelism 원칙과 무관하게 순차 위임이 가장 단순하고 안전함.

## §E.2 Run-phase Evidence

manager-develop run-phase 실행 결과(2026-09-15). Tier S 문서 전용 SPEC —
코드 변경 없음. M1~M7(plan.md §F) 전체 완료.

### AC Binary PASS/FAIL Matrix

| AC | 상태 | 근거 |
|----|------|------|
| AC-PILOT-OPS-001a | PASS | README.md 헤딩(19행)·본문(21-23행 부근)·"다음 단계" 절(136,138행) 편집 완료. `grep -c "11개 SPEC" README.md` = 0, `grep -c "SPEC-PILOT-LAUNCH-001" README.md` = 3 |
| AC-PILOT-OPS-001b | PASS | product.md 최종 수정 표기(3-7행)·§Roadmap 헤딩/목록(82,84-104행 부근) 편집 완료. `grep -c "11개 SPEC" product.md` = 0, `grep -c "SPEC-PILOT-LAUNCH-001" product.md` = 2 |
| AC-PILOT-OPS-002 | PASS | README.md/product.md 모두 확정 URL(스킴 포함)·SHA `381e38d`를 "이 시점 기준" 값으로 명시하고, GitHub API 독립 검증 불가 한계를 구분해 기술. "배포 여부 자체가 미결정"이라는 구식 문구 제거. `grep -c "https://musical-macaron-82feb3.netlify.app"` README.md=1행, product.md=2행 |
| AC-PILOT-OPS-003 | PASS | `.moai/docs/pilot-ops-launch-plan.md` §1에 운영자 계정 후보(`zuge3927@naver.com`), `account-provisioning.md` 참조, 발급 전 Turso 호스트 확인, 발급 후 로그인 검증, "실 계정을 발급하지 않는다" 명시 모두 존재 |
| AC-PILOT-OPS-004 | PASS | 신규 문서 §2.1에 8개 확인 항목 순서대로 존재, ROUTE/BACKGROUND 두 invocation 구분·대시보드 함수명 사전 확인 절차·시간창 기준 판정·레거시 경로 구분·단일 즉시 중단 규칙 모두 명시. §2.2에 cleanup 계약 (a)~(k) 11개 항목 모두 존재 |
| AC-PILOT-OPS-005 | PASS | 신규 문서 §2.3에 최소 계정 2개 요구, 4단계 격리 확인 절차(양성 대조군·notFound()/404 JSON 양방향 확인 코드 위치 인용·세션 분리/재로그인·합성 사례만 사용)가 존재한다. 임시 계정 대안 경로는 **fix-review 라운드에서 구체화** — (i) 이전의 3개 항목 요약 서술 대신, 스모크런 ID·임시 이메일 선기록 → account-provisioning.md 참조 발급 → 결과 userId/이메일 기록 → §2.2 기준 사건 데이터 우선 정리(정확한 식별자, 와일드카드 금지) → session/account/user/verification/allowed_testers 정리 + 0행 확인 → `lib/db/schema.ts` 재확인 근거로 cascade(session.userId/account.userId → user.id, onDelete: cascade) vs 비-cascade(verification은 identifier 컬럼, allowed_testers는 email 컬럼 — 둘 다 user 외래키 없음, 별도 삭제 필요)를 명시적으로 구분 → 이상 활동 시 즉시 중단 → 모든 삭제는 기록된 식별자만 대상(와일드카드/날짜범위/최근N개 금지) → §3.2 집계 제외의 9단계 구체 절차로 재작성됐다. **2차 review 라운드에서** 5번 단계의 실제 삭제·0행 확인 목록에 `allowed_testers`가 누락돼 있던 것을 6번의 cascade/비-cascade 설명과 일치하도록 명시적으로 추가했다(둘 다 session/account/user/verification/allowed_testers 다섯 테이블을 동일하게 열거). 기본 경로(첫 실제 외부 계정 대기, 이 경로의 게이트 사건도 집계 제외·정리 대상 명시)도 그대로 존재한다 |
| AC-PILOT-OPS-006 | PASS | 신규 문서 §3에 1→격리게이트→2→3단계 순서, 전환/중단 기준, 문의 채널, PII 안내 문구 재사용, "최소 10명"·"최소 30건" 정밀 표현("10명 내외"/"약 30건" 잔존 0), 성공지표 집계 계약 3개 항목, "완료 사건 수"·"피드백" 증거 표 형식 모두 존재 |
| AC-PILOT-OPS-007 | PASS | 신규 문서 §4에 20 RPD/15회 구분, 사건수≠모델요청수, 일일 예산 구성요소, 콘솔 로그=호출시도 기준/DB=교차대조 전용(비합산)/스모크 선기록=로그갭만 보충, status:null·persist_failed 보수 집계, 불확실 시 중단/보류, UTC/KST 운영시점 확인, 지속성 한계+AI Studio 결정 규칙(IF/IF), 단일 GEMINI_API_KEY 아키텍처 제약 모두 존재 |

### 코드 무변경 검증 (fix-review 라운드 — 재작성)

**(정정 사유)** 아래 이전 버전은 `git diff --stat`(작업 트리 스냅샷, 커밋
전 시점)을 최종 증거로 사용해 3개 파일만 보고했으나, 이는 이 SPEC의 실제
전체 run-phase 범위(plan-auditor가 확인한 plan-phase 최종 커밋
`af6c0a1`부터 이 fix-review 커밋까지)를 반영하지 않은 스테일 스냅샷이었다.
올바른 증거는 두 **불변(immutable)** 커밋 사이의 range diff여야 한다.

**백필 완료**: fix-review 라운드의 최종 커밋(`1381c22`)이 landing된 직후
`git diff af6c0a1..1381c22 --stat`를 실행해 아래에 verbatim 기록한다(이
편집 자체는 progress.md 자기참조 문제를 피하기 위한 후속 소규모 편집이며,
`.claude/rules/moai/development/spec-frontmatter-schema.md` § SHA
placeholder backfill exemption과 동일한 패턴의 즉시 백필이다):

```
$ git rev-parse HEAD
1381c2212c8530c575fd18bcbaa8f2ef221cd998

$ git diff af6c0a1..1381c22 --stat
 .moai/docs/pilot-ops-launch-plan.md        | 406 +++++++++++++++++++++++++++++
 .moai/project/product.md                   |  29 ++-
 .moai/specs/SPEC-PILOT-OPS-001/progress.md | 132 +++++++++-
 .moai/specs/SPEC-PILOT-OPS-001/spec.md     |   2 +-
 README.md                                  |  10 +-
 5 files changed, 564 insertions(+), 15 deletions(-)
```

정확히 5개 파일이 확인됐다 — 아래 §E.3 `total_run_phase_files`와 일치.
`.moai/docs/pilot-incident-runbook.md`는 이 집합에 포함되지 않는다(아래
참고, 별도의 "보존 검증(preservation-verified)" 파일로 분리 기록).

**`.ts`/`.tsx`/`.js` 무변경 재확인(이번 fix-review 라운드, 작업 트리
기준)**: `git diff --stat | grep -E "\.ts$|\.tsx$"` → 매치 없음(exit=1).

**`.moai/docs/pilot-incident-runbook.md` 보존 검증(분리 기록)**: 이
파일은 위 5개 변경 파일 집합에 포함되지 않고, `af6c0a1..1381c22` 전체
range에서 무변경임을 확인했다 — 5차 개정 plan-phase 중 선반영된 §1/§2
정정이 run-phase(이번 fix-review 라운드 포함) 동안 그대로 보존됐음을
확인(run-phase는 재작성하지 않음, plan.md §D 제약 준수).

```
$ git diff af6c0a1..1381c22 --stat -- .moai/docs/pilot-incident-runbook.md
(출력 없음 — 무변경 확인)
```

### 신규 문서 자체 검증 (fix-review 라운드 — 재실행, 변경분 아닌 전체 파일 대상)

plan.md §E의 grep 행 전체(3차~8차, 총 23개 세부 행 — 위 §2.3 임시 계정
경로 재작성 이후 상태 반영)를 신규 문서
`.moai/docs/pilot-ops-launch-plan.md` **전체 최신본** 대상으로 재실행 —
전체 PASS. 대표 결과(변경된 것만 표기, 나머지는 이전 라운드와 동일):
헤딩 5종 개별 확인 각 ≥1(계정 발급=6, 스모크=25, 테넌트 격리=7, 3단계=3,
쿼터=5); "시간창"/"invocation 범위" 10행; "leaseId"=5행·"ownerUserId"=4행·
"다른"=12행; "스모크런 ID"=3행·"타임스탬프"=2행; "최소 10명" 3행 AND
"10명 내외"/"약 30건" 0행; "20 RPD"=2행·"15회"=3행; "즉시 중단"/"트리아지"
6행 + "재조정" 2행; "case_job_enqueue_failed"=1행·"case_job_failed"=1행·
"동기"/"레거시"=4행·"createCase"=2행; runbook "960\|1020" 4행, "330초" 1행이
"정정(v0.12.0)... 적용되지 않는다" 문맥과 co-occur(직접 확인) — 오탐 아님;
"양성 대조군"=1행·"notFound"=1행; "실제 외부" 3행; "UTC"=2행·"KST"=2행;
"완료 사건 수"=2행·"피드백"=7행; "ROUTE"=3행·"BACKGROUND"=2행·"invocation"=11행;
"별개의\|서로 다른" 5행; "gemini_observation_persist_failed" 4행;
progress.md "선반영\|pre-applied" 4행, plan.md 3행; "관측치\|observation"
15행(§4(g) "담보하지 않는다" 완전성 부정 표현과 인접 존재, 직접 확인);
"지연\|update-lag" 6행·"확인\|기록" 75행·"주 수치\|primary" 1행; "교차 대조"
1행·"합산하지 않는다\|이중 계산" 3행; "status" 4행·"보수적으로 집계" 1행;
"중단\|보류" 14행·"abort\|halt" 3행; runbook "표시 이름\|display name" 1행,
신규 문서 동일 표현 1행 + "확인" 54행; progress.md artifact_set에
"pilot-incident-runbook" 2행 존재.

**git diff --check / pnpm format:check (Fix4 추가 검증)**:
```
$ git diff --check
(exit=0, 출력 없음)

$ pnpm format:check
...
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
(exit=0)
```

### Gap (알려진 잔여 항목 — 이번 run-phase 범위 밖)

plan.md §E [7차] 행 "spec.md `6개 Out of Scope` ≥1 AND `5개 Out of Scope`
=0"을 문자열 그대로 검사하면 `grep -c "6개 Out of Scope" spec.md` = 0(
실제 원문은 `**6개** Out of Scope`로 마크다운 볼드가 "개"와 공백 사이에
끼어 있어 공백 1칸 리터럴 매치가 어긋남 — `grep -c "**6개** Out of Scope"`
= 1로 실제 값은 6개가 맞음을 별도 확인함) 이고 `grep -c "5개 Out of Scope"
spec.md` = 1(255행 HISTORY 7차 개정 기록 안에서 "이전에는 '5개'로 잘못
쓰여 있었다"는 과거 서술을 인용하는 문맥이며, 현재 유효한 요약 서술이
아님). 이 항목은 spec.md **body**(HISTORY) 내용이며, 이 SPEC의 run-phase
manager-develop은 spec.md body를 수정할 권한이 없다(frontmatter
status/updated만 허용, `.claude/rules/moai/development/spec-frontmatter-schema.md`
§ Forbidden ownership crossings) — plan-phase에서 이미 완료된 7차 개정
작업의 잔존 서식(마크다운 볼드) 이슈이며 이 run-phase가 새로 만든 결함이
아니다. 실질적 내용(현재 Out of Scope 항목 수가 6개라는 사실)은 정확하다.

## §E.3 Run-phase Audit-Ready Signal

- run_status: run-complete (fix-review 라운드 반영 — 외부 검토 4건 수정)
- run_complete_at: 2026-09-15
- ac_pass_count: 8 (AC-PILOT-OPS-001a, 001b, 002, 003, 004, 005, 006, 007 — 전부 PASS, AC-005 rationale은 fix-review 라운드에서 갱신)
- ac_fail_count: 0
- preserve_list_post_run_count: `.moai/docs/pilot-incident-runbook.md` 1건 — run-phase(이번 fix-review 라운드 포함) 동안 무변경 확인. 위 §E.2 "코드 무변경 검증"이 이 파일을 5개 변경 파일 집합에서 분리해 별도로 기록한다
- new_warnings_or_lints_introduced: 0 (코드 변경 없음, 린트 대상 아님). `git diff --check`/`pnpm format:check` 모두 exit=0(위 §E.2 참고)
- cross_platform_build: n/a (코드 변경 없음)
- total_run_phase_files: 5 (README.md 편집, `.moai/project/product.md` 편집,
  `.moai/docs/pilot-ops-launch-plan.md` 신규+fix-review 개정, 본 progress.md;
  spec.md frontmatter status만 draft→in-progress 전환) — 이전 버전은 4로
  오기재(스테일 `git diff --stat` 스냅샷이 progress.md 자신을 누락시킨 결과);
  `.moai/docs/pilot-incident-runbook.md`는 이 5개 집합에 포함되지 않는
  별도의 "보존 검증" 파일이다
- m1_to_mN_commit_strategy: run-phase 초기 단일 커밋(M1~M7 통합) + 본
  fix-review 라운드의 후속 커밋(들) — plan/SPEC-PILOT-OPS-001 브랜치에
  직접 커밋 + push (사용자 명시 지시에 따름, PR 미생성)

## §E.4 Sync-phase Audit-Ready Signal

- sync_status: sync-complete
- sync_complete_at: 2026-09-15
- sync_commit_sha: c267079c2f1f8c2413b29f60ea2380c8282733f6 (backfilled via the SHA placeholder backfill exemption, `spec-frontmatter-schema.md` § SHA placeholder backfill exemption)
- ac_pass_count: 8 (AC-PILOT-OPS-001a, 001b, 002, 003, 004, 005, 006, 007 — all PASS per the external run-phase review against reviewed HEAD `26e0d8cd6a8fe9c6365e5632d4d57a02132f6364`)
- ac_fail_count: 0
- status transition: spec.md frontmatter `status: in-progress` → `status: completed` (this sync commit); `updated:` retained at `2026-09-15` (no date change needed — the sync commit lands the same day)

### Sync-phase final verification (re-run on HEAD `26e0d8cd6a8fe9c6365e5632d4d57a02132f6364`, before this commit)

**1. `git diff --check`**
```
$ git diff --check
(no output)
exit=0
```

**2. `pnpm format:check`**
```
$ pnpm format:check
> prettier --check .
Checking formatting...
All matched files use Prettier code style!
exit=0
```

**3. `git diff af6c0a1..HEAD --stat`** (plan-phase baseline `af6c0a1e0b5de4a15dde7edf7e7823a516b90b25` → sync-phase HEAD)
```
$ git diff af6c0a1..HEAD --stat
 .moai/docs/pilot-ops-launch-plan.md        | 410 +++++++++++++++++++++++++++++
 .moai/project/product.md                   |  29 +-
 .moai/specs/SPEC-PILOT-OPS-001/progress.md | 138 +++++++++-
 .moai/specs/SPEC-PILOT-OPS-001/spec.md     |   2 +-
 README.md                                  |  10 +-
 5 files changed, 574 insertions(+), 15 deletions(-)
```
Confirms exactly 5 changed files as expected (README.md, product.md, pilot-ops-launch-plan.md, progress.md, spec.md).

**4. `git diff af6c0a1..HEAD --stat -- .moai/docs/pilot-incident-runbook.md`** (preservation check)
```
$ git diff af6c0a1..HEAD --stat -- .moai/docs/pilot-incident-runbook.md
(no output)
```
Confirms the runbook was not touched during run-phase or sync-phase — preservation verified.

### Baseline-attribution

All four checks above were run in this session against this working tree at HEAD `26e0d8cd6a8fe9c6365e5632d4d57a02132f6364` (pre-sync-commit). This is the same HEAD the external run-phase review cited when confirming all 8 ACs PASS.

### Gaps (not verified in this sync phase — by design, per the delegation constraints)

- No real account provisioning, no real DB write, no real Gemini API call, no real deployment, and no real tester invitation were performed — this SPEC is documentation-only and none of these actions were in scope.
- No code-level test suite was run — this SPEC touches no `.ts`/`.tsx`/`.js` files, so `pnpm test`/`pnpm lint`/`pnpm build` were not part of this sync-phase verification (no code changed to verify).
- The pre-existing "5개 Out of Scope" HISTORY-quoting cosmetic wording gap in spec.md HISTORY (documented in a prior run-phase progress.md entry) was left as-is per the sync-phase delegation's explicit instruction not to touch spec.md body content.

### Residual-risk

- The `sync_commit_sha` field above was originally written as a placeholder in commit `c267079` (a commit cannot self-reference its own SHA) and was backfilled with the real value in the immediately following commit `e008b99`. This is now resolved — no outstanding gap.
- This SPEC's launch-plan document (`pilot-ops-launch-plan.md`) describes a future operational rollout (account provisioning, smoke checklist, 3-stage pilot) that has not yet been executed — the plan's own correctness against the real Gemini/Netlify/Turso environment remains unverified until that rollout actually happens.

### Final close-consistency verification (re-run after Fix 1, on the actual final working tree, commit `pending-backfill-fix3`)

This section reflects the ACTUAL FINAL committed state of this SPEC's branch as of this fix-round commit — distinct from the "Sync-phase final verification" section above, which is pre-sync-commit evidence captured on HEAD `26e0d8cd6a8fe9c6365e5632d4d57a02132f6364` and MUST NOT be edited or relabeled. This section's own commit SHA is written here as a placeholder (`pending-backfill-fix3`, a commit cannot self-reference its own SHA) and is backfilled with the real value in an immediately following commit, per the SHA placeholder backfill exemption (`spec-frontmatter-schema.md` § SHA placeholder backfill exemption).

**1. `git diff --check`** (run against the tree including this commit's own Fix 1 + Fix 2 edits to progress.md)
```
$ git diff --check
(no output)
exit=0
```

**2. `pnpm format:check`**
```
$ pnpm format:check
> prettier --check .
Checking formatting...
All matched files use Prettier code style!
exit=0
```

Both checks were run after the Fix 1 residual-risk edit and this Fix 2 section were already written into `progress.md`, i.e. against the real final tree that will be committed — not a stale pre-edit snapshot.
