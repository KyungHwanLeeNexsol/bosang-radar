# SPEC-PILOT-LAUNCH-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-09-14
tier: M
artifact_set: spec.md, plan.md, acceptance.md (3 files, Tier M) + progress.md (Tier 합계 미포함)
spec_id_check: PASS (`SPEC-PILOT-LAUNCH-001` matches `^SPEC(-[A-Z][A-Z0-9]*)+-[0-9]{3}$`, Bash regex 실행 결과 PASS 확인)
depends_on_status: SPEC-PILOT-READY-001 (completed) — 유일한 의존성, 충족됨
open_clarifications: 1 (Netlify 프로덕션 배포 실제 URL·SHA — spec.md §2.F 아래 미해결 확인 사항 참고)
plan_audit_verdict: iteration 1 = PASS, score 0.92 (Tier M 임계값 0.80 이상 충족), commit `2af6f0f` 기준 (`.moai/reports/plan-audit/SPEC-PILOT-LAUNCH-001-review-1.md`). D1(REQ-PILOT-LAUNCH-006 근거 줄 번호 인용 오류) 결함은 후속 커밋 `2dbc9b2`에서 1차 정정됐으나, Plan Revision Round 3(아래)에서 재검증 결과 그 1차 정정치도 정확하지 않았음이 드러나 다시 정정했다 — iteration 1의 PASS/0.92 판정은 그 시점의 아티팩트 상태에는 유효하지만, Round 3의 추가 편집으로 spec.md/plan.md/acceptance.md 아티팩트 해시가 다시 변경됐으므로 `/moai run` Phase 1 Plan Audit Gate 진입 전 iteration 2 재감사가 필요하다(skip-eligibility 3조건 중 "아티팩트 해시 무변경" 불충족).

### Plan Revision Round 2 (External Review)

- Trigger: 외부 검토 2차 정정 요청(4개 항목) — 팀 리드 위임 메시지 기준.
- 변경된 파일: spec.md(HISTORY 추가, frontmatter `tier: S→M`/`version: 0.1.0→0.2.0`, REQ-PILOT-LAUNCH-003/004/005 본문 정정, Out of Scope — 계정 비활성화 재작성, §3을 acceptance.md 포인터로 교체), plan.md(§A Tier 판단 재산정, §A.5 비-PRESERVE 명시, §B.1-B.4 갱신, §C 마일스톤에 AC 매핑 갱신, §D 리스크 2개 추가, §E/§F 갱신), acceptance.md(신규 — AC 8개로 확장).
- 정정 항목 1 (REQ-PILOT-LAUNCH-005/AC-004): `scripts/provision-tester.ts:24-27` `buildDb()`를 Read로 재확인 — 자체 프로덕션 판별 로직 없음, `TURSO_DATABASE_URL` 해석 값에 전적으로 의존함을 확인. 발급 전 원격 DB 호스트 확인·중단 기준, 토큰 미출력, `BETTER_AUTH_SECRET` Netlify Production 일치 확인, 발급 후 실 로그인 검증을 문서화 요건 (b)/(c)/(f)로 추가.
- 정정 항목 2 (REQ-PILOT-LAUNCH-003/004): "리서치 목적 외에 사용되지 않습니다"를 유지 가능 판단했던 최초 결정을 철회 — Gemini 무료 티어는 외부 제공자 자체 정책을 따르므로 운영자가 목적 제한 집행을 보장할 수 없음. 교체 문구를 외부 모델 제공자 전송 고지로 재작성.
- 정정 항목 3 (Out of Scope — 계정 비활성화): `lib/auth/config.ts:56-77`을 Read로 재확인 — `databaseHooks.session.create.before` 훅이 매 로그인 시점마다 `isAllowedTesterEmail()`로 `allowed_testers`를 재대조함을 코드로 확인(사용자 주장과 일치, 블로커 아님). 설계 스케치를 allowlist 제거(기존 훅 재사용, 신규 마이그레이션 불필요) + 즉시 차단 필요 시 `session` 행 삭제 병행으로 변경. `user.disabled` 컬럼은 2차 대안으로 격하.
- 정정 항목 4 (Tier 재산정): `ls`/`wc -l`로 `app/login/page.test.tsx`(81줄)·`app/login/login-form.test.tsx`(201줄)·`app/cases/new/case-input-form.test.tsx`(305줄)가 이미 존재함을 확인 — REQ-PILOT-LAUNCH-001/003 렌더링 검증 어설션을 이 3개 파일에 추가해야 하므로 영향 파일 수가 소스 3 + 신규 문서 1 + 기존 테스트 3 = 총 7개로 늘어남. Tier S(< 5 files)를 명확히 초과하여 Tier M(5-15 files)으로 상향, acceptance.md를 별도 아티팩트로 신규 작성(AC 6개 → 8개, AC-PILOT-LAUNCH-007/008 추가).
- 정정 항목 5 (REQ-PILOT-LAUNCH-006 재확인, 변경 없음): `grep -n "SPEC-PILOT-READY-001" README.md .moai/project/product.md` 재실행 결과 README.md:19,138,149와 product.md:3,104,108,123 모두 이전과 동일하게 일치함을 재확인(불일치 없음) — REQ 본문 변경 불필요.
- plan-auditor는 아직 실행되지 않음(이번 정정은 별도 독립 감사 단계로 위임 예정).

