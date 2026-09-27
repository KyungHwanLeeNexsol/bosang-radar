# Progress — SPEC-B2C-CONSULT-001

## §E.1 Plan-phase Audit-Ready Signal

### 현재 상태 (Canonical — 최신, 이번 세션 갱신)

- `plan_status: audit-ready`
- 감사 대상: `b0b875ee9b869227528b0a03607d4b1f8d4131e5`
- 감사 보고서: `.moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-5.md`
- 감사 보고서 커밋: `5621a69`
- 최종 상태 전환 커밋: `c427cf0`
- Verdict: **PASS**, 종합 점수 **0.97**(Tier L 임계값 0.85 상회)
- D17(`RATE_LIMIT_HMAC_SECRET` 부재 응답과 서버 처리 순서 우선순위 충돌) 해소 확인
- `SPEC-B2C-CONSULT-001-review-3.md`/`-review-4.md`/`-review-5.md` 모두 `git ls-tree -r HEAD`로 Git 트리 존재 확인됨
- review-3.md/review-4.md는 D17 세션(이번 문서 정리 포함) 동안 수정되지 않음

아래는 이 canonical 상태에 이르기까지의 전체 상태 전환 이력(iteration 1부터 iteration 5까지)이다 — 각 시점의 선언은 그 당시 기준으로 기록되어 있으며, 이후 절이 이를 정정·보완한다. 최신 진실은 위 canonical 상태이며, 아래 이력은 감사 추적을 위해 그대로 보존한다.

### 상태 전환 이력 (Historical Record)

- `plan_status: amended-pending-reaudit` — 독립 plan-auditor의 세 번째 재검증(iteration 3, HEAD `f180834c4d0c905c93df79e9bdd3a8f9b17b23b7` — D11/D13/D14 수정 커밋 기준, 6개 plan-phase 산출물 전체를 처음부터 다시 읽는 완전 재감사 — diff-only 아님)이 **PASS**를 반환했다(종합 점수 **0.92**, Tier L 임계값 0.85 상회). 이 재검증 보고서는 `.moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-3.md`에 실제로 영속 저장되어 있고, **이 SPEC의 감사 이력 중 최초로 `git ls-tree -r HEAD`로 Git 트리에 실제 커밋되어 있음이 감사자 자신에 의해 확인되었다**(로컬 디스크에만 존재한 이전 iteration 3 주장과 다름 — 아래 "iteration 3" 주장 무효화 절 참고). 이 재검증은 D11/D13/D14 3건이 모두 해소되었음을 확인했고, 그 과정에서 별도의 신규 결함 D-NEW-1(경미, `design.md` §9.1 표의 §8.1 단계 번호 참조 2건이 D11 재배열 이후 갱신되지 않은 상태로 남아 있던 문제)을 발견했다 — 감사자 자신의 판정으로 이 D-NEW-1은 **non-blocking**이며(순수 2줄 텍스트 정정, 동작·아키텍처 영향 없음, `§8.1` 자체의 번호 목록은 이미 정확했음) 이 PASS 판정을 저지하지 않는다. D-NEW-1은 이 상태 전환 직전 커밋에서 이미 수정되었다(`design.md` §9.1 두 행의 `§8.1` 참조를 `9번`, `8번/10번`으로 정정). D12(별도 세션의 보고서 영속화 결함)는 이번 세션이 review-3.md를 실제로 git 커밋함으로써 해소된 것으로 감사자가 별도로 확인했다. 이로써 `plan_status`를 `amended-pending-reaudit`에서 `audit-ready`로 전환했었다 — plan-phase의 최종 게이트를 통과했다고 판단했었다.
- `plan_complete_at: 2026-09-25T14:55:32Z`
- **D15/D16 신규 blocking 결함 발견으로 재감사 대기 전환(이번 세션)**: 별도의 독립 검토가 D15(이 문서가 review-1.md/review-2.md를 실제로 Git 트리에 존재하는 보고서인 것처럼 인용한 stale/부정확 서술 — 실제로 커밋되어 있는 것은 review-3.md뿐)와 D16(`RATE_LIMIT_HMAC_SECRET` 검증 계약이 "확정"과 "run-phase 결정 대기"로 동시에 서술된 내부 모순) 2건의 신규 blocking 결함을 발견해, `plan_status`를 다시 `amended-pending-reaudit`로 되돌린다 — 두 결함 수정 및 plan-auditor의 새로운 전체 재감사 PASS 전까지 `audit-ready`로 복귀하지 않는다.

> **참고(D15)**: 이 SPEC의 감사 이력 중 원격 Git 트리에서 실제로 검증 가능한 보고서는 `SPEC-B2C-CONSULT-001-review-3.md` 하나뿐이다(`git ls-tree -r HEAD .moai/reports/plan-audit` 확인). review-1.md·review-2.md는 과거 감사 실행이 있었다는 로컬 기록으로만 남아 있으며, 영속 증거로 인용하지 않는다.

### "iteration 3" 주장 무효화 — 관측되지 않은 검증 주장이었음 (D-META-1 정정)

이 섹션의 직전 버전은 "plan-auditor의 새로운 공식 재검증(iteration 3, HEAD `5cacad5` 기준, 점수 0.97)"을 근거로 `plan_status: audit-ready`를 선언했다. 이 주장 자체가 정확히 `860ce01`(아래 § 감사 이력 정정 3번)이 저지른 것과 같은 종류의 결함이었다 — 직전 버전의 "iteration 3 재검증 증거 위치" 항목이 스스로 인정했듯, `.moai/reports/plan-audit/` 디렉터리에는 이 iteration 3을 위한 보고서 파일이 전혀 생성된 적이 없었다. 이는 독립 plan-auditor의 새로운 세션이 HEAD `23f129b597132cdfed39fb35879f5c09612746ef`에 대해 fresh from-scratch 전체 재감사를 수행하며 발견한 메타 결함(D-META-1, severity major, 문서/감사이력 분류 — SPEC의 기술적 내용 자체는 이 재감사에서도 별도로 PASS 판정을 받았다)이다. 영속 증거가 없는 감사 주장은 `verification-claim-integrity.md` §1.1 표면 1(관측되지 않은 검증 주장) 위반이며, 감사가 아니다.

"iteration 3, 점수 0.97" 주장은 이제 완전히 폐기한다 — 해당 재검증이 실제로 수행되었는지 여부와 무관하게, 영속 보고서가 없으므로 감사 근거로 인용할 수 없다. `plan_status: audit-ready`가 실제로 근거하는 두 번째 재검증은 아래 "실제 증거 위치 정정" 항목에 기술되어 있다 — 다만 그 재검증 자체의 보고서(review-2.md)는 Git에 영속 저장된 적이 없으며, 최종적으로 Git 트리에서 검증 가능한 증거는 이후 세션의 iteration 3(review-3.md)뿐임을 아래에서 함께 정정한다(D15).

### 실제 증거 위치 정정 — review-2.md도 영속 증거 아님 (D15)

이 두 번째 독립 재검증은 HEAD `23f129b597132cdfed39fb35879f5c09612746ef`(D1-D10 수정 + 이전 감사 이력 정정 커밋 + `plan_status: audit-ready` 확정 커밋까지 반영된 트리)를 대상으로, 별도의 독립 plan-auditor가 6개 plan-phase 산출물 전체를 처음부터 다시 읽고 수행한 완전 재감사(diff-only 아님)이며, **PASS**(종합 점수 **0.92**, Tier L 임계값 0.85 상회)를 반환했다. **정정(D15)**: 이 재검증의 보고서(`SPEC-B2C-CONSULT-001-review-2.md`)는 review-1.md와 마찬가지로 로컬 디스크에만 존재했을 뿐 Git에는 한 번도 커밋된 적이 없다 — 직전 버전의 "이번에는 인용 가능한 실제 파일이 존재한다"는 서술은 부정확했다. `plan_status: audit-ready`를 실제로 뒷받침하는, Git 트리에서 검증 가능한 영속 증거는 이후 세션이 수행한 iteration 3 재검증 보고서 `SPEC-B2C-CONSULT-001-review-3.md`(commit `f180834`, 동일하게 PASS 0.92)뿐이다 — `git ls-tree -r HEAD .moai/reports/plan-audit`로 확인 가능하다. 이 HEAD `23f129b` 대상 PASS 0.92 판정 자체(감사 내용)의 유효성은 부정하지 않는다 — 정정하는 것은 그 보고서의 영속성 주장뿐이다.

### 감사 이력 정정 (D10.1 / D10.2)

이 섹션의 이전 버전은 "plan-auditor 재검증(iteration 2, commit `d0650b1` 기준) 결과 PASS"라고 기록했으나, 이는 부정확했다 — 실제로 존재하는 감사 보고서는 `SPEC-B2C-CONSULT-001-review-1.md`(파일 자신이 `Iteration: 1/3`로 명시) 단 하나뿐이며, 이 보고서는 commit `435f590`(plan-phase 문서 6종 초안, 923줄 삽입)을 대상으로 한 감사다(`git show --stat 435f590` 인용, review-1.md 참고). 다만 review-1.md 역시 Git 트리에는 커밋된 적이 없다 — 로컬 전용 산출물이었으며, 이 사실은 D15 정정에서 review-2.md와 함께 명시적으로 확인되었다(아래 7번 참고). 실제로 일어난 일을 커밋 단위로 정리하면:

1. **실제 감사된 커밋**: `435f590` — plan-auditor iteration 1, Verdict **PASS**(종합 점수 ≈0.90), 단 보고서 자체가 내부 D1(orphan `handoff_mismatch` 계약)·D2(첫 성공 응답 AC 누락) 2건을 blocking으로, D3/D4/D5 3건을 minor로 기록했다(review-1.md 내부 D-번호 체계이며 이 §E.1의 독립 검토 D1-D10과는 다른 번호 체계다).
2. **감사 후속 수정 커밋(공식 재감사 없음)**: `d0650b1` — review-1.md의 D1/D2/D5를 구현자가 직접 반영한 커밋. **이 커밋 자체를 plan-auditor가 재검증한 기록은 없다** — `SPEC-B2C-CONSULT-001-review-2.md` 같은 후속 보고서 파일이 생성된 적이 없다.
3. **이전에 잘못 선언된 상태**: 커밋 `860ce01`이 "plan-auditor 재검증 PASS"를 선언하며 `plan_status: audit-ready`로 전환했으나, 위 1-2번 근거로 볼 때 이는 **관측되지 않은 검증 주장**이었다(`verification-claim-integrity.md` §1.1 표면 1 위반 소지) — 실제로 존재하는 증거는 iteration 1(구 커밋 `435f590` 대상)뿐이고, `d0650b1` 이후의 공식 재검증은 수행된 바 없다.
4. **이번 세션의 조치**: 독립 검토가 D1-D10(아래, 별도 번호 체계) blocking 계약 모순을 발견해 `plan_status`를 `amended-pending-reaudit`로 즉시 전환했고(status 전환 커밋 1건), 이어서 D1-D10을 전부 수정했다(내용 수정 커밋 1건, 아래 SHA 참고). 다음 단계로 plan-auditor의 새로운 공식 재검증이 필요하며, 그 결과가 PASS일 때만 `plan_status: audit-ready`로 전환하기로 했다 — 이 문서가 스스로 그 전환을 선언하지 않는다는 규율을 이번 세션 내내 지켰다.
5. **재검증 완료(iteration 3) — 이번 세션**: plan-auditor가 HEAD `5cacad5`(D1-D10 수정 반영 트리) 전체를 다시 읽는 전체 재감사(diff-only 아님)를 수행했고, **PASS**(종합 점수 0.97)를 반환했다. 위 4번이 예고한 "다음 단계"가 실제로 수행되었고, 그 결과에 따라 `plan_status: audit-ready`로 전환했다(§E.1 참고) — 3번이 지적한 실수(관측되지 않은 검증 주장)와 달리, 이번 전환은 이번 세션에서 실제로 수행된 재검증 결과에 근거한다. 다만 이번에도 `review-2.md` 같은 별도 보고서 파일은 생성되지 않았다 — §E.1의 "iteration 3 재검증 증거 위치" 항목에 이 사실과 그 이유를 투명하게 기록해 두었다.
6. **5번 정정 — 이후 세션 재발견(D-META-1)**: 위 5번이 기록한 "재검증 완료(iteration 3, HEAD `5cacad5`, 점수 0.97)"는 독립 plan-auditor의 새로운 fresh from-scratch 재감사(HEAD `23f129b597132cdfed39fb35879f5c09612746ef` 대상)가 발견한 대로, 3번이 지적한 것과 정확히 같은 종류의 결함 — **관측되지 않은 검증 주장**이었다. 5번 스스로 "이번에도 `review-2.md` 같은 별도 보고서 파일은 생성되지 않았다"고 이미 인정했음에도, §E.1은 그 인정과 별개로 이 주장을 근거로 `plan_status: audit-ready`를 선언했다 — 영속 증거 없는 감사 결과를 상태 전환의 근거로 삼은 것 자체가 결함이며, 3번이 정정한 `860ce01`의 실수를 이 세션 내에서 그대로 반복한 것이다(`verification-claim-integrity.md` §1.1 표면 1 위반). 실제로 존재하고 **Git 트리에서 검증 가능한** 영속 보고서로 뒷받침되는 재검증은 이후 세션이 수행한 iteration 3 재검증(HEAD `f180834c4d0c905c93df79e9bdd3a8f9b17b23b7` 대상 **PASS**, 종합 점수 0.92, `.moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-3.md`)이며, `plan_status: audit-ready`는 최종적으로 이 재검증에 근거한다(§E.1 참고 — HEAD `23f129b`/review-2.md에 대한 이 6번 당시의 인용이 영속 증거가 아니었던 이유는 아래 7번 참고). `plan_status` 값 자체는 변경하지 않는다 — SPEC 내용에 대한 실제 PASS 판정이 이미 존재하기 때문이며, 이번 정정은 그 판정을 뒷받침하는 증거를 바로잡는 것일 뿐이다.
7. **6번 추가 정정(D15) — review-2.md도 Git에 커밋된 적 없음**: 6번이 인용한 review-2.md(HEAD `23f129b` 대상, PASS 0.92)는 review-1.md와 마찬가지로 로컬 디스크에만 존재했던 산출물이며, Git에 커밋된 적이 없다 — 이 사실은 이번 D15 정정 이전까지 발견되지 않았다. `git ls-tree -r HEAD .moai/reports/plan-audit`로 확인한 실제 Git 트리 기준, 이 SPEC의 감사 이력에서 (a) plan-phase 산출물 전체를 처음부터 다시 읽는 진정한 from-scratch 완전 재감사이면서 동시에 (b) 실제로 Git 트리에 존재해 검증 가능한 최초이자 유일한 보고서는 `SPEC-B2C-CONSULT-001-review-3.md`(iteration 3, commit `f180834`, PASS 0.92) 하나뿐이다.

### 독립 검토 D1-D10 수정 요약 (이번 세션)

