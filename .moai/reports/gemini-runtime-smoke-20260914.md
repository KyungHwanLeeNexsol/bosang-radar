# 실 배포 Gemini 런타임 스모크(하이브리드 라우팅 이후) — 2026-09-14

## 판정

**`READY (readiness 항목 5 — 실 Gemini 스모크, 하이브리드 라우팅 이후 버전으로 재검증)`**

`.moai/reports/gemini-runtime-smoke-20260913.md`(2026-09-13)는 하이브리드 Gemini
라우팅 커밋(`187afc2`)보다 시간상 앞선 파이프라인 버전을 기준으로 한 결과였다 —
당시 파이프라인은 모든 사건에서 무조건 Researcher를 Premium으로 호출했다. 이
문서는 실제 Deploy Preview + 원격 Turso 대상으로 **하이브리드 라우팅 도입
이후** 버전을 재검증한 결과다(`.moai/specs/SPEC-PILOT-READY-001/progress.md`
§AA-2에서 발췌·분리).

## 대상

- 사용자 승인에 따라 신규 합성 전용 테스터 3계정을 원격 Turso에 직접
  프로비저닝했다(`smoke-test-20260914-{1,2,3}@bosang-radar.internal`) — 비밀번호는
  세션 프로세스 메모리에만 존재했고 로그·문서·커밋 어디에도 기록하지 않았다.
- GitHub combined status(`GET /repos/.../commits/3f0859b.../status`):
  `netlify/musical-macaron-82feb3/deploy-preview` = `success`, 대상 commit SHA가
  로컬/원격 브랜치 HEAD(`3f0859b`)와 일치.

## 실행 방법

세 계정으로 일반/복합/일반 사건을 **동시에**(`Promise.all`) 제출했다 — 서로 다른
사용자 동시 부하(readiness 항목 (6))와 하이브리드 라우팅 스모크(항목 (5))를
같은 실행으로 겸해서 검증했다.

## 실행 결과

| 사용자 | 사건 | 제출 응답 | 최종 상태 | 완료까지 | Gemini 관측 |
|---|---|---|---|---|---|
| tester-1 | 일반 | 202(3.0s) | completed | 24.0s | Lite×3 (research/challenge/verify), 모두 HTTP 200 |
| tester-2 | 복합(기왕증 신호) | 202(3.0s) | completed | 43.4s | Premium×1(8.5~24.3s)+Lite×2, 모두 HTTP 200 |
| tester-3 | 일반 | 202(3.4s) | completed | 20.4s | Lite×3, 모두 HTTP 200 |

## AC-PILOT-READY-010 결과(경로별 기대 호출 횟수 정정 반영)

| 요구 증거 | 실제 결과 | 판정 |
|-----------|-----------|------|
| (a) Researcher/Skeptic/Verifier 실제 Gemini 호출 성공 | 3개 사건 모두 HTTP 200, 429/5xx 없음 | PASS |
| (b) 비동기 제출과 최종 사건 ID | 3건 모두 `202`+jobId → 최종 `completed`+caseId | PASS |
| (c) report 영속화 | `cases`/`reports` 원격 조회로 3건 확인 | PASS |
| (d) 응답과 DB 행 일치 | 각 caseId의 `ownerUserId`가 제출한 본인과 정확히 일치(소유자 격리 정상) | PASS |
| (e) 실제 호출 횟수(경로별) | 일반 경로 Lite×3(2건), 복합 경로 Premium×1+Lite×2(1건) — REQ-PILOT-READY-010 v0.15.0 정정의 "일반/복합-직행 3회" 기대치와 일치 | PASS |

## 판정 범위

- 하이브리드 라우팅이 실제 Gemini 호출에서도 설계대로 동작함을 원격 환경에서
  재확인했다 — §Z의 로컬 실측을 원격으로 승격.
- readiness 항목 (5)의 근거를 이 문서로 갱신하고, 이 실행이 서로 다른 사용자
  3명 동시 제출이기도 하므로 readiness 항목 (6)도 `UNVERIFIED → READY`로
  전환한다(전체 판정에는 변화 없음 — 항목 (7)이 남아 있어 `NO-GO` 유지).
- 이 실행은 저장소/복구 검증(항목 (7))의 증거가 아니다 — 해당 증거는
  `.moai/specs/SPEC-PILOT-READY-001/progress.md` §AA-3, §AB 참고.
