# Design — SPEC-B2C-CONSULT-001

## 0. 아키텍처 요약

03은 02(`app/result/page.tsx`)와 동일한 셸 패턴(Server Component 게이트 + `<Suspense>` + client `*View` 컴포넌트)을 따르는 신규 라우트 `app/consult/page.tsx`다. `DiagnosisResult`는 02가 이미 확립한 `readDiagnosisHandoff()`를 그대로 재사용해 참조하며(재계산·재파싱 없음), 03이 새로 추가하는 상태는 (a) 상담 폼 임시 draft(`lib/consult/draft.ts`, sessionStorage), (b) 서버 제출 결과 뿐이다. 서버 측은 신규 `POST /api/consultations` route handler + `consultations` Drizzle 테이블 하나만 추가한다.

## 1. 디자인 vs 문서 대조 — 불일치 로그

`design/MIGRATION-PLAN.md`, `product.md`, `design/exports/*.png`, `design/internal/*.png`를 상호 대조한 결과다. 각 항목을 (a) 사용자 결정이 필요한 항목과 (b) 이번 plan-phase에서 구현자로서 근거를 남기고 지금 해소하는 항목으로 나눈다.

### 1a. 지금 해소함 (구현자 판단 + 근거)

| # | 불일치 | 해소 |
|---|---|---|
| D1 | `MIGRATION-PLAN.md` §2③ 표는 `03`(`Uli7t`)과 `03-A2`(`EhyPu`)를 서로 다른 노드 ID를 가진 **별개 화면**으로 나열한다. `product.md`도 "03 상담 신청 → [상담 동의] → 03-A2 전화 선택"이라 순차 네비게이션처럼 서술한다. | `design/exports/03-*.png`와 `03-A2-*.png`를 직접 픽셀 대조한 결과 두 파일은 레이아웃·구성 요소가 완전히 동일하고, 오직 채널 라디오 선택 상태(카카오톡 선택 vs 전화 선택)와 "연락 희망 시간" 필드의 필수 여부만 다르다. **이 SPEC은 03과 03-A2를 별도 라우트가 아니라 동일 컴포넌트의 `channel` state 두 값(`"kakao"`/`"phone"`)으로 구현한다** — Pencil 디자인 툴에서 상태별로 프레임을 복제해 내보낸 것일 뿐, 실제 앱에서 별도 페이지 전환은 없다. Mobile 쌍에 `M03-A2`가 애초에 존재하지 않는다는 사실(§2④ 표에 없음, 실제 `design/exports/` 확인 결과 9개 파일 중 Mobile은 M03/M03-B/M03-C/M03-D 4개뿐)이 이 해석을 뒷받침한다 — `M03` 한 화면이 두 채널 상태를 이미 하나로 표현하고 있다. |
| D2 | `MIGRATION-PLAN.md` §7: "중복 판정 기준(동일 진단 결과 ID **또는** 동일 연락처)은 서버에서 내려준다"고 명시(단순 OR). | 미션이 지적한 대로 단순 OR는 과차단 위험이 크다(같은 연락처를 쓰는 가족 구성원이 다른 사고를 접수하는 경우, 동일인이 새 사고로 재상담하는 경우 모두 막힘). **이 SPEC은 §7 서버 판정 로직을 §8 "중복/멱등성" 설계로 대체한다** — `resultId + 정규화 연락처` 복합 조건(AND)을 비즈니스 중복 판정으로, 별도의 `idempotencyKey` UNIQUE 제약을 기술적 멱등성으로 분리한다(상세: §8). 이 편차는 사용자에게도 알림(Open Decision 목록 참고, 차단 목적이 아닌 확인 목적). |
| D3 | 디자인은 "정하은 손해사정사 · 금융감독원 등록 손해사정사 · 등록정보 확인" 카드로 **특정 담당자**를 미리 배정해 보여준다. | `product.md` §Roadmap A와 이 SPEC의 Out of Scope(§7)가 명시하듯 자동 상담사 배정은 범위 밖이다. 이 SPEC은 이 카드를 **정적 placeholder**("상담 담당자 배정 예정" 수준의 일반 문구, 실명·특정 개인 자격 정보 없이)로 구현한다 — 실제 배정 로직이나 담당자별 데이터 모델은 만들지 않는다. |
| D4 | 03-B 성공 화면·03-C 중복 화면의 "신청 취소·정보 삭제 문의"/"기존 신청 상태 확인" CTA가 실제 목적지 없이 디자인에만 존재한다. | 기존 `components/result/result-footer.tsx`가 이미 확립한 선례(`href="#"` + "고객 문의: 준비 중")를 그대로 따른다 — 두 CTA 모두 **"준비 중" 스텁**으로 구현하고 죽은 링크(예: 빈 `href="#"`를 실제 이동처럼 보이게 만드는 것)를 만들지 않는다. 실제 신청 상태 조회 기능은 이 SPEC의 범위 밖이다(§7). |
| D5 | `design/internal/DEV-ONLY-상담-신청-동의-상세-구조.png`의 `{}` 플레이스홀더(보유·이용기간, 수신정보, 이용목적, 수신방법, 동의철회방법)가 사용자 화면에 노출될 위험. | 이 SPEC은 동의 항목의 **구조**(체크박스·필수/선택 라벨·"자세히 보기" 토글 UI 상태)만 구현하고, 상세 펼침 내용의 실제 법무 확정 문구는 구현하지 않는다 — "자세히 보기"를 눌렀을 때 실제 서버가 어떤 문구를 내려줄지는 Open Decision(§9)으로 남기고, run-phase에서는 확정 전까지 상세 펼침 UI 자체를 `CONSULT_POLICY_READY` 조건으로 게이트한다(§4). |
| D6 | 03-B 성공 화면의 "영업일 기준 1일 이내에 선택하신 방법으로 연락드립니다" 문구가 실제 운영 SLA 확정 없이 구체적 시간 약속처럼 읽힐 위험(독립 검토 지적) — 운영 근거 없는 연락 시점 약속은 이 프로젝트가 이미 피하려던 것(§ 원래 D5 해소 근거)과 같은 종류의 문제다. | 문구를 "접수 내용을 확인한 뒤 선택하신 방법으로 연락드리겠습니다"로 교체한다 — 시간 약속을 전혀 하지 않는 중립 표현(§10). API 응답의 `expectedContactWindow` 필드는 제거한다 — 실제 ops SLA가 확정되면 별도 SPEC에서 선택적 필드로 재도입을 검토한다. |

### 1b. 사용자 결정 필요 (Open Decisions로 이관)

D5의 실제 법무 문구, 등록정보 확인 링크의 실제 목적지, 제3자 제공 동의 활성화 시점, "기존 신청 상태 확인" 페이지 실제 구현 여부 — 모두 `progress.md` § Open Decisions for User에 목록화한다.

## 2. 사용자 흐름 계약

