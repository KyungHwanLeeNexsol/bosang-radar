# Netlify 적합성 스파이크 (REQ-PILOT-READY-001/002 호스팅 후보 변경 — M4)

> **판정 요약: UNVERIFIED (실 배포 미수행).** 실제 비공개 배포와 Gemini 10회 실측은
> 여전히 수행하지 않았다(사용자 확인·재확인됨). v1(2026-09-11 초판)은 이 상태를
> "BLOCKED"로 표기했으나, 이는 이 SPEC의 acceptance.md AC-PILOT-READY-016b가 정의한
> READY/BLOCKED/UNVERIFIED 3분류 중 잘못된 항목을 골랐다는 지적(외부 구현 검토
> 7차)을 받아 **UNVERIFIED로 정정한다** — "값을 실제로 측정했고 기준을 넘는 것을
> 확인했다"(BLOCKED)와 "아직 이 환경에서 측정하지 않았다"(UNVERIFIED)는 서로 다른
> 주장이며, 이 라운드는 후자에 해당한다. §4의 기존 30초 참고 자료는 **다른 환경(이
> SPEC의 로컬/기존 배포 대상)에서 나온 과거 증거일 뿐, 이 Netlify 배포의 적합성을
> 확정하지 못한다.**

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

## 3. 동기 함수 실행 제한 — **미해결 사실 관계 불일치 (항목 3, 해결 안 됨)**

> **정정하지 않음 — 재조사 결과가 외부 검토 주장과 여전히 불일치한다.** 외부 구현
> 검토 7차는 "최신 공식 문서 기준 동기 함수 제한은 60초이며 변경 불가", "10초는
> 오래된 커뮤니티 포럼 정보"라고 지적했다. 이 지적을 받고 Netlify 공식 문서를
> **다시** 조사했으나(WebFetch로 `docs.netlify.com/build/functions/lambda-compatibility/`,
> `.../usage-and-billing/` 등 직접 재확인 + 별도 검색 3회), 다음을 계속 확인했다:
>
> - "Netlify Functions compute costs 10 credits/GB-hour **with a 10-second
>   execution timeout on the free plan**"(신용카드 기반 요금제 관련 재검색 결과,
>   Credit-based 요금제 명시 문맥에서 확인 — 2025-09-04부터 신규 계정 전체가 이
>   요금제를 쓴다는 것도 같은 검색에서 확인)
>   ([관련 검색](https://answers.netlify.com/t/synchronous-function-timeout/168727)
>   등 다수)
> - Free/Personal 10초, Pro 26초라는 계층 구조도 여러 독립 검색에서 반복 확인됨
> - 스트리밍 함수의 60초·20MB 제한은 확인되나, 이것이 "동기 함수" 제한이라는
>   근거는 이번 재조사에서도 찾지 못했다
>
> **즉, 이번 재조사도 60초가 아니라 10초를 가리킨다.** 이것은 2회 연속
> 독립적으로 재현된 결과이므로, 외부 검토의 "10초는 낡은 정보" 주장을 근거
> 없이 그대로 받아들여 문서를 고쳐 쓰지 않는다 — 그렇게 하면 오히려 **검증되지
> 않은 반대 주장을 사실처럼 기록하는** 동일한 실수를 반복하게 된다. 아래 표는
> v1 그대로 유지하되, 이 불일치를 명시적으로 표시한다.

| 함수 종류 | 이 세션이 재확인한 값 | 비고 |
|---|---|---|
| **동기(synchronous) 함수** | **10초**(Free/Personal), Pro 26초 — 이 세션이 2개 라운드에 걸쳐 반복 재확인 | **외부 검토 7차는 "60초, 변경 불가"라고 주장 — 근거 문서·URL을 제시받지 못해 미해결** |
| 스트리밍(streaming) 함수 | 60초, 응답 20MB | 별도 함수 종류(코드 구조 변경 필요) — 외부 검토는 "20MB만 공식값이고 60초는 틀렸다"고 주장하나, 이 세션의 재조사에서는 60초 표기도 반복 확인됨 |
| Background Function | 최대 15분 | 즉시 `202` 응답 후 비동기 처리 |

**이 불일치는 사용자 확인 없이 해소할 수 없다.** 다음 중 하나가 필요하다: (a) 외부
검토가 인용한 정확한 문서 URL/캡처를 받아 대조, (b) 사용자가 Netlify 대시보드에
로그인해 실제 프로젝트에 적용되는 제한값을 직접 확인, (c) 실 배포 후 10초 근방에서
직접 타임아웃을 재현해 실측으로 확정. 이 리포트는 **어느 쪽 숫자도 확정 사실로
기록하지 않고, 불일치 상태 자체를 기록한다.**

## 4. 실측을 수행하지 않은 이유 + 참고 자료 (항목 4-5, 판정 UNVERIFIED로 정정)

10회 실제 Gemini 배포환경 호출은 이번에도 수행하지 않았다(사용자 재확인). 대신
이미 존재하는 참고 자료를 인용하되, **이번 배포의 적합성 검증으로 세지 않는다**:

> `.moai/reports/gemini-runtime-smoke-20260828.md` — `POST /api/cases` 요청 시작~응답
> 수신까지 **실측 30초**(curl 실측, CaseNormalizer→...→Verifier 전 단계 포함,
> Netlify가 아닌 다른 환경에서 측정됨). 단계별 타임스탬프: Researcher→Skeptic
> 12.227초 간격, Skeptic→Verifier 15.004초 간격 — 대부분 모델 처리 시간이 아니라
> `GEMINI_*_RPM_BUDGET=4`(최소 15초 간격) 페이싱 대기다.

**판정 재정정(외부 구현 검토 7차 반영)**: 이 30초 수치는 "60초 이내로 끝날 가능성을
보여주는 과거 참고 증거"로만 취급한다 — 실제 Netlify 함수 환경(콜드 스타트, 네트워크
경로가 다름)에서 재현된다는 보장이 없으므로, 이것을 근거로 "구조적으로 BLOCKED"라고
단정한 v1의 판정은 **과잉 단정이었다**. §3의 실제 제한값(10초 vs 60초)이 해소되지
않은 채로는, "실패할 것"이라고 확정할 수도 "통과할 것"이라고 확정할 수도 없다 —
정직한 상태는 **UNVERIFIED**다. 이번 라운드도 사용자 선택에 따라 실 배포와 Gemini
재호출을 수행하지 않았으므로, 이 상태는 다음 실 배포 라운드까지 유지된다.

