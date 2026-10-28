/**
 * nuvem.js — Conversa com o Supabase (login e tabela `itens`) usando só fetch, sem biblioteca.
 *
 * A chave "anon public" é pública por natureza: ela pode ficar no código do site.
 * Quem protege os dados são as regras (RLS) da tabela: cada conta só lê e grava o que é dela.
 * NUNCA coloque aqui a chave "service_role".
 *
 * A sessão (tokens de acesso) fica no localStorage deste aparelho.
 */

export const NUVEM_PADRAO = {
  url: 'https://svtvaahkldhjslvvqiir.supabase.co',
  chave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dHZhYWhrbGRoanNsdnZxaWlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTI3NDAsImV4cCI6MjEwODUyODc0MH0.LjkZAhsSdIOtBSesH390DefqGId2E9cSSCAamrCyP7c',
};

const CHAVE_SESSAO = 'miniengine.nuvem.sessao';
const TEMPO_LIMITE = 45_000;

let config = { ...NUVEM_PADRAO };

/** Troca o servidor (usado nos testes, com um Supabase de mentira). */
export function configurarNuvem({ url, chave } = {}) {
  config = { url: (url || NUVEM_PADRAO.url).replace(/\/+$/, ''), chave: chave || NUVEM_PADRAO.chave };
}

export class ErroDaNuvem extends Error {
  constructor(codigo, mensagem, status = 0) {
    super(mensagem);
    this.name = 'ErroDaNuvem';
    this.codigo = codigo;
    this.status = status;
  }
}

/* ---------- onde a sessão fica (localStorage; memória se não houver) ---------- */

const memoria = new Map();
function guardado() {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch { /* bloqueado */ }
  return {
    getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => memoria.set(k, String(v)),
    removeItem: (k) => memoria.delete(k),
  };
}

/** { access_token, refresh_token, expires_at (segundos), user: { id, email } } ou null */
export function sessaoAtual() {
  try {
    const s = JSON.parse(guardado().getItem(CHAVE_SESSAO) || 'null');
    return s && s.access_token && s.refresh_token && s.user?.id ? s : null;
  } catch {
    return null;
  }
}

function guardarSessao(r) {
  const sessao = {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: r.expires_at || Math.floor(Date.now() / 1000) + (r.expires_in || 3600),
    user: { id: r.user?.id, email: r.user?.email },
  };
  guardado().setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  return sessao;
}

const apagarSessao = () => guardado().removeItem(CHAVE_SESSAO);

/* ---------- chamadas ---------- */

const MENSAGENS = {
  invalid_credentials: 'E-mail ou senha errados.',
  user_already_exists: 'Já existe uma conta com esse e-mail. Use “Entrar”.',
  email_exists: 'Já existe uma conta com esse e-mail. Use “Entrar”.',
  signup_disabled: 'Criar conta está desligado no Supabase (Allow new users to sign up). Use “Entrar” com a conta que já existe.',
  email_not_confirmed: 'Esse e-mail ainda não foi confirmado. No Supabase, desligue “Confirm email” (Authentication → Sign In / Providers → Email) ou confirme pelo link que chegou no e-mail.',
  weak_password: 'Senha fraca: use pelo menos 6 caracteres.',
  validation_failed: 'Confira o e-mail digitado.',
  email_address_invalid: 'Esse e-mail não é válido.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
  refresh_token_not_found: 'Sua sessão expirou. Entre de novo.',
  refresh_token_already_used: 'Sua sessão expirou. Entre de novo.',
  session_not_found: 'Sua sessão expirou. Entre de novo.',
};

async function lerCorpo(resposta) {
  const texto = await resposta.text();
  if (!texto) return null;
  try { return JSON.parse(texto); } catch { return { mensagem: texto.slice(0, 300) }; }
}

