# Progress — SPEC-B2C-LAUNCH-001

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: draft`
- 이 문서는 plan-phase 초안이다. `audit-ready` 판정과 완료 시각은 plan-auditor 감사 통과 이후 오케스트레이터가 기록한다. 이 초안은 아직 어떤 plan-auditor 감사도 받지 않았다(§G).
- 작성된 산출물(Tier M): `spec.md`, `plan.md`, `acceptance.md`, `progress.md`(이 파일). 모두 `.moai/specs/SPEC-B2C-LAUNCH-001/` 안의 커밋되지 않은 파일이며 `main@99993bf` 위의 초안이다.
- 요구사항 16건(Tier M 상한 16), AC 16건(상한 16). 상한에 맞추려고 합친 후보와 뺀 후보는 아래 "Plan-phase Observations" 4번에 적었다.
- 응용 코드·설정·워크플로·환경 파일·기존 SPEC 디렉터리·감사 보고서는 변경하지 않았고, 운영 VM·운영 DB·운영 플래그에는 접근하지 않았다.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_

## §F Phase 4 Mode Selection

_<pending — 오케스트레이터가 run-phase 첫 `Agent()` 위임 전에 기록>_

## §G Plan-Auditor Iteration Log

이 표는 실제 plan-auditor 호출 결과만 기록한다. 아직 호출이 없어 행이 없다.

| Iteration | Date | Score | Verdict | Key Findings | Reflected Changes |
|---|---|---|---|---|---|

## Open Decisions for User

모두 **미결정**이다. 옵션 전문은 `spec.md` "설계 대안", 결정 행은 `plan.md` §B다. 아래 추천은 결정이 아니며 각 추천은 전제("Recommended when")를 함께 적었다. 이 SPEC은 담당 창구·담당자, 연락 기한·SLA, 상태 이름, 동의·정책 문구, 법적 결론, 수치, URL, 보관 위치를 정하지 않는다.

| ID | 질문 | 옵션 | 추천 + 전제 | 차단하는 것 | 결정 주체 |
|---|---|---|---|---|---|
| D-LAUNCH-01 | 내부 시험을 어디서 어떻게 노출하는가(정책 준비 상태의 접수 API는 화면 플래그와 무관하게 열리고 운영 호스트는 하나다) | (a) 별도 환경 (b) 운영 호스트 앞단의 접근 제한(이 저장소 밖) (c) 앱 안 허용 목록·접근 코드(코드 변경) (d) 제한 없이 수용하고 위험을 기록 (e) 내부 시험을 로컬 실행으로 한정 | (e) — 별도 환경이 없고 운영 호스트에서 정책 준비 상태의 접수 API가 누구에게나 열린다는 점을 내부 시험이 감수하기 어려울 때. 별도 환경을 마련할 수 있으면 (a). (b)는 운영 책임자가 프록시를 바꿀 수 있고 외부 차단을 저장소 밖 관측 기록으로 남길 수 있을 때 | 내부 시험 공개 단계, L-02, L-03 | 제품 책임자, 운영 책임자, 엔지니어링 |
| D-LAUNCH-02 | 내부 시험 참여자는 어떤 역할이고 진단 쪽 데이터 규칙은 무엇인가(상담 쪽은 CONSULTOPS-001 D-OPS-10 (Q2) 참조) | 참여자 (a) 내부 역할만 (b) 내부 역할과 초대한 외부 참여자 역할 (c) (a) 또는 (b)에 보험 도메인 전문가 역할을 포함 / 데이터 규칙 (1) 합성 입력만 (2) 참여자 본인 경험 입력 허용 (3) 엔진 연결 여부에 따라 달리함 | 참여자 (a), 데이터 규칙 (1) — 내부 시험이 로컬 또는 접근이 제한된 환경에서 이뤄지고 진단 동의 상세 문구가 아직 placeholder일 때 | L-03, 내부 시험 공개 단계 | 제품 책임자, 법무, 운영 책임자 |
| D-LAUNCH-03 | 진단·상담 표면을 어떤 순서로 여는가 | Q1 일반 공개 순서: (a) 진단 먼저, 상담은 이후 별도 노출 확대 (b) 상담 먼저, 진단은 이후 (c) 함께 (d) 표면별 개별 공개 / Q2 내부 시험의 표면 범위: (1) 내부 시험은 모든 표면 (2) 진단만 (3) 상담만 (4) Q1이 정한 첫 표면만 | Q1 (a), Q2 (4) — 엔진 준비 증거와 진단 동의 문구 확정이 상담 운영 증거보다 먼저 갖춰질 수 있고 상담의 일반 사용이 실제 결과를 기다린다는 ENGINE-001의 서술을 순서로 지키고 싶을 때 | REQ-B2CLAUNCH-011, AC-B2CLAUNCH-011, 단계별 허용 벡터 | 제품 책임자, 운영 책임자, 엔지니어링 |
| D-LAUNCH-04 | go/no-go 기록의 서명자·형식·보관은 무엇인가(저장소가 공개이고 `main` push마다 배포된다) | 서명자 (a) 제품 책임자 (b) 제품 책임자 + 운영 책임자 (c) (b) + 법무 (d) (c) + 보험 도메인 전문가 / 형식 (i) 마크다운 문서 (ii) 구조화 데이터 파일과 점검기 입력 (iii) 외부 문서 시스템과 저장소 안의 참조 / 보관 (α) 저장소 추적 문서 (β) 비추적 로컬 폴더 (γ) 저장소 밖과 저장소 안의 참조 | 서명자 (c), 형식 (i), 보관은 저장소 안에는 항목 식별자·상태·참조만 두는 (α)와 서명 세부를 담는 기록은 (γ) — 저장소가 공개로 유지되고 기록에 법무 확인 항목이 있으며 공개할 수 없는 값을 담는 기록을 저장소 밖에 둘 수 있을 때 | M1, 모든 서명 기록, AC-B2CLAUNCH-003·006·007·008의 일부 | 제품 책임자, 엔지니어링(법무: 공개 가능 범위) |
| D-LAUNCH-05 | 일반 공개에 필수인 준비 항목은 무엇인가(`결정 대기` 칸: L-02 G, R-02 I, R-03 I, R-05 G, D-ENGINE-09 G 단계 서명) | (a) 대상 칸 전부 필수(면제 없음) (b) 칸별로 필수 또는 `해당 없음`을 사유와 함께 기록 | (a) — 일반 공개를 서두를 이유가 없고 항목별 면제 사유에 서명할 역할이 아직 정해지지 않았을 때 | 일반 사용자 공개 판정, M1의 항목 표 확정 | 제품 책임자, 법무, 운영 책임자(보험 도메인 전문가) |
| D-LAUNCH-06 | `deploy.yml` smoke 검사를 어떻게 교체하는가 | 설계 (a) 두 상태 수용 (b) 상태 인지 (c) 상태 비의존 검사만 + 상태는 로그로 (d) (a)~(c)에 `/consult`·접수 API 검사를 더함 / 위치 (i) 워크플로의 인라인 셸 (ii) 저장소 스크립트 | 설계 (a), 위치 (ii) — 열림 상태의 표지(`<title>` 등)를 로컬에서 안정적으로 관측할 수 있고 배포 실패를 상태 불일치가 아니라 배포 건강(2xx·CSS 청크)에 묶고 싶을 때 | L-05, 모든 진단 플래그 변경, AC-B2CLAUNCH-013 | 엔지니어링, 제품 책임자 |
| D-LAUNCH-07 | 롤백은 누가 선언·실행하고 어떤 사유로 하는가 | 선언 (i) 운영 책임자 (ii) 제품 책임자 (iii) 둘 중 누구나 (iv) 사유 종류별로 다름 / 실행 (1) 운영 호스트 접근 보유자 (2) 선언 역할이 직접 / 사유 목록: CONSULTOPS-001 §2.4의 작성자 기본 목록을 쓰고 진단 표면의 사유를 더할지, 종류를 빼거나 더할지 | 선언 (iii), 실행 (1) — 롤백이 저장된 행과 시크릿을 지우지 않는 되돌림이라 오선언 비용이 낮다고 두 역할이 판단할 때 | L-06, REQ-B2CLAUNCH-014, 모든 노출 확대 | 제품 책임자, 운영 책임자 |
| D-LAUNCH-08 | 노출 확대 뒤 무엇을 누가 관측하는가 | 내용 (a) 노출 확대 직후의 상태 확인(효과적 플래그 상태·smoke·프로세스 상태)만 (b) (a)에 접수 행 존재와 오류 응답 확인(상담)을 더함 (c) (b)에 새 관측 수단 도입을 더함(별도 SPEC이 필요하다) (d) 관측 없음과 위험 기록 / 담당 (1) 운영 책임자 (2) 제품 책임자 (3) 엔지니어링 (4) 단계·표면별로 다름 | 내용 (b), 담당 (1) — 접수 건수가 사람이 직접 확인할 수 있는 수준이고 새 관측 도구를 도입하지 않을 때 | L-09, REQ-B2CLAUNCH-016 | 운영 책임자, 제품 책임자 |
| D-LAUNCH-09 | 01·02·03 법적 고지 요소는 어느 단계 전에 어떤 상태여야 하는가 | (1) 목적지(앱 안 페이지 또는 앱 밖 링크)를 갖춘 뒤에만 해당 단계로 진입한다 (2) "준비 중" 비활성 표시를 허용한다(03 푸터의 현재 방식) (3) 요소를 제거한다 (4) 현행 유지(01·02의 `href="#"` 포함) | 일반 공개(G)는 (1), 내부 시험(I)은 (2) — 법무가 "준비 중" 표시를 일반 방문자에게 허용하지 않는다고 판단할 때. 허용한다고 판단하면 G도 (2) | L-08, AC-B2CLAUNCH-015의 허용 칸 | 제품 책임자, 법무 |

### 결정 외 확인 사항

`spec.md` Open Clarification의 N1~N11은 결정이 아니라 기존 SPEC과의 충돌·소유 확인이다. 요약: N1 단계 정의 소유 이관과 형제 문구, N2 "내부 시험"의 세 용법(ENGINE `design.md:184`·CONSULTOPS-001·DIAGNOSIS-001), N3 E-08 G 면제와 E-17 I 면제의 확인, N4 완료된 DIAGNOSIS-001 smoke 트리거의 틈(`ENABLE_DIAGNOSIS_DEV_STATES` 단독), N5 01·02 푸터의 소유, N6 ENGINE-001 런타임 게이트와 조합표, N7 CONSULTOPS-001 REQ-B2CCONSULTOPS-013의 범위, N8 롤백 목표 범위(dark 복귀만), N9 run-phase 커밋 경로와 배포(Route A는 모든 커밋이 운영 재시작), N10 Tier 상한, N11 이행 집행의 한계.

## Plan-phase Observations

작성 중 확인한 사실과 불일치다. 이 SPEC의 요구사항이 아니라 오케스트레이터·감사자에게 전달하는 관찰이다.

### 1. SPEC ID 정규식 불일치

- SSOT(`.claude/rules/moai/development/spec-frontmatter-schema.md`)의 `id` 제약 `^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$`는 도메인 세그먼트에 하이픈이 없다. `echo SPEC-B2C-LAUNCH-001 | grep -cE '^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$'` → `0`이고 선례 `SPEC-B2C-CONSULT-001`도 `0`이다. manager-spec의 사전 점검 정규식은 실행 결과 `PASS`였다(`ID="SPEC-B2C-LAUNCH-001"; [[ "$ID" =~ ^SPEC(-[A-Z][A-Z0-9]*)+-[0-9]{3}$ ]] && echo PASS || echo FAIL`). 선례 형식 `SPEC-B2C-<ONE-TOKEN>-NNN`을 유지했고 스키마는 이 SPEC 범위가 아니다. `grep -rln "id: SPEC-B2C-LAUNCH-001" .moai/specs`는 이 SPEC의 `spec.md` 하나만 찾았다.

### 2. 오케스트레이터 증거 팩과 지시문의 오류·누락

- **지시문의 인용 오류**: 지시문은 DIAGNOSIS-001 `spec.md:34`를 "`ENABLE_DIAGNOSIS_DEV_STATES`는 운영에서 unset이어야 한다"의 근거로 든다. `:34`는 placeholder 교체 조건 (1)~(4)이고 `ENABLE_DIAGNOSIS_DEV_STATES`를 언급하지 않는다(`grep -n "ENABLE_DIAGNOSIS_DEV_STATES"`는 `:21,24,90,104`). 근거는 REQ-B2CDIAG-017(`:90`)과 REQ-B2CDIAG-025(`:104`)다. 이 SPEC은 후자를 인용했다.
- **팩 §D의 줄 번호**: `<title>보상 진단</title>`의 위치를 `app/page.tsx:53-57`로 적었으나 `generateMetadata`는 `:51-56`이고 제목 삼항식은 `:54`다. 사소하다.
- **팩 §D의 식별자 "미검증"**: `<title>`과 "열린 상태의 응답에 `서비스 준비 중입니다`가 없다"는 같은 날의 과거 로컬 실행 로그(저장소 밖 백업 폴더)가 SSR 응답에서 관측했다. `data-testid` 두 개는 코드에 있으나(`diagnosis-flow.tsx:396`, `step-input.tsx:160`) 어떤 응답에서도 관측되지 않았다. LF-12에 나눠 적었다.
- **팩의 누락 — 01·02 푸터**: 팩은 03 푸터의 비활성 링크만 적었다. 01은 `<a href="#">` 셋, 02는 `<a href="#">` 둘과 텍스트 `고객 문의: 준비 중`이어서 세 표면이 서로 다르다(LF-13).
- **팩의 누락 — API는 `ENABLE_CONSULT_FLOW`와 독립**: 팩 §B는 상담 플래그가 `/consult`와 `/result`에만 영향을 준다고 적는다. 사실이나, 접수 API가 `ENABLE_CONSULT_FLOW`를 읽지 않아 `CONSULT_POLICY_READY=true`(와 시크릿)만으로 접수가 열린다는 점(LF-07)과 과거 로컬 실행 기록의 `consult=false policy=true`에서 `api=201`(LF-11)은 적혀 있지 않다.
- **팩의 누락 — `verify:flag-runtime`의 교차 공백**: 시작 조합 8개는 32 원조합 중 8개이고 진단 `production` 경로 열림과 상담 화면 열림이 함께 있는 조합은 없다(LF-11). 팩은 "Not in CI"만 적었다.
- 확인되어 팩이 맞다: `deploy.yml:3-7,43,61,96-101`과 smoke 단계의 순서(`pm2 restart` 뒤 smoke), `flags.ts`의 엄격 일치와 진단·상담 게이트 계산, `step-loading.tsx:54-62`, `consent-detail-content.tsx:13-18`, `lib/env.ts:143-145`, `app/consult/page.tsx:45`의 닫힌 placeholder, `consult-consent-group.tsx:68`, 플래그 5종의 병합 전 미설정(MERGE-CHECKLIST §2), PR CI 없음.

### 3. 형제 SPEC·완료된 SPEC의 결함 또는 틈 (보고만 하고 고치지 않았다)

- **DIAGNOSIS-001의 smoke 교체 트리거(완료된 SPEC)**: REQ-B2CDIAG-023과 AC-B2CDIAG-024는 `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 모두 `true`가 될 때로 한정한다. `ENABLE_DIAGNOSIS_DEV_STATES` 단독으로도 게이트가 열려 현재 smoke가 실패한다(LF-19, 이 세션이 두 게이트 함수를 호출해 확인한 `D=1` 행). CONSULTOPS-001 §2.2와 ENGINE-001 §2.2가 같은 "두 플래그" 서술을 이어받았다.
- **"내부 시험"의 세 용법**: ENGINE-001 `design.md:184`(`reviewEnabled`, 비프로덕션 전용), CONSULTOPS-001 `spec.md:112,274-278`(알려진 참여자의 시험 데이터 제출, 운영 호스트 또는 로컬), DIAGNOSIS-001 REQ-B2CDIAG-017·025(review 경로는 운영에서 unset)가 서로 맞지 않는다(N2).
- **CONSULTOPS-001 REQ-B2CCONSULTOPS-013의 범위**: "상담 플래그나 시크릿"만 적었으나 E-03의 표지 변수 관측은 변수 종류에 의존하지 않는다. 진단 플래그를 바꾸는 재시작은 어느 SPEC의 요구에도 들어 있지 않다(R-04가 메운다, N7).
- **01·02 푸터의 소유 없음**: CONSULTOPS-001 D-OPS-04 (d)는 03 푸터만 다룬다(N5).
- **CONSULTOPS-001 F-21**: 저장소가 공개라는 서술에 "이 세션 미확인"이 붙어 있다. 이 세션이 GitHub API 조회로 확인했다(LF-15).
- **CONSULTOPS-001 review-3의 남은 결함 N-1**: 증거 기록 파일이 어느 항목의 덮는 파일 집합에도 없다는 것을 검증하는 AC가 없다. 이 SPEC은 AC-B2CLAUNCH-005에 그 검증을 넣었다. 그 SPEC의 N-2("최소 4종" 대 "빼거나")도 남아 있다 — 이 SPEC은 해당 사유 목록을 "작성자 기본 목록"으로만 인용해 같은 표현 충돌을 피했다.
- **ENGINE-001 review-3의 D30**: AC-B2CENGINE-023 시나리오 5의 grep 후보 명령이 `["…"]`·JSON 키 형태를 놓친다. 이 SPEC의 AC-B2CLAUNCH-012는 그 형태를 잡는 패턴을 실행해 시험했고(아래 6번) 경로 목록에 `scripts`, `package.json`, `.env.local.example`을 더했다. ENGINE-001의 후보 명령 자체는 고치지 않았다.
- **ENGINE-001 `spec.md:61`과 노출 순서**: 상담의 일반 사용자 대상 사용이 실제 결과를 기다린다는 서술 때문에 D-LAUNCH-03 Q1 (b)(상담 먼저)를 택하면 상담의 일반 공개 시점에 CONSULTOPS-001 E-17(G 필수)이 엔진 증거 부재로 `READY`가 아닐 수 있다. 어느 옵션도 양립 불가로 적지 않고 옵션으로 중립 서술했으며 결정은 사용자에게 남겼다.

