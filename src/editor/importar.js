/**
 * importar.js — Abrir arquivos de fora no editor: JSON de sprite (com correção automática)
 * e imagens (PNG etc.).
 *
 * A parte de JSON não usa DOM (roda no Node, nos testes). Só `imagemDeArquivo` precisa do navegador.
 *
 * Filosofia da correção automática: se o arquivo está "quase certo", arrumamos e CONTAMOS ao
 * usuário o que foi mudado (lista de `correcoes`). Se não dá para arrumar sem inventar
 * conteúdo, recusamos com uma mensagem que diz exatamente o que está errado e onde.
 */

import {
  ErroDoEditor, MAX_CORES, normalizarHex, hexParaRgb, rgbParaHex, corMaisProxima, spritesParaEstado, referenciaDeJson,
} from './documento.js';
import { ALFABETO_INDICES } from './constantes.js';

export const LIMITE_JSON_CHARS = 25_000_000;
export const LIMITE_IMAGEM_BYTES = 30 * 1024 * 1024;
export const LIMITE_IMAGEM_PIXELS = 16_000_000;
export const LADO_MAX_DESENHO = 256;
export const MAX_QUADROS = 500;
export const MAX_CAMADAS = 20;
const MAX_BYTES_DESENHO = 64 * 1024 * 1024; // largura × altura × quadros × camadas

/* ------------------------------------------------------------------ */
/* JSON de sprite                                                      */
/* ------------------------------------------------------------------ */

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Nome de desenho aceito pelo app: sem / \ : @ . e com até 56 letras (o app acrescenta _01 no fim). */
export function nomeDeDesenho(texto, padrao = 'importado') {
  const limpo = String(texto ?? '').normalize('NFC').replace(/[\\/:@.\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 56).trim();
  return limpo || padrao;
}

const ehTransparente = (v) => v === null || v === undefined || v === '' || /^(transparent|none)$/i.test(String(v).trim());

/** Entende '#rgb', '#rrggbb', '#rgba', '#rrggbbaa', 'rgb(…)', 'rgba(…)'. -> 'transparent' | '#rrggbb' | null (não entendi) */
export function lerCor(valor) {
  if (ehTransparente(valor)) return 'transparent';
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  const hex = /^#?([0-9a-f]{4}|[0-9a-f]{8})$/i.exec(t);
  if (hex) {
    let c = hex[1].toLowerCase();
    if (c.length === 4) c = c.split('').map((x) => x + x).join('');
    return parseInt(c.slice(6), 16) < 128 ? 'transparent' : `#${c.slice(0, 6)}`;
  }
  const direto = normalizarHex(t);
  if (direto) return direto;
  const fn = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(t);
  if (fn) {
    const alfa = fn[4] === undefined ? 1 : (fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]));
    if (alfa < 0.5) return 'transparent';
    return rgbParaHex(Math.min(255, +fn[1]), Math.min(255, +fn[2]), Math.min(255, +fn[3]));
  }
  return null;
}

/**
 * Confere um sprite lido de um JSON e conserta o que dá. Devolve um sprite no formato
 * exato do projeto (que `spritesParaEstado` aceita) e a lista do que foi consertado.
 * Lança ErroDoEditor (mensagem em português) quando não há como consertar.
 */
