# Plan — SPEC-B2C-LAUNCH-001

## 결정 우선순위 (Decision Review Priority)

바뀔 가능성이 크고 다른 결정에 영향이 큰 순서다(기록 모델·타입 인터페이스, 사용자 노출 화면·흐름, 그다음 절차). 리뷰 시 이 순서로 확인하기를 권장한다. 마일스톤(§F)도 같은 순서로 놓았고 기계적인 문서 정리는 맨 아래다.

1. **D-LAUNCH-04 go/no-go 서명자·형식·보관**: 형식은 기록 모델과 점검기의 입력 형태(M1의 타입 인터페이스)를 정하고, 저장소가 공개라 한 번 커밋한 기록은 되돌리기 어렵다(LF-15). `main` push마다 배포되므로(LF-03) 기록을 추적 문서로 두면 커밋마다 운영이 재시작된다.
2. **D-LAUNCH-09 01·02·03 법적 고지 표면**, **D-LAUNCH-01 내부 시험의 노출 방식**, **D-LAUNCH-02 참여자·데이터 규칙**: 사용자 화면과 수집 데이터에 걸리고 되돌리기 어렵다. D-LAUNCH-01은 내부 시험이 어디서 어떻게 일어날 수 있는지를 정한다.
3. **D-LAUNCH-03 노출 순서**, **D-LAUNCH-05 일반 공개 필수 항목**: 단계별 허용 벡터와 필수 항목 집합을 정한다. 결정 전에는 `결정 대기` 칸이 필수로 취급되므로(fail-closed) 결정이 늦을수록 문턱이 높아진다.
4. **D-LAUNCH-06 smoke 교체 설계**: 워크플로 변경이라 모든 이후 배포에 영향을 준다. 단 코드 변경 범위는 작다.
5. **D-LAUNCH-07 롤백 결정권과 사유**, **D-LAUNCH-08 사후 관측**: 운영 절차이며 되돌리기 쉬운 편이다.

## §A. Context

- 선행 SPEC: ENGINE-001(`draft`, Tier L)과 CONSULTOPS-001(`draft`, Tier M)은 이 SPEC과 같은 `plan/b2c-launch-readiness` 브랜치에 커밋된 draft다(`main`에는 없다). CONSULT-001은 `in-progress`, DIAGNOSIS-001·RESULT-001은 `completed`다. 현재 기준선은 `main@99993bf`(LF-01).
- 개발 방법론: `quality.yaml`의 `development_mode: tdd`, 커버리지 목표 85%.
- 이 SPEC은 plan-phase만 다룬다. 응용 코드·설정·워크플로·환경 파일·기존 SPEC은 변경하지 않았고, 운영 VM·운영 DB·운영 플래그에는 접근하지 않았다.
- 코드·운영 사실의 장부는 `spec.md` §1.2(LF-01~LF-20)다. 병합 이후의 운영 상태는 **미관측**이고 그 공백을 닫는 항목이 L-01이다.
- 요구사항은 D-LAUNCH-NN의 옵션을 선점하지 않는다. 결정에 걸린 요구사항은 REQ-B2CLAUNCH-011(D-LAUNCH-03), 013(D-LAUNCH-06), 016(D-LAUNCH-08)처럼 조건부(`Where`)이고, 나머지는 결정에 중립이다. 결정 전 기본값은 `결정 대기` 칸의 fail-closed 취급 하나다.
- 산출물 형태(후보): 런북 `.moai/docs/launch-gate-runbook.md`(단계 정의·항목 표·플래그 조합표·전환 순서·롤백·관측 절차), 기록 모델과 점검기(`lib/launch/*`, `scripts/check-launch-gate.ts`, `scripts/check-launch-transitions.ts`), 로컬 도달 관측(`scripts/verify-gate-reachability.ts`), smoke 검사와 시험(`scripts/smoke-check.ts`), 롤백 시험(`scripts/verify-rollback-dark.ts`), `deploy.yml` 변경, 푸터 컴포넌트와 시험(결정에 따름). 형태는 run-phase에서 확정한다.
- UI 표면(`components/diagnosis/diagnosis-footer.tsx`, `components/result/result-footer.tsx`, `components/consult/consult-footer.tsx`)이 바뀔 수 있어(D-LAUNCH-09) run-phase 진입 전 design 경로(`manager-design`) 적용 여부를 오케스트레이터가 판단한다(`spec-workflow.md` § Conditional Design Route). 푸터는 화면 시각 기준선에 걸리므로 N5가 확인될 때까지 변경 범위를 정하지 않는다.
- 이 SPEC은 Tier M 기본 경로(Route A, `main` 직접 push)에서 모든 run-phase 커밋이 운영 재시작을 일으킨다는 점(N9)을 구현 착수 승인 때 사용자에게 올린다.

