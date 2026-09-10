---
id: SPEC-PILOT-READY-001
title: "파일럿 배포 준비 — 운영 검증, 최소 idempotency 가드, 데이터 취급 고지"
version: "0.1.0"
status: draft
created: 2026-09-10
updated: 2026-09-10
author: Nexsol
priority: P1
phase: "v1.0.0 target"
module: "app/api/cases/, lib/cases/, lib/pipeline/, app/cases/new/, app/login/, .moai/docs/"
lifecycle: spec-anchored
tags: "pilot, deployment-readiness, idempotency, logging, data-handling, observability"
tier: M
depends_on: [SPEC-RUNTIME-001, SPEC-GEMINI-RUNTIME-001, SPEC-PILOT-UX-001]
---

## HISTORY

- 2026-09-10: 최초 작성 (Nexsol) — 10명의 외부 전문가(보험설계사/손해사정사) 파일럿 착수 전,
  이미 완성된 사건 입력→Gemini 6단계 리서치 파이프라인→리포트→구조화 피드백 흐름을
  실제 배포 환경에서 안전하게 가동하기 위한 최소 범위의 배포 준비 SPEC. 신규 비즈니스
  기능은 도입하지 않으며, ①측정·검증형 운영 전제조건(호스팅 타임아웃, DB 마이그레이션,
  인증 설정, 동시성 측정, 스모크 재검증), ②Gemini 쿼터 사전 점검이라는 운영 체크리스트
  항목, ③파일럿 규모(10명)에 맞춘 최소 서버측 idempotency 가드, ④최소 구조적 로깅,
  ⑤최소 장애 대응 런북, ⑥데이터 취급 고지 정직성 개선(비식별 보장 범위 명확화 + 연락
  채널 + 예시)으로 범위를 고정한다. 모든 항목은 오케스트레이터 세션에서 4개 병렬
  조사 에이전트(git/PR 상태, 로드맵 3단계 분류, 배포 준비 갭, 데이터 계약 연결)가
  실제 코드베이스를 read-only로 조사해 확인한 구체적 결함·갭만을 근거로 삼는다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

`app/cases/new/case-input-form.tsx`(사건 입력) → `lib/cases/create-case.ts`(파이프라인 동기
실행) → `app/cases/[caseId]/page.tsx`(리포트 표시) → `app/cases/[caseId]/feedback-form.tsx`
(구조화 피드백 제출)로 이어지는 핵심 흐름은 SPEC-RESEARCH-001·SPEC-GEMINI-RUNTIME-001·
SPEC-EVIDENCE-001·SPEC-FEEDBACK-001·SPEC-PILOT-UX-001을 거치며 기능·UX 양면에서 이미
완성되어 있다(전체 10개 기존 SPEC 모두 `status: completed` — 조사 세션에서
`.moai/specs/*/spec.md`의 frontmatter를 직접 읽어 확인). 그러나 이 흐름은 **로컬 개발
환경에서 2회의 수동 smoke 테스트(`.moai/reports/gemini-smoke-20260827.md`,
`.moai/reports/gemini-runtime-smoke-20260828.md`)로만 검증됐을 뿐, 실제 배포 대상(Vercel
등)에서 파일럿 동시 사용 규모(10명)로 가동해 본 적이 없다.** 조사 세션이 read-only로
확인한 구체적 배포 리스크는 다음과 같다:

- **호스팅 타임아웃 미확인**: 이 프로젝트에 유료 Vercel 플랜 사용의 증거가 없어(조사
  세션 기준), Vercel Hobby(무료) tier가 배포 대상이라고 가정해야 한다. `POST /api/cases`의
  실측 처리 시간은 로컬에서 30초(`.moai/reports/gemini-runtime-smoke-20260828.md` §실행
  로그 5번 — curl 실측)였는데, 이 값이 실제 배포 환경의 서버리스 함수 실행 시간 상한
  안에 들어오는지 확인된 바 없다.
- **Gemini 쿼터가 코드 기본값(4 RPM)으로 미확정**: `.env.local.example:64,67`의
  `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET` 기본값은 `4`이며,
  `.moai/reports/gemini-runtime-smoke-20260828.md` §잔여 위험이 "이번 세션은 AI Studio
  대시보드 접근 수단이 없어 코드 기본값 4를 그대로 사용했다 — 실제 프로젝트의 정확한
  무료 tier 한도를 확인할 수 있는 세션에서 70~80% 값으로 재조정하는 것이 권장된다"고
  명시적으로 남긴 미해결 과제다.
