# Changelog

이 프로젝트의 모든 주요 변경사항을 이 파일에 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따릅니다.

## [Unreleased]

### Added — SPEC-PILOT-VISUAL-001 파일럿 비주얼 리스킨 — Pencil 디자인(claimradar-ui.pen) 재현, 기능/데이터 무변경

확정된 Pencil 디자인(`design/claimradar-ui.pen`)을 `사건 입력`/`Research Report`/`전문가 피드백` 3개 화면에 순수 시각 계층에서만 재현했습니다. 신규 기능·API·DB·AI 파이프라인 변경 없음 — SPEC-PILOT-UX-001로 사용성이 완성된 흐름의 룩앤필만 교체합니다.

- **디자인 토큰 + 타이포그래피**(`app/globals.css`): 기존 `@theme inline` 블록에 33개 색상 토큰(`--color-bora-*`/`--color-app-*` 네임스페이스, 기존 shadcn 토큰과 충돌 없음) + 타이포그래피 스케일(H1/H2/H3/Body/Body S/Meta/Label S) 추가. `pretendard` npm 패키지 도입
- **신규 앱 셸**(`app/cases/layout.tsx`, `app/cases/case-shell-nav.tsx`): 다크 사이드바 + 탑바를 `app/cases/` 라우트 그룹에만 적용 — `app/layout.tsx`/`app/page.tsx`/`app/login/**`은 폰트 import를 포함해 완전한 zero-diff PRESERVE. Pretendard(`next/font/local`)와 BORA 워드마크 전용 Manrope(`next/font/google`)를 이 레이아웃 내부에서만 로드. 사이드바 nav 3항목("사건 입력"/"리서치 리포트"/"전문가 피드백")은 DB/API 조회 없이 현재 pathname만으로 결정론적으로 활성/비활성 렌더링
- **공유 프레젠테이션 컴포넌트**(`components/ui/status-badge.tsx`, `chip.tsx`, `notice.tsx`, `components/evidence-item.tsx`): 기존 shadcn 프리미티브로 표현 불가능한 시각 패턴만 신규 도입해 `claim-status` pill과 evidence 참조 렌더링에 재사용 — 기존 testid/`data-status` 속성 전부 보존
- **3개 화면 재스타일**: 사건 입력(2컬럼 레이아웃), Research Report(사건 요약 패널 + claim 카드 + 우측 레일), 전문가 피드백(번호 매김 섹션 패턴, native `<select>`·동적 `missedIssues` 배열 UI 그대로 유지) — 각 화면의 기존 데이터 계약·테스트 셀렉터·접근성 속성(label 연관, `role="status"`, `aria-live`, focus 동작) 완전 보존

**검증**: 24개 요구사항(REQ-PILOT-VISUAL-001~024) 전부 구현, 25개 인수 기준(AC-PILOT-VISUAL-001~024 + 서브레터 006b/020b/021b, AC-013 의도적 결번) 전부 코드 레벨로 만족. plan-auditor 감사 3회 실행(iteration 1 FAIL(0.63, GEARS 모달리티 위반) → iteration 2 PASS(0.92) → 외부 독립 리뷰 6개 블로커 대응 후 iteration 3 PASS(0.92, 회귀 없음)). M1~M6 전 마일스톤에서 `pnpm test`(335/335)/`pnpm test:e2e`(4/4)/`pnpm lint`/`pnpm build`/`pnpm format:check` exit 0 통과를 오케스트레이터가 매 마일스톤 최종 커밋에 대해 독립 재실행으로 재확인했으며, `app/layout.tsx`/`app/page.tsx`/`app/login/**`의 zero-diff를 전체 M1~M6 범위(`git diff --stat`)로 재검증했습니다. 오케스트레이터가 Playwright로 실제 `pnpm dev` 인스턴스에 대해 1440px/1280px 두 뷰포트에서 3개 화면 전체를 수동 시각 확인(가로 오버플로/사이드바-콘텐츠 겹침 없음). 신규 런타임 의존성 없음(pretendard 패키지 추가 제외), 서버 write-path·DB 스키마·API 계약 변경 없음.

**참고**: `.moai/specs/SPEC-PILOT-VISUAL-001/`

### Added — SPEC-PILOT-UX-001 파일럿 사용성 개선 — 사건 입력→분석 대기→리포트 검토→피드백 제출 흐름

이미 기능적으로 완성되어 있던 `사건 입력 → Gemini 분석 대기 → ResearchReport 검토 → 구조화 피드백 제출` 흐름(SPEC-RESEARCH-001/SPEC-GEMINI-RUNTIME-001/SPEC-EVIDENCE-001/SPEC-FEEDBACK-001의 산출물)을, 신규 비즈니스 기능 없이 UI/UX 계층에서만 다듬어 소수 전문 손해사정사가 비공개 파일럿에서 일상적으로 실사용 가능하게 만들었습니다.

