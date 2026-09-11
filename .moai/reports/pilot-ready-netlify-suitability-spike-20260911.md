# Netlify 적합성 스파이크 (REQ-PILOT-READY-001/002 호스팅 후보 변경 — M4)

> **판정 요약: BLOCKED (문서 근거 — 실측 없이 판정).** 실제 비공개 배포와 Gemini 10회
> 실측은 수행하지 않았다 — 아래 §3의 문서 근거만으로 현재 구조가 Netlify Free의 실제
> 제약을 넘어선다는 것이 이미 확인되므로, 실 API 호출로 같은 결론을 다시 확인하며
> Gemini/Netlify 쿼터를 소모하는 것은 낭비라고 판단했다(사용자 확인·승인됨). 이
> 판정은 §5의 후속 SPEC(비동기 재설계)이 구현된 뒤에만 재검토된다.

## 0. 이 라운드에서 확정된 운영 결정

- **호스팅**: Netlify Free (기존 Vercel 검토를 대체한다)
- **프론트/백엔드**: 기존 Next.js 단일 프로젝트 그대로 유지(분리 없음)
- **배포 주소**: 무료 `*.netlify.app` 주소
- **DB**: Turso Free (구체적 인스턴스는 아직 미생성 — 운영자가 직접 생성 예정)
- **AI**: Gemini API Free
- **지원 연락처**: `SUPPORT_CONTACT_EMAIL=zuge3927@naver.com`(확정, `.env.local`에 반영됨)
- **장애 대응 triage 담당자**: 이경환(파일럿 운영 책임자), 장애 접수 목표 1영업일 이내 1차 확인

## 1. 어댑터 — 별도 구조 변경 불필요 (항목 1 확인)

