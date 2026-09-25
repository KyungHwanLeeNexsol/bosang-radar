# 보상레이더 (bosang-radar)

> 최종 수정: 2026-09-22 (SPEC-B2C-RESULT-001 M6 — **② 보상 진단 결과**
> 화면 5개(02 Desktop + M02/M02-B/M02-C/M02-D Mobile 탭 4개) 구현 완료.
> `app/result/`·`components/result/*`·`lib/diagnosis/`가 신설됐고,
> `lib/diagnosis/handoff.ts`를 통해 ① 질문 입력 및 진단(01)의 골절 사례
> review 전용 fixture가 sessionStorage로 02에 인계된다. 담보 매칭
> 엔진은 여전히 미결정(§Roadmap A)이며, 02는 골절 사례 1종의 고정
> 데이터만 렌더링한다. 같은 브랜치 분기 시점(SPEC-B2C-DIAGNOSIS-001
> 병합 직후) 이후 main에는 별도로 "SPEC-B2C-DIAGNOSIS-001 완료·병합
> 반영" 기준문서 현행화가 진행되어 "01 질문 입력 및 진단" 흐름이
> 기능 플래그 뒤에 구현 완료됐음을 §읽는 법·§구조·공존 관계에 정정
> 반영했고, 담보 카드 3톤 상태 표기를 `design/MIGRATION-PLAN.md`와
> 동일하게 검토 대상/추가 정보 필요/가능성 낮음으로 통일했다 — 이번
> 병합으로 두 changeset이 하나로 합쳐졌다. 이전 개정: 2026-09-18
> (SPEC-B2C-FOUNDATION-001 M6) — B2B 전용 코드
> 삭제 실행 결과를 문서에 반영. `lib/auth/`·`app/cases/*`·`app/login/`·
> `app/api/**`·`components/evidence-item.*`·`proxy.ts`·B2B 전용
> E2E 13개·Better Auth 의존성은 삭제 완료됐고, `lib/pipeline/`(+
> 관련 observability/seed 파일)만 담보 매칭 알고리즘 decision gate로
> 보존 중이다 — 계획 대비 편차로 `lib/validation/case-input.ts`도 함께
> 보존됐다. 상세: §이전 방향, `structure.md` § 현재 구조. 그 이전 개정:
> 2026-09-18 문서 정합성 보정 — 디자인 현황(사용자용 화면
> 24개 + DEV ONLY 내부 자료 4개)과 B2B 폐기 결정 표현을 문서 전체에서
> 모순 없이 통일. B2C가 유일한 목표 제품이며, B2B 전용 코드
> (`lib/pipeline/`, Better Auth, `/cases/*`)는 **폐기가 결정됐지만
> 저장소에는 아직 남아 있다** — 실제 삭제 작업만 별도 SPEC으로 유보된
> 상태다(§구조·공존 관계 참고). 새 B2C 화면(01/02/03, Desktop+Mobile
> 24개)은 디자인만 확정됐을 뿐 코드 구현은 아직 없다. 그 이전 개정:
> 2026-09-17 디자인 피벗 반영 — B2B 손해사정사 워크스페이스 기획을
> 폐기하고 `design/MIGRATION-PLAN.md` 기준 B2C 보상 진단 퍼널로 제품
> 방향 전환(문서 재작성만 수행, 코드 미변경); 2026-09-16
> SPEC-SIDEBAR-NAV-001 완료(15번째 SPEC) 반영 — 사이드바 "전문가 피드백"
> 항목 아이콘을 `CornerDownRight`로 교체 + 활성 링크 `aria-label` 추가;
> 그 이전 개정 이력은 `git log .moai/project/product.md` 참고)

## 한 줄 소개

보상레이더는 사고·질병 당사자 **본인**이 검색 한 줄로 자신이 놓치고 있는
보험 담보를 진단받고, 손해사정사 상담으로 연결되는 B2C 보상 진단 퍼널이다.

> **읽는 법**: 이 문서는 목표 제품 방향을 기술한다. 코드베이스는
> SPEC-B2C-FOUNDATION-001에서 이전 B2B 전용 코드(로그인, 사건 리서치
> 파이프라인 등)를 삭제하고 B2C 방향으로 전환했으며, 아래 B2C 흐름 중
> **① 질문 입력 및 진단**(01/01-A2/01-B/01-C/01-D/01-E, Desktop+Mobile)은
> SPEC-B2C-DIAGNOSIS-001에서 기능 플래그 뒤에 구현이 완료됐다(`status:
> completed`). **② 보상 진단 결과**·**③ 상담 신청**은 아직 디자인
> (`design/`)만 확정됐을 뿐 코드 구현은 없다 — 다음 SPEC(02 보상 진단
> 결과)이 §Roadmap A에서 다룬다.

