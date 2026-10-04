/**
 * Monet / Material Design 3 dynamic color extraction from a wallpaper image.
 * Pure Node: jimp decodes the image, @material/material-color-utilities does
 * quantization (Celebi), scoring and scheme generation.
 */

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

const MAX_WIDTH = 2560;
const JPEG_QUALITY = 82;

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
    throw new Error(
      `Cannot decode image "${imagePath}": ${(err as Error).message}. ` +
        `Supported formats: JPEG, PNG, BMP, GIF, TIFF (WebP is not supported).`
    );
  }
}
const DECODE_TIMEOUT_MS = 30_000;

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
