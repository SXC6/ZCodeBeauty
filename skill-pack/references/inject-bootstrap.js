// The script injected into the renderer via Page.addScriptToEvaluateOnNewDocument
// AND Runtime.evaluate (registering alone does not run it for the current page).
//
// This file is a TEMPLATE COLLECTION, not a runnable module: fill the CAPS
// placeholders with JSON.stringify() so every value arrives as a safe JS
// literal, e.g.
//   const script = BOOTSTRAP
//     .replace("__CSS__", JSON.stringify(css))
//     .replace("__DATA_URI__", JSON.stringify(dataUri))
//     .replace("__MARKER__", JSON.stringify("my-beautify"));
// (JSON.stringify guarantees quoting; never interpolate by hand.)
//
// - BOOTSTRAP  — the required piece: wallpaper layer + token CSS + persistence
// - RESET      — uninstall path (remove everything BOOTSTRAP created)
// - SELF_HEAL  — optional: restores the theme from localStorage when absent
//
// `live-api.mjs` extracts BOOTSTRAP with a regex and fills it for you.
//
// Idempotent: safe to evaluate on every injection and every page load —
// it short-circuits when the CSS text did not change.

var BOOTSTRAP = `(function(){
  var MARKER = __MARKER__;
  var CSS = __CSS__;
  var DATA_URI = __DATA_URI__; // wallpaper image as data URI, or ""

  if (!window.__beautify) window.__beautify = {};
  if (window.__beautify.cssText === CSS) return; // nothing changed
  window.__beautify.cssText = CSS;

  // Theme token overrides + wallpaper layer rules.
  var style = document.getElementById(MARKER + '-style');
  if (!style) {
    style = document.createElement('style');
    style.id = MARKER + '-style';
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = CSS;

  // Wallpaper layer: behind everything, never intercepts input.
  var wp = document.getElementById(MARKER + '-wallpaper');
  if (DATA_URI) {
    if (!wp) {
      wp = document.createElement('div');
      wp.id = MARKER + '-wallpaper';
      document.documentElement.appendChild(wp);
    }
    wp.style.backgroundImage = 'url(' + DATA_URI + ')';
  } else if (wp) {
    wp.remove(); // wallpaper toggled off
  }

  // Persist for self-heal: if a later injection finds the style element gone
  // (e.g. the tool was not running yet), the panel/next injection can restore
  // from localStorage. Large images may exceed the quota — CSS alone is the
  // minimum worth keeping.
  try {
    localStorage.setItem(MARKER + ':css', CSS);
    localStorage.setItem(MARKER + ':wallpaper', DATA_URI);
  } catch (e) {}
})();`;

// Companion: removes everything the bootstrap created (uninstall path).
var RESET = `(function(){
  var MARKER = __MARKER__;
  document.getElementById(MARKER + '-style')?.remove();
  document.getElementById(MARKER + '-wallpaper')?.remove();
  if (window.__beautify) window.__beautify.cssText = null;
  try {
    localStorage.removeItem(MARKER + ':css');
    localStorage.removeItem(MARKER + ':wallpaper');
  } catch (e) {}
})();`;

// Self-heal snippet for an optional injected panel/tool: restores the theme
// from localStorage when the style element is missing.
var SELF_HEAL = `(function(){
  var MARKER = __MARKER__;
  if (document.getElementById(MARKER + '-style')) return;
  var css = null, wallpaper = null;
  try {
    css = localStorage.getItem(MARKER + ':css');
    wallpaper = localStorage.getItem(MARKER + ':wallpaper');
  } catch (e) { return; }
  if (!css) return;
  var style = document.createElement('style');
  style.id = MARKER + '-style';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  if (wallpaper && !document.getElementById(MARKER + '-wallpaper')) {
    var wp = document.createElement('div');
    wp.id = MARKER + '-wallpaper';
    document.documentElement.appendChild(wp);
    wp.style.backgroundImage = 'url(' + wallpaper + ')';
  }
})();`;

// The wallpaper layer rules go INTO the CSS (see SKILL.md step 4):
//
// html, body { background: transparent !important; }
// #<marker>-wallpaper {
//   position: fixed; inset: 0;
//   z-index: -2147483646;          /* behind everything */
//   background-size: cover;        /* or contain + blurred backdrop layer */
//   background-position: center;
//   background-repeat: no-repeat;
//   pointer-events: none;
//   filter: blur(0px);             /* user-tunable; add scale(1.04) when > 0 */
//   transform: scale(1);
// }
// #<marker>-wallpaper::after {    /* dim overlay, tuned via one variable */
//   content: '';
//   position: absolute; inset: 0;
//   background: rgb(0 0 0 / var(--beautify-dim, 0.25));
// }
