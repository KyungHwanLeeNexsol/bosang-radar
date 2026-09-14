# SPEC-PILOT-LAUNCH-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-09-14
tier: M
artifact_set: spec.md, plan.md, acceptance.md (3 files, Tier M) + progress.md (Tier 합계 미포함)
spec_id_check: PASS (`SPEC-PILOT-LAUNCH-001` matches `^SPEC(-[A-Z][A-Z0-9]*)+-[0-9]{3}$`, Bash regex 실행 결과 PASS 확인)
depends_on_status: SPEC-PILOT-READY-001 (completed) — 유일한 의존성, 충족됨
open_clarifications: 1 (Netlify 프로덕션 배포 실제 URL·SHA — spec.md §2.F 아래 미해결 확인 사항 참고)
plan_audit_verdict: iteration 1 = PASS, score 0.92 (Tier M 임계값 0.80 이상 충족), commit `2af6f0f` 기준 (`.moai/reports/plan-audit/SPEC-PILOT-LAUNCH-001-review-1.md`). D1(REQ-PILOT-LAUNCH-006 근거 줄 번호 인용 오류) 결함은 후속 커밋 `2dbc9b2`에서 1차 정정됐으나, Plan Revision Round 3(아래)에서 재검증 결과 그 1차 정정치도 정확하지 않았음이 드러나 다시 정정했다 — iteration 1의 PASS/0.92 판정은 그 시점의 아티팩트 상태에는 유효하지만, Round 3의 추가 편집으로 spec.md/plan.md/acceptance.md 아티팩트 해시가 다시 변경됐으므로 iteration 2 재감사를 수행했다. **iteration 2 = FAIL(2026-09-14, commit `3262380` 기준, `.moai/reports/plan-audit/SPEC-PILOT-LAUNCH-001-review-2.md`)** — 점수 0.92·7개 must-pass 전부 PASS/N/A였으나, D-NEW-1(이 파일 "정정 항목 5" 줄이 README.md 23번 줄을 누락한 채 "불일치 없음"이라고 잘못 단정한 미해결 결함, D1과 동일 결함군의 재발)로 인해 Retry Loop Contract에 따라 FAIL 판정됨. spec.md/plan.md/acceptance.md 자체는 iteration 2에서 결함 없음으로 확인됨(D-NEW-1은 progress.md 한정 결함). 오케스트레이터가 정정 항목 5 줄을 즉시 수정(`README.md:19,138,149` → `README.md:19,23,138,149`). **iteration 3 = FAIL(2026-09-14, commit `1d85ef5` 기준, `.moai/reports/plan-audit/SPEC-PILOT-LAUNCH-001-review-3.md`)** — D-NEW-1 수정 자체는 확인됐으나(spec.md/plan.md/acceptance.md는 iteration 2 이후 무변경 재확인), 동일 결함군의 새 인스턴스(D-NEW-2, `plan.md:136` §B.4 — 동일한 README.md 23번 줄 누락 패턴)를 발견해 FAIL 유지. 이로써 plan-auditor 표준 3회 재시도 한도(Retry Loop Contract)를 소진했다. 오케스트레이터가 SPEC 폴더 전체(`grep -rn "README.md:19,138,149"`)를 직접 재검색해 D-NEW-2가 유일한 잔존 인스턴스임을 확인한 뒤, 사용자에게 AskUserQuestion으로 (a) 즉시 수정 후 추가 감사 없이 종료 (b) 즉시 수정 후 iteration 4 명시적 초과 진행 (c) PASS-with-debt로 미해결 유지 3가지를 제시했다. 사용자는 (a)를 선택 — `plan.md:136`을 즉시 정정하고, 추가 iteration 4 감사 없이 이 라운드를 종결한다. SPEC 폴더 전체 재검색 결과 이 패턴의 잔존 인스턴스는 더 이상 없음(2026-09-14 기준). **iteration 4 = PASS(2026-09-14, 사용자 명시 승인 예외 — 표준 3회 한도 초과, commit `97f31ea` 기준, `.moai/reports/plan-audit/SPEC-PILOT-LAUNCH-001-review-4.md`)** — score 0.92(harmonic mean), Tier M 임계값 0.80 이상 충족. Must-pass 5개 PASS·2개 N/A(MP-4 언어중립성, MP-6 D8 크로스플랫폼), must-pass 실패 0건. 카테고리 점수: Clarity 1.0·Completeness 1.0·Testability 1.0·Traceability 0.75(AC-PILOT-LAUNCH-006이 개별 REQ-XXX 대신 "Out of Scope 절 전체"를 참조 — 의도적이나 형식상 비정형, 비차단). D-NEW-2(plan.md:136) 재발 없음 확인, iteration 1→2→3에 걸쳐 반복됐던 인용 드리프트 결함군은 완전히 해소됨. 이 iteration 4 PASS는 **commit `97f31ea` 기준 현재 HEAD에 대한 판정**이며, 과거 iteration 1의 PASS/0.92를 재활용한 것이 아니다 — 감사 대상 commit이 다르다. `acceptance.md` §D.6의 run-phase 착수 전 plan-auditor PASS 요구사항이 이 iteration 4 PASS로 충족됐다. D1(AC-006 간접 traceability)·D2(spec.md §2 섹션 문자 A/B/C/D/F 중 E 결번) 2건은 비차단 선택 사항으로 남는다.