Netlify의 공식 Next.js 어댑터는 `@netlify/plugin-nextjs`(오픈소스 [OpenNext](https://opennext.js.org/netlify) 기반)이며, **별도 설치나 설정이 필요 없다** — 빌드 시점에 Netlify가 자동으로 적용한다. 버전을 고정하고 싶을 때만 `netlify.toml`에 플러그인을 명시하면 되지만 권장되지 않는다. 프론트·백엔드 분리나 구조 변경은 필요하지 않다(항목 1 충족).

## 2. 호환성 확인 (항목 2)

| 항목 | 확인 결과 | 근거 |
|---|---|---|
| App Router | 완전 지원 | Netlify 공식 문서 |
| SSR / React Server Components / Server Actions | 완전 지원 | Netlify 공식 문서 |
| API Routes / Route Handlers | 지원 — Netlify Function으로 자동 프로비저닝됨 | Netlify 공식 문서 |
| Better Auth (세션/쿠키 기반) | 구조적으로 문제 없어 보임(상태 비저장 per-request 처리) — **실 배포 미검증** | 코드 조사(파일시스템 의존 없음) |
| Turso/libSQL(`@libsql/client`) | HTTP 기반 원격 클라이언트라 서버리스 환경과 궁합이 맞음 — **단, 프로덕션은 반드시 원격 `libsql://` 대상이어야 한다**. 지금 `.env.local`의 `TURSO_DATABASE_URL`은 로컬 `file:` 경로라 서버리스 함수 간 파일시스템이 공유되지 않는 환경에서는 동작하지 않는다(이미 plan.md가 요구하던 조건과 동일) | 코드 조사 + `.env.local` 확인 |
| `instrumentation.ts`의 `process.exit` Edge Runtime 경고 | 기존 `pnpm build` 경고(Vercel 대상 베이스라인에도 이미 존재, 이 SPEC이 만든 문제 아님) — Netlify에서도 동일하게 경고만 발생할 가능성이 높음(미검증) | 기존 빌드 로그(5·6차 라운드에서도 동일 경고 확인됨) |

## 3. 실제 함수 제한 — 사용자 제시값(60초) 정정 (항목 3)

**사용자가 제시한 "동기 함수 제한 60초"는 실제와 다르다.** Netlify 공식 문서 확인 결과:

| 함수 종류 | 실제 제한 | 비고 |
|---|---|---|
| **동기(synchronous) 함수** | **10초** (Free/Pro 공통 기본값; Pro 이상은 요청 시 26초까지 가능) | 지금 `POST /api/cases`가 쓰는 방식 — 처리 완료까지 기다렸다가 `201`로 결과 전체를 반환 |
| 스트리밍(streaming) 함수 | 60초, 응답 20MB 제한 | **다른 종류의 함수** — 코드를 스트리밍 응답 구조로 다시 짜야 적용됨. 사용자가 언급한 "60초"는 이 값과 혼동된 것으로 보인다 |
| Background Function | 최대 15분 | 요청을 받으면 **즉시 `202` 응답**을 주고 나머지는 비동기로 처리 — 결과를 기다렸다가 한 번에 돌려주는 지금 방식과 응답 형태 자체가 다르다 |

이 SPEC이 운영 제약으로 기록해야 할 정확한 값은 **동기 함수 10초**다(60초 아님).

## 4. 실측을 수행하지 않은 이유 + 기존 실측 근거로 대체 (항목 4-5)

10회 실제 Gemini 배포환경 호출은 수행하지 않았다(사용자 확인). 대신 이미 존재하는 실측 근거를 인용한다:

> `.moai/reports/gemini-runtime-smoke-20260828.md` — `POST /api/cases` 요청 시작~응답
> 수신까지 **실측 30초**(curl 실측, CaseNormalizer→...→Verifier 전 단계 포함). 단계별
> 타임스탬프: Researcher 호출 후 Skeptic까지 12.227초 간격, Skeptic→Verifier까지
> 15.004초 간격 — 이 간격의 대부분은 모델 처리 시간이 아니라, 이 SPEC이 스스로 설정한
> `GEMINI_*_RPM_BUDGET=4`(분당 4회, 최소 15초 간격) 페이싱 계약이 의도적으로 만드는
> 대기 시간이다.

즉 3단계(Researcher→Skeptic→Verifier)를 순차 호출하는 지금 설계는, 모델 자체가
즉시 응답하더라도 **RPM 페이싱만으로 최소 약 27초 이상**이 걸리도록 만들어져 있다.
동기 함수 10초 한도 안에서는 애초에 1단계도 안전하게 끝난다고 보장할 수 없다 — 별도
실측 없이도 구조적으로 BLOCKED임을 이 기존 데이터가 뒷받침한다.

**판정 기준 적용**: 사용자가 제시한 "≤50초 조건부 READY / 50초 초과 여유 부족 /
60초 초과 BLOCKED" 기준 자체가 60초라는 잘못된 상한을 전제로 한 것이었다. 올바른
상한(10초) 기준으로는 최대 관측값(30초, 그리고 페이싱만으로 27초)이 이미 상한을
3배 가까이 초과하므로, 이 기준을 적용할 필요도 없이 **BLOCKED**다.

## 5. 후속 SPEC 제안 — 비동기(POST 202 + 상태 조회) 전환

항목 6 지시에 따라 즉시 Background Function으로 바꾸지 않고, 별도 후속 SPEC으로
제안만 남긴다. 제안 스케치:

- **가칭 SPEC**: `SPEC-PILOT-ASYNC-SUBMIT-001` (실제 생성은 이 라운드에서 하지
  않음 — `/moai plan`으로 별도 착수 필요)
- **설계 방향**: `POST /api/cases`가 즉시 `202 Accepted` + `caseId`를 반환하고,
  실제 파이프라인 실행은 Netlify Background Function(최대 15분 — 지금 파이프라인의
  현실적 최대치 약 270초에 충분한 여유)으로 옮긴다. 클라이언트는 `GET
  /api/cases/:id/status`(신규)를 폴링해 완료 여부를 확인한다.
- **영향 범위**: `app/api/cases/route.ts`(202 즉시 응답으로 변경), 신규 상태 조회
  라우트, `lib/cases/create-case.ts`의 리스(lease) 가드 로직은 그대로 재사용 가능
  (동시 실행 가드는 응답 방식과 무관), 프론트(`app/cases/new/`)에 폴링 UI 추가 필요.
- **이 SPEC(SPEC-PILOT-READY-001)과의 관계**: 이 SPEC의 M1(동시 실행 가드)·M2(로깅)·
  M3(고지/연락채널)·M5(런북)·M6(테스트)는 그대로 재사용된다 — 재설계 대상은 M4의
  호스팅 전제(동기 응답 구조)뿐이다.

## 6. Netlify 월 300크레딧 사용 예상치 (항목 7)

Netlify Free는 총 300크레딧이며, 크레딧 소비 기준은 다음과 같다(Netlify 공식
가격 페이지 확인):

| 항목 | 단가 |
|---|---|
| Production deploy | 1회당 15크레딧 |
| Compute(함수 실행) | GB-hour당 10크레딧(기본 메모리 1024MB=1GB 기준) |
| Bandwidth | GB당 20크레딧 |
| Web 요청 | 10,000건당 2크레딧 |

**약 10명 규모, 저빈도 파일럿 기준 대략적 추정**(§5의 비동기 재설계가 적용된
이후를 가정 — 지금의 동기 구조로는 10초에서 곧바로 실패하므로 컴퓨트 소모가
오히려 더 적지만, 그건 이점이 아니라 실패다):

- Production deploy 약 5회(초기 설정+반복) → 약 75크레딧
- Background Function 컴퓨트: 10명 × 평균 3건 제출 = 30건, 건당 최대 약 270초(0.075h) ×
  1GB → 약 2.25 GB-hour → 약 23크레딧
- 로그인/세션/페이지 렌더 등 일반 SSR 함수 호출: 요청 수 대비 미미(대략 1크레딧 내외)
- Bandwidth: 정적 자산 + API 응답 약 1-2GB → 약 20-40크레딧

**합계 대략 120-140크레딧, 300크레딧 한도의 절반 이하**로 예상된다 — 단, 이는
실측이 아니라 위 단가표에 근거한 개략적 추정이며, 실제 배포 빈도·트래픽에 따라
달라진다. Production deploy 1회당 15크레딧이 가장 큰 단일 비용 요소이므로, 항목 7
지시대로 **production deploy는 필요한 경우에만 수행**하고(Netlify는 PR별 미리보기
배포를 별도로 제공하므로 반복 확인은 미리보기로 대체 가능), **자동 추가결제(overage
자동 청구)는 활성화하지 않는다.**

## 7. 실행하지 않은 항목 (항목 8-9)

실제 비공개 배포를 하지 않았으므로 다음은 **이번 라운드에서 검증되지 않았다**(이후
비동기 재설계 SPEC의 실 배포 라운드에서 검증 예정):

- Turso migration/seed 실행
- 실제 로그인·세션 수립
- 지원 링크(`mailto:zuge3927@naver.com`)가 실제 배포 환경에서도 정상 렌더링되는지
- Gemini 3단계 파이프라인의 배포환경 종단 실행
- `201` 응답 및 DB 영속화·조회

## 8. 잔여 위험

- **RPM 페이싱 가정의 재검증 필요**: 위 §4의 "최소 27초" 추정은 현재 코드의
  `GEMINI_*_RPM_BUDGET=4` 설정을 그대로 유지한다는 전제다. 향후 쿼터가 늘어나
  budget을 높이면 페이싱 대기는 줄지만, Researcher/Skeptic/Verifier 각 단계의
  실제 모델 처리 시간(관측되지 않음, 페이싱 대기에 가려져 있음)이 여전히 남아
  10초 안에는 들어오지 않을 가능성이 높다.
- **Better Auth·Turso의 Netlify Function 콜드 스타트 영향**: 문서상 호환되지만,
  실제 콜드 스타트 지연은 실 배포 전까지 알 수 없다.
- **300크레딧 추정치의 불확실성**: 위 §6 추정은 개략치이며, 특히 "300크레딧이
  매월 갱신되는지 아니면 고정 1회 한도인지"가 Netlify 공식 페이지에서 명확히
  확인되지 않았다 — 실제 배포 전 Netlify 대시보드에서 직접 확인이 필요하다.

## 출처

- [Next.js on Netlify | Netlify Docs](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Netlify Joins OpenNext | Netlify Blog](https://www.netlify.com/blog/netlify-joins-opennext/)
- [Background Functions overview | Netlify Docs](https://docs.netlify.com/build/functions/background-functions/)
- [Netlify's New Background and Scheduled API Routes for Next.js](https://www.netlify.com/blog/new-background-scheduled-api-routes-nextjs/)
- [Netlify Functions Usage and Billing | Netlify Docs](https://docs.netlify.com/build/functions/usage-and-billing/)
- [Netlify Pricing](https://www.netlify.com/pricing/)
- Netlify 커뮤니티 포럼(동기 함수 10초 제한 다수 확인 게시물) — https://answers.netlify.com/t/timeout-10-seconds/83146 등
- `.moai/reports/gemini-runtime-smoke-20260828.md` (기존 실측 근거)
