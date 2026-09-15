# SPEC-PILOT-OPS-001 구현 계획

## §A. 배경 및 결정이 뒤집히기 쉬운 순서로 정리

이 절은 "무엇을 결정했는가"를 검토 우선순위(뒤집힐 가능성이 큰 결정 먼저) 순으로
나열한다. 기계적/리팩터링 성격의 항목은 뒤로 미룬다.

### A.1 신규 운영 문서를 1개로 합칠 것인가, 2개로 나눌 것인가 (가장 뒤집히기 쉬운 결정)

사용자 요청은 스모크 체크리스트(항목 3)에 대해 "`.moai/docs/pilot-ops-smoke-checklist.md`
또는 plan.md에 포함 — 판단은 위임"이라고 명시했고, 3단계 분리(항목 4)에 대해서는
문서 위치를 명시하지 않았다. 이 SPEC은 **하나의 신규 문서**
`.moai/docs/pilot-ops-launch-plan.md`에 네 절(§1 계정 발급, §2 단일 계정
스모크 + 테넌트 격리 게이트, §3 3단계 분리 + 성공지표 집계, §4 Gemini 쿼터
운영 계획)을 함께 담기로 결정했다 — 근거: (a) 모두 "파일럿 운영을 실제로
개시하기 직전에 참고하는 문서"라는 같은 독자·같은 사용 시점을 공유한다; (b) 이미
`account-provisioning.md`(발급 절차)와 `pilot-incident-runbook.md`(운영 중 장애
대응)가 관심사별로 분리된 선례가 있으므로, "개시 절차"라는 세 번째 관심사를 별도
문서 1개로 두는 것이 기존 문서 분리 관례와 일관된다; (c) 절을 더 잘게 분리하면
파일 수가 늘어 Tier S 경계에 더 가까워지지만, 실질적 이점(교차 참조 감소) 없이
파일 수만 늘린다.

**뒤집기 쉬운 지점**: 사용자가 절을 별도 파일로 분리하고 싶다면, run-phase에서
순수 파일 분할(REQ 내용 자체는 변경되지 않음)로 처리할 수 있다 — Tier 재산정도
불필요(여전히 코드 없음, 파일이 몇 개로 늘어나도 Tier S "< 5" 안).

### A.2 배포 URL·SHA 마커 배치 결정 (plan-phase 1차 결정, 1차 개정 라운드에서 해소됨)

plan-phase 최초 작성 시점에 `moai-workflow-spec` 스킬의 `[NEEDS CLARIFICATION]`
배치 규칙("ONLY in plan.md and research.md")에 따라, spec.md에는 마커를 두지
않고 이 plan.md §C에 마커를 두기로 결정했다(선행 SPEC인 SPEC-PILOT-LAUNCH-001이
spec.md 본문에 직접 마커를 두었던 것과 달리, 이 SPEC은 현재 스킬 규칙을
따른다). **이 마커 자체는 같은 날 진행된 1차 개정 라운드에서 사용자가 정확한
URL·SHA 값을 제공함으로써 해소됐다** — 현재 §C는 그 해소 기록을 담고 있으며,
더 이상 미확인 상태를 서술하지 않는다. **뒤집기 쉬운 지점**: 이 배치 결정
자체(spec.md 대신 plan.md에 마커를 두는 관례)는 값이 해소된 것과 무관하게
독립적으로 유효하며, 향후 SPEC에서 유사한 미해결 항목이 생기면 같은 배치
규칙을 재사용할 수 있다.

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
   절차 요약(REQ-PILOT-OPS-003), §2 단일 계정 스모크 체크리스트 + 테넌트 격리
   게이트(REQ-PILOT-OPS-004/005), §3 3단계 분리 계획 + 성공지표 집계 계약
   (REQ-PILOT-OPS-006), §4 Gemini 쿼터 운영 계획(REQ-PILOT-OPS-007) 4개 절 구조.
