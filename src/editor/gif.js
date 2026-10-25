/**
 * gif.js — Gerador de GIF animado, escrito à mão (sem bibliotecas).
 *
 * - Cores indexadas: a paleta do desenho vira a tabela de cores do GIF.
 * - Índice 0 = transparente (a paleta do editor sempre começa com "transparent").
 * - Cada quadro substitui o anterior ("disposal 2"), então a transparência não deixa rastro.
 * - Compressão LZW própria. Sem DOM: roda também no Node (testes).
 */

import { ErroDoEditor, hexParaRgb } from './documento.js';

export const GIF_LADO_MAX = 4096;

/** Comprime os índices com LZW (formato do GIF). Devolve os bytes crus (sem sub-blocos). */
export function lzw(indices, codigoMinimo) {
  const limpar = 1 << codigoMinimo;
  const fim = limpar + 1;
  let tamanho = codigoMinimo + 1;
  let proximo = fim + 1;
  let tabela = new Map();

  const saida = [];
  let acc = 0;
  let bits = 0;
  const emitir = (codigo) => {
    acc |= codigo << bits;
    bits += tamanho;
    while (bits >= 8) { saida.push(acc & 255); acc >>>= 8; bits -= 8; }
  };

  emitir(limpar);
  if (indices.length === 0) { emitir(fim); if (bits > 0) saida.push(acc & 255); return Uint8Array.from(saida); }

  const mascara = limpar - 1;
  let buffer = indices[0] & mascara;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i] & mascara;
    const chave = (buffer << 8) | k;
    const achado = tabela.get(chave);
    if (achado !== undefined) { buffer = achado; continue; }
    emitir(buffer);
    if (proximo === 4096) {
      emitir(limpar);
      proximo = fim + 1;
      tamanho = codigoMinimo + 1;
      tabela = new Map();
    } else {
      if (proximo >= (1 << tamanho)) tamanho++;
      tabela.set(chave, proximo++);
    }
    buffer = k;
  }
  emitir(buffer);
  emitir(fim);
  if (bits > 0) saida.push(acc & 255);
  return Uint8Array.from(saida);
}

const u16 = (n) => [n & 255, (n >> 8) & 255];

/** Amplia um quadro de índices por um fator inteiro (vizinho mais próximo). */
function ampliar(indices, largura, altura, escala) {
  if (escala === 1) return indices;
  const W = largura * escala;
  const saida = new Uint8Array(W * altura * escala);
  for (let y = 0; y < altura; y++) {
    const linha = y * escala * W;
    for (let x = 0; x < largura; x++) {
      const v = indices[y * largura + x];
      const o = linha + x * escala;
      for (let dx = 0; dx < escala; dx++) saida[o + dx] = v;
    }
    for (let dy = 1; dy < escala; dy++) saida.copyWithin(linha + dy * W, linha, linha + W);
  }
  return saida;
}

/**
 * @param quadros  lista de Uint8Array (índices da paleta, largura×altura)
 * @param paleta   ['transparent', '#rrggbb', …]
 * @param fps      quadros por segundo (o GIF guarda o atraso em centésimos de segundo)
 * @param escala   fator inteiro de ampliação
 * @param repetir  0 = para sempre; N = N vezes; 1 = toca uma vez
 * @returns Uint8Array com o arquivo .gif
 */
export function codificarGif({ quadros, largura, altura, paleta, fps = 8, escala = 1, repetir = 0 }) {
  if (!quadros?.length) throw new ErroDoEditor('Não há quadros para gerar o GIF.');
  if (!Number.isInteger(escala) || escala < 1) throw new ErroDoEditor('A escala precisa ser um número inteiro (1, 2, 4…).');
  const W = largura * escala;
  const H = altura * escala;
  if (W > GIF_LADO_MAX || H > GIF_LADO_MAX) {
    throw new ErroDoEditor(`O GIF ficaria com ${W}×${H} pixels (máximo ${GIF_LADO_MAX}). Escolha uma escala menor.`);
  }
  if (paleta.length > 256) throw new ErroDoEditor('Paleta grande demais para um GIF (máximo 256 cores).');

  // tabela de cores: tamanho em potência de 2 (mínimo 4 entradas)
  let bitsTabela = 2;
  while ((1 << bitsTabela) < paleta.length) bitsTabela++;
  const tamTabela = 1 << bitsTabela;

  const bytes = [];
  const empurrar = (arr) => { for (let i = 0; i < arr.length; i++) bytes.push(arr[i]); };

  empurrar([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);                 // "GIF89a"
  empurrar([...u16(W), ...u16(H), 0x80 | ((bitsTabela - 1) << 4) | (bitsTabela - 1), 0, 0]);
  for (let i = 0; i < tamTabela; i++) {
    const c = paleta[i];
    empurrar(!c || c === 'transparent' ? [0, 0, 0] : hexParaRgb(c));
  }
  // laço de repetição (extensão do Netscape). Sem ela, o GIF toca uma vez só.
  if (repetir !== 1) {
    empurrar([0x21, 0xff, 0x0b, ...Array.from('NETSCAPE2.0', (ch) => ch.charCodeAt(0)), 0x03, 0x01, ...u16(Math.max(0, repetir)), 0x00]);
  }

  const atraso = Math.max(2, Math.round(100 / Math.max(1, fps)));
  const codigoMinimo = Math.max(2, bitsTabela);

  for (const quadro of quadros) {
    if (quadro.length !== largura * altura) throw new ErroDoEditor('Um dos quadros tem tamanho diferente do desenho.');
    const dados = ampliar(quadro, largura, altura, escala);
    // controle gráfico: descarte 2 (apaga o quadro antes do próximo), cor transparente = índice 0
    empurrar([0x21, 0xf9, 0x04, (2 << 2) | 1, ...u16(atraso), 0x00, 0x00]);
    empurrar([0x2c, 0, 0, 0, 0, ...u16(W), ...u16(H), 0x00]);
    bytes.push(codigoMinimo);
    const comprimido = lzw(dados, codigoMinimo);
    for (let p = 0; p < comprimido.length; p += 255) {
      const parte = comprimido.subarray(p, Math.min(p + 255, comprimido.length));
      bytes.push(parte.length);
      empurrar(parte);
    }
    bytes.push(0x00);
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}
