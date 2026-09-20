# 시각 정합성 비교 — SPEC-B2C-DIAGNOSIS-001 (M-fix 재검증)

**이 문서는 이전 버전을 완전히 대체한다.** 이전 버전은 외부 코드 리뷰에서
실제 구현과 불일치하는 것으로 확인되어 폐기되었다 — 특히 "원본 사례 칩을
대표 예시로 축소한 것은 design.md 범위 내 재량"이라는 판단은 근거 없는
주장이었다(해당 재량을 허용하는 요구사항·승인 기록이 없음). 이 문서는
M-fix-1~6 결함 수정 이후 실제 코드 상태를 기준으로 다시 검증한 결과다.

design.md §16 절차에 따른 수동 비교 기록이다. 자동 픽셀 diff 도구는 도입하지
않았다(tech.md § 비용 태도, design.md §16) — Playwright로 각 상태를
`?devStep=`(또는 실제 사용자 플로우)으로 강제 진입해 캡처한 스크린샷과
`design/exports/`의 대응 PNG를 나란히 놓고 레이아웃 폭 · 색상 토큰 · 텍스트
일치 여부를 수동으로 리뷰한 결과다.

캡처 스크린샷 경로: `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/screenshots/`
캡처 절차: `e2e/`에 임시 스크립트(`_visual-capture.spec.ts`)를 만들어
`pnpm test:e2e -- --spec=_visual-capture`로 실행한 뒤 삭제했다(design.md §16의
"잠정 절차"이므로 커밋 대상에서 제외 — 회귀 테스트가 아니다).

## Desktop (1440x900)

| 화면 | 구현 캡처 | 디자인 원본 | 레이아웃 폭 | 색상 토큰 | 텍스트 |
|---|---|---|---|---|---|
| 01 입력 | `screenshots/01-input.png` | `design/exports/01-보상-진단-질문-입력.png` | **일치** — 헤더·헤드라인·검색+CTA 결합·안내·칩·4카드·푸터 구조와 여백 비율이 원본과 동일 | **일치** — 헤드라인 위 서브헤드·chip 아이콘·카드 아이콘 모두 BORA 퍼플(`bora-accent`). CTA 버튼은 검색어가 비어 있어(`0/200자`) `disabled:opacity-50`로 옅게 보이지만, 이는 캡처 시점에 입력값이 없었기 때문이며 실제 배경색 토큰(`bg-bora-accent`)은 M-fix-3 적용대로 정확하다(01-A2 캡처에서 동일 버튼이 활성 진한 보라로 렌더링됨을 재확인) | 헤드라인 "이거, 보상 받을 수 있나요?"·서브헤드·설명·사용 안내·PII 배너 문구 모두 원본과 일치. "많이 찾는 사례" 칩 6개(교통사고/계단에서 낙상/운동 중 부상/허리 디스크/어깨 회전근개/암 진단) 전부 원본과 정확히 일치(M-fix-1 — 이전 버전의 "대표 예시로 축소" 판단은 근거 없는 주장이었으며 철회함) |
| 01-A2 동의 | `screenshots/01-A2-consent.png` | `design/exports/01-A2-진단-시작-동의.png` | **일치** — Modal 폭·중앙 정렬 확인. **추가 확인(M-fix-2)**: 배경에 01 화면(검색창에 입력했던 "무릎 골절로 수술을 받았어요"가 그대로 표시됨)이 dim 처리된 채 유지되어 원본과 동일하게 "01 위의 오버레이" 구조를 재현함 — 이전 버전은 배경 없이 빈 화면이었던 결함이 있었으나 해소됨 | **일치** — "동의하고 진단하기" CTA는 체크박스 미선택 상태라 옅은 보라(`disabled:opacity-50`)이지만 색상 자체는 BORA 퍼플. 우측 상단 닫기(X) 버튼 신규 확인(M-fix-2) — 원본과 동일 위치 | 타이틀·본문·체크박스 라벨·CTA 문구 모두 원본과 일치 |
| 01-A3 동의 상세 | `screenshots/01-A3-consent-detail.png` | (대응 export 없음 — 01-A3 export 파일이 `design/exports/`에 존재하지 않음) | 레이아웃 자체 검증 대상 없음 — 6개 항목 dt/dd 구조로 렌더링됨을 확인 | "확인" 버튼 BORA 퍼플 적용(이번 재검증 중 발견해 추가 수정) | 6개 항목 모두 리터럴 `{}` placeholder 유지 확인(AC-B2CDIAG-025) — 실제 법무 문구를 임의 생성하지 않음 |
| 01-B 추가 질문 | `screenshots/01-B-questions.png` | `design/exports/01-B-추가-질문.png` | 일치 | 진행률 텍스트·라디오 테두리 일치. **잔여 갭(이번 수정 범위 밖)**: "다음" CTA가 achromatic(회색) 기본 Button variant를 사용 중 — step-questions.tsx는 M-fix-1~6 대상 파일이 아니므로 이번 작업에서 손대지 않음. 원본과의 완전한 색상 일치를 원하면 별도 결함으로 다뤄야 함 | "질문 N/3"·"건너뛰고 결과 보기"·"이전"/"다음" 문구 일치. 질문 문구 자체는 placeholder(design.md §15 각주, 잔여 위험으로 기존 기록됨) |
| 01-C 진단 중 | `screenshots/01-C-loading.png` | `design/exports/01-C-진단-중.png` | 일치 | 스피너·단계 카드 테두리 일치(이 화면은 애초에 중립 톤이라 색상 결함과 무관) | 3단계 문구·"진행 중"/"대기" 라벨 일치 |
| 01-D 결과 없음 | `screenshots/01-D-result-none.png` | `design/exports/01-D-결과-없음.png` | 일치 | **잔여 갭(범위 밖)**: "내용을 수정할게요" 버튼이 achromatic — step-result-none.tsx 미대상 | 안내 문구 일치, mock 배지는 REQ-B2CDIAG-024 반영 신규 요소(결함 아님) |
| 01-E 분석 오류 | `screenshots/01-E-error.png` | `design/exports/01-E-분석-오류.png` | 일치 | 오류 아이콘 배경 destructive 톤 일치. **잔여 갭(범위 밖)**: "다시 시도" 버튼 achromatic — step-error.tsx 미대상 | 오류 문구·버튼 문구 일치 |

