# 실 Gemini 프로덕션 파이프라인 Smoke 테스트 — 2026-08-27

목적: `LLM_PROVIDER_MODE`를 deterministic으로 두지 않은 상태에서, 실제 Gemini API를 태운
Researcher → Skeptic → Verifier 3단계 파이프라인이 사건 생성부터 report DB 저장,
사건 상세 조회까지 끝까지 정상 동작하는지 1건 확인.

## 환경

- 브랜치: `main` (harness 재적용 PR #3 병합 직후)
- 로컬 DB: `file:./.tmp/local-dev.db` (마이그레이션 + 시드 완료, 상해/질병후유장해 근거 10건)
- 테스터 계정: `smoke@test.com` (비대화형 프로비저닝, `TESTER_PASSWORD` 환경변수 경로)
- 브라우저 자동화(claude-in-chrome) 미연결 — UI 캡처 대신 `curl`로 실제 API 경로
  (로그인 → `/api/cases` 생성)를 직접 호출해 검증

## 시도 로그

### 1차 — `gemini-2.5-flash`, 신규 발급 키 기준 (계정: 신규 유저)

이번 smoke에 사용한 신규 API key/project에서 `gemini-2.5-flash` 호출 시
`404 NOT_FOUND`를 관측함. 전체 Gemini 사용자에 대한 서비스 종료로 단정하지 않는다
(Google 안내: `models/gemini-3.6-flash` 사용 권장). `lib/ai/providers/gemini.ts:11`의
`DEFAULT_MODEL`이 하드코딩돼 있어 env로 우회 불가 — 사용자 승인 하에 이번 smoke 1회에
한해 `gemini-3.6-flash`로 임시 전환(코드 원복 완료, 커밋 없음).

### 2차 — `gemini-3.6-flash` 임시 전환

Researcher·Skeptic 단계는 성공했으나 Verifier 단계에서 `429 RESOURCE_EXHAUSTED` —
`gemini-3.6-flash`의 무료 티어 **분당 5회** 쿼터 초과 (`GenerateRequestsPerMinutePerProjectPerModel-FreeTier`).

### 3차 — 65초 대기 후 재시도 → **성공**

`POST /api/cases` → `201 Created`, 소요 41초, `caseId: 71815ffc-7602-420e-abd9-a51abb17a5ef`.
서버 로그에 429/500/schema 오류 없음.

## 결과 분석 (DB 직접 조회)

```
생성 query 수(reviewTargets): 8개
VERIFIED: 3개
INSUFFICIENT(근거 부족, missingMaterials): 5개

관련성 높은 근거: 5/5 (전부 발목 관절/기왕증/동일진단 별개질병 관련 seed 자료)
  - 발목 등 관절 후유장해 판정 기준 — 장해분류표 관절 기능 장해
  - 상해와 기왕증이 경합한 후유장해의 인과관계 및 감액 판단 — 대법원 2008다44689, 44696
  - 진단명이 같아도 발병 부위가 다르면 별개 질병 — 대법원 2015다218730, 218747
  등
엉뚱한 근거: 0개
근거자료 title/sourceUrl: DB에 정상 존재 (5건 중 4건 URL 있음, 1건은 evidence_type=OTHER라 URL 없음 — 스키마상 정상)
counterArguments: 3건 모두 존재, supportingEvidenceIds 채워짐
counterEvidenceIds: 3건 모두 빈 배열 — 반박 근거를 하나도 못 찾음 (아래 핵심 발견 참고)
missingMaterials(판단 불충분 사유): 5건, 별도 섹션에 정상 표시
금지 문구("보험금 지급 확률 95%" 등): 0건 — 확인 없음
```

## 핵심 발견

**Skeptic이 만든 모든 반론(counterArgument)에서 `counterEvidenceIds`가 항상 빈 배열이었다.**
반론 논리 자체는 탄탄하게 생성되지만, 그 반론을 뒷받침할 반박 근거를 현재 seed corpus
(10건)에서 하나도 찾지 못했다는 뜻이다. `counterEvidenceIds` 0은 실측 사실이다. 가능한
원인은 corpus 부족, retriever 후보 부족, Skeptic prompt semantics, 모델 선택 behavior
등이며, corpus 부족은 그 중 하나의 가설일 뿐 확정된 원인이 아니다 — 다음 작업으로 논의
중인 `SPEC-EVIDENCE-001`의 구체적 근거가 되는 실측 데이터.

## 부가 관찰 (수정하지 않음, 참고용)

- `GeminiProvider.withRetry`는 429(rate limit)만 재시도하고 503(모델 과부하)은 즉시
  예외를 던짐 — 일시적 과부하에 대한 복원력이 상대적으로 약함.
- `DEFAULT_MODEL`이 `lib/ai/providers/gemini.ts`에 상수로 고정돼 있어, 계정별/시점별
  모델 가용성 변화에 env 설정만으로 대응할 수 없음.

## 결론

실제 Gemini 프로덕션 경로(로그인 → 사건 생성 → Researcher/Skeptic/Verifier 실호출 →
report DB 저장 → 사건 상세 데이터)가 끝까지 정상 동작함을 확인했다. `SPEC-EVIDENCE-001`
(근거자료 corpus 확장) 착수 근거로 이번 smoke의 "반박 근거 0건" 발견을 활용할 수 있다.
