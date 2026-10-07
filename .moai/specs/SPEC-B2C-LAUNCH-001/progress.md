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

### M2 (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `0e18ece` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M2-*.log`다. 이 커밋의 SHA는 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **범위(사용자 결정)**: "화면 변화 없음". 푸터 분류 시험, L-08 표면별 G 점검기, 현황 기록만 만들었다. `components/`·`app/`의 비시험 파일, `design/`, `e2e/`, `scripts/visual-verify.ts`, `scripts/check-launch-gate.ts`, `spec.md`·`plan.md`·`acceptance.md`는 바꾸지 않았다.
- **변경 파일**: `lib/launch/footer-element-state.ts`(+시험), `lib/launch/legal-notice-gate.ts`(+시험), `lib/launch/legal-notice-record.fixture.ts`, `components/diagnosis/diagnosis-footer.legal-notice.test.tsx`, `components/result/result-footer.legal-notice.test.tsx`, `components/consult/consult-footer.legal-notice.test.tsx`, `.moai/docs/launch-gate-runbook.md`(`## L-08 법적 고지 표면 현황 (M2 스냅샷)` 절 추가), 이 파일. 기존 푸터 시험(`result-footer.test.tsx`, `consult-footer.test.tsx`)은 완료된 SPEC의 것이라 고치지 않고 새 파일을 옆에 두었다.
- **구현한 것**: (1) 분류기 `classifyFooterElement` — `aria-disabled="true"`면 `비활성 표시`, href 속성이 없으면 `텍스트만`, href가 비었거나 정확히 `#`이면 `# 앵커`, 그 밖은 `목적지 있음`. 요소는 렌더링 결과에서 화면 라벨로 시작하는 `a`·`[role="link"]`·`span`을 정확히 하나 찾아(`findFooterElement`, 하나가 아니면 던진다) 분류한다. (2) 점검기 `evaluateLegalNoticeGate` — 입력은 S1 요소 상태 여섯, S2 요소 확정 여부 여섯(D-OPS-04 기록을 입력으로만 받는다), 목적 벡터. 목적 벡터가 여는 표면의 요소만 읽는다: S1은 여섯 요소가 모두 `목적지 있음`이어야 하고, S2는 여섯 요소가 모두 `확정`이어야 한다. 출력은 `READY`/`BLOCKED`와 차단 요소 식별자, 문제 종류 코드(`empty-target`·`unknown-target`·`no-applicable-surface`·`unknown-s1-element`·`unknown-s2-element`)이며 입력 값을 되풀이하지 않는다. (3) 시험용 요소 기록 거울(`legal-notice-record.fixture.ts`)과 D-LAUNCH-09 허용 칸(G: `목적지 있음`, I: `목적지 있음`·`비활성 표시`).

**RED**(`classifyFooterElement`는 항상 `텍스트만`, `evaluateLegalNoticeGate`는 항상 `READY`를 돌려주는 틀로 두고 새 시험 5개 파일 실행, `M2-red.log`): `Test Files 5 failed (5)`, `Tests 36 failed | 16 passed (52)`, `exit=1`. 모듈 없음·타입 오류는 0건이고 실패는 모두 단언 실패다(대표: `expected '텍스트만' to be '# 앵커'` 4건, `expected '텍스트만' to be '비활성 표시'` 2건, `expected '텍스트만' to be '목적지 있음'` 2건, `expected 'READY' to be 'BLOCKED'` 7건, `expected [] to deeply equal [ '나' ]`, `expected [] to deeply equal [ '가', '다' ]`, `expected [] to deeply equal [ '02-footer-terms' ]`). 통과한 16건은 틀이 우연히 맞는 경우(02 고객 문의의 `텍스트만`, 목적지 있음 요소의 READY 등)다.

**GREEN**(`M2-green-1.log`, verbose): `Test Files 5 passed (5)`, `Tests 52 passed (52)`, `exit=0`. prettier 정리 뒤 새 시험 5개 파일 + 기존 푸터 시험 둘(`M2-green-final.log`): `Test Files 7 passed (7)`, `Tests 64 passed (64)`, `exit=0`(새 52 + 기존 12). 그 뒤 커버리지 보강으로 `footer-element-state.test.ts`에 요소 찾기 시험 4건(jsdom)을 더해 새 시험은 56건이 됐고 전체 실행(E4)과 커버리지 실행(E5)이 이를 포함한다.

**E1 AC-B2CLAUNCH-015 시나리오 2 판정표**(여덟 칸, 명령 `pnpm exec tsx .moai/state/verify/launch-run/M2-cells.ts`의 출력 `M2-cells.log`와 단위 시험 `lib/launch/legal-notice-gate.test.ts`; 차단 요소는 식별자만):

| fixture | 목적 벡터 | 기대 | 관측 |
|---|---|---|---|
| (가) S1 여섯 `목적지 있음`, S2 6개 미확정 | S1 | BLOCKED 아님 | PASS — `READY`, 차단 없음 |
| (나) S1 하나 `# 앵커`, S2 6개 확정 | S1 | BLOCKED | PASS — `BLOCKED`, `02-footer-terms` |
| (다) S1 여섯 `목적지 있음`, S2 일부 확정 | S1 | BLOCKED 아님 | PASS — `READY`, 차단 없음 |
| (라) S1 여섯 `목적지 있음`, S2 6개 확정 | S1 | BLOCKED 아님 | PASS — `READY`, 차단 없음 |
| (가) | S2 | BLOCKED | PASS — `BLOCKED`, `03-C`·`03-B`·`03-D`·`03-footer-contact`·`03-footer-privacy`·`03-footer-terms` |
| (나) | S2 | BLOCKED 아님 | PASS — `READY`, 차단 없음 |
| (다) | S2 | BLOCKED | PASS — `BLOCKED`, `03-D`·`03-footer-contact`·`03-footer-privacy`·`03-footer-terms` |
| (라) | S2 | BLOCKED 아님 | PASS — `READY`, 차단 없음 |

S1 벡터에서 BLOCKED는 (나)뿐이고 S2 벡터에서는 (가)(다)뿐이다(시험이 이 집합을 직접 확인한다). 어느 fixture에서도 S2의 미확정이 스스로 READY가 되지 않으며 점검기는 D-OPS-04를 판정하지 않는다. 추가 시험: 두 표면을 함께 여는 벡터는 두 판정의 합집합(S1 요소 → S2 요소 순서), G가 `# 앵커`·`비활성 표시`·`텍스트만`을 허용하지 않음, `확정`이 아닌 값·알 수 없는 상태 값은 차단, 빈 S1·S2 입력은 여섯 요소 전부 차단, 입력 객체가 빠져도 통과 없음, 빈·없는 목적 벡터(`empty-target`)·알 수 없는 표면(`unknown-target`, 값을 출력에 되풀이하지 않음)·S3만(`no-applicable-surface`), 알 수 없는 요소 식별자(`unknown-s1-element`·`unknown-s2-element`, 식별자를 되풀이하지 않음, 열지 않는 표면의 입력은 읽지 않음), 입력을 바꾸지 않음.

**E1 AC-B2CLAUNCH-015 시나리오 1 관측 분류표**(세 푸터 렌더링 시험, 로그 `M2-green-final.log`; 요소 기록의 현재 상태 칸과 같음):

| 표면 | 요소 | 관측 분류 | G 허용 | I 허용 |
|---|---|---|---|---|
| 01 | 개인정보처리방침 | `# 앵커` | 아니오 | 결정 침묵(아니오로 읽음) |
| 01 | 이용약관 | `# 앵커` | 아니오 | 결정 침묵(아니오로 읽음) |
| 01 | 고객 문의 | `# 앵커` | 아니오 | 결정 침묵(아니오로 읽음) |
| 02 | 개인정보처리방침 | `# 앵커` | 아니오 | 결정 침묵(아니오로 읽음) |
| 02 | 이용약관 | `# 앵커` | 아니오 | 결정 침묵(아니오로 읽음) |
| 02 | 고객 문의(`고객 문의: 준비 중` 텍스트) | `텍스트만` | 아니오 | 결정 침묵(아니오로 읽음) |
| 03 | 개인정보처리방침 | `비활성 표시` | 아니오 | 예 |
| 03 | 이용약관 | `비활성 표시` | 아니오 | 예 |
| 03 | 고객 문의 | `비활성 표시` | 아니오 | 예 |

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`, 출력 없음(`M2-tsc-2.log`). **E3 린트**: `pnpm lint` → `exit=0`(`M2-lint.log`), 새 TS 여덟 개 `prettier --check` 통과(`M2-prettier-2.log`). **E4 전체 시험**: `pnpm test` → `Test Files 117 passed (117)`, `Tests 1270 passed (1270)`, `exit=0`(`M2-test-full.log`; M1e 기준선 1214 + 새 56). **E5 커버리지**(명령줄 덮어쓰기, `M2-cov-2.log`): 새 두 모듈 합계 구문 100%(47/47), 분기 97.82%(45/46), 함수 100%, 줄 100%. `footer-element-state.ts`는 분기 91.66%(미덮개 31행, `textContent ?? ""`의 null 쪽)이고 `legal-notice-gate.ts`는 텍스트 보고서가 100% 파일을 접어 목록에 없다(합계 수치로 확인, 파일별 수치를 따로 읽지는 않았다). 요소 찾기의 DOM 경로는 컴포넌트 시험이 아니라 `footer-element-state.test.ts`의 jsdom 시험이 덮는다.

**변경 범위 확인**: `git diff --stat 0e18ece -- components app`(커밋 뒤)는 새 `*.legal-notice.test.tsx` 세 개만 낸다. `app/`은 0건.

**발견(SPEC 문서는 고치지 않았다, 적힌 대로 진행하고 말하지 않은 곳은 닫았다)**:

1. **빈 href의 이름**: REQ-015·AC-015가 `# 앵커`를 이름으로 주고 `목적지 있음`의 조건에 "href가 `#`도 빈 값도 아님"을 적었으나 빈 href가 어느 분류인지 말하지 않는다. 목적지 없음 쪽으로 닫아 `# 앵커`로 분류했다. 다른 이름(예: 별도 분류)이 맞는지는 SPEC이 정해야 한다.
2. **`#`로 시작하는 그 밖의 값**: 글자 그대로 읽어 정확히 `#`가 아니면(예: 쪽 안 이동을 뜻하는 값) `목적지 있음`이다. 그것이 법적 고지의 목적지로 인정되는지는 SPEC이 말하지 않는다. `#`로 시작하는 값을 모두 `# 앵커`로 읽을지 SPEC이 정해야 한다(fail-closed로 닫으려면 후자).
3. **I 단계에서 `# 앵커`·`텍스트만`의 허용**: D-LAUNCH-09 (2)는 "준비 중" 비활성 표시를 허용한다고만 적었다. `텍스트만`("고객 문의: 준비 중")이 그 허용에 드는지, `# 앵커`가 드는지 결정 기록이 침묵한다. 허용으로 읽지 않았다(허용 칸 I = `목적지 있음`·`비활성 표시`). `목적지 있음`이 I를 충족한다는 읽기도 결정 기록이 직접 적은 것이 아니라 읽어낸 것이다. 이 점검기는 G만 판정하므로 I 허용은 요소 기록·런북에만 쓰였고 판정에 쓰이지 않는다.
4. **요소 식별자 체계**: SPEC은 S1 요소의 식별자를 정하지 않았다(L-08은 "요소별 기록"이라고만 적었다). `01-footer-privacy` 같은 `표면 번호-footer-요소`를 임의로 붙였다. S2의 여섯 식별자는 CONSULTOPS-001 D-OPS-04의 이름(03-C·03-B·03-D와 03 푸터 셋)을 옮겼으나 03 푸터 셋의 식별자(`03-footer-*`)는 이 점검기가 붙인 것이며 CONSULTOPS-001 기록의 실제 식별자와 같은지는 확인하지 못했다(그 기록의 형식·위치가 미정이다).
5. **S1·S2 모두 열지 않는 벡터**: L-08은 표면이 S1·S2인 항목이라 S3만 여는 벡터에서는 적용되지 않는다. SPEC은 적용되지 않을 때 이 점검기가 무엇을 내야 하는지 말하지 않아, 빈 벡터와 S3만 있는 벡터를 모두 BLOCKED(`empty-target`·`no-applicable-surface`)로 닫았다. 호출하는 쪽이 L-08이 적용되지 않는 벡터에서는 이 점검기를 부르지 않는 것이 자연스럽다.
6. **요소 기록의 위치**: AC-015는 "항목의 현재 상태 칸이 분류 결과와 같다"고 쓰지만 요소별 항목 기록의 위치·형식을 정하지 않았다(D-LAUNCH-04 (α)는 저장소에 식별자·상태·참조만 두라고만 한다). 시험용 거울을 `lib/launch/legal-notice-record.fixture.ts`에 두고 같은 내용을 런북 스냅샷 절에 사람이 읽는 표로 옮겼다. 정식 기록의 위치가 정해지면 그쪽으로 옮겨야 한다.
7. **런북 머리말과의 긴장**: 런북 3~5행은 "항목의 상태를 적은 기록과 서명 기록은 이 문서의 구역이 아니다"라고 적는다. 이번 절은 푸터 요소의 분류 현황이지 L-08 항목의 상태(`READY` 등)가 아니라고 읽고 넣었으나(사용자 지시), 이 절이 증거 표 구역으로 읽히면 "기록 파일은 어느 항목의 덮는 파일 목록에도 넣지 않는다"는 규칙과 닿을 수 있다. L-08의 `대상` 칸은 세 푸터 컴포넌트와 결정 기록이고 런북은 거기 없어서 지금은 충돌하지 않는다.
8. **AC-015 후보 시험 파일명**: AC는 후보로 `diagnosis-footer.test.tsx` 등 기존 이름을 적었다. 01은 시험이 없었으나 02·03에는 완료된 SPEC의 시험이 있어 모두 새 `*.legal-notice.test.tsx`를 옆에 두었다.
9. **03 푸터의 모바일 상태**: `ConsultFooter`는 `md` 미만에서 숨는다(CSS 클래스). jsdom은 CSS를 계산하지 않아 시험은 모바일에서 숨는 사실을 보지 못한다(AC-015가 보지 못하는 것 목록과 같다).

**배선 공백(D)**: `scripts/check-launch-gate.ts`에는 목적 벡터(`--surfaces`)와 목적 단계(`I`·`G`) 개념이 이미 있으나 새 점검기에 꽂는 일은 "아주 작은 변경"이 아니라 하지 않았다. 이유: (a) 점검기는 요소 단위 입력(S1 요소 상태 여섯, S2 확정 여부 여섯)을 받는데 현재 입력 표면은 항목 단위 기록(`READY` 등)과 항목별 대상 값·사건뿐이라 새 입력(예: `--legal-notice <JSON>`)과 그 검증이 필요하다. (b) L-08 기록 행의 `READY` 상태와 요소 판정이 어떤 관계인지(요소 판정이 행 상태를 대신하는지, 둘 다 필요한지)를 SPEC이 정하지 않았다. (c) I 단계에서 요소 단위 판정은 허용 칸 해석(발견 3)이 열려 있어 쓸 수 없다. 제안: 결정이 나면 `evaluateLaunchGate`의 항목 루프에서 `row.id === "L-08"`이고 `request.column === "G"`일 때만 `evaluateLegalNoticeGate({ ..., target: request.vector })`를 불러, `BLOCKED`면 그 항목을 불가로 두고 `blocking` 식별자를 `불가 사유`에 적는다. 이 연결은 발견 3·5와 (b)가 정해진 뒤의 후속 단위로 둔다.

**Gaps(관측하지 못한 것)**: `pnpm build`·`pnpm test:e2e`·`pnpm visual:verify`는 화면이 바뀌지 않아 실행하지 않았다(M1 종합 검증이 "M2 착수 전에 측정"으로 미룬 것도 이 단위의 범위 밖 지시에 따라 실행하지 않았다). 변이 시험은 하지 않았다. 점검기와 분류기의 기대값을 시험이 같은 사람의 읽기로 적었으므로 SPEC 읽기가 틀리면 두 곳이 같이 틀린다(발견 1~3). `moai` CLI·MCP가 연결되지 않아 `moai spec lint`·@MX 태그 점검은 실행하지 못했고 @MX 태그는 추가하지 않았다. 불안정 시험 `scripts/verify-remote-consult.test.ts`는 이번 전체 실행에서 실패하지 않았다.

**잔여 위험**: 요소 기록 거울과 런북 스냅샷은 푸터 컴포넌트가 바뀌면 낡는다(시험은 기록과 어긋나면 실패하나 런북 표는 사람이 고쳐야 한다, EV-L1). 분류기는 속성만 보므로 동적으로 계산한 목적지, 링크 대상의 실재, 법적 충분성은 보지 못한다. 점검기는 D-OPS-04 기록의 진위를 알 수 없고 입력으로 받은 확정 여부를 그대로 읽는다.

### M3a (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `ebfe670` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M3a-*.log`다. 이 커밋의 SHA는 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **범위(사용자 결정)**: M3의 앞 절반 — REQ-B2CLAUNCH-009·010, 곧 AC-010 시나리오 1·2와 AC-009 시나리오 1·2. AC-010 시나리오 3(교차 조합 세 가지의 로컬 서버 관측), AC-011(전환 목록 점검기), AC-012(`DIAGNOSIS_ENGINE_READY` 설정 단계 점검)은 M3b 이후라 구현하지 않았다. `spec.md`·`plan.md`·`acceptance.md`, `app/`, `components/`, `lib/diagnosis/flags.ts`, `lib/consult/`, `lib/env.ts`, `.github/`, `package.json`은 바꾸지 않았다.
- **변경 파일**: 신규 `lib/launch/gate-state-table.ts`(+`.fixture.ts`, `.test.ts`), 신규 `lib/launch/exposure-record.ts`(+시험), 신규 시험 `lib/diagnosis/flags.gate-table.test.ts`, `lib/env.boot-combination.test.ts`, 신규 `scripts/verify-gate-reachability.ts`(+시험), `.moai/docs/launch-gate-runbook.md`(`## 게이트 상태 표`·`## 노출 기록 양식` 절만 추가, 기존 절 불변), 이 파일.
- **구현한 것**: (1) 런북 게이트 상태 표 셋(진단 8행, 상담 4행, 시크릿 설정 여부와 부팅 4행)과 파서·칸 단위 대조 함수(`parseGateStateTables`, `compareGateStateTables` — 불일치는 표 이름·조합·칸 이름으로만 적고 칸 값은 되풀이하지 않음). (2) 독립 기대값 `GATE_STATE_FIXTURE` — `spec.md` §2.3을 손으로 옮긴 리터럴이고 두 게이트 함수를 호출해 만들지 않는다. (3) 노출 기록 검사기 `parseExposureRecord`. (4) 로컬 도달 관측 스크립트.

**RED**(`parseGateStateTables`는 항상 실패, `compareGateStateTables`는 항상 불일치 없음, `parseExposureRecord`는 항상 통과, 도달 관측 함수들은 빈 값을 돌려주는 틀 + 아직 런북 표 없음, 새 시험 5개 파일, `M3a-red.log`): `Test Files 5 failed (5)`, `Tests 55 failed | 20 passed (75)`, `exit=1`. 모듈 없음·타입 오류·TypeError는 0건이고 실패는 모두 단언 실패다(대표: `런북의 게이트 상태 표가 파서를 통과해야 한다: expected false to be true`, `expected [] to deeply equal [ StringContaining "/consult 제목" ]`, `expected [ '가', '나', '다', '라' ] to deeply equal [ '가' ]`, `expected [Function] to throw an error`). 통과한 20건은 틀이 우연히 맞는 경우(제품 코드가 이미 맞는 부팅 검증·게이트 함수의 직접 호출 시험, 소스 정적 규칙 시험 셋, `일치하면 불일치 없음` 류)다.

**GREEN**: 새 시험 5개 파일 `Test Files 5 passed (5)`, `Tests 77 passed (77)`, `exit=0`(`M3a-green-2.log`, verbose). RED 뒤에 도달 관측의 보고 형식 시험 2건을 더해 75건이 77건이 됐다.

**E1 AC-B2CLAUNCH-010 시나리오 1 — 12행 대조**(런북 표 ↔ 독립 기대값, 함수 출력 ↔ 독립 기대값, 기대값 ↔ `spec.md` §2.3 옮김 확인, 세 가지 모두 `compareGateStateTables` 결과 빈 배열):

| 표 | 행 | 런북 표 | 함수 출력 | spec.md §2.3과 기대값 |
|---|---|---|---|---|
| 진단 | F0E0D0 | 일치 | 일치(닫힘) | 일치 |
| 진단 | F0E0D1 | 일치 | 일치(열림 review, 문서 금지 D) | 일치 |
| 진단 | F0E1D0 | 일치 | 일치(닫힘) | 일치 |
| 진단 | F0E1D1 | 일치 | 일치(열림 review, 문서 금지 D) | 일치 |
| 진단 | F1E0D0 | 일치 | 일치(닫힘) | 일치 |
| 진단 | F1E0D1 | 일치 | 일치(열림 review, 문서 금지 D) | 일치 |
| 진단 | F1E1D0 | 일치 | 일치(열림 production) | 일치 |
| 진단 | F1E1D1 | 일치 | 일치(열림 둘 다, 문서 금지 D) | 일치 |
| 상담 | C0P0 | 일치 | 일치(화면 닫힘, 접수 닫힘 503) | 일치 |
| 상담 | C0P1 | 일치 | 일치(화면 닫힘, 접수 열림) | 일치 |
| 상담 | C1P0 | 일치 | 일치(화면 열림, 접수 닫힘 503) | 일치 |
| 상담 | C1P1 | 일치 | 일치(화면 열림, 접수 열림) | 일치 |

