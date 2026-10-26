/**
 * jogo.js (tela) — "Criar jogo".
 *
 * Rotas:
 *   #/jogo        lista de projetos (cada projeto é um jogo) + "＋ Adicionar novo projeto"
 *   #/jogo/<id>   o projeto: chat com a IA à esquerda, área de teste à direita
 *                 (no celular: abas Chat | Jogo | Código)
 *
 * Aqui não se altera sprite nem cenário: a IA só os USA (chamados com @). Quando falta algo,
 * ela anota em "pendências".
 */

import { h, preencher } from '../ui/dom.js';
import { aviso, avisarErro, mensagemDeErro } from '../ui/toast.js';
import { abrirDialogo, confirmar } from '../ui/dialogos.js';
import { formatarDataHora } from '../ui/formato.js';
import { conversar, temAlgumaChave, modeloEscolhido, lerChave } from '../core/ia.js';
import {
  listarProjetos, criarProjeto, abrirProjeto, salvarProjeto, conversaAtual, novaConversa,
  aplicarArquivos, desfazerAte, temJogo, novoIdCurto,
} from '../jogo/projeto.js';
import { montarIndice, extrairMencoes, resolverMencoes, sugerir } from '../jogo/mencoes.js';
import { montarAssets, descreverAssets } from '../jogo/assets.js';
import { montarPedido, lerResposta, mensagemDeErro as pedidoDeCorrecao } from '../jogo/conversa.js';
import { criarPalco, ordemDosScripts } from '../jogo/palco.js';
import { dialogoModelo, rotuloDoModelo } from '../jogo/dialogo-modelo.js';
import { excluirComDesfazer, cartaoComExcluir } from '../ui/excluir-item.js';

const MAX_CORRECOES = 3;
const ESPERA_ERROS_MS = 3500;
const LADO_CAPA = 256;
const TEXTO_BLOQUEADO = 'Ainda não há jogo. Descreva no chat o que você quer criar: ele aparece aqui para você testar.';

export function montar(el, args) {
  return args.parametro ? montarProjeto(el, args) : montarLista(el, args);
}

/* ================================================================== */
/* Lista de projetos                                                    */
/* ================================================================== */

async function montarLista(el, { navegar, voltar }) {
  document.title = 'Criar jogo · Mini Engine';
  const grade = h('div', { class: 'projetos' });
  el.append(
    h('header', { class: 'topo' },
      h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/') }, '←'),
      h('h1', {}, 'Criar jogo')),
    h('p', { class: 'dica' }, 'Cada projeto é um jogo diferente. Converse com a IA para criar a lógica, as regras e a história, usando os seus sprites, e teste ao vivo.'),
    grade);

  async function desenhar() {
    let projetos = [];
    try { projetos = await listarProjetos(); } catch (x) { avisarErro(x); }
    preencher(grade, [
      h('button', { class: 'projeto-cartao novo', type: 'button', onclick: () => novo() },
        h('span', { class: 'projeto-mais', 'aria-hidden': 'true' }, '＋'),
        h('span', { class: 'projeto-nome' }, 'Adicionar novo projeto')),
      ...await Promise.all(projetos.map(async (p) => {
        const completo = await abrirProjeto(p.id).catch(() => null);
        const capa = completo?.projeto.capa;
        return cartaoComExcluir(h('button', { class: 'projeto-cartao', type: 'button', onclick: () => navegar(`/jogo/${p.id}`) },
          capa ? h('img', { class: 'projeto-capa', src: capa, alt: '' }) : h('span', { class: 'projeto-capa vazia', 'aria-hidden': 'true' }, '🎮'),
          h('span', { class: 'projeto-nome' }, p.nome),
          h('small', { class: 'projeto-info' }, `${p.resumo?.descricao || ''} · ${formatarDataHora(p.atualizadoEm)}`)),
        { rotulo: `o projeto ${p.nome}`, ao: () => excluirComDesfazer(p, { rotulo: 'o projeto', aoMudar: desenhar }) });
      })),
    ]);
  }

  async function novo() {
    const r = await dialogoNovoProjeto();
    if (!r) return;
    try {
      const item = await criarProjeto(r.nome, r.capa);
      navegar(`/jogo/${item.id}`);
    } catch (x) { avisarErro(x); }
  }

  const aoSincronizar = (e) => { if (e.detail?.mudou) desenhar(); };
  globalThis.addEventListener('miniengine:nuvem', aoSincronizar);
  await desenhar();
  return () => globalThis.removeEventListener('miniengine:nuvem', aoSincronizar);
}

