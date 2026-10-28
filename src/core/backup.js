/**
 * backup.js — Backup e restauração do projeto inteiro em um arquivo ZIP.
 *
 * O QUE ENTRA: pastas, sprites, cenários e jogos (tudo que está "vivo").
 * O QUE NÃO ENTRA: a lixeira, o rascunho do editor e — principalmente — as CHAVES DE API das IAs.
 * (As chaves ficam só no localStorage deste aparelho; este módulo nem lê o localStorage.)
 *
 * FORMATO DO ZIP
 *   LEIA-ME.txt        explicação para humanos
 *   backup.json        o "manifesto": é ELE que manda na restauração (nomes, pastas, ids, tipos)
 *   Pasta/Sub/x.sprite.json   uma cópia legível de cada item, na mesma organização das pastas
 *
 * RESTAURAR nunca apaga nem substitui nada: cria uma pasta nova ("Restaurado em …") na raiz
 * com tudo dentro, com ids novos.
 *
 * Sem DOM: roda também no Node (testes).
 */

import { criarZip, lerZip, lerTexto, caminhoSeguro, ErroDeZip } from './zip.js';
import { RAIZ, TIPOS } from './tipos.js';
import * as armazem from './storage.js';
import { gravarMeta, lerMeta } from './db.js';

export class ErroDeBackup extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeBackup';
  }
}

export const FORMATO_BACKUP = 1;
const EXTENSAO = { sprite: '.sprite.json', cenario: '.cenario.json', jogo: '.jogo.json' };
const LIMITE_MANIFESTO = 20_000_000;
const MAX_ITENS = 20_000;
const MAX_PROFUNDIDADE = 40;
const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const chave = (t) => t.normalize('NFC').toLocaleLowerCase('pt-BR');

/* ------------------------------------------------------------------ */
/* Caminhos dentro do ZIP                                              */
/* ------------------------------------------------------------------ */

/** Um nome que funciona como nome de arquivo em qualquer sistema. */
export function componenteSeguro(nome) {
  let n = String(nome ?? '').normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80);
  if (RESERVADOS.test(n)) n = `_${n}`;
  return n || 'sem nome';
}

