# Research — SPEC-SCAFFOLD-001

목적: 보상레이더 MVP 최초 scaffold + 핵심 아키텍처 SPEC 작성 전, 채택하려는 스택(Next.js/Turso·Drizzle/Gemini API/Auth.js/Zod)의 2026년 현재 상태를 실제로 확인한 결과. Explore 서브에이전트가 WebSearch/WebFetch로 조사했으며, 모든 항목에 출처와 신뢰도(Verified/Unverified)를 함께 기록한다. `.moai/project/tech.md`는 이 조사 이전에 작성됐기 때문에, 여기서 발견된 사실 중 일부(특히 Auth.js 상태)는 tech.md의 기존 결정과 상충할 수 있다 — 상충 지점은 아래 §6에 명시하고, SPEC 작성 전 사용자 확인을 거친다.

## 1. Next.js 최신 안정 버전 및 주요 변경사항 (Verified)

- 최신 안정 버전: **Next.js 16.3.2** (2026-08-20 보안 패치 포함).
- Node.js 20.9.0 이상 필요, TypeScript 5.1.0 이상 필요.
- App Router는 React 19.2 기반.
- **Turbopack이 v16부터 기본 번들러**(dev/build 모두) — 커스텀 Webpack 설정이 있으면 `next build`가 실패할 수 있음(`--webpack` 플래그 또는 마이그레이션 필요).
- **`next lint` 제거됨** — ESLint를 직접 실행해야 함. `eslint-config-next`는 이제 ESLint 9 flat config 기본.
- **`middleware.ts` → `proxy.ts`로 이름 변경** (`middleware()` 함수 → `proxy()`), `proxy`는 edge 런타임을 지원하지 않고 `nodejs` 런타임에서만 동작 — 인증/allowlist 검사를 미들웨어에 둘 계획이므로 직접 영향.
- 비동기 요청 API(`cookies()`, `headers()`, `params`, `searchParams`)는 동기 접근이 완전히 제거됨 — 항상 await 필요.

출처: https://nextjs.org/docs/app/guides/upgrading/version-16 , https://nextjs.org/blog

## 2. Turso + Drizzle ORM + Next.js 연동 (Verified)

- 공식 설치: `npm i drizzle-orm@rc @libsql/client` + `npm i -D drizzle-kit@rc tsx` (주의: Drizzle 공식 Turso 퀵스타트가 **`@rc`(1.0 릴리스 후보) 태그**를 안내함).
- 현재 stable `drizzle-orm`은 npm 기준 **0.45.2** (2026-03 배포), `@rc`(1.0.0-rc.x)는 별도 병행 배포 중.
- `@libsql/client` 현재 stable: **0.17.4**.
- Vercel 서버리스 환경 주의점: `TURSO_SYNC_URL`을 프로덕션에 설정하지 말 것(서버리스 함수는 로컬 복제본을 유지할 수 없어 매 콜드스타트마다 sync 비용만 발생). libSQL 드라이버는 연결을 열 때마다 최신 원격 상태를 즉시 가져오므로 Postgres식 커넥션 풀링과는 다름. 미종료 연결은 Vercel `waitUntil()`로 처리되며 5초 내 미종료 시 강제 flush.
- import 변형: `@libsql/client/node`, `@libsql/client/web`(Next.js 등 번들러 환경 권장), `@libsql/client/http`, `@libsql/client/ws`.

출처: https://orm.drizzle.team/docs/get-started/turso-new , https://turso.tech/blog/serverless , https://registry.npmjs.org/@libsql/client

## 3. Gemini API 현재 SDK 및 무료 tier 한도

**SDK명 (Verified)**: 현재 활발히 개발되는 공식 SDK는 **`@google/genai`**(GitHub: `googleapis/js-genai`)이며, 구버전 `@google/generative-ai`를 대체한다(구버전은 Gemini 2.0+ 신규 기능을 받지 못함). 최신 버전 **2.18.0** (2026-08-19). Node 20+ 필요, 향후 v3.0.0부터 Node 22+ 요구 예정 + Automatic Function Calling 관련 breaking change 예고됨 — SDK 버전을 명시적으로 고정(`<3.0.0` 등) 권장.

**무료 tier 요청 한도 (Unverified)**: Google 공식 문서(`ai.google.dev/gemini-api/docs/rate-limits`)는 더 이상 모델별 고정 RPM/TPM/RPD 표를 게시하지 않으며, "사용 tier에 따라 다르고 AI Studio 대시보드(`aistudio.google.com/rate-limit`)에서 확인하라"고만 안내한다. 서드파티 사이트들이 언급하는 구체적 숫자(예: Flash 분당 10회/일 250회)는 출처 간 불일치가 있어 **사실로 취급하지 않는다** — SPEC에는 "구현 시점에 `aistudio.google.com/rate-limit`에서 실제 한도를 재확인" 문구로 남긴다.

