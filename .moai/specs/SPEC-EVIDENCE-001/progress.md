# SPEC-EVIDENCE-001 — 진행 기록 (progress.md)

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-08-29 (plan-auditor iteration 2/3 PASS 실제 관측 — 아래 §G.1 "iteration 2, PASS" 항목 참고)
tier: L
artifact_set: spec.md, plan.md, acceptance.md, design.md, research.md (5개, Tier L)
spec_version: "0.5.0"

### 자체 점검 결과 (plan-auditor 실행이 아님 — §G.1 참고)

이 세션은 `Agent` 도구가 없어 `plan-auditor` subagent를 직접 실행할 수 없었다. 아래는
plan-auditor가 통상 확인하는 항목들을 grep/카운트로 직접 재현한 **자체 점검**이며,
`plan-auditor` 자신의 판정을 대체하지 않는다(verification-claim-integrity 원칙 — 관측하지
않은 검증을 관측했다고 기록하지 않는다). v0.3.0(외부 독립 리뷰 최종 revision 반영) 기준으로
재실행했다.

| 점검 항목 | 방법 | 결과 |
|-----------|------|------|
| frontmatter 12필드 | `sed -n '1,17p' spec.md` 육안 대조 | 12개 canonical 필드 전부 존재, snake_case alias 없음, `version: "0.3.0"` |
| REQ 개수 (Tier L 상한 25) | `grep -oE '^\| REQ-EVIDENCE-[0-9]+ \|' spec.md \| sort -u \| wc -l` | 25개 — 상한 유지, v0.3.0에서 새 top-level REQ 추가 없음(이슈 1/2는 기존 REQ-EVIDENCE-016, REQ-EVIDENCE-017, REQ-EVIDENCE-007 wording 수정으로 반영) |
| AC 개수 (Tier L 상한 25) | `grep -oE '^\*\*AC-EVIDENCE-[0-9]+[a-z]?\*\*' acceptance.md \| sort -u \| wc -l` | 25개(REQ-016만 4개 서브레터 016a/b/c/d) — 상한 유지, v0.3.0에서 새 AC 추가 없음(AC-006/014 본문 확장만) |
| `[NEEDS CLARIFICATION]` 잔존 | `grep -c "NEEDS CLARIFICATION"` (spec/research/design/plan/acceptance 5개 파일) | 0건 |
| REQ→AC traceability | REQ-EVIDENCE-001~021/026/029/030/031(25개) 각각을 `acceptance.md`에서 `\b` 경계 grep | 25개 전부 ≥1건 참조, 0건 참조인 REQ 없음(v0.2.0에서 발견·수정한 슬래시 병기 버그 재발 없음 확인) |
| `## Out of Scope` h2-alone 함정 | `grep -n "^## \|^### " spec.md` | §4는 `## §4. 제외 범위 (Out of Scope)`(h2) + 5개 `### Out of Scope — <항목>`(h3) 서브섹션 — v0.3.0에서도 유지 |
| `phase:` 금지값(plan/run/sync/mx) | frontmatter `phase:` 값 확인 | `"v0.8.0 target"` — 금지값 아님 |
| "corpus 확장 효과" 잔존 mislabeling | `grep -rn "corpus 확장 효과\|Corpus 확장 효과" *.md` (6개 아티팩트) | 남은 매치는 전부 (a) HISTORY의 과거형 서술("~로 잘못 명명했다") 또는 (b) 명시적 부정문("~이 아니다"/"~를 주장하지 않는다") — 실제 설계 본문에 오분류 잔존 없음 |
| 이전 결함 문구 잔존 확인 | `grep -rn "정렬.*전용\|현행 구조를 보존\|3개 컬럼\|A와 B는 fixture"` (전체 아티팩트) | HISTORY 항목(과거형 서술) 외 매치 없음 — 실제 설계 본문에 구결함 문구 잔존 없음 |

이 표는 **기계적으로 확인 가능한 항목만** 다룬다. plan-auditor 고유의 정성적 판단(Clarity/
Completeness/Testability/Traceability 4축 가중 점수, must-pass 7개 기준 종합 판정, PASS
threshold 0.85 도달 여부)은 이 세션이 재현할 수 없다 — 아래 §G.1에서 이 gap을 명시한다.

### v0.4.0 자체 점검 (외부 독립 리뷰 잔여 정합성 반영 이후)

| 점검 항목 | 방법 | 결과 |
|-----------|------|------|
| REQ 개수 (Tier L 상한 25) | `grep -oE '^\| REQ-EVIDENCE-[0-9]+ \|' spec.md \| sort -u \| wc -l` | 25개 — v0.4.0에서도 새 top-level REQ 추가 없음(기존 REQ-EVIDENCE-007, REQ-EVIDENCE-015, REQ-EVIDENCE-016, REQ-EVIDENCE-017 wording 수정만) |
| AC 개수 (Tier L 상한 25) | `grep -oE '^\*\*AC-EVIDENCE-[0-9]+[a-z]?\*\*' acceptance.md \| sort -u \| wc -l` | 25개 — v0.4.0에서 새 AC ID 추가 없음(AC-006/013/014/018 본문에 Then 절 추가만) |
| design.md `isDuplicate()`에 `a.sourceIdentifier` 잔존 여부 | `grep -n "a\.sourceIdentifier" design.md` | 매치 1건, §6 함수 본문이 아니라 "추후 migration 시 이렇게 확장한다"는 설명 텍스트 안의 예시 코드 조각 — 실제 `isDuplicate()` 구현(`function isDuplicate`)은 `sameSource = Boolean(a.sourceUrl) && a.sourceUrl === b.sourceUrl`만 사용, `sourceIdentifier` 미참조 확인 |
| design.md `precisionAt5()`에 `candidates.length` 잔존 여부 | `grep -n "candidates\.length" design.md` | 0건 — `precisionAt5()`가 `candidates.slice(0, 5).filter(...).length / 5`로 표준 정의(top-5/5)를 사용함을 확인 |
| design.md 하드코딩 `ISSUE_TYPES = [` 리터럴 배열 잔존 여부 | `grep -n "ISSUE_TYPES = \[" design.md` | 매치 1건이지만 `QUERY_ISSUE_TYPES = [`(SSOT const 선언, §1.4a)의 부분 문자열일 뿐 — 별도 `const ISSUE_TYPES = [...]` 선언은 존재하지 않음(§1.5 zod 스키마가 `import { QUERY_ISSUE_TYPES } from "../../lib/pipeline/types.ts"`로 이를 소비) |

