# Acceptance Criteria — SPEC-B2C-CONSULT-001

Given-When-Then 형식. 각 AC는 대응하는 REQ를 인용한다. 실제 PII 값(진짜 이름·전화번호)은 어떤 fixture·스냅샷에도 절대 커밋하지 않는다 — 명백히 가짜인 값("김보상"/"010-0000-0000" 등 디자인 목업과 동일한 표기)만 사용한다.

## 02 데이터 재사용 · 03 화면 구조

**AC-B2CCONSULT-001** (REQ-B2CCONSULT-001)
Given 02가 이미 계산한 `DiagnosisResult`가 `sessionStorage`에 존재할 때
When 03 화면이 진단 결과 요약을 렌더링하면
Then 표시되는 개수(검토 대상/추가 정보 필요 등)가 `computeAggregate(items)` 호출 결과와 정확히 일치하며, `components/consult/` 소스 코드 안에 이 집계를 독립적으로 재계산하는 로직이 존재하지 않는다(정적 검사).

추가 시나리오 — 03 전용 진단 결과 인계 채널 부재 검증:
Given `lib/consult/` 소스 코드 전체를 검사할 때
When `sessionStorage`에 직접 접근하는 지점을 찾으면
Then `DiagnosisResult` 관련 키는 오직 `lib/diagnosis/handoff.ts`가 정의한 기존 키(`bosang-radar:diagnosis-handoff-v1`)를 통해서만 읽히며, 03 전용의 새로운 진단 결과 저장 키가 별도로 존재하지 않는다.

**AC-B2CCONSULT-002** (REQ-B2CCONSULT-002)
Given `/consult` 화면이 렌더링되었을 때
When 브라우저 라우트(URL 경로, 쿼리 제외)를 카카오톡 선택 상태와 전화 선택 상태 각각에서 비교하면
Then 두 상태 모두 동일한 `/consult` 경로이며, 채널 전환이 페이지 이동(`router.push`) 없이 컴포넌트 내부 state 변경만으로 이루어진다.

## 02→03 CTA 활성화

**AC-B2CCONSULT-003** (REQ-B2CCONSULT-003)
Given `ENABLE_CONSULT_FLOW=true`이고 02 화면이 렌더링되었을 때
When 하단 "카카오톡으로 상담" CTA를 클릭하면
Then 브라우저가 `/consult?channel=kakao`로 이동한다.

추가 시나리오 — 4개 CTA 전부 매핑 검증:
Given 동일 조건에서
When 상단 탑바 CTA·후유장해 섹션 CTA·하단 전화 CTA를 각각 클릭하면
Then 각각 `/consult?channel=kakao`·`/consult`(채널 미지정)·`/consult?channel=phone`으로 이동한다.

**AC-B2CCONSULT-004** (REQ-B2CCONSULT-004)
Given `/consult?channel=fax`(지원하지 않는 값)로 직접 접근했을 때
When 화면이 렌더링되면
Then 오류나 빈 화면 없이 카카오톡 채널이 기본 선택된 상태로 정상 렌더링된다.

추가 시나리오 — 채널 쿼리 부재:
Given `/consult`(쿼리 없음)로 접근했을 때
When 화면이 렌더링되면
Then 카카오톡 채널이 기본 선택된 상태로 렌더링된다.

**AC-B2CCONSULT-005** (REQ-B2CCONSULT-005)
Given `ENABLE_CONSULT_FLOW=false`(02의 `shouldRenderDiagnosis`는 `true`인 상태 포함)일 때
When 02 화면의 상담 CTA를 클릭하면
Then 페이지 이동 없이 현재의 `aria-disabled` "준비 중" stub 동작이 그대로 유지된다.

## 02→03 핸드오프 · draft

**AC-B2CCONSULT-006** (REQ-B2CCONSULT-006)
Given 사용자가 03 폼에 이름·연락처를 입력한 뒤 필드에서 포커스를 뺐을 때
When `sessionStorage`를 검사하면
Then `lib/consult/draft.ts`의 전용 키 아래 해당 필드 값이 저장되어 있으며, 두 필수 동의 체크박스의 체크 상태는 저장되어 있지 않다.

추가 시나리오 — 손상된 draft 폴백:
Given `sessionStorage`의 draft 값이 유효하지 않은 JSON일 때
When `/consult`가 마운트되면
Then 콘솔 예외로 중단되지 않고 빈 draft(모든 필드 기본값)로 폼이 렌더링되며, 진단 결과 자체(`DiagnosisResult`)는 정상 표시된다(draft 손상이 진단 결과 오류 상태로 오인되지 않음).