경로별 도달 칸(`/`, `/result`, `/consult`, `POST /api/consultations`)은 `spec.md` §2.3 "경로별 도달 규칙" 문단을 칸으로 옮긴 것이며 기대값·런북 표·함수 출력(게이트 출력에 그 규칙을 적용)이 같다. 변이 시험(일부러 바꾼 값을 대조가 그 행·칸 이름으로 잡는지): 기대값 F1E1D0의 `productionReady` 반전 → 런북 대조가 `F1E1D0`·`productionReady`를 적고 실패, 기대값 C0P1의 상담 접수 칸 변경 → 함수 출력 대조가 `C0P1`·`상담 접수`를 적고 실패, 런북 표 F1E0D0의 게이트 칸 변경 → 대조가 `F1E0D0`·`진단 게이트`를 적고 실패, 런북 표의 `문서 금지(D)` 표시 하나 삭제 → `표시` 칸 불일치, 게이트 함수를 어긋나게 바꾼 대용(F만으로 productionReady) → F1E0D0·F1E0D1이 실패. 엄격 일치 변종(`TRUE`·`1`·`yes`·앞뒤 공백·빈 문자열) 여섯 가지는 두 함수 모두 전부 거짓이다.

**E1 AC-B2CLAUNCH-010 시나리오 2 — 부팅 조합**(`validateEnv("app")`, 시험용 시크릿은 실행 시점에 만든 값, `LLM_PROVIDER_MODE=deterministic`로 `GEMINI_API_KEY` 게이트를 면제):

| P | S | 기대(표) | 관측 |
|---|---|---|---|
| 0 | 0 | 가능 | 통과 |
| 0 | 1 | 가능 | 통과 |
| 1 | 0 | 부팅 불가 | `EnvValidationError`, 누락 목록이 정확히 `["RATE_LIMIT_HMAC_SECRET"]` |
| 1 | 1 | 가능 | 통과, 시크릿 값이 결과에 담김 |

관측한 4행은 독립 기대값과도 런북 표의 부팅 칸과도 같다. 런북 표의 부팅 칸을 바꾸면(불가→가능, 가능→불가) 대조가 `P1S0`/`P1S1`·`부팅`을 적고 실패한다. 추가로 관측한 것: `CONSULT_POLICY_READY`가 `TRUE`·`1`·`yes`·` true`·`true `·빈 문자열이면 시크릿 없이 부팅하고, 시크릿이 빈 문자열이면 미설정으로 읽혀 부팅 불가다. 제품 코드는 AC와 다르게 동작하는 곳이 없어 바꾸지 않았다.

**E1 AC-B2CLAUNCH-009 시나리오 1 — 노출 기록 fixture**(합성 값만, 출력은 경로·칸 이름만 적고 값은 되풀이하지 않음):

| fixture | 기대 | 관측 |
|---|---|---|
| (가) 다섯 경로 모두 도달 대상·제한 수단·수단 위치(저장소 밖 둘은 외부 관측 기록 식별자 있음) | 통과 | PASS — 통과 |
| (나) `/consult` 행 없음 | 거부, 빠진 경로 | PASS — `도달 경로 "/consult" 행이 없다` |
| (다) 제한 없음인데 수용 역할·날짜 없음 | 거부, 누락 칸 | PASS — `"수용 역할"`·`"수용 날짜"` 칸이 비어 있다(경로 `/result`) |
| (라) 저장소 밖인데 외부 관측 기록 식별자 없음 | 거부 | PASS — `도달 경로 "POST /api/consultations"의 "외부 관측 기록" 칸이 비어 있다` |

네 fixture 중 통과는 (가) 하나뿐이다(시험이 직접 확인). 추가 규칙 시험: 제한 없음 + 수용 역할·날짜는 통과, 제한 없음인데 제한 수단 칸이 채워진 모순은 거부, 도달 대상·제한 수단·수단 위치 빈 칸, 열거 밖 수단 위치(값 미반복), 다섯 경로 밖 경로(값 미반복), 같은 경로 중복, 경로 칸의 백틱 표기, 칸 수 오류, 허용 칸 밖의 칸(`담당자 연락처` 같은 이름은 칸 이름만 적고 거부), 표 없음.

**E1 AC-B2CLAUNCH-009 시나리오 2 — 로컬 도달 관측**(명령 `pnpm exec tsx scripts/verify-gate-reachability.ts`, 로그 `M3a-reachability.log`, `exit=0`). 시작 조합은 화면 플래그 미설정, 정책 플래그 `true`, 실행 시점에 만든 시험용 시크릿, 로컬 `file:` DB다:

| 관측 | 기대 | 관측 | 판정 |
|---|---|---|---|
| `/consult` 제목 | `서비스 준비 중` | `서비스 준비 중` | OK |
| `/consult` placeholder 문구 | 있음 | 있음 | OK |
| `POST /api/consultations` 상태 | 409 | 409 | OK |
| `POST /api/consultations` 오류 코드 | `consent_version_mismatch` | `consent_version_mismatch` | OK |
| `consultations` 행 수 | 요청 전과 같음 | 전 0 후 0 | OK |

AC가 "이 예상은 `route.ts:284-296`을 읽고 파생한 것이며 이 세션은 서버를 실행하지 않았다"고 적은 예상이 이 실행으로 관측됐다(스키마를 통과하는 요청, 동의 버전은 무작위 접두사가 붙은 값이라 어떤 정책 버전과도 다름). 관측 시점의 코드 기준이며 로컬 서버에서만 확인한 것이다.

**안전 규칙 구현**: (a) 부모 환경의 DB 주소가 `file:`이 아니거나 시험 DB 주소가 `file:`이 아니면 거부(스킴만 적고 호스트는 적지 않음). (b) 환경 파일을 읽는 호출이 없다 — 이에 더해 프로덕션 빌드·시작이 프로젝트 루트에서 읽는 환경 파일(`.env`, `.env.local`, `.env.production`, `.env.production.local`)이 하나라도 있으면 파일 이름만 확인하고 실행을 거부한다(자식 프로세스가 읽을 수 있기 때문). (c) 플래그는 스크립트가 만든 자식 환경 객체에만 두고 부모 `process.env`는 바꾸지 않는다(시험이 부모 객체 불변과 소스에 `process.env` 대입이 없음을 확인). (d) 원격 주소 문자열이 소스에 없고 요청은 서버가 알려 준 로컬 주소로만 간다. 이 실행에서 작업 트리에는 `.env.local.example` 외의 환경 파일이 없었다.

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`(`M3a-tsc.log`). **E3 린트**: `pnpm lint` → `exit=0`(`M3a-lint.log`), 새 TS 아홉 개 `prettier --check` 통과(`M3a-prettier.log`). **E4 전체 시험**: `pnpm test` → `Test Files 122 passed (122)`, `Tests 1347 passed (1347)`, `exit=0`(`M3a-test-full.log`; M2 기준선 1270 + 새 77). **E5 `pnpm verify:flag-runtime`** → `불일치 관측 합계: 0`, `exit=0`(`M3a-flag-runtime.log`). **E6 `pnpm build`** → `exit=0`(`M3a-build.log`, 라우트 `/`, `/_not-found`, `/api/consultations`, `/consult`, `/result`; 빌드 로그에 환경 변수 없는 빌드의 `instrumentation` 부팅 검증 메시지가 있으나 종료 코드는 0이다). **E7 커버리지**(명령줄 덮어쓰기, `M3a-cov-json.log`): `gate-state-table.ts` 구문·분기·함수·줄 100%(93/93), `exposure-record.ts` 100%(60/60), `verify-gate-reachability.ts` 구문 60.37%(64/106)·분기 67.21%. 스크립트의 미덮개는 `main`·`runPnpm`·`countConsultations`·`observe`(빌드·서버 실행 배선)이며 단위 시험이 아니라 위 실제 실행이 덮는다. 순수 판정·안전 함수는 모두 시험으로 덮인다.

**변경 범위 확인**: `git diff --stat ebfe670 HEAD -- app components lib/diagnosis lib/consult lib/env.ts .github package.json pnpm-lock.yaml`(커밋 뒤)는 새 시험 `lib/diagnosis/flags.gate-table.test.ts` 한 줄만 낸다.

**발견(SPEC 문서는 고치지 않았다, 적힌 대로 진행하고 말하지 않은 곳은 닫았다)**:

1. **REQ-010의 표 모양**: REQ-B2CLAUNCH-010은 "진단 3종(8)·상담 2종(4)·시크릿 설정 여부의 조합마다" 네 경로의 도달 상태를 적으라고 하는데, AC-010 시나리오 1과 `spec.md` §2.3은 8행 + 4행 = 12행이다. 곱(64조합)이 아니라 §2.3의 12행으로 읽었고 시크릿 차원은 P×S 4행의 별도 표(부팅 가능/부팅 불가)로 두었다(S는 P=0에서 도달 상태에 영향이 없다고 §2.3이 적었다). 경로별 도달 칸은 §2.3의 표에 없고 "경로별 도달 규칙" 문단에 산문으로만 있어 그 규칙을 칸으로 옮겼다.
2. **`/result`의 상담 CTA**: "`/result`가 열렸을 때 상담 CTA는 C가 참일 때만 활성"이라는 규칙은 표의 `/result` 칸(본 화면/placeholder)에 담기지 않아 런북 문장으로만 있다. 표가 이 차원을 보지 못한다.
3. **`C0P1`이 부팅 가능한가**: §2.3 상담 표는 `C=0 P=1` 행을 "접수 열림"으로 적지만 시크릿이 없으면 그 상태로 부팅하지 못한다. 상담 표 행에는 표시를 붙이지 않고 별도 부팅 표가 그 조건을 적었다.
4. **부팅 누락 목록의 다른 항목**: `validateEnv("app")`은 `LLM_PROVIDER_MODE`가 `deterministic`이 아니면 `GEMINI_API_KEY`도 요구한다. AC는 이를 말하지 않는다. 시험은 `deterministic`을 두어 시크릿 게이트만 분리했고, 실제 운영 환경의 누락 목록은 이 둘을 함께 낼 수 있다. 빈 문자열 시크릿이 미설정으로 읽히는 것(`!source[name]`)도 현재 코드의 동작을 시험으로 고정한 것이며 SPEC은 "설정 여부"의 정의를 적지 않았다.
5. **"제한 없음"의 표현**: AC-009 시나리오 1은 (다)에서 "제한이 없다고 적었는데"를 말하지만 그것을 어떻게 적는지 어휘를 정하지 않았고(제한 수단 어휘는 D-LAUNCH-01 대기) (가)는 수단 위치를 "저장소 안/밖" 둘로만 적는다. `수단 위치` 칸의 세 번째 값 `제한 없음`을 만들었다. 제한이 없다면서 제한 수단이 채워진 기록은 모순이라 거부했다(SPEC에 없는 fail-closed 규칙). 다른 표현(예: 별도 열)이 맞는지는 SPEC이 정해야 한다.
6. **노출 기록의 칸 이름·경로 식별자**: SPEC은 열 이름과 다섯 번째 경로의 식별자(`?devStep=`·`?devFixture=` 질의)를 정하지 않았다. 열 일곱(도달 경로·도달 대상·제한 수단·수단 위치·외부 관측 기록·수용 역할·수용 날짜)과 경로 식별자 `?devStep=·?devFixture=`(질의 둘을 한 행으로)를 임의로 붙였다. 질의 둘을 한 행으로 볼지 두 행으로 볼지도 SPEC이 말하지 않았다(AC는 "다섯 종류"라 한 행으로 읽었다).
7. **외부 관측 기록 식별자**: 검사기는 칸이 차 있는지만 보고 식별자 형식도, 그 칸에 주소나 연락처가 적혔는지도 보지 않는다. AC가 "식별자의 존재만 본다"고 적은 한계와 같다.
8. **AC-009 시나리오 2의 행 수 측정 방법**: AC는 "행 수가 요청 전과 같다"고만 적고 읽는 수단을 정하지 않았다. 서버가 쓰는 같은 로컬 파일 DB를 별도 클라이언트로 직접 세었다. 관측 요청의 값(결과 식별자·이름·연락처·동의 버전·멱등 키)은 호출마다 실행 시점에 만든다.
9. **환경 파일 거부와 `.worktreeinclude`**: Next.js 프로덕션 빌드·시작은 프로젝트 루트의 환경 파일을 읽는다. 안전 규칙 "환경 파일·실제 시크릿을 읽지 않는다"를 지키려고 그 파일이 있으면 실행을 거부하는데, `.worktreeinclude`가 새 격리 폴더에 `.env.local`을 복사하므로 새 폴더에서는 지우기 전에 이 스크립트가 거부한다(기존 기준선 측정에서도 같은 파일을 지웠다).
10. **AC-009 시나리오 2와 AC-010 시나리오 3은 같은 후보 스크립트**: AC들은 둘 다 `scripts/verify-gate-reachability.ts`를 후보로 적었다. 이번 단위는 시나리오 2의 한 시작 조합만 구현했다. 시나리오 3의 교차 조합 셋(진단 production 열림×C·P, 진단 닫힘×C·P, 진단 닫힘×C=거짓·P=참)을 추가할 때 같은 스크립트의 시작 조합을 늘리면 된다(시작마다 서버 기동이 필요하다).

**편차(보고 대상)**: (a) `package.json`의 기존 검증 스크립트(`verify:flag-runtime`, `verify:remote-consult`)는 등록돼 있어 새 스크립트를 등록하는 것이 확립된 패턴이지만 `package.json`은 이 단위의 범위 밖이라 등록하지 않았다. 실행은 `pnpm exec tsx scripts/verify-gate-reachability.ts`다. (b) `scripts/verify-flag-runtime.ts`의 `runPnpm`·`assembleEnv`·`FLAG_KEY_RE`는 export돼 있지 않고 그 파일 수정은 범위 밖이라 같은 15줄가량을 새 스크립트에 다시 적었다(`extractTitle`, `startManagedServer`, `findRemoteDatabaseViolation`은 import해 재사용). (c) 런북 머리말은 "기록·서명·연락처·값·주소·보관 위치를 담지 않는다"고 적는데 새 `## 게이트 상태 표`는 코드에서 얻은 사실 표이고 `## 노출 기록 양식`은 양식만 적었다(값이 든 행 없음).

**Gaps(관측하지 못한 것)**: 운영 호스트·프록시·실제 네트워크 노출, 운영 환경 변수 소스 해석, 값에 공백이 붙은 운영 입력 실수(함수 수준의 엄격 일치만 시험). 도달 관측은 한 번의 로컬 실행이며 한 번 통과했다는 사실이 불안정이 없다는 증명은 아니다. AC-010 시나리오 3의 교차 조합 로컬 관측은 하지 않았다. `pnpm test:e2e`·`pnpm visual:verify`는 화면이 바뀌지 않아 실행하지 않았다. `moai` CLI·MCP가 연결되지 않아 `moai spec lint`·@MX 태그 점검은 실행하지 못했고 @MX 태그는 추가하지 않았다. 독립 기대값은 `spec.md` §2.3을 같은 사람이 옮긴 것이라 SPEC 읽기가 틀리면 기대값과 표가 같이 틀린다(`spec.md`와의 대조 시험이 옮김 자체의 실수는 잡는다). 노출 기록 검사기의 열·어휘 선택(발견 5·6)은 SPEC이 정하지 않은 부분의 임시 닫음이다.

**잔여 위험**: 런북 표가 사람이 고치는 문서라 게이트 함수·페이지·부팅 검증이 바뀌면(EV-L1, ENGINE-001이 게이트 입력을 바꾸면 N6) 이 표와 기대값 리터럴을 함께 갱신해야 한다 — 시험은 어긋나면 실패하게 해 두었으나 기대값 리터럴 자체를 자동으로 고치지는 않는다. 로컬 도달 관측은 운영 호스트의 노출 증거가 아니다(D-LAUNCH-01 (e)). 스크립트의 배선 부분(빌드·서버 기동)은 단위 시험이 없고 실제 실행으로만 덮인다.

### M3b (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `4c466fc` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M3b-*.log`다. 이 커밋의 SHA는 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **범위(사용자 결정)**: M3의 뒤 절반 — REQ-B2CLAUNCH-011·012, 곧 AC-011(전환 목록 점검기)과 AC-012(`DIAGNOSIS_ENGINE_READY` 설정 단계 점검과 저장소 코드 오라클). AC-010 시나리오 3(교차 조합 세 가지의 로컬 서버 관측)은 이 단위에 없어 구현하지 않았다. `spec.md`·`plan.md`·`acceptance.md`, `app/`, `components/`, `lib/diagnosis`, `lib/consult`, `lib/env.ts`, `.github/`, `package.json`, M3a 모듈은 바꾸지 않았다. SPEC 문구의 틈은 고치지 않고 적힌 대로 구현하되 말하지 않은 곳은 닫았으며 아래 "발견"에 모았다.
- **변경 파일**: 신규 `lib/launch/procedure-steps.ts`(+시험, 절차 단계 표 파서와 벡터 어휘), `lib/launch/transition-list.ts`(+시험, 순서 표 파서와 전환 점검), `scripts/check-launch-transitions.ts`(+시험, CLI), `lib/launch/engine-ready-step.ts`(+시험), `lib/launch/engine-ready-oracle.ts`(+시험), 신규 시험 `lib/launch/runbook-procedure.test.ts`, `.moai/docs/launch-gate-runbook.md`(`## 플래그 변경 절차` 절만 추가, 기존 절 불변), 이 파일.
- **구현한 것**: (1) 공유 단계 모델: 단계 표(`단계`·`대상 환경`·`설정 변수`·`재시작 횟수`·`전 벡터`·`후 벡터`)와 벡터 어휘(`진단 게이트`·`상담 화면`·`상담 접수`·`시크릿` 네 칸, §2.3). 변수 이름은 §2.3의 여섯 개로, 플래그 값은 `true`·`false`로, 시크릿 변수는 `설정됨` 표지로만 받는다(값 금지). (2) AC-011 점검기: 순서(노출 순서 표)가 입력이고 코드에 박힌 순서가 없으며 순서가 없으면 BLOCKED(종료 코드 3). (3) 런북 절차 절: 순서 표(기록된 벡터 둘과 `결정 대기` 하나)와 단계 표 둘. (4) AC-012 단계 점검: R-02 상태가 입력이다. (5) AC-012 저장소 코드 오라클: AC가 적은 명령을 옮긴 정규식·주석 필터·`*.test.*` 제외, 허용 목록은 호출하는 쪽이 넘긴다.

**RED**(구현 전의 틀: 파서는 항상 실패, 점검은 항상 통과, 오라클은 항상 빈 결과, 새 시험 6개 파일, `M3b-red.log`): `Test Files 6 failed (6)`, `Tests 95 failed | 20 passed (115)`, `exit=1`. 실패 오류 종류는 `AssertionError` 하나뿐이다(대표: `expected 'PASS' to be 'REJECT'`, `expected +0 to be 3`, `expected [] to deeply equal [ 1 ]`, `미구현: expected false to be true`). 모듈 없음·타입 오류·TypeError는 0건이다. 통과한 20건은 틀이 우연히 맞는 경우(어휘 밖 벡터가 `null`, 비일치 샘플이 빈 결과 등)다. **첫 RED 실행은 이 로그가 아니다**: 처음에는 시험 도우미가 틀의 실패를 `throw`로 올리고 한 시험 파일이 수집 단계에서 던져 `Tests 81 failed | 20 passed (101)` 중 일부가 단언 실패가 아니었다(`M3b-red-first-run.log`에 보존). 도우미를 단언 먼저(`expect(parsed.ok)…`)로 고치고 fixture를 시험 안에서 만들도록 바꾼 뒤 다시 실행한 것이 `M3b-red.log`다. 구현 코드는 두 실행 사이에 바꾸지 않았다.

**GREEN**: 1차(`M3b-green-1.log`)는 `Tests 1 failed | 114 passed (115)` — 실패 1건은 **시험 도우미의 결함**이었다(기본값이 있는 매개변수에 `undefined`를 넘기면 기본 순서가 쓰여 "순서 없음" 시험이 순서 있음으로 돌았다). 도우미를 `null`로 바꾸고 고쳤다. 2차(`M3b-green-2.log`): `Test Files 6 passed (6)`, `Tests 115 passed (115)`, `exit=0`. 이후 새 파일 8개를 `prettier --write`로 정리했고 정리 뒤 커버리지 실행(`M3b-cov.log`)과 전체 시험이 다시 통과했다.

**변이 확인**(일부러 바꾼 코드를 시험이 잡는지, 원문 복구 확인됨): (a) 재시작 검사를 `!== 1`에서 `< 1`로 → `M3b-mutation-restarts.log` 3건 실패. (b) 인접 검사를 `!== 1`에서 `=== 0`으로 → `M3b-mutation-adjacent.log` 2건 실패. (c) R-02 검사를 `&& false`로 → `M3b-mutation-r02.log` 6건 실패. (d) 비시험 파일에 엔진 준비 변수 대입 줄 하나를 심으면 저장소 오라클 시험이 그 파일과 줄을 적고 실패(`M3b-mutation-oracle.log`, 2건), 심은 파일은 지웠다.

**E1 AC-B2CLAUNCH-011 — 전환 목록 fixture 네 가지**(합성 순서 벡터 넷 V1~V4 위, 시험이 순서·단계 표를 마크다운으로 만들어 `checkTransitionsFromMarkdown`에 넘김. "위반 번호"는 출력의 `위반한 전환 번호:` 줄):

| fixture | 기대 | 관측(종료 코드·출력) | 판정 |
|---|---|---|---|
| (가) 모든 전환이 순서의 인접한 두 벡터 사이이고 재시작 한 번(단계 3개, 단계 3은 시크릿과 `CONSULT_POLICY_READY=true`가 같은 단계) | 통과 | 0, `단계 1~3: 통과`, `판정: 통과` | PASS |
| (나) 단계 2의 후 벡터가 순서에 없음 | 거부, 전환 번호 2 | 1, `단계 2: 거부 — 후 벡터가 순서에 기록된 벡터가 아니다`, `위반한 전환 번호: 2` | PASS |
| (다) 단계 2가 재시작 2회 | 거부, 전환 번호 2 | 1, `단계 2: 거부 — 재시작 횟수가 1이 아니다`, `위반한 전환 번호: 2` | PASS |
| (라) 단계 2가 전·후 벡터를 적지 않음 | 거부, 전환 번호 2 | 1, `단계 2: 거부 — 전 벡터를 적지 않았다; 후 벡터를 적지 않았다`, `위반한 전환 번호: 2` | PASS |

