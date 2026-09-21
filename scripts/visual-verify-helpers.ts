// SPEC-B2C-DIAGNOSIS-001 D2 7차 — 브라우저 페이지 안에서 실행되는 이미지
// 분석 헬퍼 모음. Node 쪽(`scripts/visual-verify.ts`)은 이 소스를 문자열로
// 읽어 `page.addInitScript`로 주입하므로, 이 파일은 **외부 import 없이**
// 자기완결적이어야 한다(번들러를 거치지 않는다).
//
// 프로젝트에 이미지 라이브러리 의존성을 새로 추가하지 않기 위해(tech.md
// § 비용 태도 — 무료 tier 우선, 신규 의존성 최소화) PNG 디코딩과 픽셀
// 연산을 모두 Playwright가 띄운 Chromium의 `<canvas>`에 위임한다.

export const HELPERS_SOURCE = String.raw`
(() => {
  // ── 이미지 로딩 ────────────────────────────────────────────────────
  async function loadImageData(dataUrl, targetWidth, targetHeight) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const w = targetWidth ?? img.naturalWidth;
    const h = targetHeight ?? img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  // ── 지배 배경색 추정 ───────────────────────────────────────────────
  // 최빈 색을 배경으로 본다. 디자인 export와 구현 캡처 모두 배경이 화면의
  // 과반을 차지하므로 안정적이다. 색을 양자화하면(예: 5bit) 흰색 #ffffff가
  // #f8f8f8로 7만큼 밀려, 낮은 잉크 임계값에서 배경 전체가 잉크로 잡히는
  // 오류가 난다 — 24bit 원색 그대로 센다.
  function dominantColor(imageData, region) {
    const { width, data } = imageData;
    const x0 = region ? region.left : 0;
    const y0 = region ? region.top : 0;
    const x1 = region ? region.left + region.width : imageData.width;
    const y1 = region ? region.top + region.height : imageData.height;
    const counts = new Map();
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * width + x) * 4;
        const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    let best = 0;
    let bestKey = 0xffffff;
    for (const [key, n] of counts) {
      if (n > best) {
        best = n;
        bestKey = key;
      }
    }
    return { r: (bestKey >> 16) & 255, g: (bestKey >> 8) & 255, b: bestKey & 255 };
  }

  // ── 가장자리 배경 프로브 ───────────────────────────────────────────
  // D2(8차) — 화면 전체의 최빈색은 "배경색"의 대리값으로 못 쓴다. 흰 카드
  // 면적과 회색 페이지 배경 면적이 비슷해지면 실제 배경이 그대로여도 최빈색
  // 판정이 뒤집히고(7차 M01-C가 이 경우였다), 반대로 콘텐츠 아래쪽이 통째로
  // 다른 색이어도 최빈색은 그대로일 수 있다.
  //
  // 그래서 콘텐츠가 절대 침범하지 않는 좌우 가장자리 세로 띠만 샘플링하고,
  // 최빈색과 **그 색이 띠에서 차지하는 비율(균일도)** 을 함께 돌려준다.
  // 색만으로는 못 잡는 "아래쪽 절반만 흰색" 결함을 균일도가 잡는다.
  function edgeBackground(imageData, opts) {
    const { width, height, data } = imageData;
    const stripWidth = opts.stripWidth ?? 8;
    const top = Math.max(0, Math.floor(opts.top ?? 0));
    const bottom = Math.min(height, Math.ceil(opts.bottom ?? height));
    const counts = new Map();
    let total = 0;
    for (let y = top; y < bottom; y++) {
      for (let strip = 0; strip < 2; strip++) {
        const x0 = strip === 0 ? 0 : width - stripWidth;
        for (let x = x0; x < x0 + stripWidth; x++) {
          const i = (y * width + x) * 4;
          const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
          counts.set(key, (counts.get(key) ?? 0) + 1);
          total++;
        }
      }
    }
    let best = 0;
    let bestKey = 0xffffff;
    for (const [key, n] of counts) {
      if (n > best) {
        best = n;
        bestKey = key;
      }
    }
    return {
      r: (bestKey >> 16) & 255,
      g: (bestKey >> 8) & 255,
      b: bestKey & 255,
      coverage: total > 0 ? best / total : 0,
      sampled: total,
      region: { top: top, bottom: bottom, stripWidth: stripWidth },
    };
  }

  function isInk(data, i, bg, threshold) {
    return (
      Math.abs(data[i] - bg.r) > threshold ||
      Math.abs(data[i + 1] - bg.g) > threshold ||
      Math.abs(data[i + 2] - bg.b) > threshold
    );
  }

  // ── 행(row) 밴드 분할 ──────────────────────────────────────────────
  // 배경과 다른 픽셀이 minInkPerRow개 이상인 행을 "잉크 행"으로 보고,
  // 잉크 행이 quietGap 이상 연속으로 끊기는 지점에서 밴드를 나눈다.
  function segmentBands(imageData, opts) {
    const { width, height, data } = imageData;
    const bg = opts.bg ?? dominantColor(imageData);
    const threshold = opts.threshold ?? 18;
    const minInkPerRow = opts.minInkPerRow ?? 2;
    const quietGap = opts.quietGap ?? 8;
    const region = opts.region ?? { left: 0, top: 0, width, height };

    const rowHasInk = [];
    for (let y = region.top; y < region.top + region.height; y++) {
      let n = 0;
      for (let x = region.left; x < region.left + region.width; x++) {
        if (isInk(data, (y * width + x) * 4, bg, threshold)) {
          n++;
          if (n >= minInkPerRow) break;
        }
      }
      rowHasInk.push(n >= minInkPerRow);
    }

    const bands = [];
    let start = -1;
    let gap = 0;
    for (let i = 0; i < rowHasInk.length; i++) {
      if (rowHasInk[i]) {
        if (start < 0) start = i;
        gap = 0;
      } else if (start >= 0) {
        gap++;
        if (gap >= quietGap) {
          bands.push({ top: region.top + start, bottom: region.top + i - gap });
          start = -1;
          gap = 0;
        }
      }
    }
    if (start >= 0) {
      bands.push({ top: region.top + start, bottom: region.top + rowHasInk.length - 1 - gap });
    }

    return bands.map((band) => {
      const box = tightBox(imageData, bg, threshold, {
        left: region.left,
        top: band.top,
        width: region.width,
        height: band.bottom - band.top + 1,
      });
      return {
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        cols: segmentColumns(imageData, bg, threshold, box, opts.colGap ?? 12),
      };
    });
  }

  // ── 밴드 내부 열(column) 분할 ──────────────────────────────────────
  // 같은 행에 나란히 놓인 요소(예: 검색창 + CTA)를 개별 박스로 분리한다.
  function segmentColumns(imageData, bg, threshold, band, colGap) {
    const { width, data } = imageData;
    const colHasInk = [];
    for (let x = band.left; x < band.left + band.width; x++) {
      let n = 0;
      for (let y = band.top; y < band.top + band.height; y++) {
        if (isInk(data, (y * width + x) * 4, bg, threshold)) {
          n++;
          if (n >= 2) break;
        }
      }
      colHasInk.push(n >= 2);
    }
    const cols = [];
    let start = -1;
    let gap = 0;
    for (let i = 0; i < colHasInk.length; i++) {
      if (colHasInk[i]) {
        if (start < 0) start = i;
        gap = 0;
      } else if (start >= 0) {
        gap++;
        if (gap >= colGap) {
          cols.push({ left: band.left + start, right: band.left + i - gap });
          start = -1;
          gap = 0;
        }
      }
    }
    if (start >= 0) {
      cols.push({ left: band.left + start, right: band.left + colHasInk.length - 1 - gap });
    }
    return cols.map((col) =>
      tightBox(imageData, bg, threshold, {
        left: col.left,
        top: band.top,
        width: col.right - col.left + 1,
        height: band.height,
      })
    );
  }

  // ── 영역 안에서 잉크를 꽉 감싸는 최소 박스 ─────────────────────────
  function tightBox(imageData, bg, threshold, region) {
    const { width, data } = imageData;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = region.top; y < region.top + region.height; y++) {
      for (let x = region.left; x < region.left + region.width; x++) {
        if (isInk(data, (y * width + x) * 4, bg, threshold)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (minX === Infinity) return null;
    return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  // ── 밝은 박스(모달/시트) 경계 찾기 ─────────────────────────────────
  // 01-A2/M01-A2는 반투명 backdrop 뒤로 배경 페이지가 비쳐 일반 세그먼트가
  // 내부를 한 덩어리로 뭉갠다. 먼저 불투명 흰 박스의 경계를 찾는다.
  function findBrightBox(imageData, minBrightness) {
    const { width, height, data } = imageData;
    const rowRuns = [];
    for (let y = 0; y < height; y++) {
      let run = 0;
      let bestRun = 0;
      let bestEnd = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] >= minBrightness && data[i + 1] >= minBrightness && data[i + 2] >= minBrightness) {
          run++;
          if (run > bestRun) {
            bestRun = run;
            bestEnd = x;
          }
        } else {
          run = 0;
        }
      }
      rowRuns.push({ len: bestRun, left: bestEnd - bestRun + 1, right: bestEnd });
    }
    const maxLen = Math.max(...rowRuns.map((r) => r.len));
    if (maxLen < 40) return null;
    const minLen = maxLen * 0.9;
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
      if (rowRuns[y].len >= minLen) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    const rows = rowRuns.filter((r) => r.len >= minLen);
    const left = Math.min(...rows.map((r) => r.left));
    const right = Math.max(...rows.map((r) => r.right));
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
  }

  // ── 합성 이미지(overlay / diff) ────────────────────────────────────
  async function composeOverlay(designUrl, implUrl, w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const impl = new Image();
    impl.src = implUrl;
    await impl.decode();
    ctx.drawImage(impl, 0, 0, w, h);
    const design = new Image();
    design.src = designUrl;
    await design.decode();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(design, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  }

  async function composeDiff(designUrl, implUrl, w, h) {
    const a = await loadImageData(designUrl, w, h);
    const b = await loadImageData(implUrl, w, h);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const out = ctx.createImageData(w, h);
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2])
      );
      out.data[i] = 255;
      out.data[i + 1] = 255 - d;
      out.data[i + 2] = 255 - d;
      out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return canvas.toDataURL("image/png");
  }

  async function normalizeDesign(dataUrl, w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  }

  window.__vv = {
    loadImageData,
    dominantColor,
    edgeBackground,
    segmentBands,
    tightBox,
    findBrightBox,
    composeOverlay,
    composeDiff,
    normalizeDesign,
  };
})();
`;