- **사건 입력 대기 상태 강화**(`case-input-form.tsx`): 제출 버튼 텍스트 변경뿐 아니라 별도의 시각적 진행 표시(`role="status" aria-live="polite"`)를 렌더링하고, 4개 입력 필드 전부를 제출 버튼과 함께 비활성화
- **클라이언트 단일 흐름(single-flight) 제출 가드**(`case-input-form.tsx`/`feedback-form.tsx`): `useRef` 기반으로 더블클릭·빠른 재클릭 시 중복 요청을 차단 — 서버측 DB 기반 idempotency(nonce+unique index)가 `createCase`의 `validate → runPipeline → insert` 실행 순서상 동시 요청 경합을 실제로 막지 못한다는 외부 독립 리뷰 지적에 따라 범위에서 제외하고 순수 클라이언트측 가드로 재정의(사건/피드백 모두 서버측 write-path·요청 스키마 변경 없음)
- **리포트 요약 배너**(`page.tsx`): 기존 5개 카드보다 먼저 렌더링되는 요약 배너를 추가해 진단명·장해 부위와 `verifiedClaims` 집계 검증 상태("N건 중 M건 근거 확인, K건 판단 불충분")를 스크롤 없이 노출 — 기존 개별 주장별 `claim-status` pill은 그대로 유지
- **근거자료 표시 개선**(`page.tsx`/`feedback-form.tsx`): `evidence` SELECT 프로젝션을 확장해 기존 `title`/`sourceUrl`뿐 아니라 `evidenceType`/`issueTypes`도 함께 조회·렌더링(두 컬럼 모두 SPEC-EVIDENCE-001에서 이미 존재 — 신규 마이그레이션 없음)하고, `sourceUrl`을 원시 텍스트 대신 클릭 가능한 `<a target="_blank" rel="noopener noreferrer">` 링크로 렌더링
- **피드백 폼 사용성 개선**(`feedback-form.tsx`): 성공 시 시각적 확인 메시지를 표시하고 해당 마운트 인스턴스에서 제출 버튼을 계속 비활성 유지(새 인스턴스 마운트 시에는 재허용 — SPEC-FEEDBACK-001의 append-only 정책과 일치); 검증 실패 시 `Object.values(...).flat().join(" ")`로 뭉쳐 표시하던 필드 오류를 `toFieldErrors`의 실제 최상위 키(`overallRating`/`overallComment`/`missedIssues`/`claimAssessments`/`evidenceAssessments`/`outcome`/`_form`) 기준 필드별 개별 표시로 교체하고, 이 경우 가드를 리셋해 재제출을 허용; `action` 호출 예외/reject 시에도 가드를 리셋하고 폼-레벨 오류를 표시(unhandled promise rejection 없음); 다섯 콘텐츠 영역(전체 평가/누락 쟁점/개별 주장 평가/개별 근거자료 평가/실제 결과)을 구획선으로 시각적으로 구분
- **명시적 UI 상태**: 사건 상세 화면의 `verifiedClaims`/인용 근거자료 빈 배열에 대한 명시적 빈 상태 문구 추가(기존 `reviewTargets`/`missingMaterials`/`uncertainty` 패턴과 동일); 사건 입력 폼의 `fetch` 호출에 `.catch()`를 추가해 네트워크 수준 실패를 사람이 읽을 수 있는 오류 메시지로 처리(unhandled promise rejection 없음); 저장소 전체에 하나도 없던 Next.js App Router `error.tsx` 오류 경계를 `app/cases/[caseId]/`에 신설(재시도 버튼이 `reset()` 호출)
- **안전 문구·개인정보 보존**: 이번 SPEC이 도입·수정한 UI 문구 어디에도 보험금 지급 가능성 확정 서술이 없으며, 신규 개인정보 수집 필드나 기존 PII 차단 검증(`piiFreeText`) 약화 없음 — 어떤 스키마도 수정하지 않음

