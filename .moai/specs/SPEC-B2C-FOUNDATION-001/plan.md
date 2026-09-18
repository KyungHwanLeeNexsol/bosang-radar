# SPEC-B2C-FOUNDATION-001 — Plan

## §A. Context

`product.md`/`structure.md`/`tech.md`가 이미 "B2C 유일 제품, B2B 코드 삭제 확정"을 문서화했지만 실행은 유보돼 있다(spec.md §1 WHY). 이 계획은 그 실행을 milestone 단위로 쪼갠 것이며, **이 SPEC 자체는 계획만 하고 실행하지 않는다**(REQ-B2CFOUND-005). 아래 milestone은 이후 별도 `/moai run` 세션(들)이 수행할 작업 단위다.

## §B. Key Decisions & Decision Gates (검토 우선순위 — 변경 가능성 높은 순)

design.md §1의 매트릭스 전체가 "가장 바뀔 가능성이 높은 결정"이므로, 리뷰어는 milestone 실행 순서(§D)보다 이 섹션을 먼저 검토하는 것을 권장한다.

1. **목표 B2C 라우트 구조** (design.md §2) — `(diagnosis)` 라우트 그룹 없이 `app/` 루트를 그대로 재사용하는 제안. 가장 UX/코드 구조에 직접적인 영향을 주는 결정이며, 후속 구현 SPEC이 착수되기 전에 재검토되어야 한다.
2. **`lib/auth/` 전면 삭제 확정** (design.md §1 `lib/auth/` 행) — "재사용 여부 미결정"이던 `structure.md`의 입장을 이 SPEC이 "DELETE"로 좁혔다. B2C에 로그인 화면이 전혀 없다는 디자인 SSOT(`design/MIGRATION-PLAN.md`)에 근거하지만, 운영자용 관리 화면 등 아직 설계되지 않은 요구가 있다면 이 결정이 뒤집힐 수 있다.
3. **`lib/pipeline/` PRESERVE 유지** (design.md §4 decision gate) — 삭제하지 않고 보존하는 결정. 담보 매칭 알고리즘이 확정되기 전까지 이 판단은 고정되며, 후속 SPEC이 재검토한다.
4. **02→03 진단 결과 ID 연결 방식, 모바일 01-D/01-E 부재 처리** (design.md §3) — NEEDS CLARIFICATION 마커로 남긴 두 항목(마커 원문은 design.md §3 참고). 신규 DB 테이블 스키마 설계(후속 SPEC)에 직접 영향을 준다.
5. **신규 DB 테이블 스코프는 이 SPEC에 없음** — Out of Scope. `lib/db/schema.ts`는 이 SPEC의 어떤 milestone에서도 수정하지 않는다(design.md §1 `lib/db/` 행).

## §C. 전제 조건 (Pre-flight)

run-phase 세션은 milestone M1 착수 전 다음을 확인한다:

- 작업 브랜치에서 실행 중인지(`git branch --show-current` ≠ `main`) — REQ-B2CFOUND-011.
- `git status`가 clean인지 — 이 SPEC 작성 시점(2026-09-18) 기준 `main`은 clean 상태였음(gitStatus 스냅샷).
- 로컬 개발 DB가 `file:` 스킴(운영 Turso 인스턴스가 아님)인지 — `.env.local`의 `TURSO_DATABASE_URL` 확인.

## §D. Milestones (실행 순서 — 항상 빌드 가능한 상태 유지)

### M1 — Baseline 기록 [코드 변경 없음]

`pnpm test` / `pnpm lint` / `pnpm format:check` / `tsc --noEmit`(또는 `pnpm build`의 타입체크 단계) / `pnpm build`를 현재 `main` 기준으로 실행하고 결과(통과/실패 개수, 경고)를 `progress.md`에 baseline으로 기록한다. 이 baseline이 이후 모든 milestone의 회귀 판정 기준이다.

### M2 — 최소 B2C 공개 진입점(임시 foundation) 마련

