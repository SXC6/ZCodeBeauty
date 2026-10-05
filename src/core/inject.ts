/**
 * Assembles the full injected payload: wallpaper layer CSS + variable
 * overrides, plus helpers to apply a theme to a running ZCode instance.
 */

import { CdpConnection, injectIntoTarget, listTargets, pickRendererTargets, buildResetScript } from "./cdp.js";
import type { WallpaperAssets } from "./monet.js";
import { buildVariableOverrides, buildTransparencyOverrides } from "./tokens.js";

export type WallpaperFit = "cover" | "contain" | "smart";

/** Slider-to-Gauss conversion: a full-screen blur reads far stronger than its nominal radius. */
const BLUR_DAMPING = 0.3;
/** Overlay tint strength (percent) assumed for configs stored before the knob existed. */
export const DEFAULT_OVERLAY_STRENGTH = 45;

export interface BeautifyConfig {
  port: number;
  wallpaperPath?: string;
  blur: number;
  dim: number;
  monet: boolean;
  wallpaperVisible: boolean;
  fit: WallpaperFit;
  /** Overall UI surface translucency, 0-100; 50 is the shipped look. */
  transparency: number;
  /** Color blended over the wallpaper ("#rrggbb"); empty = no overlay. */
  overlayColor: string;
  /** Overlay tint strength in percent, 1-100. "Off" is overlayColor: "" — 0% is not a strength. */
  overlayStrength: number;
}

export const DEFAULT_CONFIG: BeautifyConfig = {
  port: 9222,
  blur: 0,
  dim: 25,
  monet: true,
  wallpaperVisible: true,
  fit: "cover",
  transparency: 50,
  overlayColor: "",
  overlayStrength: DEFAULT_OVERLAY_STRENGTH,
};

export interface BuiltPayload {
  css: string;
  wallpaperDataUri?: string;
  /** How the wallpaper layer is framed; "contain" adds a blurred backdrop. */
  fit: "cover" | "contain";
  /** Normalized focus point for background-position. */
  focusX: number;
  focusY: number;
}

/** Coerces a stored strength to a usable percent; junk falls back to the default. */
export function normalizeStrength(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_OVERLAY_STRENGTH;
  return Math.min(100, Math.max(1, n));
}

/** "#rrggbb" → "rgb(r g b / a)"; sanitize already constrains the shape. */
function hexRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`;
}

/** Everything behind the wallpaper goes transparent so the layer is visible. */
function pageTransparentCss(): string {
  return `
html, body { background: transparent !important; }`;
}

/**
 * Contain-mode letterbox filler: a blurred, slightly scaled copy of the
 * picture painted behind it, hidden unless data-on="1". Scaling hides the
 * blur fringe; on a blurred blob the zoom itself is invisible.
 */
function backdropLayerCss(): string {
  return `
#zcode-beautify-backdrop {
  position: fixed;
  inset: 0;
  z-index: -2147483647;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  pointer-events: none;
  filter: blur(28px) saturate(1.15) brightness(0.85);
  transform: scale(1.12);
  display: none;
}
#zcode-beautify-backdrop[data-on="1"] { display: block; }`;
}

/**
 * The wallpaper box never leaves `inset: 0` — every effect rides on
 * full-size pseudo-layers — so cover/contain framing is pixel-identical no
 * matter which knobs move. The blur is a backdrop-filter frost on ::before
 * (this Chromium blurs cleanly out to the viewport edge; earlier tricks — a
 * 4% scale, then a 32px inset bleed to push the fringe off-screen — rescaled
 * background-size: cover and read as a zoom). Dim and the color tint stack
 * on ::after; their values live on :root variables so the panel can preview
 * without a round trip.
 */
