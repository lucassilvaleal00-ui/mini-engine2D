/**
 * transformar-ia.js — Os pedidos às IAs de desenho do "Transformar imagem" (PixelLab e SpriteCook).
 * Sem DOM: recebe e devolve PNG em base64; quem decodifica é a tela. Roda no Node nos testes
 * (com um fetch falso).
 *
 * Em vez de uma "skill" externa, as regras de uma boa pixel art para jogo (as mesmas de um
 * "sprite sheet creator") vão no próprio pedido, e o acabamento é feito pelas ferramentas do
 * editor (pixelizar.js): a resposta da IA sempre volta encaixada na grade escolhida e na paleta.
 */

import { lerChave } from '../core/ia.js';

export const URL_PIXELLAB = 'https://api.pixellab.ai/v1';
export const URL_SPRITECOOK = 'https://api.spritecook.ai/v1/api';
const TEMPO = 180_000;

/** Escalas oferecidas na tela (lado da grade, em pixels). */
export const ESCALAS = [16, 24, 32, 48, 64, 96, 128];

export const PERSPECTIVAS = {
  isometrico: { nome: 'Isométrico', texto: 'isometric view (2:1 isometric angle, seen from above at 45 degrees)' },
  frente: { nome: 'Top down (de frente)', texto: 'top-down RPG view, character/object facing the camera (front view, slightly from above)' },
};

/** As "regras da casa" de pixel art para sprites de jogo (fazem o papel da skill). */
export const REGRAS_DE_PIXEL_ART = [
  'clean pixel art sprite for a 2D mobile game',
  'every pixel aligned to the grid, hard edges, no anti-aliasing, no blur, no gradients, no dithering noise',
  'limited palette (at most 16 colors), strong readable silhouette, 1-pixel dark outline',
  'subject centered, fills the canvas, nothing cut off',
  'transparent background, no shadow on the ground, no text, no frame',
].join('; ');

export class ErroDeDesenho extends Error {
  constructor(mensagem, status = 0) {
    super(mensagem);
    this.name = 'ErroDeDesenho';
    this.status = status;
  }
}

/** Texto do pedido (em inglês: as duas IAs entendem melhor). */
export function montarDescricao({ descricao = '', perspectiva = null, lado }) {
  const partes = [
    descricao.trim() ? `${descricao.trim()}, redrawn as pixel art` : 'the same subject as the reference image, redrawn as pixel art',
    'keep the same shapes, proportions, pose and colors of the reference image',
    perspectiva ? PERSPECTIVAS[perspectiva].texto : 'same camera angle as the reference image',
    `${lado}x${lado} pixels`,
    REGRAS_DE_PIXEL_ART,
  ];
  return partes.join('. ');
}

