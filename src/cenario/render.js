/**
 * render.js — Junta os frames referenciados num cenário em imagens (RGBA), sem DOM.
 * Usado pela miniatura do Gerenciador e pelo "Criar jogo" (uma imagem por nível: fundo, meio, frente).
 */

import * as armazem from '../core/storage.js';
import { spritesParaEstado, hexParaRgb } from '../editor/documento.js';
import { quadroParaRgba } from '../editor/imagem.js';
import { larguraPx, alturaPx, ordemDeDesenho } from './modelo.js';

const cache = new Map(); // spriteId -> { atualizadoEm, nome, estado }

/** Estado (do editor) de um item sprite, com cache pela data. null se não existir mais. */
export async function estadoDoSprite(spriteId) {
  const item = await armazem.obter(spriteId);
  if (!item || item.lixeiraLote || item.tipo !== 'sprite') return null;
  const c = cache.get(spriteId);
  if (c && c.atualizadoEm === item.atualizadoEm) return c;
  const completo = await armazem.obterComDados(spriteId);
  if (!completo?.dados) return null;
  let estado;
  try { ({ estado } = spritesParaEstado([{ ...completo.dados, name: item.nome }])); } catch { return null; }
  const novo = { atualizadoEm: item.atualizadoEm, nome: item.nome, paiId: item.paiId, estado, frames: new Map() };
  cache.set(spriteId, novo);
  return novo;
}

/** RGBA de um frame de um sprite: { rgba, largura, altura, nome } ou null. */
export async function frameDoSprite(spriteId, quadro = 0) {
  const s = await estadoDoSprite(spriteId);
  if (!s) return null;
  const q = Math.min(Math.max(0, quadro), s.estado.quadros.length - 1);
  if (!s.frames.has(q)) s.frames.set(q, quadroParaRgba(s.estado, s.estado.quadros[q], 1));
  return { ...s.frames.get(q), nome: s.nome };
}

/** Copia `img` para dentro de `alvo` em (x, y); pixels transparentes não apagam o que está embaixo. */
function carimbar(alvo, W, H, img, x0, y0, espelhar) {
  const { rgba, largura: w, altura: h } = img;
  for (let y = 0; y < h; y++) {
    const ty = y0 + y;
    if (ty < 0 || ty >= H) continue;
    for (let x = 0; x < w; x++) {
      const tx = x0 + (espelhar ? w - 1 - x : x);
      if (tx < 0 || tx >= W) continue;
      const s = (y * w + x) * 4;
      if (rgba[s + 3] < 128) continue;
      const d = (ty * W + tx) * 4;
      alvo[d] = rgba[s]; alvo[d + 1] = rgba[s + 1]; alvo[d + 2] = rgba[s + 2]; alvo[d + 3] = 255;
    }
  }
}

/**
 * Desenha o cenário inteiro (ou só alguns níveis).
 * @returns { rgba, largura, altura, faltando } — `faltando` = objetos cujo sprite foi apagado
 */
export async function comporCenario(c, { niveis = [1, 2, 3], comFundo = true } = {}) {
  const W = larguraPx(c);
  const H = alturaPx(c);
  const rgba = new Uint8ClampedArray(W * H * 4);
  if (comFundo && c.fundo) {
    const [r, g, b] = hexParaRgb(c.fundo);
    for (let i = 0; i < rgba.length; i += 4) { rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255; }
  }
  let faltando = 0;
  for (const o of ordemDeDesenho(c)) {
    if (!niveis.includes(o.nivel)) continue;
    const f = await frameDoSprite(o.spriteId, o.quadro);
    if (!f) { faltando++; continue; }
    carimbar(rgba, W, H, f, o.x, o.y, o.espelhar);
  }
  return { rgba, largura: W, altura: H, faltando };
}

/** Lista dos objetos com tamanho e nome (para o jogo saber onde estão os sólidos). */
export async function objetosComTamanho(c) {
  const saida = [];
  for (const o of ordemDeDesenho(c)) {
    const s = await estadoDoSprite(o.spriteId);
    if (!s) continue;
    saida.push({ nome: s.nome, x: o.x, y: o.y, largura: s.estado.largura, altura: s.estado.altura, nivel: o.nivel, solido: o.solido });
  }
  return saida;
}