### Plan Revision Round 3 (External Review)

- Trigger: 외부 검토 3차 정정 요청(4개 항목) — 팀 리드 위임 메시지 기준. 대상: spec.md, plan.md, acceptance.md, progress.md만(README.md/product.md는 무변경).
- 정정 항목 1 (Netlify 프로덕션 배포 확인): 사용자가 프로덕션 배포 완료를 확인했으나, GitHub commit-status API(`/commits/d08c01d.../status`)와 Deployments API(`/deployments`) 조회 결과 두 API 모두 신호 없음(`total_count: 0`, 빈 배열)을 확인. 이 딜리게이션 세션에도 GitHub CLI(`gh`)가 설치되어 있지 않아(`gh: command not found`) 재검증 시도가 동일하게 도구 부재로 막힘 — 오케스트레이터와 동일한 결론(독립 검증 불가)에 도달. spec.md §2.F 아래에 `[NEEDS CLARIFICATION: Netlify 프로덕션 배포 실제 URL·배포 SHA]` 마커를 신규 기록, README.md/product.md는 무변경(기존 "아직 결정되지 않았습니다" 서술이 이 불확실성과 일치하므로).
- 정정 항목 2 (전송 고지 문구 확정): REQ-PILOT-LAUNCH-003/004(spec.md), §B.2(plan.md), AC-PILOT-LAUNCH-003(acceptance.md)의 교체 문구를 "입력 내용은 AI 분석을 위해 외부 모델 제공자에게 전송될 수 있습니다"(가능성 표현)에서 "입력한 정보는 AI 분석을 위해 외부 AI 모델 제공자(Google Gemini)에 전송됩니다"(확정 표현, Google Gemini 명시)로 3개 파일 모두 일관되게 정정 — Gemini 호출은 모든 제출 건에서 항상 발생하는 실제 흐름이므로 가능성 표현이 부정확했다.
- 정정 항목 3 (REQ-PILOT-LAUNCH-006 근거 재재검증): `grep -n "SPEC-PILOT-READY-001" README.md .moai/project/product.md`를 이 딜리게이션 세션에서 직접 재실행 — README.md:19,23,138,149 / product.md:3,104,108,123을 확인(무변경 확인, Bash 실행 결과 verbatim). D1 감사 이후 정정 커밋 `2dbc9b2`가 기록한 값(README.md:19,23,138,142; product.md:3-5,82,104)이 실제로는 여전히 부정확했음을 발견 — README.md 4번째 줄 번호가 142가 아니라 149였고, product.md 전체 4개 줄 번호가 달랐다. spec.md REQ-PILOT-LAUNCH-006 본문과 근거 열을 이번 재검증 값으로 재정정하고, 기계적 Grep 인용(줄 번호, 편집 시 드리프트 가능)과 의미적 검증 대상(status/GO/PR#10/병합 SHA 4가지 사실, 안정적)을 명시적으로 구분하는 문장을 추가했다.
- 정정 항목 4 (재감사 필요성 기록): 위 §E.1 `plan_audit_verdict` 필드에 iteration 1(PASS 0.92, commit `2af6f0f`)의 실제 결과와 D1 해결 이력(`2dbc9b2`)을 정확히 기록하고, Round 3의 추가 편집이 아티팩트 해시를 다시 변경했으므로 iteration 2 재감사가 필요함을 명시. `open_clarifications`를 0에서 1로 갱신(정정 항목 1의 신규 클래리피케이션 마커 반영).

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