function erroDaResposta(status, corpo) {
  const codigo = corpo?.error_code || corpo?.code || corpo?.error || '';
  const original = corpo?.msg || corpo?.message || corpo?.error_description || corpo?.mensagem || '';
  if (MENSAGENS[codigo]) return new ErroDaNuvem(codigo, MENSAGENS[codigo], status);
  if (/invalid login/i.test(original)) return new ErroDaNuvem('invalid_credentials', MENSAGENS.invalid_credentials, status);
  if (/already registered/i.test(original)) return new ErroDaNuvem('user_already_exists', MENSAGENS.user_already_exists, status);
  if (/password/i.test(original) && /least|weak|short/i.test(original)) return new ErroDaNuvem('weak_password', MENSAGENS.weak_password, status);
  if (codigo === 'PGRST205' || codigo === '42P01' || /relation .*itens.* does not exist|could not find the table/i.test(original)) {
    return new ErroDaNuvem('sem_tabela', 'A tabela “itens” não existe no Supabase. Rode o SQL de criação no SQL Editor (está no README, seção Sincronização).', status);
  }
  if (codigo === '42501' || /row-level security|permission denied/i.test(original)) {
    return new ErroDaNuvem('sem_permissao', 'O Supabase recusou a gravação (regras de acesso). Confira se o SQL de criação rodou inteiro.', status);
  }
  if (status === 413) return new ErroDaNuvem('grande_demais', 'Um item é grande demais para enviar (provavelmente uma imagem de inspiração muito grande).', status);
  if (status === 401) return new ErroDaNuvem('nao_autorizado', 'Sua sessão expirou. Entre de novo.', status);
  if (status >= 500) return new ErroDaNuvem('servidor', `O Supabase está com problema agora (erro ${status}). Tente daqui a pouco. Se o projeto ficou parado mais de 7 dias, reative-o no painel do Supabase.`, status);
  return new ErroDaNuvem(codigo || 'erro', `Erro do Supabase (${status}): ${original || 'sem detalhes'}`, status);
}

async function chamar(caminho, { metodo = 'GET', corpo, token, cabecalhos = {} } = {}) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE);
  let resposta;
  try {
    resposta = await fetch(`${config.url}${caminho}`, {
      method: metodo,
      headers: {
        apikey: config.chave,
        Authorization: `Bearer ${token || config.chave}`,
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...cabecalhos,
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
    });
  } catch (erro) {
    throw new ErroDaNuvem('sem_rede', erro?.name === 'AbortError'
      ? 'O Supabase demorou demais para responder. Tente de novo.'
      : 'Sem conexão com a internet (ou o Supabase não respondeu).');
  } finally {
    clearTimeout(relogio);
  }
  const dados = await lerCorpo(resposta);
  if (!resposta.ok) throw erroDaResposta(resposta.status, dados);
  return dados;
}

/* ---------- conta ---------- */

const emailLimpo = (email) => String(email ?? '').trim().toLowerCase();

function exigirCampos(email, senha) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo(email))) throw new ErroDaNuvem('validation_failed', 'Digite um e-mail válido.');
  if (String(senha ?? '').length < 6) throw new ErroDaNuvem('weak_password', MENSAGENS.weak_password);
}

export async function entrar(email, senha) {
  exigirCampos(email, senha);
  const r = await chamar('/auth/v1/token?grant_type=password', { metodo: 'POST', corpo: { email: emailLimpo(email), password: senha } });
  return guardarSessao(r);
}

export async function criarConta(email, senha) {
  exigirCampos(email, senha);
  const r = await chamar('/auth/v1/signup', { metodo: 'POST', corpo: { email: emailLimpo(email), password: senha } });
  if (!r?.access_token) {
    throw new ErroDaNuvem('confirmar_email', 'Conta criada, mas o Supabase está pedindo confirmação por e-mail. Desligue “Confirm email” (Authentication → Sign In / Providers → Email) e use “Entrar”, ou confirme pelo link do e-mail.');
  }
  return guardarSessao(r);
}

/** Sai NESTE aparelho (os dados locais ficam). */
export async function sair() {
  const s = sessaoAtual();
  apagarSessao();
  if (s) await chamar('/auth/v1/logout', { metodo: 'POST', token: s.access_token }).catch(() => {});
}

let renovando = null;

/** Token válido (renova se estiver para vencer). Lança 'sessao_expirada' se não der. */
export async function tokenValido({ forcar = false } = {}) {
  const s = sessaoAtual();
  if (!s) throw new ErroDaNuvem('sem_sessao', 'Entre na sua conta para sincronizar.');
  if (!forcar && s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  if (!renovando) {
    renovando = chamar('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', corpo: { refresh_token: s.refresh_token } })
      .then((r) => guardarSessao(r).access_token)
      .catch((erro) => {
        if (erro.codigo !== 'sem_rede' && erro.status >= 400 && erro.status < 500) {
          apagarSessao();
          throw new ErroDaNuvem('sessao_expirada', 'Sua sessão expirou. Entre de novo na tela Nuvem.', erro.status);
        }
        throw erro;
      })
      .finally(() => { renovando = null; });
  }
  return renovando;
}

/** Chamada à API de dados (PostgREST) com o token da conta; renova e tenta uma vez de novo se vencer. */
export async function rest(caminho, opcoes = {}) {
  const token = await tokenValido();
  try {
    return await chamar(`/rest/v1/${caminho}`, { ...opcoes, token });
  } catch (erro) {
    if (erro.status !== 401) throw erro;
    return chamar(`/rest/v1/${caminho}`, { ...opcoes, token: await tokenValido({ forcar: true }) });
  }
}