```
02 CTA 클릭(channel 암시)
  → /consult?channel=kakao|phone 진입
  → (핸드오프 검증: empty→no-data / invalid→error / valid→계속)
  → 03 화면: 진단 결과 요약(재사용) + 채널 선택 + 입력 폼 + 동의
  → 제출(이중 클릭 방지) → POST /api/consultations
  → 응답 분기: success | duplicate | error(validation/rate_limited/server_error)
  → 03-B / 03-C / 03-D 렌더링
  → "진단 결과로 돌아가기"(모든 상태 공통) 또는 재시도(03-D만)
```

### 2.1 `/consult` 라우트

`app/page.tsx`/`app/result/page.tsx`와 동일한 "루트 직속 배치" 관례를 따른다(`app/(diagnosis)/consult/` 같은 별도 라우트 그룹을 만들지 않는다 — `structure.md` § 목표 구조가 제안했던 그룹 없이, 01/02가 이미 확정한 실제 경로 관례를 03도 그대로 잇는다).

### 2.2 02→03 핸드오프 — `DiagnosisResult`는 재사용, 신규 채널은 "draft"뿐

**핵심 결정**: 03은 `DiagnosisResult`를 위한 **새 인계 채널을 만들지 않는다**. `lib/diagnosis/handoff.ts`의 `readDiagnosisHandoff()`를 03도 그대로 호출한다 — 02가 이미 사용 중인 `sessionStorage` 키(`bosang-radar:diagnosis-handoff-v1`)를 그대로 읽는다. 새로고침·뒤로가기·02 경유 없는 직접 진입 세 경로 모두 02와 동일한 3갈래(`empty`/`valid`/`invalid`)로 처리되며, 03이 이 판정 로직을 다시 구현하지 않는다.

03이 새로 추가하는 것은 **상담 폼 자신의 임시 상태**(이름·연락처·채널 선택·연락 희망 시간·마케팅 동의 체크 여부·제출용 idempotencyKey)를 위한 별도의 얕은 draft 저장뿐이다.

| 항목 | 계약 |
|---|---|
| 최소 필요 데이터 | 03이 화면을 그리는 데 필요한 것은 `resultId`(참조용, 검증 불가 — §8 잔여 위험 참고)와 `computeAggregate(items)` 결과뿐이다. `items` 전체 배열은 화면에 표시되지 않으므로(요약 카드만) 렌더링 시 `DiagnosisResult`를 직접 전달하되 컴포넌트는 `resultId`/집계 결과/`inputSummary.title`만 실제로 읽는다. |
| `resultId` 사용 | 상담 제출 페이로드의 `resultId` 필드로 그대로 전달된다(§6). 03 자체는 이 값을 검증하지 않는다(핸드오프가 `valid`면 스키마 통과가 이미 보장됨). |
| 새로고침·뒤로가기 | 02와 동일 — `sessionStorage` 데이터가 유지되므로 동일한 결과가 재현된다. 단, 상담 **폼 입력값**은 draft(§2.3)에서 별도로 복원된다. |
| 직접 `/consult` 진입(02 미경유) | `readDiagnosisHandoff()`가 `{status:"empty"}`를 반환하면 03 전용 "먼저 진단 결과가 필요합니다" no-data 상태를 표시하고 01 입력 화면으로 돌아가는 CTA를 제공한다(REQ-B2CCONSULT-007, 02의 REQ-B2CRESULT-013과 동형). |
| 핸드오프 부재 | 위와 동일(no-data). |
| JSON 파싱 실패 | `{status:"invalid"}` → 03 전용 오류 상태(REQ-B2CCONSULT-008, 02의 REQ-B2CRESULT-014와 동형). |
| 스키마 버전 불일치 | `DiagnosisResultSchema.safeParse`가 이미 `schemaVersion` 리터럴을 강제하므로 `invalid`로 귀결 — 03이 별도 버전 검사를 추가하지 않는다. |
| 오래된 결과의 사용 가능 여부 | 02가 이미 확립한 "탭 세션 동안 유지, 명시적 트리거 전까지 만료 없음" 정책을 그대로 상속한다 — 03은 별도의 신선도(TTL) 개념을 도입하지 않는다(신규 신선도 게이트를 만드는 것은 02가 이미 내린 결정을 재검토하는 것이므로 이 SPEC의 범위 밖으로 둔다). |
| 상담 신청 완료 후 draft 삭제 | 제출 성공 시 `clearConsultationDraft()`를 호출한다(REQ-B2CCONSULT-025, §2.3) — **`DiagnosisResult` 핸드오프 자체는 삭제하지 않는다.** 이유: 성공·중복·실패 화면 모두 "진단 결과로 돌아가기" CTA를 제공하며(§10), 이 CTA로 `/result`에 복귀했을 때 제출 이전과 동일한 결과가 다시 보여야 한다(REQ-B2CCONSULT-009 원칙의 연장) — 핸드오프를 지우면 이 복귀 경로가 깨진다. `DiagnosisResult` 핸드오프는 아래 행의 기존 정책(새 진단 시작 시 `clearDiagnosisHandoff()`)에 의해서만 계속 제거된다. |
| 새 진단 시작 시 draft 초기화 | `components/diagnosis/diagnosis-flow.tsx`의 기존 "새 진단 시작" 액션이 이미 `clearDiagnosisHandoff()`를 호출한다 — 이 SPEC은 그 호출 지점에 `clearConsultationDraft()`(§2.3) 호출을 한 줄 추가한다(§5 허용된 기존 파일 확장 목록 참고). |

### 2.3 상담 폼 draft — `lib/consult/draft.ts`

`lib/diagnosis/handoff.ts`와 동일한 구조(SSR 가드, 프로젝트 네임스페이스 키, 명시적 트리거로만 제거)를 상속하되, **엄격도는 완화**한다 — draft는 사용자 입력 편의를 위한 비결정적 보조 데이터이지 `DiagnosisResult`처럼 무결성이 보장되어야 하는 계약이 아니기 때문이다.

- 키: `bosang-radar:consultation-draft-v1`.
- 스키마: `ConsultationDraftSchema`(`lib/consult/schema.ts`) — **`z.strictObject`**로 정의한다(알 수 없는 키 거부). 명시적 `draftVersion: z.literal(1)`(또는 그 시점의 현재 버전 리터럴) 필드를 필수로 포함하며, 그 외 저장 필드(`channel`/`name`/`contactRaw`/`preferredCallTime`/`marketingConsent`/`idempotencyKey`)는 모두 `.optional()`이다 — strict(알 수 없는 키·구버전 거부) + 개별 필드 optional(폼 진화에 유연 대응) 두 원칙을 동시에 만족한다. **필수 동의 두 항목의 체크 상태는 draft에 저장하지 않는다** — 새로고침 후에도 매번 다시 명시적으로 체크해야 한다(동의 재확인 원칙, §3 참고).
- 파싱 실패(손상된 JSON), 스키마 검증 실패(알 수 없는 키 포함), 또는 `draftVersion`이 현재 버전과 다를 때 — 어느 경우든 02의 `handoff.ts`처럼 `invalid` 오류 상태로 분기하지 **않는다** — 오류를 던지지 않고 조용히 빈 draft로 폴백한다(폼이 비어있는 것으로 시작할 뿐, 사용자가 진단 결과 자체를 잃는 것이 아니므로 오류 상태로 만들 만큼 치명적이지 않다는 판단, Enforce Simplicity).
- 저장 시점: 필드 blur 또는 제출 시도 시(매 keystroke마다 쓰지 않음 — 불필요한 쓰기 최소화).
- 제거 시점: (a) 상담 신청 성공 시 `clearConsultationDraft()`, (b) 새 진단 시작 시(§2.2).
- `idempotencyKey`: draft가 최초 생성될 때(폼 마운트 시) `crypto.randomUUID()`로 1회 생성되어 draft에 저장된다 — 실패 후 재시도 시에도 **같은 키**를 재사용한다(§8).