- **원격 DB 마이그레이션/시드가 로컬 `file:` DB로만 검증됨**: `.moai/docs/runtime-runbook.md`
  §1이 로컬 파일 DB 경로("가장 빠른 시작 경로")를 문서화하고 있으나, `pnpm db:migrate`/
  `pnpm db:seed`/`pnpm tester:add` 흐름이 실제 원격 Turso 인스턴스(`libsql://`)에 대해
  실행된 기록이 조사 세션에서 확인되지 않았다.
- **인증 설정이 localhost 전제로만 동작 확인됨**: 2026-08-28 스모크는 `BETTER_AUTH_URL`을
  로컬 포트(`:3006`)로 맞춘 상태에서만 수행됐다(`.moai/reports/gemini-runtime-smoke-20260828.md`
  §실행 로그 5번) — 실제 배포 도메인을 가리키는 `BETTER_AUTH_URL`로 로그인이 실제로
  동작하는지는 확인된 바 없다.
- **동시성 보호가 전혀 없음**: `lib/pipeline/index.ts:43`의 주석이 스스로 명시하듯,
  `withPipelineLock`(`:51`)은 "모듈 스코프 변수이므로 Vercel의 서로 다른 serverless
  인스턴스(별도 프로세스)" 사이에서는 아무 보호도 제공하지 않는다. 동시 요청 시 실제
  거동(성공/실패/지연/인스턴스 간 경쟁 증상)이 측정된 적이 없다.
- **재제출 시 파이프라인 중복 실행을 막는 서버측 가드가 전혀 없음**: `lib/cases/create-case.ts`
  (`:38-72`)를 읽으면, `cases` 테이블 행은 `runPipeline`(`:49`, 값비싼 3회 Gemini 호출) 완료
  **이후**에야 `status: "completed"`로 1회 INSERT된다(`:55-62`). 파이프라인 실행 이전에
  기록되는 "처리 중" 상태가 전혀 없으므로, 네트워크 타임아웃 이후 사용자가 재시도하면
  서버는 이를 구분할 방법 없이 파이프라인을 처음부터 다시 실행한다. `cases.status`
  컬럼(`lib/db/schema.ts:75`, 기본값 `"pending"`) 자체는 이미 존재하지만 이 상태 전이가
  파이프라인 실행 이전에 활용되지 않고 있다 — SPEC-PILOT-UX-001 iteration 3에서 명시적으로
  기각된 DB-nonce 방식(§Out of Scope 참고)과는 다른, 훨씬 단순한 기존 컬럼 재사용
  기회다.
- **애플리케이션 레벨 로깅이 전무함**: `app/api/cases/route.ts`, `lib/cases/create-case.ts`,
  `lib/pipeline/index.ts`, `lib/ai/providers/gemini.ts` 어디에도 요청 시작/파이프라인
  단계 실패/DB 쓰기 실패에 대한 구조적 로그 출력이 없다(조사 세션 grep 확인) — 파일럿
  중 장애가 발생하면 원인 파악 수단이 없다.
- **데이터 취급 고지가 과대 주장 위험을 안고 있음**: `lib/validation/case-input.ts`가 실제로
  하는 일은 (a) `RESIDENT_REGISTRATION_NUMBER_PATTERN`/`PHONE_NUMBER_PATTERN` 정규식으로
  주민등록번호·전화번호 **형식**을 구조적으로 거부하고(`:17,20,26-31`), (b) `.strict()`로
  주소·의료기록 원본 등 애초에 정의되지 않은 필드를 거부하는 것(`:36-43`)뿐이다. 3개
  자유 텍스트 필드(`incidentDescription`/`diagnosisName`/`disabilityBodyPart`)에 타이핑된
  임의의 이름·기타 식별정보는 전혀 스캔하지 않는다. 그런데 `app/cases/new/page.tsx:56`의
  현재 고지 문구("비식별 요약만 입력하세요")는 스키마가 실제로 무엇을 막고 무엇을 막지
  않는지, 그리고 "합성/이미 비식별화된 사례만 가져와야 한다"는 테스터 책임을 명시하지
  않는다. 로그인 화면 하단의 "고객지원" 링크(`app/login/login-form.tsx:14,131`)는
  `aria-disabled="true"`로 비활성 상태이며(`:131`), 실제 문의 채널이 연결되어 있지 않다.
  비식별 입력의 구체적 예시도 어디에도 없다(조사 세션 grep 확인).

