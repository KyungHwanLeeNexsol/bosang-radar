# 테넌트 격리 게이트 검증 — 2026-09-16

> `.moai/docs/pilot-ops-launch-plan.md` §2.3 기준. 이 문서는 §3.1이 정의하는
> "테넌트 격리 게이트"(2단계 진입 전 필수)의 실측 검증 기록이다. 브라우저
> 자동화가 불가능해, 실제 프로덕션에 대해 두 계정으로 각각 로그인 후 세션
> 쿠키를 확보해 인증된 HTTP 요청을 직접 보내는 방식으로 검증했다(수동 클릭
> 대신 정확한 HTTP 상태 코드로 판정).

## 0. 기준 정보

- 검증 시각(UTC): `2026-09-16T01:56:06Z` 시작
- 프로덕션 배포: `f5ac573`(직전 최종 점검 시점과 동일 배포, 코드 변경 없음)
- 사용 계정: 운영자(`zuge3927@naver.com`, 유지) + 임시 계정(`pilot-isolation-check-20260916@example.com`, 검증 후 완전 삭제)

## 1. 절차 및 결과

### 1.1 자기 사건 조회 (양성 대조군)

| 계정 | 대상 | 결과 |
|---|---|---|
| 운영자 | 자기 사건 페이지(`/cases/{caseA}`) | HTTP 200 — PASS |
| 운영자 | 자기 상태 API(`/api/cases/status?jobId={jobA}`) | HTTP 200 — PASS |
| 임시 계정 | 자기 사건 페이지(`/cases/{caseB}`) | HTTP 200 — PASS |
| 임시 계정 | 자기 상태 API(`/api/cases/status?jobId={jobB}`) | HTTP 200 — PASS |

### 1.2 상대 계정 접근 차단 (양방향)

| 시도 주체 | 대상 | 결과 |
|---|---|---|
| 운영자 → 임시 계정 사건 페이지 | `/cases/{caseB}` | HTTP **404** — PASS(차단) |
| 운영자 → 임시 계정 상태 API | `/api/cases/status?jobId={jobB}` | HTTP **404** — PASS(차단) |
| 임시 계정 → 운영자 사건 페이지 | `/cases/{caseA}` | HTTP **404** — PASS(차단) |
| 임시 계정 → 운영자 상태 API | `/api/cases/status?jobId={jobA}` | HTTP **404** — PASS(차단) |

**결론: 4개 방향 모두 정확히 차단됨 — 테넌트 격리 PASS.**

### 1.3 실시간 로그 확인 (429/5xx + 실패 이벤트 7종)

- 방법: `netlify logs --source functions --since <검증 시작 시각> --json`으로 검증 구간 전체를 조회(총 25줄).
- 실패 이벤트 7종(`case_job_enqueue_failed`, `case_job_cancel_failed`, `case_job_create_lease_release_failed`, `pipeline_stage_failed`, `case_job_status_update_failed`, `case_job_failed_lease_release_failed`, `case_job_failed`) — **전부 0건**.
- 로그 레벨: info 24건, warn 1건(Better Auth의 클라이언트 IP 감지 관련 안내성 경고 — 서버리스 환경에서 흔한 인프라 메시지이며 기능 오류 아님), error/fatal **0건**.
- 429/5xx 상태 코드 — **관측되지 않음**.

**정정**: 직전 `pilot-ops-final-check-20260916.md`에서 "Netlify 함수 로그는 소급 조회가 구조적으로 불가능하다"고 기록했는데, 이는 폐지된 `netlify logs:function` 명령의 한계였을 뿐이다. 실제로는 신규 `netlify logs --since <기간>` 명령으로 **과거 로그도 조회 가능**하다는 것을 이번에 확인했다(해당 보고서에 정정 예정).

## 2. Gemini 사용량

| 사건 | 모델 요청 | 비고 |
|---|---|---|
| Case A (운영자, 손목 골절) | Lite 3건 | Premium 승격 없음 |
| Case B (임시 계정, 어깨 회전근개) | Lite 3건 | Premium 승격 없음 |
| **합계** | **Lite 6건, Premium 0건** | 하루 보수적 목표(15회) 대비 미미함 |

## 3. 정리(cleanup) — 최종 검증

| 대상 | 식별자 | 잔존 |
|---|---|---|
| Case B (임시 계정) cases/reports/feedback/case_jobs/gemini_observations | caseId `dcd4194a...`, jobId `5fdc17a5...` | 0 |
| Case A (운영자, 검증용 합성 사건) cases/case_jobs/gemini_observations | caseId `485f2a23...`, jobId `7d146fe4...` | 0 |
| 임시 계정 user 행 | `pilot-isolation-check-20260916@example.com` | 0 (삭제됨, session/account 자동 cascade) |
| 임시 계정 allowed_testers 행 | 동일 이메일 | 0 (별도 삭제 — cascade 대상 아님) |
| `reservations` | 운영자/임시 계정 ownerUserId | 검증 전부터 0(활성 리스 없음, 삭제 전 확인) |

운영자 계정(`zuge3927@naver.com`)은 삭제 전/후 모두 존재 확인됨 — 실 파일럿 계정은 전혀 건드리지 않았다.

## 4. Gemini 아키텍처 제약 준수

이번 검증에서 다중 Gemini 프로젝트·키 로테이션·페일오버를 추가하지 않았다 — 기존 단일 `GEMINI_API_KEY` 그대로 사용(변경 없음).

## 5. 최종 판정: **PASS**

**근거**: §2.3이 요구하는 양성 대조군 확인 + 양방향 교차 접근 차단이 실측 HTTP 상태 코드로 전부 확인됐고, 로그 기반 실패 이벤트·429/5xx도 전무했다. 정리 후 잔존 데이터 0건, 운영자 계정·실 파일럿 데이터는 무손상.

### → **2단계(외부 전문가 2~3명 초대) 진행 가능**

단, 실제 초대는 이번 작업 범위 밖이며 별도로 진행해야 한다.

## 교차 참조

- `.moai/docs/pilot-ops-launch-plan.md` §2.3, §3.1
- `.moai/reports/pilot-ops-final-check-20260916.md`