## 타깃 사용자

- **사고·질병 당사자 본인** — 실비 하나만 청구하고 끝내려는, 보험 비전문가인
  일반 소비자. 놓치고 있는 담보가 얼마나 되는지 스스로 확인하고 싶어 한다.
- 보험설계사·손해사정사 등 **전문가는 더 이상 1차 타깃이 아니다** — 이는
  이전 방향(§이전 방향)의 타깃이었다. 새 흐름에서 손해사정사는 사용자가
  아니라, 진단 이후 연결되는 **상담 상대**다.

## 핵심 메시지

> "이것도 되고 저것도 되고, 이만큼이나 나온다"

실비 하나만 청구하고 끝내는 사용자에게, **놓치고 있던 담보를 전부 펼쳐
보여주는 것**이 제품의 전부다. 참조 디자인: KOICD 담보확인 페이지
(`koicd.kr/insu/insu.do`) — 검색 → 코드 확인 카드 → 청구 가능 담보 그리드
→ 면책 문구.

## 핵심 흐름 (사용자용 화면 24개 + 내부 자료 4개)

```
01 질문 입력 → [01-A2 진단 시작 동의] → 01-B 추가 질문 → 01-C 진단 중
        ↓                                    (01-D 결과 없음 / 01-E 분석 오류)
02 보상 진단 결과
  (4카테고리 담보 그리드: 실손의료비 · 정액담보 · 후유장해 · 특별보상)
        ↓
03 상담 신청 → [상담 동의] → 03-A2 전화 선택
        ↓
03-B 접수 성공 / 03-C 중복 신청 / 03-D 신청 실패
```

같은 흐름이 Desktop(1440)과 Mobile(390) 두 폭으로 각각 만들어져 있다 —
Mobile은 `M` 접두사가 붙고(`M01`·`M02`·`M03` 등), 보상 진단 결과만 구조가
다르다(Desktop은 4카테고리 전체 펼침, Mobile은 카테고리 단일 선택 탭).

| 흐름 | 역할 | 디자인 소스 |
|---|---|---|
| ① 질문 입력 및 진단 | 검색창 한 줄 질문 입력 → 건강정보 동의 → 조건부 추가 질문 → 진단 중 → (결과 없음/분석 오류) | `l8dM0b` 등, `design/exports/01-*.png`, `M01-*.png` |
| ② 보상 진단 결과 | **기준 디자인.** 4카테고리(실손의료비/정액담보/후유장해/특별보상) 담보 그리드. "해당 없음"도 숨기지 않고 사유와 함께 노출 | `A1oCfT`, `design/exports/02-보상-진단-결과.png`, `M02-*.png` |
| ③ 상담 신청 및 접수 결과 | 카톡/전화 선택 + 상담 동의 → 손해사정사 연결 안내 → 접수 성공/중복/실패 | `Uli7t` 등, `design/exports/03-*.png`, `M03-*.png` |

4카테고리는 사고든 질병이든 답이 항상 같은 고정 프레임이다 — 내용만
케이스별로 교체된다 (예: 골절이면 5대 골절 진단비, 암이면 암진단비·항암치료비,
뇌질환이면 뇌졸중진단비). 담보 카드는 3톤 상태(검토 대상 / 추가 정보 필요 / 가능성
낮음)로 표시하며, "가능성 낮음"은 왜 낮은지 사유를 함께 적어 숨기지
않는다 — 낮은 이유를 말해주는 쪽이 되는 것도 믿게 만든다는 것이
`design/MIGRATION-PLAN.md`의 핵심 설계 원칙이다.

`design/internal/`에는 사용자 화면이 아닌 **DEV ONLY 내부 자료 4개**(운영
전 확정 필요 항목, 동의 상세 구조 등)가 별도로 분리되어 있다 — 사용자
화면 구현 대상이 아니며, `{확정 문구}` 같은 내부 토큰은 정책 확정 전까지
사용자 화면에 노출하지 않는다. 상세는 `design/MIGRATION-PLAN.md` §3.

