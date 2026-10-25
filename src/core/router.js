/**
 * router.js — Roteador por "hash" (#/gerenciador/ID).
 *
 * Por que hash? Funciona no GitHub Pages sem configuração, e o botão
 * "voltar" do celular/navegador leva para a pasta ou tela anterior.
 *
 * Cada tela é um módulo com:
 *     export async function montar(el, { parametro, navegar, voltar })
 * `el` é um <div> novo onde a tela se desenha. Se a tela devolver uma função,
 * ela é chamada ao sair (use para soltar timers, destruir o Phaser etc.).
 */

import { h } from '../ui/dom.js';

export function iniciarRoteador(raiz, rotas) {
  let senha = 0;      // identifica a navegação atual (descarta montagens atrasadas)
  let limpeza = null; // função de limpeza da tela atual
  let primeira = true;
  let substituindo = false;
  let indice = 0;     // posição da entrada atual na pilha de navegação DESTE app

  function navegar(caminho, { substituir = false } = {}) {
    const alvo = '#' + caminho;
    if (substituir) {
      substituindo = true;
      location.replace(alvo);
    } else {
      location.hash = alvo;
    }
  }

  /**
   * Volta para a tela de onde o usuário veio (ex.: da Lixeira para a pasta que
   * ele estava vendo). Se não há de onde voltar dentro do app — por exemplo,
   * o link foi aberto direto —, vai para `padrao` em vez de sair do site.
   */
  function voltar(padrao = '/') {
    if (indice > 0) history.back();
    else navegar(padrao, { substituir: true });
  }

  /** Numera as entradas do histórico (guardando o número em history.state). */
  function registrarEntrada() {
    const salvo = history.state && history.state.mini;
    if (typeof salvo === 'number') {
      indice = salvo; // chegamos por voltar/avançar: a entrada já foi numerada
    } else {
      if (!primeira && !substituindo) indice += 1;
      history.replaceState({ mini: indice }, '');
    }
    primeira = false;
    substituindo = false;
  }

  function lerCaminho() {
    try {
      return decodeURIComponent(location.hash.slice(1)) || '/';
    } catch {
      return '/';
    }
  }

  async function resolver() {
    const minha = ++senha;
    registrarEntrada();
    const partes = lerCaminho().split('/').filter(Boolean);
    const chave = partes[0] ?? '';
    const parametro = partes[1];

    if (typeof limpeza === 'function') {
      try { limpeza(); } catch (erro) { console.error('[router] erro ao sair da tela', erro); }
    }
    limpeza = null;

    const tela = rotas[chave];
    if (!tela) {
      navegar('/', { substituir: true });
      return;
    }

    document.title = 'Mini Engine';
    const el = h('div', { class: 'tela', 'data-tela': chave || 'inicio' });
    let retorno;
    try {
      retorno = await tela.montar(el, { parametro, navegar, voltar });
    } catch (erro) {
      console.error('[router] erro ao montar a tela', erro);
      el.replaceChildren(painelDeErro(erro, navegar));
    }

    // Se o usuário navegou de novo enquanto esta tela montava, descarta.
    if (minha !== senha) {
      if (typeof retorno === 'function') retorno();
      return;
    }
    limpeza = typeof retorno === 'function' ? retorno : null;
    raiz.replaceChildren(el);
    window.scrollTo(0, 0);

    // Acessibilidade: leva o foco para o título da nova tela.
    const titulo = el.querySelector('h1');
    if (titulo) {
      titulo.tabIndex = -1;
      titulo.focus({ preventScroll: true });
    }
  }

  window.addEventListener('hashchange', resolver);
  resolver();
  return { navegar, voltar };
}

function painelDeErro(erro, navegar) {
  return h('div', { class: 'painel erro-painel' },
    h('h1', {}, 'Algo deu errado'),
    h('p', {}, erro?.message || String(erro)),
    h('button', { class: 'botao primario', type: 'button', onclick: () => navegar('/') }, 'Voltar ao início'));
}
