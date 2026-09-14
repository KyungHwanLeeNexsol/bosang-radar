# SPEC-PILOT-LAUNCH-001 구현 계획

## §A. Tier 판단

**Tier: M** (plan-phase 외부 검토 2차 반영 — 최초 Tier S 판단에서 상향)

영향 파일 수 산식(실제로 생성·수정될 파일을 전부 센 것):

| # | 파일 | 상태 | 비고 |
|---|------|------|------|
| 1 | `app/login/page.tsx` | 수정 | 캡션·헤딩·부제 3곳 |
| 2 | `app/login/login-form.tsx` | 수정 | 폼 하단 안내 1곳 |
| 3 | `app/cases/new/case-input-form.tsx` | 수정 | 폼 하단 안내 1곳 |
| 4 | `.moai/docs/account-provisioning.md` | 신규 | ~60-100줄 |
| 5 | `app/login/page.test.tsx` | 수정 | 이미 존재(81줄) — AC-PILOT-LAUNCH-007 어설션 추가 |
| 6 | `app/login/login-form.test.tsx` | 수정 | 이미 존재(201줄) — AC-PILOT-LAUNCH-007 어설션 추가 |
| 7 | `app/cases/new/case-input-form.test.tsx` | 수정 | 이미 존재(305줄) — AC-PILOT-LAUNCH-008 어설션 추가 |