네 fixture의 종료 코드는 `[0, 1, 1, 1]`이라 통과는 (가) 하나뿐이다(시험이 직접 확인). 추가로 시험한 것: 순서가 없으면 BLOCKED(입력 없음·표 없는 문서·행 없는 표·`결정 대기` 행뿐인 표 모두 종료 코드 3, (가) fixture도 통과가 아니다), 기록된 벡터를 건너뛴 비인접 전환·전·후가 같은 단계·재시작 0회·순서에 없는 전 벡터 거부, 두 벡터 사이에 `결정 대기` 항목이 있으면 BLOCKED, 결정 대기 벡터가 있는 단계는 BLOCKED이고 확정된 위반이 있으면 거부가 우선, 시크릿 설정과 `CONSULT_POLICY_READY=true` 불일치(양방향) 거부, 표 칸 오류·순서 표 오류는 종료 코드 2, 출력이 칸의 값을 되풀이하지 않음, CLI 사용법 오류 종료 코드 2.

**E1 AC-B2CLAUNCH-011 — 런북 열람 두 조건**(`lib/launch/runbook-procedure.test.ts`가 런북 `## 플래그 변경 절차` 절을 점검기와 같은 파서로 읽음; CLI 실제 실행 `pnpm exec tsx scripts/check-launch-transitions.ts --steps .moai/docs/launch-gate-runbook.md --order .moai/docs/launch-gate-runbook.md`, `M3b-cli-runbook.log`):

| 조건 | 관측 | 판정 |
|---|---|---|
| 플래그 변경 단계마다 "전 벡터 → 후 벡터"가 §2.3 어휘로 적혀 있다 | 단계 1은 네 칸 벡터 둘을 적었다. **단계 2는 전·후 벡터가 `결정 대기`다** — 상담 쪽 벡터와 순서가 결정 기록에 없어 지어내지 않았다(발견 1). 그래서 이 조건은 단계 1에만 충족이고 단계 2는 결정 대기 표지다 | 부분(단계 2 BLOCKED) |
| 시크릿 설정 단계가 `CONSULT_POLICY_READY`를 `true`로 바꾸는 같은 재시작 단계 안에 있고 CONSULTOPS-001 REQ-B2CCONSULTOPS-011을 가리킨다 | 단계 2가 `CONSULT_POLICY_READY=true`와 `RATE_LIMIT_HMAC_SECRET=설정됨`을 한 단계(재시작 1)에 담고, 절이 `REQ-B2CCONSULTOPS-011`을 가리킨다. 시크릿 변수가 있는 단계는 이 하나뿐이고 `CONSULT_POLICY_READY`를 `true`로 바꾸는 단계도 이 하나뿐이다 | PASS |

CLI 실제 출력: `단계 1: 통과` / `단계 2: BLOCKED — 전 벡터가 결정 대기다; 후 벡터가 결정 대기다` / `BLOCKED 전환 번호: 2` / `판정: BLOCKED`, `exit=3`. 단계 1만 따로 점검하면 순서 표의 두 기록된 벡터에서 통과한다(시험).

**E1 AC-B2CLAUNCH-012 — 항목·절차 fixture 다섯 가지**(R-02 상태는 fixture가 정한 입력이다. 실제 R-02 판정은 ENGINE-001 증거 기록의 형식이 정해지기 전이라 **BLOCKED**이며 이 단위는 상태 소스를 지어내지 않았다. 상태 입력 없이 점검하면 출력이 `R-02 실제 판정: BLOCKED — …`를 적는다):

| fixture | 입력 | 기대 | 관측 | 판정 |
|---|---|---|---|---|
| (가) | R-02 UNVERIFIED, 운영 호스트 단계가 엔진 준비 변수만 `true`로 설정 | 거부 | `단계 1: 거부 — 이 단계가 운영 호스트에서 DIAGNOSIS_ENGINE_READY를 참으로 설정한다 — R-02가 READY가 아니다` | PASS |
| (나) | R-02 READY, 같은 단계 | 통과 | `단계 1: 통과`, `판정: 통과` | PASS |
| (다) | R-02 UNVERIFIED, 운영 호스트 절차가 `ENABLE_DIAGNOSIS_FLOW`만 설정 | 통과 | `단계 1: 통과` | PASS |
| (라) | R-02 UNVERIFIED, 한 재시작에 `ENABLE_DIAGNOSIS_FLOW`와 엔진 준비 변수를 함께 `true`로 설정 | 거부 | (가)와 같은 거부 줄 | PASS |
| (마) | R-02 UNVERIFIED, 대상 환경이 별도 환경인 단계가 엔진 준비 변수를 `true`로 설정 | 통과 | `단계 1: 통과` | PASS |

기대 결과 `[거부, 통과, 통과, 거부, 통과]`가 시험의 실제 관측과 같다. 추가: READY가 아닌 모든 값(`BLOCKED`·소문자·빈 값·알 수 없는 값)은 READY로 읽지 않고 알 수 없는 입력 값은 출력에 되풀이하지 않음, 로컬 환경 단계와 엔진 준비 변수를 `false`로 두는 운영 호스트 단계는 통과, 여러 단계 중 위반한 번호만 적음. 런북 절차에 같은 점검을 적용하면 R-02가 READY가 아닐 때 단계 1이 거부되고(`위반한 단계 번호: 1`) READY이면 통과한다(시험).

**E1 AC-B2CLAUNCH-012 — 저장소 코드 오라클**(현재 트리 `4c466fc` + 이 단위의 새 파일, 이 세션 실행):

| 구현 | 명령 | 관측 |
|---|---|---|
| TypeScript 오라클 | `pnpm exec tsx -e "import('./lib/launch/engine-ready-oracle.ts').then(…scanTree(process.cwd())…)"`(`M3b-oracle-ts-observed.log`) | 2줄: `scripts/verify-flag-runtime.ts:174` `DIAGNOSIS_ENGINE_READY: String(start.engine),`, `scripts/verify-flag-runtime.ts:293` `env.DIAGNOSIS_ENGINE_READY = String(flags.diag.engine);`. 없는 경로 0개 |
| AC 명령 그대로(교차 확인) | `grep -rnE -f <패턴 파일> app components lib scripts instrumentation.ts playwright.config.ts package.json .github .env.local.example --exclude='*.test.*'`(`M3b-oracle-grep-raw.log`)와 `//`·`*`·`#` 줄 거르기(`M3b-oracle-grep-filtered.log`) | 거르기 전 3줄(위 둘과 `components/diagnosis/step-loading.tsx:42`의 `// @MX:UPGRADE: …` 주석 한 줄), 거른 뒤 위 두 줄. `app`·`components`·`lib`·`.github`는 0줄 |

허용 목록(시험 `lib/launch/engine-ready-oracle.test.ts`): 파일 `scripts/verify-flag-runtime.ts`의 위 두 줄 내용. 시험은 "찾은 줄 = 허용 목록, 정확히 같음"(허용 목록 밖의 줄도 트리에서 사라진 허용 항목도 실패)이고 둘 다 통과했다. AC가 적은 샘플 — 일치: `DIAGNOSIS_ENGINE_READY=true`, 점 접근·대괄호 접근 `process.env…= "true"`, JSON 키, 객체 `: 'true'`, 백틱 값, `export …=1` — 불일치: 공백 구분 `ENV … true`, `??=`, `===` 비교, `//` 주석 줄 — 를 모두 시험했다. `ENV … true`와 `??=`는 이 명령의 맹점이라 일치하지 않는 것이 맞는 결과이고(시험이 그 사실을 고정했을 뿐 이 오라클이 그것을 잡는다고 말하지 않는다), 변수 이름을 계산해 만드는 대입, 실제 `.env*` 파일, 운영 호스트의 PM2 저장 환경·셸 프로필, 시험 파일은 이 오라클이 보지 못한다.

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`(`M3b-tsc.log`). **E3 린트**: `pnpm lint` → `exit=0`(`M3b-lint.log`), 새 TS 열한 개 `prettier --check` 통과(`M3b-prettier.log`; 처음 검사(`M3b-prettier-0.log`)에서 8개가 어긋나 `prettier --write`로 정리했다). **E4 전체 시험**: 1차 `pnpm test` → `Test Files 1 failed | 127 passed (128)`, `Tests 1 failed | 1461 passed (1462)`, `exit=1`(`M3b-test-full.log`) — 실패는 기존의 일시 실패 `scripts/verify-remote-consult.test.ts`(`gateCase.checks.length` `expected 0 to be greater than 0`) 하나뿐이었다. 그 파일만 다시 실행하면 `Tests 61 passed (61)`, `exit=0`(`M3b-remote-consult-rerun.log`). 전체 2차 → `Test Files 128 passed (128)`, `Tests 1462 passed (1462)`, `exit=0`(`M3b-test-full-2.log`; M3a 기준선 1347 + 새 115). **E5 커버리지**(명령줄 덮어쓰기, `M3b-cov.log`·`M3b-cov-summary.log`): `procedure-steps.ts` 구문 100%(90/90)·분기 100%, `transition-list.ts` 100%(114/114)·분기 100%, `engine-ready-step.ts` 100%(20/20)·분기 100%, `engine-ready-oracle.ts` 구문 97.77%(44/45)·분기 92%, `scripts/check-launch-transitions.ts` 구문 82.35%(28/34)·분기 78.94%(미덮개는 사용법 오류가 아닌 예외를 다시 던지는 줄과 `isMain` 출력 블록이며 CLI 실제 실행이 덮는다). 새 lib 네 파일 모두 85% 이상. 이 단위는 화면·런타임을 바꾸지 않아 `pnpm build`·`pnpm test:e2e`·`pnpm visual:verify`·`pnpm verify:flag-runtime`은 실행하지 않았다.

**변경 범위 확인**: `git diff --stat 4c466fc -- app components lib/diagnosis lib/consult lib/env.ts .github package.json pnpm-lock.yaml`와 `spec.md`·`plan.md`·`acceptance.md`의 diff는 비어 있다(보고에 원문).

**발견(SPEC 문서는 고치지 않았다, 적힌 대로 진행하고 말하지 않은 곳은 닫았다)**:

1. **D-LAUNCH-03 결정 기록에 벡터 순서가 없다**: 결정 기록은 `Q1 (a) 진단 먼저, 상담은 이후 별도 노출 확대. Q2 (4) 첫 표면만`뿐이고 AC-011이 말하는 "순서(벡터의 순서)"는 담지 않았다. 런북 순서 표에는 결정 기록과 단계 정의 표에서 따라 나오는 두 벡터(배포 완료 dark, 진단만 production 경로로 열림)만 적고 나머지는 `결정 대기`로 두었다. AC-011의 선결(`D-LAUNCH-03 — 결정 전에는 BLOCKED`)은 D-LAUNCH-03이 2026-10-03에 결정된 지금도 상담 쪽 전환에서 충족되지 않는다 — 결정이 벡터 순서까지 기록해야 점검기가 BLOCKED를 벗어난다. 상담 화면(`C`)과 접수(`P`)를 같은 재시작에서 여는지, `C`만 거짓·`P`만 참인 조합(§2.3 상담 표 둘째 행)이 어느 벡터에 들어가는지도 결정 기록에 없다.
2. **벡터의 시크릿 칸**: §2.3 "벡터와 전환"은 시크릿 설정 여부를 벡터의 칸으로 적지만 값 이름은 정하지 않았다. 단계 정의 표의 벡터는 세 칸(정규식 `STAGE_VECTOR_PATTERN`)이라 네 칸 벡터와 다르다. §2.3이 쓰는 어휘(`설정됨`, `설정되지 않음`)로 네 번째 칸을 적었고, 순서 표 1·2번의 `설정되지 않음`은 결정 기록이 아니라 REQ-B2CCONSULTOPS-011("`CONSULT_POLICY_READY=true` 설정과 같은 재시작에 함께 설정")에서 따라 나오는 추론이다(근거 칸에 적음).
3. **진단 게이트의 열림 표기**: AC는 "§2.3의 어휘"라고만 적었다. §2.3 진단 표의 `열림(production 경로)`·`열림(review 경로)`·`열림(둘 다)`를 썼고, 단계 정의 표의 벡터 정규식은 경로 구분 없는 `열림`만 허용한다 — 두 표기가 다르다.
4. **전환 번호**: AC가 "위반한 전환 번호"라고만 적어 단계 표의 `단계` 칸 값을 전환 번호로 읽었다(한 단계 = 전환 하나).
5. **재시작 횟수 0**: (가)는 "재시작 한 번", (다)는 "재시작 둘"만 말한다. 0회는 말하지 않았고 환경을 바꾸는 전환에는 재시작이 있어야 하므로 정확히 1이 아니면 거부한다.
6. **벡터가 안 바뀌는 단계**: REQ-011은 "인접한 두 벡터 사이"만 말한다. 전·후 벡터가 같은 단계(예: `ENABLE_DIAGNOSIS_FLOW`만 설정)는 거부한다. 그런데 AC-012 (다)는 바로 그런 단계(`ENABLE_DIAGNOSIS_FLOW`만 설정)를 통과시킨다 — 두 점검은 다른 질문에 답하므로 충돌은 아니지만, 같은 절차를 두 점검에 모두 넘기면 AC-012에서 통과한 단계가 AC-011에서 거부될 수 있다. SPEC은 벡터를 바꾸지 않는 플래그 변경 단계를 어떻게 다룰지 말하지 않았다.
7. **전환의 방향**: "인접한 두 벡터 사이"를 방향 없이 읽어 역방향 인접 전환도 통과한다(롤백은 M5 범위이고 L-06이 따로 다룬다).
8. **순서 안의 `결정 대기` 항목**: 기록된 두 벡터 사이에 `결정 대기` 항목이 있으면 인접 여부를 알 수 없어 BLOCKED로 읽는다. 순서에 없는 벡터는 `결정 대기` 항목이 있어도 거부다("기록되지 않은 벡터를 거치지 않는다"의 문자 그대로).
9. **시크릿 규칙의 범위**: AC는 시크릿과 `CONSULT_POLICY_READY=true`가 같은 단계라는 것을 "런북 열람" 조건으로만 적었다. 점검기 규칙으로도 구현했고 양방향이다(시크릿만 따로 설정하는 단계도 거부) — AC가 요구한 것보다 넓다.
10. **변수·값 어휘의 제한**: 단계 표는 §2.3의 여섯 변수 이름만 받고(그 밖의 변수는 시크릿 값을 담을 수 있어 거부) 플래그 값은 `true`·`false`만 받는다. 게이트가 정확히 `"true"`만 켜짐으로 읽으므로(LF-05) `TRUE`·`1`을 적은 절차는 점검 대상이 아니라 입력 거부(종료 코드 2)다.
11. **오라클 허용 목록의 키**: AC는 하네스 두 줄을 줄 번호(`:174`, `:293`)로 적었다. 줄 번호는 하네스 파일을 한 줄만 고쳐도 어긋나서 허용 목록은 (파일, 줄 내용)으로 두고 줄 번호는 관측 출력에만 적었다. 하네스의 해당 줄 내용이 바뀌면 시험이 실패하고 허용 목록을 사람이 갱신해야 한다.
12. **오라클 주석 필터**: "`//`·`*`·`#`로 시작하는 줄"을 앞 공백을 뺀 줄 시작으로 읽었다. 줄 끝 주석과 `/*`로 시작하는 줄은 거르지 않는다(대입처럼 보이면 허용 목록 밖으로 걸리는 보수적 방향이며 시험이 이 동작을 고정한다).
13. **오라클 범위**: 지시문은 "추적 소스 트리"라고 했으나 AC의 명령은 디렉터리를 훑는다. AC의 명령을 따랐고 미추적 파일도 읽는다(`git ls-files`를 쓰지 않았다).
14. **R-02의 의미**: REQ-012는 R-02가 `READY`가 아닌 동안 `true` 설정 단계의 "수행"을 막는다. 점검기는 R-02 상태를 입력으로 받아 그 단계가 절차에 있으면 거부한다. 따라서 정적 런북에서는 R-02가 `READY`가 아닌 한 단계 1이 항상 거부된다 — 이 절이 단계를 적는 것 자체는 허용으로 읽었다(수행이 아니다).
15. **순서 표 입력 규칙**: 순번이 1부터 연속이어야 하고 근거 칸이 비어 있으면 안 되며 같은 벡터가 겹치면 안 된다는 규칙은 SPEC에 없는 fail-closed 닫음이다.

**편차(보고 대상)**: (a) `package.json`의 기존 검증 스크립트는 등록돼 있어 새 스크립트를 등록하는 것이 확립된 패턴이지만 `package.json`은 이 단위의 범위 밖이라 등록하지 않았다. 실행은 `pnpm exec tsx scripts/check-launch-transitions.ts`다. (b) AC-012 점검은 지시대로 lib와 시험만 만들고 CLI를 만들지 않았다(R-02의 실제 상태 소스가 없어 CLI가 입력받을 수 있는 것은 fixture 상태뿐이다). (c) RED 첫 실행의 단언 실패 아닌 오류(시험 도우미 `throw`·수집 단계 예외)를 고쳐 다시 실행했다(위 RED). (d) GREEN 1차의 실패 1건은 시험 도우미의 결함이었다(위 GREEN). (e) `prettier --write`는 이 단위의 새 파일에만 적용했다.

**Gaps(관측하지 못한 것)**: 운영 호스트에서 재시작이 실제로 한 번만 일어났는지, 재시작이 바뀐 환경을 읽는지(R-04가 가리키는 E-03). 점검기는 단계 표가 적은 벡터를 설정 변수에서 다시 계산하지 않고 앞 단계의 후 벡터와 다음 단계의 전 벡터가 이어지는지도 보지 않는다. R-02의 실제 상태(상태 소스 없음). 실제 `.env*` 파일과 운영 호스트의 PM2 저장 환경·셸 프로필, 변수 이름을 계산해 만드는 대입, `ENV … true`·`??=` 대입 형태. 두 번째 이후 노출 확대 단계(상담)의 벡터와 순서. `moai` CLI·MCP가 연결되지 않아 `moai spec lint`·@MX 태그 점검은 실행하지 못했고 @MX 태그는 추가하지 않았다. 변이 확인은 네 가지만 했다.

**잔여 위험**: 런북 순서 표와 단계 표는 사람이 고치는 문서라 D-LAUNCH-03 결정이 벡터 순서를 기록하면 `결정 대기` 항목과 단계 2의 벡터를 사람이 채워야 하고 그때 점검기가 BLOCKED를 벗어난다(시험 `runbook-procedure.test.ts`는 현재의 두 기록 벡터와 `결정 대기` 하나를 고정하므로 그 변경 때 함께 갱신해야 한다). 오라클 허용 목록은 하네스 줄 내용에 묶여 있다(발견 11). 벡터 어휘의 시크릿 칸·경로 칸은 SPEC이 값 이름을 정하지 않은 부분의 임시 닫음이다(발견 2·3).

### M4 (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `3acb6db` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M4-*.log`다. 이 커밋의 SHA는 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **범위(사용자 결정)**: REQ-B2CLAUNCH-013 / AC-B2CLAUNCH-013 — D-LAUNCH-06(2026-10-03) 설계 (a) "두 상태(게이트 닫힘·열림) 모두 수용", 위치 (ii) "저장소 스크립트". 커밋 경로는 `--pr`(Route B, M1~M6이 한 run PR)이다. **`deploy.yml` 변경은 이 단위에서 만들었을 뿐 `main`에 병합하지도, 푸시하지도, 어디에 적용하지도 않았다. L-01 운영 기준선 관측 기록이 생긴 뒤에만 병합할 수 있으며(별도의 사람 작업) 그 전에는 병합 대상이 아니다.** N4(완료된 DIAGNOSIS-001 smoke 트리거 문장의 정리 여부)는 열린 채로 두고 이 SPEC 문구(L-05·REQ-013, DIAGNOSIS-001보다 넓게 읽음)대로 구현했다. `spec.md`·`plan.md`·`acceptance.md`는 고치지 않았다.
- **변경 파일**: 신규 `lib/launch/smoke-check.ts`(+시험, 판정 로직), `scripts/smoke-check.ts`(+시험, CLI), `scripts/verify-smoke-check.ts`(+시험, 로컬 상태 관측 하네스), `scripts/deploy-workflow-static.test.ts`(워크플로 정적 시험), 변경 `.github/workflows/deploy.yml`(smoke 세 단계 → 스크립트 호출 한 단계, 아래 표), 이 파일. `app/`·`components/`·`lib/diagnosis`·`lib/consult`·`lib/env.ts`·`package.json`·`pnpm-lock.yaml`·다른 워크플로·M1~M3b 모듈은 바꾸지 않았다(후속 커밋에서 `scripts/verify-flag-runtime.ts`의 함수 두 개에 `export`만 더했다 — 발견 8).
- **예전 `deploy.yml` smoke가 한 일**(읽은 사실, `pm2 restart`·`pm2 save` 다음 단계): (1) `GET /`을 최대 10회(요청당 5초 상한, 사이 2초 대기) 시도해 2xx가 오면 본문을 임시 파일에 저장하고 끝까지 2xx가 아니면 `exit 1`. (2) 그 본문에 `서비스 준비 중입니다`가 `grep -q`로 없으면 `exit 1` — **진단 게이트가 열리면 이 문구가 사라져(LF-04·LF-12, 열린 실제 서버 응답에서도 이번에 관측: 아래 (나)(다)(라)의 게이트 상태 "열림") 정상 배포가 실패한다.** (3) 본문의 첫 CSS 청크 경로를 `grep -oE`로 뽑아 없으면 `exit 1`, 있으면 그 경로를 한 번 요청해 2xx가 아니면 `exit 1`. 그 뒤 제거된 B2B 라우트 두 곳을 요청해 상태만 적는 정보용 블록(배포를 실패시키지 않음)이 이어진다.

