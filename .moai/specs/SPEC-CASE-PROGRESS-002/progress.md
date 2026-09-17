# SPEC-CASE-PROGRESS-002 진행 기록

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready
- plan_complete_at: 2026-09-17
- tier: L
- artifact_set: spec.md, plan.md, acceptance.md, design.md, research.md, progress.md (6 files — Tier L 5-artifact set + progress.md)
- 반전 대상: SPEC-CASE-PROGRESS-001 REQ-CASE-PROGRESS-002/003 (개별 단계 완료 표시 금지, 퍼센트/progressbar/애니메이션 금지)
- 계승 대상: SPEC-CASE-PROGRESS-001 REQ-CASE-PROGRESS-001/004/005 (공유 상수 단일 소스, 접근성 배치, 무관 범위 보존)

## §E.2 Run-phase Evidence

M1-M6 완료(TDD, cycle_type=tdd), `feature/SPEC-CASE-PROGRESS-002` 브랜치에 6개 커밋:
- M1: `lib/db/schema.ts`에 `progress_stage` 컬럼 추가, `db/migrations/0008_high_zarda.sql` 생성 및 로컬 Turso DB에 적용 완료
- M2: `lib/pipeline/index.ts` `RunPipelineOptions.onStageProgress` 추가(선택적, 기존 호출부 무영향), `planQueries()`/`retrieveEvidence()`/`research()` 직후 각각 체크포인트 발화
- M3: `processCaseJob()`이 콜백 안에서 3중 펜싱(id+leaseId+status) UPDATE로 `progress_stage` 갱신, 실패 시 로그만 남기고 예외 미전파
- M4: `/api/cases/status`가 `progressStage` 반환, completed 시 항상 4로 클램프
- M5: `case-input-form.tsx`에 `role="progressbar"`(`aria-live` 서브트리 밖) + 단계별 완료/진행/대기 라벨 추가
- M6: 4개 파일 신규/확장 테스트, 전체 76개 SPEC 관련 테스트 PASS

AC 검증: 18/18 PASS(각 AC-ID별 verbatim 커맨드+출력은 manager-develop 완료 보고서 §E.1 참고). `npx tsc --noEmit` exit 0, `npm run lint` exit 0. 전체 스위트 회귀 없음(기존에 알려진 무관한 17건 제외).

## §E.3 Run-phase Audit-Ready Signal

- run_status: audit-ready
- run_complete_at: 2026-09-17
- test_regression_check: 기존(무관) 실패 17건(`app/cases/app-shell-chrome.test.tsx`, useRouter mock 이슈, `git stash`로 이 SPEC과 무관함 확인됨) 외 신규 실패 0건
- coverage: 터치한 4개 SPEC 테스트 파일 기준 87.32% stmts / 85.84% branch / 87.36% lines
- db_migration: `db/migrations/0008_high_zarda.sql` 로컬 Turso DB(오라클 배포와 동일 DB, 사용자 확인됨)에 적용 완료 — 추가형(ADD COLUMN, NOT NULL DEFAULT 0) 컬럼이라 기존 데이터/쿼리에 영향 없음

## §E.4 Sync-phase Audit-Ready Signal

- sync_status: audit-ready
- sync_complete_at: 2026-09-17
- sync_commit_sha: 1b1146e
- changelog_entry_position: CHANGELOG.md `[Unreleased]` 최상단(SPEC-SIDEBAR-NAV-001 항목 바로 위)
- ac_count_check: acceptance.md distinct AC-ID count = 18 (`grep -oE 'AC-([A-Z0-9]+-)*[0-9]+' acceptance.md | sort -u | wc -l`), CHANGELOG entry references AC-001~018 전부 PASS — 일치
- mx_tags: `lib/cases/create-case.ts` `processCaseJob()` 내 `progress_stage` 펜싱 UPDATE 콜백에 `@MX:NOTE` 추가(기존 완료 트랜잭션의 3중 펜싱 조건을 복제한다는 교차 참조). `lib/pipeline/index.ts`의 `RunPipelineOptions`는 기존 `@MX:ANCHOR`가 이미 계약을 커버하므로 신규 태그 불요(신규 필드는 선택적·하위 호환).
- frontmatter_status_transitions.spec_md: draft → completed (in-progress 단계 생략 — 이 SPEC은 plan-phase 커밋 이후 run-phase 6개 커밋이 곧바로 이어졌고 별도 in-progress 마킹 커밋이 없었음; 최종 상태만 정확히 반영)
- frontmatter_status_transitions.plan_md: 프런트매터 없음(본문 전용 아티팩트) — 변경 없음
- frontmatter_status_transitions.acceptance_md: 프런트매터 없음(본문 전용 아티팩트) — 변경 없음
- readme_sync: README.md "현재 구현 상태" 헤더 15→16개 SPEC 갱신 + SPEC-CASE-PROGRESS-002 신규 단락 추가(SPEC-CASE-PROGRESS-001 단락과 상호 참조 — "가짜 진행률 금지"가 해소되었음을 명시)
- canary_compliance_check: N/A — 이 SPEC은 미래 지향적 정책을 도입하지 않음(기존 원칙의 명시적 반전이며, 반전 자체가 SPEC 본문·HISTORY·plan.md §A에 문서화됨)
