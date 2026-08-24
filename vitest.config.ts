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
    exclude: ["node_modules", ".next", ".claude/**", ".moai/**", ".git/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["node_modules/**", ".next/**", ".claude/**", ".moai/**", "**/*.config.{ts,mjs}"],
    },
  },
});
