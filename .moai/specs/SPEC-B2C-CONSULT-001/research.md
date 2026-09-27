# Research — SPEC-B2C-CONSULT-001

## 1. 조사 범위

이 SPEC(03 상담 신청 및 접수 결과)의 plan-phase 착수 전 직접 조사한 항목:

- `design/MIGRATION-PLAN.md`, `.moai/project/product.md`, `.moai/project/structure.md` 전체 재열람
- `design/exports/03-*.png`(Desktop 5개), `design/exports/M03-*.png`(Mobile 4개), `design/internal/DEV-ONLY-상담-신청-동의-상세-구조.png` 직접 이미지 열람
- `lib/diagnosis/{types,schema,handoff,flags}.ts` — 01→02 계약·인계·게이트 패턴
- `components/result/result-cta-bar.tsx`, `app/result/page.tsx` — 02의 CTA stub·라우트 셸 패턴
- `lib/db/schema.ts`, `db/migrations/` — 기존 Drizzle 관례
- `lib/env.ts` — 환경변수 스코프 검증 관례
- `git show 257d033^:app/api/cases/route.ts` — 삭제된 B2B API route handler의 실제 구현(Next.js route handler 관례 확인용, B2B 로직 자체는 재사용 대상이 아님)
- `scripts/visual-verify.ts`(2338줄, 15화면 정의) — 화면 등록·측정·semanticChecks 관례
- `package.json`, `.moai/config/sections/quality.yaml`(`development_mode: tdd`)
- `.moai/specs/SPEC-B2C-RESULT-001/{spec,plan,acceptance,design,progress}.md` — 직전 SPEC의 문서 포맷·REQ/AC 스타일·결정 기록 관례

## 2. 기존 자산 재사용 가능성 확인

| 자산 | 재사용 방식 |
|---|---|
| `lib/diagnosis/types.ts` `DiagnosisResult`/`CoverageItem` | **읽기 전용 참조**만 한다 — 03은 이 타입을 import해 `resultId`와 집계 데이터에 접근할 뿐, 새 필드를 추가하거나 구조를 변경하지 않는다 |
| `lib/diagnosis/aggregate.ts` `computeAggregate(items)` | 03의 "진단 결과 요약" 카드(검토 대상/추가 정보 필요 개수, "가능성 낮음 N개 포함 총 M개")가 그대로 재사용한다 — 03에서 이 계산을 다시 구현하지 않는다 |
| `lib/diagnosis/handoff.ts` `readDiagnosisHandoff()`/`clearDiagnosisHandoff()` | 03은 **동일한 함수**를 그대로 호출한다 — 02→03 전용의 별도 "진단 결과 인계" 채널을 새로 만들지 않는다(§3 참고, 새로 필요한 것은 상담 폼 자체의 임시 draft 저장뿐) |
| `lib/diagnosis/flags.ts` `computeDiagnosisFlags(env)` | 패턴(순수 함수 + `env.X === "true"` 문자열 비교 + 공유 헬퍼)을 재사용하되, 03 전용 신규 플래그(`ENABLE_CONSULT_FLOW`)를 위한 별도 export 함수를 **같은 파일에** 추가한다(REQ-B2CRESULT-012가 확립한 "게이트 계산은 공유 헬퍼 하나로" 원칙의 연장) |
| `components/diagnosis/use-media-query.ts` `DESKTOP_MEDIA_QUERY`(768px) | 03도 동일한 768px 분기점을 그대로 재사용한다 — 새 브레이크포인트를 도입하지 않는다 |
| `components/ui/*` 11종 + `@base-ui/react` | 폼 입력·체크박스·모달/바텀시트 컴포넌트 재사용 검토(run-phase에서 실제 컴포넌트 존재 여부 최종 확인) |
| `zod` 4.4.3 | 신규 `lib/consult/schema.ts`가 `lib/diagnosis/schema.ts`와 동일한 `z.strictObject` 원칙으로 작성한다 |
| `drizzle-orm`/`drizzle-kit`(Turso/libSQL) | `lib/db/schema.ts`에 `consultations` 테이블을 추가하고 `pnpm db:generate`로 마이그레이션을 생성한다(§6 참고) |

