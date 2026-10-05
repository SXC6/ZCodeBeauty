import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyWallpaper } from "../src/core/session.js";
import { MAX_WALLPAPER_BYTES } from "../src/core/monet.js";

// 两条守卫都必须在"复制文件/解码/触网"之前抛出 —— WebP 事故的教训就是
// 让一步不合格的输入走到了本地解码器。

test("applyWallpaper:拒绝 WebP(解码会永久挂起)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zb-guard-"));
  try {
    const webp = path.join(dir, "pic.webp");
    fs.writeFileSync(webp, "RIFF....");
    await assert.rejects(() => applyWallpaper(webp, {}), /WebP is not supported/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applyWallpaper:拒绝超过 20MB 的图片", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zb-guard-"));
  try {
    const big = path.join(dir, "huge.jpg");
    fs.writeFileSync(big, Buffer.alloc(MAX_WALLPAPER_BYTES + 1, 1));
    await assert.rejects(() => applyWallpaper(big, {}), /image too large/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applyWallpaper:文件不存在时报清晰错误", async () => {
  const missing = path.join(os.tmpdir(), "zb-no-such-image.jpg");
  await assert.rejects(() => applyWallpaper(missing, {}), /Image not found/);
});
