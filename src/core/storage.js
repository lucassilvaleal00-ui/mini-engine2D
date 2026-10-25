/**
 * storage.js — Camada de armazenamento do Mini Engine.
 *
 * É o ÚNICO módulo que as telas usam para guardar e ler dados. Hoje fala com
 * o IndexedDB (via db.js); no futuro um módulo irmão (ex.: sincronização) pode
 * espelhar estes mesmos métodos sem que as telas mudem.
 *
 * MODELO
 *   Item (metadados, store "itens"):
 *     { id, tipo, nome, paiId, criadoEm, atualizadoEm, resumo?,
 *       lixeiraLote?, lixeiraEm?, lixeiraRaiz?, paiOriginalId? }
 *   Dados (store "dados"): { id, dados }   — só para sprite/cenario/jogo
 *
 *   - `paiId` é o id da pasta onde o item está, ou RAIZ.
 *   - Nomes são únicos dentro da mesma pasta (sem diferenciar maiúsculas).
 *   - Excluir manda a pasta e TODO o conteúdo para a lixeira como um "lote"
 *     (lixeiraLote). Só o item excluído diretamente tem lixeiraRaiz = true.
 *   - Itens na lixeira nunca aparecem nas listagens normais.
 */

import { transacao, pedido } from './db.js';
import { RAIZ, TIPOS } from './tipos.js';

export class ErroDeArmazenamento extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.name = 'ErroDeArmazenamento';
    this.codigo = codigo;
  }
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const coletor = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const chaveDoNome = (nome) => nome.normalize('NFC').toLocaleLowerCase('pt-BR');
const agora = () => Date.now();
const ativo = (item) => !!item && !item.lixeiraLote;

// Estes símbolos são reservados para chamar itens no chat da IA:
//   @pasta/   @sprite   @sprite:acao   @sprite:acao.camada
const SIMBOLOS_PROIBIDOS = /[\/\\:@.]/;
export const TAMANHO_MAXIMO_NOME = 60;

export function novoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Limpa e valida um nome. Lança ErroDeArmazenamento se for inválido. */
export function validarNome(bruto) {
  const nome = String(bruto ?? '').trim().replace(/\s+/g, ' ');
  if (!nome) throw new ErroDeArmazenamento('nome_vazio', 'Digite um nome.');
  if (nome.length > TAMANHO_MAXIMO_NOME) {
    throw new ErroDeArmazenamento('nome_longo', `O nome pode ter no máximo ${TAMANHO_MAXIMO_NOME} caracteres.`);
  }
  if (SIMBOLOS_PROIBIDOS.test(nome)) {
    throw new ErroDeArmazenamento(
      'nome_simbolo',
      'Não use / \\ : @ . no nome — esses símbolos são reservados para chamar itens no chat da IA.',
    );
  }
  return nome;
}

/* ------------------------------------------------------------------ */
/* Helpers internos (sempre dentro de uma transação `s`)                */
/* ------------------------------------------------------------------ */

async function filhosAtivos(s, paiId) {
  const todos = await pedido(s.itens.index('paiId').getAll(paiId));
  return todos.filter(ativo);
}

async function exigirAtivo(s, id) {
  const item = await pedido(s.itens.get(id));
  if (!ativo(item)) {
    throw new ErroDeArmazenamento('nao_encontrado', 'Esse item não existe mais (ou está na lixeira).');
  }
  return item;
}

async function exigirDestino(s, paiId) {
  if (paiId === RAIZ) return;
  const pasta = await pedido(s.itens.get(paiId));
  if (!ativo(pasta) || pasta.tipo !== 'pasta') {
    throw new ErroDeArmazenamento('destino_invalido', 'A pasta de destino não existe mais.');
  }
}

async function exigirNomeLivre(s, paiId, nome, ignorarId = null) {
  const chave = chaveDoNome(nome);
  const irmaos = await filhosAtivos(s, paiId);
  if (irmaos.some((i) => i.id !== ignorarId && chaveDoNome(i.nome) === chave)) {
    throw new ErroDeArmazenamento('nome_duplicado', `Já existe um item chamado “${nome}” nessa pasta.`);
  }
}

