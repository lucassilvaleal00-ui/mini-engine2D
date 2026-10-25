/**
 * dialogos-variacoes.js — Janelas das variações sem IA: "Mudar o tom das cores" e "Cobrir de neve".
 * Cada uma mostra a prévia do frame atual antes de aplicar. A lógica está em variacoes.js e no controlador.
 */

import { h, preencher } from '../ui/dom.js';
import { abrirDialogo } from '../ui/dialogos.js';
import { aviso, mensagemDeErro } from '../ui/toast.js';
import { pluralizar } from '../ui/formato.js';
import { quadroParaRgba } from './imagem.js';
import { deslocarMatizPaleta, aplicarNeve, COR_NEVE, ESPESSURAS_NEVE } from './variacoes.js';
import { pintarPrevia } from './dialogos-arquivo.js';

/* ================================================================== */
/* Mudar o tom das cores                                               */
/* ================================================================== */

export function dialogoMatiz(ctl) {
  const e = ctl.e;
  let graus = 0;

  return abrirDialogo(({ fechar }) => {
    const previa = h('canvas', { class: 'exp-previa-canvas', role: 'img', 'aria-label': 'Prévia com o novo tom' });
    const faixa = h('div', { class: 'var-paleta', 'aria-hidden': 'true' });
    const resumo = h('p', { class: 'dica pequena exp-resumo', 'aria-live': 'polite' });
    const valor = h('output', { class: 'var-valor', for: 'var-matiz' });
    const botao = h('button', { class: 'botao primario', type: 'submit' }, 'Aplicar');

    const controle = h('input', {
      class: 'var-deslizante', id: 'var-matiz', type: 'range', min: -180, max: 180, step: 5, value: 0,
      'aria-label': 'Quanto girar o tom, em graus',
      oninput: (ev) => { graus = Number(ev.target.value); atualizar(); },
    });

    function atualizar() {
      const nova = deslocarMatizPaleta(e.paleta, graus);
      const mudam = nova.filter((c, i) => c !== e.paleta[i]).length;
      valor.textContent = `${graus > 0 ? '+' : ''}${graus}°`;
      try { pintarPrevia(previa, quadroParaRgba({ ...e, paleta: nova }, e.quadros[e.atual], 1)); } catch { /* sem prévia */ }
      preencher(faixa, e.paleta.slice(1).map((cor, i) => h('span', {
        class: 'var-amostra', style: { background: nova[i + 1] }, title: nova[i + 1],
      })));
      const comTom = e.paleta.slice(1).some((c, i) => deslocarMatizPaleta(e.paleta, 90)[i + 1] !== c);
      if (!comTom) resumo.textContent = 'Todas as cores deste desenho são cinza, branco ou preto: não há tom para mudar.';
      else if (graus === 0) resumo.textContent = 'Arraste para escolher quanto girar o tom. Brilho e saturação ficam como estão.';
      else resumo.textContent = `${pluralizar(mudam, 'cor muda', 'cores mudam')}. Vale para o desenho todo (todos os frames e camadas).`;
      botao.disabled = mudam === 0;
    }

    const formulario = h('form', {
      class: 'dialogo-form',
      onsubmit: (ev) => {
        ev.preventDefault();
        try {
          const n = ctl.deslocarMatiz(graus);
          aviso(n ? `Tom mudado em ${pluralizar(n, 'cor', 'cores')}. Dá para desfazer.` : 'Nenhuma cor mudou.', { tipo: n ? 'ok' : 'erro' });
          fechar(true);
        } catch (x) { aviso(mensagemDeErro(x), { tipo: 'erro' }); }
      },
    },
    h('div', { class: 'exp-previa' }, previa),
    h('div', { class: 'campo-rotulo' }, 'Quanto girar o tom'),
    h('div', { class: 'var-linha' }, controle, valor),
    h('div', { class: 'grupo-segmentos', role: 'group', 'aria-label': 'Atalhos' },
      [[-120, '−120°'], [-60, '−60°'], [0, 'Original'], [60, '+60°'], [120, '+120°']].map(([g, r]) => h('button', {
        class: 'segmento', type: 'button', onclick: () => { graus = g; controle.value = String(g); atualizar(); },
      }, r))),
    h('div', { class: 'campo-rotulo' }, 'Cores da paleta com o novo tom'),
    faixa,
    resumo,
    h('div', { class: 'dialogo-botoes fixo' },
      h('button', { class: 'botao', type: 'button', 'data-foco': '', onclick: () => fechar(false) }, 'Cancelar'),
      botao));

    atualizar();
    return [
      h('h2', { class: 'dialogo-titulo' }, 'Mudar o tom das cores'),
      h('p', { class: 'dialogo-sub' }, 'Gira todas as cores de uma vez: um herói vermelho vira verde, azul…'),
      formulario,
    ];
  });
}

