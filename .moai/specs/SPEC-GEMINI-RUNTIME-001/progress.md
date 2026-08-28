# SPEC-GEMINI-RUNTIME-001 — 진행 기록 (progress.md)

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-08-27
tier: L
artifact_set: spec.md, plan.md, acceptance.md, design.md, research.md (5개, Tier L)
spec_version: "0.4.2"

### plan-auditor 감사 이력 (실제 발생한 감사만 기록 — verification-claim-integrity 원칙: 관측하지 않은 PASS를 기록하지 않는다)

- **Cycle 1** (원본 v0.1.0/v0.2.0, REQ-018 커버리지 공백 이슈):
  - iteration 1 — **FAIL** (overall 0.878, blocking Traceability 공백: REQ-GEMINI-RUNTIME-018이 묶은 5개 비회귀 주장 중 3개에 대응 AC 부재)
  - iteration 2 — **PASS** (overall 0.98) — AC-GEMINI-RUNTIME-022a/022b/022c 3건 신설로 공백 해소 확인
- **Cycle 2** (외부 독립 리뷰 D1~D5 반영, v0.2.0 → v0.3.0, 신규 감사 사이클):
  - iteration 1 — **PASS** (overall 0.97, 7개 must-pass 기준 전부 충족, 선택적/non-blocking 발견 2건만 잔존)
- **Cycle 3** (외부 독립 리뷰 case-boundary `RateScheduler` 싱글턴 결함 반영, v0.3.0 → v0.4.1, 신규 감사 사이클):
  - iteration 1 — **FAIL** (overall 0.92, blocking Traceability 공백: REQ-GEMINI-RUNTIME-025이 묶은 2개 절반 중 test-path isolation 절반에 대응 AC 부재)
  - iteration 2 — **PASS** (overall ≈0.97; Clarity 0.9 / Completeness 1.0 / Testability 1.0 / Traceability 1.0) — AC-GEMINI-RUNTIME-016b 신설로 공백 해소 확인, 7개 must-pass 기준 전부 충족, D-NEW1 싱글턴이 v0.3.0의 동일-모델 scheduler 공유 계약(REQ-022)과 충돌 없이 합성됨을 재확인
- **Cycle 4** (외부 독립 리뷰 지적 — Researcher 배치 그라운딩 계약 회귀 방지, v0.4.1 → v0.4.2, 소규모 델타, 신규 감사 사이클):
  - spec.md REQ-GEMINI-RUNTIME-007 본문·§1 WHAT, design.md §2, plan.md M2에 "Researcher finding은 최소 1개의 실제 evidence ID를 인용해야 한다"는 그라운딩 계약을 파싱 후 항목별 업무 규칙 검증의 명시적 3단계로 재배치(현행 per-query 스키마의 `.min(1)`이 보증하던 것을 배치 전환 이후에도 보존). Skeptic은 이 단계에서 제외되는 비대칭을 명시적으로 서술.
  - acceptance.md에 AC-GEMINI-RUNTIME-009a 신설(빈 evidence Researcher 항목만 개별 폐기, 같은 배치의 다른 정상 항목은 보존).
  - iteration 1 — **PASS** (overall ≈0.98; Clarity 1.0 / Completeness 1.0 / Testability 1.0 / Traceability 1.0) — 독립 plan-auditor 감사 완료(팀 리드 위임, 워크트리 `.claude/worktrees/gemini-grounding-fix`에서 직접 실행). 검증 내역: (1) 실 `lib/pipeline/researcher.ts`를 Read로 직접 확인해 HISTORY의 핵심 주장("현행 per-query `buildFindingSchema()`가 `supportingEvidenceIds.min(1)`로 그라운딩을 보증한다")이 사실임을 확인(17-27행) — 배치 전환이 이 보증을 제거한다는 D-NEW2 문제 인식이 정확함. (2) REQ-GEMINI-RUNTIME-007의 5단계 순서(candidate 소속 → dedup → Researcher-only length>=1 → evidence 부분집합 → safety-validator)가 옵션 2("구조는 스키마로, 업무 규칙은 파싱 후 코드로")의 항목별 개별 폐기 설계와 정합하며, 위반 항목만 폐기되고 배치 전체 실패로 확산되지 않는 부분 배치 실패 계약을 그대로 보존함을 design.md §2 코드 주석 스텁과 대조해 확인. (3) AC-GEMINI-RUNTIME-009a의 Given-When-Then이 이진 판정 가능(query B만 폐기, A/C 보존)하고 weasel word 없이 작성되었으며, REQ-GEMINI-RUNTIME-007(주)·REQ-GEMINI-RUNTIME-004(부 — "evidence 없이는 finding 없음"이라는 동일 계열의 그라운딩 원칙)에 대한 매핑이 성립함을 확인. (4) Skeptic-Researcher 비대칭(Skeptic은 빈 evidence 배열 허용 유지)이 REQ-GEMINI-RUNTIME-010("counterEvidenceIds 빈 배열 = corpus 부족 자동 확정 금지") 및 기존 AC-GEMINI-RUNTIME-009/010/011과 모순 없이 정합함을 확인. (5) `git diff --stat` 및 `plan.md` 마일스톤 목록(M1~M6) 대조로 Requirement A(M1, env vars)·Requirement C(M1/M3, rate scheduler)·M4~M6이 이번 델타에서 전혀 수정되지 않았음을 직접 확인 — scope discipline 준수. Traceability: REQ-GEMINI-RUNTIME-007 ↔ {AC-009, AC-009a, AC-010, AC-011} 매핑 및 §E 서브레터 카운트(9→10, 009a 반영) 정합. 7개 must-pass 기준(MP-1~MP-7) 전부 충족 — REQ 번호 연속성 무변경, GEARS 형식 유지, frontmatter 12필드 무결(version만 갱신), `[NEEDS CLARIFICATION]` 잔존 없음(grep 확인), syscall/D8 해당 없음. Non-blocking 관찰 2건(모두 이번 델타 밖의 사전 존재 사항 또는 경미한 사항, blocking 아님): (a) spec.md가 참조하는 `SPEC-EVIDENCE-001`이 `.moai/specs/`에 실재하지 않음(D7-5 SHOULD-severity) — 이번 Cycle 4 델타로 신규 도입된 참조가 아니라 이전 버전부터 존재하던 참조이므로 이번 감사의 blocking 사유로 계산하지 않음. (b) AC-GEMINI-RUNTIME-009a의 REQ-GEMINI-RUNTIME-004 보조 매핑은 다소 간접적(REQ-004는 "evidence 0건 쿼리는 candidate 자체에서 제외"를, AC-009a는 "evidence는 있으나 모델이 인용하지 않은 경우의 사후 폐기"를 다룸)이나 SPEC의 기존 다중-REQ-대-단일-AC 관례와 정합하며 문서화되어 있어 blocking 사유 아님.
