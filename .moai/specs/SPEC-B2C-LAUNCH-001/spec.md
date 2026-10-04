---
id: SPEC-B2C-LAUNCH-001
title: "B2C 출시 게이트: 단계 정의·플래그 순서·deploy smoke 교체·go/no-go 기록·롤백 (Plan-Phase)"
version: "0.1.0"
status: draft
created: 2026-10-02
updated: 2026-10-04
author: Nexsol
priority: P1
phase: "v0.20.0 target"
module: ".github/workflows/, scripts/, lib/diagnosis/, components/diagnosis/, components/result/, components/consult/, .moai/docs/"
lifecycle: spec-anchored
tags: "b2c-launch, go-no-go, stage-definition, flag-ordering, deploy-smoke, rollback, internal-test-exposure, legal-surfaces, plan-only"
tier: M
related_specs: [SPEC-B2C-ENGINE-001, SPEC-B2C-CONSULTOPS-001, SPEC-B2C-CONSULT-001, SPEC-B2C-DIAGNOSIS-001, SPEC-B2C-RESULT-001]
---

## HISTORY

- 2026-10-02: 최초 작성 (Nexsol) — 이 문서들은 2026-10-02에 `main@99993bf` 위에서 만든, 커밋되지 않은 plan-phase 초안이다(`git log -1` = `99993bf`, 작성 시작 시 `git status --short`는 형제 SPEC 두 디렉터리만 미추적으로 보였다). 응용 코드·설정·워크플로·환경 파일·기존 SPEC 디렉터리·감사 보고서는 변경하지 않았고, 운영 VM·운영 DB·운영 플래그에는 접근하지 않았다. 이 항목은 감사·커밋·테스트 결과를 주장하지 않는다.
- 2026-10-03: D-LAUNCH-01~09 사용자 인터뷰 결정 반영 — 2026-10-03 사용자 인터뷰에서 Open Decisions for User의 D-LAUNCH-01~09 9건이 모두 결정됐다(결정 전문은 `progress.md` "결정 기록 (2026-10-03, 사용자 인터뷰)"). 이 변경은 결정 기록 반영과 `spec.md` Open Clarification N1~N11의 교차 확인 현황 주석("N1~N11 교차 확인 현황")만 추가했다 — 기존 REQ·AC·Out of Scope 본문은 바꾸지 않았고 `status`는 `draft`로 유지했다. plan-auditor 재감사는 이 커밋의 범위가 아니다.
- 2026-10-03: 2차 정밀 교정 — (1) D-LAUNCH-07 롤백 사유 목록에 진단 표면 전용 사유 2종(잘못된 판정/결과 매핑 확인, 지원 범위 밖 결과 노출 확인)을 추가하고 선언·실행 역할은 기존 결정(선언 (iii), 실행 (1))을 그대로 적용, 확인 방법을 ENGINE-001 D-ENGINE-03 매트릭스(AC-B2CENGINE-023)로 연결했다. (2) D-LAUNCH-01(e)·D-LAUNCH-03 Q2(4)에 따라 첫 내부 시험이 로컬 실행에 한정되어 운영 호스트의 게이트 상태 벡터를 바꾸지 않는다는 점을 §2.4·R-01 항목에 명시하고, CONSULTOPS-001 D-OPS-12("면제 없음")의 적용 시점이 상담 표면 자신이 열리는 때이며 이 첫 내부 시험(진단 전용)에는 적용되지 않음을 교차 확인했다. (3) CONSULTOPS-001의 개정된 D-OPS-04(03-C·03-B·03-D·고객 문의·개인정보처리방침·이용약관 6개 요소, 전부 미확정)를 L-08·D-LAUNCH-09에 교차 참조로 추가하고, 그 결과 01·02·03의 일반 공개(G) 준비 상태가 D-OPS-04 확정 전까지 BLOCKED임을 적었다(이 SPEC이 새로 내리는 결정이 아니다). (4) ENGINE-001의 "진단 대상 유형" 용어 정정 영향 확인 — 이 SPEC은 "사고 유형"을 쓴 적이 없어(grep 0건) 정렬이 불필요함을 확인했다. 요구사항·AC 본문의 번호·개수(16/16)와 REQ↔AC 1:1 매핑은 바꾸지 않았고 `status`는 `draft`로 유지했다. plan-auditor 재감사는 이 교정의 범위가 아니다(`progress.md` §E.1 참조).
- 2026-10-03: 3차 정밀 교정(사용자 직접 검토 지시) — (1) §2.4 단계 표의 "내부 시험 공개" 행과 그 아래 별도 캐이브아웃 문단이 서로 다르게 읽히던 모순(표는 운영 호스트에서의 플래그 전환처럼, 캐이브아웃은 "실제로는 로컬뿐"으로 서술)을 하나의 셀로 합쳐 제거했다. (2) L-01·L-05·R-04(운영 배포·PM2에 관한 증거)에 R-01과 같은 "적용 시점" 설명을 추가해, D-LAUNCH-01(e)·D-LAUNCH-03 Q2(4)가 정한 로컬 실행 전용 첫 내부 시험(운영 노출 확대가 일어나지 않음)에는 적용되지 않고 운영 호스트에서 실제 노출 확대 단계 앞에는 여전히 필수임을 명시했다 — I/G 칸의 열거값(필수/결정 대기/해당 없음)과 그 조합 분포(awk 집계로 재확인, 14행 불변)는 바꾸지 않았다. (3) L-08의 일반 공개(G) 차단을 목적 벡터의 표면별로 적용하도록 고쳤다 — CONSULTOPS-001 D-OPS-04의 S2(상담) 전용 3개 요소(03-C·03-B·03-D) 미확정만으로는 아직 열지 않는 S1(01·02 진단) 단독 공개의 G를 차단하지 않고, 01·02·03 공유 3개(고객 문의·개인정보처리방침·이용약관)는 계속 S1·S2 양쪽을 차단한다 — D-OPS-04의 미확정 상태 자체는 바꾸지 않았다(AC-B2CLAUNCH-015 시나리오 2 추가, plan.md M2에 표면별 점검기 설계 추가). D-LAUNCH-05의 "면제 없음" 결정은 임의로 완화하지 않고 그대로 유지했다. 요구사항·AC 본문의 번호·개수(16/16)와 REQ↔AC 1:1 매핑은 바꾸지 않았고 `status`는 `draft`로 유지했다. plan-auditor 재감사는 이 교정의 범위가 아니다(`progress.md` §E.1 참조) — 기존 1회차 PASS(0.88)는 사용자 결정 반영 전 상태 기준이라(정확한 피감사 SHA는 미확인, `progress.md` §E.1·§G) 이번 교정에도 자동으로 적용되지 않는다.
- 2026-10-04: 4차 정렬 교정(`origin/plan/b2c-launch-readiness@0553039` 기준, 사용자 지시 5건 중 이 SPEC 해당 2건). (1) 로컬 내부 시험의 적용 조건을 점검기 계약과 AC에 반영했다 — §2.4에 실행 환경(`local`/`production`, 명시 입력·기본값 없음·열거 밖이면 거부)과 운영 한정 항목(L-01·L-05·R-04)을 정의하고, `local`에서는 그 셋을 적용하지 않으며 운영 노출 확대에는 계속 필수로 두었다. REQ-B2CLAUNCH-002, §2.4 단계 표("내부 시험 공개" 행을 실행 환경별 두 형태로, "일반 사용자 공개"는 운영 호스트 한정), L-01·L-05·R-04 칸, AC-B2CLAUNCH-001·002를 맞췄고 AC-002의 fixture를 아홉 가지에서 열다섯 가지로 늘렸다(양성·음성 각 환경). (2) 감사 범위 기록을 바로잡았다 — 1회차 보고서 커밋 `643dec1`은 결정 반영 커밋 `c89dae7`보다 앞서고 보고서도 D-LAUNCH 결정 미정 상태를 적었으므로, `progress.md` §E.1·§G의 "`c89dae7`까지 감사" 서술을 지우고 사용자 결정 반영 전 기준(정확한 피감사 SHA 미확인)으로 통일했다. 감사 보고서·점수·iteration은 바꾸지 않았다. D-LAUNCH-01~09의 기존 사용자 결정은 바꾸지 않았고 새 인터뷰를 하지 않았다. 요구사항·AC 번호와 개수(16/16)는 유지했고 `status`는 `draft`다. plan-auditor 재감사는 이 교정의 범위가 아니다(`progress.md` §E.1 참조).

---

## 1. 배경 (Why)

01 질문 입력, 02 보상 진단 결과, 03 상담 신청의 화면과 상담 접수 API 코드는 `main@99993bf`에 병합돼 있다. 형제 SPEC 둘이 각자의 몫을 계획했다 — SPEC-B2C-ENGINE-001은 진짜 진단 엔진과 그 준비 증거를, SPEC-B2C-CONSULTOPS-001은 상담을 켜기 전의 증거 항목(E-01~E-18)과 절차를. 그런데 둘 다 같은 것을 아직 없는 SPEC-B2C-LAUNCH-001에 맡겼다: 단계 정의, 내부 시험에서 일반 공개로 넘어가는 게이트, 진단과 상담에 걸친 플래그 순서, `DIAGNOSIS_ENGINE_READY` 전환, 그리고 `deploy.yml`의 placeholder smoke 교체다(§2.2). 이 SPEC이 그 SPEC이다.

이 SPEC은 "화면·상담 API가 배포되어 있다"와 "일반 사용자에게 서비스를 열어도 된다"를 잇는 go/no-go 게이트를 계획한다. **아무것도 지금 켜지 않는다.** 플래그 전환·재시작·환경 변경·워크플로 병합·운영 관측은 나중의 운영 행위로 정의만 하며, 형제 SPEC이 소유한 증거는 항목 식별자로 참조만 한다.

### 1.1 상태의 구분

- **배포 완료(dark) — 코드 사실**: 화면·API 코드가 `main@99993bf`에 있다(LF-01). 이 상태에서 플래그 5종이 모두 `"true"`가 아니면 진단 게이트·상담 화면·상담 접수가 모두 닫혀 있다(§2.3).
- **운영 상태 — 미관측**: 마지막 관측은 2026-10-02 **병합 이전**이다 — 가동 커밋 `f7ef4ec`, 플래그 5종 모두 미설정(LF-02). 병합 이후 운영 상태는 이 작성 세션이 관측하지 않았다. 병합이 곧 배포이므로(LF-03) 사실상 새 빌드가 가동 중일 가능성이 높으나 그것은 추정이며 이 문서의 근거로 쓰지 않는다. L-01(§2.4)이 이 공백을 닫는 항목이다.
- **일반 사용자 대상 서비스 출시 가능 — 사실 아님**: (1) 01에서 02로 가는 진짜 경로가 없다 — 02에 이르는 유일한 길은 review 플래그와 고정 골절 문장이며 그 결과는 하드코딩된 표본 1건이다(LF-09, 형제 ENGINE-001 `spec.md:30-40`). (2) 진단 동의 상세 6개 문구가 placeholder이고 상담 동의 상세 본문은 임시 문구다(LF-14). (3) 상담 쪽 증거(담당 창구, 보존 절차, 연락 약속 등)는 CONSULTOPS-001의 미결정 항목이다. (4) 01·02·03 푸터의 법적 고지 요소가 세 표면에서 서로 다른 미완 상태다(LF-13). (5) `deploy.yml`의 smoke 검사가 진단 게이트가 열리면 실패하도록 짜여 있다(LF-04, LF-19). (6) 운영 호스트가 하나뿐이라 내부 시험도 같은 노출을 갖는다(LF-07, LF-10).

### 1.2 증거 장부 (이 세션이 직접 읽거나 실행한 것)

"읽음"은 이 세션이 해당 파일의 해당 줄을 직접 열어 확인했다는 뜻이다. "관측"은 이 세션이 실행한 명령의 결과다. "검색"은 `grep`류 결과이며 부재의 증명이 아니다. "미검증"은 확인하지 못한 것이다. 오케스트레이터의 증거 팩은 주장으로 취급해 다시 확인했고 틀린 항목은 `progress.md` Plan-phase Observations에 적었다.