## 5. 후속 SPEC 제안 — 조건부 대안으로 재조정 (항목 6 반영)

v1은 이 후속 SPEC을 사실상 "필수 선행 작업"처럼 서술했다 — 외부 구현 검토 7차가
정확히 지적한 과잉 단정이다. **정정: 이 후속 SPEC은 실제 배포 실측에서 §3의 진짜
상한(10초든 60초든, 확정되는 쪽 기준)을 초과하거나 안전 여유가 부족하다고
확인됐을 때만 착수하는 조건부 대안이다.** 실측 결과 여유가 충분하면 이 후속 SPEC은
필요 없을 수도 있다.

- **가칭 SPEC**: `SPEC-PILOT-ASYNC-SUBMIT-001` (조건부 — 아직 생성하지 않음)
- **설계 방향(조건 충족 시)**: `POST /api/cases`가 즉시 `202 Accepted` + `caseId`를
  반환하고, 실제 파이프라인 실행은 Netlify Background Function(최대 15분)으로
  옮긴다. 클라이언트는 `GET /api/cases/:id/status`(신규)를 폴링한다.
- **재설계가 필요한 실제 범위(v1의 과잉 단순화 정정)**: v1은 "리스(lease) 가드
  로직은 그대로 재사용 가능"이라고 썼으나, 이는 검증되지 않은 주장이었다. 실제로는
  다음을 **새로 설계**해야 한다 — (a) 작업(job) ID·상태 저장소(지금은 없음 — `202`
  응답 후 클라이언트가 무엇을 폴링할지 저장할 곳이 필요), (b) `caseId` 생성 시점
  변경(지금은 완료 트랜잭션 안에서 생성 — `202` 직후 즉시 생성해 클라이언트에
  돌려줘야 하는지, 완료 시점까지 미뤄야 하는지 재검토 필요), (c) 리스(lease) TTL과
  Background Function 실행 시간의 관계 — Background Function이 15분까지 걸릴 수
  있는데 지금 `LEASE_TTL_SECONDS=330`(약 5.5분)은 그 전제와 맞지 않을 수 있어
  TTL 연장 또는 재계산이 필요하다, (d) 리스 펜싱(fencing) 로직이 "동기 응답 반환
  시점"이 아니라 "상태 조회 응답 시점" 기준으로 다시 설계돼야 한다, (e) `202` 접수
  이후 실패·재시도 처리(지금의 동기 예외 전파 방식이 그대로 쓰이지 않는다 — 상태
  저장소에 실패 상태를 기록하고 클라이언트가 폴링으로 알게 되는 흐름을 새로
  설계해야 한다).
- **이 SPEC(SPEC-PILOT-READY-001)과의 관계**: M2(로깅)·M3(고지/연락채널)·M5(런북)·
  M6(테스트 중 리스 획득/펜싱 단위 테스트 다수)는 재사용 가능성이 높지만, M1의
  리스 로직은 위 (c)(d) 때문에 **무수정 재사용을 전제하지 않는다** — 실제 설계
  시점에 재평가한다.

## 6. Netlify 월 300크레딧 사용 예상치 — 갱신/한도 정정 (항목 7)

Netlify Free는 총 300크레딧이며, 크레딧 소비 기준은 다음과 같다(Netlify 공식
문서 확인):

| 항목 | 단가 |
|---|---|
| Production deploy | 1회당 15크레딧 |
| Compute(함수 실행) | GB-hour당 10크레딧(기본 메모리 1024MB=1GB 기준) |
| Bandwidth | GB당 20크레딧 |
| Web 요청 | 10,000건당 2크레딧 |

