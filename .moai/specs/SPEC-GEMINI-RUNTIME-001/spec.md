---
id: SPEC-GEMINI-RUNTIME-001
title: "무료 티어 파일럿 안정화 — 역할별 모델 분리·호출 배치·rate 페이싱·동시성 제한·재시도 복원력"
version: "0.2.0"
status: draft
created: 2026-08-27
updated: 2026-08-27
author: Nexsol
priority: P1
phase: "v0.7.0 target"
module: "lib/ai/, lib/pipeline/"
lifecycle: spec-anchored
tags: "gemini, rate-limit, retry, structured-output, provider-config, evidence-integrity, concurrency"
tier: L
depends_on: [SPEC-RESEARCH-001]
---

## HISTORY

- 2026-08-27: 최초 작성 (Nexsol) — `.moai/reports/gemini-smoke-20260827.md`에 기록된 실 Gemini 프로덕션 파이프라인 스모크 테스트에서 발견된 문제(모델 가용성, Gemini 호출 폭주로 인한 429, Skeptic 반박 근거 공백, 편협한 재시도)를 계기로 착수. 근거: 현행 코드베이스 실측(`lib/ai/providers/{gemini,deterministic}.ts`, `lib/ai/{provider,provider-factory}.ts`, `lib/pipeline/{researcher,skeptic,verifier,index,types,safety-validator,boundary.test}.ts`, `lib/env.ts`, `lib/validation/case-input.ts`, `.env.local.example`, `.moai/docs/runtime-runbook.md`) + 설치된 `@google/genai@2.18.0` SDK 소스 코드 실측 + Google 공식 문서(모델 목록/rate limit/troubleshooting) 실시간 WebFetch 검증. 근거: `research.md`, `design.md`.
- 2026-08-27: plan-phase 중 사용자가 범위를 확장(단일 `GEMINI_MODEL` → 역할별 `GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL` 분리, rate scheduler·동시성 제한·개인정보 확인 섹션 신설) — Tier를 M에서 L로 재분류(§핵심 판단 근거 참고).
- 2026-08-27: plan-auditor 1차 감사(iteration 1) FAIL(overall 0.878, Traceability 0.75) 수정 — D1(필수, blocking): REQ-GEMINI-RUNTIME-018이 묶은 5개 비회귀 주장 중 3개(타입 shape 불변성, safety-validator 3개소 적용, DB 스키마 불변)에 대응하는 AC가 전무했던 결함을 acceptance.md에 AC-GEMINI-RUNTIME-022a/022b/022c 3건 신설로 해소. D2(선택, cosmetic): REQ-003/008/012/014/016/017의 GEARS 유형 라벨을 실제 복합 shall/shall-not 절 형태에 맞게 재조정. D3(선택): 동시성 락의 암묵적 전이 상한(최대 대기 ≈ 3×`maxTotalWaitMs`)을 §5 잔여 위험에 명시. D4(선택): AC-GEMINI-RUNTIME-009에 query A 자신의 정상 결과 생존 조건을 명시. D5(선택): AC-GEMINI-RUNTIME-023에 evidence 혼합 구성(일부 query만 evidence 보유) 시나리오를 추가.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

`.moai/reports/gemini-smoke-20260827.md`가 기록한 1회 실 Gemini 스모크 테스트는 파이프라인이 최종적으로 정상 동작함을 확인했지만, 그 과정에서 프로덕션 재발 가능한 4가지 근본 원인을 노출했다: ① 하드코딩된 모델명으로 인한 계정별 가용성 실패, ② 쿼리/finding 개수에 비례해 늘어나는 Gemini 호출 횟수(사건 1건당 약 7회)로 인한 무료 tier RPM 쿼터 소진과 Verifier 단계의 실제 429 발생, ③ Skeptic 반론의 반박 근거(`counterEvidenceIds`)가 매번 비어 있는 현상, ④ 429만 재시도하고 503은 즉시 실패하는 편협한 재시도 로직. 무료 티어 소수 파일럿 단계에서는 비용보다 **안정성**이 우선이며, 응답이 수십 초 걸리는 것은 이 단계에서 허용된다.

### WHAT — 이번 SPEC 범위

