/**
 * modelo.js — O cenário (item tipo `cenario`), sem DOM.
 *
 * dados:
 * {
 *   version: 2, name,
 *   grade: 16,                 // tamanho da célula em pixels (8, 16, 32 ou 64)
 *   colunas: 64, linhas: 36,   // tamanho do cenário em células
 *   fundo: '#1e2233' | null,   // cor de fundo (null = transparente)
 *   objetos: [{ id, spriteId, quadro, x, y, nivel: 1|2|3, solido, espelhar }]
 * }
 * - Cada objeto é uma REFERÊNCIA a um frame salvo (spriteId = id do item do frame; quadro = índice
 *   dentro dele), não uma cópia: editar o sprite no editor muda o cenário.
 * - x, y em pixels (canto de cima à esquerda). Ordem de desenho: nível 1 (fundo), 2 (meio), 3 (frente);
 *   dentro do mesmo nível, a ordem da lista (o último fica por cima).
 */

import * as armazem from '../core/storage.js';
import { RAIZ } from '../core/tipos.js';

export const GRADES = [8, 16, 32, 64];
export const NIVEIS = [
  { nivel: 1, nome: 'Fundo' },
  { nivel: 2, nome: 'Meio' },
  { nivel: 3, nome: 'Frente' },
];
export const LADO_MAX_PX = 4096;
export const CELULAS_MIN = 4;
export const CELULAS_MAX = 256;
export const MAX_OBJETOS = 3000;

export const novoIdObjeto = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const inteiro = (v, min, max, padrao) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.round(Number(v)))) : padrao);

/** Maior número de células que cabe no limite de pixels. */
export const celulasMaximas = (grade) => Math.min(CELULAS_MAX, Math.floor(LADO_MAX_PX / grade));

export function cenarioNovo({ nome, grade = 16, colunas = 64, linhas = 36, fundo = '#1e2233' }) {
  const g = GRADES.includes(grade) ? grade : 16;
  return {
    version: 2,
    name: nome,
    grade: g,
    colunas: inteiro(colunas, CELULAS_MIN, celulasMaximas(g), 64),
    linhas: inteiro(linhas, CELULAS_MIN, celulasMaximas(g), 36),
    fundo,
    objetos: [],
  };
}

/** Aceita dados velhos/estragados (inclusive o formato provisório da Etapa 1) e devolve o formato atual. */
export function normalizar(d, nome = 'Cenário') {
  const base = cenarioNovo({ nome });
  if (!d || typeof d !== 'object') return base;
  const grade = GRADES.includes(d.grade) ? d.grade : 16;
  const max = celulasMaximas(grade);
  const objetos = (Array.isArray(d.objetos) ? d.objetos : [])
    .filter((o) => o && typeof o.spriteId === 'string')
    .slice(0, MAX_OBJETOS)
    .map((o) => ({
      id: typeof o.id === 'string' ? o.id : novoIdObjeto(),
      spriteId: o.spriteId,
      quadro: inteiro(o.quadro, 0, 9999, 0),
      x: inteiro(o.x, -LADO_MAX_PX, LADO_MAX_PX * 2, 0),
      y: inteiro(o.y, -LADO_MAX_PX, LADO_MAX_PX * 2, 0),
      nivel: [1, 2, 3].includes(o.nivel) ? o.nivel : 2,
      solido: !!o.solido,
      espelhar: !!o.espelhar,
    }));
  return {
    version: 2,
    name: nome,
    grade,
    colunas: inteiro(d.colunas, CELULAS_MIN, max, base.colunas),
    linhas: inteiro(d.linhas, CELULAS_MIN, max, base.linhas),
    fundo: typeof d.fundo === 'string' && /^#[0-9a-f]{6}$/i.test(d.fundo) ? d.fundo.toLowerCase() : (d.fundo === null ? null : base.fundo),
    objetos,
  };
}

