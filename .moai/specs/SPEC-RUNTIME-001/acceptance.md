# Acceptance Criteria — SPEC-RUNTIME-001

모든 AC는 Given-When-Then 형식으로 이진(binary) 검증 가능하게 작성한다. 각 AC는 검증 대상 요구사항(REQ-RUNTIME-XXX)을 **Traces** 라인으로 명시적으로 추적한다. AC 개수: 22개 (Tier L 상한 25개 이내). REQ 21개 전체가 최소 1개의 AC에 의해 추적된다(§C 추적 매트릭스 참고).

> **개정 v0.4.0**: 구현 착수 승인 전 최종 정합성 점검(`plan.md` §A.4)에 따라 AC-RUNTIME-022의 검증 범위를 `run-e2e.ts`가 직접 spawn하는 Playwright 러너 구간으로 좁히고, AC-RUNTIME-015·AC-RUNTIME-021의 Given이 전제하는 sentinel/테스트 `.env.local` 상태를 안전하게 만들고 복원하는 절차(`design.md` §3.6)를 참조로 추가했으며, AC-RUNTIME-011의 잔존 표현을 정정했다. **어떤 AC의 판정 기준도 낮추지 않았다** — AC-RUNTIME-022는 자신의 Given/When으로 만들어낼 수 없던 관측(앱 서버 프로세스 env)을 주장에서 제거했을 뿐이며, REQ-RUNTIME-016의 커버리지는 AC-RUNTIME-022(구조적)와 AC-RUNTIME-015(기능적)가 여전히 함께 완전히 충족한다.
>
> **개정 v0.3.0**: 3차 설계 검토 3건(`plan.md` §A.3)에 따라 AC-RUNTIME-015를 갱신하고 AC-RUNTIME-021·022를 신설했다. **어떤 AC의 판정 기준도 낮추지 않았다** — 두 건은 **강화**이고 한 건은 **과잉주장 제거**다: (1) AC-RUNTIME-021 신설로 독립 CLI의 명시적 `.env.local` 로드가 검증 대상이 되고, (2) AC-RUNTIME-015의 `.env.local` Given이 실제 원격 자격증명 → **sentinel 값**으로 교체되어 우선순위 가정이 틀렸을 때의 blast radius가 제거되며(검증 대상 성질은 불변), (3) AC-RUNTIME-015 (3)항의 "로그인 성공이 시크릿 동일성을 입증한다"는 **논리적 과잉주장을 삭제**하고 그 성질을 직접 관측하는 AC-RUNTIME-022를 신설했다 — 삭제가 아니라 **간접 추론 → 직접 관측으로의 승격**이다.
>
> **개정 v0.2.0**: 구현 접근 방식 3건 개정(`plan.md` §A.2)에 따라 AC-RUNTIME-007/008/009/015/017/018/019를 갱신하고 AC-RUNTIME-020을 신설했다. **어떤 AC의 판정 기준도 낮추지 않았다** — 특히 AC-RUNTIME-007의 "실제 로그인 성공" 기준은 그대로다.

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
- **Given** 테스터 프로비저닝 명령으로 이메일과 비밀번호가 등록된 계정이 있고, 프로덕션 `lib/auth/config.ts`의 `disableSignUp: true` 설정이 그대로 유지되어 있을 때
- **When** 해당 이메일과 비밀번호로 `/login`을 통해 로그인을 시도하면
- **Then** 로그인이 성공하여 세션이 생성되고 보호된 경로(`/cases/new`)에 접근할 수 있다. 이 AC는 "행이 삽입되었다"가 아니라 "실제로 로그인된다"를 검증 대상으로 삼는다(plan.md §E 위험 대응). **이 판정 기준은 개정 v0.2.0에서 완화되지 않는다.**
- **폴백 트리거 (개정 v0.2.0)**: 이 AC의 실패는 **경로 전환의 근거가 아니다**. 프로비저닝 경로를 `research.md` §3의 폴백(B → C)으로 전환하는 것은 **비마운트 인스턴스에서의 `auth.api.signUpEmail` 호출이 기술적으로 불가능함이 확인된 경우에만** 허용된다. 초판의 "AC-RUNTIME-007 연속 2회 실패 시 전환" 트리거는 폐기한다 — 올바르게 구현된 공식 API 경로는 확률적으로 실패하는 성질의 것이 아니므로, 런타임 실패는 경로 문제가 아니라 구현 결함 신호로 다루고 수정으로 대응한다. 폴백을 택하는 경우 불가능성을 확정한 관측(무엇을 시도했고 무엇이 관측됐는지)을 `progress.md` §E.2에 기록해야 하며, 관측 없는 전환은 금지한다.