### 4. 요구사항 16건 상한 조정

작성 중 19~20건이 되어 아래와 같이 줄였다. 어느 것도 정보를 버린 것이 아니라 항목 정의표나 다른 REQ·AC로 이동했다.

- "smoke 교체는 어떤 진단 플래그 변경보다 먼저"는 별도 REQ를 두지 않고 항목 L-05(필수)와 REQ-B2CLAUNCH-002의 게이트로 집행하게 했다. AC-B2CLAUNCH-002의 fixture (사)(아)가 시험한다. REQ-B2CLAUNCH-013 (가)가 교체를 싣는 첫 배포의 상태를 다룬다.
- "진단 플래그 변경 재시작에도 재읽기 관측" 요구는 REQ가 아니라 항목 R-04로 뒀다(CONSULTOPS-001 E-03 참조).
- "롤백 선언 역할·사유 목록 기록"은 REQ가 아니라 항목 L-06으로 뒀고 AC-B2CLAUNCH-014가 문서 열람으로 확인한다.
- "내부 시험에서 일반 공개로의 이행 게이트"는 별도 REQ를 두지 않고 REQ-B2CLAUNCH-002·008과 §2.4의 한계 서술로 흡수했다.
- 항목 필드·무효화 사건·기록 파일 제외는 REQ-B2CLAUNCH-005 하나로 합쳤다(대상 정의 한 곳).
- **쓰지 않은 후보**: 이전 단계로의 부분 롤백(N8), 표면별 개별 단계(N10), 상담 접수의 런타임 게이트(N11). 사용자가 필요하다고 하면 Tier L 또는 SPEC 분할이 필요하다.