## §B. Known Issues (결정 · 리스크)

상태는 D-LAUNCH-01~09 9건 모두 **2026-10-03 사용자 인터뷰에서 결정됨**으로 바뀌었다(결정 전문은 `progress.md` "결정 기록 (2026-10-03, 사용자 인터뷰)"). 옵션 전문은 `spec.md` "설계 대안", 작성 시점의 추천은 같은 절 끝에 있다. 아래 "차단하는 것"은 결정이 없었을 때 진행할 수 없던 일이며, 결정이 기록된 지금은 해당 마일스톤·항목의 **결정 선결 조건은 해제**됐다 — 단 그 마일스톤의 실제 구현(산출물·시험)은 run-phase 몫으로 남는다.

| ID | 결정 사항 | 상태 | 결정 주체(역할) | 차단하는 것(결정 전 기준) |
|---|---|---|---|---|
| D-LAUNCH-01 | 내부 시험의 노출 방식(별도 환경 / 앞단 접근 제한 / 앱 안 허용 목록 / 제한 없이 수용 / 로컬 한정) | **결정됨(2026-10-03)** — (e) 로컬 한정 | 제품 책임자 + 운영 책임자 + 엔지니어링 | M3, L-02, L-03, 내부 시험 공개 단계 |
| D-LAUNCH-02 | 내부 시험 참여자 역할과 진단 쪽 데이터 규칙 | **결정됨(2026-10-03)** — 참여자 (a), 데이터 (1) | 제품 책임자 + 법무(데이터 규칙) + 운영 책임자 | M3, L-03, 내부 시험 공개 단계 |
| D-LAUNCH-03 | 노출 순서: Q1 일반 공개 순서, Q2 내부 시험의 표면 범위 | **결정됨(2026-10-03)** — Q1 (a), Q2 (4) | 제품 책임자 + 운영 책임자 + 엔지니어링 | M3, REQ-B2CLAUNCH-011, AC-B2CLAUNCH-011, 단계별 허용 벡터 |
| D-LAUNCH-04 | go/no-go 서명자·형식·보관(공개 저장소 제약) | **결정됨(2026-10-03)** — 서명자 (c), 형식 (i), 보관 (α)+(γ) 혼합 | 제품 책임자 + 엔지니어링(법무: 공개 가능 범위) | M1, AC-B2CLAUNCH-003·006·007·008의 일부, 모든 서명 기록 |
| D-LAUNCH-05 | 일반 공개에 필수인 준비 항목(`결정 대기` 칸: L-02 G, R-02 I, R-03 I, R-05 G, D-ENGINE-09 G 단계 서명) | **결정됨(2026-10-03)** — (a) 전부 필수, 면제 없음 | 제품 책임자 + 법무 + 운영 책임자(보험 도메인 전문가: D-ENGINE-09 항목) | 일반 사용자 공개 판정, M1의 항목 표 확정 |
| D-LAUNCH-06 | smoke 검사 교체 설계(두 상태 수용 / 상태 인지 / 상태 비의존 + 로그 / 확대)와 검사 위치(인라인 / 저장소 스크립트) | **결정됨(2026-10-03)** — 설계 (a), 위치 (ii) | 엔지니어링 + 제품 책임자(배포 동작 변경 승인) | M4, L-05, 모든 진단 플래그 변경, AC-B2CLAUNCH-013 |
| D-LAUNCH-07 | 롤백 선언·실행 역할과 사유 목록 | **결정됨(2026-10-03)** — 선언 (iii), 실행 (1), 사유는 CONSULTOPS-001 §2.4 작성자 기본 목록(4종). 진단 표면 전용 사유 2종은 사용자 확인 대기인 후속 변경안(`spec.md` D-LAUNCH-07) | 제품 책임자 + 운영 책임자 | M5, L-06, AC-B2CLAUNCH-014의 역할 부분 |
| D-LAUNCH-08 | 사후 관측의 담당·내용 | **결정됨(2026-10-03)** — 내용 (b), 담당 (1) | 운영 책임자 + 제품 책임자 | M5, L-09, AC-B2CLAUNCH-016 |
| D-LAUNCH-09 | 01·02·03 법적 고지 요소의 단계별 허용 상태 | **결정됨(2026-10-03)** — G (1), I (2) | 제품 책임자 + 법무 | M2, L-08, AC-B2CLAUNCH-015의 허용 칸 |

