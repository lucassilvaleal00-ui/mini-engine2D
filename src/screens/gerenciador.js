/**
 * gerenciador.js — Gerenciador de pixel art: pastas, subpastas e itens.
 *
 * Rota: #/gerenciador  (raiz)   ou   #/gerenciador/<idDaPasta>
 * Cada pasta tem a própria URL, então o botão "voltar" do celular sobe um nível.
 */

import { h, preencher } from '../ui/dom.js';
import { aviso, avisarErro, mensagemDeErro } from '../ui/toast.js';
import { confirmar, pedirTexto, escolherPasta, menuAcoes } from '../ui/dialogos.js';
import { formatarDataHora, pluralizar } from '../ui/formato.js';
import { RAIZ, TIPOS, rotaDoItem } from '../core/tipos.js';
import * as armazem from '../core/storage.js';

/** Converte "executa e devolve erro como texto" no formato esperado pelos diálogos. */
const comoProcessar = (fn) => async (valor) => {
  try {
    await fn(valor);
    return null;
  } catch (erro) {
    return mensagemDeErro(erro);
  }
};

export async function montar(el, { parametro, navegar }) {
  const pastaId = parametro || RAIZ;
  const migalhas = await armazem.caminho(pastaId);
  if (migalhas === null) {
    // A pasta não existe (mais). Volta para a raiz.
    navegar('/gerenciador', { substituir: true });
    return;
  }
  document.title = 'Gerenciador · Mini Engine';

  /* ---------- Estrutura fixa da tela ---------- */
  const lista = h('ul', { class: 'lista' });
  const vazio = h('div', { class: 'vazio', hidden: true });
  const botaoLixeira = h('button', {
    class: 'botao', type: 'button', onclick: () => navegar('/lixeira'),
  }, '🗑️ Lixeira');

  const destinoVoltar = migalhas.length === 0
    ? '/'
    : migalhas.length === 1 ? '/gerenciador' : `/gerenciador/${migalhas[migalhas.length - 2].id}`;

  const linkMigalha = (nome, rota) => h('button', { type: 'button', onclick: () => navegar(rota) }, nome);
  const trilha = [migalhas.length ? linkMigalha('Raiz', '/gerenciador') : h('span', { class: 'atual' }, 'Raiz')];
  migalhas.forEach((m, i) => {
    trilha.push(h('span', { 'aria-hidden': 'true' }, '›'));
    trilha.push(i === migalhas.length - 1
      ? h('span', { class: 'atual', 'aria-current': 'page' }, m.nome)
      : linkMigalha(m.nome, `/gerenciador/${m.id}`));
  });

  el.append(
    h('header', { class: 'topo' },
      h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => navegar(destinoVoltar) }, '←'),
      h('h1', {}, 'Gerenciador'),
      botaoLixeira),
    h('nav', { class: 'migalhas', 'aria-label': 'Caminho' }, trilha),
    h('div', { class: 'barra-acoes' },
      h('button', { class: 'botao primario', type: 'button', onclick: () => novaPasta() }, '＋ Nova pasta')),
    lista,
    vazio,
  );

  /* ---------- Desenho da lista ---------- */
  async function desenhar() {
    const [filhos, lotesNaLixeira] = await Promise.all([
      armazem.listarFilhos(pastaId),
      armazem.contarLixeira(),
    ]);

    botaoLixeira.textContent = lotesNaLixeira ? `🗑️ Lixeira (${lotesNaLixeira})` : '🗑️ Lixeira';
    lista.replaceChildren(...filhos.map(criarLinha));

    vazio.hidden = filhos.length > 0;
    if (!filhos.length) {
      preencher(vazio,
        h('p', {}, pastaId === RAIZ ? 'Nada por aqui ainda.' : 'Esta pasta está vazia.'),
        h('p', { class: 'dica' }, 'Crie pastas e subpastas para organizar o projeto. Os sprites aparecem aqui quando você os salvar no editor (etapa 2).'),
        pastaId === RAIZ && h('button', { class: 'link', type: 'button', onclick: () => navegar('/diagnostico') },
          'Quer testar já? Crie exemplos no Diagnóstico'));
    }
  }

  function criarLinha(item) {
    const tipo = TIPOS[item.tipo];
    const meta = item.tipo === 'pasta'
      ? (item.qtd ? pluralizar(item.qtd, 'item', 'itens') : 'vazia')
      : [tipo.rotulo, item.resumo?.descricao, `editado ${formatarDataHora(item.atualizadoEm)}`].filter(Boolean).join(' · ');

    return h('li', { class: `linha ${item.tipo}` },
      h('button', {
        class: 'linha-principal',
        type: 'button',
        onclick: () => navegar(rotaDoItem(item)),
      },
      h('span', { class: 'linha-icone', 'aria-hidden': 'true' }, tipo.icone),
      h('span', { class: 'linha-textos' },
        h('span', { class: 'linha-nome' }, item.nome),
        h('span', { class: 'linha-meta' }, meta))),
      h('button', {
        class: 'linha-menu',
        type: 'button',
        'aria-label': `Ações de ${item.nome}`,
        onclick: () => abrirMenu(item),
      }, '⋮'));
  }

  /* ---------- Ações ---------- */
  async function tentar(fn) {
    try {
      await fn();
    } catch (erro) {
      avisarErro(erro);
    }
  }

  function abrirMenu(item) {
    const tipo = TIPOS[item.tipo];
    return menuAcoes({
      titulo: item.nome,
      subtitulo: tipo.rotulo,
      acoes: [
        { icone: item.tipo === 'pasta' ? '📂' : '✏️', rotulo: 'Abrir', ao: () => navegar(rotaDoItem(item)) },
        { icone: '🏷️', rotulo: 'Renomear', ao: () => tentar(() => renomear(item)) },
        { icone: '📦', rotulo: 'Mover para…', ao: () => tentar(() => mover(item)) },
        { icone: '📄', rotulo: 'Duplicar', ao: () => tentar(() => duplicar(item)) },
        item.tipo === 'sprite' && { icone: '✨', rotulo: 'Solicitar IA', nota: 'chega na etapa 5', desabilitado: true },
        { icone: '🗑️', rotulo: 'Enviar para a lixeira', perigo: true, ao: () => tentar(() => paraLixeira(item)) },
      ],
    });
  }

  async function novaPasta() {
    const nome = await pedirTexto({
      titulo: 'Nova pasta',
      rotulo: 'Nome da pasta',
      rotuloConfirmar: 'Criar',
      processar: comoProcessar((texto) => armazem.criarPasta(texto, pastaId)),
    });
    if (nome !== null) await tentar(desenhar);
  }

  async function renomear(item) {
    const nome = await pedirTexto({
      titulo: `Renomear ${TIPOS[item.tipo].rotulo.toLowerCase()}`,
      rotulo: 'Novo nome',
      valor: item.nome,
      processar: comoProcessar((texto) => armazem.renomear(item.id, texto)),
    });
    if (nome !== null) await desenhar();
  }

  async function mover(item) {
    const pastas = await armazem.listarPastas();
    const destino = await escolherPasta({
      titulo: `Mover “${item.nome}” para…`,
      pastas,
      ignorarIds: item.tipo === 'pasta' ? [item.id] : [],
      atualId: pastaId,
      processar: comoProcessar((id) => armazem.mover(item.id, id)),
    });
    if (destino !== null) {
      aviso(`“${item.nome}” foi movido.`, { tipo: 'ok' });
      await desenhar();
    }
  }

  async function duplicar(item) {
    const { item: copia, quantidade } = await armazem.duplicar(item.id);
    aviso(quantidade > 1
      ? `Criado “${copia.nome}” com ${pluralizar(quantidade - 1, 'item', 'itens')} dentro.`
      : `Criado “${copia.nome}”.`, { tipo: 'ok' });
    await desenhar();
  }

  async function paraLixeira(item) {
    if (item.tipo === 'pasta' && item.qtd > 0) {
      const certo = await confirmar({
        titulo: 'Enviar para a lixeira?',
        mensagem: `A pasta “${item.nome}” e tudo que está dentro dela vão para a lixeira. Você poderá restaurar depois.`,
        rotuloConfirmar: 'Enviar para a lixeira',
        perigo: true,
      });
      if (!certo) return;
    }
    const resultado = await armazem.enviarParaLixeira(item.id);
    await desenhar();
    aviso(`“${item.nome}” foi para a lixeira.`, {
      acao: {
        rotulo: 'Desfazer',
        ao: () => tentar(async () => {
          await armazem.restaurar(resultado.lote);
          await desenhar();
        }),
      },
    });
  }

  await desenhar();
}
