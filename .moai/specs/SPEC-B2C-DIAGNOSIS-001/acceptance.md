# Acceptance Criteria — SPEC-B2C-DIAGNOSIS-001

각 AC는 `AC-B2CDIAG-NNN` 형식이며, 후속 run-phase 구현이 이 기준을 Given-When-Then으로 검증한다. 이번 plan-phase는 문서만 작성하며, 아래 시나리오는 아직 실행되지 않는다.

## 동의 플로우

- **AC-B2CDIAG-001**: Given 01 화면에서 검색어를 입력한 상태, When "보상 진단" 버튼을 클릭하면, Then 로그인·회원가입 절차 없이 민감정보 처리 동의 화면(Desktop Modal / Mobile Bottom Sheet)이 즉시 표시되며, 그 화면에는 건강정보 등 민감정보 처리 동의 체크박스 1건만 존재하고 이름·전화번호·마케팅 동의 입력 항목은 존재하지 않는다. (REQ-B2CDIAG-001, REQ-B2CDIAG-002, REQ-B2CDIAG-003, REQ-B2CDIAG-005)
- **AC-B2CDIAG-002**: Given 동의 화면이 열려 있고 체크박스가 선택되지 않은 상태, When 사용자가 아무 것도 클릭하지 않으면, Then "동의하고 진단하기" CTA는 비활성화 상태를 유지한다. (REQ-B2CDIAG-006)
- **AC-B2CDIAG-003**: Given 동의 화면이 열려 있는 상태, When "내용 보기"를 클릭하면, Then Desktop에서는 Modal이, Mobile에서는 Bottom Sheet가 열리고, 열람 직후 동의 체크박스는 여전히 선택되지 않은 상태다. (REQ-B2CDIAG-007)
- **AC-B2CDIAG-004**: Given 동의 상세 보기가 열려 있는 상태, When 닫기 버튼/ESC/배경 클릭 중 하나를 수행하면, Then 상세 보기가 닫히고 포커스가 "내용 보기" 트리거로 돌아온다. (REQ-B2CDIAG-008)
- **AC-B2CDIAG-005**: Given 스크린리더 사용자가 동의 체크박스에 포커스한 상태, When 스크린리더가 항목을 낭독하면, Then 체크박스 라벨과 설명 텍스트가 하나의 항목으로 함께 낭독된다. (REQ-B2CDIAG-009)
- **AC-B2CDIAG-006**: Given 필수 동의 체크박스가 선택된 상태, When "동의하고 진단하기"를 클릭하면, Then CTA가 활성화되어 있었고 클릭이 정상 처리되어 추가 질문 화면으로 전환된다. (REQ-B2CDIAG-006, REQ-B2CDIAG-010)

## 추가 질문 · 상태 전이

- **AC-B2CDIAG-007**: Given 동의를 완료한 직후, When 추가 질문 화면에 진입하면, Then 질문 1/3이 순서대로 표시되고 이전 질문으로 되돌아갈 수 없는 진행형 UI가 아니라 단계 진행 표시(1/3, 2/3, 3/3)가 보인다. (REQ-B2CDIAG-010)
- **AC-B2CDIAG-008**: Given 추가 질문 1/3에 있는 상태, When "건너뛰고 결과 보기"를 클릭하면, Then 남은 질문 없이 즉시 진단 중 상태로 전환된다. (REQ-B2CDIAG-011)
- **AC-B2CDIAG-009**: Given 추가 질문 3문항에 모두 응답한 상태, When 마지막 응답을 제출하면, Then 진단 중 상태로 전환되고 단계별 진행 표시(사고 내용 확인 중 → 관련 보상 유형 탐색 중 → 확인할 담보 정리 중)가 순서대로 나타난다. (REQ-B2CDIAG-012)
- **AC-B2CDIAG-010**: Given 진단 중 상태에서 매칭 결과가 0건으로 판정된 상태, When 분석이 완료되면, Then 결과 없음(01-D) 화면이 표시되고 "내용을 수정할게요" 경로가 제공된다. (REQ-B2CDIAG-013)
- **AC-B2CDIAG-011**: Given 진단 중 상태에서 분석 처리 자체가 실패한 상태, When 오류가 발생하면, Then 분석 오류(01-E) 화면이 표시되고 입력했던 검색어가 그대로 보존되며 "다시 시도"와 "입력 내용으로 돌아가기" 두 버튼이 모두 노출된다. (REQ-B2CDIAG-014)
- **AC-B2CDIAG-012**: Given 분석 오류 화면에서, When "다시 시도"를 클릭하면, Then 동일한 입력값으로 진단 중 상태부터 다시 시작한다. (REQ-B2CDIAG-014)

