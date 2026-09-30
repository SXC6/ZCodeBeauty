// Material Design 3 (Monet) dynamic color from a wallpaper image, mapped to an
// Electron app's semantic CSS variables. Distilled from a working beautify tool.
//
// deps: npm i jimp @material/material-color-utilities
//
//   import { extractTheme, buildTokenCss } from './monet-color.mjs';
//   const { theme } = await extractTheme('wallpaper.jpg');
//   const css = buildTokenCss(theme, { wallpaperVisible: true, dim: 30 });
//   // → `:root,:host{...} .dark{...}` — inject together with the wallpaper layer

import { Jimp } from "jimp";
import { QuantizerCelebi, Score, argbFromRgb, themeFromSourceColor } from "@material/material-color-utilities";

const MAX_DIMENSION = 2560;

/**
 * Loads an image, downscales it (speed + memory), and extracts the MD3 theme.
 * Returns the processed JPEG data URI for the wallpaper layer as well.
 */
export async function extractTheme(imagePath) {
  const image = await Jimp.read(imagePath);
  const { width, height } = image.bitmap;
  if (Math.max(width, height) > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    image.resize({ w: Math.round(width * scale), h: Math.round(height * scale) });
  }

  const sourceArgb = extractSourceColor(image.bitmap);
  const theme = themeFromSourceColor(sourceArgb);
  const jpeg = await image.getBuffer("image/jpeg", { quality: 82 });

  return {
    theme,
    sourceArgb,
    dataUri: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
  };
}

/** Celebi quantization + MD3 scoring on a decimated pixel sample (~24k). */
function extractSourceColor(bitmap) {
  const { width, height, data } = bitmap;
  const pixels = [];
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 24000)));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 255) continue;
      pixels.push(argbFromRgb(data[i], data[i + 1], data[i + 2]));
    }
  }
  if (pixels.length === 0) pixels.push(argbFromRgb(255, 255, 255));
  const ranked = Score.score(QuantizerCelebi.quantize(pixels, 64));
  return ranked[0] ?? argbFromRgb(103, 80, 164); // MD3 default purple fallback
}

/**
 * Emits the CSS variable override blocks for light AND dark schemes so the
 * app's own dark-mode toggle keeps working.
 *
 * opts.wallpaperVisible — translucent surfaces letting the wallpaper through
 *                         (false → everything opaque, wallpaper hidden away).
 * opts.dim              — 0-100; emits --beautify-dim for the dim overlay.
 * opts.vars             — token map for the target app (see token-mapping.md);
 *                         defaults to the Tailwind v4 `--color-*` convention.
 */
export function buildTokenCss(theme, opts = {}) {
  const { wallpaperVisible = true, dim = 25, vars = TAILWIND_V4_VARS } = opts;
  const light = tokenRows(theme.schemes.light, theme.palettes.neutral, "light", vars, wallpaperVisible, dim);
  const dark = tokenRows(theme.schemes.dark, theme.palettes.neutral, "dark", vars, wallpaperVisible, dim);
  return `:root,:host{${light.join("")}}\n.dark{${dark.join("")}}`;
}

// surfaceContainer* roles are missing from material-color-utilities 0.3.0
// schemes — derive them from the neutral tonal palette at the official MD3
// tones (light: 100/96/94/92/90, dark: 4/10/12/17/22).
const LIGHT_TONES = { lowest: 100, low: 96, container: 94, high: 92, highest: 90 };
const DARK_TONES = { lowest: 4, low: 10, container: 12, high: 17, highest: 22 };

/**
 * vars: { name: (scheme, neutral, tones, mode) => css-color }
 * Only override what the app actually styles with — see token-mapping.md.
 */
const TAILWIND_V4_VARS = {
  // window + page backgrounds: transparent so the wallpaper layer shows
  "--color-background": () => "transparent",
  "--color-background-alt": (s, n, t, mode, a) => rgba(n.tone(mode === "light" ? t.high : t.low), a.panel),
  "--color-background-win-alt": (s, n, t, _mode, a) => rgba(n.tone(t.low), a.panel),
  "--color-panel": (s, n, t, _mode, a) => rgba(n.tone(t.low), a.panel),
  "--color-sidebar": (s, n, t, _mode, a) => rgba(n.tone(t.low), a.panel),
  "--color-surface": (s, n, t, mode, a) => rgba(n.tone(mode === "light" ? 98 : 6), a.base),
  "--color-surface-hover": (s, n, t, _mode, a) => rgba(n.tone(t.high), a.base),
  "--color-card": (s, n, t, _mode, a) => rgba(n.tone(t.container), a.base),
  "--color-card-selected": (s, n, t, _mode, a) => rgba(n.tone(t.highest), Math.min(1, a.base + 0.15)),
  "--color-popover": (s, n, t, _mode, a) => rgba(n.tone(t.container), a.popover),
  "--color-input": (s, n, t, _mode, a) => rgba(n.tone(t.highest), a.input),
  "--color-input-focused": (s, n, t, _mode, a) => rgba(n.tone(t.highest), Math.min(1, a.input + 0.2)),

  "--color-foreground": (s) => hex(s.onSurface),
  "--color-foreground-subtle": (s) => hex(s.onSurfaceVariant),
  "--color-foreground-subtlest": (s) => rgba(s.onSurfaceVariant, 0.72),
  "--color-foreground-inverse": (s) => hex(s.inverseOnSurface),

  "--color-primary": (s) => hex(s.primary),
  "--color-primary-foreground": (s) => hex(s.onPrimary),
  "--color-secondary": (s) => hex(s.secondaryContainer),
  "--color-accent": (s) => hex(s.tertiary),
  "--color-brand": (s) => hex(s.primary),

  "--color-border": (s) => rgba(s.outlineVariant, 0.55),
  "--color-border-hover": (s) => rgba(s.outlineVariant, 0.9),
  "--divider-color": (s) => rgba(s.outlineVariant, 0.4),
};

function tokenRows(scheme, neutral, mode, vars, wallpaperVisible, dim) {
  const tones = mode === "light" ? LIGHT_TONES : DARK_TONES;
  const alphas = {
    base: wallpaperVisible ? 0.72 : 1,
    panel: wallpaperVisible ? 0.62 : 1,
    input: wallpaperVisible ? 0.5 : 1,
    popover: wallpaperVisible ? 0.92 : 1,
  };
  const rows = Object.entries(vars).map(([name, fn]) =>
    `${name}:${fn(scheme, neutral, tones, mode, alphas)};`
  );
  if (dim > 0) rows.push(`--beautify-dim:${dim / 100};`);
  return rows;
}

// --- color helpers -----------------------------------------------------------

function hex(argb) {
  const r = (argb & 0xff0000) >> 16, g = (argb & 0x00ff00) >> 8, b = argb & 0xff;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function rgba(argb, alpha = 1) {
  if (alpha >= 1) return hex(argb);
  const r = (argb & 0xff0000) >> 16, g = (argb & 0x00ff00) >> 8, b = argb & 0xff;
  const a = Math.round(alpha * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
