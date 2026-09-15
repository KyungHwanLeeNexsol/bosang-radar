---
id: SPEC-PILOT-OPS-001
title: "실제 파일럿 운영 개시 — 문서 현행화, 계정 발급·스모크·단계별 롤아웃 계획"
version: "0.1.0"
status: draft
created: 2026-09-15
updated: 2026-09-15
author: Nexsol
priority: P1
phase: "v1.2.0 target"
module: "README.md, .moai/project/product.md, .moai/docs/"
lifecycle: spec-anchored
tags: "pilot, operations, launch-plan, account-provisioning, rollout"
tier: S
depends_on: [SPEC-PILOT-READY-001, SPEC-PILOT-LAUNCH-001]
---

## HISTORY

- 2026-09-15: 최초 작성 (Nexsol) — SPEC-PILOT-READY-001(파일럿 배포 준비, GO 판정,
  PR #10 병합 `d74ece4`)과 SPEC-PILOT-LAUNCH-001(프로덕션 사용자 문구 정리·계정
  발급 절차 문서화, PR #11 병합 `bc289ad`, 이후 `14a6394`로 3-phase close)이 모두
  `status: completed`로 종결된 이후, **실제 파일럿 운영을 개시하기 위한 계획**을
  다루는 후속 SPEC. 이 SPEC의 plan-phase와 run-phase 모두 실 계정 발급, 실 배포,
  실 Gemini API 호출, 실 사용자 초대, 실제 스모크 테스트 실행, 실제 파일럿 단계
  착수를 수행하지 않는다 — 문서 3건(README.md 현행화, product.md 현행화, 신규
  운영 절차 문서 1건)을 작성·갱신하는 것만이 이 SPEC의 전체 범위다. 사용자 요청의
  5개 항목을 각각 REQ로 전환했다: ①README.md/product.md 문서 현행화(11→12개
  SPEC, SPEC-PILOT-LAUNCH-001 완료 반영, 배포 URL·SHA 미확인 사실의 정확한
  재서술), ②최초 운영 계정(zuge3927@naver.com) 발급 절차 계획(기존
  `.moai/docs/account-provisioning.md` 참조 + 발급 전 Turso 호스트 확인 단계의
  문서화), ③프로덕션 합성 사례 E2E 스모크 체크리스트 작성(신규 문서), ④파일럿
  운영 3단계(운영자 단독 → 외부 2~3명 제한 → 전체 10명×3건) 분리 계획(신규
  문서), ⑤후속 작업(실 Gemini 코퍼스 품질 평가, 완료/피드백 집계 대시보드, Gold
  Dataset 도구, 로그인 rate-limiting·계정 비활성화·비밀번호 재설정)은 명시적으로
  범위 밖으로 분리하고 이번 SPEC에서 신규 SPEC을 생성하지 않는다. 오케스트레이터
  세션이 사전에 README.md/`.moai/project/product.md`/`.moai/docs/
  account-provisioning.md`/`.moai/docs/pilot-incident-runbook.md`/기존 완료
  SPEC 3건(spec.md)을 read-only로 조사해 확인한 구체적 문구·줄 번호·사실만을
  근거로 삼았다. Netlify 프로덕션 배포의 정확한 URL·배포 SHA는
  SPEC-PILOT-LAUNCH-001 plan-phase(3차 개정) 및 종결 시점 모두에서
  GitHub commit-status/deployments API로 독립 검증되지 못한 채 이어져 온
  미해결 항목이며, 이 SPEC은 그 사실을 새로 만들어내지 않고 그대로 이어받아
  plan.md에 `[NEEDS CLARIFICATION]` 마커로 재기록한다(§ Open Clarification 및
  plan.md §C 참고 — GEARS/EARS 스킬 규칙에 따라 이 마커는 spec.md/acceptance.md가
  아니라 plan.md/research.md에만 위치해야 하므로, spec.md 쪽에는 마커 없이
  참조만 남긴다).

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-PILOT-READY-001은 파일럿을 외부 테스터에게 안전하게 열기 위한 **운영
준비**(호스팅, 동시성 가드, 로깅, 런북, 데이터 취급 고지)를 완료했고,
SPEC-PILOT-LAUNCH-001은 사용자 노출 문구를 정상 서비스 수준으로 정리하고 계정
발급 **절차**를 문서화했다. 그러나 두 SPEC 모두 **실제로 외부 전문가에게
파일럿을 개시하는 절차 자체**(누구를 언제 어떤 순서로 초대하는지, 개시 전
마지막으로 무엇을 확인하는지, 문서가 두 완료 SPEC의 산출물을 정확히 반영하고
있는지)는 다루지 않았다. 이 SPEC은 "준비 완료 상태"와 "실제 개시" 사이의 마지막
계획 간극을 문서로 메운다.

### WHAT — 이번 SPEC 범위

- README.md와 `.moai/project/product.md`를 SPEC-PILOT-LAUNCH-001 완료 사실(12번째
  SPEC, PR #11 병합)로 현행화하고, Netlify 프로덕션 배포 URL·SHA 미확인 사실을
  현재 상태에 맞게 정확히 재서술한다(§2.A).
- 최초 운영 계정 발급 절차를 계획한다 — 기존 `.moai/docs/account-provisioning.md`
  절차를 참조하고, 이 SPEC 고유의 대상(운영자 계정 후보 `zuge3927@naver.com`)과
  발급 전 확인 단계를 문서에 반영한다. **실 계정은 발급하지 않는다**(§2.B).
- 프로덕션 환경에서 합성(또는 이미 비식별화된) 사례로 수행할 E2E 스모크 절차를
  신규 문서로 작성한다. **실제로 스모크를 실행하지 않는다**(§2.C).
- 파일럿 운영을 3단계(운영자 단독 → 외부 2~3명 제한 → 전체 10명)로 분리하는
  계획을 신규 문서로 작성한다. Gemini 무료 티어 Research 모델의 일일 20회 요청
  제약(product.md 기존 확정 사실)을 반영해 30건을 최소 2일 이상으로 분산한다.
  **실제로 어떤 단계도 착수하지 않는다**(§2.D).
- 후속 개발 후보(코퍼스 품질 평가, 집계 대시보드, Gold Dataset, 인증 하드닝)는
  이 SPEC에서 신규 SPEC으로 생성하지 않고 Out of Scope로 명시만 한다.

### 핵심 판단 근거 — Tier S

영향 파일은 기존 문서 2개(README.md, `.moai/project/product.md` — 현행화 편집)와
신규 문서 1개(`.moai/docs/pilot-ops-launch-plan.md` — 스모크 체크리스트 + 3단계
롤아웃 계획을 함께 담는 단일 운영 문서)로 총 3개다. 코드 변경, 스키마 변경,
테스트 변경, 실 계정·실 배포·실 API 호출은 전혀 없다 — 순수 문서 작성/편집이며
Tier S의 "< 5 files" 기준을 명확히 만족한다. 요구사항 6개(REQ-PILOT-OPS-001~006)는
Tier S의 REQ 상한(8개) 이내이며, 인수 조건은 별도 acceptance.md 없이 본 문서
§3에 Given-When-Then 형식으로 인라인 기록한다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 문서 현행화 (Documentation Currency)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-OPS-001 | Ubiquitous | README.md와 `.moai/project/product.md`는 SPEC-PILOT-LAUNCH-001의 완료(`status: completed`, PR #11 squash 병합 커밋 `bc289ad9b95cf862ca3785d3fd73c2b143ca8983`, 이후 3-phase close 문서 커밋 `14a6394`)를 정확히 반영해야 한다. 구체적으로: (a) README.md 헤딩(현재 `README.md:19` "## 현재 구현 상태 (11개 SPEC 완료 — SPEC-SCAFFOLD-001 ~ SPEC-PILOT-READY-001)")과 최종 수정 표기(`README.md:1-8`)를 "12개 SPEC ... ~ SPEC-PILOT-LAUNCH-001"로 갱신한다; (b) README.md 본문(`README.md:21,23`)에 SPEC-PILOT-LAUNCH-001이 수행한 사용자 노출 문구 정리 및 계정 발급 절차 문서화 사실을 추가한다; (c) README.md "## 다음 단계" 절(`README.md:132-149`)의 "구현 완료 (11개 SPEC)" 헤딩·목록(`README.md:136,138`)을 12개로 갱신한다; (d) `.moai/project/product.md`의 최종 수정 표기(`product.md:1-7`)와 "### 구현 완료 (11개 SPEC, `status: completed`)" 헤딩·목록(`product.md:82,84-104`)을 12개로 갱신한다. 이 REQ는 README.md/product.md **본문 문구 편집만** 요구하며, 코드나 SPEC 문서 자체(완료된 SPEC-PILOT-LAUNCH-001/READY-001의 spec.md)는 변경하지 않는다. | Read 조사 확인(README.md:1-8,19,21,23,132-149; product.md:1-7,82,84-104 — 2026-09-15 재확인). SPEC-PILOT-LAUNCH-001 spec.md HISTORY의 병합 커밋 SHA 재확인 |
| REQ-PILOT-OPS-002 | Ubiquitous | README.md(`README.md:142`)와 `.moai/project/product.md`(`product.md:122-125`)의 "Netlify 프로덕션 배포 확정" 관련 서술은 다음 확정 사실을 반영해야 한다 — 사용자가 Netlify 대시보드에서 직접 확인해 프로덕션 배포 URL은 `musical-macaron-82feb3.netlify.app`, 배포 SHA는 `381e38d6c88f77c4281ebb4007fb46475cce426b`(단축 `381e38d`, 이번 개정 시점 main HEAD와 일치)임이 확정됐다(plan.md §C 해소 기록 참고). 이 갱신은 두 가지를 동시에 만족해야 한다 — (i) URL·SHA 값 자체는 이제 확정된 사실로 정확히 반영하되, "이 시점 기준"이며 다음 push로 전진할 수 있는 값임을 명시(영구 고정 pin으로 서술하지 않음); (ii) 그럼에도 이 세션·향후 세션이 GitHub commit-status/deployments API로 그 배포를 **독립 검증**할 수단은 여전히 없다는 한계는 계속 정확히 기록한다(사용자 직접 확인 ≠ API 독립 검증, 두 사실을 혼동하지 않음). "배포 여부 자체가 아직 결정되지 않았다"는 과거 문구는 이제 사실과 어긋나므로 제거한다. | Read 조사 확인(README.md:142; product.md:122-125); 사용자가 이번 개정 라운드에서 직접 제공한 Netlify 대시보드 확인값(URL·SHA); `git log -1 main`/`git log -1 origin/main` 재확인(둘 다 `381e38d`, 0/0 발산) |

### B. 최초 운영 계정 발급 절차 계획 (Initial Operator Account Provisioning Plan)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-OPS-003 | Ubiquitous | 신규 운영 문서 `.moai/docs/pilot-ops-launch-plan.md`의 계정 발급 절"에는 다음을 모두 포함해야 한다: (a) 최초 발급 대상은 운영자 본인 계정 `zuge3927@naver.com`이며, 이 이메일은 이미 `.moai/docs/pilot-incident-runbook.md` §3와 파일럿 지원 연락처로 확정된 동일 주소임을 명시(신규 이메일이 아니라 기존 확정 주소 재사용); (b) 발급 절차 자체는 기존 `.moai/docs/account-provisioning.md`를 그대로 따르며 이 문서를 대체하지 않고 참조만 함; (c) 발급 **전** 확인 단계로 `account-provisioning.md` §2-1이 요구하는 대로 `TURSO_DATABASE_URL`이 실제 프로덕션 호스트를 가리키는지 확인하는 절차를 재확인·요약(이 SPEC이 그 확인을 실행하는 것은 아니며, 문서화만 함); (d) 발급 후 검증은 `account-provisioning.md` §5(실제 로그인 성공 확인)를 그대로 따름을 명시; (e) 이 SPEC은 실제로 `pnpm tester:add`를 실행하지 않으며, 실 계정을 생성하거나 원격 DB에 쓰지 않음을 명시. | Read 조사 확인(`.moai/docs/account-provisioning.md` 전문, `.moai/docs/pilot-incident-runbook.md` §3 "이경환(파일럿 운영 책임자)... 연락 경로는 §1의 로그 확인 절차로 발견된 이슈를 이 담당자에게 전달"); SPEC-PILOT-READY-001 spec.md HISTORY v0.8.0 "지원 연락처 이메일(`zuge3927@naver.com`)... 확정" |

### C. 프로덕션 합성 사례 E2E 스모크 절차 (Production Synthetic-Case E2E Smoke Procedure)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-OPS-004 | Ubiquitous | 신규 운영 문서 `.moai/docs/pilot-ops-launch-plan.md`의 스모크 체크리스트 절에는 실제 파일럿 운영 개시 **전**, 프로덕션 환경에서 합성이거나 이미 비식별화된 사례로 다음 9개 확인 항목을 모두 순서대로 수행하도록 체크리스트 형태로 기록해야 한다: (1) 로그인 성공 및 세션 유지 확인; (2) 사건 제출 시 `202` 응답 및 jobId 수신 확인; (3) Background Function 처리 완료 후 사건 상태가 `completed`로 전이되는지 확인; (4) 생성된 사건(case)과 리포트(report)가 저장되고 재조회로 확인되는지 검증; (5) 구조화 전문가 피드백 제출·저장 확인; (6) 서로 다른 두 테스터 계정 간 사건 데이터가 상호 조회되지 않는지(테넌트 격리) 확인; (7) Netlify Functions 로그에서 `.moai/docs/pilot-incident-runbook.md` §1이 이미 카탈로그화한 `event` 값(`case_request_received`, `pipeline_stage_failed`, `pipeline_failed`, `completion_transaction_failed` 등)이 정상 흐름에서 오류 없이 기록되는지 확인; (8) 해당 사건에 대해 실제 Gemini 호출이 발생했고 결과가 반영됐는지 확인; (9) 스모크에 사용한 합성 사건·리포트·피드백 데이터를 실제 파일럿 데이터와 섞이지 않도록 식별·정리(cleanup)하는 기준을 명시. 이 REQ는 체크리스트 **작성**만 요구하며, 이 SPEC의 plan-phase·run-phase 어느 쪽도 이 스모크를 실제로 실행하지 않는다. | Read 조사 확인(`.moai/docs/pilot-incident-runbook.md` §1 이벤트 표, README.md:35 "Netlify Background Function 비동기 분석 경로", product.md §3 6단계 파이프라인, product.md 핵심 원칙 4 "다른 테스터의 사건 데이터는 조회할 수 없다") |

### D. 파일럿 운영 단계 분리 (Pilot Operation Stage Separation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-OPS-005 | Ubiquitous | 신규 운영 문서 `.moai/docs/pilot-ops-launch-plan.md`의 단계 분리 절에는 파일럿 운영을 다음 3단계로 명시해야 한다: **1단계(운영자 단독 스모크)** — REQ-PILOT-OPS-004의 9개 항목을 운영자 계정(`zuge3927@naver.com`) 1개로만 수행; **2단계(제한적 외부 검증)** — 외부 실무자 2~3명만 초대해 소수 사건으로 제한 검증; **3단계(전체 파일럿)** — 나머지 실무자를 포함해 총 10명 내외가 각 최소 3건씩, 총 약 30건을 수행. 각 단계 전환 조건, 중단(abort) 기준, 문의 채널(`zuge3927@naver.com`, `.moai/docs/pilot-incident-runbook.md` §3의 이경환 담당·1영업일 이내 1차 확인), 그리고 합성이거나 이미 비식별화된 사례만 입력하라는 기존 안내 문구(SPEC-PILOT-LAUNCH-001 REQ-PILOT-LAUNCH-003이 확정한 "합성이거나 이미 비식별화된 사례만 입력해 주세요" 표현 재사용, 신규 문구 작성 금지)를 명시해야 한다. | Read 조사 확인(product.md "핵심 원칙" 9 "현직 실무자 10명 각각이 최소 3건의 사건 리서치 사이클을 완료"); SPEC-PILOT-LAUNCH-001 spec.md §2.C REQ-PILOT-LAUNCH-003 확정 문구 |
| REQ-PILOT-OPS-006 | Where | **Where** Gemini 무료 티어 Research 모델의 일일 요청 한도(20 RPD, product.md 기존 확정 사실 — "Research 20 RPD 제약 때문에 30건 파일럿은 최소 2일 이상 분산한다")가 적용되는 동안, 신규 운영 문서는 3단계(REQ-PILOT-OPS-005) 전체 약 30건의 사건 제출을 **최소 2일 이상**에 걸쳐 분산하도록 명시해야 하며, 단일 일자에 20건을 초과하는 제출을 계획하지 않아야 한다. | Read 조사 확인(product.md §Roadmap "AI Studio 실제 무료 등급 한도에 따라 Research/Fast 자체 예산은 4/11 RPM으로 설정했고, Research 20 RPD 제약 때문에 30건 파일럿은 최소 2일 이상 분산한다") |

### 확인 사항 해소 기록 (Resolved Clarification — 상세는 plan.md §C)

Netlify 프로덕션 배포의 정확한 URL과 배포 SHA는 SPEC-PILOT-LAUNCH-001의
plan-phase 3차 개정과 종결 시점까지 미해결로 남았던 항목이었으나, 이번 개정
라운드에서 사용자가 Netlify 대시보드를 직접 확인해 두 값(URL
`musical-macaron-82feb3.netlify.app`, SHA `381e38d6c88f77c4281ebb4007fb46475cce426b`
— 이번 개정 시점 main HEAD와 일치)을 제공함으로써 해소됐다. 이 값들은 "이번
개정 시점 기준"이며 main에 새 커밋이 push되면 전진하는 값이지, 영구 고정
pin이 아니다. 이 세션도 GitHub commit-status/deployments API로는 여전히
독립 검증할 수단이 없으며(SPEC-PILOT-LAUNCH-001에서 이미 관찰된 것과 동일한
무신호 패턴), 이 한계 자체는 계속 정확히 기록한다 — "사용자 직접 확인"과
"API 독립 검증"은 별개의 사실이다. 상세 해소 기록·근거는 `plan.md` §C를
참고한다. REQ-PILOT-OPS-002는 이 확정된 값과 위 한계를 모두 정확히 반영하도록
README.md/product.md를 갱신할 것을 요구한다.

## Out of Scope

### Out of Scope — 실 계정 발급·실 배포·실 Gemini 호출·실 스모크·실제 단계 착수

- 이 SPEC의 plan-phase 및 run-phase 모두 `pnpm tester:add`를 실행하거나, 원격 DB에
  계정 행을 쓰거나, Gemini API를 호출하거나, REQ-PILOT-OPS-004의 스모크 체크리스트를
  실제로 수행하거나, REQ-PILOT-OPS-005의 3단계 중 어느 하나라도 실제로 착수하지
  않는다 — 모든 REQ는 **계획·문서화**만 요구한다.

### Out of Scope — 실 Gemini 코퍼스 품질 평가

- 대표성 있는 사례 표본에 대해 실제 Gemini로 코퍼스 품질을 평가하는 작업(예:
  `counterEvidenceIds`가 항상 빈 배열인 현상의 원인 규명)은 이 SPEC의 범위가
  아니다. product.md §Roadmap이 이미 "파일럿 실측 데이터 확보 이후" 1순위 후속
  작업으로 명시한 항목이며, 파일럿(이 SPEC이 계획하는 3단계)이 실제로 진행되어
  데이터가 쌓인 뒤에 별도 SPEC으로 착수해야 한다. 이번 SPEC은 그 SPEC을 생성하지
  않는다.

### Out of Scope — 사용자별 완료/피드백 집계 대시보드

- ①의 데이터를 바탕으로 완료 현황·피드백 집계를 보여주는 관리자 뷰는 이 SPEC의
  범위가 아니다(product.md §Roadmap 2순위 후속 작업).

### Out of Scope — Gold Dataset 추출·집계 도구

- 원시 피드백 행을 실제 골드 데이터셋으로 추출·가공하는 도구는 이 SPEC의 범위가
  아니다 — SPEC-FEEDBACK-001에서 이미 후속 SPEC으로 명시적으로 미뤄진 항목이며
  (product.md §Roadmap 3순위), 이번 SPEC에서도 신규 SPEC을 생성하지 않는다.

### Out of Scope — 로그인 rate-limiting·계정 비활성화·비밀번호 재설정

- 프로덕션 수준 인증 하드닝(로그인 시도 rate-limiting), 계정 비활성화, 비밀번호
  재설정 기능은 이 SPEC의 범위가 아니다. SPEC-PILOT-LAUNCH-001이 이미 계정
  비활성화·비밀번호 재설정에 대해 최소 설계 스케치를 Out of Scope로 남겨두었다
  (SPEC-PILOT-LAUNCH-001 §Out of Scope 참고) — 이 SPEC은 그 스케치를 반복하지
  않으며, 실제 파일럿 운영 중 필요성이 데이터로 확인된 뒤에만 별도 SPEC 착수
  여부를 판단한다.

### Out of Scope — 신규 SPEC 생성

- 위 4개 Out of Scope 항목 모두, 이 SPEC의 plan-phase는 해당 후속 SPEC을 실제로
  생성(가칭 SPEC ID 부여 포함)하지 않는다 — 필요성 확인 후 별도 `/moai plan`
  호출로 착수한다.

## §3. 인수 조건 (Acceptance Criteria — Tier S, 본 문서 인라인)

| AC | Given | When | Then |
|----|-------|------|------|
| AC-PILOT-OPS-001a | README.md가 아직 "11개 SPEC" 표기와 SPEC-PILOT-LAUNCH-001 완료 미반영 상태일 때 | README.md의 헤딩(§ REQ-PILOT-OPS-001(a)), 본문(REQ-PILOT-OPS-001(b)), "다음 단계" 절(REQ-PILOT-OPS-001(c))을 편집하면 | README.md 전체에서 "12개 SPEC"·"SPEC-PILOT-LAUNCH-001"이 일관되게 나타나고, "11개 SPEC" 잔존 표기가 남아있지 않아야 한다(grep으로 검증 가능) |
| AC-PILOT-OPS-001b | `.moai/project/product.md`가 아직 "11개 SPEC" 표기 상태일 때 | product.md의 최종 수정 표기와 §Roadmap "구현 완료" 목록(REQ-PILOT-OPS-001(d))을 편집하면 | product.md 전체에서 "12개 SPEC"·"SPEC-PILOT-LAUNCH-001"이 일관되게 나타나고, "11개 SPEC" 잔존 표기가 남아있지 않아야 한다 |
| AC-PILOT-OPS-002 | README.md/product.md의 Netlify 배포 서술이 "배포 여부 자체가 미결정"이라는 구식 문구를 담고 있을 때 | REQ-PILOT-OPS-002에 따라 재서술하면 | 두 문서 모두 확정된 URL(`musical-macaron-82feb3.netlify.app`)·SHA(`381e38d`)를 "이 시점 기준" 값으로 명시하고, 동시에 "GitHub API로는 독립 검증이 여전히 불가능하다"는 한계를 구분해 기술해야 하며, 어느 쪽 서술도 URL·SHA를 영구 고정 pin으로 단정하지 않아야 한다 |
| AC-PILOT-OPS-003 | `.moai/docs/pilot-ops-launch-plan.md`가 아직 존재하지 않을 때 | REQ-PILOT-OPS-003에 따라 계정 발급 절을 작성하면 | 해당 절에 운영자 계정 후보(`zuge3927@naver.com`), `account-provisioning.md` 참조, 발급 전 Turso 호스트 확인 문구, 발급 후 로그인 검증 문구, "실 계정 미발급" 명시가 모두 존재해야 한다 |
| AC-PILOT-OPS-004 | 같은 신규 문서에 스모크 체크리스트 절이 아직 없을 때 | REQ-PILOT-OPS-004에 따라 작성하면 | 9개 확인 항목(로그인·202·completed 전이·저장/재조회·피드백·테넌트 격리·로그 이벤트·Gemini 호출 확인·cleanup 기준)이 순서대로 모두 존재해야 한다 |
| AC-PILOT-OPS-005 | 같은 신규 문서에 3단계 분리 절이 아직 없을 때 | REQ-PILOT-OPS-005/006에 따라 작성하면 | 1~3단계 정의, 전환/중단 기준, 문의 채널, 기존 PII 안내 문구 재사용, 그리고 "최소 2일 이상 분산·일 20건 이하" 제약이 모두 명시돼 있어야 한다 |

## §4. 교차 참조

- SPEC-PILOT-READY-001 — 이 SPEC이 전제하는 배포 준비·운영 검증 SPEC(호스팅, 동시성 가드, 로깅, 런북, 데이터 취급 고지 상속)
- SPEC-PILOT-LAUNCH-001 — 이 SPEC이 반영하는 문구 정리·계정 발급 절차 문서화 SPEC(README/product.md 현행화 대상, account-provisioning.md 원본 출처)
- `.moai/docs/account-provisioning.md` — 계정 발급 절차의 SSOT(이 SPEC은 참조만 하며 대체하지 않음)
- `.moai/docs/pilot-incident-runbook.md` — 파일럿 운영 중 장애 대응 절차(triage 담당자·로그 이벤트 표 재사용 출처)
- SPEC-FEEDBACK-001 — Gold Dataset 추출·집계가 이미 후속 SPEC으로 명시적으로 미뤄진 근거
