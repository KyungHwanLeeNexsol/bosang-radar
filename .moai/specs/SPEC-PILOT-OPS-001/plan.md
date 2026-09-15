# SPEC-PILOT-OPS-001 구현 계획

## §A. 배경 및 결정이 뒤집히기 쉬운 순서로 정리

이 절은 "무엇을 결정했는가"를 검토 우선순위(뒤집힐 가능성이 큰 결정 먼저) 순으로
나열한다. 기계적/리팩터링 성격의 항목은 뒤로 미룬다.

### A.1 신규 운영 문서를 1개로 합칠 것인가, 2개로 나눌 것인가 (가장 뒤집히기 쉬운 결정)

사용자 요청은 스모크 체크리스트(항목 3)에 대해 "`.moai/docs/pilot-ops-smoke-checklist.md`
또는 plan.md에 포함 — 판단은 위임"이라고 명시했고, 3단계 분리(항목 4)에 대해서는
문서 위치를 명시하지 않았다. 이 SPEC은 **하나의 신규 문서**
`.moai/docs/pilot-ops-launch-plan.md`에 두 절(§1 스모크 체크리스트, §2 3단계 분리
계획)을 함께 담기로 결정했다 — 근거: (a) 두 절 모두 "파일럿 운영을 실제로
개시하기 직전에 참고하는 문서"라는 같은 독자·같은 사용 시점을 공유한다; (b) 이미
`account-provisioning.md`(발급 절차)와 `pilot-incident-runbook.md`(운영 중 장애
대응)가 관심사별로 분리된 선례가 있으므로, "개시 절차"라는 세 번째 관심사를 별도
문서 1개로 두는 것이 기존 문서 분리 관례와 일관된다; (c) 두 절을 분리하면 파일이
4개(README, product.md, 체크리스트, 롤아웃 계획)로 늘어나 Tier S 경계에 더
가까워지지만, 실질적 이점(교차 참조 감소) 없이 파일 수만 늘린다.

**뒤집기 쉬운 지점**: 사용자가 두 절을 별도 파일로 분리하고 싶다면, run-phase에서
`.moai/docs/pilot-ops-smoke-checklist.md`와 `.moai/docs/pilot-ops-rollout-plan.md`로
쪼개는 것은 순수 파일 분할이며 REQ 내용 자체는 변경되지 않는다 — Tier 재산정도
불필요(여전히 코드 없음, 파일 4개는 Tier S "< 5" 안).

### A.2 배포 URL·SHA 미확인 상태를 spec.md가 아니라 plan.md에 마커로 두는 결정

`moai-workflow-spec` 스킬의 `[NEEDS CLARIFICATION]` 배치 규칙은 "ONLY in plan.md
and research.md (NEVER in spec.md or acceptance.md)"이다. 선행 SPEC인
SPEC-PILOT-LAUNCH-001은 이 마커를 spec.md 본문에 직접 두었다(그 SPEC 작성 시점의
관행) — 이 SPEC은 그 선례를 따르지 않고 현재 스킬 규칙을 따른다. spec.md
§ 미해결 확인 사항은 사실관계만 서술하고, 마커 자체(아래 §C)는 이 plan.md에
둔다. **뒤집기 쉬운 지점**: 만약 프로젝트가 spec.md 배치를 계속 선호한다면
run-phase 착수 전에 마커 위치만 옮기면 되며, REQ/AC 내용에는 영향이 없다.

### A.3 README.md/product.md "다음 단계"·"후속 개발" 목록 재배열 여부

REQ-PILOT-OPS-001/002가 요구하는 편집은 기존 목록의 **표현 정정**(11→12,
URL·SHA 서술 명확화)에 한정되며, 목록 순서 자체나 우선순위 재배열은 요구하지
않는다 — product.md §Roadmap의 "①코퍼스 품질 평가 → ②집계 대시보드 → ③Gold
Dataset" 순서 있는 후속 개발 목록은 이 SPEC에서 손대지 않는다(Out of Scope로
명시).

### A.4 (기계적) 문서 편집 순서

README.md 편집 → product.md 편집 → 신규 문서 작성 순으로 진행한다(README.md와
product.md가 서로 참조하지 않으므로 순서 자체는 임의적이나, README.md를 먼저
정확히 정리해두면 product.md 편집 시 문구를 그대로 재사용할 수 있어 왕복이
줄어든다).

