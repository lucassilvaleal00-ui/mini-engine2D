/**
 * imagem.js — Conversões entre o desenho (índices de paleta) e imagens (RGBA), sem DOM.
 * Usado por exportar (PNG, sprite sheet, GIF) e importar (PNG, sprite sheet, paleta).
 * Roda também no Node (testes).
 */

import {
  MAX_CORES, ErroDoEditor, PALETA_PADRAO, hexParaRgb, rgbParaHex, normalizarHex,
} from './documento.js';

export const LADO_MAX_IMAGEM = 8192; // maior lado de uma imagem exportada, em pixels

/* ------------------------------------------------------------------ */
/* Desenho -> imagem                                                   */
/* ------------------------------------------------------------------ */

/** Junta as camadas visíveis de um quadro em um só buffer de índices (a de cima vence). */
export function achatarQuadro(e, quadro) {
  const n = e.largura * e.altura;
  const saida = new Uint8Array(n);
  for (let c = 0; c < e.camadas.length; c++) {
    if (!e.camadas[c].visivel) continue;
    const buf = quadro.camadas[c];
    for (let i = 0; i < n; i++) if (buf[i] !== 0) saida[i] = buf[i];
  }
  return saida;
}

/** Índices -> RGBA, com `escala` inteira (vizinho mais próximo: pixels continuam nítidos). */
export function indicesParaRgba(indices, largura, altura, paleta, escala = 1) {
  if (!Number.isInteger(escala) || escala < 1) throw new ErroDoEditor('A escala precisa ser um número inteiro (1, 2, 4…).');
  const W = largura * escala;
  const H = altura * escala;
  if (W > LADO_MAX_IMAGEM || H > LADO_MAX_IMAGEM) {
    throw new ErroDoEditor(`A imagem ficaria com ${W}×${H} pixels (máximo ${LADO_MAX_IMAGEM}). Escolha uma escala menor.`);
  }
  const cores = paleta.map((c) => (c === 'transparent' ? [0, 0, 0, 0] : [...hexParaRgb(c), 255]));
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const cor = cores[indices[y * largura + x]] ?? cores[0];
      for (let dy = 0; dy < escala; dy++) {
        let o = ((y * escala + dy) * W + x * escala) * 4;
        for (let dx = 0; dx < escala; dx++, o += 4) {
          rgba[o] = cor[0]; rgba[o + 1] = cor[1]; rgba[o + 2] = cor[2]; rgba[o + 3] = cor[3];
        }
      }
    }
  }
  return { rgba, largura: W, altura: H };
}

/** Um quadro inteiro (todas as camadas visíveis juntas) como imagem. */
export function quadroParaRgba(e, quadro, escala = 1) {
  return indicesParaRgba(achatarQuadro(e, quadro), e.largura, e.altura, e.paleta, escala);
}

/** Uma camada de um quadro como imagem (para exportar camadas separadas). */
export function camadaParaRgba(e, quadro, camada, escala = 1) {
  return indicesParaRgba(quadro.camadas[camada], e.largura, e.altura, e.paleta, escala);
}

/**
 * Sprite sheet: todos os quadros numa só imagem, em grade.
 * @param colunas  quantos quadros por linha (padrão: todos em uma linha)
 */
export function montarSpriteSheet(e, { colunas = e.quadros.length, escala = 1 } = {}) {
  const total = e.quadros.length;
  colunas = Math.max(1, Math.min(total, Math.round(colunas)));
  const linhas = Math.ceil(total / colunas);
  const qw = e.largura * escala;
  const qh = e.altura * escala;
  const W = colunas * qw;
  const H = linhas * qh;
  if (W > LADO_MAX_IMAGEM || H > LADO_MAX_IMAGEM) {
    throw new ErroDoEditor(`O sprite sheet ficaria com ${W}×${H} pixels (máximo ${LADO_MAX_IMAGEM}). Use menos colunas ou uma escala menor.`);
  }
  const rgba = new Uint8ClampedArray(W * H * 4);
  const quadros = [];
  e.quadros.forEach((q, i) => {
    const { rgba: r } = quadroParaRgba(e, q, escala);
    const x0 = (i % colunas) * qw;
    const y0 = Math.floor(i / colunas) * qh;
    for (let y = 0; y < qh; y++) rgba.set(r.subarray(y * qw * 4, (y + 1) * qw * 4), ((y0 + y) * W + x0) * 4);
    quadros.push({ indice: i, x: x0, y: y0, largura: qw, altura: qh });
  });
  return { rgba, largura: W, altura: H, colunas, linhas, quadroLargura: qw, quadroAltura: qh, quadros };
}

