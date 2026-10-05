/**
 * Monet / Material Design 3 dynamic color extraction from a wallpaper image.
 * Pure Node: jimp decodes the image, @material/material-color-utilities does
 * quantization (Celebi), scoring and scheme generation.
 */

import fs from "node:fs";
import { Jimp } from "jimp";
import {
  QuantizerCelebi,
  Score,
  argbFromRgb,
  themeFromSourceColor,
  type Theme,
} from "@material/material-color-utilities";

export interface WallpaperAssets {
  /** Processed wallpaper as a data URI (resized + JPEG-compressed). */
  dataUri: string;
  /** MD3 source color extracted from the image (ARGB int). */
  sourceArgb: number;
  /** Light and dark MD3 themes generated from the source color. */
  theme: Theme;
  /** Saliency-based framing suggestion for `fit: "smart"`. */
  focus: ImageFocus;
}

export interface ImageFocus {
  /** Salient-region center, normalized 0-1. */
  x: number;
  y: number;
  /** Whether the image suits full cover cropping or letterboxed contain. */
  fit: "cover" | "contain";
}

/**
 * 本地解码器(jimp)真正支持的图片 MIME,以及它们在数据目录里的规范扩展名。
 * server 路由的白名单与落盘名、面板 `<input accept>`、解码失败的错误提示
 * 全部从这里生成 —— 以前三处各写各的,新增格式时漏掉一处就会出现
 * "面板能选、服务端拒收"的错位。WebP 不在清单里:jimp 解码它会永久挂起。
 */
export const SUPPORTED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/bmp",
  "image/tiff",
] as const;

/** MIME → 数据目录里的规范文件扩展名。 */
export const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
};

const MAX_WIDTH = 2560;
const JPEG_QUALITY = 82;

/**
 * 壁纸体积上限。注入链路里图片以 base64 走 HTTP body(膨胀约 1/3),20MB
 * 已是面板上传与本地解码的双重安全余量;server 路由与 CLI 的 applyWallpaper
 * 共用这一份定义,两边的拒绝行为保持一致。
 */
export const MAX_WALLPAPER_BYTES = 20 * 1024 * 1024;

const DECODE_TIMEOUT_MS = 60_000;

/** Decodes with jimp but names the supported formats when it fails. */
async function readImage(imagePath: string) {
  // A decoder that neither returns nor throws (a WebP that slipped past the
  // format guards wedged the whole API once) must not hang forever: cap the
  // decode and surface a plain error instead.
  let timeoutReject: ((err: Error) => void) | undefined;
  const timer = setTimeout(
    () => timeoutReject?.(new Error(`decoding timed out after ${DECODE_TIMEOUT_MS / 1000}s`)),
    DECODE_TIMEOUT_MS
  );
  timer.unref?.();
  try {
    return await Promise.race([
      Jimp.read(imagePath),
      new Promise<never>((_, reject) => {
        timeoutReject = reject;
      }),
    ]);
  } catch (err) {
    // jimp's raw decoder errors are cryptic; say what actually matters.
    const formats = SUPPORTED_IMAGE_MIME.map((m) => m.slice("image/".length).toUpperCase()).join(", ");
    throw new Error(
      `Cannot decode image "${imagePath}": ${(err as Error).message}. ` +
        `Supported formats: ${formats} (WebP is not supported).`
    );
  }
}

export async function loadWallpaper(imagePath: string, maxDimension = MAX_WIDTH): Promise<WallpaperAssets> {
  const image = await readImage(imagePath);

  // Downscale so the embedded data URI and the quantizer stay fast.
  const { width, height } = image.bitmap;
  if (Math.max(width, height) > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    image.resize({ w: Math.round(width * scale), h: Math.round(height * scale) });
  }

  const sourceArgb = extractSourceColor(image.bitmap);
  const theme = themeFromSourceColor(sourceArgb);
  const focus = analyzeFocus(image.bitmap);

  const jpeg = await image.getBuffer("image/jpeg", { quality: JPEG_QUALITY });
  const dataUri = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

  return { dataUri, sourceArgb, theme, focus };
}

