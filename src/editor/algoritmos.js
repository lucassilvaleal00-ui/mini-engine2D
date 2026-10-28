/**
 * algoritmos.js — Algoritmos de desenho sobre buffers de pixels. Sem DOM.
 *
 * Buffer  = Uint8Array(largura * altura); cada valor é um índice da paleta
 *           (0 = transparente).
 * Ponto   = [x, y]. Pode cair fora do desenho; quem aplica (`aplicar`) recorta.
 * Região  = { w, h, pixels } — um pedaço de imagem (usado em seleção/girar).
 */

export const dentro = (x, y, w, h) => x >= 0 && y >= 0 && x < w && y < h;

/** Linha de Bresenham entre dois pontos (inclui as pontas). */
export function linha(x0, y0, x1, y1) {
  const pts = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let erro = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * erro;
    if (e2 >= dy) { erro += dy; x0 += sx; }
    if (e2 <= dx) { erro += dx; y0 += sy; }
  }
  return pts;
}

/** Pontos cobertos por um pincel quadrado de `tam` x `tam` em (x, y). */
export function pincel(x, y, tam) {
  const o = Math.floor((tam - 1) / 2);
  const pts = [];
  for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) pts.push([x - o + i, y - o + j]);
  return pts;
}

/** Carimba o pincel em todos os pontos de `pontos`. */
export function estampar(pontos, tam) {
  if (tam <= 1) return pontos;
  const saida = [];
  for (const [x, y] of pontos) for (const p of pincel(x, y, tam)) saida.push(p);
  return saida;
}

/** Linha grossa: Bresenham + pincel. */
export const tracoComPincel = (x0, y0, x1, y1, tam) => estampar(linha(x0, y0, x1, y1), tam);

/** Contorno ou preenchimento de um retângulo entre dois cantos. */
export function retangulo(x0, y0, x1, y1, preenchido = false) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const pts = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (preenchido || x === xa || x === xb || y === ya || y === yb) pts.push([x, y]);
    }
  }
  return pts;
}

/** Contorno ou preenchimento da elipse inscrita no retângulo entre dois cantos. */
export function elipse(x0, y0, x1, y1, preenchido = false) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const cx = (xa + xb) / 2, cy = (ya + yb) / 2;
  const rx = (xb - xa) / 2 + 0.5, ry = (yb - ya) / 2 + 0.5;
  const nela = (x, y) => {
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    return nx * nx + ny * ny <= 1;
  };
  const pts = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (!nela(x, y)) continue;
      if (preenchido || !nela(x - 1, y) || !nela(x + 1, y) || !nela(x, y - 1) || !nela(x, y + 1)) pts.push([x, y]);
    }
  }
  return pts;
}

/**
 * Simetria do traço: acrescenta os pontos espelhados.
 * modo: 'nenhuma' | 'h' (esquerda↔direita) | 'v' (cima↔baixo) | 'hv' (os dois).
 */
export function simetria(pontos, w, h, modo) {
  if (!modo || modo === 'nenhuma') return pontos;
  const extra = [];
  for (const [x, y] of pontos) {
    if (modo === 'h' || modo === 'hv') extra.push([w - 1 - x, y]);
    if (modo === 'v' || modo === 'hv') extra.push([x, h - 1 - y]);
    if (modo === 'hv') extra.push([w - 1 - x, h - 1 - y]);
  }
  return pontos.concat(extra);
}

/** Escreve `indice` nos pontos (recortando o que sai do desenho). Devolve quantos pixels mudaram. */
export function aplicar(buf, w, h, pontos, indice) {
  let n = 0;
  for (const [x, y] of pontos) {
    if (!dentro(x, y, w, h)) continue;
    const i = y * w + x;
    if (buf[i] !== indice) { buf[i] = indice; n++; }
  }
  return n;
}