### AC-RUNTIME-008 — 커밋 대상 파일 내 평문 시크릿 부재
**Traces**: REQ-RUNTIME-008
- **Given** 이 SPEC이 추가·수정한 모든 커밋 대상 파일(`scripts/**`, `e2e/**`, `lib/env.ts`, `package.json`, `.env.local.example`, 런북 문서, SPEC 아티팩트)이 있을 때
- **When** 해당 파일들에 대해 시크릿 패턴을 정적 검사하면
- **Then** (1) 실제 비밀번호·API 키·인증 토큰 값이 0건 발견되고, (2) `.env.local.example`과 런북의 모든 시크릿 항목이 `<...>` 형태의 플레이스홀더이며, (3) 프로비저닝 스크립트에 비밀번호를 CLI 인자로 받는 경로가 존재하지 않고, (4) **E2E가 실행 시점에 생성하는 임시 자격증명(테스터 비밀번호, E2E 전용 `BETTER_AUTH_SECRET`)이 어떤 커밋 대상 파일에도 리터럴 문자열로 존재하지 않는다** — 두 값은 `scripts/run-e2e.ts`가 생성해 프로세스 환경으로만 전달하며(`design.md` §3.4), 픽스처·설정·스냅샷 파일에 기록된 흔적이 0건이어야 한다. 특히 `playwright.config.ts`의 `webServer.env`에 두 값이 기재되어 있지 않아야 한다(상속으로 전달되므로 재기재는 불필요하며, 재기재 자체가 시크릿의 설정 파일 유입 경로가 된다).

### AC-RUNTIME-009 — 환경변수 누락 시 **앱 런타임 부팅 시점** fail-fast
**Traces**: REQ-RUNTIME-010
- **Given** `app` 스코프(`design.md` §3.1)가 요구하는 환경변수 중 하나 이상(예: `BETTER_AUTH_SECRET`)이 설정되지 않은 환경일 때
- **When** 애플리케이션을 실제로 기동하면(빌드 산출물을 `pnpm start`로 기동)
- **Then** (1) 기동이 즉시 실패하여 프로세스가 요청 수신 가능 상태에 **도달하지 못하고**, (2) 그 실패 출력에 누락된 변수의 정확한 이름과 그 변수가 왜 필요한지에 대한 설명 문구가 모두 포함된다. **이 AC는 부팅 경로로만 검증한다** — 검증 함수를 직접 호출해 얻은 결과는 이 AC의 증거가 될 수 없다. 기동이 성공한 뒤 첫 요청에서야 실패가 드러나는 형태는 FAIL이다(지연 실패는 REQ-RUNTIME-010이 닫으려는 대상이며, `design.md` §6이 이 경로로의 후퇴를 금지한다).
- **비고 (개정 v0.2.0)**: 목적별 스코프 도입은 이 AC를 완화하지 않는다. 검증 **시점**(부팅)은 그대로이며, 바뀐 것은 `app` 스코프가 요구하는 **변수 집합**이다. 어떤 변수가 어떤 스코프에 속하는지는 AC-RUNTIME-020이 별도로 검증한다.

### AC-RUNTIME-010 — 오류 메시지의 시크릿 미노출
**Traces**: REQ-RUNTIME-011
- **Given** `BETTER_AUTH_SECRET` 등 일부 환경변수가 잘못된 형식의 **값이 설정된** 상태일 때
- **When** 환경변수 검증이 실패하여 오류 메시지를 생성하면
- **Then** 오류 메시지 문자열에 해당 환경변수의 실제 값이 부분 문자열로도 포함되지 않는다.

### AC-RUNTIME-011 — E2E: 로그인 성공 및 미등록 이메일 거부
**Traces**: REQ-RUNTIME-012
- **Given** `scripts/run-e2e.ts` 진입점(`design.md` §3.3)이 테스터 A를 프로비저닝한 로컬 파일 DB가 있을 때 (정정 v0.4.0 — 초판의 "E2E 글로벌 셋업"·`e2e/global-setup.ts` 표현은 v0.2.0에서 이미 단일 진입점 모델로 교체되었으나 이 AC의 표현만 갱신이 누락되어 있었다)
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

