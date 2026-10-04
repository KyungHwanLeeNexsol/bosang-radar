# 재개 안내: B2C 공개 전 plan-phase (2026-10-04 정렬 교정 이후 시점)

이 문서는 작업을 다른 PC에서 이어 하기 위한 인수인계 기록이다. 로컬 자동 메모리는 다른 PC에 없으므로 이어서 할 정보는 모두 저장소 안에 둔다.
기준 커밋은 `main@99993bf`이고, 이 브랜치(`plan/b2c-launch-readiness`)는 문서만 추가했다. 응용 코드·설정·워크플로·운영 환경은 바꾸지 않았다.

## 1. 한 줄 요약

"화면·상담 API 배포 완료"(다크 런치: 플래그가 꺼진 상태로 배포됨)와 "일반 사용자 대상 서비스 출시 가능"은 다른 상태다. 앞의 것은 참이고 뒤의 것은 거짓이다. 일반 공개 전에 필요한 일을 세 개의 plan-phase SPEC 초안으로 나눠 작성했다. 2026-10-02에 작성, 2026-10-03에 (a) LAUNCH-001 1회차 감사, (b) 세 SPEC에 걸친 사용자 결정 대상 32개 ID를 검토 — ENGINE 10/11건·LAUNCH 9/9건 결정, OPS는 12건 중 다수가 조건부·부분 결정이거나 하위 확인(SLA 4항목, D-OPS-04 요소별 채널 등) 대기로 남음 —, (c) 사용자가 직접 검토해 지시한 2차 정밀 교정(결함 분리·요소별화·AND-게이트·review-3 결함 수정 등 11건), (d) 같은 날 사용자가 직접 검토해 지시한 3차 정밀 교정(감사 이력 경로 정정, LAUNCH-001 단계 모델·L-08 표면별 분리, CONSULTOPS-001 N-1 구조 보강·D-OPS-10 AC 보강, 현재형 표현 정정)까지 끝났고, (e) 2026-10-04 정렬 교정 5건(CONSULTOPS AC-016 롤백/삭제 분리, LAUNCH 로컬 시험 적용 조건의 점검기 계약화, CONSULTOPS 증거 대상 값 검증 정렬, LAUNCH 감사 범위 기록 정정, 이 문서의 재개 순서·원격 상태)을 반영했다. 실행(run-phase), 운영 DB 쓰기, 운영 플래그 변경, main 병합은 여전히 하지 않았다.

## 2. 코드로 확인한 사실 (main@99993bf)

| 사실 | 근거 |
|---|---|
| 02 결과는 골절 사례 fixture 한 가지뿐이다. 리뷰 플래그가 켜져 있고 01 입력이 fixture 문장과 정확히 같을 때만 나온다. 그 외 입력은 `result-none` 또는 `error`다. | `components/diagnosis/step-loading.tsx:54-62`, `lib/diagnosis/fixtures/fracture-case.ts:14,209-229` |
| 실제 담보 매칭 엔진, 약관·상품 데이터, 결과 저장소는 없다. `lib/pipeline/`은 B2B 잔재이고 B2C 코드가 쓰지 않는다. | 증거 문서 §A |
| 진단 동의 상세 문구 6개는 자리표시자다. 상담 동의 상세도 "아직 확정되지 않았습니다" 안내문이다. | `components/diagnosis/consent-detail-content.tsx:13-18`, `components/consult/consult-consent-group.tsx:68` |
| `deploy.yml`은 `/` 응답에 "서비스 준비 중입니다"가 없으면 배포를 실패 처리한다. 진단 게이트가 열리면 깨진다. | `.github/workflows/deploy.yml:96-101`, `lib/diagnosis/flags.ts` |
| 상담 접수 API에는 인증·Origin·CSRF 검사가 없고 `ENABLE_CONSULT_FLOW`도 읽지 않는다. `CONSULT_POLICY_READY=true`와 시크릿만으로 접수가 열린다. | `app/api/consultations/route.ts` (검색 0건), `app/api/` 전체 |
| `RATE_LIMIT_HMAC_SECRET`이 없고 `CONSULT_POLICY_READY=true`이면 앱이 부팅 중 종료한다. | `lib/env.ts:138-145` |
| `deploy.yml`은 main에 푸시할 때마다 배포하고 `pm2 restart`만 쓴다(`--update-env` 없음). 환경값 재읽기는 검증된 적이 없다. | `deploy.yml:3-7,61` |
| 01·02 푸터 링크는 `href="#"`이고 03 푸터는 비활성(`aria-disabled`, "준비 중")이다. | `components/diagnosis/diagnosis-footer.tsx:29`, `components/result/result-footer.tsx:35`, `components/consult/consult-footer.tsx` |
| 운영 플래그 5개는 2026-10-02 병합 **전**에 모두 unset으로 관측됐다. 병합 후 운영 상태는 관측하지 못했다. | CONSULT-001 `progress.md:4081,4155` |

## 3. 산출물·결정·감사 상태 (2026-10-03 갱신)

| SPEC | 범위 | 사용자 결정 | 감사 상태 |
|---|---|---|---|
| `SPEC-B2C-ENGINE-001` (Tier L, REQ/AC 25/25) | 실제 진단·담보 매칭·결과 데이터 | 10/11 결정 완료(D-ENGINE-07은 법무 문구 작성 전까지 미완). D-ENGINE-03은 **추천과 다르게** 6개 진단 대상 유형 전부로 확정 | 3회차 PASS 0.857(기준 0.85)은 **2026-10-02 스냅샷**(결정 반영 전) 기준이다. 2026-10-03 결정 기록 + 2차 정밀 교정(D29/D30/D32/D33 수정 포함)은 **재감사 전** — 이 PASS를 새 내용에 그대로 적용하지 말 것 |
| `SPEC-B2C-CONSULTOPS-001` (Tier M, 16/16) | 상담 활성화 준비(문구·창구·시크릿·PM2·검증·되돌리기) | 12/12 결정 완료(D-OPS-01 Q1, D-OPS-07/08 세부는 외부 확인 대기). D-OPS-10 처분 대상·D-OPS-04 요소별 목적지로 정교화됨 | 3회차 PASS 0.82(기준 0.80)도 **2026-10-02 스냅샷** 기준. N-1·N-2 수정 포함 2차 정밀 교정은 재감사 전 |
| `SPEC-B2C-LAUNCH-001` (Tier M, 16/16) | 공개 게이트, 단계 정의, 플래그 순서, `deploy.yml` smoke 교체, 되돌리기 | 9/9 결정 완료 | 1회차 PASS 0.88(기준 0.80, 2026-10-03)은 **사용자 결정 반영 전 상태** 기준이다(보고서 커밋 `643dec1`이 결정 반영 커밋 `c89dae7`보다 앞서고 보고서도 D-LAUNCH 결정 미정을 적었다. 정확한 피감사 SHA는 미확인). 결정 반영(`c89dae7`)·D-LAUNCH-07 사유 2종 추가 등 2차 정밀 교정·이후 교정은 재감사 전 |

