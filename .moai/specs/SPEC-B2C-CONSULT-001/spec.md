---
id: SPEC-B2C-CONSULT-001
title: "03 상담 신청 및 접수 결과 (Plan-Phase)"
version: "0.1.0"
status: draft
created: 2026-09-25
updated: 2026-09-25
author: Nexsol
priority: P1
phase: "v0.19.0 target"
module: "app/consult/, app/api/consultations/, components/consult/, lib/consult/, lib/db/"
lifecycle: spec-anchored
tags: "b2c-consult, lead-capture, consultation-request, pii-boundary, idempotency, funnel-03, plan-only"
tier: L
related_specs: [SPEC-B2C-DIAGNOSIS-001, SPEC-B2C-RESULT-001]
---

## HISTORY

- 2026-09-25: 최초 작성 (Nexsol) — B2C 3단계 퍼널(01 질문 입력 → 02 보상 진단 결과 → 03 상담 신청) 중 마지막 흐름인 **③ 상담 신청 및 접수 결과**의 plan-phase 문서만 작성한다. 실제 화면·컴포넌트·API·DB 마이그레이션 구현은 후속 `/moai run SPEC-B2C-CONSULT-001`의 범위이며, 이번 커밋에는 코드 변경이 포함되지 않는다. 디자인 SSOT는 `design/MIGRATION-PLAN.md`(§2 ③, §6, §7)이며, 02의 stub 상태(`components/result/result-cta-bar.tsx`, `status: completed`)를 실제 흐름으로 전환하는 SPEC이다.

## 1. 배경 (Why)

`design/MIGRATION-PLAN.md`가 정의한 B2C 3단계 퍼널에서 ①(SPEC-B2C-DIAGNOSIS-001)과 ②(SPEC-B2C-RESULT-001)는 모두 `status: completed`로 구현이 끝났다. 그러나 02 화면의 모든 상담 CTA(`components/result/result-cta-bar.tsx`)는 여전히 `aria-disabled` "준비 중" stub이며, 이 SPEC이 다루는 03(상담 신청 → 접수 결과)은 디자인만 존재하고 코드가 없다.

`product.md`의 핵심 메시지 "이것도 되고 저것도 되고, 이만큼이나 나온다"는 02에서 보여준 것을 03이 **실제 전환**으로 완결한다 — 사용자가 놓치고 있던 담보를 확인한 뒤 손해사정사 상담으로 실제 연결되는 것이 이 SPEC의 존재 이유다. 이 SPEC은 **02→03 연결·상담 데이터 계약·서버 API/저장소 설계·성공/중복/실패 3상태 UI**를 정의한다 — 실제 담보 매칭 엔진 연결(여전히 미결정, `tech.md`)은 이 SPEC의 범위 밖이다.

## 2. 범위 (Scope)

### 포함 화면 (Desktop 5 + Mobile 4 = 9개, `design/exports/` 기준)

| 화면 | 노드 ID | Export 파일 | 비고 |
|---|---|---|---|
| 03 상담 신청 · 손해사정사 연결 | `Uli7t` | `03-상담-신청-손해사정사-연결.png` | `channel="kakao"` state |
| 03-A2 전화 선택 | `EhyPu` | `03-A2-상담-신청-전화-선택.png` | **동일 컴포넌트의 `channel="phone"` state — 별도 라우트 아님**(`design.md` §1 D1) |
| 03-B 접수 성공 | `O5MBi` | `03-B-상담-신청-완료.png` | |
| 03-C 중복 신청 | `p8jllI` | `03-C-상담-신청-중복.png` | |
| 03-D 신청 실패 | `P1OrE` | `03-D-상담-신청-실패.png` | |
| M03 상담 신청 | `lQjs9` | `M03-상담-신청.png` | 카카오/전화 두 state를 하나의 화면이 표현(별도 M03-A2 없음) |
| M03-B 신청 완료 | `GlS4V` | `M03-B-신청-완료.png` | |
| M03-C 신청 중복 | `p3bj0d` | `M03-C-신청-중복.png` | |
| M03-D 신청 실패 | `DSXr6` | `M03-D-신청-실패.png` | |

### 신규 백엔드 표면