### WHAT — 이번 SPEC 범위

신규 비즈니스 기능을 도입하지 않고, 10개 영역으로 범위를 고정한다:

1. 호스팅 타임아웃 실측 및 문서화 (측정형)
2. Gemini 쿼터 사전 점검 (운영 체크리스트)
3. 원격 DB 마이그레이션/시드 실행 검증 (측정형)
4. 실제 배포 도메인 인증 설정 검증 (측정형)
5. 동시성 실측 및 문서화 — 큐/락 서비스 도입 없음 (측정형)
6. 최소 서버측 재제출 가드 — 기존 `cases.status` 컬럼 재사용 (코드 변경)
7. 최소 구조적 로깅 (코드 변경)
8. 최소 장애 대응 런북 (문서)
9. 실 Gemini 스모크 재검증 (측정형)
10. 데이터 취급 고지 정직성 개선 — 한계 명시, 연락 채널, 예시 (코드+문서 변경)

기존 API·DB 스키마·파이프라인 알고리즘 계약은 수정하지 않는다. 유일한 데이터 계층
변경은 REQ-PILOT-READY-007(재제출 가드)이 `cases.status` 컬럼(이미 존재, 기본값
`"pending"`)의 기존 값을 파이프라인 실행 **이전** 시점에 활용하는 것뿐이며, 이는
컬럼 추가나 마이그레이션이 아니다.

### 핵심 판단 근거 — Tier M

영향 파일은 `app/api/cases/route.ts`, `lib/cases/create-case.ts`, `lib/pipeline/index.ts`,
`lib/ai/providers/gemini.ts`, `app/cases/new/case-input-form.tsx` 또는 `page.tsx`,
`app/login/login-form.tsx`, `.moai/docs/runtime-runbook.md`(확장) 또는 신규
`.moai/docs/incident-runbook.md`, 그리고 신규 측정/검증 리포트 3-4건으로 약 8-10개,
예상 변경량 300-600 LOC 범위다. DB 스키마 마이그레이션은 없다(기존 컬럼 재사용).
파일 수가 Tier S 기준(5개 미만)을 넘고, 서로 다른 10개 요구사항 그룹(운영 측정 5개 +
코드 변경 3개 + 데이터 고지 개선까지)에 걸쳐 배포·코드·문서 3개 계층을 모두 다루므로
Tier M으로 분류한다(15개 파일·1000 LOC를 넘지 않아 Tier L에는 해당하지 않는다).

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 호스팅 타임아웃 실측 (Hosting Timeout Measurement)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-001 | Ubiquitous | 이 SPEC의 배포 준비 계획은 Vercel Hobby(무료) tier를 배포 대상으로 가정해야 한다 — 이 프로젝트에 유료 플랜 사용의 증거가 조사 세션에서 확인되지 않았기 때문이다. | 오케스트레이터 조사 세션(배포 준비 갭 조사), 유료 플랜 증거 부재 확인 |
| REQ-PILOT-READY-002 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, 실제 배포된 환경에서 `POST /api/cases`의 실제 요청 처리 시간(로컬 실측 기준선: 30초, `.moai/reports/gemini-runtime-smoke-20260828.md` §실행 로그 5번)을 측정하고, 그 값이 Vercel Hobby tier의 서버리스 함수 실행 시간 상한 안에 들어오는지 문서로 남겨야 한다. 상한을 초과하면 해결 방법(플랜 업그레이드, 파이프라인 단축 등)은 이 SPEC의 범위가 아니며 후속 SPEC으로 명시적으로 미룬다. | 사용자 지시(측정 후 문서화, "빠르게 만들라"는 AC 아님), 유료 플랜 미확인 상태 |

### B. Gemini 쿼터 사전 점검 (Operational Checklist)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-003 | Ubiquitous | 파일럿 런칭 이전, 실제 사용 중인 Gemini API 키의 AI Studio 쿼터 대시보드를 사람이 직접 확인하고, 관측된 실제 한도의 약 70~80% 값으로 `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`(현재 코드 기본값 4, `.env.local.example:64,67`)를 설정해야 한다는 운영 전제조건이 체크리스트로 문서화되어야 한다 — 이 REQ는 코드 변경을 요구하지 않는다. | `.moai/reports/gemini-runtime-smoke-20260828.md` §잔여 위험(대시보드 접근 세션에서 재조정 권장 — 미해결 과제로 명시적으로 남김), `.env.local.example:64,67` |

