import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { atomicWriteJson, cleanStaleWallpapers } from "../src/core/launch.js";

test("cleanStaleWallpapers:只删旧扩展名的壁纸副本,其他文件一律不碰", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zb-clean-"));
  try {
    const write = (name: string) => fs.writeFileSync(path.join(dir, name), "x");
    write("wallpaper.jpg");
    write("wallpaper.png"); // 本次导入的新文件
    write("wallpaper.webp"); // WebP 事故年代的遗留
    write("other.jpg"); // 用户自己的文件
    write("keep.png");
    fs.mkdirSync(path.join(dir, "wallpaper.dir")); // 同名目录不应报错也不该删

    cleanStaleWallpapers(path.join(dir, "wallpaper.png"));

    const left = fs.readdirSync(dir).sort();
    assert.deepEqual(left, ["keep.png", "other.jpg", "wallpaper.dir", "wallpaper.png"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cleanStaleWallpapers:目录不存在时静默返回", () => {
  assert.doesNotThrow(() => cleanStaleWallpapers(path.join(os.tmpdir(), "zb-no-such-dir", "wallpaper.jpg")));
});

test("atomicWriteJson:内容完整落盘且不留临时文件", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zb-atomic-"));
  try {
    const file = path.join(dir, "config.json");
    atomicWriteJson(file, { blur: 8, fit: "smart" });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { blur: 8, fit: "smart" });
    assert.deepEqual(fs.readdirSync(dir), ["config.json"], "写入后不得残留 .tmp");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