**AC-B2CCONSULT-007** (REQ-B2CCONSULT-007)
Given `sessionStorage`에 진단 결과 핸드오프가 없는 상태(02를 경유하지 않은 직접 진입 포함)에서
When 사용자가 `/consult`에 접근하면
Then "먼저 진단 결과가 필요합니다" 03 전용 안내와 01 입력 화면으로 돌아가는 CTA가 표시되며, 상담 폼 자체는 렌더링되지 않는다.

**AC-B2CCONSULT-008** (REQ-B2CCONSULT-008)
Given `sessionStorage`의 진단 결과 핸드오프 값이 유효하지 않은 JSON이거나 스키마와 불일치할 때
When `/consult`가 마운트되면
Then 콘솔 예외로 애플리케이션이 중단되지 않고 03 전용 오류 상태가 표시된다.

**AC-B2CCONSULT-009** (REQ-B2CCONSULT-009)
Given 정상적으로 `/consult`에 도착해 진단 결과 요약이 표시된 상태에서
When 페이지를 새로고침하거나 뒤로가기 후 다시 `/consult`로 진입하면
Then 동일한 `resultId`를 가진 동일한 요약이 다시 표시되며, 신선도(TTL) 만료로 인한 별도 "결과 없음" 전환이 발생하지 않는다.

## 채널 선택 · 입력 폼

**AC-B2CCONSULT-010** (REQ-B2CCONSULT-010)
Given 전화 채널이 선택된 상태에서
When 연락 희망 시간 필드를 비운 채 제출을 시도하면
Then 검증 오류가 표시되고 요청이 서버로 전송되지 않는다.

추가 시나리오 — 카카오톡 채널에서는 선택 입력:
Given 카카오톡 채널이 선택된 상태에서
When 연락 희망 시간을 비운 채 다른 필수 값을 모두 채우고 제출하면
Then 그 필드에 대한 검증 오류 없이 제출이 진행된다.

**AC-B2CCONSULT-011** (REQ-B2CCONSULT-011)
Given 연락처 입력값이 `"010 0000 0000"`(공백 포함)일 때
When `normalizePhone`을 호출하면
Then 하이픈·공백이 제거된 정규화 값을 반환하고, 이 값으로부터 `formatPhoneDisplay`는 `"010-0000-0000"`을, `maskPhone`은 `"010-****-0000"`을 각각 파생한다.

추가 시나리오 — 정규화 실패 거부:
Given 연락처 입력값이 `"12345"`(국내 휴대폰 번호 형식이 아님)일 때
When `ConsultationRequestSchema.safeParse`를 실행하면
Then `success: false`를 반환한다.

## 동의 구조

**AC-B2CCONSULT-012** (REQ-B2CCONSULT-012)
Given 필수 동의 ①만 체크되고 필수 동의 ②는 체크되지 않은 상태에서
When 제출 버튼 상태를 확인하면
Then 버튼이 비활성 상태다.

추가 시나리오 — 마케팅 동의는 게이트에 무관:
Given 필수 동의 ①·②가 모두 체크되고 선택 동의 ③(마케팅)은 체크되지 않은 상태에서
When 제출 버튼 상태를 확인하면
Then 버튼이 활성 상태다.

**AC-B2CCONSULT-013** (REQ-B2CCONSULT-013)
Given 필수 동의 ①의 체크박스가 체크되지 않은 상태에서
When "자세히 보기"를 눌러 상세 뷰를 열고 닫으면
Then 체크박스는 여전히 체크되지 않은 상태다.

**AC-B2CCONSULT-014** (REQ-B2CCONSULT-014)
Given 03/M03 화면 전체를 렌더링했을 때
When 제3자 제공 동의 관련 UI 요소를 찾으면
Then 활성화된 상태로 존재하지 않는다(렌더링되지 않거나, 렌더링되더라도 비활성/숨김 상태만 존재).

## 이중 제출 방지

**AC-B2CCONSULT-015** (REQ-B2CCONSULT-015)
Given 제출 요청이 아직 응답을 받지 못한 상태(진행 중)에서
When 사용자가 제출 버튼을 다시 클릭하거나 Enter를 반복 입력하면
Then 두 번째 HTTP 요청이 발생하지 않으며 버튼에 `aria-busy="true"`가 부여되어 있다.

## 상담 데이터 계약

**AC-B2CCONSULT-016** (REQ-B2CCONSULT-016)
Given `ConsultationRequestSchema`를 알 수 없는 추가 키를 포함한 객체로 파싱할 때
When `safeParse`를 실행하면
Then `success: false`를 반환한다.

