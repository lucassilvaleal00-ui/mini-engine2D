/**
 * em-breve.js — Tela provisória das partes ainda não construídas
 * (editor, cenário, criar jogo). Já permite testar a navegação: abrir um item
 * no gerenciador leva até aqui, mostrando qual item foi chamado.
 */

import { h } from '../ui/dom.js';
import { obter } from '../core/storage.js';
import { TIPOS } from '../core/tipos.js';

export function criarTelaEmBreve({ titulo, icone, etapa, descricao, recursos }) {
  return {
    async montar(el, { parametro, navegar, voltar }) {
      let item = null;
      if (parametro) {
        try { item = await obter(parametro); } catch { /* sem banco: segue sem o item */ }
      }
      document.title = `${titulo} · Mini Engine`;

      el.append(
        h('header', { class: 'topo' },
          h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/') }, '←'),
          h('h1', {}, titulo)),
        h('section', { class: 'painel em-breve' },
          h('div', { class: 'em-breve-icone', 'aria-hidden': 'true' }, icone),
          h('p', { class: 'selo' }, `chega na ${etapa}`),
          h('p', {}, descricao),
          h('ul', { class: 'lista-simples' }, recursos.map((r) => h('li', {}, r))),
          item && h('p', { class: 'aviso-caixa' },
            `Item chamado: ${TIPOS[item.tipo]?.icone || ''} “${item.nome}” `,
            h('small', {}, `(id ${item.id.slice(0, 8)}…)`)),
          h('div', { class: 'dialogo-botoes' },
            h('button', { class: 'botao', type: 'button', onclick: () => navegar('/gerenciador') }, 'Ir ao gerenciador'),
            h('button', { class: 'botao primario', type: 'button', onclick: () => navegar('/') }, 'Voltar ao início'))));
    },
  };
}

export const editor = criarTelaEmBreve({
  titulo: 'Editor de pixel art',
  icone: '🎨',
  etapa: 'etapa 2',
  descricao: 'O editor completo vem na próxima etapa.',
  recursos: [
    'Lápis, borracha, balde, conta-gotas, linha, retângulo, seleção',
    'Camadas, quadros, onion skin e animação',
    'Painel de ações (andar, correr, agachar…) com direções',
    'Salvar direto nas pastas do gerenciador',
  ],
});

export const cenario = criarTelaEmBreve({
  titulo: 'Construção de cenário',
  icone: '🗺️',
  etapa: 'etapa 4',
  descricao: 'Aqui você vai montar cenários arrastando sprites das suas pastas.',
  recursos: [
    'Painel lateral com todas as pastas de pixel art',
    'Camadas de profundidade: 1 fundo, 2 meio, 3 frente',
    'Objetos sólidos (colidem) ou só decoração',
    'Cenários salvos nas pastas e chamados no “Criar jogo”',
  ],
});

export const jogo = criarTelaEmBreve({
  titulo: 'Criar jogo',
  icone: '🎮',
  etapa: 'etapa 6',
  descricao: 'Um chat com a IA para criar lógica, regras e história — com teste ao vivo ao lado.',
  recursos: [
    'Chame sprites, ações, pastas e cenários com @',
    'A IA só lê os sprites: quem altera sprites é o editor',
    'Jogo rodando em tempo real, com console de erros',
    'Histórico de versões para desfazer alterações da IA',
  ],
});