**RED**(구현 전의 틀: 로직 함수는 항상 실패 값, 하네스 표는 빈 배열, 예전 `deploy.yml` 그대로; 새 시험 3개 파일, `M4-red.log`): `Test Files 3 failed (3)`, `Tests 43 failed | 12 passed (55)`, `exit=1`. 실패 오류 종류는 `AssertionError` 하나뿐이다(대표: `expected [] to deeply equal [ [ 'home', true ], …]`, `expected 'name: Deploy to Oracle Cloud VM…' not to contain '서비스 준비 중입니다'`, `expected [Function] to throw an error`). 통과한 12건은 틀이 우연히 맞는 경우다. **첫 RED 실행은 이 로그가 아니다**: 시험 도우미(`stateById`)가 표에 상태가 없을 때 `throw`해 6건이 단언 실패가 아니었다(`M4-red-first-run.log`에 보존). 도우미를 단언 먼저로 고치고 다시 실행한 것이 `M4-red.log`이며 구현 코드는 두 실행 사이에 바꾸지 않았다.

**GREEN**: 로직·하네스·CLI를 구현하자 `M4-green-1.log`는 `Tests 52 passed (52)`(`scripts/smoke-check.test.ts` 9건 포함, 이 CLI 시험은 로직 GREEN 뒤에 썼다 — 스무 줄 남짓한 래퍼라 RED를 따로 두지 않았다). `deploy.yml`을 바꾼 뒤 `M4-green-2.log`: `Test Files 4 passed (4)`, `Tests 60 passed (60)`, `exit=0`. 이후 `tsc`가 `/s` 정규식 플래그를 거부해(`TS1501`, 대상이 es2018 미만) `[\s\S]`로 바꿨고(`M4-tsc.log` 최종 `exit=0`), 엔진 준비 오라클 시험이 새 하네스의 대입 줄을 잡아 처음에는 표 형태로 지나갔다가 후속 커밋에서 철회하고 `assembleEnv` 재사용으로 고쳤다(발견 8). 후속 커밋 뒤 오라클·flag-runtime·새 시험 여섯 파일 109건 통과(`M4b-green-1.log`).

**변이 확인**(일부러 바꾼 코드를 시험이 잡는지, 원문 복구 확인됨): (a) 판정에 `&& gateState === "closed"`를 더해 상태 인지 설계로 → `M4-mutation-gate-aware.log` 7건 실패. (b) 2xx 경계를 `< 300`에서 `<= 300`으로 → `M4-mutation-boundary.log` 1건 실패(300을 실패 목록에 더한 뒤). (c) CSS 청크 응답 검사를 `ok: true`로 → `M4-mutation-css-served.log` 4건 실패.

**E1 AC-B2CLAUNCH-013 — 로컬 일곱 상태**(`pnpm exec tsx scripts/verify-smoke-check.ts`, `M4-seven-states.log`, `exit=0`. (가)~(라)는 로컬 file DB로 시작한 실제 Next 프로덕션 서버(빌드 한 번, 서버 시작 환경만 다름), (마)(바)(사)는 루프백 임시 HTTP 서버. 각 상태에 실제 smoke CLI를 `--attempts=2 --retry-delay-ms=200`으로 돌렸다. 게이트 상태는 정보용 출력이며 판정은 종료 코드다):

| 상태 | 서버 | 기대(종료 코드 / 게이트·정보) | 관측 | 판정 |
|---|---|---|---|---|
| (가) | 플래그 미설정(게이트 닫힘, 변경을 싣는 배포의 상태) | 0 / 닫힘 | 0 / 닫힘 | PASS |
| (나) | `ENABLE_DIAGNOSIS_FLOW`·`DIAGNOSIS_ENGINE_READY`=`true`(production 경로) | 0 / 열림 | 0 / 열림 | PASS |
| (다) | `ENABLE_DIAGNOSIS_DEV_STATES`=`true`(review 경로) | 0 / 열림 | 0 / 열림 | PASS |
| (라) | 둘 다 열림 | 0 / 열림 | 0 / 열림 | PASS |
| (마-1) | 정상 응답, 열림 표지(placeholder 없음) | 0 / 열림 | 0 / 열림 | PASS |
| (마-2) | 정상 응답, 닫힘 표지(placeholder 있음) | 0 / 닫힘 | 0 / 닫힘 | PASS |
| (바) | HTTP 500 | 1 / 알 수 없음 | 1 / 알 수 없음(2회 시도 모두 500) | PASS |
| (사-1) | 200이지만 CSS 청크 참조 없음 | 1 / 열림 | 1 / 열림(`CSS 청크 참조: 본문에 CSS 청크 참조가 없다`) | PASS |
| (사-2) | 200, CSS 청크를 참조하지만 청크가 404 | 1 / 닫힘 | 1 / 닫힘(`CSS 청크 응답: … 상태 404 → 실패`) | PASS |

`불일치 관측 합계: 0`. 설계 (a)에는 기대 상태 입력이 없어 (나)(다)(라)는 (가)와 같은 구성(인자는 기준 주소뿐)으로 통과했다. (마)는 설계 (a)에서 통과가 맞다("두 상태 수용 설계는 통과") — 열림 표지·닫힘 표지 두 방향을 모두 관측했다. 이 설계는 REQ-B2CLAUNCH-013의 (가)(변경을 싣는 배포 = 닫힘에서 통과)·(나)(열림 상태에서도 통과)·(다)(2xx 아님·CSS 청크 미서빙은 게이트 상태와 무관하게 실패)와 어긋나지 않는다(열람: (가)~(라) 통과, (바)(사) 실패 — 위 표).

**E1 AC-B2CLAUNCH-013 — `deploy.yml` 열람·파서**(`scripts/deploy-workflow-static.test.ts`가 파일을 YAML 파서로 읽어 확인, 워크플로를 실행하거나 흉내 내지 않음): 파싱 성공, 트리거(`main` push·수동)·동시성 그룹·`runs-on`·단일 단계 구조 불변, 시크릿 참조는 기존 다섯 개 그대로(새로 늘지 않음), smoke는 `pnpm exec tsx scripts/smoke-check.ts --base-url=…` 한 줄로 호출되며 호출 줄에 파이프·`||`·`& `가 없어 실패하면 `set -e`로 배포 단계가 실패한다, 예전 인라인 검사(placeholder 문구·`smoke-body.html`·`CSS_PATH`·`SMOKE_URL`·`grep -q`)가 파일 어디에도 없다, 순서는 `git reset` → 설치 → 마이그레이션 → 빌드 → 정적 자산 복사 → `pm2 describe` → `pm2 restart` → `pm2 save` → smoke 호출 → 정보용 제거 라우트 확인으로 예전과 같다.

**예전 인라인 검사 대 새 스크립트(`deploy.yml`)**:

| 경우 | 예전(인라인 셸) | 새(저장소 스크립트) |
|---|---|---|
| 게이트 닫힘, 홈 2xx, CSS 청크 서빙 | 통과 | 통과 |
| **진단 게이트 열림(production 경로·review 경로·둘 다), 홈 2xx, CSS 청크 서빙** — 교체의 동기 | **실패**(본문에 placeholder 문구 없음 → `exit 1`, 새 빌드는 이미 가동 중인데 Actions만 빨개짐; LF-03·LF-04·LF-19) | **통과**(게이트 상태는 출력만) |
| 홈이 2xx가 아님(500 등)·연결 불가 | 10회 시도 뒤 실패 | 같음(기본 10회, 사이 2초 — 스크립트 기본값) |
| 홈이 3xx | 실패(curl이 따라가지 않음) | 실패(`redirect: manual`, 시험으로 고정) |
| 200이지만 CSS 청크 참조 없음 | 실패 | 실패 |
| 참조한 CSS 청크가 2xx가 아님·전송 실패 | 실패(한 번 요청) | 실패(한 번 요청, 요청당 5초 상한) |
| 요청 시간 상한 | `curl --max-time 5` | `AbortSignal.timeout(5000)`(본문 읽기 포함) |
| 출력 | 영어 `ERROR:`/`OK:` 줄 | 한국어 관측 줄(상태 코드·CSS 청크 경로·게이트 상태), 응답 본문·기준 주소는 출력하지 않음 |
| 기준 주소 | 워크플로 안의 인라인 리터럴 세 곳 | 인자로 한 곳(`SMOKE_BASE_URL` 셸 변수에 기존 로컬 리터럴을 옮김; 스크립트에는 기본 주소 없음) |

변경한 줄: `pm2 save` 다음 세 smoke 블록(예전 64~118행, 55줄)을 스크립트 호출 한 블록(8줄)으로 바꿨다. 그 앞(`git reset`~`pm2 save`)과 뒤(정보용 제거 라우트 확인 블록)는 바이트 단위로 같다(`git diff`: `+8 −55`, 변경 파일 `.github/workflows/deploy.yml` 하나).

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`(`M4-tsc.log`). **E3 린트**: `pnpm lint` → `exit=0`(`M4-lint.log`), 새 TS 일곱 개 `prettier --check` 통과(`M4-prettier.log`; 처음 검사(`M4-prettier-0.log`)에서 6개가 어긋나 새 파일에만 `prettier --write`를 적용했다). **E4 전체 시험**: 1차 `pnpm test` → `Test Files 1 failed | 131 passed (132)`, `Tests 1 failed | 1522 passed (1523)`(`M4-test-full.log`) — 실패는 일시 실패가 아니라 새 하네스가 M3b 엔진 준비 오라클 시험(`lib/launch/engine-ready-oracle.test.ts`)에 걸린 것이다(발견 8). 고친 뒤 2차 → `Test Files 132 passed (132)`, `Tests 1523 passed (1523)`, `exit=0`(`M4-test-full-2.log`; M3b 기준선 1462 + 새 61). **E5 커버리지**(명령줄 덮어쓰기, `M4-cov.log`): `lib/launch/smoke-check.ts` 구문 100%·분기 98.5%(미덮개 분기 1곳은 인자 오류 문구의 삼항), `scripts/smoke-check.ts` 구문 66.66%(미덮개는 기본 출력 함수와 `isMain` 블록 — 실제 CLI 실행이 덮음), `scripts/verify-smoke-check.ts` 구문 60.49%(미덮개는 빌드·서버 기동 배선 `main`·`observeState` — 실제 일곱 상태 실행이 덮음). 순수 로직(lib)은 85% 이상. **E6 빌드**: `pnpm build` → `exit=0`(`M4-build.log`; 로그에 `Ecmascript file had an error`(instrumentation의 edge 런타임 `process.exit` 경고)가 있으나 M3a 빌드 로그에도 같은 줄이 있는 기존 경고). **E7** `pnpm verify:flag-runtime` → `불일치 관측 합계: 0`, `exit=0`(`M4-flag-runtime.log`). `pnpm test:e2e`·`pnpm visual:verify`는 화면이 바뀌지 않아 실행하지 않았다.

**변경 범위 확인**: `git diff --stat 3acb6db -- app components lib/diagnosis lib/consult lib/env.ts package.json pnpm-lock.yaml .github`는 `.github/workflows/deploy.yml` 한 파일(`8 insertions(+), 55 deletions(-)`)만 보이고, `spec.md`·`plan.md`·`acceptance.md`의 diff는 비어 있다.

**후속 정정 검증(M4b, 오라클 우회 철회, 발견 8; 로그 `M4b-*.log`)**: M3b 오라클 시험 + `verify-flag-runtime` 시험 + 새 시험 넷 → `Test Files 6 passed (6)`, `Tests 109 passed (109)`, `exit=0`(`M4b-green-1.log`). 전체 `pnpm test` 1차 → `Tests 1 failed | 1520 passed (1521)`, 실패는 기존의 일시 실패 `scripts/verify-remote-consult.test.ts`(T4 체크) 하나(`M4b-test-full.log`), 그 파일만 다시 → `Tests 61 passed (61)`(`M4b-remote-consult-rerun.log`), 전체 2차 → `Test Files 132 passed (132)`, `Tests 1521 passed (1521)`, `exit=0`(`M4b-test-full-2.log`; 하네스 환경 시험이 여섯에서 넷으로 줄어 1523에서 1521). `pnpm lint`·`pnpm exec tsc --noEmit` `exit=0`, 만진 세 파일 `prettier --check` `exit=0`, `pnpm verify:flag-runtime` `불일치 관측 합계: 0`(`M4b-flag-runtime.log`), 일곱 상태 관측 다시 `불일치 관측 합계: 0`, 아홉 행 모두 OK(`M4b-seven-states.log`). 오라클 자신의 출력(`M4b-oracle-observed.log`)은 `scripts/verify-flag-runtime.ts:174`·`:293` 두 줄뿐이다.

**발견(SPEC 문서는 고치지 않았다, 적힌 대로 진행하고 말하지 않은 곳은 닫았다)**:

1. **(마)의 "설계가 기대하는 구성과 반대 상태"**: 설계 (a)에는 기대 상태 입력이 없어 "반대"가 하나로 정해지지 않는다. 열림 표지 응답과 닫힘 표지 응답 두 방향을 모두 관측했다((마-1), (마-2)). (사)도 "참조가 없거나 청크가 404"의 두 경우를 모두 관측해(사-1, 사-2) 일곱 상태가 표의 아홉 행이다.
2. **(나)(다)(라)의 "각 상태를 기대하는 구성"**: 설계 (a)에서는 구성이 하나(기준 주소 입력뿐)라 네 서버가 같은 구성으로 통과한다. 이 AC 문구는 상태 인지 설계((b))를 염두에 둔 것으로 읽혔다.
3. **"현행 placeholder 문구 검사가 설계가 정한 형태 밖에 남아 있지 않다"**: 설계 (a)가 placeholder 읽기를 어떤 형태로 허용하는지는 결정 기록에 없다. 워크플로에는 그 문구를 두지 않았고 스크립트가 정보용 게이트 상태 한 줄로만 읽으며 판정에 쓰지 않는다. 정보 출력이 "설계가 정한 형태"인지는 SPEC이 정하지 않았다.
4. **"예전 인라인 title 검사"라는 지시 표현**: 예전 smoke는 `<title>`이 아니라 본문의 placeholder 문구 `grep -q`였다(LF-04). `<title>`은 식별자 후보(LF-12)였을 뿐 예전 검사에는 쓰이지 않았다. 새 검사도 `<title>`을 쓰지 않는다.
5. **정보용 제거 라우트 블록**: "인라인 smoke를 교체"의 대상에 이 블록이 들어가는지 SPEC이 말하지 않는다. 배포를 실패시키지 않는 정보 출력이고 본문 임시 파일에 의존하지 않아 바이트 그대로 두었다.
6. **워크플로의 기준 주소**: 값 금지선(spec.md §D)이 "워크플로 문구에 URL을 더하지 않는다"인데 스크립트는 기본 주소가 없으므로 호출하는 쪽이 주소를 넘겨야 한다. 예전 인라인에 있던 로컬 리터럴을 `SMOKE_BASE_URL` 변수 한 줄로 옮겼다(리터럴 줄 수는 세 곳에서 둘로 줄었다: 이 변수 줄과 정보용 블록의 요청). 이것이 "새 참조를 더한 것"인지는 SPEC 소유자가 판단할 일이다. 환경 입력으로 받는 길도 스크립트에 열어 두었다(`SMOKE_BASE_URL`, 인자가 우선).
7. **재시도·3xx·CSS 재시도 정책**: REQ·AC는 "2xx가 아니면 실패"와 "CSS 청크 미서빙은 실패"만 말한다. 예전 정책(홈 최대 10회·사이 2초·요청당 5초, CSS는 한 번)을 기본값으로 이어받았고 3xx는 따라가지 않는다(curl과 같다). SPEC은 이 숫자들을 정하지 않았다.
8. **M3b 엔진 준비 오라클과의 충돌과 정정(후속 커밋)**: AC-B2CLAUNCH-012의 저장소 코드 오라클은 `DIAGNOSIS_ENGINE_READY`를 대입하는 비시험 줄을 허용 목록(`scripts/verify-flag-runtime.ts` 두 줄)에서만 허용한다. 첫 구현의 새 하네스가 상태 (나)(라)를 위해 그 변수를 `true`로 두는 `if (…) env.…= "true"` 줄로 이 시험에 걸렸고(`M4-test-full.log`), 처음에는 변수 이름을 표로 두고 반복으로 대입하는 형태로 바꿔 오라클 정규식의 맹점으로 지나갔다. **이는 가드를 정직하게 통과한 것이 아니라 구조로 우회한 것이라 철회했다.** 정정(커밋 `fix(SPEC-B2C-LAUNCH-001): M4 하네스가 오라클 우회 없이 …`): `scripts/verify-flag-runtime.ts`의 `assembleEnv`·`runPnpm`에 `export` 키워드만 더했다(함수 본문과 오라클 허용 목록 두 줄의 글자는 바꾸지 않았다, `git diff`에서 두 줄뿐). 하네스는 그 `assembleEnv`를 import해 환경(부모의 원격 DB·플래그·시크릿 제거, 로컬 file DB, 진단 플래그 대입)을 만들고, 이 파일에는 플래그 대입 줄이 하나도 없다 — 표·이름 조합·계산한 키 없이 하네스가 쓰는 것은 `assembleEnv`의 결과에서 거짓 플래그 변수를 `delete`하는 줄(닫힘 상태 = "플래그 미설정" 문구에 맞춤, 대입이 아님)과 시크릿을 실행 시점 값으로 바꾸는 줄뿐이다. 중복했던 `FLAG_KEY_RE`·`runPnpm`·환경 조립 사본과 `DIAGNOSIS_FLAG_ENV` 표·우회를 설명한 주석은 삭제했다. 최종 트리에서 오라클 자신의 출력(`M4b-oracle-observed.log`)은 `scripts/verify-flag-runtime.ts:174` `DIAGNOSIS_ENGINE_READY: String(start.engine),`와 `:293` `env.DIAGNOSIS_ENGINE_READY = String(flags.diag.engine);` 두 줄뿐이고 없는 경로는 0개로, M3b 기준선과 같다. 부수 효과: 하네스의 DB가 `assembleEnv`가 쓰는 상대 경로 로컬 file DB(`.tmp/flag-runtime.db`, gitignore)로 바뀌어 `verify:flag-runtime`과 같은 파일을 쓴다(순차 실행, 시작 전에 지우고 마이그레이션으로 다시 만든다).
9. **YAML 파서**: 저장소에 YAML 파서가 직접 의존성으로 없다(`package.json`에 없고 루트 `node_modules`에 `yaml`·`js-yaml` 링크도 없다). 시험은 직접 의존성 `eslint`가 끌어오는 `js-yaml`을 `createRequire`로 eslint 쪽에서 해석해 쓴다. 새 의존성을 더하지 않았고 해석에 실패하면 시험이 실패한다(건너뛰지 않는다). eslint가 `js-yaml` 의존을 버리면 이 시험이 깨진다.
10. **로컬 서버 시험의 위치**: AC의 후보는 `scripts/smoke-check.test.ts`가 서버 (가)~(라)를 `startManagedServer`로 시작하는 것이다. 빌드·서버 네 번 기동은 몇 분이 걸려 `pnpm test`에 넣지 않고 `verify-gate-reachability.ts`와 같은 별도 하네스(`scripts/verify-smoke-check.ts`)로 나눴다. `scripts/smoke-check.test.ts`는 CLI를 임시 서버에 돌리는 빠른 시험이다.
11. **`package.json` 스크립트 미등록**: 기존 검증 스크립트는 등록돼 있어 등록이 확립된 패턴이지만 `package.json`은 이 단위의 범위 밖이라 등록하지 않았다. 워크플로는 `pnpm exec tsx`로 부르고 하네스는 `pnpm exec tsx scripts/verify-smoke-check.ts`로 돌린다.
12. **run PR과 deploy.yml**: 커밋 경로가 M1~M6이 한 run PR(`--pr`)인데 이 커밋은 그 브랜치에 `deploy.yml` 변경을 싣는다. **그 PR이 L-01 기준선 관측 기록보다 먼저 `main`에 병합되면 이 변경이 같이 병합·배포된다**(`main` push마다 배포, LF-03). 이 변경을 PR에서 떼어 낼지(별도 브랜치·PR로 옮기거나 병합 직전에 이 파일의 변경을 되돌릴지)는 PR을 만들기 전에 정해야 한다 — 이 단위는 푸시도 PR도 만들지 않았다.

**편차(보고 대상)**: (a) `package.json` 미등록(발견 11). (b) 처음에는 `scripts/verify-flag-runtime.ts`의 `FLAG_KEY_RE`·`runPnpm`·`assembleEnv` 사본(15줄가량)을 새 하네스에 다시 적었으나 후속 커밋에서 그 두 함수에 `export`만 더하고(`scripts/verify-flag-runtime.ts`는 이 단위에서 건드린 유일한 기존 스크립트, 본문 불변) 사본을 지워 import로 바꿨다(발견 8). (c) RED 첫 실행의 단언 실패 아닌 오류를 고쳐 다시 실행했다(위 RED). (d) `scripts/smoke-check.test.ts`는 RED 없이 GREEN 뒤에 썼다. (e) 첫 구현의 엔진 준비 변수 표 형태 대입은 후속 커밋에서 철회했다(발견 8). (f) `prettier --write`는 이 단위의 새 파일에만 적용했다.

**Gaps(관측하지 못한 것)**: `appleboy/ssh-action`을 거친 GitHub Actions의 실제 워크플로 실행(새 호출 줄의 실제 동작은 미관측이다). VM에서 `pnpm exec tsx scripts/smoke-check.ts`가 실행되는지 — VM의 `pnpm install --frozen-lockfile`과 `pnpm run db:migrate`(스크립트 정의가 `tsx`를 씀)가 같은 배포 단계에 이미 있어 `tsx`가 있을 것으로 읽었을 뿐 관측하지 않았다. `pm2 restart` 직후의 응답 시점과 재시도 루프의 실제 타이밍(하네스는 `--attempts=2 --retry-delay-ms=200`으로 돌렸고 기본값 10회·2초는 단위 시험의 호출 횟수·대기 횟수로만 확인했다). 운영 환경 변수, 운영 호스트의 Node 버전·네트워크 동작(예전은 호스트의 `curl`, 새것은 Node `fetch`). 열린 상태의 `data-testid`는 설계가 쓰지 않아 관측하지 않았다. 일곱 상태 관측은 한 번의 로컬 실행이며 한 번 통과했다는 사실이 불안정이 없다는 증명은 아니다. `moai` CLI·MCP가 연결되지 않아 `moai spec lint`·@MX 태그 점검은 실행하지 못했고 @MX 태그는 추가하지 않았다. 변이 확인은 세 가지만 했다.

**잔여 위험**: 설계 (a)는 게이트가 열려도 배포를 통과시키므로, 진단 플래그가 의도치 않게 열려도 배포 smoke는 그것을 잡지 못한다(D-LAUNCH-06의 "의도한 상태인지는 L-01·사후 확인(REQ-B2CLAUNCH-014)·조합표(REQ-B2CLAUNCH-010)로 본다"가 이 위험을 다른 장치에 맡긴다). 새 smoke는 한국어 UI 문구 하나(`서비스 준비 중입니다`)를 정보용 게이트 관측에 쓰므로 그 문구가 바뀌면 관측이 "열림"으로 흘러도 판정은 변하지 않는다(정보가 틀릴 뿐). 이 변경은 병합 전까지 어떤 배포에도 영향을 주지 않는다.

### M5 (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `85c3c2e` 위의 작업 트리(커밋 전). 모든 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M5-*.log`다. 이 커밋의 SHA는 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **범위(사용자 결정)**: REQ-B2CLAUNCH-014(롤백)·016(사후 관측), 항목 L-06·L-07·L-09와 R-04 참조 형식. D-LAUNCH-07(선언 (iii), 실행 (1), 사유는 CONSULTOPS-001 §2.4 작성자 기본 목록 4종)과 D-LAUNCH-08(내용 (b), 담당 (1) 운영 책임자)은 기록된 결정대로 따랐고 N8(롤백 목표는 dark 하나)은 열린 채로 적힌 대로 구현했다. 진단 표면 전용 사유 (e)(f)는 어떤 사유 목록·코드·fixture·런북 문장에도 넣지 않았다(런북 시험이 그 문구가 없음을 고정한다). `spec.md`·`plan.md`·`acceptance.md`, `app/`·`components/`·`lib/diagnosis`·`lib/consult`·`lib/env.ts`·`package.json`·`pnpm-lock.yaml`·`.github`·`.env*`·M1~M4 모듈과 M3b 오라클은 바꾸지 않았다. `scripts/verify-flag-runtime.ts`도 바꾸지 않았다(M4b에서 이미 `export`된 `assembleEnv`·`runPnpm`·`extractTitle`을 import만 했다).
- **변경 파일**: 신규 `lib/launch/rollback-observation.ts`(+시험, AC-014 판정·출력·행 해시·롤백 환경 점검), `scripts/verify-rollback-dark.ts`(+시험, 로컬 서버 롤백 시험 하네스), `lib/launch/observation-record.ts`(+시험, AC-016 검사기), 신규 시험 `lib/launch/runbook-rollback.test.ts`(런북 열람 조건의 기계 확인), `.moai/docs/launch-gate-runbook.md`(`## 롤백 절차`·`## 사후 관측 기록 양식` 두 절만 추가, 기존 절 불변), 이 파일.
- **구현한 것**: (1) AC-014 하네스: 열린 벡터(진단 production 경로 두 플래그 + 상담 두 플래그 + 실행 시점에 만든 시험용 시크릿)로 로컬 서버를 시작하고 실제 `POST /api/consultations`로 합성 접수 1건(201)을 저장한 뒤 서버를 내리고 행 수·전체 열 해시를 기록하고, 5종 플래그를 모두 `"false"` 문자열로 둔 환경으로 새 서버를 시작해(롤백 재시작) 세 경로·접수 API(AC-009 시나리오 2의 요청)·행 수·해시·환경의 플래그와 시크릿 설정 여부를 관측한다. 환경 조립은 `assembleEnv`를 재사용했고 이 파일에는 엔진 준비 변수를 대입하는 줄이 없다(아래 오라클). DB는 `.tmp/rollback-dark.db`(gitignore, 절대 `file:` 주소)이고 `.next` 빌드 폴더를 다른 verify 스크립트와 같이 쓰므로 동시에 실행하지 않는다. (2) AC-016 검사기: 관측 수단 하나에 한 행인 표(`관측 대상`·`담당 역할`·`기록 위치`·`관측 수단`·`구분`·`도입 SPEC 또는 BLOCKED 사유`·`관측 시점`)를 읽어 빈 칸·구분 어휘·신규 수단의 도입 칸을 점검하고 출력은 행 번호와 칸 이름뿐이다. (3) 런북 두 절(역할은 이름으로만, 사유 목록은 가리키기만, 운영 값 없음).

