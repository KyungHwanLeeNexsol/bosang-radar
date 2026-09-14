---
id: SPEC-PILOT-LAUNCH-001
title: "프로덕션 사용자 문구 정리 및 계정 운영 준비"
version: "0.3.0"
status: draft
created: 2026-09-14
updated: 2026-09-14
author: Nexsol
priority: P2
phase: "v1.1.0 target"
module: "app/login/, app/cases/new/, .moai/docs/"
lifecycle: spec-anchored
tags: "pilot, copy-cleanup, account-provisioning, data-handling"
tier: M
depends_on: [SPEC-PILOT-READY-001]
---

## HISTORY

- 2026-09-14: 최초 작성 (Nexsol) — SPEC-PILOT-READY-001이 `status: completed`,
  readiness 7개 항목 전부 READY, 전체 판정 GO, PR #10 병합(`d74ece4`)으로 종결된
  이후, 실제 프로덕션 사용을 준비하기 위한 후속 SPEC. Netlify 프로덕션 배포는
  사용자가 이미 완료했다고 확인했다(이 SPEC 범위 밖 사실로 전제). 신규 비즈니스
  기능은 도입하지 않으며, ①사용자 노출 "테스터"/"파일럿" 문구를 정상 서비스
  문구로 교정, ②내부 구현 식별자(DB 테이블·CLI 스크립트·환경변수·E2E 픽스처)는
  명시적으로 보존, ③사건 입력 화면의 비식별 안내 문구 중 남아 있는 과대 주장
  1건을 정정, ④실 계정 발급 절차 문서화(스크립트 변경 없음), ⑤비밀번호
  재설정·계정 비활성화·계정 목록 조회는 최소 설계 스케치만 남기고 구현하지
  않음, ⑥SPEC-PILOT-READY-001 문서 동기화 상태 회귀 확인으로 범위를 고정한다.
  plan-phase 조사는 오케스트레이터 세션에서 Grep/Read로 실제 코드베이스를
  read-only로 조사해 확인한 구체적 문구·파일 위치만을 근거로 삼았다.
- 2026-09-14: plan-phase 외부 검토 2차 반영 (Nexsol) — 4가지 정정. ①
  REQ-PILOT-LAUNCH-005/AC-PILOT-LAUNCH-004: `pnpm tester:add`가 프로덕션을
  자동으로 대상으로 한다는 서술을 제거하고, 스크립트는 `TURSO_DATABASE_URL`이
  가리키는 DB를 그대로 대상으로 할 뿐 자체 프로덕션 판별 로직이 없음을
  명시(`scripts/provision-tester.ts` 재확인 근거로 정정). 발급 전 원격 DB
  호스트 확인·중단 기준, 비밀값 미출력, `BETTER_AUTH_SECRET` Netlify Production
  일치 확인, 발급 후 실제 로그인 성공으로 검증하는 절차를 문서화 요건에 추가.
  ② REQ-PILOT-LAUNCH-003: "리서치 목적 외에 사용되지 않습니다"를 무해한 유지
  대상으로 판단했던 근거를 철회 — Gemini 무료 티어는 외부 제공자 자체 데이터
  취급 정책을 따르므로 목적 제한을 운영자가 보장할 수 없다. 교체 문구를
  외부 모델 제공자 전송 고지로 재작성. ③ Out of Scope — 계정 비활성화:
  `lib/auth/config.ts:56-77`의 `databaseHooks.session.create.before` 훅이
  이미 매 로그인 시점마다 `allowed_testers`를 재확인함을 코드로 재확인하고,
  설계 스케치를 `allowed_testers`에서 이메일 제거(기존 훅 활용) + 즉시 세션
  차단이 필요한 경우에 한해 해당 사용자의 `session` 행 삭제 병행으로
  변경(`user.disabled` 컬럼 추가는 2차 대안으로 격하). ④ Tier 재산정: 로그인·
  사건입력 렌더링 확인 테스트를 기존 테스트 파일(`app/login/page.test.tsx`,
  `app/login/login-form.test.tsx`, `app/cases/new/case-input-form.test.tsx`)에
  추가하는 작업이 파일 수에 포함됨을 반영해 Tier S(< 5 files)에서 Tier
  M(5-15 files, acceptance.md 별도 작성)으로 상향.