노트: 위 9건의 결정 전문과 사용자 결정 주체는 `progress.md` "결정 기록 (2026-10-03, 사용자 인터뷰)"에 있다. 이후 2026-10-03의 2차 정밀 교정은 D-LAUNCH-07의 결정 기록(사유 목록)을 바꿨다 — 5차 수정안이 원래 결정 문장을 복원하고 그 변경을 사용자 확인 대기인 후속 변경안으로 분리했다(`progress.md`). 나머지 8건의 결정 기록은 `c89dae7`과 같다. "내부 시험"의 세 용법(N2), 단계 정의 소유 이관의 형제 문구(N1), 완료된 DIAGNOSIS-001 트리거의 틈(N4) 등 `spec.md` Open Clarification N1~N11은 결정이 아니라 기존 SPEC과의 충돌·소유 확인이며, 이번 9건의 결정으로 N1~N11이 자동으로 해소되지는 않는다(교차 확인 현황: `spec.md` "N1~N11 교차 확인 현황").

### 리스크

- **배포 = push**: `main`의 모든 push가 운영을 재시작한다(LF-03). 이 SPEC의 run-phase 커밋도 예외가 아니고, `deploy.yml`을 바꾸는 커밋은 배포 동작 자체를 바꾼다. 교체된 smoke를 싣는 첫 배포는 진단 플래그가 미설정인 상태에서 돌아야 하고(REQ-B2CLAUNCH-013 (가)), smoke 실패는 재시작 뒤라 새 빌드가 이미 가동 중이다. PR에서 도는 CI가 없어(LF-16) 병합 전 자동 검증이 없다 — 이 SPEC의 시험은 로컬 실행 증거로 제출된다.
- **내부 시험의 노출**: 정책 준비 상태의 상담 API는 화면 플래그와 무관하게 누구에게나 열린다(LF-07). review 경로는 운영 호스트에서 쓰지 않는 것으로 문서화돼 있고(LF-09) 별도 환경이 없다. D-LAUNCH-01이 정해지기 전에는 내부 시험을 운영 호스트에서 할 수 있다고 가정하지 않는다. "내부 시험"의 세 용법이 서로 다르다(N2).
- **열려도 진짜가 아님**: `ENABLE_DIAGNOSIS_FLOW`+`DIAGNOSIS_ENGINE_READY`만 열면 01은 보이지만 02에 이르는 사용자가 없다(LF-09). 엔진 준비 증거(R-02) 없이 운영 호스트에서 `DIAGNOSIS_ENGINE_READY`를 `true`로 두는 것은 거짓 진술이다(REQ-B2CLAUNCH-012, DIAGNOSIS-001 REQ-B2CDIAG-025).
- **smoke 교체의 순서**: 교체가 병합·배포되기 전에 진단 플래그를 열면 배포가 빨개진다(L-05, LF-19). DIAGNOSIS-001의 트리거는 `ENABLE_DIAGNOSIS_DEV_STATES` 단독 열림을 다루지 않는다(N4).
- **기록 커밋의 자기 무효화**: 기록을 추적 문서로 커밋하면 배포가 일어난다. 대상을 덮는 파일 집합의 내용으로 정의하고 기록 파일은 어느 집합에도 넣지 않는다(REQ-B2CLAUNCH-005, AC-B2CLAUNCH-005). 이 검증이 빠지면 READY를 기록하는 행위가 READY를 무효화한다(형제 CONSULTOPS-001 review-3 N-1).
- **공개 저장소**: go/no-go·서명 기록에 실제 값(시크릿, 연락처, 진단 문장, 법적 판단 세부)이 들어가면 공개된다(LF-15). D-LAUNCH-04 전에는 기록을 커밋하지 않는다. REQ-B2CLAUNCH-007과 AC-B2CLAUNCH-007이 점검하며 알려지지 않은 실제 값의 유출은 표지값이 보지 못한다.
- **재시작 환경 재읽기 미검증**: 단계 변경·롤백이 모두 재시작에 의존하는데 환경 재읽기가 미검증이다(LF-17). 형제 E-03이 상담 플래그에 한정된 문구라 진단 플래그에는 R-04가 같은 관측을 요구한다(N7).
- **법적 고지 표면의 불일치**: 01·02·03 푸터가 서로 다른 미완 상태이고(LF-13) 03만 형제가 다룬다. 푸터 변경은 화면 시각 기준선과 완료된 SPEC에 닿는다(N5).
- **형제 초안의 변동**: ENGINE-001·CONSULTOPS-001은 아직 `draft`(plan 브랜치에만 있고 run 전)라 항목 식별자와 줄 번호가 바뀔 수 있다. 참조 줄은 식별자 조회와 값 비교로 낡음을 잡는다(REQ-B2CLAUNCH-004, EV-L3).
- **점검기의 한계**: 이 SPEC의 게이트는 절차와 점검기이고 운영 호스트에서 환경을 손으로 바꾸는 것을 막지 못한다(AC-B2CLAUNCH-002, N11). 상담 쪽에는 런타임 게이트가 없다.
- **관측 도구 없음**: `package.json`에 분석·관측 의존성이 없다(LF-16). 사후 관측은 새 수단을 도입하지 않으면 사람이 읽는 절차다.
- **Tier 상한**: 요구사항·AC가 Tier M 상한 16/16이다(N10).

