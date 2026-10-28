/**
 * png.js — Gerador de arquivos PNG (RGBA, 8 bits), escrito à mão.
 *
 * Por que não usar canvas.toBlob? Porque alguns navegadores (modo "privacidade forte",
 * por exemplo) alteram ou borram os pixels ao ler um canvas. Gerando o PNG direto dos
 * nossos dados, o resultado é sempre exatamente o que está no desenho.
 *
 * Sem DOM: roda também no Node (testes).
 */

import { crc32 } from '../core/zip.js';
import { ErroDoEditor } from './documento.js';

const ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib "sem compressão" (blocos guardados): usado se o navegador não tiver CompressionStream. */
function zlibGuardado(bytes) {
  const blocos = Math.max(1, Math.ceil(bytes.length / 65535));
  const saida = new Uint8Array(2 + bytes.length + blocos * 5 + 4);
  let o = 0;
  saida[o++] = 0x78; saida[o++] = 0x01;
  for (let b = 0; b < blocos; b++) {
    const ini = b * 65535;
    const tam = Math.min(65535, bytes.length - ini);
    saida[o++] = b === blocos - 1 ? 1 : 0;
    saida[o++] = tam & 255; saida[o++] = tam >> 8;
    saida[o++] = ~tam & 255; saida[o++] = (~tam >> 8) & 255;
    saida.set(bytes.subarray(ini, ini + tam), o);
    o += tam;
  }
  const ad = adler32(bytes);
  saida[o++] = ad >>> 24; saida[o++] = (ad >>> 16) & 255; saida[o++] = (ad >>> 8) & 255; saida[o++] = ad & 255;
  return saida;
}

async function zlib(bytes, comprimir) {
  if (comprimir && typeof CompressionStream === 'function') {
    const r = new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate')));
    return new Uint8Array(await r.arrayBuffer());
  }
  return zlibGuardado(bytes);
}

function bloco(tipo, dados) {
  const saida = new Uint8Array(12 + dados.length);
  const v = new DataView(saida.buffer);
  v.setUint32(0, dados.length);
  for (let i = 0; i < 4; i++) saida[4 + i] = tipo.charCodeAt(i);
  saida.set(dados, 8);
  v.setUint32(8 + dados.length, crc32(saida.subarray(4, 8 + dados.length)));
  return saida;
}

/**
 * @param rgba     Uint8ClampedArray | Uint8Array com largura×altura×4 bytes
 * @param opcoes   { comprimir = true }
 * @returns Promise<Uint8Array> com o arquivo .png
 */
export async function codificarPng({ rgba, largura, altura }, { comprimir = true } = {}) {
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 1 || altura < 1) {
    throw new ErroDoEditor('Tamanho de imagem inválido para gerar o PNG.');
  }
  if (rgba.length !== largura * altura * 4) throw new ErroDoEditor('Os pixels não batem com o tamanho da imagem.');

  // cada linha começa com um byte de "filtro" (0 = nenhum)
  const linhas = new Uint8Array((largura * 4 + 1) * altura);
  for (let y = 0; y < altura; y++) {
    linhas.set(rgba.subarray(y * largura * 4, (y + 1) * largura * 4), y * (largura * 4 + 1) + 1);
  }
  const cabecalho = new Uint8Array(13);
  const v = new DataView(cabecalho.buffer);
  v.setUint32(0, largura); v.setUint32(4, altura);
  cabecalho[8] = 8;  // 8 bits por canal
  cabecalho[9] = 6;  // RGBA

  const partes = [Uint8Array.from(ASSINATURA), bloco('IHDR', cabecalho), bloco('IDAT', await zlib(linhas, comprimir)), bloco('IEND', new Uint8Array(0))];
  const saida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of partes) { saida.set(p, pos); pos += p.length; }
  return saida;
}