**검증**: 16개 요구사항(REQ-PILOT-UX-001~016) 전부 구현, 16개 인수 기준(AC-PILOT-UX-001~016) 전부 코드 레벨로 만족. 사용자가 실제 브라우저에서 사건 입력→리포트 렌더링→피드백 제출 성공 메시지→콘솔 오류 없음까지 수동 스모크로 직접 확인했으며, 성공 후 제출 버튼이 계속 비활성 유지되는지는 자동 unit/e2e 테스트(`feedback-form.test.tsx` AC-010, `case-flow.spec.ts`)로 확인했습니다. plan-auditor 감사 7회 실행(iteration 3 FAIL(0.82, GEARS 단일 트리거 형식 위반) → iteration 4 FAIL(0.875, 잔존 위반) → iteration 5 PASS(0.98) → pre-run 정합성 보정 후 iteration 6 FAIL(0.74, REQ-010 응답 분기 위반 + M4 커버리지 갭) → iteration 7 PASS(0.92)), 매 결과를 축소·과장 없이 정직하게 기록. `pnpm test`(48 test files, 335 tests)/`pnpm test:e2e`(4/4)/`pnpm lint`/`pnpm build` 전체 exit 0 통과. `case-input-form.tsx`(79.5%)/`feedback-form.tsx`(61.6%)/`page.tsx`(72.7%) 3개 파일의 statement coverage가 프로젝트 목표(85%)에 미달 — 이 SPEC의 인수 기준에 요구되지 않는 기존 상호작용 분기(쟁점 추가/제거, 개별 평가 select, 실제 결과 필드)로 사용자 승인 하에 갭으로 남깁니다. 신규 런타임 의존성 없음, 서버 write-path(`lib/cases/create-case.ts`/`lib/feedback/submit-feedback.ts`)·스키마(`lib/db/schema.ts`) 변경 없음.

**참고**: `.moai/specs/SPEC-PILOT-UX-001/`

### Added — SPEC-FEEDBACK-001 리포트 단위 전문가 구조화 피드백 (Gold Dataset 축적 기반)

손해사정사/보험 전문가가 특정 사건의 AI 리서치 리포트(`reports` 테이블)에 구조화된 피드백을 남길 수 있도록, 기존 `feedback` 테이블(전체 사건 대상 자유 텍스트 1개 필드)을 리포트 단위 구조화 스키마로 확장했습니다. `case → report → expert feedback` 흐름의 마지막 단계만 다루며, Gold Dataset 자체의 추출·집계는 후속 SPEC으로 명시적으로 미룹니다.

- **⚠️ 파괴적 스키마 변경**: `feedback` 테이블의 기존 자유 텍스트 `content` 컬럼을 제거하고 `reportId`(NOT NULL, `reports.id` FK)·`payload`(JSON, 구조화 스키마) 중심으로 교체(`db/migrations/0004_calm_paladin.sql`) — 기존 `feedback` 행은 마이그레이션 과정에서 폐기됩니다. 레거시 5-컬럼 형태 데이터가 있는 DB에 대해서도 마이그레이션이 exit 0으로 성공하고 `cases`/`reports`/`user` 등 무관한 테이블은 손상 없이 보존됨을 별도 fixture로 검증
- **구조화 피드백 payload Zod 검증**(`lib/feedback/schema.ts`, `reportFeedbackPayloadSchema`): 전체 평가(`overallRating`, 필수 3값 enum) + 선택적 누락 쟁점(`missedIssues[]`, `issueType`은 `lib/pipeline/types.ts`의 `QUERY_ISSUE_TYPES`를 SSOT로 재사용) + 개별 주장(claim) verdict(`claimAssessments[]`, `claimIndex` 유일성 검사) + 개별 근거자료(evidence) verdict(`evidenceAssessments[]`, `evidenceId` 유일성 검사) + 선택적 실제 결과 기록(`outcome`, all-or-nothing 계약 — 한쪽만 채워지면 검증 실패, 둘 다 공백이면 전체 생략) — 모든 자유 텍스트 필드는 `lib/validation/case-input.ts`의 `piiFreeText`를 재사용해 주민등록번호·전화번호 형식을 구조적으로 차단하고, 스키마에 없는 최상위 키는 `.strict()`로 거부
- **write-path 동적 검증**(`lib/feedback/submit-feedback.ts`, `submitReportFeedback()`): `reportId`가 속한 사건의 `ownerUserId`와 호출자가 일치하는지 검사(`getCaseForOwner()`와 동일한 소유권 앵커 원칙) + `claimIndex`가 저장된 리포트의 `verifiedClaims` 길이 범위를 벗어나면 거부 + `evidenceId`가 `evidence` 테이블에 실존하는지 검사(existence-only — 실제 인용 여부는 교차검증하지 않는 사용자 명시적 단순화 결정). `caseId`는 오직 `reportId → reports.caseId`로 서버가 도출하며 함수 시그니처에 파라미터로 받지 않음(cross-case spoofing 방지) — 성공 결과(`{success, feedbackId, caseId}`)의 `caseId`도 이 서버 도출 값
- **한 사건에 리포트가 2개 이상 있는 경우의 결정론적 선택**(`lib/cases/get-case-for-owner.ts`): `createdAt DESC`(동일 시각이면 `id DESC`) 정렬로 항상 최근 리포트 하나만 선택하고, 화면 표시(`report`)와 피드백 제출 대상(`reportId`)을 동일한 단일 쿼리 행에서 함께 도출해 표시-제출 값 불일치를 구조적으로 방지
- **UI 완전 대체**: 사건 상세 화면(`app/cases/[caseId]/`)의 옛 자유 텍스트 피드백 폼을 전체 평가·누락 쟁점 추가·주장별/근거자료별 verdict 선택·실제 결과 입력을 지원하는 구조화 폼(`feedback-form.tsx`)으로 완전히 교체 — 주장/근거자료가 0개인 리포트에서는 해당 verdict 컨트롤이 0개 렌더링되는 것이 정상 동작이며, "실명·상세 주소·주민등록번호·전화번호·의료·보험 원본 문서 내용은 입력하지 마세요" 안내 문구를 화면에 표시
- **append-only 정책**: `(reportId, userId)` 조합에 유일성 제약을 두지 않아 동일 사용자가 동일 리포트에 여러 번(최초 리뷰 + 이후 실제 결과 확인 등) 제출 가능하며, 기존 피드백 행을 수정·삭제하는 API/Server Action은 제공하지 않음
- **post-run 버그 수정**: 외부 독립 리뷰에서 `outcomeSchema`의 preprocess가 "공백 문자열"과 "잘못된 타입(number/null/object)"을 동일하게 취급해, (a) 잘못된 타입 입력이 조용히 `outcome` 생략으로 정규화되어 검증을 통과하거나 (b) 부분 outcome(`description`만 공백, `confirmedAt`만 유효)이 `piiFreeText`의 `min(1)`이 trim 없이 길이만 검사하는 특성 때문에 통과하는 결함 2건을 발견 — RED(결함 재현 테스트 2건 실패 확인) → GREEN(타입 검사와 공백 판정을 분리하는 헬퍼 3개 추가 + `description`에 trim 기반 `.refine()` 추가) 순서로 수정하고 회귀 테스트 3건 추가

