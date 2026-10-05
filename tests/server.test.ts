import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize } from "../src/core/server.js";

// 面板是这个 API 唯一的合法客户端,但 /api/config 暴露在 localhost 上:
// sanitize 是"字段白名单 + 范围钳位"的唯一一道闸,这里逐字段钉死它的行为。

test("sanitize:合法数值全部放行", () => {
  assert.deepEqual(sanitize({ blur: 12, dim: 34, transparency: 70, overlayStrength: 45 }), {
    blur: 12, dim: 34, transparency: 70, overlayStrength: 45,
  });
});

test("sanitize:越界数值整体丢弃(不钳位)", () => {
  assert.deepEqual(sanitize({ blur: -1 }), {});
  assert.deepEqual(sanitize({ blur: 101 }), {});
  assert.deepEqual(sanitize({ dim: -1 }), {});
  assert.deepEqual(sanitize({ transparency: 101 }), {});
  // 0% 强度不是合法值:"off" 用 overlayColor: "" 表达
  assert.deepEqual(sanitize({ overlayStrength: 0 }), {});
  assert.deepEqual(sanitize({ overlayStrength: 101 }), {});
});

test("sanitize:1-100 的强度边界放行", () => {
  assert.deepEqual(sanitize({ overlayStrength: 1 }), { overlayStrength: 1 });
  assert.deepEqual(sanitize({ overlayStrength: 100 }), { overlayStrength: 100 });
});

test("sanitize:类型不对的值丢弃", () => {
  assert.deepEqual(sanitize({ blur: "50" }), {});
  assert.deepEqual(sanitize({ monet: "true" }), {});
  assert.deepEqual(sanitize({ wallpaperVisible: 1 }), {});
  assert.deepEqual(sanitize({ fit: null }), {});
});

test("sanitize:布尔与枚举放行", () => {
  assert.deepEqual(sanitize({ monet: true, wallpaperVisible: false }), { monet: true, wallpaperVisible: false });
  assert.deepEqual(sanitize({ fit: "smart" }), { fit: "smart" });
  assert.deepEqual(sanitize({ fit: "crop" }), {});
});

test("sanitize:叠加颜色只接受空串或 #rrggbb", () => {
  assert.deepEqual(sanitize({ overlayColor: "#4b6cb7" }), { overlayColor: "#4b6cb7" });
  assert.deepEqual(sanitize({ overlayColor: "" }), { overlayColor: "" });
  assert.deepEqual(sanitize({ overlayColor: "#abc" }), {});
  assert.deepEqual(sanitize({ overlayColor: "red" }), {});
});

test("sanitize:未知字段不透传,垃圾请求体返回空对象", () => {
  assert.deepEqual(sanitize({ wallpaperPath: "/etc/passwd", port: 1234, password: "x" }), {});
  assert.deepEqual(sanitize({}), {});
  assert.deepEqual(sanitize(null), {});
  assert.deepEqual(sanitize(undefined), {});
  assert.deepEqual(sanitize("string"), {});
});
