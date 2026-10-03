# Plan — SPEC-B2C-ENGINE-001

## 결정 우선순위 (Decision Review Priority)

되돌리기 어렵고 다른 결정에 영향이 큰 순서다. 리뷰 시 이 순서로 확인할 것을 권장한다. 마일스톤(§F)도 이 순서에 맞춰 결정 → 데이터·법무 입력 → 계약 → 구현 → 평가 → 준비 증거 순으로 놓았다.

1. **D-ENGINE-01 매칭 아키텍처**(정적 / LLM / 하이브리드): 외부 AI 전송, `GEMINI_API_KEY` 요구, 테스트 방식, 비용, 동의 문구 6개 중 3개가 이 결정에 따라 달라진다(`design.md` §2, §10).
2. **D-ENGINE-05 결과 영속성과 `resultId` 검증**: 기존 완료 SPEC 요구사항(REQ-B2CDIAG-004/021, REQ-B2CRESULT-016)과 CONSULT-001 계약(REQ-B2CCONSULT-009 신선도 검사 금지, REQ-B2CCONSULT-019 잔여 위험 수용), 운영 DB 변경 여부가 걸린다(`design.md` §4).
3. **D-ENGINE-06 외부 AI 전송 허용 여부**: 법무 결정이며 D-ENGINE-01과 동의 문구를 동시에 묶는다(`design.md` §10.1).
4. **D-ENGINE-02/03 지식 원천·최초 공개 범위**: 정답 집합의 크기와 전문가 부담을 정한다.
5. 그 외 결정(D-ENGINE-04/07~11)은 위 결정이 정해진 뒤 순차적으로 확정된다.

## §A. Context

- 선행 SPEC: FOUNDATION-001(B2B 정리·B2C 셸), DIAGNOSIS-001(01 화면, `mockJudge` 도입), RESULT-001(02 화면, 계약·fixture), CONSULT-001(03 상담, `status: in-progress`). 네 SPEC이 매칭 엔진 결정을 차례로 미뤘다(`research.md` §2).
- 현재 기준선: `main@99993bf`. 이 plan-phase 산출물(`.moai/specs/SPEC-B2C-ENGINE-001/`)만 커밋되지 않은 초안으로 있다.
- 개발 방법론: `quality.yaml`의 `development_mode: tdd`, `test_coverage_target: 85`(`.moai/config/sections/quality.yaml:2,5`).
- 이 SPEC은 plan-phase만 다룬다. 응용 코드, 설정, 워크플로, 환경 파일은 변경하지 않았다.
- 이 plan은 plan-auditor iteration 1(FAIL 0.726)과 iteration 2(FAIL 0.807)의 결함을 반영한 개정본이다. 결함별 처리는 `progress.md` §G에 있고, 개정 이후의 재감사 결과는 이 문서가 주장하지 않는다.
- 요구사항은 D-ENGINE-xx의 옵션을 선점하지 않는다. 특정 결정에 걸린 요구사항은 조건부(`Where`)로 쓰였다 — REQ-009(D-ENGINE-11), REQ-010(D-ENGINE-02), REQ-015(D-ENGINE-05), REQ-017/020/021(D-ENGINE-04), REQ-019(D-ENGINE-06), REQ-024(D-ENGINE-01).
- UI 표면 SPEC(01/02 화면 수정)이므로 run-phase 진입 전 design 경로(`manager-design`) 적용 여부는 오케스트레이터가 판단한다(`.claude/rules/moai/workflow/spec-workflow.md` § Conditional Design Route).

## §B. Known Issues (결정 · 리스크)

**2026-10-03 사용자 인터뷰에서 D-ENGINE-01~06·08~11(10건)이 결정됐다.** D-ENGINE-07(법무 문구)만 여전히 미결정이다 — 선행 결정 확정으로 차단은 해제됐으나 법무의 실제 문구 작성은 아직이다. 결정된 옵션은 아래 상태 열과 `progress.md` Open Decisions의 "결정 (2026-10-03, 사용자 인터뷰)" 줄에 있다. 옵션·추천·전제의 전문도 `progress.md` Open Decisions에 있다.