## §C. Pre-flight

- [ ] `git status`가 이 SPEC 디렉터리와 형제 SPEC 두 디렉터리 외에 깨끗하고 `git fetch origin main` 후 `git rev-list --count --left-right origin/main...HEAD`에 divergence가 없다.
- [ ] `moai session list --json --filter-spec=SPEC-B2C-LAUNCH-001`로 동시 세션을 확인한다(이 세션에서는 `moai` 명령이 PATH에 있는지 확인한 결과를 `progress.md`에 적었다).
- [ ] D-LAUNCH-04 결정 기록이 `progress.md`에 있다(없으면 M1 이후 진입 불가).
- [ ] 직전 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm test:e2e`, `pnpm verify:flag-runtime` 기준선을 기록한다(새 결함과 기존 결함 구분).
- [ ] plan-auditor PASS와 Implementation Kickoff Approval 완료. 진행 모드 축(자율/반자율)과 N9의 커밋 경로 선택은 승인 때 정한다.
- [ ] 운영 호스트·운영 DB 접근과 `deploy.yml` 변경의 `main` 병합이 필요한 단계는 사용자의 별도 지시가 있을 때만 수행한다.

## §D. Constraints

- **플래그 불변**: 이 SPEC의 산출물 중 시험·하네스가 아닌 실행 가능한 코드·설정·스크립트·워크플로는 어떤 노출 플래그도 `true`로 설정하는 지점을 만들지 않는다. 시험·하네스는 임시 서버 환경을 만들므로 예외로 분류한다. 운영자에게 설정을 지시하는 런북 문장은 REQ-B2CLAUNCH-002·008·012의 순서를 따른다.
- **운영 변경 금지**: 운영 DB 쓰기·마이그레이션, 운영 플래그·환경 변경, 운영 호스트 재시작, `main` 병합, 워크플로 변경의 병합은 이 SPEC의 범위가 아니다. 필요한 경우 사람의 별도 승인을 받는다.
- **값·문구 금지**: 담당 창구·담당자, 연락 기한·SLA, 상태 이름, 동의·정책 문구, 법적 결론, 수치, URL, 보관 위치를 이 SPEC 문서에 적지 않는다(결정 대기 항목).
- **형제 불변**: 형제 SPEC과 CONSULT-001 본문을 수정하지 않는다. 필요한 변경은 N1~N11로 기록한다. 03·02 화면의 시각 기준선 동결(REQ-B2CCONSULT-025, REQ-B2CRESULT-025)은 이 SPEC도 따른다.
- **공개 저장소**: 시크릿, 실제 사용자 입력, 담당자·서명자의 연락처와 개인 식별 정보, 법적 판단 세부를 이 저장소의 추적 파일에 커밋하지 않는다(REQ-B2CLAUNCH-007). 값을 담는 기록의 위치는 D-LAUNCH-04가 정한다.
- **고정 리터럴 표지값 금지**: AC-B2CLAUNCH-007의 표지값은 실행 시점에 만들고 어떤 추적 파일에도 고정 값으로 적지 않는다.
- 시간 추정은 쓰지 않는다. 우선순위와 선후 관계로만 표기한다.

## §E. Self-Verification (plan-phase)

- [x] GEARS 요구사항 16건(Tier M 상한 16)
- [x] AC 16건(Tier M 상한 16), 모든 AC에 검증·통과 판정·선결, 서명이 필요한 AC는 역할 명시
- [x] Out of Scope에 `### Out of Scope —` H3와 `-` bullet
- [x] 코드·운영 사실에 `path:line`과 구분(읽음/관측/검색/미검증)
- [x] 결정 대기 항목을 선점하는 요구사항이 없음(조건부 또는 결과 중립)
- [x] 확인 마커는 `spec.md` Open Clarification에만 둠
- [x] 실행한 오라클(명령)과 결과를 `progress.md`에 기록하고 맹점을 AC에 적음
- [ ] plan-auditor 독립 감사 — **오케스트레이터가 수행**(이 문서는 감사 결과를 주장하지 않는다)

