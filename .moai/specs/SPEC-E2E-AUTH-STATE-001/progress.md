# Progress — SPEC-E2E-AUTH-STATE-001

## §E.1 Plan-phase Audit-Ready Signal

- **상태**: plan-phase 아티팩트(spec.md / plan.md / acceptance.md) 최초 작성 완료, status: draft.
- **Tier**: M (spec.md 프론트매터, plan.md §A.1 판정 근거).
- **SPEC ID 정합성**: `SPEC-E2E-AUTH-STATE-001`이 SPEC ID 정규식(`^SPEC(-[A-Z][A-Z0-9]*)+-[0-9]{3}$`)을 통과함을 Bash로 실행 확인(PASS), 기존 `.moai/specs/` 9개 디렉터리와 충돌 없음을 확인.
- **GEARS 준수**: REQ-E2EAUTH-001~010 전체가 GEARS 5개 패턴(Event-driven/Where/Unwanted/Ubiquitous) 중 하나로 작성됨. 레거시 `IF/THEN` 모달리티 미사용.
- **Out of Scope 규칙 준수**: spec.md §4에 5개의 `### Out of Scope — <주제>` H3 서브헤딩과 각 `-` 불릿, 그리고 영문 리터럴 "out of scope" 문구 포함 확인.
- **AC 추적성**: acceptance.md §C에서 REQ 10개 전체가 최소 1개 AC로 추적됨을 확인.
- **plan-auditor iteration-1**: FAIL, 종합 점수 0.71 (Tier M 기준 0.80). D2/D3(blocking, major) + D4(blocking, minor)를 수정하고 D1/D5(선택)도 반영 — spec.md v0.1.1, HISTORY에 상세 기록. AC 11개 → 12개(AC-E2EAUTH-012 신규), REQ 10개 불변.
- **외부 리뷰어 심층 기술 리뷰 (v0.1.1 → v0.1.2)**: 브랜치 `plan/SPEC-E2E-AUTH-STATE-001`, 리뷰 기준 HEAD `d29fce99c0e1e9a7e8741cccf90f55cf1ac30be3` / SPEC-start 기준선 `1d480eaac2e0b53e0a5f0080baf14a596f09f533`(양쪽 모두 브랜치 히스토리에서 실측 검증됨). 6개 범주 — (1) 무변경 검증의 비교 기준선 오류(인자 없는 `git diff` → `$SPEC_START_SHA`/`$IMPL_COMPLETE_HEAD` 커밋 diff + 작업 트리 2단계, `scripts/`·`webServer` PRESERVE 정합), (2) auth-setup 단계를 무재시도 검증에 포함(3항목×5회 세분화, `/sign-in` 네트워크 요청 횟수 검증 신설, 과잉주장 완화), (3) storageState 재생성 실측 구체화(leftover 파일 + 전체 스위트/`--spec` 필터 양쪽, 계정 교차-오염 없음, 원문 비밀 미기록), (4) M1 설계 재정리(project-dependency를 base 설계로 확정, `test.beforeAll` fallback 전면 삭제 — Playwright 공식 문서 + `1.62.1` 재현으로 확인됨), (5) capture-evidence 2파일 EXPECTED-SKIP 명시 + lint/format 사전 위반(3건, `pnpm lint` 0건/`pnpm format:check` 3건 — plan-phase 실측, `plan.md` §D 인용) vs 신규 위반 구분, (6) `plan.md`의 낡은 AC 개수 표기 정정 — 모두 spec.md v0.1.2 HISTORY에 상세 기록. AC 12개 → 15개(013/014/015a/015b 신규), REQ 10개 불변. 기존 AC 판정 기준 완화 없음(모두 강화/정밀화).
- **Better Auth 엔드포인트 실측**: `node_modules/better-auth@1.7.1` 소스에서 `POST /api/auth/sign-in/email`, `GET /api/auth/get-session`(응답 `{ session, user }`) 직접 확인 — AC-E2EAUTH-014/015a/015b의 검증 메커니즘 근거.
- **plan-auditor iteration-3 (v0.1.2 대상, 코디네이터 보고 기준)**: **PASS, 종합 점수 0.92** — iteration-1 0.71(FAIL) → iteration-2 0.86 → iteration-3 0.92로 단조 개선, 어떤 단계에서도 회귀 없음. Must-pass 기준 7개 전원 PASS. 코디네이터가 보고한 바에 따르면 이 SPEC이 v0.1.2에서 주장한 6개 범주 전체(무변경 검증 기준선/auth-setup 무재시도 세분화/storageState 재생성 실측/M1 base 설계 확정/capture-evidence EXPECTED-SKIP·lint-format 구분/문서 정합)를 감사자가 실측 인용 증거(`$SPEC_START_SHA` 조상 관계, Better Auth 엔드포인트 소스, `pnpm format:check`/`pnpm lint` 출력 등)로 직접 재현해 독립 검증했다고 한다. 이 재감사 자체는 오케스트레이터/plan-auditor가 수행한 것으로, manager-spec인 이 세션이 직접 실행·재현한 것이 아니다 — 코디네이터의 보고를 있는 그대로 기록하며 임의로 부풀리지 않는다(`verification-claim-integrity.md` §1.1 — 관측되지 않은 검증 주장 금지, 이 항목은 "코디네이터가 보고했다"는 사실을 정확히 그 범위로 기록).
  - **D9 (major, non-blocking, run-phase로 이월)**: `plan.md:44-50`/`spec.md:96`의 "Playwright project-dependency가 1.62.1의 `--spec` 필터에서도 정상 동작한다"는 주장이 문서 내 인용이나 재현 출력 없이 서술되어 있다는 지적 — 이 SPEC의 다른 모든 사실 주장과 달리 근거가 누락됨. 감사자 권고에 따라 **지금(plan-phase) 고치지 않는다** — run-phase M1의 실제 첫 행동으로 이월하며, 조용히 잊혀지지 않도록 여기 명시적으로 기록한다.
  - **D10 (minor, cosmetic)**: `spec.md`/`acceptance.md`/`plan.md`의 "두 파일 55-56번째 줄 부근" 인용이 `capture-evidence-round5.spec.ts`의 실제 위치(52번째 줄, `capture-evidence.spec.ts`는 56번째 줄)와 달랐던 것을 이번 커밋에서 3개 파일 모두 정정했다 — 실측 재확인(`grep -n "test.skip"` 두 파일).
- **Implementation Kickoff Approval**: 아직 수행되지 않음 — run-phase 진입 전 필수. plan-auditor PASS(0.92)는 이 승인 게이트를 대체하지 않는다(`orchestration-mode-selection.md` Implementation Kickoff Approval mandatory-restoration policy).

_<이하 §E.2-§E.4는 run-phase/sync-phase에서 채워짐 — plan-phase에서는 플레이스홀더만 유지>_

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