## §G.1 plan-auditor 실행 결과 — iteration 1, FAIL (v0.4.0 아티팩트 대상)

**이 SPEC에 대해 실제 `plan-auditor` subagent가 처음으로 실행됐다(iteration 1/3, plan-auditor
Retry Loop Contract).** 이전 v0.1.0~v0.4.0 개정 라운드(§G.3/§G.4/§G.5)에서는 이 작성 세션에
`Agent` 도구가 없어 plan-auditor를 직접 spawn할 수 없었고, 대신 grep/카운트 기반 자체 점검만
반복했다 — 이번이 orchestrator 세션이 `plan-auditor`를 실제로 spawn해 5개 v0.4.0 아티팩트
(`spec.md`/`research.md`/`design.md`/`plan.md`/`acceptance.md`)를 감사한 첫 실행이다.

**결과는 PASS가 아니라 FAIL이다.** orchestrator가 plan-auditor 자신의 리포트에서 직접 관측한
verdict를 아래에 있는 그대로(축소·상향 없이) 기록한다 — verification-claim-integrity 원칙에
따라 관측하지 않은 검증을 관측했다고 기록하지 않으며, 동시에 관측한 FAIL을 PASS로 downgrade하지
않는다. `plan_status`는 `audit-ready`로 갱신하지 **않는다** — 그렇게 하면 FAIL을 PASS로
오기재하는 것이 된다(위 §E.1 `plan_status: draft-audit-failed` 참고).

### 실행 결과 요약

- **Verdict**: **FAIL** (iteration 1/3)
- **Overall score**: 0.80 (4축 조화평균) — 그러나 must-pass 기준(MP-1) 실패로 인해 점수와
  무관하게 verdict는 FAIL이다(M5 firewall: must-pass 항목 중 하나라도 FAIL이면 overall score와
  무관하게 verdict는 무조건 FAIL).
- **Must-pass 7항목 결과**:
  - MP-1 REQ 번호 일관성 = **FAIL** — REQ-EVIDENCE ID가 001-021, 026, 029, 030, 031(총 25개)로
    구성되어 있는데, 이것이 순차적인 001..025 시리즈가 아니다. 022/023/024/025/027/028 번호가
    ID 공간에서 비어 있고, HISTORY는 027→005, 028→008로의 병합만 설명할 뿐 022-025가 왜 없는지는
    설명하지 않는다.
  - MP-2 EARS/GEARS 형식 = PASS
  - MP-3 YAML frontmatter 유효성 = PASS
  - MP-4 언어 중립성 = N/A(단일 도메인, 자동 PASS)
  - MP-5 D7 cross-SPEC 정합성 = PASS(`depends_on`에 명시된 두 SPEC 모두 `status: completed` 확인됨)
  - MP-6 D8 cross-platform discipline = N/A(syscall 사용 없음, 자동 PASS)
  - MP-7 clarification gate = PASS(`[NEEDS CLARIFICATION]` 매치 0건)
- **4축 카테고리 점수**: Clarity 0.75, Completeness 0.75, Testability 0.75, Traceability 1.0.

### 발견된 결함 (D1 critical/blocking, D2-D5 minor/optional)

- **D1 (critical, blocking)**: REQ-EVIDENCE ID 시퀀스에 022/023/024/025/027/028 갭이 있고,
  HISTORY가 022-025의 부재를 설명하지 않는다. 수정 경로: 25개 REQ-EVIDENCE ID 전체를 모든
  아티팩트에서 순차적인 001..025 시리즈로 재번호하거나, 명시적 HISTORY ledger를 추가한다 —
  auditor는 문서화 여부와 무관하게 M5 firewall에 따라 이 갭 자체가 FAIL이므로, 재번호가 MP-1을
  통과시키는 유일한 경로라고 명시했다.
- **D2 (minor, optional)**: spec.md §4의 5개 `### Out of Scope — <항목>` H3 서브섹션이 산문
  단락으로만 되어 있고 `OutOfScopeRule` lint 컨벤션의 Score-1.0 밴드가 요구하는 리터럴 `-`
  bullet 라인이 없다.
- **D3 (minor, optional)**: acceptance.md §A/§D의 REQ→AC 병합 요약이 2건(당시 번호 REQ-029→AC-008, REQ-030→AC-014 —
  현재 번호로는 REQ-EVIDENCE-013→AC-008, REQ-EVIDENCE-017→AC-014)만 명시하고, AC-EVIDENCE-016d
  자신의 헤더에 보이는 3번째 병합(당시 번호 REQ-031→AC-016d, 현재 REQ-EVIDENCE-020→AC-016d)을
  누락했다 — 실제 기계적 링크가 끊긴 것이 아니라 자기서술(self-description)
  누락이다.
- **D4 (minor, optional)**: REQ-EVIDENCE-009(spec.md)이 WHAT/WHY 산문이 아니라 boolean-formula
  의사코드를 문자 그대로 요구사항 본문에 삽입하고 있다 — design.md §2.1의 canonical formula와
  중복된다.