- `POST /api/consultations` route handler
- `consultations` Drizzle 테이블(`lib/db/schema.ts` 확장)

### 제외 화면·기능

02가 완료한 5화면(02/M02/M02-B/M02-C/M02-D)은 이 SPEC의 대상이 아니다 — 02는 읽기 전용 참조 대상(`DiagnosisResult`/`computeAggregate`/`readDiagnosisHandoff`)이다.

## 3. 요구사항 (GEARS)

### 3.1 02 데이터 재사용 · 03 화면 구조 (Ubiquitous)

- **REQ-B2CCONSULT-001**: 시스템은 03 화면에서 담보 개수·검토 대상/추가 정보 필요 개수 등 진단 결과 요약 수치를 `lib/diagnosis/aggregate.ts`의 `computeAggregate(items)`로만 산출하며, 이 계산을 03 코드 안에서 재구현하거나 다른 값으로 재계산하지 않는다. `DiagnosisResult`는 `lib/diagnosis/handoff.ts`의 `readDiagnosisHandoff()`를 그대로 호출해 참조하며, 03 전용의 별도 진단 결과 인계 채널을 새로 만들지 않는다.
- **REQ-B2CCONSULT-002**: 시스템은 03(카카오톡 채널 선택 상태)과 03-A2(전화 채널 선택 상태)를 **단일 컴포넌트의 `channel: "kakao" | "phone"` state 두 값**으로 구현하며, 서로 다른 라우트나 별도 페이지 전환으로 구현하지 않는다.

### 3.2 02→03 CTA 활성화 (Event-driven / Where)

- **REQ-B2CCONSULT-003** (When): 사용자가 02 화면의 4개 상담 CTA(상단 탑바/후유장해 섹션/하단 카카오톡/하단 전화) 중 하나를 클릭할 때, 시스템은 `/consult` 라우트로 실제 네비게이션을 수행한다. 전달하는 채널 쿼리는 CTA별로 다음과 같이 명확히 구분된다 — 상단 탑바: `?channel=kakao`, 후유장해 섹션: 쿼리 파라미터 없이 `/consult`(중립, 채널 미지정 — REQ-B2CCONSULT-004의 `kakao` 기본값이 적용됨), 하단 카카오톡: `?channel=kakao`, 하단 전화: `?channel=phone`.
- **REQ-B2CCONSULT-004** (When): `/consult` 진입 시 `channel` 쿼리 값이 없거나 `"kakao"`/`"phone"` 중 하나가 아닐 때(위변조·오타 포함), 시스템은 오류를 던지거나 빈 화면을 렌더링하지 않고 `"kakao"`로 폴백한다.
- **REQ-B2CCONSULT-005** (Where): `ENABLE_CONSULT_FLOW` 환경 변수(기본값 falsy)가 `"true"`가 아닐 때, 시스템은 02의 4개 상담 CTA를 현재의 `aria-disabled` "준비 중" stub 동작으로 **독립적으로** 유지한다 — 02 자체의 `shouldRenderDiagnosis` 게이트 상태와 무관하게 이 플래그 단독으로 CTA 활성화 여부를 결정한다. 이 플래그는 "코드/화면이 배포되어 리뷰 가능한가"만 게이트하며, "실제로 개인정보 수집을 시작해도 되는가"는 별도의 `CONSULT_POLICY_READY` 환경 변수(REQ-B2CCONSULT-018)가 독립적으로 게이트한다 — 두 조건은 서로 혼동되지 않으며, `ENABLE_CONSULT_FLOW=true`이고 `CONSULT_POLICY_READY=false`일 때 시스템은 03 화면 자체는 렌더링하되 실제 제출 동작은 클라이언트에서 비활성화하고 서버도 독립적으로 저장을 거부한다(`design.md` §4).

### 3.3 02→03 핸드오프 · draft (Event-driven)

