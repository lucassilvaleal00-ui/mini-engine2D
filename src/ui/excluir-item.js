/**
 * excluir-item.js — "Excluir" um cenário ou projeto de jogo: vai para a Lixeira, com "Desfazer".
 */

import { h } from './dom.js';
import { confirmar } from './dialogos.js';
import { aviso, avisarErro } from './toast.js';
import * as armazem from '../core/storage.js';

/** Pergunta, manda para a lixeira e oferece "Desfazer". Devolve true se excluiu. */
export async function excluirComDesfazer(item, { rotulo = 'item', aoMudar } = {}) {
  const certo = await confirmar({
    titulo: `Excluir ${rotulo} “${item.nome}”?`,
    mensagem: 'Vai para a Lixeira: dá para desfazer agora ou restaurar depois pela Lixeira.',
    rotuloConfirmar: 'Excluir',
    perigo: true,
  });
  if (!certo) return false;
  try {
    const r = await armazem.enviarParaLixeira(item.id);
    aviso(`“${item.nome}” foi para a Lixeira.`, {
      acao: { rotulo: 'Desfazer', ao: async () => { try { await armazem.restaurar(r.lote); await aoMudar?.(); } catch (x) { avisarErro(x); } } },
    });
    await aoMudar?.();
    return true;
  } catch (x) {
    avisarErro(x);
    return false;
  }
}

/** Cartão da lista (botão principal) + botão 🗑 no canto, sem botão dentro de botão. */
export function cartaoComExcluir(cartao, { rotulo, ao }) {
  return h('div', { class: 'projeto-item' }, cartao,
    h('button', { class: 'projeto-excluir', type: 'button', 'aria-label': `Excluir ${rotulo}`, title: 'Excluir', onclick: ao }, '🗑'));
}
