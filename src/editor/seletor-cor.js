/**
 * seletor-cor.js — Janela de escolher cor, no estilo do Piskel:
 * quadrado de saturação/brilho, barra de matiz (arco-íris) e campo #hex.
 *
 * abrirSeletorCor({ titulo, corInicial, rotuloConfirmar, processar }) -> '#rrggbb' | null
 *   `processar(hex)` (opcional) pode devolver um texto de erro: a janela continua aberta mostrando-o.
 */

import { h } from '../ui/dom.js';
import { abrirDialogo } from '../ui/dialogos.js';
import { normalizarHex, hexParaRgb, rgbParaHex } from './documento.js';
import { hsvParaRgb, rgbParaHsv } from './cores.js';

/* ---------- conversões HSV <-> RGB (em cores.js, sem DOM) ---------- */

export { hsvParaRgb, rgbParaHsv };

/** Faz um elemento responder a arrastar (mouse e toque) com coordenadas 0..1. */
function arrastavel(el, aoMover) {
  const ler = (ev) => {
    const r = el.getBoundingClientRect();
    aoMover(
      Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)),
    );
  };
  el.addEventListener('pointerdown', (ev) => {
    el.setPointerCapture(ev.pointerId);
    ler(ev);
    const mover = (e) => ler(e);
    const soltar = () => {
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerup', soltar);
      el.removeEventListener('pointercancel', soltar);
    };
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  });
}

export function abrirSeletorCor({
  titulo, corInicial = '#ffffff', rotuloConfirmar = 'Usar cor', processar,
}) {
  return abrirDialogo(({ fechar }) => {
    const inicial = normalizarHex(corInicial) || '#ffffff';
    let [hh, s, v] = rgbParaHsv(...hexParaRgb(inicial));

    const alca = h('span', { class: 'sv-alca' });
    const quadrado = h('div', {
      class: 'sv-quadrado', role: 'slider', 'aria-label': 'Saturação e brilho', tabIndex: 0,
    }, alca);
    const marcaMatiz = h('span', { class: 'matiz-alca' });
    const barraMatiz = h('div', { class: 'matiz-barra', role: 'slider', 'aria-label': 'Matiz', tabIndex: 0 }, marcaMatiz);
    const campo = h('input', {
      class: 'campo hex', type: 'text', maxLength: 7, autocomplete: 'off', spellcheck: false,
      'aria-label': 'Código da cor em hexadecimal', 'data-foco': '',
    });
    const amostraNova = h('span', { class: 'amostra-nova', title: 'Cor nova' });
    const amostraVelha = h('span', { class: 'amostra-velha', title: 'Cor atual' });
    amostraVelha.style.background = inicial;
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });

    const hexAtual = () => rgbParaHex(...hsvParaRgb(hh, s, v));

    const atualizar = ({ doCampo = false } = {}) => {
      const hex = hexAtual();
      quadrado.style.setProperty('--matiz', `hsl(${hh}, 100%, 50%)`);
      alca.style.left = `${s * 100}%`;
      alca.style.top = `${(1 - v) * 100}%`;
      marcaMatiz.style.top = `${(hh / 360) * 100}%`;
      amostraNova.style.background = hex;
      if (!doCampo) campo.value = hex;
      erro.hidden = true;
    };

    arrastavel(quadrado, (x, y) => { s = x; v = 1 - y; atualizar(); });
    arrastavel(barraMatiz, (_x, y) => { hh = Math.min(359.9, y * 360); atualizar(); });
    campo.addEventListener('input', () => {
      const hex = normalizarHex(campo.value);
      if (hex) { [hh, s, v] = rgbParaHsv(...hexParaRgb(hex)); atualizar({ doCampo: true }); }
    });

    const confirmar = h('button', { class: 'botao primario', type: 'submit' }, rotuloConfirmar);
    const formulario = h('form', {
      class: 'dialogo-form',
      noValidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const hex = normalizarHex(campo.value) || hexAtual();
        if (!normalizarHex(campo.value)) {
          erro.textContent = 'Digite uma cor no formato #rrggbb (por exemplo #ff8800).';
          erro.hidden = false;
          return;
        }
        let mensagem = null;
        if (processar) {
          confirmar.disabled = true;
          try { mensagem = await processar(hex); } catch (falha) { mensagem = falha?.message || String(falha); }
          confirmar.disabled = false;
        }
        if (mensagem) { erro.textContent = mensagem; erro.hidden = false; return; }
        fechar(hex);
      },
    },
    h('div', { class: 'seletor' },
      h('div', { class: 'seletor-amostras' }, amostraVelha, amostraNova),
      quadrado,
      barraMatiz),
    h('div', { class: 'seletor-hex' },
      h('label', { class: 'campo-rotulo', htmlFor: 'hex-campo' }, 'Código da cor'),
      campo),
    erro,
    h('div', { class: 'dialogo-botoes' },
      h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
      confirmar));
    campo.id = 'hex-campo';

    atualizar();
    return [h('h2', { class: 'dialogo-titulo' }, titulo), formulario];
  });
}
