import { test } from "node:test";
import assert from "node:assert/strict";
import { argbFromRgb, themeFromSourceColor } from "@material/material-color-utilities";
import { buildPayload, DEFAULT_CONFIG, normalizeStrength, type BeautifyConfig } from "../src/core/inject.js";
import type { WallpaperAssets } from "../src/core/monet.js";

function fakeAssets(focusFit: "cover" | "contain" = "cover"): WallpaperAssets {
  return {
    dataUri: "data:image/jpeg;base64,AAAA",
    sourceArgb: argbFromRgb(103, 80, 164),
    theme: themeFromSourceColor(argbFromRgb(103, 80, 164)),
    focus: { x: 0.5, y: 0.5, fit: focusFit },
  };
}

function config(over: Partial<BeautifyConfig> = {}): BeautifyConfig {
  return { ...DEFAULT_CONFIG, ...over };
}

test("normalizeStrength:垃圾输入回退默认 45", () => {
  assert.equal(normalizeStrength(undefined), 45);
  assert.equal(normalizeStrength("50"), 45);
  assert.equal(normalizeStrength(NaN), 45);
  assert.equal(normalizeStrength(Infinity), 45);
});

test("normalizeStrength:钳位 1-100 并取整", () => {
  assert.equal(normalizeStrength(0), 1);
  assert.equal(normalizeStrength(-5), 1);
  assert.equal(normalizeStrength(150), 100);
  assert.equal(normalizeStrength(50.4), 50);
  assert.equal(normalizeStrength(45), 45);
});

test("buildPayload:无壁纸时不推透明化 CSS(防全透明窗)", () => {
  // reset 之后跑 refresh_theme 是典型触发路径:没有壁纸还把背景抹透明,
  // 用户看到的就是一扇后面什么都没有的透明窗。
  const payload = buildPayload(config(), undefined);
  assert.ok(!payload.css.includes("html, body"), "无壁纸不得推透明化规则");
  assert.equal(payload.wallpaperDataUri, undefined);
});

test("buildPayload:有壁纸时包含全部层", () => {
  const payload = buildPayload(config(), fakeAssets());
  assert.ok(payload.css.includes("html, body"), "应含透明化规则");
  assert.ok(payload.css.includes("#zcode-beautify-wallpaper"));
  assert.ok(payload.css.includes("#zcode-beautify-backdrop"));
  assert.ok(payload.css.includes(".dark{"), "Monet 覆盖应带深色块");
  assert.equal(payload.wallpaperDataUri, "data:image/jpeg;base64,AAAA");
});

test("buildPayload:叠加颜色以带 alpha 的渐变写入 ::after", () => {
  const payload = buildPayload(config({ overlayColor: "#ff8800", overlayStrength: 45 }), fakeAssets());
  const expected = "linear-gradient(rgb(255 136 0 / 0.45), rgb(255 136 0 / 0.45))";
  assert.ok(payload.css.includes(expected), `缺少 ${expected}`);
});

test("buildPayload:无叠加颜色时不写渐变", () => {
  const payload = buildPayload(config({ overlayColor: "" }), fakeAssets());
  assert.ok(!payload.css.includes("linear-gradient(rgb("));
});

test("buildPayload:模糊滑条经阻尼换算(blur×0.3)", () => {
  const blurred = buildPayload(config({ blur: 30 }), fakeAssets());
  assert.ok(blurred.css.includes("blur(9.00px)"), "30px 应阻尼为 9.00px");
  const zero = buildPayload(config({ blur: 0 }), fakeAssets());
  assert.ok(zero.css.includes("blur(0px)"));
});

test("buildPayload:fit=smart 按 focus 分析结果解析", () => {
  const contain = buildPayload(config({ fit: "smart" }), fakeAssets("contain"));
  assert.ok(contain.css.includes("background-size: contain"));
  assert.equal(contain.fit, "contain");
  const cover = buildPayload(config({ fit: "smart" }), fakeAssets("cover"));
  assert.ok(cover.css.includes("background-size: cover"));
});

test("buildPayload:隐藏壁纸时不推壁纸层、不内嵌图片", () => {
  const payload = buildPayload(config({ wallpaperVisible: false }), fakeAssets());
  assert.ok(!payload.css.includes("#zcode-beautify-wallpaper {"));
  assert.equal(payload.wallpaperDataUri, undefined);
});
