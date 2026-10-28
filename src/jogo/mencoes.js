/**
 * mencoes.js — A sintaxe `@` do chat do Criar jogo.
 *
 *   @pasta/                  todos os sprites de uma pasta (e das subpastas)
 *   @Personagens/Inimigos/   pasta pelo caminho
 *   @heroi                   um desenho (todos os frames: heroi_01, heroi_02…)
 *   @heroi.roupa             só uma camada do desenho
 *   @heroi:andar             uma ação (quando existirem ações, Etapa 2b; por enquanto usa o desenho inteiro)
 *   @floresta                um cenário
 *   @[nome com espaço]       nomes com espaço vão entre colchetes (o app completa sozinho)
 *
 * Sem DOM. O índice é montado a partir do armazenamento.
 */

import * as armazem from '../core/storage.js';
import { RAIZ } from '../core/tipos.js';
import { agruparSprites } from '../editor/arquivo.js';

const chave = (t) => String(t).normalize('NFC').toLocaleLowerCase('pt-BR').trim();

/** Nome que pode ir no código do jogo: 'Herói Azul' -> 'heroi_azul'. */
export function chaveDeAsset(nome) {
  const s = String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[a-z_]/.test(s) ? s || 'item' : `s_${s}`;
}

/** Como escrever a menção de um nome (com colchetes se tiver espaço ou símbolo). */
export const escreverMencao = (nome, sufixo = '') => (/^[\p{L}\p{N}_-]+$/u.test(nome) ? `@${nome}${sufixo}` : `@[${nome}]${sufixo}`);

/**
 * Índice de tudo que pode ser chamado:
 * { pastas: [{ id, nome, caminho }], desenhos: [{ nome, pastaId, caminho, grupo }], cenarios: [{ id, nome, caminho }] }
 */
export async function montarIndice() {
  const ativos = await armazem.listarAtivos();
  const porId = new Map(ativos.map((i) => [i.id, i]));
  const caminhoDe = (pastaId) => {
    const partes = [];
    for (let id = pastaId, guarda = 0; id && id !== RAIZ && guarda < 100; guarda++) {
      const p = porId.get(id);
      if (!p) break;
      partes.unshift(p.nome);
      id = p.paiId;
    }
    return partes.join('/');
  };
  const pastas = ativos.filter((i) => i.tipo === 'pasta').map((p) => ({ id: p.id, nome: p.nome, caminho: caminhoDe(p.id) }));
  const porPasta = new Map();
  for (const i of ativos) if (i.tipo === 'sprite') {
    if (!porPasta.has(i.paiId)) porPasta.set(i.paiId, []);
    porPasta.get(i.paiId).push(i);
  }
  const desenhos = [];
  for (const [pastaId, itens] of porPasta) {
    for (const g of agruparSprites(itens)) desenhos.push({ nome: g.base, pastaId, caminho: caminhoDe(pastaId), grupo: g });
  }
  const cenarios = ativos.filter((i) => i.tipo === 'cenario').map((c) => ({ id: c.id, nome: c.nome, caminho: caminhoDe(c.paiId) }));
  return { pastas, desenhos, cenarios, porId };
}

/** Acha as menções num texto: [{ bruto, nome, pasta: bool, camada?, acao? }] */
export function extrairMencoes(texto) {
  const saida = [];
  const re = /@\[([^\]\n]{1,80})\]([^\s@,;!?()]*)|@([^\s@,;!?()[\]]+)/gu;
  for (const m of String(texto).matchAll(re)) {
    let nome = m[1] !== undefined ? m[1] : m[3];
    let resto = m[1] !== undefined ? m[2] : '';
    // tira pontuação final comum ("@heroi." no fim da frase)
    if (m[3] !== undefined) {
      const fim = /[.:]+$/.exec(nome);
      if (fim) nome = nome.slice(0, -fim[0].length);
    }
    if (m[3] !== undefined) {
      // separa "heroi.roupa" / "heroi:andar" / "pasta/"
      const sep = /^(.*?)([.:].*)$/.exec(nome);
      if (sep && !nome.endsWith('/')) { nome = sep[1]; resto = sep[2]; }
    }
    if (!nome) continue;
    const pasta = nome.endsWith('/') || resto.startsWith('/');
    nome = nome.replace(/\/+$/, '');
    let acao = null;
    let camada = null;
    const ra = /^:([^.]+)/.exec(resto);
    if (ra) acao = ra[1];
    const rc = /\.([^.:/]+)$/.exec(resto);
    if (rc) camada = rc[1];
    saida.push({ bruto: m[0].replace(/[.:]+$/, ''), nome, pasta, acao, camada });
  }
  return saida;
}

