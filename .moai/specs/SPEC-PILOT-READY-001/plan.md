# SPEC-PILOT-READY-001 — Implementation Plan

## §A. Key Decisions (highest change-likelihood — read this first)

Per decision-reversibility ordering, these are the decisions most likely to need revision
during review or implementation. Everything else in this plan is a comparatively mechanical
consequence of these decisions.

1. **재제출 가드는 TTL 기반 리스(lease)로 확정됐다 — v0.3.0 개정으로 더 이상 옵션
   선택지가 아니다** (`lib/cases/create-case.ts`, `lib/db/schema.ts`, REQ-PILOT-READY-007).
   외부 리뷰에서 지적된 대로, SELECT-후-INSERT app 레벨 check-then-act 구조는 두
   요청이 거의 동시에 도착하면 경쟁 구간을 막지 못해 진정한 원자성을 제공하지 않으므로
   기각한다(§확정 설계 하단 "기각된 대안" 참고). 이 SPEC이 확정하는 유일한 구현 경로는
   다음과 같다.
   - **스키마**: `ownerUserId`(UNIQUE 키) + `leaseId`(획득마다 새로 생성되는 고유
     토큰 — UUID 또는 동등한 랜덤 값) + `expiresAt`(획득 시각 기준 "지금 + TTL"로
     설정되는 타임스탬프) 3개 컬럼을 가진 신규 `reservations` 테이블.
   - **TTL 값(v0.4.0 재확정)**: 기존 "TTL 60초 = 로컬 실측 30초의 2배"는 설계 결함이었다
     — 로컬 happy-path 실측(30초)만 반영했을 뿐, 실제 배포된 서버리스 함수가 겪을 수
     있는 worst-case(Gemini 429 재시도 백오프, 느린 응답, 네트워크 지연)를 반영하지
     못했다. 만약 정상적으로 아직 실행 중인 파이프라인의 실제 처리 시간이 TTL보다 길면,
     그 리스가 먼저 만료되어 두 번째 요청이 리스를 재획득하고 REQ-PILOT-READY-007이
     막으려던 바로 그 동시 이중 실행이 발생한다 — "30초 단일 로컬 실측과 429 재시도
     가능성만으로 60초가 충분하다"는 정당화는 이 worst-case를 검토하지 않은 과소평가였다.
     **재확정된 설계**: 배포 라우트는 `export const maxDuration = 300`(Next.js route
     segment config, 300초)을 명시적으로 설정한다. `LEASE_TTL_SECONDS`는 이
     `maxDuration`보다 충분히 길게 — **최소 330초**(약 30초 안전 여유) — 설정한다.
     정상 처리 중인 요청은 플랫폼이 함수를 강제 종료하기 전에는 이미 종료됐거나
     여전히 리스를 보유 중이어야 하므로, 리스가 그보다 먼저 만료될 수 없다는 것이
     이 설계의 의도다. **(v0.10.0 정정 — 호스팅이 Netlify Free로 변경됨에 따라)**
     `maxDuration = 300`과 `LEASE_TTL_SECONDS = 330`은 **이 프로젝트의 현행 구현값
     그대로 유지**한다 — 코드 변경은 이 문서 정정 라운드의 범위가 아니다. 다만 이
     값들은 원래 Vercel의 실행 시간 상한을 근거로 산정된 것이며, **Netlify 플랫폼이
     실제로 300초(또는 그 이상)를 보장한다는 근거로는 사용하지 않는다** — Netlify의
     실제 적용 상한은 여전히 UNVERIFIED다(§F 체크리스트, 스파이크 리포트 §3 참고).
     "TTL이 플랫폼의 강제 종료 시점보다 항상 길다"는 이 설계의 전제 자체가 Netlify
     기준으로는 아직 확인되지 않았다는 뜻이다 — 실 배포 전 재검증이 필요하다.
   - **정적 TTL vs. heartbeat 갱신 — 명시적 비교 및 채택 근거**: 두 대안을 검토했다.
     (A) **정적 TTL**(채택) — 획득 시점에 `expiresAt = now + LEASE_TTL_SECONDS`로
     고정하고 갱신하지 않는다. 구현이 단순(추가 주기적 쓰기 없음)하고, 이 SPEC이 이미
     요구하는 `maxDuration` 상한 설정과 자연스럽게 짝을 이룬다(리스 TTL이 플랫폼의
     강제 종료 시점보다 항상 길다는 것만 보장하면 충분). (B) **heartbeat 갱신** — 실행
     중인 파이프라인이 자신의 리스 `expiresAt`을 주기적으로(예: 10초마다) 연장한다.
     더 짧은 TTL로도 안전하게 크래시를 감지할 수 있다는 장점이 있으나, 추가 주기적
     DB 쓰기(파이프라인 단계마다 또는 타이머 기반)와 갱신 실패 처리 로직이 필요해
     구현 복잡도가 늘어난다. **채택 근거**: 이 파일럿은 약 10명 규모, 테스터당 이따금
     몇 건 정도의 저빈도 사용 패턴이다(PILOT-MINIMAL-DESIGN 관점) — heartbeat이
     해결하는 "더 짧은 회수 대기 시간"은 이 규모에서 체감 이점이 크지 않은 반면,
     구현·테스트해야 할 추가 실패 모드(갱신 타이밍 경쟁, 갱신 실패 시 처리)는 실질적
     비용이다. 정적 TTL(A)을 채택하고, `maxDuration` 상한과의 여유(330초 vs 300초)로
     정상 처리 중 오탐 만료를 방지한다 — 크래시 회수 대기 시간(최대 330초)이 heartbeat
     대비 길어지는 트레이드오프는 이 파일럿 규모에서 수용 가능하다고 판단한다.
   - **원자적 획득/재획득(신규 or 만료 시 재획득), 단일 연산**: 표준 SQLite/libSQL
     조건부 UPSERT 패턴 —
     `INSERT INTO reservations (owner_user_id, lease_id, expires_at) VALUES (?, ?, ?)
     ON CONFLICT (owner_user_id) DO UPDATE SET lease_id = excluded.lease_id,
     expires_at = excluded.expires_at WHERE reservations.expires_at < <now>`.
     이는 SQLite 3.35(2021)부터 표준 문법이며, libSQL은 SQLite와 SQL 문법 호환성을
     공식적으로 표방한다(v0.2.0에서 이미 이 호환성 근거로 단순 `ON CONFLICT DO
     NOTHING`을 확인한 바 있다). **정직한 한계**: 위 조건부 `DO UPDATE ... WHERE`
     형태는 이 SPEC 조사 범위에서 Turso 특정 문서 페이지로 별도 재확인되지 않았다 —
     "표준 SQLite/libSQL UPSERT 문법으로 알려진 것"이며, 이 특정 조건부 형태에 대한
     Turso 문서 검증은 완료된 상태가 아니라고 명시한다. 이 문장을 실행한 뒤, 호출자는
     그 쓰기가 실제로 일어났는지(자신의 새 `leaseId`가 후속 조회에 반영되는지, 또는
     드라이버가 지원하면 `RETURNING`을 사용하거나 영향받은 행 수/변경 카운트를
     비교) 확인해야 한다 — 이것이 "나는 지금 리스를 보유한다"와 "다른 누군가의
     만료 전 리스에 막혔다"를 구분하는 유일한 방법이다.
   - **해제(정상 완료 또는 실패 경로 모두) — 펜싱됨**: 리스 행의 삭제/해제는 호출자의
     `ownerUserId` AND `leaseId`가 현재 행과 모두 일치할 때만 수행한다(`DELETE FROM
     reservations WHERE owner_user_id = ? AND lease_id = ?`) — 절대 `ownerUserId`
     기준 무조건 삭제를 하지 않는다. 이것이 펜싱 메커니즘이다: 리스가 만료되어 새
     실행이 재획득했다면(새 `leaseId`), 옛 실행의 해제 시도는 0행에 매치되어 no-op
     이어야 하며, 오류로 어떤 것도 중단시키지 않고 새 리스를 실수로 삭제하지도 않는다.
   - **지연 도착 결과의 펜싱**: 리스가 만료된 뒤 재획득된 상태에서 옛(만료된) 실행이
     뒤늦게 완료되어도, (a) 그 옛 실행은 새 리스를 삭제/해제할 수 없고(위 해제 펜싱),
     (b) 그 옛 실행의 완료 결과를 `cases`/`reports`에 현재 진행 중인 것처럼 기록할 수도
     없다 — 완료 기록 단계(아래 §3)도 커밋 전에 `leaseId` 일치를 확인하므로, 지연/낡은
     쓰기는 그 두 번째 펜싱 게이트에서도 거부된다.
   - **매칭 키**: 클라이언트가 별도 dedup 키(nonce)를 보내지 않으므로, "동일 사용자
     (`ownerUserId`)당 동시에 최대 1개의 in-flight 상태"라는 단순한 스코프로 매칭한다
     — 이는 SPEC-PILOT-UX-001 iteration 3에서 기각된 `submissionNonce` + unique index
     방식(요청 페이로드 해시 기반 정밀 dedup)보다 훨씬 단순하며, 진정한 분산
     idempotency(REQ-PILOT-READY-015 참고)를 주장하지 않는다.
   - **기각된 대안 (검토했으나 채택하지 않음)**:
     - *컬럼 재사용(무마이그레이션, 원 설계)* — 기존 `cases.status` 컬럼만 재사용하는
       SELECT-후-INSERT 방식. 마이그레이션은 없으나 진정한 원자성을 제공하지 못해
       REQ-PILOT-READY-007의 "DB 엔진 수준 원자성" 요구를 충족하지 않으므로 기각한다
       — v0.2.0에서는 "파일럿 규모에서 좁아진 위험 수용"이라는 프레이밍으로 대안
       옵션이었으나, 외부 리뷰에서 이 프레이밍 자체가 REQ의 원자성 요구와 모순됨을
       지적받아 v0.3.0에서 완전히 기각했다.
     - *`submissionNonce` 컬럼 추가* — SPEC-PILOT-UX-001 iteration 3에서 이미
       "`createCase`의 실행 순서상 SELECT-후-unique-index 접근으로는 동시 요청 경합을
       막지 못한다"는 이유로 기각됐고 이 판단은 유효하다; 리스 방식도 nonce 매칭이
       아니라 "사용자당 동시 in-flight 파이프라인 최대 1개"라는 더 단순한 성질만
       보장한다(§Out of Scope 참고).
