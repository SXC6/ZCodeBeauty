# Changelog

## v0.7.2

The palette grows quick picks, an adjustable overlay strength, and manual RGB
entry.

### Added

- **Quick color picks** — ten preset chips (white, black, red, orange, yellow,
  green, cyan, blue, purple, pink) inside the palette; one click applies the
  preset at the current strength. Nothing is remembered beyond the live config.
- **Adjustable overlay strength** — a 强度 slider (1-100%) replaces the fixed
  45% tint. It can never be set to 0% (or negative): "no overlay" is the
  overlay toggle / 重置 / right-click, not a strength. With nothing active the
  palette shows white at 0% and dragging the slider applies the shown color at
  the new strength. Exposed as `overlay_strength` on `apply_options` and
  `--overlay-strength <1-100>` on the CLI; the server rejects 0/negative.
- **Manual RGB entry** — three small inputs (R/G/B) in the palette, clamped to
  0-255; typing applies through the same path as picking.

### Changed

- The palette readout now includes the strength: `#RRGGBB (R,G,B) S%`, e.g.
  `#FFFFFF (255,255,255) 0%` when no overlay is active.
- Internal refactor of the payload assembly (named constants, small pure
  helpers for the page/backdrop/wallpaper CSS blocks) — emitted CSS is
  unchanged apart from the strength value.

## v0.7.1

The overlay color picker becomes a proper in-panel palette.

### Changed

- **The palette is now a custom widget instead of the native color popup.** The
  native `<input type=color>` popup could not be positioned (it appeared over
  the panel) and closed on any outside click or wheel tick. The palette now
  docks to the left of the 叠加颜色 button, fully outside the panel, and stays
  open no matter where you click or scroll; clicking the button again or
  关闭 puts it away. It moves with the panel when dragged.
- **Opening shows the effective color.** The palette is seeded from the active
  overlay color; with no overlay active it starts at white `#FFFFFF
  (255,255,255)`. The hex + RGB readout and swatch update live while picking,
  and the color applies to the wallpaper as you drag.
- **重置 / 关闭 buttons.** 重置 closes the palette and cancels the overlay in
  one step; the 叠加颜色 button flips back to its inactive label via the
  regular refresh. Right-clicking the button still cancels the overlay
  directly.

## v0.7.0

A gentler blur algorithm and a wallpaper color overlay.

### Added

- **Wallpaper color overlay** — blend a picked color over the wallpaper at 45%
  opacity, on top of (and behind) the existing dim. Exposed as `overlay_color`
  on `apply_options`, `--overlay-color <#rrggbb|none>` on the CLI, and a new
  panel button: left-click opens a color picker, right-click clears the
  overlay; the button lights up while an overlay is active.
- The panel's action buttons now sit in a 2×2 grid: 背景填充 / 更换图片 /
  叠加颜色 / 还原默认外观.

### Changed

- **The blur slider is damped**: the actual Gaussian radius is the slider value
  × 0.3. A full-screen blur reads far stronger than its nominal radius, so the
  old 1px step was already heavy; the slider now sweeps the subtle range first.
- **Blur can no longer change the wallpaper's framing.** The 32px off-screen
  bleed used to hide the fringe rescaled `background-size: cover` and zoomed
  the picture by several percent whenever blur > 0. The blur now runs as a
  `backdrop-filter` frost on a full-viewport `::before` above the picture —
  which blurs cleanly out to the viewport edge in this Chromium — so the
  wallpaper box stays at `inset: 0` and the framing is pixel-identical whether
  the slider is 0 or 30. The color overlay moved onto `::after` (dim + tint),
  and the panel previews blur/dim through CSS variables instead of inline
  filter styles. Stale inline filter/transform are still cleared on re-inject.

### Fixed

- **The 2×2 action buttons rendered unevenly.** The native `appearance:
  button` gave the two `<button>`s a taller intrinsic content box than the
  sibling label (34.5px vs 30.5px), and the slider-row label rule leaked onto
  the 更换图片 label (flex/space-between, extra bottom margin, dimmed text).
  Grid buttons now opt out of native appearance and the label rule is scoped
  with `:not(.zb-grid)` — all four measure the same.
- **A push before the panel's first load could wipe settings.** Controls start
  at neutral defaults and are filled from the stored config by an async
  refresh; a slider input in that window posted the defaults (dim 0, etc.),
  overwriting real values. Pushes now wait for the first successful load and
  flush the touched control right after.

## v0.6.2

Two panel defects reported from the field, both fixed in the injected panel.

### Fixed

- **The 🎨 button could read as dead.** After the panel was dragged and the
  window later resized smaller, the panel could sit entirely outside the
  viewport while still "open" — clicking 🎨 toggled it, but nothing appeared.
  Opening the panel now re-anchors it to the default corner whenever it lies
  out of view.
- **Dragging a slider made the picture jump between display states.** The
  panel's 4s status poll restamped every control from the stored config, so
  mid-drag the slider (and the injected look — blur, zoom, translucency)
  snapped back to the last saved value before the debounced push landed. The
  poll no longer touches a control the user is currently on
  (`document.activeElement` guard, same pattern as the recovery select).