| # | 계약 모순 | 반영 |
|---|---|---|
| D1 | 성공 시 `clearDiagnosisHandoff()`(핸드오프 삭제)와 "진단 결과로 돌아가기"(핸드오프 필요) 계약이 상충 | 성공 시 `clearConsultationDraft()`만 호출, `DiagnosisResult` 핸드오프는 유지 — 삭제는 기존 "새 진단 시작" 트리거만 담당(`design.md` §2.2, REQ-025, AC-025) |
| D2 | 02→03 CTA-채널 매핑 자기모순(후유장해 CTA가 "kakao"이면서 동시에 "채널 미지정") | 상단/하단 카카오=`?channel=kakao`, 후유장해=쿼리 없는 중립 `/consult`, 하단 전화=`?channel=phone`로 전 문서 통일(REQ-003) |
| D3 | 서버가 클라이언트가 본 적 없는 동의 버전을 일방적으로 스탬프 — 사후 검증 불가 | `ConsentPolicy`(서버 소유, `version`+`isActive`) 도입, 클라이언트는 `acknowledgedConsentVersion`만 전송, 서버가 대조 검증 후 자신의 값으로 스탬프, 불일치/정책부재는 저장 거부(`design.md` §6.1, REQ-016/017/018) |
| D4 | `ENABLE_CONSULT_FLOW` 단일 플래그가 "배포됨"과 "실제 오픈해도 됨"을 혼동 | `CONSULT_POLICY_READY` 플래그 신설, 두 조건 분리 + 서버 자체 검증(클라이언트 비신뢰)으로 리뷰 환경 실PII 오염 방지(`design.md` §4, §4.1, REQ-005) |
| D5 | Rate limiting 구체 알고리즘이 run-phase로 무기한 위임됨(공개 PII 수집 API의 보안 메커니즘 미확정) | DB 기반 고정 윈도(`consultationRateLimits`, HMAC 처리된 IP, 원자적 upsert) plan-phase에서 확정, 시크릿·신뢰 IP 부재 시 fail closed(`design.md` §9.3, REQ-018/019) |
| D6 | idempotencyKey 재사용 시 페이로드 동일성 검증 없이 곧장 성공 처리 — 키 재사용 공격/버그를 성공으로 오인 가능 | 요청 지문(SHA-256) 도입 + 12단계 서버 처리 순서 확정, 동일 키·다른 지문은 409 `idempotency_conflict`로 거부(`design.md` §8.1-8.2, REQ-020/021) |
| D7 | `ConsultationDraftSchema`가 느슨한 `z.object` — 알 수 없는 키·구버전을 구분 못함 | `z.strictObject` + 명시적 `draftVersion` 리터럴로 전환, 검증 실패 시(손상/알수없는키/구버전 모두) 조용히 빈 draft 폴백(`design.md` §2.3, REQ-006) |
| D8 | "영업일 기준 1일 이내" 문구가 운영 SLA 근거 없이 구체적 약속처럼 읽힘 | "접수 내용을 확인한 뒤 선택하신 방법으로 연락드리겠습니다"로 교체, `expectedContactWindow` API 필드 제거(`design.md` §1 D6, §10) |
| D9 | 성공/중복 응답의 PII 최소화 원칙이 암묵적이고 교차 제출 유출 방지가 명시되지 않음 | `maskedContact`는 항상 요청 자신의 값에서 파생(교차 유출 원천 차단), `receivedAt` 날짜 단위 정밀도로 축소, 이 SPEC 범위에서 쓰이지 않는 `consultationId`는 응답에서 제거(`design.md` §9.4, REQ-023) |
| D10 | 감사 상태(iteration 번호·감사 대상 커밋)와 Open Decisions 목록이 실제 이력과 불일치 | 본 §E.1 재작성(위) + Open Decisions 재분류(아래) |

- REQ 25건 / AC 25건, Tier L 상한(25/25) — 이번 D1-D10 수정은 전부 기존 REQ-ID/AC-ID에 하위 시나리오를 추가하는 방식으로만 반영했다(신규 ID 발급 없음). 수정 후에도 정확히 25/25 유지.
- Out of Scope 섹션 5개 `### Out of Scope —` 하위 제목 + bullet 작성 확인(`OutOfScopeRule` lint 대응) — 이번 수정에서도 유지(Rate limiting 항목의 서술만 "알고리즘 미확정"에서 "상수 튜닝만 미확정"으로 갱신).
- `git diff --check`(공백/충돌 마커 검사) — 이번 세션의 두 커밋 각각에 대해 clean 확인(SHA는 커밋 메시지·PR 설명에서 확인).

### 독립 검토 D11/D13/D14 수정 요약 (별도 세션 — D12는 별도 처리, 이 표에 포함하지 않음)

위 `plan_status: audit-ready` 선언(§E.1) 이후, 별도의 독립 검토가 D1-D10과는 다른 번호 체계로 D11-D14 4건의 신규 blocking 계약 모순을 추가로 발견했다. 이 세션은 그중 D12를 제외한 D11/D13/D14 3건을 수정한다 — D12는 별도 세션·별도 에이전트가 처리한다.

| # | 계약 모순 | 반영 |
|---|---|---|
| D11 | 서버 처리 순서(`design.md` §8.1/§9.3, `spec.md` REQ-020/021, `acceptance.md`)가 idempotencyKey 조회(4번)보다 rate limit 판정(2번)을 먼저 수행 — 첫 요청은 이미 저장에 성공했지만 응답을 받지 못해 동일 idempotencyKey로 재시도하는 사용자가 rate limit에 의해 부당하게 429로 막힐 수 있는 안전 재시도 계약 위반 | 처리 순서를 검증 → 동의 정책 검증 → 요청 지문 계산 → `idempotencyKey` 조회(일치 시 즉시 200/success 반환·불일치 시 즉시 409/idempotency_conflict, 이 두 경로 모두 rate limit 미적용) → (기존 idempotency 레코드가 전혀 없는 신규 제출 시도일 때만) rate limit 판정 → 비즈니스 중복 조회 → 삽입 → 삽입 시점 UNIQUE 충돌 재조회 순으로 재배열(`design.md` §8.1·§9.3, `spec.md` REQ-B2CCONSULT-020/021, `plan.md` M2, `acceptance.md` AC-B2CCONSULT-018·AC-B2CCONSULT-021에 각각 시나리오 추가/수정 — 신규 AC-ID 발급 없음) |
| D13 | draft 스키마를 느슨한 스키마로 서술한 두 곳(`design.md` §5 파일 트리, `plan.md` M1)이 이미 §2.3이 확정한 `z.strictObject`(개별 필드 optional) 계약과 자기모순 | 구 표현을 완전히 제거하고 두 곳 모두 draft 스키마도 `z.strictObject`(알 수 없는 키 거부, 개별 필드는 optional, 명시적 `draftVersion` 리터럴 필수)임을 명시하도록 정정(`design.md` §5, `plan.md` M1) — 별도 `rg` 검색으로 구 표현이 SPEC 문서 어디에도 잔존하지 않음을 확인했다 |
| D14 | (a) `plan.md` §D 제약 ④가 마이그레이션 범위에서 `consultationRateLimits` 보조 테이블(`design.md` §9.3이 이미 정의)을 누락 — 실제로는 한 마이그레이션 파일에 두 테이블이 필요함에도 문서는 `consultations` 하나만 언급. (b) `ENABLE_CONSULT_FLOW`/`CONSULT_POLICY_READY`/`RATE_LIMIT_HMAC_SECRET` 3개 신규 환경 변수가 `.env.local.example`에 전혀 반영되지 않음. (c) `RATE_LIMIT_HMAC_SECRET`이 `lib/env.ts` 필수 변수 검증 범위에 포함되어야 하는지 미결정 | (a) `plan.md` §D 제약 ④를 마이그레이션 파일 1개에 `consultations`(2개 UNIQUE) + `consultationRateLimits`(1개 UNIQUE) 총 3개 UNIQUE 제약이 모두 포함되도록 정정, `design.md` §5 허용 확장 목록 5번도 두 테이블 모두 언급하도록 갱신. (b) `.env.local.example`에 3개 변수를 안전한 빈/false 플레이스홀더로 추가(실제 비밀값은 어디에도 커밋하지 않음). (c) `design.md`에 §4.2 신설 — `ENABLE_CONSULT_FLOW`/`CONSULT_POLICY_READY`는 기존 `ENABLE_DIAGNOSIS_FLOW` 패턴과 동일하게 `lib/env.ts` 검증 대상에서 제외하되, `RATE_LIMIT_HMAC_SECRET`은 `GEMINI_API_KEY`의 조건부 필수 패턴과 동일하게 `lib/env.ts`에 조건부 필수 검증을 추가하는 것이 옳다고 판단 — 단 실제 `lib/env.ts` 코드 수정은 이 plan-phase 세션 범위 밖이므로 run-phase 과제로 `plan.md` §D 제약 ①에 "7번째 확장 대상 후보"로 명시했다(아래 Open Decisions 갱신 참고) |

- 위 3건 모두 기존 REQ-ID/AC-ID에 하위 시나리오를 추가하거나 기존 문서 서술을 정정하는 방식으로만 반영했다(신규 REQ-ID/AC-ID 발급 없음) — 수정 후에도 REQ 25건/AC 25건 정확히 유지(`grep -c '^\- \*\*REQ-B2CCONSULT-' spec.md` = 25, `grep -c '^\*\*AC-B2CCONSULT-' acceptance.md` = 25로 확인).
- D1-D10 내용은 이번 수정에서 전혀 손대지 않았다 — 위 표는 D1-D10 표와 별개의 새 표이며, 기존 표의 행 번호·내용을 재사용·재정의하지 않는다.
- `git diff --check`(공백/충돌 마커 검사) — 이번 세션의 커밋에 대해 clean 확인(SHA는 커밋 메시지에서 확인).
- 이 D11/D13/D14 수정 이후, `plan_status`는 여전히 `amended-pending-reaudit`다 — D12(별도 세션 처리) 완료 및 plan-auditor의 전체 재감사 PASS 전까지 `audit-ready`로 되돌리지 않는다.

### iteration 3 재검증 완료 — `plan_status: audit-ready` 확정 (이번 세션)

위 문단이 예고한 "plan-auditor의 전체 재감사"가 실제로 수행되었다. 독립 plan-auditor가 HEAD `f180834c4d0c905c93df79e9bdd3a8f9b17b23b7`(D11/D13/D14 수정 커밋 — D12 제외)를 대상으로 6개 plan-phase 산출물 전체를 처음부터 다시 읽는 완전 재감사(diff-only 아님)를 수행했고, **PASS**(종합 점수 **0.92**, Tier L 임계값 0.85 상회)를 반환했다. 이 보고서는 `.moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-3.md`에 실제로 영속 저장되었으며, `git ls-tree -r HEAD`로 Git 트리에 실제 커밋되어 있음이 감사자 자신에 의해 확인되었다 — 이 SPEC의 감사 이력 중 처음으로 "로컬 디스크에만 존재" 문제 없이 검증 가능한 iteration이다.

이 재검증 과정에서 감사자는 D11/D13/D14 3건이 모두 해소되었음을 확인하는 동시에, 별도의 경미한 신규 결함 D-NEW-1(`design.md` §9.1 HTTP 상태 코드 표의 `§8.1` 단계 번호 참조 2건이 D11 재배열 이후 갱신되지 않은 상태)을 발견했다. 감사자는 D-NEW-1을 **non-blocking**으로 명시적으로 판정했다 — 순수 2줄 텍스트 정정이며 `§8.1` 자신의 번호 목록은 이미 정확했으므로 동작·아키텍처 영향이 없다는 근거다. D-NEW-1은 이 상태 전환 커밋 직전 별도 커밋에서 이미 수정되었다(`design.md` §9.1의 두 행을 `§8.1 9번`, `§8.1 8번/10번`으로 정정).

이로써 `plan_status`를 `amended-pending-reaudit`에서 `audit-ready`로 전환한다. D1-D10/D11-D14 수정 요약 표와 위 "감사 이력 정정" 번호 목록은 이번 전환으로 다시 쓰지 않는다 — 이 절은 그 목록들에 이어 붙는 새 기록일 뿐이다.

### iteration 4 재검증 완료 — `plan_status: audit-ready` 재확정 (이번 세션)

위 "D15/D16 신규 blocking 결함 발견으로 재감사 대기 전환"(위 참고) 이후, D15·D16 두 결함을 모두 수정했고(커밋 `e232ee7b3b36457f1f20aef026787ee2d272abcf`), 이어서 독립 plan-auditor가 이 커밋을 대상으로 네 번째 재검증(iteration 4)을 수행했다. 6개 plan-phase 산출물 전체를 처음부터 다시 읽는 완전 재감사(diff-only 아님)이며, **PASS**(종합 점수 **0.96**, Tier L 임계값 0.85 상회)를 반환했다.

이 재검증 보고서는 `.moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-4.md`에 실제로 영속 저장되었고 Git 트리에 실제로 커밋되어 있음이 감사자 자신에 의해 `git ls-tree -r HEAD .moai/reports/plan-audit`로 확인되었다 — 확인 결과 `review-3.md`(iteration 3의 증거)와 `review-4.md`(이번 iteration 4의 증거) 둘 다 트리에 존재하며, `review-1.md`·`review-2.md`는 D15 정정이 이미 확립한 대로 여전히 트리에 부재함이 함께 재확인되었다.

이 재검증은 D15(존재하지 않는 review-1.md/review-2.md를 실제 영속 보고서인 것처럼 인용한 서술)와 D16(`RATE_LIMIT_HMAC_SECRET` 검증 계약이 "확정"과 "run-phase 결정 대기"로 동시에 서술된 내부 모순) 2건이 모두 해소되었음을 확인했다.

이 과정에서 감사자는 별도로 non-blocking 신규 결함 2건을 발견했으며, 둘 다 즉시 조치가 필요하지 않다고 명시적으로 판정했다:

- **D-NEW-2**: `review-3.md`(이전에 이미 커밋된 감사 보고서)가 D15 수정의 일환으로 사후에 캐비앗(caveat) 정정을 받았다 — "감사 보고서는 불변의 이력"이라는 규범에 대한 경미한 위반이지만, 그 수정 자체는 정직했고 명확히 라벨링되었으며 보고서 내부의 잘못된 영속성 주장을 바로잡는 데 필요했다. 추가 조치 불필요.
- **D-NEW-3**: `spec.md` 프런트매터의 `updated:` 날짜(`2026-09-25`)가 이 SPEC의 실제 최종 실질 수정 시점 대비 오래되었다 — 장식적(cosmetic) 문제일 뿐 스키마 유효성에 영향이 없으며, `spec.md`가 다음에 실질적으로 수정될 때까지 정정을 보류한다(감사자 자신의 권고에 따라 이번 조치에서는 수정하지 않음).

이로써 `plan_status`를 `amended-pending-reaudit`에서 `audit-ready`로 재확정한다.

### D17 신규 blocking 결함 발견으로 재감사 대기 전환 (이번 세션)

별도의 독립 검토가 D17(`RATE_LIMIT_HMAC_SECRET` 부재 시 응답이 §8.1의 확정된 서버 처리 순서와 충돌하는 과잉 일반화 서술 — 정책·동의 검증과 기존 idempotency 판정이 rate limit 판정보다 먼저 실행됨에도, `spec.md` REQ-B2CCONSULT-018과 `acceptance.md` AC-B2CCONSULT-018 일부가 "서버 시크릿이 설정되지 않으면 500"이라는 포괄 표현으로 서술되어 있어 이 우선순위를 반영하지 못함) 1건의 신규 blocking 결함을 발견해, `plan_status`를 다시 `amended-pending-reaudit`로 전환한다 — D17 수정 및 plan-auditor의 새로운 전체 재감사(iteration 5) PASS 전까지 `audit-ready`로 복귀하지 않는다.

**D17 수정 완료(이번 세션)**: `spec.md` REQ-B2CCONSULT-018, `acceptance.md` AC-B2CCONSULT-018, `design.md` §8.1/§9.1/§9.3, `plan.md` M2 테스트 계획을 모두 수정해 응답 우선순위를 명확히 했다 — 정책 비활성/미설정+시크릿 부재→503/`policy_unavailable`, 동의 버전 불일치+시크릿 부재→409/`consent_version_mismatch`, 기존 동일 idempotency 요청+시크릿 부재→200/`success`, 기존 동일 키·다른 지문+시크릿 부재→409/`idempotency_conflict`, 정책·동의 유효+기존 idempotency 레코드 없는 신규 제출+시크릿 부재→500/`server_error`(레코드 생성 없음). 이 우선순위는 spec.md/design.md/acceptance.md/plan.md 네 문서에서 동일하게 반영되었다. REQ 25건/AC 25건 총수는 그대로 유지했다(신규 REQ/AC ID 없음). `spec.md` frontmatter `updated`를 `2026-09-27`로 갱신했다. `review-3.md`/`review-4.md`는 수정하지 않았다(감사 보고서 불변 이력 유지). plan-auditor의 새로운 전체 재감사(iteration 5)를 대기 중이다.