### AC-RUNTIME-015 — E2E: 단일 명령 재현성 + 시크릿 공유 보장 + 로컬 파일 DB 격리
**Traces**: REQ-RUNTIME-016, REQ-RUNTIME-017
- **Given** `.tmp/e2e.db`가 존재하지 않는 깨끗한 작업 트리와, **테스터 비밀번호를 포함해 어떤 시크릿도 셸에 미리 설정되어 있지 않은** 상태(개발자의 실제 Turso 자격증명·`BETTER_AUTH_SECRET`·`TESTER_PASSWORD` 모두 미설정)일 때
- **Given (현실적 상태 — 필수, 개정 v0.3.0: sentinel 값)** 그와 **동시에** `.env.local`이 디스크에 존재하고 그 안에 **원격 형태의 sentinel 자격증명**이 기입되어 있을 때 — 구체적으로 `TURSO_DATABASE_URL=libsql://sentinel-nonexistent-host.invalid` 와 형태만 갖춘 더미 `TURSO_AUTH_TOKEN`. 이는 이 SPEC 자신의 런북(`research.md` §2: `.env.local.example` → `.env.local` 복사 후 값 기입)을 따른 개발자의 머신 상태를 **형태 그대로 재현**한다 — 스킴이 `libsql://`이므로 `lib/env.ts`의 capability gate가 실제 원격 케이스와 **같은 분기**를 탄다. "셸에 export된 시크릿이 없다"와 "`.env.local`이 없다"는 서로 **다른 조건**이며, 런북을 따른 개발자에게 현실적인 것은 전자뿐이다. 따라서 `.env.local` 부재 상태만으로 얻은 결과는 이 AC의 증거로 인정하지 않는다. **이 sentinel 상태를 디스크에 만들고 검증 종료 후 원상복구하는 절차는 `design.md` §3.6이 정의하며(신규 v0.4.0), 개발자가 이미 보유한 실제 `.env.local`을 파괴하지 않는다**
- **[HARD] Given 제약 — 실제 자격증명 사용 금지 (개정 v0.3.0)**: 이 AC의 **어떤 검증 방법도 실제로 동작하는 원격 Turso 자격증명을 사용해서는 안 된다.** 이유는 이 시험의 구조에 있다 — 검증 대상 명제가 "상속된 값이 `.env.local`을 이긴다"인데, **그 명제가 거짓이면 시험 자체가 실제 프로덕션 Turso 인스턴스에 연결하고 기록한다.** 즉 검증 절차가 REQ-RUNTIME-017이 막으려는 바로 그 사고를 유발하는 경로가 된다. 가정이 참일 때만 안전한 시험은 그 가정을 검증하는 데 쓸 수 없다. sentinel 호스트의 `.invalid` TLD는 **RFC 2606 §2**가 예약하고 **RFC 6761 §6.4**가 이름 해석 시 즉시 부정 응답을 반환하도록 규정하므로, 실패가 규격상 보장된다(`research.md` §0.2 결론 3)
- **When** 개발자가 `pnpm test:e2e` 단일 명령을 실행하면
- **Then** (1) 사람의 수동 조작 없이 시크릿 생성·DB 초기화·마이그레이션·시드·테스터 프로비저닝·앱 기동·전체 시나리오 실행·앱 종료가 자동 수행되어 exit 0으로 종료하고, (2) 실행 중 접근한 DB는 `file:` 스킴 로컬 파일이며 sentinel 호스트를 포함한 **어떤 원격 인스턴스에 대한 연결·읽기·쓰기도 발생하지 않으며**, (3) 로그인 시나리오(AC-RUNTIME-011)를 포함한 전체 시나리오가 통과한다 — 이는 **실제 인증 흐름이 end-to-end로 동작한다**는 기능적 검증이다.
- **(3)항의 주장 범위 (개정 v0.3.0 — 과잉주장 제거)**: (3)은 **인증 흐름의 동작**만을 주장하며, 서버 프로세스와 테스트 프로세스의 `BETTER_AUTH_SECRET` **값 동일성을 입증하지 않는다**. v0.2.0은 "로그인 통과 사실 자체가 시크릿 일치를 입증한다"고 기술했으나 이는 논리적 과잉이었다 — 로그인 성공은 인증 흐름 전체가 동작한다는 증거이지 특정 환경변수 값의 동일성에 대한 직접 증거가 아니며, "불일치했다면 실패했을 것"이라는 역추론은 로그인을 성공시킬 다른 경로(세션 쿠키 재사용, 캐시된 세션, 재시도)가 모두 배제되었을 때만 성립하는데 이 SPEC은 그 배제를 확보하지 않았다. **시크릿 공유는 AC-RUNTIME-022가 구조적으로(전달된 env 객체를 직접 관측해) 검증한다.** 이 분리는 검증을 약화시키지 않는다 — 간접 추론이 직접 관측으로 대체되므로 오히려 강화된다(`design.md` §3.5).
- **`.env.local` 무관 불변식 (REQ-RUNTIME-017의 유일한 검증 지점)**: 위 (2)는 `.env.local`의 **내용과 무관하게** 성립해야 한다 — `.env.local`에 원격 형태의 URL·토큰이 기입되어 있어도 E2E 실행은 로컬 파일 DB(`file:./.tmp/e2e.db`)만 접근한다. Next.js 서버 프로세스는 상속받은 `process.env` 외에 `.env.local`을 디스크에서 독립적으로 로드하므로, 이 불변식은 두 공급원 사이의 우선순위가 진입점 스크립트 쪽으로 확정되어야만 성립한다(`design.md` §3.4 "세 번째 공급원"). 그 우선순위는 플랜 단계에서 **문서 + 소스로 확인되었으나 실행으로 관측되지 않았다**(`research.md` §0.2 결론 2 / §6) — 따라서 이 항목은 M5에서 실측으로 닫아야 하며, 위 Given의 sentinel 상태에서 실행해 검증한다.
- **양방향 판정 (개정 v0.3.0)**: 이 시험은 두 결과 모두를 안전하게 처리해야 한다.
  - **상속된 `file:` 값이 우선하는 경우(기대)** → DB 작업이 로컬 파일 DB에 대해 정상 수행되고 전체 시나리오가 통과한다.
  - **`.env.local`의 sentinel 값이 우선한 경우(가정 붕괴)** → sentinel 호스트에 대한 **연결/DNS 실패로 안전하게 실패**해야 하며, 어떤 실제 원격 DB에도 도달하지 않는다. 이 실패는 버려지는 정보가 아니라 **우선순위 역전의 진단 신호**이며, "네트워크 일시 장애"로 오진해서는 안 된다 — `design.md` §6의 명시적 조치(로드 이후 재덮어쓰기 또는 `.env.local` 로드 회피)를 도입하라는 신호로 해석한다.
- **구조적 요건 (개정 v0.2.0, v0.3.0에서 유지)**: 시크릿 일치는 **프로세스 계보로 보장**되어야 한다 — `scripts/run-e2e.ts`가 시크릿을 생성한 뒤 Playwright를 자식으로 spawn하고, Playwright가 Next.js 서버를 자식으로 spawn하는 형태(`design.md` §3.4). `e2e/global-setup.ts`가 시크릿을 생성해 `webServer`로 전파되기를 기대하는 형태는 이 AC를 만족하지 못한다(프레임워크 훅 실행 순서에 대한 가정이므로 "보장"이 아니다). 검증: 저장소에 `e2e/global-setup.ts`가 존재하지 않고, 시크릿 생성 지점이 Playwright를 spawn하는 스크립트 안에 있음을 정적으로 확인한다. **v0.3.0 보완**: 이 요건은 계보의 **형태**(어디서 생성되고 누가 누구를 spawn하는가)를 정적으로 확인하며, 그 계보를 타고 **실제로 동일한 env 값이 전달되었는지**는 AC-RUNTIME-022가 전달된 env 객체를 직접 관측해 검증한다 — 형태 검증과 값 검증은 서로 다른 관측이므로 둘 다 필요하다.

