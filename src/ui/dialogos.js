/**
 * dialogos.js — Janelas de confirmação, texto, escolha de pasta e menu de ações.
 *
 * Usa o elemento nativo <dialog>: ganha foco preso, tecla Esc e botão
 * "voltar" do Android de graça. No celular vira uma folha que sobe do rodapé.
 *
 * Padrão `processar`: funções como pedirTexto e escolherPasta aceitam um
 * `processar(valor)` assíncrono. Se ele devolver um texto, o diálogo continua
 * aberto mostrando esse erro; se devolver null, fecha com sucesso. Assim a
 * operação (criar, renomear, mover) acontece DENTRO do diálogo e erros como
 * "nome já existe" não obrigam a digitar tudo de novo.
 */

import { h, adicionar } from './dom.js';
import { RAIZ } from '../core/tipos.js';

/** Abre um <dialog>. `construir({ fechar })` devolve os nós do conteúdo. */
function executar(construir) {
  return new Promise((resolve) => {
    const dialogo = h('dialog', { class: 'dialogo' });
    const corpo = h('div', { class: 'dialogo-corpo' });
    dialogo.append(corpo);

    let aberto = true;
    const fechar = (valor) => {
      if (!aberto) return;
      aberto = false;
      try { dialogo.close(); } catch { /* já fechado */ }
      dialogo.remove();
      resolve(valor);
    };

    // Esc ou botão "voltar" do celular.
    dialogo.addEventListener('cancel', (e) => {
      e.preventDefault();
      fechar(null);
    });
    // Toque fora da janela (só se o toque começou fora também).
    let comecouFora = false;
    dialogo.addEventListener('pointerdown', (e) => { comecouFora = e.target === dialogo; });
    dialogo.addEventListener('click', (e) => {
      if (comecouFora && e.target === dialogo) fechar(null);
    });

    adicionar(corpo, construir({ fechar }));
    document.body.append(dialogo);
    dialogo.showModal();

    const foco = dialogo.querySelector('[data-foco]');
    if (foco) {
      foco.focus();
      if (typeof foco.select === 'function') foco.select();
    }
  });
}

/** Pergunta sim/não. Devolve true ou false. O foco começa em "Cancelar". */
export function confirmar({ titulo, mensagem, rotuloConfirmar = 'Confirmar', perigo = false }) {
  return executar(({ fechar }) => [
    h('h2', { class: 'dialogo-titulo' }, titulo),
    mensagem && h('p', { class: 'dialogo-texto' }, mensagem),
    h('div', { class: 'dialogo-botoes' },
      h('button', { class: 'botao', type: 'button', 'data-foco': '', onclick: () => fechar(false) }, 'Cancelar'),
      h('button', {
        class: `botao ${perigo ? 'perigo' : 'primario'}`,
        type: 'button',
        onclick: () => fechar(true),
      }, rotuloConfirmar)),
  ]).then((r) => r === true);
}

/** Pede um texto. Devolve o texto digitado ou null (cancelado). */
export function pedirTexto({
  titulo, rotulo, valor = '', rotuloConfirmar = 'Salvar', maxLength = 60, processar,
}) {
  return executar(({ fechar }) => {
    const entrada = h('input', {
      class: 'campo',
      id: 'campo-texto',
      type: 'text',
      value: valor,
      maxLength,
      autocomplete: 'off',
      spellcheck: false,
      'data-foco': '',
    });
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
    const enviar = h('button', { class: 'botao primario', type: 'submit' }, rotuloConfirmar);

    const formulario = h('form', {
      class: 'dialogo-form',
      noValidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const texto = entrada.value;
        let mensagem = null;
        if (processar) {
          enviar.disabled = true;
          try {
            mensagem = await processar(texto);
          } catch (falha) {
            mensagem = falha?.message || String(falha);
          }
          enviar.disabled = false;
        }
        if (mensagem) {
          erro.textContent = mensagem;
          erro.hidden = false;
          entrada.focus();
          return;
        }
        fechar(texto);
      },
    },
    h('label', { class: 'campo-rotulo', htmlFor: 'campo-texto' }, rotulo),
    entrada,
    erro,
    h('div', { class: 'dialogo-botoes' },
      h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
      enviar));

    return [h('h2', { class: 'dialogo-titulo' }, titulo), formulario];
  });
}

