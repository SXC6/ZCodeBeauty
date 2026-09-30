/**
 * Maps Material Design 3 scheme roles onto ZCode's Tailwind v4 `--color-*`
 * semantic tokens. ZCode defines light tokens in `:root` and dark overrides in
 * `.dark`; we override both blocks so the app's own dark-mode switch keeps
 * working. Surface-like tokens get alpha so the wallpaper layer shows through.
 *
 * material-color-utilities 0.3.0 schemes lack the newer surfaceContainer*
 * roles, so those are derived from the neutral tonal palette at the official
 * MD3 tones (light: 100/96/94/92/90, dark: 4/10/12/17/22).
 */

import { argbToCss } from "./monet.js";
import type { Theme } from "@material/material-color-utilities";

export interface ThemeOptions {
  /** Wallpaper dimming overlay strength, 0-100 (higher = darker). */
  dim: number;
  /** Whether surface tokens should be translucent (wallpaper visible). */
  wallpaperVisible: boolean;
  /** Overall UI translucency, 0-100; 50 is the shipped look. */
  transparency: number;
}

const LIGHT_SURFACE_TONES = { lowest: 100, low: 96, container: 94, high: 92, highest: 90 };
const DARK_SURFACE_TONES = { lowest: 4, low: 10, container: 12, high: 17, highest: 22 };

// The shipped alphas and the readability floors for the transparency slider:
// one knob scales every surface class, but text areas never go fully clear.
const SHIPPED_ALPHA = { surface: 0.72, panel: 0.62, input: 0.5, popover: 0.92 };
const ALPHA_FLOORS = { surface: 0.3, panel: 0.18, input: 0.2, popover: 0.6 };

function clampTransparency(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 50;
  return Math.max(0, Math.min(100, n));
}

/**
 * Alphas for the four surface classes. 50 = shipped look; 0 = fully opaque;
 * 100 = twice as glassy as shipped (bounded by the floors above). Without a
 * visible wallpaper everything is opaque regardless of the knob.
 */
export function surfaceAlphas(opts: { wallpaperVisible: boolean; transparency: number }) {
  if (!opts.wallpaperVisible) return { surface: 1, panel: 1, input: 1, popover: 1 };
  const m = clampTransparency(opts.transparency) / 50;
  const a = (k: keyof typeof SHIPPED_ALPHA) =>
    Math.max(ALPHA_FLOORS[k], Math.min(1, 1 - (1 - SHIPPED_ALPHA[k]) * m));
  return { surface: a("surface"), panel: a("panel"), input: a("input"), popover: a("popover") };
}

export function buildVariableOverrides(theme: Theme, opts: ThemeOptions): string {
  return `${rootBlock(theme, opts)}\n.dark{${tokenRows(theme, "dark", opts).join("")}}`;
}

/**
 * Transparency-only overrides for `monet: false`: make the wallpaper show
 * through with neutral scrims while keeping ZCode's own colors untouched.
 * Only background/surface/input tokens are set; foregrounds, accents and
 * borders stay native.
 */
export function buildTransparencyOverrides(opts: { dim: number; transparency: number }): string {
  return `:root,:host{${transparencyRows("light", opts).join("")}}\n.dark{${transparencyRows("dark", opts).join("")}}`;
}

const LIGHT_SCRIM = "255,255,255";
const DARK_SCRIM = "18,18,22";

function transparencyRows(mode: "light" | "dark", opts: { dim: number; transparency: number }): string[] {
  const rgb = mode === "light" ? LIGHT_SCRIM : DARK_SCRIM;
  const al = surfaceAlphas({ wallpaperVisible: true, transparency: opts.transparency });
  return [
    `--color-background:transparent;`,
    `--color-background-alt:rgba(${rgb},${al.panel});`,
    `--color-background-win-alt:rgba(${rgb},${al.panel});`,
    `--color-panel:rgba(${rgb},${al.panel});`,
    `--color-sidebar:rgba(${rgb},${al.panel});`,
    `--color-surface:rgba(${rgb},${al.surface});`,
    `--color-surface-hover:rgba(${rgb},${al.surface});`,
    `--color-card:rgba(${rgb},${al.surface});`,
    `--color-card-selected:rgba(${rgb},${Math.min(1, al.surface + 0.15)});`,
    `--color-popover:rgba(${rgb},${al.popover});`,
    `--color-input:rgba(${rgb},${al.input});`,
    `--color-input-focused:rgba(${rgb},${Math.min(1, al.input + 0.2)});`,
    opts.dim > 0 ? `--zcode-beautify-dim:${opts.dim / 100};` : "",
  ].filter(Boolean);
}

