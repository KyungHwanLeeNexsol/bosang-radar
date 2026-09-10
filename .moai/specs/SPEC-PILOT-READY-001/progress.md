# SPEC-PILOT-READY-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: audit-ready`
- `plan_complete_at: 2026-09-10`
- Tier: M (3 artifacts — spec.md + plan.md + acceptance.md)
- REQ count: 16 (ceiling for Tier M: 16) — **at budget ceiling** (v0.3.0, +1: REQ-PILOT-READY-016)
- AC count: 16 top-level (ceiling for Tier M: 16) — at budget ceiling (v0.3.0 adds no new
  top-level AC number; AC-PILOT-READY-016 split into sub-clauses 016a/016b per the
  AC sub-ID pairing convention)

### v0.3.0 revision (external review, second round)

- Branch: `plan/SPEC-PILOT-READY-001` (not merged; baseline `plan/SPEC-PILOT-READY-001@fbcd657`,
  itself branched from `main@7ebb3b7`)
- Trigger: external reviewer second-round correction requests (7 items) — see spec.md
  HISTORY v0.3.0 entry for full detail
- Decisions RESOLVED in this revision (no longer open):
  1. REQ-PILOT-READY-007 원자성 구현 방식 — **옵션 A(리스/lease 기반 예약 테이블)로
     단독 확정**. 옵션 B(컬럼 재사용)는 기각된 대안으로 plan.md §A 결정 1에만 기록.
  2. 완료 기록(`cases`+`reports`)의 동일 트랜잭션 원자성 — 하드 요구사항으로 격상
     (REQ-PILOT-READY-007(3)).
  3. REQ-PILOT-READY-015 4개 실패 모드 재판정 — (a)/(b)/(d) 해결됨(TTL 재획득/동일
     트랜잭션/leaseId 펜싱), (c)만 여전히 의도적 gap.
- Open/unconfirmed decisions carried forward to Implementation Kickoff Approval
  (§F 체크리스트 참고, plan.md):
  1. Vercel 프로젝트/tier/실제 프로덕션 도메인 — Pro tier 권고, 최종 확정은 미확정
     (unconfirmed).
  2. 원격 Turso 대상 — unconfirmed / required-blocker.
  3. 지원 연락처 이메일 주소 — unconfirmed / required-blocker.
  4. 장애 대응 triage 담당자 — unconfirmed / required-blocker.
  5. Gemini 쿼터 점검 담당자 + 시점 — unconfirmed.
  6. 동시성 측정용 테스터 계정 3-5개 준비 방법 — unconfirmed.
- Items resolved in this revision (no longer open): item 4 (readiness-decision 리포트
  템플릿 신규 작성, REQ-PILOT-READY-016 + AC-PILOT-READY-016b), item 5 (PII 고지 문구를
  리뷰어의 정확한 문구로 전면 교체 + 구조적 사실/잔여 위험 구분 명시), item 7
  (README.md/product.md에 누락됐던 SPEC-GEMINI-RUNTIME-001 추가, 별도 커밋 없이 이
  SPEC의 revision 커밋에 포함)

### v0.2.0 revision (external review, first round — superseded by v0.3.0 above)

- Branch: `plan/SPEC-PILOT-READY-001` (baseline `main@7ebb3b7`)
- Trigger: external reviewer correction requests (6 items) — see spec.md HISTORY
  v0.2.0 entry for full detail
- Items resolved in this revision (no longer open): item 3 (AC 세분화·로컬 대체
  증거 원칙·측정-vs-판단 분리), item 5 (PII 스캔 범위 진술 재확인 — 원래부터
  정확했음을 확인), item 6 (README.md/product.md 로드맵 갱신, 별도 커밋)

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
