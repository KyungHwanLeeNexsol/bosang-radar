# Progress — SPEC-B2C-CONSULT-001

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: amended-pending-reaudit` — 독립 검토가 발견한 10건(D1-D10, 아래 요약)의 blocking 계약 모순을 이번 세션에서 전부 수정했다. plan-auditor의 **새로운** 공식 재검증이 PASS를 반환하기 전까지 이 값을 `audit-ready`로 되돌리지 않는다(§10.6 규율).
- `plan_complete_at: 2026-09-25T00:00:00Z`

### 감사 이력 정정 (D10.1 / D10.2)

이 섹션의 이전 버전은 "plan-auditor 재검증(iteration 2, commit `d0650b1` 기준) 결과 PASS"라고 기록했으나, 이는 부정확했다 — 실제로 존재하는 감사 보고서는 `SPEC-B2C-CONSULT-001-review-1.md`(파일 자신이 `Iteration: 1/3`로 명시) 단 하나뿐이며, 이 보고서는 commit `435f590`(plan-phase 문서 6종 초안, 923줄 삽입)을 대상으로 한 감사다(`git show --stat 435f590` 인용, review-1.md 참고). 실제로 일어난 일을 커밋 단위로 정리하면:

1. **실제 감사된 커밋**: `435f590` — plan-auditor iteration 1, Verdict **PASS**(종합 점수 ≈0.90), 단 보고서 자체가 내부 D1(orphan `handoff_mismatch` 계약)·D2(첫 성공 응답 AC 누락) 2건을 blocking으로, D3/D4/D5 3건을 minor로 기록했다(review-1.md 내부 D-번호 체계이며 이 §E.1의 독립 검토 D1-D10과는 다른 번호 체계다).
2. **감사 후속 수정 커밋(공식 재감사 없음)**: `d0650b1` — review-1.md의 D1/D2/D5를 구현자가 직접 반영한 커밋. **이 커밋 자체를 plan-auditor가 재검증한 기록은 없다** — `SPEC-B2C-CONSULT-001-review-2.md` 같은 후속 보고서 파일이 생성된 적이 없다.
3. **이전에 잘못 선언된 상태**: 커밋 `860ce01`이 "plan-auditor 재검증 PASS"를 선언하며 `plan_status: audit-ready`로 전환했으나, 위 1-2번 근거로 볼 때 이는 **관측되지 않은 검증 주장**이었다(`verification-claim-integrity.md` §1.1 표면 1 위반 소지) — 실제로 존재하는 증거는 iteration 1(구 커밋 `435f590` 대상)뿐이고, `d0650b1` 이후의 공식 재검증은 수행된 바 없다.
4. **이번 세션의 조치**: 독립 검토가 D1-D10(아래, 별도 번호 체계) blocking 계약 모순을 발견해 `plan_status`를 `amended-pending-reaudit`로 즉시 전환했고(status 전환 커밋 1건), 이어서 D1-D10을 전부 수정했다(내용 수정 커밋 1건, 아래 SHA 참고). **다음 단계로 plan-auditor의 새로운 공식 재검증(예상 파일명: `SPEC-B2C-CONSULT-001-review-2.md`)이 필요하며, 그 결과가 PASS일 때만 `plan_status: audit-ready`로 전환한다** — 이 문서가 스스로 그 전환을 선언하지 않는다.

### 독립 검토 D1-D10 수정 요약 (이번 세션)

| # | 계약 모순 | 반영 |
|---|---|---|
| D1 | 성공 시 `clearDiagnosisHandoff()`(핸드오프 삭제)와 "진단 결과로 돌아가기"(핸드오프 필요) 계약이 상충 | 성공 시 `clearConsultationDraft()`만 호출, `DiagnosisResult` 핸드오프는 유지 — 삭제는 기존 "새 진단 시작" 트리거만 담당(`design.md` §2.2, REQ-025, AC-025) |
| D2 | 02→03 CTA-채널 매핑 자기모순(후유장해 CTA가 "kakao"이면서 동시에 "채널 미지정") | 상단/하단 카카오=`?channel=kakao`, 후유장해=쿼리 없는 중립 `/consult`, 하단 전화=`?channel=phone`로 전 문서 통일(REQ-003) |
| D3 | 서버가 클라이언트가 본 적 없는 동의 버전을 일방적으로 스탬프 — 사후 검증 불가 | `ConsentPolicy`(서버 소유, `version`+`isActive`) 도입, 클라이언트는 `acknowledgedConsentVersion`만 전송, 서버가 대조 검증 후 자신의 값으로 스탬프, 불일치/정책부재는 저장 거부(`design.md` §6.1, REQ-016/017/018) |
| D4 | `ENABLE_CONSULT_FLOW` 단일 플래그가 "배포됨"과 "실제 오픈해도 됨"을 혼동 | `CONSULT_POLICY_READY` 플래그 신설, 두 조건 분리 + 서버 자체 검증(클라이언트 비신뢰)으로 리뷰 환경 실PII 오염 방지(`design.md` §4, §4.1, REQ-005) |
| D5 | Rate limiting 구체 알고리즘이 run-phase로 무기한 위임됨(공개 PII 수집 API의 보안 메커니즘 미확정) | DB 기반 고정 윈도(`consultationRateLimits`, HMAC 처리된 IP, 원자적 upsert) plan-phase에서 확정, 시크릿·신뢰 IP 부재 시 fail closed(`design.md` §9.3, REQ-018/019) |
| D6 | idempotencyKey 재사용 시 페이로드 동일성 검증 없이 곧장 성공 처리 — 키 재사용 공격/버그를 성공으로 오인 가능 | 요청 지문(SHA-256) 도입 + 11단계 서버 처리 순서 확정, 동일 키·다른 지문은 409 `idempotency_conflict`로 거부(`design.md` §8.1-8.2, REQ-020/021) |
| D7 | `ConsultationDraftSchema`가 느슨한 `z.object` — 알 수 없는 키·구버전을 구분 못함 | `z.strictObject` + 명시적 `draftVersion` 리터럴로 전환, 검증 실패 시(손상/알수없는키/구버전 모두) 조용히 빈 draft 폴백(`design.md` §2.3, REQ-006) |
| D8 | "영업일 기준 1일 이내" 문구가 운영 SLA 근거 없이 구체적 약속처럼 읽힘 | "접수 내용을 확인한 뒤 선택하신 방법으로 연락드리겠습니다"로 교체, `expectedContactWindow` API 필드 제거(`design.md` §1 D6, §10) |
| D9 | 성공/중복 응답의 PII 최소화 원칙이 암묵적이고 교차 제출 유출 방지가 명시되지 않음 | `maskedContact`는 항상 요청 자신의 값에서 파생(교차 유출 원천 차단), `receivedAt` 날짜 단위 정밀도로 축소, 이 SPEC 범위에서 쓰이지 않는 `consultationId`는 응답에서 제거(`design.md` §9.4, REQ-023) |
| D10 | 감사 상태(iteration 번호·감사 대상 커밋)와 Open Decisions 목록이 실제 이력과 불일치 | 본 §E.1 재작성(위) + Open Decisions 재분류(아래) |

- REQ 25건 / AC 25건, Tier L 상한(25/25) — 이번 D1-D10 수정은 전부 기존 REQ-ID/AC-ID에 하위 시나리오를 추가하는 방식으로만 반영했다(신규 ID 발급 없음). 수정 후에도 정확히 25/25 유지.
- Out of Scope 섹션 5개 `### Out of Scope —` 하위 제목 + bullet 작성 확인(`OutOfScopeRule` lint 대응) — 이번 수정에서도 유지(Rate limiting 항목의 서술만 "알고리즘 미확정"에서 "상수 튜닝만 미확정"으로 갱신).
- `git diff --check`(공백/충돌 마커 검사) — 이번 세션의 두 커밋 각각에 대해 clean 확인(SHA는 커밋 메시지·PR 설명에서 확인).

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