2. **재제출 가드는 동시성 제한(concurrency limit)만 보장하며, 제출 idempotency는
   보장하지 않는다 — 리스 재설계로 4개 실패 모드 중 3개가 해결되고 1개는 여전히
   의도적 gap이다** (REQ-PILOT-READY-015). (a) 크래시로 인한 고착 상태는 TTL 기반
   재획득으로 해결, (b) 완료+리포트 저장의 원자성은 동일 트랜잭션 하드 요구사항으로
   해결, (c) 응답 유실 후 재제출 시 동일 결과 재사용(진정한 요청 수준 idempotency)은
   여전히 "이 파일럿 규모에서 의도적으로 다루지 않는 gap", (d) 지연 도착 결과와
  재시도 결과의 충돌은 leaseId 펜싱으로 해결. 각각에 대해 "해결됨(구체적 메커니즘)"
   또는 "의도적으로 다루지 않는 gap"으로 명확히 기록해야 하며, 다루지 않는 gap을
   해결된 것처럼 진술해서는 안 된다. **"idempotency 가드"라는 부정확한 용어는 이
   SPEC 전체에서 "사용자별 동시 실행 가드"로 대체한다** — 이 가드가 제공하는 것은
   동시성 제한이지 idempotency가 아니기 때문이다.
3. **완료 기록(리스 소유권 재확인 + `cases` 상태 전이 + `reports` INSERT + 리스 해제)은
   단일 DB 트랜잭션으로 묶는 것이 폴백 없는 하드 요구사항이다** (REQ-PILOT-READY-007(3),
   v0.4.0 확정). `reports` INSERT가 실패하면 `cases`의 완료 상태 전이도 롤백되어야 하며,
   한쪽만 성공한 불일치 상태가 남아서는 안 된다. 리스의 `leaseId` 일치 여부는 같은
   트랜잭션 안에서 커밋 전에 재확인하는 두 번째 펜싱 게이트다. **v0.4.0에서 확인된
   근거(더 이상 미확인 한계가 아님)**: 이 프로젝트가 고정 사용하는
   `@libsql/client@0.17.4`(원격 `libsql://` 연결에 쓰이는 main 패키지 — 별도 제약이
   있는 `@libsql/client/web` 서브셋이 아님)의 `http.js` `transaction()` 구현과
   `drizzle-orm@0.45.2`의 `libsql/session.js` `LibSQLSession.transaction()` 구현을
   실제 소스 코드로 읽어 확인한 결과, 원격 HTTP 연결에 대해서도 실제 Hrana 프로토콜
   기반 스트림 트랜잭션을 열고, 콜백이 성공하면 `commit()`을, 예외가 발생하면
   `rollback()`을 호출한 뒤 예외를 다시 던지는(re-throw) 직접적·비-시뮬레이션 위임
   구조임이 확인됐다(출처: unpkg.com/@libsql/client@0.17.4/lib-esm/http.js,
   unpkg.com/drizzle-orm@0.45.2/libsql/session.js,
   github.com/tursodatabase/libsql-client-ts CHANGELOG.md — HTTP 인터랙티브 트랜잭션은
   v0.2.0부터 추가되어 v0.17.4 시점에는 안정화된 지 오래, tursodatabase.github.io/
   libsql-client-ts Client 인터페이스 문서). **운영 제약(반드시 인지할 것)**: libSQL은
   열려 있는 인터랙티브 트랜잭션에 **서버측 5초 잠금 타임아웃**을 둔다 — 이 트랜잭션은
   4개의 단순 쿼리(리스 소유권 확인, `cases` INSERT, `reports` INSERT, `reservations`
   DELETE)만 수행하므로 여유가 충분하지만, 트랜잭션 안에 느린 작업을 추가하지 않도록
   코드 주석으로 명시해야 한다. **주의(향후 오해 방지)**: 일부 AI 검색 요약 결과가
   "libSQL은 HTTP를 통한 인터랙티브 트랜잭션을 지원하지 않는다"고 잘못 주장하는 경우가
   있는데, 이는 별도 제약을 가진 `@libsql/client/web` 패키지에만 해당하는 사실이며 이
   프로젝트가 쓰는 main 패키지에는 해당하지 않는다 — 이 SPEC 또는 코드에 이 주의
   문구를 남겨, 향후 이 오해로 정상 동작하는 코드를 "고치려" 시도하는 것을 방지한다.
   **폴백 정책(hedge가 아니라 정책)**: run-phase 구현 중 이 확인된 동작과 실제로
   다른 드라이버 회귀가 발견되어 위 트랜잭션 요구사항이 실제로 충족되지 않음이
   확인되면, 그 사실 자체를 REQ-PILOT-READY-007의 **FAIL**로, 파일럿 준비 상태
   (REQ-PILOT-READY-016)를 **NO-GO**로 판정한다 — 목표를 임의로 완화해 조용히
   우회하는 것은 허용되지 않는다. "트랜잭션 밖에서 리스 소유권을 확인"하는 잔여
   폴백 경로는 이 설계에 존재하지 않는다 — 소유권 재확인은 반드시 쓰기 3단계와
   같은 트랜잭션 안에서 수행된다.
   - **(v0.5.0 정밀화) 트랜잭션 실패 시 리스의 후속 명시적 해제** — 위 4단계 트랜잭션이
     `reports` INSERT 실패 등으로 롤백되면, 그 롤백에는 트랜잭션에 포함됐던
     `reservations` DELETE도 함께 되돌려지므로 롤백 직후 시점에는 리스 행이 트랜잭션
     시도 이전과 동일하게 여전히 존재한다(트랜잭션 원자성이 의도대로 동작한 정상적인
     결과이며, 이 부분 자체는 결함이 아니다). 그러나 이를 그대로 두면 같은 사용자가
     TTL(최소 330초)이 지날 때까지 재제출할 수 없어 UX가 나빠진다. 이 결함을 막기
     위해, 이 트랜잭션의 실패를 처리하는 catch/에러 처리 경로 — 트랜잭션이 이미 실패해
     롤백된 *이후에* 실행되는, 그 트랜잭션과는 별개의 후속 단계 — 가 자신의
     `ownerUserId` AND `leaseId`가 모두 일치할 때만 수행하는 펜싱된 `DELETE`(기존
     "해제(펜싱됨, 실패/예외 경로 전용)" 절차와 동일한 패턴)로 리스를 명시적으로
     해제해야 한다. 이 해제가 성공하면 같은 사용자는 인위적인 추가 대기 없이 즉시 새
     리스를 재획득할 수 있어야 한다. 이 후속 해제 자체도 실패하는 드문 이중 실패
     상황이면 그 오류를 로그로 남기고 최종 회복은 기존 TTL 만료 메커니즘에 맡긴다 —
     이 경우에만 즉시 재제출이 차단되며, TTL로 상한이 있어 영구히 막히지는 않는다.
     **이 후속 해제는 4단계 단일 트랜잭션 요구사항(폴백 없음)을 완화·대체하지
     않는다** — 성공 경로의 원자성 요구사항은 그대로 유지되며, 이 후속 해제는 그
     트랜잭션이 이미 실패해 롤백된 이후에만 실행되는 별개의 실패 복구 행동이다.