`app/page.tsx`를 B2B 리다이렉트에서 최소한의 정적 placeholder(빌드는 통과하지만 실제 01 화면 구현은 아닌 상태 — 예: "준비 중" 또는 design.md §2 골격만 반영한 빈 페이지)로 교체한다. **M3에서 `app/cases/*`/`app/login/*`을 제거하기 전에 반드시 선행**되어야 한다(REQ-B2CFOUND-003) — 그래야 M3 이후에도 `app/` 루트에 도달 가능한 페이지가 항상 존재한다.

### M3 — B2B 라우트·인증 의존성 제거

design.md §1에서 DELETE로 분류된 `app/cases/**`, `app/login/*`, `app/api/auth/[...all]/route.ts`, `app/api/cases/**`, `lib/auth/**`, `components/evidence-item.*`를 제거한다. `proxy.ts`는 보호 경로가 사라지므로 가드 로직을 제거하거나(§ decision, design.md §1 root 파일 행) 파일 자체를 삭제한다 — 어느 쪽이든 `pnpm build`가 통과해야 milestone 완료로 인정한다.

### M4 — 사용되지 않는 B2B 코드 제거

`lib/cases/**`, `lib/feedback/**`를 제거한다. `lib/pipeline/**`, `db/seed/evidence*`, `lib/observability/gemini-fetch-observer.*`/`gemini-observation-store.ts`는 design.md §4 decision gate에 따라 **이 milestone에서도 건드리지 않는다**(REQ-B2CFOUND-007). `lib/validation/case-input.ts` 삭제 전 PII 정규식 패턴을 후속 SPEC 참고용으로 커밋 메시지 또는 `progress.md`에 인용해 남긴다(design.md §1 근거).

### M5 — E2E·환경변수·배포 설정 정리

design.md §1에서 DELETE로 분류된 `e2e/**`(auth.*, case-*, capture-evidence*, mobile-drawer-focus, sidebar-sticky, tenant-isolation, comparison-docs-images, sidebar-assertions.ts, storage-state-paths.ts, helpers.ts) 및 `scripts/`의 DELETE 항목(e2e-tester-emails.ts, measure/capture-login.mjs, measure/login-pixel-compare.mjs, provision-tester.ts)을 제거한다. 각 삭제 항목마다 "삭제 사유 + 대체 검증(있다면 없다면 명시)"을 `progress.md`에 기록한다(REQ-B2CFOUND-009) — 단순히 테스트 개수를 줄이는 커밋으로 남기지 않는다. `lib/env.ts`의 `REQUIRED_BY_SCOPE`에서 `BETTER_AUTH_*` 요구를 제거하고, `.env.local.example`에서 대응 항목을 정리한다. `.github/workflows/deploy.yml`은 이 milestone에서 **수정하지 않는다** — 배포 워크플로 변경은 Out of Scope다.

### M6 — 문서 동기화

`product.md`/`structure.md`/`tech.md`의 "이전 방향(레거시, 코드는 유지됨)" 절을 "코드 삭제 완료" 상태로 갱신하고, `structure.md` § 현재 구조를 M1-M5 결과에 맞춰 재작성한다. `.moai/project/product.md`의 "02/24개 화면 실제 구현" 제목 오타(§ 추가 문서 정리)는 이 SPEC의 plan-phase 작성 시점에 별도로 수정한다(§H 참고, run-phase를 기다리지 않음).

### M7 — 전체 검증

M1 baseline과 동일한 5개 명령(`pnpm test`/`pnpm lint`/`pnpm format:check`/타입체크/`pnpm build`)을 재실행해 0 회귀를 확인하고, acceptance.md의 AC 전체를 통과시킨다. 이 milestone 완료 후에만 작업 브랜치를 `main`으로 병합하는 PR을 연다(REQ-B2CFOUND-011) — 병합 자체와 그 이후 배포는 이 SPEC이 아니라 별도 승인 단계다.

> **M8 이후는 이 SPEC의 범위 밖**이다 — 01→02→03 실제 화면 구현은 §I 후속 SPEC 권장 순서를 따르는 새 SPEC에서 진행한다.

## §E. 테스트 및 검증 전략