- **D5 (minor, optional)**: REQ-EVIDENCE-021의 "가능한 경우" 수식어가 선언된 Ubiquitous 패턴을
  조건부 escape hatch로 완화시킨다.

### v0.4.0 라운드 자체 편집분에 대해 새로 확인된 정합성 (auditor가 명시적으로 확인)

auditor는 다음을 명시적으로 검증했다: REQ-EVIDENCE-016/AC-EVIDENCE-014의 non-regression PASS
조건이 design.md §3.3b/§3.4A와 단어 단위로 일치하며 모순이 없음; REQ-EVIDENCE-015, REQ-EVIDENCE-017의 ground
truth completeness 요건 + `precisionAt5()` 표준 정의(top-5/5, Precision@Returned 명시적 배제)가
spec.md/design.md/acceptance.md 전체에서 일관됨; design.md §6 `isDuplicate()`가
sourceIdentifier-not-introduced 기본안과 자기정합적임; `QueryIssueType`/`QUERY_ISSUE_TYPES` SSOT
배선이 end-to-end로 올바름.

### 이 FAIL의 원인 시점과 발견되지 않았던 이유

D1(REQ ID 갭)의 근원은 v0.2.0 개정(spec.md HISTORY 참고 — REQ-EVIDENCE-026/027/028/029/030/031(v0.2.0 당시 번호)이
도입되고 027/028이 (v0.2.0 당시 번호로) 005/008에 병합된 시점 — v0.2.0 당시 026/029/030/031은 이번 D1 재번호화로 각각 현재 REQ-EVIDENCE-005/013/017/020이 됐다)이며, v0.4.0의 잔여 정합성 라운드 이전부터 존재했다.
지금까지 발견되지 않은 이유는 이 SPEC에 대해 실제 plan-auditor가 실행된 적이 없었기 때문이다 —
progress.md가 이전에 수행한 자체 점검(grep/카운트)은 REQ *개수* 일관성만 확인했을 뿐, REQ *ID의
순차성*은 검사 항목에 없었다(위 자체 점검 표 참고).

### 정직성 확인

이 FAIL 결과는 조작되거나 하향 기재된 것이 아니다 — 관측된 그대로 기록한다
(verification-claim-integrity 원칙 준수). `plan_status`는 `audit-ready`로 변경하지 않는다 —
그렇게 하면 FAIL을 PASS로 오기재하는 것이 된다.

### 다음 단계 소유권

D1(블로킹) 수정 여부, D2-D5를 같은 diff에 함께 반영할지, 그리고 plan-auditor를 iteration 2로
재실행할지는 **orchestrator가 사용자와 함께 결정할 사안**이며, 이 progress.md 기록 세션이 여기서
결정하지 않는다.

**`/moai run`은 이 plan-auditor PASS 없이는 착수하지 않는다** — spec-workflow.md의 Plan Audit
Gate가 어차피 `/moai run` 진입 시 다시 이 감사를 요구하므로, 이 FAIL이 run-phase를 우회시키지는
않는다.

### plan-auditor 실행 결과 — iteration 2, PASS (D1-D5 수정 반영 후, v0.5.0 아티팩트 대상)

D1(critical, blocking) + D2-D5(minor, optional) 수정을 반영한 v0.5.0 아티팩트 5종
(`spec.md`/`research.md`/`design.md`/`plan.md`/`acceptance.md`)에 대해 `plan-auditor` subagent를
**iteration 2/3**로 재실행했다. orchestrator가 plan-auditor 자신의 리포트에서 직접 관측한 결과를
그대로(축소·과장 없이) 기록한다(verification-claim-integrity 원칙 준수).

- **Verdict**: **PASS** (iteration 2/3, plan-auditor Retry Loop Contract)
- **Overall score**: 0.90 (4축 조화평균) — Tier L PASS threshold(0.85) 상회
- **Must-pass 7항목 결과**: 전부 PASS 또는 N/A —
  - MP-1 REQ 번호 일관성 = **PASS**(iteration 1의 FAIL에서 정정) — auditor가 독립적으로 재확인:
    REQ-EVIDENCE 표 행이 정확히 001~025의 연속 시퀀스로 구성되어 있으며 공백·중복 없음, D1 재번호화가
    실제로 해결됐음을 확인.
  - MP-2 EARS/GEARS 형식 = PASS
  - MP-3 YAML frontmatter 유효성 = PASS(`version: "0.5.0"`)
  - MP-4 언어 중립성 = N/A(자동 PASS)
  - MP-5 D7 cross-SPEC 정합성 = PASS(`depends_on`에 명시된 두 SPEC 모두 `status: completed` 확인됨)
  - MP-6 D8 cross-platform discipline = N/A(자동 PASS)
  - MP-7 clarification gate = PASS(`[NEEDS CLARIFICATION]` 매치 0건)
- **4축 카테고리 점수**: Clarity 0.75, Completeness 1.0, Testability 0.95, Traceability 1.0.
- **회귀 확인(iteration 1 → 2)**: D1(REQ ID 갭) 해소 확인. D2(Out of Scope 불릿 형식) 해소 확인.
  D3(acceptance.md 병합 요약 누락) 해소 확인. D4(REQ 내 HOW-수준 의사코드) 해소 확인. D5(무조건부
  완화 표현) 해소 확인. iteration 1의 결함이 그대로 재발한 항목은 없음.
