# 파일럿 장애 대응 런북 (SPEC-PILOT-READY-001 M5, REQ-PILOT-READY-009)

> 이 문서는 파일럿 **운영 중** 장애 대응 절차다. 로컬 개발 환경 설정 절차는
> `.moai/docs/runtime-runbook.md`를 참고한다(둘은 서로 다른 문서다 —
> plan.md §B M5).

## 1. 로그 확인 방법 (M2에서 추가된 로그)

SPEC-PILOT-READY-001 M2(REQ-PILOT-READY-008)에서 추가한 로그는 새 의존성
없이 `console.info`/`console.error` 기반의 최소 구조 로그다. 모두
`{ event, ... }` 형태의 JSON 문자열 한 줄로 출력되며, 사건 입력 원문(자유
텍스트 3개 필드)은 어떤 로그에도 포함되지 않는다.

| `event` 값 | 출처 | 의미 |
|---|---|---|
| `case_request_received` | `app/api/cases/route.ts` | 요청 시작(로그인 여부 확인 직후). `hasOwnerUserId`로 세션 존재 여부만 기록 |
| `pipeline_stage_failed` | `lib/pipeline/index.ts` | 파이프라인 6단계(CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier) 중 한 단계가 실패. `stage` 필드로 어느 단계인지 확인 |
| `pipeline_failed` | `lib/cases/create-case.ts` | 파이프라인 전체가 예외를 던짐(리스는 자동 해제됨) |
| `completion_transaction_failed` | `lib/cases/create-case.ts` | 완료 기록 트랜잭션(cases/reports INSERT + 리스 해제)이 실패해 롤백됨 |
| `post_failure_lease_release_failed` | `lib/cases/create-case.ts` | 위 트랜잭션 실패 후 후속 리스 해제 자체도 실패(드문 이중 실패) — 이 경우만 TTL(최소 330초) 만료까지 재제출이 지연될 수 있다 |

**확인 위치**: Vercel에 배포된 경우 Vercel 대시보드의 해당 프로젝트 → Logs
탭에서 위 `event` 값으로 검색한다. 로컬에서는 `pnpm dev` 실행 중인 터미널에
그대로 출력된다.

## 2. 테스터 재시도 안내

REQ-PILOT-READY-007의 사용자별 동시 실행 가드 덕분에, **같은 사용자가 하나의
요청이 아직 처리 중인 동안 다시 제출해도 두 번째 파이프라인이 추가로
시작되지는 않는다** — 서버는 `409` 응답으로 "이미 처리 중"임을 알린다.

다만 이 가드는 REQ-PILOT-READY-015에 문서화된 대로 동시성 제한만 보장하며,
제출 idempotency 전체를 보장하지 않는다 — **"재시도는 무제한으로 해도 항상
안전하다"는 과잉 보장은 하지 않는다.** 테스터에게는 다음 수준으로 안내한다:

- 제출 후 응답이 오지 않거나 오류가 표시되면, **짧은 시간 내 반복 재시도보다는
  잠시(수 분) 기다린 뒤 다시 시도**하도록 권장한다.
- `409` 응답("이미 처리 중")을 받으면 기존 요청이 아직 처리 중이라는 뜻이므로
  추가 제출 없이 기다리도록 안내한다.
- 크래시 등으로 리스가 고착된 경우에도 TTL(최소 330초, `LEASE_TTL_SECONDS`)이
  지나면 자동으로 재제출이 가능해진다.

## 3. 이슈 triage 담당자

**미확정 — required-blocker.** plan.md §F Implementation Kickoff Decision
Checklist에 따르면 "장애 대응 triage 담당자(누가 파일럿 중 장애를 통보받는가)"
는 이 SPEC의 run-phase 범위에서 확정할 수 없는 운영 조직 결정이다. 실제 담당자
실명 또는 역할명이 확정되면 이 섹션을 갱신한다.