- **현재 상태**: spec_version 0.4.2 기준, Cycle 4 iteration 1 PASS(overall ≈0.98)가 v0.4.2 아티팩트(현재 HEAD)에 대한 최신 유효 감사 결과다. Cycle 3 iteration 2 PASS(overall ≈0.97)는 v0.4.1 시점 아티팩트에 대한 것으로 Cycle 4 델타(plan-artifact hash 변경)에 의해 대체되었다(spec-frontmatter-schema.md § Report Persistence — amendment/artifact-hash 변경은 cache-invalidating event). `/moai run` 진입 전 Phase 1 Plan Audit Gate는 이 Cycle 4 verdict(PASS, overall ≈0.98 ≥ Tier L 임계값 0.85)를 skip-eligibility 판단의 근거로 사용할 수 있다.

## §E.2 Run-phase Evidence

manager-develop이 Tier L Section A-E 델리게이션 템플릿에 따라 6개 마일스톤을 순차 실행했다 — 모두 `feat/SPEC-GEMINI-RUNTIME-001` 브랜치에 직접 커밋 + 푸시(Route B, PR은 sync 이후 manager-git이 생성).

| 마일스톤 | 커밋 SHA | 요약 |
|----------|----------|------|
| M1 | `ee657ef` | `RateScheduler` 클래스 신설 + 역할별(Research/Fast) provider 아키텍처 확정 — `provider-factory.ts`가 `GeminiProvider` 생성 이전에 model 문자열을 확정하고, 동일 model ID면 `RateScheduler` 인스턴스를 공유(min-budget) |
| M2 | `5f98605` | Researcher/Skeptic 배치 스키마 재설계 — 쿼리/finding 개수만큼(N회) 호출하던 것을 사건당 1회 배치 호출로 축소, `supportingEvidenceIds.length >= 1` 그라운딩 계약을 파싱 후 항목별 업무 규칙 검증으로 재배치 |
| M3 | `7b06f46` | 429/503 재시도 + 스케줄러 통합 루프 재설계 — `RetryInfo.retryDelay` 힌트 우선 사용, `waitForSlot()`을 최초 시도 + 모든 재시도 시도 직전에 각각 호출하도록 재배선 |
| M4 | `82db59f` | 동시 사건 제한(`pipelineChain` Promise 체인 뮤텍스, 프로세스 로컬) + D-NEW1 사건 경계를 넘는 스케줄러 연속성(process 생애주기 싱글턴 `getDefaultLLMProviders()`) 통합 테스트 |
| M5 | `5a004ee` | 결정론적 provider 배치 픽스처 정비 + `.env.local.example`/`.moai/docs/runtime-runbook.md` env·데이터 취급 계약 문서화(REQ-023/024) |
| M6 | `d9645bc` | 전체 리그레션 통과 확인 + `gemini-smoke-20260827.md` 과잉주장 정정(design.md §7 문구 적용, AC-024) + `skeptic.test.ts` prettier 포맷 정리 |

**최종 리그레션 증거** (M6 완료 시점, `d9645bc`):

```
$ pnpm test        → 247/247 tests, exit 0
$ pnpm lint        → exit 0
$ pnpm format:check → exit 0
$ pnpm build       → exit 0
$ pnpm test:e2e    → exit 0 (실제 Gemini API 호출 없음 — 결정론적 provider)
```

