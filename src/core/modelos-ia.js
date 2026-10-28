/**
 * modelos-ia.js — Organiza as listas enormes de modelos (Gemini e OpenRouter) em poucos
 * RECOMENDADOS, com explicação, e guarda o resultado do botão "Testar" de cada modelo.
 * Sem DOM. As regras usam o nome do modelo (assim continuam valendo quando saem versões novas).
 */

import { conversar } from './ia.js';

/* ---------- Gemini ---------- */

/** 'gemini-3.5-flash-lite-preview-06' -> { versao: 3.5, tipo: 'flash', leve: true, estavel: false } */
export function lerNomeGemini(id) {
  const m = /^gemini-(\d+(?:\.\d+)?)-(flash|pro)(-lite)?(.*)$/.exec(id);
  if (!m) return null;
  const resto = m[4];
  return {
    versao: parseFloat(m[1]),
    tipo: m[2],
    leve: !!m[3],
    estavel: !/(preview|exp|latest|thinking|tts|image|live|audio|native)/.test(resto) && !/^-\d{3}$/.test(resto) && resto === '',
    variante: resto,
  };
}

function maisNovo(lista, filtro) {
  return lista
    .map((m) => ({ m, n: lerNomeGemini(m.id) }))
    .filter((x) => x.n && filtro(x.n))
    .sort((a, b) => b.n.versao - a.n.versao)[0]?.m || null;
}

function organizarGemini(lista) {
  const escolhas = [];
  const usar = (m, papel, descricao, selos) => { if (m && !escolhas.some((e) => e.id === m.id)) escolhas.push({ ...m, papel, descricao, selos }); };
  const flash = maisNovo(lista, (n) => n.tipo === 'flash' && !n.leve && n.estavel) || maisNovo(lista, (n) => n.tipo === 'flash' && !n.leve);
  usar(flash, 'Recomendado', 'Rápido, bom em código e o que mais funciona no plano grátis. Use este para criar o jogo.', ['grátis', 'rápido']);
  usar(maisNovo(lista, (n) => n.tipo === 'pro' && n.estavel) || maisNovo(lista, (n) => n.tipo === 'pro'), 'Mais caprichado',
    'Pensa mais e erra menos em jogos grandes, mas é mais lento. No plano grátis pode não estar liberado ou ter limite bem menor.', ['mais lento']);
  usar(maisNovo(lista, (n) => n.tipo === 'flash' && n.leve && n.estavel) || maisNovo(lista, (n) => n.tipo === 'flash' && n.leve), 'Mais leve',
    'O mais rápido e com mais pedidos por dia no plano grátis, porém mais simples: bom para ajustes pequenos.', ['grátis', 'muito rápido']);
  return escolhas;
}

/* ---------- OpenRouter ---------- */

// Famílias boas em programação, na ordem de preferência (vale para versões novas também).
const GRATIS_PREFERIDOS = [/gpt-oss-120b/, /qwen.*coder/, /deepseek/, /gemini/, /llama-4|llama-3\.3-70b/, /devstral|codestral/, /nemotron/, /glm/, /kimi/, /qwen/, /mistral/];
const PAGOS_PREFERIDOS = [
  [/^google\/gemini-[\d.]+-flash$/, 'Barato e rápido; ótimo custo-benefício para jogos.'],
  [/^anthropic\/claude-[a-z-]*sonnet|^anthropic\/claude-sonnet/, 'Muito bom em código e em seguir instruções; custa mais.'],
  [/^openai\/gpt-[\d.]+-mini$/, 'Rápido e barato.'],
  [/^deepseek\/deepseek-(chat|v[\d.]+)$/, 'Bom em código e muito barato.'],
];

function organizarOpenRouter(lista) {
  const escolhas = [];
  const gratis = lista.filter((m) => m.gratis && (!m.contexto || m.contexto >= 16000));
  const posicao = (m) => { const i = GRATIS_PREFERIDOS.findIndex((re) => re.test(m.id)); return i < 0 ? 99 : i; };
  const ordenados = gratis.sort((a, b) => posicao(a) - posicao(b) || b.criado - a.criado || b.contexto - a.contexto);
  const familias = new Set();
  for (const m of ordenados) {
    const f = posicao(m);
    if (f === 99 || familias.has(f)) continue; // um de cada família
    familias.add(f);
    escolhas.push({
      ...m,
      papel: escolhas.length ? 'Grátis' : 'Grátis recomendado',
      descricao: escolhas.length ? 'Grátis, com limite de pedidos por dia. Se der erro de limite, troque para outro grátis.' : 'O melhor grátis para programar agora. Tem limite de pedidos por dia.',
      selos: ['grátis'],
    });
    if (escolhas.length >= 5) break;
  }
  for (const [re, descricao] of PAGOS_PREFERIDOS) {
    const m = lista.filter((x) => !x.gratis && re.test(x.id)).sort((a, b) => b.criado - a.criado)[0];
    if (m) escolhas.push({ ...m, papel: 'Pago', descricao: `${descricao} Gasta créditos do OpenRouter.`, selos: ['pago'] });
  }
  return escolhas;
}

/**
 * @returns { recomendados: [modelo + { papel, descricao, selos }], outros: [modelo] }
 */
export function organizarModelos(provedor, lista) {
  const recomendados = provedor === 'gemini' ? organizarGemini(lista) : organizarOpenRouter(lista);
  const ids = new Set(recomendados.map((m) => m.id));
  return { recomendados, outros: lista.filter((m) => !ids.has(m.id)) };
}

/* ---------- testes ---------- */

const CHAVE_TESTES = 'miniengine.ia.testes';
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function lerTestes() {
  try { return JSON.parse(ls()?.getItem(CHAVE_TESTES) || '{}') || {}; } catch { return {}; }
}
export const resultadoDoTeste = (m) => lerTestes()[`${m.provedor}:${m.id}`] || null;

/** Manda um pedido mínimo ao modelo. -> { ok, ms, erro?, em } (e guarda neste aparelho) */
export async function testarModelo(m) {
  const inicio = Date.now();
  let r;
  try {
    const resp = await conversar({ modelo: { provedor: m.provedor, id: m.id }, mensagens: [{ papel: 'usuario', texto: 'Responda apenas: OK' }], temperatura: 0 });
    r = { ok: /ok/i.test(resp.texto), ms: Date.now() - inicio, em: Date.now() };
    if (!r.ok) r.erro = 'respondeu algo estranho';
  } catch (x) {
    r = { ok: false, ms: Date.now() - inicio, erro: x.message || String(x), em: Date.now() };
  }
  const todos = lerTestes();
  todos[`${m.provedor}:${m.id}`] = r;
  try { ls()?.setItem(CHAVE_TESTES, JSON.stringify(todos)); } catch { /* sem armazenamento */ }
  return r;
}
