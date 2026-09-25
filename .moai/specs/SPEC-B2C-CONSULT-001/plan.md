# Plan — SPEC-B2C-CONSULT-001

## 결정 우선순위 (Decision Review Priority)

아래 마일스톤은 **되돌리기 어려운 결정부터** 순서를 매겼다(데이터 모델 변경 · 신규 타입 인터페이스 · 사용자 UX 흐름을 먼저, 기계적·리팩터 성격 단계를 뒤로). 리뷰 시 이 순서로 먼저 확인할 것을 권장한다.

1. **M1 — 상담 데이터 계약** (`lib/consult/types.ts`+`schema.ts`): 이후 폼·API·DB 스키마가 전부 이 계약에 의존한다. `resultId` opaque 참조 결정과 서버-비신뢰 필드 목록이 여기서 확정된다.
2. **M2 — DB 스키마·서버 API 계약** (`lib/db/schema.ts` `consultations` 테이블, `POST /api/consultations`): 한 번 마이그레이션이 적용되면 컬럼 구조 변경 비용이 커진다. 중복/멱등성 판정 방식(§8)도 이 단계에서 DB 제약으로 고정된다.
3. **M3 — 02→03 CTA 활성화 + 핸드오프/draft 채널** (`result-cta-bar.tsx` 확장, `lib/consult/draft.ts`, `lib/diagnosis/flags.ts` 확장): 채널 전달 메커니즘(URL 쿼리)과 플래그 독립성 결정이 여기서 확정되며, 이후 UI 마일스톤이 이 계약 위에서 조립된다.
4. **M4~M6**: 화면 컴포넌트 조립·접근성·테스트 — 위 세 결정이 고정된 뒤에는 상대적으로 되돌리기 쉬운 조립 단계다.

## §A. Context

- 선행 SPEC: SPEC-B2C-DIAGNOSIS-001(완료, 01 화면), SPEC-B2C-RESULT-001(완료, 02 화면) — `components/result/result-cta-bar.tsx`의 4개 CTA가 `aria-disabled` "준비 중" stub 상태로 남아 있다(REQ-B2CRESULT-023이 명시적으로 이 SPEC의 몫으로 남긴 경계).
- 배포 기준선: PR #19(`e0b5bab`)가 02 배포·검증 완료(main 병합). 이 SPEC은 01/02의 배포 워크플로·기존 15화면 `pnpm visual:verify` 기준선을 수정하지 않는다.
- 기존 재사용 가능 자산: `lib/diagnosis/{types,schema,aggregate,handoff,flags}.ts`(전체 읽기 전용 참조), `components/diagnosis/use-media-query.ts`(768px), `components/ui/*`, `zod` 4.4.3, `drizzle-orm`/`drizzle-kit`(Turso/libSQL), `lib/logging/safe-error.ts`.
- 디자인 SSOT: `design/MIGRATION-PLAN.md` §2③(화면 목록), §6(동의 구조), §7(03 상태 계약) + `design/exports/03-*.png`·`M03-*.png`(9개 대상 화면) + `design/internal/DEV-ONLY-상담-신청-동의-상세-구조.png`(동의 상세 구조 참고, 문구는 플레이스홀더).
- 이 SPEC은 이 프로젝트에서 **처음으로** 서버 API route handler와 신규 DB 테이블을 추가하는 SPEC이다(01/02는 순수 프론트엔드 + `sessionStorage`였다) — 참고할 실제 route handler 관례는 삭제된 B2B `app/api/cases/route.ts`(`git show 257d033^:...`)에서만 확인 가능했다(`research.md` §3).

## §B. Known Issues (미결정 · 리스크)

