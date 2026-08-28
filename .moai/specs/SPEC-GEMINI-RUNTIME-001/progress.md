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
