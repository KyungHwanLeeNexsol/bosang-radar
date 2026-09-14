# 파일럿 최종 준비 상태 판정 — SPEC-PILOT-READY-001

> **템플릿 상태 — run-phase 착수 전 작성됨(v0.5.0 갱신).** 이 문서는 REQ-PILOT-READY-016의
> 요구에 따라 plan-phase에서 구조(7개 항목 + 게이트 규칙)를 작성한 템플릿이다. 실제 판정
> 값은 이 SPEC의 나머지 M4 리포트(deployment-tier-decision, timeout-measurement,
> quota-checklist, remote-db-verification, auth-domain-verification,
> concurrency-measurement, idempotency-scope, gemini-runtime-smoke)가 모두 존재한 뒤,
> run-phase 종료 시점(마지막 마일스톤 안) 또는 파일럿 착수 직전에 채워진다.

## 문서 상태 공정(process) — 빈칸(blank)과 UNVERIFIED는 서로 다른 상태다

이 문서는 두 가지 서로 다른 "채워지지 않음" 상태를 구분한다:

- **빈칸/미기재(blank/unfilled) placeholder** — 오직 plan-phase의 최초 초안 작성
  시점에만 허용되는 임시 상태다. 이 상태는 "아직 이 항목의 판정 절차 자체가
  정의되지 않았다"를 의미하며, run-phase 완료 조건으로 인정되지 않는다.
- **UNVERIFIED** — 판정 절차는 정의되어 있고, 그 절차에 따라 실제로 검증을
  시도했으나(또는 아직 시도하지 않았음을 정직하게 확인했으나) 원격/실배포 검증이
  실제로 수행되지 않았거나 근거 리포트가 존재하지 않는다는 것을 **정직하게 기록한
  최종 판정값**이다. UNVERIFIED는 빈칸이 아니다 — 이는 "판정을 내렸고, 그 판정이
  '아직 검증되지 않았다'였다"는 명시적 진술이다.

**run-phase 완료 이전에는 7개 항목 전부가 실제 판정값(READY/BLOCKED/UNVERIFIED)으로
채워져야 하며, 빈칸/미기재 상태로 run-phase를 종료하는 것은 허용되지 않는다.** 채워
넣은 전체 판정이 NO-GO인 것 자체는 정상적으로 허용되는 완료 상태다 — 이 문서가
금지하는 것은 "판정을 회피하는 것"(빈칸으로 방치)이지, "판정 결과가 부정적인 것"이
아니다.

**이 문서의 현재 상태(2026-09-13 실환경 검증 반영)**: 아래 7개 항목 중 호스팅
적합성 항목 (1), Gemini 쿼터 항목 (2), 원격 DB 항목 (3), 실 도메인 인증 항목 (4),
실 Gemini 스모크 항목 (5)는 **READY**, 나머지 2개 항목은 **UNVERIFIED**다.
일부 게이트가 READY로 전환됐더라도 하나 이상의 원격 필수 항목이 UNVERIFIED이면 전체
판정은 `NO-GO`라는 규칙을 그대로 적용한다.

## 이 문서의 목적 — SPEC 완료와는 다른 판단

**"SPEC-PILOT-READY-001의 구현이 완료되었는가"**(M1-M6 milestones, 통상적인 SPEC 완료
판정)와 **"실제 외부 테스터에게 파일럿을 열어도 되는가"**(이 문서가 답하는 질문)는
서로 다른 두 가지 판단이다. 전자는 후자의 전제조건일 뿐이며, 전자가 완료됐다고 해서
자동으로 후자가 YES가 되지 않는다 — 특히 이 SPEC의 다수 요구사항이 원격/실배포 환경에
대한 측정(로컬 대체 불가)을 요구하기 때문이다.

## 7개 항목 판정표 (v0.5.0 — 6개→7개 항목 정밀화)

각 항목은 **READY** / **BLOCKED** / **UNVERIFIED** 중 하나로 판정한다.

- **READY**: 해당 항목의 근거 리포트가 존재하고, 그 리포트가 요구하는 원격/실배포
  검증이 실제로 수행되어 성공으로 기록되어 있으며, 아래 "항목별 READY 세부 기준"을
  충족한다.
- **BLOCKED**: 해당 항목의 근거 리포트가 존재하고, 그 리포트가 실패 또는 미해결
  문제를 기록하고 있다.
- **UNVERIFIED**: 해당 항목의 근거 리포트가 존재하지 않거나, 존재하더라도 로컬
  대체 실행 결과만 담고 있어 원격/실배포 검증이 수행되지 않은 상태다.

**로컬 대체 실행 결과만으로는 어떤 항목도 READY로 판정할 수 없다** — 로컬(`next
start`, `localhost`) 실행은 참고/비교 증거로만 취급되며, 이 문서의 판정을 대신
충족시키지 않는다(spec.md § 로컬 대체 실행 증거의 위상과 동일 원칙).

