# Progress — SPEC-B2C-CONSULT-001

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: pending-audit` — plan-phase 6개 산출물(spec.md/plan.md/acceptance.md/design.md/research.md/progress.md)이 작성 완료됐으나, 독립 plan-auditor 검토는 아직 실행되지 않았다. `plan_status: audit-ready`는 plan-auditor PASS 확인 이후에만 설정된다(이 SPEC Builder 위임의 범위 밖).
- `plan_complete_at: 2026-09-25`
- REQ 25건 / AC 25건, Tier L 상한(25/25) 정확히 충족.
- Out of Scope 섹션 5개 `### Out of Scope —` 하위 제목 + bullet 작성 확인(`OutOfScopeRule` lint 대응).
- `git diff --check`(공백/충돌 마커 검사) clean 확인 — run-phase 위임 프롬프트가 인용할 근거로 이 문서에 기록한다.

## §E.2 Run-phase Evidence

_<run-phase 대기 중>_

## §E.3 Run-phase Audit-Ready Signal

_<run-phase 대기 중>_

## §E.4 Sync-phase Audit-Ready Signal

_<sync-phase 대기 중>_

## §F Phase 4 Mode Selection

이 문서를 생성한 위임은 오케스트레이터가 `manager-spec` subagent 1개에게 plan-phase 6개 산출물 작성을 위임한 **단일 에이전트(serial) 위임**이다 — Phase 4 실행 모드 카탈로그(`orchestration-mode-selection.md` §A) 기준으로 분류하면 `serial`에 해당한다(입력 파라미터: tier=L, scope≈24개 신규 파일 + 5개 기존 파일 최소 확장, domain count=1(단일 SPEC 문서 작성), concurrency benefit=LOW — 코딩/설계 산출물 작성은 순차 의존성이 강해 병렬화 이득이 낮음). `fanout`/`sweep`/`agent-team`은 후보로 검토되지 않았다 — plan-phase 문서 작성은 정의상 한 SPEC의 단일 논리적 산출물이며 병렬 분해할 독립 하위 작업이 없기 때문이다.

- **Decision**: `serial`
- **Justification**: 6개 plan-phase 문서는 서로 강하게 의존한다(spec.md의 REQ가 acceptance.md의 AC와 1:1 대응해야 하고, design.md의 결정이 plan.md의 마일스톤 순서를 결정한다) — 병렬 작성 시 문서 간 정합성이 깨질 위험이 병렬화 이득보다 크다. Anthropic의 코딩 작업 병렬화 caveat("대부분의 코딩 작업은 리서치보다 병렬화 가능한 하위 작업이 적다")과 동일한 원리가 문서 작성에도 적용된다.

## Open Decisions for User

아래 항목은 사용자 판단이 필요한 미해소 결정 게이트다 — 중복 판정 최종안(§ 아래 참고)은 이 SPEC이 권장안을 제시했지만, 나머지는 implementer가 임의로 결정할 수 없는 법무/운영/제품 판단이다.

1. **동의 상세("자세히 보기") 실제 법무 문구 확정** — `design/internal/DEV-ONLY-상담-신청-동의-상세-구조.png`의 `{}` 플레이스홀더(보유·이용 기간, 수신정보, 이용목적, 수신방법, 동의철회방법) 6개 항목이 아직 미확정이다. 법무 검토 완료 전까지 이 SPEC은 구조(UI 상태)만 구현하고 실제 문구는 노출하지 않는다.
2. **연락처 마스킹·보관 정책의 실제 보유기간·삭제 절차** — 이 SPEC의 근거 없이는 구체 값(예: "N개월 보관 후 삭제")을 사용자 화면이나 정책 문서에 사실처럼 기재하지 않는다. 실제 보유기간·삭제 절차가 확정되면 별도 반영이 필요하다.
3. **`productionReady` 실제 활성화 조건** — 이 SPEC은 코드 배포 여부만 게이트하는 `ENABLE_CONSULT_FLOW` 플래그를 도입했다. 실제 프로덕션 오픈(사용자에게 상담 신청을 실제로 받기 시작하는 시점)은 위 1·2번 항목의 법무 확정과 별개로 운영 판단이 필요하다 — 이 플래그 하나만으로 "프로덕션 준비 완료"를 의미하지 않는다.
4. **"기존 신청 상태 확인" 실제 목적지** — 이 SPEC은 "준비 중" 스텁으로 구현했다(§ 디자인 대조 D4). 실제 신청 상태 조회 기능(인증 없는 조회 페이지 등)을 만들 것인지, 만든다면 인증·보안 요구사항이 무엇인지는 별도 제품 결정이 필요하다.
5. **손해사정사 "등록정보 확인" 링크의 실제 목적지** — 금융감독원 등록 손해사정사 조회 페이지로 연결할 실제 URL이 아직 없다. 이 SPEC은 "준비 중" 스텁으로 구현했다.
6. **중복 판정 최종안 — implementer 권장, 사용자 확인 요청**: `design/MIGRATION-PLAN.md` §7이 명시한 "동일 진단 결과 ID **또는** 동일 연락처" 단순 OR 판정을 이 SPEC은 "`resultId`+정규화 연락처 AND(비즈니스 중복) + 별도 `idempotencyKey`(기술적 멱등성)" 조합으로 대체했다(`design.md` §8에 5개 후보 비교·권장 근거 기록). 단순 OR의 과차단 위험(가족 간 연락처 공유, 동일인의 새 사고 재상담 모두 차단)을 피하기 위한 결정이나, 원 디자인 문서의 명시적 서술과 다르므로 최종 승인을 요청한다.
7. **Rate limiting 구체 알고리즘·저장소** — 이 SPEC은 "경량 카운터가 존재해야 한다"는 계약만 서버 API 설계에 남기고, IP 기반인지 `resultId` 기반인지, 별도 저장소(Redis 등)가 필요한지는 run-phase 판단으로 위임했다. 트래픽 규모·운영 인프라에 대한 제품/운영 판단이 있다면 run-phase 착수 전에 방향을 제시해 주면 반영한다.