- **이번 iteration에서 새로 발견된 minor 결함(D6, D7)**: D6 — 3개 파일(design.md/plan.md/research.md)에
  "027"(v0.2.0 당시 이미 병합되어 현재 사용되지 않는 구 번호)을 아무 설명 없이 병기한
  `REQ-EVIDENCE-006/027` 표기가 남아 있었다 — 이 SPEC §G.3이 이미 기록한 "REQ 병기 표기 버그"와
  같은 취약성이 이번엔 다른 형태(슬래시 축약 표기 자체에 역사적 번호 구분 설명이 아예 없는 경우)로
  재발한 것이다. D7 — spec.md의 v0.1.0→v0.2.0 HISTORY 항목 안에서 자기모순이 있었다(한 문장은 구
  REQ-027이 "REQ-EVIDENCE-006"에 통합됐다고 하고, 같은 항목의 다른 문장은 "005"에 통합됐다고
  서술) — 원인은 동일하게 `"X을 Y에 통합"` 형태의 한국어 구문에서 `REQ-EVIDENCE-` 접두어가 없는
  bare 숫자를 재번호화 패턴 매칭이 놓친 것이다. D6/D7 모두 위 §1-§2 단계에서 즉시 수정했다 —
  두 결함 모두 must-pass 블로커가 아니었다(auditor의 verdict는 이 둘을 non-blocking documentation
  clarity 정리로 명시하며 PASS했다).
- 명시적으로 밝힌다: 이 PASS는 조작되지 않았다 — 위 모든 claim은 plan-auditor가 이번 iteration
  2에서 실제로 관측·출력한 결과 그대로이며, `plan_status`를 `audit-ready`로 변경하는 것은 이 PASS가
  실제로 관측됐기 때문이다(verification-claim-integrity §1.1 surface 1 — 관측하지 않은 검증-주장
  없음 원칙 준수).
- 명시적으로 밝힌다: `/moai run`은 이 세션에서 시작하지 않았다 — 이 세션의 범위는 plan-phase에서
  끝난다(사용자의 최초 지시 범위). 사용자의 최초 6개 요청 항목은 모두 다뤄졌다: (1) non-regression
  PASS 조건을 REQ/AC에 명시(재번호화 후 REQ-EVIDENCE-016/AC-EVIDENCE-014), (2) Precision ground
  truth completeness + 표준 Precision@5 정의, (3) isDuplicate()/sourceIdentifier 기본안 정합,
  (4) QueryIssueType SSOT(optional, 완료), (5) 6개 아티팩트 정합성 재검증(이번 세션 자체 재번호화가
  유발한 슬래시 표기 결함 발견·수정 포함), (6) plan-auditor를 실제로 2회 실행(iteration 1 FAIL,
  iteration 2 PASS)하고 그 전 과정을 정직하게 기록 — 어느 시점에도 조작된 PASS 없음.

### plan-auditor 실행 결과 — iteration 3, PASS (최종 iteration, plan-auditor Retry Loop Contract 상한)

v0.5.0 아티팩트 5종(`spec.md`/`research.md`/`design.md`/`plan.md`/`acceptance.md`)에 대해 `plan-auditor`
subagent를 **iteration 3/3**(plan-auditor Retry Loop Contract가 허용하는 최종 iteration)으로
재실행했다. orchestrator가 이 실행을 직접 관측했으며, plan-auditor 자신의 리포트에서 관측한 결과를
그대로(축소·과장 없이) 기록한다(verification-claim-integrity 원칙 준수).

- **Verdict**: **PASS** (iteration 3/3 — plan-auditor Retry Loop Contract가 허용하는 최종 iteration)
- **Overall score**: 0.923 (4축 조화평균) — Tier L PASS threshold(0.85) 상회
- **Must-pass 7항목 결과**: 전부 PASS 또는 N/A —
  - MP-1 REQ 번호 일관성 = **PASS**(독립적으로 재검증) — 001-025 연속 시퀀스를 다시 확인했을 뿐 아니라,
    5개 아티팩트 전체에서 존재하지 않는 REQ 번호를 가리키는 **살아있는(LIVE)** 참조가 어떤 표기
    형태로도(`REQ-EVIDENCE-` 접두어 있는/없는 bare `REQ-NNN` 포함) 0건임을 별도로 확인했다.
  - MP-2 EARS/GEARS 형식 = PASS
  - MP-3 YAML frontmatter 유효성 = PASS(`version: "0.5.0"`)
  - MP-4 언어 중립성 = N/A(자동 PASS)
  - MP-5 D7 cross-SPEC 정합성 = PASS — 이번 iteration에서 auditor가 design.md에서 `SPEC-RUNTIME-001`
    참조를 추가로 발견해 검증했으며, 해당 SPEC도 `status: completed`임을 확인했다.
  - MP-6 D8 cross-platform discipline = N/A(자동 PASS)
  - MP-7 clarification gate = PASS(`[NEEDS CLARIFICATION]` 매치 0건)
- **4축 카테고리 점수**: Clarity 0.75, Completeness 1.0, Testability 1.0, Traceability 1.0.
- **회귀 확인(iteration 1/2 → 3)**: D1-D7 전부 독립적인 fresh 재검증으로 RESOLVED 확인(신뢰가 아니라
  실제 재확인) — 이전 결함 중 재발한 항목은 없다.
