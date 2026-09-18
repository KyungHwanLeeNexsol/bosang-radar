# Plan — SPEC-B2C-DIAGNOSIS-001

## 결정 우선순위 (Decision Review Priority)

아래 마일스톤은 실행 순서(의존성 기반)로 정렬되어 있다. 그중 **되돌리기 어렵거나 다른 결정에 가장 큰 영향을 주는 결정**은 다음 세 가지이며, 리뷰 시 이 세 가지를 가장 먼저 확인할 것을 권장한다.

1. **M2 — Route 구조 결정** (단일 route + client 상태 머신 vs 화면별 개별 route): 이후 모든 화면의 데이터 흐름과 "직접 URL 접근" 처리 방식을 좌우한다 (`design.md` §2).
2. **M2 — 개발·리뷰용 상태 강제 진입 방법** (쿼리 파라미터 + 프로덕션 가드): REQ-B2CDIAG-017의 안전장치이자, mock 결과가 실제 사용자에게 노출되지 않도록 막는 유일한 장치다.
3. **M4 — 동의 상세 Modal/Bottom Sheet 구현 방식** (`@base-ui/react/dialog` + `drawer` 재사용): 신규 의존성 추가 여부를 결정하며, 접근성(포커스 트랩·ESC·배경 클릭) 구현 전체가 이 선택 위에 놓인다.

## §A. Context

- 선행 SPEC: SPEC-B2C-FOUNDATION-001(완료) — `app/page.tsx`는 현재 정적 placeholder("서비스 준비 중입니다")이며 세션/인증 의존성이 없다.
- 배포 기준선: PR #16(`f7bdae7`)이 `bosang-radar.duckdns.org`에 배포·검증 완료. 이 SPEC의 run-phase가 완료되면 `/`의 placeholder를 실제 01 화면으로 교체하게 된다(M11에서 배포 스모크 체크 갱신 필요성을 기록).
- 기존 재사용 가능 자산: `components/ui/*` 11종(shadcn 스타일), `lib/validation/case-input.ts`의 PII 정규식 거부 패턴(그대로 재사용은 불가하나 패턴은 참고 가능), `zod` 4.4.3(이미 의존성에 존재), `@base-ui/react` 1.7.0(dialog·drawer·popover 등 프리미티브 전체 포함 확인됨 — `research.md` §2).
- 디자인 SSOT: `design/MIGRATION-PLAN.md` + `design/exports/`(10개 대상 화면) + `design/internal/`(2개 DEV ONLY 참고 자료, 구현 대상 아님).

## §B. Known Issues (미결정 · 리스크)

| 항목 | 상태 | 비고 |
|---|---|---|
| 담보 매칭 로직(정적 규칙 vs AI) | 미결정 (`tech.md`) | 이 SPEC은 02 화면 자체를 구현하지 않으므로 직접 영향 없음. 01→02 인터페이스 경계만 정의 |
| `lib/pipeline/` 재사용 여부 | 미결정 (REQ-B2CFOUND-007) | 이 SPEC은 관여하지 않음 |
| M01-D/M01-E 모바일 디자인 부재 | 미해결 — `design.md` §1 참고 | 신규 제작은 Out of Scope, 처리 원칙만 design.md에 기록 |
| DEV-ONLY 동의 상세 6개 문구 placeholder | 법무 확정 전 | 그대로 `{}` 형태 유지, 실제 화면에 노출 금지 |
| 반응형 브레이크포인트 정확한 전환 지점(391px~767px 구간) | NEEDS CLARIFICATION | `design.md` §13 참고 |

## §C. Pre-flight

- [ ] `git status` clean 확인, `plan/SPEC-B2C-DIAGNOSIS-001` 브랜치가 `origin/main`(`f7bdae7`) 기준으로 생성됨
- [ ] `design/exports/`의 10개 대상 PNG + `design/internal/`의 2개 DEV ONLY PNG 확인됨(본 plan-phase에서 완료)
- [ ] `pnpm ls @base-ui/react zod` — 두 의존성 모두 이미 설치되어 있음을 확인(본 plan-phase에서 완료, `research.md` §2)
- [ ] 후속 run-phase 시작 전, `origin/main`이 이 plan PR 병합 후의 최신 상태인지 재확인

## §D. Constraints

- 신규 코드는 `app/`, `components/`, `lib/validation/` 범위 내에서만 추가한다 — `lib/pipeline/`, `lib/ai/`, `lib/db/`, `db/`는 손대지 않는다(REQ-B2CFOUND-007 decision gate 유지).
- 신규 의존성 추가 없이 기존 `@base-ui/react`(dialog, drawer, popover) + `zod` + shadcn 스타일 `components/ui/*`로 구현한다.
- DB·서버 영구 저장 없음 — 클라이언트 상태(React state) + 세션 동안만 유지되는 URL 쿼리 파라미터로 상태 전이를 표현한다.
- `design/claimradar-ui.pen`, `design/exports/`, `design/internal/`은 읽기 전용 참고 자료다 — 수정하지 않는다.