- 2026-09-14: plan-phase 외부 검토 3차 반영 (Nexsol) — 4가지 정정.
  ① Netlify 프로덕션 배포 확인: 사용자가 프로덕션 배포 완료를 확인했으나,
  오케스트레이터가 GitHub commit-status API(`/commits/{sha}/status`)와
  Deployments API(`/deployments`)를 main HEAD(`d08c01d15b8f8ecaa5d8f34cb171aed2b6620f24`)
  기준으로 조회한 결과 두 API 모두 신호가 없어(commit-status
  `total_count: 0`, deployments 빈 배열) 실제 프로덕션 URL·배포 SHA를
  독립적으로 검증할 수 없었다 — §2.F 아래 미해결 확인 사항으로
  `[NEEDS CLARIFICATION]` 마커를 신규 기록하고, README.md:142/product.md:123-124의
  기존 "아직 결정되지 않았습니다" 서술은 이 불확실성과 일치하므로 수정하지
  않는다. ② REQ-PILOT-LAUNCH-003/004 및 acceptance.md의 교체 문구를
  "전송될 수 있습니다"(가능성 표현)에서 "전송됩니다"(확정 표현, Google
  Gemini 명시)로 정정 — Gemini 무료 티어 호출은 모든 제출 건에서 항상
  발생하는 실제 흐름이지 가능성이 아니므로. ③ REQ-PILOT-LAUNCH-006 근거
  줄 번호를 D1 감사 이후 초안(README.md:19,23,138,142; product.md:3-5,82,104)에서
  다시 오케스트레이터의 신규 재검증 결과(README.md:19,23,138,149;
  product.md:3,104,108,123)로 재정정하고, 기계적 Grep 인용(줄 번호)과
  의미적 검증 대상(status/GO/PR#10/병합 SHA 4가지 사실)을 명시적으로
  구분했다 — D1 감사에서 지적된 이전 오류가 이번 재검증에서도 완전히
  해소되지 않았음을 확인하고 정정한 것이다. ④ plan-auditor 1차 감사(PASS
  0.92, iteration 1, commit `2af6f0f` 기준)는 D1(줄 번호 인용 오류)을
  제외한 모든 must-pass 기준을 충족했으나, 이번 3차 반영이 spec.md/plan.md/
  acceptance.md 아티팩트 해시를 다시 변경하므로 재감사(iteration 2)가
  필요함을 progress.md에 기록한다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-PILOT-READY-001은 파일럿을 외부 테스터에게 안전하게 열기 위한 **운영
준비**(호스팅 타임아웃, 동시성 가드, 로깅, 런북, 비식별 고지 정직성)를 완료했다.
그러나 그 SPEC은 "테스터"라는 명칭 자체나 로그인 화면의 파일럿 특유 문구를
교정 대상으로 다루지 않았다 — REQ-PILOT-READY-012/013/014는 사건 입력 화면의
비식별 고지 정직성에 집중했을 뿐, 로그인 화면의 "TESTER LOGIN" 캡션이나
"테스터 로그인" 헤딩은 범위 밖이었다. 사용자가 이제 프로덕션 배포를 완료하고
정식 서비스로 전환을 준비하면서, 화면에 남아 있는 파일럿 단계 문구가 실제
사용자에게 노출되는 것을 정리하고자 한다.

### WHAT — 이번 SPEC 범위

- 로그인 화면(`app/login/page.tsx`, `app/login/login-form.tsx`)의 사용자 노출
  "테스터"/"파일럿" 문구를 정상 서비스 문구로 교체한다.
- `allowed_testers` DB 테이블, `pnpm tester:add` CLI, `TESTER_PASSWORD` 환경변수,
  E2E 테스터 A/B 픽스처 등 **내부 구현 식별자는 변경하지 않는다** — 사용자 노출
  문구와 내부 식별자는 서로 다른 층위이며, 이 SPEC은 전자만 다룬다.
- 사건 입력 화면 폼 하단(`app/cases/new/case-input-form.tsx`)에 남아 있는 비식별
  "처리 보장" 과대 주장 1건을 정정한다 — 우측 Notice(`app/cases/new/page.tsx`)는
  SPEC-PILOT-READY-001에서 이미 교정됐으나, 같은 화면의 폼 하단 문구는 교정
  대상에서 누락됐었다.
- 실 계정 발급 절차(`pnpm tester:add` 실행법 + 알려진 제약)를 신규 문서로
  기록한다 — 스크립트 코드 자체는 변경하지 않는다.
- 비밀번호 재설정·계정 비활성화·계정 목록 조회는 이 SPEC에서 구현하지 않으며,
  최소 설계 스케치만 Out of Scope 절에 남긴다.
- SPEC-PILOT-READY-001의 README.md/product.md 문서 동기화 상태(status:
  completed, GO, PR #10 `d74ece4`)가 회귀하지 않았음을 재확인한다.

### 핵심 판단 근거 — Tier M

영향 파일은 소스 3개(`app/login/page.tsx`, `app/login/login-form.tsx`,
`app/cases/new/case-input-form.tsx` — 문구 교체, 각 파일 1~2줄), 신규 문서
`.moai/docs/account-provisioning.md` 1개, 그리고 REQ-PILOT-LAUNCH-001/003의
렌더링 결과를 확인하는 테스트 어설션을 추가할 기존 테스트 파일 3개
(`app/login/page.test.tsx`, `app/login/login-form.test.tsx`,
`app/cases/new/case-input-form.test.tsx` — 이미 존재하며 이번 SPEC에서
수정됨)로 총 7개다. 변경 LOC 자체는 300줄을 밑돌지만(대부분 문자열 치환 +
어설션 추가), 테스트 파일을 포함한 영향 파일 수가 Tier S의 "< 5 files"
가이드를 명확히 초과하므로 Tier M(5-15 files)으로 분류한다 — plan.md
§A Tier 판단의 파일 수 산식 참고. 스키마 변경·아키텍처 결정·신규 컴포넌트는
여전히 없다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 로그인 화면 테스터 문구 제거 (Login Screen Tester-Language Removal)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-001 | Unwanted | 로그인 화면은 파일럿 테스트 단계를 연상시키는 사용자 노출 문구를 표시해서는 안 된다. 구체적으로: (a) 캡션 "TESTER LOGIN"(`app/login/page.tsx:110`)은 제거한다; (b) 헤딩 "테스터 로그인"(`app/login/page.tsx:112`)은 "로그인"으로 교체한다; (c) 부제 "운영자가 승인한 테스터 계정으로만 로그인할 수 있습니다."(`app/login/page.tsx:114`)는 "승인된 계정으로만 로그인할 수 있습니다."로 교체한다; (d) 폼 하단 안내 "테스터 계정은 운영자가 직접 발급합니다. 계정 문의는 담당자에게 연락해 주세요."(`app/login/login-form.tsx:143`)는 "계정은 운영자가 직접 발급합니다. 발급 및 로그인 문의는 담당자에게 연락해 주세요."로 교체한다. | Grep 조사 확인(`app/login/page.tsx:110,112,114`, `app/login/login-form.tsx:143`) |

### B. 내부 구현 식별자 보존 (Internal Identifier Preservation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-002 | Unwanted | REQ-PILOT-LAUNCH-001의 사용자 노출 문구 교체는 다음 내부 구현 식별자를 변경해서는 안 된다: `allowed_testers` DB 테이블(`lib/db/schema.ts`의 `allowedTesters`), `pnpm tester:add` CLI 스크립트명과 그 내부 함수(`scripts/provision-tester.ts`의 `provisionTester`/`runCli`/`parseEmailArg`), `TESTER_PASSWORD` 환경변수명, E2E 테스터 A/B 픽스처(`scripts/e2e-tester-emails.ts`의 `TESTER_A_EMAIL`/`TESTER_B_EMAIL`, `e2e/*.spec.ts`), 그리고 이미 완료된 SPEC 본문(SPEC-PILOT-READY-001 등)의 HISTORY 서술. 스키마 변경·마이그레이션·식별자 rename 리팩터는 이 SPEC의 범위가 아니다. | Read 조사 확인(`lib/db/schema.ts`, `scripts/provision-tester.ts`, `scripts/e2e-tester-emails.ts`, `package.json:17`) |

### C. 사건 입력 화면 비식별 안내 문구 정정 (Case-Input De-identification Notice Correction)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-003 | Unwanted | `app/cases/new/case-input-form.tsx`의 폼 하단 안내 문구(현재: "입력 내용은 비식별 상태로 처리되며 리서치 목적 외에 사용되지 않습니다.", `case-input-form.tsx:352`)는 두 가지를 사용해서는 안 된다 — (a) 시스템이 입력 내용을 비식별 상태로 "처리한다"는 수동태 보장 표현(`lib/validation/case-input.ts`의 스키마는 자유 텍스트 3개 필드 `incidentDescription`/`diagnosisName`/`disabilityBodyPart`에 입력된 임의의 식별정보를 탐지·비식별화하지 않는다 — SPEC-PILOT-READY-001 REQ-PILOT-READY-011에서 이미 코드로 확인된 사실과 동일), (b) "리서치 목적 외에 사용되지 않습니다"라는 이용 목적 제한 보장 진술 — Gemini 무료 티어 호출은 외부 제공자(Google) 자체의 데이터 취급 정책을 따르므로, 운영자는 그 목적 제한이 실제로 집행됨을 보장할 수 없다. 이 문구는 (1) 사용자에게 합성이거나 이미 비식별화된 사례만 입력하도록 요구하는 능동 지시 표현(같은 화면 우측 Notice `app/cases/new/page.tsx:66`이 이미 채택한 "합성이거나 이미 비식별화된 사례만 입력해 주세요." 표현과 통일)과, (2) 입력한 정보는 AI 분석을 위해 외부 AI 모델 제공자(Google Gemini)에 전송된다는 사실 고지로 교체되어야 한다. "평균 소요 시간 3~5분" 안내는 이 정정과 무관하며 그대로 유지한다. | Grep 조사 확인(`app/cases/new/case-input-form.tsx:352` vs `app/cases/new/page.tsx:66` — 같은 화면 안에서 두 문구가 서로 다른 정직성 수준을 갖고 있음을 확인); Gemini 무료 티어 데이터 취급 정책이 운영자 통제 밖에 있다는 사실은 외부 검토 2차로 재확인 |
| REQ-PILOT-LAUNCH-004 | Ubiquitous | REQ-PILOT-LAUNCH-003의 교정된 문구는 SPEC-PILOT-READY-001 REQ-PILOT-READY-011(과대 주장 금지, HARD constraint — "보장"·"확실히 차단" 등 표현 사용 금지)을 그대로 재확인해야 하며, 새로운 예외나 완화된 표현을 만들지 않는다. 이 금지는 비식별화 보장 주장뿐 아니라 운영자가 실제로 집행을 확인할 수 없는 이용 목적 제한 주장(예: 외부 제공자 데이터 취급 정책에 대한 보장)에도 동일하게 적용된다. | SPEC-PILOT-READY-001 REQ-PILOT-READY-011 상속; 외부 검토 2차로 이용 목적 제한 주장까지 명시적으로 포함하도록 정정 |

### D. 계정 프로비저닝 절차 문서화 (Account Provisioning Documentation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-005 | Ubiquitous | 운영자가 `pnpm tester:add`로 실 계정을 발급하는 절차를 신규 문서 `.moai/docs/account-provisioning.md`에 기록해야 한다. `scripts/provision-tester.ts`는 프로덕션을 자동으로 대상으로 삼는 자체 판별 로직을 갖고 있지 않다 — 실제로 어느 DB에 쓰는지는 오직 실행 시점 운영자 환경에서 `TURSO_DATABASE_URL`이 무엇으로 해석되는지에 의해 전적으로 결정된다(`buildDb()`가 이 값을 그대로 `createClient()`에 전달할 뿐이다). 문서는 최소한 다음을 포함해야 한다: (a) 스크립트의 실제 대상 DB는 프로덕션을 자동 선택하지 않으며 전적으로 실행 시점 `TURSO_DATABASE_URL` 해석 값에 의해 결정된다는 사실 명시; (b) 발급 전 확인 절차 — 해석된 원격 DB 호스트를 확인하고, `file:` URL이거나 예상과 다른 호스트이면 중단한다는 기준(이 절차 자체는 이 SPEC이 실행하지 않는 run-phase 이후의 운영 절차이며 문서화만 대상이다); 이 확인 과정에서 `TURSO_AUTH_TOKEN` 등 토큰 값은 절대 출력·로그로 남기지 않는다; (c) 발급 전 확인 절차 — 운영자 환경의 `BETTER_AUTH_SECRET`이 Netlify Production에 설정된 값과 일치하는지 확인한다는 기준; (d) 이미 존재하는 이메일로 재실행하면 계정을 건드리지 않고 조용히 스킵한다는 알려진 제약(`scripts/provision-tester.ts`의 existing-user 조기 `return` 경로에서 확인됨 — 비밀번호는 재설정되지 않는다) — 재발급이 필요한 경우 이 스크립트만으로는 처리할 수 없음을 명시; (e) 실제 비밀번호나 발급된 계정의 비밀값을 이 문서에 절대 기록하지 않는다는 경고; (f) 발급 후 검증 절차 — 스크립트가 exit 0으로 종료했다는 사실만으로 발급 완료를 판단하지 않고, 실제 프로덕션 로그인 성공으로 검증한다는 기준. 이 문서는 `.moai/docs/pilot-incident-runbook.md`(파일럿 **운영 중** 장애 대응 절차, 이미 별도 문서로 확립된 관례 — 그 문서 자신도 "이 문서는 파일럿 운영 중 장애 대응 절차다", "`runtime-runbook.md`와는 서로 다른 문서" 라고 명시함)와 관심사가 다른(계정 **사전** 발급 절차 vs **사후** 장애 대응) 별개 신규 문서여야 한다. 이 SPEC은 plan-phase와 run-phase 모두에서 이 절차를 실제로 실행하지 않으며, 실 계정을 생성하거나 원격 DB에 쓰지 않는다 — REQ-PILOT-LAUNCH-005는 절차의 **문서화**만 요구한다. `scripts/provision-tester.ts` 코드 자체는 변경하지 않는다. | Read 조사 확인(`scripts/provision-tester.ts:24-27` `buildDb()`가 자체 프로덕션 판별 없이 `TURSO_DATABASE_URL`을 그대로 사용, `scripts/provision-tester.ts:139-147` existing-user 조기 반환, `.env.local.example` `BETTER_AUTH_SECRET`/`TURSO_AUTH_TOKEN` 변수명 확인, `.moai/docs/pilot-incident-runbook.md:1-5` 기존 문서 분리 관례) |

### F. SPEC-PILOT-READY-001 문서 동기화 확인 (Doc-Sync Regression Confirmation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-006 | Ubiquitous | README.md와 `.moai/project/product.md`는 SPEC-PILOT-READY-001의 `status: completed`, readiness 7개 항목 전부 READY, 전체 판정 GO, PR #10 병합 커밋 `d74ece4`를 정확히 반영해야 한다(**의미적 근거** — 이 4가지 사실 자체가 검증 대상이며, 아래 줄 번호는 그 사실을 찾아낸 **기계적 근거**(Grep 결과 스냅샷)일 뿐 검증 대상 자체가 아니다). 2026-09-14 재확인 시점 기준 일치를 확인했다(README.md:19,23,138,149, product.md:3,104,108,123). 이 REQ는 회귀 방지를 위한 확인 항목이며, run-phase 착수 시점에 동일한 Grep으로 **다시** 재확인해 그 결과를 progress.md에 기록해야 한다 — 두 파일이 이 REQ 확인 이후에도 편집될 수 있으므로, 위 줄 번호는 참고용 스냅샷이며 run-phase 시점의 실제 재확인이 최종 근거다. 이 확인 사항은 REQ-PILOT-LAUNCH-006 자체(2026-09-14 기준 status/GO/PR#10/병합 SHA의 정확성)에 한정되며, 위 §1 HISTORY(정정 항목 신규 3차)에 별도로 기록된 Netlify 프로덕션 배포 URL·SHA 미확인 사항([NEEDS CLARIFICATION])과는 서로 다른 확인 대상이다 — 후자가 미해결이라고 해서 이 REQ가 검증한 4가지 사실이 흔들리는 것은 아니다. | Grep 조사 확인(2026-09-14, README.md:19,23,138,149; product.md:3,104,108,123 — 모두 일치, 불일치 없음. 이 재검증은 이 SPEC의 세 번째 revision round에서 오케스트레이터가 직접 재실행한 Grep 결과다). plan-auditor 1차 감사(D1)가 이전 두 초안(스코프 최초 작성분·외부 검토 2차분)의 줄 번호 인용 오류를 지적했고, 이번 재검증에서 두 초안 모두와 다른 정확한 값(README.md:149 vs 이전의 142; product.md:104,108,123 vs 이전의 3-5,82,104)으로 정정했다. |

### 미해결 확인 사항 (Open Clarification)

[NEEDS CLARIFICATION: Netlify 프로덕션 배포 실제 URL·배포 SHA] 사용자는 Netlify
프로덕션 배포가 이미 완료됐다고 확인했다(이 SPEC HISTORY 최초 작성 항목의
전제). 그러나 오케스트레이터가 GitHub commit-status API(`/commits/{sha}/status`)와
Deployments API(`/deployments`)를 main HEAD(`d08c01d15b8f8ecaa5d8f34cb171aed2b6620f24`)
기준으로 조회한 결과, 두 API 모두 신호가 없었다(commit-status
`total_count: 0`, deployments 빈 배열) — Netlify는 PR Deploy Preview와 달리
프로덕션 배포에 대해서는 GitHub에 구분 가능한 웹훅 상태를 게시하지 않는
것으로 관찰된다. 이 SPEC의 plan-phase 조사는 GitHub API 조회 외에 Netlify
대시보드나 CLI에 대한 접근 권한을 갖고 있지 않으므로, 실제 프로덕션 URL과
배포 SHA를 독립적으로 검증할 수 없었다. README.md:142와 product.md:123-124의
기존 "아직 결정되지 않았습니다" 서술은 이 불확실성과 일치하므로 이 SPEC에서
수정하지 않는다. 이 항목은 (a) 사용자로부터 직접 실제 URL/SHA를 받거나,
(b) run-phase에서 실제 Netlify 대시보드·CLI 접근 권한을 가진 상태로
재확인해야 해소된다 — plan-phase와 run-phase 모두 자체적으로 해소할 수 있는
수단을 갖고 있지 않다. 이 미해결 항목은 REQ-PILOT-LAUNCH-006이 검증하는
SPEC-PILOT-READY-001 문서 동기화 사실(status/GO/PR#10/병합 SHA)과는 무관한
별개 확인 대상이다 — REQ-PILOT-LAUNCH-006 자체는 이 SPEC의 plan-phase
재검증으로 이미 충족됐다(§2.F 근거 열 참고).

## Out of Scope

### Out of Scope — 비밀번호 재설정 (Password Reset)

- 로그인 화면 또는 계정 관리 화면에 비밀번호 재설정 기능을 추가하는 것은 이
  SPEC의 범위가 아니다. **최소 설계 스케치**: better-auth가 이미 제공하는
  이메일 기반 비밀번호 재설정 흐름(`emailAndPassword.sendResetPassword`
  콜백)을 `lib/auth/config.ts`에 연결하고, 재설정 요청 페이지 1개를
  `app/login/` 하위에 추가하는 방향이 유력한 후보다 — 이메일 발송 인프라
  구성(발신 도메인/전송 서비스 선택)이 선행 결정으로 필요하다.

### Out of Scope — 계정 비활성화 (Account Deactivation)

- 특정 계정을 로그인 불가 상태로 전환하는 기능은 이 SPEC의 범위가 아니다.
  **최소 설계 스케치**: `lib/auth/config.ts:56-77`의
  `databaseHooks.session.create.before` 훅이 이미 매 로그인(세션 생성)
  시점마다 `isAllowedTesterEmail()`로 `allowed_testers` 대조를 수행하고
  있음을 코드로 확인했다(REQ-SCAFFOLD-009/AC-SCAFFOLD-008 — 계정이 이미
  존재하더라도 allowlist에서 제거된 이메일이면 세션 생성 자체를 거부한다).
  따라서 최소 실행 가능 후보는 `allowed_testers`에서 해당 이메일을
  제거하는 것만으로 **신규 로그인 시도**를 차단할 수 있다(신규 마이그레이션
  불필요, 기존 훅 재사용). 다만 이 훅은 세션 **생성** 시점에만 실행되므로,
  이미 로그인해 유효한 세션을 보유한 사용자는 allowlist 제거만으로는 즉시
  차단되지 않고 세션이 자연 만료될 때까지 유효하게 남는다 — 즉시 차단이
  필요한 경우에는 해당 사용자의 `session` 테이블 행을 함께 삭제하는 절차를
  병행해야 한다. `user` 테이블에 `disabled: boolean` 컬럼과 별도 가드를
  추가하는 방향은 더 무거운 대안으로 여전히 고려 가능하지만, 기존 훅으로
  이미 충족되는 요구를 위해 우선 채택할 최소 후보는 아니다.

### Out of Scope — 계정 목록 조회 (Account Listing)

- 발급된 계정 목록을 조회하는 기능(UI 또는 CLI)은 이 SPEC의 범위가 아니다.
  **최소 설계 스케치**: `pnpm tester:add`와 대칭되는 `pnpm tester:list`
  스크립트를 `scripts/`에 추가해 `allowed_testers`와 `user` 테이블을 이메일
  기준으로 조인해 콘솔에 출력하는 간단한 CLI가 유력한 후보다 — 신규 UI 화면은
  필요하지 않다.

### Out of Scope — 스키마 변경 및 내부 식별자 rename

- REQ-PILOT-LAUNCH-002가 명시하는 대로, `allowed_testers` 테이블·`tester:add`
  스크립트명·`TESTER_PASSWORD` 환경변수·E2E 테스터 A/B 픽스처의 rename이나
  마이그레이션은 이 SPEC의 범위가 아니다.

### Out of Scope — 실 계정 생성·이메일 발송·Gemini 재호출·배포

- 이 SPEC의 plan-phase 및 run-phase 모두 실 계정을 생성하거나, 이메일을
  발송하거나, Gemini API를 호출하거나, 원격 DB에 쓰거나, 배포를 수행하지
  않는다 — REQ-PILOT-LAUNCH-005는 기존 절차를 **문서화**하는 것만 요구하며
  그 절차를 실행하는 것을 요구하지 않는다.

## §3. 인수 조건 (Acceptance Criteria)

Tier M 분류(§1 핵심 판단 근거)에 따라 인수 조건 전체는 별도 파일
`.moai/specs/SPEC-PILOT-LAUNCH-001/acceptance.md`에 Given-When-Then 형식으로
기록한다(AC-PILOT-LAUNCH-001 ~ 008, 8개). 이 절에는 인라인 AC 테이블을
포함하지 않는다.

## §4. 교차 참조

- SPEC-PILOT-READY-001 — 이 SPEC이 이어받는 파일럿 배포 준비 SPEC (REQ-PILOT-READY-011/012/013/014의 데이터 취급 고지 정직성 원칙을 상속)
- `.moai/docs/pilot-incident-runbook.md` — 파일럿 운영 중 장애 대응 절차 (관심사가 다른 별개 문서, REQ-PILOT-LAUNCH-005가 신규 문서를 그 옆에 별도로 두는 근거)
- `.moai/docs/runtime-runbook.md` — 로컬 개발 환경 설정 절차