**세 SPEC 모두 "감사 PASS"와 "현재 문서 내용"이 가리키는 스냅샷이 다르다.** 재감사 전까지 어느 PASS도 2026-10-03 최종 내용을 검증한 것으로 인용하지 말 것.

### 2026-10-02 감사에서 닫히지 않았던 부채 — 전부 해소됨(2026-10-03 2차 정밀 교정)
- ENGINE review-3 D29(정의 없는 "정의된 거절 결과" → REQ-020에 정의 추가)·D30(grep이 bracket·JSON-key 형태 누락 → 패턴 수정, 양성/음성 샘플로 재검증)·D32·D33 — `acceptance.md`·`plan.md`에서 수정, 커밋 `ecfaba9`.
- CONSULTOPS review-3 N-1(증거 기록 제외 규칙을 검증하는 AC 없음 → AC-001/002에 fixture 추가)·N-2("최소"/"빼거나" 표현 불일치 → "빼거나" 옵션 제거) — 커밋 `7754ef8`.
- N-3~N-11(선택 사항)은 손대지 않음 — 범위 밖.

### 사용자 결정 대상 32개 ID 검토 (2026-10-03) — ENGINE 10/11·LAUNCH 9/9 결정, OPS는 조건부·하위 확인 대기 포함 12건
- ENGINE D-ENGINE-01~11(11건 중 10건 결정, D-ENGINE-07은 법무 작성 대기), CONSULTOPS D-OPS-01~12(12건, 일부 세부는 외부 확인 대기), LAUNCH D-LAUNCH-01~09(9건) — 전부 각 SPEC `progress.md`에 "**결정 (2026-10-03, 사용자 인터뷰)**" 기록으로 남아 있다.
- 2026-10-03 같은 날, 사용자가 기록된 결정을 직접 검토하고 11건의 정밀 교정을 지시 — 선택 자체는 그대로 두고 분리·구체화·추가 게이트만 반영(아래 §4-0).

### 그래도 남아있는 것 — 사람이 직접 확인해야 하는 외부 항목
- **법무**: D-ENGINE-07(진단 동의 문구 6개), D-ENGINE-10 면책 문구 검토, D-OPS-01 Q1(상담 문구 작성 주체)
- **운영**: D-OPS-03 SLA 4항목(담당자·조회빈도·부재대체·실제처리가능성 — 미확인 시 E-12/E-13·상담 일반공개 BLOCKED), D-OPS-04 6개 요소 전부 미확인(그중 4개는 채널 없어도 요소 제거 금지), D-OPS-07/08(시크릿 보관 위치는 PM2 재시작 전략 실제 관측 후)
- **엔지니어링+도메인 전문가**: D-ENGINE-09 정확도 수치(이 SPEC이 정하지 않음), D-ENGINE-05 만료 유무(b-1/b-2) + CONSULT-001 REQ-009·019 정합성, D-ENGINE-02의 6개 유형 확대된 규칙표 작성·검수 부담
- `[NEEDS CLARIFICATION]` 마커: ENGINE 8(spec.md)+3(design.md), CONSULTOPS 8, LAUNCH 11 — 32건 결정으로 일부는 좁혀졌으나(N2/N3/N5/N11 등) **완전히 닫힌 건 없음**. 각 SPEC `spec.md`에 "해결 상태 (2026-10-03)" 메모로 현황이 남아 있다.

## 4. 다음에 할 일 (우선순위 순서)

0. **(완료, 참고용)** 2026-10-03에 끝낸 일 — LAUNCH-001 1회차 감사(PASS 0.88) → 사용자 결정 32개 ID 인터뷰(ENGINE 10/11·LAUNCH 9/9 결정, OPS는 조건부·하위 확인 대기 포함 12건) → 2차 정밀 교정 11건(D-OPS-10 분리, D-OPS-04 요소별화, D-LAUNCH-07 사유 추가, D-ENGINE-03 유형별 AND-게이트+용어 수정, D-OPS-03 SLA 차단, D-ENGINE-11 생산준비 게이트, D-ENGINE-05/07·D-OPS-01/07/08 미완료 플래그 유지, D-LAUNCH-01/02/03 일관성, review-3 결함 수정, 진행문서 HEAD 동기화) → 3차 정밀 교정(사용자 직접 검토 지시 — 아래 1번의 감사 이력 경로 정정, LAUNCH-001 단계 모델·L-08 표면별 분리, CONSULTOPS-001 N-1 구조 보강·D-OPS-10 AC 보강, 현재형 표현 정정).
**재개 순서(이 순서로만 진행한다)**: ① 외부 확인·계획 마무리(아래 1·2) → ② Implementation Kickoff Approval(아래 3) → ③ `/moai run` Phase 1 Plan Audit Gate(아래 4) → ④ 구현(아래 5). Phase 1 Plan Audit Gate는 승인 **뒤** `/moai run`이 시작될 때 도는 run-phase 게이트이며, 승인 앞에서 거치는 단계가 아니다. **[§10에서 정정·대체: "① 외부 확인·계획 마무리"를 외부 항목 전부의 처리로 읽지 않는다 — 착수 전에는 LAUNCH STOP 처리와 [K] 항목을 확인하고 나머지 외부 항목은 각 차단 시점까지 관리한다. 원문은 보존한다]**

