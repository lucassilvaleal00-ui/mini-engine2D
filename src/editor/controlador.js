/**
 * controlador.js — Dono do documento aberto no editor.
 *
 * Guarda o estado, o histórico (50 passos) e TODAS as ações de edição como
 * métodos. Botões, atalhos e (na etapa 5) a IA chamam estes mesmos métodos.
 * Sem DOM: dá para testar no Node.
 *
 * Eventos (via `on`): 'mudou' com { pixels, quadros, paleta, tudo } e 'sujo'.
 */

import * as A from './algoritmos.js';
import * as V from './variacoes.js';
import {
  MAX_CORES, ErroDoEditor, copiarEstado, normalizarHex, quadroVazio, validarReferencia,
} from './documento.js';

export const LIMITE_HISTORICO = 50;

export class Controlador {
  /** @param estado      estado do documento (ver documento.js)
   *  @param origem      { pastaId, base, ids[] } se veio de arquivos salvos; senão null
   *  @param referencia  imagem de inspiração { nome, dados, largura, altura } ou null */
  constructor(estado, origem = null, referencia = null) {
    this.e = estado;
    this.origem = origem;
    // A referência fica FORA do estado de propósito: não entra no desfazer/refazer
    // (desfazer um traço nunca deve fazer a imagem de inspiração sumir).
    this.referencia = validarReferencia(referencia);
    this.sujo = false;
    this.passado = [];
    this.futuro = [];
    this.trabalho = null; // cópia da camada ativa enquanto um traço está em andamento
    this._original = null;
    this._antes = null;
    this._ouvintes = {};
  }

  /* ---------- eventos ---------- */

  on(evento, fn) {
    (this._ouvintes[evento] ||= new Set()).add(fn);
    return () => this._ouvintes[evento].delete(fn);
  }

  emitir(evento, dados) {
    for (const fn of this._ouvintes[evento] || []) fn(dados);
  }

  /* ---------- leitura ---------- */

  get largura() { return this.e.largura; }
  get altura() { return this.e.altura; }
  quadro(i = this.e.atual) { return this.e.quadros[i]; }
  camadaAtual() { return this.quadro().camadas[this.e.camadaAtiva]; }

  /** Índice de paleta visível em (x, y) no quadro atual (camada de cima primeiro). */
  indiceNoPonto(x, y) {
    const { largura: w, altura: h } = this.e;
    if (!A.dentro(x, y, w, h)) return null;
    const quadro = this.quadro();
    for (let c = this.e.camadas.length - 1; c >= 0; c--) {
      if (!this.e.camadas[c].visivel) continue;
      const buf = c === this.e.camadaAtiva && this.trabalho ? this.trabalho : quadro.camadas[c];
      if (buf[y * w + x] !== 0) return buf[y * w + x];
    }
    return 0;
  }

  /** Quantos pixels (em todos os quadros e camadas) usam a cor `indice`. */
  usoDaCor(indice) {
    let n = 0;
    for (const q of this.e.quadros) for (const buf of q.camadas) n += A.contar(buf, indice);
    return n;
  }

  /* ---------- histórico ---------- */

  _registrar(antes) {
    this.passado.push(antes);
    if (this.passado.length > LIMITE_HISTORICO) this.passado.shift();
    this.futuro.length = 0;
    this._marcarSujo();
  }

  _marcarSujo() {
    if (!this.sujo) { this.sujo = true; }
    this.emitir('sujo', true);
  }

  marcarSalvo() {
    this.sujo = false;
    this.emitir('sujo', false);
  }

  get podeDesfazer() { return this.passado.length > 0 && !this.trabalho; }
  get podeRefazer() { return this.futuro.length > 0 && !this.trabalho; }

  desfazer() {
    if (!this.podeDesfazer) return false;
    this.futuro.push(copiarEstado(this.e));
    this.e = this.passado.pop();
    this._marcarSujo();
    this.emitir('mudou', { tudo: true });
    return true;
  }

  refazer() {
    if (!this.podeRefazer) return false;
    this.passado.push(copiarEstado(this.e));
    this.e = this.futuro.pop();
    this._marcarSujo();
    this.emitir('mudou', { tudo: true });
    return true;
  }

  /** Roda `fn(e)`, que altera `this.e`. Se devolver false, nada é registrado. */
  _transacao(fn, flags) {
    const antes = copiarEstado(this.e);
    if (fn(this.e) === false) return false;
    this._registrar(antes);
    this.emitir('mudou', flags);
    return true;
  }

