/**
 * toast.js — Avisos curtos no rodapé da tela, com ação opcional ("Desfazer").
 */

import { h } from './dom.js';

let caixa = null;

/**
 * aviso('Salvo!')
 * aviso('Enviado para a lixeira', { acao: { rotulo: 'Desfazer', ao: () => ... } })
 * Tipos: 'info' (padrão), 'ok', 'erro'.
 */
export function aviso(texto, { tipo = 'info', acao = null, duracao } = {}) {
  if (!caixa) {
    caixa = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(caixa);
  }
  let temporizador = null;
  const fechar = () => {
    clearTimeout(temporizador);
    el.remove();
  };
  const el = h('div', { class: `toast ${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' },
    h('span', { class: 'toast-texto' }, texto),
    acao && h('button', {
      class: 'toast-acao',
      type: 'button',
      onclick: async () => {
        fechar();
        await acao.ao();
      },
    }, acao.rotulo));
  caixa.append(el);
  // No máximo 3 avisos empilhados: os mais antigos saem.
  while (caixa.children.length > 3) caixa.firstElementChild.remove();
  temporizador = setTimeout(fechar, duracao ?? (acao ? 7000 : 3800));
  return fechar;
}

/** Mostra um erro de forma amigável (mensagens do armazenamento já são em português). */
export function avisarErro(erro) {
  if (erro?.name !== 'ErroDeArmazenamento') console.error(erro);
  const texto = erro?.name === 'ErroDeArmazenamento'
    ? erro.message
    : `Algo deu errado: ${erro?.message || erro}`;
  aviso(texto, { tipo: 'erro', duracao: 6000 });
}

/** Texto de erro para mostrar dentro de um diálogo. */
export function mensagemDeErro(erro) {
  if (erro?.name !== 'ErroDeArmazenamento') console.error(erro);
  return erro?.name === 'ErroDeArmazenamento' ? erro.message : `Algo deu errado: ${erro?.message || erro}`;
}