1. **(① 계획 마무리 — plan-phase 재감사 경로) 세 SPEC의 재감사 경로는 SPEC마다 다르다**(`spec-workflow.md`의 plan-auditor 3회 상한 + Retry Loop Contract 참조). 1·2·3차 교정으로 세 SPEC 모두 `acceptance.md`를 포함한 실질 내용이 바뀌었으므로, 아래 어느 경로에서도 기존 PASS 점수를 현재 HEAD의 PASS로 선언하지 않는다. 이 세션은 감사 보고서나 점수를 새로 만들어 내지 않았다 — 아래는 기존 `progress.md` §G 기록과 `spec-workflow.md` 규칙을 그대로 적용한 경로 판단이다.
   - **ENGINE-001**: 이미 plan-auditor 3회(FAIL 0.726 → FAIL 0.807 → PASS 0.857, iteration 3/3) 소진, PASS-with-debt로 종료됨(`progress.md` §G). **새 plan-auditor iteration(4회차 등)을 시작하지 않는다** — 처리 경로는 PASS-with-debt 유지(이번 교정을 debt 해소 기록으로만 남김) 또는 범위 축소 또는 사용자의 명시적 예외 승인 중 하나이며, 이 세션은 PASS-with-debt 유지를 전제로 한다.
   - **CONSULTOPS-001**: 이미 plan-auditor 3회(FAIL 0.7245 → FAIL 0.7576 → PASS 0.82 knife-edge, iteration 3/3) 소진, PASS-with-debt로 종료됨(`progress.md` §G). ENGINE-001과 같은 이유로 **새 plan-auditor iteration을 시작하지 않는다.**
   - **LAUNCH-001**: plan-auditor 1회(PASS 0.88, iteration 1/3, `progress.md` §G)만 거쳤으므로 **3회 상한 안에서 2회차 재감사가 가능하다** — ENGINE-001·CONSULTOPS-001과 처리 경로가 다른 유일한 SPEC이다.
   - plan-phase 재감사(LAUNCH-001의 2회차)와 별개로, 세 SPEC 모두 Implementation Kickoff Approval 뒤 `/moai run`에 진입하면 Phase 1 Plan Audit Gate가 **artifact-hash 변경**(이번 교정이 spec.md·plan.md·acceptance.md를 바꿈)을 감지해 자동으로 재실행된다(아래 4번) — 이는 plan-phase 3회 상한과는 별도의, run-phase 진입 시점의 독립된 게이트다(`spec-workflow.md` § Phase 1 Plan Audit Gate).
2. **(① 외부 확인)** 위 §3 "그래도 남아있는 것" 목록을 법무·운영·엔지니어링·도메인 전문가에게 전달해 실제 확인을 받는다(AskUserQuestion으로는 풀 수 없는 항목들). 이 plan 브랜치의 PR을 만들지, 계속 직접 push로 이어갈지는 순서와 무관한 별도 결정이다.
3. **(② Implementation Kickoff Approval)** 위 1~2(외부 확인·계획 마무리)가 끝난 뒤에만 이 승인 게이트에 들어간다. 이 승인 전에는 `/moai run`을 포함해 run-phase를 시작하지 않는다. **[§10에서 정정: 승인 전에 끝나야 하는 것은 LAUNCH STOP 처리와 [K] 항목이며, 위 1~2의 외부 확인 전부가 아니다]**
4. **(③ `/moai run` Phase 1 Plan Audit Gate)** 승인 뒤 `/moai run SPEC-XXX`에 진입할 때 자동으로 실행된다. ENGINE-001·CONSULTOPS-001은 plan-auditor 3회 소진·PASS-with-debt 이력을 그대로 유지하며, 이 게이트는 그 이력에 새 plan-phase iteration을 더하지 않는다. LAUNCH-001만 plan-phase에서 상한 안의 2회차 감사를 승인 전에(1번 경로) 받을 수 있고, 받지 않으면 이 게이트가 artifact-hash 변경을 감지해 재실행한다. 어느 경우에도 기존 PASS 점수를 현재 내용의 PASS로 선언하지 않는다.
5. **(④ 구현)** Phase 1 Plan Audit Gate를 통과한 뒤 SPEC별 마일스톤(M1~) 순서로 구현한다.

## 5. 이어 할 때 주의할 점

- 이 브랜치(`plan/b2c-launch-readiness`)는 2026-10-02에 사용자 승인을 받아 `git push -u origin plan/b2c-launch-readiness`로 원격에 올렸고, **원격 `origin/plan/b2c-launch-readiness`에는 `0553039`까지(3차 정밀 교정과 RESUME 3차 갱신 포함) 올라가 있다.** 2026-10-04에 `git fetch origin plan/b2c-launch-readiness` 뒤 `git rev-parse --short origin/plan/b2c-launch-readiness` → `0553039`, 이 worktree의 기준 HEAD와 `git rev-list --count --left-right origin/plan/b2c-launch-readiness...HEAD` → `0 0`으로 확인했다. 2026-10-04 정렬 교정 커밋(이 문서 갱신 포함)은 `0553039` 위에 쌓은 **로컬 커밋이며 push하지 않았다** — push 여부는 별도 확인 사항이다(`git push origin plan/b2c-launch-readiness`, force 없음). PR은 아직 만들지 않았고 main은 바뀌지 않았다. 다른 PC에서는 `git fetch origin` 뒤 `git switch plan/b2c-launch-readiness`로 가져오며, 정렬 교정 커밋은 push하기 전에는 다른 PC에 없다.
- **worktree·공유 plan 브랜치 사용은 `spec-workflow.md` § SPEC Phase Discipline의 기본 안내에서 벗어난 선택이다.** 그 문서의 Route A(Tier S/M 기본, main 직접) / Route B(Tier L 또는 `--pr`, SPEC별 `plan/SPEC-XXX` 브랜치)는 모두 "Step 1(plan)은 메인 체크아웃에서 실행, 이 단계에서 worktree 없음"을 명시한다. 이 작업은 2026-10-02부터 `.claude/worktrees/launch-readiness`라는 **격리된 worktree**에서, 그리고 Route A/B 어느 쪽에도 해당하지 않는 **ENGINE·CONSULTOPS·LAUNCH 세 SPEC이 공유하는 한 brach(`plan/b2c-launch-readiness`)**에서 진행됐다. 이렇게 한 이유는 2026-10-02 세션이 메인 체크아웃을 건드리지 않고 세 SPEC을 함께 다루기로 사용자 승인을 받았기 때문이며(§1), 세 SPEC이 서로를 많이 참조해 한 브랜치로 묶는 쪽이 교차 참조 정합성을 지키기 쉬웠다. **이후 정규 경로로 복귀하려면**: run-phase 진입 전에 각 SPEC을 `plan/SPEC-XXX` 개별 브랜치로 분리해 Route B의 plan PR 3건으로 올리거나(엄격 준수), 또는 이 공유 브랜치 전체를 하나의 plan PR로 올려 사용자가 명시적으로 승인한 예외로 기록하고 넘어가는 두 가지 선택지가 있다 — 어느 쪽도 이 세션이 임의로 정하지 않았고, 기존 이력(커밋)을 다시 쓰지 않는다. Implementation Kickoff Approval은 이 선택과 무관하게 §4의 재감사·외부 확인이 끝난 뒤에만 유효하다. **[§10에서 정정: "외부 확인"은 [K] 항목과 LAUNCH STOP 처리를 뜻하며 외부 항목 전부가 아니다]**
- 이 저장소는 공개(PUBLIC)다. SPEC·감사 보고서·증거 문서에 비밀값, 실제 사용자 연락처, 운영 서버 주소, 담당자 연락처, 법적 판단 내용을 넣지 않는다. 2026-10-03 교정에서도 다시 점검했고 해당 항목은 없었다.
- 한 번에 쓰기 에이전트를 하나만 돌린다. 감사자와 작성자를 동시에 돌리지 않는다. 2026-10-03 교정은 ENGINE·CONSULTOPS를 먼저 병렬로(서로 다른 SPEC 디렉터리, 파일 겹침 없음), LAUNCH-001은 CONSULTOPS의 D-OPS-04·D-OPS-12 최종 내용에 의존해 CONSULTOPS 완료 후 순차로 돌렸다.
- `moai` CLI가 PATH에 없는 환경이면 `moai spec lint`와 세션 목록 점검을 못 한다. 이번 세션의 모든 감사·교정은 Claude 단독이었고 다중 모델 합의는 쓰지 않았다.
- 증거 문서(`evidence-pack-20261002.md`)는 Explore 에이전트 보고를 정리한 것이다. 인용한 줄 번호는 SPEC에 쓰기 전에 직접 다시 읽어서 확인해야 한다. 이 문서의 알려진 오류는 LAUNCH-001 `progress.md` §2에 정리되어 있다.
- SPEC ID 스키마 정규식(`^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$`)은 선례 `SPEC-B2C-CONSULT-001` 형식과 글자 그대로는 맞지 않는다. 선례 형식을 따랐고 불일치를 각 SPEC `progress.md`에 기록했다.