| ID | 결정 사항 | 상태 | 결정 주체(역할) | 차단하는 것(결정 전 기준 — 결정된 항목은 해제됨) |
|---|---|---|---|---|
| D-ENGINE-01 | 매칭 아키텍처(정적 / LLM / 하이브리드) | **결정됨 (2026-10-03) — (3) 하이브리드** | 제품 책임자 + 엔지니어링 (도메인 전문가 자문) | M2 이후 전체, D-ENGINE-06/07/11, REQ-024와 N6 — 모두 해제(N6은 해소) |
| D-ENGINE-02 | 담보 판정 규칙 소유자, 약관·상품 데이터 원천과 공개·비공개 분류, 갱신 절차 | **결정됨 (2026-10-03) — (a) 전문가 규칙표** | 보험 도메인 전문가 + 제품 책임자 (라이선스는 법무) | M1, 정답 집합, 엔진 준비 증거, REQ-013 — 모두 해제(단 D-ENGINE-03이 범위를 6개 유형으로 넓혀 데이터 확보·검수 부담 확대) |
| D-ENGINE-03 | 최초 공개 사고 유형 범위 | **결정됨 (2026-10-03) — (d) 사고 유형 6개 전부 (추천 (a)와 다른 선택)** | 제품 책임자 + 도메인 전문가 | M1, M4, 01-B 질문 — 해제, 단 N3 충돌 범위가 전체 6유형으로 확대 |
| D-ENGINE-04 | 실행 위치(클라이언트 / 서버 API / 서버 액션) | **결정됨 (2026-10-03) — (2) 서버 API 라우트** | 엔지니어링 (법무: 서버 통과 해석) | M3~M5, N1/N2, REQ-017/020/021의 적용 여부 — M3~M5 해제, REQ-017/020/021 적용 확정, N1/N2는 가설에서 실제 질문으로 좁혀짐(미해결) |
| D-ENGINE-05 | 결과 영속성·보존·`resultId` 검증 방식(만료 유무 포함) | **결정됨 (2026-10-03) — (b) 무저장+서명 토큰 (만료 유무는 후속 결정)** | 법무 + 제품 책임자 + 엔지니어링 | M3, CONSULT 계약 변경(N1: REQ-B2CCONSULT-009/019), 동의 문구, REQ-015의 적용 여부 — M3·REQ-015 적용·N1의 (2) 해제. N1의 (1)(신선도 충돌)은 만료 유무 미결정으로 남아 있음 |
| D-ENGINE-06 | 자유 문장의 외부 AI 서비스 전송 허용 여부와 필드 범위 | **결정됨 (2026-10-03) — (b) 자유 문장만, 동의 이후** | 법무 + 제품 책임자 | D-ENGINE-01, 동의 문구 "외부 AI 전송 여부", REQ-019, 법무 확인 기록(REQ-023 (iv)) — 모두 해제 |
| D-ENGINE-07 | 진단 동의 상세 6개 문구(법무 작성 — 아래 차단 관계 참조) | 미결정 — **차단 해제(D-ENGINE-01/04/05/06 확정됨)**, 법무 문구 작성 대기 | 법무 | `ENABLE_DIAGNOSIS_FLOW=true`(LAUNCH), 일반 공개 — 법무 문구 완성 전까지 그대로 차단 |
| D-ENGINE-08 | 엔진이 판단 불가일 때의 문구와 경로 | **결정됨 (2026-10-03) — (a) 01-D 유지** | 제품 책임자 (문구는 법무, 상담 경로는 운영) | M5 — 해제 |
| D-ENGINE-09 | 정확도·합격 기준값과 서명자(내부 시험 / 일반 공개 분리) | **결정됨 (2026-10-03) — (c) status별 이중 기준** | 제품 책임자 + 보험 도메인 전문가 | M6, M7, 일반 공개, AC-005 시나리오 2, AC-022 합격 판정 — M6/M7 해제, AC-005 시나리오 2·AC-022는 수치 기준값 서명 전까지 BLOCKED 유지 |
| D-ENGINE-10 | 02 면책 문구의 법무 검토 필요 여부 | **결정됨 (2026-10-03) — (b) 법무 검토 후 확정** | 법무 | 일반 공개 — 법무 검토 완료 전까지 그대로 차단 |
| D-ENGINE-11 | 01-B 질문의 입력 적응 방식 | **결정됨 (2026-10-03) — (c) 분류 호출 후 질문 선택** | 제품 책임자 + 엔지니어링 + 도메인 전문가 | M4, M5, REQ-009의 적용 여부 — 모두 해제, REQ-009 적용 확정 |

