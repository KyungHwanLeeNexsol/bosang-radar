# SPEC-B2C-FOUNDATION-001 — Research (plan-phase 실측 근거)

이 문서는 design.md §1 삭제/재사용/보존 매트릭스가 인용하는 **실측 원자료**다. 모든 항목은 `Read`/`Glob`/`Bash`로 직접 관찰한 것이며, 이 SPEC 작성 시점에 저장소를 추측 없이 읽은 결과다. 코드는 전혀 수정하지 않았다(REQ-B2CFOUND-005).

## §1. 저장소 실측 — 디렉터리별 파일 목록 (Glob/find 결과, 2026-09-18)

`find app components lib db e2e scripts -type f | wc -l` 재실행 결과(2026-09-18, plan-auditor D7 지적 이후 재측정):

```
app/         44개 파일 — api/auth, api/cases, cases/*, login/*, layout.tsx, page.tsx, favicon.ico, globals.css, not-found.*
components/  14개 파일 — evidence-item.*, exception-panel.tsx, ui/* (10개 shadcn 프리미티브)
lib/         71개 파일 — auth/, ai/, cases/, db/, feedback/, logging/, observability/, pipeline/, validation/, env.ts, utils.ts
db/          25개 파일 — migrations/(9개 SQL + meta 9개), seed/(evidence 5개 + 관련 파일)
e2e/         13개 파일 — auth.*, case-*, capture-evidence*, mobile-drawer-focus, sidebar-sticky, tenant-isolation, comparison-docs-images, helpers.ts, sidebar-assertions.ts, storage-state-paths.ts
scripts/     18개 파일 — cli-bootstrap, db-migrate, db-seed, e2e-tester-emails, env-local-safety*, measure/*, playwright-config-static.test, provision-tester, run-e2e
root         proxy.ts(+2 test), instrumentation.ts(+test)
```

design.md §1의 매트릭스가 이 전체 파일 세트를 커버하는 SSOT다 — 각 디렉터리 와일드카드 행(`app/cases/**` 등)이 실제로 이 개수만큼의 파일을 포괄한다. 이 표는 규모 파악용 요약이며, 개별 파일의 분류 근거는 design.md §1을 따른다.

## §2. DB 스키마 실측 (`lib/db/schema.ts`, 188줄 전체 Read)

11개 테이블이 정의되어 있다:

| 테이블 | 성격 | 비고 |
|---|---|---|
| `user`/`session`/`account`/`verification` | Better Auth 표준 스키마 | `lib/auth/config.ts`의 `drizzleAdapter(db, { schema })`가 필드 매핑 없이 그대로 사용 |
| `cases` | B2B 사건 레코드 | `ownerUserId` FK로 `user`에 종속(REQ-SCAFFOLD-002/010 테넌트 격리) |
| `evidence` | B2B 근거자료 corpus | `category`/`evidenceType`/`scope`/`issueTypes`(8개 QueryIssueType 부분집합) |
| `reports` | B2B 리서치 리포트 | `caseId` FK |
| `feedback` | B2B 전문가 피드백 | `reportId`+`userId` FK, `payload` JSON(`lib/feedback/schema.ts` 구조) |
| `allowedTesters` | B2B invite-only allowlist | `lib/auth/config.ts`의 `isAllowedTesterEmail()`이 유일한 대조 지점 |
| `reservations` | B2B 사용자별 동시 실행 가드 | `ownerUserId` PK, TTL 리스 |
| `caseJobs` | B2B 비동기 job 큐 | `ownerUserId`+`leaseId`+`progressStage`, `after()`(Next.js)로 처리 |
| `geminiRequestObservations` | B2B Gemini 호출 관측 | `jobId` FK, 민감정보 미저장(요청 URL/키/prompt 제외) |

**중요 관찰**: 11개 테이블 전부가 서로 FK로 얽혀 있다(`user`가 `session`/`account`/`cases`/`reservations`/`caseJobs`/`feedback`의 부모, `cases`가 `reports`의 부모, `reports`가 `feedback`의 부모, `caseJobs`가 `geminiRequestObservations`의 부모). **B2C 전용 신규 테이블은 이 스키마와 무관하게 추가될 수 있다** — `user` 삭제 없이는 기존 테이블 어느 것도 독립적으로 DROP할 수 없다(FK 제약).

## §3. 인증·미들웨어 실측

- `proxy.ts`(33줄, 전체 Read) — `PROTECTED_PATH_PATTERNS = [/^\/cases(\/|$)/, /^\/api\/cases(\/|$)/]`. Next.js 16의 `proxy.ts`(구 `middleware.ts`)는 nodejs 런타임 전용(edge 미지원). `hasSessionCookie()`만 사용하며 `lib/auth/session.ts`는 import하지 않는다(주석: DB 접근 코드가 Middleware 번들에 포함되면 안 됨).
- `lib/auth/config.ts`(96줄, 전체 Read) — Better Auth 인스턴스. `disableSignUp: true`(셀프 가입 없음) + `validateUserInfo`/`databaseHooks.session.create.before` 이중 검증으로 `allowedTesters` 대조. `getAuth()`는 지연 생성(싱글턴) — `getDb()`가 `TURSO_*` 환경변수 없으면 예외를 던지기 때문.
- `lib/auth/session.ts`(15줄) — `getCurrentSession()`이 `app/api/cases/route.ts`(M4)와 `app/cases/*`(M5)의 유일한 세션 조회 지점.