출처: https://github.com/googleapis/js-genai , https://ai.google.dev/gemini-api/docs/rate-limits , https://ai.google.dev/gemini-api/docs/pricing

## 4. Auth.js (NextAuth) v5 + allowlist — 중요 위험 발견 (Verified)

- **셋업 패턴**: `auth.ts`에서 `NextAuth({...})`로 `{ auth, handlers, signIn, signOut }`를 export하고, `app/api/auth/[...nextauth]/route.ts`에서 `{ GET, POST } = handlers`로 라우트 핸들러를 노출. `auth()` 함수 하나로 Server Component/Route Handler/미들웨어(→ proxy.ts)에서 공통 세션 확인 가능.
- **Allowlist 강제는 네이티브로 지원됨** (커스텀 미들웨어 불필요): Credentials provider의 `authorize()` 콜백에서 allowlist에 없는 이메일이면 `null` 반환 또는 커스텀 에러 throw. 또는 최상위 `signIn()` 콜백에서 `false`/리다이렉트 반환 — Credentials·OAuth·매직링크 공통으로 동작.
- **⚠️ 중요 위험**: npm dist-tag 기준 `next-auth`의 `latest`는 여전히 **v4.24.15**이고, v5는 **`beta` 태그(5.0.0-beta.32)로만 배포** 중이다(약 3년째 베타). 더 결정적으로: **2025년 9월부터 Better Auth 팀이 Auth.js 유지보수를 인수**했고, Auth.js는 현재 **보안 패치만 하는 유지보수 모드**이며 신규 기능 개발은 모두 Better Auth로 이전됐다. `.moai/project/tech.md`는 이 조사 이전에 Auth.js(NextAuth) v5를 채택 근거로 작성됐는데, 이 사실은 그 결정에 직접 영향을 준다.

출처: https://authjs.dev/getting-started/migrating-to-v5 , https://registry.npmjs.org/next-auth , https://better-auth.com/blog/authjs-joins-better-auth

## 5. Drizzle Kit 마이그레이션 (Verified)

- `drizzle-kit generate` + `drizzle-kit migrate`: SQL 마이그레이션 파일을 생성 후 리뷰·적용 — 프로덕션 권장(감사 가능한 이력).
- `drizzle-kit push`: 스키마를 코드와 직접 비교해 즉시 반영, 파일 없음 — 서버리스 DB(Turso 포함) 개발 단계에 권장.
- `drizzle.config.ts`에서 `dialect: 'turso'` + `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`.

출처: https://orm.drizzle.team/docs/drizzle-kit-push , https://orm.drizzle.team/docs/get-started/turso-new

## 6. 스택 조합 호환성 이슈 및 tech.md와의 상충점

1. Next.js 16의 `next lint` 제거 → ESLint 9 flat config로 직접 설정 필요 (tech.md의 "ESLint + Prettier" 항목은 유효하지만 설정 방식이 달라짐).
2. `middleware.ts` → `proxy.ts` 이름 변경, edge 런타임 미지원 → structure.md의 `middleware.ts` 계획을 `proxy.ts`로 갱신 필요.
3. **Auth.js v5가 beta 태그 + 유지보수 전용 모드** (Better Auth로 무게중심 이동) — tech.md가 이 조사 이전에 Auth.js v5를 채택한 것과 상충. 실사용에는 문제없다는 보고가 많지만, 신규 프로젝트가 유지보수 모드 라이브러리를 채택하는 리스크를 사용자가 인지하고 선택해야 한다. **→ SPEC 작성 전 사용자 확인 필요.**
4. `drizzle-orm` 공식 퀵스타트가 `@rc`(1.0 프리릴리스)를 안내하지만 stable은 0.45.x — SPEC은 안정성 우선 원칙에 따라 **stable 0.45.x 계열로 고정**하는 것으로 판단(overengineering 방지·무료 tier 우선 원칙과 일관).
5. `@google/genai` v3.0.0에서 Node 22+ 요구 + AFC 변경 예고 → SDK 버전을 `<3.0.0`로 명시 고정 권장.
6. Gemini 무료 tier 한도는 공식 고정 표가 없음 → SPEC에 구체적 숫자를 못 박지 않고 "구현 시 재확인" 문구로 남김.
7. shadcn/ui 공식 문서는 아직 Next.js 15 기준을 명시하며 Next.js 16 명시적 검증 문구는 발견하지 못함 (React 19 자체는 지원 확인됨) — **미검증, 구현 시 주의**.

## 미검증 항목 (SPEC에 사실로 서술 금지)

- Gemini 무료 tier의 정확한 RPM/TPM/RPD 숫자.
- shadcn/ui의 Next.js 16.3.x 공식 검증 여부.
- `drizzle-orm@rc`(1.0 프리릴리스)가 프로덕션 지향 scaffold에 안전한지 여부 — 판단 필요, 사실 아님.
