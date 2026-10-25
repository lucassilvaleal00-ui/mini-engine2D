/**
 * painel-ia.js — Aba retrátil (direita) "Chamar IA".
 *
 * PROVISÓRIO: nesta etapa só existe o desenho da aba. O chat de verdade chega na
 * Etapa 5 (módulo de IA). Contrato já combinado para lá:
 *   - abrir a aba já significa "use as ferramentas do editor para criar algo";
 *   - o resultado volta num FRAME NOVO (ctl.inserirQuadroComPixels), nunca sobrescreve;
 *   - dá para anexar uma imagem de inspiração;
 *   - a IA parte do zero ou do primeiro frame, conforme o pedido.
 */

import { h } from '../ui/dom.js';
import { icone } from './icones.js';

export function criarPainelIA() {
  const el = h('div', { class: 'ia' },
    h('div', { class: 'painel-titulo' }, h('span', {}, 'Chamar IA'), h('span', { class: 'selo' }, 'etapa 5')),
    h('p', { class: 'dica pequena' },
      'Aqui você vai pedir à IA para criar ou alterar o desenho. Ela usa as ferramentas deste editor e entrega o resultado num frame novo, sem mexer nos seus.'),
    h('ul', { class: 'lista-simples pequena' },
      h('li', {}, 'Parte do zero ou do primeiro frame, conforme o seu pedido'),
      h('li', {}, 'Aceita uma imagem de inspiração'),
      h('li', {}, 'Você revisa o frame novo antes de salvar')),
    h('div', { class: 'ia-chat', 'aria-disabled': 'true' },
      h('textarea', {
        class: 'campo', rows: 3, disabled: true, 'aria-label': 'Pedido para a IA',
        placeholder: 'Disponível na etapa 5…',
      }),
      h('div', { class: 'ia-botoes' },
        h('button', { class: 'botao pequeno', type: 'button', disabled: true }, icone('anexo', 16), 'Imagem'),
        h('button', { class: 'botao pequeno primario', type: 'button', disabled: true }, icone('enviar', 16), 'Enviar'))));
  return { el };
}
