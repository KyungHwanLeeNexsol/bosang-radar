---
id: SPEC-PILOT-READY-001
title: "파일럿 배포 준비 — 운영 검증, 사용자별 동시 실행 가드, 데이터 취급 고지"
version: "0.9.0"
status: in-progress
created: 2026-09-10
updated: 2026-09-11
author: Nexsol
priority: P1
phase: "v1.0.0 target"
module: "app/api/cases/, lib/cases/, lib/db/, lib/pipeline/, app/cases/new/, app/login/, .moai/docs/"
lifecycle: spec-anchored
tags: "pilot, deployment-readiness, concurrency-guard, lease, logging, data-handling, observability"
tier: M
depends_on: [SPEC-RUNTIME-001, SPEC-GEMINI-RUNTIME-001, SPEC-PILOT-UX-001]
---

## HISTORY

- 2026-09-11 (v0.9.0): 외부 구현 검토(run-phase, 7차) 반영 — v0.8.0의 판정 언어와
  일부 사실 주장을 정정했다. **(a) BLOCKED→UNVERIFIED**: 실 배포를 하지 않은
  상태에서 "구조적으로 BLOCKED"라고 단정한 것은 acceptance.md
  AC-PILOT-READY-016b가 정의한 READY/BLOCKED/UNVERIFIED 3분류를 잘못 적용한
  과잉 주장이었다 — "아직 측정하지 않았다"는 UNVERIFIED가 맞는 표현이다.
  **(b) 비동기 재설계를 조건부 대안으로 재조정**: "필수 선행 작업"처럼 서술했던
  것을 "실측에서 상한 초과가 확인될 때만 착수"로 바꾸고, "기존 리스 로직 무수정
  재사용 가능" 주장을 제거 — 실제로는 작업 ID/상태 저장, `caseId` 생성 시점,
  리스 TTL과 Background Function 실행 시간의 관계, 펜싱 로직, 실패/재시도를 모두
  재설계해야 함을 명시했다. **(c) 크레딧 설명 정정**: 300크레딧이 매월 갱신되고,
  한도 도달 시 다음 주기까지 프로젝트가 중지되며, Free 플랜에는 초과 청구 자체가
  없다는 사실을 공식 문서로 재확인해 반영했다. 120-140크레딧 추정치는 4가지 가정
  (배포 5회/30건×최대270초/SSR 미미/대역폭 1-2GB) 기반임을 명시했다.
  **(d) 동기 함수 실행 제한(10초 vs 60초)은 미해결로 남긴다** — 7차 검토는
  "공식 문서 기준 60초, 10초는 낡은 커뮤니티 정보"라고 주장했으나, 이 세션이
  독립적으로 2회 재조사한 결과도 반복해서 10초(Free/Personal), 26초(Pro)를
  가리켰다. 근거 문서를 제시받지 못한 채 이 세션의 반복 재현 결과를 뒤집어
  "60초가 맞다"고 고쳐 쓰는 것은 검증되지 않은 주장을 사실처럼 기록하는 동일한
  실수이므로, 어느 쪽도 확정하지 않고 불일치 상태 자체를 기록했다(스파이크
  리포트 §3) — 사용자의 추가 확인 또는 실 배포 실측이 필요하다. 코드·배포·API
  재실행·테스터 초대·PR·병합은 이번에도 수행하지 않았다.
- 2026-09-11 (v0.8.0): **호스팅 후보를 Vercel에서 Netlify Free로 변경 확정**(운영
  결정) — DB는 Turso Free, AI는 Gemini API Free 유지. 지원 연락처
  이메일(`zuge3927@naver.com`)과 장애 대응 triage 담당자(이경환, 1영업일 이내 1차
  확인)를 확정하고 `.env.local`/`.moai/docs/pilot-incident-runbook.md`에 반영했다.
  Netlify 적합성 스파이크를 수행해(`.moai/reports/pilot-ready-netlify-suitability-spike-20260911.md`)
  사용자가 제시한 "동기 함수 60초 제한"이 **실제로는 10초**임을 공식 문서로 확인·정정했다
  — 기존 실측(`gemini-runtime-smoke-20260828.md`, 30초 종단 처리 시간)만으로도 이
  제한을 구조적으로 초과하므로, 별도의 실 배포·Gemini 10회 재호출 없이 **BLOCKED**로
  판정했다(쿼터 낭비 방지, 사용자 확인). 비동기(POST 202 + 상태 조회) 재설계를 별도
  후속 SPEC(가칭 SPEC-PILOT-ASYNC-SUBMIT-001)으로 제안했다 — 이번 라운드에서 그
  SPEC을 실제로 생성하지는 않았다. 실 배포·테스터 초대·PR 생성·main 병합은 수행하지
  않았다. plan.md §F 체크리스트를 이 결정들로 갱신했다.
- 2026-09-11 (v0.7.0, 소급 기록): 외부 구현 검토(run-phase, 6차) 반영 —
  `lib/logging/safe-error.ts`의 errorName/errorCode를 실제 고정 화이트리스트로
  강화(이전 버전은 화이트리스트라 주장했으나 실제로는 검증 없이 통과시켰다는 지적을
  반영), `.message`뿐 아니라 `.name`/`.code`에 대한 적대적 테스트 3종 추가.
  progress.md의 AC-PILOT-READY-009/013을 PASS에서 BLOCKED로 정정(구현은 검증됐지만
  실제 지원 채널/triage 담당자가 당시 미확정이었으므로 SPEC 레벨 요구사항은
  미충족). `run_complete_at`(모순되는 완료 시점 문구)를 범위를 명시한
  `implementation_subset_complete_at`으로 교체하고 "M1-M6 완료" 표현을 모두
  정정했다. 이 라운드는 코드/progress.md만 수정했고 spec.md 버전은 당시 갱신되지
  않았다 — 이번(v0.8.0) 편집에서 소급 기록한다.