## 3. CTA 활성화 계약

`components/result/result-cta-bar.tsx`의 4개 stub을 다음과 같이 실제 네비게이션으로 전환한다(REQ-B2CCONSULT-003). 전달 메커니즘은 **URL 쿼리 파라미터 하나**(`?channel=kakao|phone`)로 확정한다 — 별도 sessionStorage draft 쓰기를 CTA 클릭 시점에 선행시키지 않는다(단순성 사다리: 이미 있는 네비게이션 메커니즘으로 충분한데 추가 저장 계층을 두지 않는다).

| CTA | 위치 | 전달 `channel` |
|---|---|---|
| `ResultTopBarCta` | 상단 탑바 "카카오톡 상담" | `kakao`(명시적) |
| `ResultDisabilitySectionCta` | 후유장해 섹션 "상담 신청하기" | (미지정 — 중립 CTA) → 03이 정책 기본값 적용 |
| `ResultFinalCta` 카카오 버튼 | 하단 최종 | `kakao`(명시적) |
| `ResultFinalCta` 전화 버튼 | 하단 최종 | `phone`(명시적) |

**정책 기본값**: `channel` 쿼리가 없거나 `"kakao"`/`"phone"` 둘 중 하나가 아닌 값(위변조·오타)일 때 03은 **`"kakao"`로 폴백**한다 — 모든 디자인 화면에서 카카오톡이 먼저 선택된 상태로 표시되는 것과 일치하며, 오류를 던지거나 빈 화면을 보여주지 않는다(REQ-B2CCONSULT-004).

**02 플래그 OFF일 때의 CTA 동작**: 03 플래그(`ENABLE_CONSULT_FLOW`, §4)가 꺼져 있으면 CTA는 02가 **이미 갖고 있는 현재 "준비 중" stub 동작을 독립적으로 유지**한다 — 02 자체 게이트(`shouldRenderDiagnosis`)와 03 게이트는 서로 다른 플래그이며, 하나가 켜진다고 다른 하나가 자동으로 열리지 않는다(REQ-B2CCONSULT-005). 이 선택 이유: 02는 이미 `completed` 상태로 배포되어 있으므로, 향후 담보 매칭 엔진이 켜지는 시점(`DIAGNOSIS_ENGINE_READY` 전환)에 03이 원치 않게 함께 열리는 부작용을 막는다.

## 4. 기능 플래그 — `lib/diagnosis/flags.ts` 확장

`computeDiagnosisFlags(env)`와 같은 파일에 `computeConsultFlags(env)`를 추가한다(REQ-B2CCONSULT-005, 02의 REQ-B2CRESULT-012 "게이트 계산은 공유 헬퍼 하나로" 원칙의 연장 — 03 전용 신규 파일을 만들지 않는다).

```
computeConsultFlags(env) → { shouldRenderConsult: boolean; isPolicyReady: boolean }
shouldRenderConsult = isFlagEnabled(env.ENABLE_CONSULT_FLOW)
isPolicyReady = isFlagEnabled(env.CONSULT_POLICY_READY)
```

두 플래그는 서로 다른 질문에 답하는 **독립된 두 계약**이다 — 하나가 "코드가 배포되어 있는가"를 묻고, 다른 하나가 "실제로 개인정보 수집을 시작해도 되는가"를 묻는다. 이전 초안이 이 둘을 단일 플래그로 뭉뚱그렸던 것(§ 구 `productionReady` 미분화 상태)을 이 SPEC이 명시적으로 분리한다:

- **`ENABLE_CONSULT_FLOW`**: "코드/화면이 배포되어 리뷰 가능한가"만 게이트한다. `"true"` 문자열만 참으로 취급하는 동일한 판정 함수(`isFlagEnabled`)를 재사용한다. `app/consult/page.tsx`가 `shouldRenderConsult`가 거짓이면 01/02와 동일한 "서비스 준비 중" placeholder를 표시한다.
- **`CONSULT_POLICY_READY`**: "실제로 개인정보 수집을 시작해도 되는가"(법무·운영 확정 여부, §9 Open Decision과 연결)만 게이트한다. `ENABLE_CONSULT_FLOW`가 참이라도 이 값이 거짓이면 03 화면 자체는 렌더링되지만 실제 제출은 불가능하다(아래 조합표, §6.1).

| `ENABLE_CONSULT_FLOW` | `CONSULT_POLICY_READY` | 동작 |
|---|---|---|
| `false` | (무관) | 02 CTA는 기존 "준비 중" stub 동작을 그대로 유지한다(REQ-B2CCONSULT-005). |
| `true` | `false` | 03 화면은 리뷰 가능하지만 실제 제출은 불가능하다 — 클라이언트는 제출 버튼을 실제 제출 대신 안내로 대체하고, 서버는 독립적으로 저장을 거부한다(503/`policy_unavailable`, §6.1, §9.1). |
| `true` | `true` | 실제 상담 신청 제출이 가능하다. |

이 SPEC의 `ENABLE_CONSULT_FLOW`는 "코드가 배포됐는지"만 게이트하고, "동의 문구가 법무 확정됐는지"는 게이트하지 않는다(두 조건을 혼동하지 않는다) — 후자는 `CONSULT_POLICY_READY`의 몫이다.

### 4.1 리뷰/개발 환경에서 실사용자 PII 오염 방지

이 프로젝트는 Oracle Cloud 단일 VM에 GitHub Actions로 직접 배포하는 구조이며 별도로 격리된 프리뷰 환경이 없다(`tech.md` § Oracle Cloud Always Free VM, `research.md` §6). 이 조건에서 리뷰 산출물(시각 회귀 스크린샷)이 실제 프로덕션 API를 호출해 진짜 레코드를 만들 위험을 두 겹으로 막는다:

1. **1차 방어(클라이언트 설계)**: `pnpm visual:verify`의 `03`/`M03` 스크린샷은 폼을 채우기만 하고 실제로 제출 버튼을 누르지 않는다(§12) — `03-B`/`03-C`/`03-D`(성공/중복/실패) 상태 스크린샷은 `devConsultState` 쿼리 파라미터로 결정론적으로 렌더링되는 **클라이언트 전용 우회 경로**이며 실제 `POST /api/consultations` 호출을 전혀 발생시키지 않는다(§12, 기존 계약 유지).
2. **2차 방어(서버 자체 검증)**: 리뷰어가 실수로 실제 폼을 수동 제출하더라도, 서버는 클라이언트가 보낸 어떤 값도 신뢰하지 않고 자기 자신의 환경 변수 `CONSULT_POLICY_READY`를 직접 확인한다(§6.1) — 법무 확정 전까지는 프로덕션 환경에서도 이 값을 `false`로 유지하므로, 실제 PII 레코드는 이 값이 명시적으로 `true`로 전환되기 전까지 어떤 경로로도 저장되지 않는다.