/* ================================================================== */
/* Cobrir de neve                                                      */
/* ================================================================== */

export function dialogoNeve(ctl) {
  const e = ctl.e;
  const total = e.quadros.length;
  const ui = { espessura: 1, escopo: 'quadro' };
  const camadaEscondida = e.camadas.some((c) => !c.visivel);

  return abrirDialogo(({ fechar }) => {
    const previa = h('canvas', { class: 'exp-previa-canvas', role: 'img', 'aria-label': 'Prévia com neve' });
    const espessuras = h('div', { class: 'grupo-segmentos', role: 'group', 'aria-label': 'Espessura da neve' });
    const escopos = h('div', { class: 'exp-lista', role: 'radiogroup', 'aria-label': 'Onde aplicar' });
    const resumo = h('p', { class: 'dica pequena exp-resumo', 'aria-live': 'polite' });
    const botao = h('button', { class: 'botao primario', type: 'submit' }, 'Aplicar');

    function atualizar() {
      preencher(espessuras, ESPESSURAS_NEVE.map((n) => h('button', {
        class: 'segmento', type: 'button', 'aria-pressed': String(n === ui.espessura),
        onclick: () => { ui.espessura = n; atualizar(); },
      }, `${n} px`)));
      if (total > 1) {
        preencher(escopos, [['quadro', 'Só este frame', `frame ${e.atual + 1} de ${total}`], ['todos', 'Todos os frames', `${total} frames`]].map(([id, titulo, nota]) => h('button', {
          class: 'exp-opcao', type: 'button', role: 'radio', 'aria-checked': String(id === ui.escopo),
          onclick: () => { ui.escopo = id; atualizar(); },
        }, h('span', { class: 'exp-opcao-titulo' }, titulo), h('small', {}, nota))));
      }
      const r = aplicarNeve(e, ui);
      try {
        pintarPrevia(previa, quadroParaRgba({ ...e, paleta: r.paleta }, r.quadros[e.atual], 1));
      } catch { /* sem prévia */ }
      if (!r.pixels) resumo.textContent = 'Não há nada visível para cobrir de neve.';
      else if (!r.mudou) resumo.textContent = 'Essa neve já está aplicada: nada muda.';
      else {
        const partes = [`${pluralizar(r.pixels, 'pixel coberto', 'pixels cobertos')}.`];
        if (r.paleta !== e.paleta) partes.push(`A cor da neve (${COR_NEVE}) será acrescentada à paleta.`);
        resumo.textContent = partes.join(' ');
      }
      botao.disabled = !r.mudou;
    }

    const formulario = h('form', {
      class: 'dialogo-form',
      onsubmit: (ev) => {
        ev.preventDefault();
        try {
          const r = ctl.aplicarNeve(ui);
          aviso(r.pixels ? `Neve aplicada em ${pluralizar(r.pixels, 'pixel', 'pixels')}. Dá para desfazer.` : 'Não havia onde pôr neve.', { tipo: r.pixels ? 'ok' : 'erro' });
          fechar(true);
        } catch (x) { aviso(mensagemDeErro(x), { tipo: 'erro' }); }
      },
    },
    h('div', { class: 'exp-previa' }, previa),
    resumo,
    h('div', { class: 'campo-rotulo' }, 'Espessura da neve'),
    espessuras,
    total > 1 && h('div', { class: 'campo-rotulo' }, 'Onde aplicar'),
    total > 1 && escopos,
    h('p', { class: 'dica pequena' }, 'A neve cai de cima e pousa no primeiro pixel que encontra em cada coluna.'),
    camadaEscondida && h('div', { class: 'aviso-caixa atencao', role: 'note' }, 'Há camadas escondidas: a neve ignora o que está nelas.'),
    h('div', { class: 'dialogo-botoes fixo' },
      h('button', { class: 'botao', type: 'button', 'data-foco': '', onclick: () => fechar(false) }, 'Cancelar'),
      botao));

    atualizar();
    return [
      h('h2', { class: 'dialogo-titulo' }, 'Cobrir de neve'),
      h('p', { class: 'dialogo-sub' }, 'Pinta de quase branco o topo do que está desenhado.'),
      formulario,
    ];
  });
}