export function corrigirSprite(bruto, nomePadrao = 'importado') {
  const correcoes = [];
  const nota = (t) => correcoes.push(t);

  if (Array.isArray(bruto)) {
    const objetos = bruto.filter(ehObjeto);
    if (!objetos.length) throw new ErroDoEditor('O arquivo é uma lista vazia; não achei nenhum desenho dentro.');
    if (objetos.length > 1) nota(`O arquivo tem ${objetos.length} desenhos; abri só o primeiro.`);
    bruto = objetos[0];
  }
  if (!ehObjeto(bruto)) throw new ErroDoEditor('Esse JSON não é um desenho: esperava um objeto com “size”, “palette” e “layers”.');
  if (bruto.frameWidth !== undefined && bruto.image !== undefined && bruto.frames !== undefined) {
    throw new ErroDoEditor('Esse arquivo é a lista de posições de uma sprite sheet, não um desenho. Importe a imagem PNG da sprite sheet no lugar.');
  }

  if (bruto.version !== undefined && bruto.version !== 1) nota(`O arquivo é da versão ${String(bruto.version).slice(0, 20)} do formato; tentei abrir como a versão 1.`);

  /* ----- nome ----- */
  const nome = nomeDeDesenho(bruto.name, nomeDeDesenho(nomePadrao));
  if (typeof bruto.name !== 'string' || !bruto.name.trim()) nota(`O arquivo não tinha nome; usei “${nome}”.`);
  else if (nome !== bruto.name) nota(`O nome foi ajustado para “${nome}” (nomes não podem ter / \\ : @ . e vão até 56 letras).`);

  /* ----- camadas e quadros ----- */
  let camadasBrutas = bruto.layers;
  if (camadasBrutas === undefined && Array.isArray(bruto.frames)) {
    camadasBrutas = [{ name: 'corpo', frames: bruto.frames }];
    nota('O arquivo não tinha camadas; criei uma camada “corpo” com os quadros.');
  }
  if (!Array.isArray(camadasBrutas) || !camadasBrutas.length) {
    throw new ErroDoEditor('Não achei as camadas do desenho (o campo “layers” está faltando ou vazio).');
  }
  if (camadasBrutas.length > MAX_CAMADAS) throw new ErroDoEditor(`O desenho tem ${camadasBrutas.length} camadas; o limite é ${MAX_CAMADAS}.`);

  const nomesUsados = new Set();
  const camadas = camadasBrutas.map((c, ci) => {
    if (!ehObjeto(c)) throw new ErroDoEditor(`A camada ${ci + 1} está num formato inválido.`);
    let nomeCamada = typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 40) : '';
    if (!nomeCamada) { nomeCamada = `camada ${ci + 1}`; nota(`A camada ${ci + 1} não tinha nome; chamei de “${nomeCamada}”.`); }
    if (nomesUsados.has(nomeCamada.toLowerCase())) {
      let k = 2;
      while (nomesUsados.has(`${nomeCamada} ${k}`.toLowerCase())) k++;
      nota(`Duas camadas se chamavam “${nomeCamada}”; a segunda virou “${nomeCamada} ${k}”.`);
      nomeCamada = `${nomeCamada} ${k}`;
    }
    nomesUsados.add(nomeCamada.toLowerCase());
    if (!Array.isArray(c.frames)) throw new ErroDoEditor(`A camada “${nomeCamada}” não tem a lista de quadros (“frames”).`);
    const quadros = c.frames.map((q, qi) => {
      if (Array.isArray(q)) return q.map((l) => (typeof l === 'string' ? l : (l === null || l === undefined ? '' : String(l))));
      if (typeof q === 'string') { nota(`O quadro ${qi + 1} da camada “${nomeCamada}” era um texto só; separei em linhas.`); return q.split(/\r?\n/); }
      if (q === null || q === undefined) return null;
      throw new ErroDoEditor(`O quadro ${qi + 1} da camada “${nomeCamada}” não está em linhas de texto.`);
    });
    return { nome: nomeCamada, quadros };
  });

  const nQuadros = Math.max(1, ...camadas.map((c) => c.quadros.length));
  if (nQuadros > MAX_QUADROS) throw new ErroDoEditor(`O desenho tem ${nQuadros} quadros; o limite é ${MAX_QUADROS}.`);
  if (camadas.some((c) => c.quadros.length !== nQuadros)) {
    nota(`As camadas tinham números de quadros diferentes; completei com quadros vazios até ${nQuadros}.`);
  }
  for (const c of camadas) while (c.quadros.length < nQuadros) c.quadros.push(null);

  /* ----- tamanho ----- */
  let largura;
  let altura;
  const tam = bruto.size;
  const num = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);
  if (Array.isArray(tam) && tam.length === 2 && Number.isFinite(num(tam[0])) && Number.isFinite(num(tam[1]))) {
    largura = Math.round(num(tam[0])); altura = Math.round(num(tam[1]));
    if (tam.some((v) => typeof v !== 'number' || !Number.isInteger(v))) nota('O tamanho tinha números quebrados ou em texto; arredondei.');
  } else if (Number.isFinite(num(bruto.width)) && Number.isFinite(num(bruto.height))) {
    largura = Math.round(num(bruto.width)); altura = Math.round(num(bruto.height));
    nota('O tamanho estava em “width” e “height”; usei esses valores.');
  } else {
    const primeiro = camadas.flatMap((c) => c.quadros).find((q) => q && q.length);
    if (!primeiro) throw new ErroDoEditor('Não achei o tamanho do desenho (“size”) e não há linhas de pixels para deduzir.');
    altura = primeiro.length;
    largura = Math.max(...primeiro.map((l) => l.length));
    nota(`O arquivo não dizia o tamanho; deduzi ${largura}×${altura} pelas linhas do primeiro quadro.`);
  }
  if (largura < 1 || altura < 1 || largura > LADO_MAX_DESENHO || altura > LADO_MAX_DESENHO) {
    throw new ErroDoEditor(`O tamanho ${largura}×${altura} não é permitido: use de 1 a ${LADO_MAX_DESENHO} pixels em cada lado.`);
  }
  if (largura * altura * nQuadros * camadas.length > MAX_BYTES_DESENHO) {
    throw new ErroDoEditor('O desenho é grande demais para abrir aqui (muitos quadros, camadas e pixels juntos).');
  }

  /* ----- paleta ----- */
  if (!Array.isArray(bruto.palette)) throw new ErroDoEditor('Não achei a paleta de cores (o campo “palette” está faltando).');
  let origem = bruto.palette.slice();
  if (origem.length > ALFABETO_INDICES.length) {
    nota(`A paleta tinha ${origem.length} cores; só as ${ALFABETO_INDICES.length} primeiras podem ser usadas pelos pixels.`);
    origem = origem.slice(0, ALFABETO_INDICES.length);
  }
  const invalidas = [];
  origem = origem.map((v) => {
    const cor = lerCor(v);
    if (cor === null) { invalidas.push(String(v).slice(0, 24)); return '#ff00ff'; }
    return cor;
  });
  if (invalidas.length) nota(`${plural(invalidas.length, 'cor da paleta não foi entendida', 'cores da paleta não foram entendidas')} (${invalidas.slice(0, 4).map((x) => `“${x}”`).join(', ')}${invalidas.length > 4 ? '…' : ''}) e ficaram rosa-choque (#ff00ff).`);

  // O índice 0 do projeto é sempre "transparente". Montamos a paleta do zero, cor por cor:
  //  - cores repetidas viram uma só;
  //  - "transparente" em qualquer posição vira o índice 0;
  //  - se passar do limite, a cor que não cabe usa a mais parecida.
  const paleta = ['transparent'];
  const mapaIndice = [];
  let semLugar = 0;
  let transparentesNoMeio = 0;
  origem.forEach((cor, i) => {
    if (cor === 'transparent') {
      mapaIndice[i] = 0;
      if (i > 0) transparentesNoMeio++;
      return;
    }
    const jaTem = paleta.indexOf(cor);
    if (jaTem > 0) { mapaIndice[i] = jaTem; return; }
    if (paleta.length < MAX_CORES) { paleta.push(cor); mapaIndice[i] = paleta.length - 1; return; }
    mapaIndice[i] = corMaisProxima(cor, paleta);
    semLugar++;
  });
  if (origem.length && origem[0] !== 'transparent') nota('A primeira cor da paleta não era transparente; acrescentei a cor transparente no começo e ajustei os pixels.');
  if (transparentesNoMeio) nota(`${plural(transparentesNoMeio, 'cor transparente estava', 'cores transparentes estavam')} no meio da paleta; os pixels dela${transparentesNoMeio > 1 ? 's' : ''} ficaram transparentes.`);
  if (semLugar) nota(`A paleta ficou cheia (limite de ${MAX_CORES} cores com a transparente); ${plural(semLugar, 'cor foi trocada pela mais parecida', 'cores foram trocadas pelas mais parecidas')}.`);

  /* ----- linhas de pixels ----- */
  const total = { mais: 0, menos: 0, desconhecido: 0, maiuscula: 0, linhasFaltando: 0, linhasSobrando: 0 };
  const usaveis = origem.length;
  const converter = (quadro) => {
    const saida = [];
    const linhas = quadro ?? [];
    if (linhas.length < altura) total.linhasFaltando += quadro ? altura - linhas.length : 0;
    if (linhas.length > altura) total.linhasSobrando += linhas.length - altura;
    for (let y = 0; y < altura; y++) {
      const linha = linhas[y] ?? '';
      if (linha.length < largura && quadro && y < linhas.length) total.mais++;
      if (linha.length > largura) total.menos++;
      let s = '';
      for (let x = 0; x < largura; x++) {
        const ch = x < linha.length ? linha[x] : '0';
        if (ch >= 'A' && ch <= 'Z') total.maiuscula++;
        const v = ALFABETO_INDICES.indexOf(ch.toLowerCase());
        if (v < 0 || v >= usaveis) {
          if (x < linha.length) total.desconhecido++;
          s += '0';
        } else s += ALFABETO_INDICES[mapaIndice[v]];
      }
      saida.push(s);
    }
    return saida;
  };
  const layers = camadas.map((c) => ({ name: c.nome, frames: c.quadros.map(converter) }));
  if (total.linhasFaltando) nota(`${total.linhasFaltando === 1 ? 'Faltava' : 'Faltavam'} ${plural(total.linhasFaltando, 'linha', 'linhas')} de pixels; completei com transparente.`);
  if (total.linhasSobrando) nota(`${total.linhasSobrando === 1 ? 'Sobrava' : 'Sobravam'} ${plural(total.linhasSobrando, 'linha', 'linhas')} de pixels; cortei o excesso.`);
  if (total.mais) nota(`${plural(total.mais, 'linha estava', 'linhas estavam')} curta${total.mais > 1 ? 's' : ''} demais; completei com transparente.`);
  if (total.menos) nota(`${plural(total.menos, 'linha estava', 'linhas estavam')} comprida${total.menos > 1 ? 's' : ''} demais; cortei o excesso.`);
  if (total.desconhecido) nota(`${plural(total.desconhecido, 'pixel usava', 'pixels usavam')} um símbolo que não existe na paleta; ${total.desconhecido > 1 ? 'viraram transparentes' : 'virou transparente'}.`);
  if (total.maiuscula) nota(`${plural(total.maiuscula, 'símbolo estava', 'símbolos estavam')} em letra maiúscula; entendi como minúscula.`);

  /* ----- velocidade ----- */
  let fps = 8;
  if (bruto.fps !== undefined) {
    const f = Number(bruto.fps);
    if (!Number.isFinite(f) || f <= 0) nota('A velocidade (fps) não era um número válido; usei 8 quadros por segundo.');
    else if (f > 60) { fps = 60; nota(`A velocidade de ${f} fps é alta demais; limitei a 60.`); } else if (f < 1) { fps = 1; nota('A velocidade era menor que 1 fps; usei 1.'); } else fps = f;
  }

  /* ----- imagem de inspiração ----- */
  const sprite = { version: 1, name: nome, size: [largura, altura], palette: paleta, layers, fps };
  if (bruto.reference !== undefined && bruto.reference !== null) {
    const ref = referenciaDeJson({ reference: bruto.reference });
    if (ref) sprite.reference = bruto.reference;
    else nota('A imagem de inspiração do arquivo estava estragada ou grande demais e foi ignorada.');
  }
  return { sprite, correcoes };
}

