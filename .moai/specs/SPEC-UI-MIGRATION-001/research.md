# SPEC-UI-MIGRATION-001 — research.md

Tier L research artifact. Deep codebase analysis (read-only) performed before spec.md/plan.md authoring, establishing the exact baseline that REQ-019~022 (기능·데이터 보존) must not regress, and the direct-code-verification basis for the scope decisions in REQ-011/REQ-013.

## §1. 파일 인벤토리 (SPEC-PILOT-VISUAL-001 대비 신규/확장 대상)

| 경로 | 상태 | 역할 |
|------|------|------|
| `app/login/page.tsx`, `app/login/login-form.tsx` | 기존, 미스타일(현재 plain HTML input 수준) | 재스타일 대상(REQ-002) |
| `app/login/layout.tsx` | **신규** | 로그인 전용 폰트 격리 레이아웃(REQ-003) |
| `app/cases/layout.tsx`, `app/cases/case-shell-nav.tsx` | 기존(SPEC-PILOT-VISUAL-001이 구현) | 확장 대상(REQ-004~006) |
| `app/cases/[caseId]/page.tsx` | 기존(SPEC-PILOT-VISUAL-001이 재스타일) | 콘텐츠 정합성 확장(REQ-007, 009, 010, 011) |
| `app/cases/new/case-input-form.tsx` | 기존(SPEC-PILOT-VISUAL-001이 재스타일) | 우측 레일 확장(REQ-012~014) |
| `app/cases/[caseId]/feedback-form.tsx` | 기존(SPEC-PILOT-VISUAL-001이 재스타일) | Enum 라벨 확장(REQ-007, 008) |
| `app/cases/[caseId]/error.tsx` | 기존(404/사건 없음 변형만 보유) | 일반화 대상(REQ-015) |
| `components/evidence-item.tsx` | 기존 | Enum 라벨 확장 대상(REQ-007) |
| `lib/cases/` | 기존 디렉토리 | **신규 파일** 1개 추가(REQ-013) |

## §2. EvidenceType/QueryIssueType 영문 raw 노출 확인 (REQ-007~008 근거)

`lib/pipeline/types.ts:59` — `export type EvidenceType = "POLICY" | "PRECEDENT" | "DISPUTE_CASE" | "STATUTE" | "OTHER";`
`lib/pipeline/types.ts:33-42` — `QUERY_ISSUE_TYPES`(8개 값, 단일 SSOT const, `db/seed/evidence-seed-schema.ts`의 zod enum이 이 const를 import — SPEC-EVIDENCE-001 M1에서 확정된 패턴).

렌더 위치(영문 raw 값이 화면 텍스트로 그대로 노출되는 지점, grep 확인):
- `components/evidence-item.tsx:34-37` — evidenceType/issueTypes를 그대로 join하여 텍스트 출력
- `app/cases/[caseId]/page.tsx:314,506` — 동일 패턴
- `app/cases/[caseId]/feedback-form.tsx:313-317,433-434` — 동일 패턴

기존 해결 패턴(이미 프로젝트에 존재, 확장만 하면 됨): `feedback-form.tsx:60-76`의 `OVERALL_RATINGS`/`CLAIM_VERDICTS`/`EVIDENCE_VERDICTS` — `{value, label}` 형태의 배열로 영문 enum 값과 한글 라벨을 페어링한다. 이 SPEC은 동일 패턴을 `EvidenceType`(REQ-007)과 `QueryIssueType`(REQ-008)에도 적용한다.

## §3. `VerifiedClaim` 인터페이스 직접 조사 (REQ-011 스코프 축소 근거)

`lib/pipeline/types.ts:106-122`를 직접 읽어 확인:

```
export interface VerifiedClaim {
  summary: string;
  supportingEvidenceIds: string[];
  counterArguments: VerifiedCounterArgument[];
  status: "VERIFIED" | "INSUFFICIENT";
}

export interface VerificationResult {
  verifiedClaims: VerifiedClaim[];
  missingMaterials: MissingMaterial[];
  uncertainty: string[];
}
```

