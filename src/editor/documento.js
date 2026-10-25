/**
 * documento.js — Modelo de dados do editor e conversão para/do formato de sprite (JSON).
 * Sem DOM: roda também em testes no Node.
 *
 * ESTADO do documento (objeto simples):
 *   { nome, largura, altura, fps,
 *     paleta: ['transparent', '#rrggbb', ...]      // índice 0 = transparente; máx. 36 no total
 *     camadas: [{ nome, visivel }],                // de baixo para cima
 *     quadros: [{ camadas: [Uint8Array, ...] }],   // um buffer por camada
 *     atual, camadaAtiva }
 *
 * REGRA DE OURO: quadros e buffers já "confirmados" NUNCA são alterados no lugar.
 * Qualquer edição cria um buffer/quadro novo. É isso que deixa o histórico
 * (desfazer/refazer) barato: ele só guarda referências.
 */

import { ALFABETO_INDICES } from './constantes.js';

export const MAX_CORES = 36; // contando a transparente
export const TAMANHO_MIN = 4;
export const TAMANHO_MAX = 128;

/** Paleta inicial: "Sweetie 16" (GrafxKid, domínio público CC0). */
export const PALETA_PADRAO = [
  'transparent',
  '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
  '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
];

/** Erro com mensagem pronta para mostrar ao usuário. */
export class ErroDoEditor extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDoEditor';
  }
}

/* ------------------------------------------------------------------ */
/* Cores                                                               */
/* ------------------------------------------------------------------ */

/** '#abc', 'ABC123' -> '#aabbcc' (minúsculo) ou null se não for uma cor válida. */
export function normalizarHex(texto) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(texto ?? '').trim());
  if (!m) return null;
  let c = m[1].toLowerCase();
  if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
  return `#${c}`;
}

export function hexParaRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbParaHex(r, g, b) {
  const p = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** Índice (>= 1) da cor da paleta mais parecida com `hex`. */
export function corMaisProxima(hex, paleta) {
  const [r, g, b] = hexParaRgb(hex);
  let melhor = 1;
  let menor = Infinity;
  for (let i = 1; i < paleta.length; i++) {
    const [pr, pg, pb] = hexParaRgb(paleta[i]);
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < menor) { menor = d; melhor = i; }
  }
  return melhor;
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

export const quadroVazio = (w, h, nCamadas) => ({
  camadas: Array.from({ length: nCamadas }, () => new Uint8Array(w * h)),
});

export function novoEstado({ nome, largura, altura }) {
  return {
    nome,
    largura,
    altura,
    fps: 8,
    paleta: PALETA_PADRAO.slice(),
    camadas: [{ nome: 'corpo', visivel: true }],
    quadros: [quadroVazio(largura, altura, 1)],
    atual: 0,
    camadaAtiva: 0,
  };
}

/** Cópia rasa: arrays novos, mas buffers e quadros compartilhados (são imutáveis por regra). */
export function copiarEstado(e) {
  return {
    ...e,
    paleta: e.paleta.slice(),
    camadas: e.camadas.map((c) => ({ ...c })),
    quadros: e.quadros.slice(),
  };
}

/* ------------------------------------------------------------------ */
/* Conversão: buffer <-> linhas de texto                               */
/* ------------------------------------------------------------------ */

export function bufferParaLinhas(buf, w, h) {
  const linhas = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += ALFABETO_INDICES[buf[y * w + x]];
    linhas.push(s);
  }
  return linhas;
}

/**
 * Lê as linhas de um quadro. `mapa` converte índices antigos em índices da paleta atual.
 * Lança ErroDoEditor dizendo onde está o problema (camada, linha).
 */
export function linhasParaBuffer(linhas, w, h, mapa, contexto = '') {
  const onde = contexto ? ` (${contexto})` : '';
  if (!Array.isArray(linhas)) {
    throw new ErroDoEditor(`Um quadro não está no formato de linhas de texto${onde}. Quadros por transformação ainda não são suportados.`);
  }
  if (linhas.length !== h) throw new ErroDoEditor(`Quadro com ${linhas.length} linhas em vez de ${h}${onde}.`);
  const buf = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const linha = linhas[y];
    if (typeof linha !== 'string' || linha.length !== w) {
      throw new ErroDoEditor(`A linha ${y + 1} tem tamanho diferente de ${w}${onde}.`);
    }
    for (let x = 0; x < w; x++) {
      const v = ALFABETO_INDICES.indexOf(linha[x]);
      if (v < 0 || v >= mapa.length) {
        throw new ErroDoEditor(`A linha ${y + 1}, coluna ${x + 1} usa o símbolo “${linha[x]}”, que não existe na paleta${onde}.`);
      }
      buf[y * w + x] = mapa[v];
    }
  }
  return buf;
}