export const larguraPx = (c) => c.colunas * c.grade;
export const alturaPx = (c) => c.linhas * c.grade;

/** Objetos na ordem em que são desenhados (fundo → frente). */
export function ordemDeDesenho(c) {
  return c.objetos.map((o, i) => ({ o, i })).sort((a, b) => a.o.nivel - b.o.nivel || a.i - b.i).map((x) => x.o);
}

/** Encaixa uma coordenada na grade. */
export const encaixar = (v, grade) => Math.round(v / grade) * grade;

/** Leva o objeto para cima (+1) ou para baixo (-1) dentro do MESMO nível. Devolve true se mudou. */
export function mudarOrdem(c, id, direcao) {
  const i = c.objetos.findIndex((o) => o.id === id);
  if (i < 0) return false;
  const nivel = c.objetos[i].nivel;
  const mesmos = c.objetos.map((o, k) => ({ o, k })).filter((x) => x.o.nivel === nivel);
  const pos = mesmos.findIndex((x) => x.k === i);
  const alvo = mesmos[pos + direcao];
  if (!alvo) return false;
  const [obj] = c.objetos.splice(i, 1);
  const destino = c.objetos.indexOf(alvo.o);
  c.objetos.splice(direcao > 0 ? destino + 1 : destino, 0, obj);
  return true;
}

/** Leva para o topo (ou o fundo) do seu nível. */
export function extremoDaOrdem(c, id, paraFrente) {
  let mudou = false;
  while (mudarOrdem(c, id, paraFrente ? 1 : -1)) mudou = true;
  return mudou;
}

/** Muda o nível de um objeto (ele fica por cima dos que já estão no novo nível). */
export function mudarNivel(c, id, nivel) {
  const i = c.objetos.findIndex((o) => o.id === id);
  if (i < 0 || ![1, 2, 3].includes(nivel)) return false;
  const [o] = c.objetos.splice(i, 1);
  o.nivel = nivel;
  c.objetos.push(o);
  return true;
}

/** Muda o tamanho do cenário (em células). Objetos fora continuam na lista (podem voltar a aparecer). */
export function redimensionar(c, { colunas, linhas, grade }) {
  if (grade !== undefined && GRADES.includes(grade) && grade !== c.grade) {
    const fator = grade / c.grade;
    for (const o of c.objetos) { o.x = Math.round(o.x * fator); o.y = Math.round(o.y * fator); }
    c.grade = grade;
  }
  const max = celulasMaximas(c.grade);
  if (colunas !== undefined) c.colunas = inteiro(colunas, CELULAS_MIN, max, c.colunas);
  if (linhas !== undefined) c.linhas = inteiro(linhas, CELULAS_MIN, max, c.linhas);
  c.colunas = Math.min(c.colunas, max);
  c.linhas = Math.min(c.linhas, max);
}

/* ---------- armazenamento ---------- */

export const listarCenarios = () => armazem.listarPorTipo('cenario');

export async function criarCenario({ nome, grade, colunas, linhas, pastaId = RAIZ }) {
  const limpo = armazem.validarNome(nome);
  const dados = cenarioNovo({ nome: limpo, grade, colunas, linhas });
  return armazem.criarItem({ tipo: 'cenario', nome: limpo, paiId: pastaId, dados, resumo: resumoDoCenario(dados) });
}

export async function abrirCenario(id) {
  const item = await armazem.obterComDados(id);
  if (!item || item.lixeiraLote || item.tipo !== 'cenario') return null;
  return { item, cenario: normalizar(item.dados, item.nome) };
}

export function resumoDoCenario(c) {
  const n = c.objetos.length;
  return { descricao: `${c.colunas}×${c.linhas} células de ${c.grade}px · ${n} objeto${n === 1 ? '' : 's'}` };
}

export const salvarCenario = (id, c) => armazem.salvarDados(id, c, { resumo: resumoDoCenario(c) });