## 5. 신규 파일 트리 + 허용된 기존 파일 확장

```
app/
├── consult/
│   ├── page.tsx                          [신규] Server Component 셸(게이트 + Suspense)
│   └── page.test.tsx                     [신규]
└── api/
    └── consultations/
        └── route.ts                      [신규] POST 핸들러

components/consult/
├── consult-view.tsx                      [신규] "use client" — 마운트 시 핸드오프+draft 조회, 상태 분기
├── consult-summary-card.tsx              [신규] 진단 결과 요약(computeAggregate 재사용)
├── consult-channel-selector.tsx          [신규] 카카오톡/전화 라디오
├── consult-form.tsx                      [신규] 이름/연락처/연락 희망 시간
├── consult-consent-group.tsx             [신규] 필수 2 + 선택 1 동의, 상세 보기(Modal/BottomSheet)
├── consult-submit-bar.tsx                [신규] 제출 CTA + 이중 제출 방지
├── consult-success.tsx                   [신규] 03-B/M03-B
├── consult-duplicate.tsx                 [신규] 03-C/M03-C
├── consult-failure.tsx                   [신규] 03-D/M03-D
├── consult-no-data.tsx                   [신규] 핸드오프 부재
├── consult-error.tsx                     [신규] 핸드오프 파싱/스키마 오류
└── *.test.tsx                            [신규] 각 컴포넌트 대응 테스트

lib/consult/
├── types.ts                              [신규] ConsultationRequest/Channel/Consent/SubmitResult
├── schema.ts                             [신규] zod 스키마(제출용 strict + draft용 loose)
├── draft.ts                              [신규] sessionStorage draft read/write/clear
├── phone.ts                              [신규] 연락처 정규화/표시 포맷/마스킹
├── dedupe.ts                             [신규] 정규화 연락처 기반 비즈니스 중복 키 도출(순수 함수, 서버·클라이언트 공유 가능)
└── *.test.ts                             [신규]

e2e/
└── consult-flow-03.spec.ts               [신규]

db/migrations/
└── 000N_*.sql                            [신규] `pnpm db:generate` 산출물(파일명은 drizzle-kit이 결정)
```

**허용된 기존 파일 최소 확장(정확히 5개, `plan.md` §D 제약)**:

1. `components/result/result-cta-bar.tsx` — 4개 stub 버튼을 실제 `<Link href={...}>` 네비게이션으로 교체(`aria-disabled`/no-op 핸들러 제거, `shouldRenderConsult`가 거짓이면 기존 stub 동작 유지).
2. `components/diagnosis/diagnosis-flow.tsx` — 새 진단 시작 액션의 기존 `clearDiagnosisHandoff()` 호출 옆에 `clearConsultationDraft()` 호출 한 줄 추가.
3. `lib/diagnosis/flags.ts` — `computeConsultFlags(env)` export 함수 추가(§4).
4. `scripts/visual-verify.ts` — `SCREENS` 배열에 9개 항목 **추가**(기존 15개 항목 수정 금지, §10).
5. `lib/db/schema.ts` — `consultations` 테이블 정의 추가(§6, 기존 12개 테이블 정의는 수정하지 않는다).

## 6. 상담 데이터 계약 (`lib/consult/types.ts` + `schema.ts`)

```
ConsultationChannel = "kakao" | "phone"

ConsultationConsent (클라이언트 → 서버 페이로드):
  { piiCollection: true (literal)       # 상담 신청을 위한 개인정보 수집·이용 동의(필수)
    healthInfoUse: true (literal)       # 진단 결과 등 건강정보의 상담 이용 동의(필수)
    marketing: boolean }                # 마케팅 안내 수신 동의(선택) — 제출 활성화 조건에 포함되지 않음

ConsultationRequest (POST 페이로드, z.strictObject):
  { resultId: string (min 1)
    channel: ConsultationChannel
    name: string (trim, min 1, max 20)
    contact: string                      # 원시 입력(하이픈/공백 허용 포맷), 서버가 정규화
    preferredCallTime?: string           # channel === "phone"일 때만 필수(.refine)
    consent: ConsultationConsent
    acknowledgedConsentVersion: string (min 1)   # 사용자가 실제로 열람한 동의 문구 버전(§6.1)
    idempotencyKey: string (min 1) }     # draft에서 최초 생성돼 재시도에도 재사용

ConsultationSubmitResult (서버 응답, discriminated union):
  | { status: "success"; channel; maskedContact: string; preferredCallTime?: string }
  | { status: "duplicate"; receivedAt: string; maskedContact: string; applicationStatus: string }
  | { status: "error"; code: "validation" | "rate_limited" | "server_error" | "handoff_mismatch"
      | "policy_unavailable" | "consent_version_mismatch" | "idempotency_conflict";
      message: string; fieldErrors?: Record<string, string[]> }
```

**서버가 절대 신뢰하지 않는 클라이언트 값**: `consultationId`(서버 `crypto.randomUUID()` 생성, §9.4에 따라 성공 응답에도 포함하지 않는다), `createdAt`/`updatedAt`(서버 타임스탬프), `applicationStatus`(서버 초기값 `"received"` 고정), 저장되는 `consentVersion`(클라이언트가 보내는 `acknowledgedConsentVersion`을 그대로 복사하지 않는다 — 서버가 활성 정책과 대조 검증한 뒤 자신이 보유한 정책 버전 값으로 스탬프한다, §6.1). `resultId` 자체는 서버가 대조 검증할 원본 저장소가 없으므로(§ 잔여 위험, §8) 형식(`min(1)`)만 검증하고 opaque 참조로 취급한다.

### 6.1 동의 정책(`ConsentPolicy`) 계약

동의 문구·버전은 **서버가 소유하는 정책 계약**이다 — 클라이언트가 값을 선택하거나 생성하지 않는다. 이전 설계는 서버가 클라이언트가 한 번도 보지 못한 버전 상수를 일방적으로 스탬프했는데, 이는 사용자가 실제로 무엇에 동의했는지 사후 검증할 방법이 없어지는 계약이었다 — 아래 계약으로 대체한다.

```
ConsentPolicy (서버 전용, 배포 시 고정 상수 — 향후 관리 테이블로 대체 가능):
  { version: string       # 예: "2026-09-25-v1", 동의 문구가 바뀔 때마다 사람이 값을 갱신
    isActive: boolean }   # CONSULT_POLICY_READY 환경 변수에서 파생(§4) — 법무 확정 전에는 false
```

서버는 요청을 처리하기 전 활성 정책을 조회한다.