24개 화면의 전체 목록, Desktop/Mobile 대응표, 미완료 항목은
`design/MIGRATION-PLAN.md`가 SSOT다 — 이 문서는 요약만 담는다.

## 금액 표기 정책 (필수 준수)

B2C 대상 서비스이므로 단정형 금액 제시는 표시광고법·보험업법 리스크가
있다. `design/MIGRATION-PLAN.md` §4의 정책을 그대로 제품 원칙으로 채택한다.

1. **놀라움의 축은 금액이 아니라 담보 개수다** — `11개 해당` / `4가지 보상
   종류` 처럼 개수를 강조하고, 금액을 놀라움의 소재로 쓰지 않는다.
2. **금액은 항상 범위로 제시한다** (`약 300만 ~ 1,200만원`). 예외는 정액
   담보뿐이며, 이 경우 단일 금액 + `정액 · 약관 확정` 라벨을 함께 표기한다.
3. **면책 문구는 항상 노출한다** — 숨기거나 툴팁 뒤로 감추는 것을 금지한다.
4. **단정형 표현을 금지한다** — `받으실 수 있습니다` 같은 확정형 대신
   `청구 가능` / `가능성` 등 조건부 표현만 사용한다.
5. **금액은 서버 산정값을 그대로 노출한다** — 클라이언트에서 재계산하지
   않는다.
6. **`평가 대기` 항목은 합계에서 제외한다** — 확정 항목과 미확정 항목의
   합산 표기를 분리한다.
7. **면책·감액은 색상만으로 구분하지 않는다** — 아이콘 + "면책"/"감액"
   텍스트 라벨을 항상 함께 표기한다.

## 개인정보(PII) 정책 — 02/03 경계에서 예외 발생