이번 SPEC의 핵심은 **quota 우회가 아니라 quota 절약과 복원력**이다 — 여러 API 키/Google 계정을 돌려쓰는 방식은 명시적으로 배제한다. 대신:

- **역할별 모델 분리**: Researcher는 `GEMINI_RESEARCH_MODEL`(기본값 `gemini-3.6-flash`), Skeptic·Verifier는 `GEMINI_FAST_MODEL`(기본값 `gemini-3.5-flash-lite`)을 사용한다. 두 값 모두 이번 plan-phase에서 Google 공식 모델 목록 문서를 직접 조회해 Stable임을 확인했다(design.md §1).
- **Gemini 호출 배치**: Researcher·Skeptic이 쿼리/finding 개수만큼(N회) 호출하던 것을, Verifier가 이미 쓰는 "사건당 1회 구조화 호출" 패턴을 따라 사건당 1회로 줄인다. 목표: 정상 사건 1건당 핵심 Gemini 호출 약 3회(Researcher×1 + Skeptic×1 + Verifier×1), 쿼리/finding 개수와 무관.
- **Free-tier rate scheduler(1차 방어선)**: model별로 독립적인 자체 요청 예산(RPM budget, Google의 실제 쿼터를 대신 주장하지 않는 self-imposed 값)으로 요청 시작 간격을 페이싱한다.
- **동시 사건 제한(프로세스 로컬)**: 한 프로세스 안에서 Gemini 파이프라인이 동시에 여러 사건을 폭주 호출하지 않도록, 활성 파이프라인을 1개로 직렬화한다. 여러 서버리스 인스턴스를 아우르는 분산 락이 아님을 명시한다.
- **429/503 재시도 복원력(2차 안전장치)**: Gemini 오류 응답의 `RetryInfo.retryDelay` 힌트를 실제로 읽어 반영하고, 503도 429와 동일한 재시도 경로에 포함하되 총 재시도 횟수와 총 대기 시간 모두에 상한을 둔다.
- **개인정보/데이터 최소화 재확인**: 기존 `caseInputSchema`의 비식별 구조적 데이터 전용 계약이 이번 변경으로 약화되지 않음을 확인한다.

이번 SPEC은 근거자료 corpus 확장, 벡터 DB, 임베딩, 크롤러, 분산 큐/Redis, 여러 계정을 통한 quota 우회를 다루지 않는다(§4).

### 핵심 판단 근거 — Tier S/M/L 재분류(M→L)

plan-phase 초반에는 Tier M(단일 서브시스템, 5-15개 파일)으로 제안됐으나, 범위가 역할별 provider 분리(신규 아키텍처 결정) + rate scheduler(신규 클래스) + 프로세스 동시성 제한(신규 메커니즘) + 개인정보 확인 섹션으로 확장되면서 **Tier L**로 재분류한다. 근거: (a) 영향 파일 수가 15개를 넘어선다 — 운영 코드만도 `lib/ai/providers/gemini.ts`, `lib/ai/provider.ts`, `lib/ai/provider-factory.ts`, 신규 `lib/ai/rate-scheduler.ts`, `lib/pipeline/{researcher,skeptic,verifier,index,types}.ts`, `lib/ai/providers/deterministic.ts`, `lib/env.ts`, `.env.local.example`, `.moai/docs/runtime-runbook.md`, `.moai/reports/gemini-smoke-20260827.md` 10개, 대응 테스트 파일까지 포함하면 18-20개. (b) REQ/AC 개수가 Tier M 상한(16개)을 넘어선다(§2에서 20개 REQ). (c) 단일 서브시스템 리팩터링을 넘어 신규 아키텍처 개념(역할 기반 provider 쌍, 자체 rate scheduler, 프로세스 로컬 동시성 락) 3가지가 신설된다 — "constitutional" 수준의 구조 변경에 해당한다.

