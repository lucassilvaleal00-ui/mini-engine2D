/**
 * variacoes.js — "Variações" de um desenho sem usar IA: trocar o tom das cores e cobrir de neve.
 * Funções puras (sem DOM): recebem o desenho e devolvem o resultado, sem alterar o original.
 * O controlador usa estas funções dentro de uma transação (um único "desfazer").
 */

import { MAX_CORES, hexParaRgb, rgbParaHex, corMaisProxima } from './documento.js';
import { hsvParaRgb, rgbParaHsv } from './cores.js';
import { achatarQuadro } from './imagem.js';

/** Branco levemente azulado, a cor padrão da neve. */
export const COR_NEVE = '#f4f8ff';
export const ESPESSURAS_NEVE = [1, 2, 3];

/* ------------------------------------------------------------------ */
/* Tom das cores                                                       */
/* ------------------------------------------------------------------ */

/**
 * Gira o matiz de todas as cores da paleta (menos a transparente) em `graus` (-180 a 180).
 * Brilho e saturação ficam como estão; cinzas, brancos e pretos não mudam (não têm matiz).
 */
export function deslocarMatizPaleta(paleta, graus) {
  return paleta.map((cor, i) => {
    if (i === 0 || cor === 'transparent') return cor;
    const [r, g, b] = hexParaRgb(cor);
    const [matiz, sat, brilho] = rgbParaHsv(r, g, b);
    if (sat === 0) return cor;
    const [nr, ng, nb] = hsvParaRgb((((matiz + graus) % 360) + 360) % 360, sat, brilho);
    return rgbParaHex(nr, ng, nb);
  });
}

/* ------------------------------------------------------------------ */
/* Neve                                                                */
/* ------------------------------------------------------------------ */

/**
 * Marca onde a neve pousa: em cada coluna, a neve cai de cima e fica no PRIMEIRO pixel visível que encontra.
 * Com espessura > 1, os pixels logo abaixo desse também entram, enquanto continuarem visíveis.
 * Olha o desenho com as camadas visíveis juntas, como o usuário vê.
 * @returns Uint8Array (1 = recebe neve)
 */
export function calcularNeve(e, quadro, espessura = 1) {
  const { largura: w, altura: h } = e;
  const visto = achatarQuadro(e, quadro);
  const marcado = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && visto[y * w + x] === 0) y++;
    for (let k = 0; k < espessura && y + k < h; k++) {
      const j = (y + k) * w + x;
      if (visto[j] === 0) break;
      marcado[j] = 1;
    }
  }
  return marcado;
}

/** Índice da cor da neve: uma cor quase branca que já exista, senão acrescenta (ou usa a mais parecida se estiver cheia). */
function indiceDaNeve(paleta) {
  const [nr, ng, nb] = hexParaRgb(COR_NEVE);
  for (let i = 1; i < paleta.length; i++) {
    const [r, g, b] = hexParaRgb(paleta[i]);
    if ((r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2 <= 3 * 24 * 24) return { indice: i, nova: false };
  }
  if (paleta.length < MAX_CORES) return { indice: paleta.length, nova: true };
  return { indice: corMaisProxima(COR_NEVE, paleta), nova: false };
}

/**
 * Cobre de neve o topo do desenho.
 * @param opcoes  { espessura = 1, escopo = 'quadro' | 'todos' }
 * @returns { mudou, pixels, paleta, quadros }  — `paleta` e `quadros` são novos (o desenho original não é tocado)
 */
export function aplicarNeve(e, { espessura = 1, escopo = 'quadro' } = {}) {
  const alvos = escopo === 'todos' ? e.quadros.map((_, i) => i) : [e.atual];
  const planos = alvos.map((qi) => ({ qi, marcado: calcularNeve(e, e.quadros[qi], espessura) }));
  const algum = planos.some((p) => p.marcado.includes(1));
  if (!algum) return { mudou: false, pixels: 0, paleta: e.paleta, quadros: e.quadros };

  const { indice, nova } = indiceDaNeve(e.paleta);
  const paleta = nova ? [...e.paleta, COR_NEVE] : e.paleta;
  const quadros = e.quadros.slice();
  let pixels = 0;
  let mudou = false;
  for (const { qi, marcado } of planos) {
    const camadas = quadros[qi].camadas.slice();
    const copiada = new Set();
    for (let i = 0; i < marcado.length; i++) {
      if (!marcado[i]) continue;
      // a neve vai na camada que o usuário enxerga naquele pixel (a de cima que tem algo ali)
      for (let c = e.camadas.length - 1; c >= 0; c--) {
        if (!e.camadas[c].visivel || camadas[c][i] === 0) continue;
        if (camadas[c][i] !== indice) {
          if (!copiada.has(c)) { camadas[c] = camadas[c].slice(); copiada.add(c); }
          camadas[c][i] = indice;
          mudou = true;
        }
        pixels++;
        break;
      }
    }
    if (copiada.size) quadros[qi] = { camadas };
  }
  return { mudou: mudou || nova, pixels, paleta, quadros };
}
