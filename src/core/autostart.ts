/**
 * Autostart registration for the resident `serve` daemon.
 *
 * Only a process that is already running can re-inject the theme after ZCode
 * restarts. `on-start` covers that for free through the MCP host; `always`
 * additionally keeps the settings panel available, which needs a daemon that
 * survives a reboot. This module registers and removes that daemon using
 * per-user mechanisms only — never a machine-wide install or an elevated write.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const AUTOSTART_ID = "zcode-beautify";
export const AUTOSTART_LABEL = "com.logocceai.zcode-beautify";

export interface AutostartSpec {
  /** Node binary that should run the CLI. */
  nodePath: string;
  /** Absolute path to the bundled dist/cli.js. */
  cliPath: string;
  cdpPort: number;
  apiPort: number;
}

export interface AutostartStatus {
  platform: NodeJS.Platform;
  supported: boolean;
  installed: boolean;
  /** Where the registration lives; absent when the platform is unsupported. */
  entryPath?: string;
  /** Why it is unsupported or unusable, when that is the case. */
  note?: string;
}

function startupDir(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

function launchAgentPath(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${AUTOSTART_LABEL}.plist`);
}

function xdgAutostartPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(configHome, "autostart", `${AUTOSTART_ID}.desktop`);
}

export function autostartEntryPath(): string | undefined {
  if (process.platform === "win32") return path.join(startupDir(), `${AUTOSTART_ID}.vbs`);
  if (process.platform === "darwin") return launchAgentPath();
  if (process.platform === "linux") return xdgAutostartPath();
  return undefined;
}

/**
 * Absolute path of the running CLI bundle. Taken from argv rather than
 * `import.meta.url` because the core modules are bundled into dist/cli.js,
 * which sits at a different depth than their sources do.
 */
export function cliEntryPath(): string {
  const entry = process.argv[1];
  try {
    return fs.realpathSync(entry);
  } catch {
    return path.resolve(entry ?? "");
  }
}

/**
 * The command line as one VBScript string literal. VBScript writes a literal
 * quote as `""`, and the whole command has to stay inside that single literal:
 * WScript.Shell.Run takes the command already split, so text left outside the
 * quotes (as in `"""a""" """b"""`) is a syntax error, not a concatenation.
 */
function vbsLiteral(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function windowsScript(spec: AutostartSpec): string {
  const command = [
    `"${spec.nodePath}"`,
    `"${spec.cliPath}"`,
    "serve",
    "--port",
    String(spec.cdpPort),
    "--api-port",
    String(spec.apiPort),
    "--detach",
  ].join(" ");
  return [
    `' ZCode Beautify — restores the wallpaper and Monet colors after ZCode restarts.`,
    `' Runs \`serve --detach\` in the background, with no visible window.`,
    `' Delete this file (or run \`zcode-beautify autostart uninstall\`) to disable it.`,
    `CreateObject("WScript.Shell").Run ${vbsLiteral(command)}, 0, False`,
    ``,
  ].join("\r\n");
}

function macosScript(spec: AutostartSpec): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AUTOSTART_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${spec.nodePath}</string>
    <string>${spec.cliPath}</string>
    <string>serve</string>
    <string>--port</string>
    <string>${spec.cdpPort}</string>
    <string>--api-port</string>
    <string>${spec.apiPort}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
`;
}

function linuxScript(spec: AutostartSpec): string {
  const exec = [spec.nodePath, spec.cliPath, "serve", "--port", String(spec.cdpPort), "--api-port", String(spec.apiPort)]
    .map((part) => (/[\s"]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part))
    .join(" ");
  return `[Desktop Entry]
Type=Application
Name=ZCode Beautify
Comment=Keeps the ZCode wallpaper and Monet colors applied across restarts
Exec=${exec}
Terminal=false
X-GNOME-Autostart-enabled=true
`;
}

export function getAutostartStatus(): AutostartStatus {
  const platform = process.platform;
  const entryPath = autostartEntryPath();
  if (!entryPath) {
    return { platform, supported: false, installed: false, note: `autostart is not implemented for ${platform}` };
  }
  return { platform, supported: true, installed: fs.existsSync(entryPath), entryPath };
}

export function installAutostart(spec: AutostartSpec): AutostartStatus {
  const entryPath = autostartEntryPath();
  if (!entryPath) return getAutostartStatus();

  const script =
    process.platform === "win32"
      ? windowsScript(spec)
      : process.platform === "darwin"
        ? macosScript(spec)
        : linuxScript(spec);

  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  fs.writeFileSync(entryPath, script);
  return getAutostartStatus();
}

export function uninstallAutostart(): AutostartStatus {
  const entryPath = autostartEntryPath();
  if (!entryPath) return getAutostartStatus();
  fs.rmSync(entryPath, { force: true });
  return getAutostartStatus();
}
