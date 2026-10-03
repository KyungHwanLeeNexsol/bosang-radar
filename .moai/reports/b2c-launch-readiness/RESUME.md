# 재개 안내: B2C 공개 전 plan-phase (2026-10-03 2차 정밀 교정 완료 시점)

이 문서는 작업을 다른 PC에서 이어 하기 위한 인수인계 기록이다. 로컬 자동 메모리는 다른 PC에 없으므로 이어서 할 정보는 모두 저장소 안에 둔다.
기준 커밋은 `main@99993bf`이고, 이 브랜치(`plan/b2c-launch-readiness`)는 문서만 추가했다. 응용 코드·설정·워크플로·운영 환경은 바꾸지 않았다.

## 1. 한 줄 요약

"화면·상담 API 배포 완료"(다크 런치: 플래그가 꺼진 상태로 배포됨)와 "일반 사용자 대상 서비스 출시 가능"은 다른 상태다. 앞의 것은 참이고 뒤의 것은 거짓이다. 일반 공개 전에 필요한 일을 세 개의 plan-phase SPEC 초안으로 나눠 작성했다. 2026-10-02에 작성, 2026-10-03에 (a) LAUNCH-001 1회차 감사, (b) 세 SPEC의 사용자 결정 32건 전부 확정·기록, (c) 사용자가 직접 검토해 지시한 2차 정밀 교정(결함 분리·요소별화·AND-게이트·review-3 결함 수정 등 11건)까지 끝났다. 실행(run-phase), 운영 DB 쓰기, 운영 플래그 변경, main 병합은 여전히 하지 않았다.

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
| `SPEC-B2C-LAUNCH-001` (Tier M, 16/16) | 공개 게이트, 단계 정의, 플래그 순서, `deploy.yml` smoke 교체, 되돌리기 | 9/9 결정 완료 | 1회차 PASS 0.88(기준 0.80, 2026-10-03)은 **결정 기록 전** 커밋(`c89dae7`) 기준. D-LAUNCH-07 사유 2종 추가 등 2차 정밀 교정은 재감사 전 |

**세 SPEC 모두 "감사 PASS"와 "현재 문서 내용"이 가리키는 스냅샷이 다르다.** 재감사 전까지 어느 PASS도 2026-10-03 최종 내용을 검증한 것으로 인용하지 말 것.

### 2026-10-02 감사에서 닫히지 않았던 부채 — 전부 해소됨(2026-10-03 2차 정밀 교정)
- ENGINE review-3 D29(정의 없는 "정의된 거절 결과" → REQ-020에 정의 추가)·D30(grep이 bracket·JSON-key 형태 누락 → 패턴 수정, 양성/음성 샘플로 재검증)·D32·D33 — `acceptance.md`·`plan.md`에서 수정, 커밋 `ecfaba9`.
- CONSULTOPS review-3 N-1(증거 기록 제외 규칙을 검증하는 AC 없음 → AC-001/002에 fixture 추가)·N-2("최소"/"빼거나" 표현 불일치 → "빼거나" 옵션 제거) — 커밋 `7754ef8`.
- N-3~N-11(선택 사항)은 손대지 않음 — 범위 밖.

### 사용자 결정 32건 — 전부 확정 (2026-10-03)
- ENGINE D-ENGINE-01~11(11건 중 10건 결정, D-ENGINE-07은 법무 작성 대기), CONSULTOPS D-OPS-01~12(12건, 일부 세부는 외부 확인 대기), LAUNCH D-LAUNCH-01~09(9건) — 전부 각 SPEC `progress.md`에 "**결정 (2026-10-03, 사용자 인터뷰)**" 기록으로 남아 있다.
- 2026-10-03 같은 날, 사용자가 기록된 결정을 직접 검토하고 11건의 정밀 교정을 지시 — 선택 자체는 그대로 두고 분리·구체화·추가 게이트만 반영(아래 §4-0).