## Mobile (390x844)

| 화면 | 구현 캡처 | 디자인 원본 | 비고 |
|---|---|---|---|
| M01 입력 | `screenshots/M01-input.png` | `design/exports/M01-질문-입력.png` | 세로 스택·"회원가입 없이 약 1분 · 분석 목적으로만 사용" 결합 문구가 안내 배너 **아래**로 이동하는 반응형 순서까지 원본과 일치(M-fix-1). 칩 6개 전부 표시, 카드 4개 세로 스택. 텍스트 잘림·요소 겹침 없음 |
| M01-A2 동의 | `screenshots/M01-A2-consent.png` | `design/exports/M01-A2-진단-시작-동의.png` | Bottom Sheet(`data-slot="drawer-content"`) 확인. 상단 grabber·닫기(X) 버튼(M-fix-2) 위치 원본과 일치. 배경(01 화면 헤더)이 dim 처리된 채 유지됨(M-fix-2) |
| M01-A3 동의 상세 | `screenshots/M01-A3-consent-detail.png` | (대응 export 없음) | "확인" 버튼 BORA 퍼플 적용 확인. `?devStep=consent-detail`로 선행 동작 없이 즉시 열림 확인(M-fix-5, Playwright e2e로도 별도 검증) |
| M01-B 추가 질문 | `screenshots/M01-B-questions.png` | `design/exports/M01-B-추가-질문.png` | 레이아웃 일치. "다음" 버튼 achromatic은 Desktop과 동일한 범위 밖 잔여 갭 |
| M01-C 진단 중 | `screenshots/M01-C-loading.png` | `design/exports/M01-C-진단-중.png` | 레이아웃 일치 |
| M01-D 결과 없음(반응형 재사용) | `screenshots/M01-D-result-none-responsive.png` | (대응 디자인 없음 — plan.md §1/design.md §1 "Desktop 컴포넌트 반응형 재사용" 결정) | 세로 스택으로 정상 리플로. 텍스트 잘림·요소 겹침 없음 |
| M01-E 분석 오류(반응형 재사용) | `screenshots/M01-E-error-responsive.png` | (대응 디자인 없음, 위와 동일 근거) | 두 버튼이 겹치지 않고 가로로 나란히 배치됨(뷰포트 폭에 여유가 있어 줄바꿈되지 않음) |