/**
 * Resolve menções no índice.
 * @returns { itens: [{ bruto, tipo: 'desenho'|'pasta'|'cenario', alvo, camada?, aviso? }], naoEncontradas: [bruto] }
 */
export function resolverMencoes(mencoes, indice) {
  const itens = [];
  const naoEncontradas = [];
  for (const m of mencoes) {
    const k = chave(m.nome);
    const porCaminho = (lista) => lista.find((x) => chave(x.caminho ? `${x.caminho}/${x.nome}` : x.nome) === k);
    if (m.pasta) {
      const p = indice.pastas.find((x) => chave(x.caminho) === k) || indice.pastas.find((x) => chave(x.nome) === k);
      if (p) itens.push({ bruto: m.bruto, tipo: 'pasta', alvo: p });
      else naoEncontradas.push(m.bruto);
      continue;
    }
    const d = porCaminho(indice.desenhos) || indice.desenhos.find((x) => chave(x.nome) === k);
    if (d) {
      const item = { bruto: m.bruto, tipo: 'desenho', alvo: d, camada: m.camada || null };
      if (m.acao) item.aviso = `“${m.bruto}”: ações (andar, correr…) chegam na Etapa 2b; por enquanto vai o desenho inteiro.`;
      itens.push(item);
      continue;
    }
    const c = indice.cenarios.find((x) => chave(x.nome) === k);
    if (c) { itens.push({ bruto: m.bruto, tipo: 'cenario', alvo: c }); continue; }
    const p = indice.pastas.find((x) => chave(x.caminho) === k) || indice.pastas.find((x) => chave(x.nome) === k);
    if (p) { itens.push({ bruto: m.bruto, tipo: 'pasta', alvo: p }); continue; }
    naoEncontradas.push(m.bruto);
  }
  return { itens, naoEncontradas };
}

/** Sugestões para o autocompletar enquanto a pessoa digita `@algo`. */
export function sugerir(indice, prefixo, limite = 8) {
  const k = chave(prefixo);
  const todas = [
    ...indice.desenhos.map((d) => ({ tipo: 'desenho', icone: '🎨', nome: d.nome, onde: d.caminho || 'Raiz', texto: escreverMencao(d.nome), detalhe: `${d.grupo.quadros} frame${d.grupo.quadros > 1 ? 's' : ''}` })),
    ...indice.pastas.map((p) => ({ tipo: 'pasta', icone: '📁', nome: p.nome, onde: p.caminho, texto: escreverMencao(p.nome, '/'), detalhe: 'pasta inteira' })),
    ...indice.cenarios.map((c) => ({ tipo: 'cenario', icone: '🗺️', nome: c.nome, onde: c.caminho || 'Raiz', texto: escreverMencao(c.nome), detalhe: 'cenário' })),
  ];
  const comeca = todas.filter((s) => chave(s.nome).startsWith(k));
  const contem = todas.filter((s) => !chave(s.nome).startsWith(k) && chave(s.nome).includes(k));
  return [...comeca, ...contem].slice(0, limite);
}

/** Desenhos dentro de uma pasta (inclui subpastas). */
export function desenhosDaPasta(indice, pastaId) {
  const dentro = new Set([pastaId]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of indice.pastas) {
      const item = indice.porId.get(p.id);
      if (item && dentro.has(item.paiId) && !dentro.has(p.id)) { dentro.add(p.id); mudou = true; }
    }
  }
  return indice.desenhos.filter((d) => dentro.has(d.pastaId));
}
