# 실 배포 도메인 인증 검증 — 2026-09-12

## 판정

**`READY (readiness 항목 4 — 실 도메인 인증)`**

Deploy Preview의 실제 `*.netlify.app` 도메인에서 로그인 요청, 세션 수립, 보호 페이지
접근을 각각 검증했다. 비밀번호와 세션 쿠키 값은 생성부터 폐기까지 프로세스 메모리
안에서만 취급했고 출력하거나 문서에 기록하지 않았다.

## 대상

- URL: `https://deploy-preview-10--musical-macaron-82feb3.netlify.app`
- Deploy ID: `6aa5533dc973a900089fa6f3`
- Commit: `9ae909c696b71baa3d2196dcc84c82238e1981e8`
- 배포 상태: `ready`
- Background Function: `process-case-background`, invocation mode `background`

## 검증 방법

Netlify production 컨텍스트가 가리키는 동일 원격 Turso에 합성 E2E 전용 테스터 계정
1개를 프로비저닝했다. 임의 비밀번호를 메모리에서 생성한 뒤 실제 Preview 도메인에
HTTP 요청을 보내고, 응답 쿠키를 후속 요청에 전달했다. 계정과 아래 합성 사례는 원격
E2E 증거로 남겼다.

## 인증 결과

| 단계 | 실제 결과 | 판정 |
|------|-----------|------|
| 로그인 페이지 | `GET /login` → HTTP 200 | PASS |
| 로그인 요청 | `POST /api/auth/sign-in/email` → HTTP 200 | PASS |
| 세션 쿠키 | 로그인 응답에 세션 쿠키 존재, 값은 미출력 | PASS |
| 세션 조회 | `GET /api/auth/get-session` → HTTP 200, 프로비저닝한 사용자와 일치 | PASS |
| 비로그인 보호 | `GET /cases/new` → HTTP 307, `/login`으로 이동 | PASS |
| 로그인 보호 | 같은 세션으로 `GET /cases/new` → HTTP 200 | PASS |

AC-PILOT-READY-005가 요구하는 (a) 로그인 성공, (b) 실제 세션 수립, (c) 수립된 세션의
보호 페이지 접근을 모두 실제 배포 도메인에서 개별 확인했다.

## 지원 문의 링크

같은 배포의 `/login` 렌더 결과에서 `SUPPORT_CONTACT_EMAIL` 기반 활성 `mailto:` 링크가
존재함을 확인했다. 주소 자체는 이 검증 출력에 재기록하지 않았다. 이 결과와 기존의
미설정 상태 컴포넌트 테스트를 합쳐 AC-PILOT-READY-013을 PASS로 전환한다.

## 함께 수행한 비동기 happy path

동일 세션으로 합성 사건 한 건을 제출해 다음을 확인했다.

| 단계 | 실제 결과 |
|------|-----------|
| 사건 제출 | HTTP 202 + `jobId`, 1,597ms |
| 처리 중 동일 사용자 재제출 | HTTP 409 |
| 상태 전이 | `processing` → `completed` |
| Background 완료 관측 | 36,528ms |
| 전체 제출~검증 완료 | 40,675ms |
| 결과 페이지 | HTTP 200, 합성 진단명 렌더 확인 |
| 원격 DB 독립 조회 | 해당 job `completed`, 연결된 `cases` 1건, `reports` 1건 |

- Job ID: `04aa6f88-90a3-44aa-a7f7-c3e5e7a80263`
- Case ID: `cb660492-82f0-4de7-9db7-313a0e9c85a9`

## 판정 범위

- readiness 항목 (4) 실 도메인 인증은 READY다.
- 이 한 건은 비동기 배포 경로의 정상 동작 증거지만, 항목 (1)이 요구하는 최소 3회
  처리시간 실측을 충족하지 않는다.
- REQ-PILOT-READY-010의 네트워크 관측기 기반 단계별 Gemini 호출 성공·호출 횟수와
  응답/DB 필드 일치까지 모두 기록하지 않았으므로 항목 (5)는 계속 UNVERIFIED다.
- 서로 다른 사용자 동시 부하와 원격 강제 실패·복구는 수행하지 않았으므로 항목 (6),
  (7)도 계속 UNVERIFIED다.