- 2026-09-11 (v0.6.0): 외부 구현 검토(run-phase, 5차) 반영 — run_status를 `complete`에서
  `partial`/`blocked`로 정정(M4 readiness는 여전히 NO-GO)하고, `pilot-ready-idempotency-scope`
  리포트를 작성했다(외부 접근 불필요, M1 구현 완료로 차단 해제됨). PII 비노출 로깅을
  `error: String(error)` 대신 화이트리스트 메타데이터(errorName/errorCode/stage)로
  강화하고, `incidentDescription`/`diagnosisName`/`disabilityBodyPart` 원문 주입 적대적
  테스트를 추가했다. 파이프라인 실패 경로(`pipeline_failed`)에서도 완료 트랜잭션 실패
  경로와 동일하게 `releaseLeaseFenced` 자체 실패를 흡수·기록하고 원래 오류를 보존하도록
  대칭화했다. **AC-PILOT-READY-013을 정정**: 기존 문구("`aria-disabled`가 아닌 실제
  클릭 가능한 링크가 항상 존재해야 한다")는 `SUPPORT_CONTACT_EMAIL`이 아직 미확정인
  기본 상태에서도 RFC 2606 예약 도메인(example.com)을 실제 채널인 것처럼 클릭 가능하게
  노출시키는 부작용을 낳았다 — 외부 검토가 이를 정확히 지적했다. 정정된 AC-013은
  "실제 주소가 설정되면 그 주소로 활성 mailto 링크, 미설정이면 정직한 비활성 표시"로
  나뉜다. 사용자가 두 대안(정직한 비활성 표시 유지 vs 기존 항상-활성 문구 유지) 중
  전자를 명시적으로 선택했다(AskUserQuestion). 진성 경쟁 테스트를 pending 파이프라인
  상태에서 승자의 리스가 유지됨을 검증하도록 강화하고, 트랜잭션 실패 시 cases/reports/
  reservations 3개 테이블 모두를 확인하며 사후 펜싱 해제와 즉시 재획득을 구분된
  단계로 검증하도록 보강했다.
- 2026-09-10: 최초 작성 (Nexsol) — 10명의 외부 전문가(보험설계사/손해사정사) 파일럿 착수 전,
  이미 완성된 사건 입력→Gemini 6단계 리서치 파이프라인→리포트→구조화 피드백 흐름을
  실제 배포 환경에서 안전하게 가동하기 위한 최소 범위의 배포 준비 SPEC. 신규 비즈니스
  기능은 도입하지 않으며, ①측정·검증형 운영 전제조건(호스팅 타임아웃, DB 마이그레이션,
  인증 설정, 동시성 측정, 스모크 재검증), ②Gemini 쿼터 사전 점검이라는 운영 체크리스트
  항목, ③파일럿 규모(10명)에 맞춘 최소 서버측 idempotency 가드, ④최소 구조적 로깅,
  ⑤최소 장애 대응 런북, ⑥데이터 취급 고지 정직성 개선(비식별 보장 범위 명확화 + 연락
  채널 + 예시)으로 범위를 고정한다. 모든 항목은 오케스트레이터 세션에서 4개 병렬
  조사 에이전트(git/PR 상태, 로드맵 3단계 분류, 배포 준비 갭, 데이터 계약 연결)가
  실제 코드베이스를 read-only로 조사해 확인한 구체적 결함·갭만을 근거로 삼는다.
- 2026-09-10 (v0.2.0): 외부 리뷰 6개 항목 반영 개정 — plan/SPEC-PILOT-READY-001 브랜치에서
  수행 (baseline: main@7ebb3b7). ①REQ-PILOT-READY-007의 재제출 가드가 SELECT-후-INSERT
  구조라 진정한 원자성을 제공하지 못함을 명시하고, Turso Cloud 표준(비-MVCC) 아키텍처의
  단일 writer 트랜잭션 모델을 근거로 한 예약 테이블(UNIQUE + `ON CONFLICT DO NOTHING`)
  방식과 "무마이그레이션" 방식 두 대안을 병기 — 실제 채택 여부는 run-phase 착수 전
  사용자 확인이 필요한 미확정 결정으로 명시(REQ-PILOT-READY-007). ②동시성 제한과 제출
  idempotency를 별개 개념으로 분리하고, 크래시 복구·완료+리포트 원자성·응답 유실 후
  재제출·지연 도착 결과 충돌 4개 실패 모드를 명시적으로 문서화하는 신규
  REQ-PILOT-READY-015 추가 — "재시도는 무제한으로 해도 중복 실행을 막는다"는 과잉 보장
  문구를 plan.md에서 제거. 최근 리서치 패널(`recent-research-panel.tsx`)의
  `STATUS_LABELS`가 `pending`/`completed`만 정의하고 있어 신규 `processing`/`failed`
  상태 행이 영문 원문으로 노출되는 UI 갭을 조사로 확인해 Out of Scope 항목으로 기록
  (문서화만, UI 코드 변경 없음). ③REQ-PILOT-READY-005(인증)를 로그인 성공·세션 수립·보호된
  페이지 접근 3단계로, REQ-PILOT-READY-010(Gemini 스모크)을 3단계 파이프라인 완료·201
  응답·DB 영속화·재조회·호출 횟수 일치로 세분화하고, REQ-PILOT-READY-008(로깅)의 DB
  쓰기 실패 로그와 PII 비노출을 검증하는 AC를 보강. AC-PILOT-READY-006을 "서로 다른
  사용자" 동시 부하 측정으로 명확히 하고, 동일 사용자 진성 경쟁 조건을 검증하는 신규
  AC-PILOT-READY-015를 REQ-PILOT-READY-007에 추가 — 두 AC가 서로 다른 것을 검증함을
  분리. 로컬 대체 실행이 "원격/실배포 검증"을 요구하는 AC의 PASS 조건을 대신할 수
  없음을 명시하고, "측정 완료"와 "파일럿 진행 여부 판단"을 분리하는 신규 하위 절을
  추가 — 측정 결과로부터 사람이 go/no-go 판단을 내리는 것 자체를 막는 문구는 없었는지
  재확인해 과잉 교정 문구를 찾지 못함(원래 문구는 "이 리포트 안에 결론성 판단 문장이
  없다"는 REQ-PILOT-READY-006 한정 제약이며, 이는 인프라 도입 여부라는 별개 후속
  SPEC 결정에 대한 것이지 파일럿 go/no-go 판단을 막는 것이 아니었음을 확인). ④Vercel
  Hobby tier의 실제 제약이 실행 시간 상한이 아니라 Fair Use Guidelines의 상용 사용
  정의(제작에 관여한 유급 인력이 있는 배포)에 있음을 Vercel 공식 문서 근거로 정정하고,
  REQ-PILOT-READY-001/002를 재작성 — Hobby(무료, ToS 준수 여부 미확인)/Pro($20/좌석/월
  + 사용량, 상용 사용 명시적 허용) 두 후보를 문서화하고 실제 선택은 비용 결정 권한자의
  미확정 결정으로 명시. ⑤`lib/validation/case-input.ts`가 "전혀 스캔하지 않는다"는
  과장 표현이 실제로는 이미 존재하지 않음을 코드 재확인으로 검증(주민등록번호·전화번호
  패턴은 이미 정확히 스캔 대상으로 기술되어 있었음) — 정밀도 개선 차원의 경미한 표현
  정리만 수행. ⑥README.md/product.md 로드맵을 구현 완료/배포 검증 필요/후속 개발
  3단계로 갱신.
- 2026-09-10 (v0.3.0): 외부 리뷰 2차 개정 — v0.2.0에서 미확정으로 남겨둔 결정 중 재제출 가드
  구현 방식을 **옵션 A(예약 테이블) 단독 확정**으로 종결하고, 나머지 요구사항을 더 엄격하게
  재설계. ①REQ-PILOT-READY-007을 옵션 A(예약 테이블) 단독 요구사항으로 재작성하고, 옵션
  B(컬럼 재사용, SELECT-후-INSERT)는 "고려했으나 진정한 원자성을 제공하지 못해 기각된
  대안"으로만 plan.md에 기록 — spec.md 요구사항 텍스트와 acceptance.md의 PASS 조건 어디에도
  옵션 B를 유효한 구현 경로로 남기지 않는다. AC-PILOT-READY-015의 "옵션 B의 경쟁 테스트 FAIL도
  허용된 결과"라는 모순 문구를 제거하고, 두 요청이 동시에 경쟁할 때 정확히 1개의 예약+1개의
  파이프라인 실행만 허용되고 두 번째 실행이 일시적으로라도 시작되면 FAIL이라는 단일 기준으로
  재작성. ②재제출 가드를 단순 예약(reservation)에서 **복구 가능한 리스(lease)**로 재설계 —
  `ownerUserId` + 신규 `leaseId`(획득마다 새로 생성) + `expiresAt`(TTL 60초 = 실측 파이프라인
  처리 시간 30초의 2배 여유, Gemini 429 재시도 백오프와 네트워크 지연을 흡수하기 위함) 3개
  컬럼. 원자적 획득/재획득은 표준 SQLite/libSQL 조건부 UPSERT(`INSERT ... ON CONFLICT
  (owner_user_id) DO UPDATE ... WHERE expires_at < now`)로 수행하며, 이 구체적 조건부 UPSERT
  구문 형태는 이 SPEC 조사 범위에서 Turso 공식 문서로 별도 재검증되지 않은 "표준 SQLite/libSQL
  문법으로 알려진 것"이라는 한계를 정직하게 명시한다(v0.2.0에서 이미 확인한 단순 `ON CONFLICT
  DO NOTHING`과는 다른, 조건부 `DO UPDATE ... WHERE` 형태이므로 이 구분을 유지한다). 해제
  (release)는 `ownerUserId` AND `leaseId`가 모두 일치할 때만 수행하는 펜싱(fencing) 삭제로
  재정의하여, 만료 후 재획득된 새 리스를 옛 실행이 실수로 해제하거나 덮어쓰지 못하도록 한다.
  ③완료 시점의 `cases` 상태 전이 + `reports` INSERT를 **동일 DB 트랜잭션**으로 묶는 것을
  REQ-PILOT-READY-007의 하드 요구사항으로 격상하고(문서화 대상이던 REQ-PILOT-READY-015(b)를
  "해결됨"으로 전환), 완료 기록 트랜잭션도 리스의 `leaseId` 일치를 커밋 전에 확인하는 두 번째
  펜싱 게이트로 지정 — 만료 후 재획득이 일어난 뒤 뒤늦게 도착한 옛 실행의 결과가 새 실행의
  상태를 덮어쓰지 못하게 한다. ④REQ-PILOT-READY-015의 4개 실패 모드 재판정: (a) 크래시 복구는
  TTL 기반 재획득으로 해결됨, (b) 완료+리포트 저장 원자성은 동일 트랜잭션 요구사항으로 해결됨,
  (c) 응답 유실 후 재제출 시 동일 결과 재사용(진정한 요청 수준 idempotency)은 여전히 이 SPEC
  범위에서 의도적으로 다루지 않는 gap으로 남김(리스는 "동일 사용자당 동시 실행 1개 제한"만
  제공하며 페이로드 기반 재사용을 제공하지 않음 — Out of Scope 절 참고), (d) 지연 도착 결과와
  재시도 결과의 충돌은 완료 기록의 leaseId 펜싱으로 해결됨. ⑤"idempotency 가드"라는 부정확한
  용어를 이 SPEC 전체(spec.md/plan.md/acceptance.md)에서 "사용자별 동시 실행 가드"로 정정 —
  이 가드는 동일 사용자당 동시 in-flight 파이프라인 1개 제한만 제공하며 일반적 의미의
  idempotency(동일 요청 재시도 시 동일 결과 재사용)를 제공하지 않기 때문이다. ⑥신규
  REQ-PILOT-READY-016 추가 — 파일럿 최종 착수 여부를 판단하는 별도 리포트
  (`.moai/reports/pilot-ready-readiness-decision-<date>.md`)가 6개 항목(호스팅 적합성/원격
  DB/실 도메인 인증/실 Gemini 스모크/동시 부하/리스+트랜잭션 보장) 각각을 READY/BLOCKED/
  UNVERIFIED로 개별 판정하고, 원격 검증이 필요한 항목 중 하나라도 BLOCKED 또는 UNVERIFIED면
  전체 판정은 NO-GO라는 게이트 규칙을 요구 — "이 SPEC 자체의 구현 완료"와 "파일럿을 실제
  외부 테스터에게 열어도 되는가"를 구조적으로 분리하기 위함(run-phase 착수 시점에는 템플릿만
  작성, 실제 판정은 run-phase/파일럿 착수 직전에 채워짐). ⑦PII 고지 문구를 "3개 자유 텍스트
  필드는 스캔되지 않는다"는 일반화된 표현에서 리뷰어가 요구한 정밀한 문구("세 자유 입력란에서
  주민등록번호·휴대전화번호 형식은 검사하지만, 실명·주소·상세 정황 등 모든 식별정보 탐지나
  자동 비식별화는 보장하지 않는다")로 전면 교체하고, "주소 필드가 애초에 없다는 구조적 사실"과
  "그래도 자유 텍스트 필드에 주소를 타이핑해 넣을 수 있다는 잔여 위험"을 항상 함께 명시하도록
  구분을 명확히 한다. ⑧plan.md에 Implementation Kickoff 결정 체크리스트(Vercel
  프로젝트/tier/도메인, 원격 Turso 대상, 지원 연락처, 장애 대응 담당자, Gemini 쿼터 점검
  담당·시점, 동시성 측정용 테스터 계정 준비)를 신규 추가. ⑨README.md/product.md의 "구현 완료
  10개 SPEC" 목록에서 누락됐던 SPEC-GEMINI-RUNTIME-001을 추가해 목록과 개수 표기를
  일치시킴. 이 개정은 Tier M REQ/AC 상한(각 16개) 이내를 유지한다 — REQ는 기존
  15개에 REQ-PILOT-READY-016 1개를 추가해 16/16(상한 도달), AC는 신규 최상위 AC 번호를
  추가하지 않고 기존 AC-PILOT-READY-007/015/016에 하위 절(sub-clause, `a`/`b` 접미사)을
  추가하는 방식으로 16/16(상한 유지, 신규 최상위 AC 없음)을 유지한다.
- 2026-09-10 (v0.4.0): 외부 리뷰 3차 개정 — v0.3.0의 리스(lease) 설계에서 발견된 2개의
  실제 설계 결함을 수정하고, 최종 준비 상태 판정 게이트를 정밀화한다. 이번 개정은 신규
  최상위 REQ/AC를 추가하지 않고(REQ 16/16, AC 16/16 상한 유지), 기존 REQ-PILOT-READY-007/
  015/016과 그 하위 AC의 문구를 교정·정밀화하는 방식으로만 진행한다. ①TTL 설계 결함
  수정 — 기존 "TTL 60초 = 로컬 실측 30초의 2배"라는 산정은 로컬 happy-path 실측만
  반영했을 뿐, 실제 배포된 서버리스 함수가 겪을 수 있는 worst-case(재시도, 429 백오프,
  느린 Gemini 응답)를 반영하지 못해 기각한다 — 정상적으로 아직 실행 중인 파이프라인의
  리스가 TTL보다 먼저 만료되면, 두 번째 요청이 리스를 재획득해 REQ-PILOT-READY-007이
  막으려던 바로 그 동시 이중 실행이 발생할 수 있다는 실제 결함이었다. REQ-PILOT-READY-007을
  배포 라우트가 `export const maxDuration = 300`(Next.js route segment config, 300초 —
  Vercel Hobby/Pro 두 tier 모두의 상한 안에 들어오므로 §A 결정 4의 tier 미확정 상태와
  충돌하지 않음)을 명시적으로 설정하도록 재작성하고, `LEASE_TTL_SECONDS`를 이 `maxDuration`
  보다 최소 330초(약 30초 안전 여유) 이상으로 요구한다 — 정상 처리 중인 요청의 리스가
  플랫폼이 함수를 강제 종료하기 전에 만료되는 일이 없도록 하기 위함이다. "30초 단일 로컬
  실측과 429 재시도 가능성만으로 60초가 충분하다"는 과소평가된 정당화 문장 자체를
  spec.md/plan.md에서 제거하고, plan.md §A 결정 1에 정적 TTL(maxDuration 이상 고정값)
  방식과 heartbeat 갱신(실행 중인 파이프라인이 주기적으로 자신의 리스 `expiresAt`을
  연장) 방식을 명시적으로 비교해 정적 방식을 채택한 근거를 기록한다. plan.md §D Risk
  4의 "실제 처리 시간이 15초를 초과하면 TTL 재조정이 필요하다"는 문구는 새 TTL 설계와
  모순되므로 제거한다. 신규 AC(AC-PILOT-READY-007에 하위 절로 추가) — 정상적인 첫 번째
  실행이 30초 happy path가 아니라 새 TTL 여유 안에서의 현실적 worst-case 지속 시간
  동안에도 유효하게 실행 중인 동안, 동일 사용자의 두 번째 요청이 `runPipeline`을 시작하지
  않음을 검증한다. ②완료 기록 트랜잭션 원자성/펜싱을 폴백 없는 하드 요구사항으로 확정 —
  이 프로젝트가 고정 사용하는 `@libsql/client@0.17.4`(원격 `libsql://` 연결에 사용되는
  main 패키지 — 제약이 다른 `@libsql/client/web` 서브셋이 아님)의 `http.js`
  `transaction()` 구현과 `drizzle-orm@0.45.2`의 `libsql/session.js`
  `LibSQLSession.transaction()` 구현을 실제 소스 코드로 확인한 결과, 원격 HTTP 연결에
  대해서도 진짜 인터랙티브 트랜잭션(실패 시 자동 rollback, 성공 시 commit)을 지원함이
  이 SPEC 조사 범위에서 검증됐다(출처: unpkg.com/@libsql/client@0.17.4/lib-esm/http.js,
  unpkg.com/drizzle-orm@0.45.2/libsql/session.js,
  github.com/tursodatabase/libsql-client-ts CHANGELOG.md — v0.2.0부터 HTTP 인터랙티브
  트랜잭션 지원, tursodatabase.github.io/libsql-client-ts Client 인터페이스 문서). 운영
  제약으로 libSQL은 열려 있는 인터랙티브 트랜잭션에 서버측 5초 잠금 타임아웃을 두므로,
  이 사실을 REQ-PILOT-READY-007에 명시해 향후 구현자가 트랜잭션 안에 느린 작업을 넣지
  않도록 경고한다. 일부 AI 검색 요약 결과가 "libSQL은 HTTP를 통한 인터랙티브 트랜잭션을
  지원하지 않는다"고 잘못 주장하는 경우가 있는데, 이는 별도의 제약이 있는
  `@libsql/client/web` 패키지에만 해당하는 사실이며 이 프로젝트가 쓰는 main 패키지에는
  해당하지 않는다는 주의 문구도 함께 남긴다 — 향후 독자가 이 오해로 정상 동작하는 코드를
  "고치려" 시도하는 것을 방지하기 위함이다. 이 확인에 따라 REQ-PILOT-READY-007(3)을
  "가능한 한 같은 트랜잭션으로 묶는다"는 목표 설계에서 "리스 소유권 재확인 + `cases`
  INSERT + `reports` INSERT + `reservations` 삭제, 이 4단계 전부를 단일
  `db.transaction(async (tx) => {...})` 호출로 수행해야 한다"는 예외 없는 단일 요구사항으로
  재작성하고, "드라이버가 지원하지 않으면 문서화하고 통과시킨다"는 기존 폴백 이스케이프
  해치를 완전히 제거한다 — 아울러 트랜잭션 밖에서 리스 소유권을 확인하는 잔여 폴백
  경로도 함께 제거해, 소유권 확인이 반드시 쓰기와 같은 트랜잭션 안에서 수행되도록
  한다. plan.md에는 일반 원칙만 남긴다 — run-phase 구현 중 이 확인된 동작과 실제로
  다른 드라이버 회귀가 발견되는 등 이 요구사항이 실제로 충족되지 않음이 확인되면, 그
  사실 자체를 REQ-PILOT-READY-007의 FAIL로, 파일럿 준비 상태(REQ-PILOT-READY-016)를
  NO-GO로 판정해야 한다는 폴백 **정책**으로 기록한다(현재 불확실해서 두는 hedge가
  아니라, 확인된 사실이 실제 구현에서 어긋날 경우의 대응 정책). 신규 AC(둘 다
  AC-PILOT-READY-007 하위 절로 추가) — (a) 트랜잭션 기반 완료+해제 직후 리스
  재획득(reacquisition) 시도가 깨끗이 성공함을 검증하는 경쟁 테스트(다음 사용자를 막는
  잔여 상태가 없음을 확인), (b) `reports` INSERT 실패를 주입해 `cases` 완료 행이 전혀
  존재하지 않음(부분 커밋 없음)을 후속 조회로 재확인하는 롤백 테스트 — 두 테스트 모두
  아무 일도 없었던 것과 동일한 DB 상태임을 직접 조회로 검증한다. ③최종 파일럿 준비 상태
  판정 게이트 정밀화(REQ-PILOT-READY-016/AC-PILOT-READY-016b) — 호스팅 적합성 항목을
  "tier/ToS 결정"과 "실제 배포 환경에서의 타임아웃 실측(maxDuration 상한 안에 여유 있게
  들어옴을 보여주는 증거)" 둘 다를 요구하도록 세분화하고(결정만 있고 실측이 없으면
  UNVERIFIED), Gemini 쿼터(REQ-PILOT-READY-003)를 호스팅과 별개의 독립 게이트 항목으로
  승격해 실제 AI Studio 대시보드 확인과 기록된 `GEMINI_*_RPM_BUDGET` 값(코드 기본값
  그대로는 UNVERIFIED)을 READY 조건으로 명시한다. 서로 다른 사용자 동시 부하 항목의
  READY 기준을 "배치 안의 모든 요청이 성공적인 최종 상태에 도달하고, 그 결과가 실제로
  DB에 영속화·조회 가능하며, 처리되지 않은 429/5xx/타임아웃이 하나도 없음"으로 정밀화한다
  (기존 재시도/백오프로 흡수된 429는 무방). DB 메커니즘 검증(조건부 UPSERT 재획득 +
  완료 트랜잭션) 항목은 실제 원격 Turso 대상에 대한 검증만을 READY로 인정하며,
  로컬/in-memory SQLite 결과만으로는 READY로 판정할 수 없음을 명시한다. 실 Gemini
  스모크 항목은 로컬(`next start`) 실행과 실제 배포 도메인 실행을 명시적으로 구분하고,
  최종 판정은 반드시 배포 도메인 결과를 요구한다. 이로써 항목 수가 6개에서 7개로
  늘어난다 — 게이트 규칙도 "(1) tier/ToS 결정을 제외하고, 원격 검증·실측이 필요한
  항목(1의 타임아웃 실측 포함, 2~7) 중 하나라도 BLOCKED 또는 UNVERIFIED면 전체 NO-GO"로
  재작성한다. 아울러 이 판정 문서의 **공정** 자체를 명시한다 — plan-phase에는 빈
  템플릿으로만 작성되는 것이 맞지만(기존과 동일), run-phase의 마지막 마일스톤에서는
  7개 항목 전부에 실제 판정값과 전체 GO/NO-GO가 채워져야 하며, 템플릿이 비어 있는
  상태로 run-phase가 종료되는 것은 허용되지 않는다 — 단, 실제로 채워 넣은 판정이
  NO-GO인 것 자체는 정상적으로 허용되는 run-phase 완료 상태다(판정을 회피하는 것만
  금지된다). AC-PILOT-READY-016b를 "6개 항목 각각 판정" 검증에서 "7개 항목 모두가
  실제 값으로 채워졌는가 + 전체 GO/NO-GO가 기록됐는가"까지 검증하도록 보강한다.
  ④Out of Scope 절의 "최근 리서치 패널 processing/failed 상태 미표시" 항목을 정리한다
  — 이 우려는 REQ-PILOT-READY-007의 원 설계(옛 컬럼 재사용, 파이프라인 실행 이전에
  `processing` 상태를 기록)에서만 유효했다. v0.3.0의 리스(lease) 설계에서는 `cases` 행이
  파이프라인이 **성공**한 뒤 완료 기록 트랜잭션 안에서만 생성되므로(REQ-PILOT-READY-007(3)),
  `processing`/`failed` 상태의 `cases` 행은 애초에 전혀 생성되지 않는다 — 이 우려는 더
  이상 이 SPEC의 현재 설계에 적용되지 않는 사실로 확인되어, Out of Scope 절에서
  "기각된 옛 설계(Option B)에서만 유효했던, 현재는 적용되지 않는 우려"로 재분류하고
  plan.md §D Risk 6도 동일하게 갱신한다. ⑤plan.md §F 체크리스트의 "위 5개 항목"이라는
  표기 오류를 실제 표 행 수(6개)에 맞춰 수정하고, 실제 프로덕션 도메인 값과 원격 Turso
  대상 값을 run-phase 필수 블로커(run-phase 완료를 위해 반드시 실제 값으로 확정되어야
  하는 항목)로 명시적으로 격상한다 — Vercel tier 자체(Hobby/Pro 중 선택)는 여전히 비용
  결정 권한자의 미확정 결정으로 남지만, tier와 무관하게 실제 도메인 값 자체는
  run-phase의 타임아웃/인증 검증 리포트가 동작하기 위한 전제조건이므로 별개로
  블로커임을 명시한다. 사용자 승인 전 결제·플랜 업그레이드·배포 금지 원칙은 변경하지
  않는다. 이 개정은 신규 최상위 REQ/AC를 추가하지 않으므로 REQ 16/16, AC 16/16
  상한을 그대로 유지한다.
