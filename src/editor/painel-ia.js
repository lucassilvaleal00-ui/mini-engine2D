/**
 * painel-ia.js — Aba retrátil (direita) "Chamar IA".
 *
 * PROVISÓRIO: nesta etapa só existe o desenho da aba. O chat de verdade chega na
 * Etapa 5 (módulo de IA). Contrato já combinado para lá:
 *   - abrir a aba já significa "use as ferramentas do editor para criar algo";
 *   - o resultado volta num FRAME NOVO (ctl.inserirQuadroComPixels), nunca sobrescreve;
 *   - dá para anexar uma imagem de inspiração;
 *   - a IA parte do zero ou do primeiro frame, conforme o pedido;
 *   - (pedido do usuário, Etapa 3) a IA SEMPRE mostra o resultado primeiro; se o pedido envolver
 *     mais de um frame (ex.: uma animação de andar), entrega FRAME POR FRAME, cada um num frame novo;
 *   - (pedido do usuário, Etapa 3) comando "aprimorar": refaz um trabalho com mais cuidado e precisão;
 *   - a imagem de inspiração salva no projeto (ctl.referencia) NÃO deve ir junta no JSON enviado à IA
 *     (é um data URL enorme): só se o usuário anexar de propósito.
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
      h('li', {}, 'Mostra o resultado primeiro; se o pedido tiver vários frames, entrega um de cada vez'),
      h('li', {}, 'Comando “aprimorar”: refaz com mais cuidado e precisão'),
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