  _substituirBuffer(quadroIdx, camadaIdx, buf) {
    const camadas = this.e.quadros[quadroIdx].camadas.slice();
    camadas[camadaIdx] = buf;
    this.e.quadros[quadroIdx] = { camadas };
  }

  /* ---------- traço (várias mudanças = 1 passo no histórico) ---------- */

  /** Começa a desenhar: devolve o buffer de trabalho (cópia da camada ativa). */
  iniciarTraco() {
    if (this.trabalho) this.cancelarTraco();
    this._original = this.camadaAtual();
    this._antes = copiarEstado(this.e);
    this.trabalho = this._original.slice();
    return this.trabalho;
  }

  /** Confirma o traço. Se nada mudou, não gasta um passo do histórico. */
  finalizarTraco() {
    const t = this.trabalho;
    if (!t) return false;
    this.trabalho = null;
    const antes = this._antes;
    const original = this._original;
    this._antes = this._original = null;
    if (A.iguais(t, original)) {
      this.emitir('mudou', { pixels: true });
      return false;
    }
    this._substituirBuffer(this.e.atual, this.e.camadaAtiva, t);
    this._registrar(antes);
    this.emitir('mudou', { pixels: true });
    return true;
  }

  cancelarTraco() {
    if (!this.trabalho) return;
    this.trabalho = null;
    this._antes = this._original = null;
    this.emitir('mudou', { pixels: true });
  }

  /* ---------- quadros ---------- */

  selecionarQuadro(i) {
    if (this.trabalho || i < 0 || i >= this.e.quadros.length || i === this.e.atual) return false;
    this.e.atual = i;
    this.emitir('mudou', { pixels: true, quadros: true });
    return true;
  }

  /** Quadro em branco logo depois do atual (ou em `posicao`). Vira o quadro atual. */
  adicionarQuadro(posicao = this.e.atual + 1) {
    return this._transacao((e) => {
      const novo = quadroVazio(e.largura, e.altura, e.camadas.length);
      e.quadros.splice(posicao, 0, novo);
      e.atual = posicao;
    }, { pixels: true, quadros: true });
  }

  /** Quadro novo com pixels prontos (usado pela IA na etapa 5). `camadas` = um Uint8Array por camada. */
  inserirQuadroComPixels(camadas, posicao = this.e.quadros.length) {
    return this._transacao((e) => {
      if (camadas.length !== e.camadas.length || camadas.some((b) => b.length !== e.largura * e.altura)) {
        throw new ErroDoEditor('O quadro recebido não combina com o tamanho/camadas do desenho.');
      }
      e.quadros.splice(posicao, 0, { camadas: camadas.map((b) => Uint8Array.from(b)) });
      e.atual = posicao;
    }, { pixels: true, quadros: true });
  }

  duplicarQuadro(i = this.e.atual) {
    return this._transacao((e) => {
      e.quadros.splice(i + 1, 0, { camadas: e.quadros[i].camadas.slice() }); // buffers são imutáveis: podem ser compartilhados
      e.atual = i + 1;
    }, { pixels: true, quadros: true });
  }

  excluirQuadro(i = this.e.atual) {
    if (this.e.quadros.length <= 1) throw new ErroDoEditor('O desenho precisa ter pelo menos um quadro.');
    return this._transacao((e) => {
      e.quadros.splice(i, 1);
      e.atual = Math.min(i, e.quadros.length - 1);
    }, { pixels: true, quadros: true });
  }

  moverQuadro(de, para) {
    if (para < 0 || para >= this.e.quadros.length || de === para) return false;
    return this._transacao((e) => {
      const [q] = e.quadros.splice(de, 1);
      e.quadros.splice(para, 0, q);
      e.atual = para;
    }, { pixels: true, quadros: true });
  }

  limparQuadro() {
    return this._transacao((e) => {
      const q = e.quadros[e.atual];
      if (q.camadas.every((b) => A.contar(b, 0) === b.length)) return false;
      e.quadros[e.atual] = quadroVazio(e.largura, e.altura, e.camadas.length);
    }, { pixels: true, quadros: true });
  }