| ID | 사실 | 근거 | 구분 |
|---|---|---|---|
| LF-01 | 작성 기준선은 `99993bf feat(SPEC-B2C-CONSULT-001): 상담 신청(03) 화면·API 구현 (#22)`이고 작성 시작 시 `git status --short`는 `.moai/specs/SPEC-B2C-CONSULTOPS-001/`, `.moai/specs/SPEC-B2C-ENGINE-001/` 둘만 미추적으로 보였다 | `git log -1`, `git status --short` | 관측 |
| LF-02 | 운영 상태의 마지막 관측은 2026-10-02 병합 이전이다: 가동 커밋 `f7ef4ec`, 플래그 5종 모두 PM2 환경·프로세스 환경·앱 폴더 `.env`에 없음(두 번 관측). 병합 이후는 미관측이다. 자동 메모리에 병합 후 배포 성공을 적은 항목이 있으나 이 세션은 확인하지 않았고 근거로 쓰지 않는다 | `.moai/reports/merge-readiness/SPEC-B2C-CONSULT-001/MERGE-CHECKLIST.md:35-51`, `.moai/specs/SPEC-B2C-CONSULT-001/progress.md:4081-4083,4153` | 읽음(관측은 이전 세션) |
| LF-03 | `deploy.yml`의 트리거는 `main` push와 수동 실행이고(`:3-7`) `paths` 필터가 없다(`grep -cE "paths(-ignore)?:"` → 0). 배포 한 번은 `git reset --hard origin/main`(`:37`) → `pnpm install` → `pnpm run db:migrate`(`:43`) → 빌드 → `pm2 restart "$PM2_APP"`(`:61`, `--update-env` 없음) → `pm2 save` → smoke 순서다. 따라서 어떤 커밋이든 `main`에 올라가면 운영이 재시작되고(문서만 바꾼 커밋 포함), smoke 실패는 재시작 뒤라 새 빌드가 이미 가동 중인 채로 Actions만 빨갛게 된다. 배포는 같은 `concurrency` 그룹으로 직렬이다(`:9-11`) | `.github/workflows/deploy.yml:3-11,37,43,61-62` | 읽음 + 검색 |
| LF-04 | placeholder smoke는 `GET /` 본문에서 `서비스 준비 중입니다`를 `grep -q`로 찾고 없으면 `exit 1`한다(`:96-101`). 2xx 검사(`:76-94`)와 CSS 청크 검사(`:103-118`)는 게이트 상태와 무관하다. `SMOKE_URL`은 `/` 하나라 `/consult`와 `POST /api/consultations`는 smoke 대상이 아니다(`:76`). 이 문구는 앱 소스의 진단 게이트가 닫힌 분기(`app/page.tsx:71`)와 `/result`·`/consult`의 닫힌 분기(`app/result/page.tsx:59`, `app/consult/page.tsx:45`)에만 나오고 열린 분기에는 없다(`grep -rn "서비스 준비 중입니다"` 결과) | `.github/workflows/deploy.yml:76-118`, `app/page.tsx:61-76` | 읽음 + 검색 |
| LF-05 | 게이트 계산은 값이 정확히 `"true"`일 때만 참이다(`lib/diagnosis/flags.ts:22-24,38-47,63-70`). §2.3의 표는 이 세션이 두 함수를 임시 스크립트(저장소 밖)로 직접 호출한 12행 출력이다. 엄격 일치 탐침 — `"TRUE"`, `"1"`, `"yes"`, 앞뒤에 공백이 붙은 `" true"`·`"true "`, 빈 문자열, 미설정 — 은 모두 거짓이었다(`ENABLE_DIAGNOSIS_DEV_STATES` 입력으로 시험) | `lib/diagnosis/flags.ts`, 함수 실행 | 읽음 + 관측 |
| LF-06 | `app/page.tsx:49,59-77`, `app/result/page.tsx:38,47-71`, `app/consult/page.tsx:30,39-58`은 모두 `force-dynamic`이고 요청 시점에 env를 읽는다. `/consult`는 진단 게이트와 독립이고 `/result`의 상담 CTA만 `ENABLE_CONSULT_FLOW`를 따른다(`app/result/page.tsx:54,69`). 열린 `/consult`도 유효한 핸드오프가 없으면 no-data 화면이다(`components/consult/consult-view.tsx:453`) | 위 파일 | 읽음 |
| LF-07 | 상담 접수 API의 정책 판정은 `CONSULT_POLICY_READY`에서만 파생된다(`app/api/consultations/route.ts:42-45`). 처리 순서는 스키마 검증 400(`:262-269`) → 정책 미준비 503(`:283-289`) → 동의 버전 불일치 409(`:290-296`) → DB 접근이다. `ENABLE_CONSULT_FLOW`·`shouldRenderConsult`·`computeConsultFlags`는 이 라우트와 `lib/consult/`의 비시험 파일에서 검색 0줄이다. 인증·세션·출처·CSRF·CORS·쿠키 이름(`authoriz`, `session`, `bearer`, `origin`, `csrf`, `cors`, `cookie`)을 대소문자 무시로 라우트 파일에서 검색한 결과 0줄이고 `next.config.ts`에서 `headers`·`origin`·`allowedOrigins`·`cors`·`rewrites` 검색도 0줄이며 루트의 `middleware.ts`·`proxy.ts`·`src/middleware.ts`·`src/proxy.ts`는 없다(확인한 경로만). 따라서 `CONSULT_POLICY_READY=true`와 시크릿이 있으면 화면 플래그와 무관하게 누구에게나 접수가 열린다 | `app/api/consultations/route.ts`, `ls`, `grep` | 읽음 + 검색(부재의 증명 아님) |
| LF-08 | `CONSULT_POLICY_READY === "true"`이고 `RATE_LIMIT_HMAC_SECRET`이 없으면 앱 스코프 부팅 검증이 실패한다(`lib/env.ts:143-145`, 호출은 `instrumentation.ts:25`). 형제 CONSULTOPS-001 F-12가 같은 사실을 적었다 | `lib/env.ts`, `instrumentation.ts` | 읽음 |
| LF-09 | review 경로: `mockJudge`는 `reviewEnabled && input === FRACTURE_FIXTURE_INPUT`일 때만 "result"를 돌려주고 그 밖은 "결과 없음"·"오류"다(`components/diagnosis/step-loading.tsx:54-62`). "result"면 고정 골절 결과를 만들어 `/result`로 간다(`components/diagnosis/diagnosis-flow.tsx:464`). `/result?devFixture=fracture`는 `reviewEnabled`로 게이트된 같은 고정 결과다(`components/result/result-view.tsx:82-87`). DIAGNOSIS-001은 "Oracle 프로덕션에서는 이 플래그를 설정하지 않거나 `false`로 유지한다"고 적는다(REQ-B2CDIAG-017 `.moai/specs/SPEC-B2C-DIAGNOSIS-001/spec.md:90`, REQ-B2CDIAG-025 `:104`). `ENABLE_DIAGNOSIS_FLOW`+`DIAGNOSIS_ENGINE_READY`만 열면 `reviewEnabled`가 거짓이라 일반 사용자는 02에 이르지 못한다 | 위 파일 | 읽음 |
| LF-10 | "내부 시험"이 세 곳에서 다르게 쓰인다 — ENGINE-001 `design.md:184`는 "내부 시험 공개(`reviewEnabled`)에서의 호출은 … 비프로덕션 전용"이라 쓰고, CONSULTOPS-001은 내부 시험을 "알려진 참여자의 시험 데이터 제출"로 정의하며(`spec.md:112`) 시험 장소를 운영 호스트 또는 로컬로 두고(D-OPS-12 `:274-278`) 별도 프리뷰 환경이 없다고 적고(F-22 `:63`), DIAGNOSIS-001은 review 경로를 비프로덕션 전용으로 둔다(LF-09). 세 서술은 서로 같은 말이 아니다(N2) | `.moai/specs/SPEC-B2C-ENGINE-001/design.md:184`, `.moai/specs/SPEC-B2C-CONSULTOPS-001/spec.md:63,112,274-278` | 읽음 |
| LF-11 | `pnpm verify:flag-runtime`은 로컬 `file:` DB에서만 빌드·서버 시작을 하고 원격 DB가 섞이면 실행을 거부한다(`scripts/verify-flag-runtime.ts:18-19,284-301`). 시작 조합은 8개다(`START_SCENARIOS :453-462`) — 상담 4조합은 진단 `DEV_ONLY`에서만, 진단 4조합은 상담 `F/F`에서만 돈다. 32 원조합 중 8개를 본다. 관측 대상은 `/`·`/result`·`/consult`와 `POST /api/consultations`의 상태 코드다(`observe`, `:391`). `deploy.yml`·PM2·프록시는 실행하지 않고 CI에도 없다. 이 세션은 이 스크립트를 실행하지 않았다. 같은 날 실행된 과거 기록(저장소 밖 백업 폴더 `cleanup-backup-20261002/local-evidence/consult-followup/.moai/state/verify/premerge/flag-runtime.log`, 수정 시각 2026-10-02 11:58, 당시 코드 기준이며 현재 `main@99993bf`와 같다는 증거는 없다)에는: 진단 게이트가 열린 시작에서 `/` 응답의 `<title>`이 `보상 진단`, 닫힌 시작에서 `서비스 준비 중`이었고, 열린 시작에서만 `enableDevStates` prop이 응답에 있었으며, `consult=false policy=true`에서 `api=201`, `consult=true policy=true`에서 `api=409`였다 | `scripts/verify-flag-runtime.ts`, 위 로그 | 읽음(과거 로그) |
| LF-12 | smoke에 쓸 수 있는 식별자: `<title>`(`보상 진단`·`서비스 준비 중`, `app/page.tsx:54`)은 LF-11의 과거 로그가 SSR 응답에서 관측했다. 열린 응답에 `서비스 준비 중입니다`가 없다는 것도 같은 로그의 게이트 판정(문구 없음 + 열림 prop 있음 = open, `scripts/verify-flag-runtime.ts` `extractGateState`)이 관측했다. `data-testid="diagnosis-flow"`(`components/diagnosis/diagnosis-flow.tsx:396`)와 `data-testid="diagnosis-hero-title"`(`components/diagnosis/step-input.tsx:160`)는 코드에는 있으나 이 세션이 어떤 응답에서도 관측하지 못했다(미검증) | 위 파일·로그 | 읽음 + 과거 로그 |
| LF-13 | 푸터가 세 벌이다 — 01 `components/diagnosis/diagnosis-footer.tsx:9,28-32`는 `<a href="#">` 세 개(개인정보처리방침·이용약관·고객 문의, 목적지 없는 앵커), 02 `components/result/result-footer.tsx:11,34-39`는 `<a href="#">` 둘과 텍스트 `고객 문의: 준비 중`, 03 `components/consult/consult-footer.tsx:13,29-40`은 비활성 `role="link"` + `aria-disabled="true"` + `준비 중`(데스크톱만, `:25`)이다. 사용처는 `diagnosis-flow.tsx:484`, `result-cta-bar.tsx:227`, `consult-outcome-frame.tsx:84`, `consult-view.tsx:609`다. CONSULTOPS-001 D-OPS-04 (d)는 03 푸터만 다룬다(`spec.md:220`) | 위 파일, `grep -rn 'href="#"' components app --include=*.tsx` | 읽음 + 검색 |
| LF-14 | 진단 동의 상세 6개 항목이 리터럴 `{…확정 문구}` placeholder다(`components/diagnosis/consent-detail-content.tsx:13-18`). DIAGNOSIS-001은 이 6개가 모두 확정 문구로 교체돼야 `ENABLE_DIAGNOSIS_FLOW`를 `true`로 전환할 수 있다고 적는다(`spec.md:104`, `plan.md:26`). 상담 동의 상세 본문은 임시 문구("…아직 확정되지 않았습니다…", `components/consult/consult-consent-group.tsx:68`)이고 정책 준비 상태에서만 보이며(`:127`) 미준비 상태는 "상세 안내 준비 중"이다(`:168`) | 위 파일 | 읽음 |
| LF-15 | 저장소는 공개다 — `https://api.github.com/repos/KyungHwanLeeNexsol/bosang-radar` 조회 결과(2026-10-02) `private: false`, `visibility: public`. 이 셸에는 `gh`가 PATH에 없었다 | 웹 조회 | 관측 |
| LF-16 | `package.json`에 분석·관측 계열 의존성이 없다(`grep -ciE "sentry\|datadog\|posthog\|analytics\|opentelemetry\|newrelic\|logrocket\|amplitude\|mixpanel\|vercel/analytics" package.json` → 0). 워크플로는 `deploy.yml`, `label-sync.yml` 둘이고(`ls .github/workflows`) PR 시험 CI가 없다(CONSULTOPS-001 F-19) | `package.json`, `ls` | 검색 + 관측 |
| LF-17 | 저장소에 PM2 ecosystem·Nginx 설정이 추적돼 있지 않다(`git ls-files \| grep -iE "nginx\|ecosystem"` → 출력 없음). 앱 인스턴스는 1개로 한 시점(2026-09-30) 관측됐다(`.moai/docs/runtime-runbook.md` §12.5, CONSULTOPS-001 F-18). `pm2 restart`가 바뀐 환경을 다시 읽는지는 미검증이다(`runtime-runbook.md` §11.4, CONSULTOPS-001 F-16) | `git ls-files`, 런북 | 검색 + 읽음 |
| LF-18 | 형제가 LAUNCH에 맡긴 것: CONSULTOPS-001 §2.2는 단계 정의·진단과 상담에 걸친 플래그 순서·`deploy.yml` smoke 교체를 LAUNCH 소유로 적고(`spec.md:79-84`), I/G 열은 작업 라벨이며(`:84,112-113`) I에서 G로 넘어가는 이행 게이트의 소유를 묻는다(N7 `:188`). ENGINE-001은 `DIAGNOSIS_ENGINE_READY=true` 전환의 소유를 LAUNCH로 적고(`spec.md:61,66`) 그 확인을 N5로 남겼다(`:142`). DIAGNOSIS-001은 smoke 교체를 "두 플래그가 프로덕션에서 실제로 모두 `true`가 되는 시점"에 묶는다(REQ-B2CDIAG-023 `spec.md:99`, AC-B2CDIAG-024 `acceptance.md:55`, `plan.md:69`) | 위 파일 | 읽음 |
| LF-19 | DIAGNOSIS-001의 smoke 교체 트리거에는 틈이 있다: 트리거는 `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 모두 `true`일 때뿐인데, §2.3 표의 `D=1` 행은 이 둘 없이 `ENABLE_DIAGNOSIS_DEV_STATES`만으로도 진단 게이트가 열림을 보인다. 그러면 `/`에서 placeholder 문구가 사라져 현재 smoke가 실패한다(LF-04, LF-12) | LF-04·LF-05·LF-18의 조합 | 읽음 + 관측 |
| LF-20 | 외부 선례(구조만 재사용, 내용은 B2B 시대): REQ-PILOT-READY-016(`.moai/specs/SPEC-PILOT-READY-001/spec.md:697`)은 파일럿 개시 판정을 SPEC 완료와 분리된 별도 기록으로 두고 항목마다 `READY`·`BLOCKED`·`UNVERIFIED`를 요구하며, 판정 문서는 "빈칸"과 `UNVERIFIED`를 구별한다(`.moai/reports/pilot-ready-readiness-decision-2026-09-10.md` "문서 상태 공정" 절, `:10`). REQ-PILOT-OPS-006(`.moai/specs/SPEC-PILOT-OPS-001/spec.md:369`)은 1단계(단독) → 격리 게이트 → 2단계 → 3단계로 단계를 나누고 단계마다 전환 조건과 중단 기준을 요구한다 | 위 파일 | 읽음 |

## 2. 범위 (Scope)

### 2.1 포함

- 단계 정의 — "배포 완료(dark)", "내부 시험 공개", "일반 사용자 공개"를 따로 정의하고 단계마다 필요한 `READY`·`BLOCKED`·`UNVERIFIED` 항목을 정한다. 형제 SPEC의 증거는 항목 식별자로 참조한다.
- 내부 시험의 노출 문제 — 정책 준비 상태의 상담 API 개방, 단일 운영 호스트, review 경로의 비프로덕션 제한을 하나의 노출 기록으로 다룬다.
- 진단·상담에 걸친 플래그 조합표와 노출 순서, 재시작 단위의 전환 규칙.
- `deploy.yml` placeholder smoke 교체의 요구와 로컬에서 돌릴 수 있는 인수 방법.
- 별도 서명 기록으로서의 go/no-go 기록, 법무 확인 기록의 구성, 공개 저장소 제약.
- 두 기능에 걸친 롤백(dark 복귀), 01·02·03 공개 화면의 법적 고지 요소, 사후 관측 기록.

### 2.2 소유 경계

| 이 SPEC이 소유 | 형제 SPEC이 소유(이 SPEC은 항목 id로 참조만) |
|---|---|
| 단계 정의(배포 완료·내부 시험 공개·일반 사용자 공개)와 내부 시험에서 일반 공개로 넘어가는 이행 게이트(CONSULTOPS-001 N7이 맡긴 것) | CONSULTOPS-001: 상담 증거 항목 E-01~E-18의 정의, 상담 활성화·롤백 절차, PM2 재읽기 관측(E-03), 시크릿(D-OPS-07), 행 처분(D-OPS-10), 증거 기록 보관(D-OPS-11) |
| `DIAGNOSIS_ENGINE_READY`를 `true`로 바꾸는 단계의 소유(ENGINE-001 N5가 맡긴 것) | ENGINE-001: 엔진 준비 증거(REQ-B2CENGINE-023 (i)~(iv)), D-ENGINE-05·07·09·10, `resultId` 정책 |
| 진단·상담에 걸친 플래그 조합표와 노출 순서 | CONSULT-001·DIAGNOSIS-001·RESULT-001: 화면·API 코드와 계약 |
| `deploy.yml` placeholder smoke 교체(DIAGNOSIS-001 REQ-B2CDIAG-023·AC-B2CDIAG-024의 트리거를 이어받음) | |
| go/no-go 기록, 노출 기록, 롤백 총괄, 01·02·03 법적 고지 요소의 현황 기록, 사후 관측 기록 | |

smoke 교체를 ENGINE-001도 CONSULTOPS-001도 소유하지 않는 이유는 둘 다 자신의 범위 밖으로 적었기 때문이다 — ENGINE-001은 `spec.md:65`에서 "여기서 처리하지 않는 것"으로 두고 LAUNCH를 지정하며, CONSULTOPS-001은 상담 플래그가 `/`의 smoke에 영향을 주지 않으므로(`spec.md:55,84`) 바꾸지 않는다. 이 문서가 소유 진술을 한다는 것이 값의 결정이 아님을 분명히 한다: 이 SPEC은 단계의 정의와 이행 게이트의 틀을 소유하며 담당자·문구·수치·법적 결론은 정하지 않는다.

### 2.3 게이트 상태 표 (코드에서 계산)

아래 표는 `computeDiagnosisFlags`·`computeConsultFlags`(`lib/diagnosis/flags.ts`)를 이 세션이 직접 호출해 얻은 출력이다(LF-05). 기호: `F`=`ENABLE_DIAGNOSIS_FLOW`, `E`=`DIAGNOSIS_ENGINE_READY`, `D`=`ENABLE_DIAGNOSIS_DEV_STATES`, `C`=`ENABLE_CONSULT_FLOW`, `P`=`CONSULT_POLICY_READY`, `S`=`RATE_LIMIT_HMAC_SECRET` 설정 여부. 1은 정확히 `"true"`, 0은 그 밖의 모든 값이다.

**진단 게이트(8조합)**

| F | E | D | productionReady | reviewEnabled | 진단 게이트 | 비고 |
|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 거짓 | 거짓 | 닫힘 | dark |
| 0 | 0 | 1 | 거짓 | 참 | 열림(review 경로) | 문서 금지: 운영 호스트에서 `D`는 `true`가 아니어야 한다(LF-09) |
| 0 | 1 | 0 | 거짓 | 거짓 | 닫힘 | `E`만으로는 열리지 않는다 |
| 0 | 1 | 1 | 거짓 | 참 | 열림(review 경로) | 문서 금지(`D`) |
| 1 | 0 | 0 | 거짓 | 거짓 | 닫힘 | `F`만으로는 열리지 않는다 |
| 1 | 0 | 1 | 거짓 | 참 | 열림(review 경로) | 문서 금지(`D`) |
| 1 | 1 | 0 | 참 | 거짓 | 열림(production 경로) | 열리지만 02에는 이르지 못한다(LF-09) |
| 1 | 1 | 1 | 참 | 참 | 열림(둘 다) | 문서 금지(`D`) |

**상담 게이트(4조합)**

| C | P | 상담 화면 | 상담 접수 | 비고 |
|---|---|---|---|---|
| 0 | 0 | 닫힘 | 닫힘(503) | dark |
| 0 | 1 | 닫힘 | 열림 | 화면 없이 접수만 열린다(LF-07). 이 조합이 어느 단계의 벡터에 들어가는지는 D-LAUNCH-03이 정한다 |
| 1 | 0 | 열림 | 닫힘(503) | 화면은 보이고 제출은 정책 미준비 응답이다 |
| 1 | 1 | 열림 | 열림 | 접수 개방 |

**경로별 도달 규칙**: `/`와 `/result`는 진단 게이트가 열렸을 때만 본 화면이고 닫혔으면 placeholder `서비스 준비 중입니다`(200)다(`app/page.tsx:61-76`, `app/result/page.tsx:56-65`). `/result`가 열렸을 때 상담 CTA는 `C`가 참일 때만 활성이다(`app/result/page.tsx:54,69`). `/consult`는 `C`만 따르며 진단 게이트와 무관하다(`app/consult/page.tsx:42-57`). `POST /api/consultations`는 스키마 검증 뒤 `P`로 판정하고 `C`와 진단 플래그를 읽지 않는다(LF-07).

**불가능 조합**: `P=1`이고 `S`가 없으면 앱이 부팅 중 종료된다(LF-08). 시크릿을 쓰는 것은 `P=1`일 때뿐이라 `S`는 `P=0`에서는 도달 상태에 영향이 없다.

**벡터와 전환**: 위 표의 한 칸씩을 모은 것이 게이트 상태 벡터다 — 진단 게이트(닫힘/열림 경로), 상담 화면(닫힘/열림), 상담 접수(닫힘/열림), 시크릿 설정 여부. 환경을 바꾸는 재시작 한 번은 벡터 하나에서 벡터 하나로 옮기는 전환이다.

### 2.4 용어와 증거 항목(정의표)

- **표면**: S1 = 진단 화면(`/`와 `/result`), S2 = 상담 화면(`/consult`), S3 = 상담 접수 API(`POST /api/consultations`).
- **노출 확대 단계**: 표면 S1·S2·S3 중 하나 이상이 닫힘에서 열림으로 바뀌는 환경 변경과 재시작, 또는 D-LAUNCH-01이 기록한 도달 제한 수단을 해제·완화하는 변경이다. 표면을 닫는 변경은 노출 확대 단계가 아니다(롤백).
- **실행 환경**: 점검기와 시험이 실행되는 곳이다. 값은 `local`(참여자 PC의 로컬 파일 DB·로컬 서버이며 운영 호스트에 접근하지 않음)과 `production`(운영 호스트에 영향을 주는 노출 확대 단계 앞의 점검) 둘뿐이다. 점검기는 이 값을 명시적 입력으로 받으며 기본값이 없다 — 입력이 없거나 둘 밖의 값이면 점검을 거부한다(fail-closed). 로컬 첫 진단 시험(D-LAUNCH-01(e)·D-LAUNCH-03 Q2(4))은 `local`이며 운영 호스트의 게이트 상태 벡터를 바꾸지 않으므로 노출 확대 단계가 아니고 운영 상태는 계속 배포 완료(dark)다. `일반 사용자 공개`는 운영 호스트에서만 성립하므로 `local`로 G 열을 점검하는 입력은 거부한다. **운영 한정 항목**은 L-01·L-05·R-04 셋이다 — `local`에서는 적용하지 않고(점검기 출력은 `해당 없음(local)`이며 `READY`도 `BLOCKED`도 아니다) `production`에서는 I·G 열 표대로 계속 필수다. 이 셋 밖의 항목(예: L-04)은 실행 환경과 무관하게 적용된다.
- **단계**: 아래 표가 정의한다. 단계는 운영 호스트의 상태이고(로컬 실행은 운영 상태를 바꾸지 않으므로 단계를 바꾸지 않는다) `내부 시험 공개 가능`·`일반 사용자 공개 가능`은 판정이다 — 판정은 go 서명 기록이 있고 해당 열의 필수 항목이 모두 `READY`라는 뜻이며, 노출 확대 단계가 수행되기 전에는 상태가 여전히 dark다. 서명 없이 노출 확대 단계가 수행되면 REQ-B2CLAUNCH-002와 REQ-B2CLAUNCH-008 위반이다.

| 단계 | 정의 | 게이트 상태 벡터 | 도달 대상 | 판정 |
|---|---|---|---|---|
| 배포 완료(dark) | 코드가 `main`에 병합·배포됐고 진단 게이트·상담 화면·상담 접수가 모두 닫힌 상태 | 진단 게이트 닫힘, 상담 화면 닫힘, 상담 접수 닫힘(5종 플래그가 `"true"`가 아님) | 방문자는 placeholder만 본다. 상담 접수 API는 503이다 | 어느 공개 단계의 판정도 충족하지 않는다 |
| 내부 시험 공개 | 도달 대상을 D-LAUNCH-02가 기록한 참여자 역할로 한정해 일부 또는 전부의 표면을 시험하는 상태이며 실행 환경에 따라 두 형태다. `local`(로컬 첫 내부 시험, 현재 결정 D-LAUNCH-01(e)·D-LAUNCH-03 Q2(4)): 참여자가 자기 로컬 실행에서 시험하고 운영 호스트에는 아무것도 열지 않는다. `production`(D-LAUNCH-01의 다른 옵션으로 결정이 바뀐 경우): 운영 호스트에서 표면을 열며 실제 도달 범위는 노출 기록(L-02)이 따로 적는다 | `local`: 운영 호스트의 게이트 상태 벡터(§2.3)는 배포 완료(dark)와 같다 — 노출 확대 단계가 전혀 일어나지 않는다. `production`: D-LAUNCH-03 Q2가 기록한 표면 집합이 열리고 그 밖은 닫히며, 운영 호스트에서 `D`는 `true`가 아니어야 한다(DIAGNOSIS-001 REQ-B2CDIAG-017·025의 문구, N2) | 참여자 역할(D-LAUNCH-02) | `내부 시험 공개 가능` = 실행 환경에 해당하는 I 열 필수 항목이 모두 `READY`이고 I 서명이 있음(`local`이면 운영 한정 항목 L-01·L-05·R-04는 적용하지 않고 `production`이면 계속 필수) |
| 일반 사용자 공개 | 도달 대상을 한정하지 않고 운영 호스트에서 일반 방문자에게 표면이 도달 가능하다고 선언한 상태(실행 환경 `production`에서만 성립한다). 선언은 go 서명 기록으로 한다 | D-LAUNCH-03 Q1이 기록한 순서에서 그 단계에 열리는 표면 집합이 열림. 운영 호스트에서 `D`는 `true`가 아님(같은 문구, N2) | 일반 방문자 | `일반 사용자 공개 가능` = G 열 필수 항목이 모두 `READY`이고 G 서명이 있음 |

- **로컬 시험과 운영 상태의 구분(3차 정밀 교정, 4차 정렬 교정)**: 단계 표는 운영 호스트의 상태를 정의하고, 로컬 첫 내부 시험은 실행 환경이 `local`인 시험이라 운영 호스트의 게이트 상태 벡터를 바꾸지 않는다 — 운영 상태는 계속 배포 완료(dark)다. 단계 표의 "내부 시험 공개" 행은 실행 환경별 두 형태(`local`, `production`)를 나눠 적고, 어느 형태가 어떤 항목에 적용되는지는 위 "실행 환경" 항목이 정한다. 로컬 실행을 운영 호스트에서의 "공개 상태"로 서술하거나 그 자체를 "내부 시험 공개 가능" 판정의 근거로 쓰지 않는다 — 판정은 여전히 go 서명 기록과 해당 열 필수 항목의 `READY` 여부로만 성립하며, `local`에서는 운영 한정 항목(L-01·L-05·R-04)이 적용되지 않을 뿐 그 밖의 필수 항목은 그대로 적용된다.
- **I/G 구분의 한계(CONSULTOPS-001 N7이 묻고 이 SPEC이 답하는 것)**: 노출 기록(L-02)이 "도달 제한 없음"이면 I와 G는 필수 증거 집합과 선언 행위의 차이일 뿐 접근 통제의 차이가 아니다. 이 SPEC은 그 상태를 허용도 금지도 하지 않고 기록하게 한다(REQ-B2CLAUNCH-009). I에서 G로 넘어가는 이행의 집행 지점은 REQ-B2CLAUNCH-002와 REQ-B2CLAUNCH-008의 절차 규칙 하나이며 저장소의 어떤 산출물도 운영 호스트에서 환경을 직접 바꾸는 행위를 기계적으로 막지 못한다(N11).
- **항목 정의표 읽는 법**: `표면` 열이 S1·S2·S3를 적은 항목은 목적 벡터가 그 표면을 여는 경우에만 적용되고 `전체`는 항상 적용된다. I·G 칸의 값은 `필수`, `결정 대기`, `해당 없음` 셋뿐이다. `결정 대기`는 필수 여부를 근거 칸이 가리키는 결정이 정한다는 표지이며 **결정이 기록되기 전에는 `필수`와 같게 취급한다(fail-closed)**. 결정이 항목별 면제를 기록하면 그 칸만 `해당 없음`이 된다. `R-nn`은 형제 SPEC이 소유한 증거의 참조 줄이고 `L-nn`은 이 SPEC이 정의한 항목이다.
- **항목 기록 필드**: 식별자, 증명하는 것, 산출물 보관 위치(D-LAUNCH-04), 서명 또는 관측 역할, 날짜, 대상, 무효화 사건, 상태(`READY` / `BLOCKED` / `UNVERIFIED`)다. 빈 상태는 허용되지 않는다. 아래 표는 정의표라서 식별자, 항목(증명하는 것), 표면, I·G 칸, 근거, `대상 / 무효화 사건`만 적고 나머지 필드는 런북의 기록 표가 채운다.
- **대상**: 항목이 무엇에 대해 증명하는지다 — 코드(그 항목이 증명하는 동작이 읽는 파일 집합의 내용), 운영 환경(플래그·시크릿 설정 여부·가동 커밋), 결정 기록, 참조한 형제 기록의 상태와 대상 값. 코드 종류의 덮는 파일 집합은 런북이 항목마다 목록으로 적고, **이 go/no-go 기록과 증거 기록을 담은 파일 또는 구역은 어느 항목의 덮는 집합에도 넣지 않는다** — 기록만 바꾸는 커밋이 항목을 스스로 무효화하지 않게 하기 위해서다. 대상 값을 계산하는 수단은 run-phase가 정하며 이 SPEC은 정하지 않는다.
- **무효화 사건**: 관측 뒤에 일어나면 그 관측을 현재 사실로 더 쓸 수 없게 하는 사건이다. 시간 값을 쓰지 않는다. 종류는 다섯 가지다.
  - EV-L1: 항목의 덮는 파일 집합의 내용이 기록된 값과 달라짐. `main` push마다 배포되므로(LF-03) 기록만 바꾸는 커밋도 배포되지만, 덮는 파일을 하나도 바꾸지 않는 커밋은 EV-L1이 아니다. 배포가 일으키는 재시작으로 환경 값이 바뀌면 EV-L2, 재시작 단계가 바뀌면 EV-L5다.
  - EV-L2: 게이트 상태 벡터(플래그 5종, 시크릿 설정 여부, D-LAUNCH-01의 도달 제한 수단)가 기록 시점과 달라짐.
  - EV-L3: 항목이 참조한 형제 기록의 상태 또는 대상 값이 참조 줄에 적힌 값과 달라짐.
  - EV-L4: 해당 결정 기록(D-LAUNCH-NN) 또는 서명 역할 목록이 바뀜.
  - EV-L5: 운영 구성(PM2 시작 방식·재시작 명령, 앱 인스턴스 수, 프록시 구성, `deploy.yml`의 재시작·smoke 단계)이 바뀜.
- **READY**: 산출물이 보관 위치에 있고 역할·날짜·대상이 적혀 있으며 대상이 현재 값과 같고 그 항목에 적힌 무효화 사건이 관측 뒤에 일어나지 않았다. 사건이 일어나면 그 항목은 즉시 `UNVERIFIED`이고 사건 뒤 다시 관측해야 `READY`가 된다. 점검기는 기록의 상태 칸과 입력으로 받은 현재 대상 값만 읽으며 사건 발생을 스스로 감지하지 못한다 — 현재 대상 값을 계산해 넘기고 사건이 일어난 항목을 `UNVERIFIED`로 되돌리는 것은 호출하는 절차의 몫이다.
- **직전**: 시간이 아니라 순서다 — 해당 항목의 무효화 사건이 마지막으로 일어난 뒤이고 노출 확대 단계 앞이다. 노출 확대 뒤의 사건(예: 이후 배포)은 그것만으로 롤백 사유가 아니다.
- **서명 기록**: 사람이 무엇을 확인했는지(대상과 대상 값), 확인한 역할, 날짜를 적은 기록이다. **법적 결론은 담지 않는다.**
- **법무 확인 기록**: 법무가 문구 식별자·버전이나 전송 필드 집합 식별자 같은 두 기록이 서로 일치하는지를 확인했다는 사실만 적은 기록이다(필드는 REQ-B2CLAUNCH-006). 법적 결론, 판단 근거, 의견은 담지 않는다.
- **운영 호스트**: `deploy.yml`이 배포하는 대상 VM이다(대상은 GitHub 시크릿으로 지정되며 이 세션은 값을 읽지 않았다). 운영과 분리된 프로세스·DB·호스트는 운영 호스트가 아니다.
- **효과적 상태**: 실행 중인 프로세스가 실제로 적용하는 게이트 상태다. 설정 파일이나 의도가 아니라 응답(화면 응답, 상담 접수 API의 상태 코드)이나 프로세스 환경의 설정 여부로 관측한 것을 뜻하며 환경 값 자체는 기록하지 않는다.
- **외부 관측 기록**: 저장소 밖의 도달 제한 수단이 의도대로 도달을 막는다고 운영 책임자가 확인했다는 사실만 적은 기록이다 — 확인 대상, 확인 방법의 범주, 확인한 역할, 날짜. 접속 정보·주소·시크릿·접속 로그 원문은 담지 않는다(REQ-B2CLAUNCH-007).
- **결정 기록**: 어느 옵션이 선택됐는지, 결정한 역할, 날짜를 적은 기록이다. D-LAUNCH-NN의 해소는 결정 기록이 있을 때만 성립하며 법적 결론은 담지 않는다. 결정 기록이 없는 동안 해당 결정은 미결정이다.

| ID | 항목 | 표면 | I | G | 근거 | 대상 / 무효화 사건 |
|---|---|---|---|---|---|---|
| L-01 | 병합 후 기준선 관측 — 가동 커밋, 플래그 5종의 설정 여부(값이 정확히 `"true"`인지만), 진단 게이트·상담 화면·상담 접수의 효과적 상태. 설정 여부와 효과적 상태만 적고 값·접속 정보는 적지 않는다. **적용 시점(3차 정밀 교정, 4차 정렬 교정)**: 운영 한정 항목이다 — 점검기의 실행 환경이 `local`이면 적용하지 않고(D-LAUNCH-01(e)·D-LAUNCH-03 Q2(4)가 정한 로컬 첫 내부 시험은 운영 게이트 상태 벡터를 바꾸지 않는다), `production`이면 운영 호스트의 노출 확대 단계(§2.4) 앞에 계속 필수다(§2.4 "실행 환경") | 전체 | 필수 | 필수 | LF-02: 병합 이후 운영 상태는 미관측이다 | 운영 프로세스 환경과 가동 커밋 / EV-L2, EV-L5 |
| L-02 | 노출 기록 — 도달 가능한 경로·도달 대상·제한 수단과 그 위치·제한이 없으면 수용 기록(REQ-B2CLAUNCH-009). G 칸은 CONSULTOPS-001 E-08의 G `해당 없음`(상담 API 개방 수용)을 이 SPEC이 받아 확인하는 자리다 | 전체 | 필수 | 결정 대기 | LF-07, LF-10, D-LAUNCH-01(I), D-LAUNCH-05(G) | 도달 제한 수단의 구성과 상담 API 라우트 파일의 내용 / EV-L1, EV-L2, EV-L4 |
| L-03 | 내부 시험 참여자 역할과 데이터 규칙 기록. 상담 쪽 데이터 규칙은 CONSULTOPS-001 D-OPS-10 (Q2)를 참조하고 이 항목은 진단 쪽을 기록한다 | 전체 | 필수 | 해당 없음 | D-LAUNCH-02. G의 대상은 일반 방문자라 참여자 목록이 없다 | D-LAUNCH-02 결정 기록 / EV-L4 |
| L-04 | 플래그 조합표 로컬 검증 기록 — §2.3 표와 두 게이트 함수 출력의 일치, 경로별 도달 상태의 로컬 관측(REQ-B2CLAUNCH-010) | 전체 | 필수 | 필수 | LF-05, LF-06, LF-11 | 게이트·페이지·라우트·부팅 검증 파일 집합(`lib/diagnosis/flags.ts`, `app/page.tsx`, `app/result/page.tsx`, `app/consult/page.tsx`, `app/api/consultations/route.ts`, `lib/env.ts`) / EV-L1 |
| L-05 | smoke 검사 교체의 병합·배포 기록 — 교체가 `main`에 병합돼 배포됐고 그 배포의 smoke가 통과했음(REQ-B2CLAUNCH-013). 어떤 진단 플래그 변경이든 이 항목이 `READY`가 된 뒤에만 한다. **적용 시점(3차 정밀 교정, 4차 정렬 교정)**: 운영 한정 항목이다 — 점검기의 실행 환경이 `local`이면(운영 배포가 일어나지 않는다) 적용하지 않고, `production`이면 진단 플래그를 바꾸는 노출 확대 단계 앞에 계속 필수다(REQ-B2CLAUNCH-002, §2.4 "실행 환경") | S1 | 필수 | 필수 | LF-03, LF-04, LF-19, D-LAUNCH-06 | `.github/workflows/deploy.yml`과 smoke 검사가 실행하는 스크립트의 내용 / EV-L1, EV-L5 |
| L-06 | 롤백 결정 기록 — 선언 역할, 실행 역할, 사유 목록 | 전체 | 필수 | 필수 | D-LAUNCH-07 | D-LAUNCH-07 결정 기록 / EV-L4 |
| L-07 | 롤백 로컬 시험 수행 기록 — dark 벡터로의 복귀와 읽기 전용 확인(REQ-B2CLAUNCH-014). 상담 행 처분은 CONSULTOPS-001의 롤백 시험(E-06)이 다룬다 | 전체 | 필수 | 필수 | LF-03, CONSULTOPS-001 E-06 | 롤백 시험이 실행한 절차 문서·스크립트·제품 코드의 파일 집합 / EV-L1 |
| L-08 | 법적 고지 표면 현황 기록 — 01·02·03 푸터 요소별 상태와 단계별 허용(REQ-B2CLAUNCH-015). CONSULTOPS-001의 D-OPS-04는 6개 요소로 나뉜다 — **03 전용 3개**(03-C 상태확인·03-B 취소·삭제 문의·03-D 문의 창구, S2에만 나타남)와 **01·02·03 세 표면에 걸친 공유 3개**(고객 문의·개인정보처리방침·이용약관, LF-13). 2026-10-03 2차 정밀 교정 기준 6개 전부 미확정이다. **G 차단은 목적 벡터의 표면별로 적용한다(3차 정밀 교정, 직접 검토 지시)**: 공유 3개가 미확정인 동안은 그 요소가 나타나는 모든 표면(S1의 01·02 포함)의 G 칸이 BLOCKED이지만, 아직 열지 않는 S2 전용 3개의 미확정만으로는 S1(01·02, 진단) 단독 공개의 G 칸을 차단하지 않는다 — 그 3개는 S1에 나타나지 않기 때문이다. S2(상담 화면)를 열 때는 공유 3개와 S2 전용 3개 전부(6개 전부)가 확정돼야 S2의 G 칸이 BLOCKED에서 벗어난다. 해당 표면에 적용되는 요소 가운데 공통 요소를 포함해 하나라도 미확정이면 그 표면은 BLOCKED다. 이는 D-OPS-04의 현재 상태(6개 전부 미확정)가 낳는 결과이며 이 SPEC이 그 내용을 다시 정하거나 대신 판정하는 것이 아니다(REQ-B2CLAUNCH-004와 같은 원칙) — D-OPS-04의 미확정 상태 자체를 이 SPEC이 READY로 바꾸지 않는다 | S1·S2 | 결정 대기 | 결정 대기 | LF-13, D-LAUNCH-09, CONSULTOPS-001 D-OPS-04(6종 미확정, 공유 3·S2전용 3) | 세 푸터 컴포넌트 파일의 내용과 D-LAUNCH-09 결정 기록, CONSULTOPS-001 D-OPS-04 결정 기록 / EV-L1, EV-L3, EV-L4 |
| L-09 | 사후 관측 계획 기록 — 관측 대상, 담당 역할, 기록 위치, 관측 수단의 기존·신규 구분(REQ-B2CLAUNCH-016) | 전체 | 필수 | 필수 | LF-16, D-LAUNCH-08 | D-LAUNCH-08 결정 기록 / EV-L4 |
| R-01 | CONSULTOPS-001 상담 활성화 증거 집합 참조 — 단계 열에 따라 그 SPEC §2.4 표의 I 열 또는 G 열 필수 항목(`D-OPS-12` 칸 — "면제 없음"으로 결정됨, CONSULTOPS-001 2026-10-03 2차 정밀 교정 — 포함)이 모두 `READY`. **적용 시점**: 이 항목은 상담 표면(S2·S3) 자신이 내부 시험 노출 또는 일반 공개로 실제로 열리는 시점에만 적용된다 — D-LAUNCH-03 Q2 (4)가 정한 **첫 내부 시험**(진단 표면(S1)만 노출, 상담 표면은 그 대상이 아님)에는 적용되지 않는다(CONSULTOPS-001 D-OPS-12의 적용 시점 조항과 같은 구분) | S2·S3 | 필수 | 필수 | CONSULTOPS-001 §2.4, REQ-B2CCONSULTOPS-002, D-OPS-12 | 참조한 형제 기록의 상태와 대상 값 / EV-L3 |
| R-02 | ENGINE-001 엔진 준비 증거 참조 — REQ-B2CENGINE-023 (i)~(iv)와 D-ENGINE-09 서명의 적용 공개 단계 | S1 | 결정 대기 | 필수 | ENGINE-001 `spec.md:61,130`, `design.md:184`, D-LAUNCH-01·05 | 참조한 형제 기록의 상태와 대상 값 / EV-L3 |
| R-03 | ENGINE-001 D-ENGINE-07 진단 동의 상세 6개 문구 확정 기록 참조(`ENABLE_DIAGNOSIS_FLOW=true`의 선행 조건) | S1 | 결정 대기 | 필수 | LF-14, D-LAUNCH-05 | 참조한 형제 기록의 상태와 대상 값 / EV-L3 |
| R-04 | CONSULTOPS-001 E-03 재시작 전략 관측 기록 참조 — 진단 플래그를 바꾸는 재시작에도 적용(그 SPEC의 REQ-B2CCONSULTOPS-013 문구는 상담 플래그·시크릿만 적었다, N7). **적용 시점(3차 정밀 교정, 4차 정렬 교정)**: 운영 한정 항목이다 — 점검기의 실행 환경이 `local`이면(재시작이 없다) 적용하지 않고, `production`이면 운영 호스트에서 재시작이 실제로 일어나는 노출 확대 단계 앞에 계속 필수다(§2.4 "실행 환경") | 전체 | 필수 | 필수 | LF-03, LF-17, CONSULTOPS-001 E-03 | 참조한 형제 기록의 상태와 대상 값 / EV-L3, EV-L5 |
| R-05 | ENGINE-001 D-ENGINE-10 02 면책 문구 법무 검토 결정 기록 참조(ENGINE-001 `design.md:242`가 일반 공개 판정의 입력이 될 수 있다고 적음) | S1 | 해당 없음 | 결정 대기 | ENGINE-001 `design.md` §10.5, D-LAUNCH-05 | 참조한 형제 기록의 상태와 대상 값 / EV-L3 |

I 칸의 `필수`는 기술적으로 판정선이 분명한 항목(기준선 관측, 조합표 검증, 롤백, 결정 기록)이며 근거를 같은 줄에 적었다. 내용·법무·운영 항목은 이 SPEC이 면제 여부를 정하지 않는다(`결정 대기`).

### 2.5 의존성

- **형제 SPEC에 대한 의존은 `depends_on`으로 두지 않았다.** 이 SPEC의 run 게이트는 `depends_on`의 SPEC이 `completed`이기를 요구하는데(`.claude/rules/moai/workflow/spec-workflow.md` Depends_on Pre-flight Check) 의존은 SPEC 상태가 아니라 형제 증거 항목의 상태이고 ENGINE-001·CONSULTOPS-001은 `draft`, CONSULT-001은 `in-progress`다. `related_specs`로 비차단 참조만 남겼다.
- **일반 사용자 공개는 형제 증거에 의존한다**: 상담의 일반 사용자 대상 사용은 ENGINE-001이 해소하는 실제 결과를 기다린다(ENGINE-001 `spec.md:61`). 내부 시험은 이 의존이 없다.
- **형제 SPEC은 수정하지 않는다.** 이 SPEC이 필요로 하는 형제 변경은 확인 사항 N1~N11로 기록했다.

## 3. 요구사항 (GEARS)

특정 결정에 걸린 요구사항은 결정의 어느 옵션도 선점하지 않도록 `Where D-LAUNCH-NN가 …로 해소된 경우` 형태이거나 결과 중립 문구로 썼다.

### 3.1 단계 · 게이트 · 기록

- **REQ-B2CLAUNCH-001**: 출시 게이트 런북(후보 `.moai/docs/launch-gate-runbook.md`)은 "배포 완료(dark)", "내부 시험 공개", "일반 사용자 공개"를 서로 다른 세 상태로 정의하고, 각 상태를 §2.3의 어휘로 쓴 게이트 상태 벡터와 도달 대상으로 적으며, 배포 완료가 어느 공개 단계의 판정도 충족하지 않는다고 적는다.
- **REQ-B2CLAUNCH-002** (While): 목적 단계의 열에서 필수인 항목 — 칸 값이 아직 해소되지 않은 `결정 대기`인 항목을 포함하고 표면 열이 S1·S2·S3인 항목은 목적 벡터가 그 표면을 여는 경우에만 적용한다(§2.4, fail-closed) — 중 §2.4 정의의 `READY`가 아닌 것이 하나라도 있는 동안, 출시 절차는 노출 확대 단계(§2.4)를 수행해서는 안 된다. 이 요구사항이 막는 것은 노출 확대 단계 하나이며, 점검은 기록의 상태 칸과 입력으로 받은 현재 대상 값만 읽는다. 점검기는 실행 환경(`local` 또는 `production`, §2.4)을 명시적으로 입력받고 기본값이 없으며, 입력이 없거나 둘 밖의 값이면 점검을 거부한다. 실행 환경이 `local`이면 운영 한정 항목(L-01·L-05·R-04)은 적용하지 않고 `production`이면 I·G 열 표대로 계속 필수다.
- **REQ-B2CLAUNCH-003**: go/no-go 판정은 이 SPEC의 완료와 구조적으로 분리된 별도의 서명 기록으로 내리며, 기록의 모든 항목은 `READY` / `BLOCKED` / `UNVERIFIED` 중 하나이고 빈 칸을 허용하지 않는다. 전체가 no-go인 것은 이 SPEC의 완료를 막지 않는다.
- **REQ-B2CLAUNCH-004**: 형제 SPEC(SPEC-B2C-ENGINE-001, SPEC-B2C-CONSULTOPS-001)이 소유한 증거는 참조 줄(형제 SPEC id, 항목 id, 옮겨 적은 상태와 대상 값, 형제 기록의 위치)로만 참조하며, 이 SPEC은 그 증거의 상태를 형제 기록과 다르게 판정하지 않고 형제의 항목 목록을 복제하지 않는다.
- **REQ-B2CLAUNCH-005**: 각 항목은 대상(항목이 증명하는 동작이 읽는 파일 집합의 내용, 환경 값, 결정 기록, 참조한 형제 기록 중 하나이며 이 go/no-go 기록과 증거 기록 파일은 어느 항목의 덮는 파일 집합에도 넣지 않는다)과 무효화 사건(§2.4의 EV-L1~EV-L5)을 가지며, 무효화 사건이 관측 뒤에 일어나면 그 항목은 즉시 `UNVERIFIED`다.
- **REQ-B2CLAUNCH-006**: 법무 확인 항목은 확인 대상의 식별자와 버전, 확인한 역할, 날짜, 결과(`일치 확인` / `불일치` / `미확인` 중 하나)만 담은 확인 기록이 있을 때만 `READY`이며, 확인 기록은 법적 결론이나 판단 문구를 담지 않는다.
- **REQ-B2CLAUNCH-007**: 이 SPEC이 만드는 go/no-go 기록·서명 기록·참조 줄·런북·로그 발췌·검증 출력·시험 fixture와 이 저장소의 추적 파일은 시크릿 값, 실제 사용자 입력(진단 문장, 상담 연락처·이름), 담당자·서명자의 연락처와 개인 식별 정보, 법적 판단 세부를 담아서는 안 되며, 그 값을 담는 기록은 저장소 밖 또는 무시되는 비추적 위치에 두고 그 위치는 D-LAUNCH-04가 정한다.
- **REQ-B2CLAUNCH-008** (While): 목적 단계의 go 서명 기록이 없거나 서명 이후 그 기록이 담은 항목 중 하나가 `UNVERIFIED`가 된 동안, 출시 절차는 그 단계로 가는 노출 확대 단계를 수행해서는 안 된다. 서명 기록은 서명 시점의 항목 상태와 대상 값 전체, 서명한 역할(D-LAUNCH-04가 정한 역할 목록 안의 역할), 날짜를 담는다.

### 3.2 노출 · 플래그 · 순서

- **REQ-B2CLAUNCH-009** (When): 노출 확대 단계 앞에 도달했을 때, 출시 절차는 노출 기록 — 도달 가능한 경로(`/`, `/result`, `/consult`, `POST /api/consultations`, `?devStep=`·`?devFixture=` 질의), 각 경로에 도달할 수 있는 대상, 도달을 제한하는 수단과 그 수단이 이 저장소의 안인지 밖인지, 제한이 없으면 그 상태를 수용한 역할과 날짜 — 을 작성한다.
- **REQ-B2CLAUNCH-010**: 게이트 상태 표는 진단 플래그 3종(8조합)·상담 플래그 2종(4조합)·`RATE_LIMIT_HMAC_SECRET` 설정 여부의 조합마다 `/`, `/result`, `/consult`, `POST /api/consultations`의 도달 상태를 적고, 부팅 불가 조합과 문서가 금지한 조합을 표시하며, 표의 값은 `computeDiagnosisFlags`·`computeConsultFlags`의 출력과 같다.
- **REQ-B2CLAUNCH-011** (Where): D-LAUNCH-03이 노출 순서를 기록한 경우, 플래그 변경 절차는 각 노출 변경을 한 번의 재시작으로 그 순서의 인접한 두 벡터 사이에서만 수행하고 기록되지 않은 벡터를 거치지 않는다.
- **REQ-B2CLAUNCH-012** (While): R-02(ENGINE-001 엔진 준비 증거 참조)가 `READY`가 아닌 동안, 출시 절차는 운영 호스트에서 `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 단계를 수행해서는 안 된다.

