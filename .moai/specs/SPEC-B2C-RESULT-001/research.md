# Research — SPEC-B2C-RESULT-001

이 SPEC의 plan-phase에서 수행한 코드베이스 조사 결과다. 실제 구현은 후속 run-phase의 범위다.

## 1. 조사 범위

- `app/` — 현재 실질 라우트는 `app/page.tsx` 하나뿐. `/result` 세그먼트는 존재하지 않는다.
- `components/diagnosis/` — 01 화면 9개 컴포넌트 + `use-media-query.ts`. `components/result/`는 존재하지 않는다.
- `lib/` — `lib/diagnosis/`는 존재하지 않는다(신설 대상). `lib/validation/diagnosis-input.ts`(01 전용 zod 스키마), `lib/env.ts`(스코프별 환경변수 검증 — `EnvScope`에 `db`/`provision`/`app`/`e2e` 4종만 존재, 02 전용 스코프 불필요).
- `e2e/` — `diagnosis-flow-01.spec.ts` 1개 파일만 존재.
- `scripts/visual-verify.ts` — `SCREENS` 배열에 01 관련 10개 화면(01/01-A2/01-B/01-C/01-D/01-E/M01/M01-A2/M01-B/M01-C)만 정의되어 있다. 02/M02 계열은 없다.
- `design/exports/` — 02/M02 관련 5개 PNG(`02-보상-진단-결과.png`, `M02-보상-진단-결과.png`, `M02-B-결과-정액-담보-탭.png`, `M02-C-결과-후유장해-탭.png`, `M02-D-결과-특별-보상-탭.png`) 존재 확인.

## 2. 기존 자산 재사용 가능성 확인

| 자산 | 재사용 여부 | 근거 |
|---|---|---|
| `@base-ui/react` 1.7.0 | 필요 시 재사용(이 SPEC에서 신규 dialog/drawer 사용처는 없음 — 02는 동의 오버레이가 없다) | SPEC-B2C-DIAGNOSIS-001에서 이미 설치·검증됨 |
| `zod` 4.4.3 | `DiagnosisResult`/`CoverageItem` 런타임 검증(handoff 파싱, REQ-B2CRESULT-014)에 재사용 | 이미 의존성에 존재 |
| `components/diagnosis/use-media-query.ts`(`DESKTOP_MEDIA_QUERY`, 768px) | 그대로 import해 재사용 | 01/02가 동일한 브레이크포인트 정책을 공유해야 하므로(REQ-B2CRESULT-018) 복제 금지 |
| `components/diagnosis/diagnosis-header.tsx`/`diagnosis-footer.tsx` | run-phase가 그대로 재사용할지, 02 전용 변형이 필요한지 디자인 재대조 필요 — `02-보상-진단-결과.png` 상단 탑바에 "카톡 상담" CTA가 추가되어 있어 순수 재사용은 아닐 수 있음(§ 미결정 아님, 단순 구현 세부사항) | design/exports 확인 |
| `components/ui/*` 11종(shadcn 스타일) | `card.tsx`/`status-badge.tsx`/`button.tsx`/`chip.tsx` 등 그대로 재사용 검토 | 01이 이미 검증한 패턴 |

## 3. `mockJudge()` 충돌 조사 (핵심 발견)

`components/diagnosis/step-loading.tsx`의 현재 구현:

```ts
export function mockJudge(input: string): "result-none" | "error" {
  return input.includes("오류") ? "error" : "result-none";
}
```

`e2e/diagnosis-flow-01.spec.ts`에서 사용 중인 고정 입력값:

```ts
const RESULT_NONE_INPUT = "무릎 골절로 수술을 받았어요";
const ERROR_INPUT = "분석 중 오류가 발생했어요";
```

브리프가 제시한 골절 사례 fixture 예시 입력(`step-input.tsx` placeholder·`step-result-none.tsx` 안내 예시와 동일한 문구): `"3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요"`.

**발견**: `RESULT_NONE_INPUT`과 fixture 예시 입력 모두 "골절"이라는 부분 문자열을 공유한다. 만약 신규 fixture 분기를 `input.includes("골절")` 형태의 부분 문자열 키워드로 구현하면, 기존 `RESULT_NONE_INPUT` 테스트 케이스가 더 이상 `result-none`으로 판정되지 않아 SPEC-B2C-DIAGNOSIS-001의 기존 회귀 테스트가 깨진다. `design.md` §4의 정확 문자열 일치(exact match) 결정은 이 조사 결과에 대한 직접적 대응이다.

## 4. `app/page.tsx` 게이트 로직 재확인

`app/page.tsx`는 `productionReady`/`reviewEnabled`/`shouldRenderDiagnosis` 3개 값을 함수 본문 안에서 인라인으로 계산하며, 코드 주석(`@MX:ANCHOR`)이 명시적으로 "이 계산은 다른 어디에도 복제되어 있지 않다"는 불변식을 선언하고 있다. `/result` 라우트가 동일한 게이트 판정을 필요로 하므로, 이 SPEC이 그대로 인라인 복제하면 그 불변식이 깨진다 — `lib/diagnosis/flags.ts` 공유 헬퍼 추출(REQ-B2CRESULT-012)은 이 기존 주석의 요구사항을 지키기 위한 최소 리팩터다.

## 5. 시각 검증 스크립트(`scripts/visual-verify.ts`) 구조 확인

- `SCREENS: readonly ScreenSpec[]` 배열에 화면을 하드코딩으로 나열하는 방식(런타임 추론 없음, 원문 주석: "10개 화면 정의 (런타임 추론 없이 코드에 전부 열거한다)"). 02/M02 5개 화면도 동일한 패턴(`ScreenSpec` 객체 5개 추가)으로 확장 가능함을 확인.
- `startProductionServer()`가 `ENABLE_DIAGNOSIS_DEV_STATES: "true"`를 프로세스 env에 주입한 상태로 `pnpm build` + `pnpm start`를 실행 — `/result?devFixture=fracture` 같은 review 전용 파라미터도 이 실행 하나로 함께 캡처 가능(별도 서버 기동 불필요).
- `[HARD] audit-ready 근거가 되는 measurements.json은 제약 없는 전체 화면 실행에서만 갱신된다` — 이 SPEC의 신규 5화면도 이 제약을 그대로 따른다(`VISUAL_ONLY` 등으로 골라 실행한 결과는 `measurements.partial.json`).

## 6. 환경변수 스코프 확인

`lib/env.ts`의 `EnvScope`(`"db" | "provision" | "app" | "e2e"`)에 02 전용 신규 변수를 추가할 필요가 없음을 확인 — 이 SPEC은 `ENABLE_DIAGNOSIS_DEV_STATES`(REQ-B2CDIAG-017, 이미 선언된 서버 전용 플래그)를 그대로 재사용하며 `app`/`e2e` 스코프에 새 필수 변수를 추가하지 않는다.

## 7. `DiagnosisHandoff` 선행 타입 확인

`SPEC-B2C-DIAGNOSIS-001/design.md` §9가 다음 인터페이스를 "미구현 참고용"으로 예고했다:

```ts
interface DiagnosisHandoff {
  rawInput: string;
  answers: Record<string, string>;
}
```

이 SPEC의 `DiagnosisResult`(§1)는 이 두 필드를 그대로 포함하며, `items`(담보 목록)와 `generatedAt`을 추가로 확정한다 — 선행 SPEC의 예고와 필드 이름이 어긋나지 않도록 정합성을 맞췄다.