**검증**: 15개 요구사항(REQ-FEEDBACK-001~015) 전부 구현, 16개 인수 기준(AC-FEEDBACK-001~016) 전부 코드 레벨로 만족. plan-auditor 감사 4회 실행(iteration 1 PASS(0.92) → 외부 리뷰 11건 반영 후 iteration 2/3 PASS(0.97) → 3차 정합성 보정 후 iteration 3 FAIL(0.90, progress.md 시제 오류 1건) → 수정 후 최종 게이트 PASS(0.97)), 매 결과를 축소·과장 없이 정직하게 기록. `pnpm test`(44 test files, 316 tests)/`pnpm lint`/`pnpm format:check`/`pnpm build`/`pnpm test:e2e`(4/4) 전체 exit 0 통과(post-run 버그 수정 반영 후 재확인). 신규 런타임 의존성 없음.

**참고**: `.moai/specs/SPEC-FEEDBACK-001/`

### Added — SPEC-EVIDENCE-001 근거자료(evidence) corpus 확장 + Retriever 쟁점 중심 ranking + counterEvidenceIds=[] 원인 진단

실 Gemini smoke 2회(`gemini-smoke-20260827.md`, `gemini-runtime-smoke-20260828.md`)에서 `Skeptic.counterEvidenceIds`가 매번 빈 배열로 관측된 현상에 대응해, (축1) evidence corpus를 담보×쟁점 기준으로 검증 가능하게 확장하고 (축2) counterEvidenceIds=[] 원인을 corpus/Retriever/prompt/model behavior 네 갈래로 분해해 관측 가능하게 만들었습니다. vector DB를 도입하지 않고 현재 DB + TypeScript 규칙 기반 구조 위에서 설계했습니다.