## §F. Milestones (후속 `/moai run SPEC-B2C-LAUNCH-001`의 실행 계획)

바뀔 가능성이 큰 순서다. 모든 마일스톤은 TDD로 RED 실패 출력을 먼저 확보한 뒤 GREEN으로 구현한다. 경로는 결정 전의 **후보**다.

### M1. 기록 모델·점검기 (타입 인터페이스, 되돌리기 가장 어려움)

- 선행: D-LAUNCH-04 결정 기록(형식), D-LAUNCH-05 기록(`결정 대기` 칸).
- 산출: 런북 골격(`.moai/docs/launch-gate-runbook.md`)의 단계 표와 항목 표(L-01~L-09, R-01~R-05), 단계 표 파서, go/no-go 기록 모델과 파서, 항목 점검기(대상 값·사건·표면 적용·`결정 대기` fail-closed·실행 환경 `local`/`production` 명시 입력과 운영 한정 항목 L-01·L-05·R-04의 적용 구분·로컬 시험 판정 출력과 I 서명 검사), 형제 참조 줄 조회, 서명 점검, 법무 확인 기록 검사기, 표지값 검사.
- TDD: RED — 빈 칸·열거 밖 값·자체 판정 칸을 가진 기록을 파서가 통과시키거나 `spec.md` §2.4 표를 거부하면 실패(AC-001, AC-003), 열일곱 fixture(`production` 양성·음성과 로컬 시험 판정의 양성·음성(R-02·R-03 필수 포함), 실행 환경 입력 오류 포함)에서 점검기가 틀린 종료 코드를 내면 실패(AC-002), 기록 파일이 덮는 파일 목록에 들어가면 통과하는 시험(AC-005), 서명 뒤 `UNVERIFIED`가 된 기록이나 서명 기록이 없는 로컬 시험 판정을 통과시키는 시험(AC-008), 상태 칸에 출력 전용 표지 `해당 없음(local)`이 있는 기록을 통과시키는 시험(AC-003), 법적 결론 칸이 있는 기록을 통과시키는 시험(AC-006), 형제 식별자 조회 실패를 통과시키는 시험(AC-004). GREEN — 파서·점검기.
- 후보 파일: `lib/launch/stage-table.ts`, `lib/launch/gate-record.ts`, `lib/launch/legal-confirmation.ts`(+각 시험), `scripts/check-launch-gate.ts`(+시험).
- 관련: REQ-B2CLAUNCH-001·002·003·004·005·006·007·008.