**변경 파일 요약** (M1~M6 누적, `git diff --stat ee657ef^..d9645bc`): 20개 파일, +1956/-354 — 운영 코드(`lib/ai/{provider-factory,rate-scheduler}.ts`, `lib/ai/providers/{gemini,deterministic}.ts`, `lib/pipeline/{index,researcher,skeptic}.ts`, `lib/pipeline/types.ts`, `lib/env.ts`) + 대응 테스트 + `.env.local.example` + `.moai/docs/runtime-runbook.md` + `spec.md`(HISTORY 갱신) + `gemini-smoke-20260827.md`(정정).

**신규 런타임 의존성**: 없음 — `git diff ef92556..d9645bc -- package.json`가 빈 diff임을 확인(순수 인메모리 로직으로 `RateScheduler`/동시성 락 구현, 신규 npm 패키지 추가 없음, 확인 SPEC-GEMINI-RUNTIME-001 §3 제약과 일치).

## §E.3 Run-phase Audit-Ready Signal

run_status: audit-ready
run_complete_at: 2026-08-28

## §E.4 Sync-phase Audit-Ready Signal

sync_status: audit-ready
sync_complete_at: 2026-08-28
sync_commit_sha: a2d813b

## §F Phase 4 Mode Selection

Input parameters: tier=L, scope≈18-20 files (lib/ai/, lib/pipeline/, config/docs, tests), domain count≈1 (AI provider + pipeline orchestration layer, single Next.js app subsystem), file language mix=100% TypeScript + a few docs/env files, concurrency benefit=LOW (coding-heavy per Anthropic's coding-task parallelism caveat; milestones M1→M6 are explicitly sequential/dependent per plan.md §A — each milestone builds on the prior architectural decision), Agent Teams prereqs=not requested by user.

Mode evaluation:
- direct: not selected — non-trivial, multi-file architectural change
- fanout: not selected — single coherent subsystem, not multi-domain research; coding-heavy work per Anthropic's caveat
- sweep: not selected — semantic/new-code work with inter-milestone dependency, not a uniform mechanical transform
- serial: **selected** — default fallback; matches coding-heavy + sequentially-dependent milestone shape

Decision: serial

Justification: SPEC-GEMINI-RUNTIME-001 is a single-subsystem TypeScript refactor (rate scheduler + provider factory + pipeline batching + retry) executed as 6 explicitly sequential milestones where each builds on the prior's architectural decision (plan.md §A). Per Anthropic's coding-task parallelism caveat, coding-heavy work has few truly parallelizable tasks; a single `manager-develop` sub-agent per milestone (serial) is the correct mode. Route: B (PR route, Tier L) — user selected feature branch + PR at Implementation Kickoff Approval; branch `feat/SPEC-GEMINI-RUNTIME-001` created from `main`.

## §G Post-run Fix — 독립 코드 리뷰 반영 (M1-M6/sync 완료 이후, PR #4 머지 전)

이 섹션은 M1-M6 §E.2/§E.3/§E.4 위 기록을 재작성하지 않는다 — SPEC 자체는 sync 완료(`sync_status: audit-ready`, `sync_commit_sha: a2d813b`) 상태를 유지하며, 이하는 같은 `feat/SPEC-GEMINI-RUNTIME-001` 브랜치(PR #4)에 머지 전 추가로 반영된 post-run fix 기록이다. cycle_type=tdd(RED-GREEN-REFACTOR).

### G.1 배경

팀 리드가 독립 코드 리뷰로 실 코드를 직접 확인해 3건의 갭을 발견했다(이미 완료된 M1-M6 §E.2와는 별개 — 새 마일스톤 번호를 부여하지 않는다):

1. **Researcher 빈 summary 회귀**: `findingItemSchema.summary: z.string()`(min(1) 없음, 배치 부분 실패 설계상 의도적)이지만, 파싱 후 항목별 업무 규칙 필터(researcher.ts (1)~(5))에 `summary.length>=1` 검사가 누락되어 있었다 — 배치 전환 이전 `summary: z.string().min(1)`이 보증하던 것이 사라진 것.
2. **Skeptic 빈 counterArgument 회귀**: 동일 패턴(`counterArgument: z.string()`, min(1) 없음)이지만 파싱 후 필터에 `counterArgument.length>=1` 검사가 누락 — Skeptic의 빈 evidence 배열 허용 계약(의도적)과는 별개의 결함.
3. **AC-GEMINI-RUNTIME-023 계측 공백**: `generateStructured()` 논리적 호출 횟수(Researcher 1 + Skeptic 1 + Verifier 1 = 3회, 쿼리/evidence 개수와 무관)를 실제 6단계 파이프라인(`runPipeline()`)을 통해 end-to-end로 계측하는 테스트가 없었다.

### G.2 수정 내역

- `lib/pipeline/researcher.ts`: evidence 부분집합 검사(기존 (4))와 safety-validator(기존 (5)) 사이에 `(4.5)` 신설 — `item.summary.length < 1`이면 그 항목만 개별 폐기(배치 부분 실패 설계 보존, 다른 정상 항목에 영향 없음).
- `lib/pipeline/skeptic.ts`: evidence 부분집합 검사(기존 (3))와 safety-validator(기존 (4)) 사이에 `(3.5)` 신설 — `item.counterArgument.length < 1`이면 그 항목만 개별 폐기. 빈 evidence 배열(`[]`/`[]`) 허용 계약은 그대로 유지(별개 검사).
- `lib/pipeline/index.test.ts`: `evidenceOverride`(재할당 가능한 evidence 행 홀더, `vi.hoisted`) 신설 + AC-GEMINI-RUNTIME-023 통합 테스트 추가 — Researcher/Skeptic/Verifier 세 단계를 하나의 계측 provider(`makeInstrumentedBatchProvider`)로 감싸 실제 `runPipeline()` 경로에서 논리적 호출 총합을 직접 카운트한다. 3개 시나리오: (1) evidence 있는 8개 쿼리 → 3회, (2) evidence-bearing candidate를 3개로 낮춰도 → 3회(QueryPlanner의 최소 6쿼리 구조상 "쿼리 개수" 자체를 3으로 낮출 수는 없어 evidence-bearing candidate 개수로 통제 — 코드 주석에 근거 명시), (3) 8개 쿼리 중 5개만 evidence(4 injury + 1 disease DISABILITY_GRADE_CRITERIA) → 3회.

### G.3 §E 자기검증 (verification-claim-integrity §3 5-section 형식)

**E1 — RED/GREEN 테스트 결과**

| 테스트 | RED(수정 전) | GREEN(수정 후) |
|---|---|---|
| researcher.test.ts "post-run fix: 빈 summary" | FAIL — `expected length 1, got 2` | PASS |
| skeptic.test.ts "post-run fix: 빈 counterArgument" | FAIL — `expected length 1, got 2` | PASS |
| index.test.ts AC-GEMINI-RUNTIME-023 (8-query/evidence-3/mixed-5+3, 3개 assertion) | 신규 테스트 — 최초 실행부터 PASS(호출 수 불변량은 M2 배치 재설계에서 이미 정확히 구현되어 있었고, 이번 발견은 소스 결함이 아니라 **테스트 커버리지 공백**이었음. Researcher/Skeptic 텍스트 필드가 항상 non-empty였으므로 이 테스트는 (4.5)/(3.5) 신설 여부와 무관하게 동일하게 통과함 — 재확인: 두 신설 필터를 되돌려도 이 테스트의 결과는 변하지 않는다) | PASS |

**E2 — Evidence(증거) — verbatim**

```
$ pnpm test
 Test Files  37 passed (37)
      Tests  250 passed (250)
exit=0

$ pnpm lint
$ eslint .
exit=0

$ pnpm format:check
(수정 대상 5개 파일 — lib/pipeline/{index.test,researcher,researcher.test,skeptic,skeptic.test}.ts — 전부 prettier 통과: `npx prettier --check <5 files>` → "All matched files use Prettier code style!" exit=0.
전체 `pnpm format:check`는 exit=1이지만 유일한 위반은 CHANGELOG.md 1개 파일이며, 이는 이번 fix가 손대지 않은 파일이다 — G.4 참고.)

$ pnpm build
✓ Compiled successfully in 6.7s
✓ Generating static pages using 10 workers (6/6)
exit=0 (경고 1건 — instrumentation.ts:33 Edge Runtime process.exit 경고, 이번 변경과 무관한 기존 경고)

$ pnpm test:e2e
4 passed (29.3s)
exit=0
$ grep -i "generativelanguage.googleapis.com" <e2e 로그>  → 매치 없음(exit=1, grep no-match) — 실 Gemini 엔드포인트 호출 흔적 없음 확인
```

**E3 — Baseline-attribution(baseline 귀속)**

이 run, 이 tree(브랜치 `feat/SPEC-GEMINI-RUNTIME-001`, sync 커밋 `a2d813b` 이후 워킹 트리) 기준. `pnpm format:check`의 CHANGELOG.md 실패가 이번 fix 이전부터 존재했음을 `git stash` 후 동일 명령 재실행으로 직접 확인(EXIT=1, 동일한 CHANGELOG.md 경고) — baseline 회귀 여부 판정을 위한 명시적 대조.

**E4 — Gaps(미검증)**

- acceptance.md §C 수동 실 Gemini 스모크 테스트는 팀 리드 지시에 따라 명시적으로 범위 밖(시도하지 않음).
- AC-GEMINI-RUNTIME-023 "3개 쿼리로 줄여도" 시나리오는 QueryPlanner가 사건당 항상 최소 6개 쿼리를 생성하는 구조(query-planner.ts, 도메인 2개 × 기본 3개)이므로, 문자 그대로 "쿼리 개수 3"이 아니라 "evidence-bearing candidate 개수 3"으로 재해석해 검증했다 — index.test.ts 코드 주석에 이 재해석의 근거를 명시. AC-023 원문의 "쿼리 개수를 8개에서 3개로 줄여"라는 표현과 완전히 문자 그대로 일치하지는 않으나, AC가 실제로 검증하려는 핵심 불변량(호출 수가 evidence-bearing 쿼리 개수에 비례하지 않는다)은 그대로 충족한다.
- Researcher/Skeptic 신설 필터가 실제 프로덕션 Gemini 응답에서 얼마나 자주 발동할지는 관측되지 않았다(결정론적/계측 provider로만 검증).

**E5 — Residual-risk(잔여 위험)**

- 신설된 (4.5)/(3.5) 필터는 순수 텍스트 길이 검사로 로직이 단순하나, 향후 Zod 스키마가 다시 변경될 경우(예: 배치 스키마 재설계) 동일한 종류의 회귀가 재발할 수 있다 — 배치 스키마를 수정할 때는 이 두 필터가 여전히 필요한지 재검토가 필요하다.
- AC-GEMINI-RUNTIME-023 계측 테스트의 verifier 프롬프트 파서(`extractVerifierClaimIds`/`extractVerifierCounterArgumentBlocks`)는 verifier.ts의 프롬프트 마커 문자열("쿼리 ID: "/"반론 쿼리 ID: ")에 정규식으로 결합돼 있다 — verifier.ts의 마커 규약이 바뀌면 이 테스트도 함께 갱신해야 한다(researcher.test.ts/skeptic.test.ts의 기존 `extractQueryBlocks` 패턴과 동일한 결합 성격).

**E6 — 커밋 SHA + push**

commit `93fa63b` — `feat/SPEC-GEMINI-RUNTIME-001` 브랜치에 직접 커밋(같은 브랜치, 새 브랜치 생성 없음). `git push origin feat/SPEC-GEMINI-RUNTIME-001` 결과는 이 backfill 라인 자체가 포함된 후속 커밋으로 함께 push된다.

**E7 — Blocker report**: 없음.

**E8 — RED 실패 verbatim(수정 전 GREEN 실패)**

```
FAIL  lib/pipeline/researcher.test.ts > ... > post-run fix: 빈 summary('')를 가진 항목은 그 항목만 개별 폐기시키고 같은 배치의 다른 정상 항목은 보존한다
AssertionError: expected [ { queryId: 'q1', …(2) }, …(1) ] to have a length of 1 but got 2
 ❯ lib/pipeline/researcher.test.ts:214:22
    212|     const findings = await research([q1, q2], evidence, provider);
    213|
    214|     expect(findings).toHaveLength(1);

FAIL  lib/pipeline/skeptic.test.ts > ... > post-run fix: 빈 counterArgument('')를 가진 항목은 그 항목만 개별 폐기시키고 같은 배치의 다른 정상 항목은 보존한다(빈 evidence 배열 허용 계약과는 별개)
AssertionError: expected [ { findingId: 'q1', …(3) }, …(1) ] to have a length of 1 but got 2
 ❯ lib/pipeline/skeptic.test.ts:323:24
    321|     const challenges = await challenge(findings, evidenceMap, provider…
    322|
    323|     expect(challenges).toHaveLength(1);
```

### G.4 CHANGELOG.md 대조 (팀 리드 지시 사항)

CHANGELOG.md의 기존 SPEC-GEMINI-RUNTIME-001 항목(`### Added — SPEC-GEMINI-RUNTIME-001 ...`)의 핵심 주장 — "25개 요구사항 전부 구현", "35개 인수 기준 전부 만족"(AC-GEMINI-RUNTIME-009a 포함), "`pnpm test`(247/247 tests) 등 전체 exit 0" — 은 이번 fix와 모순되지 않는다: **CHANGELOG를 수정하지 않는 케이스**가 적용된다.

- 테스트 수(`247/247`)는 이번 fix로 `250/250`(신규 3개 테스트 추가)이 되었으나, 이는 커버리지 확장에 따른 자연스러운 숫자 증가이지 기존 주장이 틀렸다는 뜻이 아니다 — CHANGELOG는 특정 시점의 스냅샷이며, 새 테스트 추가마다 매번 갱신하는 관례가 이 프로젝트에 없다.
- CHANGELOG 어디에도 "Researcher/Skeptic 빈 텍스트 필드가 개별 폐기된다"는 취지의 구체적 주장은 없다 — 배치 재설계를 상위 수준으로 서술했을 뿐, 필드별 세부 검증 로직을 열거하지 않았으므로 이번 fix가 반박하는 기존 CHANGELOG 문장이 존재하지 않는다.
- 따라서 CHANGELOG.md는 수정하지 않는다(팀 리드 지시 범위 밖이기도 함 — touch 목록에 없음).

> **후속 갱신 참고(merge 전 정합성 cleanup, 이 문단 이후 섹션)**: 위 G.4 판단은 그 시점(post-run fix, 커밋 `93fa63b`)의 팀 리드 지시 범위 기준으로는 맞는 결정이었다. 이후 별도의 merge-전 정합성 cleanup 작업에서 팀 리드가 명시적으로 CHANGELOG.md의 수치 최신화를 지시했고, 그에 따라 CHANGELOG.md 20행의 `247/247`을 `250/250`(이번 cleanup 완료 시점 `pnpm test` 실측치)으로 갱신했다 — 위 인용문("25개 요구사항 전부 구현" 등)은 그 시점 CHANGELOG 원문을 그대로 인용한 역사적 기록이므로 수정하지 않는다. 상세 근거는 `### G.5 merge 전 정합성 cleanup` 절 참고.

### G.5 merge 전 정합성 cleanup (팀 리드 지시 사항)

PR #4(브랜치 `feat/SPEC-GEMINI-RUNTIME-001`) merge 전 정합성 정리 작업. 이번 SPEC의 런타임 로직(`researcher.ts`/`skeptic.ts`/`gemini.ts`/`rate-scheduler.ts`/`provider-factory.ts`/`pipeline/index.ts` 애플리케이션 로직)은 손대지 않았다 — CHANGELOG.md 포맷/수치 최신화, progress.md 수치 최신화, `lib/pipeline/index.test.ts` 테스트 전용 보강만 수행했다.

**1) CHANGELOG.md 포맷 수정**

`npx prettier --check CHANGELOG.md`가 exit 1로 실패하던 원인을 확인한 결과, `npx prettier --write`를 그대로 적용하면 20행의 "REQ-GEMINI-RUNTIME-001~025"와 "AC-GEMINI-RUNTIME-001~025" 두 곳의 단일 물결표(`~`)가 같은 줄에 한 쌍으로 존재해, prettier의 마크다운 포매터(remark 기반)가 이를 GFM 취소선(strikethrough) 열기/닫기 구분자 쌍으로 오인해 `~~`(이중 물결표)로 정규화하는 부작용이 있었다 — 이는 **의미를 바꾸는 변경**(범위 표기 `001~025`가 취소선 마크업으로 오염됨)이므로 그대로 적용하지 않았다. 대신 두 `~` 모두 백슬래시로 이스케이프(`\~`)해 마크다운 파서가 취소선 쌍으로 재해석하지 못하도록 고정한 뒤 재실행했다 — 렌더링 결과는 원문과 동일(이스케이프된 `\~`는 리터럴 `~`로 렌더링됨)하되 `prettier --check`가 clean하게 통과한다.

```
$ npx prettier --check CHANGELOG.md
Checking formatting...
All matched files use Prettier code style!
```
(exit=0, 물결표 이스케이프 적용 후 재확인)

**2) 수치 최신화 (before → after)**