**RED**(구현 전의 틀: 판정 함수는 항상 빈 결과·빈 해시, 검사기는 항상 통과, 하네스 환경 조립은 닫힌 환경만 돌려줌, 런북에는 두 절이 없음; 새 시험 4개 파일, `M5-red.log`): `Test Files 4 failed (4)`, `Tests 62 failed | 13 passed (75)`, `exit=1`. 실패 오류 종류는 `AssertionError` 하나뿐이다(대표: `expected [] to deeply equal [ { id: 'a', n: 1 }, …(1) ]`, `expected 'flag-runtime-throwaway-secret' to be 'synthetic-secret-for-unit-test'`, `expected [Function] to throw an error`, `오류가 있어야 하는 관측 기록이 통과했다: expected true to be false`, `expected '' to contain '허용된 칸 밖의 칸'`). 모듈 없음·타입 오류·`TypeError` 0건이다(`grep -cE "TypeError|ReferenceError|Cannot find|Failed to resolve"` → 0). 통과한 13건은 틀이 우연히 맞는 경우(빈 입력 시험 등)다. **첫 RED 실행은 이 로그가 아니다**: 시험 한 건이 빈 틀의 `rows[0].introducedBy`를 읽다 `TypeError`를 냈다(단언 실패 아님). 그 시험에 `toHaveLength(1)` 단언을 먼저 두고 다시 실행한 것이 `M5-red.log`이며 구현 코드는 두 실행 사이에 바꾸지 않았다(첫 실행의 원문은 같은 이름으로 덮어써 보존하지 않았다).

**GREEN**: 1차(`M5-green-1.log`)는 `Tests 1 failed | 74 passed (75)` — 실패 1건은 **시험의 결함**이었다(런북 문장은 `` `true`가 아닌 값 ``처럼 백틱을 쓰는데 시험이 백틱 없는 문자열을 찾았다). 시험의 기대 문자열을 고쳤다. 2차(`M5-green-2.log`): `Test Files 4 passed (4)`, `Tests 75 passed (75)`, `exit=0`. 이후 `tsc`가 시험의 BigInt 리터럴을 거부해(`TS2737`, 대상이 ES2020 미만) `BigInt(5)`로 바꿨고, 새 파일 일곱 개 모두 첫 `prettier --check`에서 어긋나(`M5-prettier-0.log`) `prettier --write`로 정리했다.

**변이 확인**(일부러 바꾼 코드를 시험이 잡는지, 원문 복구 확인됨): (a) 하네스의 롤백 환경에서 상담 접수 정책 플래그를 `true`로 두면 실제 로컬 실행이 `롤백 뒤 접수 API 상태: 기대 503 / 관측 409`, `오류 코드: … consent_version_mismatch`, `롤백 환경의 플래그: … true인 플래그: CONSULT_POLICY_READY`로 `불일치 관측 합계: 3`, `exit=1`(`M5-mutation-policy-stays-open.log`). (b) 검사기의 신규 수단 규칙을 `신규`에서 `기존`으로 뒤집으면 13건 실패(`M5-mutation-new-means.log`). (c) 해시 비교를 길이 비교로 약화하면 1건 실패(`M5-mutation-hash-compare.log`).

**E1 AC-B2CLAUNCH-014 — 로컬 롤백 시험**(`pnpm exec tsx scripts/verify-rollback-dark.ts`, `M5-rollback-run-final.log`, `exit=0` — 이 실행·빌드·`verify:flag-runtime`·smoke 하네스 실행 뒤에 바뀐 것은 시험 파일 하나(`rollback-observation.test.ts`에 시험 한 건)뿐이고 앱·스크립트·lib 코드는 그대로다. 실제 `next build` 한 번 + 서버 두 번(열림, 롤백), 합성 값은 실행 시점에 무작위로 만들었고 시크릿·DB 경로는 출력하지 않는다):

| 관측 | 기대 | 관측 | 판정 |
|---|---|---|---|
| 롤백 전 합성 접수 상태(열린 서버) | 201 | 201 | OK |
| 롤백 전 `/` · `/result` · `/consult` | 열림(placeholder 아님) | 제목 `보상 진단` · `보상 진단 결과` · `상담 신청`, placeholder 문구 없음 | OK ×3 |
| 롤백 전 행 수 | 1 | 1 | OK |
| 롤백 뒤 `/` · `/result` · `/consult` | placeholder(제목 `서비스 준비 중` + 문구 `서비스 준비 중입니다`) | 세 경로 모두 제목 `서비스 준비 중`, 문구 있음 | OK ×3 |
| 롤백 뒤 `POST /api/consultations` 상태 | 503 | 503 | OK |
| 롤백 뒤 접수 API 오류 코드 | `policy_unavailable` | `policy_unavailable` | OK |
| 롤백 뒤 행 수 | 롤백 전과 같음(1) | 1 | OK |
| 롤백 뒤 전체 열 해시 | 롤백 전과 같음(`c0765df1a2aa`) | `c0765df1a2aa` | OK |
| 롤백 재시작에 넘긴 환경의 5종 플래그 | 모두 `true`가 아님 | 모두 `true`가 아님 | OK |
| 롤백 재시작에 넘긴 환경의 시크릿 | 설정됨(값 미출력) | 설정됨(값 미출력) | OK |

`불일치 관측 합계: 0`. 변이 확인 전 같은 하네스의 첫 실행(`M5-rollback-run.log`)도 `exit=0`이고 해시 앞 12자는 실행마다 다르다(합성 값이 무작위라서다 — `9580b9f5d907` 대 `c0765df1a2aa`, 각 실행 안에서는 롤백 전후가 같다). 해시는 `consultations`의 모든 열 값을 키 정렬 JSON으로 직렬화해 행 정렬 뒤 SHA-256한 값이고 단위 시험이 열·행 순서 불변, 한 칸·행 수 변화 민감, `null`과 빈 문자열·숫자와 문자열 구분, bigint·바이트 배열 직렬화를 확인한다.

**E1 AC-B2CLAUNCH-014 — 문서 열람 조건**(`lib/launch/runbook-rollback.test.ts`가 런북 `## 롤백 절차` 절을 읽어 확인, 현재 트리에서 통과):

| 조건 | 관측 | 판정 |
|---|---|---|
| L-06이 기록한 사유 목록·선언 역할·실행 역할을 가리킨다 | L-06·D-LAUNCH-07 결정 기록(`progress.md`)을 가리키고 선언은 `운영 책임자` 또는 `제품 책임자`(둘 중 누구나), 실행은 `운영 호스트 접근 보유자`로 역할 이름만 적었다. 사유 목록은 `.moai/specs/SPEC-B2C-CONSULTOPS-001/spec.md` §2.4의 작성자 기본 목록을 가리키기만 하고 옮겨 적지 않았다(시험이 기본 목록의 종류 문구가 절에 없음을 고정한다) | PASS(발견 3) |
| "롤백은 저장된 행과 시크릿 설정을 지우지 않는다" | 그 문장이 있다 | PASS |
| 상담 행 처분은 REQ-B2CCONSULTOPS-006·016을 가리킨다 | 두 식별자를 처분 절차(006)와 시험 행 식별 정확성 조건(016)으로 가리킨다 | PASS |
| 재시작 전략은 R-04(E-03)를 가리킨다 | R-04·CONSULTOPS-001 E-03을 가리키고 "바뀐 환경을 다시 읽는지"와 "평범한 재시작이 dark 상태를 유지하는지"를 이 절이 대신 판정하지 않는다고 적었다 | PASS |
| 값 금지 | 주소·이메일·연락처·기간 값이 절에 없다(시험이 정규식으로 확인) | PASS |

**E1 AC-B2CLAUNCH-016 — 사후 관측 기록 fixture 네 가지**(시험 `lib/launch/observation-record.test.ts` 20건과 같은 입력을 직접 실행한 `M5-ac016-fixtures.log`, 출력은 행 번호와 칸 이름뿐):

| fixture | 기대 | 관측 | 판정 |
|---|---|---|---|
| (가) 관측 대상·담당 역할·기록 위치·관측 수단·구분·관측 시점이 모두 있음(둘째 행은 신규 수단에 도입 SPEC 식별자 있음) | 통과 | 통과 | PASS |
| (나) 관측 수단 하나에 기존/신규 구분이 없음 | 거부, 항목과 필드 | `2번째 행의 "구분" 칸이 비어 있다` | PASS |
| (다) 신규 수단인데 도입 SPEC 식별자·BLOCKED 사유가 없음 | 거부, 항목과 필드 | `1번째 행의 "도입 SPEC 또는 BLOCKED 사유" 칸이 비어 있다 — 신규 수단은 도입하는 SPEC 식별자나 BLOCKED 사유가 필요하다` | PASS |
| (라) 관측 시점 칸이 비어 있음 | 거부, 항목과 필드 | `1번째 행의 "관측 시점" 칸이 비어 있다` | PASS |

(가)만 통과하고 (나)(다)(라)는 거부한다(시험이 직접 확인). 추가로 시험한 것: 필수 칸 네 가지(관측 대상·담당 역할·기록 위치·관측 수단)가 비면 칸 이름을 적어 거부, 구분 어휘 밖의 값 거부, 기존 수단은 도입 칸이 비어도 통과, 한 행의 여러 칸 오류가 행 번호와 함께 칸마다 나옴, 표 없음·행 없는 표(런북 양식 자체)·허용된 칸 밖의 칸(칸 이름도 되풀이하지 않음)·칸 개수 불일치 거부, 시크릿·연락처·이름처럼 보이는 합성 값을 넣은 기록의 거부 출력에 그 값이 없음. "기존"으로 적힌 수단이 저장소에 실제로 있는지는 열람 항목이고 이 단위의 양식은 값이 든 행이 없어 열람 대상이 아직 없다.

**E2 타입 검사**: `pnpm exec tsc --noEmit` → `exit=0`(`M5-tsc-final.log`; 처음 실행은 BigInt 리터럴로 실패, 위 GREEN). **E3 린트**: `pnpm lint` → `exit=0`(`M5-lint-final.log`), 새 TS 일곱 개 `prettier --check` 통과(`M5-prettier.log`). **E4 전체 시험**: `pnpm test` → `Test Files 136 passed (136)`, `Tests 1597 passed (1597)`, `exit=0`(`M5-test-full.log`; M4b 기준선 1521 + 새 76 — GREEN 2차의 75건에 커버리지 확인 뒤 바이트 배열 뷰 시험 한 건을 더했다; 같은 파일들을 다시 `tsc`·`lint`·`prettier --check` 하고 위 전체 시험을 다시 돌린 결과다). 이번에는 알려진 일시 실패 `scripts/verify-remote-consult.test.ts`가 나타나지 않았다. **E5 커버리지**(명령줄 덮어쓰기: `--coverage.include=<파일>`과 `--coverage.exclude=**/*.test.ts`로 기본 `.claude/**` 제외를 풀었다, `M5-cov.log`·`M5-cov-observation-record.log`): `lib/launch/rollback-observation.ts` 구문 100%·분기 95.83%(미덮개 63행은 제목 없음 `(없음)` 분기; 처음 측정은 구문 97.91%·분기 91.66%로 바이트 배열 뷰 분기가 비어 있어 시험 한 건을 더했다), `lib/launch/observation-record.ts` 구문 100%(37/37)·분기 100%(22/22), `scripts/verify-rollback-dark.ts` 구문 30.76%(미덮개 126~235·242~248행은 빌드·서버 기동 배선 `main`·`observePages`·`snapshotRows`이며 실제 로컬 실행이 덮는다; 순수 함수 세 개 `assembleRollbackEnvs`·`buildSeedProbe`·`toRecords`는 시험이 덮는다). 순수 로직(lib) 두 파일은 85% 이상이다. **E6 빌드**: `pnpm build` → `exit=0`(`M5-build.log`). **E7** `pnpm verify:flag-runtime` → `불일치 관측 합계: 0`, `exit=0`(`M5-flag-runtime.log`), `pnpm exec tsx scripts/verify-smoke-check.ts` → 아홉 행 모두 OK, `불일치 관측 합계: 0`, `exit=0`(`M5-smoke-harness.log`). `pnpm test:e2e`·`pnpm visual:verify`는 화면이 바뀌지 않아 실행하지 않았다.

**M3b 엔진 준비 오라클**: 최종 트리에서 오라클 자신의 출력(`M5-oracle-observed.log`)은 `scripts/verify-flag-runtime.ts:174` `DIAGNOSIS_ENGINE_READY: String(start.engine),`와 `:293` `env.DIAGNOSIS_ENGINE_READY = String(flags.diag.engine);` 두 줄뿐이고 없는 경로는 0개로, M3b·M4b 기준선과 같다. 새 파일에는 그 변수를 대입하는 줄이 없다(하네스는 `assembleEnv(FlagScenario)`를 재사용하고 시험 파일은 오라클이 제외한다).

**변경 범위 확인**: `git diff --stat 85c3c2e HEAD -- app components lib/diagnosis lib/consult lib/env.ts package.json pnpm-lock.yaml .github`와 `spec.md`·`plan.md`·`acceptance.md`의 diff는 비어 있다(보고에 원문).

**발견(SPEC 문서는 고치지 않았다, 적힌 대로 진행하고 말하지 않은 곳은 닫았다)**:

1. **"true가 아닌 값"의 두 형태**: AC-014는 5종 플래그를 "`true`가 아닌 값으로" 되돌린다고만 적었다. 하네스는 문자열 `"false"`(`assembleEnv`의 닫힘 환경)로 관측했고 변수를 아예 지우는(미설정) 형태는 따로 관측하지 않았다. 게이트가 정확히 `"true"`만 켜짐으로 읽으므로(LF-05) 두 형태는 같은 결과여야 하나 미설정 형태의 로컬 관측은 이 단위에 없다. 런북은 "미설정 포함"으로 적었다.
2. **L-06 "기록"의 위치**: AC가 "L-06이 기록한 사유 목록·선언 역할·실행 역할을 가리키고"라고 적었으나 L-06 기록이 놓일 곳(go/no-go 기록 파일의 위치는 D-LAUNCH-04가 정하지 않았다)이 없다. 런북은 역할·사유의 유일한 기록인 `progress.md`의 D-LAUNCH-07 결정 기록과 `spec.md`의 L-06 항목을 가리킨다. 기록 위치가 정해지면 포인터를 갱신해야 한다.
3. **사유 목록을 옮겨 적을지**: AC는 목록을 "가리키고"라고만 적었다. 목록을 옮겨 적으면 형제 SPEC §2.4와 어긋날 수 있어 가리키기만 했다(시험이 종류 문구가 절에 없음을 고정). "최소 4종"의 "최소"가 4종 밖의 종류가 있을 수 있음을 뜻하는지(D-LAUNCH-07 결정은 "그대로 쓴다"만 말한다)는 SPEC이 말하지 않았다.
4. **롤백 확인 기록의 담당**: REQ-014는 되돌린 뒤 "확인해 기록하며"라고만 적어 기록하는 역할을 말하지 않는다. 런북 순서 5는 역할 없이 "확인한 결과를 기록한다"로 적었다.
5. **운영 호스트의 확인 요청**: 런북 순서 4는 운영 API에 AC-009 시나리오 2의 합성 요청을 보내는 것을 확인 방법으로 적었다(REQ-014가 "접수 행을 만들지 않는 읽기·요청"을 요구하고 그 요청이 이 조건을 충족한다). 운영 API에 요청을 보내는 것이 허용된 확인 방법인지는 SPEC이 정하지 않았다(D-LAUNCH-06 설계 (d)의 같은 문제 참조).
6. **"롤백 재시작"의 의미**: 하네스의 재시작은 같은 빌드·같은 DB로 새 서버 프로세스를 시작하는 것이다. PM2·`pm2 restart`·환경 소스 해석은 흉내 내지 않았고(R-04가 다룬다) 그래서 이 관측은 "5종 플래그가 거짓인 환경에서 앱이 닫힌 상태를 보인다"까지만 말한다.
7. **시크릿 유지의 관측 범위**: AC-014가 적은 대로 "하네스가 롤백 재시작에 넘긴 환경에서 설정 여부만" 읽는다. 앱이 읽는 효과적 시크릿이나 롤백이 시크릿을 지우지 않는다는 사실의 실제 관측이 아니라 하네스가 시크릿을 계속 넘겼다는 사실이다(AC가 이 한계를 적었다).
8. **L-07 증거 파일 집합**: 항목 정의표는 L-07의 대상을 "롤백 시험이 실행한 절차 문서·스크립트·제품 코드의 파일 집합"이라고 적지만 덮는 파일 목록은 정하지 않았다("이 골격은 …덮는 파일 목록을 정하지 않는다"). 이 단위의 후보 집합은 런북 두 절, `scripts/verify-rollback-dark.ts`, `lib/launch/rollback-observation.ts`와 시험이 읽은 제품 코드이며 목록으로 확정하지 않았다. 이 파일(진행 기록)과 `.moai/state/` 로그는 덮는 파일 집합에 넣지 않는다(REQ-B2CLAUNCH-005).
9. **AC-016의 시험 파일 이름**: AC 후보는 `lib/launch/observation-plan.test.ts`이고 이 단위의 지시는 `observation-record`다. 지시대로 `lib/launch/observation-record.ts`(+시험)로 만들었다. "관측 계획"(L-09의 이름)과 "관측 기록"(REQ-016·지시문의 이름) 중 어느 것이 검사 대상인지도 SPEC이 하나로 쓰지 않는다 — L-09는 "사후 관측 **계획** 기록", REQ-016은 관측해 "기록"한다.
10. **표 모양**: AC-016은 필드 다섯(관측 대상·담당 역할·기록 위치·관측 수단(기존/신규 구분)·관측 시점)만 적고 표 모양은 말하지 않는다. 관측 수단 하나에 한 행으로 정했고, fixture (다)에서 따라 나오는 `도입 SPEC 또는 BLOCKED 사유` 칸을 더했다. `기록 위치`가 기록 전체의 칸인지 행마다의 칸인지도 말하지 않아 행마다 필수로 닫았다.
11. **검사기가 강제하지 않는 것(SPEC이 말하지 않은 곳)**: 관측 대상의 어휘와 D-LAUNCH-08 결정 (b)의 대상 전부(효과적 플래그 상태·smoke·프로세스 상태·접수 행 존재·오류 응답 확인)를 다 덮는지, 담당 역할이 결정의 `운영 책임자`인지, 관측 시점의 표기(결정 기록에는 담당·내용만 있고 시점 표기가 없다 — D-LAUNCH-08은 "시점의 표기와 값은 이 결정이 정한다"고 적었으나 기록 문장에는 없다)는 검사하지 않는다. 행 하나만 있는 기록도 통과한다. 이들을 강제하려면 SPEC이 어휘를 정해야 한다. 칸이 찼는지만 본다(fail-closed는 빈 칸·빈 표·알 수 없는 구분 값·허용 밖 칸에 적용했다).
12. **`기존` 수단의 도입 칸**: `기존`이면 도입 SPEC 칸이 비어 있어도 통과하고 값이 있어도 통과한다. 말하지 않은 곳이라 막지 않았다.
13. **AC-016 선결**: AC는 "D-LAUNCH-08 — 결정 전 BLOCKED"라고 적는다. D-LAUNCH-08은 2026-10-03에 결정돼 BLOCKED가 아니나 결정 기록이 시점 표기·기록 위치를 담지 않아 그 두 칸의 값 어휘는 정해지지 않은 채다(발견 11).
14. **상담 행 처분**: 하네스는 시험 행을 지우지도 정리하지도 않는다(DB 파일은 다음 실행이 시작 전에 지운다). L-07이 말하는 대로 상담 행 처분은 CONSULTOPS-001의 롤백 시험(E-06)과 시험 행 정리 절차의 몫이다.

