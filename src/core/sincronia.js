/**
 * sincronia.js — Mantém este aparelho e a nuvem (Supabase) com os mesmos itens.
 *
 * Como funciona (um "ciclo"):
 *   1. PUXAR: pergunta à nuvem quais itens mudaram desde a última vez (só id + data, leve);
 *      baixa por inteiro apenas os que este aparelho ainda não tem naquela versão e aplica.
 *   2. Conserta itens cuja pasta foi apagada em outro aparelho (vão para a raiz).
 *   3. ENVIAR: manda as alterações feitas aqui (storage.js marca cada uma como pendente).
 *
 * Conflito (o mesmo item mudou aqui E no outro aparelho): a versão da nuvem fica no lugar
 * e a deste aparelho vira uma cópia "nome (conflito)". Nada se perde.
 *
 * Quando roda: ao abrir o app, ~3 s depois de qualquer alteração, ao voltar para a aba,
 * quando a internet volta e a cada minuto com o app aberto. Sem internet, as alterações
 * esperam e vão depois.
 *
 * Avisa as telas com o evento `miniengine:nuvem` (detail = estado).
 */

import { lerMeta, gravarMeta } from './db.js';
import * as armazem from './storage.js';
import { rest, sessaoAtual, entrar as entrarNaConta, criarConta as criarContaNova, sair as sairDaConta, ErroDaNuvem } from './nuvem.js';

const CHAVE_MARCA = 'nuvem.marca';   // maior `alterado_em` já visto na nuvem
const CHAVE_CONTA = 'nuvem.conta';   // id da conta com que este aparelho sincroniza
const CHAVE_ULTIMA = 'nuvem.ultima'; // quando terminou o último ciclo com sucesso
const FOLGA_MS = 10_000;             // relê os últimos 10 s (gravações que demoraram a confirmar)
const PAGINA = 500;
const LOTE_DOWNLOAD = 40;

const estado = {
  fase: 'desligada', // desligada | ociosa | sincronizando | sem_rede | erro
  email: null,
  ultimaEm: null,
  pendentes: 0,
  erro: null,
  conflitos: [],
};

export const estadoDaSincronia = () => ({ ...estado, conflitos: [...estado.conflitos] });

function emitir(extra = {}) {
  if (typeof globalThis.dispatchEvent !== 'function') return;
  try {
    globalThis.dispatchEvent(new CustomEvent('miniengine:nuvem', { detail: { ...estadoDaSincronia(), ...extra } }));
  } catch { /* sem eventos (Node) */ }
}

/* ------------------------------------------------------------------ */
/* Puxar                                                               */
/* ------------------------------------------------------------------ */

const menosFolga = (iso) => new Date(Date.parse(iso) - FOLGA_MS).toISOString();
const filtroData = (iso) => `alterado_em=gt.${encodeURIComponent(iso)}`;

