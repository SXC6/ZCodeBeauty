import { test } from "node:test";
import assert from "node:assert/strict";
import { argbFromRgb, themeFromSourceColor } from "@material/material-color-utilities";
import { buildTransparencyOverrides, buildVariableOverrides, surfaceAlphas } from "../src/core/tokens.js";

const theme = themeFromSourceColor(argbFromRgb(103, 80, 164));

const near = (actual: number, expected: number, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `期望 ≈${expected},实际 ${actual}`);

test("surfaceAlphas:隐藏壁纸时全部不透明", () => {
  assert.deepEqual(surfaceAlphas({ wallpaperVisible: false, transparency: 100 }), {
    surface: 1, panel: 1, input: 1, popover: 1,
  });
});

test("surfaceAlphas:50 即出厂观感(透明度基准)", () => {
  const a = surfaceAlphas({ wallpaperVisible: true, transparency: 50 });
  near(a.surface, 0.72);
  near(a.panel, 0.62);
  near(a.input, 0.5);
  near(a.popover, 0.92);
});

test("surfaceAlphas:0 = 完全不透明,100 = 加倍通透且受下限保护", () => {
  const opaque = surfaceAlphas({ wallpaperVisible: true, transparency: 0 });
  near(opaque.surface, 1);
  near(opaque.panel, 1);

  const glassy = surfaceAlphas({ wallpaperVisible: true, transparency: 100 });
  near(glassy.surface, 0.44);
  near(glassy.panel, 0.24);
  // input 的线性值会到 0,但可读性下限是 0.2 —— 文本区域永不全透
  near(glassy.input, 0.2);
  near(glassy.popover, 0.84);
});

test("surfaceAlphas:越界输入被钳位", () => {
  const above = surfaceAlphas({ wallpaperVisible: true, transparency: 150 });
  near(above.surface, 0.44);
  const below = surfaceAlphas({ wallpaperVisible: true, transparency: -30 });
  near(below.surface, 1);
});

test("buildVariableOverrides:同时覆盖 :root 与 .dark 两个块", () => {
  const css = buildVariableOverrides(theme, { dim: 25, wallpaperVisible: true, transparency: 50 });
  assert.ok(css.startsWith(":root,:host{"));
  assert.ok(css.includes(".dark{"));
  assert.ok(css.includes("--color-background:transparent;"));
  assert.ok(css.includes("--color-primary:"));
  assert.ok(css.includes("--zcode-beautify-dim:0.25;"));
});

test("buildVariableOverrides:dim=0 时不输出压暗变量", () => {
  const css = buildVariableOverrides(theme, { dim: 0, wallpaperVisible: true, transparency: 50 });
  assert.ok(!css.includes("--zcode-beautify-dim"));
});

test("buildTransparencyOverrides:只动表面,不动前景与强调色", () => {
  const css = buildTransparencyOverrides({ dim: 30, transparency: 50 });
  assert.ok(css.includes("--color-background:transparent;"));
  assert.ok(css.includes(".dark{"));
  assert.ok(!css.includes("--color-primary:"), "Monet 关闭时前景/强调色保持 ZCode 原生");
  assert.ok(css.includes("--zcode-beautify-dim:0.3;"));
});