/** Reduz a imagem escolhida para a capa (até 256 px). */
async function prepararCapa(arquivo) {
  if (!arquivo || !/^image\//.test(arquivo.type)) throw new Error('Escolha um arquivo de imagem (PNG, JPG, WebP ou GIF).');
  const bmp = await createImageBitmap(arquivo).catch(() => { throw new Error('Não consegui abrir essa imagem.'); });
  const escala = Math.min(1, LADO_CAPA / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * escala));
  const hh = Math.max(1, Math.round(bmp.height * escala));
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = escala < 0.5;
  ctx.drawImage(bmp, 0, 0, w, hh);
  bmp.close?.();
  const png = c.toDataURL('image/png');
  const jpg = c.toDataURL('image/jpeg', 0.88);
  return png.length <= 120_000 || png.length <= jpg.length ? png : jpg;
}

function dialogoNovoProjeto() {
  let capa = null;
  return abrirDialogo(({ fechar }) => {
    const nome = h('input', { class: 'campo', id: 'projeto-nome', type: 'text', maxLength: 60, autocomplete: 'off', placeholder: 'ex.: Aventura na floresta', 'data-foco': '' });
    const entrada = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const previa = h('div', { class: 'projeto-previa' }, h('span', { 'aria-hidden': 'true' }, '🖼️'), h('small', {}, 'nenhuma imagem'));
    const erro = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
    entrada.addEventListener('change', async () => {
      const arq = entrada.files?.[0];
      entrada.value = '';
      if (!arq) return;
      try {
        capa = await prepararCapa(arq);
        preencher(previa, h('img', { src: capa, alt: 'Imagem do projeto' }));
        erro.hidden = true;
      } catch (x) { erro.textContent = x.message; erro.hidden = false; }
    });
    return [
      h('h2', { class: 'dialogo-titulo' }, 'Novo projeto'),
      h('form', {
        class: 'dialogo-form',
        onsubmit: (ev) => {
          ev.preventDefault();
          const n = nome.value.trim();
          if (!n) { erro.textContent = 'Digite o nome do projeto.'; erro.hidden = false; nome.focus(); return; }
          if (/[/\\:@.]/.test(n)) { erro.textContent = 'Não use / \\ : @ . no nome.'; erro.hidden = false; return; }
          if (!capa) { erro.textContent = 'Escolha uma imagem para o projeto.'; erro.hidden = false; return; }
          fechar({ nome: n, capa });
        },
      },
      h('label', { class: 'campo-rotulo', htmlFor: 'projeto-nome' }, 'Nome do projeto'), nome,
      h('div', { class: 'campo-rotulo' }, 'Imagem do projeto'),
      h('div', { class: 'projeto-escolher' }, previa,
        h('button', { class: 'botao', type: 'button', onclick: () => entrada.click() }, 'Escolher imagem')),
      entrada,
      erro,
      h('div', { class: 'dialogo-botoes' },
        h('button', { class: 'botao', type: 'button', onclick: () => fechar(null) }, 'Cancelar'),
        h('button', { class: 'botao primario', type: 'submit' }, 'Criar'))),
    ];
  });
}

/* ================================================================== */
/* Projeto                                                              */
/* ================================================================== */

const DICAS = [
  ['@nome', 'chama um desenho (todos os frames). Ex.: @heroi'],
  ['@pasta/', 'chama todos os desenhos de uma pasta e das subpastas. Ex.: @Inimigos/'],
  ['@nome.camada', 'só uma camada do desenho. Ex.: @heroi.roupa'],
  ['@nome:ação', 'uma ação (andar, correr…) — chega com as ações do editor; por enquanto vai o desenho inteiro'],
  ['@cenário', 'chama um cenário pelo nome. Ex.: @floresta'],
  ['@[nome com espaço]', 'nomes com espaço vão entre colchetes; digite @ e escolha na lista'],
];