async function puxar() {
  const marca = await lerMeta(CHAVE_MARCA, null);
  const total = { aplicados: 0, apagados: 0, conflitos: [], renomeados: 0 };
  let desde = marca ? menosFolga(marca) : null;
  let maior = marca;

  for (let guarda = 0; guarda < 1000; guarda++) {
    const filtro = desde ? `&${filtroData(desde)}` : '';
    const leves = await rest(`itens?select=id,alterado_em&order=alterado_em.asc,id.asc&limit=${PAGINA}${filtro}`);
    if (!leves?.length) break;

    // só baixa por inteiro o que este aparelho ainda não tem nessa versão
    const base = await lerMeta('nuvem.base', {});
    const faltam = leves.filter((l) => base[l.id] !== l.alterado_em).map((l) => l.id);
    for (let i = 0; i < faltam.length; i += LOTE_DOWNLOAD) {
      const ids = faltam.slice(i, i + LOTE_DOWNLOAD);
      const linhas = await rest(`itens?select=id,item,dados,apagado,alterado_em&id=in.(${ids.map(encodeURIComponent).join(',')})&order=alterado_em.asc`);
      const r = await armazem.nuvemAplicarRemotos(linhas || []);
      total.aplicados += r.aplicados;
      total.apagados += r.apagados;
      total.renomeados += r.renomeados;
      total.conflitos.push(...r.conflitos);
    }

    const ultima = leves[leves.length - 1].alterado_em;
    if (!maior || Date.parse(ultima) > Date.parse(maior) || (Date.parse(ultima) === Date.parse(maior) && ultima > maior)) maior = ultima;
    await gravarMeta(CHAVE_MARCA, maior);
    if (leves.length < PAGINA) break;
    desde = ultima;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Enviar                                                              */
/* ------------------------------------------------------------------ */

async function enviar(usuarioId) {
  let enviados = 0;
  const vistos = new Map();
  for (let guarda = 0; guarda < 500; guarda++) {
    const lote = await armazem.nuvemLerPendentes();
    if (!lote.length) break;
    // proteção contra laço: o mesmo id com a mesma marca de novo = algo não confirmou
    if (lote.every((p) => vistos.get(p.id) === p.marca)) break;
    lote.forEach((p) => vistos.set(p.id, p.marca));

    const linhas = lote.map((p) => ({
      user_id: usuarioId,
      id: p.id,
      item: p.item,
      dados: p.item ? p.dados : null,
      apagado: !p.item,
    }));
    const resposta = await rest('itens?on_conflict=user_id,id&select=id,alterado_em,apagado', {
      metodo: 'POST',
      corpo: linhas,
      cabecalhos: { Prefer: 'resolution=merge-duplicates,return=representation' },
    });
    const quando = new Map((resposta || []).map((r) => [r.id, r]));
    await armazem.nuvemConfirmarEnvio(lote.filter((p) => quando.has(p.id)).map((p) => ({
      id: p.id, marca: p.marca, alteradoEm: quando.get(p.id).alterado_em, apagado: !p.item,
    })));
    enviados += lote.length;
  }
  return enviados;
}

/* ------------------------------------------------------------------ */
/* Ciclo                                                               */
/* ------------------------------------------------------------------ */

let rodando = null;
let deNovo = false;

/** Roda um ciclo agora (ou espera o que já está rodando e roda mais um). Devolve o resumo. */
export function sincronizarAgora() {
  if (rodando) { deNovo = true; return rodando; }
  rodando = (async () => {
    let resumo = null;
    do {
      deNovo = false;
      resumo = await umCiclo();
    } while (deNovo && estado.fase === 'ociosa');
    return resumo;
  })().finally(() => { rodando = null; });
  return rodando;
}

async function umCiclo() {
  const sessao = sessaoAtual();
  if (!sessao) {
    Object.assign(estado, { fase: 'desligada', email: null, erro: null });
    estado.pendentes = await armazem.nuvemContarPendentes().catch(() => 0);
    emitir();
    return null;
  }
  Object.assign(estado, { fase: 'sincronizando', email: sessao.user.email, erro: null });
  emitir();
  try {
    if ((await lerMeta(CHAVE_CONTA, null)) !== sessao.user.id) {
      // primeira vez desta conta neste aparelho: tudo daqui vai para a nuvem e tudo de lá vem
      await armazem.nuvemPrepararPrimeiraVez();
      await gravarMeta(CHAVE_MARCA, null);
      await gravarMeta(CHAVE_CONTA, sessao.user.id);
    }
    const recebido = await puxar();
    const orfaos = await armazem.nuvemConsertarOrfaos();
    const enviados = await enviar(sessao.user.id);
    const agora = Date.now();
    await gravarMeta(CHAVE_ULTIMA, agora);
    if (recebido.conflitos.length) estado.conflitos = [...estado.conflitos, ...recebido.conflitos].slice(-20);
    Object.assign(estado, { fase: 'ociosa', ultimaEm: agora, pendentes: await armazem.nuvemContarPendentes() });
    const resumo = { ...recebido, orfaos, enviados };
    emitir({ mudou: recebido.aplicados + recebido.apagados + orfaos > 0, resumo });
    return resumo;
  } catch (erro) {
    const semRede = erro instanceof ErroDaNuvem && erro.codigo === 'sem_rede';
    Object.assign(estado, {
      fase: semRede ? 'sem_rede' : 'erro',
      erro: erro.message || String(erro),
      pendentes: await armazem.nuvemContarPendentes().catch(() => estado.pendentes),
    });
    if (erro instanceof ErroDaNuvem && ['sessao_expirada', 'sem_sessao'].includes(erro.codigo)) estado.email = null;
    emitir();
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */

let relogio = null;
function agendar(ms) {
  if (!sessaoAtual()) return;
  clearTimeout(relogio);
  relogio = setTimeout(() => { sincronizarAgora().catch(() => {}); }, ms);
}

let iniciada = false;

/** Liga a sincronização automática (chamado uma vez, em main.js). */
export async function iniciarSincronia() {
  if (iniciada) return;
  iniciada = true;
  estado.ultimaEm = await lerMeta(CHAVE_ULTIMA, null).catch(() => null);
  estado.email = sessaoAtual()?.user.email ?? null;
  estado.fase = estado.email ? 'ociosa' : 'desligada';
  estado.pendentes = await armazem.nuvemContarPendentes().catch(() => 0);

  globalThis.addEventListener('miniengine:mudanca-local', async () => {
    estado.pendentes = await armazem.nuvemContarPendentes().catch(() => estado.pendentes);
    emitir();
    agendar(3000);
  });
  globalThis.addEventListener('online', () => agendar(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') agendar(300);
    else if (estado.pendentes > 0 || relogio) sincronizarAgora().catch(() => {}); // saindo: tenta enviar já
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') agendar(0);
  }, 60_000);
  agendar(0);
  emitir();
}

/* ------------------------------------------------------------------ */
/* Conta (usado pela tela Nuvem)                                       */
/* ------------------------------------------------------------------ */

export async function entrar(email, senha) {
  await entrarNaConta(email, senha);
  return sincronizarAgora();
}

export async function criarConta(email, senha) {
  await criarContaNova(email, senha);
  return sincronizarAgora();
}

/** Sai da conta neste aparelho. Os itens continuam aqui; a próxima conta que entrar recebe tudo. */
export async function sair() {
  await sairDaConta();
  await armazem.nuvemEsquecer();
  await gravarMeta(CHAVE_CONTA, null);
  await gravarMeta(CHAVE_MARCA, null);
  Object.assign(estado, { fase: 'desligada', email: null, erro: null, conflitos: [] });
  estado.pendentes = await armazem.nuvemContarPendentes().catch(() => 0);
  emitir();
}

export const limparConflitos = () => { estado.conflitos = []; emitir(); };