/** Devolve `base` ou `base (2)`, `base (3)`... até achar um nome livre. */
async function nomeLivre(s, paiId, base, ignorarId = null) {
  const irmaos = await filhosAtivos(s, paiId);
  const usados = new Set(irmaos.filter((i) => i.id !== ignorarId).map((i) => chaveDoNome(i.nome)));
  if (!usados.has(chaveDoNome(base))) return base;
  for (let n = 2; ; n++) {
    const sufixo = ` (${n})`;
    const candidato = base.slice(0, TAMANHO_MAXIMO_NOME - sufixo.length) + sufixo;
    if (!usados.has(chaveDoNome(candidato))) return candidato;
  }
}

/** Item + todos os descendentes ativos (ignora o que já está em outra lixeira). */
async function subarvore(s, raizId) {
  const raiz = await exigirAtivo(s, raizId);
  const lista = [raiz];
  const fila = raiz.tipo === 'pasta' ? [raiz.id] : [];
  while (fila.length) {
    const id = fila.shift();
    for (const filho of await filhosAtivos(s, id)) {
      lista.push(filho);
      if (filho.tipo === 'pasta') fila.push(filho.id);
    }
  }
  return lista;
}

/** "Personagens / Inimigos" — ou null se alguma pasta do caminho não existe/está na lixeira. */
async function textoDoCaminho(s, pastaId) {
  if (pastaId === RAIZ) return 'Raiz';
  const partes = [];
  let cursor = pastaId;
  for (let guarda = 0; cursor !== RAIZ && guarda < 200; guarda++) {
    const pasta = await pedido(s.itens.get(cursor));
    if (!ativo(pasta)) return null;
    partes.unshift(pasta.nome);
    cursor = pasta.paiId;
  }
  return partes.join(' / ');
}

const ordenar = (lista) => lista.sort((a, b) => {
  if ((a.tipo === 'pasta') !== (b.tipo === 'pasta')) return a.tipo === 'pasta' ? -1 : 1;
  return coletor.compare(a.nome, b.nome);
});

/* ------------------------------------------------------------------ */
/* Criar, ler, salvar                                                  */
/* ------------------------------------------------------------------ */

export function criarPasta(nome, paiId = RAIZ) {
  return criarItem({ tipo: 'pasta', nome, paiId });
}

/**
 * Cria um item. `dados` é o JSON do sprite/cenário/jogo; `resumo` é um objeto
 * pequeno (ex.: { descricao: '3 camadas · 4 quadros' }) mostrado nas listas
 * sem precisar carregar os dados.
 */
export function criarItem({ tipo, nome, paiId = RAIZ, dados = null, resumo = null }) {
  if (!TIPOS[tipo]) {
    return Promise.reject(new ErroDeArmazenamento('tipo_invalido', `Tipo desconhecido: ${tipo}`));
  }
  return transacao('readwrite', async (s) => {
    const limpo = validarNome(nome);
    await exigirDestino(s, paiId);
    await exigirNomeLivre(s, paiId, limpo);
    const t = agora();
    const item = { id: novoId(), tipo, nome: limpo, paiId, criadoEm: t, atualizadoEm: t };
    if (resumo) item.resumo = resumo;
    await pedido(s.itens.add(item));
    if (tipo !== 'pasta') await pedido(s.dados.put({ id: item.id, dados }));
    return item;
  }).then((item) => {
    lembrarDePedirPersistencia();
    return item;
  });
}

/** Metadados de um item (inclusive se estiver na lixeira). */
export function obter(id) {
  return transacao('readonly', ({ itens }) => pedido(itens.get(id)));
}

/** Metadados + `dados` (o JSON pesado). */
export function obterComDados(id) {
  return transacao('readonly', async (s) => {
    const item = await pedido(s.itens.get(id));
    if (!item) return undefined;
    const registro = item.tipo === 'pasta' ? null : await pedido(s.dados.get(id));
    return { ...item, dados: registro ? registro.dados : null };
  });
}