4. **(v0.10.0 — Netlify로 대체) 호스팅은 Netlify Free로 확정됐다. 실행 시간
   적합성은 "결정"이 아니라 "실측 판정" 문제다** (REQ-PILOT-READY-001/002). 이전
   버전(v0.9.0 이전)은 이 자리에 Vercel Hobby/Pro tier의 Fair Use Guidelines
   상용 사용 정의 준수 여부를 기록했다 — Netlify Free는 그와 동일한 "제작 관여자의
   금전적 이익"식 상용 사용 정의를 갖지 않으므로 이 리스크 자체가 더 이상 적용되지
   않는다(HISTORICAL, v0.8.0/v0.9.0 HISTORY 참고). 대신 Netlify Free의 실제 리스크는
   **동기 함수 실행 시간 상한**이다: (a) 공식 게시 값 60초(변경 불가,
   `docs.netlify.com/build/functions/configuration/#default-values`, 2026-07-06
   갱신), (b) 이와 상충하는 커뮤니티 관측(~10초, Netlify 직원의 공식 확인 없음), (c) 이
   프로젝트 계정에 실제로 적용되는 상한은 실 배포 전까지 **UNVERIFIED**. 이 세 층위를
   구분해 기록하는 것이 REQ-PILOT-READY-002의 책임이다 — 특정 숫자를 미리 확정해
   READY 여부를 판단하지 않는다(REQ-PILOT-READY-016 항목(1) 참고).
5. **동시성 REQ(REQ-PILOT-READY-006)는 서로 다른 사용자의 일반 동시 부하만 측정하고
   어떤 동시성 인프라도 도입하지 않는다** — REQ-PILOT-READY-007(동일 사용자 가드)과는
   측정 대상이 다르다는 점을 명확히 구분한다. 큐/Redis/락 서비스 도입 여부는 이 SPEC이
   내리는 결정이 아니라, 이 SPEC이 남기는 측정 결과를 근거로 한 **후속 SPEC의 판단
   대상**이다. run-phase 실행자는 이 경계를 넘지 않는다(§D Risk 1 참고).
6. **파일럿 최종 착수 여부는 이 SPEC의 구현 완료와 별개의 판정 문서(readiness-decision
   리포트)로 내린다** (REQ-PILOT-READY-016, v0.4.0에서 6개→**7개 항목**으로 정밀화 —
   Gemini 쿼터를 호스팅과 별개의 독립 항목으로 승격). 원격 검증 또는 실측이 필요한
   항목 중 하나라도 BLOCKED/UNVERIFIED면 전체 NO-GO — 부분 통과라는 절충 상태는 없다.
   **run-phase 완료 조건**: 이 문서는 run-phase 마지막 마일스톤에서 7개 항목 전부에
   실제 판정값 + 전체 GO/NO-GO가 채워져야 한다 — 템플릿 상태로 남겨두는 것은 run-phase
   완료로 인정되지 않는다(단, 채워 넣은 판정이 NO-GO인 것 자체는 정상적으로 허용되는
   완료 상태다).

나머지(로깅 추가, 런북 작성, 데이터 고지 문구 개선, 운영 체크리스트 문서화)는 위
결정들의 비교적 기계적인 결과이며 독립적인 재검토 없이도 진행 가능하다.

## §B. Milestones

### M1 — 최소 서버측 재제출 가드 (코드 변경, §A 결정 1 — 리스(lease) 단독 구현, 옵션 선택 없음)

v0.3.0부터 M1은 옵션 분기가 없는 단일 구현이다. Implementation Kickoff Approval
단계에서 재확인이 필요한 것은 "옵션 A인가 B인가"가 아니라 §F 체크리스트의 나머지
운영 결정(호스팅 실 배포 검증 등)뿐이다.

**스키마**:
- `lib/db/schema.ts`에 신규 `reservations` 테이블 추가: `ownerUserId`(UNIQUE 제약) +
  `leaseId`(text, 획득마다 새로 생성 — `crypto.randomUUID()` 등) + `expiresAt`
  (timestamp). Drizzle Kit으로 마이그레이션 파일을 생성한다(`pnpm db:generate`).
- (v0.4.0 추가) `app/api/cases/route.ts`(또는 해당 라우트 파일)에 `export const
  maxDuration = 300;`(Next.js route segment config)을 명시적으로 설정한다.
  `LEASE_TTL_SECONDS`는 환경변수 또는 상수로 **최소 330**(초)으로 설정한다 —
  `maxDuration`(300초)보다 충분히 길게, 안전 여유 약 30초를 두어 정상 처리 중인
  요청의 리스가 플랫폼 강제 종료보다 먼저 만료되는 일이 없도록 한다.

**획득(원자적, TTL 만료 시 재획득 포함)**:
- Edit `lib/cases/create-case.ts`: `runPipeline` 호출 **이전**에 조건부 UPSERT를
  실행한다 — `INSERT INTO reservations (owner_user_id, lease_id, expires_at)
  VALUES (?, ?, ?) ON CONFLICT (owner_user_id) DO UPDATE SET lease_id =
  excluded.lease_id, expires_at = excluded.expires_at WHERE
  reservations.expires_at < <now>`(`<now>`는 요청 처리 시각을 서버에서 계산해
  바인딩하거나 DB의 `CURRENT_TIMESTAMP`를 사용 — 어느 쪽이든 구현 시점에 일관되게
  선택). Drizzle이 이 조건부 UPSERT 구문을 직접 표현하지 못하면 raw SQL(`db.run(sql\`...\`)`)
  로 폴백한다.
- 이 쓰기 직후, 자신의 `leaseId`가 실제로 반영됐는지 확인한다(영향받은 행 수가
  드라이버에서 노출되면 그것을 사용하고, 노출되지 않으면 즉시 재조회로 `leaseId`
  일치를 확인). 자신의 `leaseId`가 아니면(=다른 요청의 만료 전 리스에 막힘) 새
  파이프라인을 실행하지 않고 "이미 처리 중" 응답을 즉시 반환한다. 자신의 `leaseId`
  이면 리스를 보유한 것이므로 `runPipeline`을 호출한다.

**해제(펜싱됨, 실패/예외 경로 전용)**:
- 파이프라인이 **실패하거나 예외를 던진 경우**, `DELETE FROM reservations WHERE
  owner_user_id = ? AND lease_id = ?`(자신의 `leaseId` 포함)로 리스만 해제하고
  `cases`/`reports`에는 아무것도 기록하지 않는다(재시도가 차단되지 않게 한다) —
  `ownerUserId`만으로 무조건 삭제하지 않는다. 0행 매치(이미 만료→재획득된 경우)는
  오류 없이 조용히 무시한다. **성공 경로의 리스 해제는 아래 완료 기록 트랜잭션 안에서
  수행되며, 이 별도 해제 절차를 거치지 않는다** — 두 경로가 겹치지 않도록 한다.

