/**
 * projeto.js — O "projeto de jogo" (item tipo `jogo`), sem DOM.
 *
 * dados do item:
 * {
 *   version: 1, nome, capa: dataURL | null,
 *   arquivos: { 'main.js': '…', 'JOGO.md': '…', 'HISTORIA.md': '…' },   // o código e os textos do jogo
 *   memoria: '…',             // resumo que a IA mantém: o que já existe, decisões, o que falta
 *   pendencias: ['…'],        // coisas que a IA pediu e o app ainda não tem (ex.: um sprite)
 *   referencias: ['@heroi'],  // tudo que já foi chamado com @ (vira asset do jogo)
 *   conversas: [{ id, titulo, criadaEm, mensagens: [{ id, papel: 'usuario'|'ia'|'sistema', texto, em, imagens?, alterou?, versao?, erro? }] }],
 *   conversaAtual: id,
 *   versoes: [{ id, em, descricao, arquivos }],  // fotografias ANTES de cada mudança da IA (para desfazer)
 *   modelo: { provedor, id } | null,
 * }
 */

import * as armazem from '../core/storage.js';
import { RAIZ } from '../core/tipos.js';

export const MAX_VERSOES = 25;
export const MAX_MENSAGENS_POR_CONVERSA = 400;
const NOME_ARQUIVO = /^[A-Za-z0-9_-]{1,40}\.(js|json|md)$/;

export const novoIdCurto = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function novaConversa(numero = 1) {
  return { id: novoIdCurto(), titulo: `Conversa ${numero}`, criadaEm: Date.now(), mensagens: [] };
}

export function projetoVazio(nome, capa = null) {
  const c = novaConversa(1);
  return {
    version: 1,
    nome,
    capa,
    arquivos: {},
    memoria: '',
    pendencias: [],
    referencias: [],
    conversas: [c],
    conversaAtual: c.id,
    versoes: [],
    modelo: null,
  };
}

/** Conserta dados velhos/estragados para o formato atual (nunca lança). */
export function normalizar(d, nomeDoItem = 'Jogo') {
  const p = d && typeof d === 'object' ? { ...d } : {};
  const base = projetoVazio(nomeDoItem);
  p.version = 1;
  p.nome = nomeDoItem;
  p.capa = typeof p.capa === 'string' && p.capa.startsWith('data:image/') ? p.capa : null;
  p.arquivos = Object.fromEntries(Object.entries(p.arquivos && typeof p.arquivos === 'object' ? p.arquivos : {})
    .filter(([n, t]) => NOME_ARQUIVO.test(n) && typeof t === 'string'));
  p.memoria = typeof p.memoria === 'string' ? p.memoria : '';
  p.pendencias = Array.isArray(p.pendencias) ? p.pendencias.filter((x) => typeof x === 'string') : [];
  p.referencias = Array.isArray(p.referencias) ? [...new Set(p.referencias.filter((x) => typeof x === 'string'))] : [];
  p.conversas = Array.isArray(p.conversas) && p.conversas.length
    ? p.conversas.filter((c) => c && c.id).map((c) => ({ ...c, titulo: String(c.titulo || 'Conversa'), mensagens: Array.isArray(c.mensagens) ? c.mensagens : [] }))
    : base.conversas;
  if (!p.conversas.length) p.conversas = base.conversas;
  if (!p.conversas.some((c) => c.id === p.conversaAtual)) p.conversaAtual = p.conversas[p.conversas.length - 1].id;
  p.versoes = Array.isArray(p.versoes) ? p.versoes.slice(-MAX_VERSOES) : [];
  p.modelo = p.modelo && p.modelo.provedor && p.modelo.id ? p.modelo : null;
  return p;
}

export const nomeDeArquivoValido = (n) => NOME_ARQUIVO.test(n);
export const temJogo = (p) => Object.keys(p.arquivos).some((n) => n.endsWith('.js'));
export const conversaAtual = (p) => p.conversas.find((c) => c.id === p.conversaAtual) || p.conversas[0];

/** Aplica arquivos novos/alterados/apagados, guardando antes uma versão para desfazer. Devolve a versão. */
export function aplicarArquivos(p, { arquivos = {}, apagar = [], descricao = '' }) {
  const versao = { id: novoIdCurto(), em: Date.now(), descricao: descricao.slice(0, 120), arquivos: { ...p.arquivos } };
  const novos = { ...p.arquivos };
  for (const [nome, texto] of Object.entries(arquivos)) if (nomeDeArquivoValido(nome)) novos[nome] = texto;
  for (const nome of apagar) delete novos[nome];
  p.arquivos = novos;
  p.versoes = [...p.versoes, versao].slice(-MAX_VERSOES);
  return versao;
}

/** Volta os arquivos para como estavam antes da versão `id` (o que veio depois também é desfeito). */
export function desfazerAte(p, id) {
  const i = p.versoes.findIndex((v) => v.id === id);
  if (i < 0) return false;
  p.arquivos = { ...p.versoes[i].arquivos };
  p.versoes = p.versoes.slice(0, i);
  return true;
}

/* ---------- armazenamento (o projeto é um item `jogo` comum: entra no backup e na nuvem) ---------- */

export const listarProjetos = () => armazem.listarPorTipo('jogo');

export async function criarProjeto(nome, capa) {
  const nomeLivre = await armazem.nomeDisponivel(RAIZ, String(nome ?? '').trim() || 'Meu jogo');
  const limpo = armazem.validarNome(nomeLivre);
  const dados = projetoVazio(limpo, capa);
  return armazem.criarItem({ tipo: 'jogo', nome: limpo, paiId: RAIZ, dados, resumo: { descricao: 'Projeto de jogo' } });
}

export async function abrirProjeto(id) {
  const item = await armazem.obterComDados(id);
  if (!item || item.lixeiraLote || item.tipo !== 'jogo') return null;
  return { item, projeto: normalizar(item.dados, item.nome) };
}

export function resumoDoProjeto(p) {
  const arquivos = Object.keys(p.arquivos).length;
  const conversas = p.conversas.length;
  return { descricao: arquivos ? `${arquivos} arquivo${arquivos > 1 ? 's' : ''} · ${conversas} conversa${conversas > 1 ? 's' : ''}` : 'Ainda sem jogo' };
}

export function salvarProjeto(id, p) {
  for (const c of p.conversas) if (c.mensagens.length > MAX_MENSAGENS_POR_CONVERSA) c.mensagens = c.mensagens.slice(-MAX_MENSAGENS_POR_CONVERSA);
  return armazem.salvarDados(id, p, { resumo: resumoDoProjeto(p) });
}
