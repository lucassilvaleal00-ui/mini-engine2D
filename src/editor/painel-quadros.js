/**
 * painel-quadros.js — Faixa de frames no topo: miniaturas, adicionar, duplicar, excluir,
 * reordenar e uma pequena prévia da animação (play/pause + velocidade).
 */

import { h, preencher } from '../ui/dom.js';
import { aviso } from '../ui/toast.js';
import { icone } from './icones.js';
import { desenharQuadro } from './render.js';

export function criarPainelQuadros(ctl) {
  const faixa = h('div', { class: 'quadros-faixa', role: 'listbox', 'aria-label': 'Frames' });
  const previa = h('canvas', { class: 'previa-canvas', 'aria-label': 'Prévia da animação' });
  const botaoTocar = h('button', {
    class: 'botao icone', type: 'button', 'aria-label': 'Tocar animação', onclick: () => alternar(),
  }, icone('tocar', 18));
  const fps = h('input', {
    class: 'campo fps', type: 'number', min: 1, max: 60, value: ctl.e.fps, inputMode: 'numeric',
    'aria-label': 'Quadros por segundo',
    onchange: () => { ctl.definirFps(fps.value); fps.value = ctl.e.fps; },
  });

  const tentar = (fn) => {
    try { fn(); } catch (erro) { aviso(erro.message, { tipo: 'erro' }); }
  };
  const botao = (rotulo, nomeIcone, ao, extra = {}) => h('button', {
    class: 'botao pequeno', type: 'button', onclick: ao, ...extra,
  }, nomeIcone && icone(nomeIcone, 16), rotulo && h('span', { class: 'rotulo' }, rotulo));

  const botaoEsq = botao('', 'voltar', () => tentar(() => ctl.moverQuadro(ctl.e.atual, ctl.e.atual - 1)), { 'aria-label': 'Mover frame para a esquerda', title: 'Mover para a esquerda' });
  const botaoDir = botao('', 'voltar', () => tentar(() => ctl.moverQuadro(ctl.e.atual, ctl.e.atual + 1)), { 'aria-label': 'Mover frame para a direita', title: 'Mover para a direita' });
  botaoDir.firstElementChild.style.transform = 'scaleX(-1)';
  const botaoExcluir = botao('Excluir', 'lixeira', () => tentar(() => ctl.excluirQuadro()), { 'aria-label': 'Excluir frame', title: 'Excluir este frame' });

  const el = h('div', { class: 'quadros' },
    h('div', { class: 'quadros-linha' },
      faixa,
      h('button', {
        class: 'botao primario adicionar', type: 'button', onclick: () => ctl.adicionarQuadro(),
      }, icone('mais', 18), h('span', {}, 'Adicionar frame')),
      h('div', { class: 'previa' }, previa,
        h('div', { class: 'previa-controles' }, botaoTocar,
          h('label', { class: 'fps-rotulo' }, fps, h('span', {}, 'fps'))))),
    h('div', { class: 'quadros-acoes' },
      botao('Duplicar', 'copiar', () => ctl.duplicarQuadro(), { 'aria-label': 'Duplicar frame', title: 'Duplicar este frame' }),
      botaoExcluir, botaoEsq, botaoDir,
      h('span', { class: 'quadros-info' })));
  const info = el.querySelector('.quadros-info');

  /* ---------- miniaturas ---------- */
  function atualizar() {
    const e = ctl.e;
    preencher(faixa, e.quadros.map((q, i) => {
      const mini = document.createElement('canvas');
      desenharQuadro(e, q, mini);
      return h('button', {
        class: 'quadro-mini', type: 'button', role: 'option',
        'aria-selected': String(i === e.atual), 'aria-label': `Frame ${i + 1}`,
        onclick: () => ctl.selecionarQuadro(i),
      }, mini, h('span', { class: 'quadro-num' }, String(i + 1)));
    }));
    faixa.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    botaoExcluir.disabled = e.quadros.length <= 1;
    botaoEsq.disabled = e.atual === 0;
    botaoDir.disabled = e.atual === e.quadros.length - 1;
    info.textContent = `Frame ${e.atual + 1} de ${e.quadros.length}`;
    if (document.activeElement !== fps) fps.value = e.fps;
    desenharPrevia(tocando ? posicao : e.atual);
  }

  /* ---------- prévia animada ---------- */
  let tocando = false;
  let posicao = 0;
  let temporizador = 0;

  function desenharPrevia(i) {
    const e = ctl.e;
    desenharQuadro(e, e.quadros[Math.min(i, e.quadros.length - 1)], previa);
  }

  function passo() {
    posicao = (posicao + 1) % ctl.e.quadros.length;
    desenharPrevia(posicao);
    temporizador = setTimeout(passo, 1000 / ctl.e.fps);
  }

  function alternar() {
    tocando = !tocando;
    clearTimeout(temporizador);
    botaoTocar.replaceChildren(icone(tocando ? 'pausar' : 'tocar', 18));
    botaoTocar.setAttribute('aria-label', tocando ? 'Pausar animação' : 'Tocar animação');
    if (tocando) { posicao = ctl.e.atual; passo(); } else desenharPrevia(ctl.e.atual);
  }

  function destruir() { clearTimeout(temporizador); tocando = false; }

  return { el, atualizar, destruir };
}