**완료 기록(단일 트랜잭션, 폴백 없는 하드 요구사항 — REQ-PILOT-READY-007(3), v0.4.0
확정)**:
- 파이프라인 성공 시, 다음 4단계 전부를 **단일 DB 트랜잭션**(`db.transaction(async
  (tx) => {...})`)으로 순서대로 묶어 실행한다 — 이는 "가능하면"이 아니라 예외 없는
  요구사항이다: (1) 자신의 `leaseId`가 여전히 현재 리스 행과 일치하는지 재확인
  (펜싱 게이트 — 불일치면 커밋하지 않고 자신의 결과를 버린다), (2) `cases` 행을
  `status: "completed"`로 INSERT, (3) `reports` 행 INSERT, (4) `DELETE FROM
  reservations WHERE owner_user_id = ? AND lease_id = ?`로 자신의 리스를 해제한다.
  `@libsql/client@0.17.4`(main 패키지) + `drizzle-orm@0.45.2`가 원격 `libsql://`
  HTTP 연결에서도 실제 인터랙티브 트랜잭션(실패 시 자동 rollback)을 지원함이 소스
  코드 확인으로 검증됐으므로(§A 결정 3 참고), 이 4단계는 반드시 하나의 트랜잭션
  안에서 수행되어야 한다. libSQL의 서버측 5초 잠금 타임아웃을 넘지 않도록, 이
  트랜잭션 안에는 이 4개의 단순 쿼리 외에 어떤 느린 작업도 추가하지 않는다.
  **폴백 정책**: run-phase 구현 중 이 동작이 실제로 지원되지 않는 드라이버 회귀가
  발견되면(발견되지 않는 한 시도하지 않고 미리 완화하지 않는다), 그 사실을 코드
  주석과 M4 리포트에 정직하게 기록하고 REQ-PILOT-READY-007을 FAIL, 파일럿 준비
  상태(REQ-PILOT-READY-016)를 NO-GO로 판정한다 — (2)/(3)만 트랜잭션으로 묶고
  (1)/(4)를 트랜잭션 밖으로 빼는 완화된 대안은 이 설계에 존재하지 않는다.
- 파이프라인이 예외를 던지면 위 "해제(펜싱됨, 실패/예외 경로 전용)" 절차로 리스만
  정리하고, `cases`/`reports`에는 아무것도 기록하지 않는다.
- (v0.5.0 신규) **완료 기록 트랜잭션 자체가 실패한 경우(예: `reports` INSERT 실패로
  트랜잭션이 롤백된 경우)의 후속 리스 해제**: 그 트랜잭션 실패를 처리하는 catch 블록
  에서 — 트랜잭션이 이미 롤백된 *이후에* 실행되는 별개의 후속 단계로서 — 위와 동일한
  펜싱 조건(`ownerUserId` AND `leaseId` 일치)으로 `DELETE FROM reservations WHERE
  owner_user_id = ? AND lease_id = ?`를 실행해 리스를 명시적으로 해제한다. 이 해제는
  4단계 단일 트랜잭션 자체의 일부가 아니며(트랜잭션이 이미 실패한 뒤에만 실행), 4단계
  트랜잭션 요구사항을 대체하지 않는다. 이 해제가 성공하면 같은 사용자는 인위적인 추가
  대기 없이 즉시 새 요청으로 새 리스를 재획득할 수 있어야 한다(§A 결정 3 참고). 이
  해제 자체도 실패하는 드문 이중 실패면 오류를 로그로 남기고 기존 TTL 만료 메커니즘에
  회복을 맡긴다.

**공통**:
- Edit `app/api/cases/route.ts`: "이미 처리 중" 응답을 `409 Conflict`와 함께 클라이언트에
  전달한다. 기존 `201`/`400`/`401` 응답 계약은 변경하지 않는다.
  `app/cases/new/case-input-form.tsx`의 기존 제네릭 에러 처리(`response.status !== 201`
  이면 `data.error`를 표시)가 그대로 이 응답을 처리하므로, 클라이언트 코드 변경은
  필요 없다 — `data.error`에 "이미 처리 중입니다" 같은 사용자 친화적 메시지를 담는
  것으로 충분하다.
- 신규 응답 타입(`CreateCaseResult` 유니온에 "already processing" 케이스 추가)의 정확한
  판별자(discriminant) 이름은 구현 시점에 기존 `success: false`/`fieldErrors` 패턴과
  충돌하지 않는 새 필드로 결정한다(예: `{ success: false, alreadyProcessing: true }`).
- REQ-PILOT-READY-015(a)~(d)의 4개 실패 모드 각각에 대해, 실제 구현에서 해결됐는지
  여부를 M4의 신규 리포트(아래)에 명시적으로 기록한다 — (a)/(b)/(d)는 리스 설계상
  해결이 기대되지만 실제 코드로 검증된 결과만 "해결됨"으로 기록하고, (c)는
  "의도적으로 다루지 않는 gap"으로 정직하게 남긴다.

### M2 — 최소 구조적 로깅 (코드 변경)

- Edit `app/api/cases/route.ts`: 요청 시작 시점에 최소 1줄 구조적 로그(요청 ID 또는
  타임스탬프 + `ownerUserId` 존재 여부만, PII 없음)를 출력한다.
- Edit `lib/cases/create-case.ts` / `lib/pipeline/index.ts`: 파이프라인 각 단계
  (CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier) 실패 시
  단계 이름과 오류 요약을 로그로 남긴다 — 사건 입력 원문(자유 텍스트 3개 필드)은
  로그에 절대 포함하지 않는다(PII 최소화 원칙 유지).
- Edit `lib/cases/create-case.ts`: `cases`/`reports` 테이블 INSERT/UPDATE 실패 시 오류를
  로그로 남긴다.
- 새 의존성 추가 없음 — `console.error`/`console.warn`/`console.info` 기반의 최소
  구조(예: `{ event, caseId?, stage?, error? }` 형태의 JSON 문자열)로 충분하다
  (REQ-PILOT-READY-008).

### M3 — 데이터 취급 고지 정직성 개선 (코드+문서 변경)

- Edit `app/cases/new/page.tsx` (또는 `case-input-form.tsx`의 안내 영역): 기존
  "개인정보 비식별 안내" Notice(`page.tsx:55-56`)를 확장해, (i) 주민등록번호·
  휴대전화번호 형식 검사 및 주소·의료기록 원본 필드가 애초에 없다는 **구조적 사실**과,
  (ii) 그럼에도 3개 자유 텍스트 필드에 실명·주소·상세 정황 등을 타이핑해 넣는 것은
  탐지·차단되지 않는다는 **잔여 위험**을 서로 구분해 명시하고, "합성이거나 이미
  비식별화된 사례만 입력하라"는 테스터 책임 문장을 추가한다(REQ-PILOT-READY-011/012).
  "보장"·"확실히 차단"과 같은 과대 주장 표현은 사용하지 않는다.
- Edit `app/cases/new/page.tsx` (또는 안내 영역): 올바르게 비식별화된 synthetic 사건
  입력 예시 1건을 추가한다(REQ-PILOT-READY-014) — `.moai/reports/gemini-runtime-smoke-20260828.md`
  §"사용한 synthetic 사건 입력"에 이미 검증된 예시(`incidentDescription`/
  `diagnosisName`/`disabilityBodyPart`/`incidentDate` 4필드, 완전 synthetic)를 재사용해도
  된다.
- Edit `app/login/login-form.tsx`: `FOOTER_LINKS`의 "고객지원" 항목(`:14,127-135`)을
  실제 연락 채널(예: `mailto:` 링크)로 교체하거나, 그 옆에 실제 채널을 별도로
  추가한다(REQ-PILOT-READY-013) — 기존 `aria-disabled` 처리된 다른 2개 링크(이용약관/
  개인정보처리방침)는 이 SPEC의 범위 밖이므로 그대로 둔다.

### M4 — 운영 측정·검증 절차 실행 및 문서화 (측정형 REQ)

이 마일스톤의 각 불릿은 코드 변경이 아니라 **실제 배포 환경(또는 가장 근접한 가용
환경)에서 명령을 실행하고 그 결과를 리포트로 남기는 작업**이다. run-phase 실행자는
실제 배포 대상에 접근할 수 없다면 그 사실 자체를 구조화된 blocker 보고로 남기고,
"가장 근접한 가용 환경"(예: production 빌드 로컬 실행)에서의 근사 측정으로 대체
가능함을 문서에 명시해야 한다 — 근사 측정으로 대체한 경우 그 사실과 한계를 리포트에
반드시 기록한다.

