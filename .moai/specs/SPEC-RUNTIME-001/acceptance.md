# Acceptance Criteria — SPEC-RUNTIME-001

모든 AC는 Given-When-Then 형식으로 이진(binary) 검증 가능하게 작성한다. 각 AC는 검증 대상 요구사항(REQ-RUNTIME-XXX)을 **Traces** 라인으로 명시적으로 추적한다. AC 개수: 19개 (Tier L 상한 25개 이내). REQ 20개 전체가 최소 1개의 AC에 의해 추적된다(§C 추적 매트릭스 참고).

## §A. AC 매트릭스

### AC-RUNTIME-001 — 마이그레이션 실제 적용
**Traces**: REQ-RUNTIME-001
- **Given** 스키마가 적용되지 않은 빈 libSQL 인스턴스를 `TURSO_DATABASE_URL`이 가리키고 있을 때
- **When** `pnpm db:migrate`를 실행하면
- **Then** 명령이 exit 0으로 종료하고, 해당 인스턴스에 `lib/db/schema.ts`가 정의한 9개 테이블(`user`, `session`, `account`, `verification`, `cases`, `evidence`, `reports`, `feedback`, `allowed_testers`)이 모두 존재한다.

### AC-RUNTIME-002 — 마이그레이션 재실행 안전성 (idempotent)
**Traces**: REQ-RUNTIME-002
- **Given** AC-RUNTIME-001이 이미 성공적으로 적용된 DB가 있을 때
- **When** `pnpm db:migrate`를 한 번 더 실행하면
- **Then** 명령이 exit 0으로 종료하고, 오류 없이 "적용할 마이그레이션 없음"에 해당하는 결과가 되며, 테이블 정의가 1차 실행 직후와 동일하다.

### AC-RUNTIME-003 — `file:` 스킴 capability gate
**Traces**: REQ-RUNTIME-003
- **Given** `TURSO_DATABASE_URL`이 `file:./.tmp/e2e.db`로 설정되고 `TURSO_AUTH_TOKEN`이 설정되지 않았을 때
- **When** 환경변수 검증 모듈(`lib/env.ts`)과 DB 클라이언트 생성 함수를 호출하면
- **Then** 검증이 통과하고 DB 연결이 성공한다. 반대로 `TURSO_DATABASE_URL`이 `libsql://`로 시작하고 `TURSO_AUTH_TOKEN`이 없으면 검증이 실패한다(두 방향 모두 검증).

### AC-RUNTIME-004 — 시드 데이터 DB 적재
**Traces**: REQ-RUNTIME-004
- **Given** 마이그레이션이 적용되고 `evidence` 테이블이 비어 있는 DB가 있을 때
- **When** `pnpm db:seed`를 실행하면
- **Then** 명령이 exit 0으로 종료하고, `evidence` 테이블의 행 수가 `db/seed/evidence.json`의 레코드 수와 일치하며, 각 행의 `id`/`category`/`title`/`content`가 JSON 값과 일치한다.

### AC-RUNTIME-005 — 시드 재실행 안전성 (idempotent)
**Traces**: REQ-RUNTIME-005
- **Given** AC-RUNTIME-004이 이미 성공한 DB가 있을 때
- **When** `pnpm db:seed`를 한 번 더 실행하면
- **Then** 명령이 exit 0으로 종료하고, `evidence` 테이블의 행 수가 1차 실행 직후와 정확히 동일하다(중복 행 0건).

### AC-RUNTIME-006 — allowed_testers 등록 및 재실행 안전성
**Traces**: REQ-RUNTIME-006, REQ-RUNTIME-009
- **Given** 마이그레이션이 적용된 DB와 아직 등록되지 않은 테스터 이메일이 있을 때
- **When** 테스터 프로비저닝 명령을 해당 이메일로 실행하고, 이어서 동일 이메일로 한 번 더 실행하면
- **Then** 1차 실행 후 `allowed_testers`에 해당 이메일 행이 정확히 1건 존재하고, 2차 실행 후에도 `allowed_testers`·`user`·`account` 각 테이블의 해당 이메일 관련 행 수가 여전히 각각 1건이다(중복 생성 0건).

### AC-RUNTIME-007 — 프로비저닝된 계정의 실제 로그인 성공
**Traces**: REQ-RUNTIME-007
- **Given** 테스터 프로비저닝 명령으로 이메일과 비밀번호가 등록된 계정이 있고, `disableSignUp: true` 설정이 그대로 유지되어 있을 때
- **When** 해당 이메일과 비밀번호로 `/login`을 통해 로그인을 시도하면
- **Then** 로그인이 성공하여 세션이 생성되고 보호된 경로(`/cases/new`)에 접근할 수 있다. 이 AC는 "행이 삽입되었다"가 아니라 "실제로 로그인된다"를 검증 대상으로 삼는다(plan.md §E 위험 대응).