**결론**: `VerifiedClaim`은 claim 단위의 근거 부족 사유 필드를 보유하지 않는다 — `missingMaterials`(타입 `MissingMaterial[]`, `description`+`relatedIssueType` 필드)와 `uncertainty`(`string[]`)는 `VerificationResult`/`ResearchReport` **레벨**에 존재하며 개별 claim에 연결되어 있지 않다. 이는 오케스트레이터가 제기한 열린 질문("`VerifiedClaim` 필드 백업 여부를 확인 후 결정 또는 명시적 축소")을 직접 코드 조사로 해소한다: claim 카드별 "추가 확인 필요" 섹션은 신규 AI 파이프라인 필드 없이, 리포트 레벨 데이터에서 파생하거나 시각적으로 연결하는 방식으로만 구현 가능하다(design.md §5, spec.md REQ-011).

## §4. `getCaseForOwner` 신뢰 경계 확인 (REQ-013 근거)

`lib/cases/get-case-for-owner.ts` 및 그 테스트 `lib/cases/get-case-for-owner.test.ts`의 존재를 직접 확인했다. 이 함수는 세션 사용자 ID로 `cases` 테이블을 필터링하는 기존 신뢰 경계 패턴을 구현한다. REQ-013의 신규 "최근 리서치" 조회 함수는 이 패턴(동일 파일 또는 인접 파일에 함수 추가, 동일 세션 기반 필터링 방식)을 재사용해야 하며, 별도의 인증/인가 로직을 새로 설계하지 않는다.

## §5. 현재 사이드바/Topbar 구조 (REQ-004~006 근거)

SPEC-PILOT-VISUAL-001이 구현한 `case-shell-nav.tsx`는 정확히 3개 항목(사건 입력/리서치 리포트/전문가 피드백)만 렌더링하며, pathname 전용 결정론적 규칙(DB/API 조회 없음)으로 target을 계산한다 — 이 규칙은 REQ-004에서 무변경으로 명시된다. `app/cases/layout.tsx:56-58`의 사이드바 하단 사용자 블록은 현재 "담당 손해사정사"/"BORA 리서치" 하드코딩 문자열이다(REQ-005 근거). App Topbar는 현재 정적 타이틀만 렌더링하며(브레드크럼 없음), `grep -r "fixed\|sticky"`가 `app/`/`components/`에서 0건임을 재확인 — 현재도 비고정(non-fixed) 동작이며 REQ-006은 이 동작을 유지하면서 브레드크럼만 추가한다.

## §6. 로그인 화면 현재 구조 (REQ-002~003 근거)

`app/login/page.tsx`/`login-form.tsx`는 현재 미스타일 상태(plain HTML input, shadcn 미적용) — SPEC-PILOT-VISUAL-001이 명시적으로 범위 외로 남긴 영역이다. 5개 testid(`login-form`, `login-email`, `login-password`, `login-error`, `login-submit`)와 `authClient.signIn.email(...)` 호출 로직(Better Auth)이 존재하며, `e2e/auth.spec.ts`가 이 셀렉터들을 참조한다.

## §7. 공통 예외 화면 현재 구조 (REQ-015 근거)

`app/cases/[caseId]/error.tsx`는 App Router 오류 경계로, 단순 Card + 재시도 Button(`data-testid="case-error-retry"`, `reset()` 호출) 구조이며, "K02Nyo 사건을 찾을 수 없습니다"류 404/사건 없음 컨텍스트에서 `"CASE-2024-0999" · "ERR_CASE_NOT_FOUND"` 형식의 메타 텍스트를 포함한다(SPEC-PILOT-VISUAL-001에서 이미 재스타일됨). 나머지 5개 변형(권한없음/세션만료/일시오류/네트워크불가/준비중)은 현재 코드베이스에 대응 UI가 없다 — 이 SPEC이 신규로 일반화한다.

## §8. 테스트 요약 (보존해야 할 제약, SPEC-PILOT-VISUAL-001 §8 계승 + 신규 항목)