- `.moai/reports/pilot-ready-deployment-tier-decision-<date>.md`(v0.10.0 — Netlify로
  대체): Netlify Free 호스팅은 이미 확정됐으므로(운영 결정, §F 체크리스트), 이
  리포트는 tier 선택 대신 **동기 함수 실행 시간 상한의 3층위 증거**를 기록한다 —
  (a) 공식 게시 값(60초, 변경 불가,
  `docs.netlify.com/build/functions/configuration/#default-values`), (b) 상충하는
  커뮤니티 관측(~10초, Netlify 직원의 공식 확인 없음), (c) 이 프로젝트 계정에 실제
  적용되는 상한(실 배포 전까지 UNVERIFIED). 세 층위를 뒤섞지 않고 구분해 기록한다
  (REQ-PILOT-READY-001).
- `.moai/reports/pilot-ready-timeout-measurement-<date>.md`(신규): `POST /api/cases`
  실제 처리 시간을 **최소 3회 이상**(v0.5.0 정밀화)의 개별 실행으로 실측하고, 각
  실행의 처리 시간(초 단위)을 개별 기록하며, 위 (c)에서 실제로 관측된 상한과 비교한
  결과를 기록한다(REQ-PILOT-READY-002) — 정합성 확인(sanity check)이며, 상한 초과
  시 대응책은 이 리포트에서 결정하지 않는다. REQ-PILOT-READY-016 항목(1)의 호스팅
  적합성 READY 판정은 이 리포트가 실제 배포 도메인 기준이고, **확인된 실제 상한과
  안전 여유를 기준으로 판정**할 것을 요구한다(v0.10.0 — 특정 초 값을 미리 가정하지
  않음. 구체적 기준은 REQ-PILOT-READY-016 참고).
- `.moai/reports/pilot-ready-quota-checklist-<date>.md`(신규, 또는 런북에 통합,
  v0.5.0 격상): run-phase 실행자가 실제로 AI Studio 쿼터 대시보드를 확인하고,
  확인 날짜·확인한 사람·관측된 실제 쿼터/레이트리밋 한도·그 근거로 실제 선택한
  `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET` 두 값을 이 리포트에 실제로
  기록한다(REQ-PILOT-READY-003) — 더 이상 "파일럿 런칭 담당자가 나중에 확인할 절차를
  문서화"하는 것만으로 충족되지 않으며, 이 SPEC의 run-phase 안에서 실제로 수행되는
  측정형 액션이다. 이 확인이 수행되지 않으면 이 REQ와 AC-PILOT-READY-016b 항목(2)는
  UNVERIFIED로 남아 전체 NO-GO에 기여한다. **RPM 값이 확인 후에도 4로 유지되는 것
  자체는 문제가 아니다** — 4가 실제 관측 한도의 약 70~80%에 해당한다는 근거가
  함께 기록되어 있으면 정상적으로 허용된 결과다. Gemini 쿼터 점검 담당자(구체적
  실명 또는 역할명)는 §F 체크리스트에서 여전히 별도의 미확정 운영 결정으로 남지만,
  "언제" 수행되어야 하는지는 이제 명확하다 — 이 SPEC의 run-phase 안, readiness-decision
  리포트(REQ-PILOT-READY-016)가 채워지기 전이다.
- `.moai/reports/pilot-ready-remote-db-verification-<date>.md`(신규): 원격 Turso
  인스턴스에 대한 `pnpm db:migrate`/`pnpm db:seed`/`pnpm tester:add` 실행 결과를
  기록한다(REQ-PILOT-READY-004) — M1의 신규 `reservations`(리스) 테이블 마이그레이션은
  이제 항상 존재하므로 이 원격 실행 검증 대상에 반드시 포함한다. 로컬 대체는 이
  REQ에서 허용되지 않는다(정의상 원격 인스턴스가 필요).
- `.moai/reports/pilot-ready-auth-domain-verification-<date>.md`(신규): 실제 배포
  도메인으로 설정한 `BETTER_AUTH_URL`에 대해 (a) 로그인 요청 성공, (b) 세션 수립
  확인, (c) 그 세션으로 보호된 페이지(`/cases/new`) 접근 가능 여부, 3가지를 각각
  구분해 기록한다(REQ-PILOT-READY-005). 로컬 대체는 이 REQ에서 허용되지 않는다.
- `.moai/reports/pilot-ready-concurrency-measurement-<date>.md`(신규): 서로 다른
  사용자 계정으로 발생시킨 3~5개 동시 `POST /api/cases` 요청의 관측된 거동
  (성공/실패/지연/경쟁 증상)을 기록한다 — 어떤 결론(큐 필요 여부 등)도 이 리포트
  안에서 내리지 않고, 관측 사실만 기록한다(REQ-PILOT-READY-006). 이 리포트는
  REQ-PILOT-READY-007(동일 사용자 가드)을 검증하지 않는다 — 그 검증은 M6의 유닛
  테스트와 AC-PILOT-READY-015가 별도로 담당한다.
- `.moai/reports/pilot-ready-idempotency-scope-<date>.md`(신규): REQ-PILOT-READY-007의
  리스(lease) 구현을 명시하고, REQ-PILOT-READY-015(a)~(d) 4개 실패 모드 각각에
  대해 "해결됨(메커니즘 설명 — (a)는 TTL 재획득, (b)는 동일 트랜잭션, (d)는 leaseId
  펜싱)" 또는 "이 파일럿 규모에서 의도적으로 다루지 않는 gap((c)는 반드시 이 상태)"
  중 하나로 정직하게 기록한다(REQ-PILOT-READY-015) — 어떤 항목도 실제로 검증하지
  않은 채 "해결됨"으로 표시해서는 안 된다. "idempotency 가드"가 아니라 "사용자별
  동시 실행 가드"로 일관되게 명명한다.
- `.moai/reports/pilot-ready-readiness-decision-<date>.md`(신규, REQ-PILOT-READY-016,
  v0.4.0 — 6개→**7개 항목**): (1) 호스팅 적합성(v0.10.0 재작성 — Netlify Free 확정 +
  3층위 실행 시간 상한 증거 + 실제 **배포 도메인** 기준 최소 3회 이상 측정한 처리
  시간 중 **최댓값이, 그 시점에 확인된 실제 상한에서 안전 여유를 뺀 값 이하**임을
  보여주는 실측 증거 둘 다 필요 — 특정 초 값을 미리 확정하지 않음), (2)
  Gemini 쿼터(호스팅과 별개의 독립 항목 — 실제 AI Studio 대시보드 확인 기록 + 실제
  선택한 RPM budget 값 필요; 값이 4로 유지돼도 4가 관측 한도의 약 70~80%라는 근거가
  있으면 READY, v0.5.0 정정), (3)
  원격 DB, (4) 실 도메인 인증, (5) 실 Gemini 스모크(반드시 배포 도메인 기준), (6)
  서로 다른 사용자 동시 부하(모든 요청 성공적 최종 상태 + DB 영속화·조회 가능 + 처리
  안 된 429/5xx/타임아웃 없음), (7) 저장소·복구 검증(반드시 실제 원격 Turso 대상
  기준 — 로컬/in-memory SQLite만으로는 불가) 각각을 READY/BLOCKED/UNVERIFIED로
  판정하는 표와, (1)의 tier/ToS "결정" 자체를 제외한 원격 검증·실측 필수 항목((1)의
  타임아웃 실측 포함, 2~7) 중 하나라도 BLOCKED/UNVERIFIED면 전체 NO-GO라는 게이트
  규칙을 담은 템플릿을 작성한다. 이 SPEC의 run-phase **착수 시점**에는 이 문서를
  **템플릿으로만** 작성한다 — 실제 판정 값 채우기는 이 SPEC의 나머지 리포트가 모두
  존재한 뒤 수행하되, **run-phase의 마지막 마일스톤 안에서 7개 항목 전부에 실제
  판정값과 전체 GO/NO-GO를 반드시 채워 넣어야 한다**(§C 참고) — 템플릿 상태로 비워둔
  채 run-phase를 종료하는 것은 허용되지 않으며, 채워 넣은 결과가 NO-GO인 것 자체는
  정상적으로 허용되는 완료 상태다.