/** Grava os dados de um item (é o que o editor chama ao salvar). */
export function salvarDados(id, dados, { resumo, nome } = {}) {
  return transacao('readwrite', async (s) => {
    const item = await exigirAtivo(s, id);
    if (item.tipo === 'pasta') {
      throw new ErroDeArmazenamento('tipo_invalido', 'Pastas não têm dados para salvar.');
    }
    if (nome !== undefined && nome !== item.nome) {
      const limpo = validarNome(nome);
      await exigirNomeLivre(s, item.paiId, limpo, id);
      item.nome = limpo;
    }
    if (resumo !== undefined) item.resumo = resumo;
    item.atualizadoEm = agora();
    await pedido(s.itens.put(item));
    await pedido(s.dados.put({ id, dados }));
    return item;
  });
}

/** Itens de uma pasta (pastas primeiro, ordem alfabética). Pastas trazem `qtd`. */
export function listarFilhos(paiId = RAIZ) {
  return transacao('readonly', async (s) => {
    const filhos = await filhosAtivos(s, paiId);
    await Promise.all(
      filhos.filter((i) => i.tipo === 'pasta').map(async (pasta) => {
        pasta.qtd = (await filhosAtivos(s, pasta.id)).length;
      }),
    );
    return ordenar(filhos);
  });
}

/** Caminho da raiz até a pasta: [{ id, nome }, ...]. [] na raiz; null se a pasta não existe. */
export function caminho(pastaId) {
  return transacao('readonly', async (s) => {
    const trilha = [];
    let cursor = pastaId;
    for (let guarda = 0; cursor !== RAIZ && guarda < 200; guarda++) {
      const pasta = await pedido(s.itens.get(cursor));
      if (!ativo(pasta) || pasta.tipo !== 'pasta') return null;
      trilha.unshift({ id: pasta.id, nome: pasta.nome });
      cursor = pasta.paiId;
    }
    return trilha;
  });
}

/** Todas as pastas em ordem de árvore: [{ id, nome, paiId, nivel }]. Usada ao mover itens. */
export function listarPastas() {
  return transacao('readonly', async (s) => {
    const todas = (await pedido(s.itens.index('tipo').getAll('pasta'))).filter(ativo);
    const porPai = new Map();
    for (const p of todas) {
      if (!porPai.has(p.paiId)) porPai.set(p.paiId, []);
      porPai.get(p.paiId).push(p);
    }
    const saida = [];
    const visitar = (paiId, nivel) => {
      const filhas = (porPai.get(paiId) || []).sort((a, b) => coletor.compare(a.nome, b.nome));
      for (const p of filhas) {
        saida.push({ id: p.id, nome: p.nome, paiId: p.paiId, nivel });
        visitar(p.id, nivel + 1);
      }
    };
    visitar(RAIZ, 0);
    return saida;
  });
}

/** Sugere um nome livre numa pasta (ex.: "Exemplo" -> "Exemplo (2)"). */
export function nomeDisponivel(paiId, base) {
  return transacao('readonly', (s) => nomeLivre(s, paiId, base));
}

/* ------------------------------------------------------------------ */
/* Renomear, mover, duplicar                                           */
/* ------------------------------------------------------------------ */

export function renomear(id, novoNome) {
  return transacao('readwrite', async (s) => {
    const item = await exigirAtivo(s, id);
    const limpo = validarNome(novoNome);
    if (limpo === item.nome) return item;
    await exigirNomeLivre(s, item.paiId, limpo, id);
    item.nome = limpo;
    item.atualizadoEm = agora();
    await pedido(s.itens.put(item));
    return item;
  });
}