async function chamar(url, { metodo = 'GET', chave, corpo, sinal, nome }) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO);
  const parar = () => controle.abort();
  sinal?.addEventListener('abort', parar);
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: { Authorization: `Bearer ${chave}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
    });
  } catch (erro) {
    if (sinal?.aborted) throw new ErroDeDesenho('Pedido cancelado.');
    if (erro?.name === 'AbortError') throw new ErroDeDesenho(`A ${nome} demorou demais para responder. Tente de novo.`);
    throw new ErroDeDesenho(`Não consegui falar com a ${nome} (sem internet, ou o navegador bloqueou o pedido).`);
  } finally {
    clearTimeout(relogio);
    sinal?.removeEventListener('abort', parar);
  }
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { bruto: texto.slice(0, 200) }; }
  if (!r.ok) throw erroHttp(nome, r.status, dados);
  return dados;
}

function erroHttp(nome, status, dados) {
  const det = dados?.detail;
  const msg = (typeof det === 'string' ? det : Array.isArray(det) ? det.map((d) => d.msg || '').join('; ') : '') || dados?.error?.message || dados?.error || dados?.message || dados?.bruto || '';
  if (status === 401 || status === 403) return new ErroDeDesenho(`A ${nome} recusou a chave (${status}). Confira em “Modelo IA” do editor.${msg ? ` Detalhe: ${msg}` : ''}`, status);
  if (status === 402) return new ErroDeDesenho(`Sem créditos na ${nome}. Adicione créditos na sua conta de lá.`, status);
  if (status === 422 || status === 400) return new ErroDeDesenho(`A ${nome} não aceitou o pedido: ${String(msg || 'dados inválidos').slice(0, 220)}`, status);
  if (status === 429) return new ErroDeDesenho(`Muitos pedidos à ${nome} agora. Espere um pouco e tente de novo.`, status);
  if (status >= 500) return new ErroDeDesenho(`A ${nome} está com problema agora (${status}). Tente daqui a pouco.`, status);
  return new ErroDeDesenho(`Erro da ${nome} (${status}): ${String(msg || 'sem detalhes').slice(0, 220)}`, status);
}

const tirarPrefixo = (b64) => String(b64 || '').replace(/^data:[^,]*,/, '');

function exigirChave(provedor, nome) {
  const chave = lerChave(provedor);
  if (!chave) throw new ErroDeDesenho(`Falta a chave da ${nome}. Cole a sua no campo acima (ou em “Modelo IA” do editor).`);
  return chave;
}

/* ------------------------------------------------------------------ */
/* PixelLab                                                            */
/* ------------------------------------------------------------------ */

/** Lado pedido à PixelLab: o gerador trabalha de 32 a 400 px (menores são reduzidos depois por nós). */
export const ladoParaPixelLab = (lado) => Math.max(32, Math.min(400, lado));

/**
 * Redesenha a imagem com a PixelLab (Pixflux com imagem inicial).
 * @param pngBase64  a imagem JÁ no tamanho `ladoParaPixelLab(lado)` (a tela prepara)
 * @returns { base64, custo }  PNG em base64
 */
export async function transformarComPixelLab({ pngBase64, lado, perspectiva = null, descricao = '', sinal }) {
  const chave = exigirChave('pixellab', 'PixelLab');
  const L = ladoParaPixelLab(lado);
  const corpo = {
    description: montarDescricao({ descricao, perspectiva, lado }),
    negative_description: 'blurry, anti-aliasing, gradient, photo, realistic, text, watermark, background scenery',
    image_size: { width: L, height: L },
    text_guidance_scale: 8,
    no_background: true,
    outline: 'single color black outline',
    shading: 'basic shading',
    detail: 'medium detail',
    init_image: { type: 'base64', base64: tirarPrefixo(pngBase64), format: 'png' },
    // quanto maior, mais a arte segue a imagem enviada (0–1000)
    init_image_strength: perspectiva ? 300 : 600,
  };
  if (perspectiva === 'isometrico') { corpo.isometric = true; corpo.view = 'high top-down'; }
  if (perspectiva === 'frente') { corpo.view = 'low top-down'; corpo.direction = 'south'; }
  const r = await chamar(`${URL_PIXELLAB}/generate-image-pixflux`, { metodo: 'POST', chave, corpo, sinal, nome: 'PixelLab' });
  const base64 = r?.image?.base64;
  if (!base64) throw new ErroDeDesenho('A PixelLab respondeu, mas sem imagem.');
  return { base64: tirarPrefixo(base64), custo: r.usage?.usd !== undefined ? `US$ ${Number(r.usage.usd).toFixed(4)}` : null };
}

/* ------------------------------------------------------------------ */
/* SpriteCook                                                          */
/* ------------------------------------------------------------------ */

/**
 * Redesenha a imagem com a SpriteCook: sobe a imagem como asset e pede uma edição dela
 * no tamanho da grade (pixel art "pixel perfect", fundo transparente).
 * @param baixar  (url) => Promise<base64 PNG>  — a tela baixa a imagem do resultado
 * @returns { base64, custo }
 */
export async function transformarComSpriteCook({ pngBase64, lado, perspectiva = null, descricao = '', sinal, baixar }) {
  const chave = exigirChave('spritecook', 'SpriteCook');
  const nome = 'SpriteCook';
  const lad = Math.max(16, Math.min(512, lado));
  const importado = await chamar(`${URL_SPRITECOOK}/assets/import`, {
    metodo: 'POST', chave, sinal, nome,
    corpo: { image: `data:image/png;base64,${tirarPrefixo(pngBase64)}`, pixel: false, display_name: 'Mini Engine — imagem enviada', file_name: 'mini-engine.png' },
  });
  const idAsset = importado?.id || importado?.asset?.id || importado?.asset_id;
  if (!idAsset) throw new ErroDeDesenho('A SpriteCook recebeu a imagem, mas não devolveu o código dela.');
  const r = await chamar(`${URL_SPRITECOOK}/generate-sync`, {
    metodo: 'POST', chave, sinal, nome,
    corpo: {
      prompt: montarDescricao({ descricao, perspectiva, lado }),
      width: lad,
      height: lad,
      pixel: true,
      pixel_perfect: true,
      bg_mode: 'transparent',
      edit_asset_id: idAsset,
    },
  });
  const asset = r?.assets?.[0] || r?.asset || null;
  const url = asset?.url || asset?.sprite_url || asset?.image_url;
  if (!url) throw new ErroDeDesenho(r?.status && r.status !== 'completed' ? `A SpriteCook não terminou (${r.status}). Tente de novo.` : 'A SpriteCook respondeu, mas sem imagem.');
  const base64 = /^data:/.test(url) ? tirarPrefixo(url) : await baixar(url);
  return { base64, custo: r?.credits_used !== undefined ? `${r.credits_used} crédito(s)` : null };
}