### 그래도 남아있는 것 — 사람이 직접 확인해야 하는 외부 항목
- **법무**: D-ENGINE-07(진단 동의 문구 6개), D-ENGINE-10 면책 문구 검토, D-OPS-01 Q1(상담 문구 작성 주체)
- **운영**: D-OPS-03 SLA 4항목(담당자·조회빈도·부재대체·실제처리가능성 — 미확인 시 E-12/E-13·상담 일반공개 BLOCKED), D-OPS-04 6개 요소 전부 미확인(그중 4개는 채널 없어도 요소 제거 금지), D-OPS-07/08(시크릿 보관 위치는 PM2 재시작 전략 실제 관측 후)
- **엔지니어링+도메인 전문가**: D-ENGINE-09 정확도 수치(이 SPEC이 정하지 않음), D-ENGINE-05 만료 유무(b-1/b-2) + CONSULT-001 REQ-009·019 정합성, D-ENGINE-02의 6개 유형 확대된 규칙표 작성·검수 부담
- `[NEEDS CLARIFICATION]` 마커: ENGINE 8(spec.md)+3(design.md), CONSULTOPS 8, LAUNCH 11 — 32건 결정으로 일부는 좁혀졌으나(N2/N3/N5/N11 등) **완전히 닫힌 건 없음**. 각 SPEC `spec.md`에 "해결 상태 (2026-10-03)" 메모로 현황이 남아 있다.

## 4. 다음에 할 일 (우선순위 순서)

0. **(완료, 참고용)** 2026-10-03에 끝낸 일 — LAUNCH-001 1회차 감사(PASS 0.88) → 사용자 결정 32건 인터뷰·기록 → 사용자 검토 후 2차 정밀 교정 11건(D-OPS-10 분리, D-OPS-04 요소별화, D-LAUNCH-07 사유 추가, D-ENGINE-03 유형별 AND-게이트+용어 수정, D-OPS-03 SLA 차단, D-ENGINE-11 생산준비 게이트, D-ENGINE-05/07·D-OPS-01/07/08 미완료 플래그 유지, D-LAUNCH-01/02/03 일관성, review-3 결함 수정, 진행문서 HEAD 동기화).
1. **세 SPEC 재감사.** 2차 정밀 교정으로 `acceptance.md`를 포함한 실질 내용이 바뀌었으므로 기존 PASS(ENGINE 0.857/CONSULTOPS 0.82/LAUNCH 0.88)는 새 내용을 검증하지 않았다. `plan-auditor`에게 세 SPEC을 순서대로(또는 병렬로) 재감사하게 한다. 특히 ENGINE의 새 6유형 AND-게이트, CONSULTOPS의 D-OPS-10 분리·N-1/N-2 수정, LAUNCH의 D-LAUNCH-07 신규 사유를 집중 점검.
2. 재감사 FAIL 시 `manager-spec`으로 수정 후 재감사(각 SPEC당 최대 3회, 이번이 1회차로 재시작).
3. 위 §3 "그래도 남아있는 것" 목록을 법무·운영·엔지니어링·도메인 전문가에게 전달해 실제 확인을 받는다(AskUserQuestion으로는 풀 수 없는 항목들).
4. 구현 착수 승인(Implementation Kickoff Approval) 전에는 run-phase를 시작하지 않는다 — 위 1~3이 끝나야 그 게이트에 들어갈 수 있다.
5. 이 plan 브랜치의 PR을 만들지, 계속 직접 push로 이어갈지는 별도 결정.

## 5. 이어 할 때 주의할 점

