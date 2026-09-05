import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.EVIDENCE_PORT ? Number(process.env.EVIDENCE_PORT) : 3000;
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = process.env.EVIDENCE_OUT_DIR ?? path.join(__dirname, "..", "docs", "evidence", "SPEC-UI-MIGRATION-001", "after-round3");

// 주의: 이 스크립트는 Next.js 서버가 이미 실행 중임을 가정합니다.
// (pnpm build && pnpm start 를 먼저 실행하세요)
// 인증이 필요한 페이지는 /login 리다이렉트를 캡처합니다.

async function capture() {
  const browser = await chromium.launch();
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ];

  console.log(`캡처 대상: ${BASE_URL}/login`);
  console.log(`저장 경로: ${OUT_DIR}`);

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    const fileName = path.join(OUT_DIR, `login-${vp.width}.png`);
    await page.screenshot({ path: fileName, fullPage: false });
    console.log(`캡처 완료: ${fileName}`);
    await page.close();
  }

  await browser.close();
  console.log("캡처 완료");
}

capture().catch((err) => {
  console.error("캡처 실패:", err);
  process.exit(1);
});