- **이번 iteration에서 새로 발견된 결함(D8, 이 SPEC의 결함 번호 시퀀스를 이어감 — 앞서 D1-D7과
  충돌하지 않도록)**: REQ-EVIDENCE-016과 그로부터 파생된 AC-EVIDENCE-014 사이의 acceptance-scope
  모호성. REQ-EVIDENCE-016은 "기본 PASS 조건"을 4개 부분으로 구성된 복합 조건(3개 지표 부등식 +
  REQ-EVIDENCE-013 target-case-hit 조건)으로 정의하고, trade-off/예외 경로가 "이 조건 중 하나라도"
  (즉 4개 부분 전체를 아우르는 것으로 읽히는) 충족되지 않을 때 적용된다고 서술한다. 그런데
  `acceptance.md`의 AC-EVIDENCE-014는 이를 **두 개의 별도 Then 절**로 나눠 놓았다 — "기본 PASS 조건"
  Then 절(3개 지표만)에는 Path A/Path B 예외 + plan-auditor 재검토 메커니즘 전체가 딸려 있는 반면,
  별도의 "REQ-EVIDENCE-013 target case 복구" Then 절에는 예외 경로가 전혀 없다 — 무조건적으로 읽힌다.
  따라서 target-case-hit 실패가 구체적으로 (a) AC-EVIDENCE-014를 구제 불가능하게 무조건 FAIL시키는지
  (REQ-EVIDENCE-016이 명시한 "이 조건 중 하나라도"의 scope와 모순), 아니면 (b) sibling Then 절로부터
  명시되지 않은 어떤 상속을 통해 예외 경로 대상이 되는지 불분명하다. design.md §3.3b는 target-case
  조건이 협상 불가능하다는 쪽으로 기운다(설계 근거: 이것 없이는 "전략 B 채택 근거 자체가 무너진다") —
  이는 정당한 입장이지만, SPEC이 현재 작성된 형태로는 3개 아티팩트(spec.md REQ 문구 vs acceptance.md
  AC 구조 vs design.md 근거) 전체에 걸쳐 이를 명시적으로 해소하지 않는다. auditor는 결함 항목 자체를
  "Severity: major, Class: blocking"으로 분류했지만, **전체 VERDICT는 여전히 PASS**다(must-pass 기준
  중 실패한 항목이 없음 — 이것은 Clarity 축의 감점이지 must-pass 위반이 아니다) — auditor 자신의
  Recommendation 섹션은 이를 명시적으로 "PASS + 권장(비필수) run-phase 이전 정리"로 규정했으며, 4번째
  audit iteration을 요구하는 blocker로 규정하지 않았다(어차피 Retry Loop Contract의 max-3 상한이
  4회차를 허용하지 않는다).
- **D8 수정 완료 기록(같은 세션, 이 항목 기록 직후 사용자 결정에 따라 수정됨)**: 위 D8을 수정했다 —
  spec.md REQ-EVIDENCE-016에 target-case 조건이 trade-off 예외 경로 대상이 **아님**을 명시적으로
  추가했고, acceptance.md AC-EVIDENCE-014의 target-case Then 절에도 예외 경로(Path B) 적용 대상이
  아님을 명시적으로 추가했다(design.md §3.3b의 기존 근거와 일치). 이 수정은 orchestrator가
  grep으로 기계적으로 자체 검증했다(두 신규 절 존재 확인, REQ 개수 25 유지, AC 개수 25 유지) —
  4차 plan-auditor iteration을 거치지 않았다. 이는 (a) Retry Loop Contract가 plan-phase 사이클당
  max-3로 상한을 두고 있고 3차 iteration이 이미 자체 근거로 진짜 PASS를 달성했으며(D8은 auditor
  자신의 판정으로도 non-blocking·courtesy-level 결함이었다), (b) 이번 수정이 제약을 완화하지 않고
  명확화만 추가할 뿐(REQ/AC 개수 불변, 다른 내용 무변경) 회귀 위험이 매우 낮다는 판단에 근거한
  **판단(judgment call)**이며, "감사를 거친 것과 동등하다"는 주장이 아니다. `plan_status`는
  `audit-ready`를 그대로 유지한다 — D8은 애초에 must-pass 기준이 아니었으므로 이 수정이 3차 PASS
  판정을 재개방하거나 무효화하지 않는다. `/moai run`은 여전히 시작되지 않았다.
- **별도로 기록(5개 감사 대상 아티팩트의 결함은 아니지만, auditor가 지나가며 지적한 self-consistency
  gap)**: auditor는 이 progress.md **자신의** §G.6 서술(iteration 2의 D7 수정을 기록한 항목)이 구
  REQ-027 병합 대상을 "005/008"로 기재하고 있는데, spec.md/design.md/research.md의 **실제 현재
  텍스트**는 올바르게 "006/009"로 되어 있음을 발견했다 — 즉 §G.6 자신의 "무엇을 고쳤는지"에 대한
  서술이 지금은 stale/부정확한 상태이며, 감사 대상 아티팩트 안의 실제 수정 내용 자체는 올바르다.
  이 문제는 같은 편집 안에서 §G.6을 수정해 바로잡는다(아래 §G.6 참고).
- 명시적으로 밝힌다: 이 PASS는 실제로 관측된 것이며 조작되지 않았다(verification-claim-integrity
  §1.1 surface 1 준수). `plan_status`는 `audit-ready`로 **유지**한다 — iteration 2에서 이미 올바르게
  설정되어 있었으며, 이번 3차 PASS는 그 상태를 재확인/보강할 뿐 변경하지 않는다.
- 명시적으로 밝힌다: `/moai run`은 아직 시작되지 않았다. D8은 이 기록과 같은 턴에서 사용자에게
  결정 지점(지금 수정할지, 문서화된 debt로 남기고 진행할지)으로 제시되는 중이다 — 이 progress.md
  기록 세션은 그 결정을 선점하지 않으며, D8의 발견 사실과 그 판정(major/blocking severity이지만
  overall verdict는 PASS)만 정직하게 기록한다.
