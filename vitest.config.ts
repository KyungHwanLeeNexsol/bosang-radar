import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
    // M2에서 better-auth(+ drizzle-orm 어댑터)를 처음 import하는 테스트가
    // 콜드 캐시 상태에서 5초 기본 타임아웃을 넘길 수 있다(transform 비용).
    testTimeout: 15000,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // e2e/**는 Playwright 전용 스펙(브라우저 필요) — pnpm test(Vitest)에서
    // 수집하지 않는다(REQ-RUNTIME-018 / AC-RUNTIME-016).
    exclude: ["node_modules", ".next", ".claude/**", ".moai/**", ".git/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // SPEC-B2C-DIAGNOSIS-001 M-fix — include 누락 시 v8이 이 Windows
      // 체크아웃에서 커버리지를 0/0으로 귀속시키는 문제가 있었다(동일
      // 커밋의 Linux/mac 실행에서는 95%/88%/92%/96%로 정상 측정됨).
      // exclude만으로는 v8이 계측 대상 파일 집합을 결정하지 못하는 OS별
      // 차이가 있으므로, 소스 파일을 명시적으로 include한다.
      include: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
      exclude: [
        "node_modules/**",
        ".next/**",
        ".claude/**",
        ".moai/**",
        "**/*.config.{ts,mjs}",
        "**/*.{test,spec}.{ts,tsx}",
      ],
    },
  },
});
