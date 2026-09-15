# SPEC-PILOT-OPS-001 진행 상황

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready
- plan_complete_at: 2026-09-15
- tier: S
- artifact_set: spec.md, plan.md (acceptance.md 없음 — AC는 spec.md §3에 인라인), progress.md
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

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
