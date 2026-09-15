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

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