- **Evidence 스키마 확장**: `evidence` 테이블에 `issueTypes`(8개 `QueryIssueType`의 부분집합, JSON 배열) 컬럼 1개만 추가(`db/migrations/0003_sad_hitman.sql`) — `sourceIdentifier`/`sourceDate`/`keywords`는 이 SPEC에서 도입하지 않음(dedup은 동일 `sourceUrl` + 정규화된 content 동일성 기준으로 수행). 담보(INJURY_DISABILITY/DISEASE_DISABILITY)×issueType(8개) 16칸 coverage matrix(`coverage-matrix.md`)를 신설
- **Candidate Eligibility + issueType 중심 ranking (Retriever 전략 B 채택)**: `lib/pipeline/evidence-retriever.ts`에 issueType exact match를 포함한 candidate eligibility 전략(전략 B)을 신설해 프로덕션 채택 — hard filter는 도입하지 않고 inclusion-OR/정렬 신호로만 사용. 7개 벤치마크 케이스에서 전략 B가 전략 A 대비 Recall/Hit/Precision 3개 지표 전부 우세함을 실측(비 non-regression 계약 충족)으로 확인, `retrieveEvidence()`는 strategy 값과 무관하게 항상 결정론적 `computeScore()` + `score desc || id asc` tie-break 사용(REQ-EVIDENCE-012)
- **true baseline 측정 인프라 분리**: M2는 `evidence-m2-snapshot.json`의 10건 immutable snapshot으로 eligibility-only exploratory A/B 비교를 수행하고, M4d는 최종 21건 production corpus를 freeze한 동일 입력 위에서 benchmark-only `trueBaselineRetrieveEvidence()`/`computeBaselineScore()` pure 함수(production 경로에서 호출하지 않음)와 production Strategy B를 비교한다 — "동일 corpus 위 알고리즘 개선 효과(algorithm effect)"와 "corpus 확장 효과(corpus expansion effect)"를 혼동하지 않도록 M2와 M4d를 코드/문서 양쪽에서 명확히 분리
- **counterEvidenceIds=[] 진단 harness**: `lib/pipeline/evidence-diagnostic.test.ts` — A(corpus에 counter-relevant evidence 존재)/B(Retriever가 candidate로 반환)/C-전제조건(challenge() 프롬프트에 해당 evidence 포함) 3단계 fixture self-test 신설. 2026-08-28 smoke의 실제 case 입력을 replay해 8개 쿼리 중 5개는 corpus/Retriever 단계에서 candidate가 0건(A/B와 정합), 3개는 candidate가 있었으나 Skeptic의 실제 선택 여부는 LLM 재호출 없이 확인 불가 — "corpus/Retriever/prompt/model behavior 미확정"이라는 결론을 과장 없이 유지
- **Evidence corpus 확장 + 재감사**: 기존 10건 전체 재감사(1건 문구 수정, POLICY→OTHER downgrade 1건 포함) + 신규 확장으로 corpus를 21건으로 확대(`evidence-source-audit-manifest.md`), 7개 BenchmarkCase의 ground truth를 human review로 확정(M4c freeze)
- **정직한 미충족 항목 명시 (best-effort로 공식 하향)**: DISPUTE_CASE(분쟁조정 사례) evidenceType은 FSS/KNIA/FCSC 공식 소스가 텍스트 추출 가능한 형식(HTML)으로 공개되어 있지 않아 3회 세션에 걸친 조사에도 0건 — 사용자 승인을 받아 plan.md M4b 요구를 "최소 1건 필수"에서 "best-effort(0건도 AC 충족)"로 정식 하향. 지어낸 데이터나 사례는 어디에도 추가하지 않았습니다
- **post-run 정합성 보정**: 벤치마크 baseline 배선 결함(전략 A가 일시적으로 `computeBaselineScore`/tie-break-없음 정렬을 잘못 사용해 REQ-EVIDENCE-012를 위반했던 버그)을 발견 즉시 재수정, coverage-delta 리포트를 append-correction 방식에서 단일 최종본으로 재작성

**검증**: 25개 요구사항(REQ-EVIDENCE-001~025) 전부 구현, 25개 인수 기준(AC-EVIDENCE-001~021/026 + AC-EVIDENCE-016 서브레터 a/b/c/d) 전부 코드 레벨로 만족. plan-auditor 감사 7회 실행(iteration 1 FAIL → iteration 2/3 PASS(0.923) → 배선 결함 발견 후 iteration 5 PASS(0.923) → iteration 6 FAIL(기존 미해결 결함) → D1/D2 수정 후 iteration 7 PASS(1.0)), 매 결과를 축소·과장 없이 정직하게 기록. `pnpm test`(42 test files, 289 tests)/`pnpm lint`/`pnpm format:check`/`pnpm build`/`pnpm test:e2e`(4/4) 전체 exit 0 통과(Node 22 + pnpm 환경 실측, 이번 세션 재확인). 신규 런타임 의존성 없음.

**참고**: `.moai/specs/SPEC-EVIDENCE-001/`, `.moai/reports/coverage-delta-m4e.md`, `.moai/reports/evidence-source-audit-manifest.md`

### Added — SPEC-GEMINI-RUNTIME-001 무료 티어 파일럿 안정화 (역할별 모델 분리·호출 배치·rate 페이싱·동시성 제한·재시도 복원력)

실 Gemini 프로덕션 스모크 테스트(`.moai/reports/gemini-smoke-20260827.md`)에서 드러난 4가지 근본 원인(모델 가용성 실패, 무료 tier RPM 쿼터 소진으로 인한 429, Skeptic 반박 근거 공백, 편협한 재시도)에 대응해 무료 티어 소수 파일럿 단계의 **안정성**을 높였습니다. 새 기능이 아니라 기존 6단계 파이프라인의 Gemini 호출 방식과 복원력을 재설계하는 작업입니다.

