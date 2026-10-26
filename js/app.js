/* Bíblia & Exegese — Etapa 1 (Gênesis) */
(function () {
  'use strict';
  const D = window.DADOS;
  const $app = document.getElementById('app');
  const $modais = document.getElementById('modal-root');

  // ------------------------------------------------------------------ utilidades
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignorado */ } }
  };
  let toastTimer;
  function toast(msg, erro) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'show' + (erro ? ' erro' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, erro ? 5200 : 2400);
  }
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); } catch (e2) { /* nada */ } ta.remove();
    }
    toast('Copiado');
  }
  const I = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
    del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    gh: '<svg viewBox="0 0 24 24" aria-hidden="true" class="fill"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/></svg>'
  };

  // ------------------------------------------------------------------ modal
  function modal({ titulo, corpo, botoes = [], largo = false, aoAbrir }) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-fundo';
    wrap.innerHTML = `<div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true" aria-label="${h(titulo)}">
      <div class="modal-cab"><h2>${h(titulo)}</h2><button class="icone fechar" data-fechar aria-label="Fechar">${I.x}</button></div>
      <div class="modal-corpo">${corpo}</div>
      ${botoes.length ? `<div class="modal-rodape">${botoes.map((b, i) => `<button class="btn ${b.classe || ''}" data-b="${i}">${h(b.texto)}</button>`).join('')}</div>` : ''}
    </div>`;
    const fechar = () => { wrap.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc);
    wrap.addEventListener('click', async (e) => {
      if (e.target === wrap || e.target.closest('[data-fechar]')) return fechar();
      const b = e.target.closest('[data-b]');
      if (b) {
        const acao = botoes[+b.dataset.b].acao;
        if (!acao) return fechar();
        b.disabled = true;
        try { const r = await acao(wrap); if (r !== false) fechar(); }
        catch (err) { toast(err.message || 'Algo deu errado', true); }
        finally { b.disabled = false; }
      }
    });
    $modais.appendChild(wrap);
    if (aoAbrir) aoAbrir(wrap);
    const f = wrap.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 30);
    return { el: wrap, fechar };
  }
  function confirmar(texto, ok = 'Excluir') {
    return new Promise(res => {
      const m = modal({ titulo: 'Confirmar', corpo: `<p>${h(texto)}</p>`, botoes: [
        { texto: 'Cancelar', classe: 'sec', acao: () => res(false) },
        { texto: ok, classe: 'perigo', acao: () => res(true) }] });
      m.el.addEventListener('click', e => { if (e.target === m.el || e.target.closest('[data-fechar]')) res(false); });
    });
  }
  const valor = (el, sel) => (el.querySelector(sel).value || '').trim();

  // ------------------------------------------------------------------ estado
  const S = {
    user: null,
    livros: {},           // dados carregados (gn.json)
    traducoes: [], obras: [],
    celulas: new Map(),   // 'coluna|linha' -> linha
    citacoes: [], blocos: [],
    aba: store.get('aba') || 'ep',
    mostrarOriginais: store.get('originais') !== '0'
  };
  const LIVROS = [];
  CANON.forEach(d => d.grupos.forEach(g => g.livros.forEach(l => LIVROS.push({ ...l, divisao: d.id }))));
  const livroPorArquivo = (a) => LIVROS.find(l => l.arquivo === a);

  // ------------------------------------------------------------------ referências bibliográficas
  function refComPagina(referencia, pagina) {
    const base = String(referencia || '').trim().replace(/[.\s]+$/, '');
    return pagina ? `${base}, p. ${String(pagina).trim()}.` : base + '.';
  }
  function textoCitacao(c, obra) {
    const ref = refComPagina(obra ? obra.referencia : '', c.pagina);
    return c.tipo === 'direta' ? `“${c.texto}”\n${ref}` : `${c.texto}\n${ref}`;
  }
  const obraPorId = (id) => S.obras.find(o => o.id === id);

  // ------------------------------------------------------------------ roteamento (#/gn/1/1)
  function rotaAtual() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (p[0] && livroPorArquivo(p[0])) return { livro: p[0], cap: +p[1] || 0, ver: +p[2] || 0 };
    return { livro: null };
  }
  const ir = (hash) => { if (location.hash !== hash) location.hash = hash; else render(); };
  window.addEventListener('hashchange', () => render());

  // ------------------------------------------------------------------ inicialização
  async function iniciar() {
    if (!D) {
      $app.innerHTML = `<div class="erro-geral"><h1>Não foi possível carregar o Supabase</h1><p>Verifique a conexão com a internet e recarregue a página.</p></div>`;
      return;
    }
    S.user = await D.sessao();
    D.aoMudarSessao(async (u) => {
      const antes = S.user && S.user.id;
      S.user = u;
      if ((u && u.id) !== antes) { if (u) await carregarGlobais(); render(); }
    });
    if (location.search.includes('code=') && D.modo === 'supabase') {
      history.replaceState(null, '', location.pathname + location.hash);
    }
    if (S.user) await carregarGlobais();
    render();
  }

  async function carregarGlobais() {
    try {
      const [t, o] = await Promise.all([
        D.listar('traducoes_usuario', {}, 'ordem'),
        D.listar('obras', {}, 'ordem')
      ]);
      S.traducoes = t; S.obras = o;
    } catch (e) {
      toast('Erro ao ler seus dados: ' + e.message + ' — confira se o schema.sql foi executado no Supabase.', true);
    }
  }

  async function carregarLivro(arquivo) {
    if (S.livros[arquivo]) return S.livros[arquivo];
    const r = await fetch(`data/livros/${arquivo}.json`);
    if (!r.ok) throw new Error('Não foi possível carregar o livro.');
    S.livros[arquivo] = await r.json();
    return S.livros[arquivo];
  }

  async function carregarVersiculo(livro, cap, ver) {
    const f = { livro, capitulo: cap, versiculo: ver };
    const [cel, cit, blo] = await Promise.all([
      D.listar('celulas', f, null), D.listar('citacoes', f), D.listar('blocos', f, 'ordem')
    ]);
    S.celulas = new Map(cel.map(c => [c.coluna + '|' + c.linha, c]));
    S.citacoes = cit; S.blocos = blo;
  }

  // ------------------------------------------------------------------ render geral
  async function render() {
    if (!S.user) return telaLogin();
    const r = rotaAtual();
    if (!r.livro) return telaEstante();
    const livro = livroPorArquivo(r.livro);
    if (!livro.ativo) { ir('#/'); return; }
    if (!r.cap || !r.ver) { telaEstante(); return seletor(livro, r.cap); }
    return telaExegese(livro, r.cap, r.ver);
  }

  // ------------------------------------------------------------------ login
  function telaLogin() {
    $app.innerHTML = `
    <main class="login">
      <div class="login-cartao">
        <img src="img/logo-192.png" alt="" class="login-logo" width="132" height="132">
        <h1>Bíblia <span>&amp;</span> Exegese</h1>
        <p class="login-sub">Estudo do texto hebraico, da Septuaginta e das suas fontes, versículo a versículo.</p>
        <button class="btn github" id="btn-gh">${I.gh} Entrar com GitHub</button>
        <div class="ou"><span>ou com e-mail</span></div>
        <form id="form-login" class="form-login">
          <label>E-mail<input type="email" name="email" autocomplete="email" required></label>
          <label>Senha<input type="password" name="senha" autocomplete="current-password" minlength="6" required></label>
          <div class="login-acoes">
            <button class="btn" type="submit" data-acao="entrar">Entrar</button>
            <button class="btn sec" type="submit" data-acao="criar">Criar conta</button>
          </div>
        </form>
        <p class="login-msg" id="login-msg"></p>
      </div>
      <p class="login-rodape">Texto em português: Bíblia Livre (BLIVRE) · CC BY 4.0</p>
    </main>`;
    const msg = (t, erro) => { const m = document.getElementById('login-msg'); m.textContent = t; m.classList.toggle('erro', !!erro); };
    document.getElementById('btn-gh').onclick = async () => {
      try { await D.entrarGithub(); } catch (e) { msg('GitHub: ' + e.message + '. Verifique se o provedor GitHub está ativado no Supabase.', true); }
    };
    let acao = 'entrar';
    document.querySelectorAll('#form-login [data-acao]').forEach(b => b.addEventListener('click', () => { acao = b.dataset.acao; }));
    document.getElementById('form-login').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        if (acao === 'criar') {
          const logou = await D.criarConta(fd.get('email'), fd.get('senha'));
          if (!logou) msg('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
        } else {
          await D.entrarEmail(fd.get('email'), fd.get('senha'));
        }
      } catch (err) { msg(traduzErro(err.message), true); }
    };
  }
  function traduzErro(m) {
    if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.';
    if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Use "Entrar".';
    return m;
  }

  // ------------------------------------------------------------------ cabeçalho
  function cabecalho(extra = '') {
    const nome = S.user.user_metadata && (S.user.user_metadata.user_name || S.user.user_metadata.full_name) || S.user.email || '';
    return `<header class="topo">
      <a href="#/" class="marca"><img src="img/logo-64.png" alt="" width="38" height="38"><span>Bíblia <em>&amp;</em> Exegese</span></a>
      <div class="topo-meio">${extra}</div>
      <div class="topo-dir">
        <button class="icone claro" data-acao="fontes" title="Fontes e licenças" aria-label="Fontes e licenças">${I.info}</button>
        <span class="usuario" title="${h(S.user.email || '')}">${h(nome)}${D.modo === 'demo' ? ' <small>(demonstração)</small>' : ''}</span>
        <button class="icone claro" data-acao="sair" title="Sair" aria-label="Sair">${I.out}</button>
      </div>
    </header>`;
  }
  function ligarCabecalho() {
    $app.querySelector('[data-acao="sair"]').onclick = async () => { await D.sair(); S.user = null; location.hash = ''; render(); };
    $app.querySelector('[data-acao="fontes"]').onclick = modalFontes;
  }

  // ------------------------------------------------------------------ estante
  function telaEstante() {
    const blocoLivro = (l, cor) => `
      <button class="livro ${cor} ${l.ativo ? '' : 'inativo'}" data-livro="${h(l.arquivo || '')}" ${l.ativo ? '' : 'aria-disabled="true"'} title="${h(l.nome)}${l.ativo ? '' : ' — em breve'}">
        <span class="livro-capa"><span class="livro-abrev">${h(l.abrev)}</span></span>
        <span class="livro-paginas"></span>
        ${l.ativo ? '' : `<span class="livro-cadeado">${I.lock}</span>`}
        <span class="livro-nome">${h(l.nome)}</span>
        <span class="livro-heb" lang="he" dir="rtl">${h(l.heb)}</span>
      </button>`;
    $app.innerHTML = cabecalho() + `
    <main class="estante">
      <section class="estante-intro">
        <h1>Antigo Testamento</h1>
        <p>Na ordem da Bíblia Hebraica — Torá, Profetas e Escritos. Nesta etapa, <strong>Gênesis</strong> está disponível; os demais livros do Pentateuco vêm a seguir.</p>
      </section>
      ${CANON.map(d => `
        <section class="divisao ${d.cor}">
          <header class="divisao-cab">
            <h2>${h(d.nome)} <span lang="he" dir="rtl">${h(d.hebraico)}</span></h2>
            <p>${h(d.subtitulo)}</p>
          </header>
          ${d.grupos.map(g => `
            ${g.titulo ? `<h3 class="grupo-titulo">${h(g.titulo)}</h3>` : ''}
            <div class="prateleira">${g.livros.map(l => blocoLivro(l, d.cor)).join('')}</div>
          `).join('')}
        </section>`).join('')}
    </main>`;
    ligarCabecalho();
    $app.querySelectorAll('.livro').forEach(b => b.onclick = () => {
      const l = LIVROS.find(x => x.arquivo && x.arquivo === b.dataset.livro);
      if (!l) return toast(`${b.title.replace(' — em breve', '')}: disponível nas próximas etapas.`);
      seletor(l);
    });
  }

  // ------------------------------------------------------------------ seletor capítulo -> versículo
  async function seletor(livro, capInicial) {
    let dados;
    try { dados = await carregarLivro(livro.arquivo); } catch (e) { return toast(e.message, true); }
    const m = modal({ titulo: livro.nome, largo: true, corpo: '<div class="seletor"></div>' });
    const box = m.el.querySelector('.seletor');
    const caps = dados.capitulos;
    const mostrarCaps = () => {
      box.innerHTML = `<p class="seletor-passo">Escolha o <strong>capítulo</strong></p>
        <div class="grade">${caps.map((_, i) => `<button class="num" data-c="${i + 1}">${i + 1}</button>`).join('')}</div>`;
      box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => mostrarVers(+b.dataset.c));
    };
    const mostrarVers = (c) => {
      box.innerHTML = `<p class="seletor-passo"><button class="link" data-voltar>${I.left} Capítulos</button>
        ${h(livro.nome)} ${c} — escolha o <strong>versículo</strong></p>
        <div class="grade">${Array.from({ length: caps[c - 1] }, (_, i) => `<button class="num" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>`;
      box.querySelector('[data-voltar]').onclick = mostrarCaps;
      box.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { m.fechar(); ir(`#/${livro.arquivo}/${c}/${b.dataset.v}`); });
    };
    if (capInicial && caps[capInicial - 1]) mostrarVers(capInicial); else mostrarCaps();
  }

  // ------------------------------------------------------------------ exegese
  let ctx = null; // { livro, dados, cap, ver, v (versículo), sigla }
  async function telaExegese(livro, cap, ver) {
    $app.innerHTML = cabecalho() + `<main class="exegese"><div class="carregando">Carregando ${h(livro.nome)} ${cap}:${ver}…</div></main>`;
    ligarCabecalho();
    let dados;
    try { dados = await carregarLivro(livro.arquivo); } catch (e) { return toast(e.message, true); }
    const v = dados.versiculos[`${cap}:${ver}`];
    if (!v) { toast('Versículo não encontrado.', true); return ir(`#/${livro.arquivo}/${cap}`); }
    ctx = { livro, dados, cap, ver, v, sigla: livro.abrev };
    store.set('ultimo', location.hash);
    try { await carregarVersiculo(livro.abrev, cap, ver); }
    catch (e) { toast('Erro ao ler os dados do versículo: ' + e.message, true); }
    desenharExegese();
  }

  function vizinho(delta) {
    const { dados, cap, ver } = ctx;
    let c = cap, v = ver + delta;
    if (v < 1) { c -= 1; if (c < 1) return null; v = dados.capitulos[c - 1]; }
    else if (v > dados.capitulos[c - 1]) { c += 1; v = 1; if (c > dados.capitulos.length) return null; }
    return `#/${ctx.livro.arquivo}/${c}/${v}`;
  }

  function desenharExegese() {
    const { livro, cap, ver, v } = ctx;
    const ant = vizinho(-1), prox = vizinho(1);
    const hebVerso = v.he.map(r => r[0]).join(' ');
    const grVerso = v.gr.map(g => g[0]).join(' ');
    $app.innerHTML = cabecalho() + `
    <main class="exegese">
      <div class="ref-barra">
        <a class="icone" ${ant ? `href="${ant}"` : 'aria-disabled="true"'} aria-label="Versículo anterior">${I.left}</a>
        <button class="ref-titulo" data-acao="trocar" title="Escolher capítulo e versículo">${h(livro.nome)} ${cap}:${ver}</button>
        <a class="icone" ${prox ? `href="${prox}"` : 'aria-disabled="true"'} aria-label="Próximo versículo">${I.right}</a>
      </div>
      <section class="verso">
        <p class="verso-pt">${h(v.pt)} <span class="sigla">BLIVRE</span></p>
        <div class="verso-originais ${S.mostrarOriginais ? '' : 'oculto'}">
          <p class="verso-he" lang="he" dir="rtl">${h(hebVerso)}</p>
          <p class="verso-gr" lang="grc">${h(grVerso)} <span class="sigla">LXX</span></p>
          ${v.heb_ref ? `<p class="nota-vers">No texto hebraico e na LXX este versículo é ${h(livro.abrev)} ${h(v.heb_ref)}.</p>` : ''}
        </div>
        <button class="link pequeno" data-acao="originais">${S.mostrarOriginais ? 'Ocultar' : 'Mostrar'} hebraico e grego do versículo</button>
      </section>
      <div class="tabela-moldura">
        <div class="rolagem-topo" id="rolagem-topo" aria-hidden="true"><div></div></div>
        <div class="tabela-rolagem" id="tabela-rolagem"><table class="tabela" id="tabela">${tabelaHTML()}</table></div>
      </div>
      <section class="inferior" id="inferior">${inferiorHTML()}</section>
    </main>`;
    ligarCabecalho();
    $app.querySelector('[data-acao="trocar"]').onclick = () => seletor(livro, cap);
    $app.querySelector('[data-acao="originais"]').onclick = () => {
      S.mostrarOriginais = !S.mostrarOriginais; store.set('originais', S.mostrarOriginais ? '1' : '0'); desenharExegese();
    };
    ligarTabela(); ligarInferior();
  }

  // ---------------------------------------------- colunas
  const obrasCat = (cat) => S.obras.filter(o => o.categoria === cat);
  function colunas() {
    const W = { texto: 104, he: 118, oc: 50, strong: 116, lxx: 108, obra: 112, vazio: 118 };
    const c = [{ k: 'pt', tipo: 'pt', titulo: 'Texto Bíblico', cor: 'amarelo', g: 'info', w: W.texto }];
    S.traducoes.forEach(t => c.push({ k: 'trad:' + t.id, tipo: 'trad', trad: t, titulo: t.nome, cor: 'amarelo2', g: 'info', w: W.texto }));
    c.push({ k: 'he', tipo: 'he', titulo: 'Hebraico', cor: 'verde', g: 'info', w: W.he });
    c.push({ k: 'oc', tipo: 'oc', titulo: '', cor: 'verde', g: 'info', w: W.oc });
    c.push({ k: 'she', tipo: 'she', titulo: 'Strong Hebraico', cor: 'azul', g: 'info', w: W.strong });
    c.push({ k: 'lxx', tipo: 'lxx', titulo: 'LXX', cor: 'vermelho', g: 'info', w: W.lxx });
    c.push({ k: 'sgr', tipo: 'sgr', titulo: 'Strong Grego', cor: 'azul', g: 'info', w: W.strong });
    const dic = obrasCat('dicionario'), com = obrasCat('comentario');
    if (dic.length) dic.forEach(o => c.push({ k: 'obra:' + o.id, tipo: 'obra', obra: o, titulo: o.titulo, cor: 'rosa', g: 'dic', w: W.obra }));
    else c.push({ k: 'vazio-dic', tipo: 'vazio', cat: 'dicionario', titulo: '', cor: 'rosa', g: 'dic', w: W.vazio });
    if (com.length) com.forEach(o => c.push({ k: 'obra:' + o.id, tipo: 'obra', obra: o, titulo: o.titulo, cor: 'pessego', g: 'com', w: W.obra }));
    else c.push({ k: 'vazio-com', tipo: 'vazio', cat: 'comentario', titulo: '', cor: 'pessego', g: 'com', w: W.vazio });
    return c;
  }

  // ---------------------------------------------- dados derivados de cada linha
  const cel = (col, linha) => { const c = S.celulas.get(col + '|' + linha); return c ? c.valor : ''; };
  // traduções portuguesas de um número Strong (como a Bíblia Livre verte o termo no AT)
  const tradHe = (s) => { const e = s && ctx.dados.lex_he[s]; return e && e[4] ? e[4] : []; };
  const tradGr = (k) => { const e = k && ctx.dados.lex_gr[k]; return e && e[4] ? e[4] : []; };
  function gregoDaLinha(i) {
    const r = ctx.v.he[i];
    const escolha = cel('lxx', i);
    let idx = r[7], auto = true;
    if (escolha !== '') { idx = +escolha; auto = false; }
    const g = idx >= 0 ? ctx.v.gr[idx] : null;
    return { g, idx, auto };
  }
  const chaveGrega = (g) => g[3] || ('L:' + g[2]);
  const citacoesCelula = (obraId, linha) => S.citacoes.filter(c => c.secao === 'celula' && c.obra_id === obraId && c.linha === linha);

  // ---------------------------------------------- tabela
  function tabelaHTML() {
    const cols = colunas();
    const conta = (g) => cols.filter(c => c.g === g).length;
    let html = '<colgroup>' + cols.map(c => `<col style="width:${c.w}px">`).join('') + '</colgroup><thead>';
    html += `<tr class="grupos">
      <th colspan="${conta('info')}" class="g-info">Informações gerais</th>
      <th colspan="${conta('dic')}" class="g-dic">Dicionários <button class="mais" data-acao="nova-obra" data-cat="dicionario" title="Cadastrar dicionário ou léxico" aria-label="Cadastrar dicionário">${I.plus}</button></th>
      <th colspan="${conta('com')}" class="g-com">Comentários <button class="mais" data-acao="nova-obra" data-cat="comentario" title="Cadastrar comentário" aria-label="Cadastrar comentário">${I.plus}</button></th>
    </tr><tr class="titulos">`;
    cols.forEach(c => {
      if (c.tipo === 'oc') return;
      const span = c.tipo === 'he' ? ' colspan="2"' : '';
      let inner = h(c.titulo);
      if (c.tipo === 'pt') inner = `<span>Texto Bíblico</span><button class="mais" data-acao="nova-trad" title="Adicionar uma tradução" aria-label="Adicionar tradução">${I.plus}</button>`;
      if (c.tipo === 'trad') inner = `<button class="th-btn" data-acao="editar-trad" data-id="${h(c.trad.id)}" title="Renomear ou excluir">${h(c.titulo)}</button>`;
      if (c.tipo === 'obra') inner = `<button class="th-btn" data-acao="editar-obra" data-id="${h(c.obra.id)}" title="${h(c.obra.referencia)}">${h(c.titulo)}</button>`;
      if (c.tipo === 'vazio') inner = `<button class="th-vazio" data-acao="nova-obra" data-cat="${c.cat}">${I.plus} ${c.cat === 'dicionario' ? 'Dicionário' : 'Comentário'}</button>`;
      html += `<th class="c-${c.cor}"${span}>${inner}</th>`;
    });
    html += '</tr></thead><tbody>';
    ctx.v.he.forEach((r, i) => {
      html += '<tr>';
      cols.forEach(c => { html += celulaHTML(c, r, i); });
      html += '</tr>';
    });
    html += '</tbody>';
    return html;
  }

  const ln = (txt, cls = '', attrs = '') => `<div class="ln ${cls}" ${attrs}>${txt}</div>`;
  function celulaHTML(c, r, i) {
    const td = (cls, conteudo, extra = '') => `<td class="${cls}" data-col="${h(c.k)}" data-linha="${i}" tabindex="0" ${extra}>${conteudo}</td>`;
    switch (c.tipo) {
      case 'pt': {
        const t = cel('pt', i) || r[8];
        return td('cel-texto', ln(t ? h(t) : '<span class="vazio">—</span>'));
      }
      case 'trad': {
        const t = cel(c.k, i);
        return td('cel-texto', ln(t ? h(t) : '<span class="vazio">—</span>'));
      }
      case 'he': {
        const raiz = r[3], rl = raiz && ctx.dados.lex_he[raiz];
        const sig = tradHe(raiz).join(', ');
        const raizTxt = raiz && rl
          ? `Raiz: <span lang="he" dir="rtl">${h(rl[0])}</span> ${h(rl[1])}${sig ? ' = ' + h(sig) : ''}`
          : '<span class="vazio">—</span>';
        return td('cel-he sub3', ln(h(r[0]), 'heb', 'lang="he" dir="rtl"') + ln(h(r[1]), 'tr') + ln(raizTxt, 'raiz quebra'));
      }
      case 'oc':
        return td('cel-oc', `<span title="${r[5]} vez(es) em ${h(ctx.livro.nome)} / ${r[6]} no Antigo Testamento"><b>${r[5]}</b><i>/${r[6]}</i></span>`);
      case 'she': {
        const s = r[2], sig = tradHe(s).join(', ');
        return td('cel-strong sub2', ln(`<b class="num-strong">${h(s || '—')}</b> ${h(sig)}`, 'quebra') + ln(h(r[4]), 'morf quebra'));
      }
      case 'lxx': {
        const { g, auto } = gregoDaLinha(i);
        if (!g) return td('cel-gr', ln('<span class="vazio">sem equivalente</span>'));
        const sig = tradGr(chaveGrega(g)).join(', ');
        return td('cel-gr sub3' + (auto ? ' auto' : ''), ln(h(g[0]), 'grc', 'lang="grc"') + ln(h(g[1]), 'tr') +
          ln(`Lema: <span lang="grc">${h(g[2])}</span>${sig ? ' = ' + h(sig) : ''}`, 'raiz quebra'), auto ? 'title="Sugestão automática — toque para conferir"' : '');
      }
      case 'sgr': {
        const { g } = gregoDaLinha(i);
        if (!g) return td('cel-strong', ln('<span class="vazio">—</span>'));
        const sig = tradGr(chaveGrega(g)).join(', ');
        return td('cel-strong sub2', ln(`<b class="num-strong">${h(g[3] || 's/ nº')}</b> ${h(sig)}`, 'quebra') + ln(h(g[4]), 'morf quebra'));
      }
      case 'obra': {
        const cs = citacoesCelula(c.obra.id, i);
        if (!cs.length) return td('cel-obra', ln('<span class="mais-cel">+ citação</span>'));
        const p = cs[0];
        return td('cel-obra tem', ln(h(p.tipo === 'direta' ? `“${p.texto}”` : p.texto)) +
          ln(`p. ${h(p.pagina)}${cs.length > 1 ? ` · +${cs.length - 1}` : ''}`, 'morf'));
      }
      case 'vazio':
        return `<td class="cel-vazia"></td>`;
    }
    return '<td></td>';
  }

  function ajustarRolagem() {
    const t = document.getElementById('tabela'), box = document.getElementById('tabela-rolagem');
    const topo = document.getElementById('rolagem-topo');
    if (!t || !box || !topo) return;
    topo.firstElementChild.style.width = t.scrollWidth + 'px';
    topo.classList.toggle('oculto', t.scrollWidth <= box.clientWidth + 1);
    const r1 = t.querySelector('tr.grupos');
    if (r1) t.style.setProperty('--h1', r1.getBoundingClientRect().height + 'px');
  }
  window.addEventListener('resize', ajustarRolagem);
  function ligarTabela() {
    const box = document.getElementById('tabela-rolagem'), topo = document.getElementById('rolagem-topo');
    let sincronizando = false;
    const sync = (de, para) => () => { if (sincronizando) { sincronizando = false; return; } sincronizando = true; para.scrollLeft = de.scrollLeft; };
    box.addEventListener('scroll', sync(box, topo));
    topo.addEventListener('scroll', sync(topo, box));
    ajustarRolagem();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarRolagem);
    const t = document.getElementById('tabela');
    t.addEventListener('click', aoClicarTabela);
    t.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('td[data-col]')) aoClicarTabela(e); });
  }
  function atualizarTabela() {
    const t = document.getElementById('tabela');
    if (t) t.innerHTML = tabelaHTML();
    ajustarRolagem();
  }
  function aoClicarTabela(e) {
    const b = e.target.closest('[data-acao]');
    if (b) {
      const a = b.dataset.acao;
      if (a === 'nova-trad') return modalTraducao();
      if (a === 'editar-trad') return modalTraducao(S.traducoes.find(x => x.id === b.dataset.id));
      if (a === 'nova-obra') return modalObraColuna(b.dataset.cat);
      if (a === 'editar-obra') return modalObraColuna(null, obraPorId(b.dataset.id));
      return;
    }
    const td = e.target.closest('td[data-col]');
    if (!td) return;
    const col = td.dataset.col, i = +td.dataset.linha;
    if (col === 'pt' || col.startsWith('trad:')) return modalTextoCelula(col, i);
    if (col === 'he' || col === 'oc') return modalHebraico(i);
    if (col === 'she') return modalStrongHe(i);
    if (col === 'lxx') return modalLxx(i);
    if (col === 'sgr') return modalStrongGr(i);
    if (col.startsWith('obra:')) return modalCitacoesCelula(obraPorId(col.slice(5)), i);
  }

  const refAtual = () => ({ livro: ctx.sigla, capitulo: ctx.cap, versiculo: ctx.ver });

  // ---------------------------------------------- modais das células
  function chipsVerso() {
    const palavras = ctx.v.pt.split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
    return `<div class="chips" aria-label="Palavras do versículo">${palavras.map(w => `<button type="button" class="chip" data-w="${h(w)}">${h(w)}</button>`).join('')}</div>`;
  }

  function modalTextoCelula(col, i) {
    const r = ctx.v.he[i];
    const ehPt = col === 'pt';
    const nomeCol = ehPt ? 'Texto Bíblico' : (S.traducoes.find(t => 'trad:' + t.id === col) || {}).nome;
    const proprio = cel(col, i);
    const atual = proprio || (ehPt ? r[8] : '');
    modal({
      titulo: `${nomeCol} — palavra ${i + 1}`,
      corpo: `<p class="ctx-he"><span lang="he" dir="rtl">${h(r[0])}</span> <span class="tr">${h(r[1])}</span></p>
        ${ehPt && !proprio && r[8] ? '<p class="dica">Correspondência automática com a Bíblia Livre. Você pode corrigir.</p>' : ''}
        <label class="campo">Texto<textarea id="m-txt" rows="3" autofocus>${h(atual)}</textarea></label>
        <p class="dica">Toque nas palavras da Bíblia Livre para inserir:</p>${chipsVerso()}`,
      aoAbrir: (el) => el.querySelectorAll('.chip').forEach(c => c.onclick = () => {
        const ta = el.querySelector('#m-txt'); ta.value = (ta.value.trim() ? ta.value.trim() + ' ' : '') + c.dataset.w; ta.focus();
      }),
      botoes: [
        ...(ehPt && proprio ? [{ texto: 'Voltar ao automático', classe: 'sec esq', acao: () => salvarCelula(col, i, '') }] : []),
        { texto: 'Cancelar', classe: 'sec' },
        { texto: 'Salvar', acao: async (el) => { await salvarCelula(col, i, valor(el, '#m-txt')); } }]
    });
  }
  async function salvarCelula(col, i, val) {
    const linha = await D.gravar('celulas', { ...refAtual(), coluna: col, linha: i, valor: val }, ['livro', 'capitulo', 'versiculo', 'coluna', 'linha']);
    S.celulas.set(col + '|' + i, linha);
    atualizarTabela();
  }

  const listaTrad = (lst) => lst.length
    ? `<p class="trad-lista">${lst.map(x => `<span>${h(x)}</span>`).join('')}</p>`
    : '<p class="vazio">Sem traduções frequentes registradas.</p>';
  const notaTrad = '<p class="dica">Traduções mais frequentes deste termo na Bíblia Livre, em todo o Antigo Testamento.</p>';
  const verbeteEN = (e) => e && (e[2] || e[3]) ? `<details class="verbete"><summary>Verbete original de Strong (1890), em inglês</summary>
      <p><b>Definição:</b> ${h(e[2])}</p><p><b>Como a KJV traduziu:</b> ${h(e[3])}</p></details>` : '';

  function modalHebraico(i) {
    const r = ctx.v.he[i], L = ctx.dados.lex_he;
    const e = L[r[2]], raiz = r[3], er = raiz && L[raiz];
    modal({
      titulo: `Hebraico — palavra ${i + 1}`,
      corpo: `<div class="det-he">
          <p class="grande-he" lang="he" dir="rtl">${h(r[0])}</p>
          <p class="tr grande-tr">${h(r[1])}</p>
          <dl class="ficha">
            <dt>Morfologia</dt><dd>${h(r[4])}</dd>
            <dt>Lema (Strong)</dt><dd>${e ? `<span lang="he" dir="rtl">${h(e[0])}</span> ${h(e[1])} · ${h(r[2])}` : h(r[2])}</dd>
            <dt>Ocorrências</dt><dd>${r[5]} em ${h(ctx.livro.nome)} · ${r[6]} no Antigo Testamento</dd>
            ${er ? `<dt>Raiz</dt><dd><span lang="he" dir="rtl">${h(er[0])}</span> ${h(er[1])} · ${h(raiz)}${raiz === r[2] ? ' (raiz primitiva)' : ''}</dd>` : ''}
          </dl>
          ${er ? `<h3 class="sub">Traduções possíveis da raiz</h3>${listaTrad(tradHe(raiz))}${notaTrad}` : ''}
          ${verbeteEN(er && raiz !== r[2] ? er : e)}
        </div>`,
      botoes: [{ texto: 'Fechar' }]
    });
  }

  function modalStrongHe(i) {
    const r = ctx.v.he[i], e = ctx.dados.lex_he[r[2]];
    if (!r[2]) return toast('Palavra sem número Strong.');
    modal({
      titulo: `Strong ${r[2]}`,
      corpo: `<p class="ctx-he"><span lang="he" dir="rtl">${h(e ? e[0] : r[0])}</span> <span class="tr">${h(e ? e[1] : r[1])}</span></p>
        <dl class="ficha"><dt>Nesta ocorrência</dt><dd><span lang="he" dir="rtl">${h(r[0])}</span> — ${h(r[4])}</dd></dl>
        <h3 class="sub">Traduções</h3>${listaTrad(tradHe(r[2]))}${notaTrad}
        ${verbeteEN(e)}`,
      botoes: [{ texto: 'Fechar' }]
    });
  }

  function modalLxx(i) {
    const r = ctx.v.he[i];
    const { idx, auto } = gregoDaLinha(i);
    const gr = ctx.v.gr;
    modal({
      titulo: `Septuaginta — palavra ${i + 1}`,
      largo: true,
      corpo: `<p class="ctx-he"><span lang="he" dir="rtl">${h(r[0])}</span> <span class="tr">${h(r[1])}</span></p>
        <p class="dica">Escolha a palavra da LXX que corresponde a este termo hebraico.${r[7] >= 0 ? ` A sugestão automática (calculada sobre todo o AT) está marcada com ★.` : ''}</p>
        ${gr.length ? `<div class="chips gregas">${gr.map((g, j) => `<button type="button" class="chip grc ${j === idx ? 'ativo' : ''}" data-j="${j}" lang="grc" title="${h(g[1])} · ${h(g[2])} · ${h(g[4])}">${h(g[0])}${j === r[7] ? ' ★' : ''}</button>`).join('')}</div>` :
          '<p class="vazio">A LXX não tem este versículo nesta posição.</p>'}
        <div class="lxx-opcoes">
          <button type="button" class="btn sec pequeno" data-j="-1">Sem equivalente na LXX</button>
          ${!auto ? '<button type="button" class="btn sec pequeno" data-j="auto">Voltar à sugestão automática</button>' : ''}
        </div>`,
      aoAbrir: (el) => el.querySelectorAll('[data-j]').forEach(b => b.onclick = async () => {
        try {
          await salvarCelula('lxx', i, b.dataset.j === 'auto' ? '' : b.dataset.j);
          el.remove();
        } catch (e) { toast(e.message, true); }
      }),
      botoes: [{ texto: 'Fechar', classe: 'sec' }]
    });
  }

  function modalStrongGr(i) {
    const { g } = gregoDaLinha(i);
    if (!g) return modalLxx(i);
    const chave = chaveGrega(g), e = ctx.dados.lex_gr[chave];
    modal({
      titulo: g[3] ? `Strong ${g[3]}` : `Lema ${g[2]}`,
      corpo: `<p class="ctx-gr" lang="grc">${h(g[2])} <span class="tr">${h(e ? e[1] : '')}</span></p>
        <dl class="ficha"><dt>Nesta ocorrência</dt><dd><span lang="grc">${h(g[0])}</span> (${h(g[1])}) — ${h(g[4])}</dd></dl>
        <h3 class="sub">Traduções</h3>${listaTrad(tradGr(chave))}
        <p class="dica">Calculadas pelas palavras hebraicas que a LXX verte com este termo e pela forma como a Bíblia Livre as traduz.</p>
        ${verbeteEN(e)}`,
      botoes: [{ texto: 'Fechar' }]
    });
  }

  // ---------------------------------------------- traduções do usuário
  function modalTraducao(t) {
    modal({
      titulo: t ? 'Coluna de tradução' : 'Nova coluna de tradução',
      corpo: `<label class="campo">Nome da tradução<input id="m-nome" value="${h(t ? t.nome : '')}" placeholder="Ex.: Minha tradução, ARA, NVI" autofocus></label>
        <p class="dica">A coluna aparece ao lado de “Texto Bíblico”. Você escreve o texto em cada linha.</p>`,
      botoes: [
        ...(t ? [{ texto: 'Excluir coluna', classe: 'perigo esq', acao: async () => {
          if (!(await confirmar(`Excluir a coluna “${t.nome}”? O texto escrito nela fica guardado, mas deixa de aparecer.`))) return false;
          await D.apagar('traducoes_usuario', t.id);
          S.traducoes = S.traducoes.filter(x => x.id !== t.id); atualizarTabela();
        } }] : []),
        { texto: 'Cancelar', classe: 'sec' },
        { texto: 'Salvar', acao: async (el) => {
          const nome = valor(el, '#m-nome'); if (!nome) { toast('Dê um nome à tradução.', true); return false; }
          if (t) { const n = await D.alterar('traducoes_usuario', t.id, { nome }); Object.assign(t, n); }
          else S.traducoes.push(await D.inserir('traducoes_usuario', { nome, ordem: S.traducoes.length }));
          atualizarTabela();
        } }
      ]
    });
  }

  // ---------------------------------------------- obras (colunas de dicionário/comentário)
  const exemploRef = 'Ex.: NICHOL, Francis D. (ed.). Comentário bíblico adventista do sétimo dia. Tatuí: Casa Publicadora Brasileira, 2011. v. 1';
  function modalObraColuna(cat, o) {
    const categoria = o ? o.categoria : cat;
    const nomeCat = categoria === 'dicionario' ? 'dicionário ou léxico' : categoria === 'comentario' ? 'comentário exegético' : 'obra';
    modal({
      titulo: o ? o.titulo : `Cadastrar ${nomeCat}`,
      corpo: `<label class="campo">Título da obra <small>(nome da coluna)</small><input id="m-tit" value="${h(o ? o.titulo : '')}" placeholder="Ex.: Dicionário Bíblico Adventista" autofocus></label>
        <label class="campo">Referência bibliográfica completa<textarea id="m-ref" rows="3" placeholder="${h(exemploRef)}">${h(o ? o.referencia : '')}</textarea></label>
        <p class="dica">A página é perguntada em cada citação e entra no fim da referência automaticamente.</p>`,
      botoes: [
        ...(o ? [{ texto: 'Excluir', classe: 'perigo esq', acao: async () => {
          if (!(await confirmar(`Excluir “${o.titulo}” e todas as citações feitas dela?`))) return false;
          await D.apagar('obras', o.id);
          S.obras = S.obras.filter(x => x.id !== o.id); S.citacoes = S.citacoes.filter(c => c.obra_id !== o.id);
          atualizarTabela(); atualizarInferior();
        } }] : []),
        { texto: 'Cancelar', classe: 'sec' },
        { texto: 'Salvar', acao: async (el) => {
          const titulo = valor(el, '#m-tit'), referencia = valor(el, '#m-ref');
          if (!titulo || !referencia) { toast('Preencha o título e a referência.', true); return false; }
          if (o) Object.assign(o, await D.alterar('obras', o.id, { titulo, referencia }));
          else S.obras.push(await D.inserir('obras', { titulo, referencia, categoria, ordem: S.obras.length }));
          atualizarTabela(); atualizarInferior();
        } }
      ]
    });
  }

  // ---------------------------------------------- citações
  function cartaoCitacao(c) {
    const o = obraPorId(c.obra_id);
    return `<article class="cartao" data-cit="${h(c.id)}">
      <div class="cartao-acoes"><button class="icone" data-acao="editar-cit" title="Editar" aria-label="Editar">${I.edit}</button>
        <button class="icone" data-acao="apagar-cit" title="Excluir" aria-label="Excluir">${I.del}</button></div>
      <div class="cartao-caixa">
        <button class="icone copiar" data-acao="copiar-cit" title="Copiar citação e referência" aria-label="Copiar">${I.copy}</button>
        <span class="selo ${c.tipo}">Citação ${c.tipo}</span>
        <p class="cit-texto">${c.tipo === 'direta' ? `“${h(c.texto)}”` : h(c.texto)}</p>
        <p class="cit-ref">${h(refComPagina(o ? o.referencia : '(obra excluída)', c.pagina))}</p>
      </div>
    </article>`;
  }
  async function acaoCitacao(acao, id, aoMudar) {
    const c = S.citacoes.find(x => x.id === id); if (!c) return;
    if (acao === 'copiar-cit') return copiar(textoCitacao(c, obraPorId(c.obra_id)));
    if (acao === 'editar-cit') return modalCitacao({ citacao: c, aoSalvar: aoMudar });
    if (acao === 'apagar-cit') {
      if (!(await confirmar('Excluir esta citação?'))) return;
      try { await D.apagar('citacoes', id); } catch (e) { return toast(e.message, true); }
      S.citacoes = S.citacoes.filter(x => x.id !== id); aoMudar();
    }
  }

  function modalCitacoesCelula(o, i) {
    const r = ctx.v.he[i];
    const m = modal({
      titulo: o.titulo, largo: true,
      corpo: `<p class="ctx-he"><span lang="he" dir="rtl">${h(r[0])}</span> <span class="tr">${h(r[1])}</span> · palavra ${i + 1}</p><div class="lista-cit"></div>`,
      botoes: [{ texto: 'Fechar', classe: 'sec' }, { texto: '+ Adicionar citação', acao: () => {
        modalCitacao({ secao: 'celula', linha: i, obraFixa: o, aoSalvar: () => { atualizarTabela(); desenhar(); } });
        return false;
      } }]
    });
    const box = m.el.querySelector('.lista-cit');
    const desenhar = () => {
      const cs = citacoesCelula(o.id, i);
      box.innerHTML = cs.length ? cs.map(cartaoCitacao).join('') : '<p class="vazio">Nenhuma citação desta obra para esta palavra.</p>';
    };
    desenhar();
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-acao]'); if (!b) return;
      acaoCitacao(b.dataset.acao, b.closest('[data-cit]').dataset.cit, () => { atualizarTabela(); desenhar(); });
    });
  }

  // Pergunta sempre obra (ou só página e tipo, quando a obra já existe), tipo e página.
  function modalCitacao({ secao, linha = null, obraFixa = null, categoria = 'geral', citacao = null, aoSalvar }) {
    const editando = !!citacao;
    const obraInicial = editando ? obraPorId(citacao.obra_id) : obraFixa;
    const lista = S.obras.filter(o => o.categoria === categoria);
    const escolherObra = !obraInicial;
    modal({
      titulo: editando ? 'Editar citação' : 'Nova citação',
      largo: true,
      corpo: `
        ${escolherObra ? `
          <label class="campo">Obra
            <select id="m-obra">
              ${lista.map(o => `<option value="${h(o.id)}">${h(o.titulo)}</option>`).join('')}
              <option value="__nova" ${lista.length ? '' : 'selected'}>＋ Nova obra…</option>
            </select></label>
          <div id="m-nova" class="${lista.length ? 'oculto' : ''}">
            <label class="campo">Título da obra<input id="m-tit" placeholder="${categoria === 'ep' ? 'Ex.: Patriarcas e Profetas' : 'Ex.: História de Israel'}"></label>
            <label class="campo">Referência bibliográfica completa<textarea id="m-ref" rows="2" placeholder="${categoria === 'ep' ? 'Ex.: WHITE, Ellen G. Patriarcas e profetas. Tatuí: Casa Publicadora Brasileira, 2007' : h(exemploRef)}"></textarea></label>
          </div>` : `<p class="obra-fixa"><b>${h(obraInicial.titulo)}</b><br><span>${h(obraInicial.referencia)}</span></p>`}
        <div class="linha-campos">
          <fieldset class="campo tipo"><legend>Tipo de citação</legend>
            <label><input type="radio" name="m-tipo" value="direta" ${!editando || citacao.tipo === 'direta' ? 'checked' : ''}> Direta</label>
            <label><input type="radio" name="m-tipo" value="indireta" ${editando && citacao.tipo === 'indireta' ? 'checked' : ''}> Indireta</label>
          </fieldset>
          <label class="campo pagina">Página<input id="m-pag" value="${h(editando ? citacao.pagina : '')}" placeholder="Ex.: 215" inputmode="text"></label>
        </div>
        <label class="campo">Texto da citação<textarea id="m-texto" rows="6">${h(editando ? citacao.texto : '')}</textarea></label>
        <p class="previa-ref" id="m-previa"></p>`,
      aoAbrir: (el) => {
        const sel = el.querySelector('#m-obra');
        const previa = () => {
          let ref = '';
          if (obraInicial) ref = obraInicial.referencia;
          else if (sel.value === '__nova') ref = valor(el, '#m-ref');
          else ref = (obraPorId(sel.value) || {}).referencia;
          el.querySelector('#m-previa').textContent = ref ? 'Referência: ' + refComPagina(ref, valor(el, '#m-pag') || '__') : '';
        };
        if (sel) sel.onchange = () => { el.querySelector('#m-nova').classList.toggle('oculto', sel.value !== '__nova'); previa(); };
        el.addEventListener('input', previa); previa();
        const foco = el.querySelector(obraInicial ? '#m-pag' : (lista.length ? '#m-pag' : '#m-tit')); if (foco) setTimeout(() => foco.focus(), 30);
      },
      botoes: [{ texto: 'Cancelar', classe: 'sec' }, { texto: 'Salvar', acao: async (el) => {
        const tipo = el.querySelector('input[name="m-tipo"]:checked').value;
        const pagina = valor(el, '#m-pag'), texto = valor(el, '#m-texto');
        if (!pagina) { toast('Informe a página.', true); return false; }
        if (!texto) { toast('Escreva o texto da citação.', true); return false; }
        if (editando) {
          Object.assign(citacao, await D.alterar('citacoes', citacao.id, { tipo, pagina, texto }));
        } else {
          let obra = obraInicial;
          if (!obra) {
            const sel = el.querySelector('#m-obra').value;
            if (sel === '__nova') {
              const titulo = valor(el, '#m-tit'), referencia = valor(el, '#m-ref');
              if (!titulo || !referencia) { toast('Informe o título e a referência da obra.', true); return false; }
              obra = await D.inserir('obras', { titulo, referencia, categoria, ordem: S.obras.length });
              S.obras.push(obra);
            } else obra = obraPorId(sel);
          }
          S.citacoes.push(await D.inserir('citacoes', { ...refAtual(), obra_id: obra.id, secao, linha, tipo, pagina, texto }));
        }
        if (aoSalvar) aoSalvar();
      } }]
    });
  }

  // ---------------------------------------------- seção inferior
  const ABAS = [
    { id: 'ep', titulo: 'Espírito de Profecia' },
    { id: 'contexto', titulo: 'Contexto Histórico' },
    { id: 'mapa', titulo: 'Mapa' },
    { id: 'aplicacao', titulo: 'Aplicação' }
  ];
  const TIPOS_BLOCO = { ano: 'Ano', rei: 'Rei', cidade: 'Cidade', regiao: 'Região', tribo: 'Tribo', profetas: 'Profetas', personalizado: 'Personalizado' };
  const tituloBloco = (b) => b.titulo_tipo === 'personalizado' ? (b.titulo || 'Sem título') : TIPOS_BLOCO[b.titulo_tipo] || b.titulo;

  function inferiorHTML() {
    let corpo = '';
    if (S.aba === 'ep') {
      const cs = S.citacoes.filter(c => c.secao === 'ep');
      corpo = `<div class="lista-cit">${cs.map(cartaoCitacao).join('') || '<p class="vazio">Nenhuma citação do Espírito de Profecia neste versículo.</p>'}</div>
        <button class="btn add" data-acao="nova-cit" data-secao="ep">${I.plus} Adicionar citação do Espírito de Profecia</button>`;
    } else if (S.aba === 'contexto') {
      const blocos = S.blocos.filter(b => b.secao === 'contexto');
      const ano = blocos.find(b => b.titulo_tipo === 'ano');
      const outros = blocos.filter(b => b.titulo_tipo !== 'ano');
      const bloco = (b, fixo) => `<article class="bloco ${fixo ? 'fixo' : ''}" ${b ? `data-bloco="${h(b.id)}"` : 'data-bloco="novo-ano"'}>
          <header><h4>${h(b ? tituloBloco(b) : 'Ano')}</h4>
            <span class="bloco-acoes">${b ? `<button class="icone" data-acao="copiar-bloco" title="Copiar" aria-label="Copiar">${I.copy}</button>` : ''}
            <button class="icone" data-acao="editar-bloco" title="Editar" aria-label="Editar">${I.edit}</button>
            ${!fixo ? `<button class="icone" data-acao="apagar-bloco" title="Excluir" aria-label="Excluir">${I.del}</button>` : ''}</span></header>
          <p>${b && b.conteudo ? h(b.conteudo) : '<span class="vazio">Toque em editar para preencher.</span>'}</p>
        </article>`;
      const cs = S.citacoes.filter(c => c.secao === 'contexto');
      corpo = `<h3 class="sub">Blocos de informação</h3>
        <div class="blocos">${bloco(ano, true)}${outros.map(b => bloco(b, false)).join('')}
          <button class="bloco novo" data-acao="novo-bloco">${I.plus}<span>Adicionar bloco</span></button></div>
        <h3 class="sub">Citações teóricas</h3>
        <div class="lista-cit">${cs.map(cartaoCitacao).join('') || '<p class="vazio">Nenhuma citação de contexto histórico.</p>'}</div>
        <button class="btn add" data-acao="nova-cit" data-secao="contexto">${I.plus} Adicionar citação teórica</button>`;
    } else if (S.aba === 'mapa') {
      corpo = `<div class="em-breve"><p><b>Mapa</b></p><p>Esta área será configurada na próxima etapa.</p></div>`;
    } else {
      const bs = S.blocos.filter(b => b.secao === 'aplicacao');
      corpo = `<div class="lista-cit">${bs.map(b => `<article class="cartao" data-bloco="${h(b.id)}">
          <div class="cartao-acoes"><button class="icone" data-acao="editar-bloco" title="Editar" aria-label="Editar">${I.edit}</button>
            <button class="icone" data-acao="apagar-bloco" title="Excluir" aria-label="Excluir">${I.del}</button></div>
          <div class="cartao-caixa"><button class="icone copiar" data-acao="copiar-bloco" title="Copiar" aria-label="Copiar">${I.copy}</button>
            ${b.titulo ? `<h4>${h(b.titulo)}</h4>` : ''}<p class="cit-texto">${h(b.conteudo)}</p></div>
        </article>`).join('') || '<p class="vazio">Nenhum comentário homilético neste versículo.</p>'}</div>
        <button class="btn add" data-acao="novo-aplicacao">${I.plus} Adicionar comentário homilético</button>`;
    }
    return `<nav class="abas" role="tablist">${ABAS.map(a => `<button role="tab" aria-selected="${S.aba === a.id}" class="${S.aba === a.id ? 'ativa' : ''}" data-aba="${a.id}">${a.titulo}</button>`).join('')}</nav>
      <div class="aba-corpo">${corpo}</div>`;
  }
  function atualizarInferior() { const el = document.getElementById('inferior'); if (el) el.innerHTML = inferiorHTML(); }

  function ligarInferior() {
    document.getElementById('inferior').addEventListener('click', async (e) => {
      const aba = e.target.closest('[data-aba]');
      if (aba) { S.aba = aba.dataset.aba; store.set('aba', S.aba); return atualizarInferior(); }
      const b = e.target.closest('[data-acao]'); if (!b) return;
      const a = b.dataset.acao;
      if (a === 'nova-cit') {
        const secao = b.dataset.secao;
        return modalCitacao({ secao, categoria: secao === 'ep' ? 'ep' : 'geral', aoSalvar: atualizarInferior });
      }
      if (a.endsWith('-cit')) return acaoCitacao(a, b.closest('[data-cit]').dataset.cit, atualizarInferior);
      if (a === 'novo-bloco') return modalBloco({ secao: 'contexto' });
      if (a === 'novo-aplicacao') return modalBloco({ secao: 'aplicacao' });
      const el = b.closest('[data-bloco]'); if (!el) return;
      const id = el.dataset.bloco;
      if (id === 'novo-ano') return modalBloco({ secao: 'contexto', tipoFixo: 'ano' });
      const bl = S.blocos.find(x => x.id === id);
      if (a === 'editar-bloco') return modalBloco({ bloco: bl, secao: bl.secao });
      if (a === 'copiar-bloco') return copiar((bl.secao === 'contexto' ? tituloBloco(bl) + ': ' : (bl.titulo ? bl.titulo + '\n' : '')) + bl.conteudo);
      if (a === 'apagar-bloco') {
        if (!(await confirmar('Excluir este bloco?'))) return;
        try { await D.apagar('blocos', id); } catch (err) { return toast(err.message, true); }
        S.blocos = S.blocos.filter(x => x.id !== id); atualizarInferior();
      }
    });
  }

  function modalBloco({ bloco = null, secao, tipoFixo = null }) {
    const ehContexto = secao === 'contexto';
    const tipo = bloco ? bloco.titulo_tipo : (tipoFixo || (ehContexto ? 'rei' : 'personalizado'));
    const fixoAno = tipo === 'ano';
    modal({
      titulo: ehContexto ? (fixoAno ? 'Ano' : (bloco ? 'Editar bloco' : 'Novo bloco de informação')) : (bloco ? 'Editar comentário homilético' : 'Novo comentário homilético'),
      largo: !ehContexto,
      corpo: `${ehContexto && !fixoAno ? `<label class="campo">Título do bloco<select id="m-tipo">
            ${Object.entries(TIPOS_BLOCO).filter(([k]) => k !== 'ano').map(([k, v]) => `<option value="${k}" ${k === tipo ? 'selected' : ''}>${v}</option>`).join('')}
          </select></label>` : ''}
        <label class="campo ${ehContexto && tipo !== 'personalizado' ? 'oculto' : ''}" id="m-titwrap">${ehContexto ? 'Título personalizado' : 'Título (opcional)'}
          <input id="m-tit" value="${h(bloco ? bloco.titulo : '')}"></label>
        <label class="campo">${fixoAno ? 'Ano / período' : 'Conteúdo'}<textarea id="m-cont" rows="${ehContexto ? 4 : 8}" autofocus placeholder="${fixoAno ? 'Ex.: c. 1450 a.C. (data tradicional do Êxodo)' : ''}">${h(bloco ? bloco.conteudo : '')}</textarea></label>`,
      aoAbrir: (el) => {
        const s = el.querySelector('#m-tipo');
        if (s) s.onchange = () => el.querySelector('#m-titwrap').classList.toggle('oculto', s.value !== 'personalizado');
      },
      botoes: [{ texto: 'Cancelar', classe: 'sec' }, { texto: 'Salvar', acao: async (el) => {
        const s = el.querySelector('#m-tipo');
        const titulo_tipo = fixoAno ? 'ano' : (s ? s.value : 'personalizado');
        const titulo = el.querySelector('#m-tit') ? valor(el, '#m-tit') : '';
        const conteudo = valor(el, '#m-cont');
        if (!conteudo) { toast('Escreva o conteúdo.', true); return false; }
        if (titulo_tipo === 'personalizado' && ehContexto && !titulo) { toast('Dê um título ao bloco.', true); return false; }
        if (bloco) Object.assign(bloco, await D.alterar('blocos', bloco.id, { titulo_tipo, titulo, conteudo }));
        else S.blocos.push(await D.inserir('blocos', { ...refAtual(), secao, titulo_tipo, titulo, conteudo, ordem: S.blocos.length }));
        atualizarInferior();
      } }]
    });
  }

  // ------------------------------------------------------------------ fontes e licenças
  function modalFontes() {
    modal({
      titulo: 'Fontes e licenças', largo: true,
      corpo: `<div class="fontes">
        <h3>Texto em português</h3>
        <p>Todas as Escrituras em português citadas são da <b>Bíblia Livre (BLIVRE)</b>, Copyright © Diego Santos, Mario Sérgio e Marco Teles, http://sites.google.com/site/biblialivre/ — fevereiro de 2018. Licença Creative Commons Atribuição 4.0 (CC BY 4.0). Reprodução permitida desde que devidamente mencionados fonte e autores. Texto obtido de eBible.org (porbr2018).</p>
        <h3>Texto hebraico</h3>
        <p><b>Westminster Leningrad Codex</b> (domínio público), com lemas e morfologia da <b>Open Scriptures Hebrew Bible</b> (OSHB), licença CC BY 4.0. A descrição morfológica em português e a transliteração foram geradas a partir desses códigos.</p>
        <h3>Septuaginta</h3>
        <p>Edição de <b>Rahlfs (1935)</b>, dados do projeto CenterBLC/LXX (licença MIT). A ligação de cada palavra hebraica à palavra grega é uma <b>sugestão estatística</b> (calculada sobre todo o AT) e pode ser corrigida em cada linha.</p>
        <h3>Léxico</h3>
        <p><b>Strong’s Exhaustive Concordance</b> (1890), hebraico e grego, em domínio público (Open Scriptures). O verbete original, em inglês, aparece só para consulta.</p>
        <h3>Traduções e correspondência com o português</h3>
        <p>As traduções de cada termo e de cada raiz, e a palavra portuguesa de cada linha da coluna “Texto Bíblico”, foram calculadas por alinhamento estatístico entre o texto hebraico e a Bíblia Livre em todo o Antigo Testamento (modelo de alinhamento palavra a palavra, nas duas direções). É um levantamento de como a Bíblia Livre de fato verte cada termo, não um dicionário. A correspondência de cada linha pode ser corrigida.</p>
        <h3>Contagens</h3>
        <p>Ocorrências contadas por lema (número Strong) no livro e em todo o Antigo Testamento hebraico.</p>
      </div>`,
      botoes: [{ texto: 'Fechar' }]
    });
  }

  iniciar().catch(e => { console.error(e); toast(e.message, true); });
})();