**총 7개 파일**(소스 3 + 신규 문서 1 + 기존 테스트 파일 3). 최초 plan
초안은 테스트 파일을 어설션 추가 대상에서 제외하고 산정해 4개로
집계했으나, REQ-PILOT-LAUNCH-001/003의 렌더링 결과를 실제로 검증하려면
기존 테스트 파일에 "옛 문구 부재 + 신규 문구 존재" 어설션을 추가해야
한다(spec.md AC-PILOT-LAUNCH-007/008). 세 파일 모두 이미 존재함을
`wc -l`/`ls`로 확인했다(무매치였던 것은 "옛 문구를 assert하는 기존
테스트"이지, "테스트 파일 자체의 부재"가 아니다).

- 7개 파일은 Tier S의 "< 5 files" 가이드를 명확히 초과하고 Tier M의
  5-15 files 구간에 들어온다.
- 변경 LOC 자체는 여전히 작다(문자열 치환 다수 + 신규 문서 약 60-100줄 +
  테스트 어설션 다수) — 300줄을 밑돌 가능성이 높지만, Tier 판정은 파일
  수 초과만으로도 상향 사유가 된다(§ SPEC Complexity Tier).
- 스키마 변경, 신규 컴포넌트, 아키텍처 결정은 여전히 없다 — 순수 문구
  교체 + 테스트 어설션 추가 + 문서화 작업.
- REQ 6개(변경 없음) / AC 8개(007, 008 추가) — 둘 다 Tier M 상한(각 16개)
  이내.

→ 아티팩트 세트: spec.md + plan.md + acceptance.md(3 files, Tier M). AC는
spec.md §3 인라인에서 `acceptance.md`로 이동했다.

## §A.5. PRESERVE 목록 (건드리지 않는 파일/식별자)

- `lib/db/schema.ts`의 `allowedTesters` 테이블 정의 — 스키마 변경 없음.
- `scripts/provision-tester.ts` 전체 — 코드 무변경(문서화 대상일 뿐).
- `scripts/e2e-tester-emails.ts`, `e2e/*.spec.ts` — E2E 픽스처 무변경.
- `package.json`의 `tester:add` 스크립트 키 — 이름 무변경.
- `.env.local.example`의 `TESTER_PASSWORD` — 변수명 무변경.
- `app/cases/new/page.tsx`의 우측 Notice 문구(이미 SPEC-PILOT-READY-001에서
  정정 완료, `합성이거나 이미 비식별화된 사례만 입력해 주세요.`) — 무변경,
  REQ-PILOT-LAUNCH-003의 참조 대상일 뿐.
- 기존 SPEC 본문(SPEC-PILOT-READY-001 등)의 HISTORY — 무변경(SPEC 완료 후
  본문은 불변).
- README.md/product.md의 SPEC-PILOT-READY-001 관련 서술 — REQ-PILOT-LAUNCH-006은
  **확인만** 하며, 이미 일치하는 문구를 다시 쓰지 않는다.

**명시적 비-PRESERVE(수정 대상) 참고**: `app/login/page.test.tsx`,
`app/login/login-form.test.tsx`, `app/cases/new/case-input-form.test.tsx`는
이 SPEC에서 **수정된다** — PRESERVE 목록이 아니다(§A Tier 판단 참고,
AC-PILOT-LAUNCH-007/008). 세 파일에 추가되는 어설션 외의 기존 테스트
케이스·구조는 건드리지 않는다(Scope Discipline).

## §B. 기술 접근 (Technical Approach)

이 SPEC은 새 아키텍처 결정을 만들지 않는다. 세 갈래의 순수 문자열 교체 +
한 건의 신규 문서 작성이다.

### B.1 로그인 화면 문구 (변경 가능성 높음 — 사용자 승인 필요, 최우선 검토)

`app/login/page.tsx`의 3곳(캡션·헤딩·부제)과 `app/login/login-form.tsx`의
1곳(폼 하단 안내)을 spec.md REQ-PILOT-LAUNCH-001이 지정한 정확한 문자열로
교체한다. JSX 구조·컴포넌트 트리·testid는 무변경 — 텍스트 노드만 교체한다.
`app/login/page.test.tsx`(81줄)/`app/login/login-form.test.tsx`(201줄)는
이 문자열들을 직접 assert하는 기존 테스트가 없음을 plan-phase Grep으로
확인했다(무매치) — 하지만 이는 "테스트 파일이 존재하지 않는다"는 뜻이
아니라 "옛 문구를 검증하는 어설션이 아직 없다"는 뜻이다. 두 테스트
파일은 이미 존재하므로(§A Tier 판단), REQ-PILOT-LAUNCH-001의 4곳마다
"옛 문구 부재 + 신규 문구 존재"를 확인하는 신규 어설션을 각 파일에
**추가**한다(AC-PILOT-LAUNCH-007). 기존 어설션·구조는 건드리지 않는다.

### B.2 사건 입력 화면 비식별 안내 (변경 가능성 높음 — 사용자 승인 필요)

`app/cases/new/case-input-form.tsx:352`의 안내 문구에서 (a) "비식별 상태로
처리되며"라는 수동태 보장 표현과 (b) "리서치 목적 외에 사용되지 않습니다"라는
이용 목적 제한 보장 표현을 모두 제거하고, `app/cases/new/page.tsx:66`이 이미
채택한 능동 지시 표현("합성이거나 이미 비식별화된 사례만 입력해 주세요.")과
외부 모델 제공자 전송 고지("입력한 정보는 AI 분석을 위해 외부 AI 모델
제공자(Google Gemini)에 전송됩니다.")로 교체한다. "평균 소요 시간 3~5분" 안내는 이 정정과
무관하므로 그대로 유지한다. 외부 검토 2차에서 (b)에 대한 판단이 뒤집혔다 —
Gemini 무료 티어 호출은 외부 제공자(Google) 자체 데이터 취급 정책을
따르므로, "리서치 목적 외에 사용되지 않습니다"는 운영자가 실제로 집행을
보장할 수 없는 이용 목적 제한 주장이며 REQ-PILOT-READY-011의 과대 주장
금지 대상이다(최초 plan 초안은 이 문구를 무해한 유지 대상으로 판단했으나
철회한다). `app/cases/new/case-input-form.test.tsx`(305줄)는 이 특정
문자열을 assert하지 않음을 plan-phase Grep으로 확인했다(무매치) — B.1과
동일한 이유로 이는 신규 어설션 추가 대상임을 의미하며, 파일 자체가
부재하다는 뜻이 아니다. "옛 문구 부재 + 신규 문구 존재"를 확인하는 신규
어설션을 추가한다(AC-PILOT-LAUNCH-008).

### B.3 계정 프로비저닝 문서화 (변경 가능성 낮음 — 순수 신규 문서)

신규 `.moai/docs/account-provisioning.md`를 작성한다. 기존
`.moai/docs/pilot-incident-runbook.md`(운영 중 장애 대응, "이 문서는 파일럿
**운영 중** 장애 대응 절차다"로 스스로 범위를 한정)와는 관심사가 다르므로
별개 문서로 결정했다 — 그 문서 자신이 이미 `runtime-runbook.md`(로컬 개발
환경 설정)와의 분리 관례를 명시하고 있어(§1 헤더), 세 번째 관심사(계정
**사전** 발급)도 같은 원칙으로 분리하는 것이 이 프로젝트의 기존 문서
구조와 일관적이다.

외부 검토 2차에서 REQ-PILOT-LAUNCH-005의 서술이 정정됐다 — 최초 초안은
"이 스크립트가 로컬 `file:` DB가 아니라 프로덕션 원격 DB를 직접
대상으로 함"이라고 서술했으나, `scripts/provision-tester.ts:24-27`
`buildDb()`를 재확인한 결과 스크립트에는 프로덕션을 자동으로 판별하는
로직이 전혀 없다 — 대상 DB는 오직 실행 시점 `TURSO_DATABASE_URL`
해석 값에 의해서만 결정된다. 문서는 이제 다음 6가지를 반드시 포함해야
한다(spec.md REQ-PILOT-LAUNCH-005 (a)-(f), acceptance.md
AC-PILOT-LAUNCH-004):

1. 대상 DB가 자동 선택되지 않고 실행 시점 환경에만 의존한다는 사실
2. 발급 전 원격 DB 호스트 확인 + `file:`/예상 밖 호스트 시 중단 기준(토큰 값 미출력)
3. `BETTER_AUTH_SECRET`은 `validateEnv("provision")`이 요구하는 실행 입력값일
   뿐 Netlify Production 값과 일치할 필요가 없다는 명시(Better Auth 1.7.1
   scrypt 해시 + 발급 인스턴스 `autoSignIn: false` 근거 — 발급 시 세션이
   생성되지 않으므로 시크릿 값이 세션 생성에 관여하지 않는다). 프로덕션
   secret을 로컬로 복사하도록 안내하지 않으며, 프로덕션 값과는 별개인
   충분히 강한 실행용 값(예: `openssl rand -base64 32`)을 쓰도록 안내한다.
4. 재실행 시 비밀번호 미변경 제약(`scripts/provision-tester.ts:139-147`
   existing-user 조기 반환에서 확인됨 — 라인 번호 무변경)
5. 비밀값 미기록 경고
6. 발급 후 실제 프로덕션 로그인 성공으로 검증하는 기준(스크립트 exit 0만으로
   판단하지 않음)

`scripts/provision-tester.ts` 코드는 건드리지 않는다 — 문서화 대상일
뿐이다.

### B.4 문서 동기화 확인 (변경 가능성 최저 — 순수 검증)

run-phase 착수 시점에 README.md·product.md에 대해 plan-phase와 동일한 Grep을
재실행해 SPEC-PILOT-READY-001 관련 서술이 여전히 일치하는지 확인하고
progress.md에 결과를 기록한다. 불일치가 없으면 이 REQ는 "확인 완료, 변경
없음"으로 종결된다. plan-phase 외부 검토 2차 반영 시점에 재확인용
Grep(`grep -n "SPEC-PILOT-READY-001" README.md .moai/project/product.md`)을
다시 실행했으며, README.md:19,23,138,149와 product.md:3,104,108,123가 여전히
일치함을 재확인했다(불일치 없음; 2026-09-14 iteration 3 감사 D-NEW-2 반영 —
이 줄이 README.md 23번 줄을 누락했던 것을 오케스트레이터가 SPEC 폴더
전체 재검색 후 직접 정정) — run-phase 착수 시점에 동일한 Grep을
한 번 더 실행하는 것이 여전히 필요하다(회귀 방지 목적).

## §C. 마일스톤 (우선순위 기반, 시간 추정 없음)

| Milestone | 우선순위 | 내용 | 관련 REQ/AC |
|-----------|----------|------|-------------|
| M1 | High | 로그인 화면 4곳 문구 교체(`page.tsx` 3곳 + `login-form.tsx` 1곳) + `page.test.tsx`/`login-form.test.tsx`에 옛 문구 부재·신규 문구 존재 어설션 추가 | REQ-PILOT-LAUNCH-001, 002 / AC-PILOT-LAUNCH-001, 002, 007 |
| M2 | High | 사건 입력 화면 폼 하단 안내 1곳 교체 + `case-input-form.test.tsx`에 옛 문구 부재·신규 문구 존재 어설션 추가 | REQ-PILOT-LAUNCH-003, 004 / AC-PILOT-LAUNCH-003, 008 |
| M3 | Medium | `.moai/docs/account-provisioning.md` 신규 작성(정정된 6개 필수 내용 반영) | REQ-PILOT-LAUNCH-005 / AC-PILOT-LAUNCH-004 |
| M4 | Low | README.md/product.md 재확인(Grep) 및 progress.md 기록 | REQ-PILOT-LAUNCH-006 / AC-PILOT-LAUNCH-005 |
| M5 | Low | 품질 게이트(tsc/eslint/prettier/vitest/build) 전체 재실행 + 커밋/푸시 | 전체 / AC-PILOT-LAUNCH-006 |

M1과 M2를 먼저 배치한 이유는 사용자에게 직접 노출되는 문구 변경이라 승인
후 재검토 가능성이 가장 높은 결정이기 때문이다(plan.md §B 순서 원칙 —
데이터 모델/UX 흐름 변경을 먼저, 기계적 검증 단계를 마지막에). M3(문서
작성)와 M4(순수 확인)는 되돌리기 쉬운 낮은 위험 작업이라 뒤로 배치했다.

## §D. 리스크 (Risks)

| # | 리스크 | 완화 |
|---|--------|------|
| 1 | 로그인/사건입력 화면 텍스트 교체가 기존 스냅샷 테스트를 깨뜨릴 수 있음 | manager-develop이 M1/M2 각각 완료 후 관련 테스트 파일(`login-form.test.tsx`, `page.test.tsx`)을 즉시 재실행해 확인 |
| 2 | `.moai/docs/account-provisioning.md` 작성 중 실수로 실제 환경변수 값이나 비밀값을 예시로 기록할 위험 | 문서 작성 시 예시 값은 항상 플레이스홀더(`<email>`, `<password>`)만 사용하고, 커밋 전 `git diff`로 실제 비밀값 패턴이 없는지 육안 확인 |
| 3 | 로그인 화면 문구를 정상 서비스 톤으로 바꾸는 과정에서 사용자가 의도하지 않은 어조 변화가 생길 수 있음 | Implementation Kickoff Approval 단계에서 정확한 교체 문구 4곳을 사용자에게 다시 한번 제시하고 확인받는다(§B.1 문구는 이미 spec.md REQ-PILOT-LAUNCH-001에 확정 기재됨) |
| 4 | Out of Scope 스케치(비밀번호 재설정 등)가 run-phase에서 스코프 크리프로 이어질 위험 | manager-develop 위임 프롬프트의 Constraints(Section D)에 Out of Scope 절 전체를 명시적으로 포함해 구현 금지를 재확인 |
| 5 | REQ-PILOT-LAUNCH-005 (b)의 발급 전 원격 DB 호스트 확인 절차는 실제 운영 환경(Netlify 대시보드) 접근이 필요해 이 SPEC의 plan/run-phase 어느 쪽도 검증을 자동화할 수 없음 — (c)의 `BETTER_AUTH_SECRET`은 post-run 문서 정정 이후 Netlify Production과의 일치를 요구하지 않으므로 이 위험에서 제외됨 | account-provisioning.md에는 절차의 **기준**만 정확히 기술하고, 실제 적용 결과 검증은 이 SPEC의 완료 조건에서 명시적으로 제외한다(acceptance.md §D.5/§D.7) |
| 6 | `app/login/page.test.tsx`/`login-form.test.tsx`/`case-input-form.test.tsx`가 이미 큰 파일(81/201/305줄)이라 어설션 추가 시 기존 테스트를 실수로 깨뜨릴 위험 | manager-develop이 어설션 추가 직후 해당 파일만 단독 실행(`vitest run <파일>`)해 기존 테스트가 모두 여전히 통과함을 즉시 확인 |

## §E. 도메인 전문가 컨설테이션 권고 (Step 6)

이 SPEC은 프론트엔드(React/Next.js 컴포넌트 텍스트 노드) 키워드에 해당하지만,
변경 범위가 순수 텍스트 문자열 교체 + 기존 테스트 파일 어설션 추가
(컴포넌트 구조·상태·로직 무변경)로 좁으므로 별도 frontend 전문가
컨설테이션은 여전히 **불필요**로 판단한다. Tier가 M으로 상향됐지만 이는
파일 수(테스트 파일 포함) 때문이지 작업의 질적 복잡도가 높아졌기 때문이
아니다 — manager-develop이 Tier M Section A-E 위임 템플릿(적용 가능,
`.claude/rules/moai/development/manager-develop-prompt-template.md` §
Applicability)으로 직접 처리 가능하다. run-phase 진행 중 예상외의 구조적
변경이 필요함이 드러나면 그 시점에 blocker report로 재평가한다.

## §F. Self-Verification Checklist (plan-phase)

- [x] SPEC ID 정규식 self-check: PASS (`SPEC-PILOT-LAUNCH-001`)
- [x] Frontmatter 12개 필수 필드 스키마 검증 완료
- [x] 기존 SPEC과 ID 충돌 없음 확인(`.moai/specs/` 목록에 `SPEC-PILOT-LAUNCH-001` 부재 확인)
- [x] GEARS 표기법(Unwanted/Ubiquitous)으로 요구사항 작성
- [x] Out of Scope 절 — 5개 `### Out of Scope — <topic>` H3 서브헤딩, 각각 `-` 불릿 포함
- [x] Tier M 아티팩트 세트(spec.md + plan.md + acceptance.md, 3 files) 준수 — AC는 spec.md §3 인라인에서 acceptance.md로 이동
- [x] spec.md 본문에 구현 세부사항(함수명, API 스키마) 없음 — WHAT/WHY만 기술
- [x] REQ 6개 / AC 8개 — Tier M 상한(각 16개) 이내
- [x] 영향 파일 수 재산정(테스트 파일 3개 포함) — 총 7개, Tier M(5-15 files) 구간