- 회귀 판정은 M1 baseline과의 diff로 수행한다 — "이전에 통과하던 테스트가 실패하는가"만 본다(새 실패가 없으면 통과).
- 삭제된 B2B 시나리오를 대체하는 B2C E2E는 이 SPEC 범위에 없다(01/02/03 화면 자체가 미구현이므로) — M5의 각 삭제 항목은 "대체 검증 없음"으로 정직하게 기록될 것으로 예상되며, 이는 실패가 아니라 이 SPEC의 정상적인 범위다.
- `pnpm build` 성공이 모든 milestone의 게이트다(REQ-B2CFOUND-002) — 실패 시 해당 milestone은 완료로 표시하지 않는다.
- 사용하지 않는 import/dependency 잔존 여부는 `pnpm lint`(ESLint `no-unused-vars` 계열)로 확인하고, `package.json`의 `better-auth` 의존성은 M3 완료 후 실제 참조가 0건인지 `grep -rn "better-auth"` 로 재확인한 뒤 M5에서 제거 여부를 판단한다.
- Oracle 배포 설정 정적 검증(REQ-B2CFOUND-011 관련) — `.github/workflows/deploy.yml`을 수정하지 않았음을 `git diff`로 확인한다(변경 금지가 곧 검증 기준).

## §F. 데이터·배포 안전 계획

- 모든 milestone은 `file:` 스킴 로컬 DB에서만 `pnpm run db:migrate`를 실행한다 — `TURSO_DATABASE_URL`이 `libsql://`/`https://`를 가리키는 환경(운영 Turso)에서는 이 SPEC의 어떤 작업도 실행하지 않는다.
- 코드 삭제(M3-M5)와 실제 운영 DB 데이터 삭제는 완전히 분리된 결정이다(REQ-B2CFOUND-004) — 이 계획에 운영 DB 데이터 삭제 milestone은 존재하지 않는다.
- `db/migrations/*.sql`은 M1-M7 어디에서도 새로 추가하거나 수정하지 않는다(REQ-B2CFOUND-006) — `lib/db/schema.ts` export가 그대로 유지되므로 마이그레이션이 필요한 스키마 변경 자체가 없다.
- `.github/workflows/deploy.yml`이 `main` push마다 자동으로 `db:migrate`+재배포를 트리거하는 상태이므로(research.md §5), M1-M7은 전부 작업 브랜치에서 수행하고 M7 완료 후에만 PR로 `main`에 병합한다(REQ-B2CFOUND-011).

## §G. 롤백 전략

- git 이력 복구: 모든 삭제는 일반 커밋으로 기록되므로 `git revert` 또는 이전 커밋으로 `git checkout`해 B2B 코드를 통째로 복구할 수 있다.
- DB 복구: `db/migrations/*`가 보존되고(§F) 기존 11개 테이블이 DROP되지 않으므로(REQ-B2CFOUND-006), 코드만 복구하면 데이터 계층은 즉시 이전 상태로 작동한다.
- 부분 롤백: milestone 단위로 커밋을 분리하면(M2/M3/M4/M5/M6를 각각 별도 커밋 또는 PR로) 특정 milestone만 선택적으로 되돌릴 수 있다 — 이 계획은 milestone을 커밋 경계와 일치시킬 것을 run-phase 세션에 권장한다.

## §H. 위험 (Risks)

| 위험 | 완화 |
|---|---|
| `main` push 시 자동 배포/db:migrate가 트리거됨 | §F — 전 작업을 작업 브랜치에서 수행, PR 리뷰 후 병합(REQ-B2CFOUND-011) |
| `lib/pipeline/` 보존 결정이 후속 SPEC에서 뒤집혀 이중 작업 발생 | design.md §4에서 "삭제가 아니라 보존"을 명시적으로 확정 — 뒤집힘 자체가 계획된 재검토 경로이지 실패가 아님 |
| M3에서 `proxy.ts` 제거 시 존재하지 않는 보호 경로를 실수로 남겨 빌드는 통과하지만 논리적으로 죽은 코드가 남음 | M7 전체 검증에서 `grep -rn "PROTECTED_PATH_PATTERNS\|isProtectedPath"` 로 잔존 여부 확인을 acceptance.md에 AC로 명시 |
| 24개 화면 디자인과 실측 export 파일 개수가 향후 어긋날 수 있음(`design/MIGRATION-PLAN.md` §2 자체의 경고) | 이 SPEC은 디자인 파일을 수정하지 않으므로 위험이 이 SPEC 범위 밖 — 후속 구현 SPEC이 재확인 |

