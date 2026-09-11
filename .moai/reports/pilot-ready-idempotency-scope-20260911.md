# 파일럿 사용자별 동시 실행 가드 — 보장 범위 (REQ-PILOT-READY-007/015, AC-PILOT-READY-016a)

> 이 리포트는 어떤 외부 인프라 접근도 필요로 하지 않는다 — `lib/cases/create-case.ts`의
> M1 최종 구현(리스 방식)을 근거로 정직하게 기록만 한다. 이 SPEC이 제공하는 것은
> "idempotency 가드"가 아니라 **사용자별 동시 실행 가드**다(REQ-PILOT-READY-015 명명
> 정정) — 동일 사용자당 동시 in-flight 파이프라인 1개 제한만 제공하며, 일반적 의미의
> idempotency(동일 요청 재시도 시 동일 결과 재사용)는 제공하지 않는다.

## 1. 채택된 구현: 리스(lease) 기반 예약 테이블

`reservations` 테이블(`ownerUserId` PK/UNIQUE) 위에 조건부 UPSERT 1개 statement로
원자적으로 리스를 획득한다(`lib/cases/create-case.ts` `acquireLease`). TTL은
`LEASE_TTL_SECONDS = 330`(route의 `maxDuration = 300` + 안전 여유 30초)로 고정값이며,
하트비트 갱신 방식은 이 파일럿 규모(약 10명, 저빈도)에서 채택하지 않았다(plan.md §A
결정 1). 완료 기록(`cases`/`reports` INSERT + 리스 DELETE)은 단일 DB 트랜잭션으로
묶여 있으며 폴백 경로가 없다 — 이는 옵션 선택이 아니라 확정된 경로다.

## 2. REQ-PILOT-READY-015 실패 모드 4개 재판정

| 항목 | 판정 | 메커니즘 |
|---|---|---|
| (a) 크래시/강제종료 복구 | **해결됨** | TTL(330초) 경과 후 새 요청이 조건부 UPSERT(`setWhere: lt(expiresAt, now)`)로 자동 재획득한다. TTL 경과 전에는 `alreadyProcessing`으로 거부된다. |
| (b) 완료 기록(cases+reports) 저장 원자성 | **해결됨** | 단일 `db.transaction()` 안에서 leaseId 재확인 → `cases` INSERT → `reports` INSERT → 리스 DELETE를 수행한다. 트랜잭션 중 어느 하나라도 실패하면 4단계 전체가 롤백되어 `cases` 행이 `completed` 상태로 절대 커밋되지 않는다. |
| (c) 응답 유실 후 재제출(진정한 요청 수준 idempotency) | **의도적으로 다루지 않는 gap** | 이 가드는 "동일 사용자당 동시 in-flight 1개 제한"만 제공하며, 페이로드 기반 재사용(동일 요청 재시도 시 이전 결과를 그대로 돌려주는 것)은 제공하지 않는다. 첫 요청의 파이프라인이 완료되어 리스가 이미 해제된 뒤 재제출하면, 새 파이프라인이 처음부터 다시 실행된다. Out of Scope로 문서화된 채 남는다(spec.md Out of Scope 절 참고). |
| (d) 지연 도착 결과와 재시도 결과의 충돌 | **해결됨** | 완료 기록 트랜잭션이 커밋 직전 `leaseId` 일치 여부를 재확인하는 펜싱 게이트를 갖는다. TTL 만료 후 재획득이 일어난 뒤 원래(만료된) 실행이 뒤늦게 완료를 시도해도, 자신의 leaseId가 더 이상 현재 리스가 아니므로 커밋되지 않고 조용히 버려진다(no-op). 현재 리스 행이나 그 소유자의 `cases`/`reports`는 변경되지 않는다. |

## 3. 명명 정정

이 SPEC 전체(spec.md/plan.md/acceptance.md/progress.md)에서 "idempotency 가드"라는
표현은 "사용자별 동시 실행 가드"로 일관되게 사용한다 — 제공 범위를 정확히 반영하기
위함이다.

## 4. 이 리포트가 확인하지 않는 것

이 리포트는 REQ-PILOT-READY-006(서로 다른 사용자 동시 부하)을 검증하지 않는다 — 그
관측은 `pilot-ready-concurrency-measurement-<date>.md`(M4, 실 배포 환경 필요)가
별도로 담당한다. 이 리포트가 기록하는 4개 실패 모드 판정은 `lib/cases/create-case.test.ts`의
단위 테스트로 뒷받침되며, 실 배포 환경에서의 재검증을 전제하지 않는다(로컬 파일
기반 SQLite 엔진 + 실제 UNIQUE 제약을 통한 검증).
