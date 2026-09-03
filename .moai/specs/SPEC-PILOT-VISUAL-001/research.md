# SPEC-PILOT-VISUAL-001 — research.md

Tier L research artifact. Deep codebase analysis (read-only) performed before spec.md/plan.md authoring, establishing the exact baseline that REQ-019~021 (기능 보존) must not regress.

> plan-auditor iteration-1 감사(FAIL, 0.63) 대응: REQ-ID 참조를 spec.md 신 번호 체계로 갱신했고(D1/D2 REQ 삽입에 따른 재넘버링), §3에 `case-report` testid(D9) 관련 노트를 추가했다.

## §1. 파일 인벤토리

| 경로 | 역할 |
|------|------|
| `app/cases/new/page.tsx` | 서버 컴포넌트 셸 |
| `app/cases/new/case-input-form.tsx` | 클라이언트, 사건 입력 폼 전체 로직 |
| `app/cases/new/case-input-form.test.tsx` | 대응 테스트 |
| `app/cases/[caseId]/page.tsx` | 비동기 서버 컴포넌트, 리포트 조회+표시 |
| `app/cases/[caseId]/feedback-form.tsx` | 클라이언트, 피드백 폼 |
| `app/cases/[caseId]/actions.ts` | 서버 액션 |
| `app/cases/[caseId]/error.tsx` | 오류 경계 |
| `app/cases/[caseId]/page.test.tsx`, `feedback-form.test.tsx`, `error.test.tsx`, `actions.test.ts` | 대응 테스트 |
| `app/layout.tsx` | 루트 레이아웃 — 현재 헤더/nav/footer 없음, `<html lang="ko">`, 타이틀 "보상레이더" |
| `app/page.tsx` | 독립 최소 히어로(범위 외) |
| `app/login/` | 인증(범위 외) |
| `app/globals.css` | Tailwind v4 `@theme inline` 블록(shadcn "base-nova", `baseColor: neutral`) |

`app/cases/new/` 및 `app/cases/[caseId]/`에는 현재 `loading.tsx`가 없다.

## §2. `case-input-form.tsx` 현재 동작

4개 필수 controlled 필드(사고 경위 Textarea, 진단명 Input, 장해 부위 Input, 사고일 Input type=date). shadcn `Card` 래퍼, `max-w-xl`, `flex flex-1 flex-col items-center justify-center`로 중앙 정렬. `/api/cases`로 POST, 201 응답 시 `router.push`. `submitGuardRef`를 통한 단일 흐름 가드(실패 시에만 리셋). 필드별 오류는 `<p className="text-sm text-destructive">`로 표시. 대기 인디케이터는 `data-testid="case-pending-indicator" role="status" aria-live="polite"`. 제출 중에는 모든 입력이 `disabled`. 순수 shadcn(`Button`/`Card`/`Input`/`Label`/`Textarea`) + 인라인 Tailwind, 커스텀 CSS 없음.

## §3. `app/cases/[caseId]/page.tsx` 현재 동작

인증 가드된 비동기 서버 컴포넌트, 사건 없으면 `notFound()`. Drizzle 쿼리로 `evidenceById` Map 구성(evidence 테이블 필드만 SELECT). `citedEvidenceIds`, `verifiedCount`/`totalClaimCount`/`insufficientCount`는 인라인 계산. 레이아웃: `mx-auto max-w-3xl` shadcn Card 스택, 순서대로 —

1. `summary-banner`(DOM 순서상 "사건 요약"보다 먼저 렌더링되어야 함 — AC-005가 `compareDocumentPosition`으로 검증)
2. "사건 요약" 카드(정확한 leaf 텍스트 노드 매치 필요 — 자식 span/아이콘 래퍼로 감싸면 안 됨)
3. `review-targets`("검토할 담보 목록")
4. `verified-claims`("추가로 검토할 담보·근거자료·반대 논리") — 각 claim: `claim-status` pill(`data-status={claim.status}`, VERIFIED→"근거 확인" 스타일, else→"판단 불충분" 스타일), `renderEvidenceReference()` 공유 헬퍼(제목+evidenceType/issueTypes+선택적 `sourceUrl` 링크 — `target="_blank" rel="noopener noreferrer"`), 반대 논리(뒷받침/반박 중첩 하위 목록), `cited-evidence-empty` 빈 상태
5. `missing-materials`("추가 필요 자료")
6. `uncertainty`("판단 불충분 사유")
7. 피드백 폼 카드(리포트+reportId 있을 때만)

