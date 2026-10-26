/**
 * assets.js — Transforma as menções (@heroi, @pasta/…) em "assets" que o jogo carrega.
 *
 * Cada desenho vira um sprite sheet PNG (data URL) gerado na hora a partir do desenho salvo,
 * então editar o sprite no editor já muda o jogo na próxima execução.
 * Sem DOM (roda no Node nos testes).
 */

import { abrirDesenho } from '../editor/arquivo.js';
import { montarSpriteSheet } from '../editor/imagem.js';
import { codificarPng } from '../editor/png.js';
import * as armazem from '../core/storage.js';
import { normalizar as normalizarCenario, larguraPx, alturaPx } from '../cenario/modelo.js';
import { comporCenario, objetosComTamanho } from '../cenario/render.js';
import { chaveDeAsset, extrairMencoes, resolverMencoes, desenhosDaPasta } from './mencoes.js';

const cache = new Map(); // chave do desenho + data -> asset

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function assetDoDesenho(desenho, camada) {
  const g = desenho.grupo;
  const marca = `${g.itens.map((i) => `${i.id}:${i.atualizadoEm}`).join(',')}|${camada || ''}`;
  if (cache.has(marca)) return cache.get(marca);
  const { estado } = await abrirDesenho(g);
  let e = estado;
  if (camada) {
    const i = e.camadas.findIndex((c) => c.nome.toLocaleLowerCase('pt-BR') === camada.toLocaleLowerCase('pt-BR'));
    if (i < 0) throw new Error(`o desenho “${desenho.nome}” não tem a camada “${camada}” (tem: ${e.camadas.map((c) => c.nome).join(', ')})`);
    e = { ...e, camadas: e.camadas.map((c, j) => ({ ...c, visivel: j === i })) };
  }
  const sheet = montarSpriteSheet(e, { colunas: Math.min(e.quadros.length, 16), escala: 1 });
  const png = await codificarPng({ rgba: sheet.rgba, largura: sheet.largura, altura: sheet.altura });
  const asset = {
    url: `data:image/png;base64,${base64(png)}`,
    frameWidth: e.largura,
    frameHeight: e.altura,
    frames: e.quadros.length,
    fps: e.fps || 8,
    camadas: e.camadas.map((c) => c.nome),
  };
  cache.set(marca, asset);
  return asset;
}

/** Cenário -> uma imagem por nível (1 fundo com a cor de fundo, 2 meio, 3 frente) + lista de objetos. */
async function assetDoCenario(id, item) {
  const marca = `cen:${id}:${item.atualizadoEm}`;
  if (cache.has(marca)) return cache.get(marca);
  const c = normalizarCenario(item.dados, item.nome);
  const niveis = {};
  for (const n of [1, 2, 3]) {
    if (!c.objetos.some((o) => o.nivel === n) && !(n === 1 && c.fundo)) continue;
    const img = await comporCenario(c, { niveis: [n], comFundo: n === 1 });
    niveis[n] = `data:image/png;base64,${base64(await codificarPng(img))}`;
  }
  const objetos = await objetosComTamanho(c);
  const asset = { largura: larguraPx(c), altura: alturaPx(c), grade: c.grade, niveis, objetos, solidos: objetos.filter((o) => o.solido).map(({ x, y, largura, altura }) => ({ x, y, largura, altura })) };
  cache.set(marca, asset);
  return asset;
}

/**
 * @param referencias  textos com @ (ex.: ['@heroi', '@Inimigos/'])
 * @returns { sprites: [{ key, origem, url, frameWidth, frameHeight, frames, fps, camadas, caminho }], cenarios: [{ key, origem, dados }], avisos: [texto] }
 */
export async function montarAssets(referencias, indice) {
  const mencoes = referencias.flatMap((r) => extrairMencoes(r));
  const { itens, naoEncontradas } = resolverMencoes(mencoes, indice);
  const avisos = naoEncontradas.map((b) => `${b}: não encontrei esse nome (foi apagado ou renomeado?).`);
  const sprites = [];
  const cenarios = [];
  const usadas = new Set();
  const novaChave = (base) => {
    let k = base;
    for (let n = 2; usadas.has(k); n++) k = `${base}_${n}`;
    usadas.add(k);
    return k;
  };
  const jaTem = new Set();

  const adicionarDesenho = async (d, origem, camada = null) => {
    const id = `${d.pastaId}|${d.nome}|${camada || ''}`;
    if (jaTem.has(id)) return;
    jaTem.add(id);
    try {
      const a = await assetDoDesenho(d, camada);
      sprites.push({ key: novaChave(chaveDeAsset(camada ? `${d.nome}_${camada}` : d.nome)), origem, caminho: d.caminho, ...a });
    } catch (erro) {
      avisos.push(`${origem}: ${erro.message}`);
    }
  };

  for (const it of itens) {
    if (it.aviso) avisos.push(it.aviso);
    if (it.tipo === 'desenho') await adicionarDesenho(it.alvo, it.bruto, it.camada);
    else if (it.tipo === 'pasta') {
      const lista = desenhosDaPasta(indice, it.alvo.id);
      if (!lista.length) avisos.push(`${it.bruto}: a pasta não tem desenhos.`);
      for (const d of lista) await adicionarDesenho(d, it.bruto);
    } else if (it.tipo === 'cenario') {
      const c = await armazem.obterComDados(it.alvo.id);
      if (!c?.dados) continue;
      try {
        cenarios.push({ key: novaChave(chaveDeAsset(it.alvo.nome)), origem: it.bruto, ...(await assetDoCenario(it.alvo.id, c)) });
      } catch (erro) { avisos.push(`${it.bruto}: ${erro.message}`); }
    }
  }
  return { sprites, cenarios, avisos };
}

/** Texto curto que a IA recebe sobre os assets (sem as imagens). */
export function descreverAssets({ sprites, cenarios }) {
  if (!sprites.length && !cenarios.length) return 'Nenhum asset chamado ainda. Se o jogo precisar de imagens, use formas simples do Phaser (retângulos, círculos) e liste em PENDENCIAS os sprites que faltam.';
  const linhas = sprites.map((s) => `- spritesheet "${s.key}" (de ${s.origem}${s.caminho ? `, pasta ${s.caminho}` : ''}): frames de ${s.frameWidth}x${s.frameHeight}px, ${s.frames} frame(s), ${s.fps} fps, camadas: ${s.camadas.join(', ')}${s.frames > 1 ? `; animação pronta "${s.key}"` : ''}`);
  for (const c of cenarios) {
    linhas.push(`- cenário "${c.key}" (de ${c.origem}): ${c.largura}x${c.altura}px, grade ${c.grade}px, ${c.objetos.length} objetos, ${c.solidos.length} sólidos. Use \`const cen = montarCenario(this, '${c.key}')\` no create(): desenha os níveis (depth 10 fundo, 20 meio, 30 frente) e devolve { largura, altura, solidos: [{x,y,largura,altura}], objetos }. Ponha o jogador em depth 25 para passar atrás da frente. Para colisão, crie corpos estáticos nos retângulos de cen.solidos.`);
  }
  return linhas.join('\n');
}