## §2. 요구사항 (Requirements — GEARS 표기법)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-GEMINI-RUNTIME-001 | Ubiquitous | `GeminiProviderOptions`는 `model?: string`(및 `rpmBudget?: number`) 필드를 가져야 하며, `GeminiProvider` 생성자는 `this.model = options.model ?? DEFAULT_MODEL`(`DEFAULT_MODEL = "gemini-2.5-flash"`, 방어적 최종 폴백)로 초기화해야 한다. | 사용자 지시 §A, design.md §1 |
| REQ-GEMINI-RUNTIME-002 | Ubiquitous | `lib/ai/provider-factory.ts`는 `getLLMProviders(env)`를 제공해 `{ research, fast }` 두 개의 `LLMProvider` 인스턴스를 반환해야 한다. `research`는 `env.GEMINI_RESEARCH_MODEL`(기본값 `gemini-3.6-flash`)로, `fast`는 `env.GEMINI_FAST_MODEL`(기본값 `gemini-3.5-flash-lite`)로 각각 바인딩되어야 하며, 두 환경변수 값만 바꾸는 것으로 소스 코드 수정 없이 각 역할의 실제 SDK 호출 모델 문자열이 독립적으로 바뀌어야 한다. 두 모델 ID는 이번 plan-phase에서 Google 공식 모델 목록 문서(design.md §1)로 Stable임이 확인됐다. | 사용자 지시 §A, design.md §1, research.md §3.1 |
| REQ-GEMINI-RUNTIME-003 | Where(capability gate) | `env.LLM_PROVIDER_MODE === "deterministic"`일 때 `getLLMProviders()`는 `research`/`fast` 양쪽에 동일한 결정론적 provider 인스턴스를 반환해야 하며, 이 경로는 실제 model 문자열을 필요로 하지 않아야 한다. | 사용자 지시 §A, design.md §1 |
| REQ-GEMINI-RUNTIME-004 | Ubiquitous | Researcher(`research()`)는 evidence가 있는 모든 쿼리를 `GEMINI_RESEARCH_MODEL`로 바인딩된 provider에 대한 하나의 `generateStructured()` 호출로 묶어 처리해야 하며, evidence가 없는 쿼리는 이 호출의 candidate로 전달되지 않고 억지 finding도 생성하지 않아야 한다(기존 `continue` 동작과 동일한 제외 규칙 유지). | 사용자 지시 §B.1 |
| REQ-GEMINI-RUNTIME-005 | Ubiquitous | Skeptic(`challenge()`)은 모든 finding을 `GEMINI_FAST_MODEL`로 바인딩된 provider에 대한 하나의 `generateStructured()` 호출로 묶어 처리해야 하며, evidence가 없는 finding에 대해 억지 반론을 생성하지 않아야 한다. | 사용자 지시 §B.2 |
| REQ-GEMINI-RUNTIME-006 | Ubiquitous | Verifier(`verify()`)의 기존 "사건당 1회 배치 구조화 호출" 구조·스키마·프롬프트는 이번 SPEC에서 변경하지 않으며, `GEMINI_FAST_MODEL`로 바인딩된 provider로 호출된다는 점만 바뀐다. | 사용자 지시 §B.3 |
| REQ-GEMINI-RUNTIME-007 | Ubiquitous | Researcher/Skeptic 배치 구조화 응답 검증은, 배치 내 개별 항목(query 또는 finding) 하나가 구조적으로 잘못되었거나 위조 evidence ID를 인용하더라도, 같은 배치 내 다른 정상 항목의 결과까지 함께 폐기해서는 안 된다 — 문제된 항목만 개별적으로 "해당 query/finding에 대한 결과 없음"으로 처리해야 한다(design.md §2 — 구조 검증은 Zod 스키마로, candidate 소속·evidence 부분집합 등 업무 규칙 검증은 파싱 성공 이후 애플리케이션 코드에서 항목별로 수행). 단, 배치 응답 전체가 최상위에서 파싱 불가능한 진짜 구조적 실패는 그 호출 전체를 기존과 동일하게 fail-closed 처리해도 된다. | 사용자 지시 §B.1/§B.2, design tension 해소 지시 |
| REQ-GEMINI-RUNTIME-008 | Ubiquitous + Unwanted | 배치 응답의 각 항목이 인용하는 evidence ID는 그 항목이 속한 query/finding에 EvidenceRetriever가 실제로 전달한 evidence 집합의 부분집합이어야 하며, 같은 배치 내 다른 query/finding에게 전달된 evidence ID를 인용해서는 안 된다(query별 evidence 격리는 배치 전환 이후에도 그대로 유지). | 사용자 지시 §B.1/§B.2, §G |
| REQ-GEMINI-RUNTIME-009 | Ubiquitous | Skeptic의 반론 생성 프롬프트(배치 버전)와 `Challenge` 타입 문서 주석은 `supportingEvidenceIds`(보험사 관점에서 그 반론 자체를 뒷받침하는 근거)와 `counterEvidenceIds`(피보험자/청구인 측이 그 반론에 대해 반박 근거로 제시할 수 있는 근거)가 서로 다른 두 역할임을 명시해야 한다. | 사용자 지시 §B.2 |
| REQ-GEMINI-RUNTIME-010 | Unwanted | `counterEvidenceIds`가 빈 배열이라는 사실만으로 근거자료 corpus 부족을 자동으로 확정된 원인이라고 코드 주석·문서·리포트에 단정해서는 안 된다. | 사용자 지시 §B.2, §I |
| REQ-GEMINI-RUNTIME-011 | Ubiquitous | 신규 `RateScheduler`는 동일 model 역할(Research 또는 Fast)의 요청 시작 간격을, `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`(각각 독립적으로 읽히는, 코드 기본값을 가진 self-imposed 예산)에서 계산된 최소 간격으로 페이싱해야 하며, 테스트에서 주입 가능한 clock/sleep 함수를 통해 동작해야 한다. | 사용자 지시 §C |
| REQ-GEMINI-RUNTIME-012 | Unwanted + Ubiquitous | rate scheduler 구현·문서·runbook 안내는 특정 수치를 Google이 보장하는 실제 쿼터인 것처럼 코드에 고정하거나 단정해서는 안 되며, 운영자가 자신의 AI Studio 할당량을 확인해 설정하는 자체 예산으로만 서술해야 한다. | 사용자 지시 §C |
| REQ-GEMINI-RUNTIME-013 | Ubiquitous | 프로세스 내 메커니즘은 한 프로세스 안에서 Gemini를 호출하는 사건 파이프라인(Researcher→Skeptic→Verifier)이 동시에 최대 1개만 활성화되도록 직렬화해야 하며, 대기 중인 다른 사건 호출은 오류 없이 자신의 차례를 기다려야 한다. | 사용자 지시 §D |
| REQ-GEMINI-RUNTIME-014 | Ubiquitous + Unwanted | 이 동시성 메커니즘은 프로세스 로컬 보호로만 구현·문서화되어야 하며, 여러 서버리스 인스턴스를 아우르는 분산 락으로 서술하거나 Redis/durable 분산 큐를 도입해서는 안 된다. | 사용자 지시 §D |
| REQ-GEMINI-RUNTIME-015 | When(event-detected) | Gemini가 429(RESOURCE_EXHAUSTED) 또는 503(UNAVAILABLE) 응답을 반환하는 것이 감지되면, `GeminiProvider`의 재시도 로직은 응답 본문에 포함된 `google.rpc.RetryInfo.retryDelay` 힌트가 있으면 이를 우선 사용해야 하고, 힌트가 없으면 기존 지수 백오프로 대체해야 한다. 503은 429와 동일한 재시도 경로에 포함되어야 한다(Google 공식 troubleshooting 문서가 429/408/5xx를 일시적 오류로 분류한 근거, design.md §5). | 사용자 지시 §E, research.md §3.3 |
| REQ-GEMINI-RUNTIME-016 | Ubiquitous + Unwanted | 재시도 로직은 총 재시도 횟수와 총 누적 대기 시간 양쪽 모두에 상한을 두어야 하고, 인증 오류·잘못된 요청·스키마 검증 실패 같은 비일시적(non-transient) 오류는 재시도해서는 안 되며, 상한 도달 또는 소진 시 원본 오류를 삼키지 않고 그대로 전파해야 한다. | 사용자 지시 §E |
| REQ-GEMINI-RUNTIME-017 | Ubiquitous + Unwanted | Researcher/Skeptic/Verifier가 Gemini 프롬프트에 전달하는 데이터는 기존 `caseInputSchema`가 허용하는 비식별 구조적 필드(사고/질병 경위, 진단명, 장해 부위, 사고 일자)와 curated evidence로 한정되어야 하며, 이번 SPEC은 주민등록번호·전화번호·상세주소·진료기록/보험증권 원문 등 새로운 개인정보성 필드나 원문 데이터를 프롬프트에 추가해서는 안 된다. | 사용자 지시 §F |
| REQ-GEMINI-RUNTIME-018 | Unwanted | `DraftFinding`/`Challenge`/`VerifiedClaim`/`ResearchReport`의 기존 필드 구조, `lib/pipeline/boundary.test.ts`의 형제-import 금지 경계, `lib/pipeline-gemini-boundary.test.ts`의 Gemini SDK confinement, `findSafetyViolations()`의 3곳(Researcher/Skeptic/Verifier) 적용 지점, DB 스키마는 이번 SPEC에서 변경되지 않아야 한다. | 사용자 지시 §G |
| REQ-GEMINI-RUNTIME-019 | Ubiquitous | evidence가 있는 정상 사건 1건에 대해, 전체 파이프라인의 총 `generateStructured()` 호출 수는 쿼리/finding 개수와 무관하게 정확히 3회(Researcher×1 + Skeptic×1 + Verifier×1)여야 한다. | 사용자 지시 §H |
| REQ-GEMINI-RUNTIME-020 | When(event-detected) | `.moai/reports/gemini-smoke-20260827.md`에서 실제 관측 범위를 넘어서는 두 문구(① `gemini-2.5-flash`의 플랫폼 전체 서비스 종료 단정, ② corpus 부족을 확정 원인으로 서술)가 식별되면, run-phase 구현 중 design.md §7에 명시된 정확한 정정문으로 교체해야 한다. | 사용자 지시 §I |