진단 동의 상세 6개 항목의 차단 관계는 `design.md` §10.2다. 문구 자체는 이 SPEC이 쓰지 않으며 법무가 정한다.

엔지니어링이 결정할 수 있는 항목(fixture 격리 방식, 준비 증거 방식, 서명 토큰의 구체 형태)은 `design.md` §9에 대안과 권고가 있고, Implementation Kickoff Approval 시 확인한다. 선택에 따른 비용은 다음과 같이 기록한다.

- fixture 격리를 빌드 시 제외((c))로 택하면 플래그가 요청마다 읽히므로(`app/page.tsx:49`, `app/result/page.tsx:38`, `app/consult/page.tsx:30`의 `force-dynamic`) 프로덕션용과 review용 빌드가 따로 필요하다. `playwright.config.ts:82-84`와 `visual:verify`(`scripts/visual-verify.ts`)가 review 플래그를 런타임에 쓰기 때문이다. 이 비용은 N8에 걸려 있다.
- 준비 증거를 런타임 점검((c)·(d))으로 택하면 `computeDiagnosisFlags`의 입력이 바뀌어 `scripts/verify-flag-runtime.ts`와 그 시험이 함께 바뀐다(N7). CI 검사만((b)) 택하면 그 변경은 없으나 운영 환경 변수가 증거와 무관하게 켜지는 경우를 CI가 관측하지 못하므로 REQ-023 충족 범위를 N7에서 확인한다.
- 엔진이 서버 경계(D-ENGINE-04 (2)·(3))를 가지면 `computeDiagnosisFlags`를 소비하지 않는 새 진입점이 생기고 `deploy.yml`은 `main` push마다 배포하므로, 그 진입점이 같은 게이트를 평가하도록 REQ-020 (나)를 요구한다(`design.md` §9.3). 이 평가는 M4(서버 경계)에서 구현하며, M4가 진입점을 도달 가능하게 만드는 커밋과 같은 커밋이거나 그 이전에 있어야 한다. 증거 게이트(M7)는 §F의 커밋 순서 제약대로 M4 이전에 적용하는 것이 안전하다.

### 리스크

