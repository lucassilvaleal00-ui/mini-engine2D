/**
 * exportar.js — Monta os arquivos de exportação do editor (sem DOM; roda também no Node).
 *
 * Formatos:
 *   png      o frame aberto, como imagem
 *   frames   todos os frames, um PNG cada, num ZIP
 *   sheet    sprite sheet (todos os frames numa grade), com ZIP+JSON de posições se pedido
 *   gif      animação
 *   camadas  cada camada em PNGs separados, num ZIP (uma pasta por camada)
 *   json     o desenho inteiro no formato do projeto (inclui a imagem de inspiração se pedido)
 *
 * IMPORTANTE: a imagem de inspiração NUNCA entra em PNG, GIF, sheet ou ZIP de imagens.
 * Ela só vai no JSON do projeto, e só se a pessoa marcar essa opção.
 */

import { criarZip } from '../core/zip.js';
import { ErroDoEditor, estadoParaSprite } from './documento.js';
import { nomeDoQuadro } from './constantes.js';
import { achatarQuadro, quadroParaRgba, camadaParaRgba, montarSpriteSheet, LADO_MAX_IMAGEM } from './imagem.js';
import { codificarPng } from './png.js';
import { codificarGif, GIF_LADO_MAX } from './gif.js';

export const ESCALAS = [1, 2, 4, 8, 16];

export const FORMATOS = [
  { id: 'png', rotulo: 'Imagem PNG', nota: 'o frame que está aberto' },
  { id: 'frames', rotulo: 'Todos os frames (ZIP de PNGs)', nota: 'uma imagem por frame' },
  { id: 'sheet', rotulo: 'Sprite sheet (PNG)', nota: 'todos os frames numa grade, para jogos' },
  { id: 'gif', rotulo: 'GIF animado', nota: 'a animação pronta' },
  { id: 'camadas', rotulo: 'Camadas separadas (ZIP de PNGs)', nota: 'uma pasta por camada' },
  { id: 'json', rotulo: 'Arquivo do projeto (JSON)', nota: 'para guardar ou importar depois' },
];

/** Quais formatos fazem sentido para este desenho. */
export function formatosDisponiveis(e) {
  return FORMATOS.filter((f) => {
    if (f.id === 'frames' || f.id === 'sheet') return e.quadros.length > 1;
    if (f.id === 'camadas') return e.camadas.length > 1;
    return true;
  });
}

const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Nome de arquivo que funciona em qualquer sistema (sem / \ : * ? " < > |, sem ponto no começo/fim). */
export function nomeSeguro(texto, padrao = 'desenho') {
  let n = String(texto ?? '').normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[._\s-]+|[._\s-]+$/g, '')
    .slice(0, 80);
  if (RESERVADOS.test(n)) n = `_${n}`;
  return n || padrao;
}

/** Maior escala que ainda deixa o desenho com no máximo ~512 px de lado (mínimo 1). */
export function escalaPadrao(e) {
  const lado = Math.max(e.largura, e.altura);
  let melhor = 1;
  for (const s of ESCALAS) if (lado * s <= 512) melhor = s;
  return melhor;
}

/** Colunas padrão da sprite sheet: tudo em uma linha (até 16 por linha). */
export const colunasPadrao = (total) => Math.max(1, Math.min(total, 16));

/** Tamanho (em pixels) da imagem que sairia, sem gerar nada. */
export function medidasDaSaida(e, { formato, escala = 1, colunas } = {}) {
  const total = e.quadros.length;
  if (formato === 'sheet') {
    const col = Math.max(1, Math.min(total, Math.round(colunas ?? colunasPadrao(total))));
    return { largura: col * e.largura * escala, altura: Math.ceil(total / col) * e.altura * escala, quadroLargura: e.largura * escala, quadroAltura: e.altura * escala };
  }
  return { largura: e.largura * escala, altura: e.altura * escala, quadroLargura: e.largura * escala, quadroAltura: e.altura * escala };
}

/** Esta escala cabe nos limites do formato? */
export function escalaPermitida(e, opcoes) {
  const { largura, altura } = medidasDaSaida(e, opcoes);
  const limite = opcoes.formato === 'gif' ? GIF_LADO_MAX : LADO_MAX_IMAGEM;
  return largura <= limite && altura <= limite;
}

const ARQUIVO = { png: 'image/png', zip: 'application/zip', gif: 'image/gif', json: 'application/json' };

/**
 * @param doc     { e: estado do documento, referencia: imagem de inspiração | null }
 * @param opcoes  { formato, escala = 1, colunas, jsonDaSheet = false, comReferencia = false, nomeBase }
 * @returns Promise<{ nome, tipo, bytes: Uint8Array, resumo }>
 */