/** Posição legível de um erro de JSON ("perto da linha 3, coluna 7"), quando o navegador informa. */
function posicaoDoErro(texto, erro) {
  const msg = erro?.message ?? '';
  const lc = /line (\d+) column (\d+)/i.exec(msg);
  if (lc) return ` (perto da linha ${lc[1]}, coluna ${lc[2]})`;
  const m = /position (\d+)/i.exec(msg);
  if (!m) return '';
  const pos = Math.min(texto.length, Number(m[1]));
  const antes = texto.slice(0, pos);
  return ` (perto da linha ${antes.split('\n').length}, coluna ${pos - antes.lastIndexOf('\n')})`;
}

/**
 * Texto de um arquivo .json -> { estado, referencia, correcoes }.
 * @param nomeArquivo  usado como nome do desenho se o arquivo não tiver um
 */
export function jsonParaEstado(texto, nomeArquivo = 'importado') {
  if (typeof texto !== 'string') throw new ErroDoEditor('Não consegui ler o arquivo como texto.');
  if (texto.length > LIMITE_JSON_CHARS) throw new ErroDoEditor('Esse arquivo é grande demais para ser um desenho (mais de 25 MB de texto).');
  const limpo = texto.replace(/^﻿/, '');
  if (!limpo.trim()) throw new ErroDoEditor('O arquivo está vazio.');
  let dados;
  try {
    dados = JSON.parse(limpo);
  } catch (erro) {
    throw new ErroDoEditor(`Esse arquivo não é um JSON válido${posicaoDoErro(limpo, erro)}. Confira se ele foi salvo por inteiro e sem edições manuais.`);
  }
  const padrao = String(nomeArquivo).replace(/\.sprite\.json$|\.json$/i, '');
  const { sprite, correcoes } = corrigirSprite(dados, padrao);
  const { estado } = spritesParaEstado([sprite]);
  estado.nome = sprite.name;
  return { estado, referencia: referenciaDeJson(sprite), correcoes };
}