| 항목 | 상태 | 비고 |
|---|---|---|
| 담보 매칭 로직(정적 규칙 vs AI) | 미결정 (`tech.md`) | 이 SPEC은 관여하지 않음 — 03은 이미 계산된 `computeAggregate` 결과만 요약 표시 |
| `resultId` 서버 측 검증 불가 | **결정됨(잔여 위험으로 수용)** — `DiagnosisResult`가 서버에 영구 저장되지 않으므로(02도 `sessionStorage`만 사용) 03이 처음으로 진단 결과를 복제 저장하지 않는 한 `resultId`를 대조 검증할 원본이 없다. 이 SPEC은 `resultId`를 opaque 문자열로만 취급하고(형식 검증만) 위변조 방지(서명 등)는 범위 밖으로 둔다 | `design.md` §9.2, `progress.md` Open Decisions |
| 03/03-A2 별도 화면 vs 단일 컴포넌트 state | **결정됨** — 단일 컴포넌트의 `channel` state 두 값으로 구현(`design.md` §1 D1). Mobile에 `M03-A2`가 애초에 존재하지 않는다는 사실이 이 해석을 뒷받침 | `design.md` §1 |
| `MIGRATION-PLAN.md` §7의 단순 OR 중복 판정 vs 이 SPEC의 AND+멱등성 분리안 | **결정됨(편차 있음, 사용자 확인 요청)** — 단순 OR는 과차단 위험이 커 `resultId`+정규화 연락처 AND로 변경하고 기술적 멱등성을 별도 계층으로 분리한다 | `design.md` §8, Open Decisions |
| CTA 전달 메커니즘(쿼리 파라미터 vs sessionStorage draft vs 기타) | **결정됨** — URL 쿼리 파라미터(`?channel=`) 단일 메커니즘, 위변조 값은 `kakao` 폴백 | `design.md` §3 |
| `ENABLE_CONSULT_FLOW` 플래그와 02 게이트의 독립성 | **결정됨** — 02 게이트(`shouldRenderDiagnosis`)와 별개 플래그, 상호 의존 없음 | `design.md` §4 |
| Rate limiting 구체 알고리즘 | **미결정, run-phase 위임** — 경량 카운터 방식의 존재만 계약(§9.1), IP 또는 `resultId` 기준 세부 구현은 run-phase가 확정 | `spec.md` § Out of Scope |
| 동의 상세 실제 법무 문구 | **미결정, 이 SPEC 범위 밖** — `{}` 플레이스홀더 구조만 구현, 실제 문구는 법무 검토 후 별도 반영 | `design.md` §1 D5, Open Decisions |
| "등록정보 확인"·"기존 신청 상태 확인"·"신청 취소·정보 삭제 문의" 실제 목적지 | **결정됨** — 기존 `result-footer.tsx`의 `href="#"` + "준비 중" 선례를 그대로 따름(죽은 링크 방지, 준비 중 명시) | `design.md` §1 D4, §10 |

## §C. Pre-flight

- [x] `git status` clean 확인, `plan/SPEC-B2C-CONSULT-001` 브랜치가 `origin/main`(`a096a26`) 기준으로 이미 생성·체크아웃됨(본 plan-phase 착수 전 완료)
- [x] `design/exports/`의 9개 대상 PNG(03/03-A2/03-B/03-C/03-D, M03/M03-B/M03-C/M03-D) + `design/internal/DEV-ONLY-상담-신청-동의-상세-구조.png` 직접 열람 완료(본 plan-phase에서 완료)
- [ ] `pnpm ls @base-ui/react zod drizzle-orm drizzle-kit` — 필요 의존성 전부 이미 설치되어 있음을 run-phase 착수 시 재확인(신규 의존성 추가 없이 기존 스택으로 구현)
- [ ] SPEC-B2C-DIAGNOSIS-001 + SPEC-B2C-RESULT-001의 기존 15화면 `pnpm visual:verify` 기준선이 여전히 PASS 상태인지 run-phase 착수 직전 재확인
- [ ] 후속 run-phase 시작 전, `origin/main`이 이 plan PR 병합 후의 최신 상태인지 재확인
- [ ] `lib/db/schema.ts`의 기존 12개 테이블 정의 무결 확인(추가만 할 것, 기존 테이블 구조를 건드리지 않음)

## §D. Constraints

이 SPEC의 run-phase 산출물 범위는 4갈래로 나뉜다.

