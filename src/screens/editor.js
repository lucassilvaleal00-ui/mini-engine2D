/**
 * editor.js — Tela do Editor de pixel art.
 *
 * Rotas:  #/editor            -> pergunta: criar, abrir (ou continuar um rascunho)
 *         #/editor/<idItem>   -> abre direto o desenho (qualquer frame da cadeia serve)
 *
 * Dentro desta tela há quatro "modos": escolha, abrir (navegar nas pastas), e o
 * editor em si. Eles trocam o conteúdo de `el` sem mudar a rota.
 */

import { h, preencher } from '../ui/dom.js';
import { aviso, avisarErro } from '../ui/toast.js';
import { confirmar } from '../ui/dialogos.js';
import { formatarDataHora, pluralizar } from '../ui/formato.js';
import { RAIZ } from '../core/tipos.js';
import * as armazem from '../core/storage.js';
import { novoEstado } from '../editor/documento.js';
import { Controlador } from '../editor/controlador.js';
import { Vista } from '../editor/vista.js';
import { criarFerramentas, OPCOES_PADRAO } from '../editor/ferramentas.js';
import { criarPainelPaleta } from '../editor/painel-paleta.js';
import { criarPainelQuadros } from '../editor/painel-quadros.js';
import { criarPainelIA } from '../editor/painel-ia.js';
import { criarBarraFerramentas } from '../editor/barra-ferramentas.js';
import { icone } from '../editor/icones.js';
import { dialogoNovo, dialogoSalvar, menuTransformar } from '../editor/dialogos-editor.js';
import * as arquivo from '../editor/arquivo.js';

