/**
 * The injected settings panel: a floating, draggable panel in the ZCode
 * renderer for live-tuning blur/dim, toggling Monet colors and wallpaper
 * visibility, and swapping the wallpaper image — all via the local API
 * started by `zcode-beautify serve`.
 *
 * The script always rebuilds the panel, so a stale copy left in the DOM can
 * never shadow a newer script version, and it is safe to re-evaluate on every
 * injection or reload.
 */

import { hexToRgb, hsvToHex, rgbToHsv } from "./colorUtil.js";
import { SUPPORTED_IMAGE_MIME } from "../core/monet.js";

/** 面板选图控件的 accept 清单,与 server 白名单同源(不含 WebP)。 */
const ACCEPT_ATTR = SUPPORTED_IMAGE_MIME.join(",");

export const PANEL_ROOT_ID = "zcode-beautify-panel-root";

export function buildPanelScript(apiPort: number, token: string): string {
  const api = `http://127.0.0.1:${apiPort}`;
  return `(function(){
  var API = ${JSON.stringify(api)};
  var TOKEN = ${JSON.stringify(token)};
  var ROOT_ID = ${JSON.stringify(PANEL_ROOT_ID)};
  // Always rebuild: an older panel left in the DOM would otherwise shadow the
  // current script version forever (the old build skipped installation).
  var stale = document.getElementById(ROOT_ID);
  if (stale) stale.remove();
  var staleStyle = document.getElementById('zcode-beautify-panel-style');
  if (staleStyle) staleStyle.remove();

  var css = [
    '#zcode-beautify-panel-root, #zcode-beautify-panel-root * { box-sizing: border-box; font-family: system-ui, sans-serif; }',
    // The chrome follows ZCode's own light/dark switch (html.theme-zai-light
    // / -dark): every color is a variable, only the two blocks below differ.
    '#zcode-beautify-panel-root {',
      ' --zb-text: #e8e8ea; --zb-bg: rgba(24,24,30,.88); --zb-bg-solid: rgba(24,24,30,.97);',
      ' --zb-fab-bg: rgba(32,32,38,.78); --zb-fab-hover: rgba(52,52,60,.85);',
      ' --zb-btn-bg: rgba(255,255,255,.09); --zb-btn-hover: rgba(255,255,255,.16);',
      ' --zb-input-bg: rgba(255,255,255,.08); --zb-code-bg: rgba(0,0,0,.35);',
      ' --zb-line: rgba(255,255,255,.13); --zb-line-soft: rgba(255,255,255,.1); }',
    'html.theme-zai-light #zcode-beautify-panel-root {',
      ' --zb-text: #24292f; --zb-bg: rgba(255,255,255,.9); --zb-bg-solid: rgba(255,255,255,.98);',
      ' --zb-fab-bg: rgba(255,255,255,.85); --zb-fab-hover: rgba(238,238,244,.95);',
      ' --zb-btn-bg: rgba(0,0,0,.06); --zb-btn-hover: rgba(0,0,0,.12);',
      ' --zb-input-bg: rgba(0,0,0,.05); --zb-code-bg: rgba(0,0,0,.08);',
      ' --zb-line: rgba(0,0,0,.16); --zb-line-soft: rgba(0,0,0,.12); }',
    '#zcode-beautify-panel-root { position: fixed; inset: auto; z-index: 2147483647; font-size: 12px; color: var(--zb-text); }',
    '#zb-fab { position: fixed; right: 18px; bottom: 18px; width: 34px; height: 34px; border-radius: 50%;',
      ' background: var(--zb-fab-bg); border: 1px solid var(--zb-line); cursor: pointer;',
      ' display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px);',
      ' box-shadow: 0 2px 12px rgba(0,0,0,.35); user-select: none; font-size: 15px; line-height: 1; }',
    '#zb-fab:hover { background: var(--zb-fab-hover); }',
    '#zb-panel { position: fixed; right: 18px; bottom: 60px; width: 264px; padding: 0 0 10px;',
      ' background: var(--zb-bg); border: 1px solid var(--zb-line); border-radius: 12px;',
      ' backdrop-filter: blur(16px); box-shadow: 0 8px 32px rgba(0,0,0,.45); user-select: none; }',
    '#zb-panel[hidden] { display: none; }',
    '#zb-head { padding: 9px 12px; font-weight: 600; cursor: move; border-bottom: 1px solid var(--zb-line-soft);',
      ' display: flex; justify-content: space-between; align-items: center; }',
    '#zb-close { cursor: pointer; opacity: .7; padding: 0 4px; } #zb-close:hover { opacity: 1; }',
    '#zb-body { padding: 10px 12px 0; }',
    '.zb-row { margin-bottom: 10px; }',
    // :not(.zb-grid) — the grid's 更换图片 label is a .zb-btn pill; the
    // slider-label layout (flex/space-between/margin) must not leak onto it.
    '.zb-row:not(.zb-grid) label { display: flex; justify-content: space-between; margin-bottom: 4px; opacity: .85; }',
    '#zb-panel input[type=range] { width: 100%; accent-color: #7aa2f7; height: 18px; margin: 0; cursor: pointer; }',
    '.zb-toggles { display: flex; justify-content: center; gap: 16px; }',
    '.zb-toggles label { display: flex; align-items: center; gap: 5px; margin: 0; cursor: pointer; }',
    '.zb-actions { display: flex; justify-content: center; gap: 10px; }',
    '.zb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 6px; }',
    // appearance: none — a native button carries a taller intrinsic content
    // box than the sibling label, which made the grid rows unequal.
    '.zb-grid .zb-btn { padding: 6px 2px; font-size: 11px; appearance: none; }',
    '#zb-overlay[data-active="1"] { background: rgba(122,162,247,.30); border-color: rgba(122,162,247,.75); }',
    // Custom palette: the native <input type=color> popup closes on any outside
    // click or wheel tick and cannot be positioned, so the picker is DOM of our
    // own — docked left of the panel, outside it, never overlapping.
    '#zb-palette { position: absolute; z-index: 3; width: 190px; padding: 10px;',
      ' background: var(--zb-bg-solid); border: 1px solid var(--zb-line); border-radius: 10px;',
      ' box-shadow: 0 8px 32px rgba(0,0,0,.5); }',
    '#zb-palette[hidden] { display: none; }',
    '#zb-sv { position: relative; height: 110px; border-radius: 6px; cursor: crosshair; overflow: hidden;',
      ' touch-action: none;',
      ' background-image: linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)); }',
    '#zb-sv-knob { position: absolute; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%;',
      ' box-shadow: 0 0 4px rgba(0,0,0,.6); transform: translate(-50%, 50%); pointer-events: none; }',
    '#zb-hue { width: 100%; margin: 8px 0 0; height: 14px; border-radius: 7px; cursor: pointer; appearance: none;',
      ' background-image: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);',
      ' border: 1px solid var(--zb-line); }',
    '#zb-hue::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #fff;',
      ' border: 2px solid rgba(0,0,0,.35); box-shadow: 0 0 4px rgba(0,0,0,.4); }',
    '.zb-swatches { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }',
    '.zb-sw { width: 16px; height: 16px; border-radius: 4px; cursor: pointer; padding: 0;',
      ' border: 1px solid var(--zb-line); appearance: none; }',
    '.zb-sw:hover { transform: scale(1.15); }',
    '.zb-rgb { display: flex; align-items: center; gap: 4px; margin-top: 8px; font-size: 10px; opacity: .85; }',
    '.zb-rgb input { width: 40px; min-width: 0; padding: 2px 3px; font-size: 11px; color: inherit; border-radius: 4px;',
      ' background: var(--zb-input-bg); border: 1px solid var(--zb-line); }',
    '.zb-rgb input::-webkit-inner-spin-button, .zb-rgb input::-webkit-outer-spin-button { appearance: none; margin: 0; }',
    '#zb-pal-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11px; }',
    '#zb-swatch { width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--zb-line); flex: none; }',
    '#zb-pal-val { opacity: .85; white-space: nowrap; }',
    '#zb-strength-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11px; }',
    '#zb-strength { flex: 1; margin: 0; height: 14px; min-width: 0; cursor: pointer; accent-color: #7aa2f7; }',
    '#zb-strength-val { width: 34px; text-align: right; opacity: .85; }',
    '.zb-pal-actions { display: flex; gap: 8px; margin-top: 9px; }',
    '.zb-pal-actions .zb-btn { flex: 1; padding: 5px 0; font-size: 11px; appearance: none; }',
    '.zb-btn { display: inline-block; padding: 6px 20px; text-align: center; border-radius: 999px; cursor: pointer;',
      ' background: var(--zb-btn-bg); border: 1px solid var(--zb-line); color: inherit; font-size: 12px; }',
    '.zb-btn:hover { background: var(--zb-btn-hover); }',
    '#zb-status { min-height: 14px; padding: 2px 12px 0; opacity: .6; font-size: 11px; }',
    '#zb-offline { display: flex; flex-direction: column; gap: 6px; align-items: center;',
      ' padding: 10px 12px; background: rgba(120,53,15,.55); font-size: 11px; line-height: 1.5; text-align: center; }',
    '#zb-offline[hidden] { display: none; }',
    '#zb-offline code { background: var(--zb-code-bg); padding: 1px 4px; border-radius: 4px;',
      ' font-size: 10px; user-select: text; }',
    '#zb-offline .zb-hint { opacity: .85; }',
    // While offline the controls hold nothing we could read, so they must not
    // look interactive — a slider parked mid-track next to a "0px" label reads
    // as a real (wrong) setting.
    '#zcode-beautify-panel-root[data-offline="1"] #zb-body { opacity: .45; pointer-events: none; }',
    '#zcode-beautify-panel-root[data-offline="1"] #zb-status { display: none; }',
    '#zcode-beautify-panel-root[data-offline="1"] #zb-fab { border-color: rgba(248,113,113,.7); }',
    '#zb-needs-relaunch { display: flex; flex-direction: column; gap: 6px; align-items: center;',
      ' padding: 10px 12px; background: rgba(120,53,15,.45); font-size: 11px; line-height: 1.5; text-align: center; }',
    '#zb-needs-relaunch[hidden] { display: none; }',
    '#zb-recovery { width: 100%; padding: 4px 6px; border-radius: 6px; font-size: 11px; color: inherit;',
      ' background: var(--zb-input-bg); border: 1px solid var(--zb-line); }',
    '#zb-recovery option { color: #111; }',
    '#zb-recovery-hint { margin-top: 4px; opacity: .65; font-size: 10px; line-height: 1.45; }'
  ].join('');

  var style = document.createElement('style');
  style.id = 'zcode-beautify-panel-style';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  var root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML =
    '<div id="zb-fab" title="ZCode Beautify">🎨</div>' +
    '<div id="zb-panel" hidden>' +
    '  <div id="zb-head"><span>ZCode Beautify</span><span id="zb-close">✕</span></div>' +
    '  <div id="zb-offline" hidden>' +
    '    <div>⚠ 美化服务未运行,面板不可用</div>' +
    '    <div class="zb-hint">在插件目录执行 <code>node dist/cli.js serve --detach</code> 启动</div>' +
    '    <button class="zb-btn" id="zb-retry">重试连接</button>' +
    '  </div>' +
    '  <div id="zb-needs-relaunch" hidden>' +
    '    <div>⚠ ZCode 美化插件还没生效,需要重启一下 ZCode</div>' +
    '    <button class="zb-btn" id="zb-relaunch">立即重启 ZCode</button>' +
    '  </div>' +
    '  <div id="zb-body">' +
    '    <div class="zb-row"><label title="背景模糊程度(像素)"><span>背景模糊</span><span><span id="zb-blur-val">0</span>px</span></label>' +
    '      <input type="range" id="zb-blur" min="0" max="30" step="1" value="0"></div>' +
    '    <div class="zb-row"><label title="背景压暗程度(百分比,越高越暗)"><span>背景压暗</span><span><span id="zb-dim-val">0</span>%</span></label>' +
    '      <input type="range" id="zb-dim" min="0" max="80" step="1" value="0"></div>' +
    '    <div class="zb-row"><label title="界面整体透明程度:50 为默认,越低越不透明,越高越通透"><span>界面透明</span><span><span id="zb-trans-val">50</span></span></label>' +
    '      <input type="range" id="zb-trans" min="0" max="100" step="1" value="50"></div>' +
    '    <div class="zb-row zb-toggles">' +
    '      <label title="根据壁纸自动生成 UI 配色;关闭则保留 ZCode 原生颜色"><input type="checkbox" id="zb-monet">UI 莫奈取色</label>' +
    '      <label title="显示或隐藏背景壁纸"><input type="checkbox" id="zb-vis">显示壁纸</label>' +
    '    </div>' +
    '    <div class="zb-row zb-grid">' +
    '      <button class="zb-btn" id="zb-fit" title="背景填充方式:填满裁剪铺满窗口 / 完整显示不裁剪(模糊垫底)/ 智能适配自动分析画面主体">背景填充: …</button>' +
    '      <label class="zb-btn" for="zb-file" title="选择一张图片作为背景壁纸,UI 配色随之更新(支持 JPG/PNG/GIF/BMP/TIFF,不支持 WebP)">更换图片…</label>' +
    '      <input type="file" id="zb-file" accept="${ACCEPT_ATTR}" hidden>' +
    '      <button class="zb-btn" id="zb-overlay" title="选一个颜色叠加到壁纸上;调色板里可重置或关闭,右键按钮直接取消叠加">叠加颜色</button>' +
    '      <button class="zb-btn" id="zb-reset" title="移除壁纸与配色,还原 ZCode 默认外观(壁纸会被记住,可再次恢复)">还原默认外观</button>' +
    '    </div>' +
    // 分隔线必须用主题变量:早前写死的 rgba(255,255,255,.1) 在浅色主题下不可见。
    '    <div class="zb-row" style="border-top:1px solid var(--zb-line-soft);padding-top:8px">' +
    '      <label title="ZCode 每次重启都会丢掉壁纸和配色,这里决定由谁来把它们恢复回来"><span>自动恢复</span></label>' +
    '      <select id="zb-recovery">' +
    '        <option value="off">关闭</option>' +
    '        <option value="on-start">ZCode 启动时恢复</option>' +
    '        <option value="always">后台常驻(可用本面板)</option>' +
    '      </select>' +
    '      <div id="zb-recovery-hint"></div>' +
    '    </div>' +
    '  </div>' +
    '  <div id="zb-palette" hidden>' +
    '    <div id="zb-sv"><div id="zb-sv-knob"></div></div>' +
    '    <input type="range" id="zb-hue" min="0" max="360" step="1" value="0">' +
    '    <div class="zb-swatches">' +
    '      <button class="zb-sw" data-c="#ffffff" title="白" style="background:#ffffff"></button>' +
    '      <button class="zb-sw" data-c="#000000" title="黑" style="background:#000000"></button>' +
    '      <button class="zb-sw" data-c="#8c8c8c" title="灰" style="background:#8c8c8c"></button>' +
    '      <button class="zb-sw" data-c="#434343" title="深灰" style="background:#434343"></button>' +
    '      <button class="zb-sw" data-c="#ff4d4f" title="红" style="background:#ff4d4f"></button>' +
    '      <button class="zb-sw" data-c="#ff7a45" title="橙" style="background:#ff7a45"></button>' +
    '      <button class="zb-sw" data-c="#fadb14" title="黄" style="background:#fadb14"></button>' +
    '      <button class="zb-sw" data-c="#d4b106" title="金" style="background:#d4b106"></button>' +
    '      <button class="zb-sw" data-c="#52c41a" title="绿" style="background:#52c41a"></button>' +
    '      <button class="zb-sw" data-c="#389e0d" title="深绿" style="background:#389e0d"></button>' +
    '      <button class="zb-sw" data-c="#13c2c2" title="青" style="background:#13c2c2"></button>' +
    '      <button class="zb-sw" data-c="#1890ff" title="蓝" style="background:#1890ff"></button>' +
    '      <button class="zb-sw" data-c="#0050b3" title="深蓝" style="background:#0050b3"></button>' +
    '      <button class="zb-sw" data-c="#722ed1" title="紫" style="background:#722ed1"></button>' +
    '      <button class="zb-sw" data-c="#eb2f96" title="品红" style="background:#eb2f96"></button>' +
    '      <button class="zb-sw" data-c="#ffb8c6" title="粉" style="background:#ffb8c6"></button>' +
    '    </div>' +
    '    <div class="zb-rgb">' +
    '      <span>R</span><input type="number" id="zb-r" min="0" max="255" step="1">' +
    '      <span>G</span><input type="number" id="zb-g" min="0" max="255" step="1">' +
    '      <span>B</span><input type="number" id="zb-b" min="0" max="255" step="1">' +
    '    </div>' +
    '    <div id="zb-pal-row"><span id="zb-swatch"></span><span id="zb-pal-val"></span></div>' +
    '    <div id="zb-strength-row">' +
    '      <span>强度</span>' +
    '      <input type="range" id="zb-strength" min="0" max="100" step="1" value="45">' +
    '      <span id="zb-strength-val">45%</span>' +
    '    </div>' +
    '    <div class="zb-pal-actions">' +
    '      <button class="zb-btn" id="zb-pal-reset">重置</button>' +
    '      <button class="zb-btn" id="zb-pal-close">关闭</button>' +
    '    </div>' +
    '  </div>' +
    '</div>' +
    '<div id="zb-status"></div>';
  document.body.appendChild(root);

  function $(id) { return document.getElementById(id); }
  function wallpaperEl() { return document.getElementById('zcode-beautify-wallpaper'); }
  function status(msg) {
    var el = $('zb-status'); if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2200);
  }
  function auth(extra) {
    var h = extra || {};
    h['x-zb-token'] = TOKEN;
    return h;
  }
  // fetch 必须带超时:serve 单线程解码大图时整段无响应(最长 60s),没有
  // 超时的话状态栏永远停在"读取图片中…",离线检测也不会触发。post 的 90s
  // 覆盖"上传 + 60s 解码上限 + 取色"的最坏链路;状态轮询 10s 就该有回应。
  var POST_TIMEOUT = 90000, POLL_TIMEOUT = 10000;
  function isTimeout(e) { return e && (e.name === 'TimeoutError' || e.name === 'AbortError'); }
  function post(path, body, cb) {
    fetch(API + path, { method: 'POST', headers: auth({ 'Content-Type': 'application/json' }), body: JSON.stringify(body), signal: AbortSignal.timeout(POST_TIMEOUT) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.error) { status('操作失败: ' + d.error); return; }
        if (cb) cb(d);
      })
      .catch(function (e) { status(isTimeout(e) ? '服务响应超时,请稍后重试' : '无法连接美化服务 service unreachable'); });
  }

  // Local live preview; the server re-injects the authoritative CSS right after.
  // The blur and dim layers read :root variables, so previewing means setting
  // them — an inline filter on the wallpaper box itself would blur the box's
  // own edges and change its rendering.
  function preview() {
    var w = wallpaperEl(); if (!w) return;
    var b = Number($('zb-blur').value), d = Number($('zb-dim').value);
    w.style.filter = ''; w.style.transform = '';
    document.documentElement.style.setProperty('--zcode-beautify-blur', 'blur(' + (b * 0.3).toFixed(2) + 'px)');
    document.documentElement.style.setProperty('--zcode-beautify-dim', String(d / 100));
  }

  // Controls start at neutral defaults until the first successful refresh
  // fills them from the stored config. A push before that (a drag in the
  // panel's first moments) would overwrite real settings with the defaults,
  // so pushes wait for the first load and the touched control is flushed then.
  var loaded = false;
  var pendingPush = false;
  var pushTimer = null;
  function pushConfig() {
    if (!loaded) { pendingPush = true; return; }
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      post('/api/config', {
        blur: Number($('zb-blur').value),
        dim: Number($('zb-dim').value),
        transparency: Number($('zb-trans').value),
        monet: $('zb-monet').checked,
        wallpaperVisible: $('zb-vis').checked
      }, function (d) { status(d && d.windows > 0 ? '已应用 applied' : '已保存(ZCode 未连接)'); });
    }, 300);
  }

  // The control service lives in a separate process that can stop or die. When
  // it is unreachable the panel must say so instead of rendering values it
  // never read, and it must recover on its own once the service is back.
  var beatTimer = null;
  function panelOpen() { return !$('zb-panel').hidden; }
  /** Re-check the service: while the panel is open, and always while offline. */
  function beat(on) {
    if (on && !beatTimer) beatTimer = setInterval(function () { refresh(); refreshStatus(); }, 4000);
    if (!on && beatTimer) { clearInterval(beatTimer); beatTimer = null; }
  }

  function setOffline(on) {
    root.setAttribute('data-offline', on ? '1' : '0');
    $('zb-offline').hidden = !on;
    $('zb-retry').textContent = '重试连接';
    $('zb-fab').title = on ? 'ZCode Beautify — 美化服务未运行' : 'ZCode Beautify';
    if (on) {
      $('zb-blur').value = 0; $('zb-blur-val').textContent = '0';
      $('zb-dim').value = 0; $('zb-dim-val').textContent = '0';
      $('zb-trans').value = 50; $('zb-trans-val').textContent = '50';
      $('zb-monet').checked = false;
      $('zb-vis').checked = false;
      $('zb-fit').textContent = '背景填充: 未知';
      $('zb-fit').removeAttribute('data-fit');
      $('zb-reset').textContent = '还原默认外观';
      $('zb-reset').setAttribute('data-mode', 'reset');
      beat(true);
    } else {
      if (!panelOpen()) beat(false);
    }
  }

  function refresh() {
    fetch(API + '/api/config', { headers: auth(), signal: AbortSignal.timeout(POLL_TIMEOUT) })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        setOffline(false);
        // While the user is on a control (dragging a slider, toggling a box),
        // the 4s poll must not yank it back to the stored value — that made
        // the picture visibly jump between display states mid-drag.
        var applyVal = function (slider, label, v) {
          var el = $(slider);
          if (!el || document.activeElement === el) return;
          el.value = v;
          $(label).textContent = v;
        };
        applyVal('zb-blur', 'zb-blur-val', c.blur);
        applyVal('zb-dim', 'zb-dim-val', c.dim);
        applyVal('zb-trans', 'zb-trans-val', (typeof c.transparency === 'number' ? c.transparency : 50));
        var m = $('zb-monet'); if (m && document.activeElement !== m) m.checked = !!c.monet;
        var v = $('zb-vis'); if (v && document.activeElement !== v) v.checked = !!c.wallpaperVisible;
        $('zb-fit') && applyFitLabel($('zb-fit'), c.fit || 'cover');
        var ov = $('zb-overlay');
        if (ov) {
          var active = typeof c.overlayColor === 'string' && c.overlayColor !== '';
          curOverlay = active ? c.overlayColor : '';
          curStrength = typeof c.overlayStrength === 'number' && c.overlayStrength >= 1 ? c.overlayStrength : 45;
          ov.textContent = active ? '颜色叠加中' : '叠加颜色';
          if (active) ov.setAttribute('data-active', '1'); else ov.removeAttribute('data-active');
        }
        var resetBtn = $('zb-reset');
        if (c.wallpaperSet) {
          resetBtn.textContent = '还原默认外观';
          resetBtn.setAttribute('data-mode', 'reset');
          resetBtn.title = '移除壁纸与配色,还原 ZCode 默认外观(壁纸会被记住,可再次恢复)';
        } else if (c.hasBackup) {
          resetBtn.textContent = '恢复我的壁纸';
          resetBtn.setAttribute('data-mode', 'restore');
          resetBtn.title = '从备份恢复你之前的壁纸与配色';
        } else {
          resetBtn.textContent = '还原默认外观';
          resetBtn.setAttribute('data-mode', 'reset');
          resetBtn.title = '当前已是默认外观';
        }
        loaded = true;
        if (pendingPush) { pendingPush = false; pushConfig(); }
      })
      .catch(function () { setOffline(true); });
  }

  $('zb-blur').addEventListener('input', function () {
    $('zb-blur-val').textContent = this.value; preview(); pushConfig();
  });
  $('zb-dim').addEventListener('input', function () {
    $('zb-dim-val').textContent = this.value; preview(); pushConfig();
  });
  $('zb-trans').addEventListener('input', function () {
    $('zb-trans-val').textContent = this.value; pushConfig();
  });
  $('zb-monet').addEventListener('change', pushConfig);
  $('zb-vis').addEventListener('change', pushConfig);

  var FITS = ['cover', 'contain', 'smart'];
  var FIT_LABELS = { cover: '填满裁剪', contain: '完整显示', smart: '智能适配' };
  function applyFitLabel(btn, fit) {
    btn.textContent = '背景填充: ' + (FIT_LABELS[fit] || fit);
    btn.setAttribute('data-fit', fit);
  }
  $('zb-fit').addEventListener('click', function () {
    var current = this.getAttribute('data-fit') || 'cover';
    var next = FITS[(FITS.indexOf(current) + 1) % FITS.length];
    applyFitLabel(this, next);
    post('/api/config', { fit: next }, function (d) { status(d && d.windows > 0 ? '已应用:' + FIT_LABELS[next] : '已保存(ZCode 未连接)'); });
  });

  $('zb-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    if (f.type === 'image/webp') { status('暂不支持 WebP,请改用 JPG 或 PNG'); return; }
    if (f.size > 20 * 1024 * 1024) { status('图片过大,上限 20 MB'); return; }
    status('读取图片中…');
    var send = function (dataUri, name) {
      post('/api/wallpaper', { dataUri: dataUri, name: name }, function () { status('壁纸已更新 updated'); });
    };
    // Small files go up as-is. Big ones are downscaled in-page first (canvas,
    // ≤2560px, JPEG q92): a 4K original is ~18 MB of base64 and the local
    // decoder grinds on it for tens of seconds with the API unresponsive —
    // while the injection only ever uses a ≤2560 re-encode, so nothing is lost.
    if (f.size <= 4 * 1024 * 1024) {
      var fr = new FileReader();
      fr.onload = function () { send(fr.result, f.name); };
      fr.readAsDataURL(f);
      return;
    }
    var img = new Image();
    var url = URL.createObjectURL(f);
    img.onload = function () {
      URL.revokeObjectURL(url);
      var MAXP = 2560;
      var scale = Math.min(1, MAXP / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.max(1, Math.round(img.naturalWidth * scale));
      var h = Math.max(1, Math.round(img.naturalHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    // JPEG 没有 alpha 通道,canvas 未填充的像素按透明黑编码成黑色:带透明的
    // PNG 大图(插画、抠图)导入后会整体垫上黑底,所以先铺白底再画图。
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    status('大图已压缩,应用中…');
      send(canvas.toDataURL('image/jpeg', 0.92), (f.name || 'wallpaper').replace(/\.[^.]+$/, '') + '.jpg');
    };
    img.onerror = function () { URL.revokeObjectURL(url); status('图片读取失败,请换一张试试'); };
    img.src = url;
  });

  // Custom palette state. curOverlay/curStrength mirror the stored config
  // (kept fresh by refresh()); opening with no active overlay shows white at
  // 0%. The palette deliberately has no outside-click or wheel handler — it
  // must survive both.
  var curOverlay = '';
  var curStrength = 45;
  var palH = 0, palS = 0, palV = 1;
  var palStrength = 45; // the strength the next push applies, always 1-100
  var palOn = false;    // false = palette mirrors "no overlay" (readout 0%)
  var palPushTimer = null;

  // 颜色换算逻辑在 src/panel/colorUtil.ts 里维护并可单测,这里按源码内联。
  // 三个函数必须保持零外部引用(见 colorUtil.ts 顶部说明),否则 toString()
  // 内联出来的副本在面板里会因缺依赖而崩。
  var hsvToHex = ${hsvToHex.toString()};
  var hexToRgb = ${hexToRgb.toString()};
  var rgbToHsv = ${rgbToHsv.toString()};
  function palApply(push) {
    var hex = hsvToHex(palH, palS, palV);
    $('zb-sv').style.backgroundColor = 'hsl(' + Math.round(palH) + ',100%,50%)';
    $('zb-sv-knob').style.left = (palS * 100) + '%';
    $('zb-sv-knob').style.bottom = (palV * 100) + '%';
    // Keep the hue slider on the same hue as everything else: a swatch click
    // used to leave the thumb at its stale position, and the next touch of
    // the slider jumped the color from the thumb's old hue (pink chip →
    // red-orange) instead of fine-tuning the picked one.
    $('zb-hue').value = Math.round(palH);
    var rgb = hexToRgb(hex);
    $('zb-r').value = rgb[0];
    $('zb-g').value = rgb[1];
    $('zb-b').value = rgb[2];
    $('zb-swatch').style.backgroundColor = hex;
    // The readout shows what the palette would apply right now; with nothing
    // active that is white at 0%. The strength control itself never goes
    // below 1 — "off" lives in the overlay toggle, not in a 0% strength.
    var pct = (palOn ? palStrength : 0) + '%';
    $('zb-pal-val').textContent = hex + ' (' + rgb.join(',') + ') ' + pct;
    $('zb-strength').value = palOn ? palStrength : 0;
    $('zb-strength-val').textContent = pct;
    if (!push) return;
    clearTimeout(palPushTimer);
    palPushTimer = setTimeout(function () {
      var ov = $('zb-overlay');
      ov.textContent = '颜色叠加中';
      ov.setAttribute('data-active', '1');
      post('/api/config', { overlayColor: hex, overlayStrength: palStrength }, function () { status('颜色叠加已应用'); refresh(); });
    }, 200);
  }
  function paletteOpen() { return !$('zb-palette').hidden; }
  function closePalette() { $('zb-palette').hidden = true; }
  function openPalette() {
    var active = /^#[0-9a-fA-F]{6}$/.test(curOverlay);
    var rgb = active ? hexToRgb(curOverlay) : [255, 255, 255];
    var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    palH = hsv[0]; palS = hsv[1]; palV = hsv[2];
    palOn = active;
    palStrength = active ? Math.min(100, Math.max(1, Math.round(curStrength))) : 45;
    var pal = $('zb-palette'), panel = $('zb-panel'), btn = $('zb-overlay');
    palApply(false);
    pal.hidden = false;
    // Dock left of the button with the palette's right edge just outside the
    // panel (offsets are relative to the panel's padding box), bottom edge
    // aligned with the button; shift up when the viewport is too short. The
    // panel is the offset parent, so it also moves with panel drags.
    var pr = panel.getBoundingClientRect(), br = btn.getBoundingClientRect();
    var bottom = pr.bottom - 1 - br.bottom;
    var top = br.bottom - pal.offsetHeight;
    if (top < 4) bottom -= (4 - top);
    pal.style.right = (pr.width + 7) + 'px';
    pal.style.bottom = bottom + 'px';
  }
  $('zb-overlay').addEventListener('click', function () {
    paletteOpen() ? closePalette() : openPalette();
  });
  var sv = $('zb-sv');
  function svPick(e) {
    var r = sv.getBoundingClientRect();
    palS = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    palV = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    palOn = true;
    palApply(true);
  }
  sv.addEventListener('pointerdown', function (e) {
    try { sv.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    svPick(e);
  });
  sv.addEventListener('pointermove', function (e) { if (e.buttons & 1) svPick(e); });
  $('zb-hue').addEventListener('input', function () {
    palH = Number(this.value);
    palOn = true;
    palApply(true);
  });
  // Quick picks: apply the preset color at the current strength.
  var chips = document.querySelectorAll('#zb-palette .zb-sw');
  for (var ci = 0; ci < chips.length; ci++) {
    chips[ci].addEventListener('click', function () {
      var rgb = hexToRgb(this.getAttribute('data-c'));
      var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      palH = hsv[0]; palS = hsv[1]; palV = hsv[2];
      palOn = true;
      palApply(true);
    });
  }
  // Manual RGB entry: clamp to 0-255 (junk and negatives never apply), then
  // feed the same HSV state the pointer controls drive.
  function clampByte(raw) {
    if (raw === '' || raw === null) return null;
    var v = Math.round(Number(raw));
    if (!Number.isFinite(v)) return null;
    return Math.min(255, Math.max(0, v));
  }
  function rgbInput() {
    var r = clampByte($('zb-r').value), g = clampByte($('zb-g').value), b = clampByte($('zb-b').value);
    if (r === null || g === null || b === null) return;
    var hsv = rgbToHsv(r, g, b);
    palH = hsv[0]; palS = hsv[1]; palV = hsv[2];
    palOn = true;
    palApply(true);
  }
  $('zb-r').addEventListener('input', rgbInput);
  $('zb-g').addEventListener('input', rgbInput);
  $('zb-b').addEventListener('input', rgbInput);
  // The strength control never applies 0% (or below): "no overlay" lives in
  // the 重置 / right-click toggle, not in a strength. Values below 1 clamp to
  // 1 instead of snapping back — a fast drag to the far left must land on 1%,
  // not stick wherever the last ≥1 event happened (the old reject-and-revert
  // behavior read as "the slider stops at 2-4%").
  $('zb-strength').addEventListener('input', function () {
    var v = Math.round(Number(this.value));
    if (!Number.isFinite(v)) {
      this.value = palOn ? palStrength : 0;
      return;
    }
    palOn = true;
    palStrength = Math.min(100, Math.max(1, v));
    palApply(true);
  });
  // 重置按钮与右键按钮是同一个动作:关调色板 + 清空叠加色 + 刷新读数。
  function cancelOverlay() {
    closePalette();
    post('/api/config', { overlayColor: '' }, function () { status('已取消颜色叠加'); refresh(); });
  }
  $('zb-pal-reset').addEventListener('click', cancelOverlay);
  $('zb-pal-close').addEventListener('click', closePalette);
  $('zb-overlay').addEventListener('contextmenu', function (e) {
    e.preventDefault();
    cancelOverlay();
  });

  $('zb-reset').addEventListener('click', function () {
    var mode = this.getAttribute('data-mode') || 'reset';
    // localStorage 的清理由 serve 端的 reset 脚本统一负责(含 CLI/MCP 路径),
    // 面板不再自己动手 —— 两处各清一遍迟早会漂移。
    post(mode === 'restore' ? '/api/restore' : '/api/reset', {}, function () {
      status(mode === 'restore' ? '已恢复你的壁纸' : '已还原默认外观');
      refresh();
    });
  });

  $('zb-retry').addEventListener('click', function () {
    this.textContent = '正在重试…';
    refresh();
  });

  // The service answers but ZCode is not listening for it: either the app is
  // closed, or it came up without the debug port. The second case is the one
  // the plugin cannot fix on its own, and the only lever is a proper restart.
  var RECOVERY_HINTS = {
    off: 'ZCode 重启后不会自动恢复,需要手动重新应用。',
    'on-start': 'ZCode 每次启动时自动恢复一次,不占内存;设置面板不会自动出现。',
    always: '后台常驻一个小服务(约 60MB 内存),壁纸自动恢复,设置面板随时可用。'
  };

  function applyStatus(s) {
    $('zb-needs-relaunch').hidden = !(s && !s.cdpReachable && s.zcodeRunning);
    if (s && s.recovery) {
      var sel = $('zb-recovery');
      if (sel && document.activeElement !== sel) sel.value = s.recovery.mode;
      var hint = $('zb-recovery-hint');
      if (hint) hint.textContent = RECOVERY_HINTS[s.recovery.mode] || '';
    }
  }

  function refreshStatus() {
    fetch(API + '/api/status', { headers: auth(), signal: AbortSignal.timeout(POLL_TIMEOUT) })
      .then(function (r) { return r.json(); })
      .then(applyStatus)
      .catch(function () { /* the offline banner already covers this */ });
  }

  $('zb-relaunch').addEventListener('click', function () {
    var btn = this;
    btn.textContent = '正在重启 ZCode,请稍候…';
    btn.disabled = true;
    post('/api/relaunch', {}, function () {
      btn.textContent = '立即重启 ZCode';
      btn.disabled = false;
      status('ZCode 已重启,壁纸马上回来');
      setTimeout(refresh, 2000);
      setTimeout(refreshStatus, 3000);
    });
  });

  $('zb-recovery').addEventListener('change', function () {
    var value = this.value;
    post('/api/recovery', { mode: value }, function () {
      var hint = $('zb-recovery-hint');
      if (hint) hint.textContent = RECOVERY_HINTS[value] || '';
      status('自动恢复设置已保存');
    });
  });

  $('zb-fab').addEventListener('click', function () {
    var p = $('zb-panel');
    p.hidden = !p.hidden;
    if (!p.hidden) {
      // A panel dragged or stranded outside the viewport (window got resized
      // after a drag) reads as a dead button: opening it re-anchors the panel
      // whenever it is out of view.
      var pr = p.getBoundingClientRect();
      if (pr.left > innerWidth - 60 || pr.top > innerHeight - 60 || pr.right < 60 || pr.bottom < 60) {
        p.style.left = ''; p.style.top = ''; p.style.right = '18px'; p.style.bottom = '60px';
      }
      refresh(); refreshStatus(); beat(true);
    } else if (root.getAttribute('data-offline') !== '1') {
      beat(false);
    }
  });
  $('zb-close').addEventListener('click', function () {
    $('zb-panel').hidden = true;
    if (root.getAttribute('data-offline') !== '1') beat(false);
  });

  // Fill in the fit label (and control values) right away, not just on open.
  refresh();
  refreshStatus();

  (function () {
    var head = $('zb-head'), panel = $('zb-panel');
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    head.addEventListener('pointerdown', function (e) {
      dragging = true; sx = e.clientX; sy = e.clientY;
      var r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var x = Math.max(4, Math.min(window.innerWidth - 80, ox + e.clientX - sx));
      var y = Math.max(4, Math.min(window.innerHeight - 60, oy + e.clientY - sy));
      panel.style.left = x + 'px'; panel.style.top = y + 'px';
    });
    head.addEventListener('pointerup', function () { dragging = false; });
  })();

  // Self-heal: if the theme style is missing but a previous injection saved it,
  // restore it from localStorage.
  if (!document.getElementById('zcode-beautify-style')) {
    var savedCss = null, savedWp = null;
    try {
      savedCss = localStorage.getItem('zcode-beautify:css');
      savedWp = localStorage.getItem('zcode-beautify:wallpaper');
    } catch (e) {}
    if (savedCss) {
      var s = document.createElement('style');
      s.id = 'zcode-beautify-style';
      s.textContent = savedCss;
      (document.head || document.documentElement).appendChild(s);
      if (savedWp && !wallpaperEl()) {
        var w = document.createElement('div');
        w.id = 'zcode-beautify-wallpaper';
        document.documentElement.appendChild(w);
        w.style.backgroundImage = 'url(' + savedWp + ')';
      }
    }
  }
})();`;
}
