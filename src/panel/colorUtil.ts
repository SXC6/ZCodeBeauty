/**
 * 面板调色板的颜色换算。
 *
 * buildPanelScript 通过 Function.prototype.toString() 把这三个函数原样内联进
 * 注入的面板脚本,因此它们必须保持完全自包含:不引用任何外部变量或 import,
 * 函数体里不用模板字符串(会与外层的脚本拼接冲突)。
 * 单测见 tests/color.test.ts —— 0.7.3 的 hsvToHex 扇区分数 typo 之所以能
 * 存活那么久,就是因为这段逻辑藏在字符串里没法测。
 */

export function hsvToHex(h: number, s: number, v: number): string {
  // f 是 60° 扇区内部的小数位置:两个 floor 都必须除以 60。只对 h 取 floor
  // 会让 h ≥ 60 时 f 变成巨大的负数,色相一过红-黄扇区所有颜色都是乱码
  // (快捷色块与实际应用色不一致的直接原因)。
  var i = Math.floor(h / 60) % 6, f = h / 60 - Math.floor(h / 60);
  var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  var rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  return '#' + rgb.map(function (c) { return ('0' + Math.round(c * 255).toString(16)).slice(-2); }).join('').toUpperCase();
}

export function hexToRgb(hex: string): number[] {
  var n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsv(r: number, g: number, b: number): number[] {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  var h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}