| # | 항목 | 판정 | 근거 리포트 | 비고 |
|---|------|------|-------------|------|
| 1 | 호스팅 적합성(Netlify Free 확정 + 3층위 실행시간 상한 증거 + 실제 배포 도메인 기준 **실측 증거**, v0.10.0 재작성) | `READY` | `.moai/reports/pilot-ready-deployment-tier-decision-20260913.md` + `.moai/reports/pilot-ready-timeout-measurement-20260913.md` | 실제 Preview의 `stream`/`background` 실행 모드를 확인하고 3회 개별 측정했다. 동기 접수 최대 3.761초는 60초-10초 안전여유 기준 이내, Background 완료 최대 47.900초는 900초-120초 안전여유 기준 이내다 |
| 2 | Gemini 쿼터(REQ-PILOT-READY-003, 호스팅과 별개의 독립 항목) | `READY` | `.moai/reports/pilot-ready-quota-checklist-20260913.md` | 프로젝트 운영자가 실제 AI Studio 무료 등급 한도(Research 5 RPM, Fast 15 RPM)를 확인했고 production/deploy-preview에 각각 4 RPM(80%), 11 RPM(73.3%) 예산을 설정해 읽기 재확인 |
| 3 | 원격 DB(실제 원격 Turso 대상에 대한 마이그레이션/시드 실행) | `READY` | `.moai/reports/pilot-ready-remote-db-verification-20260912.md` | production 컨텍스트에서 migration 0006까지 총 7건 적용, `case_jobs` 스키마 확인, seed 21건 및 `tester:add` 3계정의 `users`/`allowed_testers` 행을 읽기 재확인 |
| 4 | 실 도메인 인증(실제 배포 도메인에 대한 로그인 동작) | `READY` | `.moai/reports/pilot-ready-auth-domain-verification-20260912.md` | 실제 Preview에서 로그인 HTTP 200, 세션 쿠키 및 세션 사용자 확인, 비로그인 `/cases/new` 307과 로그인 후 200을 개별 검증 |
| 5 | 실 Gemini 스모크(REQ-PILOT-READY-010 재검증) | `READY` | `.moai/reports/gemini-runtime-smoke-20260913.md` | 실제 Deploy Preview에서 Researcher/Skeptic/Verifier 3회 호출이 모두 HTTP 200으로 관측됐고, 202→completed 상태 전이와 응답 caseId·원격 job/report 행 일치를 독립 조회로 확인 |
| 6 | 서로 다른 사용자 동시 부하(REQ-PILOT-READY-006) | `UNVERIFIED` | `.moai/reports/pilot-ready-concurrency-measurement-*.md` | 원격 필수, 로컬 대체는 참고 증거로만 허용 (§항목별 READY 세부 기준 (6) 참고) |
| 7 | 저장소/복구 검증(REQ-PILOT-READY-007의 리스+트랜잭션 보장) | `UNVERIFIED` | `.moai/reports/pilot-ready-idempotency-scope-*.md` + M6 테스트 증거 | **반드시 실제 원격 Turso 대상에 대한 검증만 READY로 인정한다 — 로컬 또는 in-memory SQLite 결과만으로는 이 항목을 READY로 판정할 수 없다** (§항목별 READY 세부 기준 (7) 참고) |

## 항목별 READY 세부 기준 (v0.5.0 신규 — acceptance.md AC-PILOT-READY-016b와 정확히 일치)

- **(1) 호스팅 적합성**(v0.10.0 재작성 — Netlify 기준, 특정 초 값을 미리 확정하지
  않는다) — Netlify Free 호스팅 확정 기록과, 이 프로젝트 계정의 실제 적용 상한을
  3층위로 구분해 기록한 증거 — (a) 공식 게시 값(60초, 변경 불가,
  `docs.netlify.com/build/functions/configuration/#default-values`), (b) 상충하는
  커뮤니티 관측(~10초, 미확인), (c) 이 프로젝트 계정의 실제 적용 상한(실 배포 결과)
  — 그리고 실제 **배포 도메인**(`*.netlify.app`) 환경에서 수행된 **최소 3회 이상**의
  개별 측정 실행 각각의 처리 시간이 기록되어 있고, 그 중 **관측된 최대 처리 시간**이
  (c)에서 확인된 실제 상한에서 콜드스타트·네트워크 오버헤드를 흡수할 안전 여유를
  뺀 값 이하임을 보여주는 실측 증거, 이 모두가 있어야 READY다. 3층위 기록이
  없거나 서로 혼동된 상태, 실측 증거가 없는 상태, 실측 횟수가 3회 미만인 상태,
  관측된 최대 처리 시간이 안전 여유 기준을 초과하는 상태, 로컬(`next start`) 실행
  결과만으로 이 항목을 READY로 표시하는 것, 또는 (c)가 UNVERIFIED인 채로 이 항목을
  READY로 표시하는 것은 모두 금지된다.