**편차(보고 대상)**: (a) `package.json` 스크립트 미등록 — 기존 검증 스크립트는 등록돼 있어 등록이 확립된 패턴이지만 `package.json`은 이 단위의 범위 밖이라 등록하지 않았다. 실행은 `pnpm exec tsx scripts/verify-rollback-dark.ts`다. (b) AC-016 검사기는 CLI를 만들지 않았다(M3a 노출 기록 검사기도 CLI가 없고 입력은 문서 내용뿐이다). (c) 하네스의 DB는 `verify:flag-runtime`이 쓰는 `.tmp/flag-runtime.db`가 아니라 `.tmp/rollback-dark.db`다(지시는 flag-runtime DB를 공유한다고 알렸으나 따로 두는 쪽이 동시 실행 위험을 줄인다; `.next` 빌드 폴더는 여전히 공유라 순차 실행은 지킨다). (d) RED 첫 실행의 단언 실패 아닌 오류(`TypeError`)를 고쳐 다시 실행했다. (e) GREEN 1차의 실패 1건은 시험의 기대 문자열 결함이었다. (f) `prettier --write`는 이 단위의 새 파일에만 적용했다.

**Gaps(관측하지 못한 것)**: 운영 PM2가 바뀐 환경을 다시 읽는지, 롤백 뒤 이후 `main` 배포의 평범한 재시작이 dark 상태를 유지하는지(R-04·E-03), 운영 호스트에서 롤백이 실제로 수행되는지와 그 소요, 앱이 읽는 효과적 시크릿 자체. 변수를 지우는(미설정) 롤백 형태의 로컬 관측. 롤백이 저장 행을 지우지 않는다는 사실의 제품 코드 쪽 확인(이 하네스는 서버가 롤백 동안 행을 건드리지 않았음만 본다). 하네스의 열린 서버는 한 번의 실행이고 열린 상태에서 접수가 201이었다는 사실이 시험의 안정성을 증명하지는 않는다(실행 두 번이 모두 통과했다). "기존" 관측 수단의 실재(열람 항목, 값이 든 기록이 아직 없다)와 실제 관측 수행. `moai` CLI·MCP가 연결되지 않아 `moai spec lint`·@MX 태그 점검은 실행하지 못했고 @MX 태그는 추가하지 않았다. 변이 확인은 세 가지만 했다.

**잔여 위험**: 하네스는 `"false"` 문자열 환경으로만 롤백을 관측하므로(발견 1) 운영의 롤백이 변수를 지우는 방식이면 그 형태는 로컬 증거가 없다. 열린 서버 관측이 `/`·`/result`·`/consult`의 제목·placeholder 문구에 기대는데 화면 문구가 바뀌면 시험이 어긋난다(`서비스 준비 중입니다`는 smoke 검사와 같은 문구라 함께 바뀐다). 런북 롤백 절은 사람이 고치는 문서라 D-LAUNCH-07(e)(f)가 승인되면 사유 목록 포인터와 AC를 함께 갱신해야 하고 런북 시험은 그 두 사유 문구가 절에 없음을 고정하므로 승인 시 그 시험도 갱신해야 한다.

### M6 (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `cb386e6` 위의 작업 트리(커밋 전). 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M6-*.log`다. 이 커밋의 SHA는 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **범위(사용자 결정)**: 런북 완성과 REQ-AC 추적표. 문서와 구조 시험 하나만 바꿨다. `spec.md`·`plan.md`·`acceptance.md`, `app/`·`components/`·`lib/diagnosis`·`lib/consult`·`lib/env.ts`·`scripts/`·`package.json`·`pnpm-lock.yaml`·vitest 설정·`.github`·`.env*`, 형제 SPEC 디렉터리, `.moai/docs/runtime-runbook.md`는 바꾸지 않았다. §E.3(run-phase audit-ready 신호)은 쓰지 않았다(오케스트레이터가 최종 검증 뒤에 쓴다).
- **변경 파일**: `.moai/docs/launch-gate-runbook.md`(제목·도입 문단 고침, 끝에 `## 단계 이행 절차`·`## 항목 상태 갱신 절차`·`## 점검 도구와 실행 방법`·`## 형제 SPEC 연결` 네 절 추가, 기존 절은 글자 그대로 둠), 신규 `lib/launch/runbook-structure.test.ts`, 이 파일.
- **구현한 것**: (1) 단계 이행 절차 — 노출 확대 단계 앞의 열한 순서(목적 단계·벡터 → 노출 기록 → 항목 갱신 → 전환 점검 → R-02 → 서명 → 운영 단계 점검 → 수행 → 직후 강등 → 사후 관측 → 롤백), 각 순서에 REQ·항목·기존 절을 묶었다. (2) 항목 상태 갱신 절차 — 관측·행 쓰기·대상 값·사건·강등·결정 대기·참조 항목·서명 효력·기록 커밋의 아홉 순서. (3) 점검 도구와 실행 방법 — 점검 열다섯 가지의 표와 실행 명령(점검기 둘, 오라클 한 줄 명령, 관측 스크립트 셋, 시험 명령), 종료 코드, 각 AC가 적은 "보지 못하는 것". 이 SPEC의 스크립트가 npm 스크립트로 등록되어 있지 않다는 문장과 `pnpm exec tsx` 실행 형태를 적었다. (4) 형제 SPEC 연결 — SPEC 식별자와 항목 식별자만 적은 열네 행의 참조 표. 서명 기록 양식은 M1d·M1e가 이미 `## 서명 기록 양식`에 넣었으므로 다시 적지 않았다.
- **어휘 규칙**: 새 절 어디에서도 배포(`main` push)를 공개·출시로 서술하지 않는다. 배포 완료(dark)는 어느 공개 단계의 판정도 충족하지 않는다는 문장을 단계 이행 절차 첫 문단에 반복했다. 새 절에 URL·메일·연락처·시간 값·정책 문구·법적 결론은 없다(기존 `stage-table.test.ts`의 런북 전체 정규식 검사가 계속 통과한다).

**TDD 편차(보고 대상)**: 이 단위의 산출물은 문서이고 `runbook-structure.test.ts`는 런북을 쓴 뒤 이어서 만든 낡음 검사다. 첫 실행이 곧바로 9건 모두 통과해(`M6-structure-test-1.log`) RED 출력이 없다. 시험이 실제로 무는지는 런북을 일부러 틀리게 고쳐 두 차례 확인했다 — 1차(`M6-structure-test-mutation.log`): 없는 항목 식별자(L-97), 철자가 틀린 스크립트 경로, 없는 절 제목, 없는 REQ 식별자(REQ-B2CLAUNCH-099), 형제 SPEC에 없는 식별자(REQ-B2CCONSULTOPS-911)가 각각 다른 시험을 실패시켜 `5 failed | 4 passed`, `exit=1`. 2차(`M6-structure-test-mutation-2.log`): EV-L2 항목 서술에서 L-02를 뺀 것과 이미 등록된 스크립트(`verify-flag-runtime.ts`)를 등록되지 않았다는 명령 목록에 둔 것이 각각 실패해 `2 failed | 7 passed`, `exit=1`. 두 번 모두 런북을 백업 복사본으로 되돌렸고 `cmp`가 일치했다(`cmp=0`). 모든 변이 확인은 런북 문장을 바꾼 것이지 시험을 바꾼 것이 아니다.

**구조 시험(`lib/launch/runbook-structure.test.ts`)이 보는 것**: (a) 런북 본문의 모든 `L-nn`·`R-nn`이 항목 정의표(`parseItemTable`)에 있다, (b) 단계 이행 절차의 순서 9가 이름 댄 항목이 정의표에서 `EV-L2`를 사건으로 가진 항목과 같다, (c) 런북이 이름 댄 `lib/`·`scripts/`·`components/`·`app/`·`.moai/`·`.github/` 경로가 모두 저장소에 있다, (d) ` ```text ` 블록의 `pnpm exec` 명령이 가리키는 파일이 모두 있다, (e) `pnpm exec tsx scripts/…`로 실행하라고 한 스크립트가 `package.json`의 어떤 스크립트에도 등록되어 있지 않다(런북의 "등록되어 있지 않다" 문장이 낡으면 실패), (f) `` `## 절 제목` `` 참조가 모두 런북의 절 제목이다, (g) 런북이 인용한 `REQ-B2CLAUNCH-nnn`·`AC-B2CLAUNCH-nnn`이 `spec.md`·`acceptance.md`에 정의돼 있다, (h) 인용한 형제 SPEC 식별자(`REQ-B2CCONSULTOPS-`·`D-OPS-`·`E-nn`·`REQ-B2CENGINE-`·`D-ENGINE-`·`REQ-B2CDIAG-`·`AC-B2CDIAG-`·`REQ-B2CCONSULT-`·`REQ-B2CRESULT-`)가 그 SPEC 문서에 있다. 보지 못하는 것: 런북 문장이 사실인지, 명령이 실제로 그 인자로 도는지(명령 실행은 아래 "이 단위가 다시 돌린 것"), 형제 식별자가 같은 뜻으로 쓰였는지.

**이 단위가 다시 돌린 것과 돌리지 않은 것**(런북 "점검 도구와 실행 방법"의 명령이 오늘 이 트리에서 동작하는지):

| 명령 | 로그 | 관측 |
|---|---|---|
| `pnpm exec tsx scripts/check-launch-gate.ts`(인자 없음) | `M6-cli-gate-usage.log` | `사용법 오류: --items 인자가 필요하다`, `exit=2` |
| `pnpm exec tsx scripts/check-launch-transitions.ts --steps .moai/docs/launch-gate-runbook.md --order .moai/docs/launch-gate-runbook.md` | `M6-cli-transitions.log` | `단계 1: 통과` / `단계 2: BLOCKED — 전 벡터가 결정 대기다; 후 벡터가 결정 대기다` / `BLOCKED 전환 번호: 2` / `판정: BLOCKED`, `exit=3` |
| `pnpm exec tsx scripts/smoke-check.ts`(인자 없음) | `M6-cli-smoke-usage.log` | `사용법 오류: --base-url 인자 또는 SMOKE_BASE_URL 환경 입력이 필요하다`, `exit=2` |
| 오라클 한 줄 명령(`tsx -e` + `scanTree`) | `M6-cli-oracle.log` | `scripts/verify-flag-runtime.ts:174`·`:293`의 두 줄과 `missing=0`, `exit=0`(허용 목록은 시험 하네스의 이 두 줄) |
| `grep -cE "paths(-ignore)?:" .github/workflows/deploy.yml` (AC-B2CLAUNCH-005 현재 트리 확인) | `M6-deploy-paths-filter.log` | `0`(일치 없음이라 grep 종료 코드는 `1`) — 배포에 경로 필터가 없다 |
| `pnpm exec vitest run lib/launch/runbook-structure.test.ts --reporter=verbose` | `M6-structure-test-1.log` | `Tests 9 passed (9)`, `exit=0` |

다시 돌리지 않은 것: 빌드와 서버 기동이 있는 `scripts/verify-gate-reachability.ts`·`scripts/verify-smoke-check.ts`·`scripts/verify-rollback-dark.ts`(이 단위는 문서만 바꿔 빌드·서버·e2e를 하지 않는다). 아래 추적표에서 그 관측은 M3a·M4·M5 단위의 기록을 옮긴 것이고 이 단위가 재관측한 것이 아니다. 항목 점검기(`check-launch-gate.ts`)를 실제 기록 파일로 실행한 적은 없다 — 저장소에 기록 파일이 없다(`| 식별자 | 증명하는 것 |`·`| 서명 역할 | 날짜 |` 헤더를 가진 파일은 런북 하나뿐이고 그것은 양식이다, Grep 확인).

**파일 존재 확인**(이 단위 실행): 추적표가 가리키는 `lib/launch/*.ts`·시험 41개 경로를 `ls -1`로 확인했고(`M6-ls-lib.log`, `exit=0`), `scripts/` 열다섯 개, 푸터 시험 `components/` 셋, `lib/diagnosis/flags.gate-table.test.ts`, `lib/env.boot-combination.test.ts`, `.github/workflows/deploy.yml`, 런북 두 개, 형제 SPEC 문서 셋을 합친 26개 경로도 `ls -1`로 확인했다(`M6-ls-other.log`, `exit=0`). 형제 SPEC 식별자(`E-03`·`E-06`·`E-08`, `D-OPS-04`·`-12`, `REQ-B2CCONSULTOPS-006`·`-011`·`-013`·`-016`, `REQ-B2CENGINE-023`, `D-ENGINE-07`·`-09`·`-10`, `REQ-B2CDIAG-017`·`-023`·`-025`, `AC-B2CDIAG-024`, `REQ-B2CCONSULT-025`, `REQ-B2CRESULT-025`)는 구조 시험이 문서에서 조회한다.

#### REQ-AC 추적표

상태 어휘: `verified locally` = 이 저장소의 시험이나 로컬 하네스가 기대를 관측했다(시험은 이 단위의 전체 시험 실행이 현재 트리에서 다시 통과시켰다). `fixture only` = 실제 기록·실제 형제 증거·실제 운영 입력이 없어 합성 입력으로만 본 부분. `BLOCKED` = AC가 적은 선결(결정·산출물)이 없다. `not verifiable here` = 운영 호스트·GitHub Actions 같은 로컬 밖에서만 볼 수 있다. `not implemented` = 선결이 없는데도 구현·관측이 없다. 한 행에 상태가 둘 이상이면 부분별로 나눈 것이다. AC가 요구하는 사람의 서명(제품 책임자·엔지니어링·법무·운영 책임자)은 어느 AC에서도 받거나 기록하지 않았다 — 이 표의 어떤 상태도 서명 완료가 아니다.