- **e2e 충돌**: 현행 e2e의 "결과 없음" 입력("무릎 골절로 수술을 받았어요", `e2e/diagnosis-flow-01.spec.ts:28-29,81`)은 실제 엔진이 골절로 분류할 수 있다. 상담 e2e도 고정 문장에 의존한다(`e2e/consult-flow-03.spec.ts:63,105`). M5에서 입력을 이행해야 한다.
- **계약 변경 전파**: `DiagnosisResult` 변경은 `lib/diagnosis/schema.ts`(strictObject), `handoff.ts`, 02·03 컴포넌트에 퍼진다. 부가적 변경으로 제한한다(REQ-001).
- **CONSULT-001과의 겹침**: REQ-015는 `app/api/consultations/route.ts`·`lib/consult/schema.ts`를 건드릴 수 있고, CONSULT-001은 `status: in-progress`다. `resultId` 만료는 REQ-B2CCONSULT-009의 신선도 검사 금지와 충돌한다(N1).
- **완료된 계약 변경**: REQ-B2CDIAG-025(`productionReady` 정의, N7)와 REQ-RESEARCH-012(`GEMINI_API_KEY` 부팅 요구, N6)는 완료된 SPEC이다. 이 SPEC의 요구사항이 그 계약을 바꾼다.
- **전문가 병목**: 규칙표와 정답 집합 모두 도메인 전문가 입력이 필수다. 입력이 없으면 M1에서 멈춘다.
- **LLM 처리량**: 예시 설정의 RPM 예산이 4다(`.env.local.example:72,75`; 실제 한도 미검증). 분류·판정 2회 구조는 처리량이 절반이 된다(`design.md` §2.1).
- **결정론적 시험 공급자의 한계**: `lib/ai/providers/deterministic.ts`(`:10-60`)는 B2B 후보 형태를 시도해 요청 스키마를 통과하는 첫 응답을 돌려준다. 새 분류 스키마에는 응답이 없고, 단일 고정 응답은 입력별 e2e를 만들 수 없다(`design.md` §2.4, REQ-025).
- **서명 비밀 운영(D-ENGINE-05 (b)를 택하는 경우)**: 서명 토큰은 서버 비밀이 필요하다. 비밀이 운영에 없으면 모든 상담 접수가 거부될 수 있고, 회전하면 발급된 `resultId`가 무효가 된다. 비밀이 없을 때의 닫힘(발급·검증 모두 거부, 빈 키 금지)은 REQ-B2CENGINE-015의 절과 AC-015 시나리오 3이 규정한다. 비밀의 주입·회전 시 발급분 무효화의 문서화는 요구사항이 아니라 M3·M8의 산출물이다(`progress.md` §G D13).

## §C. Pre-flight

- [ ] `git status` clean 확인(이 SPEC 디렉터리 제외), `origin/main`과 divergence 없음(`git fetch origin main` 후 `git rev-list --count --left-right origin/main...HEAD`)
- [ ] `moai session list --json --filter-spec=SPEC-B2C-ENGINE-001`로 동시 세션 확인
- [ ] D-ENGINE-01/02/03/04/05/06 결정 기록이 `progress.md`에 있음(없으면 M2 이후 진입 불가)
- [ ] 직전 `pnpm test`, `pnpm lint`, `pnpm build` 기준선 기록(NEW vs 기존 구분)
- [ ] `pnpm test:e2e`, `pnpm verify:flag-runtime`, `pnpm visual:verify` 기준선 기록(고정 문장 의존 시나리오 목록 확보)
- [ ] plan-auditor PASS와 Implementation Kickoff Approval 완료

## §D. Constraints