### M2. 법적 고지 표면 (사용자 노출 화면)

- 선행: D-LAUNCH-09 결정 기록, N5 확인(완료된 SPEC amendment, design 경로 필요 여부, 시각 기준선).
- 산출: 푸터 요소 분류 시험과 현황 기록, 결정에 따른 푸터 변경(목적지 연결·표시 통일·제거·유지 중 결정된 것), **L-08 G 차단의 표면별 점검기**(후보 `lib/launch/legal-notice-gate.ts`) — S1(01·02 푸터 여섯 요소)은 D-LAUNCH-09 결정과 이 SPEC의 요소별 목적지 기록으로만 G를 판정하고, S2(03)는 CONSULTOPS-001 D-OPS-04의 6개 요소(03 계열)를 입력으로 받아 목적 벡터가 S2를 여는 경우에만 6개 전부를 요구한다. 아직 열지 않는 S2의 미확정은 S1의 G 판정을 막지 않는다(5차 수정안으로 정정). D-OPS-04 자체의 확정 여부는 CONSULTOPS-001의 기록을 그대로 입력으로 받으며 이 점검기가 대신 판정하지 않는다.
- TDD: RED — 푸터 요소가 기록과 다른 분류를 내는 시험(AC-015 시나리오 1), S2 요소 미확정만으로 S1의 G 판정이 BLOCKED되는 시험 또는 S1 요소 하나가 목적지 없음인데 S1의 G 판정이 BLOCKED되지 않는 시험(AC-015 시나리오 2). GREEN — 구현.
- 후보 파일: `components/diagnosis/diagnosis-footer.tsx`, `components/result/result-footer.tsx`, `components/consult/consult-footer.tsx`와 각 `.test.tsx`, `lib/launch/legal-notice-gate.ts`(+시험), `e2e/`, 필요하면 `scripts/visual-verify.ts`(기준선 동결 범위 내에서만).
- 관련: REQ-B2CLAUNCH-015.

### M3. 노출 기록·플래그 조합표·순서 (절차와 로컬 관측)