- **REQ-B2CCONSULT-006**: 시스템은 상담 폼의 임시 입력 상태(채널·이름·연락처 원문·연락 희망 시간·마케팅 동의 체크 여부·idempotencyKey)를 `sessionStorage`(`lib/consult/draft.ts`, 프로젝트 네임스페이스 전용 키)에 저장하되, 필수 동의 두 항목의 체크 상태는 저장하지 않는다(새로고침 시 항상 재확인 필요). draft 스키마(`ConsultationDraftSchema`)는 `z.strictObject` 원칙(알 수 없는 키 거부)으로 정의되며 명시적 `draftVersion` 리터럴 필드를 포함한다 — 저장된 draft가 손상된 JSON이거나, 알 수 없는 키를 포함하거나, `draftVersion`이 현재 버전과 다르거나, 그 외 스키마 검증에 실패하는 경우 모두, 시스템은 오류를 던지지 않고 조용히 빈 draft로 폴백한다.
- **REQ-B2CCONSULT-007** (When): `readDiagnosisHandoff()`가 `{status:"empty"}`를 반환할 때(핸드오프 부재, 02를 경유하지 않은 직접 진입 포함), 시스템은 03 전용 "먼저 진단 결과가 필요합니다" 안내 상태를 표시하고 01 입력 화면으로 돌아가는 경로를 제공한다.
- **REQ-B2CCONSULT-008** (When): `readDiagnosisHandoff()`가 `{status:"invalid"}`를 반환할 때(JSON 파싱 실패 또는 스키마 불일치), 시스템은 애플리케이션을 중단시키지 않고 03 전용 오류 상태를 표시한다.
- **REQ-B2CCONSULT-009**: 시스템은 새로고침·뒤로가기 후 재진입 시 동일한 `DiagnosisResult`(`resultId` 동일)가 다시 표시되도록 보장하며, 이 재현을 위한 별도의 신선도(TTL) 검사를 추가하지 않는다(02가 이미 확립한 탭 세션 유지 정책을 그대로 상속).

### 3.4 채널 선택 · 입력 폼 (Ubiquitous)

- **REQ-B2CCONSULT-010**: 시스템은 카카오톡/전화 두 상담 채널 중 하나를 라디오 선택으로 제공하며, `channel === "phone"`일 때만 "연락 희망 시간" 필드를 필수로 요구한다(`channel === "kakao"`일 때는 선택 입력).
- **REQ-B2CCONSULT-011**: 시스템은 연락처의 원시 입력값(하이픈/공백/국가코드 허용)과 저장·판정에 쓰이는 정규화 값(`lib/consult/phone.ts` `normalizePhone`)을 분리하며, 정규화 결과가 국내 휴대폰 번호 형식을 벗어나면 검증을 거부한다. 화면 표시 전용 포맷(`formatPhoneDisplay`)과 마스킹 표시(`maskPhone`, 가운데 4자리)도 이 정규화 값 하나에서 파생한다.

### 3.5 동의 구조 (Ubiquitous / Unwanted)

- **REQ-B2CCONSULT-012**: 시스템은 상담 신청을 위한 개인정보 수집·이용 동의(필수 ①)와 진단 결과 등 건강정보의 상담 이용 동의(필수 ②) 둘 다 체크되었을 때만 제출 버튼을 활성화하며, 마케팅 정보 수신 동의(선택 ③)의 체크 여부는 이 활성화 조건에 관여하지 않는다.
- **REQ-B2CCONSULT-013**: 시스템은 동의 항목의 "자세히 보기" 상세 뷰(Desktop Modal / Mobile Bottom Sheet)를 열어도 해당 동의 체크박스를 자동으로 체크하지 않는다.
- **REQ-B2CCONSULT-014** (Unwanted): 시스템은 이 SPEC의 범위 안에서 제3자 제공 동의 항목을 활성화 상태로 노출해서는 안 된다 — 같은 운영 법인 소속 상담 담당자는 제3자가 아니며, 외부 손해사정사·제휴 법인 연결 구조는 아직 존재하지 않는다.

### 3.6 이중 제출 방지 (Event-driven)

- **REQ-B2CCONSULT-015** (When): 제출 요청이 진행 중일 때, 시스템은 제출 버튼을 비활성화(`aria-busy` 포함)하고 동일 클릭·Enter 반복 입력이 두 번째 HTTP 요청을 발생시키지 않도록 한다.

### 3.7 상담 데이터 계약 (Ubiquitous)