  /** Apaga um retângulo na camada ativa do quadro atual. */
  limparRegiao(rect) {
    return this._transacao((e) => {
      const { largura: w, altura: h } = e;
      const buf = e.quadros[e.atual].camadas[e.camadaAtiva].slice();
      A.limpar(buf, w, h, rect);
      if (A.iguais(buf, e.quadros[e.atual].camadas[e.camadaAtiva])) return false;
      this._substituirBuffer(e.atual, e.camadaAtiva, buf);
    }, { pixels: true });
  }

  /* ---------- transformações ---------- */

  /**
   * Espelha. `eixo`: 'h' (esquerda↔direita) ou 'v' (cima↔baixo).
   * Com `regiao` {x,y,w,h}: só aquele pedaço da camada ativa.
   * Sem região: `escopo` 'quadro' (todas as camadas do quadro atual) ou 'todos' (todos os quadros).
   */
  espelhar(eixo, { escopo = 'quadro', regiao = null } = {}) {
    const f = eixo === 'h' ? A.espelharH : A.espelharV;
    return this._transacao((e) => {
      const { largura: w, altura: h } = e;
      if (regiao) {
        const buf = e.quadros[e.atual].camadas[e.camadaAtiva].slice();
        const r = f(A.extrair(buf, w, h, regiao));
        const rc = A.recortarRetangulo(regiao, w, h);
        if (!rc) return false;
        A.limpar(buf, w, h, rc);
        A.carimbar(buf, w, h, r, rc.x, rc.y);
        this._substituirBuffer(e.atual, e.camadaAtiva, buf);
        return true;
      }
      const alvos = escopo === 'todos' ? e.quadros.map((_, i) => i) : [e.atual];
      for (const qi of alvos) {
        e.quadros[qi] = {
          camadas: e.quadros[qi].camadas.map((b) => f({ w, h, pixels: b }).pixels),
        };
      }
      return true;
    }, { pixels: true });
  }

  /**
   * Gira 90° no sentido horário.
   * Com `regiao`: só aquele pedaço da camada ativa; devolve a nova região (largura e altura trocadas).
   * Sem região: o desenho INTEIRO (todos os quadros); se não for quadrado, largura e altura trocam.
   */
  girar({ regiao = null } = {}) {
    let novaRegiao = null;
    const ok = this._transacao((e) => {
      const { largura: w, altura: h } = e;
      if (regiao) {
        const rc = A.recortarRetangulo(regiao, w, h);
        if (!rc) return false;
        const buf = e.quadros[e.atual].camadas[e.camadaAtiva].slice();
        const r = A.girar90(A.extrair(buf, w, h, rc));
        A.limpar(buf, w, h, rc);
        A.carimbar(buf, w, h, r, rc.x, rc.y);
        this._substituirBuffer(e.atual, e.camadaAtiva, buf);
        novaRegiao = { x: rc.x, y: rc.y, w: r.w, h: r.h };
        return true;
      }
      e.quadros = e.quadros.map((q) => ({
        camadas: q.camadas.map((b) => A.girar90({ w, h, pixels: b }).pixels),
      }));
      e.largura = h;
      e.altura = w;
      return true;
    }, { pixels: true, tudo: !regiao });
    return ok ? (novaRegiao || true) : false;
  }

  /* ---------- paleta ---------- */

  /** Acrescenta uma cor e devolve o índice dela. Lança ErroDoEditor se não der. */
  adicionarCor(hex) {
    const h = normalizarHex(hex);
    if (!h) throw new ErroDoEditor('Cor inválida. Use o formato #rrggbb.');
    const existente = this.e.paleta.indexOf(h);
    if (existente > 0) throw new ErroDoEditor(`Essa cor já está na paleta (posição ${existente}).`);
    if (this.e.paleta.length >= MAX_CORES) {
      throw new ErroDoEditor(`A paleta está cheia (máximo ${MAX_CORES - 1} cores, além da transparente). Apague uma cor que não usa mais.`);
    }
    let indice = -1;
    this._transacao((e) => { e.paleta.push(h); indice = e.paleta.length - 1; }, { paleta: true });
    return indice;
  }

  /**
   * Acrescenta várias cores de uma vez (um único "desfazer"). Pula as repetidas e as que não cabem.
   * Devolve quantas entraram.
   */
  adicionarCores(lista) {
    const novas = [];
    for (const c of lista) {
      const hex = normalizarHex(c);
      if (hex && !this.e.paleta.includes(hex) && !novas.includes(hex)) novas.push(hex);
    }
    const entram = novas.slice(0, Math.max(0, MAX_CORES - this.e.paleta.length));
    if (!entram.length) return 0;
    this._transacao((e) => { e.paleta.push(...entram); }, { paleta: true });
    return entram.length;
  }

