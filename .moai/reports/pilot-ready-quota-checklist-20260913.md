# Gemini API 실제 쿼터 점검 — 2026-09-13

## 판정

**`READY (readiness 항목 2 — Gemini 쿼터)`**

프로젝트 운영자가 Google AI Studio의 실제 프로젝트별 비율 제한 화면을 확인했고,
관측된 RPM 한도의 약 70~80%로 애플리케이션 자체 예산을 설정했다.

## 확인 정보

- 확인일: 2026-09-13
- 확인자: 프로젝트 운영자(사용자)
- AI Studio 프로젝트 표시명: `Default Gemini Project`
- 등급: 무료 등급
- 기간: 이번 달
- 화면 상태: `모든 모델` 활성화
- 캡처 원본: 로컬 Downloads 폴더에만 보관(로그인 이메일이 보여 저장소에는 미포함)
- 캡처 SHA-256: `C5681798AA68F3CE1A7DFF300364A835EEA74407644C59E2F64480E2920AC4E7`

## 모델별 실제 한도와 관측 사용량

AI Studio 표는 `이번 달의 모델별 최대 사용량 / 한도` 형식으로 표시됐다.

| 모델 | RPM | TPM | RPD |
|------|-----|-----|-----|
| `gemini-3.6-flash` | 2 / 5 | 6.07K / 250K | 10 / 20 |
| `gemini-3.5-flash-lite` | 3 / 15 | 19.26K / 250K | 16 / 500 |

표의 왼쪽 값은 현재 최대 사용량이고 오른쪽 값이 실제 프로젝트 한도다. 따라서
Research 모델의 실제 한도는 5 RPM, Fast 모델의 실제 한도는 15 RPM이다.

## 선택한 자체 RPM 예산

| 역할 | 모델 | 실제 RPM 한도 | 설정 예산 | 한도 대비 | 최소 시작 간격 |
|------|------|---------------|-----------|-----------|----------------|
| Researcher | `gemini-3.6-flash` | 5 | 4 | 80% | 15초 |
| Skeptic/Verifier | `gemini-3.5-flash-lite` | 15 | 11 | 약 73.3% | 약 5.455초 |

Netlify의 production과 deploy-preview 컨텍스트에 아래 값을 설정하고 각 컨텍스트에서
읽기 재확인했다.

```text
GEMINI_RESEARCH_RPM_BUDGET=4
GEMINI_FAST_RPM_BUDGET=11
```

두 모델 ID가 다르므로 애플리케이션은 별도 `RateScheduler`를 사용한다. Fast 모델의
두 역할은 같은 모델과 스케줄러를 공유한다.

## RPD 운영 제한

실제 병목은 `gemini-3.6-flash`의 20 RPD다. 정상 사건 한 건은 Research 모델을 최소
1회 호출하므로 재시도가 없더라도 이론상 하루 최대 20건이며, 재시도가 발생하면 실제
가능 건수는 더 낮아진다. 파일럿 목표 30건을 하루에 몰아 실행하지 않고 최소 2일 이상
분산한다. 운영 권장치는 Research 재시도 여유를 남긴 **하루 15~18건 이하**다.

## 적용과 검증

- Netlify CLI가 두 컨텍스트의 저장값을 production `4/11`, deploy-preview `4/11`로
  반환했다.
- 환경변수 설정 후 commit `e84d777`을 푸시해 새 Deploy Preview
  `6aa6221cf800c80008113d33`을 생성했다. Netlify Deploy API에서 해당 배포의 state
  `ready`, plugin state `success`, `process-case-background` 포함을 확인해 적용 완료로
  확정했다.
- API key, 프로젝트 ID, 로그인 이메일은 이 리포트에 기록하지 않았다.

## 결론 범위

AC-PILOT-READY-003과 readiness 항목 (2)의 쿼터 확인·예산 결정 조건을 충족한다. 여러
서버리스 인스턴스의 합산 호출이 실제 한도 안에서 유지되는지는 readiness 항목 (6)의
서로 다른 사용자 동시 부하에서 별도로 검증한다.