### 3.3 배포 smoke · 롤백

- **REQ-B2CLAUNCH-013** (Where): D-LAUNCH-06이 smoke 검사 설계를 기록한 경우, 그 설계는 (가) 변경을 싣는 배포(진단 플래그 미설정, 진단 게이트 닫힘)에서 정상 배포를 통과시키고, (나) 진단 게이트가 열린 상태(production 경로와 review 경로 각각)를 기록된 방식으로 기대하는 구성에서 정상 배포를 통과시키며, (다) 응답이 2xx가 아니거나 CSS 청크가 서빙되지 않는 배포는 게이트 상태와 무관하게 실패시킨다.
- **REQ-B2CLAUNCH-014** (When): 롤백 사유(L-06이 기록한 목록)가 선언되면, 롤백 절차는 환경 변경과 재시작으로 게이트 상태 벡터를 배포 완료(dark) 벡터로 되돌리고, 되돌린 뒤 `/`·`/result`·`/consult`가 placeholder를, `POST /api/consultations`가 503 `policy_unavailable`을 돌려주는지 접수 행을 만들지 않는 읽기·요청만으로 확인해 기록하며, 저장된 상담 행과 시크릿 설정은 지우지 않는다.

### 3.4 공개 표면 · 관측

- **REQ-B2CLAUNCH-015**: 01·02·03 화면의 법적 고지 요소(개인정보처리방침, 이용약관, 고객 문의)는 표면·요소별로 현재 상태(`목적지 있음` / `# 앵커` / `비활성 표시` / `텍스트만` 중 하나)와 단계별 허용 여부(D-LAUNCH-09)를 담은 항목으로 기록한다.
- **REQ-B2CLAUNCH-016** (Where): D-LAUNCH-08이 관측 대상과 담당 역할을 기록한 경우, 노출 확대 단계 직후 그 역할이 그 대상을 관측해 기록하며, 기록에 적는 관측 수단은 이 저장소에 이미 있는 수단인지 새 수단인지를 구분해 적는다.