추가 시나리오 — 이름 길이·빈 문자열 거부:
Given `name`이 빈 문자열이거나 21자 이상일 때
When `safeParse`를 실행하면
Then 두 경우 모두 `success: false`를 반환한다.

추가 시나리오 — 미지원 채널 거부:
Given `channel`이 `"fax"`처럼 지원하지 않는 값일 때
When `safeParse`를 실행하면
Then `success: false`를 반환한다.

추가 시나리오 — `preferredCallTime` 조건부 필수(`.refine`):
Given `channel: "phone"`이면서 `preferredCallTime`이 없을 때
When `safeParse`를 실행하면
Then `success: false`를 반환하며, `channel: "kakao"`이면서 `preferredCallTime`이 없는 동일 조건에서는 `success: true`를 반환한다.

**AC-B2CCONSULT-017** (REQ-B2CCONSULT-017)
Given 클라이언트가 페이로드에 `applicationStatus: "resolved"`(서버 소유 필드에 임의 값)를 포함해 전송했을 때
When 서버가 이 요청을 처리하면
Then 저장된 레코드의 `applicationStatus`는 클라이언트가 보낸 값이 아니라 서버 기본값(`"received"`)이다.

추가 시나리오 — `consentVersion` 서버 스탬프:
Given `ConsultationRequestSchema`(클라이언트 제출 페이로드) 정의를 검사할 때
When `consentVersion` 필드의 존재 여부를 확인하면
Then 이 스키마에 `consentVersion` 필드가 존재하지 않는다(클라이언트가 값을 보낼 방법이 없다) — 저장된 `consultations.consentVersion`은 항상 서버가 자체 상수로 채운다.

## 서버 API

**AC-B2CCONSULT-018** (REQ-B2CCONSULT-018)
Given 필수 동의가 `false`인 페이로드로 `POST /api/consultations`를 호출했을 때
When 응답을 확인하면
Then HTTP 400과 `{status:"error", code:"validation", fieldErrors:{...}}`가 반환된다.

추가 시나리오 — 로그에 PII 부재:
Given 유효한 이름·연락처를 포함한 요청이 처리되었을 때
When 그 요청에 대해 기록된 서버 로그 전체를 검사하면
Then `name`/`contact` 원본 문자열이 어떤 로그 라인에도 존재하지 않는다(정적/런타임 검사).

추가 시나리오 — 오류 응답에도 PII 미포함:
Given 검증 실패로 400 응답이 반환되었을 때
When 응답 본문을 검사하면
Then 클라이언트가 보낸 `name`/`contact` 원본 값이 echo되어 있지 않다.

**AC-B2CCONSULT-019** (REQ-B2CCONSULT-019)
Given `consultations` 테이블 스키마(`lib/db/schema.ts`)를 검사할 때
When 컬럼 목록을 확인하면
Then `resultId`/`channel`/`name`/`contactNormalized`/`preferredCallTime`/동의 3종/`consentVersion`/`applicationStatus`/`idempotencyKey`/`createdAt`/`updatedAt`이 존재하며, `DiagnosisResult.items`(담보 항목 배열) 또는 그 축약형을 저장하는 컬럼은 존재하지 않는다.

## 중복 · 멱등성

**AC-B2CCONSULT-020** (REQ-B2CCONSULT-020)
Given `resultId="r1"`, 정규화 연락처가 동일한 두 번째 요청이 서로 다른 `idempotencyKey`로 도착했을 때
When 서버가 두 번째 요청을 처리하면
Then HTTP 409와 `{status:"duplicate"}`가 반환되고 새 레코드가 생성되지 않는다.

추가 시나리오 — 동일 `idempotencyKey` 재시도는 성공으로 처리:
Given 첫 요청이 이미 성공 처리된 뒤, 동일한 `idempotencyKey`로 같은 요청이 다시 도착했을 때
When 서버가 처리하면
Then 새 레코드를 생성하지 않고 기존 레코드 기준의 `{status:"success"}`를 반환한다.

추가 시나리오 — 서로 다른 사람의 정당한 재상담 허용:
Given `resultId`는 동일하지만 정규화 연락처가 서로 다른 두 요청이 도착했을 때(가족 구성원이 각자 다른 번호로 문의)
When 서버가 두 요청을 순차 처리하면
Then 둘 다 별개의 레코드로 성공 저장된다(과차단되지 않음).

**AC-B2CCONSULT-021** (REQ-B2CCONSULT-021)
Given 완전히 동일한 페이로드(같은 `idempotencyKey`)를 가진 요청 5개가 사실상 동시에 도착했을 때
When 서버가 이 요청들을 병렬 처리하면
Then `consultations` 테이블에서 해당 `idempotencyKey`를 가진 레코드가 정확히 1개만 존재한다(통합 테스트로 증명).