| 파일 | 검증 대상 동작 | 반드시 생존해야 할 셀렉터 |
|------|----------------|---------------------------|
| `e2e/auth.spec.ts` | 로그인 성공/실패 플로우 | `login-form`, `login-email`, `login-password`, `login-error`, `login-submit` |
| `case-input-form.test.tsx` | 대기 인디케이터, 단일 흐름 가드 등(SPEC-PILOT-VISUAL-001 §8 계승) | `case-submit`, `case-pending-indicator`, 4개 필드 testid |
| `page.test.tsx` | 요약 배너 DOM 순서, `claim-status`, evidence 렌더링(REQ-007로 텍스트만 변경, `data-status` 등 속성은 무변경) | `summary-banner`, `verified-claims`, `claim-status`(+`data-status`), `cited-evidence-empty`, `missing-materials`, `uncertainty` |
| `feedback-form.test.tsx` | 단일 흐름 가드, `<select>` 상호작용, 필드 오류 분리 `<p>`(REQ-007/008로 라벨 텍스트만 변경, `<select>` value는 영문 enum 유지) | `feedback-overall-rating`(id), `feedback-submit`, `feedback-success`, `feedback-section`(×≥5) 외 |
| `error.test.tsx` | 재시도 버튼이 `reset()` 호출(REQ-015 일반화 후에도 회귀 없이 유지) | `case-error-retry` |
| `e2e/case-flow.spec.ts`, `e2e/tenant-isolation.spec.ts` | 전체 플로우, owner-scope 격리(REQ-013 신규 조회도 동일 격리 원칙 적용) | 기존 셀렉터 전체 |

**중요 — Enum 라벨 회귀 방지 원칙**: REQ-007/008의 한글 라벨 매핑은 렌더링(화면 텍스트) 레이어에만 적용되고, `<select>` 요소의 `value`, `data-status` 등 내부 데이터 속성은 영문 enum 값을 그대로 유지해야 한다 — 이는 기존 테스트의 `select.value = "PRECEDENT"` 류 상호작용 패턴과 `data-status="INSUFFICIENT"` 류 assertion을 보존하기 위한 필수 원칙이다.

## §9. 결론 — 이 SPEC이 반드시 보존해야 할 기준선

REQ-019~022(spec.md §2 Group J)가 참조하는 정확한 기준선은 위 §1~§8이며, 특히:

- SPEC-PILOT-VISUAL-001이 확립한 App Shell·토큰·타이포그래피·3개 화면 구조(대체가 아닌 확장만)
- 로그인 화면의 Better Auth 로직 및 5개 testid
- `<select>`/`data-status` 등 내부 데이터 속성의 영문 enum 값(REQ-007/008 한글 라벨은 표시 레이어만)
- `VerifiedClaim`/`VerificationResult` 타입 계약(REQ-011은 이 계약을 확장하지 않음)
- `getCaseForOwner`의 owner-scope 신뢰 경계 패턴(REQ-013 신규 조회가 재사용)
- 사이드바 3항목 pathname 전용 링크 규칙(REQ-004는 항목 2개 추가만, 기존 3항목 로직 무변경)
- `error.tsx`의 `reset()` 재시도 동작(REQ-015 일반화 후에도 유지)

이 기준선을 변경하는 어떤 구현도 이 SPEC의 범위를 벗어난다.

## §10. Cross-references

- spec.md §3(보존·신규 테스트 계약) — 이 문서 §8의 testid 목록을 REQ-020 검증 근거로 인용
- design.md §2~§4(화면별 구조 매핑) — 이 문서의 현재 구조를 신규 시각 구조로 매핑하는 대상
- acceptance.md §기능·데이터 보존 그룹(Group J) — 이 문서 §9의 보존 항목을 검증 가능한 AC로 전환
- SPEC-PILOT-VISUAL-001/research.md — 3개 화면의 상위 기준선 조사 문서(이 SPEC이 계승·재확인)