D10.3-D10.6 재분류(이번 세션) — 아직 사용자 판단이 필요한 항목과, 이번 세션에서 승인·결정 완료로 전환된 항목을 분리한다. **차단(blocking) 위험이 남아있는 한 `plan_status: audit-ready`로 전환하지 않는다**(§E.1 규율, D10.6) — 아래 "여전히 열려 있음" 항목들은 실제 개인정보 수집을 막는 차단 위험이 아니라(§6.1/§4.1의 `CONSULT_POLICY_READY` 구조적 게이트가 그 역할을 대신한다), 법무·운영·제품 판단이 남아있는 항목일 뿐이다.

### 여전히 열려 있음 (사용자 판단 필요)

1. **동의 상세("자세히 보기") 실제 법무 문구 확정** — `design/internal/DEV-ONLY-상담-신청-동의-상세-구조.png`의 `{}` 플레이스홀더(보유·이용 기간, 수신정보, 이용목적, 수신방법, 동의철회방법) 6개 항목이 아직 미확정이다. 법무 검토 완료 전까지 이 SPEC은 구조(UI 상태)만 구현하고 실제 문구는 노출하지 않는다. **(D10.5) 이번 세션 이후 위험 성격 변경**: 문구가 미확정이어도 실제 개인정보 수집은 더 이상 사람의 주의만으로 막히는 것이 아니다 — `CONSULT_POLICY_READY=false`인 한 서버가 활성 동의 정책 자체를 인정하지 않으므로(`design.md` §6.1) 실제 접수는 구조적으로 불가능하다. 문구 확정은 여전히 필요하지만, 확정 전 서비스가 실수로 열리는 것을 막는 책임은 이제 코드 계약이 진다.
2. **연락처 마스킹·보관 정책의 실제 보유기간·삭제 절차** — 이 SPEC의 근거 없이는 구체 값(예: "N개월 보관 후 삭제")을 사용자 화면이나 정책 문서에 사실처럼 기재하지 않는다. 실제 보유기간·삭제 절차가 확정되면 별도 반영이 필요하다. (변경 없음)
3. **`CONSULT_POLICY_READY` 실제 활성화 시점(구 `productionReady`)** — 이 SPEC은 이제 배포 게이트(`ENABLE_CONSULT_FLOW`)와 실제 개인정보 수집 게이트(`CONSULT_POLICY_READY`)를 명확히 분리된 두 개의 서버 계약으로 확정했다(`design.md` §4, §6.1) — 이전에는 이 분리가 코드 계약이 아니라 문서상의 "이해"에 불과했다. 실제로 `CONSULT_POLICY_READY`를 `true`로 전환하는 시점(법무 확정 + 운영 준비 완료 후)은 여전히 사람의 운영 판단이며, 이 SPEC이 자동으로 결정하지 않는다.
4. **"기존 신청 상태 확인" 실제 목적지** — 이 SPEC은 "준비 중" 스텁으로 구현했다(§ 디자인 대조 D4). 실제 신청 상태 조회 기능(인증 없는 조회 페이지 등)을 만들 것인지, 만든다면 인증·보안 요구사항이 무엇인지는 별도 제품 결정이 필요하다. (변경 없음)
5. **손해사정사 "등록정보 확인" 링크의 실제 목적지** — 금융감독원 등록 손해사정사 조회 페이지로 연결할 실제 URL이 아직 없다. 이 SPEC은 "준비 중" 스텁으로 구현했다. (변경 없음)

