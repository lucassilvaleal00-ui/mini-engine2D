/**
 * barra-ferramentas.js — Rodapé do editor: opções da ferramenta atual + fileira de ferramentas.
 */

import { h, preencher } from '../ui/dom.js';
import { icone } from './icones.js';
import { TAMANHO_PINCEL_MAX } from './ferramentas.js';

const SIMETRIAS = [
  ['nenhuma', 'Nenhum', 'Sem espelho'],
  ['h', '↔', 'Espelhar esquerda ↔ direita'],
  ['v', '↕', 'Espelhar cima ↕ baixo'],
  ['hv', '✛', 'Espelhar nos dois sentidos'],
];

/**
 * @param ferramentas lista de ferramentas
 * @param op          opções compartilhadas { tamanho, simetria, preencher, global }
 * @param estado      { atual(): ferramenta, escolher(id) }
 * @param extras      { contexto(), alternadores: [{ rotulo, icone, ativo(), alternar() }] }
 */
export function criarBarraFerramentas(ferramentas, op, estado, extras) {
  const linhaOpcoes = h('div', { class: 'barra-opcoes' });
  const linhaFerr = h('div', { class: 'barra-ferramentas', role: 'toolbar', 'aria-label': 'Ferramentas' });
  const el = h('div', { class: 'barra' }, linhaOpcoes, linhaFerr);

  const grupo = (rotulo, ...filhos) => h('div', { class: 'opcao-grupo' }, h('span', { class: 'opcao-rotulo' }, rotulo), ...filhos);
  const segmento = (rotulo, titulo, ativo, ao) => h('button', {
    class: 'segmento', type: 'button', 'aria-pressed': String(ativo), title: titulo, 'aria-label': titulo, onclick: ao,
  }, rotulo);

  function desenharOpcoes() {
    const ferr = estado.atual();
    const itens = [];
    const tem = (nome) => ferr.opcoes?.includes(nome);

    if (tem('tamanho')) {
      const mudar = (n) => { op.tamanho = Math.max(1, Math.min(TAMANHO_PINCEL_MAX, n)); desenharOpcoes(); extras.aoMudarTamanho?.(); };
      itens.push(grupo('Tamanho',
        ...[1, 2, 3, 4].map((n) => segmento(String(n), `Pincel ${n}×${n}`, op.tamanho === n, () => mudar(n))),
        h('button', { class: 'segmento', type: 'button', title: 'Menor (Ctrl −)', 'aria-label': 'Diminuir o tamanho', disabled: op.tamanho <= 1, onclick: () => mudar(op.tamanho - 1) }, '−'),
        h('span', { class: 'tamanho-atual', 'aria-live': 'polite', title: 'Tamanho atual' }, `${op.tamanho}×${op.tamanho}`),
        h('button', { class: 'segmento', type: 'button', title: 'Maior (Ctrl +)', 'aria-label': 'Aumentar o tamanho', disabled: op.tamanho >= TAMANHO_PINCEL_MAX, onclick: () => mudar(op.tamanho + 1) }, '+')));
    }
    if (tem('simetria')) {
      itens.push(grupo('Espelho', ...SIMETRIAS.map(([id, rot, tit]) => segmento(rot, tit, op.simetria === id, () => { op.simetria = id; desenharOpcoes(); }))));
    }
    if (tem('preencher')) {
      itens.push(segmento('Preenchido', 'Preencher a forma', op.preencher, () => { op.preencher = !op.preencher; desenharOpcoes(); }));
    }
    if (tem('global')) {
      itens.push(segmento('Todas da mesma cor', 'Trocar todos os pixels com a mesma cor', op.global, () => { op.global = !op.global; desenharOpcoes(); }));
    }
    if (ferr.acoes) {
      for (const a of ferr.acoes(extras.contexto())) {
        itens.push(h('button', { class: 'botao pequeno', type: 'button', disabled: !!a.desabilitado, onclick: a.ao }, a.rotulo));
      }
    }
    itens.push(h('span', { class: 'espaco' }));
    for (const alt of extras.alternadores) {
      itens.push(h('button', {
        class: 'segmento com-icone', type: 'button', 'aria-pressed': String(alt.ativo()),
        onclick: () => { alt.alternar(); desenharOpcoes(); },
      }, icone(alt.icone, 16), alt.rotulo));
    }
    preencher(linhaOpcoes, itens);
  }

  function desenharFerramentas() {
    const atual = estado.atual();
    preencher(linhaFerr, ferramentas.map((f) => h('button', {
      class: 'ferramenta', type: 'button', 'aria-pressed': String(f === atual),
      title: `${f.nome} (${f.atalho.toUpperCase()})`, 'aria-label': f.nome,
      onclick: () => estado.escolher(f.id),
    }, icone(f.icone, 24), h('span', { class: 'ferramenta-nome' }, f.nome))));
  }

  function atualizar() { desenharFerramentas(); desenharOpcoes(); }
  atualizar();
  return { el, atualizar, atualizarOpcoes: desenharOpcoes };
}
