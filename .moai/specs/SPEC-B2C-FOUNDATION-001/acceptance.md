# SPEC-B2C-FOUNDATION-001 — Acceptance Criteria

## AC Matrix

### AC-B2CFOUND-001
**Given** `.moai/specs/SPEC-B2C-FOUNDATION-001/design.md` §1이 작성된 상태
**When** `app/`, `app/api/`, `components/`, `lib/`, `db/`, `e2e/`, `scripts/`, `proxy.ts`, `instrumentation.ts` 아래 모든 파일을 나열하면
**Then** 매트릭스에 분류(DELETE/REUSE/REUSE-MOD/PRESERVE)되지 않은 파일이 0개다.

### AC-B2CFOUND-002
**Given** design.md §1의 DELETE 분류 각 행
**When** 근거 컬럼을 확인하면
**Then** 모든 행이 실제 파일 경로·grep/Read 결과·import 관계 중 하나 이상을 구체적으로 인용한다(추측성 서술 없음).

### AC-B2CFOUND-003
**Given** plan.md §D의 milestone M2-M7
**When** 각 milestone의 게이트 조건을 확인하면
**Then** M2/M3/M4 모두 `pnpm build` 성공을 명시적 게이트로 포함한다.

### AC-B2CFOUND-004
**Given** plan.md §D
**When** M2와 M3의 순서를 확인하면
**Then** M2(최소 B2C 공개 진입점 마련)가 M3(B2B 라우트·인증 제거)보다 먼저 온다.

### AC-B2CFOUND-005
**Given** plan.md §F 데이터·배포 안전 계획
**When** DB 관련 milestone을 확인하면
**Then** "운영 DB 데이터 삭제"를 수행하는 milestone이 존재하지 않으며, 코드 삭제 milestone(M3/M4/M5) 중 어느 것도 `db/migrations/`에 새 파일을 추가하지 않는다.

### AC-B2CFOUND-006
**Given** design.md §1 `lib/db/`·`db/migrations/` 행
**When** 분류를 확인하면
**Then** 둘 다 PRESERVE(불변)로 분류되어 있고, 근거에 "11개 테이블 FK 결합"(research.md §2)이 인용된다.

### AC-B2CFOUND-007
**Given** design.md §4 `lib/pipeline/` decision gate
**When** 삭제 여부를 확인하면
**Then** "삭제하지 않는다"는 결론과 "담보 매칭 로직 결정 이후 후속 SPEC에서 재검토"라는 재검토 조건이 함께 명시되어 있다.

### AC-B2CFOUND-008
**Given** plan.md §D M5(E2E·env·배포 설정 정리)
**When** DELETE 대상 E2E 시나리오 목록을 확인하면
**Then** 각 항목에 "삭제 사유"를 기록하도록 요구하는 문장이 존재한다(REQ-B2CFOUND-009).

### AC-B2CFOUND-009
**Given** design.md §2 목표 B2C 라우트 구조
**When** `design/MIGRATION-PLAN.md` §2의 노드 인벤토리(01/01-A2/01-B/01-C/01-D/01-E, 02, 03/03-A2/03-B/03-C/03-D)와 대조하면
**Then** 3단계(질문 입력/결과/상담 신청) 전부가 목표 구조에 대응 라우트를 갖고 있고, Desktop/Mobile을 별도 라우트로 분리하지 않았다.

### AC-B2CFOUND-010
**Given** design.md §2 목표 구조의 `app/page.tsx`(01) 및 `app/result/page.tsx`(02)
**When** PII 필드 포함 여부를 확인하면
**Then** 이름·전화번호 등 PII 수집 문구/필드가 없고, PII는 `app/consult/page.tsx`(03)에만 언급된다(REQ-B2CFOUND-013).

### AC-B2CFOUND-011
**Given** plan.md §F
**When** `.github/workflows/deploy.yml` 관련 서술을 확인하면
**Then** 모든 milestone을 작업 브랜치에서 수행하고 `main` 병합은 M7 완료 후로 명시하는 문장이 존재한다(REQ-B2CFOUND-011).