### 이번 세션에서 해소됨

6. **중복 판정 최종안 — 승인 완료(2026-09-25)**: `design/MIGRATION-PLAN.md` §7이 명시한 "동일 진단 결과 ID **또는** 동일 연락처" 단순 OR 판정을 이 SPEC은 "`resultId`+정규화 연락처 AND(비즈니스 중복) + 별도 `idempotencyKey`(기술적 멱등성)" 조합으로 대체했다(`design.md` §8에 5개 후보 비교·권장 근거 기록). 단순 OR의 과차단 위험(가족 간 연락처 공유, 동일인의 새 사고 재상담 모두 차단)을 피하기 위한 결정이며, 이 D1-D10 수정 작업 지시 자체가 사용자 승인으로 간주된다 — `design/MIGRATION-PLAN.md`와의 편차는 최종 승인된 편차이며 더 이상 확인 대기 상태가 아니다.
7. **Rate limiting 구체 알고리즘·저장소 — 결정 완료(2026-09-25)**: DB 기반 고정 윈도(`consultationRateLimits` 테이블, HMAC 처리된 원본 IP, 원자적 upsert)로 plan-phase에서 확정했다(`design.md` §9.3) — 더 이상 run-phase에 위임된 미결정 항목이 아니다. 실제 윈도 크기·요청 한도 상수 값의 트래픽 기반 미세 조정만 운영 판단으로 남는다.
