# Gemini 하이브리드 Research 라우팅 — 2026-09-13

## 결정

일반 사건의 Researcher는 `gemini-3.5-flash-lite`로 시작하고, 복합 쟁점 또는
Lite 품질 실패가 확인된 사건만 `gemini-3.6-flash`로 승격한다. Skeptic과 Verifier는
기존대로 Flash Lite를 사용한다.

## 승격 규칙

1. QueryPlanner가 `PRE_EXISTING_CONDITION`, `INJURY_DISEASE_RELATION`,
   `ADDITIONAL_CONFIRMATION_NEEDED` 중 하나를 생성하면 처음부터 Premium Researcher를
   사용한다.
2. 일반 사건의 Lite 결과에서 근거가 전달된 쿼리의 finding이 누락되거나 최종 claim이
   `INSUFFICIENT`이면 Premium Researcher로 한 번 재검토한다.
3. 근거자료 자체가 없는 쿼리의 `missingMaterials`는 모델 성능 문제가 아니므로 승격
   사유로 사용하지 않는다.
4. Premium 재검토 결과의 VERIFIED 수가 Lite보다 적거나 불확실성이 더 많아지면 Lite
   결과를 보존한다.

라우팅 및 승격 결정은 사건 원문 없이 구조화 로그
`pipeline_research_routed`/`pipeline_research_escalated`로 남긴다. 실제 모델별 HTTP
사용량은 기존 `gemini_request_observations`에서 확인한다.

## 여러 API 키 결정

Gemini 쿼터는 API 키가 아니라 Google Cloud 프로젝트 단위다. 같은 프로젝트의 키를
여러 개 등록해도 처리량은 늘지 않는다. 서로 다른 무료 프로젝트/계정을 429 이후
순환시켜 무료 쿼터를 합치는 기능은 공정 사용을 위한 제한을 우회하는 운영으로 해석될
위험과 키 관리·감사 복잡도가 있으므로 구현하지 않는다. 다중 키는 향후 동일 프로젝트의
무중단 secret 교체 또는 별도 환경 격리가 필요할 때만 검토한다.

## 검증

- 하이브리드 라우터 단위 테스트 7건
- 파이프라인 통합 라우팅 테스트 2건
- 기존 `lib/pipeline/index.test.ts` 회귀 테스트
- TypeScript `--noEmit`, ESLint