- **플래그 불변**: 이 SPEC의 산출물에는 `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 코드·설정이 없다(REQ-B2CENGINE-023이 규정, AC-023 시나리오 5 — 기존 REQ-B2CDIAG-025·REQ-B2CRESULT-024는 각 SPEC 산출물에 한정되어 이 SPEC을 구속하지 않으므로 재진술한 것이다). 변경은 SPEC-B2C-LAUNCH-001이 한다. 비-테스트 코드의 범위와 검사 명령은 AC-023이 정의한다 — `scripts/verify-flag-runtime.ts`는 임시 서버 env를 구성하는 검증 하네스라 시험 코드로 분류한다.
- **운영 변경 금지**: 운영 DB 쓰기, 운영 플래그 변경, `main` 병합, 배포 워크플로 변경은 이 SPEC의 범위가 아니다. 새 테이블이 필요하면(D-ENGINE-05 (c)/(d)) 마이그레이션 적용 전 별도 승인을 받는다. 서명 비밀 같은 신규 운영 시크릿의 주입도 사람의 별도 승인을 받는다.
- **기존 계약**: `DiagnosisResult` 4카테고리·3상태·기존 필드 의미는 바꾸지 않는다(REQ-001).
- **visual:verify 동결**: `scripts/visual-verify.ts`·`playwright.config.ts` 변경은 빌드·플래그 배선에 한정하고 15화면 정의·허용 오차·승인된 debt는 바꾸지 않는다(REQ-B2CCONSULT-025). 02 쪽은 DIAGNOSIS-001 10화면 커버리지를 깨지 않고 덧붙이는 방식으로만 확장한다(REQ-B2CRESULT-025, 이 요구사항은 허용 오차·debt를 언급하지 않는다). 그 이상이 필요하면 amendment가 먼저다(N8).
- **`lib/pipeline/`**: 삭제·수정하지 않는다(REQ-B2CFOUND-007). 검증 패턴 참고만 허용한다.
- **수치 금지**: 정확도·합격 기준값·요청률 상한 값을 이 SPEC 문서에 적지 않는다. 기준값은 D-ENGINE-09 서명 기록, 상한은 설정 값이다.
- **문구 금지**: 담보 판정 규칙, 동의 문구, 법률 결론을 이 SPEC이 작성하지 않는다. 규칙은 도메인 전문가, 문구는 법무가 정한다.
- 시간 추정은 쓰지 않는다. 우선순위와 선후 관계로만 표기한다.

## §E. Self-Verification (plan-phase)

- [x] GEARS 요구사항 25건(Tier L 상한 25)
- [x] AC 25건(Tier L 상한 25), 각 AC가 하나 이상의 REQ를 인용
- [x] Out of Scope에 `### Out of Scope —` H3 7개와 `-` bullet
- [x] 코드 사실에 `path:line` 인용, 미확인 항목은 `research.md` §4 "미검증"에 분리
- [x] Dependencies(이 SPEC이 막는 것·의존하는 것·deploy.yml smoke 비처리 사유와 기존 소유 AC) 명시
- [x] 결정 대기 항목을 선점하는 요구사항이 없음(조건부 또는 구조 중립) — 점검 결과는 `progress.md` §G
- [ ] plan-auditor 독립 감사 — **오케스트레이터가 수행**(이 문서는 감사 결과를 주장하지 않는다)

## §F. Milestones (후속 `/moai run SPEC-B2C-ENGINE-001`의 실행 계획)

의존성과 되돌림 비용 순으로 정렬했다. 모든 마일스톤은 TDD(`development_mode: tdd`)로 RED 실패 출력을 먼저 확보한 뒤 GREEN으로 구현한다. 아래 경로는 D-ENGINE-04 확정 전의 **후보**다. 마일스톤 간 커밋 순서의 제약: M7의 게이트 확장은 M2 직후 적용할 수 있으며, M4가 엔진을 도달 가능하게 만들기 **전에** 적용하는 것이 안전하다(같은 run 안에서 커밋 순서로 처리).

### M1. 결정 확정과 데이터·법무 입력 확보 (되돌리기 가장 어려움, 코드 최소)

- 선행: D-ENGINE-01/02/03/04/05/06/09 결정 기록.
- 산출: 지식 원천 데이터 형식과 공개·비공개 분류, 정답 집합 초안(도메인 전문가 작성), 진단 동의 상세 문구 작성 요청 패키지(법무에 전달, 문구는 쓰지 않음).
- TDD: RED — 지식 원천 데이터 파일이 스키마를 위반하면 실패하는 테스트(버전·검토 기록 필드 누락 포함, REQ-010). GREEN — 스키마와 로더.
- 후보 파일: `lib/coverage/data/**`, `lib/coverage/knowledge-schema.ts`(+테스트), 정답 집합 파일(`lib/coverage/gold-set/**`).
- 관련: REQ-004/006/010/013/022.

### M2. 엔진 출력 계약과 준비 상태 타입

- 산출: `determined | cannot-determine | error` 결과 타입, 사유 코드, 엔진 호출 지점(seam) 인터페이스, 준비 증거 타입(`design.md` §9.3의 항목 구성).
- TDD: RED — 세 결과가 구별되는 타입이 아니면 컴파일/테스트 실패(REQ-002), `DiagnosisResultSchema` 적합성 실패 케이스(REQ-001). GREEN — 타입·검증기.
- 후보 파일: `lib/coverage/types.ts`, `lib/diagnosis/types.ts`·`schema.ts`(부가적 변경이 필요한 경우만).
- 관련: REQ-001/002.

