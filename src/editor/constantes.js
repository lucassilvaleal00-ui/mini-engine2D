/** constantes.js — Valores compartilhados pelos módulos do editor. */

/** Símbolos usados no JSON do sprite: o caractere N representa o índice N da paleta (até 36). */
export const ALFABETO_INDICES = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 'cavalo', frame 0 de 12 -> 'cavalo_01'. Com 100+ frames usa 3 dígitos. */
export function nomeDoQuadro(base, indice, total) {
  const digitos = Math.max(2, String(total).length);
  return `${base}_${String(indice + 1).padStart(digitos, '0')}`;
}