export async function gerarSaida({ e, referencia = null }, opcoes) {
  const { formato, escala = 1, jsonDaSheet = false, comReferencia = false } = opcoes;
  const total = e.quadros.length;
  const base = nomeSeguro(opcoes.nomeBase ?? e.nome);
  if (formato !== 'json' && !escalaPermitida(e, { ...opcoes, escala })) {
    const m = medidasDaSaida(e, { ...opcoes, escala });
    throw new ErroDoEditor(`A imagem ficaria com ${m.largura}×${m.altura} pixels, grande demais. Escolha uma escala menor.`);
  }
  const nomeQuadro = (i) => nomeDoQuadro(base, i, total);
  const png = (img) => codificarPng(img);

  switch (formato) {
    case 'png': {
      const img = quadroParaRgba(e, e.quadros[e.atual], escala);
      return {
        nome: `${total > 1 ? nomeQuadro(e.atual) : base}.png`, tipo: ARQUIVO.png, bytes: await png(img),
        resumo: `${img.largura}×${img.altura} px`,
      };
    }
    case 'frames': {
      const arquivos = [];
      for (let i = 0; i < total; i++) arquivos.push({ caminho: `${nomeQuadro(i)}.png`, dados: await png(quadroParaRgba(e, e.quadros[i], escala)) });
      return { nome: `${base}_frames.zip`, tipo: ARQUIVO.zip, bytes: await criarZip(arquivos, { comprimir: false }), resumo: `${total} imagens de ${e.largura * escala}×${e.altura * escala} px` };
    }
    case 'sheet': {
      const s = montarSpriteSheet(e, { colunas: opcoes.colunas ?? colunasPadrao(total), escala });
      const nomePng = `${base}_sheet_${s.quadroLargura}x${s.quadroAltura}.png`;
      const bytesPng = await png(s);
      const resumo = `${s.largura}×${s.altura} px · ${s.colunas} × ${s.linhas} frames de ${s.quadroLargura}×${s.quadroAltura}`;
      if (!jsonDaSheet) return { nome: nomePng, tipo: ARQUIVO.png, bytes: bytesPng, resumo };
      const posicoes = {
        image: nomePng,
        frameWidth: s.quadroLargura,
        frameHeight: s.quadroAltura,
        columns: s.colunas,
        rows: s.linhas,
        scale: escala,
        fps: e.fps,
        frames: s.quadros.map((q) => ({ name: nomeQuadro(q.indice), x: q.x, y: q.y, w: q.largura, h: q.altura })),
      };
      return {
        nome: `${base}_sheet.zip`, tipo: ARQUIVO.zip, resumo,
        bytes: await criarZip([{ caminho: nomePng, dados: bytesPng }, { caminho: `${base}_sheet.json`, dados: JSON.stringify(posicoes, null, 2) }], { comprimir: false }),
      };
    }
    case 'gif': {
      const bytes = codificarGif({
        quadros: e.quadros.map((q) => achatarQuadro(e, q)), largura: e.largura, altura: e.altura, paleta: e.paleta, fps: e.fps, escala,
      });
      return { nome: `${base}.gif`, tipo: ARQUIVO.gif, bytes, resumo: `${total} ${total === 1 ? 'quadro' : 'quadros'} a ${e.fps} por segundo · ${e.largura * escala}×${e.altura * escala} px` };
    }
    case 'camadas': {
      if (e.camadas.length < 2) throw new ErroDoEditor('Este desenho tem uma camada só; use “Imagem PNG”.');
      const arquivos = [];
      for (let c = 0; c < e.camadas.length; c++) {
        const pasta = `${c + 1}-${nomeSeguro(e.camadas[c].nome, 'camada')}`;
        for (let i = 0; i < total; i++) {
          arquivos.push({ caminho: `${pasta}/${total > 1 ? nomeQuadro(i) : base}.png`, dados: await png(camadaParaRgba(e, e.quadros[i], c, escala)) });
        }
      }
      return {
        nome: `${base}_camadas.zip`, tipo: ARQUIVO.zip, bytes: await criarZip(arquivos, { comprimir: false }),
        resumo: `${e.camadas.length} camadas × ${total} ${total === 1 ? 'frame' : 'frames'}`,
      };
    }
    case 'json': {
      const sprite = estadoParaSprite(e, comReferencia ? referencia : null);
      sprite.name = base;
      const texto = JSON.stringify(sprite, null, 1);
      return {
        nome: `${base}.sprite.json`, tipo: ARQUIVO.json, bytes: new TextEncoder().encode(texto),
        resumo: `${e.largura}×${e.altura} px · ${total} ${total === 1 ? 'frame' : 'frames'}${comReferencia && referencia ? ' · com a imagem de inspiração' : ''}`,
      };
    }
    default:
      throw new ErroDoEditor('Escolha um formato para exportar.');
  }
}