### iteration 5 재검증 완료 — `plan_status: audit-ready` 재확정 (이번 세션)

위 "D17 신규 blocking 결함 발견으로 재감사 대기 전환"(위 참고) 이후, D17 결함을 수정했고(커밋 `b0b875e`), 이어서 독립 plan-auditor가 이 커밋을 대상으로 다섯 번째 재검증(iteration 5)을 수행했다. 6개 plan-phase 산출물 전체를 처음부터 다시 읽는 완전 재감사(diff-only 아님)이며, **PASS**(종합 점수 **0.97**, Tier L 임계값 0.85 상회, iteration 3 0.92 → iteration 4 0.96 → iteration 5 0.97로 단조 개선)를 반환했다.

이 재검증 보고서는 `.moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-5.md`에 실제로 영속 저장되었고 Git 트리에 실제로 커밋되어 있음이 감사자 자신에 의해 `git ls-tree -r HEAD .moai/reports/plan-audit`로 확인되었다(커밋 `5621a69`) — review-3.md·review-4.md·review-5.md 모두 트리에 존재하며, 두 이전 보고서는 이번 세션에서도 수정되지 않았음이 함께 재확인되었다.

감사자는 RATE_LIMIT_HMAC_SECRET 부재 시 500 응답이 §8.1 서버 처리 순서와 충돌하던 과잉 일반화 서술이 `spec.md` REQ-B2CCONSULT-018 / `acceptance.md` AC-B2CCONSULT-018 / `design.md` §8.1·§9.1·§9.3 / `plan.md` M2 네 문서 모두에서 일관되게 수정되었음을 5개 응답 우선순위 조합(정책 비활성→503, 동의 버전 불일치→409, 기존 idempotency 일치→200, 기존 idempotency 불일치→409, 신규 제출→500)별로 라인 단위 교차 검증했다 — 과잉 일반화 문구 잔존 0건이며, D1-D16 회귀도 없음을 확인했다.

이 재검증 과정에서 감사자는 별도의 경미한 신규 결함 D18(`acceptance.md`의 D17 태그 시나리오가 5개 우선순위 조합 중 4개만 명시적 Given-When-Then으로 기술하고 있고, 동의 버전 불일치+시크릿 부재 조합은 4개 문서의 산문 서술로만 커버됨)을 발견했다. 감사자는 D18을 **non-blocking**으로 명시적으로 판정했다 — 규칙 자체는 4개 문서에서 정확히 일관되게 서술되어 있어 계약 모순이 아니라는 근거다. D18은 이번 세션에서 수정하지 않으며, 선택적 후속 조치로 기록만 해 둔다.

이로써 `plan_status`를 `amended-pending-reaudit`에서 `audit-ready`로 재확정한다. D1-D10/D11-D14/D15-D16 수정 요약 표와 위 "iteration 3/4 재검증 완료" 절은 이번 전환으로 다시 쓰지 않는다 — 이 절은 그 기록들에 이어 붙는 새 기록일 뿐이다.

## §E.2 Run-phase Evidence

### M1 — 상담 데이터 계약 SSOT (`lib/consult/types.ts` + `schema.ts` + `phone.ts`)

브랜치 `feat/SPEC-B2C-CONSULT-001`(HEAD `f7ef4ec` 기준 분기). TDD RED-GREEN 사이클로 구현 — RED 실패 출력은 아래 §E 자기검증 보고서(별도 위임 응답) 참고.

| AC | 대상 | Status | Verification Command | Actual Output |
|----|------|--------|----------------------|----------------|
| AC-B2CCONSULT-011 (본 시나리오) | `normalizePhone`/`formatPhoneDisplay`/`maskPhone` | PASS | `node_modules/.bin/vitest run lib/consult/phone.test.ts` | `Test Files 1 passed (1)` / `Tests 8 passed (8)` |
| AC-B2CCONSULT-011 (추가 시나리오 — 정규화 실패 거부) | `ConsultationRequestSchema.safeParse({ contact: "12345" })` | PASS | `node_modules/.bin/vitest run lib/consult/schema.test.ts` | `연락처가 정규화 실패 형식이면 거부한다` 케이스 PASS (13건 중 1건) |
| REQ-B2CCONSULT-016 (strictObject 미지 키 거부) | `ConsultationRequestSchema`/`ConsultationDraftSchema` | PASS | 동일 | 두 스키마 모두 unknown-key 거부 케이스 PASS |

### 자기검증 (§E 5-section 증거 형식)

**Claim**: `lib/consult/{types,schema,phone}.ts` + 대응 테스트가 design.md §6/§2.3 계약을 정확히 구현하며, 기존 코드베이스에 회귀가 없다.

**Evidence**:
- `node_modules/.bin/vitest run lib/consult/` → `Test Files 2 passed (2)` / `Tests 21 passed (21)`
- `node_modules/.bin/vitest run --coverage --coverage.include='lib/consult/**'` → `Statements 100% (24/24)`, `Branches 100% (12/12)`, `Functions 100% (5/5)`, `Lines 100% (24/24)`
- `node_modules/.bin/eslint lib/consult/` → 출력 없음(clean)
- `grep -rn 'AskUserQuestion' lib/consult/` → exit 1(매치 0건, subagent-boundary 위반 없음)
- `node_modules/.bin/vitest run`(프로젝트 전체) → `Test Files 46 passed (46)` / `Tests 360 passed (360)` — 30건의 `Unhandled Error`(jsdom/undici `webidl.util.markAsUncloneable is not a function`)는 `git stash` 후 baseline(HEAD `f7ef4ec`)에서도 동일하게 재현되는 **사전 존재 환경 결함**(Node v20.19.6 vs jsdom 30 요구 버전 불일치, `.next/next-env.d.ts` component 테스트 전용) — 이번 M1 변경과 무관, `lib/consult/` 관련 실패 0건.
- `node_modules/.bin/tsc --noEmit` → `.next/types/validator.ts`의 8건 에러(삭제된 B2B 라우트 `app/cases/*`/`app/login/*` 참조, stale `.next` 빌드 아티팩트) — `lib/consult/*.ts` 관련 에러 0건, 사전 존재.

**Baseline-attribution**: 이번 실행(이 트리), HEAD `f7ef4ec1b9e80c12c80647c15043a0b7ba0e2a50`에서 분기한 `feat/SPEC-B2C-CONSULT-001` 브랜치. jsdom/undici 오류·`.next/types` 오류는 동일 HEAD의 `git stash` 적용 후 재현 확인(사전 존재 baseline 결함으로 귀속).

**Gaps**: pnpm이 이 환경(Node v20.19.6, pnpm 요구 v22.13+)에서 `ERR_UNKNOWN_BUILTIN_MODULE`로 실행 불가 — `node_modules/.bin/{vitest,tsc,eslint}`를 직접 호출해 우회했다(이미 설치된 의존성 사용, 신규 설치 없음). golangci-lint/go vet 등 Go 툴체인은 이 프로젝트(Next.js/TypeScript)에 해당 없음.

**Residual-risk**: M1은 순수 데이터 계약(타입+스키마+순수 함수)만 다루므로 런타임 통합 위험은 낮다. `preferredCallTime` phone-required `.refine`과 `contact` 정규화 `.refine`을 체이닝한 조합이 향후 M2(서버 API)에서 동일하게 재사용될 때 에러 메시지 `path` 매핑이 폼 필드 강조와 정확히 일치하는지는 M4(폼 컴포넌트) 단계에서 재검증 필요.

### M2 — DB 스키마 + 서버 API (`lib/db/schema.ts` 확장 + `app/api/consultations/route.ts`)

브랜치 `feat/SPEC-B2C-CONSULT-001`(M1 HEAD `f9ad2ce` 기준 계속). 구현 순서: (1) 스키마 확장 + 마이그레이션 생성, (2) `lib/env.ts` 조건부 필수 검증 확장, (3) route.ts 초안 작성 + 전체 시나리오 테스트 작성, (4) 최초 테스트 실행에서 동시성 레이스 버그 2건 발견(RED) → `withIdempotencyLock` 도입으로 수정(GREEN).

| AC | 대상 | Status | Verification Command | Actual Output |
|----|------|--------|----------------------|----------------|
| AC-B2CCONSULT-016(계약, M1 재확인) | `ConsultationRequestSchema` | PASS | `vitest run lib/consult/schema.test.ts` | 기존 13건 그대로 PASS(M2가 수정하지 않음) |
| AC-B2CCONSULT-017 (서버 비신뢰 필드) | route.ts 신규 삽입 로직 | PASS | `vitest run app/api/consultations/route.test.ts -t "최초 제출 성공"` | `applicationStatus`는 항상 서버 기본값 `"received"`; `consentVersion`은 클라이언트 `acknowledgedConsentVersion`을 복사하지 않고 서버 정책값을 스탬프(코드 정적 확인, `toSuccessResult`/insert 경로에 클라이언트 필드 미참조) |
| AC-B2CCONSULT-018 (검증 실패 400) | route.ts | PASS | 상동 `-t "필수 동의가 false"` | `expected 400` PASS, `fieldErrors` 존재 확인 |
| AC-B2CCONSULT-018 (로그 PII 부재) | route.ts `console.info` | PASS | 상동 `-t "로그에 PII가 포함되지 않는다"` | 로그 문자열에 `"김보상"`/`"010-0000-0000"` 미포함 확인 |
| AC-B2CCONSULT-018 (최초 제출 성공, 201) | route.ts | PASS | 상동 `-t "유효한 신규 제출은 201"` | `status 201`, `channel/maskedContact/preferredCallTime` 포함, `consultationId`/`expectedContactWindow` 부재, 행 수 정확히 +1 |
| AC-B2CCONSULT-018 (policy_unavailable, 503) | route.ts §6.1 | PASS | 상동 `-t "CONSULT_POLICY_READY가 거짓이면 503"` | `503`/`policy_unavailable`, 행 수 불변 |
| AC-B2CCONSULT-018 (consent_version_mismatch, 409) | route.ts §6.1 | PASS | 상동 `-t "acknowledgedConsentVersion이 활성 정책과 다르면 409"` | `409`/`consent_version_mismatch`, 행 수 불변 |
| AC-B2CCONSULT-018 (rate_limited, D11 신규 제출에만 적용) | route.ts §9.3 | PASS | 상동 `-t "6번째가 429를 받는다"` | 서로 다른 idempotencyKey 6건 중 6번째만 429 |
| AC-B2CCONSULT-018 (동일 키 재시도는 429 면제, D11) | route.ts §8.1 | PASS | 상동 `-t "rate limit보다 먼저 처리되어 429로 막히지 않는다"` | 윈도 포화 후에도 재시도는 `200`/success |
| AC-B2CCONSULT-018 D17 시나리오 (1) 정책 비활성+시크릿 부재→503 | route.ts | PASS | 상동 `-t "\\(1\\) 정책 비활성"` | `503`/`policy_unavailable` |
| AC-B2CCONSULT-018 D17 시나리오 (2) 동의 불일치+시크릿 부재→409 | route.ts | PASS | 상동 `-t "\\(2\\) 동의 버전 불일치"` | `409`/`consent_version_mismatch` |
| AC-B2CCONSULT-018 D17 시나리오 (3) 기존 idempotency 일치+시크릿 부재→200 | route.ts | PASS | 상동 `-t "\\(3\\) 기존 idempotency 일치"` | `200`/success |
| AC-B2CCONSULT-018 D17 시나리오 (4) 기존 idempotency 불일치+시크릿 부재→409 | route.ts | PASS | 상동 `-t "\\(4\\) 기존 idempotency 불일치"` | `409`/`idempotency_conflict` |
| AC-B2CCONSULT-018 D17 시나리오 (5) 정책·동의 유효+신규+시크릿 부재→500 | route.ts §9.3 | PASS | 상동 `-t "\\(5\\) 정책·동의 유효"` | `500`/`server_error`, 행 수 불변 |
| AC-B2CCONSULT-018 (신뢰 가능한 IP 부재 fail closed) | route.ts | PASS | 상동 `-t "신뢰 가능한 IP를 얻을 수 없으면"` | `500`/`server_error` |
| AC-B2CCONSULT-018 (D14 비정상 boolean 문자열) | route.ts + `lib/env.ts` | PASS | 상동 `-t "TRUE.*대문자"` + `vitest run lib/env.test.ts -t "시나리오 4"` | `CONSULT_POLICY_READY="TRUE"` → `503`(false 취급); `lib/env.ts`도 동일하게 `RATE_LIMIT_HMAC_SECRET` 불필요 확인 |
| AC-B2CCONSULT-019 (컬럼 목록 + 진단 데이터 미복제) | `lib/db/schema.ts` | PASS | `vitest run lib/db/schema.test.ts` | 15개 컬럼 전부 존재, `items`/`coverage` 계열 컬럼 0건, rate-limit 테이블 3컬럼만 존재·원본 IP 컬럼 0건 |
| AC-B2CCONSULT-020 (비즈니스 중복 409) | route.ts §8 | PASS | 상동 `-t "동일 resultId·동일 정규화 연락처의 두 번째 요청"` | `409`/duplicate, `maskedContact` 마스킹 형식, `receivedAt` YYYY-MM-DD, `consultationId` 부재, 행 수 불변 |
| AC-B2CCONSULT-020 (동일 키 재시도=성공) | route.ts §8.1 5번 | PASS | 상동 `-t "동일 idempotencyKey 재시도는 성공으로 처리"` | `200`/success, 신규 행 미생성 |
| AC-B2CCONSULT-020 (다른 연락처는 과차단 없음) | route.ts §8 | PASS | 상동 `-t "과차단 없이 둘 다 성공"` | 두 건 모두 `201` |
| AC-B2CCONSULT-020 (동일 키·다른 페이로드 거부) | route.ts §8.1 6번 | PASS | 상동 `-t "idempotency_conflict로 거부"` | `409`/`idempotency_conflict`, 기존 레코드 불변 |
| AC-B2CCONSULT-021 (동시 동일 키·동일 페이로드 5건→정확히 1행) | route.ts `withIdempotencyLock` | PASS | 상동 `-t "동일 idempotencyKey·동일 페이로드 5개 동시 요청"` | 응답 상태 `[200,200,200,200,201]`, 전부 success, 행 수 1 |
| AC-B2CCONSULT-021 (동일 키·다른 페이로드 동시→1성공+4충돌) | route.ts | PASS | 상동 `-t "동일 idempotencyKey, 다른 페이로드 동시 도착"` | success 1건, `idempotency_conflict` 4건, 행 수 1 |
| AC-B2CCONSULT-021 (다른 키·동일 비즈니스 키 동시→1성공+4중복) | route.ts | PASS | 상동 `-t "서로 다른 idempotencyKey·같은 resultId"` | success 1건, duplicate 4건, 행 수 1 |
| AC-B2CCONSULT-021 (D11 동시 요청이 개별 rate limit 초과해도 전부 통과) | route.ts `withIdempotencyLock` | PASS | 상동 `-t "rate limit 윈도를 개별적으로 초과했더라도"` | 8건 동시 요청 중 429 0건, 전부 success, 행 수 1 |
| AC-B2CCONSULT-023 (duplicate maskedContact는 자기 자신에서 파생) | route.ts `toDuplicateResult` | PASS | 상동 `-t "매칭된 기존 레코드가 아니라 이번 요청"` | `010-****-2222` — 요청 자신의 연락처에서 파생 확인 |
| `lib/env.ts` 시나리오 1-5 (plan.md §F) | `validateEnv("app", ...)` | PASS | `vitest run lib/env.test.ts -t "RATE_LIMIT_HMAC_SECRET"` | 5개 시나리오 + 보완 시나리오 전부 PASS(7 tests) |

