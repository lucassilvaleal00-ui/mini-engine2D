/**
 * pixelizar.js — Põe qualquer imagem DENTRO DA GRADE de pixels do editor, usando só código nosso
 * (sem IA). É a base do "Transformar imagem" e também o acabamento do que as IAs devolvem.
 * Sem DOM: roda no Node nos testes.
 *
 *  1. Descobre se a imagem já é pixel art AMPLIADA (cada "pixel" virou um bloco k×k) e volta à
 *     grade original — assim um PNG 512×512 de um desenho 32×32 vira exatamente 32×32.
 *  2. Se pediu uma escala (16, 32, 64…), reduz (ou amplia por um número inteiro) para caber na
 *     grade escolhida, centralizado, sem deformar.
 *  3. Pode tirar o fundo liso (a cor que domina as bordas).
 *  4. Encaixa as cores na paleta do desenho (máx. 35 + transparente).
 */

import { rgbParaHex, hexParaRgb, MAX_CORES, TAMANHO_MAX, TAMANHO_MIN } from './documento.js';
import { quantizar } from './imagem.js';

const ALFA = 128;

const diferenca = (a, i, b, j) => Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]);
const opaco = (a, i) => a[i + 3] >= ALFA;

/** Dois pixels "iguais" (tolerância para JPEG/compressão). */
function iguais(a, i, b, j, tol) {
  const oa = opaco(a, i), ob = opaco(b, j);
  if (oa !== ob) return false;
  return !oa || diferenca(a, i, b, j) <= tol;
}

/** Blocos candidatos, do maior para o menor: inteiros (2…64) e frações largura/n (ampliação "quebrada"). */
function candidatos(largura, altura) {
  const lista = new Set();
  const maior = Math.min(64, Math.min(largura, altura) / TAMANHO_MIN);
  for (let k = 2; k <= maior; k++) lista.add(k);
  for (let n = TAMANHO_MIN; n <= TAMANHO_MAX; n++) {
    const k = largura / n;
    if (k < 2 || k > maior) continue;
    const linhas = altura / k;
    if (Math.abs(linhas - Math.round(linhas)) < 0.08) lista.add(Math.round(k * 1000) / 1000);
  }
  return [...lista].sort((a, b) => b - a);
}

/**
 * Tamanho do bloco de uma pixel art ampliada (1 = não está ampliada). Pode ser fracionário
 * (ex.: 32×32 ampliado para 500×500 -> 15,625). Aceita até 1,5% de pixels fora do padrão
 * (ruído de JPEG, antisserrilhado nas bordas).
 */
export function detectarTamanhoDoPixel(rgba, largura, altura, { tolerancia = 40, maximoErro = 0.015 } = {}) {
  // imagens pequenas (menos de 48 px) já estão no tamanho de pixel art: não há o que desfazer
  if (Math.min(largura, altura) < 48) return 1;
  const total = largura * altura;
  const limite = Math.floor(total * maximoErro);
  for (const k of candidatos(largura, altura)) {
    let erros = 0;
    let falhou = false;
    for (let y = 0; y < altura && !falhou; y++) {
      const cy = Math.min(altura - 1, Math.floor((Math.floor(y / k) + 0.5) * k));
      for (let x = 0; x < largura; x++) {
        const cx = Math.min(largura - 1, Math.floor((Math.floor(x / k) + 0.5) * k));
        if (!iguais(rgba, (y * largura + x) * 4, rgba, (cy * largura + cx) * 4, tolerancia) && ++erros > limite) { falhou = true; break; }
      }
    }
    if (!falhou && temBordasDeBloco(rgba, largura, altura, k)) return k;
  }
  return 1;
}

/**
 * Confirma que a imagem é MESMO feita de blocos k×k: dentro dos blocos os vizinhos são quase
 * iguais e as mudanças acontecem nas divisas. Uma foto ou um degradê suave muda aos poucos em
 * todo lugar (passaria na tolerância, mas não tem divisas) e por isso não conta como pixel art.
 */
