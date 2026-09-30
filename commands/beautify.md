---
description: Set a ZCode desktop wallpaper and adapt the UI with Monet colors
argument-hint: "[image path or description]"
---

# ZCode Beautify

The user wants to beautify the ZCode desktop client. $ARGUMENTS

## Steps

1. **Resolve the wallpaper image.** If a file path is given in the arguments,
   use it. Otherwise ask the user for an image path (absolute path works best).
2. **Check CDP availability** by running `node <plugin-root>/dist/cli.js status`
   if available, or simply try the tool below and read the error.
   `<plugin-root>` is the installed plugin directory; if unknown, locate it
   under `~/.zcode/cli/plugins/cache/` (the folder whose
   `.zcode-plugin/plugin.json` has name `zcode-beautify`).
3. **Apply the wallpaper** with the `set_background` MCP tool, passing the
   absolute image path and any `blur` / `dim` preferences the user mentioned.
4. **If it fails with a CDP/port error**, the running ZCode instance was not
   started with the debug port. Tell the user to run:
   `node <plugin-root>/dist/cli.js launch`
   (this restarts ZCode with `--remote-debugging-port=9222` — unsaved work in
   other apps is not affected, ZCode sessions are persisted), then retry.
5. **Fine-tune without changing the image** using the `apply_options` MCP tool
   (`blur` / `dim` / `monet` / `wallpaper_visible`) when the user asks to adjust
   the look — no need to re-send the image.
6. **Report the result** and mention:
   - `node <plugin-root>/dist/cli.js serve --detach` keeps a draggable settings
     panel inside ZCode for live tuning (blur/dim sliders, Monet toggle,
     wallpaper swap, reset). Always pass `--detach`: a foreground `serve` dies
     with the shell that started it, and the panel then reports itself offline.
     Do not start a second `serve` — the CLI refuses a duplicate and names the
     pid that already owns the port;
   - `reset_appearance` restores the default look.