- 활성 정책이 없으면(`isActive === false` 또는 정책 미설정) → **503 `policy_unavailable`**(§9.1) — 저장 시도 자체를 하지 않는다. 법무·운영이 동의 문구를 확정하기 전까지는 필수 동의를 적법하게 수집할 수 없으므로, 실제 접수는 구조적으로 열리지 않는다(§4.1 D4).
- 활성 정책이 있으면 요청의 `acknowledgedConsentVersion`과 정책의 `version`을 비교한다.
  - **일치** → 저장 시 `consultations.consentVersion` 컬럼에 서버가 보유한 정책의 `version` 값을 쓴다(요청 값을 그대로 복사하지 않고, 검증에 사용한 서버 자신의 값을 쓴다 — 신뢰 경계가 명확하다).
  - **불일치** → **409 `consent_version_mismatch`** — 저장하지 않는다.

이 계약으로 "사용자가 실제로 무엇에 동의했는지"는 항상 서버 측 검증을 통과한 값으로만 DB에 남는다 — 클라이언트가 임의의 문자열을 보내도 활성 정책과 일치하지 않으면 저장될 수 없다.

**연락처 정규화 vs 표시 포맷 분리(`lib/consult/phone.ts`)**:

- `normalizePhone(raw)`: 하이픈·공백·국가코드(`+82`/`0082`) 제거 후 국내 형식(`0`으로 시작하는 숫자열)으로 통일 — 저장·중복 판정·마스킹의 단일 기준값.
- `formatPhoneDisplay(normalized)`: `010-0000-0000` 하이픈 표기로 되돌리는 표시 전용 함수.
- `maskPhone(normalized)`: `010-****-1234`(가운데 4자리 마스킹) — 성공/중복 화면이 이 값만 렌더링한다(원시 연락처를 화면에 그대로 노출하지 않는다).
- 정규화 실패(숫자가 아니거나 자릿수가 국내 휴대폰 번호 범위를 벗어남) → `ConsultationRequestSchema`의 `.refine`이 거부(REQ-B2CCONSULT-011).

## 7. 동의 구조

`design/internal/DEV-ONLY-상담-신청-동의-상세-구조.png`가 정의한 3개 항목 구조를 UI 상태로만 구현한다(문구 내용은 §1 D5 참고). 필수 ① 개인정보 수집·이용 동의, 필수 ② 건강정보 상담 이용 동의, 선택 ③ 마케팅 수신 동의.

- 제출 버튼 활성화 조건: `piiCollection === true AND healthInfoUse === true`. `marketing` 값은 이 조건에 **전혀 관여하지 않는다**(REQ-B2CCONSULT-012).
- "자세히 보기"를 눌러 상세 뷰를 열어도 체크박스는 자동으로 체크되지 않는다(REQ-B2CCONSULT-013, 01-A2의 기존 원칙과 동일).
- 같은 운영 법인 소속 상담 담당자는 제3자가 아니므로 별도 제3자 제공 동의를 이 SPEC은 만들지 않는다(REQ-B2CCONSULT-014) — 외부 손해사정사·제휴 법인 연결 구조가 실제로 생기기 전까지 비활성.
- 상세 뷰: Desktop은 Modal(`role="dialog"`, focus trap, ESC 닫기, 닫으면 트리거 버튼으로 포커스 복귀), Mobile은 Bottom Sheet(동일한 포커스 관리 원칙) — 01-A2/M01-A2가 이미 확립한 패턴을 재사용한다.

## 8. 중복 제출 vs 멱등성 — 단일 권장안

미션이 제시한 5개 후보(resultId 단독 / 정규화 연락처 단독 / resultId+정규화 연락처 복합 / 시간 윈도 복합 키 / 멱등성 키+별도 비즈니스 규칙)를 비교한 결과, **"멱등성 키(기술) + `resultId`+정규화 연락처 복합 키(비즈니스)"의 계층 분리안**을 권장한다.

| 후보 | 평가 |
|---|---|
| `resultId` 단독 | 같은 진단 결과에 대한 재상담(예: 담당자가 아직 연락하지 않아 재문의)을 전부 막을 수 있어 과차단 위험. |
| 정규화 연락처 단독 | 가족 구성원 간 연락처 공유·동일인의 새 사고 재상담을 모두 막아 과차단 위험이 가장 큼(미션이 명시적으로 경고한 케이스). |
| `resultId` + 정규화 연락처(AND) | **채택** — 같은 진단 결과 + 같은 연락처 조합만 차단한다. `resultId`가 이미 한 번의 진단 인스턴스로 스코프를 좁혀 주므로, 별도 시간 윈도가 근사하려는 효과(같은 사람의 오래전 재문의는 구분)를 자연히 대체한다 — 새 진단은 항상 새 `resultId`를 받기 때문이다. |
| 시간 윈도 복합 키 | 운영상 보유·만료 정책이 아직 없어(§9) TTL 부기 비용만 추가되고, 위 AND 조합이 이미 같은 효과를 낸다 — 기각. |
| 멱등성 키 단독(비즈니스 규칙 없음) | 같은 버튼 재클릭·네트워크 재시도는 막지만, "이미 접수된 신청"이라는 비즈니스 의미의 중복은 구분하지 못한다 — 기술적 멱등성만으로는 §7의 요구를 충족 못함. |

**설계**:

1. **기술적 멱등성**(같은 버튼 재클릭·네트워크 재시도): `consultations.idempotencyKey` 컬럼에 DB UNIQUE 제약. 동일 `idempotencyKey`로 이미 존재하는 레코드가 있고 이번 요청의 요청 지문(§8.2)이 그 레코드와 **일치**하면, 새 레코드를 만들지 않고 그 레코드 기준의 `"success"`를 응답한다(재시도가 원래 요청과 동일하게 취급됨). **일치하지 않으면**(같은 키를 다른 내용으로 재사용) 성공으로 처리하지 않고 409/`idempotency_conflict`로 거부한다 — 키 재사용 공격이나 클라이언트 버그를 성공으로 오인하지 않기 위함이다(§8.1 5번/9번).
2. **비즈니스 중복**(이미 접수된 신청): 위 idempotency 판정에 해당하지 않을 때, 같은 트랜잭션 안에서 `(result_id, contact_normalized)` 복합 UNIQUE 인덱스에 대한 조회를 수행한다 — 일치하는 기존 행이 있으면 `"duplicate"`로 응답하고 새 행을 만들지 않는다.
3. **레이스 안전성**: 두 검사 모두 DB 유니크 제약(트랜잭션 내 원자적 `INSERT`)에 의존한다 — 클라이언트의 사전 체크(예: 폼에 "이미 신청하셨나요?" 안내)는 참고용일 뿐 **권위 있는 판정이 아니다**(REQ-B2CCONSULT-021 추가 시나리오 — 동시 동일 요청 N개가 도착해도 정확히 1개의 신청 레코드만 생성됨을 통합 테스트로 증명). 정확한 처리 순서와 지문 정의는 §8.1-8.2.

### 8.1 요청 처리 순서 (server-side, 트랜잭션 경계 포함)