**정정(외부 구현 검토 7차 반영, 공식 문서로 확인 완료)**: v1이 "300크레딧이 매월
갱신되는지 불확실"이라 남겼던 부분을 확정한다 — **300크레딧은 매월(빌링 주기마다)
갱신된다**("Monthly plan credits are included with your plan each billing cycle.
The balance resets at the start of each cycle."). 한도에 도달하면 **다음 주기까지
프로젝트가 일시 중지**되며("all of your web projects... are paused"), Free
플랜은 **추가 크레딧 구매나 자동 추가결제(overage) 옵션 자체가 없는 hard limit**이다
— 예상치 못한 청구는 구조적으로 발생하지 않는다.

**약 10명 규모, 저빈도 파일럿 기준 대략적 추정 — 아래 가정에 기반한 추정치이며
실측이 아니다**:

- **가정 1**: Production deploy 약 5회(초기 설정+반복) → 약 75크레딧
- **가정 2**: 10명 × 평균 3건 제출 = 30건, 건당 최대 약 270초(0.075h) × 1GB(Background
  Function 컴퓨트, §5의 조건부 재설계가 적용된 경우를 가정) → 약 2.25 GB-hour →
  약 23크레딧
- **가정 3**: 로그인/세션/페이지 렌더 등 일반 SSR 함수 호출 — 요청 수 대비 미미
  (대략 1크레딧 내외)
- **가정 4**: Bandwidth 정적 자산 + API 응답 약 1-2GB → 약 20-40크레딧

**합계 대략 120-140크레딧, 300크레딧 한도의 절반 이하**로 예상된다 — 이 숫자는
위 4개 가정에 근거한 개략치이며, 실제 배포 빈도·트래픽·§3-5가 어떻게 해소되는지에
따라 달라진다. Production deploy 1회당 15크레딧이 가장 큰 단일 비용 요소이므로,
**production deploy는 필요한 경우에만 수행**하고(Netlify는 PR별 미리보기 배포를
별도로 제공하므로 반복 확인은 미리보기로 대체 가능), **자동 추가결제는 애초에
Free 플랜에 존재하지 않는다**(위 정정 참고).

## 7. 실행하지 않은 항목 (항목 8-9)

실제 비공개 배포를 하지 않았으므로 다음은 **이번 라운드에서도 검증되지
않았다**(§3의 불일치가 해소되고, §5의 조건부 재설계 여부가 정해진 뒤의 실 배포
라운드에서 검증 예정):

- Turso migration/seed 실행
- 실제 로그인·세션 수립
- 지원 링크(`mailto:zuge3927@naver.com`)가 실제 배포 환경에서도 정상 렌더링되는지
- Gemini 3단계 파이프라인의 배포환경 종단 실행
- `201`(또는 §5 조건부 재설계 시 `202`) 응답 및 DB 영속화·조회

## 8. 잔여 위험

- **§3의 10초 vs 60초 불일치가 미해결 최상위 위험이다.** 이 값이 해소되기 전까지는
  §4-6의 모든 후속 판단(UNVERIFIED 판정, 후속 SPEC 조건, 크레딧 추정)이 어느 쪽
  숫자든 뒤집힐 수 있는 잠정 상태다.
- **RPM 페이싱 가정의 재검증 필요**: §4의 "최소 27초" 관측은 현재
  `GEMINI_*_RPM_BUDGET=4` 설정 전제다. 향후 budget을 높이면 페이싱 대기는 줄지만,
  Researcher/Skeptic/Verifier 각 단계의 실제 모델 처리 시간(페이싱 대기에 가려져
  관측되지 않음)이 §3의 상한(10초든 60초든) 안에 들어오는지는 여전히 미확인이다.
- **Better Auth·Turso의 Netlify Function 콜드 스타트 영향**: 문서상 호환되지만,
  실제 콜드 스타트 지연은 실 배포 전까지 알 수 없다.

## 출처

- [Next.js on Netlify | Netlify Docs](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Netlify Joins OpenNext | Netlify Blog](https://www.netlify.com/blog/netlify-joins-opennext/)
- [Background Functions overview | Netlify Docs](https://docs.netlify.com/build/functions/background-functions/)
- [Netlify's New Background and Scheduled API Routes for Next.js](https://www.netlify.com/blog/new-background-scheduled-api-routes-nextjs/)
- [Netlify Functions Usage and Billing | Netlify Docs](https://docs.netlify.com/build/functions/usage-and-billing/)
- [Netlify Functions Lambda compatibility | Netlify Docs](https://docs.netlify.com/build/functions/lambda-compatibility/)
- [How credits work | Netlify Docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)
- [Netlify Pricing](https://www.netlify.com/pricing/)
- Netlify 커뮤니티 포럼(동기 함수 10초 제한 다수 확인 게시물, 2·3차 재조사에서도
  반복 확인) — https://answers.netlify.com/t/timeout-10-seconds/83146 ,
  https://answers.netlify.com/t/synchronous-function-timeout/168727 등
- `.moai/reports/gemini-runtime-smoke-20260828.md` (기존 참고 자료 — 이 배포의
  검증 근거로는 세지 않음, §4 참고)