### AC-RUNTIME-016 — 기존 품질 게이트 유지
**Traces**: REQ-RUNTIME-018
- **Given** 이 SPEC의 모든 변경이 반영된 작업 트리가 있을 때
- **When** `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`를 각각 실행하면
- **Then** 4개 명령이 모두 exit 0으로 종료한다. 특히 `pnpm test`(Vitest)는 `e2e/**`를 수집하지 않아 브라우저 없이도 통과한다.

### AC-RUNTIME-017 — 아키텍처 경계 보존
**Traces**: REQ-RUNTIME-019, REQ-RUNTIME-007 (항목 4 — 프로비저닝 전용 인스턴스 비노출)
- **Given** 이 SPEC의 모든 변경이 반영된 작업 트리가 있을 때
- **When** SPEC-SCAFFOLD-001이 확립한 경계를 정적 검사하면
- **Then** (1) `git diff`상 `lib/pipeline/**`, `lib/ai/**`, `lib/validation/**`, `lib/db/schema.ts`에 대한 동작 변경이 0건이고, (2) `lib/pipeline/`에서 `@google/genai` import가 여전히 0건이며, (3) `db/migrations/`에 새 마이그레이션 파일이 추가되지 않았고(스키마 불변), (4) **프로비저닝 전용 Better Auth 인스턴스가 어디에도 노출되지 않는다** — 구체적으로 (4a) `lib/auth/config.ts`의 `disableSignUp: true`가 `git diff`상 변경되지 않았고, (4b) `scripts/` 밖의 어떤 파일도 프로비저닝 인스턴스 생성 함수를 import하지 않으며, (4c) `app/**`의 어떤 라우트 핸들러·미들웨어도 그 인스턴스를 참조하지 않는다.
- **(4)항의 근거 (개정 v0.2.0)**: 프로비저닝 인스턴스는 셀프 가입이 허용된 설정을 갖는다(`design.md` §3.2.1). "공개 가입 표면이 열리지 않는다"는 주장은 **그 인스턴스에 네트워크로 도달할 경로가 없다**는 사실에만 근거하므로, 비노출이 깨지는 순간 주장 자체가 무효가 된다 — 따라서 이 불변식은 문서 경고가 아니라 정적 검증 대상이다.

### AC-RUNTIME-018 — 런북 문서 완결성
**Traces**: REQ-RUNTIME-020
- **Given** 프로젝트를 처음 접하는 운영자와 이 SPEC이 생성한 런북 문서가 있을 때
- **When** 운영자가 문서에 기재된 절차만을 순서대로 따라가면
- **Then** (1) 환경변수 설정 → 마이그레이션 적용 → 시드 → 테스터 계정 생성 → **E2E 사전 준비** → E2E 실행의 6개 단계가 모두 실행 가능한 구체적 명령으로 기재되어 있고, (2) 문서 내 모든 시크릿 항목이 플레이스홀더이며 실제 값이 0건이고, (3) 각 시크릿의 발급처(Turso 대시보드, Google AI Studio 등)가 명시되어 있으며, (4) **각 단계가 요구하는 환경변수가 그 단계에 한정해 기재**되어 있다 — 예컨대 마이그레이션 단계에 `BETTER_AUTH_SECRET`을 요구 항목으로 적지 않는다(`design.md` §3.1 스코프 매트릭스와 일치).
- **E2E 사전 준비 단계의 필수 내용**: (a) 브라우저 바이너리 설치(`pnpm exec playwright install --with-deps chromium`), (b) **E2E 실행에 필요한 시크릿을 운영자가 미리 설정할 필요가 없다는 사실과 그 이유** — 테스터 비밀번호와 E2E 전용 `BETTER_AUTH_SECRET`은 `scripts/run-e2e.ts`가 실행 시점에 생성해 프로세스 환경으로만 전달하므로(`design.md` §3.4), 운영자가 `.env.local`이나 셸에 별도 값을 넣는 절차가 없다. 이 설명이 없으면 운영자는 앞 단계에서 익힌 "시크릿은 직접 발급해 넣는다"는 패턴을 E2E에도 적용하려다 막힌다.
- **`GEMINI_API_KEY`에 대한 기재 (개정 v0.2.0)**: 런북은 이 변수가 **이번 SPEC의 앱 기동에는 요구되지 않는다**는 사실을 명시한다(파이프라인이 mock 구현을 유지하므로 소비 지점이 없다 — `design.md` §3.1 각주). 이 설명이 없으면 운영자는 발급받은 키를 넣어야 앱이 뜬다고 오해하고, 키가 없으면 진행을 멈춘다.

