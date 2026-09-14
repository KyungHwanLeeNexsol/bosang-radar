# 원격 DB 및 Netlify 환경 확인 — 2026-09-12

## 판정

**`READY (readiness 항목 3 — 원격 DB)`**

Netlify production 컨텍스트의 실제 환경변수를 주입해 원격 Turso 마이그레이션과
시드를 실행했고, REQ-PILOT-READY-016의 원격 DB READY 기준에 포함된 `tester:add`를
세 계정에 대해 실행했다. 비동기 처리용 migration 0006까지 적용한 뒤 별도 읽기 전용
조회로 migration 7건, `case_jobs` 스키마, 기준 데이터와 테스터 행을 재확인했다.
따라서 readiness 항목 (3)은 READY다. 이 판정은 원격 DB 항목에 한정되며 전체
readiness 판정은 다른 실환경 게이트가 남아 `NO-GO`다.

## 대상

- Netlify 사이트: `musical-macaron-82feb3`
- Deploy Preview: `https://deploy-preview-10--musical-macaron-82feb3.netlify.app`
- Production URL: `https://musical-macaron-82feb3.netlify.app`
- 환경변수 컨텍스트: `production`, `deploy-preview`
- 원격 DB: Netlify의 `TURSO_DATABASE_URL`이 가리키는 Turso 인스턴스
- 비밀값은 조회 결과나 이 문서에 기록하지 않았다.

## Netlify 환경변수 존재 확인

값을 출력하지 않고 변수명 존재 여부만 확인했다. 두 컨텍스트 모두 다음 6개 변수를
보유한다.

| 변수 | production | deploy-preview | 판정 |
|------|------------|----------------|------|
| `TURSO_DATABASE_URL` | 있음 | 있음 | 원격 DB 연결에 사용 |
| `TURSO_AUTH_TOKEN` | 있음 | 있음 | 원격 DB 연결에 사용 |
| `GEMINI_API_KEY` | 있음 | 있음 | 실 Gemini 호출 준비됨 |
| `BETTER_AUTH_SECRET` | 있음 | 있음 | 인증 서명 키 준비됨 |
| `BETTER_AUTH_URL` | 있음 | 있음 | 값의 컨텍스트 정정 필요(아래 참고) |
| `SUPPORT_CONTACT_EMAIL` | 있음 | 있음 | 지원 연락처 준비됨 |

다음 선택 변수는 두 컨텍스트 모두 없다. 코드 기본값이 적용되므로 실행 자체의 결함은
아니지만, Gemini 쿼터 게이트를 READY로 판정하려면 AI Studio에서 관측한 실제 한도에
근거해 값을 결정하고 기록해야 한다.

- `GEMINI_RESEARCH_MODEL`
- `GEMINI_FAST_MODEL`
- `GEMINI_RESEARCH_RPM_BUDGET`
- `GEMINI_FAST_RPM_BUDGET`
- `LLM_PROVIDER_MODE`

`TESTER_PASSWORD`는 애플리케이션 런타임 필수값이 아니라 `tester:add`를 비대화형으로
실행할 때만 필요한 프로비저닝용 비밀값이다. Netlify 런타임 설정에 저장할 필요는 없다.

## 실행 결과

Netlify CLI가 production 컨텍스트의 환경변수를 프로세스에 주입한 상태에서 저장소에
설치된 `tsx` 실행 파일로 다음 작업을 수행했다.

```text
db-migrate.ts → ✅ 마이그레이션 완료 (exit 0)
db-seed.ts    → ✅ 시드 완료 (exit 0)
```

두 실행에서 Netlify AI Gateway 토큰 조회가 `Forbidden`으로 경고됐지만, 애플리케이션
환경변수 주입과 DB 명령은 정상 완료됐다. 이 프로젝트의 Gemini 연동은
`GEMINI_API_KEY`를 직접 사용하므로 해당 경고는 위 DB 결과를 무효화하지 않는다.

마이그레이션/시드와 독립된 읽기 전용 조회 결과는 다음과 같다.

| 확인 항목 | 결과 |
|-----------|------|
| 적용된 마이그레이션 | 7건 (`0000`~`0006`) |
| `case_jobs` | 테이블 존재, 8개 컬럼 확인 |
| `evidence` 기준 데이터 | 21건 |
| `allowed_testers` | 3건 |
| `users` | 3건 |
| `reservations` | 0건 |

`reservations`와 `case_jobs` 테이블 조회까지 성공했으므로 M1의 원격 리스 스키마와
비동기 처리용 migration 0006이 실제 Turso에 적용됐음을 확인했다. 빈 `reservations`는
현재 실행 중인 파이프라인 리스가 없다는 정상 상태다.