### C. 원격 DB 마이그레이션/시드 실행 검증 (Remote DB Verification)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-004 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, 기존 `pnpm db:migrate` → `pnpm db:seed` → `pnpm tester:add` 흐름(`.moai/docs/runtime-runbook.md`에 이미 문서화됨)을 로컬 `file:` DB가 아닌 실제 원격 Turso 인스턴스(`libsql://` 또는 `https://` 스킴)에 대해 실제로 1회 실행하고, 그 결과(성공/실패, 관측된 오류)를 문서로 남겨야 한다 — 이 REQ는 새로운 마이그레이션 도구를 만들지 않으며, 기존 런북이 실제 원격 대상에도 적용됨을 검증하는 것만을 목적으로 한다. | `.moai/docs/runtime-runbook.md` §1(로컬 file: DB 경로만 검증됨), 원격 실행 기록 부재 확인 |

### D. 실제 배포 도메인 인증 설정 검증 (Auth Config Verification)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-005 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, `BETTER_AUTH_URL`(및 도메인에 종속되는 그 밖의 인증 관련 환경변수)을 실제 배포된 도메인으로 설정하고, 그 도메인에 대해 실제 로그인 테스트를 수행해 성공을 확인해야 한다. | `.moai/reports/gemini-runtime-smoke-20260828.md` §실행 로그 5번(로컬 포트 `:3006`으로만 검증됨), 실 배포 도메인 로그인 검증 기록 부재 확인 |

### E. 동시성 실측 (Concurrency Measurement — 측정 only, 큐/락 도입 없음)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-006 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, 실제 배포 대상(또는 가장 근접한 가용 환경)에 대해 3~5개의 동시(simultaneous) `POST /api/cases` 요청을 실제로 발생시키고, 관측된 거동(성공/실패/지연/인스턴스 간 경쟁 증상)을 문서로 남겨야 한다 — 이 REQ는 큐, Redis, 락 서비스 등 새로운 동시성 인프라의 도입을 요구하지 않으며, 그러한 도입이 필요한지에 대한 판단은 이 측정 결과를 근거로 한 후속 SPEC의 몫으로 명시적으로 미룬다. | 사용자 지시(측정 우선, 검증되지 않은 근거로 사전에 인프라를 도입하지 말 것), `lib/pipeline/index.ts:43,51`(모듈 스코프 락이 서로 다른 serverless 인스턴스 간 보호를 전혀 제공하지 않음을 코드 주석이 스스로 명시) |

### F. 최소 서버측 재제출 가드 (Minimal Resubmission Guard)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-007 | While | While 어떤 사용자의 사건 생성 요청이 이미 접수되어 파이프라인이 처리 중인 상태(파이프라인 완료 전)이면, 그 사용자로부터 새로운 사건 생성 요청이 도착했을 때 시스템은 그 사용자에 대해 두 번째 리서치 파이프라인 실행을 동시에 시작해서는 안 되며, 새 요청에는 정상적으로 접수된 새 제출과 구분되는 응답("이미 처리 중" 신호)을 반환해야 한다 — 이는 파일럿 규모(10명 테스터)에 맞춘 최소 가드이며, SPEC-PILOT-UX-001 iteration 3에서 명시적으로 기각된 `submissionNonce` 컬럼 + unique index 방식(§Out of Scope 참고)을 재도입하지 않는다. | 사용자 지시(타임아웃/실패 후 재제출 시 중복 파이프라인 실행 방지, 최소 범위), `lib/cases/create-case.ts:38-72`(파이프라인 실행 이전에 기록되는 상태가 전혀 없음), `lib/db/schema.ts:75`(`cases.status` 컬럼이 이미 존재, 재사용 가능) |

### G. 최소 구조적 로깅 (Minimal Structured Logging)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-008 | Ubiquitous | 사건 생성 critical path(`app/api/cases/route.ts`, `lib/cases/create-case.ts`, `lib/pipeline/index.ts`, `lib/ai/providers/gemini.ts`)는 최소한 (a) 요청 시작, (b) 파이프라인 단계 실패, (c) DB 쓰기 실패의 3가지 이벤트에 대해 구조적 로그를 출력해야 한다 — 새로운 로깅 라이브러리 의존성 도입 없이, 파일럿 규모에 맞는 최소 수준(예: console 기반)으로 충분하다. | 조사 세션 grep 확인(critical path 4개 파일 어디에도 애플리케이션 레벨 로그 출력 없음) |

