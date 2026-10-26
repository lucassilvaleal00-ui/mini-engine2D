/**
 * ferramentas.js — As ferramentas de desenho (inspiradas no Piskel).
 *
 * Cada ferramenta é um objeto com:
 *   id, nome, atalho (tecla), icone (ver icones.js),
 *   opcoes: quais controles aparecem na barra ('tamanho', 'simetria', 'preencher', 'global'),
 *   aoPressionar / aoMover / aoSoltar / aoCancelar (ctx, x, y),
 *   acoes(ctx): botões extras da barra (ex.: "Apagar" na seleção).
 *
 * `ctx` = { ctl, vista, op, indiceCor(), definirCor(i) }
 *   - ctl: o Controlador (as ferramentas só mexem no documento por ele)
 *   - op:  opções atuais { tamanho, simetria, preencher, global }
 * Coordenadas x, y já vêm em pixels do desenho (podem estar fora dele).
 */

import * as A from './algoritmos.js';

const desenhar = (ctx, pontos, indice) => {
  const { ctl, op } = ctx;
  const { largura: w, altura: h } = ctl.e;
  A.aplicar(ctl.trabalho, w, h, A.simetria(pontos, w, h, op.simetria), indice);
};

/* ---------- lápis e borracha ---------- */

const pincelLivre = (id, nome, atalho, icone, indiceDe) => ({
  id, nome, atalho, icone, opcoes: ['tamanho', 'simetria'],
  _ultimo: null,
  aoPressionar(ctx, x, y) {
    ctx.ctl.iniciarTraco();
    this._ultimo = [x, y];
    desenhar(ctx, A.pincel(x, y, ctx.op.tamanho), indiceDe(ctx));
  },
  aoMover(ctx, x, y) {
    const [ux, uy] = this._ultimo;
    if (ux === x && uy === y) return;
    desenhar(ctx, A.tracoComPincel(ux, uy, x, y, ctx.op.tamanho), indiceDe(ctx));
    this._ultimo = [x, y];
  },
  aoSoltar(ctx) { ctx.ctl.finalizarTraco(); },
  aoCancelar(ctx) { ctx.ctl.cancelarTraco(); },
});

const lapis = pincelLivre('lapis', 'Lápis', 'p', 'lapis', (ctx) => ctx.indiceCor());
const borracha = pincelLivre('borracha', 'Borracha', 'e', 'borracha', () => 0);

/* ---------- balde ---------- */

const balde = {
  id: 'balde', nome: 'Balde', atalho: 'b', icone: 'balde', opcoes: ['global'],
  aoPressionar(ctx, x, y) {
    const { ctl, op } = ctx;
    ctl.iniciarTraco();
    A.balde(ctl.trabalho, ctl.largura, ctl.altura, x, y, ctx.indiceCor(), op.global);
    ctl.finalizarTraco();
  },
};

/* ---------- formas (linha, retângulo, elipse) ---------- */

const forma = (id, nome, atalho, icone, gerar, opcoes) => ({
  id, nome, atalho, icone, opcoes,
  _ini: null,
  _pontos(ctx, x, y) {
    const [x0, y0] = this._ini;
    return A.estampar(gerar(x0, y0, x, y, ctx.op.preencher), ctx.op.tamanho);
  },
  aoPressionar(ctx, x, y) {
    ctx.ctl.iniciarTraco();
    this._ini = [x, y];
    ctx.vista.previa = { pontos: this._pontos(ctx, x, y), indice: ctx.indiceCor() };
  },
  aoMover(ctx, x, y) {
    ctx.vista.previa = { pontos: this._pontos(ctx, x, y), indice: ctx.indiceCor() };
  },
  aoSoltar(ctx, x, y) {
    desenhar(ctx, this._pontos(ctx, x, y), ctx.indiceCor());
    ctx.vista.previa = null;
    ctx.ctl.finalizarTraco();
  },
  aoCancelar(ctx) {
    ctx.vista.previa = null;
    ctx.ctl.cancelarTraco();
  },
});

const linha = forma('linha', 'Linha', 'l', 'linha', (x0, y0, x1, y1) => A.linha(x0, y0, x1, y1), ['tamanho']);
const retangulo = forma('retangulo', 'Retângulo', 'r', 'retangulo', A.retangulo, ['tamanho', 'preencher']);
const elipse = forma('elipse', 'Círculo', 'c', 'elipse', A.elipse, ['tamanho', 'preencher']);

/* ---------- conta-gotas ---------- */