### M3. 결과 식별과 영속성 (D-ENGINE-05 결과 반영)

- 산출: `resultId` 발급·검증(선택된 대안에 따라 서명 토큰 / 메타데이터 저장), 상담 접수 검증 연결. (b)를 택하면 서명 비밀의 주입·부팅 검증(`lib/env.ts:143-145`의 `CONSULT_POLICY_READY` → `RATE_LIMIT_HMAC_SECRET` 조건부 게이트가 선례)과 비밀 회전 시 발급분 무효화 영향의 문서화. (a)를 택하면 이 마일스톤은 비어 있다.
- TDD: RED — 발급되지 않은·변조된·(만료를 택한 경우) 만료된 `resultId`, (b)를 택한 경우 서명 비밀 없이 만든 값으로 상담 제출 시 접수되는 테스트(실패해야 함, REQ-015). 저장 금지 확인 테스트(REQ-016).
- 후보 파일: `lib/coverage/result-id.ts`, `app/api/consultations/route.ts`, `lib/consult/schema.ts`(+테스트). 새 테이블이 필요하면 `lib/db/schema.ts`, `db/migrations/**`(적용은 별도 승인).
- 선행 확인: N1(CONSULT-001 변경 경로, REQ-B2CCONSULT-009 신선도 검사 금지와 만료의 충돌).
- 관련: REQ-015/016.

### M4. 엔진 구현과 실행 경계 (플래그 뒤)

- 산출: 입력 검증, 분류, 판정 근거 적용, 정직한 불확실성 상태, 질문 세트 선택(D-ENGINE-11 적응 방식을 택한 경우), 동의 확인과 노출 게이트 평가(REQ-020 (가)(나)), 요청률·크기 상한, 로그 정책, 외부 AI 최소 전송(해당 시), `GEMINI_API_KEY` 부팅 조건, 외부 호출 없는 시험 구성. 시험 구성은 외부 AI를 쓰는 구성이면 입력별 분류 응답을 주입할 수 있어야 한다(`lib/ai/providers/deterministic.ts`는 그대로는 새 분류 스키마에 응답하지 못한다 — `design.md` §2.4).
- TDD: RED — 정답 집합 일부 케이스, 비골절 입력에 골절 내용이 나오는 부정 케이스(REQ-005/008), 근거 없는 `review` 기본값(REQ-007), 단정형 문구·무근거 금액(REQ-003/004), 서버 재검증 실패 케이스(REQ-017), 로그에 원문이 남는 케이스(REQ-018), 동의 표지 없는 요청과 게이트가 거짓인 직접 호출(REQ-020), 상한 초과(REQ-021), env 부팅(REQ-024). GREEN — 구현. 외부 AI는 모킹된 공급자로 페이로드 필드를 검사한다(REQ-019).
- 후보 파일: `lib/coverage/**`, `app/api/diagnosis/route.ts`(서버 API 선택 시), `lib/env.ts`(+`lib/env.test.ts`), `lib/ai/**`(재사용만, 필요 시 어댑터).
- 관련: REQ-003~010, 013, 017~021, 024, 025.

### M5. UI 연결 · fixture 격리 · e2e 이행 (기계적 변경 — 마지막에 가까움)

