# 재개 안내: B2C 공개 전 plan-phase (2026-10-02 작업 중단 시점)

이 문서는 작업을 다른 PC에서 이어 하기 위한 인수인계 기록이다. 로컬 자동 메모리는 다른 PC에 없으므로 이어서 할 정보는 모두 저장소 안에 둔다.
기준 커밋은 `main@99993bf`이고, 이 브랜치(`plan/b2c-launch-readiness`)는 문서만 추가했다. 응용 코드·설정·워크플로·운영 환경은 바꾸지 않았다.

## 1. 한 줄 요약

"화면·상담 API 배포 완료"(다크 런치: 플래그가 꺼진 상태로 배포됨)와 "일반 사용자 대상 서비스 출시 가능"은 다른 상태다. 앞의 것은 참이고 뒤의 것은 거짓이다. 일반 공개 전에 필요한 일을 세 개의 plan-phase SPEC 초안으로 나눠 작성했다. 실행(run-phase), 운영 DB 쓰기, 운영 플래그 변경, main 병합은 하지 않았다.

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

## 3. 산출물과 감사 상태

| SPEC | 범위 | 감사 결과 | 비고 |
|---|---|---|---|
| `SPEC-B2C-ENGINE-001` (Tier L, REQ/AC 25/25) | 실제 진단·담보 매칭·결과 데이터 | 3회차 PASS, 0.857 (기준 0.85). 0.726 → 0.807 → 0.857 | 마진 +0.007. 부채는 아래 참고 |
| `SPEC-B2C-CONSULTOPS-001` (Tier M, 16/16) | 상담 활성화 준비(문구·창구·시크릿·PM2·검증·되돌리기) | 3회차 PASS, 0.82 (기준 0.80). 0.7245 → 0.7576 → 0.82 | 감사자 기준에 따라 FAIL이 될 수 있는 아슬아슬한 점수 |
| `SPEC-B2C-LAUNCH-001` (Tier M, 16/16) | 공개 게이트, 단계 정의, 플래그 순서, `deploy.yml` smoke 교체, 되돌리기 | **미감사.** 1회차 감사를 시작했으나 중단되어 보고서가 없다 | `plan_status: draft` |

`deploy.yml` placeholder smoke 검사 변경은 **LAUNCH-001이 소유**한다. 이유는 SPEC-B2C-LAUNCH-001 §2와 D-LAUNCH-06에 적혀 있다.

감사 보고서는 `.moai/reports/plan-audit/`에 있다. 이 폴더는 `.gitignore`(210행)에 걸려 있지만 CONSULT-001 보고서가 이미 추적되는 선례가 있어 `git add -f`로 올렸다.

### 감사 3회로 닫히지 않은 부채 (사용자 입력 없이 고칠 수 있는 문장 결함 = (a))
- ENGINE `review-3`: D30 `acceptance.md:206`의 AC-023 시나리오 5 grep이 `process.env["DIAGNOSIS_ENGINE_READY"]="true"`와 JSON 키 형태를 놓친다(Kickoff 전 수정). D29 "정의된 거절 결과"가 정의되지 않음. D32, D33.
- CONSULTOPS `review-3`: N-1 증거 기록 파일을 "덮는 파일 집합"에서 제외하는 규칙을 검증하는 AC가 없다(주요). N-2 "최소"와 "기본 목록" 표현 불일치. N-3~N-11은 선택 사항.
- 감사 횟수 상한(3회)에 도달해서 4회차는 사용자 허가 없이는 돌리지 않았다.

### 사용자 결정이 필요한 것 (아무것도 결정하지 않았다 = (b))
- ENGINE D-ENGINE-01~11, CONSULTOPS D-OPS-01~12, LAUNCH D-LAUNCH-01~09. 각 항목은 해당 SPEC의 `progress.md`의 "Open Decisions for User"에 중립 옵션, 추천(전제 포함), 막는 것, 결정 역할로 정리되어 있다.
- `[NEEDS CLARIFICATION]` 마커: ENGINE spec.md 8 + design.md 3, CONSULTOPS spec.md 8, LAUNCH spec.md 11.
- 구현 착수(Kickoff) 전에 답해야 하는 것은 각 감사 보고서 끝에 적혀 있다. ENGINE은 D-ENGINE-01~06과 09, N1, N2, N5. CONSULTOPS는 N7, N6, N8을 먼저, D-OPS-11·12는 M1 전에.
- 실제 담당 창구, 연락 기한, 상태 명칭, 동의 문구, 담보 판정 규칙, 정확도 기준은 어떤 SPEC에도 확정되어 있지 않다.

## 4. 다음에 할 일 (우선순위 순서)