## M-fix 결함별 검증 결과 요약

| 결함 | 상태 | 근거 |
|---|---|---|
| M-fix-1 (01/M01 레이아웃 전체 복원) | **PASS** | 위 표 — 헤더/푸터/헤드라인/칩 6개 전체/4카드/반응형 순서 모두 원본과 일치 확인 |
| M-fix-2 (동의 오버레이 배경 유지 + 닫기 X) | **PASS** | 01-A2/M01-A2 캡처에서 배경(01 화면, 입력값 포함)이 dim 상태로 유지됨을 스크린샷으로 확인. X 버튼 Playwright e2e로 클릭 동작까지 검증 |
| M-fix-3 (BORA 퍼플 CTA) | **PASS(부분)** | 이 SPEC이 소유한 진단 플로우 전용 CTA(보상 진단/동의하고 진단하기/확인)는 전부 BORA 퍼플 적용 확인. step-questions.tsx/step-result-none.tsx/step-error.tsx의 자체 액션 버튼은 이번 수정 대상 파일이 아니므로 achromatic 상태 그대로 남아 있음(§M-fix 결함별 검증 결과 요약 아래 "잔여 위험" 참고) |
| M-fix-4 (?step= 라우팅 + 뒤로가기) | **PASS** | Playwright e2e로 실제 `page.goBack()` 검증 완료(input→consent→questions 왕복, 답변 보존 확인). 직접 진입/새로고침 정리 동작도 e2e로 검증 |
| M-fix-5 (devStep=consent-detail) | **PASS** | Desktop/Mobile 스크린샷 + Playwright e2e 모두에서 상세 오버레이가 선행 동작 없이 즉시 열림을 확인 |
| M-fix-6 (칩 키보드 접근성) | **PASS** | Tab+Enter/Space 실제 키보드 이벤트로 Playwright e2e 검증(jsdom 단위 테스트로는 네이티브 버튼의 브라우저 기본 활성화를 재현할 수 없어 e2e가 유일한 검증 수단) |

## 잔여 위험 (범위 밖으로 남겨둠 — 은폐하지 않고 명시)

1. **step-questions.tsx/step-result-none.tsx/step-error.tsx의 자체 CTA가 achromatic이다.** 이 SPEC의 이번 원격 수정 지시(M-fix-1~6)는 명시적으로 step-input.tsx, diagnosis-flow.tsx, step-consent-modal.tsx, step-consent-sheet.tsx, chip.tsx, button.tsx(variant 추가)로 대상 파일을 한정했다. 위 3개 파일은 그 목록에 없었으므로 손대지 않았다 — Scope Discipline 준수. 완전한 시각적 일관성을 원한다면 별도 후속 작업(또는 이번 지시의 확장 승인)이 필요하다.
2. **동의 상세 6개 문구는 여전히 리터럴 placeholder다.** 법무 확정 전까지 의도된 상태이며(AC-B2CDIAG-025), 이번 수정에서도 실제 문구를 임의로 작성하지 않았다.
3. **질문 문구(01-B)는 대표 placeholder다.** 매칭 엔진 미연결 상태이므로 design.md §15 각주와 기존 progress.md 잔여 위험 기록 그대로 유지된다.
4. **자동 픽셀 diff는 여전히 도입하지 않았다.** 수동 리뷰 절차이며 미세한 여백·폰트 렌더링 차이는 육안 검토 범위를 벗어날 수 있다.

## Definition of Done 대응

- design.md §16 절차(1) Playwright 캡처 → (2) 원본과 나란히 수동 리뷰 → (3) progress.md 기록, 이 세 단계를 모두 재수행했다.
- 이전 버전의 근거 없는 "재량 축소" 판단을 철회하고, 실제 코드 상태를 있는 그대로 기록했다.
- 정밀 픽셀 diff 자동화는 이 SPEC에서 결정하지 않는다(design.md §16 그대로 유지).