## 3. `git show 257d033^:app/api/cases/route.ts` — 삭제된 API route 조사 (핵심 발견)

SPEC-B2C-FOUNDATION-001이 삭제하기 전 `app/api/cases/route.ts`(B2B 사건 접수 API)가 이 프로젝트의 유일한 실제 Next.js Route Handler 참고 사례였다. 발견한 관례:

- `import { NextResponse, type NextRequest } from "next/server"`, `export async function POST(request: NextRequest)` 표준 형태.
- 요청 시작 시점 최소 구조적 로그: `console.info(JSON.stringify({ event: "...", timestamp, ...PII 없는 값 }))` — 원문 입력을 로그에 절대 포함하지 않음.
- 세션·존재 확인 실패는 표준 `NextResponse.json({ error: "..." }, { status: N })`로 분기(401/409/400 각각 별도 분기).
- 응답은 `NextResponse.json({ ... }, { status: N })` 하나의 패턴으로 통일.
- `lib/logging/safe-error.ts`의 `toSafeErrorMeta(error)`로 에러 로깅 시 스택/민감정보를 걸러낸다(03의 API route도 동일 패턴을 재사용할 수 있다 — 파일 자체는 삭제되지 않고 현재도 `lib/logging/`에 존재).
- `export const maxDuration = N`으로 route segment 실행 시간 상한을 명시.

**이 SPEC이 이 관례에서 재사용하는 것**: `NextResponse.json` 표준 응답 패턴, PII 없는 구조적 로그, `toSafeErrorMeta`. **재사용하지 않는 것**: 세션/인증 검사(B2C 03은 로그인 없는 공개 접근 전제, `product.md` § PII 정책), `after()` 백그라운드 처리(상담 신청 DB 기록은 즉시 완료되는 짧은 동기 작업이라 필요 없음).

## 4. `components/result/result-cta-bar.tsx` 현재 구조 재확인

4개 CTA(`result-cta-top`/`result-cta-disability-button`/`result-cta-final-kakao`/`result-cta-final-phone`)가 모두 `usePreparingButton()` 공유 훅으로 `aria-disabled="true"` + no-op 클릭/키보드 핸들러 + `role="status"` 안내 span을 렌더링한다. `ResultTopBarCta`/`ResultDisabilitySectionCta`는 채널 구분이 없는 단일 스타일 버튼이고, `ResultFinalCta`만 카카오/전화 두 버튼으로 이미 분리되어 있다 — 이 구분이 03 진입 시 초기 채널 값 결정에 그대로 대응된다(§ CTA 활성화 계약 참고).

## 5. `scripts/visual-verify.ts` 구조 확인

`SCREENS: readonly ScreenSpec[]` 배열에 15개 항목(01 계열 10개 + 02 계열 5개)이 하드코딩되어 있다. 각 `ScreenSpec`은 `id`/`label`/`platform`/`viewport`/`designExport`/`screenshotName`/`prepare`(page 준비 함수)/`elements`(픽셀 비교 대상)/`semanticChecks`(존재·상태 텍스트 검증)로 구성된다. `gotoResultFixture`가 `?devFixture=fracture` 쿼리로 02를 결정론적으로 캡처하는 선례가 있다 — 03도 동일한 패턴(`?devFixture=fracture&channel=...` 또는 02에서 CTA 클릭으로 진입)으로 결정론적 캡처 진입점을 설계할 수 있다(§ 시각 검증 계획 참고). 기존 10화면(01 계열)과 5화면(02 계열)은 이 SPEC이 절대 수정하지 않는다.

## 6. 환경변수 스코프 확인

