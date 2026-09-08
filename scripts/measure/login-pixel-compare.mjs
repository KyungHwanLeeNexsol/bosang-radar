import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

// Row-luminance-profile measurement: for a given image + x-range, compute the
// average luminance of each row within that x-range, so text lines (lighter
// or darker than the surrounding background) show up as local peaks/valleys.
// This gives real, sampled pixel coordinates (not eyeballed) without needing
// any image-processing library beyond what Chromium's own canvas provides.
//
// Loading a file:// image directly into an about:blank page's `new Image()`
// is blocked by Chromium (opaque-origin document fetching a file:// resource).
// Wrapping the image in a small HTML file and navigating the page to THAT
// file's file:// URL puts the document and the image on the same file://
// origin, which Chromium permits.
let wrapperCounter = 0;
async function profileRows(page, imgPath, xStart, xEnd, yStart, yEnd) {
  wrapperCounter += 1;
  const wrapperPath = path.join(__dirname, `_measure_wrapper_${wrapperCounter}.html`);
  const imgFileUrl = pathToFileURL(imgPath).href;
  fs.writeFileSync(
    wrapperPath,
    `<!doctype html><html><body><img id="target" src="${imgFileUrl}"></body></html>`
  );
  await page.goto(pathToFileURL(wrapperPath).href);
  await page.waitForFunction(() => {
    const img = document.getElementById("target");
    return img && img.complete && img.naturalWidth > 0;
  });

  return page.evaluate(
    ({ xStart, xEnd, yStart, yEnd }) => {
      const img = document.getElementById("target");
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const w = xEnd - xStart;
      const rows = [];
      for (let y = yStart; y < Math.min(yEnd, img.naturalHeight); y++) {
        const data = ctx.getImageData(xStart, y, w, 1).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        rows.push(sum / w);
      }
      return { rows, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
    },
    { xStart, xEnd, yStart, yEnd }
  );
}

// Detect contiguous "text bands" — runs of rows whose luminance deviates from
// the local background baseline by more than `threshold`.
function detectBands(rows, baseline, threshold) {
  const bands = [];
  let start = null;
  for (let i = 0; i < rows.length; i++) {
    const isText = Math.abs(rows[i] - baseline) > threshold;
    if (isText && start === null) start = i;
    if (!isText && start !== null) {
      bands.push([start, i - 1]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, rows.length - 1]);
  return bands;
}

async function main() {
  const browser = await chromium.launch({
    args: ["--allow-file-access-from-files", "--disable-web-security"],
  });
  const page = await browser.newPage();

  const pencilPath = path.join(REPO_ROOT, "design", "exports", "03-테스터-로그인.png");
  const afterPath = path.join(
    REPO_ROOT,
    "docs",
    "evidence",
    "SPEC-UI-MIGRATION-001",
    "after-round5",
    "login-1440.png"
  );

  const pencil = await profileRows(page, pencilPath, 100, 700, 0, 1300);
  console.log("PENCIL naturalSize:", pencil.naturalWidth, "x", pencil.naturalHeight);
  const pencilBaseline =
    pencil.rows.slice(0, 40).reduce((a, b) => a + b, 0) / Math.min(40, pencil.rows.length);
  console.log("PENCIL baseline luminance (top rows):", pencilBaseline.toFixed(1));
  const pencilBands = detectBands(pencil.rows, pencilBaseline, 12);
  console.log(
    "PENCIL text bands (raw px y-ranges, /2 for CSS if 2x export):",
    pencilBands.map(([s, e]) => `${s}-${e} (CSS ${(s / 2).toFixed(0)}-${(e / 2).toFixed(0)})`)
  );

  const after = await profileRows(page, afterPath, 20, 500, 0, 900);
  console.log("AFTER naturalSize:", after.naturalWidth, "x", after.naturalHeight);
  const afterBaseline =
    after.rows.slice(0, 40).reduce((a, b) => a + b, 0) / Math.min(40, after.rows.length);
  console.log("AFTER baseline luminance (top rows):", afterBaseline.toFixed(1));
  const afterBands = detectBands(after.rows, afterBaseline, 12);
  console.log(
    "AFTER text bands (CSS px y-ranges — 1x capture, raw == CSS):",
    afterBands.map(([s, e]) => `${s}-${e}`)
  );

  for (const f of fs.readdirSync(__dirname)) {
    if (f.startsWith("_measure_wrapper_")) fs.unlinkSync(path.join(__dirname, f));
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