### 5. 확인하지 못한 것

- 병합 이후 운영 상태(플래그·가동 커밋·마이그레이션·인스턴스 수)는 관측하지 않았다. 자동 메모리에 병합 후 배포 성공을 적은 항목이 있으나 확인하지 않았고 근거로 쓰지 않았다.
- `pm2 restart`가 바뀐 환경을 다시 읽는지, 이후 `main` 배포의 평범한 재시작이 상태를 유지하는지는 어느 호스트에서도 관측하지 못했다(LF-17).
- `data-testid="diagnosis-flow"`·`data-testid="diagnosis-hero-title"`가 SSR 응답에 있는지는 관측하지 못했다(LF-12). `<title>`과 열린 상태의 문구 부재는 과거 로컬 실행 로그(저장소 밖 백업 폴더)에서만 보았고 그 로그가 현재 `main@99993bf`의 코드로 만든 것인지는 확인하지 못했다.
- `pnpm verify:flag-runtime`과 `pnpm build`를 이 세션이 실행하지 않았다(저장소 안의 쓰기 금지 지시와 빌드 산출물 때문이다). 로컬 서버 관측은 코드 읽기와 과거 로그에서 파생한 예상이다.
- `tsx`가 운영 VM에서 `pnpm install --frozen-lockfile` 뒤 실행 가능한지는 `db:migrate` 단계(`deploy.yml:43`)가 같은 방식으로 `tsx` 스크립트를 부른다는 정황뿐이고 관측하지 못했다.
- `moai` 명령은 이 셸의 PATH에 없었다(`command -v moai` → 없음). 그래서 `moai spec lint`, `moai session list`, `mcp__moai__*` 도구는 실행하지 못했다. 자체 점검은 수동 grep·awk·스크립트다.
- 저장소 밖 도달 제한 수단(프록시·방화벽 등), 실제 `.env*` 파일, 운영 PM2 저장 환경은 열지 않았다. 저장소에는 Nginx·ecosystem 설정이 추적돼 있지 않다(LF-17).
- 법적 요건, 개인정보처리방침·이용약관의 필요성이나 내용은 판단하지 않았다.
- 이 작성에는 GitHub API 조회(`api.github.com`, 공개 여부)를 썼고 URL은 그 조회에만 쓴 것이며 제품 값이 아니다.