- 산출: `step-loading.tsx`의 고정 판정(`mockJudge`)을 엔진 seam으로 교체, `diagnosis-flow.tsx` 전이 연결, 01-B 질문의 입력 적응(D-ENGINE-11이 적응 방식을 택한 경우), 01-D·01-E의 "데모/검토용 목업" 표기를 결과 출처 조건으로 렌더링(REQ-012), fixture의 운영 경로 격리(`design.md` §9.1에서 택한 방식), e2e 입력 이행, 고정 문장 의존 제거. 02의 review 전용 fixture 경로에는 표기를 추가하지 않는다(N8).
- TDD: RED — 운영 게이트 상태(productionReady=true, reviewEnabled=false)에서 fixture 입력이 fixture 결과를 반환하는 테스트(실패해야 함, REQ-012). 엔진 실패 시 01-E 표시와 입력 보존(REQ-014). GREEN — 교체·격리.
- 후보 파일: `components/diagnosis/step-loading.tsx`, `diagnosis-flow.tsx`, `step-questions.tsx`, `step-result-none.tsx`, `step-error.tsx`, `lib/diagnosis/fixtures/**`, `components/result/result-view.tsx`, `e2e/diagnosis-flow-01.spec.ts`, `e2e/diagnosis-flow-02.spec.ts`, `e2e/consult-flow-03.spec.ts`. fixture 격리가 빌드 시 제외((c))로 정해지면 `playwright.config.ts`, `scripts/visual-verify.ts`의 서버 시작·빌드 배선만 바꾼다(15화면 정의·허용 오차·승인 debt 불변, 별도 review 빌드 필요 — N8).
- 선행 확인: N3(RESULT-001 요구사항 대체 처리), N8, D-ENGINE-08/11.
- 관련: REQ-008/009/011/012/014/025.

### M6. 평가 실행

- 산출: 정답 집합으로 정확도 측정, 측정 보고서, 기준값(D-ENGINE-09)과 비교. 기준값 서명은 사람이 한다.
- TDD: RED — 정답 집합 실행이 보고서를 만들지 않거나 버전을 기록하지 않으면 실패(REQ-022). GREEN — 평가 러너와 보고서 생성.
- 후보 파일: `lib/coverage/eval/**`(+테스트), 보고서는 `.moai/reports/**` 로컬 산출물.
- 관련: REQ-022.

### M7. 엔진 준비 증거 (readiness)

- 산출: 지식 원천 확인 기록·정답 집합 측정 기록·D-ENGINE-09 서명·(외부 AI 사용 시) 법무 확인 기록을 일반 사용자 노출 경로를 여는 조건으로 반영 — `design.md` §9.2 (c)·(d)는 `productionReady`의 추가 조건, (b)·(d)는 CI 증거 검사(증거 구성은 §9.3).
- TDD: RED — `DIAGNOSIS_ENGINE_READY=true`이고 증거가 없거나 일부만 있는데 `productionReady`가 참이거나(§9.2 (c)·(d)) 증거 검사가 통과하면(§9.2 (b)·(d)) 실패(REQ-023). GREEN — 게이트 확장 또는 CI 검사.
- 후보 파일: `lib/diagnosis/flags.ts`(+`flags.test.ts`의 동작 행렬 확장), `app/page.tsx`·`app/result/page.tsx`(호출부), `app/page.test.tsx`, `app/result/page.test.tsx`, **`scripts/verify-flag-runtime.ts`(+`scripts/verify-flag-runtime.test.ts`)** — 이 스크립트는 기대 게이트 상태를 env만 쓰는 `computeDiagnosisFlags`로 계산하고(`:165-181`) 엔진을 켠 조합(`:447-449`)을 실제 서버에 대해 검증하므로 함께 갱신해야 하며, M7 완료 확인에 `pnpm verify:flag-runtime`을 포함한다(N7).
- 이 마일스톤은 플래그를 켜지 않는다. 켜는 것은 SPEC-B2C-LAUNCH-001이다.
- 관련: REQ-023.

### M8. 문서 동기화

- 산출: 진단 동의 상세 문구 확정 요청 이력, 운영 환경 변수 문서(`GEMINI_API_KEY` 조건, 서명 비밀 등 신규 시크릿이 있으면 `.env.local.example`·`.moai/docs/runtime-runbook.md`와 회전 시 영향), `structure.md`/`tech.md` 갱신(매칭 결정 반영).
- 관련: 전체.

## §G. Anti-Patterns