**결론**: 인증 스택 전체(`proxy.ts`의 가드 로직, `lib/auth/*`, `app/api/auth/[...all]/route.ts`)가 `/cases`·`/api/cases` 보호에만 결합되어 있다. `design/MIGRATION-PLAN.md`가 명시하는 B2C 흐름("회원가입·로그인 없이 접근 가능한 공개 흐름")에는 로그인 개념 자체가 없다.

## §4. AI/파이프라인 실측

- `lib/ai/provider.ts`(38줄, 전체 Read) — `LLMProvider` 인터페이스(`generate`/`generateStructured`). 파이프라인 전용 타입을 참조하지 않는 순수 추상화. `lib/pipeline/*`를 import하지 않는다(반대 방향으로 `lib/pipeline/index.ts`가 `lib/ai/provider-factory`를 import).
- `lib/pipeline/index.ts`(207줄, 전체 Read) — 6단계(CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier) 오케스트레이터. `CaseInput`(`lib/validation/case-input.ts`에서 타입 re-export, `lib/pipeline/types.ts` 1행)을 입력으로 받는다 — 즉 파이프라인의 입력 타입 자체가 B2B 사건 입력 폼 스키마에 결합돼 있다.
- `lib/pipeline/types.ts`(140줄, 전체 Read) — `QUERY_ISSUE_TYPES`(8개 상수, evidence 스키마와 공유), `CoverageDomain`("INJURY_DISABILITY"|"DISEASE_DISABILITY" — 상해/질병 후유장해 2개 영역, B2B MVP 범위와 정확히 일치), `ResearchReport` 등. **이 타입들은 B2B의 "상해후유장해/질병후유장해 리서치"라는 특정 도메인에 맞춰 설계됐다** — B2C의 4카테고리(실손의료비/정액담보/후유장해/특별보상) 담보 매칭과 형태가 다르다(`tech.md` § 담보 매칭 로직 — 미결정 사항이 이미 이 차이를 지적함).
- `app/api/cases/route.ts`(72줄, 전체 Read) — `after(() => processCaseJob(jobId))`로 응답 후 백그라운드 처리. Oracle VM(PM2 상시 프로세스) 환경에서는 Netlify Background Function 대신 이 패턴을 쓴다는 주석이 있음(§6 참고) — 즉 이 파일은 **이미 Oracle 전환을 반영해 갱신된 상태**다.

**결론**: `lib/ai/`(provider 추상화)는 파이프라인과 방향성 있게 분리돼 있어 독립적으로 재사용 가능하다. `lib/pipeline/`은 타입 계약 수준에서 B2B 도메인(2영역 후유장해)에 결합돼 있어, B2C 4카테고리 담보 매칭에 그대로 재사용하려면 최소한 타입 계약 재설계가 필요하다 — `tech.md`가 이미 이를 "후속 SPEC 범위"로 남겨둔 것과 일치한다.

## §5. 환경변수·배포 실측

- `lib/env.ts`(145줄, 전체 Read) — `EnvScope = "db"|"provision"|"app"|"e2e"`. `REQUIRED_BY_SCOPE` 매트릭스: `provision`/`app`/`e2e` 스코프가 `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`을 요구한다. **인증을 제거하면 이 매트릭스도 갱신이 필요하다** — 이번 SPEC 범위 밖(코드 미변경)이지만 후속 삭제 milestone의 영향 범위에 포함된다.
- `.env.local.example`(전체 Read) — `TESTER_PASSWORD`(비대화형 테스터 프로비저닝), `SUPPORT_CONTACT_EMAIL`(B2B 파일럿 지원 연락처) 등 B2B 전용 변수가 다수 존재.
- `.github/workflows/deploy.yml`(60줄 중 앞부분 Read) — **`main` 브랜치 push마다 자동으로** `git reset --hard origin/main` → `pnpm install` → `pnpm run db:migrate` → `NODE_OPTIONS=--max-old-space-size=3072 pnpm run build` → PM2 재시작을 수행한다. `concurrency.cancel-in-progress: false`(순차 실행 보장)이다.
- `.moai/specs/SPEC-ORACLE-HOSTING-001/spec.md` frontmatter `status: in-progress`, M1(앱 배포)/M2(Netlify cutover)는 spec.md 본문에 "future, NOT-executed milestones... requiring a separate, explicit user approval"로 기록돼 있다.