- **① 프로덕션 애플리케이션 코드**: `app/consult/`, `app/api/consultations/`, `components/consult/`, `lib/consult/`(모두 신규 디렉터리)만 새로 추가한다. **기존 파일 중 정확히 5개만 최소 확장**이 허용된다 — `components/result/result-cta-bar.tsx`(stub → 실제 네비게이션), `components/diagnosis/diagnosis-flow.tsx`(새 진단 시작 시 `clearConsultationDraft()` 호출 한 줄 추가), `lib/diagnosis/flags.ts`(`computeConsultFlags(env)` export 추가), `scripts/visual-verify.ts`(`SCREENS` 배열에 9개 항목 추가), `lib/db/schema.ts`(`consultations` 테이블 정의 추가). 이 5개 외의 기존 01/02 컴포넌트·모듈은 **손대지 않는다**. `lib/pipeline/`, `lib/ai/`는 손대지 않는다(REQ-B2CFOUND-007 decision gate 유지). 신규 의존성 추가 없이 기존 스택(zod/drizzle-orm/@base-ui)으로 구현한다.
- **② 테스트**: 위 프로덕션 코드에 대응하는 단위·컴포넌트 테스트 및 Playwright `e2e/consult-flow-03.spec.ts`(신규) — 기존 `e2e/diagnosis-flow-01.spec.ts`/`e2e/diagnosis-flow-02.spec.ts`는 수정하지 않는다(회귀 검증 대상으로만 재실행). `scripts/visual-verify.ts`의 `SCREENS` 배열에 9개 항목을 **추가**한다(기존 15개 항목은 수정하지 않는다).
- **③ 문서**: `.moai/` SPEC 산출물 및 프로젝트 문서(`product.md`/`structure.md` Roadmap 갱신).
- **④ DB**: `pnpm db:generate`로 신규 마이그레이션 파일 1개(`consultations` 테이블 CREATE + 복합 UNIQUE 인덱스)를 생성한다 — 기존 마이그레이션 파일(`0000`~`0008`)은 수정하지 않는다. 배포 워크플로·환경변수(`ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY`)는 손대지 않는다.
- `DiagnosisResult` 전체를 `consultations` 테이블에 복제 저장하지 않는다 — `resultId`만 opaque 참조로 저장한다(`design.md` §9.2).
- `components/consult/*` 컴포넌트 소스에 케이스 특정 동적 문구를 리터럴로 하드코딩하지 않는다 — 동의 문구·안내 문구는 `lib/consult/` 공용 상수 모듈에서만 온다.
- 서버는 클라이언트가 제출한 `consultationId`/`createdAt`/`updatedAt`/`applicationStatus`/`consentVersion`을 신뢰하지 않는다(REQ-B2CCONSULT-017).
- 클라이언트의 사전 중복 체크를 권위 있는 판정으로 취급하지 않는다 — 모든 중복/멱등성 판정은 DB 제약 기반이다(REQ-B2CCONSULT-020).
- 로그·오류 응답에 `name`/`contact` 원본 값을 포함하지 않는다(REQ-B2CCONSULT-018).
- `design/claimradar-ui.pen`, `design/exports/`, `design/internal/`은 읽기 전용 참고 자료다 — 수정하지 않는다.

## §E. Self-Verification (plan-phase)

- [x] GEARS 표기 요구사항 25건 작성, Tier L 상한(25) 충족
- [x] Out of Scope 섹션에 5개 `### Out of Scope —` 하위 제목 + 각 bullet 작성
- [x] 기존 코드베이스 조사(`lib/diagnosis/`, `components/result/`, `lib/db/`, `lib/env.ts`, 삭제된 `app/api/cases/route.ts`, `scripts/visual-verify.ts`) 완료 — `research.md`
- [x] 디자인 export 9개 + DEV-ONLY 동의 상세 구조 1개 직접 열람 완료
- [x] AC 25건 작성, REQ-AC 1:1 대응 확인(`acceptance.md`)
- [ ] plan-auditor 독립 검토 — 이번 plan-phase 커밋 이후 별도 단계에서 실행(이 문서는 그 실행 전 상태)

## §F. Milestones (후속 `/moai run SPEC-B2C-CONSULT-001`의 실행 계획)

아래 마일스톤은 모두 **후속 run-phase가 실행할 계획**이며, 이번 plan-phase는 문서만 작성한다. 순서는 결정 되돌리기 난이도 기준(데이터 계약 → 서버/DB → UX 흐름 → 조립 → 접근성/테스트 → 검증)이다.