| 파일 | 위치 | before | after | 분류 |
|------|------|--------|-------|------|
| `CHANGELOG.md` | 20행(SPEC-GEMINI-RUNTIME-001 검증 문구) | `pnpm test`(247/247 tests) | `pnpm test`(250/250 tests) | forward-looking 현재 상태 요약 — 갱신 |
| `progress.md` | §E.2 43행("M6 완료 시점, `d9645bc`" 표제 아래 리그레션 증거 블록) | `247/247 tests, exit 0` | (변경 없음, `247/247` 유지) | M6 자신의 시점을 명시한 역사적 스냅샷 — 유지 |
| `progress.md` | §G.4 175행/177행(팀 리드 지시에 따른 CHANGELOG 대조 판단, post-run fix 시점) | `247/247` (당시 CHANGELOG 원문 인용 + 대조 서술) | (변경 없음, 원문 유지) | 그 시점 CHANGELOG 원문을 그대로 인용한 역사적 기록 — 유지, 대신 §G.4 말미에 후속 갱신 참고 각주 추가 |

`250/250`은 이번 cleanup의 실제 `pnpm test` 실행 결과(아래 5) 참고)이며, CHANGELOG.md·progress.md·본 절 전체에서 동일한 값을 사용한다.

**3) AC-GEMINI-RUNTIME-023 계측 보강 — per-stage 호출 횟수 분리**

