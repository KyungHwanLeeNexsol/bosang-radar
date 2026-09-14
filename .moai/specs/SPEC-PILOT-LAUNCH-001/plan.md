# SPEC-PILOT-LAUNCH-001 구현 계획

## §A. Tier 판단

**Tier: S**

- 영향 파일 4개: `app/login/page.tsx`, `app/login/login-form.tsx`,
  `app/cases/new/case-input-form.tsx`, 신규 `.moai/docs/account-provisioning.md`
  — 모두 < 5 files 기준 이내.
- 변경 LOC은 기존 문자열 3~4곳 교체(각 1줄) + 신규 문서 약 60~100줄로,
  < 300 LOC 기준을 크게 밑돈다.
- 스키마 변경, 신규 컴포넌트, 아키텍처 결정이 없다 — 순수 문구 교체 +
  문서화 작업.
- REQ 6개 / AC 6개로 Tier S 상한(각 8개) 이내.

→ 아티팩트 세트: spec.md + plan.md (AC는 spec.md §3에 인라인). acceptance.md는
생성하지 않는다.

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

## §B. 기술 접근 (Technical Approach)

이 SPEC은 새 아키텍처 결정을 만들지 않는다. 세 갈래의 순수 문자열 교체 +
한 건의 신규 문서 작성이다.

### B.1 로그인 화면 문구 (변경 가능성 높음 — 사용자 승인 필요, 최우선 검토)

`app/login/page.tsx`의 3곳(캡션·헤딩·부제)과 `app/login/login-form.tsx`의
1곳(폼 하단 안내)을 spec.md REQ-PILOT-LAUNCH-001이 지정한 정확한 문자열로
교체한다. JSX 구조·컴포넌트 트리·testid는 무변경 — 텍스트 노드만 교체한다.
`login-form.test.tsx`는 이 문자열들을 직접 assert하지 않음을 plan-phase
Grep으로 이미 확인했으므로(무매치), 테스트 파일 수정은 필요하지 않다 — 다만
run-phase에서 스냅샷/텍스트 매칭 테스트가 있는지 최종 확인은 manager-develop의
사전 점검(Section C) 몫이다.

### B.2 사건 입력 화면 비식별 안내 (변경 가능성 높음 — 사용자 승인 필요)

`app/cases/new/case-input-form.tsx:352`의 안내 문구에서 "비식별 상태로
처리되며"라는 수동태 보장 표현을 제거하고, `app/cases/new/page.tsx:66`이 이미
채택한 능동 지시 표현("합성이거나 이미 비식별화된 사례만 입력해 주세요.")과
통일한다. "리서치 목적 외에 사용되지 않습니다"라는 목적 제한 문구는 보장
주장이 아니므로 유지한다. `page.test.tsx`는 이 특정 문자열을 assert하지
않음을 plan-phase Grep으로 이미 확인했다(무매치).

### B.3 계정 프로비저닝 문서화 (변경 가능성 낮음 — 순수 신규 문서)

신규 `.moai/docs/account-provisioning.md`를 작성한다. 기존
`.moai/docs/pilot-incident-runbook.md`(운영 중 장애 대응, "이 문서는 파일럿
**운영 중** 장애 대응 절차다"로 스스로 범위를 한정)와는 관심사가 다르므로
별개 문서로 결정했다 — 그 문서 자신이 이미 `runtime-runbook.md`(로컬 개발
환경 설정)와의 분리 관례를 명시하고 있어(§1 헤더), 세 번째 관심사(계정
**사전** 발급)도 같은 원칙으로 분리하는 것이 이 프로젝트의 기존 문서
구조와 일관적이다. `scripts/provision-tester.ts` 코드는 건드리지 않는다.

### B.4 문서 동기화 확인 (변경 가능성 최저 — 순수 검증)

run-phase 착수 시점에 README.md·product.md에 대해 plan-phase와 동일한 Grep을
재실행해 SPEC-PILOT-READY-001 관련 서술이 여전히 일치하는지 확인하고
progress.md에 결과를 기록한다. 불일치가 없으면 이 REQ는 "확인 완료, 변경
없음"으로 종결된다.

## §C. 마일스톤 (우선순위 기반, 시간 추정 없음)

| Milestone | 우선순위 | 내용 | 관련 REQ |
|-----------|----------|------|----------|
| M1 | High | 로그인 화면 4곳 문구 교체(`page.tsx` 3곳 + `login-form.tsx` 1곳) + 관련 테스트 재확인 | REQ-PILOT-LAUNCH-001, 002 |
| M2 | High | 사건 입력 화면 폼 하단 안내 1곳 교체 | REQ-PILOT-LAUNCH-003, 004 |
| M3 | Medium | `.moai/docs/account-provisioning.md` 신규 작성 | REQ-PILOT-LAUNCH-005 |
| M4 | Low | README.md/product.md 재확인(Grep) 및 progress.md 기록 | REQ-PILOT-LAUNCH-006 |
| M5 | Low | 품질 게이트(tsc/eslint/prettier/vitest/build) 전체 재실행 + 커밋/푸시 | 전체 |

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

## §E. 도메인 전문가 컨설테이션 권고 (Step 6)

이 SPEC은 프론트엔드(React/Next.js 컴포넌트 텍스트 노드) 키워드에 해당하지만,
변경 범위가 순수 텍스트 문자열 교체(컴포넌트 구조·상태·로직 무변경)로
극히 좁으므로 별도 frontend 전문가 컨설테이션은 **불필요**로 판단한다.
manager-develop이 Tier S 최소 위임 형태로 직접 처리 가능하다. run-phase
진행 중 예상외의 구조적 변경이 필요함이 드러나면 그 시점에 blocker report로
재평가한다.

## §F. Self-Verification Checklist (plan-phase)

- [x] SPEC ID 정규식 self-check: PASS (`SPEC-PILOT-LAUNCH-001`)
- [x] Frontmatter 12개 필수 필드 스키마 검증 완료
- [x] 기존 SPEC과 ID 충돌 없음 확인(`.moai/specs/` 목록에 `SPEC-PILOT-LAUNCH-001` 부재 확인)
- [x] GEARS 표기법(Unwanted/Ubiquitous)으로 요구사항 작성
- [x] Out of Scope 절 — 5개 `### Out of Scope — <topic>` H3 서브헤딩, 각각 `-` 불릿 포함
- [x] Tier S 아티팩트 세트(spec.md + plan.md, AC 인라인) 준수
- [x] spec.md 본문에 구현 세부사항(함수명, API 스키마) 없음 — WHAT/WHY만 기술
