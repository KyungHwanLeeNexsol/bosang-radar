# SPEC-PILOT-LAUNCH-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-09-14
tier: M
artifact_set: spec.md, plan.md, acceptance.md (3 files, Tier M) + progress.md (Tier 합계 미포함)
spec_id_check: PASS (`SPEC-PILOT-LAUNCH-001` matches `^SPEC(-[A-Z][A-Z0-9]*)+-[0-9]{3}$`, Bash regex 실행 결과 PASS 확인)
depends_on_status: SPEC-PILOT-READY-001 (completed) — 유일한 의존성, 충족됨
open_clarifications: 0
plan_audit_verdict: (미실행 — `/moai run` Phase 1 Plan Audit Gate에서 실행 예정)

### Plan Revision Round 2 (External Review)

- Trigger: 외부 검토 2차 정정 요청(4개 항목) — 팀 리드 위임 메시지 기준.
- 변경된 파일: spec.md(HISTORY 추가, frontmatter `tier: S→M`/`version: 0.1.0→0.2.0`, REQ-PILOT-LAUNCH-003/004/005 본문 정정, Out of Scope — 계정 비활성화 재작성, §3을 acceptance.md 포인터로 교체), plan.md(§A Tier 판단 재산정, §A.5 비-PRESERVE 명시, §B.1-B.4 갱신, §C 마일스톤에 AC 매핑 갱신, §D 리스크 2개 추가, §E/§F 갱신), acceptance.md(신규 — AC 8개로 확장).
- 정정 항목 1 (REQ-PILOT-LAUNCH-005/AC-004): `scripts/provision-tester.ts:24-27` `buildDb()`를 Read로 재확인 — 자체 프로덕션 판별 로직 없음, `TURSO_DATABASE_URL` 해석 값에 전적으로 의존함을 확인. 발급 전 원격 DB 호스트 확인·중단 기준, 토큰 미출력, `BETTER_AUTH_SECRET` Netlify Production 일치 확인, 발급 후 실 로그인 검증을 문서화 요건 (b)/(c)/(f)로 추가.
- 정정 항목 2 (REQ-PILOT-LAUNCH-003/004): "리서치 목적 외에 사용되지 않습니다"를 유지 가능 판단했던 최초 결정을 철회 — Gemini 무료 티어는 외부 제공자 자체 정책을 따르므로 운영자가 목적 제한 집행을 보장할 수 없음. 교체 문구를 외부 모델 제공자 전송 고지로 재작성.
- 정정 항목 3 (Out of Scope — 계정 비활성화): `lib/auth/config.ts:56-77`을 Read로 재확인 — `databaseHooks.session.create.before` 훅이 매 로그인 시점마다 `isAllowedTesterEmail()`로 `allowed_testers`를 재대조함을 코드로 확인(사용자 주장과 일치, 블로커 아님). 설계 스케치를 allowlist 제거(기존 훅 재사용, 신규 마이그레이션 불필요) + 즉시 차단 필요 시 `session` 행 삭제 병행으로 변경. `user.disabled` 컬럼은 2차 대안으로 격하.
- 정정 항목 4 (Tier 재산정): `ls`/`wc -l`로 `app/login/page.test.tsx`(81줄)·`app/login/login-form.test.tsx`(201줄)·`app/cases/new/case-input-form.test.tsx`(305줄)가 이미 존재함을 확인 — REQ-PILOT-LAUNCH-001/003 렌더링 검증 어설션을 이 3개 파일에 추가해야 하므로 영향 파일 수가 소스 3 + 신규 문서 1 + 기존 테스트 3 = 총 7개로 늘어남. Tier S(< 5 files)를 명확히 초과하여 Tier M(5-15 files)으로 상향, acceptance.md를 별도 아티팩트로 신규 작성(AC 6개 → 8개, AC-PILOT-LAUNCH-007/008 추가).
- 정정 항목 5 (REQ-PILOT-LAUNCH-006 재확인, 변경 없음): `grep -n "SPEC-PILOT-READY-001" README.md .moai/project/product.md` 재실행 결과 README.md:19,138,149와 product.md:3,104,108,123 모두 이전과 동일하게 일치함을 재확인(불일치 없음) — REQ 본문 변경 불필요.
- plan-auditor는 아직 실행되지 않음(이번 정정은 별도 독립 감사 단계로 위임 예정).

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