### AC-RUNTIME-008 — 커밋 대상 파일 내 평문 시크릿 부재
**Traces**: REQ-RUNTIME-008
- **Given** 이 SPEC이 추가·수정한 모든 커밋 대상 파일(`scripts/**`, `e2e/**`, `lib/env.ts`, `package.json`, `.env.local.example`, 런북 문서, SPEC 아티팩트)이 있을 때
- **When** 해당 파일들에 대해 시크릿 패턴을 정적 검사하면
- **Then** (1) 실제 비밀번호·API 키·인증 토큰 값이 0건 발견되고, (2) `.env.local.example`과 런북의 모든 시크릿 항목이 `<...>` 형태의 플레이스홀더이며, (3) 프로비저닝 스크립트에 비밀번호를 CLI 인자로 받는 경로가 존재하지 않고, (4) **E2E가 실행 시점에 생성하는 임시 자격증명(테스터 비밀번호, E2E 전용 `BETTER_AUTH_SECRET`)이 어떤 커밋 대상 파일에도 리터럴 문자열로 존재하지 않는다** — 두 값은 프로세스 환경에만 존재해야 하며(`design.md` §3.4), 픽스처·설정·스냅샷 파일에 기록된 흔적이 0건이어야 한다.

### AC-RUNTIME-009 — 환경변수 누락 시 **부팅 시점** fail-fast
**Traces**: REQ-RUNTIME-010
- **Given** 필수 환경변수 중 하나 이상(예: `BETTER_AUTH_SECRET`)이 설정되지 않은 환경일 때
- **When** 애플리케이션을 실제로 기동하면(빌드 산출물을 `pnpm start`로 기동)
- **Then** (1) 기동이 즉시 실패하여 프로세스가 요청 수신 가능 상태에 **도달하지 못하고**, (2) 그 실패 출력에 누락된 변수의 정확한 이름과 그 변수가 왜 필요한지에 대한 설명 문구가 모두 포함된다. **이 AC는 부팅 경로로만 검증한다** — 검증 함수를 직접 호출해 얻은 결과는 이 AC의 증거가 될 수 없다. 기동이 성공한 뒤 첫 요청에서야 실패가 드러나는 형태는 FAIL이다(지연 실패는 REQ-RUNTIME-010이 닫으려는 대상이며, `design.md` §6이 이 경로로의 후퇴를 금지한다).

### AC-RUNTIME-010 — 오류 메시지의 시크릿 미노출
**Traces**: REQ-RUNTIME-011
- **Given** `BETTER_AUTH_SECRET` 등 일부 환경변수가 잘못된 형식의 **값이 설정된** 상태일 때
- **When** 환경변수 검증이 실패하여 오류 메시지를 생성하면
- **Then** 오류 메시지 문자열에 해당 환경변수의 실제 값이 부분 문자열로도 포함되지 않는다.

### AC-RUNTIME-011 — E2E: 로그인 성공 및 미등록 이메일 거부
**Traces**: REQ-RUNTIME-012
- **Given** E2E 글로벌 셋업으로 테스터 A가 프로비저닝된 로컬 파일 DB가 있을 때
- **When** E2E 스위트가 (1) 테스터 A의 자격증명으로 로그인하고, (2) `allowed_testers`에 없는 이메일로 로그인을 시도하면
- **Then** (1)은 로그인에 성공해 보호 경로로 진입하고, (2)는 로그인이 거부되어 세션이 생성되지 않는다.

### AC-RUNTIME-012 — E2E: 사건 입력 → 처리 → 저장 → 리포트 조회
**Traces**: REQ-RUNTIME-013
- **Given** 로그인된 테스터 A 세션과 마이그레이션·시드가 완료된 DB가 있을 때
- **When** E2E 스위트가 `/cases/new`에서 PII를 포함하지 않는 유효한 사건을 입력해 제출하면
- **Then** `/api/cases`가 201을 반환하고, `cases` 테이블에 `owner_user_id`가 테스터 A인 행이, `reports` 테이블에 해당 `case_id`를 가진 행이 각각 생성되며, `/cases/[caseId]` 페이지에서 생성된 리서치 리포트 내용이 렌더링된다.