## §E. Self-Verification (plan-phase)

- [x] GEARS 표기 요구사항 24건 작성, Tier L 상한(25) 이내
- [x] Out of Scope 섹션에 6개 `### Out of Scope —` 하위 제목 + 각 bullet 작성
- [x] 기존 코드베이스 조사(app/, components/, lib/, package.json, node_modules) 완료 — `research.md`
- [x] 디자인 export 10개 + DEV ONLY 2개 직접 열람 완료
- [ ] plan-auditor 검토 대기

## §F. Milestones (후속 `/moai run SPEC-B2C-DIAGNOSIS-001`의 실행 계획)

아래 마일스톤은 모두 **후속 run-phase가 실행할 계획**이며, 이번 plan-phase는 문서만 작성한다.

1. **기준선 및 디자인 프레임 조사** — 10개 export PNG + 2개 DEV ONLY PNG 재확인, `components/ui/*` 재사용 범위 최종 확정, `@base-ui/react` dialog/drawer API 시그니처 확인.
2. **공개 B2C route와 진단 shell** — `app/page.tsx`를 진단 플로우 Client Component 셸로 교체(Server Component 래퍼 유지), `?step=` 쿼리 파라미터 기반 상태 전이 라우팅 구현, 개발용 상태 강제 진입 파라미터(프로덕션 가드 포함) 구현.
3. **기본 진단 정보 입력** — 01/M01 검색창 + "많이 찾는 사례" 칩, `lib/validation/diagnosis-input.ts` zod 스키마(PII 정규식 거부) 작성 및 단위 테스트.
4. **필수 민감정보 동의** — 01-A2/M01-A2 동의 화면, Desktop Modal(`@base-ui/react/dialog`) + Mobile Bottom Sheet(`@base-ui/react/drawer`) 구현, CTA 비활성화 조건, 내용 보기 열람 시 체크 자동 선택 금지, 닫기/ESC/배경클릭/포커스 복귀.
5. **추가 질문** — 01-B/M01-B 3문항 순차 진행, 건너뛰기 링크, 답변의 클라이언트 상태 보존.
6. **분석 중 · 결과 없음 · 오류 · 재시도 상태** — 01-C/M01-C 로딩 단계 표시, 01-D 결과 없음, 01-E 분석 오류 + 재시도/입력으로 돌아가기, mock 데이터 명시적 구분(REQ-B2CDIAG-024).
7. **Mobile 반응형 및 bottom sheet** — 390px 기준 레이아웃, Desktop/Mobile 공용 상태 머신 검증, M01-D/M01-E 부재에 대한 처리 원칙 적용.
8. **접근성** — 키보드 내비게이션, 포커스 트랩·복귀, 스크린리더 label 연결, `prefers-reduced-motion` 대응.
9. **unit/component 테스트** — 입력 스키마, 상태 전이, 동의 검증, modal/bottom sheet 동작에 대한 Vitest 테스트.
10. **01 Playwright 및 시각 정합성 검증** — `pnpm test:e2e` 대상 시나리오 신규 작성(01 범위 한정), `design/exports/` PNG와 구현 화면의 수동 비교 절차 수행(`design.md` §16).
11. **문서·배포 smoke check 갱신** — `structure.md`/`tech.md` 반영, `.github/workflows/deploy.yml`의 "서비스 준비 중입니다" 스모크 체크를 새 01 화면의 안정적 식별자로 교체(실제 워크플로 수정은 이 마일스톤의 run-phase 실행 시점에 처리).

## §G. Anti-Patterns (이 SPEC에서 피해야 할 것)

- 02/03 화면을 "겸사겸사" 함께 구현하지 않는다 — 인터페이스 경계만 정의한다.
- `lib/pipeline/`을 담보 매칭에 재사용 가능한지 이 SPEC에서 판단하지 않는다.
- DEV-ONLY 플레이스홀더 문구(`{처리 목적 확정 문구}` 등)를 임의로 확정해서 사용자 화면에 노출하지 않는다.
- mock 진단 결과를 실제 결과처럼 보이게 스타일링하지 않는다(REQ-B2CDIAG-024).
- `pnpm test:e2e` 0개 상태를 억지로 통과시키기 위한 빈 placeholder 테스트를 추가하지 않는다.

## §H. Cross-References

- `.moai/specs/SPEC-B2C-DIAGNOSIS-001/design.md` — 상태 머신, route/컴포넌트 경계, 기술 결정 상세
- `.moai/specs/SPEC-B2C-DIAGNOSIS-001/research.md` — 코드베이스·의존성 조사 근거
- `.moai/specs/SPEC-B2C-DIAGNOSIS-001/acceptance.md` — Given-When-Then 수용 기준
- `.moai/specs/SPEC-B2C-FOUNDATION-001/` — 선행 SPEC(B2B 삭제·B2C 셸 전환)
- `design/MIGRATION-PLAN.md` §6(동의 구조), §8(폐기 이력, 모바일 재도입)