### 6. Plan-phase 점검 명령과 결과

아래는 이 작성 세션이 현재 트리(`main@99993bf`, 커밋되지 않은 초안)에서 실행한 것이다.

- `git log -1 --format='%h %s'` → `99993bf feat(SPEC-B2C-CONSULT-001): 상담 신청(03) 화면·API 구현 (#22)`. `git status --short`(작성 시작 시) → 형제 SPEC 두 디렉터리만 `??`.
- **게이트 진리표**: 저장소 밖 임시 스크립트로 `lib/diagnosis/flags.ts`의 두 함수를 `node_modules/.bin/tsx`로 호출 → 진단 8행·상담 4행(§2.3과 같음). 엄격 일치 탐침 `"true"`만 참이고 `"TRUE"`, `"1"`, `"yes"`, `" true"`, `"true "`, `""`, 미설정은 거짓.
- `grep -cE "paths(-ignore)?:" .github/workflows/deploy.yml` → `0`. `grep -rn "서비스 준비 중입니다"`(앱 소스·워크플로) → `deploy.yml:97,98`과 `app/page.tsx:71`, `app/result/page.tsx:59`, `app/consult/page.tsx:45` 등(시험 파일 제외).
- 접수 API 플래그 읽기: `grep -n "ENABLE_CONSULT_FLOW\|shouldRenderConsult\|computeConsultFlags" app/api/consultations/route.ts lib/consult/*.ts`(시험 제외) → 0줄. `CONSULT_POLICY_READY` → `route.ts:42,45`. 인증·세션·출처 계열 이름 대소문자 무시 검색 → 라우트 파일 0줄, `next.config.ts` 0줄, 루트의 `middleware.ts`·`proxy.ts`·`src/middleware.ts`·`src/proxy.ts` 없음.
- **푸터 오라클**: `grep -rn 'href="#"' components app --include=*.tsx | grep -v '\.test\.'` → `diagnosis-footer.tsx:29`, `result-footer.tsx:8`(주석), `result-footer.tsx:35`. 넓힌 정규식 + 주석 줄 필터 → 두 줄(`diagnosis-footer.tsx:29`, `result-footer.tsx:35`). 샘플 시험: 첫 정규식은 `href='#'`·`href={"#"}`를 놓치고 넓힌 정규식은 모두 잡음.
- **`DIAGNOSIS_ENGINE_READY` 대입 오라클**: 패턴 파일 `DIAGNOSIS_ENGINE_READY[]"']*[[:space:]]*[=:][[:space:]]*["'`]?[^=[:space:]]`를 `grep -rnE -f`로 `app components lib scripts instrumentation.ts playwright.config.ts package.json .github .env.local.example`(시험 제외, 주석 줄 필터)에 적용 → `scripts/verify-flag-runtime.ts:174`, `:293` 두 줄뿐. 샘플 12줄 시험: 대입 일곱 형태는 일치, `ENV … true`·`??=`·`===` 비교 둘·주석은 불일치. 처음 쓴 정규식은 대괄호 안의 `]` 위치 오류로 `DIAGNOSIS_ENGINE_READY=true`조차 놓쳐 샘플 시험에서 발견해 고쳤다.
- **표지값 검색 메커니즘**: 실행 시점에 만든 무작위 값 둘로 `git grep -nF --untracked`를 저장소 전체에 → 일치 0줄(`exit 1`). 저장소 밖 임시 저장소(추적 1·비추적 1·무시 1)에서 같은 검색 → 비추적 파일만 찾음(양성·음성 대조). 값은 어떤 파일에도 쓰지 않았다.
- **표 파싱(`awk -F'|'`)**: `spec.md` §2.4 항목 정의표 — 행 14, 필드 수 9 ×14, I·G 칸 열거 밖 값 0, 증거 항목·마지막 칸 빈 칸 0, ` / ` 구분자 정확히 1개 ×14, 표면 값 `전체` 8·`S1` 4·`S2·S3` 1·`S1·S2` 1, I/G 조합 `필수/필수` 8·`결정 대기/필수` 2·`필수/해당 없음` 1·`필수/결정 대기` 1·`해당 없음/결정 대기` 1·`결정 대기/결정 대기` 1. 단계 표 — 행 3, 빈 칸 0, 필드 수 7 ×3. §2.3 진단 표 8행, 상담 표 4행. 증거 장부 LF-01~LF-20 20행.
- **개수**: REQ 정의 001~016(16건), AC 정의 001~016(16건), AC마다 인용한 REQ 번호가 같다(16/16 1:1). 각 AC 블록에 `검증:`·`통과 판정:`·`선결:`이 모두 있다(16/16, awk 블록 점검 누락 0). 확인 마커(대괄호 안에 확인 요청 문구와 N 번호를 넣은 줄) 검색: `spec.md` 11건(N1~N11 모두 정의), `plan.md`·`acceptance.md`·`progress.md` 0건. Out of Scope `### Out of Scope —` H3 5개와 `-` bullet 5개. 시간 추정 정규식(숫자 뒤에 일·주·개월·시간·분·초·영어 시간 단위가 붙는 형태) → 네 파일 0건(숫자와 단위를 붙인 짧은 샘플 세 개를 이 정규식이 잡는 것도 확인). 고정 표지값 접두사 검색 → 0건. 프런트매터 필드: 12개 필수 + `tier`, `related_specs`.
- **인용한 형제 식별자 존재 대조**: CONSULTOPS-001의 E-03·E-06·E-08·E-17, EV-1, N7, F-04·F-10·F-12·F-16·F-17·F-18·F-19·F-22, D-OPS-04·07·10·11·12, REQ-B2CCONSULTOPS-002·006·011·013·016, AC-B2CCONSULTOPS-011·015, ENGINE-001의 REQ-B2CENGINE-023, N5·N7, D-ENGINE-04·05·07·09·10, design §9.2·§9.3·§10.1·§10.5, DIAGNOSIS-001의 REQ-B2CDIAG-017·023·025, AC-B2CDIAG-024, CONSULT-001의 REQ-B2CCONSULT-005·025, RESULT-001의 REQ-B2CRESULT-025, REQ-PILOT-READY-016, REQ-PILOT-OPS-006을 해당 파일에서 `grep -F`로 찾아 모두 존재함을 확인했다(누락 0). 줄 번호 인용은 작성 중 해당 줄을 열어 확인했다.
- 작성 끝 `git status --short` → 세 디렉터리(`SPEC-B2C-CONSULTOPS-001/`, `SPEC-B2C-ENGINE-001/`, `SPEC-B2C-LAUNCH-001/`)만 `??`이고 추적 파일 수정은 0개다.