- **역할별 모델 분리**: Researcher는 `GEMINI_RESEARCH_MODEL`(기본값 `gemini-3.6-flash`), Skeptic·Verifier는 `GEMINI_FAST_MODEL`(기본값 `gemini-3.5-flash-lite`)을 사용 — `provider-factory.ts`가 `GeminiProvider` 생성 이전에 model 문자열을 확정하고, 정상 앱 경로는 `GeminiProvider` 자신의 내부 폴백에 의존하지 않음
- **Gemini 호출 배치**: Researcher·Skeptic이 쿼리/finding 개수만큼(N회) 호출하던 것을 사건당 1회 배치 호출로 축소 — 정상 사건 1건당 핵심 논리적 Gemini 호출이 쿼리/finding 개수와 무관하게 약 3회(Researcher×1 + Skeptic×1 + Verifier×1)로 고정. 배치 전환 이후에도 Researcher finding의 evidence 그라운딩 계약(`supportingEvidenceIds.length >= 1`, 위반 항목만 개별 폐기)은 파싱 후 항목별 업무 규칙 검증으로 그대로 유지
- **Free-tier self-imposed rate scheduler** (`lib/ai/rate-scheduler.ts` 신규): 확정된 model ID 단위로 독립적인 자체 요청 예산(RPM budget)으로 요청 시작 간격을 페이싱하며, 두 역할이 같은 model ID를 가리키면 하나의 스케줄러를 공유하고 `min(researchBudget, fastBudget)`을 적용. `waitForSlot()`은 최초 시도뿐 아니라 429/503 재시도로 인한 모든 후속 실제 호출 시도 직전에도 호출됨. 정상 앱 경로는 프로세스 생애주기 싱글턴(`getDefaultLLMProviders()`)을 통해 이 페이싱 상태를 사건과 사건 사이에도 계속 이어감
- **동시 사건 제한(프로세스 로컬)**: 순수 인메모리 Promise 체인 뮤텍스로 활성 Gemini 파이프라인을 1개로 직렬화(`pipelineChain`, `lib/pipeline/index.ts`) — 여러 서버리스 인스턴스를 아우르는 분산 락이 아님을 명시
- **429/503 재시도 복원력**: Gemini 오류 응답의 `RetryInfo.retryDelay` 힌트를 실제로 읽어 반영하고, 503도 429와 동일한 재시도 경로에 포함하되 총 재시도 횟수와 총 대기 시간 모두에 상한을 둠
- **데이터 취급 계약 재확인**: `caseInputSchema`가 "비식별을 보증"하지는 않는다는 사실을 정정 문서화하고, Google 무료 tier 데이터가 사람 검토·제품 개선에 사용될 수 있음을 명시하며, 파일럿 단계 데이터 취급 운영 계약(합성/사전 비식별화 사건만 사용, 실 PII·원본 문서 금지)을 `.moai/docs/runtime-runbook.md`에 신설
- **스모크 리포트 과잉주장 정정**: `.moai/reports/gemini-smoke-20260827.md`의 관측 범위를 넘어서는 두 문구(모델 플랫폼 전체 단종 단정, corpus 부족 확정 원인 서술)를 hedge된 정정문으로 교체

**검증**: 25개 요구사항(REQ-GEMINI-RUNTIME-001\~025) 전부 구현, 35개 인수 기준(25개 최상위 AC-GEMINI-RUNTIME-001\~025 + 10개 서브레터 AC 009a/014a/016a/016b/018a/021a/021b/022a/022b/022c) 전부 코드 레벨로 만족. `pnpm test`(250/250 tests)/`pnpm lint`/`pnpm format:check`/`pnpm build`/`pnpm test:e2e` 전체 exit 0 통과. 신규 런타임 의존성 없음(`package.json` diff 없음).

**참고**: `.moai/specs/SPEC-GEMINI-RUNTIME-001/`, `.moai/docs/runtime-runbook.md`

### Added — SPEC-RESEARCH-001 6단계 리서치 파이프라인 evidence-first Gemini 전환

SPEC-SCAFFOLD-001이 구축한 6단계 파이프라인(CaseNormalizer → QueryPlanner → EvidenceRetriever → Researcher → Skeptic → Verifier)의 mock/trivial 로직을 실제 evidence-first Gemini 구조화 출력 기반 로직으로 교체했습니다. 새 기능 추가가 아니라, "타입 계약은 있지만 실제로 근거자료를 검증하지 않는" 파이프라인을 "근거자료 없이는 소견을 만들지 않는" 파이프라인으로 바꾸는 대체(replacement) 작업입니다.

