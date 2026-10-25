/**
 * ia.js — Módulo de IA único do Mini Engine (Gemini e OpenRouter), só com fetch.
 *
 * - As CHAVES ficam só no localStorage deste aparelho (nunca no código, nunca na nuvem,
 *   nunca no backup). São enviadas apenas ao provedor escolhido.
 * - `conversar({ modelo, sistema, mensagens })` manda a conversa e devolve o texto da resposta.
 *   mensagens: [{ papel: 'usuario' | 'ia', texto, imagens?: [dataURL] }]
 * - Os modelos são listados direto do provedor (assim o seletor acompanha os modelos novos).
 *
 * Usado pelo "Criar jogo" e, depois, pelo "Solicitar IA" dos sprites.
 */

export const PROVEDORES = {
  gemini: {
    nome: 'Gemini (Google)',
    ondePegar: 'https://aistudio.google.com/apikey',
    dica: 'Entre com sua conta Google no AI Studio e toque em “Create API key”. O plano grátis basta para começar.',
    padrao: 'gemini-2.5-flash',
  },
  openrouter: {
    nome: 'OpenRouter',
    ondePegar: 'https://openrouter.ai/keys',
    dica: 'Crie uma conta no OpenRouter e gere uma chave em “Keys”. Uma chave dá acesso a vários modelos; os marcados “grátis” não cobram.',
    padrao: 'google/gemini-2.5-flash',
  },
};

const URL_GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const URL_OPENROUTER = 'https://openrouter.ai/api/v1';
const CHAVE_LS = (p) => `miniengine.ia.chave.${p}`;
const MODELO_LS = 'miniengine.ia.modelo';
const TEMPO_LIMITE = 240_000;

export class ErroDaIA extends Error {
  constructor(codigo, mensagem, status = 0) {
    super(mensagem);
    this.name = 'ErroDaIA';
    this.codigo = codigo;
    this.status = status;
  }
}

/* ---------- chaves e modelo escolhido (só neste aparelho) ---------- */

const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function lerChave(provedor) {
  return ls()?.getItem(CHAVE_LS(provedor)) || '';
}
export function gravarChave(provedor, chave) {
  const limpa = String(chave ?? '').trim();
  if (limpa) ls()?.setItem(CHAVE_LS(provedor), limpa);
  else ls()?.removeItem(CHAVE_LS(provedor));
}
export const temAlgumaChave = () => Object.keys(PROVEDORES).some((p) => lerChave(p));

/** Modelo escolhido: { provedor, id } (ou o padrão do primeiro provedor com chave). */
export function modeloEscolhido() {
  try {
    const m = JSON.parse(ls()?.getItem(MODELO_LS) || 'null');
    if (m && PROVEDORES[m.provedor] && m.id) return m;
  } catch { /* nada */ }
  const p = Object.keys(PROVEDORES).find((x) => lerChave(x)) || 'gemini';
  return { provedor: p, id: PROVEDORES[p].padrao };
}
export function escolherModelo(m) {
  ls()?.setItem(MODELO_LS, JSON.stringify({ provedor: m.provedor, id: m.id }));
}

/* ---------- HTTP ---------- */

async function chamar(url, opcoes) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), opcoes.tempo || TEMPO_LIMITE);
  let resposta;
  try {
    resposta = await fetch(url, { ...opcoes, signal: opcoes.signal || controle.signal });
  } catch (erro) {
    if (erro?.name === 'AbortError') {
      throw new ErroDaIA(opcoes.signal?.aborted ? 'cancelado' : 'demorou', opcoes.signal?.aborted ? 'Pedido cancelado.' : 'A IA demorou demais para responder. Tente de novo (ou peça algo menor).');
    }
    throw new ErroDaIA('sem_rede', 'Sem conexão com a internet (ou o provedor da IA não respondeu).');
  } finally {
    clearTimeout(relogio);
  }
  const texto = await resposta.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { bruto: texto.slice(0, 300) }; }
  return { ok: resposta.ok, status: resposta.status, corpo };
}

function erroHttp(provedor, status, corpo) {
  const msg = corpo?.error?.message || corpo?.error?.metadata?.raw || corpo?.message || corpo?.bruto || '';
  const nome = PROVEDORES[provedor].nome;
  if (status === 400 && /api key not valid|API_KEY_INVALID/i.test(msg)) return new ErroDaIA('chave', `A chave do ${nome} não é válida. Confira em “Modelo IA”.`, status);
  if (status === 401 || status === 403) return new ErroDaIA('chave', `O ${nome} recusou a chave (${status}). Confira em “Modelo IA”.${msg ? ` Detalhe: ${msg}` : ''}`, status);
  if (status === 402) return new ErroDaIA('credito', `Sem créditos no ${nome} para esse modelo. Escolha um modelo “grátis” ou adicione créditos.`, status);
  if (status === 404) return new ErroDaIA('modelo', `O modelo escolhido não existe (ou não está liberado para a sua chave) no ${nome}. Escolha outro em “Modelo IA”.`, status);
  if (status === 429) return new ErroDaIA('limite', `Limite de uso do ${nome} atingido por agora. Espere um pouco ou troque de modelo.${msg ? ` (${msg.slice(0, 160)})` : ''}`, status);
  if (status >= 500) return new ErroDaIA('servidor', `O ${nome} está com problema agora (${status}). Tente de novo daqui a pouco.`, status);
  return new ErroDaIA('erro', `Erro do ${nome} (${status}): ${msg || 'sem detalhes'}`, status);
}