## §B. 기술 접근 (Technical Approach)

이 SPEC은 코드를 작성하지 않는다. 접근은 순수 문서 편집이다:

1. README.md의 4개 지점(§2.A REQ-PILOT-OPS-001 근거 열의 줄 번호)을 Edit 도구로
   정정한다 — Read로 정확한 현재 줄을 재확인한 뒤 Edit(old_string/new_string)으로
   최소 diff만 적용한다.
2. `.moai/project/product.md`의 대응 지점을 동일한 방식으로 정정한다.
3. `.moai/docs/pilot-ops-launch-plan.md`를 신규 Write로 작성한다 — §1 계정 발급
   절차 요약(REQ-PILOT-OPS-003), §2 스모크 체크리스트(REQ-PILOT-OPS-004), §3
   3단계 분리 계획(REQ-PILOT-OPS-005/006) 3개 절 구조.
4. 세 파일 모두 기존 관례(한국어 본문, 기존 문서의 상호 참조 각주 스타일 —
   `account-provisioning.md`/`pilot-incident-runbook.md` 서두의 "이 문서는 ...를
   다룬다. ...는 서로 다른 문서다" 패턴)를 그대로 따른다.

## §C. 확인 사항 해소 기록 (Resolved Clarification)

**해소됨 (2026-09-15, 이번 개정 라운드)**: SPEC-PILOT-LAUNCH-001 plan-phase 3차
개정에서 최초로 기록되고 그 SPEC 종결 시점까지도 미해결로 남아 있던
`[NEEDS CLARIFICATION: Netlify 프로덕션 배포 실제 URL·배포 SHA]` 항목은 사용자가
이번 개정 라운드에서 Netlify 대시보드를 직접 확인해 두 값을 모두 전달함으로써
해소됐다:

- **프로덕션 URL**: `musical-macaron-82feb3.netlify.app`
- **배포 SHA**: `381e38d6c88f77c4281ebb4007fb46475cce426b`(단축형 `381e38d`)

**이 SHA는 "이 개정 시점 기준" main HEAD와 일치**함을 `git log -1 main`과
`git log -1 origin/main` 양쪽으로 재확인했다(둘 다 `381e38d`, 로컬-원격 0/0
발산). 다만 이 값은 **영구 고정 pin이 아니다** — SPEC-PILOT-LAUNCH-001 자신의
HISTORY가 이미 보여주듯, main에 새 커밋이 push되면 프로덕션 배포 SHA도 그만큼
전진한다. README.md/product.md에 이 값을 반영할 때도 "이 시점 기준" 확인임을
명시하고 영구 고정 표현("이것이 프로덕션 배포다")을 사용하지 않는다.

**"사용자 직접 확인"과 "독립 검증"은 여전히 다른 두 사실이다.** 사용자가
Netlify 대시보드에서 직접 확인한 사실(배포 URL·SHA가 실제로 이 값이라는 것)과,
이 세션이 GitHub commit-status API(`/commits/{sha}/status`)·Deployments API
(`/deployments`)로 독립 검증할 수 있는지는 별개다 — 이 세션도 여전히 그 API로는
독립 검증 수단이 없다(SPEC-PILOT-LAUNCH-001에서 이미 관찰된 것과 동일한 패턴,
두 API 모두 이 프로젝트의 Netlify 배포에 대해 신호를 게시하지 않는 것으로
보인다). 이 SPEC은 이제 URL·SHA **값 자체**는 사용자 직접 확인으로 확정하되,
"GitHub API로는 독립 검증이 불가능하다"는 한계 자체는 참고용 사실로 계속
기록한다 — REQ-PILOT-OPS-002는 이 두 사실(값 확정 vs 독립검증 한계)을 구분해
정확히 반영하도록 갱신됐다.

## §D. 제약 (Constraints)

- 이 SPEC의 run-phase는 `pnpm tester:add`를 실행하지 않는다.
- 이 SPEC의 run-phase는 Gemini API를 호출하지 않는다.
- 이 SPEC의 run-phase는 REQ-PILOT-OPS-004의 스모크 체크리스트를 실제로 수행하지
  않는다.
- 이 SPEC의 run-phase는 REQ-PILOT-OPS-005의 3단계 중 어느 것도 실제로 착수하지
  않는다.
- `scripts/provision-tester.ts`, `lib/env.ts` 등 코드 파일은 일절 변경하지
  않는다.
- README.md/product.md 편집은 §2.A가 명시한 지점에 한정하며, 그 외 절(예:
  §Roadmap의 순서 있는 후속 개발 목록, 기술 스택 절 등)은 건드리지 않는다
  (Scope Discipline).
- 신규 문서는 `.moai/docs/account-provisioning.md`와
  `.moai/docs/pilot-incident-runbook.md`의 내용을 복제하지 않고 참조만 한다 —
  세 문서 간 내용 중복은 향후 문서 유지보수 부담을 늘린다.

## §E. 자체 검증 (Self-Verification)

Tier S이므로 이 절은 최소 형태로 유지한다. run-phase 완료 시 다음을 확인한다:

| 항목 | 확인 방법 | 기대 결과 |
|------|-----------|-----------|
| README.md "11개 SPEC" 잔존 여부 | `grep -c "11개 SPEC" README.md` | 0 |
| product.md "11개 SPEC" 잔존 여부 | `grep -c "11개 SPEC" .moai/project/product.md` | 0 |
| SPEC-PILOT-LAUNCH-001 언급 여부(README) | `grep -c "SPEC-PILOT-LAUNCH-001" README.md` | ≥ 1 |
| SPEC-PILOT-LAUNCH-001 언급 여부(product.md) | `grep -c "SPEC-PILOT-LAUNCH-001" .moai/project/product.md` | ≥ 1 |
| 신규 문서 존재 여부 | `ls .moai/docs/pilot-ops-launch-plan.md` | 파일 존재 |
| 신규 문서 3개 절 존재 여부 | 신규 문서 내 "계정 발급"·"스모크"·"3단계" 헤딩 grep | 각 ≥ 1 |
| 코드 파일 무변경 확인 | `git diff --stat` 대상에 `.ts`/`.tsx` 파일 없음 | 매치 없음 |

## §F. 마일스톤 (Priority-Based, No Time Estimates)

- **M1 (Priority High)** — README.md 4개 지점 편집(REQ-PILOT-OPS-001/002)
- **M2 (Priority High)** — product.md 대응 지점 편집(REQ-PILOT-OPS-001/002)
- **M3 (Priority High)** — 신규 문서 `.moai/docs/pilot-ops-launch-plan.md` 작성:
  §1 계정 발급 절차 요약(REQ-PILOT-OPS-003)
- **M4 (Priority High)** — 신규 문서 §2 스모크 체크리스트(REQ-PILOT-OPS-004)
- **M5 (Priority High)** — 신규 문서 §3 3단계 분리 계획(REQ-PILOT-OPS-005/006)
- **M6 (Priority Medium)** — §E 자체 검증 표의 grep 확인 전체 실행 + 커밋

## §G. 안티패턴 경계 (Anti-Patterns to Avoid)

- 신규 문서에 `account-provisioning.md`/`pilot-incident-runbook.md`의 절차를
  그대로 복사해 붙여넣지 말 것 — 참조(링크·문서명)만 남긴다.
- README.md/product.md의 §Roadmap 순서 있는 후속 개발 목록을 이 기회에 재배열하지
  말 것 — Out of Scope로 이미 명시했다.
- 정확한 Netlify URL·SHA를 "아마 이것일 것"이라고 추정해 채워 넣지 말 것 — 미확인
  상태를 그대로 정확히 서술한다.
- 신규 문서의 계정 발급 절이 `account-provisioning.md`의 결론(비밀번호 재발급
  불가, `BETTER_AUTH_SECRET` 프로덕션 일치 불필요 등)과 모순되는 문구를 만들지
  말 것.

## §H. 교차 참조 (Cross-References)

- `.moai/specs/SPEC-PILOT-OPS-001/spec.md` §2 — 요구사항 원문
- `.moai/docs/account-provisioning.md` — 계정 발급 절차 SSOT
- `.moai/docs/pilot-incident-runbook.md` — 장애 대응 절차 + triage 담당자
- `.moai/specs/SPEC-PILOT-LAUNCH-001/spec.md` HISTORY — 배포 URL·SHA 미해결 항목의 최초 출처