- `colors` now honors `--blur`, `--dim`, `--fit` and `--no-monet` (they were
  silently ignored before; the usage text documents them).

## v0.6.1

The autostart entry no longer goes stale after plugin updates.

### Fixed

- The `always` recovery mode registered the resident service with a **hardcoded
  version path** (`cache/<version>/dist/cli.js`). Every plugin update left the
  entry pointing at the old bundle, so after a reboot the stale service
  injected a panel without the newest features (field report: the new
  transparency slider vanished after update + restart). The entry now boots a
  version-stable shim in the plugin data dir (`autostart.mjs`) that resolves
  the newest installed bundle on every start, on all three platforms.
  Re-run `autostart install` (or re-select "always" in the panel) once to
  migrate an existing entry.

## v0.6.0

One knob for the translucency of every UI surface.

### Added

- **`transparency` (0–100, default 50)** — a single dial that scales the
  translucency of all surface classes (cards, panels/sidebar, inputs, popovers)
  together: 50 is the shipped look, lower values make the UI more opaque, higher
  values more glassy. Readability floors keep text areas legible at the extreme,
  and with the wallpaper hidden everything stays opaque regardless. Exposed
  everywhere:
  - `apply_options` and `set_background` MCP tools;
  - `colors --transparency <0-100>` on the CLI;
  - an "界面透明" slider in the settings panel (persisted with the rest).

## v0.5.1

- LICENSE now carries both copyright notices — the original author's
  (Logocceai, required to be preserved by MIT) and the fork maintainer's
  (SXC6). Manifest author metadata updated accordingly.
- INSTALL-FOR-AI: the AI installer now checks for Node ≥ 20 first and installs
  it when missing, before following the install routes.

## v0.5.0

Root-cures the most common "the theme did not come back" report seen in the
field, and rewrites the AI installer instructions around the official CLI.

### Added

- **`repair-launchers` now guarantees a working entry.** Machine-wide shortcuts
  (Public Desktop, ProgramData Start Menu) need elevation and stay unfixable —
  and in the field they are what users actually click. When no per-user
  shortcut (Desktop, Start Menu, pinned taskbar) carries the debug flag after
  the scan, the repair resolves the ZCode executable through the registry and
  creates `ZCode (Beautified).lnk` on the Desktop with the flag. Starting the
  app from it always opens the CDP port.
- Sample 4K wallpaper under `samples/`.

### Changed

- **INSTALL-FOR-AI Route B now installs through the official `zcode plugins`
  CLI** (`plugins marketplace add` + `plugins install`). Hand-writing the
  registration JSON failed in the field: ZCode 3.14.4 silently ignores records
  missing `source` / `cacheTransactionId`. The JSON route remains documented as
  a fallback with the corrected record shape.
- Repository moved to SXC6/ZCodeBeauty (manifest and package metadata updated);
  the plugin identity and MIT license are unchanged. Based on the original
  work by Logocceai.

### Fixed

- The settings panel's image picker and `/api/wallpaper` now reject WebP up
  front with a clear message — the bundled decoder cannot read it, and the
  failure previously surfaced only after the file was saved.

## v0.4.0

Finds the ZCode executable on non-default install locations, and hardens the
`apply` front door.

### Added

- **Registry-based ZCode lookup.** `findZcodeExecutable()` only knew
  `C:\Program Files\ZCode` and the per-user Programs directory, so on installs
  to another drive (`D:\Program Files\zcode`, for example) `launch` failed with
  "ZCode executable not found" even though the app was right there. The static
  candidates are now a fallback: when none exists, the Windows registry is
  queried (App Paths under HKLM/HKCU/WOW6432Node, plus Uninstall entries with a
  ZCode display name, deriving the install directory from `InstallLocation`,
  `UninstallString` or `DisplayIcon` — the NSIS entry often lacks
  `InstallLocation`). The first path that really exists wins.
- `set_background` accepts an optional `fit` (`cover` / `contain` / `smart`),
  matching what the CLI's `--fit` and `apply_options` already offered.
- Image decode failures name the supported formats instead of surfacing jimp's
  raw decoder error.

### Fixed

- `apply --dim 30 pic.jpg` treated `30` as the image path: the positional
  argument scan skipped flag *names* but not their *values*. Flag values are
  now skipped, so the option order no longer matters.
- `apply --fit bogus` was stored verbatim and silently rendered as `cover`.
  It is now rejected up front with the valid values.

## v0.3.3

The plugin now keeps the debug port alive across ZCode updates by itself, and
covers one more class of launch entry.

### Added

- **Startup launcher check.** When ZCode starts without the debug port — the
  failure mode after every app update, because the updater rebuilds the Start
  Menu shortcut without the flag — the MCP host repairs the launch entries as
  soon as it has confirmed the port is unreachable, so the *next* start is
  clean. Same repair as `repair-launchers`, no resident cost, and nothing runs
  while the port is reachable. This matters most for third-party launchers
  (Flow Launcher, PowerToys Run, …): they index the Start Menu shortcut and
  start it through ShellExecute, so the flag on that shortcut is what makes
  them work.
