# Netlify 배포 계층 및 실행 모드 판정 — 2026-09-13

## 판정

**Netlify Free 유지 — 호스팅 계층과 현재 비동기 실행 구조가 파일럿 규모에 적합하다.**

동기 Next.js 서버 핸들러는 사건을 DB job으로 접수하고 HTTP 202를 반환하며, 실제 Gemini
파이프라인은 Netlify Background Function에서 실행된다. 따라서 두 실행 경로의 상한을
혼동하지 않고 각각 판정한다.

## 3층위 실행시간 증거

1. **공식 게시 값**: Netlify 동기 함수 기본 상한은 60초이며 설정 변경이 불가능하다.
   Background Function은 최대 15분 동안 실행될 수 있다.
2. **상충하는 커뮤니티 관측**: 일부 사용자가 동기 함수에서 약 10초 근방 종료를
   보고했으나 Netlify 직원이 계정 공통 상한으로 확인한 값은 아니다. 이 값은 공식
   판정 기준으로 사용하지 않는다.
3. **이 프로젝트에 실제 적용되는 실행 모드**: Netlify Deploy API가 최신 Preview
   `6aa61dc9c330ca0008f566a4`에서 Next.js 서버 핸들러를 `stream`,
   `process-case-background`를 `background` invocation mode로 보고했다. 두 함수 모두
   Node.js 24.x, plugin state `success`이며 별도의 사용자 지정 제한은 없다. 따라서 현재
   배포에 적용되는 상한은 각 공식 invocation mode의 60초와 15분이다.

## 배포 대상

- Site: `musical-macaron-82feb3`
- Preview URL: `https://deploy-preview-10--musical-macaron-82feb3.netlify.app`
- 최신 측정 Deploy ID: `6aa61dc9c330ca0008f566a4`
- Commit: `76d811e894e69f646c99dd2ed42651f019fae9f2`
- Context: `deploy-preview`
- State: `ready`

## 안전 여유 정책

- 동기 접수 경로: 공식 60초에서 콜드스타트·네트워크 여유 10초를 제외한 **50초 이하**
- Background 경로: 공식 900초에서 Gemini 재시도와 플랫폼 오버헤드 여유 120초를 제외한
  **780초 이하**

실측 최대값은 동기 접수 3.761초, Background 완료 47.900초로 두 기준을 모두 크게
하회한다. 상세 개별 값은 `pilot-ready-timeout-measurement-20260913.md`에 기록했다.

## 출처

- [Netlify Functions default values](https://docs.netlify.com/build/functions/configuration/#default-values)
- [Netlify Background Functions](https://docs.netlify.com/build/functions/background-functions/)
- Netlify Deploy API `listSiteDeploys`의 실제 Preview 함수 메타데이터(2026-09-13 조회)

## 결론 범위

이 판정은 현재 파일럿의 호스팅 실행시간 적합성만 다룬다. Gemini 쿼터, 다중 사용자 부하,
원격 리스·복구 검증을 대신하지 않는다.