/** Caminho de cada item no ZIP (Map id -> caminho), sem repetir nomes na mesma pasta. */
export function montarCaminhos(itens) {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const filhos = new Map();
  for (const i of itens) {
    // item cuja pasta-mãe não está no backup vai para a raiz do ZIP
    const pai = i.paiId !== RAIZ && porId.get(i.paiId)?.tipo === 'pasta' ? i.paiId : RAIZ;
    if (!filhos.has(pai)) filhos.set(pai, []);
    filhos.get(pai).push(i);
  }
  const caminhos = new Map();
  const visitar = (paiId, prefixo, nivel) => {
    if (nivel > MAX_PROFUNDIDADE * 2) return;
    const usados = new Set();
    for (const i of (filhos.get(paiId) ?? []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
      const ext = EXTENSAO[i.tipo] ?? '.json';
      const base = componenteSeguro(i.nome);
      const extra = i.tipo === 'pasta' ? '' : ext;
      let nome = `${base}${extra}`;
      for (let n = 2; usados.has(chave(nome)); n++) nome = `${base} (${n})${extra}`;
      usados.add(chave(nome));
      const caminho = `${prefixo}${nome}`;
      caminhos.set(i.id, caminho);
      if (i.tipo === 'pasta') visitar(i.id, `${caminho}/`, nivel + 1);
    }
  };
  visitar(RAIZ, '', 0);
  return caminhos;
}

/* ------------------------------------------------------------------ */
/* Criar o backup                                                      */
/* ------------------------------------------------------------------ */

const dois = (n) => String(n).padStart(2, '0');
const carimbo = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}-${dois(d.getHours())}h${dois(d.getMinutes())}`;

const contar = (itens) => {
  const c = { pasta: 0, sprite: 0, cenario: 0, jogo: 0 };
  for (const i of itens) if (i.tipo in c) c[i.tipo]++;
  return { ...c, total: c.sprite + c.cenario + c.jogo };
};

function textoLeiaMe(contagem, em) {
  return [
    'BACKUP DO MINI ENGINE',
    '=====================',
    '',
    `Feito em: ${em.toLocaleString('pt-BR')}`,
    `Conteúdo: ${contagem.pasta} pasta(s), ${contagem.sprite} sprite(s), ${contagem.cenario} cenário(s), ${contagem.jogo} jogo(s).`,
    '',
    'COMO RESTAURAR',
    '  No Mini Engine, abra a tela "Backup" e escolha "Restaurar de um backup".',
    '  Selecione este arquivo ZIP (sem descompactar). O app cria uma pasta nova,',
    '  chamada "Restaurado em …", com tudo dentro. Nada do que você já tem é apagado.',
    '',
    'O QUE TEM AQUI',
    '  backup.json   o índice do backup. É ele que o app lê. Não edite.',
    '  (pastas)      uma cópia de cada sprite/cenário/jogo, na mesma organização de pastas.',
    '                Esses arquivos .json também podem ser importados um a um no editor.',
    '',
    'O QUE NÃO ESTÁ AQUI',
    '  - A lixeira.',
    '  - As chaves de API das IAs. Elas ficam só no aparelho e nunca entram em backups.',
    '    Depois de restaurar em outro aparelho, cole as chaves de novo.',
    '',
  ].join('\n');
}

/**
 * Monta o ZIP a partir do que o armazenamento devolveu (ver storage.lerTudoParaBackup).
 * @returns { bytes, nome, contagem }
 */
export async function criarBackup({ itens, dados }, { em = new Date() } = {}) {
  const caminhos = montarCaminhos(itens);
  const contagem = contar(itens);
  const manifestoItens = [];
  const arquivos = [];

  for (const i of itens) {
    const caminho = caminhos.get(i.id);
    if (!caminho) continue; // profundidade absurda: ignora
    const ehPasta = i.tipo === 'pasta';
    const data = Number.isFinite(i.atualizadoEm) ? new Date(i.atualizadoEm) : em;
    manifestoItens.push({
      id: i.id, tipo: i.tipo, nome: i.nome, paiId: i.paiId,
      arquivo: ehPasta ? `${caminho}/` : caminho,
      criadoEm: i.criadoEm, atualizadoEm: i.atualizadoEm,
      ...(i.resumo ? { resumo: i.resumo } : {}),
    });
    if (ehPasta) arquivos.push({ caminho: `${caminho}/`, dados: new Uint8Array(0), data });
    else arquivos.push({ caminho, dados: JSON.stringify(dados.get(i.id) ?? null, null, 1), data });
  }

  const manifesto = { app: 'mini-engine', formato: FORMATO_BACKUP, criadoEm: em.toISOString(), contagem, itens: manifestoItens };
  const todos = [
    { caminho: 'LEIA-ME.txt', dados: textoLeiaMe(contagem, em), data: em },
    { caminho: 'backup.json', dados: JSON.stringify(manifesto, null, 1), data: em },
    ...arquivos,
  ];
  return { bytes: await criarZip(todos), nome: `mini-engine-backup-${carimbo(em)}.zip`, contagem };
}

/** Lê o armazenamento e monta o backup. Chame `registrarBackupFeito` depois que o arquivo foi entregue. */
export async function fazerBackup() {
  return criarBackup(await armazem.lerTudoParaBackup());
}

export const registrarBackupFeito = (contagem) => gravarMeta('ultimoBackup', { em: Date.now(), itens: contagem.total });

/* ------------------------------------------------------------------ */
/* Ler e conferir um backup                                            */
/* ------------------------------------------------------------------ */

function resumoValido(r) {
  if (!ehObjeto(r)) return undefined;
  const limpo = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === '__proto__') continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) limpo[k] = typeof v === 'string' ? v.slice(0, 200) : v;
  }
  return JSON.stringify(limpo).length <= 2000 ? limpo : undefined;
}

/**
 * Confere o ZIP inteiro e devolve o que seria restaurado, SEM gravar nada.
 * Problemas pequenos (um arquivo estragado, uma pasta sumida) viram `avisos`; o resto segue.
 * Problemas grandes (não é um backup, versão nova demais) lançam ErroDeBackup / ErroDeZip.
 * @returns { itens, contagem, avisos, criadoEm }
 */
export async function lerBackup(bytes) {
  const entradas = lerZip(bytes);
  const porCaminho = new Map(entradas.map((e) => [e.caminho, e]));
  const entradaManifesto = porCaminho.get('backup.json');
  if (!entradaManifesto) {
    throw new ErroDeBackup('Este ZIP não é um backup do Mini Engine (não achei o arquivo backup.json). Só dá para restaurar backups feitos pelo próprio app.');
  }
  if (entradaManifesto.tamanho > LIMITE_MANIFESTO) throw new ErroDeBackup('O índice deste backup é grande demais para abrir aqui.');
  let manifesto;
  try {
    manifesto = JSON.parse(await lerTexto(entradaManifesto));
  } catch (erro) {
    if (erro instanceof ErroDeZip) throw erro;
    throw new ErroDeBackup('O arquivo backup.json está estragado (não é um JSON válido). Este backup não pode ser restaurado.');
  }
  if (!ehObjeto(manifesto) || manifesto.app !== 'mini-engine' || !Array.isArray(manifesto.itens)) {
    throw new ErroDeBackup('O backup.json deste ZIP não tem o formato do Mini Engine.');
  }
  if (!Number.isInteger(manifesto.formato) || manifesto.formato < 1) throw new ErroDeBackup('Não reconheci a versão do formato deste backup.');
  if (manifesto.formato > FORMATO_BACKUP) {
    throw new ErroDeBackup(`Este backup foi feito por uma versão mais nova do app (formato ${manifesto.formato}). Atualize o app (recarregue a página) e tente de novo.`);
  }
  if (manifesto.itens.length > MAX_ITENS) throw new ErroDeBackup(`Este backup tem itens demais (${manifesto.itens.length}; o limite é ${MAX_ITENS}).`);

  const avisos = [];
  const itens = [];
  const vistos = new Set();
  for (const bruto of manifesto.itens) {
    if (!ehObjeto(bruto) || typeof bruto.id !== 'string' || !bruto.id || bruto.id.length > 100 || typeof bruto.nome !== 'string' || !TIPOS[bruto.tipo]) {
      avisos.push('Um item do índice estava num formato inválido e foi ignorado.');
      continue;
    }
    if (vistos.has(bruto.id)) { avisos.push(`“${bruto.nome}” aparece duas vezes no índice; usei só a primeira.`); continue; }
    vistos.add(bruto.id);
    const item = {
      refId: bruto.id,
      refPaiId: typeof bruto.paiId === 'string' && bruto.paiId !== RAIZ ? bruto.paiId : null,
      tipo: bruto.tipo,
      nome: bruto.nome,
      criadoEm: Number.isFinite(bruto.criadoEm) ? bruto.criadoEm : undefined,
      atualizadoEm: Number.isFinite(bruto.atualizadoEm) ? bruto.atualizadoEm : undefined,
      resumo: resumoValido(bruto.resumo),
      dados: null,
    };
    if (bruto.tipo !== 'pasta') {
      let entrada;
      try {
        entrada = typeof bruto.arquivo === 'string' ? porCaminho.get(caminhoSeguro(bruto.arquivo)) : undefined;
      } catch { entrada = undefined; }
      if (!entrada || entrada.ehPasta) { avisos.push(`“${bruto.nome}”: o arquivo dele não está no ZIP; ficou de fora.`); continue; }
      try {
        const dados = JSON.parse(await lerTexto(entrada));
        if (dados !== null && !ehObjeto(dados)) throw new Error('formato');
        item.dados = dados;
      } catch (erro) {
        avisos.push(erro instanceof ErroDeZip ? `“${bruto.nome}”: ${erro.message}` : `“${bruto.nome}”: o arquivo está estragado; ficou de fora.`);
        continue;
      }
    }
    itens.push(item);
  }

  // pastas-mãe que sumiram, ciclos e aninhamento absurdo: esses itens vão para a raiz da pasta restaurada
  const porId = new Map(itens.map((i) => [i.refId, i]));
  let soltos = 0;
  for (const i of itens) {
    if (i.refPaiId === null) continue;
    const pai = porId.get(i.refPaiId);
    if (!pai || pai.tipo !== 'pasta') { i.refPaiId = null; soltos++; continue; }
    const caminho = new Set([i.refId]);
    let cursor = pai;
    let profundidade = 1;
    let quebrado = false;
    while (cursor) {
      if (caminho.has(cursor.refId) || profundidade > MAX_PROFUNDIDADE) { quebrado = true; break; }
      caminho.add(cursor.refId);
      cursor = cursor.refPaiId === null ? null : porId.get(cursor.refPaiId);
      profundidade++;
    }
    if (quebrado) { i.refPaiId = null; soltos++; }
  }
  if (soltos) avisos.push(`${soltos} ${soltos === 1 ? 'item estava' : 'itens estavam'} numa pasta que não existe mais (ou numa organização inválida); ${soltos === 1 ? 'foi colocado' : 'foram colocados'} na raiz da pasta restaurada.`);

  return { itens, contagem: contar(itens), avisos, criadoEm: typeof manifesto.criadoEm === 'string' ? manifesto.criadoEm : null };
}

/** Nome da pasta criada ao restaurar. (Os nomes não podem ter / : . — por isso as datas usam traços.) */
export function nomeDaPastaRestaurada(d = new Date()) {
  return `Restaurado em ${dois(d.getDate())}-${dois(d.getMonth() + 1)}-${d.getFullYear()} ${dois(d.getHours())}h${dois(d.getMinutes())}`;
}

/** Grava o que `lerBackup` devolveu, numa pasta nova. */
export async function restaurarBackup(plano, { agora = new Date() } = {}) {
  if (!plano.itens.length) throw new ErroDeBackup('Este backup está vazio: não há nada para restaurar.');
  const r = await armazem.importarArvore({ nomePasta: nomeDaPastaRestaurada(agora), itens: plano.itens });
  return { pasta: r.pasta, criados: r.criados, renomeados: r.renomeados };
}

/* ------------------------------------------------------------------ */
/* Lembrete                                                            */
/* ------------------------------------------------------------------ */

const DIA = 86_400_000;
export const DIAS_PARA_LEMBRAR = 7;

/** { ultimo: { em, itens } | null, total, alterados } */
export async function situacaoDoBackup() {
  const ultimo = await lerMeta('ultimoBackup', null);
  const { total, alterados } = await armazem.contarAlteracoes(ultimo?.em ?? 0);
  return { ultimo, total, alterados };
}

/** Texto do lembrete da tela inicial, ou null se não há motivo para lembrar. */
export function mensagemDeLembrete({ ultimo, total, alterados }, agora = Date.now(), adiadoAte = 0) {
  if (total === 0 || agora < adiadoAte) return null;
  if (!ultimo) return `Você já tem ${total} ${total === 1 ? 'item salvo' : 'itens salvos'}, mas ainda não fez backup. Seus desenhos só existem neste navegador.`;
  const dias = Math.floor((agora - ultimo.em) / DIA);
  if (alterados > 0 && dias >= DIAS_PARA_LEMBRAR) {
    return `Faz ${dias} dias do último backup e ${alterados} ${alterados === 1 ? 'item mudou' : 'itens mudaram'} desde então.`;
  }
  return null;
}

export const adiarLembrete = (dias = 3) => gravarMeta('lembreteAdiadoAte', Date.now() + dias * DIA);
export const lerAdiamento = () => lerMeta('lembreteAdiadoAte', 0);
