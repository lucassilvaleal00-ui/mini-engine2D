/**
 * vista.js — O canvas principal: desenha o documento e cuida de zoom, arrastar e toques.
 *
 * - Zoom: roda do mouse, botões, ou pinça com dois dedos (que também arrasta).
 * - Um dedo/mouse aciona a ferramenta ativa; a ferramenta "Mão" (ou botão do meio,
 *   ou barra de espaço) arrasta a vista.
 * - As ferramentas recebem coordenadas JÁ em pixels do desenho (inteiros).
 */

import { desenharQuadro } from './render.js';

const ZOOM_MIN = 1;
const ZOOM_MAX = 80;
const MARGEM = 12;

export class Vista {
  /**
   * @param conteiner  elemento que contém o canvas (define o espaço disponível)
   * @param ctl        Controlador
   * @param ferramentas { atual(): ferramenta, contexto(): objeto passado às ferramentas }
   */
  constructor(conteiner, ctl, ferramentas) {
    this.conteiner = conteiner;
    this.ctl = ctl;
    this.ferramentas = ferramentas;

    this.zoom = 8;
    this.px = 0;
    this.py = 0;
    this.grade = true;
    this.cebola = false;
    this.selecao = null; // {x, y, w, h}
    this.previa = null;  // {pontos, indice} — forma em andamento (linha, retângulo…)
    this.hover = null;   // {x, y}
    this.espaco = false; // barra de espaço pressionada (pan temporário)
    this.aoPassar = null; // callback (x, y | null) quando o mouse passa sobre o desenho
    this.aoDesenhar = null; // callback depois de cada redesenho (a tela atualiza o status)
    this.aoFimDoToque = null; // callback quando uma ferramenta termina (a tela atualiza os botões)

    this._auto = true; // ajusta o zoom sozinho enquanto o usuário não mexer
    this._ponteiros = new Map();
    this._ativo = null;   // { ferramenta } enquanto um traço está em andamento
    this._pan = null;
    this._gesto = null;
    this._agendado = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vista-canvas';
    this.canvas.setAttribute('aria-label', 'Área de desenho');
    this.canvas.setAttribute('role', 'img');
    conteiner.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this._cvQuadro = document.createElement('canvas');
    this._cvCebola = document.createElement('canvas');
    this._xadrez = this._criarXadrez();

    this._ligarEventos();
    this._obs = new ResizeObserver(() => this._aoRedimensionar());
    this._obs.observe(conteiner);
    this._aoRedimensionar();
  }

  destruir() {
    this._obs.disconnect();
    cancelAnimationFrame(this._agendado);
    this.canvas.remove();
  }

  /* ---------- geometria ---------- */

  _aoRedimensionar() {
    const r = this.conteiner.getBoundingClientRect();
    this.cw = Math.max(1, Math.floor(r.width));
    this.ch = Math.max(1, Math.floor(r.height));
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.canvas.style.width = `${this.cw}px`;
    this.canvas.style.height = `${this.ch}px`;
    if (this._auto) this.ajustar(); else this.desenhar();
  }

  /** Encaixa o desenho na tela (zoom inteiro, para os pixels ficarem nítidos). */
  ajustar() {
    const { largura: w, altura: h } = this.ctl.e;
    const z = Math.floor(Math.min((this.cw - MARGEM * 2) / w, (this.ch - MARGEM * 2) / h));
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    this.px = Math.round((this.cw - w * this.zoom) / 2);
    this.py = Math.round((this.ch - h * this.zoom) / 2);
    this._auto = true;
    this.desenhar();
  }

