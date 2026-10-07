# Progress — SPEC-B2C-LAUNCH-001

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: audit-ready`
- `plan_complete_at: 2026-10-07T02:00:32Z` — audit-ready를 기록한 시각이다. 감사 PASS와 PASS-with-debt 수용은 각각 2026-10-04에 있었고(§G 3/3 행, 아래 "PASS-with-debt 수용 선택 기록") 이 기록은 그 판정을 바꾸지 않는다. 아래 날짜가 붙은 기록 중 `plan_status`를 `draft`로 적은 줄은 그 날짜 시점의 기록이며 이력으로 보존한다.
- **Implementation Kickoff Approval 기록 (2026-10-07)**: 출처는 사용자가 이 run 세션에 붙여 넣은 재개 메시지(전 세션의 `AskUserQuestion` 답 4건을 요약한 것)이며, 이 세션은 그 질문과 응답을 직접 보지 않았다. 결정 주체는 사용자다. (1) SPEC-B2C-LAUNCH-001 승인. 승인과 `plan_status: audit-ready`·`plan_complete_at` 기록은 `progress.md` §E.1에만 하고, `plan.md`의 Kickoff 체크박스(`plan.md:63`)는 Phase 1 결과를 읽은 뒤로 미룬다. (2) 진행 모드는 자율. (3) 커밋 경로 N9는 `--pr`(Route B, M1~M6을 한 run PR로)이고, `deploy.yml` 변경(M4)은 L-01 운영 기준선 관측 기록이 있은 뒤에만 병합한다. (4) U4는 현재 문구대로 확인했다 — 첫 로컬 진단 시험도 R-02·R-03과 L-06·L-07·L-09를 필수로 요구하며, `spec.md`·`plan.md`·`acceptance.md`는 바꾸지 않아 Phase 1 건너뛰기를 가능하게 둔다. 이 기록은 `plan.md` 체크를 하지 않았다(`plan.md:63`은 `[ ]` 그대로).
- **Phase 1 Plan Audit Gate 건너뛰기 (2026-10-07T02:00Z)**: `spec-workflow.md` Plan Audit Gate skip policy의 3조건이 모두 성립해 재감사를 하지 않는다. 조건 1: 최종 회차 판정 PASS(`review-3`, iteration 3/3). 조건 2: 점수 0.81 ≥ Tier M 기준 0.80. 조건 3: `git rev-parse --short=7`로 현재 HEAD(`2c244e0`)와 감사 대상 `ba4602e0520bd19e8d6c1c61e6b9002995d4c930`의 blob을 각각 읽어 `spec.md` `6fba2af`, `plan.md` `99cda75`, `acceptance.md` `e67a8d2`로 일치했고, `git merge-base --is-ancestor ba4602e HEAD`는 종료 코드 0이다. spec 디렉터리에 Tier M 밖의 계획 산출물(`design.md`, `research.md`, `tasks.md`)은 없다. 한계: `moai` CLI·MCP를 쓸 수 없어 `ComputeHash`와 감사 캐시는 실행하지 못했고(감사 캐시는 `review-3` 당시에도 저장되지 않았다) blob 일치로 대신 확인했다. 이 건너뛰기는 PASS-with-debt를 해소로 바꾸지 않는다 — 아래 debt 표는 그대로 열려 있다.
- **Phase 1 관문 재실행 (2026-10-07, 위 건너뛰기를 대체)**: 위 건너뛰기는 더는 성립하지 않는다. M1a 커밋 `de48d01`이 `spec.md` frontmatter 두 줄(`status`·`updated`)을 바꿔 blob이 `6fba2af` → `3f32b5b`가 됐고(`plan.md` `99cda75`, `acceptance.md` `e67a8d2`는 그대로) 규칙의 셋째 조건(지문 불변)이 깨졌다. 이 사실을 사용자에게 알린 뒤 "지금 Phase 1 재감사 실행"을 선택받았다(선택 라벨 기준, 답 원문 아님). 1차 재실행(HEAD `c89d060`, 보고서 `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-2026-10-07.md`): **FAIL 0.78**(Clarity 0.65, Completeness 0.90, Testability 0.75, Traceability 0.85), 필수 항목 실패 없음, 차단 결함 D1(REQ-008이 서명의 필수 항목 전체 덮기를 요구하지 않음)과 D2(REQ-004 참조 줄에 이 SPEC 항목과의 연결이 없음). 사용자가 "D1·D2만 문서에 반영한 뒤 범위 한정 재검사"를 선택했고(선택 라벨 기준), manager-spec 역할의 일반 에이전트가 커밋 `b55f35d`로 `spec.md` 2줄·`acceptance.md` 4줄·`plan.md` 1줄을 고쳤다(REQ·AC 16/16 유지, 오케스트레이터가 diff와 개수를 직접 재확인). 2차 재검사(HEAD `b55f35d`, 보고서 `...-2026-10-07-recheck.md`): **PASS 0.80**(비반올림 0.8036; Clarity 0.70, Completeness 0.88, Testability 0.80, Traceability 0.86), 필수 항목 전부 PASS 또는 N/A, 차단 결함 없음. **한계**: 합격선 위 여유가 0.0036으로 채점 오차 안쪽이다(Clarity 0.65 또는 Testability 0.75면 FAIL). Claude 단독 감사(교차 모델·감사 캐시·`moai spec lint` 사용 불가). 감사가 새로 낸 선택 결함 N1~N6(§2.4에 전체 덮기 규칙 미전파, 참조 줄 용어, AC-004·AC-008 잔여 틈, REQ-004 복합 서술, HISTORY 행·버전 미갱신)과 미해소 D3~D13은 열려 있다. M1 점검기 코드는 이 수정보다 먼저 만들어져 REQ-008 전체 덮기와 AC-004 연결 필드를 집행하는지 감사받지 않았다 → M1e에서 확인하고 필요하면 보강한다. 이 PASS는 Implementation Kickoff Approval을 대신하지 않는다(Kickoff는 위 기록대로 이미 통과).
- **오케스트레이터 메모 (사용자 답이 아니다)**: 재개 메시지의 "U5는 묻지 않음(M1 fixture가 의존하지 않음)"은 `review-3`(`:131`)로 확인하면 맞지 않는다. U5는 `local` + 단계 거부 규칙이고 `acceptance.md` AC-002의 fixture (러)(거)가 그 규칙을 시험한다. U5는 묻지 않은 채이며, 사용자가 `spec.md`·`acceptance.md`를 바꾸지 않기로 했으므로 M1은 현재 문구대로 구현한다. U5를 나중에 다르게 정하면 AC-002 fixture와 M1 점검기 규칙을 다시 작업해야 한다. U3(로컬 I 서명자 구성)도 미확정이라 AC-008 (마)(바)(사)의 서명자 부분은 M1에서 `BLOCKED`로 남기고 서명자 구성을 지어내지 않는다. U1·U2는 M1을 막지 않고, U2는 M2 진입 전에 필요하다.
- 이 문서는 plan-phase 초안이다. `audit-ready` 판정과 완료 시각은 plan-auditor 감사 통과 이후 오케스트레이터가 기록한다.
- 2026-10-04 plan-auditor 2회차(iteration 2/3, 대상 `3c56b47`) 결과: **FAIL 0.75**(기준 0.80), STOP 신호. `plan_status`는 `draft`이고 `audit-ready` 선언은 없다. 3회차는 STOP 신호 때문에 무조건 진행하지 않으며 사용자가 범위 축소·PASS-with-debt·명시적 예외 중 정한 뒤에만 시작한다. 상세는 아래 §G와 `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-2.md`.
- 2026-10-04 5차 수정안(`b6ee43a` 기준, review-2의 차단 결함 D-01~D-04 대응): **STOP 상태를 유지한다 — 3회차 감사와 run을 시작하지 않았고 이 수정안은 재감사를 받지 않았다.** 사용자 확인이 필요한 항목은 아래 "5차 수정안 기록"의 "미확정 사용자 결정"에 있다. `plan_status`는 `draft`다.
- 2026-10-04 6차 교정(`a0e0ee2` 기준, 잔여 모순 2건): **공식 감사 결과 FAIL 0.75·STOP은 그대로이고 이 교정은 감사를 받지 않았으며 PASS가 아니다 — 3회차 감사와 run을 시작하지 않았다.** 상세는 아래 "6차 교정 기록"이다. `plan_status`는 `draft`다.
- 작성된 산출물(Tier M): `spec.md`, `plan.md`, `acceptance.md`, `progress.md`(이 파일). 모두 `.moai/specs/SPEC-B2C-LAUNCH-001/` 안의 파일이며 `main@99993bf` 위의 초안이다.
- 요구사항 16건(Tier M 상한 16), AC 16건(상한 16). 상한에 맞추려고 합친 후보와 뺀 후보는 아래 "Plan-phase Observations" 4번에 적었다.
- 응용 코드·설정·워크플로·환경 파일·기존 SPEC 디렉터리·감사 보고서는 변경하지 않았고, 운영 VM·운영 DB·운영 플래그에는 접근하지 않았다.
- **plan-audit 범위 고지 (3차 정밀 교정 2026-10-03, 4차 정렬 교정 2026-10-04 정정)**: `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-1.md`의 PASS 판정(0.88, Tier M 기준 0.80, iteration 1/3 — 상세는 아래 §G)은 **D-LAUNCH-01~09 사용자 결정이 반영되기 전 상태를 감사한 것**이다. 근거: 보고서를 커밋한 `643dec1`(2026-10-03 10:28)은 결정 반영 커밋 `c89dae7`(2026-10-03 12:04)의 선조이고(`git merge-base --is-ancestor 643dec1 c89dae7` 성공), 보고서 자신도 D-LAUNCH-01~09를 미결정으로 적었다(Testability 평가의 "undecided D-LAUNCH-NN options", Recommendation의 "9 D-LAUNCH-01..09 decisions"를 사용자에게 확인받아야 한다는 문장). 정확히 어느 SHA(또는 커밋 전 작업 트리)를 감사했는지는 보고서에 적혀 있지 않아 **미확인**이며 추정하지 않는다. 결정 반영 커밋 `c89dae7`, 2차 정밀 교정(D-LAUNCH-07 사유 2종 추가 등), 3차 정밀 교정(§2.4 단계 표·캐이브아웃 통합, L-01·L-05·R-04 적용 시점 명시, L-08 표면별 G 차단), 4차 정렬 교정(실행 환경 입력, 아래 "4차 정렬 교정 기록")은 모두 그 감사 이후에 추가된 새 내용이며 **아직 재감사되지 않았다.** `plan_status`는 여전히 `draft`이고, 기존 0.88 PASS를 현재 HEAD의 PASS로 선언하지 않는다. 이 SPEC은 plan-auditor를 1회차만 거쳤으므로(`spec-workflow.md`의 3회 상한 안) Implementation Kickoff Approval 전에 **2회차 재감사가 가능하다** — ENGINE-001·CONSULTOPS-001처럼 이미 3회를 소진한 SPEC과는 처리 경로가 다르다(상세: `.moai/reports/b2c-launch-readiness/RESUME.md` §4). 2회차를 호출하지 않고 run-phase로 진입하면 `/moai run` Phase 1 Plan Audit Gate가 artifact-hash 변경(이 교정으로 spec.md·plan.md·acceptance.md가 바뀜)을 감지해 자동으로 재실행된다 — 이는 plan-phase 재감사와는 별도의, run-phase 진입 시점의 독립된 게이트다.

## §E.2 Run-phase Evidence

### 기준선 (M1 착수 전, 2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `cb27b35`(기준 `main@2c244e0` 위에 §E.1 기록 커밋 1개). 새 격리 폴더이고 `.worktreeinclude`가 복사한 `.env.local`은 측정 전에 삭제했다(내용은 열지 않았다).
- **원문 로그**: `.moai/state/verify/launch-run/`(git이 무시하는 경로). 각 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 아래 종료 코드는 백그라운드 알림이 아니라 로그의 `exit=` 줄에서 읽었다.

| 명령 | 로그 | 관측 결과 |
|---|---|---|
| `pnpm install --frozen-lockfile` | `0-install.log` | `exit=0` (22.2초) |
| `pnpm lint` | `1-lint.log` | `exit=0`, 출력은 `$ eslint .` 한 줄뿐(경고·오류 없음) |
| `pnpm test` | `2-test.log` | Test Files 103 passed (103), Tests 939 passed (939), `exit=0` (147.22초) |
| `pnpm build` | `3-build.log` | `exit=0`, 라우트 `/`, `/_not-found`, `/api/consultations`, `/consult`, `/result` |
| `pnpm verify:flag-runtime` | `4-flag-runtime.log` | `불일치 관측 합계: 0`, `exit=0` (시작 조합 8개 관측) |

- **측정 뒤 작업 트리**: `git status --short`가 §F를 편집한 `progress.md` 한 파일만 보였다(측정이 추적 파일을 바꾸지 않았다).
- **미측정(Gap)**: `pnpm test:e2e`와 `pnpm visual:verify`는 이 기준선에 넣지 않았다. M1은 `lib/`·`scripts/`·문서만 건드리므로 화면 기준선에 닿지 않으며, 푸터 컴포넌트를 바꾸는 M2 착수 전에 측정한다. 이 측정은 한 번의 실행이며 `test`가 한 번 통과했다는 사실이 불안정 시험이 없다는 증명은 아니다.

### M1a (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `49646f7` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)에 `M1a-*.log`로 있다. 이 커밋의 SHA는 이 기록이 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **변경 파일**: `lib/launch/stage-table.ts`(신규), `lib/launch/stage-table.test.ts`(신규), `.moai/docs/launch-gate-runbook.md`(신규 골격), `.moai/specs/SPEC-B2C-LAUNCH-001/spec.md`(frontmatter `status: draft` → `in-progress`, `updated: 2026-10-04` → `2026-10-07` 두 줄만. `git diff -U0`로 확인), 이 파일(§E.2 하위 절 추가).
- **런북 표 출처**: 단계 표 5줄(`spec.md` 135~139행), 항목 정의표 16줄(165~180행), 항목 읽는 법 1줄(147행)을 줄 번호로 잘라 스크립트로 붙였다. 손으로 다시 적지 않았고, 시험이 두 표를 줄 단위로 `spec.md`와 대조한다.

**RED**(구현 파일이 없는 상태에서 시험 파일만 있을 때, `M1a-red.log`):

```
$ pnpm exec vitest run lib/launch/stage-table.test.ts
 FAIL  lib/launch/stage-table.test.ts [ lib/launch/stage-table.test.ts ]
Error: Cannot find module './stage-table' imported from .../lib/launch/stage-table.test.ts
 Test Files  1 failed (1)
      Tests  no tests
exit=1
```

RED의 한계: 시험 파일이 모듈을 불러오지 못해 스위트가 통째로 실패한 것이며, 개별 단언이 구현의 동작 때문에 실패한 출력이 아니다. 런북도 이때 없었다.

**GREEN**: 첫 실행은 `Tests 1 failed | 23 passed (24)`였다(그 출력은 같은 경로의 로그를 다음 실행이 덮어써 로그에는 남아 있지 않고 실행 당시 화면에서 읽었다). 실패 원인은 구현이 아니라 시험의 단언 하나 — 런북의 시작 조건을 `(1)`~`(5)` 문자열로 찾도록 썼으나 런북은 번호 목록(`1.`~`5.`)이다. 시험을 "번호 목록 다섯 항목이고 여섯째는 없다"로 고쳐 다시 실행했다(구현은 이 사이에 바뀌지 않았다). 이후 prettier로 두 TS 파일 서식만 맞추고 아래 결과를 다시 얻었다.

**E1 AC-B2CLAUNCH-001 판정표** (명령: `pnpm exec vitest run lib/launch/stage-table.test.ts --reporter=verbose`, 로그 `M1a-green-verbose.log`, 결과 `Test Files 1 passed (1)` / `Tests 24 passed (24)` / `exit=0`):

| 항목 | 판정 | 근거 시험(관측된 ✓) |
|---|---|---|
| (1) 세 단계 한 행씩, 정의·벡터·도달 대상·판정 칸이 비어 있지 않음 | PASS | `런북의 단계 표가 파서를 통과한다(AC-B2CLAUNCH-001 (1)(2))`, 음성: 빈 칸·단계 누락·초과 행·중복·칸 수 오류 fixture |
| (2) 벡터 칸이 정규식과 일치 | PASS | 같은 시험 + `벡터 칸이 정규식과 맞지 않으면…`, `…닫힘/열림 밖이거나 참조 토큰 뒤에 서술이 붙으면 거부한다`, `벡터 정규식은 acceptance.md AC-B2CLAUNCH-001 (2)에 적힌 정규식과 같다` |
| (3) 문서가 "배포 완료는 어느 공개 단계의 판정도 충족하지 않는다"를 적음 | PASS | `(3) 배포 완료가 어느 공개 단계의 판정도 충족하지 않는다고 적는다` |
| (4) 단계=운영 호스트 상태, 로컬 시험=별도 판정, 시작 조건 다섯 가지·I 서명 규칙·운영 한정 항목 규칙, 점검 요청의 두 형태와 거부 조합 | PASS | `(4) 단계는 운영 호스트의 상태이고…`, `(4) 로컬 시험 판정 절이…`, `(4) 점검 요청의 두 형태 절이…` |
| (5) `spec.md` §2.4 단계 표가 같은 파서를 통과 | PASS | `spec.md §2.4 단계 표가 같은 파서를 통과한다(AC-B2CLAUNCH-001 (5))`, `런북 단계 표의 내용은 spec.md §2.4 표와 한 글자도 다르지 않다` |

이 밖에 같은 파일의 시험이 항목 정의표 14행(L-01~L-09, R-01~R-05)이 `spec.md`와 줄 단위로 같음, AC-B2CLAUNCH-003이 요구하는 Definition of Done 문장이 런북에 있음, 런북에 주소(`http(s)://`)·이메일 형태 문자열이 없음을 확인한다.

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`, 출력 없음(오류 0건). 로그 `M1a-tsc.log`.
**E3 린트**: `pnpm exec eslint lib/launch` → `exit=0`(`M1a-eslint.log`). 저장소 전체 `pnpm lint` → `exit=0`, 출력은 `$ eslint .` 한 줄(`M1a-lint.log`). `pnpm exec prettier --check`는 새 TS 파일 두 개가 처음엔 서식 경고를 냈고 `--write` 뒤 정리했다(기존 파일은 같은 검사를 통과한다).
**E4 전체 시험**: `pnpm test` → `Test Files 104 passed (104)`, `Tests 963 passed (963)`, `exit=0`(`M1a-test-full.log`). 기준선 939 + 새 시험 24 = 963이다.
**E5 커버리지**: `pnpm exec vitest run lib/launch --coverage "--coverage.include=lib/launch/stage-table.ts"`는 `All files | 0 | 0 | 0 | 0`, `Statements: Unknown% (0/0)`를 냈다(`M1a-cov.log`). include 경로가 설정과 맞지 않아 측정이 되지 않은 것이고 실제 커버리지 수치가 아니다 — **Gap**.

**SPEC 문서에서 발견한 것**(고치지 않았다, 적힌 대로 진행):

1. `acceptance.md` AC-B2CLAUNCH-003은 "이 문서의 Definition of Done 문장"이라 쓰는데, 같은 문장이 이미 `acceptance.md` 144행(§Quality Gate · Definition of Done)에 있다. 지시에 따라 런북에도 같은 문장을 넣었다. "이 문서"가 가리키는 문서가 `acceptance.md`인지 런북인지 문서상으로 하나로 정해져 있지 않다.
2. AC-B2CLAUNCH-005와 `spec.md` §2.4 "대상"은 코드 종류 항목의 덮는 파일 목록을 런북이 항목마다 적는다고 하지만 `spec.md` 항목 표는 L-04 칸에만 파일 집합을 적는다. 지시대로 표를 그대로 옮겼고 나머지 항목의 목록은 만들지 않았다. 런북 골격에는 "표의 칸에 이미 적힌 파일 집합 외에 덮는 파일 목록을 정하지 않는다"고 적었다. AC-005 쪽 검사(목록에 기록 파일이 들어 있으면 거부)가 읽을 목록은 M1b 이후에 정해야 한다.
3. `acceptance.md` AC-B2CLAUNCH-001 (2)의 정규식은 `spec.md` 단계 표의 세 벡터를 모두 통과시키지만, 벡터 칸 중 "내부 시험 공개"의 Q2 집합과 "일반 사용자 공개"의 Q1 집합은 참조 토큰만 허용해 표면 집합의 실제 내용은 이 AC가 보지 못한다(AC 본문이 이미 "이 AC가 보지 못하는 것"으로 적은 한계와 같다).

**Gaps(관측하지 못한 것)**: 커버리지 수치(위 E5). `pnpm build`·`pnpm test:e2e`·`pnpm visual:verify`는 M1a가 `lib/launch/`·문서만 건드려 실행하지 않았다(`pnpm build`는 새 `lib/launch` 모듈을 앱이 아직 가져오지 않아 영향이 없다고 판단했을 뿐 이 변경 뒤에 다시 측정하지 않았다). M1b·M1c의 항목(기록 모델·점검기·서명·형제 참조·법무 확인·표지값 검사)은 구현하지 않았다. 단계 표의 칸 내용이 사실인지, U3(로컬 I 서명자 구성)·U5(`local` + 단계 거부 규칙)는 문서에 적힌 그대로 두었고 이 변경이 해소하지 않는다.

**잔여 위험**: 파서는 헤더 줄이 정확히 `단계|정의|게이트 상태 벡터|도달 대상|판정` 다섯 열인 첫 표만 읽는다. 문서에 같은 헤더의 표가 둘 이상이면 첫 표만 검사한다(현재 `spec.md`·런북 모두 하나뿐이고 시험이 대조한다). 칸 안에 `|` 문자가 들어가는 표는 이 파서가 칸을 잘못 나눈다 — 현재 두 표에는 없다. 런북 시험은 파일을 불러올 때 문서가 없으면 스위트 전체가 실패하도록 되어 있다.

### M1b (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `9aac310` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M1b-*.log`다. 이 커밋의 SHA는 이 기록이 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **변경 파일**: 신규 `lib/launch/{markdown-table,item-table,gate-record,target-check}.ts`와 각 시험 3개(`item-table`·`gate-record`·`target-check`), 신규 `scripts/check-launch-gate.ts`와 `scripts/check-launch-gate.test.ts`, `lib/launch/stage-table.ts`(`splitCells`에 `export`만 붙임, 동작·시험 불변), `.moai/docs/launch-gate-runbook.md`(`## 기록 양식` 절만 추가, 기존 절 불변), 이 파일. `spec.md`·`plan.md`·`acceptance.md`는 바꾸지 않았고 plan.md 체크박스도 건드리지 않았다.
- **구현한 것**: 항목 정의표 파서(칸 7개·빈 칸 없음·I/G 열거·` / ` 구분자 정확히 1개), 기록 모델·마크다운 파서(상태는 `READY`/`BLOCKED`/`UNVERIFIED`만, 빈 값·열거 밖 값·식별자만 있는 행·출력 전용 표지 `해당 없음(local)`을 항목 식별자를 적은 오류로 거부), 항목 점검기(요청 두 형태와 거부 네 조합, `결정 대기` fail-closed와 항목·열 단위 면제, 표면 열 규칙, 운영 한정 항목의 `해당 없음(local)` 출력 표지), 대상 값·무효화 사건 판정(`READY`를 `UNVERIFIED`로 되돌리기만 한다)과 덮는 파일 목록 검사. 서명 점검은 구현하지 않았다(AC-B2CLAUNCH-008은 M1c).