/* ------------------------------------------------------------------ */
/* Estado -> sprite (um quadro por arquivo)                            */
/* ------------------------------------------------------------------ */

/** JSON de sprite com UM quadro (o `indice`), no formato do projeto. */
export function quadroParaSprite(e, indice, nome) {
  const quadro = e.quadros[indice];
  return {
    version: 1,
    name: nome,
    size: [e.largura, e.altura],
    palette: e.paleta.slice(),
    layers: e.camadas.map((c, ci) => ({
      name: c.nome,
      frames: [bufferParaLinhas(quadro.camadas[ci], e.largura, e.altura)],
    })),
    fps: e.fps,
  };
}

/**
 * Faz o caminho de volta: junta vários sprites (os arquivos da mesma "cadeia")
 * em um só documento. Cada sprite pode trazer 1 ou mais quadros.
 * - Tamanho, camadas e fps vêm do primeiro sprite; paletas diferentes são fundidas.
 * - Sprites de outro tamanho são ignorados (e listados em `ignorados`).
 */
export function spritesParaEstado(sprites) {
  if (!sprites.length) throw new ErroDoEditor('Nada para abrir.');
  const primeiro = sprites[0];
  validarSprite(primeiro);
  const [w, h] = primeiro.size;

  const paleta = ['transparent'];
  mapearPaleta(primeiro.palette, paleta); // começa com a paleta do primeiro, na ordem
  const camadas = primeiro.layers.map((l) => ({ nome: String(l.name), visivel: true }));
  if (!camadas.length) camadas.push({ nome: 'corpo', visivel: true });

  const quadros = [];
  const ignorados = [];
  for (const sp of sprites) {
    validarSprite(sp);
    if (sp.size[0] !== w || sp.size[1] !== h) { ignorados.push(sp.name); continue; }
    const mapa = mapearPaleta(sp.palette, paleta);
    const total = Math.max(1, ...sp.layers.map((l) => l.frames.length));
    for (let f = 0; f < total; f++) {
      quadros.push({
        camadas: camadas.map((c) => {
          const camada = sp.layers.find((l) => l.name === c.nome);
          const linhas = camada?.frames[f];
          if (!linhas) return new Uint8Array(w * h);
          return linhasParaBuffer(linhas, w, h, mapa, `${sp.name}, camada ${c.nome}, quadro ${f + 1}`);
        }),
      });
    }
  }
  return {
    estado: {
      nome: String(primeiro.name ?? 'sprite'),
      largura: w,
      altura: h,
      fps: Number.isFinite(primeiro.fps) && primeiro.fps > 0 ? primeiro.fps : 8,
      paleta,
      camadas,
      quadros,
      atual: 0,
      camadaAtiva: 0,
    },
    ignorados,
  };
}

function validarSprite(sp) {
  const ok = sp && Array.isArray(sp.size) && sp.size.length === 2
    && Number.isInteger(sp.size[0]) && Number.isInteger(sp.size[1])
    && sp.size[0] >= 1 && sp.size[1] >= 1 && sp.size[0] <= 256 && sp.size[1] <= 256
    && Array.isArray(sp.palette) && Array.isArray(sp.layers)
    && sp.layers.every((l) => l && Array.isArray(l.frames));
  if (!ok) throw new ErroDoEditor(`O arquivo “${sp?.name ?? '?'}” não está no formato de sprite esperado.`);
}

/**
 * Para cada cor da paleta `origem`, devolve o índice correspondente em `destino`
 * (acrescentando a cor se ainda não existir; se `destino` estiver cheia, usa a mais parecida).
 */
function mapearPaleta(origem, destino) {
  return origem.map((cor, i) => {
    if (i === 0) return 0;
    const hex = normalizarHex(cor);
    if (!hex) return destino.length > 1 ? 1 : 0;
    const achada = destino.indexOf(hex);
    if (achada > 0) return achada;
    if (destino.length < MAX_CORES) { destino.push(hex); return destino.length - 1; }
    return corMaisProxima(hex, destino);
  });
}