export function mover(id, novoPaiId) {
  return transacao('readwrite', async (s) => {
    const item = await exigirAtivo(s, id);
    await exigirDestino(s, novoPaiId);
    if (item.paiId === novoPaiId) return item;

    if (item.tipo === 'pasta') {
      // Proíbe mover uma pasta para dentro dela mesma (ou de uma filha).
      let cursor = novoPaiId;
      for (let guarda = 0; cursor !== RAIZ && guarda < 200; guarda++) {
        if (cursor === id) {
          throw new ErroDeArmazenamento('mover_para_dentro', 'Não dá para mover uma pasta para dentro dela mesma.');
        }
        const pai = await pedido(s.itens.get(cursor));
        if (!pai) break;
        cursor = pai.paiId;
      }
    }

    await exigirNomeLivre(s, novoPaiId, item.nome, id);
    item.paiId = novoPaiId;
    item.atualizadoEm = agora();
    await pedido(s.itens.put(item));
    return item;
  });
}

/** Copia o item (e, se for pasta, tudo que está dentro). A cópia fica ao lado do original. */
export function duplicar(id) {
  return transacao('readwrite', async (s) => {
    const lista = await subarvore(s, id);
    const original = lista[0];
    const novosIds = new Map(lista.map((i) => [i.id, novoId()]));
    const nomeDaCopia = await nomeLivre(s, original.paiId, `${original.nome} (cópia)`);
    const t = agora();
    let novaRaiz = null;

    for (const velho of lista) {
      const copia = { ...velho, id: novosIds.get(velho.id), criadoEm: t, atualizadoEm: t };
      if (velho.resumo) copia.resumo = structuredClone(velho.resumo);
      if (velho.id === original.id) {
        copia.nome = nomeDaCopia;
        novaRaiz = copia;
      } else {
        copia.paiId = novosIds.get(velho.paiId);
      }
      await pedido(s.itens.add(copia));
      if (velho.tipo !== 'pasta') {
        const registro = await pedido(s.dados.get(velho.id));
        await pedido(s.dados.put({ id: copia.id, dados: structuredClone(registro ? registro.dados : null) }));
      }
    }
    return { item: novaRaiz, quantidade: lista.length };
  });
}

/* ------------------------------------------------------------------ */
/* Lixeira                                                             */
/* ------------------------------------------------------------------ */

/** Manda o item (e o que estiver dentro dele) para a lixeira, como um lote. */
export function enviarParaLixeira(id) {
  return transacao('readwrite', async (s) => {
    const lista = await subarvore(s, id);
    const lote = novoId();
    const t = agora();
    for (const item of lista) {
      item.lixeiraLote = lote;
      item.lixeiraEm = t;
      if (item.id === id) {
        item.lixeiraRaiz = true;
        item.paiOriginalId = item.paiId;
      }
      await pedido(s.itens.put(item));
    }
    return { lote, quantidade: lista.length, item: lista[0] };
  });
}

/** Lotes na lixeira, do mais recente ao mais antigo. */
export function listarLixeira() {
  return transacao('readonly', async (s) => {
    const todos = await pedido(s.itens.index('lixeiraLote').getAll());
    const contagem = new Map();
    for (const i of todos) contagem.set(i.lixeiraLote, (contagem.get(i.lixeiraLote) || 0) + 1);

    const lotes = [];
    for (const raiz of todos.filter((i) => i.lixeiraRaiz)) {
      lotes.push({
        lote: raiz.lixeiraLote,
        item: raiz,
        quantidade: contagem.get(raiz.lixeiraLote),
        em: raiz.lixeiraEm,
        origem: await textoDoCaminho(s, raiz.paiOriginalId ?? RAIZ),
      });
    }
    return lotes.sort((a, b) => b.em - a.em);
  });
}

export async function contarLixeira() {
  return (await listarLixeira()).length;
}

/**
 * Tira um lote da lixeira. Volta para a pasta original; se ela não existir
 * mais, vai para a raiz. Se o nome já estiver em uso lá, ganha " (2)".
 */
