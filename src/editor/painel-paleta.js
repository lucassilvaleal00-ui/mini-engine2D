/**
 * painel-paleta.js — Aba retrátil (esquerda) com a paleta de cores.
 *
 * Toque numa cor para usá-la. Botões: ＋ adicionar, ✎ editar a cor selecionada,
 * 🗑 apagar a cor selecionada. Alterar uma cor muda todos os pixels que a usam.
 */

import { h, preencher } from '../ui/dom.js';
import { aviso } from '../ui/toast.js';
import { confirmar } from '../ui/dialogos.js';
import { pluralizar } from '../ui/formato.js';
import { icone } from './icones.js';
import { abrirSeletorCor } from './seletor-cor.js';
import { MAX_CORES } from './documento.js';

/**
 * @param ctl   Controlador
 * @param sel   { obter(): indice selecionado, definir(i) }
 * @returns { el, atualizar() }
 */
export function criarPainelPaleta(ctl, sel) {
  const grade = h('div', { class: 'paleta-grade', role: 'radiogroup', 'aria-label': 'Cores' });
  const contador = h('span', { class: 'paleta-contagem' });
  const nota = h('p', { class: 'dica pequena' }, 'Editar uma cor muda todos os pixels que a usam.');
  const botaoEditar = h('button', { class: 'botao', type: 'button', onclick: () => editar() }, icone('editar', 18), 'Editar');
  const botaoApagar = h('button', { class: 'botao', type: 'button', onclick: () => apagar() }, icone('lixeira', 18), 'Apagar');

  const el = h('div', { class: 'paleta' },
    h('div', { class: 'painel-titulo' }, h('span', {}, 'Cores'), contador),
    grade,
    h('div', { class: 'paleta-acoes' },
      h('button', { class: 'botao primario', type: 'button', onclick: () => adicionar() }, icone('mais', 18), 'Adicionar'),
      botaoEditar,
      botaoApagar),
    nota);

  function atualizar() {
    const { paleta } = ctl.e;
    if (sel.obter() >= paleta.length) sel.definir(Math.min(1, paleta.length - 1));
    const atual = sel.obter();
    contador.textContent = `${paleta.length}/${MAX_CORES}`;
    preencher(grade, paleta.map((cor, i) => {
      const botao = h('button', {
        class: `amostra${i === 0 ? ' transparente' : ''}`,
        type: 'button',
        role: 'radio',
        'aria-checked': String(i === atual),
        'aria-label': i === 0 ? 'Transparente (apaga)' : `Cor ${i}: ${cor}`,
        title: i === 0 ? 'Transparente' : cor,
        onclick: () => { sel.definir(i); atualizar(); },
        ondblclick: () => { if (i > 0) { sel.definir(i); atualizar(); editar(); } },
      });
      if (i > 0) botao.style.background = cor;
      return botao;
    }));
    botaoEditar.disabled = atual === 0;
    botaoApagar.disabled = atual === 0;
  }

  async function adicionar() {
    const inicial = sel.obter() > 0 ? ctl.e.paleta[sel.obter()] : '#ffffff';
    await abrirSeletorCor({
      titulo: 'Adicionar cor',
      corInicial: inicial,
      rotuloConfirmar: 'Adicionar à paleta',
      processar: (hex) => {
        try {
          sel.definir(ctl.adicionarCor(hex));
          return null;
        } catch (erro) {
          return erro.message;
        }
      },
    });
    atualizar();
  }

  async function editar() {
    const i = sel.obter();
    if (i === 0) return;
    await abrirSeletorCor({
      titulo: `Editar cor ${i}`,
      corInicial: ctl.e.paleta[i],
      rotuloConfirmar: 'Salvar alteração',
      processar: (hex) => {
        try { ctl.alterarCor(i, hex); return null; } catch (erro) { return erro.message; }
      },
    });
    atualizar();
  }

  async function apagar() {
    const i = sel.obter();
    if (i === 0) return;
    const uso = ctl.usoDaCor(i);
    const certo = await confirmar({
      titulo: 'Apagar esta cor?',
      mensagem: uso
        ? `${pluralizar(uso, 'pixel usa', 'pixels usam')} ${ctl.e.paleta[i]} e ${uso === 1 ? 'ficará transparente' : 'ficarão transparentes'}. Dá para desfazer logo depois.`
        : `${ctl.e.paleta[i]} não está sendo usada em nenhum quadro.`,
      rotuloConfirmar: 'Apagar cor',
      perigo: true,
    });
    if (!certo) return;
    try {
      ctl.removerCor(i);
      aviso('Cor apagada.', { acao: { rotulo: 'Desfazer', ao: () => ctl.desfazer() } });
    } catch (erro) {
      aviso(erro.message, { tipo: 'erro' });
    }
    atualizar();
  }

  return { el, atualizar };
}
