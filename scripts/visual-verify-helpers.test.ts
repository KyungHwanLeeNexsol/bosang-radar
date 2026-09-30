import { describe, expect, it } from "vitest";

import { HELPERS_SOURCE } from "./visual-verify-helpers";

// HELPERS_SOURCE는 브라우저에서 실행되는 자기완결 스크립트다. 이미지 로딩(canvas)
// 이외의 순수 픽셀 함수는 가짜 window 객체 위에서 그대로 평가해 Node에서 검증할 수 있다.
interface FakeImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BorderBoxResult extends Box {
  dividerCount: number;
}

interface VvHelpers {
  findCardBorderBox: (
    image: FakeImage,
    opts: {
      scale: number;
      hintTopCss: number;
      hintToleranceCss?: number;
      minRunCss?: number;
    }
  ) => BorderBoxResult | null;
}

function loadHelpers(): VvHelpers {
  const fakeWindow: { __vv?: VvHelpers } = {};
  new Function("window", HELPERS_SOURCE)(fakeWindow);
  if (!fakeWindow.__vv) throw new Error("HELPERS_SOURCE가 window.__vv를 정의하지 않았다");
  return fakeWindow.__vv;
}

const PAGE_BG = [0xf4, 0xf6, 0xf8];
const CARD_BG = [0xff, 0xff, 0xff];
const BORDER = [0xe2, 0xe7, 0xec];

function makeImage(width: number, height: number): FakeImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = PAGE_BG[0];
    data[i * 4 + 1] = PAGE_BG[1];
    data[i * 4 + 2] = PAGE_BG[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function fillRect(img: FakeImage, x0: number, y0: number, w: number, h: number, rgb: number[]) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
    }
  }
}

interface CardSpec {
  left: number;
  top: number;
  width: number;
  height: number;
  /** 행 구분선(가로줄) y 좌표들(이미지 px). */
  dividerYs: number[];
  /** 둥근 모서리 반지름(이미지 px) — 위·아래 테두리의 직선 구간은 양 끝에서 이만큼 짧다. */
  radius: number;
  /** 선 두께(이미지 px). 2배 export는 2다. */
  line: number;
}

/** 디자인 export와 같은 구조의 카드를 그린다: 위·아래 테두리는 직선 구간만, 구분선은 카드 폭 전체. */
function drawCard(img: FakeImage, c: CardSpec) {
  fillRect(img, c.left, c.top, c.width, c.height, CARD_BG);
  // 좌우 세로 테두리
  fillRect(img, c.left, c.top + c.radius, c.line, c.height - 2 * c.radius, BORDER);
  fillRect(
    img,
    c.left + c.width - c.line,
    c.top + c.radius,
    c.line,
    c.height - 2 * c.radius,
    BORDER
  );
  // 위·아래 테두리(직선 구간)
  fillRect(img, c.left + c.radius, c.top, c.width - 2 * c.radius, c.line, BORDER);
  fillRect(
    img,
    c.left + c.radius,
    c.top + c.height - c.line,
    c.width - 2 * c.radius,
    c.line,
    BORDER
  );
  // 구분선(카드 폭 전체)
  for (const y of c.dividerYs) fillRect(img, c.left, y, c.width, c.line, BORDER);
}

const M03B_LIKE: CardSpec = {
  left: 40,
  top: 496,
  width: 700,
  height: 352,
  dividerYs: [584, 672, 760],
  radius: 24,
  line: 2,
};

describe("findCardBorderBox — 디자인 PNG의 카드 바깥 테두리 상자 검출", () => {
  const vv = loadHelpers();

  it("2배 해상도 카드의 바깥 상자를 CSS px로 돌려준다(좌·상·폭·높이)", () => {
    const img = makeImage(780, 1210);
    drawCard(img, M03B_LIKE);

    const box = vv.findCardBorderBox(img, { scale: 2, hintTopCss: 248 });

    expect(box).toEqual({ left: 20, top: 248, width: 350, height: 176, dividerCount: 3 });
  });

  it("헤더 전폭 선·아래 버튼 테두리 같은 다른 선이 있어도 카드 상자에 섞이지 않는다", () => {
    const img = makeImage(780, 1210);
    // 헤더 하단 전폭 테두리
    fillRect(img, 0, 118, 780, 2, BORDER);
    drawCard(img, M03B_LIKE);
    // 카드 아래 알약 버튼(테두리 있는 흰 버튼): 위·아래 직선 구간이 카드 위·아래 테두리와 다른 폭
    drawCard(img, {
      left: 60,
      top: 900,
      width: 660,
      height: 96,
      dividerYs: [],
      radius: 48,
      line: 2,
    });

    const box = vv.findCardBorderBox(img, { scale: 2, hintTopCss: 248 });

    expect(box).toEqual({ left: 20, top: 248, width: 350, height: 176, dividerCount: 3 });
  });

  it("카드보다 30px(CSS) 큰 카드는 그 크기 그대로 측정된다 — 측정기가 차이를 뭉개지 않는다", () => {
    const img = makeImage(780, 1210);
    drawCard(img, { ...M03B_LIKE, height: 352 + 60, dividerYs: [584, 672, 760, 848] });

    const box = vv.findCardBorderBox(img, { scale: 2, hintTopCss: 248 });

    expect(box?.height).toBe(206);
    expect(box?.width).toBe(350);
  });

  it("카드 폭이 다르면 폭 차이가 그대로 드러난다", () => {
    const img = makeImage(780, 1210);
    drawCard(img, { ...M03B_LIKE, left: 20, width: 740 });

    const box = vv.findCardBorderBox(img, { scale: 2, hintTopCss: 248 });

    expect(box).toMatchObject({ left: 10, width: 370 });
  });

  it("힌트 근처에 테두리 선이 없으면 null(측정 공백을 통과로 취급하지 않는다)", () => {
    const img = makeImage(780, 1210);
    drawCard(img, M03B_LIKE);

    expect(vv.findCardBorderBox(img, { scale: 2, hintTopCss: 700 })).toBeNull();
  });

  it("구분선이 없어 폭을 확정할 수 없는 상자는 null이다", () => {
    const img = makeImage(780, 1210);
    drawCard(img, { ...M03B_LIKE, dividerYs: [] });

    expect(vv.findCardBorderBox(img, { scale: 2, hintTopCss: 248 })).toBeNull();
  });

  it("1배 해상도 이미지(선 두께 1px)도 같은 방식으로 측정한다", () => {
    const img = makeImage(390, 605);
    drawCard(img, {
      left: 20,
      top: 248,
      width: 350,
      height: 176,
      dividerYs: [292, 336, 380],
      radius: 12,
      line: 1,
    });

    const box = vv.findCardBorderBox(img, { scale: 1, hintTopCss: 248 });

    expect(box).toEqual({ left: 20, top: 248, width: 350, height: 176, dividerCount: 3 });
  });
});