- **plan-auditor 리포트 영속화 gap도 함께 기록한다(auditor 자신의 리포트에서 지적)**: 이 SPEC에
  대해 `.moai/reports/plan-audit/SPEC-EVIDENCE-001-review-{1,2,3}.md` 경로에 plan-phase 리뷰
  스트림 파일이 디스크에 **하나도 존재하지 않는다** — auditor가 이를 프로세스 gap으로 플래그했다.
  이번 세션의 3회 iteration(§G.1의 iteration 1/2/3) 모두, 이전 orchestrator 호출에서 plan-auditor에게
  리뷰-스트림 파일을 영속화하도록 요청하지 않았기 때문에, `spec-workflow.md` § Report Persistence가
  요구하는 plan-phase 리뷰 스트림 영속화 의무가 이행되지 않은 것으로 보인다. 이를 은폐하지 않고
  known gap으로 정직하게 기록한다.

## §G.2 corpus 큐레이션(M4) 착수 조건 재확인 필요

plan.md M1이 명시한 대로, run-phase 착수 세션은 M4(기존 10건 재감사 + 신규 확장) 이전에
WebSearch/WebFetch 또는 등록된 `law.go.kr` OC 키 등 실제 웹 조사 도구 가용성을 재확인해야 한다.
이 plan-phase 세션은 그 도구가 없었고, 대신 `curl`로 제한적 검증(기존 seed 인용 재확인)만
수행했다(research.md §0, §4.1).

## §G.3 외부 독립 리뷰 반영 기록 (v0.1.0 → v0.2.0)

사용자가 전달한 외부 독립 리뷰에서 5개 설계 blocker(issueType eligibility, benchmark/corpus
순서, diagnostic fixture 과잉주장, metadata 최소화, 기존 corpus 재감사)와 1개 acceptance
정합성 문제(AC-018 중복 판정)를 지적받아, plan-auditor를 실행하지 않은 상태(§G.1)에서 6개
아티팩트 전체를 개정했다. 상세 변경 내역은 spec.md HISTORY(v0.2.0 항목)에 기록했으며, 여기서는
**자체 점검 과정에서 발견한 메타 결함 1건**을 별도로 남긴다:

- **REQ 병기 표기 버그**: acceptance.md의 AC 헤더에 `(REQ-EVIDENCE-002/026)`처럼 슬래시로 두
  REQ ID를 병기하면, 단순 문자열 grep(`grep "REQ-EVIDENCE-026"`)이 이 표기를 찾지 못한다 —
  `002/026` 문자열에는 `REQ-EVIDENCE-026`이라는 연속 부분문자열이 존재하지 않기 때문이다(앞에
  `002/`가 붙어 있음). 이 버그를 자체 traceability 재점검(위 표 4번째 행) 중 직접 발견해
  `(REQ-EVIDENCE-002, REQ-EVIDENCE-005)`처럼 쉼표로 완전히 분리 표기하도록 4곳(AC-002/008/014/016d)
  전부 수정했다. **교훈**: 향후 이 SPEC이나 다른 SPEC에서 AC 헤더에 복수 REQ를 병기할 때는 항상
  `REQ-A, REQ-B` 형태(부분문자열로 서로를 가리지 않는 형태)를 쓴다.
- **REQ/AC 개수 재조정**: 리뷰 반영으로 신규 REQ 6개(026/027/028/029/030/031)가 생겨 총 27개가
  됐으나 Tier L 상한(25)을 초과 — REQ-028을 REQ-008에, REQ-027을 REQ-005에 각각 통합해 25개로
  조정했다(spec.md HISTORY 참고). AC도 같은 원리로 REQ-029→AC-008, REQ-030→AC-014(v0.2.0 당시 번호 — 현재는 각각
  REQ-EVIDENCE-013→AC-008, REQ-EVIDENCE-017→AC-014)에 통합해 25개를 유지했다.

## §G.4 외부 독립 리뷰 최종 revision 반영 기록 (v0.2.0 → v0.3.0)

사용자가 전달한 외부 독립 리뷰 최종 revision에서 9개 항목(algorithm/corpus effect 재분리, zod
runtime validation, issueTypes 태깅 품질 검토, Precision@5 guardrail, research.md stale text,
source 우선순위, sourceIdentifier 재단순화, 6-아티팩트 일관성 재검증, plan-auditor 실행 시도)을
지적받아, plan-auditor를 실행하지 않은 상태(§G.1)에서 소규모로 개정했다 — **새 SPEC을 만들지
않고 scope를 확대하지 않는다**는 사용자 지시를 지켰다. 상세 변경 내역은 spec.md HISTORY(v0.3.0
항목)에 기록했다.

- **새 REQ/AC 미추가 확인**: 이번 라운드는 REQ-EVIDENCE-016, REQ-EVIDENCE-017, REQ-EVIDENCE-007의 wording만 수정했고
  AC-EVIDENCE-014/006의 본문만 확장했다 — 새 top-level REQ ID나 새 AC ID를 만들지 않았다(item
  2에서 사용자가 명시적으로 요구한 제약). REQ/AC 개수는 v0.2.0과 동일하게 25/25로 유지된다(위
  자체 점검 표에서 재확인).
- **algorithm effect vs corpus expansion effect 재분리**: v0.2.0 자체 점검(§G.3)에서는 발견하지
  못했던 잔존 개념 오류(같은 corpus 위 알고리즘 비교를 "corpus 확장 효과"로 잘못 명명)를 이번
  라운드에서 사용자가 직접 지적 — design.md §3.4를 A(algorithm effect)/B(corpus expansion
  effect) 두 절로 재구성하고, plan.md M4d/M4e로 milestone을 분리했다. **교훈**: "동일 조건에서
  하나의 변수만 바꾼 비교"와 "그 변수가 아닌 다른 조건의 변화 효과"를 이름으로 구분할 때는, 실제로
  무엇이 고정되고 무엇이 변했는지 재확인해야 한다 — 이름이 그럴듯해도 측정 대상과 불일치할 수
  있다.