### AC-RUNTIME-013 — E2E: 전문가 피드백 저장
**Traces**: REQ-RUNTIME-014
- **Given** AC-RUNTIME-012으로 생성된 사건 상세 화면에 테스터 A가 접근해 있을 때
- **When** E2E 스위트가 피드백 내용을 입력해 제출하면
- **Then** `feedback` 테이블에 해당 `case_id` + 테스터 A의 `user_id` + 입력한 `content`를 가진 행이 1건 생성된다.

### AC-RUNTIME-014 — E2E: tenant isolation (타 사용자 사건 접근 차단)
**Traces**: REQ-RUNTIME-015
- **Given** 테스터 A가 소유한 사건과, 별도로 프로비저닝된 테스터 B의 로그인 세션이 있을 때
- **When** E2E 스위트가 테스터 B 세션으로 테스터 A의 `/cases/[caseId]`에 접근하면
- **Then** 사건 내용이 렌더링되지 않고 접근이 거부된다(404 또는 접근 거부 응답).

### AC-RUNTIME-015 — E2E: 단일 명령 재현성 + 로컬 파일 DB 격리
**Traces**: REQ-RUNTIME-016, REQ-RUNTIME-017
- **Given** `.tmp/e2e.db`가 존재하지 않는 깨끗한 작업 트리와, **테스터 비밀번호를 포함해 어떤 시크릿도 셸에 미리 설정되어 있지 않은** 상태(개발자의 실제 Turso 자격증명·`BETTER_AUTH_SECRET`·`TESTER_PASSWORD` 모두 미설정)일 때
- **When** 개발자가 `pnpm test:e2e` 단일 명령을 실행하면
- **Then** (1) 사람의 수동 조작 없이 DB 초기화·마이그레이션·시드·테스터 프로비저닝·앱 기동·전체 시나리오 실행·앱 종료가 자동 수행되어 exit 0으로 종료하고, (2) 실행 중 접근한 DB는 `file:` 스킴 로컬 파일이며 원격 Turso 인스턴스에 대한 쓰기가 발생하지 않는다.

### AC-RUNTIME-016 — 기존 품질 게이트 유지
**Traces**: REQ-RUNTIME-018
- **Given** 이 SPEC의 모든 변경이 반영된 작업 트리가 있을 때
- **When** `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`를 각각 실행하면
- **Then** 4개 명령이 모두 exit 0으로 종료한다. 특히 `pnpm test`(Vitest)는 `e2e/**`를 수집하지 않아 브라우저 없이도 통과한다.

### AC-RUNTIME-017 — 아키텍처 경계 보존
**Traces**: REQ-RUNTIME-019
- **Given** 이 SPEC의 모든 변경이 반영된 작업 트리가 있을 때
- **When** SPEC-SCAFFOLD-001이 확립한 경계를 정적 검사하면
- **Then** (1) `git diff`상 `lib/pipeline/**`, `lib/ai/**`, `lib/validation/**`, `lib/db/schema.ts`에 대한 동작 변경이 0건이고, (2) `lib/pipeline/`에서 `@google/genai` import가 여전히 0건이며, (3) `db/migrations/`에 새 마이그레이션 파일이 추가되지 않았다(스키마 불변).

### AC-RUNTIME-018 — 런북 문서 완결성
**Traces**: REQ-RUNTIME-020
- **Given** 프로젝트를 처음 접하는 운영자와 이 SPEC이 생성한 런북 문서가 있을 때
- **When** 운영자가 문서에 기재된 절차만을 순서대로 따라가면
- **Then** (1) 환경변수 설정 → 마이그레이션 적용 → 시드 → 테스터 계정 생성 → **E2E 사전 준비** → E2E 실행의 6개 단계가 모두 실행 가능한 구체적 명령으로 기재되어 있고, (2) 문서 내 모든 시크릿 항목이 플레이스홀더이며 실제 값이 0건이고, (3) 각 시크릿의 발급처(Turso 대시보드, Google AI Studio 등)가 명시되어 있다.
- **E2E 사전 준비 단계의 필수 내용**: (a) 브라우저 바이너리 설치(`pnpm exec playwright install --with-deps chromium`), (b) **E2E 실행에 필요한 시크릿을 운영자가 미리 설정할 필요가 없다는 사실과 그 이유** — 테스터 비밀번호와 E2E 전용 `BETTER_AUTH_SECRET`은 `e2e/global-setup.ts`가 실행 시점에 생성해 프로세스 환경으로만 전달하므로(`design.md` §3.4), 운영자가 `.env.local`이나 셸에 별도 값을 넣는 절차가 없다. 이 설명이 없으면 운영자는 앞 단계에서 익힌 "시크릿은 직접 발급해 넣는다"는 패턴을 E2E에도 적용하려다 막힌다.