function exigirChave(provedor) {
  const chave = lerChave(provedor);
  if (!chave) throw new ErroDaIA('sem_chave', `Falta a chave do ${PROVEDORES[provedor].nome}. Toque em “Modelo IA” e cole a sua.`);
  return chave;
}

const separarDataUrl = (url) => {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url || '');
  return m ? { mime: m[1], dados: m[2] } : null;
};

/* ---------- listar modelos ---------- */

const ehGeminiDeTexto = (id) => /^gemini-/.test(id) && !/(embedding|image|tts|audio|live|vision|aqa|robotics|computer-use)/.test(id);

/** [{ provedor, id, nome, gratis? }] — os mais úteis primeiro. */
export async function listarModelos(provedor) {
  if (provedor === 'gemini') {
    const chave = exigirChave('gemini');
    const r = await chamar(`${URL_GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': chave }, tempo: 20_000 });
    if (!r.ok) throw erroHttp('gemini', r.status, r.corpo);
    return (r.corpo?.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({ provedor, id: String(m.name).replace(/^models\//, ''), nome: m.displayName || m.name }))
      .filter((m) => ehGeminiDeTexto(m.id))
      .sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
  }
  const r = await chamar(`${URL_OPENROUTER}/models`, { tempo: 20_000 });
  if (!r.ok) throw erroHttp('openrouter', r.status, r.corpo);
  return (r.corpo?.data || [])
    .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes('text'))
    .map((m) => ({
      provedor,
      id: m.id,
      nome: m.name || m.id,
      gratis: String(m.pricing?.prompt) === '0' && String(m.pricing?.completion) === '0',
      imagens: (m.architecture?.input_modalities || []).includes('image'),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/* ---------- conversar ---------- */

/**
 * @returns { texto, modelo, uso? }
 */
export async function conversar({ modelo = modeloEscolhido(), sistema, mensagens, temperatura = 0.4, sinal } = {}) {
  const { provedor, id } = modelo;
  if (!PROVEDORES[provedor]) throw new ErroDaIA('provedor', 'Provedor de IA desconhecido.');
  const chave = exigirChave(provedor);

  if (provedor === 'gemini') {
    const contents = mensagens.map((m) => ({
      role: m.papel === 'ia' ? 'model' : 'user',
      parts: [
        ...(m.imagens || []).map(separarDataUrl).filter(Boolean).map((i) => ({ inlineData: { mimeType: i.mime, data: i.dados } })),
        { text: m.texto || ' ' },
      ],
    }));
    const r = await chamar(`${URL_GEMINI}/models/${encodeURIComponent(id)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({
        systemInstruction: sistema ? { parts: [{ text: sistema }] } : undefined,
        contents,
        generationConfig: { temperature: temperatura },
      }),
      signal: sinal,
    });
    if (!r.ok) throw erroHttp('gemini', r.status, r.corpo);
    if (r.corpo?.promptFeedback?.blockReason) {
      throw new ErroDaIA('bloqueado', `O Gemini recusou o pedido (${r.corpo.promptFeedback.blockReason}). Tente escrever de outro jeito.`);
    }
    const cand = r.corpo?.candidates?.[0];
    const texto = (cand?.content?.parts || []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
    if (!texto.trim()) {
      throw new ErroDaIA('vazio', cand?.finishReason === 'MAX_TOKENS'
        ? 'A resposta ficou grande demais e foi cortada. Peça uma parte de cada vez.'
        : `A IA não devolveu texto${cand?.finishReason ? ` (${cand.finishReason})` : ''}. Tente de novo.`);
    }
    return { texto, modelo, cortada: cand?.finishReason === 'MAX_TOKENS', uso: r.corpo?.usageMetadata || null };
  }

  // OpenRouter (formato OpenAI)
  const messages = [];
  if (sistema) messages.push({ role: 'system', content: sistema });
  for (const m of mensagens) {
    const imagens = m.imagens || [];
    messages.push({
      role: m.papel === 'ia' ? 'assistant' : 'user',
      content: imagens.length
        ? [{ type: 'text', text: m.texto || ' ' }, ...imagens.map((url) => ({ type: 'image_url', image_url: { url } }))]
        : (m.texto || ' '),
    });
  }
  const r = await chamar(`${URL_OPENROUTER}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chave}`,
      'HTTP-Referer': globalThis.location?.origin || 'https://mini-engine.local',
      'X-Title': 'Mini Engine',
    },
    body: JSON.stringify({ model: id, messages, temperature: temperatura }),
    signal: sinal,
  });
  if (!r.ok) throw erroHttp('openrouter', r.status, r.corpo);
  if (r.corpo?.error) throw erroHttp('openrouter', r.corpo.error.code || 500, r.corpo);
  const escolha = r.corpo?.choices?.[0];
  const conteudo = escolha?.message?.content;
  const texto = Array.isArray(conteudo) ? conteudo.map((c) => c.text || '').join('') : (conteudo || '');
  if (!texto.trim()) throw new ErroDaIA('vazio', 'A IA não devolveu texto. Tente de novo ou troque de modelo.');
  return { texto, modelo, cortada: escolha?.finish_reason === 'length', uso: r.corpo?.usage || null };
}
