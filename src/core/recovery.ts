/**
 * Recovery settings: how — and whether — the theme comes back after ZCode has
 * restarted.
 *
 * The injected CSS and the wallpaper layer live inside the renderer, so every
 * ZCode restart starts from a bare UI. `localStorage` keeps a copy of the theme,
 * but the only code that knows how to apply it lives in the settings panel,
 * which `serve` injects. These modes decide who brings it back:
 *
 *   off       nothing automatic; the user re-runs `apply` / `colors` by hand.
 *   on-start  the MCP host that ZCode spawns at startup restores it once.
 *             No resident cost, no settings panel.
 *   always    an autostarted `serve` daemon keeps the theme and the panel alive
 *             across restarts, at the cost of a resident node process.
 */

import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./launch.js";
import {
  getAutostartStatus,
  installAutostart,
  uninstallAutostart,
  type AutostartSpec,
  type AutostartStatus,
} from "./autostart.js";

export type RecoveryMode = "off" | "on-start" | "always";

export interface RecoveryConfig {
  mode: RecoveryMode;
  updatedAt?: string;
}

export const RECOVERY_MODES: readonly RecoveryMode[] = ["off", "on-start", "always"];

export const DEFAULT_RECOVERY_MODE: RecoveryMode = "on-start";

export function normalizeMode(value: unknown): RecoveryMode | undefined {
  return typeof value === "string" && (RECOVERY_MODES as readonly string[]).includes(value)
    ? (value as RecoveryMode)
    : undefined;
}

export function recoveryFile(): string {
  return path.join(dataDir(), "recovery.json");
}

export function loadRecovery(): RecoveryConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(recoveryFile(), "utf8")) as Partial<RecoveryConfig>;
    return { mode: normalizeMode(raw.mode) ?? DEFAULT_RECOVERY_MODE, updatedAt: raw.updatedAt };
  } catch {
    return { mode: DEFAULT_RECOVERY_MODE };
  }
}

export function saveRecovery(config: RecoveryConfig): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(recoveryFile(), JSON.stringify(config, null, 2));
}

export function setRecoveryMode(mode: RecoveryMode): RecoveryConfig {
  const next: RecoveryConfig = { mode, updatedAt: new Date().toISOString() };
  saveRecovery(next);
  return next;
}

export interface RecoveryStatus extends RecoveryConfig {
  autostart: AutostartStatus;
}

/** The stored mode plus whether the autostart entry behind "always" is in place. */
export function recoveryStatus(): RecoveryStatus {
  return { ...loadRecovery(), autostart: getAutostartStatus() };
}

/**
 * Stores the mode and keeps the autostart entry in sync with it: "always" needs
 * the resident service to come back after a reboot, and every other mode must
 * not leave one behind.
 */
export function applyRecoveryMode(mode: RecoveryMode, spec: AutostartSpec): RecoveryStatus {
  setRecoveryMode(mode);
  if (mode === "always") installAutostart(spec);
  else uninstallAutostart();
  return recoveryStatus();
}