기존 B2B 방향의 원칙("개인정보·민감정보 저장 최소화, 전화번호 등 아예 받지
않음")은 새 B2C 흐름에서 **부분적으로만** 유지된다. 2026-09-17 재인터뷰에서
명시적으로 확정된 경계:

- **01 질문 입력 · 02 보상 진단 결과**: 이름·전화번호·주민번호 등 PII
  입력 필드가 없다. 다만 01-A2(진단 시작 동의)에서 **건강정보 등
  민감정보 처리 동의 1건**은 필수로 받는다 — 일반 개인정보 동의·마케팅
  동의는 진단 단계에서 받지 않는다.
- **03 상담 신청**: 이번 피벗에서 새로 도입되는 **유일한 PII 수집
  단계**다. 리드 폼이 손해사정사 상담 연결을 위해 이름·연락처(전화 또는
  카카오톡)를 수집하며, 개인정보 수집·이용 동의 + 건강정보 상담 이용
  동의 2건이 필수, 마케팅 수신 동의는 선택이다. 같은 운영 법인 소속
  담당자는 제3자가 아닌 내부 상담 담당자로 처리하므로 별도 제3자 제공
  동의는 (외부 법인 연결 구조가 생기기 전까지) 비활성 상태다. 동의 구조
  상세: `design/MIGRATION-PLAN.md` §6.
- 이 예외는 03 화면(리드 폼)에만 한정되며, 01/02 화면으로 역전파되지
  않는다. 향후 새 화면이 추가되어도 PII 최소화가 기본값이고, 예외는
  명시적으로 근거를 남겨야 한다.
- 코드 수준 강제 지점: `lib/validation/`의 기존 Zod 스키마(`case-input.ts`)는
  01/02용 비식별 검증을 계속 담당한다. 03용 리드 폼은 **이름/연락처 필드를
  의도적으로 허용하는 별도 스키마**가 필요하며, 이 스키마는 아직
  존재하지 않는다 (상세: `tech.md` § PII 정책 예외 및 리드 폼 검증 스키마).

## 외부 시스템 재사용 전제

- **Turso/libSQL + Drizzle ORM**: 기존 DB 계층을 새 B2C 흐름에서도 재사용
  가능하다는 전제만 이번 라운드에서 확정했다. 리드 데이터·담보 매칭
  데이터를 위한 실제 스키마 설계는 후속 SPEC 범위다.
- **Gemini API**: 재사용 가능하다는 전제만 확정. 02 화면의 담보 매칭
  로직을 정적 규칙 기반으로 할지, 기존 AI provider abstraction
  (`lib/ai/`)을 통해 Gemini로 할지는 **아직 결정되지 않았다** — 후속 SPEC에서
  판단한다 (상세: `tech.md` § 담보 매칭 로직 — 미결정 사항).
- **검증 방식**: Vitest(단위) + Playwright(E2E) 유지, 변경 없음.

## 구조·공존 관계 (2026-09-17 재인터뷰에서 최우선으로 지정된 항목)

2026-09-17 재인터뷰 당시에는 기존 B2B 코드(로그인, 사건 리서치
파이프라인)와 새 B2C 화면(검색 → 진단 → 상담 신청)이 당분간 한
코드베이스 안에 공존하는 것으로 계획됐다. 이 계획은 아래 재확인
항목으로 완전 대체로 뒤집혔고, SPEC-B2C-FOUNDATION-001에서 B2B 전용
코드가 실제로 삭제됐다(§이전 방향 참고). 현재 상태:

- B2B 전용 코드(로그인, `app/cases/*` 등)는 **삭제 완료**됐다 — 공존이
  아니라 대체다.
- B2C 화면 중 **① 질문 입력 및 진단**은 SPEC-B2C-DIAGNOSIS-001에서
  기능 플래그 뒤에 **구현 완료**됐다. **② 보상 진단 결과**·**③ 상담
  신청**은 아직 디자인(`design/`)만 확정된 상태다.
- 코드 수준 구조(라우트 분리, 컴포넌트 재사용 여부, DB 스키마 공유
  여부 등)의 상세 스케치는 `structure.md` § 현재 vs 목표 구조를
  참고한다.
- **2026-09-17 재확인 — 결정됨: B2C가 유일한 제품, B2B 코드는 삭제한다.**
  Oracle Cloud에 배포된 기존 B2B 파일럿은 실사용 테스터가 없어 사실상
  중단 상태임을 확인했다. 이에 따라 병존이 아니라 **완전 대체**로
  방향을 확정한다 — `lib/pipeline/`(6단계 리서치 파이프라인)·
  `lib/auth/`(Better Auth)·`app/cases/*`·`app/login/` 등 B2B 전용 코드는
  삭제 대상이다. 실제 삭제·마이그레이션 실행은 별도 SPEC(`/moai plan`)에서
  Reproduction-First 절차를 거쳐 진행하며, 이번 문서 재작성 라운드에서는
  코드를 건드리지 않았다 — 삭제 전 코드는 git 이력으로 항상 복구 가능하다.

## 이전 방향 (레거시, 코드 대부분 삭제 완료)

이번 피벗 이전, 보상레이더는 **B2B AI Research Assistant**로 기획되어
15개 SPEC이 완료되었다. 아래는 그 요약이다 — 전체 상세는 git 이력과
개별 SPEC 문서(`.moai/specs/`, 완료분은 아카이브 상태)를 참고한다.

- **타깃**: 보험설계사·손해사정사(B2B 전문가), 비공개 파일럿(초대 전용
  테스터 10명 내외).
- **핵심 흐름**: 비식별 보험 사건 정보 입력 → 6단계 AI 리서치 파이프라인
  (`CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher →
  Skeptic → Verifier`) → Research Report(추가 검토 담보·근거자료·반대
  논리·추가 필요자료) → 전문가 피드백 저장.
- **MVP 범위**: 상해후유장해 / 질병후유장해 두 영역만 지원.
- **핵심 원칙**: AI는 지급 여부·확률을 단정하지 않는다 / 모든 AI 판단은
  evidence와 연결한다 / PII 저장 최소화(전화번호 등 아예 받지 않음) /
  초대 전용 비공개 접근 / LLM·DB 이식성(provider abstraction, Drizzle
  ORM) / overengineering 금지.
- **완료된 15개 SPEC**: SPEC-SCAFFOLD-001, SPEC-RUNTIME-001,
  SPEC-RESEARCH-001, SPEC-GEMINI-RUNTIME-001, SPEC-EVIDENCE-001,
  SPEC-FEEDBACK-001, SPEC-PILOT-UX-001, SPEC-PILOT-VISUAL-001,
  SPEC-UI-MIGRATION-001, SPEC-E2E-AUTH-STATE-001, SPEC-PILOT-READY-001,
  SPEC-PILOT-LAUNCH-001, SPEC-PILOT-OPS-001, SPEC-CASE-PROGRESS-001,
  SPEC-SIDEBAR-NAV-001 (+ 배포 전환 SPEC-ORACLE-HOSTING-001).
- **코드 삭제 현황 (SPEC-B2C-FOUNDATION-001, 2026-09-18 M1-M5 완료)**: 위
  §구조·공존 관계에서 확정된 삭제 결정은 SPEC-B2C-FOUNDATION-001의
  M1-M5에서 대부분 실행됐다.
  - **삭제 완료**: `app/cases/*`, `app/login/*`,
    `app/api/auth/[...all]/route.ts`, `app/api/cases/**`, `lib/auth/**`
    (Better Auth 기반 접근 제어), `lib/cases/**`, `lib/feedback/**`,
    `components/evidence-item.*`, `proxy.ts`(인증 가드), B2B 전용 E2E
    시나리오 13개(`e2e/` 디렉터리 전체), Better Auth 테스터 프로비저닝
    스크립트(`scripts/provision-tester.ts` 등), `package.json`의
    `better-auth` 의존성과 `tester:add` 스크립트.
  - **보존(별도 decision gate, 삭제 아님)**: `lib/pipeline/`(6단계
    리서치 파이프라인) + `db/seed/evidence*` +
    `lib/observability/gemini-fetch-observer.*`/`gemini-observation-store.ts`는
    담보 매칭 알고리즘 결정 전까지 재사용/삭제 여부가 정해지지 않아
    의도적으로 손대지 않았다(§ 담보 매칭 로직 — 미결정 사항, `tech.md`
    참고) — 후속 SPEC이 재검토한다.
  - **보존(계획 대비 편차)**: `lib/validation/case-input.ts`+test는
    design.md 작성 시점에는 삭제 대상으로 분류됐으나, `lib/pipeline/types.ts`가
    이 파일의 `CaseInput` 타입을 import하는 실제 의존성이 M4 실행
    중에 발견되어 — `lib/pipeline/` 보존 결정을 위반하지 않기 위해
    함께 보존됐다. `lib/pipeline/` decision gate가 해소될 때 함께
    재검토 대상이다(상세: `.moai/specs/SPEC-B2C-FOUNDATION-001/progress.md`
    M4).
- **왜 폐기되었나**: 손해사정사 워크스페이스(사이드바·사건 관리·리서치
  리포트·전문가 피드백·증빙 서류·후유장해 트래커 등, "사용자=전문가"
  전제)는 `design/MIGRATION-PLAN.md` §5에서 폐기 이력으로 명시됐다 — 상세
  폐기 목록은 그 문서 참고.

## §Roadmap

### A. B2C 피벗 방향 (진행 중)

`design/MIGRATION-PLAN.md` §9 "남은 작업" 기준. 디자인은 01/02/03 흐름의
대부분 상태(동의·추가 질문·로딩·에러·성공/중복/실패)를 Desktop+Mobile
24개로 확장했다 — 단, **모바일의 결과 없음(`M01-D`)·분석 오류(`M01-E`)
대응 화면은 아직 디자인되지 않았다**(Desktop `01-D`/`01-E`만 존재).
① 질문 입력 및 진단(01 흐름, Desktop+Mobile)은 SPEC-B2C-DIAGNOSIS-001에서,
② 보상 진단 결과(02 흐름, Desktop 전체 펼침 + Mobile 4탭)는
SPEC-B2C-RESULT-001에서 각각 기능 플래그(`ENABLE_DIAGNOSIS_FLOW`/
`DIAGNOSIS_ENGINE_READY`) 뒤에 구현이 완료됐다 — 02는 골절 사례 1종의
review 전용 fixture(`buildFractureResult`)로만 채워지며 실제 담보 매칭
엔진은 여전히 미연결이다. 아래는 그중 **아직 디자인·구현 모두 안 된
것**만 남긴다. 이번 라운드에서 SPEC 문서를 생성하지 않는다:

- **02 담보 데이터 확장** — 골절 외 암·뇌혈관·심장·디스크 등 케이스별
  담보 세트 데이터 설계 (02 UI·데이터 계약은 구현 완료됐으나, 채워 넣는
  실데이터는 여전히 골절 사례 1종뿐).
- **③ 상담 신청 흐름 실제 구현** — 03/03-A2/03-B/03-C/03-D(Desktop+Mobile)
  디자인만 존재하는 화면 전체를 실제 라우트/컴포넌트로 구현 (이름·연락처
  수집 API + PII 예외 스키마 신설 포함, 담보 매칭 로직 방식은 미결정,
  위 § 참고).
- **모바일 결과없음/분석오류 화면 디자인 없음** — Desktop의
  `01-D`·`01-E`에 대응하는 모바일 화면이 아직 디자인되지 않음.
- **DEV ONLY 정책 문구 확정** — `design/internal/`의 동의 상세 자리표시자
  문구를 법무 검토 후 실제 문구로 교체(`design/MIGRATION-PLAN.md` §3, §9).
- **공통 00 Design System 정리** — 더 이상 쓰지 않는 컴포넌트(App
  Sidebar·Nav Item·App Topbar·Evidence Item 등) 정리 및 `Coverage
  Item`으로 편입.
- **`lib/pipeline/` 보존 여부 최종 결정 (decision gate, 기존 B2B 코드
  삭제의 마지막 조각)** — `lib/auth/`·`app/cases/*`·`app/login/`·Better
  Auth 의존성 등 나머지 B2B 전용 코드는 SPEC-B2C-FOUNDATION-001
  (2026-09-18, M1-M5)에서 삭제 완료했다(§이전 방향 참고). `lib/pipeline/`
  (+ 관련 observability/seed 파일)은 담보 매칭 알고리즘이 정적 규칙
  기반인지 이 파이프라인/Gemini 재활용인지 결정되기 전까지 의도적으로
  보존 중이며, 이 decision gate 해소는 여전히 후속 SPEC 범위다.

### B. 구현 완료 (레거시 B2B, 15개 SPEC, `status: completed`)

> 상세 항목 목록은 SPEC 상태가 SSOT다(`.moai/specs/<SPEC-ID>/spec.md`
> frontmatter). 요약:

- 프로젝트 초기 scaffold(Next.js App Router + TypeScript strict +
  Tailwind + shadcn/ui) — SPEC-SCAFFOLD-001
- 런타임 활성화(DB 연결·마이그레이션·시드·테스터 계정·E2E) — SPEC-RUNTIME-001
- AI provider abstraction + Gemini adapter, evidence-first 파이프라인 —
  SPEC-RESEARCH-001
- 무료 티어 파일럿 안정화(모델 분리·rate 페이싱·재시도) — SPEC-GEMINI-RUNTIME-001
- 근거자료 corpus 21건 확장 — SPEC-EVIDENCE-001
- 전문가 피드백 저장 UI/데이터 모델 — SPEC-FEEDBACK-001
- 사건 입력 폼 UI(PII 차단 검증 포함) — SPEC-SCAFFOLD-001
- UI 사용성 다듬기 — SPEC-PILOT-UX-001
- Pencil 디자인 시각 계층 재현(3개 화면, B2B 구 디자인 기준) —
  SPEC-PILOT-VISUAL-001, SPEC-UI-MIGRATION-001
- E2E storageState 인증 재사용 — SPEC-E2E-AUTH-STATE-001
- 파일럿 배포 준비(Netlify → Oracle Cloud 전환 포함) — SPEC-PILOT-READY-001,
  SPEC-PILOT-LAUNCH-001, SPEC-PILOT-OPS-001, SPEC-ORACLE-HOSTING-001
- 사건 입력 대기 화면 4단계 진행 안내 — SPEC-CASE-PROGRESS-001
- 사이드바 "전문가 피드백" 아이콘/접근성 개선 — SPEC-SIDEBAR-NAV-001

전체 상세 서술(성공 지표, 배포 URL, 커밋 SHA 등)은 git 이력(`git log
.moai/project/product.md`)에서 이전 개정을 참고한다.

### C. 후속 개발 (레거시 B2B, 파일럿 실측 데이터 확보 이후 — 순서 있음, 참고용)

B2C 피벗 이전에 계획됐던 항목이며, B2B 코드의 재사용/폐기 결정에 따라
유효성이 달라질 수 있다:

1. 실 Gemini 기반 코퍼스 품질 평가
2. 사용자별 완료/피드백 집계 대시보드
3. Gold Dataset 추출·집계 도구
4. (장기) Netlify → 프로덕션 확정, 로그인 rate-limiting, PostgreSQL
   마이그레이션, 근거자료 코퍼스 확장, 담보 영역 확장