- `.moai/reports/gemini-runtime-smoke-<date>.md`(신규, `gemini-runtime-smoke-20260828.md`와
  동일 방법론): main HEAD(run-phase 시점 기준) 대비 실 Gemini 스모크를 재실행하고,
  Researcher/Skeptic/Verifier 3단계 각각의 성공 여부·`201` 응답·DB 영속화·재조회
  일치·실제 호출 횟수 일치 5가지를 개별 확인해 새 날짜의 리포트로 남긴다
  (REQ-PILOT-READY-010) — 기존 2026-08-27/2026-08-28 리포트를 덮어쓰지 않는다.

### M5 — 최소 장애 대응 런북 (문서)

- Create `.moai/docs/pilot-incident-runbook.md`(신규, `.moai/docs/runtime-runbook.md`와는
  별개 — 후자는 로컬 개발 환경 절차이고 전자는 파일럿 운영 중 장애 대응 절차):
  (a) M2에서 추가한 로그를 어디서/어떻게 확인하는지, (b) 테스터에게 안전하게 재시도를
  안내하는 방법 — REQ-PILOT-READY-007의 "이미 처리 중" 응답 덕분에 **같은 사용자가
  하나의 요청이 아직 처리 중인 동안 다시 제출해도 두 번째 파이프라인이 추가로
  시작되지는 않는다**는 점은 안내하되, "재시도는 무제한으로 해도 항상 안전하다"는
  과잉 보장은 하지 않는다 — REQ-PILOT-READY-015에서 문서화한 대로 크래시 복구·응답
  유실 후 재제출 등 이 가드가 다루지 않는 실패 모드가 남아 있으므로, 재시도 안내에는
  "짧은 시간 내 반복 재시도보다는 안내된 대기 후 재시도"를 권장하는 수준으로 그친다.
  (c) 이슈의 최종 triage 담당자를 문서화한다(REQ-PILOT-READY-009).

### M6 — 테스트 (M1-M3 코드 변경만 대상)

측정형 REQ(M4)는 리포트 자체가 증거이므로 별도 유닛 테스트 대상이 아니다.

- `lib/cases/create-case.test.ts`(신규 또는 기존 확장 — 구현 전 `Glob`으로 기존 테스트
  파일 존재 여부 확인): 동일 `ownerUserId`로 두 번째 요청이 첫 번째가 아직 리스를
  보유 중인 동안 도착하면 `runPipeline`이 두 번째로 호출되지 않고 구분된 응답이
  반환됨을 검증한다(REQ-PILOT-READY-007 — mock `runPipeline`을 즉시 resolve하지 않는
  pending Promise로 설정해 in-flight 상태를 시뮬레이션). 파이프라인 실패 후 재시도 시
  `runPipeline`이 다시 호출됨(가드가 실패 시 해제됨)도 함께 검증한다.
  **추가로(AC-PILOT-READY-007 완료 기록 트랜잭션 원자성)**: `reports` INSERT가 mock을
  통해 실패하도록 설정한 상태에서 파이프라인이 성공적으로 완료되면, `cases` 행의
  상태가 `"completed"`로 커밋되지 않음(롤백됨)을 DB 직접 조회로 검증한다.
  **추가로(AC-PILOT-READY-007 트랜잭션 실패 후 리스의 후속 명시적 해제 — v0.5.0
  신규)**: 위와 동일한 `reports` INSERT 실패 시나리오에 이어서, 그 실패를 처리하는
  catch 경로가 실행된 뒤 `reservations` 리스 행이 실제로 삭제됐는지, 그리고 동일한
  `ownerUserId`로 즉시 새 `createCase` 요청을 보내면 새 `leaseId`로 리스를 성공적으로
  재획득하고 `runPipeline`이 정상 호출되는지(인위적인 추가 대기 없이)를 검증한다.
  **추가로(AC-PILOT-READY-007 현실적 worst-case 지속 시간 동안의 가드 유지 — v0.5.0
  신규)**: `runPipeline`이 즉시 resolve하지 않고 새 TTL(최소 330초) 여유 안의 현실적
  worst-case 지속 시간(예: 200초 이상) 동안 계속 pending 상태로 남도록 mock한 상태에서,
  그 지속 시간 내내 동일 `ownerUserId`로 반복 호출해도 `runPipeline`이 여전히 1회만
  호출됨을 검증한다. **테스트 방법론(명시)**: 이 테스트는 실제로 200초 이상 대기하지
  않는다 — 리스 만료 판정 로직이 읽는 시스템 시각을 fake timer/mock clock(테스트
  프레임워크의 시간 조작 유틸리티, 또는 만료 판정이 읽는 "현재 시각" 값을 mock)으로
  조작해 "200초 이상 경과했지만 TTL(330초)은 아직 지나지 않았다"는 상태를 시뮬레이션
  하고, `runPipeline`은 단지 즉시 resolve하지 않는 pending Promise로만 유지한다 —
  실제 테스트 실행 시간은 정상적인 유닛 테스트 수준(수 밀리초~수 초)에 머물러야
  하며, run-phase 구현자는 문자 그대로 200초 이상 sleep하는 테스트를 작성해서는
  안 된다.
  **추가로(AC-PILOT-READY-007 크래시 후 TTL 재획득)**: 첫 번째 호출이 리스를 획득한
  뒤 해제하지 않고 멈춘 상태에서, `expiresAt`을 지난 시각(mock 시계 또는 과거 값
  직접 주입)에 동일 `ownerUserId`로 새 요청을 보내면 새 `leaseId`로 재획득에
  성공하고 `runPipeline`이 호출됨을 검증하며, TTL 경과 전에는 동일 요청이 거부됨을
  대조 검증한다.
  **추가로(AC-PILOT-READY-007 지연 도착 결과 펜싱)**: 위 재획득 시나리오에서 원래
  (만료된) 첫 번째 호출이 뒤늦게 자신의 낡은 `leaseId`로 해제/완료 기록을 시도하면
  0행 매치로 no-op이 되고 현재(두 번째) 리스 행이 변경되지 않음을 검증한다.
  **추가로(AC-PILOT-READY-015)**: "첫 번째 호출이 아직 진행 중인 동안 두 번째 호출"이
  아니라, **두 호출을 첫 번째 읽기/확인 시점부터 가능한 한 동시에** 발생시키는 테스트를
  별도로 작성한다(예: 두 `createCase` 호출을 `Promise.all`로 동시에 시작). 이는 "두
  번째 호출이 첫 번째 호출 완료를 기다린 뒤 도착"하는 더 약한 시나리오와 구분되는,
  진성 경쟁 조건(genuine race condition) 테스트다. 이 테스트는 실제 DB(또는
  in-memory SQLite 등 `UNIQUE` 제약을 실제로 강제하는 대상)에 대해 두 조건부 UPSERT를
  동시에 실행해 정확히 1개만 리스를 획득하는지 확인해야 한다 — mock만으로는 DB
  엔진 수준의 원자성 자체를 검증할 수 없다. PASS 기준은 예외 없이 단일하다(두 번째
  실행이 일시적으로라도 시작되면 FAIL — spec.md AC-PILOT-READY-015 참고).
- 로깅(M2)은 콘솔 출력 스파이(`vi.spyOn(console, ...)`)로 최소 1개 이상의 호출이
  발생하는지만 확인하는 가벼운 테스트로 충분하다 — 로그 포맷의 정확한 문자열까지
  단정하는 과도하게 구체적인 테스트는 작성하지 않는다.
- 데이터 고지 문구(M3)는 렌더 테스트로 "합성/비식별화된 사례만" 문구와 예시 텍스트가
  DOM에 존재하는지만 확인한다(REQ-PILOT-READY-012/014).

## §C. Technical Approach Summary

- **재제출 가드의 데이터 계층 변경 범위는 확정됐다**: 신규 `reservations`(리스) 테이블
  1개 + Drizzle Kit 마이그레이션 1건은 v0.3.0부터 이 SPEC의 확정된 범위다(옵션 분기
  없음). DB 제약 + 조건부 UPSERT 기반 원자성, TTL 재획득, leaseId 펜싱, 완료 기록의
  동일 트랜잭션 요구사항을 코드 주석과 리포트에 정직하게 기록한다 — 구현 중 실제로
  발견된 드라이버 제약(예: 완전한 단일 트랜잭션 미지원)이 있다면 그 사실과 근거도
  함께 정직하게 기록한다(임의 완화 금지).