`page.tsx:131`에는 위 7개 항목과 별도로 `data-testid="case-report"`가 존재하나(D9), 어떤 기존 테스트(`page.test.tsx` 포함)도 이 testid를 참조하지 않는다. 이 SPEC은 이 testid를 렌더링하는 요소를 제거·개명하지 않으며(spec.md §3 Preserved Test Contracts에 완전성을 위해 등재), 향후 테스트 커버리지 확장의 여지를 남긴다.

리포트 없을 때 최상위 빈 상태 텍스트 "아직 생성된 리서치 리포트가 없습니다."

## §4. `feedback-form.tsx` 현재 동작

클라이언트 컴포넌트. 각 필드는 `data-testid="feedback-section"`으로 래핑(AC-012가 ≥5개 검증):

1. 전체 평가 `<select>`(id `feedback-overall-rating`, required) + 선택적 코멘트 Textarea
2. 누락된 쟁점 — 동적 배열 `missedIssues`, 각 행 `data-testid="feedback-missed-issue-row"`(이슈타입 `<select>`(`QUERY_ISSUE_TYPES`) + 설명 Textarea + 제거 버튼 `feedback-missed-issue-remove`), 추가 버튼 `feedback-missed-issue-add`
3. 개별 주장 평가(claim 존재 시) — 행 `feedback-claim-verdict`, verdict `<select>`(CORRECT/INCORRECT/NEEDS_MORE_EVIDENCE) + reasoning Textarea
4. 개별 근거자료 평가(cited evidence 존재 시) — 행 `feedback-evidence-verdict`, verdict `<select>`(USEFUL/WEAK/IRRELEVANT)
5. 실제 결과(선택) — 설명 Textarea + 날짜 Input

전체 raw native `<select>`(shadcn Select 미설치) — 시각적으로만 Input/Textarea와 매칭되게 Tailwind 클래스 스타일링. **테스트가 `select.value = ...; dispatchEvent(new Event("change"))`로 구동하므로 native `<select>` 유지가 필수**(swap 시 2개 이상 테스트 파일의 상호작용 패턴이 깨짐). 단일 흐름 가드(검증 실패/예외/reject 시에만 리셋). 제출 버튼 `feedback-submit`은 `isSubmitting || overallRating === "" || submissionSucceeded` 3개 독립 조건으로 비활성화(AC-010). 성공 상태 `feedback-success`. 필드 오류는 `fieldErrorMessages()`로 필드별 **분리된** `<p>` 엘리먼트(AC-011 — 하나의 문자열로 합치면 안 됨). 상단 정적 PII 경고 배너(기존 카피).

## §5. `error.tsx` 현재 동작

단순 Card + 재시도 Button `data-testid="case-error-retry"`, `reset()` 호출. 재스타일 위험 낮음.

## §6. Tailwind/shadcn 설정

Tailwind v4, CSS 기반 구성 전체가 `app/globals.css`(`@theme inline {...}` 블록, `tailwind.config.*` 파일 없음)에 존재. OKLCH 색상 토큰이 `:root`/`.dark` 아래(shadcn "base-nova" 스타일, `baseColor: neutral`, prefix 없음, 아이콘은 `lucide-react`). `--radius: 0.625rem` 루트, sm/md/lg/xl/2xl/3xl/4xl은 calc() 파생. 현재 브랜드 액센트 컬러 정의 없음(그레이스케일 + red/destructive만) — Pencil accent/ok/warn/danger/sidebar 토큰 추가는 신규 작업이며, 기존 `@theme inline` 매핑을 대체하는 것이 아니라 확장이다(이 SPEC이 건드리지 않는 `/`·`/login` 등의 UI는 기존 shadcn 베이스 토큰을 그대로 유지). 폰트는 현재 `app/layout.tsx`에서 `next/font/google`로 Geist Sans/Mono — Pretendard(`next/font/local` + `pretendard` npm 패키지)로 본문 텍스트를 교체하며, Manrope(`next/font/google`)는 BORA 워드마크가 스타일링된 텍스트로 렌더링될 경우에만 사용. 설치된 shadcn 컴포넌트는 `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`뿐 — Badge/Select/Alert 없음. 프리미티브 라이브러리는 `@base-ui/react`(Radix 아님).