## 6. 파일 위치

- SPEC: `.moai/specs/SPEC-B2C-ENGINE-001/`, `.moai/specs/SPEC-B2C-CONSULTOPS-001/`, `.moai/specs/SPEC-B2C-LAUNCH-001/`
- 감사 보고서: `.moai/reports/plan-audit/SPEC-B2C-ENGINE-001-review-{1,2,3}.md`, `SPEC-B2C-CONSULTOPS-001-review-{1,2,3}.md`, `SPEC-B2C-LAUNCH-001-review-1.md`
- 증거 문서: `.moai/reports/b2c-launch-readiness/evidence-pack-20261002.md`
- 2026-10-03 커밋(결정 기록 → 2차 정밀 교정 → 3차 정밀 교정 순): `c89dae7`(LAUNCH 결정)·`4415e82`(CONSULTOPS 결정)·`0701e2d`(ENGINE 결정)·`7754ef8`(CONSULTOPS 2차 교정)·`ecfaba9`(ENGINE 2차 교정)·`7916728`(LAUNCH 2차 교정)·`5544267`(RESUME 2차 갱신)·`9a586eb`(LAUNCH 3차 교정)·`cc9d33c`(CONSULTOPS 3차 교정)·`0553039`(RESUME 3차 갱신, 원격 도달 확인 지점). 2026-10-04 정렬 교정 커밋은 `0553039` 위의 로컬 커밋(push 전)이다

## 7. 재개 메시지 [SUPERSEDED by §9 갱신 재개 메시지 — 아래 블록은 LAUNCH 2회차 감사 전 상태 기준이라 "LAUNCH-001만 2회차 가능" 서술이 낡았다. 기록으로 보존한다]

```text
✂──── 여기부터 복사 ────✂

ultrathink. 세 SPEC(ENGINE-001·CONSULTOPS-001·LAUNCH-001) plan-phase 마무리 진입.
applied lessons: bosang-radar-tooling-gotchas, feedback-manager-spec-history-commit-claim
source_session_id: <not-available — environment-fallback>

전제 검증:
1) git branch --show-current → plan/b2c-launch-readiness (또는 worktree 안이면 같은 브랜치)
2) git rev-parse --short origin/plan/b2c-launch-readiness → 0553039 이상(원격에 0553039까지 존재), git log -1 --format='%h' → 0553039 이후(정렬 교정 커밋이 push 전이면 로컬에만 있음)
3) grep -c "PASS-with-debt로 종료" .moai/specs/SPEC-B2C-{ENGINE,CONSULTOPS}-001/progress.md → 둘 다 1 이상(이미 3회 소진 상태 확인)

실행: .moai/reports/b2c-launch-readiness/RESUME.md §4 순서를 따른다 — ① 외부 확인·계획 마무리(§3 "그래도 남아있는 것"을 법무·운영·엔지니어링에 전달, LAUNCH-001만 plan-auditor 2회차 재감사 가능(3회 상한 안), ENGINE-001·CONSULTOPS-001은 3회 소진·PASS-with-debt 이력을 유지하고 새 plan-auditor iteration을 시작하지 않음) → ② Implementation Kickoff Approval → ③ /moai run Phase 1 Plan Audit Gate(승인 뒤 run 진입 시 실행, artifact-hash 재검증) → ④ 구현

후속: 구현이 끝나면 SPEC별 /moai sync

✂──── 여기까지 복사 ────✂
```

## 8. 후속 기록 (2026-10-04, `3c56b47` 기준)

앞 절의 기록은 그대로 두고, 이후 확인된 사실만 덧붙인다.

- **원격 반영 확인**: §5·§6이 "정렬 교정 커밋은 push 전 로컬 커밋"이라고 적은 것은 그 시점의 기록이다. 이후 `git push origin plan/b2c-launch-readiness`(force 없음)로 `0553039..3c56b47`이 올라갔다. `git ls-remote origin refs/heads/plan/b2c-launch-readiness`가 `3c56b47`을 가리키고, `git fetch` 뒤 `git rev-list --count --left-right origin/plan/b2c-launch-readiness...HEAD`가 `0 0`임을 확인했다. 정렬 교정 커밋 3건(`dc72040`·`c071d3c`·`3c56b47`)은 원격에 있다. 이 절을 담은 커밋은 새 로컬 커밋이며 push 전이다.
- **LAUNCH-001 2회차 감사**: `3c56b47` 기준 **FAIL 0.75**(기준 0.80), STOP 신호다(1회차 0.88보다 낮다. 다만 1회차는 결정 반영 전 상태를 감사해 두 점수는 서로 다른 내용을 잰다). 차단 결함 4건·선택 결함 11건이며 보고서는 `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-2.md`(저장소 무시 규칙이 걸린 경로라 `git add -f`로 추적한다)다. §4 1번의 "LAUNCH-001만 2회차 가능"은 이 감사로 사용했고, 3회차는 무조건 진행하지 않으며 사용자가 범위 축소·PASS-with-debt·명시적 예외 중 정한 뒤에만 한다. ENGINE-001·CONSULTOPS-001은 3회 소진·PASS-with-debt 이력이 그대로이고 새 plan-auditor iteration을 시작하지 않았다.
- **외부 확인 항목 정리**: `.moai/reports/b2c-launch-readiness/external-confirmations-20261004.md`에 SPEC별 확인 대상·담당 역할·필요한 증거·차단 단계를 정리했다. §3 "그래도 남아있는 것"의 역할 귀속 오류와 누락 항목의 정오표, 감사 잔여 중 사용자 결정이 필요한 것도 그 문서에 있다.
- **현재 위치**: §4 순서 ①(외부 확인·계획 마무리) 진행 중이다. Implementation Kickoff Approval은 받지 않았고 `/moai run`은 시작하지 않았다. 운영 DB·플래그 변경과 main 병합은 하지 않았다.