| REQ | AC | 구현 파일과 시험 | 검증 방법 | 상태 | BLOCKED·한계 사유 |
|---|---|---|---|---|---|
| REQ-B2CLAUNCH-001 | AC-001 | `lib/launch/stage-table.ts`, `stage-table.test.ts`, 런북 단계 표·로컬 시험 판정·점검 요청의 두 형태 절 | 표 파서 시험(M1a)과 런북 문장 존재 시험, 런북 표와 `spec.md` §2.4 표의 줄 단위 대조 | verified locally | 칸 서술의 사실성과 참조 토큰이 가리키는 결정 기록의 내용은 보지 못한다(AC가 적은 한계) |
| REQ-B2CLAUNCH-002 | AC-002 | `lib/launch/item-table.ts`, `gate-record.ts`, `target-check.ts`와 각 시험, `scripts/check-launch-gate.ts`, `scripts/check-launch-gate.test.ts` | 열아홉 fixture(운영·로컬·형태 오류)의 종료 코드와 출력(M1b), 비필수 항목 변형, `spec.md`·런북 항목 표 파싱 | verified locally(fixture); fixture only(실제 기록 파일 입력) | 저장소에 기록 파일이 없고 위치도 정하지 않았다. 대상 값을 계산하는 도구가 없어 호출하는 절차가 넘겨야 한다. 사건 감지·운영 호스트의 손 변경(N11)·실행 환경 입력의 진위는 보지 못한다 |
| REQ-B2CLAUNCH-003 | AC-003 | `lib/launch/gate-record.ts`, `gate-record.test.ts`, 런북 기록 양식·Definition of Done | 여섯 fixture(가)~(바)와 DoD 문장 존재 시험(M1b, M1a) | verified locally(fixture); fixture only(실제 go/no-go 기록) | 기록 파일 위치 미정. 상태 값의 사실성(기록의 정직성)은 보지 못한다. AC-003의 "이 문서"가 `acceptance.md`인지 런북인지 문서상 하나가 아니다(M1a 발견 1) |
| REQ-B2CLAUNCH-004 | AC-004 | `lib/launch/sibling-reference.ts`, `sibling-reference.test.ts`, `scripts/check-launch-gate.ts`의 `--sibling-*` 인자, 런북 형제 증거 참조 양식 | 네 fixture와 연결 필드 시험(M1c, M1e), stub 형제 기록 | verified locally(fixture); BLOCKED(실제 형제 기록과의 비교) | 형제 증거 기록의 형식·위치 미정(CONSULTOPS-001 D-OPS-11, ENGINE-001 `design.md` §9.2). ENGINE-001에는 식별자가 붙은 증거 표가 없어 R-02·R-03·R-05를 식별자로 참조하는 줄은 지금 거부된다(M1 종합 검증 발견, 이 단위 재관측 아님) |
| REQ-B2CLAUNCH-005 | AC-005 | `lib/launch/target-check.ts`, `target-check.test.ts`, `lib/launch/item-table.ts`의 `coveringFilesOf` | 다섯 fixture, 덮는 파일 목록 검사, 배포 경로 필터 확인(이 단위 재실행: 일치 0) | verified locally(fixture); fixture only(목록 검사) | 대상 값 계산 수단이 없다. 덮는 파일 경로가 정의표에 적힌 항목은 일부뿐이고 나머지 코드 종류 항목의 목록은 정해지지 않았다(M1a 발견 2). 목록 검사는 점검기 명령줄에 연결되어 있지 않다. `grep`은 GitHub 설정과 다른 워크플로의 필터를 보지 못한다 |
| REQ-B2CLAUNCH-006 | AC-006 | `lib/launch/legal-confirmation.ts`, `legal-confirmation.test.ts`, 런북 법무 확인 기록 양식 | 여섯 fixture(M1c) | verified locally(fixture) | 점검기에 연결되어 있지 않다(시험이 호출). 확인 기록의 위치·서명 역할 목록(법무)을 정하지 않았다. 확인이 실제로 이뤄졌는지와 허용된 칸에 숨긴 결론 문구는 보지 못한다 |
| REQ-B2CLAUNCH-007 | AC-007 | `scripts/launch-marker-check.ts`, `scripts/launch-marker-check.test.ts`, 런북 표지값 검사 절차 | (0)~(4) 시험(M1d), 양성·음성 대조 | verified locally(fixture); BLOCKED((3)의 정식 값 기록 위치) | D-LAUNCH-04가 "저장소 밖"만 정하고 위치를 정하지 않아 시험은 OS 임시 폴더를 위치로 썼다. 알지 못하는 실제 값의 유출, 인코딩·절단 값, 무시되는 경로의 내용은 보지 못한다. "런북 갱신"·"검증 출력 절차"를 실행하는 코드는 없다(M1d 발견 4) |
| REQ-B2CLAUNCH-008 | AC-008 | `lib/launch/signature.ts`, `signature.test.ts`, `scripts/check-launch-gate.ts`, 런북 서명 기록 양식 | 열한 fixture(M1e), 집합 동일성·실행 환경 일치 시험 | verified locally(fixture); BLOCKED((마)(바)(사)의 서명자 구성) | 로컬 I 서명자 구성(D-LAUNCH-04 (c)의 세 역할 전부가 서명해야 하는지)이 확인 대기이고 점검기는 역할의 허용 목록 소속만 본다. 서명의 진위와 날짜의 사실성은 보지 못한다. 서명 시점 대상 값과 현재 값을 서명 자체에서 비교하지는 않는다(M1d 발견 2) |
| REQ-B2CLAUNCH-009 | AC-009 | `lib/launch/exposure-record.ts`, `exposure-record.test.ts`, `scripts/verify-gate-reachability.ts`, `verify-gate-reachability.test.ts` | 시나리오 1 네 fixture(M3a), 시나리오 2 로컬 서버 관측 한 번(M3a, 재실행 안 함: 제목·409·`consent_version_mismatch`·행 수 불변) | verified locally; BLOCKED(제한 수단 어휘 대조); not verifiable here(프록시·방화벽·실제 노출, 저장소 밖 제한 수단의 작동) | D-LAUNCH-01이 로컬 한정으로 결정돼 제한 수단 어휘가 기록에 없고 검사기는 칸이 찼는지만 본다. 열 이름·"제한 없음" 표현·다섯째 경로 식별자는 SPEC이 정하지 않아 닫은 것이다(M3a 발견 5·6). 시나리오 2는 운영 노출 증거가 아니다 |
| REQ-B2CLAUNCH-010 | AC-010 | `lib/launch/gate-state-table.ts`, `gate-state-table.fixture.ts`, `gate-state-table.test.ts`, `lib/diagnosis/flags.gate-table.test.ts`, `lib/env.boot-combination.test.ts`, `lib/launch/cross-combination.ts`, `cross-combination.test.ts`, `scripts/verify-gate-reachability.ts`(시나리오 3) | 시나리오 1(12행)·2(부팅 4행)를 독립 기대값·함수 출력·런북 표와 대조(M3a), 시나리오 3의 교차 조합 셋을 로컬 서버로 시작해 `/`·`/result`·`/consult`·접수 API를 독립 기대값과 경로마다 대조(M3c, 이 단위 실행에서 세 조합 모두 일치, `전체 불일치 관측 합계: 0`) | verified locally(시나리오 1·2·3) | 시나리오 3은 진단 닫힘을 모든 진단 플래그 미설정 한 행(`F0E0D0`)으로만 시작했고, 접수는 503 여부만 판정하며(409 등은 참고 출력), `/result`의 상담 CTA 활성 여부는 읽지 않고, 한 번의 로컬 실행이다(M3c 발견 1·3·4). 선결(로컬 빌드)은 막혀 있지 않다. ENGINE-001이 게이트 입력을 바꾸면(N6) 표·기대값을 함께 갱신해야 한다 |
| REQ-B2CLAUNCH-011 | AC-011 | `lib/launch/procedure-steps.ts`, `transition-list.ts`와 각 시험, `lib/launch/runbook-procedure.test.ts`, `scripts/check-launch-transitions.ts`, `check-launch-transitions.test.ts` | 네 fixture(M3b), 런북 열람 두 조건, 런북에 CLI 실행(이 단위 재실행: 단계 1 통과, 단계 2 BLOCKED, `exit=3`) | verified locally(fixture, 시크릿 단계 조건); BLOCKED(상담 쪽 순서·단계 2의 벡터) | D-LAUNCH-03 결정 기록이 벡터 순서를 담지 않아 순서 표 3번과 단계 2의 전·후 벡터가 `결정 대기`다. `C`만 거짓·`P`만 참인 조합이 어느 벡터에 드는지도 기록에 없다. 운영 호스트의 재시작 횟수와 재시작이 환경을 읽는지는 보지 못한다 |
| REQ-B2CLAUNCH-012 | AC-012 | `lib/launch/engine-ready-step.ts`, `engine-ready-oracle.ts`와 각 시험 | 다섯 fixture(M3b), 저장소 코드 오라클(이 단위 재실행: 하네스 두 줄, `missing=0`) | verified locally(fixture, 오라클); BLOCKED(실제 R-02 판정) | ENGINE-001 증거 기록의 형식이 정해지지 않아 R-02의 상태 소스가 없다. 오라클은 `.env*`·PM2 저장 환경·계산한 변수 이름·`ENV … true`·`??=`·시험 파일을 보지 못한다. 명령줄 도구가 없다 |
| REQ-B2CLAUNCH-013 | AC-013 | `lib/launch/smoke-check.ts`, `scripts/smoke-check.ts`, `scripts/verify-smoke-check.ts`와 각 시험, `scripts/deploy-workflow-static.test.ts`, `.github/workflows/deploy.yml` | 로컬 일곱 상태(아홉 행) 관측(M4, M4b, 재실행 안 함), YAML 파서 정적 시험, 변이 확인 셋 | verified locally; not verifiable here(`appleboy/ssh-action`을 거친 실제 실행, VM에서의 `tsx` 실행·재시도 타이밍·Node 환경) | `deploy.yml` 변경은 이 브랜치에만 있고 L-01 운영 기준선 관측 기록이 생긴 뒤에만 병합할 수 있다(별도의 사람 작업). N4(DIAGNOSIS-001 smoke 트리거 문장)는 열려 있다. `package.json` 스크립트를 등록하지 않았다 |
| REQ-B2CLAUNCH-014 | AC-014 | `lib/launch/rollback-observation.ts`, `rollback-observation.test.ts`, `lib/launch/runbook-rollback.test.ts`, `scripts/verify-rollback-dark.ts`, `verify-rollback-dark.test.ts`, 런북 롤백 절차 | 로컬 롤백 시험(M5, 재실행 안 함: 세 경로 placeholder·503·행 수와 전체 열 해시 불변·시크릿 설정 유지·`불일치 관측 합계: 0`), 런북 열람 조건 시험 | verified locally; not verifiable here(운영 PM2의 환경 재읽기, 롤백 뒤 평범한 재시작, 운영 호스트의 롤백 수행) | 사유 (e)(f)는 사용자 확인 대기이고 기본 4종 기준으로 판정했다. 변수를 지우는(미설정) 롤백 형태는 로컬 관측이 없다. N8(부분 복귀)은 열려 있다. 시크릿 설정은 하네스가 넘긴 환경에서만 읽었다 |
| REQ-B2CLAUNCH-015 | AC-015 | `lib/launch/footer-element-state.ts`, `legal-notice-gate.ts`, `legal-notice-record.fixture.ts`와 각 시험, `components/*/*-footer.legal-notice.test.tsx` 셋, 런북 L-08 스냅샷 | 시나리오 1 세 푸터 렌더링 분류(M2), 시나리오 2 여덟 칸(M2), 푸터 `href` 현황(이 단위 재확인: 01 푸터와 02 푸터에 `href="#"`가 남아 있다) | verified locally; BLOCKED(S2의 G 판정, I 허용 칸 해석) | CONSULTOPS-001 D-OPS-04의 6개 요소가 전부 미확정이라 S2의 G는 BLOCKED다. 결정 기록이 `# 앵커`·`텍스트만`의 I 허용을 말하지 않아 `아니오`로 읽었다. 요소 판정을 점검기에 연결하지 않았고 요소 판정과 L-08 행 상태의 관계를 SPEC이 정하지 않았다(M2 배선 공백). 화면은 바꾸지 않았다(사용자 결정) |
| REQ-B2CLAUNCH-016 | AC-016 | `lib/launch/observation-record.ts`, `observation-record.test.ts`, `lib/launch/runbook-rollback.test.ts`, 런북 사후 관측 기록 양식 | 네 fixture(M5)와 추가 시험 | verified locally(fixture); fixture only("기존" 수단의 실재 열람) | 값이 든 기록이 없어 "기존" 수단이 저장소에 있는지 열람하지 못했다. 관측 시점 표기와 기록 위치의 어휘가 결정 기록에 없어 칸이 찼는지만 본다. AC의 후보 시험 파일명(`observation-plan.test.ts`) 대신 `observation-record.test.ts`를 썼다 |

**표 아래의 판정(오케스트레이터 확인 요청, SPEC 문서는 고치지 않았다)**: `acceptance.md` Definition of Done은 "REQ 16건 각각이 AC 통과 또는 사유가 기록된 BLOCKED"를 요구한다. 이 표를 처음 쓸 때(M6 단위)는 AC-010 시나리오 3이 `not implemented`이고 BLOCKED 사유가 없어 이 문구에 맞지 않았으나, 그 뒤 M3c(커밋 `56d7e4a`)가 시나리오 3을 구현하고 로컬에서 관측해 해소했다(위 AC-010 행이 현재 상태이며 M3a의 "시나리오 3은 하지 않았다"는 그 시점의 기록이다). 지금 이 문구에 맞지 않는 것은 아래 서명과 기록 위치다. 또 서명이 필요한 AC(AC-002를 뺀 열다섯)의 서명은 받거나 기록하지 않았고, DoD가 요구한 "서명 기록은 증거 항목 표에 연결돼 있어야 하고 D-LAUNCH-04가 정한 위치에 둔다"는 위치가 정해지지 않아 충족할 수 없다. 실제 노출 확대의 선결인 L-01 기준선 관측 기록, go 서명 기록, R-02 증거 기록, R-03 확정 동의 문구 기록은 저장소에 기록 파일이 없다(위 Grep 확인). D-OPS-04의 6개 요소는 SPEC 문서들이 적은 "전부 미확정"을 옮긴 것이고 이 단위가 형제 문서의 현재 상태를 다시 읽지는 않았다. 기록이 없으므로 어떤 운영 단계 점검도 지금은 통과할 수 없고, 이 SPEC은 그것을 통과시키는 것이 아니라 절차와 점검기를 인수한다(REQ-B2CLAUNCH-003, DoD 둘째 항).

**발견(SPEC 문서는 고치지 않았다, 적힌 대로 진행하고 말하지 않은 곳은 닫았다 — manager-spec 일괄 처리용)**:

1. **`.moai/docs/runtime-runbook.md` §11 연결 — 만들지 않았다**: `plan.md` M6은 "`.moai/docs/runtime-runbook.md` §11에서 새 런북으로의 안내(결정에 따라)"라고만 적었고, `progress.md`·`spec.md`·`acceptance.md` 어디에도 그 결정이 기록돼 있지 않다(`runtime-runbook` 문자열 검색: `spec.md` 3곳은 사실 인용, `plan.md` 2곳은 위 문장과 의존 문서 목록, `progress.md`에는 기록 없음). 그래서 그 문서를 고치지 않았다. 연결을 만든다면 넣을 말과 자리 제안: §11 도입 문단(현재 232~238행, `### 11.1` 앞) 끝에 한 문장 — "플래그를 바꾸는 방법과 관측만 이 절이 적는다. 노출 확대 단계의 선결(항목·서명·전환 순서)은 `.moai/docs/launch-gate-runbook.md`의 `## 단계 이행 절차`와 `## 플래그 변경 절차`가 정한다." 결정은 사용자(또는 SPEC)가 내려야 하고, 새 런북 쪽에서 `.moai/docs/runtime-runbook.md` §11·§12를 가리키는 행은 `## 형제 SPEC 연결`에 이미 있다(그 문서는 수정하지 않음).
2. **단계 이행 절차는 SPEC에 없는 절차 순서를 조립한 것이다**: SPEC은 단계 이행 "절차"의 본문을 적지 않았고 제약만 둔다(점검 뒤에만 수행: REQ-002, 서명: REQ-008, 노출 기록: REQ-009, 인접 벡터와 한 번의 재시작: REQ-011, R-02 뒤에만 엔진 준비 변수: REQ-012, 직후 관측: REQ-016). 열한 순서의 배열(특히 순서 2~6의 앞뒤)은 이 제약에서 따라 나오는 가장 작은 배열일 뿐 SPEC이 정한 순서가 아니다. 순서의 앞뒤가 의미를 갖는 곳(예: 서명이 전환 점검보다 먼저인지)이 있다면 SPEC이 정해야 한다.
3. **노출 확대 단계 자체가 EV-L2인지**: §2.4는 EV-L2를 "게이트 상태 벡터가 기록 시점과 달라짐"으로 정의한다. 의도한 노출 확대 단계도 벡터를 바꾸므로 런북 순서 9는 "수행 직후 EV-L2를 가진 항목(L-01·L-02)은 `UNVERIFIED`"라고 적었다. 정의에서 따라 나온 결론이지만, 의도한 변경이 기록된 관측을 무효화하는 것이 SPEC의 뜻인지는 SPEC이 말하지 않았다(뜻이 아니라면 L-01·L-02의 사건 칸이나 EV-L2의 정의가 바뀌어야 한다).
4. **항목 상태를 누가 어떻게 쓰는가**: SPEC은 항목 기록 필드와 READY의 조건을 정하지만 상태 칸을 고치는 행위의 주체·방법·위치를 정하지 않았다(점검기는 쓰지 않는다). 런북은 "사람이 하는 문서 편집"으로 적었고 기록 파일의 위치는 정하지 않았다(D-LAUNCH-04는 "저장소 안에는 식별자·상태·참조만, 서명 세부는 저장소 밖"까지만 정했다). 그래서 `plan.md` M6의 "서명 기록은 D-LAUNCH-04가 정한 위치에 둔다"를 이행할 위치가 없다.
5. **서명 기록 양식은 M6의 새 일이 아니다**: `plan.md` M6의 산출 "서명 기록 양식"은 M1d·M1e가 `## 서명 기록 양식`으로 이미 만들고 시험한 것이라 다시 적지 않았다. M6이 더한 것은 이행 절차·갱신 절차·도구 절·형제 연결이다.
6. **덮는 파일 목록이 일부 항목에만 있다**: `spec.md` §2.4와 AC-005는 코드 종류 항목의 덮는 파일 목록을 런북이 항목마다 적는다고 하나 정의표에 경로가 적힌 항목은 일부뿐이다. 런북 항목 표 바로 아래의 "이 골격은 …목록을 정하지 않는다" 문장(그 문장의 "골격"이라는 낱말은 M6이 제목에서 뺀 말이라 이제 문서 이름과 어긋난다 — 문장은 그대로 두었다)을 유지했고, 새 목록은 지어내지 않았다. 항목 상태 갱신 절차 순서 3에 "그 밖의 코드 종류 항목의 덮는 파일 목록은 이 문서가 정하지 않았다"고 적었다(M1a 발견 2 이월).
7. **L-08 요소 판정과 점검기의 연결**: `lib/launch/legal-notice-gate.ts`가 점검기에 연결되어 있지 않다는 사실(M2 배선 공백)을 런북 도구 절 F에 적었다. 요소 판정이 L-08 행의 상태를 대신하는지는 SPEC이 정해야 한다.
8. **`package.json` 스크립트 미등록**: 기존 `verify:flag-runtime`·`verify:remote-consult`는 등록되어 있어 등록이 확립된 패턴이지만 이 SPEC의 스크립트(점검기 둘, 관측 스크립트 셋)는 등록하지 않았고(`package.json`은 이 단위의 범위 밖) 런북이 그 사실과 `pnpm exec tsx` 실행 형태를 적는다. 등록하면 구조 시험 (e)가 실패해 런북 문장 갱신을 요구한다. 등록할지는 사용자 결정이다.
9. **`## 단계 이행 절차`의 `deploy.yml` 병합 문장**: 런북에 "구현 착수 승인 때 L-01 기준선 관측 기록이 있은 뒤에만 병합하기로 했다"고 적고 근거로 `progress.md` §E.1을 가리켰다. 이는 SPEC 문구가 아니라 Kickoff 때 사용자가 한 결정(§E.1 기록)이다.
10. **이월**: N1~N11 전부, U3(로컬 I 서명자 구성), D-LAUNCH-07 (e)(f)의 승인 대기, ENGINE-001 식별자 부재(위 REQ-004 행), M2의 푸터 발견 1~9, M3b의 순서·벡터 발견 1~15, M4 발견 12(run PR이 `deploy.yml`을 같이 싣는 문제 — PR을 만들기 전에 떼어 낼지 정해야 한다). 이 단위는 이것들을 해소하지 않았다.

**검증**(이 단위): 구조 시험 `lib/launch/runbook-structure.test.ts` → `Tests 9 passed (9)`, `exit=0`(`M6-structure-test-1.log`). 전체 시험·린트·타입·서식·변경 범위는 이 절 마지막 줄에 적는다.

**E2·E3·E4 (전체)**: `pnpm exec tsc --noEmit` → `exit=0`, 출력 없음(`M6-tsc.log`). `pnpm lint` → `exit=0`, 출력은 `$ eslint .` 한 줄(`M6-lint.log`). 새 TS 파일 `prettier --check` → `All matched files use Prettier code style!`, `exit=0`(`M6-prettier-0.log`). `pnpm test` → `Test Files 137 passed (137)`, `Tests 1606 passed (1606)`, `exit=0`(`M6-test-full.log`; M5 기준선 1597 + 새 9, 파일 136 + 1). 이 전체 시험은 런북을 변이 확인 뒤 백업으로 되돌려 `cmp`가 일치한 다음에 돌렸다. `pnpm build`·`pnpm test:e2e`·`pnpm visual:verify`·`pnpm verify:flag-runtime`은 문서와 구조 시험만 바꿔 실행하지 않았다.

**Gaps(관측하지 못한 것)**: 위 "다시 돌리지 않은 것" 전부. `moai` CLI·MCP가 연결되지 않아 `moai spec lint`·@MX 태그 점검은 실행하지 못했고 @MX 태그는 추가하지 않았다. 커버리지는 측정하지 않았다(새 시험은 파일·식별자를 읽는 구조 시험이고 측정할 제품 코드가 없다). 구조 시험은 런북 문장이 사실인지 보지 못한다.

**잔여 위험**: 런북이 사람이 고치는 문서라 점검기·스크립트의 인자나 종료 코드가 바뀌면 도구 절이 낡는다 — 구조 시험은 파일과 식별자만 잡고 인자 이름과 종료 코드의 뜻은 잡지 못한다. 형제 SPEC은 아직 `draft`(또는 진행 중)라 식별자가 바뀌면 구조 시험이 실패해 런북·형제 연결 표를 고치게 한다(의도한 동작이다). 단계 이행 절차의 순서는 위 발견 2·3이 정해질 때까지 이 단위의 해석이다.

### M3c (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `067ed1b` 위의 작업 트리(커밋 전). 명령은 `> 로그 2>&1; echo "exit=$?" >> 로그` 형태로 실행했고 종료 코드는 로그의 `exit=` 줄에서 읽었다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `M3c-*.log`다. 이 커밋의 SHA는 같은 커밋에 들어가므로 여기에 적을 수 없고 보고에 적는다.
- **범위(사용자 결정)**: M3a가 미뤄 M6 추적표가 빠졌다고 확인한 AC-B2CLAUNCH-010 시나리오 3(교차 조합 세 가지의 로컬 서버 관측) 하나. `spec.md`·`plan.md`·`acceptance.md`, `app/`·`components/`·`lib/diagnosis`·`lib/consult`·`lib/env.ts`·`package.json`·`pnpm-lock.yaml`·vitest 설정·`.github`·`.env*`, `scripts/verify-flag-runtime.ts`, 엔진 준비 코드 오라클과 그 허용 목록·시험은 바꾸지 않았다. SPEC 문구의 틈은 고치지 않고 적힌 대로 구현하되 말하지 않은 곳은 닫았으며 아래 "발견"에 모았다.
- **변경 파일**: 신규 `lib/launch/cross-combination.ts`(+`cross-combination.test.ts`), 기존 `scripts/verify-gate-reachability.ts`(+`verify-gate-reachability.test.ts`)의 확장, `.moai/docs/launch-gate-runbook.md`(`## 점검 도구와 실행 방법`의 D 항목 두 곳만), 이 파일(이 절과 M6 추적표의 REQ-B2CLAUNCH-010 한 행).
- **구현한 것**: (1) `lib/launch/cross-combination.ts` — 서버를 시작하지 않는 순수 로직. AC가 적은 교차 조합 셋(`F1E1D0`×`C1P1`, `F0E0D0`×`C1P1`, `F0E0D0`×`C0P1`)을 조합 키로만 적고, `planCrossCombinations`가 독립된 기대 표(`gate-state-table.fixture.ts`)에서 그 키의 행을 찾아 시작 플래그 값과 경로별 기대 도달 상태(`/`·`/result`·`/consult`는 본 화면 또는 placeholder, 접수는 503 여부)를 읽는다. 키 형식 오류·없는 행·진단 게이트 표지 불일치·표 칸이 알려진 어휘가 아님은 모두 오류로 알리고 계획을 만들지 않는다(fail-closed, 오류는 칸 값을 되풀이하지 않는다). `checkCrossObservation`·`crossMismatches`·`formatCrossReport`가 네 경로의 기대와 관측을 줄마다 OK 또는 MISMATCH로 대조한다. (2) `scripts/verify-gate-reachability.ts` — 기존 시나리오 2 관측은 그대로 두고(빌드 하나, 시작 하나) 같은 빌드를 재사용해 조합마다 서버를 새로 시작한다. 시작 환경은 `verify-flag-runtime.ts`가 내보내는 `assembleEnv`가 만들고(`assembleCrossCombinationEnv`는 거기에 DB 주소와 시크릿만 이 스크립트의 로컬 파일 DB와 실행 시점에 만든 시험용 값으로 바꾸며 `file:`이 아니거나 시크릿이 비면 거부) 플래그 값은 기대 표의 조합 키에서 온다. `buildCrossObservation`이 세 경로의 응답 본문(`/`·`/result`는 `buildDiagnosisObservation`, `/consult`는 제목과 placeholder 문구)과 접수 응답에서 도달 상태를 읽는다. 접수 관측은 기존 시나리오 2와 같은 방식의 합성 요청(스키마를 통과하지만 동의 버전이 활성 정책 버전과 다른 값, 호출마다 새로 만듦)이다. 교차 조합의 기대 표를 읽지 못하면 빌드 전에 종료 코드 2로 거부한다.
- **오라클 준수**: 새 비시험 파일에 엔진 준비 변수의 이름이 한 번도 나오지 않는다(소스 정적 시험이 `DIAGNOSIS_ENGINE_READY` 문자열 부재와 `assembleEnv` import를 고정한다). 변수 이름을 계산하거나 이어 붙이거나 표를 돌며 대입하는 코드는 없다 — 플래그는 `플래그 객체 → assembleEnv`로만 흐른다. 오라클을 최종 트리에서 실행한 출력은 아래 "검증"에 있고 `scripts/verify-flag-runtime.ts`의 허용된 두 줄 그대로다.