/* ------------------------------------------------------------------ */
/* Imagens                                                             */
/* ------------------------------------------------------------------ */

/**
 * Sugere o tamanho de cada quadro de uma imagem que pode ser sprite sheet:
 * fila de quadrados (largura múltipla da altura, ou o contrário) → quadrados; senão a imagem toda.
 */
export function sugerirQuadro(largura, altura) {
  if (altura < largura && largura % altura === 0 && altura <= LADO_MAX_DESENHO) return [altura, altura];
  if (largura < altura && altura % largura === 0 && largura <= LADO_MAX_DESENHO) return [largura, largura];
  if (largura <= LADO_MAX_DESENHO && altura <= LADO_MAX_DESENHO) return [largura, altura];
  return [Math.min(32, largura), Math.min(32, altura)];
}

/** Nome de desenho a partir do nome do arquivo: "Meu Herói.png" -> "Meu Herói". */
export const nomeDoArquivo = (nome) => nomeDeDesenho(String(nome).replace(/\.[a-z0-9]{1,5}$/i, '').replace(/\./g, ' '), 'imagem');

/**
 * Lê uma imagem (PNG, JPG, WebP, GIF — GIF animado entra só com o primeiro quadro).
 * @returns Promise<{ rgba: Uint8ClampedArray, largura, altura, nome }>   (só no navegador)
 */
export async function imagemDeArquivo(arquivo) {
  if (arquivo.size > LIMITE_IMAGEM_BYTES) throw new ErroDoEditor('Essa imagem é grande demais (mais de 30 MB).');
  let bmp = null;
  try {
    bmp = await createImageBitmap(arquivo, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  } catch {
    try { bmp = await createImageBitmap(arquivo); } catch { bmp = null; }
  }
  if (!bmp) throw new ErroDoEditor('Não consegui ler essa imagem. Use um arquivo PNG, JPG, WebP ou GIF.');
  try {
    if (bmp.width * bmp.height > LIMITE_IMAGEM_PIXELS) throw new ErroDoEditor(`Essa imagem tem ${bmp.width}×${bmp.height} pixels, grande demais (máximo ${LIMITE_IMAGEM_PIXELS / 1_000_000} milhões de pixels).`);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return { rgba: data, largura: bmp.width, altura: bmp.height, nome: nomeDoArquivo(arquivo.name) };
  } finally {
    bmp.close?.();
  }
}

export { hexParaRgb };