## 새로고침 · 직접 URL 접근 · 동의 철회 · 뒤로 가기

- **AC-B2CDIAG-013**: Given 추가 질문 화면까지 진행한 상태, When 브라우저 새로고침을 실행하면, Then 입력값·동의 상태·응답이 모두 초기화되고 01 초기 화면으로 되돌아간다 — 이는 그 상태가 서버나 DB가 아니라 클라이언트 메모리에만 존재했음을 검증한다. (REQ-B2CDIAG-015, REQ-B2CDIAG-004, REQ-B2CDIAG-021)
- **AC-B2CDIAG-014**: Given 프로덕션 환경에서 클라이언트 메모리에 선행 상태가 없는 상태, When 진단 중/결과 상태에 해당하는 URL로 직접 접근하면, Then 01 초기 입력 화면으로 리다이렉트된다. (REQ-B2CDIAG-016)
- **AC-B2CDIAG-015**: Given `ENABLE_DIAGNOSIS_DEV_STATES=true`(reviewEnabled=true)인 비프로덕션(dev/staging) 환경 — `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY`(productionReady 구성 요소)가 `false`/`false`, `true`/`false`, `false`/`true`, `true`/`true` 중 어느 조합이든 무관하게, When `?devStep=result-none` 또는 `?devStep=error` 쿼리 파라미터로 접근하면, Then `shouldRenderDiagnosis = productionReady || reviewEnabled`가 참이 되어 `<DiagnosisFlow />`가 렌더링되고, 선행 상태 없이도 01-D(결과 없음) 또는 01-E(분석 오류) 상태가 UI 검증 목적으로 강제 렌더링된다 — `reviewEnabled` 경로가 `productionReady` 값과 무관하게 독립 동작함을 검증한다. (REQ-B2CDIAG-017, REQ-B2CDIAG-025)
- **AC-B2CDIAG-016**: Given `ENABLE_DIAGNOSIS_DEV_STATES`가 unset이거나 `false`(reviewEnabled=false, 프로덕션 기본값)이고 `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY`도 production 기본값인 `false`/`false`인 상태, When `?devStep=` 쿼리 파라미터로 접근을 시도하면, Then `shouldRenderDiagnosis = productionReady || reviewEnabled`가 거짓이므로 `<DiagnosisFlow />`는 렌더링되지 않고 placeholder가 유지되며 `?devStep=`은 무시된다 — devStep이 production 기본 조합에서 무시됨을 검증하는 전용 시나리오다. 아래 행렬은 run-phase 테스트 계획이 기계적으로(Vitest/Playwright) 검증해야 할 전체 조합을 정의한다:

  | `ENABLE_DIAGNOSIS_FLOW` | `DIAGNOSIS_ENGINE_READY` | `ENABLE_DIAGNOSIS_DEV_STATES` | `productionReady` | `reviewEnabled` | `shouldRenderDiagnosis` | 결과 |
  |---|---|---|---|---|---|---|
  | false | false | false | false | false | false | placeholder (production 기본값) |
  | true | false | false | false | false | false | placeholder |
  | false | true | false | false | false | false | placeholder |
  | true | true | false | true | false | true | 실제 DiagnosisFlow |
  | false | false | true | false | true | true | review용 DiagnosisFlow |

  (REQ-B2CDIAG-016, REQ-B2CDIAG-017, REQ-B2CDIAG-025)