## 성공 · 중복 · 실패 상태

**AC-B2CCONSULT-022** (REQ-B2CCONSULT-022)
Given 제출 요청이 네트워크 타임아웃으로 응답을 받지 못했을 때
When 03-D 실패 화면이 표시되면
Then "저장되었습니다"류의 확정 문구가 없으며, "다시 시도하기"를 눌렀을 때 최초 제출과 동일한 `idempotencyKey`가 재전송되고, 화면에 표시되던 채널·이름·연락처·연락 희망 시간 값이 그대로 유지된다.

추가 시나리오 — 서버 500 응답도 동일하게 처리:
Given 서버가 500을 반환했을 때
When 03-D 화면을 확인하면
Then 위와 동일한 문구·재시도 동작·입력 보존이 적용된다.

**AC-B2CCONSULT-023** (REQ-B2CCONSULT-023)
Given 서버가 `{status:"duplicate"}`를 반환했을 때
When 03-C 화면을 렌더링하면
Then 마스킹된 연락처(`010-****-1234` 형식)·접수일·처리 상태 라벨만 표시되고, 기존 신청의 내부 `consultationId`나 전체 페이로드는 DOM 어디에도 노출되지 않는다.

## 반응형 · 접근성

**AC-B2CCONSULT-024** (REQ-B2CCONSULT-024)
Given 뷰포트 폭이 1440px(Desktop)일 때
When `/consult`를 렌더링하면
Then 폼 컨테이너의 최대 폭이 720px이며, 필수 동의 두 항목을 체크하지 않고 제출을 시도하면 오류 요약이 표시되고 포커스가 첫 오류 필드로 이동한다.

추가 시나리오 — Mobile sticky CTA + Bottom Sheet:
Given 뷰포트 폭이 390px(Mobile)일 때
When `/consult`를 스크롤하고 "자세히 보기"를 누르면
Then 제출 CTA가 화면 하단에 sticky로 고정되어 있고, 동의 상세는 Modal이 아니라 Bottom Sheet로 열리며 ESC 또는 닫기 조작 시 트리거 버튼으로 포커스가 복귀한다.

추가 시나리오 — 전체 키보드 조작성:
Given 마우스를 사용하지 않고
When `Tab`/방향키/`Space`/`Enter`만으로 채널 선택 → 폼 입력 → 동의 체크 → 제출까지 진행하면
Then 모든 단계가 키보드만으로 완료 가능하다.

## 회귀 방지

**AC-B2CCONSULT-025** (REQ-B2CCONSULT-025)
Given `pnpm visual:verify`를 이 SPEC의 run-phase 구현 완료 후 전체 실행할 때
When 결과를 확인하면
Then 기존 15화면(01 계열 10 + 02 계열 5)이 여전히 PASS하고, 이 SPEC이 추가한 9화면(03/03-A2/03-B/03-C/03-D, M03/M03-B/M03-C/M03-D)도 PASS한다(총 24화면).

추가 시나리오 — 핸드오프 정리:
Given 상담 신청이 성공적으로 접수되었을 때
When `sessionStorage`를 검사하면
Then 진단 결과 핸드오프 키와 상담 draft 키가 모두 제거되어 있다.

추가 시나리오 — `DIAGNOSIS_ENGINE_READY` 미전환:
Given 이 SPEC이 전달하는 전체 코드 diff를 검사할 때
When `DIAGNOSIS_ENGINE_READY`를 `true`로 대입하는 코드 지점을 검색하면
Then 매칭 결과가 0건이다.

## Quality Gate 기준

- **프로덕션 빌드 검증**: `next build`(또는 `package.json`이 정의한 동등 빌드 스크립트)가 `/consult` 라우트와 `/api/consultations` 라우트를 포함해 오류·경고 없이 성공해야 한다.
- **커버리지**: 신규 `lib/consult/`, `components/consult/`, `app/api/consultations/` 대상 85% 이상(TRUST 5 Tested 기준, `moai-constitution.md`).
- **회귀 게이트**: `e2e/diagnosis-flow-01.spec.ts`·`e2e/diagnosis-flow-02.spec.ts`(존재 시)와 기존 `pnpm visual:verify` 15화면이 이 SPEC의 run-phase 완료 후에도 계속 PASS해야 한다(AC-B2CCONSULT-025의 상위 조건).
- **레이스 안전성**: AC-B2CCONSULT-021의 동시성 통합 테스트가 CI에서 재현 가능해야 한다(flaky 없이).