- Pinned taskbar shortcuts (`…\Quick Launch\User Pinned\TaskBar`) are scanned
  and repaired like the other per-user shortcuts.

### Changed

- `status` explains the likely cause — and the fix — when the CDP port is
  unreachable, instead of only reporting the error.
- README and INSTALL-FOR-AI document which entries ZCode itself resets: the
  updater rebuilds the Start Menu shortcut without the flag, and the app
  re-registers its protocol and context-menu registry handlers on every start.
  Shortcuts are the durable entries.

## v0.3.2

Stops the resident service from flashing a black console window on Windows.

### Fixed

- The process probe in `isZcodeProcessRunning()` ran `tasklist` without hiding
  the child console. The probe runs inside the detached `serve` daemon, which has
  no console of its own, so Windows allocated a fresh one on every call — and
  Windows 11 hands a new console to Windows Terminal. The result was a window
  titled `C:\WINDOWS\system32\tasklist.exe` appearing and vanishing every ~15
  seconds whenever the probe fired, i.e. whenever ZCode was not running, for as
  long as the daemon stayed alive. `tasklist`, `taskkill` and the PowerShell
  launcher-repair call are now spawned with `windowsHide: true`, which is what
  the launcher spawn and the daemon's own `spawn` already did.

## v0.3.1

Fixes the autostart entry behind recovery mode `always` on Windows. The script
it wrote was not valid VBScript, so Windows Script Host never ran it: the entry
was present and enabled, yet the resident service never started and the theme
was gone after every reboot.

### Fixed

- `autostart install` (and selecting `always`) assembled the command line out of
  separately quoted fragments, leaving everything after the first path outside a
  string literal — a parse error, not a concatenation. The whole command is now
  one VBScript string literal, with the paths quoted for Windows inside it.
  Re-run `zcode-beautify autostart install` (or re-select `always` in the
  settings panel) to rewrite an existing entry; it only matters from the next
  sign-in, since a running service keeps working either way.

## v0.3.0

The theme now restores itself. This release fixes the "the plugin stopped
working" report that followed every ZCode restart, and closes a security gap in
the local control API.

### Added

- **Recovery modes** (`recovery_status`, `set_recovery_mode`). The injected
  theme dies with the renderer on every restart, so something has to put it
  back. Three modes, chosen by the user:
  - `on-start` (default) — the MCP host ZCode spawns at startup restores it
    once. No resident process, no settings panel.
  - `always` — registers an autostart entry for the resident `serve` daemon, so
    both the theme and the settings panel survive a reboot. Costs a background
    node process (~60 MB, ~0.3% of one core).
  - `off` — nothing automatic.
  The settings panel carries a picker with the same three options and a
  plain-language note about what each costs.
- **`repair-launchers`** — scans desktop and Start Menu shortcuts, the
  `zcode://` protocol handler and the Explorer context-menu verbs, and appends
  the missing `--remote-debugging-port`. ZCode cannot open the port on its own:
  the flag has to come from whatever launches it, and a machine typically has
  several launch entries with only some of them carrying it.
- The settings panel now reports when ZCode is running with its debug port
  closed — the one case no background process can fix — and offers a button
  that restarts the app properly.

### Fixed

- The CLI and the plugin host wrote **two different `config.json` files**: the
  CLI fell back to `plugins/data/zcode-beautify/` while the host points
  `ZCODE_BEAUTIFY_DATA_DIR` at the `…@zcode-beautify` form it derives from
  `${ZCODE_PLUGIN_DATA}`. Settings changed through one path were invisible to
  the other. They now resolve to the same directory.
- The control API answered any request that could reach localhost, including
  from any web page open in a local browser, and could replace the wallpaper or
  reset the appearance. It now requires a token that only the injected panel
  carries; `/api/health` stays open since it exposes nothing but the service
  identity.
- `holdSession` leaked its WebSocket when a step after the connect failed, and
  held sessions were never dropped while CDP was unreachable. Both accumulated
  connections over long runs.
- The MCP server reported a hard-coded version that had drifted from the
  manifest. It is now injected at bundle time from `package.json`.

## v0.2.1

- The settings panel is honest when `serve` is not running: an explicit offline
  banner, zeroed and non-interactive controls, and a retry button, instead of
  rendering plausible-looking defaults it never read.
- `serve --detach` backgrounds the service so the panel outlives the shell that
  started it; a second `serve` refuses to start and names the pid that already
  owns the port.
- `/api/health` identifies the service and its pid.

## v0.2.0

- Settings panel with live tuning (blur, dim, Monet colors, wallpaper
  visibility, framing), wallpaper import, and reset/restore.
- `/beautify` slash command and MCP tools.
- Platform-agnostic skill pack for beautifying any Electron app over CDP.