export async function montar(el, { parametro, navegar, voltar }) {
  document.title = 'Editor · Mini Engine';
  let limpeza = () => {};

  /* ================================================================ */
  /* Modo 1: criar ou abrir                                            */
  /* ================================================================ */

  const cartao = (titulo, emoji, texto, ao) => h('button', { class: 'cartao', type: 'button', onclick: ao },
    h('span', { class: 'cartao-icone', 'aria-hidden': 'true' }, emoji),
    h('span', { class: 'cartao-titulo' }, titulo),
    h('span', { class: 'cartao-texto' }, texto));

  async function mostrarEscolha() {
    limpeza();
    limpeza = () => {};
    el.classList.remove('editor-ativo');
    const rascunho = await arquivo.lerRascunho().catch(() => null);

    preencher(el,
      h('header', { class: 'topo' },
        h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/') }, '←'),
        h('h1', {}, 'Editor de pixel art')),
      h('p', { class: 'dica' }, 'O que você quer fazer?'),
      h('div', { class: 'cartoes' },
        cartao('Criar', '✨', 'Começar um desenho novo, em branco.', criar),
        cartao('Abrir', '📂', 'Continuar um desenho salvo nas suas pastas.', () => mostrarAbrir(RAIZ)),
        rascunho && cartao('Continuar rascunho', '📝',
          `${rascunho.estado.nome || 'Sem nome'} · ${pluralizar(rascunho.estado.quadros.length, 'frame', 'frames')} · ${formatarDataHora(rascunho.em)}`,
          () => iniciarEdicao(rascunho.estado, rascunho.origem, { sujo: true }))),
      rascunho && h('div', { class: 'barra-acoes' },
        h('button', { class: 'link', type: 'button', onclick: descartarRascunho }, 'Descartar o rascunho')));
  }

  async function descartarRascunho() {
    const certo = await confirmar({
      titulo: 'Descartar o rascunho?',
      mensagem: 'As alterações que você não salvou serão perdidas. Isso não pode ser desfeito.',
      rotuloConfirmar: 'Descartar',
      perigo: true,
    });
    if (!certo) return;
    await arquivo.apagarRascunho().catch(() => {});
    await mostrarEscolha();
  }

  async function criar() {
    const dados = await dialogoNovo();
    if (dados) iniciarEdicao(novoEstado(dados), null);
  }

  async function mostrarAbrir(pastaId) {
    try {
      const [{ pastas, desenhos }, trilha] = await Promise.all([arquivo.listarPasta(pastaId), armazem.caminho(pastaId)]);
      if (trilha === null) { await mostrarAbrir(RAIZ); return; }
      const subir = () => (trilha.length > 1 ? mostrarAbrir(trilha.at(-2).id) : trilha.length === 1 ? mostrarAbrir(RAIZ) : mostrarEscolha());
      const migalha = (nome, id) => h('button', { type: 'button', onclick: () => mostrarAbrir(id) }, nome);
      const partes = [trilha.length ? migalha('Raiz', RAIZ) : h('span', { class: 'atual' }, 'Raiz')];
      trilha.forEach((m, i) => {
        partes.push(h('span', { 'aria-hidden': 'true' }, '›'));
        partes.push(i === trilha.length - 1 ? h('span', { class: 'atual' }, m.nome) : migalha(m.nome, m.id));
      });

      const linhasPastas = pastas.map((p) => h('li', { class: 'linha pasta' },
        h('button', { class: 'linha-principal', type: 'button', onclick: () => mostrarAbrir(p.id) },
          h('span', { class: 'linha-icone', 'aria-hidden': 'true' }, '📁'),
          h('span', { class: 'linha-textos' }, h('span', { class: 'linha-nome' }, p.nome)))));
      const linhasDesenhos = desenhos.map((d) => {
        const medida = d.largura ? `${d.largura}×${d.altura} · ` : '';
        return h('li', { class: 'linha' },
          h('button', { class: 'linha-principal', type: 'button', onclick: () => carregar(d) },
            h('span', { class: 'linha-icone', 'aria-hidden': 'true' }, '🎨'),
            h('span', { class: 'linha-textos' },
              h('span', { class: 'linha-nome' }, d.base),
              h('span', { class: 'linha-meta' }, `${medida}${pluralizar(d.quadros, 'frame', 'frames')} · editado ${formatarDataHora(d.atualizadoEm)}`))));
      });

      preencher(el,
        h('header', { class: 'topo' },
          h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: subir }, '←'),
          h('h1', {}, 'Abrir desenho')),
        h('nav', { class: 'migalhas', 'aria-label': 'Caminho' }, partes),
        (linhasPastas.length || linhasDesenhos.length)
          ? h('ul', { class: 'lista' }, linhasPastas, linhasDesenhos)
          : h('div', { class: 'vazio' },
            h('p', {}, 'Nenhum desenho nesta pasta.'),
            h('p', { class: 'dica' }, 'Os desenhos aparecem aqui depois de salvos. Cada frame é um arquivo (nome_01, nome_02…), mas a cadeia abre junta.')));
    } catch (erro) {
      avisarErro(erro);
      await mostrarEscolha();
    }
  }

  async function carregar(grupo) {
    try {
      const { estado, origem, ignorados } = await arquivo.abrirDesenho(grupo);
      if (ignorados.length) {
        aviso(`${pluralizar(ignorados.length, 'arquivo tem', 'arquivos têm')} tamanho diferente e ficou de fora: ${ignorados.join(', ')}.`, { tipo: 'erro', duracao: 8000 });
      }
      iniciarEdicao(estado, origem);
    } catch (erro) {
      avisarErro(erro);
    }
  }

  /* ================================================================ */
  /* Modo 2: o editor                                                  */
  /* ================================================================ */

  function iniciarEdicao(estado, origem, { sujo = false } = {}) {
    limpeza();
    const ctl = new Controlador(estado, origem);
    if (sujo) ctl.sujo = true;
    const op = { ...OPCOES_PADRAO };
    const ferramentas = criarFerramentas();
    let ferr = ferramentas[0];
    let corIndice = Math.min(1, estado.paleta.length - 1);
    let vista = null;
    let barra = null;
    let paleta = null;

    const ctx = {
      ctl, op,
      get vista() { return vista; },
      indiceCor: () => corIndice,
      definirCor: (i) => { corIndice = i; paleta.atualizar(); atualizarAbaCor(); },
    };

    /* ---------- topo ---------- */
    const titulo = h('h1', { class: 'editor-titulo' });
    const botaoDesfazer = h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Desfazer', title: 'Desfazer (Ctrl+Z)', onclick: () => ctl.desfazer() }, icone('desfazer', 20));
    const botaoRefazer = h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Refazer', title: 'Refazer (Ctrl+Y)', onclick: () => ctl.refazer() }, icone('refazer', 20));
    const botaoTransformar = h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Transformar (espelhar, girar)', title: 'Espelhar, girar, limpar', onclick: () => menuTransformar(ctl, vista) }, icone('transformar', 20));
    const botaoSalvar = h('button', { class: 'botao primario', type: 'button', title: 'Salvar (Ctrl+S)', onclick: () => salvar() }, icone('salvar', 18), h('span', { class: 'rotulo' }, 'Salvar'));
    const topo = h('header', { class: 'editor-topo' },
      h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Sair do editor', onclick: () => sair() }, icone('voltar', 20)),
      titulo, botaoDesfazer, botaoRefazer, botaoTransformar, botaoSalvar);

    function atualizarTopo() {
      preencher(titulo,
        h('span', { class: 'editor-nome' }, ctl.e.nome || 'Sem nome'),
        h('small', {}, ` ${ctl.largura}×${ctl.altura}`),
        ctl.sujo && h('span', { class: 'ponto-sujo', title: 'Alterações não salvas', role: 'img', 'aria-label': 'Alterações não salvas' }, '●'));
      botaoDesfazer.disabled = !ctl.podeDesfazer;
      botaoRefazer.disabled = !ctl.podeRefazer;
    }

    /* ---------- painéis ---------- */
    const quadros = criarPainelQuadros(ctl);
    paleta = criarPainelPaleta(ctl, {
      obter: () => corIndice,
      definir: (i) => { corIndice = i; atualizarAbaCor(); },
    });
    const ia = criarPainelIA();

    const abaCor = h('span', { class: 'aba-cor' });
    function atualizarAbaCor() {
      abaCor.style.background = corIndice === 0 ? 'transparent' : ctl.e.paleta[corIndice];
      abaCor.classList.toggle('transparente', corIndice === 0);
    }

    const aberturaInicial = window.matchMedia('(min-width: 900px)').matches;
    const gaveta = (lado, rotulo, conteudoAba, corpoEl, aberta) => {
      const raiz = h('aside', { class: `gaveta ${lado}${aberta ? ' aberta' : ''}`, 'aria-label': rotulo });
      const aba = h('button', {
        class: 'gaveta-aba', type: 'button', 'aria-expanded': String(aberta),
        onclick: () => {
          const agora = raiz.classList.toggle('aberta');
          aba.setAttribute('aria-expanded', String(agora));
        },
      }, conteudoAba, h('span', { class: 'aba-texto' }, rotulo));
      const corpo = h('div', { class: 'gaveta-corpo' }, corpoEl);
      adicionarFilhos(raiz, lado === 'esquerda' ? [corpo, aba] : [aba, corpo]);
      return raiz;
    };

    /* ---------- canvas ---------- */
    const areaCanvas = h('div', { class: 'editor-canvas' });
    const status = h('span', { class: 'status', 'aria-live': 'off' });
    vista = new Vista(areaCanvas, ctl, {
      atual: () => ferr,
      contexto: () => ctx,
    });
    vista.canvas.dataset.ferramenta = ferr.id;
    vista.aoDesenhar = () => {
      const p = vista.hover;
      status.textContent = `${p && p.x >= 0 && p.y >= 0 && p.x < ctl.largura && p.y < ctl.altura ? `${p.x}, ${p.y}  ·  ` : ''}${Math.round(vista.zoom * 100)}%`;
    };
    vista.aoFimDoToque = () => barra.atualizarOpcoes();
    const botaoZoom = (rotulo, texto, ao) => h('button', { class: 'botao icone pequeno', type: 'button', 'aria-label': rotulo, title: rotulo, onclick: ao }, texto);
    adicionarFilhos(areaCanvas, [
      h('div', { class: 'zoom-botoes' },
        botaoZoom('Aproximar', '＋', () => vista.zoomMais()),
        botaoZoom('Afastar', '－', () => vista.zoomMenos()),
        botaoZoom('Ajustar à tela', '⤢', () => vista.ajustar())),
      status,
    ]);

    /* ---------- barra de ferramentas ---------- */
    function escolher(id) {
      const nova = ferramentas.find((f) => f.id === id);
      if (!nova || nova === ferr) return;
      vista.cancelarTudo();
      ferr = nova;
      if (ferr.id !== 'selecao' && ferr.id !== 'mao') vista.selecao = null;
      vista.canvas.dataset.ferramenta = ferr.id;
      barra.atualizar();
      vista.desenhar();
    }
    barra = criarBarraFerramentas(ferramentas, op, { atual: () => ferr, escolher }, {
      contexto: () => ctx,
      alternadores: [
        { rotulo: 'Grade', icone: 'grade', ativo: () => vista.grade, alternar: () => { vista.grade = !vista.grade; vista.desenhar(); } },
        { rotulo: 'Cebola', icone: 'cebola', ativo: () => vista.cebola, alternar: () => { vista.cebola = !vista.cebola; vista.desenhar(); } },
      ],
    });

    /* ---------- montagem ---------- */
    el.classList.add('editor-ativo');
    const meio = h('div', { class: 'editor-meio' },
      gaveta('esquerda', 'Cores', abaCor, paleta.el, aberturaInicial),
      areaCanvas,
      gaveta('direita', 'Chamar IA', icone('estrela', 18), ia.el, false));
    preencher(el, h('div', { class: 'editor' }, topo, quadros.el, meio, barra.el));

    /* ---------- reações a mudanças ---------- */
    let medidas = `${ctl.largura}x${ctl.altura}`;
    ctl.on('mudou', (f) => {
      const agora = `${ctl.largura}x${ctl.altura}`;
      if (agora !== medidas) { medidas = agora; vista.ajustar(); } else vista.desenhar();
      quadros.atualizar();
      if (f.paleta || f.tudo) { paleta.atualizar(); atualizarAbaCor(); }
      atualizarTopo();
    });

    let relogioRascunho = 0;
    const guardarRascunho = () => {
      if (ctl.sujo) arquivo.guardarRascunho(ctl.e, ctl.origem).catch(() => {});
    };
    ctl.on('sujo', (estaSujo) => {
      atualizarTopo();
      if (estaSujo) { clearTimeout(relogioRascunho); relogioRascunho = setTimeout(guardarRascunho, 1200); }
    });

    atualizarTopo();
    atualizarAbaCor();
    paleta.atualizar();
    quadros.atualizar();
    vista.aoDesenhar();
    vista.ajustar();

    /* ---------- salvar e sair ---------- */
    async function salvar() {
      if (ctl.trabalho) return;
      const r = await dialogoSalvar(ctl);
      if (!r) return;
      ctl.origem = r.origem;
      ctl.e.nome = r.origem.base;
      clearTimeout(relogioRascunho);
      ctl.marcarSalvo();
      await arquivo.apagarRascunho().catch(() => {});
      atualizarTopo();
      const n = r.itens.length;
      const lista = n === 1 ? r.itens[0].nome : `${r.itens[0].nome} … ${r.itens[n - 1].nome}`;
      const lixo = r.paraLixeira ? ` ${pluralizar(r.paraLixeira, 'frame antigo foi', 'frames antigos foram')} para a lixeira.` : '';
      aviso(`${n === 1 ? 'Salvo' : `Salvos ${n} arquivos`}: ${lista} — ${r.pastaTexto}.${lixo}`, {
        tipo: 'ok',
        duracao: 7000,
        acao: { rotulo: 'Ver pasta', ao: () => navegar(r.pastaId === RAIZ ? '/gerenciador' : `/gerenciador/${r.pastaId}`) },
      });
    }

    async function sair() {
      if (ctl.sujo) {
        const certo = await confirmar({
          titulo: 'Sair do editor?',
          mensagem: 'Há alterações não salvas. Elas ficam guardadas como rascunho e você pode continuar depois, pela tela do editor.',
          rotuloConfirmar: 'Sair e guardar rascunho',
        });
        if (!certo) return;
      }
      voltar('/');
    }

    /* ---------- teclado ---------- */
    function aoTecla(ev) {
      if (document.querySelector('dialog[open]')) return;
      const alvo = ev.target;
      if (alvo.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const tecla = ev.key.toLowerCase();
      if (ev.ctrlKey || ev.metaKey) {
        if (tecla === 'z') { ev.preventDefault(); if (ev.shiftKey) ctl.refazer(); else ctl.desfazer(); }
        else if (tecla === 'y') { ev.preventDefault(); ctl.refazer(); }
        else if (tecla === 's') { ev.preventDefault(); salvar(); }
        return;
      }
      if (ev.altKey) return;
      // Espaço = mover a vista. Vale com o mouse sobre o desenho (mesmo se um botão ficou com o foco);
      // quem navega por Tab até um botão continua usando o Espaço para acioná-lo.
      if (tecla === ' ' && (alvo === document.body || alvo === vista.canvas || vista.canvas.matches(':hover'))) {
        ev.preventDefault();
        vista.espaco = true;
        vista.canvas.classList.add('mao-livre');
        return;
      }
      const ferramenta = ferramentas.find((f) => f.atalho === tecla);
      if (ferramenta) { escolher(ferramenta.id); return; }
      if (tecla === 'g') { vista.grade = !vista.grade; barra.atualizarOpcoes(); vista.desenhar(); }
      else if (tecla === 'u') { vista.cebola = !vista.cebola; barra.atualizarOpcoes(); vista.desenhar(); }
      else if (tecla === '[') { op.tamanho = Math.max(1, op.tamanho - 1); barra.atualizarOpcoes(); }
      else if (tecla === ']') { op.tamanho = Math.min(4, op.tamanho + 1); barra.atualizarOpcoes(); }
      else if (tecla === '+' || tecla === '=') vista.zoomMais();
      else if (tecla === '-') vista.zoomMenos();
      else if ((tecla === 'delete' || tecla === 'backspace') && vista.selecao) {
        ev.preventDefault();
        ctl.limparRegiao(vista.selecao);
        barra.atualizarOpcoes();
      } else if (tecla === 'escape' && vista.selecao) { vista.selecao = null; barra.atualizarOpcoes(); vista.desenhar(); }
    }
    function aoSoltarTecla(ev) {
      if (ev.key === ' ' && vista.espaco) {
        ev.preventDefault(); // não deixa o Espaço "clicar" no botão que tinha o foco
        vista.espaco = false;
        vista.canvas.classList.remove('mao-livre');
      }
    }
    function aoFechar(ev) {
      if (ctl.sujo) { guardarRascunho(); ev.preventDefault(); ev.returnValue = ''; }
    }
    document.addEventListener('keydown', aoTecla);
    document.addEventListener('keyup', aoSoltarTecla);
    window.addEventListener('beforeunload', aoFechar);

    limpeza = () => {
      clearTimeout(relogioRascunho);
      if (ctl.sujo) {
        guardarRascunho();
        aviso('Alterações não salvas ficaram guardadas como rascunho. Continue pela tela do editor.', { duracao: 6000 });
      }
      document.removeEventListener('keydown', aoTecla);
      document.removeEventListener('keyup', aoSoltarTecla);
      window.removeEventListener('beforeunload', aoFechar);
      quadros.destruir();
      vista.destruir();
      el.classList.remove('editor-ativo');
    };
  }

  /* ================================================================ */
  /* Entrada                                                           */
  /* ================================================================ */

  if (parametro) {
    try {
      const { estado, origem, ignorados } = await arquivo.abrirPorItem(parametro);
      if (ignorados.length) aviso(`Ficaram de fora por tamanho diferente: ${ignorados.join(', ')}.`, { tipo: 'erro', duracao: 8000 });
      iniciarEdicao(estado, origem);
    } catch (erro) {
      avisarErro(erro);
      await mostrarEscolha();
    }
  } else {
    await mostrarEscolha();
  }

  return () => limpeza();
}

/** Acrescenta uma lista de nós a um elemento. */
function adicionarFilhos(pai, filhos) {
  for (const f of filhos) pai.append(f);
}