REQ 개수: 20개 (Tier L 상한 25개 이내).

## §3. 비기능 제약 (Constraints)

- **기존 아키텍처 경계 보존**: 6단계 파이프라인 순차 실행 구조, 파이프라인 단계 모듈 간 형제-import 금지, Gemini SDK confinement는 그대로 유지한다.
- **버전 고정 유지**: `@google/genai` `2.18.0`(`<3.0.0`), `zod` `4.4.3` — 신규 런타임 의존성을 추가하지 않는다. rate scheduler·동시성 락은 순수 인메모리 로직으로 구현하며(신규 npm 패키지 없음), SDK 내장 `httpOptions.retryOptions`는 사용하지 않는다(design.md §1 — 내장 재시도는 `retryDelay` 힌트를 읽지 않음).
- **함수 시그니처 안정성**: `research()`/`challenge()`/`verify()`의 파라미터 시그니처(단일 `provider: LLMProvider` 인자)는 바뀌지 않는다 — 역할별 provider 선택은 `runPipeline()`(오케스트레이터) 수준에서만 이루어진다.
- **실제 원격 Gemini API 무접근 (자동 테스트)**: 이 SPEC의 어떤 자동화 검증(Vitest 단위 테스트)도 실제 Gemini API를 호출해서는 안 된다 — 429/503 재시도·rate scheduler 테스트는 주입된 fake error 객체 + fake clock/sleep 함수를 사용한다. 유일한 예외는 §4 Requirement J의 수동 실 Gemini 스모크이며, 이는 자동화 테스트가 아니다.
- **개인정보 계약 무변경**: `lib/validation/case-input.ts`의 `caseInputSchema`/`validateCaseInput()`은 이번 SPEC에서 수정하지 않는다.
- **간결성 유지**: rate scheduler와 동시성 제한 모두 신규 큐 프레임워크(BullMQ 등), Redis, 분산 락 없이 순수 인메모리로 구현한다.

