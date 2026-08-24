import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/config";

// getAuth()를 라우트 핸들러 함수 내부에서 지연 호출한다 — getAuth(auth 인스턴스)를
// 여기서 즉시 만들면 pnpm build의 라우트 페이지 데이터 수집 단계에서 실행돼
// TURSO_* 환경변수가 없는 빌드 환경에서 실패한다(lib/auth/config.ts 참고).
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler((request: Request) =>
  getAuth().handler(request)
);
