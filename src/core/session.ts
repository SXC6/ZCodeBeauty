/**
 * Shared high-level operations used by both the CLI and the MCP server.
 */

import fs from "node:fs";
import path from "node:path";
import { applyToZCode, buildPayload, DEFAULT_CONFIG, resetZCode, type BeautifyConfig, type BuiltPayload } from "./inject.js";
import { loadWallpaperCached } from "./monet.js";
import { dataDir, loadConfig, saveConfig } from "./launch.js";

export interface ApplyOptions {
  port?: number;
  blur?: number;
  dim?: number;
  monet?: boolean;
  wallpaperVisible?: boolean;
  fit?: "cover" | "contain" | "smart";
  transparency?: number;
  overlayColor?: string;
  overlayStrength?: number;
}

/** Applies (or refreshes) the theme using the stored config. */
export async function reapplyStored(): Promise<number> {
  const config = mergedConfig();
  return applyToZCode(config, await buildPayloadFromConfig(config));
}

export async function applyWallpaper(imagePath: string, opts: ApplyOptions): Promise<{ windows: number; config: BeautifyConfig }> {
  const abs = path.resolve(imagePath);
  if (!fs.existsSync(abs)) throw new Error(`Image not found: ${abs}`);
  // Mirror the server route's format guard. jimp cannot decode WebP — and its
  // decode attempt never settles, which would wedge every later API call, so
  // reject it before a single byte is copied.
  if (/\.webp$/i.test(abs)) {
    throw new Error("WebP is not supported by the local decoder — re-export the image as JPG or PNG and import again.");
  }

  const stored = loadConfig();
  const config: BeautifyConfig = {
    ...DEFAULT_CONFIG,
    ...stored,
    port: opts.port ?? stored.port ?? DEFAULT_CONFIG.port,
    blur: opts.blur ?? stored.blur ?? DEFAULT_CONFIG.blur,
    dim: opts.dim ?? stored.dim ?? DEFAULT_CONFIG.dim,
    monet: opts.monet ?? stored.monet ?? DEFAULT_CONFIG.monet,
    wallpaperVisible: opts.wallpaperVisible ?? stored.wallpaperVisible ?? DEFAULT_CONFIG.wallpaperVisible,
    fit: opts.fit ?? stored.fit ?? DEFAULT_CONFIG.fit,
    transparency: opts.transparency ?? stored.transparency ?? DEFAULT_CONFIG.transparency,
    overlayColor: opts.overlayColor ?? stored.overlayColor ?? DEFAULT_CONFIG.overlayColor,
    overlayStrength: opts.overlayStrength ?? stored.overlayStrength ?? DEFAULT_CONFIG.overlayStrength,
  };

  // Keep a copy of the wallpaper inside the data dir so the theme survives
  // the original file being moved/deleted.
  fs.mkdirSync(dataDir(), { recursive: true });
  const dest = path.join(dataDir(), "wallpaper" + path.extname(abs).toLowerCase());
  if (dest !== abs) fs.copyFileSync(abs, dest);

  // dest 是刚复制/覆盖出来的新文件,mtime 必然变化,缓存按未命中重载。
  const assets = await loadWallpaperCached(dest);
  const payload = buildPayload(config, assets);
  // Persist first: even if the app is not running yet, `launch` + `refresh_theme`
  // can pick the stored theme up later.
  saveConfig({ ...config, wallpaperPath: dest });

  const windows = await applyToZCode(config, payload);
  return { windows, config };
}

export async function applyColorsOnly(opts: ApplyOptions): Promise<number> {
  const stored = loadConfig();
  const config: BeautifyConfig = {
    ...DEFAULT_CONFIG,
    ...stored,
    port: opts.port ?? stored.port ?? DEFAULT_CONFIG.port,
    blur: opts.blur ?? stored.blur ?? DEFAULT_CONFIG.blur,
    dim: opts.dim ?? stored.dim ?? DEFAULT_CONFIG.dim,
    monet: opts.monet ?? stored.monet ?? DEFAULT_CONFIG.monet,
    wallpaperVisible: opts.wallpaperVisible ?? stored.wallpaperVisible ?? DEFAULT_CONFIG.wallpaperVisible,
    fit: opts.fit ?? stored.fit ?? DEFAULT_CONFIG.fit,
    transparency: opts.transparency ?? stored.transparency ?? DEFAULT_CONFIG.transparency,
    overlayColor: opts.overlayColor ?? stored.overlayColor ?? DEFAULT_CONFIG.overlayColor,
    overlayStrength: opts.overlayStrength ?? stored.overlayStrength ?? DEFAULT_CONFIG.overlayStrength,
  };
  saveConfig(config);
  return applyToZCode(config, await buildPayloadFromConfig(config));
}

/**
 * 还原默认外观。注意一个已知限制:serve 守护进程感知不到这里的 reset ——
 * 控制 API 由每次启动随机生成的 token 保护,CLI/MCP 拿不到它,无法转发。
 * reset 脚本会清掉 localStorage 里的主题副本(防 self-heal 复活),但 serve
 * 自己持有的 addScriptToEvaluateOnNewDocument 注册要等下一次 config 推送才
 * 更新,所以 serve 运行期间重载 renderer 仍会注回旧主题。serve 在跑时用户
 * 一般走面板的还原按钮(那条路径完全同步),这条缝隙只影响"serve 常驻 +
 * CLI reset"的组合,记录在案。
 */
export async function resetAppearance(port?: number): Promise<number> {
  const stored = loadConfig();
  await resetZCode(port ?? stored.port ?? DEFAULT_CONFIG.port);
  saveConfig({ ...stored, wallpaperPath: undefined });
  return 0;
}

export async function buildPayloadFromConfig(config: BeautifyConfig): Promise<BuiltPayload> {
  let assets;
  if (config.wallpaperPath && fs.existsSync(config.wallpaperPath)) {
    assets = await loadWallpaperCached(config.wallpaperPath);
  }
  return buildPayload(config, assets);
}

function mergedConfig(): BeautifyConfig {
  const stored = loadConfig();
  return { ...DEFAULT_CONFIG, ...stored, port: stored.port ?? DEFAULT_CONFIG.port };
}