- 2026-09-10 (v0.5.0): 외부 리뷰 4차 개정 — **plan-auditor Retry Loop Contract가
  규정하는 SPEC plan-phase당 최대 3회 반복 상한(`.claude/agents/moai/plan-auditor.md`
  §Retry Loop Contract "Max 3 iterations cap")을 이미 초과한 상태에서 진행되는 개정임을
  명시적으로 기록한다.** 오케스트레이터가 사용자에게 이 SPEC이 이미 문서화된
  3회 plan-audit 반복 상한을 넘어섰음을 경고했고, 사용자는 `AskUserQuestion`을 통해
  이 사실을 인지한 상태로 계속 진행할 것을 명시적으로 확인했다 — 이 확인이 이번
  개정을 진행하는 오버라이드 근거다. 이번 개정은 신규 최상위 REQ/AC를 추가하지 않고
  (REQ 16/16, AC 16/16 상한 유지), 기존 REQ-PILOT-READY-002/003/007/016과 그 하위
  AC의 문구를 교정·정밀화하는 방식으로만 진행한다. ①`.moai/reports/pilot-ready-readiness-decision-2026-09-10.md`
  템플릿 파일 자체가 v0.4.0 개정(6개→7개 항목 정밀화) 이후 갱신되지 않고 방치되어
  있었음을 확인해 동기화한다 — 항목 수를 7개로 맞추고(신규 Gemini 쿼터 항목 삽입),
  호스팅 항목의 근거 필드가 tier/도메인 결정(plan.md §F)과 실제 배포 환경 타임아웃
  실측 리포트 둘 다를 요구하도록 명시하고, 실 Gemini 스모크 항목이 반드시 배포
  도메인 결과를 요구함을(로컬 `next start` 결과 불인정) 명시하고, 저장소/복구 항목이
  반드시 실제 원격 Turso 대상 검증을 요구함을(로컬/in-memory SQLite 결과 불인정)
  명시하고, 전체 게이트 규칙 문구를 v0.4.0 표현("tier/ToS 결정을 제외하고 2~7번 항목
  중 하나라도 BLOCKED/UNVERIFIED면 전체 NO-GO")에 맞춰 재작성한다. **아울러 이
  문서의 공정(process) 자체를 명시한다** — plan-phase 초안 상태에서만 빈칸
  (`unfilled` placeholder)이 허용되며, run-phase 완료 이전에는 7개 항목 전부가
  실제 판정값(READY/BLOCKED/UNVERIFIED — UNVERIFIED도 정당한 최종 판정값이다)으로
  채워져야 한다는 절차를 명문화하고, 템플릿의 **현재 상태**를 이 원칙에 맞게
  "7개 항목 전부 UNVERIFIED, 전체 판정 NO-GO"로 명시적으로 채운다 — plan-phase
  시점에는 실제로 아무것도 측정되지 않았으므로 이것이 정직한 현재 상태이며, 빈칸
  placeholder와는 구분되는 상태임을 문서 본문에서 명시한다. ②REQ-PILOT-READY-003을
  "run-phase에는 실행되지 않고 이후 운영자가 확인할 절차로만 문서화하면 충분한"
  체크리스트 항목에서, "When 파일럿 런칭 준비 절차가 수행되면"으로 시작하는 실제
  run-phase 실행 항목(유형: Ubiquitous → When(이벤트 감지))으로 격상한다 — 실제
  AI Studio 쿼터 대시보드를 사람이 직접 확인하고, 확인 날짜·확인한 사람·관측된 실제
  쿼터/레이트리밋 한도·그 근거로 실제 선택한 `GEMINI_RESEARCH_RPM_BUDGET`/
  `GEMINI_FAST_RPM_BUDGET` 두 값을 기록해야 하며, 이 확인이 수행·기록되지 않으면
  이 게이트 항목은 UNVERIFIED로 남아 전체 NO-GO에 기여한다. **동시에 기존의 과도하게
  엄격한 규칙("RPM budget 값이 검증되지 않은 기본값 4로 남아 있으면 자동으로 FAIL"
  이라는 취지의 문구, REQ-PILOT-READY-016 항목(2) 원문 "코드 기본값(4)을 그대로 둔
  상태는 UNVERIFIED"에 남아 있던 표현)를 교정한다** — 값이 4로 유지되는 것 자체는
  문제가 아니다; 4가 실제로 관측된 한도의 약 70~80%에 해당한다는 근거가 함께
  기록되어 있으면 4를 유지하는 것도 정상적으로 허용된 READY 결과다. 대시보드 확인
  자체가 전혀 수행되지 않은 채(근거 기록 없이) 기본값 4만 남아 있는 상태만이
  UNVERIFIED를 유발한다 — 숫자 4 자체가 아니라 검증 여부가 판정 기준이다.
  ③REQ-PILOT-READY-007(3)의 완료 기록 트랜잭션과 관련해, `reports` INSERT 실패로
  트랜잭션이 롤백된 이후의 리스(lease) 처리에 대한 실제 오류가 있었음을 확인해
  정밀화한다 — 롤백 자체는 여전히 4단계 전부(리스 소유권 재확인/`cases` INSERT/
  `reports` INSERT/`reservations` DELETE)를 되돌리므로 그 직후 시점에는 `reservations`
  리스 행이 트랜잭션 시도 이전 상태 그대로 남아 있는 것이 맞다(이 부분은 이미
  정확했다, 유지). 그러나 원 설계에는 그 이후의 처리가 빠져 있었다 — 이 상태로 두면
  같은 사용자가 리스 TTL(최소 330초)이 지날 때까지 재제출할 수 없다. 이를 정밀화해,
  이 트랜잭션 실패를 처리하는 catch/에러 처리 경로(트랜잭션이 이미 롤백된 *이후에*
  실행되는, 그 트랜잭션과는 별개의 후속 단계)가 자신의 `ownerUserId` AND `leaseId`가
  모두 일치할 때만 수행하는 펜싱된 `DELETE`로 리스를 명시적으로 해제해야 한다는
  요구사항을 REQ-PILOT-READY-007(3)에 새 하위 절로 추가한다 — 이 해제가 성공하면
  같은 사용자는 인위적인 추가 대기 없이 즉시 새 리스를 재획득할 수 있어야 한다. 만약
  이 후속 해제 자체도 실패하는 드문 이중 실패 상황이면, 그 오류를 로그로 남기고 최종
  회복은 기존 TTL 만료 메커니즘에 맡긴다(이 경우에만 즉시 재제출이 차단되며, TTL로
  상한이 있어 영구히 막히지는 않는다). **이 후속 해제 단계는 (3)의 4단계 단일
  트랜잭션 요구사항(폴백 없음)을 완화하거나 대체하지 않는다** — 성공 경로의 원자성
  요구사항은 그대로 유지되며, 이 후속 해제는 그 트랜잭션이 이미 실패해 롤백된
  이후에만 실행되는 별개의 실패 복구 행동이다. AC-PILOT-READY-007에 이 후속 해제와
  즉시 재제출 성공을 검증하는 신규 하위 절(sub-clause)을 추가한다(신규 최상위 AC
  번호는 추가하지 않는다). ④호스팅 적합성 READY 게이트의 "maxDuration 상한 안에
  여유 있게 들어와야 한다"는 문구가 이진(binary)으로 판정 가능하지 않다는 점을
  확인해 구체적 수치 기준으로 대체한다 — REQ-PILOT-READY-002가 요구하는 실측을
  **최소 3회 이상**의 개별 실행으로 구성하도록 명시하고, REQ-PILOT-READY-016
  항목(1)의 READY 기준을 "실제 **배포 도메인** 환경에서 수행된 그 3회 이상의 측정
  중 **관측된 최대 처리 시간이 270초 이하**(선택된 tier의 `maxDuration`(300초)
  대비 약 30초의 안전 여유 — 측정된 파이프라인 로직 자체가 아니라 플랫폼 수준의
  콜드스타트·네트워크 오버헤드를 흡수하기 위한 여유)"로 구체화한다. 이 270초/3회
  라는 구체적 수치는 이 SPEC이 새로 도입하는 판단 기준이며, 기존 `maxDuration`
  300초 자체(Vercel 공식 문서 근거)와는 구분되는 이 SPEC의 안전 여유 정책 결정이다.
  ⑤AC-PILOT-READY-007의 "현실적 worst-case 지속 시간 동안의 가드 유지"(예: 200초
  이상 pending) 시나리오가 실제 200초 이상의 real wall-clock 대기를 요구하는 것으로
  오독될 수 있음을 확인해, plan.md(M6, 설계 노트)와 acceptance.md(해당 AC 하위 절,
  테스트 방법론 노트) 양쪽에 이 테스트가 fake timer/mock clock으로 "200초 이상
  경과"를 시뮬레이션할 뿐 실제로 200초 이상 대기하지 않는다는 점을 명시적으로
  기록한다 — run-phase 구현자가 문자 그대로 200초 이상 sleep하는 테스트를 작성하지
  않도록 하기 위함이다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

`app/cases/new/case-input-form.tsx`(사건 입력) → `lib/cases/create-case.ts`(파이프라인 동기
실행) → `app/cases/[caseId]/page.tsx`(리포트 표시) → `app/cases/[caseId]/feedback-form.tsx`
(구조화 피드백 제출)로 이어지는 핵심 흐름은 SPEC-RESEARCH-001·SPEC-GEMINI-RUNTIME-001·
SPEC-EVIDENCE-001·SPEC-FEEDBACK-001·SPEC-PILOT-UX-001을 거치며 기능·UX 양면에서 이미
완성되어 있다(전체 10개 기존 SPEC 모두 `status: completed` — 조사 세션에서
`.moai/specs/*/spec.md`의 frontmatter를 직접 읽어 확인). 그러나 이 흐름은 **로컬 개발
환경에서 2회의 수동 smoke 테스트(`.moai/reports/gemini-smoke-20260827.md`,
`.moai/reports/gemini-runtime-smoke-20260828.md`)로만 검증됐을 뿐, 실제 배포 대상(Vercel
등)에서 파일럿 동시 사용 규모(10명)로 가동해 본 적이 없다.** 조사 세션이 read-only로
확인한 구체적 배포 리스크는 다음과 같다:

- **배포 대상 tier가 실행 시간이 아니라 상용 사용 ToS 준수 여부의 문제**: 이 프로젝트에
  유료 Vercel 플랜 사용의 증거가 없어(조사 세션 기준), 애초에는 Vercel Hobby(무료) tier를
  가정하고 "실행 시간 상한 초과" 위험으로만 프레이밍했다. 그러나 Vercel 공식 문서 재확인
  결과, Fluid Compute가 기본 활성화된 현재 Hobby tier의 서버리스 함수 실행 시간은
  기본값이자 최댓값이 300초(5분)이며, `POST /api/cases`의 로컬 실측 처리 시간
  30초(`.moai/reports/gemini-runtime-smoke-20260828.md` §실행 로그 5번 — curl 실측)는 이
  상한에 여유 있게 들어온다 — 실행 시간은 실제로는 결정적 리스크가 아니었다. 진짜 문제는
  Vercel Hobby 플랜의 Fair Use Guidelines가 "이 프로젝트 제작 어느 부분에든 관여한 누군가의
  금전적 이익을 위한 배포"를 상용(commercial) 사용으로 정의한다는 점이다 — 유급
  개발자가 구축한 B2B 파일럿(외부 전문가 테스터 대상, 파일럿 자체의 유상 여부와 무관)이
  이 정의에 해당하는지는 Vercel 공식 문서만으로 확정할 수 없는 미확인 사항이며,
  Vercel 자신도 불확실한 경우 지원팀에 문의하라고 안내한다. Vercel Pro tier(실행 시간
  기본 300초/GA 최대 800초/베타 최대 1800초, $20/좌석/월 + 포함 크레딧 초과분 사용량
  과금)는 "플랫폼의 모든 상용 사용은 Pro 또는 Enterprise 플랜을 요구한다"고 명시적으로
  ToS 준수를 보장한다.
- **Gemini 쿼터가 코드 기본값(4 RPM)으로 미확정**: `.env.local.example:64,67`의
  `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET` 기본값은 `4`이며,
  `.moai/reports/gemini-runtime-smoke-20260828.md` §잔여 위험이 "이번 세션은 AI Studio
  대시보드 접근 수단이 없어 코드 기본값 4를 그대로 사용했다 — 실제 프로젝트의 정확한
  무료 tier 한도를 확인할 수 있는 세션에서 70~80% 값으로 재조정하는 것이 권장된다"고
  명시적으로 남긴 미해결 과제다.
- **원격 DB 마이그레이션/시드가 로컬 `file:` DB로만 검증됨**: `.moai/docs/runtime-runbook.md`
  §1이 로컬 파일 DB 경로("가장 빠른 시작 경로")를 문서화하고 있으나, `pnpm db:migrate`/
  `pnpm db:seed`/`pnpm tester:add` 흐름이 실제 원격 Turso 인스턴스(`libsql://`)에 대해
  실행된 기록이 조사 세션에서 확인되지 않았다.
- **인증 설정이 localhost 전제로만 동작 확인됨**: 2026-08-28 스모크는 `BETTER_AUTH_URL`을
  로컬 포트(`:3006`)로 맞춘 상태에서만 수행됐다(`.moai/reports/gemini-runtime-smoke-20260828.md`
  §실행 로그 5번) — 실제 배포 도메인을 가리키는 `BETTER_AUTH_URL`로 로그인이 실제로
  동작하는지는 확인된 바 없다.
- **동시성 보호가 전혀 없음**: `lib/pipeline/index.ts:43`의 주석이 스스로 명시하듯,
  `withPipelineLock`(`:51`)은 "모듈 스코프 변수이므로 Vercel의 서로 다른 serverless
  인스턴스(별도 프로세스)" 사이에서는 아무 보호도 제공하지 않는다. 동시 요청 시 실제
  거동(성공/실패/지연/인스턴스 간 경쟁 증상)이 측정된 적이 없다.
- **재제출 시 파이프라인 중복 실행을 막는 서버측 가드가 전혀 없음**: `lib/cases/create-case.ts`
  (`:38-72`)를 읽으면, `cases` 테이블 행은 `runPipeline`(`:49`, 값비싼 3회 Gemini 호출) 완료
  **이후**에야 `status: "completed"`로 1회 INSERT된다(`:55-62`). 파이프라인 실행 이전에
  기록되는 "처리 중" 상태가 전혀 없으므로, 네트워크 타임아웃 이후 사용자가 재시도하면
  서버는 이를 구분할 방법 없이 파이프라인을 처음부터 다시 실행한다. `cases.status`
  컬럼(`lib/db/schema.ts:75`, 기본값 `"pending"`) 자체는 이미 존재하지만 이 상태 전이가
  파이프라인 실행 이전에 활용되지 않고 있다 — SPEC-PILOT-UX-001 iteration 3에서 명시적으로
  기각된 DB-nonce 방식(§Out of Scope 참고)과는 다른, 훨씬 단순한 기존 컬럼 재사용
  기회다. **단, "기존 컬럼을 재사용한다"는 선택이 자동으로 원자적(atomic) 가드를
  의미하지는 않는다** — `SELECT status` 후 별도 `INSERT`를 실행하는 app 레벨
  check-then-act 구조는 두 요청이 거의 동시에 도착하면 경쟁 구간(race window)을 막지
  못한다. 이 SPEC은 이 결함을 원 설계 단계에서부터 명시적으로 다룬다(REQ-PILOT-READY-007
  참고 — 진정한 원자성을 얻으려면 DB 제약(UNIQUE + `ON CONFLICT`) 기반의 예약/리스(lease)
  테이블이 필요하며, 이는 소규모 스키마 변경을 의미한다 — v0.3.0 개정으로 이 구현 방식은
  더 이상 미확정 결정이 아니라 REQ-PILOT-READY-007이 요구하는 단독 확정 경로다).
- **동시성 제한(concurrency limit)과 제출 idempotency는 서로 다른 보장이며, 이 SPEC의
  사용자별 동시 실행 가드는 일반적 의미의 idempotency(동일 요청 재시도 시 동일 결과 재사용)를
  제공하지 않음**: REQ-PILOT-READY-007의 가드가 막는 것은 "동일 사용자당 동시 in-flight
  파이프라인 1개"라는 동시성 제한뿐이다. 리스(lease)의 TTL 기반 재획득과 leaseId 펜싱으로
  크래시로 인한 고착 상태 회수, 완료 상태 전이와 리포트 저장의 원자성, 지연 도착 결과와
  재시도 결과의 충돌 3가지는 해결되지만, 응답 유실 후 재제출 시 테스터가 동일하게 완료된
  결과를 재사용하는 진정한 요청 수준 idempotency는 이 SPEC 범위에서 의도적으로 다루지
  않는 gap으로 남는다 — 이 구분을 명시적으로 문서화해야 한다(REQ-PILOT-READY-015 참고).
- **애플리케이션 레벨 로깅이 전무함**: `app/api/cases/route.ts`, `lib/cases/create-case.ts`,
  `lib/pipeline/index.ts`, `lib/ai/providers/gemini.ts` 어디에도 요청 시작/파이프라인
  단계 실패/DB 쓰기 실패에 대한 구조적 로그 출력이 없다(조사 세션 grep 확인) — 파일럿
  중 장애가 발생하면 원인 파악 수단이 없다.
- **데이터 취급 고지가 과대 주장 위험을 안고 있음**: `lib/validation/case-input.ts`가 실제로
  하는 일은 (a) `RESIDENT_REGISTRATION_NUMBER_PATTERN`/`PHONE_NUMBER_PATTERN` 정규식으로
  주민등록번호·전화번호 **형식**을 구조적으로 거부하고(`:17,20,26-31`), (b) `.strict()`로
  주소·의료기록 원본 등 애초에 스키마에 정의되지 않은 필드를 거부하는 것(`:36-43`)뿐이다.
  정확한 진술은 **"세 자유 입력란에서 주민등록번호·휴대전화번호 형식은 검사하지만,
  실명·주소·상세 정황 등 모든 식별정보 탐지나 자동 비식별화는 보장하지 않는다"**이다
  (v0.2.0/v0.3.0 개정 시 `lib/validation/case-input.ts`를 재확인 — "아무것도 스캔하지
  않는다"는 과잉 단순화가 아니며, 동시에 "주소·의료기록 원본 필드가 없다"는 구조적 사실과
  "그래도 3개 자유 텍스트 필드에 주소·실명 등을 타이핑해 넣을 수 있다"는 잔여 위험은
  서로 다른 두 가지 사실이므로 이 둘을 하나로 뭉뚱그리지 않는다: (i) 주소·의료기록 원본
  필드가 스키마에 애초에 없다는 것은 `.strict()`로 강제되는 **구조적 사실**이고, (ii) 사용자가
  `incidentDescription`/`diagnosisName`/`disabilityBodyPart` 3개 자유 텍스트 필드에 주소나
  실명 등 식별정보를 직접 타이핑해 넣는 것을 스키마가 막지 못한다는 것은 스키마가 해소하지
  않는 **잔여 위험**이다). 그런데 `app/cases/new/page.tsx:56`의
  현재 고지 문구("비식별 요약만 입력하세요")는 스키마가 실제로 무엇을 막고 무엇을 막지
  않는지, 그리고 "합성/이미 비식별화된 사례만 가져와야 한다"는 테스터 책임을 명시하지
  않는다. 로그인 화면 하단의 "고객지원" 링크(`app/login/login-form.tsx:14,131`)는
  `aria-disabled="true"`로 비활성 상태이며(`:131`), 실제 문의 채널이 연결되어 있지 않다.
  비식별 입력의 구체적 예시도 어디에도 없다(조사 세션 grep 확인).

### WHAT — 이번 SPEC 범위

신규 비즈니스 기능을 도입하지 않고, 12개 영역으로 범위를 고정한다:

1. 배포 대상 tier 결정 및 호스팅 실행 시간 정합성 확인 (측정형 + 미확정 결정 기록)
2. Gemini 쿼터 사전 점검 (운영 체크리스트)
3. 원격 DB 마이그레이션/시드 실행 검증 (측정형)
4. 실제 배포 도메인 인증 설정 검증 (측정형)
5. 동시성 실측 및 문서화 — 큐/락 서비스 도입 없음 (측정형)
6. 최소 서버측 재제출 가드 — TTL 기반 리스(lease) 방식(옵션 A)으로 확정, 완료+리포트
   저장 원자성 포함 (코드 변경 + 신규 마이그레이션)
7. 재제출 가드의 동시성 제한 vs. 제출 idempotency 구분 및 4개 실패 모드 재판정 문서화 (문서)
8. 최소 구조적 로깅 (코드 변경)
9. 최소 장애 대응 런북 (문서)
10. 실 Gemini 스모크 재검증 (측정형)
11. 데이터 취급 고지 정직성 개선 — 한계 명시, 연락 채널, 예시 (코드+문서 변경)
12. 최종 파일럿 준비 상태 판정 문서 — 개별 항목별 READY/BLOCKED/UNVERIFIED 판정 +
    원격 검증 항목 하나라도 실패 시 전체 NO-GO 게이트 규칙 (문서, run-phase 착수 시점에는
    템플릿만)

기존 API·DB 스키마·파이프라인 알고리즘 계약은 수정하지 않는다. 다만 데이터 계층은
REQ-PILOT-READY-007(재제출 가드)이 요구하는 신규 `reservations`(리스) 테이블 1개를
반드시 추가한다 — v0.3.0 개정으로 "기존 컬럼만 재사용"하는 무마이그레이션 대안은
더 이상 이 SPEC이 허용하는 구현 경로가 아니며(§2 REQ-PILOT-READY-007 참고, 기각된
대안의 근거는 plan.md §A 결정 1에 기록), 소규모 마이그레이션(신규 테이블 1개)은 이제
이 SPEC의 확정된 범위다. 이 결정과 무관하게, `cases`/`evidence`/`feedback`/
`allowed_testers` 등 기존 테이블과 파이프라인 알고리즘 자체는 수정하지 않는다.

### 측정 완료(measurement-done) vs. 파일럿 진행 여부 판단(go/no-go) 구분

이 SPEC의 측정형 REQ(REQ-PILOT-READY-002/004/005/006/010)에 대응하는 AC는 "측정이
실제로 수행되고 그 결과가 리포트에 정확히 기록되었는가"만을 판정 대상으로 한다.
측정 결과(타임아웃 초과, 원격 DB 마이그레이션 실패, 인증 실패, 동시성 경쟁 증상 등)를
바탕으로 "그래서 파일럿을 진행해도 되는가"를 판단하는 것은 이 SPEC의 AC가 대신
내려주는 것이 아니라, 리포트를 읽는 사람이 별도로 내려야 하는 판단이다. 이는 그런
판단을 내리는 행위 자체를 금지하는 것이 아니다 — 오히려 각 측정 리포트는 그 판단을
사람이 정확히 내릴 수 있도록 충분히 구체적인 수치·오류 메시지를 남겨야 한다.
(REQ-PILOT-READY-006에 있는 "이 리포트 안에 결론성 판단 문장이 없다"는 제약은 이와는
별개로, "큐/락 인프라를 도입해야 하는가"라는 후속 SPEC의 결정 범위를 이 리포트
안에서 앞서가지 않는다는 스코프 제약이며, 파일럿 진행 여부 판단 자체를 막는 것이
아니다 — 두 판단을 혼동하지 않는다.)

### 로컬 대체 실행 증거의 위상

측정형 REQ 중 "가장 근접한 가용 환경으로 대체 가능"이라는 표현이 붙은 항목
(REQ-PILOT-READY-002/006)에서, 로컬(`next start`, `localhost`) 실행으로 얻은 측정값은
**참고/비교 증거로만 사용되며, 그 AC가 요구하는 원격·실배포 검증의 PASS 조건을
대신 충족시키지 않는다.** 로컬로 대체한 경우 리포트에는 그 사실과 한계를 명시하고,
"측정은 로컬 대체로 완료됨 / 배포 대상에 대한 검증은 아직 미확정"이라고 정확히
기록해야 한다 — 로컬 결과를 원격 결과인 것처럼 리포트에 남기는 것은 금지된다.
REQ-PILOT-READY-004(원격 DB)와 REQ-PILOT-READY-005(실 배포 도메인 인증)는 정의상
로컬로 대체할 수 없는 항목이다(각각 실제 원격 Turso 인스턴스, 실제 배포 도메인을
요구).

### 핵심 판단 근거 — Tier M

영향 파일은 `app/api/cases/route.ts`, `lib/cases/create-case.ts`, `lib/db/schema.ts`,
`lib/pipeline/index.ts`, `lib/ai/providers/gemini.ts`, `app/cases/new/case-input-form.tsx`
또는 `page.tsx`, `app/login/login-form.tsx`, `.moai/docs/runtime-runbook.md`(확장) 또는
신규 `.moai/docs/incident-runbook.md`, 그리고 신규 측정/검증 리포트 4-5건으로 약 9-11개,
예상 변경량 300-650 LOC 범위다. DB 스키마 마이그레이션은 v0.3.0 개정으로 더 이상
REQ-PILOT-READY-007의 구현 방식 결정에 조건부가 아니다 — `lib/db/schema.ts`에 신규
`reservations`(리스) 테이블 1개(ownerUserId/leaseId/expiresAt) + Drizzle Kit 마이그레이션
파일 1개가 확정적으로 추가된다. 파일 수가 Tier S 기준(5개 미만)을 넘고, 서로 다른 12개
요구사항 그룹(운영 측정 5개 + 코드 변경 3개 + idempotency 실패 모드 문서화 + 데이터 고지
개선 + 최종 준비 상태 판정까지)에 걸쳐 배포·코드·문서 3개 계층을 모두 다루므로 Tier M으로
분류한다(15개 파일·1000 LOC를 넘지 않아 Tier L에는 해당하지 않는다).

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 배포 대상 tier 결정 및 호스팅 실행 시간 정합성 확인 (Deployment Tier Decision & Timeout Sanity Check)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-001 | Ubiquitous | 이 SPEC의 배포 준비 계획은 Vercel 배포 tier 선택을 "실행 시간 상한" 문제가 아니라 **Fair Use Guidelines의 상용(commercial) 사용 정의 준수 여부** 문제로 다뤄야 한다. Vercel Hobby(무료) tier의 Fair Use Guidelines는 "이 프로젝트 제작 어느 부분에든 관여한 누군가(유급 직원·컨설턴트 포함)의 금전적 이익을 위한 배포"를 상용 사용으로 정의한다. 유급 개발자가 구축한 B2B 파일럿(외부 전문가 테스터 대상)이 이 정의에 해당하는지는 Vercel 공식 문서만으로 확정할 수 없는 미확인 사항이며, Vercel 자신도 불확실한 경우 지원팀 문의를 안내한다. 이 SPEC은 Hobby(무료, ToS 준수 여부 미확인)와 Pro($20/좌석/월 + 포함 크레딧 초과분 사용량 과금, "플랫폼의 모든 상용 사용은 Pro 또는 Enterprise 플랜을 요구한다"고 명시적으로 ToS 준수 보장)를 문서화된 두 후보로 병기해야 하며, 실제 채택은 이 SPEC이 내리지 않는다 — run-phase 착수 전 비용 결정 권한을 가진 사람의 확인이 필요한 **미확정 결정**으로 명시적으로 기록한다. | Vercel 공식 문서(Fair Use Guidelines — 상용 사용 정의; Pricing 페이지 — Pro $20/좌석/월 + 사용량; "모든 상용 사용은 Pro/Enterprise 요구" 명시), 오케스트레이터 조사 세션(배포 준비 갭 조사), 유료 플랜 사용 증거 부재 확인 |
| REQ-PILOT-READY-002 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, 실제 배포된 환경(또는 가장 근접한 가용 환경)에서 `POST /api/cases`의 실제 요청 처리 시간(로컬 실측 기준선: 30초, `.moai/reports/gemini-runtime-smoke-20260828.md` §실행 로그 5번)을 측정하고, 그 값이 REQ-PILOT-READY-001에서 실제로 선택된 tier의 서버리스 함수 실행 시간 상한 안에 들어오는지 문서로 남겨야 한다. Fluid Compute가 기본 활성화된 현재 Vercel Hobby tier의 함수 실행 시간은 기본값이자 최댓값이 300초(5분)이고, Pro tier는 기본 300초/GA 최대 800초/베타 최대 1800초다 — 로컬 실측 30초는 두 tier 모두의 상한에 여유 있게 들어오므로, 이 REQ는 "위험 요인을 찾는 측정"이 아니라 "선택된 tier에서도 여전히 안전한지 확인하는 정합성 점검(sanity check)"으로 재정의된다. 상한을 초과하면 해결 방법(플랜 업그레이드, 파이프라인 단축 등)은 이 SPEC의 범위가 아니며 후속 SPEC으로 명시적으로 미룬다. 이 실측은 (v0.5.0 정밀화) **최소 3회 이상**의 개별 요청 실행으로 구성되어야 하며(단일 1회 실행만으로는 이 REQ의 문서화 요건을 충족하지 못한다), 각 실행의 처리 시간을 초 단위로 개별 기록해야 한다 — 이 REQ 자체는 여전히 "측정이 정확히 수행·기록되었는가"만 판정하며(§ 측정 완료 vs. 파일럿 진행 여부 판단 구분 참고), 그 값이 REQ-PILOT-READY-016 항목(1)의 호스팅 적합성 READY 판정 기준(실제 배포 도메인 기준 최대 처리 시간 270초 이하)을 충족하는지는 REQ-PILOT-READY-016/AC-PILOT-READY-016b가 별도로 판정한다. | Vercel 공식 문서(Functions 실행 시간 문서 — Fluid Compute 기본 활성화, Hobby 300s 기본/최대, Pro 300s 기본/800s GA 최대/1800s 베타 최대), 사용자 지시(측정 후 문서화) |

### B. Gemini 쿼터 사전 점검 (Operational Checklist)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-003 | When(이벤트 감지) | (v0.5.0 격상 — 더 이상 "운영자가 나중에 확인할 절차"로 문서화만 하면 충분한 체크리스트 항목이 아니다) When 파일럿 런칭 준비 절차가 수행되면, run-phase 실행자는 실제 사용 중인 Gemini API 키의 AI Studio 쿼터 대시보드를 실제로 확인하고, (a) 확인 날짜, (b) 확인을 수행한 사람, (c) 관측된 실제 쿼터/레이트리밋 한도, (d) 그 한도를 근거로 실제로 선택한 `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`(현재 코드 기본값 4, `.env.local.example:64,67`) 두 값을 문서로 기록해야 한다. 이 확인이 수행되지 않거나 위 4가지가 기록되지 않으면 이 REQ와 REQ-PILOT-READY-016 항목(2)는 UNVERIFIED로 남아 전체 NO-GO에 기여한다. **RPM budget 값이 확인 후에도 코드 기본값 4로 유지되는 것 자체는 문제가 아니다** — 4가 실제로 관측된 한도의 약 70~80%에 해당한다는 근거가 함께 기록되어 있으면 4를 유지하는 것도 정상적으로 허용된 결과다. 대시보드 확인 자체가 수행되지 않은 채(근거 기록 없이) 기본값 4만 남아 있는 상태만이 UNVERIFIED를 유발한다 — 숫자 4 자체가 아니라 검증 여부가 판정 기준이다. | `.moai/reports/gemini-runtime-smoke-20260828.md` §잔여 위험(대시보드 접근 세션에서 재조정 권장 — 미해결 과제로 명시적으로 남김), `.env.local.example:64,67` |

### C. 원격 DB 마이그레이션/시드 실행 검증 (Remote DB Verification)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-004 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, 기존 `pnpm db:migrate` → `pnpm db:seed` → `pnpm tester:add` 흐름(`.moai/docs/runtime-runbook.md`에 이미 문서화됨)을 로컬 `file:` DB가 아닌 실제 원격 Turso 인스턴스(`libsql://` 또는 `https://` 스킴)에 대해 실제로 1회 실행하고, 그 결과(성공/실패, 관측된 오류)를 문서로 남겨야 한다 — 이 REQ는 새로운 마이그레이션 도구를 만들지 않으며, 기존 런북이 실제 원격 대상에도 적용됨을 검증하는 것만을 목적으로 한다. 이 REQ는 정의상 로컬 대체를 허용하지 않는다(§ 로컬 대체 실행 증거의 위상 참고) — 실제 원격 인스턴스 없이는 이 REQ를 충족할 수 없다. | `.moai/docs/runtime-runbook.md` §1(로컬 file: DB 경로만 검증됨), 원격 실행 기록 부재 확인 |

### D. 실제 배포 도메인 인증 설정 검증 (Auth Config Verification)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-005 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, `BETTER_AUTH_URL`(및 도메인에 종속되는 그 밖의 인증 관련 환경변수)을 실제 배포된 도메인으로 설정하고, 그 도메인에 대해 다음 3가지를 각각 구분해 확인해야 한다: (a) 로그인 요청 자체의 성공(HTTP 성공 상태 또는 UI 성공 신호), (b) 그 로그인으로 실제 세션이 수립됨(세션 쿠키/토큰 존재 확인), (c) 수립된 세션으로 인증이 필요한 보호된 페이지(예: `/cases/new`)에 실제로 접근 가능함. 세 가지 중 하나라도 확인되지 않으면 이 REQ는 충족되지 않는다 — "로그인 성공"이라는 모호한 단일 확인만으로는 부족하다. 이 REQ는 정의상 로컬 대체를 허용하지 않는다(§ 로컬 대체 실행 증거의 위상 참고). | `.moai/reports/gemini-runtime-smoke-20260828.md` §실행 로그 5번(로컬 포트 `:3006`으로만 검증됨), 실 배포 도메인 로그인 검증 기록 부재 확인 |

### E. 동시성 실측 (Concurrency Measurement — 측정 only, 큐/락 도입 없음)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-006 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, 실제 배포 대상(또는 가장 근접한 가용 환경)에 대해 3~5개의 동시(simultaneous) `POST /api/cases` 요청을 **서로 다른 사용자 계정으로** 실제로 발생시키고, 관측된 거동(성공/실패/지연/인스턴스 간 경쟁 증상)을 문서로 남겨야 한다 — 이 REQ는 일반적인 동시 부하(throughput/안정성)를 다루며, "동일 사용자당 동시 1개 제한"이라는 REQ-PILOT-READY-007의 가드를 검증하는 것이 아니다(그 검증은 REQ-PILOT-READY-007 자체의 AC가 별도로 다룬다 — 두 REQ는 서로 다른 것을 측정하며 혼동하지 않는다). 이 REQ는 큐, Redis, 락 서비스 등 새로운 동시성 인프라의 도입을 요구하지 않으며, 그러한 도입이 필요한지에 대한 판단은 이 측정 결과를 근거로 한 후속 SPEC의 몫으로 명시적으로 미룬다. | 사용자 지시(측정 우선, 검증되지 않은 근거로 사전에 인프라를 도입하지 말 것), `lib/pipeline/index.ts:43,51`(모듈 스코프 락이 서로 다른 serverless 인스턴스 간 보호를 전혀 제공하지 않음을 코드 주석이 스스로 명시) |

### F. 최소 서버측 재제출 가드 (Minimal Resubmission Guard)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-007 | While | While 어떤 사용자의 사건 생성 요청이 이미 접수되어 파이프라인이 처리 중인 상태(파이프라인 완료 전)이면, 그 사용자로부터 새로운 사건 생성 요청이 도착했을 때 시스템은 그 사용자에 대해 두 번째 리서치 파이프라인 실행을 동시에 시작해서는 안 되며, 새 요청에는 정상적으로 접수된 새 제출과 구분되는 응답("이미 처리 중" 신호, `409 Conflict`)을 반환해야 한다. 이 보장은 **DB 엔진 수준에서 원자적으로** 이루어져야 한다 — app 레벨 `SELECT status` 후 별도 `INSERT`를 실행하는 check-then-act 구조는 두 요청이 거의 동시에 도착하면 경쟁 구간을 막지 못하므로 이 REQ를 충족하지 않는다. **v0.3.0 개정으로 이 REQ는 다음 리스(lease) 기반 구현을 단독으로(only) 요구한다 — 더 이상 대안 옵션은 없다**: `ownerUserId`를 키(UNIQUE)로 하는 신규 `reservations` 테이블에 `leaseId`(획득마다 새로 생성되는 고유 토큰)와 `expiresAt`(TTL 값 산정은 아래 참고) 2개 컬럼을 추가한다. **v0.4.0 개정으로 이 REQ는 배포 라우트가 `export const maxDuration = 300`(Next.js route segment config, 300초)을 명시적으로 설정할 것을 함께 요구하며, `LEASE_TTL_SECONDS`는 이 `maxDuration`보다 충분히 길게(최소 330초 — `maxDuration` 대비 약 30초의 안전 여유) 설정해야 한다** — 정상 처리 중인 파이프라인이 플랫폼에 의해 강제 종료되기 전에 리스가 먼저 만료되어 두 번째 요청이 리스를 재획득해 동시 이중 실행이 발생하는 것을 방지하기 위함이다 (기존 "TTL 60초 = 로컬 실측 30초의 2배"라는 산정은 로컬 happy-path 실측만 반영하고 재시도·429 백오프·느린 응답을 포함한 실제 배포 환경의 worst-case를 반영하지 못해 v0.4.0에서 기각됐다 — 정적 TTL과 heartbeat 갱신 두 대안의 비교 및 채택 근거는 plan.md §A 결정 1 참고). 이 REQ는 정상적인 첫 번째 실행이 30초 happy path가 아니라 새 TTL 여유 안에서의 현실적 worst-case 지속 시간 동안 유효하게 실행 중인 동안에도, 동일 사용자의 두 번째 요청이 `runPipeline`을 시작하지 않아야 함을 요구한다 (AC-PILOT-READY-007 하위 절 참고). **(1) 원자적 획득/재획득**: `INSERT INTO reservations (owner_user_id, lease_id, expires_at) VALUES (?, ?, ?) ON CONFLICT (owner_user_id) DO UPDATE SET lease_id = excluded.lease_id, expires_at = excluded.expires_at WHERE reservations.expires_at < <now>` 후, 이 쓰기가 실제로 자신의 `leaseId`를 반영했는지(영향받은 행 수, 또는 즉시 재조회로 `leaseId` 일치 확인)를 검사해 "나는 리스를 보유했다"와 "다른 실행의 만료 전 리스에 막혔다"를 구분한다 — 후자면 "이미 처리 중"으로 즉시 응답한다. 이 프로젝트가 사용하는 Turso Cloud 표준(비-MVCC, 일반 `libsql://` 원격 연결) 아키텍처는 SQLite의 단일 writer 트랜잭션 모델을 그대로 가지므로(docs.turso.tech §Client Access), `UNIQUE` 제약 기반 조건부 UPSERT는 DB 엔진 수준의 진정한 원자성을 제공한다 — 다만 이 조건부 `DO UPDATE ... WHERE` 구문 형태 자체가 Turso 공식 문서에서 별도로 재검증되지는 않은 "표준 SQLite/libSQL 문법으로 알려진 것"이라는 한계를 정직하게 명시한다(단순 `ON CONFLICT DO NOTHING`과는 구문이 다름). **(2) 펜싱된 해제(fenced release)**: 파이프라인 종료(성공/실패 모두) 시 `DELETE FROM reservations WHERE owner_user_id = ? AND lease_id = ?`로 자신의 `leaseId`가 여전히 일치할 때만 해제한다 — 리스가 만료되어 다른 실행이 이미 재획득한 경우 이 삭제는 0행에 매치되는 no-op이어야 하며, 절대로 새 리스를 실수로 삭제해서는 안 된다. **(3) 완료 기록의 동일 트랜잭션 원자성(하드 요구사항, 폴백 없음 — v0.4.0 확정)**: 파이프라인 성공 시 (i) 리스의 `leaseId` 일치 여부 재확인(펜싱 게이트), (ii) `cases` 행의 완료 상태 전이(`status: "completed"`), (iii) `reports` 행 INSERT, (iv) 자신의 `reservations` 리스 행 삭제, 이 4단계 전부를 **단일 DB 트랜잭션**(`db.transaction(async (tx) => {...})`) 안에서 순서대로 수행해야 한다 — 이는 더 이상 "가능한 한" 시도하는 목표 설계가 아니라 예외 없는 단일 요구사항이다. 이 프로젝트가 고정 사용하는 `@libsql/client@0.17.4`(원격 `libsql://` 연결에 사용되는 main 패키지 — 제약이 다른 `@libsql/client/web` 서브셋이 아님)의 `http.js` `transaction()` 구현과 `drizzle-orm@0.45.2`의 `libsql/session.js` `LibSQLSession.transaction()` 구현을 실제 소스 코드로 확인한 결과, 원격 HTTP 연결에 대해서도 진짜 인터랙티브 트랜잭션(실패 시 자동 rollback, 성공 시 commit)을 지원함이 이 SPEC 조사 범위에서 검증됐다(출처: unpkg.com/@libsql/client@0.17.4/lib-esm/http.js, unpkg.com/drizzle-orm@0.45.2/libsql/session.js, github.com/tursodatabase/libsql-client-ts CHANGELOG.md, tursodatabase.github.io/libsql-client-ts Client 인터페이스 문서). 운영 제약으로 libSQL은 열려 있는 인터랙티브 트랜잭션에 서버측 **5초 잠금 타임아웃**을 두므로, 트랜잭션 안의 4단계는 신속하게 실행되어야 한다(모두 단순 단일 쿼리이므로 여유가 충분하다) — 향후 구현자는 이 트랜잭션 안에 느린 작업을 넣지 않아야 한다. 일부 AI 검색 요약 결과가 "libSQL은 HTTP를 통한 인터랙티브 트랜잭션을 지원하지 않는다"고 주장하는 경우가 있으나, 이는 별도 제약이 있는 `@libsql/client/web` 패키지에만 해당하는 사실이며 이 프로젝트가 쓰는 main 패키지에는 해당하지 않는다 — 이 혼동으로 정상 동작하는 코드를 "고치려" 시도하지 않도록 주의를 남긴다. `reports` INSERT가 실패하면 트랜잭션 전체가 롤백되어야 하며, `cases`의 완료 상태 전이만 홀로 커밋된 불일치 상태가 남아서는 안 된다. **(3-보충) 완료 트랜잭션 실패 시 리스의 후속 명시적 해제(v0.5.0 신규)**: 위 롤백이 일어나면 그 롤백에는 트랜잭션에 포함됐던 `reservations` DELETE도 함께 되돌려지므로, 롤백 직후 시점에는 `reservations` 리스 행이 트랜잭션 시도 이전과 동일하게 여전히 존재한다 — 이는 트랜잭션 원자성이 의도한 대로 동작한 정상적인 결과다. 그러나 이 상태로 두면 같은 사용자가 리스 TTL(최소 330초)이 지날 때까지 재제출할 수 없다. 이를 방지하기 위해, 이 트랜잭션의 실패를 처리하는 catch/에러 처리 경로는 — 위 4단계 트랜잭션과는 별개로, 그 트랜잭션이 이미 실패해 롤백된 *이후에만* 실행되는 후속 단계로서 — 자신의 `ownerUserId` AND `leaseId`가 모두 일치할 때만 수행하는 펜싱된 `DELETE FROM reservations WHERE owner_user_id = ? AND lease_id = ?`를 실행해 리스를 명시적으로 해제해야 한다. 이 후속 해제가 성공하면 같은 사용자는 인위적인 추가 대기 없이 즉시 새 요청으로 새 리스를 재획득할 수 있어야 한다. 이 후속 해제 자체도 실패하는 드문 이중 실패(double-failure) 상황이면, 시스템은 그 오류를 로그로 남기고 최종 회복은 기존 TTL 만료 메커니즘((1) 참고)에 맡긴다 — 이 드문 경우에만 즉시 재제출이 차단되며, TTL로 상한이 있어 영구히 막히지는 않는다. **이 후속 해제 단계는 (3)의 4단계 단일 트랜잭션 요구사항(폴백 없음)을 완화하거나 대체하지 않는다** — 성공 경로의 4단계 원자성 요구사항은 그대로 유지되며, 이 후속 해제는 그 트랜잭션이 이미 실패해 롤백된 이후에만 실행되는 별개의 실패 복구 행동이다. **폴백 정책**(현재 불확실해서 두는 hedge가 아니라, 확인된 동작이 실제 구현에서 어긋날 경우의 대응 정책): run-phase 구현 중 이 확인된 동작과 실제로 다른 드라이버 회귀가 발견되어 이 트랜잭션 요구사항이 실제로 충족되지 않음이 확인되면, 그 사실 자체를 이 REQ의 FAIL로, 파일럿 준비 상태(REQ-PILOT-READY-016)를 NO-GO로 판정해야 한다 — 완화된 대안 설계로 조용히 우회하는 것은 허용되지 않는다. 트랜잭션 밖에서 리스 소유권을 별도로 확인하는 잔여 폴백 경로는 존재하지 않는다 — 소유권 재확인은 반드시 위 4단계와 같은 트랜잭션 안에서 수행된다. 이는 파일럿 규모(10명 테스터)에 맞춘 최소 가드이며, `submissionNonce` 컬럼 + unique index 방식(요청 페이로드 해시 기반 정밀 dedup, SPEC-PILOT-UX-001 iteration 3에서 기각됨, §Out of Scope 참고)을 재도입하지 않는다 — 매칭 키는 여전히 `ownerUserId`(사용자 단위)이지 페이로드 해시가 아니다. **기각된 대안**: 기존 `cases.status` 컬럼만 재사용하는 SELECT-후-INSERT 방식(무마이그레이션)은 진정한 경쟁 구간 해소를 제공하지 못해 이 REQ의 "DB 엔진 수준 원자성" 요구를 충족하지 않으므로 기각한다 — 기각 근거의 전체 기록은 plan.md §A 결정 1을 참고한다(이 SPEC의 요구사항 텍스트와 acceptance.md의 PASS 조건에는 이 대안이 유효한 구현 경로로 등장하지 않는다). | 사용자 지시(타임아웃/실패 후 재제출 시 중복 파이프라인 실행 방지, 최소 범위 + 크래시 복구 가능한 형태로 재설계), 외부 리뷰(SELECT-후-INSERT는 진정한 원자성을 제공하지 않는다는 지적 + 리스 기반 재설계 요구), Turso 공식 문서(docs.turso.tech §Client Access — SQLite 단일 writer 트랜잭션 모델) + Turso 공식 블로그(turso.tech/blog/concurrent-writes-on-turso-cloud — MVCC 엔진은 별도 opt-in `tursodb` 타입이며 이 프로젝트는 표준 `libsql://` 연결을 사용), `lib/cases/create-case.ts:38-72`(파이프라인 실행 이전에 기록되는 상태가 전혀 없음), `lib/db/schema.ts:75`(`cases.status` 컬럼) |

### G. 최소 구조적 로깅 (Minimal Structured Logging)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-008 | Ubiquitous | 사건 생성 critical path(`app/api/cases/route.ts`, `lib/cases/create-case.ts`, `lib/pipeline/index.ts`, `lib/ai/providers/gemini.ts`)는 최소한 (a) 요청 시작, (b) 파이프라인 단계 실패, (c) DB 쓰기 실패의 3가지 이벤트에 대해 구조적 로그를 출력해야 한다 — 새로운 로깅 라이브러리 의존성 도입 없이, 파일럿 규모에 맞는 최소 수준(예: console 기반)으로 충분하다. | 조사 세션 grep 확인(critical path 4개 파일 어디에도 애플리케이션 레벨 로그 출력 없음) |

### H. 최소 장애 대응 런북 (Minimal Incident Runbook)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-009 | Ubiquitous | 파일럿 테스터가 장애를 신고했을 때 운영자가 참고할 수 있는 짧은 장애 대응 런북이 존재해야 하며, 최소한 (a) REQ-PILOT-READY-008의 로그를 어디서 확인하는지, (b) 테스터에게 안전하게 재시도를 안내하는 방법, (c) 이슈를 누가 최종 책임지는지(triage 담당)를 포함해야 한다 — 기존 `.moai/docs/runtime-runbook.md`(로컬 개발 환경 절차)와는 별개의 문서 또는 별개 섹션이어야 한다. | 사용자 지시(장애 대응 절차 필요), 기존 런북이 로컬 개발 환경만 다룸(범위 불일치) |

### I. 실 Gemini 스모크 재검증 (Fresh Smoke Revalidation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-010 | When(이벤트 감지) | When 파일럿 런칭 준비 절차가 수행되면, 현재 main HEAD(이 SPEC의 run-phase 시점 기준) 또는 그 이후 커밋에 대해 실 Gemini 스모크 테스트(`.moai/reports/gemini-runtime-smoke-20260828.md`와 동일한 방법론 — 코드 임시 수정 없음, 관측기 기반 logical call count 확인)를 재실행하고 새 리포트로 남겨야 한다. 스모크는 최소한 다음 5가지를 개별적으로 확인·기록해야 한다: (a) Researcher/Skeptic/Verifier 3단계 각각의 실제 Gemini 호출 성공 여부, (b) `POST /api/cases`의 최종 HTTP 상태가 `201 Created`인지, (c) 응답에 포함된 결과가 실제로 DB(`reports` 테이블)에 영속화됐는지, (d) 그 DB 행을 별도 조회로 재확인할 수 있는지(응답 값과 DB 값의 일치), (e) 관측된 Gemini 실제 호출 횟수가 파이프라인이 요구하는 기대 호출 횟수(3회, 또는 재시도가 있었다면 그 실제 횟수)와 일치하는지 — 이 5가지 중 어느 하나라도 확인 없이 "스모크 통과"로 리포트에 기록해서는 안 된다. | 사용자 지시(마지막 실 Gemini 증거가 13일·4개 SPEC만큼 stale, 스모크 검증 항목 구체화), `.moai/reports/gemini-runtime-smoke-20260828.md`(2026-08-28 시점, `feat/SPEC-GEMINI-RUNTIME-001@fb23553` 기준 — 이후 SPEC-EVIDENCE-001/SPEC-FEEDBACK-001/SPEC-PILOT-UX-001/SPEC-PILOT-VISUAL-001/SPEC-UI-MIGRATION-001/SPEC-E2E-AUTH-STATE-001가 병합됨) |

### J. 데이터 취급 고지 정직성 (Data-Handling Disclosure Honesty)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-011 | Unwanted | 이 SPEC이 도입·수정하는 어떤 파일럿 온보딩 문구·UI 텍스트·문서도 `lib/validation/case-input.ts`의 입력 스키마가 사건 데이터의 완전한 비식별화를 "보장"한다고 주장하거나 암시해서는 안 된다. 정확한 진술은 **"세 자유 입력란에서 주민등록번호·휴대전화번호 형식은 검사하지만, 실명·주소·상세 정황 등 모든 식별정보 탐지나 자동 비식별화는 보장하지 않는다"**이다. | 사용자 지시(HARD constraint — 과대 주장 금지), `lib/validation/case-input.ts:17,20,26-31,36-43`(주민등록번호·전화번호 형식만 구조적으로 차단하며, 3개 자유 텍스트 필드에 타이핑된 임의의 식별정보는 스캔하지 않음을 코드로 직접 확인) |
| REQ-PILOT-READY-012 | Ubiquitous | 파일럿 온보딩 문구(사건 입력 화면 또는 그에 준하는 위치)는 다음 두 가지를 서로 다른 사실로서 각각 명시적으로 구분해 설명해야 한다: (i) **구조적 사실** — 주소·의료기록 원본 필드는 스키마에 애초에 정의되어 있지 않으며(`.strict()`), 주민등록번호·휴대전화번호는 형식 패턴으로 구조적으로 거부된다; (ii) **잔여 위험** — 그럼에도 3개 자유 텍스트 필드(`incidentDescription`/`diagnosisName`/`disabilityBodyPart`)에는 실명·주소·상세 정황 등 다른 식별정보를 사용자가 직접 타이핑해 넣을 수 있으며, 스키마는 이를 탐지·차단하지 않는다. 이 두 사실을 하나로 뭉뚱그려 "일부만 스캔된다"는 식으로 뭉개서는 안 된다. 아울러 테스터가 이미 합성(synthetic)이거나 이미 비식별화된 사례만 가져와야 한다는 책임을 명시적으로 진술해야 한다 — 현재 문구("비식별 요약만 입력하세요", `app/cases/new/page.tsx:56`)는 이 구분을 제공하지 않는다. | REQ-PILOT-READY-011과 동일 근거, `app/cases/new/page.tsx:56` 현재 문구 조사 |
| REQ-PILOT-READY-013 | Ubiquitous | 데이터 취급 문의를 위한 실제로 동작하는 연락 채널(이메일 주소 또는 그에 준하는 링크)이 추가되어야 한다 — 현재 로그인 화면 하단의 "고객지원" 링크(`app/login/login-form.tsx:14,131`)는 `aria-disabled="true"`로 비활성 상태이며 실제 채널에 연결되어 있지 않다. | `app/login/login-form.tsx:14,131` 조사 확인(비활성 placeholder) |
| REQ-PILOT-READY-014 | Ubiquitous | 사건 입력 화면(또는 그에 준하는 온보딩 위치)에는 올바르게 비식별화·합성 처리된 사건 입력의 구체적 예시가 최소 1건 포함되어야 한다. | 조사 세션 grep 확인(현재 저장소 전체에 비식별 입력의 구체적 예시가 존재하지 않음) |

### K. 재제출 가드의 보장 범위 및 실패 모드 재판정 (Concurrent-Execution Guard Scope & Failure-Mode Re-Assessment)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-015 | Ubiquitous | REQ-PILOT-READY-007의 **사용자별 동시 실행 가드**는 "동일 사용자당 동시 in-flight 파이프라인 최대 1개"라는 **동시성 제한(concurrency limit)**만 보장하며, "동일 논리적 제출의 재제출은 항상 동일한 결과를 반환한다"는 **제출 idempotency**는 보장하지 않는다 — 이 둘은 서로 다른 개념이며 혼동해서는 안 된다("idempotency 가드"라는 명칭은 부정확하므로 이 SPEC 전체에서 사용하지 않는다). v0.3.0의 리스(lease) 재설계로 4가지 실패 모드의 판정이 달라졌으며, 이 SPEC은 각 모드에 대해 실제 동작을 명시적으로 문서화해야 한다 — 해결됨으로 판정하려면 그 구체적 메커니즘을 제시해야 하고, gap으로 남기려면 "이 파일럿 규모(약 10명)에서는 의도적으로 다루지 않는 gap"임을 명시적으로 기록해야 하며, 다루지 않는 gap을 마치 해결된 것처럼 진술하는 것("재시도는 무제한으로 해도 중복 실행을 막는다"는 식의 과잉 보장 포함)은 금지된다: (a) **크래시/강제종료 복구 — 해결됨(TTL 기반 재획득)** — 파이프라인 실행 도중 프로세스가 강제 종료되면 리스(reservation) 행이 영구히 고착(orphan)되지 않는다. `expiresAt`을 지난 리스는 다음 요청이 조건부 UPSERT(`WHERE expires_at < now`)로 자동 재획득하므로, TTL(v0.4.0부터 `maxDuration`(300초) + 안전 여유 = 최소 330초) 경과 후 자연 회수된다 — 수동 조치가 필요 없다; (b) **완료 상태와 리포트 저장의 원자성 — 해결됨(동일 트랜잭션 하드 요구사항, 폴백 없음)** — REQ-PILOT-READY-007(3)에 따라 파이프라인 성공 시 리스 소유권 재확인·`cases` 행의 완료 상태 전이·`reports` 행 INSERT·리스 해제 4단계 전부가 단일 DB 트랜잭션으로 수행되어야 하며, 한쪽만 성공하는 불일치 상태는 허용되지 않는다. 이 동작은 v0.4.0에서 `@libsql/client@0.17.4`/`drizzle-orm@0.45.2`의 실제 소스 코드 확인으로 지원됨이 검증됐으므로 더 이상 불확실한 가정이 아니다 — run-phase 구현 중 이 확인된 동작과 실제로 다른 드라이버 회귀가 발견되면, 그 사실 자체가 이 REQ의 FAIL이자 REQ-PILOT-READY-016의 NO-GO 사유이며, 완화된 대안으로 조용히 우회하는 것은 허용되지 않는다; (c) **응답 유실 후 재제출 — 여전히 의도적으로 다루지 않는 gap** — 서버측에서는 실제로 성공했으나 클라이언트가 응답을 받지 못한 경우(네트워크 유실), 재제출 시 새 리스를 획득할 수 있다면(이전 리스가 이미 해제됐으므로) 파이프라인이 처음부터 다시 실행된다 — 이미 완료된 결과를 재사용하는 진정한 요청 수준 idempotency(페이로드 기반 dedup)는 이 SPEC 범위에서 제공하지 않으며, 이는 §Out of Scope에 명시된 의도적 gap이다; (d) **지연 도착 결과와 재시도 결과의 충돌 가능성 — 해결됨(leaseId 펜싱)** — REQ-PILOT-READY-007(2)/(3)의 펜싱된 해제와 완료-기록 펜싱 게이트에 따라, 만료 후 재획득된 새 리스가 존재하는 상태에서 원래(만료된) 시도가 뒤늦게 도착해도 그 `leaseId`는 더 이상 현재 리스와 일치하지 않으므로 해제도 완료-기록도 no-op으로 거부되어 새 실행의 상태를 덮어쓰지 못한다. | 사용자 지시(동시성 제한과 제출 idempotency를 별개로 다루고, 이 SPEC이 정확히 무엇을 보장하고 무엇을 보장하지 않는지 정직하게 진술할 것), 외부 리뷰(4개 실패 모드가 원 SPEC에서 누락됐다는 지적 + 리스 재설계로 인한 재판정 요구) |

### L. 최종 파일럿 준비 상태 판정 (Final Pilot-Readiness Determination)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-READY-016 | Ubiquitous | 파일럿을 실제 외부 테스터에게 여는 최종 결정은 **이 SPEC 자체의 구현 완료**와 **구조적으로 분리된** 별도의 판정 문서로 내려야 한다. `.moai/reports/pilot-ready-readiness-decision-<date>.md`(신규)는 다음 **7개 항목**(v0.4.0 — 기존 6개에서 Gemini 쿼터를 독립 항목으로 승격)을 각각 독립적으로 READY / BLOCKED / UNVERIFIED 중 하나로 판정해야 한다: (1) **호스팅 적합성** — 선택된 tier의 기간·ToS 적합성 **결정**(REQ-PILOT-READY-001)과, 실제 **배포 도메인** 환경에서 REQ-PILOT-READY-002가 요구하는 **최소 3회 이상**의 개별 측정 실행 중 **관측된 최대 처리 시간이 270초 이하**(선택된 tier의 `maxDuration`(300초) 상한 대비 약 30초의 안전 여유 — 측정된 파이프라인 로직 자체가 아니라 플랫폼 수준의 콜드스타트·네트워크 오버헤드를 흡수하기 위함, v0.5.0 정밀화)임을 보여주는 **실측 증거**(REQ-PILOT-READY-002) 둘 다가 있어야 READY — 결정만 있고 실측이 없거나, 실측 횟수가 3회 미만이거나, 관측된 최대 처리 시간이 270초를 초과하거나, 로컬(`next start`) 실행 결과만 있으면 UNVERIFIED; (2) **Gemini 쿼터**(REQ-PILOT-READY-003, 호스팅과 별개의 독립 항목) — 실제 AI Studio 쿼터 대시보드를 확인한 기록(확인 날짜·확인자 포함)과, 그 관측된 실제 한도를 근거로 실제 선택한 `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET` 값이 실제로 기록되어야 READY — **값이 코드 기본값 4와 같더라도, 4가 관측된 실제 한도의 약 70~80%에 해당한다는 근거가 함께 기록되어 있으면 정상적으로 READY 조건을 충족한다(v0.5.0 정정 — "기본값 4가 유지되면 자동 UNVERIFIED"라는 과도하게 엄격한 이전 표현을 교정)**; 대시보드 확인 자체가 수행되지 않은 채(근거 기록 없이) 기본값 4만 남아 있는 상태만이 UNVERIFIED; (3) 원격 DB(실제 원격 Turso 대상에 대한 마이그레이션/시드 실행); (4) 실 도메인 인증(실제 배포 도메인에 대한 로그인 동작); (5) 실 Gemini 스모크(REQ-PILOT-READY-010 재검증 — 반드시 실제 배포 도메인 기준이며, 로컬(`next start`) 실행 결과는 참고 증거일 뿐 이 항목의 READY 근거가 될 수 없다); (6) **서로 다른 사용자 동시 부하**(REQ-PILOT-READY-006) — 배치 안의 모든 요청이 성공적인 최종 상태에 도달하고 그 결과가 실제로 DB에 영속화·조회 가능하며, 처리되지 않은 429/5xx/타임아웃이 하나도 없어야 READY(기존 재시도/백오프로 흡수된 429는 무방); (7) **저장소/복구 검증**(REQ-PILOT-READY-007의 리스+트랜잭션 보장) — 실제 원격 Turso 대상에 대한 검증만 READY로 인정하며, 로컬/in-memory SQLite 결과만으로는 이 항목을 READY로 판정할 수 없다. **전체 게이트 규칙**: (1)의 tier/ToS 적합성 "결정" 자체(문서 판단으로 가능)를 제외하고, 원격 검증 또는 실측이 필요한 항목((1)의 타임아웃 실측 포함, 2~7) 중 하나라도 BLOCKED이거나 UNVERIFIED(실행되지 않음)이면 전체 판정은 **NO-GO**여야 한다 — "부분적으로 준비됨"이라는 절충 상태는 존재하지 않는다. 로컬 실행 결과만 있는 항목은 절대 READY로 판정할 수 없으며 UNVERIFIED로 남아야 한다(§ 로컬 대체 실행 증거의 위상과 동일 원칙, 이 문서에 한해 명시적으로 재확인). **run-phase 완료 시점 공정(v0.4.0 명시)**: 이 문서는 run-phase 착수 시점에는 7개 항목의 표와 판정 기준만 담은 템플릿으로 작성된다. run-phase의 **마지막 마일스톤**에서는 7개 항목 모두에 실제 READY/BLOCKED/UNVERIFIED 판정값과 전체 GO/NO-GO 판정이 채워져야 하며, 템플릿이 비어 있는 상태로 run-phase가 종료되는 것은 이 SPEC의 run-phase 완료 상태로 허용되지 않는다 — 단, 실제로 채워 넣은 판정 결과가 **NO-GO**인 것 자체는 정상적으로 허용되는 run-phase 완료 상태다(판정을 회피하는 것만 금지된다). | 사용자 지시(SPEC 완료와 파일럿 외부 착수 가능 여부를 명확히 구분할 것, 원격 필수 항목의 부분 통과 금지, 게이트 평가 자체를 run-phase 완료 조건으로 명시할 것) |

## Out of Scope

### Out of Scope — Vercel CI/CD 자동화

- 정식 Vercel CI/CD 배포 자동화 파이프라인 구축은 이 SPEC의 범위가 아니다 — 이 SPEC은
  선택된 tier(REQ-PILOT-READY-001)에서의 타임아웃 정합성 확인·문서화(REQ-PILOT-READY-002)까지만
  다룬다.

### Out of Scope — "최근 리서치" 패널의 processing/failed 상태 표시 (v0.4.0: 더 이상 적용되지 않음 — 기각된 옛 설계에서만 유효했던 우려)

- **이 항목은 v0.4.0 개정으로 재분류됐다.** 이 우려는 REQ-PILOT-READY-007의 옛 설계
  (기존 `cases.status` 컬럼 재사용, 파이프라인 실행 **이전**에 `processing` 상태를
  먼저 기록하는 방식 — v0.3.0에서 진정한 원자성을 제공하지 못해 이미 기각된 대안)에서만
  유효했다. v0.3.0/v0.4.0의 리스(lease) 설계에서는 `cases` 행이 파이프라인이 **성공**한
  뒤 완료 기록 트랜잭션 안에서만 INSERT되며(REQ-PILOT-READY-007(3) — 파이프라인이
  실패하거나 예외를 던지면 리스만 해제되고 `cases`/`reports`에는 아무것도 기록되지
  않는다), `processing`/`failed` 상태의 `cases` 행은 이 설계에서 **애초에 전혀 생성되지
  않는다**. 따라서 `app/cases/new/recent-research-panel.tsx`의 `STATUS_LABELS`가
  `pending`/`completed`만 매핑하고 `processing`/`failed`를 매핑하지 않는다는 사실은
  더 이상 실제 배포 리스크가 아니다 — 이 SPEC이 도입하는 어떤 경로로도 그 상태값을 가진
  행이 DB에 쓰이지 않기 때문이다. 이 항목은 현재 진행 중인 우려로 취급하지 않으며,
  코드 변경은 필요하지 않다.

### Out of Scope — 프로덕션 로그인 rate-limiting 강화

- 로그인 엔드포인트의 프로덕션 수준 rate-limiting 강화는 이 SPEC의 범위가 아니다.

### Out of Scope — Gold Dataset 추출/집계 도구

- 축적된 구조화 피드백을 Gold Dataset으로 추출·가공하는 도구는 이 SPEC의 범위가
  아니다(SPEC-FEEDBACK-001에서 이미 후속 SPEC으로 명시적으로 미뤄진 항목).

### Out of Scope — PostgreSQL 마이그레이션 실행

- Turso/libSQL에서 PostgreSQL로의 마이그레이션 실행은 이 SPEC의 범위가 아니다.

### Out of Scope — 대규모 evidence corpus 확장

- 신규 판례·약관 대량 추가 등 근거자료 코퍼스 확장은 이 SPEC의 범위가 아니다.

### Out of Scope — 테스터 모집/초대 및 파일럿 실제 실행

- 실제 테스터 모집, 초대, 파일럿의 실제 실행 자체(사람이 실제로 사건을 입력하고
  피드백을 제출하는 것)는 이 SPEC의 범위가 아니다 — 이 SPEC은 그 실행을 안전하게
  가능하게 하는 배포 준비까지만 다룬다.

### Out of Scope — 실 Gemini 기반 코퍼스 품질 평가

- 대표성 있는 사례 표본에 대해 실제 Gemini로 코퍼스 품질(예: `counterEvidenceIds`가
  항상 빈 배열인 현상의 원인 규명)을 평가하는 작업은 이 SPEC의 범위가 아니다.

### Out of Scope — 완료/피드백 집계 대시보드

- 사용자별 완료 현황이나 피드백 집계를 보여주는 대시보드는 이 SPEC의 범위가 아니다.

### Out of Scope — 분산 서버측(DB 기반) idempotency (nonce/unique-index 방식)

- SPEC-PILOT-UX-001 iteration 3에서 외부 독립 리뷰에 의해 명시적으로 기각된
  `submissionNonce` 컬럼 + unique index 방식(요청 **페이로드 해시** 기반 정밀 dedup —
  동일 페이로드의 재제출을 정확히 식별해 완료된 결과를 재사용하는 진정한 분산
  idempotency)은 이 SPEC에서도 재도입하지 않는다. REQ-PILOT-READY-007의 리스(lease) 기반
  구현은 페이로드 기반 dedup을 하지 않는다 — 매칭 키는 `ownerUserId`(사용자 단위)이지
  페이로드 해시가 아니며, "동일 사용자당 동시 1개"라는 동시성 제한만 제공한다. 리스가 DB
  제약(UNIQUE + 조건부 UPSERT)으로 원자성을 얻더라도, 이는 `submissionNonce` 방식이
  목표했던 페이로드 수준 정밀 dedup과는 다른, 훨씬 좁은 보장이다(REQ-PILOT-READY-015가
  이 차이와 그로 인해 여전히 dedup으로 다뤄지지 않는 실패 모드 — 응답 유실 후 재제출 —
  를 명시적으로 문서화한다).

## §3. 인수 조건 요약

인수 조건 전체(Given-When-Then 시나리오)는 `.moai/specs/SPEC-PILOT-READY-001/acceptance.md`에
정의한다(Tier M — 별도 파일).

## §4. 교차 참조

- `SPEC-RUNTIME-001` — `.moai/docs/runtime-runbook.md`의 출처, 환경변수 스코프 매트릭스 — REQ-PILOT-READY-004/005의 기반
- `SPEC-GEMINI-RUNTIME-001` — Gemini 파이프라인 실행 런타임(`withPipelineLock`, RateScheduler)의 출처 — REQ-PILOT-READY-002/003/006의 기반
- `SPEC-PILOT-UX-001` — 클라이언트측 single-flight 가드 및 기각된 DB-nonce idempotency 설계 이력의 출처 — REQ-PILOT-READY-007/015가 그 판단을 참고해 동시성 제한과 제출 idempotency를 구분
- `SPEC-EVIDENCE-001` / `SPEC-FEEDBACK-001` — REQ-PILOT-READY-010(스모크 재검증)이 stale 여부를 판단하는 기준이 되는, 마지막 스모크 이후 병합된 SPEC들
- `.moai/reports/gemini-runtime-smoke-20260828.md` — REQ-PILOT-READY-002/003/010의 직접적 실측 근거
- Turso 공식 문서(docs.turso.tech §Client Access) — REQ-PILOT-READY-007 리스(reservations) 테이블의
  단일 writer 트랜잭션 모델 근거(조건부 UPSERT의 구체적 구문 형태 자체는 별도 재검증되지 않은 한계로 명시)
- Turso 공식 블로그(turso.tech/blog/concurrent-writes-on-turso-cloud) — 이 프로젝트가 사용하는
  표준(비-MVCC) Turso Cloud 아키텍처와, 신규 opt-in MVCC `tursodb` 엔진이 별개임을 확인하는 근거
- Vercel 공식 문서(Fair Use Guidelines, Functions 실행 시간 문서, Pricing 페이지) —
  REQ-PILOT-READY-001/002의 Hobby/Pro tier 근거
- `.moai/reports/gemini-runtime-smoke-20260828.md` §실행 로그 5번 — REQ-PILOT-READY-007의
  리스 TTL 산정에 참고하는 로컬 happy-path 실측 처리 시간(30초) 기준선(v0.4.0부터 TTL 값
  자체는 이 실측이 아니라 `maxDuration`(300초) + 안전 여유로 산정됨 — §A 결정 1 참고)
- (v0.4.0 추가) `@libsql/client@0.17.4` 소스(unpkg.com/@libsql/client@0.17.4/lib-esm/http.js)
  + `drizzle-orm@0.45.2` 소스(unpkg.com/drizzle-orm@0.45.2/libsql/session.js) +
  `github.com/tursodatabase/libsql-client-ts` CHANGELOG.md +
  `tursodatabase.github.io/libsql-client-ts` Client 인터페이스 문서 — REQ-PILOT-READY-007(3)
  완료 기록 트랜잭션(리스 소유권 재확인 + `cases` INSERT + `reports` INSERT + 리스 해제
  단일 트랜잭션)이 원격 `libsql://` HTTP 연결에서도 실제로 지원됨을 확인하는 직접 근거
  (이 프로젝트가 사용하는 것은 `@libsql/client/web`이 아닌 main 패키지임에 유의)