- **QueryPlanner 규칙 기반 재작성**: 사건 담보 영역(`CoverageDomain`: INJURY_DISABILITY/DISEASE_DISABILITY)당 최소 3종(장해부위/장해등급기준/인과관계 또는 진단명/장해등급기준/인과관계) 쿼리를 생성 — 이전의 고정 2개 쿼리 스텁을 대체
- **EvidenceRetriever 관련성 필터링**: 담보 영역 일치 AND 키워드 매칭으로 실제 DB 조회 필터링/스코어링 도입, seed evidence 4→10건으로 확장(웹 검증 가능한 실제 법령/판례 4건 포함)
- **`LLMProvider.generateStructured()` 확장**: Gemini adapter가 `responseJsonSchema`로 구조화 출력을 반환하고 Zod `safeParse`로 재검증 — Researcher/Skeptic/Verifier 세 단계 모두 provider를 필수 인자로 받도록 전환(결정론적 provider는 E2E/테스트 전용, 프로덕션 경로는 `provider-factory.ts`가 유일하게 선택)
- **Researcher/Skeptic evidence-first 재작성**: `findingId`를 LLM이 지어내지 않고 코드가 직접 부여, evidence가 없거나 구조화 검증에 실패하면 소견을 억지로 만들지 않고 INSUFFICIENT로 처리
- **Verifier 의미 검증 도입**: evidence-ID 존재 여부만 확인하던 기존 검증에 더해, evidence 내용이 claim/counterArgument를 실제로 뒷받침하는지 LLM 기반 의미 검증(semantic verification)을 추가 — 검증에 실패한 evidence는 최종 리포트에서 제외(fail-closed)
- **공용 safety-validator 신설** (`lib/pipeline/safety-validator.ts`): 보험금 지급확정·확률 표현 등 근거 없는 단정적 문구를 정규식으로 차단, Researcher/Skeptic 출력과 Verifier의 최종 안전 스캔 양쪽에 defense-in-depth로 적용
- **UI 반영**: `page.tsx`에 VERIFIED/INSUFFICIENT 배지, 판단 불충분 사유 섹션, 반론(counterArgument)의 뒷받침·반박 근거 표시 추가
- **post-run 코드 리뷰 3라운드**: M1~M6 구현 완료 이후 별도 SPEC을 만들지 않고 동일 SPEC에서 처리한 merge-blocking 결함 수정 — 1차(safety-validator 신설, Verifier 의미 검증 1단계, UI 배지, evidenceType 라벨 정합화), 2차(Verifier 의미 검증을 Skeptic 반론까지 확장, safety-validator를 Skeptic 출력과 status 무관 최종 스캔에 적용, 퍼센트 차단 규칙을 실제 지급확률 패턴으로 좁힘), 3차/최종(의미검증 실패 시 claim/counterArgument evidence 비우기 대칭화, 최종 safety scan의 status 게이팅 제거, 결정론적 테스트 provider의 evidence-ID 추출 정규식 부수 결함 수정)

**검증**: 25개 요구사항(REQ-RESEARCH-001~025) 전부 구현, 25개 인수 기준(+011a/b, 019a/b 서브레터) 전부 코드 레벨로 만족. `pnpm test`(36 files, 208 tests)/`pnpm lint`/`pnpm format:check`/`pnpm build`/`pnpm test:e2e`(4/4: 로그인·사건입력·테넌트 격리) 전체 exit 0 통과.

**참고**: `.moai/specs/SPEC-RESEARCH-001/`

### Added — SPEC-RUNTIME-001 실제 런타임 활성화 (DB 연결·시드·테스터 프로비저닝·E2E 검증)

SPEC-SCAFFOLD-001이 구축한 scaffold를 실제로 로컬에서 기동 가능한 상태로 전환했습니다(M1/M3/M4/M2/M5/M6 완료). 이번 SPEC은 새 기능이 아니라 "코드는 있지만 실행 경로가 검증된 적 없는" 상태를 "실제로 DB에 붙어 로그인하고 E2E가 통과하는" 상태로 바꾸는 활성화 계층입니다.

