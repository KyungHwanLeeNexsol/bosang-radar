# Design — SPEC-RUNTIME-001

이 문서는 **런타임 활성화 계층**의 경계와 데이터 흐름을 기술한다. SPEC-SCAFFOLD-001이 확립한 기존 계층은 설계 변경 대상이 아니며, 이 문서는 그 위에 무엇이 **덧붙는지**만 다룬다.

## §1. 설계 원칙

1. **덧붙이되 건드리지 않는다** — 신규 코드는 `lib/env.ts`, `scripts/`, `e2e/` 세 곳에 집중된다. 기존 `lib/pipeline/`, `lib/ai/`, `lib/validation/`, `lib/db/schema.ts`는 불변이다(REQ-RUNTIME-019).
2. **환경 검증은 단일 관문** — 앱 부팅·운영 스크립트·E2E 셋업이 모두 같은 검증 모듈을 통과한다. 분기하면 한쪽만 갱신됐을 때 우회 경로가 생긴다.
3. **시크릿은 프로세스 경계를 넘지 않는다** — 값은 환경변수 또는 대화형 입력으로만 들어오고, 커밋 대상 파일·로그·오류 메시지에는 나타나지 않는다.
4. **재실행 안전성은 기존 제약에 위임한다** — 마이그레이션은 Drizzle의 추적 테이블, 시드는 `onConflict`, 프로비저닝은 `unique` 제약. 새 상태 저장소를 만들지 않는다.

## §2. 계층 구조 (신규 부분만)

```
   [운영자 CLI]              [Next.js 앱 부팅]           [Playwright E2E]
        │                          │                          │
        │                          │                    e2e/global-setup.ts
        │                          │                          │
        └──────────┬───────────────┴──────────────────────────┘
                   ▼
            lib/env.ts  ← 단일 검증 관문 (신규)
              · 필수/조건부 변수 판정
              · file: vs libsql:// capability gate
              · 값 미노출 오류 메시지 생성
                   │
                   ▼
            lib/db/client.ts  ← 자체 인라인 검사를 lib/env.ts 위임으로 교체 (최소 수정)
              · getDb() 싱글턴 지연 생성 패턴 유지 (변경 금지)
                   │
                   ▼
            Drizzle ORM ──▶ libSQL (원격 Turso 또는 로컬 file:)
```

기존 계층(`lib/auth/`, `lib/cases/`, `lib/pipeline/`, `app/`)은 이 그림에서 `getDb()` 아래에 그대로 놓여 있으며 구조가 바뀌지 않는다.

## §3. 신규 모듈 경계

### 3.1 `lib/env.ts` — 환경 검증 관문

**책임**: 프로세스 환경을 검증해 타입이 확정된 설정 객체를 반환한다. 실패 시 설명적 오류로 즉시 중단한다.

**책임 아님**: 값을 읽어 저장하거나 캐시하는 것 외의 부수효과. DB 연결, 파일 쓰기, 로깅은 이 모듈의 일이 아니다.

**변수 분류**:

| 변수 | 필수성 | 필요 이유 (오류 메시지에 포함될 내용) |
|------|--------|--------------------------------------|
| `TURSO_DATABASE_URL` | 항상 필수 | Drizzle이 접속할 libSQL 인스턴스 주소 |
| `TURSO_AUTH_TOKEN` | **조건부** — URL이 원격(`libsql://`/`https://`)일 때만 | 원격 Turso 인스턴스 인증 |
| `BETTER_AUTH_SECRET` | 항상 필수 | 세션 토큰 서명 키 |
| `BETTER_AUTH_URL` | 항상 필수 | 인증 콜백의 기준 오리진 |
| `GEMINI_API_KEY` | 항상 필수 [^e2e-dummy] | AI provider adapter 초기화 |

[^e2e-dummy]: **E2E 모드에서는 형식만 검증한다.** 파이프라인이 mock 구현을 유지하므로(REQ-RUNTIME-019) E2E 실행 중 Gemini 실호출은 발생하지 않는다 — 즉 이 변수의 *값*은 소비되지 않고 *존재/형식*만 부팅 검증을 통과시키는 데 쓰인다. 따라서 E2E에서는 비밀이 아닌 더미 값으로 충분하며, 실제 API 키를 E2E 환경에 넣을 이유가 없다(§3.4). 이는 "항상 필수" 판정을 완화하는 것이 아니라 — 변수는 여전히 필수다 — 어떤 값이 그 필수 조건을 만족시키는지를 명시하는 것이다.