### H. 최소 장애 대응 런북 (Minimal Incident Runbook)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-009 | Ubiquitous | 파일럿 테스터가 장애를 신고했을 때 운영자가 참고할 수 있는 짧은 장애 대응 런북이 존재해야 하며, 최소한 (a) REQ-PILOT-READY-008의 로그를 어디서 확인하는지, (b) 테스터에게 안전하게 재시도를 안내하는 방법, (c) 이슈를 누가 최종 책임지는지(triage 담당)를 포함해야 한다 — 기존 `.moai/docs/runtime-runbook.md`(로컬 개발 환경 절차)와는 별개의 문서 또는 별개 섹션이어야 한다. | 사용자 지시(장애 대응 절차 필요), 기존 런북이 로컬 개발 환경만 다룸(범위 불일치) |

### I. 실 Gemini 스모크 재검증 (Fresh Smoke Revalidation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-010 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, 현재 main HEAD(이 SPEC의 run-phase 시점 기준) 또는 그 이후 커밋에 대해 실 Gemini 스모크 테스트(`.moai/reports/gemini-runtime-smoke-20260828.md`와 동일한 방법론 — 코드 임시 수정 없음, 관측기 기반 logical call count 확인)를 재실행하고 새 리포트로 남겨야 한다. | 사용자 지시(마지막 실 Gemini 증거가 13일·4개 SPEC만큼 stale), `.moai/reports/gemini-runtime-smoke-20260828.md`(2026-08-28 시점, `feat/SPEC-GEMINI-RUNTIME-001@fb23553` 기준 — 이후 SPEC-EVIDENCE-001/SPEC-FEEDBACK-001/SPEC-PILOT-UX-001/SPEC-PILOT-VISUAL-001/SPEC-UI-MIGRATION-001/SPEC-E2E-AUTH-STATE-001가 병합됨) |

### J. 데이터 취급 고지 정직성 (Data-Handling Disclosure Honesty)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-011 | Unwanted | 이 SPEC이 도입·수정하는 어떤 파일럿 온보딩 문구·UI 텍스트·문서도 `lib/validation/case-input.ts`의 입력 스키마가 사건 데이터의 완전한 비식별화를 "보장"한다고 주장하거나 암시해서는 안 된다. | 사용자 지시(HARD constraint — 과대 주장 금지), `lib/validation/case-input.ts:17,20,26-31,36-43`(주민등록번호·전화번호 형식 및 미정의 필드만 구조적으로 차단하며, 3개 자유 텍스트 필드에 타이핑된 임의의 식별정보는 전혀 스캔하지 않음을 코드로 직접 확인) |
| REQ-PILOT-READY-012 | Ubiquitous | 파일럿 온보딩 문구(사건 입력 화면 또는 그에 준하는 위치)는 스키마가 실제로 차단하는 것(주민등록번호·전화번호 형식, 주소·의료기록 원본 필드의 부재)과 차단하지 않는 것(3개 자유 텍스트 필드에 타이핑된 임의의 식별정보는 스캔하지 않음)을 명시적으로 구분해 설명해야 하며, 테스터가 이미 합성(synthetic)이거나 이미 비식별화된 사례만 가져와야 한다는 책임을 명시적으로 진술해야 한다 — 현재 문구("비식별 요약만 입력하세요", `app/cases/new/page.tsx:56`)는 이 구분을 제공하지 않는다. | REQ-PILOT-READY-011과 동일 근거, `app/cases/new/page.tsx:56` 현재 문구 조사 |
| REQ-PILOT-READY-013 | Ubiquitous | 데이터 취급 문의를 위한 실제로 동작하는 연락 채널(이메일 주소 또는 그에 준하는 링크)이 추가되어야 한다 — 현재 로그인 화면 하단의 "고객지원" 링크(`app/login/login-form.tsx:14,131`)는 `aria-disabled="true"`로 비활성 상태이며 실제 채널에 연결되어 있지 않다. | `app/login/login-form.tsx:14,131` 조사 확인(비활성 placeholder) |
| REQ-PILOT-READY-014 | Ubiquitous | 사건 입력 화면(또는 그에 준하는 온보딩 위치)에는 올바르게 비식별화·합성 처리된 사건 입력의 구체적 예시가 최소 1건 포함되어야 한다. | 조사 세션 grep 확인(현재 저장소 전체에 비식별 입력의 구체적 예시가 존재하지 않음) |