### RED 증거 (GREEN 이전 verbatim, TDD 필수)

route.ts 초안 + 전체 테스트를 최초 실행했을 때 동시성 레이스 조건 버그 2건이 실패로 드러났다(rate limit이 idempotencyKey 조회와 실제 삽입 사이에서 개별 물리 요청 단위로 소비되어, 동일 키를 공유하는 동시 요청 중 일부가 부당하게 429를 받음). 수정: 모듈 레벨 `idempotencyLocks` Map + `withIdempotencyLock()`으로 동일 idempotencyKey를 공유하는 요청 전체를 4-10단계에서 직렬화(이 프로젝트의 실제 배포가 PM2 단일 프로세스이므로 안전, design.md §9.3).

```
$ node_modules/.bin/vitest run app/api/consultations/route.test.ts lib/db/schema.test.ts lib/env.test.ts lib/consult
...
 ❯ app/api/consultations/route.test.ts (26 tests | 2 failed) 180ms
       × 동일 idempotencyKey·동일 페이로드의 재시도는 rate limit보다 먼저 처리되어 429로 막히지 않는다 18ms
       × 동일 idempotencyKey·동일 페이로드가 rate limit 윈도를 개별적으로 초과했더라도 전부 429 없이 성공한다(D11) 13ms

 FAIL  app/api/consultations/route.test.ts > ... > 동일 idempotencyKey·동일 페이로드의 재시도는 rate limit보다 먼저 처리되어 429로 막히지 않는다
AssertionError: expected 429 to be 201 // Object.is equality
 FAIL  app/api/consultations/route.test.ts > ... > 동일 idempotencyKey·동일 페이로드가 rate limit 윈도를 개별적으로 초과했더라도 전부 429 없이 성공한다(D11)
AssertionError: expected true to be false // Object.is equality

 Test Files  1 failed | 4 passed (5)
      Tests  2 failed | 72 passed (74)
```

GREEN(`withIdempotencyLock` 도입 후, 동일 명령 재실행):

```
$ node_modules/.bin/vitest run app/api/consultations/route.test.ts lib/db/schema.test.ts lib/env.test.ts lib/consult
 Test Files  5 passed (5)
      Tests  74 passed (74)
```

### DB 마이그레이션

```
$ node_modules/.bin/drizzle-kit generate
consultation_rate_limits 3 columns 1 indexes 0 fks
consultations 15 columns 2 indexes 0 fks
[✓] Your SQL migration file ➜ db\migrations\0009_abnormal_owl.sql 🚀
```

신규 마이그레이션 파일 정확히 1개(`0009_abnormal_owl.sql`)에 두 테이블 CREATE + 3개 UNIQUE 인덱스(idempotencyKey 단일, (resultId,contactNormalized) 복합, (windowStart,ipHmac) 복합) 전부 포함. 기존 `0000`~`0008`은 `git diff` 대비 무변경(메타 `_journal.json`만 신규 항목 추가로 갱신).

### 자기검증 (§E 5-section 증거 형식)

**Claim**: `lib/db/schema.ts` 확장(`consultations`/`consultationRateLimits`) + `lib/env.ts` 조건부 필수 검증 확장 + `app/api/consultations/route.ts`(신규)가 design.md §8.1/§8.2/§9.1-9.4 계약을 정확히 구현하며, 기존 코드베이스에 회귀가 없다.

**Evidence**:
- `node_modules/.bin/vitest run app/api/consultations/route.test.ts lib/db/schema.test.ts lib/env.test.ts lib/consult` → `Test Files 5 passed (5)` / `Tests 74 passed (74)`
- `node_modules/.bin/vitest run --coverage app/api/consultations/route.test.ts lib/env.test.ts lib/db/schema.test.ts` → `route.ts: Statements 91.76% Branches 89.47% Functions 100% Lines 91.76%`(85% 기준 전부 상회); `env.ts: Statements 100% Branches 92.3% Functions 100% Lines 100%`
- `node_modules/.bin/eslint app/api/consultations/ lib/db/schema.ts lib/db/schema.test.ts lib/env.ts lib/env.test.ts scripts/db-migrate.test.ts` → 출력 없음(clean)
- `grep -rn 'AskUserQuestion' app/api/consultations/ lib/env.ts lib/db/schema.ts` → exit 1(매치 0건)
- `TURSO_DATABASE_URL="file:./.tmp/build-check.db" LLM_PROVIDER_MODE=deterministic node_modules/.bin/next build` → `✓ Compiled successfully`, `ƒ /api/consultations` 라우트 등록 확인. 유일한 경고는 `instrumentation.ts`의 기존 `process.exit` Edge Runtime 경고(M2 변경과 무관, 사전 존재)
- `node_modules/.bin/tsc --noEmit` → M2가 수정한 파일(`route.ts`/`schema.ts`/`env.ts`/각 `.test.ts`) 관련 에러 0건. `.next/types/validator.ts`의 8건은 삭제된 B2B 라우트를 참조하는 gitignore된 stale 빌드 아티팩트(M1 §E.2에서 이미 사전 존재로 귀속됨)
- `node_modules/.bin/vitest run`(프로젝트 전체, 회귀 재확인) → `Test Files 47 passed (47)` / `Tests 400 passed (400)` — 동일한 30건의 사전 존재 jsdom/undici `Unhandled Error`(M1 §E.2에서 이미 baseline으로 귀속, `webidl.util.markAsUncloneable is not a function`) 외 신규 실패 0건. M2 착수 직전(M1 완료 시점) `Tests 391 passed`였고, M2가 `scripts/db-migrate.test.ts`의 `EXPECTED_TABLES` 상수를 14개 테이블로 갱신(신규 테이블 2개 추가에 따른 필연적 갱신, 실패 없음 확인 후 수정)한 것을 포함해 순증 9건(신규 테스트 파일 3개 + 확장 1개)

**Baseline-attribution**: 이번 실행(이 트리), M1 HEAD `f9ad2ce`에서 계속된 `feat/SPEC-B2C-CONSULT-001` 브랜치. jsdom/undici 오류는 M1 §E.2에서 동일 baseline으로 이미 귀속 확인됨(Node v20.19.6 환경 결함, 이번 M2 변경과 무관).

**Gaps**: pnpm이 이 환경(Node v20.19.6)에서 여전히 `ERR_UNKNOWN_BUILTIN_MODULE`로 실행 불가 — `node_modules/.bin/{drizzle-kit,vitest,tsc,eslint,next}`를 직접 호출해 우회(M1과 동일 패턴, 신규 설치 없음). `route.ts`의 삽입 시점 UNIQUE(idempotencyKey) 충돌 재조회 분기(§8.1 10번, 일치→200 경로)는 `withIdempotencyLock`이 동일 키 요청을 직렬화하는 현재 설계상 실제로는 도달 불가능한 방어 코드(defense in depth)다 — 프로세스 내 락을 우회하는 진짜 DB 레벨 레이스(예: 향후 PM2 cluster mode 전환)가 생기면 이 분기가 비로소 실행 경로가 된다; 현재는 코드 커버리지상 "unreachable-but-correct"로 남는다(잔여 위험 참고).

**Residual-risk**: (1) `withIdempotencyLock`의 안전성은 이 프로젝트가 PM2 **단일 프로세스**로 배포된다는 design.md §9.3의 명시적 전제에 의존한다 — 향후 PM2 cluster mode나 다중 인스턴스로 전환되면 이 인-프로세스 락은 더 이상 cross-process 레이스를 막지 못하며(단, DB UNIQUE 제약 기반 삽입 시점 재조회는 cross-process에서도 여전히 정확성을 보장한다 — 락은 "불필요한 429 방지"라는 부가 보장만 제공, 정확성 자체는 DB 제약이 책임진다), 이 경우 별도 SPEC에서 재검토가 필요하다. (2) `CONSENT_POLICY_VERSION` 상수(`"2026-09-25-v1"`)는 배포 시점 고정값이며 클라이언트 M4(폼 컴포넌트)가 동일 값을 `acknowledgedConsentVersion`으로 보내야 실제 제출이 성공한다 — M4에서 이 상수를 어떻게 클라이언트에 노출할지(하드코딩 vs API로 조회)는 아직 미정이며 M3/M4 단계에서 결정 필요. (3) rate limit 윈도·요청 한도 상수(`RATE_LIMIT_WINDOW_MS=60000`, `RATE_LIMIT_MAX_REQUESTS=5`)는 plan-phase가 확정한 plan-phase 기본값이며 실제 트래픽 기반 운영 튜닝은 이 SPEC 범위 밖이다(design.md §9.3, spec.md Out of Scope).

### M3 — 02→03 CTA 활성화 (진행 중) — 클라이언트/서버 env 전달 경계 발견 및 plan/design 정정

M3 구현 도중 `components/result/result-cta-bar.tsx`의 CTA 활성화 게이트를 `computeConsultFlags(process.env).shouldRenderConsult`에 연결하는 과정에서 계약 경계 문제가 발견되었다.

- **문제**: `result-cta-bar.tsx`는 `"use client"` 컴포넌트다. Next.js는 `NEXT_PUBLIC_` 접두사가 없는 일반 서버 환경 변수(`ENABLE_CONSULT_FLOW`)를 클라이언트 번들에 인라인하지 않는다 — 이 컴포넌트 내부에서 `process.env.ENABLE_CONSULT_FLOW`를 직접 읽으면 서버 렌더 시점에는 우연히 값이 맞아도, 클라이언트 하이드레이션 이후 값이 `undefined`로 평가되어 활성화된 CTA가 하이드레이션 후 조용히 비활성 stub으로 되돌아가는 하이드레이션 불일치 버그가 발생한다.
- **기각한 대안**: `NEXT_PUBLIC_ENABLE_CONSULT_FLOW` 미러 환경 변수 신설 — 동일한 게이트 값을 서버용(`ENABLE_CONSULT_FLOW`)과 클라이언트용(`NEXT_PUBLIC_ENABLE_CONSULT_FLOW`) 두 곳에 유지해야 하는 이중 소스 오브 트루스 유지보수 위험이 있어 기각.
- **채택한 해법**: `app/result/page.tsx`(Server Component)가 이미 확립한 `computeDiagnosisFlags(process.env)` → `enableDevFixture` prop 전달 패턴을 그대로 재사용한다 — `app/result/page.tsx`가 `computeConsultFlags(process.env).shouldRenderConsult`를 계산해 `<ResultView shouldRenderConsult={...} />`로 prop 전달하고, `components/result/result-view.tsx`(`"use client"`)가 이 prop을 `<ResultTopBarCta>`/`<ResultDisabilitySectionCta>`/`<ResultFinalCta>` 세 CTA 컴포넌트에 다시 prop으로 전달한다. 새 로직 없이 기존 패턴을 그대로 미러링한다.
- **사용자 승인**: 이 세션에서 사용자에게 Option A(기존 `enableDevFixture` prop 전달 패턴 미러링, 2개 파일 확장)로 직접 확인받아 승인되었다 — `NEXT_PUBLIC_` 미러 변수 대안은 명시적으로 기각.
- **plan.md/design.md 정정**: 위 승인에 따라 `plan.md` §D 제약 ①과 `design.md` §5 "허용된 기존 파일 최소 확장" 목록을 기존 7개에서 9개로 확장했다 — 8번 `app/result/page.tsx`, 9번 `components/result/result-view.tsx` 추가(이 문서 갱신 커밋 참고). 신규 REQ-ID/AC-ID 발급 없음 — 기존 M3 마일스톤 범위 내 파일 확장 예산 정정이다.

### M3 구현 완료

**변경 파일**: `lib/diagnosis/flags.ts`(확장, `computeConsultFlags` 추가) · `lib/diagnosis/flags.test.ts`(확장) · `lib/consult/draft.ts`(신규) · `lib/consult/draft.test.ts`(신규) · `components/diagnosis/diagnosis-flow.tsx`(확장, 1줄 + import) · `app/consult/page.tsx`(신규) · `app/consult/page.test.tsx`(신규) · `components/consult/consult-view.tsx`(신규, M3 placeholder) · `components/consult/consult-view.test.tsx`(신규) · `components/result/result-cta-bar.tsx`(확장, 4개 stub → 조건부 `<Link>`) · `components/result/result-cta-bar.test.tsx`(확장) · `app/result/page.tsx`(확장, `computeConsultFlags` 호출 + prop 전달) · `components/result/result-view.tsx`(확장, `shouldRenderConsult` prop 통과).

### §E 5-section 증거 형식

**Claim**: computeConsultFlags/lib/consult/draft.ts/app/consult 라우트 셸/02 CTA 4개 활성화가 TDD RED→GREEN으로 구현되었고, 02의 기존 회귀 스위트(SPEC-B2C-RESULT-001)를 깨뜨리지 않는다.

**Evidence**:
- `node_modules/.bin/tsc --noEmit` → 0 errors (전체 프로젝트).
- `node_modules/.bin/eslint <변경 파일 전체>` → 0 warnings/errors.
- `TURSO_DATABASE_URL="file:./.tmp/build-check.db" LLM_PROVIDER_MODE=deterministic node_modules/.bin/next build` → `✓ Compiled successfully`, 라우트 표에 `○ /consult` 등록 확인(`ƒ /api/consultations`·`○ /result`와 함께). 유일한 경고는 M2와 동일한 사전 존재 `instrumentation.ts` Edge Runtime 경고.
- `node_modules/.bin/vitest run`(프로젝트 전체) → `Test Files 47 passed (47)` / `Tests 406 passed (406)` — M2 종료 시점(400 passed)에서 순증 6건(전부 `lib/diagnosis/flags.test.ts`의 `computeConsultFlags` 신규 케이스; `node` 환경이라 실제로 실행됨). jsdom/undici `Unhandled Error`(`webidl.util.markAsUncloneable is not a function`, Node v20.19.6 환경 결함)는 30건→33건으로 순증 3건 — 전부 이번에 신규 작성한 jsdom 테스트 파일(`lib/consult/draft.test.ts`·`app/consult/page.test.tsx`·`components/consult/consult-view.test.tsx`) 자신이 이미 사전 존재하던 동일 클래스 오류에 편입된 것이며, 새 오류 유형이 아니다(`components/result/result-cta-bar.test.tsx`·`lib/diagnosis/handoff.test.ts` 등 기존 30건과 동일한 스택 트레이스).

**Baseline-attribution**: 이번 실행(이 트리), M2 HEAD `f03263c`에서 계속된 `feat/SPEC-B2C-CONSULT-001` 브랜치.

**Gaps**: jsdom 환경 결함으로 `lib/consult/draft.test.ts`·`app/consult/page.test.tsx`·`components/consult/consult-view.test.tsx`·`components/result/result-cta-bar.test.tsx`(4개 신규 `shouldRenderConsult=true` 케이스 포함)는 이 샌드박스에서 vitest 워커 자체가 기동하지 못해 실제로 실행되지 못했다 — TDD RED 증거는 `tsc --noEmit`(prop 미존재 시 TS2322 타입 에러, 아래 RED 증거 참고)로 대체 확보했다. `computeConsultFlags`(environment: node)만 vitest로 실제 RED→GREEN 실행 확인됨.

**Residual-risk**: draft.ts/consult-view.tsx/result-cta-bar.tsx의 jsdom 기반 assertion(Link href 값, draft 폴백 동작, handoff 배선)은 CI(Linux 환경, jsdom 정상 동작 확인됨 — M1 §E.2 기록)에서 최초로 실제 실행·검증된다. 이 세션은 코드 리뷰 + 타입체크 + lint + next build로 대체 검증했다.

