import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFocus, argbToCss } from "../src/core/monet.js";

/** 构造一张纯色(或左右双色)的不透明测试图。 */
function bitmap(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = fill(x, y);
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { width, height, data };
}

test("analyzeFocus:均匀图像焦点居中", () => {
  const focus = analyzeFocus(bitmap(100, 100, () => [220, 40, 40, 255]));
  assert.ok(Math.abs(focus.x - 0.5) < 0.01);
  assert.ok(Math.abs(focus.y - 0.5) < 0.01);
  assert.equal(focus.fit, "cover");
});

test("analyzeFocus:远离均色的主体把焦点拉向自己", () => {
  // 左 1/4 红、右 3/4 黑:均色偏黑,红块权重占优,焦点应明显偏左。
  const focus = analyzeFocus(bitmap(100, 100, (x) => (x < 25 ? [255, 0, 0, 255] : [0, 0, 0, 255])));
  assert.ok(focus.x > 0.1 && focus.x < 0.35, `期望焦点偏左(0.1-0.35),实际 ${focus.x}`);
  assert.ok(Math.abs(focus.y - 0.5) < 0.01);
});

test("analyzeFocus:极端宽高比切换到 contain 避免过度裁剪", () => {
  assert.equal(analyzeFocus(bitmap(1000, 100, () => [0, 0, 0, 255])).fit, "contain");
  assert.equal(analyzeFocus(bitmap(100, 1000, () => [0, 0, 0, 255])).fit, "contain");
  assert.equal(analyzeFocus(bitmap(300, 300, () => [0, 0, 0, 255])).fit, "cover");
});

test("analyzeFocus:全透明图回退到中心", () => {
  const focus = analyzeFocus(bitmap(50, 50, () => [10, 20, 30, 0]));
  assert.equal(focus.x, 0.5);
  assert.equal(focus.y, 0.5);
});

test("argbToCss:不透明输出 hex,带透明度输出 rgba", () => {
  assert.equal(argbToCss(0xff3366cc), "#3366cc");
  assert.equal(argbToCss(0xff3366cc, 0.5), "rgba(51, 102, 204, 0.5)");
  assert.equal(argbToCss(0xff000000, 1), "#000000");
});