## 9. 후속 기록 2 (2026-10-04, `b6ee43a` 기준 5차 수정안)

앞 절의 기록은 그대로 두고, 이후 확인된 사실과 정정만 덧붙인다.

- **원격 반영**: §8의 "이 절을 담은 커밋은 새 로컬 커밋이며 push 전이다"는 그 시점의 기록이다. 이후 `git push origin plan/b2c-launch-readiness`(force 없음)로 `3c56b47..b6ee43a`가 올라갔고, `git ls-remote`가 `b6ee43a`를 가리키며 `git rev-list --count --left-right origin/plan/b2c-launch-readiness...HEAD`가 `0 0`임을 확인했다. 5차 수정안은 이 절을 쓰는 시점에 **커밋·push 전의 작업 트리 변경**이다.
- **현재 상태**: LAUNCH-001 plan-auditor 2회차는 FAIL 0.75(기준 0.80), STOP 신호다(`.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-2.md`). **STOP 상태를 유지한다 — 3회차 감사와 run을 시작하지 않았다.** 5차 수정안이 차단 결함 D-01~D-04에 대응했으나 재감사를 받지 않았다(`.moai/specs/SPEC-B2C-LAUNCH-001/progress.md` "5차 수정안 기록"). ENGINE-001·CONSULTOPS-001은 3회 소진·PASS-with-debt 이력이 그대로이고 새 plan-auditor iteration을 시작하지 않았다.
- **정정**: §1과 §4-0의 "선택 자체는 그대로 두고 분리·구체화·추가 게이트만 반영"은 D-LAUNCH-07에 대해 이력과 맞지 않았다 — 2026-10-03 2차 정밀 교정(`7916728`)이 D-LAUNCH-07 결정 기록 문장을 "진단 표면 전용 사유는 추가하지 않는다"(`c89dae7`)에서 "2종을 더한다"로 바꿨다. §3 표의 LAUNCH "9/9 결정 완료"도 같은 뜻으로 읽어야 한다. 5차 수정안이 결정 문장을 원문으로 복원했고(아홉 건 모두 `c89dae7`과 같음을 대조) 사유 2종은 사용자 확인 대기인 후속 변경안으로 분리했다. 그 변경을 사용자가 지시했다는 근거는 이 문서(§1·§4-0)의 2차 기록뿐이며 원 지시문과 결정 주체는 확인하지 못했다.
- **미확정 사용자 결정**: (1) D-LAUNCH-07 진단 전용 사유 2종 확정 여부, (2) 01·02 푸터 요소별 목적지 기록의 소유(N5), (3) 로컬 시험 판정의 I 서명 필요 여부와 서명자 구성 — 이상 확인 대기. (4) D-LAUNCH-05 (a) 결과로 로컬 첫 진단 시험에도 R-02·R-03과 L-02·L-06·L-07·L-09 등이 필수가 되는 것, (5) `local`로 단계를 점검하는 입력의 거부 규칙 — 이상 확인 권장. 상세는 LAUNCH `progress.md` "5차 수정안 기록"과 `external-confirmations-20261004.md` §6.
- **Kickoff 전제**: 각 SPEC `plan.md` §C Pre-flight는 6항목이고 `b6ee43a` 기준 체크 상태는 ENGINE 0/6, CONSULTOPS 1/6, LAUNCH 0/6이다(여기에는 "plan-auditor PASS와 Implementation Kickoff Approval 완료"가 들어 있다). 결정 기록이 존재한다는 사실만으로 Kickoff 전제가 충족됐다고 보지 않는다.
- **재개 순서(갱신, §4와 같은 순서) [§10 재개 순서로 대체 — "① 외부 확인·계획 마무리"가 외부 항목 전부의 처리로 읽혀 낡았다. 기록으로 보존한다]**: ① 외부 확인·계획 마무리 — `external-confirmations-20261004.md`의 항목과 위 미확정 사용자 결정을 처리하고, LAUNCH STOP 신호의 처리 방식(범위 축소 방향의 5차 수정안 확인, PASS-with-debt 수용, 사용자의 명시적 예외로 3회차)은 사용자가 정한다 → ② Implementation Kickoff Approval → ③ `/moai run` Phase 1 Plan Audit Gate(artifact-hash 재검증) → ④ 구현.

### 갱신 재개 메시지 [SUPERSEDED by §10 갱신 재개 메시지 — 아래 블록의 "① 외부 확인·계획 마무리"가 외부 항목과 미확정 결정 전부의 처리로 읽혀 낡았다. 기록으로 보존한다] (§7을 대체, 새 세션에 그대로 붙여넣기)

```text
✂──── 여기부터 복사 ────✂

ultrathink. 세 SPEC(ENGINE-001·CONSULTOPS-001·LAUNCH-001) plan-phase 마무리 이어서 진행 — LAUNCH 2회차 FAIL(STOP) 상태.
applied lessons: bosang-radar-tooling-gotchas, feedback-manager-spec-history-commit-claim
source_session_id: <not-available — environment-fallback>

전제 검증:
1) git branch --show-current → plan/b2c-launch-readiness (또는 worktree 안이면 같은 브랜치)
2) git ls-remote origin refs/heads/plan/b2c-launch-readiness → b6ee43a 이상, git status --short → 5차 수정안 변경 여부 확인
3) grep -c "PASS-with-debt로 종료" .moai/specs/SPEC-B2C-{ENGINE,CONSULTOPS}-001/progress.md → 둘 다 1 이상, grep -c "FAIL — STOP" .moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-2.md → 1 이상

실행: .moai/reports/b2c-launch-readiness/RESUME.md §9의 재개 순서를 따른다 — ① 외부 확인·계획 마무리(external-confirmations-20261004.md, 미확정 사용자 결정 5건, LAUNCH STOP 처리 방식은 사용자가 정한다 — 그 선택 전에는 3회차 감사를 시작하지 않는다, ENGINE-001·CONSULTOPS-001은 3회 소진·PASS-with-debt 이력 유지) → ② Implementation Kickoff Approval → ③ /moai run Phase 1 Plan Audit Gate → ④ 구현

후속: 구현이 끝나면 SPEC별 /moai sync

✂──── 여기까지 복사 ────✂
```