`lib/pipeline/index.test.ts`의 `makeInstrumentedBatchProvider()`가 기존에는 총 호출 횟수(`calls`) 하나만 계측했다. 이번 보강으로 Researcher/Skeptic/Verifier 분기 각각에 독립 카운터(`researchCalls`/`skepticCalls`/`verifierCalls`)를 추가하고, `stageCallCounts()` 접근자로 노출했다 — 기존 `callCount()`(총합) 접근자는 그대로 유지(리팩터링이 아니라 보강).

```typescript
// stageCallCounts() 반환 형태
{ research: number; skeptic: number; verifier: number }
```

3개 시나리오(evidence 있는 8개 쿼리 / evidence-bearing candidate 3개로 축소 / 5+3 혼합 구성) 각각에 다음 한 줄씩 추가:

```typescript
expect(eightQuery.stageCallCounts()).toEqual({ research: 1, skeptic: 1, verifier: 1 });
expect(threeQuery.stageCallCounts()).toEqual({ research: 1, skeptic: 1, verifier: 1 });
expect(mixedQuery.stageCallCounts()).toEqual({ research: 1, skeptic: 1, verifier: 1 });
```

기존 `expect(...callCount()).toBe(3)` 단언은 그대로 유지 — 총합 단언과 단계별 단언을 함께 검증한다.