/* ------------------------------------------------------------------ */
/* Imagem -> cores                                                     */
/* ------------------------------------------------------------------ */

/** Pixels com menos de 50% de opacidade viram "transparente". */
const ALFA_MINIMO = 128;

/** Conta as cores opacas de uma imagem: Map { '#rrggbb' => quantidade }, na ordem em que aparecem. */
export function contarCores(rgba) {
  const mapa = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < ALFA_MINIMO) continue;
    const hex = rgbParaHex(rgba[i], rgba[i + 1], rgba[i + 2]);
    mapa.set(hex, (mapa.get(hex) ?? 0) + 1);
  }
  return mapa;
}

/** Cores ordenadas das mais usadas para as menos usadas (empate: ordem de aparição). */
export function coresPorUso(mapa) {
  return [...mapa.entries()].map(([hex, n], ordem) => ({ hex, n, ordem }))
    .sort((a, b) => b.n - a.n || a.ordem - b.ordem);
}

/**
 * Reduz um conjunto de cores a no máximo `maximo` (corte pela mediana, ponderado pelo uso).
 * Devolve a lista de hex da paleta reduzida (sem repetições).
 */
export function quantizar(mapa, maximo) {
  const itens = [...mapa.entries()].map(([hex, n]) => ({ rgb: hexParaRgb(hex), n }));
  if (itens.length <= maximo) return itens.map((i) => rgbParaHex(...i.rgb));

  let caixas = [itens];
  const alcance = (caixa) => {
    const min = [255, 255, 255], max = [0, 0, 0];
    for (const { rgb } of caixa) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], rgb[c]); max[c] = Math.max(max[c], rgb[c]); }
    const medidas = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const canal = medidas.indexOf(Math.max(...medidas));
    return { canal, tamanho: medidas[canal] };
  };
  while (caixas.length < maximo) {
    // divide a caixa com mais "volume" (alcance × peso) que ainda possa ser dividida
    let alvo = -1, melhor = -1;
    caixas.forEach((cx, i) => {
      if (cx.length < 2) return;
      const { tamanho } = alcance(cx);
      const peso = tamanho * Math.sqrt(cx.reduce((s, x) => s + x.n, 0));
      if (peso > melhor) { melhor = peso; alvo = i; }
    });
    if (alvo < 0) break;
    const cx = caixas[alvo];
    const { canal } = alcance(cx);
    cx.sort((a, b) => a.rgb[canal] - b.rgb[canal]);
    const total = cx.reduce((s, x) => s + x.n, 0);
    let acc = 0, corte = 1;
    for (let i = 0; i < cx.length - 1; i++) { acc += cx[i].n; corte = i + 1; if (acc >= total / 2) break; }
    caixas.splice(alvo, 1, cx.slice(0, corte), cx.slice(corte));
  }
  const paleta = caixas.map((cx) => {
    const total = cx.reduce((s, x) => s + x.n, 0);
    const m = [0, 0, 0];
    for (const x of cx) for (let c = 0; c < 3; c++) m[c] += x.rgb[c] * x.n;
    return rgbParaHex(m[0] / total, m[1] / total, m[2] / total);
  });
  return [...new Set(paleta)];
}

function maisProxima(rgb, paletaRgb) {
  let melhor = 0, menor = Infinity;
  for (let i = 0; i < paletaRgb.length; i++) {
    const p = paletaRgb[i];
    const d = (rgb[0] - p[0]) ** 2 + (rgb[1] - p[1]) ** 2 + (rgb[2] - p[2]) ** 2;
    if (d < menor) { menor = d; melhor = i; }
  }
  return melhor;
}

/* ------------------------------------------------------------------ */
/* Imagem -> desenho                                                   */
/* ------------------------------------------------------------------ */

/**
 * Corta uma imagem em quadros de tamanho fixo (sprite sheet), da esquerda para a direita
 * e de cima para baixo. Quadros totalmente vazios no fim são descartados.
 */
