# INSTALL-FOR-AI — install the ZCode beautify plugin (AI instructions)

> **You are an AI agent.** A user handed you this file (or the repository link
> <https://github.com/Logocceai/zcode-beautify>) and wants the finished plugin
> installed into **their ZCode desktop client**. Follow this document top to
> bottom. If you can run shell commands, use **Route B**; otherwise use
> **Route A** to guide the user, or **Route C** to output instructions.

## First: is this even the right package?

This repository ships **two different things**. Do not confuse them:

| | **Plugin package** (you are here) | **Skill pack** (`skill-pack/`) |
|---|---|---|
| Target | The user's **ZCode desktop client** | **Any** Electron app (other AI platforms, custom apps) |
| Your role | **Installer** — set up the ready-made plugin | **Developer** — build a similar beautify tool from scratch |
| User says | "Install this beautify plugin in my ZCode" | "Build wallpaper/color beautification for my XX app" |
| You read | `INSTALL-FOR-AI.md` (this file) | `skill-pack/SKILL.md` |
| Result | A working `/beautify` command + MCP tools in ZCode | A new local tool the user runs themselves |

If the user's goal is "just make my ZCode pretty" → continue below.
If they want to beautify a non-ZCode app or develop their own → read
`skill-pack/SKILL.md` instead and stop following this file.

## What you are installing

`zcode-beautify` v0.5.0 — a ZCode plugin that adds a wallpaper layer +
Material Design 3 (Monet) dynamic color to the ZCode desktop client over CDP,
with a `/beautify` slash command, MCP tools (`set_background`, `apply_options`,
`refresh_theme`, `reset_appearance`, `beautify_status`, `recovery_status`,
`set_recovery_mode`, `repair_launchers`), and a live settings panel. Everything
is prebuilt in `dist/` — nothing to compile.

## Route A — guide the user through the UI (no shell needed, official path)

Tell the user, step by step:

1. Open ZCode → **Settings → Plugin Management → Discover**.
2. Click **+** and add the marketplace:
   - online: paste `https://github.com/SXC6/ZCodeBeauty`
   - offline: first unzip the package you were given, then add the unzipped
     folder (it contains `marketplace.json` at its root).
3. Click **Get** on the *zcode-beautify* card.
4. Continue with **"After installation"** below.

## Route B — install it yourself (you have shell access)

**Preferred path: the official `zcode plugins` CLI.** ZCode ships a real
plugin CLI and it writes every registration file in exactly the format your
client version expects. Hand-writing the JSON files has failed in the field —
the ZCode 3.14.4 loader silently ignored an otherwise-correct record that was
missing `source` and `cacheTransactionId` — so only fall back to that when the
CLI is truly unreachable.

1. **Get the files** into a folder that will stay put (marketplace refresh
   re-reads it):
   ```bash
   git clone https://github.com/SXC6/ZCodeBeauty.git
   ```
   No git? Download the release zip and unzip. The folder root carries
   `marketplace.json`, so the folder itself is the marketplace.

2. **Locate the ZCode CLI.** The desktop app bundles it:
   - Windows: `<install dir>\resources\glm\zcode.cjs` — typical installs are
     `C:\Program Files\ZCode\` and `D:\Program Files\zcode\`; if the folder is
     not obvious, read the `UninstallString` of the `ZCode` entry under
     `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` and use its
     directory.
   - Run it with any Node.js ≥ 20 that is on PATH (`node "<path to zcode.cjs>" …`).

3. **Add the marketplace and install** (quote every path):
   ```bash
   node "<zcode.cjs>" plugins marketplace add "<clone folder>"
   node "<zcode.cjs>" plugins install zcode-beautify@zcode-beautify
   node "<zcode.cjs>" plugins list
   ```
   `plugins list` must show `zcode-beautify@zcode-beautify [enabled]` with
   `skills: 1, commands: 1, mcp: 1`. If it shows up disabled, run
   `node "<zcode.cjs>" plugins enable zcode-beautify@zcode-beautify`.

4. **Tell the user to fully restart ZCode** so the plugin loads, then continue
   with **"After installation"** below.

### Fallback — hand-write the registration (only if the CLI is unavailable)

ZCode's plugin system stores everything under `~/.zcode/cli/plugins/`
(Windows: `C:\Users\<user>\.zcode\cli\plugins\`). Work with JSON-aware tooling
(Node, Python, jq) — never regex-edit these files; always read → merge → write
back preserving everything else.

1. Stage a marketplace copy: `<clone>/` → `~/.zcode/cli/plugins/marketplaces/zcode-beautify/`.
2. Register the marketplace in `~/.zcode/cli/plugins/known_marketplaces.json`
   (create if missing: `{ "version": 1, "marketplaces": [] }`), appending:
   ```json
   {
     "id": "zcode-beautify",
     "source": { "source": "directory", "path": "<the stable clone folder>" },
     "name": "zcode-beautify",
     "description": "Wallpaper + Material Design 3 (Monet) dynamic color for the ZCode desktop client.",
     "addedAt": "<now, ISO-8601>",
     "pluginCount": 1,
     "lastUpdated": "<now, ISO-8601>"
   }
   ```
3. Cache the plugin: `<clone>/` →
   `~/.zcode/cli/plugins/cache/zcode-beautify/zcode-beautify/<version>/`
   (folder name = the version in `.zcode-plugin/plugin.json`; copy
   `node_modules/` too — the loader expects the full source tree).
4. Record the installation in `~/.zcode/cli/plugins/installed_plugins.json`
   (create if missing). Verified working record shape on ZCode 3.14.4 — the
   last two fields are the ones a naive record omits, and without them the
   loader skips the plugin silently:
   ```json
   {
     "version": 1,
     "plugins": [
       {
         "id": "zcode-beautify@zcode-beautify",
         "name": "zcode-beautify",
         "marketplace": "zcode-beautify",
         "version": "<version>",
         "installPath": "<the cache folder from step 3>",
         "installedAt": "<now, ISO-8601>",
         "updatedAt": "<now, ISO-8601>",
         "scope": "user",
         "source": "./",
         "cacheTransactionId": "<any UUID v4>"
       }
     ]
   }
   ```
5. Verify with `plugins list` semantics: restart ZCode and check that
   `/beautify` appears in the command menu. If it does not, re-do the
   registration through the CLI (step 3 of the preferred path) instead of
   debugging the JSON.
6. Tell the user to fully restart ZCode, then continue with
   **"After installation"** below.

**Known caveats for Route B** (undocumented internal format — verify as you go):

- If the clone folder from step 1 is later deleted, marketplace *refresh* may
  log a `lastRefreshFailure` (an `EPERM`/rename error). Already-installed
  plugins keep working; re-clone to the same path to clear it.
- If ZCode's plugin files look different from this document (newer versions may
  change the schema), stop and fall back to **Route A** — never guess.

## After installation (both routes)

1. The plugin contributes the `/beautify` command and MCP tools
   (`set_background`, `apply_options`, `refresh_theme`, `reset_appearance`,
   `beautify_status`).
2. The wallpaper needs CDP: the ZCode desktop client must be started with
   `--remote-debugging-port=9222`. Instruct the user to fully quit ZCode, then
   run `node <plugin-dir>/dist/cli.js launch` (the plugin dir is the cache
   folder above; requires Node.js ≥ 20). Alternatively suggest editing the
   ZCode shortcut to append the flag.
3. **Make CDP survive restarts — do not skip this.** The debug port can only be
   supplied by whatever launches ZCode; an instance that is already running can
   never grow one. Run:
   ```bash
   node <plugin-dir>/dist/cli.js repair-launchers
   ```
   It scans every launch entry (desktop, Start Menu and pinned-taskbar
   shortcuts, the `zcode://` protocol handler, the Explorer context-menu verbs)
   and appends ` --remote-debugging-port=9222` to the ones missing it. Entries
   that need administrator rights are reported as `failed` and left untouched —
   launching from one of the updated shortcuts covers the common case. Add
   `--dry-run` first if you want to show the user what would change.
   Tell the user two facts for later: ZCode's updater rebuilds the Start Menu
   shortcut without the flag, and the app re-registers its protocol and
   context-menu handlers on every start, so both can lose the flag again. Most
   third-party launchers (Flow Launcher, PowerToys Run, …) start the app through
   the Start Menu shortcut. The plugin repairs the entries by itself on the next
   start without the debug port (`on-start` mode), and `repair-launchers` can be
   re-run by hand any time.
   Then tell the user: one full restart of ZCode with the flag is required
   (quit completely — the tray icon counts — and start from an updated entry).
4. **Ask the user how the theme should come back after a ZCode restart.** The
   injected wallpaper and colors live in the renderer, so every restart starts
   from a bare UI and something has to put them back. Present the three modes
   and let them choose (`node <plugin-dir>/dist/cli.js recovery <mode>`):
   - `on-start` (default) — the MCP host that ZCode spawns at startup restores
     the theme once. No resident process, but no settings panel either.
   - `always` — registers an autostart entry for the resident `serve` daemon, so
     the theme *and* the settings panel survive a reboot. Costs a background
     node process (~60 MB, ~0.3% of one core).
   - `off` — nothing automatic; the user re-applies by hand.
   The user can change this later from the settings panel, or by asking you to
   call the `set_recovery_mode` tool.
5. Then: `/beautify <path-to-an-image>` or `node <plugin-dir>/dist/cli.js apply
   "image.jpg" --blur 6 --dim 30 --fit smart`.
   For the live settings panel, start the service with `serve --detach`. Always
   pass `--detach`: it backgrounds the service so the panel keeps working after
   the shell (or the agent session) that started it goes away. A foreground
   `serve` is reaped with its parent, and the panel then reports itself offline.
   Start it once — a second `serve` refuses to start and prints the pid that
   already owns the port. Mode `always` handles this automatically.
6. Verify: CDP reachable (`node <plugin-dir>/dist/cli.js status`), wallpaper
   visible, `/beautify` available in a new conversation.

## Uninstall (if the user asks)

- Remove the `zcode-beautify` entry from `installed_plugins.json`, delete
  `cache/zcode-beautify/`, and (only if the user wants the marketplace gone)
  the `known_marketplaces.json` entry plus `marketplaces/zcode-beautify/`.
- Theme remnants in a running ZCode disappear on restart; the plugin never
  modified ZCode's own files.