### AC-RUNTIME-019 — 검증 함수 단위: 누락 변수 전량 열거
**Traces**: REQ-RUNTIME-010
- **Given** 특정 스코프가 요구하는 환경변수가 **2개 이상** 동시에 누락된 상태를 구성했을 때
- **When** `lib/env.ts`의 환경변수 검증 함수를 해당 스코프로 단위 테스트에서 직접 호출하면
- **Then** 그 스코프에서 누락된 변수가 **전부** 열거되며(첫 번째에서 중단하지 않는다), 각 항목에 변수명과 필요 이유가 함께 담기고, 오류 메시지에 어떤 스코프의 검증인지가 포함된다.
- **비고**: AC-RUNTIME-009(부팅 경로)와 검증 대상이 다르다 — 009는 "언제 실패하는가"(부팅 시점)를, 이 AC는 "무엇을 알려주는가"(전량 열거 + 설명)를 검증한다. 단위 호출로 부팅 시점 요구를 대신 만족시킬 수 없도록 분리했다.

### AC-RUNTIME-020 — 검증 함수 단위: 목적별 스코프 좁힘 (양방향)
**Traces**: REQ-RUNTIME-010
- **Given** `design.md` §3.1 스코프 매트릭스가 정의한 네 스코프(`db` / `provision` / `app` / `e2e`)와, 변수 하나만 누락된 여러 환경 조합이 있을 때
- **When** 각 스코프로 `lib/env.ts`의 검증 함수를 단위 테스트에서 직접 호출하면
- **Then** 두 방향이 모두 성립한다:
  - **(양성)** 해당 스코프가 요구하는 변수가 누락되면 그 스코프의 검증이 **실패**한다. 최소한 다음 3건을 포함한다 — `db` 스코프에서 `TURSO_DATABASE_URL` 누락 시 실패, `provision` 스코프에서 `BETTER_AUTH_SECRET` 누락 시 실패, `app` 스코프에서 `BETTER_AUTH_URL` 누락 시 실패.
  - **(음성)** 해당 스코프가 요구하지 **않는** 변수가 누락되어도 그 스코프의 검증은 **통과**한다. 최소한 다음 3건을 포함한다 — `db` 스코프는 `BETTER_AUTH_SECRET`·`BETTER_AUTH_URL`이 모두 없어도 통과, `app` 스코프는 `GEMINI_API_KEY`가 없어도 통과, `provision` 스코프는 `BETTER_AUTH_URL`이 없어도 통과.
- **비고**: 음성 방향이 이 AC의 핵심이다. 양성만 검증하면 "모든 변수를 모든 스코프에서 요구하는" 구현(= 개정 이전 평면 집합)도 통과하므로, 스코프가 실제로 좁혀졌음은 음성 방향으로만 드러난다. `app` 스코프의 `GEMINI_API_KEY` 통과 항목은 파이프라인이 mock 구현을 유지하는 동안에만 유효하며, 실호출을 도입하는 후속 SPEC이 이 항목을 뒤집어야 한다(`design.md` §3.1 각주).

### AC-RUNTIME-021 — 독립 실행 CLI의 명시적 `.env.local` 로드 (신규 v0.3.0)
**Traces**: REQ-RUNTIME-021
- **Given** 마이그레이션 대상 DB 설정이 **오직 `.env.local` 파일에만** 기입되어 있고, **셸에 export된 환경변수가 하나도 없는** 상태일 때 — 구체적으로 `TURSO_DATABASE_URL=file:./.tmp/ac021.db`가 `.env.local`에 기입되어 있고, 동일 이름의 셸 환경변수는 미설정이며, `TURSO_AUTH_TOKEN`·`BETTER_AUTH_SECRET`·`BETTER_AUTH_URL`·`GEMINI_API_KEY` 모두 셸에 미설정이다. 이 `.env.local` 상태를 만들고 검증 종료 후 원상복구하는 절차는 `design.md` §3.6을 따른다(신규 v0.4.0)
- **When** 개발자가 `pnpm db:migrate`를 실행하고, 이어서 `pnpm db:seed`를 실행하면
- **Then** (1) 두 명령이 모두 exit 0으로 종료하고, (2) `.env.local`에 지정된 파일 DB에 실제로 9개 테이블이 생성되고 `evidence` 행이 적재되어 **로드가 실제로 일어났음이 결과로 확인**되며, (3) 어느 명령도 "환경변수 누락"으로 실패하지 않는다.
- **왜 이 AC가 필요한가**: Next.js의 자동 `.env.local` 로딩은 `next build`/`start`/`dev` 경로의 동작이며, `tsx`/`node`로 실행되는 독립 스크립트에는 적용되지 않는다. 이 AC가 없으면 "프레임워크가 해줄 것"이라는 가정이 검증되지 않은 채 남고, 실패 시 증상은 **"`.env.local`에 분명히 적었는데 없다고 한다"** 는 형태로 나타나 원인을 검증 모듈의 결함으로 오진하게 만든다(`design.md` §3.2.2).
- **부트스트랩 단일 정의 검증 (정적)**: `.env.local` 로드 호출(`loadEnvConfig` 또는 채택된 동등 수단)이 **`scripts/cli-bootstrap.ts` 한 파일에만** 존재하고, `db-migrate.ts`·`db-seed.ts`·`provision-tester.ts`가 각자 로드를 재구현하지 않고 부트스트랩을 경유함을 정적으로 확인한다(REQ-RUNTIME-021의 "단일 모듈" 요건).
- **로드 → 검증 순서 검증 (단위)**: 부트스트랩이 **로드를 완료한 뒤에** 스코프 검증을 호출함을 단위 테스트로 확인한다. 순서가 뒤집히면 검증이 항상 "누락"을 보고하므로, 이 순서는 이진 판정 대상이다.
- **비고 — AC-RUNTIME-020과의 구별**: AC-020은 "어떤 변수가 어떤 스코프에 속하는가"(검증 범위)를 다루고, 이 AC는 "검증할 값이 애초에 로드되는가"(로드 성립)를 다룬다. 스코프가 아무리 정확해도 로드가 없으면 모든 스코프가 실패하므로, 두 AC는 서로를 대체하지 못한다.