function rootBlock(theme: Theme, opts: ThemeOptions): string {
  return `:root,:host{${tokenRows(theme, "light", opts).join("")}}`;
}

function tokenRows(theme: Theme, mode: "light" | "dark", opts: ThemeOptions): string[] {
  const s = mode === "light" ? theme.schemes.light : theme.schemes.dark;
  const t = mode === "light" ? LIGHT_SURFACE_TONES : DARK_SURFACE_TONES;
  const n = theme.palettes.neutral;
  const A = (argb: number, alpha = 1) => argbToCss(argb, alpha);

  // Surface alpha: with a wallpaper we let it through; without one, opaque.
  const al = surfaceAlphas(opts);
  const baseAlpha = al.surface;
  const panelAlpha = al.panel;
  const inputAlpha = al.input;
  const popoverAlpha = al.popover;

  return [
    // Window & page backgrounds become transparent so the wallpaper layer shows.
    `--color-background:transparent;`,
    `--color-background-alt:${A(n.tone(t.high), panelAlpha)};`,
    `--color-background-win-alt:${A(n.tone(t.low), panelAlpha)};`,
    `--color-panel:${A(n.tone(t.low), panelAlpha)};`,
    `--color-sidebar:${A(n.tone(t.low), panelAlpha)};`,
    `--color-surface:${A(n.tone(t.lowest === 100 ? 98 : 6), baseAlpha)};`,
    `--color-surface-hover:${A(n.tone(t.high), baseAlpha)};`,
    `--color-card:${A(n.tone(t.container), baseAlpha)};`,
    `--color-card-selected:${A(n.tone(t.highest), Math.min(1, baseAlpha + 0.15))};`,
    `--color-card-border:${A(s.outlineVariant, 0.5)};`,
    `--color-popover:${A(n.tone(t.container), popoverAlpha)};`,
    `--color-input:${A(n.tone(t.highest), inputAlpha)};`,
    `--color-input-focused:${A(n.tone(t.highest), Math.min(1, inputAlpha + 0.2))};`,
    `--color-input-border:${A(s.outlineVariant, 0.6)};`,
    `--color-input-border-hover:${A(s.outline, 0.7)};`,
    `--color-input-border-focused:${A(s.primary, 0.9)};`,

    `--color-foreground:${A(s.onSurface)};`,
    `--color-foreground-subtle:${A(s.onSurfaceVariant)};`,
    `--color-foreground-subtlest:${A(s.onSurfaceVariant, 0.72)};`,
    `--color-foreground-inverse:${A(s.inverseOnSurface)};`,

    `--color-primary:${A(s.primary)};`,
    `--color-primary-foreground:${A(s.onPrimary)};`,
    `--color-secondary:${A(s.secondaryContainer)};`,
    `--color-accent:${A(s.tertiary)};`,
    `--color-brand:${A(s.primary)};`,

    `--color-border:${A(s.outlineVariant, 0.55)};`,
    `--color-border-hover:${A(s.outlineVariant, 0.9)};`,
    `--color-border-color-interactive:${A(s.outlineVariant, 0.7)};`,
    `--color-border-color-interactive-hover:${A(s.outlineVariant, 1)};`,
    `--color-border-color-interactive-active:${A(s.primary, 0.9)};`,
    `--color-find-highlight:${A(s.tertiaryContainer)};`,
    `--color-find-highlight-active:${A(s.secondaryContainer)};`,
    `--divider-color:${A(s.outlineVariant, 0.4)};`,
    opts.dim > 0 ? `--zcode-beautify-dim:${opts.dim / 100};` : "",
  ].filter(Boolean);
}