1. **상담 데이터 계약 SSOT** — `lib/consult/types.ts`에 `ConsultationChannel`/`ConsultationConsent`/`ConsultationRequest`/`ConsultationSubmitResult`/`ConsultationDraft` 정의(`design.md` §6). `lib/consult/schema.ts`에 제출용 strict zod 스키마(`ConsultationRequestSchema`, 필수 동의 `z.literal(true)`, `channel`별 `preferredCallTime` 필수 여부 `.refine`)와 draft용 loose 스키마(`ConsultationDraftSchema`)를 정의한다. `lib/consult/phone.ts`에 `normalizePhone`/`formatPhoneDisplay`/`maskPhone` 순수 함수 + 단위 테스트(정규화 실패 케이스 포함, REQ-B2CCONSULT-011).
2. **DB 스키마 + 서버 API** — `lib/db/schema.ts`에 `consultations` 테이블 추가(id/resultId/channel/name/contactNormalized/preferredCallTime/consent 3종/consentVersion/applicationStatus/idempotencyKey UNIQUE/createdAt/updatedAt + `(resultId, contactNormalized)` 복합 UNIQUE 인덱스, `design.md` §9.2). `pnpm db:generate`로 마이그레이션 생성. `app/api/consultations/route.ts`(`POST` 핸들러) — 요청 검증(`ConsultationRequestSchema.safeParse`) → 비즈니스 중복 사전 조회 → `idempotencyKey` 원자적 삽입(`ON CONFLICT DO NOTHING RETURNING`) → HTTP 상태-응답 매핑(`design.md` §9.1) → PII 없는 구조적 로그(`console.info`, `toSafeErrorMeta`). 통합 테스트: 동시 동일 `idempotencyKey` N개 요청 → 정확히 1개 레코드(REQ-B2CCONSULT-021), 비즈니스 중복 케이스, 검증 실패 케이스, 서버 오류 케이스.
3. **02→03 CTA 활성화 + 핸드오프/draft 채널** — `lib/diagnosis/flags.ts`에 `computeConsultFlags(env)` 추가(`design.md` §4). `components/result/result-cta-bar.tsx`의 4개 stub을 `shouldRenderConsult` 게이트 뒤 실제 `<Link href="/consult?channel=...">`로 전환(플래그 꺼짐 시 기존 stub 동작 유지). `lib/consult/draft.ts`(`writeConsultationDraft`/`readConsultationDraft`/`clearConsultationDraft`, SSR 가드, 손상 시 조용한 빈 draft 폴백, `design.md` §2.3). `components/diagnosis/diagnosis-flow.tsx`에 `clearConsultationDraft()` 호출 한 줄 추가. `app/consult/page.tsx`(Server Component 셸, `computeConsultFlags` 게이트 + `<Suspense>` + `<ConsultView />`).
4. **채널 선택 · 입력 폼 · 동의 컴포넌트** — `components/consult/consult-view.tsx`(마운트 시 `readDiagnosisHandoff()` + `readConsultationDraft()` 조회 → 3갈래 분기: empty→no-data / invalid→error / valid→폼 표시). `consult-summary-card.tsx`(`computeAggregate` 재사용 요약). `consult-channel-selector.tsx`(라디오, `channel` state). `consult-form.tsx`(이름/연락처/연락 희망 시간, `channel==="phone"` 조건부 필수). `consult-consent-group.tsx`(필수 2 + 선택 1, Desktop Modal/Mobile Bottom Sheet 상세 보기, focus trap). `consult-submit-bar.tsx`(이중 제출 방지, `aria-busy`).
5. **성공 · 중복 · 실패 상태** — `consult-success.tsx`(03-B/M03-B), `consult-duplicate.tsx`(03-C/M03-C, PII 최소 노출), `consult-failure.tsx`(03-D/M03-D, 저장 여부 미단정 + 동일 idempotencyKey 재시도 + 입력 보존). `consult-no-data.tsx`/`consult-error.tsx`(핸드오프 부재/오류). 제출 성공 시 `clearDiagnosisHandoff()` + `clearConsultationDraft()` 호출(REQ-B2CCONSULT-025).
6. **접근성 · 반응형 · unit/component 테스트** — Desktop 720px 폼 폭, Mobile sticky 하단 CTA, 오류 요약 + 첫 오류 필드 포커스, `aria-describedby`/`aria-live`, 키보드 전체 조작성, `prefers-reduced-motion`. Vitest: 데이터 계약/전화번호 정규화/draft/CTA 채널 매핑/동의 게이트/폼 검증/상태 컴포넌트별 렌더링.
7. **E2E + 시각 정합성 확장 + 문서 동기화** — `e2e/consult-flow-03.spec.ts` 신규(02 fixture 경유 → CTA 클릭 → 03 도착 → 채널 전환 → 폼 입력 → 동의 → 제출 → 성공/중복/실패 각 분기 → "진단 결과로 돌아가기"). `scripts/visual-verify.ts`의 `SCREENS` 배열에 9개 화면 정의 추가(기존 15개 항목 수정 금지, `design.md` §12). `pnpm visual:verify` 실행해 기존 15화면 PASS 유지 + 신규 9화면 PASS 확인(총 24화면). `product.md`/`structure.md` Roadmap 갱신(03 완료 반영).