const contaGotas = {
  id: 'conta-gotas', nome: 'Conta-gotas', atalho: 'o', icone: 'conta-gotas', opcoes: [],
  _pegar(ctx, x, y) {
    const i = ctx.ctl.indiceNoPonto(x, y);
    if (i !== null) ctx.definirCor(i);
  },
  aoPressionar(ctx, x, y) { this._pegar(ctx, x, y); },
  aoMover(ctx, x, y) { this._pegar(ctx, x, y); },
};

/* ---------- mover tudo ---------- */

const moverTudo = {
  id: 'mover', nome: 'Mover', atalho: 'm', icone: 'mover', opcoes: [],
  _ini: null, _base: null,
  aoPressionar(ctx, x, y) {
    ctx.ctl.iniciarTraco();
    this._ini = [x, y];
    this._base = ctx.ctl.trabalho.slice();
  },
  aoMover(ctx, x, y) {
    const { ctl } = ctx;
    ctl.trabalho.set(A.mover(this._base, ctl.largura, ctl.altura, x - this._ini[0], y - this._ini[1]));
  },
  aoSoltar(ctx) { ctx.ctl.finalizarTraco(); },
  aoCancelar(ctx) { ctx.ctl.cancelarTraco(); },
};

/* ---------- seleção retangular (e mover o que está dentro) ---------- */

const dentroDe = (r, x, y) => r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

const selecionar = {
  id: 'selecao', nome: 'Selecionar', atalho: 'q', icone: 'selecao', opcoes: [],
  _modo: null, _ini: null, _flutuante: null, _base: null, _sel0: null,

  aoPressionar(ctx, x, y) {
    const { ctl, vista } = ctx;
    if (dentroDe(vista.selecao, x, y)) { // arrasta o conteúdo da seleção
      this._modo = 'mover';
      this._ini = [x, y];
      this._sel0 = { ...vista.selecao };
      ctl.iniciarTraco();
      this._flutuante = A.extrair(ctl.trabalho, ctl.largura, ctl.altura, this._sel0);
      A.limpar(ctl.trabalho, ctl.largura, ctl.altura, this._sel0);
      this._base = ctl.trabalho.slice();
      return;
    }
    this._modo = 'criar';
    this._ini = [x, y];
    vista.selecao = null;
  },

  aoMover(ctx, x, y) {
    const { ctl, vista } = ctx;
    if (this._modo === 'mover') {
      const dx = x - this._ini[0], dy = y - this._ini[1];
      ctl.trabalho.set(this._base);
      A.carimbar(ctl.trabalho, ctl.largura, ctl.altura, this._flutuante, this._sel0.x + dx, this._sel0.y + dy);
      vista.selecao = { ...this._sel0, x: this._sel0.x + dx, y: this._sel0.y + dy };
    } else if (this._modo === 'criar') {
      const [x0, y0] = this._ini;
      vista.selecao = A.recortarRetangulo({
        x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0) + 1, h: Math.abs(y - y0) + 1,
      }, ctl.largura, ctl.altura);
    }
  },

  aoSoltar(ctx, x, y) {
    const { ctl, vista } = ctx;
    if (this._modo === 'mover') {
      ctl.finalizarTraco();
    } else if (this._modo === 'criar') {
      // um toque simples (sem arrastar) desmarca
      if (x === this._ini[0] && y === this._ini[1]) vista.selecao = null;
    }
    this._modo = null;
  },

  aoCancelar(ctx) {
    if (this._modo === 'mover') {
      ctx.ctl.cancelarTraco();
      ctx.vista.selecao = this._sel0;
    }
    this._modo = null;
  },

  acoes(ctx) {
    const sel = ctx.vista.selecao;
    return [
      { rotulo: 'Apagar', desabilitado: !sel, ao: () => { ctx.ctl.limparRegiao(sel); } },
      { rotulo: 'Desmarcar', desabilitado: !sel, ao: () => { ctx.vista.selecao = null; ctx.vista.desenhar(); } },
    ];
  },
};

/* ---------- mão (arrastar a vista) ---------- */

const mao = { id: 'mao', nome: 'Mão', atalho: 'h', icone: 'mao', opcoes: [], mao: true };

export function criarFerramentas() {
  return [lapis, borracha, balde, linha, retangulo, elipse, contaGotas, selecionar, moverTudo, mao];
}

/** Maior pincel/borracha (Ctrl + e Ctrl − mudam o tamanho). */
export const TAMANHO_PINCEL_MAX = 16;

export const OPCOES_PADRAO = { tamanho: 1, simetria: 'nenhuma', preencher: false, global: false };