- **목적별 환경변수 검증 계약**: `lib/env.ts`가 `db`/`provision`/`app`/`e2e` 4개 실행 목적별로 필요한 환경변수만 검증(스코프 매트릭스는 `.env.local.example`과 `.moai/docs/runtime-runbook.md` §2 참고) — 불필요한 변수까지 요구하지 않음
- **명시적 로드 부트스트랩**: `scripts/cli-bootstrap.ts` — 마이그레이션/시드/테스터 생성 CLI가 셸 `export` 없이 `.env.local` 파일을 직접 로드
- **부팅 시점 fail-fast**: `instrumentation.ts` — Next.js 서버 부팅 시 환경변수 검증을 즉시 실행해 잘못된 설정으로 앱이 조용히 뜨는 것을 방지
- **마이그레이션 적용 CLI**: `pnpm db:migrate`(`scripts/db-migrate.ts`) — 재실행 안전(이미 적용된 마이그레이션은 추적 테이블 기준으로 스킵)
- **시드 적재 CLI**: `pnpm db:seed`(`scripts/db-seed.ts`) — `id` 기준 onConflict로 재실행해도 중복 없음
- **테스터 계정 프로비저닝 CLI**: `pnpm tester:add`(`scripts/provision-tester.ts`) — Better Auth 공식 API(`auth.api.signUpEmail()`)로 초대 전용 테스터 계정 생성, 이미 존재하는 이메일은 스킵
- **실제 Playwright E2E 스위트**: `pnpm test:e2e`(`scripts/run-e2e.ts` + `e2e/*.spec.ts`, `playwright.config.ts`) — 로그인·사건입력·피드백·테넌트 격리 4개 시나리오를 실제 Chromium으로 검증. 매 실행마다 로컬 파일 DB를 초기화하고 마이그레이션·시드·테스터 A/B 프로비저닝을 자동 수행해, 원격 인스턴스나 개발자의 `.env.local` 데이터에 영향을 주지 않음. 실행 포트는 하드코딩 대신 실행 시점에 빈 포트를 동적으로 탐색(`findFreePort()`)
- **운영자용 런북**: `.moai/docs/runtime-runbook.md` — 준비물부터 E2E 실행까지 순서대로 따라갈 수 있는 절차 문서
- **SPEC-SCAFFOLD-001 스키마/마이그레이션 드리프트 보정**: M2 실행 중 발견된 `account.issuer` 컬럼 누락(Better Auth 1.7.1 요구)을 보정 마이그레이션 1건(`db/migrations/0001_bitter_talon.sql`)으로 해소

**검증**: `pnpm test`(33 files, 139 tests)/`pnpm lint`/`pnpm build`/`pnpm format:check` 전체 통과. 22개 인수 기준(AC-RUNTIME-001~022) 전체 PASS. 독립 보안 리뷰에서 CRITICAL/HIGH 등급 발견 없음.

**참고**: `.moai/specs/SPEC-RUNTIME-001/`, `.moai/docs/runtime-runbook.md`

### Added — SPEC-SCAFFOLD-001 최초 프로젝트 scaffold 및 핵심 아키텍처

보상레이더 MVP의 최초 실행 가능한 프로젝트 scaffold와 핵심 아키텍처를 구축했습니다(M6, M1-M5 완료).

- **프로젝트 초기화**: Next.js App Router + TypeScript strict + Tailwind CSS + shadcn/ui 기본 설정
- **DB 스키마**: Drizzle ORM 스키마(`cases`, `evidence`, `reports`, `feedback`, `allowed_testers`) + Turso/libSQL 클라이언트 배선(`lib/db/`), `drizzle-kit generate` 마이그레이션 생성 확인
- **AI provider abstraction**: 공통 `LLMProvider` 인터페이스(`lib/ai/provider.ts`) + Gemini adapter(`lib/ai/providers/gemini.ts`, `@google/genai@2.18.0`), 429 rate-limit 지수 백오프 재시도 처리
- **인증**: Better Auth 기반 초대 전용(allowlist) 접근 제어(`lib/auth/config.ts`), `proxy.ts` 라우트 가드로 비로그인 사용자를 `/login`으로 리다이렉트, `owner_user_id` 컬럼 기반 사건 데이터 접근 제어
- **PII 입력 검증**: `lib/validation/case-input.ts` Zod 스키마 — 주민등록번호·전화번호·상세주소·의료기록 원본 형식 패턴을 `CaseNormalizer` 호출 이전 단계에서 구조적으로 거부
- **6단계 리서치 파이프라인**: CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher → Skeptic → Verifier의 독립 호출 가능한 타입 계약(`lib/pipeline/`), 목업 구현으로 seed evidence 데이터와 연결된 Research Report end-to-end 생성 검증
- **최소 UI**: 사건 입력 폼(`app/cases/new/`), 사건 상세 + 리포트 뷰 + 전문가 피드백 폼(`app/cases/[caseId]/`), 사건 생성 API route handler(`app/api/cases/`)
- **테스트/린트/포맷 하네스**: ESLint 9 flat config + Prettier + Vitest, `pnpm lint` / `pnpm format` / `pnpm test` 명령 지원

**검증**: `pnpm build`/`pnpm lint`/`pnpm test`(22 files, 71 tests)/`pnpm format:check` 전체 통과. 17개 인수 기준(AC-SCAFFOLD-001~017) 전체 PASS.

**참고**: `.moai/specs/SPEC-SCAFFOLD-001/`
