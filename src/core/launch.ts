/**
 * Config persistence + ZCode launcher.
 *
 * Production ZCode builds have no built-in CDP port, so the launcher starts
 * ZCode.exe with --remote-debugging-port. ZCode enforces a single instance via
 * requestSingleInstanceLock, so we detect an already-running instance first.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listTargets } from "./cdp.js";

export interface StoredConfig extends Partial<Omit<import("./inject.js").BeautifyConfig, "port">> {
  port?: number;
  /**
   * 本机控制 API 的端口,由 `serve` 启动时写入。CLI 的 --port(CDP)不是
   * 持久化设置,apiPort 同理只在 serve 真正跑起来后才有权威值;MCP 的
   * set_recovery_mode 注册 autostart 时从这里读,否则只能硬编码默认值,
   * 用户自定义 --api-port 时会注册出端口错位的服务。
   */
  apiPort?: number;
}

export function dataDir(): string {
  const override = process.env.ZCODE_BEAUTIFY_DATA_DIR;
  if (override) return override;

  const root = path.join(os.homedir(), ".zcode", "cli", "plugins", "data");
  // ZCode resolves ${ZCODE_PLUGIN_DATA} to "<name>@<marketplace>", so a plugin
  // install and a manually run CLI would otherwise write two different configs.
  // Prefer the plugin-scoped directory when it exists.
  const pluginScoped = path.join(root, "zcode-beautify@zcode-beautify");
  if (fs.existsSync(pluginScoped)) return pluginScoped;

  return path.join(root, "zcode-beautify");
}

export function configFile(): string {
  return path.join(dataDir(), "config.json");
}

