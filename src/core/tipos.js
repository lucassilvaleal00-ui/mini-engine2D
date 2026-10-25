/**
 * tipos.js — Constantes compartilhadas sobre os tipos de item do Mini Engine.
 *
 * O gerenciador guarda itens de tipos diferentes na mesma árvore de pastas:
 *   - pasta   : só organiza (não tem dados)
 *   - sprite  : pixel art (editor, etapa 2)
 *   - cenario : cenário montado com sprites (etapa 4)
 *   - jogo    : projeto de jogo (etapa 6)
 */

/** Id especial usado como "pasta-mãe" dos itens que ficam na raiz.
 *  (O IndexedDB não aceita null como chave de índice, por isso uma string.) */
export const RAIZ = 'raiz';

export const TIPOS = {
  pasta:   { rotulo: 'Pasta',   icone: '📁', rota: '/gerenciador' },
  sprite:  { rotulo: 'Sprite',  icone: '🎨', rota: '/editor' },
  cenario: { rotulo: 'Cenário', icone: '🗺️', rota: '/cenario' },
  jogo:    { rotulo: 'Jogo',    icone: '🎮', rota: '/jogo' },
};

/** Rota (hash) que abre o item na tela certa. */
export function rotaDoItem(item) {
  return `${TIPOS[item.tipo].rota}/${item.id}`;
}