- 이 브랜치(`plan/b2c-launch-readiness`)는 2026-10-02에 사용자 승인을 받아 `git push -u origin plan/b2c-launch-readiness`로 원격에 올렸고, 2026-10-03에 추가 커밋 7건을 같은 방식으로 다시 push했다(`git push origin plan/b2c-launch-readiness`, force 없음). PR은 아직 만들지 않았고 main은 바뀌지 않았다. 다른 PC에서는 `git fetch origin` 뒤 `git switch plan/b2c-launch-readiness`로 가져온다.
- **worktree·공유 plan 브랜치 사용은 `spec-workflow.md` § SPEC Phase Discipline의 기본 안내에서 벗어난 선택이다.** 그 문서의 Route A(Tier S/M 기본, main 직접) / Route B(Tier L 또는 `--pr`, SPEC별 `plan/SPEC-XXX` 브랜치)는 모두 "Step 1(plan)은 메인 체크아웃에서 실행, 이 단계에서 worktree 없음"을 명시한다. 이 작업은 2026-10-02부터 `.claude/worktrees/launch-readiness`라는 **격리된 worktree**에서, 그리고 Route A/B 어느 쪽에도 해당하지 않는 **ENGINE·CONSULTOPS·LAUNCH 세 SPEC이 공유하는 한 brach(`plan/b2c-launch-readiness`)**에서 진행됐다. 이렇게 한 이유는 2026-10-02 세션이 메인 체크아웃을 건드리지 않고 세 SPEC을 함께 다루기로 사용자 승인을 받았기 때문이며(§1), 세 SPEC이 서로를 많이 참조해 한 브랜치로 묶는 쪽이 교차 참조 정합성을 지키기 쉬웠다. **이후 정규 경로로 복귀하려면**: run-phase 진입 전에 각 SPEC을 `plan/SPEC-XXX` 개별 브랜치로 분리해 Route B의 plan PR 3건으로 올리거나(엄격 준수), 또는 이 공유 브랜치 전체를 하나의 plan PR로 올려 사용자가 명시적으로 승인한 예외로 기록하고 넘어가는 두 가지 선택지가 있다 — 어느 쪽도 이 세션이 임의로 정하지 않았고, 기존 이력(커밋)을 다시 쓰지 않는다. Implementation Kickoff Approval은 이 선택과 무관하게 §4의 재감사·외부 확인이 끝난 뒤에만 유효하다.
- 이 저장소는 공개(PUBLIC)다. SPEC·감사 보고서·증거 문서에 비밀값, 실제 사용자 연락처, 운영 서버 주소, 담당자 연락처, 법적 판단 내용을 넣지 않는다. 2026-10-03 교정에서도 다시 점검했고 해당 항목은 없었다.
- 한 번에 쓰기 에이전트를 하나만 돌린다. 감사자와 작성자를 동시에 돌리지 않는다. 2026-10-03 교정은 ENGINE·CONSULTOPS를 먼저 병렬로(서로 다른 SPEC 디렉터리, 파일 겹침 없음), LAUNCH-001은 CONSULTOPS의 D-OPS-04·D-OPS-12 최종 내용에 의존해 CONSULTOPS 완료 후 순차로 돌렸다.
- `moai` CLI가 PATH에 없는 환경이면 `moai spec lint`와 세션 목록 점검을 못 한다. 이번 세션의 모든 감사·교정은 Claude 단독이었고 다중 모델 합의는 쓰지 않았다.
- 증거 문서(`evidence-pack-20261002.md`)는 Explore 에이전트 보고를 정리한 것이다. 인용한 줄 번호는 SPEC에 쓰기 전에 직접 다시 읽어서 확인해야 한다. 이 문서의 알려진 오류는 LAUNCH-001 `progress.md` §2에 정리되어 있다.
- SPEC ID 스키마 정규식(`^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$`)은 선례 `SPEC-B2C-CONSULT-001` 형식과 글자 그대로는 맞지 않는다. 선례 형식을 따랐고 불일치를 각 SPEC `progress.md`에 기록했다.

## 6. 파일 위치

- SPEC: `.moai/specs/SPEC-B2C-ENGINE-001/`, `.moai/specs/SPEC-B2C-CONSULTOPS-001/`, `.moai/specs/SPEC-B2C-LAUNCH-001/`
- 감사 보고서: `.moai/reports/plan-audit/SPEC-B2C-ENGINE-001-review-{1,2,3}.md`, `SPEC-B2C-CONSULTOPS-001-review-{1,2,3}.md`, `SPEC-B2C-LAUNCH-001-review-1.md`
- 증거 문서: `.moai/reports/b2c-launch-readiness/evidence-pack-20261002.md`
- 2026-10-03 커밋(결정 기록 → 2차 정밀 교정 순): `c89dae7`(LAUNCH 결정)·`4415e82`(CONSULTOPS 결정)·`0701e2d`(ENGINE 결정)·`7754ef8`(CONSULTOPS 교정)·`ecfaba9`(ENGINE 교정)·`7916728`(LAUNCH 교정)

## 7. 재개 메시지 (새 세션에 그대로 붙여넣기)

```text
✂──── 여기부터 복사 ────✂

ultrathink. 세 SPEC(ENGINE-001·CONSULTOPS-001·LAUNCH-001) 재감사 진입.
applied lessons: bosang-radar-tooling-gotchas, feedback-manager-spec-history-commit-claim
source_session_id: <not-available — environment-fallback>

전제 검증:
1) git branch --show-current → plan/b2c-launch-readiness (또는 worktree 안이면 같은 브랜치)
2) git log -1 --format='%H' → 7916728 이후(2차 정밀 교정 반영된 상태)인지 확인
3) grep -l "재감사 전" .moai/specs/SPEC-B2C-*/progress.md → 3개 파일 모두 나와야 함(아직 재감사 안 됨)

실행: .moai/reports/b2c-launch-readiness/RESUME.md §4-1에 따라 plan-auditor로 세 SPEC 재감사(이번이 1회차로 재시작, 각 SPEC당 최대 3회)

후속: 재감사 PASS 후 §3 "그래도 남아있는 것" 목록을 법무·운영·엔지니어링에 전달 → Implementation Kickoff Approval

✂──── 여기까지 복사 ────✂
```