1. `ConsultationRequestSchema.safeParse` 실패 → 400/`validation`(연락처 정규화는 이 검증의 일부, §6).
2. §9.3 Rate limit 판정 — 초과 시 429/`rate_limited`로 여기서 종료(어떤 레코드도 생성하지 않는다).
3. §6.1 활성 동의 정책 조회·검증 — 정책 없음이면 503/`policy_unavailable`, `acknowledgedConsentVersion` 불일치면 409/`consent_version_mismatch`로 여기서 종료.
4. `idempotencyKey`로 기존 레코드를 조회한다.
5. 기존 레코드가 있고 §8.2 요청 지문이 이번 요청과 **일치**하면 → 그 레코드 기준 200/`success`를 반환한다(새 레코드를 만들지 않음).
6. 기존 레코드가 있지만 요청 지문이 **다르면** → 409/`idempotency_conflict`로 거부한다.
7. (5/6에 해당하지 않을 때) `(resultId, contactNormalized)` 복합 인덱스로 기존 레코드를 조회한다 — 일치하는 행이 있으면 409/`duplicate`로 거부한다(새 레코드를 만들지 않음).
8. 위 어느 것에도 해당하지 않으면 신규 `INSERT`를 시도한다(이때 `consentVersion`은 §6.1이 검증한 서버 측 활성 정책 값을, `requestFingerprint`는 §8.2 값을 함께 쓴다).
9. `INSERT` 시점에 UNIQUE 제약 충돌이 발생하면(동시 요청 레이스) 어느 제약이 충돌했는지 재조회한다.
10. 충돌한 제약이 `idempotencyKey` UNIQUE였다면 → 5번과 동일하게 처리한다(지문 비교 후 기존 성공 반환 또는 `idempotency_conflict`).
11. 충돌한 제약이 `(resultId, contactNormalized)` 복합 UNIQUE였다면 → 7번과 동일하게 처리한다(409/`duplicate`).
12. 그 외 DB 오류는 오직 500/`server_error`로만 응답한다(다른 상태 코드로 오인 매핑하지 않는다).

### 8.2 요청 지문(Request Fingerprint)

요청 지문은 `idempotencyKey` 재사용이 "정말 같은 요청의 재시도"인지 "다른 내용을 같은 키로 보내는 것"인지 구분하는 근거다. 서버는 `{ resultId, channel, name, contactNormalized, preferredCallTime ?? null, consent.piiCollection, consent.healthInfoUse, consent.marketing, acknowledgedConsentVersion }`을 결정론적으로 키 정렬된 JSON으로 직렬화한 뒤 SHA-256 해시를 계산해 `consultations.requestFingerprint` 컬럼(§9.2)에 저장한다. 재시도 요청이 도착하면 같은 방식으로 지문을 계산해 저장된 값과 비교한다 — 원본 PII 값 자체는 어떤 로그에도 남기지 않으며(§9.1), 이 해시 값도 API 응답이나 로그에 노출하지 않고 DB 컬럼으로만 사용한다.

## 9. 서버 API + 저장소 계약

### 9.1 `POST /api/consultations`

`git show 257d033^:app/api/cases/route.ts`가 확립한 관례(§ research.md §3)를 재사용한다.

| HTTP status | `ConsultationSubmitResult.status`/`code` | 조건 |
|---|---|---|
| 201 | `success` | 신규 삽입 성공(§8.1 8번) |
| 200 | `success` | 동일 idempotencyKey + 지문 일치 재시도(§8.1 5번/10번 — 삽입 없이 기존 행 반환) |
| 409 | `duplicate` | `resultId`+정규화 연락처 복합 키 충돌(§8.1 7번/11번) |
| 409 | `idempotency_conflict` | 동일 idempotencyKey, 다른 핵심 페이로드(요청 지문 불일치, §8.1 6번/10번, §8.2) |
| 409 | `consent_version_mismatch` | 요청의 `acknowledgedConsentVersion`이 활성 동의 정책 버전과 불일치(§6.1) |
| 503 | `policy_unavailable` | 활성 동의 정책이 없음(`CONSULT_POLICY_READY`가 거짓이거나 정책 미설정, §6.1) — 저장 시도 자체를 하지 않음 |
| 400 | `error`/`validation` | `ConsultationRequestSchema.safeParse` 실패(`fieldErrors` 포함) |
| 429 | `error`/`rate_limited` | 원본 IP HMAC 기반 DB 고정 윈도 카운터 초과(§9.3) |
| 500 | `error`/`server_error` | DB 오류 등 예기치 못한 실패, 또는 rate limit 판정에 필요한 서버 시크릿·신뢰 가능한 IP를 얻을 수 없어 fail closed로 접수를 열지 않은 경우(§9.3) |
| N/A(서버 미호출) | `error`/`handoff_mismatch` | 제출 직전 클라이언트가 재조회한 `resultId`가 폼 마운트 시점에 읽은 `resultId`와 다를 때(다른 탭에서 새 진단을 시작하는 등으로 핸드오프가 교체된 경우) — 서버에 요청을 보내지 않고 클라이언트가 즉시 판정 |

`handoff_mismatch`는 서버가 판정하지 않는다 — §9.2가 명시하듯 서버는 `resultId`를 대조 검증할 원본이 없으므로(잔여 위험), 이 판정은 전적으로 클라이언트가 제출 직전 `readDiagnosisHandoff()`를 재호출해 자체적으로 수행한다(REQ-B2CCONSULT-018).

클라이언트 측 타임아웃/네트워크 오류(응답 자체를 받지 못한 경우)는 서버 상태 코드가 없다 — 클라이언트는 이를 03-D 실패 상태로 취급하고, **서버가 실제로 저장했는지 여부를 단정하지 않으며**, 재시도 시 **같은 `idempotencyKey`**를 재사용한다(§8 1번 경로가 재시도를 안전하게 흡수한다 — REQ-B2CCONSULT-022).

로깅: `console.info(JSON.stringify({ event: "consultation_request_received", timestamp, channel, hasResultId: Boolean(body.resultId) }))` — `name`/`contact`는 어떤 로그에도 포함하지 않는다. 에러 응답 본문도 `name`/`contact` 원본값을 절대 echo하지 않는다(REQ-B2CCONSULT-023).

### 9.2 `consultations` 테이블 (`lib/db/schema.ts` 추가)

```
consultations
  id                        text PK (server-generated crypto.randomUUID())
  resultId                  text NOT NULL          # opaque 참조, FK 아님(§ 잔여 위험)
  channel                   text NOT NULL           # "kakao" | "phone"
  name                      text NOT NULL
  contactNormalized         text NOT NULL           # 정규화 연락처(§6) — 원시 표시 포맷 저장 안 함
  preferredCallTime         text (nullable)
  consentPiiCollection      integer(boolean) NOT NULL
  consentHealthInfoUse      integer(boolean) NOT NULL
  consentMarketing          integer(boolean) NOT NULL
  consentVersion            text NOT NULL           # 서버가 §6.1 활성 정책 대조 검증 후 스탬프(클라이언트 미신뢰)
  requestFingerprint        text NOT NULL           # 요청 지문 SHA-256 해시(§8.2) — idempotencyKey 재사용 시 페이로드 동일성 판정
  applicationStatus         text NOT NULL DEFAULT "received"
  idempotencyKey            text NOT NULL UNIQUE
  createdAt                 integer(timestamp) NOT NULL
  updatedAt                 integer(timestamp) NOT NULL

  + UNIQUE 복합 인덱스 (resultId, contactNormalized)  # §8 비즈니스 중복 판정
```

