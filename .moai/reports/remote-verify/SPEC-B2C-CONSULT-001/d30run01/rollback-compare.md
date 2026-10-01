# 백업 대조 결과 (민감 정보 제외본)

원본은 로컬 백업 매니페스트 3개를 compare-manifests 도구로 비교한 출력이다. 원격 DB에는 접속하지 않고 이미 만들어 둔 로컬 매니페스트 파일끼리 비교했다(2026-10-01 생성). 운영 테이블의 행 수와 내용 해시는 공개 저장소에 올리지 않기 위해 일치 여부(true/false)만 적었다.

## 비교 1 — 지난 세션 기준선(2026-09-30 마이그레이션 직전) ↔ 이번 실행 전 백업 a

| 테이블 | 행 수·내용 SHA-256 일치 |
|---|---|
| __drizzle_migrations | true |
| account | true |
| allowed_testers | true |
| case_jobs | true |
| cases | true |
| evidence | true |
| feedback | true |
| gemini_request_observations | true |
| reports | true |
| reservations | true |
| session | true |
| user | true |
| verification | true |

- 스키마(테이블·인덱스·트리거) 해시 일치: true
- 같은 DB(주소 지문): true (6e5256b8)
- 판정: **ROLLBACK-TO-BASELINE: PASS**
- 종료 코드: 0

## 비교 2 — 이번 실행 전 백업 a ↔ 마이그레이션 직전 백업 b

| 테이블 | 행 수·내용 SHA-256 일치 |
|---|---|
| __drizzle_migrations | true |
| account | true |
| allowed_testers | true |
| case_jobs | true |
| cases | true |
| evidence | true |
| feedback | true |
| gemini_request_observations | true |
| reports | true |
| reservations | true |
| session | true |
| user | true |
| verification | true |

- 스키마(테이블·인덱스·트리거) 해시 일치: true
- 같은 DB(주소 지문): true (6e5256b8)
- 판정: **ROLLBACK-TO-BASELINE: PASS**
- 종료 코드: 0

## 비교 3 — 마이그레이션 직전 백업 b ↔ 정리·스키마 원상 복구 뒤 백업 c (원상 복구 증거)

| 테이블 | 행 수·내용 SHA-256 일치 |
|---|---|
| __drizzle_migrations | true |
| account | true |
| allowed_testers | true |
| case_jobs | true |
| cases | true |
| evidence | true |
| feedback | true |
| gemini_request_observations | true |
| reports | true |
| reservations | true |
| session | true |
| user | true |
| verification | true |

- 스키마(테이블·인덱스·트리거) 해시 일치: true
- 같은 DB(주소 지문): true (6e5256b8)
- 판정: **ROLLBACK-TO-BASELINE: PASS**
- 종료 코드: 0