`lib/env.ts`의 `REQUIRED_BY_SCOPE`/`VAR_INFO`는 DB·인증·Gemini 관련 변수만 다루며, `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY`/`ENABLE_DIAGNOSIS_DEV_STATES` 같은 기능 플래그는 이 검증 대상에 포함되지 않는다(값이 없으면 단순히 falsy로 취급되어 게이트가 닫힌다) — 이 SPEC이 신설하는 `ENABLE_CONSULT_FLOW`도 동일한 방식(선택적, 미설정 시 기본 false)을 따르며 `lib/env.ts`의 필수 변수 목록에 추가하지 않는다.

## 7. `DiagnosisHandoffReadResult` 3갈래 판별 유니언 확인

`readDiagnosisHandoff()`는 `{status:"empty"}` / `{status:"valid";result}` / `{status:"invalid";reason}` 3갈래를 반환하며, 읽기만 하고 어떤 분기에서도 `sessionStorage`를 변경하지 않는다. 03은 이 3갈래를 **그대로 재사용**한다 — 새로 "03 전용 결과 없음/오류" 판정 로직을 만들지 않고, `readDiagnosisHandoff()`의 반환값을 직접 분기해 02와 동일한 무결성 보장(새로고침·뒤로가기 시 동일 결과 재현)을 상속한다.

## 8. `lib/db/schema.ts` 현재 구조 확인 (신규 발견 — 이 SPEC 고유 조사)

기존 스키마는 B2B 시절 테이블(`user`/`session`/`account`/`verification`/`cases`/`evidence`/`reports`/`feedback`/`allowedTesters`/`reservations`/`caseJobs`/`geminiRequestObservations`) 12개를 그대로 보존하고 있다 — Better Auth 관련 테이블(`user`/`session`/`account`/`verification`)은 `lib/auth/**` 코드는 삭제됐지만 스키마 자체는 삭제되지 않은 상태다(SPEC-B2C-FOUNDATION-001 progress.md에 기록되지 않은 잔여 — 이 SPEC의 범위 밖이므로 손대지 않는다). 확인한 명명 관례:

- 테이블명: 소문자 스네이크케이스가 아니라 **camelCase 변수명**(`sqliteTable("case_jobs", {...})`처럼 변수는 camelCase, DB 컬럼명 문자열은 snake_case).
- 컬럼: `text("id").primaryKey()`, `integer("created_at", { mode: "timestamp" }).notNull()`, JSON 페이로드는 `text("field", { mode: "json" })`, FK는 `.references(() => other.id, { onDelete: "cascade" })`.
- status 컬럼은 `text("status").notNull().default("pending")` 패턴(문자열 enum, DB 레벨 CHECK 제약 없음 — 애플리케이션 코드가 유효값을 강제).
- 신규 테이블은 파일 하단에 순서대로 추가되며 각 테이블 위에 그 테이블이 속한 SPEC과 설계 근거를 한글 주석으로 남긴다.

이 SPEC이 추가할 `consultations` 테이블은 이 관례를 그대로 따른다(§ 서버 API·저장소 계약 참고).

## 9. 결론 — 이 SPEC이 새로 결정해야 하는 것과 상속하는 것

**상속(이미 확립됨, 재확인만 필요)**: `DiagnosisResult` 데이터 계약, `readDiagnosisHandoff`/`clearDiagnosisHandoff`, 768px 브레이크포인트, `z.strictObject` 원칙, Drizzle 명명 관례, `computeDiagnosisFlags`류 공유 게이트 헬퍼 패턴, `NextResponse.json` API 응답 패턴, `visual-verify.ts`의 화면 등록 구조, TDD 개발 모드(`quality.yaml`).

**신규 결정(이 SPEC의 plan-phase가 확정)**: 02→03 CTA 전달 메커니즘, 상담 폼 데이터 계약(`lib/consult/`), 동의 구조 UI 상태, 서버 API 계약(`POST /api/consultations`), `consultations` 저장 스키마, 중복/멱등성 정책, 성공/중복/실패 3상태 UI 계약, 03 전용 플래그(`ENABLE_CONSULT_FLOW`) 형태 — 상세는 `design.md`.
