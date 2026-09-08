// e2e/comparison-docs-images.spec.ts
// SPEC-UI-MIGRATION-001 Round 5 — 비교 HTML 문서의 <img> 로드 검증.
// docs/evidence/SPEC-UI-MIGRATION-001/comparison-*.html 4개 파일을 file:// 로
// 직접 열어, 모든 <img> 요소가 실제로 로드됐는지(naturalWidth > 0) 확인한다.
// broken image가 0개인지가 이 spec의 유일한 통과 조건이다.
import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const EVIDENCE_DIR = path.join(process.cwd(), "docs", "evidence", "SPEC-UI-MIGRATION-001");

const COMPARISON_FILES = [
  "comparison-login.html",
  "comparison-case-input.html",
  "comparison-report.html",
  "comparison-feedback.html",
] as const;

test.describe("비교 HTML 문서 — 이미지 로드 검증(broken image 0개)", () => {
  for (const file of COMPARISON_FILES) {
    test(`${file} — 모든 <img>가 실제로 로드된다`, async ({ page }) => {
      const fileUrl = pathToFileURL(path.join(EVIDENCE_DIR, file)).href;
      await page.goto(fileUrl);

      const result = await page.evaluate(async () => {
        const imgs = Array.from(document.querySelectorAll("img"));
        const results = await Promise.all(
          imgs.map(
            (img) =>
              new Promise<{ src: string; ok: boolean }>((resolve) => {
                if (img.complete) {
                  resolve({ src: img.src, ok: img.naturalWidth > 0 });
                  return;
                }
                img.onload = () => resolve({ src: img.src, ok: img.naturalWidth > 0 });
                img.onerror = () => resolve({ src: img.src, ok: false });
              })
          )
        );
        return results;
      });

      const broken = result.filter((r) => !r.ok);
      expect(broken, `broken <img> found: ${JSON.stringify(broken)}`).toHaveLength(0);
      expect(result.length).toBeGreaterThan(0);
    });
  }
});