**RED**(모듈을 함수는 있되 틀린 기본값을 돌려주는 틀로 두고 시험 4개 파일을 실행, `M1b-red.log`): `Test Files 4 failed (4)`, `Tests 88 failed | 18 passed (106)`, `exit=1`. 실패 88건은 모두 단언 실패이고(`Cannot find module` 0건) 파일별로 gate-record 19, item-table 17, target-check 11, check-launch-gate 41이다. 대표 단언: `expected +0 to be 1`(운영 불가 fixture가 틀 때문에 종료 코드 0), `expected +0 to be 2`(요청 형태 오류가 거부되지 않음), `expected 'READY' to be 'UNVERIFIED'`(대상 값 불일치가 READY로 남음), `expected [] to have a length of 1 but got +0`(기록 파일을 덮는 목록이 거부되지 않음), `런북에 '## 기록 양식' 절이 없다`. 틀과 우연히 일치해 RED에서 통과한 18건은 틀의 기본값(빈 목록·READY 그대로)과 같은 결과를 기대한 시험이다.

**GREEN**: 구현 뒤 첫 실행에서 새 시험 전부가 통과했다(`M1b-green-1.log`, 130 passed = M1a 24 + 새 106). 이후 `runCli`의 인자·JSON 입력 읽기 분기를 프로세스 안에서 시험하는 6건을 더했다. 마지막 실행은 `M1b-green-final.log`: `Test Files 5 passed (5)`, `Tests 136 passed (136)`, `exit=0`. 시험이 실제로 물리는지 보려고 `PRODUCTION_ONLY_ITEMS`에서 `R-04`를 잠깐 빼 보았고(`M1b-mutation-check.log`) (차)·로컬 CLI 시험 등 4건이 실패하는 것을 확인한 뒤 되돌렸다.

**E1 판정표**(명령: `pnpm exec vitest run lib/launch scripts/check-launch-gate.test.ts --reporter=verbose`, 로그 `M1b-green-final.log`):

| AC | fixture | 기대 | 관측 |
|---|---|---|---|
| AC-B2CLAUNCH-002 | 열아홉 가지 (가)~(머) 꼬리표대로(운영 10·로컬 4·형태 오류 5) | 종료 코드 0은 (가)(바)(사)(차) 넷, 0이 아닌 것 열다섯, 출력이 AC가 적은 식별자·문구를 담음 | PASS — `fixture는 정확히 열아홉 가지…`, `(가)`~`(머)` 각 시험, `종료 코드 0은 (가)(바)(사)(차) 넷이고 0이 아닌 것은 열다섯이다` |
| AC-B2CLAUNCH-002 | (차) 기록 불변, 비필수 항목 BLOCKED, 런북 표 입력 | 상태 칸 불변, (가)와 같은 결과, 런북 표도 같은 결과 | PASS — 얼린 입력으로 점검해 `UNVERIFIED` 값이 그대로임을 확인 |
| AC-B2CLAUNCH-002 | spec.md·런북 항목 표 | 14행·7칸·열거 안·구분자 1개·I/G 분포 8/2/1/1/1/1 | PASS — `실제 문서의 항목 정의표` 4건 |
| AC-B2CLAUNCH-003 | (가)~(바) | (가)(마) 통과, (나)(다)(라)(바) 식별자를 적은 오류 | PASS — `AC-B2CLAUNCH-003 fixture (가)~(바)` 6건, Definition of Done 문장은 M1a 시험이 계속 확인 |
| AC-B2CLAUNCH-005 | (가)~(마) | (가)(라) READY 유지, (나)(다) UNVERIFIED, (마) 항목 식별자와 함께 거부 | PASS — `resolveEffectiveStatus`·`(라) 기록 파일만 바뀐 변경`·`coveringFileListErrors` 시험, 런북·spec 표 모두 기록 파일 0개 |

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`, 출력 없음(`M1b-tsc-2.log`). **E3 린트**: `pnpm exec eslint lib/launch scripts/check-launch-gate.ts scripts/check-launch-gate.test.ts` → `exit=0`(`M1b-eslint-2.log`), 저장소 전체 `pnpm lint` → `exit=0`(`M1b-lint-2.log`), `prettier --check` 통과(`M1b-prettier-2.log`). **E4 전체 시험**: `pnpm test` → `Test Files 108 passed (108)`, `Tests 1075 passed (1075)`, `exit=0`(`M1b-test-full-2.log`) — M1a 이후 963 + 새 112.
**E5 커버리지**: 설정의 `coverage.exclude`가 `.claude/**`를 담고 이 작업 폴더가 `.claude/worktrees/` 아래라서 설정대로 실행하면 `All files 0/0`이 나온다(`M1b-cov.log`, 측정이 아니다). 명령줄에서 `--coverage.include`·`--coverage.exclude`를 덮어쓰고 `json-summary`로 뽑은 실제 수치는 `lib/launch` 5개 파일 모두 구문·분기·함수·줄 100%(합계 구문 201/201, 분기 107/107; 텍스트 요약은 `M1b-cov2.log`, 파일별 수치는 `M1b-cov3.log` 실행의 `json-summary`를 임시 폴더에서 읽은 것이라 로그에는 종료 코드만 있다), `scripts/check-launch-gate.ts`는 구문 123/131, 분기 98/105, 함수 25/26(`M1b-cov-script2.log` 실행의 `json-summary`; 미덮개는 프로세스 안에서 도는 시험이 닿지 못하는 `isMain` 진입부와 예외 재던짐이다).

**SPEC 문서에서 발견한 것**(고치지 않았다, 적힌 대로 진행):

1. AC-B2CLAUNCH-005 (다)는 "사건 기록에 관측 뒤의 EV-L2가 있음"이라 쓰지만 사건 기록이 어디에 있는지(기록 문서의 칸인지 별도 입력인지)는 SPEC이 정하지 않는다. AC-002·§2.4 READY 항은 점검기가 사건을 스스로 감지하지 못한다고 적었으므로 호출하는 절차가 넘기는 입력(`eventsAfterObservation`)으로 모델링했다. 기록 문서의 `무효화 사건` 칸은 그 항목에 적힌 사건 종류(EV-L1~EV-L5)로 읽는다.
2. §2.4 "항목 기록 필드"는 상태 외 칸이 비어도 되는지 말하지 않는다. AC-003 (라)(식별자만 있는 행 거부)를 만족하는 가장 작은 규칙으로, 상태는 항상 검사하고 보관 위치·역할·날짜·대상·무효화 사건은 `READY` 항목에만 필수로 했다(§2.4 READY 정의에서 가져옴).
3. `결정 대기` 칸의 면제 결정 기록(D-LAUNCH-05 등)의 형식·보관 위치는 SPEC에 없다. 점검기 입력으로 `{itemId, column}` 목록만 받는다. 면제는 그 항목의 그 열의 `결정 대기` 칸에만 적용한다(§2.4 "그 칸만 `해당 없음`이 된다").
4. 목적 벡터가 비어 있는 요청과 S1·S2·S3 밖의 표면 값은 §2.4의 거부 조합에 없다. 빈 벡터는 규칙대로 적용(표면을 적은 항목은 모두 비적용)하고, 열거 밖 표면 값은 입력 오류로 거부했다.
5. 종료 코드 0 외의 값은 SPEC에 없다. 불가 판정은 1, 입력 거부(요청 형태·표·기록·사용법 오류)는 2로 했다.
6. 점검기는 서명을 보지 않고도 `내부 시험 공개 가능`·`로컬 시험 가능` 판정 문구를 낸다. AC-002가 서명 점검은 통과한 것으로 두라고 했기 때문이며, M1c가 서명 점검을 붙일 때 이 판정 문구를 서명 결과와 함께 내도록 합쳐야 한다.
7. M1a가 적은 한계 그대로, 항목별 덮는 파일 목록은 표 칸에 적힌 것(L-04 여섯 개, L-05 하나)만 읽는다. 다른 항목의 목록은 만들지 않았다.
8. 승인된 대로 U3(로컬 I 서명자 구성)·U5(`local` + 단계 거부)는 SPEC 문구대로 구현했고 U5는 fixture (거)(러)가 적힌 대로 거부한다. 문구가 틀렸다고 판단하지 않았다.

**Gaps(관측하지 못한 것)**: `pnpm build`·`pnpm test:e2e`·`pnpm visual:verify`는 M1b가 `lib/launch/`·`scripts/`·문서만 건드려 실행하지 않았다(새 `lib/launch` 모듈을 앱이 아직 가져오지 않으므로 빌드에 영향이 없다고 판단했을 뿐 이 변경 뒤에 측정하지 않았다). 서명 점검(AC-008)·형제 증거 참조(AC-004)·법무 확인(AC-006)·표지값 검사는 M1c 이후다. 실제 기록 파일에 대한 점검(기록 파일 위치 미정)은 하지 않았다. 대상 값을 계산하는 수단은 만들지 않았다(`(라)` 시험의 계산은 시험용 예시다).

**잔여 위험**: 파서는 헤더 줄이 정확히 같은 첫 표만 읽고 칸 안의 `|` 문자는 칸을 잘못 나눈다(현재 두 표에는 없다). 항목 표의 `표면` 칸을 `·`로만 나누므로 다른 구분자를 쓰면 입력 오류로 거부된다. 점검기가 읽는 사건·대상 값이 사실인지는 호출하는 절차가 책임진다. CLI 시험은 `node tsx/cli` 자식 프로세스 5건이며 각 한 번씩만 실행했다.

### M1c (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `bd06157` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M1c-*.log`다. 이 커밋의 SHA는 이 기록이 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **변경 파일**: 신규 `lib/launch/{sibling-reference,legal-confirmation}.ts`와 각 시험, `lib/launch/markdown-table.ts`(덧붙은 칸을 허용하는 헤더 찾기 `findTableWithExtras` 추가만, 기존 함수 불변), `scripts/check-launch-gate.ts`(선택 입력 추가만)와 그 시험(새 `describe` 두 개 추가, 기존 시험 불변), `.moai/docs/launch-gate-runbook.md`(끝에 `## 형제 증거 참조 양식`·`## 법무 확인 기록 양식` 절 추가, 기존 절 불변), 이 파일. `spec.md`·`plan.md`·`acceptance.md`와 다른 SPEC 디렉터리는 바꾸지 않았고 plan.md 체크박스도 건드리지 않았다.
- **구현한 것**: (1) 형제 증거 참조 줄 — 표 파서(헤더 뒤 허용되지 않은 칸을 칸마다 거부, 빈 칸·칸 수 오류·열거 밖 상태 거부), 형제 정의표 조회(`siblingItemIds`가 입력으로 받은 문서와 헤더 칸으로 식별자 집합을 읽는다), 평가(없는 식별자·정의표 없음은 거부, 상태·대상 값이 형제 기록과 다르거나 형제 기록이 입력되지 않았으면 그 줄이 속한 항목을 EV-L3로 UNVERIFIED), 점검기 연결(거부는 종료 코드 2, UNVERIFIED는 기존 종료 코드 1 경로)과 CLI 인자 `--sibling-refs`·`--sibling-defs`·`--sibling-records`. (2) 법무 확인 기록 — 다섯 칸 표 파서(밖의 칸·빈 칸·결과 열거 밖 거부)와 판정 함수. (3) 런북 양식 두 절(양식과 (가)~(라)·(가)~(바) 결과만, 값·연락처·주소·보관 위치 없음). 서명·표지값 검사(M1d)는 구현하지 않았다.

**RED**(모듈을 함수는 있되 틀린 기본값을 돌려주는 틀로 두고 시험 3개 파일을 실행, `M1c-red.log`): `Test Files 3 failed (3)`, `Tests 48 failed | 63 passed (111)`, `exit=1`. `Cannot find module` 0건이며 실패는 모두 단언 실패 또는 틀이 통과시킨 입력에 대한 도우미의 "오류가 있어야 하는 … 통과했다" 오류다. 대표 단언: `expected +0 to be 2`(없는 형제 항목·자체 판정 칸이 거부되지 않음), `expected 'READY' to be 'UNVERIFIED'`(버전 불일치), `expected 'READY' to be 'BLOCKED'`(결과 불일치), `expected 2 to be 1`(형제 값 어긋남이 불가 판정이 되지 않음), 런북 절 없음. 실패 파일별로 sibling-reference 20, legal-confirmation 16, check-launch-gate 12이다(`grep -E "^ FAIL "` 집계).

**GREEN**: 첫 실행(`M1c-green-1.log`)은 `Tests 7 failed | 189 passed (196)`였고 실패 7건은 구현이 아니라 내가 쓴 시험 fixture의 실수였다 — 자체 판정 칸을 덧붙이는 표 조립이 칸 사이 `|`를 잃어 헤더가 합쳐졌고(5건), 칸 수 기대값이 하나 틀렸고(2건 중 1건씩 sibling·legal), 도우미의 기본 매개변수가 `undefined`를 삼켰다(1건). 시험만 고치고 구현은 바꾸지 않은 채 다시 실행해 `M1c-green-2.log`: `Test Files 7 passed (7)`, `Tests 196 passed (196)`, `exit=0`(M1b 마지막 136 + 새 60). 시험이 실제로 물리는지 보려고 (다) 거부 조건과 법무 `불일치` 판정을 잠깐 바꿔 보았고(`M1c-mutation-check.log`) 7건이 실패하는 것을 확인한 뒤 되돌렸다(복사본과 `diff` 일치 확인).

**E1 판정표**(명령: `pnpm exec vitest run lib/launch scripts/check-launch-gate.test.ts --reporter=verbose`, 로그 `M1c-green-2.log`):

| AC | fixture | 기대 | 관측 |
|---|---|---|---|
| AC-B2CLAUNCH-004 | (가) 존재하는 형제 항목(CONSULTOPS-001 `E-03`, 실제 정의표 파일로 조회)을 가리키고 형제 기록 stub과 같은 값 | 통과 | PASS — `(가) 존재하는 형제 항목을 …`(평가), 점검기 `(가) … 점검을 막지 않는다`(종료 코드 0, `R-04: READY`), CLI 통과 판정 |
| AC-B2CLAUNCH-004 | (나) 존재하지 않는 식별자 `E-99` | 거부, 식별자를 적음 | PASS — 평가 거부와 점검기 종료 코드 2, 출력에 `존재하지 않는 형제 항목 식별자`·`E-99` |
| AC-B2CLAUNCH-004 | (다) 자체 판정 칸이 있는 참조 줄 | 거부 "참조 줄은 형제 상태만 옮길 수 있다" | PASS — 파서와 점검기 종료 코드 2, 같은 문구와 칸 이름 `"판정"` |
| AC-B2CLAUNCH-004 | (라) 옮겨 적은 대상 값이 형제 기록과 다름 | 그 줄의 항목 UNVERIFIED | PASS — `R-04: UNVERIFIED`와 `EV-L3`, 종료 코드 1, 출력에 값은 없음 |
| AC-B2CLAUNCH-004 | 식별자 조회 | 항목 목록 복제 없이 조회 | PASS — 같은 줄이 입력한 정의표에서 `E-03` 행을 빼면 거부됨, 실제 CONSULTOPS-001 정의표에서 식별자 `E-03` 조회·`F-xx`(다른 표) 비혼입 |
| AC-B2CLAUNCH-006 | (가) 다섯 칸이 모두 있고 결과 `일치 확인`, 버전이 현재와 같음 | READY | PASS |
| AC-B2CLAUNCH-006 | (나) 결과 `적법` | 거부 | PASS — 식별자·`"결과"` 칸·열거를 적음 |
| AC-B2CLAUNCH-006 | (다) 자유 서술 칸 `의견`·`결론` | 거부 | PASS — 칸마다 거부(2건) |
| AC-B2CLAUNCH-006 | (라) 역할 칸 빔 | 거부 | PASS — 식별자와 `"확인한 역할"` |
| AC-B2CLAUNCH-006 | (마) 버전이 현재와 다름 | UNVERIFIED | PASS |
| AC-B2CLAUNCH-006 | (바) 결과 `불일치` | BLOCKED | PASS — `READY`로 인정되는 fixture는 (가) 하나뿐임을 한 시험이 함께 확인 |

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`, 출력 없음(`M1c-tsc.log`). **E3 린트**: `pnpm exec eslint lib/launch scripts/check-launch-gate.ts scripts/check-launch-gate.test.ts` → `exit=0`(`M1c-eslint.log`), 저장소 전체 `pnpm lint` → `exit=0`(`M1c-lint.log`), 바뀐 TS 파일 일곱 개 `prettier --check` 통과(`M1c-prettier.log`). **E4 전체 시험**: 첫 `pnpm test`(`M1c-test-full.log`)는 `Test Files 1 failed | 109 passed (110)`, `Tests 1 failed | 1134 passed (1135)`였다 — 실패한 것은 이 변경과 무관한 `scripts/verify-remote-consult.test.ts`의 `run이 관측을 정직하게 기록하고, cleanup은 원장 행만 정확히 지운다`(`expected 0 to be greater than 0`, 4465ms). 같은 파일만 다시 실행하면 `61 passed`(`M1c-flaky-recheck.log`)였고 전체를 다시 실행하면 `Test Files 110 passed (110)`, `Tests 1135 passed (1135)`, `exit=0`(`M1c-test-full-2.log`)다 — 기준선 1075 + 새 60. 첫 실패의 원인은 조사하지 않았다(불안정 시험일 가능성이 있다는 추정일 뿐 확인하지 않았다).
**E5 커버리지**: 설정대로 실행하면 이 작업 폴더가 `.claude/worktrees/` 아래라서 0/0이 나오므로 명령줄에서 include·exclude·reporter를 덮어썼다(`pnpm exec vitest run lib/launch scripts/check-launch-gate.test.ts --coverage --coverage.include=lib/launch/*.ts --coverage.include=scripts/check-launch-gate.ts "--coverage.exclude=**/*.test.ts" --coverage.reporter=json-summary …`, 로그 `M1c-cov.log`, 파일별 수치 `M1c-cov-summary.log`). `sibling-reference.ts` 구문 67/67·분기 40/40, `legal-confirmation.ts` 38/38·22/22, `markdown-table.ts` 23/23·14/14(`lib/launch` 7개 파일 모두 100%), `scripts/check-launch-gate.ts` 구문 157/165·분기 128/136·함수 35/36(미덮개 8구문은 M1b와 같은 `isMain` 진입부와 예외 재던짐이다).

**SPEC 문서에서 발견한 것**(고치지 않았다, 적힌 대로 진행):

1. REQ-B2CLAUNCH-004는 참조 줄이 담는 것을 형제 SPEC id·항목 id·옮겨 적은 상태와 대상 값·형제 기록 위치 다섯 가지로 적지만, AC (라)는 "그 줄의 항목"을 UNVERIFIED로 판정하라고 한다. 줄이 이 SPEC의 어느 항목(R-nn)의 것인지를 정하는 칸이 SPEC에 없다. 그 연결 없이는 점검기가 어느 항목을 강등할지 알 수 없어 판정 칸이 아닌 포인터 칸 `이 SPEC 항목` 하나를 더했다(여섯 칸). 다섯 칸만으로 정하려면 SPEC이 연결 방식을 정해야 한다.
2. AC (다)는 "형제 상태와 **다른** 자체 판정 상태 칸"이라 쓰지만 REQ가 참조 줄을 다섯 필드로만 한정하므로, 자체 판정 칸은 값이 형제 상태와 같아도 허용된 칸 밖이라 거부했다.
3. 옮겨 적은 상태의 어휘가 SPEC에 없다. 이 SPEC이 이름 붙인 READY·BLOCKED·UNVERIFIED만 받고 다른 이름의 형제 상태는 거부한다(fail-closed).
4. 형제 기록 내용이 입력되지 않았을 때의 결과가 AC에 없다. 비교할 수 없으므로 EV-L3로 UNVERIFIED로 했다. 실제 형제 기록과의 비교는 AC 선결대로 BLOCKED이며(형제 기록의 형식·위치 미정, CONSULTOPS-001 D-OPS-11·ENGINE-001 `design.md` §9.2) 시험의 형제 기록은 입력으로 만든 합성 stub이다.
5. ENGINE-001에는 식별자로 조회할 수 있는 증거 항목 표가 없다. `design.md` §9.3 표의 첫 칸은 `(i) 판정 근거 데이터 확인 기록`처럼 식별자와 설명이 한 칸에 섞여 있고 별도 ID 칸이 없다(R-02·R-03·R-05가 이 SPEC 정의표에서 ENGINE-001을 참조하는데 그쪽 식별자가 아직 없다). 식별자나 표를 지어내지 않았고, 정의표를 입력하지 않은 형제 SPEC의 참조는 `정의표가 입력되지 않았다`로 거부된다. CONSULTOPS-001 §2.4(`| ID | 증거 항목 | I | G | 근거 | 대상 / 무효화 사건 |`)만 실제 파일로 조회 시험했다.
6. 점검기는 참조 줄의 UNVERIFIED 강등을 기록의 `무효화 사건` 칸에 EV-L3가 적혀 있는지와 무관하게 적용한다(기록 칸이 사건을 빠뜨려도 어긋남이 통과하지 않게 하려는 fail-closed 선택이며 SPEC에 없는 규칙이다). 이미 BLOCKED·UNVERIFIED인 항목은 바꾸지 않고, `local`에서 운영 한정 항목(R-04)은 적용 제외라 참조 줄이 어긋나도 `해당 없음(local)`이다.
7. REQ-B2CLAUNCH-006은 `미확인` 결과의 판정을 정하지 않는다. 확인이 이뤄지지 않았으므로 UNVERIFIED로 했다. `불일치`는 버전이 낡았어도 BLOCKED를 우선한다. 날짜 칸의 형식 규칙은 없어 비어 있지 않은지만 본다. 확인 대상의 "식별자와 버전"은 두 칸(`확인 대상 식별자`·`확인 대상 버전`)으로 읽었다.
8. 법무 확인 기록 검사기는 점검기에 연결하지 않았다(AC-B2CLAUNCH-006은 기록 검사기 단독 시험이고 어느 항목에 이 기록이 대응하는지 SPEC이 정하지 않는다). 확인 기록의 저장 위치·서명 역할 목록은 D-LAUNCH-04 몫이라 정하지 않았다.
9. 승인된 대로 U3(로컬 I 서명자 구성)·U5(`local` + 단계 거부)는 이 마일스톤에서 건드리지 않았다.