## §4. 제외 범위 (Out of Scope)

### Out of Scope — 여러 API 키/계정을 통한 quota 우회
- 여러 Google 계정/API 키를 순환시켜 무료 tier quota를 우회하는 방식(multi-key rotation pool)은 이번 SPEC의 접근 방식이 아니며 다루지 않는다.

### Out of Scope — 근거자료 corpus 확장 및 검색 인프라
- 근거자료(evidence) corpus를 50~100건으로 확장하는 작업, 벡터 DB, 임베딩 기반 검색, 대규모 판례/약관 크롤링 시스템, Elasticsearch 도입은 다루지 않는다 — `SPEC-EVIDENCE-001`(아직 착수 전)의 범위다.

### Out of Scope — 분산 인프라
- Redis, BullMQ 등 큐 프레임워크, durable 분산 큐, Vercel 여러 인스턴스를 아우르는 전역 semaphore/분산 락은 이번 SPEC에서 도입하지 않는다 — 실제 동시 사용자 증가 시 별도 SPEC으로 확장한다.

### Out of Scope — feedback 구조·UI·배포
- feedback 데이터 구조 고도화, UI/UX 폴리싱, Vercel 배포 작업은 다루지 않는다.

### Out of Scope — 보험금 지급 판단 자동화
- 보험금 지급 확률·예상액 자동 계산 기능은 다루지 않는다. 이번 SPEC의 프롬프트 변경도 "검토 필요"/"관련 가능성 있음" 형태의 서술 원칙(safety-validator가 강제)을 그대로 유지한다.

