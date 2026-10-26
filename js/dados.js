// Camada de dados: Supabase (padrão) ou modo demonstração (?demo=1, só no navegador).
(function () {
  const TABELAS = ['traducoes_usuario', 'celulas', 'lexico_usuario', 'obras', 'citacoes', 'blocos'];
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }));

  // ---------------------------------------------------------- Supabase
  function criarSupabase() {
    const cfg = window.APP_CONFIG;
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
    let userId = null;
    const falha = (error) => { if (error) throw new Error(error.message || String(error)); };
    return {
      modo: 'supabase',
      sb,
      async sessao() {
        const { data } = await sb.auth.getSession();
        userId = data.session ? data.session.user.id : null;
        return data.session ? data.session.user : null;
      },
      aoMudarSessao(fn) {
        sb.auth.onAuthStateChange((_ev, s) => { userId = s ? s.user.id : null; fn(s ? s.user : null); });
      },
      async entrarGithub() {
        const redirectTo = location.origin + location.pathname;
        const { error } = await sb.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } });
        falha(error);
      },
      async entrarEmail(email, senha) {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha }); falha(error);
      },
      async criarConta(email, senha) {
        const { data, error } = await sb.auth.signUp({ email, password: senha,
          options: { emailRedirectTo: location.origin + location.pathname } });
        falha(error);
        return !!data.session;
      },
      async sair() { await sb.auth.signOut(); },
      async listar(tabela, filtro = {}, ordem = 'criado_em') {
        let q = sb.from(tabela).select('*');
        for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v);
        if (ordem) q = q.order(ordem, { ascending: true });
        const { data, error } = await q; falha(error); return data || [];
      },
      async inserir(tabela, linha) {
        const { data, error } = await sb.from(tabela).insert({ ...linha, user_id: userId }).select().single();
        falha(error); return data;
      },
      async alterar(tabela, id, patch) {
        const { data, error } = await sb.from(tabela).update(patch).eq('id', id).select().single();
        falha(error); return data;
      },
      async apagar(tabela, id) {
        const { error } = await sb.from(tabela).delete().eq('id', id); falha(error);
      },
      async gravar(tabela, linha, chaves) {
        const { data, error } = await sb.from(tabela)
          .upsert({ ...linha, user_id: userId, atualizado_em: new Date().toISOString() },
            { onConflict: ['user_id', ...chaves].join(',') })
          .select().single();
        falha(error); return data;
      }
    };
  }

  // ---------------------------------------------------------- demonstração (local)
  function criarLocal() {
    const CHAVE = 'biblia-exegese-demo';
    let banco = {};
    try { banco = JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch (e) { banco = {}; }
    TABELAS.forEach(t => { banco[t] = banco[t] || []; });
    const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(banco)); } catch (e) { /* sem armazenamento */ } };
    const usuario = { id: 'demo', email: 'demonstração', user_metadata: { user_name: 'Demonstração' } };
    return {
      modo: 'demo',
      async sessao() { return usuario; },
      aoMudarSessao() {},
      async entrarGithub() {}, async entrarEmail() {}, async criarConta() { return true; },
      async sair() { location.href = location.pathname; },
      async listar(tabela, filtro = {}, ordem = 'criado_em') {
        let r = banco[tabela].filter(l => Object.entries(filtro).every(([k, v]) => l[k] === v));
        if (ordem) r = r.slice().sort((a, b) => (a[ordem] > b[ordem] ? 1 : a[ordem] < b[ordem] ? -1 : 0));
        return r.map(x => ({ ...x }));
      },
      async inserir(tabela, linha) {
        const l = { id: uuid(), user_id: 'demo', criado_em: new Date().toISOString(), ...linha };
        banco[tabela].push(l); salvar(); return { ...l };
      },
      async alterar(tabela, id, patch) {
        const l = banco[tabela].find(x => x.id === id); Object.assign(l, patch); salvar(); return { ...l };
      },
      async apagar(tabela, id) {
        banco[tabela] = banco[tabela].filter(x => x.id !== id);
        if (tabela === 'obras') banco.citacoes = banco.citacoes.filter(c => c.obra_id !== id);
        salvar();
      },
      async gravar(tabela, linha, chaves) {
        let l = banco[tabela].find(x => chaves.every(k => x[k] === linha[k]));
        if (l) Object.assign(l, linha, { atualizado_em: new Date().toISOString() });
        else { l = { id: uuid(), user_id: 'demo', criado_em: new Date().toISOString(), ...linha }; banco[tabela].push(l); }
        salvar(); return { ...l };
      }
    };
  }

  const demo = new URLSearchParams(location.search).has('demo');
  window.DADOS = demo ? criarLocal() : (window.supabase ? criarSupabase() : null);
})();
