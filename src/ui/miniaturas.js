/**
 * miniaturas.js — Imagem pequena de cada item para o Gerenciador e os painéis de arquivos.
 *   sprite  -> o primeiro frame do desenho
 *   jogo    -> a imagem do projeto
 *   cenario -> o cenário reduzido (quando o construtor fornece a função de desenho)
 * Guardadas em memória por id + data de alteração (não pesam no banco nem na nuvem).
 */

import * as armazem from '../core/storage.js';
import { spritesParaEstado } from '../editor/documento.js';
import { quadroParaRgba } from '../editor/imagem.js';

const cache = new Map();
const LADO = 96;
let desenharCenario = null;

/** O construtor de cenário registra aqui como desenhar a miniatura de um cenário. */
export function registrarMiniaturaDeCenario(fn) { desenharCenario = fn; }

/** RGBA -> canvas no tamanho real. */
export function rgbaParaCanvas({ rgba, largura, altura }) {
  const c = document.createElement('canvas');
  c.width = largura;
  c.height = altura;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), largura, altura), 0, 0);
  return c;
}

/** Canvas do frame `quadro` de um sprite salvo (dados JSON), ou null. */
export function canvasDoSprite(dados, quadro = 0) {
  const { estado } = spritesParaEstado([dados]);
  const q = estado.quadros[Math.min(quadro, estado.quadros.length - 1)];
  return rgbaParaCanvas(quadroParaRgba(estado, q, 1));
}

function reduzir(canvas) {
  const escala = Math.min(LADO / canvas.width, LADO / canvas.height);
  const s = escala >= 1 ? Math.floor(escala) : escala;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * s));
  c.height = Math.max(1, Math.round(canvas.height * s));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/** data URL da miniatura do item, ou null (pasta, item vazio, erro). */
export function miniaturaDoItem(item) {
  if (!item || item.tipo === 'pasta') return Promise.resolve(null);
  const chave = `${item.id}:${item.atualizadoEm}`;
  if (cache.has(chave)) return cache.get(chave);
  const p = (async () => {
    const completo = await armazem.obterComDados(item.id);
    const dados = completo?.dados;
    if (!dados) return null;
    if (item.tipo === 'sprite') return reduzir(canvasDoSprite(dados, 0));
    if (item.tipo === 'jogo') return typeof dados.capa === 'string' && dados.capa.startsWith('data:image/') ? dados.capa : null;
    if (item.tipo === 'cenario' && desenharCenario) {
      const c = await desenharCenario(dados);
      return c ? reduzir(c) : null;
    }
    return null;
  })().catch(() => null);
  cache.set(chave, p);
  return p;
}
