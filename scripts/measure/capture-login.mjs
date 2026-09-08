import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3300/login", { waitUntil: "networkidle" });
  const outPath = path.join(
    REPO_ROOT,
    "docs",
    "evidence",
    "SPEC-UI-MIGRATION-001",
    "after-round5",
    "login-1440.png"
  );
  await page.screenshot({ path: outPath });
  console.log("saved:", outPath);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