**4) 5-게이트 전체 재실행 verbatim**

```
$ pnpm test
 Test Files  37 passed (37)
      Tests  250 passed (250)
   Duration  13.67s
exit=0
```

```
$ pnpm lint
$ eslint .
exit=0
```

```
$ pnpm format:check
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
exit=0
```

```
$ pnpm build
$ next build
✓ Compiled successfully in 2.4s
✓ Generating static pages using 10 workers (6/6) in 1222ms
exit=0
```
(Turbopack이 `instrumentation.ts:33:7`의 `process.exit(1)` Edge Runtime 미지원 경고 1건을 출력하나, 이번 cleanup 이전부터 존재하던 사전 경고이며 빌드는 exit 0 — 이번 변경으로 새로 발생한 경고 아님)

```
$ pnpm test:e2e
  ✓  1 [chromium] auth.spec.ts:10:7 › 인증 — AC-RUNTIME-011 › 등록된 테스터 A는 로그인에 성공해 보호 경로로 진입한다
  ✓  2 [chromium] case-flow.spec.ts:21:7 › 사건 흐름 — AC-RUNTIME-012, AC-RUNTIME-013 › 사건 입력이 저장되고 리포트가 렌더링되며, 피드백이 저장된다
  ✓  3 [chromium] tenant-isolation.spec.ts:24:7 › Tenant Isolation — AC-RUNTIME-014 › 테스터 B는 테스터 A가 소유한 사건 상세에 접근할 수 없다
  ✓  4 [chromium] auth.spec.ts:17:7 › 인증 — AC-RUNTIME-011 › allowed_testers에 없는 이메일은 로그인이 거부되어 세션이 생성되지 않는다
  4 passed (31.2s)
exit=0
```