## §I. 후속 SPEC 권장 순서 (참고용, 이 SPEC 범위 아님)

1. B2C 질문 입력·동의·추가 질문·진단 상태 (01 화면군)
2. 보상 진단 결과 및 담보 데이터 모델 (02 화면군 + 신규 DB 테이블 + 담보 매칭 decision gate 해소)
3. 상담 신청·리드 검증·성공/중복/실패 (03 화면군 + `lib/validation/lead-input.ts` + `api/leads/`)
4. 모바일 `M01-D`/`M01-E` 누락 상태 디자인·구현 보완
5. (장기) 실제 담보 매칭 엔진 및 운영 데이터 연동

## §J. Self-Verification (plan-phase)

- [x] `find`/`Read`로 실측한 근거만 인용했는가(research.md) — 추측 표현("~일 것이다") 없이 파일 경로·행 수·grep 결과로 뒷받침.
- [x] 모든 milestone이 `pnpm build` 성공을 게이트로 명시하는가(REQ-B2CFOUND-002).
- [x] 코드/DB/배포 변경을 이 SPEC의 어떤 섹션도 수행하지 않았는가(REQ-B2CFOUND-005) — Bash 명령은 전부 `find`/`grep`/`cat`/`head` 등 읽기 전용이었음.
- [x] NEEDS CLARIFICATION 마커(design.md §3 참고)가 임의로 해소되지 않고 그대로 남아 있는가.

## §K. Milestones — Summary Table

| Milestone | 범위 | 게이트 |
|---|---|---|
| M1 | Baseline 기록 | 없음(측정만) |
| M2 | 최소 B2C 진입점 마련 | `pnpm build` 성공 |
| M3 | B2B 라우트·인증 제거 | `pnpm build` 성공, M2 선행 확인 |
| M4 | 미사용 B2B 코드 제거(pipeline/evidence 제외) | `pnpm build` 성공, decision gate 항목 미변경 확인 |
| M5 | E2E·env·배포 설정 정리 | `pnpm test`/`pnpm lint` 회귀 없음, 삭제 사유 기록 |
| M6 | 문서 동기화 | product/structure/tech.md 정합성 |
| M7 | 전체 검증 | M1 baseline 대비 0 회귀, acceptance.md 전체 PASS |

## §L. Anti-Patterns Avoided

- **성급한 삭제**: `lib/pipeline/`을 "쓸모없어 보이니 지운다"고 판단하지 않고 명시적 decision gate로 보존(design.md §4) — Reproduction-First 정신에 따라 재사용 가능성을 먼저 실측·기록.
- **테스트 수 줄이기로 위장한 커버리지 손실**: M5에서 모든 E2E 삭제에 사유 기록을 의무화(REQ-B2CFOUND-009).
- **DB 파괴적 변경**: 코드 삭제와 데이터 삭제를 섞지 않음(REQ-B2CFOUND-004), 마이그레이션 불변(REQ-B2CFOUND-006).
- **`main` 직접 작업으로 인한 의도치 않은 배포**: REQ-B2CFOUND-011로 명시적 차단.
- **과설계**: 목표 구조에서 불필요한 라우트 그룹(`(diagnosis)`)을 신설하지 않고 `app/` 루트를 그대로 사용(Enforce Simplicity).

## §M. Cross-References

- `spec.md` — REQ-B2CFOUND-001~013.
- `design.md` — 삭제/재사용/보존 매트릭스(§1), 목표 구조(§2), decision gate(§3, §4).
- `research.md` — 매트릭스 근거가 된 실측 원자료.
- `acceptance.md` — AC-B2CFOUND-001~ 및 Definition of Done.
- `.moai/project/{product,structure,tech}.md` — 이 SPEC이 실행 계획으로 구체화하는 상위 문서 결정.
- `design/MIGRATION-PLAN.md` — 목표 B2C 화면 구조 SSOT.
- `.moai/specs/SPEC-ORACLE-HOSTING-001/` — 배포 플랫폼 전환 기록(§H 위험의 근거).