## §G. Anti-Patterns (이 SPEC에서 피해야 할 것)

- `DiagnosisResult`를 위한 03 전용 새 인계 채널을 만들지 않는다 — `readDiagnosisHandoff()`를 그대로 재사용한다.
- 03과 03-A2를 별도 라우트로 만들지 않는다 — 단일 컴포넌트의 `channel` state로 구현한다.
- 중복 판정을 `MIGRATION-PLAN.md` §7의 단순 OR(`resultId` 또는 연락처)로 구현하지 않는다 — `resultId`+정규화 연락처 AND + 별도 `idempotencyKey` 멱등성 계층으로 구현한다.
- 클라이언트 사전 중복 체크를 권위 있는 판정으로 취급하지 않는다 — 반드시 DB 제약(트랜잭션 내 원자적 연산)으로 판정한다.
- `DiagnosisResult` 전체를 `consultations` 테이블에 복제 저장하지 않는다 — `resultId`만 opaque 참조로 저장한다.
- 클라이언트가 보낸 `consultationId`/`createdAt`/`updatedAt`/`applicationStatus`/`consentVersion`을 신뢰하지 않는다 — 서버가 항상 자체 생성·스탬프한다.
- 마케팅 동의(선택 ③)를 제출 버튼 활성화 조건에 포함하지 않는다.
- 동의 상세 뷰를 여는 것만으로 체크박스를 자동 체크하지 않는다.
- 제3자 제공 동의를 활성화 상태로 노출하지 않는다.
- 마스킹되지 않은 원시 연락처를 성공/중복 화면에 그대로 렌더링하지 않는다.
- 로그·오류 응답에 `name`/`contact` 원본 값을 포함하지 않는다.
- 실패 상태에서 서버 저장 여부를 단정하는 문구("저장되었습니다" 등)를 쓰지 않는다 — "저장 여부를 단정하지 않는" 중립 문구만 사용한다.
- 실패 후 재시도 시 새 `idempotencyKey`를 발급하지 않는다 — draft에 저장된 기존 키를 재사용한다.
- "기존 신청 상태 확인"·"신청 취소·정보 삭제 문의" CTA에 실제로 존재하지 않는 목적지로 가짜 링크를 걸지 않는다 — 기존 `result-footer.tsx` 선례처럼 명시적 "준비 중" 스텁으로 구현한다.
- 기존 `e2e/diagnosis-flow-01.spec.ts`/`e2e/diagnosis-flow-02.spec.ts`와 `scripts/visual-verify.ts`의 기존 15개 화면 정의를 수정하지 않는다 — 오직 추가만 한다.
- `DIAGNOSIS_ENGINE_READY`를 이 SPEC의 코드에서 `true`로 전환하지 않는다.
- 동의 상세 뷰에 `design/internal/`의 `{}` 플레이스홀더 토큰이나 "DEV ONLY" 배지·주석을 그대로 사용자 화면에 노출하지 않는다.

## §H. Cross-References

- `.moai/specs/SPEC-B2C-CONSULT-001/design.md` — 데이터 타입, 서버 API/DB 계약, 중복/멱등성 설계, 상태 화면 계약, 디자인 대조 상세
- `.moai/specs/SPEC-B2C-CONSULT-001/research.md` — 코드베이스·기존 관례 조사 근거
- `.moai/specs/SPEC-B2C-CONSULT-001/acceptance.md` — Given-When-Then 수용 기준
- `.moai/specs/SPEC-B2C-RESULT-001/` — 선행 SPEC(02 화면, 완료) — `result-cta-bar.tsx`/`flags.ts`/`aggregate.ts`/`handoff.ts` 확장·재사용 대상
- `design/MIGRATION-PLAN.md` §2③(화면 목록), §6(동의 구조), §7(03 상태 계약)
