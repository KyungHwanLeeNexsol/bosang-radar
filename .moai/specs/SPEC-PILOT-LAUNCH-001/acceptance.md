# SPEC-PILOT-LAUNCH-001 — 인수 조건 (Acceptance Criteria)

Tier M 분류(spec.md §1 핵심 판단 근거, plan.md §A)에 따라 인수 조건 전체를
이 파일에 기록한다. spec.md §3은 이 파일을 가리키는 포인터만 남긴다.

## §D. AC 매트릭스 (Given-When-Then)

| AC | 연결 REQ | 시나리오 |
|----|----------|----------|
| AC-PILOT-LAUNCH-001 | REQ-PILOT-LAUNCH-001 | **Given** `app/login/page.tsx`와 `app/login/login-form.tsx`가 수정된 상태, **When** 두 파일의 렌더링된 텍스트를 확인하면, **Then** "TESTER LOGIN" 문자열은 존재하지 않고, 헤딩은 "로그인"이며, 부제는 "승인된 계정으로만 로그인할 수 있습니다."이고, 폼 하단 안내는 "계정은 운영자가 직접 발급합니다. 발급 및 로그인 문의는 담당자에게 연락해 주세요."이다. |
| AC-PILOT-LAUNCH-002 | REQ-PILOT-LAUNCH-002 | **Given** REQ-PILOT-LAUNCH-001 적용 이후의 코드베이스, **When** `grep -rn "allowedTesters\|tester:add\|TESTER_PASSWORD\|TESTER_A_EMAIL\|TESTER_B_EMAIL" lib/ scripts/ package.json e2e/`를 실행하면, **Then** 이 SPEC 착수 이전과 동일한 결과(파일·라인 단위로 무변경)가 나온다. |
| AC-PILOT-LAUNCH-003 | REQ-PILOT-LAUNCH-003, REQ-PILOT-LAUNCH-004 | **Given** `app/cases/new/case-input-form.tsx`가 수정된 상태, **When** 폼 하단 안내 텍스트를 확인하면, **Then** "비식별 상태로 처리되며"라는 수동태 보장 표현과 "리서치 목적 외에 사용되지 않습니다"라는 이용 목적 제한 보장 표현은 모두 존재하지 않고, "합성이거나 이미 비식별화된 사례만 입력"이라는 능동 지시 표현과 "AI 분석을 위해 외부 모델 제공자에게 전송될 수 있습니다"라는 전송 고지가 포함되어 있으며, "평균 소요 시간 3~5분" 안내는 그대로 유지되고, "보장"·"확실히 차단" 등 REQ-PILOT-READY-011이 금지하는 과대 주장 표현이 새로 추가되지 않았다. |
| AC-PILOT-LAUNCH-004 | REQ-PILOT-LAUNCH-005 | **Given** `.moai/docs/account-provisioning.md`가 신규 작성된 상태, **When** 문서 내용을 확인하면, **Then** (a)~(f) 6가지 필수 내용 — ⓐ 스크립트가 프로덕션을 자동 대상으로 하지 않고 실행 시점 `TURSO_DATABASE_URL` 해석 값에 의해서만 대상이 결정된다는 명시, ⓑ 발급 전 원격 DB 호스트 확인·`file:`/예상 밖 호스트 시 중단 기준과 토큰 값 미출력 원칙, ⓒ 발급 전 `BETTER_AUTH_SECRET` Netlify Production 일치 확인 기준, ⓓ 재실행 시 비밀번호 미변경 제약, ⓔ 비밀값 미기록 경고, ⓕ 발급 후 실제 프로덕션 로그인 성공으로 검증하는 기준 — 이 모두 포함되어 있고, 실제 비밀번호나 발급된 계정의 값은 어디에도 기록되어 있지 않으며, `scripts/provision-tester.ts`는 `git diff`상 무변경이다. |
| AC-PILOT-LAUNCH-005 | REQ-PILOT-LAUNCH-006 | **Given** run-phase 착수 시점의 README.md와 `.moai/project/product.md`, **When** SPEC-PILOT-READY-001 관련 문구(`status: completed`, 7개 항목 READY, 전체 GO, PR #10 `d74ece4`)를 Grep으로 재확인하면, **Then** plan-phase에서 확인한 것과 동일하게 일치하며, 불일치가 발견되면 이 SPEC의 REQ-PILOT-LAUNCH-006 하위 항목으로 정정 내용을 기록한다. |
| AC-PILOT-LAUNCH-006 | Out of Scope 절 전체 | **Given** run-phase 완료 시점의 diff, **When** 변경된 파일 목록을 확인하면, **Then** 비밀번호 재설정·계정 비활성화·계정 목록 조회 기능에 해당하는 신규 코드(라우트, DB 컬럼, CLI 스크립트)가 존재하지 않는다. |
| AC-PILOT-LAUNCH-007 | REQ-PILOT-LAUNCH-001 | **Given** `app/login/page.tsx`와 `app/login/login-form.tsx`에 대응하는 기존 테스트 파일(`app/login/page.test.tsx`, `app/login/login-form.test.tsx`)이 수정된 상태, **When** 두 테스트 파일을 실행하면, **Then** REQ-PILOT-LAUNCH-001이 지정한 4곳(캡션·헤딩·부제·폼 하단 안내)마다 옛 테스터 문구(예: "TESTER LOGIN", "테스터 로그인", "테스터 계정은 운영자가 직접 발급합니다")가 부재함을 확인하는 어설션과, 신규 문구가 존재함을 확인하는 어설션이 각각 통과한다. |
| AC-PILOT-LAUNCH-008 | REQ-PILOT-LAUNCH-003 | **Given** `app/cases/new/case-input-form.tsx`에 대응하는 기존 테스트 파일 `app/cases/new/case-input-form.test.tsx`가 수정된 상태, **When** 테스트 파일을 실행하면, **Then** 옛 과대 주장 문구("입력 내용은 비식별 상태로 처리되며 리서치 목적 외에 사용되지 않습니다")가 부재함을 확인하는 어설션과, 신규 문구(능동 지시 표현 + 외부 모델 제공자 전송 고지)가 존재함을 확인하는 어설션이 각각 통과한다. |

## §D.1 엣지 케이스

- AC-PILOT-LAUNCH-002 재실행: `pnpm tester:add -- --email <이미 존재하는 이메일>`을 반복 실행해도 `allowed_testers`/`user` 테이블에 중복 행이 생기지 않는지는 이미 SPEC-RUNTIME-001에서 검증됨(`scripts/provision-tester.ts:131-147`) — 이 SPEC은 그 코드를 변경하지 않으므로 재검증 대상이 아니다.
- AC-PILOT-LAUNCH-004 문서 검토 시, 예시 값(이메일/비밀번호)은 항상 플레이스홀더(`<email>`, `<password>`)만 사용했는지 커밋 전 `git diff`로 육안 확인한다(plan.md §D 리스크 2).
- AC-PILOT-LAUNCH-007/008 어설션 추가 시, 기존에 통과하던 다른 어설션(예: `data-testid` 셀렉터 기반 어설션)이 문구 변경으로 인해 깨지지 않는지 전체 테스트 스위트 재실행으로 확인한다.

## §D.2 품질 게이트 기준

- `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` 전체 통과.
- 신규 테스트 어설션 추가로 인한 커버리지 저하 없음(오히려 REQ-PILOT-LAUNCH-001/003 관련 라인의 커버리지가 상승).
- `.moai/docs/account-provisioning.md`는 markdown lint 통과(프로젝트에 markdown lint가 구성되어 있다면).

## §D.3 완료 정의 (Definition of Done)

- REQ-PILOT-LAUNCH-001~006 전 항목이 위 AC-PILOT-LAUNCH-001~008로 검증됨.
- `git diff`상 PRESERVE 대상(plan.md §A.5)이 무변경임이 확인됨.
- `scripts/provision-tester.ts` 코드 자체가 무변경임이 `git diff`로 확인됨.
- 품질 게이트(tsc/eslint/prettier/vitest/build) 전체 PASS.
- progress.md에 각 REQ/AC의 PASS/FAIL 근거(명령어 + 실제 출력)가 기록됨.

## §D.4 추적성 (Traceability)

REQ-PILOT-LAUNCH-001 → AC-001, AC-007
REQ-PILOT-LAUNCH-002 → AC-002
REQ-PILOT-LAUNCH-003 → AC-003, AC-008
REQ-PILOT-LAUNCH-004 → AC-003
REQ-PILOT-LAUNCH-005 → AC-004
REQ-PILOT-LAUNCH-006 → AC-005
Out of Scope 절 전체 → AC-006

## §D.5 간접 검증 항목

- REQ-PILOT-LAUNCH-005의 (b)/(c) 발급 전 확인 절차는 문서화 대상일 뿐 이
  SPEC의 plan-phase·run-phase 어느 쪽도 실제로 실행하지 않는다 — 따라서
  AC-PILOT-LAUNCH-004는 "문서에 그 기준이 정확히 기술되어 있는가"만
  검증하며, "그 기준을 실제로 적용했을 때 올바르게 작동하는가"는 검증
  범위 밖이다(실제 계정 발급이 이 SPEC의 Out of Scope이므로).

## §D.6 종결 게이트 (Closure Gates)

- run-phase 착수 전: plan-auditor PASS(Tier M 임계값 0.80 이상).
- sync-phase 착수 전: 위 §D.3 완료 정의 전 항목 충족.

## §D.7 전향적 확인 사항 (Forward-looking Checks)

- REQ-PILOT-LAUNCH-005 (b)/(c)에 기술된 발급 전 확인 절차는, 실제로 최초
  실 계정이 발급되는 시점(이 SPEC 범위 밖)에 운영자가 수동으로 따라야 하는
  절차다 — 향후 그 발급이 실제로 수행될 때 이 문서의 절차가 실제로
  유효했는지 별도로 확인이 필요하다(이 SPEC의 완료 조건은 아님).