- **REQ-B2CCONSULT-016**: 시스템은 `ConsultationRequest`/`ConsultationChannel`/`ConsultationConsent`/`ConsultationSubmitResult`(`lib/consult/types.ts`+`schema.ts`)를 `z.strictObject` 원칙(알 수 없는 키 거부)으로 정의한다. 필수 동의 두 필드는 `z.literal(true)`로 강제하고, 이름은 빈 문자열·과도한 길이를 거부하며, `channel`은 지원 채널 2종 외 값을 거부하고, `preferredCallTime`은 `channel === "phone"`일 때만 필수임을 스키마 수준(`.refine`)에서 강제한다. `ConsultationRequest`는 사용자가 실제로 열람한 동의 문구 버전을 전달하는 `acknowledgedConsentVersion`(1자 이상 문자열) 필드를 필수로 포함한다(`design.md` §6.1).
- **REQ-B2CCONSULT-017** (Unwanted): 시스템은 클라이언트가 제출한 `consultationId`/`createdAt`/`updatedAt`/`applicationStatus` 값을 서버 저장 시 신뢰해서는 안 된다 — 이 값들은 항상 서버가 자체 생성·스탬프한다. 클라이언트가 제출하는 `acknowledgedConsentVersion`도 맹목적으로 신뢰해 그대로 저장해서는 안 된다 — 시스템은 이 값을 서버가 보유한 현재 활성 동의 정책(`ConsentPolicy`, `design.md` §6.1)의 버전과 대조 검증하며, 일치할 때만 서버 자신이 보유한 그 정책 버전 값을 `consultations.consentVersion`으로 저장한다(요청 값을 복사하지 않는다). 활성 정책이 없거나 값이 불일치하면 저장을 거부한다(REQ-B2CCONSULT-018).

### 3.8 서버 API (Event-driven)

- **REQ-B2CCONSULT-018**: 시스템은 `POST /api/consultations` 엔드포인트를 제공하며, `ConsultationRequestSchema` 검증 실패(400/`validation`), 비즈니스 중복(409/`duplicate`), 과도한 요청(429/`rate_limited`), 서버 오류(500/`server_error`), 성공(201 또는 200/`success`)을 명시적인 HTTP 상태-응답 매핑으로 분기한다. 여기에 더해 시스템은 활성 동의 정책이 없을 때(`CONSULT_POLICY_READY`가 거짓이거나 정책 미설정, 503/`policy_unavailable`), 요청의 `acknowledgedConsentVersion`이 활성 정책 버전과 불일치할 때(409/`consent_version_mismatch`), 동일 `idempotencyKey`로 이전과 다른 핵심 페이로드가 도착했을 때(409/`idempotency_conflict`)도 각각 명시적인 HTTP 상태-응답 매핑으로 분기한다(`design.md` §6.1, §8.1-8.2). `rate_limited` 판정은 신뢰 가능한 원본 IP를 HMAC 처리한 고정 윈도 카운터를 DB UNIQUE 제약 기반 원자적 upsert로 수행하며(`design.md` §9.3), 서버 시크릿이 설정되지 않았거나 신뢰 가능한 IP를 얻을 수 없을 때는 실제 접수를 열지 않는다(fail closed — 500/`server_error`로 응답하고 어떤 레코드도 생성하지 않는다). 요청 수신·처리 로그는 `name`/`contact` 원본 값을 포함하지 않으며, 오류 응답 본문도 이 값들을 echo하지 않는다. 제출 직전 클라이언트가 `readDiagnosisHandoff()`를 재조회한 `resultId`가 폼 마운트 시점에 읽어 둔 `resultId`와 다를 때(다른 탭에서 새 진단을 시작하는 등으로 핸드오프가 교체된 경우), 시스템은 서버에 요청을 보내지 않고 즉시 `{status:"error", code:"handoff_mismatch"}`로 처리해 03-D 실패 상태로 전환한다.
- **REQ-B2CCONSULT-019**: 시스템은 `consultations` 저장 스키마(`lib/db/schema.ts` 확장)에 상담 id·`resultId`(opaque 참조)·채널·이름·정규화 연락처·연락 희망 시간·동의 3종 boolean·서버 스탬프 동의 버전·요청 지문(`requestFingerprint`, `design.md` §8.2)·처리 상태·idempotencyKey·생성/수정 시각을 저장하며, `DiagnosisResult`의 담보 항목·집계 등 진단 상세 내용은 이 테이블에 복제하지 않는다. 또한 시스템은 `consultationRateLimits` 보조 테이블을 원자적 고정 윈도 카운터로 정의하며(`design.md` §9.3), 원본 IP 문자열은 이 테이블을 포함해 어떤 컬럼에도 평문으로 저장하지 않는다(HMAC 처리된 값만 저장한다).