## 10. 후속 기록 3 (2026-10-04, `a0e0ee2` 기준 6차 교정)

앞 절의 기록은 그대로 두고, 이후 확인된 사실과 정정, 현재 안내만 덧붙인다. §4의 재개 순서와 3번, §5의 마지막 문장, §9의 재개 순서와 복사용 메시지는 보존하되 아래 정정과 현재 안내가 대체한다.

- **원격 반영**: §9의 "5차 수정안은 이 절을 쓰는 시점에 커밋·push 전의 작업 트리 변경이다"는 그 시점의 기록이다. 이후 `git push origin plan/b2c-launch-readiness`(force 없음)로 `b6ee43a..a0e0ee2`(`26a8d3e`·`a0e0ee2`)가 올라갔고, 6차 교정을 시작하기 전에 `git ls-remote`가 `a0e0ee2`를 가리키고 `git rev-list --count --left-right origin/plan/b2c-launch-readiness...HEAD`가 `0 0`임을 확인했다. 6차 교정은 이 절을 쓰는 시점에 **커밋·push 전의 작업 트리 변경**이며, 그 커밋 SHA는 이 문서가 자기 SHA를 적을 수 없으므로 커밋 뒤 보고에 둔다.
- **현재 상태**: LAUNCH-001 plan-auditor 2회차 **FAIL 0.75(기준 0.80)·STOP이 공식 감사 결과로 그대로**다(`.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-2.md`). 5차 수정안과 6차 교정은 재감사를 받지 않았고 문서 교정은 감사 PASS가 아니다. 3회차 감사와 `/moai run`은 시작하지 않았고, 사용자가 STOP 처리를 정하기 전에는 시작하지 않는다. ENGINE-001·CONSULTOPS-001은 3회 소진·PASS-with-debt 이력이 그대로이고 새 plan-auditor iteration을 시작하지 않았다.
- **정정**: §4의 "재개 순서"와 3번("위 1~2(외부 확인·계획 마무리)가 끝난 뒤에만"), §5의 마지막 문장("§4의 재감사·외부 확인이 끝난 뒤에만 유효"), §9의 "재개 순서(갱신)"와 복사용 메시지의 "① 외부 확인·계획 마무리"는 외부 확인 항목과 미확정 사용자 결정을 **전부** 처리해야 Kickoff로 넘어가는 것으로 읽혔다. 이는 `external-confirmations-20261004.md`가 정의한 차단 구분과 맞지 않는다 — [R]은 해당 마일스톤·AC만 막고 착수 자체는 막지 않는다. 또 D-LAUNCH-07의 추가 사유 2종은 미승인 제안이라 L-06·M5·AC-B2CLAUNCH-014를 막지 않으며, 원 결정의 기본 4종이 유효한 기준이다(외부 확인 문서의 해당 행을 정정했다). ENGINE-001의 N8은 SPEC 원문이 "Kickoff 시 확인"으로 적지 않았으므로 [K]가 아니라 [R]로 정정했다.
- **현재 안내 — 차단 구분 [§11에서 정정: 아래 표의 [K] 행이 각 SPEC Pre-flight 6항목 전체를 승인 전 선결로 적어 "승인 완료"를 승인 전에 요구하는 순환으로 읽혔다. 원문은 보존한다]**: 착수 전에 확인하는 것은 LAUNCH STOP 처리 선택과 [K] 항목이다. 나머지 외부 항목은 각 차단 시점까지 미결 상태와 담당·처리 계획을 관리하면 된다.

  | 구분 | 막는 것 | 착수 전에 필요한가 |
  |---|---|---|
  | [K] 착수 | Implementation Kickoff Approval | 필요 — LAUNCH STOP 처리 선택, 각 SPEC `plan.md` §C Pre-flight 6항목(`a0e0ee2` 기준 ENGINE 0/6, CONSULTOPS 1/6, LAUNCH 0/6), SPEC이 Kickoff 때 확인하기로 적은 항목 |
  | [R] 마일스톤·AC | 해당 마일스톤 진입이나 AC 판정(또는 그 일부)만 | 불필요 — 그 시점 전까지 관리 |
  | [I-local] 로컬 시험 판정 | 참여자의 로컬 시험 시작 | 불필요 — 로컬 시험 시작 전까지 관리 |
  | [I-production] 내부 시험 공개 단계 | 운영 호스트의 내부 시험 노출 확대(현재 결정에서는 일어나지 않음) | 불필요 — 노출 확대 전까지 관리 |
  | [G] 일반 사용자 공개 단계 | 일반 사용자 공개 | 불필요 — 공개 전까지 관리 |

  ENGINE·CONSULTOPS의 PASS-with-debt 이력은 2026-10-02 스냅샷 기준이라 현재 내용의 PASS로 쓰지 않으며, `/moai run` 진입 때 Phase 1 Plan Audit Gate가 artifact-hash 변경을 감지해 재실행한다. 결정 기록이 존재한다는 사실만으로 Kickoff 전제가 충족됐다고 보지 않는다.
