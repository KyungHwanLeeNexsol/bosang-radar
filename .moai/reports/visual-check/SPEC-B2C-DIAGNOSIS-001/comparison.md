# 시각 정합성 비교 — SPEC-B2C-DIAGNOSIS-001 M10

design.md §16 절차에 따른 수동 비교 기록이다. 자동 픽셀 diff 도구는 도입하지
않았다(tech.md § 비용 태도, design.md §16) — Playwright로 각 상태를
`?devStep=`(또는 실제 사용자 플로우)으로 강제 진입해 캡처한 스크린샷과
`design/exports/`의 대응 PNG를 나란히 놓고 레이아웃 폭 · 색상 토큰 · 텍스트
일치 여부를 수동으로 리뷰한 결과다.

캡처 스크린샷 경로: `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/screenshots/`
캡처 절차: `e2e/`에 임시 스크립트(`_visual-capture.spec.ts`)를 만들어
`pnpm test:e2e -- --spec=_visual-capture`로 1회 실행한 뒤 삭제했다(회귀
테스트가 아니라 design.md §16의 "잠정 절차"이므로 커밋 대상에서 제외).

## Desktop (1440x900)

| 화면 | 구현 캡처 | 디자인 원본 | 레이아웃 폭 | 색상 토큰 | 텍스트 |
|---|---|---|---|---|---|
| 01 입력 | `screenshots/01-input.png` | `design/exports/01-보상-진단-질문-입력.png` | 일치 — 카드 폭·좌우 여백 비율 유사 | **불일치** — 아래 "공통 발견 사항" 참고 | 문구 자체는 일치("어떤 사고였나요?" 대신 새 헤드라인 사용은 plan-phase에서 확정된 재구성이므로 결함 아님); 칩 라벨("교통사고" 등) 4개 중 3개 일치, 원본에 있는 "운동 중 부상"/"허리 디스크"/"어깨 회전근개"/"암 진단"은 이 SPEC이 대표 예시로 축소한 결과(design.md 범위 내 재량) |
| 01-A2 동의 | `screenshots/01-A2-consent.png` | `design/exports/01-A2-진단-시작-동의.png` | 일치 — Modal 폭·중앙 정렬·배경 Dim 톤 유사 | **불일치**(아래 공통 사항) | 타이틀·본문·CTA 문구 모두 원본과 일치 |
| 01-B 추가 질문 | `screenshots/01-B-questions.png` | `design/exports/01-B-추가-질문.png` | 일치 | 진행률 텍스트·라디오 테두리는 중립 톤으로 일치, CTA 버튼은 공통 발견 사항 대상 | "질문 N/3" 형식·"건너뛰고 결과 보기"·"이전"/"다음" 문구 일치. 실제 질문 문구는 매칭 엔진 미연결로 대표 placeholder를 사용(design.md §15 각주, plan-phase에서 이미 잔여 위험으로 기록됨) |
| 01-C 진단 중 | `screenshots/01-C-loading.png` | `design/exports/01-C-진단-중.png` | 일치 | 스피너·진행 단계 카드 테두리 색상 일치(중립 톤 사용 화면이라 공통 발견 사항 영향 없음) | 3단계 문구("사고 내용 확인 중" 등) 및 "진행 중"/"대기" 라벨 일치 |
| 01-D 결과 없음 | `screenshots/01-D-result-none.png` | `design/exports/01-D-결과-없음.png` | 일치 | 아이콘 배경 중립 톤 일치. mock 배지 색상은 저채도로 원본과 유사 | 안내 문구 일치, mock 배지("이 화면은 데모/검토용 목업입니다") 신규 추가 요소로 원본에는 없음(REQ-B2CDIAG-024 요구사항 반영 — 결함 아님) |
| 01-E 분석 오류 | `screenshots/01-E-error.png` | `design/exports/01-E-분석-오류.png` | 일치 | 오류 아이콘 배경만 옅은 붉은 톤(destructive) 사용 — 원본과 계열 일치 | 오류 문구·"다시 시도"/"입력 내용으로 돌아가기" 버튼 문구 일치 |