- **측정 우선, 인프라 도입은 후속 SPEC 판단**: REQ-PILOT-READY-002/006은 관측 결과를
  리포트로 남기는 것이 완료 조건이며, 그 결과를 근거로 인프라를 새로 도입할지는 이
  SPEC의 결정 범위 밖이다. 이는 "측정 결과를 보고 파일럿 진행 여부를 판단하는 것"과는
  다른 별개의 스코프 제약이다(spec.md § 측정 완료 vs. 파일럿 진행 여부 판단 구분 참고).
- **동시성 제한과 제출 idempotency는 서로 다른 보장이며 혼동하지 않는다**: 재제출
  가드("사용자별 동시 실행 가드" — "idempotency 가드"라는 명칭은 사용하지 않는다)가
  보장하는 것은 "동일 사용자당 동시 in-flight 1개"뿐이다. 리스 재설계로 크래시 복구·
  완료+리포트 저장 원자성·지연 도착 결과 충돌 3가지는 해결되며, 응답 유실 후 재제출
  1가지만 REQ-PILOT-READY-015에 따라 "이 파일럿 규모에서 의도적으로 다루지 않는 gap"
  으로 정직하게 문서화한다(다루지 않는 gap을 해결된 것처럼 진술하는 것은 금지).
- **로깅은 최소 구조, 새 의존성 없음**: `console.*` 기반의 구조화된 JSON 한 줄 로그로
  충분하며, PII(자유 텍스트 입력 원문)는 절대 로그에 포함하지 않는다.
- **데이터 고지는 "과대 주장 금지"가 최우선 제약**: REQ-PILOT-READY-011(Unwanted)은
  다른 모든 REQ보다 우선하는 제약으로, M3의 모든 문구 변경에 적용된다. "3개 자유
  텍스트 필드는 스캔되지 않는다"는 식으로 뭉뚱그리지 않고, 항상 "주소·의료기록 원본
  필드가 없다는 구조적 사실"과 "자유 텍스트 필드에 타이핑해 넣을 수 있다는 잔여 위험"을
  구분해서 진술한다.
- **"이 SPEC의 구현 완료"와 "파일럿 외부 착수 가능 여부"는 서로 다른 판단이다**:
  REQ-PILOT-READY-016의 readiness-decision 리포트가 후자를 판정하며, 전자(M1-M6 완료)는
  후자의 전제조건일 뿐 대체하지 않는다.

## §D. Risks

1. **동시성 REQ의 범위 이탈(scope creep) 위험** — REQ-PILOT-READY-006은 명시적으로
   "측정만, 인프라 도입 없음"이다. run-phase 실행자가 관측 결과를 보고 "그럼 바로
   Redis 락을 추가하자"는 식으로 범위를 넘어서는 것은 이 SPEC의 승인 범위를 벗어난다.
   완화책: M4 해당 불릿에 "어떤 결론도 이 리포트 안에서 내리지 않는다"는 제약을 명시.
2. **배포 대상 접근 불가 위험** — run-phase 실행자가 실제 Netlify 배포 환경(또는 원격
   Turso 인스턴스)에 접근할 수 없을 수 있다(v0.10.0 — Vercel에서 Netlify로 대상 갱신). 완화책: M4 서문에 "가장 근접한 가용
   환경으로 대체 가능, 단 그 사실과 한계를 리포트에 명시"라는 대체 경로를 이미
   포함하되, REQ-PILOT-READY-004/005(원격 DB/실 배포 도메인 인증)는 정의상 로컬 대체가
   불가능함을 유의한다. 접근이 전혀 불가능하면 구조화된 blocker 보고로 오케스트레이터에
   에스컬레이션한다.
3. **재제출 가드의 매칭 스코프가 파일럿 규모를 넘어서는 사용에는 부적합** — "사용자당
   동시 1개"라는 스코프는 10명 파일럿에는 충분하지만, 한 사용자가 의도적으로 여러
   사건을 동시에 제출하려는 정당한 사용 사례가 있다면 이 가드가 그것도 차단한다.
   완화책: §A 결정 1/2에서 이 트레이드오프를 명시적으로 진술했고, plan-auditor 검토
   시점에 이 스코프가 파일럿 사용 패턴과 실제로 맞는지 재확인이 필요하다.
4. **리스 TTL 오설정 위험(v0.4.0 재평가)** — TTL이 실제 파이프라인 처리 시간보다 너무
   짧으면 정상 처리 중인 요청의 리스가 조기 만료되어 두 번째 요청이 재획득에 성공하고
   두 파이프라인이 동시에 실행되는(REQ-PILOT-READY-007이 막으려던 바로 그 상황) 위험이
   있다 — 기존 "TTL 60초 = 로컬 실측 30초의 2배" 산정이 바로 이 위험을 과소평가한
   설계 결함이었다(로컬 happy-path 실측만 반영, worst-case 미반영). 너무 길면 크래시
   복구가 그만큼 느려진다. **v0.4.0 완화책**: TTL을 실측 처리 시간이 아니라 배포
   라우트의 `maxDuration`(300초, §A 결정 1)에 안전 여유(약 30초)를 더한 최소 330초로
   고정한다 — 플랫폼이 함수를 강제 종료하기 전에 정상 처리 중인 요청의 리스가 먼저
   만료될 수 없다는 것이 이 산정의 안전성 근거이며, 로컬 실측치의 변동(예: 15초
   초과)에 따라 TTL을 재조정해야 하는 절차는 더 이상 필요하지 않다(재조정 필요 여부는
   `maxDuration` 자체가 바뀌는 경우에만 재검토한다). 잔여 트레이드오프: 크래시 회수
   대기 시간이 최대 330초로 늘어나지만, 이 파일럿 규모(약 10명, 저빈도 사용)에서는
   수용 가능하다고 판단한다(§A 결정 1의 정적 TTL vs. heartbeat 비교 참고).
5. **(v0.10.0 — Netlify로 대체) 실행 시간 상한이 UNVERIFIED인 상태로 run-phase에
   진입할 위험** — 호스팅(Netlify Free)은 확정됐지만, 동기 함수 실행 시간의 실제
   적용 상한(공식 게시값 60초 vs 상충하는 커뮤니티 관측 ~10초, §A 결정 4 참고)이
   미해결이다. 완화책: M4의 타임아웃 측정 리포트가 실 배포 환경에서 확인된 실제
   상한과 안전 여유를 근거로 REQ-PILOT-READY-016 항목(1)의 READY/BLOCKED/UNVERIFIED를
   판정한다 — 특정 초 값을 미리 가정하지 않는다.
6. **(v0.4.0: 더 이상 유효하지 않음 — 기각된 옛 설계에서만 있었던 위험) "최근
   리서치" 패널의 processing/failed 상태 라벨 미표시** — 이 위험은 REQ-PILOT-READY-007의
   옛 설계(파이프라인 실행 이전에 `processing` 상태를 먼저 기록하는 컬럼 재사용 방식 —
   v0.3.0에서 이미 기각)에서만 성립했다. v0.3.0/v0.4.0의 리스(lease) 설계에서는 `cases`
   행이 파이프라인 **성공** 시 완료 기록 트랜잭션 안에서만 생성되므로,
   `processing`/`failed` 상태의 `cases` 행은 이 설계에서 애초에 생성되지 않는다 —
   `recent-research-panel.tsx`의 `STATUS_LABELS` 미매핑은 실제 배포 리스크가 아니다
   (spec.md Out of Scope 참고, 동일하게 재분류됨). 코드 변경도 후속 판단도 필요하지 않다.