- **AC-B2CDIAG-017**: Given 사용자가 필수 동의를 완료하고 추가 질문 화면의 첫 번째 질문(1/3)에 있는 상태, When 사용자가 뒤로 가기(브라우저 뒤로가기 또는 인앱 뒤로가기 동작)를 수행하면, Then 사용자는 동의(01-A2) 오버레이로 재진입하고 이전에 체크했던 동의 체크박스가 여전히 선택된 상태로 표시된다(세션 내 유지, REQ-B2CDIAG-019); When 이 상태에서 사용자가 그 체크박스를 다시 해제하면, Then 최초 미동의 상태와 동일하게 "동의하고 진단하기" CTA를 통한 다음 단계 진행이 다시 차단된다; AND 뒤로 가기 이전에 이미 답변했던 추가 질문 응답은 동의 철회로 인해 삭제되지 않고 클라이언트 상태(React state)에 그대로 남아 있으며, 사용자가 이후 다시 동의하고 진행하면 그 응답이 유지된 채로 이어진다 — 동의 철회는 "다음 단계로의 진행을 차단"하는 것이지 "이미 입력된 클라이언트 상태를 삭제"하는 것이 아니다(design.md §17 "동의 철회 시 데이터 처리" 행 및 §18.1 `questions` 상태 "유지되는 데이터" 행과 일치). (REQ-B2CDIAG-018, REQ-B2CDIAG-019)
- **AC-B2CDIAG-018**: Given 추가 질문 화면에 있는 상태, When 이전 단계(동의 화면)로 돌아가면, Then 이미 완료했던 필수 동의 체크 상태가 같은 세션 내에서 유지된 채로 표시된다. (REQ-B2CDIAG-019)

## 입력 검증 · 반응형 · Mock 데이터

- **AC-B2CDIAG-019**: Given 01 검색창에 휴대전화번호 형식(예: `010-1234-5678` 또는 `01012345678`) 또는 주민등록번호 형식(예: `901231-1234567` 또는 `9012311234567`) 문자열을 입력한 상태, When "보상 진단"을 클릭하면, Then 입력 스키마 검증이 실패하고 동의 화면으로 진행하지 않는다. 이름 형식 문자열(예: "홍길동")은 이 자동 거부 대상이 아니다 — 이름은 정규식으로 신뢰성 있게 판별할 수 없어 오탐(false positive) 없이 자동 거부할 수 없으며, 대신 기존 경고 배너(`notice.tsx`)를 통한 안내만 제공된다(별도 AC로 차단 여부를 검증하지 않음 — `design.md` §4 참고). (REQ-B2CDIAG-020)
- **AC-B2CDIAG-020**: Given 뷰포트 폭이 1440px(Desktop)와 390px(Mobile) 각각인 상태, When 동일한 진단 플로우를 수행하면, Then 두 폭 모두 동일한 상태 머신과 데이터로 동작하되 레이아웃(Modal vs Bottom Sheet 등)만 다르게 렌더링된다. (REQ-B2CDIAG-022)
- **AC-B2CDIAG-021**: Given `ENABLE_DIAGNOSIS_FLOW=false`(프로덕션 기본값) 또는 `DIAGNOSIS_ENGINE_READY=false`(프로덕션 기본값 — 실제 매칭 엔진 연결이 이 SPEC의 Out of Scope이므로 이 SPEC 범위 내내 유지되는 상태) 중 하나 이상이 참이고, 동시에 `ENABLE_DIAGNOSIS_DEV_STATES=false`(reviewEnabled=false, 프로덕션 기본값)인 상태 — 즉 `shouldRenderDiagnosis = productionReady || reviewEnabled`가 거짓인 프로덕션 조합, When 실제 사용자(또는 테스트 실행 환경)가 01 화면이 정상 렌더링되었다면 `<DiagnosisFlow />`가 표시되어야 할 지점에 도달하면, Then `app/page.tsx`는 `<DiagnosisFlow />`를 렌더링하지 않고 기존 placeholder("서비스 준비 중입니다")를 렌더링한다 — 따라서 `loading` 상태를 거쳐 01-D(결과 없음) 또는 01-E(분석 오류)로 자동 분기하는 mock 판정 경로에서 나오는 mock 결과가 실제 프로덕션 사용자에게 표시되지 않는다. 세 플래그 상태 모두 테스트 환경(예: Playwright 테스트 설정, CI 환경 변수)에서 직접 설정·검증 가능하다. (REQ-B2CDIAG-024, REQ-B2CDIAG-025)

