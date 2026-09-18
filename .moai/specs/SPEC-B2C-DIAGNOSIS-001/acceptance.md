# Acceptance Criteria — SPEC-B2C-DIAGNOSIS-001

각 AC는 `AC-B2CDIAG-NNN` 형식이며, 후속 run-phase 구현이 이 기준을 Given-When-Then으로 검증한다. 이번 plan-phase는 문서만 작성하며, 아래 시나리오는 아직 실행되지 않는다.

## 동의 플로우

- **AC-B2CDIAG-001**: Given 01 화면에서 검색어를 입력한 상태, When "보상 진단" 버튼을 클릭하면, Then 민감정보 처리 동의 화면(Desktop Modal / Mobile Bottom Sheet)이 표시된다. (REQ-B2CDIAG-005)
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

- **AC-B2CDIAG-013**: Given 추가 질문 화면까지 진행한 상태, When 브라우저 새로고침을 실행하면, Then 입력값·동의 상태·응답이 모두 초기화되고 01 초기 화면으로 되돌아간다. (REQ-B2CDIAG-015)
- **AC-B2CDIAG-014**: Given 프로덕션 환경에서 클라이언트 메모리에 선행 상태가 없는 상태, When 진단 중/결과 상태에 해당하는 URL로 직접 접근하면, Then 01 초기 입력 화면으로 리다이렉트된다. (REQ-B2CDIAG-016)
- **AC-B2CDIAG-015**: Given 프로덕션이 아닌 환경(dev/staging), When 지정된 개발용 쿼리 파라미터로 특정 상태(예: 결과 없음)를 지정해 접근하면, Then 선행 상태 없이도 해당 상태가 강제로 렌더링된다. (REQ-B2CDIAG-017)
- **AC-B2CDIAG-016**: Given 프로덕션 환경, When 동일한 개발용 쿼리 파라미터로 접근을 시도하면, Then 해당 파라미터는 무시되고 정상적인 상태 판정 로직을 따른다. (REQ-B2CDIAG-016, REQ-B2CDIAG-017)
- **AC-B2CDIAG-017**: Given 필수 동의를 완료하고 추가 질문 화면까지 진행한 상태, When 동의를 철회(체크 해제)하면, Then 다음 단계 진행이 차단되고, 그 시점까지의 추가 질문 응답은 다음 단계로 전달되지 않는다. (REQ-B2CDIAG-018)
- **AC-B2CDIAG-018**: Given 추가 질문 화면에 있는 상태, When 이전 단계(동의 화면)로 돌아가면, Then 이미 완료했던 필수 동의 체크 상태가 같은 세션 내에서 유지된 채로 표시된다. (REQ-B2CDIAG-019)

## 입력 검증 · 반응형 · Mock 데이터

- **AC-B2CDIAG-019**: Given 01 검색창에 이름 또는 전화번호 형식 문자열을 입력한 상태, When "보상 진단"을 클릭하면, Then zod 스키마 검증이 실패하고 동의 화면으로 진행하지 않는다. (REQ-B2CDIAG-020)
- **AC-B2CDIAG-020**: Given 뷰포트 폭이 1440px(Desktop)와 390px(Mobile) 각각인 상태, When 동일한 진단 플로우를 수행하면, Then 두 폭 모두 동일한 상태 머신과 데이터로 동작하되 레이아웃(Modal vs Bottom Sheet 등)만 다르게 렌더링된다. (REQ-B2CDIAG-022)
- **AC-B2CDIAG-021**: Given 담보 매칭 엔진이 아직 연결되지 않은 현재 상태, When 진단 결과 화면(01→02 경계)에 도달하면, Then mock 데이터임을 나타내는 표시 없이 실제 결과처럼 보이게 렌더링되지 않는다 — 즉 02 화면 자체가 이 SPEC에서 구현되지 않으므로 mock 결과가 노출될 경로 자체가 존재하지 않는다. (REQ-B2CDIAG-024)

## Edge Cases

- **AC-B2CDIAG-022**: 200자 입력 제한에 도달한 상태에서 추가 입력을 시도하면 입력이 차단되고 글자 수 카운터(`28 / 200자`)가 정확히 갱신된다.
- **AC-B2CDIAG-023**: 자주 찾는 사례 칩(교통사고, 계단에서 낙상 등)을 클릭하면 검색창에 해당 텍스트가 채워지고 "보상 진단" CTA가 활성화된다.

## Definition of Done (이 plan-phase 기준)

- [ ] 위 23개 AC 각각이 후속 run-phase에서 Vitest(단위/컴포넌트) 또는 Playwright(01 범위 E2E)로 매핑됨
- [ ] `spec.md`의 24개 REQ 전항목이 최소 1개 이상의 AC로 커버됨(REQ-B2CDIAG-001~004, 021, 023은 원칙성 요구사항으로 여러 AC에 걸쳐 암묵적으로 검증됨)
- [ ] Out of Scope 항목(02/03 구현, E2E 전체, 매칭 엔진)에 대한 테스트가 이 SPEC의 run-phase에 포함되지 않음을 plan-auditor가 확인

## Quality Gate 기준

- Vitest 단위 테스트: 신규 zod 스키마·상태 머신 로직 커버리지 85% 이상(프로젝트 `constitution.test_coverage_target` 기준)
- LSP: run-phase 진입 시 `max_errors: 0, max_type_errors: 0, max_lint_errors: 0`(`.moai/config/sections/quality.yaml`)
- 접근성: 키보드만으로 01→동의→추가질문→진단중 전체 흐름 완주 가능(마우스 없이)
