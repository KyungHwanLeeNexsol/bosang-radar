import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { validateEnv } from "./lib/env";

// @MX:ANCHOR: [AUTO] app 스코프 부팅 시점 fail-fast — REQ-RUNTIME-010이 요구하는
// 부팅 시점 검증의 유일한 지점(instrumentation.ts의 register() 훅)
// @MX:REASON: lib/db/client.ts의 구 동작(첫 DB 접근 시점 지연 실패)을 부팅 실패로
// 앞당기는 것이 이 SPEC의 목적이다(spec.md §1 WHY). pnpm build 단계(환경변수 없는
// 라우트 데이터 수집 단계)에서는 검증할 런타임 환경 자체가 없으므로 건너뛰되,
// 실제 런타임 부팅 훅에서는 항상 검증한다 — 검증 시점을 첫 요청 경계로 미루는
// 조정은 REQ-RUNTIME-010이 닫으려는 지연 실패를 재도입하므로 금지한다(design.md §6).
//
// [실측, M1] Next.js는 register() 실패를 프로세스 종료가 아니라 요청별 500 응답으로
// 흡수한다 — 실제로 `pnpm build && pnpm start`를 env 없이 실행해 관측한 결과,
// register()가 reject해도 HTTP 리스너는 계속 바인딩된 채 모든 요청에 500을 반환했다
// (프로세스가 "요청 수신 가능 상태"에 실제로 도달함). AC-RUNTIME-009는 그 상태
// 자체에 도달하지 않을 것을 요구하므로, 여기서 명시적으로 process.exit(1)을
// 호출해 프로세스를 종료한다. Vitest 실행 중(NODE_ENV=test)에는 프로세스를
// 종료하지 않고 예외만 전파한다 — 이 함수 자체의 단위 테스트가 가능해야 하기 때문.
export async function register() {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return;
  }

  try {
    validateEnv("app");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    // process.exit()은 Edge Runtime에서 지원되지 않는 Node.js API다(Turbopack
    // 빌드 경고). instrumentation.ts는 Node.js/Edge 양쪽에서 번들될 수 있으므로
    // Node.js 런타임에서만, 그리고 테스트 환경(NODE_ENV=test)이 아닐 때만 종료한다.
    if (process.env.NEXT_RUNTIME !== "edge" && process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw error;
  }
}