조건부 판정이 이 모듈의 핵심 설계 지점이다 — `file:` 스킴을 1급으로 지원해야 E2E가 개발자의 실제 Turso 인스턴스를 건드리지 않고 재현될 수 있다(REQ-RUNTIME-017).

**오류 메시지 계약**: 누락 변수를 **전부** 열거하고, 각 항목에 변수명 + 필요 이유 + 획득 경로를 담되, **값은 어떤 형태로도 포함하지 않는다**(REQ-RUNTIME-011). Zod 기본 오류가 입력값을 실을 수 있으므로 메시지 생성 단계에서 값을 제거한다.

**@MX:ANCHOR 대상** — 부팅 경로 + 3개 스크립트 + E2E 셋업이 모두 의존하는 높은 fan-in 지점(plan.md §F).

### 3.2 `scripts/` — 운영자 CLI 계층

세 스크립트 모두 동일한 형태를 따른다: `lib/env.ts` 통과 → `getDb()` 획득 → 작업 수행 → 결과 요약 출력 → exit code 반환.

| 스크립트 | 명령 | 재실행 안전성의 근거 |
|----------|------|---------------------|
| `scripts/db-migrate.ts` | `pnpm db:migrate` | Drizzle migrator의 적용 이력 추적 테이블 |
| `scripts/db-seed.ts` | `pnpm db:seed` | `evidence.id` 기준 `onConflict` (seed JSON이 안정적 id를 이미 보유) |
| `scripts/provision-tester.ts` | `pnpm tester:add -- --email <이메일>` | 이메일 사전 조회 + `allowed_testers.email`/`user.email`의 `unique` 제약 |

**공통 제약**: 스크립트는 애플리케이션 코드를 import할 수 있으나(`lib/env.ts`, `lib/db/client.ts`, `lib/db/schema.ts`), 그 반대 방향은 금지한다 — `lib/`나 `app/`이 `scripts/`를 import하면 운영 도구가 런타임 번들에 섞인다.

### 3.3 `e2e/` — Playwright 검증 계층

```
playwright.config.ts
  · webServer: pnpm build && pnpm start (자동 기동/종료)
  · env: TURSO_DATABASE_URL=file:./.tmp/e2e.db  ← §3.1 capability gate 의존
  · projects: chromium 단일

e2e/global-setup.ts
  0. E2E 전용 환경변수 생성·주입 (§3.4)
  1. .tmp/e2e.db 초기화
  2. 마이그레이션 적용   (scripts/db-migrate 로직 재사용)
  3. 시드 적재           (scripts/db-seed 로직 재사용)
  4. 테스터 A·B 프로비저닝 (TESTER_PASSWORD 환경변수 경로 — 값의 출처는 §3.4)

e2e/auth.spec.ts             → REQ-RUNTIME-012
e2e/case-flow.spec.ts        → REQ-RUNTIME-013, REQ-RUNTIME-014
e2e/tenant-isolation.spec.ts → REQ-RUNTIME-015
```

**설계 판단**: 글로벌 셋업은 CLI 스크립트를 서브프로세스로 호출하는 대신 **동일 로직을 함수로 재사용**한다. 서브프로세스 호출은 환경변수 전달 경계가 하나 더 생겨 `file:` 격리가 새는 지점이 된다. 따라서 각 스크립트는 "얇은 CLI 껍데기 + 재사용 가능한 함수" 형태로 작성한다.

**셀렉터 정책**: 기존 마크업 구조·스타일은 변경하지 않는다. 안정적 참조가 필요한 지점에만 `data-testid`를 부착하며, 이는 UI 고도화(out of scope)가 아니라 검증 가능성 확보를 위한 최소 조치다.

### 3.4 E2E 환경변수 공급 경로 — 누가 무엇을 채우는가

REQ-RUNTIME-016은 `pnpm test:e2e` **단일 명령**으로 사람 개입 없이 끝까지 실행될 것을 요구한다. 그런데 §3.1의 필수 변수 5개와 프로비저닝용 `TESTER_PASSWORD`는 누군가 채워야 하고, 동시에 REQ-RUNTIME-008이 커밋 대상 파일에 시크릿을 쓰는 것을 금지한다. **셸에 미리 세팅하는 경로**(사람 개입 → REQ-RUNTIME-016 위반)와 **픽스처 파일에 적어두는 경로**(REQ-RUNTIME-008 위반)가 둘 다 막혀 있으므로, 남는 답은 하나다 — **실행 시점에 생성해서 프로세스 환경으로만 전달한다**.