### AC-RUNTIME-022 — 진입점→Playwright 러너 간 env 전달의 구조적 검증 (신규 v0.3.0, 범위 조정 v0.4.0)
**Traces**: REQ-RUNTIME-016
- **Given** `scripts/run-e2e.ts`가 시크릿을 생성하고 E2E 환경을 조립한 뒤, **자신이 직접 spawn하는 단 하나의 자식 프로세스(Playwright 러너)** 를 생성하는 실행 경로가 있고, 그 생성 지점이 **테스트에서 대체 가능한 형태**로 분리되어 있을 때 — `design.md` §3.4/§3.5가 확정한 프로세스 계보(`run-e2e.ts` → Playwright 러너 → Next.js 서버)상 `run-e2e.ts`가 직접 생성하는 자식은 Playwright 러너 하나뿐이며, Next.js 서버는 Playwright 자신의 `webServer` 훅이 **Playwright 내부에서** spawn하므로 `run-e2e.ts`의 주입 가능한 spawn 지점으로는 가로챌 수 없다
- **When** 단위 테스트가 실제 spawn 대신 **기록용 대역**을 주입해 진입점 실행 경로를 구동하고, Playwright 러너 생성 호출에 전달된 env 객체를 수집하면
- **Then** (1) Playwright 러너 프로세스에 전달된 env가 `BETTER_AUTH_SECRET`·`TESTER_PASSWORD`·`TURSO_DATABASE_URL`·`BETTER_AUTH_URL` 네 항목에 대해 진입점이 생성·조립한 값과 **값 단위로 일치**하며(중간 재조립·누락·침묵 변경 없음), (2) `TURSO_DATABASE_URL`의 값이 `file:` 스킴이다.
- **정적 보완 검증 (신규 v0.4.0)**: `playwright.config.ts`의 `webServer.env`가 위 네 키를 **재선언·재정의하지 않음**을 정적으로 확인한다 — 상속 경로 위에서 값을 덮어쓰는 지점이 없어야, (Then)이 확인한 "진입점이 조립한 값"이 Next.js 서버까지 이어지는 상속 경로에서 변조되지 않는다.
- **[HARD] 검증 범위 제약 (범위 조정 v0.4.0)**: 이 AC는 진입점이 **자신이 직접 생성하는 자식 프로세스(Playwright 러너)** 에 전달한 env만을 관측 대상으로 삼는다. **앱 서버(Next.js) 프로세스가 실제로 수신한 env는 이 AC의 관측 대상이 아니다** — 그 프로세스는 `run-e2e.ts`가 아니라 Playwright의 `webServer` 훅이 내부적으로 spawn하므로, `run-e2e.ts`의 주입 가능한 spawn 지점을 통해서는 관측할 수 없다(`design.md` §3.5). 앱 서버까지 값이 실제로 전파되고 그 값으로 인증 흐름이 동작하는지는 **AC-RUNTIME-015의 실제 Playwright E2E 실행이 기능적으로 검증**하며, 이 AC는 그 대체물이 아니다. (v0.3.0판은 이 두 프로세스 모두를 이 AC의 관측 대상으로 주장했으나, 이는 이 AC 자신의 Given/When 메커니즘이 만들어낼 수 없는 관측이었다 — 이번 개정은 관측 가능한 경계로 주장을 좁힌다.)
- **[HARD] 검증 수단 제약**: 이 AC는 **Playwright·브라우저·앱 기동 없이** 판정되어야 한다. 로그인 성공 여부를 이 AC의 증거로 사용하는 것은 **금지**한다 — 로그인 성공은 인증 흐름의 동작에 대한 증거이지 env 값 동일성에 대한 직접 증거가 아니며, 그 역추론은 로그인을 성공시킬 다른 경로가 모두 배제되었을 때만 성립하는데 이 SPEC은 그 배제를 확보하지 않았다(`design.md` §3.5). 관측 대상은 **Playwright 러너에 전달된 env 객체 자체**여야 한다.
- **AC-RUNTIME-015와의 역할 분담**: 이 AC는 **진입점 → Playwright 러너 구간**의 구조적 성질(전달된 env가 진입점 조립값과 같은가)을, AC-RUNTIME-015 (3)항은 **인증 흐름 전체**의 기능적 성질(실제로 로그인 흐름이 동작하는가 — 이는 필연적으로 Playwright 러너 → Next.js 서버 구간까지 값이 올바르게 전파되었을 때만 성립 가능)을 검증한다. 하나의 관측이 두 명제를 겸하면 실패 시 원인이 "시크릿 불일치"인지 "인증 흐름 결함"인지 구별할 수 없으므로 분리한다. **REQ-RUNTIME-016의 "동일한 실행 시점 시크릿을 공유함이 보장" 요구는 두 AC가 함께 충족한다** — AC-RUNTIME-022가 진입점→러너 구간을, AC-RUNTIME-015가 러너→서버 구간을 포함한 전체 흐름을 커버하므로, 관측 범위를 좁힌 이번 개정은 REQ 커버리지를 축소하지 않는다.
- **`pnpm test` 포함**: 이 AC의 검증은 Vitest 단위 테스트로 수행되므로 `pnpm test`에 포함되며 브라우저 없는 환경에서 통과해야 한다(REQ-RUNTIME-018 / AC-RUNTIME-016 유지).