### 3.9 중복 · 멱등성 (Event-driven)

- **REQ-B2CCONSULT-020**: 시스템은 기술적 멱등성(같은 버튼 재클릭·네트워크 재시도)을 `idempotencyKey` 컬럼의 DB UNIQUE 제약으로, 비즈니스 중복(이미 접수된 신청)을 `resultId`+정규화 연락처 복합 UNIQUE 인덱스로 각각 분리해 판정하며, 두 판정 모두 트랜잭션 내 원자적 DB 제약을 근거로 삼는다 — 클라이언트의 사전 체크는 참고용일 뿐 권위 있는 판정으로 취급하지 않는다. 동일한 `idempotencyKey`로 도착한 요청이 이전 요청과 다른 핵심 페이로드(요청 지문 불일치, `design.md` §8.2)를 담고 있으면 시스템은 이를 성공으로 처리하지 않고 409/`idempotency_conflict`로 거부한다. 요청 처리 순서는 검증 → rate limit 판정 → `idempotencyKey` 조회(지문 일치 시 기존 성공 반환 / 불일치 시 거부) → 비즈니스 중복 조회 → 신규 삽입 → 삽입 시점 UNIQUE 충돌 재조회 분기를 따른다(`design.md` §8.1).
- **REQ-B2CCONSULT-021**: 시스템은 동시에 도착한 동일 입력(같은 `idempotencyKey`, 같은 페이로드)의 요청이 여러 건이어도 정확히 1개의 상담 신청 레코드만 생성되도록 보장하며, 모든 호출자가 동일한 응답을 받는다. 같은 `idempotencyKey`에 서로 다른 페이로드가 동시에 도착하면 어느 순서로 처리되든 정확히 1개만 원 요청으로 성공 처리되고 나머지는 409/`idempotency_conflict`를 받는다. 서로 다른 `idempotencyKey`를 가졌지만 같은 `resultId`+정규화 연락처 조합인 요청이 동시에 도착하면 정확히 1개만 성공 레코드로 생성되고 나머지는 409/`duplicate`를 받는다.

### 3.10 성공 · 중복 · 실패 상태 (Event-driven)

- **REQ-B2CCONSULT-022** (When): 서버 응답이 `"error"`이거나 클라이언트가 타임아웃/네트워크 오류로 응답 자체를 받지 못했을 때, 시스템은 서버의 저장 성공/실패 여부를 단정하는 문구를 표시하지 않으며, 재시도 시 이전과 동일한 `idempotencyKey`를 재사용하고, 사용자가 입력한 값(채널·이름·연락처·연락 희망 시간·마케팅 동의)을 화면과 draft 양쪽에 보존한다.
- **REQ-B2CCONSULT-023** (When): 서버 응답이 `"duplicate"`일 때, 시스템은 마스킹된 연락처·접수일·처리 상태 라벨만 표시하며 기존 신청의 전체 페이로드나 내부 식별자를 노출하지 않는다. 마스킹된 연락처는 매칭된 기존 레코드의 저장값을 다시 읽어 반환하지 않으며, 항상 이번 요청 발신자 본인이 제출한 연락처를 정규화·마스킹해 파생한다(교차 제출 정보 유출 방지, `design.md` §9.4). 접수일은 시:분:초를 포함하지 않는 날짜 단위 정밀도(`YYYY-MM-DD`)로만 표시한다.

### 3.11 반응형 · 접근성 (Ubiquitous)