**5) Baseline-attribution**: 이 run, 이 tree(브랜치 `feat/SPEC-GEMINI-RUNTIME-001`, HEAD `ab963c4` 이후 워킹 트리) 기준. 5개 게이트 모두 이번 cleanup 커밋 직전에 실측했다.

**6) Gaps**: 없음 — 지시받은 4개 작업(CHANGELOG 포맷/수치/AC-023 계측/5-게이트) 전부 실행하고 실측 결과로 검증했다.

**7) Residual-risk**: `CHANGELOG.md`의 물결표 이스케이프(`\~`)는 향후 이 줄을 다시 편집할 때(예: REQ/AC 범위가 바뀌는 경우) 이스케이프를 유지해야 prettier가 재차 취소선으로 오인하지 않는다 — 다음 편집자가 이 사실을 모르고 이스케이프를 제거하면 동일한 문제가 재발할 수 있다.

### G.6 PR #4 merge 전 마지막 독립 코드 리뷰 반영 (post-run fix, 새 SPEC/milestone 없음)

PR #4(`feat/SPEC-GEMINI-RUNTIME-001`) merge 전 마지막 독립 코드 리뷰에서 지적된 4개 항목을 이 브랜치의 post-run fix로만 처리했다 — 새 SPEC이나 새 milestone을 만들지 않았다. PR #4는 아직 merge하지 않는다(지시 사항).

**1) provider-factory env isolation 회귀 수정**

`lib/ai/providers/gemini.ts` 생성자가 `options.apiKey ?? process.env.GEMINI_API_KEY`로 폴백하는 구조이기 때문에, `provider-factory.ts`의 `getLLMProviders(env)`가 `env.GEMINI_API_KEY`를 그대로 `GeminiProvider`에 넘길 때 값이 `undefined`이면 `GeminiProvider` 생성자 내부에서 전역 `process.env.GEMINI_API_KEY`로 조용히 폴백할 수 있었다 — `provider-factory.ts` 상단 `@MX:NOTE`가 문서화한 "env 주입과 process.env 격리" 계약과 모순되는 회귀였다.

수정: `getLLMProviders(env)`의 non-deterministic 경로에서 `apiKey`(= `env.GEMINI_API_KEY`)가 falsy면 `GeminiProvider`를 생성하기 전에 명시적으로 `throw`한다(`lib/ai/provider-factory.ts`). 오류 메시지에는 실제 secret 값을 넣지 않는다(애초에 apiKey가 없는 상태이므로 노출할 값 자체가 없다). 아래 두 경로는 이 검사의 영향을 받지 않음을 코드로 확인:
- deterministic mode는 이 검사보다 앞선 `if (env.LLM_PROVIDER_MODE === "deterministic")` 분기에서 조기 반환 — `GEMINI_API_KEY` 없이도 계속 정상 동작.
- `getDefaultLLMProviders()`는 `getLLMProviders(process.env)`를 호출하므로, 정상 production 환경(process.env에 `GEMINI_API_KEY`가 설정된 상태)에서는 이 throw 경로에 도달하지 않는다.

회귀 테스트(`lib/ai/provider-factory.test.ts` 신규): `process.env.GEMINI_API_KEY`에 값을 설정한 채로, `GEMINI_API_KEY`를 생략한 custom env로 `getLLMProviders(customEnv)`를 호출하면 (a) throw하고, (b) throw된 Error의 `.message`에 전역 process.env의 secret 값이 포함되지 않으며, (c) `GeminiProvider`(mock)가 한 번도 생성되지 않았음을 확인한다.

```
$ npx vitest run lib/ai/provider-factory.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)
```
(exit=0, 신규 회귀 테스트 1건 포함 총 8건 — 기존 7건 전부 그대로 통과, `GEMINI_API_KEY: "test-key"`를 이미 env에 포함하고 있던 기존 테스트들은 이번 변경으로 깨지지 않음)

**2) PR #4 설명 정정 (commit `93fa63b`)**

