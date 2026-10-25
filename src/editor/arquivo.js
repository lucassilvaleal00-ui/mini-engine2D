/**
 * arquivo.js — Salvar e abrir desenhos nas pastas do gerenciador.
 *
 * REGRA: cada frame vira UM item de sprite, com o número no fim do nome:
 *   cavalo_01, cavalo_02, cavalo_03…
 * A "cadeia" de arquivos com a mesma base é um desenho só: ao abrir qualquer um deles,
 * o editor carrega todos como frames. (O painel de ações da etapa 2b vai montar
 * esses nomes como personagem_acao_direcao_NN.)
 *
 * Sem DOM: roda também em testes no Node.
 */

import * as armazem from '../core/storage.js';
import { RAIZ } from '../core/tipos.js';
import { gravarMeta, lerMeta } from '../core/db.js';
import { quadroParaSprite, spritesParaEstado, ErroDoEditor } from './documento.js';

const SUFIXO = /^(.*)_(\d{2,})$/;
const chave = (nome) => nome.normalize('NFC').toLocaleLowerCase('pt-BR');

/** 'cavalo', frame 0 de 12 -> 'cavalo_01'. Com 100+ frames usa 3 dígitos. */
export function nomeDoQuadro(base, indice, total) {
  const digitos = Math.max(2, String(total).length);
  return `${base}_${String(indice + 1).padStart(digitos, '0')}`;
}

/** 'cavalo_03' -> { base: 'cavalo', numero: 3 };  'cavalo' -> { base: 'cavalo', numero: null } */
export function separarNome(nome) {
  const m = SUFIXO.exec(nome);
  return m ? { base: m[1], numero: parseInt(m[2], 10) } : { base: nome, numero: null };
}

/**
 * Junta os sprites de uma lista de itens em "desenhos".
 * Itens com sufixo numérico e a mesma base formam um desenho (ordenado pelo número).
 * Itens sem sufixo são um desenho de um arquivo só.
 */