- **REQ-B2CCONSULT-024**: 시스템은 Desktop(폼 폭 720px)과 Mobile(단일 컬럼 + sticky 하단 CTA) 두 반응형 레이아웃을 제공하며, 동의 상세 뷰는 Desktop Modal / Mobile Bottom Sheet로 분기하되 두 경우 모두 focus trap·ESC 닫기·닫을 때 트리거 요소로 포커스 복귀를 구현한다. 제출 검증 실패 시 오류 요약과 첫 오류 필드로의 포커스 이동, `aria-describedby`(필드-오류 연결), `aria-live`(상태 안내)를 제공하며, 채널 선택·동의·제출 전 과정이 키보드만으로 조작 가능하다.

### 3.12 회귀 방지 (Unwanted)

- **REQ-B2CCONSULT-025**: 시스템은 `pnpm visual:verify`의 기존 15화면(01 계열 10 + 02 계열 5) 정의·허용 오차·02의 승인된 시각 debt 4건을 수정하지 않으며, 이 SPEC이 추가하는 9화면은 기존 배열에 추가하는 방식으로만 확장한다. 상담 신청 성공 시 시스템은 `clearConsultationDraft()`를 호출해 상담 폼 draft만 정리하며, `DiagnosisResult` 핸드오프 자체는 삭제하지 않는다 — 핸드오프는 기존 정책(새 진단 시작 시 `clearDiagnosisHandoff()` 호출)에 의해서만 계속 제거된다. 성공·중복·실패 화면에서 "진단 결과로 돌아가기"를 눌렀을 때 제출 이전과 동일한 `resultId`의 진단 결과가 다시 표시됨을 보장한다(`design.md` §2.2). `DIAGNOSIS_ENGINE_READY`를 이 SPEC의 코드 어디에서도 `true`로 전환하지 않는다.

## 4. Out of Scope

### Out of Scope — 담보 매칭 엔진 및 데이터

- 실제 담보 매칭 엔진 연결·`DIAGNOSIS_ENGINE_READY` 전환은 다루지 않는다.
- 골절 외 케이스(암·뇌혈관·심장·디스크 등) 담보 데이터 확장은 다루지 않는다.
- 보상 금액 계산·지급 가능성 재산정 로직은 다루지 않는다.

### Out of Scope — 외부 연동

- 외부 손해사정사·제휴 법인 연결 구조 및 그에 필요한 제3자 제공 동의 활성화는 다루지 않는다.
- CRM·Slack·이메일 등 외부 알림 연동은 다루지 않는다.
- 자동 상담사 배정 로직·담당자별 데이터 모델은 다루지 않는다(03 화면의 담당자 카드는 정적 placeholder로만 구현).
- 마케팅 자동화(수신 동의 데이터를 실제 발송 시스템에 연결하는 것)는 다루지 않는다.

### Out of Scope — 법무 · 정책 확정

- 동의 상세("자세히 보기") 실제 법무 확정 문구는 다루지 않는다 — `design/internal/DEV-ONLY-상담-신청-동의-상세-구조.png`의 플레이스홀더는 그대로 유지되며, 확정 전 문구는 사용자 화면에 노출하지 않는다.
- 보유·이용 기간, 데이터 삭제 정책의 구체 값은 다루지 않는다(근거 없는 값을 사실처럼 표시하지 않는다).

### Out of Scope — 기존 승인 대상 불변

- SPEC-B2C-RESULT-001이 승인한 02의 시각 debt 4건을 변경하지 않는다.
- 모바일 01-D/01-E(결과 없음/분석 오류) 신규 디자인 생성은 다루지 않는다.

### Out of Scope — 부가 기능

- "기존 신청 상태 확인"의 실제 조회 기능(인증 없는 상태 조회 페이지 등)은 다루지 않는다 — 이 SPEC에서는 "준비 중" 스텁으로만 존재한다.
- Rate limiting의 정확한 윈도 크기·요청 한도 상수 값을 실제 트래픽 기반으로 미세 조정하는 운영 튜닝은 다루지 않는다 — 알고리즘·저장소 자체(DB 기반 고정 윈도, HMAC 처리된 IP)는 이 SPEC의 `design.md` §9.3에서 확정했으며 더 이상 run-phase 미결정 항목이 아니다.