**RED**(`M3c-red.log`): 최소 스텁(`planCrossCombinations`는 모양만 맞는 빈 계획 셋, 나머지는 빈 값)으로 새 시험을 돌려 import·타입 오류 없이 단언에서 실패했다 — `Test Files 2 failed (2)`, `Tests 32 failed | 30 passed (62)`, `exit=1`. 실패 사유는 `AssertionError: expected undefined to be 'true'`, `expected [] to deeply equal [ [ 'F1E1D0', 'C1P1' ], …(2) ]`, `expected true to be false`(fail-closed 시험) 같은 값 불일치다. 첫 실행은 스텁이 `미구현` 오류를 던져 단언이 아니라 던져진 오류로 실패해 그 스텁을 모양만 맞는 값으로 바꾸고 다시 돌렸다(로그는 두 번째 실행이다).

**GREEN**(`M3c-green-touched.log`): 새·바뀐 시험 두 파일 `Test Files 2 passed (2)`, `Tests 62 passed (62)`, `exit=0`. 이후 상담 표에 조합 행이 없는 경우의 시험 하나를 더해(커버리지 점검에서 그 분기가 비어 있었다) 최종은 `Tests 63 passed (63)`다(`M3c-coverage.log`).

**E1 AC-B2CLAUNCH-010 시나리오 3 — 교차 조합 로컬 관측**(명령 `pnpm exec tsx scripts/verify-gate-reachability.ts`, 로그 `M3c-reachability.log`, `exit=0`, `전체 불일치 관측 합계: 0`). 시작 환경은 `assembleEnv`, 시크릿은 실행 시점에 만든 시험용 값(미출력), 로컬 `file:` DB다. 빌드는 시나리오 2와 같은 하나를 재사용했고 그 빌드 환경에는 진단·상담 화면 플래그가 없어 세 조합 모두 "빌드 뒤에 바뀐 환경"으로 시작했다. 기대는 `gate-state-table.fixture.ts`(`spec.md` §2.3을 옮긴 독립 fixture)의 경로별 도달 칸에서 왔다:

| 조합 | 경로 | 기대 | 관측 | 판정 |
|---|---|---|---|---|
| (1) 진단 production 경로 열림 × C·P 참 (`F1E1D0`×`C1P1`) | `/` | 본 화면 | 본 화면 | OK |
| | `/result` | 본 화면 | 본 화면 | OK |
| | `/consult` | 본 화면 | 본 화면 | OK |
| | `POST /api/consultations` | 503 아님 | 503 아님(상태 409, `consent_version_mismatch`, 행 수 전 0 후 0) | OK |
| (2) 진단 닫힘 × C·P 참 (`F0E0D0`×`C1P1`) | `/` | placeholder | placeholder | OK |
| | `/result` | placeholder | placeholder | OK |
| | `/consult` | 본 화면 | 본 화면 | OK |
| | `POST /api/consultations` | 503 아님 | 503 아님(상태 409, `consent_version_mismatch`, 행 수 전 0 후 0) | OK |
| (3) 진단 닫힘 × C 거짓·P 참 (`F0E0D0`×`C0P1`) | `/` | placeholder | placeholder | OK |
| | `/result` | placeholder | placeholder | OK |
| | `/consult` | placeholder | placeholder | OK |
| | `POST /api/consultations` | 503 아님 | 503 아님(상태 409, `consent_version_mismatch`, 행 수 전 0 후 0) | OK |

같은 실행에서 기존 시나리오 2 관측도 그대로 통과했다(`/consult` 제목 `서비스 준비 중`, placeholder 문구 있음, 접수 409 `consent_version_mismatch`, 행 수 전 0 후 0, `불일치 관측 합계: 0`). 접수 응답 상세(상태·오류 코드·행 수)는 참고로 출력할 뿐 판정에 쓰지 않는다.

**검증(이 단위, 최종 트리)**: `pnpm exec tsc --noEmit` → `exit=0`(`M3c-tsc.log`). `pnpm lint` → `exit=0`(`M3c-lint.log`). 새·바뀐 TS 넷 `prettier --check` 통과, `exit=0`(`M3c-prettier.log`). `pnpm test` → `Test Files 138 passed (138)`, `Tests 1643 passed (1643)`, `exit=0`(`M3c-test-full.log`). `pnpm build` → `exit=0`(`M3c-build.log`). `pnpm verify:flag-runtime` → `불일치 관측 합계: 0`, `exit=0`(`M3c-flag-runtime.log`). `pnpm exec tsx scripts/verify-smoke-check.ts` → `불일치 관측 합계: 0`, `exit=0`(`M3c-smoke.log`; 로그에 `판정: 실패` 줄이 있는 것은 일부러 실패하는 합성 서버 상태 관측이고 합계에 불일치로 들어가지 않는다). `pnpm exec tsx scripts/verify-rollback-dark.ts` → `불일치 관측 합계: 0`, `exit=0`(`M3c-rollback.log`). 엔진 준비 코드 오라클(`M3c-oracle.log`): `scripts/verify-flag-runtime.ts:174`·`:293`의 허용된 두 줄과 `missing=0`, `exit=0`. 커버리지(명령줄 덮어쓰기, `M3c-coverage.log`): `lib/launch/cross-combination.ts` 구문 97.61%·분기 95.89%·함수 100%·줄 100%. `scripts/verify-gate-reachability.ts`는 구문 52.77%·분기 66.66%이고 미덮개는 `runPnpm`·`countConsultations`·`observe`·`observeCross`·`observeWithServer`·`main`·직접 실행 분기(빌드·서버 배선 281행 이후)이며 순수 함수(`assembleCrossCombinationEnv`·`buildCrossObservation`·기존 판정·안전 함수)는 모두 시험으로 덮인다. 배선은 위 실제 실행이 덮는다. `pnpm test:e2e`·`pnpm visual:verify`는 화면이 바뀌지 않아 실행하지 않았다. `verify-remote-consult.test.ts` 플레이크는 이 실행에서 나타나지 않았다(전체 시험 두 번 모두 통과).

**발견(SPEC 문서는 고치지 않았다, 적힌 대로 진행하고 말하지 않은 곳은 닫았다 — manager-spec 일괄 처리용)**:

1. **"진단 닫힘"이 어느 행인가**: AC는 "진단 닫힘 × …"만 적는데 `spec.md` §2.3 진단 표에서 닫힌 행은 셋(`F0E0D0`, `F0E1D0`, `F1E0D0`)이다. 모든 진단 플래그 미설정인 `F0E0D0`(dark) 하나로 읽었다. 나머지 둘 가운데 `F1E0D0`은 `verify:flag-runtime`이 상담 `C0P0`으로만 시작하고 `F0E1D0`은 어느 하네스(코드 읽기, 이 단위 밖)도 시작하지 않는 것으로 읽었다 — 상담 두 플래그가 참인 쪽에서 닫힌 진단 행은 `F0E0D0`만 읽었다.
2. **"production 경로 열림"이 어느 행인가**: `F1E1D0`(열림(production 경로))과 `F1E1D1`(열림(둘 다), 문서 금지 `D`)이 있고 AC는 전자를 뜻한다고 읽었다. 조합의 게이트 표지(`열림(production 경로)`)를 키와 함께 적어 키 오타가 다른 행을 고르는 일을 막았다.
3. **접수 API의 기대는 "503 아님"뿐이다**: AC와 §2.3은 접수가 열린 칸을 "503이 아니다"로만 적는다. 이 관측의 합성 요청(스키마 통과, 동의 버전 불일치)이 409 `consent_version_mismatch`를 받는 것은 세 조합 모두에서 관측됐지만(AC-009 시나리오 2는 `P`만 읽는다는 LF-07에서 같은 결과를 예상하고 `C`·진단 플래그는 읽지 않는다고 적었다) 이 AC가 조합마다 409를 요구하지는 않아 판정에는 쓰지 않았다. 반대로 SPEC이 말하지 않은 503 이외의 서버 오류(5xx)는 열려 있다는 증거로 읽지 않고 불일치로 닫았다(SPEC에 없는 fail-closed 규칙). 유효한 요청이 실제로 201로 접수되는지는 이 AC의 범위가 아니라 관측하지 않았다(LF-11이 적은 과거 `api=201`과 이 합성 요청은 다르다).
4. **`/result`의 상담 CTA 활성은 읽지 않았다**: §2.3 "경로별 도달 규칙"은 `/result`가 열렸을 때 상담 CTA가 `C`가 참일 때만 활성이라고 적지만 기대 표에는 이 차원의 칸이 없다(M3a 발견 2). AC 시나리오 3이 "각 경로의 도달 상태"에 CTA 활성을 포함하는지 SPEC이 말하지 않아 포함하지 않았다. 조합 (1)·(2)에서 `/result`의 본 화면 또는 placeholder만 판정했다.
5. **빌드 환경**: AC는 어느 환경으로 빌드하라고 적지 않았다. 시나리오 2와 같은 빌드 하나(진단·상담 화면 플래그 없음, 정책 플래그 참)를 재사용했다. 열린 환경에서 만든 빌드의 요청 시점 읽기는 `pnpm verify:flag-runtime`(`closed`·`open` 두 빌드)이 이미 본다.
6. **`assembleEnv`의 시크릿과 DB**: `assembleEnv`는 고정된 시험용 시크릿 문자열과 상대 경로 DB(`./.tmp/flag-runtime.db`, 모듈 내부 변수)를 넣는다. 고정 리터럴 시크릿을 쓰지 않는다는 이 단위의 안전 규칙과 다른 DB 파일을 쓰는 시나리오 2의 방식을 지키려고 반환된 자식 환경 객체에서 두 값만 바꿔 쓴다(`verify-flag-runtime.ts`를 고치지 않았다).
7. **종료 코드 2의 확대**: 기존 2는 사전 점검 위반만이었다. 교차 조합의 기대 도달 상태를 기대 표에서 읽지 못하는 경우(표·조합 키의 오류)도 빌드 전에 2로 거부하도록 했다. SPEC은 이 경우의 종료 코드를 정하지 않았다.
8. **독립 기대값의 한계**: 기대값은 `spec.md` §2.3을 M3a가 옮긴 fixture이고 시작 플래그 값도 같은 표의 조합 키에서 읽는다. 옮김이 틀리면 기대와 시작 입력이 같이 틀린다. 시험이 조합 셋의 시작 플래그를 AC 문구의 리터럴(`{ flow: true, engine: true, dev: false }` 등)로 고정한다. 그러나 fixture와 `spec.md` §2.3 표의 줄 단위 대조(`lib/diagnosis/flags.gate-table.test.ts`)는 플래그 칸·`productionReady`·`reviewEnabled`·게이트·표시와 상담 표의 화면·접수 칸만 덮고, 이 관측이 기대로 쓰는 경로별 도달 칸(`/`·`/result`·`/consult`·`POST`)은 `spec.md`에 표 칸이 아니라 "경로별 도달 규칙" 산문으로만 있어 기계적 대조가 없다(M3a가 산문을 칸으로 옮긴 것이다 — M3a 발견 1). 그 칸의 옮김이 틀리면 이 관측의 기대가 틀린다.
9. **M6 추적표 아래 문단이 낡았다**: "표 아래의 판정"이 AC-010 시나리오 3을 `not implemented`로 적은 문장은 이 단위로 사실이 아니게 됐다. 이 단위는 그 행만 고치라는 범위라 문단은 그대로 두었다(M3a 발견 10·Gaps의 "시나리오 3은 하지 않았다"도 그때의 기록이다).
10. **`package.json` 스크립트 미등록**: 이전 단위와 같다. 실행은 `pnpm exec tsx scripts/verify-gate-reachability.ts`다.
11. **Node 경고**: 실행 로그의 `DEP0190`(`shell: true`에 인자를 넘긴다는 경고)는 기존 `runPnpm`·`spawn("pnpm", …)` 패턴에서 오며 이 단위가 새로 만든 것이 아니다.

**Gaps(관측하지 못한 것)**: 운영 호스트·프록시·방화벽·실제 네트워크 노출, 운영의 환경 변수 소스(PM2 저장 환경·`.env`) 해석, 값에 공백이 붙은 운영 입력 실수. 교차 조합 관측은 한 번의 로컬 실행이고 한 번 통과했다는 사실이 불안정이 없다는 증명은 아니다. 유효한 요청이 201로 접수되는 경로, `/result`의 상담 CTA 활성 여부, 진단 닫힘의 다른 두 행(`F0E1D0`·`F1E0D0`)과 상담 표의 `C0P0`·`C1P0` 조합, 표 12행 가운데 위 세 조합을 뺀 서버 관측은 이 스크립트가 읽지 않는다. `moai` CLI·MCP가 연결되지 않아 `moai spec lint`·@MX 태그 점검은 실행하지 못했고 @MX 태그는 추가하지 않았다.

**잔여 위험**: 응답 본문의 제목·placeholder 문구·열림 전용 prop 이름(`enableDevStates`·`enableDevFixture`)에 기대는 판독이라 화면 문구나 prop 이름이 바뀌면 관측이 `unknown`이 되어 불일치로 읽힌다(fail-closed 방향). ENGINE-001이 게이트 입력을 바꾸면(N6) fixture와 이 조합 키·진단 게이트 표지를 함께 갱신해야 한다. 서버 시작을 네 번 하므로 다른 verify 스크립트와 동시에 실행하면 `.next`와 포트를 두고 부딪친다(런북이 동시 실행 금지를 적는다).

### SPEC 문구 일괄 보완 (2026-10-07)

- **측정 대상**: 브랜치 `worktree-launch-run`, HEAD `4b9be2f` 위의 작업 트리(커밋 전). 사용자가 승인한 문구 전용 일괄 보완이다 — 결정·새 요구사항·동작 변화·낮춘 검증 기준이 없고 REQ 16건·AC 16건의 번호와 개수, AC-B2CLAUNCH-008 fixture 수(열한 가지)는 그대로다. 원문 로그는 `.moai/state/verify/launch-run/`(git이 무시하는 경로)의 `SPECB-*.log`다. 이 커밋의 SHA는 같은 커밋에 들어가므로 여기에 적을 수 없다.
- **고친 것**(줄 번호는 이 보완을 적용한 뒤의 파일 기준, 앞은 보완 전·뒤는 보완 후 요약):
  1. **N1 — REQ-B2CLAUNCH-008의 "항목 전체 덮기(집합 동일성)"를 §2.4에 전파**(문구는 REQ-008과 같다: "서명 기록은 요청이 읽는 단계(로컬 시험 판정이면 그 판정)가 요구하는 항목 전체를 덮어야만 서명으로 인정한다 — 기록이 담은 항목 집합은 그 단계의 필수 항목 집합과 같아야 하며, 필수 항목을 하나라도 빠뜨린 기록은 서명으로 인정하지 않는다", 새 규칙을 더하지 않았다). `spec.md:134`(단계 서술: 문장 하나 추가, REQ-008 인용), `spec.md:139`·`:140`(단계 표 판정 칸: "… `production` I 서명이 있음"·"… G 서명이 있음" → "… 그 필수 항목 전체를 덮는 `production` I 서명이 있음"·"… G 서명이 있음"), `spec.md:144`(I 서명 적용 규칙: 같은 문장 추가), `spec.md:159`(서명 기록 정의: 같은 문장과 REQ-008 인용 추가). 단계 표는 런북이 `stage-table.test.ts`로 글자 그대로 대조하는 줄이라 `.moai/docs/launch-gate-runbook.md:12`·`:13`을 같은 글자로 맞췄고, 런북의 같은 뜻 서술 `:18`(단계 서술)·`:32`(I 서명 적용 규칙)에도 같은 문장을 더했다.
  2. **AC-B2CLAUNCH-008 (마) 괄호 보완**(`acceptance.md:61`): 앞은 "(운영 한정 항목 L-01·L-05·R-04는 `local` 판정에 적용되지 않으므로 서명 대상 항목이 아니다)", 뒤는 "(필수 항목 집합 밖의 항목은 서명 대상 항목이 아니다 — 운영 한정 항목 L-01·L-05·R-04는 `local` 판정에 적용되지 않고, 요청한 단계(여기서는 I)의 열이 `해당 없음`인 항목, 목적 벡터가 열지 않는 표면의 항목, 면제된 `결정 대기` 칸의 항목도 `spec.md` §2.4 항목 정의표 읽는 법에 따라 그 집합 밖이다)". 구현된 점검기가 읽는 방식(M1e 발견 2)을 적었을 뿐 결정한 것이 없다.
  3. **N2 — 용어·발동 조건 통일**: (a) `R-nn`과 참조 줄의 정의(`spec.md:148`): 앞 "`R-nn`은 형제 SPEC이 소유한 증거의 참조 줄이고 …", 뒤 "`R-nn`은 형제 SPEC이 소유한 증거를 참조하는 이 SPEC의 항목이고(그 증거는 참조 줄로만 참조한다 — 참조 줄은 형제 항목 하나를 옮겨 적은 기록이며 그 연결 필드가 이 SPEC의 항목을 가리킨다, REQ-B2CLAUNCH-004), …". 런북 `:54`를 같은 문장으로 맞췄고 `:373`("R-01~R-05는 … 참조 줄이라" → "… 참조하는 항목이라")도 같은 용어로 맞췄다. (b) 발동 조건 한 문구 — "형제 기록의 상태 또는 대상 값이 참조 줄에 적힌 값과 달라짐"(EV-L3의 기존 문구가 정본이고 구현 `lib/launch/sibling-reference.ts:181-186`이 상태와 대상 값을 모두 비교한다): `spec.md:200`(REQ-004: "참조 줄이 형제 기록과 달라지면 …" → "형제 기록의 상태 또는 대상 값이 참조 줄에 적힌 값과 달라지면(EV-L3) …"), `acceptance.md:35`(AC-004 (라)). EV-L3(`spec.md:154`)는 이미 그 문구라 고치지 않았다. 어떤 사건이 어떤 항목을 강등하는지는 바꾸지 않았다.
  4. **AC-B2CLAUNCH-004 (가)·(다) 문구**(`acceptance.md:35`, 감사 N3): (가)에 "연결 필드가 이 SPEC의 존재하는 항목을 가리킴"을, (다)를 "참조 줄에 형제 상태와 다른 자체 판정 상태 칸이 있음"에서 "참조 줄에 허용된 필드(연결 필드 포함) 밖의 자체 판정 칸이 있음"으로. (라)는 위 3(b)의 발동 조건 문구에 "이 fixture는 옮겨 적은 대상 값이 형제 기록의 현재 값과 다른 경우"를 덧붙여 시험 범위를 넓히지 않았다. fixture는 더하지 않았다(네 가지 그대로, `Then`절 그대로).
  5. **AC-B2CLAUNCH-010 시나리오 3**(`acceptance.md:89`): "진단 닫힘"이 `spec.md` §2.3 진단 표에서 `F`·`E`·`D`가 모두 0인 행(진단 플래그 전부 미설정, 키 `F0E0D0`)이고 "진단 production 경로 열림"이 `F`=1·`E`=1·`D`=0인 행(키 `F1E1D0`)이라고만 적었다. 관측 대상(`/consult`의 상담 CTA 도달 등)은 AC가 적은 그대로 두었고 좁히거나 넓히지 않았다(M3c 발견 1·2의 해소).
  6. **N6 — HISTORY 행**(`spec.md:27`): `b55f35d`(REQ-004 연결 필드, REQ-008 항목 전체 덮기, AC-004 (라), AC-008 fixture (카)로 열 가지→열한 가지, `plan.md` M1의 fixture 수)와 이 일괄 보완을 한 행으로 적었다. 이전 HISTORY 행은 건드리지 않았다. `version`은 `"0.1.0"` 그대로다 — 이 SPEC의 HISTORY 행 어느 것도 `version`을 올리지 않았고(`git log -G'^version:'`는 최초 커밋 하나만 가리킨다) 이전 관례를 따라 올리지 않았다. `status: in-progress`·`updated: 2026-10-07`도 그대로다.
  7. **런북 낡은 문장**(`.moai/docs/launch-gate-runbook.md:73`): "이 골격은 항목 표의 칸에 이미 적힌 파일 집합 외에 …" → "이 문서는 …". 제목에서 "골격"이 빠진 뒤 문서 이름과 어긋나던 낱말 하나만 고쳤다(M6 발견 6).
- **일부러 건드리지 않은 것**:
  - **N4**(AC-008 (가)(마) 본문에 "필수 항목 전체를 담음", [로컬] 부분 덮기 fixture 추가): 허용된 수정 항목에 없고, fixture 추가는 AC-008의 fixture 수(열한 가지)와 `plan.md` M1·`check-launch-gate.test.ts`·추적표의 개수를 줄줄이 바꾼다. 이월.
  - **N5**(REQ-B2CLAUNCH-004의 발동 결과 문장 분리·삭제): 사용자가 금지한 항목이다. 문구만 위 3(b)대로 맞췄다.
  - `plan.md`(52·94행의 참조 줄·EV-L3 서술 포함), `progress.md`의 이 절 밖, 이전 HISTORY 행(예: `spec.md:26`의 "열 가지"는 당시 사실의 기록이다), `spec.md`의 단계 표 밖 판정 서술, `acceptance.md`의 다른 AC: 허용 범위 밖이다.
  - D-LAUNCH-03 벡터 순서, 단계 I에서의 `# 앵커`·텍스트만 푸터 요소 허용, 기록·서명 위치, U1·U3·U5, `.moai/docs/runtime-runbook.md` §11 연결, 요소 식별자 체계: 결정이라 건드리지 않았다.
  - `version` 올림: 위 6의 이유로 하지 않았다.
  - 형제 SPEC 디렉터리, 코드·시험(`lib/launch/item-table.test.ts:259`의 "런북 골격" 시험 제목 포함)·`package.json`·`.github`·`.env*`.
- **검증**: `pnpm test` → `Test Files 138 passed (138)`, `Tests 1643 passed (1643)`, `exit=0`(`SPECB-test-full.log`, 변경 전 M3c 기준과 같은 개수). `pnpm lint` → `exit=0`(`SPECB-lint.log`). `pnpm exec tsc --noEmit` → `exit=0`(`SPECB-tsc.log`). REQ 줄 수 16, AC 줄 수 16(`SPECB-count-req.log`·`SPECB-count-ac.log`). 이 보완은 재감사를 받지 않았다.

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