function temBordasDeBloco(rgba, largura, altura, k) {
  let dentro = 0, nDentro = 0, divisa = 0, nDivisa = 0;
  const passo = Math.max(1, Math.floor(altura / 200));
  for (let y = 0; y < altura; y += passo) {
    for (let x = 0; x < largura - 1; x++) {
      const i = (y * largura + x) * 4;
      const d = opaco(rgba, i) !== opaco(rgba, i + 4) ? 255 : diferenca(rgba, i, rgba, i + 4);
      if (Math.floor(x / k) !== Math.floor((x + 1) / k)) { divisa += d; nDivisa++; } else { dentro += d; nDentro++; }
    }
  }
  if (!nDivisa) return false;
  const mediaDivisa = divisa / nDivisa, mediaDentro = nDentro ? dentro / nDentro : 0;
  return mediaDivisa >= 6 && mediaDentro * 4 <= mediaDivisa;
}

/** Cor dominante de uma região (ou a média, se nenhuma dominar). Transparente se a maioria for. */
function corDaRegiao(rgba, largura, x0, y0, x1, y1, saida, o) {
  const contagem = new Map();
  let n = 0, nOpacos = 0, r = 0, g = 0, b = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * largura + x) * 4;
      n++;
      if (!opaco(rgba, i)) continue;
      nOpacos++;
      r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2];
      const chave = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
      const c = contagem.get(chave);
      if (c) { c.n++; c.r += rgba[i]; c.g += rgba[i + 1]; c.b += rgba[i + 2]; } else contagem.set(chave, { n: 1, r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
    }
  }
  if (!n || nOpacos * 2 < n) { saida[o] = saida[o + 1] = saida[o + 2] = saida[o + 3] = 0; return; }
  let melhor = null;
  for (const c of contagem.values()) if (!melhor || c.n > melhor.n) melhor = c;
  if (melhor.n >= nOpacos * 0.4) { r = melhor.r / melhor.n; g = melhor.g / melhor.n; b = melhor.b / melhor.n; } else { r /= nOpacos; g /= nOpacos; b /= nOpacos; }
  saida[o] = Math.round(r); saida[o + 1] = Math.round(g); saida[o + 2] = Math.round(b); saida[o + 3] = 255;
}

/** Muda o tamanho para nl×na: reduzir usa a cor dominante de cada região; ampliar repete pixels. */
export function redimensionar(rgba, largura, altura, nl, na) {
  const saida = new Uint8ClampedArray(nl * na * 4);
  for (let y = 0; y < na; y++) {
    const y0 = Math.floor((y * altura) / na);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * altura) / na));
    for (let x = 0; x < nl; x++) {
      const x0 = Math.floor((x * largura) / nl);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * largura) / nl));
      corDaRegiao(rgba, largura, x0, y0, Math.min(x1, largura), Math.min(y1, altura), saida, (y * nl + x) * 4);
    }
  }
  return saida;
}

/** Desfaz a ampliação: um pixel por bloco k×k. */
export function reduzirBlocos(rgba, largura, altura, k) {
  const nl = Math.max(1, Math.round(largura / k));
  const na = Math.max(1, Math.round(altura / k));
  const saida = new Uint8ClampedArray(nl * na * 4);
  for (let y = 0; y < na; y++) {
    for (let x = 0; x < nl; x++) {
      // centro do bloco (mais estável que a média nas bordas antisserrilhadas)
      const cx = Math.min(largura - 1, Math.floor((x + 0.5) * k));
      const cy = Math.min(altura - 1, Math.floor((y + 0.5) * k));
      const i = (cy * largura + cx) * 4, o = (y * nl + x) * 4;
      if (opaco(rgba, i)) { saida[o] = rgba[i]; saida[o + 1] = rgba[i + 1]; saida[o + 2] = rgba[i + 2]; saida[o + 3] = 255; }
    }
  }
  return { rgba: saida, largura: nl, altura: na };
}

/**
 * Põe a imagem dentro de uma tela L×A, centralizada e sem deformar.
 * Maior que a tela: reduz. Menor: amplia só por número inteiro (2×, 3×…) — senão só centraliza.
 */