공급 주체는 `e2e/global-setup.ts`이며, 다른 어떤 단계도 이 값들을 채우지 않는다.

| 변수 | E2E에서의 값 | 공급 방식 | 디스크에 남는가 |
|------|--------------|-----------|-----------------|
| `TURSO_DATABASE_URL` | `file:./.tmp/e2e.db` | `playwright.config.ts`의 `webServer.env`에 고정 — 비밀이 아님 | 설정 파일에 평문 기재(무해) |
| `TURSO_AUTH_TOKEN` | (미설정) | §3.1 capability gate가 `file:` 스킴에서 불필요로 판정 | — |
| `TESTER_PASSWORD` | **실행 시점 무작위 생성** | global-setup이 생성 → 프로비저닝 호출과 로그인 시나리오가 같은 프로세스 환경에서 참조 | **아니오** |
| `BETTER_AUTH_SECRET` | **실행 시점 무작위 생성**(E2E 전용) | 동일 | **아니오** |
| `BETTER_AUTH_URL` | `http://localhost:3000` | `webServer` 기동 주소와 동일하게 고정 — 비밀이 아님 | 설정 파일에 평문 기재(무해) |
| `GEMINI_API_KEY` | 비밀이 아닌 더미 값 | `webServer.env`에 고정 | 설정 파일에 평문 기재(무해) — §3.1 각주 참고 |

**무작위 생성 두 건의 설계 근거**:

- `TESTER_PASSWORD`는 프로비저닝(쓰기)과 로그인 시나리오(읽기)가 **같은 값**을 봐야 하므로 어딘가에 공유되어야 한다. 파일로 공유하면 REQ-RUNTIME-008에 걸리고, 상수로 박아두면 그 상수 자체가 커밋된 비밀번호가 된다. 실행 시점 생성 + 프로세스 환경 공유는 두 제약을 동시에 만족하는 유일한 형태다. 값은 프로세스 종료와 함께 사라지므로 매 실행이 새 자격증명을 쓴다.
- `BETTER_AUTH_SECRET`은 세션 토큰 서명 키다. 개발자의 실제 시크릿을 E2E에 끌어오면 로컬 DB 격리(REQ-RUNTIME-017)를 지켜놓고 시크릿 격리를 깨는 셈이 되므로, E2E 전용 무작위 값을 쓴다. E2E는 매 실행 DB를 초기화하므로 이전 실행의 세션을 이어받을 필요가 없어 값이 매번 달라도 무방하다.

**부팅 검증과의 관계**: `webServer`는 `pnpm build && pnpm start`를 기동하므로 §3.1의 fail-fast 검증을 그대로 통과해야 한다. 위 6개 변수가 모두 채워진 상태로 서버 프로세스에 전달되는 것이 이 절의 목적이며, 하나라도 빠지면 앱이 부팅되지 않아 E2E 전체가 실패한다 — 즉 이 공급 경로의 정합성은 별도 검증 없이 E2E 실행 자체로 드러난다.

**로그 노출 금지**: 생성된 두 값은 콘솔·리포터·아티팩트에 출력하지 않는다. Playwright 실패 리포트가 환경변수를 덤프하지 않도록 하는 것을 포함한다.

## §4. 데이터 흐름 — 검증 대상 시나리오

```
[운영자 준비 단계 — 1회]
  pnpm db:migrate ─▶ 9개 테이블 생성
  pnpm db:seed    ─▶ evidence 테이블 적재
  pnpm tester:add ─▶ allowed_testers 등록 → user 행 → credential account 행

[E2E 검증 흐름 — 매 실행]
  로그인 (/login)
    └─▶ Better Auth: 자격증명 검증
          └─▶ databaseHooks.session.create.before → allowed_testers 대조
                └─▶ 통과 시 세션 생성 / 미등록 이메일이면 거부   ← REQ-RUNTIME-012

  사건 입력 (/cases/new)
    └─▶ POST /api/cases
          └─▶ getCurrentSession() 재확인
                └─▶ createCase(): validateCaseInput → runPipeline(mock) → cases + reports 삽입
                      └─▶ 201 { caseId }                                  ← REQ-RUNTIME-013

  리포트 조회 (/cases/[caseId])
    └─▶ owner_user_id 스코핑 조회
          ├─▶ 소유자: 리포트 렌더링                                        ← REQ-RUNTIME-013
          └─▶ 타 사용자: 접근 거부                                         ← REQ-RUNTIME-015

  피드백 제출 (서버 액션 submitFeedback)
    └─▶ feedback 테이블 삽입                                              ← REQ-RUNTIME-014
```

