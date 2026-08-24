# Project Interview

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