**PII/진단 데이터 분리 결정**: `DiagnosisResult` 전체(담보 항목·집계 등)는 이 테이블에 **복제하지 않는다** — `resultId`만 opaque 참조로 저장한다. 이유: (a) `DiagnosisResult` 자체가 현재 이 프로젝트 어디에도 서버 영구 저장되지 않는데(02는 `sessionStorage`만 사용), 03에서 처음으로 복제 저장을 시작하면 이 SPEC의 범위를 벗어나 새로운 민감정보(건강정보 인접 데이터) 영구 저장 표면을 여는 셈이 된다. (b) 상담 담당자가 실제로 필요한 것은 연락처·희망 시간·채널이며, 진단 상세는 `resultId`를 매개로 향후(이 SPEC의 범위 밖) 별도 조회 경로가 필요하면 그때 설계한다. **잔여 위험**: `resultId`는 서버가 대조 검증할 원본이 없으므로 클라이언트가 임의의 문자열을 보내도 형식 검사(`min(1)`)만 통과하면 저장된다 — 위변조 방지(서명 등)는 이 SPEC의 범위 밖이며 Open Decision으로 남긴다.

### 9.3 Rate Limiting 알고리즘 (DB 기반 고정 윈도)

이 프로젝트의 실제 배포 대상은 Oracle Cloud 단일 VM 위에서 PM2가 상시 구동하는 단일 프로세스이며, Nginx가 리버스 프록시로서 그 앞을 지킨다(Next.js 프로세스는 `127.0.0.1`에만 바인딩, `tech.md` § Oracle Cloud Always Free VM). 이 조건에서 인메모리 카운터는 PM2 재시작(예: `main` 푸시마다 자동 재배포, `tech.md`)마다 조용히 리셋되어 안전하지 않으므로, DB 기반 고정 윈도 카운터를 채택한다.

```
consultationRateLimits
  windowStart      integer(timestamp) NOT NULL   # 고정 윈도 시작 시각(윈도 크기 단위로 내림)
  ipHmac           text NOT NULL                  # HMAC-SHA256(신뢰 가능한 원본 IP, RATE_LIMIT_HMAC_SECRET) — 원본 IP는 어떤 컬럼에도 저장하지 않는다
  requestCount     integer NOT NULL DEFAULT 1

  + UNIQUE 복합 인덱스 (windowStart, ipHmac)
```

상수(run-phase가 실제 값을 트래픽 실측 기반으로 조정할 수 있되, 아래를 plan-phase 기본값으로 확정한다):

```
RATE_LIMIT_WINDOW_MS = 60_000       # 1분 고정 윈도
RATE_LIMIT_MAX_REQUESTS = 5         # 윈도당 IP 하나 최대 5회 제출 시도
```

알고리즘:

1. Nginx가 리버스 프록시로서 `x-forwarded-for` 헤더에 채우는 원본 클라이언트 IP를 신뢰 가능한 IP로 사용한다 — Next.js 프로세스는 `127.0.0.1`에만 바인딩되어 있어 Nginx를 거치지 않은 요청은 애초에 도달할 수 없다(`tech.md`).
2. 서버 시크릿(`RATE_LIMIT_HMAC_SECRET`)이 환경 변수에 없거나, 신뢰 가능한 IP를 얻을 수 없으면(예: 헤더 부재) 시스템은 이 요청의 실제 접수를 열지 않는다(**fail closed**) — 500/`server_error`로 응답하고 어떤 레코드도 생성하지 않는다.
3. `windowStart = floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS`. `ipHmac = HMAC-SHA256(trustedIp, RATE_LIMIT_HMAC_SECRET)`를 계산한다.
4. `INSERT INTO consultation_rate_limits (window_start, ip_hmac, request_count) VALUES (?, ?, 1) ON CONFLICT (window_start, ip_hmac) DO UPDATE SET request_count = request_count + 1 RETURNING request_count` 형태의 원자적 upsert를 수행한다.
5. 반환된 `requestCount`가 `RATE_LIMIT_MAX_REQUESTS`를 초과하면 429/`rate_limited`로 응답하고 §8.1의 나머지 파이프라인(동의 정책 검증/idempotency/중복 판정/삽입)을 실행하지 않는다.
6. 초과하지 않으면 §8.1의 요청 처리 순서(3번부터)로 계속 진행한다.

**보관·정리 정책**: 매 upsert 트랜잭션에서 부가적으로 `DELETE FROM consultation_rate_limits WHERE window_start < :now - RETENTION_MS`(`RETENTION_MS` 기본 1시간)를 함께 실행한다 — `windowStart`가 인덱스 선두 컬럼이라 비용이 낮고, 이 프로젝트가 이미 피하고 있는 별도 cron/백그라운드 잡 인프라(`research.md` §3 — `after()` 패턴만 예외적으로 허용)를 새로 추가하지 않는다.

### 9.4 PII 최소화 계약