### AC-RUNTIME-019 — 검증 함수 단위: 누락 변수 전량 열거
**Traces**: REQ-RUNTIME-010
- **Given** 필수 환경변수가 **2개 이상** 동시에 누락된 상태를 구성했을 때
- **When** `lib/env.ts`의 환경변수 검증 함수를 단위 테스트에서 직접 호출하면
- **Then** 누락된 변수가 **전부** 열거되며(첫 번째에서 중단하지 않는다), 각 항목에 변수명과 필요 이유가 함께 담긴다.
- **비고**: AC-RUNTIME-009(부팅 경로)와 검증 대상이 다르다 — 009는 "언제 실패하는가"(부팅 시점)를, 이 AC는 "무엇을 알려주는가"(전량 열거 + 설명)를 검증한다. 단위 호출로 부팅 시점 요구를 대신 만족시킬 수 없도록 분리했다.

## §B. Definition of Done

- [ ] AC-RUNTIME-001 ~ 019 전체 PASS
- [ ] `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check` 모두 exit 0
- [ ] `pnpm test:e2e` exit 0 (깨끗한 작업 트리 + 원격 Turso 자격증명 없는 상태에서)
- [ ] 커밋 대상 파일 내 평문 시크릿 0건 (AC-RUNTIME-008)
- [ ] `db/migrations/`에 신규 마이그레이션 파일 추가 없음 (스키마 불변, AC-RUNTIME-017)
- [ ] E2E DB 파일이 커밋되지 않음 — `git check-ignore -v .tmp/e2e.db`가 성공(exit 0)으로 무시 규칙을 보고한다. 기존 `*.tmp` 글롭이 이미 이를 덮으므로 `.gitignore` 항목 추가는 이 확인이 실패할 때만 수행한다
- [ ] spec.md §4 Out of Scope 6개 항목이 구현 범위에 포함되지 않았음을 확인

## §C. REQ ↔ AC 추적 매트릭스

| REQ | 추적 AC |
|-----|---------|
| REQ-RUNTIME-001 | AC-RUNTIME-001 |
| REQ-RUNTIME-002 | AC-RUNTIME-002 |
| REQ-RUNTIME-003 | AC-RUNTIME-003 |
| REQ-RUNTIME-004 | AC-RUNTIME-004 |
| REQ-RUNTIME-005 | AC-RUNTIME-005 |
| REQ-RUNTIME-006 | AC-RUNTIME-006 |
| REQ-RUNTIME-007 | AC-RUNTIME-007 |
| REQ-RUNTIME-008 | AC-RUNTIME-008 |
| REQ-RUNTIME-009 | AC-RUNTIME-006 |
| REQ-RUNTIME-010 | AC-RUNTIME-009 (부팅 경로), AC-RUNTIME-019 (검증 함수 단위) |
| REQ-RUNTIME-011 | AC-RUNTIME-010 |
| REQ-RUNTIME-012 | AC-RUNTIME-011 |
| REQ-RUNTIME-013 | AC-RUNTIME-012 |
| REQ-RUNTIME-014 | AC-RUNTIME-013 |
| REQ-RUNTIME-015 | AC-RUNTIME-014 |
| REQ-RUNTIME-016 | AC-RUNTIME-015 |
| REQ-RUNTIME-017 | AC-RUNTIME-015 |
| REQ-RUNTIME-018 | AC-RUNTIME-016 |
| REQ-RUNTIME-019 | AC-RUNTIME-017 |
| REQ-RUNTIME-020 | AC-RUNTIME-018 |

## §D. 검증되지 않는 항목 (참고)

- **원격 Turso 인스턴스에 대한 자동 검증**: AC-RUNTIME-015가 로컬 `file:` DB 격리를 요구하므로, 원격 Turso 연결의 네트워크·인증 실패 경로는 자동 E2E 대상이 아니다. AC-RUNTIME-001/002는 로컬·원격 어느 인스턴스에서도 성립하지만, 원격 확인은 런북(AC-RUNTIME-018)의 수동 절차로 보완한다.
- **로그인 시도 rate-limiting**: spec.md §5 잔여 위험으로 남으며 이 SPEC의 AC 대상이 아니다.
- **Gemini API 실호출**: 파이프라인이 mock 구현을 유지하므로(REQ-RUNTIME-019) E2E 흐름에서 실제 Gemini 호출은 발생하지 않는다. `GEMINI_API_KEY`는 환경변수 검증(AC-RUNTIME-009) 대상일 뿐 실호출 검증 대상이 아니다.
