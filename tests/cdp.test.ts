import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBootstrapScript, buildResetScript } from "../src/core/cdp.js";

test("buildBootstrapScript:CSS 与壁纸都相同才早退", () => {
  const s = buildBootstrapScript({ css: "X", wallpaperDataUri: "data:image/jpeg;base64,AA", fit: "cover" });
  // 以前只比较 cssText:换图但取色恰好相同时会跳过壁纸更新,界面停在旧图
  assert.ok(
    s.includes("window.__zcodeBeautify.cssText === CSS && window.__zcodeBeautify.wallpaper === WP"),
    "早退条件必须同时覆盖 CSS 与壁纸"
  );
});

test("buildBootstrapScript:localStorage 差量写(值不变不重写)", () => {
  const s = buildBootstrapScript({ css: "X" });
  assert.ok(s.includes("if (localStorage.getItem(cssKey) !== CSS) localStorage.setItem(cssKey, CSS);"));
  assert.ok(s.includes("if (localStorage.getItem(wpKey) !== WP) localStorage.setItem(wpKey, WP);"));
});

test("buildResetScript:清掉 localStorage 里的主题副本", () => {
  // self-heal 会从这两个键把刚还原的主题捡回来(0.7.4 前只有面板按钮路径清)
  const s = buildResetScript();
  assert.match(s, /localStorage\.removeItem\("zcode-beautify" \+ ':css'\)/);
  assert.match(s, /localStorage\.removeItem\("zcode-beautify" \+ ':wallpaper'\)/);
});