/**
 * Escolhe uma pasta de destino.
 * `pastas` é a lista de listarPastas() (ordem de árvore, com `nivel`).
 * Devolve o id escolhido (RAIZ para a raiz) ou null.
 */
export function escolherPasta({
  titulo, pastas, ignorarIds = [], atualId = null, rotuloConfirmar = 'Mover aqui', processar,
}) {
  // Esconde as pastas ignoradas e tudo que está dentro delas.
  const visiveis = [];
  let nivelBloqueado = null;
  for (const pasta of pastas) {
    if (nivelBloqueado !== null) {
      if (pasta.nivel > nivelBloqueado) continue;
      nivelBloqueado = null;
    }
    if (ignorarIds.includes(pasta.id)) {
      nivelBloqueado = pasta.nivel;
      continue;
    }
    visiveis.push(pasta);
  }
  const opcoes = [{ id: RAIZ, nome: 'Raiz (início)', nivel: 0, icone: '🏠' },
    ...visiveis.map((p) => ({ ...p, nivel: p.nivel + 1, icone: '📁' }))];

  return executar(({ fechar }) => {
    let escolhido = null;
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
    const confirmarBotao = h('button', { class: 'botao primario', type: 'button', disabled: true }, rotuloConfirmar);

    const botoes = opcoes.map((op) => {
      const atual = op.id === atualId;
      return h('button', {
        class: 'arvore-item',
        type: 'button',
        role: 'radio',
        'aria-checked': 'false',
        style: { paddingLeft: `${10 + op.nivel * 18}px` },
        onclick: (e) => {
          escolhido = op.id;
          for (const b of arvore.children) b.setAttribute('aria-checked', 'false');
          e.currentTarget.setAttribute('aria-checked', 'true');
          confirmarBotao.disabled = atual; // não faz sentido "mover" para onde já está
          erro.hidden = true;
        },
      },
      h('span', { 'aria-hidden': 'true' }, op.icone),
      h('span', { class: 'arvore-nome' }, op.nome),
      atual && h('small', {}, 'atual'));
    });
    const arvore = h('div', { class: 'arvore', role: 'radiogroup', 'aria-label': 'Pastas' }, botoes);

    confirmarBotao.addEventListener('click', async () => {
      if (escolhido === null) return;
      let mensagem = null;
      if (processar) {
        confirmarBotao.disabled = true;
        try {
          mensagem = await processar(escolhido);
        } catch (falha) {
          mensagem = falha?.message || String(falha);
        }
        confirmarBotao.disabled = false;
      }
      if (mensagem) {
        erro.textContent = mensagem;
        erro.hidden = false;
        return;
      }
      fechar(escolhido);
    });

    return [
      h('h2', { class: 'dialogo-titulo' }, titulo),
      arvore,
      erro,
      h('div', { class: 'dialogo-botoes' },
        h('button', { class: 'botao', type: 'button', 'data-foco': '', onclick: () => fechar(null) }, 'Cancelar'),
        confirmarBotao),
    ];
  });
}

/**
 * Menu de ações (folha de opções). Cada ação: { rotulo, icone, nota, perigo, desabilitado, ao }.
 * Fecha o menu e depois executa `ao()` da ação escolhida.
 */
export function menuAcoes({ titulo, subtitulo, acoes }) {
  return executar(({ fechar }) => [
    h('h2', { class: 'dialogo-titulo' }, titulo),
    subtitulo && h('p', { class: 'dialogo-sub' }, subtitulo),
    h('div', { class: 'menu-acoes' },
      acoes.filter(Boolean).map((a) => h('button', {
        class: `menu-item${a.perigo ? ' perigo' : ''}`,
        type: 'button',
        disabled: !!a.desabilitado,
        onclick: () => fechar(a),
      },
      h('span', { class: 'menu-icone', 'aria-hidden': 'true' }, a.icone || ''),
      h('span', { class: 'menu-rotulo' }, a.rotulo),
      a.nota && h('small', { class: 'menu-nota' }, a.nota)))),
    h('button', { class: 'botao largo', type: 'button', onclick: () => fechar(null) }, 'Fechar'),
  ]).then(async (acao) => {
    if (acao && acao.ao) await acao.ao();
  });
}