export function encaixar(rgba, largura, altura, L, A) {
  let fator = Math.min(L / largura, A / altura);
  if (fator > 1) fator = Math.floor(fator);
  const nl = Math.max(1, Math.min(L, Math.round(largura * fator)));
  const na = Math.max(1, Math.min(A, Math.round(altura * fator)));
  const meio = nl === largura && na === altura ? rgba : redimensionar(rgba, largura, altura, nl, na);
  const saida = new Uint8ClampedArray(L * A * 4);
  const ox = Math.floor((L - nl) / 2), oy = Math.floor((A - na) / 2);
  for (let y = 0; y < na; y++) saida.set(meio.subarray(y * nl * 4, (y + 1) * nl * 4), ((oy + y) * L + ox) * 4);
  return saida;
}

/** A cor que domina as bordas, se for "fundo liso" (≥ 60% da borda). -> índice do pixel exemplo ou -1 */
function fundoDaBorda(rgba, largura, altura, tol) {
  const bordas = [];
  for (let x = 0; x < largura; x++) bordas.push(x, (altura - 1) * largura + x);
  for (let y = 1; y < altura - 1; y++) bordas.push(y * largura, y * largura + largura - 1);
  const grupos = [];
  for (const p of bordas) {
    const i = p * 4;
    if (!opaco(rgba, i)) continue;
    const g = grupos.find((x) => diferenca(rgba, i, rgba, x.i) <= tol);
    if (g) g.n++; else grupos.push({ i, n: 1 });
  }
  const melhor = grupos.sort((a, b) => b.n - a.n)[0];
  return melhor && melhor.n >= bordas.length * 0.6 ? melhor.i : -1;
}

/** Tira o fundo liso: apaga, a partir das bordas, tudo que tem a cor do fundo. Devolve quantos pixels sumiram. */
export function removerFundo(rgba, largura, altura, { tolerancia = 36 } = {}) {
  const ref = fundoDaBorda(rgba, largura, altura, tolerancia);
  if (ref < 0) return 0;
  const cor = [rgba[ref], rgba[ref + 1], rgba[ref + 2], 255];
  const visto = new Uint8Array(largura * altura);
  const pilha = [];
  const tentar = (p) => {
    if (visto[p]) return;
    visto[p] = 1;
    const i = p * 4;
    if (opaco(rgba, i) && diferenca(rgba, i, cor, 0) <= tolerancia) pilha.push(p);
  };
  for (let x = 0; x < largura; x++) { tentar(x); tentar((altura - 1) * largura + x); }
  for (let y = 0; y < altura; y++) { tentar(y * largura); tentar(y * largura + largura - 1); }
  let apagados = 0;
  while (pilha.length) {
    const p = pilha.pop();
    rgba[p * 4 + 3] = 0;
    apagados++;
    const x = p % largura, y = (p - x) / largura;
    if (x > 0) tentar(p - 1);
    if (x < largura - 1) tentar(p + 1);
    if (y > 0) tentar(p - largura);
    if (y < altura - 1) tentar(p + largura);
  }
  return apagados;
}

/** Deixa todo pixel 100% opaco ou 100% transparente (o editor não tem meia transparência). */
function alfaBinario(rgba) {
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] >= ALFA ? 255 : 0;
  return rgba;
}

/**
 * Prepara a arte para o editor.
 * @param escala  null = manter o tamanho (só volta à grade se estiver ampliada); número = tela N×N
 * @param tamanho { largura, altura } = encaixar exatamente neste tamanho (ex.: o do desenho aberto)
 * @param tirarFundo  true | false | 'auto' (tira se as bordas forem de uma cor só)
 * @returns { rgba, largura, altura, info: { tamanhoDoPixel, reduzida, ampliada, fundoRemovido, original: {largura, altura} } }
 */