### Out of Scope — smoke 반복 검증
- 실 Gemini 수동 스모크를 3~5회 반복 수행하는 것은 이번 SPEC의 필수 acceptance가 아니다 — 최초 1회 성공 확인 후 필요시 운영 관찰로 수행한다.

## §5. 잔여 위험 (Residual Risks)

- **무료 tier 쿼터는 여전히 외부 조건**: 호출 수 감소(§2) + 자체 페이싱(§3) + bounded retry(§5)를 갖추더라도, Google이 실제로 부여한 쿼터 값 자체를 이 SPEC이 통제할 수는 없다. "이번 SPEC 이후 429가 전혀 발생하지 않는다"는 보장이 아니다(§4 Requirement J의 정확한 acceptance 문구 참고).
- **RPM budget 기본값의 보수성 검증 부족**: `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`의 코드 기본값은 이번 조사에서 얻은 일반적 안전값이며, 실제 계정의 tier·모델별 실측 한도와 비교 검증되지 않았다 — 운영자가 실제 스모크 이후 자신의 AI Studio 대시보드를 보고 조정해야 한다.
- **동시성 제한의 프로세스 로컬 한계**: Vercel 서버리스처럼 여러 인스턴스가 동시에 뜨는 환경에서는 이번 프로세스 로컬 락이 전체 시스템 수준의 동시 Gemini 호출을 막아주지 못한다 — 배포 환경이 다중 인스턴스로 바뀌는 시점에 별도 SPEC이 필요하다. 또한 대기 중인 사건이 락 보유자 뒤에서 최대 얼마나 오래 막힐 수 있는지에 명시적 상한은 없지만, 락 보유자(Researcher→Skeptic→Verifier)의 각 Gemini 호출이 `GeminiProvider`의 재시도 상한(`maxRetries`/`maxTotalWaitMs`)에 의해 개별적으로 유계이므로, 대기 시간은 암묵적으로 그 3배 이내(호출 3회 × `maxTotalWaitMs`)로 전이적(transitive) 상한이 걸린다 — 별도의 명시적 락 타임아웃을 도입하지 않아도 무한 대기는 발생하지 않는다.
- **503 재시도 범위를 429와 동일하게 좁게 유지**: design.md §5에서 확인된 SDK 자체 기본 재시도 대상(408/429/500/502/503/504) 전체가 아니라, 이번 SPEC은 사용자가 요청한 범위(429+503)만 확장한다.
- **모델 전환 시 구조화 출력 호환성은 미보증**: `GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL`을 다른 모델로 전환했을 때 `responseJsonSchema` 구조화 출력 계약이 동일하게 지원되는지는 모델별로 다를 수 있다.

## §6. 참고 문서

- `.moai/reports/gemini-smoke-20260827.md` (이번 SPEC의 1차 증거 자료)
- `.moai/specs/SPEC-RESEARCH-001/{spec,plan,design}.md` (선행 SPEC, status: completed)
- 이 SPEC의 `research.md`(코드베이스 실측 + SDK 소스 코드 실측 + Google 공식 문서 WebFetch 검증), `design.md`(아키텍처 결정), `plan.md`, `acceptance.md`
