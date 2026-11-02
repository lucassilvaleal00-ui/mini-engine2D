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
import { lerChave, modeloDoEditor } from '../core/ia.js';
import { dialogoModelo, rotuloDoModelo } from '../jogo/dialogo-modelo.js';

/**
 * @param aoTransformar  abre a tela "Transformar imagem"
 */
export function criarPainelIA({ aoTransformar } = {}) {
  // Modelo IA do EDITOR: PixelLab é o padrão; SpriteCook, Gemini e OpenRouter são opções.
  // (É uma escolha separada da do Criar jogo; as chaves ficam neste aparelho.)
  const botaoModelo = h('button', {
    class: 'botao pequeno largo ia-modelo', type: 'button', title: 'Escolher a IA do editor e colar as chaves',
    onclick: async () => { await dialogoModelo({ modo: 'editor' }); atualizarModelo(); },
  });
  const atualizarModelo = () => {
    const m = modeloDoEditor();
    botaoModelo.textContent = `Modelo IA: ${rotuloDoModelo(m)}${lerChave(m.provedor) ? '' : ' (colar a chave)'}`;
  };
  atualizarModelo();

  const el = h('div', { class: 'ia' },
    h('div', { class: 'painel-titulo' }, h('span', {}, 'Chamar IA')),
    botaoModelo,
    h('button', {
      class: 'botao primario largo ia-transformar', type: 'button',
      onclick: () => aoTransformar?.(),
    }, '🪄 Transformar imagem'),
    h('p', { class: 'dica pequena' },
      'Suba qualquer imagem: ela volta como pixel art editável, na grade que você escolher (16×16, 32×32…), num frame novo. Com a PixelLab ou a SpriteCook dá para pedir isométrico ou top down.'),
    h('hr', { class: 'separador' }),
    h('p', { class: 'dica pequena' },
      'Em breve: pedir à IA para criar ou alterar o desenho por texto. Ela entrega o resultado num frame novo, sem mexer nos seus.'),
    h('div', { class: 'ia-chat', 'aria-disabled': 'true' },
      h('textarea', {
        class: 'campo', rows: 3, disabled: true, 'aria-label': 'Pedido para a IA',
        placeholder: 'Pedido por texto: em breve…',
      }),
      h('div', { class: 'ia-botoes' },
        h('button', { class: 'botao pequeno', type: 'button', disabled: true }, icone('anexo', 16), 'Imagem'),
        h('button', { class: 'botao pequeno primario', type: 'button', disabled: true }, icone('enviar', 16), 'Enviar'))));
  return { el, atualizarModelo };
}