  /** Muda o zoom mantendo fixo o ponto (cx, cy) da tela. */
  zoomPara(novo, cx = this.cw / 2, cy = this.ch / 2) {
    novo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, novo));
    const fx = (cx - this.px) / this.zoom;
    const fy = (cy - this.py) / this.zoom;
    this.zoom = novo;
    this.px = cx - fx * novo;
    this.py = cy - fy * novo;
    this._auto = false;
    this.desenhar();
  }

  zoomMais() { this.zoomPara(Math.min(ZOOM_MAX, Math.round(this.zoom) + Math.max(1, Math.round(this.zoom / 3)))); }
  zoomMenos() { this.zoomPara(Math.max(ZOOM_MIN, Math.round(this.zoom) - Math.max(1, Math.round(this.zoom / 4)))); }

  _ponto(ev) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor((ev.clientX - r.left - this.px) / this.zoom),
      y: Math.floor((ev.clientY - r.top - this.py) / this.zoom),
    };
  }

  /* ---------- desenho ---------- */

  desenhar() {
    if (this._agendado) return;
    this._agendado = requestAnimationFrame(() => {
      this._agendado = 0;
      this._desenhar();
    });
  }

  _criarXadrez() {
    const t = document.createElement('canvas');
    t.width = t.height = 16;
    const c = t.getContext('2d');
    c.fillStyle = '#2b2f4a';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#353a5c';
    c.fillRect(0, 0, 8, 8);
    c.fillRect(8, 8, 8, 8);
    return this.ctx.createPattern(t, 'repeat');
  }

  _desenhar() {
    const { ctx, zoom: z, px, py } = this;
    const e = this.ctl.e;
    const { largura: w, altura: h } = e;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    ctx.imageSmoothingEnabled = false;

    // fundo quadriculado (transparência)
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = this._xadrez;
    ctx.fillRect(0, 0, w * z, h * z);
    ctx.restore();

    // "cebola": o quadro anterior, bem fraquinho
    if (this.cebola && e.atual > 0) {
      desenharQuadro(e, e.quadros[e.atual - 1], this._cvCebola);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(this._cvCebola, px, py, w * z, h * z);
      ctx.globalAlpha = 1;
    }

    // quadro atual (com o traço em andamento, se houver)
    const sub = this.ctl.trabalho ? { camada: e.camadaAtiva, buf: this.ctl.trabalho } : null;
    desenharQuadro(e, e.quadros[e.atual], this._cvQuadro, sub);
    ctx.drawImage(this._cvQuadro, px, py, w * z, h * z);

    // prévia de linha/retângulo/elipse
    if (this.previa) {
      const cor = this.previa.indice === 0 ? 'rgba(255,255,255,.35)' : e.paleta[this.previa.indice];
      ctx.fillStyle = cor;
      for (const [x, y] of this.previa.pontos) {
        if (x >= 0 && y >= 0 && x < w && y < h) ctx.fillRect(px + x * z, py + y * z, z, z);
      }
    }

    // grade
    if (this.grade && z >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < w; x++) { ctx.moveTo(px + x * z + 0.5, py); ctx.lineTo(px + x * z + 0.5, py + h * z); }
      for (let y = 1; y < h; y++) { ctx.moveTo(px, py + y * z + 0.5); ctx.lineTo(px + w * z, py + y * z + 0.5); }
      ctx.stroke();
    }

    // moldura
    ctx.strokeStyle = '#6b7199';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 0.5, py - 0.5, w * z + 1, h * z + 1);

    // seleção (tracejado preto e branco, para aparecer sobre qualquer cor)
    if (this.selecao) {
      const s = this.selecao;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(px + s.x * z + 0.5, py + s.y * z + 0.5, s.w * z - 1, s.h * z - 1);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(px + s.x * z + 0.5, py + s.y * z + 0.5, s.w * z - 1, s.h * z - 1);
      ctx.setLineDash([]);
    }

    // pixel sob o mouse
    if (this.hover && !this._pan && !this._gesto) {
      const { x, y } = this.hover;
      if (x >= 0 && y >= 0 && x < w && y < h) {
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.strokeRect(px + x * z + 0.5, py + y * z + 0.5, z - 1, z - 1);
      }
    }
    this.aoDesenhar?.();
  }

  /* ---------- entrada (mouse, toque, caneta) ---------- */

  _ligarEventos() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
    cv.addEventListener('pointerdown', (ev) => this._aoPressionar(ev));
    cv.addEventListener('pointermove', (ev) => this._aoMover(ev));
    cv.addEventListener('pointerup', (ev) => this._aoSoltar(ev));
    cv.addEventListener('pointercancel', (ev) => this._aoSoltar(ev, true));
    cv.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType === 'mouse') { this.hover = null; this.aoPassar?.(null); this.desenhar(); }
    });
    cv.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const r = cv.getBoundingClientRect();
      const fator = Math.pow(1.0018, -ev.deltaY);
      this.zoomPara(this.zoom * fator, ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });
  }

  _ferramenta() { return this.ferramentas.atual(); }

  _aoPressionar(ev) {
    this.canvas.setPointerCapture?.(ev.pointerId);
    this._ponteiros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (this._ponteiros.size === 2) { // pinça: cancela qualquer traço e começa o gesto
      this._cancelarTraco();
      this._pan = null;
      this._iniciarGesto();
      return;
    }
    if (this._ponteiros.size > 2) return;

    const ferr = this._ferramenta();
    const botaoMeio = ev.pointerType === 'mouse' && ev.button === 1;
    if (ev.pointerType === 'mouse' && ev.button !== 0 && !botaoMeio) return;

    if (botaoMeio || this.espaco || ferr.mao) {
      ev.preventDefault();
      this._pan = { x: ev.clientX, y: ev.clientY, px: this.px, py: this.py };
      this.canvas.classList.add('arrastando');
      return;
    }
    const { x, y } = this._ponto(ev);
    this._ativo = { ferramenta: ferr, id: ev.pointerId };
    ferr.aoPressionar?.(this.ferramentas.contexto(), x, y, ev);
    this.desenhar();
  }

  _aoMover(ev) {
    const p = this._ponteiros.get(ev.pointerId);
    if (p) { p.x = ev.clientX; p.y = ev.clientY; }

    if (this._gesto) { this._moverGesto(); return; }
    if (this._pan) {
      this.px = this._pan.px + (ev.clientX - this._pan.x);
      this.py = this._pan.py + (ev.clientY - this._pan.y);
      this._auto = false;
      this.desenhar();
      return;
    }
    const pt = this._ponto(ev);
    if (ev.pointerType === 'mouse') {
      if (!this.hover || this.hover.x !== pt.x || this.hover.y !== pt.y) {
        this.hover = pt;
        this.aoPassar?.(pt.x, pt.y);
        this.desenhar();
      }
    }
    if (this._ativo && this._ativo.id === ev.pointerId) {
      // eventos "juntados" de caneta/toque rápido: processa todos os intermediários
      const eventos = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      for (const sub of eventos.length ? eventos : [ev]) {
        const q = this._ponto(sub);
        this._ativo.ferramenta.aoMover?.(this.ferramentas.contexto(), q.x, q.y, sub);
      }
      this.desenhar();
    }
  }

  _aoSoltar(ev, cancelado = false) {
    this._ponteiros.delete(ev.pointerId);
    try { this.canvas.releasePointerCapture?.(ev.pointerId); } catch { /* já solto */ }

    if (this._gesto) {
      if (this._ponteiros.size < 2) this._gesto = null;
      return;
    }
    if (this._pan) {
      this._pan = null;
      this.canvas.classList.remove('arrastando');
      return;
    }
    if (this._ativo && this._ativo.id === ev.pointerId) {
      const { ferramenta } = this._ativo;
      this._ativo = null;
      if (cancelado) ferramenta.aoCancelar?.(this.ferramentas.contexto());
      else {
        const { x, y } = this._ponto(ev);
        ferramenta.aoSoltar?.(this.ferramentas.contexto(), x, y, ev);
      }
      this.desenhar();
      this.aoFimDoToque?.();
    }
  }

  _cancelarTraco() {
    if (!this._ativo) return;
    const { ferramenta } = this._ativo;
    this._ativo = null;
    ferramenta.aoCancelar?.(this.ferramentas.contexto());
    this.desenhar();
  }

  /** Interrompe o que estiver em andamento (ex.: o usuário trocou de ferramenta). */
  cancelarTudo() {
    this._cancelarTraco();
    this.previa = null;
  }

  /* ---------- pinça com dois dedos ---------- */

  _iniciarGesto() {
    const [a, b] = [...this._ponteiros.values()];
    const r = this.canvas.getBoundingClientRect();
    const cx = (a.x + b.x) / 2 - r.left;
    const cy = (a.y + b.y) / 2 - r.top;
    this._gesto = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      zoom: this.zoom,
      fx: (cx - this.px) / this.zoom, // ponto do desenho sob o centro dos dedos
      fy: (cy - this.py) / this.zoom,
    };
  }

  _moverGesto() {
    if (this._ponteiros.size < 2 || !this._gesto) return;
    const [a, b] = [...this._ponteiros.values()];
    const r = this.canvas.getBoundingClientRect();
    const cx = (a.x + b.x) / 2 - r.left;
    const cy = (a.y + b.y) / 2 - r.top;
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const g = this._gesto;
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, g.zoom * (dist / g.dist)));
    this.px = cx - g.fx * this.zoom;
    this.py = cy - g.fy * this.zoom;
    this._auto = false;
    this.desenhar();
  }
}