이 흐름의 모든 애플리케이션 코드는 **이미 존재한다**. 이번 SPEC이 추가하는 것은 흐름을 실제로 성립시키는 전제(마이그레이션·시드·계정)와 그것을 재현 가능하게 검증하는 수단이다.

## §5. 보존되는 경계 (변경 금지)

| 경계 | 정의 위치 | 이번 SPEC에서의 취급 |
|------|-----------|---------------------|
| 6단계 mock 파이프라인 | `lib/pipeline/**` | 불변. `runPipeline`은 여전히 mock 결과를 반환한다 |
| AI provider 인터페이스 | `lib/ai/provider.ts` | 불변. Gemini SDK는 `lib/ai/providers/gemini.ts` 밖에서 import되지 않는다 |
| PII 차단 계층 | `lib/validation/case-input.ts` | 불변. E2E는 유효한(PII 없는) 입력만 사용한다 |
| Drizzle 단일 DB 접근 경로 | `lib/db/client.ts` + `schema.ts` | `schema.ts` 불변. `client.ts`는 검증 위임만 수정, `getDb()` 지연 생성 패턴 유지 |
| evidence 조회 경로 | `lib/pipeline/evidence-retriever.ts` + `app/cases/[caseId]/page.tsx` | **불변**. 시드가 DB에 들어가더라도 두 모듈 모두 계속 JSON을 직접 읽는다(각각 `evidence-retriever.ts:1`, `page.tsx:5`의 `db/seed/evidence.json` import) — DB 조회로의 전환은 후속 SPEC 사안이다. 전환 시 고쳐야 할 지점이 파이프라인 한 곳이 아니라 **뷰 레이어까지 두 곳**임을 여기 기록해 둔다 |

마지막 항목은 의도적 설계 결정이다. 시드 적재와 파이프라인 조회 경로 전환은 별개의 관심사이며, 후자를 이번 SPEC에 끌어들이면 "런타임 활성화"가 "파이프라인 개편"으로 번진다.

## §6. 설계상 열린 지점 (구현 시 확정)

아래는 설계 의도는 확정됐으나 **구체 형태를 구현 시점의 실측으로 확정**해야 하는 항목이다. `research.md` §6의 미검증 사항과 대응한다.

- 부팅 시점 검증 훅의 정확한 위치 — `instrumentation.ts`의 `register()`가 `pnpm build` 단계(환경변수 없는 라우트 데이터 수집)와 충돌하는지 실측 후 확정한다. **충돌 시의 조정 방향은 "빌드 단계에서만 검증을 건너뛰고, 런타임 부팅 훅에서는 항상 검증"으로 고정한다** — 빌드 단계 판별 방식(Next.js가 노출하는 빌드 페이즈 표시자 등)은 구현 시 실측으로 확정하되, **검증 시점을 런타임 첫 요청 경계로 미루는 조정은 허용하지 않는다**. 첫 요청 경계는 부팅 시점이 아니므로, 그 조정은 REQ-RUNTIME-010이 닫으려는 지연 실패 문제(`lib/db/client.ts`의 현행 동작)를 그대로 재도입한다 — 즉 이 SPEC의 존재 이유를 무효화하는 폴백이다. 빌드 단계 스킵은 지연 실패가 아니다: 빌드에는 검증할 런타임 환경 자체가 없고, 실제 기동 경로는 여전히 부팅 시점에 전량 검증된다.
- credential `account` 행의 필수 컬럼 값 — `providerId`/`accountId`/`issuer`에 무엇을 넣어야 실제 로그인이 성립하는지. AC-RUNTIME-007이 이 결정을 검증한다.
- `vitest.config.ts`의 `e2e/**` 제외 방식 — 현행 include/exclude 확인 후 최소 수정.