- **착수에 영향을 주는 미확정 설계 사항**(근거와 차단 범위의 상세는 `external-confirmations-20261004.md` "착수([K])에 영향을 주는 미확정 사항" 표): (1) LAUNCH STOP 처리 선택 — LAUNCH-001의 Kickoff만 막는다. (2) LAUNCH 진행 모드 축(자율/반자율)과 N9 run-phase 커밋 경로 — LAUNCH Kickoff Approval 안에서 정한다. (3) LAUNCH design 경로 적용 여부 — run-phase 진입 전 오케스트레이터 판단이고 M2의 진행 방식을 정한다. (4) ENGINE `design.md` §9.1 fixture 격리·§9.2 준비 증거 방식(N7 포함)·서명 토큰 형태 — ENGINE Kickoff Approval에서 확인한다. 이 밖의 외부 항목과 미확정 사용자 결정은 착수 선결이 아니다.
- **미확정 사용자 결정(상태 불변, 이 교정이 정하지 않았다 — 차단 범위만 구분)**: (1) D-LAUNCH-07 추가 사유 (e)(f) 확정 여부 — 차단 없음. (2) 01·02 푸터 요소별 목적지 기록의 소유(N5) — [R] M2 진입 전. (3) 로컬 시험 판정의 I 서명 필요 여부와 서명자 구성 — [I-local]과 [R] AC-B2CLAUNCH-008의 서명자 부분. 이상 확인 대기. (4) 로컬 첫 시험에도 L-06·L-07·L-09 등이 필수가 되는 결과 — 차단 없음, M1 전 확인 권장. (5) `local` + 목적 단계를 함께 주는 요청의 거부 규칙과 요청 형태를 실행 환경으로 정하는 방식 — 차단 없음, M1 전 확인 권장. 상세는 LAUNCH `progress.md` "6차 교정 기록"과 `external-confirmations-20261004.md` §6.
- **재개 순서(갱신, §4·§9를 대체) [§11 재개 순서로 대체 — "[K] 항목을 확인한다"가 Pre-flight 6항목 전체(승인 완료 포함)를 승인 전에 요구하는 것으로 읽히고 승인 완료 체크 단계가 없어 낡았다. 기록으로 보존한다]**: ① 착수 전 확인 — LAUNCH STOP 처리는 사용자가 정한다(범위 축소, PASS-with-debt, 명시적 예외 중 하나이며 그 선택 전에는 3회차 감사를 시작하지 않는다). [K] 항목을 확인한다. [R]·[I-local]·[I-production]·[G] 외부 항목과 미확정 사용자 결정은 `external-confirmations-20261004.md`에서 미결 상태·담당·처리 계획을 관리하며 착수 선결이 아니다 → ② Implementation Kickoff Approval(LAUNCH의 진행 모드 축·N9 선택 포함) → ③ `/moai run` Phase 1 Plan Audit Gate(artifact-hash 재검증) → ④ 구현(마일스톤마다 해당 [R] 차단을 확인).

### 갱신 재개 메시지 [SUPERSEDED by §11 갱신 재개 메시지 — 아래 블록의 "① 착수 전 확인 … [K] 항목 확인"이 Pre-flight 6항목 전체를 승인 전에 요구하는 것으로 읽히고 승인 완료 체크 단계가 없어 낡았다. 기록으로 보존한다] (§9의 메시지를 대체, 새 세션에 그대로 붙여넣기)

```text
✂──── 여기부터 복사 ────✂

ultrathink. 세 SPEC(ENGINE-001·CONSULTOPS-001·LAUNCH-001) plan-phase 마무리 이어서 진행 — LAUNCH 2회차 FAIL(STOP) 상태.
applied lessons: bosang-radar-tooling-gotchas, feedback-manager-spec-history-commit-claim
source_session_id: <not-available — environment-fallback>

전제 검증:
1) git branch --show-current → plan/b2c-launch-readiness (또는 worktree 안이면 같은 브랜치)
2) git ls-remote origin refs/heads/plan/b2c-launch-readiness → a0e0ee2 이상, git status --short → 6차 교정 변경 여부 확인
3) grep -c "PASS-with-debt로 종료" .moai/specs/SPEC-B2C-{ENGINE,CONSULTOPS}-001/progress.md → 둘 다 1 이상, grep -c "FAIL — STOP" .moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-2.md → 1 이상

실행: .moai/reports/b2c-launch-readiness/RESUME.md §10의 재개 순서를 따른다 — ① 착수 전 확인(LAUNCH STOP 처리는 사용자가 정한다: 범위 축소·PASS-with-debt·명시적 예외 중 하나이며 그 선택 전에는 3회차 감사를 시작하지 않는다, [K] 항목 확인은 external-confirmations-20261004.md의 "착수([K])에 영향을 주는 미확정 사항" 표, [R]·[I-local]·[I-production]·[G] 외부 항목과 미확정 사용자 결정 5건은 착수 선결이 아니며 각 차단 시점까지 미결 상태·담당·처리 계획을 관리, ENGINE-001·CONSULTOPS-001은 3회 소진·PASS-with-debt 이력 유지) → ② Implementation Kickoff Approval → ③ /moai run Phase 1 Plan Audit Gate → ④ 구현

후속: 구현이 끝나면 SPEC별 /moai sync

✂──── 여기까지 복사 ────✂
```

## 11. 후속 기록 4 (2026-10-04, `53c6954` 기준 7차 교정 — 승인 순서의 순환 표현)

앞 절의 기록은 그대로 두고, 이후 확인된 사실과 정정, 현재 안내만 덧붙인다. §10의 "현재 안내 — 차단 구분" 표의 [K] 행, 재개 순서, 복사용 메시지는 보존하되 아래 정정과 현재 안내가 대체한다. §4·§9에 붙은 "§10에서 정정·대체" 표시는 §10의 해당 부분이 다시 §11로 대체된 뒤에도 유효하다 — 현재 안내는 §11이다.