- **(2) Gemini 쿼터** — 실제 AI Studio 쿼터 대시보드를 확인했다는 기록(확인 날짜·
  확인자 포함)과, 그 관측된 실제 한도를 근거로 실제 선택한
  `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET` 값이 기록되어 있어야 READY다.
  **값이 코드 기본값 4와 같더라도, 4가 관측된 실제 한도의 약 70~80%에 해당한다는
  근거가 함께 기록되어 있으면 정상적으로 READY 조건을 충족한다** — 값 자체가 아니라
  검증 여부가 판정 기준이다. 대시보드 확인 자체가 수행되지 않은 채 기본값 4만 남아
  있는 상태(근거 기록 없음)는 UNVERIFIED다.
- **(3) 원격 DB** — 실제 원격 Turso 인스턴스에 대한 `pnpm db:migrate`/`pnpm db:seed`/
  `pnpm tester:add`(M1의 신규 `reservations` 테이블 마이그레이션 포함) 실행 성공
  기록이 있어야 READY다.
- **(4) 실 도메인 인증** — 실제 배포 도메인 기준 (a) 로그인 요청 성공, (b) 세션 수립
  확인, (c) 보호된 페이지 접근 가능, 3가지가 모두 개별적으로 확인·기록되어 있어야
  READY다.
- **(5) 실 Gemini 스모크** — REQ-PILOT-READY-010의 5가지 개별 확인 항목이 모두 기록돼
  있어야 하며, **반드시 실제 배포 도메인 기준 결과여야 한다. 로컬(`next start`) 실행
  결과는 참고 증거일 뿐 이 항목의 READY 근거가 될 수 없다.**
- **(6) 서로 다른 사용자 동시 부하** — 측정 배치 안의 모든 요청이 성공적인 최종
  상태에 도달했고, 그 결과가 실제로 DB에 영속화되어 조회 가능했으며, 처리되지 않은
  (재시도/백오프로 흡수되지 않은) 429/5xx/타임아웃이 하나도 없었다는 근거가
  기록되어 있어야 READY다.
- **(7) 저장소/복구 검증** — 그 근거가 된 검증이 **실제 원격 Turso 대상**에 대해
  수행됐다는 기록이 있어야 READY다. **로컬 또는 in-memory SQLite 결과만을 근거로
  이 항목을 READY로 표시하는 것은 금지된다.**

## 전체 게이트 규칙 (v0.5.0 — v0.4.0 표현에 맞춰 재작성)

- **항목 (1)의 tier/ToS "결정" 자체(문서 판단으로 가능한 부분)를 제외하고**, 원격
  검증 또는 실측이 필요한 항목들((1)의 타임아웃 실측 포함, 2~7번) 중 **하나라도
  BLOCKED 또는 UNVERIFIED**이면 전체 판정은 **NO-GO**여야 한다.
- 원격 필수 항목에 대해 "부분적으로 준비됨"이라는 절충 상태는 존재하지 않는다 —
  판정은 이진(전체 GO 또는 전체 NO-GO)이다.
- 7개 항목이 모두 READY일 때만 전체 판정은 **GO**다.

## 전체 판정

**`NO-GO`** — 호스팅 적합성·Gemini 쿼터·원격 DB·실 도메인 인증·실 Gemini 스모크
항목 (1)~(5)는 `READY`지만 항목 (6), (7)이 `UNVERIFIED`이므로 게이트 규칙에 따라 현재 전체 판정은
`NO-GO`다. 남은 항목이 실제
값으로 채워질 run-phase 종료 시점에 재평가한다(그 시점의 판정이 다시 NO-GO인 것
자체는 정상적으로 허용되는 run-phase 완료 상태다 — REQ-PILOT-READY-016 참고).

## 판정 이력