## Out of Scope

### Out of Scope — Vercel CI/CD 자동화

- 정식 Vercel CI/CD 배포 자동화 파이프라인 구축은 이 SPEC의 범위가 아니다 — 이 SPEC은
  Hobby tier 가정 하에서의 타임아웃 실측·문서화(REQ-PILOT-READY-002)까지만 다룬다.

### Out of Scope — 프로덕션 로그인 rate-limiting 강화

- 로그인 엔드포인트의 프로덕션 수준 rate-limiting 강화는 이 SPEC의 범위가 아니다.

### Out of Scope — Gold Dataset 추출/집계 도구

- 축적된 구조화 피드백을 Gold Dataset으로 추출·가공하는 도구는 이 SPEC의 범위가
  아니다(SPEC-FEEDBACK-001에서 이미 후속 SPEC으로 명시적으로 미뤄진 항목).

### Out of Scope — PostgreSQL 마이그레이션 실행

- Turso/libSQL에서 PostgreSQL로의 마이그레이션 실행은 이 SPEC의 범위가 아니다.

### Out of Scope — 대규모 evidence corpus 확장

- 신규 판례·약관 대량 추가 등 근거자료 코퍼스 확장은 이 SPEC의 범위가 아니다.

### Out of Scope — 테스터 모집/초대 및 파일럿 실제 실행

- 실제 테스터 모집, 초대, 파일럿의 실제 실행 자체(사람이 실제로 사건을 입력하고
  피드백을 제출하는 것)는 이 SPEC의 범위가 아니다 — 이 SPEC은 그 실행을 안전하게
  가능하게 하는 배포 준비까지만 다룬다.

### Out of Scope — 실 Gemini 기반 코퍼스 품질 평가

- 대표성 있는 사례 표본에 대해 실제 Gemini로 코퍼스 품질(예: `counterEvidenceIds`가
  항상 빈 배열인 현상의 원인 규명)을 평가하는 작업은 이 SPEC의 범위가 아니다.

### Out of Scope — 완료/피드백 집계 대시보드

- 사용자별 완료 현황이나 피드백 집계를 보여주는 대시보드는 이 SPEC의 범위가 아니다.

### Out of Scope — 분산 서버측(DB 기반) idempotency (nonce/unique-index 방식)

- SPEC-PILOT-UX-001 iteration 3에서 외부 독립 리뷰에 의해 명시적으로 기각된
  `submissionNonce` 컬럼 + unique index 방식(예약/완료 상태 전이, 크래시 복구를 포함하는
  진정한 분산 idempotency)은 이 SPEC에서도 재도입하지 않는다. REQ-PILOT-READY-007은 이와
  다른, 기존 `cases.status` 컬럼을 재사용하는 훨씬 단순한 메커니즘이다.

## §3. 인수 조건 요약

인수 조건 전체(Given-When-Then 시나리오)는 `.moai/specs/SPEC-PILOT-READY-001/acceptance.md`에
정의한다(Tier M — 별도 파일).

## §4. 교차 참조

- `SPEC-RUNTIME-001` — `.moai/docs/runtime-runbook.md`의 출처, 환경변수 스코프 매트릭스 — REQ-PILOT-READY-004/005의 기반
- `SPEC-GEMINI-RUNTIME-001` — Gemini 파이프라인 실행 런타임(`withPipelineLock`, RateScheduler)의 출처 — REQ-PILOT-READY-002/003/006의 기반
- `SPEC-PILOT-UX-001` — 클라이언트측 single-flight 가드 및 기각된 DB-nonce idempotency 설계 이력의 출처 — REQ-PILOT-READY-007이 그 판단을 그대로 계승
- `SPEC-EVIDENCE-001` / `SPEC-FEEDBACK-001` — REQ-PILOT-READY-010(스모크 재검증)이 stale 여부를 판단하는 기준이 되는, 마지막 스모크 이후 병합된 SPEC들
- `.moai/reports/gemini-runtime-smoke-20260828.md` — REQ-PILOT-READY-002/003/010의 직접적 실측 근거
