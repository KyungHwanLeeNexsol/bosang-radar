# Project Interview

> 2026-09-17 재인터뷰 — 디자인 피벗(`design/MIGRATION-PLAN.md`, 손해사정사 워크스페이스 폐기 → B2C 보상 진단 퍼널)에 따른 기획 문서 재작성. 이전 인터뷰(B2B 리서치 어시스턴트 기준)는 이 파일 하단 `## 이전 인터뷰 (참고용)`에 보존.

## Stage A Round 1: Ownership, Purpose, and Goal
Question: 새 기획 문서의 핵심 목표를 한 줄로 정리하면 어느 쪽에 가깝나요?
Answer: B2C 리드 퍼널 — 사고·질병 당사자 본인이 검색 한 줄로 담보를 진단받고, 손해사정사 상담으로 이어지는 것이 최종 목표. `design/MIGRATION-PLAN.md` 그대로.
Domain: insurance-coverage-diagnosis-funnel (B2C, web application) — Explore 코드 분석으로 자동 판정(기존 코드는 B2B였고 코드 기반 자동판정 아님, 사용자 확인으로 확정)
Goal: 사고·질병 당사자가 검색 한 줄로 4카테고리(실손의료비/정액담보/후유장해/특별보상) 담보 진단을 받고, 손해사정사 카톡·전화 상담으로 연결되는 B2C 셀프서비스 퍼널을 만든다.

## Stage A Round 2: Constraints and Non-Goals
Question: 연락처(전화번호 등) 수집은 어디까지 허용할까요? (기존 "PII 최소화" 원칙과 충돌)
Answer: 상담 신청 단계만 예외 — 진단 단계(01·02 화면)는 여전히 비식별 유지, 03번 상담 신청 화면(리드 폼)에서만 이름·연락처 수집.
Constraints:
- 담보 진단 단계(01 질문 입력 · 02 진단 결과)는 비식별 유지 — 이름·전화번호·주민번호 등 PII 입력 필드 없음.
- 03 상담 신청 화면(리드 폼)에서만 연락처 수집 허용 — 새로 도입되는 유일한 예외.
- 금액 표기는 단정형 금지, 항상 범위로 제시 (`MIGRATION-PLAN.md` §4 유지) — 표시광고법·보험업법 리스크 관리.
- 면책 문구 필수 노출, 숨기거나 툴팁 처리 금지.
- 기존 B2B 코드(사건 리서치 파이프라인·인증·DB)는 이번 범위에서 건드리지 않음 — 재사용/폐기 판단은 후속 SPEC.

## Stage A Round 3: Scope, Boundaries, and Documentation Priority
Question: 새 문서가 가장 정확하게 담아야 할 부분은 어느 쪽일까요?
Answer: 구조·공존 관계 — 기존 B2B 코드(로그인·사건 리서치 파이프라인)와 새 B2C 화면(검색→진단→상담신청)이 앞으로 어떻게 공존·전환되는지를 정확히 기록하는 것이 최우선.
Question 2 (scope boundary, separate per HARD rule): 이번 문서 작업의 범위는 어디까지인가요?
Answer 2: 문서만, 새 B2C 3화면 기준.
Scope: In-scope — product.md/structure.md/tech.md를 새 B2C 흐름(01 질문 입력 → 02 보상 진단 결과 → 03 상담 신청) 기준으로 재작성, 기존 B2B 코드와의 공존 관계를 구조 문서에 명시. Out-of-scope (이번 라운드) — 기존 B2B 코드의 실제 재사용/삭제/마이그레이션 실행(코드 변경 없음), 새 화면의 실제 구현.

## Stage B Round 4: Verification, Surfaces, and Sharing
Verification: 기존과 동일 — Vitest(단위) + Playwright(E2E) 유지
UI surface: has-ui (자동 판정 — 진단 퍼널은 명백히 웹 UI)
External systems: 기존 Turso/libSQL(DB) + Gemini API 재사용 전제 (담보 매칭 로직에 AI를 쓸지, 정적 규칙으로 할지는 후속 SPEC에서 결정 — 이번엔 "재사용 가능하다"는 전제만 문서에 남김)
Team sharing: solo

---

## 이전 인터뷰 (참고용 — B2B 리서치 어시스턴트 기준, 2026-08-25)

## Stage A Round 1: Vision and Domain
Question: (Volunteered in the initial /moai plan request — no separate round needed; clarity score assessed at 9/10, satisfying early exit.)
Answer: 보상레이더(bosang-radar) — 보험설계사와 손해사정사가 비식별 보험 사건 정보를 입력하면, 상해후유장해/질병후유장해 관점에서 추가 검토할 담보·근거자료·반대 논리·추가 필요자료를 조사해 주는 B2B AI Research Assistant.
Domain: insurance-research-assistant (B2B, web application)
Goal: 현직 보험설계사·손해사정사 10명이 실제로 사용해 볼 수 있는, evidence 기반 AI 리서치 보조 도구의 최소 실행 가능 제품(MVP)을 만든다.

## Stage A Round 2: Technology and Constraints
Question: (Volunteered in the initial request.)
Answer: Next.js(최신 안정 버전) + App Router + TypeScript strict + Tailwind CSS + shadcn/ui + Turso/libSQL + Drizzle ORM + Gemini API + Vercel 무료 배포. 가능한 모든 인프라는 무료 tier 우선.
Constraints:
- AI는 보험금 지급 여부/지급 확률을 단정하지 않는다.
- 모든 주요 AI 판단은 evidence와 연결되어야 한다.
- 개인정보·민감정보 저장 최소화 — 주민번호, 전화번호, 상세주소, 의료기록 원본은 MVP에서 받지 않는다.
- 특정 LLM에 application logic이 종속되지 않도록 AI provider abstraction 필요.
- DB는 Drizzle ORM 뒤에 두어 향후 PostgreSQL 이전 가능해야 한다.
- microservice, Kubernetes, 별도 vector DB 등 overengineering 금지.
- 무료 tier 인프라 우선.

## Stage A Round 3: Scope and Boundaries
Question: (Volunteered in the initial request.)
Answer: 초기 MVP는 상해후유장해 / 질병후유장해 두 영역만 지원한다. 이번 SPEC은 전체 서비스 완성이 아니라, 최초 실행 가능한 프로젝트 scaffold와 MVP 핵심 아키텍처 구축에 집중한다. 핵심 흐름: 사건 입력 → CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher → Skeptic → Verifier → Research Report → 전문가 피드백 저장. 실제 대규모 데이터 수집보다 작은 seed evidence 데이터로 end-to-end pipeline 완성을 우선한다.
Scope: In-scope — 상해후유장해/질병후유장해 리서치 파이프라인, 사건 입력 UI, evidence 기반 리서치 리포트, 전문가 피드백 저장. Out-of-scope (이번 SPEC) — 보험금 지급 판단/확률 제공, 대규모 실데이터 수집, 다른 담보 영역, PostgreSQL 마이그레이션 실행, microservice/K8s/vector DB.

## Stage B Round 4: Verification, Surfaces, and Sharing
Verification: Vitest (`pnpm test`)
UI surface: has-ui
External systems: Turso/libSQL (DB), Gemini API (LLM)
Team sharing: solo