- **plan-auditor 실행 gap 재확인**: 이번 라운드에서도 `Agent` 도구는 여전히 이 세션에 제공되지
  않았다 — v0.1.0/v0.2.0과 동일한 제약이 v0.3.0에도 유효하며, PASS를 기재하지 않고 §G.1에
  정직하게 gap으로 기록했다(item 9의 명시적 요구사항).

## §G.5 외부 독립 리뷰 잔여 정합성 반영 기록 (v0.3.0 → v0.4.0)

사용자가 전달한 외부 독립 리뷰 잔여 정합성 라운드에서 4개 항목(non-regression 계약의 threshold
악화 방지 gap, benchmark ground truth completeness 요건, `isDuplicate()`/§1.2 sourceIdentifier
기본안 불일치, `QueryIssueType` 8개 값 이중 하드코딩)을 지적받아, plan-auditor를 실행하지 않은
상태(§G.1)에서 소규모로 개정했다 — **새 REQ/AC ID를 만들지 않고 scope를 확대하지 않는다**는
사용자 지시를 지켰다. 상세 변경 내역은 spec.md HISTORY(v0.4.0 항목)에 기록했다.

- **새 REQ/AC 미추가 확인**: 이번 라운드는 REQ-EVIDENCE-007, REQ-EVIDENCE-015, REQ-EVIDENCE-016, REQ-EVIDENCE-017의 wording만 수정했고
  AC-EVIDENCE-006/013/014/018의 본문(Then 절)만 확장했다 — 새 top-level REQ ID나 새 AC ID를
  만들지 않았다. REQ/AC 개수는 v0.3.0과 동일하게 25/25로 유지된다(위 v0.4.0 자체 점검 표에서
  재확인).
- **non-regression 계약의 AC 수준 gap**: v0.3.0에서 design.md §3.3b가 non-regression 계약(new
  metric ≥ baseline metric)을 서술했음에도, acceptance.md AC-EVIDENCE-014는 지표가 "기록되어
  있는지"만 확인했고 그 값이 실제로 계약을 만족하는지는 확인하지 않았다 — new 성능이 baseline보다
  악화돼도 AC가 PASS할 수 있는 구멍이었다. REQ-EVIDENCE-016, REQ-EVIDENCE-017과 AC-EVIDENCE-014에 기본 PASS
  조건을 명시하고, trade-off 발생 시 사후 threshold 완화를 금지하며 design exception 기록 +
  plan-auditor 재검토를 요구하도록 개정했다.
- **plan-auditor 실행 gap 재확인**: 이번 라운드에서도 `Agent` 도구는 여전히 이 세션에 제공되지
  않았다 — v0.1.0/v0.2.0/v0.3.0과 동일한 제약이 v0.4.0에도 유효하며, PASS를 기재하지 않고 §G.1에
  정직하게 gap으로 기록했다. `plan_status`는 이번 편집 단계에서 변경하지 않으며(§E.1 참고),
  `draft-awaiting-audit`로 유지된다 — plan-auditor 실행은 별도 후속 위임에서 수행된다.

## §G.6 D1-D5 결함 수정 기록 (v0.4.0 → v0.5.0, iteration 2 재감사 대상)

§G.1의 plan-auditor iteration 1 FAIL 결과(D1 critical/blocking + D2-D5 minor/optional)를 반영해
5개 아티팩트(spec.md/plan.md/design.md/acceptance.md/research.md — 6개 전체 중 progress.md 제외)를
개정했다. **새 REQ/AC ID는 만들지 않았다** — 기존 wording 수정과 REQ-EVIDENCE ID 재번호화만
수행했다.

### D1(critical, blocking) — REQ-EVIDENCE ID 재번호화 매핑

25개 REQ-EVIDENCE ID를 문서 등장 순서 그대로 001~025 연속 번호로 재번호화했다(구 ID → 신 ID).
`AC-EVIDENCE-*` ID는 이번 재번호화 대상이 **아니다**(변경 없음 — 001~021, 026 그대로 유지, 016만
서브레터 016a/b/c/d 유지).

| 구 ID | 신 ID | 구 ID | 신 ID | 구 ID | 신 ID |
|-------|-------|-------|-------|-------|-------|
| 001 | 001 (불변) | 011 | 012 | 018 | 022 |
| 002 | 002 (불변) | 029 | 013 | 019 | 023 |
| 003 | 003 (불변) | 012 | 014 | 020 | 024 |
| 004 | 004 (불변) | 013 | 015 | 021 | 025 |
| 026 | 005 | 014 | 016 |  |  |
| 005 | 006 | 030 | 017 |  |  |
| 006 | 007 | 015 | 018 |  |  |
| 007 | 008 | 016 | 019 |  |  |
| 008 | 009 | 031 | 020 |  |  |
| 009 | 010 | 017 | 021 |  |  |
| 010 | 011 |  |  |  |  |

이 매핑은 6개 아티팩트 전체(HISTORY의 과거 REQ 번호 언급 포함)에 일괄 적용했다 — 이 프로젝트의
기존 관례가 이미 HISTORY 항목에서 "그 항목을 작성한 시점의 현재 번호"를 쓰는 방식이었으므로(예:
v0.2.0/v0.3.0/v0.4.0 HISTORY 항목이 모두 작성 당시 최신 번호를 인용), 이번 재번호화도 그 관례를
그대로 따랐다. 단, v0.2.0 HISTORY 항목이 언급하는 "REQ-EVIDENCE-027", "REQ-EVIDENCE-028"은
이번 매핑 대상이 **아니다** — 이 두 번호는 v0.2.0 개정 당시 이미 006/009로 병합되어 사라진
과거 한 시점의 역사적 라벨이며, plan-auditor가 iteration 1에서 판정한 "현재 25개 REQ 집합"
(001-021, 026, 029, 030, 031)에 포함되지 않았다 — 따라서 spec.md HISTORY의 "REQ-EVIDENCE-028을
009에, REQ-EVIDENCE-027을 006에 통합" 문구는 그 역사적 사실을 그대로 서술한 것으로 남겨두었다.

