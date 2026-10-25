/**
 * inicio.js — Tela inicial: as quatro portas de entrada do Mini Engine.
 */

import { h, adicionar } from '../ui/dom.js';
import { estatisticas } from '../core/storage.js';

const CARTOES = [
  {
    rota: '/editor', icone: '🎨', titulo: 'Editor de pixel art', pronto: true,
    texto: 'Desenhe sprites com camadas, quadros e animações.',
  },
  {
    rota: '/gerenciador', icone: '🗂️', titulo: 'Gerenciador de pixel art', pronto: true,
    texto: 'Organize sprites, cenários e jogos em pastas e subpastas.',
  },
  {
    rota: '/cenario', icone: '🗺️', titulo: 'Construção de cenário', pronto: false,
    texto: 'Monte cenários com seus sprites e defina as camadas de profundidade.',
  },
  {
    rota: '/jogo', icone: '🎮', titulo: 'Criar jogo', pronto: false,
    texto: 'Converse com a IA para criar lógica, regras e história — e teste ao vivo.',
  },
];

export async function montar(el, { navegar }) {
  let lixeira = 0;
  let erroDoBanco = null;
  try {
    lixeira = (await estatisticas()).lixeira;
  } catch (erro) {
    erroDoBanco = erro;
  }

  adicionar(el, [
    h('header', { class: 'marca' },
      h('h1', {}, 'Mini Engine'),
      h('p', {}, 'Pixel art, cenários e jogos 2D — tudo no seu navegador.')),

    erroDoBanco && h('div', { class: 'aviso-caixa erro', role: 'alert' },
      h('strong', {}, 'O armazenamento do navegador não está disponível. '),
      erroDoBanco.message,
      ' Seus desenhos não poderão ser salvos até isso ser resolvido.'),

    h('main', { class: 'cartoes' },
      CARTOES.map((c) => h('button', {
        class: 'cartao',
        type: 'button',
        onclick: () => navegar(c.rota),
      },
      h('span', { class: `selo${c.pronto ? ' pronto' : ''}` }, c.pronto ? 'disponível' : 'em construção'),
      h('span', { class: 'cartao-icone', 'aria-hidden': 'true' }, c.icone),
      h('span', { class: 'cartao-titulo' }, c.titulo),
      h('span', { class: 'cartao-texto' }, c.texto)))),

    h('footer', { class: 'rodape' },
      h('button', { class: 'link', type: 'button', onclick: () => navegar('/lixeira') },
        lixeira ? `🗑️ Lixeira (${lixeira})` : '🗑️ Lixeira'),
      h('button', { class: 'link', type: 'button', onclick: () => navegar('/diagnostico') }, '🔧 Diagnóstico'),
      h('span', {}, 'Etapa 2a · editor')),
  ]);
}