- **원시 연락처 미반환**: API는 어떤 응답에서도 원시(마스킹되지 않은) 연락처를 반환하지 않는다 — `maskedContact`만 반환한다(§6 `ConsultationSubmitResult`).
- **교차 제출 정보 유출 방지**: `duplicate` 응답의 `maskedContact`는 매칭된 기존 레코드의 저장값을 다시 읽어 반환하는 것이 아니라, **이번 요청 자신이 제출한 연락처**를 정규화·마스킹해 생성한다 — 비즈니스 중복 매칭 키 자체가 `contactNormalized` 동일성을 요구하므로 두 값은 정의상 같지만, 이 파생 방식 자체가 향후 매칭 로직 결함이 발생하더라도 다른 제출자의 연락처가 노출될 가능성을 원천 차단한다(REQ-B2CCONSULT-023).
- **접수 시각 최소 정밀도**: `duplicate` 응답의 `receivedAt`은 시:분:초를 포함하지 않는 날짜 단위 정밀도(`YYYY-MM-DD`)로만 제공한다.
- **내부 식별자 최소 노출**: 서버가 생성하는 `consultationId`(DB `id` PK)는 이 SPEC의 범위에서 클라이언트가 실제로 사용하는 곳이 없으므로(§4.1 참고 — "기존 신청 상태 확인"은 준비 중 스텁, Open Decision #4) `success`/`duplicate` 응답 어디에도 포함하지 않는다. 이후 실제 상태 조회 기능이 설계되면, 그 SPEC이 필요에 맞는 별도의 클라이언트-안전 참조 토큰을 새로 설계한다(원시 DB PK를 그대로 노출하지 않는다).
- **로그·분석·시각 검증 fixture**: 어떤 로그 라인·분석 이벤트·시각 회귀 fixture에도 실사용 가능한 PII를 포함하지 않는다 — 이 문서 전체와 `acceptance.md`가 사용하는 예시 값은 명백히 가짜인 값만 사용한다(`acceptance.md` 서두 원칙).

## 10. 성공/중복/실패 상태 계약

### 03-B / M03-B (성공)

체크 아이콘 + "상담 신청이 접수되었습니다" + 요약 테이블(상담 방식/연락처(마스킹)/연락 희망 시간(phone일 때만)/상담 예정 전문가(정적 placeholder)) + "접수 내용을 확인한 뒤 선택하신 방법으로 연락드리겠습니다"(운영 SLA 확정 없이 구체적 시간을 약속하지 않는 중립 표현 — 원 디자인의 "영업일 기준 1일 이내에…" 문구를 이 SPEC이 대체함, §1 D6) + "진단 결과로 돌아가기" + "신청 취소·정보 삭제 문의"(§1 D4, 준비 중 스텁).

### 03-C / M03-C (중복)

시계 아이콘 + "이미 접수된 상담 신청이 있습니다" + 요약(상담 방식/연락처(마스킹)/접수일/처리 상태) + "기존 신청 상태 확인"(§1 D4, 준비 중 스텁 — 실제 조회 기능 없음) + "진단 결과로 돌아가기". 내부 신청 ID·전체 페이로드 등은 노출하지 않는다(REQ-B2CCONSULT-020 — 마스킹된 연락처와 접수일·처리 상태 라벨만).

### 03-D / M03-D (실패)

경고 아이콘 + "상담 신청이 접수되지 않았습니다" + "일시적인 오류로 접수가 완료되지 않았습니다. 입력하신 내용은 다시 입력하지 않아도 됩니다"(서버 저장 여부를 단정하지 않는 문구 — "저장되었습니다" 같은 확정 표현 금지) + 요약(상담 방식/연락처/연락 희망 시간/"입력 내용: 유지됨") + "다시 시도하기"(같은 idempotencyKey로 재제출) + "이전 화면으로 돌아가기". 입력 보존 범위: draft에 저장된 필드(channel/name/contactRaw/preferredCallTime/marketing) 전부 — 단, §2.3 원칙대로 두 필수 동의는 재확인이 필요하다. 반복 실패 시 대체 연락 채널: "다시 시도해도 접수되지 않으면 카카오톡 상담으로 문의해 주세요"(디자인 문구 그대로 채택 — 이미 존재하는 대체 경로 안내이며 새 채널을 만들지 않는다).

## 11. 반응형·접근성 계약

- 데스크톱 폼 폭 720px(`design/MIGRATION-PLAN.md` §4 레이아웃 규칙의 03 중앙 컬럼 폭과 일치), 모바일 단일 컬럼.
- 모바일 하단 CTA sticky(02의 `result-cta-final` sticky 패턴 재사용).
- 동의 상세: Desktop Modal / Mobile Bottom Sheet, focus trap, ESC 닫기, 닫으면 트리거로 포커스 복귀(§7).
- 오류 요약 + 첫 오류 필드로 포커스 이동(제출 실패 시 검증 오류가 있으면), `aria-describedby`로 필드-오류 연결, `aria-live="polite"` 상태 안내.
- 채널 선택·동의·제출 전체가 키보드만으로 조작 가능(라디오는 방향키, 체크박스는 Space, 제출은 Enter).
- `prefers-reduced-motion` 존중(기존 패턴 재사용).
- 제출 중 상태: 버튼 비활성 표시 + `aria-busy` + 중복 제출 방지(REQ-B2CCONSULT-015).

## 12. 시각 검증 계획 (`scripts/visual-verify.ts` 확장)

9개 신규 화면을 기존 15개(01 계열 10 + 02 계열 5) 배열에 **추가만** 한다.

| id | platform | 진입 방법(결정론적) | 픽셀 비교 대상(핵심 3-4요소) | semanticChecks |
|---|---|---|---|---|
| `03` | desktop | `/consult?devFixture=fracture&channel=kakao` (review 게이트 재사용) | 요약 카드/채널 선택 행/폼 영역 | 카카오 라디오 `aria-checked=true`, 전화번호 라벨이 "카카오톡 연락에 사용할…"인지, 연락 희망 시간 `required` 부재, 필수 동의 2 + 선택 1 존재, 제출 버튼 `aria-disabled=true`(동의 전) |
| `03-A2` | desktop | 동일 진입 + 전화 라디오 클릭 | 동일 | 전화 라디오 `aria-checked=true`, "연락 희망 시간" `aria-required=true`, 안내 문구가 "접수 내용을 확인한 뒤…"(§1 D6) |
| `03-B` | desktop | `?devFixture=fracture&devConsultState=success` | 성공 카드 | 체크 아이콘 존재, 마스킹 연락처 정규식(`\d{3}-\*{4}-\d{4}`) 매칭, 원시 연락처 문자열 DOM 부재 |
| `03-C` | desktop | `?devFixture=fracture&devConsultState=duplicate` | 중복 카드 | 시계 아이콘 존재, "기존 신청 상태 확인" CTA 존재 |
| `03-D` | desktop | `?devFixture=fracture&devConsultState=error` | 실패 카드 | 경고 아이콘 존재, "다시 시도하기" CTA 존재, 입력 필드 값 유지(폼 상태 보존) |
| `M03` | mobile | 동일 fixture, 모바일 뷰포트 | 요약/채널/폼 | 카카오 기본 선택, 하단 CTA `position: sticky` |
| `M03-B` | mobile | 동일 | 성공 카드 | 03-B와 동일 |
| `M03-C` | mobile | 동일 | 중복 카드 | 03-C와 동일 |
| `M03-D` | mobile | 동일 | 실패 카드 | 03-D와 동일 |

review 전용 진입 파라미터(`devFixture`/`devConsultState`)는 `ENABLE_DIAGNOSIS_DEV_STATES` 게이트(기존 `reviewEnabled`)를 그대로 재사용한다 — 03 전용 별도 게이트를 만들지 않는다. `devConsultState`는 실제 서버 호출 없이 클라이언트가 결정론적으로 성공/중복/실패 상태를 렌더링하도록 하는 review 전용 우회 경로다(run-phase가 구체 구현 확정).

**기존 15화면 회귀 방지**: 기존 `SCREENS` 배열 항목·허용 오차(`TOLERANCE`)·04건의 승인된 02 시각 debt(§13)는 이 SPEC이 절대 수정하지 않는다 — `pnpm visual:verify` 전체 실행 시 기존 15화면 PASS + 신규 9화면 PASS(총 24화면)를 run-phase 완료 조건으로 삼는다.

## 13. 01/02 회귀 방지 조건

- SPEC-B2C-RESULT-001이 승인한 4건의 시각 debt(fixture 담보 7개 유지·`priorityChecklist` 카드형 유지·`ResultAggregateBanner` height 편차·모바일 입력 요약 카드 잔여 height 편차)는 그대로 유지하며 이 SPEC에서 재선언·재승인하지 않는다.
- `e2e/diagnosis-flow-01.spec.ts`/`e2e/diagnosis-flow-02.spec.ts`(존재 시)는 수정하지 않는다 — 회귀 검증 대상으로만 재실행한다.
- `DIAGNOSIS_ENGINE_READY`를 이 SPEC의 코드 어디에서도 `true`로 전환하지 않는다(02의 REQ-B2CRESULT-024와 동형 원칙).