- 고정 표본 문장을 "엔진이 있는 것처럼" 확장하지 않는다(문자열 비교 금지, REQ-005, REQ-011).
- 사고 유형을 분류하지 못했는데 가장 가까운 사례의 내용을 보여 주지 않는다(REQ-008).
- 근거 식별자·근거 버전이 없는 금액이나 단정형 보상 문구를 만들지 않는다(REQ-003/004). LLM 출력이 status·금액·사용자 문구를 직접 정하지 않게 하는 구성은 D-ENGINE-01에서 하이브리드((3))가 선택될 때의 설계 속성이며 요구사항이 아니다(`design.md` §2.3).
- 정확도 기준값을 이 SPEC이나 코드 상수에 임의로 적지 않는다(REQ-022, D-ENGINE-09).
- 진단 동의 상세 6개 문구를 임의로 채우지 않는다(D-ENGINE-07).
- `DIAGNOSIS_ENGINE_READY`를 이 SPEC의 코드·테스트 설정에서 `true`로 켜지 않는다(REQ-B2CENGINE-023의 불변 조건, 같은 취지의 REQ-B2CDIAG-025·REQ-B2CRESULT-024는 각 SPEC 산출물에 한정). 임시 서버 env에 값을 넣는 검증 하네스(`scripts/verify-flag-runtime.ts`)는 예외로 분류하되 코드 경로에는 들이지 않는다.
- 입력·답변 원문을 로그·분석 도구에 남기지 않는다(REQ-018).
- "데모/검토용 목업" 표기를 엔진이 낸 실제 "판단 불가"·"오류" 결과에 남기지 않는다. 반대로 `devStep` 강제 렌더링이나 fixture 판정에서는 이 표기를 없애지 않는다(REQ-012).
- `.github/workflows/deploy.yml`의 smoke check를 이 SPEC에서 바꾸지 않는다(SPEC-B2C-LAUNCH-001, 트리거는 AC-B2CDIAG-024).
- 결정 대기 항목을 요구사항 문구로 먼저 정하지 않는다. 옵션이 요구사항을 바꾸게 되면 그 요구사항의 amendment를 충돌로 기록한다.

## §H. Cross-References · Dependencies

- `spec.md` §2.2 — 이 SPEC이 막는 것: `DIAGNOSIS_ENGINE_READY=true`(소유: SPEC-B2C-LAUNCH-001), 01/02 일반 공개, 03 상담의 일반 사용자 사용. 의존하는 것: 사용자·법무 결정. 의존하지 않는 것: SPEC-B2C-CONSULTOPS-001. 이 SPEC에 의존하는 것: SPEC-B2C-LAUNCH-001.
- `.github/workflows/deploy.yml:96-101`의 placeholder smoke check는 여기서 처리하지 않는다. 교체 트리거는 REQ-B2CDIAG-023과 AC-B2CDIAG-024(`SPEC-B2C-DIAGNOSIS-001`)가 이미 소유하며, 두 플래그가 프로덕션에서 실제로 `true`가 될 때 게이트를 여는 SPEC-B2C-LAUNCH-001에서 다룬다.
- `spec.md` §2.3 — 기존 SPEC 요구사항과의 관계(REQ-B2CCONSULT-009/019/025, REQ-B2CDIAG-025, REQ-B2CRESULT-012/025, REQ-RESEARCH-012)와 N1~N8.
- `design.md` — 대안 비교와 권고, `research.md` — 코드 증거 장부, `acceptance.md` — 수용 기준, `progress.md` — 결정 대기 목록과 감사 이력
- 선행 SPEC: `.moai/specs/SPEC-B2C-FOUNDATION-001/`, `SPEC-B2C-DIAGNOSIS-001/`, `SPEC-B2C-RESULT-001/`, `SPEC-B2C-CONSULT-001/`, `SPEC-RESEARCH-001/`
- 프런트매터에 `depends_on`을 두지 않았다. `depends_on`은 run 진입 시 의존 SPEC의 `status: completed`를 요구하는데, 이 SPEC의 의존은 SPEC 상태가 아니라 사용자·법무 결정이고 CONSULT-001은 `in-progress`이기 때문이다. 대신 `related_specs`로 비차단 참조만 남겼다.