**Gaps(관측하지 못한 것)**: `pnpm build`·`pnpm test:e2e`·`pnpm visual:verify`는 M1c가 `lib/launch/`·`scripts/`·문서만 건드려 실행하지 않았다(새 모듈을 앱이 가져오지 않으므로 빌드에 영향이 없다고 판단했을 뿐 이 변경 뒤에 측정하지 않았다). 새 CLI 인자 세 개는 프로세스 안 `runCli` 시험으로만 확인했고 자식 프로세스로는 시험하지 않았다. 실제 형제 증거 기록과의 비교, 법무 확인 기록의 점검기 연결, 서명(AC-008)·표지값 검사(AC-007)는 하지 않았다. 형제 SPEC·ENGINE-001의 항목 식별자 체계가 바뀌면 조회가 실패하는지는 이 시험이 보지 못한다(AC가 적은 한계).

**잔여 위험**: 파서는 헤더 줄이 같은 칸으로 시작하는 첫 표만 읽고 칸 안의 `|` 문자는 칸을 잘못 나눈다. 허용된 칸 안에 결론 문구를 적는 것은 감지하지 못한다(AC-B2CLAUNCH-006 한계, 시험이 이 한계를 문서로 고정한다). 형제 기록·현재 버전·현재 대상 값이 사실인지는 호출하는 절차가 책임진다. 전체 시험의 첫 실행에서 무관한 시험 하나가 한 번 실패했다(위 E4) — 불안정 가능성은 열려 있다.

### M1d (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `e180214` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M1d-*.log`다. 이 커밋의 SHA는 이 기록이 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **변경 파일**: 신규 `lib/launch/signature.ts`·`lib/launch/signature.test.ts`, 신규 `scripts/launch-marker-check.ts`·`scripts/launch-marker-check.test.ts`, `scripts/check-launch-gate.ts`(서명 점검 합성·`--signature`·`--allowed-roles`·판정 규칙), `scripts/check-launch-gate.test.ts`(서명 도우미·AC-008 fixture·CLI 서명 인자 시험 추가, 기존 시험은 setup만 서명 기록을 넘기도록 바꿈 — 기대값은 그대로), `.moai/docs/launch-gate-runbook.md`(끝에 `## 서명 기록 양식`·`## 표지값 검사 절차` 절 추가, 기존 절 불변), 이 파일. `spec.md`·`plan.md`·`acceptance.md`와 다른 SPEC 디렉터리는 바꾸지 않았고 plan.md 체크박스도 건드리지 않았다. 표지값 도우미를 `scripts/`에 둔 이유: git을 자식 프로세스로 부르고 임시 파일을 쓰는 시험 전용 도구라 앱 코드(`lib/`)가 가져올 일이 없다.
- **구현한 것**: (1) 서명 기록 양식 — 마크다운 표 둘(서명 행 `서명 역할|날짜|실행 환경`, 서명 시점 항목 `식별자|상태|대상`). 허용 역할 목록은 점검기 입력이고 코드에 박지 않았으며 역할의 목록 소속만 본다. 서명 행은 여러 행을 허용하되 서명자 구성 규칙은 만들지 않았다. (2) 점검기 합성 — 판정 문구는 항목 점검과 서명 점검이 모두 통과할 때만 낸다. 서명이 없으면 통과가 아니고(종료 코드 1, 출력에 `서명 없음`) 우회 인자·옵션은 없다. 종료 코드: 서명 없음·서명 뒤 UNVERIFIED가 된 항목·허용되지 않은 역할·서명의 실행 환경이 요청 형태와 다름은 1, 서명 기록의 칸 오류(실행 환경 칸이 비었거나 열거 밖 등)·표 없음은 요청 형태와 무관하게 2. (3) 표지값 검사 — 여섯 종류(연락처는 두 표기, 담당자 이름·연락처는 별도 문자열이라 문자열 여덟 개)를 실행 시점에 난수로 만들고 저장소에 이미 있으면 세트를 다시 만든다. 입력은 OS 임시 폴더(저장소 밖)에만 쓰고 afterEach에서 지운다. 서명 오류 메시지는 서명 행 번호와 칸 이름만 적고 역할·날짜 칸 값과 열거 밖 실행 환경 값은 되풀이하지 않는다.

**RED**(함수는 있되 틀린 기본값을 돌려주는 틀로 두고 새·바뀐 시험 3개 파일을 실행, `M1d-red.log`): `Test Files 3 failed (3)`, `Tests 51 failed | 79 passed (130)`, `exit=1`. `Cannot find module`·함수 없음 오류는 0건이고 실패는 모두 단언 실패다(대표: `expected +0 to be 1`(서명 없음이 불가가 되지 않음), `expected +0 to be 2`(서명 환경 칸 오류가 거부되지 않음), `expected [] to have a length of 1 but got +0`(허용 외 역할이 거부되지 않음), `expected [] to deeply equal [ Array(1) ]`(심은 비추적 파일의 표지값을 못 찾음), `expected false to be true`). 실패 파일별로 `lib/launch/signature.test.ts` 17, `scripts/check-launch-gate.test.ts` 24, `scripts/launch-marker-check.test.ts` 10이다(`grep -E "^ FAIL "` 집계). 79건 통과는 이미 있던 점검기 시험(서명을 넘기는 setup으로 바꾼 것)과 틀의 기본값과 우연히 같은 결과를 기대한 시험이다.

**GREEN**: 첫 실행(`M1d-green-1.log`)은 `Tests 3 failed | 127 passed (130)`였고 실패 3건은 모두 시험 쪽 문제였다 — 비추적 파일을 심는 도구의 임시 파일 확장자를 `.tmp`로 썼는데 이 저장소의 `.gitignore`(108행 `*.tmp`)가 그것을 무시해 `git grep --untracked`가 찾지 못했다(양성 대조가 성립하지 않는다는 뜻이다). 확장자를 `.txt`로 바꾸고(구현은 바뀌지 않았다) 다시 실행해 `M1d-green-2.log`: `Test Files 3 passed (3)`, `Tests 130 passed (130)`, `exit=0`. 서명 시점 항목 표의 식별자 칸 빔·열 수 오류 시험 1건을 더해(`signature.ts` 미덮개 줄을 줄이려는 것) 최종 `M1d-green-final.log`: `Test Files 9 passed (9)`, `Tests 260 passed (260)`, `exit=0`(lib/launch 전체 + 점검기 시험 + 표지값 시험). 변이 시험(`M1d-mutation-check.log`): ① `judgeSignature`의 서명 없음 기본값을 `[]`로 바꾸면 8건 실패(`(나)`·`(바)`·fail-closed·CLI `--signature` 없음 등), ② 실행 환경 불일치 규칙을 끄면 5건 실패(`(자)`·`(차)`·두 단위 시험·요약 시험). 둘 다 원래대로 되돌렸고 백업 복사본과 `diff`가 일치했다(`diff-exit=0`).

**E1 AC-B2CLAUNCH-008 판정표**(명령: `pnpm exec vitest run lib/launch scripts/check-launch-gate.test.ts scripts/launch-marker-check.test.ts --reporter=verbose …`, 로그 `M1d-green-final.log`; 요청 형태 꼬리표는 AC-002와 같다):

| fixture | 요청 형태 | 기대 | 관측 |
|---|---|---|---|
| (가) 서명 있음, 서명 뒤 모두 READY | [운영] 목적 단계 I(G도 확인) | 통과 | PASS — 종료 코드 0, `서명 점검: 통과`, `내부 시험 공개 가능`(G는 `일반 사용자 공개 가능`) |
| (나) 서명 없음 | [운영] G | 거부 | PASS — 종료 코드 1, `서명 없음`, `일반 사용자 공개 불가` |
| (다) 서명 뒤 R-05가 UNVERIFIED | [운영] I | 거부, 항목 식별자 | PASS — 종료 코드 1, `서명 점검: 서명 뒤 R-05가 UNVERIFIED가 되었다`(R-05는 I 열 필수가 아니라 항목 점검은 통과하는 항목이다) |
| (라) 허용 목록 밖 역할 | [운영] I | 거부 | PASS — 종료 코드 1, `서명 행 1의 역할이 허용 역할 목록에 없다`(역할 값은 출력에 없음) |
| (마) local I 서명(운영 한정 항목은 서명 대상 아님) | [로컬] | 통과 | PASS — 종료 코드 0, `로컬 시험 가능` — **서명자 구성(U3)은 BLOCKED, 시험은 역할 목록 소속만 본다** |
| (바) 서명 없음 | [로컬] | 거부 | PASS — 종료 코드 1, `서명 없음`, `로컬 시험 불가` — 서명자 구성 BLOCKED |
| (사) 서명 뒤 R-02가 UNVERIFIED | [로컬] | 거부, 항목 식별자 | PASS — 종료 코드 1, `서명 뒤 R-02가 UNVERIFIED가 되었다` — 서명자 구성 BLOCKED |
| (아) 서명의 실행 환경 칸이 비었거나 `local`·`production` 밖 | 요청 형태 무관(운영·로컬 둘 다) | 거부 | PASS — 네 조합 모두 종료 코드 2, `서명 기록 오류`·`실행 환경`, 열거 밖 값은 출력에 없음 |
| (자) 운영 점검에 local 서명만 | [운영] I | 거부 | PASS — 종료 코드 1, `서명의 실행 환경(local)이 요청 형태(production)와 다르다` |
| (차) 로컬 판정에 production 서명만 | [로컬] | 거부 | PASS — 종료 코드 1, `서명의 실행 환경(production)이 요청 형태(local)와 다르다` |

통과 둘 (가)(마), 거부 여덟이다(요약 시험이 확인). AC-B2CLAUNCH-002의 열아홉 fixture 기대값(종료 코드·출력)은 그대로 통과한다 — 시험 코드의 도우미 `signatureFor`(기록에서 READY인 항목을 서명 시점 항목으로 삼고 로컬은 운영 한정 항목을 뺀다)가 "서명 점검은 통과한 것으로 둔다"를 충족하며 점검기에는 그런 우회가 없다.

**E1 AC-B2CLAUNCH-007 판정표**(`scripts/launch-marker-check.test.ts`, 같은 로그):

| 단계 | 기대 | 관측 |
|---|---|---|
| 표지값 생성 | 실행 시점 난수, 저장소에 있으면 다시 만듦, 연락처는 `lib/consult/phone.ts` 형식(두 표기), 이름 20자 이하 | PASS — 단위 시험 6건(`normalizePhone`이 두 표기를 같은 번호로 정규화함 포함) |
| (0) 양성 대조 | 심은 비추적 파일의 값을 찾고 지운 뒤에는 못 찾음 | PASS — `(0) 양성 대조…`와 단위 `(양성·음성 대조)` |
| (1) 출력·로그 검색 | 일치 0건 | PASS — 점검기(프로세스 안 두 번·자식 프로세스 stdout/stderr)·기록 파서·법무 확인 기록 출력 파일 폴더에 표지값 없음 |
| (2) `git grep -nF --untracked` | 저장소 전체 일치 0건 | PASS — `gitGrepFiles` 결과가 빈 목록 |
| (3) 위치 | 값을 담은 기록은 저장소 밖(또는 추적되지 않고 무시됨) | PASS — 입력 파일 전부 `isAcceptableMarkerLocation` 인정(OS 임시 폴더), 판정 함수는 추적 파일·무시되지 않는 미추적 파일을 거부하고 무시되는 미추적 파일을 인정함 |
| (4) 두 실행의 값 | 모든 문자열이 서로 다름 | PASS — 여덟 문자열 모두 다름(이 사실이 새로 생성됐다는 증명은 아님) |