export function agruparSprites(itens) {
  const mapa = new Map();
  for (const item of itens) {
    if (item.tipo !== 'sprite') continue;
    const { base, numero } = separarNome(item.nome);
    const id = `${chave(base)}|${numero === null ? 'plano' : 'seq'}`;
    if (!mapa.has(id)) mapa.set(id, { chave: id, base, semSufixo: numero === null, itens: [] });
    mapa.get(id).itens.push({ item, numero });
  }
  return [...mapa.values()].map((g) => {
    g.itens.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
    const lista = g.itens.map((x) => x.item);
    return {
      chave: g.chave,
      base: g.base,
      semSufixo: g.semSufixo,
      itens: lista,
      quadros: lista.length,
      largura: lista[0].resumo?.largura ?? null,
      altura: lista[0].resumo?.altura ?? null,
      atualizadoEm: Math.max(...lista.map((i) => i.atualizadoEm)),
    };
  }).sort((a, b) => a.base.localeCompare(b.base, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

/** Conteúdo de uma pasta para o seletor "Abrir": subpastas + desenhos. */
export async function listarPasta(pastaId) {
  const filhos = await armazem.listarFilhos(pastaId);
  return { pastas: filhos.filter((i) => i.tipo === 'pasta'), desenhos: agruparSprites(filhos) };
}

/* ------------------------------------------------------------------ */
/* Abrir                                                               */
/* ------------------------------------------------------------------ */

/** Carrega um desenho (grupo de itens) como estado do editor. */
export async function abrirDesenho(grupo) {
  const completos = await Promise.all(grupo.itens.map((i) => armazem.obterComDados(i.id)));
  const sprites = completos.map((c, i) => {
    if (!c || !c.dados) throw new ErroDoEditor(`“${grupo.itens[i].nome}” está vazio ou foi apagado.`);
    return { ...c.dados, name: c.nome };
  });
  const { estado, ignorados } = spritesParaEstado(sprites);
  estado.nome = grupo.base;
  return {
    estado,
    ignorados,
    origem: { pastaId: grupo.itens[0].paiId, base: grupo.base, ids: grupo.itens.map((i) => i.id), semSufixo: grupo.semSufixo },
  };
}

/** Abre pelo id de um item (qualquer frame da cadeia serve). */
export async function abrirPorItem(id) {
  const item = await armazem.obter(id);
  if (!item || item.lixeiraLote || item.tipo !== 'sprite') {
    throw new ErroDoEditor('Esse desenho não existe mais (ou está na lixeira).');
  }
  const { desenhos } = await listarPasta(item.paiId);
  const grupo = desenhos.find((g) => g.itens.some((i) => i.id === id));
  return abrirDesenho(grupo);
}

/* ------------------------------------------------------------------ */
/* Salvar                                                              */
/* ------------------------------------------------------------------ */

/**
 * Descobre o que acontecerá ao salvar `estado` como `base` em `pastaId`, sem gravar nada.
 * -> { nomes, conflitos, extras, precisaConfirmar }
 *   conflitos: arquivos de OUTRO desenho que seriam substituídos
 *   extras:    frames antigos da mesma cadeia que sobrariam (vão para a lixeira)
 */
export async function analisarSalvamento({ estado, base, pastaId, origem }) {
  const limpa = armazem.validarNome(base);
  const total = estado.quadros.length;
  const nomes = estado.quadros.map((_, i) => nomeDoQuadro(limpa, i, total));
  for (const n of nomes) armazem.validarNome(n); // acusa nome comprido demais antes de gravar

  const proprios = new Set(origem && origem.pastaId === pastaId && chave(origem.base) === chave(limpa) ? origem.ids : []);
  const irmaos = await armazem.listarFilhos(pastaId);
  const novos = new Set(nomes.map(chave));

  const porNome = new Map(irmaos.filter((i) => i.tipo !== 'pasta').map((i) => [chave(i.nome), i]));
  const existentes = nomes.map((n) => porNome.get(chave(n))).filter(Boolean);
  const conflitos = existentes.filter((i) => !proprios.has(i.id));

  const extras = irmaos.filter((i) => {
    if (i.tipo !== 'sprite') return false;
    const s = separarNome(i.nome);
    return s.numero !== null && chave(s.base) === chave(limpa) && !novos.has(chave(i.nome));
  });

  // desenho que era um arquivo sem número: vira o frame 01
  const planoId = origem?.semSufixo && proprios.size ? origem.ids[0] : null;

  return {
    base: limpa,
    nomes,
    conflitos,
    extras,
    planoId: planoId && irmaos.some((i) => i.id === planoId) ? planoId : null,
    porNome,
    precisaConfirmar: conflitos.length > 0 || extras.some((i) => !proprios.has(i.id)),
    proprios,
  };
}

/**
 * Salva o desenho: um item por frame. Se houver arquivos de outro desenho com os mesmos
 * nomes (ou frames antigos sobrando), devolve { precisaConfirmar: true, analise } sem gravar;
 * chame de novo com `confirmado: true` para substituir.
 */
export async function salvarDesenho({ estado, base, pastaId, origem, confirmado = false }) {
  const analise = await analisarSalvamento({ estado, base, pastaId, origem });
  if (analise.precisaConfirmar && !confirmado) return { precisaConfirmar: true, analise };

  const total = estado.quadros.length;
  const itens = [];
  for (let i = 0; i < total; i++) {
    const nome = analise.nomes[i];
    const sprite = quadroParaSprite(estado, i, nome);
    const resumo = {
      descricao: `${estado.largura}×${estado.altura} · frame ${i + 1} de ${total}`,
      largura: estado.largura,
      altura: estado.altura,
    };
    const existente = analise.porNome.get(chave(nome));
    if (existente) {
      await armazem.salvarDados(existente.id, sprite, { resumo });
      itens.push({ id: existente.id, nome });
    } else if (i === 0 && analise.planoId) {
      await armazem.salvarDados(analise.planoId, sprite, { resumo, nome });
      itens.push({ id: analise.planoId, nome });
    } else {
      const criado = await armazem.criarItem({ tipo: 'sprite', nome, paiId: pastaId, dados: sprite, resumo });
      itens.push({ id: criado.id, nome });
    }
  }
  for (const extra of analise.extras) await armazem.enviarParaLixeira(extra.id);

  await gravarMeta('editor.ultimaPasta', pastaId).catch(() => {});
  return {
    precisaConfirmar: false,
    itens,
    paraLixeira: analise.extras.length,
    origem: { pastaId, base: analise.base, ids: itens.map((x) => x.id), semSufixo: false },
  };
}

/* ------------------------------------------------------------------ */
/* Rascunho (protege contra fechar/sair sem salvar)                    */
/* ------------------------------------------------------------------ */

const CHAVE_RASCUNHO = 'editor.rascunho';

export const guardarRascunho = (estado, origem) => gravarMeta(CHAVE_RASCUNHO, { versao: 1, em: Date.now(), estado, origem });
export const lerRascunho = () => lerMeta(CHAVE_RASCUNHO, null);
export const apagarRascunho = () => gravarMeta(CHAVE_RASCUNHO, null);
export const ultimaPasta = async () => {
  const id = await lerMeta('editor.ultimaPasta', RAIZ).catch(() => RAIZ);
  if (id === RAIZ) return RAIZ;
  return (await armazem.caminho(id)) === null ? RAIZ : id; // a pasta pode ter sido apagada
};