| 날짜 | 판정자 | 전체 판정 | 비고 |
|------|--------|-----------|------|
| 2026-09-10 | (템플릿 작성) | `unfilled`(6개 항목) | plan-phase 템플릿 최초 작성 — REQ-PILOT-READY-016 |
| 2026-09-10 | (템플릿 갱신, v0.5.0) | `NO-GO`(7개 항목, 전부 UNVERIFIED) | v0.4.0에서 6개→7개 항목으로 정밀화된 spec.md/acceptance.md와 동기화되지 않은 채 방치되어 있던 것을 발견해 갱신. plan-phase 시점의 정직한 현재 상태(빈칸이 아니라 UNVERIFIED)를 명시적으로 채워 넣음 — 실제 판정은 run-phase 종료 시점에 재평가된다 |
| 2026-09-12 | Codex(Netlify/Turso 실환경 확인) | `NO-GO`(원격 DB 부분 검증) | Netlify 환경변수로 원격 마이그레이션·시드와 읽기 재확인은 성공했으나 테스터 프로비저닝이 남아 항목 (3)은 UNVERIFIED 유지. 나머지 실배포 게이트도 아직 READY가 아니므로 전체 판정 유지 |
| 2026-09-12 | Codex(비동기 DB migration 재검증) | `NO-GO`(항목 3 READY, 6개 UNVERIFIED) | 테스터 3계정 프로비저닝, migration 0006까지 총 7건 적용, 원격 `case_jobs` 스키마와 seed/계정 행 읽기 재확인을 완료해 항목 (3)을 READY로 전환. 나머지 6개 실환경 게이트는 UNVERIFIED이므로 전체 판정 유지 |
| 2026-09-12 | Codex(실 도메인 인증·비동기 E2E) | `NO-GO`(항목 3·4 READY, 5개 UNVERIFIED) | 실제 Preview에서 로그인·세션·보호 페이지를 검증해 항목 (4)을 READY로 전환. 비동기 제출 202, 중복 409, 완료와 원격 case/report 영속화도 확인했으나 항목 (1), (2), (5), (6), (7)의 전체 기준은 아직 미충족 |
| 2026-09-13 | Codex(실 Gemini 네트워크 관측·DB 교차검증) | `NO-GO`(항목 3·4·5 READY, 4개 UNVERIFIED) | commit `a2b3ef0`의 실제 Preview에서 합성 사건을 실행해 Gemini 3회 호출 HTTP 200, 202→completed, caseId와 원격 job/report 행 일치를 확인하여 항목 (5)을 READY로 전환. 항목 (1), (2), (6), (7)은 아직 미검증 |
| 2026-09-13 | Codex(Netlify 3회 처리시간·실행 모드 대조) | `NO-GO`(항목 1·3·4·5 READY, 3개 UNVERIFIED) | 실제 Preview 3회 측정에서 동기 접수 최대 3.761초, Background 완료 최대 47.900초를 관측했다. 배포 메타데이터의 `stream`/`background` 실행 모드와 공식 60초/15분 상한을 대조하고 안전 여유 기준을 모두 충족해 항목 (1)을 READY로 전환 |
| 2026-09-13 | 프로젝트 운영자 + Codex(AI Studio 쿼터 확인·예산 적용) | `NO-GO`(항목 1~5 READY, 2개 UNVERIFIED) | AI Studio 실제 무료 등급 한도 Research 5 RPM/Fast 15 RPM을 확인하고 Netlify production/deploy-preview에 4/11 RPM 예산을 설정했다. 항목 (2)을 READY로 전환했으나 다중 사용자 부하와 원격 복구 검증은 아직 미검증 |
| 2026-09-14 | MoAI(HEAD `187afc2` 재검증, 로컬 범위) | `NO-GO`(항목 1~5 READY 유지, 항목 6·7 UNVERIFIED 유지) — **판정 불변, 단 항목 (5) 근거 staleness 주의 플래그 추가** | 최신 HEAD(하이브리드 Gemini 라우팅 커밋 `187afc2`) 기준 품질 게이트를 전부 재실행(vitest 463/463·tsc·eslint·prettier·build 모두 PASS)하고, §R(2026-09-12) 이후 방치돼 있던 로컬 E2E 회귀(`case-flow.spec.ts`, 502) 하나를 발견·근본원인 확인 후 스킵 처리했다(원격 Preview 스모크가 이 경로를 대체 검증). 하이브리드 라우팅은 로컬에서 실 Gemini API로 2개 경로(일반→Lite 0회 Premium, 복합→Premium 1회)를 실측해 설계대로 동작함을 확인했으나, 승격(lite→premium) 경로와 **원격 Preview 기준 재측정**은 이번 세션에서 수행하지 못했다(gh/netlify CLI 부재, Preview URL 미보유). **주의**: 항목 (5)의 기존 READY 근거(§W, 2026-09-13)는 하이브리드 라우팅 도입 이전 파이프라인 버전 기준이다 — 파일럿 착수 전 하이브리드 라우팅 이후 버전으로 원격 스모크를 재실행해 항목 (5) 근거를 갱신할 것을 권고한다(항목 자체를 UNVERIFIED로 강등하지는 않음 — 라우팅 로직 자체의 무결성은 로컬 실측으로 확인됐고, 변경된 것은 호출 경로 분기이지 개별 호출의 성공/실패 계약이 아니기 때문). 항목 (6), (7)은 원격 동시성·복구 검증이 필요해 이번에도 UNVERIFIED로 남았고, 전체 판정은 `NO-GO`를 유지한다. 상세: `.moai/specs/SPEC-PILOT-READY-001/progress.md` §Z |