export function cortarEmQuadros({ rgba, largura, altura, quadroLargura, quadroAltura }) {
  if (!Number.isInteger(quadroLargura) || !Number.isInteger(quadroAltura) || quadroLargura < 1 || quadroAltura < 1) {
    throw new ErroDoEditor('O tamanho do quadro precisa ser um número inteiro maior que zero.');
  }
  if (quadroLargura > largura || quadroAltura > altura) {
    throw new ErroDoEditor(`O quadro (${quadroLargura}×${quadroAltura}) é maior que a imagem (${largura}×${altura}).`);
  }
  const colunas = Math.floor(largura / quadroLargura);
  const linhas = Math.floor(altura / quadroAltura);
  const quadros = [];
  for (let ly = 0; ly < linhas; ly++) {
    for (let lx = 0; lx < colunas; lx++) {
      const q = new Uint8ClampedArray(quadroLargura * quadroAltura * 4);
      for (let y = 0; y < quadroAltura; y++) {
        const de = ((ly * quadroAltura + y) * largura + lx * quadroLargura) * 4;
        q.set(rgba.subarray(de, de + quadroLargura * 4), y * quadroLargura * 4);
      }
      quadros.push(q);
    }
  }
  const vazio = (q) => { for (let i = 3; i < q.length; i += 4) if (q[i] >= ALFA_MINIMO) return false; return true; };
  while (quadros.length > 1 && vazio(quadros.at(-1))) quadros.pop();
  return { quadros, colunas, linhas, sobraX: largura - colunas * quadroLargura, sobraY: altura - linhas * quadroAltura };
}

/**
 * Cria o estado de um desenho a partir de uma ou mais imagens do mesmo tamanho.
 * Se houver mais cores que o limite, reduz automaticamente (info.reduzido = true).
 */
export function imagensParaEstado({ quadros, largura, altura, nome, limiteCores = MAX_CORES - 1, fps = 8 }) {
  const total = new Map();
  let semitransparentes = 0;
  for (const rgba of quadros) {
    for (const [hex, n] of contarCores(rgba)) total.set(hex, (total.get(hex) ?? 0) + n);
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0 && rgba[i] < 255) semitransparentes++;
  }
  const coresOriginais = total.size;
  const ordenadas = coresPorUso(total).map((c) => c.hex);
  const reduzido = coresOriginais > limiteCores;
  const escolhidas = reduzido ? quantizar(total, limiteCores) : ordenadas;
  const paleta = ['transparent', ...escolhidas];
  const paletaRgb = escolhidas.map(hexParaRgb);

  const indiceDe = new Map(escolhidas.map((hex, i) => [hex, i + 1]));
  const cache = new Map();
  const buffers = quadros.map((rgba) => {
    const buf = new Uint8Array(largura * altura);
    for (let p = 0; p < buf.length; p++) {
      const o = p * 4;
      if (rgba[o + 3] < ALFA_MINIMO) continue;
      const hex = rgbParaHex(rgba[o], rgba[o + 1], rgba[o + 2]);
      let idx = indiceDe.get(hex) ?? cache.get(hex);
      if (idx === undefined) { idx = maisProxima([rgba[o], rgba[o + 1], rgba[o + 2]], paletaRgb) + 1; cache.set(hex, idx); }
      buf[p] = idx;
    }
    return buf;
  });

  return {
    estado: {
      nome,
      largura,
      altura,
      fps,
      paleta,
      camadas: [{ nome: 'corpo', visivel: true }],
      quadros: buffers.map((b) => ({ camadas: [b] })),
      atual: 0,
      camadaAtiva: 0,
    },
    info: { coresOriginais, coresFinais: escolhidas.length, reduzido, semitransparentes },
  };
}

/** Atalho para uma imagem só. */
export const imagemParaEstado = ({ rgba, largura, altura, nome, limiteCores }) =>
  imagensParaEstado({ quadros: [rgba], largura, altura, nome, limiteCores });

/* ------------------------------------------------------------------ */
/* Imagem -> paleta (acrescentar as cores de uma imagem à paleta)       */
/* ------------------------------------------------------------------ */

/**
 * Quais cores da imagem entrariam na paleta atual?
 * @returns { novas: [hex], jaExistiam, total, cortadas }  (`cortadas` = cores que não couberam)
 */
export function coresParaPaleta(rgba, paletaAtual) {
  const mapa = contarCores(rgba);
  const usadas = coresPorUso(mapa).map((c) => c.hex);
  const existentes = new Set(paletaAtual);
  const faltam = usadas.filter((hex) => !existentes.has(hex));
  const vagas = Math.max(0, MAX_CORES - paletaAtual.length);
  return {
    novas: faltam.slice(0, vagas),
    jaExistiam: usadas.length - faltam.length,
    total: usadas.length,
    cortadas: Math.max(0, faltam.length - vagas),
  };
}

export { PALETA_PADRAO, normalizarHex };