### AC-B2CFOUND-012
**Given** design.md §3
**When** 02→03 연결 방식과 모바일 M01-D/M01-E 처리 항목을 확인하면
**Then** 둘 다 `[NEEDS CLARIFICATION: ...]` 마커로 표기되어 있고 임의의 확정 값이 대신 기재되어 있지 않다.

### AC-B2CFOUND-013
**Given** 이 SPEC의 작성 과정 전체(Bash 호출 이력)
**When** 실행된 모든 명령을 확인하면
**Then** 파일을 쓰거나(`git commit`/`db:migrate`/`rm` 등) 상태를 바꾸는 명령이 없고, 전부 읽기 전용(`find`/`grep`/`cat`/`head`/`ls`)이다(REQ-B2CFOUND-005).

### AC-B2CFOUND-014
**Given** `.moai/project/product.md`
**When** "02/24개 화면 실제 구현" 문자열을 검색하면
**Then** 이 SPEC 작성 완료 시점에는 검색 결과가 0건이고, 대신 "사용자용 24개 화면 실제 구현"이 존재한다.

### AC-B2CFOUND-015
**Given** plan.md §G 롤백 전략
**When** git 이력 복구 및 DB 복구 경로를 확인하면
**Then** (1) 모든 삭제가 일반 커밋으로 기록되어 `git revert`/`git checkout`으로 B2B 코드를 복구할 수 있다는 서술과, (2) `db/migrations/*`가 보존되고 기존 11개 테이블이 DROP되지 않으므로 코드만 복구하면 데이터 계층이 즉시 이전 상태로 작동한다는 서술이 모두 존재한다(REQ-B2CFOUND-010).

## Edge Cases

- design.md §1 매트릭스 중 `lib/utils.ts`처럼 내용을 직접 Read하지 않고 분류한 항목은 "신뢰도 중간"으로 명시되어야 한다 — 회귀 없이 신뢰도 표기가 누락된 행이 있으면 결함으로 간주한다.
- `e2e/comparison-docs-images.spec.ts`처럼 대상 파일(`docs/evidence/...`) 존재를 재확인하지 않은 분류는 research.md §8 Gaps에 기록되어야 한다.
- M3에서 `proxy.ts`를 완전 삭제할지 빈 가드로 남길지가 design.md에서 확정되지 않은 채 plan.md M3로 넘어가는 것은 허용되나, plan.md M7이 `PROTECTED_PATH_PATTERNS`/`isProtectedPath` 잔존 여부를 grep으로 재확인하도록 요구해야 한다.

## Quality Gate Criteria

- spec.md 12개 canonical frontmatter 필드 전부 존재, `id` 정규식 PASS(Bash 검증 완료).
- Out of Scope 섹션에 `### Out of Scope — <주제>` H3가 5개 이상, 각각 `-` bullet 최소 1개 이상.
- GEARS 표기 준수: REQ-B2CFOUND-001~013 각각 (Ubiquitous)/(Event-driven)/(State-driven)/(Where)/(Unwanted) 패턴 중 하나로 태깅.
- design.md §1 매트릭스가 spec.md §2 모듈 목록(app/, app/api/, components/, lib/auth/, lib/pipeline/, lib/ai/, lib/db/, lib/validation/, db/, e2e/, scripts/, proxy.ts, instrumentation.ts)을 전부 커버.

## Definition of Done (plan-phase)

- [x] spec.md/plan.md/acceptance.md/design.md/research.md/progress.md 6개 파일 모두 작성 완료(Tier L).
- [x] SPEC ID 중복 없음 확인(`.moai/specs/` grep, 18개 기존 SPEC과 겹치지 않음).
- [x] 실제 코드/DB/배포 변경 0건 — Bash 호출 이력 전부 읽기 전용.
- [x] `.moai/project/product.md` 오타 수정(§ 추가 문서 정리 범위) — 별도 커밋 대상, 이 SPEC 작성과 함께 수행.
- [ ] plan-auditor 독립 감사 — 이 SPEC 완료 보고 이후 오케스트레이터가 별도로 수행.
