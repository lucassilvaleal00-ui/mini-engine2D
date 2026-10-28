/**
 * render.js — Desenha um quadro do documento num canvas (miniaturas, prévia, vista principal).
 */

import { hexParaRgb } from './documento.js';

/** Paleta -> Uint32Array já no formato de pixel do canvas (RGBA em little-endian). */
export function paletaParaUint32(paleta) {
  const saida = new Uint32Array(paleta.length);
  for (let i = 1; i < paleta.length; i++) {
    const [r, g, b] = hexParaRgb(paleta[i]);
    saida[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return saida;
}

/**
 * Junta as camadas visíveis de `quadro` em `canvas` (1 pixel do desenho = 1 pixel do canvas).
 * `substituir` = { camada, buf } troca o buffer de uma camada (traço em andamento).
 */
export function desenharQuadro(estado, quadro, canvas, substituir = null) {
  const { largura: w, altura: h } = estado;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imagem = ctx.createImageData(w, h);
  const dados = new Uint32Array(imagem.data.buffer);
  const pal = paletaParaUint32(estado.paleta);
  estado.camadas.forEach((camada, ci) => {
    if (!camada.visivel) return;
    const buf = substituir && substituir.camada === ci ? substituir.buf : quadro.camadas[ci];
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      if (v !== 0) dados[i] = pal[v];
    }
  });
  ctx.putImageData(imagem, 0, 0);
  return canvas;
}
