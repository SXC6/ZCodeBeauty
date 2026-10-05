import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToRgb, hsvToHex, rgbToHsv } from "../src/panel/colorUtil.js";

// 面板快捷色块的 16 个预设(与 panelScript.ts 的 .zb-sw data-c 一一对应)。
// 0.7.3 的 hsvToHex typo(扇区分数少除 60)就是在这份清单上暴露的:
// 色相一过 60°,应用色与色块完全对不上。
const CHIPS = [
  "#ffffff", "#000000", "#8c8c8c", "#434343",
  "#ff4d4f", "#ff7a45", "#fadb14", "#d4b106",
  "#52c41a", "#389e0d", "#13c2c2", "#1890ff",
  "#0050b3", "#722ed1", "#eb2f96", "#ffb8c6",
];

test("hsvToHex:六象限主色锚点", () => {
  assert.equal(hsvToHex(0, 1, 1), "#FF0000");
  assert.equal(hsvToHex(60, 1, 1), "#FFFF00");
  assert.equal(hsvToHex(120, 1, 1), "#00FF00");
  assert.equal(hsvToHex(180, 1, 1), "#00FFFF");
  assert.equal(hsvToHex(240, 1, 1), "#0000FF");
  assert.equal(hsvToHex(300, 1, 1), "#FF00FF");
  // 360° 回绕到第一扇区
  assert.equal(hsvToHex(360, 1, 1), "#FF0000");
});

test("hsvToHex:0.7.3 扇区分数 typo 的回归用例", () => {
  // h=90 落在第二扇区:f = h/60 - floor(h/60) = 0.5,输出 (128,255,0)。
  // 带 typo 的版本算出 f = 90 - floor(90) = 0,会错误输出 #FFFF00。
  assert.equal(hsvToHex(90, 1, 1), "#80FF00");
});

test("hsvToHex:黑/白/灰(无色相)不产生乱码", () => {
  assert.equal(hsvToHex(0, 0, 0), "#000000");
  assert.equal(hsvToHex(0, 0, 1), "#FFFFFF");
  assert.equal(hsvToHex(217, 0, 0.5), "#808080");
});

test("16 个快捷色 hex→hsv→hex 往返无损", () => {
  for (const chip of CHIPS) {
    const [r, g, b] = hexToRgb(chip);
    const [h, s, v] = rgbToHsv(r, g, b);
    assert.equal(hsvToHex(h, s, v), chip.toUpperCase(), `chip ${chip} 往返失真`);
  }
});

test("rgbToHsv:基色与灰阶", () => {
  assert.deepEqual(rgbToHsv(0, 0, 0), [0, 0, 0]);
  assert.deepEqual(rgbToHsv(255, 255, 255), [0, 0, 1]);
  assert.deepEqual(rgbToHsv(255, 0, 0), [0, 1, 1]);
  assert.deepEqual(rgbToHsv(255, 255, 0), [60, 1, 1]);
  assert.deepEqual(rgbToHsv(0, 255, 0), [120, 1, 1]);
  assert.deepEqual(rgbToHsv(0, 255, 255), [180, 1, 1]);
  assert.deepEqual(rgbToHsv(0, 0, 255), [240, 1, 1]);
  assert.deepEqual(rgbToHsv(255, 0, 255), [300, 1, 1]);
  const [h, s, v] = rgbToHsv(128, 128, 128);
  assert.equal(h, 0);
  assert.equal(s, 0);
  assert.ok(Math.abs(v - 128 / 255) < 1e-12);
});

test("rgbToHsv:负色相正确回绕到 0-360", () => {
  // 粉色 #ffb8c6 的色相为负(绿分量低于蓝分量),必须 +360 归位
  const [h] = rgbToHsv(...(hexToRgb("#ffb8c6") as [number, number, number]));
  assert.ok(h > 300 && h < 360, `期望 300-360,得到 ${h}`);
});

test("hexToRgb:标准展开", () => {
  assert.deepEqual(hexToRgb("#ff0000"), [255, 0, 0]);
  assert.deepEqual(hexToRgb("#00ff00"), [0, 255, 0]);
  assert.deepEqual(hexToRgb("#0000ff"), [0, 0, 255]);
  assert.deepEqual(hexToRgb("#ffb8c6"), [255, 184, 198]);
});