- 선행: D-LAUNCH-01·02·03 결정 기록, N2·N6 확인.
- 유의(2차 정밀 교정): D-LAUNCH-01 (e)·D-LAUNCH-03 Q2 (4) 결정에 따라 첫 내부 시험은 로컬 실행에 한정되며 운영 호스트의 게이트 상태 벡터를 바꾸지 않는다(`spec.md` §2.4 "로컬 시험 판정"·"로컬 시험 판정과 운영 단계의 구분" 참조) — 이 마일스톤의 "교차 조합 로컬 도달 관측"은 게이트 함수·경로의 일반 검증이며 운영 노출 확대의 증거로 쓰지 않는다.
- 산출: 노출 기록 검사기, 조합표 단위 시험, 부팅 불가 조합 시험, 교차 조합 로컬 도달 관측(`scripts/verify-gate-reachability.ts`), 전환 목록 점검기, `DIAGNOSIS_ENGINE_READY` 설정 단계 점검과 저장소 코드 오라클.
- TDD: RED — 표와 함수 출력이 어긋나거나 시크릿 없이 정책 준비가 부팅되거나(AC-010), 도달 경로가 빠진 노출 기록을 통과시키거나 화면 닫힘 상태의 접수 API 관측이 틀리거나(AC-009), 순서 밖 벡터를 거치는 전환을 통과시키거나(AC-011), R-02 없이 `DIAGNOSIS_ENGINE_READY`를 참으로 설정하는 단계를 통과시키면 실패(AC-012). GREEN — 구현.
- 후보 파일: `lib/diagnosis/flags.gate-table.test.ts`, `lib/env.test.ts`, `scripts/verify-gate-reachability.ts`, `scripts/check-launch-transitions.ts`, 런북 절차 절.
- 관련: REQ-B2CLAUNCH-009·010·011·012.

### M4. smoke 검사 교체 (워크플로 변경)

- 선행: D-LAUNCH-06 결정 기록, N4·N9 확인, L-01 기준선 관측이 가능한지(교체를 싣는 첫 배포의 진단 플래그 상태).
- 산출: 설계에 따른 smoke 검사와 시험(로컬 서버 일곱 상태), `deploy.yml` 변경안(이 마일스톤은 변경을 만들되 `main` 병합은 별도 운영 행위).
- TDD: RED — 닫힌 상태에서 검사가 실패하거나 열린 상태에서 실패하거나 500·CSS 누락을 통과시키면 실패(AC-013). GREEN — 구현.
- 후보 파일: `scripts/smoke-check.ts`(+시험), `.github/workflows/deploy.yml`.
- 관련: REQ-B2CLAUNCH-013, L-05.

### M5. 롤백 · 사후 관측

- 선행: D-LAUNCH-07·08 결정 기록, 형제 E-03(R-04)의 형식.
- 유의(5차 수정안): L-06 사유 목록은 D-LAUNCH-07 결정대로 CONSULTOPS-001 §2.4 작성자 기본 목록(4종)이다. 진단 표면 전용 2종(잘못된 판정/결과 매핑 확인, 지원 범위 밖 결과 노출 확인)은 사용자 확인 대기인 후속 변경안이라 사유 목록에 넣지 않는다(`spec.md` D-LAUNCH-07의 "후속 변경안"). 선언·실행 역할은 선언 (iii), 실행 (1)이다.
- 산출: 롤백 로컬 시험 수행(`scripts/verify-rollback-dark.ts`), 롤백 절차 문서, 사후 관측 기록 검사기.
- TDD: RED — 롤백 뒤 placeholder·503·행 해시·시크릿 설정 유지가 어긋나는 시험(AC-014), 관측 필드가 빠진 기록을 통과시키는 시험(AC-016). GREEN — 구현.
- 관련: REQ-B2CLAUNCH-014·016, L-06·L-07·L-09.

### M6. 런북 완성 · 문서 연결 (마지막, 기계적)