- **2차 결함 발견 — 재번호화 스크립트 자신이 §G.3의 "REQ 병기 표기 버그"에 다시 걸렸다**: 이 D1
  재번호화에 쓰인 sed 기반 2단계 스크립트는 `REQ-EVIDENCE-NNN` 리터럴 패턴만 매칭했다 — §G.3이 이미
  기록한 것과 동일한 함정으로, `REQ-EVIDENCE-016/030`처럼 슬래시로 두 번째 REQ 번호를 병기(併記)하면
  두 번째 번호 앞에 `REQ-EVIDENCE-` 접두어가 없어 패턴이 매칭되지 않고, 그 번호만 구 번호로 남는다.
  §G.3의 교훈("항상 `REQ-A, REQ-B` 형태로 쓴다")이 이미 기록돼 있었음에도, spec.md/design.md/
  plan.md/research.md/progress.md 여러 곳이 여전히 이 취약한 슬래시 병기 축약형을 쓰고 있었다.
  이번 라운드에서 이 SPEC의 6개 아티팩트 전체에서 발견된 모든 살아있는(구 번호가 아닌 현재 REQ
  집합을 가리키는) 슬래시 병기 인스턴스를 쉼표 형태(`REQ-EVIDENCE-A, REQ-EVIDENCE-B`)로 전부
  수정했다. **향후 지침**: 이 SPEC에서 복수 REQ를 병기할 때는 acceptance.md가 이미 일관되게 쓰고
  있는 쉼표 형태만 사용한다 — 슬래시 병기는 grep 기반 재번호화 도구에 원천적으로 취약하므로 이
  SPEC의 어떤 신규 작성에서도 다시 쓰지 않는다.

### D2-D5 적용 확인

- **D2(minor)**: spec.md §4의 5개 `### Out of Scope — <항목>` H3 서브섹션을 산문 단락에서 `-`
  불릿 라인 형식으로 변경 완료(내용 자체는 무변경).
- **D3(minor)**: acceptance.md §A/§D의 REQ→AC 병합 요약을 2건(REQ-013→AC-008, REQ-017→AC-014)
  에서 3건(REQ-013→AC-008, REQ-017→AC-014, REQ-020→AC-016d)으로 보강 완료 — AC-EVIDENCE-016d
  자신의 헤더가 이미 `(REQ-EVIDENCE-019, REQ-EVIDENCE-020, ...)`로 이 3번째 병합을 정확히
  인용하고 있었으므로, §A/§D의 자기서술 누락만 수정한 것이며 실제 기계적 링크는 처음부터 끊어져
  있지 않았다.
- **D4(minor)**: spec.md REQ-EVIDENCE-009(구 008)의 boolean-formula 의사코드를 WHAT/WHY 산문 +
  design.md §2.1 교차참조로 대체 완료 — 하드 filter 미도입, inclusion-OR/정렬 신호로만 사용한다는
  요구사항의 실질 내용은 변경하지 않았다.
- **D5(minor)**: spec.md REQ-EVIDENCE-021(구 017)의 "가능한 경우"라는 무조건부 완화 표현을
  `sourceUrl`이 실제로 확인 가능한 경우로 한정하는 조건절로 교체 완료(research.md §1.2의
  `sourceUrl` nullable 설계와 정합).

### plan_status 정직성 확인

이번 편집으로 `plan_status`는 §E.1에서 `draft-audit-failed`(iteration 1 FAIL 관측값)에서
`draft-awaiting-audit`로 변경했다 — 이는 **"D1-D5 수정을 적용했고 iteration 2 재감사를
기다린다"**는 의미이며, `audit-ready`나 PASS를 의미하지 않는다. iteration 2 plan-auditor
재실행은 이 progress.md 기록 세션이 아니라 **orchestrator의 별도 후속 위임**에서 수행하며, 그
결과가 실제로 관측된 뒤에만(FAIL이든 PASS든) 정직하게 기록한다(verification-claim-integrity
원칙 — 관측하지 않은 PASS를 미리 기재하지 않는다).

### 자체 점검 재실행 (D1 수정 후, 5/6 파일)

```
$ grep -ohE "REQ-EVIDENCE-[0-9]{3}" spec.md | sort -u | wc -l
25
$ grep -ohE "REQ-EVIDENCE-[0-9]{3}" spec.md | sort -u | head -1
REQ-EVIDENCE-001
$ grep -ohE "REQ-EVIDENCE-[0-9]{3}" spec.md | sort -u | tail -1
REQ-EVIDENCE-025
$ grep -ohE '\*\*AC-EVIDENCE-[0-9]+[a-z]?\*\*' acceptance.md | sort -u | wc -l
25
$ grep -rn "REQ-EVIDENCE-Z" *.md | wc -l
0
```

REQ 개수 25개(001~025 연속, gap 없음), AC 개수 25개(AC IDs 무변경), 재번호화 임시 토큰(`Z`
prefix) 잔존 0건을 재확인했다.

**추가**: plan-auditor iteration 2에서 새로 발견된 D6/D7(§G.1 "iteration 2, PASS" 항목 참고)도
같은 D1 수정 라운드에 이어 즉시 수정했다 — spec.md(REQ 개수 조정 문구의 재번호화 누락 2건),
design.md §1.2, plan.md M1, research.md §4(각 1건씩 `REQ-EVIDENCE-006/027`의 "027" 역사적 구
번호에 대한 설명 병기) 총 4개 파일.