export function restaurar(lote) {
  return transacao('readwrite', async (s) => {
    const todos = await pedido(s.itens.index('lixeiraLote').getAll(lote));
    const raiz = todos.find((i) => i.lixeiraRaiz);
    if (!raiz) throw new ErroDeArmazenamento('nao_encontrado', 'Esse item não está mais na lixeira.');

    let destino = raiz.paiOriginalId ?? RAIZ;
    let paraRaiz = false;
    if (destino !== RAIZ) {
      const pai = await pedido(s.itens.get(destino));
      if (!ativo(pai) || pai.tipo !== 'pasta') {
        destino = RAIZ;
        paraRaiz = true;
      }
    }
    const nomeAntigo = raiz.nome;
    const nomeNovo = await nomeLivre(s, destino, nomeAntigo, raiz.id);

    for (const item of todos) {
      delete item.lixeiraLote;
      delete item.lixeiraEm;
      delete item.lixeiraRaiz;
      delete item.paiOriginalId;
      if (item.id === raiz.id) {
        item.paiId = destino;
        item.nome = nomeNovo;
      }
      await pedido(s.itens.put(item));
    }
    return {
      item: raiz,
      destinoId: destino,
      destinoTexto: await textoDoCaminho(s, destino),
      paraRaiz,
      renomeado: nomeNovo !== nomeAntigo,
      quantidade: todos.length,
    };
  });
}

async function apagarLoteDentro(s, itens) {
  for (const item of itens) {
    await pedido(s.itens.delete(item.id));
    if (item.tipo !== 'pasta') await pedido(s.dados.delete(item.id));
  }
  return itens.length;
}

/** Apaga de vez um lote da lixeira. Não tem volta. */
export function excluirDefinitivamente(lote) {
  return transacao('readwrite', async (s) => {
    const itens = await pedido(s.itens.index('lixeiraLote').getAll(lote));
    return apagarLoteDentro(s, itens);
  });
}

export function esvaziarLixeira() {
  return transacao('readwrite', async (s) => {
    const itens = await pedido(s.itens.index('lixeiraLote').getAll());
    return apagarLoteDentro(s, itens);
  });
}

/* ------------------------------------------------------------------ */
/* Backup e restauração                                                */
/* ------------------------------------------------------------------ */

/**
 * Tudo que está "vivo" (a lixeira fica de fora), para montar um backup.
 * -> { itens: [item…], dados: Map(id -> JSON) }   (pastas não têm dados)
 */
export function lerTudoParaBackup() {
  return transacao('readonly', async (s) => {
    const itens = (await pedido(s.itens.getAll())).filter(ativo);
    const dados = new Map();
    for (const item of itens) {
      if (item.tipo === 'pasta') continue;
      const registro = await pedido(s.dados.get(item.id));
      dados.set(item.id, registro ? registro.dados : null);
    }
    return { itens, dados };
  });
}

/** Quantos itens (sem contar pastas) existem e quantos mudaram depois de `desde` (ms). */
export function contarAlteracoes(desde) {
  return transacao('readonly', async ({ itens }) => {
    const todos = (await pedido(itens.getAll())).filter((i) => ativo(i) && i.tipo !== 'pasta');
    return { total: todos.length, alterados: desde ? todos.filter((i) => i.atualizadoEm > desde).length : todos.length };
  });
}

const nomeAproveitavel = (bruto) => {
  try { return validarNome(bruto); } catch { /* cai para a limpeza abaixo */ }
  const limpo = String(bruto ?? '').replace(/[\/\\:@.]/g, '').replace(/\s+/g, ' ').trim().slice(0, TAMANHO_MAXIMO_NOME).trim();
  return limpo || 'Item';
};

/**
 * Restaura uma árvore de itens (vinda de um backup) dentro de uma pasta NOVA na raiz.
 * Nada que já existe é tocado, e tudo ganha ids novos. É uma transação só: ou entra tudo, ou nada.
 *
 * @param nomePasta  nome da pasta nova (se já existir, vira "nome (2)")
 * @param itens      [{ refId, refPaiId|null, tipo, nome, dados, resumo?, criadoEm?, atualizadoEm? }]
 *                   `refPaiId` aponta para outro `refId` da lista; se não achar, o item vai direto na pasta nova.
 * @returns { pasta, criados, renomeados }
 */