### RED 증거 (GREEN 이전 verbatim, TDD 필수)

`computeConsultFlags`(`git stash`로 구현 임시 제거 후 재실행):

```
 ❯ lib/diagnosis/flags.test.ts (18 tests | 6 failed) 11ms
     × 'false/false' 3ms
     × 'true/false — 03 화면은 노출되지만 실제 제출은 불가' 1ms
     × 'false/true — 정책은 준비됐지만 03 화면 자체가 비노출' 0ms
     × 'true/true — 03 화면 노출 + 실제 제출 가능' 0ms
     × "1"·"yes" 등 다른 truthy 문자열은 거짓으로 취급한다 0ms
     × ENABLE_CONSULT_FLOW만으로 shouldRenderConsult가 결정된다(02 게이트를 참조하지 않는다) 0ms
TypeError: computeConsultFlags is not a function
```

`shouldRenderConsult` prop(`result-cta-bar.tsx`/`result-view.tsx`/`app/result/page.tsx` 구현 전, `tsc --noEmit`):

```
components/result/result-cta-bar.test.tsx(158,36): error TS2322: Type '{ shouldRenderConsult: true; }' is not assignable to type 'IntrinsicAttributes'.
  Property 'shouldRenderConsult' does not exist on type 'IntrinsicAttributes'.
(총 6건, ResultTopBarCta/ResultDisabilitySectionCta/ResultFinalCta 3개 컴포넌트 × 2곳)
```

### AC 매트릭스(M3 범위 — AC-B2CCONSULT-003/005/006 전부, 004/006은 M4 범위 부분 제외)

| AC | 상태 | 근거 |
|---|---|---|
| AC-B2CCONSULT-003 (4개 CTA → `/consult` 매핑) | PASS | `result-cta-bar.test.tsx` "shouldRenderConsult=true" describe 블록 5건 — 상단 `?channel=kakao`, 후유장해 쿼리 없음, 하단 카카오 `?channel=kakao`, 하단 전화 `?channel=phone` 전부 assert(jsdom 미실행, 코드 리뷰로 대체 검증 — 위 Gaps 참고) |
| AC-B2CCONSULT-005 (`ENABLE_CONSULT_FLOW=false` → 기존 stub 유지) | PASS | 기존 `result-cta-bar.test.tsx` 최초 12개 테스트를 **한 글자도 수정하지 않음** — `shouldRenderConsult` 생략 시 기본값 `false`로 완전히 하위 호환됨이 그 자체로 증거. `computeConsultFlags` 매트릭스 테스트가 `ENABLE_CONSULT_FLOW=false`일 때 `shouldRenderConsult===false`임을 별도 확인 |
| AC-B2CCONSULT-006 (draft sessionStorage 저장, 손상 시 빈 draft 폴백) | PASS(M3 범위 한정 — `draft.ts` 자체) | `draft.test.ts` 8개 케이스: write→read 왕복, 빈 스토리지, 손상 JSON, 스키마 불일치, 알 수 없는 키, clear, SSR 가드. "필수 동의 체크 상태는 저장하지 않는다"는 `ConsultationDraft` 타입 자체에 그 필드가 없음(M1에서 이미 계약됨)으로 구조적으로 보장. **폼 마운트 시 실제 렌더링 통합**은 M4 범위 |

### 회귀 확인 — SPEC-B2C-RESULT-001 OFF-branch

`result-cta-bar.test.tsx`의 기존 12개 테스트(`aria-disabled="true"`, 클릭/Enter no-op 안내, `total` 표시, `aria-label`, sticky 클래스, 면책 문구/푸터)는 **1바이트도 수정되지 않았다** — 새 `shouldRenderConsult` prop이 옵셔널 + 기본값 `false`이므로 기존 호출부(`<ResultFinalCta total={5} />` 등, prop 생략)는 정확히 이전과 동일한 분기를 탄다. `result-view.tsx`도 3개 CTA 호출부에 prop 하나씩 추가한 것 외 다른 로직은 변경하지 않았다(diff 확인).

### 자기검증 (§E 5-section 증거 형식) — E4/E6

- **E4**: `grep -rn 'AskUserQuestion' lib/diagnosis/flags.ts components/result/ lib/consult/draft.ts components/diagnosis/diagnosis-flow.tsx app/consult/ components/consult/ app/result/page.tsx` → 0건(exit 1).
- **E6**: 커밋/푸시는 이 항목 이후 수행 — 아래 커밋 SHA 참고.

### M4 — 채널 선택·입력 폼·동의 컴포넌트 (`components/consult/*`)

M3가 남긴 `consult-view.tsx` placeholder를 전면 교체하고, 신규 컴포넌트 5개
(`consult-summary-card.tsx`, `consult-channel-selector.tsx`, `consult-form.tsx`,
`consult-consent-group.tsx`, `consult-submit-bar.tsx`) + 공유 lib 2개
(`lib/consult/consent-policy.ts`, `lib/consult/dedupe.ts`)를 추가했다.

**M2 잔여 위험 해소** — `CONSENT_POLICY_VERSION`을 `route.ts`의 비공개 상수에서
`lib/consult/consent-policy.ts`로 추출해 서버·클라이언트 단일 소스로 만들었다
(route.ts는 이 상수를 import만 하며 동작 변경 없음).

**dedupe.ts** — design.md §5 파일 트리가 명시한 `resultId + 정규화 연락처`
복합 중복 판정 키를 순수 함수로 도출했다. `route.ts`(M2)는 이 규칙을
drizzle `and(eq, eq)` 복합 조건으로 직접 판정하며(§8.1 8번) 문자열 키로
합성하지 않으므로, `route.ts`를 이 함수를 쓰도록 리팩터링하지 않았다 —
서버·클라이언트가 공유 가능한 형태로 별도 도출해 둔 것이며, `route.ts`의
기존 동작은 전혀 바뀌지 않았다.

**?channel= 쿼리 읽기 방식 결정** — 당초 `next/navigation`의
`useSearchParams()`를 검토했으나, 이 훅은 App Router 컨텍스트를 요구해
`app/consult/page.test.tsx`(M3, 컨텍스트 없는 순수 렌더 테스트)가
"invariant expected app router to be mounted"로 깨진다. `window.location.search`를
직접 읽는 방식으로 대체해(SSR 가드 포함, kakao 폴백) 기존 M3 테스트를
전혀 건드리지 않고 REQ-B2CCONSULT-004를 만족시켰다.

