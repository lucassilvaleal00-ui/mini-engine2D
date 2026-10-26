/**
 * inicio.js — Tela inicial: as quatro portas de entrada do Mini Engine.
 */

import { h, adicionar } from '../ui/dom.js';
import { estatisticas } from '../core/storage.js';
import { situacaoDoBackup, mensagemDeLembrete, adiarLembrete, lerAdiamento } from '../core/backup.js';
import { estadoDaSincronia } from '../core/sincronia.js';
import { textoDaSituacao } from './nuvem.js';

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
    rota: '/cenario', icone: '🗺️', titulo: 'Construção de cenário', pronto: true,
    texto: 'Monte cenários com seus sprites e defina as camadas de profundidade.',
  },
  {
    rota: '/jogo', icone: '🎮', titulo: 'Criar jogo', pronto: true,
    texto: 'Converse com a IA para criar lógica, regras e história — e teste ao vivo.',
  },
];

export async function montar(el, { navegar }) {
  let lixeira = 0;
  let erroDoBanco = null;
  let lembrete = null;
  try {
    lixeira = (await estatisticas()).lixeira;
    lembrete = mensagemDeLembrete(await situacaoDoBackup(), Date.now(), await lerAdiamento());
  } catch (erro) {
    erroDoBanco = erro;
  }
  const caixaLembrete = lembrete && h('div', { class: 'aviso-caixa atencao lembrete-backup', role: 'note' },
    h('p', {}, h('strong', {}, '💾 Hora de um backup? '), lembrete),
    h('div', { class: 'dialogo-botoes' },
      h('button', {
        class: 'botao', type: 'button',
        onclick: async () => { await adiarLembrete(3).catch(() => {}); caixaLembrete.remove(); },
      }, 'Agora não'),
      h('button', { class: 'botao primario', type: 'button', onclick: () => navegar('/backup') }, 'Fazer backup')));

  const botaoNuvem = h('button', { class: 'link nuvem-rodape', type: 'button', onclick: () => navegar('/nuvem') });
  const atualizarNuvem = () => {
    const e = estadoDaSincronia();
    botaoNuvem.textContent = `☁️ ${e.fase === 'desligada' ? 'Nuvem' : textoDaSituacao(e)}`;
    botaoNuvem.dataset.fase = e.fase;
  };
  atualizarNuvem();
  globalThis.addEventListener('miniengine:nuvem', atualizarNuvem);

  adicionar(el, [
    h('header', { class: 'marca' },
      h('h1', {}, 'Mini Engine'),
      h('p', {}, 'Pixel art, cenários e jogos 2D — tudo no seu navegador.')),

    erroDoBanco && h('div', { class: 'aviso-caixa erro', role: 'alert' },
      h('strong', {}, 'O armazenamento do navegador não está disponível. '),
      erroDoBanco.message,
      ' Seus desenhos não poderão ser salvos até isso ser resolvido.'),

    caixaLembrete,

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
      botaoNuvem,
      h('button', { class: 'link', type: 'button', onclick: () => navegar('/backup') }, '💾 Backup'),
      h('button', { class: 'link', type: 'button', onclick: () => navegar('/diagnostico') }, '🔧 Diagnóstico'),
      h('span', {}, 'Etapas 1–6 · cenário e jogo')),
  ]);
  return () => globalThis.removeEventListener('miniengine:nuvem', atualizarNuvem);
}