function wallpaperLayerCss(config: BeautifyConfig, resolved: "cover" | "contain", position: string): string {
  const effectiveBlur = config.blur > 0 ? (config.blur * BLUR_DAMPING).toFixed(2) : "0";
  // The tint blends onto the blurred picture; baking the alpha into the
  // color frees ::before for the blur layer.
  const overlay = config.overlayColor ? hexRgba(config.overlayColor, normalizeStrength(config.overlayStrength) / 100) : "";
  return `
:root { --zcode-beautify-blur: blur(${effectiveBlur}px); --zcode-beautify-dim: ${config.dim / 100}; }
#zcode-beautify-wallpaper {
  position: fixed;
  inset: 0;
  z-index: -2147483646;
  background-size: ${resolved};
  background-position: ${resolved === "contain" ? "center" : position};
  background-repeat: no-repeat;
  pointer-events: none;
}
#zcode-beautify-wallpaper::before {
  content: '';
  position: absolute;
  inset: 0;
  backdrop-filter: var(--zcode-beautify-blur);
}
#zcode-beautify-wallpaper::after {
  content: '';
  position: absolute;
  inset: 0;
  background-color: rgb(0 0 0 / var(--zcode-beautify-dim));${
    overlay ? `\n  background-image: linear-gradient(${overlay}, ${overlay});` : ""
  }
}`;
}

export function buildPayload(config: BeautifyConfig, assets?: WallpaperAssets): BuiltPayload {
  const parts: string[] = [];

  // "smart" resolves to the analyzed suggestion at build time, so the injected
  // CSS only ever deals with cover or contain.
  const resolved: "cover" | "contain" =
    config.fit === "smart" ? (assets?.focus.fit ?? "cover") : config.fit === "contain" ? "contain" : "cover";
  const focusX = config.fit === "smart" ? (assets?.focus.x ?? 0.5) : 0.5;
  const focusY = config.fit === "smart" ? (assets?.focus.y ?? 0.5) : 0.5;
  const position = `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`;

  // 透明化只在真的有壁纸可看时才有意义:无壁纸(reset 之后跑 refresh_theme
  // 是典型路径)还推它,得到的是一扇后面什么都没有的全透明窗。
  if (assets) {
    parts.push(pageTransparentCss());
  }
  parts.push(backdropLayerCss());
  if (config.wallpaperVisible) {
    parts.push(wallpaperLayerCss(config, resolved, position));
  }

  if (assets) {
    // Monet recolors the UI from the wallpaper; the wallpaper toggle only
    // decides whether the picture is visible at all. With Monet off we still
    // need transparency, otherwise the opaque UI hides the wallpaper.
    if (config.monet) {
      parts.push(buildVariableOverrides(assets.theme, {
        dim: config.dim,
        wallpaperVisible: config.wallpaperVisible,
        transparency: config.transparency,
      }));
    } else if (config.wallpaperVisible) {
      parts.push(buildTransparencyOverrides({ dim: config.dim, transparency: config.transparency }));
    }
  }
  const wallpaperDataUri = config.wallpaperVisible ? assets?.dataUri : undefined;

  return {
    css: parts.join("\n"),
    wallpaperDataUri,
    fit: config.wallpaperVisible ? resolved : "cover",
    focusX,
    focusY,
  };
}

/** Apply config to a running ZCode instance. Returns how many windows got it. */
export async function applyToZCode(config: BeautifyConfig, payload: BuiltPayload): Promise<number> {
  const targets = pickRendererTargets(await listTargets(config.port));
  if (targets.length === 0) {
    throw new Error("No ZCode renderer target found on the CDP endpoint.");
  }
  let count = 0;
  for (const target of targets) {
    try {
      await injectIntoTarget(target, payload);
      count++;
    } catch (err) {
      console.warn(`Injection into "${target.title}" failed: ${(err as Error).message}`);
    }
  }
  return count;
}

export async function resetZCode(port: number): Promise<number> {
  const targets = pickRendererTargets(await listTargets(port));
  let count = 0;
  for (const target of targets) {
    try {
      const conn = await CdpConnection.connect(target.webSocketDebuggerUrl!);
      await conn.send("Runtime.evaluate", { expression: buildResetScript() });
      conn.close();
      count++;
    } catch (err) {
      console.warn(`Reset of "${target.title}" failed: ${(err as Error).message}`);
    }
  }
  return count;
}