  /* ---------- variações (sem IA) ---------- */

  /**
   * Gira o tom (matiz) de todas as cores da paleta, `graus` de -180 a 180. Um único "desfazer".
   * Devolve quantas cores mudaram de fato (cinzas, branco e preto não têm tom).
   */
  deslocarMatiz(graus) {
    const g = Number(graus);
    if (!Number.isFinite(g) || g < -360 || g > 360) throw new ErroDoEditor('Use um valor de -180 a 180 graus.');
    const nova = V.deslocarMatizPaleta(this.e.paleta, g);
    const mudou = nova.filter((c, i) => c !== this.e.paleta[i]).length;
    if (!mudou) return 0;
    this._transacao((e) => { e.paleta = nova; }, { paleta: true });
    return mudou;
  }

  /**
   * Cobre o topo do desenho de neve (ver variacoes.js). `espessura` 1 a 3; `escopo` 'quadro' ou 'todos'.
   * Devolve { pixels, corNova }: quantos pixels foram cobertos e se a cor da neve foi acrescentada à paleta.
   */
  aplicarNeve({ espessura = 1, escopo = 'quadro' } = {}) {
    if (!V.ESPESSURAS_NEVE.includes(espessura)) throw new ErroDoEditor('A espessura da neve vai de 1 a 3 pixels.');
    const r = V.aplicarNeve(this.e, { espessura, escopo });
    if (!r.mudou) return { pixels: r.pixels, corNova: false };
    const corNova = r.paleta !== this.e.paleta;
    this._transacao((e) => {
      e.paleta = r.paleta;
      e.quadros = r.quadros;
    }, { pixels: true, paleta: corNova });
    return { pixels: r.pixels, corNova };
  }

  /** Troca a cor de um índice: todos os pixels que a usam mudam junto. */
  alterarCor(indice, hex) {
    const h = normalizarHex(hex);
    if (!h) throw new ErroDoEditor('Cor inválida. Use o formato #rrggbb.');
    if (indice < 1 || indice >= this.e.paleta.length) throw new ErroDoEditor('Essa cor não pode ser alterada.');
    const existente = this.e.paleta.indexOf(h);
    if (existente > 0 && existente !== indice) throw new ErroDoEditor(`Essa cor já está na paleta (posição ${existente}).`);
    return this._transacao((e) => {
      if (e.paleta[indice] === h) return false;
      e.paleta[indice] = h;
    }, { pixels: true, paleta: true });
  }

  /**
   * Apaga uma cor da paleta. Os pixels que a usavam ficam transparentes e
   * as cores seguintes sobem uma posição. Devolve quantos pixels foram afetados.
   */
  removerCor(indice) {
    if (indice < 1 || indice >= this.e.paleta.length) throw new ErroDoEditor('Essa cor não pode ser apagada.');
    const afetados = this.usoDaCor(indice);
    this._transacao((e) => {
      e.paleta.splice(indice, 1);
      const remapear = (buf) => {
        const novo = new Uint8Array(buf.length);
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i];
          novo[i] = v === indice ? 0 : v > indice ? v - 1 : v;
        }
        return novo;
      };
      e.quadros = e.quadros.map((q) => ({ camadas: q.camadas.map(remapear) }));
    }, { pixels: true, paleta: true });
    return afetados;
  }

  /* ---------- propriedades (não entram no histórico) ---------- */

  /** Troca (ou remove, com null) a imagem de inspiração. Conta como alteração não salva. */
  definirReferencia(ref) {
    const nova = ref === null ? null : validarReferencia(ref);
    if (ref !== null && !nova) throw new ErroDoEditor('Essa imagem não pôde ser usada como inspiração.');
    this.referencia = nova;
    this._marcarSujo();
    this.emitir('referencia', nova);
  }

  definirNome(nome) {
    if (this.e.nome === nome) return;
    this.e.nome = nome;
    this._marcarSujo();
  }

  definirFps(fps) {
    const v = Math.max(1, Math.min(60, Math.round(Number(fps)) || 8));
    if (v === this.e.fps) return;
    this.e.fps = v;
    this._marcarSujo();
    this.emitir('mudou', { quadros: true });
  }
}