7. **(v0.4.0: 확인 완료, 잔여 위험으로 재평가) 완료 기록의 단일 트랜잭션이 실제
   런타임에서 드라이버 회귀로 실패할 위험** — v0.4.0에서
   `@libsql/client@0.17.4`(main 패키지)와 `drizzle-orm@0.45.2`의 실제 소스 코드
   확인을 통해, 원격 `libsql://` HTTP 연결에서도 "리스 확인 + `cases` 상태 전이 +
   `reports` INSERT + 리스 해제" 4단계를 하나의 인터랙티브 트랜잭션으로 묶는 것이
   지원됨이 이 SPEC 조사 범위에서 확인됐다(§A 결정 3 참고) — 더 이상 "확인되지
   않은 부분"이 아니다. 잔여 위험은 오직 하나다: run-phase 실제 구현 중, 조사에서
   확인된 이 라이브러리 버전의 동작과 실제로 다른 드라이버 회귀(예: 프로젝트가 실제로
   사용하는 정확한 버전이 다르거나, 패치로 동작이 바뀌는 경우)가 발견될 가능성.
   완화책: 목표 설계(4단계 전부 단일 트랜잭션, 폴백 없음)를 그대로 구현하고, 실제로
   이 확인된 동작과 다른 회귀가 발견되면 그 사실을 코드 주석과 M4 리포트에 정직하게
   기록하되, **그 경우 완화된 대안으로 조용히 우회하지 않고 REQ-PILOT-READY-007을
   FAIL, 파일럿 준비 상태(REQ-PILOT-READY-016)를 NO-GO로 판정한다** — 이것이 §A
   결정 3의 폴백 정책이다.

## §E. PRESERVE List (files this SPEC MUST NOT modify beyond the stated edit)

- `lib/pipeline/**`(단계 알고리즘 자체), `lib/ai/**`(모델 선택·RateScheduler 페이싱
  로직) — REQ-PILOT-READY-008의 로그 추가 지점(`lib/pipeline/index.ts`,
  `lib/ai/providers/gemini.ts`)을 제외하고는 알고리즘·타입 계약 미변경
- `lib/db/schema.ts` — 신규 `reservations`(리스) 테이블 추가(`ownerUserId`/`leaseId`/
  `expiresAt` 3개 컬럼)만 허용되며, 기존 테이블(`cases`/`evidence`/`reports`/
  `feedback`/`allowed_testers`)의 컬럼·제약은 변경하지 않는다
- `lib/validation/case-input.ts` — 기존 PII 차단 검증(`piiFreeText` 등) 미변경, 미약화
- `lib/feedback/**` — 완전히 범위 밖(이 SPEC은 사건 생성 경로만 다룸)
- `lib/auth/**`(설정값 제외) — 인증 로직 자체는 미변경, `BETTER_AUTH_URL` 등 배포
  환경변수 값만 REQ-PILOT-READY-005의 검증 대상
- `app/cases/[caseId]/**`(리포트 표시·피드백 화면) — 완전히 범위 밖
- `app/cases/new/recent-research-panel.tsx`(`STATUS_LABELS` 포함) — spec.md Out of
  Scope에서 명시적으로 미룬 UI 라벨 매핑 갭이며, 이 SPEC은 문서화만 하고 수정하지
  않는다
- `ResearchReport`/`VerifiedClaim`/`EvidenceCandidate` 타입 계약(`lib/pipeline/types.ts`) — 미변경

## §F. Implementation Kickoff Decision Checklist

Implementation Kickoff Approval 단계에서 사용자가 확인해야 하는 운영 결정 항목이다.
v0.3.0부터 §A 결정 1(재제출 가드 구현 방식)은 확정됐으므로 이 체크리스트에서
제외됐다 — 남은 항목은 이 SPEC이 스스로 결정할 수 없는 운영/조직 결정뿐이다. 이
체크리스트는 무엇이 결정되어야 하는지를 문서화할 뿐이며, 여기 나열된 어떤 항목도
사용자 승인 전에 결제·플랜 업그레이드·배포 행위를 수행하는 것을 허가하지 않는다.

| 항목 | 상태 | 비고 |
|------|------|------|
| 호스팅/프로젝트/도메인 (v0.10.0 — Vercel→**Netlify Free로 변경 확정**) | **확정: Netlify Free, 무료 `*.netlify.app` 도메인** / **UNVERIFIED(v0.10.0 정정)** | 사용자가 Vercel 검토를 대체해 Netlify Free를 확정했다. 어댑터는 zero-config(`@netlify/plugin-nextjs`)라 별도 구조 변경은 불필요하다. **동기 함수 실행 시간 제한은 3층위로 기록한다**(v0.10.0 — 외부 구현 검토 8차가 제시한 공식 출처 `docs.netlify.com/build/functions/configuration/#default-values`를 이 세션이 직접 재확인함): (a) 공식 게시 값 **60초, 변경 불가**(2026-07-06 갱신 문서 확인), (b) 상충하는 커뮤니티 관측 **~10초**(Netlify 직원의 공식 확인 없음, 지원 티켓만 생성됨), (c) 이 프로젝트 계정에 실제 적용되는 상한은 실 배포 전까지 **UNVERIFIED**. 실 배포를 하지 않았으므로 현재 상태는 READY도 BLOCKED도 아닌 **UNVERIFIED**다. 비동기(POST 202 + 상태 조회) 재설계는 **조건부 대안**으로 남긴다 — 실 배포 실측에서 확인된 실제 상한 초과 또는 안전 여유 부족이 확인될 때만 착수한다(스파이크 리포트 §5, 필수 선행 작업 아님) |
| 원격 Turso 대상(어느 인스턴스/DB) | **프로바이더 확정: Turso Free / 구체적 인스턴스: 아직 미생성** | 사용자가 Turso Free를 확정했으나, 실제 인스턴스는 운영자가 직접 `turso db create`로 생성 예정(계정 로그인이 필요해 이 세션에서 대행 불가) — 생성 후 `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`을 `.env.local` 및 Netlify 환경변수에 등록해야 REQ-PILOT-READY-004/007이 실행 가능하다 |
| 지원 연락처 이메일 주소 | **확정: `zuge3927@naver.com`** (`.env.local`의 `SUPPORT_CONTACT_EMAIL`에 반영됨) | REQ-PILOT-READY-013의 `mailto:` 링크 주소가 결정됐다 — 단, 실 배포 환경(Netlify)에도 동일 환경변수를 등록하고 그 환경에서 렌더링을 검증해야 "set+verified"까지 완료된다(로컬 `.env.local` 반영만으로는 배포 환경 검증까지 끝난 것은 아니다) |
| 장애 대응 triage 담당자(누가 파일럿 중 장애를 통보받는가) | **확정: 이경환(파일럿 운영 책임자), 장애 접수 목표 1영업일 이내 1차 확인** | REQ-PILOT-READY-009의 triage 담당자 항목이 결정됐다 — `.moai/docs/pilot-incident-runbook.md` §3을 이 값으로 갱신 필요(다음 run-phase 작업) |
| Gemini 쿼터 점검 담당자 + 점검 시점 | **unconfirmed** | REQ-PILOT-READY-003(운영 체크리스트)의 절차를 "언제, 누가" 수행할지 확정되지 않았다 — 권고 시점: 파일럿 런칭 T-1일 |
| 동시성 측정용 테스터 계정 3-5개 준비 방법 | **unconfirmed** | REQ-PILOT-READY-006(서로 다른 사용자 동시 부하 측정)을 실행하려면 실제로 로그인 가능한 테스터 계정 3-5개가 사전에 `pnpm tester:add`로 프로비저닝되어 있어야 한다 — 기존 테스터 계정을 재사용할지 별도 측정 전용 계정을 만들지 결정 필요 |

**게이트(v0.10.0 갱신)**: 6개 항목 중 지원 이메일·triage 담당자 2개는 확정됐다.
**호스팅 항목은 v0.8.0에서 "구조적 required-blocker"(HISTORICAL, 폐기된 판정)로
과잉 단정됐던 것을 v0.9.0에서 UNVERIFIED로 정정했다** — 값 자체는 정해졌지만
(Netlify Free), 이 프로젝트 계정에 실제 적용되는 동기 함수 실행 상한은 실 배포
전까지 READY도 BLOCKED도 확정할 수 없다(공식 게시 값 60초 vs 상충하는 커뮤니티
관측 ~10초 — 3층위 증거는 위 표 참고). 비동기 재설계는 실측 결과에 따른 조건부
대안일 뿐, 선행 필수 조건이 아니다. Turso는 프로바이더만 확정, 인스턴스 생성은 운영자 행동 대기
중이다. 나머지(Gemini 쿼터 담당자, 테스터 계정)는 그대로 미확정이다. 사용자 승인 전
결제·플랜 업그레이드·실제 배포 행위는 이 체크리스트의 어떤 항목도 허가하지 않는다는
원칙은 변경되지 않는다 — 이번 라운드도 실제 배포를 수행하지 않았다.