**Netlify 프로덕션 URL/배포 SHA**: 2026-09-14 기준 사용자로부터 아직 제공되지 않음 — `[NEEDS CLARIFICATION]`은 그대로 유지한다(spec.md §2.F 아래). 이 미해결 확인 사항은 위 plan-auditor iteration 4 PASS 판정과는 별개이며, 서로 혼동하지 않는다 — plan 감사 PASS는 SPEC 문서 자체의 내적 일관성·완전성을 판정한 것이고, Netlify 배포 확인은 SPEC 범위 밖의 별도 사실 확인 항목이다.

### Plan Revision Round 2 (External Review)

- Trigger: 외부 검토 2차 정정 요청(4개 항목) — 팀 리드 위임 메시지 기준.
- 변경된 파일: spec.md(HISTORY 추가, frontmatter `tier: S→M`/`version: 0.1.0→0.2.0`, REQ-PILOT-LAUNCH-003/004/005 본문 정정, Out of Scope — 계정 비활성화 재작성, §3을 acceptance.md 포인터로 교체), plan.md(§A Tier 판단 재산정, §A.5 비-PRESERVE 명시, §B.1-B.4 갱신, §C 마일스톤에 AC 매핑 갱신, §D 리스크 2개 추가, §E/§F 갱신), acceptance.md(신규 — AC 8개로 확장).
- 정정 항목 1 (REQ-PILOT-LAUNCH-005/AC-004): `scripts/provision-tester.ts:24-27` `buildDb()`를 Read로 재확인 — 자체 프로덕션 판별 로직 없음, `TURSO_DATABASE_URL` 해석 값에 전적으로 의존함을 확인. 발급 전 원격 DB 호스트 확인·중단 기준, 토큰 미출력, `BETTER_AUTH_SECRET` Netlify Production 일치 확인, 발급 후 실 로그인 검증을 문서화 요건 (b)/(c)/(f)로 추가.
- 정정 항목 2 (REQ-PILOT-LAUNCH-003/004): "리서치 목적 외에 사용되지 않습니다"를 유지 가능 판단했던 최초 결정을 철회 — Gemini 무료 티어는 외부 제공자 자체 정책을 따르므로 운영자가 목적 제한 집행을 보장할 수 없음. 교체 문구를 외부 모델 제공자 전송 고지로 재작성.
- 정정 항목 3 (Out of Scope — 계정 비활성화): `lib/auth/config.ts:56-77`을 Read로 재확인 — `databaseHooks.session.create.before` 훅이 매 로그인 시점마다 `isAllowedTesterEmail()`로 `allowed_testers`를 재대조함을 코드로 확인(사용자 주장과 일치, 블로커 아님). 설계 스케치를 allowlist 제거(기존 훅 재사용, 신규 마이그레이션 불필요) + 즉시 차단 필요 시 `session` 행 삭제 병행으로 변경. `user.disabled` 컬럼은 2차 대안으로 격하.
- 정정 항목 4 (Tier 재산정): `ls`/`wc -l`로 `app/login/page.test.tsx`(81줄)·`app/login/login-form.test.tsx`(201줄)·`app/cases/new/case-input-form.test.tsx`(305줄)가 이미 존재함을 확인 — REQ-PILOT-LAUNCH-001/003 렌더링 검증 어설션을 이 3개 파일에 추가해야 하므로 영향 파일 수가 소스 3 + 신규 문서 1 + 기존 테스트 3 = 총 7개로 늘어남. Tier S(< 5 files)를 명확히 초과하여 Tier M(5-15 files)으로 상향, acceptance.md를 별도 아티팩트로 신규 작성(AC 6개 → 8개, AC-PILOT-LAUNCH-007/008 추가).
- 정정 항목 5 (REQ-PILOT-LAUNCH-006 재확인, 변경 없음): `grep -n "SPEC-PILOT-READY-001" README.md .moai/project/product.md` 재실행 결과 README.md:19,23,138,149와 product.md:3,104,108,123 모두 이전과 동일하게 일치함을 재확인(불일치 없음) — REQ 본문 변경 불필요. (2026-09-14 iteration 2 감사 D-NEW-1 반영: 이 줄이 실제로는 23번 줄을 누락한 채 "불일치 없음"이라고 잘못 단정하고 있었음을 오케스트레이터가 직접 정정)
- plan-auditor는 아직 실행되지 않음(이번 정정은 별도 독립 감사 단계로 위임 예정).