표지값을 놓은 자리: 시크릿은 자식 프로세스 점검기의 환경 변수와 기록의 보관 위치 칸, 진단 문장은 기록 `증명하는 것` 칸, 접수 행(연락처 두 표기·이름)은 L-07의 세 칸, 담당자·서명자 이름·연락처는 서명 기록의 역할·날짜 칸(허용 외 역할 거부 경로)과 기록의 역할·날짜 칸과 형제 참조 줄의 위치 칸, 법적 판단 문구는 법무 확인 기록의 확인 대상 식별자 칸·허용되지 않은 `의견` 칸과 기록의 칸이다. 입력이 비어 있어 통과한 것이 아님은 입력 폴더에 모든 라벨의 표지값이 실제로 있다는 단언으로 확인한다.

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`, 출력 없음(`M1d-tsc-2.log`). **E3 린트**: 바뀐 TS 파일 `pnpm exec eslint …` → `exit=0`(`M1d-eslint.log`), 저장소 전체 `pnpm lint` → `exit=0`(`M1d-lint-2.log`), 바뀐 TS 여섯 개 `prettier --check` 통과(`M1d-prettier.log`). **E4 전체 시험**: `pnpm test` → `Test Files 112 passed (112)`, `Tests 1199 passed (1199)`, `exit=0`(`M1d-test-full-2.log`) — 기준선 1135 + 새 64(서명 단위 21 + 점검기 시험 추가분 29 + 표지값 시험 14; 각 파일의 통과 줄 수는 `M1d-green-final.log`의 `✓` 집계 21·14·96이다). **E5 커버리지**: 설정대로 실행하면 이 작업 폴더가 `.claude/worktrees/` 아래라서 0/0이 나오므로 명령줄에서 include·exclude·reporter를 덮어썼다(`M1d-green-final.log`, 파일별 수치 `M1d-cov-summary.log`). `lib/launch` 8개 파일 모두 구문·분기·함수 100%(`signature.ts` 구문 75/75·분기 51/51), `scripts/check-launch-gate.ts` 구문 174/181·분기 146/154·함수 41/41(미덮개는 M1b·M1c와 같은 `isMain` 진입부와 예외 재던짐), `scripts/launch-marker-check.ts` 구문 47/49·분기 19/21(미덮개: git 실행 실패 시 던지는 오류 두 곳).

**추가 확인**: `pnpm build` → `exit=0`(`M1d-build.log`), `pnpm verify:flag-runtime` → `불일치 관측 합계: 0`, `exit=0`(`M1d-flag-runtime.log`). 둘 다 M1d가 앱 코드를 바꾸지 않아 결과가 기준선과 같은지 확인한 것이다. 실행 뒤 작업 트리는 변경한 파일만 보인다.

**SPEC 문서에서 발견한 것**(고치지 않았다, 적힌 대로 진행):

1. AC-B2CLAUNCH-008·REQ-B2CLAUNCH-008은 서명 기록이 "서명 시점의 항목 상태와 대상 값 전체"를 담는다고 쓰지만, 서명이 요청이 읽는 항목을 빠짐없이 덮어야 하는지(덮는 범위의 완전성)는 정하지 않는다. 점검기는 서명 시점 항목이 지금도 `UNVERIFIED`가 아닌지만 보고 서명이 요청의 필수 항목 전체를 덮었는지는 보지 않는다 — 한 항목만 적은 서명도 이 점검을 통과한다(항목 점검은 별개로 필수 항목 전체를 본다). 서명이 덮는 항목 집합의 규칙은 SPEC이 정해야 한다.
2. 서명 시점의 대상 값은 기록에 담기만 하고 현재 값과 비교하지 않는다. 대상 값이 바뀐 항목은 항목 점검의 대상 값 판정(M1b)으로 UNVERIFIED가 되고 그 효과로 서명이 무효가 되므로 SPEC 문구("서명 이후 항목 하나가 UNVERIFIED가 되면 서명은 효력이 없다")는 충족한다. 서명 자체의 대상 값이 현재 기록과 달라진 것을 별도로 거부해야 하는지는 SPEC에 없다.
3. REQ-B2CLAUNCH-008은 "서명한 역할"을 단수로 쓴다. 서명 행을 여러 개 허용하고 행마다 역할·실행 환경을 점검한다 — 서명자 구성(U3: 세 역할 전부가 서명해야 하는지)은 SPEC이 확인 대기로 두었으므로 어떤 규칙도 강제하지 않았고 한 역할의 서명만으로도 역할 점검은 통과한다. U3가 정해지면 점검기 규칙과 (마)(바)(사)의 서명자 부분을 다시 작업해야 한다.
4. AC-B2CLAUNCH-007의 "go/no-go 기록·서명 기록·참조 줄·런북 갱신·검증 출력 절차"에서 "런북 갱신"과 "검증 출력 절차"를 실행하는 코드는 M1에 없다. 검증 출력은 점검기 출력(프로세스 안·자식 프로세스 stdout/stderr 파일)과 기록 파서·법무 확인 기록이 돌려주는 문자열로 읽었고, 런북 갱신은 코드가 아닌 문서 편집이라 입력 자리에 표지값을 쓰는 절차로 시험하지 않았다. (3)이 요구하는 "D-LAUNCH-04가 정한 값 기록 위치"는 결정 기록이 "저장소 밖"만 정하고 위치를 정하지 않아, 시험은 OS 임시 폴더를 저장소 밖 위치로 썼다.
5. AC-B2CLAUNCH-007 (1)은 `grep -rnF`를 적는다. 시험은 같은 검색을 Node 파일 읽기로 구현했다(Windows에 `grep`이 없을 수 있어서이며 `git grep`은 자식 프로세스로 실행한다).
6. 기존 설계 때문에 이 검사로 보지 못하는 곳: 기록 상태·법무 확인 결과·실행 환경 같은 열거 칸에 열거 밖 값이 들어가면 기존 오류 메시지가 그 값을 되풀이해 적는다(`lib/launch/gate-record.test.ts`가 그 값을 단언한다). 표지값을 이 칸들에 넣지 않았다 — AC가 정한 입력 자리(시크릿·진단 입력·접수 행·담당 창구·서명 기록 칸·법적 판단 칸) 밖이라서다. 새 서명 모듈은 역할·날짜·열거 밖 실행 환경 값을 되풀이하지 않게 만들었다.
7. 승인된 대로 U3(로컬 I 서명자 구성)·U5(`local` + 단계 거부)는 건드리지 않았다. U5는 SPEC 문구대로 (거)(러)가 계속 거부한다.

**Gaps(관측하지 못한 것)**: `pnpm test:e2e`와 `pnpm visual:verify`는 M1d가 `lib/`·`scripts/`·문서만 바꿔 실행하지 않았다. 서명자 구성(U3) 규칙, 실제 서명 기록 파일의 위치·실제 허용 역할 목록의 점검(결정은 입력으로만 받는다)은 하지 않았다. 표지값 검사는 열거 칸에 들어간 표지값, 인코딩·절단된 값, 알지 못하는 실제 값을 보지 못한다. 자식 프로세스 점검기는 표지값 시험에서 한 번씩 실행했다(두 실행 모두 통과).

**잔여 위험**: 서명 파서는 헤더 줄이 정확히 같은 첫 표만 읽고 칸 안의 `|` 문자는 칸을 잘못 나눈다. 서명 점검은 서명이 덮는 항목의 완전성(위 1)과 서명 시점 대상 값의 일치(위 2)를 보지 않는다. 표지값 검사의 임시 폴더 정리는 `afterEach`에 있어 프로세스가 강제 종료되면 OS 임시 폴더에 남을 수 있다. 저장소를 검색하는 `git grep`은 작업 트리 전체를 도는 자식 프로세스라 저장소가 커지면 시험 시간이 늘어난다(현재 시험 파일 전체 2~8초대).

### M1 종합 검증 (오케스트레이터, 2026-10-07)

- **단위 구성**: 모드 선택(§F)에서 M1을 M1a→M1b→M1c로 나눠 위임한다고 적었으나 실제로는 네 단위(M1a, M1b, M1c, M1d)로 나눴다 — M1c(AC-004·006)와 M1d(AC-007·008)로 갈랐다. 커밋: `cb27b35`(§E.1) · `49646f7`(§F·기준선) · `de48d01`(M1a) · `9aac310`(런북 DoD 문장 정정, 오케스트레이터) · `bd06157`(M1b) · `e180214`(M1c) · `bac8662`(M1d). 위임은 단위마다 `Agent(general-purpose)`에 manager-develop 역할을 적어 보냈고, 쓰기 가능한 에이전트는 한 번에 하나만 돌렸다.
- **독립 검증**: 각 단위가 끝날 때마다 에이전트 보고를 믿지 않고 오케스트레이터가 직접 `git show --stat`, SPEC 본문 불변 여부, 전체 `pnpm test`·`pnpm lint`·`pnpm exec tsc --noEmit`을 다시 실행했다. 최종(HEAD `bac8662`)의 원문 로그는 `.moai/state/verify/launch-run/V11-test.log`~`V15-flag-runtime.log`이고 종료 코드는 로그의 `exit=` 줄에서 읽었다.

| 명령 | 로그 | 관측 결과 (HEAD `bac8662`) |
|---|---|---|
| `pnpm test` | `V11-test.log` | Test Files 112 passed (112), Tests 1199 passed (1199), `exit=0` — 기준선 939 + M1a 24 + M1b 112 + M1c 60 + M1d 64 |
| `pnpm lint` | `V12-lint.log` | `exit=0` |
| `pnpm exec tsc --noEmit` | `V13-tsc.log` | `exit=0`, 출력 없음 |
| `pnpm build` | `V14-build.log` | `exit=0` |
| `pnpm verify:flag-runtime` | `V15-flag-runtime.log` | `불일치 관측 합계: 0`, `exit=0` |

- **변경 범위 확인**: `git diff --stat 2c244e0 HEAD`로 `app/`·`components/`·`.github/`·`package.json`·`pnpm-lock.yaml`·`vitest.config.ts`·`.env.local.example`의 변경이 0건임을 확인했다. `spec.md`는 frontmatter `status`·`updated` 두 줄만(M1a), `plan.md`·`acceptance.md`는 한 줄도 바뀌지 않았다. 측정 뒤 `git status --short`는 비어 있다.
- **AC 현황(M1 몫)**: AC-B2CLAUNCH-001~008 전부 해당 fixture가 통과한다(각 단위의 판정표는 위 M1a~M1d 절). 단 BLOCKED가 남은 부분이 있다 — AC-004의 실제 형제 증거 기록과의 비교(형제 기록 형식·위치 미정), AC-008 (마)(바)(사)의 서명자 구성(U3, 사용자 확인 대기). 모두 acceptance.md가 선결로 적은 그대로다.
- **에이전트 보고에서 옮겨 적은 값(오케스트레이터가 직접 관측하지 않은 것)**: 커버리지 수치(`lib/launch` 100%, `scripts/check-launch-gate.ts` 174/181 구문 등). 이 작업 폴더에서는 저장소 설정의 `coverage.exclude`가 `.claude/**`를 담아 설정대로 실행하면 0/0이 나오므로 에이전트가 명령줄 덮어쓰기로 측정했다. RED 출력과 변이 검사 결과도 에이전트 로그(`M1*-red.log`, `M1*-mutation-check.log`)에서 읽은 것이다.
- **미측정(Gap)**: `pnpm test:e2e`·`pnpm visual:verify`(M1은 화면에 닿지 않는다. M2 착수 전에 측정). `moai` CLI·MCP가 연결되지 않아 `moai spec lint`, `moai session list`, @MX 태그 점검은 실행하지 못했고 @MX 태그는 추가하지 않았다. 불안정 시험: 단위 M1c의 첫 전체 실행에서 `scripts/verify-remote-consult.test.ts` 1건이 실패했고 단독 재실행과 이후 모든 전체 실행에서는 통과했다(원인 미조사 — 자동 메모리에 적힌 윈도우 EPERM 증상일 가능성은 추정일 뿐이다).
- **사용자 확인이 필요한 발견(M1 중 쌓인 것, SPEC은 고치지 않았다)**:
  1. ENGINE-001에는 id가 붙은 증거 표가 없다(`design.md` §9.3 행은 설명 칸 안의 `(i)`~`(iv)`). 그래서 R-02·R-03·R-05를 식별자로 참조하는 형제 증거 참조 줄은 지금 거부된다(M1c 발견 5). ENGINE-001이 식별자를 정하거나 이 SPEC이 다른 참조 방식을 정해야 한다.
  2. M1c가 참조 줄에 "이 SPEC 항목" 칸을 더해 6열로 했다(REQ-004의 다섯 필드에는 줄과 항목을 잇는 필드가 없어서). 이 열이 마음에 들지 않으면 SPEC이 연결 방식을 정해야 한다.
  3. 기존 오류 메시지는 열거 밖 값(기록 상태·법무 결과·실행 환경 칸)을 되풀이한다. 서명 기록 쪽은 값을 되풀이하지 않게 만들었으나 기록·법무 쪽은 시험이 되풀이를 확인한다(M1d 발견 5). 그 칸에 비밀·연락처가 잘못 들어가면 출력에 나타난다.
  4. 서명이 덮는 항목 범위와 서명 행이 여럿일 때의 서명자 구성(U3)은 SPEC이 정하지 않았다 — 지금은 역할의 허용 목록 소속만 강제한다.
- **plan.md 체크박스(`plan.md:63`)**: 아직 체크하지 않았다. 체크하면 해시 대상인 `plan.md`가 바뀌어 이후 Phase 1 게이트가 다시 실행될 수 있고, 재감사가 규칙 해석 debt(§E.1)와 얽혀 다른 판정이 날 위험이 있다. run 종료 시점으로 미뤘으며, 사용자의 "Phase 1 결과를 읽은 뒤" 조건과 어긋나지 않는다.

### M1e (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `c5570fe` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M1e-*.log`다. 이 커밋의 SHA는 이 기록이 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **배경**: `b55f35d`가 REQ-B2CLAUNCH-008에 "서명 기록이 담은 항목 집합은 그 단계의 필수 항목 집합과 같아야 한다"를, AC-B2CLAUNCH-008에 fixture (카)를(통과 둘·거부 아홉, 열한 가지), REQ·AC-B2CLAUNCH-004에 참조 줄의 연결 필드를 더했다. M1d의 점검기는 서명 시점 항목이 지금도 `UNVERIFIED`가 아닌지만 보고 집합 동일성은 보지 않았다(M1d 발견 1) — 이 단위가 그 틈을 막는다.
- **변경 파일**: `lib/launch/signature.ts`(`SignatureContext.requiredItemIds` 추가, `judgeSignature`에 집합 동일성 점검), `lib/launch/signature.test.ts`, `scripts/check-launch-gate.ts`(점검 루프가 필수 항목 식별자를 모아 넘김), `scripts/check-launch-gate.test.ts`(서명 도우미를 요청의 필수 항목 집합 기준으로 바꾸고 fixture (카)와 추가 시험, 형제 참조 연결 칸 시험 2건), `lib/launch/sibling-reference.test.ts`(연결 칸이 헤더에 없는 표 시험 1건), `scripts/launch-marker-check.test.ts`(서명 도우미 한 줄 — 아래 발견 4), `.moai/docs/launch-gate-runbook.md`(`## 서명 기록 양식`의 문장 셋). `spec.md`·`plan.md`·`acceptance.md`와 `app/`·`components/`·`.github/`·`package.json`·`pnpm-lock.yaml`·vitest 설정·`.env*`는 바꾸지 않았다.
- **구현한 것**: (1) 서명이 덮는 항목 집합 = 요청의 필수 항목 집합. 필수 항목 집합은 점검 루프가 판정에서 읽는 항목(목적 단계 열이 `해당 없음`이 아니고, 목적 벡터가 여는 표면에 적용되고, `local`에서 운영 한정 항목이 아니고, 면제되지 않은 `결정 대기`를 포함)을 그대로 모은 것이다. (2) 빠뜨린 필수 항목은 `서명이 덮지 않은 필수 항목 식별자: <식별자…>`로, **집합 밖 항목을 덮은 서명도** SPEC 문구("같아야 한다") 그대로 거부하며 `서명이 필수 항목 집합 밖의 항목을 덮는다 — 식별자: <식별자…>`로 적는다. 두 이유 모두 식별자만 적고 서명 시점 값은 적지 않으며 종료 코드는 1이다. (3) 서명이 덮는 항목이 하나도 없으면 기존 `서명이 덮는 항목이 없다` 한 줄만 낸다(필수 항목마다 되풀이하지 않는다). (4) `requiredItemIds`는 필수 필드라 서명 점검에서 집합 검사를 건너뛰는 호출이 없다.

**RED**(`SignatureContext.requiredItemIds`만 더하고 점검기가 집합을 모아 넘기되 `judgeSignature`는 값을 읽지 않는 틀로 두고 새·바뀐 시험 2개 파일을 실행, `M1e-red.log`): `Test Files 2 failed (2)`, `Tests 10 failed | 119 passed (129)`, `exit=1`. 모듈 없음·타입 오류는 0건이고 실패는 모두 단언 실패다(대표: `expected [] to deeply equal [ '서명이 덮지 않은 필수 항목 식별자: L-06', …(1) ]`, `expected +0 to be 1`(일부만 덮은 서명이 거부되지 않음), `expected [ '가', '마', '카' ] to deeply equal [ '가', '마' ]`). 실패 10건은 단위 시험 4건(`lib/launch/signature.test.ts`)과 점검기 시험 6건(fixture (카), (카) local, 집합 밖 항목, 면제 항목, I 서명으로 G 점검, 통과 둘 요약)이다.

**GREEN**(`M1e-green-1.log`): `Test Files 2 passed (2)`, `Tests 129 passed (129)`, `exit=0`. 형제 참조 연결 칸 시험 3건과 prettier를 더한 뒤 `lib/launch`+점검기 시험 전체 `M1e-green-final.log`: `Test Files 8 passed (8)`, `Tests 261 passed (261)`, `exit=0`. 첫 전체 `pnpm test`(`M1e-test-full.log`)는 `Tests 2 failed | 1212 passed (1214)`였고 실패 2건은 모두 `scripts/launch-marker-check.test.ts`가 I 열이 해당 없음인 항목까지 덮는 서명을 만들어서였다(아래 발견 4) — 시험 쪽 도우미 한 줄을 고쳐 최종 `M1e-test-full-2.log`: `Test Files 112 passed (112)`, `Tests 1214 passed (1214)`, `exit=0`(M1d 기준선 1199 + 새 15).

**E1 AC-B2CLAUNCH-008 판정표**(명령: `pnpm exec vitest run lib/launch scripts/check-launch-gate.test.ts --reporter=verbose`, 로그 `M1e-green-final.log`; 요청 형태 꼬리표는 AC-002와 같다. 서명은 모두 요청의 필수 항목 집합과 정확히 같게 만들었고 (카)·(자)·(차)만 의도적으로 다르다):

| fixture | 요청 형태 | 기대 | 관측 |
|---|---|---|---|
| (가) 서명 있음, 서명 뒤 모두 READY | [운영] I(G도 확인) | 통과 | PASS — 종료 코드 0, `서명 점검: 통과`, `내부 시험 공개 가능`(G는 G의 필수 항목 집합을 덮는 서명으로 `일반 사용자 공개 가능`) |
| (나) 서명 없음 | [운영] G | 거부 | PASS — 종료 코드 1, `서명 없음`, `일반 사용자 공개 불가` |
| (다) 서명 뒤 기록 안의 항목이 UNVERIFIED | [운영] I | 거부, 항목 식별자 | PASS — 종료 코드 1, `서명 점검: 서명 뒤 L-09가 UNVERIFIED가 되었다`(M1d의 R-05는 I 열이 해당 없음이라 집합 밖이므로 필수 항목 L-09로 바꿨다 — 발견 1) |
| (라) 허용 목록 밖 역할 | [운영] I | 거부 | PASS — 종료 코드 1, `서명 행 1의 역할이 허용 역할 목록에 없다`(역할 값은 출력에 없음) |
| (마) local I 서명(집합 = local S1의 필수 항목) | [로컬] | 통과 | PASS — 종료 코드 0, `로컬 시험 가능` — **서명자 구성(U3)은 BLOCKED, 시험은 역할 목록 소속만 본다** |
| (바) 서명 없음 | [로컬] | 거부 | PASS — 종료 코드 1, `서명 없음`, `로컬 시험 불가` — 서명자 구성 BLOCKED |
| (사) 서명 뒤 R-02가 UNVERIFIED | [로컬] | 거부, 항목 식별자 | PASS — 종료 코드 1, `서명 뒤 R-02가 UNVERIFIED가 되었다` — 서명자 구성 BLOCKED |
| (아) 서명의 실행 환경 칸이 비었거나 열거 밖 | 요청 형태 무관(운영·로컬 둘 다) | 거부 | PASS — 네 조합 모두 종료 코드 2, `서명 기록 오류`·`실행 환경`, 열거 밖 값은 출력에 없음 |
| (자) 운영 점검에 local 서명만(집합은 같게) | [운영] I | 거부 | PASS — 종료 코드 1, `서명의 실행 환경(local)이 요청 형태(production)와 다르다`, `서명이 덮지 않은 필수 항목 식별자`는 출력에 없음 |
| (차) 로컬 판정에 production 서명만(집합은 같게) | [로컬] | 거부 | PASS — 종료 코드 1, `서명의 실행 환경(production)이 요청 형태(local)와 다르다`, 덮지 않은 항목 이유는 출력에 없음 |
| (카) 서명이 목적 단계 I의 필수 항목 L-06·R-03을 빠뜨림(담은 항목은 모두 READY) | [운영] I | 거부, 덮지 않은 필수 항목 식별자 | PASS — 종료 코드 1, `서명 점검: 서명이 덮지 않은 필수 항목 식별자: L-06, R-03`, `내부 시험 공개 불가`, 항목 점검은 통과해 `불가 사유`가 없고 서명 시점 값(`대상-L-06` 등)은 출력에 없음 |

통과 둘 (가)(마), 거부 아홉이다(요약 시험이 확인: 통과 `["가","마"]`, 0이 아닌 것 9건). 추가 시험: (카)와 같은 이유를 `local` 요청에서도 확인, 집합 밖 항목(I 열이 해당 없음인 R-05, local의 운영 한정 L-01, S1만 여는 요청의 R-01)을 덮은 서명 거부, 면제된 `결정 대기` 칸(R-02 I)의 항목은 집합 밖이라 덮으면 거부·덮지 않으면 통과, I 단계의 서명으로 G 점검을 하면 `덮지 않은 필수 항목 식별자: R-05`와 `집합 밖 … 식별자: L-03`이 함께 적히고 거부, 시험용 필수 집합 계산의 표본 확인.

**E1 AC-B2CLAUNCH-004 판정표**(`lib/launch/sibling-reference.test.ts`와 점검기 시험, 같은 로그):

| fixture | 기대 | 관측 |
|---|---|---|
| (가) 존재하는 형제 항목, 값 그대로 옮김 | 통과 | PASS — 종료 코드 0, `R-04: READY`, `내부 시험 공개 가능` |
| (나) 없는 형제 항목 식별자 | 거부(식별자를 적음) | PASS — 종료 코드 2, `존재하지 않는 형제 항목 식별자`, `E-99` |
| (다) 자체 판정 칸이 있음 | 거부 | PASS — 종료 코드 2, `참조 줄은 형제 상태만 옮길 수 있다` |
| (라) 옮겨 적은 대상 값이 형제 기록과 다름 | 연결 필드가 가리키는 이 SPEC 항목이 UNVERIFIED | PASS — 종료 코드 1, `R-04: UNVERIFIED`, `EV-L3`, `내부 시험 공개 불가`, 형제 값은 출력에 없음(M1c에서 구현·시험됨) |
| 연결 필드가 이 SPEC 항목 정의표에 없는 식별자(`R-99`) | 거부 | PASS — 종료 코드 2, `R-99`(M1c에서 시험됨) |
| 연결 필드 칸이 비어 있음 | 거부 | PASS — 파서 시험은 M1c에 있고, 점검기 수준(종료 코드 2, `형제 참조 오류`, `"이 SPEC 항목" 칸이 비어 있다`)은 이 단위가 더했다 |
| 연결 필드 열이 헤더에 없는 다섯 칸 표 | 거부 | PASS — 종료 코드 2, `참조 줄 표(헤더: …이 SPEC 항목…)를 찾지 못했다`, UNVERIFIED로 만든 항목 없음(M1c 코드가 이미 그렇게 동작했으나 시험이 없어서 이 단위가 파서·점검기 수준으로 더했다) |

**변이 시험**: 하지 않았다(Gaps).

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`, 출력 없음(`M1e-tsc-2.log`). **E3 린트**: `pnpm lint` → `exit=0`(`M1e-lint-2.log`), 바뀐 TS 여섯 개 `prettier --check` 통과. **E4 전체 시험**: `pnpm test` → `Test Files 112 passed (112)`, `Tests 1214 passed (1214)`, `exit=0`(`M1e-test-full-2.log`). `scripts/verify-remote-consult.test.ts`는 이번 두 전체 실행에서 실패하지 않았다.

**SPEC·코드에서 발견한 것**(SPEC 문서는 고치지 않았다, 적힌 대로 진행):

1. 집합 동일성을 SPEC 문구 그대로("같아야 한다", 집합 밖 항목도 불일치) 구현하자 M1d 시험의 서명 구성이 틀리게 됐다 — M1d 도우미는 기록의 모든 READY 항목(local은 운영 한정 셋만 뺀 것)을 서명에 담았는데, 그것은 목적 단계 열이 `해당 없음`인 항목(I의 R-05, G의 L-03)·목적 벡터가 열지 않는 표면의 항목(S1만 열면 R-01)·면제된 항목을 집합 밖으로 덮는다. 기대 결과(종료 코드·출력)를 SPEC과 맞추기 위해 시험 도우미가 서명을 요청의 필수 항목 집합으로 만들게 바꿨고 (가)~(차)의 기대값은 그대로다. 단 (다)는 M1d가 일부러 I 열이 해당 없음인 R-05를 골라 항목 점검은 통과하고 서명 점검만 실패하게 했는데, 집합 동일성 아래에서는 그런 항목을 서명에 담을 수 없어 필수 항목 L-09로 바꿨다. 이제 서명에 담긴 항목은 모두 필수 항목이므로 서명 뒤 UNVERIFIED가 된 항목은 항목 점검에서도 함께 실패한다(두 이유가 모두 출력에 적힌다).
2. AC-B2CLAUNCH-008 (마)의 괄호는 서명 대상이 아닌 항목으로 운영 한정 항목 셋만 적었고, (가)·(마) 본문은 "서명 시점의 항목 상태와 대상 값 전체"라고만 쓴다. 집합 동일성을 따르면 서명이 덮지 않아야 하는 항목에는 그 셋 말고도 목적 단계 열이 `해당 없음`인 항목·목적 벡터가 열지 않는 표면의 항목·면제된 `결정 대기` 칸의 항목이 있다(`local` S1 요청이면 R-01·R-05도 집합 밖). 이 감사 결함 N1(§2.4에 전체 덮기 규칙 미전파)과 같은 뿌리이며 SPEC 문구 보강은 manager-spec의 몫이다. 또 "(가)는 G에서도 같은 production 서명으로 통과" 시험은 같은 서명이 G를 통과한다는 전제였는데 I와 G의 필수 집합이 달라(R-05는 G만, L-03은 I만) 성립하지 않아 G 서명을 따로 만들게 바꿨고, I 서명으로 G 점검을 하면 거부된다는 시험을 더했다.
3. 형제 증거 참조 줄(AC-004): (a) 값이 어긋난 줄이 연결 필드가 가리키는 항목을 `UNVERIFIED`(EV-L3)로 만드는 것은 M1c가 이미 구현하고 시험했다(`evaluateSiblingReferences`의 `unverified[launchItem]`, 점검기 `effectiveStatusOf`; 단위·점검기 (라)). (b) 연결 필드가 없거나 매달린 경우: 칸이 빈 줄(파서 거부)·정의표에 없는 식별자(점검기 거부)는 시험이 있었고, 점검기 수준의 빈 칸 시험과 헤더에 연결 열이 없는 표(파서가 표를 찾지 못해 거부) 시험이 없어 이 단위가 구현된 동작에 시험만 더했다. 동작이 빠진 곳은 없다. 한 가지 설명할 점: 연결 필드가 가리키는 항목이 그 요청에서 필수가 아니면(예: I 점검의 R-05) 그 항목의 `UNVERIFIED` 강등은 일어나지만 항목 점검이 그 항목을 읽지 않으므로 판정에 영향이 없다 — AC가 정한 바이고 시험으로 고정하지는 않았다.
4. `scripts/launch-marker-check.test.ts`는 이 단위의 변경 허용 목록(서명·점검기·참조 줄·런북·진행 기록)에 없지만 서명 도우미가 기록 전체 항목(I 열이 해당 없음인 R-05 포함)을 서명에 담아 집합 동일성 아래에서 표지값 시험 2건이 실패했다. 서명 항목에서 I 열이 `해당 없음`인 항목을 빼는 한 문장만 고쳤다(표지값 검사 로직은 그대로).
5. 런북 `## 서명 기록 양식`의 "통과"·"거부" 목록은 집합 동일성을 말하지 않아 새 점검기와 어긋났다(통과 조건이 더는 충분하지 않다). 문장 셋만 더했고(서명 시점 항목 표 설명, 통과 조건, 거부 이유) 다른 절은 건드리지 않았다. 서명자 구성(U3)·서명 시점 대상 값과 현재 값의 비교(M1d 발견 2)는 여전히 정하지 않았다.

**Gaps(관측하지 못한 것)**: `pnpm build`·`pnpm test:e2e`·`pnpm visual:verify`는 이 단위가 `lib/`·`scripts/`·문서만 바꿔 실행하지 않았다. 변이 시험(집합 검사를 끄면 시험이 실패하는지)과 커버리지 수치는 측정하지 않았다 — RED 실행(검사가 없을 때 10건 실패)이 변이 시험의 대용이다. `moai` CLI·MCP가 연결되지 않아 `moai spec lint`·@MX 태그 점검은 실행하지 못했고 @MX 태그는 추가하지 않았다. 시험용 필수 항목 집합 계산(`requiredIdsFor`)은 점검기와 같은 규칙을 따로 적은 것이라 두 구현이 같은 방향으로 틀리면 (가)(마)로는 드러나지 않는다(표본 확인 시험 하나가 R-05·L-03·L-01·R-01·L-05 경계만 고정한다).

**잔여 위험**: 필수 항목 집합은 점검 루프가 판정에서 읽는 항목이므로 점검 규칙(결정 대기 칸 면제·표면 열·운영 한정 항목)이 바뀌면 서명이 덮어야 하는 집합도 함께 바뀌어, 이미 받은 서명이 새 규칙에서 집합 불일치로 거부될 수 있다(규칙 변경은 서명의 재작성을 부르는 사건이다). 서명 점검은 서명 시점 대상 값의 일치와 서명자 구성(U3)을 여전히 보지 않는다.

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_

## §F Phase 4 Mode Selection

Decision: serial

- 기록 시각: 2026-10-07, 첫 run-phase `Agent()` 위임 전이다. 오케스트레이터의 자율 결정이며 Implementation Kickoff Approval(§E.1)이 이미 통과한 뒤다.
- **입력 값**: Tier M. 범위는 `plan.md` §F의 M1~M6 후보 목록 기준으로 수십 개 파일이고(`lib/launch/*`, `scripts/*`, `.moai/docs/launch-gate-runbook.md`, `.github/workflows/deploy.yml`, 푸터 컴포넌트와 시험), M1만 보면 후보 파일이 9개(시험 포함)다. 영역은 TypeScript 모듈, 검증 스크립트, 런북 문서, CI 워크플로, UI 컴포넌트로 3개를 넘는다. 파일 언어는 TypeScript + 마크다운 + YAML이다. 동시 처리 이득은 낮다 — 새 코드 작성이고 기록 모델 → 점검기 순으로 서로 의존한다. Agent Teams 명시 요청은 없다.

| 모드 | 판정 | 사유 |
|---|---|---|
| `direct` | 선택 안 함 | 사소한 작업이 아니다(새 모듈과 시험 다수) |
| `serial` | **선택** | 코딩 중심 작업의 기본 경로이고 모듈 간 의존이 있다 |
| `fanout` | 선택 안 함 | 영역 3개 이상·파일 10개 이상 기준에는 걸리지만 연구 중심이 아니라 코딩 중심이다(§B.2 "코딩 중심 + 다영역 → serial") |
| `sweep` | 선택 안 함 | 한 가지 기계적 변환 규칙이 아니고 파일 간 의존이 있으며 대상이 약 30개 파일 기준에 미치지 못한다 |
| `agent-team` | 요청 없음 | 자동 선택 대상이 아니다(§C.1) |

- **Boundary Case**: M1 후보 파일 수가 10개 기준 바로 아래(9개)이고 영역 수가 3개 기준 이상이다. §B.2의 동률 규칙대로 더 단순한 모드(`serial`)로 풀었다.
- **Justification**: 이 SPEC의 구현은 새 코드 작성이 중심이고 M1의 기록 모델이 M2~M6 점검기의 입력 형태를 정한다. 코딩 중심 작업은 병렬화할 수 있는 몫이 적다는 Anthropic의 지적에 따라 마일스톤을 순서대로 하나씩 위임한다. M1은 크기가 커서(점검기·기록 모델·런북 골격) 같은 `serial` 안에서 하위 단위 M1a→M1b→M1c로 나눠 위임한다. 쓰기 가능한 에이전트는 한 번에 하나만 돌린다.
- **위임 수단과 한계**: 구현 위임은 `manager-develop` 서브에이전트 유형이 아니라 현재 작업 폴더에서 `Agent(general-purpose)`에 manager-develop 역할을 적어 보낸다. 근거는 자동 메모리에 기록된 교훈(`manager-develop`가 원격 기본 브랜치에서 자기 worktree를 새로 만들어 이 브랜치를 못 쓴다)이며 이번 run에서 다시 측정하지 않았다. `/moai goal`(`ac_converge`)은 `moai` CLI와 MCP가 이 환경에서 연결되지 않아 쓰지 못하므로 수동 턴 진행으로 낮춘다(`run.md` Run-phase Autonomy의 graceful degradation).

## §G Plan-Auditor Iteration Log

이 표는 실제 plan-auditor 호출 결과만 기록한다.

| Iteration | Date | Score | Verdict | Key Findings | Reflected Changes |
|---|---|---|---|---|---|
| 1/3 | 2026-10-03 | 0.88 (Tier M 기준 0.80) | PASS | D1 (minor, optional) — AC-B2CLAUNCH-012 오라클 정규식의 주석 제외가 2단계 절차(정규식+주석 필터) 전체에서만 성립한다는 설명이 `acceptance.md:104`에 명확하지 않음. D2 (minor, optional) — SPEC ID 정규식이 SSOT와 불일치(선례 형식 공유, 수정 불요). 7개 Must-Pass 전부 PASS/N/A(차단 사유 없음). 전문: `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-1.md` | 이 audit은 D-LAUNCH-01~09 사용자 결정이 반영되기 전 상태를 감사했다(보고서 커밋 `643dec1`이 결정 반영 커밋 `c89dae7`보다 앞서고 보고서도 결정 미정을 적었다. 정확한 피감사 SHA는 미확인 — 본 파일 §E.1). D1·D2는 사소·선택 항목이라 반영을 미뤘다. 이후의 결정 반영(`c89dae7`), 2차 정밀 교정(D-LAUNCH-07 사유 2종 추가 등), 3차 정밀 교정, 4차 정렬 교정은 이 iteration 뒤에 추가된 내용이라 이 행이 다루지 않으며, D1·D2 반영 여부와 함께 다음 재감사에서 다뤄야 한다. |
| 2/3 | 2026-10-04 (감사 대상 `3c56b47`) | 0.75 (Tier M 기준 0.80; Clarity 0.60, Completeness 0.90, Testability 0.80, Traceability 0.75의 조화평균) | FAIL — STOP 신호(1회차 0.88보다 낮음. 1회차는 결정 반영 전 상태를 감사했으므로 두 점수는 서로 다른 내용을 잰다) | Must-Pass 7개는 통과(MP-4 N/A). 차단 결함 4건: D-01 D-LAUNCH-07 기록이 `c89dae7`의 "진단 표면 전용 사유는 추가하지 않는다"에서 "2종을 더한다"로 바뀌었는데 결정 기록 문장에는 사용자 결정으로 적혀 있지 않음(결정 주체·선택 질문 없음. `RESUME.md`는 2차 정밀 교정을 사용자 지시로 적고 이 사유 추가를 그 항목으로 나열함. 나머지 결정 8건은 불변), D-02 CONSULTOPS-001 D-OPS-04 (d)(e)(f)는 "03 계열 푸터"인데 L-08이 "01·02·03 공유"로 적어 S1 G 차단의 근거가 맞지 않음, D-03 단계 표의 `local` 형태가 "단계는 운영 호스트의 상태"와 맞지 않고 `local` 판정을 소비하는 요구사항이 없음, D-04 `spec.md` 교차 참조 문단이 L-08의 표면별 규칙과 모순. 선택 결함 11건(D-05~D-15: 형제 인용 줄 번호 낡음, R-02·R-03이 로컬 시험에도 필수가 되는 점 등). 1회차 D1·D2는 미해소(선택). 전문: `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-2.md` | 아직 반영하지 않음. Retry Loop Contract의 STOP 신호에 따라 범위 축소, PASS-with-debt 수용, 사용자의 명시적 예외(3회차) 중 사용자 선택을 기다린다. 이 행은 감사 결과만 기록하며 SPEC 본문은 이 감사로 바뀌지 않았다. |
| 3/3 | 2026-10-04 (감사 대상 `ba4602e0520bd19e8d6c1c61e6b9002995d4c930`; spec.md blob `6fba2af`, plan.md blob `99cda75`, acceptance.md blob `e67a8d2`) | 0.81 (Tier M 기준 0.80; Clarity 0.70, Completeness 0.90, Testability 0.80, Traceability 0.85의 조화평균 0.8054) | PASS — 여유 얇음(Clarity 0.65면 0.79로 FAIL). Claude 단독 감사, audit_multi·캐시 저장 없음. 보고서 `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-3.md` | Must-Pass 7개 통과(MP-4 N/A). review-2 차단 결함 D-01~D-04 해소(D-01은 문자 그대로가 아니라 실질 해소 — (e)(f) 제안문이 본문에 남음). 선택 결함: 해소 D-05·D-07·D-08·D-10·D-12·D-13, 일부 해소 D-06·D-09, 미해소 D-11·D-14·D-15. 신규 선택 결함 D-16~D-22(모두 optional): D-16 시작 조건 (2) 이중 해석, D-17 L-02·L-08 로컬 판정 규칙 미정의, D-18 §2.5와 §2.4 R-02·R-03 불일치, D-19 S2 일반 공개 판정 근거(G(1) vs D-OPS-04) 불명, D-20 N2 상태 서술이 R-01 행과 모순, D-21 fixture 공백·AC-008 문구, D-22 (c) 선택 출처 기록 불명확. N1~N11 열림 유지, 사용자 확인 대기 U1~U5. 이 감사 후 문서 수정은 하지 않았다 | 없음(감사 결과 기록만. 신규 결함은 사용자 결정 U1~U5 뒤 manager-spec이 처리 여부를 판단한다) |
| run-gate 1 (Phase 1 재실행) | 2026-10-07 (HEAD `c89d060`; spec.md blob `3f32b5b`) | 0.78 (Tier M 기준 0.80; Clarity 0.65, Completeness 0.90, Testability 0.75, Traceability 0.85) | FAIL — 점수만 미달, 필수 항목 실패 없음. Claude 단독 감사 | 차단 결함 D1(REQ-008 서명이 필수 항목 전체를 덮는다는 요구 없음)·D2(REQ-004 참조 줄과 이 SPEC 항목의 연결 없음). 선택 결함 D3~D13. 보고서 `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-2026-10-07.md` | D1·D2를 커밋 `b55f35d`로 반영(사용자 선택: D1·D2만 반영 후 범위 한정 재검사) |
| run-gate 2 (범위 한정 재검사) | 2026-10-07 (HEAD `b55f35d`) | 0.80 (비반올림 0.8036; Clarity 0.70, Completeness 0.88, Testability 0.80, Traceability 0.86) | PASS — 여유 0.0036, 채점 오차 안쪽(Clarity 0.65 또는 Testability 0.75면 FAIL). Claude 단독 감사 | D1·D2 닫힘. 신규 선택 결함 N1~N6, 미해소 D3·D10·D11(major, optional)과 D4·D5·D7~D9·D13. 보고서 `...-2026-10-07-recheck.md` | 없음(이 PASS로 Phase 1 통과 기록) |

## Open Decisions for User

D-LAUNCH-01~09 9건은 2026-10-03 사용자 인터뷰에서 모두 결정됐다(표 바로 아래 "결정 기록 (2026-10-03, 사용자 인터뷰)" 참조). 옵션 전문은 `spec.md` "설계 대안", 결정 행은 `plan.md` §B다. 아래 표의 "추천 + 전제" 칸은 결정이 아니라 작성 시점의 추천이며 각 추천은 전제("Recommended when")를 함께 적었다 — 실제 사용자 결정은 표 아래 "결정 기록"에 따로 적는다. 이 SPEC은 담당 창구·담당자, 연락 기한·SLA, 상태 이름, 동의·정책 문구, 법적 결론, 수치, URL, 보관 위치를 정하지 않는다.

| ID | 질문 | 옵션 | 추천 + 전제 | 차단하는 것 | 결정 주체 |
|---|---|---|---|---|---|
| D-LAUNCH-01 | 내부 시험을 어디서 어떻게 노출하는가(정책 준비 상태의 접수 API는 화면 플래그와 무관하게 열리고 운영 호스트는 하나다) | (a) 별도 환경 (b) 운영 호스트 앞단의 접근 제한(이 저장소 밖) (c) 앱 안 허용 목록·접근 코드(코드 변경) (d) 제한 없이 수용하고 위험을 기록 (e) 내부 시험을 로컬 실행으로 한정 | (e) — 별도 환경이 없고 운영 호스트에서 정책 준비 상태의 접수 API가 누구에게나 열린다는 점을 내부 시험이 감수하기 어려울 때. 별도 환경을 마련할 수 있으면 (a). (b)는 운영 책임자가 프록시를 바꿀 수 있고 외부 차단을 저장소 밖 관측 기록으로 남길 수 있을 때 | 내부 시험 공개 단계, L-02, L-03 | 제품 책임자, 운영 책임자, 엔지니어링 |
| D-LAUNCH-02 | 내부 시험 참여자는 어떤 역할이고 진단 쪽 데이터 규칙은 무엇인가(상담 쪽은 CONSULTOPS-001 D-OPS-10 (Q2) 참조) | 참여자 (a) 내부 역할만 (b) 내부 역할과 초대한 외부 참여자 역할 (c) (a) 또는 (b)에 보험 도메인 전문가 역할을 포함 / 데이터 규칙 (1) 합성 입력만 (2) 참여자 본인 경험 입력 허용 (3) 엔진 연결 여부에 따라 달리함 | 참여자 (a), 데이터 규칙 (1) — 내부 시험이 로컬 또는 접근이 제한된 환경에서 이뤄지고 진단 동의 상세 문구가 아직 placeholder일 때 | L-03, 내부 시험 공개 단계 | 제품 책임자, 법무, 운영 책임자 |
| D-LAUNCH-03 | 진단·상담 표면을 어떤 순서로 여는가 | Q1 일반 공개 순서: (a) 진단 먼저, 상담은 이후 별도 노출 확대 (b) 상담 먼저, 진단은 이후 (c) 함께 (d) 표면별 개별 공개 / Q2 내부 시험의 표면 범위: (1) 내부 시험은 모든 표면 (2) 진단만 (3) 상담만 (4) Q1이 정한 첫 표면만 | Q1 (a), Q2 (4) — 엔진 준비 증거와 진단 동의 문구 확정이 상담 운영 증거보다 먼저 갖춰질 수 있고 상담의 일반 사용이 실제 결과를 기다린다는 ENGINE-001의 서술을 순서로 지키고 싶을 때 | REQ-B2CLAUNCH-011, AC-B2CLAUNCH-011, 단계별 허용 벡터 | 제품 책임자, 운영 책임자, 엔지니어링 |
| D-LAUNCH-04 | go/no-go 기록의 서명자·형식·보관은 무엇인가(저장소가 공개이고 `main` push마다 배포된다) | 서명자 (a) 제품 책임자 (b) 제품 책임자 + 운영 책임자 (c) (b) + 법무 (d) (c) + 보험 도메인 전문가 / 형식 (i) 마크다운 문서 (ii) 구조화 데이터 파일과 점검기 입력 (iii) 외부 문서 시스템과 저장소 안의 참조 / 보관 (α) 저장소 추적 문서 (β) 비추적 로컬 폴더 (γ) 저장소 밖과 저장소 안의 참조 | 서명자 (c), 형식 (i), 보관은 저장소 안에는 항목 식별자·상태·참조만 두는 (α)와 서명 세부를 담는 기록은 (γ) — 저장소가 공개로 유지되고 기록에 법무 확인 항목이 있으며 공개할 수 없는 값을 담는 기록을 저장소 밖에 둘 수 있을 때 | M1, 모든 서명 기록, AC-B2CLAUNCH-003·006·007·008의 일부 | 제품 책임자, 엔지니어링(법무: 공개 가능 범위) |
| D-LAUNCH-05 | 일반 공개에 필수인 준비 항목은 무엇인가(`결정 대기` 칸: L-02 G, R-02 I, R-03 I, R-05 G, D-ENGINE-09 G 단계 서명) | (a) 대상 칸 전부 필수(면제 없음) (b) 칸별로 필수 또는 `해당 없음`을 사유와 함께 기록 | (a) — 일반 공개를 서두를 이유가 없고 항목별 면제 사유에 서명할 역할이 아직 정해지지 않았을 때 | 일반 사용자 공개 판정, M1의 항목 표 확정 | 제품 책임자, 법무, 운영 책임자(보험 도메인 전문가) |
| D-LAUNCH-06 | `deploy.yml` smoke 검사를 어떻게 교체하는가 | 설계 (a) 두 상태 수용 (b) 상태 인지 (c) 상태 비의존 검사만 + 상태는 로그로 (d) (a)~(c)에 `/consult`·접수 API 검사를 더함 / 위치 (i) 워크플로의 인라인 셸 (ii) 저장소 스크립트 | 설계 (a), 위치 (ii) — 열림 상태의 표지(`<title>` 등)를 로컬에서 안정적으로 관측할 수 있고 배포 실패를 상태 불일치가 아니라 배포 건강(2xx·CSS 청크)에 묶고 싶을 때 | L-05, 모든 진단 플래그 변경, AC-B2CLAUNCH-013 | 엔지니어링, 제품 책임자 |
| D-LAUNCH-07 | 롤백은 누가 선언·실행하고 어떤 사유로 하는가 | 선언 (i) 운영 책임자 (ii) 제품 책임자 (iii) 둘 중 누구나 (iv) 사유 종류별로 다름 / 실행 (1) 운영 호스트 접근 보유자 (2) 선언 역할이 직접 / 사유 목록: CONSULTOPS-001 §2.4의 작성자 기본 목록을 쓰고 진단 표면의 사유를 더할지, 종류를 빼거나 더할지 | 선언 (iii), 실행 (1) — 롤백이 저장된 행과 시크릿을 지우지 않는 되돌림이라 오선언 비용이 낮다고 두 역할이 판단할 때 | L-06, REQ-B2CLAUNCH-014, 모든 노출 확대 | 제품 책임자, 운영 책임자 |
| D-LAUNCH-08 | 노출 확대 뒤 무엇을 누가 관측하는가 | 내용 (a) 노출 확대 직후의 상태 확인(효과적 플래그 상태·smoke·프로세스 상태)만 (b) (a)에 접수 행 존재와 오류 응답 확인(상담)을 더함 (c) (b)에 새 관측 수단 도입을 더함(별도 SPEC이 필요하다) (d) 관측 없음과 위험 기록 / 담당 (1) 운영 책임자 (2) 제품 책임자 (3) 엔지니어링 (4) 단계·표면별로 다름 | 내용 (b), 담당 (1) — 접수 건수가 사람이 직접 확인할 수 있는 수준이고 새 관측 도구를 도입하지 않을 때 | L-09, REQ-B2CLAUNCH-016 | 운영 책임자, 제품 책임자 |
| D-LAUNCH-09 | 01·02·03 법적 고지 요소는 어느 단계 전에 어떤 상태여야 하는가 | (1) 목적지(앱 안 페이지 또는 앱 밖 링크)를 갖춘 뒤에만 해당 단계로 진입한다 (2) "준비 중" 비활성 표시를 허용한다(03 푸터의 현재 방식) (3) 요소를 제거한다 (4) 현행 유지(01·02의 `href="#"` 포함) | 일반 공개(G)는 (1), 내부 시험(I)은 (2) — 법무가 "준비 중" 표시를 일반 방문자에게 허용하지 않는다고 판단할 때. 허용한다고 판단하면 G도 (2) | L-08, AC-B2CLAUNCH-015의 허용 칸 | 제품 책임자, 법무 |

### 결정 기록 (2026-10-03, 사용자 인터뷰)

아래 9건은 D-LAUNCH-01~09에 대한 사용자 인터뷰 결정이다. 각 옵션 문자는 `spec.md` "설계 대안"과 이 표의 옵션 문구를 그대로 가리킨다. 이 기록은 결정 기록 그 자체이며, go/no-go 기록·서명 기록의 형식(D-LAUNCH-04가 정한 바)과는 별개다.

- **D-LAUNCH-01**: **결정 (2026-10-03, 사용자 인터뷰)**: (e) 내부 시험을 로컬 실행으로 한정.
- **D-LAUNCH-02**: **결정 (2026-10-03, 사용자 인터뷰)**: 참여자 (a) 내부 역할만, 데이터 규칙 (1) 합성 입력만.
- **D-LAUNCH-03**: **결정 (2026-10-03, 사용자 인터뷰)**: Q1 (a) 진단 먼저, 상담은 이후 별도 노출 확대. Q2 (4) Q1이 정한 첫 표면(진단)만.
- **D-LAUNCH-04**: **결정 (2026-10-03, 사용자 인터뷰)**: 서명자 (c) 제품 책임자 + 운영 책임자 + 법무. 형식 (i) 마크다운 문서. 보관은 저장소 안에는 항목 식별자·상태·참조만 두는 (α)와 서명 세부를 담는 기록은 저장소 밖에 두는 (γ)의 혼합.
- **D-LAUNCH-05**: **결정 (2026-10-03, 사용자 인터뷰)**: (a) 대상 칸 전부 필수, 면제 없음.
- **D-LAUNCH-06**: **결정 (2026-10-03, 사용자 인터뷰)**: 설계 (a) 두 상태(게이트 닫힘/열림) 모두 수용. 위치 (ii) 저장소 스크립트.
- **D-LAUNCH-07**: **결정 (2026-10-03, 사용자 인터뷰)**: 선언 (iii) 운영 책임자·제품 책임자 둘 중 누구나. 실행 (1) 운영 호스트 접근 보유자. 사유 목록은 CONSULTOPS-001 §2.4의 작성자 기본 목록(최소 4종)을 그대로 쓰고, 진단 표면 전용 사유는 추가하지 않는다.
- **D-LAUNCH-08**: **결정 (2026-10-03, 사용자 인터뷰)**: 내용 (b) 상태 확인에 접수 행 존재·오류 응답 확인(상담)을 더함. 담당 (1) 운영 책임자.
- **D-LAUNCH-09**: **결정 (2026-10-03, 사용자 인터뷰)**: 일반 공개(G)는 (1) 목적지(앱 안 페이지 또는 앱 밖 링크)를 갖춘 뒤에만 해당 단계로 진입. 내부 시험(I)은 (2) "준비 중" 비활성 표시를 허용.

### D-LAUNCH-07 후속 변경안 (2026-10-04 기록 — 확인 대기, 결정 기록이 아니다)

위 D-LAUNCH-07 결정 기록은 `c89dae7`의 원래 문장 그대로다. 아래는 그 뒤에 일어난 변경을 결정과 분리해 적은 이력이다.

- **변경 내용**: 진단 표면 전용 롤백 사유 2종 — (e) 잘못된 판정/결과 매핑이 확인된 경우, (f) 지원 범위 밖 결과의 노출이 확인된 경우 — 을 L-06 사유 목록에 더하는 것.
- **이력(git으로 확인)**: 2026-10-03 커밋 `7916728`("2차 정밀 교정")이 위 결정 기록 문장을 "진단 표면 전용 사유는 추가하지 않는다"에서 "2종을 더한다"로 고쳤고 `spec.md`·`plan.md`·`acceptance.md`에 같은 내용을 반영했다. 다른 결정 8건의 기록은 `c89dae7`과 같다(5차 수정안 때 `git show c89dae7:`와 대조).
- **사용자 지시 근거 확인 결과**: 날짜 2026-10-03(커밋 날짜). 출처 후보는 `.moai/reports/b2c-launch-readiness/RESUME.md` §1·§4-0 — 2차 정밀 교정 11건을 "사용자가 직접 검토해 지시한" 것으로 적고 항목으로 "D-LAUNCH-07 사유 추가"를 나열한다. 다만 그것은 그 세션이 쓴 2차 기록이며 사용자가 이 사유 추가를 어떤 말로 지시했는지(원 지시문), 결정 주체(역할), 선택한 질문은 이 저장소에서 확인하지 못했다. 이전 세션 기록(`~/.claude/projects/` 대화 기록)은 사용자 확인 없이 열람하지 않았다.
- **상태**: 확인 대기. 사용자 승인이나 결정 주체를 이 문서가 만들어 적지 않는다. 확인되면 이 아래에 날짜·출처·결정 주체를 담은 별도 결정 기록을 추가하고 L-06·AC-B2CLAUNCH-014를 갱신한다. 확인 전까지 (e)(f)는 L-06 사유 목록에 들어가지 않는다.

### 결정 외 확인 사항

`spec.md` Open Clarification의 N1~N11은 결정이 아니라 기존 SPEC과의 충돌·소유 확인이다. 요약: N1 단계 정의 소유 이관과 형제 문구, N2 "내부 시험"의 세 용법(ENGINE `design.md:184`·CONSULTOPS-001·DIAGNOSIS-001), N3 E-08 G 면제와 E-17 I 면제의 확인, N4 완료된 DIAGNOSIS-001 smoke 트리거의 틈(`ENABLE_DIAGNOSIS_DEV_STATES` 단독), N5 01·02 푸터의 소유, N6 ENGINE-001 런타임 게이트와 조합표, N7 CONSULTOPS-001 REQ-B2CCONSULTOPS-013의 범위, N8 롤백 목표 범위(dark 복귀만), N9 run-phase 커밋 경로와 배포(Route A는 모든 커밋이 운영 재시작), N10 Tier 상한, N11 이행 집행의 한계.

### 4차 정렬 교정 기록 (2026-10-04)

기준은 `origin/plan/b2c-launch-readiness@0553039`다. D-LAUNCH-01~09의 사용자 결정은 바꾸지 않았고 새 결정 인터뷰도 하지 않았다. 이 교정은 재감사를 받지 않았다. 요구사항·AC 번호와 개수(16/16)는 유지했다.

- **로컬 내부 시험의 적용 조건**: 이전에는 L-01·L-05·R-04의 "적용 시점" 문장이 항목 칸 안에만 있었고, 점검기가 어떤 환경으로 실행되는지는 계약에 없었으며 단계 표의 "내부 시험 공개" 행이 로컬 시험과 운영 노출을 한 칸에 섞어 적었다. 정렬 결과: 점검기는 실행 환경(`local`/`production`)을 명시적으로 입력받고 기본값이 없으며 입력이 없거나 열거 밖이면 거부한다. `local`에서는 운영 한정 항목 L-01·L-05·R-04를 적용하지 않고(`해당 없음(local)`), `production`에서는 I·G 열 표대로 계속 필수다. 그 셋 밖의 항목은 환경과 무관하게 적용된다. `일반 사용자 공개`는 운영 호스트에서만 성립하므로 `local`로 G를 점검하는 입력은 거부한다(이 거부 규칙은 위 계약에서 따라 나온 경계이며 새 사용자 결정이 아니다 — 필요 없다고 판단하면 지시해 달라). 바뀐 곳: `spec.md` REQ-B2CLAUNCH-002, §2.4(실행 환경 항목 신설, 단계 문장, 단계 표 두 행, 로컬 시험과 운영 상태의 구분 문단, L-01·L-05·R-04 칸), `acceptance.md` AC-001(Then (4) 추가·(5)로 번호 이동)·AC-002(실행 환경 입력, fixture 아홉 가지에서 열다섯 가지로 — (차)~(거) 여섯 추가, 보지 못하는 것), `plan.md` M1. 항목 정의표 I/G 칸의 열거값과 조합 분포는 바꾸지 않았다.
- **감사 범위 기록**: 위 §E.1·§G의 "`c89dae7`까지 감사" 서술을 지우고 "사용자 결정 반영 전 상태, 정확한 피감사 SHA 미확인"으로 통일했다. 근거와 확인한 명령은 §E.1에 적었다. 감사 보고서(`.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-1.md`)·점수 0.88·iteration 1/3은 바꾸지 않았다.

### 5차 수정안 기록 (2026-10-04)

기준은 `b6ee43a`다. review-2(FAIL 0.75, STOP)의 차단 결함 D-01~D-04에 대한 **수정안**이며 재감사를 받지 않았다. **STOP 상태를 유지한다 — 3회차 감사와 run을 시작하지 않았다.** 요구사항·AC 번호와 개수(16/16)는 유지했고 `status`는 `draft`다. 과거 HISTORY와 이전 기록은 보존하고 정정은 이 절과 `spec.md` HISTORY의 5차 항목에만 적는다.

**정정(이력과 맞지 않았던 주장)**: 2차 정밀 교정(`7916728`) 이후 이 SPEC의 `spec.md` HISTORY·`plan.md` 노트와, 위 4차 정렬 교정 기록의 "D-LAUNCH-01~09의 사용자 결정은 바꾸지 않았고"는 D-LAUNCH-07에 대해 사실이 아니었다(결정 기록 문장이 바뀌었다 — 위 "D-LAUNCH-07 후속 변경안"). 4차 정렬 교정 때 결정 기록의 불변 여부를 `c89dae7`과 대조하지 않고 적었다. 이번에는 아홉 결정 문장 전부를 `c89dae7`과 대조했고(D-LAUNCH-07만 달랐다) D-LAUNCH-07을 원문으로 복원해 아홉 건 모두 같다.

- **D-01 (D-LAUNCH-07)**: 결정 문장 복원, 진단 전용 사유 2종은 확인 대기인 후속 변경안으로 분리. `spec.md` D-LAUNCH-07·`plan.md`(§B 행, 노트, M5)·`acceptance.md` AC-014에서 (e)(f)를 사유 목록에서 뺐다.
- **D-02·D-04 (L-08)**: CONSULTOPS-001 D-OPS-04는 03 상담 화면(S2)의 6개 요소에만 적용한다(그 SPEC `spec.md`의 D-OPS-04 절이 (d)(e)(f)를 03 푸터로 정의). S1(01·02 진단 푸터 여섯 요소)은 D-LAUNCH-09와 이 SPEC의 요소별 목적지 기록으로 판정한다. `spec.md` L-08·D-LAUNCH-09 설명·N5, `plan.md` M2, `acceptance.md` AC-015 시나리오 2(fixture 네 가지를 S1 요소 상태와 S2 요소 상태로 다시 짬: S1은 (나)만 BLOCKED, S2는 (가)(다)만 BLOCKED)를 통일했다.
- **D-03 (단계 표와 로컬 시험)**: 단계 표는 운영 호스트의 세 상태만 정의하고, 참여자의 로컬 시험은 별도 "로컬 시험 판정"(시작 조건 다섯 가지, I 서명 규칙)으로 분리했다. `spec.md` §2.4·REQ-B2CLAUNCH-001·008, `acceptance.md` AC-002(fixture 열일곱 가지: 로컬 시험 판정의 양성·음성과 R-02·R-03 필수 fixture 포함)·AC-008(서명 fixture 여덟 가지: 로컬 시험 판정 서명 포함)을 맞췄다. D-LAUNCH-05 (a) "면제 없음"은 그대로 두고, 그 결과로 로컬 시험에도 R-02(엔진 준비 증거)·R-03(확정 동의 문구)이 필수임을 §2.4에 명시했다.
- **함께 정리**: 출력 전용 `해당 없음(local)`과 기록 상태의 구분(`spec.md` §2.4 "실행 환경", AC-003 fixture (바) 추가); AC-001의 벡터 칸 검사를 정규식으로 정의하고 단계 표 세 행이 모두 일치함을 확인; 형제 인용 줄 번호(ENGINE-001 `spec.md`·CONSULTOPS-001 `spec.md`, 13곳)를 형제 파일의 현재 줄로 정정; 사라진 절 제목("첫 내부 시험과 운영 노출의 구분")과 행렬 열 이름("판정 근거"를 ENGINE-001의 "(a) 규칙 근거"로) 정정; `plan.md`의 형제 "미추적 초안" 서술 정정; HISTORY 3차 항목의 끝 문장은 4차 교정에서 일부 고쳐 쓴 것을 원문으로 되돌렸다.

**미확정 사용자 결정(이 수정안이 정하지 않았다 — 만들어 낸 승인이나 역할은 없다)**

1. **확인 대기** — D-LAUNCH-07의 진단 전용 사유 2종 (e)(f)를 사용자 결정으로 확정할지, 폐기할지(현재: 원 결정 복원, 변경안으로만 남음).
2. **확인 대기** — 01·02 푸터 요소별 목적지 기록의 소유를 LAUNCH(L-08 S1 부분)가 받는 것이 의도와 같은지(N5, CONSULTOPS-001과의 소유 경계).
3. **확인 대기** — 로컬 시험 판정에 I 서명이 필요한지, 필요하면 서명자가 D-LAUNCH-04 (c)의 세 역할(제품 책임자·운영 책임자·법무) 전부인지. 이 수정안은 이전 단계 표가 로컬 첫 시험에 적용하던 "I 열 필수 항목 `READY` + I 서명" 규칙을 옮겨 적었을 뿐 서명자 구성은 정하지 않았다.
4. **확인 권장(결정 변경 아님)** — D-LAUNCH-05 (a)를 그대로 두고 운영 한정 항목을 지시된 L-01·L-05·R-04 셋으로만 한정한 결과, 로컬 첫 진단 시험에도 R-02(엔진 준비 증거)·R-03(확정 동의 문구)과 운영 한정이 아닌 L-02·L-03·L-04·L-06·L-07·L-08(S1 요소)·L-09가 필수가 되는 것이 의도한 결과인지. 특히 롤백 항목(L-06·L-07)과 사후 관측 계획(L-09)이 노출 확대 없는 로컬 시험에 적용되는 것이 맞는지 확인이 필요하다.
5. **확인 권장(파생 경계)** — `local`로 단계(I·G)를 점검하는 입력을 거부하는 규칙, 그리고 로컬에서 첫 표면(S1) 밖을 열 때 그 표면의 항목을 같은 판정에 더하는 규칙이 의도와 같은지.

**잔여 선택 결함(review-2, 이번에 손대지 않음)**: D-05(출력 표지 서술, 위에서 일부 정리), D-06(production 내부 시험 경로와 D-LAUNCH-01 (e)의 연결, §2.4 단계 표 행에서 일부 정리), D-07 중 DIAGNOSIS-001 인용(`spec.md:104`, `plan.md:26,69`는 대조 결과 유효), D-09의 "사고 유형 grep 0건" 서술(과거 HISTORY, 보존), D-11(REQ-002의 복합 서술), D-14(1회차 D1 AC-012 주석 필터 서술), D-15(SPEC ID 정규식, 프로젝트 공통), N2·N3 현황 서술의 낡은 문장(`CONSULTOPS-001` D-OPS-12·D-OPS-10 결정을 "확인하지 못했다/대기"로 적은 곳), `결정 대기` 칸이 D-LAUNCH-05 (a)·D-LAUNCH-09 결정 뒤에도 값으로 남아 있는 것(정의상 `필수`와 같게 취급되어 동작 충돌은 없음).

### 6차 교정 기록 (2026-10-04)

기준은 `a0e0ee2`(원격 `origin/plan/b2c-launch-readiness`와 같음을 시작 전에 확인했다)다. 잔여 모순 **2건만** 교정했다. **공식 감사 결과 FAIL 0.75·STOP은 유지되고 이 교정은 재감사를 받지 않았으며 감사 PASS가 아니다 — 3회차 plan-auditor와 `/moai run`을 시작하지 않았다.** ENGINE-001·CONSULTOPS-001의 감사 이력은 바꾸지 않았다. 기존 사용자 결정과 위 5차 기록의 미확정 사항은 그대로이고 새 결정 인터뷰나 승인 기록을 만들지 않았다. 요구사항·AC 번호와 개수(16/16)는 유지했고 `status`는 `draft`다. 과거 HISTORY와 이전 기록(5차 기록의 fixture "열일곱 가지"·"여덟 가지" 포함)은 그 시점의 기록이라 보존하고 정정은 이 절과 `spec.md` HISTORY의 6차 항목에만 적는다.

**문제 1 — 점검 요청의 입력 계약 (변경 전 → 후)**

- 변경 전: `spec.md` §2.4는 `local`로 운영 단계(I·G)를 점검하면 거부한다고 적었다. 그런데 `acceptance.md` AC-002의 When은 **모든 fixture에 목적 단계 I 또는 G를 지정**했고, 같은 AC가 `local` 양성 fixture (차)를 통과시켰다 — 즉 같은 계약에서 `local` + 목적 단계 I 입력이 통과 대상이면서 거부 대상이었다. `local` + 목적 단계 I를 거부하는 fixture는 없었고((거)는 `local` + G뿐), `production`에 목적 단계가 없는 요청의 처리도 정의되지 않았다.
- 변경 후: `spec.md` §2.4에 "점검 요청의 두 형태"를 정의했다. **운영 단계 점검** = 실행 환경 `production` + 목적 단계 `I` 또는 `G`(필수). **로컬 시험 판정** = 실행 환경 `local` + 목적 단계 입력 없음 — 판정 규칙이 I 열의 필수 항목 목록을 **재사용해 읽는 것**이며 운영 단계 I를 점검하는 것이 아니다. 거부 조합은 (i) 실행 환경 없음·열거 밖 (ii) `local` + `I` (iii) `local` + `G` (iv) `production` + 목적 단계 없음·열거 밖이다. 실행 환경이 점검 종류를 정하고 목적 단계 칸이 종류와 맞아야 하므로 별도의 "종류" 입력은 두지 않았다. 서명 기록의 실행 환경도 요청 형태와 같아야 한다(운영 단계 점검 = `production`, 로컬 시험 판정 = `local`).
- 맞춘 곳: `spec.md` §2.4(실행 환경 항목의 모순 문장, "점검 요청의 두 형태" 신설, 단계 표 판정 칸 두 곳, 로컬 시험 판정의 입력 형태·시작 조건 (4)·서명 규칙·구분 항목), REQ-B2CLAUNCH-002·008, `acceptance.md` AC-001 (4)·AC-002·AC-008, `plan.md` M1 산출·TDD. AC-002 fixture는 **열일곱 → 열아홉 가지**((러) `local` + 목적 단계 `I`, (머) `production` + 목적 단계 없음 추가, 모든 fixture에 [운영]·[로컬]·[형태 오류] 꼬리표), AC-008 fixture는 **여덟 → 열 가지**((자) 운영 단계 점검에 `local` 서명만 있음, (차) 로컬 시험 판정에 `production` 서명만 있음 추가)다.
- 바꾸지 않은 것: 운영 한정 항목은 L-01·L-05·R-04 셋, R-02·R-03의 로컬 필수 규칙(D-LAUNCH-05 (a) "면제 없음"의 현재 결과), 출력 전용 `해당 없음(local)`과 기록 상태의 구분, 로컬 시험 판정의 시작 조건 다섯 가지와 I 서명 규칙, 서명 관련 확인 대기(위 5차 기록 3번), 항목 정의표 14행과 I·G 칸 값.
- 이것은 지시된 계약 구분을 이행하기 위한 파생 설계이며 새 사용자 결정이 아니다. 요청 형태를 실행 환경으로 정하는 방식과 `local` + 목적 단계 거부 규칙이 의도와 같은지는 위 5차 기록 5번(확인 권장)으로 계속 남는다.

**문제 2 — 재개 안내와 차단 단계 구분 (변경 전 → 후)**

- 변경 전: `external-confirmations-20261004.md`는 [R]이 해당 마일스톤·AC만 막고 착수를 막지 않는다고 정의했다. 그러나 `RESUME.md`의 §4 2·3번, §5 마지막 문장, §9 "재개 순서(갱신)"와 복사용 재개 메시지는 외부 확인 항목과 미확정 결정을 **전부 처리해야** Implementation Kickoff Approval로 넘어가는 것으로 읽혔다. 외부 확인 문서의 D-LAUNCH-07 행은 미승인 제안인 (e)(f)가 "M5의 L-06 사유 목록 확정"을 막는 것으로 적었고(원 결정의 기본 4종으로 AC-B2CLAUNCH-014는 판정 가능하다), ENGINE-001의 N8을 SPEC 근거 없이 [K]로 분류했다.
- 변경 후: 착수 전에 확인하는 것은 **LAUNCH STOP 처리 선택과 [K] 항목**이다(각 SPEC `plan.md` §C Pre-flight 6항목과 SPEC이 "Implementation Kickoff Approval 시 확인"으로 적은 항목). [R]·[I-local]·[I-production]·[G] 항목은 각 차단 시점까지 미결 상태와 담당·처리 계획을 관리할 수 있다. 실제로 착수에 영향을 주는 미확정 설계 사항은 근거와 차단 범위를 따로 적었다(`external-confirmations-20261004.md` "차단 종류와 Kickoff 전제"). 새 절 `RESUME.md` §10이 정정과 현재 안내와 갱신 재개 메시지를 담고, §4·§9의 해당 문장은 보존한 채 §10으로 대체됐음을 표시했다.
- D-LAUNCH-07: 원 결정(2026-10-03, 기본 4종·선언 (iii)·실행 (1))이 L-06·M5·AC-B2CLAUNCH-014의 유효한 기준이다. 추가 사유 (e)(f)의 승인 대기는 이 셋 중 어느 것도 막지 않으며 승인되면 사유 목록과 AC를 갱신하는 후속 변경이다(`spec.md`·`plan.md`·`acceptance.md`에 명시).

**미확정 사용자 결정(상태 불변 — 이 교정이 정하지 않았다. 차단 범위만 구분해 적었다)**

1. 확인 대기 — (e)(f) 확정·폐기. 차단 없음(L-06·M5·AC-B2CLAUNCH-014는 기본 4종 기준).
2. 확인 대기 — 01·02 푸터 요소별 목적지 기록의 소유(N5). `plan.md` M2 선행이므로 M2 진입 전에 필요하고 착수는 막지 않는다.
3. 확인 대기 — 로컬 시험 판정의 I 서명 필요 여부와 서명자 구성. 로컬 시험 시작([I-local])과 AC-B2CLAUNCH-008 (마)(바)(사)의 서명자 부분을 막고 착수는 막지 않는다.
4. 확인 권장 — 로컬 첫 시험에도 L-06·L-07·L-09 등이 필수가 되는 결과가 의도한 것인지. 차단 없음. 의도와 다르면 §2.4와 AC-B2CLAUNCH-002 fixture를 고쳐야 하고 그 fixture가 M1의 RED 입력이므로 M1 전에 확인하면 재작업을 피한다.
5. 확인 권장 — `local` + 목적 단계 거부 규칙과 로컬에서 첫 표면 밖을 열 때의 항목 추가 규칙, 요청 형태를 실행 환경으로 정하는 방식. 차단 없음. 4번과 같은 이유로 M1 전 확인을 권한다.

**실행한 검증(6차 교정 뒤, 이 교정을 쓴 세션이 직접 실행)** — 문서 구조 검사다. 점검기·하네스 시험(`scripts/check-launch-gate.ts` 등)은 아직 구현되지 않아 실행하지 않았고 통과했다고 주장하지 않는다.

- REQ 16개·AC 16개, AC n ↔ REQ n 대응 16건 중 불일치 0, `status: draft`.
- `spec.md` §2.4 항목 정의표 14행(L-01~L-09, R-01~R-05): 행마다 필드 9(칸 7), 빈 칸 0, I·G 칸 값이 `필수`·`결정 대기`·`해당 없음` 안(열거 밖 0), 마지막 칸의 ` / ` 구분자가 정확히 1개인 행 14, I/G 조합 분포(`필수/필수` 8, `결정 대기/필수` 2, `필수/해당 없음` 1, `필수/결정 대기` 1, `해당 없음/결정 대기` 1, `결정 대기/결정 대기` 1)는 AC-002의 기록과 같다.
- 운영 단계 표 3행: 행마다 필드 7(칸 5), 빈 칸 0, 벡터 칸 세 개가 AC-001의 정규식에 3/3 일치, 판정 칸 두 곳이 운영 단계 점검 입력(`production` + 목적 단계)을 가리킨다.
- AC-002 fixture 열아홉 가지: Given의 목록과 Then의 기대 결과 집합이 정확히 같고 중복이 없다. 종료 코드 0은 (가)(바)(사)(차) 넷, 0이 아닌 것은 열다섯이다. 요청 형태 꼬리표는 [운영] 열 가지((가)~(자) 아홉과 (카)), [로컬] 네 가지((차)(타)(너)(더)), [형태 오류] 다섯 가지((파)(하)(거)(러)(머))다. 정상 로컬 판정 (차)는 목적 단계를 담지 않고, (차)와 같은 기록에 목적 단계 `I`를 더한 (러)와 `local` + `G`인 (거)는 거부된다. §2.4의 거부 조합 네 가지(실행 환경 오류, `local` + `I`, `local` + `G`, `production` + 목적 단계 없음)에 모두 fixture가 하나 이상 있다.
- AC-008 fixture 열 가지: 통과 (가)(마) 둘, 거부 여덟((나)(다)(라)(바)(사)(아)(자)(차)).
- 표 열 구조: 여섯 문서의 모든 표가 헤더와 같은 칸 수다(`\|` 이스케이프는 정규화해 계산했다. 처음에 쓴 awk 치환은 이 환경에서 `\|`를 바꾸지 못해 `spec.md`의 LF-16·LF-17 행을 잘못 불일치로 표시했고, 같은 두 행은 `b6ee43a`·`a0e0ee2`와 글자까지 같아 이번 변경과 무관하다 — bash 문자열 치환으로 다시 세어 불일치 0을 확인했다).
- 기존 결정 불변: D-LAUNCH-01~09 결정 문장 아홉 줄이 `c89dae7`과 일치, L-06 행에 (e)(f) 없음, 운영 한정 항목은 L-01·L-05·R-04 셋.
- `RESUME.md` §10의 [K]/[R]/[I-local]/[I-production]/[G] 표와 외부 확인 문서의 정의가 서로 대응하고, "① 외부 확인·계획 마무리"라는 낡은 표현은 보존·대체 표시가 붙은 과거 기록과 정정 인용에만 남는다. 각 SPEC `plan.md` §C Pre-flight는 ENGINE 0/6, CONSULTOPS 1/6, LAUNCH 0/6이다.
- 변경은 이 SPEC 문서 4개와 보고서 2개뿐이다(응용 코드·워크플로·다른 SPEC·운영 DB·플래그·main 불변). 추가한 줄에서 시크릿·개인정보 패턴 일치는 없다.

**보지 못한 것**: 서술의 의미 품질은 사람의 읽기와 재감사가 판단한다(plan-auditor는 돌리지 않았다). fixture는 정의만 바꿨고 실행하지 않았다.

STOP 신호의 처리 선택(범위 축소·PASS-with-debt·명시적 예외 중 하나)은 사용자가 정하며 이 SPEC의 Kickoff 전 확인 대상이다. 이 교정은 그 선택을 대신 내리지 않았다.

### 7차 교정 기록 (2026-10-04)

기준은 `53c6954`(원격 `origin/plan/b2c-launch-readiness`와 같음을 시작 전에 확인했다)다. 승인 순서의 순환 표현 **1건만** 교정했다. **공식 감사 결과 FAIL 0.75·STOP은 유지되고 이 교정은 재감사를 받지 않았으며 감사 PASS가 아니다. 점검기·하네스 등 구현이 아직 없어 구현 시험도 실행하지 않았고 PASS를 주장하지 않는다. 3회차 plan-auditor와 `/moai run`을 시작하지 않았고, 실제 사용자 승인(Implementation Kickoff Approval) 없이 어떤 "승인 완료"도 체크하지 않았다.** ENGINE-001·CONSULTOPS-001의 감사 이력, 기존 사용자 결정, 로컬 입력 계약("점검 요청의 두 형태"), [R]·[I-local]·[I-production]·[G] 차단 구분, 미확정 사용자 결정 5건의 상태, 각 SPEC `plan.md` §C의 문구와 체크 상태는 바꾸지 않았다. 과거 기록(위 6차 기록 포함)은 보존하고 정정은 이 절에만 적는다.

**순환 표현 (변경 전 → 후)**

- 변경 전: `RESUME.md` §10의 [K] 표 행·재개 순서·복사용 메시지와 `external-confirmations-20261004.md`의 [K] 정의(그리고 위 6차 기록의 "착수 전에 확인하는 것은 LAUNCH STOP 처리 선택과 [K] 항목이다(각 SPEC `plan.md` §C Pre-flight 6항목과 …)")가 각 SPEC Pre-flight 6항목 전체를 승인 전에 확인할 항목으로 적었다. Pre-flight에는 "Implementation Kickoff Approval 완료"가 들어 있어, 승인 완료를 승인 전에 요구하는 순환으로 읽혔다. Pre-flight 점검표 전체와 승인 전 확인이 같은 말로 서술됐다.
- 변경 후: [K]를 시점별로 나눴다. **[K-전] 승인 전에 확인**: LAUNCH STOP 처리 선택, 상태·기록 읽기(작업 트리·divergence, 동시 세션, 결정 기록 존재), "plan-auditor PASS"의 감사 판정 부분, LAUNCH design 경로 판단. **[K-시] 승인 시 결정·확인**: LAUNCH의 진행 모드 축·N9 커밋 경로, ENGINE의 §9.1·§9.2·서명 토큰 형태. **[K-후] 승인 뒤에 완료를 확인**: "Implementation Kickoff Approval 완료"(실제 사용자 승인 뒤에만 체크하며, 승인 전 미체크 상태는 정상이고 승인 절차에 들어가는 것을 막는 조건이 아니다), 직전 기준선 기록, 운영 접근 제한. Pre-flight 점검표 전체(run-phase 시작 점검표)와 승인 전 확인([K-전])을 다른 범위로 서술했다. 순서는 승인 전 확인 → 실제 승인 → 승인 완료 체크 → `/moai run` Phase 1 Plan Audit Gate → 구현이다.
- 맞춘 곳: `external-confirmations-20261004.md`(제목·도입, 착수 전 확인 범위, [K] 정의, K 표의 시점 열·근거, ENGINE·LAUNCH 행의 표지, 역할별 요약, §6), `RESUME.md` §11 신설과 §10의 [K] 표·재개 순서·복사용 메시지에 대체 표시. 이 SPEC의 `spec.md`·`plan.md`·`acceptance.md`와 ENGINE·CONSULTOPS 문서는 바꾸지 않았다.
- 가정(확인 권장): 분류는 `plan.md` §C·§B 문구의 시점 표현("직전", "승인 때 정한다", "Implementation Kickoff Approval 시 확인한다", "사용자의 별도 지시가 있을 때만")을 읽어 나눈 것이다. 기준선 기록과 운영 접근 제한을 [K-후]로, 작업 트리·동시 세션·결정 기록 존재를 [K-전]으로 읽은 것은 문구에서 따라 나온 해석이며 사용자 결정이 아니다 — 다르게 읽어야 하면 지시해 달라.

**실행한 검증(7차 교정 뒤, 이 교정을 쓴 세션이 직접 실행)** — 문서 대조이며 구현 시험이 아니다. 점검기·하네스(`scripts/check-launch-gate.ts`, `lib/launch/`)는 아직 존재하지 않아 실행하지 않았고 통과했다고 주장하지 않는다. 문서 교정은 감사 PASS도 아니다.

- 승인 순서 대조: `RESUME.md` §11 본문의 재개 순서, §11 복사용 메시지, `external-confirmations-20261004.md`의 [K] 정의, 이 기록이 모두 승인 전 확인 → 실제 승인 → 승인 완료 체크 → `/moai run` Phase 1 Plan Audit Gate → 구현의 순서이고, "승인 완료는 실제 승인 뒤에만 체크하며 승인 전 미체크는 정상이고 승인 절차에 들어가는 것을 막지 않는다"는 문장이 세 문서에 각각 있다. 복사용 메시지의 전제 검증은 3개다(상한 4).
- 순환 표현 잔존: 현재 안내(external-confirmations, `RESUME.md` §11)에서 Pre-flight 6항목은 "점검표 전체"로만 서술되고 승인 선결로 묶이지 않는다. 옛 서술("[K] 항목을 확인한다", 표의 "필요 — … Pre-flight 6항목")은 §10 안의 보존·대체 표시된 기록과 §11의 정정 인용에만 남는다. external-confirmations의 `[K]` 단독 표지는 정의 머리글 하나뿐이고 표·행은 [K-전]·[K-시]를 쓴다.
- 불변: 각 SPEC `plan.md` §C 체크 상태 ENGINE 0/6·CONSULTOPS 1/6·LAUNCH 0/6(체크된 "Implementation Kickoff Approval 완료" 0건), 이 SPEC의 `spec.md`·`plan.md`·`acceptance.md`와 ENGINE·CONSULTOPS 문서의 diff 없음, D-LAUNCH 결정 아홉 줄이 `c89dae7`과 일치, [R]·[I-local]·[I-production]·[G] 정의 줄이 변경 전과 바이트 단위로 같음.
- 과거 기록 보존: 이 파일에서 삭제된 줄 0. `RESUME.md`는 §10의 세 줄에 대체 표시만 끼웠고 원문 단어는 지워지지 않았다(단어 단위 비교의 삭제 토큰 2개는 닫는 굵은 글씨 표시 `**:`가 표시 뒤로 밀린 것뿐이다). `external-confirmations-20261004.md`는 판마다 갱신해 온 정리 문서라 해당 부분을 직접 고쳤다(삭제 12줄, 모두 의도한 줄).
- 표 구조: 세 문서의 모든 표가 헤더와 같은 칸 수이고, external-confirmations의 K 표는 4행×4칸, `RESUME.md` §11 표는 3행×3칸이다.
- 변경 범위: 3개 파일뿐이고(응용 코드·워크플로·다른 SPEC·운영 DB·플래그·main 불변) 추가한 줄에서 시크릿·개인정보 패턴 일치는 없다.

**보지 못한 것**: 시점 분류의 타당성은 사람의 판단이다(특히 기준선 기록·운영 접근 제한을 [K-후]로, 작업 트리·동시 세션·결정 기록 존재를 [K-전]으로 읽은 것). 서술의 의미 품질은 재감사를 받지 않았다.

### STOP 처리 선택 기록 (2026-10-04, `ad63049` 기준)

**선택 확인**: 사용자가 STOP 처리 방식으로 **"① 범위 축소 확정 후 재감사"**를 선택했다(날짜 2026-10-04, 출처 이 세션의 사용자 응답, 결정 주체 사용자). 제시한 선택지는 ① 범위 축소 확정 후 재감사, ② PASS-with-debt 수용, ③ 명시적 예외로 3회차 감사였다. 같은 선택은 다시 묻지 않는다. **이 선택은 Implementation Kickoff Approval이 아니다** — 승인은 별도 게이트로 남아 있고 어떤 SPEC의 "Implementation Kickoff Approval 완료"도 체크하지 않았다.

**선택 확인과 재감사의 구분**: 이 기록을 쓰는 시점에 **3회차 plan-auditor 감사는 아직 수행하지 않았다.** 감사는 이 기록을 커밋한 뒤에 시작하고, 결과는 `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-3.md`와 이 파일의 §G 3/3 행, 별도 기록으로만 적는다. 공식 감사 결과는 이 시점에도 2회차 FAIL 0.75·STOP이며 이 기록은 감사 PASS가 아니다. `plan_status`는 `draft`다. 피감사 커밋은 이 기록을 담은 커밋이다(커밋은 자기 SHA를 적을 수 없어 SHA는 감사 보고서와 다음 기록에 둔다).

**확정한 축소 범위**: review-2의 범위 축소 제안 (a)(b)(c)를 그대로 채택한다. 추가 분리·추가 삭제는 하지 않고 LAUNCH-001은 한 SPEC(Tier M, 요구사항·AC 16/16)으로 유지한다. 제안과 현재 문서의 대조는 다음과 같다(이 세션이 직접 확인한 증거).

| 제안 | 현재 문서의 근거 | 판정 |
|---|---|---|
| (a) 운영 단계 3개와 로컬 시험 판정 분리 | `spec.md` §2.4 단계 표 3행(배포 완료(dark), 내부 시험 공개, 일반 사용자 공개)이고 `local` 형태 행은 없다. "로컬 시험 판정"(단계가 아님)과 "점검 요청의 두 형태"가 §2.4에 있고, REQ-B2CLAUNCH-002·008이 로컬 판정의 게이트(I 서명이 없으면 시작 안내 금지)를 적는다. AC-B2CLAUNCH-008에 [로컬] fixture가 있다 | 반영됨 (5차 `26a8d3e`, 6차 `0cd8a55`) |
| (b) S1의 D-OPS-04 의존 제거, S2 전용 유지 | L-08 행이 S1은 D-LAUNCH-09와 LAUNCH 소유 요소별 기록으로만 판정하고 D-OPS-04의 확정 여부와 무관하다고 적고 S2는 D-OPS-04 6요소로 판정한다. D-LAUNCH-09 교차 참조 문단, plan M2, AC-B2CLAUNCH-015 시나리오 2(S1은 (나)만, S2는 (가)(다)만 BLOCKED)가 같은 규칙이다. review-2 D-04가 지적한 낡은 문장은 0건이다. CONSULTOPS `spec.md`의 D-OPS-04 절은 03 계열 6요소로 정의돼 있다 | 반영됨 (5차) |
| (c) D-LAUNCH-07 원 결정 복원, 추가 2종은 미승인 제안으로 유지 | D-LAUNCH-01~09 결정 문장 아홉 줄이 `c89dae7`과 일치한다. L-06 사유 목록에 (e)(f)는 없다. (e)(f)는 "확인 대기 — 결정이 아니다" 후속 변경안으로 `spec.md` D-LAUNCH-07 절, `plan.md` M5 유의, `acceptance.md` AC-B2CLAUNCH-014, 이 파일에 남아 있고 L-06·M5·AC-014를 막지 않는다 | 반영됨, 단서 있음 |

(c)의 단서: review-2의 필수 수정은 (a) 별도 결정 기록을 적거나 (b) (e)(f)를 본문에서 모두 제거하는 것이었다. 현재는 사유 목록에서 제외하고 미승인 제안으로 남긴 상태라 (b)를 문자 그대로 이행한 것은 아니다. 사용자가 "미승인 제안으로 유지"를 지시했으므로 이 상태를 유지하며, 충족 여부는 재감사가 판정한다.

**이 기록에서 고치지 않은 것**: 이미 반영된 부분은 다시 고치지 않았고 `spec.md`·`plan.md`·`acceptance.md`는 이 기록에서 바꾸지 않았다 — 재감사의 입력 산출물은 5·6·7차 반영본(`ad63049`) 그대로다.

**잔여 사항**(재감사 입력으로 남긴다. 이 기록은 해소 판정을 하지 않는다):

- review-2 선택 결함 D-05~D-15: 5차 기록 기준으로 대응 4건(D-08, D-10, D-12, D-13), 일부 대응 4건(D-05, D-06, D-07, D-09), 손대지 않음 3건(D-11, D-14, D-15)이다. 6차에서 REQ-002에 문장이 더해져 D-11이 지적한 복합 서술은 더 길어졌다. 해소 여부는 재감사가 판정한다.
- 열린 확인 사항 N1~N11과 미확정 사용자 결정 5건(위 6차 기록, `RESUME.md` §11): 상태 불변.
- 승인 전·승인 시 항목: STOP 처리는 선택 확인됨(재감사 결과 대기), 진행 모드 축·N9 커밋 경로는 승인 시 결정, design 경로는 run 진입 전 판단.
- ENGINE-001·CONSULTOPS-001의 감사 이력과 미확정 사항은 바꾸지 않았다. 기존 결정 32건은 다시 묻지 않았다.

**3회차 감사 후 보충 (2026-10-04)**: 3회차 결과는 §G 3/3 행이 공식 기록이다(PASS 0.81, 여유 얇음). D-22(감사관이 (c)의 선택 출처를 불명확하다고 지적)에 대해 사실만 적는다: "D-LAUNCH-07 원 결정 복원, 추가 2종은 미승인 제안으로 유지"는 사용자가 이 재감사 요청 메시지에서 (c)로 직접 적은 문장이다. 다만 이것은 (e)(f)의 승인·폐기 결정이 아니라 현 상태 유지 지시다. review-2가 요구한 "날짜·결정 주체가 있는 결정 기록 또는 본문 제거"는 이행되지 않았으므로 U1(승인 또는 폐기)은 사용자 확인 대기로 남는다. 감사 후 spec/plan/acceptance는 바꾸지 않았다.

### 후속 기록 교정 (2026-10-04, `e5742b4` 기준 — 감사 규칙 해석 차이·복사용 메시지 오류·미확정 항목 시점 구분)

앞 기록은 그대로 두고 아래만 덧붙인다. 원 감사 보고서(`review-3.md`), 점수 0.81, 판정 PASS와 `spec.md`·`plan.md`·`acceptance.md`는 바꾸지 않았다. 새 감사, 자동 4회차, `/moai run`은 시작하지 않았다. 이 기록은 사용자가 고른 "범위 축소 확정 후 재감사"를 PASS-with-debt 수용이나 Kickoff 승인으로 바꾸지 않는다.

**1. 감사 규칙 원문과 보고서 해석의 차이 (미해결 — 사용자 선택 대기)**

| 구분 | 내용 | 출처 |
|---|---|---|
| 규칙 원문 | "Unresolved defects from a prior iteration are automatically FAIL regardless of other scores." 이전 회차 미해소 결함의 자동 FAIL에서 선택(optional) 결함을 제외하는 문구는 이 문장에 없다 | `.claude/agents/moai/plan-auditor.md:408` |
| 같은 규칙의 결함 분류 | 결함을 blocking과 optional로 나누고 "A long list of optional findings does not by itself justify a FAIL"이라고 적는다. 이월된 선택 결함이 :408의 자동 FAIL에 걸리는지는 적지 않았다 | 같은 파일 `:155-162` (M6) |
| 보고서 해석 | "Per the review-2 precedent (carried optional items do not cause FAIL), the unresolved optional items do not trigger the auto-FAIL clause, which applies to blocking defects." 근거로 규칙 원문이 아니라 review-2 선례를 들었다 | `review-3.md:79` |
| 인용된 선례의 실제 범위 | review-2는 이월 선택 결함(D-14·D-15)에 대해 "Neither carried item is blocking, and neither caused this FAIL"이라고 적었다. 그 회차의 FAIL은 차단 결함 D-01~D-04에서 나왔다. 따라서 이 문장은 그 FAIL의 원인 설명이고, 이월 선택 결함이 자동 FAIL 조항에서 제외된다고 판정한 기록으로 읽히지 않는다(이 기록의 읽기이며 감사관 판정이 아니다) | `review-2.md:3`, `:227` |

- **이 차이가 걸리는 결함**: 3회차 보고서가 미해소로 적은 D-11, D-14, D-15(`review-3.md:79`). 일부 해소로 적은 D-06, D-09도 문자 그대로 읽으면 같은 쟁점에 놓일 수 있으나, 감사관이 이 둘을 미해소로 판정하지는 않았다.
- **두 읽기의 결과**: 규칙 원문을 문자 그대로 읽으면 3회차가 자동 FAIL 조항에 걸릴 수 있고, 보고서 해석대로 읽으면 PASS다. 어느 쪽이 맞는지는 이 기록이 정하지 않는다. 공식 판정은 `review-3.md`의 PASS 0.81 그대로다.
- **하지 않은 것**: PASS를 FAIL로 바꾸지 않았고 PASS를 확정하지도 않았다. 공통 감사 규칙(`plan-auditor.md`)과 원 보고서·점수·판정을 수정하지 않았다.
- **3회 소진 후 필요한 사용자 선택**: 3회차는 최종 회차라 자동 4회차는 없다. 이 차이를 어떻게 다룰지는 사용자가 정한다. 아래는 선택지이며 결정이 아니고 이 기록이 고르지 않는다. (가) 보고서의 PASS를 공식 판정으로 두고 진행하며 규칙 문구 확인은 별도로 맡긴다. (나) 규칙 원문대로 읽어 3회차를 FAIL 사유가 있는 최종 회차로 보고, PASS-with-debt 수용 또는 사용자의 명시적 예외로 처리한다. (다) 공통 감사 규칙의 문구 정정이나 해석 명시를 이 SPEC 작업과 별도로 요청한다. (다)는 (가)나 (나)와 함께 고를 수 있다. 앞서 고른 "범위 축소 확정 후 재감사"는 STOP 처리 선택이었고 이 선택이 아니다.

**2. `RESUME.md` §13 복사용 메시지 오류 정정**

- **변경 전** (`RESUME.md` §13 복사용 메시지 전제 3): "(보고서는 gitignored라 같은 worktree에서만 보인다)"
- **사실**: `.gitignore:210`의 `.moai/reports/plan-audit/*.md` 규칙이 이 경로를 가리키지만, review-3은 `e5742b4`로 커밋된 추적 파일이다(`git ls-files`와 `git ls-tree origin/plan/b2c-launch-readiness`로 확인). 같은 폴더의 다른 보고서(LAUNCH review-1·2, ENGINE, CONSULTOPS 등)도 추적된다. 다른 PC도 fetch·checkout으로 받을 수 있다.
- **변경 후**: `RESUME.md` §14의 복사용 메시지는 `git ls-files --error-unmatch`로 추적 여부를 확인하고 "커밋된 추적 파일이라 다른 PC도 fetch·checkout으로 받는다"고 적는다. §13의 원문은 `[SUPERSEDED by §14]` 표시와 함께 보존했다.
- **확인하지 않은 것**: ignore 규칙이 있는 폴더에 새 보고서를 추가할 때 일반 `git add`가 거부되는지는 이 세션에서 시험하지 않았다.

**3. 미확정 사항의 공유와 해결 시점 구분**

U1~U5·N1~N11을 승인 전에 사용자에게 현황으로 공유하는 것과 전부 해결해야 Kickoff에 들어갈 수 있다는 것은 다르다. 해결 시점은 기존 K/R/I-local/I-production/G 분류(`external-confirmations-20261004.md`)를 따르며, 시점별 표와 §13 대체 안내는 `RESUME.md` §14에 있다. 그 분류에 행이 없는 N2는 이 기록이 임의로 분류하지 않았다.

### PASS-with-debt 수용 선택 기록 (2026-10-04, `2b8a3aa` 기준)

**선택 확인**: 사용자가 이 세션에서 `AskUserQuestion`으로 제시한 질문("LAUNCH-001이 plan-auditor 3회를 모두 소진했습니다(PASS 0.81). 미해소 선택 결함과 감사 규칙 해석 차이를 debt로 남긴 채 PASS-with-debt로 수용할까요?")에 **"debt로 유지하고 수용 (권장)"**을 골랐다(날짜 2026-10-04, 출처 이 세션의 `AskUserQuestion` 응답, 결정 주체 사용자. 이 세션의 로그는 `.moai/logs/`에 untracked로만 있고 커밋하지 않았으므로, 원격 검토자가 볼 수 있는 근거는 이 기록이다). 제시한 선택지는 (1) debt로 유지하고 수용, (2) 수용하지 않음(규칙 원문대로), (3) 보류(규칙 문구 확인 먼저)였다. "(권장)" 표시는 정적 기본값이었고 관측에 근거하지 않는다고 질문에서 밝혔다.

**질문 전 상태 (검색 결과이며 사용자 응답이 아니다)**: 이 질문을 올리기 전에 `progress.md`·`RESUME.md`를 검색했을 때 LAUNCH-001의 PASS-with-debt 수용 기록은 없었고, 있던 선택은 STOP 처리인 "범위 축소 확정 후 재감사"뿐이었다. 이 검색 결과는 수용의 근거가 아니다. 수용의 근거는 위 사용자 응답 하나다.

**수용한 debt (해소가 아니다 — 아래 상태는 `review-3.md` 기준 그대로다)**

| 구분 | 항목 | 상태 | 위치 |
|---|---|---|---|
| 미해소 선택 | D-11 REQ-002 복합 서술 | 미해소(이번 개정으로 더 길어짐) | `spec.md:197` |
| 미해소 선택 | D-14 AC-012 주석 필터 문구(1회차 D1 이월) | 미해소 | `acceptance.md:104` |
| 미해소 선택 | D-15 SPEC ID 정규식과 SSOT 불일치(1회차 D2 이월) | 미해소, 이 SPEC 범위 밖 | `spec.md:2` |
| 일부 해소 | D-06 `production`+I 점검기 계약이 D-LAUNCH-01 결정과 묶이지 않음 | 서술만 있고 절차 근거 없음 | `spec.md:138` |
| 일부 해소 | D-09 HISTORY의 "사고 유형 … grep 0건" 서술 | 문자 그대로는 여전히 거짓 | `spec.md:22` |
| 신규 선택 | D-16 로컬 시작 조건 (2)의 이중 해석 | 열림 | `spec.md:142` |
| 신규 선택 | D-17 로컬 판정에서 L-02·L-08(S1)의 READY 규칙 미정의 | 열림, U4와 함께 | `spec.md:144`, `:174`, `:207` |
| 신규 선택 | D-18 §2.5와 §2.4의 R-02·R-03 서술 | 열림 | `spec.md:187`, `:144` |
| 신규 선택 | D-19 S2의 G 판정 근거(D-LAUNCH-09 G (1)과 D-OPS-04) 불명 | 열림 | `spec.md:174`, `acceptance.md:130-133` |
| 신규 선택 | D-20 N2 현황 서술과 R-01 행 모순 | 열림 | `spec.md:243`, `:176` |
| 신규 선택 | D-21 fixture 공백과 AC-008 선결 문구 | 열림 | `acceptance.md:23-25`, `:64` |
| 신규 선택 | D-22 (c) 선택 출처의 표현 | 열림, 오케스트레이터 몫(U1) | `progress.md`, `RESUME.md` |
| 해소된 차단 결함의 선택 잔여 | D-01 (e)(f) 제안문, D-03 REQ 수준의 로컬 시작 조건 연결, D-07 `progress.md`의 낡은 줄 번호, D-08 REQ-001 어휘 | 선택 잔여로 열림 | `spec.md:306` 외 |
| 규칙 해석 | `plan-auditor.md:408`과 `review-3.md:79`의 해석 차이 | **해석을 정하지 않은 채 유지.** 이 수용은 어느 해석에도 맞는 처리이지 한쪽 해석의 선택이 아니다 | 위 "후속 기록 교정" 1번 |

**수용의 조건** (질문에서 제시한 그대로): debt는 목록과 근거를 남기고 해소로 처리하지 않는다. 원 보고서의 PASS 0.81과 점수는 바꾸지 않는다. 수용은 Kickoff 승인이 아니다. 자동 4회차 감사는 없고 `/moai run`·운영 변경·`main` 병합은 시작하지 않는다.

**이 선택이 의미하지 않는 것**

- **Kickoff 승인이 아니다.** 세 SPEC의 "Implementation Kickoff Approval 완료"는 `[ ]` 미체크이고, 진행 모드 축과 N9 커밋 경로는 승인 때 정한다.
- **결함 해소가 아니다.** 위 debt는 모두 열려 있다.
- **감사 규칙 해석의 확정이 아니다.** 공통 감사 규칙의 문구 정정을 별도로 요청하는 선택지는 고르지도 요청하지도 않았다.
- **U1~U5·N1~N11의 해결이 아니다.** 해결 시점은 `RESUME.md` §14의 표를 따른다.
- **`plan_status`는 `draft` 그대로다.** ENGINE-001·CONSULTOPS-001도 PASS-with-debt 뒤에 `audit-ready`를 선언하지 않았고 같은 방식을 따랐다. §E.1은 바꾸지 않았다.

**debt에 손댈 때의 영향**(사실만 적는다): `spec.md`·`plan.md`·`acceptance.md`를 고치면 plan-artifact hash가 바뀌어 `/moai run` Phase 1 Plan Audit Gate의 skip 조건 3(hash 불변)이 깨지고 게이트가 다시 실행된다(`spec-workflow.md` Plan Audit Gate skip policy). 현재 세 파일의 blob은 감사 대상 `ba4602e`와 같다(실측). D-16·D-17은 U4·U5가 정해진 뒤 `manager-spec`이 처리 여부를 판단한다(`review-3.md` 권고 순서 1).

## Plan-phase Observations

작성 중 확인한 사실과 불일치다. 이 SPEC의 요구사항이 아니라 오케스트레이터·감사자에게 전달하는 관찰이다.

### 1. SPEC ID 정규식 불일치

- SSOT(`.claude/rules/moai/development/spec-frontmatter-schema.md`)의 `id` 제약 `^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$`는 도메인 세그먼트에 하이픈이 없다. `echo SPEC-B2C-LAUNCH-001 | grep -cE '^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$'` → `0`이고 선례 `SPEC-B2C-CONSULT-001`도 `0`이다. manager-spec의 사전 점검 정규식은 실행 결과 `PASS`였다(`ID="SPEC-B2C-LAUNCH-001"; [[ "$ID" =~ ^SPEC(-[A-Z][A-Z0-9]*)+-[0-9]{3}$ ]] && echo PASS || echo FAIL`). 선례 형식 `SPEC-B2C-<ONE-TOKEN>-NNN`을 유지했고 스키마는 이 SPEC 범위가 아니다. `grep -rln "id: SPEC-B2C-LAUNCH-001" .moai/specs`는 이 SPEC의 `spec.md` 하나만 찾았다.

### 2. 오케스트레이터 증거 팩과 지시문의 오류·누락

- **지시문의 인용 오류**: 지시문은 DIAGNOSIS-001 `spec.md:34`를 "`ENABLE_DIAGNOSIS_DEV_STATES`는 운영에서 unset이어야 한다"의 근거로 든다. `:34`는 placeholder 교체 조건 (1)~(4)이고 `ENABLE_DIAGNOSIS_DEV_STATES`를 언급하지 않는다(`grep -n "ENABLE_DIAGNOSIS_DEV_STATES"`는 `:21,24,90,104`). 근거는 REQ-B2CDIAG-017(`:90`)과 REQ-B2CDIAG-025(`:104`)다. 이 SPEC은 후자를 인용했다.
- **팩 §D의 줄 번호**: `<title>보상 진단</title>`의 위치를 `app/page.tsx:53-57`로 적었으나 `generateMetadata`는 `:51-56`이고 제목 삼항식은 `:54`다. 사소하다.
- **팩 §D의 식별자 "미검증"**: `<title>`과 "열린 상태의 응답에 `서비스 준비 중입니다`가 없다"는 같은 날의 과거 로컬 실행 로그(저장소 밖 백업 폴더)가 SSR 응답에서 관측했다. `data-testid` 두 개는 코드에 있으나(`diagnosis-flow.tsx:396`, `step-input.tsx:160`) 어떤 응답에서도 관측되지 않았다. LF-12에 나눠 적었다.
- **팩의 누락 — 01·02 푸터**: 팩은 03 푸터의 비활성 링크만 적었다. 01은 `<a href="#">` 셋, 02는 `<a href="#">` 둘과 텍스트 `고객 문의: 준비 중`이어서 세 표면이 서로 다르다(LF-13).
- **팩의 누락 — API는 `ENABLE_CONSULT_FLOW`와 독립**: 팩 §B는 상담 플래그가 `/consult`와 `/result`에만 영향을 준다고 적는다. 사실이나, 접수 API가 `ENABLE_CONSULT_FLOW`를 읽지 않아 `CONSULT_POLICY_READY=true`(와 시크릿)만으로 접수가 열린다는 점(LF-07)과 과거 로컬 실행 기록의 `consult=false policy=true`에서 `api=201`(LF-11)은 적혀 있지 않다.
- **팩의 누락 — `verify:flag-runtime`의 교차 공백**: 시작 조합 8개는 32 원조합 중 8개이고 진단 `production` 경로 열림과 상담 화면 열림이 함께 있는 조합은 없다(LF-11). 팩은 "Not in CI"만 적었다.
- 확인되어 팩이 맞다: `deploy.yml:3-7,43,61,96-101`과 smoke 단계의 순서(`pm2 restart` 뒤 smoke), `flags.ts`의 엄격 일치와 진단·상담 게이트 계산, `step-loading.tsx:54-62`, `consent-detail-content.tsx:13-18`, `lib/env.ts:143-145`, `app/consult/page.tsx:45`의 닫힌 placeholder, `consult-consent-group.tsx:68`, 플래그 5종의 병합 전 미설정(MERGE-CHECKLIST §2), PR CI 없음.

### 3. 형제 SPEC·완료된 SPEC의 결함 또는 틈 (보고만 하고 고치지 않았다)

- **DIAGNOSIS-001의 smoke 교체 트리거(완료된 SPEC)**: REQ-B2CDIAG-023과 AC-B2CDIAG-024는 `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 모두 `true`가 될 때로 한정한다. `ENABLE_DIAGNOSIS_DEV_STATES` 단독으로도 게이트가 열려 현재 smoke가 실패한다(LF-19, 이 세션이 두 게이트 함수를 호출해 확인한 `D=1` 행). CONSULTOPS-001 §2.2와 ENGINE-001 §2.2가 같은 "두 플래그" 서술을 이어받았다.
- **"내부 시험"의 세 용법**: ENGINE-001 `design.md:184`(`reviewEnabled`, 비프로덕션 전용), CONSULTOPS-001 `spec.md:112,274-278`(알려진 참여자의 시험 데이터 제출, 운영 호스트 또는 로컬), DIAGNOSIS-001 REQ-B2CDIAG-017·025(review 경로는 운영에서 unset)가 서로 맞지 않는다(N2).
- **CONSULTOPS-001 REQ-B2CCONSULTOPS-013의 범위**: "상담 플래그나 시크릿"만 적었으나 E-03의 표지 변수 관측은 변수 종류에 의존하지 않는다. 진단 플래그를 바꾸는 재시작은 어느 SPEC의 요구에도 들어 있지 않다(R-04가 메운다, N7).
- **01·02 푸터의 소유 없음**: CONSULTOPS-001 D-OPS-04 (d)는 03 푸터만 다룬다(N5).
- **CONSULTOPS-001 F-21**: 저장소가 공개라는 서술에 "이 세션 미확인"이 붙어 있다. 이 세션이 GitHub API 조회로 확인했다(LF-15).
- **CONSULTOPS-001 review-3의 남은 결함 N-1**: 증거 기록 파일이 어느 항목의 덮는 파일 집합에도 없다는 것을 검증하는 AC가 없다. 이 SPEC은 AC-B2CLAUNCH-005에 그 검증을 넣었다. 그 SPEC의 N-2("최소 4종" 대 "빼거나")도 남아 있다 — 이 SPEC은 해당 사유 목록을 "작성자 기본 목록"으로만 인용해 같은 표현 충돌을 피했다.
- **ENGINE-001 review-3의 D30**: AC-B2CENGINE-023 시나리오 5의 grep 후보 명령이 `["…"]`·JSON 키 형태를 놓친다. 이 SPEC의 AC-B2CLAUNCH-012는 그 형태를 잡는 패턴을 실행해 시험했고(아래 6번) 경로 목록에 `scripts`, `package.json`, `.env.local.example`을 더했다. ENGINE-001의 후보 명령 자체는 고치지 않았다.
- **ENGINE-001 `spec.md:61`과 노출 순서**: 상담의 일반 사용자 대상 사용이 실제 결과를 기다린다는 서술 때문에 D-LAUNCH-03 Q1 (b)(상담 먼저)를 택하면 상담의 일반 공개 시점에 CONSULTOPS-001 E-17(G 필수)이 엔진 증거 부재로 `READY`가 아닐 수 있다. 어느 옵션도 양립 불가로 적지 않고 옵션으로 중립 서술했으며 결정은 사용자에게 남겼다.

### 4. 요구사항 16건 상한 조정

작성 중 19~20건이 되어 아래와 같이 줄였다. 어느 것도 정보를 버린 것이 아니라 항목 정의표나 다른 REQ·AC로 이동했다.

- "smoke 교체는 어떤 진단 플래그 변경보다 먼저"는 별도 REQ를 두지 않고 항목 L-05(필수)와 REQ-B2CLAUNCH-002의 게이트로 집행하게 했다. AC-B2CLAUNCH-002의 fixture (사)(아)가 시험한다. REQ-B2CLAUNCH-013 (가)가 교체를 싣는 첫 배포의 상태를 다룬다.
- "진단 플래그 변경 재시작에도 재읽기 관측" 요구는 REQ가 아니라 항목 R-04로 뒀다(CONSULTOPS-001 E-03 참조).
- "롤백 선언 역할·사유 목록 기록"은 REQ가 아니라 항목 L-06으로 뒀고 AC-B2CLAUNCH-014가 문서 열람으로 확인한다.
- "내부 시험에서 일반 공개로의 이행 게이트"는 별도 REQ를 두지 않고 REQ-B2CLAUNCH-002·008과 §2.4의 한계 서술로 흡수했다.
- 항목 필드·무효화 사건·기록 파일 제외는 REQ-B2CLAUNCH-005 하나로 합쳤다(대상 정의 한 곳).
- **쓰지 않은 후보**: 이전 단계로의 부분 롤백(N8), 표면별 개별 단계(N10), 상담 접수의 런타임 게이트(N11). 사용자가 필요하다고 하면 Tier L 또는 SPEC 분할이 필요하다.

### 5. 확인하지 못한 것

- 병합 이후 운영 상태(플래그·가동 커밋·마이그레이션·인스턴스 수)는 관측하지 않았다. 자동 메모리에 병합 후 배포 성공을 적은 항목이 있으나 확인하지 않았고 근거로 쓰지 않았다.
- `pm2 restart`가 바뀐 환경을 다시 읽는지, 이후 `main` 배포의 평범한 재시작이 상태를 유지하는지는 어느 호스트에서도 관측하지 못했다(LF-17).
- `data-testid="diagnosis-flow"`·`data-testid="diagnosis-hero-title"`가 SSR 응답에 있는지는 관측하지 못했다(LF-12). `<title>`과 열린 상태의 문구 부재는 과거 로컬 실행 로그(저장소 밖 백업 폴더)에서만 보았고 그 로그가 현재 `main@99993bf`의 코드로 만든 것인지는 확인하지 못했다.
- `pnpm verify:flag-runtime`과 `pnpm build`를 이 세션이 실행하지 않았다(저장소 안의 쓰기 금지 지시와 빌드 산출물 때문이다). 로컬 서버 관측은 코드 읽기와 과거 로그에서 파생한 예상이다.
- `tsx`가 운영 VM에서 `pnpm install --frozen-lockfile` 뒤 실행 가능한지는 `db:migrate` 단계(`deploy.yml:43`)가 같은 방식으로 `tsx` 스크립트를 부른다는 정황뿐이고 관측하지 못했다.
- `moai` 명령은 이 셸의 PATH에 없었다(`command -v moai` → 없음). 그래서 `moai spec lint`, `moai session list`, `mcp__moai__*` 도구는 실행하지 못했다. 자체 점검은 수동 grep·awk·스크립트다.
- 저장소 밖 도달 제한 수단(프록시·방화벽 등), 실제 `.env*` 파일, 운영 PM2 저장 환경은 열지 않았다. 저장소에는 Nginx·ecosystem 설정이 추적돼 있지 않다(LF-17).
- 법적 요건, 개인정보처리방침·이용약관의 필요성이나 내용은 판단하지 않았다.
- 이 작성에는 GitHub API 조회(`api.github.com`, 공개 여부)를 썼고 URL은 그 조회에만 쓴 것이며 제품 값이 아니다.

### 6. Plan-phase 점검 명령과 결과

아래는 이 작성 세션이 현재 트리(`main@99993bf`, 커밋되지 않은 초안)에서 실행한 것이다.

- `git log -1 --format='%h %s'` → `99993bf feat(SPEC-B2C-CONSULT-001): 상담 신청(03) 화면·API 구현 (#22)`. `git status --short`(작성 시작 시) → 형제 SPEC 두 디렉터리만 `??`.
- **게이트 진리표**: 저장소 밖 임시 스크립트로 `lib/diagnosis/flags.ts`의 두 함수를 `node_modules/.bin/tsx`로 호출 → 진단 8행·상담 4행(§2.3과 같음). 엄격 일치 탐침 `"true"`만 참이고 `"TRUE"`, `"1"`, `"yes"`, `" true"`, `"true "`, `""`, 미설정은 거짓.
- `grep -cE "paths(-ignore)?:" .github/workflows/deploy.yml` → `0`. `grep -rn "서비스 준비 중입니다"`(앱 소스·워크플로) → `deploy.yml:97,98`과 `app/page.tsx:71`, `app/result/page.tsx:59`, `app/consult/page.tsx:45` 등(시험 파일 제외).
- 접수 API 플래그 읽기: `grep -n "ENABLE_CONSULT_FLOW\|shouldRenderConsult\|computeConsultFlags" app/api/consultations/route.ts lib/consult/*.ts`(시험 제외) → 0줄. `CONSULT_POLICY_READY` → `route.ts:42,45`. 인증·세션·출처 계열 이름 대소문자 무시 검색 → 라우트 파일 0줄, `next.config.ts` 0줄, 루트의 `middleware.ts`·`proxy.ts`·`src/middleware.ts`·`src/proxy.ts` 없음.
- **푸터 오라클**: `grep -rn 'href="#"' components app --include=*.tsx | grep -v '\.test\.'` → `diagnosis-footer.tsx:29`, `result-footer.tsx:8`(주석), `result-footer.tsx:35`. 넓힌 정규식 + 주석 줄 필터 → 두 줄(`diagnosis-footer.tsx:29`, `result-footer.tsx:35`). 샘플 시험: 첫 정규식은 `href='#'`·`href={"#"}`를 놓치고 넓힌 정규식은 모두 잡음.
- **`DIAGNOSIS_ENGINE_READY` 대입 오라클**: 패턴 파일 `DIAGNOSIS_ENGINE_READY[]"']*[[:space:]]*[=:][[:space:]]*["'`]?[^=[:space:]]`를 `grep -rnE -f`로 `app components lib scripts instrumentation.ts playwright.config.ts package.json .github .env.local.example`(시험 제외, 주석 줄 필터)에 적용 → `scripts/verify-flag-runtime.ts:174`, `:293` 두 줄뿐. 샘플 12줄 시험: 대입 일곱 형태는 일치, `ENV … true`·`??=`·`===` 비교 둘·주석은 불일치. 처음 쓴 정규식은 대괄호 안의 `]` 위치 오류로 `DIAGNOSIS_ENGINE_READY=true`조차 놓쳐 샘플 시험에서 발견해 고쳤다.
- **표지값 검색 메커니즘**: 실행 시점에 만든 무작위 값 둘로 `git grep -nF --untracked`를 저장소 전체에 → 일치 0줄(`exit 1`). 저장소 밖 임시 저장소(추적 1·비추적 1·무시 1)에서 같은 검색 → 비추적 파일만 찾음(양성·음성 대조). 값은 어떤 파일에도 쓰지 않았다.
- **표 파싱(`awk -F'|'`)**: `spec.md` §2.4 항목 정의표 — 행 14, 필드 수 9 ×14, I·G 칸 열거 밖 값 0, 증거 항목·마지막 칸 빈 칸 0, ` / ` 구분자 정확히 1개 ×14, 표면 값 `전체` 8·`S1` 4·`S2·S3` 1·`S1·S2` 1, I/G 조합 `필수/필수` 8·`결정 대기/필수` 2·`필수/해당 없음` 1·`필수/결정 대기` 1·`해당 없음/결정 대기` 1·`결정 대기/결정 대기` 1. 단계 표 — 행 3, 빈 칸 0, 필드 수 7 ×3. §2.3 진단 표 8행, 상담 표 4행. 증거 장부 LF-01~LF-20 20행.
- **개수**: REQ 정의 001~016(16건), AC 정의 001~016(16건), AC마다 인용한 REQ 번호가 같다(16/16 1:1). 각 AC 블록에 `검증:`·`통과 판정:`·`선결:`이 모두 있다(16/16, awk 블록 점검 누락 0). 확인 마커(대괄호 안에 확인 요청 문구와 N 번호를 넣은 줄) 검색: `spec.md` 11건(N1~N11 모두 정의), `plan.md`·`acceptance.md`·`progress.md` 0건. Out of Scope `### Out of Scope —` H3 5개와 `-` bullet 5개. 시간 추정 정규식(숫자 뒤에 일·주·개월·시간·분·초·영어 시간 단위가 붙는 형태) → 네 파일 0건(숫자와 단위를 붙인 짧은 샘플 세 개를 이 정규식이 잡는 것도 확인). 고정 표지값 접두사 검색 → 0건. 프런트매터 필드: 12개 필수 + `tier`, `related_specs`.
- **인용한 형제 식별자 존재 대조**: CONSULTOPS-001의 E-03·E-06·E-08·E-17, EV-1, N7, F-04·F-10·F-12·F-16·F-17·F-18·F-19·F-22, D-OPS-04·07·10·11·12, REQ-B2CCONSULTOPS-002·006·011·013·016, AC-B2CCONSULTOPS-011·015, ENGINE-001의 REQ-B2CENGINE-023, N5·N7, D-ENGINE-04·05·07·09·10, design §9.2·§9.3·§10.1·§10.5, DIAGNOSIS-001의 REQ-B2CDIAG-017·023·025, AC-B2CDIAG-024, CONSULT-001의 REQ-B2CCONSULT-005·025, RESULT-001의 REQ-B2CRESULT-025, REQ-PILOT-READY-016, REQ-PILOT-OPS-006을 해당 파일에서 `grep -F`로 찾아 모두 존재함을 확인했다(누락 0). 줄 번호 인용은 작성 중 해당 줄을 열어 확인했다.
- 작성 끝 `git status --short` → 세 디렉터리(`SPEC-B2C-CONSULTOPS-001/`, `SPEC-B2C-ENGINE-001/`, `SPEC-B2C-LAUNCH-001/`)만 `??`이고 추적 파일 수정은 0개다.

### 7. plan-phase 실행 위치의 일탈 (worktree + 형제 3-SPEC 공유 plan 브랜치)

이번 2차 정밀 교정 세션은 `.claude/worktrees/launch-readiness` worktree에서 `plan/b2c-launch-readiness` 브랜치(이 SPEC과 형제 SPEC-B2C-ENGINE-001·SPEC-B2C-CONSULTOPS-001이 공유)로 작업했다 — `.claude/rules/moai/workflow/spec-workflow.md` § SPEC Phase Discipline의 "Step 1(plan)은 main checkout에서 실행, 이 단계에 L2/L3 worktree 없음" 규칙과의 일탈이다. 전체 경위와 재개 안내는 `.moai/reports/b2c-launch-readiness/RESUME.md`를 참조한다.