## §B. Definition of Done

- [ ] AC-RUNTIME-001 ~ 022 전체 PASS
- [ ] `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check` 모두 exit 0
- [ ] `pnpm test:e2e` exit 0 (깨끗한 작업 트리 + 셸에 시크릿 미설정 + **sentinel 원격 자격증명이 담긴 `.env.local` 존재** 상태에서 — AC-RUNTIME-015)
- [ ] **실제로 동작하는 원격 Turso 자격증명이 어떤 AC 검증에도 사용되지 않았음을 확인** (`spec.md` §3 "실제 원격 DB 무접근", AC-RUNTIME-015 [HARD] Given 제약)
- [ ] `@next/env`가 `next`와 **동일한 16.3.2로 고정**되어 직접 devDependency로 선언되었고, `scripts/`에서의 import가 실제로 성공함을 실측 확인 (`design.md` §3.2.2 [HARD] 전제)
- [ ] 셸 환경변수 전무 + `.env.local`만 존재하는 상태에서 `pnpm db:migrate`·`pnpm db:seed`가 exit 0 (AC-RUNTIME-021)
- [ ] `.env.local` 로드 호출이 `scripts/cli-bootstrap.ts` **한 파일에만** 존재 (AC-RUNTIME-021 정적 검증)
- [ ] 로그인 성공을 `BETTER_AUTH_SECRET` 동일성의 증거로 주장하는 서술이 아티팩트·테스트·주석 어디에도 없음 (AC-RUNTIME-022 [HARD] 검증 수단 제약)
- [ ] `playwright.config.ts`의 `webServer.env`가 `BETTER_AUTH_SECRET`·`TESTER_PASSWORD`·`TURSO_DATABASE_URL`·`BETTER_AUTH_URL` 네 키를 재선언하지 않음 (AC-RUNTIME-022 정적 보완 검증, 신규 v0.4.0)
- [ ] AC-RUNTIME-022의 서술·테스트 어디에도 앱 서버(Next.js) 프로세스에 전달된 env를 이 AC의 관측 대상으로 주장하는 문구가 없음 (AC-RUNTIME-022 [HARD] 검증 범위 제약, 신규 v0.4.0)
- [ ] AC-RUNTIME-015·AC-RUNTIME-021 검증 실행 전후로 개발자의 원본 `.env.local`(존재했던 경우) 또는 "파일 부재" 상태(존재하지 않았던 경우)가 그대로 복원됨을 확인 — 정상/실패 종료 경로 기준 (`design.md` §3.6, 신규 v0.4.0)
- [ ] 커밋 대상 파일 내 평문 시크릿 0건 (AC-RUNTIME-008)
- [ ] `db/migrations/`에 신규 마이그레이션 파일 추가 없음 (스키마 불변, AC-RUNTIME-017)
- [ ] E2E DB 파일이 커밋되지 않음 — `git check-ignore -v .tmp/e2e.db`가 성공(exit 0)으로 무시 규칙을 보고한다. 기존 `*.tmp` 글롭이 이미 이를 덮으므로 `.gitignore` 항목 추가는 이 확인이 실패할 때만 수행한다
- [ ] spec.md §4 Out of Scope 6개 항목이 구현 범위에 포함되지 않았음을 확인
- [ ] 프로덕션 `lib/auth/config.ts`가 변경되지 않았음을 확인 — `git diff --exit-code lib/auth/config.ts`가 exit 0 (AC-RUNTIME-017 (4a))
- [ ] `e2e/global-setup.ts`가 존재하지 않음을 확인 (AC-RUNTIME-015 구조적 요건)

## §C. REQ ↔ AC 추적 매트릭스

| REQ | 추적 AC |
|-----|---------|
| REQ-RUNTIME-001 | AC-RUNTIME-001 |
| REQ-RUNTIME-002 | AC-RUNTIME-002 |
| REQ-RUNTIME-003 | AC-RUNTIME-003 |
| REQ-RUNTIME-004 | AC-RUNTIME-004 |
| REQ-RUNTIME-005 | AC-RUNTIME-005 |
| REQ-RUNTIME-006 | AC-RUNTIME-006 |
| REQ-RUNTIME-007 | AC-RUNTIME-007 (실제 로그인 성공), AC-RUNTIME-017 (4) (전용 인스턴스 비노출) |
| REQ-RUNTIME-008 | AC-RUNTIME-008 |
| REQ-RUNTIME-009 | AC-RUNTIME-006 |
| REQ-RUNTIME-010 | AC-RUNTIME-009 (앱 부팅 경로), AC-RUNTIME-019 (전량 열거), AC-RUNTIME-020 (스코프 좁힘) |
| REQ-RUNTIME-011 | AC-RUNTIME-010 |
| REQ-RUNTIME-012 | AC-RUNTIME-011 |
| REQ-RUNTIME-013 | AC-RUNTIME-012 |
| REQ-RUNTIME-014 | AC-RUNTIME-013 |
| REQ-RUNTIME-015 | AC-RUNTIME-014 |
| REQ-RUNTIME-016 | AC-RUNTIME-015 (단일 명령 재현성 + 계보 형태 + 기능적 흐름 전체 — 러너→서버 구간 포함), AC-RUNTIME-022 (진입점→Playwright 러너 구간 env 값 동일성 — 구조적, 범위 조정 v0.4.0) |
| REQ-RUNTIME-017 | AC-RUNTIME-015 |
| REQ-RUNTIME-018 | AC-RUNTIME-016 |
| REQ-RUNTIME-019 | AC-RUNTIME-017 |
| REQ-RUNTIME-020 | AC-RUNTIME-018 |
| REQ-RUNTIME-021 | AC-RUNTIME-021 |