/**
 * Balde de tinta. `global` troca TODOS os pixels da mesma cor;
 * senão só a área ligada (vizinhos em cruz). Devolve quantos pixels mudaram.
 */
export function balde(buf, w, h, x, y, novo, global = false) {
  if (!dentro(x, y, w, h)) return 0;
  const alvo = buf[y * w + x];
  if (alvo === novo) return 0;
  let n = 0;
  if (global) {
    for (let i = 0; i < buf.length; i++) if (buf[i] === alvo) { buf[i] = novo; n++; }
    return n;
  }
  const pilha = [x, y];
  while (pilha.length) {
    const cy = pilha.pop();
    const cx = pilha.pop();
    if (!dentro(cx, cy, w, h)) continue;
    const i = cy * w + cx;
    if (buf[i] !== alvo) continue;
    buf[i] = novo;
    n++;
    pilha.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
  return n;
}

/* ---------- Regiões e transformações (sempre devolvem algo novo) ---------- */

export const iguais = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** Recorta um retângulo {x,y,w,h} aos limites do desenho. Devolve null se ficar vazio. */
export function recortarRetangulo(r, w, h) {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(w, r.x + r.w), y1 = Math.min(h, r.y + r.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Copia os pixels de um retângulo para uma região. */
export function extrair(buf, w, h, r) {
  const rc = recortarRetangulo(r, w, h);
  if (!rc) return { w: 0, h: 0, pixels: new Uint8Array(0) };
  const pixels = new Uint8Array(rc.w * rc.h);
  for (let y = 0; y < rc.h; y++) {
    for (let x = 0; x < rc.w; x++) pixels[y * rc.w + x] = buf[(rc.y + y) * w + rc.x + x];
  }
  return { w: rc.w, h: rc.h, pixels };
}

/** Apaga (zera) um retângulo, no próprio buffer. */
export function limpar(buf, w, h, r) {
  const rc = recortarRetangulo(r, w, h);
  if (!rc) return;
  for (let y = rc.y; y < rc.y + rc.h; y++) buf.fill(0, y * w + rc.x, y * w + rc.x + rc.w);
}

/** Cola uma região em (x, y), no próprio buffer. Pixels transparentes da região não apagam nada. */
export function carimbar(buf, w, h, regiao, x, y) {
  for (let j = 0; j < regiao.h; j++) {
    for (let i = 0; i < regiao.w; i++) {
      const v = regiao.pixels[j * regiao.w + i];
      if (v !== 0 && dentro(x + i, y + j, w, h)) buf[(y + j) * w + x + i] = v;
    }
  }
}

/** Desloca todo o conteúdo (o que sai some; o que entra é transparente). */
export function mover(buf, w, h, dx, dy) {
  const saida = new Uint8Array(buf.length);
  for (let y = 0; y < h; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= h) continue;
    for (let x = 0; x < w; x++) {
      const nx = x + dx;
      if (nx >= 0 && nx < w) saida[ny * w + nx] = buf[y * w + x];
    }
  }
  return saida;
}

export function espelharH(r) {
  const pixels = new Uint8Array(r.pixels.length);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) pixels[y * r.w + (r.w - 1 - x)] = r.pixels[y * r.w + x];
  return { w: r.w, h: r.h, pixels };
}

export function espelharV(r) {
  const pixels = new Uint8Array(r.pixels.length);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) pixels[(r.h - 1 - y) * r.w + x] = r.pixels[y * r.w + x];
  return { w: r.w, h: r.h, pixels };
}

/** Gira 90° no sentido horário. A região devolvida tem largura e altura trocadas. */
export function girar90(r) {
  const pixels = new Uint8Array(r.pixels.length);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) pixels[x * r.h + (r.h - 1 - y)] = r.pixels[y * r.w + x];
  return { w: r.h, h: r.w, pixels };
}

/** Conta os pixels com o índice `indice`. */
export function contar(buf, indice) {
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === indice) n++;
  return n;
}
