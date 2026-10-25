/**
 * lixeira.js — Itens e pastas excluídos. Dá para restaurar ou apagar de vez.
 *
 * Rota: #/lixeira
 */

import { h } from '../ui/dom.js';
import { aviso, avisarErro } from '../ui/toast.js';
import { confirmar } from '../ui/dialogos.js';
import { formatarDataHora, pluralizar } from '../ui/formato.js';
import { RAIZ, TIPOS } from '../core/tipos.js';
import * as armazem from '../core/storage.js';

export async function montar(el, { navegar, voltar }) {
  document.title = 'Lixeira · Mini Engine';

  const lista = h('ul', { class: 'lista' });
  const vazio = h('div', { class: 'vazio', hidden: true }, 'A lixeira está vazia.');
  const botaoEsvaziar = h('button', { class: 'botao perigo', type: 'button', onclick: () => esvaziar() }, 'Esvaziar');

  el.append(
    h('header', { class: 'topo' },
      h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/gerenciador') }, '←'),
      h('h1', {}, 'Lixeira'),
      botaoEsvaziar),
    h('p', { class: 'dica' }, 'O que está aqui pode ser restaurado. “Excluir para sempre” não tem volta.'),
    lista,
    vazio);

  async function tentar(fn) {
    try {
      await fn();
    } catch (erro) {
      avisarErro(erro);
    }
  }

  async function desenhar() {
    const lotes = await armazem.listarLixeira();
    lista.replaceChildren(...lotes.map(criarLinha));
    vazio.hidden = lotes.length > 0;
    botaoEsvaziar.hidden = lotes.length === 0;
  }

  function criarLinha(lote) {
    const { item } = lote;
    const tipo = TIPOS[item.tipo];
    const partes = [
      tipo.rotulo,
      lote.quantidade > 1 ? `com ${pluralizar(lote.quantidade - 1, 'item', 'itens')} dentro` : null,
      `excluído em ${formatarDataHora(lote.em)}`,
      lote.origem ? `de: ${lote.origem}` : 'de: pasta que não existe mais',
    ].filter(Boolean);

    return h('li', { class: 'linha coluna' },
      h('div', { class: 'linha-info' },
        h('span', { class: 'linha-icone', 'aria-hidden': 'true' }, tipo.icone),
        h('span', { class: 'linha-textos' },
          h('span', { class: 'linha-nome' }, item.nome),
          h('span', { class: 'linha-meta' }, partes.join(' · ')))),
      h('div', { class: 'linha-acoes' },
        h('button', { class: 'botao primario', type: 'button', onclick: () => tentar(() => restaurar(lote)) }, 'Restaurar'),
        h('button', { class: 'botao perigo', type: 'button', onclick: () => tentar(() => excluirParaSempre(lote)) }, 'Excluir para sempre')));
  }

  async function restaurar(lote) {
    const r = await armazem.restaurar(lote.lote);
    await desenhar();
    const onde = r.paraRaiz
      ? 'na Raiz (a pasta original não existe mais)'
      : `em ${r.destinoTexto}`;
    const nota = r.renomeado ? ` Já havia um item com esse nome, então virou “${r.item.nome}”.` : '';
    aviso(`“${r.item.nome}” foi restaurado ${onde}.${nota}`, {
      tipo: 'ok',
      duracao: 6500,
      acao: {
        rotulo: 'Ver',
        ao: () => navegar(r.destinoId === RAIZ ? '/gerenciador' : `/gerenciador/${r.destinoId}`),
      },
    });
  }

  async function excluirParaSempre(lote) {
    const certo = await confirmar({
      titulo: 'Excluir para sempre?',
      mensagem: lote.quantidade > 1
        ? `“${lote.item.nome}” e os ${lote.quantidade - 1} itens dentro dela serão apagados definitivamente. Não dá para desfazer.`
        : `“${lote.item.nome}” será apagado definitivamente. Não dá para desfazer.`,
      rotuloConfirmar: 'Excluir para sempre',
      perigo: true,
    });
    if (!certo) return;
    await armazem.excluirDefinitivamente(lote.lote);
    await desenhar();
    aviso('Excluído definitivamente.');
  }

  async function esvaziar() {
    const certo = await confirmar({
      titulo: 'Esvaziar a lixeira?',
      mensagem: 'Tudo que está na lixeira será apagado definitivamente. Não dá para desfazer.',
      rotuloConfirmar: 'Esvaziar',
      perigo: true,
    });
    if (!certo) return;
    await tentar(async () => {
      await armazem.esvaziarLixeira();
      await desenhar();
      aviso('Lixeira esvaziada.');
    });
  }

  await desenhar();
}