**중요 불일치 관찰(추측이 아니라 관찰된 사실)**: SPEC-ORACLE-HOSTING-001은 M1(배포)이 "아직 미실행"이라고 기록하지만, `.github/workflows/deploy.yml` 파일 자체는 이미 저장소에 존재하고 `main` push 즉시 발동하도록 구성돼 있다(추가 승인 절차가 워크플로 자체에는 없음 — `workflow_dispatch` 트리거도 있지만 `push: branches: [main]`이 자동 트리거의 주 경로). 이 SPEC이 정적 분석만으로 "현재 Oracle VM이 실제로 트래픽을 받고 있는가"를 확정할 수는 없다 — 그러나 **"다음에 누군가 `main`에 push하면 db:migrate가 실제로 실행된다"는 것은 코드 사실로 확정할 수 있다.** 이 관찰이 REQ-B2CFOUND-011(브랜치 안전)의 직접적 근거다.

## §6. 디자인 SSOT 요약 (원문은 `design/MIGRATION-PLAN.md`, 267줄 전체 Read)

- 사용자용 24개(Desktop 12 + Mobile 12) + DEV ONLY 내부 자료 4개. `design/exports/` 실제 파일 개수(2026-09-18 `find` 결과)와 문서 표가 일치함을 확인(01·01-A2·01-B·01-C·01-D·01-E·02·03·03-A2·03-B·03-C·03-D 12개 Desktop + M01·M01-A2·M01-B·M01-C·M02·M02-B·M02-C·M02-D·M03·M03-B·M03-C·M03-D 12개 Mobile).
- **모바일 결과없음/분석오류 화면 없음**(`M01-D`/`M01-E` 미존재) — §9 남은 작업에 명시. design.md에서 decision gate로 취급한다.
- 동의 구조(§6): 01-A2 단계는 "건강정보 등 민감정보 처리 동의 1건"만 필수, 이름·전화번호 미수집. 03 단계는 개인정보 수집·이용 동의(필수①) + 건강정보 상담 이용 동의(필수②) + 마케팅 수신 동의(선택, CTA 활성화 조건 아님).
- 02/M02 결과 화면: Desktop은 4카테고리 전체 펼침, Mobile은 카테고리 단일 선택 탭(`M02-B`/`M02-C`/`M02-D`).
- 03/M03 상담 신청 결과 3상태(성공/중복/실패)는 서버 응답 코드로 분기하며, 중복 판정 기준은 "동일 진단 결과 ID 또는 동일 연락처"로 서버가 내려준다 — 02→03 연결에 "진단 결과 ID"라는 개념이 이미 디자인 문서에 존재함(design.md §3 decision gate에서 구체화).

## §7. 기존 SPEC 상태 실측 (frontmatter grep, 2026-09-18)

`.moai/specs/` 18개 중 B2B/인프라 관련 10개의 `status`를 확인:

| SPEC | status | 비고 |
|---|---|---|
| SPEC-SCAFFOLD-001 | completed | 최초 scaffold |
| SPEC-RUNTIME-001 | completed | 런타임 활성화 |
| SPEC-PILOT-READY-001 | completed | 동시 실행 가드, 데이터 취급 고지 |
| SPEC-PILOT-LAUNCH-001 | completed | 프로덕션 문구 정리 |
| SPEC-PILOT-OPS-001 | completed | 파일럿 운영 개시 |
| SPEC-UI-MIGRATION-001 | completed | Pencil 디자인(구 B2B) 재현 |
| SPEC-E2E-AUTH-STATE-001 | completed | E2E storageState 인증 재사용 |
| SPEC-SIDEBAR-NAV-001 | completed | 사이드바 접근성 |
| SPEC-ORACLE-HOSTING-001 | **in-progress** | M0만 실행, M1/M2 미실행(§5 참고) |

`SPEC-B2C-FOUNDATION-001`은 사전에 존재하지 않았다 — ID 중복 없음(SPEC ID pre-write self-check PASS, Bash 정규식 검증 완료).

## §8. 관측되지 않은 것 (Gaps, `verification-claim-integrity.md` §3.4 준수)

- Oracle VM이 실제로 라이브 트래픽을 받고 있는지는 이 SPEC의 정적 분석 범위 밖이다(§5 참고) — 관측 가능한 것은 "워크플로 파일이 자동 트리거되도록 구성돼 있다"는 사실뿐이다.
- `lib/pipeline/`의 Researcher/Skeptic/Verifier가 실제로 B2C 02 화면 담보 매칭에 재사용 가능한지는 코드 형태 관찰(§4)만으로는 확정할 수 없다 — 실제 재사용 가능성 평가는 후속 SPEC의 실험적 검증이 필요하다(REQ-B2CFOUND-007에 따라 이 SPEC은 그 판단을 내리지 않는다).
- `e2e/comparison-docs-images.spec.ts`가 참조하는 `docs/evidence/SPEC-UI-MIGRATION-001/*.html` 4개 파일의 현재 존재 여부는 확인하지 않았다(design.md §1 매트릭스에서 낮은 신뢰도로 표시).