## 추가 발견

- production과 deploy-preview의 `BETTER_AUTH_URL`이 모두 Deploy Preview URL을
  가리킨다. 현재 Preview 검증에는 맞지만, production 배포 전에 production 컨텍스트는
  최종 Production URL로 분리해야 한다.
- Deploy Preview 방문자 접근 제한은 이후 Public 전환으로 해소됐으며 `/`, `/login`,
  `/api/auth/get-session`이 HTTP 200을 반환한다(아래 재확인 참고).
- Production URL의 `/`는 HTTP 404를 반환한다. 아직 검증할 production 배포가 없다.

## 다른 readiness 항목에 남은 조건

1. 실제 배포 도메인에서 로그인·세션·보호 페이지 접근을 확인한다.
2. 같은 도메인에서 실 Gemini 스모크, 처리시간 3회 측정, 서로 다른 사용자 동시 부하,
   원격 리스/복구 검증을 수행한다.
3. 실제 AI Studio 쿼터를 확인하고 관측값에 근거한 RPM budget을 기록한다.

## Preview 공개 전환 후 재확인

사용자가 Deploy Preview를 Public으로 변경한 뒤 동일한 Preview 도메인에서 재확인했다.

| 요청 | 결과 | 의미 |
|------|------|------|
| `/` | HTTP 200 | Netlify 방문자 보호가 해제되고 앱 응답 도달 |
| `/login` | HTTP 200 | 로그인 페이지 렌더링 응답 확인 |
| `/api/auth/get-session` | HTTP 200 | 인증 API가 앱 레이어에서 응답 |
| `/cases/new` | HTTP 307 → `/login` | 비로그인 보호 라우트 가드 정상 |

따라서 Preview 접근 제한은 해소됐다. 계정은 생성됐지만 실제 로그인·세션 수립,
Gemini 호출, DB 영속화, 동시부하 검증은 아직 수행하지 않았다.

## 테스터 프로비저닝 재확인

Netlify production 컨텍스트를 주입해 `tester:add`를 세 번 실행한 뒤, 읽기 전용 조회로
각 이메일의 두 테이블 행을 확인했다.

| 계정 | `allowed_testers` | `users` |
|------|------------------|---------|
| `khwan3927@gmail.com` | 1 | 1 |
| `fucktube3927@gmail.com` | 1 | 1 |
| `indiatube3927@gmail.com` | 1 | 1 |

비밀번호와 인증 토큰은 출력하거나 저장하지 않았다.

## 빠른 실패 원인 진단

사용자가 Preview에서 첫 분석 요청을 1분 이내에 실패했다고 보고해, Netlify
production 컨텍스트의 실제 `GEMINI_API_KEY`를 주입한 동일 파이프라인을 배포 도메인
밖에서 1회 실행했다. 결과는 다음과 같다.

```text
PIPELINE_OK elapsedMs=81227
```

Gemini 두 모델의 단일 호출 스모크는 모두 성공했으므로 키 또는 모델 식별자 자체의
실패는 아니다. 다만 전체 파이프라인은 약 81초가 걸려 Netlify 동기 함수의 공식
60초 상한을 초과한다. 이 측정은 로컬 프로세스 진단이므로 readiness의 실제 배포
도메인 3회 측정 READY 근거로 사용하지 않지만, Preview의 “네트워크 오류” 원인을
설명하는 직접적인 근거다. 현재 구조를 유지하려면 60초 초과 동기 실행을 지원하는
호스팅으로 옮기거나, 분석을 비동기 작업으로 분리해야 한다.

## 비동기 migration 0006 적용 재확인

비동기 작업 경로가 Deploy Preview에 반영된 뒤 Netlify production 컨텍스트를 주입해
`scripts/db-migrate.ts`를 다시 실행했고 exit 0을 확인했다. 이어 애플리케이션 명령과
분리된 읽기 전용 조회로 다음 결과를 확인했다.

- 적용된 마이그레이션: 7건
- 원격 테이블: `__drizzle_migrations`를 포함해 12개
- `case_jobs` 컬럼: `id`, `owner_user_id`, `lease_id`, `input`, `status`, `case_id`,
  `created_at`, `updated_at`
- `evidence`: 21건
- `users`: 3건
- `allowed_testers`: 3건

실행 중 표시된 Netlify AI Gateway 토큰 `Forbidden` 경고는 직접 사용하는
`GEMINI_API_KEY` 및 Turso 연결과 무관하며, 마이그레이션과 읽기 검증은 모두 성공했다.