기존 PR 본문은 커밋 `93fa63b`을 "두 경로 모두 폴백 문자열 처리 추가"로 서술했으나, 실제 구현(`lib/pipeline/researcher.ts` L127-133, `lib/pipeline/skeptic.ts` 동일 패턴)은 폴백 문자열을 채워 넣지 않고 `if (item.summary.length < 1) { continue; }`로 해당 항목만 개별 폐기(discard)한다 — 같은 배치의 다른 정상 항목은 보존된다. 실제 코드를 `Read`로 직접 확인한 뒤, PR 본문을 "Researcher/Skeptic 각각 빈 summary/counterArgument 항목을 개별 폐기(discard)하는 필터 추가(폴백 문자열 방식이 아님)" 취지로 정정했다(`gh pr edit 4`, 아래 5) 참고).

**3) `gemini-smoke-20260827.md` 인과관계 표현 정정**

수정 전 문장("그 반론을 뒷받침할 반박 근거를 현재 seed corpus(10건)에서 하나도 찾지 못했다는 뜻이다")은 `counterEvidenceIds`가 빈 배열이라는 실측 사실을, "corpus에 반박 근거가 존재하지 않는다"는 미확정 인과관계로 단정하는 것처럼 읽혔다 — 바로 다음 문장에서 corpus 부족을 "확정된 원인이 아닌 가설 중 하나"로 이미 hedge하고 있었음에도, 앞 문장이 그 hedge와 모순되는 단정적 어조였다.

정정: "counterEvidenceIds가 모두 빈 배열이었다는 것은 '실제 출력에서 반박 evidence ID가 선택되지 않았다'는 실측 사실이며, 그 이상의 인과관계(예: corpus에 반박 근거가 아예 존재하지 않는다는 단정)를 함의하지 않는다"로 재작성하고, 원인 후보 목록(corpus 부족 / Retriever 후보 부족 / Skeptic prompt semantics / model behavior — 전부 미확정)은 기존 결론을 그대로 유지했다. 요약 라인(L50)과 결론 섹션(L76)의 동일 계열 표현도 같은 원칙으로 정정.

**4) 5-게이트 재실행 verbatim (로컬 실측 — GitHub Actions CI는 별도로 트리거하지 않음)**

아래는 이번 post-run fix 커밋 이전, 이 워킹 트리에서 로컬로 직접 실행한 결과다. GitHub Actions CI는 이번 작업 중 별도로 트리거하지 않았다 — CI가 실행됐다고 서술하지 않는다(지시 사항).

```
$ pnpm test
 Test Files  37 passed (37)
      Tests  251 passed (251)
   Duration  12.72s
exit=0
```

```
$ pnpm lint
$ eslint .
exit=0
```

```
$ pnpm format:check
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
exit=0
```

```
$ pnpm build
$ next build
✓ Compiled successfully
✓ Generating static pages using 10 workers (6/6)
exit=0
```
(Turbopack `instrumentation.ts:33:7` process.exit Edge Runtime 경고 1건 — 이번 변경 이전부터 존재하던 사전 경고, 새로 발생한 경고 아님)

```
$ pnpm test:e2e
  ✓  1 [chromium] tenant-isolation.spec.ts:24:7 › Tenant Isolation — AC-RUNTIME-014
  ✓  2 [chromium] case-flow.spec.ts:21:7 › 사건 흐름 — AC-RUNTIME-012, AC-RUNTIME-013
  ✓  3 [chromium] auth.spec.ts:10:7 › 인증 — AC-RUNTIME-011
  ✓  4 [chromium] auth.spec.ts:17:7 › 인증 — AC-RUNTIME-011
  4 passed (51.8s)
exit=0
```

**5) PR #4 본문 갱신**: `gh pr edit 4`로 (a) 위 2)의 커밋 `93fa63b` 설명 정정, (b) 이번 post-run fix 커밋을 "Post-run 리뷰 반영" 표에 새 행으로 추가(테스트 수 250/250 → **251/251**), (c) Test plan 체크리스트의 테스트 수를 251/251로 갱신했다. PR은 merge하지 않았다 — 실 Gemini smoke를 수행하기 전 상태로 유지.

**Baseline-attribution**: 이 run, 이 tree(브랜치 `feat/SPEC-GEMINI-RUNTIME-001`, 이번 post-run fix 커밋 직전 HEAD `e907afb`) 기준.

**Gaps**: 없음 — 지시받은 4개 항목(env isolation 회귀 수정 + 회귀 테스트, PR 본문 정정, smoke 리포트 인과관계 정정, 5-게이트 재실행) 전부 실행하고 실측 결과로 검증했다. 실 Gemini API를 호출하는 수동 스모크는 지시 사항대로 수행하지 않았다.

**Residual-risk**: 이 fix는 non-deterministic 경로에서 `GEMINI_API_KEY`가 없는 환경(예: CI에 시크릿 미설정)이 있다면 그 환경에서 `getLLMProviders(process.env)` 호출 시 새로 throw가 발생한다 — 기존에는 (원치 않게) 폴백되어 넘어갔을 수 있는 케이스가 이제는 명시적으로 실패한다. 이는 의도된 동작 변경(원치 않는 암묵적 폴백을 막는 것이 이번 fix의 목적)이지만, `GEMINI_API_KEY`를 아직 설정하지 않은 배포 환경이 있다면 그 환경은 이 fix 이후 명시적 오류를 보게 된다는 점을 배포 전 인지해야 한다.