export function prepararArte({ rgba, largura, altura }, { escala = null, tamanho = null, tirarFundo = 'auto' } = {}) {
  const info = { tamanhoDoPixel: 1, reduzida: false, ampliada: false, fundoRemovido: 0, original: { largura, altura } };
  let img = { rgba: Uint8ClampedArray.from(rgba), largura, altura };

  // 1. pixel art ampliada -> grade original
  const k = detectarTamanhoDoPixel(img.rgba, img.largura, img.altura);
  if (k > 1) { img = reduzirBlocos(img.rgba, img.largura, img.altura, k); info.tamanhoDoPixel = k; }

  // 2. tamanho final
  let L = img.largura, A = img.altura;
  if (tamanho) { L = tamanho.largura; A = tamanho.altura; }
  else if (escala) { L = A = escala; }
  else if (L > TAMANHO_MAX || A > TAMANHO_MAX) {
    const f = TAMANHO_MAX / Math.max(L, A);
    L = Math.max(TAMANHO_MIN, Math.round(L * f));
    A = Math.max(TAMANHO_MIN, Math.round(A * f));
  }
  L = Math.max(TAMANHO_MIN, Math.min(TAMANHO_MAX, L));
  A = Math.max(TAMANHO_MIN, Math.min(TAMANHO_MAX, A));
  if (L !== img.largura || A !== img.altura) {
    info.reduzida = img.largura > L || img.altura > A;
    info.ampliada = !info.reduzida && (img.largura * 2 <= L && img.altura * 2 <= A);
    img = { rgba: encaixar(img.rgba, img.largura, img.altura, L, A), largura: L, altura: A };
  }

  // 3. fundo
  if (tirarFundo === true || tirarFundo === 'auto') {
    // em "auto" só tira se a imagem não tiver transparência nenhuma (senão o fundo já foi tirado)
    let temTransparente = false;
    for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] < ALFA) { temTransparente = true; break; }
    if (tirarFundo === true || !temTransparente) info.fundoRemovido = removerFundo(img.rgba, img.largura, img.altura);
  }
  alfaBinario(img.rgba);
  return { ...img, info };
}

/**
 * Converte a arte em índices da paleta do desenho.
 * Cores que já existem são reaproveitadas; as novas entram enquanto houver lugar
 * (se não couberem, são reduzidas às vagas; sem vagas, usa a cor mais parecida).
 * @returns { indices: Uint8Array, novas: [hex], aproximadas: number }
 */
export function coresParaDesenho(rgba, paleta, { maximoCores = MAX_CORES } = {}) {
  const existentes = new Map();
  paleta.forEach((hex, i) => { if (i > 0 && !existentes.has(hex)) existentes.set(hex, i); });
  const mapa = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < ALFA) continue;
    const hex = rgbParaHex(rgba[i], rgba[i + 1], rgba[i + 2]);
    mapa.set(hex, (mapa.get(hex) || 0) + 1);
  }
  const faltam = new Map([...mapa].filter(([hex]) => !existentes.has(hex)));
  const vagas = Math.max(0, maximoCores - paleta.length);
  let novas = [...faltam.keys()];
  let aproximadas = 0;
  if (novas.length > vagas) {
    aproximadas = novas.length;
    novas = vagas ? quantizar(faltam, vagas).filter((hex) => !existentes.has(hex)).slice(0, vagas) : [];
  }
  const final = [...paleta, ...novas];
  const rgbFinal = final.map((hex, i) => (i === 0 ? null : hexParaRgb(hex)));
  const indiceDe = new Map(final.map((hex, i) => [hex, i]).filter(([, i]) => i > 0));
  const cache = new Map();
  const indices = new Uint8Array(rgba.length / 4);
  for (let p = 0; p < indices.length; p++) {
    const i = p * 4;
    if (rgba[i + 3] < ALFA) continue;
    const hex = rgbParaHex(rgba[i], rgba[i + 1], rgba[i + 2]);
    let idx = indiceDe.get(hex) ?? cache.get(hex);
    if (idx === undefined) {
      let menor = Infinity;
      for (let c = 1; c < rgbFinal.length; c++) {
        const q = rgbFinal[c];
        const d = (rgba[i] - q[0]) ** 2 + (rgba[i + 1] - q[1]) ** 2 + (rgba[i + 2] - q[2]) ** 2;
        if (d < menor) { menor = d; idx = c; }
      }
      cache.set(hex, idx);
    }
    indices[p] = idx;
  }
  return { indices, novas, aproximadas };
}