// 解码 + Monet 取色 + JPEG 重编码对同一张壁纸是纯函数,进程内按 file+mtime
// 缓存一份。以前只有 serve 进程有这份缓存,MCP/CLI 每次调参(比如模型连着
// 微调 blur)都要重付 0.5-1s 的全量解码账单。serve 与一次性 CLI/MCP 进程各自
// 持有一份,以 mtime 为准,互不冲突。
let assetCache: { file: string; mtimeMs: number; assets: WallpaperAssets } | undefined;

/** 带缓存的 loadWallpaper:同一文件未变化时直接复用上次的解码与取色结果。 */
export async function loadWallpaperCached(imagePath: string, maxDimension = MAX_WIDTH): Promise<WallpaperAssets> {
  const mtimeMs = fs.statSync(imagePath).mtimeMs;
  if (assetCache?.file === imagePath && assetCache.mtimeMs === mtimeMs) {
    return assetCache.assets;
  }
  const assets = await loadWallpaper(imagePath, maxDimension);
  assetCache = { file: imagePath, mtimeMs, assets };
  return assets;
}

/**
 * 强制丢弃缓存。正常路径靠 mtime 变化即可失效;刚用 writeFileSync 覆盖写入
 * 新壁纸时显式调一次,不赌文件系统的时间戳粒度。
 */
export function invalidateAssetCache(): void {
  assetCache = undefined;
}

/**
 * Lightweight "smart fit" analysis, fully local: a saliency-weighted centroid
 * (pixels far from the global mean color get the most weight) becomes the
 * focus point, and extreme aspect ratios switch to a letterboxed contain mode
 * so the picture is never cropped beyond recognition.
 */
export function analyzeFocus(bitmap: { width: number; height: number; data: Uint8Array | Buffer }): ImageFocus {
  const { width, height, data } = bitmap;
  const aspect = width / height;
  const fit: ImageFocus["fit"] = aspect > 2.4 || aspect < 0.42 ? "contain" : "cover";

  // First pass: mean color of an opaque sample.
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 24000)));
  let rs = 0, gs = 0, bs = 0, n = 0;
  const samples: Array<[number, number, number, number, number]> = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 255) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      samples.push([x, y, r, g, b]);
      rs += r; gs += g; bs += b; n++;
    }
  }
  if (n === 0) return { x: 0.5, y: 0.5, fit };
  const mr = rs / n, mg = gs / n, mb = bs / n;

  // Second pass: weight = squared color distance from the mean → centroid of
  // whatever stands out (subject, highlights, accents).
  let wx = 0, wy = 0, wsum = 0;
  for (const [x, y, r, g, b] of samples) {
    const dr = r - mr, dg = g - mg, db = b - mb;
    const w = dr * dr + dg * dg + db * db + 1;
    wx += x * w; wy += y * w; wsum += w;
  }
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp(wx / wsum / width), y: clamp(wy / wsum / height), fit };
}

/** Celebi quantization + MD3 scoring, on a decimated pixel sample. */
function extractSourceColor(bitmap: { width: number; height: number; data: Uint8Array | Buffer }): number {
  const { width, height, data } = bitmap;
  const pixels: number[] = [];
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 24000)));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      if (alpha < 255) continue;
      pixels.push(argbFromRgb(data[i], data[i + 1], data[i + 2]));
    }
  }
  if (pixels.length === 0) pixels.push(argbFromRgb(255, 255, 255));
  const quantized = QuantizerCelebi.quantize(pixels, 64);
  const ranked = Score.score(quantized);
  return ranked[0] ?? argbFromRgb(103, 80, 164);
}

export function argbToCss(argb: number, alpha = 1): string {
  const r = (argb & 0xff0000) >> 16;
  const g = (argb & 0x00ff00) >> 8;
  const b = argb & 0x0000ff;
  return alpha >= 1
    ? `#${toHex(r)}${toHex(g)}${toHex(b)}`
    : `rgba(${r}, ${g}, ${b}, ${round2(alpha)})`;
}

function toHex(v: number): string {
  return v.toString(16).padStart(2, "0");
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