## §7. 공유 레이아웃 / 브랜딩

`app/layout.tsx` 루트 레이아웃에는 헤더/nav/footer 래퍼가 없음 — `<html lang="ko">`, 페이지 타이틀 "보상레이더". `app/page.tsx`는 별도의 최소 중앙 정렬 히어로(범위 외 — 이 SPEC은 건드리지 않는다). `app/login/`은 존재하나 범위 외(건드리지 않는다). 기존 로고 asset 없음. 현재 공유 셸이 전혀 없으므로 신규 Sidebar+Topbar 앱 셸은 진정한 신규 구조 작업이며 restyle이 아니다 — plan.md는 이를 최고 리스크/최고 신규성 항목으로 명시하고, `app/cases/new/`와 `app/cases/[caseId]/`만 감싸는 신규 라우트 그룹 레이아웃 `app/cases/layout.tsx`로 범위를 한정한다(`app/layout.tsx`의 기존 동작은 폰트 import 교체 외 변경하지 않으며, `/`·`/login`·다른 라우트는 감싸지 않는다).

## §8. 테스트 요약 (보존해야 할 제약)

| 파일 | 검증 대상 동작 | 반드시 생존해야 할 셀렉터 |
|------|----------------|---------------------------|
| `case-input-form.test.tsx` | 대기 인디케이터, 제출 중 필드 비활성화, 단일 흐름 가드, 실패 시 가드 리셋, 네트워크 예외 오류 텍스트 | `case-submit`, `case-pending-indicator`, `case-incident-description`, `case-diagnosis-name`, `case-disability-body-part`, `case-incident-date` |
| `page.test.tsx` | 요약 배너 DOM 순서(AC-005), 집계 카운트, 정확한 N개 `claim-status` pill, evidenceType/issueTypes 텍스트, `sourceUrl` 링크 속성(AC-008), 빈 상태 testid | `summary-banner`, `verified-claims`, `claim-status`(+`data-status`), `cited-evidence-empty`, 정확한 leaf 텍스트 "사건 요약" |
| `feedback-form.test.tsx` | 단일 흐름 가드, 성공 상태에서도 제출 비활성 유지, 필드 오류별 분리 `<p>`(AC-011), 검증/예외 실패 시 가드 리셋, ≥5개 `feedback-section`(AC-012) | `feedback-overall-rating`(id), `feedback-submit`, `feedback-success`, `feedback-section`(×≥5), `feedback-missed-issue-add/-remove/-row`, `feedback-claim-verdict`, `feedback-evidence-verdict` |
| `error.test.tsx` | 재시도 버튼이 `reset()` 호출 | `case-error-retry` |
| `actions.test.ts` | 서버 액션 동작(시각 무관) | n/a |

## §9. 결론 — 이 SPEC이 반드시 보존해야 할 기준선

REQ-019~021(spec.md §2 Group G)이 참조하는 정확한 기준선은 위 §2~§8이다. 특히:

- 4개 사건 입력 필드 + 검증, 클라이언트 단일 흐름 제출 가드, 대기/로딩 상태, API/네트워크 실패 처리
- VERIFIED/INSUFFICIENT 시맨틱과 `claim-status` pill의 `data-status` 속성
- evidenceType/issueTypes/source/sourceUrl 표시, 안전한 외부 소스 링크 속성
- 피드백 페이로드/스키마, 피드백 단일 흐름 가드, `fieldErrors` 렌더링(메시지당 별도 `<p>`), 피드백 성공 상태, append-only 피드백
- `error.tsx` reset 동작
- PII/비식별 안내 카피, 보험금 지급 비확정 안전 문구

이 기준선을 변경하는 어떤 구현도 이 SPEC의 범위를 벗어난다.

## §10. Cross-references

- spec.md §3(Preserved Test Contracts) — 이 문서 §8의 testid 목록을 REQ-020 검증 근거로 인용
- design.md §4(화면별 구조 매핑) — 이 문서의 현재 구조를 신규 시각 구조로 매핑하는 대상
- acceptance.md §기능 회귀 체크리스트 — 이 문서 §9의 보존 항목을 검증 가능한 AC로 전환