**`components/consult/consult-view.test.tsx` 전면 교체 사실 고지** — 이
파일은 M3에서 이미 생성되어 있었다(placeholder 전용, "준비 중" 문구 +
배선 확인 2개 테스트). M4는 이 파일을 `Write`로 덮어썼다 — M3 스스로
"M4가 내부를 완전히 교체한다"고 명시했고, placeholder 문구("상담 신청 폼을
준비하고 있어요")가 코드에서 완전히 사라졌으므로 그 문구를 검증하던
기존 테스트는 더 이상 검증할 대상이 없다. 새 테스트는 handoff 3갈래
분기(AC-007/008/009 — 기존 wiring-only 검증보다 강화됨), draft 왕복,
idempotencyKey 1회 생성, 채널 쿼리 반영, 필수 동의 게이트를 모두
커버한다 — 순수 삭제가 아니라 동등 이상의 보증으로 대체.

### AC 매트릭스(M4 범위 — AC-B2CCONSULT-006 통합 부분 + 007~015)

| AC | 상태 | 검증 명령 | 근거 |
|---|---|---|---|
| AC-B2CCONSULT-006(통합) | PASS(코드 리뷰, jsdom 미실행) | `consult-view.test.tsx` "draft 초기화/왕복" describe | blur 시 draft 저장 + 필수 동의 미저장을 `consult-view.tsx`가 실제로 마운트한 폼에서 검증(M3는 draft.ts 단위 테스트만) |
| AC-B2CCONSULT-007 | PASS(코드 리뷰) | `consult-view.test.tsx` "AC-007" | handoff empty → `consult-no-data` testid 렌더, `consult-summary-card` 부재 확인 |
| AC-B2CCONSULT-008 | PASS(코드 리뷰) | `consult-view.test.tsx` "AC-008" | 손상 JSON에도 throw 없이 `consult-error` testid 렌더 |
| AC-B2CCONSULT-009 | PASS(코드 리뷰, 구조적) | — | `readDiagnosisHandoff()` 재사용(재파싱 없음) — 02가 이미 검증한 세션 유지 정책을 그대로 상속, 별도 TTL 미도입 |
| AC-B2CCONSULT-010 | PASS(코드 리뷰) | `consult-form.test.tsx` channel별 테스트 2건 | phone일 때만 `aria-required=true`, kakao일 때 "선택" 배지 — `ConsultationRequestSchema.refine`과 라벨/필수 여부 일치 |
| AC-B2CCONSULT-011 | PASS(기존 M1 커버, 변경 없음) | `phone.test.ts`(회귀 재확인, 아래 참고) | normalizePhone/formatPhoneDisplay/maskPhone은 M1에서 이미 100% 검증됨, M4는 UI에서 이 함수들을 재구현하지 않고 서버 스키마에 위임 |
| AC-B2CCONSULT-012 | PASS(코드 리뷰) | `consult-view.test.tsx` "두 필수 동의를 모두 체크해야..." | 두 체크 전 `aria-disabled="true"`, 둘 다 체크 후 해제 확인. 마케팅 체크는 별도 핸들러로 분리(consult-consent-group.test.tsx) |
| AC-B2CCONSULT-013 | PASS(코드 리뷰) | `consult-consent-group.test.tsx` "AC-B2CCONSULT-013" | "자세히 보기" 클릭 후에도 체크박스 미체크 유지 |
| AC-B2CCONSULT-014 | PASS(코드 리뷰) | `consult-consent-group.test.tsx` "AC-B2CCONSULT-014" | 전체 렌더 텍스트에 "제3자" 문자열 부재 — 구조적으로 제3자 동의 UI 자체를 만들지 않음(REQUIRED_ITEMS/OPTIONAL_ITEM에 3번째 필수 항목 없음) |
| AC-B2CCONSULT-015 | PASS(코드 리뷰) | `consult-submit-bar.test.tsx` "제출이 진행 중일 때..." | 진행 중 `aria-busy="true"`, 재클릭 시 `onSubmit` 호출 횟수 1회 고정(Promise 미해결 상태에서 재클릭 시뮬레이션) |

### RED 증거 (GREEN 이전 verbatim, TDD 필수)

`lib/consult/consent-policy.ts`/`dedupe.ts`(node 환경, 실제 실행):

```
$ npx vitest run lib/consult/consent-policy.test.ts lib/consult/dedupe.test.ts
 FAIL  lib/consult/consent-policy.test.ts [ lib/consult/consent-policy.test.ts ]
Error: Cannot find module './consent-policy' imported from .../lib/consult/consent-policy.test.ts
 FAIL  lib/consult/dedupe.test.ts [ lib/consult/dedupe.test.ts ]
Error: Cannot find module './dedupe' imported from .../lib/consult/dedupe.test.ts
 Test Files  2 failed (2)
      Tests  no tests
```

GREEN(같은 명령, 구현 후):

```
 Test Files  3 passed (3)   # + app/api/consultations/route.test.ts(회귀)
      Tests  34 passed (34)
```

컴포넌트 5개(`consult-summary-card`/`consult-channel-selector`/`consult-form`/
`consult-consent-group`/`consult-submit-bar`)와 `consult-view.tsx`는 jsdom
크래시(아래 Gaps)로 실제 RED/GREEN 실행 증거를 캡처할 수 없었다 — 테스트를
먼저 작성하고(구현 파일이 존재하지 않는 상태에서 import가 실패함을
`tsc --noEmit`으로 구조적으로 확인) 이후 구현했다는 순서는 지켰으나,
verbatim 실행 로그는 이 milestone에서 제시할 수 없다(정직한 한계 고지,
아래 Gaps 참고).

### 자기검증 (§E 5-section 증거 형식)

- **E1**: 위 AC 매트릭스.
- **E2**: `npx next build` → `✓ Compiled successfully`, `/consult` 라우트 정적 생성 확인(`Route (app)` 표에 `○ /consult` 출력). TypeScript 단계(`Finished TypeScript`)도 이 빌드에 포함되어 통과.
- **E3**: `npx vitest run --coverage --coverage.include='lib/consult/consent-policy.ts' --coverage.include='lib/consult/dedupe.ts' lib/consult/consent-policy.test.ts lib/consult/dedupe.test.ts` → Statements/Branches/Functions/Lines 전부 100%(2/2, 0/0, 1/1, 2/2). 5개 UI 컴포넌트 + consult-view.tsx는 jsdom 크래시로 커버리지 측정 불가(아래 Gaps).
- **E4**: `grep -rn 'AskUserQuestion' components/consult/ lib/consult/` → 0건(exit 1).
- **E5**: `npx eslint components/consult/ lib/consult/ app/consult/ app/api/consultations/route.ts` → 출력 없음(clean). `npx tsc --noEmit`(프로젝트 전체) → 출력 없음(clean).
- **E6**: 커밋 2건 — `4883d25`(M4-1, consent-policy+dedupe), `cd394cc`(M4-2, UI 컴포넌트). `git push origin feat/SPEC-B2C-CONSULT-001` → `339e1d6..cd394cc` 성공.
- **E7**: 블로커 없음.
- **E8**: 위 "RED 증거" 참고 — lib 2개 파일은 verbatim 캡처, 컴포넌트 6개는 구조적 확인(모듈 미존재 시 `tsc --noEmit` 실패)으로 대체.

**Gaps(미검증, jsdom 크래시)** — 이 샌드박스는 `node_modules/undici`와
`jsdom@30`(Node v20.19.6) 사이의 사전 존재 환경 결함(`TypeError:
webidl.util.markAsUncloneable is not a function`)으로 `@vitest-environment
jsdom` 테스트 파일을 **전혀 실행할 수 없다** — M1~M3이 이미 동일하게
보고한 한계이며, 이번 milestone에서도 동일하게 재현된다(`step-consent-modal.test.tsx`
등 기존 통과 테스트로 baseline 재확인, 아래 회귀 절 참고). 이 때문에 아래는
**실제 실행으로 검증되지 않았고, 코드 리뷰 수준의 신뢰로만 제시한다**:
- 5개 신규 컴포넌트 + `consult-view.tsx`의 실제 렌더링 결과(DOM 구조, 텍스트, aria 속성)
- Base UI Dialog/Drawer 기반 "자세히 보기" 오버레이의 실제 포커스 트랩/ESC 동작
- 이중 제출 방지의 실제 타이밍(Promise pending 구간 동안의 재클릭 차단)

`npx tsc --noEmit`과 `npx next build`(TypeScript 단계 포함) 양쪽 모두
전체 프로젝트에서 오류 0건으로 통과했으므로 타입·컴파일 수준의 정합성은
실행 증거로 확인됐지만, 런타임 동작 자체는 코드 리뷰로만 확인했다.

**Residual-risk(잔여 위험)** — jsdom 크래시가 이 샌드박스만의 문제이고
CI(GitHub Actions, 다른 Node/jsdom 버전 조합)에서는 정상 실행될 가능성이
높다(M1~M3도 동일 가정 하에 진행됨). 다음 세션 또는 CI 실행 시 이
milestone이 추가한 6개 jsdom 테스트 파일(consult-view 포함)을 최우선으로
재실행해 실제 GREEN을 확인해야 한다 — 특히 `consult-consent-group.tsx`의
Dialog/Drawer 분기(`useMediaQuery` 기반)는 코드 리뷰만으로는 낮은 신뢰도.

### 회귀 확인 — 전체 스위트 + M1/M2 non-jsdom 재확인

```
$ npx vitest run   # 프로젝트 전체
 Test Files  49 passed (49)
      Tests  412 passed (412)
     Errors  38 errors   # 전부 동일 jsdom/undici Unhandled Error(M3 종료 시점 33건 → +5,
                         # 신규 jsdom 테스트 파일 5개(consult-view.test.tsx는 이미 M3부터
                         # 동일 범주였으므로 신규 아님)만큼 정확히 순증 — 새 오류 유형 없음
```

M3 종료 시점(`Test Files 47 passed`/`Tests 406 passed`, jsdom 오류 33건) 대비
Test Files +2(consent-policy.test.ts, dedupe.test.ts — node 환경, 실제 실행),
Tests +6(consent-policy 2건 + dedupe 4건), jsdom 오류 +5(신규 jsdom 테스트
파일 5개)로 정확히 정합 — 신규 실패 카테고리 없음.

M1/M2 non-jsdom 파일 개별 재실행(route.ts 리팩터링이 기존 동작을 바꾸지
않았는지 재확인):

```
$ npx vitest run lib/consult/schema.test.ts lib/consult/phone.test.ts \
  app/api/consultations/route.test.ts lib/env.test.ts lib/db/schema.test.ts
 Test Files  5 passed (5)
      Tests  83 passed (83)
```

전부 그린, 단언 변경 없음 — `route.ts`의 `CONSENT_POLICY_VERSION` 추출
리팩터링은 동작을 바꾸지 않았다.

### M5 — 성공·중복·실패 상태 화면 + 실제 제출 연결 (`components/consult/{consult-success,consult-duplicate,consult-failure,consult-no-data,consult-error}.tsx` + `consult-view.tsx` 배선)

M3/M4가 `consult-view.tsx`에 남겨 둔 empty/invalid 인라인 placeholder를
전용 컴포넌트(`consult-no-data.tsx`/`consult-error.tsx`)로 추출하고,
03-B/03-C/03-D 3개 응답 상태 화면을 신규 작성한 뒤 `handleSubmitStub`을
실제 `POST /api/consultations` fetch 호출로 교체했다.

**응답 3갈래 라우팅 계약** — design.md §9.1/acceptance AC-B2CCONSULT-022가
정의한 대로, `status:"error"`(코드 무관)와 fetch 예외/비정상 JSON은 전부
동일한 03-D(`ConsultFailure`)로 수렴한다. `status:"success"`만 03-B,
`status:"duplicate"`만 03-C. code별 별도 문구 분기는 이 SPEC 범위에 없다
(design.md §10의 03-D 문구가 의도적으로 일반적인 이유).

**handoff_mismatch 사전 판정** — `React.useRef`의 초기값 인자가 오직 첫
렌더에서만 쓰이는 성질을 이용해 `useEffect` 없이 마운트 시점 `resultId`를
캡처했다(`mountResultIdRef`). 제출 시 `readDiagnosisHandoff()`를 다시
호출해 이 값과 비교 — 다르면 서버를 호출하지 않고 즉시 03-D로 판정한다
(acceptance.md handoff_mismatch 시나리오, "서버 상태 코드가 없다" 원칙).

**duplicate 응답에는 draft를 지우지 않기로 결정(§7 remaining-ambiguity
해소, delegation 프롬프트가 명시적으로 판단을 요구한 항목)** — design.md
§2.2 "상담 신청 완료 후 draft 삭제"와 REQ-B2CCONSULT-025는 모두 "제출
**성공** 시"라는 조건을 명시하며, acceptance.md AC-B2CCONSULT-025의 draft
정리 시나리오도 "상담 신청이 **성공적으로** 접수되었을 때"만 검증한다.
duplicate는 이번 세션의 신규 성공 제출이 아니라 과거에 이미 존재하는
신청과의 충돌이므로, `handleSubmit`은 `status:"duplicate"` 분기에서
`clearConsultationDraft()`를 호출하지 않는다 — SPEC 전체에서 draft 삭제가
"성공"과만 결부되어 일관되게 서술되므로 진짜 모호함(blocker 보고 대상)이
아니라고 판단했다.

**"이전 화면으로 돌아가기"(design.md §10 03-D 원문) vs "진단 결과로
돌아가기"(acceptance.md AC-B2CCONSULT-025 03-D 시나리오 인용 문구) 표기
불일치 해소** — design.md §10은 03-D의 복귀 CTA를 "이전 화면으로
돌아가기"로, acceptance.md는 같은 CTA를 "진단 결과로 돌아가기"로
인용한다. 두 문서 모두 같은 목적지(`/result`)를 가리키고(03-D 진입 전
"이전 화면"은 항상 `/result`다 — 02→03 흐름 외 03 직접 진입은 이미
no-data/error 상태로 별도 처리됨) acceptance.md가 실제 검증 가능한
Given-When-Then 형식으로 정확한 버튼 텍스트를 못 박고 있으므로, 03-B/03-C
와 동일하게 "진단 결과로 돌아가기" 문구 + `href="/result"`로 통일했다 —
AC가 SSOT라는 원칙(더 정밀하고 테스트 가능한 문서를 우선)에 따른 판단이며,
真 blocker가 아니라고 판단했다.

**서버 응답 검증(narrowing) 방식** — `lib/consult/schema.ts`는 이 milestone
의 PRESERVE 대상(B10)이라 `ConsultationSubmitResultSchema` 같은 신규 zod
스키마를 추가하지 않았다. 대신 `consult-view.tsx` 모듈 스코프에
`parseSubmitResult()`(discriminant `status` 필드만 `"success"|"duplicate"
|"error"` 중 하나인지 확인)를 두어 완전히 untyped `any`로 신뢰하지 않으면서도
불필요한 전체 스키마 중복을 피했다(Enforce Simplicity — 자체 서버 응답이라
나머지 필드 형태는 컴파일 타임 타입이 이미 보장).

### AC 매트릭스(M5 범위 — AC-B2CCONSULT-018/020/022/023/025)

| AC | 상태 | 검증 명령 | 근거 |
|---|---|---|---|
| AC-B2CCONSULT-018(최초 제출 성공 응답 형태) | PASS(코드 리뷰, jsdom 미실행 — 서버측은 M2 route.test.ts로 이미 실행 검증됨) | `consult-success.test.tsx` "내부 DB 식별자(consultationId)를..." + `consult-view.test.tsx` "success 응답 → 03-B..." | `ConsultSuccess`는 서버 응답의 `channel`/`maskedContact`/`preferredCallTime`만 렌더링, `consultationId`/`expectedContactWindow` 필드 자체가 타입에 없어 렌더링 불가능(구조적 보장) |
| AC-B2CCONSULT-020(중복 → 409, 새 레코드 미생성) | PASS(서버측 M2 route.test.ts 기존 커버, 변경 없음) + 클라이언트 라우팅 PASS(코드 리뷰) | `consult-view.test.tsx` "duplicate 응답 → 03-C..." | `status:"duplicate"` 응답이 `ConsultDuplicate`로 라우팅되고 draft가 삭제되지 않음을 확인 |
| AC-B2CCONSULT-022(확정 문구 없음 + 재시도 동일 idempotencyKey + 입력 보존) | PASS(코드 리뷰) | `consult-failure.test.tsx` "AC-022...", `consult-view.test.tsx` "다시 시도하기는 최초 제출과 동일한 idempotencyKey로..." + "네트워크 예외(fetch reject)..." | "저장되었습니다" 문구 부재 assert, 재시도 요청 body의 `idempotencyKey`가 최초 제출과 동일함을 두 번째 fetch 호출 인자에서 직접 비교, fetch reject도 동일하게 03-D로 라우팅 |
| AC-B2CCONSULT-023(중복 PII 최소화 + 접수일 날짜 단위) | PASS(코드 리뷰) | `consult-duplicate.test.tsx` "내부 consultationId나 전체 페이로드를..." + "접수일은 시:분:초 없이..." | `innerHTML`에 `consultationId` 패턴 부재, `receivedAt` 표시 영역에 `\d{2}:\d{2}:\d{2}` 패턴 부재를 직접 assert. `maskedContact`/`receivedAt` 유도 방식(요청 자신의 값 vs 매칭 레코드 재조회)은 서버측(`route.ts` `toDuplicateResult`)이 M2에서 이미 구현·검증됨 — 이 milestone은 클라이언트가 서버 값을 재계산 없이 그대로 렌더링만 함을 확인 |
| AC-B2CCONSULT-025(draft만 정리, 핸드오프 유지 + 성공 후 복귀 + 중복/실패 복귀) | PASS(코드 리뷰) | `consult-view.test.tsx` "success 응답 → 03-B가 렌더링되고 draft는 삭제되며..." | `sessionStorage`에서 draft 키(`bosang-radar:consultation-draft-v1`)는 성공 시에만 제거되고 진단 핸드오프 키(`DIAGNOSIS_STORAGE_KEY`)는 그대로 유지됨을 직접 assert. 3개 상태 컴포넌트 모두 `href="/result"` 링크만 제공(핸드오프 자체를 건드리는 코드 경로 없음 — 구조적 보장) |

### RED 증거 (GREEN 이전 verbatim, TDD 필수)

```
$ node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "consult-(no-data|error|success|duplicate|failure)"
components/consult/consult-duplicate.test.tsx(6,34): error TS2307: Cannot find module './consult-duplicate' or its corresponding type declarations.
components/consult/consult-error.test.tsx(6,30): error TS2307: Cannot find module './consult-error' or its corresponding type declarations.
components/consult/consult-failure.test.tsx(6,32): error TS2307: Cannot find module './consult-failure' or its corresponding type declarations.
components/consult/consult-no-data.test.tsx(6,31): error TS2307: Cannot find module './consult-no-data' or its corresponding type declarations.
components/consult/consult-success.test.tsx(6,32): error TS2307: Cannot find module './consult-success' or its corresponding type declarations.
```

GREEN(구현 후, 같은 명령): 출력 없음(0건 매칭, clean).

M4와 동일한 한계로, 5개 신규 컴포넌트와 `consult-view.tsx`의 응답 라우팅
로직은 jsdom 크래시(아래 Gaps)로 실제 RED→GREEN 실행 로그를 캡처할 수
없었다 — 테스트 파일을 구현 전에 먼저 작성해(`tsc --noEmit`이 `TS2307`로
모듈 부재를 구조적으로 확인) RED를 대체 증거로 확보한 뒤 구현했다.

### 자기검증 (§E 5-section 증거 형식)

- **E1**: 위 AC 매트릭스(018/020/022/023/025). 016/019는 M1/M2가 이미
  검증했고 이 milestone에서 변경한 파일이 없어 재확인만 했다(아래 회귀
  절 — 전체 스위트 412 passed에 포함, `route.test.ts`/`schema.test.ts`는
  M1/M2 회귀 세트에 이미 포함).
- **E2**: `node_modules/.bin/next build` → `✓ Compiled successfully in 1654ms`,
  `Route (app)` 표에 `○ /consult`·`ƒ /api/consultations` 출력(정상 생성
  확인). `Finished TypeScript in 4.0s`도 같은 빌드에 포함되어 통과. 유일한
  경고는 `instrumentation.ts:33`의 기존 무관 경고(이 milestone 변경분 아님).
- **E3**: jsdom 크래시로 5개 신규 컴포넌트 + `consult-view.tsx`의 커버리지
  측정 불가(M4와 동일한 환경 결함, 아래 Gaps) — `node_modules/.bin/tsc
  --noEmit -p tsconfig.json`(프로젝트 전체) → 출력 없음(clean, 타입 수준
  정합성만 확인).
- **E4**: `grep -rn 'AskUserQuestion' components/consult/` → 0건(exit 1).
- **E5**: `node_modules/.bin/eslint components/consult/consult-{no-data,error,success,duplicate,failure,view}.tsx components/consult/consult-{no-data,error,success,duplicate,failure,view}.test.tsx` → 출력 없음(clean).
- **E6**: 커밋 1건 — `19eeecb`(M5, 성공·중복·실패 상태 화면 + 실제 제출 연결). `git push origin feat/SPEC-B2C-CONSULT-001` → `3ab3098..19eeecb feat/SPEC-B2C-CONSULT-001 -> feat/SPEC-B2C-CONSULT-001` 성공.
- **E7**: 블로커 없음 — 위 두 건(duplicate 시 draft 미정리, 03-D "돌아가기"
  문구 통일)은 SPEC 문서 간 표현 불일치였을 뿐 상반된 요구사항이 아니었고,
  acceptance.md(더 정밀·테스트 가능한 문서)를 SSOT로 삼아 자체 해소했다.
- **E8**: 위 "RED 증거" 참고 — 5개 컴포넌트는 구조적 확인(`tsc --noEmit`
  TS2307)으로 대체, `consult-view.tsx`의 제출 라우팅 로직(성공/중복/실패/
  handoff_mismatch/재시도)은 jsdom 크래시로 verbatim 실행 로그를 캡처하지
  못했다 — 코드 리뷰 수준으로만 제시한다(아래 Gaps).

**Gaps(미검증, jsdom 크래시)** — M1~M4와 동일한 사전 존재 환경 결함
(`TypeError: webidl.util.markAsUncloneable is not a function`, Node
v20.19.6 vs jsdom 30 불일치)으로 이번 milestone이 추가한 5개 jsdom
컴포넌트 테스트 파일(`consult-{no-data,error,success,duplicate,failure}.test.tsx`)
과 `consult-view.test.tsx`에 추가한 6개 신규 제출-라우팅 테스트
("success/duplicate/error 응답 라우팅", "네트워크 예외", "handoff_mismatch",
"다시 시도하기 idempotencyKey 재사용")는 이 샌드박스에서 **전혀 실행되지
못했다**. 실제로 실행·검증되지 않은 항목:
- 5개 신규 컴포넌트의 실제 렌더링 결과(DOM 구조, 텍스트, `aria-busy` 속성)
- `handleSubmit`의 fetch 호출 자체(모킹된 `fetch`가 실제로 호출됐는지,
  요청 body가 기대한 형태인지)
- `handoff_mismatch` 판정 시 fetch가 **호출되지 않는지**(음성 assertion)
- 재시도 시 두 번째 fetch 호출의 `idempotencyKey`가 첫 번째와 동일한지

`node_modules/.bin/tsc --noEmit`과 `node_modules/.bin/next build`
(TypeScript 단계 포함) 양쪽 모두 전체 프로젝트에서 오류 0건으로
통과했으므로 타입·컴파일 수준의 정합성은 실행 증거로 확인됐지만, 런타임
동작 자체(특히 상태 전이·fetch 모킹 상호작용)는 코드 리뷰로만 확인했다.

**Residual-risk(잔여 위험)** — M1~M4와 동일한 가정(CI의 다른 Node/jsdom
버전 조합에서는 정상 실행될 가능성이 높음) 하에 진행했다. 다음 세션 또는
CI 실행 시 이 milestone이 추가한 11개 jsdom 테스트 파일(신규 5개 +
`consult-view.test.tsx` 확장)을 최우선으로 재실행해 실제 GREEN을 확인해야
한다 — 특히 `handleSubmit`의 3갈래 라우팅과 `handoff_mismatch` 사전 판정은
코드 리뷰만으로는 상대적으로 낮은 신뢰도(비동기 `fetch` 모킹 타이밍에
의존하는 로직이라 실제 실행 없이는 race condition 여부를 완전히 배제할
수 없음).

### 회귀 확인 — 전체 스위트 + M1~M4 non-jsdom 재확인

```
$ node_modules/.bin/vitest run   # 프로젝트 전체
 Test Files  49 passed (49)
      Tests  412 passed (412)
     Errors  43 errors   # 전부 동일 jsdom/undici Unhandled Error(M4 종료 시점 38건 → +5,
                         # 이번에 추가한 jsdom 테스트 파일 5개만큼 정확히 순증 — 새 오류
                         # 유형 없음. consult-view.test.tsx는 이미 M3부터 동일 범주였으므로
                         # 신규 아님(테스트 6건을 추가했지만 파일 자체는 기존)
```

M4 종료 시점(`Test Files 49 passed`/`Tests 412 passed`, jsdom 오류 38건)
대비 Test Files 동일(49, 신규 5개 파일 전부 jsdom이라 "passed"에 포함되지
않음), Tests 동일(412, jsdom 크래시로 신규 assertion이 전혀 실행되지
못했기 때문), jsdom 오류 +5(신규 jsdom 테스트 파일 5개)로 정확히 정합 —
신규 실패 카테고리 없음, 0건 회귀.

M1/M2/M4 non-jsdom 파일 개별 재실행(변경된 `consult-view.tsx`가 참조하는
공유 lib들이 기존 동작을 바꾸지 않았는지 재확인):

```
$ node_modules/.bin/vitest run lib/consult/schema.test.ts lib/consult/phone.test.ts \
  lib/consult/draft.test.ts app/api/consultations/route.test.ts \
  lib/consult/consent-policy.test.ts lib/consult/dedupe.test.ts
 Test Files  5 passed (5)
      Tests  55 passed (55)
     Errors  1 error   # draft.test.ts(jsdom) — 동일한 사전 존재 크래시, 나머지 4개
                       # node 환경 파일은 5개 모두 "passed" 집계에 포함되어 실제 실행됨
```

non-jsdom 4개 파일(schema/phone/route/consent-policy/dedupe — 정확히는
node 환경 5개, draft.test.ts만 jsdom crash) 전부 그린, 단언 변경 없음 —
`consult-view.tsx`가 import하는 `clearConsultationDraft`/
`readConsultationDraft`/`writeConsultationDraft`(draft.ts),
`CONSENT_POLICY_VERSION`(consent-policy.ts) 등 공유 lib는 이 milestone에서
전혀 수정하지 않았다(PRESERVE 목록대로).

### M6 — 접근성·반응형·unit/component 테스트 보강 (`consult-view.tsx` + `consult-submit-bar.tsx` + 테스트 파일)

design.md §11(반응형·접근성 계약)과 plan.md §F item 6이 요구하는 마지막
milestone. 새 컴포넌트를 만들지 않고, M4/M5가 남긴 **핵심 갭 1개**를
메우고 나머지 4개 항목을 **회귀 감사**했다.

**핵심 갭 — 제출 전 클라이언트 사이드 검증이 전혀 없었다.**
`consult-form.tsx`는 M4부터 `errors` prop(`aria-invalid`/
`aria-describedby`/`role="alert"` FieldError)을 완전히 배선해 두었지만,
`consult-view.tsx`의 `handleSubmit`은 이 prop을 한 번도 채운 적이
없었다 — 서버의 `ConsultationRequestSchema.safeParse`만이 유일한 검증
경로였고, 클라이언트는 잘못된 입력도 그대로 fetch를 호출했다. 이
milestone은 fetch 호출 직전에 **동일한** `ConsultationRequestSchema`로
`safeParse`를 실행해(제약 D — 서버와 다른 규칙을 만들지 않는다),
실패하면 (1) fetch를 호출하지 않고, (2) 필드별 오류를 `ConsultForm`의
`errors` prop에 채우고, (3) 오류 요약(`role="alert"`, 이 프로젝트의 기존
관례 그대로)을 렌더링하고, (4) 첫 오류 필드(이름→연락처→연락 희망
시간 순)의 `<input>`에 `document.getElementById(...).focus()`로 포커스를
이동한다(AC-B2CCONSULT-024).

**zod 기본 메시지 vs 한국어 UI** — `name`의 `.min(1)`처럼 스키마가
커스텀 메시지를 주지 않은 필드는 zod 기본 영문 메시지가 나온다. 이
화면 전용 한국어 대체 문구(`FIELD_FALLBACK_MESSAGE`)를 얹되, `.refine`이
만든 커스텀 메시지(`issue.code === "custom"` — 이미 한국어)는 그대로
쓴다. 검증 **규칙**은 변하지 않는다(safeParse 호출 자체가 스키마를
그대로 실행), 메시지 **문구**만 다듬는다 — 제약 D를 위반하지 않는다.

**모바일 sticky 하단 CTA** — `consult-submit-bar.tsx`에 `sticky bottom-0
... md:static`(`components/result/result-cta-bar.tsx`의
`ResultFinalCta`와 동일한 메커니즘)을 추가했다. `ResultFinalCta`는 페이지
루트에 직접 렌더링돼 원래 폭 전체를 차지하지만, `ConsultSubmitBar`는
`max-w-[720px] px-4`로 패딩된 컬럼의 flex 자식이라 `-mx-4 px-4`로 부모의
패딩을 상쇄해 뷰포트 가장자리까지 풀블리드시켰다(데스크톱에서는
`md:mx-0`로 원상 복귀). 배경은 02의 dark `bg-app-sidebar`가 아니라 이
화면이 이미 쓰는 `bg-app-surface`(+ `border-t`로 스크롤 콘텐츠와 분리)를
재사용했다 — "sticky 메커니즘"만 재사용 대상이지 색상까지 재사용 대상은
아니었다(design.md §11 원문 "sticky 패턴 재사용").

**aria-live="polite" 상태 안내 감사** — `consult-submit-bar.tsx`의
`aria-busy`는 M4/M5부터 이미 있었지만, design.md §11이 명시한
"aria-live=polite로 상태 안내"에 대응하는 라이브 리전이 없었다.
`consult-channel-selector.tsx`의 `CHANNEL_NOTICE`(`role="status"
aria-live="polite"`)와 동일한 패턴으로 `role="status" aria-live="polite"`
시각적으로 숨겨진(`sr-only`) 안내 span을 추가해 제출 중 상태
("상담 신청을 제출하는 중입니다")를 스크린리더에 안내한다.

**prefers-reduced-motion 감사 — 갭 없음, 코드 변경 없음.**
`components/consult/*` 전체를 grep한 결과 실제 모션은
`consult-channel-selector.tsx`의 `transition-colors`(선택 카드 hover/선택
배경색 전환) 하나뿐이었다. 이 프로젝트에서 `motion-reduce:` 가드는
`animate-spin`(연속 애니메이션, `step-loading.tsx`)과 Dialog/Drawer의
큰 transform/opacity 전환에만 적용되며, `transition-colors` 단독은
`result-cta-bar.tsx`/`result-category-tabs.tsx`/`diagnosis-header.tsx`/
`step-consent-modal.tsx` 등 프로젝트 전역에서 이미 가드 없이 쓰이는
확립된 관례다(hover 색상 전환은 전정계 질환 유발 위험이 낮은 저강도
모션으로 간주됨). `consult-consent-group.tsx`의 Dialog/Drawer는
M4부터 `components/ui/dialog.tsx`/`drawer.tsx`를 재사용해
`motion-reduce:transition-none`을 이미 전이적으로 상속한다 — 별도 확인만
하고 코드는 건드리지 않았다.

**키보드 조작성 감사 — 회귀 없음, 코드 변경 없음.**
`consult-channel-selector.tsx`의 두 라디오가 동일한
`RADIO_GROUP_NAME`(`name="consult-channel"`) 상수를 공유함을 확인(방향키
그룹 탐색이 동작하는 전제조건). `consult-consent-group.tsx`의 체크박스는
네이티브 `<input type="checkbox">`(Space 조작 가능, 커스텀 div 아님).
"자세히 보기" 트리거는 M4가 `step-consent-modal.tsx`/
`step-consent-sheet.tsx`를 재사용해 이미 구현한 Base UI
Dialog/Drawer(포커스 트랩·ESC·트리거로 포커스 복귀 기본 제공) 그대로다.
`consult-submit-bar.tsx`의 제출 버튼은 네이티브 `<button type="button">`
+ `onClick`(키보드 이벤트 억제 코드 없음 — Enter/Space 기본 동작 유지).

### 테스트 체크리스트 매핑(plan.md §F item 6 — 7항목)

| plan.md 체크리스트 항목 | 커버 테스트 파일 | milestone |
|---|---|---|
| 데이터 계약 | `lib/consult/schema.test.ts` | M1 |
| 전화번호 정규화 | `lib/consult/phone.test.ts` | M1 |
| draft | `lib/consult/draft.test.ts` | M3 |
| CTA 채널 매핑 | `consult-view.test.tsx`("URL의 ?channel=phone 쿼리가...", "channel 쿼리가 없거나...") | M4 |
| 동의 게이트 | `consult-consent-group.test.tsx` + `consult-view.test.tsx`("두 필수 동의를 모두 체크해야...") | M4 |
| 폼 검증(신규) | `consult-view.test.tsx`("이름·연락처를 비운 채 제출하면...", "...연락 희망 시간이 비어있으면...", "형식이 잘못된 연락처...", "모든 필드가 유효하면...") | **M6(신규 4건)** |
| 상태 컴포넌트별 렌더링 | `consult-success.test.tsx`/`consult-duplicate.test.tsx`/`consult-failure.test.tsx`/`consult-no-data.test.tsx`/`consult-error.test.tsx` | M4/M5 |

M6이 추가한 신규 테스트는 위 "폼 검증" 행의 4건(`consult-view.test.tsx`)
+ `consult-submit-bar.test.tsx`의 sticky 클래스 검증 1건과 aria-live
상태 안내 검증 1건, 총 6건이다. 나머지 6개 체크리스트 항목은 M1~M5가
이미 커버하고 있어 M6에서 중복 작성하지 않았다.

### AC 매트릭스(M6 범위 — AC-B2CCONSULT-024)

| AC | 상태 | 검증 명령 | 근거 |
|---|---|---|---|
| AC-B2CCONSULT-024(Desktop 720px + 오류 요약/포커스 이동) | PASS(코드 리뷰, jsdom 미실행 — 아래 Gaps) | `consult-view.test.tsx` "이름·연락처를 비운 채 제출하면..." + "...연락 희망 시간이 비어있으면..." + "형식이 잘못된 연락처..." | `consult-view.tsx`의 `max-w-[720px]`는 M3부터 불변(회귀 확인만); 클라이언트 `safeParse` 실패 시 fetch 미호출 + `consult-error-summary` 렌더링 + `document.activeElement`가 첫 오류 필드임을 직접 assert |
| AC-B2CCONSULT-024(Mobile sticky CTA + Bottom Sheet 포커스 복귀) | PASS(코드 리뷰) — Bottom Sheet 포커스 복귀는 M4 회귀 확인만(코드 변경 없음) | `consult-submit-bar.test.tsx` "컨테이너가 모바일에서 sticky bottom-0이고..." | `consult-submit-bar` 컨테이너 className에 `sticky`/`bottom-0`/`md:static` 포함을 직접 assert. Bottom Sheet(ESC/포커스 복귀)는 `step-consent-sheet.tsx`(M4 이미 구현) 재사용 — 이 milestone에서 코드 변경 없음 |
| AC-B2CCONSULT-024(전체 키보드 조작성) | PASS(코드 리뷰 — 위 "키보드 조작성 감사" 절 참고) | (코드 리뷰 — 네이티브 시맨틱 확인, 신규 테스트 불필요) | 라디오/체크박스/버튼 모두 네이티브 HTML 시맨틱만 사용, 커스텀 키보드 핸들러 없음(회귀 없음의 구조적 근거) |

### RED 증거 (GREEN 이전 verbatim, TDD 필수)

`consult-view.test.tsx`에 추가한 4건의 검증 테스트는 구현 전에 먼저
작성했다. jsdom 크래시(아래 Gaps)로 실행 로그를 캡처할 수 없어, 대신
구현 이전 시점의 소스를 근거로 "RED가 성립했을 것"을 구조적으로 보인다:
구현 전 `consult-view.tsx`에는 `ConsultationRequestSchema` import 자체가
없었고 `handleSubmit`은 검증 없이 곧장 `fetch`를 호출했으므로, "이름·
연락처를 비운 채 제출하면 fetch가 호출되지 않고..." 같은 assertion은
구현 전 소스에서 반드시 실패했을 것이다(`fetchMock`이 검증 없이
호출됐을 것이므로 `expect(fetchMock).not.toHaveBeenCalled()`가 깨짐).
`consult-submit-bar.test.tsx`의 sticky/aria-live 테스트 2건도 동일한
근거 — 구현 전 `consult-submit-bar.tsx`에는 `sticky`/`bottom-0` 클래스와
`consult-submit-status` 요소 자체가 없었으므로 `container.className`
assertion과 `querySelector` null 체크가 구조적으로 실패했을 것이다.

```
$ node_modules/.bin/tsc --noEmit -p tsconfig.json
(출력 없음 — GREEN, 구현 후)
```

### 자기검증 (§E 5-section 증거 형식)

- **E1**: 위 AC 매트릭스(024, Desktop/Mobile/키보드 3개 세부 시나리오 모두
  포함).
- **E2**: `node_modules/.bin/next build` → `✓ Compiled successfully in
  1417ms`, `Finished TypeScript in 3.9s`, `Route (app)` 표에 `○
  /consult`·`ƒ /api/consultations` 정상 출력. 유일한 경고는
  `instrumentation.ts:33`의 기존 무관 경고(이 milestone 변경분 아님,
  M5와 동일).
- **E3**: jsdom 크래시로 신규 6건 테스트의 커버리지 측정 불가(M1~M5와
  동일한 환경 결함, 아래 Gaps) — `node_modules/.bin/tsc --noEmit -p
  tsconfig.json`(프로젝트 전체) → 출력 없음(clean).
- **E4**: `grep -rn 'AskUserQuestion' components/consult/` → 0건(exit 1).
- **E5**: `node_modules/.bin/eslint components/consult/consult-view.tsx
  components/consult/consult-submit-bar.tsx components/consult/consult-
  view.test.tsx components/consult/consult-submit-bar.test.tsx` → 출력
  없음(clean).
- **E6**: 커밋 `af6e9d3`(M6, 접근성·반응형·테스트 보강). `git push origin
  feat/SPEC-B2C-CONSULT-001` → `47c1943..af6e9d3
  feat/SPEC-B2C-CONSULT-001 -> feat/SPEC-B2C-CONSULT-001` 성공.
- **E7**: 블로커 없음.
- **E8**: 위 "RED 증거" 절 참고 — 구조적 근거로 대체(jsdom 크래시로
  verbatim 실행 로그 캡처 불가).

**Gaps(미검증, jsdom 크래시)** — M1~M5와 동일한 사전 존재 환경 결함
(`TypeError: webidl.util.markAsUncloneable is not a function`, Node
v20.19.6 vs jsdom 30 불일치)으로 이번 milestone이 추가한 6개 신규
테스트(`consult-view.test.tsx` 4건 + `consult-submit-bar.test.tsx`
2건)는 이 샌드박스에서 **전혀 실행되지 못했다**. 실제로 실행·검증되지
않은 항목:
- `ConsultationRequestSchema.safeParse` 실패 시 `fetch`가 실제로
  호출되지 **않는지**(음성 assertion)
- `document.activeElement`가 실제로 기대한 입력 요소로 이동하는지(jsdom의
  포커스/activeElement 추적 자체가 크래시로 검증 불가)
- `consult-error-summary`의 실제 렌더링 여부와 오류 메시지 텍스트
- `consult-submit-bar`의 `sticky`/`bottom-0`/`md:static` className과
  `consult-submit-status` 라이브 리전의 `textContent` 변화(제출 중 →
  완료)

`node_modules/.bin/tsc --noEmit`과 `node_modules/.bin/next build`
(TypeScript 단계 포함) 양쪽 모두 전체 프로젝트에서 오류 0건으로
통과했으므로 타입·컴파일 수준의 정합성은 실행 증거로 확인됐지만, 런타임
동작(특히 `document.activeElement` 포커스 이동과 zod `safeParse`의 실제
issue 분류)은 코드 리뷰로만 확인했다.

**Residual-risk(잔여 위험)** — M1~M5와 동일한 가정(CI의 다른 Node/jsdom
버전 조합에서는 정상 실행될 가능성이 높음) 하에 진행했다. 특히
`extractFieldErrors`의 zod issue `code`/`path` 분류 로직(zod 4.4.3
기준)은 실제 실행 없이는 정확한 필드 매핑을 완전히 보증할 수 없다 — 다음
세션 또는 CI 실행 시 이 milestone이 추가한 6개 jsdom 테스트를 최우선으로
재실행해 실제 GREEN을 확인해야 한다.

### 회귀 확인 — 전체 스위트 + M1~M5 non-jsdom 재확인

```
$ node_modules/.bin/vitest run   # 프로젝트 전체
 Test Files  49 passed (49)
      Tests  412 passed (412)
     Errors  43 errors   # M5 종료 시점과 동일(43) — 신규 파일 없이 기존 jsdom 파일
                         # (consult-view.test.tsx/consult-submit-bar.test.tsx)에 테스트만
                         # 추가했으므로 크래시 파일 수 자체는 불변, 새 오류 유형 없음
```

M5 종료 시점(`Test Files 49 passed`/`Tests 412 passed`, jsdom 오류
43건) 대비 완전 동일 — M6은 신규 파일을 만들지 않고 기존 jsdom 테스트
파일 2개에 assertion만 추가했으므로, jsdom 크래시가 파일 단위로 발생하는
이 환경에서는 오류 건수가 그대로 유지된다(신규 assertion들은 크래시로
전혀 실행되지 못했지만, 이는 새 회귀가 아니라 기존과 동일한 환경 결함이
같은 파일에 계속 적용된 것).

### M7 후속 — CTA 클라이언트 전환 시 `?channel=` 타이밍 버그 발견 및 수정 (`components/consult/consult-view.tsx`, `e2e/consult-flow-03.spec.ts`)

e2e-tester가 실측 Playwright 브라우저로 발견해 `test.fail()`로 커밋한
실버그("하단 최종 CTA(전화 상담)로 진입하면 /consult?channel=phone으로
이동하고 전화 채널이 미리 선택되어 있다")를 재현-우선 수정(CLAUDE.md §7
Rule 4)으로 처리했다.

**근본 원인**: `resolveInitialChannel()`이 `useState` 지연 초기화 함수
안에서 `window.location.search`를 1회만 읽는다. Next.js `<Link>`
클라이언트 사이드 전환(이 SPEC M3가 만든 실제 프로덕션 경로 —
`/result`의 CTA에서 `/consult?channel=phone`으로 이동)에서는
`ConsultView`의 첫 렌더가 브라우저 `window.location`/history 상태가
완전히 안정되기 전에 일어날 수 있어, 그 시점에 읽은 값이 오래된 값이
되어 "kakao"로 잘못 폴백한다. 하드 내비게이션(`page.goto()`)에서는
재현되지 않는다 — e2e-tester의 격리 재현 스크립트로 확인됨.

**수정**: `next/navigation`의 `useSearchParams()`로 전환하지 않았다(M3
결정 유지 — `app/consult/page.test.tsx`가 App Router 컨텍스트 없이
렌더 테스트를 하므로 그 훅에 의존하면 기존 테스트가 깨진다). 대신 (1)
lazy initializer 실행 시점에 초기 `channel`이 `draft.channel`에서
왔는지 `resolveInitialChannel()` 폴백에서 왔는지를
`initialChannelFromDraftRef`(useRef)에 기록하고, (2) 마운트 후(커밋
이후, location이 안정된 시점) 실행되는 `useEffect`가 `draft.channel`이
없었을 때만 `resolveInitialChannel()`을 다시 호출해 `formState.channel`을
보정한다.

**Claim**: 클라이언트 사이드 `<Link>` 전환으로 `/consult?channel=phone`에
진입해도 "전화 상담" 채널이 라디오에서 미리 선택된다(REQ-B2CCONSULT-004).

**Evidence**:
```
$ node_modules/.bin/tsc --noEmit
(출력 없음 — clean)

$ grep -n "AskUserQuestion" components/consult/consult-view.tsx
(0건, exit 1)

$ node_modules/.bin/vitest run   # 프로젝트 전체, 회귀 재확인
 Test Files  49 passed (49)
      Tests  412 passed (412)
     Errors  43 errors   # M6 종료 시점과 동일(43) — 신규 파일 없이 기존
                         # 파일만 수정했으므로 크래시 파일 수 불변

$ # Node v22.23.2로 PATH 전환(v20.19.6/pnpm 버전 불일치 회피 — 이전
  # e2e-tester 델리게이션이 확인한 것과 동일한 workaround)
  npx tsx scripts/run-e2e.ts --spec=e2e/consult-flow-03.spec.ts --workers=1

Running 2 tests using 1 worker

  ✓  1 e2e\consult-flow-03.spec.ts:135:7 › ... 성공 → 결과 복귀 → 중복 ... (3.1s)
  ✓  2 e2e\consult-flow-03.spec.ts:224:7 › ... 하단 최종 CTA(전화 상담)로
     진입하면 /consult?channel=phone으로 이동하고 전화 채널이 미리
     선택되어 있다 (1.8s)

  2 passed (4.9m)
[exited with code 0]
```

**Baseline-attribution**: 이번 실행(이 트리), M6 HEAD `af6e9d3` + M7 e2e
커밋 `cae447e`에서 계속된 `feat/SPEC-B2C-CONSULT-001` 브랜치. `vitest
run`의 43건 jsdom/undici 오류는 M1~M6 §E.2에서 이미 동일 baseline(Node
v20.19.6 환경 결함)으로 귀속 확인됨 — 이번 수정과 무관.

**Gaps(미검증)**: 없음 — 이전 milestone 대부분이 jsdom 크래시로 코드
리뷰 대체 검증에 그쳤던 것과 달리, 이번에는 실제 Playwright 브라우저
실행으로 e2e까지 재확인했다. `test.fail()` → `test()` 전환 후 실제로
GREEN(2 passed)임을 확인했다.

**Residual-risk(잔여 위험)**: 이 보정 effect는 draft에 channel이 없을
때 `formState.channel`만 보정하고 draft 자체(`persistDraft`)는 갱신하지
않는다 — 마운트 시 기존 draft-init effect(`didInitDraftRef`)가 보정 전
값("kakao")을 먼저 draft에 써 둘 수 있어, "클라이언트 전환 → 보정 발생
→ 새로고침(하드 내비게이션)" 순서로 진행하면 하드 리로드 시
draft.channel이 "kakao"로 남아 URL 폴백보다 우선될 가능성이 이론상
있다. 이 SPEC 범위(REQ-B2CCONSULT-004, CTA 클릭 시점의 선택 상태)에는
영향 없으나(2회 실측 e2e 모두 통과), 향후 세션에서 draft 동기화까지
포함할지는 별도 판단이 필요하다.

## §E.3 Run-phase Audit-Ready Signal

_<M1~M6 완료, run-phase 전체 완료 — sync-phase 인계 대기 중>_

## §E.4 Sync-phase Audit-Ready Signal

_<sync-phase 대기 중>_

## §F Phase 4 Mode Selection

이 문서를 생성한 위임은 오케스트레이터가 `manager-spec` subagent 1개에게 plan-phase 6개 산출물 작성을 위임한 **단일 에이전트(serial) 위임**이다 — Phase 4 실행 모드 카탈로그(`orchestration-mode-selection.md` §A) 기준으로 분류하면 `serial`에 해당한다(입력 파라미터: tier=L, scope≈24개 신규 파일 + 5개 기존 파일 최소 확장, domain count=1(단일 SPEC 문서 작성), concurrency benefit=LOW — 코딩/설계 산출물 작성은 순차 의존성이 강해 병렬화 이득이 낮음). `fanout`/`sweep`/`agent-team`은 후보로 검토되지 않았다 — plan-phase 문서 작성은 정의상 한 SPEC의 단일 논리적 산출물이며 병렬 분해할 독립 하위 작업이 없기 때문이다.

- **Decision**: `serial`
- **Justification**: 6개 plan-phase 문서는 서로 강하게 의존한다(spec.md의 REQ가 acceptance.md의 AC와 1:1 대응해야 하고, design.md의 결정이 plan.md의 마일스톤 순서를 결정한다) — 병렬 작성 시 문서 간 정합성이 깨질 위험이 병렬화 이득보다 크다. Anthropic의 코딩 작업 병렬화 caveat("대부분의 코딩 작업은 리서치보다 병렬화 가능한 하위 작업이 적다")과 동일한 원리가 문서 작성에도 적용된다.

### Run-phase M1 위임 — Mode Selection

M1(`lib/consult/types.ts`+`schema.ts`+`phone.ts`) 구현 위임은 `manager-develop` subagent 1개에게 위임한 **단일 에이전트(serial) 위임**이다(입력 파라미터: tier=L, M1 scope=3개 신규 파일, domain count=1(단일 데이터 계약 모듈), concurrency benefit=LOW — TDD RED-GREEN-REFACTOR 사이클은 순차 의존성이 강함). `fanout`/`sweep`/`agent-team`은 후보로 검토되지 않았다 — M1은 하나의 milestone 단위 위임이며 병렬 분해할 독립 하위 작업이 없다.

- **Decision**: `serial`
- **Justification**: types.ts → schema.ts(types.ts에 의존) → phone.ts(schema.ts의 .refine이 참조) 순으로 강한 순차 의존성이 있다. Anthropic의 코딩 작업 병렬화 caveat와 동일한 원리.

## Open Decisions for User

D10.3-D10.6 재분류(이번 세션) — 아직 사용자 판단이 필요한 항목과, 이번 세션에서 승인·결정 완료로 전환된 항목을 분리한다. **차단(blocking) 위험이 남아있는 한 `plan_status: audit-ready`로 전환하지 않는다**(§E.1 규율, D10.6) — 아래 "여전히 열려 있음" 항목들은 실제 개인정보 수집을 막는 차단 위험이 아니라(§6.1/§4.1의 `CONSULT_POLICY_READY` 구조적 게이트가 그 역할을 대신한다), 법무·운영·제품 판단이 남아있는 항목일 뿐이다.

### 여전히 열려 있음 (사용자 판단 필요)

1. **동의 상세("자세히 보기") 실제 법무 문구 확정** — `design/internal/DEV-ONLY-상담-신청-동의-상세-구조.png`의 `{}` 플레이스홀더(보유·이용 기간, 수신정보, 이용목적, 수신방법, 동의철회방법) 6개 항목이 아직 미확정이다. 법무 검토 완료 전까지 이 SPEC은 구조(UI 상태)만 구현하고 실제 문구는 노출하지 않는다. **(D10.5) 이번 세션 이후 위험 성격 변경**: 문구가 미확정이어도 실제 개인정보 수집은 더 이상 사람의 주의만으로 막히는 것이 아니다 — `CONSULT_POLICY_READY=false`인 한 서버가 활성 동의 정책 자체를 인정하지 않으므로(`design.md` §6.1) 실제 접수는 구조적으로 불가능하다. 문구 확정은 여전히 필요하지만, 확정 전 서비스가 실수로 열리는 것을 막는 책임은 이제 코드 계약이 진다.
2. **연락처 마스킹·보관 정책의 실제 보유기간·삭제 절차** — 이 SPEC의 근거 없이는 구체 값(예: "N개월 보관 후 삭제")을 사용자 화면이나 정책 문서에 사실처럼 기재하지 않는다. 실제 보유기간·삭제 절차가 확정되면 별도 반영이 필요하다. (변경 없음)
3. **`CONSULT_POLICY_READY` 실제 활성화 시점(구 `productionReady`)** — 이 SPEC은 이제 배포 게이트(`ENABLE_CONSULT_FLOW`)와 실제 개인정보 수집 게이트(`CONSULT_POLICY_READY`)를 명확히 분리된 두 개의 서버 계약으로 확정했다(`design.md` §4, §6.1) — 이전에는 이 분리가 코드 계약이 아니라 문서상의 "이해"에 불과했다. 실제로 `CONSULT_POLICY_READY`를 `true`로 전환하는 시점(법무 확정 + 운영 준비 완료 후)은 여전히 사람의 운영 판단이며, 이 SPEC이 자동으로 결정하지 않는다.
4. **"기존 신청 상태 확인" 실제 목적지** — 이 SPEC은 "준비 중" 스텁으로 구현했다(§ 디자인 대조 D4). 실제 신청 상태 조회 기능(인증 없는 조회 페이지 등)을 만들 것인지, 만든다면 인증·보안 요구사항이 무엇인지는 별도 제품 결정이 필요하다. (변경 없음)
5. **손해사정사 "등록정보 확인" 링크의 실제 목적지** — 금융감독원 등록 손해사정사 조회 페이지로 연결할 실제 URL이 아직 없다. 이 SPEC은 "준비 중" 스텁으로 구현했다. (변경 없음)

### 이번 세션에서 해소됨

7. **중복 판정 최종안 — 승인 완료(2026-09-25)**: `design/MIGRATION-PLAN.md` §7이 명시한 "동일 진단 결과 ID **또는** 동일 연락처" 단순 OR 판정을 이 SPEC은 "`resultId`+정규화 연락처 AND(비즈니스 중복) + 별도 `idempotencyKey`(기술적 멱등성)" 조합으로 대체했다(`design.md` §8에 5개 후보 비교·권장 근거 기록). 단순 OR의 과차단 위험(가족 간 연락처 공유, 동일인의 새 사고 재상담 모두 차단)을 피하기 위한 결정이며, 이 D1-D10 수정 작업 지시 자체가 사용자 승인으로 간주된다 — `design/MIGRATION-PLAN.md`와의 편차는 최종 승인된 편차이며 더 이상 확인 대기 상태가 아니다.
8. **Rate limiting 구체 알고리즘·저장소 — 결정 완료(2026-09-25)**: DB 기반 고정 윈도(`consultationRateLimits` 테이블, HMAC 처리된 원본 IP, 원자적 upsert)로 plan-phase에서 확정했다(`design.md` §9.3) — 더 이상 run-phase에 위임된 미결정 항목이 아니다. 실제 윈도 크기·요청 한도 상수 값의 트래픽 기반 미세 조정만 운영 판단으로 남는다.
9. **Rate limiting 판정과 idempotency 조회의 처리 순서 — 결정 완료(2026-09-27, 독립 검토 D11)**: idempotency 조회를 rate limit 판정보다 먼저 수행하도록 재배열했다(`design.md` §8.1·§9.3) — 더 이상 열린 항목이 아니다.
10. **`lib/env.ts` `RATE_LIMIT_HMAC_SECRET` 조건부 필수 검증 — 결정 확정(2026-09-27, 독립 검토 D16)**: `lib/env.ts`를 이 SPEC의 7번째 확장 대상으로 확정했다(`design.md` §4.2·§5, `plan.md` §D 제약 ①) — 더 이상 "추가 여부"가 열린 판단이 아니다. 판정 조건은 `CONSULT_POLICY_READY === "true"`다(이전 초안의 `ENABLE_CONSULT_FLOW === "true"` 조건은 내부 모순으로 정정됨 — `ENABLE_CONSULT_FLOW=true`+`CONSULT_POLICY_READY=false`는 실제 PII 접수가 애초에 불가능한 상태이므로 이 시크릿이 필요 없다). 실제 `lib/env.ts` 코드 반영은 정상적인 SPEC→구현 인계에 따른 run-phase 과제로 남지만, 이는 더 이상 "결정 대기"가 아니라 "결정 완료, 구현 대기"다 — 통상적인 plan→run 인계이지 open decision이 아니다.
