# 파일럿 최종 준비 상태 판정 — SPEC-PILOT-READY-001

> **템플릿 상태 — run-phase 착수 전 작성됨.** 이 문서는 REQ-PILOT-READY-016의 요구에 따라
> plan-phase에서 구조(6개 항목 + 게이트 규칙)만 작성한 템플릿이다. 실제 판정 값은 이
> SPEC의 나머지 M4 리포트(deployment-tier-decision, timeout-measurement,
> remote-db-verification, auth-domain-verification, concurrency-measurement,
> idempotency-scope, gemini-runtime-smoke)가 모두 존재한 뒤, run-phase 종료 시점 또는
> 파일럿 착수 직전에 채워진다. 아래 6개 항목이 전부 `unfilled`인 상태로는 이 문서를
> 근거로 파일럿을 착수할 수 없다.

## 이 문서의 목적 — SPEC 완료와는 다른 판단

**"SPEC-PILOT-READY-001의 구현이 완료되었는가"**(M1-M6 milestones, 통상적인 SPEC 완료
판정)와 **"실제 외부 테스터에게 파일럿을 열어도 되는가"**(이 문서가 답하는 질문)는
서로 다른 두 가지 판단이다. 전자는 후자의 전제조건일 뿐이며, 전자가 완료됐다고 해서
자동으로 후자가 YES가 되지 않는다 — 특히 이 SPEC의 다수 요구사항이 원격/실배포 환경에
대한 측정(로컬 대체 불가)을 요구하기 때문이다.

## 6개 항목 판정표

각 항목은 **READY** / **BLOCKED** / **UNVERIFIED** 중 하나로 판정한다.

- **READY**: 해당 항목의 근거 리포트가 존재하고, 그 리포트가 요구하는 원격/실배포
  검증이 실제로 수행되어 성공으로 기록되어 있다.
- **BLOCKED**: 해당 항목의 근거 리포트가 존재하고, 그 리포트가 실패 또는 미해결
  문제를 기록하고 있다.
- **UNVERIFIED**: 해당 항목의 근거 리포트가 존재하지 않거나, 존재하더라도 로컬
  대체 실행 결과만 담고 있어 원격/실배포 검증이 수행되지 않은 상태다.

**로컬 대체 실행 결과만으로는 어떤 항목도 READY로 판정할 수 없다** — 로컬(`next
start`, `localhost`) 실행은 참고/비교 증거로만 취급되며, 이 문서의 판정을 대신
충족시키지 않는다(spec.md § 로컬 대체 실행 증거의 위상과 동일 원칙).

| # | 항목 | 판정 | 근거 리포트 | 비고 |
|---|------|------|-------------|------|
| 1 | 호스팅 적합성(선택된 tier의 기간·ToS 적합성) | `unfilled` | `.moai/reports/pilot-ready-deployment-tier-decision-*.md` | 원격 실행이 아닌 문서적 판단으로 READY/BLOCKED 판정 가능(전체 게이트 규칙의 예외) |
| 2 | 원격 DB(실제 원격 Turso 대상에 대한 마이그레이션/시드 실행) | `unfilled` | `.moai/reports/pilot-ready-remote-db-verification-*.md` | 원격 필수 — 로컬 대체 불가 |
| 3 | 실 도메인 인증(실제 배포 도메인에 대한 로그인 동작) | `unfilled` | `.moai/reports/pilot-ready-auth-domain-verification-*.md` | 원격 필수 — 로컬 대체 불가 |
| 4 | 실 Gemini 스모크(REQ-PILOT-READY-010 재검증) | `unfilled` | `.moai/reports/gemini-runtime-smoke-*.md`(신규 날짜) | 원격 필수 |
| 5 | 서로 다른 사용자 동시 부하(REQ-PILOT-READY-006) | `unfilled` | `.moai/reports/pilot-ready-concurrency-measurement-*.md` | 원격 필수, 로컬 대체는 참고 증거로만 허용 |
| 6 | 저장소/복구 검증(REQ-PILOT-READY-007의 리스+트랜잭션 보장이 실 환경 또는 현실적 환경에서 검증됨) | `unfilled` | `.moai/reports/pilot-ready-idempotency-scope-*.md` + M6 테스트 증거 | 실 또는 in-memory SQLite 등 현실적 환경에서의 검증 필요 |

## 전체 게이트 규칙

- **1번 항목**(호스팅 적합성)을 제외하고, **2~6번 항목 중 하나라도 BLOCKED 또는
  UNVERIFIED**이면 전체 판정은 **NO-GO**여야 한다.
- 원격 필수 항목(2~6번)에 대해 "부분적으로 준비됨"이라는 절충 상태는 존재하지 않는다
  — 판정은 이진(전체 GO 또는 전체 NO-GO)이다.
- 6개 항목이 모두 READY일 때만 전체 판정은 **GO**다.

## 전체 판정

**`unfilled`** — 아직 판정할 수 없음(위 6개 항목이 모두 `unfilled`).

## 판정 이력

| 날짜 | 판정자 | 전체 판정 | 비고 |
|------|--------|-----------|------|
| 2026-09-10 | (템플릿 작성) | `unfilled` | plan-phase 템플릿 최초 작성 — REQ-PILOT-READY-016 |
