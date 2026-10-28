/**
 * cores.js — Conversões de cor sem DOM (HSV <-> RGB). Usadas pelo seletor de cor e pelas variações.
 */

/** matiz 0..360, saturação e brilho 0..1 -> [r, g, b] em 0..255 */
export function hsvParaRgb(hh, s, v) {
  const f = (n) => {
    const k = (n + hh / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

/** r, g, b em 0..255 -> [matiz 0..360, saturação 0..1, brilho 0..1] */
export function rgbParaHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hh = 0;
  if (d) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60;
    if (hh < 0) hh += 360;
  }
  return [hh, max === 0 ? 0 : d / max, max];
}
