# Research — SPEC-B2C-DIAGNOSIS-001

이 문서는 `design.md`의 기술 결정을 뒷받침하는 코드베이스·의존성 조사 결과를 기록한다. 모든 항목은 이번 plan-phase 세션에서 직접 관찰(Read/Glob/Bash)한 결과다.

## 1. 현재 코드베이스 상태 (2026-09-18, `f7bdae7` 기준)

### `app/`
```
app/favicon.ico
app/globals.css
app/layout.tsx
app/not-found.test.tsx
app/not-found.tsx
app/page.test.tsx
app/page.tsx
```
`app/page.tsx`는 23줄의 정적 placeholder("서비스 준비 중입니다")이며 세션/인증 의존성이 없다(SPEC-B2C-FOUNDATION-001 M2 산출물). `app/api/`는 라우트 핸들러가 전부 삭제되어 빈 디렉터리다.

### `components/`
```
components/exception-panel.tsx
components/ui/button.tsx
components/ui/calendar.tsx
components/ui/card.tsx
components/ui/chip.tsx
components/ui/date-picker.tsx
components/ui/input.tsx
components/ui/label.tsx
components/ui/notice.tsx
components/ui/popover.tsx
components/ui/status-badge.tsx
components/ui/textarea.tsx
```
11개 shadcn 스타일 프리미티브가 이미 존재한다. `popover.tsx`를 직접 읽어 확인한 결과, `@base-ui/react/popover`를 `"use client"` + `data-slot` + `cn()` 유틸 + Tailwind motion 클래스(`data-[starting-style]`, `motion-reduce:transition-none`)로 감싸는 일관된 래퍼 컨벤션을 사용한다 — `design.md` §14의 `dialog.tsx`/`drawer.tsx` 신설이 이 컨벤션을 그대로 따르면 된다.

### `lib/`
`lib/validation/case-input.ts`(+ 테스트)만 존재하고, `lib/coverage/`·`lib/diagnosis/`는 아직 없다(구조 제안 단계). `lib/pipeline/`(6단계 리서치 파이프라인), `lib/ai/`, `lib/db/`, `lib/observability/`는 B2B 시절 자산으로 decision gate 상태로 보존 중이며, 이 SPEC은 손대지 않는다.

## 2. 의존성 조사

`package.json` 확인 결과:

| 패키지 | 버전 | 이 SPEC에서의 용도 |
|---|---|---|
| `zod` | 4.4.3 | 신규 진단 입력 스키마(`lib/validation/diagnosis-input.ts`) |
| `@base-ui/react` | ^1.7.0 | Modal/Bottom Sheet 프리미티브 |
| `react` / `react-dom` | 19.2.8 | 변경 없음 |
| `next` | 16.3.2 | 변경 없음, App Router 유지 |
| `lucide-react` | ^1.33.0 | 아이콘(경고/체크/오류 등, 디자인 export의 아이콘과 일치) |

**핵심 발견 — `@base-ui/react`에 `dialog`와 `drawer`가 모두 포함되어 있다.** `node_modules/.pnpm/@base-ui+react@1.7.0_.../node_modules/@base-ui/react/` 하위 디렉터리를 직접 나열해 확인:

```
accordion, alert-dialog, autocomplete, avatar, button, checkbox, checkbox-group,
collapsible, combobox, context-menu, csp-provider, dialog, direction-provider,
docs, drawer, field, fieldset, floating-ui-react, form, input, internals, menu,
menubar, merge-props, meter, navigation-menu, number-field, otp-field, popover,
preview-card, progress, radio, radio-group, scroll-area, select, separator,
slider, switch, tabs, toast, toggle, toggle-group, toolbar, tooltip, types,
unstable-use-media-query, use-render, utils
```

`dialog`(Desktop Modal 후보)와 `drawer`(Mobile Bottom Sheet 후보)가 이미 패키지에 포함되어 있으므로, **신규 npm 의존성 추가 없이** `design.md` §14의 Modal/Bottom Sheet 요구사항을 구현할 수 있다. 이는 `tech.md`의 "무료 tier 우선, 불필요한 overengineering 금지" 원칙 및 Enforce Simplicity 원칙(기존 의존성 재사용 우선)과 정합한다.