## §D. 검증되지 않는 항목 (참고)

- **원격 Turso 인스턴스에 대한 자동 검증**: AC-RUNTIME-015가 로컬 `file:` DB 격리를 요구하므로, 원격 Turso 연결의 네트워크·인증 실패 경로는 자동 E2E 대상이 아니다. AC-RUNTIME-001/002는 로컬·원격 어느 인스턴스에서도 성립하지만, 원격 확인은 런북(AC-RUNTIME-018)의 수동 절차로 보완한다. **개정 v0.3.0**: AC-RUNTIME-015가 쓰는 sentinel 값은 의도적으로 **도달 불가능한 호스트**이므로, 이 SPEC의 자동 검증은 **실제로 동작하는 원격 인스턴스와의 연결을 어느 지점에서도 시험하지 않는다** — 이는 의도된 설계 제약(`spec.md` §3 "실제 원격 DB 무접근")이며, 실제 원격 연결 확인은 전적으로 런북의 수동 절차에 남는다.
- **`@next/env` 로드 우선순위의 실행 관측**: v0.3.0에서 `processEnv`의 우선순위 구현을 **소스로** 확인했으나(`research.md` §0.2 결론 2), 이 프로젝트 구성에서 실제로 실행해 관측하지는 않았다(조사 셸에 `node` 부재). 소스는 근거이지 관측이 아니므로 M5 실측 의무가 유지되며, AC-RUNTIME-015의 sentinel Given이 그 실측의 검증 지점이다.
- **AC-RUNTIME-022가 다루지 않는 것 (범위 조정 v0.4.0)**: 이 AC는 진입점이 **자신이 직접 spawn하는 Playwright 러너 프로세스**에 전달한 env 객체만 관측한다. 다음 두 가지 모두 이 AC의 단위 검증 대상이 아니다 — (a) Playwright 러너가 그 env를 **실제로 수신해 사용했는지**(OS 수준 상속의 실제 동작), (b) **앱 서버(Next.js) 프로세스가 받는 env**(Playwright의 `webServer` 훅이 내부적으로 spawn하므로 `run-e2e.ts`의 주입 지점으로는 애초에 도달할 수 없음). 두 성질 모두 AC-RUNTIME-015의 실제 실행 경로에서만 드러난다. "진입점이 러너에 전달했다"(AC-022) + "전체 흐름이 실제로 동작한다"(AC-015) 사이의 OS 상속 구간(진입점→러너, 러너→서버 둘 다)은 실행 관측으로만 닫히며, 이는 M5의 실측 범위다.
- **`.env.local` 안전 교체·복원의 강제 종료(kill -9) 경로 (신규 v0.4.0)**: `design.md` §3.6의 백업·복원 메커니즘은 정상 종료·테스트 실패·`SIGINT`/`SIGTERM`·프로세스 `exit` 경로를 닫지만, **`SIGKILL`(`kill -9`)처럼 인-프로세스 시그널 핸들러 자체를 우회하는 강제 종료**는 이 설계로 닫을 수 없다 — 그 경로에서는 백업이 복원되지 못한 채 sentinel 내용이 `.env.local`에 남을 수 있다. 이는 의도적으로 남기는 잔여 위험이며, 닫힌 것처럼 서술하지 않는다(격리된 워크트리에서 실행하면 이 위험 자체가 발생하지 않는다 — `design.md` §3.6).
- **로그인 시도 rate-limiting**: spec.md §5 잔여 위험으로 남으며 이 SPEC의 AC 대상이 아니다.
- **Gemini API 실호출**: 파이프라인이 mock 구현을 유지하므로(REQ-RUNTIME-019) E2E 흐름에서 실제 Gemini 호출은 발생하지 않는다. **개정 v0.2.0에서 `GEMINI_API_KEY`는 `app` 스코프의 요구 항목에서도 제외**되었으므로(`design.md` §3.1 각주), 이 변수는 이번 SPEC에서 실호출 검증 대상도 부팅 검증 대상도 아니다 — AC-RUNTIME-020이 검증하는 것은 그 **부재가 앱 스코프 검증을 막지 않는다**는 사실뿐이다. 실호출을 활성화하는 후속 SPEC이 이 변수를 `app` 스코프 필수로 승격하고 그에 맞는 AC를 정의해야 한다.
- **프로비저닝 인스턴스의 런타임 도달 불가능성**: AC-RUNTIME-017 (4)는 import·참조 관계에 대한 **정적** 검사다. 런타임에 동적 로딩으로 인스턴스에 도달하는 경로가 없음까지 실행으로 확인하지는 않는다 — 이 프로젝트에 동적 모듈 로딩 패턴이 없다는 관측에 근거한 판단이며, 그 전제가 바뀌면 재검토 대상이다.