export function loadConfig(): StoredConfig {
  try {
    return JSON.parse(fs.readFileSync(configFile(), "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

/**
 * 原子写 JSON:先写同目录临时文件,再 rename 到目标。直接 writeFileSync 覆盖,
 * 进程在写入中途死掉(升级、断电、强杀)会留下截断的 JSON,loadConfig 会
 * 静默退回 {} —— wallpaperPath 一丢,整个主题就"消失"了。同一卷上的
 * rename 是原子操作,目标要么是完整的旧文件,要么是完整的新文件。
 */
export function atomicWriteJson(file: string, data: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function saveConfig(config: StoredConfig): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  atomicWriteJson(configFile(), config);
}

/**
 * 壁纸在数据目录的规范名固定为 wallpaper.<扩展名>:换一张扩展名不同的新图
 * (jpg → png)后,旧文件会留下来,单张最大 20MB。两条导入路径
 * (/api/wallpaper 与 applyWallpaper)写入新文件后统一调用这里清掉不再被
 * 引用的旧副本;正则只匹配壁纸规范名,用户自己放进数据目录的其他文件一律不碰。
 */
export function cleanStaleWallpapers(dest: string): void {
  const dir = path.dirname(dest);
  const base = path.basename(dest).toLowerCase();
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return; // 目录读不到就无从清理,下一次导入会再试
  }
  for (const name of entries) {
    if (!/^wallpaper\.(jpe?g|png|gif|bmp|tiff?|webp)$/i.test(name)) continue;
    if (name.toLowerCase() === base) continue;
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* 被占用或权限不足:留着无害,只是多占一份空间 */
    }
  }
}

const ZCODE_EXE_CANDIDATES =
  process.platform === "win32"
    ? [
        process.env.ZCODE_WINDOWS_APP_INSTALL_DIR
          ? path.join(process.env.ZCODE_WINDOWS_APP_INSTALL_DIR, "ZCode.exe")
          : undefined,
        "C:\\Program Files\\ZCode\\ZCode.exe",
        path.join(os.homedir(), "AppData", "Local", "Programs", "ZCode", "ZCode.exe"),
      ].filter(Boolean)
    : process.platform === "darwin"
      ? ["/Applications/ZCode.app/Contents/MacOS/ZCode"]
      : ["/usr/bin/zcode", "/opt/ZCode/zcode"];

export function findZcodeExecutable(): string | undefined {
  return ZCODE_EXE_CANDIDATES.map((p) => p!).find((p) => {
    try {
      return fs.statSync(p!).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * Windows-only registry fallback for the static candidates above. Installs are
 * not always on C: (e.g. "D:\Program Files\zcode") and the NSIS uninstall entry
 * is the one place Windows reliably records where the app went — often without
 * an InstallLocation value, but always with an UninstallString pointing into
 * the install directory. Never throws: no entry, or a missing PowerShell, just
 * yields undefined.
 */
async function resolveZcodeExecutableFromRegistry(): Promise<string | undefined> {
  const script = `
$candidates = New-Object System.Collections.Generic.List[string]
$apppaths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ZCode.exe',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ZCode.exe',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ZCode.exe'
)
foreach ($k in $apppaths) {
  $v = (Get-ItemProperty -LiteralPath $k -ErrorAction SilentlyContinue).'(default)'
  if ($v) { $candidates.Add([string]$v) }
}
$roots = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
foreach ($root in $roots) {
  foreach ($key in Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue) {
    $p = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction SilentlyContinue
    if ($p.DisplayName -notlike '*ZCode*') { continue }
    if ($p.InstallLocation) { $candidates.Add((Join-Path ([string]$p.InstallLocation) 'ZCode.exe')) }
    foreach ($field in @([string]$p.UninstallString, [string]$p.DisplayIcon)) {
      if (-not $field) { continue }
      $m = [regex]::Match($field, '^"([^"]+)"')
      $exe = if ($m.Success) { $m.Groups[1].Value } else { ($field -split '\\s+')[0] }
      $dir = Split-Path -Parent $exe
      if ($dir) { $candidates.Add((Join-Path $dir 'ZCode.exe')) }
    }
  }
}
$found = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
if ($found) { $found[0] }
`;
  try {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: 15_000, windowsHide: true }
    );
    const found = stdout.trim();
    if (!found) return undefined;
    try {
      return fs.statSync(found).isFile() ? found : undefined;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

/** Static candidates first, then the Windows registry. */
export async function resolveZcodeExecutable(): Promise<string | undefined> {
  const local = findZcodeExecutable();
  if (local) return local;
  if (process.platform !== "win32") return undefined;
  return resolveZcodeExecutableFromRegistry();
}

const execFileAsync = promisify(execFile);

/**
 * Detects a live ZCode process. A running instance without the debug port
 * triggers the Electron single-instance lock: a newly spawned ZCode binds the
 * CDP port, forwards its args to the existing instance, then exits — closing
 * the port again. Launching must refuse upfront instead of racing that window.
 */
export async function isZcodeProcessRunning(): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      // This runs from the detached `serve` daemon, which has no console of its
      // own: without windowsHide Windows allocates a fresh console and the user
      // sees a black window flash every time the probe fires.
      const { stdout } = await execFileAsync("tasklist", ["/NH", "/FI", "IMAGENAME eq ZCode.exe"], {
        windowsHide: true,
      });
      return stdout.toLowerCase().includes("zcode.exe");
    }
    const name = process.platform === "darwin" ? "ZCode" : "zcode";
    const { stdout } = await execFileAsync("pgrep", ["-x", name]);
    return stdout.trim().length > 0;
  } catch {
    return false; // pgrep exits non-zero when no process matches
  }
}

export interface LaunchResult {
  started: boolean;
  reason?: string;
}

/**
 * Starts ZCode with the CDP port enabled. If a CDP endpoint is already
 * reachable we are done; if a ZCode instance is running *without* CDP, the
 * single-instance lock blocks us and the user must restart ZCode themselves.
 */
export async function launchZcode(port: number): Promise<LaunchResult> {
  try {
    await listTargets(port);
    return { started: false, reason: "already-running-with-cdp" };
  } catch {
    /* not reachable yet */
  }

  const exe = await resolveZcodeExecutable();
  if (!exe)
    throw new Error(
      "ZCode executable not found; set ZCODE_WINDOWS_APP_INSTALL_DIR or install ZCode to the default path."
    );

  if (await isZcodeProcessRunning()) {
    return { started: false, reason: "running-without-cdp" };
  }

  const child = spawn(exe, [`--remote-debugging-port=${port}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  // Wait for the CDP endpoint to come up.
  let up = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      await listTargets(port);
      up = true;
      break;
    } catch {
      /* keep waiting */
    }
  }
  if (!up) {
    throw new Error(
      "ZCode was started but no CDP endpoint appeared. Another instance may already be running without the debug port — quit ZCode completely and run `zcode-beautify launch` again."
    );
  }

  // Confirm the endpoint stays up: a second instance racing the single-instance
  // lock binds the port briefly and then quits, which would look like success.
  await new Promise((r) => setTimeout(r, 2000));
  try {
    await listTargets(port);
  } catch {
    throw new Error(
      "CDP came up but closed again immediately — a running ZCode instance took over via the single-instance lock. Quit ZCode completely and run `zcode-beautify launch` again."
    );
  }
  return { started: true };
}

async function killZcode(): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/F", "/IM", "ZCode.exe"], { windowsHide: true });
    } else {
      await execFileAsync("pkill", ["-x", process.platform === "darwin" ? "ZCode" : "zcode"]);
    }
    return true;
  } catch {
    return false; // nothing was running
  }
}

/**
 * Replaces a running ZCode with a fresh instance that has the CDP port open.
 *
 * `--remote-debugging-port` is read once at process startup, so an instance that
 * came up without it can never grow the port. ZCode keeps its window in the tray
 * (`closeToTrayOnWindows`), which is why closing the window is not enough and
 * the processes have to be terminated outright — callers must ask the user
 * first, since anything unsaved in a conversation is lost.
 */
export async function relaunchZcode(port: number): Promise<{ killed: boolean; started: boolean }> {
  const killed = await killZcode();

  // The single-instance lock is released asynchronously.
  for (let i = 0; i < 20 && (await isZcodeProcessRunning()); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }

  const result = await launchZcode(port);
  return { killed, started: result.started || result.reason === "already-running-with-cdp" };
}