- 선행: M1~M5의 해당 결정.
- 산출: 런북 완성(단계 이행 절차·서명 기록 양식·항목 상태 갱신 절차), 형제 런북과의 연결(기록만, 형제 수정 없음), `.moai/docs/runtime-runbook.md` §11에서 새 런북으로의 안내(결정에 따라), 서명 기록은 D-LAUNCH-04가 정한 위치에 둔다.
- 관련: 전체.

## §G. Anti-Patterns

- "배포 완료"를 "출시 가능"이나 "공개됨"으로 서술하지 않는다(REQ-B2CLAUNCH-001). 서명 없이 노출 확대를 하지 않는다(REQ-B2CLAUNCH-008).
- 담당자·기한·문구·법적 결론·수치·URL을 이 SPEC이나 코드가 임의로 정하지 않는다(결정 대기).
- 형제 SPEC이 소유한 증거를 이 SPEC이 대신 판정하거나 항목 목록을 복제하지 않는다(REQ-B2CLAUNCH-004). ENGINE-001의 D-ENGINE-05·09를 선점하지 않는다.
- 운영 호스트에서 `DIAGNOSIS_ENGINE_READY`를 엔진 준비 증거 없이 `true`로 두지 않는다(REQ-B2CLAUNCH-012).
- 교체된 smoke가 병합·배포되기 전에 진단 플래그를 열지 않는다(L-05).
- 기록을 담은 파일을 어느 항목의 덮는 파일 집합에도 넣지 않는다(REQ-B2CLAUNCH-005). 이미 일어난 관측을 무효화 사건 뒤에도 `READY`로 두지 않는다.
- 미해소 `결정 대기` 칸을 면제로 읽지 않는다(§2.4). 고정 리터럴 표지값을 추적 파일에 적지 않는다.
- 법적 고지 요소의 존재나 문구에 대해 이 SPEC이 법적 요건을 단정하지 않는다(REQ-B2CLAUNCH-006, REQ-B2CLAUNCH-015).
- 결정 대기 항목을 요구사항 문구로 먼저 정하지 않는다. 옵션이 요구사항을 바꾸게 되면 그 요구사항의 amendment를 충돌(N1~N11)로 기록한다.
- 운영에서 재읽기가 관측되지 않은 재시작 전략으로 단계 변경·롤백을 하지 않는다(R-04).

## §H. Cross-References · Dependencies

- `spec.md` §2.2·§2.5 — 소유 경계와 의존성. 이 SPEC은 형제의 증거를 식별자로 참조하고 `depends_on`을 두지 않았다(의존이 SPEC 상태가 아니라 형제 증거 항목의 상태이기 때문이다).
- `spec.md` Open Clarification N1~N11 — 형제 SPEC·완료된 SPEC과의 충돌·소유 확인.
- `.moai/specs/SPEC-B2C-CONSULTOPS-001/spec.md` §2.2·§2.4(E-01~E-18, EV-1~EV-7, N7), `.moai/specs/SPEC-B2C-ENGINE-001/spec.md`(REQ-B2CENGINE-023, N5·N7)와 `design.md`(§9.2, §9.3).
- `.moai/specs/SPEC-B2C-DIAGNOSIS-001/`(REQ-B2CDIAG-017·023·024·025, AC-B2CDIAG-024, `plan.md` 11(b)).
- `.moai/docs/runtime-runbook.md` §11(플래그 변경 절차 검증됨·미검증), §12(인스턴스·`x-forwarded-for`), `.moai/reports/merge-readiness/SPEC-B2C-CONSULT-001/MERGE-CHECKLIST.md` §5 "상담·진단 기능 활성화 전" 표 — 이 SPEC이 그 항목들의 단계 구조를 이어받는다.
- 구조 선례: `.moai/specs/SPEC-PILOT-READY-001/spec.md`(REQ-PILOT-READY-016), `.moai/specs/SPEC-PILOT-OPS-001/spec.md`(REQ-PILOT-OPS-006).