export function importarArvore({ nomePasta, itens }) {
  return transacao('readwrite', async (s) => {
    const t = agora();
    const raiz = {
      id: novoId(), tipo: 'pasta', nome: await nomeLivre(s, RAIZ, nomeAproveitavel(nomePasta)),
      paiId: RAIZ, criadoEm: t, atualizadoEm: t,
    };
    await pedido(s.itens.add(raiz));

    const idNovo = new Map(itens.map((i) => [i.refId, novoId()]));
    const pastasValidas = new Set(itens.filter((i) => i.tipo === 'pasta').map((i) => i.refId));
    const usados = new Map(); // id da pasta-mãe nova -> nomes já usados nela
    let renomeados = 0;

    for (const i of itens) {
      if (!TIPOS[i.tipo]) continue;
      const paiNovo = i.refPaiId && pastasValidas.has(i.refPaiId) ? idNovo.get(i.refPaiId) : raiz.id;
      if (!usados.has(paiNovo)) usados.set(paiNovo, new Set());
      const nomes = usados.get(paiNovo);
      let nome = nomeAproveitavel(i.nome);
      if (nome !== i.nome) renomeados++;
      if (nomes.has(chaveDoNome(nome))) {
        let n = 2;
        let candidato;
        do {
          const sufixo = ` (${n++})`;
          candidato = nome.slice(0, TAMANHO_MAXIMO_NOME - sufixo.length) + sufixo;
        } while (nomes.has(chaveDoNome(candidato)));
        nome = candidato;
        renomeados++;
      }
      nomes.add(chaveDoNome(nome));

      const registro = {
        id: idNovo.get(i.refId), tipo: i.tipo, nome, paiId: paiNovo,
        criadoEm: Number.isFinite(i.criadoEm) ? i.criadoEm : t,
        atualizadoEm: Number.isFinite(i.atualizadoEm) ? i.atualizadoEm : t,
      };
      if (i.resumo) registro.resumo = i.resumo;
      await pedido(s.itens.add(registro));
      if (i.tipo !== 'pasta') await pedido(s.dados.put({ id: registro.id, dados: i.dados ?? null }));
    }
    return { pasta: raiz, criados: itens.length, renomeados };
  });
}

/* ------------------------------------------------------------------ */
/* Estatísticas e persistência                                         */
/* ------------------------------------------------------------------ */

export function estatisticas() {
  return transacao('readonly', async ({ itens }) => {
    const todos = await pedido(itens.getAll());
    const r = { pasta: 0, sprite: 0, cenario: 0, jogo: 0, lixeira: 0 };
    for (const i of todos) {
      if (i.lixeiraLote) r.lixeira++;
      else if (i.tipo in r) r[i.tipo]++;
    }
    return r;
  });
}

const CHAVE_PERSISTENCIA = 'miniengine.persistencia-pedida';

function lembrarDePedirPersistencia() {
  // Pede uma vez, na primeira vez que o usuário salva algo neste aparelho.
  try {
    if (localStorage.getItem(CHAVE_PERSISTENCIA)) return;
    localStorage.setItem(CHAVE_PERSISTENCIA, String(agora()));
  } catch { /* localStorage indisponível: tudo bem */ }
  pedirPersistencia().catch(() => {});
}

/**
 * Pede ao navegador para NÃO apagar os dados do site quando faltar espaço.
 * O navegador pode negar (comum se o site é pouco usado); o backup em ZIP
 * (tela Backup) continua sendo a proteção real.
 */
export async function pedirPersistencia() {
  try {
    if (!navigator.storage?.persist) return { suportado: false, persistente: false };
    if (await navigator.storage.persisted()) return { suportado: true, persistente: true };
    return { suportado: true, persistente: await navigator.storage.persist() };
  } catch {
    return { suportado: false, persistente: false };
  }
}

/** Estado do armazenamento, sem pedir nada ao navegador. */
export async function statusArmazenamento() {
  const status = { suportado: !!navigator.storage?.persisted, persistente: false, usado: null, cota: null };
  try {
    if (navigator.storage?.persisted) status.persistente = await navigator.storage.persisted();
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      status.usado = usage ?? null;
      status.cota = quota ?? null;
    }
  } catch { /* melhor esforço */ }
  return status;
}