## Mobile (390x844)

| 화면 | 구현 캡처 | 디자인 원본 | 비고 |
|---|---|---|---|
| M01 입력 | `screenshots/M01-input.png` | `design/exports/M01-질문-입력.png` | 레이아웃 폭·세로 스택 배치 일치. 색상 토큰은 Desktop과 동일한 공통 발견 사항 적용 |
| M01-A2 동의 | `screenshots/M01-A2-consent.png` | `design/exports/M01-A2-진단-시작-동의.png` | **Bottom Sheet로 정확히 렌더링됨**(`data-slot="drawer-content"`, 화면 하단 고정 + 상단 grabber 존재) — Desktop Modal과 다른 컴포넌트임을 스크린샷으로 확인. 레이아웃(체크박스·"내용 보기"·CTA 세로 배치)이 원본과 일치 |
| M01-B 추가 질문 | `screenshots/M01-B-questions.png` | `design/exports/M01-B-추가-질문.png` | 레이아웃 일치 |
| M01-C 진단 중 | `screenshots/M01-C-loading.png` | `design/exports/M01-C-진단-중.png` | 레이아웃 일치 |
| M01-D 결과 없음(반응형 재사용) | `screenshots/M01-D-result-none-responsive.png` | (대응 디자인 없음 — plan.md §1/design.md §1 "Desktop 컴포넌트 반응형 재사용" 결정) | 세로 스택으로 정상 리플로됨. 텍스트 잘림·요소 겹침 없음 — 반응형 재사용 결정이 실제로 문제없이 동작함을 확인 |
| M01-E 분석 오류(반응형 재사용) | `screenshots/M01-E-error-responsive.png` | (대응 디자인 없음, 위와 동일 근거) | 세로 스택으로 정상 리플로됨. 두 버튼("다시 시도"/"입력 내용으로 돌아가기")이 겹치지 않고 세로로 쌓임 |

## 공통 발견 사항 (잔여 위험으로 기록)

**Primary 색상 토큰이 디자인의 보라/인디고 계열이 아니라 무채색(gray) 계열로 렌더링된다.**

- 원본(`01-A2-진단-시작-동의.png` 등)의 "보상 진단"/"동의하고 진단하기" CTA는 진한 보라(인디고) 배경이다.
- 구현 캡처(`01-input.png`, `01-A2-consent.png` 등)에서는 동일 버튼이 짙은 회색(gray-900 계열)으로 렌더링된다.
- 원인 확인: `app/globals.css`의 `--primary: oklch(0.205 0 0);`(light 모드) — 채도(chroma) 0인 순수 무채색 토큰이다. 다크 모드 `--sidebar-primary: oklch(0.488 0.243 264.376)`(보라 계열, chroma 0.243)는 정의되어 있으나 light 모드 `--primary`에는 적용되지 않았다.
- 이 SPEC(M10)은 검증 마일스톤이며 컴포넌트 스타일 구현은 M2-M9의 산출물이다 — 이 milestone에서 색상 토큰을 임의로 수정하지 않았다(Scope Discipline). 색상 토큰 정정 여부는 별도 판단이 필요한 사항으로 기록만 남긴다.
- 레이아웃 구조·상태 전이·텍스트 내용에는 영향이 없다 — 이번 M10의 핵심 검증 대상(Playwright e2e, Suspense 빌드 검증)은 이 색상 차이와 무관하게 전부 PASS했다.

## Definition of Done 대응

- design.md §16 절차(1) Playwright 캡처 → (2) 원본과 나란히 수동 리뷰 → (3) progress.md 기록, 이 세 단계를 모두 수행했다. 결과는 이 문서(`comparison.md`)로 저장했고, run-phase 완료 보고에서 `progress.md`에도 요약을 남긴다.
- 정밀 픽셀 diff 자동화는 이 SPEC에서 결정하지 않는다(design.md §16 그대로 유지).
