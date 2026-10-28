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
import { confirmar, menuAcoes, abrirDialogo } from '../ui/dialogos.js';
import { formatarDataHora, pluralizar } from '../ui/formato.js';
import { RAIZ } from '../core/tipos.js';
import * as armazem from '../core/storage.js';
import { novoEstado, corMaisProxima, rgbParaHex } from '../editor/documento.js';
import { Controlador } from '../editor/controlador.js';
import { Vista } from '../editor/vista.js';
import { criarFerramentas, OPCOES_PADRAO, TAMANHO_PINCEL_MAX } from '../editor/ferramentas.js';
import { criarPainelPaleta } from '../editor/painel-paleta.js';
import { criarPainelQuadros } from '../editor/painel-quadros.js';
import { criarPainelIA } from '../editor/painel-ia.js';
import { criarPainelReferencia } from '../editor/referencia.js';
import { criarBarraFerramentas } from '../editor/barra-ferramentas.js';
import { icone } from '../editor/icones.js';
import { dialogoNovo, dialogoSalvar, menuTransformar } from '../editor/dialogos-editor.js';
import { dialogoExportar, importarArquivo } from '../editor/dialogos-arquivo.js';
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
    const rascunhos = await arquivo.lerRascunhos().catch(() => []);

    preencher(el,
      h('header', { class: 'topo' },
        h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/') }, '←'),
        h('h1', {}, 'Editor de pixel art')),
      h('p', { class: 'dica' }, 'O que você quer fazer?'),
      h('div', { class: 'cartoes' },
        cartao('Criar', '✨', 'Começar um desenho novo, em branco.', criar),
        cartao('Abrir', '📂', 'Continuar um desenho salvo nas suas pastas.', () => mostrarAbrir(RAIZ)),
        cartao('Importar', '📥', 'Trazer uma imagem PNG ou um arquivo JSON de fora.', importarNaEscolha),
        rascunhos.map((r) => cartao('Continuar rascunho', '📝',
          `${r.estado.nome || 'Sem nome'} · ${pluralizar(r.estado.quadros.length, 'frame', 'frames')} · ${formatarDataHora(r.em)}`,
          () => iniciarEdicao(r.estado, r.origem, { sujo: true, referencia: r.referencia ?? null, rascunhoId: r.id })))),
      rascunhos.length > 0 && h('div', { class: 'barra-acoes quebra' },
        rascunhos.map((r) => h('button', {
          class: 'link', type: 'button', onclick: () => descartarRascunho(r.id),
        }, rascunhos.length > 1 ? `Descartar o rascunho “${r.estado.nome || 'Sem nome'}”` : 'Descartar o rascunho'))));
  }

  async function descartarRascunho(id) {
    const certo = await confirmar({
      titulo: 'Descartar o rascunho?',
      mensagem: 'As alterações que você não salvou serão perdidas. Isso não pode ser desfeito.',
      rotuloConfirmar: 'Descartar',
      perigo: true,
    });
    if (!certo) return;
    await arquivo.apagarRascunho(id).catch(() => {});
    await mostrarEscolha();
  }

  async function importarNaEscolha() {
    const r = await importarArquivo({ ctl: null });
    if (r?.tipo === 'desenho') iniciarEdicao(r.estado, null, { sujo: true, referencia: r.referencia });
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
      const { estado, origem, ignorados, referencia } = await arquivo.abrirDesenho(grupo);
      if (ignorados.length) {
        aviso(`${pluralizar(ignorados.length, 'arquivo tem', 'arquivos têm')} tamanho diferente e ficou de fora: ${ignorados.join(', ')}.`, { tipo: 'erro', duracao: 8000 });
      }
      iniciarEdicao(estado, origem, { referencia });
    } catch (erro) {
      avisarErro(erro);
    }
  }

  /* ================================================================ */
  /* Modo 2: o editor                                                  */
  /* ================================================================ */

  function iniciarEdicao(estado, origem, { sujo = false, referencia = null, rascunhoId = null } = {}) {
    limpeza();
    const idRascunho = rascunhoId || armazem.novoId();
    let descartado = false; // "Descartar" no Novo: não guarda rascunho ao sair
    const ctl = new Controlador(estado, origem, referencia);
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
    const botaoTransformar = h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Transformar (espelhar, girar, tom, neve)', title: 'Espelhar, girar, mudar o tom, neve, limpar', onclick: () => menuTransformar(ctl, vista) }, icone('transformar', 20));
    const botaoArquivo = h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Exportar e importar', title: 'Exportar e importar', onclick: () => menuArquivo() }, icone('baixar', 20));
    const botaoNovo = h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Novo desenho', title: 'Novo desenho', onclick: () => novoDesenho() }, '＋');
    const botaoSalvar = h('button', { class: 'botao primario', type: 'button', 'aria-label': 'Salvar', title: 'Salvar (Ctrl+S)', onclick: () => salvar() }, icone('salvar', 18), h('span', { class: 'rotulo' }, 'Salvar'));
    const topo = h('header', { class: 'editor-topo' },
      h('button', { class: 'botao icone', type: 'button', 'aria-label': 'Sair do editor', onclick: () => sair() }, icone('voltar', 20)),
      titulo, botaoDesfazer, botaoRefazer, botaoTransformar, botaoArquivo, botaoNovo, botaoSalvar);

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

    /* imagem de inspiração: painel ao lado do desenho; tocar nela pega a cor */
    const pontoRef = h('span', { class: 'aba-ponto', hidden: !ctl.referencia, title: 'Este desenho tem uma imagem de inspiração' });
    const abaRef = h('button', {
      class: 'gaveta-aba aba-ref', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Imagem de inspiração',
      onclick: () => painelRef.alternar(),
    }, icone('imagem', 18), h('span', { class: 'aba-texto' }, 'Inspiração'), pontoRef);
    function pegarCorDaReferencia(rgba) {
      if (rgba[3] < 128) {
        ctx.definirCor(0);
        aviso('Esse pixel é transparente: escolhi a cor transparente (apaga).');
        return;
      }
      const hex = rgbParaHex(rgba[0], rgba[1], rgba[2]);
      let i = ctl.e.paleta.indexOf(hex);
      if (i > 0) { ctx.definirCor(i); return; }
      try {
        i = ctl.adicionarCor(hex);
        aviso(`Cor ${hex} adicionada à paleta.`);
      } catch {
        i = corMaisProxima(hex, ctl.e.paleta);
        aviso(`A paleta está cheia: usei a cor mais parecida (${ctl.e.paleta[i]}). Apague uma cor que não usa para ter ${hex}.`, { duracao: 6000 });
      }
      ctx.definirCor(i);
    }
    const painelRef = criarPainelReferencia(ctl, {
      aoPegarCor: pegarCorDaReferencia,
      aoMudarAbertura: (aberta) => abaRef.setAttribute('aria-pressed', String(aberta)),
    });
    ctl.on('referencia', (r) => { pontoRef.hidden = !r; });

    const abaCor = h('span', { class: 'aba-cor' });
    function atualizarAbaCor() {
      abaCor.style.background = corIndice === 0 ? 'transparent' : ctl.e.paleta[corIndice];
      abaCor.classList.toggle('transparente', corIndice === 0);
    }

    const aberturaInicial = window.matchMedia('(min-width: 900px)').matches;
    const gaveta = (lado, rotulo, conteudoAba, corpoEl, aberta, abasExtras = []) => {
      const raiz = h('aside', { class: `gaveta ${lado}${aberta ? ' aberta' : ''}`, 'aria-label': rotulo });
      const aba = h('button', {
        class: 'gaveta-aba', type: 'button', 'aria-expanded': String(aberta),
        onclick: () => {
          const agora = raiz.classList.toggle('aberta');
          aba.setAttribute('aria-expanded', String(agora));
        },
      }, conteudoAba, h('span', { class: 'aba-texto' }, rotulo));
      const corpo = h('div', { class: 'gaveta-corpo' }, corpoEl);
      adicionarFilhos(raiz, lado === 'esquerda' ? [corpo, aba] : [h('div', { class: 'gaveta-abas' }, aba, ...abasExtras), corpo]);
      return raiz;
    };

    /* ---------- canvas ---------- */
    const areaCanvas = h('div', { class: 'editor-canvas' });
    const status = h('span', { class: 'status', 'aria-live': 'off' });
    // o contorno sob o mouse mostra o tamanho do pincel/borracha (só nas ferramentas que têm tamanho)
    const tamanhoDoContorno = () => (ferr.opcoes?.includes('tamanho') && !ferr.id.match(/linha|retangulo|elipse/) ? op.tamanho : 1);
    vista = new Vista(areaCanvas, ctl, {
      atual: () => ferr,
      contexto: () => ctx,
    });
    vista.canvas.dataset.ferramenta = ferr.id;
    vista.tamanhoDoContorno = tamanhoDoContorno;
    vista.aoDesenhar = () => {
      const p = vista.hover;
      status.textContent = `${ctl.largura}×${ctl.altura}  ·  ${p && p.x >= 0 && p.y >= 0 && p.x < ctl.largura && p.y < ctl.altura ? `${p.x}, ${p.y}  ·  ` : ''}${Math.round(vista.zoom * 100)}%`;
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
      aoMudarTamanho: () => vista.desenhar(),
      alternadores: [
        { rotulo: 'Grade', icone: 'grade', ativo: () => vista.grade, alternar: () => { vista.grade = !vista.grade; vista.desenhar(); } },
        { rotulo: 'Cebola', icone: 'cebola', ativo: () => vista.cebola, alternar: () => { vista.cebola = !vista.cebola; vista.desenhar(); } },
      ],
    });

    /* ---------- montagem ---------- */
    el.classList.add('editor-ativo');
    const centro = h('div', { class: 'editor-centro' }, painelRef.el, areaCanvas);
    const meio = h('div', { class: 'editor-meio' },
      gaveta('esquerda', 'Cores', abaCor, paleta.el, aberturaInicial),
      centro,
      gaveta('direita', 'Chamar IA', icone('estrela', 18), ia.el, false, [abaRef]));
    preencher(el, h('div', { class: 'editor' }, topo, quadros.el, meio, barra.el));
    if (ctl.referencia) painelRef.abrir(); // projeto com imagem de inspiração: já aparece ao abrir

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
      if (ctl.sujo && !descartado) arquivo.guardarRascunho(idRascunho, ctl.e, ctl.origem, ctl.referencia).catch(() => {});
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
      if (ctl.trabalho) return false;
      const r = await dialogoSalvar(ctl);
      if (!r) return false;
      ctl.origem = r.origem;
      ctl.e.nome = r.origem.base;
      clearTimeout(relogioRascunho);
      ctl.marcarSalvo();
      await arquivo.apagarRascunho(idRascunho).catch(() => {});
      atualizarTopo();
      const n = r.itens.length;
      const lista = n === 1 ? r.itens[0].nome : `${r.itens[0].nome} … ${r.itens[n - 1].nome}`;
      const lixo = r.paraLixeira ? ` ${pluralizar(r.paraLixeira, 'frame antigo foi', 'frames antigos foram')} para a lixeira.` : '';
      aviso(`${n === 1 ? 'Salvo' : `Salvos ${n} arquivos`}: ${lista} — ${r.pastaTexto}.${lixo}`, {
        tipo: 'ok',
        duracao: 7000,
        acao: { rotulo: 'Ver pasta', ao: () => navegar(r.pastaId === RAIZ ? '/gerenciador' : `/gerenciador/${r.pastaId}`) },
      });
      return true;
    }

    /* ---------- novo desenho (sem sair do editor) ---------- */
    async function novoDesenho() {
      if (ctl.trabalho) return;
      if (ctl.sujo) {
        const escolha = await abrirDialogo(({ fechar }) => [
          h('h2', { class: 'dialogo-titulo' }, 'Começar um desenho novo?'),
          h('p', { class: 'dialogo-texto' }, `“${ctl.e.nome || 'Sem nome'}” tem alterações que ainda não foram salvas. O que fazer com elas?`),
          h('div', { class: 'menu-acoes' },
            h('button', { class: 'menu-item', type: 'button', 'data-foco': '', onclick: () => fechar('salvar') },
              h('span', { class: 'menu-icone' }, '💾'), h('span', { class: 'menu-rotulo' }, 'Salvar agora'), h('small', { class: 'menu-nota' }, 'guarda nas pastas, como o botão Salvar')),
            h('button', { class: 'menu-item', type: 'button', onclick: () => fechar('rascunho') },
              h('span', { class: 'menu-icone' }, '📝'), h('span', { class: 'menu-rotulo' }, 'Guardar como rascunho'), h('small', { class: 'menu-nota' }, 'continue depois pela tela do editor')),
            h('button', { class: 'menu-item perigo', type: 'button', onclick: () => fechar('descartar') },
              h('span', { class: 'menu-icone' }, '🗑'), h('span', { class: 'menu-rotulo' }, 'Descartar as alterações'), h('small', { class: 'menu-nota' }, 'não tem volta'))),
          h('button', { class: 'botao largo', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
        ]);
        if (!escolha) return;
        if (escolha === 'salvar' && !(await salvar())) return;
        if (escolha === 'rascunho') {
          clearTimeout(relogioRascunho);
          await arquivo.guardarRascunho(idRascunho, ctl.e, ctl.origem, ctl.referencia).catch(() => {});
        }
        if (escolha === 'descartar') {
          descartado = true;
          clearTimeout(relogioRascunho);
          await arquivo.apagarRascunho(idRascunho).catch(() => {});
        }
      }
      const dados = await dialogoNovo();
      if (!dados) { descartado = false; return; }
      const guardou = ctl.sujo && !descartado;
      descartado = true; // o rascunho (se havia) já foi tratado acima: a limpeza não repete
      iniciarEdicao(novoEstado(dados), null);
      if (guardou) aviso('O desenho anterior ficou guardado como rascunho. Continue depois pela tela do editor.', { duracao: 6000 });
    }

    /* ---------- exportar e importar ---------- */
    function menuArquivo() {
      return menuAcoes({
        titulo: 'Exportar e importar',
        subtitulo: 'Leve o desenho para fora do app ou traga arquivos de fora',
        acoes: [
          { icone: '⬇', rotulo: 'Exportar…', nota: 'PNG, GIF, sprite sheet, ZIP, JSON', ao: () => dialogoExportar(ctl) },
          { icone: '⬆', rotulo: 'Importar…', nota: 'imagem PNG ou arquivo JSON', ao: () => importar() },
        ],
      });
    }

    async function importar() {
      const r = await importarArquivo({ ctl });
      if (!r) return;
      if (r.tipo === 'paleta') {
        const n = ctl.adicionarCores(r.cores);
        aviso(`${pluralizar(n, 'cor entrou', 'cores entraram')} na paleta.${r.info.cortadas ? ` ${pluralizar(r.info.cortadas, 'ficou', 'ficaram')} de fora (paleta cheia).` : ''}`, { tipo: 'ok' });
        return;
      }
      if (ctl.sujo) {
        const certo = await confirmar({
          titulo: 'Abrir o desenho importado?',
          mensagem: 'O desenho que está aberto tem alterações não salvas. Salve antes se não quiser perdê-las.',
          rotuloConfirmar: 'Abrir sem salvar',
          perigo: true,
        });
        if (!certo) return;
      }
      iniciarEdicao(r.estado, null, { sujo: true, referencia: r.referencia });
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
        else if (tecla === '+' || tecla === '=') { ev.preventDefault(); mudarTamanho(+1); }  // Ctrl + : pincel/borracha maior
        else if (tecla === '-' || tecla === '_') { ev.preventDefault(); mudarTamanho(-1); }  // Ctrl - : menor
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
      else if (tecla === '[') mudarTamanho(-1);
      else if (tecla === ']') mudarTamanho(+1);
      else if (tecla === '+' || tecla === '=') vista.zoomMais();
      else if (tecla === '-') vista.zoomMenos();
      else if ((tecla === 'delete' || tecla === 'backspace') && vista.selecao) {
        ev.preventDefault();
        ctl.limparRegiao(vista.selecao);
        barra.atualizarOpcoes();
      } else if (tecla === 'escape' && vista.selecao) { vista.selecao = null; barra.atualizarOpcoes(); vista.desenhar(); }
    }
    function mudarTamanho(d) {
      const novo = Math.max(1, Math.min(TAMANHO_PINCEL_MAX, op.tamanho + d));
      if (novo === op.tamanho) return;
      op.tamanho = novo;
      barra.atualizarOpcoes();
      vista.desenhar();
      aviso(`Tamanho do ${ferr.id === 'borracha' ? 'apagador' : 'pincel'}: ${novo}×${novo}`, { duracao: 1200 });
    }
    function aoSoltarTecla(ev) {
      if (ev.key === ' ' && vista.espaco) {
        ev.preventDefault(); // não deixa o Espaço "clicar" no botão que tinha o foco
        vista.espaco = false;
        vista.canvas.classList.remove('mao-livre');
      }
    }
    function aoFechar(ev) {
      if (ctl.sujo && !descartado) { guardarRascunho(); ev.preventDefault(); ev.returnValue = ''; }
    }
    document.addEventListener('keydown', aoTecla);
    document.addEventListener('keyup', aoSoltarTecla);
    window.addEventListener('beforeunload', aoFechar);

    limpeza = () => {
      clearTimeout(relogioRascunho);
      if (ctl.sujo && !descartado) {
        guardarRascunho();
        aviso('Alterações não salvas ficaram guardadas como rascunho. Continue pela tela do editor.', { duracao: 6000 });
      }
      document.removeEventListener('keydown', aoTecla);
      document.removeEventListener('keyup', aoSoltarTecla);
      window.removeEventListener('beforeunload', aoFechar);
      quadros.destruir();
      painelRef.destruir();
      vista.destruir();
      el.classList.remove('editor-ativo');
    };
  }

  /* ================================================================ */
  /* Entrada                                                           */
  /* ================================================================ */

  if (parametro) {
    try {
      const { estado, origem, ignorados, referencia } = await arquivo.abrirPorItem(parametro);
      if (ignorados.length) aviso(`Ficaram de fora por tamanho diferente: ${ignorados.join(', ')}.`, { tipo: 'erro', duracao: 8000 });
      iniciarEdicao(estado, origem, { referencia });
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