- **원격 반영**: §10의 "6차 교정은 이 절을 쓰는 시점에 커밋·push 전의 작업 트리 변경이다"는 그 시점의 기록이다. 이후 `git push origin plan/b2c-launch-readiness`(force 없음)로 `a0e0ee2..53c6954`(`0cd8a55`·`53c6954`)가 올라갔고, 7차 교정을 시작하기 전에 `git ls-remote`가 `53c6954`를 가리키고 `git rev-list --count --left-right origin/plan/b2c-launch-readiness...HEAD`가 `0 0`임을 확인했다. 7차 교정은 이 절을 쓰는 시점에 **커밋·push 전의 작업 트리 변경**이며, 그 커밋 SHA는 이 문서가 자기 SHA를 적을 수 없으므로 커밋 뒤 보고에 둔다.
- **현재 상태**: LAUNCH-001 plan-auditor 2회차 **FAIL 0.75(기준 0.80)·STOP이 공식 감사 결과로 그대로**다. 5·6·7차 교정은 재감사를 받지 않았고 문서 교정은 감사 PASS가 아니다. 점검기·하네스 등 구현은 아직 없어 구현 시험도 실행하지 않았고 PASS를 주장하지 않는다. 3회차 감사와 `/moai run`은 시작하지 않았고, 실제 사용자 승인(Implementation Kickoff Approval)도 받지 않았다 — 그래서 어떤 SPEC의 "Implementation Kickoff Approval 완료"도 체크하지 않았다. ENGINE-001·CONSULTOPS-001은 3회 소진·PASS-with-debt 이력이 그대로이고 새 plan-auditor iteration을 시작하지 않았다.
- **정정(순환 표현)**: §10의 [K] 표 행(열 "착수 전에 필요한가"의 값 "필요 — LAUNCH STOP 처리 선택, 각 SPEC `plan.md` §C Pre-flight 6항목 …"), §10 재개 순서 ①("… [K] 항목을 확인한다"), §10 복사용 메시지 ①은 각 SPEC Pre-flight 6항목 전체를 승인 전에 확인해야 하는 것으로 읽혔다. 그런데 그 6항목 안에 "Implementation Kickoff Approval 완료"가 있다. 승인 완료는 승인 뒤에야 참이 되므로 승인 완료를 승인 전에 요구하는 순환이다. 또 Pre-flight 점검표 전체와 승인 전 확인이 같은 말로 서술돼 있었다. `external-confirmations-20261004.md`의 [K] 정의와 LAUNCH `progress.md` 6차 기록의 같은 서술도 함께 정정했다(과거 기록 원문은 보존).
- **현재 안내 — 승인 둘레의 세 시점**: Pre-flight 점검표(각 SPEC `plan.md` §C, 6항목)는 run-phase를 시작하기 전의 **점검표 전체**이고, 승인 전에 확인하는 것은 그 일부와 별도 확인뿐이다.

  | 시점 | 항목 | 비고 |
  |---|---|---|
  | [K-전] 승인 전에 확인 | LAUNCH STOP 처리 선택(사용자). 상태·기록 읽기: 작업 트리·divergence, 동시 세션(둘 다 run 진입 직전에 다시 읽는다), 결정 기록 존재. "plan-auditor PASS"의 감사 판정 부분. LAUNCH design 경로 판단 | 승인 질문에 올리기 위해 먼저 읽어 두는 것. LAUNCH는 FAIL 0.75·STOP이라 STOP 처리 선택이 먼저다 |
  | [K-시] 승인 시 결정·확인 | LAUNCH 진행 모드 축과 N9 커밋 경로. ENGINE §9.1 fixture 격리·§9.2 준비 증거 방식(N7 포함)·서명 토큰 형태 | 승인 질문 안에서 정한다(`plan.md`의 "승인 때 정한다"·"승인 시 확인한다") |
  | [K-후] 승인 뒤에 완료를 확인 | "Implementation Kickoff Approval 완료" 체크. 직전 `pnpm` 기준선 기록. 운영 접근 제한 확인 | **실제 사용자 승인 뒤에만 체크**한다. 승인 전에 "승인 완료"가 미체크인 것은 정상이며 승인 절차에 들어가는 것을 막는 조건이 아니다 |

  분류는 `plan.md` 항목 문구의 시점 표현을 읽어 나눈 것이며 `plan.md`의 체크 상태(`53c6954` 기준 ENGINE 0/6, CONSULTOPS 1/6, LAUNCH 0/6)와 문구는 바꾸지 않았다. 기준선 기록과 운영 접근 제한을 [K-후]로, 작업 트리·동시 세션·결정 기록 존재를 [K-전]으로 읽은 것은 문구에서 따라 나온 해석이며 사용자 결정이 아니다. [R]·[I-local]·[I-production]·[G] 차단 구분, 기존 사용자 결정, 미확정 사용자 결정 5건과 로컬 입력 계약은 바꾸지 않았다.
- **재개 순서(갱신, §10을 대체)**: ① 승인 전 확인 — LAUNCH STOP 처리는 사용자가 정한다(범위 축소, PASS-with-debt, 명시적 예외 중 하나이며 그 선택 전에는 3회차 감사를 시작하지 않는다). [K-전] 항목(상태·기록 읽기, 감사 판정 확인, design 경로 판단)을 확인한다 → ② 실제 사용자 승인: Implementation Kickoff Approval(승인 질문 안에서 [K-시] 항목을 정한다 — LAUNCH의 진행 모드 축·N9, ENGINE의 §9.1·§9.2·서명 토큰 형태) → ③ 승인 완료 체크: 실제 승인 **뒤에** Pre-flight의 "Implementation Kickoff Approval 완료"를 체크하고 [K-후]의 나머지(기준선 기록, 운영 접근 제한)를 run 진입 직전에 확인한다. 승인 없이 체크하지 않는다 → ④ `/moai run` Phase 1 Plan Audit Gate(artifact-hash 재검증) → ⑤ 구현(마일스톤마다 해당 [R] 차단을 확인). [R]·[I-local]·[I-production]·[G] 외부 항목과 미확정 사용자 결정은 `external-confirmations-20261004.md`에서 미결 상태·담당·처리 계획을 관리하며 착수 선결이 아니다.

### 갱신 재개 메시지 (§10의 메시지를 대체, 새 세션에 그대로 붙여넣기)

```text
✂──── 여기부터 복사 ────✂

ultrathink. 세 SPEC(ENGINE-001·CONSULTOPS-001·LAUNCH-001) plan-phase 마무리 이어서 진행 — LAUNCH 2회차 FAIL(STOP) 상태, Implementation Kickoff Approval 전.
applied lessons: bosang-radar-tooling-gotchas, feedback-manager-spec-history-commit-claim
source_session_id: <not-available — environment-fallback>

전제 검증:
1) git branch --show-current → plan/b2c-launch-readiness (또는 worktree 안이면 같은 브랜치)
2) git ls-remote origin refs/heads/plan/b2c-launch-readiness → 53c6954 이상, git status --short → 7차 교정 변경 여부 확인
3) grep -c "PASS-with-debt로 종료" .moai/specs/SPEC-B2C-{ENGINE,CONSULTOPS}-001/progress.md → 둘 다 1 이상, grep -c "FAIL — STOP" .moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-2.md → 1 이상

실행: .moai/reports/b2c-launch-readiness/RESUME.md §11의 재개 순서를 따른다 — ① 승인 전 확인(LAUNCH STOP 처리는 사용자가 정한다: 범위 축소·PASS-with-debt·명시적 예외 중 하나이며 그 선택 전에는 3회차 감사를 시작하지 않는다, [K-전] 상태·기록 읽기와 감사 판정·design 경로 판단은 external-confirmations-20261004.md의 [K] 정의) → ② 실제 사용자 승인(Implementation Kickoff Approval — 진행 모드 축·N9, ENGINE §9.1·§9.2·서명 토큰 형태는 이 승인 안에서 정한다) → ③ 승인 뒤에만 Pre-flight "Implementation Kickoff Approval 완료"를 체크(승인 없이 체크하지 않는다)하고 기준선 기록·운영 접근 제한을 run 진입 직전에 확인 → ④ /moai run Phase 1 Plan Audit Gate → ⑤ 구현. [R]·[I-local]·[I-production]·[G] 외부 항목과 미확정 사용자 결정 5건은 착수 선결이 아니며 각 차단 시점까지 미결 상태·담당·처리 계획을 관리, ENGINE-001·CONSULTOPS-001은 3회 소진·PASS-with-debt 이력 유지

후속: 구현이 끝나면 SPEC별 /moai sync

✂──── 여기까지 복사 ────✂
```
