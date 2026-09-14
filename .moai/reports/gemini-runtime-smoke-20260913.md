# 실 배포 Gemini 런타임 스모크 — 2026-09-13

## 판정

**`READY (readiness 항목 5 — 실 Gemini 스모크)`**

실제 Netlify Deploy Preview에서 합성 사건을 제출하고 Background Function 완료, 원격
Turso의 report 행, job에 연결된 Gemini 네트워크 관측값을 독립 조회했다.
AC-PILOT-READY-010이 요구하는 5개 증거를 모두 확인했다.

## 대상

- URL: `https://deploy-preview-10--musical-macaron-82feb3.netlify.app`
- Deploy ID: `6aa61b60502cb30008f2b4a8`
- Commit: `a2b3ef08e4c952b594b8841d0e62839033ce9ce6`
- 배포 상태: `ready`
- Background Function: `process-case-background`, invocation mode `background`
- 원격 DB migration 적용 수: 8건(migration 0007 포함)

## 검증 방법과 비밀값 취급

Netlify production 컨텍스트가 가리키는 원격 Turso에 합성 전용 테스터를 프로세스
메모리에서 생성한 임의 비밀번호로 프로비저닝했다. 비밀번호와 세션 쿠키 값은 출력하거나
파일에 기록하지 않았다. 로그인 요청에는 실제 브라우저와 동일하게 Preview origin을
명시했다.

첫 진단 시도는 `Origin`/`Referer`가 없는 비브라우저 로그인 요청이 HTTP 403으로 거부되어
Gemini나 사건 제출 단계에 진입하지 않았다. 브라우저 요청 계약에 맞게 두 헤더를 추가한
새 합성 계정의 재시도를 아래 공식 스모크 결과로 채택했다.

## AC-PILOT-READY-010 결과

| 요구 증거 | 실제 결과 | 판정 |
|-----------|-----------|------|
| (a) Researcher/Skeptic/Verifier 실제 Gemini 호출 성공 | 순서대로 `gemini-3.6-flash` 1회, `gemini-3.5-flash-lite` 2회, 모두 POST/HTTP 200 | PASS |
| (b) 비동기 제출과 최종 사건 ID | `POST /api/cases` → HTTP 202 + jobId, 최종 status `completed` + caseId | PASS |
| (c) report 영속화 | 원격 `reports` 독립 조회 1건 | PASS |
| (d) 응답과 DB 행 일치 | 원격 `case_jobs.status=completed`, `case_jobs.case_id`와 상태 API의 caseId 일치, 같은 caseId의 report 1건 | PASS |
| (e) 실제 호출 횟수 | 관측 행 3건, 기대 기본 호출 3회와 일치, 재시도 0회 | PASS |

## 실행 결과

- Job ID: `18d22441-5597-490e-84aa-ace25b7c168d`
- Case ID: `c688b153-785c-447c-9b2c-78e5fc10104d`
- 제출 응답: HTTP 202, 3,761ms
- 최종 완료 관측: 제출 시작 후 46,188ms
- 결과 페이지: HTTP 200, 합성 진단명 렌더 확인
- 원격 report 행: 1건

## Gemini 네트워크 관측

| 순번 | 역할 | 모델 | HTTP | 성공 | 호출 소요시간 |
|------|------|------|------|------|---------------|
| 1 | Researcher | `gemini-3.6-flash` | 200 | true | 14,966ms |
| 2 | Skeptic | `gemini-3.5-flash-lite` | 200 | true | 4,162ms |
| 3 | Verifier | `gemini-3.5-flash-lite` | 200 | true | 4,757ms |

관측 테이블에는 job ID, HTTP method, 모델명, 상태 코드, 성공 여부, 소요시간, 관측
시각만 저장된다. API key, 전체 요청 URL, prompt와 response 본문은 저장하지 않았다.

## 판정 범위

- readiness 항목 (5)와 AC-PILOT-READY-010은 PASS/READY로 전환한다.
- 이 실행은 항목 (1)의 최소 3회 처리시간 실측 중 1회로 참고할 수 있지만 단독으로 항목
  (1)을 READY로 만들지는 않는다.
- 서로 다른 사용자 동시 부하와 원격 강제 실패·복구는 수행하지 않았으므로 항목 (6),
  (7)은 계속 UNVERIFIED다.
- AI Studio 쿼터 대시보드 확인도 별도 작업이므로 항목 (2)는 계속 UNVERIFIED다.