4. 세 파일 모두 기존 관례(한국어 본문, 기존 문서의 상호 참조 각주 스타일 —
   `account-provisioning.md`/`pilot-incident-runbook.md` 서두의 "이 문서는 ...를
   다룬다. ...는 서로 다른 문서다" 패턴)를 그대로 따른다.

## §C. 확인 사항 해소 기록 (Resolved Clarification)

**해소됨 (2026-09-15, 1차 개정 라운드)**: SPEC-PILOT-LAUNCH-001 plan-phase 3차
개정에서 최초로 기록되고 그 SPEC 종결 시점까지도 미해결로 남아 있던
`[NEEDS CLARIFICATION: Netlify 프로덕션 배포 실제 URL·배포 SHA]` 항목은 사용자가
1차 개정 라운드에서 Netlify 대시보드를 직접 확인해 두 값을 모두 전달함으로써
해소됐다:

- **프로덕션 URL**: `https://musical-macaron-82feb3.netlify.app`(스킴 포함 —
  이하 이 문서와 spec.md 전체에서 이 전체 형태로만 인용한다, 바레 도메인 인용
  금지)
- **배포 SHA**: `381e38d6c88f77c4281ebb4007fb46475cce426b`(단축형 `381e38d`)

**이 SHA는 "1차 개정 시점 기준" main HEAD와 일치**함을 `git log -1 main`과
`git log -1 origin/main` 양쪽으로 재확인했다(둘 다 `381e38d`, 로컬-원격 0/0
발산 — 2차 개정 라운드 시점에도 여전히 main HEAD와 일치함을 재확인했다). 다만
이 값은 **영구 고정 pin이 아니다** — SPEC-PILOT-LAUNCH-001 자신의 HISTORY가
이미 보여주듯, main에 새 커밋이 push되면 프로덕션 배포 SHA도 그만큼 전진한다.
README.md/product.md에 이 값을 반영할 때도 "이 시점 기준" 확인임을 명시하고
영구 고정 표현("이것이 프로덕션 배포다")을 사용하지 않는다.

**"사용자 직접 확인"과 "독립 검증"은 여전히 다른 두 사실이다.** 사용자가
Netlify 대시보드에서 직접 확인한 사실(배포 URL·SHA가 실제로 이 값이라는 것)과,
이 세션이 GitHub commit-status API(`/commits/{sha}/status`)·Deployments API
(`/deployments`)로 독립 검증할 수 있는지는 별개다 — 이 세션도 여전히 그 API로는
독립 검증 수단이 없다(SPEC-PILOT-LAUNCH-001에서 이미 관찰된 것과 동일한 패턴,
두 API 모두 이 프로젝트의 Netlify 배포에 대해 신호를 게시하지 않는 것으로
보인다). 이 SPEC은 이제 URL·SHA **값 자체**는 사용자 직접 확인으로 확정하되,
"GitHub API로는 독립 검증이 불가능하다"는 한계 자체는 참고용 사실로 계속
기록한다 — REQ-PILOT-OPS-002는 이 두 사실(값 확정 vs 독립검증 한계)을 구분해
정확히 반영하도록 갱신됐다. 이 §C의 해소 기록은 spec.md HISTORY 최초 작성
항목에 남아 있던 "미해결 항목" 서술을 2차 개정 라운드에서 갱신할 때의
근거이기도 하다(spec.md HISTORY 2차 개정 항목 참고).

## §D. 제약 (Constraints)

- 이 SPEC의 run-phase는 `pnpm tester:add`를 실행하지 않는다.
- 이 SPEC의 run-phase는 Gemini API를 호출하지 않는다.
- 이 SPEC의 run-phase는 REQ-PILOT-OPS-004의 스모크 체크리스트나
  REQ-PILOT-OPS-005의 테넌트 격리 게이트를 실제로 수행하지 않는다.
- 이 SPEC의 run-phase는 REQ-PILOT-OPS-006의 3단계 중 어느 것도 실제로 착수하지
  않는다.
- `scripts/provision-tester.ts`, `lib/env.ts`, `lib/db/schema.ts` 등 코드 파일은
  일절 변경하지 않는다(스키마 테이블명은 REQ-PILOT-OPS-004의 정리 계약 서술을
  위해 읽기 전용으로 재확인만 했다).
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
| URL이 스킴 포함 형태로 반영됐는지(README/product.md) | `grep -c "https://musical-macaron-82feb3.netlify.app" README.md .moai/project/product.md` | 각 ≥ 1 |
| 신규 문서 존재 여부 | `ls .moai/docs/pilot-ops-launch-plan.md` | 파일 존재 |
| 신규 문서 4개 절 존재 여부 | 신규 문서 내 "계정 발급"·"스모크"·"테넌트 격리"·"3단계"·"쿼터" 헤딩 grep | 각 ≥ 1 |
| 코드 파일 무변경 확인 | `git diff --stat` 대상에 `.ts`/`.tsx` 파일 없음 | 매치 없음 |

## §F. 마일스톤 (Priority-Based, No Time Estimates)

- **M1 (Priority High)** — README.md 4개 지점 편집(REQ-PILOT-OPS-001/002)
- **M2 (Priority High)** — product.md 대응 지점 편집(REQ-PILOT-OPS-001/002)
- **M3 (Priority High)** — 신규 문서 §1 계정 발급 절차 요약(REQ-PILOT-OPS-003)
- **M4 (Priority High)** — 신규 문서 §2 단일 계정 스모크 체크리스트 +
  테넌트 격리 게이트(REQ-PILOT-OPS-004/005)
- **M5 (Priority High)** — 신규 문서 §3 3단계 분리 계획 + 성공지표 집계 계약
  (REQ-PILOT-OPS-006)
- **M6 (Priority High)** — 신규 문서 §4 Gemini 쿼터 운영 계획
  (REQ-PILOT-OPS-007)
- **M7 (Priority Medium)** — §E 자체 검증 표의 grep 확인 전체 실행 + 커밋

## §G. 안티패턴 경계 (Anti-Patterns to Avoid)

- 신규 문서에 `account-provisioning.md`/`pilot-incident-runbook.md`의 절차를
  그대로 복사해 붙여넣지 말 것 — 참조(링크·문서명)만 남긴다.
- README.md/product.md의 §Roadmap 순서 있는 후속 개발 목록을 이 기회에 재배열하지
  말 것 — Out of Scope로 이미 명시했다.
- 확정된 Netlify URL·SHA(`https://musical-macaron-82feb3.netlify.app`,
  `381e38d`) 외의 값을 추정해 채워 넣지 말 것 — 이 값이 다음 push로 전진할
  가능성 자체는 그대로 정확히 서술하되, 확정되지 않은 새 값을 임의로 단정하지
  않는다.
- 신규 문서의 계정 발급 절이 `account-provisioning.md`의 결론(비밀번호 재발급
  불가, `BETTER_AUTH_SECRET` 프로덕션 일치 불필요 등)과 모순되는 문구를 만들지
  말 것.
- REQ-PILOT-OPS-004의 단일 계정 스모크 체크리스트 안에 테넌트 격리 확인을
  다시 끼워 넣지 말 것 — 계정 1개로는 구조적으로 검증할 수 없다(REQ-PILOT-OPS-005
  로 분리된 이유).
- REQ-PILOT-OPS-007의 Gemini 쿼터 서술에서 "사건 수"와 "Premium 모델 호출 수"를
  다시 같은 것처럼 쓰지 말 것 — 하이브리드 라우팅 도입 이후 둘은 다르다.

## §H. 교차 참조 (Cross-References)

- `.moai/specs/SPEC-PILOT-OPS-001/spec.md` §2 — 요구사항 원문
- `.moai/docs/account-provisioning.md` — 계정 발급 절차 SSOT
- `.moai/docs/pilot-incident-runbook.md` — 장애 대응 절차 + triage 담당자 + §4 원격 DB 단독 진행 원칙
- `.moai/specs/SPEC-PILOT-LAUNCH-001/spec.md` HISTORY — 배포 URL·SHA 미해결 항목의 최초 출처(이 §C에서 해소됨)
- `.moai/reports/pilot-ready-quota-checklist-20260913.md` — Gemini 쿼터 실측 한도(20 RPD 절대 상한)·보수적 운영 목표(15회/일, 라인 58)의 출처
- `.moai/reports/hybrid-research-routing-20260913.md` — 하이브리드 라우팅 승격 규칙·`gemini_request_observations` 실사용량 확인 출처
- `lib/db/schema.ts` — REQ-PILOT-OPS-004 정리 계약이 인용하는 테이블명(`cases`/`reports`/`feedback`/`caseJobs`/`geminiRequestObservations`/`reservations`)의 SSOT(읽기 전용 재확인만 수행, 이 SPEC은 변경하지 않음)