### 미해결 확인 사항 (Open Clarification)

결정 행(D-LAUNCH-NN)은 `plan.md` §B와 `progress.md` Open Decisions에 있다. 아래는 결정이 아니라 **기존 SPEC과의 충돌·소유 확인**이다.

- [NEEDS CLARIFICATION: N1 — 단계 정의 소유 이관과 형제 문구] CONSULTOPS-001은 I/G를 "작업 라벨"로 쓰고 그 정의와 이행 게이트를 LAUNCH에 맡겼으며(`spec.md:84,113,188`), ENGINE-001은 `DIAGNOSIS_ENGINE_READY` 전환 소유를 LAUNCH로 적고 확인을 남겼다(`spec.md:61,66,142`). 이 SPEC은 두 소유를 받는다고 §2.2에 적었으나 형제 문구(CONSULTOPS-001 §2.4의 "작업 라벨", ENGINE-001 `design.md` §9.3의 "내부 시험 공개")가 이 SPEC의 정의(§2.4 단계 표)를 가리키도록 형제를 고칠지, 형제는 두고 이 SPEC의 정의만 우선한다고 적을지 확인이 필요하다.
- [NEEDS CLARIFICATION: N2 — "내부 시험"의 세 용법] ENGINE-001 `design.md:184`는 내부 시험을 `reviewEnabled`의 비프로덕션 호출로, CONSULTOPS-001 `spec.md:112,274-278`은 알려진 참여자의 시험 데이터 제출로(운영 호스트 또는 로컬), DIAGNOSIS-001 REQ-B2CDIAG-017·025는 review 경로를 비프로덕션 전용으로 둔다(LF-10). 이 SPEC의 "내부 시험 공개"(§2.4)는 참여자와 도달 대상으로 정의하고 review 경로를 운영 호스트에서 금지하는 것으로 읽었다. 세 SPEC이 같은 말을 쓰도록 정리할지, 운영 호스트에서 review 경로가 필요한 시험이 있는지(있으면 DIAGNOSIS-001 REQ-B2CDIAG-017·025의 amendment가 먼저다) 확인이 필요하다.
- [NEEDS CLARIFICATION: N3 — E-08 G 면제와 E-17 I 면제의 확인] CONSULTOPS-001의 E-08 G `해당 없음`은 그 SPEC 작성자의 선택이고 사용자가 결정하지 않았으며(CONSULTOPS-001 plan-audit review-3 N-10), 그 SPEC은 일반 공개에서 API 개방을 받아들일지를 LAUNCH 게이트가 다룬다고 적었다(`spec.md:124`). 이 SPEC은 그 확인을 L-02 G 칸과 D-LAUNCH-05로 받았다. 이 확인을 이 SPEC이 받는 것이 CONSULTOPS-001의 의도와 같은지 확인이 필요하다.
- [NEEDS CLARIFICATION: N4 — 완료된 DIAGNOSIS-001의 smoke 교체 트리거] REQ-B2CDIAG-023과 AC-B2CDIAG-024(`status: completed`)는 smoke 교체를 `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 모두 `true`가 되는 시점에 묶으나 `ENABLE_DIAGNOSIS_DEV_STATES` 단독으로도 게이트가 열린다(LF-19). 이 SPEC은 어떤 진단 플래그 변경이든 교체 뒤에만 하도록 요구해(L-05, REQ-B2CLAUNCH-002) 더 넓게 읽고 smoke 교체의 소유도 이어받는다. DIAGNOSIS-001의 해당 문장을 in-place amendment로 정리할지, 이 SPEC의 기록만 남길지 확인이 필요하다.
- [NEEDS CLARIFICATION: N5 — 01·02 푸터의 소유] CONSULTOPS-001 D-OPS-04 (d)는 03 푸터의 비활성 링크 세 개만 다룬다(`spec.md:220`). 01·02 푸터(LF-13)를 다루는 SPEC은 찾지 못했다. D-LAUNCH-09가 01·02·03 세 표면을 한 결정으로 묶으며, 푸터 변경이 선택되면 RESULT-001·DIAGNOSIS-001(둘 다 `completed`)과 CONSULT-001(`in-progress`)의 화면 기준선(REQ-B2CCONSULT-025, REQ-B2CRESULT-025의 시각 동결)과 부딪칠 수 있어 amendment 경로와 UI 표면 design 경로(`.claude/rules/moai/workflow/spec-workflow.md` Conditional Design Route) 적용 여부 확인이 필요하다.
- [NEEDS CLARIFICATION: N6 — ENGINE-001 런타임 게이트와 조합표] ENGINE-001 `design.md` §9.2 (c)·(d)가 `computeDiagnosisFlags`의 입력에 엔진 준비 증거를 AND로 더하면 `productionReady` 정의가 바뀐다(ENGINE-001 N7). 그러면 §2.3 표와 REQ-B2CLAUNCH-010의 비교 기준, `scripts/verify-flag-runtime.ts`가 함께 바뀐다. 이 SPEC은 표를 두 함수의 출력과 비교하게 해 같은 결정에 묶이도록 썼다(AC-B2CLAUNCH-010). ENGINE-001의 N7 결정 순서와 이 SPEC의 표 갱신 시점을 확인해야 한다.
- [NEEDS CLARIFICATION: N7 — CONSULTOPS-001 REQ-B2CCONSULTOPS-013의 범위] 그 요구사항은 "상담 플래그나 시크릿을 바꾸는 재시작"만 적었으나 E-03의 관측(표지 변수를 바꾼 재시작 뒤 적용 여부, 배포 재시작 뒤 상태 유지)은 변수 종류에 의존하지 않는다. 이 SPEC은 R-04로 진단 플래그 변경 재시작에도 같은 관측을 요구한다. 그 SPEC의 문구를 진단 플래그까지 넓힐지, R-04로만 두고 형제는 그대로 둘지 확인이 필요하다.
- [NEEDS CLARIFICATION: N8 — 롤백 목표 범위] REQ-B2CLAUNCH-014는 롤백의 목표를 dark 벡터 하나로 정했고 이전 단계 벡터로의 부분 복귀(예: 상담만 닫고 진단은 유지)는 정의하지 않았다. 부분 복귀가 필요한지, 필요하면 어떤 벡터 쌍인지 확인이 필요하다.
- [NEEDS CLARIFICATION: N9 — run-phase 커밋 경로와 배포] Tier M의 기본 경로는 `main` 직접 push이고(`.claude/rules/moai/workflow/spec-workflow.md` Route A) `deploy.yml`은 `main`의 모든 push를 배포한다(LF-03). 따라서 이 SPEC의 run-phase 커밋은 문서·시험 파일이라도 운영을 재시작하고, `deploy.yml`을 바꾸는 커밋은 배포 동작 자체를 바꾼다. 교체된 smoke를 싣는 첫 배포는 진단 플래그가 미설정인 상태에서 돌아야 한다(REQ-B2CLAUNCH-013 (가)). PR 경로(`--pr`)를 쓸지, smoke 교체 커밋을 L-01 기준선 관측 뒤에만 `main`에 올릴지는 구현 착수 승인 때 사용자가 정한다.
- [NEEDS CLARIFICATION: N10 — Tier 상한] 요구사항 16건·AC 16건으로 Tier M 상한에 도달했다. 표면별 개별 단계(D-LAUNCH-03 Q1 (d)) 같은 요구가 더해지면 Tier L로 올리거나 SPEC을 나눠야 한다. 상한에 맞추려고 합치거나 뺀 후보는 `progress.md` Plan-phase Observations에 적었다.
- [NEEDS CLARIFICATION: N11 — 이행 집행의 한계] 이 SPEC의 게이트는 절차와 점검기이며 운영 호스트에서 환경 변수를 손으로 바꾸는 행위를 막지 못한다. 진단 쪽 런타임 게이트는 ENGINE-001 §9.2 (c)·(d)가 다루고 상담 쪽에는 같은 장치가 없다. 상담 접수에 런타임 게이트가 필요한지(필요하면 CONSULT-001 계약 변경) 확인이 필요하다.

### N1~N11 교차 확인 현황 (2026-10-03 사용자 인터뷰 이후)

2026-10-03 사용자 인터뷰에서 D-LAUNCH-01~09가 모두 결정됐다(`progress.md` "결정 기록 (2026-10-03, 사용자 인터뷰)" 참조). 그 결정은 모두 이 SPEC(LAUNCH)이 소유한 결정 항목만 해소한다. N1~N11은 결정이 아니라 **형제 SPEC·완료된 SPEC과의 충돌·소유 확인**이므로, LAUNCH 쪽 결정만으로는 완전히 해소되지 않는 항목이 남는다. 마커는 모두 유지하며 아래는 각 N에 미치는 영향만 기록한다.

- **N1**: 미해소. D-LAUNCH 결정과 무관 — 형제 SPEC(CONSULTOPS-001·ENGINE-001)의 문구를 이 SPEC의 정의로 이관할지의 확인이 그대로 남는다.
- **N2**: 부분 해소, 완전 해소 아님. D-LAUNCH-01 (e)(내부 시험을 로컬 실행으로 한정), D-LAUNCH-02(참여자 내부 역할만·데이터 합성 입력만), D-LAUNCH-03 Q2 (4)(내부 시험은 Q1이 정한 첫 표면만)로 이 SPEC(LAUNCH) 쪽의 "내부 시험" 정의는 "로컬 실행 + 내부 역할 + 첫 표면"으로 좁혀졌다. 그러나 N2가 지적한 세 용법 가운데 ENGINE-001 `design.md:184`의 `reviewEnabled` 비프로덕션 용법과 CONSULTOPS-001 D-OPS-12(Q1)의 사용자 결정은 이 세션이 확인하지 못했다 — 그 두 SPEC의 해당 결정이 사용자 인터뷰로 확정돼야 세 용법의 완전한 정리가 성립한다. 미해소로 유지.
- **N3**: 부분 해소. D-LAUNCH-05 (a)(대상 칸 전부 필수, 면제 없음)로 L-02 G 칸이 필수로 확정됐다 — 즉 CONSULTOPS-001 E-08의 G `해당 없음`(상담 API 개방 수용)을 LAUNCH가 그대로 받아들이지 않는다는 **값**은 정해졌다. 그러나 "이 확인을 LAUNCH가 받는 것이 CONSULTOPS-001의 의도와 같은지"라는 **소유권 확인** 자체는 CONSULTOPS-001 쪽 확인이 없어 미해소로 유지한다. 부수 효과: 이 결정으로 일반 공개 시 상담 API에도 접근 제한 수단이 필요해질 가능성이 커졌다(D-LAUNCH-01·N11로 이어짐, D-LAUNCH-05 서술 참조).
- **N4**: 미해소. D-LAUNCH-06(smoke 설계: (a) 두 상태 모두 수용, 위치 (ii))이 이 SPEC 쪽 새 smoke 검사의 설계를 정했으나, 완료된 DIAGNOSIS-001의 REQ-B2CDIAG-023·AC-B2CDIAG-024 문구를 in-place amendment로 정리할지는 별도 확인이며 이번 인터뷰의 범위가 아니었다.
- **N5**: 미해소, 범위는 구체화됨. D-LAUNCH-09가 일반 공개(G)에 (1)(목적지를 갖춘 뒤에만 해당 단계로 진입)을 택해, 목적지 없는 `href="#"` 상태인 01·02 푸터의 변경이 일반 공개 전에 필요하다는 점이 확정됐다. 그 변경이 완료된 SPEC(RESULT-001·DIAGNOSIS-001)의 화면 시각 기준선 동결과 부딪히는지, Conditional Design Route(`manager-design`) 적용 여부는 여전히 확인이 필요하다.
- **N6**: 미해소. ENGINE-001 N7의 결정 순서(런타임 게이트가 `productionReady` 정의를 바꿀지)에 달려 있으며 이번 인터뷰의 범위가 아니었다.
- **N7**: 미해소. CONSULTOPS-001 REQ-B2CCONSULTOPS-013의 문구를 진단 플래그까지 넓힐지는 그 SPEC 쪽의 확인이며, 이 SPEC은 R-04로 같은 관측을 요구하는 것으로 이미 중립적으로 처리했다(변경 불필요).
- **N8**: 미해소. D-LAUNCH-07은 롤백의 선언·실행 역할과 사유 목록만 정했고, 이전 단계 벡터로의 부분 복귀(예: 상담만 닫고 진단은 유지) 범위는 다루지 않았다.
- **N9**: 미해소(설계상 의도된 보류). run-phase 커밋 경로(PR 경로 `--pr` 여부, smoke 교체 커밋을 L-01 기준선 관측 뒤에만 `main`에 올릴지)는 구현 착수 승인 때 사용자가 정하기로 이미 적혀 있었고 이번 인터뷰의 범위가 아니었다.
- **N10**: 미해소, 해당 없음 가능. 요구사항 16건·AC 16건으로 Tier M 상한에 이미 닿아 있으나, 이번 9건의 결정은 새 요구사항이나 AC를 추가하지 않았으므로 상한 재검토가 당장 필요하지는 않다.
- **N11**: 미해소, 연결이 구체화됨. D-LAUNCH-05의 "면제 없음" 결정(N3 참조)으로 일반 공개 시 상담 접수 API에도 접근 제한 수단이 필요해질 가능성이 커졌으나, 상담 접수에 런타임 게이트가 실제로 필요한지(필요하면 CONSULT-001 계약 변경)는 여전히 별도 확인이 필요하다.

## 설계 대안

결정은 사용자·법무·운영이 한다. 아래 각 결정의 **옵션 설명은 중립**이고, **추천과 "Recommended when" 전제는 이 절 끝의 "추천(분리)"에만** 있다. 추천은 결정이 아니다. 이 SPEC은 담당 창구, 담당자, 연락 기한·SLA, 상태 이름, 동의·정책 문구, 법적 결론, 수치, URL, 보관 위치를 정하지 않는다.

### D-LAUNCH-01 내부 시험의 노출 방식 (N2)

- **사실**: 정책 준비 상태의 상담 접수 API는 화면 플래그와 무관하게 누구에게나 열린다(LF-07). review 경로(`D`)는 운영 호스트에서 쓰지 않는 것으로 문서화돼 있고(LF-09) 별도 프리뷰 환경은 없다(CONSULTOPS-001 F-22). 01·02는 서버 API가 없다(`app/` 라우트는 `page`, `consult`, `result`, `api/consultations`뿐) — 진단의 노출면은 화면 도달이다.
- **옵션**: (a) **별도 환경**(운영과 분리된 프로세스·DB, 가능하면 별도 호스트)에서 시험한다. 운영 노출이 없고 review 경로를 쓸 수 있으나, 그 환경이 저장소에 없어 만들어야 하고 별도 DB·시크릿·배포 경로가 필요하며 운영과의 동일성은 따로 확인해야 한다. (b) **운영 호스트 앞단의 접근 제한**(이 저장소 밖의 프록시·방화벽·접속 제어). 도달 자체를 막지만 설정이 저장소 밖에 있어(LF-17) 저장소 시험이 증명하지 못하고 외부 관측 기록이 필요하며, 프록시 변경이 `x-forwarded-for` 처리(CONSULTOPS-001 F-17)에 미치는 영향은 미검증이다. (c) **앱 안 허용 목록·접근 코드**(코드 변경). 라우트·페이지 변경이 CONSULT-001(`in-progress`) 계약에 닿고 자격 증명 관리 표면이 늘며, 이 SPEC은 그 코드를 만들지 않는다(별도 SPEC). (d) **제한 없이 수용하고 위험을 기록**(수용 역할·날짜). 내부 시험이 운영 호스트에서 공개와 같은 도달 범위를 갖고 I와 G의 차이는 증거 집합과 선언뿐이다. (e) **내부 시험을 로컬 실행으로 한정**(CONSULTOPS-001 D-OPS-12 (c)와 같은 방향). 운영 노출이 없고 참여자가 로컬에서 앱을 실행할 수 있어야 하며 PM2·Nginx·운영 DB 특성은 보지 못한다.
- **막는 것**: 내부 시험 공개 단계 전체, L-02, L-03. **결정 주체**: 제품 책임자 + 운영 책임자(프록시 접근 권한 보유자 포함) + 엔지니어링.

### D-LAUNCH-02 내부 시험 참여자와 데이터 규칙

- **사실**: 진단 자유 문장은 건강 정보를 포함할 수 있고(ENGINE-001 `design.md` §10.1) 현재 01·02는 서버 저장·API가 없다. 엔진이 서버 경계를 갖게 되면(D-ENGINE-04 (2)·(3)) 진단 입력도 서버를 통과한다. 상담 접수는 `consultations`에 저장된다(CONSULTOPS-001 F-10).
- **참여자 역할 옵션**: (a) 내부 역할만(제품·운영·엔지니어링 담당). (b) 내부 역할과 초대한 외부 참여자 역할. (c) (a) 또는 (b)에 보험 도메인 전문가 역할을 포함(ENGINE-001 D-ENGINE-09 서명자와 겹침을 기록).
- **진단 쪽 데이터 규칙 옵션**: (1) 합성 입력만. (2) 참여자 본인 경험 입력 허용(진단 동의 상세가 placeholder인 상태 R-03과 함께 판단해야 한다). (3) 엔진 연결 여부에 따라 달리함. 상담 쪽 규칙은 CONSULTOPS-001 D-OPS-10 (Q2)가 정하며 이 결정은 그 결과를 참조만 한다.
- **막는 것**: L-03, 내부 시험 공개 단계. **결정 주체**: 제품 책임자 + 법무(데이터 규칙) + 운영 책임자.

### D-LAUNCH-03 노출 순서 (Q1 일반 공개 순서, Q2 내부 시험의 표면 범위)

- **사실**: 상담의 일반 사용자 대상 사용은 ENGINE-001의 실제 결과를 기다린다(ENGINE-001 `spec.md:61`). `C`는 02의 상담 CTA를 활성화하고 `/consult`를 연다(LF-06). 진단 게이트를 열려면 `F`와 `E`가 둘 다 필요하고 둘만으로는 02에 이르는 사용자가 없다(LF-09).
- **Q1 옵션**: (a) **진단 먼저, 상담은 이후 별도 노출 확대.** 상담 CTA는 `C`가 열릴 때까지 준비 중 상태다(REQ-B2CCONSULT-005). 첫 노출은 S1이라 R-02·R-03·L-08(S1)이 중심이고 R-01은 두 번째 노출 확대에서 필요하다. (b) **상담 먼저, 진단은 이후.** `/consult`는 직접 주소로만 도달하고 유효한 핸드오프가 없으면 no-data 화면이며(LF-06) 접수 API는 `resultId`를 검증하지 못한다(CONSULTOPS-001 F-04). 이 순서에서는 상담의 일반 공개 시점에 엔진 준비 증거가 아직 없을 수 있고, 그러면 상담의 일반 사용이 실제 결과를 기다린다는 ENGINE-001의 서술(`spec.md:61`)이 가리키는 의존(R-01 안의 E-17, G 열 필수)이 `READY`가 아닌 채로 남는다. (c) **함께.** 한 번의 재시작으로 S1·S2·S3를 연다. 노출 폭이 가장 크고 필요한 증거가 합집합이며 롤백은 한 번의 재시작으로 dark다. (d) **표면별 개별 공개.** 각 표면이 자체 내부 시험과 일반 공개를 거친다(예: 진단 I → 진단 G → 상담 I → 상담 G). 단계 수가 늘고 N10의 Tier 상한에 닿는다.
- **Q2 옵션**: (1) 내부 시험은 모든 표면. (2) 진단만. (3) 상담만. (4) Q1이 정한 첫 표면만.
- **막는 것**: 단계별 허용 벡터 집합, REQ-B2CLAUNCH-011, 런북 절차. **결정 주체**: 제품 책임자 + 운영 책임자 + 엔지니어링.

### D-LAUNCH-04 go/no-go 서명자·형식·보관

- **사실**: 저장소는 공개다(LF-15). `main` push마다 배포되므로(LF-03) 기록을 추적 문서로 커밋하면 운영이 재시작된다 — REQ-B2CLAUNCH-005는 기록만 바꾸는 커밋을 무효화 사건으로 보지 않는다. 선례 REQ-PILOT-READY-016은 `.moai/reports/`의 추적 문서였다(LF-20). `.moai/state/`와 `.moai/reports/plan-audit/*.md`는 무시된다(`.gitignore:203,208-210`).
- **서명자(역할) 옵션**: (a) 제품 책임자. (b) 제품 책임자 + 운영 책임자. (c) (b) + 법무. (d) (c) + 보험 도메인 전문가(ENGINE-001 D-ENGINE-09 서명자와 같은 역할). 항목별 분담(예: 법무 확인 항목은 법무)도 기록한다.
- **형식 옵션**: (i) 마크다운 문서(선례와 같은 구조). (ii) 구조화 데이터 파일과 점검기 입력. (iii) 외부 문서 시스템과 저장소 안의 참조.
- **보관 옵션**: (α) 저장소 추적 문서 — 공개 가능한 내용만 둘 수 있고 REQ-B2CLAUNCH-007이 금지한 값은 어느 옵션에서도 들어갈 수 없다. (β) 비추적 로컬 폴더(무시되는 경로). (γ) 저장소 밖과 저장소 안의 참조. CONSULTOPS-001 D-OPS-11이 정한 위치를 그대로 쓸지 따로 둘지도 이 결정이 기록한다.
- **막는 것**: 서명 기록 전부, REQ-B2CLAUNCH-003·REQ-B2CLAUNCH-007·REQ-B2CLAUNCH-008. **결정 주체**: 제품 책임자 + 엔지니어링(법무: 공개 가능 범위).

### D-LAUNCH-05 일반 공개에 필수인 준비 항목 (`결정 대기` 칸)

- **대상**: L-02의 G 칸(CONSULTOPS-001 E-08의 G `해당 없음`을 이 SPEC이 받아 확인), R-02의 I 칸, R-03의 I 칸, R-05의 G 칸. 그리고 ENGINE-001 D-ENGINE-09의 단계별 서명 기록 가운데 G 단계 적용분을 G 필수로 읽는지(ENGINE-001 REQ-B2CENGINE-023 (iii)이 이미 요구하는 것을 이 SPEC이 입력으로 받는 것). L-08은 D-LAUNCH-09가 정한다.
- **옵션**: (a) 대상 칸 전부 필수(면제 없음). (b) 칸별로 필수 또는 `해당 없음`을 사유와 함께 기록(면제는 사유·역할·날짜가 있어야 한다). 상담 API 개방의 G 확인에서 "받아들이지 않음"을 택하면 일반 공개에도 접근 제한 수단이 필요해져 D-LAUNCH-01·N11과 이어진다.
- **결정 기록의 내용**: 칸별 선택(필수 / `해당 없음`), 면제의 사유, 결정한 역할, 날짜다. 법적 결론은 담지 않는다.
- **막는 것**: 일반 사용자 공개 판정. **결정 주체**: 제품 책임자 + 법무 + 운영 책임자(보험 도메인 전문가: D-ENGINE-09 항목).

### D-LAUNCH-06 smoke 검사 교체 설계

- **사실**: 현행 검사는 `GET /` 본문의 `서비스 준비 중입니다`가 없으면 실패한다(LF-04). 게이트 상태는 VM의 프로세스 환경에 있어 워크플로가 직접 알지 못하고 앱 응답으로만 볼 수 있다. push 트리거 실행은 수동 입력을 받지 못한다. 교체를 싣는 배포는 진단 플래그가 미설정인 상태에서 돈다(N9). 식별자 후보: 본문 placeholder 문구(현행), `<title>`(과거 로컬 실행 로그가 SSR 응답에서 관측, LF-12), 응답 안 RSC prop 이름(과거 로그가 관측하나 Next 내부 인코딩이라 형식이 바뀔 수 있다), `data-testid`(미검증, LF-12).
- **옵션**: (a) **두 상태 수용.** 닫힘 표지 또는 열림 표지 중 하나가 있으면 통과한다. 2xx와 두 상태 가운데 하나임을 보지만 의도치 않게 열리거나 닫힌 상태를 구별하지 못한다. (b) **상태 인지.** 기대 상태 입력과 실제 상태를 비교한다. 의도치 않은 상태 변화를 보지만 기대 입력의 출처(저장소 변수·파일 등)를 정해야 하고 push 트리거는 수동 입력이 없으며, 입력이 낡으면 정상 배포가 재시작 뒤에 빨갛게 된다. (c) **상태 비의존 검사만 + 상태는 로그로.** 2xx와 CSS 청크만 실패 조건으로 두고 상태는 실패시키지 않는 안내 단계로 남긴다(현행 `/login`·`/cases/new` 단계 `:120-129`가 같은 방식). 배포 건강만 보고 상태 불일치는 실패로 잡지 않는다. (d) **(a)~(c)에 `/consult`·접수 API 검사를 더함.** 접수 API는 DB에 닿지 않는 요청만 보내야 한다 — 스키마 위반 요청은 정책 판정 전에 400으로 끝나(LF-07) 상태를 보지 못하고, 동의 버전 불일치 요청은 정책 준비 시 409·미준비 시 503이라 상태를 보지만 운영 API에 요청을 보낸다.
- **검사 위치 하위 선택**: (i) 워크플로의 인라인 셸(한 개의 ssh 스크립트 안에 있어 로컬에서 돌리려면 해당 블록을 떼어 내야 한다). (ii) 저장소 스크립트(`db:migrate`가 같은 방식으로 이미 `tsx` 스크립트를 부르므로(`deploy.yml:43`) 쓸 수 있을 가능성이 높으나 VM에서의 동작은 이 세션이 관측하지 못했고, 로컬 서버를 대상으로 시험할 수 있다).
- **막는 것**: L-05, 모든 진단 플래그 변경(REQ-B2CLAUNCH-002). **결정 주체**: 엔지니어링 + 제품 책임자(배포 동작 변경 승인).

### D-LAUNCH-07 롤백 결정권과 사유

- **사실**: 롤백은 환경 변경과 재시작이고 실행하려면 VM 접근 권한이 필요하다. 상담 롤백 사유 최소 4종(사후 검증 불일치, 전제 변경 확인, 시크릿 노출·의심, 활성화된 문구 오류 확인)은 CONSULTOPS-001 §2.4의 작성자 기본 목록이며 사용자 확정은 D-OPS-10 (Q3) 대기 중이다. `pm2 restart`가 바뀐 환경을 다시 읽는지는 미검증이고(LF-17) 이후 `main` 배포의 평범한 재시작이 롤백 상태를 유지하는지는 E-03(R-04)이 다룬다.
- **선언 역할 옵션**: (i) 운영 책임자. (ii) 제품 책임자. (iii) 둘 중 누구나. (iv) 사유 종류별로 다름(런북이 기록).
- **실행 역할 옵션**: (1) 운영 호스트 접근 보유자. (2) 선언 역할이 직접.
- **사유 목록**: 상담 표면은 CONSULTOPS-001 §2.4의 기본 목록 4종을 그대로 쓴다(2026-10-03 사용자 인터뷰 결정, 유지). 진단 표면 전용 사유 2종을 이번 2차 정밀 교정(2026-10-03)에서 더한다 — (e) 잘못된 판정/결과 매핑이 확인된 경우, (f) 지원 범위 밖 결과의 노출이 확인된 경우. 두 사유는 선언·실행 역할을 사유 종류별로 달리할 근거가 없으므로 이미 결정된 선언 (iii) 둘 중 누구나·실행 (1) 운영 호스트 접근 보유자를 그대로 쓴다. **확인 방법**: (e)는 ENGINE-001 D-ENGINE-03의 진단 대상 유형별 준비 상태 매트릭스(`acceptance.md` AC-B2CENGINE-023)에서 해당 유형의 판정 근거(열 (a)) 또는 정확도 기준 충족(열 (f))이 사후에 틀렸다고 확인된 경우를 가리키고, (f)는 같은 매트릭스에서 최초 공개 범위(D-ENGINE-03, 현재 결정은 (d) 6유형 전부) 밖의 유형에 대한 결과가 노출됐다고 확인된 경우를 가리킨다 — 두 확인 모두 ENGINE-001의 기록을 참조만 하며 이 SPEC이 그 매트릭스의 상태를 대신 판정하지 않는다(REQ-B2CLAUNCH-004와 같은 원칙).
- **막는 것**: L-06, REQ-B2CLAUNCH-014, 모든 노출 확대. **결정 주체**: 제품 책임자 + 운영 책임자.

### D-LAUNCH-08 사후 관측의 소유와 내용

- **사실**: `package.json`에 관측 의존성이 없다(LF-16). 상담 행은 DB에만 있고 열람 화면·알림이 없다(CONSULTOPS-001 F-10). 진단은 서버 저장·API가 없다. 운영 VM 읽기 전용 관측의 선례가 있다(LF-02, `.moai/docs/runtime-runbook.md` §12.4). 관측 시점의 표기(순서 또는 시간 값)와 그 값은 이 결정이 정하며 이 SPEC은 값을 정하지 않는다.
- **내용 옵션**: (a) 노출 확대 직후의 상태 확인(효과적 플래그 상태·smoke·프로세스 상태)만. (b) (a)에 접수 행 존재와 오류 응답 확인(상담)을 더함. (c) (b)에 새 관측 수단 도입을 더함(별도 SPEC이 필요하다). (d) 관측 없음과 위험 기록.
- **담당 옵션**: (1) 운영 책임자. (2) 제품 책임자. (3) 엔지니어링. (4) 단계·표면별로 다름.
- **막는 것**: L-09, REQ-B2CLAUNCH-016. **결정 주체**: 운영 책임자 + 제품 책임자.

### D-LAUNCH-09 01·02·03 법적 고지 표면

- **사실**: 세 푸터가 서로 다르다 — 01은 `href="#"` 앵커 셋, 02는 `href="#"` 앵커 둘과 `고객 문의: 준비 중` 텍스트, 03은 비활성 표시 셋이다(LF-13). 이 SPEC은 어떤 법적 요구도 단정하지 않는다.
- **형제 결정과의 교차 참조(CONSULTOPS-001 D-OPS-04, 2026-10-03 2차 정밀 교정)**: CONSULTOPS-001의 D-OPS-04는 더 이상 03 푸터 하나만 다루지 않는다 — 이제 03-C(상태확인)·03-B(취소·삭제 문의)·03-D(문의 창구)·고객 문의·개인정보처리방침·이용약관 6개 요소별 결정이며, 그 SPEC의 progress.md 기준으로 6개 전부가 현재 미확정이다. 고객 문의·개인정보처리방침·이용약관은 01·02·03 세 표면에 걸쳐 나타나는 공유 요소이므로(LF-13), 아래 (1)을 선택했을 때 일반 공개(G)가 요구하는 "목적지 확정"은 그 세 요소에 대해서는 D-OPS-04의 확정을 기다린다. 따라서 **01·02·03의 일반 공개 준비 상태(L-08의 G 칸)는 D-OPS-04의 6개 요소가 모두 확정되기 전까지 BLOCKED다** — 이는 D-OPS-04의 현재 상태가 낳는 결과이며 이 SPEC이 새로 내리는 결정이 아니다. 이 SPEC은 D-OPS-04의 내용을 다시 정하거나 대신 판정하지 않는다(REQ-B2CLAUNCH-004와 같은 원칙).
- **질문**: 개인정보처리방침·이용약관·고객 문의 요소가 어느 단계 전에 요소별로 어떤 상태여야 하는가.
- **옵션**: (1) 목적지(앱 안 페이지 또는 앱 밖 링크)를 갖춘 뒤에만 해당 단계로 진입한다. (2) "준비 중" 비활성 표시를 허용한다(03 푸터의 현재 방식). (3) 요소를 제거한다. (4) 현행 유지(01·02의 `href="#"` 포함). 단계(I/G)별 허용 여부를 요소별로 기록하며 기록이 없으면 G에서는 허용되지 않은 것으로 읽는다.
- **막는 것**: L-08. **결정 주체**: 제품 책임자 + 법무.

### 추천(분리) — 결정이 아니다

- **D-LAUNCH-01**: (e). Recommended when 별도 환경이 없고(CONSULTOPS-001 F-22) 운영 호스트에서 정책 준비 상태의 접수 API가 누구에게나 열린다는 점(LF-07)을 내부 시험이 감수하기 어려울 때. 별도 환경(a)을 마련할 수 있으면 (a). (b)는 운영 책임자가 프록시를 바꿀 수 있고 외부에서의 차단을 저장소 밖 관측 기록으로 남길 수 있을 때.
- **D-LAUNCH-02**: 참여자 (a), 데이터 규칙 (1). Recommended when 내부 시험이 로컬 또는 접근이 제한된 환경에서 이뤄지고 진단 동의 상세 문구가 아직 placeholder일 때(LF-14).
- **D-LAUNCH-03**: Q1 (a), Q2 (4). Recommended when 엔진 준비 증거와 진단 동의 문구 확정이 상담 운영 증거(담당 창구·보존 절차)보다 먼저 갖춰질 수 있고 상담의 일반 사용이 실제 결과를 기다린다는 ENGINE-001의 서술(`spec.md:61`)을 순서로 지키고 싶을 때.
- **D-LAUNCH-04**: 서명자 (c), 형식 (i), 보관은 저장소 안에는 항목 식별자·상태·참조만 두는 (α)와 서명 세부를 담는 기록은 (γ). Recommended when 저장소가 공개로 유지되고 기록에 법무 확인 항목이 있으며 공개할 수 없는 값을 담는 기록을 저장소 밖에 둘 수 있을 때.
- **D-LAUNCH-05**: (a). Recommended when 일반 공개를 서두를 이유가 없고 항목별 면제 사유에 서명할 역할이 아직 정해지지 않았을 때.
- **D-LAUNCH-06**: 설계 (a), 위치 (ii). Recommended when 열림 상태의 표지(`<title>` 등)를 로컬에서 안정적으로 관측할 수 있고 배포 실패를 상태 불일치가 아니라 배포 건강(2xx·CSS 청크)에 묶고 싶을 때. 의도한 상태인지는 L-01·사후 확인(REQ-B2CLAUNCH-014)·조합표(REQ-B2CLAUNCH-010)로 본다.
- **D-LAUNCH-07**: 선언 (iii), 실행 (1). Recommended when 롤백이 저장된 행과 시크릿을 지우지 않는 되돌림(REQ-B2CLAUNCH-014)이라 오선언 비용이 낮다고 운영 책임자와 제품 책임자가 판단할 때.
- **D-LAUNCH-08**: 내용 (b), 담당 (1). Recommended when 접수 건수가 사람이 직접 확인할 수 있는 수준이고 새 관측 도구를 도입하지 않을 때.
- **D-LAUNCH-09**: 일반 공개(G)는 (1), 내부 시험(I)은 (2). Recommended when 법무가 "준비 중" 표시를 일반 방문자에게 허용하지 않는다고 판단할 때. 허용한다고 판단하면 G도 (2).

## 4. Out of Scope

### Out of Scope — 형제 SPEC 소유 항목

- 진단 엔진·담보 매칭·정확도 기준·`resultId` 검증 방식(SPEC-B2C-ENGINE-001), 상담 활성화 절차·문구·시크릿·행 처분·PM2 재읽기 관측의 수행(SPEC-B2C-CONSULTOPS-001), 형제 SPEC과 CONSULT-001 본문의 수정

### Out of Scope — 운영 행위의 실제 수행

- 운영 플래그 변경, 운영 호스트 재시작·환경 변경, 운영 VM 접속과 관측, 운영 DB 점검·쓰기, `deploy.yml` 변경의 `main` 병합과 그로 인한 운영 배포. 이 SPEC은 절차와 판정선을 정의하고 로컬에서 시험 수행하는 데까지다. 어느 호스트에서든 실제 수행은 이 SPEC의 AC·완료 조건에 포함되지 않는다.

### Out of Scope — 새 인프라와 도구

- 스테이징·프리뷰 환경 구축, 프록시·방화벽 구성, 앱 안 접근 통제 코드(허용 목록·인증, D-LAUNCH-01 (c)), 분석·관측 도구 도입(D-LAUNCH-08 (c))은 별도 SPEC 또는 별도 승인이 필요하다.

### Out of Scope — 법률 문구 · 값

- 개인정보처리방침·이용약관·동의 문구의 실제 문장, 법적 결론, 담당 창구·서명자의 실명과 연락처, 수치(합격 기준값·기한), URL, 보관 위치의 실제 경로. 이 SPEC은 결정 대기 항목과 기록의 구성만 적는다.

### Out of Scope — 이번 plan-phase의 파일 변경

- `.github/workflows/deploy.yml`, 푸터 컴포넌트, 응용 코드, 환경 파일의 편집. 이 SPEC의 run-phase에서 결정 기록 뒤에 다룬다.

## 5. 참고 문서

- `.moai/specs/SPEC-B2C-ENGINE-001/spec.md`(§2.2, REQ-B2CENGINE-023, N5·N7), `design.md`(§9.2, §9.3, §10.5), `progress.md`(Open Decisions D-ENGINE-01~11)
- `.moai/specs/SPEC-B2C-CONSULTOPS-001/spec.md`(§2.2, §2.4, REQ-B2CCONSULTOPS-002·013, D-OPS-04·10·11·12, N7), 그 SPEC의 plan-audit 보고서 `.moai/reports/plan-audit/SPEC-B2C-CONSULTOPS-001-review-3.md`와 `SPEC-B2C-ENGINE-001-review-3.md`(남은 부채)
- `.moai/specs/SPEC-B2C-DIAGNOSIS-001/spec.md`(REQ-B2CDIAG-017·023·024·025), `acceptance.md`(AC-B2CDIAG-024), `plan.md`
- `.github/workflows/deploy.yml`, `lib/diagnosis/flags.ts`, `app/page.tsx`, `app/result/page.tsx`, `app/consult/page.tsx`, `scripts/verify-flag-runtime.ts`
- `.moai/docs/runtime-runbook.md`(§11, §12), `.moai/reports/merge-readiness/SPEC-B2C-CONSULT-001/MERGE-CHECKLIST.md`
- 구조 선례: `.moai/specs/SPEC-PILOT-READY-001/spec.md`(REQ-PILOT-READY-016), `.moai/specs/SPEC-PILOT-OPS-001/spec.md`(REQ-PILOT-OPS-006), `.moai/reports/pilot-ready-readiness-decision-2026-09-10.md`
- 이 SPEC의 `plan.md`, `acceptance.md`, `progress.md`