## 3. 디자인 자료 조사

`design/exports/`(24개 사용자 화면) 중 이 SPEC 대상 10개 전부를 Read 도구로 직접 열람했다: `01-보상-진단-질문-입력.png`, `01-A2-진단-시작-동의.png`, `01-B-추가-질문.png`, `01-C-진단-중.png`, `01-D-결과-없음.png`, `01-E-분석-오류.png`, `M01-질문-입력.png`, `M01-A2-진단-시작-동의.png`, `M01-B-추가-질문.png`, `M01-C-진단-중.png`. `design/internal/`의 2개 DEV ONLY 참고 자료(`DEV-ONLY-01-A3-건강정보-동의-상세-Desktop.png`, `DEV-ONLY-M01-A3-건강정보-동의-상세-Mobile.png`)도 열람했다.

관찰된 핵심 사실:

- 01-A2 Desktop은 화면 중앙 Modal(배경 Dim), M01-A2는 화면 하단에서 올라오는 Bottom Sheet(drag handle 표시)로 명확히 구분되어 있다 — `design/MIGRATION-PLAN.md` §6의 서술과 일치.
- DEV-ONLY 01-A3/M01-A3는 "처리 목적 / 처리하는 건강정보 항목 / 서버 저장 여부 / 보유·이용 기간 / 외부 AI 서비스 전송 여부 / 동의 거부 권리 및 진단 이용 제한" 6개 항목이 모두 `{...확정 문구}` placeholder 상태이며, 캡처 자체에 "확인해도 동의 체크박스는 자동 선택되지 않습니다"라는 문구가 명시되어 있다 — REQ-B2CDIAG-007의 직접적 근거.
- 01-D "결과 없음"에는 "내용을 수정할게요"(주 CTA)와 "손해사정사에게 바로 문의"(보조 CTA) 두 버튼이 있다 — 후자는 03(상담 신청, Out of Scope) 경계 지점으로 `design.md` §18.1에서 stub로 처리하도록 기록했다.
- 01-E "분석 오류"는 "다시 시도"(주 CTA)와 "입력 내용으로 돌아가기"(보조 CTA) 두 버튼이 있으며, "입력하신 내용은 그대로 남아 있으니"라는 문구로 입력값 보존을 명시하고 있다 — REQ-B2CDIAG-014의 직접적 근거.
- M01-D/M01-E(모바일 결과없음/분석오류)에 해당하는 export 파일이 `design/exports/` 목록에 존재하지 않음을 `ls` 명령으로 재확인했다 — `design/MIGRATION-PLAN.md` §9의 "미완료" 기록과 일치.

## 4. 선행 SPEC 산출물 확인

`.moai/specs/SPEC-B2C-FOUNDATION-001/`의 6개 산출물(spec/plan/acceptance/design/research/progress.md)이 모두 `status: completed`로 존재함을 확인했다. `structure.md`(2026-09-18 최종 개정)와 `tech.md`(2026-09-18 최종 개정)를 전체 열람한 결과, 담보 매칭 로직 미결정(§ 담보 매칭 로직 — 미결정 사항)과 `lib/pipeline/` decision gate 보존(REQ-B2CFOUND-007)이 이 SPEC이 관여하지 않아야 할 두 가지 핵심 경계로 확인됐다.

## 5. 배포 기준선 확인

`git log` 최근 커밋 확인: `f7bdae7 fix(deploy): 배포 스모크 체크를 삭제된 /login 대신 공개 진입점 /으로 교체 (#16)`가 `origin/main` HEAD와 일치함을 `git rev-parse --short HEAD` 및 `git rev-list --count --left-right origin/main...HEAD`(결과 `0 0`, 완전 동기화)로 확인했다. 이 SPEC의 plan 브랜치는 이 커밋을 기준으로 생성했다.