## Edge Cases

- **AC-B2CDIAG-022**: Given 검색창에 200자를 입력해 글자 수 제한에 도달한 상태, When 사용자가 추가 문자를 입력하려 시도하면, Then 입력이 차단되고 글자 수 카운터가 `200 / 200자`로 정확히 표시된다. (REQ-B2CDIAG-020)
- **AC-B2CDIAG-023**: Given 01/M01 화면이 로드된 상태, When "많이 찾는 사례" 칩(예: 교통사고) 중 하나를 클릭하면, Then 검색창에 해당 칩의 텍스트가 채워지고 "보상 진단" CTA가 활성화된다. (REQ-B2CDIAG-005)

## 배포 정합성

- **AC-B2CDIAG-024**: Given `plan.md` 마일스톤 11(b)(배포 smoke check 교체)이 정의되어 있는 상태, When `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 프로덕션에서 실제로 모두 `true`로 전환되면, Then `.github/workflows/deploy.yml`의 배포 스모크 체크 문자열이 현재의 "서비스 준비 중입니다" 대신 새 01 화면의 안정적 식별자로 교체되어 있어야 한다 — 이 교체는 run-phase 코드 완성 시점에 자동으로 이뤄지지 않는다. (REQ-B2CDIAG-023)

  > **참고**: 이 AC는 `ENABLE_DIAGNOSIS_FLOW`+`DIAGNOSIS_ENGINE_READY`가 실제 프로덕션에서 활성화되는 시점에 조건부로 검증되며, 이 SPEC 자체의 sync-phase `completed` 전환 조건이 아니다.

## 프로덕션 활성화 게이트

- **AC-B2CDIAG-025**: Given `ENABLE_DIAGNOSIS_FLOW=true`(및 `DIAGNOSIS_ENGINE_READY=true`)로 전환된 환경이라 하더라도, When 사용자가 동의 상세(01-A3/M01-A3) 화면을 열람하면, Then 6개 항목(처리 목적 / 처리하는 건강정보 항목 / 서버 저장 여부 / 보유·이용 기간 / 외부 AI 서비스 전송 여부 / 동의 거부 권리 및 진단 이용 제한) 중 어느 것도 `{}` placeholder 형태로 프로덕션 UI에 노출되지 않는다 — 6개 문구가 모두 확정되기 전까지 `ENABLE_DIAGNOSIS_FLOW` 자체를 `true`로 전환할 수 없으므로, 이 조건은 배포 전 게이트로 검증된다. (REQ-B2CDIAG-025, `plan.md` §B)

## Definition of Done (이 plan-phase 기준)

- [ ] 위 25개 AC(AC-001~AC-025) 각각이 후속 run-phase에서 Vitest(단위/컴포넌트) 또는 Playwright(01 범위 E2E)로 매핑됨 — 구 AC-025b(프로덕션 빌드/Suspense 검증)는 "## Quality Gate 기준" 섹션으로 이관되어 별도 품질 게이트 기준으로 관리된다
- [ ] `spec.md`의 25개 REQ 전항목이 명시적으로 최소 1개 AC에 인용됨 — REQ-B2CDIAG-001/002/003 → AC-001, REQ-B2CDIAG-004/021 → AC-013, REQ-B2CDIAG-020 → AC-019/AC-022, REQ-B2CDIAG-005 → AC-001/AC-023, REQ-B2CDIAG-023 → AC-024, REQ-B2CDIAG-025 → AC-021/AC-025, 나머지(REQ-006~019, 022, 024)는 §본문의 각 AC에 개별 인용됨
- [ ] Out of Scope 항목(02/03 구현, E2E 전체, 매칭 엔진)에 대한 테스트가 이 SPEC의 run-phase에 포함되지 않음을 plan-auditor가 확인
- [ ] AC-021/AC-015/AC-016 검증됨: production 기본값 조합(`productionReady`=false, `reviewEnabled`=false)에서 실제 사용자는 정상 사용자 플로우를 통해 01-D/01-E에 절대 도달할 수 없으며, `reviewEnabled` 경로는 `productionReady` 값과 무관하게 독립적으로 UI 검증·Playwright 목적에만 동작함이 AC-016의 5행 동작 행렬로 확인됨
- [ ] AC-025 검증됨: 6개 동의 상세 placeholder 문구가 확정되지 않은 한 `ENABLE_DIAGNOSIS_FLOW`가 프로덕션에서 `true`로 전환되지 않음
- [ ] AC-024는 이 SPEC의 sync-phase `completed` 전환을 막는 블로킹 조건이 아니다 — `ENABLE_DIAGNOSIS_FLOW`+`DIAGNOSIS_ENGINE_READY`가 실제 프로덕션에서 활성화되는 시점에 조건부로 검증되는 이연(deferred) 추적 항목이며, "이 SPEC의 모든 AC가 충족되어야 완료" 판정 집합에서 제외된다(`plan.md` M11(b) 참고)
- [ ] run-phase가 동의 상세 컨테이너(Modal/Bottom Sheet 셸)의 전체 UI 구현을 완료하더라도, 6개 문구가 미확정 상태이면 이 SPEC의 판정은 "코드 구현 완료 / 출시 차단"이며 "완료"로 판정하지 않는다
- [x] 이 문서 및 `spec.md`/`plan.md`/`progress.md`에 기재된 plan-auditor 검토 이력(iteration 1~5)은 전부 실제 plan-auditor 호출 결과이며 `progress.md` §G에 근거(must-pass 결과, 감사 대상 커밋, 로컬 보고서 경로가 참고용·`.gitignore` 대상이라는 사실)와 함께 기록되어 있음을 확인함 — **최종 결과: iteration 5 PASS(0.95)**. design.md 렌더링 게이트(productionReady/reviewEnabled) 관련 blocking 결함은 모두 해소되었으며, plan-audit 게이트를 통과했다. optional 결함 3건은 재감사 없이 run-phase 진입 시 문서 정리로 처리한다. Implementation Kickoff Approval(사용자의 run-phase 착수 최종 승인)은 이 plan-audit PASS와 별개로 여전히 필요하다

## Quality Gate 기준

- Vitest 단위 테스트: 신규 zod 스키마·상태 머신 로직 커버리지 85% 이상(프로젝트 `constitution.test_coverage_target` 기준)
- LSP: run-phase 진입 시 `max_errors: 0, max_type_errors: 0, max_lint_errors: 0`(`.moai/config/sections/quality.yaml`)
- 접근성: 키보드만으로 01→동의→추가질문→진단중 전체 흐름 완주 가능(마우스 없이)
- 프로덕션 빌드 검증: `diagnosis-flow.tsx`(Client Component)가 `useSearchParams()`를 호출하는 상태에서 `next build`(또는 `package.json`이 정의한 동등 빌드 스크립트) 성공, `app/page.tsx`가 `<DiagnosisFlow />`를 `<Suspense fallback={...}>`로 감싸고 있음을 전제로 Suspense 경계 누락으로 인한 빌드 오류·경고 없음(`design.md` §2) — Milestone 2/10 완료 조건에 포함