1. **LAUNCH-001 1회차 독립 감사.** `plan-auditor`에게 `.moai/specs/SPEC-B2C-LAUNCH-001/`를 감사하게 한다. 결과는 `.moai/reports/plan-audit/SPEC-B2C-LAUNCH-001-review-1.md`에 쓴다. 감사 지시문에 넣을 점검 항목은 다음과 같다. `flags.ts` 진리표 12행 직접 계산, 상담 API가 `ENABLE_CONSULT_FLOW`를 읽지 않는다는 주장 재검색, `deploy.yml` smoke 교체 요구가 게이트 닫힘·열림 두 상태에서 모두 통과하고 플래그 변경보다 먼저 반영되는지, 형제 SPEC에 대해 보고한 결함(N2, N4, N5, N7)이 실제인지, AC의 grep 검사가 놓치는 형태가 없는지, SPEC 문서에 고정 표지값이 들어가 자기 자신을 검색하는 결함이 없는지. Tier M 기준은 0.80이다.
2. 감사 결과에 따라 `manager-spec`으로 수정하고 재감사한다(최대 3회).
3. 세 SPEC의 사용자 결정을 `AskUserQuestion`으로 묻는다. 결정이 늦을수록 막히는 순서는 각 SPEC `plan.md` §B에 있다.
4. 구현 착수 승인(Implementation Kickoff Approval) 전에는 run-phase를 시작하지 않는다.

## 5. 이어 할 때 주의할 점

- 이 브랜치는 로컬에서만 만들었고 푸시하지 않았다. 푸시할 때는 `git push -u origin plan/b2c-launch-readiness`로 브랜치 이름을 명시한다. 브랜치 추적 설정은 일부러 비워 두었으니 이름 없는 `git push`로 main에 올라가는 일은 없다.
- 이 저장소는 공개(PUBLIC)다. SPEC·감사 보고서·증거 문서에 비밀값, 실제 사용자 연락처, 운영 서버 주소, 담당자 연락처, 법적 판단 내용을 넣지 않는다. 커밋 전에 점검했고 해당 항목은 없었다.
- 한 번에 쓰기 에이전트를 하나만 돌린다. 감사자와 작성자를 동시에 돌리지 않는다.
- `moai` CLI가 PATH에 없는 환경이면 `moai spec lint`와 세션 목록 점검을 못 한다. 이번 감사는 모두 Claude 단독 감사였고 다중 모델 합의는 쓰지 않았다.
- 증거 문서(`evidence-pack-20261002.md`)는 Explore 에이전트 보고를 정리한 것이다. 인용한 줄 번호는 SPEC에 쓰기 전에 직접 다시 읽어서 확인해야 한다. 이 문서의 알려진 오류는 LAUNCH-001 `progress.md` §2에 정리되어 있다.
- SPEC ID 스키마 정규식(`^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$`)은 선례 `SPEC-B2C-CONSULT-001` 형식과 글자 그대로는 맞지 않는다. 선례 형식을 따랐고 불일치를 각 SPEC `progress.md`에 기록했다.

## 6. 파일 위치

- SPEC: `.moai/specs/SPEC-B2C-ENGINE-001/`, `.moai/specs/SPEC-B2C-CONSULTOPS-001/`, `.moai/specs/SPEC-B2C-LAUNCH-001/`
- 감사 보고서: `.moai/reports/plan-audit/SPEC-B2C-ENGINE-001-review-{1,2,3}.md`, `SPEC-B2C-CONSULTOPS-001-review-{1,2,3}.md`
- 증거 문서: `.moai/reports/b2c-launch-readiness/evidence-pack-20261002.md`

## 7. 재개 메시지 (새 세션에 그대로 붙여넣기)

```text
✂──── 여기부터 복사 ────✂

ultrathink. SPEC-B2C-LAUNCH-001 plan 진입.
applied lessons: bosang-radar-tooling-gotchas, feedback-manager-spec-history-commit-claim
source_session_id: <not-available — environment-fallback, next session will backfill via /moai session register on activation>

전제 검증:
1) git branch --show-current → plan/b2c-launch-readiness
2) ls .moai/specs → SPEC-B2C-ENGINE-001, SPEC-B2C-CONSULTOPS-001, SPEC-B2C-LAUNCH-001 세 디렉터리가 모두 있음
3) ls .moai/reports/plan-audit | grep B2C-LAUNCH → 출력 없음(LAUNCH-001 미감사 상태)

실행: .moai/reports/b2c-launch-readiness/RESUME.md §4-1에 따라 plan-auditor로 SPEC-B2C-LAUNCH-001 1회차 감사

후속: 감사 결과로 SPEC-B2C-LAUNCH-001 수정·재감사 후 세 SPEC의 사용자 결정 질문

✂──── 여기까지 복사 ────✂
```