### Plan Revision Round 3 (External Review)

- Trigger: 외부 검토 3차 정정 요청(4개 항목) — 팀 리드 위임 메시지 기준. 대상: spec.md, plan.md, acceptance.md, progress.md만(README.md/product.md는 무변경).
- 정정 항목 1 (Netlify 프로덕션 배포 확인): 사용자가 프로덕션 배포 완료를 확인했으나, GitHub commit-status API(`/commits/d08c01d.../status`)와 Deployments API(`/deployments`) 조회 결과 두 API 모두 신호 없음(`total_count: 0`, 빈 배열)을 확인. 이 딜리게이션 세션에도 GitHub CLI(`gh`)가 설치되어 있지 않아(`gh: command not found`) 재검증 시도가 동일하게 도구 부재로 막힘 — 오케스트레이터와 동일한 결론(독립 검증 불가)에 도달. spec.md §2.F 아래에 `[NEEDS CLARIFICATION: Netlify 프로덕션 배포 실제 URL·배포 SHA]` 마커를 신규 기록, README.md/product.md는 무변경(기존 "아직 결정되지 않았습니다" 서술이 이 불확실성과 일치하므로).
- 정정 항목 2 (전송 고지 문구 확정): REQ-PILOT-LAUNCH-003/004(spec.md), §B.2(plan.md), AC-PILOT-LAUNCH-003(acceptance.md)의 교체 문구를 "입력 내용은 AI 분석을 위해 외부 모델 제공자에게 전송될 수 있습니다"(가능성 표현)에서 "입력한 정보는 AI 분석을 위해 외부 AI 모델 제공자(Google Gemini)에 전송됩니다"(확정 표현, Google Gemini 명시)로 3개 파일 모두 일관되게 정정 — Gemini 호출은 모든 제출 건에서 항상 발생하는 실제 흐름이므로 가능성 표현이 부정확했다.
- 정정 항목 3 (REQ-PILOT-LAUNCH-006 근거 재재검증): `grep -n "SPEC-PILOT-READY-001" README.md .moai/project/product.md`를 이 딜리게이션 세션에서 직접 재실행 — README.md:19,23,138,149 / product.md:3,104,108,123을 확인(무변경 확인, Bash 실행 결과 verbatim). D1 감사 이후 정정 커밋 `2dbc9b2`가 기록한 값(README.md:19,23,138,142; product.md:3-5,82,104)이 실제로는 여전히 부정확했음을 발견 — README.md 4번째 줄 번호가 142가 아니라 149였고, product.md 전체 4개 줄 번호가 달랐다. spec.md REQ-PILOT-LAUNCH-006 본문과 근거 열을 이번 재검증 값으로 재정정하고, 기계적 Grep 인용(줄 번호, 편집 시 드리프트 가능)과 의미적 검증 대상(status/GO/PR#10/병합 SHA 4가지 사실, 안정적)을 명시적으로 구분하는 문장을 추가했다.
- 정정 항목 4 (재감사 필요성 기록): 위 §E.1 `plan_audit_verdict` 필드에 iteration 1(PASS 0.92, commit `2af6f0f`)의 실제 결과와 D1 해결 이력(`2dbc9b2`)을 정확히 기록하고, Round 3의 추가 편집이 아티팩트 해시를 다시 변경했으므로 iteration 2 재감사가 필요함을 명시. `open_clarifications`를 0에서 1로 갱신(정정 항목 1의 신규 클래리피케이션 마커 반영).

## §F Phase 4 Mode Selection

Input parameters: tier=M, scope=7 files (3 source + 1 new doc + 3 existing test files), domain count=1 (frontend copy + docs, no cross-domain fan-out), file language mix=TSX + Markdown, concurrency benefit=LOW (coding-heavy sequential edits, not research).

Mode evaluation:
- direct: not selected — multi-file, non-trivial (string replacement + test assertions + new doc across 7 files).
- fanout: not selected — single domain, coding-heavy (Anthropic coding-task parallelism caveat applies).
- sweep: not selected — scope (7 files) is far below the ~30-file mechanical-transform threshold, and the work is not a single uniform mechanical rule.
- serial: selected.

Decision: serial

Justification: Tier M SPEC with 7 files across one domain (frontend copy edits + one new doc), all changes are sequential/dependent milestones (M1→M5 per plan.md §C) authored by a single manager-develop delegation using the full Section A-E template. No genuine parallelism benefit exists per Anthropic's coding-task parallelism caveat.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