async function montarProjeto(el, { parametro, navegar, voltar }) {
  const aberto = await abrirProjeto(parametro).catch(() => null);
  if (!aberto) {
    aviso('Esse projeto não existe mais (ou está na lixeira).', { tipo: 'erro' });
    navegar('/jogo', { substituir: true });
    return undefined;
  }
  const id = parametro;
  const projeto = aberto.projeto;
  document.title = `${projeto.nome} · Criar jogo`;

  let ocupado = false;
  let cancelador = null;
  let correcoes = 0;
  let errosDoJogo = [];
  let esperandoErros = null;
  let anexos = [];
  let indice = null;
  let aba = 'chat';

  /* ---------- elementos ---------- */
  const lista = h('div', { class: 'chat-lista', role: 'log', 'aria-live': 'polite' });
  const seletorConversa = h('select', { class: 'campo chat-conversas', 'aria-label': 'Conversa', onchange: (e) => trocarConversa(e.target.value) });
  const texto = h('textarea', { class: 'campo chat-texto', rows: 3, placeholder: 'Escreva aqui… (use @ para chamar sprites, pastas e cenários)', 'aria-label': 'Mensagem para a IA' });
  const sugestoes = h('ul', { class: 'chat-sugestoes', role: 'listbox', hidden: true });
  const listaAnexos = h('div', { class: 'chat-anexos', hidden: true });
  const entradaImagem = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const botaoModelo = h('button', { class: 'botao pequeno chat-modelo', type: 'button', title: 'Modelo IA e chaves', onclick: () => escolherModeloIA() });
  const botaoNova = h('button', { class: 'botao pequeno', type: 'button', onclick: () => adicionarConversa() }, '＋ Nova conversa');
  const botaoEnviar = h('button', { class: 'botao primario chat-enviar', type: 'button', onclick: () => (ocupado ? cancelar() : enviarDoCampo()) }, 'Enviar');
  const botaoAnexo = h('button', { class: 'botao pequeno icone', type: 'button', 'aria-label': 'Anexar imagem', title: 'Anexar imagem (a IA vê a imagem)', onclick: () => entradaImagem.click() }, '📎');
  const dicas = h('details', { class: 'chat-dicas' },
    h('summary', {}, 'Dicas de comandos'),
    h('ul', {}, DICAS.map(([cmd, txt]) => h('li', {}, h('code', {}, cmd), ' ', txt))),
    h('p', { class: 'dica pequena' }, 'Peça uma coisa de cada vez: “crie a fase 1 com @heroi andando”, “adicione pulo”, “mude a velocidade”. Se o jogo der erro, a IA tenta corrigir sozinha até 3 vezes.'));

  const palco = criarPalco({ aoMensagem: (m) => receberDoJogo(m) });
  const consoleJogo = h('div', { class: 'jogo-console', 'aria-live': 'polite' });
  const botaoCorrigir = h('button', { class: 'botao pequeno', type: 'button', hidden: true, onclick: () => pedirCorrecao(false) }, '🛠 Pedir correção à IA');
  const visorCodigo = h('div', { class: 'jogo-codigo', hidden: true });
  const botaoCodigo = h('button', { class: 'botao pequeno', type: 'button', 'aria-pressed': 'false', onclick: () => alternarCodigo() }, '</> Código');
  const botaoReiniciar = h('button', { class: 'botao pequeno', type: 'button', onclick: () => rodarJogo() }, '↻ Reiniciar');

  const abas = h('nav', { class: 'jogo-abas', role: 'tablist' },
    ['chat', 'jogo', 'codigo'].map((a) => h('button', {
      class: 'segmento', type: 'button', role: 'tab', 'data-aba': a, onclick: () => mudarAba(a),
    }, { chat: 'Chat', jogo: 'Jogo', codigo: 'Código' }[a])));

  const colunaChat = h('section', { class: 'jogo-chat', 'aria-label': 'Chat com a IA' },
    h('div', { class: 'chat-topo' }, seletorConversa, botaoNova),
    lista,
    dicas,
    h('div', { class: 'chat-entrada' },
      sugestoes, listaAnexos, texto,
      h('div', { class: 'chat-botoes' }, botaoAnexo, botaoModelo, h('span', { class: 'espaco' }), botaoEnviar)),
    entradaImagem);

  const colunaJogo = h('section', { class: 'jogo-teste', 'aria-label': 'Área de teste' },
    h('div', { class: 'teste-topo' }, h('strong', {}, 'Área de teste'), h('span', { class: 'espaco' }), botaoReiniciar, botaoCodigo),
    palco.el, visorCodigo,
    h('div', { class: 'jogo-rodape' }, consoleJogo, botaoCorrigir));

  const raiz = h('div', { class: 'jogo-tela', 'data-aba': aba },
    h('header', { class: 'topo jogo-cabeca' },
      h('button', { class: 'botao', type: 'button', 'aria-label': 'Voltar', onclick: () => voltar('/jogo') }, '←'),
      projeto.capa ? h('img', { class: 'jogo-capa', src: projeto.capa, alt: '' }) : null,
      h('h1', { class: 'jogo-titulo' }, projeto.nome)),
    abas,
    h('div', { class: 'jogo-corpo' }, colunaChat, colunaJogo));
  el.append(raiz);

  /* ---------- abas (celular) e código ---------- */
  function mudarAba(a) {
    aba = a;
    raiz.dataset.aba = a;
    for (const b of abas.children) b.setAttribute('aria-pressed', String(b.dataset.aba === a));
    if (a === 'codigo') mostrarCodigo(true);
    else if (a === 'jogo') { mostrarCodigo(false); palco.focar(); } else mostrarCodigo(false);
  }
  function mostrarCodigo(sim) {
    visorCodigo.hidden = !sim;
    palco.el.hidden = sim;
    botaoCodigo.setAttribute('aria-pressed', String(sim));
    if (sim) desenharCodigo();
  }
  function alternarCodigo() { mostrarCodigo(visorCodigo.hidden); }
  let arquivoVisto = null;
  function desenharCodigo() {
    const nomes = [...ordemDosScripts(projeto.arquivos), ...Object.keys(projeto.arquivos).filter((n) => !n.endsWith('.js')).sort()];
    if (!nomes.length) { preencher(visorCodigo, h('p', { class: 'dica' }, 'Ainda não há código. Peça um jogo no chat.')); return; }
    if (!nomes.includes(arquivoVisto)) arquivoVisto = nomes.includes('main.js') ? 'main.js' : nomes[0];
    preencher(visorCodigo,
      h('div', { class: 'grupo-segmentos codigo-arquivos' }, nomes.map((n) => h('button', {
        class: 'segmento', type: 'button', 'aria-pressed': String(n === arquivoVisto), onclick: () => { arquivoVisto = n; desenharCodigo(); },
      }, n))),
      h('pre', { class: 'codigo-texto' }, h('code', {}, projeto.arquivos[arquivoVisto])),
      h('button', {
        class: 'botao pequeno', type: 'button',
        onclick: async () => { try { await navigator.clipboard.writeText(projeto.arquivos[arquivoVisto]); aviso('Código copiado.'); } catch { aviso('Não consegui copiar.', { tipo: 'erro' }); } },
      }, 'Copiar este arquivo'));
  }

  /* ---------- conversas ---------- */
  function desenharConversas() {
    preencher(seletorConversa, projeto.conversas.map((c) => h('option', { value: c.id, selected: c.id === projeto.conversaAtual }, c.titulo)));
  }
  async function trocarConversa(cid) {
    projeto.conversaAtual = cid;
    desenharMensagens();
    await salvar();
  }
  async function adicionarConversa() {
    if (ocupado) return;
    const atual = conversaAtual(projeto);
    if (!atual.mensagens.length) { aviso('Esta conversa ainda está vazia: use-a.'); texto.focus(); return; }
    const c = novaConversa(projeto.conversas.length + 1);
    projeto.conversas.push(c);
    projeto.conversaAtual = c.id;
    desenharConversas();
    desenharMensagens();
    await salvar();
    aviso('Nova conversa. A IA continua lembrando do projeto (memória, arquivos e assets).');
    texto.focus();
  }

  /* ---------- mensagens ---------- */
  const formatarTexto = (t) => {
    // `código` vira <code>; o resto é texto puro (nada de HTML vindo da IA)
    const partes = [];
    String(t).split(/(`[^`\n]+`)/).forEach((p) => partes.push(p.startsWith('`') && p.endsWith('`') && p.length > 2 ? h('code', {}, p.slice(1, -1)) : p));
    return partes;
  };

  function bolha(m) {
    if (m.papel === 'sistema') return h('div', { class: 'msg sistema' }, m.texto);
    if (m.papel === 'usuario') {
      return h('div', { class: `msg usuario${m.auto ? ' auto' : ''}` },
        m.auto && h('small', { class: 'msg-rotulo' }, '🛠 correção automática'),
        h('div', { class: 'msg-texto' }, formatarTexto(m.texto)),
        m.imagens?.length > 0 && h('div', { class: 'msg-imagens' }, m.imagens.map((src) => h('img', { src, alt: 'imagem anexada' }))));
    }
    const r = m.erro ? null : lerResposta(m.texto);
    return h('div', { class: `msg ia${m.erro ? ' erro' : ''}` },
      h('small', { class: 'msg-rotulo' }, m.erro ? '⚠ não deu certo' : `🤖 ${m.modelo || 'IA'}`),
      h('div', { class: 'msg-texto' }, formatarTexto(m.erro ? m.texto : (r.explicacao || '(sem explicação)'))),
      r && Object.keys(r.arquivos).length + r.apagar.length > 0 && h('div', { class: 'msg-arquivos' },
        Object.keys(r.arquivos).map((n) => h('span', { class: 'chip' }, `✎ ${n}`)),
        r.apagar.map((n) => h('span', { class: 'chip' }, `🗑 ${n}`))),
      r?.pendencias?.length > 0 && h('div', { class: 'msg-pendencias' }, h('strong', {}, '📌 Falta você fazer: '),
        h('ul', {}, r.pendencias.map((p) => h('li', {}, p)))),
      m.versao && projeto.versoes.some((v) => v.id === m.versao) && h('button', {
        class: 'link', type: 'button', onclick: () => desfazer(m.versao),
      }, '↩ Desfazer esta mudança'),
      m.erro && m.repetir && h('button', { class: 'link', type: 'button', onclick: () => repetir() }, 'Tentar de novo'));
  }

  function desenharMensagens() {
    const c = conversaAtual(projeto);
    if (!c.mensagens.length) {
      preencher(lista, h('div', { class: 'chat-vazio' },
        h('p', {}, h('strong', {}, 'Comece descrevendo o jogo.')),
        h('p', {}, 'Ex.: “Crie um jogo de plataforma onde @heroi pula e coleta moedas. Controles por toque.”'),
        !temAlgumaChave() && h('p', { class: 'aviso-caixa atencao' }, 'Antes, toque em “Modelo IA” e cole a chave do Gemini ou do OpenRouter.')));
      return;
    }
    preencher(lista, c.mensagens.map(bolha));
    if (ocupado) lista.append(h('div', { class: 'msg ia pensando' }, h('span', { class: 'pontos' }), ' ', h('span', { class: 'cronometro' }, 'A IA está escrevendo…')));
    lista.scrollTop = lista.scrollHeight;
  }

  /* ---------- jogo ---------- */
  async function rodarJogo() {
    errosDoJogo = [];
    preencher(consoleJogo);
    botaoCorrigir.hidden = true;
    if (!temJogo(projeto)) {
      palco.bloquear(TEXTO_BLOQUEADO);
      return;
    }
    try {
      indice = await montarIndice();
      const assets = await montarAssets(projeto.referencias, indice);
      for (const a of assets.avisos) logar({ tipo: 'warn', mensagem: a });
      palco.rodar({ arquivos: projeto.arquivos, assets });
    } catch (x) {
      logar({ tipo: 'erro', mensagem: `Não consegui montar o jogo: ${x.message}` });
    }
  }

  function logar(m) {
    const linha = h('div', { class: `console-linha ${m.tipo}` },
      m.tipo === 'erro' ? '✖ ' : m.tipo === 'warn' ? '⚠ ' : '› ',
      m.mensagem, m.arquivo ? h('small', {}, ` (${m.arquivo}${m.linha ? `:${m.linha}` : ''})`) : '');
    consoleJogo.append(linha);
    while (consoleJogo.childElementCount > 40) consoleJogo.firstChild.remove();
    consoleJogo.scrollTop = consoleJogo.scrollHeight;
  }

  function receberDoJogo(m) {
    if (m.tipo === 'pronto') { esperandoErros?.pronto(); return; }
    if (m.tipo === 'erro') {
      errosDoJogo.push({ mensagem: m.mensagem, arquivo: m.arquivo, linha: m.linha });
      botaoCorrigir.hidden = ocupado;
      esperandoErros?.erro();
    }
    logar(m);
  }

  /** Espera o jogo começar e devolve os erros dos primeiros segundos. */
  function esperarErrosIniciais() {
    return new Promise((resolve) => {
      let relogio = setTimeout(() => fim(), 12_000); // se nem "pronto" chegar
      const fim = () => { clearTimeout(relogio); esperandoErros = null; resolve([...errosDoJogo]); };
      esperandoErros = {
        pronto: () => { clearTimeout(relogio); relogio = setTimeout(fim, ESPERA_ERROS_MS); },
        erro: () => { clearTimeout(relogio); relogio = setTimeout(fim, 400); },
      };
    });
  }

  /* ---------- enviar ---------- */
  async function salvar() {
    try { await salvarProjeto(id, projeto); } catch (x) { avisarErro(x); }
  }

  function ficarOcupado(sim) {
    ocupado = sim;
    botaoEnviar.textContent = sim ? 'Parar' : 'Enviar';
    botaoEnviar.classList.toggle('perigo', sim);
    botaoEnviar.classList.toggle('primario', !sim);
    botaoNova.disabled = sim;
    seletorConversa.disabled = sim;
    botaoCorrigir.hidden = sim || !errosDoJogo.length;
    if (sim) palco.pausar();
    else if (palco.rodando) palco.continuar();
    else if (!temJogo(projeto)) palco.bloquear(TEXTO_BLOQUEADO);
    desenharMensagens();
  }

  function cancelar() { cancelador?.abort(); }

  async function enviarDoCampo() {
    const t = texto.value.trim();
    if (!t && !anexos.length) { texto.focus(); return; }
    if (!lerChave(modeloEscolhido().provedor)) {
      const m = await dialogoModelo();
      if (!m) return;
      atualizarBotaoModelo();
    }
    texto.value = '';
    fecharSugestoes();
    const imagens = anexos;
    anexos = [];
    desenharAnexos();
    correcoes = 0;
    await enviar({ texto: t || '(veja a imagem)', imagens });
  }

  async function enviar({ texto: t, imagens = [], auto = false }) {
    const conversa = conversaAtual(projeto);
    // menções: guarda as que existem para virar assets do jogo
    indice = indice || await montarIndice();
    const { itens, naoEncontradas } = resolverMencoes(extrairMencoes(t), indice);
    for (const it of itens) if (!projeto.referencias.includes(it.bruto)) projeto.referencias.push(it.bruto);
    // no projeto (que vai para a nuvem) ficam só miniaturas; a IA recebe as imagens boas neste pedido
    const miniaturas = await Promise.all(imagens.map((src) => miniatura(src).catch(() => null)));
    conversa.mensagens.push({ id: novoIdCurto(), papel: 'usuario', texto: t, em: Date.now(), imagens: miniaturas.filter(Boolean), auto });
    if (conversa.mensagens.filter((m) => m.papel === 'usuario').length === 1 && /^Conversa \d+$/.test(conversa.titulo)) {
      conversa.titulo = t.replace(/\s+/g, ' ').slice(0, 40) + (t.length > 40 ? '…' : '');
      desenharConversas();
    }
    if (naoEncontradas.length) {
      conversa.mensagens.push({ id: novoIdCurto(), papel: 'sistema', texto: `Não encontrei: ${naoEncontradas.join(', ')}. Confira o nome (digite @ para ver a lista).`, em: Date.now() });
    }
    await salvar();
    ficarOcupado(true);
    const inicio = Date.now();
    const cronometro = setInterval(() => {
      const c = lista.querySelector('.cronometro');
      if (c) c.textContent = `A IA está escrevendo… ${Math.round((Date.now() - inicio) / 1000)} s`;
    }, 1000);

    let mudouArquivos = false;
    try {
      const assets = await montarAssets(projeto.referencias, indice);
      const pedido = montarPedido(projeto, { textoAssets: descreverAssets(assets, { cenariosNaoChamados: indice.cenarios.map((c) => c.nome).filter((n) => !assets.cenarios.some((a) => a.origem.toLowerCase().includes(n.toLowerCase()))) }), avisosAssets: assets.avisos, imagensAtuais: imagens.length ? imagens : null });
      cancelador = new AbortController();
      const modelo = modeloEscolhido();
      const resposta = await conversar({ modelo, sistema: pedido.sistema, mensagens: pedido.mensagens, sinal: cancelador.signal });
      const r = lerResposta(resposta.texto);
      const msg = { id: novoIdCurto(), papel: 'ia', texto: resposta.texto, em: Date.now(), modelo: modelo.id };
      if (Object.keys(r.arquivos).length || r.apagar.length) {
        const v = aplicarArquivos(projeto, { arquivos: r.arquivos, apagar: r.apagar, descricao: t });
        msg.versao = v.id;
        mudouArquivos = true;
      }
      if (r.memoria !== null) projeto.memoria = r.memoria;
      if (r.pendencias !== null) projeto.pendencias = r.pendencias;
      if (resposta.cortada) msg.texto += '\n\n(A resposta foi cortada por ser grande demais. Peça: “continue”.)';
      conversa.mensagens.push(msg);
      await salvar();
    } catch (x) {
      const cancelado = x?.codigo === 'cancelado';
      conversa.mensagens.push({ id: novoIdCurto(), papel: 'ia', erro: true, repetir: !cancelado, texto: cancelado ? 'Você parou o pedido.' : mensagemDeErro(x), em: Date.now() });
      await salvar();
    } finally {
      clearInterval(cronometro);
      cancelador = null;
    }
    ficarOcupado(false);
    if (!mudouArquivos) return;

    // mostra o resultado e confere se o jogo roda; se der erro, a IA tenta corrigir sozinha
    if (aba === 'chat' && matchMedia('(max-width: 899px)').matches) aviso('Jogo atualizado: veja na aba Jogo.', { tipo: 'ok' });
    await rodarJogo();
    const erros = await esperarErrosIniciais();
    if (erros.length) await pedirCorrecao(true);
  }

  async function pedirCorrecao(automatica) {
    if (ocupado || !errosDoJogo.length) return;
    if (automatica) {
      if (correcoes >= MAX_CORRECOES) {
        conversaAtual(projeto).mensagens.push({ id: novoIdCurto(), papel: 'sistema', texto: `O jogo ainda dá erro depois de ${MAX_CORRECOES} correções automáticas. Descreva o problema com suas palavras ou use “Desfazer esta mudança”.`, em: Date.now() });
        await salvar();
        desenharMensagens();
        return;
      }
      correcoes++;
    } else correcoes = 0;
    await enviar({ texto: pedidoDeCorrecao(errosDoJogo, automatica ? correcoes : 1, automatica ? MAX_CORRECOES : 1).replace(/^\[Correção automática 1\/1\]/, '[Pedido de correção]'), auto: true });
  }

  async function repetir() {
    const c = conversaAtual(projeto);
    while (c.mensagens.length && c.mensagens[c.mensagens.length - 1].papel !== 'usuario') c.mensagens.pop();
    const ultima = c.mensagens.pop();
    if (!ultima) return;
    await enviar({ texto: ultima.texto, imagens: ultima.imagens || [], auto: ultima.auto });
  }

  async function desfazer(versaoId) {
    const certo = await confirmar({
      titulo: 'Desfazer esta mudança?',
      mensagem: 'O código volta a ser como era antes desta resposta da IA (e as mudanças depois dela também são desfeitas).',
      rotuloConfirmar: 'Desfazer',
    });
    if (!certo) return;
    if (!desfazerAte(projeto, versaoId)) return;
    conversaAtual(projeto).mensagens.push({ id: novoIdCurto(), papel: 'sistema', texto: '↩ Mudança desfeita. O jogo voltou à versão anterior.', em: Date.now() });
    await salvar();
    desenharMensagens();
    if (!visorCodigo.hidden) desenharCodigo();
    await rodarJogo();
  }

  /* ---------- modelo ---------- */
  function atualizarBotaoModelo() {
    botaoModelo.textContent = `Modelo IA: ${temAlgumaChave() ? rotuloDoModelo() : 'configurar'}`;
  }
  async function escolherModeloIA() {
    const m = await dialogoModelo();
    atualizarBotaoModelo();
    if (m) desenharMensagens();
  }

  /* ---------- anexos ---------- */
  entradaImagem.addEventListener('change', async () => {
    const arquivos = [...(entradaImagem.files || [])].slice(0, 4);
    entradaImagem.value = '';
    for (const a of arquivos) {
      try { anexos.push(await prepararAnexo(a)); } catch (x) { aviso(x.message, { tipo: 'erro' }); }
    }
    anexos = anexos.slice(0, 4);
    desenharAnexos();
  });
  function desenharAnexos() {
    listaAnexos.hidden = !anexos.length;
    preencher(listaAnexos, anexos.map((src, i) => h('span', { class: 'anexo' },
      h('img', { src, alt: 'anexo' }),
      h('button', { class: 'anexo-tirar', type: 'button', 'aria-label': 'Tirar imagem', onclick: () => { anexos.splice(i, 1); desenharAnexos(); } }, '✕'))));
  }

  /* ---------- @ autocompletar ---------- */
  let opcoes = [];
  let escolhida = 0;
  function trechoDaMencao() {
    const antes = texto.value.slice(0, texto.selectionStart);
    const m = /@(\[[^\]\n]*|[^\s@[\]]*)$/.exec(antes);
    return m ? { inicio: antes.length - m[0].length, prefixo: m[1].replace(/^\[/, '') } : null;
  }
  async function atualizarSugestoes() {
    const t = trechoDaMencao();
    if (!t) { fecharSugestoes(); return; }
    indice = indice || await montarIndice().catch(() => null);
    if (!indice) return;
    opcoes = sugerir(indice, t.prefixo);
    escolhida = 0;
    if (!opcoes.length) {
      preencher(sugestoes, h('li', { class: 'sugestao vazia' }, t.prefixo ? 'Nada com esse nome.' : 'Você ainda não tem desenhos salvos.'));
      sugestoes.hidden = false;
      return;
    }
    preencher(sugestoes, opcoes.map((o, i) => h('li', {
      class: 'sugestao', role: 'option', 'aria-selected': String(i === escolhida),
      onpointerdown: (e) => { e.preventDefault(); inserirSugestao(i); },
    }, h('span', { 'aria-hidden': 'true' }, o.icone), ' ', h('strong', {}, o.texto), ' ', h('small', {}, `${o.detalhe} · ${o.onde}`))));
    sugestoes.hidden = false;
  }
  function fecharSugestoes() { sugestoes.hidden = true; opcoes = []; }
  function inserirSugestao(i) {
    const t = trechoDaMencao();
    const o = opcoes[i];
    if (!t || !o) return;
    const fim = texto.selectionStart;
    const novo = `${texto.value.slice(0, t.inicio)}${o.texto} ${texto.value.slice(fim)}`;
    const pos = t.inicio + o.texto.length + 1;
    texto.value = novo;
    texto.setSelectionRange(pos, pos);
    texto.focus();
    fecharSugestoes();
  }
  texto.addEventListener('input', () => { atualizarSugestoes(); });
  texto.addEventListener('keydown', (e) => {
    if (!sugestoes.hidden && opcoes.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        escolhida = (escolhida + (e.key === 'ArrowDown' ? 1 : opcoes.length - 1)) % opcoes.length;
        [...sugestoes.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === escolhida)));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); inserirSugestao(escolhida); return; }
      if (e.key === 'Escape') { fecharSugestoes(); return; }
    }
    // Enter envia no computador (Shift+Enter quebra linha); no celular Enter é quebra de linha
    if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) {
      e.preventDefault();
      if (!ocupado) enviarDoCampo();
    }
  });
  texto.addEventListener('blur', () => setTimeout(fecharSugestoes, 150));

  /* ---------- sincronização: atualiza se o projeto mudou em outro aparelho e aqui está parado ---------- */
  const aoSincronizar = async (e) => {
    if (!e.detail?.mudou || ocupado) return;
    indice = null;
    const novo = await abrirProjeto(id).catch(() => null);
    if (!novo) return;
    const antes = JSON.stringify(projeto.arquivos);
    Object.assign(projeto, novo.projeto);
    desenharConversas();
    desenharMensagens();
    if (JSON.stringify(projeto.arquivos) !== antes) rodarJogo();
  };
  globalThis.addEventListener('miniengine:nuvem', aoSincronizar);

  /* ---------- começa ---------- */
  mudarAba('chat');
  atualizarBotaoModelo();
  desenharConversas();
  desenharMensagens();
  await rodarJogo();

  return () => {
    cancelador?.abort();
    globalThis.removeEventListener('miniengine:nuvem', aoSincronizar);
    palco.destruir();
  };
}

/** Miniatura (até 160 px, JPEG) de uma imagem em data URL. */
async function miniatura(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const escala = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * escala));
  c.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

/** Imagem anexada ao chat: até 1024 px, JPEG (para não pesar no pedido). */
async function prepararAnexo(arquivo) {
  if (!arquivo || !/^image\//.test(arquivo.type)) throw new Error('Só dá para anexar imagens.');
  const bmp = await createImageBitmap(arquivo).catch(() => { throw new Error('Não consegui abrir essa imagem.'); });
  const escala = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * escala));
  c.height = Math.max(1, Math.round(bmp.height * escala));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = escala < 1;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const png = c.toDataURL('image/png');
  return png.length < 300_000 ? png : c.toDataURL('image/jpeg', 0.85);
}
