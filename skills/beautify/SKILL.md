---
name: beautify
description: Beautify the ZCode desktop client — import a background wallpaper image and adapt all UI colors with Material Design 3 (Monet) dynamic color. Use when the user asks to set a background, wallpaper, theme, or re-color the ZCode UI.
---

# ZCode Beautify

This plugin themes the ZCode **desktop client** (Electron app) by injecting a
wallpaper layer and Monet-derived CSS variable overrides over CDP. It never
modifies ZCode's installation files.

## When to use

- "把这张图设为 ZCode 背景" / "set this image as the ZCode background"
- "换个主题颜色" / "make the UI match my wallpaper"
- "恢复默认外观" / "reset the appearance"

## Workflow

1. **Get an image path from the user.** Only absolute local paths are accepted.
2. **Call the `set_background` tool** with `image_path` (plus optional `blur`,
   `dim`). The tool copies the image into the plugin data dir, extracts the MD3
   source color, generates light/dark schemes, and injects everything into the
   running ZCode renderer.
3. **On CDP/port errors**: the ZCode instance is running without the debug
   port. Run `repair_launchers` first — it appends `--remote-debugging-port` to
   every launch entry missing it (desktop, Start Menu, pinned taskbar, the
   `zcode://` handler, the context-menu verbs), so a normal start opens the port
   from then on. Then have the user quit ZCode completely and start it again;
   the flag cannot be added to an instance that is already running. Expect to
   repeat this over time: ZCode's updater rebuilds the Start Menu shortcut
   without the flag, and the app re-registers its protocol / context-menu
   registry entries on every start. In `on-start` mode the plugin performs this
   repair by itself at startup whenever the port is unreachable.
4. **Fine-tune with `apply_options`** (blur / dim / monet / wallpaper_visible /
   fit) when the user wants adjustments — it does not need the image path
   again. `fit` picks the framing: `cover` fills and crops, `contain`
   letterboxes over a blurred backdrop, `smart` analyzes the picture locally
   and picks framing + focus automatically.
5. **After ZCode restarts**, the injected theme is gone — the renderer that held
   it no longer exists. `recovery_status` reports which mechanism is in charge:
   `on-start` (default) restores it automatically once ZCode is up, `always`
   keeps a resident service doing it, `off` leaves it to the user. Change it with
   `set_recovery_mode`. Either way `refresh_theme` forces a re-injection now.
6. **To undo everything**, use `reset_appearance`.
7. **Recommend the settings panel** for an interactive experience: a draggable
   panel inside ZCode with blur/dim sliders, Monet toggle, wallpaper swap and
   reset. It needs the resident service, so either set the recovery mode to
   `always` (which starts it and registers the autostart entry) or run
   `node <plugin-root>/dist/cli.js serve --detach` once. `--detach` matters — a
   foreground `serve` is reaped with the shell or agent session that spawned it,
   and the panel then shows its ⚠ offline banner. Never start a second `serve`:
   it refuses to start and names the pid holding the port. If the panel reports
   itself offline, run `serve --detach` rather than assuming the stored config
   is empty — an offline panel deliberately zeroes its controls.

## Tools

| Tool | Purpose |
|---|---|
| `set_background` | Set wallpaper + Monet colors |
| `apply_options` | Tune blur/dim/monet/wallpaper visibility/framing without changing the image |
| `refresh_theme` | Re-inject stored theme after a restart |
| `reset_appearance` | Remove wallpaper and overrides |
| `beautify_status` | Show stored config |
| `recovery_status` | Report the recovery mode, autostart entry and CDP reachability |
| `set_recovery_mode` | Switch between `off` / `on-start` / `always` |
| `repair_launchers` | Add the debug-port flag to every launch entry missing it; re-run after ZCode updates |

## Constraints

- ZCode must be running (or startable) with `--remote-debugging-port=9222`. The
  flag can only come from the launcher — `repair_launchers` writes it into the
  shortcuts and protocol handlers, and machine-wide entries need admin rights.
  Shortcuts are the durable entries; ZCode's updater rebuilds the Start Menu one
  and the app re-registers its registry handlers, so both can lose the flag
  again.
- The injected theme lives in the renderer and is wiped when ZCode restarts. The
  recovery mode decides who puts it back; `refresh_theme` forces it.
- Functional colors (success/warning/destructive) are intentionally preserved.
